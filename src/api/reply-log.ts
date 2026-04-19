/** @format */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { DATABASE_ENDPOINTS } from '../paths-and-endpoints.ts';

export type ReplyLogScout = {
  readonly topic: string;
  readonly moment_type: string;
  readonly persona: string;
  readonly specialists?: readonly string[];
  readonly should_reply: boolean;
  readonly score: number;
  readonly reason: string;
};

export type ReplyLogCandidate = {
  readonly source: string;
  readonly text: string;
};

export type ReplyLogDirectorPick = {
  readonly text: string;
  readonly reasoning: string;
};

export type ReplyLogReaction = {
  readonly emoji: string;
  readonly userId: string;
  readonly timestamp: string;
};

export type ReplyLogEntry = {
  readonly timestamp: string;
  readonly channelId: string;
  readonly triggerMessageId: string;
  readonly scout: ReplyLogScout;
  readonly retrieved_context_ids: readonly string[];
  readonly candidates: readonly ReplyLogCandidate[];
  readonly director_pick: ReplyLogDirectorPick;
  readonly editor_decisions: readonly string[];
  readonly final_reply: string | null;
  readonly reply_message_id: string | null;
  readonly post_reactions: readonly ReplyLogReaction[];
  readonly promoted: boolean;
};

const DEFAULT_PATH = DATABASE_ENDPOINTS.replyLog;

/**
 * Append a single reply log entry as one JSONL line. Creates the parent
 * directory if it does not exist. Synchronous so the caller does not
 * need to await — entries are small and the filesystem append is fast.
 */
export function appendReplyLogEntry(entry: ReplyLogEntry, path: string = DEFAULT_PATH): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf8');
}
