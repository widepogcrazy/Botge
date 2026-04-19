/** @format */

import type { OmitPartialGroupDMChannel, Message } from 'discord.js';

import { storeMessage, findSimilarWithContext } from '../api/vector-store.ts';
import { scoreReplyOpportunity, generateReply } from '../api/ollama.ts';
import { applyReplyEditor } from '../api/reply-editor.ts';
import { addBotOutput } from '../api/recent-bot-output.ts';
import { tagMessage } from '../api/tagger.ts';
import { logError } from '../utils/log-error.ts';
import { config } from '../config.ts';
import { isOnCooldown, setLastReplyTime } from './ollama-cooldown.ts';
import { shouldReplyBasedOnScore } from './ollama-gate.ts';
import { narrowRagQuery } from './ollama-rag-query.ts';

type BufferEntry = { readonly author: string; readonly content: string; readonly timestamp: string };

// Map of channelId → array of message objects
const buffers = new Map<string, BufferEntry[]>();

async function persistToVectorStore(message: OmitPartialGroupDMChannel<Message>, author: string): Promise<void> {
  try {
    const tags = await tagMessage(message.content).catch(() => [] as readonly string[]);
    await storeMessage({
      id: message.id,
      author,
      content: message.content,
      channelId: message.channel.id,
      timestamp: message.createdAt,
      tags
    });
  } catch (error) {
    logError(error, 'Vector store write failed');
  }
}

async function retrieveContext(channelId: string, recentHistory: string): Promise<readonly string[]> {
  try {
    const { ragResults, ragWindowSize } = config.behavior;

    return await findSimilarWithContext(recentHistory, channelId, ragResults, ragWindowSize);
  } catch (error) {
    logError(error, 'Vector store query failed');
    return [];
  }
}

/**
 * Format a channel's chat history as a readable string for the prompt.
 */
function getFormattedHistory(channelId: string): string {
  const buffer = buffers.get(channelId) ?? [];

  return buffer.map((msg: BufferEntry) => `${msg.author}: ${msg.content}`).join('\n');
}

/**
 * Add a message to a channel's rolling buffer.
 */
function addMessage(channelId: string, authorName: string, content: string): void {
  const buffer = buffers.get(channelId) ?? [];

  buffer.push({ author: authorName, content, timestamp: new Date().toISOString() });

  const { contextWindow } = config.behavior;

  if (buffer.length > contextWindow) buffer.splice(0, buffer.length - contextWindow);
  buffers.set(channelId, buffer);
}

/**
 * How many messages are buffered for a channel.
 */
function getBufferSize(channelId: string): number {
  return buffers.get(channelId)?.length ?? 0;
}

