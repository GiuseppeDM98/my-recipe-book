import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuthenticatedUser } from '@/lib/api/require-user';
import { AI_MODEL } from '@/lib/utils/constants';
import { sanitizeSectionProposal, SectionProposal } from '@/lib/utils/section-assignments';

/**
 * Recipe Reorganization API
 *
 * Proposes a split of an already-saved flat recipe into logical sections
 * ("Per la pasta", "Per il ragù"), for recipes that were generated or extracted
 * before the prompts learned to create sections.
 *
 * WHY IT RETURNS ASSIGNMENTS, NOT A RECIPE:
 * The model receives the item ids and answers with a mapping id → section. It never
 * rewrites a name, a quantity or a step, so the caller can apply the result knowing
 * that active cooking sessions (checked items are tracked by id) and the
 * `{{qty:ingredientId}}` tokens inside step text remain valid. Asking the model for a
 * whole restructured recipe would have put every one of those at the mercy of a
 * paraphrase.
 *
 * WHY IT DOESN'T WRITE:
 * The response is a proposal. The user reviews it in a dialog and the client persists
 * it — same shape as /api/estimate-calories, which also enriches an existing recipe
 * without touching Firestore itself.
 */

interface ReorganizeIngredient {
  id: string;
  name: string;
  quantity: string;
}

interface ReorganizeStep {
  id: string;
  description: string;
}

/**
 * Builds the reorganization prompt.
 *
 * Ids are printed in brackets next to each item so the model can key its answer on
 * them: it has no other way to address an ingredient unambiguously (two ingredients can
 * share a name, e.g. mozzarella in the filling and on top).
 */
function createReorganizePrompt(
  title: string,
  ingredients: ReorganizeIngredient[],
  steps: ReorganizeStep[]
): string {
  const ingredientList = ingredients
    .map(ingredient => `- [${ingredient.id}] ${ingredient.name}${ingredient.quantity ? `, ${ingredient.quantity}` : ''}`)
    .join('\n');

  const stepList = steps
    .map((step, index) => `${index + 1}. [${step.id}] ${step.description}`)
    .join('\n');

  return `Analizza questa ricetta italiana e proponi una suddivisione in sezioni per componenti logicamente distinte.

**Ricetta:** ${title}

**Ingredienti (con id):**
${ingredientList}

**Procedimento (con id, in ordine):**
${stepList}

**Regole:**
- Una sezione = una componente logicamente distinta della ricetta (es: impasto + farcitura, pasta + ragù, base + crema + copertura).
- Proponi da 2 a 5 sezioni. Se la ricetta è a componente unica (non ci sono almeno 2 componenti chiaramente distinte), imposta reorganizable a false e lascia gli array vuoti: NON inventare divisioni artificiali.
- Nomi sezione brevi in italiano, preferibilmente nella forma "Per la/il/i/le [componente]" (es: "Per la pasta", "Per il ragù"). Prima lettera maiuscola.
- Usa ESATTAMENTE gli stessi nomi di sezione per ingredienti e procedimento: ogni sezione di ingredienti deve avere la sezione di procedimento corrispondente.
- Assegna OGNI ingrediente e OGNI step a una sezione, usando ESATTAMENTE gli id forniti tra parentesi quadre. Non inventare id, non ometterne.
- Rispetta la sequenza del procedimento: gli step di una stessa sezione sono in genere contigui. NON proporre sezioni che richiederebbero di riordinare gli step.
- sectionOrder: 1 per la sezione il cui primo step compare per primo nel procedimento, 2 per la successiva, ecc.
- Un ingrediente usato in più componenti va assegnato alla sezione dove viene usato per primo o in quantità maggiore.`;
}

/**
 * JSON schema for the response.
 *
 * Shape and types only. Quantity constraints (`minItems`, `minimum`, `maxLength`…) are
 * not supported by structured outputs and make the whole request fail with a 400, so
 * "2 to 5 sections" and "assign every id" live in the prompt and are enforced after the
 * fact by sanitizeSectionProposal. See the json_schema gotcha in AGENTS.md.
 *
 * `reorganizable` is explicit rather than inferred from empty arrays so that "this
 * recipe has a single component" is something the model can state instead of having to
 * invent a split it doesn't believe in.
 */
