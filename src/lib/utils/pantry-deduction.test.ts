import type { Timestamp } from 'firebase/firestore';
import type { Ingredient } from '@/types';
import type { PantryItem } from '@/types/pantry';
import { canonicalIngredientKey } from '@/lib/utils/ingredient-matching';
import {
  buildPantryDeductionUpdates,
  computePantryDeductions,
  proposeDeductQty,
} from '@/lib/utils/pantry-deduction';

function pantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: overrides.name ? `id-${overrides.name}` : 'id-item',
    userId: 'user-1',
    name: 'Prodotto',
    qty: 1,
    unit: 'pz',
    categoryId: 'altro',
    position: 'dispensa',
    purchased: null,
    expires: null,
    min: 0,
    notes: null,
    createdAt: null as unknown as Timestamp,
    updatedAt: null as unknown as Timestamp,
    ...overrides,
  };
}

function ingredient(name: string, quantity: string, section: string | null = null): Ingredient {
  return { id: `ing-${name}-${quantity}`, name, quantity, section };
}

describe('computePantryDeductions', () => {
  it('scales to the servings cooked and converts into the entry unit', () => {
    const farina = pantryItem({ name: 'Farina 00', qty: 1, unit: 'kg' });

    const rows = computePantryDeductions([ingredient('Farina 00', '200 g')], 4, 6, [farina]);

    expect(rows).toEqual([
      {
        kind: 'proposed',
        pantryItem: farina,
        ingredientName: 'Farina 00',
        scaledQuantity: '300 g',
        deductQty: 0.3,
        confidence: 'exact',
      },
    ]);
  });

  it('clamps the deduction to the available stock', () => {
    const burro = pantryItem({ name: 'Burro', qty: 100, unit: 'g' });

    const [row] = computePantryDeductions([ingredient('Burro', '300 g')], 4, 4, [burro]);

    expect(row).toMatchObject({ kind: 'proposed', deductQty: 100 });
  });

  it('marks q.b. as excluded/unparsable', () => {
    const sale = pantryItem({ name: 'Sale', qty: 1, unit: 'kg' });

    expect(computePantryDeductions([ingredient('Sale', 'q.b.')], 4, 4, [sale])).toEqual([
      { kind: 'excluded', pantryItem: sale, ingredientName: 'Sale', scaledQuantity: 'q.b.', reason: 'unparsable' },
    ]);
  });

  it('marks count vs mass as excluded/dimension-mismatch', () => {
    const pomodori = pantryItem({ name: 'Pomodori', qty: 500, unit: 'g' });

    const [row] = computePantryDeductions([ingredient('Pomodori', '2')], 4, 4, [pomodori]);

    expect(row).toMatchObject({ kind: 'excluded', reason: 'dimension-mismatch' });
  });

  it('skips trivial ingredients even when the pantry has a same-named entry', () => {
    const acqua = pantryItem({ name: 'Acqua', qty: 2, unit: 'L' });

    expect(computePantryDeductions([ingredient('Acqua', '500 ml')], 4, 4, [acqua])).toEqual([]);
  });

  it('merges several ingredients on the same entry, summing before the clamp', () => {
    const farina = pantryItem({ name: 'Farina 00', qty: 0.4, unit: 'kg' });

    const rows = computePantryDeductions(
      [
        ingredient('Farina 00', '200 g', 'Per la base'),
        ingredient('Burro', 'q.b.'),
        ingredient('farina 00', '300 g', 'Per la crema'),
      ],
      4,
      4,
      [farina]
    );

    expect(rows).toEqual([
      {
        kind: 'proposed',
        pantryItem: farina,
        ingredientName: 'Farina 00, farina 00',
        scaledQuantity: '200 g + 300 g',
        deductQty: 0.4,
        confidence: 'exact',
      },
    ]);
  });

  it('proposes a fuzzy candidate as a suggestion row', () => {
    const fini = pantryItem({ name: 'Spaghetti fini', qty: 500, unit: 'g' });

    expect(computePantryDeductions([ingredient('Spaghetti', '320 g')], 4, 4, [fini])).toEqual([
      { kind: 'suggestion', candidate: fini, ingredientName: 'Spaghetti', scaledQuantity: '320 g' },
    ]);
  });

  it('reports alias confidence for a confirmed alias', () => {
    const pastaLunga = pantryItem({
      name: 'Pasta lunga',
      qty: 1,
      unit: 'kg',
      aliases: [canonicalIngredientKey('spaghetti')],
    });

    const [row] = computePantryDeductions([ingredient('Spaghetti', '320 g')], 4, 4, [pastaLunga]);

    expect(row).toMatchObject({ kind: 'proposed', confidence: 'alias', deductQty: 0.3 });
  });

  it('produces no row for an ingredient without match or candidate', () => {
    expect(computePantryDeductions([ingredient('Zafferano', '1 bustina')], 4, 4, [pantryItem({ name: 'Burro' })])).toEqual([]);
  });
});

describe('proposeDeductQty', () => {
  it('returns the clamped deduction when comparable, null otherwise', () => {
    const fini = pantryItem({ name: 'Spaghetti fini', qty: 500, unit: 'g' });

    expect(proposeDeductQty('320 g', fini)).toBe(320);
    expect(proposeDeductQty('2', fini)).toBeNull();
  });
});

describe('buildPantryDeductionUpdates', () => {
  it('accumulates deductions per entry and clamps the new qty to zero', () => {
    const burro = pantryItem({ id: 'burro', qty: 100, unit: 'g' });
    const farina = pantryItem({ id: 'farina', qty: 1.25, unit: 'kg' });

    const updates = buildPantryDeductionUpdates([
      { pantryItem: burro, deductQty: 80, aliasIngredientName: null },
      { pantryItem: farina, deductQty: 0.3, aliasIngredientName: null },
      { pantryItem: burro, deductQty: 80, aliasIngredientName: null },
    ]);

    expect(updates).toEqual([
      { itemId: 'burro', qty: 0 },
      { itemId: 'farina', qty: 0.95 },
    ]);
  });

  it('skips link-only confirmations with nothing to deduct', () => {
    const uova = pantryItem({ id: 'uova', qty: 6 });

    expect(buildPantryDeductionUpdates([{ pantryItem: uova, deductQty: 0, aliasIngredientName: 'uova' }])).toEqual([]);
  });
});
