import fetch, { type RequestInit } from 'node-fetch';

import { Client } from 'discord.js';
import OpenAI from 'openai';
import { v2 } from '@google-cloud/translate';

import { TwitchGlobalHandler } from './api/twitch.js';
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
import { FileEmoteDb } from './api/filedb.js';

export interface EmoteEndpoints {
  sevenPersonal: string;
  sevenGlobal: string;
  sevenEmotesNotInSet: string;
  bttvPersonal: string;
  bttvGlobal: string;
  ffzPersonal: string;
  ffzGlobal: string;
  twitchGlobal: string;
}

async function newEmoteMatcher(
  endpoints: EmoteEndpoints,
  twitchglobalhandler: TwitchGlobalHandler | undefined,
  db: FileEmoteDb
): Promise<EmoteMatcher> {
  const twitchGlobalOptions = twitchglobalhandler?.getTwitchGlobalOptions();

  const fetchAndJson = async (emoteEndpoint: string, options?: RequestInit): Promise<unknown> => {
    return options ? await (await fetch(emoteEndpoint, options)).json() : await (await fetch(emoteEndpoint)).json();
  };
  const sevenPersonal = fetchAndJson(endpoints.sevenPersonal);
  const sevenGlobal = fetchAndJson(endpoints.sevenGlobal);
  const bttvPersonal = fetchAndJson(endpoints.bttvPersonal);
  const bttvGlobal = fetchAndJson(endpoints.bttvGlobal);
  const ffzPersonal = fetchAndJson(endpoints.ffzPersonal);
  const ffzGlobal = fetchAndJson(endpoints.ffzGlobal);
  const twitchGlobal = twitchGlobalOptions ? fetchAndJson(endpoints.twitchGlobal, twitchGlobalOptions) : undefined;
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

export class Bot {
  private emoteEndpoints: EmoteEndpoints;
  public discord: Client;
  public openai: OpenAI | undefined;
  public translate: v2.Translate | undefined;
  public twitch: TwitchGlobalHandler | undefined;
  public sevenEmotesNotInSet: readonly string[] | undefined;
  public db: FileEmoteDb;
  public em: EmoteMatcher;

  constructor(
    emoteEndpoints: EmoteEndpoints,
    discord: Client,
    openai: OpenAI | undefined,
    translate: v2.Translate | undefined,
    twitch: TwitchGlobalHandler | undefined,
    db: FileEmoteDb,
    em: EmoteMatcher
  ) {
    this.emoteEndpoints = emoteEndpoints;
    this.discord = discord;
    this.openai = openai;
    this.translate = translate;
    this.twitch = twitch;
    this.db = db;
    this.em = em;
  }

  async refreshEmotes() {
    try {
      this.em = await newEmoteMatcher(this.emoteEndpoints, this.twitch, this.db);
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
          self.emoteEndpoints.sevenEmotesNotInSet
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

  async start(discord_token: string) {
    this.discord.login(discord_token);
  }
}

export async function CreateBot(
  emoteEndpoints: EmoteEndpoints,
  discord: Client,
  openai: OpenAI | undefined,
  translate: v2.Translate | undefined,
  twitch: TwitchGlobalHandler | undefined,
  db: FileEmoteDb
) {
  return new Bot(
    emoteEndpoints,
    discord,
    openai,
    translate,
    twitch,
    db,
    await newEmoteMatcher(emoteEndpoints, twitch, db)
  );
}