const REORGANIZE_SCHEMA = {
  type: 'object',
  properties: {
    reorganizable: {
      type: 'boolean',
      description: 'true se la ricetta ha almeno 2 componenti logicamente distinte; false se è a componente unica.',
    },
    ingredientSections: {
      type: 'array',
      description: 'Assegnazione di OGNI ingrediente a una sezione. Vuoto se reorganizable è false.',
      items: {
        type: 'object',
        properties: {
          ingredientId: { type: 'string' },
          section: { type: 'string', description: 'Nome sezione, es. "Per la pasta".' },
        },
        required: ['ingredientId', 'section'],
        additionalProperties: false,
      },
    },
    stepSections: {
      type: 'array',
      description: 'Assegnazione di OGNI step a una sezione. Vuoto se reorganizable è false.',
      items: {
        type: 'object',
        properties: {
          stepId: { type: 'string' },
          section: { type: 'string' },
          sectionOrder: {
            type: 'integer',
            description: 'Ordine della sezione: 1 per la prima che compare nel procedimento, 2 per la seconda, ecc.',
          },
        },
        required: ['stepId', 'section', 'sectionOrder'],
        additionalProperties: false,
      },
    },
  },
  required: ['reorganizable', 'ingredientSections', 'stepSections'],
  additionalProperties: false,
} as const;

/** Only ids matter downstream; anything without one cannot be addressed in the answer. */
function hasUsableId(item: unknown): item is { id: string } {
  return !!item && typeof (item as { id?: unknown }).id === 'string' && (item as { id: string }).id.length > 0;
}

/**
 * POST /api/reorganize-recipe
 *
 * Body: { title: string, ingredients: {id, name, quantity}[], steps: {id, description}[] }
 * Returns:
 *   { success: true, reorganized: false }
 *   { success: true, reorganized: true, ingredientSections: [...], stepSections: [...] }
 *
 * `reorganized: false` is a successful response, not an error: "this recipe is fine as
 * it is" is a legitimate answer, and the caller shows a message rather than an error.
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
    const { title, ingredients, steps } = body;

    if (
      typeof title !== 'string' ||
      !title.trim() ||
      !Array.isArray(ingredients) ||
      ingredients.length === 0 ||
      !Array.isArray(steps) ||
      steps.length === 0
    ) {
      return NextResponse.json(
        { error: 'Parametri mancanti: title, ingredients e steps sono richiesti' },
        { status: 400 }
      );
    }

    const validIngredients: ReorganizeIngredient[] = ingredients.filter(hasUsableId).map(
      (ingredient: any) => ({
        id: ingredient.id,
        name: String(ingredient.name ?? ''),
        quantity: String(ingredient.quantity ?? ''),
      })
    );
    const validSteps: ReorganizeStep[] = steps.filter(hasUsableId).map((step: any) => ({
      id: step.id,
      description: String(step.description ?? ''),
    }));

    if (validIngredients.length === 0 || validSteps.length === 0) {
      return NextResponse.json(
        { error: 'Ingredienti e passaggi devono avere un id' },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: AI_MODEL,
      // Output is assignments only (~20 tokens per item): a 40-ingredient, 30-step recipe
      // fits well under 2000, and this leaves headroom.
      max_tokens: 3000,
      // Adaptive: grouping a procedure into components is a reading task with a bit of
      // sequencing to it. Low effort — same balance as extract/format.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: REORGANIZE_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: createReorganizePrompt(title.trim(), validIngredients, validSteps),
        },
      ],
    });

    const responseText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { text: string }).text)
      .join('\n')
      .trim();

    const parsed = JSON.parse(responseText);

    if (parsed.reorganizable !== true) {
      return NextResponse.json({ success: true, reorganized: false });
    }

    const proposal: SectionProposal = {
      ingredientSections: Array.isArray(parsed.ingredientSections) ? parsed.ingredientSections : [],
      stepSections: Array.isArray(parsed.stepSections) ? parsed.stepSections : [],
    };

    // The server owns the final answer: hallucinated ids are dropped, sectionOrder is
    // recomputed from the real step order, and a split that collapses to a single
    // section is reported as "nothing to reorganize" rather than applied.
    const sanitized = sanitizeSectionProposal(proposal, validIngredients, validSteps);

    if (!sanitized) {
      return NextResponse.json({ success: true, reorganized: false });
    }

    return NextResponse.json({
      success: true,
      reorganized: true,
      ingredientSections: sanitized.ingredientSections,
      stepSections: sanitized.stepSections,
    });
  } catch (error: any) {
    console.error('Error reorganizing recipe:', error);

    return NextResponse.json(
      {
        error: 'Errore durante la riorganizzazione della ricetta',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
