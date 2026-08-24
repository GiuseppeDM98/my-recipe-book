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
 * - sortMealTypes needs NO update: it derives its order from SELECTABLE_MEAL_TYPES
 */

import { MealType } from '@/types';

/**
 * Meal types a user can actually put in a plan, in day order.
 * QUESTO ARRAY È ANCHE L'ORDINE CANONICO delle portate nella giornata:
 * sortMealTypes() ordina per indice in questo array. Non riordinarlo
 * senza una decisione di prodotto.
 *
 * WHY A SUBSET:
 * MealType carries nine values, but `primo`/`secondo`/`contorno`/`dolce` are
 * leftovers from an earlier course-based model and are unreachable from the UI.
 * They stay in the type (and in MEAL_LABELS) so legacy plans still render, but
 * they must not be offered as new choices.
 */
export const SELECTABLE_MEAL_TYPES: MealType[] = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'];

/**
 * Italian display labels for every meal type, legacy values included.
 *
 * Labels are kept short because they are rendered as row headers in the weekly
 * grid, where the column width is the binding constraint on small screens.
 */
export const MEAL_LABELS: Record<MealType, string> = {
  colazione: 'Colazione',
  spuntino: 'Spuntino',
  pranzo: 'Pranzo',
  merenda: 'Merenda',
  cena: 'Cena',
  primo: 'Primo',
  secondo: 'Secondo',
  contorno: 'Contorno',
  dolce: 'Dolce',
};

/**
 * Ordina le portate nell'ordine canonico della giornata (l'indice in
 * SELECTABLE_MEAL_TYPES). I tipi legacy (primo/secondo/contorno/dolce),
 * assenti da SELECTABLE_MEAL_TYPES, vanno in coda mantenendo il loro
 * ordine relativo (Array.prototype.sort è stabile per spec ES2019+).
 *
 * Ritorna SEMPRE un nuovo array: gli input tipici sono state React o
 * campi del piano corrente, che non vanno mai mutati in place.
 *
 * Si usa in scrittura (addMealType, toggleMealType) E in lettura
 * (WeeklyCalendarGrid, PlanStructureCard, MealPlanSetupForm): la lettura
 * auto-corregge i piani Firestore salvati prima del fix, senza migrazione.
 */
export function sortMealTypes(types: MealType[]): MealType[] {
  return [...types].sort((a, b) => {
    const ia = SELECTABLE_MEAL_TYPES.indexOf(a);
    const ib = SELECTABLE_MEAL_TYPES.indexOf(b);
    if (ia === -1 && ib === -1) return 0; // entrambi legacy: ordine stabile
    if (ia === -1) return 1;              // solo a legacy: in coda
    if (ib === -1) return -1;             // solo b legacy: in coda
    return ia - ib;
  });
}
