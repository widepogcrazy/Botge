import type { v2 } from '@google-cloud/translate';
import type { Client } from 'discord.js';

import type { ReadonlyOpenAI } from './types.js';
import type { Guild } from './guild.js';
import type { TwitchClipsMeiliSearch } from './twitch-clips-meili-search.js';
import { PersonalEmoteMatcherConstructor } from './emote-matcher-constructor.js';
import { addEmoteHandlerSevenTVNotInSet } from './command/add-emote.js';
import { emoteHandler } from './command/emote.js';
import { helpHandler } from './command/help.js';
import { chatgptHandler } from './command/openai.js';
import { shortestuniquesubstringsHandler } from './command/shortest-unique-substrings.js';
import { translateHandler } from './command/translate.js';
import { transientHandler } from './command/transient.js';
import { clipHandler } from './command/clip.js';
import type { CachedUrl } from './api/cached-url.js';
import type { TwitchApi } from './api/twitch-api.js';
import type { AddedEmotesDatabase } from './api/added-emotes-database.js';
import { newGuild } from './utils/constructors/new-guild.js';

export class Bot {
  readonly #client: Client;
  readonly #openai: ReadonlyOpenAI | undefined;
  readonly #translate: v2.Translate | undefined;
  readonly #twitchApi: Readonly<TwitchApi> | undefined;
  readonly #twitchClipsMeiliSearch: Readonly<TwitchClipsMeiliSearch> | undefined;
  readonly #addedEmotesDatabase: Readonly<AddedEmotesDatabase>;
  readonly #cachedUrl: Readonly<CachedUrl>;
  readonly #guilds: Readonly<Guild>[];

  public constructor(
    client: Client,
    openai: ReadonlyOpenAI | undefined,
    translate: v2.Translate | undefined,
    twitchApi: Readonly<TwitchApi> | undefined,
    twitchClipsMeiliSearch: Readonly<TwitchClipsMeiliSearch> | undefined,
    addedEmotesDatabase: Readonly<AddedEmotesDatabase>,
    cachedUrl: Readonly<CachedUrl>,
    guilds: readonly Readonly<Guild>[]
  ) {
    this.#client = client;
    this.#openai = openai;
    this.#translate = translate;
    this.#twitchApi = twitchApi;
    this.#twitchClipsMeiliSearch = twitchClipsMeiliSearch;
    this.#addedEmotesDatabase = addedEmotesDatabase;
    this.#cachedUrl = cachedUrl;
    this.#guilds = [...guilds];
  }

  public refreshBTTVAndFFZPersonalEmotes(): void {
    this.#guilds.forEach((guild) => {
      guild.refreshBTTVAndFFZPersonalEmotes();
    });
  }

  public refreshEmotes(): void {
    this.#guilds.forEach((guild) => {
      void guild.refreshEmoteMatcher();
    });
  }

  public refreshClips(): void {
    this.#guilds.forEach((guild) => {
      void guild.refreshClips(this.#twitchApi);
    });
  }

  public closeDatabase(): void {
    try {
      this.#addedEmotesDatabase.close();
    } catch (err) {
      console.log(`Error at closeDatabase: ${err instanceof Error ? err : 'error'}`);
    }
  }

  public validateTwitchAccessToken(): void {
    void this.#twitchApi?.validateAccessToken();
  }

  public registerHandlers(): void {
    this.#client.on('ready', () => {
      console.log(`Logged in as ${this.#client.user?.tag ?? ''}!`);
    });

    //interaction
    this.#client.on('interactionCreate', async (interaction) => {
      //interaction not
      if (!interaction.isChatInputCommand()) return;

      const { guildId, user } = interaction;
      if (guildId === null || user.bot) return;

      const guild =
        this.#guilds.find((guild_) => guild_.id === guildId) ??
        (await (async (): Promise<Readonly<Guild> | undefined> => {
          const newGuild_ = await newGuild(
            guildId,
            undefined,
            this.#twitchClipsMeiliSearch,
            this.#addedEmotesDatabase,
            new PersonalEmoteMatcherConstructor(guildId, undefined)
          );

          if (newGuild_ !== undefined) {
            this.#guilds.push(newGuild_);
          }
          return newGuild_;
        })());

      if (guild === undefined) {
        void interaction.reply('something went wrong. please try again later.');
        return;
      }
      const { emoteMatcher, twitchClipsMeiliSearchIndex } = guild;

      //interaction emote
      if (interaction.commandName === 'emote') {
        void emoteHandler(emoteMatcher, this.#cachedUrl)(interaction);
        return;
      }

      if (interaction.commandName === 'clip') {
        if (twitchClipsMeiliSearchIndex !== undefined) void clipHandler(twitchClipsMeiliSearchIndex)(interaction);
        else void interaction.reply('clip command is not available in this server.');
        return;
      }

      if (interaction.commandName === 'addemote') {
        void addEmoteHandlerSevenTVNotInSet(this.#addedEmotesDatabase, guild)(interaction);
        return;
      }

      if (interaction.commandName === 'shortestuniquesubstrings') {
        void shortestuniquesubstringsHandler(emoteMatcher)(interaction);
        return;
      }

      if (interaction.commandName === 'chatgpt') {
        if (this.#openai !== undefined) void chatgptHandler(this.#openai)(interaction);
        else void interaction.reply('chatgpt command is currently not available.');
        return;
      }

      if (interaction.commandName === 'translate') {
        if (this.#translate !== undefined) void translateHandler(this.#translate)(interaction);
        void interaction.reply('translate command is currently not available.');
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

      void interaction.reply('command not found');
      return;
    });
  }

  public async start(discordToken: string | undefined): Promise<void> {
    await this.#client.login(discordToken);
  }
}
