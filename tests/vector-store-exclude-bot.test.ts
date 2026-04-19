/** @format */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock chromadb to capture the where clause passed to collection.query.
vi.mock('chromadb', () => {
  const query = vi.fn().mockResolvedValue({ metadatas: [[]] });
  const count = vi.fn().mockResolvedValue(1);
  const get = vi.fn().mockResolvedValue({ documents: [], metadatas: [] });
  class ChromaClient {
    getOrCreateCollection = vi.fn().mockResolvedValue({ query, count, get });
  }
  return {
    ChromaClient: vi.fn(ChromaClient)
  };
});

const originalFetch = globalThis.fetch;

describe('findSimilarWithContext — bot exclusion in query where-clause', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [0.1, 0.2, 0.3] })
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('query where-clause excludes messages authored by the bot (Botge)', async () => {
    const { findSimilarWithContext } = await import('src/api/vector-store.ts');
    const chromadb = await import('chromadb');
    const ChromaClient = chromadb.ChromaClient as unknown as ReturnType<typeof vi.fn>;

    await findSimilarWithContext('hello there', 'channel-1', 5, 2);

    const clientInstance = ChromaClient.mock.results.at(-1)?.value as {
      getOrCreateCollection: ReturnType<typeof vi.fn>;
    };
    const collection = await clientInstance.getOrCreateCollection.mock.results[0].value;
    const queryFn = collection.query as ReturnType<typeof vi.fn>;
    expect(queryFn).toHaveBeenCalledOnce();

    const arg = queryFn.mock.calls[0][0] as { where: { $and: readonly unknown[] } };
    expect(arg.where).toHaveProperty('$and');
    const andClauses = arg.where.$and;
    const hasChannelFilter = andClauses.some((c) => JSON.stringify(c).includes('channelId'));
    const hasBotExclusion = andClauses.some(
      (c) => JSON.stringify(c).includes('author') && JSON.stringify(c).includes('$ne')
    );
    expect(hasChannelFilter).toBe(true);
    expect(hasBotExclusion).toBe(true);
  });
});

describe('envisioned behavior: Botge does not learn from its own past outputs', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [0.1, 0.2, 0.3] })
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('a RAG query explicitly demands author != configured bot name', async () => {
    const { findSimilarWithContext } = await import('src/api/vector-store.ts');
    const { config } = await import('src/config.ts');
    const chromadb = await import('chromadb');
    const ChromaClient = chromadb.ChromaClient as unknown as ReturnType<typeof vi.fn>;

    await findSimilarWithContext('whatever', 'channel-1', 5, 2);

    const clientInstance = ChromaClient.mock.results.at(-1)?.value as {
      getOrCreateCollection: ReturnType<typeof vi.fn>;
    };
    const collection = await clientInstance.getOrCreateCollection.mock.results[0].value;
    const queryFn = collection.query as ReturnType<typeof vi.fn>;

    const arg = queryFn.mock.calls[0][0] as { where: unknown };
    const serialized = JSON.stringify(arg.where);
    expect(serialized).toContain(config.bot.name);
    expect(serialized).toContain('$ne');
  });
});
