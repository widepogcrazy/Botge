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
