# Botge Phase 2 — Evaluation & Memory Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three infrastructure pieces that unblock every later phase: a topic tagger on message ingest (B7), a structured reply log (B19), and an offline replay harness (B17). Plus a prerequisite cleanup: a shared Ollama embedding helper that Phase 1 left duplicated.

**Architecture:** Three independent but composable modules. Topic tagger is a small-model classifier called on every ingested message; tags land in Chroma metadata. Reply log is a JSONL-append module called from the handler on every reply attempt with a full decision trace. Replay harness is a gated vitest test that loads a real chat window from Chroma and runs the full pipeline offline.

**Tech Stack:** TypeScript (ESM, `.ts` imports), Node 22+, Vitest, Ollama HTTP API (small model for tagging), Chroma HTTP API, sql.js-adjacent filesystem conventions.

---

## Reference

- Parent spec: `docs/superpowers/specs/2026-04-19-botge-humor-design.md` → section 6, **Phase 2**
- Depends on: Phase 1 complete (branch `phase-0-foundation-fixes`, tip `7d40edd`)
- Related code review item: Phase 1's code reviewer flagged `embed()` duplication across `src/api/recent-bot-output.ts` and `src/api/vector-store.ts` (issue I2). Task 1 resolves it.

## Testing conventions (applies to every test task)

- Location: `tests/<name>.test.ts`
- Header: `/** @format */`
- Imports from vitest: `describe, test, expect, vi, beforeEach, afterEach`
- Source imports use the `src/*` alias with `.ts` extension
- `tests/setup.ts` already stubs `DISCORD_TOKEN` globally — no per-file stub needed
- Run with: `npx vitest run`
- Every task includes a `describe('envisioned behavior: ...', ...)` scenario block
- Live-only tests (ones that need Ollama or Chroma running) are gated with `describe.runIf(process.env.RUN_LIVE === '1')` or a dedicated env flag

## Phase 2 file layout

```
src/
  api/
    ollama-embed.ts                              (NEW — shared embed helper)
    recent-bot-output.ts                         (modified — imports shared embed)
    vector-store.ts                              (modified — imports shared embed; adds tags to metadata)
    tagger.ts                                    (NEW — topic classifier)
    reply-log.ts                                 (NEW — JSONL append)
  message-create-handlers/
    ollama-message-create-handler.ts             (modified — calls tagger on ingest, writes reply log)
  paths-and-endpoints.ts                         (modified — add reply-log path constant)
  config.ts                                      (modified — add TAGGER_MODEL default)
tests/
  ollama-embed.test.ts                           (NEW)
  tagger.test.ts                                 (NEW)
  reply-log.test.ts                              (NEW)
  replay-harness.live.test.ts                    (NEW — gated)
  backfill-tags.live.test.ts                     (NEW — gated)
```

All changes scoped to Botge's LLM reply pipeline — consistent with the Phase 0/1 PR boundary. One in-scope edit to `paths-and-endpoints.ts` adds a single new endpoint constant; no existing behavior affected.

---

## Task 1: Extract shared `embed()` helper

**What:** Phase 1's code review flagged that `embed()` is duplicated verbatim between `src/api/recent-bot-output.ts` (lines ~18–28) and `src/api/vector-store.ts` (lines ~38–54). Both POST to the same Ollama endpoint with the same request shape and parse the same response. Extract into a shared module so later phases have one place to add retries, caching, or timeouts.

**Files:**
- Create: `src/api/ollama-embed.ts`
- Modify: `src/api/recent-bot-output.ts` (remove inline `embed`, import from new module)
- Modify: `src/api/vector-store.ts` (remove inline `embed`, import from new module)
- Create: `tests/ollama-embed.test.ts`

### Step 1.1: Write the failing test

Create `tests/ollama-embed.test.ts`:

```typescript
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
    // The module exports a single named function; importing it from a
    // different path should not affect behavior. This scenario is the
    // positive assertion behind the de-duplication refactor.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: [1, 0, 0] })
      })
    );

    const { embed: e1 } = await import('src/api/ollama-embed.ts');
    const { embed: e2 } = await import('src/api/ollama-embed.ts');

    // Same function reference across imports
    expect(e1).toBe(e2);

    const r = await e1('hello');
    expect(r).toEqual([1, 0, 0]);

    vi.unstubAllGlobals();
  });
});
```

### Step 1.2: Run test to verify it fails

Run: `npx vitest run tests/ollama-embed.test.ts`
Expected: FAIL — module does not exist.

### Step 1.3: Create the shared embed module

Create `src/api/ollama-embed.ts`:

