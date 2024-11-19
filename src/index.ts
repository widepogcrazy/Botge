process.on('warning', (error: Readonly<Error>) => {
  console.log(error.stack);
});

import dotenv from 'dotenv';
import { scheduleJob } from 'node-schedule';
import { Client } from 'discord.js';
import OpenAI from 'openai';
import { v2 } from '@google-cloud/translate';
import { createTwitchApi, TwitchGlobalHandler } from './api/twitch.js';
import { createFileEmoteDbConnection, FileEmoteDb } from './api/filedb.js';
import { Bot, CreateBot } from './bot.js';
import type { JWTInput } from 'google-auth-library'

//dotenv
dotenv.config();
const DISCORD_TOKEN: string = process.env.DISCORD_TOKEN as string;
const OPENAI_API_KEY: string | undefined = process.env.OPENAI_API_KEY;
const CREDENTIALS: string | undefined = process.env.CREDENTIALS;
const TWITCH_CLIENT_ID: string | undefined = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET: string | undefined = process.env.TWITCH_SECRET;

const FILE_ENDPOINTS = {
  sevenNotInSetEmotes: 'data/sevenNotInSetEmotes.json'
};

let bot: Bot = await (async function (): Promise<Bot> {
  //declarations
  let discord: Client = new Client({ intents: [] });

  let openai: OpenAI | undefined = OPENAI_API_KEY !== undefined ? new OpenAI({ apiKey: OPENAI_API_KEY }) : undefined;

  let translate: v2.Translate | undefined = await (async function (): Promise<v2.Translate | undefined> {
    const jsonCredentials = CREDENTIALS !== undefined ? ((await JSON.parse(CREDENTIALS)) as JWTInput ) : undefined;
    return jsonCredentials
      ? new v2.Translate({
          credentials: jsonCredentials,
          projectId: jsonCredentials.project_id
        })
      : undefined;
  })();

  let twitch: TwitchGlobalHandler | undefined =
    TWITCH_CLIENT_ID !== undefined && TWITCH_SECRET !== undefined
      ? await createTwitchApi(TWITCH_CLIENT_ID, TWITCH_SECRET)
      : undefined;

  let db: FileEmoteDb = await createFileEmoteDbConnection(FILE_ENDPOINTS.sevenNotInSetEmotes);

  return await CreateBot(discord, openai, translate, twitch, db);
})();

// update every 5 minutes
scheduleJob('*/5 * * * *', async () => {
  console.log('Emote cache refreshing');
  await bot.refreshEmotes();
});

bot.registerHandlers();
await bot.start(DISCORD_TOKEN);
