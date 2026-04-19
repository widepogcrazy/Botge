# Botge Phase 0 — Foundation Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the seven latent bugs and knob issues in Botge's Ollama reply pipeline identified in the audit, so every subsequent phase builds on a reliable foundation.

**Architecture:** Surgical fixes across `src/api/ollama.ts`, `src/api/vector-store.ts`, `src/message-create-handlers/ollama-message-create-handler.ts`, `src/config.ts`. Two small extractions (cooldown state, gate logic) move mutable / branching code into testable modules. No content behavior changes — this is a correctness pass.

**Tech Stack:** TypeScript (ESM, `.ts` imports), Discord.js 14, Ollama HTTP API, Chroma HTTP API, Vitest for tests.

---

## Reference: spec

Parent spec: `docs/superpowers/specs/2026-04-19-botge-humor-design.md` → section 6, **Phase 0**.

## Testing conventions (applies to every test task)

- Location: `tests/<name>.test.ts`
- Header: `/** @format */` at top
- Imports from vitest: `describe, test, expect, vi, beforeEach, afterEach`
- Source imports use the `src/*` alias with `.ts` extension: `import { foo } from 'src/path/file.ts'`
- Run with: `npm test`
- Run a single file: `npm test -- tests/name.test.ts`

## File layout after Phase 0

```
src/
  api/
    ollama.ts                     (modified — options, scorer, debug gate)
    vector-store.ts               (modified — collection cache)
  message-create-handlers/
    ollama-message-create-handler.ts  (modified — cooldown position, imports)
    ollama-cooldown.ts            (NEW — extracted cooldown state + helpers)
    ollama-gate.ts                (NEW — pure gate logic)
  config.ts                       (modified — model default, threshold default)
tests/
  ollama-cooldown.test.ts         (NEW)
  ollama-gate.test.ts             (NEW)
  vector-store-collection.test.ts (NEW)
  ollama-chat.test.ts             (NEW)
  ollama-debug-gate.test.ts       (NEW)
```

---

## Task 1: Extract cooldown module and fix timing bug

**What:** The handler currently calls `setLastReplyTime(channelId)` *before* it decides whether to reply. A failed score or random-gate skip still burns the cooldown window. Fix by:
1. Extracting the cooldown Map and its helpers into a dedicated module
2. Moving the `setLastReplyTime` call to after a successful `message.reply`

**Files:**
- Create: `src/message-create-handlers/ollama-cooldown.ts`
- Create: `tests/ollama-cooldown.test.ts`
- Modify: `src/message-create-handlers/ollama-message-create-handler.ts` (remove inline cooldown, import new module, reposition `setLastReplyTime` call)

- [ ] **Step 1.1: Write the failing test**

Create `tests/ollama-cooldown.test.ts`:

```typescript
/** @format */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';

import { isOnCooldown, setLastReplyTime, resetCooldownForTesting } from 'src/message-create-handlers/ollama-cooldown.ts';

describe('ollama-cooldown', () => {
  beforeEach(() => {
    resetCooldownForTesting();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('a fresh channel is not on cooldown', () => {
    expect(isOnCooldown('channel-1', 60)).toBe(false);
  });

  test('after setLastReplyTime, the channel is on cooldown', () => {
    setLastReplyTime('channel-1');
    expect(isOnCooldown('channel-1', 60)).toBe(true);
  });

  test('cooldown expires after cooldownSeconds', () => {
    setLastReplyTime('channel-1');
    vi.advanceTimersByTime(59_000);
    expect(isOnCooldown('channel-1', 60)).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(isOnCooldown('channel-1', 60)).toBe(false);
  });

  test('cooldown is per-channel', () => {
    setLastReplyTime('channel-1');
    expect(isOnCooldown('channel-1', 60)).toBe(true);
    expect(isOnCooldown('channel-2', 60)).toBe(false);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npm test -- tests/ollama-cooldown.test.ts`
