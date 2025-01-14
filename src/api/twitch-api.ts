import type { TwitchClips, TwitchGames, TwitchGlobalEmotes, TwitchGlobalOptions, TwitchUsers } from '../types.js';
import { TWITCH_API_ENDPOINTS } from '../paths-and-endpoints.js';
import { fetchAndJson } from '../utils/fetch-and-json.js';

// raw twitch api methods
export class TwitchApi {
  readonly #clientId: string;
  readonly #accessToken: string;

  public constructor(clientId: string, accessToken: string) {
    this.#clientId = clientId;
    this.#accessToken = accessToken;
  }

  get #apiRequestOptions(): TwitchGlobalOptions {
    const optionsTwitchGlobal: TwitchGlobalOptions = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.#accessToken}`,
        'Client-Id': this.#clientId
      }
    };

    return optionsTwitchGlobal;
  }

  public async validateAccessToken(): Promise<void> {
    const resp = await fetch(TWITCH_API_ENDPOINTS.accessTokenValidate, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.#accessToken}`
      }
    });

    if (resp.status !== 200) console.error(`Error validating twitch access token: ${resp.status}`);
  }

  public async clipsFromIds(ids: Readonly<Iterable<string>>): Promise<TwitchClips> {
    const idsArray: readonly string[] = [...ids];
    if (idsArray.length > 100) throw new Error('Cannot get more than 100 users at once');

    const query: string = idsArray.map((id) => `id=${id}`).join('&');
    return (await fetchAndJson(`${TWITCH_API_ENDPOINTS.clips}?${query}`, this.#apiRequestOptions)) as TwitchClips;
  }

  public async clipsFromBroadcasterId(broadcasterId: string, cursor?: string): Promise<TwitchClips> {
    const query = `broadcaster_id=${broadcasterId}`;
    const query2 = cursor !== undefined ? `&after=${cursor}` : '';

    return (await fetchAndJson(
      `${TWITCH_API_ENDPOINTS.clips}?${query}&first=100${query2}`,
      this.#apiRequestOptions
    )) as TwitchClips;
  }

  public async games(ids: Readonly<Iterable<string>>): Promise<TwitchGames> {
    const idsArray: readonly string[] = [...ids];
    if (idsArray.length > 100) throw new Error('Cannot get more than 100 users at once');

    const query: string = idsArray.map((id) => `id=${id}`).join('&');
    return (await fetchAndJson(`${TWITCH_API_ENDPOINTS.games}?${query}`, this.#apiRequestOptions)) as TwitchGames;
  }

  public async users(ids: Readonly<Iterable<string>>): Promise<TwitchUsers> {
    const idsArray: readonly string[] = [...ids];
    if (idsArray.length > 100) throw new Error('Cannot get more than 100 users at once');

    const query: string = idsArray.map((id) => `login=${id}`).join('&');
    return (await fetchAndJson(`${TWITCH_API_ENDPOINTS.users}?${query}`, this.#apiRequestOptions)) as TwitchUsers;
  }

  public async emotesGlobal(): Promise<TwitchGlobalEmotes> {
    return (await fetchAndJson(TWITCH_API_ENDPOINTS.emotesGlobal, this.#apiRequestOptions)) as TwitchGlobalEmotes;
  }
}
