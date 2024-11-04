export interface AssetInfo {
  name: string;
  url: string;
  //   zero_width?: boolean;
  //   w: number;
  //   h: number;
  //   duration?: number;
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

  _addAllSuffix(suffix: string, priority: number, asset: AssetInfo) {
    const exact = suffix === '';

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

    if (!exact) {
      const tree = this._getOrAddTree(suffix.charAt(0));
      tree._addAllSuffix(suffix.slice(1), priority, asset);
      return;
    }
  }

  addAllSuffix(asset: AssetInfo, priority: number) {
    const normalized = asset.name.toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
      this._addAllSuffix(normalized.slice(i), priority, asset);
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

  query(suffix: string) {
    return this._query(suffix.toLowerCase(), suffix);
  }
}

function sevenToAsset(emote: any): AssetInfo {
  return {
    name: emote.name,
    url: 'https:' + emote.data.host.url + '/2x.' + (emote.data.animated ? 'gif' : 'png')
  };
}

function bttvToAsset(emote: any): AssetInfo {
  return {
    name: emote.code,
    url: 'https://cdn.betterttv.net/emote/' + emote.id + '/2x.' + (emote.animated ? 'gif' : 'png')
  };
}

function ffzToAsset(emote: any): AssetInfo {
  return {
    name: emote.name,
    url: emote.urls['2']
  };
}

function twitchToAsset(emote: any): AssetInfo {
  const format = emote.format.length === 2 ? emote.format[1] : emote.format[0];
  const theme_mode = emote.theme_mode.length === 2 ? emote.theme_mode[1] : emote.theme_mode[0];
  return {
    name: emote.name,
    url: `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/${format}/${theme_mode}/2.0`
  };
}

export class EmoteMatcher {
  root: SuffixTree;
  constructor(sevenPersonal, sevenGlobal, bttvPersonal, bttvGlobal, ffzPersonal, ffzGlobal, twitchGlobal?) {
    this.root = new SuffixTree();
    // console.log(sevenPersonal)
    for (const emote of sevenPersonal.emotes) {
      this.root.addAllSuffix(sevenToAsset(emote), 0);
    }
    for (const emote of sevenGlobal.emotes) {
      this.root.addAllSuffix(sevenToAsset(emote), 1);
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
    for (const set_id of ffzGlobal.default_sets) {
      for (const emote of ffzGlobal.sets[set_id].emoticons) {
        this.root.addAllSuffix(ffzToAsset(emote), 6);
      }
    }
    if (twitchGlobal) {
      for (const emote of twitchGlobal.data) {
        this.root.addAllSuffix(twitchToAsset(emote), 7);
      }
    }
  }

  matchSingle(query: string): AssetInfo | undefined {
    return this.root.query(query);
  }

  matchMulti(queries: string): AssetInfo[] {
    const ret: AssetInfo[] = new Array();
    for (const query of queries.split(' ')) {
      if (query === '') {
        continue;
      }
      const match = this.root.query(query);
      if (match != undefined) {
        ret.push(match as AssetInfo);
      }
    }
    return ret;
  }
}