Expected: FAIL — `Cannot find module 'src/message-create-handlers/ollama-cooldown.ts'`.

- [ ] **Step 1.3: Create the cooldown module**

Create `src/message-create-handlers/ollama-cooldown.ts`:

```typescript
/** @format */

const lastReplyTime = new Map<string, number>();

/**
 * Whether the channel has posted a bot reply within the last `cooldownSeconds`.
 */
export function isOnCooldown(channelId: string, cooldownSeconds: number): boolean {
  const last = lastReplyTime.get(channelId) ?? 0;
  return (Date.now() - last) / 1000 < cooldownSeconds;
}

/**
 * Stamp a reply time for the channel. Call this ONLY after a reply is
 * successfully sent — not before evaluation.
 */
export function setLastReplyTime(channelId: string): void {
  lastReplyTime.set(channelId, Date.now());
}

/**
 * Test-only helper — clears all cooldown state. Not used by production code.
 */
export function resetCooldownForTesting(): void {
  lastReplyTime.clear();
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npm test -- tests/ollama-cooldown.test.ts`
Expected: PASS — all four tests green.

- [ ] **Step 1.5: Wire the handler to the new module, move setLastReplyTime after reply**

Modify `src/message-create-handlers/ollama-message-create-handler.ts`:

At the top of the file, remove the inline `lastReplyTime` Map declaration and the two inline functions `isOnCooldown` / `setLastReplyTime` (lines 14, 70–76 in current file). Add this import near the other `import` statements:

```typescript
import { isOnCooldown, setLastReplyTime } from './ollama-cooldown.ts';
```

Then find the block that currently reads (approximately lines 100–103):

```typescript
const direct_mention = content.includes(`<@${clientUserId}>`);
if (!direct_mention && isOnCooldown(channelId)) return;
setLastReplyTime(channelId);
```

Replace with:

```typescript
const direct_mention = content.includes(`<@${clientUserId}>`);
if (!direct_mention && isOnCooldown(channelId, config.behavior.cooldownSeconds)) return;
```

(Note the added `cooldownSeconds` argument; the `setLastReplyTime` line is removed from here.)

Find the block that sends the reply (approximately lines 177–180):

```typescript
try {
  await message.reply(reply);

  // Add own reply to the in-memory buffer
```

Replace with:

```typescript
try {
  await message.reply(reply);
  setLastReplyTime(channelId);

  // Add own reply to the in-memory buffer
```

- [ ] **Step 1.6: Verify handler compiles and no test regresses**

Run: `npm run build`
Expected: no TypeScript errors.

Run: `npm test`
Expected: all tests pass (existing + new `ollama-cooldown.test.ts`).

- [ ] **Step 1.7: Commit**

```bash
git add src/message-create-handlers/ollama-cooldown.ts src/message-create-handlers/ollama-message-create-handler.ts tests/ollama-cooldown.test.ts
git commit -m "$(cat <<'EOF'
fix botge reply cooldown: extract module, stamp time only after send.

previously setLastReplyTime ran before scoring — failed evaluations burned the 60s window. now called only after message.reply() succeeds. cooldown state lives in its own module so it's unit-testable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Fix getCollection() module-scope cache

**What:** `src/api/vector-store.ts:81-89` declares `_collectionPromise` inside `getCollection()` with `let`, so every call re-initialises instead of caching. Move it to module scope.

**Files:**
- Modify: `src/api/vector-store.ts` (lines 81–89)
- Create: `tests/vector-store-collection.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `tests/vector-store-collection.test.ts`:

