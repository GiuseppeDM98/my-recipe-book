import { MealPlan, MealSlot, MealType, Recipe, ShoppingItem } from '@/types';
import { scaleQuantity } from '@/lib/utils/ingredient-scaler';

export interface IngredientContribution {
  name: string;
  quantity: string;
  section: string | null;
  recipeTitle: string;
  dayIndex: number;
  mealType: MealType;
}

/**
 * Servings assumed for a recipe that does not declare them. Same fallback as
 * cooking mode (`recipe.servings || 4`), so the planner and the stove agree on
 * what "the recipe as written" feeds.
 */
const DEFAULT_RECIPE_SERVINGS = 4;

/** Ingredients and servings behind a slot's base meal, whichever source carries them. */
interface ResolvedBaseRecipe {
  title: string;
  ingredients: Recipe['ingredients'];
  servings: number;
}

/**
 * Resolves the base meal of a slot: a saved recipe by id first, then the inline
 * ParsedRecipe carried by legacy AI-generated plans. Returns null for an empty
 * slot and for a recipe deleted from the cookbook (id no longer in recipesById).
 */
function resolveBaseRecipe(
  slot: MealSlot,
  recipesById: Map<string, Recipe>
): ResolvedBaseRecipe | null {
  const source = slot.existingRecipeId
    ? recipesById.get(slot.existingRecipeId)
    : slot.newRecipe;
  if (!source) return null;

  return {
    title: source.title,
    ingredients: source.ingredients,
    servings: source.servings || DEFAULT_RECIPE_SERVINGS,
  };
}

/**
 * Ids of every cookbook recipe buildContributions() will look up: base meals AND
 * variants. Lives next to buildContributions because it is the other half of its
 * contract — a variant recipe left out of the batch fetch is silently skipped as
 * "deleted", and the person it feeds just vanishes from the shopping list.
 *
 * Duplicates are left in: getRecipesByIds() already deduplicates.
 */
export function collectPlanRecipeIds(plan: MealPlan): string[] {
  return plan.slots.flatMap(slot => [
    ...(slot.existingRecipeId ? [slot.existingRecipeId] : []),
    ...(slot.variants ?? [])
      .map(variant => variant.existingRecipeId)
      .filter((id): id is string => !!id),
  ]);
}

/**
 * Builds a flat list of ingredient contributions from all filled slots in a MealPlan.
 *
 * For existingRecipeId slots the recipe must be present in recipesById (batch-fetched
 * by the caller, variants' recipes included). For newRecipe slots the ingredients are
 * read from the embedded ParsedRecipe directly. Empty slots and recipes missing from
 * recipesById are skipped.
 *
 * SCALING BY PEOPLE: each contribution is scaled by people / recipe servings through
 * scaleQuantity(), which already owns the parsing of fractions, ranges and
 * non-scalable strings ("q.b.") — nothing is re-parsed here, and the quantity reaches
 * aggregateIngredients() already scaled, so the merge logic is unaware of people.
 *
 * LEGACY INVARIANT: a slot with `servingsPlanned == null` (every plan saved before the
 * family model) copies quantities AS-IS, byte for byte. It must not go through
 * scaleQuantity() at all: even at factor 1 a different code path could reformat
 * "1/2 tazza", and a shopping list that changes on its own after a deploy is a bug the
 * user cannot explain.
 */
