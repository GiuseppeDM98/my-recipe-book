'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare, Send, Sparkles, ChefHat } from 'lucide-react';
import { FamilyProfile, Ingredient, Season } from '@/types';
import { getFirebaseAuthHeader } from '@/lib/firebase/client-auth';
import { validateFamilyContextUsage } from '@/lib/utils/family-context';
import { StatusBanner } from '@/components/ui/status-banner';

/**
 * RecipeChatInput - Conversational AI recipe generation interface
 *
 * PURPOSE: Let the user chat with an AI chef to get new recipe suggestions,
 * optionally tailored to avoid duplicating what's already in their cookbook.
 *
 * Architecture:
 * - Manages its own conversation display state (messages shown in chat UI)
 * - Maintains a separate full conversation history for the API (includes raw
 *   Claude output with recipe blocks, for accurate multi-turn context)
 * - Surfaces generated recipes to the parent via onRecipesExtracted callback
 *   so the existing ExtractedRecipePreview pipeline is reused unchanged
 *
 * The existing recipes context is injected only on the first message to keep
 * subsequent API calls lean (history already carries the context implicitly).
 */

/**
 * Cleans the reply text received from the API before displaying it in the chat.
 *
 * Acts as a second line of defense in case Claude doesn't follow the
 * [RISPOSTA]/[RICETTE] delimiter format exactly and the server-side regex
 * returns the full raw text. Also strips markdown bold/italic artifacts.
 */
function cleanReply(text: string): string {
  return text
    // Strip [RISPOSTA]/[/RISPOSTA] tags if server-side parsing missed them
    .replace(/\[RISPOSTA\]/gi, '')
    .replace(/\[\/RISPOSTA\]/gi, '')
    // Strip [RICETTE]...[/RICETTE] blocks entirely (recipes are shown as cards, not in chat)
    .replace(/\[RICETTE\][\s\S]*?\[\/RICETTE\]/gi, '')
    // Strip markdown bold and italic (**text** → text, *text* → text)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .trim();
}

// Starter prompts shown in the empty state to guide first-time users
const STARTER_PROMPTS = [
  'Ho delle zucchine in frigo, cosa posso cucinare?',
  'Suggerisci una ricetta vegetariana estiva',
  'Crea qualcosa di diverso dalle mie ricette',
  'Ho solo pasta e pomodori, cosa faccio?',
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  // True when this assistant turn produced recipe cards (shown below the chat)
  hasRecipes: boolean;
}

interface ApiHistoryMessage {
  role: 'user' | 'assistant';
  // Full content including [RICETTE] blocks — needed for accurate AI context
  content: string;
}

export interface RecipeChatInputProps {
  onRecipesExtracted: (markdown: string) => Promise<void>;
  disabled?: boolean;
  existingRecipes: { title: string; ingredients: Ingredient[]; seasons: Season[] }[];
  useFamilyContext: boolean;
  familyProfile: FamilyProfile | null;
}

/**
 * RecipeChatInput component
 *
 * @param onRecipesExtracted - Called with recipe markdown when AI generates recipes
 * @param disabled - Blocks submit (e.g. test account)
 * @param existingRecipes - User's current cookbook, passed as context on first message
 */