```typescript
/** @format */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// We need to control what ChromaClient.getOrCreateCollection does to assert caching.
vi.mock('chromadb', () => {
  const getOrCreateCollection = vi.fn().mockResolvedValue({ id: 'test-collection' });
  return {
    ChromaClient: vi.fn().mockImplementation(() => ({ getOrCreateCollection }))
  };
});

describe('getCollection caching', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('getCollection returns the same promise on repeated calls', async () => {
    const { getCollectionForTesting } = await import('src/api/vector-store.ts');
    const first = getCollectionForTesting();
    const second = getCollectionForTesting();
    expect(first).toBe(second);
    await Promise.all([first, second]);
  });

  test('ChromaClient.getOrCreateCollection is called exactly once across many getCollection calls', async () => {
    const chromadb = await import('chromadb');
    const ChromaClient = chromadb.ChromaClient as unknown as ReturnType<typeof vi.fn>;
    const instance = ChromaClient.mock.results.at(-1)?.value as { getOrCreateCollection: ReturnType<typeof vi.fn> };
    const { getCollectionForTesting } = await import('src/api/vector-store.ts');
    await Promise.all([getCollectionForTesting(), getCollectionForTesting(), getCollectionForTesting()]);
    expect(instance.getOrCreateCollection).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npm test -- tests/vector-store-collection.test.ts`
Expected: FAIL — `getCollectionForTesting` is not exported.

- [ ] **Step 2.3: Fix the cache and expose a test hook**

Modify `src/api/vector-store.ts`. Find the current `getCollection` function (lines ~81–89):

```typescript
// Cached collection promise — avoids race conditions on concurrent first calls
async function getCollection(): Promise<Collection> {
  let _collectionPromise: Promise<Collection> | null = null;
  _collectionPromise ??= client.getOrCreateCollection({
    name: getCollectionName(),
    metadata: { 'hnsw:space': 'cosine' } // cosine similarity for chat text
  });

  return _collectionPromise;
}
```

Replace with:

```typescript
// Cached at module scope — one collection promise for the lifetime of the process.
let collectionPromise: Promise<Collection> | null = null;

function getCollection(): Promise<Collection> {
  collectionPromise ??= client.getOrCreateCollection({
    name: getCollectionName(),
    metadata: { 'hnsw:space': 'cosine' } // cosine similarity for chat text
  });
  return collectionPromise;
}

/**
 * Test-only export. Returns the same cached promise getCollection uses.
 */
export function getCollectionForTesting(): Promise<Collection> {
  return getCollection();
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npm test -- tests/vector-store-collection.test.ts`
Expected: PASS — both tests green.

Run: `npm test`
Expected: full suite still passes.

- [ ] **Step 2.5: Commit**

```bash
git add src/api/vector-store.ts tests/vector-store-collection.test.ts
git commit -m "$(cat <<'EOF'
fix getCollection() cache — promise now lives at module scope.

previously the cache variable was declared inside the function with 'let', so every call re-initialised. getOrCreateCollection is idempotent so there was no correctness bug, but every query/upsert paid an extra round-trip. lifts the promise to module scope and adds a test hook.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Fix model default typo

**What:** `src/config.ts:39` defaults `OLLAMA_MODEL` to `gemma4:26b`. That tag does not exist on Ollama — the model is `gemma3:27b`. Change the default. Pure config edit, no test.

**Files:**
- Modify: `src/config.ts:39`

- [ ] **Step 3.1: Change the default**

In `src/config.ts`, find:

```typescript
    model: optional('OLLAMA_MODEL', 'gemma4:26b'),
```

Replace with:

```typescript
    model: optional('OLLAMA_MODEL', 'gemma3:27b'),
```

- [ ] **Step 3.2: Verify build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3.3: Commit**

```bash
git add src/config.ts
git commit -m "$(cat <<'EOF'
fix ollama model default — gemma4:26b does not exist, use gemma3:27b.

the tag was a typo; fresh installs without an OLLAMA_MODEL override would 404 on first chat. no behavior change for deployments with the env var set.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Upgrade sampling options (num_ctx and repeat_penalty)

**What:** `ollamaChat` currently sets `num_ctx: 4096` and no `repeat_penalty`. With a 30-msg buffer + 5 RAG windows, the context overflows and the system prompt gets silently truncated from the front. Bump to 8192. Add `repeat_penalty: 1.15` to break catchphrase ruts.

