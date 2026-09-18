import {
  buildPlanCopy,
  findSlot,
  withBaseRecipe,
  withClearedSlot,
  withSlotServings,
  withSlotVariants,
} from '@/lib/utils/meal-plan-slots';
import { MealPlan, MealSlot, MealSlotVariant } from '@/types';

function makeSlot(overrides: Partial<MealSlot> = {}): MealSlot {
  return {
    dayIndex: 0,
    mealType: 'pranzo',
    existingRecipeId: 'r1',
    newRecipe: null,
    recipeTitle: 'Ricetta r1',
    ...overrides,
  };
}

function makeVariant(overrides: Partial<MealSlotVariant> = {}): MealSlotVariant {
  return {
    id: 'v1',
    memberIds: ['sofia'],
    existingRecipeId: 'r-var',
    recipeTitle: 'Minestrone',
    ...overrides,
  };
}

function makePlan(slots: MealSlot[]): MealPlan {
  return {
    id: 'plan1',
    userId: 'u1',
    weekStartDate: '2026-07-27',
    slots,
    activeMealTypes: ['cena', 'pranzo'],
    season: 'estate',
    generatedByAI: true,
    activeDays: [0, 1, 2],
    shoppingCheckedIds: ['farina'],
    createdAt: null as unknown as MealPlan['createdAt'],
    updatedAt: null as unknown as MealPlan['updatedAt'],
  };
}

/** Fails on any `undefined` value, which Firestore would reject for the whole array. */
function expectNoUndefinedValues(slots: MealSlot[]) {
  for (const slot of slots) {
    for (const [key, value] of Object.entries(slot)) {
      expect({ key, isUndefined: value === undefined }).toEqual({ key, isUndefined: false });
    }
  }
}

describe('withBaseRecipe', () => {
  it('should plan a previously empty cell for the default number of people', () => {
    // Act
    const slots = withBaseRecipe([], 2, 'cena', { id: 'r9', title: 'Arrosto' }, 3);

    // Assert
    expect(slots).toEqual([
      {
        dayIndex: 2,
        mealType: 'cena',
        existingRecipeId: 'r9',
        newRecipe: null,
        recipeTitle: 'Arrosto',
        servingsPlanned: 3,
        variants: null,
      },
    ]);
  });

  it('should keep people and variants when the base dish changes', () => {
    // Arrange
    const variants = [makeVariant()];
    const initial = [makeSlot({ servingsPlanned: 5, variants })];

    // Act
    const slots = withBaseRecipe(initial, 0, 'pranzo', { id: 'r2', title: 'Risotto' }, 3);

    // Assert
    const slot = findSlot(slots, 0, 'pranzo');
    expect(slot?.existingRecipeId).toBe('r2');
    expect(slot?.recipeTitle).toBe('Risotto');
    expect(slot?.servingsPlanned).toBe(5);
    expect(slot?.variants).toEqual(variants);
  });

  it('should keep a legacy slot legacy when only its base dish changes', () => {
    // Arrange — no servingsPlanned key at all, as loaded from an old plan
    const initial = [makeSlot()];

    // Act
    const slots = withBaseRecipe(initial, 0, 'pranzo', { id: 'r2', title: 'Risotto' }, 3);

    // Assert — swapping the dish must not start scaling a plan that never scaled
    expect(findSlot(slots, 0, 'pranzo')?.servingsPlanned).toBeNull();
    expectNoUndefinedValues(slots);
  });

  it('should replace an inline AI recipe and leave the other slots untouched', () => {
    // Arrange
    const other = makeSlot({ dayIndex: 1 });
    const aiSlot = makeSlot({
      existingRecipeId: null,
      newRecipe: { title: 'AI', ingredients: [], steps: [] },
      suggestedCategoryName: 'Primi',
    });

    // Act
    const slots = withBaseRecipe([other, aiSlot], 0, 'pranzo', { id: 'r2', title: 'Risotto' }, 3);

    // Assert
    expect(slots).toHaveLength(2);
    expect(findSlot(slots, 1, 'pranzo')).toBe(other);
    expect(findSlot(slots, 0, 'pranzo')?.newRecipe).toBeNull();
    expect(findSlot(slots, 0, 'pranzo')).not.toHaveProperty('suggestedCategoryName');
  });
});

