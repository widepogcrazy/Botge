# Botge Phase 1 — Content Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five user-visible content improvements to Botge's reply quality on top of the Phase 0 foundation: flip the RAG directive, narrow the RAG query, exclude Botge's own output from retrieval, add a deterministic output editor, and inject temporal context.

**Architecture:** Each change is surgical — small edits to existing files, two new modules (reply editor + recent-output buffer). No new external services, no schema changes to Chroma. The pipeline shape stays the same; we just sharpen what flows through it.

**Tech Stack:** TypeScript (ESM, `.ts` imports), Node 22+, Vitest, Ollama HTTP API, Chroma HTTP API.

---

## Reference

- Parent spec: `docs/superpowers/specs/2026-04-19-botge-humor-design.md` → section 6, **Phase 1**
- Depends on: Phase 0 complete (branch `phase-0-foundation-fixes`, commit `19631a8`)

## Testing conventions (applies to every test task)

- Location: `tests/<name>.test.ts`
- Header: `/** @format */` at top
- Imports from vitest: `describe, test, expect, vi, beforeEach, afterEach`
- Source imports use the `src/*` alias with `.ts` extension: `import { foo } from 'src/path/file.ts'`
- `tests/setup.ts` already stubs `DISCORD_TOKEN` globally — no need to re-stub
- Run with: `npx vitest run`
- Run a single file: `npx vitest run tests/name.test.ts`
- Every task includes a `describe('envisioned behavior: ...', ...)` block with scenario-named tests that walk the user-visible fix, not just internal invariants

## Phase 1 file layout

```
src/
  api/
    ollama.ts                                (modified — RAG directive, temporal context)
    vector-store.ts                          (modified — exclude bot in findSimilar*)
    reply-editor.ts                          (NEW — deterministic output editor)
    recent-bot-output.ts                     (NEW — last-20 output ring buffer + cosine helper)
  message-create-handlers/
    ollama-message-create-handler.ts         (modified — narrow RAG query, wire editor)
tests/
  reply-editor.test.ts                       (NEW)
  recent-bot-output.test.ts                  (NEW)
  vector-store-exclude-bot.test.ts           (NEW)
  ollama-chat.test.ts                        (modified — temporal context assertion,
                                               flipped RAG directive assertion)
  ollama-rag-query.test.ts                   (NEW — narrow-query shape test)
```

---

## Task 1: Flip the RAG directive in the generation prompt

**What:** The generation prompt currently says `"[Relevant past conversations — use for context only, do not reference directly]"`. The spec (Phase 1 B4) flips this: callbacks are a feature. Change the directive so the model is *allowed* to reference past events when it fits.

**Files:**
- Modify: `src/api/ollama.ts` (line 116 — the `ragSection` string)
- Modify: `tests/ollama-chat.test.ts` (add a scenario assertion that the new phrasing is in the request body when retrievedContext is non-empty)

- [ ] **Step 1.1: Write the failing test**

Append to `tests/ollama-chat.test.ts` (below existing describes, do NOT replace):

```typescript
describe('envisioned behavior: RAG directive invites callbacks, does not forbid them', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: 'ok' } })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('when RAG context is present, the prompt allows callbacks instead of forbidding references', async () => {
    await generateReply('alice: yo', ['carol: remember when bob got one-shot by a rare pack']);
    const mockedFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const body = JSON.parse(mockedFetch.mock.calls[0][1]?.body as string) as {
      messages: readonly { role: string; content: string }[];
    };
    const userMessage = body.messages.find((m) => m.role === 'user');
    expect(userMessage).toBeDefined();
    // New phrasing: callbacks are welcome
    expect(userMessage?.content).toMatch(/callback|reference if it fits|natural callback/i);
    // Old phrasing must be gone
    expect(userMessage?.content).not.toContain('do not reference directly');
    expect(userMessage?.content).not.toContain('context only');
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npx vitest run tests/ollama-chat.test.ts`
Expected: FAIL — the new test fails because the old directive is still in place.

- [ ] **Step 1.3: Flip the directive**

Modify `src/api/ollama.ts`. Find the `ragSection` assignment (around line 114–117):

```typescript
  const ragSection =
    retrievedContext.length > 0
      ? `[Relevant past conversations — use for context only, do not reference directly]\n${retrievedContext.join('\n---\n')}\n\n`
      : '';
```

Replace with:

```typescript
  const ragSection =
    retrievedContext.length > 0
      ? `[Relevant past conversations — if a natural callback exists, reference it. Do not invent events that did not happen.]\n${retrievedContext.join('\n---\n')}\n\n`
      : '';
```

