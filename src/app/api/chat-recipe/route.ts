import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuthenticatedUser } from '@/lib/api/require-user';
import { resolveFamilyContextInput } from '@/lib/api/family-context';
import { createMessageWithToolLoop } from '@/lib/api/claude-tool-loop';
import { extractTextFromBlocks, extractWebSearchSources } from '@/lib/utils/claude-blocks';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGES_PER_MESSAGE,
  MAX_TOTAL_BASE64_BYTES,
} from '@/lib/utils/image-resize';
import { AI_MODEL } from '@/lib/utils/constants';

/**
 * AI Recipe Chat API
 *
 * Pipeline: User message → Claude (multi-turn) → Conversational reply + Recipe markdown
 *
 * Why a separate endpoint from /api/format-recipe:
 * - Supports multi-turn conversation history (stateless server, history sent by client)
 * - Dual output: conversational text + optional recipe markdown in same response
 * - Injects existing recipe context on first turn to avoid duplicate suggestions
 *
 * Output: Same recipe markdown format as /api/extract-recipes so the same
 * recipe-parser.ts pipeline can be reused unchanged for any generated recipes.
 *
 * Claude's response is wrapped in delimiters so we can reliably split
 * the conversational reply from the recipe markdown:
 *   [RISPOSTA]...[/RISPOSTA]  → reply (chat bubble)
 *   [RICETTE]...[/RICETTE]    → recipe markdown (parsed as ExtractedRecipePreview)
 */

// System prompt establishes Claude's persona and the strict dual-block output format.
// The [RISPOSTA]/[RICETTE] delimiter approach was chosen over JSON because:
// - Recipe markdown contains newlines and special chars that break JSON encoding
// - Regex parsing of clear delimiters is more robust than JSON.parse on nested markdown
// - Keeps the recipe format identical to other endpoints (no adapter needed)
const CHAT_SYSTEM_PROMPT = `Sei un esperto culinario italiano e assistente personale del ricettario. Il tuo stile è caldo, curioso e professionale. Puoi suggerire ricette nuove, rispondere a domande culinarie, proporre varianti, e aiutare con gli ingredienti disponibili.

FORMATO DI RISPOSTA - REGOLA ASSOLUTA:
Devi rispondere SEMPRE con questa struttura esatta, senza eccezioni:

[RISPOSTA]
<Il tuo messaggio conversazionale in italiano. Puoi fare domande di chiarimento, commentare le scelte culinarie, spiegare tecniche, suggerire varianti. Scrivi in modo naturale e amichevole.>
[/RISPOSTA]

[RICETTE]
<Se generi una o più ricette, inseriscile qui nel formato standard. Se in questo messaggio NON generi ricette (stai solo conversando o chiedendo chiarimenti), lascia questo blocco COMPLETAMENTE VUOTO.>
[/RICETTE]

FORMATO RICETTE (solo quando generi ricette):
Usa ESATTAMENTE questa struttura per ogni ricetta:

---

# [Nome della ricetta]

**Porzioni:** [numero]
**Tempo di preparazione:** [X min]
**Tempo di cottura:** [Y min]

## Ingredienti
- [Ingrediente, quantità]

*(Se la ricetta ha più sezioni di ingredienti, usa:)*
## Ingredienti per [nome sezione]
- [Ingrediente, quantità]

---

## Procedimento
- [Passo 1]
- [Passo 2]

*(Se la ricetta ha più sezioni di procedimento, usa:)*
## Procedimento per [nome sezione]
- [Passo]

---

**Note aggiuntive:** [eventuali note, varianti, suggerimenti - ometti se non ci sono note]

---
---

*(Ripeti la struttura sopra per ogni ricetta aggiuntiva)*

REGOLE PER LE RICETTE:
- Ingredienti: formato "nome, quantità" (es: "Pasta, 200 g", "Aglio, 2 spicchi", "Sale, q.b.")
- Prefix ogni ingrediente con un riferimento progressivo globale nel formato [ING:n]
- Esempio corretto ingrediente: "[ING:1] Pasta, 200 g"
- Se uno step cita la quantità di un ingrediente, usa [QTY:n] invece del numero
- Esempio corretto step: "Versa [QTY:1] di pasta nell'acqua"
- Usa [QTY:n] solo quando il riferimento alla quantità è chiaro e diretto
- IMPORTANTE: scrivi sempre il nome dell'ingrediente nello step, anche quando usi [QTY:n]
- Ogni step deve descrivere UNA sola azione principale o un solo riferimento quantità principale
- Se una frase contiene due quantità distinte o due trasformazioni diverse, spezzala in due step separati
- Se uno step ha UN SOLO tempo di attesa o cottura chiaramente identificabile, aggiungi [DUR:N] alla fine dello step (N = minuti interi)
- Esempio CORRETTO: "Cuocere a fuoco medio per 10 minuti. [DUR:10]"
- Esempio CORRETTO: "Lasciar riposare 30 minuti. [DUR:30]"
- NON aggiungere [DUR:] se il tempo è un range, ambiguo, o lo step contiene più azioni con tempi diversi
- NON usare MAI asterischi (**testo**, *testo*) negli ingredienti, nel procedimento o nelle note
- Usa unità metriche italiane (g, kg, ml, l, cucchiai, cucchiaini)
- Usa decimali con virgola: 1,5 kg (NON 1.5 kg)
- Includi porzioni e tempi solo se sei ragionevolmente sicuro, altrimenti ometti`;

