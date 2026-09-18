import type { PantryBatchOp, PantryItem } from '@/types/pantry';
import {
  amountToBuyBase,
  areSameCountUnit,
  canonicalIngredientKey,
  convertBaseToPantryUnit,
  formatItalianNumber,
  formatQuantity,
  matchIngredientToPantry,
  parsePantryQty,
  parseQuantity,
} from './ingredient-matching';
import type { ParsedQuantity } from './ingredient-matching';
import { formatQty } from './pantry-utils';

/**
 * Checked shopping list items → pantry writes ("Aggiungi alla dispensa").
 *
 * Two pure steps, so the sheet stays a thin editor:
 * 1. buildPantryDraftRows: one editable row per checked item, prefilled from the
 *    list quantity and from the pantry match (increment an existing entry or
 *    create a new one);
 * 2. buildPantryBatchOps: the rows the user kept → atomic batch operations.
 */

/**
 * Slug for "no better category". Not in PANTRY_CATEGORIES yet: the pantry page
 * already groups unknown slugs under "Altro", and Spec E formalizes it. Chosen
 * over a guessed default because a wrong category is silently wrong.
 */
export const FALLBACK_PANTRY_CATEGORY_ID = 'altro';

export interface PantryDraftRow {
  /** ShoppingItem.id or AdHocShoppingItem.id */
  sourceId: string;
  include: boolean;
  /** Editable only when existingItem === null. */
  name: string;
  /** In `unit`. */
  qty: number;
  /** A PANTRY_UNITS value; locked to the entry's unit for increments. */
  unit: string;
  categoryId: string;
  position: PantryItem['position'];
  /** '' = no expiry. */
  expires: string;
  /** Exact/alias match → UPDATE (increment) instead of create. */
  existingItem: PantryItem | null;
  /** False only for an increment whose units can't be compared (qty prefilled 0). */
  isUnitComparable: boolean;
  /** Informational copy under the row, computed at prefill time. */
  note: string | null;
}

export interface CheckedShoppingEntry {
  id: string;
  name: string;
  quantity: string;
}

export function buildPantryDraftRows(
  checked: CheckedShoppingEntry[],
  pantryItems: PantryItem[]
): PantryDraftRow[] {
  return checked.map(entry => {
    const purchase = parsePurchasedQuantity(entry.quantity);
    const match = matchIngredientToPantry(entry.name, pantryItems);
    return match.item
      ? buildIncrementRow(entry, match.item, purchase)
      : buildCreationRow(entry, purchase);
  });
}

interface PurchasedQuantity {
  parsed: ParsedQuantity;
  /** True when part of a concatenated quantity had to be ignored ("200 g + q.b."). */
  isPartial: boolean;
}

/**
 * Reads the list quantity as something that can be stored.
 *
 * A concatenated displayQuantity is split on " + ": when the segments that
 * parse share one mass/volume dimension their bases are summed (mirror of
 * mergeQuantities) and the unparsable ones ignored; mixed dimensions, or
 * nothing usable, return null.
 */
function parsePurchasedQuantity(quantity: string): PurchasedQuantity | null {
  const segments = quantity.split(' + ');

  if (segments.length === 1) {
    const parsed = parseQuantity(quantity);
    return parsed ? { parsed, isPartial: false } : null;
  }

  const parsedSegments = segments
    .map(segment => parseQuantity(segment))
    .filter((parsed): parsed is ParsedQuantity => parsed !== null);
  if (parsedSegments.length === 0) return null;

  const dimensions = new Set(parsedSegments.map(parsed => parsed.dimension));
  const [dimension] = [...dimensions];
  if (dimensions.size !== 1 || dimension === 'count') return null;

  return {
    parsed: {
      baseValue: parsedSegments.reduce((sum, parsed) => sum + parsed.baseValue, 0),
      dimension,
      unit: dimension === 'mass' ? 'g' : 'ml',
    },
    isPartial: true,
  };
}

function buildCreationRow(
  entry: CheckedShoppingEntry,
  purchase: PurchasedQuantity | null
): PantryDraftRow {
  const listNote = entry.quantity.trim() ? `Quantità in lista: "${entry.quantity}"` : null;
  const storable = purchase ? toPantryUnits(purchase.parsed) : null;

  return {
    sourceId: entry.id,
    include: true,
    name: entry.name,
    // "3 cucchiai" or "q.b." can't be stored as such: 1 pz, and the note shows
    // the original so the user corrects it at a glance.
    qty: storable?.qty ?? 1,
    unit: storable?.unit ?? 'pz',
    categoryId: FALLBACK_PANTRY_CATEGORY_ID,
    position: 'dispensa',
    expires: '',
    existingItem: null,
    isUnitComparable: true,
    note: storable && !purchase?.isPartial ? null : listNote,
  };
}