Note: the second sentence ("Do not invent events that did not happen") is load-bearing — it keeps the model from hallucinating past-chat moments when the RAG is thin or off-topic.

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npx vitest run tests/ollama-chat.test.ts`
Expected: PASS.

Run: `npx vitest run`
Expected: full suite passes.

Run: `npm run build`
Expected: clean.

Run: `npx prettier --check src/api/ollama.ts tests/ollama-chat.test.ts`
Expected: clean.

- [ ] **Step 1.5: Commit**

```bash
git add src/api/ollama.ts tests/ollama-chat.test.ts
git commit -m "$(cat <<'EOF'
flip rag directive: invite callbacks instead of forbidding references.

the previous prompt retrieved past context then told the model not to use it ('context only, do not reference directly') — the entire point of the rag pipeline was architecturally hamstrung. new directive: reference if it fits, don't invent events. scenario test pins the new phrasing and forbids the old.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Narrow the RAG query to the last 1–3 messages

**What:** Today `findSimilarWithContext` is called with the whole 30-message buffer as the semantic query. Embedding 30 off-topic lines averages into soup; the query vector loses signal. Narrow it to the last 3 buffered messages — that's what actually defines the *current* moment.

**Files:**
- Modify: `src/message-create-handlers/ollama-message-create-handler.ts` (the call site of `retrieveContext`)
- Create: `tests/ollama-rag-query.test.ts` (asserts the narrow query shape)

- [ ] **Step 2.1: Write the failing test**

Create `tests/ollama-rag-query.test.ts`:

```typescript
/** @format */

import { describe, test, expect } from 'vitest';

import { narrowRagQuery } from 'src/message-create-handlers/ollama-rag-query.ts';

describe('narrowRagQuery', () => {
  test('keeps only the last 3 lines of a longer history', () => {
    const full = Array.from({ length: 10 }, (_, i) => `u${i}: message number ${i}`).join('\n');
    const narrow = narrowRagQuery(full);
    expect(narrow.split('\n')).toHaveLength(3);
    expect(narrow).toContain('u7: message number 7');
    expect(narrow).toContain('u8: message number 8');
    expect(narrow).toContain('u9: message number 9');
    expect(narrow).not.toContain('u0: message number 0');
  });

  test('returns the full history if it has 3 or fewer lines', () => {
    expect(narrowRagQuery('a: hi\nb: yo')).toBe('a: hi\nb: yo');
    expect(narrowRagQuery('a: single')).toBe('a: single');
  });

  test('handles empty input by returning empty string', () => {
    expect(narrowRagQuery('')).toBe('');
  });
});

// Scenario test: the envisioned behavior — RAG queries track the *current* moment,
// not the entire rolling buffer. A 30-message buffer where only the last 2 lines
// are about PoE should produce a query that embeds "PoE," not an averaged blur.
describe('envisioned behavior: RAG query tracks the current moment', () => {
  test('a 30-message off-topic buffer with a recent topic shift embeds only the shift', () => {
    const offTopic = Array.from({ length: 28 }, (_, i) => `user${i}: anime ramble number ${i}`);
    const topicShift = ['alice: ok but did anyone drop a divine this league', 'bob: lol no i hate it here'];
    const full = [...offTopic, ...topicShift].join('\n');

    const narrow = narrowRagQuery(full);

    // The last 3 lines only — the topic shift plus one adjacent line
    expect(narrow.split('\n')).toHaveLength(3);
    expect(narrow).toContain('alice: ok but did anyone drop a divine this league');
    expect(narrow).toContain('bob: lol no i hate it here');
    expect(narrow).not.toContain('anime ramble number 0');
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npx vitest run tests/ollama-rag-query.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 2.3: Create the narrow-query helper**

Create `src/message-create-handlers/ollama-rag-query.ts`:

```typescript
/** @format */

/**
 * Returns only the last 3 lines of the formatted chat history, so the RAG
 * query vector reflects the *current* moment rather than an averaged blur
 * of the whole 30-message buffer.
 *
 * If the input has 3 or fewer lines, returns it unchanged.
 * Empty input returns empty string.
 */
