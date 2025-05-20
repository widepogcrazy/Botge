import { type ChatInputCommandInteraction, Events, type Client } from 'discord.js';
import { newGuild } from './utils/constructors/new-guild.js';
import { addEmoteHandlerSevenTVNotInSet } from './command/add-emote.js';
import { emoteHandler, emotesHandler, emoteListHandler } from './command/emote.js';
import { chatgptHandler } from './command/openai.js';
import { shortestuniquesubstringsHandler } from './command/shortest-unique-substrings.js';
import { translateHandler } from './command/translate.js';
import { geminiHandler } from './command/gemini.js';
import { transientHandler } from './command/transient.js';
import { clipHandler } from './command/clip.js';
import { findTheEmojiHandler } from './command/find-the-emoji.js';
import { pingMeHandler } from './command/pingme.js';
import { steamHandler } from './command/steam.js';
import { settingsHandler } from './command/settings.js';
import { buttonHandler } from './interaction/button.js';
import { autocompleteHandler } from './interaction/autocomplete.js';
import { modalSubmitHandler } from './interaction/modal-submit.js';
import { roleSelectMenuHandler } from './interaction/role-select-menu.js';
import type { CachedUrl } from './api/cached-url.js';
import type { TwitchApi } from './api/twitch-api.js';
import type { AddedEmotesDatabase } from './api/added-emotes-database.js';
import type { PingsDatabase } from './api/ping-database.js';
import type { PermittedRoleIdsDatabase } from './api/permitted-role-ids-database.js';
import type { BroadcasterNameAndPersonalEmoteSetsDatabase } from './api/broadcaster-name-and-personal-emote-sets-database.js';
import type { TwitchClipMessageBuilder } from './message-builders/twitch-clip-message-builder.js';
import type { EmoteMessageBuilder } from './message-builders/emote-message-builder.js';
import type { ReadonlyOpenAI, ReadonlyTranslator } from './types.js';
import type { Guild } from './guild.js';
import type { TwitchClipsMeiliSearch } from './twitch-clips-meili-search.js';
import type { GoogleGenAI } from '@google/genai';

const CLEANUP_MINUTES = 10;

export class Bot {
  readonly #client: Client;
  readonly #openai: ReadonlyOpenAI | undefined;
  readonly #translator: ReadonlyTranslator | undefined;
  readonly #twitchApi: Readonly<TwitchApi> | undefined;
  readonly #addedEmotesDatabase: Readonly<AddedEmotesDatabase>;
  readonly #pingsDatabase: Readonly<PingsDatabase>;
  readonly #permittedRoleIdsDatabase: Readonly<PermittedRoleIdsDatabase>;
  readonly #broadcasterNameAndPersonalEmoteSetsDatabase: Readonly<BroadcasterNameAndPersonalEmoteSetsDatabase>;
  readonly #cachedUrl: Readonly<CachedUrl>;
  readonly #guilds: Readonly<Guild>[];
  readonly #twitchClipMessageBuilders: TwitchClipMessageBuilder[];
  readonly #emoteMessageBuilders: EmoteMessageBuilder[];
  readonly #twitchClipsMeiliSearch: Readonly<TwitchClipsMeiliSearch> | undefined;
  readonly #googleGenAi: Readonly<GoogleGenAI> | undefined;
  readonly #commandHandlers: Map<
    string,
    (interaction: ChatInputCommandInteraction, guild: Readonly<Guild>) => Promise<void>
  >;

