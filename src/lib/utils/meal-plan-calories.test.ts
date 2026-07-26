import { computeDayCalories, computeWeekCalories } from '@/lib/utils/meal-plan-calories';
import { MealPlan, MealSlot, Recipe } from '@/types';

/** Minimal Recipe fixture; only the fields the calorie totals read are meaningful. */
function makeRecipe(id: string, caloriesPerServing?: number): Recipe {
  return {
    id,
    userId: 'u1',
    title: `Ricetta ${id}`,
    tags: [],
    techniqueIds: [],
    ingredients: [],
    steps: [],
    images: [],
    ...(caloriesPerServing !== undefined ? { caloriesPerServing } : {}),
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
  } as MealSlot;
}

function makePlan(slots: MealSlot[], activeDays?: number[]): MealPlan {
  return {
    id: 'plan1',
    userId: 'u1',
    weekStartDate: '2026-07-27',
    slots,
    activeMealTypes: ['pranzo', 'cena'],
    season: 'estate',
    generatedByAI: false,
    activeDays: activeDays ?? [0, 1, 2, 3, 4, 5, 6],
    createdAt: null as unknown as MealPlan['createdAt'],
    updatedAt: null as unknown as MealPlan['updatedAt'],
  };
}

function recipeMap(...recipes: Recipe[]): Map<string, Recipe> {
  return new Map(recipes.map(recipe => [recipe.id, recipe]));
}

describe('computeDayCalories', () => {
  it('should sum every slot when all recipes carry an estimate', () => {
    // Arrange
    const plan = makePlan([
      makeSlot({ dayIndex: 0, mealType: 'pranzo', existingRecipeId: 'r1' }),
      makeSlot({ dayIndex: 0, mealType: 'cena', existingRecipeId: 'r2' }),
    ]);
    const recipes = recipeMap(makeRecipe('r1', 600), makeRecipe('r2', 750));

    // Act
    const result = computeDayCalories(plan, 0, recipes);

    // Assert
    expect(result.total).toBe(1350);
    expect(result.countedSlots).toBe(2);
    expect(result.isPartial).toBe(false);
  });

  it('should flag the day as partial when a recipe has no estimate', () => {
    // Arrange
    const plan = makePlan([
      makeSlot({ dayIndex: 0, mealType: 'pranzo', existingRecipeId: 'r1' }),
      makeSlot({ dayIndex: 0, mealType: 'cena', existingRecipeId: 'r2' }),
    ]);
    const recipes = recipeMap(makeRecipe('r1', 600), makeRecipe('r2'));

    // Act
    const result = computeDayCalories(plan, 0, recipes);

    // Assert — the estimated slot still counts, but the day is marked incomplete
    expect(result.total).toBe(600);
    expect(result.countedSlots).toBe(1);
    expect(result.uncountedSlots).toBe(1);
    expect(result.isPartial).toBe(true);
  });

  it('should count an inline newRecipe slot from a legacy AI plan', () => {
    // Arrange
    const plan = makePlan([
      makeSlot({
        dayIndex: 0,
        newRecipe: {
          title: 'Pasta al pomodoro',
          ingredients: [],
          steps: [],
          caloriesPerServing: 480,
        },
      }),
    ]);

    // Act
    const result = computeDayCalories(plan, 0, recipeMap());

    // Assert
    expect(result.total).toBe(480);
    expect(result.isPartial).toBe(false);
  });

  it('should skip a slot pointing at a deleted recipe without throwing', () => {
    // Arrange — r-missing is not in the map
    const plan = makePlan([
      makeSlot({ dayIndex: 0, mealType: 'pranzo', existingRecipeId: 'r1' }),
      makeSlot({ dayIndex: 0, mealType: 'cena', existingRecipeId: 'r-missing' }),
    ]);
    const recipes = recipeMap(makeRecipe('r1', 600));

    // Act
    const result = computeDayCalories(plan, 0, recipes);

    // Assert
    expect(result.total).toBe(600);
    expect(result.isPartial).toBe(true);
  });

  it('should return zero and a complete flag for a day with no slots', () => {
    // Arrange
    const plan = makePlan([makeSlot({ dayIndex: 3, existingRecipeId: 'r1' })]);
    const recipes = recipeMap(makeRecipe('r1', 600));

    // Act
    const result = computeDayCalories(plan, 0, recipes);

    // Assert — an empty day is not a partial day; there is nothing missing
    expect(result.total).toBe(0);
    expect(result.countedSlots).toBe(0);
    expect(result.isPartial).toBe(false);
  });

  it('should ignore slots belonging to other days', () => {
    // Arrange
    const plan = makePlan([
      makeSlot({ dayIndex: 0, existingRecipeId: 'r1' }),
      makeSlot({ dayIndex: 1, existingRecipeId: 'r2' }),
    ]);
    const recipes = recipeMap(makeRecipe('r1', 600), makeRecipe('r2', 900));

    // Act
    const result = computeDayCalories(plan, 1, recipes);

    // Assert
    expect(result.total).toBe(900);
  });
});

describe('computeWeekCalories', () => {
  it('should return one entry per active day, including empty ones', () => {
    // Arrange
    const plan = makePlan(
      [makeSlot({ dayIndex: 0, existingRecipeId: 'r1' })],
      [0, 1, 2]
    );
    const recipes = recipeMap(makeRecipe('r1', 600));

    // Act
    const week = computeWeekCalories(plan, recipes);

    // Assert
    expect(week.size).toBe(3);
    expect(week.get(0)?.total).toBe(600);
    expect(week.get(1)?.total).toBe(0);
    expect(week.get(2)?.total).toBe(0);
  });

  it('should exclude days removed from the plan', () => {
    // Arrange — day 5 still holds a slot but is no longer active
    const plan = makePlan(
      [
        makeSlot({ dayIndex: 0, existingRecipeId: 'r1' }),
        makeSlot({ dayIndex: 5, existingRecipeId: 'r2' }),
      ],
      [0, 1]
    );
    const recipes = recipeMap(makeRecipe('r1', 600), makeRecipe('r2', 900));

    // Act
    const week = computeWeekCalories(plan, recipes);

    // Assert
    expect(week.has(5)).toBe(false);
    expect(week.size).toBe(2);
  });
});
