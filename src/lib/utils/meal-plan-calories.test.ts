import { computeDayNutrition, computeWeekNutrition } from '@/lib/utils/meal-plan-calories';
import { PlannerMember, resolvePlannerMembers } from '@/lib/utils/planner-members';
import { MacrosPerServing, MealPlan, MealSlot, Recipe } from '@/types';

/** Minimal Recipe fixture; only the fields the nutrition totals read are meaningful. */
function makeRecipe(
  id: string,
  caloriesPerServing?: number,
  servingWeightGrams?: number,
  macrosPerServing?: MacrosPerServing
): Recipe {
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
    ...(servingWeightGrams !== undefined ? { servingWeightGrams } : {}),
    ...(macrosPerServing !== undefined ? { macrosPerServing } : {}),
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

describe('computeDayNutrition', () => {
  it('should sum every slot when all recipes carry a calorie estimate', () => {
    // Arrange
    const plan = makePlan([
      makeSlot({ dayIndex: 0, mealType: 'pranzo', existingRecipeId: 'r1' }),
      makeSlot({ dayIndex: 0, mealType: 'cena', existingRecipeId: 'r2' }),
    ]);
    const recipes = recipeMap(makeRecipe('r1', 600), makeRecipe('r2', 750));

    // Act
    const result = computeDayNutrition(plan, 0, recipes);

    // Assert
    expect(result.calories.total).toBe(1350);
    expect(result.calories.countedSlots).toBe(2);
    expect(result.calories.isPartial).toBe(false);
  });

  it('should flag the day as partial when a recipe has no calorie estimate', () => {
    // Arrange
    const plan = makePlan([
      makeSlot({ dayIndex: 0, mealType: 'pranzo', existingRecipeId: 'r1' }),
      makeSlot({ dayIndex: 0, mealType: 'cena', existingRecipeId: 'r2' }),
    ]);
    const recipes = recipeMap(makeRecipe('r1', 600), makeRecipe('r2'));

    // Act
    const result = computeDayNutrition(plan, 0, recipes);

    // Assert — the estimated slot still counts, but the day is marked incomplete
    expect(result.calories.total).toBe(600);
    expect(result.calories.countedSlots).toBe(1);
    expect(result.calories.uncountedSlots).toBe(1);
    expect(result.calories.isPartial).toBe(true);
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
    const result = computeDayNutrition(plan, 0, recipeMap());

    // Assert
    expect(result.calories.total).toBe(480);
    expect(result.calories.isPartial).toBe(false);
  });

  it('should skip a slot pointing at a deleted recipe without throwing', () => {
    // Arrange — r-missing is not in the map
    const plan = makePlan([
      makeSlot({ dayIndex: 0, mealType: 'pranzo', existingRecipeId: 'r1' }),
      makeSlot({ dayIndex: 0, mealType: 'cena', existingRecipeId: 'r-missing' }),
    ]);
    const recipes = recipeMap(makeRecipe('r1', 600));

    // Act
    const result = computeDayNutrition(plan, 0, recipes);

    // Assert
    expect(result.calories.total).toBe(600);
    expect(result.calories.isPartial).toBe(true);
  });

  it('should return zero and a complete flag for a day with no slots', () => {
    // Arrange
    const plan = makePlan([makeSlot({ dayIndex: 3, existingRecipeId: 'r1' })]);
    const recipes = recipeMap(makeRecipe('r1', 600));

    // Act
    const result = computeDayNutrition(plan, 0, recipes);

    // Assert — an empty day is not a partial day; there is nothing missing
    expect(result.calories.total).toBe(0);
    expect(result.calories.countedSlots).toBe(0);
    expect(result.calories.isPartial).toBe(false);
    expect(result.macros.countedSlots).toBe(0);
    expect(result.macros.isPartial).toBe(false);
  });

  it('should ignore slots belonging to other days', () => {
    // Arrange
    const plan = makePlan([
      makeSlot({ dayIndex: 0, existingRecipeId: 'r1' }),
      makeSlot({ dayIndex: 1, existingRecipeId: 'r2' }),
    ]);
    const recipes = recipeMap(makeRecipe('r1', 600), makeRecipe('r2', 900));

    // Act
    const result = computeDayNutrition(plan, 1, recipes);

    // Assert
    expect(result.calories.total).toBe(900);
  });

  it('should mark macros partial while calories are complete when a recipe has kcal but no macros', () => {
    // Arrange — every recipe created before macro support looks exactly like this
    const plan = makePlan([
      makeSlot({ dayIndex: 0, mealType: 'pranzo', existingRecipeId: 'r1' }),
    ]);
    const recipes = recipeMap(makeRecipe('r1', 600));

    // Act
    const result = computeDayNutrition(plan, 0, recipes);

    // Assert
    expect(result.calories.isPartial).toBe(false);
    expect(result.macros.isPartial).toBe(true);
    expect(result.macros.countedSlots).toBe(0);
    expect(result.macros.uncountedSlots).toBe(1);
  });

  it('should count a fatGrams of 0 as a counted slot, not a missing one', () => {
    // Arrange — the gate must be `!= null`, never truthy
    const plan = makePlan([
      makeSlot({ dayIndex: 0, mealType: 'pranzo', existingRecipeId: 'r1' }),
    ]);
    const recipes = recipeMap(
      makeRecipe('r1', 400, 300, { proteinGrams: 10, carbsGrams: 80, fatGrams: 0 })
    );

    // Act
    const result = computeDayNutrition(plan, 0, recipes);

    // Assert
    expect(result.macros.countedSlots).toBe(1);
    expect(result.macros.uncountedSlots).toBe(0);
    expect(result.macros.isPartial).toBe(false);
    expect(result.macros.fatTotal).toBe(0);
    expect(result.macros.proteinTotal).toBe(10);
    expect(result.macros.carbsTotal).toBe(80);
  });
});

describe('computeWeekNutrition', () => {
  it('should return one entry per active day, including empty ones', () => {
    // Arrange
    const plan = makePlan(
      [makeSlot({ dayIndex: 0, existingRecipeId: 'r1' })],
      [0, 1, 2]
    );
    const recipes = recipeMap(makeRecipe('r1', 600));

    // Act
    const week = computeWeekNutrition(plan, recipes);

    // Assert
    expect(week.size).toBe(3);
    expect(week.get(0)?.calories.total).toBe(600);
    expect(week.get(1)?.calories.total).toBe(0);
    expect(week.get(2)?.calories.total).toBe(0);
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
    const week = computeWeekNutrition(plan, recipes);

    // Assert
    expect(week.has(5)).toBe(false);
    expect(week.size).toBe(2);
  });
});

describe('computeDayNutrition member deltas', () => {
  const marco: PlannerMember = { id: 'marco', label: 'Marco' };
  const sofia: PlannerMember = { id: 'sofia', label: 'Sofia' };

  /** Pranzo shared by everyone, cena with a variant for Sofia. */
  function planWithSofiaVariant(variantRecipeId: string | null = 'minestrone'): MealPlan {
    return makePlan([
      makeSlot({ dayIndex: 0, mealType: 'pranzo', existingRecipeId: 'pasta', servingsPlanned: 3 }),
      makeSlot({
        dayIndex: 0,
        mealType: 'cena',
        existingRecipeId: 'arrosto',
        servingsPlanned: 3,
        variants: [
          { id: 'v1', memberIds: ['sofia'], existingRecipeId: variantRecipeId, recipeTitle: 'Minestrone' },
        ],
      }),
    ]);
  }

  it('should leave the base path untouched by variants and by servingsPlanned', () => {
    // Arrange
    const recipes = recipeMap(
      makeRecipe('pasta', 600),
      makeRecipe('arrosto', 750),
      makeRecipe('minestrone', 300)
    );

    // Act
    const result = computeDayNutrition(planWithSofiaVariant(), 0, recipes, [marco, sofia]);

    // Assert — one serving of each base meal, exactly as on a plan without variants
    expect(result.calories.total).toBe(1350);
    expect(result.calories.countedSlots).toBe(2);
    expect(result.calories.isPartial).toBe(false);
  });

  it('should total the variant in covered slots and the base elsewhere, only for covered members', () => {
    // Arrange
    const recipes = recipeMap(
      makeRecipe('pasta', 600, 300, { proteinGrams: 20, carbsGrams: 90, fatGrams: 10 }),
      makeRecipe('arrosto', 750, 350, { proteinGrams: 50, carbsGrams: 10, fatGrams: 40 }),
      makeRecipe('minestrone', 300, 400, { proteinGrams: 12, carbsGrams: 45, fatGrams: 0 })
    );

    // Act
    const result = computeDayNutrition(planWithSofiaVariant(), 0, recipes, [marco, sofia]);

    // Assert — Marco follows the base path, so only Sofia is listed
    expect(result.memberDeltas).toHaveLength(1);
    const delta = result.memberDeltas[0];
    expect(delta.memberId).toBe('sofia');
    expect(delta.label).toBe('Sofia');
    expect(delta.calories.total).toBe(900);
    expect(delta.calories.isPartial).toBe(false);
    expect(delta.macros.proteinTotal).toBe(32);
    expect(delta.macros.carbsTotal).toBe(135);
    expect(delta.macros.fatTotal).toBe(10);
    expect(delta.macros.isPartial).toBe(false);
  });

  it('should label an unnamed member with the Componente N fallback', () => {
    // Arrange — second member of the profile has no label
    const members = resolvePlannerMembers({
      members: [
        { id: 'marco', age: 40, label: 'Marco' },
        { id: 'sofia', age: 8, label: null },
      ],
    });
    const recipes = recipeMap(
      makeRecipe('pasta', 600),
      makeRecipe('arrosto', 750),
      makeRecipe('minestrone', 300)
    );

    // Act
    const result = computeDayNutrition(planWithSofiaVariant(), 0, recipes, members);

    // Assert
    expect(result.memberDeltas.map(delta => delta.label)).toEqual(['Componente 2']);
  });

  it('should leave out a member who is no longer in the family profile', () => {
    // Arrange — the variant still points at sofia, the profile only has Marco
    const recipes = recipeMap(
      makeRecipe('pasta', 600),
      makeRecipe('arrosto', 750),
      makeRecipe('minestrone', 300)
    );

    // Act
    const result = computeDayNutrition(planWithSofiaVariant(), 0, recipes, [marco]);

    // Assert
    expect(result.memberDeltas).toEqual([]);
    expect(result.calories.total).toBe(1350);
  });

  it('should flag only the member partial when the variant recipe has no estimate', () => {
    // Arrange — minestrone exists but was never estimated
    const recipes = recipeMap(
      makeRecipe('pasta', 600),
      makeRecipe('arrosto', 750),
      makeRecipe('minestrone')
    );

    // Act
    const result = computeDayNutrition(planWithSofiaVariant(), 0, recipes, [marco, sofia]);

    // Assert — the base path stays complete
    expect(result.calories.isPartial).toBe(false);
    expect(result.memberDeltas[0].calories.total).toBe(600);
    expect(result.memberDeltas[0].calories.uncountedSlots).toBe(1);
    expect(result.memberDeltas[0].calories.isPartial).toBe(true);
  });

  it('should flag the member partial when the variant recipe was deleted', () => {
    // Arrange — minestrone is not in the map at all
    const recipes = recipeMap(makeRecipe('pasta', 600), makeRecipe('arrosto', 750));

    // Act
    const result = computeDayNutrition(planWithSofiaVariant(), 0, recipes, [marco, sofia]);

    // Assert
    expect(result.memberDeltas[0].calories.total).toBe(600);
    expect(result.memberDeltas[0].calories.isPartial).toBe(true);
  });

  it('should treat a variant without a recipe as absent, like the shopping list does', () => {
    // Arrange
    const recipes = recipeMap(makeRecipe('pasta', 600), makeRecipe('arrosto', 750));

    // Act
    const result = computeDayNutrition(planWithSofiaVariant(null), 0, recipes, [marco, sofia]);

    // Assert
    expect(result.memberDeltas).toEqual([]);
  });

  it('should return no member deltas when no members are passed', () => {
    // Arrange
    const recipes = recipeMap(
      makeRecipe('pasta', 600),
      makeRecipe('arrosto', 750),
      makeRecipe('minestrone', 300)
    );

    // Act
    const result = computeDayNutrition(planWithSofiaVariant(), 0, recipes);

    // Assert
    expect(result.memberDeltas).toEqual([]);
  });

  it('should list a member only on the days they eat a variant', () => {
    // Arrange
    const recipes = recipeMap(
      makeRecipe('pasta', 600),
      makeRecipe('arrosto', 750),
      makeRecipe('minestrone', 300)
    );
    const plan = planWithSofiaVariant();
    plan.slots.push(makeSlot({ dayIndex: 1, mealType: 'pranzo', existingRecipeId: 'pasta' }));

    // Act
    const week = computeWeekNutrition(plan, recipes, [marco, sofia]);

    // Assert
    expect(week.get(0)?.memberDeltas).toHaveLength(1);
    expect(week.get(1)?.memberDeltas).toEqual([]);
  });
});