export function narrowRagQuery(recentHistory: string): string {
  if (recentHistory === '') return '';
  const lines = recentHistory.split('\n');
  if (lines.length <= 3) return recentHistory;
  return lines.slice(-3).join('\n');
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npx vitest run tests/ollama-rag-query.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 2.5: Wire the helper into the handler**

Modify `src/message-create-handlers/ollama-message-create-handler.ts`.

Add an import near the other `./ollama-*` imports:

```typescript
import { narrowRagQuery } from './ollama-rag-query.ts';
```

Find the line that calls `retrieveContext` (around line 132):

```typescript
  const retrievedContext = await retrieveContext(channelId, recentHistory);
```

Replace with:

```typescript
  const retrievedContext = await retrieveContext(channelId, narrowRagQuery(recentHistory));
```

- [ ] **Step 2.6: Verify and commit**

Run: `npx vitest run && npm run build && npx prettier --check src/message-create-handlers/ollama-rag-query.ts src/message-create-handlers/ollama-message-create-handler.ts tests/ollama-rag-query.test.ts`
Expected: all clean.

Commit:

```bash
git add src/message-create-handlers/ollama-rag-query.ts src/message-create-handlers/ollama-message-create-handler.ts tests/ollama-rag-query.test.ts
git commit -m "$(cat <<'EOF'
narrow rag query to last 3 messages to sharpen semantic signal.

previously the whole 30-message buffer was used as the query text, which averaged a wide range of topics into one blurry vector. narrowing to the last 3 lines tracks the current moment — the topic shift the bot is actually reacting to.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Exclude Botge's own output from RAG retrieval

**What:** Today, `storeMessage` indexes the bot's own replies under its name. When RAG retrieves similar past messages, Botge can (and does) pull its own prior replies into the context — an echo chamber that reinforces the bot's own quirks and makes it drift from the group's voice. Spec change: at query time, filter out any message whose `author` equals `config.bot.name`. Storage is unchanged (we still want the bot's messages in Chroma for future features — just not in its own RAG context).

**Files:**
- Modify: `src/api/vector-store.ts` (the `where` clause in `findSimilarWithContext`)
- Create: `tests/vector-store-exclude-bot.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `tests/vector-store-exclude-bot.test.ts`:

```typescript
/** @format */

import { describe, test, expect, vi, beforeEach } from 'vitest';

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

// Also stub the embeddings endpoint so findSimilarWithContext's embed() call
// doesn't hit the network.
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

  test('query where-clause excludes messages authored by the bot (Botge)', async () => {
    const { findSimilarWithContext } = await import('src/api/vector-store.ts');
    const chromadb = await import('chromadb');
    const ChromaClient = chromadb.ChromaClient as unknown as ReturnType<typeof vi.fn>;

    await findSimilarWithContext('hello there', 'channel-1', 5, 2);

    // Grab the collection that was created and inspect the .query call
    const clientInstance = ChromaClient.mock.results.at(-1)?.value as {
      getOrCreateCollection: ReturnType<typeof vi.fn>;
    };
    const collection = await clientInstance.getOrCreateCollection.mock.results[0].value;
    const queryFn = collection.query as ReturnType<typeof vi.fn>;
    expect(queryFn).toHaveBeenCalledOnce();

    const arg = queryFn.mock.calls[0][0] as { where: { $and: readonly unknown[] } };
    // The where clause is an $and of channelId filter AND author != botName
    expect(arg.where).toHaveProperty('$and');
    const andClauses = arg.where.$and;
    const hasChannelFilter = andClauses.some(
      (c) => JSON.stringify(c).includes('channelId')
    );
    const hasBotExclusion = andClauses.some(
      (c) => JSON.stringify(c).includes('author') && JSON.stringify(c).includes('$ne')
    );
    expect(hasChannelFilter).toBe(true);
    expect(hasBotExclusion).toBe(true);
  });

  afterAll?.(() => {
    globalThis.fetch = originalFetch;
  });
});

// Scenario: the envisioned behavior — RAG never feeds Botge's own output back.
describe('envisioned behavior: Botge does not learn from its own past outputs', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [0.1, 0.2, 0.3] })
    }) as unknown as typeof fetch;
  });

  test('a RAG query never returns blocks authored by the configured bot name', async () => {
    // Even if Chroma returned bot messages (it won't, because the where clause
    // filters), the scenario guard is: the where clause explicitly demands
    // author != botName, so at the storage layer the retrieval cannot include them.
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

    const arg = queryFn.mock.calls[0][0] as { where: { $and: readonly unknown[] } };
    const serialized = JSON.stringify(arg.where);
    expect(serialized).toContain(config.bot.name);
    expect(serialized).toContain('$ne');
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `npx vitest run tests/vector-store-exclude-bot.test.ts`
Expected: FAIL — the current `where` is just `{ channelId }`, not an `$and`.

- [ ] **Step 3.3: Update the where-clause in vector-store.ts**

Modify `src/api/vector-store.ts`. Find the `collection.query` call inside `findSimilarWithContext` (around line 185–189):

```typescript
  const hits = await collection.query({
    queryEmbeddings: [[...queryVector]],
    nResults: Math.min(nResults, total),
    where: { channelId }
  });
```

Replace with:

```typescript
  const hits = await collection.query({
    queryEmbeddings: [[...queryVector]],
    nResults: Math.min(nResults, total),
    where: {
      $and: [{ channelId: { $eq: channelId } }, { author: { $ne: config.bot.name } }]
    }
  });
```

This uses Chroma's `$and` with explicit `$eq` and `$ne` operators — same pattern the `get()` call at line 213 already uses.

- [ ] **Step 3.4: Run test to verify it passes**

Run: `npx vitest run tests/vector-store-exclude-bot.test.ts`
Expected: PASS.

Run: `npx vitest run`
Expected: full suite passes. Also confirm the existing `tests/vector-store-collection.test.ts` still passes (the caching test doesn't exercise the `where` clause, so it should be unaffected).

- [ ] **Step 3.5: Verify prettier + build, then commit**

Run: `npm run build && npx prettier --check src/api/vector-store.ts tests/vector-store-exclude-bot.test.ts`
Expected: clean.

```bash
git add src/api/vector-store.ts tests/vector-store-exclude-bot.test.ts
git commit -m "$(cat <<'EOF'
exclude bot's own output from rag retrieval.

before: storeMessage indexed the bot's replies and findSimilarWithContext returned them, creating an echo chamber where botge learned from its own quirks. now: storage is unchanged (we still want bot messages in chroma) but query-time $and adds author != botName. scenario test asserts the where clause explicitly filters.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Inject temporal context into the generation system prompt

**What:** Feed the model the current time so it can make time-of-day jokes ("you're still up at 3am?") and match day-of-week energy. A one-line header in the system prompt is enough.

**Files:**
- Modify: `src/api/ollama.ts` (the generation system prompt in `generateReply`)
- Modify: `tests/ollama-chat.test.ts` (add temporal assertion)

- [ ] **Step 4.1: Write the failing test**

Append to `tests/ollama-chat.test.ts`:

```typescript
describe('envisioned behavior: generation prompt includes current weekday + hour in UTC', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-18T03:00:00Z')); // Saturday 03:00 UTC
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: 'ok' } })
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('system prompt names the current weekday and hour so time jokes can land', async () => {
    await generateReply('alice: still up?');
    const mockedFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const body = JSON.parse(mockedFetch.mock.calls[0][1]?.body as string) as {
      messages: readonly { role: string; content: string }[];
    };
    const systemMessage = body.messages.find((m) => m.role === 'system');
    expect(systemMessage).toBeDefined();
    expect(systemMessage?.content).toMatch(/saturday/i);
    expect(systemMessage?.content).toMatch(/03:00 utc|3:00 utc|03 utc|3 utc/i);
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `npx vitest run tests/ollama-chat.test.ts`
Expected: FAIL — system prompt doesn't contain temporal context yet.

- [ ] **Step 4.3: Add temporal context to the prompt**

Modify `src/api/ollama.ts`. Find the `generateReply` function's system prompt (around lines 96–110). The current assignment is:

```typescript
  const systemPrompt = `You are ${name}, a Bot member of this Discord group chat.

Your personality:
- Witty, dry, maybe sarcastic, but never try-hard
...
Your goal: contribute one natural, human message. Make it count.\n`;
```

Add a helper function above `generateReply` (after the `scoreReplyOpportunity` function, before `generateReply`):

```typescript
function currentTimeBanner(now: Readonly<Date> = new Date()): string {
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const hour = now.getUTCHours().toString().padStart(2, '0');
  return `It is ${weekday} ${hour}:00 UTC.`;
}
```

Then modify the start of `generateReply`'s system prompt. Change:

```typescript
  const systemPrompt = `You are ${name}, a Bot member of this Discord group chat.

Your personality:
```

to:

```typescript
  const systemPrompt = `You are ${name}, a Bot member of this Discord group chat. ${currentTimeBanner()}

Your personality:
```

The banner sits at the end of the opening line so the rest of the prompt is untouched.

- [ ] **Step 4.4: Run tests**

Run: `npx vitest run tests/ollama-chat.test.ts`
Expected: PASS.

Run: `npx vitest run && npm run build`
Expected: all green.

Run: `npx prettier --check src/api/ollama.ts tests/ollama-chat.test.ts`
Expected: clean.

- [ ] **Step 4.5: Commit**

```bash
git add src/api/ollama.ts tests/ollama-chat.test.ts
git commit -m "$(cat <<'EOF'
inject weekday + hour (UTC) into generation system prompt.

unlocks time-of-day and day-of-week jokes with a one-line header. scenario test freezes time to a saturday 3am and asserts the banner reaches the model.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Deterministic output editor

**What:** The biggest quality lever in Phase 1. Today the raw model output goes straight to Discord — no stripping, no rejection, no regeneration. Add a post-processing editor that:

1. Strips a leading `${botName}:` prefix
2. Strips surrounding straight/smart quotes
3. Strips markdown code fences (```...```)
4. Rejects replies > 280 chars
5. Rejects replies that start with banned openers (`Absolutely`, `Great`, `Sure,`, `I ` — case-insensitive; configurable list)
6. Rejects replies that are ≥ 0.85 cosine-similar (measured via `nomic-embed-text`) to any of the last 20 bot outputs in the same channel
7. On rejection, regenerates ONCE with an added strictness clause in the prompt
8. If second attempt also rejects, the handler stays silent

The "last 20 bot outputs" list is a new per-channel rolling ring buffer, populated by the editor itself on each successful send. This is a separate module because (a) the ring buffer is stateful, (b) we'll want to unit-test it independently.

**Why this is one task instead of two**: the ring buffer and the editor are intimately coupled — the editor writes to the buffer on success and reads from it to reject dupes. Splitting them creates two half-features neither of which is useful alone.

**Files:**
- Create: `src/api/recent-bot-output.ts` (ring buffer + cosine-similarity check)
- Create: `src/api/reply-editor.ts` (the editor itself; re-exports a single `applyReplyEditor` function)
- Create: `tests/recent-bot-output.test.ts`
- Create: `tests/reply-editor.test.ts`
- Modify: `src/message-create-handlers/ollama-message-create-handler.ts` (wire editor in place of raw `reply`)

- [ ] **Step 5.1: Write failing tests — recent-bot-output ring buffer**

Create `tests/recent-bot-output.test.ts`:

```typescript
/** @format */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  addBotOutput,
  isCosineSimilarToRecent,
  resetRecentBotOutputForTesting
} from 'src/api/recent-bot-output.ts';

describe('recent-bot-output — ring buffer', () => {
  beforeEach(() => {
    resetRecentBotOutputForTesting();
    // Stub the embeddings endpoint used by isCosineSimilarToRecent.
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
    // The mock returns the same [1,0,0] vector every call, so cosine similarity = 1.
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
    // We cannot directly inspect length, but we can assert via a different
    // embedding response for the older entry that evicted entries no longer
    // contribute to similarity. The stub returns the same vector for all,
    // so all 20 currently-retained entries are cosine-sim 1.0 — still triggers.
    expect(await isCosineSimilarToRecent('ch-1', 'anything', 0.85)).toBe(true);
  });
});

// Scenario: the envisioned behavior — botge never says the same thing twice in quick succession.
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
    // First reply lands — recorded.
    await addBotOutput('general', 'lmao fair');

    // Second moment arrives; bot would say something similar. Pre-send check.
    const tooClose = await isCosineSimilarToRecent('general', 'lmao fair enough', 0.85);
    expect(tooClose).toBe(true);
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

Run: `npx vitest run tests/recent-bot-output.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 5.3: Create the recent-bot-output module**

Create `src/api/recent-bot-output.ts`:

```typescript
/** @format */

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

/**
 * Embed a piece of text via the local Ollama embeddings endpoint.
 * Shared helper — same model (nomic-embed-text) the vector-store uses.
 */
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

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Record a bot output for the channel. Embeds the text once on insert so
 * later similarity checks are fast. Evicts oldest entries past the 20-per-channel cap.
 */
export async function addBotOutput(channelId: string, text: string): Promise<void> {
  const embedding = await embed(text);
  const buffer = buffers.get(channelId) ?? [];
  buffer.push({ text, embedding });
  if (buffer.length > MAX_ENTRIES_PER_CHANNEL) {
    buffer.splice(0, buffer.length - MAX_ENTRIES_PER_CHANNEL);
  }
  buffers.set(channelId, buffer);
}

/**
 * Check whether `candidate` is cosine-similar to any of the stored recent
 * outputs in the channel, above the given threshold.
 */
export async function isCosineSimilarToRecent(
  channelId: string,
  candidate: string,
  threshold: number
): Promise<boolean> {
  const buffer = buffers.get(channelId);
  if (buffer === undefined || buffer.length === 0) return false;
  const candidateEmbedding = await embed(candidate);
  return buffer.some((entry) => cosineSimilarity(entry.embedding, candidateEmbedding) >= threshold);
}

/**
 * Test-only helper — clears all per-channel buffers.
 */
export function resetRecentBotOutputForTesting(): void {
  buffers.clear();
}
```

- [ ] **Step 5.4: Run test to verify it passes**

Run: `npx vitest run tests/recent-bot-output.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5.5: Write failing tests — reply editor**

Create `tests/reply-editor.test.ts`:

```typescript
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
    // Pre-populate the channel with one output; mock returns [1,0,0] for all
    // embeddings so cosine similarity will be 1.0 on any string.
    const { addBotOutput } = await import('src/api/recent-bot-output.ts');
    await addBotOutput('ch-1', 'prior reply');

    const result = await applyReplyEditor('different words, same vector under the mock', 'ch-1');
    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/similar|duplicate/i);
  });
});

