/** @format */

import { config } from '../config.ts';
import { isCosineSimilarToRecent } from './recent-bot-output.ts';

const MAX_REPLY_CHARS = 280;
const SIMILARITY_THRESHOLD = 0.85;

const BANNED_OPENERS: readonly string[] = ['absolutely', 'great', 'sure,', 'i '];

export type ReplyEditorResult =
  | { readonly accepted: true; readonly text: string }
  | { readonly accepted: false; readonly reason: string };

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
    ['\u201C', '\u201D'],
    ['\u2018', '\u2019']
  ];
  for (const [open, close] of pairs) {
    if (s.startsWith(open) && s.endsWith(close) && s.length >= 2) {
      return s.slice(open.length, s.length - close.length);
    }
  }
  return s;
}
