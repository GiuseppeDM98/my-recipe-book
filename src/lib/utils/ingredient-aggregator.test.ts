import { aggregateIngredients, IngredientContribution } from '@/lib/utils/ingredient-aggregator';

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