export function buildContributions(
  plan: MealPlan,
  recipesById: Map<string, Recipe>
): IngredientContribution[] {
  const contributions: IngredientContribution[] = [];

  for (const slot of plan.slots) {
    // Corrupt variants (no recipe, no members) are ignored BEFORE counting people,
    // otherwise they would take servings away from the base and feed nobody.
    const variants = (slot.variants ?? []).filter(
      variant => variant.existingRecipeId && variant.memberIds.length > 0
    );
    const variantPersons = variants.reduce((sum, variant) => sum + variant.memberIds.length, 0);

    // Base meal. null = legacy slot, quantities as-is; 0 = variants cover everyone,
    // the base recipe is not cooked and must not enter the list.
    const basePersons =
      slot.servingsPlanned == null ? null : Math.max(0, slot.servingsPlanned - variantPersons);
    const base = resolveBaseRecipe(slot, recipesById);

    if (base && basePersons !== 0) {
      for (const ing of base.ingredients) {
        contributions.push({
          name: ing.name,
          quantity:
            basePersons === null
              ? ing.quantity
              : scaleQuantity(ing.quantity, base.servings, basePersons),
          section: ing.section ?? null,
          recipeTitle: base.title,
          dayIndex: slot.dayIndex,
          mealType: slot.mealType,
        });
      }
    }

    // Variants always scale, even on a slot without servingsPlanned (a state the UI
    // cannot produce — setSlotVariants sets the default in the same write — but a
    // variant has no "as written" meaning: it is by definition a meal for N people).
    for (const variant of variants) {
      const variantRecipe = recipesById.get(variant.existingRecipeId!);
      // Deleted recipe: skipped like a base slot. Its people stay subtracted from the
      // base above — they are still planned on something else, not on the base meal.
      if (!variantRecipe) continue;

      for (const ing of variantRecipe.ingredients) {
        contributions.push({
          name: ing.name,
          quantity: scaleQuantity(
            ing.quantity,
            variantRecipe.servings || DEFAULT_RECIPE_SERVINGS,
            variant.memberIds.length
          ),
          section: ing.section ?? null,
          recipeTitle: variantRecipe.title,
          dayIndex: slot.dayIndex,
          mealType: slot.mealType,
        });
      }
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
 *
 * TRIVIAL INGREDIENTS (tap water, ice — see TRIVIAL_INGREDIENT_NAMES) are
 * dropped here rather than in buildContributions: buildContributions describes
 * what the plan contains, this function decides what is worth shopping for.
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
    // A filtered item's id may still sit in the plan's shoppingCheckedIds (it
    // was checked before the filter existed): that entry is inert, exactly like
    // the ids left behind when a recipe leaves the plan. No cleanup needed.
    if (isTrivialIngredientKey(key)) continue;
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
// Name normalisation and quantity helpers
//
// Exported because ingredient-matching.ts (pantry matching, Spec D) and the
// shopping-list department grouping (Spec E) reuse exactly the same rules:
// one definition of "same ingredient" and "same quantity" for the whole app.
// Dependency direction is matching → aggregator only (never the reverse), so
// anything the aggregator itself needs — including the trivial-ingredient
// list — has to live here, not in ingredient-matching.ts.
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
 *
 * WARNING: PantryItem.aliases stores keys produced by this function. Changing
 * the normalisation silently orphans every alias the user has confirmed.
 */
export function canonicalIngredientKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (à → a, é → e …)
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
export function singularizeWord(word: string): string {
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

/**
 * ONLY things nobody buys at the supermarket. Fixed, curated, closed list.
 * DO NOT add salt/oil/pepper/sugar: they get bought, the pantry match handles
 * them. Comparison is by exact equality of the canonical key:
 * "acqua di rose" or "acqua di mare" do NOT match and stay in the list (correct).
 *
 * "acqua frizzante" is here on purpose: in recipes it is a batter/dough
 * component, not a drink to buy (product decision, don't reopen it).
 */
const TRIVIAL_INGREDIENT_NAMES = [
  'acqua',
  'acqua fredda',
  'acqua calda',
  'acqua tiepida',
  'acqua bollente',
  'acqua frizzante',
  'acqua gassata',
  'acqua naturale',
  'acqua a temperatura ambiente',
  'acqua di cottura',
  'acqua di cottura della pasta',
  'acqua della pasta',
  'ghiaccio',
  'cubetti di ghiaccio',
  'ghiaccio tritato',
];

// Keys derived once through the same normalisation as everything else, so the
// readable list above never has to be written in stemmed form.
const TRIVIAL_KEYS = new Set(TRIVIAL_INGREDIENT_NAMES.map(name => canonicalIngredientKey(name)));

/** True when the ingredient is something nobody shops for (tap water, ice). */
export function isTrivialIngredient(name: string): boolean {
  return TRIVIAL_KEYS.has(canonicalIngredientKey(name));
}

/** Variant for callers that already hold the canonical key (aggregator). */
export function isTrivialIngredientKey(key: string): boolean {
  return TRIVIAL_KEYS.has(key);
}

export type QuantityDimension = 'mass' | 'volume' | 'count';

export interface ParsedQuantity {
  /** Value expressed in the dimension's base unit (g for mass, ml for volume). */
  baseValue: number;
  dimension: QuantityDimension;
  /** Normalised (lowercased) unit token; used to match non-convertible units. */
  unit: string;
}

export const NON_SCALABLE_RE = /q\.b\.|quanto\s+basta|un\s+pizzico|una\s+presa|a\s+piacere/i;

/**
 * Maps Italian unit spellings to a base unit and conversion factor.
 * Mass base = grams, volume base = millilitres.
 */
export const UNIT_ALIASES: Record<string, { dimension: 'mass' | 'volume'; factor: number }> = {
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
export function parseQuantity(quantity: string): ParsedQuantity | null {
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
export function formatQuantity(baseValue: number, dimension: 'mass' | 'volume'): string {
  if (baseValue >= 1000) {
    const major = dimension === 'mass' ? 'kg' : 'l';
    return `${formatItalianNumber(baseValue / 1000)} ${major}`;
  }
  const minor = dimension === 'mass' ? 'g' : 'ml';
  return `${formatItalianNumber(baseValue)} ${minor}`;
}

/** Formats a number using Italian decimal comma notation. */
export function formatItalianNumber(value: number): string {
  if (value % 1 === 0) return String(value);
  const rounded = Math.round(value * 100) / 100;
  return rounded.toString().replace('.', ',');
}
