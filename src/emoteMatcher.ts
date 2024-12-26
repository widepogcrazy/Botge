import type {
  SevenEmoteNotInSet,
  BTTVEmote,
  SevenEmotes,
  BTTVPersonalEmotes,
  FFZPersonalEmotes,
  FFZGlobalEmotes,
  TwitchGlobalEmotes,
  AssetInfo
} from './types.js';

import {
  sevenInSetToAsset,
  sevenNotInSetToAsset,
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
  private readonly _paths: Map<string, SuffixTree>;
  private _data: EmoteNode | undefined;

  public constructor() {
    this._paths = new Map();
    this._data = undefined;
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

  public queryUnique(suffix: string, original: string): boolean {
    return this._queryUnique(suffix.toLowerCase(), original);
  }

  public queryExact(suffix: string): boolean {
    return this._queryExact(suffix.toLowerCase(), suffix);
  }

  private _getOrAddTree(char: string): SuffixTree | undefined {
    if (!this._paths.has(char)) {
      this._paths.set(char, new SuffixTree());
    }
    return this._paths.get(char);
  }

  private _addAllSuffix(suffix: string, priority: number, asset: AssetInfo, fromFullString: boolean): void {
    const exact = fromFullString && suffix === '';

    if (this._data === undefined) {
      this._data = new EmoteNode(exact, priority, asset);
    } else {
      this._data.uniquePath = false;
      if (this._data.exact && exact) {
        if (priority > this._data.highestPriority) {
          this._data.highestPriority = priority;
          this._data.assets.unshift(asset);
        } else {
          this._data.assets.push(asset);
        }
      } else if (!this._data.exact && !exact) {
        if (priority > this._data.highestPriority) {
          this._data.highestPriority = priority;
          this._data.assets = [asset];
        }
      } else if (!this._data.exact && exact) {
        // replace
        this._data.exact = exact;
        this._data.highestPriority = priority;
        this._data.assets = [asset];
      }
    }

    if (suffix !== '') {
      const tree = this._getOrAddTree(suffix.charAt(0));
      tree?._addAllSuffix(suffix.slice(1), priority, asset, fromFullString);
      return;
    }
  }

  private _query(normalizedSuffix: string, original: string): AssetInfo | undefined {
    if (normalizedSuffix === '') {
      if (this._data === undefined) return undefined;
      // reached the end of the query string

      if (this._data.assets.length === 1) return this._data.assets[0];

      for (const asset of this._data.assets) {
        // exact match and case match
        if (asset.name === original) return asset;
      }

      if (this._data.assets.length > 0) return this._data.assets[0];

      return undefined;
    }

    const nextChar = normalizedSuffix.charAt(0);
    if (!this._paths.has(nextChar)) return undefined;
    return this._paths.get(nextChar)?._query(normalizedSuffix.slice(1), original);
  }

  private _queryUnique(normalizedSuffix: string, original: string): boolean {
    if (normalizedSuffix === '') {
      if (this._data === undefined) return false;
      // reached the end of the query string
      if (this._data.assets.length === 1) {
        if (this._paths.size === 0) {
          const [asset] = this._data.assets;
          if (!this._data.uniquePath) return false;
          if (asset.name === original) return true;
        } else if (this._paths.size === 1) {
          const pathsMapIterator: Readonly<MapIterator<readonly [string, SuffixTree]>> = this._paths.entries();
          let pathsMapIteratorNextValue: readonly [string, SuffixTree] | undefined = pathsMapIterator.next().value;

          while (pathsMapIteratorNextValue !== undefined) {
            const pathsMapIteratorNextAssets: readonly AssetInfo[] | undefined =
              pathsMapIteratorNextValue[1]._data?.assets;

            if (pathsMapIteratorNextAssets === undefined) {
              pathsMapIteratorNextValue = pathsMapIterator.next().value;
              continue;
            }
            if (pathsMapIteratorNextAssets.length === 1) {
              const [asset] = this._data.assets;

              if (!this._data.uniquePath) return false;
              if (asset.name === original) {
                pathsMapIteratorNextValue = pathsMapIterator.next().value;
                continue;
              } else {
                return false;
              }
            } else {
              return false;
            }
          }
          return true;
        }
      }
      return false;
    }

    const nextChar = normalizedSuffix.charAt(0);
    if (!this._paths.has(nextChar)) return false;
    return this._paths.get(nextChar)?._queryUnique(normalizedSuffix.slice(1), original) ?? false;
  }

  private _queryExact(normalizedSuffix: string, original: string): boolean {
    if (normalizedSuffix === '') {
      if (this._data === undefined) return false;
      // reached the end of the query string
      for (const asset of this._data.assets) {
        // exact match and case match
        if (asset.name === original) return true;
      }

      return false;
    }

    const nextChar = normalizedSuffix.charAt(0);
    if (!this._paths.has(nextChar)) return false;
    return this._paths.get(nextChar)?._queryExact(normalizedSuffix.slice(1), original) ?? false;
  }
}

export class EmoteMatcher {
  private readonly _root: SuffixTree;

  public constructor(
    sevenPersonal: SevenEmotes | undefined,
    sevenGlobal: SevenEmotes | undefined,
    bttvPersonal: BTTVPersonalEmotes | undefined,
    bttvGlobal: readonly BTTVEmote[] | undefined,
    ffzPersonal: FFZPersonalEmotes | undefined,
    ffzGlobal: FFZGlobalEmotes | undefined,
    twitchGlobal: TwitchGlobalEmotes | undefined,
    sevenNotInSet: readonly SevenEmoteNotInSet[] | undefined
  ) {
    if (arguments.length === 0) throw new Error('no arguments provided.');

    this._root = new SuffixTree();
    let priority = arguments.length;

    if (sevenPersonal !== undefined) {
      for (const emote of sevenPersonal.emotes) {
        this._root.addAllSuffix(sevenInSetToAsset(emote), priority);
      }
      priority--;
    }

    if (sevenGlobal !== undefined) {
      for (const emote of sevenGlobal.emotes) {
        this._root.addAllSuffix(sevenInSetToAsset(emote), priority);
      }
      priority--;
    }

    if (bttvPersonal !== undefined) {
      for (const emote of bttvPersonal.channelEmotes) {
        this._root.addAllSuffix(bttvToAsset(emote), priority);
      }
      priority--;

      for (const emote of bttvPersonal.sharedEmotes) {
        this._root.addAllSuffix(bttvToAsset(emote), priority);
      }
      priority--;
    }

    if (bttvGlobal !== undefined) {
      for (const emote of bttvGlobal) {
        this._root.addAllSuffix(bttvToAsset(emote), priority);
      }
      priority--;
    }

    if (ffzPersonal !== undefined) {
      for (const emote of ffzPersonal.sets[ffzPersonal.room.set].emoticons) {
        this._root.addAllSuffix(ffzToAsset(emote), priority);
      }
      priority--;
    }

    if (ffzGlobal !== undefined) {
      for (const emote of ffzGlobal.sets[`${FFZGLOBALSETSKEY}`].emoticons) {
        this._root.addAllSuffix(ffzToAsset(emote), priority);
      }
      priority--;
    }

    if (twitchGlobal !== undefined) {
      for (const emote of twitchGlobal.data) {
        this._root.addAllSuffix(twitchToAsset(emote), priority);
      }
      priority--;
    }

    if (sevenNotInSet !== undefined) {
      for (const emote of sevenNotInSet) {
        //there may be a case where an emote was added with /addemote
        //and afterwards added to the channel
        if (this.matchSingleExact(emote.name)) continue;

        this._root.addAllSuffix(sevenNotInSetToAsset(emote), priority);
      }
    }
  }

  public matchSingle(query: string): AssetInfo | undefined {
    return this._root.query(query);
  }

  public matchSingleUnique(query: string, original: string): boolean {
    return this._root.queryUnique(query, original);
  }

  public matchSingleExact(query: string): boolean {
    return this._root.queryExact(query);
  }

  // returns undefined for unmatched
  public matchMulti(queries: readonly string[]): readonly (AssetInfo | undefined)[] {
    return queries.map((q) => this._root.query(q));
  }
}
