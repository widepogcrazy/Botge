process.on('warning', (error: Readonly<Error>) => {
  console.log(error.stack);

  //discordjs problem. restart as the bot is not functional after we receive this error
  if (error.name === 'TimeoutNegativeWarning') process.exit(1);
});

import dotenv from 'dotenv';
import { scheduleJob } from 'node-schedule';
import { ensureDir, type Dirent } from 'fs-extra';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

//import { v2 } from '@google-cloud/translate';
//import type { JWTInput } from 'google-auth-library';
import OpenAI from 'openai';
import { Client } from 'discord.js';
import MeiliSearch from 'meilisearch';

import type { ReadonlyOpenAI } from './types.js';
import { Bot } from './bot.js';
import {
  GUILD_ID_CUTEDOG,
  GUILD_ID_ELLY,
  BROADCASTER_NAME_CUTEDOG,
  BROADCASTER_NAME_ELLY,
  type Guild
} from './guild.js';
import { DATABASE_DIR, DATABASE_ENDPOINTS, PERSONAL_EMOTE_ENDPOINTS, TMP_DIR } from './paths-and-endpoints.js';
import { TwitchClipsMeiliSearch } from './twitch-clips-meili-search.js';
import { GlobalEmoteMatcherConstructor, PersonalEmoteMatcherConstructor } from './emote-matcher-constructor.js';
import { CachedUrl } from './api/cached-url.js';
import { AddedEmotesDatabase } from './api/added-emotes-database.js';
import { newGuild } from './utils/constructors/new-guild.js';
import { newTwitchApi } from './utils/constructors/new-twitch-api.js';
import { promises } from 'node:dns';
import { updateCommands } from './update-commands-docker.js';

//dotenv
dotenv.config();
const DISCORD_TOKEN: string | undefined = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY: string | undefined = process.env.OPENAI_API_KEY;
//const CREDENTIALS: string | undefined = process.env.CREDENTIALS;
const TWITCH_CLIENT_ID: string | undefined = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET: string | undefined = process.env.TWITCH_SECRET;
const MEILISEARCH_HOST: string | undefined = process.env.MEILISEARCH_HOST;
const MEILISEARCH_API_KEY: string | undefined = process.env.MEILISEARCH_API_KEY;
const LOCAL_CACHE_BASE: string | undefined = process.env.LOCAL_CACHE_BASE;

async function ensureDirTmp(): Promise<void> {
  await ensureDir(TMP_DIR);
  //delete everything in the tmp directory, if temp files got stuck. but not the tmp directory itself
  (await readdir(TMP_DIR, { withFileTypes: true }))
    .filter((dirent: Readonly<Dirent>) => dirent.isDirectory())
    .map((dirent: Readonly<Dirent>) => dirent.name)
    .forEach((dir) => void rm(join(TMP_DIR, dir), { recursive: true }));
}

const ensureDirTmp_ = ensureDirTmp();
await ensureDir(DATABASE_DIR);

const commandUpdate = (async function (): Promise<void> {
  if (process.argv.length < 3) {
    console.log('No commands lock file provided, skipping commands update.');
    return;
  }

  await updateCommands(process.argv[2]);
})();

