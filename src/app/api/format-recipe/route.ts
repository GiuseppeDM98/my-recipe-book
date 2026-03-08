import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Free-text Recipe Formatting API
 *
 * Pipeline: Free text → Claude AI → Structured Markdown → Parsed Recipe
 *
 * Why a separate endpoint from /api/extract-recipes:
 * - Input format is completely different (plain text vs base64 PDF)
 * - Prompt is simpler (no index detection, no multi-recipe extraction)
 * - Keeps each endpoint focused on a single responsibility
 *
 * Output format is identical to /api/extract-recipes so the same
 * recipe-parser.ts and downstream pipeline can be reused unchanged.
 */

// This prompt is the AI instruction sent to Claude (not code documentation).
// Optimized for freeform text input: the user might write a rough draft,
// paste from a website, or transcribe a handwritten recipe.
//
// Key differences from EXTRACTION_PROMPT (PDF version):
// - No index detection (text has no TOC)
// - Single recipe only (user submits one at a time)
// - More tolerant of missing metadata (omit if absent, don't hallucinate)
// - Handles implicit sections (user might not label "ingredienti" / "procedimento")
const FORMAT_RECIPE_PROMPT = `L'utente ha scritto o incollato il testo di una ricetta in formato libero. Il testo potrebbe essere non strutturato, incompleto o provenire da fonti diverse (appunti, siti web, dettatura).

Il tuo compito è formattare questa ricetta in modo strutturato e completo, seguendo ESATTAMENTE questa struttura:

---

# [Nome della ricetta]

## Ingredienti
[Elenco ingredienti con quantità esatte]

*(Se la ricetta ha più sezioni di ingredienti, usa:)*
## Ingredienti per [nome sezione]
[Elenco ingredienti della sezione]

---

## Procedimento
[Elenco puntato dettagliato dei passaggi]

*(Se la ricetta ha più sezioni di procedimento, usa:)*
## Procedimento per [nome sezione]
[Elenco puntato dei passaggi della sezione]

---

**Note aggiuntive:** [eventuali note, varianti, suggerimenti - ometti questa riga se non ci sono note]

**Porzioni:** [numero - ometti se non specificato]
**Tempo di preparazione:** [tempo - ometti se non specificato]
**Tempo di cottura:** [tempo - ometti se non specificato]

---
---

## ISTRUZIONI SPECIFICHE:

### 1. TITOLO
- Usa il titolo fornito dall'utente, o deducilo dagli ingredienti/procedimento
- Capitalizza correttamente (es: "Pasta al Pomodoro" → "Pasta al pomodoro")

### 2. INGREDIENTI
- Struttura ogni ingrediente come: nome, quantità con unità di misura
- Esempio: "Pasta, 200 g", "Aglio, 2 spicchi", "Sale, q.b."
- Se l'utente non ha indicato quantità, usa giudizio culinario ragionevole o scrivi "q.b."
- Usa le unità metriche italiane (g, kg, ml, l, cucchiai, cucchiaini)
- Usa decimali con virgola: 1,5 kg (NON 1.5 kg)
- NON usare frazioni: scrivi 0,5 (NON 1/2)

### 3. PROCEDIMENTO
- Usa elenco puntato (trattino -)
- Ogni step deve essere un'azione concreta
- Includi temperature, tempistiche e dettagli tecnici
- Mantieni l'ordine cronologico logico
- Se il testo originale è vago, espandi con dettagli culinari ragionevoli e corretti

### 4. SEZIONI MULTIPLE
- Se la ricetta ha componenti distinti (es: pasta fresca + ragù + besciamella), crea sezioni separate
- Usa ESATTAMENTE i nomi delle sezioni come forniti dall'utente, o nomi appropriati se non specificati
- Mantieni "Per" se presente (es: "Per il sugo", "Per la pasta")

### 5. METADATA
- Includi solo ciò che è verificabile dal testo o deducibile con certezza
- NON inventare tempi o porzioni se non presenti e non deducibili
- Formato tempi: "30 min", "1 ora", "1 ora 30 min"

### 6. TERMINOLOGIA
- Usa terminologia culinaria italiana corretta
- Preserva nomi tipici regionali o dialettali se presenti

### 7. ATTREZZATURE
- Le attrezzature necessarie (es: planetaria, stampo, carta da forno) vanno SOLO nelle "Note aggiuntive" con prefisso "Attrezzature necessarie:"
- NON includere mai le attrezzature come step del procedimento

### 8. FORMATTAZIONE TESTO - REGOLA ASSOLUTA
- NON usare MAI asterischi (**testo**, *testo*), underscore (__testo__) o altri simboli markdown nel testo degli step, ingredienti o note
- Scrivi SOLO testo semplice (plain text)
- Se vuoi enfatizzare una parola, usa le maiuscole: "A TEMPERATURA AMBIENTE" invece di "**A temperatura ambiente**"
- Esempio SBAGLIATO: "**Fase 1:** cuocere a 180°C"
- Esempio CORRETTO: "Fase 1: cuocere a 180°C"

Rispondi SOLO con la ricetta formattata, senza introduzioni o spiegazioni.`;

/**
 * POST /api/format-recipe
 *
 * Accepts free-form recipe text and returns it formatted as structured markdown,
 * using the same output format as /api/extract-recipes for pipeline compatibility.
 *
 * Validation:
 * - Body must be JSON with a non-empty "text" field
 * - Minimum 20 characters (prevents accidental empty submissions)
 *
 * Returns: Same shape as /api/extract-recipes for frontend reuse
 *
 * Side effects: None (stateless API endpoint)
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
    const { text, userCategories: userCategoriesRaw } = body;

    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Il testo della ricetta è troppo corto o mancante' },
        { status: 400 }
      );
    }

    // Parse user categories if provided
    let userCategories: { name: string }[] = [];
    if (Array.isArray(userCategoriesRaw)) {
      userCategories = userCategoriesRaw;
    }

    const anthropic = new Anthropic({ apiKey });

    // Call Claude with the user's free-form recipe text
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: 'Sei un esperto culinario italiano. Il tuo compito è prendere testo grezzo di una ricetta e formattarlo in modo preciso, completo e professionale, rispettando la tradizione culinaria italiana.',
      messages: [
        {
          role: 'user',
          content: `${FORMAT_RECIPE_PROMPT}\n\n---\n\nTESTO RICETTA DELL'UTENTE:\n\n${text.trim()}`,
        },
      ],
    });

    const formattedText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as any).text)
      .join('\n');

    // Return same shape as /api/extract-recipes for frontend reuse
    return NextResponse.json({
      success: true,
      extractedRecipes: formattedText,
      userCategories,
      metadata: {
        model: 'claude-sonnet-4-6',
        source: 'text',
      },
    });
  } catch (error: any) {
    console.error('Error formatting recipe:', error);

    return NextResponse.json(
      {
        error: 'Errore durante la formattazione della ricetta',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
