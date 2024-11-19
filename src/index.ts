// print stack on warnings
process.on('warning', (error: Readonly<Error>) => {
  console.log(error.stack);
});

import dotenv from 'dotenv';
import fetch, { type RequestInit } from 'node-fetch';
import { scheduleJob } from 'node-schedule';

import { Client } from 'discord.js';
import OpenAI from 'openai';
import { v2 } from '@google-cloud/translate';

import { createTwitchApi, TwitchGlobalHandler } from './api/twitch.js';
import {
  type SevenEmoteNotInSet,
  type BTTVEmote,
  type SevenEmotes,
  type BTTVPersonalEmotes,
  type FFZPersonalEmotes,
  type FFZGlobalEmotes,
  type TwitchGlobalEmotes,
  type IEmoteMatcher,
  EmoteMatcher
} from './emoteMatcher.js';
import { emoteHandler } from './command/emote.js';
import { shortestuniquesubstringsHandler } from './command/shortestuniquesubstrings.js';
import { chatgptHandler } from './command/openai.js';
import translateHandler from './command/translate.js';
import { helpHandler } from './command/help.js';
import { addEmoteHandlerSevenNotInSet } from './command/addemote.js';
import { createFileEmoteDbConnection, FileEmoteDb } from './api/filedb.js';

interface Credentials {
  readonly type: string;
  readonly project_id: string;
  readonly private_key_id: string;
  readonly private_key: string;
  readonly client_email: string;
  readonly client_id: string;
  readonly auth_uri: string;
  readonly token_uri: string;
  readonly auth_provider_x509_cert_url: string;
  readonly client_x509_cert_url: string;
  readonly universe_domain: string;
}

//dotenv
dotenv.config();
const DISCORD_TOKEN: string | undefined = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY: string | undefined = process.env.OPENAI_API_KEY;
const CREDENTIALS: string | undefined = process.env.CREDENTIALS;
const TWITCH_CLIENT_ID: string | undefined = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET: string | undefined = process.env.TWITCH_SECRET;

// emotes
const EMOTE_ENDPOINTS = {
  sevenPersonal: 'https://7tv.io/v3/emote-sets/01FDMJPSF8000CJ4MDR2FNZEQ3',
  sevenGlobal: 'https://7tv.io/v3/emote-sets/global',
  sevenEmotesNotInSet: 'https://7tv.io/v3/emotes',
  bttvPersonal: 'https://api.betterttv.net/3/users/5809977263c97c037fc9e66c',
  bttvGlobal: 'https://api.betterttv.net/3/cached/emotes/global',
  ffzPersonal: 'https://api.frankerfacez.com/v1/room/cutedog_',
  ffzGlobal: 'https://api.frankerfacez.com/v1/set/global',
  twitchGlobal: 'https://api.twitch.tv/helix/chat/emotes/global'
};

const FILE_ENDPOINTS = {
  sevenNotInSetEmotes: 'data/sevenNotInSetEmotes.json'
};

const FAILUREEXITCODE = 1;

async function newEmoteMatcher(
  twitchglobalhandler: TwitchGlobalHandler | undefined,
  db: FileEmoteDb
): Promise<EmoteMatcher> {
  const twitchGlobalOptions = twitchglobalhandler?.getTwitchGlobalOptions();

  const fetchAndJson = async (emoteEndpoint: string, options?: RequestInit): Promise<unknown> => {
    return options ? await (await fetch(emoteEndpoint, options)).json() : await (await fetch(emoteEndpoint)).json();
  };
  const sevenPersonal = fetchAndJson(EMOTE_ENDPOINTS.sevenPersonal);
  const sevenGlobal = fetchAndJson(EMOTE_ENDPOINTS.sevenGlobal);
  const bttvPersonal = fetchAndJson(EMOTE_ENDPOINTS.bttvPersonal);
  const bttvGlobal = fetchAndJson(EMOTE_ENDPOINTS.bttvGlobal);
  const ffzPersonal = fetchAndJson(EMOTE_ENDPOINTS.ffzPersonal);
  const ffzGlobal = fetchAndJson(EMOTE_ENDPOINTS.ffzGlobal);
  const twitchGlobal = twitchGlobalOptions
    ? fetchAndJson(EMOTE_ENDPOINTS.twitchGlobal, twitchGlobalOptions)
    : undefined;
  const sevenEmotesNotInSet_ = db.getAll().map(async (sevenEmoteNotInSet) => fetchAndJson(sevenEmoteNotInSet));

  return new EmoteMatcher(
    (await sevenPersonal) as SevenEmotes,
    (await sevenGlobal) as SevenEmotes,
    (await bttvPersonal) as BTTVPersonalEmotes,
    (await bttvGlobal) as BTTVEmote[],
    (await ffzPersonal) as FFZPersonalEmotes,
    (await ffzGlobal) as FFZGlobalEmotes,
    twitchGlobal ? ((await twitchGlobal) as TwitchGlobalEmotes) : undefined,
    sevenEmotesNotInSet_ ? ((await Promise.all(sevenEmotesNotInSet_)) as SevenEmoteNotInSet[]) : undefined
  );
}

