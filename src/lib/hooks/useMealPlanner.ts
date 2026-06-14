'use client';

import { useState, useCallback } from 'react';
import { MealPlan, MealPlanSetupConfig, MealSlot, MealType, Season, Recipe } from '@/types';
import {
  createMealPlan,
  updateMealPlanSlots,
  getMealPlanByWeek,
  updateMealPlan,
} from '@/lib/firebase/meal-plans';
import { createRecipe } from '@/lib/firebase/firestore';
import { createCategoryIfNotExists } from '@/lib/firebase/categories';
import { buildShuffledSlots, pickReshuffledRecipe } from '@/lib/utils/meal-plan-shuffle';
import { useAuth } from '@/lib/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { recipesQueryKey } from '@/lib/hooks/useRecipes';

/**
 * Meal planner state management hook.
 *
 * RESPONSIBILITIES:
 * - Drives the 3-step page flow (setup → generating → calendar)
 * - Builds a plan locally by shuffling the user's own recipes (no AI)
 * - Persists every slot change to Firestore immediately
 * - Copies a plan to another week
 *
 * SLOT PERSISTENCE STRATEGY:
 * Every slot update (shuffle, manual pick, clear, re-roll) triggers a full
 * `updateMealPlanSlots()` write. This keeps the client and Firebase in sync
 * without real-time listeners (no extra read costs).
 *
 * OPTIMISTIC UI:
 * The local state is updated immediately before the Firestore write.
 * If the write fails, the error is surfaced and the user can retry.
 */

export type PlannerStep = 'setup' | 'generating' | 'calendar';

interface UseMealPlannerReturn {
  step: PlannerStep;
  currentPlan: MealPlan | null;
  isGenerating: boolean;
  error: string | null;
  /** Builds a plan locally from the user's recipes. Returns the meal types that
   *  could not be filled (no matching recipe) so the caller can warn the user. */
  generateShuffledPlan: (config: MealPlanSetupConfig, recipes: Recipe[]) => Promise<MealType[]>;
  createManualPlan: (config: MealPlanSetupConfig) => Promise<void>;
  copyPlanToWeek: (targetWeekStartDate: string) => Promise<string>;
  updateSlot: (dayIndex: number, mealType: MealType, recipeId: string, title: string) => Promise<void>;
  clearSlot: (dayIndex: number, mealType: MealType) => Promise<void>;
  saveNewRecipeToCookbook: (slot: MealSlot, categoryName: string, seasons: Season[]) => Promise<string>;
  reshuffleSlot: (dayIndex: number, mealType: MealType, recipes: Recipe[]) => Promise<void>;
  removeDay: (dayIndex: number) => Promise<void>;
  regeneratingSlots: Set<string>;
  resetToSetup: () => void;
  loadPlan: (plan: MealPlan) => void;
  loadPlanForWeek: (weekStartDate: string) => Promise<void>;
}

