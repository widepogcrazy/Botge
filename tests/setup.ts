/** @format */

// Shared vitest setup. Runs before any test file is loaded.
//
// src/config.ts calls required('DISCORD_TOKEN') at module load, which means
// any test file that transitively imports config (via ollama, vector-store,
// handlers, etc.) will throw on import unless a token is present. Stubbing
// it here once keeps individual test files clean.
process.env.DISCORD_TOKEN ??= 'test-token';
