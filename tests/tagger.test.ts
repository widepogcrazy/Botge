/** @format */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import { tagMessage, TAG_TAXONOMY } from 'src/api/tagger.ts';

describe('tagMessage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: '["anime","joke-setup"]' } })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('POSTs to /api/chat with format: "json"', async () => {
    await tagMessage('did anyone watch the new frieren episode');
    const mockedFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = mockedFetch.mock.calls[0];
    expect(url).toMatch(/\/api\/chat$/);
    const body = JSON.parse(init?.body as string) as { format?: string; model: string };
    expect(body.format).toBe('json');
    expect(body.model).toBe('llama3.2:3b');
  });

  test('returns tags from the closed taxonomy', async () => {
    const tags = await tagMessage('did anyone watch the new frieren episode');
    expect(tags).toEqual(['anime', 'joke-setup']);
  });

  test('drops tags that are not in the taxonomy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: '["anime","politics","made-up-tag"]' } })
      })
    );
    const tags = await tagMessage('something');
    expect(tags).toEqual(['anime']);
  });

  test('returns an empty array when the response is malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: 'not json' } })
      })
    );
    const tags = await tagMessage('whatever');
    expect(tags).toEqual([]);
  });

  test('caps at 3 tags even if the model returns more', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: '["anime","vtuber","meme","poe","gaming"]' } })
      })
    );
    const tags = await tagMessage('something');
    expect(tags).toHaveLength(3);
    expect(tags).toEqual(['anime', 'vtuber', 'meme']);
  });

  test('TAG_TAXONOMY contains the expected labels', () => {
    expect(TAG_TAXONOMY).toContain('anime');
    expect(TAG_TAXONOMY).toContain('vtuber');
    expect(TAG_TAXONOMY).toContain('poe');
    expect(TAG_TAXONOMY).toContain('joke-setup');
    expect(TAG_TAXONOMY).toContain('serious');
  });
});

// Scenario: the envisioned behavior — tagger produces clean, usable metadata
// for Chroma filters.
describe('envisioned behavior: tags are always valid taxonomy entries', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: '["poe","gaming","rant","extra-nonsense"]' }
        })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('a pro poe rant message gets poe/gaming/rant tags; the bogus tag is dropped', async () => {
    const tags = await tagMessage('i swear to god if i see one more sanctum map this league');
    expect(tags).toContain('poe');
    expect(tags).toContain('gaming');
    expect(tags).toContain('rant');
    expect(tags).not.toContain('extra-nonsense');
  });
});
