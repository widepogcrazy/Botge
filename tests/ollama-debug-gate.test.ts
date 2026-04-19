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
    const promptLogs = logSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('systemPrompt:')
    );
    expect(promptLogs).toHaveLength(0);
  });

  test('DOES log prompt/response when DEBUG_OLLAMA=1', async () => {
    vi.stubEnv('DEBUG_OLLAMA', '1');
    const { generateReply } = await import('src/api/ollama.ts');
    await generateReply('Alice: yo');
    const promptLogs = logSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('systemPrompt:')
    );
    expect(promptLogs.length).toBeGreaterThan(0);
  });
});

// Scenario test: demonstrates the behavior an operator cares about — no
// unsolicited chat log leaking in a production deployment, but full trace
// available when debugging.
describe('envisioned behavior: production runs do not leak chat to stdout', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: 'lmao' } })
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

  test('prod-like run (no DEBUG_OLLAMA): the private chat content never hits stdout', async () => {
    vi.stubEnv('DEBUG_OLLAMA', '');
    const { generateReply } = await import('src/api/ollama.ts');

    const privateHistory = 'alice: my credit card number is 4111-1111-1111-1111';
    await generateReply(privateHistory);

    // Walk every call to console.log — none of them should contain the
    // sensitive content.
    const leaked = logSpy.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && a.includes('4111-1111-1111-1111'))
    );
    expect(leaked).toBe(false);
  });

  test('debug run (DEBUG_OLLAMA=1): the same content IS visible for troubleshooting', async () => {
    vi.stubEnv('DEBUG_OLLAMA', '1');
    const { generateReply } = await import('src/api/ollama.ts');

    const privateHistory = 'alice: my credit card number is 4111-1111-1111-1111';
    await generateReply(privateHistory);

    const leaked = logSpy.mock.calls.some((args) =>
      args.some((a) => typeof a === 'string' && a.includes('4111-1111-1111-1111'))
    );
    expect(leaked).toBe(true);
  });
});
