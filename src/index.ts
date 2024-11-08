// print stack on warnings
process.on('warning', (e) => console.log(e.stack));

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import * as schedule from 'node-schedule';

import { Client } from 'discord.js';
import OpenAI from 'openai';
import { v2 } from '@google-cloud/translate';

import { TwitchGlobalHandler } from './TwitchGlobalHandler.js';
import { EmoteMatcher } from './emoteMatcher.js';
import { emoteHandler } from './command/emote.js';
import { shortestuniquesubstringsHandler } from './command/shortestuniquesubstrings.js';
import { chatgptHandler } from './command/openai.js';
import { TranslateHandler } from './command/translate.js';
import { helpHandler } from './command/help.js';

//dotenv
dotenv.config();
const DISCORD_TOKEN: string = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY: string | undefined = process.env.OPENAI_API_KEY;
const CREDENTIALS: string | undefined = process.env.CREDENTIALS;
const CREDENTIALSJSON = CREDENTIALS ? JSON.parse(CREDENTIALS) : undefined;
const TWITCH_CLIENT_ID: string | undefined = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET: string | undefined = process.env.TWITCH_SECRET;

//client
const client: Client = new Client({ intents: [] });

//openai
const openai: OpenAI | undefined = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : undefined;

//translate
const translate: v2.Translate | undefined = CREDENTIALSJSON
  ? new v2.Translate({
      credentials: CREDENTIALSJSON,
      projectId: CREDENTIALSJSON.project_id
    })
  : undefined;

//twitch
const twitchglobalhandler: TwitchGlobalHandler | undefined =
  TWITCH_CLIENT_ID && TWITCH_SECRET ? TwitchGlobalHandler.getInstance(TWITCH_CLIENT_ID, TWITCH_SECRET) : undefined;

// emotes
const emote_endpoints = {
  sevenPersonal: 'https://7tv.io/v3/emote-sets/01FDMJPSF8000CJ4MDR2FNZEQ3',
  sevenGlobal: 'https://7tv.io/v3/emote-sets/global',
  bttvPersonal: 'https://api.betterttv.net/3/users/5809977263c97c037fc9e66c',
  bttvGlobal: 'https://api.betterttv.net/3/cached/emotes/global',
  ffzPersonal: 'https://api.frankerfacez.com/v1/room/cutedog_',
  ffzGlobal: 'https://api.frankerfacez.com/v1/set/global',
  twitchGlobal: 'https://api.twitch.tv/helix/chat/emotes/global'
};

async function getAndValidateTwitchAccessToken(): Promise<void> {
  await twitchglobalhandler.getTwitchAccessToken();
  await twitchglobalhandler.validateTwitchAccessToken();
}

function logGotAccessToken(): void {
  if (twitchglobalhandler.gotAccessToken()) console.log('Got Twitch Access Token.');
  else console.log('Failed to get Twitch Access Token.');
}
function logIsAccessTokenValidated(): void {
  if (twitchglobalhandler.isAccessTokenValidated()) console.log('Twitch Access Token is valid.');
  else console.log('Twitch Access Token is invalid.');
}

export async function newEmoteMatcher(): Promise<EmoteMatcher> {
  try {
    const twitchGlobalOptions = twitchglobalhandler?.getTwitchGlobalOptions();

    const sevenPersonal = fetch(emote_endpoints.sevenPersonal);
    const sevenGlobal = fetch(emote_endpoints.sevenGlobal);
    const bttvPersonal = fetch(emote_endpoints.bttvPersonal);
    const bttvGlobal = fetch(emote_endpoints.bttvGlobal);
    const ffzPersonal = fetch(emote_endpoints.ffzPersonal);
    const ffzGlobal = fetch(emote_endpoints.ffzGlobal);
    const twitchGlobal = twitchGlobalOptions ? fetch(emote_endpoints.twitchGlobal, twitchGlobalOptions) : undefined;
    return new EmoteMatcher(
      await (await sevenPersonal).json(),
      await (await sevenGlobal).json(),
      await (await bttvPersonal).json(),
      await (await bttvGlobal).json(),
      await (await ffzPersonal).json(),
      await (await ffzGlobal).json(),
      await (await twitchGlobal)?.json()
    );
  } catch (err) {
    console.log(err);
  }
}

//emoteMatcher
let em: EmoteMatcher;

if (twitchglobalhandler) {
  await getAndValidateTwitchAccessToken();
  logGotAccessToken();
  logIsAccessTokenValidated();
}

em = await newEmoteMatcher();
console.log('Emote cache ready');

// update ever 5 minutes
schedule.scheduleJob('*/5 * * * *', async () => {
  console.log('Emote cache refreshing');
  em = await newEmoteMatcher();
  console.log('Emote cache refreshed');
});

if (twitchglobalhandler) {
  // update ever 60 minutes
  schedule.scheduleJob('*/60 * * * *', async () => {
    await twitchglobalhandler.validateTwitchAccessToken();
    logIsAccessTokenValidated();
    if (!twitchglobalhandler.isAccessTokenValidated()) {
      await getAndValidateTwitchAccessToken();
      logGotAccessToken();
      logIsAccessTokenValidated();
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
    emoteHandler()(interaction, em);
    return;
  }

  if (interaction.commandName === 'shortestuniquesubstrings') {
    shortestuniquesubstringsHandler(em)(interaction);
    return;
  }

  //interaction chatgpt
  if (interaction.commandName === 'chatgpt') {
    if (openai) chatgptHandler(openai)(interaction);
    return;
  }

  //interaction translate
  if (interaction.commandName === 'translate') {
    if (translate) TranslateHandler(translate)(interaction);
    return;
  }

  //interaction help
  if (interaction.commandName === 'help') {
    helpHandler()(interaction);
    return;
  }
});

client.login(DISCORD_TOKEN);
