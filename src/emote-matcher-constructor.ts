import { EmoteMatcher } from './emote-matcher.js';
import type {
  SevenTVEmoteNotInSet,
  BTTVEmote,
  BTTVPersonalEmotes,
  FFZPersonalEmotes,
  FFZGlobalEmotes,
  SevenTVEmotes,
  TwitchGlobalEmotes
} from './types.js';
import { GLOBAL_EMOTE_ENDPOINTS, type PersonalEmoteEndpoints } from './paths-and-endpoints.js';
import type { TwitchApi } from './api/twitch-api.js';
import type { AddedEmotesDatabase } from './api/added-emotes-database.js';
import { fetchAndJson } from './utils/fetch-and-json.js';

export class GlobalEmoteMatcherConstructor {
  static #instance: Readonly<GlobalEmoteMatcherConstructor> | undefined = undefined;
  readonly #twitchApi: Readonly<TwitchApi> | undefined = undefined;
  readonly #addedEmotesDatabase: Readonly<AddedEmotesDatabase>;
  #sevenTVGlobal: SevenTVEmotes | undefined = undefined;
  #bttvGlobal: readonly BTTVEmote[] | undefined = undefined;
  #ffzGlobal: FFZGlobalEmotes | undefined = undefined;
  #twitchGlobal: TwitchGlobalEmotes | undefined = undefined;

  private constructor(twitchApi: Readonly<TwitchApi> | undefined, addedEmotesDatabase: Readonly<AddedEmotesDatabase>) {
    this.#twitchApi = twitchApi;
    this.#addedEmotesDatabase = addedEmotesDatabase;
  }

  public static get instance(): Readonly<GlobalEmoteMatcherConstructor> {
    if (GlobalEmoteMatcherConstructor.#instance === undefined)
      throw new Error('GlobalEmoteMatcherConstructor instance not created.');

    return GlobalEmoteMatcherConstructor.#instance;
  }

  public get addedEmotesDatabase(): Readonly<AddedEmotesDatabase> {
    return this.#addedEmotesDatabase;
  }
  public get twitchApi(): Readonly<TwitchApi> | undefined {
    return this.#twitchApi;
  }
  public get sevenTVGlobal(): SevenTVEmotes | undefined {
    return this.#sevenTVGlobal;
  }
  public get bttvGlobal(): readonly BTTVEmote[] | undefined {
    return this.#bttvGlobal;
  }
  public get ffzGlobal(): FFZGlobalEmotes | undefined {
    return this.#ffzGlobal;
  }
  public get twitchGlobal(): TwitchGlobalEmotes | undefined {
    return this.#twitchGlobal;
  }

  public static async createInstance(
    twitchApi: Readonly<TwitchApi> | undefined,
    addedEmotesDatabase: Readonly<AddedEmotesDatabase>
  ): Promise<void> {
    GlobalEmoteMatcherConstructor.#instance = new GlobalEmoteMatcherConstructor(twitchApi, addedEmotesDatabase);
    await GlobalEmoteMatcherConstructor.#instance.refreshGlobalEmotes();
  }

  public async refreshGlobalEmotes(): Promise<void> {
    const sevenTVGlobal = (async (): Promise<SevenTVEmotes | undefined> => {
      try {
        return (await fetchAndJson(GLOBAL_EMOTE_ENDPOINTS.sevenTV)) as SevenTVEmotes;
      } catch (error: unknown) {
        console.error(`Error fetching sevenTVGlobal: ${error instanceof Error ? error : 'error'}`);
        return undefined;
      }
    })();
    const bttvGlobal = (async (): Promise<readonly BTTVEmote[] | undefined> => {
      try {
        return (await fetchAndJson(GLOBAL_EMOTE_ENDPOINTS.bttv)) as readonly BTTVEmote[];
      } catch (error: unknown) {
        console.error(`Error fetching bttvGlobal: ${error instanceof Error ? error : 'error'}`);
        return undefined;
      }
    })();
    const ffzGlobal = (async (): Promise<FFZGlobalEmotes | undefined> => {
      try {
        return (await fetchAndJson(GLOBAL_EMOTE_ENDPOINTS.ffz)) as FFZGlobalEmotes;
      } catch (error: unknown) {
        console.error(`Error fetching ffzGlobal: ${error instanceof Error ? error : 'error'}`);
        return undefined;
      }
    })();
    const twitchGlobal = this.#twitchApi?.emotesGlobal();

    //keep the old value if the new value is undefined
    this.#sevenTVGlobal = (await sevenTVGlobal) ?? this.#sevenTVGlobal;
    this.#bttvGlobal = (await bttvGlobal) ?? this.#bttvGlobal;
    this.#ffzGlobal = (await ffzGlobal) ?? this.#ffzGlobal;
    this.#twitchGlobal = (await twitchGlobal) ?? this.#twitchGlobal;
  }
}

export class PersonalEmoteMatcherConstructor {
  readonly #guildId: string;
  readonly #personalEmoteEndpoints: Readonly<PersonalEmoteEndpoints> | undefined;
  #sevenTVPersonal: SevenTVEmotes | undefined = undefined;
  #bttvPersonal: BTTVPersonalEmotes | undefined = undefined;
  #ffzPersonal: FFZPersonalEmotes | undefined = undefined;
  #addedEmotes: readonly SevenTVEmoteNotInSet[] | undefined = undefined;
  #bttvAndFFZPersonalEmotesAssigned = false;
  #addedEmotesAssigned = false;