**Files:**
- Modify: `src/api/ollama.ts` (the `ollamaChat` function options)
- Create: `tests/ollama-chat.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `tests/ollama-chat.test.ts`:

```typescript
/** @format */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import { generateReply } from 'src/api/ollama.ts';

describe('ollamaChat request shape — generateReply', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: 'hi' } })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('generateReply sends num_ctx=8192 and repeat_penalty=1.15', async () => {
    await generateReply('Alice: yo');
    const mockedFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(mockedFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockedFetch.mock.calls[0][1]?.body as string) as {
      options: { num_ctx: number; repeat_penalty: number; temperature: number; top_p: number };
    };
    expect(body.options.num_ctx).toBe(8192);
    expect(body.options.repeat_penalty).toBe(1.15);
    expect(body.options.temperature).toBe(0.85);
    expect(body.options.top_p).toBe(0.9);
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `npm test -- tests/ollama-chat.test.ts`
Expected: FAIL — `num_ctx` is 4096 and `repeat_penalty` is undefined.

- [ ] **Step 4.3: Update the options**

Modify `src/api/ollama.ts`. Find the `options` object inside `ollamaChat` (lines ~32–36):

```typescript
      options: {
        temperature: 0.85,
        num_ctx: 4096,
        top_p: 0.9
      },
```

Replace with:

```typescript
      options: {
        temperature: 0.85,
        num_ctx: 8192,
        top_p: 0.9,
        repeat_penalty: 1.15
      },
```

- [ ] **Step 4.4: Run test to verify it passes**

Run: `npm test -- tests/ollama-chat.test.ts`
Expected: PASS.

Run: `npm test`
Expected: full suite passes.

- [ ] **Step 4.5: Commit**

```bash
git add src/api/ollama.ts tests/ollama-chat.test.ts
git commit -m "$(cat <<'EOF'
bump ollama context to 8192 and add repeat_penalty.

num_ctx=4096 was too small for a 30-msg buffer plus rag windows — the system prompt was silently truncated from the front when messages ran long. repeat_penalty=1.15 breaks the 'same catchphrase every reply' rut characteristic of small-chat fine-tunes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Scorer uses format:'json', simplified shape, numeric threshold gate

**What:** Three coupled changes that are one logical fix:
1. Scorer request uses Ollama's native `format: 'json'` so parsing is reliable (today it regex-strips ` ```json ``` ` fences, fragile)
2. Scorer output shape drops `should_reply` — the numeric score is the single source of truth
3. Handler's gate becomes `score >= config.behavior.replyScoreThreshold` only; raise default threshold from `2` to `6`

The gate logic is extracted into a pure module so it's trivially testable.

**Files:**
- Modify: `src/api/ollama.ts` (new scorer request flag, simplified return type, simplified parsing)
- Create: `src/message-create-handlers/ollama-gate.ts`
- Create: `tests/ollama-gate.test.ts`
- Modify: `tests/ollama-chat.test.ts` (add scorer-specific test)
- Modify: `src/message-create-handlers/ollama-message-create-handler.ts` (use gate module, remove `should_reply` branching)
- Modify: `src/config.ts` (default 2 → 6)

- [ ] **Step 5.1: Write the failing test — gate module**

Create `tests/ollama-gate.test.ts`:

```typescript
/** @format */

import { describe, test, expect } from 'vitest';

import { shouldReplyBasedOnScore } from 'src/message-create-handlers/ollama-gate.ts';

describe('shouldReplyBasedOnScore', () => {
  test('score above threshold returns true', () => {
    expect(shouldReplyBasedOnScore({ score: 8, reason: 'x' }, 6)).toBe(true);
  });

  test('score equal to threshold returns true', () => {
    expect(shouldReplyBasedOnScore({ score: 6, reason: 'x' }, 6)).toBe(true);
  });

  test('score below threshold returns false', () => {
    expect(shouldReplyBasedOnScore({ score: 3, reason: 'x' }, 6)).toBe(false);
  });

  test('score of zero (parse error case) returns false', () => {
    expect(shouldReplyBasedOnScore({ score: 0, reason: 'parse error' }, 6)).toBe(false);
  });
});
```

- [ ] **Step 5.2: Write the failing test — scorer request shape**

Add to `tests/ollama-chat.test.ts` (below the existing describe block):

```typescript
import { scoreReplyOpportunity } from 'src/api/ollama.ts';

describe('ollamaChat request shape — scoreReplyOpportunity', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: '{"score":7,"reason":"good"}' } })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('scoreReplyOpportunity sends format: "json" and parses the clean response', async () => {
    const result = await scoreReplyOpportunity('Alice: yo\nBob: sup');
    const mockedFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const body = JSON.parse(mockedFetch.mock.calls[0][1]?.body as string) as { format?: string };
    expect(body.format).toBe('json');
    expect(result.score).toBe(7);
    expect(result.reason).toBe('good');
  });

  test('scoreReplyOpportunity returns score=0 on malformed JSON without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: 'not json at all' } })
      })
    );
    const result = await scoreReplyOpportunity('Alice: yo');
    expect(result.score).toBe(0);
    expect(result.reason).toContain('parse error');
  });
});
```

- [ ] **Step 5.3: Run tests to verify they fail**

Run: `npm test -- tests/ollama-gate.test.ts`
Expected: FAIL — module does not exist.

Run: `npm test -- tests/ollama-chat.test.ts`
Expected: FAIL — the new scorer tests fail because `format: 'json'` is not sent and the returned shape still has `shouldReply`.

- [ ] **Step 5.4: Create the gate module**

Create `src/message-create-handlers/ollama-gate.ts`:

```typescript
/** @format */