```typescript
/** @format */

import { config } from '../config.ts';

type OllamaEmbeddingsResponse = {
  readonly embedding?: readonly number[];
};

/**
 * Embed a piece of text via the local Ollama embeddings endpoint.
 * Single source of truth for the request shape — both the vector store's
 * RAG retrieval and the reply editor's recent-output similarity check
 * use this helper.
 */
export async function embed(text: string): Promise<readonly number[]> {
  const { baseUrl, embeddingModel } = config.ollama;
  const res = await fetch(`${baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: embeddingModel, prompt: text })
  });
  if (!res.ok) throw new Error(`Ollama embeddings error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as OllamaEmbeddingsResponse;
  if (!data.embedding) throw new Error('Ollama returned no embedding. Is the model pulled?');
  return data.embedding;
}
```

### Step 1.4: Run test to verify it passes

Run: `npx vitest run tests/ollama-embed.test.ts`
Expected: PASS — all 5 tests green.

### Step 1.5: Remove duplicated `embed` from `recent-bot-output.ts`

Modify `src/api/recent-bot-output.ts`. Find the inline `embed` function (~lines 18–28) and its `OllamaEmbeddingsResponse` type (~lines 5–7). Both will be removed.

Replace:

```typescript
import { config } from '../config.ts';

type OllamaEmbeddingsResponse = {
  readonly embedding?: readonly number[];
};

type RecentEntry = {
  readonly text: string;
  readonly embedding: readonly number[];
};

const MAX_ENTRIES_PER_CHANNEL = 20;
const buffers = new Map<string, RecentEntry[]>();

async function embed(text: string): Promise<readonly number[]> {
  const { baseUrl, embeddingModel } = config.ollama;
  const res = await fetch(`${baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: embeddingModel, prompt: text })
  });
  if (!res.ok) throw new Error(`Ollama embeddings error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as OllamaEmbeddingsResponse;
  if (!data.embedding) throw new Error('Ollama returned no embedding.');
  return data.embedding;
}
```

With:

```typescript
import { embed } from './ollama-embed.ts';

type RecentEntry = {
  readonly text: string;
  readonly embedding: readonly number[];
};

const MAX_ENTRIES_PER_CHANNEL = 20;
const buffers = new Map<string, RecentEntry[]>();
```

The `config` import is no longer needed here (since `embed` now reads config internally). Verify no other code in the file still needs `config`; if so, keep the import.

### Step 1.6: Remove duplicated `embed` from `vector-store.ts`

Modify `src/api/vector-store.ts`. Find the inline `embed` function (~lines 38–54) and the `OllamaEmbeddingsResponse` type (~lines 20–22).

Replace:

```typescript
type OllamaEmbeddingsResponse = {
  readonly embedding?: readonly number[];
};
```
(delete this block)

And:

```typescript
/**
 * Generate a vector embedding for a piece of text using the local Ollama model.
 * Returns a float array representing the text's position in semantic space.
 */
async function embed(text: string): Promise<readonly number[]> {
  const { baseUrl, embeddingModel } = config.ollama;
  const res = await fetch(`${baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: embeddingModel,
      prompt: text
    })
  });
  if (!res.ok) throw new Error(`Ollama embeddings error ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as OllamaEmbeddingsResponse;
  if (!data.embedding) throw new Error('Ollama returned no embedding. Is the model pulled?');

  return data.embedding;
}
```
(delete this block)

Add near the other `import` statements at the top of the file:

```typescript
import { embed } from './ollama-embed.ts';
```

### Step 1.7: Verify, commit

Run: `npx vitest run && npm run build && npx prettier --check src/api/ollama-embed.ts src/api/recent-bot-output.ts src/api/vector-store.ts tests/ollama-embed.test.ts`
Expected: all clean. Full suite should be 68 + 5 new = **73 passed | 4 skipped**.

Commit:

```bash
git add src/api/ollama-embed.ts src/api/recent-bot-output.ts src/api/vector-store.ts tests/ollama-embed.test.ts
git commit -m "$(cat <<'EOF'
extract shared ollama embed helper to de-dup phase 1 duplication.

phase 1 code review flagged that embed() was duplicated verbatim across recent-bot-output.ts and vector-store.ts — both POST to /api/embeddings with identical shape. extracted to src/api/ollama-embed.ts; both callers now import from there. single source of truth for when we later add retries, caching, or timeouts on this hot path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Topic tagger module

**What:** A small-model classifier that labels each incoming message with up to 3 tags from a closed taxonomy. Tags will later (Task 3) be written into Chroma metadata for topic-filtered retrieval. Uses a separate `TAGGER_MODEL` config knob (default `llama3.2:3b`) — dedicated fast model, not the 27B generation model.

**Closed taxonomy (fixed for Phase 2):**
```
anime, vtuber, poe, gaming, meme, cat, tech, personal, rant,
joke-setup, link, question, serious, meta
```

**Files:**
- Modify: `src/config.ts` (add `TAGGER_MODEL` default)
- Create: `src/api/tagger.ts`
- Create: `tests/tagger.test.ts`

### Step 2.1: Add `TAGGER_MODEL` to config

Modify `src/config.ts`. Find the `Config` type's `ollama` field:

```typescript
  readonly ollama: { readonly baseUrl: string; readonly model: string; readonly embeddingModel: string };
```

Replace with:

```typescript
  readonly ollama: {
    readonly baseUrl: string;
    readonly model: string;
    readonly embeddingModel: string;
    readonly taggerModel: string;
  };
```

Find the `config.ollama` initializer:

```typescript
  ollama: {
    baseUrl: optional('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: optional('OLLAMA_MODEL', 'gemma3:27b'),
    // Embedding model is versioned separately from the chat model.
    // Changing this requires re-running: node backfill.js reset <channelId>
    embeddingModel: optional('EMBEDDING_MODEL', 'nomic-embed-text')
  },
```

Replace with:

```typescript
  ollama: {
    baseUrl: optional('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: optional('OLLAMA_MODEL', 'gemma3:27b'),
    // Embedding model is versioned separately from the chat model.
    // Changing this requires re-running: node backfill.js reset <channelId>
    embeddingModel: optional('EMBEDDING_MODEL', 'nomic-embed-text'),
    // Small fast model used for topic tagging on ingest. 3B is enough for
    // closed-taxonomy classification and keeps ingest latency low.
    taggerModel: optional('TAGGER_MODEL', 'llama3.2:3b')
  },
```

### Step 2.2: Write the failing test

Create `tests/tagger.test.ts`:

```typescript
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
```

### Step 2.3: Run test to verify it fails

Run: `npx vitest run tests/tagger.test.ts`
Expected: FAIL — module does not exist.

### Step 2.4: Create the tagger module

Create `src/api/tagger.ts`:

```typescript
/** @format */

import { config } from '../config.ts';

export const TAG_TAXONOMY: readonly string[] = [
  'anime',
  'vtuber',
  'poe',
  'gaming',
  'meme',
  'cat',
  'tech',
  'personal',
  'rant',
  'joke-setup',
  'link',
  'question',
  'serious',
  'meta'
] as const;

const MAX_TAGS = 3;

type OllamaChatResponse = {
  readonly message?: { readonly content?: string };
};

/**
 * Classify a single message with up to 3 tags from the closed taxonomy.
 * Uses Ollama's native JSON format for reliable parsing. Returns an empty
 * array on parse failure — tagging is best-effort, the ingest path must
 * not throw on a tagger hiccup.
 */
export async function tagMessage(text: string): Promise<readonly string[]> {
  const { baseUrl, taggerModel } = config.ollama;
  const systemPrompt = `You classify chat messages into up to 3 topic tags from a fixed list. Reply ONLY with a JSON array of strings.

Valid tags: ${TAG_TAXONOMY.join(', ')}.

Pick only tags that clearly apply. Fewer is fine. Never invent tags outside the list.`;

  const userPrompt = `Message: "${text}"\n\nReturn a JSON array of tags.`;

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: taggerModel,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    if (!res.ok) return [];
    const data = (await res.json()) as OllamaChatResponse;
    const raw = data.message?.content?.trim() ?? '';
    return parseTagArray(raw);
  } catch {
    return [];
  }
}

function parseTagArray(raw: string): readonly string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid = parsed
      .filter((t): t is string => typeof t === 'string')
      .filter((t) => TAG_TAXONOMY.includes(t));
    return valid.slice(0, MAX_TAGS);
  } catch {
    return [];
  }
}
```

### Step 2.5: Run tests

Run: `npx vitest run tests/tagger.test.ts`
Expected: PASS — all 7 tests green.

Run: `npx vitest run`
Expected: full suite passes. Count: 73 + 7 = **80 passed | 4 skipped**.

Run: `npm run build && npx prettier --check src/config.ts src/api/tagger.ts tests/tagger.test.ts`
Expected: clean.

### Step 2.6: Commit

```bash
git add src/config.ts src/api/tagger.ts tests/tagger.test.ts
git commit -m "$(cat <<'EOF'
add topic tagger module — closed-taxonomy message classifier.

