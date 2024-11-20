process.on('warning', (error: Readonly<Error>) => {
  console.log(error.stack);
});

import dotenv from 'dotenv';
import { scheduleJob } from 'node-schedule';

import type { JWTInput } from 'google-auth-library';
import OpenAI from 'openai';
import { Client } from 'discord.js';

import { createFileEmoteDbConnection } from './api/filedb.js';
import { createTwitchApi } from './api/twitch.js';
import { createBot } from './bot.js';

import type {
  ReadOnlyFileEmoteDb,
  ReadonlyOpenAI,
  ReadOnlyTwitchGlobalHandler,
  EmoteEndpoints,
  ReadonlyBot
} from './types.js';
import { v2 } from '@google-cloud/translate';

//dotenv
dotenv.config();
const DISCORD_TOKEN: string | undefined = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY: string | undefined = process.env.OPENAI_API_KEY;
const CREDENTIALS: string | undefined = process.env.CREDENTIALS;
const TWITCH_CLIENT_ID: string | undefined = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET: string | undefined = process.env.TWITCH_SECRET;

const FILE_ENDPOINTS = {
  sevenNotInSetEmotes: 'data/sevenNotInSetEmotes.json'
};

// emotes
const EMOTE_ENDPOINTS: EmoteEndpoints = {
  sevenPersonal: 'https://7tv.io/v3/emote-sets/01FDMJPSF8000CJ4MDR2FNZEQ3',
  sevenGlobal: 'https://7tv.io/v3/emote-sets/global',
  sevenEmotesNotInSet: 'https://7tv.io/v3/emotes',
  bttvPersonal: 'https://api.betterttv.net/3/users/5809977263c97c037fc9e66c',
  bttvGlobal: 'https://api.betterttv.net/3/cached/emotes/global',
  ffzPersonal: 'https://api.frankerfacez.com/v1/room/cutedog_',
  ffzGlobal: 'https://api.frankerfacez.com/v1/set/global',
  twitchGlobal: 'https://api.twitch.tv/helix/chat/emotes/global'
};

const bot: ReadonlyBot = await (async function (): Promise<ReadonlyBot> {
  const discord: Client = new Client({ intents: [] });

  const openai: ReadonlyOpenAI | undefined =
    OPENAI_API_KEY !== undefined ? (new OpenAI({ apiKey: OPENAI_API_KEY }) as ReadonlyOpenAI) : undefined;

  const translate: v2.Translate | undefined = await (async function (): Promise<v2.Translate | undefined> {
    const jsonCredentials =
      CREDENTIALS !== undefined ? ((await JSON.parse(CREDENTIALS)) as Readonly<JWTInput>) : undefined;
    return jsonCredentials
      ? new v2.Translate({
          credentials: jsonCredentials,
          projectId: jsonCredentials.project_id
        })
      : undefined;
  })();

  const twitch: ReadOnlyTwitchGlobalHandler | undefined =
    TWITCH_CLIENT_ID !== undefined && TWITCH_SECRET !== undefined
      ? await createTwitchApi(TWITCH_CLIENT_ID, TWITCH_SECRET)
      : undefined;

  const db: ReadOnlyFileEmoteDb = await createFileEmoteDbConnection(FILE_ENDPOINTS.sevenNotInSetEmotes);

  return await createBot(EMOTE_ENDPOINTS, discord, openai, translate, twitch, db);
})();

// update every 5 minutes
scheduleJob('*/5 * * * *', async () => {
  console.log('Emote cache refreshing');
  await bot.refreshEmotes().catch((error: unknown) => {
    console.log(`refreshEmotes() failed, emotes might be stale: ${error instanceof Error ? error : 'error'}`);
  });
});

// update every 60 minutes
if (bot.twitch) {
  scheduleJob('*/60 * * * *', async () => {
    await bot.validateTwitch();
  });
}

bot.registerHandlers();
await bot.start(DISCORD_TOKEN);