function buildIncrementRow(
  entry: CheckedShoppingEntry,
  existingItem: PantryItem,
  purchase: PurchasedQuantity | null
): PantryDraftRow {
  const stock = parsePantryQty(existingItem);
  const isUnitComparable =
    purchase !== null &&
    purchase.parsed.dimension === stock.dimension &&
    (stock.dimension !== 'count' || areSameCountUnit(purchase.parsed.unit, stock.unit));

  // Prefill what the user actually buys: the shortfall when the stock covers
  // part of the need (the list badge says "mancano 50 g"), the full amount when
  // there was no stock or the item was re-included despite enough stock.
  const qty = isUnitComparable
    ? convertBaseToPantryUnit(amountToBuyBase(purchase.parsed.baseValue, existingItem), existingItem)
    : 0;

  return {
    sourceId: entry.id,
    include: true,
    name: existingItem.name,
    qty,
    unit: existingItem.unit,
    categoryId: existingItem.categoryId,
    position: existingItem.position,
    expires: '',
    existingItem,
    isUnitComparable,
    note: isUnitComparable
      ? describePantryIncrement(existingItem, qty)
      : `Già in dispensa: ${formatQty(existingItem)} — unità non confrontabili, imposta tu l'incremento`,
  };
}

/** Readable pantry units for a new entry: g↔kg, ml↔L, plain counts as pz. */
function toPantryUnits(parsed: ParsedQuantity): { qty: number; unit: string } | null {
  switch (parsed.dimension) {
    case 'mass':
      return parsed.baseValue >= 1000
        ? { qty: roundQty(parsed.baseValue / 1000), unit: 'kg' }
        : { qty: roundQty(parsed.baseValue), unit: 'g' };
    case 'volume':
      // The pantry vocabulary spells litres with an uppercase L.
      return parsed.baseValue >= 1000
        ? { qty: roundQty(parsed.baseValue / 1000), unit: 'L' }
        : { qty: roundQty(parsed.baseValue), unit: 'ml' };
    case 'count':
      return areSameCountUnit(parsed.unit, '') ? { qty: roundQty(parsed.baseValue), unit: 'pz' } : null;
  }
}

/** "Già in dispensa: 500 g → diventa 1,5 kg" for an increment of `incrementQty` (entry's unit). */
export function describePantryIncrement(existingItem: PantryItem, incrementQty: number): string {
  const total = existingItem.qty + incrementQty;
  return `Già in dispensa: ${formatQty(existingItem)} → diventa ${formatPantryAmount(existingItem, total)}`;
}

function formatPantryAmount(item: PantryItem, qty: number): string {
  const parsed = parsePantryQty({ ...item, qty });
  if (parsed.dimension === 'count') return `${formatItalianNumber(roundQty(qty))} ${item.unit}`;
  return formatQuantity(parsed.baseValue, parsed.dimension);
}

// Strips float noise (0.1 + 0.2) without hiding meaningful grams.
function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Turns the rows the user kept into batch operations.
 *
 * - Several rows on the SAME existing entry (a plan item and an ad-hoc item of
 *   the same ingredient) accumulate into one update: two updates on one doc in
 *   a batch would keep only the last.
 * - New rows with the same name and unit merge into one creation, so the pantry
 *   doesn't end up with twin entries.
 * - Updates set `purchased` to today and touch `expires` only when filled in,
 *   so an existing expiry is never wiped. Quantities are clamped to ≥ 0.
 *
 * @param today local "YYYY-MM-DD" (formatLocalDate), never toISOString()
 */
export function buildPantryBatchOps(rows: PantryDraftRow[], today: string): PantryBatchOp[] {
  const updates = new Map<string, { row: PantryDraftRow; item: PantryItem; increment: number; expires: string }>();
  const creations = new Map<string, { row: PantryDraftRow; name: string; qty: number; expires: string }>();

  for (const row of rows) {
    if (!row.include) continue;
    const qty = Math.max(0, row.qty);

    if (row.existingItem) {
      const pending = updates.get(row.existingItem.id);
      if (pending) {
        pending.increment += qty;
        pending.expires = pending.expires || row.expires;
      } else {
        updates.set(row.existingItem.id, { row, item: row.existingItem, increment: qty, expires: row.expires });
      }
      continue;
    }

    const name = row.name.trim();
    if (!name) continue;
    const key = `${canonicalIngredientKey(name)}|${row.unit}`;
    const pending = creations.get(key);
    if (pending) {
      pending.qty += qty;
      pending.expires = pending.expires || row.expires;
    } else {
      creations.set(key, { row, name, qty, expires: row.expires });
    }
  }

  const ops: PantryBatchOp[] = [];

  for (const { row, name, qty, expires } of creations.values()) {
    ops.push({
      kind: 'create',
      data: {
        name,
        qty: roundQty(qty),
        unit: row.unit,
        categoryId: row.categoryId,
        position: row.position,
        purchased: today,
        expires: expires || null,
        min: 0,
        notes: null,
      },
    });
  }

  for (const { row, item, increment, expires } of updates.values()) {
    ops.push({
      kind: 'update',
      itemId: item.id,
      data: {
        qty: roundQty(Math.max(0, item.qty + increment)),
        categoryId: row.categoryId,
        position: row.position,
        purchased: today,
        ...(expires ? { expires } : {}),
      },
    });
  }

  return ops;
}

/** Toast copy: "3 prodotti aggiunti, 1 aggiornato in dispensa". */
export function describePantryBatchResult(createdCount: number, updatedCount: number): string {
  const created = `${createdCount} ${createdCount === 1 ? 'prodotto aggiunto' : 'prodotti aggiunti'}`;
  if (updatedCount === 0) return `${created} in dispensa`;

  if (createdCount === 0) {
    return `${updatedCount} ${updatedCount === 1 ? 'prodotto aggiornato' : 'prodotti aggiornati'} in dispensa`;
  }
  return `${created}, ${updatedCount} ${updatedCount === 1 ? 'aggiornato' : 'aggiornati'} in dispensa`;
}
