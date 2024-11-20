import type { DeepReadonly } from 'ts-essentials';

import type OpenAI from 'openai';

import type { Platform } from './emoteMatcher.js';

export type ReadonlyOpenAI = DeepReadonly<OpenAI>;

export type SevenEmoteFile = {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly format: string;
};

export type SevenEmoteInSet = {
  readonly name: string;
  readonly flags: number;
  readonly data: {
    readonly animated: boolean;
    readonly host: {
      readonly url: string;
      readonly files: readonly SevenEmoteFile[];
    };
  };
};
export type SevenEmoteNotInSet = {
  readonly name: string;
  readonly flags: number;
  readonly animated: boolean;
  readonly host: {
    readonly url: string;
    readonly files: readonly SevenEmoteFile[];
  };
};
export type BTTVEmote = {
  readonly id: string;
  readonly code: string;
  readonly animated: boolean;
};
export type FFZEmote = {
  readonly name: string;
  readonly urls: Readonly<Record<string, string>>;
};
export type TwitchEmote = {
  readonly name: string;
  readonly id: string;
  readonly format: readonly string[];
  readonly theme_mode: readonly string[];
};

export type SevenEmotes = {
  readonly emotes: readonly SevenEmoteInSet[];
};
export type BTTVPersonalEmotes = {
  readonly channelEmotes: readonly BTTVEmote[];
  readonly sharedEmotes: readonly BTTVEmote[];
};
export type FFZPersonalEmotes = {
  readonly room: {
    readonly set: number;
  };
  readonly sets: Readonly<
    Record<
      string,
      {
        readonly emoticons: readonly FFZEmote[];
      }
    >
  >;
};
export type FFZGlobalEmotes = {
  readonly sets: Readonly<
    Record<
      string,
      {
        readonly emoticons: readonly FFZEmote[];
      }
    >
  >;
};
export type TwitchGlobalEmotes = {
  readonly data: readonly TwitchEmote[];
};

export type AssetInfo = {
  readonly name: string;
  readonly url: string;
  readonly zeroWidth: boolean;
  readonly animated: boolean;
  readonly width: number | undefined;
  readonly height: number | undefined;
  readonly platform: Platform;
};

export type ReadonlySuffixTree = {
  readonly addAllSuffix: (asset: AssetInfo, priority: number) => void;
  readonly query: (suffix: string) => AssetInfo | undefined;
  readonly queryUnique: (suffix: string, original: string) => boolean | undefined;
};

export type ReadOnlyEmoteMatcher = {
  readonly matchSingle: (query: string) => AssetInfo | undefined;
  readonly matchSingleUnique: (query: string, original: string) => boolean | undefined;
  readonly matchMulti: (queries: readonly string[]) => readonly (AssetInfo | undefined)[];
};

export type ClientCredentialsGrantFlow = {
  readonly access_token: string;
  readonly expires_in: number;
  readonly token_type: string;
};

export type ReadOnlyTwitchGlobalHandler = {
  readonly gotAccessToken: () => boolean;
  readonly isAccessTokenValidated: () => boolean;
  readonly getTwitchAccessToken: () => Promise<void>;
  readonly validateTwitchAccessToken: () => Promise<void>;
  readonly getTwitchGlobalOptions: () =>
    | {
        readonly method: string;
        readonly headers: {
          readonly Authorization: string;
          readonly 'Client-Id': string;
        };
      }
    | undefined;
};

export type ReadOnlyFileEmoteDb = {
  readonly getAll: () => readonly string[];
  readonly add: (url: string) => Promise<void>;
};

export type RequiredState = {
  readonly db: ReadOnlyFileEmoteDb;
  readonly em: ReadOnlyEmoteMatcher;
  readonly refreshEmotes: () => Promise<void>;
};

export type DownloadedAsset = {
  readonly filename: string;
  readonly asset: AssetInfo;
  readonly w: number | undefined;
  readonly h: number | undefined;
  readonly duration: number; // stills are DEFAULTDURATION
  readonly animated: boolean;
};

export type HstackElement = {
  readonly id: number;
  readonly animated: boolean;
  readonly filterString: () => string;
};

export type EmoteEndpoints = {
  readonly sevenPersonal: string;
  readonly sevenGlobal: string;
  readonly sevenEmotesNotInSet: string;
  readonly bttvPersonal: string;
  readonly bttvGlobal: string;
  readonly ffzPersonal: string;
  readonly ffzGlobal: string;
  readonly twitchGlobal: string;
};

export type ReadonlyBot = {
  readonly db: ReadOnlyFileEmoteDb;
  readonly em: ReadOnlyEmoteMatcher;
  readonly twitch: ReadOnlyTwitchGlobalHandler | undefined;
  readonly refreshEmotes: () => Promise<void>;
  readonly validateTwitch: () => Promise<void>;
  readonly registerHandlers: () => void;
  readonly start: (discordToken: string | undefined) => Promise<void>;
};
