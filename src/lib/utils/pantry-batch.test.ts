import type { Timestamp } from 'firebase/firestore';
import type { PantryItem } from '@/types/pantry';
import {
  buildPantryBatchOps,
  buildPantryDraftRows,
  describePantryBatchResult,
  PantryDraftRow,
} from '@/lib/utils/pantry-batch';

const TODAY = '2026-09-15';

function pantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: 'item-1',
    userId: 'user-1',
    name: 'Prodotto',
    qty: 1,
    unit: 'pz',
    categoryId: 'cereali',
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

/** A single checked list entry turned into its draft row, against `pantry`. */
function draftFor(name: string, quantity: string, pantry: PantryItem[] = []): PantryDraftRow {
  const [row] = buildPantryDraftRows([{ id: `src-${name}`, name, quantity }], pantry);
  return row;
}

describe('buildPantryDraftRows', () => {
  describe('prefill for new entries', () => {
    it.each([
      ['200 g', 200, 'g'],
      ['1,5 kg', 1.5, 'kg'],
      ['1500 g', 1.5, 'kg'],
      ['500 ml', 500, 'ml'],
      ['1 l', 1, 'L'],
      ['3', 3, 'pz'],
      ['2 pz', 2, 'pz'],
    ])('"%s" → %s %s, no note', (quantity, qty, unit) => {
      const row = draftFor('Ornitorinco', quantity);

      expect(row).toMatchObject({ qty, unit, note: null, existingItem: null });
    });

    it('falls back to 1 pz with the original quantity in the note for other count units', () => {
      expect(draftFor('Ornitorinco', '3 cucchiai')).toMatchObject({
        qty: 1,
        unit: 'pz',
        note: 'Quantità in lista: "3 cucchiai"',
      });
    });

    it('falls back to 1 pz with a note for q.b.', () => {
      expect(draftFor('Sale', 'q.b.')).toMatchObject({ qty: 1, unit: 'pz', note: 'Quantità in lista: "q.b."' });
    });

    it('sums the usable segments of a concatenated quantity and keeps the note', () => {
      expect(draftFor('Burro', '200 g + q.b.')).toMatchObject({
        qty: 200,
        unit: 'g',
        note: 'Quantità in lista: "200 g + q.b."',
      });
    });

    it('falls back to 1 pz when a concatenated quantity mixes dimensions', () => {
      expect(draftFor('Burro', '200 g + 3')).toMatchObject({
        qty: 1,
        unit: 'pz',
        note: 'Quantità in lista: "200 g + 3"',
      });
    });

    it('uses the explicit "altro" category and the dispensa position', () => {
      expect(draftFor('Ornitorinco', '200 g')).toMatchObject({
        categoryId: 'altro',
        position: 'dispensa',
        include: true,
        expires: '',
      });
    });
  });

  describe('prefill for existing entries', () => {
    it('prefills only the shortfall when the stock covers part of the need', () => {
      const farina = pantryItem({ id: 'farina', name: 'Farina 00', qty: 500, unit: 'g', categoryId: 'cereali' });

      const row = draftFor('farina 00', '1 kg', [farina]);

      expect(row).toMatchObject({
        existingItem: farina,
        name: 'Farina 00',
        qty: 500,
        unit: 'g',
        categoryId: 'cereali',
        isUnitComparable: true,
        note: 'Già in dispensa: 500 g → diventa 1 kg',
      });
    });

    it('prefills the full amount, converted into the entry unit, when the stock already covered it', () => {
      const farina = pantryItem({ name: 'Farina 00', qty: 1, unit: 'kg' });

      expect(draftFor('farina 00', '300 g', [farina])).toMatchObject({
        qty: 0.3,
        unit: 'kg',
        note: 'Già in dispensa: 1 kg → diventa 1,3 kg',
      });
    });

    it('prefills 0 with a note when the units cannot be compared', () => {
      const uova = pantryItem({ name: 'Uova', qty: 6, unit: 'pz' });

      expect(draftFor('uova', '200 g', [uova])).toMatchObject({
        existingItem: uova,
        qty: 0,
        unit: 'pz',
        isUnitComparable: false,
        note: "Già in dispensa: 6 pz — unità non confrontabili, imposta tu l'incremento",
      });
    });
  });
});