new src/api/tagger.ts classifies each incoming message into up to 3 tags from a fixed list (anime, vtuber, poe, gaming, meme, cat, tech, personal, rant, joke-setup, link, question, serious, meta). uses a separate TAGGER_MODEL config (default llama3.2:3b) so ingest latency stays small. ollama format:'json' for reliable parsing; tags outside the taxonomy are dropped; failures return empty array (best-effort, never throws). the handler wires this into storeMessage in task 3 so tags land in chroma metadata for topic-filtered retrieval.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire tagger into message ingest

**What:** Every message that goes into Chroma (human + bot) now gets tagged. The tagger runs async in the same background-persist path as the embedding, so the reply critical path isn't slowed.

**Files:**
- Modify: `src/api/vector-store.ts` — extend `StoreMessageParams` to optionally accept `tags`; pass to Chroma metadata
- Modify: `src/message-create-handlers/ollama-message-create-handler.ts` — call `tagMessage` in the persist path
- Modify: `tests/tagger.test.ts` — no-op (task 2 tests cover tagger alone)
- No new test file — integration is covered by a scenario in the tagger test (checks the import graph compiles) and by the backfill test in Task 4

### Step 3.1: Extend `StoreMessageParams`

Modify `src/api/vector-store.ts`. Find the `StoreMessageParams` type (~lines 11–18):

```typescript
type StoreMessageParams = {
  readonly id: string;
  readonly author: string;
  readonly content: string;
  readonly channelId: string;
  readonly timestamp: number | Readonly<Date>;
  readonly seqNum?: number;
};
```

Replace with:

```typescript
type StoreMessageParams = {
  readonly id: string;
  readonly author: string;
  readonly content: string;
  readonly channelId: string;
  readonly timestamp: number | Readonly<Date>;
  readonly seqNum?: number;
  readonly tags?: readonly string[];
};
```

### Step 3.2: Pass `tags` into Chroma metadata

Find the `storeMessage` function's `upsert` call (~line 139). It currently looks like:

```typescript
  await collection.upsert({
    ids: [id],
    embeddings: [[...vector]],
    documents: [text],
    metadatas: [
      {
        author,
        channelId,
        seqNum: seq,
        timestamp: timestamp_ instanceof Date ? timestamp_.getTime() : timestamp_
      }
    ]
  });
```

Replace with:

```typescript
  const tagsString = storeMessageParams.tags !== undefined && storeMessageParams.tags.length > 0
    ? storeMessageParams.tags.join(',')
    : '';
  await collection.upsert({
    ids: [id],
    embeddings: [[...vector]],
    documents: [text],
    metadatas: [
      {
        author,
        channelId,
        seqNum: seq,
        timestamp: timestamp_ instanceof Date ? timestamp_.getTime() : timestamp_,
        tags: tagsString
      }
    ]
  });
```

Chroma metadata values must be primitives, so tags are stored as a comma-joined string. Empty string represents "no tags yet." Topic-filtered retrieval in later phases will use `$like` or contains-matching on this string.

### Step 3.3: Wire tagger into the handler's persist path

Modify `src/message-create-handlers/ollama-message-create-handler.ts`. Find the `persistToVectorStore` function (~lines 16–28):

```typescript
async function persistToVectorStore(message: OmitPartialGroupDMChannel<Message>, author: string): Promise<void> {
  try {
    await storeMessage({
      id: message.id,
      author,
      content: message.content,
      channelId: message.channel.id,
      timestamp: message.createdAt
    });
  } catch (error) {
    logError(error, 'Vector store write failed');
  }
}
```

Replace with:

```typescript
async function persistToVectorStore(message: OmitPartialGroupDMChannel<Message>, author: string): Promise<void> {
  try {
    const tags = await tagMessage(message.content).catch(() => [] as readonly string[]);
    await storeMessage({
      id: message.id,
      author,
      content: message.content,
      channelId: message.channel.id,
      timestamp: message.createdAt,
      tags
    });
  } catch (error) {
    logError(error, 'Vector store write failed');
  }
}
```

Add the import near the other `../api/` imports at the top:

```typescript
import { tagMessage } from '../api/tagger.ts';
```

Also update the bot's own-reply storeMessage call further down in the file (the one that uses `id: bot_${Date.now()}`). Find:

```typescript
    void storeMessage({
      id: `bot_${Date.now()}`,
      author: config.bot.name,
      content: reply,
      channelId,
      timestamp: new Date()
    });
```

Replace with:

```typescript
    void (async (): Promise<void> => {
      const botTags = await tagMessage(reply).catch(() => [] as readonly string[]);
      await storeMessage({
        id: `bot_${Date.now()}`,
        author: config.bot.name,
        content: reply,
        channelId,
        timestamp: new Date(),
        tags: botTags
      });
    })();
```

### Step 3.4: Verify

