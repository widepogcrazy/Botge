/** @format */

import type { OmitPartialGroupDMChannel, Message } from 'discord.js';
import { config } from '../config.js';
import { addMessage, getFormattedHistory, getBufferSize } from '../utils/messageBuffer.js';
import { scoreReplyOpportunity, generateReply } from '../api/ollama.js';
import { storeMessage, findSimilarWithContext } from '../api/vectorStore.js';

const lastReplyTime = new Map<string, number>();

function isOnCooldown(channelId: string): boolean {
  const last = lastReplyTime.get(channelId) ?? 0;
  return (Date.now() - last) / 1000 < config.behavior.cooldownSeconds;
}

function setLastReplyTime(channelId: string): void {
  lastReplyTime.set(channelId, Date.now());
}

async function persistToVectorStore(
  message: Readonly<OmitPartialGroupDMChannel<Message>>,
  author: string
): Promise<void> {
  try {
    await storeMessage({
      id: message.id,
      author,
      content: message.content,
      channelId: message.channel.id,
      timestamp: message.createdAt
    });
  } catch (err) {
    console.warn('⚠️  Vector store write failed:', err instanceof Error ? err.message : String(err));
  }
}

async function retrieveContext(channelId: string, recentHistory: string): Promise<string[]> {
  try {
    return await findSimilarWithContext(
      recentHistory,
      channelId,
      config.behavior.ragResults,
      config.behavior.ragWindowSize
    );
  } catch (err) {
    console.warn('⚠️  Vector store query failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

export async function ollamaMessageCreateHandler(message: Readonly<OmitPartialGroupDMChannel<Message>>): Promise<void> {
  if (!config.activeChatChannels.includes(message.channel.id)) return;

  const channelId = message.channel.id;
  const author = message.member?.displayName ?? message.author.username;
  const content = message.content.trim();

  if (!content) return;

  // console.log('got message: ' + channelId + ' ' + content);

  // 1. Add to in-memory rolling buffer (fast, synchronous)
  addMessage(channelId, author, content);

  // 2. Persist to vector store in the background (async, non-blocking)
  //    This ensures all messages are indexed even when the bot doesn't reply
  void persistToVectorStore(message, author);

  // 3. Need a few messages of context before chiming in
  if (getBufferSize(channelId) < 3) return;

  // 4. Check per-channel cooldown
  if (isOnCooldown(channelId)) return;
  setLastReplyTime(channelId);

  // 5. Random gate — skip most messages to avoid being annoying
  if (Math.random() > config.behavior.evaluationChance) return;

  // 6. Score the opportunity using the recent buffer
  const recentHistory = getFormattedHistory(channelId);
  const channelName = 'name' in message.channel ? message.channel.name : channelId;
  console.log(`🎲 Evaluating reply in #${channelName}...`);

  const scoring = await scoreReplyOpportunity(recentHistory).catch((err: unknown) => {
    console.error('❌ Scoring failed:', err instanceof Error ? err.message : String(err));
    return null;
  });
  if (scoring === null) return;

  console.log(`📊 Score: ${scoring.score}/10 | Reply: ${scoring.shouldReply} | ${scoring.reason}`);

  if (!scoring.shouldReply) return;
  if (scoring.score < config.behavior.replyScoreThreshold) return;

  // 7. Retrieve relevant past messages from vector store
  //    Use the recent chat as the semantic query to find topically relevant history
  const retrievedContext = await retrieveContext(channelId, recentHistory);
  // if (retrievedContext.length > 0) {
  console.log(`🔍 Retrieved ${retrievedContext.length} relevant past messages`);
  // }

  // 8. Generate reply and show typing indicator concurrently.
  //    sendTyping() expires after 10s, so we pulse it every 8s until the
  //    model finishes. This way the user sees "Alex is typing..." the whole
  //    time without any extra wait after the reply is ready.
  let reply: string | undefined = undefined;
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

  try {
    const [, generatedReply] = await Promise.all([startTyping(), generateReply(recentHistory, retrievedContext)]);
    reply = generatedReply;
  } catch (err) {
    console.error('❌ Reply generation failed:', err instanceof Error ? err.message : String(err));
    stopTyping();
    return;
  }

  stopTyping();

  if (!reply) return;

  // 9. Send the message and persist it too
  try {
    await message.reply(reply);
    // console.log('OLLAMA: ' + reply);

    // Add own reply to the in-memory buffer
    addMessage(channelId, config.bot.name, reply);

    // And index own reply in the vector store
    void storeMessage({
      id: `bot_${Date.now()}`,
      author: config.bot.name,
      content: reply,
      channelId,
      timestamp: new Date()
    });

    console.log(`✅ Sent: "${reply}"`);
  } catch (err) {
    console.error('❌ Failed to send:', err instanceof Error ? err.message : String(err));
  }
}
