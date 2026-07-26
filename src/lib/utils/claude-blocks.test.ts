import { extractTextFromBlocks, extractWebSearchSources } from '@/lib/utils/claude-blocks';

function textBlock(text: string) {
  return { type: 'text', text };
}

function searchResultBlock(results: { url: string; title?: string }[]) {
  return {
    type: 'web_search_tool_result',
    content: results.map(r => ({ type: 'web_search_result', ...r })),
  };
}

function searchErrorBlock(errorCode: string) {
  return {
    type: 'web_search_tool_result',
    content: { type: 'web_search_tool_result_error', error_code: errorCode },
  };
}

describe('extractTextFromBlocks', () => {
  it('should join text blocks and ignore non-text blocks', () => {
    // Arrange
    const blocks = [
      textBlock('Prima parte'),
      { type: 'server_tool_use', name: 'web_search', input: {} },
      searchResultBlock([{ url: 'https://example.com' }]),
      textBlock('Seconda parte'),
    ];

    // Act
    const result = extractTextFromBlocks(blocks);

    // Assert
    expect(result).toBe('Prima parte\nSeconda parte');
  });

  it('should return an empty string when given a non-array', () => {
    expect(extractTextFromBlocks(null as unknown as unknown[])).toBe('');
  });

  it('should skip malformed text blocks without throwing', () => {
    // Arrange — a text block with no text field
    const blocks = [{ type: 'text' }, textBlock('valido'), null, 'stringa'];

    // Act
    const result = extractTextFromBlocks(blocks);

    // Assert
    expect(result).toBe('valido');
  });

  it('should keep [RISPOSTA]/[RICETTE] parseable when a search splits the text blocks', () => {
    // Arrange — this is the shape a web-search turn actually produces: the model opens
    // a delimiter, searches, then closes it in a later text block. If the rejoined text
    // lost that continuity, the chat would silently drop every generated recipe.
    const blocks = [
      textBlock('[RISPOSTA]\nEcco una ricetta tradizionale.'),
      { type: 'server_tool_use', name: 'web_search', input: { query: 'pizzoccheri' } },
      searchResultBlock([{ url: 'https://a.example', title: 'Fonte' }]),
      textBlock('[/RISPOSTA]\n\n[RICETTE]\n# Pizzoccheri\n[/RICETTE]'),
    ];

    // Act
    const fullText = extractTextFromBlocks(blocks);

    // Assert — both delimited sections survive the rejoin
    expect(fullText).toMatch(/\[RISPOSTA\][\s\S]*?\[\/RISPOSTA\]/);
    expect(fullText.match(/\[RICETTE\]([\s\S]*?)\[\/RICETTE\]/)?.[1]).toContain('# Pizzoccheri');
  });
});

describe('extractWebSearchSources', () => {
  it('should extract sources from a successful search block', () => {
    // Arrange
    const blocks = [
      searchResultBlock([
        { url: 'https://a.example', title: 'Ricetta A' },
        { url: 'https://b.example', title: 'Ricetta B' },
      ]),
    ];

    // Act
    const { sources, errorCodes } = extractWebSearchSources(blocks);

    // Assert
    expect(sources).toEqual([
      { url: 'https://a.example', title: 'Ricetta A' },
      { url: 'https://b.example', title: 'Ricetta B' },
    ]);
    expect(errorCodes).toEqual([]);
  });

  it('should not throw when content is an error object instead of an array', () => {
    // Arrange — the API returns this shape on HTTP 200, which is the whole trap
    const blocks = [searchErrorBlock('max_uses_exceeded')];

    // Act
    const { sources, errorCodes } = extractWebSearchSources(blocks);

    // Assert
    expect(sources).toEqual([]);
    expect(errorCodes).toEqual(['max_uses_exceeded']);
  });

  it('should keep successful sources when another search in the same turn failed', () => {
    // Arrange
    const blocks = [
      searchResultBlock([{ url: 'https://a.example', title: 'Ricetta A' }]),
      searchErrorBlock('too_many_requests'),
    ];

    // Act
    const { sources, errorCodes } = extractWebSearchSources(blocks);

    // Assert
    expect(sources).toHaveLength(1);
    expect(errorCodes).toEqual(['too_many_requests']);
  });

  it('should tolerate a null content field', () => {
    // Arrange
    const blocks = [{ type: 'web_search_tool_result', content: null }];

    // Act
    const result = extractWebSearchSources(blocks);

    // Assert
    expect(result).toEqual({ sources: [], errorCodes: [] });
  });

  it('should deduplicate sources that share a URL', () => {
    // Arrange — the model often re-fetches the same page across searches
    const blocks = [
      searchResultBlock([{ url: 'https://a.example', title: 'Ricetta A' }]),
      searchResultBlock([
        { url: 'https://a.example', title: 'Ricetta A (di nuovo)' },
        { url: 'https://b.example', title: 'Ricetta B' },
      ]),
    ];

    // Act
    const { sources } = extractWebSearchSources(blocks);

    // Assert
    expect(sources).toHaveLength(2);
    expect(sources[0].title).toBe('Ricetta A');
  });

  it('should cap the source list at four entries', () => {
    // Arrange
    const blocks = [
      searchResultBlock(
        Array.from({ length: 9 }, (_, i) => ({ url: `https://${i}.example`, title: `Fonte ${i}` }))
      ),
    ];

    // Act
    const { sources } = extractWebSearchSources(blocks);

    // Assert
    expect(sources).toHaveLength(4);
  });

  it('should fall back to the URL when a result has no usable title', () => {
    // Arrange
    const blocks = [searchResultBlock([{ url: 'https://a.example', title: '   ' }])];

    // Act
    const { sources } = extractWebSearchSources(blocks);

    // Assert
    expect(sources[0].title).toBe('https://a.example');
  });

  it('should skip results with no URL rather than emitting a broken source', () => {
    // Arrange
    const blocks = [
      {
        type: 'web_search_tool_result',
        content: [{ type: 'web_search_result', title: 'Senza url' }],
      },
    ];

    // Act
    const { sources } = extractWebSearchSources(blocks);

    // Assert
    expect(sources).toEqual([]);
  });
});
