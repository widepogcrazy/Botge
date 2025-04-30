import type {
  SevenTVEmoteNotInSet,
  BTTVEmote,
  SevenTVEmotes,
  BTTVPersonalEmotes,
  FFZPersonalEmotes,
  FFZGlobalEmotes,
  TwitchGlobalEmotes,
  AssetInfo
} from './types.js';

import {
  sevenTVInSetToAsset,
  sevenTVNotInSetToAsset,
  bttvToAsset,
  ffzToAsset,
  twitchToAsset
} from './utils/emote-to-asset.js';

const FFZGLOBALSETSKEY = 3;

class EmoteNode {
  public exact: boolean;
  public highestPriority: number;
  public assets: AssetInfo[];
  public uniquePath: boolean;

  public constructor(exact: boolean, priority: number, asset: AssetInfo) {
    this.exact = exact;
    this.highestPriority = priority;
    this.assets = [asset];
    this.uniquePath = true;
  }
}

class SuffixTree {
  readonly #paths: Map<string, SuffixTree>;
  #data: EmoteNode | undefined;

  public constructor() {
    this.#paths = new Map();
    this.#data = undefined;
  }

  public addAllSuffix(asset: AssetInfo, priority: number): void {
    const normalized = asset.name.toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
      this._addAllSuffix(normalized.slice(i), priority, asset, i === 0);
    }
  }

  public query(suffix: string): AssetInfo | undefined {
    return this._query(suffix.toLowerCase(), suffix);
  }

  public queryArray(suffix: string, max?: number, sort?: boolean): readonly AssetInfo[] | undefined {
    return this._queryArray(suffix.toLowerCase(), max, sort);
  }

  public queryUnique(suffix: string, original: string): boolean {
    return this._queryUnique(suffix.toLowerCase(), original);
  }

  public queryExact(suffix: string): boolean {
    return this._queryExact(suffix.toLowerCase(), suffix);
  }

  private _addAllSuffix(suffix: string, priority: number, asset: AssetInfo, fromFullString: boolean): void {
    const exact = fromFullString && suffix === '';

    if (this.#data === undefined) {
      this.#data = new EmoteNode(exact, priority, asset);
    } else {
      this.#data.uniquePath = false;
      if ((this.#data.exact && exact) || (!this.#data.exact && !exact)) {
        if (priority > this.#data.highestPriority) {
          this.#data.highestPriority = priority;
          this.#data.assets.unshift(asset);
        } else {
          this.#data.assets.push(asset);
        }
      } else if (!this.#data.exact && exact) {
        this.#data.exact = exact;
        this.#data.highestPriority = priority;
        this.#data.assets.unshift(asset);
      }
    }

    if (suffix !== '') {
      const tree = this.#getOrAddTree(suffix.charAt(0));
      tree?._addAllSuffix(suffix.slice(1), priority, asset, fromFullString);
      return;
    }
  }

  private _query(normalizedSuffix: string, original: string): AssetInfo | undefined {
    if (normalizedSuffix === '') {
      if (this.#data === undefined) return undefined;
      // reached the end of the query string

      if (this.#data.assets.length === 1) return this.#data.assets[0];

      for (const asset of this.#data.assets) {
        // exact match and case match
        if (asset.name === original) return asset;
      }

      if (this.#data.assets.length > 0) return this.#data.assets[0];

      return undefined;
    }

    const nextChar = normalizedSuffix.charAt(0);
    if (!this.#paths.has(nextChar)) return undefined;
    return this.#paths.get(nextChar)?._query(normalizedSuffix.slice(1), original);
  }

  private _queryArray(normalizedSuffix: string, max?: number, sort?: boolean): readonly AssetInfo[] | undefined {
    if (normalizedSuffix === '') {
      const assets: AssetInfo[] = [];

      for (const asset of this.#data?.assets ?? []) {
        if (asset.name.includes(normalizedSuffix) && !assets.includes(asset)) assets.push(asset);
      }

      const pathsMapIterator: Readonly<MapIterator<readonly [string, SuffixTree]>> = this.#paths.entries();
      let pathsMapIteratorNextValue: readonly [string, SuffixTree] | undefined = pathsMapIterator.next().value;

      while (pathsMapIteratorNextValue !== undefined) {
        const pathsMapIteratorNextAssets: readonly AssetInfo[] | undefined = pathsMapIteratorNextValue[1].#data?.assets;

        for (const asset of pathsMapIteratorNextAssets ?? []) {
          if (asset.name.includes(normalizedSuffix) && !assets.includes(asset)) assets.push(asset);
        }

        pathsMapIteratorNextValue = pathsMapIterator.next().value;
        continue;
      }

      //reached the end of the iteration, return
      if (sort !== undefined && sort) {
        assets.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
      }

      if (max !== undefined) return assets.slice(0, max);
      else return assets;
    }

    const nextChar = normalizedSuffix.charAt(0);
    if (!this.#paths.has(nextChar)) return undefined;
    return this.#paths.get(nextChar)?._queryArray(normalizedSuffix.slice(1), max, sort);
  }

  private _queryUnique(normalizedSuffix: string, original: string): boolean {
    if (normalizedSuffix === '') {
      if (this.#data === undefined) return false;
      const [asset] = this.#data.assets;

      if (this.#paths.size === 0) {
        if (!this.#data.uniquePath) return false;
        if (asset.name === original) return true;
      } else if (this.#paths.size === 1) {
        const pathsMapIterator: Readonly<MapIterator<readonly [string, SuffixTree]>> = this.#paths.entries();
        let pathsMapIteratorNextValue: readonly [string, SuffixTree] | undefined = pathsMapIterator.next().value;

        while (pathsMapIteratorNextValue !== undefined) {
          const pathsMapIteratorNext = pathsMapIteratorNextValue[1].#data;

          if (pathsMapIteratorNext?.assets === undefined) {
            pathsMapIteratorNextValue = pathsMapIterator.next().value;
            continue;
          }

          if (!pathsMapIteratorNext.uniquePath) return false;
          if (asset.name !== original) return false;

          pathsMapIteratorNextValue = pathsMapIterator.next().value;
          continue;
        }

        //reached the end of the iteration, return true
        return true;
      }
    }

    const nextChar = normalizedSuffix.charAt(0);
    if (!this.#paths.has(nextChar)) return false;
    return this.#paths.get(nextChar)?._queryUnique(normalizedSuffix.slice(1), original) ?? false;
  }

  private _queryExact(normalizedSuffix: string, original: string): boolean {
    if (normalizedSuffix === '') {
      if (this.#data === undefined) return false;
      // reached the end of the query string
      for (const asset of this.#data.assets) {
        // exact match and case match
        if (asset.name === original) return true;
      }

      return false;
    }

    const nextChar = normalizedSuffix.charAt(0);
    if (!this.#paths.has(nextChar)) return false;
    return this.#paths.get(nextChar)?._queryExact(normalizedSuffix.slice(1), original) ?? false;
  }

  #getOrAddTree(char: string): SuffixTree | undefined {
    if (!this.#paths.has(char)) this.#paths.set(char, new SuffixTree());
    return this.#paths.get(char);
  }
}

export class EmoteMatcher {
  readonly #root: Readonly<SuffixTree>;
  readonly #priority: number;

  public constructor(
    sevenGlobal: SevenTVEmotes,
    bttvGlobal: readonly BTTVEmote[],
    ffzGlobal: FFZGlobalEmotes,
    twitchGlobal: TwitchGlobalEmotes | undefined,
    sevenPersonal: SevenTVEmotes | undefined,
    bttvPersonal: BTTVPersonalEmotes | undefined,
    ffzPersonal: FFZPersonalEmotes | undefined,
    sevenNotInSet: readonly Readonly<SevenTVEmoteNotInSet>[] | undefined
  ) {
    this.#root = new SuffixTree();
    let priority = arguments.length;

    for (const emote of sevenGlobal.emotes) this.#root.addAllSuffix(sevenTVInSetToAsset(emote), priority);
    priority--;

    for (const emote of bttvGlobal) this.#root.addAllSuffix(bttvToAsset(emote), priority);
    priority--;

    for (const emote of ffzGlobal.sets[`${FFZGLOBALSETSKEY}`].emoticons)
      this.#root.addAllSuffix(ffzToAsset(emote), priority);
    priority--;

    for (const emote of twitchGlobal?.data ?? []) this.#root.addAllSuffix(twitchToAsset(emote), priority);
    if (twitchGlobal !== undefined) priority--;

    for (const emote of sevenPersonal?.emotes ?? []) this.#root.addAllSuffix(sevenTVInSetToAsset(emote), priority);
    if (sevenPersonal !== undefined) priority--;

    for (const emote of bttvPersonal?.channelEmotes ?? []) this.#root.addAllSuffix(bttvToAsset(emote), priority);
    if (bttvPersonal !== undefined) priority--;

    for (const emote of bttvPersonal?.sharedEmotes ?? []) this.#root.addAllSuffix(bttvToAsset(emote), priority);
    if (bttvPersonal !== undefined) priority--;

    for (const emote of ffzPersonal?.sets[ffzPersonal.room.set].emoticons ?? [])
      this.#root.addAllSuffix(ffzToAsset(emote), priority);
    if (ffzPersonal !== undefined) priority--;

    for (const emote of sevenNotInSet ?? []) {
      //there may be a case where an emote was added with /addemote
      //and afterwards added to the channel
      //or it was added to 7tv global emotes
      if (emote.error !== undefined) continue;
      if (this.matchSingleExact(emote.name)) continue;

      this.#root.addAllSuffix(sevenTVNotInSetToAsset(emote), priority);
    }

    this.#priority = priority;
  }

  public matchSingle(query: string): AssetInfo | undefined {
    return this.#root.query(query);
  }

  public matchSingleArray(query: string, max?: number, sort?: boolean): readonly AssetInfo[] | undefined {
    return this.#root.queryArray(query, max, sort);
  }

  public matchSingleUnique(query: string, original: string): boolean {
    return this.#root.queryUnique(query, original);
  }

  public matchSingleExact(query: string): boolean {
    return this.#root.queryExact(query);
  }

  // returns undefined for unmatched
  public matchMulti(queries: readonly string[]): readonly (AssetInfo | undefined)[] {
    return queries.map((query) => (query.length !== 1 ? this.#root.query(query) : undefined));
  }

  public addSevenTVEmoteNotInSetSuffix(emote: Readonly<SevenTVEmoteNotInSet>): void {
    this.#root.addAllSuffix(sevenTVNotInSetToAsset(emote), this.#priority);
  }
}
