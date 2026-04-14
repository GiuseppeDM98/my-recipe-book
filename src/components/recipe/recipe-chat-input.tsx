'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare, Send, Sparkles, ChefHat } from 'lucide-react';
import { Ingredient, Season } from '@/types';
import { getFirebaseAuthHeader } from '@/lib/firebase/client-auth';

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
}

/**
 * RecipeChatInput component
 *
 * @param onRecipesExtracted - Called with recipe markdown when AI generates recipes
 * @param disabled - Blocks submit (e.g. test account)
 * @param existingRecipes - User's current cookbook, passed as context on first message
 */
export function RecipeChatInput({ onRecipesExtracted, disabled, existingRecipes }: RecipeChatInputProps) {
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
      const response = await fetch('/api/chat-recipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getFirebaseAuthHeader({ forceRefresh: true })),
        },
        body: JSON.stringify({
          message: userApiContent,
          conversationHistory: apiHistory,
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
        content: 'Si è verificato un errore. Per favore riprova tra qualche secondo.',
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
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ChefHat className="w-5 h-5 text-blue-700" />
            <h3 className="font-semibold text-blue-900">Chatta con l'AI Chef</h3>
          </div>
          <p className="text-sm text-blue-800 mb-4">
            Chiedi una nuova ricetta, descrivi gli ingredienti che hai a disposizione, o lascia che l'AI ti sorprenda con qualcosa di originale rispetto al tuo ricettario.
          </p>
          {/* Starter prompt chips */}
          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleStarterPrompt(prompt)}
                disabled={disabled}
                className="text-xs px-3 py-1.5 rounded-full bg-white border border-blue-300 text-blue-700
                  hover:bg-blue-100 hover:border-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    ? 'bg-primary text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}
              >
                {msg.content}

                {/* Recipe generation indicator */}
                {msg.hasRecipes && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-200 text-xs text-primary font-medium">
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
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
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
            placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isSending || disabled ? 'bg-gray-50' : 'bg-white border-gray-300'}`}
        />
        <Button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || isSending || disabled}
          size="lg"
          className="gap-2 shrink-0"
        >
          {isSending ? (
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">{isSending ? 'Invio...' : 'Invia'}</span>
        </Button>
      </div>

      {/* Keyboard hint — only shown when chat has started */}
      {hasMessages && (
        <p className="text-xs text-gray-400 text-center">
          Invio per inviare · Shift+Invio per andare a capo
        </p>
      )}
    </div>
  );
}