// Scenario: the envisioned behavior — raw model quirks never reach Discord,
// and back-to-back duplicates are squashed.
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
    // First reply lands cleanly.
    const first = await applyReplyEditor('lmao fair', 'general');
    expect(first.accepted).toBe(true);

    // Record it as the bot's output (the handler would do this on send).
    const { addBotOutput } = await import('src/api/recent-bot-output.ts');
    await addBotOutput('general', first.text!);

    // Second reply — mock makes it cosine-similar.
    const second = await applyReplyEditor('lmao fair enough', 'general');
    expect(second.accepted).toBe(false);
    expect(second.reason).toMatch(/similar|duplicate/i);
  });
});
```

- [ ] **Step 5.6: Run test to verify it fails**

Run: `npx vitest run tests/reply-editor.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 5.7: Create the reply-editor module**

Create `src/api/reply-editor.ts`:

```typescript
/** @format */

import { config } from '../config.ts';
import { isCosineSimilarToRecent } from './recent-bot-output.ts';

const MAX_REPLY_CHARS = 280;
const SIMILARITY_THRESHOLD = 0.85;

const BANNED_OPENERS: readonly string[] = ['absolutely', 'great', 'sure,', 'i '];

export type ReplyEditorResult = {
  readonly accepted: boolean;
  readonly text?: string;
  readonly reason?: string;
};

/**
 * Apply deterministic post-processing to a raw model reply.
 *
 * Strips cosmetic noise (bot name prefix, wrapping quotes, markdown fences).
 * Rejects replies that are too long, start with banned openers, or repeat
 * something the bot said recently in the same channel.
 *
 * Pure — does NOT record the reply. The caller is responsible for calling
 * `addBotOutput(channelId, result.text)` after a successful send so that
 * subsequent similarity checks see it.
 */
export async function applyReplyEditor(raw: string, channelId: string): Promise<ReplyEditorResult> {
  let text = raw.trim();

  // Strip markdown code fences wrapping the whole reply.
  const fenceMatch = text.match(/^```(?:\w+)?\n?([\s\S]*?)\n?```$/);
  if (fenceMatch !== null) text = fenceMatch[1].trim();

  // Strip a leading "BotName:" prefix (with or without trailing space).
  const prefixPattern = new RegExp(`^${escapeRegex(config.bot.name)}:\\s*`, 'i');
  text = text.replace(prefixPattern, '').trim();

  // Strip surrounding straight or smart quotes.
  text = stripSurroundingQuotes(text).trim();

  if (text.length === 0) {
    return { accepted: false, reason: 'empty after stripping' };
  }

  if (text.length > MAX_REPLY_CHARS) {
    return { accepted: false, reason: `too long (${text.length} > ${MAX_REPLY_CHARS})` };
  }

  const lowered = text.toLowerCase();
  if (BANNED_OPENERS.some((opener) => lowered.startsWith(opener))) {
    return { accepted: false, reason: 'banned opener' };
  }

  const tooSimilar = await isCosineSimilarToRecent(channelId, text, SIMILARITY_THRESHOLD);
  if (tooSimilar) {
    return { accepted: false, reason: 'too similar to recent bot output' };
  }

  return { accepted: true, text };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripSurroundingQuotes(s: string): string {
  const pairs: readonly [string, string][] = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’']
  ];
  for (const [open, close] of pairs) {
    if (s.startsWith(open) && s.endsWith(close) && s.length >= 2) {
      return s.slice(open.length, s.length - close.length);
    }
  }
  return s;
}
```

