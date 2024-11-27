import type {
  ClientCredentialsGrantFlow,
  TwitchClip,
  TwitchClips,
  TwitchGame,
  TwitchGames,
  TwitchGlobalOptions,
  TwitchUsers
} from '../types.js';
import { fetchAndJson } from '../utils/fetchAndJson.js';

const API_ENDPOINTS = {
  twitchAccessToken: 'https://id.twitch.tv/oauth2/token',
  twitchAccessTokenValidate: 'https://id.twitch.tv/oauth2/validate',
  twitchUsers: 'https://api.twitch.tv/helix/users',
  twitchGames: 'https://api.twitch.tv/helix/games',
  twitchClips: 'https://api.twitch.tv/helix/clips'
};

export class TwitchGlobalHandler {
  private readonly _twitchClientId: string;
  private readonly _twitchSecret: string;

  private _accessToken: string | undefined = undefined;
  private _accessTokenStatus: number | undefined = undefined;
  private _accessTokenValidationStatus: number | undefined = undefined;

  public constructor(twitchClientId: string, twitchSecret: string) {
    this._twitchClientId = twitchClientId;
    this._twitchSecret = twitchSecret;
  }

  public gotAccessToken(): boolean {
    return this._accessTokenStatus === 200;
  }
  public isAccessTokenValidated(): boolean {
    return this.gotAccessToken() && this._accessTokenValidationStatus === 200;
  }

  public async getTwitchAccessToken(): Promise<void> {
    const twitchAccessToken = await fetch(API_ENDPOINTS.twitchAccessToken, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `client_id=${this._twitchClientId}&client_secret=${this._twitchSecret}&grant_type=client_credentials`
    });

    this._accessToken = ((await twitchAccessToken.json()) as ClientCredentialsGrantFlow).access_token;
    this._accessTokenStatus = twitchAccessToken.status;
  }

  public async validateTwitchAccessToken(): Promise<void> {
    if (!this.gotAccessToken()) {
      return;
    }

    const twitchAccessTokenValidation = await fetch(API_ENDPOINTS.twitchAccessTokenValidate, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this._accessToken}`
      }
    });

    this._accessTokenValidationStatus = twitchAccessTokenValidation.status;
  }

  public getTwitchGlobalOptions(): TwitchGlobalOptions | undefined {
    if (!this.gotAccessToken() || !this.isAccessTokenValidated()) {
      return undefined;
    }

    const optionsTwitchGlobal: TwitchGlobalOptions = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this._accessToken}`,
        'Client-Id': this._twitchClientId
      }
    };

    return optionsTwitchGlobal;
  }
}

function fetchandJsonsFromIds(
  twitchGlobalOptions: TwitchGlobalOptions,
  ids: readonly string[],
  endpoint: string
): readonly Promise<unknown>[] {
  const fetchAndJsons: Promise<unknown>[] = [];
  const increment = 100;
  let start = 0;
  let end = start + increment;
  let slice: readonly string[] = ids.slice(start, end);

  while (slice.length > 0) {
    const slicedIdsMapped: readonly string[] = slice.map((id) => `id=${id}`);
    const slicedIdsMappedJoined = slicedIdsMapped.join('&');

    const fetchAndJson_ = fetchAndJson(`${endpoint}?${slicedIdsMappedJoined}`, twitchGlobalOptions);
    fetchAndJsons.push(fetchAndJson_);

    start = end;
    end += increment;
    slice = ids.slice(start, end);
  }

  return fetchAndJsons;
}

async function transformGameIdFromIdToName(
  twitchGlobalOptions: TwitchGlobalOptions,
  twitchClipArray: readonly TwitchClip[]
): Promise<readonly TwitchClip[]> {
  const twitchClipGameIds: readonly string[] = twitchClipArray.map(({ game_id }) => game_id);
  const uniqueTwitchClipGameIds: readonly string[] = [...new Set(twitchClipGameIds)];

  const twitchGameArrayFetchAndJsons = fetchandJsonsFromIds(
    twitchGlobalOptions,
    uniqueTwitchClipGameIds,
    API_ENDPOINTS.twitchGames
  ) as readonly Promise<TwitchGames>[];
  const twitchGamesArray: readonly TwitchGames[] = await Promise.all(twitchGameArrayFetchAndJsons);
  const twitchGameArray: readonly TwitchGame[] = twitchGamesArray.map(({ data }) => data).flat();

  const twitchClipArrayTransformed: readonly TwitchClip[] = twitchClipArray.map(
    ({ id, url, creator_name, game_id, title }) => {
      const transformedGameId = twitchGameArray.find((twitchGame) => twitchGame.id === game_id)?.name;

      return {
        id,
        url,
        creator_name,
        game_id: transformedGameId ?? game_id,
        title
      } as TwitchClip;
    }
  );

  return twitchClipArrayTransformed;
}

