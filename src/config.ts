/** @format */

function required(key: string): string | never {
  const val: string | undefined = process.env[key];
  if (val === undefined) throw new Error(`Missing required env variable: ${key}`);
  return val;
}

function optional(key: string, defaultVal: string): string {
  return process.env[key] ?? defaultVal;
}

export type Config = {
  discord: { token: string };
  bot: { name: string };
  ollama: { baseUrl: string; model: string; embeddingModel: string };
  chroma: { url: string };
  behavior: {
    replyScoreThreshold: number;
    contextWindow: number;
    evaluationChance: number;
    cooldownSeconds: number;
    ragResults: number;
    ragWindowSize: number;
  };
  activeChatChannels: string[];
};

export const config: Config = {
  discord: {
    token: required('DISCORD_TOKEN')
  },
  bot: {
    name: optional('BOT_NAME', 'Botge')
  },
  ollama: {
    baseUrl: optional('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: optional('OLLAMA_MODEL', 'gemma4:26b'),
    // Embedding model is versioned separately from the chat model.
    // Changing this requires re-running: node backfill.js reset <channelId>
    embeddingModel: optional('EMBEDDING_MODEL', 'nomic-embed-text')
  },
  chroma: {
    url: optional('CHROMA_URL', 'http://chromadb:8000')
  },
  behavior: {
    replyScoreThreshold: Number(optional('REPLY_SCORE_THRESHOLD', '2')),
    contextWindow: Number(optional('CONTEXT_WINDOW', '30')),
    evaluationChance: Number(optional('EVALUATION_CHANCE', '0.8')),
    cooldownSeconds: Number(optional('COOLDOWN_SECONDS', '60')),
    ragResults: Number(optional('RAG_RESULTS', '5')),
    // Messages to include before and after each semantic hit
    ragWindowSize: Number(optional('RAG_WINDOW_SIZE', '2'))
  },
  // activeChatChannels: []
  activeChatChannels: ['251211223012474880']
};
