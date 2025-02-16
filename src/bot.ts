import { Events, type Client } from 'discord.js';
import type { ReadonlyOpenAI, ReadonlyTranslator } from './types.js';
import type { Guild } from './guild.js';
import { addEmoteHandlerSevenTVNotInSet } from './command/add-emote.js';
import { emoteHandler } from './command/emote.js';
import { helpHandler } from './command/help.js';
import { chatgptHandler } from './command/openai.js';
import { shortestuniquesubstringsHandler } from './command/shortest-unique-substrings.js';
import { translateHandler } from './command/translate.js';
import { transientHandler } from './command/transient.js';
import { clipHandler } from './command/clip.js';
import { findTheEmojiHandler } from './command/find-the-emoji.js';
import { pingMeHandler } from './command/pingme.js';
import type { CachedUrl } from './api/cached-url.js';
import type { TwitchApi } from './api/twitch-api.js';
import type { AddedEmotesDatabase } from './api/added-emotes-database.js';
import type { PingsDatabase } from './api/ping-database.js';
import { newGuild } from './utils/constructors/new-guild.js';

export class Bot {
  readonly #client: Client;
  readonly #openai: ReadonlyOpenAI | undefined;
  readonly #translator: ReadonlyTranslator | undefined;
  readonly #twitchApi: Readonly<TwitchApi> | undefined;
  readonly #addedEmotesDatabase: Readonly<AddedEmotesDatabase>;
  readonly #pingsDatabase: Readonly<PingsDatabase>;
  readonly #cachedUrl: Readonly<CachedUrl>;
  readonly #guilds: Readonly<Guild>[];

  public constructor(
    client: Client,
    openai: ReadonlyOpenAI | undefined,
    translator: ReadonlyTranslator | undefined,
    twitchApi: Readonly<TwitchApi> | undefined,
    addedEmotesDatabase: Readonly<AddedEmotesDatabase>,
    pingsDatabase: Readonly<PingsDatabase>,
    cachedUrl: Readonly<CachedUrl>,
    guilds: readonly Readonly<Guild>[]
  ) {
    this.#client = client;
    this.#openai = openai;
    this.#translator = translator;
    this.#twitchApi = twitchApi;
    this.#addedEmotesDatabase = addedEmotesDatabase;
    this.#pingsDatabase = pingsDatabase;
    this.#cachedUrl = cachedUrl;
    this.#guilds = [...guilds];
  }

  public get client(): Readonly<Client> {
    return this.#client;
  }

  public get guilds(): readonly Readonly<Guild>[] {
    return this.#guilds;
  }
  public get twitchApi(): Readonly<TwitchApi> | undefined {
    return this.#twitchApi;
  }
  public get addedEmotesDatabase(): Readonly<AddedEmotesDatabase> {
    return this.#addedEmotesDatabase;
  }

  public get pingsDatabase(): Readonly<PingsDatabase> {
    return this.#pingsDatabase;
  }

  public registerHandlers(): void {
    this.#client.on(Events.ClientReady, () => {
      console.log(`Logged in as ${this.#client.user?.tag ?? ''}!`);
    });

    //interaction
    this.#client.on(Events.InteractionCreate, async (interaction) => {
      //interaction not
      if (!interaction.isChatInputCommand()) return;

      const { guildId, user } = interaction;
      if (guildId === null || user.bot) return;

      const guild =
        this.#guilds.find((guild_) => guild_.ids.some((id) => id === guildId)) ??
        (await (async (): Promise<Readonly<Guild>> => {
          const newGuildWithoutPersonalEmotes_ = await newGuild(
            [guildId],
            undefined,
            undefined,
            this.#addedEmotesDatabase,
            undefined
          );
          this.#guilds.push(newGuildWithoutPersonalEmotes_);

          return newGuildWithoutPersonalEmotes_;
        })());
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
        if (this.#translator !== undefined) {
          await translateHandler(this.#translator)(interaction);
        } else {
          await interaction.reply('Translate command is currently not available.');
        }
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

      if (interaction.commandName === 'findtheemoji') {
        void findTheEmojiHandler()(interaction);
        return;
      }

      if (interaction.commandName === 'pingme') {
        void pingMeHandler(this.#pingsDatabase)(interaction, this.#client);
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
