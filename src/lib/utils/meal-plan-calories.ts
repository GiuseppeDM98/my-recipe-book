import { MealPlan, MealSlot, Recipe } from '@/types';

/**
 * Daily calorie totals for the weekly planner.
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
 */

export interface DayCalories {
  /** Sum of kcal per serving across the day's resolvable slots. */
  total: number;
  /** Slots whose recipe carries an estimate. */
  countedSlots: number;
  /** Filled slots skipped because no estimate was available. */
  uncountedSlots: number;
  /** True when at least one filled slot had no estimate to contribute. */
  isPartial: boolean;
}

/**
 * Reads the calorie estimate behind a slot.
 *
 * Resolution order mirrors buildContributions(): a saved recipe by id first, then the
 * inline ParsedRecipe carried by legacy AI-generated plans. Returns null for an empty
 * slot, a recipe that has since been deleted, or a recipe with no estimate — the caller
 * distinguishes "nothing here" from "here but unknown" via the slot's own fields.
 */
function readSlotCalories(slot: MealSlot, recipesById: Map<string, Recipe>): number | null {
  if (slot.existingRecipeId) {
    const recipe = recipesById.get(slot.existingRecipeId);
    return recipe?.caloriesPerServing ?? null;
  }

  if (slot.newRecipe) {
    return slot.newRecipe.caloriesPerServing ?? null;
  }

  return null;
}

/** True when a slot holds a recipe at all, regardless of whether it has an estimate. */
function isFilledSlot(slot: MealSlot): boolean {
  return Boolean(slot.existingRecipeId || slot.newRecipe);
}

/**
 * Totals one day's calories across every slot assigned to that day.
 *
 * @param plan - The weekly plan
 * @param dayIndex - 0 = Monday … 6 = Sunday
 * @param recipesById - Recipes batch-fetched by the caller, keyed by id
 */
export function computeDayCalories(
  plan: MealPlan,
  dayIndex: number,
  recipesById: Map<string, Recipe>
): DayCalories {
  let total = 0;
  let countedSlots = 0;
  let uncountedSlots = 0;

  for (const slot of plan.slots) {
    if (slot.dayIndex !== dayIndex) continue;
    if (!isFilledSlot(slot)) continue;

    const calories = readSlotCalories(slot, recipesById);

    if (calories === null) {
      uncountedSlots += 1;
      continue;
    }

    total += calories;
    countedSlots += 1;
  }

  return {
    total,
    countedSlots,
    uncountedSlots,
    isPartial: uncountedSlots > 0,
  };
}

/**
 * Totals the whole week, keyed by day index.
 *
 * Only the plan's active days are included, so a removed day never contributes a
 * phantom entry. Days with no filled slots still appear, with a zero total.
 */
export function computeWeekCalories(
  plan: MealPlan,
  recipesById: Map<string, Recipe>
): Map<number, DayCalories> {
  const activeDays = plan.activeDays ?? [0, 1, 2, 3, 4, 5, 6];
  const byDay = new Map<number, DayCalories>();

  for (const dayIndex of activeDays) {
    byDay.set(dayIndex, computeDayCalories(plan, dayIndex, recipesById));
  }

  return byDay;
}
