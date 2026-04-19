/** @format */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  isOnCooldown,
  setLastReplyTime,
  resetCooldownForTesting
} from 'src/message-create-handlers/ollama-cooldown.ts';

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

// Scenario tests: walk the envisioned behavior, not internal invariants.
// Read these to answer "did this fix achieve what we wanted?"
describe('envisioned behavior: cooldown only burns after a real reply', () => {
  beforeEach(() => {
    resetCooldownForTesting();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('three skipped evaluations leave the channel eligible; one real reply locks it', () => {
    // Bug before the fix: the handler stamped the cooldown BEFORE scoring, so
    // a failed score or random-gate skip burned 60s even though nothing was sent.
    // Intended behavior: the channel stays eligible until an actual reply lands.

    // Msg #1 arrives: evaluation runs, scorer says "don't reply." No stamp.
    expect(isOnCooldown('general', 60)).toBe(false);

    // Msg #2 arrives 5s later: must still be eligible for evaluation.
    vi.advanceTimersByTime(5_000);
    expect(isOnCooldown('general', 60)).toBe(false);

    // Msg #3 arrives 10s after that: still eligible.
    vi.advanceTimersByTime(10_000);
    expect(isOnCooldown('general', 60)).toBe(false);

    // Msg #4 arrives and this one actually triggers a reply. Stamp lands.
    setLastReplyTime('general');
    expect(isOnCooldown('general', 60)).toBe(true);

    // The next 60s are quiet — no other messages in this channel reply.
    vi.advanceTimersByTime(59_000);
    expect(isOnCooldown('general', 60)).toBe(true);

    // After 60s the window opens again.
    vi.advanceTimersByTime(2_000);
    expect(isOnCooldown('general', 60)).toBe(false);
  });
});
