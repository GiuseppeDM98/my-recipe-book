import { Ingredient, Step } from '@/types';
import {
  adaptStepsToDynamicQuantities,
  createStepQuantityToken,
  listStepQuantityIngredientIds,
  renderStepDescription,
} from './step-description';

describe('step-description utilities', () => {
  const ingredients: Ingredient[] = [
    { id: 'apple-cubes', name: 'Mele (per cubetti)', quantity: '300 g', section: 'Per l\'impasto' },
    { id: 'apple-slices', name: 'Mele (per fette)', quantity: '100 g', section: 'Per l\'impasto' },
    { id: 'salt', name: 'Sale', quantity: 'q.b.', section: null },
    { id: 'water', name: 'Acqua', quantity: '1,5 l', section: null },
    { id: 'oil', name: 'Olio EVO', quantity: '2-3 cucchiai', section: null },
  ];

  const createStep = (description: string): Step => ({
    id: 'step-1',
    order: 1,
    description,
    duration: null,
    section: null,
    sectionOrder: null,
  });

  test('should replace quantity token with the base ingredient quantity', () => {
    const step = createStep(
      `Taglia ${createStepQuantityToken('apple-cubes')} di mele a cubetti.`
    );

    expect(renderStepDescription(step, ingredients, 4, 4)).toBe('Taglia 300 g di mele a cubetti.');
  });

  test('should scale Italian decimal quantities and ranges through tokens', () => {
    const step = createStep(
      `Usa ${createStepQuantityToken('water')} di acqua, ${createStepQuantityToken('apple-slices')} di mele e ${createStepQuantityToken('oil')} di olio.`
    );

    expect(renderStepDescription(step, ingredients, 4, 8)).toBe(
      'Usa 3 l di acqua, 200 g di mele e 4-6 cucchiai di olio.'
    );
  });

  test('should keep non-scalable quantities unchanged', () => {
    const step = createStep(`Regola di ${createStepQuantityToken('salt')}.`);

    expect(renderStepDescription(step, ingredients, 4, 10)).toBe('Regola di q.b..');
  });

  test('should leave unresolved tokens unchanged', () => {
    const step = createStep(`Aggiungi ${createStepQuantityToken('missing-ingredient')} e mescola.`);

    expect(renderStepDescription(step, ingredients, 4, 6)).toBe(
      'Aggiungi {{qty:missing-ingredient}} e mescola.'
    );
  });

  test('should extract linked ingredient ids without duplicates', () => {
    const description = [
      createStepQuantityToken('apple-cubes'),
      createStepQuantityToken('apple-slices'),
      createStepQuantityToken('apple-cubes'),
    ].join(' ');

    expect(listStepQuantityIngredientIds(description)).toEqual([
      'apple-cubes',
      'apple-slices',
    ]);
  });

  test('should auto-adapt legacy step quantities when the ingredient match is clear', () => {
    const steps: Step[] = [
      createStep('Taglia 300 g di mele a cubetti e i restanti 100 g a fette sottili.'),
    ];

    const result = adaptStepsToDynamicQuantities(steps, ingredients);

    expect(result.convertedCount).toBe(1);
    expect(renderStepDescription(result.steps[0], ingredients, 4, 5)).toBe(
      'Taglia 375 g di mele a cubetti e i restanti 125 g a fette sottili.'
    );
  });

  test('should skip ambiguous legacy matches instead of guessing', () => {
    const ambiguousIngredients: Ingredient[] = [
      { id: 'sugar-a', name: 'Zucchero semolato', quantity: '100 g', section: null },
      { id: 'sugar-b', name: 'Zucchero di canna', quantity: '100 g', section: null },
    ];
    const steps: Step[] = [createStep('Unisci 100 g di zucchero al composto.')];

    const result = adaptStepsToDynamicQuantities(steps, ambiguousIngredients);

    expect(result.convertedCount).toBe(0);
    expect(result.steps[0].description).toBe('Unisci 100 g di zucchero al composto.');
  });
});
