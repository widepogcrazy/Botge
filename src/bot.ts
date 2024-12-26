import type { v2 } from '@google-cloud/translate';
import type { Client } from 'discord.js';

import type { ReadonlyOpenAI } from './types.js';
import type { Guild } from './guild.js';
import type { CachedUrl } from './api/cached-url.js';
import type { TwitchApi } from './api/twitch-api.js';
import type { AddedEmotesDatabase } from './api/database/added-emotes-database.js';
import { addEmoteHandlerSevenNotInSet } from './command/add-emote.js';
import { emoteHandler } from './command/emote.js';
import { helpHandler } from './command/help.js';
import { chatgptHandler } from './command/openai.js';
import { shortestuniquesubstringsHandler } from './command/shortest-unique-substrings.js';
import { translateHandler } from './command/translate.js';
import { transientHandler } from './command/transient.js';
import { clipHandler } from './command/clip.js';

export class Bot {
  private readonly _client: Client;
  private readonly _openai: ReadonlyOpenAI | undefined;
  private readonly _translate: v2.Translate | undefined;
  private readonly _twitchApi: Readonly<TwitchApi> | undefined;
  private readonly _addedEmotesDatabase: Readonly<AddedEmotesDatabase>;
  private readonly _cachedUrl: Readonly<CachedUrl>;
  private readonly _guilds: readonly Readonly<Guild>[];

  public constructor(
    client: Client,
    openai: ReadonlyOpenAI | undefined,
    translate: v2.Translate | undefined,
    twitchApi: Readonly<TwitchApi> | undefined,
    addedEmotesDatabase: Readonly<AddedEmotesDatabase>,
    cachedUrl: Readonly<CachedUrl>,
    guilds: readonly Readonly<Guild>[]
  ) {
    this._client = client;
    this._openai = openai;
    this._translate = translate;
    this._twitchApi = twitchApi;
    this._addedEmotesDatabase = addedEmotesDatabase;
    this._cachedUrl = cachedUrl;
    this._guilds = guilds;
  }

  public refreshEmotes(): void {
    this._guilds.forEach((guild) => {
      void guild.refreshEmotes(this._twitchApi, this._addedEmotesDatabase);
    });
  }

  public refreshClips(): void {
    this._guilds.forEach((guild) => {
      void guild.refreshClips(this._twitchApi);
    });
  }

  public closeDatabase(): void {
    try {
      this._addedEmotesDatabase.close();
    } catch (err) {
      console.log(`Error at closeDatabase: ${err instanceof Error ? err : 'error'}`);
    }
  }

  public validateTwitchAccessToken(): void {
    if (this._twitchApi !== undefined) void this._twitchApi.validateAccessToken();
  }

  public registerHandlers(): void {
    this._client.on('ready', () => {
      console.log(`Logged in as ${this._client.user?.tag ?? ''}!`);

      return;
    });

    //interaction
    this._client.on('interactionCreate', (interaction) => {
      //interaction not
      if (!interaction.isChatInputCommand()) return;

      const { guildId } = interaction;
      if (interaction.guildId === null) return;

      const guild = this._guilds.find((guild_) => guild_.id === guildId);
      if (guild === undefined) return;

      const emoteMatcher = guild.getEmoteMatcher();
      const twitchClipsMeiliSearchIndex = guild.getTwitchClipsMeiliSearchIndex();

      //interaction emote
      if (interaction.commandName === 'emote') {
        void emoteHandler(emoteMatcher, this._cachedUrl)(interaction);
        return;
      }

      if (interaction.commandName === 'clip') {
        if (twitchClipsMeiliSearchIndex !== undefined) void clipHandler(twitchClipsMeiliSearchIndex)(interaction);
        else void interaction.reply('clip command is currently not available.');
        return;
      }

      if (interaction.commandName === 'addemote') {
        void addEmoteHandlerSevenNotInSet(this._twitchApi, this._addedEmotesDatabase, guild)(interaction);
        return;
      }

      if (interaction.commandName === 'shortestuniquesubstrings') {
        void shortestuniquesubstringsHandler(emoteMatcher)(interaction);
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

      void interaction.reply('command not found');
      return;
    });
  }

  public async start(discordToken: string | undefined): Promise<void> {
    await this._client.login(discordToken);

    return;
  }
}
