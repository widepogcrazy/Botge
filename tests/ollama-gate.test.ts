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

// Scenario test — the envisioned behavior the fix was written for.
describe('envisioned behavior: the numeric threshold is the only reply gate', () => {
  test('mid-conversation filler (score 3) stays silent; direct joke setup (score 8) fires', () => {
    // Before the fix, the gate was `should_reply && score >= threshold`, with
    // default threshold=2. In practice the model's `should_reply` boolean
    // short-circuited and the score was decorative. After the fix, only the
    // numeric score gates — and the default threshold is 6, so the knob
    // actually filters.

    const fillerMoment = { score: 3, reason: 'mid-chat, nothing to add' };
    const setupMoment = { score: 8, reason: 'clear joke opportunity' };
    const threshold = 6;

    expect(shouldReplyBasedOnScore(fillerMoment, threshold)).toBe(false);
    expect(shouldReplyBasedOnScore(setupMoment, threshold)).toBe(true);
  });

  test('raising the threshold to 9 filters out even mildly-interesting moments', () => {
    // Threshold is a config knob — at 9, only the strongest opportunities fire.
    const mildlyInteresting = { score: 7, reason: 'could add something small' };
    expect(shouldReplyBasedOnScore(mildlyInteresting, 9)).toBe(false);

    const clearOpportunity = { score: 9, reason: 'fascinating claim worth a quip' };
    expect(shouldReplyBasedOnScore(clearOpportunity, 9)).toBe(true);
  });
});
