import { buildShuffledSlots, pickReshuffledRecipe } from '@/lib/utils/meal-plan-shuffle';
import { Recipe, Season } from '@/types';

let recipeCounter = 0;

/** Minimal Recipe fixture; only the fields the shuffle reads are meaningful. */
function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  recipeCounter += 1;
  return {
    id: `r${recipeCounter}`,
    userId: 'u1',
    title: `Ricetta ${recipeCounter}`,
    tags: [],
    techniqueIds: [],
    ingredients: [],
    steps: [],
    images: [],
    seasons: ['tutte_stagioni'],
    createdAt: null as unknown as Recipe['createdAt'],
    updatedAt: null as unknown as Recipe['updatedAt'],
    ...overrides,
  };
}

/** Builds `count` all-season recipes in the given category. */
function makeRecipes(count: number, categoryId: string, seasons: Season[] = ['tutte_stagioni']): Recipe[] {
  return Array.from({ length: count }, () => makeRecipe({ categoryId, seasons }));
}

describe('buildShuffledSlots', () => {
  it('fills every active day for an active meal type', () => {
    const recipes = makeRecipes(10, 'cat-a');

    const { slots } = buildShuffledSlots(recipes, {
      season: 'estate',
      activeMealTypes: ['pranzo'],
      activeDays: [0, 1, 2],
    });

    expect(slots).toHaveLength(3);
    expect(slots.every(s => s.mealType === 'pranzo')).toBe(true);
    expect(slots.map(s => s.dayIndex).sort()).toEqual([0, 1, 2]);
    expect(slots.every(s => !!s.existingRecipeId && s.newRecipe === null)).toBe(true);
  });

  it('keeps only seasonal recipes when enough of them exist', () => {
    const summer = makeRecipes(6, 'cat-a', ['estate']);
    const winter = makeRecipes(6, 'cat-a', ['inverno']);

    const { slots } = buildShuffledSlots([...summer, ...winter], {
      season: 'estate',
      activeMealTypes: ['pranzo'],
      activeDays: [0, 1, 2, 3, 4, 5, 6],
    });

    const summerIds = new Set(summer.map(r => r.id));
    expect(slots.every(s => summerIds.has(s.existingRecipeId!))).toBe(true);
  });

  it('honours a preferred category', () => {
    const recipes = [...makeRecipes(5, 'cat-a'), ...makeRecipes(5, 'cat-b')];

    const { slots } = buildShuffledSlots(recipes, {
      season: 'estate',
      activeMealTypes: ['pranzo'],
      activeDays: [0, 1, 2],
      mealTypeConfigs: { pranzo: { preferredCategoryId: 'cat-a' } },
    });

    const catAIds = new Set(recipes.filter(r => r.categoryId === 'cat-a').map(r => r.id));
    expect(slots.every(s => catAIds.has(s.existingRecipeId!))).toBe(true);
  });

  it('never assigns an excluded category', () => {
    const recipes = [...makeRecipes(5, 'cat-a'), ...makeRecipes(5, 'cat-b')];

    const { slots } = buildShuffledSlots(recipes, {
      season: 'estate',
      activeMealTypes: ['pranzo'],
      activeDays: [0, 1, 2, 3, 4],
      mealTypeConfigs: { pranzo: { excludedCategoryIds: ['cat-b'] } },
    });

    const catBIds = new Set(recipes.filter(r => r.categoryId === 'cat-b').map(r => r.id));
    expect(slots.some(s => catBIds.has(s.existingRecipeId!))).toBe(false);
  });

  it('does not repeat recipes when the pool is large enough', () => {
    const recipes = makeRecipes(7, 'cat-a');

    const { slots } = buildShuffledSlots(recipes, {
      season: 'estate',
      activeMealTypes: ['pranzo'],
      activeDays: [0, 1, 2, 3, 4, 5, 6],
    });

    const usedIds = slots.map(s => s.existingRecipeId);
    expect(new Set(usedIds).size).toBe(7);
  });

  it('spreads distinct recipes across meal types', () => {
    const recipes = makeRecipes(14, 'cat-a');

    const { slots } = buildShuffledSlots(recipes, {
      season: 'estate',
      activeMealTypes: ['pranzo', 'cena'],
      activeDays: [0, 1, 2, 3, 4, 5, 6],
    });

    expect(slots).toHaveLength(14);
    expect(new Set(slots.map(s => s.existingRecipeId)).size).toBe(14);
  });

  it('reports meal types with no candidate recipe and leaves them empty', () => {
    const recipes = makeRecipes(5, 'cat-a');

    const { slots, unfilledMealTypes } = buildShuffledSlots(recipes, {
      season: 'estate',
      activeMealTypes: ['pranzo'],
      activeDays: [0, 1, 2],
      mealTypeConfigs: { pranzo: { excludedCategoryIds: ['cat-a'] } },
    });

    expect(slots).toHaveLength(0);
    expect(unfilledMealTypes).toEqual(['pranzo']);
  });
});

describe('pickReshuffledRecipe', () => {
  it('returns a different recipe of the same category', () => {
    const recipes = makeRecipes(4, 'cat-a');
    const current = recipes[0];

    const picked = pickReshuffledRecipe(recipes, {
      season: 'estate',
      categoryId: 'cat-a',
      currentRecipeId: current.id,
      usedRecipeIds: new Set([current.id]),
    });

    expect(picked).not.toBeNull();
    expect(picked!.id).not.toBe(current.id);
    expect(picked!.categoryId).toBe('cat-a');
  });

  it('excludes recipes already used in the week', () => {
    const recipes = makeRecipes(3, 'cat-a');
    const [current, used, free] = recipes;

    const picked = pickReshuffledRecipe(recipes, {
      season: 'estate',
      categoryId: 'cat-a',
      currentRecipeId: current.id,
      usedRecipeIds: new Set([current.id, used.id]),
    });

    expect(picked!.id).toBe(free.id);
  });

  it('returns null when no alternative exists', () => {
    const recipes = makeRecipes(1, 'cat-a');

    const picked = pickReshuffledRecipe(recipes, {
      season: 'estate',
      categoryId: 'cat-a',
      currentRecipeId: recipes[0].id,
      usedRecipeIds: new Set([recipes[0].id]),
    });

    expect(picked).toBeNull();
  });
});
