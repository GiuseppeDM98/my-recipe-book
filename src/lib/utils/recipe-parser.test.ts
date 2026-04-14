jest.mock('@/lib/firebase/client-auth', () => ({
  getFirebaseAuthHeader: jest.fn(async () => ({})),
}));

import { parseExtractedRecipes } from './recipe-parser';
import { renderStepDescription } from './step-description';

describe('recipe-parser AI quantity references', () => {
  test('should convert [ING:n] and [QTY:n] references into dynamic step tokens', () => {
    const markdown = `
---

# Torta di mele

## Ingredienti per l'impasto
- [ING:1] Mele (per cubetti), 300 g
- [ING:2] Mele (per fette), 100 g
- [ING:3] Zucchero, 150 g

---

## Procedimento per l'impasto
- Taglia [QTY:1] di mele a cubetti e i restanti [QTY:2] a fette sottili.
- Mescola [QTY:3] con la frutta.

---
`.trim();

    const [recipe] = parseExtractedRecipes(markdown);

    expect(recipe.ingredients).toHaveLength(3);
    expect(recipe.ingredients[0].name).toBe('Mele (per cubetti)');
    expect(recipe.steps[0].description).toContain('{{qty:');
    expect(recipe.steps[0].description).not.toContain('[QTY:1]');

    expect(
      renderStepDescription(recipe.steps[0], recipe.ingredients, 4, 5)
    ).toBe('Taglia 375 g di mele a cubetti e i restanti 125 g a fette sottili.');
  });
});
