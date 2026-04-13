/** @format */

import { ChromaClient, type Collection, type GetResult, type Metadata } from 'chromadb';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from '../config.ts';
import { embed } from '../utils/embeddings.js';

const chromaUrl = new URL(config.chroma.url);
const client: ChromaClient = new ChromaClient({
  ssl: chromaUrl.protocol === 'https:',
  host: chromaUrl.hostname,
  port: Number(chromaUrl.port) || (chromaUrl.protocol === 'https:' ? 443 : 80)
});

// ─── Collection naming ────────────────────────────────────────────────────────
//
// Each embedding model gets its own collection. This is critical because vectors
// from different models are incompatible — they live in different semantic spaces.
//
// Example:
//   nomic-embed-text       → messages_nomic-embed-text
//   mxbai-embed-large      → messages_mxbai-embed-large
//
// When you upgrade your embedding model, run: node backfill.js reset <channelId>
// This wipes the old collection and rebuilds it. The raw text is fetched from
// Discord history — nothing is lost.

function getCollectionName(): string {
  const model = config.ollama.embeddingModel;
  // ChromaDB rules: 3–63 chars, alphanumeric + hyphens/underscores,
  // must start and end with alphanumeric.
  const safe = model
    .replace(/[^a-zA-Z0-9_-]/g, '_') // sanitize special chars
    .replace(/[_-]+$/, ''); // strip trailing separators
  return `messages_${safe}`.slice(0, 63);
}

// Cached collection promise — avoids race conditions on concurrent first calls
let _collectionPromise: Promise<Collection> | null = null;

async function getCollection(): Promise<Collection> {
  _collectionPromise ??= client.getOrCreateCollection({
    name: getCollectionName(),
    metadata: { 'hnsw:space': 'cosine' } // cosine similarity for chat text
  });
  return _collectionPromise;
}

// ─── Per-channel sequence numbers ────────────────────────────────────────────
//
// Each message gets a monotonically increasing integer seqNum per channel.
// This is the key that makes contextual retrieval possible: once we find a
// relevant hit at seqNum N, we can fetch [N-k … N … N+k] to get surrounding
// messages, turning a single retrieved message into a full conversation snippet.
//
// Sequence numbers are persisted to disk so they survive restarts and stay
// consistent with what's already stored in ChromaDB.

const SEQ_FILE = '/app/data/seqNums.json';

type SeqNums = Record<string, number>;

function loadSeqNums(): SeqNums {
  if (!existsSync(SEQ_FILE)) return {};
  try {
    return JSON.parse(readFileSync(SEQ_FILE, 'utf8')) as SeqNums;
  } catch {
    return {};
  }
}

function saveSeqNums(seqNums: Readonly<SeqNums>): void {
  writeFileSync(SEQ_FILE, JSON.stringify(seqNums, null, 2));
}

// In-memory cache, synced to disk on every write
let seqNums: SeqNums = loadSeqNums();

function nextSeqNum(channelId: string): number {
  const next = (seqNums[channelId] ?? 0) + 1;
  seqNums[channelId] = next;
  saveSeqNums(seqNums);
  return next;
}

// ─── Public API ───────────────────────────────────────────────────────────────

type StoreMessageParams = {
  id: string;
  author: string;
  content: string;
  channelId: string;
  timestamp: Date | number;
  seqNum?: number;
};

/**
 * Store a message. Uses upsert so re-indexing is safe and idempotent.
 * Assigns a per-channel sequence number used for contextual window expansion.
 */
export async function storeMessage({
  id,
  author,
  content,
  channelId,
  timestamp,
  seqNum
}: Readonly<StoreMessageParams>): Promise<void> {
  const collection = await getCollection();
  const text = `${author}: ${content}`;
  const vector = await embed(text);
  const seq = seqNum ?? nextSeqNum(channelId);

  await collection.upsert({
    ids: [id],
    embeddings: [vector],
    documents: [text],
    metadatas: [
      {
        author,
        channelId,
        seqNum: seq,
        timestamp: timestamp instanceof Date ? timestamp.getTime() : timestamp
      }
    ]
  });
}

