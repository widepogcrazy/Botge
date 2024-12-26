process.on('warning', (error: Readonly<Error>) => {
  console.log(error.stack);
});

import dotenv from 'dotenv';
import { scheduleJob } from 'node-schedule';
import { ensureDirSync, type Dirent } from 'fs-extra';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { v2 } from '@google-cloud/translate';
import type { JWTInput } from 'google-auth-library';
import OpenAI from 'openai';
import { Client } from 'discord.js';

import type { ReadonlyOpenAI } from './types.js';
import { Bot } from './bot.js';
import { Guild, GUILD_ID_CUTEDOG, GUILD_ID_ELLY, BROADCASTER_NAME_CUTEDOG, BROADCASTER_NAME_ELLY } from './guild.js';
import {
  DATABASE_DIR,
  DATABASE_ENDPOINTS,
  PersonalEmoteEndpointsCutedog,
  PersonalEmoteEndpointsElly,
  TMP_DIR
} from './paths-and-endpoints.js';
import { TwitchClipsMeiliSearch } from './twitch-clips-meili-search.js';
import { createTwitchApi } from './api/twitch-api.js';
import { CachedUrl } from './api/cached-url.js';
import { AddedEmotesDatabase } from './api/database/added-emotes-database.js';
import MeiliSearch from 'meilisearch';
import { newEmoteMatcher } from './utils/constructors/new-emote-matcher.js';

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

ensureDirSync(TMP_DIR);
ensureDirSync(DATABASE_DIR);
(await readdir(TMP_DIR, { withFileTypes: true }))
  .filter((dirent: Readonly<Dirent>) => dirent.isDirectory())
  .map((dirent: Readonly<Dirent>) => dirent.name)
  .forEach((dir) => void rm(join(TMP_DIR, dir), { recursive: true }));

const bot = await (async (): Promise<Readonly<Bot>> => {
  const client: Client = new Client({ intents: [] });

  const openai: ReadonlyOpenAI | undefined =
    OPENAI_API_KEY !== undefined ? new OpenAI({ apiKey: OPENAI_API_KEY }) : undefined;

  const translate = await (async (): Promise<v2.Translate | undefined> => {
    const jsonCredentials =
      CREDENTIALS !== undefined ? ((await JSON.parse(CREDENTIALS)) as Readonly<JWTInput>) : undefined;

    return jsonCredentials
      ? new v2.Translate({
          credentials: jsonCredentials,
          projectId: jsonCredentials.project_id
        })
      : undefined;
  })();

  const twitchApi =
    TWITCH_CLIENT_ID !== undefined && TWITCH_SECRET !== undefined
      ? await createTwitchApi(TWITCH_CLIENT_ID, TWITCH_SECRET)
      : undefined;

  const twitchClipsMeiliSearch: Readonly<TwitchClipsMeiliSearch> | undefined =
    MEILISEARCH_HOST !== undefined && MEILISEARCH_API_KEY !== undefined
      ? new TwitchClipsMeiliSearch(new MeiliSearch({ host: MEILISEARCH_HOST, apiKey: MEILISEARCH_API_KEY }))
      : undefined;

  const addedEmotesDatabase: Readonly<AddedEmotesDatabase> = new AddedEmotesDatabase(DATABASE_ENDPOINTS.addedEmotes);

  const cachedUrl: Readonly<CachedUrl> = new CachedUrl(LOCAL_CACHE_BASE);

  const guilds: readonly Readonly<Guild>[] = [
    new Guild(
      GUILD_ID_CUTEDOG,
      BROADCASTER_NAME_CUTEDOG,
      PersonalEmoteEndpointsCutedog,
      await newEmoteMatcher(GUILD_ID_CUTEDOG, PersonalEmoteEndpointsCutedog, twitchApi, addedEmotesDatabase),
      await twitchClipsMeiliSearch?.getOrCreateIndex(GUILD_ID_CUTEDOG)
    ),
    new Guild(
      GUILD_ID_ELLY,
      BROADCASTER_NAME_ELLY,
      PersonalEmoteEndpointsElly,
      await newEmoteMatcher(GUILD_ID_ELLY, PersonalEmoteEndpointsElly, twitchApi, addedEmotesDatabase),
      await twitchClipsMeiliSearch?.getOrCreateIndex(GUILD_ID_ELLY)
    )
  ];

  return new Bot(client, openai, translate, twitchApi, addedEmotesDatabase, cachedUrl, guilds);
})();

process.on('exit', (): void => {
  console.log('exiting');
  bot.closeDatabase();
  process.exit(0);
});

process.on('SIGINT', (): void => {
  console.log('received SIGINT');
  bot.closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', (): void => {
  console.log('received SIGTERM');
  bot.closeDatabase();
  process.exit(0);
});

process.on('uncaughtException', (err: Readonly<Error>): void => {
  console.log(`uncaughtException: ${err instanceof Error ? err : 'error'}`);
  bot.closeDatabase();
  process.exit(1);
});

process.on('unhandledRejection', (err): void => {
  console.log(`unhandledRejection: ${err instanceof Error ? err : 'error'}`);
  bot.closeDatabase();
  process.exit(1);
});

// update every 5th minute of an hour
scheduleJob('*/5 * * * *', () => {
  console.log('Emote cache refreshing');
  try {
    bot.refreshEmotes();
  } catch (error: unknown) {
    console.log(`refreshEmotes() failed, emotes might be stale: ${error instanceof Error ? error : 'error'}`);
  }
});

// update every 60th minute of an hour
scheduleJob('*/60 * * * *', () => {
  bot.validateTwitchAccessToken();
  bot.refreshClips();
});

bot.registerHandlers();
await bot.start(DISCORD_TOKEN);