describe('buildPantryBatchOps', () => {
  it('accumulates two rows on the same existing entry into one update', () => {
    const farina = pantryItem({ id: 'farina', name: 'Farina 00', qty: 1, unit: 'kg' });
    const rows = buildPantryDraftRows(
      [
        { id: 'plan', name: 'Farina 00', quantity: '300 g' },
        { id: 'adhoc', name: 'farina 00', quantity: '200 g' },
      ],
      [farina]
    );

    const ops = buildPantryBatchOps(rows, TODAY);

    expect(ops).toEqual([
      {
        kind: 'update',
        itemId: 'farina',
        data: { qty: 1.5, categoryId: 'cereali', position: 'dispensa', purchased: TODAY },
      },
    ]);
  });

  it('only writes expires on an update when the user filled it in', () => {
    const farina = pantryItem({ id: 'farina', name: 'Farina 00', qty: 1, unit: 'kg', expires: '2027-01-01' });
    const [row] = buildPantryDraftRows([{ id: 'plan', name: 'Farina 00', quantity: '300 g' }], [farina]);

    const [withoutExpiry] = buildPantryBatchOps([row], TODAY);
    const [withExpiry] = buildPantryBatchOps([{ ...row, expires: '2026-12-01' }], TODAY);

    expect(withoutExpiry.data).not.toHaveProperty('expires');
    expect(withExpiry.data).toMatchObject({ expires: '2026-12-01' });
  });

  it('creates new entries with today as purchase date and null for empty fields', () => {
    const rows = buildPantryDraftRows([{ id: 'a', name: 'Ornitorinco', quantity: '200 g' }], []);

    expect(buildPantryBatchOps(rows, TODAY)).toEqual([
      {
        kind: 'create',
        data: {
          name: 'Ornitorinco',
          qty: 200,
          unit: 'g',
          categoryId: 'altro',
          position: 'dispensa',
          purchased: TODAY,
          expires: null,
          min: 0,
          notes: null,
        },
      },
    ]);
  });

  it('merges new rows with the same name and unit into one creation', () => {
    const rows = buildPantryDraftRows(
      [
        { id: 'plan', name: 'Fenicottero', quantity: '200 g' },
        { id: 'adhoc', name: 'fenicotteri', quantity: '300 g' },
      ],
      []
    );

    const ops = buildPantryBatchOps(rows, TODAY);

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'create', data: { name: 'Fenicottero', qty: 500, unit: 'g' } });
  });

  it('skips excluded rows and new rows left without a name, and clamps negative quantities', () => {
    const rows = buildPantryDraftRows(
      [
        { id: 'excluded', name: 'Ornitorinco', quantity: '200 g' },
        { id: 'nameless', name: 'Fenicottero', quantity: '1 kg' },
        { id: 'negative', name: 'Capibara', quantity: '2' },
      ],
      []
    );
    rows[0].include = false;
    rows[1].name = '   ';
    rows[2].qty = -4;

    const ops = buildPantryBatchOps(rows, TODAY);

    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'create', data: { name: 'Capibara', qty: 0 } });
  });
});

describe('describePantryBatchResult', () => {
  it.each([
    [3, 1, '3 prodotti aggiunti, 1 aggiornato in dispensa'],
    [1, 2, '1 prodotto aggiunto, 2 aggiornati in dispensa'],
    [1, 0, '1 prodotto aggiunto in dispensa'],
    [0, 1, '1 prodotto aggiornato in dispensa'],
    [0, 2, '2 prodotti aggiornati in dispensa'],
  ])('%s created, %s updated → "%s"', (created, updated, expected) => {
    expect(describePantryBatchResult(created, updated)).toBe(expected);
  });
});
