'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  MealPlan,
  MealPlanSetupConfig,
  MealSlot,
  MealSlotVariant,
  MealType,
  Season,
  Recipe,
} from '@/types';
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
import {
  buildPlanCopy,
  findSlot,
  withBaseRecipe,
  withClearedSlot,
  withSlotServings,
  withSlotVariants,
} from '@/lib/utils/meal-plan-slots';
import { clampServingsPlanned, resolveDefaultServingsPlanned } from '@/lib/utils/planner-members';
import { useAuth } from '@/lib/hooks/useAuth';
import { useFamilyProfile } from '@/lib/hooks/useFamilyProfile';
import { useQueryClient } from '@tanstack/react-query';
import { recipesQueryKey } from '@/lib/hooks/useRecipes';

/**
 * Meal planner state management hook.
 *
 * RESPONSIBILITIES:
 * - Drives the 2-step page flow (setup → calendar). There is no "generating" step:
 *   the shuffle is local and synchronous, a full-screen loader would only flash.
 * - Builds a plan locally by shuffling the user's own recipes (no AI)
 * - Knows how many people a new slot is planned for (the plan's default, or the family size)
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
 *
 * SLOT RULES live in lib/utils/meal-plan-slots.ts (pure, tested): this hook only
 * orchestrates state, write and cache invalidation around them.
 *
 * CHECKLIST — adding a plan mutation: (1) go through applyPlan(), never setCurrentPlan
 * directly; (2) call invalidateShoppingList() after the write; (3) build slot objects
 * with explicit nulls, never undefined keys.
 */

