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
import { MeiliSearch } from 'meilisearch';

import type { ReadonlyOpenAI } from './types.js';
import { Bot } from './bot.js';
import type { Guild } from './guild.js';
import {
  GUILD_ID_CUTEDOG,
  GUILD_ID_ELLY,
  BROADCASTER_NAME_CUTEDOG,
  BROADCASTER_NAME_ELLY,
  GUILD_ID_CUTEDOG2
} from './guilds.js';
import { DATABASE_DIR, DATABASE_ENDPOINTS, PERSONAL_EMOTE_ENDPOINTS, TMP_DIR } from './paths-and-endpoints.js';
import { TwitchClipsMeiliSearch } from './twitch-clips-meili-search.js';
import { GlobalEmoteMatcherConstructor } from './emote-matcher-constructor.js';
import { CachedUrl } from './api/cached-url.js';
import { AddedEmotesDatabase } from './api/added-emotes-database.js';
import { newGuild } from './utils/constructors/new-guild.js';
import { newTwitchApi } from './utils/constructors/new-twitch-api.js';
import { updateCommands } from './update-commands-docker.js';

//dotenv
dotenv.config();
const {
  DISCORD_TOKEN,
  OPENAI_API_KEY,
  TWITCH_CLIENT_ID,
  TWITCH_SECRET,
  MEILISEARCH_HOST,
  MEILISEARCH_API_KEY,
  LOCAL_CACHE_BASE
} = process.env;
//const CREDENTIALS = process.env.CREDENTIALS;

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

  const addedEmotesDatabase: Readonly<AddedEmotesDatabase> = new AddedEmotesDatabase(DATABASE_ENDPOINTS.addedEmotes);

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

  return new Bot(client, openai, undefined, await twitchApi, addedEmotesDatabase, cachedUrl, await Promise.all(guilds));
})();

function closeDatabase(): void {
  try {
    bot.addedEmotesDatabase.close();
  } catch (err) {
    console.log(`Error at closeDatabase: ${err instanceof Error ? err : 'error'}`);
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

process.on('uncaughtException', (err: Readonly<Error>): void => {
  console.log(`uncaughtException: ${err instanceof Error ? err : 'error'}`);
  closeDatabase();
});

process.on('unhandledRejection', (err): void => {
  console.log(`unhandledRejection: ${err instanceof Error ? err : 'error'}`);
  closeDatabase();
});

// update every 20 minutes 0th second
scheduleJob('0 */20 * * * *', () => {
  try {
    console.log('Emote cache refreshing');

    bot.guilds.forEach((guild) => {
      void guild.refreshEmoteMatcher();
    });
  } catch (error: unknown) {
    console.log(`refreshEmotes() failed, emotes might be stale: ${error instanceof Error ? error : 'error'}`);
  }
});

// update every hour, in the 54th minute 0th second
// this is because of the 300 second timeout of fetch + 1 minute, so twitch api is validated before use
scheduleJob('0 54 * * * *', () => {
  try {
    void bot.twitchApi?.validateAccessToken();
  } catch (error: unknown) {
    console.log(`validateTwitchAccessToken() failed: ${error instanceof Error ? error : 'error'}`);
  }
});

// update every 2 hours
scheduleJob('0 */2 * * *', () => {
  try {
    bot.guilds.forEach((guild) => {
      void guild.refreshClips(bot.twitchApi);
    });
  } catch (error: unknown) {
    console.log(`refreshClips() failed: ${error instanceof Error ? error : 'error'}`);
  }
});

// update every 6 hours in the 6th minute
scheduleJob('6 */6 * * *', () => {
  try {
    bot.guilds.forEach((guild) => {
      void guild.personalEmoteMatcherConstructor.refreshBTTVAndFFZPersonalEmotes();
    });
  } catch (error: unknown) {
    console.log(`refreshBTTVAndFFZPersonalEmotes() failed: ${error instanceof Error ? error : 'error'}`);
  }
});

// update every 12 hours in the 12th minute
scheduleJob('12 */12 * * *', () => {
  try {
    void GlobalEmoteMatcherConstructor.instance.refreshGlobalEmotes();
  } catch (error: unknown) {
    console.log(`refreshBTTVAndFFZPersonalEmotes() failed: ${error instanceof Error ? error : 'error'}`);
  }
});

bot.registerHandlers();
await ensureDirTmp_;
await commandUpdate;
await bot.start(DISCORD_TOKEN);
