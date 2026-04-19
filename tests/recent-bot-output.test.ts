/** @format */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';

import { addBotOutput, isCosineSimilarToRecent, resetRecentBotOutputForTesting } from 'src/api/recent-bot-output.ts';

describe('recent-bot-output — ring buffer', () => {
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

  test('a fresh channel has no similar past outputs', async () => {
    const result = await isCosineSimilarToRecent('ch-1', 'anything', 0.85);
    expect(result).toBe(false);
  });

  test('after adding one output, an identical embedding triggers the similarity check', async () => {
    await addBotOutput('ch-1', 'hello');
    const result = await isCosineSimilarToRecent('ch-1', 'hello again', 0.85);
    expect(result).toBe(true);
  });

  test('similarity check is per-channel — outputs in ch-1 do not shadow ch-2', async () => {
    await addBotOutput('ch-1', 'hello');
    const result = await isCosineSimilarToRecent('ch-2', 'hello', 0.85);
    expect(result).toBe(false);
  });

  test('ring buffer caps at 20 entries per channel', async () => {
    for (let i = 0; i < 25; i++) {
      await addBotOutput('ch-1', `line ${i}`);
    }
    expect(await isCosineSimilarToRecent('ch-1', 'anything', 0.85)).toBe(true);
  });
});

describe('envisioned behavior: no back-to-back duplicate replies in the same channel', () => {
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

  test('the second attempt to emit an effectively-identical reply is flagged as too-similar', async () => {
    await addBotOutput('general', 'lmao fair');
    const tooClose = await isCosineSimilarToRecent('general', 'lmao fair enough', 0.85);
    expect(tooClose).toBe(true);
  });
});
