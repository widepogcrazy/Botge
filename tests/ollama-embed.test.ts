/** @format */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import { embed } from 'src/api/ollama-embed.ts';

describe('embed', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2, 0.3, 0.4] })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('POSTs to /api/embeddings with the configured embedding model', async () => {
    await embed('hello world');
    const mockedFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const [url, init] = mockedFetch.mock.calls[0];
    expect(url).toMatch(/\/api\/embeddings$/);
    const body = JSON.parse(init?.body as string) as { model: string; prompt: string };
    expect(body.prompt).toBe('hello world');
    expect(body.model.length).toBeGreaterThan(0);
  });

  test('returns the embedding array from the response', async () => {
    const result = await embed('any');
    expect(result).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  test('throws on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'server error'
      })
    );
    await expect(embed('x')).rejects.toThrow(/500/);
  });

  test('throws when response has no embedding field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({})
      })
    );
    await expect(embed('x')).rejects.toThrow(/no embedding/i);
  });
});

// Scenario: the envisioned behavior — a single embed call used everywhere.
describe('envisioned behavior: one embed helper, one source of truth', () => {
  test('the shared embed helper is reusable from any caller', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: [1, 0, 0] })
      })
    );

    const { embed: e1 } = await import('src/api/ollama-embed.ts');
    const { embed: e2 } = await import('src/api/ollama-embed.ts');

    expect(e1).toBe(e2);

    const r = await e1('hello');
    expect(r).toEqual([1, 0, 0]);

    vi.unstubAllGlobals();
  });
});
