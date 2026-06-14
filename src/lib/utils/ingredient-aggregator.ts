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
 * GROUPING KEY: canonicalIngredientKey(name) — accent-insensitive and tolerant
 * of regular Italian singular/plural forms (pomodoro/pomodori, fungo/funghi).
 * The normalisation is deliberately conservative: ambiguous or multi-word names
 * keep their extra tokens, so "pomodori" and "pomodori pelati" still stay
 * separate. Not merging is the safe failure mode; a wrong merge is worse.
 *
 * QUANTITY STRATEGY (two-track):
 * 1. Numeric same-dimension sum: contributions that parse to a mass (g/kg/etti…)
 *    or volume (ml/l/cl…) are converted to a base unit, summed, and reformatted
 *    in the most readable unit (e.g. 200 g + 1 kg → 1,2 kg). Non-convertible
 *    units (cucchiai, pezzi…) sum only when the unit token matches exactly.
 * 2. Concatenation fallback: any non-summable or mixed-dimension combination
 *    joins with " + " so the result is always human-readable.
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
    const key = canonicalIngredientKey(c.name);
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
 * Builds the grouping key for an ingredient name: accent-insensitive and
 * tolerant of regular Italian singular/plural forms.
 *
 * Each whitespace-separated word is stemmed independently, so multi-word names
 * keep their distinguishing tokens (e.g. "pomodori pelati" never collapses onto
 * "pomodori"). The original display name is preserved separately by the caller.
 */
function canonicalIngredientKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics (à → a, é → e …)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(singularizeWord)
    .join(' ');
}

/**
 * Reduces a single Italian word to a singular/plural-agnostic stem.
 *
 * Conservative by design — it handles the regular masculine (-o/-i), feminine
 * (-a/-e), velar (-co/-chi, -ga/-ghe) and -io patterns that cover most kitchen
 * ingredients, and leaves anything it cannot confidently normalise untouched so
 * unrelated words are not merged.
 */
function singularizeWord(word: string): string {
  if (word.length < 4) return word;
  let stem = word;

  // Velar plurals insert an "h" (fungo→funghi, pesca→pesche). Normalise back to
  // the base consonant before the trailing-vowel strip below.
  if (/(chi|che)$/.test(stem)) {
    stem = stem.slice(0, -3) + 'c';
  } else if (/(ghi|ghe)$/.test(stem)) {
    stem = stem.slice(0, -3) + 'g';
  } else if (stem.endsWith('io')) {
    // -io singulars share the plural's stem (olio/oli, aglio/agli).
    stem = stem.slice(0, -2) + 'i';
  }

  // Drop a single trailing vowel so regular -o/-i and -a/-e pairs collapse to
  // the same stem (pomodoro/pomodori → "pomodor", mela/mele → "mel").
  if (stem.length >= 4 && /[aeiou]$/.test(stem)) {
    stem = stem.slice(0, -1);
  }

  return stem;
}

type QuantityDimension = 'mass' | 'volume' | 'count';

interface ParsedQuantity {
  /** Value expressed in the dimension's base unit (g for mass, ml for volume). */
  baseValue: number;
  dimension: QuantityDimension;
  /** Normalised (lowercased) unit token; used to match non-convertible units. */
  unit: string;
}

const NON_SCALABLE_RE = /q\.b\.|quanto\s+basta|un\s+pizzico|una\s+presa|a\s+piacere/i;

/**
 * Maps Italian unit spellings to a base unit and conversion factor.
 * Mass base = grams, volume base = millilitres.
 */
