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
  TwitchGlobalEmotes,
  TwitchClip
} from './types.js';
import { addEmoteHandlerSevenNotInSet } from './command/addemote.js';
import { emoteHandler } from './command/emote.js';
import { helpHandler } from './command/help.js';
import { chatgptHandler } from './command/openai.js';
import { shortestuniquesubstringsHandler } from './command/shortestuniquesubstrings.js';
import translateHandler from './command/translate.js';
import {
  getTwitchClipsFromBroadcasterId,
  getTwitchClipsFromClipIds,
  validationHandler,
  type TwitchGlobalHandler
} from './api/twitch.js';
import type { FileEmoteDb } from './api/filedb.js';
import { fetchAndJson } from './utils/fetchAndJson.js';
import { clipHandler } from './command/clip.js';

async function newEmoteMatcher(
  emoteEndpoints: Readonly<EmoteEndpoints>,
  twitchglobalhandler: Readonly<TwitchGlobalHandler> | undefined,
  fileEmoteDb: Readonly<FileEmoteDb>
): Promise<Readonly<EmoteMatcher>> {
  const twitchGlobalOptions = twitchglobalhandler?.getTwitchGlobalOptions();

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
    (await bttvGlobal) as readonly BTTVEmote[],
    (await ffzPersonal) as FFZPersonalEmotes,
    (await ffzGlobal) as FFZGlobalEmotes,
    twitchGlobal ? ((await twitchGlobal) as TwitchGlobalEmotes) : undefined,
    (await Promise.all(sevenEmotesNotInSet_)) as readonly SevenEmoteNotInSet[]
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
  private readonly _broadcasterId: number | undefined;
  private readonly _clipIds: readonly string[] | undefined;
  private _twitchClips: readonly TwitchClip[] | undefined;

  public constructor(
    emoteEndpoints: Readonly<EmoteEndpoints>,
    client: Client,
    openai: ReadonlyOpenAI | undefined,
    translate: v2.Translate | undefined,
    twitchGlobalHander: Readonly<TwitchGlobalHandler> | undefined,
    fileEmoteDb: Readonly<FileEmoteDb>,
    emoteMatcher: Readonly<EmoteMatcher>,
    broadcasterId?: number,
    clipIds?: readonly string[],
    twitchClips?: readonly TwitchClip[]
  ) {
    this._emoteEndpoints = emoteEndpoints;
    this._client = client;
    this._openai = openai;
    this._translate = translate;
    this.twitchGlobalHander = twitchGlobalHander;
    this.fileEmoteDb = fileEmoteDb;
    this.emoteMatcher = emoteMatcher;

    if (broadcasterId !== undefined && clipIds !== undefined)
      throw new Error('Can not set both broadcasterId and clipIds.');

    this._broadcasterId = broadcasterId;
    this._clipIds = clipIds;
    this._twitchClips = twitchClips;
  }

  public async refreshEmotes(): Promise<void> {
    this.emoteMatcher = await newEmoteMatcher(this._emoteEndpoints, this.twitchGlobalHander, this.fileEmoteDb);
  }

  public async validateTwitch(): Promise<void> {
    if (this.twitchGlobalHander) await validationHandler(this.twitchGlobalHander);
  }

  public async refreshClips(): Promise<void> {
    if (this.twitchGlobalHander !== undefined) {
      if (this._broadcasterId !== undefined || this._clipIds !== undefined) {
        const twitchGlobalOptions = this.twitchGlobalHander.getTwitchGlobalOptions();

        if (this._broadcasterId !== undefined) {
          this._twitchClips = twitchGlobalOptions
            ? await getTwitchClipsFromBroadcasterId(twitchGlobalOptions, this._broadcasterId)
            : this._twitchClips;
          return;
        }
        if (this._clipIds !== undefined) {
          this._twitchClips = twitchGlobalOptions
            ? await getTwitchClipsFromClipIds(twitchGlobalOptions, this._clipIds)
            : this._twitchClips;
          return;
        }
      }
    }
    return;
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
        void emoteHandler(this.emoteMatcher, this._emoteEndpoints.sevenEmotesNotInSet)(interaction);

        return;
      }

      if (interaction.commandName === 'clip') {
        if (this._twitchClips !== undefined) void clipHandler(this._twitchClips)(interaction);
        else void interaction.reply('clip command is currently not available.');

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
        if (this._openai !== undefined) void chatgptHandler(this._openai)(interaction);
        else void interaction.reply('chatgpt command is currently not available.');

        return;
      }

      if (interaction.commandName === 'translate') {
        if (this._translate !== undefined) void translateHandler(this._translate)(interaction);
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
  fileEmoteDb: Readonly<FileEmoteDb>,
  broadcasterId?: number,
  clipIds?: readonly string[],
  twitchClips?: readonly TwitchClip[]
): Promise<Readonly<Bot>> {
  return new Bot(
    emoteEndpoints,
    client,
    openai,
    translate,
    twitchGlobalHander,
    fileEmoteDb,
    await newEmoteMatcher(emoteEndpoints, twitchGlobalHander, fileEmoteDb),
    broadcasterId,
    clipIds,
    twitchClips
  );
}