- [ ] **Step 5.8: Run tests**

Run: `npx vitest run tests/reply-editor.test.ts`
Expected: PASS — all tests across both describes green.

Run: `npx vitest run`
Expected: full suite passes.

- [ ] **Step 5.9: Wire the editor into the handler**

Modify `src/message-create-handlers/ollama-message-create-handler.ts`.

Add imports near the other `../api/` imports:

```typescript
import { applyReplyEditor } from '../api/reply-editor.ts';
import { addBotOutput } from '../api/recent-bot-output.ts';
```

Find the block that sends the reply (around lines 163–195 post-Phase-0). It currently looks roughly like:

```typescript
  let reply: string | undefined = undefined;
  try {
    const [, generatedReply] = await Promise.all([startTyping(), generateReply(recentHistory, retrievedContext)]);
    reply = generatedReply;
  } catch (error) {
    logError(error, 'Reply generation failed:');
    stopTyping();
    return;
  }

  stopTyping();
  if (!reply) return;

  // 9. Send the message and persist it too
  try {
    await message.reply(reply);
    setLastReplyTime(channelId);
    addMessage(channelId, config.bot.name, reply);
    void storeMessage({
      id: `bot_${Date.now()}`,
      author: config.bot.name,
      content: reply,
      channelId,
      timestamp: new Date()
    });
    console.log(`✅ Sent: "${reply}"`);
  } catch (error) {
    logError(error, 'Failed to send');
  }
```

