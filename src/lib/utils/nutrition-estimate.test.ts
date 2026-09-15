import { deriveNutritionPerServing } from '@/lib/utils/nutrition-estimate';

describe('deriveNutritionPerServing — calories', () => {
  it('should accept a plausible per-serving figure unchanged', () => {
    // Arrange
    const raw = { caloriesPerServing: 450, totalWeightGrams: null, totalMacros: null };

    // Act
    const result = deriveNutritionPerServing(raw, 4);

    // Assert — parity with the pre-macros behavior
    expect(result.caloriesPerServing).toBe(450);
  });

  it('should reject a figure below the plausibility floor', () => {
    // Arrange
    const raw = { caloriesPerServing: 10, totalWeightGrams: null, totalMacros: null };

    // Act
    const result = deriveNutritionPerServing(raw, 4);

    // Assert
    expect(result.caloriesPerServing).toBeNull();
  });

  it('should reject a figure above the plausibility ceiling (likely an undivided total)', () => {
    // Arrange
    const raw = { caloriesPerServing: 3500, totalWeightGrams: null, totalMacros: null };

    // Act
    const result = deriveNutritionPerServing(raw, 4);

    // Assert
    expect(result.caloriesPerServing).toBeNull();
  });
});

describe('deriveNutritionPerServing — serving weight', () => {
  it('should divide the total by servings and round when the result is plausible', () => {
    // Arrange — 800 g / 4 servings = 200 g/serving
    const raw = { caloriesPerServing: null, totalWeightGrams: 800, totalMacros: null };

    // Act
    const result = deriveNutritionPerServing(raw, 4);

    // Assert
    expect(result.servingWeightGrams).toBe(200);
  });

  it('should discard a per-serving weight below 30 g (the skipped-division failure mode)', () => {
    // Arrange — 40 g / 4 servings = 10 g/serving, implausibly light for a finished dish
    const raw = { caloriesPerServing: null, totalWeightGrams: 40, totalMacros: null };

    // Act
    const result = deriveNutritionPerServing(raw, 4);

    // Assert
    expect(result.servingWeightGrams).toBeNull();
  });

  it('should discard a per-serving weight above 1500 g', () => {
    // Arrange — 8000 g / 4 servings = 2000 g/serving
    const raw = { caloriesPerServing: null, totalWeightGrams: 8000, totalMacros: null };

    // Act
    const result = deriveNutritionPerServing(raw, 4);

    // Assert
    expect(result.servingWeightGrams).toBeNull();
  });

  it('should return null when totalWeightGrams is missing or non-numeric', () => {
    // Arrange
    const missingRaw = { caloriesPerServing: 400, totalWeightGrams: null, totalMacros: null };
    const nonNumericRaw = { caloriesPerServing: 400, totalWeightGrams: '800', totalMacros: null };

    // Act
    const missingResult = deriveNutritionPerServing(missingRaw, 4);
    const nonNumericResult = deriveNutritionPerServing(nonNumericRaw, 4);

    // Assert
    expect(missingResult.servingWeightGrams).toBeNull();
    expect(nonNumericResult.servingWeightGrams).toBeNull();
  });

  it('should derive the weight independently of a null calorie estimate', () => {
    // Arrange
    const raw = { caloriesPerServing: null, totalWeightGrams: 800, totalMacros: null };

    // Act
    const result = deriveNutritionPerServing(raw, 4);

    // Assert
    expect(result.caloriesPerServing).toBeNull();
    expect(result.servingWeightGrams).toBe(200);
  });
});