export function useMealPlanner(): UseMealPlannerReturn {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<PlannerStep>('setup');
  const [currentPlan, setCurrentPlan] = useState<MealPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regeneratingSlots, setRegeneratingSlots] = useState<Set<string>>(new Set());

  /**
   * Load an existing plan (e.g., restored from Firebase on page mount).
   * Transitions directly to the calendar step.
   */
  const loadPlan = useCallback((plan: MealPlan) => {
    setCurrentPlan(plan);
    setStep('calendar');
    setError(null);
  }, []);

  /**
   * Load the plan for a specific week.
   *
   * WHY THIS PATH:
   * Week navigation must not create or delete data implicitly. If the target
   * week has no saved plan yet, the UI falls back to setup prefilled for that week.
   */
  const loadPlanForWeek = useCallback(async (weekStartDate: string) => {
    if (!user) return;

    const plan = await getMealPlanByWeek(user.uid, weekStartDate);
    if (plan) {
      loadPlan(plan);
      return;
    }

    setCurrentPlan(null);
    setStep('setup');
    setError(null);
  }, [user, loadPlan]);

  /**
   * Build a plan locally by shuffling the user's own recipes, then save it.
   *
   * No network/AI call: buildShuffledSlots assigns existing recipes honouring
   * season and per-meal category preferences. Returns the meal types that could
   * not be filled (empty candidate pool) so the page can warn the user; their
   * slots are simply left blank for manual filling.
   */
  const generateShuffledPlan = useCallback(async (
    config: MealPlanSetupConfig,
    recipes: Recipe[]
  ): Promise<MealType[]> => {
    if (!user) return [];

    setError(null);
    setIsGenerating(true);

    try {
      const { slots, unfilledMealTypes } = buildShuffledSlots(recipes, {
        season: config.season,
        activeMealTypes: config.activeMealTypes,
        activeDays: config.activeDays ?? null,
        mealTypeConfigs: config.mealTypeConfigs ?? null,
      });

      const planId = await createMealPlan(user.uid, {
        weekStartDate: config.weekStartDate,
        slots,
        activeMealTypes: config.activeMealTypes,
        season: config.season,
        generatedByAI: false,
        activeDays: config.activeDays ?? null,
      });

      setCurrentPlan({
        id: planId,
        userId: user.uid,
        weekStartDate: config.weekStartDate,
        slots,
        activeMealTypes: config.activeMealTypes,
        season: config.season,
        generatedByAI: false,
        activeDays: config.activeDays ?? null,
        createdAt: null as unknown as import('firebase/firestore').Timestamp,
        updatedAt: null as unknown as import('firebase/firestore').Timestamp,
      });
      setStep('calendar');
      return unfilledMealTypes;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
      setError(msg);
      return [];
    } finally {
      setIsGenerating(false);
    }
  }, [user]);

  /**
   * Duplicate the current plan onto another week.
   *
   * Blocks (throws) when the target week already has a plan — a week holds at
   * most one plan, and silently overwriting would destroy existing data. Only
   * the structure is copied; shopping-list state stays with the source week.
   *
   * @returns The new plan's Firestore ID.
   */
  const copyPlanToWeek = useCallback(async (targetWeekStartDate: string): Promise<string> => {
    if (!user || !currentPlan) {
      throw new Error('Nessun piano da copiare');
    }

    const existing = await getMealPlanByWeek(user.uid, targetWeekStartDate);
    if (existing) {
      throw new Error('Esiste già un piano per quella settimana');
    }

    return createMealPlan(user.uid, {
      weekStartDate: targetWeekStartDate,
      slots: currentPlan.slots,
      activeMealTypes: currentPlan.activeMealTypes,
      season: currentPlan.season,
      generatedByAI: false,
      activeDays: currentPlan.activeDays ?? null,
    });
  }, [user, currentPlan]);

  /**
   * Create an empty plan (manual mode) and go directly to the calendar.
   * The calendar starts with all slots empty; user fills them via RecipePickerSheet.
   */
  const createManualPlan = useCallback(async (config: MealPlanSetupConfig) => {
    if (!user) return;

    setError(null);

    try {
      const planId = await createMealPlan(user.uid, {
        weekStartDate: config.weekStartDate,
        slots: [],
        activeMealTypes: config.activeMealTypes,
        season: config.season,
        generatedByAI: false,
        activeDays: config.activeDays ?? null,
      });

      const plan: MealPlan = {
        id: planId,
        userId: user.uid,
        weekStartDate: config.weekStartDate,
        slots: [],
        activeMealTypes: config.activeMealTypes,
        season: config.season,
        generatedByAI: false,
        activeDays: config.activeDays ?? null,
        createdAt: null as unknown as import('firebase/firestore').Timestamp,
        updatedAt: null as unknown as import('firebase/firestore').Timestamp,
      };

      setCurrentPlan(plan);
      setStep('calendar');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
      setError(msg);
    }
  }, [user]);

  /**
   * Assign an existing cookbook recipe to a slot.
   *
   * Replaces any existing assignment (existing or AI-generated) for that slot.
   * Persists to Firestore immediately.
   */
  const updateSlot = useCallback(async (
    dayIndex: number,
    mealType: MealType,
    recipeId: string,
    title: string
  ) => {
    if (!currentPlan) return;

    const updatedSlots = currentPlan.slots.filter(
      s => !(s.dayIndex === dayIndex && s.mealType === mealType)
    );

    updatedSlots.push({
      dayIndex,
      mealType,
      existingRecipeId: recipeId,
      newRecipe: null,
      recipeTitle: title,
    });

    const updatedPlan = { ...currentPlan, slots: updatedSlots };
    setCurrentPlan(updatedPlan);
    await updateMealPlanSlots(currentPlan.id, updatedSlots);
  }, [currentPlan]);

  /**
   * Remove the recipe assignment from a slot (leave it empty).
   */
  const clearSlot = useCallback(async (dayIndex: number, mealType: MealType) => {
    if (!currentPlan) return;

    const updatedSlots = currentPlan.slots.filter(
      s => !(s.dayIndex === dayIndex && s.mealType === mealType)
    );

    const updatedPlan = { ...currentPlan, slots: updatedSlots };
    setCurrentPlan(updatedPlan);
    await updateMealPlanSlots(currentPlan.id, updatedSlots);
  }, [currentPlan]);

  /**
   * Re-roll a single slot locally: pick a different recipe of the same category
   * that fits the season and is not already used elsewhere in the week.
   *
   * Throws when no alternative recipe exists so the caller can inform the user.
   */
  const reshuffleSlot = useCallback(async (
    dayIndex: number,
    mealType: MealType,
    recipes: Recipe[]
  ) => {
    if (!currentPlan) return;

    const slotKey = `${dayIndex}-${mealType}`;
    setRegeneratingSlots(prev => new Set(prev).add(slotKey));

    try {
      const currentSlot = currentPlan.slots.find(
        slot => slot.dayIndex === dayIndex && slot.mealType === mealType
      );
      const currentRecipeId = currentSlot?.existingRecipeId ?? null;
      const currentRecipe = currentRecipeId
        ? recipes.find(recipe => recipe.id === currentRecipeId) ?? null
        : null;

      // Recipes already placed this week, so a re-roll does not duplicate them.
      const usedRecipeIds = new Set(
        currentPlan.slots
          .map(slot => slot.existingRecipeId)
          .filter((id): id is string => !!id)
      );

      const replacement = pickReshuffledRecipe(recipes, {
        season: currentPlan.season,
        categoryId: currentRecipe?.categoryId ?? null,
        currentRecipeId,
        usedRecipeIds,
      });

      if (!replacement) {
        throw new Error('Non ho altre ricette adatte per rimescolare questo slot');
      }

      const updatedSlots: MealSlot[] = [
        ...currentPlan.slots.filter(s => !(s.dayIndex === dayIndex && s.mealType === mealType)),
        {
          dayIndex,
          mealType,
          existingRecipeId: replacement.id,
          newRecipe: null,
          recipeTitle: replacement.title,
        },
      ];

      setCurrentPlan({ ...currentPlan, slots: updatedSlots });
      await updateMealPlanSlots(currentPlan.id, updatedSlots);
    } finally {
      setRegeneratingSlots(prev => {
        const next = new Set(prev);
        next.delete(slotKey);
        return next;
      });
    }
  }, [currentPlan]);

  /**
   * Remove one active day from an already-created plan.
   *
   * We persist both activeDays and slots together so the calendar shape
   * always matches the stored slot payload.
   */
  const removeDay = useCallback(async (dayIndex: number) => {
    if (!currentPlan) return;

    const currentActiveDays = currentPlan.activeDays ?? [0, 1, 2, 3, 4, 5, 6];
    const nextActiveDays = currentActiveDays.filter((day) => day !== dayIndex);

    if (nextActiveDays.length === 0) {
      throw new Error('Il piano deve mantenere almeno un giorno attivo');
    }

    const nextSlots = currentPlan.slots.filter((slot) => slot.dayIndex !== dayIndex);
    setCurrentPlan({
      ...currentPlan,
      activeDays: nextActiveDays,
      slots: nextSlots,
    });

    await updateMealPlan(currentPlan.id, {
      activeDays: nextActiveDays,
      slots: nextSlots,
    });
  }, [currentPlan]);

  /**
   * Save an AI-generated new recipe to the cookbook, then convert the slot
   * to use the saved recipe ID instead of the inline ParsedRecipe.
   *
   * FLOW:
   * 1. Resolve/create category in Firebase
   * 2. Call createRecipe() with the ParsedRecipe data
   * 3. Update the slot: existingRecipeId = new ID, newRecipe = null
   * 4. Persist updated slots to Firestore
   *
   * @returns The new recipe's Firestore ID
   */
  const saveNewRecipeToCookbook = useCallback(async (
    slot: MealSlot,
    categoryName: string,
    seasons: Season[]
  ): Promise<string> => {
    if (!user || !currentPlan || !slot.newRecipe) {
      throw new Error('Dati mancanti per il salvataggio');
    }

    // Resolve or create the category
    let categoryId: string | null = null;
    if (categoryName) {
      categoryId = await createCategoryIfNotExists(user.uid, categoryName);
    }

    const recipe = slot.newRecipe;
    const newRecipeData: Omit<Recipe, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
      title: recipe.title,
      description: '',
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      servings: recipe.servings ?? 0,
      prepTime: recipe.prepTime ?? 0,
      cookTime: recipe.cookTime ?? 0,
      totalTime: (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0),
      notes: recipe.notes ?? '',
      tags: [],
      techniqueIds: [],
      images: [],
      source: {
        type: 'manual',
        name: 'Generata con Pianificatore AI',
      },
      aiSuggested: true,
      ...(categoryId ? { categoryId } : {}),
      ...(seasons.length > 0 ? { seasons } : {}),
    };

    const newRecipeId = await createRecipe(user.uid, newRecipeData);

    // Invalidate the recipes list so /ricette reflects the new recipe without a manual refresh.
    queryClient.invalidateQueries({ queryKey: recipesQueryKey(user.uid) });

    // Update the slot to reference the saved recipe
    const updatedSlots = currentPlan.slots.map(s => {
      if (s.dayIndex === slot.dayIndex && s.mealType === slot.mealType) {
        return {
          ...s,
          existingRecipeId: newRecipeId,
          newRecipe: null,
        };
      }
      return s;
    });

    const updatedPlan = { ...currentPlan, slots: updatedSlots };
    setCurrentPlan(updatedPlan);
    await updateMealPlanSlots(currentPlan.id, updatedSlots);

    return newRecipeId;
  }, [user, currentPlan]);

  /** Return to setup without deleting the current plan from Firebase. */
  const resetToSetup = useCallback(() => {
    setCurrentPlan(null);
    setStep('setup');
    setError(null);
  }, []);

  return {
    step,
    currentPlan,
    isGenerating,
    error,
    generateShuffledPlan,
    createManualPlan,
    copyPlanToWeek,
    updateSlot,
    clearSlot,
    saveNewRecipeToCookbook,
    reshuffleSlot,
    removeDay,
    regeneratingSlots,
    resetToSetup,
    loadPlan,
    loadPlanForWeek,
  };
}
