// print stack on warnings
process.on('warning', (e) => console.log(e.stack));

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import * as schedule from 'node-schedule';

import { Client } from 'discord.js';
import OpenAI from 'openai';
import { v2 } from '@google-cloud/translate';

import { TwitchGlobalHandler } from './TwitchGlobalHandler.js';
import {
  SevenEmoteNotInSet,
  BTTVEmote,
  SevenEmotes,
  BTTVPersonalEmotes,
  FFZPersonalEmotes,
  FFZGlobalEmotes,
  TwitchGlobalEmotes,
  EmoteMatcher
} from './emoteMatcher.js';
import { emoteHandler } from './command/emote.js';
import { shortestuniquesubstringsHandler } from './command/shortestuniquesubstrings.js';
import { chatgptHandler } from './command/openai.js';
import { translateHandler } from './command/translate.js';
import { helpHandler } from './command/help.js';
import { readEmotes, addEmoteHandlerSevenNotInSet } from './command/addemote.js';

//dotenv
dotenv.config();
const DISCORD_TOKEN: string | undefined = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY: string | undefined = process.env.OPENAI_API_KEY;
const CREDENTIALS: string | undefined = process.env.CREDENTIALS;
const TWITCH_CLIENT_ID: string | undefined = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET: string | undefined = process.env.TWITCH_SECRET;

// emotes
const emote_endpoints = {
  sevenPersonal: 'https://7tv.io/v3/emote-sets/01FDMJPSF8000CJ4MDR2FNZEQ3',
  sevenGlobal: 'https://7tv.io/v3/emote-sets/global',
  sevenEmotes: 'https://7tv.io/v3/emotes',
  bttvPersonal: 'https://api.betterttv.net/3/users/5809977263c97c037fc9e66c',
  bttvGlobal: 'https://api.betterttv.net/3/cached/emotes/global',
  ffzPersonal: 'https://api.frankerfacez.com/v1/room/cutedog_',
  ffzGlobal: 'https://api.frankerfacez.com/v1/set/global',
  twitchGlobal: 'https://api.twitch.tv/helix/chat/emotes/global'
};

const file_endpoints = {
  sevenNotInSetEmotes: 'data/sevenNotInSetEmotes.json'
};

const FAILUREEXITCODE: number = 1;

async function getAndValidateTwitchAccessToken(twitchglobalhandler: TwitchGlobalHandler): Promise<void> {
  await twitchglobalhandler.getTwitchAccessToken();
  await twitchglobalhandler.validateTwitchAccessToken();
}

function logGotAccessToken(twitchglobalhandler: TwitchGlobalHandler): void {
  if (twitchglobalhandler.gotAccessToken()) console.log('Got Twitch Access Token.');
  else console.log('Failed to get Twitch Access Token.');
}
function logIsAccessTokenValidated(twitchglobalhandler: TwitchGlobalHandler): void {
  if (twitchglobalhandler.isAccessTokenValidated()) console.log('Twitch Access Token is valid.');
  else console.log('Twitch Access Token is invalid.');
}

async function newEmoteMatcher(
  twitchglobalhandler: TwitchGlobalHandler | undefined,
  sevenNotInSetEmotes: string[] | undefined
): Promise<EmoteMatcher> | undefined {
  try {
    const twitchGlobalOptions = twitchglobalhandler?.getTwitchGlobalOptions();

    const sevenPersonal = fetch(emote_endpoints.sevenPersonal);
    const sevenGlobal = fetch(emote_endpoints.sevenGlobal);
    const bttvPersonal = fetch(emote_endpoints.bttvPersonal);
    const bttvGlobal = fetch(emote_endpoints.bttvGlobal);
    const ffzPersonal = fetch(emote_endpoints.ffzPersonal);
    const ffzGlobal = fetch(emote_endpoints.ffzGlobal);
    const twitchGlobal = twitchGlobalOptions ? fetch(emote_endpoints.twitchGlobal, twitchGlobalOptions) : undefined;
    const sevenNotInSet = sevenNotInSetEmotes?.map((sevenEmote) => fetch(sevenEmote));
    return new EmoteMatcher(
      (await (await sevenPersonal).json()) as SevenEmotes,
      (await (await sevenGlobal).json()) as SevenEmotes,
      (await (await bttvPersonal).json()) as BTTVPersonalEmotes,
      (await (await bttvGlobal).json()) as BTTVEmote[],
      (await (await ffzPersonal).json()) as FFZPersonalEmotes,
      (await (await ffzGlobal).json()) as FFZGlobalEmotes,
      (await (await twitchGlobal)?.json()) as TwitchGlobalEmotes,
      sevenNotInSet
        ? ((await Promise.all(
            (await Promise.all(sevenNotInSet)).map((respone) => respone.json())
          )) as SevenEmoteNotInSet[])
        : undefined
    );
  } catch (err) {
    console.log(err);
    return undefined;
  }
}

function logExitAndExit(exitcode: number) {
  console.log('Exiting with code 1.');
  process.exit(exitcode);
}

function isEmoteMatcherValid(em: EmoteMatcher) {
  if (em) return true;
  else return false;
}

