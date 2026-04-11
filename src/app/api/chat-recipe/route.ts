import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuthenticatedUser } from '@/lib/api/require-user';

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
- NON usare MAI asterischi (**testo**, *testo*) negli ingredienti, nel procedimento o nelle note
- Usa unità metriche italiane (g, kg, ml, l, cucchiai, cucchiaini)
- Usa decimali con virgola: 1,5 kg (NON 1.5 kg)
- Includi porzioni e tempi solo se sei ragionevolmente sicuro, altrimenti ometti`;

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
    const { message, conversationHistory, existingRecipes } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Il messaggio non può essere vuoto' },
        { status: 400 }
      );
    }

    // Build the full message content for this turn.
    // On first message (empty history), prepend existing recipe context.
    const isFirstMessage = !conversationHistory || conversationHistory.length === 0;
    const recipeContext = isFirstMessage && Array.isArray(existingRecipes) && existingRecipes.length > 0
      ? buildExistingRecipesContext(existingRecipes)
      : '';
    const userMessageContent = recipeContext + message.trim();

    // Cap conversation history to avoid runaway token costs.
    // 20 turns ≈ 10 back-and-forth exchanges, which is ample for a recipe chat session.
    const MAX_HISTORY_TURNS = 20;
    const safeHistory: { role: 'user' | 'assistant'; content: string }[] = Array.isArray(conversationHistory)
      ? conversationHistory.slice(-MAX_HISTORY_TURNS)
      : [];

    const anthropic = new Anthropic({ apiKey });

    const claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: CHAT_SYSTEM_PROMPT,
      messages: [
        ...safeHistory,
        { role: 'user', content: userMessageContent },
      ],
    });

    const fullText = claudeResponse.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('\n');

    const { reply, extractedRecipes } = parseClaudeResponse(fullText);

    return NextResponse.json({
      success: true,
      reply,
      extractedRecipes,
      // Return full raw content so the client can store it in conversation history
      // (including recipe blocks) for accurate multi-turn context
      rawContent: fullText,
      metadata: {
        model: 'claude-sonnet-4-6',
        source: 'chat',
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
