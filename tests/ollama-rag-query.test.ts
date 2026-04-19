/** @format */

import { describe, test, expect } from 'vitest';

import { narrowRagQuery } from 'src/message-create-handlers/ollama-rag-query.ts';

describe('narrowRagQuery', () => {
  test('keeps only the last 3 lines of a longer history', () => {
    const full = Array.from({ length: 10 }, (_, i) => `u${i}: message number ${i}`).join('\n');
    const narrow = narrowRagQuery(full);
    expect(narrow.split('\n')).toHaveLength(3);
    expect(narrow).toContain('u7: message number 7');
    expect(narrow).toContain('u8: message number 8');
    expect(narrow).toContain('u9: message number 9');
    expect(narrow).not.toContain('u0: message number 0');
  });

  test('returns the full history if it has 3 or fewer lines', () => {
    expect(narrowRagQuery('a: hi\nb: yo')).toBe('a: hi\nb: yo');
    expect(narrowRagQuery('a: single')).toBe('a: single');
  });

  test('handles empty input by returning empty string', () => {
    expect(narrowRagQuery('')).toBe('');
  });
});

// Scenario test: the envisioned behavior — RAG queries track the *current* moment,
// not the entire rolling buffer. A 30-message buffer where only the last 2 lines
// are about PoE should produce a query that embeds "PoE," not an averaged blur.
describe('envisioned behavior: RAG query tracks the current moment', () => {
  test('a 30-message off-topic buffer with a recent topic shift embeds only the shift', () => {
    const offTopic = Array.from({ length: 28 }, (_, i) => `user${i}: anime ramble number ${i}`);
    const topicShift = ['alice: ok but did anyone drop a divine this league', 'bob: lol no i hate it here'];
    const full = [...offTopic, ...topicShift].join('\n');

    const narrow = narrowRagQuery(full);

    // The last 3 lines only — the topic shift plus one adjacent line
    expect(narrow.split('\n')).toHaveLength(3);
    expect(narrow).toContain('alice: ok but did anyone drop a divine this league');
    expect(narrow).toContain('bob: lol no i hate it here');
    expect(narrow).not.toContain('anime ramble number 0');
  });
});
