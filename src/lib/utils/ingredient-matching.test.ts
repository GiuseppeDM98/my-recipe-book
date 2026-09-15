import type { Timestamp } from 'firebase/firestore';
import type { PantryItem } from '@/types/pantry';
import {
  canonicalIngredientKey,
  classifyPantryAvailability,
  comparePantryStock,
  convertBaseToPantryUnit,
  isTrivialIngredient,
  matchIngredientToPantry,
  parsePantryQty,
} from '@/lib/utils/ingredient-matching';

/**
 * Builds a pantry entry with sensible defaults so each test only states the
 * fields it cares about (usually name, qty and unit).
 */
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

describe('ingredient-matching', () => {
  describe('canonicalIngredientKey (re-exported)', () => {
    it('gives singular and plural the same key', () => {
      expect(canonicalIngredientKey('pomodoro')).toBe(canonicalIngredientKey('pomodori'));
    });

    it('keeps multi-word names distinct from their head word', () => {
      expect(canonicalIngredientKey('pomodori pelati')).not.toBe(canonicalIngredientKey('pomodori'));
    });

    it('is accent-insensitive', () => {
      expect(canonicalIngredientKey('Caffè')).toBe(canonicalIngredientKey('caffe'));
    });
  });

  describe('isTrivialIngredient', () => {
    it.each(['Acqua', 'acqua fredda', 'Acqua di cottura', 'ghiaccio', 'Cubetti di ghiaccio'])(
      'treats "%s" as trivial',
      name => {
        expect(isTrivialIngredient(name)).toBe(true);
      }
    );

    it.each(['sale', 'olio', 'acqua di rose', 'acqua di cocco', 'sale e acqua'])(
      'does not treat "%s" as trivial',
      name => {
        expect(isTrivialIngredient(name)).toBe(false);
      }
    );
  });

  describe('matchIngredientToPantry', () => {
    it('matches exactly across singular/plural', () => {
      const pomodori = pantryItem({ name: 'Pomodori' });

      const match = matchIngredientToPantry('pomodoro', [pomodori]);

      expect(match).toEqual({ item: pomodori, confidence: 'exact' });
    });

    it('matches exactly regardless of accents', () => {
      const caffe = pantryItem({ name: 'Caffè' });

      expect(matchIngredientToPantry('caffe', [caffe])).toEqual({ item: caffe, confidence: 'exact' });
    });

    it('falls back to a confirmed alias when there is no exact match', () => {
      const pastaLunga = pantryItem({
        name: 'Pasta lunga',
        aliases: [canonicalIngredientKey('spaghetti')],
      });

      const match = matchIngredientToPantry('Spaghetti', [pastaLunga]);

      expect(match).toEqual({ item: pastaLunga, confidence: 'alias' });
    });

    it('prefers an exact match over an alias, even with less stock', () => {
      const aliased = pantryItem({
        name: 'Pasta lunga',
        qty: 900,
        aliases: [canonicalIngredientKey('spaghetti')],
      });
      const exact = pantryItem({ name: 'Spaghetti', qty: 100 });

      const match = matchIngredientToPantry('spaghetti', [aliased, exact]);

      expect(match).toEqual({ item: exact, confidence: 'exact' });
    });

    it('picks the duplicate with the highest qty, first in order on a tie', () => {
      const small = pantryItem({ id: 'small', name: 'Farina 00', qty: 1 });
      const big = pantryItem({ id: 'big', name: 'Farina 00', qty: 2 });
      const bigTwin = pantryItem({ id: 'big-twin', name: 'farina 00', qty: 2 });

      const match = matchIngredientToPantry('farina 00', [small, big, bigTwin]);

      expect(match.item?.id).toBe('big');
    });

    it('suggests a longer pantry name that contains the ingredient', () => {
      const fini = pantryItem({ name: 'Spaghetti fini' });

      expect(matchIngredientToPantry('spaghetti', [fini])).toEqual({ item: null, suggestions: [fini] });
    });

    it('suggests a shorter pantry name contained in the ingredient', () => {
      const spaghetti = pantryItem({ name: 'Spaghetti' });

      expect(matchIngredientToPantry('spaghetti fini', [spaghetti])).toEqual({
        item: null,
        suggestions: [spaghetti],
      });
    });

    it('suggests across stopwords and plurals (pomodori ↔ Passata di pomodoro)', () => {
      const passata = pantryItem({ name: 'Passata di pomodoro' });

      expect(matchIngredientToPantry('pomodori', [passata])).toEqual({ item: null, suggestions: [passata] });
    });

    it('never matches by prefix (sale vs Salsa di soia)', () => {
      const salsa = pantryItem({ name: 'Salsa di soia' });

      expect(matchIngredientToPantry('sale', [salsa])).toEqual({ item: null, suggestions: [] });
    });

    it('does not suggest when the only shared token is shorter than 4 chars (uva vs Uva passa)', () => {
      const uvaPassa = pantryItem({ name: 'Uva passa' });

      expect(matchIngredientToPantry('uva', [uvaPassa])).toEqual({ item: null, suggestions: [] });
    });

    it('does not suggest disjoint names', () => {
      const burro = pantryItem({ name: 'Burro' });

      expect(matchIngredientToPantry('zucchine', [burro])).toEqual({ item: null, suggestions: [] });
    });

    it('caps suggestions at 3, most similar first then alphabetical', () => {
      const tostata = pantryItem({ name: 'Farina di mandorle tostate' });
      const riso = pantryItem({ name: 'Farina di riso' });
      const ceci = pantryItem({ name: 'Farina di ceci' });
      const integrale = pantryItem({ name: 'Farina integrale' });

      const match = matchIngredientToPantry('farina', [tostata, riso, ceci, integrale]);

      expect(match.item).toBeNull();
      expect(match.item === null && match.suggestions.map(s => s.name)).toEqual([
        'Farina di ceci',
        'Farina di riso',
        'Farina integrale',
      ]);
    });
  });

  describe('parsePantryQty', () => {
    it('lowercases the pantry unit before the lookup (uppercase L)', () => {
      expect(parsePantryQty(pantryItem({ qty: 1.5, unit: 'L' }))).toEqual({
        baseValue: 1500,
        dimension: 'volume',
        unit: 'l',
      });
    });

    it('treats units outside the aliases as a count', () => {
      expect(parsePantryQty(pantryItem({ qty: 2, unit: 'vasetti' }))).toEqual({
        baseValue: 2,
        dimension: 'count',
        unit: 'vasetti',
      });
    });
  });

  describe('comparePantryStock', () => {
    it('is sufficient when the stock covers the need across units (200 g vs 1 kg)', () => {
      const result = comparePantryStock('200 g', pantryItem({ qty: 1, unit: 'kg' }));

      expect(result).toEqual({
        comparable: true,
        sufficient: true,
        requiredBase: 200,
        availableBase: 1000,
        dimension: 'mass',
      });
    });

    it('is insufficient when the stock is lower (2 kg vs 500 g)', () => {
      const result = comparePantryStock('2 kg', pantryItem({ qty: 500, unit: 'g' }));

      expect(result).toMatchObject({ comparable: true, sufficient: false });
    });

    it('treats a bare number and "pz" as the same count (2 vs 6 pz)', () => {
      const result = comparePantryStock('2', pantryItem({ qty: 6, unit: 'pz' }));

      expect(result).toMatchObject({ comparable: true, sufficient: true, dimension: 'count' });
    });

    it('reports dimension-mismatch for count vs mass (2 pomodori vs 500 g)', () => {
      expect(comparePantryStock('2 pomodori', pantryItem({ qty: 500, unit: 'g' }))).toEqual({
        comparable: false,
        reason: 'dimension-mismatch',
      });
    });

    it('reports unparsable for q.b.', () => {
      expect(comparePantryStock('q.b.', pantryItem({ qty: 500, unit: 'g' }))).toEqual({
        comparable: false,
        reason: 'unparsable',
      });
    });

    it('reports unparsable for a concatenated quantity', () => {
      expect(comparePantryStock('200 g + q.b.', pantryItem({ qty: 500, unit: 'g' }))).toEqual({
        comparable: false,
        reason: 'unparsable',
      });
    });

    it('reports empty when the stock is zero', () => {
      expect(comparePantryStock('200 g', pantryItem({ qty: 0, unit: 'g' }))).toEqual({
        comparable: false,
        reason: 'empty',
      });
    });

    it('reports unit-mismatch for different count units (1 mazzo vs 2 vasetti)', () => {
      expect(comparePantryStock('1 mazzo', pantryItem({ qty: 2, unit: 'vasetti' }))).toEqual({
        comparable: false,
        reason: 'unit-mismatch',
      });
    });
  });

  describe('classifyPantryAvailability', () => {
    it('parks an item the stock covers (in-pantry)', () => {
      const farina = pantryItem({ name: 'Farina 00', qty: 2, unit: 'kg' });

      expect(classifyPantryAvailability('farina 00', '300 g', [farina])).toEqual({
        kind: 'in-pantry',
        item: farina,
      });
    });

    it('keeps an item with not enough stock in the list, with the missing amount', () => {
      const farina = pantryItem({ name: 'Farina 00', qty: 100, unit: 'g' });

      expect(classifyPantryAvailability('farina 00', '300 g', [farina])).toEqual({
        kind: 'badge',
        item: farina,
        missingQuantity: '200 g',
      });
    });

    it('expresses a missing count in the entry unit (uova 6 vs 2 pz)', () => {
      const uova = pantryItem({ name: 'Uova', qty: 2, unit: 'pz' });

      expect(classifyPantryAvailability('uova', '6', [uova])).toMatchObject({ kind: 'badge', missingQuantity: '4 pz' });
    });

    it('shows a badge without missing amount when the units are not comparable (uova 200 g vs 6 pz)', () => {
      const uova = pantryItem({ name: 'Uova', qty: 6, unit: 'pz' });

      expect(classifyPantryAvailability('uova', '200 g', [uova])).toEqual({
        kind: 'badge',
        item: uova,
        missingQuantity: null,
      });
    });

    it('says nothing when the matched stock is zero', () => {
      const uova = pantryItem({ name: 'Uova', qty: 0, unit: 'pz' });

      expect(classifyPantryAvailability('uova', 'q.b.', [uova])).toEqual({ kind: 'none' });
    });

    it('proposes fuzzy candidates, skipping empty ones', () => {
      const fini = pantryItem({ name: 'Spaghetti fini', qty: 500, unit: 'g' });
      const finiEmpty = pantryItem({ name: 'Spaghetti integrali', qty: 0, unit: 'g' });

      expect(classifyPantryAvailability('spaghetti', '200 g', [finiEmpty, fini])).toEqual({
        kind: 'suggestion',
        candidates: [fini],
      });
    });

    it('says nothing without match or candidates', () => {
      expect(classifyPantryAvailability('zucchine', '2', [pantryItem({ name: 'Burro' })])).toEqual({
        kind: 'none',
      });
    });
  });

  describe('convertBaseToPantryUnit', () => {
    it('converts grams into a kg entry, rounded to one decimal', () => {
      expect(convertBaseToPantryUnit(300, pantryItem({ unit: 'kg' }))).toBe(0.3);
      expect(convertBaseToPantryUnit(1234, pantryItem({ unit: 'kg' }))).toBe(1.2);
    });

    it('leaves counts untouched', () => {
      expect(convertBaseToPantryUnit(3, pantryItem({ unit: 'pz' }))).toBe(3);
    });
  });
});