describe('withClearedSlot', () => {
  it('should remove the slot together with its people and variants', () => {
    // Arrange
    const initial = [makeSlot({ servingsPlanned: 3, variants: [makeVariant()] }), makeSlot({ dayIndex: 1 })];

    // Act
    const slots = withClearedSlot(initial, 0, 'pranzo');

    // Assert
    expect(slots).toHaveLength(1);
    expect(findSlot(slots, 0, 'pranzo')).toBeUndefined();
  });
});

describe('withSlotServings', () => {
  it('should set the people on the targeted slot only', () => {
    // Arrange
    const initial = [makeSlot(), makeSlot({ dayIndex: 1 })];

    // Act
    const slots = withSlotServings(initial, 0, 'pranzo', 6);

    // Assert
    expect(findSlot(slots!, 0, 'pranzo')?.servingsPlanned).toBe(6);
    expect(findSlot(slots!, 1, 'pranzo')).toBe(initial[1]);
  });

  it.each([
    [0, 1],
    [-4, 1],
    [99, 20],
    [2.6, 3],
  ])('should clamp %p people to %p', (input, expected) => {
    // Act
    const slots = withSlotServings([makeSlot()], 0, 'pranzo', input);

    // Assert
    expect(findSlot(slots!, 0, 'pranzo')?.servingsPlanned).toBe(expected);
  });

  it('should return null for an empty cell', () => {
    expect(withSlotServings([makeSlot()], 3, 'cena', 4)).toBeNull();
  });
});

describe('withSlotVariants', () => {
  it('should activate the family model on a legacy slot in the same write', () => {
    // Arrange
    const initial = [makeSlot()];

    // Act
    const slots = withSlotVariants(initial, 0, 'pranzo', [makeVariant()], 3);

    // Assert
    expect(findSlot(slots!, 0, 'pranzo')?.servingsPlanned).toBe(3);
    expect(findSlot(slots!, 0, 'pranzo')?.variants).toEqual([makeVariant()]);
  });

  it('should keep the people already planned on the slot', () => {
    // Act
    const slots = withSlotVariants([makeSlot({ servingsPlanned: 5 })], 0, 'pranzo', [makeVariant()], 3);

    // Assert
    expect(findSlot(slots!, 0, 'pranzo')?.servingsPlanned).toBe(5);
  });

  it('should drop variants without members and persist an empty list as null', () => {
    // Arrange
    const initial = [makeSlot({ servingsPlanned: 3, variants: [makeVariant()] })];

    // Act
    const slots = withSlotVariants(initial, 0, 'pranzo', [makeVariant({ memberIds: [] })], 3);

    // Assert
    expect(findSlot(slots!, 0, 'pranzo')?.variants).toBeNull();
    expectNoUndefinedValues(slots!);
  });

  it('should return null for an empty cell', () => {
    expect(withSlotVariants([], 0, 'pranzo', [makeVariant()], 3)).toBeNull();
  });
});

describe('buildPlanCopy', () => {
  it('should carry people and variants to the target week, and keep legacy slots legacy', () => {
    // Arrange
    const familySlot = makeSlot({ servingsPlanned: 3, variants: [makeVariant()] });
    const legacySlot = makeSlot({ dayIndex: 1 });
    const plan = makePlan([familySlot, legacySlot]);

    // Act
    const copy = buildPlanCopy(plan, '2026-08-03');

    // Assert
    expect(copy.weekStartDate).toBe('2026-08-03');
    expect(copy.slots).toEqual([familySlot, legacySlot]);
    expect(copy.slots[1]).not.toHaveProperty('servingsPlanned');
  });

  it('should carry the plan default people, and null for a plan created before the field', () => {
    // Act
    const withDefault = buildPlanCopy({ ...makePlan([]), defaultServingsPlanned: 5 }, '2026-08-03');
    const legacy = buildPlanCopy(makePlan([]), '2026-08-03');

    // Assert — null, never undefined: the payload goes straight to Firestore
    expect(withDefault.defaultServingsPlanned).toBe(5);
    expect(legacy.defaultServingsPlanned).toBeNull();
  });

  it('should copy the structure in canonical meal order but not the shopping state', () => {
    // Act
    const copy = buildPlanCopy(makePlan([]), '2026-08-03');

    // Assert
    expect(copy.activeMealTypes).toEqual(['pranzo', 'cena']);
    expect(copy.generatedByAI).toBe(false);
    expect(copy).not.toHaveProperty('shoppingCheckedIds');
  });
});