Run: `npx vitest run && npm run build && npx prettier --check src/api/vector-store.ts src/message-create-handlers/ollama-message-create-handler.ts`
Expected: all green. Test count unchanged (integration tests for tagger-ingest are covered by the existing tagger unit tests + Task 4's backfill scenario).

### Step 3.5: Commit

```bash
git add src/api/vector-store.ts src/message-create-handlers/ollama-message-create-handler.ts
git commit -m "$(cat <<'EOF'
wire topic tagger into message ingest.

every message persisted to chroma (human + bot) now gets topic tags from the taxonomy. tagger call lives in the async background persist path so the reply critical path isn't slowed. tags stored as comma-joined string in chroma metadata (chroma requires primitive values). tagger failures degrade gracefully to empty-tags — ingest never throws on a classifier hiccup.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Backfill script for existing Chroma entries

**What:** Chroma already has messages persisted from Phase 0/1 runs (if any). Task 3 only tags NEW messages — existing entries need a one-time backfill. Replaces the long-referenced-but-never-built `backfill.js` mentioned in `vector-store.ts` comments.

Since Node 22 can't run `.ts` scripts directly and `tsx`/`ts-node` aren't installed, the backfill is implemented as a live-mode vitest test (same pattern as `tests/try-samples.live.test.ts`). This means it:
- Goes in `tests/backfill-tags.live.test.ts`
- Gates on `RUN_BACKFILL=1` env var
- Is invoked with `RUN_BACKFILL=1 npx vitest run tests/backfill-tags.live.test.ts`
- Requires Chroma running at `$CHROMA_URL` and Ollama with the configured tagger model pulled

**Files:**
- Create: `tests/backfill-tags.live.test.ts`

### Step 4.1: Write the backfill test/script

Create `tests/backfill-tags.live.test.ts`:

```typescript
/** @format */

import { describe, test, expect } from 'vitest';

// Live backfill of topic tags for existing Chroma entries.
//
// Runs against a real Chroma + Ollama. Walks every message in the collection
// that has no `tags` metadata (or empty tags) and tags it using the configured
// TAGGER_MODEL. Idempotent — re-running after completion is a no-op.
//
// Usage:
//   RUN_BACKFILL=1 npx vitest run tests/backfill-tags.live.test.ts --reporter=verbose
//
// Requirements:
//   - Chroma running at $CHROMA_URL (default http://chromadb:8000)
//   - Ollama running with $TAGGER_MODEL pulled (default llama3.2:3b)

describe.runIf(process.env.RUN_BACKFILL === '1')('backfill topic tags for existing chroma entries', () => {
  test(
    'walk the collection, tag any entry without tags, upsert in place',
    async () => {
      const { getCollectionForTesting } = await import('src/api/vector-store.ts');
      const { tagMessage } = await import('src/api/tagger.ts');

      const collection = await getCollectionForTesting();
      const total = await collection.count();
      console.log(`Total entries in collection: ${total}`);

      if (total === 0) {
        console.log('Collection is empty — nothing to backfill.');
        return;
      }

      const batchSize = 50;
      let offset = 0;
      let tagged = 0;
      let skipped = 0;

      while (offset < total) {
        const batch = await collection.get({
          limit: batchSize,
          offset,
          include: ['documents', 'metadatas', 'embeddings']
        });

        for (let i = 0; i < batch.ids.length; i++) {
          const id = batch.ids[i];
          const doc = batch.documents[i];
          const meta = batch.metadatas[i];
          const existingTags = (meta?.['tags'] as string | undefined) ?? '';

          if (existingTags.length > 0) {
            skipped++;
            continue;
          }

          if (doc === null) {
            skipped++;
            continue;
          }

          // doc is formatted "author: content" — tagger sees the content half
          const content = doc.includes(': ') ? doc.slice(doc.indexOf(': ') + 2) : doc;
          const tags = await tagMessage(content);
          const tagsString = tags.length > 0 ? tags.join(',') : '';

          await collection.upsert({
            ids: [id],
            metadatas: [{ ...meta, tags: tagsString }]
          });

          tagged++;
          if (tagged % 10 === 0) console.log(`Tagged ${tagged} / ${total - skipped} remaining...`);
        }

        offset += batchSize;
      }

      console.log(`Backfill complete: ${tagged} tagged, ${skipped} already-tagged or empty-doc, ${total} total.`);
      expect(tagged + skipped).toBe(total);
    },
    600_000 // 10 minute timeout for long runs
  );
});
```

### Step 4.2: Verify the gated test doesn't run in the deterministic suite

Run: `npx vitest run`
Expected: suite passes as before. The new file is in `vitest`'s test list but all tests within it are `runIf`-skipped unless `RUN_BACKFILL=1`.

Run: `npx prettier --check tests/backfill-tags.live.test.ts`
Expected: clean.

### Step 4.3: Commit

```bash
git add tests/backfill-tags.live.test.ts
git commit -m "$(cat <<'EOF'
add gated backfill harness for topic tags on existing chroma entries.

one-time-ish script (gated by RUN_BACKFILL=1) that walks the collection, tags any entry without existing tags, and upserts metadata in place. replaces the long-referenced-but-never-built backfill.js mentioned in vector-store.ts comments. idempotent — re-running is a no-op. implemented as a vitest test because node 22 on the dev box can't run .ts scripts directly and tsx isn't installed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Reply log module

**What:** JSONL append module that records every reply attempt with a full decision trace. Schema matches the parent spec section 7. Self-contained — callers pass a fully-formed entry; the module handles the filesystem.

**Files:**
- Modify: `src/paths-and-endpoints.ts` (add `replyLog` path constant)
- Create: `src/api/reply-log.ts`
- Create: `tests/reply-log.test.ts`

### Step 5.1: Add the reply log path constant

Modify `src/paths-and-endpoints.ts`. Find the `DATABASE_ENDPOINTS` constant (~lines 11–29):

```typescript
export const DATABASE_ENDPOINTS: {
  readonly addedEmotes: 'data/addedEmotes.sqlite';
  readonly pings: 'data/pings.sqlite';
  readonly permitRoleIds: 'data/permitRoleIds.sqlite';
  readonly broadcasterNameAndPersonalEmoteSets: 'data/broadcasterNameAndPersonalEmoteSets.sqlite';
  readonly users: 'data/users.sqlite';
  readonly media: 'data/media.sqlite';
  readonly quote: 'data/quote.sqlite';
  readonly seqFile: 'data/seqNums.json';
} = {
  addedEmotes: `${DATABASE_DIR}/addedEmotes.sqlite`,
  pings: `${DATABASE_DIR}/pings.sqlite`,
  permitRoleIds: `${DATABASE_DIR}/permitRoleIds.sqlite`,
  broadcasterNameAndPersonalEmoteSets: `${DATABASE_DIR}/broadcasterNameAndPersonalEmoteSets.sqlite`,
  users: `${DATABASE_DIR}/users.sqlite`,
  media: `${DATABASE_DIR}/media.sqlite`,
  quote: `${DATABASE_DIR}/quote.sqlite`,
  seqFile: `${DATABASE_DIR}/seqNums.json`
} as const;
```

Replace with:

```typescript
export const DATABASE_ENDPOINTS: {
  readonly addedEmotes: 'data/addedEmotes.sqlite';
  readonly pings: 'data/pings.sqlite';
  readonly permitRoleIds: 'data/permitRoleIds.sqlite';
  readonly broadcasterNameAndPersonalEmoteSets: 'data/broadcasterNameAndPersonalEmoteSets.sqlite';
  readonly users: 'data/users.sqlite';
  readonly media: 'data/media.sqlite';
  readonly quote: 'data/quote.sqlite';
  readonly seqFile: 'data/seqNums.json';
  readonly replyLog: 'data/reply-log.jsonl';
} = {
  addedEmotes: `${DATABASE_DIR}/addedEmotes.sqlite`,
  pings: `${DATABASE_DIR}/pings.sqlite`,
  permitRoleIds: `${DATABASE_DIR}/permitRoleIds.sqlite`,
  broadcasterNameAndPersonalEmoteSets: `${DATABASE_DIR}/broadcasterNameAndPersonalEmoteSets.sqlite`,
  users: `${DATABASE_DIR}/users.sqlite`,
  media: `${DATABASE_DIR}/media.sqlite`,
  quote: `${DATABASE_DIR}/quote.sqlite`,
  seqFile: `${DATABASE_DIR}/seqNums.json`,
  replyLog: `${DATABASE_DIR}/reply-log.jsonl`
} as const;
```

### Step 5.2: Write the failing test

Create `tests/reply-log.test.ts`:

```typescript
/** @format */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendReplyLogEntry, type ReplyLogEntry } from 'src/api/reply-log.ts';

describe('appendReplyLogEntry', () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'botge-reply-log-test-'));
    logPath = join(tempDir, 'reply-log.jsonl');
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  test('creates the file if it does not exist and appends one JSON line', () => {
    const entry: ReplyLogEntry = {
      timestamp: '2026-04-19T10:00:00.000Z',
      channelId: 'ch-1',
      triggerMessageId: 'msg-1',
      scout: { topic: 'meta', moment_type: 'question', persona: 'sincere', should_reply: true, score: 8, reason: 'x' },
      retrieved_context_ids: [],
      candidates: [{ source: 'generateReply', text: 'sample' }],
      director_pick: { text: 'sample', reasoning: 'only option' },
      editor_decisions: ['passed'],
      final_reply: 'sample',
      reply_message_id: 'bot-msg-1',
      post_reactions: [],
      promoted: false
    };

    appendReplyLogEntry(entry, logPath);
    const content = readFileSync(logPath, 'utf8');
    expect(content.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(content.trim()) as ReplyLogEntry;
    expect(parsed.triggerMessageId).toBe('msg-1');
    expect(parsed.final_reply).toBe('sample');
  });

  test('appends successive entries as separate JSON lines', () => {
    const baseEntry: ReplyLogEntry = {
      timestamp: '2026-04-19T10:00:00.000Z',
      channelId: 'ch-1',
      triggerMessageId: 'm1',
      scout: { topic: 'meta', moment_type: 'q', persona: 'sincere', should_reply: true, score: 8, reason: 'x' },
      retrieved_context_ids: [],
      candidates: [],
      director_pick: { text: 'a', reasoning: 'x' },
      editor_decisions: [],
      final_reply: 'a',
      reply_message_id: 'b1',
      post_reactions: [],
      promoted: false
    };

    appendReplyLogEntry({ ...baseEntry, triggerMessageId: 'm1' }, logPath);
    appendReplyLogEntry({ ...baseEntry, triggerMessageId: 'm2' }, logPath);
    appendReplyLogEntry({ ...baseEntry, triggerMessageId: 'm3' }, logPath);

    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    expect((JSON.parse(lines[0]) as ReplyLogEntry).triggerMessageId).toBe('m1');
    expect((JSON.parse(lines[2]) as ReplyLogEntry).triggerMessageId).toBe('m3');
  });

  test('creates the parent directory if missing', () => {
    const nested = join(tempDir, 'nested', 'dir', 'reply-log.jsonl');
    const entry: ReplyLogEntry = {
      timestamp: '2026-04-19T10:00:00.000Z',
      channelId: 'ch-1',
      triggerMessageId: 'm',
      scout: { topic: 'meta', moment_type: 'q', persona: 'sincere', should_reply: true, score: 8, reason: 'x' },
      retrieved_context_ids: [],
      candidates: [],
      director_pick: { text: 'a', reasoning: 'x' },
      editor_decisions: [],
      final_reply: 'a',
      reply_message_id: 'b',
      post_reactions: [],
      promoted: false
    };

    appendReplyLogEntry(entry, nested);
    expect(existsSync(nested)).toBe(true);
  });
});

// Scenario: the envisioned behavior — reply log accumulates a usable
// decision trace over a session.
describe('envisioned behavior: reply log accumulates decision traces usefully', () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'botge-reply-log-scenario-'));
    logPath = join(tempDir, 'log.jsonl');
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  test('after 5 reply attempts (some sent, some silenced) the log reflects the sequence', () => {
    const mk = (triggerId: string, finalReply: string | null): ReplyLogEntry => ({
      timestamp: new Date().toISOString(),
      channelId: 'general',
      triggerMessageId: triggerId,
      scout: { topic: 'meta', moment_type: 'joke-setup', persona: 'roaster', should_reply: true, score: 8, reason: 'x' },
      retrieved_context_ids: [],
      candidates: [{ source: 'generateReply', text: finalReply ?? 'rejected' }],
      director_pick: { text: finalReply ?? 'rejected', reasoning: 'x' },
      editor_decisions: finalReply === null ? ['rejected: too similar'] : ['passed'],
      final_reply: finalReply,
      reply_message_id: finalReply === null ? null : `bot-${triggerId}`,
      post_reactions: [],
      promoted: false
    });

    appendReplyLogEntry(mk('m1', 'landed one'), logPath);
    appendReplyLogEntry(mk('m2', null), logPath); // silenced by editor
    appendReplyLogEntry(mk('m3', 'landed two'), logPath);
    appendReplyLogEntry(mk('m4', null), logPath);
    appendReplyLogEntry(mk('m5', 'landed three'), logPath);

    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(5);

    const entries = lines.map((l) => JSON.parse(l) as ReplyLogEntry);
    const silenced = entries.filter((e) => e.final_reply === null);
    const sent = entries.filter((e) => e.final_reply !== null);
    expect(silenced).toHaveLength(2);
    expect(sent).toHaveLength(3);
    expect(sent.map((e) => e.final_reply)).toEqual(['landed one', 'landed two', 'landed three']);
  });
});
```

### Step 5.3: Run test to verify it fails

Run: `npx vitest run tests/reply-log.test.ts`
Expected: FAIL — module does not exist.

### Step 5.4: Create the reply log module

Create `src/api/reply-log.ts`:

```typescript
/** @format */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { DATABASE_ENDPOINTS } from '../paths-and-endpoints.ts';

export type ReplyLogScout = {
  readonly topic: string;
  readonly moment_type: string;
  readonly persona: string;
  readonly specialists?: readonly string[];
  readonly should_reply: boolean;
  readonly score: number;
  readonly reason: string;
};

export type ReplyLogCandidate = {
  readonly source: string;
  readonly text: string;
};

export type ReplyLogDirectorPick = {
  readonly text: string;
  readonly reasoning: string;
};

export type ReplyLogReaction = {
  readonly emoji: string;
  readonly userId: string;
  readonly timestamp: string;
};

export type ReplyLogEntry = {
  readonly timestamp: string;
  readonly channelId: string;
  readonly triggerMessageId: string;
  readonly scout: ReplyLogScout;
  readonly retrieved_context_ids: readonly string[];
  readonly candidates: readonly ReplyLogCandidate[];
  readonly director_pick: ReplyLogDirectorPick;
  readonly editor_decisions: readonly string[];
  readonly final_reply: string | null;
  readonly reply_message_id: string | null;
  readonly post_reactions: readonly ReplyLogReaction[];
  readonly promoted: boolean;
};

const DEFAULT_PATH = DATABASE_ENDPOINTS.replyLog;

/**
 * Append a single reply log entry as one JSONL line. Creates the parent
 * directory if it does not exist. Synchronous so the caller does not
 * need to await — entries are small and the filesystem append is fast.
 */
export function appendReplyLogEntry(entry: ReplyLogEntry, path: string = DEFAULT_PATH): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8');
}
```

### Step 5.5: Run tests

Run: `npx vitest run tests/reply-log.test.ts`
Expected: PASS — all 4 tests green (3 unit + 1 scenario).

Run: `npx vitest run`
Expected: full suite green. Count: 80 + 4 = **84 passed | 4 skipped** (backfill test from Task 4 is gated).

Run: `npm run build && npx prettier --check src/paths-and-endpoints.ts src/api/reply-log.ts tests/reply-log.test.ts`
Expected: clean.

### Step 5.6: Commit

```bash
git add src/paths-and-endpoints.ts src/api/reply-log.ts tests/reply-log.test.ts
git commit -m "$(cat <<'EOF'
add reply log module — jsonl append with full decision trace schema.

new src/api/reply-log.ts exposes appendReplyLogEntry(entry, path?). schema matches parent spec section 7: timestamp, channelId, trigger, scout (topic/moment/persona/score/reason), retrieved context ids, candidates, director pick, editor decisions, final reply or null, post reactions, promoted flag. paths-and-endpoints.ts adds the replyLog constant to DATABASE_ENDPOINTS to stay consistent with existing persistence paths. synchronous append — entries are small, the hot path does not need to await.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire reply log into the handler

**What:** Every evaluation — whether it sends, stays silent, or is rejected by the editor — writes an entry to the reply log. Callers upstream (Phase 5 Scout, Phase 6 Mesh) will expand the trace; for now the entry reflects Phase 0+1 pipeline state.

**Files:**
- Modify: `src/message-create-handlers/ollama-message-create-handler.ts`

### Step 6.1: Add the import

Modify `src/message-create-handlers/ollama-message-create-handler.ts`. Add near the other `../api/` imports:

```typescript
import { appendReplyLogEntry, type ReplyLogEntry } from '../api/reply-log.ts';
```

### Step 6.2: Thread log entries through the pipeline

There are four decision points where the handler exits:
1. Score-gate failure (below threshold or scoring threw)
2. Editor rejected on first pass (regen attempted)
3. Editor rejected on second pass (silent stay-out)
4. Successful send

Each exit should append a log entry reflecting what happened. Rather than threading a partial object through the function, build the entry at each exit point using a small helper.

Add this helper right after the existing `retrieveContext` function (around line 40):

```typescript
function makeLogEntry(
  partial: Partial<ReplyLogEntry>,
  triggerMessageId: string,
  channelId: string
): ReplyLogEntry {
  return {
    timestamp: new Date().toISOString(),
    channelId,
    triggerMessageId,
    scout: {
      topic: 'unknown',
      moment_type: 'unknown',
      persona: 'default',
      should_reply: false,
      score: 0,
      reason: ''
    },
    retrieved_context_ids: [],
    candidates: [],
    director_pick: { text: '', reasoning: '' },
    editor_decisions: [],
    final_reply: null,
    reply_message_id: null,
    post_reactions: [],
    promoted: false,
    ...partial
  };
}
```

This fills in empty defaults that Phase 5+ will replace as the pipeline grows; for now the only populated fields reflect what the Phase 0/1 handler actually knows.

### Step 6.3: Write log entries at each exit point

Find each of the four exit points in the handler and append the entry before `return`.

**Exit 1 — score-gate failure.** Find:

```typescript
  if (!shouldReply) return;
```

Replace with:

```typescript
  if (!shouldReply) {
    appendReplyLogEntry(
      makeLogEntry(
        {
          scout: {
            topic: 'unknown',
            moment_type: 'unknown',
            persona: 'default',
            should_reply: false,
            score: 0,
            reason: 'gate failed'
          },
          editor_decisions: ['gate: score below threshold']
        },
        message.id,
        channelId
      )
    );
    return;
  }
```

**Exit 2 — editor rejected regen.** Find:

```typescript
    if (!edited.accepted) {
      console.log(`🧹 Editor rejected regen too: ${edited.reason}. Staying silent.`);
      return;
    }
```

Replace with:

```typescript
    if (!edited.accepted) {
      console.log(`🧹 Editor rejected regen too: ${edited.reason}. Staying silent.`);
      appendReplyLogEntry(
        makeLogEntry(
          {
            candidates: [
              { source: 'generateReply', text: rawReply },
              { source: 'generateReply:regen', text: '' }
            ],
            editor_decisions: [`rejected: ${edited.reason}`]
          },
          message.id,
          channelId
        )
      );
      return;
    }
```

**Exit 3 — regen threw.** Find:

```typescript
    } catch (error) {
      logError(error, 'Regeneration failed:');
      return;
    }
