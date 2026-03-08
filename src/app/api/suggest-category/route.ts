import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

/**
 * AI-Powered Category and Season Suggestion API
 *
 * Why: Reduces manual categorization work for users by analyzing recipe
 * title and ingredients against seasonal reference data and existing categories.
 *
 * How: Uses Claude AI to suggest the most appropriate category and season
 * based on Italian culinary traditions and ingredient seasonality.
 */

// Same seasonal data as extract-recipes endpoint for consistency.
// Italian-specific ingredients categorized by traditional growing season.
const ITALIAN_SEASONAL_INGREDIENTS = {
  primavera: ['asparagi', 'carciofi', 'fave', 'piselli', 'fragole', 'agretti', 'rucola', 'ravanelli', 'cipollotti', 'lattuga'],
  estate: ['pomodori', 'melanzane', 'zucchine', 'peperoni', 'basilico', 'cetrioli', 'pesche', 'albicocche', 'melone', 'anguria', 'fagiolini'],
  autunno: ['zucca', 'funghi', 'castagne', 'radicchio', 'cavolo', 'broccoli', 'uva', 'pere', 'mele', 'fichi'],
  inverno: ['cavolo nero', 'cavolfiore', 'finocchi', 'agrumi', 'arance', 'mandarini', 'limoni', 'cime di rapa', 'porri', 'rape']
};

/**
 * Builds structured prompt for AI-powered recipe categorization.
 *
 * @param recipeTitle - Title of the recipe to categorize
 * @param ingredients - List of ingredient names for seasonal analysis
 * @param userCategories - User's existing categories for matching consistency
 * @returns Prompt string requesting strict JSON format (no markdown wrappers)
 *
 * Logic: AI first attempts to match existing categories to maintain consistency.
 * If no match, suggests new appropriate category name.
 */
function createCategorizationPrompt(recipeTitle: string, ingredients: string[], userCategories: { name: string }[]): string {
  const categoryList = userCategories.length > 0
    ? userCategories.map(c => c.name).join(', ')
    : 'Nessuna categoria esistente';

  const seasonalInfo = Object.entries(ITALIAN_SEASONAL_INGREDIENTS)
    .map(([season, items]) => `${season}: ${items.join(', ')}`)
    .join('\n');

  return `Analizza questa ricetta italiana e fornisci suggerimenti per categoria e stagionalità.

**Ricetta:** ${recipeTitle}
**Ingredienti principali:** ${ingredients.join(', ')}

**Categorie esistenti dell'utente:** ${categoryList}

**Ingredienti stagionali italiani di riferimento:**
${seasonalInfo}

**Rispondi SOLO con un JSON in questo formato esatto (senza markdown, senza backticks):**
(We request pure JSON without markdown because it's easier to parse reliably,
reduces response size for faster/cheaper API calls. However, some LLMs still
wrap in code blocks, so we handle both cases defensively.)
{
  "category": "nome_categoria",
  "season": "primavera|estate|autunno|inverno|tutte_stagioni",
  "isNewCategory": true/false
}

**Regole per la categoria:**
- Se la ricetta corrisponde a una categoria esistente, usa ESATTAMENTE quel nome
- Se non corrisponde a nessuna categoria esistente, proponi un nuovo nome appropriato (es: "Primi piatti", "Dolci", "Secondi piatti", "Antipasti", "Contorni", ecc.)
- Imposta "isNewCategory" a true solo se proponi una categoria nuova
  (The isNewCategory flag tells frontend whether to create new category in Firebase
  or use existing categoryId. This prevents duplicate category creation.)

**Regole per la stagione:**
- Analizza gli ingredienti principali e determina la stagione più appropriata
- Se la ricetta contiene ingredienti specifici di una stagione, usa quella stagione
- Se la ricetta usa ingredienti disponibili tutto l'anno o di stagioni diverse, usa "tutte_stagioni"
- Considera la tradizione culinaria italiana (es: "pasta al forno" è più invernale, "pasta fredda" è estiva)

Rispondi SOLO con il JSON, nient'altro.`;
}

/**
 * POST /api/suggest-category
 *
 * Suggests category and season for a recipe using Claude AI.
 *
 * Validation:
 * - Requires: recipeTitle and ingredients
 * - Optional: userCategories (for matching existing categories)
 *
 * Error handling: JSON parsing with markdown wrapper removal (defensive).
 *
 * Returns: Structured suggestion object with categoryName, season, and isNewCategory flag.
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key di Anthropic non configurata' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { recipeTitle, ingredients, userCategories } = body;

    if (!recipeTitle || !ingredients) {
      return NextResponse.json(
        { error: 'Parametri mancanti: recipeTitle e ingredients sono richiesti' },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    const prompt = createCategorizationPrompt(recipeTitle, ingredients, userCategories || []);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as any).text)
      .join('\n')
      .trim();

    // Parse JSON response, removing any potential markdown formatting.
    // Claude sometimes wraps JSON in markdown code blocks (```json...```)
    // despite instructions. This defensive parsing handles both plain and wrapped responses.
    let jsonText = responseText;
    if (jsonText.includes('```')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    const suggestion = JSON.parse(jsonText);

    return NextResponse.json({
      success: true,
      suggestion: {
        categoryName: suggestion.category,
        season: suggestion.season,
        isNewCategory: suggestion.isNewCategory
      }
    });
  } catch (error: any) {
    console.error('Error getting AI suggestion:', error);

    return NextResponse.json(
      {
        error: 'Errore durante il suggerimento AI',
        details: error.message
      },
      { status: 500 }
    );
  }
}
