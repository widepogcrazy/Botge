/** @format */

import type { ScoreReplyOpportunityResult } from '../api/ollama.ts';

/**
 * Pure decision: given a scoring result and a numeric threshold, should
 * Botge reply? The numeric score is the single source of truth — no
 * separate `should_reply` boolean, no short-circuit.
 */
export function shouldReplyBasedOnScore(scoring: ScoreReplyOpportunityResult, threshold: number): boolean {
  return scoring.score >= threshold;
}