export function RecipeChatInput({
  onRecipesExtracted,
  disabled,
  existingRecipes,
  useFamilyContext,
  familyProfile,
}: RecipeChatInputProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Full history stored for the API — includes raw Claude output with [RICETTE] blocks
  const [apiHistory, setApiHistory] = useState<ApiHistoryMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * Builds a compact summary of the user's existing recipes to inject as
   * context in the first message. Limits to 5 ingredients per recipe to
   * keep the context block reasonably sized.
   *
   * @param recipes - User's existing recipes
   * @returns Formatted context string
   */
  function buildExistingRecipesContext(
    recipes: { title: string; ingredients: Ingredient[]; seasons: Season[] }[]
  ): string {
    if (recipes.length === 0) return '';
    const lines = recipes.map((r) => {
      const ings = r.ingredients.slice(0, 5).map((i) => i.name).join(', ');
      const seasons = r.seasons.length > 0 ? r.seasons.join(', ') : 'tutte le stagioni';
      return `- ${r.title} (${seasons})${ings ? ` — ingredienti principali: ${ings}` : ''}`;
    });
    return `RICETTARIO ESISTENTE DELL'UTENTE (considera queste ricette per suggerire qualcosa di originale o complementare — evita duplicati diretti):\n${lines.join('\n')}\n\n`;
  }

  /**
   * Sends the user message to /api/chat-recipe and handles the response.
   *
   * Side effects:
   * - Updates messages (chat display) and apiHistory (API context)
   * - Calls onRecipesExtracted if Claude returned recipe markdown
   */
  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending || disabled) return;

    setInput('');
    setIsSending(true);

    // Add user message to display immediately (optimistic)
    setMessages((prev) => [...prev, { role: 'user', content: text, hasRecipes: false }]);

    // Inject existing recipes context only on the first turn
    const isFirstMessage = apiHistory.length === 0;
    const contextPrefix = isFirstMessage ? buildExistingRecipesContext(existingRecipes) : '';
    const userApiContent = contextPrefix + text;

    try {
      const familyContextError = validateFamilyContextUsage(useFamilyContext, familyProfile);
      if (familyContextError) {
        throw new Error(familyContextError);
      }

      const response = await fetch('/api/chat-recipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getFirebaseAuthHeader({ forceRefresh: true })),
        },
        body: JSON.stringify({
          message: userApiContent,
          conversationHistory: apiHistory,
          useFamilyContext,
          familyProfile,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore nella risposta dell\'AI');
      }

      const data = await response.json();

      // Update API history with full content (including recipe blocks) for next turn
      const assistantRaw = data.rawContent || `[RISPOSTA]\n${data.reply}\n[/RISPOSTA]\n[RICETTE]\n${data.extractedRecipes}\n[/RICETTE]`;
      setApiHistory((prev) => [
        ...prev,
        { role: 'user', content: userApiContent },
        { role: 'assistant', content: assistantRaw },
      ]);

      const hasRecipes = !!data.extractedRecipes;

      // Display reply in chat (no recipe markdown — those appear as cards below).
      // cleanReply strips delimiter tags and markdown in case server-side parsing missed them.
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: cleanReply(data.reply || 'Ecco la mia risposta.'),
        hasRecipes,
      }]);

      // Surface recipe markdown to parent for parsing + ExtractedRecipePreview
      if (hasRecipes) {
        await onRecipesExtracted(data.extractedRecipes);
      }
    } catch (err: any) {
      console.error('Chat recipe error:', err);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: err?.message || 'Si è verificato un errore. Per favore riprova tra qualche secondo.',
        hasRecipes: false,
      }]);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  // Send on Enter, newline on Shift+Enter (standard chat convention)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Fill input with a starter prompt chip
  const handleStarterPrompt = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Empty state ── */}
      {!hasMessages && (
        <div className="rounded-[1.5rem] border border-border bg-[radial-gradient(circle_at_top,_oklch(var(--primary)/0.08),_transparent_38%),linear-gradient(180deg,_oklch(var(--card))_0%,_oklch(var(--background))_100%)] p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ChefHat className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold text-foreground">Chatta con l&apos;AI Chef</h3>
              <p className="text-sm text-muted-foreground">Piatti credibili, ingredienti di stagione, idee nuove ma cucinabili davvero.</p>
            </div>
          </div>
          <p className="mb-4 text-sm leading-6 text-muted-foreground">
            Chiedi una nuova ricetta, descrivi quello che hai a disposizione, oppure lascia che l&apos;AI trovi un&apos;idea diversa dal tuo ricettario.
          </p>
          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleStarterPrompt(prompt)}
                disabled={disabled}
                className="rounded-full border border-primary/20 bg-background px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/8 hover:border-primary/35 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Chat message list ── */}
      {hasMessages && (
        <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1 py-1">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap
                  ${msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm shadow-[0_12px_28px_-18px_oklch(var(--primary)/0.7)]'
                    : 'bg-muted/70 text-foreground rounded-bl-sm border border-border/70'
                  }`}
              >
                {msg.content}

                {/* Recipe generation indicator */}
                {msg.hasRecipes && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border text-xs text-primary font-medium">
                    <Sparkles className="w-3 h-3" />
                    Ricette generate — vedi sotto
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator while waiting for response */}
          {isSending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-primary/55 animate-soft-bob motion-reduce:animate-none" />
                  <span className="h-2 w-2 rounded-full bg-primary/40 animate-soft-bob motion-reduce:animate-none" style={{ animationDelay: '140ms' }} />
                  <span className="h-2 w-2 rounded-full bg-primary/25 animate-soft-bob motion-reduce:animate-none" style={{ animationDelay: '280ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* ── Input area ── */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scrivi un messaggio... (Invio per inviare, Shift+Invio per andare a capo)"
          disabled={isSending || disabled}
          rows={2}
          className={`flex-1 rounded-xl border px-4 py-3 text-sm leading-relaxed resize-none
            placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isSending || disabled ? 'bg-muted' : 'bg-background border-input'}`}
        />
        <Button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || isSending || disabled}
          size="lg"
          className="gap-2 shrink-0"
        >
          {isSending ? (
            <div className="h-4 w-4 rounded-full border-2 border-primary-foreground/70 border-t-transparent animate-spin motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">{isSending ? 'Invio...' : 'Invia'}</span>
        </Button>
      </div>

      {/* Keyboard hint — only shown when chat has started */}
      {hasMessages && (
        <p className="text-xs text-muted-foreground text-center">
          Invio per inviare · Shift+Invio per andare a capo
        </p>
      )}
    </div>
  );
}