/**
 * Find past messages semantically similar to the query, then expand each hit
 * into a window of surrounding messages so the model gets full conversational
 * context rather than orphaned one-liners.
 *
 * Example with windowSize=2 and a hit at seqNum 42:
 *   Returns messages at seqNums [40, 41, 42, 43, 44], formatted as a block.
 *
 * Overlapping windows are merged automatically so the same messages aren't
 * repeated if two hits are close together.
 */
export async function findSimilarWithContext(
  queryText: string,
  channelId: string,
  nResults = 5,
  windowSize = 2
): Promise<string[]> {
  const collection = await getCollection();

  const total = await collection.count();
  if (total === 0) return [];

  // 1. Semantic search — find the most relevant individual messages
  const queryVector = await embed(queryText);
  const hits = await collection.query({
    queryEmbeddings: [queryVector],
    nResults: Math.min(nResults, total),
    where: { channelId }
  });

  const [hitMetadatas] = hits.metadatas;
  if (hitMetadatas.length === 0) return [];

  // 2. Expand each hit into a [seqNum-windowSize … seqNum+windowSize] range.
  //    Merge overlapping ranges so nearby hits don't produce duplicate messages.
  const ranges = hitMetadatas
    .map((m: Readonly<Metadata> | null) => ({
      lo: (m?.['seqNum'] as number) - windowSize,
      hi: (m?.['seqNum'] as number) + windowSize
    }))
    .sort((a: Readonly<{ lo: number; hi: number }>, b: Readonly<{ lo: number; hi: number }>) => a.lo - b.lo);

  const merged: { lo: number; hi: number }[] = [];
  for (const range of ranges) {
    const prev = merged.at(-1);
    if (prev !== undefined && range.lo <= prev.hi + 1) {
      // Overlapping or adjacent — extend the previous range
      prev.hi = Math.max(prev.hi, range.hi);
    } else {
      merged.push({ ...range });
    }
  }

  // 3. Fetch each merged range from ChromaDB using seqNum bounds.
  //    Run all range fetches concurrently.
  const windowFetches = merged.map(async ({ lo, hi }: Readonly<{ lo: number; hi: number }>) =>
    collection.get({
      where: {
        $and: [{ channelId: { $eq: channelId } }, { seqNum: { $gte: lo } }, { seqNum: { $lte: hi } }]
      },
      include: ['documents', 'metadatas']
    })
  );

  const windowResults = await Promise.all(windowFetches);

  // 4. Each range becomes one context block: messages sorted by seqNum,
  //    formatted as "Author: message" lines joined with newlines.
  const blocks = windowResults.map((result: Readonly<GetResult>) => {
    const pairs = result.documents
      .map((doc: string | null, i: number) => ({
        doc,
        seq: (result.metadatas[i]?.['seqNum'] as number | undefined) ?? 0
      }))
      .sort(
        (a: Readonly<{ doc: string | null; seq: number }>, b: Readonly<{ doc: string | null; seq: number }>) =>
          a.seq - b.seq
      );

    return pairs.map((p: Readonly<{ doc: string | null; seq: number }>) => p.doc).join('\n');
  });

  return blocks.filter(Boolean);
}

/**
 * Drop and recreate the current collection.
 * Use this when upgrading to a new embedding model:
 *   node backfill.js reset \{channelId\}
 */
export async function resetCollection(): Promise<void> {
  const name = getCollectionName();
  try {
    await client.deleteCollection({ name });
    console.log(`🗑️  Deleted collection: ${name}`);
  } catch {
    // Collection might not exist yet — that's fine
  }
  _collectionPromise = null;
  seqNums = {}; // reset in-memory sequence numbers
  saveSeqNums(seqNums);
  await getCollection(); // recreate fresh
  console.log(`✅ Created new collection: ${name}`);
}

/**
 * List all message collections that exist in ChromaDB.
 * Useful to audit what model versions have been indexed.
 */
export async function listCollections(): Promise<Awaited<ReturnType<ChromaClient['listCollections']>>> {
  const all = await client.listCollections();
  return all.filter((c: Readonly<Collection>) => c.name.startsWith('messages_'));
}

/**
 * The name of the active collection (for logging/debugging).
 */
export function activeCollectionName(): string {
  return getCollectionName();
}