```

Replace with:

```typescript
    } catch (error) {
      logError(error, 'Regeneration failed:');
      appendReplyLogEntry(
        makeLogEntry(
          {
            candidates: [{ source: 'generateReply', text: rawReply }],
            editor_decisions: ['regen-threw']
          },
          message.id,
          channelId
        )
      );
      return;
    }
```

**Exit 4 — successful send.** Find the block that writes `console.log(`✅ Sent: ...`)` and wrap it:

```typescript
    console.log(`✅ Sent: "${reply}"`);
```

Replace with:

```typescript
    console.log(`✅ Sent: "${reply}"`);
    appendReplyLogEntry(
      makeLogEntry(
        {
          candidates: [{ source: 'generateReply', text: reply }],
          director_pick: { text: reply, reasoning: 'only candidate (phase 0/1 handler)' },
          editor_decisions: ['passed'],
          final_reply: reply,
          reply_message_id: null // discord message id not propagated here; phase 5+ can capture it
        },
        message.id,
        channelId
      )
    );
```

### Step 6.4: Verify

Run: `npx vitest run && npm run build && npx prettier --check src/message-create-handlers/ollama-message-create-handler.ts`
Expected: all green. Test count unchanged at 84/4.

### Step 6.5: Commit

```bash
git add src/message-create-handlers/ollama-message-create-handler.ts
git commit -m "$(cat <<'EOF'
wire reply log entries into every handler exit point.

