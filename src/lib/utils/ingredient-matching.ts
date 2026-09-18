import type { PantryItem } from '@/types/pantry';
import {
  canonicalIngredientKey,
  formatItalianNumber,
  formatQuantity,
  isTrivialIngredient,
  isTrivialIngredientKey,
  parseQuantity,
  UNIT_ALIASES,
} from './ingredient-aggregator';
import type { ParsedQuantity, QuantityDimension } from './ingredient-aggregator';

/**
 * Ingredient ↔ pantry matching engine (Spec D, roadmap cross-spec contract §2).
 *
 * One question answered in one place: "is this recipe/shopping ingredient
 * something the user already has in the pantry, and how much of it?". It is
 * consumed by the shopping list ("Hai già in casa"), the batch check → pantry
 * flow, the end-of-cooking deduction and (Spec E) department classification.
 *
 * PHILOSOPHY — a non-match is the safe failure. A false "already in the pantry"
 * hides something the user needs to buy, which is worse than asking them to buy
 * something they have. So:
 * - automatic matches are only exact canonical keys or user-confirmed aliases;
 * - anything fuzzier is returned as a *suggestion* and never acts on its own;
 * - quantities are compared only within the same dimension (no density table:
 *   "2 pomodori" vs "500 g" is simply not comparable).
 *
 * The quantity/normalisation machinery stays defined in ingredient-aggregator.ts
 * and is re-exported here (dependency direction matching → aggregator only).
 * DO NOT rename the contract exports: Spec E imports them from this module.
 */

export {
  canonicalIngredientKey,
  formatItalianNumber,
  formatQuantity,
  isTrivialIngredient,
  isTrivialIngredientKey,
  parseQuantity,
  UNIT_ALIASES,
};
export type { ParsedQuantity, QuantityDimension };

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export type PantryMatch =
  | { item: PantryItem; confidence: 'exact' | 'alias' }
  | { item: null; suggestions: PantryItem[] };

const MAX_SUGGESTIONS = 3;
// A shared token shorter than this ("uva", "sal") is too generic to justify
// even a suggestion on its own.
const MIN_SHARED_TOKEN_LENGTH = 4;

// Connective words that carry no identity ("farina DI riso"). Written readable
// and stemmed through canonicalIngredientKey, like TRIVIAL_KEYS, because tokens
// are compared after stemming ("della" → "dell").
const STOPWORD_TOKENS = new Set(
  [
    'di', 'd', 'a', 'al', 'all', 'alla', 'allo', 'alle', 'ai', 'agli',
    'con', 'senza', 'per', 'e', 'in', 'da',
    'del', 'dell', 'della', 'dello', 'delle', 'dei', 'degli',
  ].map(word => canonicalIngredientKey(word))
);

/**
 * Finds the pantry entry that corresponds to an ingredient name.
 *
 * Resolution order: exact canonical key → user-confirmed alias → suggestions.
 * When several entries tie at the same level (duplicates in the pantry) the one
 * with the highest qty wins, first in array order on a tie: deterministic, and
 * it shows the most useful stock.
 *
 * @returns the matched item with its confidence, or `item: null` with up to
 *          three fuzzy candidates the UI may propose for manual confirmation.
 */
export function matchIngredientToPantry(
  name: string,
  pantryItems: PantryItem[]
): PantryMatch {
  const key = canonicalIngredientKey(name);
  if (!key) return { item: null, suggestions: [] };

  const exact = pickHighestStock(
    pantryItems.filter(item => canonicalIngredientKey(item.name) === key)
  );
  if (exact) return { item: exact, confidence: 'exact' };

  const alias = pickHighestStock(
    pantryItems.filter(item => (item.aliases ?? []).includes(key))
  );
  if (alias) return { item: alias, confidence: 'alias' };

  return { item: null, suggestions: findSuggestions(key, pantryItems) };
}

function pickHighestStock(candidates: PantryItem[]): PantryItem | null {
  let best: PantryItem | null = null;
  for (const candidate of candidates) {
    if (!best || candidate.qty > best.qty) best = candidate;
  }
  return best;
}

function significantTokens(key: string): Set<string> {
  return new Set(key.split(' ').filter(token => token && !STOPWORD_TOKENS.has(token)));
}