function logExitAndExit(exitcode: number): void {
  console.log('Exiting with code 1.');
  process.exit(exitcode);
}

function isEmoteMatcherValid(em: IEmoteMatcher | undefined): boolean {
  if (em) return true;
  return false;
}

function logIsEmoteMatcherValid(em: IEmoteMatcher | undefined): void {
  if (isEmoteMatcherValid(em)) console.log('Emote cache is valid');
  else console.log('Emote cache is not valid.');

  return;
}

class Bot {
  public discord: Client;
  public openai: OpenAI | undefined;
  public translate: v2.Translate | undefined;
  public twitch: TwitchGlobalHandler | undefined;
  public sevenEmotesNotInSet: readonly string[] | undefined;
  public db: FileEmoteDb;
  public em: EmoteMatcher;

  constructor(
    discord: Client,
    openai: OpenAI | undefined,
    translate: v2.Translate | undefined,
    twitch: TwitchGlobalHandler | undefined,
    db: FileEmoteDb,
    em: EmoteMatcher
  ) {
    this.discord = discord;
    this.openai = openai;
    this.translate = translate;
    this.twitch = twitch;
    this.db = db;
    this.em = em;
  }

  async refreshEmotes() {
    try {
      this.em = await newEmoteMatcher(this.twitch, this.db);
    } catch (err) {
      console.log('refreshEmotes() failed, emotes might be stale: ' + err);
    }
  }

  registerHandlers() {
    const self = this; // silence typescript warning

    this.discord.on('ready', function onReady() {
      console.log(`Logged in as ${self.discord.user?.tag ?? ''}!`);
      return;
    });

    //interaction
    this.discord.on('interactionCreate', async function onInteractionCreate(this: Bot, interaction) {
      //interaction not
      if (!interaction.isChatInputCommand()) return;

      //interaction emote
      if (interaction.commandName === 'emote') {
        if (self.em) void emoteHandler(self.em)(interaction);
        else void interaction.reply('Emote command is currently not available.');
        return;
      }

      if (interaction.commandName === 'addemote') {
        const addEmoteHandlerSevenNotInSet_ = await addEmoteHandlerSevenNotInSet(
          self,
          EMOTE_ENDPOINTS.sevenEmotesNotInSet
        )(interaction);
        return;
      }

      if (interaction.commandName === 'shortestuniquesubstrings') {
        if (self.em) void shortestuniquesubstringsHandler(self.em)(interaction);
        else void interaction.reply('shortestuniquesubstrings command is currently not available.');

        return;
      }

      if (interaction.commandName === 'chatgpt') {
        if (self.openai) void chatgptHandler(self.openai)(interaction);
        else void interaction.reply('chatgpt command is currently not available.');

        return;
      }

      if (interaction.commandName === 'translate') {
        if (self.translate) void translateHandler(self.translate)(interaction);
        else void interaction.reply('translate command is currently not available.');

        return;
      }

      if (interaction.commandName === 'help') {
        void helpHandler()(interaction);

        return;
      }
    });
  }

  async start() {
    this.discord.login(DISCORD_TOKEN);
  }
}

let bot: Bot = await (async function (): Promise<Bot> {
  //declarations
  let discord: Client = new Client({ intents: [] });

  let openai: OpenAI | undefined = OPENAI_API_KEY !== undefined ? new OpenAI({ apiKey: OPENAI_API_KEY }) : undefined;

  let translate: v2.Translate | undefined = await (async function (): Promise<v2.Translate | undefined> {
    const jsonCredentials = CREDENTIALS !== undefined ? ((await JSON.parse(CREDENTIALS)) as Credentials) : undefined;
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

  let em: EmoteMatcher = await newEmoteMatcher(twitch, db);

  return new Bot(discord, openai, translate, twitch, db, em);
})();

// update every 5 minutes
scheduleJob('*/5 * * * *', async () => {
  console.log('Emote cache refreshing');
  await bot.refreshEmotes();
});

bot.registerHandlers();
await bot.start();