export async function getTwitchUserId(twitchGlobalOptions: TwitchGlobalOptions, name: string): Promise<number> {
  const twitchUsers = (await fetchAndJson(
    `${API_ENDPOINTS.twitchUsers}?login=${name}`,
    twitchGlobalOptions
  )) as TwitchUsers;


  return twitchUsers.data[0].id;
}

export async function getTwitchClipsFromBroadcasterId(
  twitchGlobalOptions: TwitchGlobalOptions,
  broadcasterId: number
): Promise<readonly TwitchClip[]> {
  const twitchClipArray: TwitchClip[] = [];

  let twitchClips = (await fetchAndJson(
    `${API_ENDPOINTS.twitchClips}?broadcaster_id=${broadcasterId}&first=100`,
    twitchGlobalOptions
  )) as TwitchClips;
  twitchClipArray.push(...twitchClips.data);

  let { cursor } = twitchClips.pagination;
  while (cursor !== undefined) {
    twitchClips = (await fetchAndJson(
      `${API_ENDPOINTS.twitchClips}?broadcaster_id=${broadcasterId}&first=100&after=${cursor}`,
      twitchGlobalOptions
    )) as TwitchClips;
    twitchClipArray.push(...twitchClips.data);

    ({ cursor } = twitchClips.pagination);
    console.log(cursor);
  }

  const transformedTwitchClipArray = await transformGameIdFromIdToName(twitchGlobalOptions, twitchClipArray);

  return transformedTwitchClipArray;
}

export async function getTwitchClipsFromClipIds(
  twitchGlobalOptions: TwitchGlobalOptions,
  clipIds: readonly string[]
): Promise<readonly TwitchClip[]> {
  const twitchClipsArrayFetchAndJsons = fetchandJsonsFromIds(
    twitchGlobalOptions,
    clipIds,
    API_ENDPOINTS.twitchClips
  ) as readonly Promise<TwitchClips>[];

  const twitchClipsArray = (await Promise.all(twitchClipsArrayFetchAndJsons)) as readonly TwitchClips[];
  const twitchClipArray: readonly TwitchClip[] = twitchClipsArray.map(({ data }) => data).flat();

  const twitchClipArrayTransformed = await transformGameIdFromIdToName(twitchGlobalOptions, twitchClipArray);

  return twitchClipArrayTransformed;
}

async function getAndValidateTwitchAccessToken(twitchglobalhandler: Readonly<TwitchGlobalHandler>): Promise<void> {
  await twitchglobalhandler.getTwitchAccessToken();
  await twitchglobalhandler.validateTwitchAccessToken();
}

function logGotAccessToken(twitchglobalhandler: Readonly<TwitchGlobalHandler>): void {
  if (twitchglobalhandler.gotAccessToken()) console.log('Got Twitch Access Token.');
  else console.log('Failed to get Twitch Access Token.');
}
function logIsAccessTokenValidated(twitchglobalhandler: Readonly<TwitchGlobalHandler>): void {
  if (twitchglobalhandler.isAccessTokenValidated()) console.log('Twitch Access Token is valid.');
  else console.log('Twitch Access Token is invalid.');

  return;
}

export async function validationHandler(twitchGlobalHandler: Readonly<TwitchGlobalHandler>): Promise<void> {
  await twitchGlobalHandler.validateTwitchAccessToken();
  logIsAccessTokenValidated(twitchGlobalHandler);

  if (!twitchGlobalHandler.isAccessTokenValidated()) {
    await getAndValidateTwitchAccessToken(twitchGlobalHandler);
    logGotAccessToken(twitchGlobalHandler);
    logIsAccessTokenValidated(twitchGlobalHandler);
  }
}

export async function createTwitchApi(
  twitchClientId: string,
  twitchSecret: string
): Promise<Readonly<TwitchGlobalHandler>> {
  const twitchGlobalHandler: Readonly<TwitchGlobalHandler> = new TwitchGlobalHandler(twitchClientId, twitchSecret);
  await validationHandler(twitchGlobalHandler);

  return twitchGlobalHandler;
}