/**
 * Appended to the system prompt only when the user enables web search.
 *
 * Kept out of the default path so the prompt stays byte-identical when the toggle is off:
 * the behaviour of every existing chat is unchanged, and the prompt cache is not disturbed
 * by a block most turns don't need.
 */
const WEB_SEARCH_GUIDANCE = `

RICERCA WEB:
Hai accesso alla ricerca web. Usala con criterio:
- Cerca quando ti servono informazioni che non hai: ricette regionali poco note, preparazioni tradizionali specifiche, prodotti o ingredienti particolari, tecniche di cui non conosci i dettagli.
- NON cercare per ricette classiche che conosci già bene (carbonara, ragù, tiramisù): rallenta la risposta senza migliorarla.
- Riscrivi sempre le ricette con parole tue, nel formato standard richiesto sopra. Non copiare testo dalle fonti.
- Se citi una fonte, fallo dentro [RISPOSTA], mai dentro [RICETTE]: il blocco ricette deve restare nel formato esatto.
- Il formato [RISPOSTA]/[RICETTE] resta obbligatorio anche quando cerchi sul web.`;

/**
 * Appended to the system prompt only when the user attaches photos.
 *
 * The description requirement is the important part: attached images are not carried
 * forward in the conversation history (see buildImageBlocks), so whatever the model says
 * about a photo now is the only trace of it in later turns.
 */
const VISION_GUIDANCE = `

FOTO ALLEGATE:
L'utente ha allegato una o più foto (ingredienti, prodotti, etichette, piatti, pagine di ricettari).
- Descrivi SEMPRE in una frase cosa vedi in ogni foto, all'inizio di [RISPOSTA].
- Questo è essenziale: le foto NON restano nella conversazione, quindi la tua descrizione è l'unica cosa che ricorderai nei messaggi successivi.
- Se leggi un'etichetta o una pagina, riporta i dati rilevanti (marca, formato, ingredienti, quantità).
- Se una foto è troppo sfocata o ambigua per esserne certo, dillo invece di indovinare.`;

interface ChatImageAttachment {
  base64: string;
  mediaType: string;
}

/**
 * Validates the attached images and turns them into API image blocks.
 *
 * The budget is enforced here as well as client-side. The client check gives immediate
 * feedback; this one is the check that actually protects the request, since the client
 * one can be bypassed and a body over Vercel's 4.4 MB limit fails with an opaque error
 * long before it reaches this handler's error path.
 *
 * @returns The image blocks, or a validation error message to return as a 400
 */