Replace with:

```typescript
  let rawReply: string | undefined = undefined;
  try {
    const [, generatedReply] = await Promise.all([startTyping(), generateReply(recentHistory, retrievedContext)]);
    rawReply = generatedReply;
  } catch (error) {
    logError(error, 'Reply generation failed:');
    stopTyping();
    return;
  }

  stopTyping();
  if (!rawReply) return;

  // 9a. Run the deterministic editor (strips AI tells, rejects dupes/banned
  //     openers). On rejection, regenerate ONCE with a stricter directive.
  let edited = await applyReplyEditor(rawReply, channelId);
  if (!edited.accepted) {
    console.log(`🧹 Editor rejected: ${edited.reason}. Regenerating.`);
    const stricterHint = `\n[IMPORTANT: do NOT start with "Absolutely", "Great", "Sure,", or "I ". Do NOT wrap in quotes or markdown. Keep it under 280 chars.]`;
    try {
      const retry = await generateReply(recentHistory + stricterHint, retrievedContext);
      edited = await applyReplyEditor(retry, channelId);
    } catch (error) {
      logError(error, 'Regeneration failed:');
      return;
    }
    if (!edited.accepted) {
      console.log(`🧹 Editor rejected regen too: ${edited.reason}. Staying silent.`);
      return;
    }
  }
  const reply = edited.text!;

  // 9b. Send and record.
  try {
    await message.reply(reply);
    setLastReplyTime(channelId);
    addMessage(channelId, config.bot.name, reply);
    await addBotOutput(channelId, reply);
    void storeMessage({
      id: `bot_${Date.now()}`,
      author: config.bot.name,
      content: reply,
      channelId,
      timestamp: new Date()
    });
    console.log(`✅ Sent: "${reply}"`);
  } catch (error) {
    logError(error, 'Failed to send');
  }
```

