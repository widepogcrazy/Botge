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
