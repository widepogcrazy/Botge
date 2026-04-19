/** @format */

import { describe, test, expect } from 'vitest';

import { narrowRagQuery } from 'src/message-create-handlers/ollama-rag-query.ts';

describe('narrowRagQuery', () => {
  test('default limit keeps only the last 6 lines of a longer history', () => {
    const full = Array.from({ length: 10 }, (_, i) => `u${i}: message number ${i}`).join('\n');
    const narrow = narrowRagQuery(full);
    expect(narrow.split('\n')).toHaveLength(6);
    expect(narrow).toContain('u4: message number 4');
    expect(narrow).toContain('u9: message number 9');
    expect(narrow).not.toContain('u0: message number 0');
    expect(narrow).not.toContain('u3: message number 3');
  });

  test('respects a custom limit option', () => {
    const full = Array.from({ length: 10 }, (_, i) => `u${i}: m${i}`).join('\n');
    const narrow = narrowRagQuery(full, { limit: 3 });
    expect(narrow.split('\n')).toHaveLength(3);
    expect(narrow).toContain('u7: m7');
    expect(narrow).toContain('u9: m9');
    expect(narrow).not.toContain('u6: m6');
  });

  test('returns the full history if it has `limit` or fewer lines', () => {
    expect(narrowRagQuery('a: hi\nb: yo')).toBe('a: hi\nb: yo');
    expect(narrowRagQuery('a: single')).toBe('a: single');
  });

  test('handles empty input by returning empty string', () => {
    expect(narrowRagQuery('')).toBe('');
  });

  test('excludeAuthor filters out lines authored by that name', () => {
    const history = ['alice: yo', 'Botge: lol', 'bob: sup', 'Botge: mood', 'carol: anyone around', 'alice: ye'].join(
      '\n'
    );

    const narrow = narrowRagQuery(history, { excludeAuthor: 'Botge', limit: 10 });
    expect(narrow).not.toContain('Botge:');
    expect(narrow.split('\n')).toHaveLength(4);
    expect(narrow).toContain('alice: yo');
    expect(narrow).toContain('bob: sup');
    expect(narrow).toContain('carol: anyone around');
    expect(narrow).toContain('alice: ye');
  });

  test('excludeAuthor + limit takes the last `limit` AFTER filtering', () => {
    const history = [
      'alice: 1',
      'Botge: x',
      'bob: 2',
      'Botge: y',
      'carol: 3',
      'alice: 4',
      'bob: 5',
      'carol: 6',
      'alice: 7',
      'bob: 8'
    ].join('\n');

    const narrow = narrowRagQuery(history, { excludeAuthor: 'Botge', limit: 6 });
    expect(narrow.split('\n')).toHaveLength(6);
    // The last 6 non-bot lines are: carol:3, alice:4, bob:5, carol:6, alice:7, bob:8
    expect(narrow).toContain('carol: 3');
    expect(narrow).toContain('alice: 4');
    expect(narrow).toContain('bob: 8');
    // The first two non-bot lines were trimmed off by limit
    expect(narrow).not.toContain('alice: 1');
    expect(narrow).not.toContain('bob: 2');
    // Bot lines are gone regardless
    expect(narrow).not.toContain('Botge: x');
    expect(narrow).not.toContain('Botge: y');
  });
});

// Scenario test: the envisioned behavior — RAG queries track the *current*
// moment expressed by humans, not the entire buffer and not the bot's own
// prior replies (which would encourage self-referential embedding).
describe('envisioned behavior: RAG query tracks what the humans just said', () => {
  test('a chatty buffer with bot interjections produces a query of only the recent human lines', () => {
    const history = [
      'alice: ok but did anyone drop a divine this league',
      'Botge: nah divines are a myth invented by chris wilson',
      'bob: lmao',
      'carol: i did actually, yesterday',
      'Botge: wait what really',
      'alice: post item or it didnt happen',
      'carol: hold on let me screenshot',
      'bob: ive been playing for 4 years and never seen one drop'
    ].join('\n');

    const narrow = narrowRagQuery(history, { excludeAuthor: 'Botge', limit: 6 });

    // The bot's two lines are gone — query reflects the human conversation only
    expect(narrow).not.toContain('Botge:');

    // The last 6 human lines are all present
    expect(narrow.split('\n')).toHaveLength(6);
    expect(narrow).toContain('alice: ok but did anyone drop a divine this league');
    expect(narrow).toContain('bob: ive been playing for 4 years and never seen one drop');
  });
});
