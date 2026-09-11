import { Ingredient, Recipe, Step } from '@/types';
import {
  applySectionAssignments,
  hasNamedSections,
  orderedSectionNamesFromSteps,
  sanitizeSectionProposal,
  summarizeSectionProposal,
  SectionProposal,
} from './section-assignments';

function makeIngredient(id: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return { id, name: `Ingrediente ${id}`, quantity: '100 g', ...overrides };
}

function makeStep(id: string, order: number, overrides: Partial<Step> = {}): Step {
  return { id, order, description: `Passaggio ${id}`, duration: null, ...overrides };
}

/** Minimal recipe shape for hasNamedSections, which only reads the two arrays. */
function makeRecipeShape(
  ingredients: Ingredient[],
  steps: Step[]
): Pick<Recipe, 'ingredients' | 'steps'> {
  return { ingredients, steps };
}

describe('sanitizeSectionProposal', () => {
  const ingredients = [makeIngredient('i1'), makeIngredient('i2'), makeIngredient('i3')];
  const steps = [makeStep('s1', 1), makeStep('s2', 2), makeStep('s3', 3)];

  test('should drop assignments referencing ids the recipe does not contain', () => {
    // Arrange
    const proposal: SectionProposal = {
      ingredientSections: [
        { ingredientId: 'i1', section: 'Per la base' },
        { ingredientId: 'inventato', section: 'Per la crema' },
        { ingredientId: 'i2', section: 'Per la crema' },
      ],
      stepSections: [
        { stepId: 's1', section: 'Per la base', sectionOrder: 1 },
        { stepId: 'mai-esistito', section: 'Per la crema', sectionOrder: 2 },
      ],
    };

    // Act
    const sanitized = sanitizeSectionProposal(proposal, ingredients, steps);

    // Assert
    expect(sanitized?.ingredientSections.map(a => a.ingredientId)).toEqual(['i1', 'i2']);
    expect(sanitized?.stepSections.map(a => a.stepId)).toEqual(['s1']);
  });

  test('should drop assignments with an empty or non-string section name', () => {
    // Arrange
    const proposal = {
      ingredientSections: [
        { ingredientId: 'i1', section: 'Per la base' },
        { ingredientId: 'i2', section: '   ' },
        { ingredientId: 'i3', section: 42 },
      ],
      stepSections: [{ stepId: 's1', section: '', sectionOrder: 1 }],
    } as unknown as SectionProposal;

    // Act
    const sanitized = sanitizeSectionProposal(proposal, ingredients, steps);

    // Assert: only one usable ingredient section survives → below the useful threshold
    expect(sanitized).toBeNull();
  });

  test('should trim section names so the same section is not counted twice', () => {
    // Arrange
    const proposal: SectionProposal = {
      ingredientSections: [
        { ingredientId: 'i1', section: '  Per la base  ' },
        { ingredientId: 'i2', section: 'Per la base' },
        { ingredientId: 'i3', section: 'Per la crema' },
      ],
      stepSections: [],
    };

    // Act
    const sanitized = sanitizeSectionProposal(proposal, ingredients, steps);

    // Assert
    expect(sanitized?.ingredientSections.map(a => a.section)).toEqual([
      'Per la base',
      'Per la base',
      'Per la crema',
    ]);
  });

  test('should recompute sectionOrder from the real step order, ignoring the model numbers', () => {
    // Arrange: the model numbers the sections backwards
    const proposal: SectionProposal = {
      ingredientSections: [
        { ingredientId: 'i1', section: 'Per la base' },
        { ingredientId: 'i2', section: 'Per la crema' },
      ],
      stepSections: [
        { stepId: 's1', section: 'Per la base', sectionOrder: 7 },
        { stepId: 's2', section: 'Per la crema', sectionOrder: 3 },
        { stepId: 's3', section: 'Per la base', sectionOrder: 7 },
      ],
    };

    // Act
    const sanitized = sanitizeSectionProposal(proposal, ingredients, steps);

    // Assert: first section to appear in the procedure is 1, the next is 2
    expect(sanitized?.stepSections).toEqual([
      { stepId: 's1', section: 'Per la base', sectionOrder: 1 },
      { stepId: 's2', section: 'Per la crema', sectionOrder: 2 },
      { stepId: 's3', section: 'Per la base', sectionOrder: 1 },
    ]);
  });

  test('should order step sections by the recipe sequence even if the proposal is shuffled', () => {
    // Arrange: assignments arrive out of order
    const proposal: SectionProposal = {
      ingredientSections: [
        { ingredientId: 'i1', section: 'Per la base' },
        { ingredientId: 'i2', section: 'Per la crema' },
      ],
      stepSections: [
        { stepId: 's3', section: 'Per la crema', sectionOrder: 1 },
        { stepId: 's1', section: 'Per la base', sectionOrder: 2 },
      ],
    };

    // Act
    const sanitized = sanitizeSectionProposal(proposal, ingredients, steps);

    // Assert
    expect(sanitized?.stepSections).toEqual([
      { stepId: 's1', section: 'Per la base', sectionOrder: 1 },
      { stepId: 's3', section: 'Per la crema', sectionOrder: 2 },
    ]);
  });

  test('should return null when fewer than two distinct ingredient sections remain', () => {
    // Arrange
    const proposal: SectionProposal = {
      ingredientSections: [
        { ingredientId: 'i1', section: 'Per la base' },
        { ingredientId: 'i2', section: 'Per la base' },
      ],
      stepSections: [{ stepId: 's1', section: 'Per la base', sectionOrder: 1 }],
    };

    // Act & Assert
    expect(sanitizeSectionProposal(proposal, ingredients, steps)).toBeNull();
  });

  test('should return null when discarding invented ids leaves a single section', () => {
    // Arrange
    const proposal: SectionProposal = {
      ingredientSections: [
        { ingredientId: 'i1', section: 'Per la base' },
        { ingredientId: 'i2', section: 'Per la base' },
        { ingredientId: 'fantasma', section: 'Per la crema' },
      ],
      stepSections: [],
    };

    // Act & Assert
    expect(sanitizeSectionProposal(proposal, ingredients, steps)).toBeNull();
  });

  test('should return null for an empty proposal', () => {
    expect(
      sanitizeSectionProposal({ ingredientSections: [], stepSections: [] }, ingredients, steps)
    ).toBeNull();
  });
});