  public constructor(
    client: Client,
    openai: ReadonlyOpenAI | undefined,
    translator: ReadonlyTranslator | undefined,
    twitchApi: Readonly<TwitchApi> | undefined,
    addedEmotesDatabase: Readonly<AddedEmotesDatabase>,
    pingsDatabase: Readonly<PingsDatabase>,
    permittedRoleIdsDatabase: Readonly<PermittedRoleIdsDatabase>,
    broadcasterNameAndPersonalEmoteSetsDatabase: Readonly<BroadcasterNameAndPersonalEmoteSetsDatabase>,
    cachedUrl: Readonly<CachedUrl>,
    guilds: readonly Readonly<Guild>[],
    twitchClipsMeiliSearch: Readonly<TwitchClipsMeiliSearch> | undefined,
    googleGenAI: Readonly<GoogleGenAI> | undefined
  ) {
    this.#client = client;
    this.#openai = openai;
    this.#translator = translator;
    this.#twitchApi = twitchApi;
    this.#addedEmotesDatabase = addedEmotesDatabase;
    this.#pingsDatabase = pingsDatabase;
    this.#permittedRoleIdsDatabase = permittedRoleIdsDatabase;
    this.#broadcasterNameAndPersonalEmoteSetsDatabase = broadcasterNameAndPersonalEmoteSetsDatabase;
    this.#cachedUrl = cachedUrl;
    this.#guilds = [...guilds];
    this.#twitchClipMessageBuilders = [];
    this.#emoteMessageBuilders = [];
    this.#twitchClipsMeiliSearch = twitchClipsMeiliSearch;
    this.#googleGenAi = googleGenAI;
    this.#commandHandlers = new Map<
      string,
      (interaction: ChatInputCommandInteraction, guild: Readonly<Guild>) => Promise<void>
    >([
      ['emote', emoteHandler()],
      ['emotes', emotesHandler(this.#cachedUrl)],
      ['emotelist', emoteListHandler(this.#emoteMessageBuilders)],
      ['gemini', geminiHandler(this.#googleGenAi)],
      ['clip', clipHandler(this.#twitchClipMessageBuilders)],
      ['addemote', addEmoteHandlerSevenTVNotInSet(this.#addedEmotesDatabase)],
      ['shortestuniquesubstrings', shortestuniquesubstringsHandler(this.#emoteMessageBuilders)],
      ['chatgpt', chatgptHandler(this.#openai)],
      ['translate', translateHandler(this.#translator)],
      ['transient', transientHandler()],
      ['findtheemoji', findTheEmojiHandler()],
      ['pingme', pingMeHandler(this.#pingsDatabase, this.#client)],
      ['poe2', steamHandler('2694490')],
      ['settings', settingsHandler()]
    ]);
  }

  public get client(): Client {
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
  public get permittedRoleIdsDatabase(): Readonly<PermittedRoleIdsDatabase> {
    return this.#permittedRoleIdsDatabase;
  }
  public get broadcasterNameAndPersonalEmoteSetsDatabase(): Readonly<BroadcasterNameAndPersonalEmoteSetsDatabase> {
    return this.#broadcasterNameAndPersonalEmoteSetsDatabase;
  }

  public registerHandlers(): void {
    this.#client.on(Events.ClientReady, () => {
      console.log(`Logged in as ${this.#client.user?.tag ?? ''}!`);
    });

    //interaction
    this.#client.on(Events.InteractionCreate, async (interaction) => {
      //interaction not
      if (
        !interaction.isChatInputCommand() &&
        !interaction.isButton() &&
        !interaction.isAutocomplete() &&
        !interaction.isModalSubmit() &&
        !interaction.isRoleSelectMenu()
      )
        return;

      const { guildId, user } = interaction;
      if (guildId === null || user.bot) return;

      const guild =
        this.#guilds.find((guild_) => guild_.id === guildId) ??
        (await (async (): Promise<Readonly<Guild>> => {
          const newGuildWithoutPersonalEmotes_ = await newGuild(
            guildId,
            this.#twitchClipsMeiliSearch,
            this.#addedEmotesDatabase,
            this.#permittedRoleIdsDatabase,
            null,
            undefined
          );
          this.#guilds.push(newGuildWithoutPersonalEmotes_);

          return newGuildWithoutPersonalEmotes_;
        })());
      const { emoteMatcher, twitchClipsMeiliSearchIndex, uniqueCreatorNames, uniqueGameIds } = guild;

      if (interaction.isModalSubmit()) {
        void modalSubmitHandler(
          this.#twitchClipMessageBuilders,
          this.#emoteMessageBuilders,
          guild,
          this.#broadcasterNameAndPersonalEmoteSetsDatabase,
          this.#twitchApi
        )(interaction);
        return;
      }

      if (interaction.isAutocomplete()) {
        void autocompleteHandler(
          emoteMatcher,
          twitchClipsMeiliSearchIndex,
          uniqueCreatorNames,
          uniqueGameIds
        )(interaction);
        return;
      }

      if (interaction.isRoleSelectMenu()) {
        void roleSelectMenuHandler(guild, this.#permittedRoleIdsDatabase)(interaction);
        return;
      }

      if (interaction.isButton()) {
        const emoteMessageBuilder = await buttonHandler(
          this.#twitchClipMessageBuilders,
          this.#emoteMessageBuilders,
          guild,
          this.#addedEmotesDatabase,
          this.#permittedRoleIdsDatabase
        )(interaction);

        if (emoteMessageBuilder !== undefined) this.#emoteMessageBuilders.push(emoteMessageBuilder);
        return;
      }

      const commandHandler = this.#commandHandlers.get(interaction.commandName);
      if (commandHandler === undefined) return;
      void commandHandler(interaction, guild);
      // TODO: error handling

      return;
    });
  }

  public cleanUpMessageBuilders(): void {
    const timeNow = Date.now();

    for (const [index, twitchClipMessageBuilder] of this.#twitchClipMessageBuilders.entries()) {
      const difference = timeNow - twitchClipMessageBuilder.interaction.createdAt.getTime();

      if (difference > CLEANUP_MINUTES * 60000) {
        this.#twitchClipMessageBuilders.splice(index, 1);
        this.cleanUpMessageBuilders();
        return;
      }
    }

    for (const [index, emoteMessageBuilder] of this.#emoteMessageBuilders.entries()) {
      const difference = timeNow - emoteMessageBuilder.interaction.createdAt.getTime();

      if (difference > CLEANUP_MINUTES * 60000) {
        this.#emoteMessageBuilders.splice(index, 1);
        this.cleanUpMessageBuilders();
        return;
      }
    }
  }

  public async start(discordToken: string | undefined): Promise<void> {
    await this.#client.login(discordToken);
  }
}
