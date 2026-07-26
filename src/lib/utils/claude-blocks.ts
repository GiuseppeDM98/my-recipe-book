/**
 * Helpers for reading Claude response content blocks.
 *
 * WHY A SEPARATE MODULE:
 * Once the chat endpoint declares the web search tool, a response is no longer a flat
 * list of text blocks — it interleaves `server_tool_use` and `web_search_tool_result`
 * blocks with the text. Pulling that apart is pure data handling with a genuinely
 * awkward edge case (see extractWebSearchSources), so it lives here and is tested
 * directly rather than being inlined in the route.
 *
 * These functions are deliberately defensive: the shapes below come from the API, and a
 * malformed block must never throw and take down a response the model has already paid
 * for and produced.
 */

/** A source Claude consulted via the web search tool. */
export interface WebSearchSource {
  title: string;
  url: string;
}

export interface WebSearchExtraction {
  sources: WebSearchSource[];
  /** Error codes reported by the search tool (e.g. 'max_uses_exceeded'). */
  errorCodes: string[];
}

/** Maximum sources surfaced to the user — beyond this the list stops being scannable. */
const MAX_SOURCES = 4;

/**
 * Concatenates the text of every `text` block, in order.
 *
 * Blocks are joined with a newline rather than an empty string because tool use splits
 * what the model wrote into several text blocks; joining them tightly could weld the end
 * of one sentence onto the start of the next.
 */
export function extractTextFromBlocks(blocks: unknown[]): string {
  if (!Array.isArray(blocks)) return '';

  return blocks
    .filter((block): block is { type: 'text'; text: string } => {
      return (
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string'
      );
    })
    .map(block => block.text)
    .join('\n');
}

/**
 * Collects the sources Claude consulted, plus any search errors.
 *
 * THE EDGE CASE THAT MATTERS:
 * A successful `web_search_tool_result` carries `content` as an ARRAY of results. A
 * failed one carries `content` as an OBJECT — `{ type: 'web_search_tool_result_error',
 * error_code: 'max_uses_exceeded' }` — and still arrives on an HTTP 200 response. Code
 * that assumes an array and indexes into it reads `undefined` properties off the error
 * object, or throws on a `.map`. Hence the `Array.isArray` check before iterating.
 *
 * Sources are deduplicated by URL: the model frequently fetches the same page across
 * several searches within one turn.
 */
export function extractWebSearchSources(blocks: unknown[]): WebSearchExtraction {
  const sources: WebSearchSource[] = [];
  const errorCodes: string[] = [];
  const seenUrls = new Set<string>();

  if (!Array.isArray(blocks)) {
    return { sources, errorCodes };
  }

  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue;
    if ((block as { type?: unknown }).type !== 'web_search_tool_result') continue;

    const content = (block as { content?: unknown }).content;

    // Error case: content is an object, not the usual array of results.
    if (!Array.isArray(content)) {
      const errorCode = (content as { error_code?: unknown } | null)?.error_code;
      if (typeof errorCode === 'string') {
        errorCodes.push(errorCode);
      }
      continue;
    }

    for (const result of content) {
      if (typeof result !== 'object' || result === null) continue;

      const url = (result as { url?: unknown }).url;
      if (typeof url !== 'string' || seenUrls.has(url)) continue;

      seenUrls.add(url);
      const title = (result as { title?: unknown }).title;
      sources.push({
        url,
        title: typeof title === 'string' && title.trim() ? title : url,
      });
    }
  }

  return { sources: sources.slice(0, MAX_SOURCES), errorCodes };
}