const UNIT_ALIASES: Record<string, { dimension: 'mass' | 'volume'; factor: number }> = {
  mg: { dimension: 'mass', factor: 0.001 },
  g: { dimension: 'mass', factor: 1 },
  gr: { dimension: 'mass', factor: 1 },
  grammo: { dimension: 'mass', factor: 1 },
  grammi: { dimension: 'mass', factor: 1 },
  hg: { dimension: 'mass', factor: 100 },
  etto: { dimension: 'mass', factor: 100 },
  etti: { dimension: 'mass', factor: 100 },
  ettogrammo: { dimension: 'mass', factor: 100 },
  ettogrammi: { dimension: 'mass', factor: 100 },
  kg: { dimension: 'mass', factor: 1000 },
  kilo: { dimension: 'mass', factor: 1000 },
  chilo: { dimension: 'mass', factor: 1000 },
  chili: { dimension: 'mass', factor: 1000 },
  chilogrammo: { dimension: 'mass', factor: 1000 },
  chilogrammi: { dimension: 'mass', factor: 1000 },
  ml: { dimension: 'volume', factor: 1 },
  millilitro: { dimension: 'volume', factor: 1 },
  millilitri: { dimension: 'volume', factor: 1 },
  cl: { dimension: 'volume', factor: 10 },
  dl: { dimension: 'volume', factor: 100 },
  l: { dimension: 'volume', factor: 1000 },
  lt: { dimension: 'volume', factor: 1000 },
  litro: { dimension: 'volume', factor: 1000 },
  litri: { dimension: 'volume', factor: 1000 },
};

/**
 * Sums quantities that share a convertible dimension (mass or volume) or an
 * identical non-convertible unit token. Falls back to " + " concatenation for
 * mixed or non-numeric combinations so the result is always human-readable.
 *
 * NON-SCALABLE QUANTITIES ("q.b.", "a piacere"…) never parse, so they always
 * land in the concatenated fallback.
 */
function mergeQuantities(quantities: string[]): string {
  const parsed = quantities.map(parseQuantity);

  if (parsed.every(p => p !== null)) {
    const valid = parsed as ParsedQuantity[];
    const dimensions = new Set(valid.map(p => p.dimension));

    if (dimensions.size === 1) {
      const dimension = valid[0].dimension;

      // Mass/volume: sum in the base unit and reformat in the clearest unit.
      if (dimension === 'mass' || dimension === 'volume') {
        const totalBase = valid.reduce((sum, p) => sum + p.baseValue, 0);
        return formatQuantity(totalBase, dimension);
      }

      // Count/other: only sum when the unit token is identical (e.g. cucchiai).
      const units = new Set(valid.map(p => p.unit));
      if (units.size === 1) {
        const total = valid.reduce((sum, p) => sum + p.baseValue, 0);
        const formatted = formatItalianNumber(total);
        return valid[0].unit ? `${formatted} ${valid[0].unit}` : formatted;
      }
    }
  }

  // Fallback: join distinct non-empty values with " + ".
  const distinct = [...new Set(quantities.filter(q => q.trim()))];
  return distinct.join(' + ');
}

/**
 * Parses "200 g", "1,5 kg", "3" into a ParsedQuantity.
 *
 * Recognised mass/volume units are converted to a base unit; unrecognised or
 * missing units are treated as a non-convertible "count" so they only sum with
 * an identical token. Returns null for non-numeric / non-scalable forms.
 */
function parseQuantity(quantity: string): ParsedQuantity | null {
  const q = quantity.trim();
  if (!q || NON_SCALABLE_RE.test(q)) return null;

  // Normalise Italian decimal comma → period for parseFloat.
  const normalised = q.replace(/(\d)\s*,\s*(\d)/g, '$1.$2');

  // Simple number optionally followed by a unit: "200 g", "1.5 kg", "3"
  const match = normalised.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (isNaN(value)) return null;

  const unit = match[2].trim().toLowerCase();
  const alias = UNIT_ALIASES[unit];
  if (alias) {
    return { baseValue: value * alias.factor, dimension: alias.dimension, unit };
  }

  return { baseValue: value, dimension: 'count', unit };
}

/** Formats a summed mass/volume base value in the clearest unit (g↔kg, ml↔l). */
function formatQuantity(baseValue: number, dimension: 'mass' | 'volume'): string {
  if (baseValue >= 1000) {
    const major = dimension === 'mass' ? 'kg' : 'l';
    return `${formatItalianNumber(baseValue / 1000)} ${major}`;
  }
  const minor = dimension === 'mass' ? 'g' : 'ml';
  return `${formatItalianNumber(baseValue)} ${minor}`;
}

/** Formats a number using Italian decimal comma notation. */
function formatItalianNumber(value: number): string {
  if (value % 1 === 0) return String(value);
  const rounded = Math.round(value * 100) / 100;
  return rounded.toString().replace('.', ',');
}
