const EMOTESIZE = 2;
const HTTPS = 'https';
const BTTVCDN = 'cdn.betterttv.net/emote';
const TWITCHCDN = 'static-cdn.jtvnw.net/emoticons/v2';
const FFZGLOBALSETSKEY = 3;

export interface SevenEmote {
  name: string;
  flags: number;
  data: {
    animated: boolean;
    host: {
      url: string;
      files: {
        name: string;
        width: number;
        height: number;
        format: string;
      }[];
    };
  };
}
export interface BTTVEmote {
  id: string;
  code: string;
  animated: boolean;
}
export interface FFZEmote {
  name: string;
  urls: {
    [key: string]: string;
  };
}
export interface TwitchEmote {
  name: string;
  id: string;
  format: string[];
  theme_mode: string[];
}

export interface SevenEmotes {
  emotes: SevenEmote[];
}
export interface BTTVPersonalEmotes {
  channelEmotes: BTTVEmote[];
  sharedEmotes: BTTVEmote[];
}
export interface FFZPersonalEmotes {
  room: {
    set: number;
  };
  sets: {
    [key: string]: {
      emoticons: FFZEmote[];
    };
  };
}
export interface FFZGlobalEmotes {
  sets: {
    [key: string]: {
      emoticons: FFZEmote[];
    };
  };
}
export interface TwitchGlobalEmotes {
  data: TwitchEmote[];
}

export interface AssetInfo {
  name: string;
  url: string;
  zero_width: boolean;
  animated: boolean;
  width: number | undefined;
  height: number | undefined;
}

class emoteNode {
  exact: boolean;
  priority: number;
  // optional only for initialization.
  // no node should be undefined after initilization
  assets?: AssetInfo[];

  constructor() {
    this.exact = false; // whether this is a exact match at current node
    this.priority = 100; // 0 = highest priority
    this.assets = undefined;
  }
}

class SuffixTree {
  paths: Map<string, SuffixTree>;
  data: emoteNode;

  constructor() {
    this.paths = new Map();
    this.data = new emoteNode();
  }

  _getOrAddTree(char: string): SuffixTree {
    if (!this.paths.has(char)) {
      this.paths.set(char, new SuffixTree());
    }
    return this.paths.get(char);
  }

  _addAllSuffix(suffix: string, priority: number, asset: AssetInfo, fromFullString: boolean) {
    const exact = fromFullString && suffix === '';

    if (this.data.exact && exact) {
      if (priority < this.data.priority) {
        this.data.priority = priority;
        this.data.assets = [asset];
      }
      if (priority == this.data.priority) {
        this.data.assets.push(asset);
      }
    } else if (!this.data.exact && exact) {
      // replace
      this.data.exact = exact;
      this.data.priority = priority;
      this.data.assets = [asset];
    } else if (!this.data.exact && !exact && priority < this.data.priority) {
      // replace
      this.data.priority = priority;
      this.data.assets = [asset];
    }

    if (suffix !== '') {
      const tree = this._getOrAddTree(suffix.charAt(0));
      tree._addAllSuffix(suffix.slice(1), priority, asset, fromFullString);
      return;
    }
  }

  addAllSuffix(asset: AssetInfo, priority: number) {
    const normalized = asset.name.toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
      this._addAllSuffix(normalized.slice(i), priority, asset, i == 0);
    }
  }

  _query(normalizedSuffix: string, original: string): AssetInfo | undefined {
    if (normalizedSuffix === '') {
      // reached the end of the query string

      if (this.data.assets.length == 1) {
        return this.data.assets[0];
      }

      for (const asset of this.data.assets) {
        if (asset.name === original) {
          // exact match and case match
          return asset;
        }
      }
      if (this.data.assets.length > 0) {
        return this.data.assets[0];
      }
      return undefined;
    }

    const nextChar = normalizedSuffix.charAt(0);
    if (!this.paths.has(nextChar)) {
      return undefined;
    }
    return this.paths.get(nextChar)._query(normalizedSuffix.slice(1), original);
  }

  _queryUnique(normalizedSuffix: string, original: string): boolean | undefined {
    if (normalizedSuffix === '') {
      // reached the end of the query string

      if (this.data.assets.length === 1 && (this.paths.size === 0 || this.paths.size === 1)) {
        if (this.data.assets[0].name.toLowerCase() === original.toLowerCase()) {
          return true;
        }
      }
      return false;
    }

    const nextChar = normalizedSuffix.charAt(0);
    if (!this.paths.has(nextChar)) {
      return false;
    }
    return this.paths.get(nextChar)._queryUnique(normalizedSuffix.slice(1), original);
  }

  query(suffix: string) {
    return this._query(suffix.toLowerCase(), suffix);
  }

  queryUnique(suffix: string, original: string) {
    return this._queryUnique(suffix.toLowerCase(), original);
  }
}

