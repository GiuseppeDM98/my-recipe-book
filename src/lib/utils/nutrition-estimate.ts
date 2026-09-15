import { MacrosPerServing } from '@/types';

/** Below: garnish or error. Above: almost certainly an undivided total. */
export const MIN_PLAUSIBLE_KCAL = 20;
export const MAX_PLAUSIBLE_KCAL = 3000;

/** Plausible weight of ONE finished serving: under 30 g it's a garnish,
 *  over 1.5 kg it's almost certainly the weight of the whole undivided recipe. */
export const MIN_PLAUSIBLE_SERVING_WEIGHT_G = 30;
export const MAX_PLAUSIBLE_SERVING_WEIGHT_G = 1500;

/** No per-serving macro plausibly exceeds this ceiling. */
export const MAX_PLAUSIBLE_MACRO_G = 300;

/** Tolerance of the Atwater check 4p+4c+9f ≈ kcal: ±30%.
 *  Covers fiber, alcohol, rounding and diverging nutrition tables;
 *  beyond it, macros are inconsistent with kcal and get discarded (kcal preserved). */
export const MACRO_KCAL_TOLERANCE = 0.3;

export interface DerivedNutrition {
  caloriesPerServing: number | null;
  servingWeightGrams: number | null;
  macrosPerServing: MacrosPerServing | null;
}

/**
 * Derives per-serving values from the model's raw payload (totals) and applies
 * the plausibility clamps. Each field degrades to null independently; macros
 * require plausible kcal because without kcal the consistency check is impossible.
 */
export function deriveNutritionPerServing(raw: unknown, servings: number): DerivedNutrition {
  const estimate = (raw ?? {}) as Record<string, unknown>;

  // kcal: identical to today (the model divides, the server validates 20-3000)
  const rawCalories = estimate.caloriesPerServing;
  const caloriesPerServing =
    typeof rawCalories === 'number' &&
    Number.isFinite(rawCalories) &&
    rawCalories >= MIN_PLAUSIBLE_KCAL &&
    rawCalories <= MAX_PLAUSIBLE_KCAL
      ? Math.round(rawCalories)
      : null;

  // Weight: the model gives the total, the server divides and validates the per-serving value
  let servingWeightGrams: number | null = null;
  const rawWeight = estimate.totalWeightGrams;
  if (typeof rawWeight === 'number' && Number.isFinite(rawWeight)) {
    const perServing = rawWeight / servings;
    if (perServing >= MIN_PLAUSIBLE_SERVING_WEIGHT_G && perServing <= MAX_PLAUSIBLE_SERVING_WEIGHT_G) {
      servingWeightGrams = Math.round(perServing);
    }
  }

  // Macros: total → per serving, then bound [0, 300] and Atwater check vs kcal.
  // If the check fails: macros null, kcal preserved (the likeliest error is in the macros).
  let macrosPerServing: MacrosPerServing | null = null;
  const rawMacros = estimate.totalMacros as Record<string, unknown> | null | undefined;
  if (caloriesPerServing !== null && rawMacros && typeof rawMacros === 'object') {
    const per = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) ? v / servings : null;
    const p = per(rawMacros.proteinGrams);
    const c = per(rawMacros.carbsGrams);
    const f = per(rawMacros.fatGrams);
    const inBounds = (v: number | null): v is number =>
      v !== null && v >= 0 && v <= MAX_PLAUSIBLE_MACRO_G;

    if (inBounds(p) && inBounds(c) && inBounds(f)) {
      const atwaterKcal = 4 * p + 4 * c + 9 * f;
      if (Math.abs(atwaterKcal - caloriesPerServing) <= MACRO_KCAL_TOLERANCE * caloriesPerServing) {
        macrosPerServing = {
          proteinGrams: Math.round(p),
          carbsGrams: Math.round(c),
          fatGrams: Math.round(f),
        };
      }
    }
  }

  return { caloriesPerServing, servingWeightGrams, macrosPerServing };
}
