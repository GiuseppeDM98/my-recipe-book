'use client';

import { useState, useCallback } from 'react';
import { MealPlan, MealPlanSetupConfig, MealSlot, MealType, Season, Recipe } from '@/types';
import {
  createMealPlan,
  updateMealPlanSlots,
  deleteMealPlan,
} from '@/lib/firebase/meal-plans';
import { createRecipe } from '@/lib/firebase/firestore';
import { createCategoryIfNotExists } from '@/lib/firebase/categories';
import { useAuth } from '@/lib/hooks/useAuth';

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
  generatePlan: (config: MealPlanSetupConfig, existingRecipes: Recipe[], categories: { id: string; name: string }[]) => Promise<void>;
  createManualPlan: (config: MealPlanSetupConfig) => Promise<void>;
  updateSlot: (dayIndex: number, mealType: MealType, recipeId: string, title: string) => Promise<void>;
  clearSlot: (dayIndex: number, mealType: MealType) => Promise<void>;
  saveNewRecipeToCookbook: (slot: MealSlot, categoryName: string, seasons: Season[]) => Promise<string>;
  resetToSetup: () => void;
  loadPlan: (plan: MealPlan) => void;
}

export function useMealPlanner(): UseMealPlannerReturn {
  const { user } = useAuth();
  const [step, setStep] = useState<PlannerStep>('setup');
  const [currentPlan, setCurrentPlan] = useState<MealPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
   * Call /api/plan-meals, create MealPlan from response, save to Firebase.
   *
   * The API returns slot assignments with existingRecipeId or newRecipeMarkdown.
   * We parse the markdown into ParsedRecipe objects here so that the UI
   * can display them as NewRecipeReviewCards.
   */
  const generatePlan = useCallback(async (
    config: MealPlanSetupConfig,
    existingRecipes: Recipe[],
    categories: { id: string; name: string }[]
  ) => {
    if (!user) return;

    setIsGenerating(true);
    setStep('generating');
    setError(null);

    try {
      // Compact recipe summaries — keep token budget under control
      const recipeSummaries = existingRecipes.map(r => ({
        id: r.id,
        title: r.title,
        categoryId: r.categoryId,
        seasons: r.seasons ?? (r.season ? [r.season] : []),
        ingredientCount: r.ingredients.length,
      }));

      const response = await fetch('/api/plan-meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, existingRecipes: recipeSummaries, categories }),
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
      });

      const plan: MealPlan = {
        id: planId,
        userId: user.uid,
        weekStartDate: config.weekStartDate,
        slots,
        activeMealTypes: config.activeMealTypes,
        season: config.season,
        generatedByAI: true,
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
      });

      const plan: MealPlan = {
        id: planId,
        userId: user.uid,
        weekStartDate: config.weekStartDate,
        slots: [],
        activeMealTypes: config.activeMealTypes,
        season: config.season,
        generatedByAI: false,
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

  /** Delete the current plan and return to setup step. */
  const resetToSetup = useCallback(() => {
    if (currentPlan) {
      // Fire-and-forget: delete from Firebase in the background
      deleteMealPlan(currentPlan.id).catch(err =>
        console.error('Errore nell\'eliminazione del piano:', err)
      );
    }
    setCurrentPlan(null);
    setStep('setup');
    setError(null);
  }, [currentPlan]);

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
    resetToSetup,
    loadPlan,
  };
}
