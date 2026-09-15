import type { Ingredient } from '@/types';
import type { PantryItem } from '@/types/pantry';
import {
  comparePantryStock,
  convertBaseToPantryUnit,
  isTrivialIngredient,
  matchIngredientToPantry,
} from './ingredient-matching';
import type { PantryIncomparableReason } from './ingredient-matching';
import { scaleQuantity } from './ingredient-scaler';

/**
 * End-of-cooking pantry deduction ("Termina cottura" → "Scala la dispensa").
 *
 * Pure: computes what to PROPOSE. Nothing is written until the user confirms
 * the dialog, and only confident matches start selected — a suggestion needs
 * an explicit tick, and incomparable quantities are shown but never deducted.
 */

export type PantryDeductionRow =
  | {
      kind: 'proposed';
      pantryItem: PantryItem;
      /** Several ingredients on the same entry are merged: names joined with ", ". */
      ingredientName: string;
      /** For display ("300 g"); merged quantities joined with " + ". */
      scaledQuantity: string;
      /** In the pantry entry's unit, already clamped to pantryItem.qty. */
      deductQty: number;
      confidence: 'exact' | 'alias';
    }
  | {
      kind: 'excluded';
      pantryItem: PantryItem;
      ingredientName: string;
      scaledQuantity: string;
      reason: PantryIncomparableReason;
    }
  | {
      kind: 'suggestion';
      /** The best fuzzy candidate only. */
      candidate: PantryItem;
      ingredientName: string;
      scaledQuantity: string;
    };

/**
 * Builds the deduction proposal for a finished recipe.
 *
 * Quantities are first scaled to the servings actually cooked (scaleQuantity),
 * then compared with the matched entry's stock. Trivial ingredients are skipped;
 * ingredients with no match and no candidate produce no row. Rows keep the
 * recipe's ingredient order (a merged row stays where its first ingredient is).
 */
export function computePantryDeductions(
  ingredients: Ingredient[],
  originalServings: number,
  cookedServings: number,
  pantryItems: PantryItem[]
): PantryDeductionRow[] {
  const rows: PantryDeductionRow[] = [];
  // Merge state per pantry entry: index of its 'proposed' row, summed need in base units.
  const proposedByItemId = new Map<string, { index: number; requiredBase: number; names: Set<string> }>();

  for (const ingredient of ingredients) {
    if (isTrivialIngredient(ingredient.name)) continue;

    const ingredientName = ingredient.name;
    const scaledQuantity = ingredient.quantity
      ? scaleQuantity(ingredient.quantity, originalServings, cookedServings)
      : '';
    const match = matchIngredientToPantry(ingredientName, pantryItems);

    if (match.item === null) {
      // An empty candidate could never be deducted: don't propose it.
      const candidate = match.suggestions.find(item => item.qty > 0);
      if (candidate) rows.push({ kind: 'suggestion', candidate, ingredientName, scaledQuantity });
      continue;
    }

    const pantryItem = match.item;
    const stock = comparePantryStock(scaledQuantity, pantryItem);
    if (!stock.comparable) {
      rows.push({ kind: 'excluded', pantryItem, ingredientName, scaledQuantity, reason: stock.reason });
      continue;
    }

    const merged = proposedByItemId.get(pantryItem.id);
    if (!merged) {
      proposedByItemId.set(pantryItem.id, {
        index: rows.length,
        requiredBase: stock.requiredBase,
        names: new Set([ingredientName]),
      });
      rows.push({
        kind: 'proposed',
        pantryItem,
        ingredientName,
        scaledQuantity,
        deductQty: clampedDeductQty(stock.requiredBase, pantryItem),
        confidence: match.confidence,
      });
      continue;
    }

    // Sum the needs BEFORE clamping: two sections using 300 g each from a
    // 500 g pack must propose 500, not 300 twice.
    merged.requiredBase += stock.requiredBase;
    merged.names.add(ingredientName);
    const previous = rows[merged.index];
    if (previous.kind === 'proposed') {
      rows[merged.index] = {
        ...previous,
        ingredientName: [...merged.names].join(', '),
        scaledQuantity: `${previous.scaledQuantity} + ${scaledQuantity}`,
        deductQty: clampedDeductQty(merged.requiredBase, pantryItem),
      };
    }
  }

  return rows;
}

function clampedDeductQty(requiredBase: number, item: PantryItem): number {
  return Math.min(convertBaseToPantryUnit(requiredBase, item), item.qty);
}

/**
 * Deduction to prefill for a pantry entry, or null when the scaled quantity
 * can't be compared with that entry (used for suggestions, whose entry is only
 * known once the user confirms it).
 */
export function proposeDeductQty(scaledQuantity: string, item: PantryItem): number | null {
  const stock = comparePantryStock(scaledQuantity, item);
  return stock.comparable ? clampedDeductQty(stock.requiredBase, item) : null;
}

/** What the user confirmed in the dialog, one entry per selected row. */
export interface ConfirmedDeduction {
  pantryItem: PantryItem;
  /** In the entry's unit; 0 = link only, nothing to deduct. */
  deductQty: number;
  /** Set for a confirmed suggestion: save this ingredient as an alias first. */
  aliasIngredientName: string | null;
}

/**
 * Collapses confirmed deductions into one qty update per pantry entry.
 *
 * The new qty is `max(0, qty − total)`: a deduction clamps to zero and never
 * deletes the entry. Entries with nothing to deduct produce no update.
 */
export function buildPantryDeductionUpdates(
  deductions: ConfirmedDeduction[]
): Array<{ itemId: string; qty: number }> {
  const totalsByItemId = new Map<string, { item: PantryItem; total: number }>();

  for (const deduction of deductions) {
    if (deduction.deductQty <= 0) continue;
    const pending = totalsByItemId.get(deduction.pantryItem.id);
    if (pending) {
      pending.total += deduction.deductQty;
    } else {
      totalsByItemId.set(deduction.pantryItem.id, { item: deduction.pantryItem, total: deduction.deductQty });
    }
  }

  return [...totalsByItemId.values()].map(({ item, total }) => ({
    itemId: item.id,
    qty: roundQty(Math.max(0, item.qty - total)),
  }));
}

// Strips float noise (1.25 − 0.3) without rounding away meaningful amounts.
function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}
