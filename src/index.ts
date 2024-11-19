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

import { TwitchGlobalHandler, type ITwitchGlobalHandler } from './TwitchGlobalHandler.js';
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
import { readEmotes, addEmoteHandlerSevenNotInSet } from './command/addemote.js';

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

async function getAndValidateTwitchAccessToken(twitchglobalhandler: ITwitchGlobalHandler): Promise<void> {
  await twitchglobalhandler.getTwitchAccessToken();
  await twitchglobalhandler.validateTwitchAccessToken();
}

function logGotAccessToken(twitchglobalhandler: ITwitchGlobalHandler): void {
  if (twitchglobalhandler.gotAccessToken()) console.log('Got Twitch Access Token.');
  else console.log('Failed to get Twitch Access Token.');
}
function logIsAccessTokenValidated(twitchglobalhandler: ITwitchGlobalHandler): void {
  if (twitchglobalhandler.isAccessTokenValidated()) console.log('Twitch Access Token is valid.');
  else console.log('Twitch Access Token is invalid.');

  return;
}

async function newEmoteMatcher(
  twitchglobalhandler: ITwitchGlobalHandler | undefined,
  sevenEmotesNotInSet: readonly string[] | undefined
): Promise<EmoteMatcher | undefined> {
  try {
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
    const sevenEmotesNotInSet_ = sevenEmotesNotInSet?.map(async (sevenEmoteNotInSet) =>
      fetchAndJson(sevenEmoteNotInSet)
    );

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
  } catch (err) {
    console.log(err);
    return undefined;
  }
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

//declarations
let client: Client | undefined = undefined;
let openai: OpenAI | undefined = undefined;
let translate: v2.Translate | undefined = undefined;
let twitchGlobalHandler: TwitchGlobalHandler | undefined = undefined;
let em: EmoteMatcher | undefined = undefined;
let sevenEmotesNotInSet: readonly string[] | undefined = undefined;

//try inits
try {
  client = new Client({ intents: [] });
} catch (error) {
  if (error instanceof Error) console.log(`Error at initializing client: ${error}.`);
  logExitAndExit(FAILUREEXITCODE);
}

try {
  openai = OPENAI_API_KEY !== undefined ? new OpenAI({ apiKey: OPENAI_API_KEY }) : undefined;
} catch (error) {
  if (error instanceof Error) console.log(`Error at initializing openai: ${error}`);
}

try {
  const CREDENTIALSJSON = CREDENTIALS !== undefined ? ((await JSON.parse(CREDENTIALS)) as Credentials) : undefined;
  translate = CREDENTIALSJSON
    ? new v2.Translate({
        credentials: CREDENTIALSJSON,
        projectId: CREDENTIALSJSON.project_id
      })
    : undefined;
} catch (error) {
  if (error instanceof Error) console.log(`Error at initializing translate: ${error}`);
}

try {
  twitchGlobalHandler =
    TWITCH_CLIENT_ID !== undefined && TWITCH_SECRET !== undefined
      ? TwitchGlobalHandler.getInstance(TWITCH_CLIENT_ID, TWITCH_SECRET)
      : undefined;
} catch (error) {
  if (error instanceof Error) console.log(`Error at initializing twitchGlobalHandler: ${error}.`);
}

//inits
if (twitchGlobalHandler) {
  await getAndValidateTwitchAccessToken(twitchGlobalHandler);
  logGotAccessToken(twitchGlobalHandler);
  logIsAccessTokenValidated(twitchGlobalHandler);
}

sevenEmotesNotInSet = await readEmotes(FILE_ENDPOINTS.sevenNotInSetEmotes);

em = await newEmoteMatcher(twitchGlobalHandler, sevenEmotesNotInSet);
logIsEmoteMatcherValid(em);
if (!isEmoteMatcherValid(em)) logExitAndExit(FAILUREEXITCODE);

//schedules
// update ever 5 minutes
scheduleJob('*/5 * * * *', async () => {
  console.log('Emote cache refreshing');
  em = await newEmoteMatcher(twitchGlobalHandler, sevenEmotesNotInSet);
  logIsEmoteMatcherValid(em);
  if (!isEmoteMatcherValid(em)) logExitAndExit(FAILUREEXITCODE);
});

if (twitchGlobalHandler) {
  // update ever 60 minutes
  scheduleJob('*/60 * * * *', async () => {
    await twitchGlobalHandler.validateTwitchAccessToken();
    logIsAccessTokenValidated(twitchGlobalHandler);
    if (!twitchGlobalHandler.isAccessTokenValidated()) {
      await getAndValidateTwitchAccessToken(twitchGlobalHandler);
      logGotAccessToken(twitchGlobalHandler);
      logIsAccessTokenValidated(twitchGlobalHandler);
    }
  });
}

//on ready
client?.on('ready', function onReady() {
  console.log(`Logged in as ${client.user?.tag ?? ''}!`);
  return;
});

//interaction
client?.on('interactionCreate', async function onInteractionCreate(interaction) {
  //interaction not
  if (!interaction.isChatInputCommand()) return;

  //interaction emote
  if (interaction.commandName === 'emote') {
    if (em) void emoteHandler(em)(interaction);
    else void interaction.reply('Emote command is currently not available.');
    return;
  }

  if (interaction.commandName === 'addemote') {
    if (em) {
      const addEmoteHandlerSevenNotInSet_ = await addEmoteHandlerSevenNotInSet(
        em,
        EMOTE_ENDPOINTS.sevenEmotesNotInSet,
        FILE_ENDPOINTS.sevenNotInSetEmotes
      )(interaction);

      if (addEmoteHandlerSevenNotInSet_) {
        sevenEmotesNotInSet = await readEmotes(FILE_ENDPOINTS.sevenNotInSetEmotes);
        em = await newEmoteMatcher(twitchGlobalHandler, sevenEmotesNotInSet);
        logIsEmoteMatcherValid(em);
        if (!isEmoteMatcherValid(em)) {
          logExitAndExit(FAILUREEXITCODE);
        }
      }
    } else {
      void interaction.reply('addemote command is currently not available.');
    }

    return;
  }

  if (interaction.commandName === 'shortestuniquesubstrings') {
    if (em) void shortestuniquesubstringsHandler(em)(interaction);
    else void interaction.reply('shortestuniquesubstrings command is currently not available.');

    return;
  }

  if (interaction.commandName === 'chatgpt') {
    if (openai) void chatgptHandler(openai)(interaction);
    else void interaction.reply('chatgpt command is currently not available.');

    return;
  }

  if (interaction.commandName === 'translate') {
    if (translate) void translateHandler(translate)(interaction);
    else void interaction.reply('translate command is currently not available.');

    return;
  }

  if (interaction.commandName === 'help') {
    void helpHandler()(interaction);

    return;
  }
});

try {
  if (DISCORD_TOKEN !== undefined) {
    await client?.login(DISCORD_TOKEN);
  } else {
    console.log('Empty DISCORD_TOKEN.');
    logExitAndExit(FAILUREEXITCODE);
  }
} catch (error) {
  if (error instanceof Error) console.log(`Error at logging in: ${error}.`);
  logExitAndExit(FAILUREEXITCODE);
}
