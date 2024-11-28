process.on('warning', (error: Readonly<Error>) => {
  console.log(error.stack);
});

import dotenv from 'dotenv';
import { scheduleJob } from 'node-schedule';
import { ensureDirSync } from 'fs-extra';

import type { JWTInput } from 'google-auth-library';
import OpenAI from 'openai';
import { Client } from 'discord.js';
import { MeiliSearch, type Index } from 'meilisearch';

import { AddedEmotesDatabase } from './api/added-emote-database.js';
import { createTwitchApi, type TwitchApi } from './api/twitch.js';
import { createBot, type Bot } from './bot.js';

import type { ReadonlyOpenAI, EmoteEndpoints } from './types.js';
import { v2 } from '@google-cloud/translate';
import { CachedUrl } from './api/cached-url.js';

import { listClipIds } from './api/list-clips.js';

//dotenv
dotenv.config();
const DISCORD_TOKEN: string | undefined = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY: string | undefined = process.env.OPENAI_API_KEY;
const CREDENTIALS: string | undefined = process.env.CREDENTIALS;
const TWITCH_CLIENT_ID: string | undefined = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET: string | undefined = process.env.TWITCH_SECRET;
const MEILISEARCH_HOST: string | undefined = process.env.MEILISEARCH_HOST;
const MEILISEARCH_API_KEY: string | undefined = process.env.MEILISEARCH_API_KEY;
const LOCAL_CACHE_BASE: string | undefined = process.env.LOCAL_CACHE_BASE;

const DATABASEDIR = 'data';

const DATABASE_ENDPOINTS = {
  sevenNotInSetEmotes: `${DATABASEDIR}/sevenNotInSetEmotes.json`,
  addedEmotes: `${DATABASEDIR}/addedEmotes.sqlite`,
  twitchClips: `${DATABASEDIR}/twitchClips.sqlite`
};

// emotes
const EMOTE_ENDPOINTS: Readonly<EmoteEndpoints> = {
  sevenPersonal: 'https://7tv.io/v3/emote-sets/01FDMJPSF8000CJ4MDR2FNZEQ3',
  sevenGlobal: 'https://7tv.io/v3/emote-sets/global',
  sevenEmotesNotInSet: 'https://7tv.io/v3/emotes',
  bttvPersonal: 'https://api.betterttv.net/3/users/5809977263c97c037fc9e66c',
  bttvGlobal: 'https://api.betterttv.net/3/cached/emotes/global',
  ffzPersonal: 'https://api.frankerfacez.com/v1/room/cutedog_',
  ffzGlobal: 'https://api.frankerfacez.com/v1/set/global',
  twitchGlobal: 'https://api.twitch.tv/helix/chat/emotes/global'
};

const bot = await (async (): Promise<Readonly<Bot>> => {
  ensureDirSync(DATABASEDIR);

  const client: Client = new Client({ intents: [] });

  const openai: ReadonlyOpenAI | undefined =
    OPENAI_API_KEY !== undefined ? new OpenAI({ apiKey: OPENAI_API_KEY }) : undefined;

  const translate: v2.Translate | undefined = await (async (): Promise<v2.Translate | undefined> => {
    const jsonCredentials =
      CREDENTIALS !== undefined ? ((await JSON.parse(CREDENTIALS)) as Readonly<JWTInput>) : undefined;

    return jsonCredentials
      ? new v2.Translate({
          credentials: jsonCredentials,
          projectId: jsonCredentials.project_id
        })
      : undefined;
  })();

  const cachedUrl: Readonly<CachedUrl> = new CachedUrl(LOCAL_CACHE_BASE);

  const twitchApi =
    TWITCH_CLIENT_ID !== undefined && TWITCH_SECRET !== undefined
      ? await createTwitchApi(TWITCH_CLIENT_ID, TWITCH_SECRET)
      : undefined;

  const addedEmotesDatabase: Readonly<AddedEmotesDatabase> = new AddedEmotesDatabase(DATABASE_ENDPOINTS.addedEmotes);

  const meiliSearch: Readonly<MeiliSearch> | undefined =
    MEILISEARCH_HOST !== undefined && MEILISEARCH_API_KEY !== undefined
      ? new MeiliSearch({
          host: MEILISEARCH_HOST,
          apiKey: MEILISEARCH_API_KEY
        })
      : undefined;

  if (meiliSearch !== undefined) await meiliSearch.createIndex('twitchClips', { primaryKey: 'id' });
  const twitchClipsMeiliSearchIndex: Index | undefined =
    meiliSearch !== undefined ? await meiliSearch.getIndex('twitchClips') : undefined;

  const clipsIds = await listClipIds();

  return await createBot(
    EMOTE_ENDPOINTS,
    client,
    addedEmotesDatabase,
    cachedUrl,
    twitchClipsMeiliSearchIndex,
    twitchApi,
    openai,
    translate,
    clipsIds
  );
})();

function closeDatabases(): void {
  try {
    bot.addedEmotesDatabase.close();
  } catch (err) {
    console.log(`Error at closeDatabases: ${err instanceof Error ? err : 'error'}`);
  }
}

process.on('exit', (): void => {
  console.log('exiting');
  closeDatabases();
  process.exit(0);
});

process.on('SIGINT', (): void => {
  console.log('received SIGINT');
  closeDatabases();
  process.exit(0);
});

process.on('SIGTERM', (): void => {
  console.log('received SIGTERM');
  closeDatabases();
  process.exit(0);
});

process.on('uncaughtException', (err: Readonly<Error>): void => {
  console.log(`uncaughtException: ${err instanceof Error ? err : 'error'}`);
  closeDatabases();
  process.exit(1);
});

process.on('unhandledRejection', (err): void => {
  console.log(`unhandledRejection: ${err instanceof Error ? err : 'error'}`);
  closeDatabases();
  process.exit(1);
});

// update every 5 minutes
scheduleJob('*/5 * * * *', async () => {
  console.log('Emote cache refreshing');
  await bot.refreshEmotes().catch((error: unknown) => {
    console.log(`refreshEmotes() failed, emotes might be stale: ${error instanceof Error ? error : 'error'}`);
  });
});

// update every 60 minutes
if (bot.twitchApi) {
  scheduleJob('*/60 * * * *', async () => {
    await bot.twitchApi?.validateAccessToken();
  });

  scheduleJob('*/60 * * * *', async () => {
    await bot.refreshClips();
  });
}

await bot.refreshClips();
bot.registerHandlers();
await bot.start(DISCORD_TOKEN);