four exit points now append to the jsonl log: score-gate failure, editor-rejected-regen, regen-threw, and successful send. each entry captures what the phase 0/1 handler actually knew (score, editor decisions, final reply or null). phase 5+ will expand the scout/director fields as the pipeline grows — the log schema has placeholders for those now so downstream tooling sees stable keys.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Replay harness

**What:** Gated vitest test that loads a real chat window from Chroma ending at a given message, runs the current pipeline (generate + editor) against that context, and prints what Botge would have said. This is the tool that unblocks every future prompt tweak — you can compare prompt versions against the same historical window.

**Files:**
- Create: `tests/replay-harness.live.test.ts`

### Step 7.1: Write the harness

Create `tests/replay-harness.live.test.ts`:

```typescript
/** @format */

import { describe, test } from 'vitest';

// Offline replay harness — loads a real chat window from Chroma ending at a
// specified trigger message, runs the full Phase 1 pipeline offline, and
// prints what Botge would have said. Gated by RUN_REPLAY=1 so it does not
// run in the deterministic suite.
//
// Usage:
//   RUN_REPLAY=1 REPLAY_CHANNEL=<channelId> REPLAY_MESSAGE_ID=<msgId> npx vitest run tests/replay-harness.live.test.ts --reporter=verbose
//
// Window: the 30 messages immediately preceding (and including) REPLAY_MESSAGE_ID, ordered by seqNum.
//
// Requirements:
//   - Chroma running at $CHROMA_URL, populated by prior ingest
//   - Ollama running with $OLLAMA_MODEL pulled (defaults to gemma3:27b)

describe.runIf(process.env.RUN_REPLAY === '1')('botge offline replay', () => {
  test(
    'replay the window ending at REPLAY_MESSAGE_ID and print the reply it would have made',
    async () => {
      const channelId = process.env.REPLAY_CHANNEL;
      const messageId = process.env.REPLAY_MESSAGE_ID;
      if (channelId === undefined || messageId === undefined) {
        console.error('Set REPLAY_CHANNEL and REPLAY_MESSAGE_ID env vars.');
        throw new Error('missing env vars');
      }

      const { getCollectionForTesting, findSimilarWithContext } = await import('src/api/vector-store.ts');
      const { generateReply } = await import('src/api/ollama.ts');
      const { applyReplyEditor } = await import('src/api/reply-editor.ts');
      const { narrowRagQuery } = await import('src/message-create-handlers/ollama-rag-query.ts');
      const { config } = await import('src/config.ts');

      const collection = await getCollectionForTesting();

      // 1. Find the trigger message's seqNum to anchor the window.
      const anchor = await collection.get({ ids: [messageId], include: ['metadatas'] });
      const anchorMeta = anchor.metadatas?.[0];
      if (anchorMeta === null || anchorMeta === undefined) {
        console.error(`Trigger message ${messageId} not found in collection.`);
        throw new Error('trigger not found');
      }
      const anchorSeq = anchorMeta['seqNum'] as number;
      const windowSize = 30;
      const loSeq = Math.max(1, anchorSeq - windowSize + 1);

      // 2. Fetch the 30-message window by seqNum range.
      const windowResult = await collection.get({
        where: {
          $and: [
            { channelId: { $eq: channelId } },
            { seqNum: { $gte: loSeq } },
            { seqNum: { $lte: anchorSeq } }
          ]
        },
        include: ['documents', 'metadatas']
      });

      const paired = windowResult.documents
        .map((doc: string | null, i: number) => ({
          doc,
          seq: (windowResult.metadatas[i]?.['seqNum'] as number | undefined) ?? 0
        }))
        .filter((p: { doc: string | null; seq: number }) => p.doc !== null)
        .sort(
          (a: { doc: string | null; seq: number }, b: { doc: string | null; seq: number }) => a.seq - b.seq
        );

      const recentHistory = paired.map((p: { doc: string | null; seq: number }) => p.doc).join('\n');

      console.log('\n══════════════════════════════════════════════════════════');
      console.log(`REPLAY: channel=${channelId} trigger=${messageId} window=${paired.length} msgs`);
      console.log('──────────────────────────────────────────────────────────');
      console.log('history (seqNum order):');
      console.log(recentHistory);
      console.log('──────────────────────────────────────────────────────────');

      // 3. Retrieve RAG context using the same narrowing as production.
      const retrieved = await findSimilarWithContext(
        narrowRagQuery(recentHistory, { excludeAuthor: config.bot.name, limit: 6 }),
        channelId,
        config.behavior.ragResults,
        config.behavior.ragWindowSize
      );
      console.log(`retrieved ${retrieved.length} RAG blocks`);

      // 4. Generate.
      const rawReply = await generateReply(recentHistory, retrieved);
      console.log(`rawReply: ${rawReply}`);

      // 5. Edit.
      const edited = await applyReplyEditor(rawReply, channelId);
      if (edited.accepted) {
        console.log(`FINAL: ${edited.text}`);
      } else {
        console.log(`EDITOR REJECTED: ${edited.reason}`);
      }
      console.log('');
    },
    180_000
  );
});
```

