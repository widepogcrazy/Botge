/** @format */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import { generateReply } from 'src/api/ollama.ts';
import { scoreReplyOpportunity } from 'src/api/ollama.ts';

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

// Scenario test: prove the fix holds under the shape of load that caused the
// bug — a large recent-history buffer plus many RAG context blocks. Under
// num_ctx=4096 the system prompt would silently truncate from the front;
// bumping to 8192 gives headroom. We assert the request the model receives
// has the headroom allocated.
describe('envisioned behavior: long buffer + heavy RAG fits inside the model context', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: 'lol' } })
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('a realistic workload (30 recent msgs + 5 RAG blocks) still requests 8192 context', async () => {
    const recentHistory = Array.from(
      { length: 30 },
      (_, i) => `User${i}: message number ${i} is a somewhat long message about Path of Exile or anime or vtubers.`
    ).join('\n');
    const retrievedContext = Array.from({ length: 5 }, (_, i) =>
      Array.from({ length: 5 }, (_, j) => `User${j}: rag context block ${i} line ${j}`).join('\n')
    );

    await generateReply(recentHistory, retrievedContext);

    const mockedFetch = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const body = JSON.parse(mockedFetch.mock.calls[0][1]?.body as string) as {
      options: { num_ctx: number; repeat_penalty: number };
      messages: readonly { role: string; content: string }[];
    };

    // Context window big enough to hold a realistic chat load.
    expect(body.options.num_ctx).toBeGreaterThanOrEqual(8192);

    // Repetition penalty active so catchphrase ruts get broken.
    expect(body.options.repeat_penalty).toBeGreaterThan(1);

    // The system prompt survived (not truncated away on assembly).
    const systemMessage = body.messages.find((m) => m.role === 'system');
    expect(systemMessage).toBeDefined();
    expect(systemMessage?.content).toContain('personality');
  });
});

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
