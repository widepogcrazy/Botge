process.on('warning', (error: Readonly<Error>) => {
  console.log(error.stack);
});

import dotenv from 'dotenv';
import { scheduleJob } from 'node-schedule';
import { ensureDirSync } from 'fs-extra';

import type { JWTInput } from 'google-auth-library';
import OpenAI from 'openai';
import { Client } from 'discord.js';

import { AddedEmotesDatabase } from './api/added-emote-database.js';
import { createTwitchApi, type TwitchGlobalHandler } from './api/twitch.js';
import { createBot, type Bot } from './bot.js';

import type { ReadonlyOpenAI, EmoteEndpoints, AddedEmote } from './types.js';
import { v2 } from '@google-cloud/translate';
import { fetchAndJson } from './utils/fetchAndJson.js';
import { TwitchClipsDatabase } from './api/twitch-clips-database.js';
import { createFileEmoteDbConnection, type FileEmoteDb } from './api/filedb.js';

//dotenv
dotenv.config();
const DISCORD_TOKEN: string | undefined = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY: string | undefined = process.env.OPENAI_API_KEY;
const CREDENTIALS: string | undefined = process.env.CREDENTIALS;
const TWITCH_CLIENT_ID: string | undefined = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET: string | undefined = process.env.TWITCH_SECRET;

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

const RANDOMCLIPS =
  'https://raw.githubusercontent.com/TimotronPrime/timotronprime.github.io/refs/heads/main/cutedog_/randomclips.json';

async function getClipIds(url: string): Promise<readonly string[]> {
  const clips = (await fetchAndJson(url)) as readonly string[];
  const clipIds = clips
    .map((clipId) => clipId.split(' ').at(0)?.split('/').at(-1))
    .filter((clipId) => clipId !== undefined);
  return clipIds;
}

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

  const twitchGlobalHander: Readonly<TwitchGlobalHandler> | undefined =
    TWITCH_CLIENT_ID !== undefined && TWITCH_SECRET !== undefined
      ? await createTwitchApi(TWITCH_CLIENT_ID, TWITCH_SECRET)
      : undefined;

  //MIGRATE CURRENT DATA - WILL REMOVE LATER
  const fileEmoteDb: Readonly<FileEmoteDb> = await createFileEmoteDbConnection(DATABASE_ENDPOINTS.sevenNotInSetEmotes);
  const addedEmotesDatabase: Readonly<AddedEmotesDatabase> = new AddedEmotesDatabase(DATABASE_ENDPOINTS.addedEmotes);
  const twitchClipsDatabase: Readonly<TwitchClipsDatabase> = new TwitchClipsDatabase(DATABASE_ENDPOINTS.twitchClips);
  fileEmoteDb
    .getAll()
    .map((stringge) => ({ url: stringge }) as AddedEmote)
    .forEach((addedEmote) => {
      addedEmotesDatabase.insert(addedEmote);
    });

  const clipsIds = await getClipIds(RANDOMCLIPS);

  return await createBot(
    EMOTE_ENDPOINTS,
    client,
    openai,
    translate,
    twitchGlobalHander,
    addedEmotesDatabase,
    twitchClipsDatabase,
    undefined,
    clipsIds
  );
})();

function closeDatabases(): void {
  try {
    bot.addedEmotesDatabase.close();
    bot.twitchClipsDatabase.close();
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
if (bot.twitchGlobalHander) {
  scheduleJob('*/60 * * * *', async () => {
    await bot.validateTwitch();
  });

  scheduleJob('*/60 * * * *', async () => {
    await bot.refreshClips();
  });
}

await bot.refreshClips();
bot.registerHandlers();
await bot.start(DISCORD_TOKEN);