function buildImageBlocks(
  images: unknown
):
  | { ok: true; blocks: Anthropic.Messages.ImageBlockParam[] }
  | { ok: false; error: string } {
  if (!Array.isArray(images) || images.length === 0) {
    return { ok: true, blocks: [] };
  }

  if (images.length > MAX_IMAGES_PER_MESSAGE) {
    return { ok: false, error: `Puoi allegare al massimo ${MAX_IMAGES_PER_MESSAGE} foto per messaggio.` };
  }

  let totalBytes = 0;
  const blocks: Anthropic.Messages.ImageBlockParam[] = [];

  for (const image of images as ChatImageAttachment[]) {
    if (!image || typeof image.base64 !== 'string' || !image.base64) {
      return { ok: false, error: 'Una delle foto allegate non è valida.' };
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(image.mediaType as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      return { ok: false, error: 'Formato immagine non supportato. Usa JPG, PNG o WebP.' };
    }

    totalBytes += image.base64.length;
    if (totalBytes > MAX_TOTAL_BASE64_BYTES) {
      return { ok: false, error: 'Le foto allegate superano il limite di dimensione consentito.' };
    }

    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
        data: image.base64,
      },
    });
  }

  return { ok: true, blocks };
}

/**
 * Builds the existing recipes context block injected into the first user message.
 *
 * Injected into the message (not the system prompt) so it reads naturally
 * as user-provided context. Only sent on the first turn; subsequent turns
 * carry it implicitly through conversation history.
 *
 * @param recipes - Array of existing recipe summaries
 * @returns Formatted context string, or empty string if no recipes
 */
function buildExistingRecipesContext(
  recipes: { title: string; ingredients: string[]; seasons: string[] }[]
): string {
  if (recipes.length === 0) return '';

  const lines = recipes.map((r) => {
    const ings = r.ingredients.slice(0, 5).join(', ');
    const seasons = r.seasons.length > 0 ? r.seasons.join(', ') : 'tutte le stagioni';
    return `- ${r.title} (${seasons})${ings ? ` — ingredienti principali: ${ings}` : ''}`;
  });

  return `RICETTARIO ESISTENTE DELL'UTENTE (considera queste ricette per suggerire qualcosa di originale o complementare — evita duplicati diretti):\n${lines.join('\n')}\n\n`;
}

/**
 * Parses Claude's structured response into reply and recipe markdown.
 *
 * Fallback strategy: if delimiters are missing (Claude deviates from format),
 * put everything in reply and return empty extractedRecipes, so the chat
 * still shows a response instead of silently failing.
 *
 * @param fullText - Raw text from Claude
 * @returns { reply, extractedRecipes }
 */
function parseClaudeResponse(fullText: string): { reply: string; extractedRecipes: string } {
  // Case-insensitive match to handle any capitalisation variation Claude might produce
  const replyMatch = fullText.match(/\[RISPOSTA\]([\s\S]*?)\[\/RISPOSTA\]/i);
  const recipesMatch = fullText.match(/\[RICETTE\]([\s\S]*?)\[\/RICETTE\]/i);

  let reply: string;
  if (replyMatch) {
    reply = replyMatch[1].trim();
  } else {
    // Fallback: strip any [RICETTE] block and return the rest as the reply.
    // This handles cases where Claude omits the [RISPOSTA] wrapper but still
    // uses the [RICETTE] delimiter for the recipe section.
    reply = fullText
      .replace(/\[RICETTE\][\s\S]*?\[\/RICETTE\]/i, '')
      .replace(/\[RISPOSTA\]/gi, '')
      .replace(/\[\/RISPOSTA\]/gi, '')
      .trim();
  }

  const extractedRecipes = recipesMatch ? recipesMatch[1].trim() : '';

  return { reply, extractedRecipes };
}

