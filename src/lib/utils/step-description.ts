import { Ingredient, Step } from '@/types';
import { scaleQuantity } from './ingredient-scaler';

const STEP_QUANTITY_TOKEN_REGEX = /\{\{qty:([^}]+)\}\}/g;
const INGREDIENT_STOP_WORDS = new Set([
  'di', 'del', 'della', 'dello', 'dei', 'degli', 'delle',
  'a', 'da', 'con', 'per', 'il', 'lo', 'la', 'i', 'gli', 'le',
  'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'ed', 'e',
  'restanti', 'restante', 'quanto', 'q', 'qb',
]);

/**
 * Build the internal token stored in Step.description for an ingredient quantity.
 *
 * The token format is intentionally simple and ASCII-only so it survives
 * copy/paste, Firebase storage, and plain-text editors without extra escaping.
 */
export function createStepQuantityToken(ingredientId: string): string {
  return `{{qty:${ingredientId}}}`;
}

/**
 * Resolve dynamic quantity tokens inside a step description.
 *
 * The function is backward compatible with legacy free-text steps:
 * if no token is present, the original description is returned unchanged.
 * If a token cannot be resolved, it is left as-is to avoid silently altering
 * user-authored instructions.
 */
export function renderStepDescription(
  step: Step,
  ingredients: Ingredient[],
  originalServings: number,
  targetServings: number
): string {
  return step.description.replace(STEP_QUANTITY_TOKEN_REGEX, (token, ingredientId: string) => {
    const ingredient = ingredients.find(item => item.id === ingredientId);

    if (!ingredient?.quantity) {
      return token;
    }

    if (originalServings <= 0 || targetServings <= 0) {
      return ingredient.quantity;
    }

    return scaleQuantity(ingredient.quantity, originalServings, targetServings);
  });
}

/**
 * Extract the ingredient IDs referenced by quantity tokens in a description.
 * Used by the recipe form to show the active dynamic bindings for each step.
 */
export function listStepQuantityIngredientIds(description: string): string[] {
  const ingredientIds = new Set<string>();

  for (const match of description.matchAll(STEP_QUANTITY_TOKEN_REGEX)) {
    const ingredientId = match[1]?.trim();
    if (ingredientId) {
      ingredientIds.add(ingredientId);
    }
  }

  return Array.from(ingredientIds);
}

interface AdaptedStepsResult {
  steps: Step[];
  convertedCount: number;
  skippedCount: number;
}

/**
 * Convert legacy static quantities in step text into dynamic quantity tokens.
 *
 * The matcher is intentionally conservative:
 * - quantity must appear verbatim in the step text
 * - ingredient must have at least one meaningful keyword overlap with the step
 * - ambiguous matches are skipped rather than guessed
 */
export function adaptStepsToDynamicQuantities(
  steps: Step[],
  ingredients: Ingredient[]
): AdaptedStepsResult {
  let convertedCount = 0;
  let skippedCount = 0;

  const nextSteps = steps.map(step => {
    const originalDescription = step.description;
    let nextDescription = originalDescription;
    const usedIngredientIds = new Set(listStepQuantityIngredientIds(step.description));
    const matches = findAdaptableMatches(step.description, ingredients)
      .filter(match => !usedIngredientIds.has(match.ingredient.id))
      .sort((a, b) => b.quantity.length - a.quantity.length);

    matches.forEach(match => {
      const token = createStepQuantityToken(match.ingredient.id);
      if (nextDescription.includes(match.quantity)) {
        nextDescription = nextDescription.replace(match.quantity, token);
        usedIngredientIds.add(match.ingredient.id);
      }
    });

    if (nextDescription !== originalDescription) {
      convertedCount += 1;
      return { ...step, description: nextDescription };
    }

    skippedCount += 1;
    return step;
  });

  return {
    steps: nextSteps,
    convertedCount,
    skippedCount,
  };
}

function findAdaptableMatches(description: string, ingredients: Ingredient[]) {
  const normalizedDescription = normalizeText(description);
  const candidates = ingredients
    .filter(ingredient => ingredient.quantity && description.includes(ingredient.quantity))
    .map(ingredient => {
      const keywordMatches = getIngredientKeywords(ingredient.name)
        .filter(keyword => normalizedDescription.includes(keyword));

      return {
        ingredient,
        quantity: ingredient.quantity,
        keywordScore: keywordMatches.length,
      };
    })
    .filter(candidate => candidate.keywordScore > 0);

  return candidates.filter(candidate => {
    const competingCandidates = candidates.filter(other =>
      other !== candidate &&
      other.quantity === candidate.quantity &&
      other.keywordScore === candidate.keywordScore
    );

    return competingCandidates.length === 0;
  });
}

function getIngredientKeywords(name: string): string[] {
  const normalizedName = normalizeText(name);
  const rawKeywords = normalizedName
    .split(/\s+/)
    .filter(part => part.length >= 3)
    .filter(part => !INGREDIENT_STOP_WORDS.has(part));

  const compactKeywords = normalizedName
    .split(/[()]/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part.replace(/^per\s+/, '').trim())
    .filter(part => part.length >= 4);

  return Array.from(new Set([...rawKeywords, ...compactKeywords]));
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