describe('applySectionAssignments', () => {
  const ingredients = [
    makeIngredient('i1', { name: 'Farina', quantity: '300 g' }),
    makeIngredient('i2', { name: 'Panna', quantity: '200 ml' }),
    makeIngredient('i3', { name: 'Sale', quantity: 'q.b.' }),
  ];
  const steps = [
    makeStep('s1', 1, { description: 'Impasta la farina.', duration: 10 }),
    makeStep('s2', 2, { description: 'Monta la panna.' }),
    makeStep('s3', 3, { description: 'Assembla il dolce.' }),
  ];
  const proposal: SectionProposal = {
    ingredientSections: [
      { ingredientId: 'i1', section: 'Per la base' },
      { ingredientId: 'i2', section: 'Per la crema' },
    ],
    stepSections: [
      { stepId: 's1', section: 'Per la base', sectionOrder: 1 },
      { stepId: 's2', section: 'Per la crema', sectionOrder: 2 },
    ],
  };

  test('should assign the proposed sections without touching any other field', () => {
    // Act
    const result = applySectionAssignments(ingredients, steps, proposal);

    // Assert
    expect(result.ingredients.map(i => [i.id, i.section])).toEqual([
      ['i1', 'Per la base'],
      ['i2', 'Per la crema'],
      ['i3', null],
    ]);
    expect(result.steps.map(s => [s.id, s.section, s.sectionOrder])).toEqual([
      ['s1', 'Per la base', 1],
      ['s2', 'Per la crema', 2],
      ['s3', null, null],
    ]);

    // Everything the proposal must not influence is byte-identical
    const stripSections = <T extends { section?: unknown; sectionOrder?: unknown }>(item: T) => {
      const { section, sectionOrder, ...rest } = item;
      return rest;
    };
    expect(result.ingredients.map(stripSections)).toEqual(ingredients.map(stripSections));
    expect(result.steps.map(stripSections)).toEqual(steps.map(stripSections));
  });

  test('should never emit undefined, which Firestore would reject', () => {
    // Act
    const result = applySectionAssignments(ingredients, steps, proposal);

    // Assert: a JSON round-trip drops undefined values, so nothing may be lost by it
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    for (const step of result.steps) {
      expect(step.section).not.toBeUndefined();
      expect(step.sectionOrder).not.toBeUndefined();
    }
    for (const ingredient of result.ingredients) {
      expect(ingredient.section).not.toBeUndefined();
    }
  });

  test('should clear sections previously present on unassigned items', () => {
    // Arrange
    const previouslySectioned = [makeIngredient('i1', { section: 'Vecchia sezione' })];
    const previouslySectionedSteps = [
      makeStep('s1', 1, { section: 'Vecchia sezione', sectionOrder: 4 }),
    ];

    // Act
    const result = applySectionAssignments(previouslySectioned, previouslySectionedSteps, {
      ingredientSections: [],
      stepSections: [],
    });

    // Assert
    expect(result.ingredients[0].section).toBeNull();
    expect(result.steps[0].section).toBeNull();
    expect(result.steps[0].sectionOrder).toBeNull();
  });

  test('should not mutate the input arrays', () => {
    // Act
    applySectionAssignments(ingredients, steps, proposal);

    // Assert
    expect(ingredients[0].section).toBeUndefined();
    expect(steps[0].section).toBeUndefined();
  });
});

