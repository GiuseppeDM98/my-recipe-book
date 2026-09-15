import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuthenticatedUser } from '@/lib/api/require-user';
import { AI_MODEL } from '@/lib/utils/constants';
import { deriveNutritionPerServing } from '@/lib/utils/nutrition-estimate';

/**
 * Nutrition Estimation API
 *
 * Estimates kcal, serving weight and macronutrients per serving from a recipe's
 * ingredient list, in a single AI call.
 *
 * WHY A SEPARATE ENDPOINT:
 * Extraction and formatting are bound to their source ("riporta le quantità esattamente
 * come nel documento"); a nutrition figure is never in the source, it is computed. Keeping
 * the estimate in its own call leaves those endpoints faithful and lets this one serve
 * every flow — PDF, free text, chat, and recipes already in the cookbook. Same split as
 * /api/suggest-category.
 *
 * WHY PER SERVING:
 * `servings` is editable in the recipe form and is scaled at runtime by cooking mode. A
 * stored total would drift out of sync the first time either changed; a per-serving figure
 * stays correct and can always be multiplied back up.
 */

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
 * Weight and macros are requested as RECIPE TOTALS and divided by the server (see
 * `deriveNutritionPerServing`): one extra guard against the model silently skipping the
 * division for the newer fields.
 */
function createNutritionEstimationPrompt(
  recipeTitle: string,
  ingredients: EstimateCaloriesIngredient[],
  servings: number
): string {
  const ingredientList = ingredients
    .map(ingredient => `- ${ingredient.quantity} ${ingredient.name}`.trim())
    .join('\n');

  return `Stima i valori nutrizionali di questa ricetta italiana.

**Ricetta:** ${recipeTitle}
**Porzioni:** ${servings}

**Ingredienti:**
${ingredientList}

**Come procedere:**
1. Calcola le kcal totali sommando il contributo di ogni ingrediente con una quantità numerica utilizzabile.
2. Dividi il totale per il numero di porzioni (${servings}) e arrotonda alla decina più vicina: questo è caloriesPerServing.
3. Calcola i grammi TOTALI di proteine, carboidrati e grassi dell'intera ricetta, arrotondati all'intero: questi sono totalMacros. NON dividerli per le porzioni: la divisione la fa il server.
4. Stima il peso TOTALE in grammi della ricetta PRONTA, come arriva nel piatto: questo è totalWeightGrams. NON dividerlo per le porzioni.

**Regole per il peso della ricetta pronta:**
- Pasta, riso, cereali e legumi secchi assorbono acqua in cottura: usa il peso da cotti (pasta ≈ 2×, riso ≈ 2,5×, legumi secchi ≈ 2,5×).
- Sughi, brasati e riduzioni perdono acqua per evaporazione: sottrai una quota ragionevole.
- Vale la stessa regola delle kcal: conta solo ciò che finisce nel piatto — l'acqua di cottura scolata non pesa, l'olio di frittura assorbito è una frazione di quello nella pentola.
- Peso, macro e kcal devono descrivere la stessa ricetta pronta, in modo coerente tra loro.

**Regole:**
- Ignora gli ingredienti senza quantità numerica (es. "sale q.b.", "prezzemolo a piacere"), TRANNE olio, burro e altri grassi da condimento: quelli incidono troppo, stimane una quantità ragionevole per il tipo di piatto.
- Considera solo ciò che finisce nel piatto: l'olio di frittura assorbito è una frazione di quello nella pentola, l'acqua di cottura della pasta non conta.
- Usa valori nutrizionali medi per gli ingredienti italiani comuni.
- Ogni campo è indipendente: se non riesci a stimare il peso ma le kcal sì, restituisci null solo per totalWeightGrams (e viceversa). Se le quantità non bastano per i macro, restituisci totalMacros null.
- Verifica di coerenza: 4×proteine + 4×carboidrati + 9×grassi (totali) deve avvicinarsi alle kcal totali; se divergono molto, ricontrolla i calcoli prima di rispondere.
- Se gli ingredienti sono troppo vaghi o privi di quantità per una stima sensata, restituisci null su tutti i campi.

**Confidenza:**
- "alta": quasi tutti gli ingredienti hanno quantità precise
- "media": alcune quantità stimate o approssimate
- "bassa": molte quantità mancanti o ambigue`;
}

