import Anthropic from '@anthropic-ai/sdk';

/**
 * Resume helper for responses that use server-side tools.
 *
 * THE PROBLEM THIS SOLVES:
 * When a request declares a server-side tool (web search), Anthropic runs its own
 * sampling loop. That loop stops after 10 iterations and returns `stop_reason:
 * 'pause_turn'` with whatever was generated so far. The HTTP call succeeds — there is
 * no error, no exception, nothing that a normal try/catch would notice.
 *
 * For this app the failure is specific and silent: our chat responses are wrapped in
 * [RISPOSTA]…[/RISPOSTA] and [RICETTE]…[/RICETTE]. A paused turn usually has enough
 * text to close [/RISPOSTA] but not [/RICETTE], so the user sees a perfectly ordinary
 * reply and the recipes simply are not there. No error is shown because, as far as
 * every layer above is concerned, nothing failed.
 *
 * HOW RESUMING WORKS:
 * Send the conversation back with the paused assistant turn appended and NO new user
 * message. The API detects the trailing tool-use state and continues where it left off.
 * Adding a "Continua." user message instead breaks the resume — it reads as a new
 * instruction and the model starts a fresh answer.
 */

/** Continuations allowed before giving up, so a pathological turn can't loop forever. */
const MAX_CONTINUATIONS = 5;

export interface ToolLoopResult {
  /** Every content block across the initial response and all continuations, in order. */
  blocks: Anthropic.Messages.ContentBlock[];
  /** The final response's stop reason. */
  stopReason: string | null;
  /** How many resume requests were needed (0 when the first response completed). */
  continuations: number;
  /** True when the cap was hit while still paused — the answer may be cut short. */
  truncated: boolean;
}

type MessageCreateParams = Anthropic.Messages.MessageCreateParamsNonStreaming;

/**
 * Creates a message and transparently resumes it while the server keeps pausing.
 *
 * @param anthropic - Configured SDK client
 * @param params - The same params you would pass to `messages.create`
 * @param options.maxContinuations - Override the resume cap (default 5)
 * @returns Blocks from every response concatenated, plus resume bookkeeping
 *
 * The returned `blocks` are ordered so downstream text extraction sees the turn as one
 * continuous response — which is what makes the delimiter parsing work again.
 */
export async function createMessageWithToolLoop(
  anthropic: Anthropic,
  params: MessageCreateParams,
  options?: { maxContinuations?: number }
): Promise<ToolLoopResult> {
  const maxContinuations = options?.maxContinuations ?? MAX_CONTINUATIONS;

  let response = await anthropic.messages.create(params);
  const blocks: Anthropic.Messages.ContentBlock[] = [...response.content];
  const messages = [...params.messages];
  let continuations = 0;

  while (response.stop_reason === 'pause_turn' && continuations < maxContinuations) {
    // Append the paused assistant turn and re-send. No new user message: the API resumes
    // from the trailing tool-use state, and an extra user turn would derail it.
    messages.push({ role: 'assistant', content: response.content });

    response = await anthropic.messages.create({ ...params, messages });
    blocks.push(...response.content);
    continuations += 1;
  }

  return {
    blocks,
    stopReason: response.stop_reason,
    continuations,
    truncated: response.stop_reason === 'pause_turn',
  };
}