const bot = await (async (): Promise<Readonly<Bot>> => {
  const client: Client = new Client({ intents: [] });

  const openai: ReadonlyOpenAI | undefined =
    OPENAI_API_KEY !== undefined ? new OpenAI({ apiKey: OPENAI_API_KEY }) : undefined;

  //translate currently not working
  /*
  const translate = (async (): Promise<v2.Translate | undefined> => {
    const jsonCredentials =
      CREDENTIALS !== undefined ? ((await JSON.parse(CREDENTIALS)) as Readonly<JWTInput>) : undefined;

    return jsonCredentials
      ? new v2.Translate({
          credentials: jsonCredentials,
          projectId: jsonCredentials.project_id
        })
      : undefined;
  })();
  */

  const twitchApi =
    TWITCH_CLIENT_ID !== undefined && TWITCH_SECRET !== undefined
      ? newTwitchApi(TWITCH_CLIENT_ID, TWITCH_SECRET)
      : undefined;

  const twitchClipsMeiliSearch: Readonly<TwitchClipsMeiliSearch> | undefined =
    MEILISEARCH_HOST !== undefined && MEILISEARCH_API_KEY !== undefined
      ? new TwitchClipsMeiliSearch(new MeiliSearch({ host: MEILISEARCH_HOST, apiKey: MEILISEARCH_API_KEY }))
      : undefined;

  //delete old index if it exists
  twitchClipsMeiliSearch?.deleteOldTwitchClipsIndex();

  const addedEmotesDatabase: Readonly<AddedEmotesDatabase> = new AddedEmotesDatabase(DATABASE_ENDPOINTS.addedEmotes);

  const cachedUrl: Readonly<CachedUrl> = new CachedUrl(LOCAL_CACHE_BASE);

  await GlobalEmoteMatcherConstructor.createInstance(await twitchApi, addedEmotesDatabase);

  const guilds: readonly Promise<Readonly<Guild> | undefined>[] = [
    newGuild(
      GUILD_ID_CUTEDOG,
      BROADCASTER_NAME_CUTEDOG,
      twitchClipsMeiliSearch,
      addedEmotesDatabase,
      new PersonalEmoteMatcherConstructor(GUILD_ID_CUTEDOG, PERSONAL_EMOTE_ENDPOINTS.cutedog)
    ),
    newGuild(
      GUILD_ID_ELLY,
      BROADCASTER_NAME_ELLY,
      twitchClipsMeiliSearch,
      addedEmotesDatabase,
      new PersonalEmoteMatcherConstructor(GUILD_ID_ELLY, PERSONAL_EMOTE_ENDPOINTS.elly)
    )
  ];

  const guilds_ = await Promise.all(guilds);

  if (guilds_.some((guild) => guild === undefined)) {
    throw new Error('Error at creating guilds.');
  }

  return new Bot(
    client,
    openai,
    undefined,
    await twitchApi,
    twitchClipsMeiliSearch,
    addedEmotesDatabase,
    cachedUrl,
    guilds_.filter((guild) => guild !== undefined) as readonly Readonly<Guild>[]
  );
})();

process.on('exit', (): void => {
  console.log('exiting');
  bot.closeDatabase();
});

process.on('SIGINT', (): void => {
  console.log('received SIGINT');
  bot.closeDatabase();
});

process.on('SIGTERM', (): void => {
  console.log('received SIGTERM');
  bot.closeDatabase();
});

process.on('uncaughtException', (err: Readonly<Error>): void => {
  console.log(`uncaughtException: ${err instanceof Error ? err : 'error'}`);
  bot.closeDatabase();
});

process.on('unhandledRejection', (err): void => {
  console.log(`unhandledRejection: ${err instanceof Error ? err : 'error'}`);
  bot.closeDatabase();
});

// update every 20 minutes 0th second
scheduleJob('0 */20 * * * *', () => {
  try {
    console.log('Emote cache refreshing');

    bot.refreshEmotes();
  } catch (error: unknown) {
    console.log(`refreshEmotes() failed, emotes might be stale: ${error instanceof Error ? error : 'error'}`);
  }
});

// update every hour, in the 54th minute 0th second
// this is because of the 300 second timeout of fetch + 1 minute, so twitch api is validated before use
scheduleJob('0 54 * * * *', () => {
  bot.validateTwitchAccessToken();
});

// update every 2 hours
scheduleJob('0 */2 * * *', () => {
  bot.refreshClips();
});

// update every 6 hours in the 6th minute
scheduleJob('6 */6 * * *', () => {
  bot.refreshBTTVAndFFZPersonalEmotes();
});

// update every 12 hours in the 12th minute
scheduleJob('12 */12 * * *', () => {
  void GlobalEmoteMatcherConstructor.instance.refreshGlobalEmotes();
});

bot.registerHandlers();
await ensureDirTmp_;
await commandUpdate;
await bot.start(DISCORD_TOKEN);
