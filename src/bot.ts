import type { v2 } from '@google-cloud/translate';
import type { Client } from 'discord.js';
import type { Index } from 'meilisearch';

import { EmoteMatcher } from './emoteMatcher.js';
import type {
  ReadonlyOpenAI,
  SevenEmoteNotInSet,
  BTTVEmote,
  SevenEmotes,
  BTTVPersonalEmotes,
  FFZPersonalEmotes,
  FFZGlobalEmotes
} from './types.js';
import { EMOTE_ENDPOINTS } from './paths-and-endpoints.js';
import type { CachedUrl } from './api/cached-url.js';
import { listClipIds } from './utils/list-clip-ids.js';
import { fetchAndJson } from './utils/fetch-and-json.js';
import { getClipsWithGameName, type TwitchApi } from './api/twitch-api.js';
import type { AddedEmotesDatabase } from './api/added-emote-database.js';
import { addEmoteHandlerSevenNotInSet } from './command/add-emote.js';
import { emoteHandler } from './command/emote.js';
import { helpHandler } from './command/help.js';
import { chatgptHandler } from './command/openai.js';
import { shortestuniquesubstringsHandler } from './command/shortest-unique-substrings.js';
import { translateHandler } from './command/translate.js';
import { transientHandler } from './command/transient.js';
import { clipHandler } from './command/clip.js';

async function newEmoteMatcher(
  twitchApi: Readonly<TwitchApi> | undefined,
  addedEmotesDatabase: Readonly<AddedEmotesDatabase>
): Promise<Readonly<EmoteMatcher>> {
  const sevenPersonal = fetchAndJson(EMOTE_ENDPOINTS.sevenPersonal);
  const sevenGlobal = fetchAndJson(EMOTE_ENDPOINTS.sevenGlobal);
  const bttvPersonal = fetchAndJson(EMOTE_ENDPOINTS.bttvPersonal);
  const bttvGlobal = fetchAndJson(EMOTE_ENDPOINTS.bttvGlobal);
  const ffzPersonal = fetchAndJson(EMOTE_ENDPOINTS.ffzPersonal);
  const ffzGlobal = fetchAndJson(EMOTE_ENDPOINTS.ffzGlobal);
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
    twitchGlobal ? await twitchGlobal : undefined,
    (await Promise.all(addedEmotes)) as readonly SevenEmoteNotInSet[]
  );
}

export class Bot {
  public emoteMatcher: Readonly<EmoteMatcher>;
  public readonly addedEmotesDatabase: Readonly<AddedEmotesDatabase>;
  public readonly twitchClipsMeiliSearchIndex: Index | undefined;
  public readonly twitchApi: Readonly<TwitchApi> | undefined;

  private readonly _client: Client;
  private readonly _cachedUrl: Readonly<CachedUrl>;
  private readonly _openai: ReadonlyOpenAI | undefined;
  private readonly _translate: v2.Translate | undefined;

  public constructor(
    client: Client,
    emoteMatcher: Readonly<EmoteMatcher>,
    addedEmotesDatabase: Readonly<AddedEmotesDatabase>,
    cachedUrl: Readonly<CachedUrl>,
    twitchClipsMeiliSearchIndex: Index | undefined,
    twitchApi: Readonly<TwitchApi> | undefined,
    openai: ReadonlyOpenAI | undefined,
    translate: v2.Translate | undefined
  ) {
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
    this.emoteMatcher = await newEmoteMatcher(this.twitchApi, this.addedEmotesDatabase);
  }

  public async refreshClips(): Promise<void> {
    if (this.twitchClipsMeiliSearchIndex === undefined || this.twitchApi === undefined) return;

    const increment = 100;
    let updated = 0;
    const clipIds = await listClipIds();
    for (let i = 0; i < clipIds.length; i += increment) {
      // update list of clip ids too
      const clips = await getClipsWithGameName(this.twitchApi, clipIds.slice(i, i + increment));
      void this.twitchClipsMeiliSearchIndex.updateDocuments(clips);
      updated += clips.length;
    }
    console.log(`Updated ${updated} of ${clipIds.length} clips.`);
  }

  public registerHandlers(): void {
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
        void emoteHandler(this.emoteMatcher, this._cachedUrl)(interaction);

        return;
      }

      if (interaction.commandName === 'clip') {
        if (this.twitchClipsMeiliSearchIndex !== undefined)
          void clipHandler(this.twitchClipsMeiliSearchIndex)(interaction);
        else void interaction.reply('clip command is currently not available.');

        return;
      }

      if (interaction.commandName === 'addemote') {
        await addEmoteHandlerSevenNotInSet(this)(interaction);

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
        void transientHandler()(interaction);

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

    return;
  }
}

export async function createBot(
  client: Client,
  addedEmotesDatabase: Readonly<AddedEmotesDatabase>,
  cachedUrl: Readonly<CachedUrl>,
  twitchClipsMeiliSearchIndex: Index | undefined,
  twitchApi: Readonly<TwitchApi> | undefined,
  openai: ReadonlyOpenAI | undefined,
  translate: v2.Translate | undefined
): Promise<Readonly<Bot>> {
  return new Bot(
    client,
    await newEmoteMatcher(twitchApi, addedEmotesDatabase),
    addedEmotesDatabase,
    cachedUrl,
    twitchClipsMeiliSearchIndex,
    twitchApi,
    openai,
    translate
  ) as Readonly<Bot>;
}
