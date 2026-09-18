import { MealPlan, MealSlot, MealSlotVariant, MealType } from '@/types';
import { sortMealTypes } from '@/lib/constants/meal-types';
import { clampServingsPlanned } from '@/lib/utils/planner-members';

/**
 * Pure transforms over a plan's slots array, one per planner mutation.
 *
 * WHY THEY LIVE OUTSIDE useMealPlanner:
 * The hook's job is orchestration (optimistic state, Firestore write, cache
 * invalidation). What a mutation does to the slots is a rule of the family model —
 * "changing the base dish doesn't change who eats what", "a variant implies the family
 * model" — and those rules are what breaks silently. Here they can be tested without
 * mounting a hook or mocking Firestore.
 *
 * FIRESTORE SAFETY: every slot built here carries explicit `null`s, never `undefined`
 * keys — updateMealPlanSlots() rewrites the whole array and a single undefined rejects
 * the entire write.
 */

/** Finds a slot by its identity, the (dayIndex, mealType) pair. */
export function findSlot(
  slots: MealSlot[],
  dayIndex: number,
  mealType: MealType
): MealSlot | undefined {
  return slots.find(slot => slot.dayIndex === dayIndex && slot.mealType === mealType);
}

function withoutSlot(slots: MealSlot[], dayIndex: number, mealType: MealType): MealSlot[] {
  return slots.filter(slot => !(slot.dayIndex === dayIndex && slot.mealType === mealType));
}

/**
 * Assigns a cookbook recipe as the base meal of a slot.
 *
 * Used by both the manual pick and the ↺ re-roll: either way the question answered is
 * "which base dish?", which is orthogonal to who eats and who deviates. So an existing
 * slot keeps its `servingsPlanned` and `variants` — wiping a careful variant setup on
 * an accidental ↺ tap would be destructive — and keeps a legacy `null` as `null`
 * (swapping the dish must not start scaling a plan that never scaled). Only a
 * previously EMPTY cell gets the family default: that slot is new, there is no
 * shopping list to protect.
 *
 * The slot is rebuilt rather than spread, so AI leftovers of a replaced inline recipe
 * (`suggestedCategoryName`, `suggestedSeasons`) don't outlive it.
 */
export function withBaseRecipe(
  slots: MealSlot[],
  dayIndex: number,
  mealType: MealType,
  recipe: { id: string; title: string },
  defaultServingsPlanned: number
): MealSlot[] {
  const previous = findSlot(slots, dayIndex, mealType);

  return [
    ...withoutSlot(slots, dayIndex, mealType),
    {
      dayIndex,
      mealType,
      existingRecipeId: recipe.id,
      newRecipe: null,
      recipeTitle: recipe.title,
      servingsPlanned: previous ? previous.servingsPlanned ?? null : defaultServingsPlanned,
      variants: previous?.variants ?? null,
    },
  ];
}

/** Removes a slot entirely — recipe, people and variants: nobody eats there. */
export function withClearedSlot(
  slots: MealSlot[],
  dayIndex: number,
  mealType: MealType
): MealSlot[] {
  return withoutSlot(slots, dayIndex, mealType);
}

/**
 * Sets the people a slot is planned for (clamped to the supported range).
 *
 * @returns The new slots, or null when the slot does not exist: people without a base
 *          meal mean nothing, and the editor never offers the stepper on an empty cell.
 */
export function withSlotServings(
  slots: MealSlot[],
  dayIndex: number,
  mealType: MealType,
  servingsPlanned: number
): MealSlot[] | null {
  if (!findSlot(slots, dayIndex, mealType)) return null;

  return slots.map(slot =>
    slot.dayIndex === dayIndex && slot.mealType === mealType
      ? { ...slot, servingsPlanned: clampServingsPlanned(servingsPlanned) }
      : slot
  );
}

/**
 * Replaces the variants of a slot.
 *
 * Variants without members are dropped (they would feed nobody), and an empty result
 * is persisted as `null`. A variant implies the family model, so a legacy slot
 * (`servingsPlanned == null`) gets the default in the SAME write: the state "variants
 * on a slot that doesn't scale" would make the base meal ignore the people the
 * variants take away from it.
 *
 * @returns The new slots, or null when the slot does not exist.
 */
export function withSlotVariants(
  slots: MealSlot[],
  dayIndex: number,
  mealType: MealType,
  variants: MealSlotVariant[],
  defaultServingsPlanned: number
): MealSlot[] | null {
  if (!findSlot(slots, dayIndex, mealType)) return null;

  const validVariants = variants.filter(variant => variant.memberIds.length > 0);

  return slots.map(slot =>
    slot.dayIndex === dayIndex && slot.mealType === mealType
      ? {
          ...slot,
          servingsPlanned: slot.servingsPlanned ?? defaultServingsPlanned,
          variants: validVariants.length > 0 ? validVariants : null,
        }
      : slot
  );
}

/**
 * The structure copied when a plan is duplicated onto another week.
 *
 * Slots travel verbatim — `servingsPlanned` and `variants` included, and a legacy
 * `null` stays `null` — together with the plan's default people, so cells filled in the
 * copy behave like in the original. The shopping-list state (checked ids, custom items)
 * deliberately stays with the source week.
 */
export function buildPlanCopy(
  plan: MealPlan,
  targetWeekStartDate: string
): Pick<
  MealPlan,
  | 'weekStartDate'
  | 'slots'
  | 'activeMealTypes'
  | 'season'
  | 'generatedByAI'
  | 'activeDays'
  | 'defaultServingsPlanned'
> {
  return {
    weekStartDate: targetWeekStartDate,
    slots: plan.slots,
    activeMealTypes: sortMealTypes(plan.activeMealTypes),
    season: plan.season,
    generatedByAI: false,
    activeDays: plan.activeDays ?? null,
    defaultServingsPlanned: plan.defaultServingsPlanned ?? null,
  };
}