/**
 * Conservative fuzzy candidates: one name's significant tokens must be a
 * PROPER subset of the other's, and the shared part must contain a token of
 * at least MIN_SHARED_TOKEN_LENGTH chars.
 *
 * Tokens compare by exact equality, never by prefix ("sal" ≠ "sals"), and equal
 * token sets are discarded (they almost always coincide with the exact match
 * already tried; the rest stays unsuggested, consistent with the fail-safe).
 * Ordered by fewest extra tokens (most similar first), then alphabetically.
 */
function findSuggestions(key: string, pantryItems: PantryItem[]): PantryItem[] {
  const ingredientTokens = significantTokens(key);
  if (ingredientTokens.size === 0) return [];

  const candidates: Array<{ item: PantryItem; extraTokens: number }> = [];

  for (const item of pantryItems) {
    const itemTokens = significantTokens(canonicalIngredientKey(item.name));
    // Same size can never be a proper subset.
    if (itemTokens.size === 0 || itemTokens.size === ingredientTokens.size) continue;

    const [smaller, larger] =
      ingredientTokens.size < itemTokens.size
        ? [ingredientTokens, itemTokens]
        : [itemTokens, ingredientTokens];

    const smallerTokens = [...smaller];
    if (!smallerTokens.every(token => larger.has(token))) continue;
    // The intersection IS the smaller set here.
    if (!smallerTokens.some(token => token.length >= MIN_SHARED_TOKEN_LENGTH)) continue;

    candidates.push({ item, extraTokens: larger.size - smaller.size });
  }

  return candidates
    .sort(
      (a, b) =>
        a.extraTokens - b.extraTokens || a.item.name.localeCompare(b.item.name, 'it')
    )
    .slice(0, MAX_SUGGESTIONS)
    .map(candidate => candidate.item);
}

// ---------------------------------------------------------------------------
// Stock comparison
// ---------------------------------------------------------------------------

export type PantryStockComparison =
  | {
      comparable: true;
      /** availableBase >= requiredBase && availableBase > 0 */
      sufficient: boolean;
      /** In the dimension's base unit (g, ml, or the raw count). */
      requiredBase: number;
      availableBase: number;
      dimension: QuantityDimension;
    }
  | { comparable: false; reason: PantryIncomparableReason };

export type PantryIncomparableReason =
  | 'unparsable'
  | 'dimension-mismatch'
  | 'unit-mismatch'
  | 'empty';

// A bare number in a recipe ("2 uova") and the pantry's "pz" mean the same count.
const PIECE_COUNT_TOKENS = new Set(['', 'pz', 'pezzo', 'pezzi']);

/**
 * Converts a pantry entry's qty + unit into a ParsedQuantity.
 *
 * The unit is lowercased before the alias lookup (the pantry vocabulary uses an
 * uppercase 'L'); units outside UNIT_ALIASES (pz, vasetti, mazzo, testa) become
 * a 'count' keyed by their token.
 */
export function parsePantryQty(item: PantryItem): ParsedQuantity {
  const unit = item.unit.trim().toLowerCase();
  const alias = UNIT_ALIASES[unit];
  if (alias) {
    return { baseValue: item.qty * alias.factor, dimension: alias.dimension, unit };
  }
  return { baseValue: item.qty, dimension: 'count', unit };
}

/**
 * Compares the quantity an ingredient needs against a pantry entry's stock.
 *
 * Not comparable when: the stock is zero ('empty', checked first so an empty
 * shelf never produces a badge), the quantity is a " + " concatenation or does
 * not parse ('unparsable'), the dimensions differ, or two count units differ
 * beyond the piece-count equivalence ('unit-mismatch').
 */
export function comparePantryStock(
  ingredientQuantity: string,
  item: PantryItem
): PantryStockComparison {
  if (item.qty <= 0) return { comparable: false, reason: 'empty' };

  // A concatenated displayQuantity ("200 g + q.b.") is by definition not summable.
  if (ingredientQuantity.includes(' + ')) return { comparable: false, reason: 'unparsable' };

  const required = parseQuantity(ingredientQuantity);
  if (!required) return { comparable: false, reason: 'unparsable' };

  const available = parsePantryQty(item);
  if (required.dimension !== available.dimension) {
    return { comparable: false, reason: 'dimension-mismatch' };
  }

  if (required.dimension === 'count' && !areSameCountUnit(required.unit, available.unit)) {
    return { comparable: false, reason: 'unit-mismatch' };
  }

  return {
    comparable: true,
    sufficient: available.baseValue >= required.baseValue && available.baseValue > 0,
    requiredBase: required.baseValue,
    availableBase: available.baseValue,
    dimension: required.dimension,
  };
}

