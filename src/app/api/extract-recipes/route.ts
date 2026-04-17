import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuthenticatedUser } from '@/lib/api/require-user';
import { buildFamilyContextPrompt, validateFamilyContextUsage } from '@/lib/utils/family-context';
import { FamilyProfile } from '@/types';

/**
 * PDF Recipe Extraction API
 *
 * Pipeline: PDF → Claude AI → Structured Markdown → Parsed Recipes
 *
 * Why Claude: Native PDF support and strong Italian language understanding make it ideal
 * for extracting structured recipe data from Italian cookbook PDFs.
 *
 * Architecture: Two-phase AI workflow
 * 1. Extraction: Claude analyzes PDF and outputs markdown-formatted recipes
 * 2. Categorization: (In frontend) Parse markdown and suggest categories/seasons per recipe
 */

// This prompt is the AI instruction sent to Claude (not code documentation).
// Optimized through extensive testing with Italian recipe PDFs to solve:
// - Index page detection (skip index, extract actual recipes)
// - Section name preservation (exact names without abbreviation)
// - Variable recipe structures (2-6+ sections per recipe)
const EXTRACTION_PROMPT = `Analizza il PDF allegato ed estrai **TUTTE le ricette presenti** nel documento.

**Fornisci il risultato completo formattando ogni ricetta secondo questa struttura:

---

# [Nome della ricetta 1]

## Ingredienti per [nome sezione 1]
[Elenco ingredienti con quantità esatte]

## Ingredienti per [nome sezione 2]
[Elenco ingredienti con quantità esatte]

*(Ripeti per tutte le sezioni di ingredienti presenti)*

---

## Procedimento per [nome sezione 1]
[Elenco puntato dettagliato dei passaggi]

## Procedimento per [nome sezione 2]
[Elenco puntato dettagliato dei passaggi]

*(Ripeti per tutte le sezioni di procedimento presenti)*

---

**Note aggiuntive:** [eventuali note bene, suggerimenti, varianti o consigli]

**Porzioni:** [numero]
**Tempo di preparazione:** [tempo]
**Tempo di cottura/lievitazione:** [tempo]

---
---

# [Nome della ricetta 2]

[Stessa struttura della ricetta 1]

---
---

# [Nome della ricetta N]

[Stessa struttura per tutte le ricette successive]

---

## ISTRUZIONI SPECIFICHE:

### 1. IDENTIFICAZIONE RICETTE - MOLTO IMPORTANTE
- Il documento potrebbe contenere un INDICE all'inizio. L'indice NON è una ricetta.
- Se trovi un indice, usalo come CHECKLIST per verificare di aver estratto tutte le ricette
- Estrai le ricette nell'ordine in cui appaiono DOPO l'indice
- NON saltare la prima ricetta
- Assicurati di estrarre DALLA PRIMA ALL'ULTIMA ricetta del documento
- Separa chiaramente ogni ricetta con una doppia linea orizzontale (\`---\`)

### 2. STRUTTURA FLESSIBILE
- Adatta il numero di sezioni per ogni ricetta individualmente
- Alcune ricette avranno 2 sezioni, altre 5-6 o più
- Ogni ricetta può avere una struttura diversa

### 3. NOMI DELLE SEZIONI - REGOLA FONDAMENTALE
- Copia ESATTAMENTE il nome della sezione come appare nel documento originale
- NON abbreviare, NON parafrasare, NON modificare
- Mantieni "Per" se presente (es: "Per i pomodori confit" NON "i pomodori confit")
- Mantieni "La/Il/I/Le" se presente (es: "La genovese" NON "genovese")
- Mantieni maiuscole/minuscole come nell'originale
- Esempi CORRETTI: "Per i pomodorini confit", "Per la genovese", "La pasta", "Il ragù"
- Esempi SBAGLIATI: "i pomodorini confit" (manca "Per"), "genovese" (manca "La")

### 4. QUANTITÀ PRECISE
- Riporta tutte le quantità esattamente come nel documento originale
- Includi sempre le unità di misura
- Prefix ogni ingrediente con un riferimento progressivo globale nel formato [ING:n]
- Esempio corretto ingrediente: "[ING:1] Mele (per cubetti), 300 g"
- Se uno step usa la quantità di un ingrediente, NON riscrivere il numero nello step: usa il riferimento [QTY:n]
- Esempio corretto step: "Taglia [QTY:1] di mele a cubetti"
- Usa [QTY:n] solo quando il riferimento alla quantità è chiaro e diretto

### 5. PROCEDIMENTO DETTAGLIATO
- Usa elenchi puntati per tutti i passaggi
- Mantieni l'ordine cronologico
- Includi tempistiche, temperature e dettagli tecnici
- Riporta eventuali riferimenti a video o immagini
- Ogni bullet deve rappresentare UNA sola azione principale o un solo riferimento quantità principale
- Se una frase contiene due quantità distinte o due trasformazioni diverse, spezzala in due step separati
- Esempio corretto:
  1. "Taglia [QTY:1] di mele a cubetti"
  2. "Taglia i restanti [QTY:2] a fette non eccessivamente sottili; tieni le due parti separate"
- Se uno step ha UN SOLO tempo di attesa o cottura chiaramente identificabile nel documento originale, aggiungi [DUR:N] alla fine dello step (N = minuti interi)
- Esempio CORRETTO: "Cuocere in forno a 180°C per 25 minuti. [DUR:25]"
- Esempio CORRETTO: "Lasciar riposare in frigorifero per 2 ore. [DUR:120]"
- NON aggiungere [DUR:] se il tempo è un range, ambiguo, o lo step contiene più tempi

### 6. TERMINOLOGIA
- Mantieni tutta la terminologia italiana originale
- Preserva i termini tecnici culinari

### 7. NOTE E SUGGERIMENTI
- Includi tutte le "NOTA BENE", suggerimenti, varianti o consigli
- IMPORTANTE: Le attrezzature necessarie (es: planetaria, fruste elettriche, carta da forno, stampi, ecc.) devono essere riportate SOLO nella sezione "Note aggiuntive" con il prefisso "Attrezzature necessarie:"
- NON includere MAI le attrezzature come step del procedimento
- Le attrezzature sono strumenti/utensili, NON sono azioni da eseguire

### 8. INFORMAZIONI FINALI
- Per ogni ricetta riporta: porzioni, tempi di preparazione e cottura (se presenti)

### 9. COMPLETEZZA
- Assicurati di estrarre TUTTE le ricette presenti nel documento
- Non omettere nessuna ricetta, anche se breve o semplice
- Se il documento contiene un indice, usa quello come riferimento per verificare di aver estratto tutto

### 10. FORMATTAZIONE TESTO - REGOLA ASSOLUTA
- NON usare MAI asterischi (**testo**, *testo*), underscore (__testo__) o altri simboli markdown nel testo degli step, ingredienti o note
- Scrivi SOLO testo semplice (plain text)
- Se vuoi enfatizzare una parola, usa le maiuscole: "A TEMPERATURA AMBIENTE" invece di "**A temperatura ambiente**"
- Esempio SBAGLIATO: "**Fase 1:** cuocere a 180°C"
- Esempio CORRETTO: "Fase 1: cuocere a 180°C"

---`;

