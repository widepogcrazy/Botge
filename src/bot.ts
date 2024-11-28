import type { v2 } from '@google-cloud/translate';
import type { Client } from 'discord.js';
import type { Index } from 'meilisearch';
import type { CachedUrl } from './api/cached-url.js';

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
import { transientHandler } from './command/transient.js';
import { TwitchApi, getClipsWithGameName } from './api/twitch.js';
import { fetchAndJson } from './utils/fetchAndJson.js';
import { clipHandler } from './command/clip.js';
import type { AddedEmotesDatabase } from './api/added-emote-database.js';
import { listClipIds } from './api/list-clips.js';

async function newEmoteMatcher(
  emoteEndpoints: Readonly<EmoteEndpoints>,
  twitchApi: Readonly<TwitchApi> | undefined,
  addedEmotesDatabase: Readonly<AddedEmotesDatabase>
): Promise<Readonly<EmoteMatcher>> {
  const sevenPersonal = fetchAndJson(emoteEndpoints.sevenPersonal);
  const sevenGlobal = fetchAndJson(emoteEndpoints.sevenGlobal);
  const bttvPersonal = fetchAndJson(emoteEndpoints.bttvPersonal);
  const bttvGlobal = fetchAndJson(emoteEndpoints.bttvGlobal);
  const ffzPersonal = fetchAndJson(emoteEndpoints.ffzPersonal);
  const ffzGlobal = fetchAndJson(emoteEndpoints.ffzGlobal);
  const twitchGlobal = twitchApi ? twitchApi.emotesGlobal() : undefined;
  const addedEmotes: readonly Promise<unknown>[] = addedEmotesDatabase
    .getAll()
    .map(async (addedEmote) => fetchAndJson(addedEmote.url));

  return new EmoteMatcher(
    (await sevenPersonal) as SevenEmotes,
    (await sevenGlobal) as SevenEmotes,
    (await bttvPersonal) as BTTVPersonalEmotes,
    (await bttvGlobal) as readonly BTTVEmote[],
    (await ffzPersonal) as FFZPersonalEmotes,
    (await ffzGlobal) as FFZGlobalEmotes,
    twitchGlobal ? ((await twitchGlobal) as TwitchGlobalEmotes) : undefined,
    (await Promise.all(addedEmotes)) as readonly SevenEmoteNotInSet[]
  );
}

export class Bot {
  public emoteMatcher: Readonly<EmoteMatcher>;
  public readonly addedEmotesDatabase: Readonly<AddedEmotesDatabase>;
  public readonly twitchClipsMeiliSearchIndex: Index | undefined;
  public readonly twitchApi: Readonly<TwitchApi> | undefined;

  private readonly _emoteEndpoints: EmoteEndpoints;
  private readonly _client: Client;
  private readonly _cachedUrl: Readonly<CachedUrl>;
  private readonly _openai: ReadonlyOpenAI | undefined;
  private readonly _translate: v2.Translate | undefined;

  private readonly _clipIds: readonly string[] | undefined;

  public constructor(
    emoteEndpoints: Readonly<EmoteEndpoints>,
    client: Client,
    emoteMatcher: Readonly<EmoteMatcher>,
    addedEmotesDatabase: Readonly<AddedEmotesDatabase>,
    cachedUrl: Readonly<CachedUrl>,
    twitchClipsMeiliSearchIndex: Index | undefined,
    twitchApi: Readonly<TwitchApi> | undefined,
    openai: ReadonlyOpenAI | undefined,
    translate: v2.Translate | undefined,
    clipIds?: readonly string[]
  ) {
    this._emoteEndpoints = emoteEndpoints;
    this._client = client;
    this.emoteMatcher = emoteMatcher;
    this.addedEmotesDatabase = addedEmotesDatabase;
    this.twitchClipsMeiliSearchIndex = twitchClipsMeiliSearchIndex;
    this.twitchApi = twitchApi;
    this._openai = openai;
    this._translate = translate;
    this._cachedUrl = cachedUrl;
  }

  public async refreshEmotes(): Promise<void> {
    this.emoteMatcher = await newEmoteMatcher(this._emoteEndpoints, this.twitchApi, this.addedEmotesDatabase);
  }

  public async refreshClips(): Promise<void> {
    if (this.twitchApi === undefined || this._clipIds === undefined) return;
    const increment = 100;
    let updated = 0;
    const clipIds = await listClipIds();
    for (let i = 0; i < clipIds.length; i += increment) {
      // update list of clip ids too
      const clips = await getClipsWithGameName(this.twitchApi!, clipIds.slice(i, i + increment));
      await this.twitchClipsMeiliSearchIndex?.addDocuments(clips);
      updated += clips.length;
    }
    console.log(`Updated ${updated} of ${clipIds.length} clips.`);
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
        void emoteHandler(this.emoteMatcher, this._emoteEndpoints.sevenEmotesNotInSet, this._cachedUrl)(interaction);

        return;
      }

      if (interaction.commandName === 'clip') {
        if (this.twitchClipsMeiliSearchIndex !== undefined)
          void clipHandler(this.twitchClipsMeiliSearchIndex)(interaction);
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

      if (interaction.commandName === 'transient') {
        transientHandler()(interaction);
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
  addedEmotesDatabase: Readonly<AddedEmotesDatabase>,
  cachedUrl: Readonly<CachedUrl>,
  twitchClipsMeiliSearchIndex: Index | undefined,
  twitchApi: Readonly<TwitchApi> | undefined,
  openai: ReadonlyOpenAI | undefined,
  translate: v2.Translate | undefined
): Promise<Readonly<Bot>> {
  return new Bot(
    emoteEndpoints,
    client,
    await newEmoteMatcher(emoteEndpoints, twitchApi, addedEmotesDatabase),
    addedEmotesDatabase,
    cachedUrl,
    twitchClipsMeiliSearchIndex,
    twitchApi,
    openai,
    translate
  );
}
