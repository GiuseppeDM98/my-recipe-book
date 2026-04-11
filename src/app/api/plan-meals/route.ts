import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { parseExtractedRecipes } from '@/lib/utils/recipe-parser';
import { requireAuthenticatedUser } from '@/lib/api/require-user';
import { MealPlanSetupConfig, MealSlot, MealType } from '@/types';

/**
 * AI Meal Plan API
 *
 * Pipeline: Setup config + existing recipes → Claude → Slot assignments + new recipe markdown
 *
 * Output strategy: Two delimiter blocks in a single response
 *   [PIANO]...[/PIANO]       — one JSON object per line, each describing a slot assignment
 *   [RICETTE_NUOVE]...[/RICETTE_NUOVE]  — markdown for any AI-generated new recipes
 *
 * WHY ONE JSON OBJECT PER LINE (not an array):
 * Claude reliably generates valid single-line JSON objects but occasionally produces
 * malformed JSON arrays (trailing commas, missing closing brackets). Line-by-line
 * parsing is fault-tolerant: a single bad line is skipped without losing the whole plan.
 *
 * WHY [RICETTE_NUOVE] USES MARKDOWN (not JSON-embedded text):
 * Recipe markdown contains newlines and special chars that break JSON encoding.
 * Keeping the same markdown format as /api/extract-recipes lets us reuse
 * parseExtractedRecipes() unchanged — zero new parsing code.
 */

const MEAL_LABELS: Record<MealType, string> = {
  colazione: 'colazione',
  pranzo: 'pranzo',
  cena: 'cena',
  primo: 'primo',
  secondo: 'secondo',
  contorno: 'contorno',
  dolce: 'dolce',
};

const DAY_LABELS = [
  'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'
];

/**
 * Build the system prompt for meal planning.
 *
 * The prompt is kept separate from the user message to give Claude a stable
 * persona and output format, while the user message carries the dynamic data
 * (recipes, constraints, week).
 */
const PLAN_SYSTEM_PROMPT = `Sei un esperto pianificatore di menu settimanale italiano. Hai una conoscenza approfondita della cucina tradizionale italiana e del principio di stagionalità.

FORMATO DI RISPOSTA — REGOLA ASSOLUTA:
Rispondi ESCLUSIVAMENTE con i due blocchi seguenti, senza testo aggiuntivo prima o dopo.

[PIANO]
{"day":0,"meal":"pranzo","type":"existing","recipeId":"ID_QUI","title":"Titolo ricetta"}
{"day":0,"meal":"cena","type":"existing","recipeId":"ID_QUI","title":"Titolo ricetta"}
{"day":1,"meal":"pranzo","type":"new","title":"Titolo nuova ricetta","category":"Primi Piatti","seasons":["primavera","estate"]}
[/PIANO]

[RICETTE_NUOVE]
(ricette generate nel formato standard — vuoto se newRecipeCount è 0)
[/RICETTE_NUOVE]

REGOLE PER IL BLOCCO [PIANO]:
- Una riga JSON per ogni slot (NON un array JSON)
- day: numero da 0 a 6 (0 = Lunedì, 6 = Domenica)
- meal: esattamente uno tra "colazione", "pranzo", "cena", "primo", "secondo", "contorno", "dolce"
- type: "existing" se usi una ricetta dal ricettario, "new" se generi una ricetta nuova
- Se type="existing": includi recipeId (ID esatto dal ricettario) e title
- Se type="new": includi title, category (nome categoria più adatta, es. "Primi Piatti", "Secondi Piatti", "Dolci") e seasons (array tra "primavera","estate","autunno","inverno","tutte_stagioni")
- Distribuisci i pasti su tutti e 7 i giorni della settimana
- Non ripetere la stessa ricetta nella settimana
- Rispetta la stagione indicata

REGOLE PER IL BLOCCO [RICETTE_NUOVE]:
Usa ESATTAMENTE questa struttura per ogni ricetta nuova:

---

# [Nome della ricetta]

**Porzioni:** [numero]
**Tempo di preparazione:** [X min]
**Tempo di cottura:** [Y min]

## Ingredienti
- [Ingrediente, quantità]

## Procedimento
- [Passo 1]
- [Passo 2]

---
---

REGOLE GENERALI:
- Ingredienti nel formato "nome, quantità" (es: "Pasta, 200 g", "Sale, q.b.")
- NON usare mai asterischi (**testo**, *testo*) negli ingredienti o nel procedimento
- Usa unità metriche italiane (g, kg, ml, l, cucchiai, cucchiaini)
- Usa decimali con virgola: 1,5 kg (NON 1.5 kg)
- Se newRecipeCount è 0, il blocco [RICETTE_NUOVE] deve essere completamente vuoto`;

/**
 * Build the user message with all planning constraints and available recipes.
 *
 * Sends only a compact recipe summary (title + category + seasons + count of ingredients)
 * to keep the prompt under ~2000 tokens even for users with 100+ recipes.
 */
