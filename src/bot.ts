import { Events, type Client } from 'discord.js';
import { newGuild } from './utils/constructors/new-guild.js';
import { addEmoteHandlerSevenTVNotInSet } from './command/add-emote.js';
import { emoteHandler, emotesHandler, emoteListHandler } from './command/emote.js';
import { chatgptHandler } from './command/openai.js';
import { shortestuniquesubstringsHandler } from './command/shortest-unique-substrings.js';
import { translateHandler } from './command/translate.js';
import { transientHandler } from './command/transient.js';
import { clipHandler } from './command/clip.js';
import { findTheEmojiHandler } from './command/find-the-emoji.js';
import { pingMeHandler } from './command/pingme.js';
import { assignEmoteSetsHandler } from './command/assing-emote-sets.js';
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

export const CLEANUP_MINUTES = 10;
const MAX_TWITCH_CLIP_MESSAGE_BUILDERS_LENGTH = 15;

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
    twitchClipsMeiliSearch: Readonly<TwitchClipsMeiliSearch> | undefined
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

      const { commandName } = interaction;

      //interaction emote
      if (commandName === 'emote') {
        void emoteHandler(emoteMatcher)(interaction);
        return;
      }

      if (commandName === 'emotes') {
        void emotesHandler(emoteMatcher, this.#cachedUrl)(interaction);
        return;
      }

      if (commandName === 'emotelist') {
        //is it a good idea to await here?
        const emoteMessageBuilder = await emoteListHandler(emoteMatcher)(interaction);
        if (emoteMessageBuilder !== undefined) this.#emoteMessageBuilders.push(emoteMessageBuilder);
        return;
      }

      if (commandName === 'clip') {
        if (twitchClipsMeiliSearchIndex === undefined) {
          void interaction.reply('clip command is not available in this server.');
          return;
        } else if (guild.broadcasterName === null) {
          void interaction.reply('clip command is not available without streamer Twitch username.');
          return;
        }

        if (this.#twitchClipMessageBuilders.length >= MAX_TWITCH_CLIP_MESSAGE_BUILDERS_LENGTH) {
          void interaction.reply(
            `${this.#twitchClipMessageBuilders.length} clip commands are currently in use. Please wait at most ${CLEANUP_MINUTES} minutes.`
          );
          return;
        }

        //is it a good idea to await here?
        const twitchClipMessageBuilder = await clipHandler(twitchClipsMeiliSearchIndex)(interaction);
        if (twitchClipMessageBuilder !== undefined) this.#twitchClipMessageBuilders.push(twitchClipMessageBuilder);
        return;
      }

      if (commandName === 'addemote') {
        void addEmoteHandlerSevenTVNotInSet(this.#addedEmotesDatabase, guild)(interaction);
        return;
      }

      if (commandName === 'shortestuniquesubstrings') {
        const emoteMessageBuilder = await shortestuniquesubstringsHandler(emoteMatcher)(interaction);
        if (emoteMessageBuilder !== undefined) this.#emoteMessageBuilders.push(emoteMessageBuilder);
        return;
      }

      if (commandName === 'chatgpt') {
        if (this.#openai !== undefined) void chatgptHandler(this.#openai)(interaction);
        else void interaction.reply('chatgpt command is currently not available.');
        return;
      }

      if (commandName === 'translate') {
        if (this.#translator !== undefined) void translateHandler(this.#translator)(interaction);
        else void interaction.reply('Translate command is currently not available.');
        return;
      }

      if (commandName === 'transient') {
        void transientHandler()(interaction);
        return;
      }

      if (commandName === 'findtheemoji') {
        void findTheEmojiHandler()(interaction);
        return;
      }

      if (commandName === 'pingme') {
        void pingMeHandler(this.#pingsDatabase, this.#client)(interaction);
        return;
      }

      if (commandName === 'poe2') {
        void steamHandler('2694490', guild.id)(interaction);
        return;
      }

      if (commandName === 'assignemotesets') {
        void assignEmoteSetsHandler()(interaction);
        return;
      }

      if (commandName === 'settings') {
        void settingsHandler(guild)(interaction);
        return;
      }

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
