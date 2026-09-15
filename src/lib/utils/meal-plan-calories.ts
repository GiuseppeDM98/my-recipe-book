import { MacrosPerServing, MealPlan, MealSlot, Recipe } from '@/types';

/**
 * Daily nutrition totals for the weekly planner.
 *
 * WHY A SEPARATE MODULE:
 * Same shape as ingredient-aggregator.ts — a pure function over (plan, recipesById) that
 * the calendar renders. Keeping it out of the component makes the arithmetic testable
 * without mounting a grid.
 *
 * WHY `isPartial` IS PART OF THE RESULT:
 * Only some recipes carry an estimate. A total that silently sums the three slots that
 * happen to have one, out of five, looks like a complete day's intake and is wrong by
 * whatever the other two contribute. The flag lets the UI mark the number as a floor
 * rather than presenting it as the day's total.
 *
 * WHY KCAL AND MACROS HAVE SEPARATE COUNTERS:
 * A recipe can have kcal but no macros (every recipe created before macro support), so the
 * same day can be complete for kcal and partial for macros. The three macros instead
 * travel together (MacrosPerServing is all-or-nothing on the recipe), so they share a
 * single set of counters.
 */

/** Total of a single metric with the existing ≥ semantics (floor, not total). */
export interface NutrientTotal {
  /** Per-serving sum over the day's filled slots that carry the metric. */
  total: number;
  /** Slots whose recipe carries the metric. */
  countedSlots: number;
  /** Filled slots skipped because the metric is missing. */
  uncountedSlots: number;
  /** true when at least one filled slot did not contribute. */
  isPartial: boolean;
}

/** Daily planner nutrition: kcal and macros, each with their own completeness. */
export interface DayNutrition {
  calories: NutrientTotal;
  macros: {
    proteinTotal: number;
    carbsTotal: number;
    fatTotal: number;
    countedSlots: number;
    uncountedSlots: number;
    isPartial: boolean;
  };
}

/**
 * Reads the nutrition estimate behind a filled slot.
 *
 * Resolution order mirrors buildContributions(): a saved recipe by id first, then the
 * inline ParsedRecipe carried by legacy AI-generated plans. A deleted recipe (id no
 * longer in `recipesById`) degrades to "no estimate", same as a recipe that simply
 * doesn't have one — both mean the slot can't contribute, and the caller marks the day
 * partial either way rather than silently dropping the slot from the counts.
 */
function readSlotNutrition(
  slot: MealSlot,
  recipesById: Map<string, Recipe>
): { caloriesPerServing: number | null; macrosPerServing: MacrosPerServing | null } {
  if (slot.existingRecipeId) {
    const recipe = recipesById.get(slot.existingRecipeId);
    return {
      caloriesPerServing: recipe?.caloriesPerServing ?? null,
      macrosPerServing: recipe?.macrosPerServing ?? null,
    };
  }

  return {
    caloriesPerServing: slot.newRecipe?.caloriesPerServing ?? null,
    macrosPerServing: slot.newRecipe?.macrosPerServing ?? null,
  };
}

/** True when a slot holds a recipe at all, regardless of whether it has an estimate. */
function isFilledSlot(slot: MealSlot): boolean {
  return Boolean(slot.existingRecipeId || slot.newRecipe);
}

/**
 * Totals one day's nutrition across every slot assigned to that day.
 *
 * @param plan - The weekly plan
 * @param dayIndex - 0 = Monday … 6 = Sunday
 * @param recipesById - Recipes batch-fetched by the caller, keyed by id
 */
export function computeDayNutrition(
  plan: MealPlan,
  dayIndex: number,
  recipesById: Map<string, Recipe>
): DayNutrition {
  let caloriesTotal = 0;
  let caloriesCounted = 0;
  let caloriesUncounted = 0;

  let proteinTotal = 0;
  let carbsTotal = 0;
  let fatTotal = 0;
  let macrosCounted = 0;
  let macrosUncounted = 0;

  for (const slot of plan.slots) {
    if (slot.dayIndex !== dayIndex) continue;
    if (!isFilledSlot(slot)) continue;

    const nutrition = readSlotNutrition(slot, recipesById);

    if (nutrition.caloriesPerServing === null) {
      caloriesUncounted += 1;
    } else {
      caloriesTotal += nutrition.caloriesPerServing;
      caloriesCounted += 1;
    }

    // A fatGrams of 0 counts as counted and adds 0 — the gate is `!= null`, never truthy.
    if (nutrition.macrosPerServing === null) {
      macrosUncounted += 1;
    } else {
      proteinTotal += nutrition.macrosPerServing.proteinGrams;
      carbsTotal += nutrition.macrosPerServing.carbsGrams;
      fatTotal += nutrition.macrosPerServing.fatGrams;
      macrosCounted += 1;
    }
  }

  return {
    calories: {
      total: caloriesTotal,
      countedSlots: caloriesCounted,
      uncountedSlots: caloriesUncounted,
      isPartial: caloriesUncounted > 0,
    },
    macros: {
      proteinTotal,
      carbsTotal,
      fatTotal,
      countedSlots: macrosCounted,
      uncountedSlots: macrosUncounted,
      isPartial: macrosUncounted > 0,
    },
  };
}

/**
 * Totals the whole week, keyed by day index.
 *
 * Only the plan's active days are included, so a removed day never contributes a
 * phantom entry. Days with no filled slots still appear, with a zero total.
 */
export function computeWeekNutrition(
  plan: MealPlan,
  recipesById: Map<string, Recipe>
): Map<number, DayNutrition> {
  const activeDays = plan.activeDays ?? [0, 1, 2, 3, 4, 5, 6];
  const byDay = new Map<number, DayNutrition>();

  for (const dayIndex of activeDays) {
    byDay.set(dayIndex, computeDayNutrition(plan, dayIndex, recipesById));
  }

  return byDay;
}
