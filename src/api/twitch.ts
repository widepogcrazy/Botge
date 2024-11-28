import type {
  ClientCredentialsGrantFlow,
  TwitchClip,
  TwitchClips,
  TwitchGames,
  TwitchGlobalEmotes,
  TwitchGlobalOptions,
  TwitchUsers
} from '../types.js';
import { fetchAndJson } from '../utils/fetchAndJson.js';

const API_ENDPOINTS = {
  accessToken: 'https://id.twitch.tv/oauth2/token',
  accessTokenValidate: 'https://id.twitch.tv/oauth2/validate',
  users: 'https://api.twitch.tv/helix/users',
  games: 'https://api.twitch.tv/helix/games',
  clips: 'https://api.twitch.tv/helix/clips',
  emotesGlobal: 'https://api.twitch.tv/helix/chat/emotes/global'
};

// raw twitch api methods
export class TwitchApi {
  private readonly _clientId: string;
  private readonly _accessToken: string;

  public constructor(clientId: string, accessToken: string) {
    this._clientId = clientId;
    this._accessToken = accessToken;
  }

  public async validateAccessToken(): Promise<void> {
    const resp = await fetch(API_ENDPOINTS.accessTokenValidate, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this._accessToken}`
      }
    });

    if (resp.status !== 200) {
      console.error(`Error validating twitch access token: ${resp.status}`);
    }
  }

  // max 100 ids
  public async clips(ids: Readonly<Iterable<string>>): Promise<TwitchClips> {
    const query: string = [...ids].map((id) => `id=${id}`).join('&');
    return (await fetchAndJson(`${API_ENDPOINTS.clips}?${query}`, this._apiRequestOptions())) as TwitchClips;
  }

  // max 100 ids
  public async games(ids: Readonly<Iterable<string>>): Promise<TwitchGames> {
    const query: string = [...ids].map((id) => `id=${id}`).join('&');
    return (await fetchAndJson(`${API_ENDPOINTS.games}?${query}`, this._apiRequestOptions())) as TwitchGames;
  }

  // max 100 ids
  public async users(ids: Readonly<Iterable<string>>): Promise<TwitchUsers> {
    const query: string = [...ids].map((id) => `id=${id}`).join('&');
    return (await fetchAndJson(`${API_ENDPOINTS.games}?${query}`, this._apiRequestOptions())) as TwitchUsers;
  }

  public async emotesGlobal(): Promise<TwitchGlobalEmotes> {
    return (await fetchAndJson(API_ENDPOINTS.emotesGlobal, this._apiRequestOptions())) as TwitchGlobalEmotes;
  }

  private _apiRequestOptions(): TwitchGlobalOptions {
    const optionsTwitchGlobal: TwitchGlobalOptions = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
        'Client-Id': this._clientId
      }
    };

    return optionsTwitchGlobal;
  }
}

async function getTwitchAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const resp = await fetch(API_ENDPOINTS.accessToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
  });

  if (!resp.ok) {
    throw new Error(`Cannot get access token from twitch: ${resp.status}`);
  }
  return ((await resp.json()) as ClientCredentialsGrantFlow).access_token;
}

export async function createTwitchApi(twitchClientId: string, twitchSecret: string): Promise<Readonly<TwitchApi>> {
  const accessToken = await getTwitchAccessToken(twitchClientId, twitchSecret);
  const twitchApi: Readonly<TwitchApi> = new TwitchApi(twitchClientId, accessToken);
  await twitchApi.validateAccessToken();
  return twitchApi;
}

// HELPER FUNCTIONS

// max 100 ids
export async function getClipsWithGameName(
  twitchApi: Readonly<TwitchApi>,
  ids: Readonly<Iterable<string>>
): Promise<TwitchClip[]> {
  const clips = await twitchApi.clips(ids);
  const gameIds = new Set(clips.data.map((clip) => clip.game_id));
  const games = await twitchApi.games([...gameIds.keys()]);

  return clips.data.map(({ id, url, creator_name, game_id, title }) => {
    const gameName = games.data.find((game) => game.id === game_id)?.name;
    return {
      id,
      url,
      creator_name,
      game_id: gameName ?? game_id,
      title
    } as TwitchClip;
  });
}
