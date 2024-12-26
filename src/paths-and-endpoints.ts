export const DATABASE_DIR = 'data';
export const TMP_DIR = 'tmp';

export class PersonalEmoteEndpoints {
  public readonly seven: string | undefined;
  public readonly bttv: string | undefined;
  public readonly ffz: string | undefined;

  public constructor(seven: string | undefined, bttv: string | undefined, ffz: string | undefined) {
    if (arguments.length === 1) throw new Error('no emotes provided');

    this.seven = seven;
    this.bttv = bttv;
    this.ffz = ffz;
  }
}

export const DATABASE_ENDPOINTS = {
  addedEmotes: `${DATABASE_DIR}/addedEmotes.sqlite`
};

export const TWITCH_API_ENDPOINTS = {
  accessToken: 'https://id.twitch.tv/oauth2/token',
  accessTokenValidate: 'https://id.twitch.tv/oauth2/validate',
  users: 'https://api.twitch.tv/helix/users',
  games: 'https://api.twitch.tv/helix/games',
  clips: 'https://api.twitch.tv/helix/clips',
  emotesGlobal: 'https://api.twitch.tv/helix/chat/emotes/global'
};

export const SEVEN_NOT_IN_SET_ENDPOINT = 'https://7tv.io/v3/emotes';

export const GLOBAL_EMOTE_ENDPOINTS = {
  seven: 'https://7tv.io/v3/emote-sets/global',
  bttv: 'https://api.betterttv.net/3/cached/emotes/global',
  ffz: 'https://api.frankerfacez.com/v1/set/global'
};

export const PersonalEmoteEndpointsCutedog = new PersonalEmoteEndpoints(
  'https://7tv.io/v3/emote-sets/01FDMJPSF8000CJ4MDR2FNZEQ3',
  'https://api.betterttv.net/3/users/5809977263c97c037fc9e66c',
  'https://api.frankerfacez.com/v1/room/cutedog_'
);

export const PersonalEmoteEndpointsElly = new PersonalEmoteEndpoints(
  'https://7tv.io/v3/emote-sets/01G0HG3YQG000BNDCWZMDRQP8E',
  'https://api.betterttv.net/3/users/5bdc93fafd50d42c9708dd57',
  undefined
);
