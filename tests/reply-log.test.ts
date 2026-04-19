/** @format */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendReplyLogEntry, type ReplyLogEntry } from 'src/api/reply-log.ts';

describe('appendReplyLogEntry', () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'botge-reply-log-test-'));
    logPath = join(tempDir, 'reply-log.jsonl');
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  test('creates the file if it does not exist and appends one JSON line', () => {
    const entry: ReplyLogEntry = {
      timestamp: '2026-04-19T10:00:00.000Z',
      channelId: 'ch-1',
      triggerMessageId: 'msg-1',
      scout: { topic: 'meta', moment_type: 'question', persona: 'sincere', should_reply: true, score: 8, reason: 'x' },
      retrieved_context_ids: [],
      candidates: [{ source: 'generateReply', text: 'sample' }],
      director_pick: { text: 'sample', reasoning: 'only option' },
      editor_decisions: ['passed'],
      final_reply: 'sample',
      reply_message_id: 'bot-msg-1',
      post_reactions: [],
      promoted: false
    };

    appendReplyLogEntry(entry, logPath);
    const content = readFileSync(logPath, 'utf8');
    expect(content.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(content.trim()) as ReplyLogEntry;
    expect(parsed.triggerMessageId).toBe('msg-1');
    expect(parsed.final_reply).toBe('sample');
  });

  test('appends successive entries as separate JSON lines', () => {
    const baseEntry: ReplyLogEntry = {
      timestamp: '2026-04-19T10:00:00.000Z',
      channelId: 'ch-1',
      triggerMessageId: 'm1',
      scout: { topic: 'meta', moment_type: 'q', persona: 'sincere', should_reply: true, score: 8, reason: 'x' },
      retrieved_context_ids: [],
      candidates: [],
      director_pick: { text: 'a', reasoning: 'x' },
      editor_decisions: [],
      final_reply: 'a',
      reply_message_id: 'b1',
      post_reactions: [],
      promoted: false
    };

    appendReplyLogEntry({ ...baseEntry, triggerMessageId: 'm1' }, logPath);
    appendReplyLogEntry({ ...baseEntry, triggerMessageId: 'm2' }, logPath);
    appendReplyLogEntry({ ...baseEntry, triggerMessageId: 'm3' }, logPath);

    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    expect((JSON.parse(lines[0]) as ReplyLogEntry).triggerMessageId).toBe('m1');
    expect((JSON.parse(lines[2]) as ReplyLogEntry).triggerMessageId).toBe('m3');
  });

  test('creates the parent directory if missing', () => {
    const nested = join(tempDir, 'nested', 'dir', 'reply-log.jsonl');
    const entry: ReplyLogEntry = {
      timestamp: '2026-04-19T10:00:00.000Z',
      channelId: 'ch-1',
      triggerMessageId: 'm',
      scout: { topic: 'meta', moment_type: 'q', persona: 'sincere', should_reply: true, score: 8, reason: 'x' },
      retrieved_context_ids: [],
      candidates: [],
      director_pick: { text: 'a', reasoning: 'x' },
      editor_decisions: [],
      final_reply: 'a',
      reply_message_id: 'b',
      post_reactions: [],
      promoted: false
    };

    appendReplyLogEntry(entry, nested);
    expect(existsSync(nested)).toBe(true);
  });
});

// Scenario: the envisioned behavior — reply log accumulates a usable decision trace
// over a session.
describe('envisioned behavior: reply log accumulates decision traces usefully', () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'botge-reply-log-scenario-'));
    logPath = join(tempDir, 'log.jsonl');
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  test('after 5 reply attempts (some sent, some silenced) the log reflects the sequence', () => {
    const mk = (triggerId: string, finalReply: string | null): ReplyLogEntry => ({
      timestamp: new Date().toISOString(),
      channelId: 'general',
      triggerMessageId: triggerId,
      scout: {
        topic: 'meta',
        moment_type: 'joke-setup',
        persona: 'roaster',
        should_reply: true,
        score: 8,
        reason: 'x'
      },
      retrieved_context_ids: [],
      candidates: [{ source: 'generateReply', text: finalReply ?? 'rejected' }],
      director_pick: { text: finalReply ?? 'rejected', reasoning: 'x' },
      editor_decisions: finalReply === null ? ['rejected: too similar'] : ['passed'],
      final_reply: finalReply,
      reply_message_id: finalReply === null ? null : `bot-${triggerId}`,
      post_reactions: [],
      promoted: false
    });

    appendReplyLogEntry(mk('m1', 'landed one'), logPath);
    appendReplyLogEntry(mk('m2', null), logPath);
    appendReplyLogEntry(mk('m3', 'landed two'), logPath);
    appendReplyLogEntry(mk('m4', null), logPath);
    appendReplyLogEntry(mk('m5', 'landed three'), logPath);

    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(5);

    const entries = lines.map((l) => JSON.parse(l) as ReplyLogEntry);
    const silenced = entries.filter((e) => e.final_reply === null);
    const sent = entries.filter((e) => e.final_reply !== null);
    expect(silenced).toHaveLength(2);
    expect(sent).toHaveLength(3);
    expect(sent.map((e) => e.final_reply)).toEqual(['landed one', 'landed two', 'landed three']);
  });
});
