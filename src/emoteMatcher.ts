import type {
  SevenEmoteFile,
  SevenEmoteInSet,
  SevenEmoteNotInSet,
  BTTVEmote,
  FFZEmote,
  TwitchEmote,
  SevenEmotes,
  BTTVPersonalEmotes,
  FFZPersonalEmotes,
  FFZGlobalEmotes,
  TwitchGlobalEmotes,
  AssetInfo
} from './types.js';

const EMOTESIZE = 2;
const HTTPS = 'https';
const BTTVCDN = 'cdn.betterttv.net/emote';
const TWITCHCDN = 'static-cdn.jtvnw.net/emoticons/v2';
const FFZGLOBALSETSKEY = 3;

export enum Platform {
  seven = 0,
  bttv = 1,
  ffz = 2,
  twitch = 3
}

class EmoteNode {
  public exact: boolean;
  public priority: number;
  // optional only for initialization.
  // no node should be undefined after initilization
  public assets?: AssetInfo[];

  public constructor() {
    this.exact = false; // whether this is a exact match at current node
    this.priority = 100; // 0 = highest priority
    this.assets = undefined;
  }
}

class SuffixTree {
  private readonly _paths: Map<string, SuffixTree>;
  private readonly _data: EmoteNode;

  public constructor() {
    this._paths = new Map();
    this._data = new EmoteNode();
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

  public queryUnique(suffix: string, original: string): boolean | undefined {
    return this._queryUnique(suffix.toLowerCase(), original);
  }

  private _getOrAddTree(char: string): SuffixTree | undefined {
    if (!this._paths.has(char)) {
      this._paths.set(char, new SuffixTree());
    }
    return this._paths.get(char);
  }

  private _addAllSuffix(suffix: string, priority: number, asset: AssetInfo, fromFullString: boolean): void {
    const exact = fromFullString && suffix === '';

    if (this._data.exact && exact) {
      if (priority < this._data.priority) {
        this._data.priority = priority;
        this._data.assets = [asset];
      }
      if (priority === this._data.priority) {
        this._data.assets?.push(asset);
      }
    } else if (!this._data.exact && exact) {
      // replace
      this._data.exact = exact;
      this._data.priority = priority;
      this._data.assets = [asset];
    } else if (!this._data.exact && !exact && priority < this._data.priority) {
      // replace
      this._data.priority = priority;
      this._data.assets = [asset];
    }

    if (suffix !== '') {
      const tree = this._getOrAddTree(suffix.charAt(0));
      tree?._addAllSuffix(suffix.slice(1), priority, asset, fromFullString);
      return;
    }
  }

  private _query(normalizedSuffix: string, original: string): AssetInfo | undefined {
    if (normalizedSuffix === '') {
      // reached the end of the query string

      if (this._data.assets && this._data.assets.length === 1) {
        return this._data.assets[0];
      }

      for (const asset of this._data.assets ?? []) {
        if (asset.name === original) {
          // exact match and case match
          return asset;
        }
      }
      if (this._data.assets && this._data.assets.length > 0) {
        return this._data.assets[0];
      }
      return undefined;
    }

    const nextChar = normalizedSuffix.charAt(0);
    if (!this._paths.has(nextChar)) {
      return undefined;
    }
    return this._paths.get(nextChar)?._query(normalizedSuffix.slice(1), original);
  }

  private _queryUnique(normalizedSuffix: string, original: string): boolean | undefined {
    if (normalizedSuffix === '') {
      // reached the end of the query string

      if (this._data.assets?.length === 1 && (this._paths.size === 0 || this._paths.size === 1)) {
        if (this._data.assets[0].name.toLowerCase() === original.toLowerCase()) {
          return true;
        }
      }
      return false;
    }

    const nextChar = normalizedSuffix.charAt(0);
    if (!this._paths.has(nextChar)) {
      return false;
    }
    return this._paths.get(nextChar)?._queryUnique(normalizedSuffix.slice(1), original);
  }
}

function sevenInSetToAsset(emote: SevenEmoteInSet): AssetInfo {
  const { data } = emote;
  const { host, animated } = data;
  const filename = `${EMOTESIZE}x.${animated ? 'gif' : 'png'}`;
  const file = host.files.find((f: SevenEmoteFile) => f.name === filename);
  return {
    name: emote.name,
    url: `${HTTPS}:${host.url}/${filename}`,
    zeroWidth: !!(1 & emote.flags),
    animated: animated,
    width: file?.width,
    height: file?.height,
    platform: Platform.seven
  };
}

function sevenNotInSetToAsset(emote: SevenEmoteNotInSet): AssetInfo {
  const { host, animated } = emote;
  const filename = `${EMOTESIZE}x.${animated ? 'gif' : 'png'}`;
  const file = host.files.find((f: SevenEmoteFile) => f.name === filename);
  return {
    name: emote.name,
    url: `${HTTPS}:${host.url}/${filename}`,
    zeroWidth: !!(1 & emote.flags),
    animated: animated,
    width: file?.width,
    height: file?.height,
    platform: Platform.seven
  };
}

function bttvToAsset(emote: BTTVEmote): AssetInfo {
  const { animated } = emote;
  const filename = `${EMOTESIZE}x.${animated ? 'gif' : 'png'}`;
  return {
    name: emote.code,
    url: `${HTTPS}://${BTTVCDN}/${emote.id}/${filename}`,
    zeroWidth: false,
    animated: animated,
    width: undefined,
    height: undefined,
    platform: Platform.bttv
  };
}

function ffzToAsset(emote: FFZEmote): AssetInfo {
  return {
    name: emote.name,
    url: emote.urls[`${EMOTESIZE}`],
    zeroWidth: false,
    animated: false,
    width: undefined,
    height: undefined,
    platform: Platform.ffz
  };
}

function twitchToAsset(emote: TwitchEmote): AssetInfo {
  const animated = emote.format.length === 2;
  const format = animated ? emote.format[1] : emote.format[0];
  const themeMode = emote.theme_mode.length === 2 ? emote.theme_mode[1] : emote.theme_mode[0];
  return {
    name: emote.name,
    url: `${HTTPS}://${TWITCHCDN}/${emote.id}/${format}/${themeMode}/${EMOTESIZE}.0`,
    zeroWidth: false,
    animated: animated,
    width: undefined,
    height: undefined,
    platform: Platform.twitch
  };
}

export class EmoteMatcher {
  private readonly root: SuffixTree;
  public constructor(
    sevenPersonal: SevenEmotes,
    sevenGlobal: SevenEmotes,
    bttvPersonal: BTTVPersonalEmotes,
    bttvGlobal: readonly BTTVEmote[],
    ffzPersonal: FFZPersonalEmotes,
    ffzGlobal: FFZGlobalEmotes,
    twitchGlobal: TwitchGlobalEmotes | undefined,
    sevenNotInSet: readonly SevenEmoteNotInSet[] | undefined
  ) {
    this.root = new SuffixTree();
    // console.log(sevenPersonal)
    for (const emote of sevenPersonal.emotes) {
      this.root.addAllSuffix(sevenInSetToAsset(emote), 0);
    }
    for (const emote of sevenGlobal.emotes) {
      this.root.addAllSuffix(sevenInSetToAsset(emote), 1);
    }
    for (const emote of bttvPersonal.channelEmotes) {
      this.root.addAllSuffix(bttvToAsset(emote), 2);
    }
    for (const emote of bttvPersonal.sharedEmotes) {
      this.root.addAllSuffix(bttvToAsset(emote), 3);
    }
    for (const emote of bttvGlobal) {
      this.root.addAllSuffix(bttvToAsset(emote), 4);
    }
    for (const emote of ffzPersonal.sets[ffzPersonal.room.set].emoticons) {
      this.root.addAllSuffix(ffzToAsset(emote), 5);
    }
    for (const emote of ffzGlobal.sets[`${FFZGLOBALSETSKEY}`].emoticons) {
      this.root.addAllSuffix(ffzToAsset(emote), 6);
    }
    if (twitchGlobal) {
      for (const emote of twitchGlobal.data) {
        this.root.addAllSuffix(twitchToAsset(emote), 7);
      }
    }
    if (sevenNotInSet) {
      for (const emote of sevenNotInSet) {
        this.root.addAllSuffix(sevenNotInSetToAsset(emote), 8);
      }
    }
  }

  public matchSingle(query: string): AssetInfo | undefined {
    return this.root.query(query);
  }

  public matchSingleUnique(query: string, original: string): boolean | undefined {
    return this.root.queryUnique(query, original);
  }

  // returns undefined for unmatched
  public matchMulti(queries: readonly string[]): readonly (AssetInfo | undefined)[] {
    return queries.map((q) => this.root.query(q));
  }
}
