import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuthenticatedUser } from '@/lib/api/require-user';
import { resolveFamilyContextInput } from '@/lib/api/family-context';
import { AI_MODEL } from '@/lib/utils/constants';

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

Il tuo compito è formattare questa ricetta in modo strutturato e completo, seguendo questa struttura. La legge un parser, quindi riproduci intestazioni ed etichette alla lettera:

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
- Prefix ogni ingrediente con un riferimento progressivo globale nel formato [ING:n]
- Esempio corretto ingrediente: "[ING:1] Pasta, 200 g"
- Se l'utente non ha indicato quantità, usa giudizio culinario ragionevole o scrivi "q.b."
- Usa le unità metriche italiane (g, kg, ml, l, cucchiai, cucchiaini)
- Usa decimali con virgola: 1,5 kg (NON 1.5 kg)
- NON usare frazioni: scrivi 0,5 (NON 1/2)

### 3. PROCEDIMENTO
- Usa elenco puntato (trattino -)
- Ogni step deve essere un'azione concreta
- Ogni step deve descrivere UNA sola azione principale o un solo riferimento quantità principale
- Se una frase contiene due quantità distinte o due trasformazioni diverse, spezzala in due step separati
- Includi temperature, tempistiche e dettagli tecnici
- Mantieni l'ordine cronologico logico
- Se il testo originale è vago, espandi con dettagli culinari ragionevoli e corretti
- Se uno step cita la quantità di un ingrediente, usa il riferimento [QTY:n] invece del numero
- Esempio corretto step: "Unisci [QTY:1] di pasta e mescola"
- Usa [QTY:n] solo quando il collegamento con l'ingrediente è chiaro e diretto
- Scrivi sempre il nome dell'ingrediente nello step, anche quando usi [QTY:n]
- Se uno step ha UN SOLO tempo di attesa o cottura chiaramente identificabile, aggiungi [DUR:N] alla fine dello step (N = minuti interi)
- Esempio CORRETTO: "Cuocere a fuoco medio per 10 minuti. [DUR:10]"
- Esempio CORRETTO: "Lasciar lievitare in luogo tiepido per 1 ora. [DUR:60]"
- NON aggiungere [DUR:] se il tempo è un range, ambiguo, o lo step contiene più azioni con tempi diversi

### 4. SEZIONI MULTIPLE
- Se la ricetta ha componenti logicamente distinte (es: impasto + farcitura, pasta fresca + ragù + besciamella, base + crema), crea sezioni separate sia per gli ingredienti sia per il procedimento, anche se il testo dell'utente non le separa esplicitamente
- I nomi delle sezioni sono gli stessi tra ingredienti e procedimento: se esiste "## Ingredienti per il ragù" deve esistere "## Procedimento per il ragù"
- Usa i nomi delle sezioni così come li ha scritti l'utente, o nomi appropriati se non specificati
- Mantieni "Per" se presente (es: "Per il sugo", "Per la pasta")
- Le ricette semplici a componente unica restano SENZA sezioni: "## Ingredienti" e "## Procedimento" semplici

### 5. METADATA
- Includi solo ciò che è verificabile dal testo o deducibile con certezza
- NON inventare tempi o porzioni se non presenti e non deducibili
- Formato tempi: "30 min", "1 ora", "1 ora 30 min"

### 6. TERMINOLOGIA
- Usa terminologia culinaria italiana corretta
- Preserva nomi tipici regionali o dialettali se presenti

### 7. ATTREZZATURE
- Le attrezzature necessarie (es: planetaria, stampo, carta da forno) vanno SOLO nelle "Note aggiuntive" con prefisso "Attrezzature necessarie:"
- Non includere le attrezzature come step del procedimento: sono strumenti, non azioni da eseguire

### 8. FORMATTAZIONE TESTO
- Step, ingredienti e note sono testo semplice, senza asterischi (**testo**, *testo*), underscore (__testo__) o altri simboli markdown: il testo viene salvato così com'è e i simboli resterebbero visibili
- Se vuoi enfatizzare una parola, usa le maiuscole: "A TEMPERATURA AMBIENTE" invece di "**A temperatura ambiente**"
- Esempio SBAGLIATO: "**Fase 1:** cuocere a 180°C"
- Esempio CORRETTO: "Fase 1: cuocere a 180°C"

### 9. COERENZA INGREDIENTI ↔ PROCEDIMENTO
- Ogni ingrediente elencato deve essere effettivamente usato o menzionato in almeno uno step del procedimento
- Se un ingrediente indicato dall'utente non compare in nessuno step, prova prima a collocarlo in modo sensato nel procedimento (coerentemente con la regola 3 di espansione dei passaggi vaghi)
- Se davvero non riesci a collocarlo e resta chiaramente inutilizzato, omettilo dalla lista ingredienti (ingrediente orfano / refuso)
- Eccezione (fail-safe): non omettere nulla quando il procedimento è sintetico o generico — ad esempio "aggiungere i restanti ingredienti", "unire il tutto", "aggiustare di sale/spezie" o simili. In caso di dubbio, mantieni l'ingrediente

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
    const { text, userCategories: userCategoriesRaw } = body;
    const familyContext = resolveFamilyContextInput(body);

    if (!text || typeof text !== 'string' || text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Il testo della ricetta è troppo corto o mancante' },
        { status: 400 }
      );
    }

    if (familyContext.validationError) {
      return NextResponse.json(
        { error: familyContext.validationError },
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
      model: AI_MODEL,
      // Headroom for the Sonnet 5 tokenizer (~30% more tokens for equivalent text).
      max_tokens: 6000,
      // Adaptive thinking at low effort: light reasoning helps the ingredient/
      // procedure coherence check and the sensible expansion of vague steps, while
      // effort 'low' keeps latency and token cost close to a no-thinking run.
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system: 'Sei un esperto culinario italiano. Il tuo compito è prendere testo grezzo di una ricetta e formattarlo in modo preciso, completo e professionale, rispettando la tradizione culinaria italiana.',
      messages: [
        {
          role: 'user',
          content: `${FORMAT_RECIPE_PROMPT}\n\n---\n\n${familyContext.promptContext}TESTO RICETTA DELL'UTENTE:\n\n${text.trim()}`,
        },
      ],
    });

    // Per-route token accounting (Vercel logs): the baseline for any prompt or effort change.
    console.info('[ai-usage] format-recipe', message.usage);

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
        model: AI_MODEL,
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
