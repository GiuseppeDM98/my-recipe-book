import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuthenticatedUser } from '@/lib/api/require-user';
import { AI_MODEL } from '@/lib/utils/constants';

/**
 * Calorie Estimation API
 *
 * Estimates kcal per serving from a recipe's ingredient list.
 *
 * WHY A SEPARATE ENDPOINT:
 * Extraction and formatting are bound to their source ("riporta le quantità esattamente
 * come nel documento"); a calorie figure is never in the source, it is computed. Keeping
 * the estimate in its own call leaves those endpoints faithful and lets this one serve
 * every flow — PDF, free text, chat, and recipes already in the cookbook. Same split as
 * /api/suggest-category.
 *
 * WHY PER SERVING:
 * `servings` is editable in the recipe form and is scaled at runtime by cooking mode. A
 * stored total would drift out of sync the first time either changed; a per-serving figure
 * stays correct and can always be multiplied back up.
 */

/** Below this, a "recipe" is a garnish or a mistake rather than a serving. */
const MIN_PLAUSIBLE_KCAL = 20;

/** Above this, the model has almost certainly returned a whole-recipe total. */
const MAX_PLAUSIBLE_KCAL = 3000;

interface EstimateCaloriesIngredient {
  name: string;
  quantity: string;
}

/**
 * Builds the estimation prompt.
 *
 * The instructions push the model through the arithmetic explicitly (total first, then
 * divide) because asking directly for a per-serving figure invites it to pattern-match a
 * plausible-looking number for the dish instead of adding up what's actually on the list.
 */
function createCalorieEstimationPrompt(
  recipeTitle: string,
  ingredients: EstimateCaloriesIngredient[],
  servings: number
): string {
  const ingredientList = ingredients
    .map(ingredient => `- ${ingredient.quantity} ${ingredient.name}`.trim())
    .join('\n');

  return `Stima le calorie di questa ricetta italiana.

**Ricetta:** ${recipeTitle}
**Porzioni:** ${servings}

**Ingredienti:**
${ingredientList}

**Come procedere:**
1. Calcola le kcal totali sommando il contributo di ogni ingrediente con una quantità numerica utilizzabile.
2. Dividi il totale per il numero di porzioni (${servings}).
3. Arrotonda il risultato alla decina più vicina.

**Regole:**
- Ignora gli ingredienti senza quantità numerica (es. "sale q.b.", "prezzemolo a piacere"), TRANNE olio, burro e altri grassi da condimento: quelli incidono troppo, stimane una quantità ragionevole per il tipo di piatto.
- Considera solo ciò che finisce nel piatto: l'olio di frittura assorbito è una frazione di quello nella pentola, l'acqua di cottura della pasta non conta.
- Usa valori nutrizionali medi per gli ingredienti italiani comuni.
- Se gli ingredienti sono troppo vaghi o privi di quantità per una stima sensata, restituisci null.

**Confidenza:**
- "alta": quasi tutti gli ingredienti hanno quantità precise
- "media": alcune quantità stimate o approssimate
- "bassa": molte quantità mancanti o ambigue`;
}

/**
 * JSON schema for the response.
 *
 * `caloriesPerServing` is nullable by design: "non lo so" must be expressible, otherwise
 * the model is forced to invent a number for a recipe it cannot actually estimate.
 */
const CALORIE_ESTIMATION_SCHEMA = {
  type: 'object',
  properties: {
    caloriesPerServing: {
      type: ['integer', 'null'],
      description: 'Kcal stimate per una porzione, arrotondate alla decina. null se non stimabile.',
    },
    confidence: {
      type: 'string',
      enum: ['alta', 'media', 'bassa'],
      description: 'Quanto sono precise le quantità disponibili.',
    },
  },
  required: ['caloriesPerServing', 'confidence'],
  additionalProperties: false,
} as const;

/**
 * POST /api/estimate-calories
 *
 * Body: { recipeTitle: string, ingredients: {name, quantity}[], servings: number }
 * Returns: { success: true, caloriesPerServing: number | null, confidence: 'alta'|'media'|'bassa' }
 *
 * A `null` estimate is a successful response, not an error: the caller shows a message and
 * writes nothing rather than persisting a fabricated number.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser(request);
    if (authResult.response) {
      return authResult.response;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key di Anthropic non configurata' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { recipeTitle, ingredients, servings } = body;

    if (!recipeTitle || !Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json(
        { error: 'Parametri mancanti: recipeTitle e ingredients sono richiesti' },
        { status: 400 }
      );
    }

    // Guard the divisor before it reaches the prompt: servings of 0 would ask the model
    // to divide by zero, and it would answer something rather than refuse.
    const servingsCount = Number(servings);
    if (!Number.isFinite(servingsCount) || servingsCount < 1) {
      return NextResponse.json(
        { error: 'Numero di porzioni non valido: serve almeno 1 porzione' },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 900,
      // Adaptive: the estimate is arithmetic across a dozen ingredients, which is worth a
      // little reasoning. Effort stays low — this is not a hard problem, just a multi-step one.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: CALORIE_ESTIMATION_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: createCalorieEstimationPrompt(recipeTitle, ingredients, servingsCount),
        },
      ],
    });

    const responseText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { text: string }).text)
      .join('\n')
      .trim();

    const estimate = JSON.parse(responseText);
    const rawCalories = estimate.caloriesPerServing;

    // Reject implausible figures rather than storing them. The most common failure is a
    // whole-recipe total that skipped the division step, which lands far above the ceiling.
    const isPlausible =
      typeof rawCalories === 'number' &&
      Number.isFinite(rawCalories) &&
      rawCalories >= MIN_PLAUSIBLE_KCAL &&
      rawCalories <= MAX_PLAUSIBLE_KCAL;

    return NextResponse.json({
      success: true,
      caloriesPerServing: isPlausible ? Math.round(rawCalories) : null,
      confidence: estimate.confidence ?? 'bassa',
    });
  } catch (error: any) {
    console.error('Error estimating calories:', error);

    return NextResponse.json(
      {
        error: 'Errore durante la stima delle calorie',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