describe('hasNamedSections', () => {
  test('should return false for a flat recipe', () => {
    const recipe = makeRecipeShape([makeIngredient('i1')], [makeStep('s1', 1)]);
    expect(hasNamedSections(recipe)).toBe(false);
  });

  test('should return false when the only section is the form artifact "Ingredienti"', () => {
    const recipe = makeRecipeShape(
      [makeIngredient('i1', { section: 'Ingredienti' }), makeIngredient('i2', { section: 'Ingredienti' })],
      [makeStep('s1', 1, { section: null })]
    );
    expect(hasNamedSections(recipe)).toBe(false);
  });

  test('should return true when "Ingredienti" sits alongside a real section', () => {
    const recipe = makeRecipeShape(
      [makeIngredient('i1', { section: 'Ingredienti' }), makeIngredient('i2', { section: 'Per la crema' })],
      [makeStep('s1', 1)]
    );
    expect(hasNamedSections(recipe)).toBe(true);
  });

  test('should return true when only the steps carry sections', () => {
    const recipe = makeRecipeShape(
      [makeIngredient('i1')],
      [makeStep('s1', 1, { section: 'Per il ragù', sectionOrder: 1 })]
    );
    expect(hasNamedSections(recipe)).toBe(true);
  });
});

describe('orderedSectionNamesFromSteps', () => {
  test('should return the section names in cooking order, from sectionOrder', () => {
    const steps = [
      makeStep('s1', 1, { section: 'Per il ragù', sectionOrder: 1 }),
      makeStep('s2', 2, { section: 'Per il ragù', sectionOrder: 1 }),
      makeStep('s3', 3, { section: 'Per la besciamella', sectionOrder: 2 }),
      makeStep('s4', 4, { section: "Per l'assemblaggio", sectionOrder: 3 }),
    ];

    expect(orderedSectionNamesFromSteps(steps)).toEqual([
      'Per il ragù',
      'Per la besciamella',
      "Per l'assemblaggio",
    ]);
  });

  test('should realign an ingredient list whose array order contradicts the steps', () => {
    // Il caso trovato nel collaudo guidato: la lasagna riorganizzata aveva "sfoglie" come
    // primo ingrediente, quindi la colonna Ingredienti apriva con "Per l'assemblaggio"
    // mentre il procedimento, giustamente, partiva dal ragù.
    const ingredientsAsStored = [
      makeIngredient('i1', { section: "Per l'assemblaggio" }),
      makeIngredient('i2', { section: 'Per il ragù' }),
      makeIngredient('i3', { section: 'Per la besciamella' }),
    ];
    const steps = [
      makeStep('s1', 1, { section: 'Per il ragù', sectionOrder: 1 }),
      makeStep('s2', 2, { section: 'Per la besciamella', sectionOrder: 2 }),
      makeStep('s3', 3, { section: "Per l'assemblaggio", sectionOrder: 3 }),
    ];

    const arrayOrder = [...new Set(ingredientsAsStored.map(i => i.section))];
    const cookingOrder = orderedSectionNamesFromSteps(steps);

    expect(arrayOrder).not.toEqual(cookingOrder);
    expect(cookingOrder).toEqual(['Per il ragù', 'Per la besciamella', "Per l'assemblaggio"]);
  });

  test('should fall back to step position when sectionOrder is missing', () => {
    const steps = [
      makeStep('s1', 1, { section: 'Per la copertura' }),
      makeStep('s2', 2, { section: 'Per la base' }),
    ];

    expect(orderedSectionNamesFromSteps(steps)).toEqual(['Per la copertura', 'Per la base']);
  });

  test('should return an empty list for a recipe whose steps have no sections', () => {
    expect(orderedSectionNamesFromSteps([makeStep('s1', 1), makeStep('s2', 2)])).toEqual([]);
  });
});