export async function ollamaMessageCreateHandler(
  message: OmitPartialGroupDMChannel<Message>,
  clientUserId: string
): Promise<void> {
  if (!config.activeChatChannels.includes(message.channel.id)) return;

  const channelId = message.channel.id;
  const authorName = message.author.displayName;
  const content = message.content.trim();

  // console.log('got message: ' + channelId + ' ' + content);

  // 1. Add to in-memory rolling buffer (fast, synchronous)
  addMessage(channelId, authorName, content);

  // 2. Persist to vector store in the background (async, non-blocking)
  //    This ensures all messages are indexed even when the bot doesn't reply
  void persistToVectorStore(message, authorName);

  // 3. Need a few messages of context before chiming in
  if (getBufferSize(channelId) < 3) return;

  // 4. Check per-channel cooldown / direct mention
  const direct_mention = content.includes(`<@${clientUserId}>`);
  if (!direct_mention && isOnCooldown(channelId, config.behavior.cooldownSeconds)) return;

  // 5. Random gate — skip most messages to avoid being annoying
  if (!direct_mention && Math.random() > config.behavior.evaluationChance) return;

  // 6. Score the opportunity using the recent buffer
  const recentHistory = getFormattedHistory(channelId);
  const channelName = 'name' in message.channel ? message.channel.name : channelId;
  // skip scoring for direct mention
  let shouldReply: boolean = direct_mention;
  if (!direct_mention) {
    shouldReply = await (async (): Promise<boolean> => {
      console.log(`🎲 Evaluating reply in #${channelName}...`);
      const scoring = await scoreReplyOpportunity(recentHistory).catch((err: unknown) => {
        console.error('❌ Scoring failed:', err instanceof Error ? err.message : String(err));
        return null;
      });
      if (scoring === null) return false;

      const pass = shouldReplyBasedOnScore(scoring, config.behavior.replyScoreThreshold);
      console.log(`📊 Score: ${scoring.score}/10 | Pass: ${pass} | ${scoring.reason}`);
      return pass;
    })();
  }
  if (!shouldReply) return;

  // 7. Retrieve relevant past messages from vector store
  //    Use the recent chat as the semantic query to find topically relevant history
  const retrievedContext = await retrieveContext(
    channelId,
    narrowRagQuery(recentHistory, { excludeAuthor: config.bot.name, limit: 6 })
  );
  // if (retrievedContext.length > 0) {
  console.log(`🔍 Retrieved ${retrievedContext.length} relevant past messages`);
  // }

  // 8. Generate reply and show typing indicator concurrently.
  //    sendTyping() expires after 10s, so we pulse it every 8s until the
  //    model finishes. This way the user sees "Alex is typing..." the whole
  //    time without any extra wait after the reply is ready.
  let typingTimer: ReturnType<typeof setInterval> | undefined = undefined;

  async function startTyping(): Promise<void> {
    try {
      await message.channel.sendTyping();
      typingTimer = setInterval(async () => {
        try {
          await message.channel.sendTyping();
        } catch {
          /* ignore */
        }
      }, 8000);
    } catch {
      // Missing Send Typing permission — not fatal
    }
  }

  function stopTyping(): void {
    clearInterval(typingTimer);
  }

  let rawReply: string | undefined = undefined;
  try {
    const [, generatedReply] = await Promise.all([startTyping(), generateReply(recentHistory, retrievedContext)]);
    rawReply = generatedReply;
  } catch (error) {
    logError(error, 'Reply generation failed:');

    stopTyping();
    return;
  }

  stopTyping();
  if (!rawReply) return;

  // 9a. Run the deterministic editor (strips AI tells, rejects dupes/banned
  //     openers). On rejection, regenerate ONCE with a stricter directive.
  let edited = await applyReplyEditor(rawReply, channelId);
  if (!edited.accepted) {
    console.log(`🧹 Editor rejected: ${edited.reason}. Regenerating.`);
    const stricterHint = `\n[IMPORTANT: do NOT start with "Absolutely", "Great", "Sure,", or "I ". Do NOT wrap in quotes or markdown. Keep it under 280 chars.]`;
    try {
      const retry = await generateReply(recentHistory + stricterHint, retrievedContext);
      edited = await applyReplyEditor(retry, channelId);
    } catch (error) {
      logError(error, 'Regeneration failed:');
      return;
    }
    if (!edited.accepted) {
      console.log(`🧹 Editor rejected regen too: ${edited.reason}. Staying silent.`);
      return;
    }
  }
  // edited.accepted === true here — discriminated union narrows edited.text to string
  if (!edited.accepted) return;
  const reply = edited.text;

  // 9b. Send and record.
  try {
    await message.reply(reply);
    setLastReplyTime(channelId);
    // console.log('OLLAMA: ' + reply);

    // Add own reply to the in-memory buffer
    addMessage(channelId, config.bot.name, reply);

    // Record for next-call dedupe (per-channel ring buffer).
    await addBotOutput(channelId, reply);

    // And index own reply in the vector store
    void (async (): Promise<void> => {
      const botTags = await tagMessage(reply).catch(() => [] as readonly string[]);
      await storeMessage({
        id: `bot_${Date.now()}`,
        author: config.bot.name,
        content: reply,
        channelId,
        timestamp: new Date(),
        tags: botTags
      });
    })();

    console.log(`✅ Sent: "${reply}"`);
  } catch (error) {
    logError(error, 'Failed to send');
  }
}
