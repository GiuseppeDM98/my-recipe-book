import {
  aggregateIngredients,
  buildContributions,
  collectPlanRecipeIds,
  formatQuantity,
  IngredientContribution,
  parseQuantity,
} from '@/lib/utils/ingredient-aggregator';
import { Ingredient, MealPlan, MealSlot, MealSlotVariant, Recipe } from '@/types';

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

/** Minimal Recipe fixture: only title, servings and ingredients matter to buildContributions. */
function makeRecipe(
  id: string,
  ingredients: Array<[name: string, quantity: string]>,
  servings?: number
): Recipe {
  return {
    id,
    userId: 'u1',
    title: `Ricetta ${id}`,
    tags: [],
    techniqueIds: [],
    ingredients: ingredients.map(
      ([name, quantity], index): Ingredient => ({ id: `${id}-i${index}`, name, quantity })
    ),
    steps: [],
    images: [],
    ...(servings !== undefined ? { servings } : {}),
    createdAt: null as unknown as Recipe['createdAt'],
    updatedAt: null as unknown as Recipe['updatedAt'],
  };
}

function makeSlot(overrides: Partial<MealSlot> = {}): MealSlot {
  return {
    dayIndex: 0,
    mealType: 'pranzo',
    existingRecipeId: null,
    newRecipe: null,
    recipeTitle: '',
    ...overrides,
  };
}

function makeVariant(overrides: Partial<MealSlotVariant> = {}): MealSlotVariant {
  return {
    id: 'v1',
    memberIds: ['m1'],
    existingRecipeId: null,
    recipeTitle: null,
    ...overrides,
  };
}

function makePlan(slots: MealSlot[]): MealPlan {
  return {
    id: 'plan1',
    userId: 'u1',
    weekStartDate: '2026-07-27',
    slots,
    activeMealTypes: ['pranzo', 'cena'],
    season: 'estate',
    generatedByAI: false,
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    createdAt: null as unknown as MealPlan['createdAt'],
    updatedAt: null as unknown as MealPlan['updatedAt'],
  };
}

function recipeMap(...recipes: Recipe[]): Map<string, Recipe> {
  return new Map(recipes.map(recipe => [recipe.id, recipe]));
}