/**
 * Italian Seasonal Ingredients Classification
 *
 * Based on traditional Italian culinary calendar and ingredient availability.
 * Used by AI to suggest appropriate season tags for recipes.
 *
 * Each season contains ingredients that are traditionally at their peak
 * freshness and availability during that time in Italy.
 */
const ITALIAN_SEASONAL_INGREDIENTS = {
  primavera: ['asparagi', 'carciofi', 'fave', 'piselli', 'fragole', 'agretti', 'rucola', 'ravanelli', 'cipollotti', 'lattuga'],
  estate: ['pomodori', 'melanzane', 'zucchine', 'peperoni', 'basilico', 'cetrioli', 'pesche', 'albicocche', 'melone', 'anguria', 'fagiolini'],
  autunno: ['zucca', 'funghi', 'castagne', 'radicchio', 'cavolo', 'broccoli', 'uva', 'pere', 'mele', 'fichi'],
  inverno: ['cavolo nero', 'cavolfiore', 'finocchi', 'agrumi', 'arance', 'mandarini', 'limoni', 'cime di rapa', 'porri', 'rape']
};

/**
 * Builds AI prompt for category and season suggestion.
 *
 * @param recipeTitle - Title of the recipe to categorize
 * @param ingredients - List of ingredients (used for seasonal analysis)
 * @param userCategories - User's existing categories (for matching consistency)
 * @returns Structured prompt requesting strict JSON response
 *
 * Why JSON: Ensures parseable, structured response vs freeform text.
 * The AI will match existing categories first to maintain consistency and prevent
 * category proliferation (e.g., "Dolci" vs "Dessert" vs "Sweets").
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
{
  "category": "nome_categoria",
  "season": "primavera|estate|autunno|inverno|tutte_stagioni",
  "isNewCategory": true/false
}

**Regole per la categoria:**
- Se la ricetta corrisponde a una categoria esistente, usa ESATTAMENTE quel nome
- Se non corrisponde a nessuna categoria esistente, proponi un nuovo nome appropriato (es: "Primi piatti", "Dolci", "Secondi piatti", "Antipasti", "Contorni", ecc.)
- Imposta "isNewCategory" a true solo se proponi una categoria nuova
  (This prevents category proliferation by using exact string matching)

**Regole per la stagione:**
- Analizza gli ingredienti principali e determina la stagione più appropriata
- Se la ricetta contiene ingredienti specifici di una stagione, usa quella stagione
- Se la ricetta usa ingredienti disponibili tutto l'anno o di stagioni diverse, usa "tutte_stagioni"
- Considera la tradizione culinaria italiana (es: "pasta al forno" è più invernale, "pasta fredda" è estiva)

Rispondi SOLO con il JSON, nient'altro.`;
}

/**
 * Suggests category and season for a recipe using Claude AI.
 *
 * @param anthropic - Anthropic SDK client instance
 * @param recipeTitle - Title of the recipe
 * @param ingredients - List of ingredient names
 * @param userCategories - User's existing categories
 * @returns Object with categoryName, season, and isNewCategory flag, or null on error
 *
 * Logic: Matches existing categories first for consistency. If no match, suggests new category.
 * The isNewCategory flag tells the frontend whether to create a new category or use existing.
 *
 * Error handling: Returns null on failure, allowing frontend to handle gracefully.
 */