function buildPlanningMessage(
  config: MealPlanSetupConfig,
  existingRecipes: { id: string; title: string; categoryId?: string; seasons?: string[]; ingredientCount: number }[],
  categories: { id: string; name: string }[],
  weekLabel: string
): string {
  const categoryMap = new Map(categories.map(c => [c.id, c.name]));

  const recipeLines = existingRecipes.map(r => {
    const catName = r.categoryId ? (categoryMap.get(r.categoryId) ?? 'senza categoria') : 'senza categoria';
    const seasons = r.seasons && r.seasons.length > 0 ? r.seasons.join(', ') : 'tutte le stagioni';
    return `ID:${r.id} | "${r.title}" | Categoria: ${catName} | Stagioni: ${seasons} | Ingredienti: ${r.ingredientCount}`;
  });

  const excludedCategoryNames = config.excludedCategoryIds
    .map(id => categoryMap.get(id))
    .filter(Boolean)
    .join(', ');

  const mealTypeLabels = config.activeMealTypes.map(m => MEAL_LABELS[m]).join(', ');

  // Build course-category hints when the user has configured course types with preferred categories
  const courseCategoryHints = config.courseCategoryMap
    ? Object.entries(config.courseCategoryMap)
        .filter(([, catId]) => catId)
        .map(([courseType, catId]) => {
          const catName = categoryMap.get(catId!) ?? catId;
          return `  - ${MEAL_LABELS[courseType as MealType] ?? courseType}: usa preferibilmente ricette della categoria "${catName}"`;
        })
        .join('\n')
    : '';

  // Build per-meal new recipe instructions when the user set individual counts
  const newRecipeLines = config.newRecipePerMeal
    ? Object.entries(config.newRecipePerMeal)
        .filter(([, n]) => (n ?? 0) > 0)
        .map(([mealType, n]) => `  - ${MEAL_LABELS[mealType as MealType] ?? mealType}: ${n} ricette nuove`)
        .join('\n')
    : '';

  const newRecipeInstruction = newRecipeLines
    ? `Genera ricette nuove (type="new") distribuite così:\n${newRecipeLines}\n  (totale: ${config.newRecipeCount})`
    : `Genera esattamente ${config.newRecipeCount} ricette nuove (type="new")`;

  return `Crea un piano pasti per la settimana: ${weekLabel}

PARAMETRI:
- Stagione: ${config.season}
- Tipi di pasto da pianificare: ${mealTypeLabels}
- Ricette nuove da generare: ${config.newRecipeCount} in totale${
  excludedCategoryNames ? `\n- Categorie ESCLUSE (non usare ricette di queste categorie): ${excludedCategoryNames}` : ''
}${
  courseCategoryHints ? `\n- Preferenze di categoria per portata:\n${courseCategoryHints}` : ''
}

RICETTARIO DISPONIBILE (${existingRecipes.length} ricette):
${recipeLines.length > 0 ? recipeLines.join('\n') : '(nessuna ricetta nel ricettario)'}

ISTRUZIONI:
1. Assegna ricette esistenti dal ricettario a tutti gli slot richiesti (${mealTypeLabels} per ogni giorno)
2. Preferisci ricette della stagione "${config.season}" o "tutte le stagioni"
3. NON usare ricette delle categorie escluse
4. Rispetta le preferenze di categoria per portata se indicate
5. ${newRecipeInstruction}${
  config.newRecipeCount > 0
    ? `\n6. Le ricette nuove devono essere adatte alla stagione "${config.season}"`
    : ''
}
7. Non ripetere la stessa ricetta più di una volta nella settimana
8. Varia i tipi di piatto e gli ingredienti principali
9. Se il ricettario ha poche ricette o nessuna, usa type="new" per colmare i gap`;
}

/**
 * Parse Claude's two-block response into structured MealSlot data.
 *
 * MATCHING STRATEGY — ordered assignment (not title matching):
 * New recipes in [RICETTE_NUOVE] are parsed into an array.
 * The first "type=new" slot in [PIANO] gets the first parsed recipe,
 * the second new slot gets the second recipe, and so on.
 *
 * WHY NOT TITLE MATCHING:
 * Claude may use slightly different capitalisation or punctuation between
 * the JSON title in [PIANO] and the markdown title in [RICETTE_NUOVE].
 * Any mismatch would silently produce null newRecipe fields, making the
 * "Salva nel ricettario" button disappear. Ordered assignment is robust:
 * it requires only that Claude lists recipes in the same order as slots.
 *
 * PARSING LOCATION:
 * New recipes are fully parsed server-side (parseExtractedRecipes) and
 * returned as plain JSON objects. The client uses them directly without
 * any additional parsing step.
 */