type ScoringResult = { readonly score: number; readonly reason: string };

/**
 * Pure decision: given a scoring result and a numeric threshold, should
 * Botge reply? The numeric score is the single source of truth — no
 * separate `should_reply` boolean, no short-circuit.
 */
export function shouldReplyBasedOnScore(scoring: ScoringResult, threshold: number): boolean {
  return scoring.score >= threshold;
}
```

- [ ] **Step 5.5: Update ollama.ts — format:'json' and simplified return type**

Modify `src/api/ollama.ts`. Changes in order:

**5.5.a** Update the `ollamaChat` signature to accept an optional `useJsonFormat` flag. Find the function (starting around line 24):

```typescript
async function ollamaChat(systemPrompt: string, userPrompt: string): Promise<string> {
  const { baseUrl, model } = config.ollama;
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      options: {
        temperature: 0.85,
        num_ctx: 8192,
        top_p: 0.9,
        repeat_penalty: 1.15
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });
```

Replace with:

```typescript
async function ollamaChat(
  systemPrompt: string,
  userPrompt: string,
  options: { readonly format?: 'json' } = {}
): Promise<string> {
  const { baseUrl, model } = config.ollama;
  const requestBody: Record<string, unknown> = {
    model,
    stream: false,
    options: {
      temperature: 0.85,
      num_ctx: 8192,
      top_p: 0.9,
      repeat_penalty: 1.15
    },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };
  if (options.format === 'json') requestBody.format = 'json';
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });
```

**5.5.b** Replace the `ScoreReplyOpportunityResult` / `ScoreReplyOpportunityResponse` types and the `scoreReplyOpportunity` function. Find (lines ~9–19, 62–93):

```typescript
type ScoreReplyOpportunityResult = {
  readonly score: number;
  readonly shouldReply: boolean;
  readonly reason: string;
};

type ScoreReplyOpportunityResponse = {
  readonly score?: number;
  readonly should_reply?: boolean;
  readonly reason?: string;
};
```

Replace with:

```typescript
export type ScoreReplyOpportunityResult = {
  readonly score: number;
  readonly reason: string;
};