async function suggestCategoryAndSeason(
  anthropic: Anthropic,
  recipeTitle: string,
  ingredients: string[],
  userCategories: { name: string }[]
): Promise<{ categoryName: string; season: string; isNewCategory: boolean } | null> {
  try {
    const prompt = createCategorizationPrompt(recipeTitle, ingredients, userCategories);

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

    // Parse JSON response
    const suggestion = JSON.parse(responseText);

    return {
      categoryName: suggestion.category,
      season: suggestion.season,
      isNewCategory: suggestion.isNewCategory
    };
  } catch (error) {
    console.error('Error getting AI suggestion:', error);
    return null;
  }
}

/**
 * POST /api/extract-recipes
 *
 * Handles PDF upload and extracts recipes using Claude AI with native PDF support.
 *
 * Validation:
 * - File must be PDF (application/pdf)
 * - Max size: 4.4MB (Vercel serverless limit)
 *
 * Returns: Markdown-formatted recipes ready for parsing by recipe-parser.ts
 *
 * Side effects: None (stateless API endpoint)
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

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const userCategoriesJson = formData.get('userCategories') as string;
    const useFamilyContext = formData.get('useFamilyContext') === 'true';
    const familyProfileJson = formData.get('familyProfile') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'Nessun file PDF fornito' },
        { status: 400 }
      );
    }

    let familyProfile: FamilyProfile | null = null;
    if (familyProfileJson) {
      try {
        familyProfile = JSON.parse(familyProfileJson) as FamilyProfile;
      } catch (e) {
        console.error('Error parsing family profile:', e);
      }
    }

    const familyContextError = validateFamilyContextUsage(useFamilyContext, familyProfile);
    if (familyContextError) {
      return NextResponse.json(
        { error: familyContextError },
        { status: 400 }
      );
    }

    const familyPromptContext = buildFamilyContextPrompt(familyProfile, useFamilyContext);

    // Parse user categories if provided
    let userCategories: { name: string }[] = [];
    if (userCategoriesJson) {
      try {
        userCategories = JSON.parse(userCategoriesJson);
      } catch (e) {
        console.error('Error parsing user categories:', e);
      }
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Il file deve essere un PDF' },
        { status: 400 }
      );
    }

    // Validate file size (max 4.4MB to stay within Vercel's 4.5MB serverless limit)
    // We use 4.4MB to leave buffer for HTTP headers and request metadata.
    const maxSize = 4.4 * 1024 * 1024; // 4.4MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'Il file PDF è troppo grande (max 4.4MB). Prova a ridurre la dimensione del PDF usando servizi come iLovePDF (https://www.ilovepdf.com/it/comprimere_pdf) e riprova.' },
        { status: 400 }
      );
    }

    // Convert file to buffer and then to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Pdf = buffer.toString('base64');

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    // Call Claude API with native PDF support
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: 'Sei un esperto estrattore di ricette culinarie. Il tuo compito è preservare fedelmente la struttura, i nomi delle sezioni e tutti i dettagli esattamente come appaiono nel documento originale.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Pdf,
              },
            },
            {
              type: 'text',
              text: `${familyPromptContext}${EXTRACTION_PROMPT}`,
            },
          ],
        },
      ],
    });

    // Extract text from response
    const extractedText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as any).text)
      .join('\n');

    return NextResponse.json({
      success: true,
      extractedRecipes: extractedText,
      userCategories: userCategories, // Pass back for client-side processing
      metadata: {
        model: 'claude-sonnet-4-6',
        fileSize: file.size,
      },
    });
  } catch (error: any) {
    console.error('Error extracting recipes:', error);

    return NextResponse.json(
      {
        error: 'Errore durante l\'estrazione delle ricette',
        details: error.message
      },
      { status: 500 }
    );
  }
}