/**
 * JSON schema for the response.
 *
 * Every numeric field is nullable by design: "non lo so" must be expressible per field,
 * otherwise the model is forced to invent a number it cannot actually estimate. Only shape
 * and types here — no minimum/maximum/multipleOf, which make the whole request fail with
 * 400 (see AGENTS.md "json_schema with length constraints"); bounds are enforced server-side
 * by `deriveNutritionPerServing`.
 */
const NUTRITION_ESTIMATION_SCHEMA = {
  type: 'object',
  properties: {
    caloriesPerServing: {
      type: ['integer', 'null'],
      description: 'Kcal stimate per una porzione, arrotondate alla decina. null se non stimabile.',
    },
    totalWeightGrams: {
      type: ['integer', 'null'],
      description: 'Peso totale stimato della ricetta PRONTA in grammi, NON diviso per le porzioni. null se non stimabile.',
    },
    totalMacros: {
      type: ['object', 'null'],
      description: 'Grammi TOTALI di macronutrienti della ricetta intera, NON divisi per le porzioni. null se non stimabili.',
      properties: {
        proteinGrams: { type: 'integer', description: 'Proteine totali in grammi.' },
        carbsGrams: { type: 'integer', description: 'Carboidrati totali in grammi.' },
        fatGrams: { type: 'integer', description: 'Grassi totali in grammi.' },
      },
      required: ['proteinGrams', 'carbsGrams', 'fatGrams'],
      additionalProperties: false,
    },
    confidence: {
      type: 'string',
      enum: ['alta', 'media', 'bassa'],
      description: 'Quanto sono precise le quantità disponibili.',
    },
  },
  required: ['caloriesPerServing', 'totalWeightGrams', 'totalMacros', 'confidence'],
  additionalProperties: false,
} as const;

/**
 * POST /api/estimate-calories
 *
 * Body: { recipeTitle: string, ingredients: {name, quantity}[], servings: number }
 * Returns: { success: true, caloriesPerServing: number | null, servingWeightGrams: number | null,
 *            macrosPerServing: MacrosPerServing | null, confidence: 'alta'|'media'|'bassa' }
 *
 * A `null` estimate is a successful response, not an error: the caller shows a message and
 * writes nothing rather than persisting a fabricated number. Each field degrades to null
 * independently (see `deriveNutritionPerServing`).
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
      // 900 -> 1400: with thinking adaptive, reasoning tokens count within max_tokens, and
      // estimating kcal + 3 macros + weight per ingredient plus a ~10-field JSON output needs
      // more headroom than kcal alone. No added cost at rest (output tokens are paid only when
      // produced).
      max_tokens: 1400,
      // Adaptive: the estimate is arithmetic across a dozen ingredients, which is worth a
      // little reasoning. Effort stays low — this is not a hard problem, just a multi-step one.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: NUTRITION_ESTIMATION_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: createNutritionEstimationPrompt(recipeTitle, ingredients, servingsCount),
        },
      ],
    });

    const responseText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { text: string }).text)
      .join('\n')
      .trim();

    const estimate = JSON.parse(responseText);
    const derived = deriveNutritionPerServing(estimate, servingsCount);

    return NextResponse.json({
      success: true,
      ...derived,
      confidence: estimate.confidence ?? 'bassa',
    });
  } catch (error: any) {
    console.error('Error estimating nutrition:', error);

    return NextResponse.json(
      {
        error: 'Errore durante la stima dei valori nutrizionali',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