type ScoreReplyOpportunityResponse = {
  readonly score?: number;
  readonly reason?: string;
};
```

Find the `scoreReplyOpportunity` function and replace its body:

```typescript
export async function scoreReplyOpportunity(chatHistory: string): Promise<ScoreReplyOpportunityResult> {
  const { name } = config.bot;
  const systemPrompt = `You are a silent observer of a group chat. Your job is to score whether ${name} — a witty, laid-back chat member — should chime in.

Reply ONLY with a valid JSON object of the form {"score": <1-10 integer>, "reason": "<short string>"}.

Score criteria (1-10):
- 8-10: Clear joke opportunity, direct question to the group, fascinating claim worth a quip
- 5-7: Mildly interesting, could add something small
- 1-4: Mid-conversation, serious topic, nothing to add

Be conservative. It's better to stay silent than to force a response.`;
  const userPrompt = `Recent chat:\n${chatHistory}\n\nReturn only the JSON object.`;
  const raw = await ollamaChat(systemPrompt, userPrompt, { format: 'json' });

  try {
    const parsed = JSON.parse(raw) as ScoreReplyOpportunityResponse;
    return {
      score: parsed.score ?? 0,
      reason: parsed.reason ?? ''
    };
  } catch {
    console.warn('⚠️  Failed to parse scoring JSON:', raw);
    return { score: 0, reason: 'parse error' };
  }
}
```

Notes on the rewrite:
- Removed the "witty laid-back **human**" phrase from the scoring prompt (it contradicted the generation prompt's "don't pretend to be human" — flagged in the audit)
- Removed the `should_reply` field entirely from both the prompt and the parsing
- Regex-stripping of `` ```json `` fences is gone — `format: 'json'` guarantees clean output

- [ ] **Step 5.6: Update the handler to use the gate module**

Modify `src/message-create-handlers/ollama-message-create-handler.ts`.

Add an import near the others:

```typescript
import { shouldReplyBasedOnScore } from './ollama-gate.ts';
```

Find the scoring block (approximately lines 112–127):

```typescript
  let shouldReply: boolean = direct_mention;
  if (!direct_mention) {
    shouldReply = await (async (): Promise<boolean> => {
      console.log(`🎲 Evaluating reply in #${channelName}...`);
      const scoring = await scoreReplyOpportunity(recentHistory).catch((err: unknown) => {
        console.error('❌ Scoring failed:', err instanceof Error ? err.message : String(err));
        return null;
      });
      if (scoring === null) return false;

      console.log(`📊 Score: ${scoring.score}/10 | Reply: ${scoring.shouldReply} | ${scoring.reason}`);

      if (!scoring.shouldReply) return false;
      return scoring.score >= config.behavior.replyScoreThreshold;
    })();
  }
  if (!shouldReply) return;
```

Replace with:

```typescript
  let shouldReply: boolean = direct_mention;
  if (!direct_mention) {
    shouldReply = await (async (): Promise<boolean> => {
      console.log(`🎲 Evaluating reply in #${channelName}...`);
      const scoring = await scoreReplyOpportunity(recentHistory).catch((err: unknown) => {
        console.error('❌ Scoring failed:', err instanceof Error ? err.message : String(err));
        return null;
      });
      if (scoring === null) return false;

      const pass = shouldReplyBasedOnScore(scoring, config.behavior.replyScoreThreshold);
      console.log(`📊 Score: ${scoring.score}/10 | Pass: ${pass} | ${scoring.reason}`);
      return pass;
    })();
  }
  if (!shouldReply) return;
```

- [ ] **Step 5.7: Raise the default threshold**

Modify `src/config.ts`. Find:

```typescript
    replyScoreThreshold: Number(optional('REPLY_SCORE_THRESHOLD', '2')),
```

Replace with:

```typescript
    replyScoreThreshold: Number(optional('REPLY_SCORE_THRESHOLD', '6')),
