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
  endpoints: Readonly<EmoteEndpoints>,
  twitchglobalhandler: Readonly<TwitchGlobalHandler> | undefined,
  db: Readonly<FileEmoteDb>
): Promise<Readonly<EmoteMatcher>> {
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
    (await bttvGlobal) as readonly BTTVEmote[],
    (await ffzPersonal) as FFZPersonalEmotes,
    (await ffzGlobal) as FFZGlobalEmotes,
    twitchGlobal ? ((await twitchGlobal) as TwitchGlobalEmotes) : undefined,
    (await Promise.all(sevenEmotesNotInSet_)) as readonly SevenEmoteNotInSet[]
  ) as Readonly<EmoteMatcher>;
}

export class Bot {
  public readonly db: Readonly<FileEmoteDb>;
  public em: Readonly<EmoteMatcher>;
  public readonly twitch: Readonly<TwitchGlobalHandler> | undefined;

  private readonly discord: Client;
  private readonly openai: ReadonlyOpenAI | undefined;
  private readonly translate: v2.Translate | undefined;
  private readonly sevenEmotesNotInSet: readonly string[] | undefined;
  private readonly emoteEndpoints: EmoteEndpoints;

  public constructor(
    emoteEndpoints: Readonly<EmoteEndpoints>,
    discord: Client,
    openai: ReadonlyOpenAI | undefined,
    translate: v2.Translate | undefined,
    twitch: Readonly<TwitchGlobalHandler> | undefined,
    db: Readonly<FileEmoteDb>,
    em: Readonly<EmoteMatcher>
  ) {
    this.emoteEndpoints = emoteEndpoints;
    this.discord = discord;
    this.openai = openai;
    this.translate = translate;
    this.twitch = twitch;
    this.db = db;
    this.em = em;
  }

  public async refreshEmotes(): Promise<void> {
    this.em = await newEmoteMatcher(this.emoteEndpoints, this.twitch, this.db);
  }

  public async validateTwitch(): Promise<void> {
    if (this.twitch) await validationHandler(this.twitch);
  }

  public registerHandlers(): void {
    //const self = this; // silence typescript warning

    this.discord.on('ready', () => {
      console.log(`Logged in as ${this.discord.user?.tag ?? ''}!`);
      return;
    });

    //interaction
    this.discord.on('interactionCreate', async (interaction) => {
      //interaction not
      if (!interaction.isChatInputCommand()) return;

      //interaction emote
      if (interaction.commandName === 'emote') {
        void emoteHandler(this.em)(interaction);
        return;
      }

      if (interaction.commandName === 'addemote') {
        await addEmoteHandlerSevenNotInSet(this, this.emoteEndpoints.sevenEmotesNotInSet)(interaction);
        return;
      }

      if (interaction.commandName === 'shortestuniquesubstrings') {
        void shortestuniquesubstringsHandler(this.em)(interaction);
        return;
      }

      if (interaction.commandName === 'chatgpt') {
        if (this.openai) void chatgptHandler(this.openai)(interaction);
        else void interaction.reply('chatgpt command is currently not available.');

        return;
      }

      if (interaction.commandName === 'translate') {
        if (this.translate) void translateHandler(this.translate)(interaction);
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
    await this.discord.login(discordToken);
  }
}

export async function createBot(
  emoteEndpoints: Readonly<EmoteEndpoints>,
  discord: Client,
  openai: ReadonlyOpenAI | undefined,
  translate: v2.Translate | undefined,
  twitch: Readonly<TwitchGlobalHandler> | undefined,
  db: Readonly<FileEmoteDb>
): Promise<Readonly<Bot>> {
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
