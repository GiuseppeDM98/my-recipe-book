'use client';

import { useState, useCallback } from 'react';
import { FamilyProfile, MealPlan, MealPlanSetupConfig, MealSlot, MealType, Season, Recipe } from '@/types';
import {
  createMealPlan,
  updateMealPlanSlots,
  getMealPlanByWeek,
} from '@/lib/firebase/meal-plans';
import { getFirebaseAuthHeader } from '@/lib/firebase/client-auth';
import { createRecipe } from '@/lib/firebase/firestore';
import { createCategoryIfNotExists } from '@/lib/firebase/categories';
import { useAuth } from '@/lib/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { recipesQueryKey } from '@/lib/hooks/useRecipes';

/**
 * Meal planner state management hook.
 *
 * RESPONSIBILITIES:
 * - Drives the 3-step page flow (setup → generating → calendar)
 * - Calls /api/plan-meals and materializes the response into a MealPlan
 * - Persists every slot change to Firestore immediately
 * - Handles saving AI-generated recipes to the cookbook
 *
 * SLOT PERSISTENCE STRATEGY:
 * Every slot update (AI generation, manual pick, clear) triggers a full
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
  generatePlan: (
    config: MealPlanSetupConfig,
    existingRecipes: Recipe[],
    categories: { id: string; name: string }[],
    options?: { useFamilyContext?: boolean; familyProfile?: FamilyProfile | null }
  ) => Promise<void>;
  createManualPlan: (config: MealPlanSetupConfig) => Promise<void>;
  updateSlot: (dayIndex: number, mealType: MealType, recipeId: string, title: string) => Promise<void>;
  clearSlot: (dayIndex: number, mealType: MealType) => Promise<void>;
  saveNewRecipeToCookbook: (slot: MealSlot, categoryName: string, seasons: Season[]) => Promise<string>;
  regenerateSlot: (
    dayIndex: number,
    mealType: MealType,
    existingRecipes: Recipe[],
    categories: { id: string; name: string }[]
  ) => Promise<void>;
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
   * Call /api/plan-meals, create MealPlan from response, save to Firebase.
   *
   * The API returns slot assignments with existingRecipeId or newRecipeMarkdown.
   * We parse the markdown into ParsedRecipe objects here so that the UI
   * can display them as NewRecipeReviewCards.
   */
  const generatePlan = useCallback(async (
    config: MealPlanSetupConfig,
    existingRecipes: Recipe[],
    categories: { id: string; name: string }[],
    options?: { useFamilyContext?: boolean; familyProfile?: FamilyProfile | null }
  ) => {
    if (!user) return;

    setIsGenerating(true);
    setStep('generating');
    setError(null);

    try {
      // Compact recipe summaries — ingredient names included so Claude can apply dietary filters
      const recipeSummaries = existingRecipes.map(r => ({
        id: r.id,
        title: r.title,
        categoryId: r.categoryId,
        seasons: r.seasons ?? (r.season ? [r.season] : []),
        ingredientCount: r.ingredients.length,
        ingredientNames: r.ingredients.map(i => i.name),
      }));

      const response = await fetch('/api/plan-meals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getFirebaseAuthHeader({ forceRefresh: true })),
        },
        body: JSON.stringify({
          config,
          existingRecipes: recipeSummaries,
          categories,
          useFamilyContext: options?.useFamilyContext ?? false,
          familyProfile: options?.familyProfile ?? null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? 'Errore nella generazione del piano');
      }

      // Slots are already fully parsed server-side — use directly as MealSlot[]
      // newRecipe is a plain JSON object (ParsedRecipe) when present, null otherwise
      const slots: MealSlot[] = data.slots as MealSlot[];

      // Persist plan to Firebase
      const planId = await createMealPlan(user.uid, {
        weekStartDate: config.weekStartDate,
        slots,
        activeMealTypes: config.activeMealTypes,
        season: config.season,
        generatedByAI: true,
        activeDays: config.activeDays ?? null,
      });

      const plan: MealPlan = {
        id: planId,
        userId: user.uid,
        weekStartDate: config.weekStartDate,
        slots,
        activeMealTypes: config.activeMealTypes,
        season: config.season,
        generatedByAI: true,
        activeDays: config.activeDays ?? null,
        createdAt: null as unknown as import('firebase/firestore').Timestamp,
        updatedAt: null as unknown as import('firebase/firestore').Timestamp,
      };

      setCurrentPlan(plan);
      setStep('calendar');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
      setError(msg);
      setStep('setup');
    } finally {
      setIsGenerating(false);
    }
  }, [user]);

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
   * Regenerate a single meal slot using AI without rebuilding the full plan.
   *
   * Reuses the /api/plan-meals pipeline with a single-day, single-meal config
   * so the prompt logic, parsing, and family context stay consistent.
   */
  const regenerateSlot = useCallback(async (
    dayIndex: number,
    mealType: MealType,
    existingRecipes: Recipe[],
    categories: { id: string; name: string }[]
  ) => {
    if (!user || !currentPlan) return;

    const slotKey = `${dayIndex}-${mealType}`;
    setRegeneratingSlots(prev => new Set(prev).add(slotKey));

    try {
      const recipeSummaries = existingRecipes.map(r => ({
        id: r.id,
        title: r.title,
        categoryId: r.categoryId,
        seasons: r.seasons ?? (r.season ? [r.season] : []),
        ingredientCount: r.ingredients.length,
        ingredientNames: r.ingredients.map(i => i.name),
      }));

      const slotConfig: MealPlanSetupConfig = {
        season: currentPlan.season,
        activeMealTypes: [mealType],
        activeDays: [dayIndex],
        excludedCategoryIds: [],
        newRecipeCount: 1,
        newRecipePerMeal: { [mealType]: 1 },
        weekStartDate: currentPlan.weekStartDate,
      };

      const response = await fetch('/api/plan-meals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getFirebaseAuthHeader({ forceRefresh: true })),
        },
        body: JSON.stringify({ config: slotConfig, existingRecipes: recipeSummaries, categories }),
      });

      const data = await response.json();
      if (!response.ok || !data.success || !data.slots?.length) {
        throw new Error(data.error ?? 'Nessun risultato dalla rigenerazione');
      }

      const newSlotData = data.slots[0] as MealSlot;
      const updatedSlots = [
        ...currentPlan.slots.filter(s => !(s.dayIndex === dayIndex && s.mealType === mealType)),
        newSlotData,
      ];

      const updatedPlan = { ...currentPlan, slots: updatedSlots };
      setCurrentPlan(updatedPlan);
      await updateMealPlanSlots(currentPlan.id, updatedSlots);
    } finally {
      setRegeneratingSlots(prev => {
        const next = new Set(prev);
        next.delete(slotKey);
        return next;
      });
    }
  }, [user, currentPlan]);

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
    let categoryId: string | undefined;
    if (categoryName) {
      categoryId = await createCategoryIfNotExists(user.uid, categoryName);
    }

    const recipe = slot.newRecipe;
    const newRecipeData: Omit<Recipe, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
      title: recipe.title,
      description: recipe.description,
      categoryId: categoryId ?? undefined,
      seasons: seasons.length > 0 ? seasons : undefined,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      servings: recipe.servings,
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      notes: recipe.notes,
      tags: [],
      techniqueIds: [],
      images: [],
      source: {
        type: 'manual',
        name: 'Generata con Pianificatore AI',
      },
      aiSuggested: true,
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
    generatePlan,
    createManualPlan,
    updateSlot,
    clearSlot,
    saveNewRecipeToCookbook,
    regenerateSlot,
    regeneratingSlots,
    resetToSetup,
    loadPlan,
    loadPlanForWeek,
  };
}
