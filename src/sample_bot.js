import { Client, GatewayIntentBits, Partials, ActivityType } from 'discord.js';
import { config } from './config.js';
import { addMessage, getFormattedHistory, getBufferSize } from './messageBuffer.js';
import { scoreReplyOpportunity, generateReply } from './ollama.js';
import { storeMessage, findSimilarWithContext, activeCollectionName } from './vectorStore.js';

// ─── Discord client ───────────────────────────────────────────────────────────

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Message, Partials.Channel]
});

// ─── State ────────────────────────────────────────────────────────────────────

const lastReplyTime = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOnCooldown(channelId) {
  const last = lastReplyTime.get(channelId) ?? 0;
  return (Date.now() - last) / 1000 < config.behavior.cooldownSeconds;
}

function setLastReplyTime(channelId) {
  lastReplyTime.set(channelId, Date.now());
}

function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((r) => setTimeout(r, ms));
}

function isMentioned(message) {
  return message.mentions.has(client.user);
}

// ─── Vector store ─────────────────────────────────────────────────────────────

/**
 * Persist an incoming message to the vector store (non-fatal).
 * Runs in the background — we don't await it in the hot path.
 */
async function persistToVectorStore(message, author) {
  try {
    await storeMessage({
      id: message.id,
      author,
      content: message.content,
      channelId: message.channel.id,
      timestamp: message.createdAt
    });
  } catch (err) {
    // Vector store being down should never crash the bot
    console.warn('⚠️  Vector store write failed:', err.message);
  }
}

/**
 * Retrieve semantically relevant past messages for the current conversation.
 * Falls back to empty array if vector store is unavailable.
 */
async function retrieveContext(channelId, recentHistory) {
  try {
    return await findSimilarWithContext(
      recentHistory,
      channelId,
      config.behavior.ragResults, // number of semantic hits
      config.behavior.ragWindowSize // messages to expand on each side
    );
  } catch (err) {
    console.warn('⚠️  Vector store query failed:', err.message);
    return [];
  }
}

// ─── Core logic ───────────────────────────────────────────────────────────────

async function handleMessage(message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  const channelId = message.channel.id;
  const author = message.member?.displayName ?? message.author.username;
  const content = message.content.trim();

  if (!content) return;

  // 1. Add to in-memory rolling buffer (fast, synchronous)
  addMessage(channelId, author, content);

  // 2. Persist to vector store in the background (async, non-blocking)
  //    This ensures all messages are indexed even when the bot doesn't reply
  persistToVectorStore(message, author);

  // 3. Need a few messages of context before chiming in
  if (getBufferSize(channelId) < 3) return;

  // 4. Check per-channel cooldown
  if (isOnCooldown(channelId) && !isMentioned(message)) return;

  // 5. Random gate — skip most messages to avoid being annoying
  if (!isMentioned(message) && Math.random() > config.behavior.evaluationChance) return;

  // 6. Score the opportunity using the recent buffer
  const recentHistory = getFormattedHistory(channelId);
  console.log(`🎲 Evaluating reply in #${message.channel.name}...`);

  let scoring;
  try {
    scoring = await scoreReplyOpportunity(recentHistory);
  } catch (err) {
    console.error('❌ Scoring failed:', err.message);
    return;
  }

  console.log(`📊 Score: ${scoring.score}/10 | Reply: ${scoring.shouldReply} | ${scoring.reason}`);

  if (!isMentioned(message) && !scoring.shouldReply) return;
  if (!isMentioned(message) && scoring.score < config.behavior.replyScoreThreshold) return;

  // 7. Retrieve relevant past messages from vector store
  //    Use the recent chat as the semantic query to find topically relevant history
  const retrievedContext = await retrieveContext(channelId, recentHistory);
  if (retrievedContext.length > 0) {
    console.log(`🔍 Retrieved ${retrievedContext.length} relevant past messages`);
  }

  // 8. Generate reply and show typing indicator concurrently.
  //    sendTyping() expires after 10s, so we pulse it every 8s until the
  //    model finishes. This way the user sees "Alex is typing..." the whole
  //    time without any extra wait after the reply is ready.
  let reply;
  let typingTimer;

  async function startTyping() {
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

  function stopTyping() {
    clearInterval(typingTimer);
  }

  try {
    // Kick off both at the same time
    const [, generatedReply] = await Promise.all([startTyping(), generateReply(recentHistory, retrievedContext)]);
    reply = generatedReply;
  } catch (err) {
    console.error('❌ Reply generation failed:', err.message);
    stopTyping();
    return;
  }

  stopTyping();

  if (!reply) return;

  // 9. Brief human-paced pause before sending (feels less instant/robotic).
  //    The model latency already covers most of the "thinking" time, so we
  //    only add a small random remainder here.
  await randomDelay(400, 1200);

  // 10. Send the message and persist it too
  try {
    await message.channel.send(reply);
    setLastReplyTime(channelId);

    // Add own reply to the in-memory buffer
    addMessage(channelId, config.bot.name, reply);

    // And index own reply in the vector store
    persistToVectorStore(
      { id: `bot_${Date.now()}`, content: reply, createdAt: new Date(), channel: message.channel },
      config.bot.name
    );

    console.log(`✅ Sent: "${reply}"`);
  } catch (err) {
    console.error('❌ Failed to send:', err.message);
  }
}

// ─── Discord events ───────────────────────────────────────────────────────────

client.once('ready', () => {
  console.log(`\n✅ Logged in as ${client.user.tag}`);
  console.log(`🤖 Persona         : ${config.bot.name}`);
  console.log(`🧠 Chat model      : ${config.ollama.model}`);
  console.log(`🔢 Embedding model : ${config.ollama.embeddingModel}`);
  console.log(`📦 Collection      : ${activeCollectionName()}`);
  console.log(`⚙️  Threshold       : ${config.behavior.replyScoreThreshold}/10`);
  console.log(`🎲 Eval chance     : ${config.behavior.evaluationChance * 100}%`);
  console.log(`⏱️  Cooldown        : ${config.behavior.cooldownSeconds}s\n`);

  client.user.setActivity('the chat', { type: ActivityType.Watching });
});

client.on('messageCreate', (message) => {
  handleMessage(message).catch((err) => console.error('Unhandled error:', err));
});

client.on('error', (err) => console.error('Discord client error:', err));

client.login(config.discord.token);
