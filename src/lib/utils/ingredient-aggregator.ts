import { MealPlan, MealType, Recipe, ShoppingItem } from '@/types';

export interface IngredientContribution {
  name: string;
  quantity: string;
  section: string | null;
  recipeTitle: string;
  dayIndex: number;
  mealType: MealType;
}

/**
 * Builds a flat list of ingredient contributions from all filled slots in a MealPlan.
 *
 * For existingRecipeId slots the recipe must be present in recipesById (batch-fetched
 * by the caller). For newRecipe slots the ingredients are read from the embedded
 * ParsedRecipe directly. Empty slots and slots missing from recipesById are skipped.
 */
export function buildContributions(
  plan: MealPlan,
  recipesById: Map<string, Recipe>
): IngredientContribution[] {
  const contributions: IngredientContribution[] = [];

  for (const slot of plan.slots) {
    let ingredients: Recipe['ingredients'] = [];
    let recipeTitle = slot.recipeTitle ?? '';

    if (slot.existingRecipeId) {
      const recipe = recipesById.get(slot.existingRecipeId);
      if (!recipe) continue;
      ingredients = recipe.ingredients;
      recipeTitle = recipe.title;
    } else if (slot.newRecipe) {
      ingredients = slot.newRecipe.ingredients;
      recipeTitle = slot.newRecipe.title;
    } else {
      continue;
    }

    for (const ing of ingredients) {
      contributions.push({
        name: ing.name,
        quantity: ing.quantity,
        section: ing.section ?? null,
        recipeTitle,
        dayIndex: slot.dayIndex,
        mealType: slot.mealType,
      });
    }
  }

  return contributions;
}

/**
 * Aggregates contributions into deduplicated ShoppingItem[].
 *
 * GROUPING KEY: lowercase(trim(name)) — intentionally no fuzzy matching.
 * "pomodori pelati" and "pomodori" stay separate; unexpected merges confuse
 * users more than duplicates.
 *
 * QUANTITY STRATEGY (two-track):
 * 1. Numeric same-unit sum: if all contributions parse to a number with the same
 *    unit string (e.g., all "g"), their values are summed and reformatted.
 * 2. Concatenation fallback: any non-summable or mixed-unit combination joins
 *    with " + " so the result is always human-readable.
 *
 * SECTION: first encountered section value for the group.
 */
export function aggregateIngredients(
  contributions: IngredientContribution[]
): ShoppingItem[] {
  const groups = new Map<
    string,
    {
      name: string;
      section: string | null;
      quantities: string[];
      sources: ShoppingItem['recipeSource'];
    }
  >();

  for (const c of contributions) {
    const key = c.name.toLowerCase().trim();
    const existing = groups.get(key);

    if (existing) {
      existing.quantities.push(c.quantity);
      // Only add a source entry if this (recipeTitle, dayIndex, mealType) combo is new.
      const alreadyListed = existing.sources.some(
        s =>
          s.recipeTitle === c.recipeTitle &&
          s.dayIndex === c.dayIndex &&
          s.mealType === c.mealType
      );
      if (!alreadyListed) {
        existing.sources.push({
          recipeTitle: c.recipeTitle,
          dayIndex: c.dayIndex,
          mealType: c.mealType,
        });
      }
    } else {
      groups.set(key, {
        name: c.name,
        section: c.section,
        quantities: [c.quantity],
        sources: [{ recipeTitle: c.recipeTitle, dayIndex: c.dayIndex, mealType: c.mealType }],
      });
    }
  }

  const items: ShoppingItem[] = [];

  for (const [key, group] of groups) {
    const isMerged = group.quantities.length > 1;
    const displayQuantity = isMerged
      ? mergeQuantities(group.quantities)
      : (group.quantities[0] ?? '');

    items.push({
      id: toSlug(key),
      name: group.name,
      displayQuantity,
      section: group.section,
      recipeSource: group.sources,
      isMerged,
      isCustom: false,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Slug for stable IDs: lowercase, no accents replaced (Italian names can have
 * accented chars that are valid slugs), non-word chars replaced with hyphens.
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-àèéìòùáíóú]/g, '');
}

/**
 * Attempts to sum all quantities when they all share the same numeric unit.
 * Falls back to " + " concatenation when values differ in unit or are non-numeric.
 *
 * NON-SCALABLE QUANTITIES: strings matching common Italian non-numeric forms
 * ("q.b.", "a piacere", etc.) block numeric summation and are passed through
 * in the concatenated fallback.
 */
function mergeQuantities(quantities: string[]): string {
  const parsed = quantities.map(parseQuantity);

  // All must parse successfully with the same unit.
  const firstUnit = parsed[0]?.unit ?? null;
  const allSameUnit =
    firstUnit !== null &&
    parsed.every(p => p !== null && p.unit === firstUnit);

  if (allSameUnit) {
    const total = parsed.reduce((sum, p) => sum + p!.value, 0);
    const formatted = formatItalianNumber(total);
    return firstUnit ? `${formatted} ${firstUnit}` : formatted;
  }

  // Fallback: join distinct non-empty values with " + ".
  const distinct = [...new Set(quantities.filter(q => q.trim()))];
  return distinct.join(' + ');
}

interface ParsedQuantity {
  value: number;
  unit: string;
}

const NON_SCALABLE_RE = /q\.b\.|quanto\s+basta|un\s+pizzico|una\s+presa|a\s+piacere/i;

/** Parses "200 g", "1,5 kg", "3" into { value, unit }. Returns null for non-numeric forms. */
function parseQuantity(quantity: string): ParsedQuantity | null {
  const q = quantity.trim();
  if (!q || NON_SCALABLE_RE.test(q)) return null;

  // Normalise Italian decimal comma → period for parseFloat.
  const normalised = q.replace(/(\d)\s*,\s*(\d)/g, '$1.$2');

  // Simple number optionally followed by a unit: "200 g", "1.5 kg", "3"
  const match = normalised.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2].trim();

  if (isNaN(value)) return null;
  return { value, unit };
}

/** Formats a number using Italian decimal comma notation. */
function formatItalianNumber(value: number): string {
  if (value % 1 === 0) return String(value);
  const rounded = Math.round(value * 100) / 100;
  return rounded.toString().replace('.', ',');
}