/** True for identical count tokens, or two spellings of "pieces" ('', pz, pezzo, pezzi). */
export function areSameCountUnit(a: string, b: string): boolean {
  return a === b || (PIECE_COUNT_TOKENS.has(a) && PIECE_COUNT_TOKENS.has(b));
}

// ---------------------------------------------------------------------------
// Shopping list availability
// ---------------------------------------------------------------------------

/**
 * How a shopping list item relates to the pantry:
 * - 'in-pantry': matched, comparable and the stock covers it → "Hai già in casa";
 * - 'badge': matched with stock, but not comparable or not enough → stays in the
 *   list with an informational "In dispensa: …" caption;
 * - 'suggestion': no match, but fuzzy candidates to propose (never acts alone);
 * - 'none': nothing to say (includes a match whose stock is zero).
 */
export type PantryMatchInfo =
  | { kind: 'in-pantry'; item: PantryItem }
  | {
      kind: 'badge';
      item: PantryItem;
      /**
       * What is still to buy ("50 g") when the units compare but the stock is
       * short; null when the quantities can't be compared.
       */
      missingQuantity: string | null;
    }
  | { kind: 'suggestion'; candidates: PantryItem[] }
  | { kind: 'none' };

/**
 * Classifies one shopping list item (name + needed quantity) against the pantry.
 *
 * Suggestions skip entries with zero stock: the copy shown to the user is
 * "Forse ce l'hai già", which an empty shelf would contradict.
 */
export function classifyPantryAvailability(
  name: string,
  quantity: string,
  pantryItems: PantryItem[]
): PantryMatchInfo {
  const match = matchIngredientToPantry(name, pantryItems);

  if (match.item === null) {
    const candidates = match.suggestions.filter(candidate => candidate.qty > 0);
    return candidates.length > 0 ? { kind: 'suggestion', candidates } : { kind: 'none' };
  }

  const stock = comparePantryStock(quantity, match.item);
  if (stock.comparable) {
    if (stock.sufficient) return { kind: 'in-pantry', item: match.item };
    const missingBase = amountToBuyBase(stock.requiredBase, match.item);
    return {
      kind: 'badge',
      item: match.item,
      missingQuantity: formatBaseAmount(missingBase, stock.dimension, match.item),
    };
  }
  // Zero stock must neither park the item nor show a badge.
  return stock.reason === 'empty'
    ? { kind: 'none' }
    : { kind: 'badge', item: match.item, missingQuantity: null };
}

/**
 * Base amount (g, ml or count) still to buy for `requiredBase` of an ingredient
 * whose units compare with the entry: the shortfall when the stock covers only
 * part of it, the whole amount otherwise (no stock at all, or stock already
 * enough — an item re-included with "Mi serve comunque" is bought in full).
 *
 * Shared by the list badge ("mancano 50 g") and the "Aggiungi alla dispensa"
 * prefill, so the two never disagree on how much the user buys.
 */
export function amountToBuyBase(requiredBase: number, item: PantryItem): number {
  const availableBase = Math.max(0, parsePantryQty(item).baseValue);
  return availableBase > 0 && availableBase < requiredBase
    ? requiredBase - availableBase
    : requiredBase;
}

/** A base-unit amount in readable form: "50 g", "1,2 kg", counts in the entry's unit ("4 pz"). */
export function formatBaseAmount(
  baseValue: number,
  dimension: QuantityDimension,
  item: PantryItem
): string {
  if (dimension === 'count') return `${formatItalianNumber(baseValue)} ${item.unit}`.trim();
  return formatQuantity(baseValue, dimension);
}

/**
 * Converts a base-unit amount (g, ml or count) into the pantry entry's own unit,
 * rounded to one decimal like formatQty() displays it (300 g on a kg entry → 0.3).
 * Callers must have checked the dimensions are comparable first.
 */
export function convertBaseToPantryUnit(baseValue: number, item: PantryItem): number {
  const factor = UNIT_ALIASES[item.unit.trim().toLowerCase()]?.factor ?? 1;
  return roundToOneDecimal(baseValue / factor);
}

export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}
