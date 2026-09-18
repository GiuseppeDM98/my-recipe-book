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

/**
 * Builds a minimal recipe markdown with a single ingredient under the given header,
 * so a test can assert on the section name the parser derives from that header alone.
 */
function parseIngredientSectionOf(header: string): string | null | undefined {
  const markdown = `
# Ricetta di prova

${header}
- Farina, 500 g
`.trim();

  const [recipe] = parseExtractedRecipes(markdown);
  return recipe.ingredients[0].section;
}

describe('recipe-parser section headers', () => {
  test.each([
    ['## Ingredienti', null],
    ['## Ingredienti ', null],
    ['## Ingredienti:', null],
    ['## Ingredienti per la pasta', 'Per la pasta'],
    ['## Ingredienti La pasta', 'La pasta'],
    ['## Ingredienti Il ragù', 'Il ragù'],
    ["## Ingredienti per l'impasto", "Per l'impasto"],
    ['## Ingredienti la farcitura', 'La farcitura'],
    ['## Ingredienti per la crema:', 'Per la crema'],
    ['## Ingredienti PER IL SUGO', 'Per IL SUGO'],
  ])('should derive the ingredient section from %p', (header, expectedSection) => {
    expect(parseIngredientSectionOf(header)).toBe(expectedSection);
  });

  test('should not treat an all-caps header as a section header', () => {
    // The `startsWith('## Ingredienti')` guard is case-sensitive, so the line is never
    // recognized as a header: it falls through and no ingredient section is opened.
    const markdown = `
# Ricetta di prova

## INGREDIENTI PER LA BASE
- Farina, 500 g
`.trim();

    const [recipe] = parseExtractedRecipes(markdown);
    expect(recipe.ingredients).toHaveLength(0);
  });

  test('should keep both "per" and non-"per" ingredient sections in a mixed recipe', () => {
    const markdown = `
# Lasagne di prova

## Ingredienti per la pasta
- Farina, 300 g
- Uova, 3

## Ingredienti Il ragù
- Carne macinata, 500 g
- Passata di pomodoro, 700 g
`.trim();

    const [recipe] = parseExtractedRecipes(markdown);

    expect(recipe.ingredients.map(ing => ing.section)).toEqual([
      'Per la pasta',
      'Per la pasta',
      'Il ragù',
      'Il ragù',
    ]);
  });

  test('should increment sectionOrder across non-"per" step sections', () => {
    const markdown = `
# Lasagne di prova

## Procedimento La pasta
- Impasta la farina con le uova.
- Stendi la sfoglia sottile.

## Procedimento Il ragù
- Rosola la carne con il soffritto.

## Procedimento per l'assemblaggio
- Alterna sfoglia e ragù nella teglia.
`.trim();

    const [recipe] = parseExtractedRecipes(markdown);

    expect(recipe.steps.map(step => [step.section, step.sectionOrder])).toEqual([
      ['La pasta', 1],
      ['La pasta', 1],
      ['Il ragù', 2],
      ["Per l'assemblaggio", 3],
    ]);
  });

  test('should keep a bare "## Ingredienti" recipe section-free', () => {
    const markdown = `
# Insalata di prova

## Ingredienti
- Insalata, 200 g
- Pomodori, 3

## Procedimento
- Lava e taglia le verdure.
`.trim();

    const [recipe] = parseExtractedRecipes(markdown);

    expect(recipe.ingredients.every(ing => ing.section === null)).toBe(true);
    expect(recipe.steps.every(step => step.section === null)).toBe(true);
  });
});
