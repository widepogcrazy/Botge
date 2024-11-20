import fetch, { type RequestInit } from 'node-fetch';

import type { v2 } from '@google-cloud/translate';
import type { Client } from 'discord.js';

import { EmoteMatcher } from './emoteMatcher.js';
import type {
  EmoteEndpoints,
  ReadonlyOpenAI,
  SevenEmoteNotInSet,
  BTTVEmote,
  SevenEmotes,
  BTTVPersonalEmotes,
  FFZPersonalEmotes,
  FFZGlobalEmotes,
  TwitchGlobalEmotes
} from './types.js';
import { addEmoteHandlerSevenNotInSet } from './command/addemote.js';
import { emoteHandler } from './command/emote.js';
import { helpHandler } from './command/help.js';
import { chatgptHandler } from './command/openai.js';
import { shortestuniquesubstringsHandler } from './command/shortestuniquesubstrings.js';
import translateHandler from './command/translate.js';
import { validationHandler, type TwitchGlobalHandler } from './api/twitch.js';
import type { FileEmoteDb } from './api/filedb.js';

async function newEmoteMatcher(
  emoteEndpoints: Readonly<EmoteEndpoints>,
  twitchglobalhandler: Readonly<TwitchGlobalHandler> | undefined,
  fileEmoteDb: Readonly<FileEmoteDb>
): Promise<Readonly<EmoteMatcher>> {
  const twitchGlobalOptions = twitchglobalhandler?.getTwitchGlobalOptions();

  const fetchAndJson = async (emoteEndpoint: string, options?: RequestInit): Promise<unknown> => {
    return options ? await (await fetch(emoteEndpoint, options)).json() : await (await fetch(emoteEndpoint)).json();
  };

  const sevenPersonal = fetchAndJson(emoteEndpoints.sevenPersonal);
  const sevenGlobal = fetchAndJson(emoteEndpoints.sevenGlobal);
  const bttvPersonal = fetchAndJson(emoteEndpoints.bttvPersonal);
  const bttvGlobal = fetchAndJson(emoteEndpoints.bttvGlobal);
  const ffzPersonal = fetchAndJson(emoteEndpoints.ffzPersonal);
  const ffzGlobal = fetchAndJson(emoteEndpoints.ffzGlobal);
  const twitchGlobal = twitchGlobalOptions ? fetchAndJson(emoteEndpoints.twitchGlobal, twitchGlobalOptions) : undefined;
  const sevenEmotesNotInSet_: readonly Promise<unknown>[] = fileEmoteDb
    .getAll()
    .map(async (sevenEmoteNotInSet) => fetchAndJson(sevenEmoteNotInSet));

  return new EmoteMatcher(
    (await sevenPersonal) as SevenEmotes,
    (await sevenGlobal) as SevenEmotes,
    (await bttvPersonal) as BTTVPersonalEmotes,
    (await bttvGlobal) as BTTVEmote[],
    (await ffzPersonal) as FFZPersonalEmotes,
    (await ffzGlobal) as FFZGlobalEmotes,
    twitchGlobal ? ((await twitchGlobal) as TwitchGlobalEmotes) : undefined,
    (await Promise.all(sevenEmotesNotInSet_)) as SevenEmoteNotInSet[]
  );
}

export class Bot {
  public readonly fileEmoteDb: Readonly<FileEmoteDb>;
  public emoteMatcher: Readonly<EmoteMatcher>;
  public readonly twitchGlobalHander: Readonly<TwitchGlobalHandler> | undefined;

  private readonly _client: Client;
  private readonly _openai: ReadonlyOpenAI | undefined;
  private readonly _translate: v2.Translate | undefined;
  private readonly _emoteEndpoints: EmoteEndpoints;

  public constructor(
    emoteEndpoints: Readonly<EmoteEndpoints>,
    client: Client,
    openai: ReadonlyOpenAI | undefined,
    translate: v2.Translate | undefined,
    twitchGlobalHander: Readonly<TwitchGlobalHandler> | undefined,
    fileEmoteDb: Readonly<FileEmoteDb>,
    emoteMatcher: Readonly<EmoteMatcher>
  ) {
    this._emoteEndpoints = emoteEndpoints;
    this._client = client;
    this._openai = openai;
    this._translate = translate;
    this.twitchGlobalHander = twitchGlobalHander;
    this.fileEmoteDb = fileEmoteDb;
    this.emoteMatcher = emoteMatcher;
  }

  public async refreshEmotes(): Promise<void> {
    this.emoteMatcher = await newEmoteMatcher(this._emoteEndpoints, this.twitchGlobalHander, this.fileEmoteDb);
  }

  public async validateTwitch(): Promise<void> {
    if (this.twitchGlobalHander) await validationHandler(this.twitchGlobalHander);
  }

  public registerHandlers(): void {
    //const self = this; // silence typescript warning

    this._client.on('ready', () => {
      console.log(`Logged in as ${this._client.user?.tag ?? ''}!`);
      return;
    });

    //interaction
    this._client.on('interactionCreate', async (interaction) => {
      //interaction not
      if (!interaction.isChatInputCommand()) return;

      //interaction emote
      if (interaction.commandName === 'emote') {
        void emoteHandler(this.emoteMatcher)(interaction);
        return;
      }

      if (interaction.commandName === 'addemote') {
        await addEmoteHandlerSevenNotInSet(this, this._emoteEndpoints.sevenEmotesNotInSet)(interaction);
        return;
      }

      if (interaction.commandName === 'shortestuniquesubstrings') {
        void shortestuniquesubstringsHandler(this.emoteMatcher)(interaction);
        return;
      }

      if (interaction.commandName === 'chatgpt') {
        if (this._openai) void chatgptHandler(this._openai)(interaction);
        else void interaction.reply('chatgpt command is currently not available.');

        return;
      }

      if (interaction.commandName === 'translate') {
        if (this._translate) void translateHandler(this._translate)(interaction);
        else void interaction.reply('translate command is currently not available.');

        return;
      }

      if (interaction.commandName === 'help') {
        void helpHandler()(interaction);
        return;
      }
    });
  }

  public async start(discordToken: string | undefined): Promise<void> {
    await this._client.login(discordToken);
  }
}

export async function createBot(
  emoteEndpoints: Readonly<EmoteEndpoints>,
  client: Client,
  openai: ReadonlyOpenAI | undefined,
  translate: v2.Translate | undefined,
  twitchGlobalHander: Readonly<TwitchGlobalHandler> | undefined,
  fileEmoteDb: Readonly<FileEmoteDb>
): Promise<Readonly<Bot>> {
  return new Bot(
    emoteEndpoints,
    client,
    openai,
    translate,
    twitchGlobalHander,
    fileEmoteDb,
    await newEmoteMatcher(emoteEndpoints, twitchGlobalHander, fileEmoteDb)
  );
}
