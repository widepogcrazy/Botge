import type { DeepReadonly } from 'ts-essentials';

import type OpenAI from 'openai';

import type { EmoteMatcher } from './emoteMatcher.js';
import type { FileEmoteDb } from './api/filedb.js';
import type { Platform } from './enums.js';

export type ReadonlyOpenAI = DeepReadonly<OpenAI>;

export type SevenEmoteFile = {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly format: string;
};

export type SevenEmoteInSet = {
  readonly name: string;
  readonly data: {
    readonly flags: number;
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

export type ClientCredentialsGrantFlow = {
  readonly access_token: string;
  readonly expires_in: number;
  readonly token_type: string;
};

export type RequiredState = {
  readonly fileEmoteDb: Readonly<FileEmoteDb>;
  readonly emoteMatcher: Readonly<EmoteMatcher>;
  readonly refreshEmotes: () => Promise<void>;
};

export type DownloadedAsset = {
  readonly filename: string;
  readonly width: number;
  readonly height: number;
  readonly duration: number; // stills are DEFAULTDURATION
  readonly animated: boolean;
};

export type HstackElement = {
  readonly id: number;
  readonly filterString: () => string;
};

export type EmoteEndpoints = {
  sevenPersonal: string;
  sevenGlobal: string;
  sevenEmotesNotInSet: string;
  bttvPersonal: string;
  bttvGlobal: string;
  ffzPersonal: string;
  ffzGlobal: string;
  twitchGlobal: string;
};

export type TwitchGlobalOptions = {
  readonly method: string;
  readonly headers: {
    readonly Authorization: string;
    readonly 'Client-Id': string;
  };
};

export type TwitchUser = {
  readonly id: number;
};

export type TwitchUsers = {
  readonly data: readonly TwitchUser[];
};

export type TwitchClip = {
  readonly url: string;
  readonly creator_name: string;
  readonly game_id: number;
  readonly title: string;
};

export type TwitchClips = {
  readonly data: readonly TwitchClip[];
  readonly pagination: {
    readonly cursor?: string;
  };
};