describe('summarizeSectionProposal', () => {
  test('should count items per section, unassigned last', () => {
    // Arrange
    const ingredients = [makeIngredient('i1'), makeIngredient('i2'), makeIngredient('i3')];
    const steps = [makeStep('s1', 1), makeStep('s2', 2)];
    const proposal: SectionProposal = {
      ingredientSections: [
        { ingredientId: 'i1', section: 'Per la base' },
        { ingredientId: 'i2', section: 'Per la crema' },
      ],
      stepSections: [
        { stepId: 's1', section: 'Per la base', sectionOrder: 1 },
        { stepId: 's2', section: 'Per la crema', sectionOrder: 2 },
      ],
    };

    // Act
    const summary = summarizeSectionProposal(ingredients, steps, proposal);

    // Assert
    expect(summary).toEqual([
      { section: 'Per la base', ingredientCount: 1, stepCount: 1 },
      { section: 'Per la crema', ingredientCount: 1, stepCount: 1 },
      { section: null, ingredientCount: 1, stepCount: 0 },
    ]);
  });

  test('should preview sections in cooking order, not in ingredient-list order', () => {
    // Arrange: il caso trovato nel collaudo guidato — il primo ingrediente della lista
    // piatta (le sfoglie) appartiene all'ULTIMA componente che si prepara.
    const ingredients = [makeIngredient('sfoglie'), makeIngredient('carne'), makeIngredient('latte')];
    const steps = [makeStep('rosola', 1), makeStep('besciamella', 2), makeStep('assembla', 3)];
    const proposal: SectionProposal = {
      ingredientSections: [
        { ingredientId: 'sfoglie', section: "Per l'assemblaggio" },
        { ingredientId: 'carne', section: 'Per il ragù' },
        { ingredientId: 'latte', section: 'Per la besciamella' },
      ],
      stepSections: [
        { stepId: 'rosola', section: 'Per il ragù', sectionOrder: 1 },
        { stepId: 'besciamella', section: 'Per la besciamella', sectionOrder: 2 },
        { stepId: 'assembla', section: "Per l'assemblaggio", sectionOrder: 3 },
      ],
    };

    // Act
    const summary = summarizeSectionProposal(ingredients, steps, proposal);

    // Assert
    expect(summary.map(row => row.section)).toEqual([
      'Per il ragù',
      'Per la besciamella',
      "Per l'assemblaggio",
    ]);
  });
});
