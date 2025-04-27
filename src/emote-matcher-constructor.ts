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
    const sevenTVGlobal = fetchAndJson(GLOBAL_EMOTE_ENDPOINTS.sevenTV) as Promise<SevenTVEmotes>;
    const bttvGlobal = fetchAndJson(GLOBAL_EMOTE_ENDPOINTS.bttv) as Promise<readonly BTTVEmote[]>;
    const ffzGlobal = fetchAndJson(GLOBAL_EMOTE_ENDPOINTS.ffz) as Promise<FFZGlobalEmotes>;
    const twitchGlobal = this.#twitchApi?.emotesGlobal();

    this.#sevenTVGlobal = await sevenTVGlobal;
    this.#bttvGlobal = await bttvGlobal;
    this.#ffzGlobal = await ffzGlobal;
    this.#twitchGlobal = await twitchGlobal;
  }
}

export class PersonalEmoteMatcherConstructor {
  readonly #guildIds: readonly string[];
  readonly #personalEmoteEndpoints: PersonalEmoteEndpoints | undefined;
  #sevenTVPersonal: SevenTVEmotes | undefined = undefined;
  #bttvPersonal: BTTVPersonalEmotes | undefined = undefined;
  #ffzPersonal: FFZPersonalEmotes | undefined = undefined;
  #addedEmotes: SevenTVEmoteNotInSet[] | undefined = undefined;

  private constructor(guildIds: readonly string[], personalEmoteEndpoints: PersonalEmoteEndpoints | undefined) {
    this.#guildIds = guildIds;
    this.#personalEmoteEndpoints = personalEmoteEndpoints;
  }

  public static async create(
    guildIds: readonly string[],
    personalEmoteEndpoints: PersonalEmoteEndpoints | undefined
  ): Promise<Readonly<PersonalEmoteMatcherConstructor>> {
    const personalEmoteMatcherConstructor = new PersonalEmoteMatcherConstructor(guildIds, personalEmoteEndpoints);

    const refreshBTTVAndFFZPersonalEmotes_ = personalEmoteMatcherConstructor.refreshBTTVAndFFZPersonalEmotes();
    const refreshAddedEmotes_ = personalEmoteMatcherConstructor.#refreshAddedEmotes();

    await refreshBTTVAndFFZPersonalEmotes_;
    await refreshAddedEmotes_;
    return personalEmoteMatcherConstructor;
  }

  public async constructEmoteMatcher(): Promise<Readonly<EmoteMatcher>> {
    const globalEmoteMatcherConstructor = GlobalEmoteMatcherConstructor.instance;

    if (
      globalEmoteMatcherConstructor.sevenTVGlobal === undefined ||
      globalEmoteMatcherConstructor.bttvGlobal === undefined ||
      globalEmoteMatcherConstructor.ffzGlobal === undefined
    )
      throw new Error('Global emotes not assigned.');

    const sevenTVPersonal =
      this.#personalEmoteEndpoints?.sevenTV !== undefined
        ? (fetchAndJson(this.#personalEmoteEndpoints.sevenTV) as Promise<SevenTVEmotes>)
        : undefined;
    this.#sevenTVPersonal = await sevenTVPersonal;

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

  public async refreshBTTVAndFFZPersonalEmotes(): Promise<void> {
    if (this.#personalEmoteEndpoints === undefined) return;

    const bttvPersonal =
      this.#personalEmoteEndpoints.bttv !== undefined
        ? (fetchAndJson(this.#personalEmoteEndpoints.bttv) as Promise<BTTVPersonalEmotes>)
        : undefined;
    const ffzPersonal =
      this.#personalEmoteEndpoints.ffz !== undefined
        ? (fetchAndJson(this.#personalEmoteEndpoints.ffz) as Promise<FFZPersonalEmotes>)
        : undefined;

    this.#bttvPersonal = await bttvPersonal;
    this.#ffzPersonal = await ffzPersonal;
  }

  public addSevenTVEmoteNotInSet(sevenTVEmoteNotInSet: Readonly<SevenTVEmoteNotInSet>): void {
    this.#addedEmotes?.push(sevenTVEmoteNotInSet);
  }

  async #refreshAddedEmotes(): Promise<void> {
    const globalEmoteMatcherConstructor = GlobalEmoteMatcherConstructor.instance;

    const addedEmotes = globalEmoteMatcherConstructor.addedEmotesDatabase.getAll(this.#guildIds);
    const sevenTVEmoteNotInSets = await (async (): Promise<SevenTVEmoteNotInSet[]> => {
      const sevenTVEmoteNotInSets_ = (
        (await Promise.all(
          addedEmotes.map(async (addedEmote) => fetchAndJson(addedEmote.url))
        )) as SevenTVEmoteNotInSet[]
      ).map((sevenTVEmoteNotInSet, index) => {
        const { alias } = addedEmotes[index];

        if (alias !== null) return { ...sevenTVEmoteNotInSet, name: alias };
        else return sevenTVEmoteNotInSet;
      });

      return sevenTVEmoteNotInSets_;
    })();

    this.#addedEmotes = sevenTVEmoteNotInSets;
  }
}
