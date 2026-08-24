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
import { getRecipeCategoryIds } from '@/lib/utils/recipe-categories';
import { sortMealTypes } from '@/lib/constants/meal-types';
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
  saveNewRecipeToCookbook: (slot: MealSlot, categoryNames: string[], seasons: Season[]) => Promise<string>;
  reshuffleSlot: (dayIndex: number, mealType: MealType, recipes: Recipe[]) => Promise<void>;
  removeDay: (dayIndex: number) => Promise<void>;
  addDay: (dayIndex: number) => Promise<void>;
  /** Adds a meal type to the current plan, optionally filling it with a local shuffle. */
  addMealType: (mealType: MealType, recipes: Recipe[], options?: { autofill?: boolean }) => Promise<void>;
  /** Removes a meal type AND its slots. The plan must keep at least one meal type. */
  removeMealType: (mealType: MealType) => Promise<void>;
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
   * Drops the cached shopping list after any write that changes the plan's slots.
   *
   * WHY EVERY SLOT WRITE NEEDS THIS:
   * The shopping list is a derived view — useShoppingList recomputes it from the plan and
   * its recipes, and caches the result under ['shoppingList', uid, weekStartDate]. Writing
   * to Firestore does not touch that cache, so without an explicit invalidation the list
   * keeps serving pre-write data until staleTime (2 min) expires. The symptom is a list
   * that still bills you for a meal you removed, and looks correct until a hard refresh.
   *
   * Deliberately a partial key match (no weekStartDate): copyPlanToWeek writes to a week
   * other than the one on screen, and invalidating a few extra weeks is free next to the
   * cost of missing the one that mattered.
   */
  const invalidateShoppingList = useCallback(() => {
    if (!user) return;
    queryClient.invalidateQueries({ queryKey: ['shoppingList', user.uid] });
  }, [user, queryClient]);

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
      invalidateShoppingList();
      return unfilledMealTypes;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
      setError(msg);
      return [];
    } finally {
      setIsGenerating(false);
    }
  }, [user, invalidateShoppingList]);

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

    const newPlanId = await createMealPlan(user.uid, {
      weekStartDate: targetWeekStartDate,
      slots: currentPlan.slots,
      activeMealTypes: sortMealTypes(currentPlan.activeMealTypes),
      season: currentPlan.season,
      generatedByAI: false,
      activeDays: currentPlan.activeDays ?? null,
    });

    invalidateShoppingList();
    return newPlanId;
  }, [user, currentPlan, invalidateShoppingList]);

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
      invalidateShoppingList();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
      setError(msg);
    }
  }, [user, invalidateShoppingList]);

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
    invalidateShoppingList();
  }, [currentPlan, invalidateShoppingList]);

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
    invalidateShoppingList();
  }, [currentPlan, invalidateShoppingList]);

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
        categoryIds: currentRecipe ? getRecipeCategoryIds(currentRecipe) : [],
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
      invalidateShoppingList();
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
    invalidateShoppingList();
  }, [currentPlan, invalidateShoppingList]);

  /**
   * Re-add a day to an already-created plan.
   *
   * The day comes back empty: slots removed by removeDay are gone for good, and
   * silently re-inventing them would be worse than an empty column the user fills
   * from the picker. Days stay in calendar order so the grid never renders shuffled.
   */
  const addDay = useCallback(async (dayIndex: number) => {
    if (!currentPlan) return;

    const currentActiveDays = currentPlan.activeDays ?? [0, 1, 2, 3, 4, 5, 6];
    if (currentActiveDays.includes(dayIndex)) return;

    const nextActiveDays = [...currentActiveDays, dayIndex].sort((a, b) => a - b);
    setCurrentPlan({ ...currentPlan, activeDays: nextActiveDays });

    await updateMealPlan(currentPlan.id, { activeDays: nextActiveDays });
  }, [currentPlan]);

  /**
   * Add a meal type (e.g. "colazione") to a plan that is already running.
   *
   * WHY THIS EXISTS:
   * activeMealTypes used to be written only at creation time, so adding a meal to
   * a started week meant deleting the plan and rebuilding it, losing every slot.
   *
   * With `autofill` the new row is populated by the same local shuffle used at
   * setup, restricted to this meal type so existing slots are never touched.
   * Without it the row appears empty and is filled from the RecipePickerSheet.
   *
   * The result is passed through sortMealTypes so the array stays in canonical
   * day order, same as addDay does for activeDays.
   */
  const addMealType = useCallback(async (
    mealType: MealType,
    recipes: Recipe[],
    options?: { autofill?: boolean }
  ) => {
    if (!currentPlan) return;
    if (currentPlan.activeMealTypes.includes(mealType)) return;

    const nextActiveMealTypes = sortMealTypes([...currentPlan.activeMealTypes, mealType]);

    let nextSlots = currentPlan.slots;
    if (options?.autofill) {
      const { slots: shuffledSlots } = buildShuffledSlots(recipes, {
        season: currentPlan.season,
        activeMealTypes: [mealType],
        activeDays: currentPlan.activeDays ?? null,
        mealTypeConfigs: null,
      });
      nextSlots = [...currentPlan.slots, ...shuffledSlots];
    }

    setCurrentPlan({
      ...currentPlan,
      activeMealTypes: nextActiveMealTypes,
      slots: nextSlots,
    });

    await updateMealPlan(currentPlan.id, {
      activeMealTypes: nextActiveMealTypes,
      slots: nextSlots,
    });
    invalidateShoppingList();
  }, [currentPlan, invalidateShoppingList]);

  /**
   * Remove a meal type from the current plan, together with its slots.
   *
   * WHY THE SLOTS MUST GO TOO:
   * buildContributions() in ingredient-aggregator.ts walks every slot without
   * filtering on activeMealTypes. Dropping the meal type alone would leave orphan
   * slots that keep feeding ingredients into the shopping list for a meal the
   * calendar no longer shows — invisible and very hard to trace back.
   */
  const removeMealType = useCallback(async (mealType: MealType) => {
    if (!currentPlan) return;

    const nextActiveMealTypes = currentPlan.activeMealTypes.filter(type => type !== mealType);

    if (nextActiveMealTypes.length === 0) {
      throw new Error('Il piano deve mantenere almeno una portata');
    }

    const nextSlots = currentPlan.slots.filter(slot => slot.mealType !== mealType);

    setCurrentPlan({
      ...currentPlan,
      activeMealTypes: nextActiveMealTypes,
      slots: nextSlots,
    });

    await updateMealPlan(currentPlan.id, {
      activeMealTypes: nextActiveMealTypes,
      slots: nextSlots,
    });
    invalidateShoppingList();
  }, [currentPlan, invalidateShoppingList]);

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
    categoryNames: string[],
    seasons: Season[]
  ): Promise<string> => {
    if (!user || !currentPlan || !slot.newRecipe) {
      throw new Error('Dati mancanti per il salvataggio');
    }

    // Resolve or create each category
    const categoryIds = (
      await Promise.all(categoryNames.map(name => createCategoryIfNotExists(user.uid, name)))
    ).filter(Boolean);

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
      ...(categoryIds.length ? { categoryIds } : {}),
      ...(seasons.length > 0 ? { seasons } : {}),
      // Omit the key entirely when the estimate is missing — Firestore rejects undefined.
      ...(recipe.caloriesPerServing ? { caloriesPerServing: recipe.caloriesPerServing } : {}),
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
    invalidateShoppingList();

    return newRecipeId;
  }, [user, currentPlan, invalidateShoppingList]);

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
    addDay,
    addMealType,
    removeMealType,
    regeneratingSlots,
    resetToSetup,
    loadPlan,
    loadPlanForWeek,
  };
}
