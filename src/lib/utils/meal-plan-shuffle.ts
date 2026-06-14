import { MealSlot, MealType, MealTypeConfig, Recipe, Season } from '@/types';

/**
 * Local (no-AI) meal-plan generator.
 *
 * Builds a candidate weekly plan purely from the user's own cookbook, honouring
 * the season and the per-meal-type category preferences/exclusions. It only
 * assigns existing recipes — it never invents new ones — and the result is meant
 * to be edited by hand afterwards.
 */

const FULL_WEEK = [0, 1, 2, 3, 4, 5, 6];

// Below this many seasonal candidates the season filter is relaxed, so a sparse
// cookbook still produces a usable plan instead of mostly empty slots.
const MIN_SEASONAL_POOL = 5;

export interface ShuffleConfig {
  season: Season;
  activeMealTypes: MealType[];
  activeDays?: number[] | null;
  mealTypeConfigs?: Partial<Record<MealType, MealTypeConfig>> | null;
}

export interface ShuffleResult {
  slots: MealSlot[];
  /** Meal types left empty because no recipe matched their filters. */
  unfilledMealTypes: MealType[];
}

/**
 * Generates slots for every active meal type across the active days.
 *
 * Recipes are spread to avoid repetition across the whole week first, then
 * within a meal type. A meal type whose candidate pool is empty is reported in
 * `unfilledMealTypes` and its slots are simply left blank for manual filling.
 */
export function buildShuffledSlots(recipes: Recipe[], config: ShuffleConfig): ShuffleResult {
  const days = config.activeDays && config.activeDays.length > 0 ? config.activeDays : FULL_WEEK;

  const slots: MealSlot[] = [];
  const unfilledMealTypes: MealType[] = [];
  const usedRecipeIds = new Set<string>();

  for (const mealType of config.activeMealTypes) {
    const pool = buildCandidatePool(recipes, config.season, config.mealTypeConfigs?.[mealType] ?? null);

    if (pool.length === 0) {
      unfilledMealTypes.push(mealType);
      continue;
    }

    const assignments = pickForDays(pool, days.length, usedRecipeIds);
    days.forEach((dayIndex, i) => {
      const recipe = assignments[i];
      usedRecipeIds.add(recipe.id);
      slots.push({
        dayIndex,
        mealType,
        existingRecipeId: recipe.id,
        newRecipe: null,
        recipeTitle: recipe.title,
      });
    });
  }

  return { slots, unfilledMealTypes };
}

/**
 * Picks a replacement recipe for a single slot during a manual re-roll.
 *
 * Prefers a different recipe of the same category that fits the season and is
 * not already used elsewhere in the week, then relaxes the season and finally
 * the category so the user always gets a fresh suggestion when one exists.
 * Returns null only when no other recipe is available at all.
 */
export function pickReshuffledRecipe(
  recipes: Recipe[],
  params: {
    season: Season;
    categoryId: string | null;
    currentRecipeId: string | null;
    usedRecipeIds: Set<string>;
  }
): Recipe | null {
  const { season, categoryId, currentRecipeId, usedRecipeIds } = params;

  const isCandidate = (recipe: Recipe) =>
    recipe.id !== currentRecipeId && !usedRecipeIds.has(recipe.id);
  const inCategory = (recipe: Recipe) => (categoryId ? recipe.categoryId === categoryId : true);

  // 1. Same category + season, 2. same category any season, 3. any unused recipe.
  const tiers = [
    recipes.filter(r => isCandidate(r) && inCategory(r) && matchesSeason(r, season)),
    recipes.filter(r => isCandidate(r) && inCategory(r)),
    recipes.filter(isCandidate),
  ];

  const pool = tiers.find(tier => tier.length > 0);
  if (!pool) return null;
  return shuffle(pool)[0];
}

/** True when a recipe fits the season, is all-season, or has no season set. */
export function matchesSeason(recipe: Recipe, season: Season): boolean {
  const seasons = recipe.seasons ?? (recipe.season ? [recipe.season] : []);
  if (seasons.length === 0) return true;
  return seasons.includes(season) || seasons.includes('tutte_stagioni');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds the candidate recipes for one meal type: excluded categories are
 * always removed, the season is relaxed only when too few recipes match, and a
 * preferred category is honoured when it yields at least one recipe.
 */
function buildCandidatePool(
  recipes: Recipe[],
  season: Season,
  mealConfig: MealTypeConfig | null
): Recipe[] {
  const excluded = new Set(mealConfig?.excludedCategoryIds ?? []);
  const allowed = recipes.filter(r => !excluded.has(r.categoryId ?? ''));

  const seasonal = allowed.filter(r => matchesSeason(r, season));
  const base = seasonal.length >= MIN_SEASONAL_POOL ? seasonal : allowed;

  const preferredId = mealConfig?.preferredCategoryId ?? null;
  if (preferredId) {
    const preferredOnly = base.filter(r => r.categoryId === preferredId);
    if (preferredOnly.length > 0) return preferredOnly;
  }

  return base;
}

/**
 * Returns `count` recipes for a meal type's days. Recipes not yet used anywhere
 * in the week come first (no repeats); if the pool is too small the remainder
 * reuses recipes while avoiding back-to-back duplicates.
 */
function pickForDays(pool: Recipe[], count: number, usedRecipeIds: Set<string>): Recipe[] {
  const result: Recipe[] = [];

  for (const recipe of shuffle(pool.filter(r => !usedRecipeIds.has(r.id)))) {
    if (result.length >= count) break;
    result.push(recipe);
  }

  const shuffledAll = shuffle(pool);
  let i = 0;
  while (result.length < count) {
    const recipe = shuffledAll[i % shuffledAll.length];
    i++;
    const isBackToBack =
      result.length > 0 && result[result.length - 1].id === recipe.id && shuffledAll.length > 1;
    if (isBackToBack) continue;
    result.push(recipe);
  }

  return result;
}

/** Non-mutating Fisher–Yates shuffle. */
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