function logIsEmoteMatcherValid(em: EmoteMatcher) {
  if (isEmoteMatcherValid(em)) {
    console.log('Emote cache is valid');
  } else {
    console.log('Emote cache is not valid.');
  }
}

//declarations
let client: Client;
let openai: OpenAI | undefined = undefined;
let translate: v2.Translate | undefined = undefined;
let twitchglobalhandler: TwitchGlobalHandler | undefined = undefined;
let em: EmoteMatcher | undefined = undefined;
let sevenNotInSetEmotes: string[] | undefined = undefined;

//try inits
try {
  client = new Client({ intents: [] });
} catch (error) {
  console.log(`Error at initializing client: ${error}.`);
  logExitAndExit(FAILUREEXITCODE);
}

try {
  openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : undefined;
} catch (error) {
  console.log(`Error at initializing openai: ${error}`);
}

try {
  const CREDENTIALSJSON = CREDENTIALS ? JSON.parse(CREDENTIALS) : undefined;
  translate = CREDENTIALSJSON
    ? new v2.Translate({
        credentials: CREDENTIALSJSON,
        projectId: CREDENTIALSJSON.project_id
      })
    : undefined;
} catch (error) {
  console.log(`Error at initializing translate: ${error}`);
}

try {
  twitchglobalhandler =
    TWITCH_CLIENT_ID && TWITCH_SECRET ? TwitchGlobalHandler.getInstance(TWITCH_CLIENT_ID, TWITCH_SECRET) : undefined;
} catch (error) {
  console.log(`Error at initializing twitchglobalhandler: ${error}`);
}

//inits
if (twitchglobalhandler) {
  await getAndValidateTwitchAccessToken(twitchglobalhandler);
  logGotAccessToken(twitchglobalhandler);
  logIsAccessTokenValidated(twitchglobalhandler);
}

sevenNotInSetEmotes = await readEmotes(file_endpoints.sevenNotInSetEmotes);

em = await newEmoteMatcher(twitchglobalhandler, sevenNotInSetEmotes);
logIsEmoteMatcherValid(em);
if (!isEmoteMatcherValid(em)) logExitAndExit(FAILUREEXITCODE);

//schedules
// update ever 5 minutes
schedule.scheduleJob('*/5 * * * *', async () => {
  console.log('Emote cache refreshing');
  em = await newEmoteMatcher(twitchglobalhandler, sevenNotInSetEmotes);
  logIsEmoteMatcherValid(em);
  if (!isEmoteMatcherValid(em)) logExitAndExit(FAILUREEXITCODE);
});

if (twitchglobalhandler) {
  // update ever 60 minutes
  schedule.scheduleJob('*/60 * * * *', async () => {
    await twitchglobalhandler.validateTwitchAccessToken();
    logIsAccessTokenValidated(twitchglobalhandler);
    if (!twitchglobalhandler.isAccessTokenValidated()) {
      await getAndValidateTwitchAccessToken(twitchglobalhandler);
      logGotAccessToken(twitchglobalhandler);
      logIsAccessTokenValidated(twitchglobalhandler);
    }
  });
}

//on ready
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  return;
});

//interaction
client.on('interactionCreate', async (interaction) => {
  //interaction not
  if (!interaction.isChatInputCommand()) return;

  //interaction emote
  if (interaction.commandName === 'emote') {
    if (em) await emoteHandler(em)(interaction);
    else await interaction.reply('Emote command is currently not available.');
    return;
  }

  if (interaction.commandName === 'addemote') {
    if (em) {
      const addemotehandlersevennotinset = await addEmoteHandlerSevenNotInSet(
        em,
        emote_endpoints.sevenEmotes,
        file_endpoints.sevenNotInSetEmotes
      )(interaction);

      if (addemotehandlersevennotinset) {
        sevenNotInSetEmotes = await readEmotes(file_endpoints.sevenNotInSetEmotes);
        em = await newEmoteMatcher(twitchglobalhandler, sevenNotInSetEmotes);
        logIsEmoteMatcherValid(em);
        if (!isEmoteMatcherValid(em)) logExitAndExit(FAILUREEXITCODE);
      }
    } else {
      await interaction.reply('addemote command is currently not available.');
    }

    return;
  }

  if (interaction.commandName === 'shortestuniquesubstrings') {
    if (em) await shortestuniquesubstringsHandler(em)(interaction);
    else await interaction.reply('shortestuniquesubstrings command is currently not available.');
    return;
  }

  if (interaction.commandName === 'chatgpt') {
    if (openai) await chatgptHandler(openai)(interaction);
    else await interaction.reply('chatgpt command is currently not available.');
    return;
  }

  if (interaction.commandName === 'translate') {
    if (translate) await translateHandler(translate)(interaction);
    else await interaction.reply('translate command is currently not available.');
    return;
  }

  if (interaction.commandName === 'help') {
    await helpHandler()(interaction);
    return;
  }
});

try {
  if (DISCORD_TOKEN) {
    await client.login(DISCORD_TOKEN);
  } else {
    console.log('Empty DISCORD_TOKEN.');
    logExitAndExit(FAILUREEXITCODE);
  }
} catch (error) {
  console.log(`Error at logging in: ${error}.`);
  logExitAndExit(FAILUREEXITCODE);
}