function parsePlanResponse(
  fullText: string,
  existingRecipeIds: Set<string>
): { slots: MealSlot[] } {
  const pianoMatch = fullText.match(/\[PIANO\]([\s\S]*?)\[\/PIANO\]/i);
  const ricetteMatch = fullText.match(/\[RICETTE_NUOVE\]([\s\S]*?)\[\/RICETTE_NUOVE\]/i);

  if (!pianoMatch) {
    return { slots: [] };
  }

  // Parse ALL new recipes upfront — will be assigned to slots in order
  const newRecipesMarkdown = ricetteMatch ? ricetteMatch[1].trim() : '';
  const parsedNewRecipes = newRecipesMarkdown ? parseExtractedRecipes(newRecipesMarkdown) : [];
  let newRecipeIndex = 0;

  const lines = pianoMatch[1]
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('{'));

  const slots: MealSlot[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as {
        day: number;
        meal: string;
        type: 'existing' | 'new';
        recipeId?: string;
        title?: string;
        category?: string;
        seasons?: string[];
      };

      if (typeof parsed.day !== 'number' || !parsed.meal || !parsed.type || !parsed.title) {
        continue;
      }

      const dayIndex = Math.max(0, Math.min(6, parsed.day));
      const VALID_MEAL_TYPES: MealType[] = ['colazione', 'pranzo', 'cena', 'primo', 'secondo', 'contorno', 'dolce'];
      const mealType = VALID_MEAL_TYPES.includes(parsed.meal as MealType)
        ? (parsed.meal as MealType)
        : null;

      if (!mealType) continue;

      if (parsed.type === 'existing' && parsed.recipeId && existingRecipeIds.has(parsed.recipeId)) {
        slots.push({
          dayIndex,
          mealType,
          recipeTitle: parsed.title,
          existingRecipeId: parsed.recipeId,
          newRecipe: null,
        });
      } else if (parsed.type === 'new') {
        // Assign the next parsed recipe in sequence — no title matching needed
        const newRecipe = parsedNewRecipes[newRecipeIndex++] ?? null;
        const VALID_SEASONS = ['primavera', 'estate', 'autunno', 'inverno', 'tutte_stagioni'];
        const suggestedSeasons = parsed.seasons
          ?.filter(s => VALID_SEASONS.includes(s)) as import('@/types').Season[] | undefined;
        slots.push({
          dayIndex,
          mealType,
          recipeTitle: parsed.title,
          existingRecipeId: null,
          newRecipe,
          suggestedCategoryName: parsed.category ?? undefined,
          suggestedSeasons: suggestedSeasons?.length ? suggestedSeasons : undefined,
        });
      }
    } catch {
      // Skip malformed JSON lines — partial plan is better than no plan
    }
  }

  return { slots };
}

/**
 * POST /api/plan-meals
 *
 * Generates a weekly meal plan using Claude.
 *
 * Request body:
 *   config          - MealPlanSetupConfig (season, mealTypes, exclusions, newRecipeCount, weekStartDate)
 *   existingRecipes - Compact recipe summaries (id, title, categoryId, seasons, ingredientCount)
 *   categories      - User categories (id, name) for exclusion + display
 *
 * Returns:
 *   success - boolean
 *   slots   - Array of slot assignments with existingRecipeId or newRecipeMarkdown
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
    const { config, existingRecipes, categories } = body as {
      config: MealPlanSetupConfig;
      existingRecipes: { id: string; title: string; categoryId?: string; seasons?: string[]; ingredientCount: number }[];
      categories: { id: string; name: string }[];
    };

    if (!config || !config.activeMealTypes || config.activeMealTypes.length === 0) {
      return NextResponse.json(
        { error: 'Configurazione piano non valida: seleziona almeno un tipo di pasto' },
        { status: 400 }
      );
    }

    // Filter out recipes from excluded categories before sending to Claude.
    // This is a server-side safeguard in addition to the prompt instruction.
    const excludedSet = new Set(config.excludedCategoryIds ?? []);
    const filteredRecipes = (existingRecipes ?? []).filter(
      r => !r.categoryId || !excludedSet.has(r.categoryId)
    );

    // Build week label (e.g., "17-23 marzo 2026") for the prompt
    const weekStart = new Date(config.weekStartDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekLabel = `${DAY_LABELS[0]} ${weekStart.getDate()} – ${DAY_LABELS[6]} ${weekEnd.getDate()} ${weekEnd.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`;

    const userMessage = buildPlanningMessage(config, filteredRecipes, categories ?? [], weekLabel);
    const existingRecipeIds = new Set(filteredRecipes.map(r => r.id));

    const anthropic = new Anthropic({ apiKey });

    const claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      system: PLAN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const fullText = claudeResponse.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('\n');

    const { slots } = parsePlanResponse(fullText, existingRecipeIds);

    if (slots.length === 0) {
      return NextResponse.json(
        { error: 'L\'AI non ha generato un piano valido. Riprova.' },
        { status: 500 }
      );
    }

    // Slots are already shaped as MealSlot objects — return directly as JSON.
    // newRecipe (ParsedRecipe) is serialized as a plain object; the client
    // uses it directly without additional parsing.
    return NextResponse.json({ success: true, slots });
  } catch (error: unknown) {
    console.error('Error in plan-meals:', error);
    return NextResponse.json(
      {
        error: 'Errore durante la generazione del piano pasti',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
