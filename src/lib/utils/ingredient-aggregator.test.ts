import {
  aggregateIngredients,
  formatQuantity,
  IngredientContribution,
  parseQuantity,
} from '@/lib/utils/ingredient-aggregator';

/**
 * Builds a contribution with sensible defaults so each test only states the
 * fields it cares about (ingredient name and quantity).
 */
function contribution(
  name: string,
  quantity: string,
  overrides: Partial<IngredientContribution> = {}
): IngredientContribution {
  return {
    name,
    quantity,
    section: null,
    recipeTitle: 'Ricetta',
    dayIndex: 0,
    mealType: 'pranzo',
    ...overrides,
  };
}

describe('aggregateIngredients', () => {
  describe('quantity merging', () => {
    it('sums compatible mass units and reformats in the clearest unit', () => {
      const items = aggregateIngredients([
        contribution('Farina', '200 g'),
        contribution('Farina', '1 kg'),
      ]);

      expect(items).toHaveLength(1);
      expect(items[0].displayQuantity).toBe('1,2 kg');
      expect(items[0].isMerged).toBe(true);
    });

    it('sums compatible volume units (ml + l)', () => {
      const items = aggregateIngredients([
        contribution('Latte', '500 ml'),
        contribution('Latte', '0,5 l'),
      ]);

      expect(items).toHaveLength(1);
      expect(items[0].displayQuantity).toBe('1 l');
    });

    it('keeps grams when the total stays under a kilogram', () => {
      const items = aggregateIngredients([
        contribution('Zucchero', '200 g'),
        contribution('Zucchero', '300 g'),
      ]);

      expect(items[0].displayQuantity).toBe('500 g');
    });

    it('sums unitless counts', () => {
      const items = aggregateIngredients([
        contribution('Uovo', '2'),
        contribution('Uova', '3'),
      ]);

      expect(items).toHaveLength(1);
      expect(items[0].displayQuantity).toBe('5');
    });

    it('falls back to " + " for non-scalable quantities', () => {
      const items = aggregateIngredients([
        contribution('Sale', '10 g'),
        contribution('Sale', 'q.b.'),
      ]);

      expect(items).toHaveLength(1);
      expect(items[0].displayQuantity).toBe('10 g + q.b.');
    });

    it('falls back to " + " for mixed dimensions', () => {
      const items = aggregateIngredients([
        contribution('Burro', '50 g'),
        contribution('Burro', '2 cucchiai'),
      ]);

      expect(items[0].displayQuantity).toBe('50 g + 2 cucchiai');
    });
  });

  describe('name normalisation', () => {
    it('merges regular singular/plural forms', () => {
      const items = aggregateIngredients([
        contribution('pomodoro', '100 g'),
        contribution('pomodori', '200 g'),
      ]);

      expect(items).toHaveLength(1);
      expect(items[0].displayQuantity).toBe('300 g');
    });

    it('merges velar plurals (fungo/funghi)', () => {
      const items = aggregateIngredients([
        contribution('fungo', '100 g'),
        contribution('funghi', '150 g'),
      ]);

      expect(items).toHaveLength(1);
      expect(items[0].displayQuantity).toBe('250 g');
    });

    it('is accent-insensitive', () => {
      const items = aggregateIngredients([
        contribution('Caffè', '1'),
        contribution('Caffe', '1'),
      ]);

      expect(items).toHaveLength(1);
      expect(items[0].displayQuantity).toBe('2');
    });

    it('keeps distinct multi-word ingredients separate', () => {
      const items = aggregateIngredients([
        contribution('pomodori', '2'),
        contribution('pomodori pelati', '400 g'),
      ]);

      expect(items).toHaveLength(2);
    });

    it('preserves the first-seen display name', () => {
      const items = aggregateIngredients([
        contribution('Pomodori', '100 g'),
        contribution('pomodoro', '100 g'),
      ]);

      expect(items[0].name).toBe('Pomodori');
    });
  });
});

describe('aggregateIngredients trivial-ingredient filter', () => {
  it('produces no item for water and ice in their listed forms', () => {
    const items = aggregateIngredients([
      contribution('Acqua', '500 ml'),
      contribution('acqua di cottura della pasta', 'q.b.'),
      contribution('Ghiaccio', '200 g'),
    ]);

    expect(items).toHaveLength(0);
  });

  it('keeps water phrases outside the curated list (acqua di rose)', () => {
    const items = aggregateIngredients([contribution('Acqua di rose', '1 cucchiaio')]);

    expect(items.map(item => item.name)).toEqual(['Acqua di rose']);
  });

  it('does not affect the grouping of the other ingredients', () => {
    const items = aggregateIngredients([
      contribution('Farina', '200 g'),
      contribution('Acqua', '100 ml'),
      contribution('Farina', '300 g'),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].displayQuantity).toBe('500 g');
  });
});

describe('parseQuantity (exported)', () => {
  it('reads the Italian decimal comma', () => {
    expect(parseQuantity('1,5 kg')).toEqual({ baseValue: 1500, dimension: 'mass', unit: 'kg' });
  });

  it('converts etti to grams', () => {
    expect(parseQuantity('2 etti')).toEqual({ baseValue: 200, dimension: 'mass', unit: 'etti' });
  });

  it('converts centilitres to millilitres', () => {
    expect(parseQuantity('5 cl')).toEqual({ baseValue: 50, dimension: 'volume', unit: 'cl' });
  });

  it('treats unknown units as a count and q.b. as unparsable', () => {
    expect(parseQuantity('3 cucchiai')).toEqual({ baseValue: 3, dimension: 'count', unit: 'cucchiai' });
    expect(parseQuantity('q.b.')).toBeNull();
  });
});

describe('formatQuantity (exported)', () => {
  it('switches to the major unit from 1000 up, with a decimal comma', () => {
    expect(formatQuantity(1500, 'mass')).toBe('1,5 kg');
    expect(formatQuantity(2250, 'volume')).toBe('2,25 l');
  });

  it('keeps the minor unit below 1000', () => {
    expect(formatQuantity(250, 'volume')).toBe('250 ml');
  });
});