export type PlannerStep = 'setup' | 'calendar';

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
  /** Sets the people a filled slot is planned for (clamped 1..20). Throws on an empty cell. */
  setSlotServings: (dayIndex: number, mealType: MealType, servingsPlanned: number) => Promise<void>;
  /** Replaces the per-member variants of a filled slot. Throws on an empty cell. */
  setSlotVariants: (dayIndex: number, mealType: MealType, variants: MealSlotVariant[]) => Promise<void>;
  /**
   * People a newly filled slot is planned for: the plan's persisted default (the setup
   * choice), otherwise the family size, otherwise 2.
   */
  defaultServingsPlanned: number;
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

  // familyProfile has a 5 min staleTime: a just-edited profile can take that long to
  // show up here. Accepted — the value is only a default, editable slot by slot.
  const { familyProfile } = useFamilyProfile();
  const familyServingsPlanned = useMemo(
    () => resolveDefaultServingsPlanned(familyProfile),
    [familyProfile]
  );
  // The plan's own default (the people chosen at setup, persisted on the document) wins
  // over the family size; plans created before the field existed fall back to the family.
  const defaultServingsPlanned = currentPlan?.defaultServingsPlanned ?? familyServingsPlanned;

  /**
   * Latest plan, readable synchronously by the slot mutations.
   *
   * WHY NOT THE `currentPlan` CLOSURE:
   * The slot editor stays open across several actions and can fire two mutations in the
   * same tick — it flushes the debounced people stepper right before committing a
   * variant. Both callbacks would close over the same render's `currentPlan`, and since
   * every write rewrites the whole slots array, the second would silently undo the
   * first. The ref is updated inside applyPlan(), before React re-renders.
   */
  const latestPlanRef = useRef<MealPlan | null>(null);
  const applyPlan = useCallback((plan: MealPlan | null) => {
    latestPlanRef.current = plan;
    setCurrentPlan(plan);
  }, []);

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
    applyPlan(plan);
    setStep('calendar');
    setError(null);
  }, [applyPlan]);

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

    applyPlan(null);
    setStep('setup');
    setError(null);
  }, [user, loadPlan, applyPlan]);

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
      const servingsPlanned = clampServingsPlanned(
        config.defaultServingsPlanned ?? familyServingsPlanned
      );
      const { slots, unfilledMealTypes } = buildShuffledSlots(recipes, {
        season: config.season,
        activeMealTypes: config.activeMealTypes,
        activeDays: config.activeDays ?? null,
        mealTypeConfigs: config.mealTypeConfigs ?? null,
        defaultServingsPlanned: servingsPlanned,
      });

      const planId = await createMealPlan(user.uid, {
        weekStartDate: config.weekStartDate,
        slots,
        activeMealTypes: config.activeMealTypes,
        season: config.season,
        generatedByAI: false,
        activeDays: config.activeDays ?? null,
        defaultServingsPlanned: servingsPlanned,
      });

      applyPlan({
        id: planId,
        userId: user.uid,
        weekStartDate: config.weekStartDate,
        slots,
        activeMealTypes: config.activeMealTypes,
        season: config.season,
        generatedByAI: false,
        activeDays: config.activeDays ?? null,
        defaultServingsPlanned: servingsPlanned,
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
  }, [user, invalidateShoppingList, applyPlan, familyServingsPlanned]);

  /**
   * Duplicate the current plan onto another week.
   *
   * Blocks (throws) when the target week already has a plan — a week holds at
   * most one plan, and silently overwriting would destroy existing data. Only
   * the structure is copied (buildPlanCopy: slots verbatim, people and variants
   * included); shopping-list state stays with the source week.
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

    const newPlanId = await createMealPlan(user.uid, buildPlanCopy(currentPlan, targetWeekStartDate));

    invalidateShoppingList();
    return newPlanId;
  }, [user, currentPlan, invalidateShoppingList]);

  /**
   * Create an empty plan (manual mode) and go directly to the calendar.
   * The calendar starts with all slots empty; the user fills them from the slot editor.
   * The people chosen at setup have no slot to land on yet: they are persisted as the
   * plan's defaultServingsPlanned, the default for every cell filled later — also after
   * a reload or from another device.
   */
  const createManualPlan = useCallback(async (config: MealPlanSetupConfig) => {
    if (!user) return;

    setError(null);

    try {
      const servingsPlanned = clampServingsPlanned(
        config.defaultServingsPlanned ?? familyServingsPlanned
      );
      const planId = await createMealPlan(user.uid, {
        weekStartDate: config.weekStartDate,
        slots: [],
        activeMealTypes: config.activeMealTypes,
        season: config.season,
        generatedByAI: false,
        activeDays: config.activeDays ?? null,
        defaultServingsPlanned: servingsPlanned,
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
        defaultServingsPlanned: servingsPlanned,
        createdAt: null as unknown as import('firebase/firestore').Timestamp,
        updatedAt: null as unknown as import('firebase/firestore').Timestamp,
      };

      applyPlan(plan);
      setStep('calendar');
      invalidateShoppingList();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
      setError(msg);
    }
  }, [user, invalidateShoppingList, applyPlan, familyServingsPlanned]);

  /**
   * Applies new slots optimistically, persists them and drops the derived shopping list.
   * Shared tail of every single-slot mutation.
   */
  /** People for a newly filled cell of `plan`: its persisted default, else the family size. */
  const resolvePlanServings = useCallback(
    (plan: MealPlan) => plan.defaultServingsPlanned ?? familyServingsPlanned,
    [familyServingsPlanned]
  );

  const commitSlots = useCallback(async (plan: MealPlan, slots: MealSlot[]) => {
    applyPlan({ ...plan, slots });
    await updateMealPlanSlots(plan.id, slots);
    invalidateShoppingList();
  }, [applyPlan, invalidateShoppingList]);

  /**
   * Assign an existing cookbook recipe as the base meal of a slot.
   *
   * Replaces any existing assignment (existing or AI-generated) but keeps the slot's
   * people and variants; a previously empty cell is planned for defaultServingsPlanned
   * (see withBaseRecipe). Persists to Firestore immediately.
   */
  const updateSlot = useCallback(async (
    dayIndex: number,
    mealType: MealType,
    recipeId: string,
    title: string
  ) => {
    const plan = latestPlanRef.current;
    if (!plan) return;

    await commitSlots(
      plan,
      withBaseRecipe(plan.slots, dayIndex, mealType, { id: recipeId, title }, resolvePlanServings(plan))
    );
  }, [commitSlots, resolvePlanServings]);

  /**
   * Empty a slot: recipe, people and variants all go (nobody eats there).
   */
  const clearSlot = useCallback(async (dayIndex: number, mealType: MealType) => {
    const plan = latestPlanRef.current;
    if (!plan) return;

    await commitSlots(plan, withClearedSlot(plan.slots, dayIndex, mealType));
  }, [commitSlots]);

  /**
   * Set how many people a filled slot is planned for.
   *
   * This is the write that moves a legacy slot into the family model: from here on its
   * shopping-list quantities scale. It must therefore only ever follow an explicit user
   * action — never be called just because an editor was opened.
   */
  const setSlotServings = useCallback(async (
    dayIndex: number,
    mealType: MealType,
    servingsPlanned: number
  ) => {
    const plan = latestPlanRef.current;
    if (!plan) return;

    const nextSlots = withSlotServings(plan.slots, dayIndex, mealType, servingsPlanned);
    if (!nextSlots) {
      throw new Error('Scegli prima la ricetta base di questo pasto');
    }

    await commitSlots(plan, nextSlots);
  }, [commitSlots]);

  /**
   * Replace the per-member variants of a filled slot (see withSlotVariants: a legacy
   * slot gets defaultServingsPlanned in the same write).
   */
  const setSlotVariants = useCallback(async (
    dayIndex: number,
    mealType: MealType,
    variants: MealSlotVariant[]
  ) => {
    const plan = latestPlanRef.current;
    if (!plan) return;

    const nextSlots = withSlotVariants(plan.slots, dayIndex, mealType, variants, resolvePlanServings(plan));
    if (!nextSlots) {
      throw new Error('Scegli prima la ricetta base di questo pasto');
    }

    await commitSlots(plan, nextSlots);
  }, [commitSlots, resolvePlanServings]);

  /**
   * Re-roll a single slot locally: pick a different recipe of the same category
   * that fits the season and is not already used elsewhere in the week.
   *
   * Only the base dish changes; people and variants survive (see withBaseRecipe).
   * Throws when no alternative recipe exists so the caller can inform the user.
   */
  const reshuffleSlot = useCallback(async (
    dayIndex: number,
    mealType: MealType,
    recipes: Recipe[]
  ) => {
    const plan = latestPlanRef.current;
    if (!plan) return;

    const slotKey = `${dayIndex}-${mealType}`;
    setRegeneratingSlots(prev => new Set(prev).add(slotKey));

    try {
      const currentRecipeId = findSlot(plan.slots, dayIndex, mealType)?.existingRecipeId ?? null;
      const currentRecipe = currentRecipeId
        ? recipes.find(recipe => recipe.id === currentRecipeId) ?? null
        : null;

      // Base recipes already placed this week, so a re-roll does not duplicate them.
      const usedRecipeIds = new Set(
        plan.slots
          .map(slot => slot.existingRecipeId)
          .filter((id): id is string => !!id)
      );

      const replacement = pickReshuffledRecipe(recipes, {
        season: plan.season,
        categoryIds: currentRecipe ? getRecipeCategoryIds(currentRecipe) : [],
        currentRecipeId,
        usedRecipeIds,
      });

      if (!replacement) {
        throw new Error('Non ho altre ricette adatte per rimescolare questo slot');
      }

      await commitSlots(
        plan,
        withBaseRecipe(plan.slots, dayIndex, mealType, replacement, resolvePlanServings(plan))
      );
    } finally {
      setRegeneratingSlots(prev => {
        const next = new Set(prev);
        next.delete(slotKey);
        return next;
      });
    }
  }, [commitSlots, resolvePlanServings]);

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
    applyPlan({
      ...currentPlan,
      activeDays: nextActiveDays,
      slots: nextSlots,
    });

    await updateMealPlan(currentPlan.id, {
      activeDays: nextActiveDays,
      slots: nextSlots,
    });
    invalidateShoppingList();
  }, [currentPlan, invalidateShoppingList, applyPlan]);

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
    applyPlan({ ...currentPlan, activeDays: nextActiveDays });

    await updateMealPlan(currentPlan.id, { activeDays: nextActiveDays });
  }, [currentPlan, applyPlan]);

  /**
   * Add a meal type (e.g. "colazione") to a plan that is already running.
   *
   * WHY THIS EXISTS:
   * activeMealTypes used to be written only at creation time, so adding a meal to
   * a started week meant deleting the plan and rebuilding it, losing every slot.
   *
   * With `autofill` the new row is populated by the same local shuffle used at
   * setup, restricted to this meal type so existing slots are never touched.
   * Without it the row appears empty and is filled from the slot editor.
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
        defaultServingsPlanned,
      });
      nextSlots = [...currentPlan.slots, ...shuffledSlots];
    }

    applyPlan({
      ...currentPlan,
      activeMealTypes: nextActiveMealTypes,
      slots: nextSlots,
    });

    await updateMealPlan(currentPlan.id, {
      activeMealTypes: nextActiveMealTypes,
      slots: nextSlots,
    });
    invalidateShoppingList();
  }, [currentPlan, invalidateShoppingList, applyPlan, defaultServingsPlanned]);

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

    applyPlan({
      ...currentPlan,
      activeMealTypes: nextActiveMealTypes,
      slots: nextSlots,
    });

    await updateMealPlan(currentPlan.id, {
      activeMealTypes: nextActiveMealTypes,
      slots: nextSlots,
    });
    invalidateShoppingList();
  }, [currentPlan, invalidateShoppingList, applyPlan]);

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
      ...(recipe.servingWeightGrams != null ? { servingWeightGrams: recipe.servingWeightGrams } : {}),
      ...(recipe.macrosPerServing != null ? { macrosPerServing: recipe.macrosPerServing } : {}),
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
    applyPlan(updatedPlan);
    await updateMealPlanSlots(currentPlan.id, updatedSlots);
    invalidateShoppingList();

    return newRecipeId;
  }, [user, currentPlan, queryClient, invalidateShoppingList, applyPlan]);

  /** Return to setup without deleting the current plan from Firebase. */
  const resetToSetup = useCallback(() => {
    applyPlan(null);
    setStep('setup');
    setError(null);
  }, [applyPlan]);

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
    setSlotServings,
    setSlotVariants,
    defaultServingsPlanned,
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
