/**
 * Centralized meal type constants for the weekly planner.
 *
 * WHY CENTRALIZED:
 * MEAL_LABELS was duplicated across four components (MealPlanSetupForm,
 * WeeklyCalendarGrid, RecipePickerSheet, NewRecipeReviewCard) and the copies had
 * already drifted apart ("Primo piatto" in one, "Primo" in the others). A single
 * source of truth keeps the calendar, the picker and the setup form in agreement.
 *
 * CHECKLIST: If you add a MealType value in types/index.ts, also update:
 * - MEAL_LABELS below (the Record is exhaustive, so TypeScript will flag it)
 * - SELECTABLE_MEAL_TYPES, but only if users are meant to plan it
 */

import { MealType } from '@/types';

/**
 * Meal types a user can actually put in a plan, in day order.
 *
 * WHY A SUBSET:
 * MealType carries seven values, but `primo`/`secondo`/`contorno`/`dolce` are
 * leftovers from an earlier course-based model and are unreachable from the UI.
 * They stay in the type (and in MEAL_LABELS) so legacy plans still render, but
 * they must not be offered as new choices.
 */
export const SELECTABLE_MEAL_TYPES: MealType[] = ['colazione', 'pranzo', 'cena'];

/**
 * Italian display labels for every meal type, legacy values included.
 *
 * Labels are kept short because they are rendered as row headers in the weekly
 * grid, where the column width is the binding constraint on small screens.
 */
export const MEAL_LABELS: Record<MealType, string> = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  primo: 'Primo',
  secondo: 'Secondo',
  contorno: 'Contorno',
  dolce: 'Dolce',
};
