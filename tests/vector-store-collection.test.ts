/** @format */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// We need to control what ChromaClient.getOrCreateCollection does to assert caching.
vi.mock('chromadb', () => {
  const getOrCreateCollection = vi.fn().mockResolvedValue({ id: 'test-collection' });
  class ChromaClient {
    getOrCreateCollection = getOrCreateCollection;
  }
  return {
    ChromaClient: vi.fn(ChromaClient)
  };
});

describe('getCollection caching', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('getCollection returns the same promise on repeated calls', async () => {
    const { getCollectionForTesting } = await import('src/api/vector-store.ts');
    const first = getCollectionForTesting();
    const second = getCollectionForTesting();
    expect(first).toBe(second);
    await Promise.all([first, second]);
  });

  test('ChromaClient.getOrCreateCollection is called exactly once across many getCollection calls', async () => {
    const { getCollectionForTesting } = await import('src/api/vector-store.ts');
    const chromadb = await import('chromadb');
    const ChromaClient = chromadb.ChromaClient as unknown as ReturnType<typeof vi.fn>;
    const instance = ChromaClient.mock.results.at(-1)?.value as { getOrCreateCollection: ReturnType<typeof vi.fn> };
    await Promise.all([getCollectionForTesting(), getCollectionForTesting(), getCollectionForTesting()]);
    expect(instance.getOrCreateCollection).toHaveBeenCalledTimes(1);
  });
});

// Scenario tests: demonstrate the fix achieves what we intended in the shape
// a real workload would exercise it.
describe('envisioned behavior: one Chroma collection handle shared by every caller', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('fifty interleaved store/query operations open the collection exactly once', async () => {
    // Bug before the fix: getCollection()'s cache variable was declared
    // inside the function, so every storeMessage / findSimilarWithContext
    // call paid a fresh round-trip to Chroma. Intended behavior: one
    // collection handle for the life of the process, shared by every caller.

    const { getCollectionForTesting } = await import('src/api/vector-store.ts');
    const chromadb = await import('chromadb');
    const ChromaClient = chromadb.ChromaClient as unknown as ReturnType<typeof vi.fn>;
    const instance = ChromaClient.mock.results.at(-1)?.value as {
      getOrCreateCollection: ReturnType<typeof vi.fn>;
    };

    // Simulate a realistic bursty workload — 50 concurrent read/write paths.
    const operations = Array.from({ length: 50 }, () => getCollectionForTesting());
    const results = await Promise.all(operations);

    // Every caller gets the same collection object back.
    for (const result of results) {
      expect(result).toBe(results[0]);
    }

    // And Chroma was contacted for the collection exactly once.
    expect(instance.getOrCreateCollection).toHaveBeenCalledTimes(1);
  });
});