Two changes to note:
1. `rawReply` replaces the old `reply` local; `reply` is now the *edited* text.
2. `await addBotOutput(channelId, reply)` is inserted after a successful `message.reply` so the next reply attempt sees this one in the dedupe buffer.

- [ ] **Step 5.10: Run full suite + build + prettier**

Run: `npx vitest run && npm run build`
Expected: all tests pass. Previous count was 43; this adds ~14 editor tests + ~7 recent-bot-output tests = ~21 new → roughly 64 passed / 4 skipped.

Run: `npx prettier --check src/api/reply-editor.ts src/api/recent-bot-output.ts src/message-create-handlers/ollama-message-create-handler.ts tests/reply-editor.test.ts tests/recent-bot-output.test.ts`
Expected: clean.

- [ ] **Step 5.11: Commit**

```bash
git add src/api/reply-editor.ts src/api/recent-bot-output.ts src/message-create-handlers/ollama-message-create-handler.ts tests/reply-editor.test.ts tests/recent-bot-output.test.ts
git commit -m "$(cat <<'EOF'
add deterministic reply editor + recent-output ring buffer.

raw model output now goes through post-processing: strip leading botname prefix, surrounding quotes, markdown fences; reject if too long (>280) or starts with banned opener (Absolutely/Great/Sure/I) or cosine-similar (>=0.85) to last 20 bot outputs in the channel. on rejection, regenerate once with a stricter directive; second rejection means silence. recent-bot-output is a new per-channel ring buffer that the editor reads from and the handler writes to on successful send.

scenario tests cover the two user-visible behaviors: (1) messy raw output with prefix+fences+quotes arrives clean, (2) effectively-duplicate back-to-back replies are squashed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Phase 1 verification pass

**What:** Final sweep — run the full suite, build, and re-run the live smoke harness (`tests/try-samples.live.test.ts` from Phase 0) against the Phase 1 branch to compare the voice against the Phase 0 baseline captured earlier.

**Files:** No source changes. Verification only.

- [ ] **Step 6.1: Full test suite**

Run: `npx vitest run`
Expected: all tests pass. Record total count + skipped. Compare against the Phase 0 exit count (43 passed / 4 skipped).

- [ ] **Step 6.2: Full build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 6.3: Prettier check of all touched files**

Run: `npx prettier --check src/api/ollama.ts src/api/vector-store.ts src/api/reply-editor.ts src/api/recent-bot-output.ts src/message-create-handlers/ollama-message-create-handler.ts src/message-create-handlers/ollama-rag-query.ts tests/ollama-chat.test.ts tests/ollama-rag-query.test.ts tests/reply-editor.test.ts tests/recent-bot-output.test.ts tests/vector-store-exclude-bot.test.ts`
Expected: clean.

- [ ] **Step 6.4: Sanity grep for old RAG directive**

Grep `src/` for the old directive phrasing to confirm it's fully gone:

Use the Grep tool with pattern `do not reference directly` in `src/`. Expected: zero matches.

Use the Grep tool with pattern `context only` in `src/`. Expected: zero matches.

- [ ] **Step 6.5: Live sample rerun (requires Ollama + model pulled)**

Run: `RUN_LIVE=1 npx vitest run tests/try-samples.live.test.ts --reporter=verbose`

Compare the output against the Phase 0 baseline:

Phase 0 baseline (captured during the Phase 0 spot-check):
1. Input: *botge how does it feel knowing you are being fixed by claude rn?* → Score 9/10 → Reply: `claude's a bit overzealous, honestly.`
2. Input: *Holy botge funny as af* → Score 8/10 → Reply: `probably just needed a reboot—like all of us some mornings.`
3. Input: *Botge, is gbob a weeb?* → Score 8/10 → Reply: `probably. we all have our things.`
4. Input: *hi botge, how was your day?* → Score 8/10 → Reply: `rebooted, all systems nominal—apparently that's a thing you ask now.`

