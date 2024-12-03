export const DATABASE_DIR = 'data';
export const TMP_DIR = 'tmp';

export const DATABASE_ENDPOINTS = {
  sevenNotInSetEmotes: `${DATABASE_DIR}/sevenNotInSetEmotes.json`,
  addedEmotes: `${DATABASE_DIR}/addedEmotes.sqlite`
};

export const EMOTE_ENDPOINTS = {
  sevenPersonal: 'https://7tv.io/v3/emote-sets/01FDMJPSF8000CJ4MDR2FNZEQ3',
  sevenGlobal: 'https://7tv.io/v3/emote-sets/global',
  sevenEmotesNotInSet: 'https://7tv.io/v3/emotes',
  bttvPersonal: 'https://api.betterttv.net/3/users/5809977263c97c037fc9e66c',
  bttvGlobal: 'https://api.betterttv.net/3/cached/emotes/global',
  ffzPersonal: 'https://api.frankerfacez.com/v1/room/cutedog_',
  ffzGlobal: 'https://api.frankerfacez.com/v1/set/global'
};