describe('buildContributions', () => {
  describe('legacy invariant (servingsPlanned == null → no scaling)', () => {
    // Quantities a scaler would be tempted to touch: a fraction ("1/2" → "0,5"),
    // a spaced decimal ("1, 5 kg" → "1,5 kg"), a range, a non-scalable string.
    const awkwardIngredients: Array<[string, string]> = [
      ['Spaghetti', '400 g'],
      ['Latte', '1/2 tazza'],
      ['Farina', '1, 5 kg'],
      ['Olio', '2-3 cucchiai'],
      ['Sale', 'q.b.'],
    ];

    it('should copy quantities byte for byte when servingsPlanned is absent', () => {
      // Arrange — a plan saved before the family model: no servingsPlanned key at all
      const plan = makePlan([makeSlot({ existingRecipeId: 'r1' })]);
      const recipes = recipeMap(makeRecipe('r1', awkwardIngredients, 4));

      // Act
      const contributions = buildContributions(plan, recipes);

      // Assert
      expect(contributions.map(c => c.quantity)).toEqual(awkwardIngredients.map(([, q]) => q));
    });

    it('should copy quantities byte for byte when servingsPlanned is an explicit null', () => {
      // Arrange — the shuffle writes null when no default is supplied
      const plan = makePlan([
        makeSlot({ existingRecipeId: 'r1', servingsPlanned: null, variants: null }),
      ]);
      const recipes = recipeMap(makeRecipe('r1', awkwardIngredients, 6));

      // Act
      const contributions = buildContributions(plan, recipes);

      // Assert
      expect(contributions.map(c => c.quantity)).toEqual(awkwardIngredients.map(([, q]) => q));
    });

    it('should leave an inline newRecipe slot from a legacy AI plan unscaled', () => {
      // Arrange
      const plan = makePlan([
        makeSlot({
          newRecipe: {
            title: 'Pasta legacy',
            servings: 2,
            ingredients: [{ id: 'n1', name: 'Pasta', quantity: '160 g' }],
            steps: [],
          },
        }),
      ]);

      // Act
      const contributions = buildContributions(plan, recipeMap());

      // Assert
      expect(contributions).toHaveLength(1);
      expect(contributions[0].quantity).toBe('160 g');
      expect(contributions[0].recipeTitle).toBe('Pasta legacy');
    });
  });

  describe('scaling by planned people', () => {
    it('should scale down when fewer people than the recipe servings are planned', () => {
      // Arrange
      const plan = makePlan([makeSlot({ existingRecipeId: 'r1', servingsPlanned: 2 })]);
      const recipes = recipeMap(makeRecipe('r1', [['Spaghetti', '200 g']], 4));

      // Act
      const contributions = buildContributions(plan, recipes);

      // Assert
      expect(contributions[0].quantity).toBe('100 g');
    });

    it('should fall back to 4 servings when the recipe does not declare them', () => {
      // Arrange
      const plan = makePlan([makeSlot({ existingRecipeId: 'r1', servingsPlanned: 8 })]);
      const recipes = recipeMap(makeRecipe('r1', [['Spaghetti', '200 g']]));

      // Act
      const contributions = buildContributions(plan, recipes);

      // Assert
      expect(contributions[0].quantity).toBe('400 g');
    });

    it('should leave a non-scalable quantity unchanged', () => {
      // Arrange
      const plan = makePlan([makeSlot({ existingRecipeId: 'r1', servingsPlanned: 2 })]);
      const recipes = recipeMap(makeRecipe('r1', [['Sale', 'q.b.']], 4));

      // Act
      const contributions = buildContributions(plan, recipes);

      // Assert
      expect(contributions[0].quantity).toBe('q.b.');
    });

    it('should not reformat the quantity when planned people equal the recipe servings', () => {
      // Arrange — "1/2" would become "0,5" if the scaler ran at factor 1
      const plan = makePlan([makeSlot({ existingRecipeId: 'r1', servingsPlanned: 4 })]);
      const recipes = recipeMap(makeRecipe('r1', [['Latte', '1/2 tazza']], 4));

      // Act
      const contributions = buildContributions(plan, recipes);

      // Assert
      expect(contributions[0].quantity).toBe('1/2 tazza');
    });

    it('should scale an inline newRecipe slot on its own servings', () => {
      // Arrange — a legacy AI slot whose people were edited afterwards
      const plan = makePlan([
        makeSlot({
          servingsPlanned: 4,
          newRecipe: {
            title: 'Pasta legacy',
            servings: 2,
            ingredients: [{ id: 'n1', name: 'Pasta', quantity: '160 g' }],
            steps: [],
          },
        }),
      ]);

      // Act
      const contributions = buildContributions(plan, recipeMap());

      // Assert
      expect(contributions[0].quantity).toBe('320 g');
    });
  });

  describe('variants', () => {
    it('should add the variant recipe scaled to its members and shrink the base accordingly', () => {
      // Arrange — 3 people, one of them eats the minestrone
      const plan = makePlan([
        makeSlot({
          dayIndex: 1,
          mealType: 'cena',
          existingRecipeId: 'base',
          servingsPlanned: 3,
          variants: [makeVariant({ memberIds: ['sofia'], existingRecipeId: 'var' })],
        }),
      ]);
      const recipes = recipeMap(
        makeRecipe('base', [['Pasta', '400 g']], 4),
        makeRecipe('var', [['Verdure', '800 g']], 4)
      );

      // Act
      const contributions = buildContributions(plan, recipes);

      // Assert — base for 2 of 4 servings, variant for 1 of 4 servings
      expect(contributions).toEqual([
        expect.objectContaining({ name: 'Pasta', quantity: '200 g', recipeTitle: 'Ricetta base' }),
        expect.objectContaining({
          name: 'Verdure',
          quantity: '200 g',
          recipeTitle: 'Ricetta var',
          dayIndex: 1,
          mealType: 'cena',
        }),
      ]);
    });

    it('should drop the base contribution when variants cover everyone', () => {
      // Arrange
      const plan = makePlan([
        makeSlot({
          existingRecipeId: 'base',
          servingsPlanned: 2,
          variants: [makeVariant({ memberIds: ['a', 'b'], existingRecipeId: 'var' })],
        }),
      ]);
      const recipes = recipeMap(
        makeRecipe('base', [['Pasta', '400 g']], 4),
        makeRecipe('var', [['Verdure', '800 g']], 4)
      );

      // Act
      const contributions = buildContributions(plan, recipes);

      // Assert
      expect(contributions.map(c => c.name)).toEqual(['Verdure']);
      expect(contributions[0].quantity).toBe('400 g');
    });

    it('should never produce a negative base when variants exceed the planned people', () => {
      // Arrange
      const plan = makePlan([
        makeSlot({
          existingRecipeId: 'base',
          servingsPlanned: 1,
          variants: [makeVariant({ memberIds: ['a', 'b', 'c'], existingRecipeId: 'var' })],
        }),
      ]);
      const recipes = recipeMap(
        makeRecipe('base', [['Pasta', '400 g']], 4),
        makeRecipe('var', [['Verdure', '800 g']], 4)
      );

      // Act
      const contributions = buildContributions(plan, recipes);

      // Assert
      expect(contributions.map(c => c.name)).toEqual(['Verdure']);
    });

    it('should skip a variant whose recipe was deleted without throwing', () => {
      // Arrange — "gone" is not in the map; the base still counts its own people
      const plan = makePlan([
        makeSlot({
          existingRecipeId: 'base',
          servingsPlanned: 4,
          variants: [makeVariant({ memberIds: ['a'], existingRecipeId: 'gone' })],
        }),
      ]);
      const recipes = recipeMap(makeRecipe('base', [['Pasta', '400 g']], 4));

      // Act
      const contributions = buildContributions(plan, recipes);

      // Assert — the person stays planned on the variant, so the base covers 3
      expect(contributions.map(c => c.name)).toEqual(['Pasta']);
      expect(contributions[0].quantity).toBe('300 g');
    });

    it('should ignore corrupt variants without a recipe or without members', () => {
      // Arrange
      const plan = makePlan([
        makeSlot({
          existingRecipeId: 'base',
          servingsPlanned: 4,
          variants: [
            makeVariant({ id: 'v1', memberIds: [], existingRecipeId: 'var' }),
            makeVariant({ id: 'v2', memberIds: ['a'], existingRecipeId: null }),
          ],
        }),
      ]);
      const recipes = recipeMap(
        makeRecipe('base', [['Pasta', '400 g']], 4),
        makeRecipe('var', [['Verdure', '800 g']], 4)
      );

      // Act
      const contributions = buildContributions(plan, recipes);

      // Assert — neither variant takes people away from the base
      expect(contributions.map(c => c.name)).toEqual(['Pasta']);
      expect(contributions[0].quantity).toBe('400 g');
    });

    it('should still contribute variants on a slot whose base recipe was deleted', () => {
      // Arrange
      const plan = makePlan([
        makeSlot({
          existingRecipeId: 'gone',
          servingsPlanned: 3,
          variants: [makeVariant({ memberIds: ['a'], existingRecipeId: 'var' })],
        }),
      ]);
      const recipes = recipeMap(makeRecipe('var', [['Verdure', '800 g']], 4));

      // Act
      const contributions = buildContributions(plan, recipes);

      // Assert
      expect(contributions.map(c => c.name)).toEqual(['Verdure']);
      expect(contributions[0].quantity).toBe('200 g');
    });
  });
});

describe('collectPlanRecipeIds', () => {
  it('should include variant recipes next to base recipes and skip empty references', () => {
    // Arrange
    const plan = makePlan([
      makeSlot({
        existingRecipeId: 'base',
        variants: [
          makeVariant({ id: 'v1', existingRecipeId: 'var' }),
          makeVariant({ id: 'v2', existingRecipeId: null }),
        ],
      }),
      makeSlot({ dayIndex: 1 }),
      makeSlot({ dayIndex: 2, existingRecipeId: 'other', variants: null }),
    ]);

    // Act
    const ids = collectPlanRecipeIds(plan);

    // Assert
    expect(ids).toEqual(['base', 'var', 'other']);
  });
});