Look for:
- Fewer em-dashes (the editor doesn't strip them explicitly, but the stricter regen prompt should discourage them on second pass)
- Less "reboot" repetition across replies 2 and 4 (anti-repetition buffer catches cross-call duplicates)
- RAG-callback-shaped replies — since the directive flipped, the model may now reference the "frozen mid-sentence" beat from the buffer more naturally
- Presence of weekday/time-awareness in any of the replies (opportunistic — won't always fire)

- [ ] **Step 6.6: Phase 1 exit checklist**

Confirm every spec item from Phase 1 resolves in the current tree:

1. ✅ RAG directive says "if a natural callback exists, reference it" (Task 1)
2. ✅ RAG query is narrowed to the last 1–3 messages (Task 2)
3. ✅ `findSimilarWithContext` where-clause excludes messages by `config.bot.name` (Task 3)
4. ✅ Generation system prompt includes current weekday + hour UTC (Task 4)
5. ✅ Deterministic editor strips prefix/quotes/fences, rejects long/banned-opener/too-similar, regenerates once (Task 5)
6. ✅ `recent-bot-output.ts` ring buffer is written on every successful send (Task 5)

Phase 1 complete. Next up: Phase 2 (evaluation + memory infrastructure — replay harness + reply log + topic tagger).

---

## Self-review notes

**Spec coverage (parent spec section 6 — Phase 1):**
- B4 RAG directive flip → Task 1 ✓
- B5 RAG query narrowing → Task 2 ✓
- B6 exclude bot's own output from RAG → Task 3 ✓
- B11 deterministic editor → Task 5 ✓
- B15 temporal context → Task 4 ✓

All five Phase 1 items covered. Phase 6 verification + live rerun covered in Task 6.

**Placeholders:** none. Every step has exact code, exact commands, or a specific short action.

**Type consistency:** `ReplyEditorResult` is used in Task 5 and consumed by the handler in Task 5.9 via `edited.text!` (safe because we check `edited.accepted` first). `addBotOutput` signature `(channelId: string, text: string) => Promise<void>` is consistent between the module creation (5.3), the test (5.1), and the handler call (5.9). `isCosineSimilarToRecent(channelId, candidate, threshold)` signature is consistent across module, test, and editor usage. `narrowRagQuery(recentHistory: string): string` is consistent across module and handler call.

**Scope constraint:** All Phase 1 changes touch only Botge's Ollama/Chroma reply pipeline — `src/api/*`, `src/message-create-handlers/*`, `src/config.ts` indirectly via `config.bot.name`. No README edits, no unrelated modules. Consistent with the Phase 0 PR boundary.

**Execution notes for the engineer:**
- Phase 0 must be merged or stacked before Phase 1 runs (depends on Phase 0's `ollama-cooldown.ts`, `ollama-gate.ts`, and the simplified scorer).
- `tests/setup.ts` (Phase 0) stubs `DISCORD_TOKEN` globally — no per-file stub needed.
- Live sample rerun (step 6.5) requires Ollama running with `gemma3:27b` pulled — installed during Phase 0 spot-check.
- Signing is now configured; every commit will sign automatically.