  public constructor(guildId: string, personalEmoteEndpoints: Readonly<PersonalEmoteEndpoints> | undefined) {
    this.#guildId = guildId;
    this.#personalEmoteEndpoints = personalEmoteEndpoints;
  }

  public async refreshBTTVAndFFZPersonalEmotes(): Promise<void> {
    const bttvPersonal = (async (): Promise<BTTVPersonalEmotes | undefined> => {
      try {
        return this.#personalEmoteEndpoints?.bttv !== undefined
          ? ((await fetchAndJson(this.#personalEmoteEndpoints.bttv)) as BTTVPersonalEmotes)
          : undefined;
      } catch (error: unknown) {
        console.error(`Error fetching bttvPersonal: ${error instanceof Error ? error : 'error'}`);
        return undefined;
      }
    })();
    const ffzPersonal = (async (): Promise<FFZPersonalEmotes | undefined> => {
      try {
        return this.#personalEmoteEndpoints?.ffz !== undefined
          ? ((await fetchAndJson(this.#personalEmoteEndpoints.ffz)) as FFZPersonalEmotes)
          : undefined;
      } catch (error: unknown) {
        console.error(`Error fetching ffzPersonal: ${error instanceof Error ? error : 'error'}`);
        return undefined;
      }
    })();

    this.#bttvPersonal = (await bttvPersonal) ?? this.#bttvPersonal;
    this.#ffzPersonal = (await ffzPersonal) ?? this.#ffzPersonal;
    this.#bttvAndFFZPersonalEmotesAssigned = true;
  }

  public async refreshAddedEmotes(): Promise<void> {
    const globalEmoteMatcherConstructor = GlobalEmoteMatcherConstructor.instance;

    const addedEmotes = (async (): Promise<readonly SevenTVEmoteNotInSet[] | undefined> => {
      try {
        return await Promise.all(
          globalEmoteMatcherConstructor.addedEmotesDatabase
            .getAll(this.#guildId)
            .map(async (addedEmote) => fetchAndJson(addedEmote.url)) as readonly Promise<SevenTVEmoteNotInSet>[]
        );
      } catch (error: unknown) {
        console.error(`Error fetching addedEmotes: ${error instanceof Error ? error : 'error'}`);
        return undefined;
      }
    })();

    this.#addedEmotes = (await addedEmotes) ?? this.#addedEmotes;
    this.#addedEmotesAssigned = true;
  }

  public async constructEmoteMatcher(): Promise<Readonly<EmoteMatcher> | undefined> {
    if (!this.#bttvAndFFZPersonalEmotesAssigned || !this.#addedEmotesAssigned)
      throw new Error('BTTV and FFZ personal emotes or Added Emotes are not assigned.');

    const globalEmoteMatcherConstructor = GlobalEmoteMatcherConstructor.instance;
    if (
      globalEmoteMatcherConstructor.sevenTVGlobal === undefined ||
      globalEmoteMatcherConstructor.bttvGlobal === undefined ||
      globalEmoteMatcherConstructor.ffzGlobal === undefined
    )
      throw new Error('Global emotes not assigned.');

    const sevenTVPersonal = (async (): Promise<SevenTVEmotes | undefined> => {
      try {
        return this.#personalEmoteEndpoints?.sevenTV !== undefined
          ? ((await fetchAndJson(this.#personalEmoteEndpoints.sevenTV)) as SevenTVEmotes)
          : undefined;
      } catch (error: unknown) {
        console.error(`Error fetching sevenTVPersonal: ${error instanceof Error ? error : 'error'}`);
        return undefined;
      }
    })();

    this.#sevenTVPersonal = (await sevenTVPersonal) ?? this.#sevenTVPersonal;

    return new EmoteMatcher(
      globalEmoteMatcherConstructor.sevenTVGlobal,
      globalEmoteMatcherConstructor.bttvGlobal,
      globalEmoteMatcherConstructor.ffzGlobal,
      globalEmoteMatcherConstructor.twitchGlobal,
      this.#sevenTVPersonal,
      this.#bttvPersonal,
      this.#ffzPersonal,
      this.#addedEmotes
    );
  }
}