describe('deriveNutritionPerServing — macros', () => {
  it('should accept a trio consistent with kcal within the Atwater tolerance', () => {
    // Arrange — per serving P20/C30/F10 (totals doubled for 2 servings), kcal 300/serving:
    // Atwater = 4*20 + 4*30 + 9*10 = 290, within ±30% of 300
    const raw = {
      caloriesPerServing: 300,
      totalWeightGrams: null,
      totalMacros: { proteinGrams: 40, carbsGrams: 60, fatGrams: 20 },
    };

    // Act
    const result = deriveNutritionPerServing(raw, 2);

    // Assert
    expect(result.macrosPerServing).toEqual({ proteinGrams: 20, carbsGrams: 30, fatGrams: 10 });
    expect(result.caloriesPerServing).toBe(300);
  });

  it('should discard macros inconsistent with kcal and preserve kcal', () => {
    // Arrange — wildly overstated macros relative to the stated kcal
    const raw = {
      caloriesPerServing: 300,
      totalWeightGrams: null,
      totalMacros: { proteinGrams: 200, carbsGrams: 200, fatGrams: 200 },
    };

    // Act
    const result = deriveNutritionPerServing(raw, 2);

    // Assert
    expect(result.macrosPerServing).toBeNull();
    expect(result.caloriesPerServing).toBe(300);
  });

  it('should reject a negative per-serving macro', () => {
    // Arrange — -10 g protein/serving after division
    const raw = {
      caloriesPerServing: 300,
      totalWeightGrams: null,
      totalMacros: { proteinGrams: -20, carbsGrams: 60, fatGrams: 20 },
    };

    // Act
    const result = deriveNutritionPerServing(raw, 2);

    // Assert
    expect(result.macrosPerServing).toBeNull();
  });

  it('should reject a per-serving macro above the 300 g ceiling', () => {
    // Arrange — 1000 g protein/serving, an obviously undivided or garbled figure
    const raw = {
      caloriesPerServing: 2000,
      totalWeightGrams: null,
      totalMacros: { proteinGrams: 1000, carbsGrams: 10, fatGrams: 10 },
    };

    // Act
    const result = deriveNutritionPerServing(raw, 1);

    // Assert
    expect(result.macrosPerServing).toBeNull();
  });

  it('should discard macros when kcal is null, even if the macro trio is plausible', () => {
    // Arrange — the Atwater check is impossible without kcal
    const raw = {
      caloriesPerServing: null,
      totalWeightGrams: null,
      totalMacros: { proteinGrams: 20, carbsGrams: 30, fatGrams: 10 },
    };

    // Act
    const result = deriveNutritionPerServing(raw, 1);

    // Assert
    expect(result.macrosPerServing).toBeNull();
  });

  it('should accept a legitimate 0 g fat when the rest of the trio is consistent', () => {
    // Arrange — per serving P20/C30/F0, kcal 210/serving: Atwater = 80 + 120 + 0 = 200
    const raw = {
      caloriesPerServing: 210,
      totalWeightGrams: null,
      totalMacros: { proteinGrams: 40, carbsGrams: 60, fatGrams: 0 },
    };

    // Act
    const result = deriveNutritionPerServing(raw, 2);

    // Assert — the fat gate must be `!= null`, never truthy: fatGrams: 0 must survive
    expect(result.macrosPerServing).toEqual({ proteinGrams: 20, carbsGrams: 30, fatGrams: 0 });
  });
});

describe('deriveNutritionPerServing — malformed payloads', () => {
  it('should degrade every field to null without throwing on a garbled response', () => {
    // Arrange
    const raw = {
      caloriesPerServing: 'quattrocento',
      totalWeightGrams: {},
      totalMacros: 'not an object',
    };

    // Act
    const result = deriveNutritionPerServing(raw, 4);

    // Assert
    expect(result).toEqual({
      caloriesPerServing: null,
      servingWeightGrams: null,
      macrosPerServing: null,
    });
  });

  it('should degrade to null without throwing when totalMacros is missing fields', () => {
    // Arrange
    const raw = {
      caloriesPerServing: 300,
      totalWeightGrams: null,
      totalMacros: { proteinGrams: 20 },
    };

    // Act
    const result = deriveNutritionPerServing(raw, 2);

    // Assert
    expect(result.macrosPerServing).toBeNull();
  });

  it('should handle a null or undefined raw payload without throwing', () => {
    // Act
    const nullResult = deriveNutritionPerServing(null, 4);
    const undefinedResult = deriveNutritionPerServing(undefined, 4);

    // Assert
    expect(nullResult).toEqual({ caloriesPerServing: null, servingWeightGrams: null, macrosPerServing: null });
    expect(undefinedResult).toEqual({ caloriesPerServing: null, servingWeightGrams: null, macrosPerServing: null });
  });
});