### Step 7.2: Verify the gated test doesn't run in the deterministic suite

Run: `npx vitest run`
Expected: suite still green. Replay test is `runIf`-skipped without `RUN_REPLAY=1`.

Run: `npx prettier --check tests/replay-harness.live.test.ts`
Expected: clean.

### Step 7.3: Commit

```bash
git add tests/replay-harness.live.test.ts
git commit -m "$(cat <<'EOF'
add offline replay harness for past chat windows.

gated vitest test (RUN_REPLAY=1) that loads a 30-message window ending at a specified chroma message id, runs the full phase 1 pipeline (narrowed rag query, retrieval, generation, editor) offline, and prints the reply it would have made. unblocks prompt tuning — you can now compare prompt versions against the same historical window instead of live-chat sampling.

requires chroma populated from prior ingest. invoked with REPLAY_CHANNEL + REPLAY_MESSAGE_ID env vars.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Phase 2 verification pass

**What:** Final sweep. Run the full suite + build + prettier across every file touched in Phase 2. Confirm the gated live tests still skip correctly.

**Files:** No source changes. Verification only.

- [ ] **Step 8.1: Full deterministic suite**

Run: `npx vitest run`
Expected: all tests pass. Should be ~84 passing / 6 skipped (4 from Phase 1 + 2 new gated: backfill + replay).

- [ ] **Step 8.2: Full build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 8.3: Prettier check across Phase 2 touched files**

Run: `npx prettier --check src/api/ollama-embed.ts src/api/tagger.ts src/api/reply-log.ts src/api/recent-bot-output.ts src/api/vector-store.ts src/paths-and-endpoints.ts src/config.ts src/message-create-handlers/ollama-message-create-handler.ts tests/ollama-embed.test.ts tests/tagger.test.ts tests/reply-log.test.ts tests/backfill-tags.live.test.ts tests/replay-harness.live.test.ts`
Expected: clean.

- [ ] **Step 8.4: Confirm gated tests skip**

Run: `npx vitest run tests/backfill-tags.live.test.ts tests/replay-harness.live.test.ts tests/try-samples.live.test.ts`
Expected: the suite reports tests as skipped since no `RUN_BACKFILL`, `RUN_REPLAY`, or `RUN_LIVE` is set.

- [ ] **Step 8.5: Optional — end-to-end live smoke with the new infra**

If Ollama + Chroma are running and a tagger model is pulled, exercise the full stack:

1. Pull the tagger model if not already: `! ollama pull llama3.2:3b`
2. Run the tag backfill on the existing collection: `! RUN_BACKFILL=1 npx vitest run tests/backfill-tags.live.test.ts --reporter=verbose`
3. If there's a known message in Chroma, run the replay harness on it: `! RUN_REPLAY=1 REPLAY_CHANNEL=<channelId> REPLAY_MESSAGE_ID=<msgId> npx vitest run tests/replay-harness.live.test.ts --reporter=verbose`
4. Send a test message to the bot in the configured channel; after a minute, `cat data/reply-log.jsonl | tail -1` should show the new entry with the `tags` populated in the scout field placeholder (stays `unknown` until Phase 5's real Scout lands; the editor_decisions and final_reply reflect what happened).

- [ ] **Step 8.6: Phase 2 exit checklist**

1. ✅ Shared embed helper extracted, both prior callers import from it (Task 1)
2. ✅ Topic tagger module + taxonomy (Task 2)
3. ✅ Tagger wired into message ingest, tags land in Chroma metadata (Task 3)
4. ✅ Backfill harness for existing Chroma entries (Task 4)
5. ✅ Reply log module with spec-matching schema (Task 5)
6. ✅ Reply log wired into every handler exit point (Task 6)
7. ✅ Replay harness loads real windows from Chroma and runs the pipeline offline (Task 7)

Phase 2 complete.

---

## Self-review notes

**Spec coverage (parent spec section 6 — Phase 2):**
- B7 Topic tagger on ingest → Task 2 + Task 3 ✓
- B7 Backfill script for existing messages → Task 4 ✓
- B19 Structured reply log → Task 5 + Task 6 ✓
- B17 Offline replay harness → Task 7 ✓
- (Code review follow-up from Phase 1: shared embed helper) → Task 1 ✓

All Phase 2 items covered.

**Placeholders:** none. Every step has exact code, exact commands, or specific short actions. The two "live" tests contain complete bodies (not stubs).

**Type consistency:**
- `StoreMessageParams` adds optional `tags: readonly string[]` in Task 3; Task 4's backfill reads from the metadata `tags` string field (comma-joined) and Task 6's reply log keeps its own `scout.specialists` etc., independent.
- `ReplyLogEntry` schema consistent across the module definition (5.4), its tests (5.2), and its usage in the handler (6.3). `makeLogEntry` always returns the same shape.
- `embed()` signature unchanged from Phase 1 — same `(text: string) => Promise<readonly number[]>`, just relocated.

**Scope constraint:** All Phase 2 changes touch Botge's LLM reply pipeline or adjacent infrastructure. The one in-scope-adjacent edit (adding `replyLog` to `DATABASE_ENDPOINTS`) is additive — no existing behavior changes. Consistent with the Phase 0/1 PR boundary.

**Execution notes for the engineer:**
- Phase 1 must be merged or stacked before Phase 2 runs (depends on `applyReplyEditor` from P1.5 and `narrowRagQuery` from P1.2).
- Task 3's integration-test coverage is indirect (via tagger unit tests + Task 4's backfill). If live bugs surface during Task 8's optional smoke, add a dedicated integration test.
- Live harness in Task 7 needs a real message id from Chroma — if your Chroma is empty, the replay can only run after the bot has ingested messages from the configured channel.
- The tagger adds a small fixed cost to ingest latency (one extra Ollama call per message). With `llama3.2:3b` this is ~200–500 ms. If ingest becomes a bottleneck, the tagger can be moved to a background queue in a later phase.
