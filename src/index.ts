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
import OpenAI from 'openai';
import { Translator } from 'deepl-node';
import { Client } from 'discord.js';
import { MeiliSearch } from 'meilisearch';
import type { ReadonlyOpenAI, ReadonlyTranslator } from './types.js';
import { Bot } from './bot.js';
import type { Guild } from './guild.js';
import {
  GUILD_ID_CUTEDOG,
  GUILD_ID_CUTEDOG2,
  GUILD_ID_ELLY,
  BROADCASTER_NAME_CUTEDOG,
  BROADCASTER_NAME_ELLY
} from './guilds.js';
import { DATABASE_DIR, DATABASE_ENDPOINTS, PERSONAL_EMOTE_ENDPOINTS, TMP_DIR } from './paths-and-endpoints.js';
import { TwitchClipsMeiliSearch } from './twitch-clips-meili-search.js';
import { GlobalEmoteMatcherConstructor } from './emote-matcher-constructor.js';
import { CachedUrl } from './api/cached-url.js';
import { AddedEmotesDatabase } from './api/added-emotes-database.js';
import { PingsDatabase } from './api/ping-database.js';
import { newGuild } from './utils/constructors/new-guild.js';
import { newTwitchApi } from './utils/constructors/new-twitch-api.js';
import { updateCommands } from './update-commands-docker.js';
import { registerPings } from './utils/ping/register-pings.js';

//dotenv
dotenv.config();
const {
  DISCORD_TOKEN,
  OPENAI_API_KEY,
  DEEPL_API_KEY,
  TWITCH_CLIENT_ID,
  TWITCH_SECRET,
  MEILISEARCH_HOST,
  MEILISEARCH_API_KEY,
  LOCAL_CACHE_BASE,
  UPDATE_CLIPS_ON_STARTUP
} = process.env;

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

  const translator: ReadonlyTranslator | undefined =
    DEEPL_API_KEY !== undefined ? new Translator(DEEPL_API_KEY) : undefined;

  const twitchApi =
    TWITCH_CLIENT_ID !== undefined && TWITCH_SECRET !== undefined
      ? newTwitchApi(TWITCH_CLIENT_ID, TWITCH_SECRET)
      : undefined;

  const twitchClipsMeiliSearch: Readonly<TwitchClipsMeiliSearch> | undefined =
    MEILISEARCH_HOST !== undefined && MEILISEARCH_API_KEY !== undefined
      ? new TwitchClipsMeiliSearch(new MeiliSearch({ host: MEILISEARCH_HOST, apiKey: MEILISEARCH_API_KEY }))
      : undefined;

  const addedEmotesDatabase: Readonly<AddedEmotesDatabase> = new AddedEmotesDatabase(DATABASE_ENDPOINTS.addedEmotes);
  const pingsDatabase: Readonly<PingsDatabase> = new PingsDatabase(DATABASE_ENDPOINTS.pings);

  const cachedUrl: Readonly<CachedUrl> = new CachedUrl(LOCAL_CACHE_BASE);

  await GlobalEmoteMatcherConstructor.createInstance(await twitchApi, addedEmotesDatabase);

  const guilds: readonly Promise<Readonly<Guild>>[] = [
    newGuild(
      [GUILD_ID_CUTEDOG, GUILD_ID_CUTEDOG2],
      BROADCASTER_NAME_CUTEDOG,
      twitchClipsMeiliSearch,
      addedEmotesDatabase,
      PERSONAL_EMOTE_ENDPOINTS.cutedog
    ),
    newGuild(
      [GUILD_ID_ELLY],
      BROADCASTER_NAME_ELLY,
      twitchClipsMeiliSearch,
      addedEmotesDatabase,
      PERSONAL_EMOTE_ENDPOINTS.elly
    )
  ];

  return new Bot(
    client,
    openai,
    translator,
    await twitchApi,
    addedEmotesDatabase,
    pingsDatabase,
    cachedUrl,
    await Promise.all(guilds)
  );
})();

function closeDatabase(): void {
  try {
    bot.addedEmotesDatabase.close();
    bot.pingsDatabase.close();
  } catch (error) {
    console.log(`Error at closeDatabase: ${error instanceof Error ? error.message : String(error)}`);
  }
}

process.on('exit', (): void => {
  console.log('exiting');
  closeDatabase();
});

process.on('SIGINT', (): void => {
  console.log('received SIGINT');
  closeDatabase();
});

process.on('SIGTERM', (): void => {
  console.log('received SIGTERM');
  closeDatabase();
});

process.on('uncaughtException', (error: Readonly<Error>): void => {
  console.log(`uncaughtException: ${error.message}`);
});

process.on('unhandledRejection', (error): void => {
  console.log(`unhandledRejection: ${error instanceof Error ? error.message : String(error)}`);
});

// update every 3th minutes 0th second
scheduleJob('0 */3 * * * *', () => {
  try {
    bot.cleanUpTwitchClipMessageBuilders();
  } catch (error) {
    console.log(`cleanUpTwitchClipMessageBuilders() failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// update every 20th minutes 0th second
scheduleJob('0 */20 * * * *', () => {
  try {
    console.log('Emote cache refreshing');

    bot.guilds.forEach((guild) => {
      void guild.refreshEmoteMatcher();
    });
  } catch (error) {
    console.log(
      `refreshEmotes() failed, emotes might be stale: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// update every hour, in the 54th minute 0th second
// this is because of the 300 second timeout of fetch + 1 minute, so twitch api is validated before use
scheduleJob('0 54 * * * *', () => {
  try {
    void bot.twitchApi?.validateAccessToken();
  } catch (error) {
    console.log(`validateTwitchAccessToken() failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

if (UPDATE_CLIPS_ON_STARTUP === 'true') {
  try {
    bot.guilds.forEach((guild) => {
      void guild.refreshClips(bot.twitchApi);
    });
  } catch (error) {
    console.log(`refreshClips() failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// update every 2 hours
scheduleJob('0 */2 * * *', () => {
  try {
    bot.guilds.forEach((guild) => {
      void guild.refreshClips(bot.twitchApi);
    });
  } catch (error) {
    console.log(`refreshClips() failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// update every 6 hours in the 6th minute
scheduleJob('6 */6 * * *', () => {
  try {
    bot.guilds.forEach((guild) => {
      void guild.personalEmoteMatcherConstructor.refreshBTTVAndFFZPersonalEmotes();
    });
  } catch (error) {
    console.log(`refreshBTTVAndFFZPersonalEmotes() failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// update every 12 hours in the 12th minute
scheduleJob('12 */12 * * *', () => {
  try {
    void GlobalEmoteMatcherConstructor.instance.refreshGlobalEmotes();
  } catch (error) {
    console.log(`refreshBTTVAndFFZPersonalEmotes() failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

bot.registerHandlers();
await ensureDirTmp_;
await commandUpdate;
await bot.start(DISCORD_TOKEN);
void registerPings(bot.client, bot.pingsDatabase);