/**
 * POST /api/chat-recipe
 *
 * Accepts a user message and optional conversation history, returns a
 * conversational reply plus any AI-generated recipes in structured markdown.
 *
 * Request body:
 *   message           - The user's current message
 *   conversationHistory - Previous turns (omit on first message)
 *   existingRecipes   - Summary of user's existing recipes (first turn only)
 *
 * Returns:
 *   reply            - Conversational text for the chat bubble
 *   extractedRecipes - Recipe markdown (empty string if no recipes generated)
 *
 * Side effects: None (stateless — history managed client-side)
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
    const { message, conversationHistory, existingRecipes, images, useWebSearch } = body;
    const familyContext = resolveFamilyContextInput(body);

    const imageResult = buildImageBlocks(images);
    if (!imageResult.ok) {
      return NextResponse.json({ error: imageResult.error }, { status: 400 });
    }
    const imageBlocks = imageResult.blocks;

    // A message consisting only of photos is legitimate ("cosa ci cucino con questo?"),
    // so text is required only when there is nothing else to go on.
    const hasText = typeof message === 'string' && message.trim().length > 0;
    if (!hasText && imageBlocks.length === 0) {
      return NextResponse.json(
        { error: 'Il messaggio non può essere vuoto' },
        { status: 400 }
      );
    }

    if (familyContext.validationError) {
      return NextResponse.json(
        { error: familyContext.validationError },
        { status: 400 }
      );
    }

    // Build the full message content for this turn.
    // On first message (empty history), prepend existing recipe context.
    const isFirstMessage = !conversationHistory || conversationHistory.length === 0;
    const recipeContext = isFirstMessage && Array.isArray(existingRecipes) && existingRecipes.length > 0
      ? buildExistingRecipesContext(existingRecipes)
      : '';
    const messageText = hasText ? message.trim() : '';
    const userMessageContent = familyContext.promptContext + recipeContext + messageText;

    // Cap conversation history to avoid runaway token costs.
    // 20 turns ≈ 10 back-and-forth exchanges, which is ample for a recipe chat session.
    const MAX_HISTORY_TURNS = 20;
    const safeHistory: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-MAX_HISTORY_TURNS)
      : [];

    // Strict equality: web search must be opt-in, so any value other than an explicit
    // true (including a truthy string from a malformed client) leaves it off.
    const isWebSearchEnabled = useWebSearch === true;

    // Images first, text second — same order as the PDF route, and the order the API
    // documents for vision: the model reads the attachments before the instruction.
    const userContent: Anthropic.Messages.ContentBlockParam[] = [
      ...imageBlocks,
      {
        type: 'text',
        text: userMessageContent || 'Guarda le foto che ho allegato.',
      },
    ];

    const anthropic = new Anthropic({ apiKey });

    const systemPrompt =
      CHAT_SYSTEM_PROMPT +
      (isWebSearchEnabled ? WEB_SEARCH_GUIDANCE : '') +
      (imageBlocks.length > 0 ? VISION_GUIDANCE : '');

    const { blocks, truncated } = await createMessageWithToolLoop(anthropic, {
      // Adaptive thinking is left on (Sonnet 5 default) here: recipe generation
      // benefits from reasoning, unlike the deterministic extraction endpoints.
      model: AI_MODEL,
      // Headroom for the Sonnet 5 tokenizer (~30% more tokens for equivalent text).
      // A search turn also carries the fetched excerpts, hence the larger ceiling.
      max_tokens: isWebSearchEnabled ? 8000 : 6000,
      system: systemPrompt,
      // No beta header needed for this tool version, and code_execution is deliberately
      // NOT declared alongside: the _20260209 search runs its own filtering internally,
      // and a second execution environment confuses the model.
      ...(isWebSearchEnabled
        ? { tools: [{ type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 4 }] }
        : {}),
      messages: [
        ...safeHistory,
        { role: 'user', content: userContent },
      ],
    });

    const fullText = extractTextFromBlocks(blocks);
    const { sources, errorCodes } = extractWebSearchSources(blocks);

    if (errorCodes.length > 0) {
      // The model still answered — a failed search is degraded quality, not a failed
      // request. Log it and let the reply through rather than discarding a paid response.
      console.warn('Web search reported errors:', errorCodes);
    }

    let { reply, extractedRecipes } = parseClaudeResponse(fullText);

    if (truncated) {
      reply += '\n\n_(La risposta si è interrotta: la ricerca ha richiesto troppi passaggi. Prova a chiedere qualcosa di più specifico.)_';
    }

    return NextResponse.json({
      success: true,
      reply,
      extractedRecipes,
      sources,
      // Return full raw content so the client can store it in conversation history
      // (including recipe blocks) for accurate multi-turn context
      rawContent: fullText,
      metadata: {
        model: AI_MODEL,
        source: 'chat',
        webSearchUsed: isWebSearchEnabled,
      },
    });
  } catch (error: any) {
    console.error('Error in chat-recipe:', error);

    return NextResponse.json(
      {
        error: 'Errore durante la generazione della ricetta',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
