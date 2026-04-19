/** @format */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import { applyReplyEditor } from 'src/api/reply-editor.ts';
import { resetRecentBotOutputForTesting } from 'src/api/recent-bot-output.ts';
import { config } from 'src/config.ts';

describe('applyReplyEditor — stripping', () => {
  beforeEach(() => {
    resetRecentBotOutputForTesting();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: [1, 0, 0] })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('strips leading "botname:" prefix', async () => {
    const result = await applyReplyEditor(`${config.bot.name}: hello`, 'ch-1');
    expect(result.accepted).toBe(true);
    expect(result.text).toBe('hello');
  });

  test('strips surrounding double quotes', async () => {
    const result = await applyReplyEditor('"hello"', 'ch-1');
    expect(result.accepted).toBe(true);
    expect(result.text).toBe('hello');
  });

  test('strips surrounding markdown code fences', async () => {
    const result = await applyReplyEditor('```\nhello\n```', 'ch-1');
    expect(result.accepted).toBe(true);
    expect(result.text).toBe('hello');
  });
});

describe('applyReplyEditor — rejection', () => {
  beforeEach(() => {
    resetRecentBotOutputForTesting();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: [1, 0, 0] })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('rejects replies over 280 chars', async () => {
    const long = 'a'.repeat(281);
    const result = await applyReplyEditor(long, 'ch-1');
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/length|too long/i);
  });

  test('rejects replies starting with banned opener "Absolutely"', async () => {
    const result = await applyReplyEditor('Absolutely! that is a great point', 'ch-1');
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/banned opener/i);
  });

  test('rejects replies starting with banned opener "I " (case-insensitive)', async () => {
    const result = await applyReplyEditor('i think you are right', 'ch-1');
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/banned opener/i);
  });

  test('rejects replies that are cosine-similar to a recent bot output', async () => {
    const { addBotOutput } = await import('src/api/recent-bot-output.ts');
    await addBotOutput('ch-1', 'prior reply');
    const result = await applyReplyEditor('different words, same vector under the mock', 'ch-1');
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/similar|duplicate/i);
  });
});

describe('envisioned behavior: AI tells and duplicates never reach Discord', () => {
  beforeEach(() => {
    resetRecentBotOutputForTesting();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: [1, 0, 0] })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('a reply with prefix + fences + surrounding quotes gets cleaned, not rejected', async () => {
    const messy = `\`\`\`\n${config.bot.name}: "lmao fair"\n\`\`\``;
    const result = await applyReplyEditor(messy, 'general');
    expect(result.accepted).toBe(true);
    expect(result.text).toBe('lmao fair');
  });

  test('a second, effectively-identical reply in the same channel is rejected', async () => {
    const first = await applyReplyEditor('lmao fair', 'general');
    expect(first.accepted).toBe(true);
    const { addBotOutput } = await import('src/api/recent-bot-output.ts');
    await addBotOutput('general', first.text!);
    const second = await applyReplyEditor('lmao fair enough', 'general');
    expect(second.accepted).toBe(false);
    expect(second.reason).toMatch(/similar|duplicate/i);
  });
});
