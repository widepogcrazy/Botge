/** @format */

import { describe, test, expect } from 'vitest';

import { config } from 'src/config.ts';

// Scenario test: a fresh install without any OLLAMA_MODEL override loads
// the config module and gets a model tag that actually resolves on Ollama.
// The bug this guards against: gemma4:26b was a typo — the real tag is
// gemma3:27b. Fresh installs without the env var set would 404 on first
// chat call.
describe('envisioned behavior: default OLLAMA_MODEL points at a real Ollama tag', () => {
  test('config.ollama.model defaults to gemma3:27b', () => {
    // Note: tests/setup.ts stubs DISCORD_TOKEN but does not set
    // OLLAMA_MODEL, so this asserts the default-value path.
    if (process.env.OLLAMA_MODEL !== undefined) {
      // If the env var happens to be set in this shell, the test can't
      // assert the default — just verify the override path still returns
      // a non-empty string.
      expect(config.ollama.model.length).toBeGreaterThan(0);
      return;
    }
    expect(config.ollama.model).toBe('gemma3:27b');
  });

  test('the known-bad gemma4:26b tag is never the default', () => {
    // Even if OLLAMA_MODEL is set in the env, it should not be the typo.
    expect(config.ollama.model).not.toBe('gemma4:26b');
  });
});
