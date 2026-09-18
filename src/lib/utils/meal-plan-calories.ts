import { MacrosPerServing, MealPlan, MealSlot, MealSlotVariant, Recipe } from '@/types';
import { PlannerMember } from '@/lib/utils/planner-members';

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
 *
 * WHY EVERY TOTAL IS PER PERSON:
 * The figures are what ONE person eats in the day, never the whole pot: MealSlot.
 * servingsPlanned deliberately does not enter this module. The headline totals follow
 * the BASE PATH (one serving of every slot's base meal), which is the same number plans
 * showed before the family model existed. A member covered by a variant eats something
 * else in that slot, so their day is a different sum: it is reported in `memberDeltas`,
 * only for the members whose day actually differs from the base path.
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

/** The three macro totals plus their shared completeness counters. */
export interface MacroTotals {
  proteinTotal: number;
  carbsTotal: number;
  fatTotal: number;
  countedSlots: number;
  uncountedSlots: number;
  isPartial: boolean;
}

/** One person's day: kcal and macros, each with their own completeness. */
export interface PersonDayNutrition {
  calories: NutrientTotal;
  macros: MacroTotals;
}

/** The day of a member who eats at least one variant, i.e. differs from the base path. */
export interface MemberDayNutrition extends PersonDayNutrition {
  memberId: string;
  label: string;
}

/** Daily planner nutrition for one person on the base path, plus the members who deviate. */
export interface DayNutrition extends PersonDayNutrition {
  /**
   * Members covered by a variant on this day, in family-profile order; [] otherwise.
   * A member removed from the profile never appears: their label can't be rebuilt.
   */
  memberDeltas: MemberDayNutrition[];
}

/** Per-serving estimate of whatever a person eats in a slot; null = no estimate. */
interface ServingNutrition {
  caloriesPerServing: number | null;
  macrosPerServing: MacrosPerServing | null;
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
): ServingNutrition {
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

/** Reads a variant's estimate; a deleted recipe degrades to "no estimate" like a base slot. */
function readVariantNutrition(
  variant: MealSlotVariant,
  recipesById: Map<string, Recipe>
): ServingNutrition {
  const recipe = variant.existingRecipeId ? recipesById.get(variant.existingRecipeId) : undefined;
  return {
    caloriesPerServing: recipe?.caloriesPerServing ?? null,
    macrosPerServing: recipe?.macrosPerServing ?? null,
  };
}

/**
 * The variant a member eats in a slot, if any. Variants without a recipe are corrupt
 * data and are ignored here exactly as buildContributions() ignores them, so the
 * shopping list and the kcal never disagree on who eats what.
 */
function findVariantForMember(slot: MealSlot, memberId: string): MealSlotVariant | undefined {
  return (slot.variants ?? []).find(
    variant => variant.existingRecipeId && variant.memberIds.includes(memberId)
  );
}

/** True when a slot holds a recipe at all, regardless of whether it has an estimate. */
function isFilledSlot(slot: MealSlot): boolean {
  return Boolean(slot.existingRecipeId || slot.newRecipe);
}

/**
 * Sums per-serving estimates into one person's day.
 *
 * Each entry is one meal that person eats; a null metric counts as a skipped slot and
 * flags that metric partial, without touching the other one.
 */
function sumPersonDay(servings: ServingNutrition[]): PersonDayNutrition {
  let caloriesTotal = 0;
  let caloriesCounted = 0;
  let caloriesUncounted = 0;

  let proteinTotal = 0;
  let carbsTotal = 0;
  let fatTotal = 0;
  let macrosCounted = 0;
  let macrosUncounted = 0;

  for (const nutrition of servings) {
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
 * Totals one day's nutrition for one person across every slot assigned to that day.
 *
 * @param plan - The weekly plan
 * @param dayIndex - 0 = Monday … 6 = Sunday
 * @param recipesById - Recipes batch-fetched by the caller, keyed by id (variants included)
 * @param members - Family members with resolved labels; [] = no profile → no memberDeltas
 */
export function computeDayNutrition(
  plan: MealPlan,
  dayIndex: number,
  recipesById: Map<string, Recipe>,
  members: PlannerMember[] = []
): DayNutrition {
  const daySlots = plan.slots.filter(slot => slot.dayIndex === dayIndex);

  // Base path: one serving of every filled slot's base meal. Variants never enter it,
  // so a plan without variants totals exactly what it did before the family model.
  const basePath = sumPersonDay(
    daySlots.filter(isFilledSlot).map(slot => readSlotNutrition(slot, recipesById))
  );

  // Members whose day differs: those covered by a variant in at least one slot.
  const memberDeltas: MemberDayNutrition[] = [];
  for (const member of members) {
    const eatsAVariant = daySlots.some(slot => findVariantForMember(slot, member.id));
    if (!eatsAVariant) continue;

    const servings: ServingNutrition[] = [];
    for (const slot of daySlots) {
      const variant = findVariantForMember(slot, member.id);
      if (variant) {
        servings.push(readVariantNutrition(variant, recipesById));
      } else if (isFilledSlot(slot)) {
        servings.push(readSlotNutrition(slot, recipesById));
      }
    }

    memberDeltas.push({ memberId: member.id, label: member.label, ...sumPersonDay(servings) });
  }

  return { ...basePath, memberDeltas };
}

/**
 * Totals the whole week, keyed by day index.
 *
 * Only the plan's active days are included, so a removed day never contributes a
 * phantom entry. Days with no filled slots still appear, with a zero total.
 */
export function computeWeekNutrition(
  plan: MealPlan,
  recipesById: Map<string, Recipe>,
  members: PlannerMember[] = []
): Map<number, DayNutrition> {
  const activeDays = plan.activeDays ?? [0, 1, 2, 3, 4, 5, 6];
  const byDay = new Map<number, DayNutrition>();

  for (const dayIndex of activeDays) {
    byDay.set(dayIndex, computeDayNutrition(plan, dayIndex, recipesById, members));
  }

  return byDay;
}