```

- [ ] **Step 5.8: Run all tests**

Run: `npm test`
Expected: all green — `ollama-gate.test.ts` passes, both `ollama-chat.test.ts` describes pass, existing tests untouched.

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 5.9: Commit**

```bash
git add src/api/ollama.ts src/message-create-handlers/ollama-gate.ts src/message-create-handlers/ollama-message-create-handler.ts src/config.ts tests/ollama-gate.test.ts tests/ollama-chat.test.ts
git commit -m "$(cat <<'EOF'
scorer uses format:'json'; numeric score is the only reply gate.

three coupled fixes: (1) scorer now requests ollama's native json format so brittle regex fence-stripping is gone; (2) should_reply boolean is dropped from the return shape — the numeric score is the single source of truth; (3) default threshold raised from 2 to 6 so the knob actually means something. gate logic extracted to ollama-gate.ts for unit testing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Gate the full-prompt console.log behind DEBUG_OLLAMA

**What:** `ollamaChat` currently `console.log`s the full system prompt, user prompt, and model response on every call. That's a chat log leaking to stdout on every reply attempt. Gate behind `DEBUG_OLLAMA=1`.

**Files:**
- Modify: `src/api/ollama.ts` (the logging block inside `ollamaChat`)
- Create: `tests/ollama-debug-gate.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `tests/ollama-debug-gate.test.ts`:

```typescript
/** @format */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ollamaChat debug logging gate', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: 'hi' } })
      })
    );
    vi.resetModules();
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test('does NOT log prompt/response when DEBUG_OLLAMA is unset', async () => {
    vi.stubEnv('DEBUG_OLLAMA', '');
    const { generateReply } = await import('src/api/ollama.ts');
    await generateReply('Alice: yo');
    const promptLogs = logSpy.mock.calls.filter((args) =>
      typeof args[0] === 'string' && args[0].includes('systemPrompt:')
    );
    expect(promptLogs).toHaveLength(0);
  });

  test('DOES log prompt/response when DEBUG_OLLAMA=1', async () => {
    vi.stubEnv('DEBUG_OLLAMA', '1');
    const { generateReply } = await import('src/api/ollama.ts');
    await generateReply('Alice: yo');
    const promptLogs = logSpy.mock.calls.filter((args) =>
      typeof args[0] === 'string' && args[0].includes('systemPrompt:')
    );
    expect(promptLogs.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

Run: `npm test -- tests/ollama-debug-gate.test.ts`
Expected: FAIL — the first test fails because `console.log` is always called.

- [ ] **Step 6.3: Gate the log**

Modify `src/api/ollama.ts`. Find the log block inside `ollamaChat` (lines ~47–54):

```typescript
  console.log(
    'systemPrompt: ' +
      systemPrompt +
      '\nuserPrompt: ' +
      userPrompt +
      '\nResponse' +
      (data.message?.content?.trim() ?? '')
  );
  return data.message?.content?.trim() ?? '';
```

Replace with:

```typescript
  const reply = data.message?.content?.trim() ?? '';
  if (process.env.DEBUG_OLLAMA) {
    console.log(
      'systemPrompt: ' + systemPrompt + '\nuserPrompt: ' + userPrompt + '\nResponse: ' + reply
    );
  }
  return reply;
```

- [ ] **Step 6.4: Run test to verify it passes**

Run: `npm test -- tests/ollama-debug-gate.test.ts`
Expected: PASS.

Run: `npm test`
Expected: full suite passes.

- [ ] **Step 6.5: Commit**

```bash
git add src/api/ollama.ts tests/ollama-debug-gate.test.ts
git commit -m "$(cat <<'EOF'
gate ollama prompt/response dump behind DEBUG_OLLAMA env.

previously every chat call wrote the full system prompt, user prompt, and model response to stdout — a chat log leak on any shared host. now opt-in via DEBUG_OLLAMA=1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Verification and docs correction

**What:** Final sweep. Run the full quality stack and correct the one stale docs line that references the removed GPT integration.

**Files:**
- Read-only: all of the above
- Modify: `README.md` (stale GPT mention)

- [ ] **Step 7.1: Full test suite**

Run: `npm test`
Expected: all tests pass. Record the count.

- [ ] **Step 7.2: Full build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7.3: Lint**

Run: `npm run eslint`
Expected: no errors (warnings acceptable if they existed pre-change).

- [ ] **Step 7.4: README update**

The README (around lines 23–26) still advertises "OpenAI's GPT models" as part of the conversational system, which was replaced by Ollama in commit `d6d5b76`. Open `README.md`, locate the sentence:

```
With built-in [DeepL Translation](https://www.deepl.com/en/products/translator), integration with [OpenAI's](https://openai.com) GPT models, Botge makes conversations more dynamic, engaging, and intelligent.
```

Replace the sentence with one that matches current reality. Minimal edit:

```
With built-in [DeepL Translation](https://www.deepl.com/en/products/translator) and a local [Ollama](https://ollama.com)-powered conversational mode (RAG-backed via ChromaDB), Botge makes conversations more dynamic, engaging, and intelligent.
```

- [ ] **Step 7.5: Sanity check — locate remaining `should_reply` references**

Run: `npm run eslint` and also search the repo for leftover references to the removed shape:

Use the Grep tool for `should_reply` and `shouldReply` across the repo. Expected: zero hits in source files (may exist in `docs/superpowers/specs/...` — those are reference, leave alone).

If any remain in `src/` or `tests/`, fix them before committing.

- [ ] **Step 7.6: Commit the README fix**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: update readme to reflect ollama replacing gpt in conversational mode.

the gpt integration was removed in d6d5b76 but the readme still advertised it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7.7: Phase 0 exit check**

Confirm every item on this list resolves in the current working tree:

1. Cooldown is stamped only after a successful send (Task 1).
2. `replyScoreThreshold` is the sole reply gate; default raised to 6 (Task 5).
3. `getCollection()` caches at module scope (Task 2).
4. `OLLAMA_MODEL` default is `gemma3:27b` (Task 3).
5. `ollamaChat` sends `num_ctx: 8192` and `repeat_penalty: 1.15` (Task 4).
6. Scorer call sends `format: 'json'`; regex cleanup removed (Task 5).
7. Prompt/response log is gated by `DEBUG_OLLAMA` (Task 6).

Run one last time: `npm test && npm run build`
Expected: green across the board.

Phase 0 complete. Subsequent phases (1–7) each get their own plan file, written as we reach them.

---

## Self-review notes

**Spec coverage (section 6, Phase 0):**
- Move `setLastReplyTime` after reply → Task 1 ✓
- Enforce or remove `replyScoreThreshold` → Task 5 (enforce, default 6) ✓
- Fix `getCollection()` module-scope → Task 2 ✓
- `gemma4:26b` → `gemma3:27b` → Task 3 ✓
- `num_ctx: 8192` → Task 4 ✓
- `repeat_penalty: 1.15` → Task 4 ✓
- Scorer `format: 'json'`, remove regex cleanup → Task 5 ✓
- `DEBUG_OLLAMA` env gate on prompt log → Task 6 ✓
- README stale-GPT cleanup → Task 7 ✓ (bonus, not in spec but discovered during audit)

**Placeholders:** none. Every step has either exact code, exact commands, or a specific short action.

**Type consistency:** `ScoreReplyOpportunityResult` becomes `{score, reason}` only — used consistently in `ollama.ts`, `ollama-gate.ts`, and the handler. `ScoringResult` in the gate module has the same shape (field names match). `shouldReplyBasedOnScore` takes `(scoring, threshold)` in every call site.

**Execution notes for the engineer:**
- Node 25.9 + npm ≥ 11.12 per `package.json` `engines`.
- Run `npm install` first if this is a fresh clone.
- Tests do not require Ollama or Chroma running — all network calls are stubbed via `vi.stubGlobal('fetch', ...)`.
- `npm test` runs vitest in run-once mode; there is no separate `test:watch` script.