function sevenToAsset(emote: SevenEmote): AssetInfo {
  const data = emote.data;
  const host = data.host;
  const animated = data.animated;
  const filename = `${EMOTESIZE}x.${animated ? 'gif' : 'png'}`;
  const file = host.files.find((f) => f.name === filename);
  return {
    name: emote.name,
    url: `${HTTPS}:${host.url}/${filename}`,
    zero_width: !!(1 & emote.flags),
    animated: animated,
    width: file.width,
    height: file.height
  };
}

function bttvToAsset(emote: BTTVEmote): AssetInfo {
  const animated = emote.animated;
  const filename = `${EMOTESIZE}x.${animated ? 'gif' : 'png'}`;
  return {
    name: emote.code,
    url: `${HTTPS}://${BTTVCDN}/${emote.id}/${filename}`,
    zero_width: false,
    animated: animated,
    width: undefined,
    height: undefined
  };
}

function ffzToAsset(emote: FFZEmote): AssetInfo {
  return {
    name: emote.name,
    url: emote.urls[`${EMOTESIZE}`],
    zero_width: false,
    animated: false,
    width: undefined,
    height: undefined
  };
}

function twitchToAsset(emote: TwitchEmote): AssetInfo {
  const animated = emote.format.length === 2;
  const format = animated ? emote.format[1] : emote.format[0];
  const theme_mode = emote.theme_mode.length === 2 ? emote.theme_mode[1] : emote.theme_mode[0];
  return {
    name: emote.name,
    url: `${HTTPS}://${TWITCHCDN}/${emote.id}/${format}/${theme_mode}/2.0`,
    zero_width: false,
    animated: animated,
    width: undefined,
    height: undefined
  };
}

export class EmoteMatcher {
  root: SuffixTree;
  constructor(
    sevenPersonal: SevenEmotes,
    sevenGlobal: SevenEmotes,
    bttvPersonal: BTTVPersonalEmotes,
    bttvGlobal: BTTVEmote[],
    ffzPersonal: FFZPersonalEmotes,
    ffzGlobal: FFZGlobalEmotes,
    twitchGlobal?: TwitchGlobalEmotes
  ) {
    this.root = new SuffixTree();
    // console.log(sevenPersonal)
    for (const emote of sevenPersonal.emotes) {
      this.root.addAllSuffix(sevenToAsset(emote as SevenEmote), 0);
    }
    for (const emote of sevenGlobal.emotes) {
      this.root.addAllSuffix(sevenToAsset(emote as SevenEmote), 1);
    }
    for (const emote of bttvPersonal.channelEmotes) {
      this.root.addAllSuffix(bttvToAsset(emote as BTTVEmote), 2);
    }
    for (const emote of bttvPersonal.sharedEmotes) {
      this.root.addAllSuffix(bttvToAsset(emote as BTTVEmote), 3);
    }
    for (const emote of bttvGlobal) {
      this.root.addAllSuffix(bttvToAsset(emote as BTTVEmote), 4);
    }
    for (const emote of ffzPersonal.sets[ffzPersonal.room.set].emoticons) {
      this.root.addAllSuffix(ffzToAsset(emote as FFZEmote), 5);
    }
    for (const emote of ffzGlobal.sets[`${FFZGLOBALSETSKEY}`].emoticons) {
      this.root.addAllSuffix(ffzToAsset(emote as FFZEmote), 6);
    }
    if (twitchGlobal) {
      for (const emote of twitchGlobal.data) {
        this.root.addAllSuffix(twitchToAsset(emote as TwitchEmote), 7);
      }
    }
  }

  matchSingle(query: string): AssetInfo | undefined {
    return this.root.query(query);
  }

  matchSingleUnique(query: string, original: string): boolean {
    return this.root.queryUnique(query, original);
  }

  // returns undefined for unmatched
  matchMulti(queries: string[]): (AssetInfo | undefined)[] {
    return queries.map((q) => this.root.query(q));
  }
}
