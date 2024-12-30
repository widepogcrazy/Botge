import type { TwitchClips, TwitchGames, TwitchGlobalEmotes, TwitchGlobalOptions, TwitchUsers } from '../types.js';
import { TWITCH_API_ENDPOINTS } from '../paths-and-endpoints.js';
import { fetchAndJson } from '../utils/fetch-and-json.js';

// raw twitch api methods
export class TwitchApi {
  readonly #clientId: string;
  readonly #accessToken: string;
  #validated: boolean;

  public constructor(clientId: string, accessToken: string) {
    this.#clientId = clientId;
    this.#accessToken = accessToken;
    this.#validated = false;
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
    try {
      const resp = await fetch(TWITCH_API_ENDPOINTS.accessTokenValidate, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.#accessToken}`
        }
      });

      if (resp.status === 200) {
        this.#validated = true;
      } else {
        console.error(`Error validating twitch access token: ${resp.status}`);
        this.#validated = false;
      }
    } catch (error: unknown) {
      console.error(`Error validating twitch access token: ${error instanceof Error ? error : 'error'}`);
      this.#validated = false;
      return;
    }
  }

  public async clipsFromIds(ids: Readonly<Iterable<string>>): Promise<TwitchClips | undefined> {
    if (!this.#validated) return undefined;

    const idsArray: readonly string[] = [...ids];
    if (idsArray.length > 100) throw new Error('Cannot get more than 100 users at once');

    const query: string = idsArray.map((id) => `id=${id}`).join('&');
    try {
      return (await fetchAndJson(`${TWITCH_API_ENDPOINTS.clips}?${query}`, this.#apiRequestOptions)) as TwitchClips;
    } catch (error: unknown) {
      console.error(`Error fetching clips from ids: ${error instanceof Error ? error : 'error'}`);
      return undefined;
    }
  }

  public async clipsFromBroadcasterId(broadcasterId: string, cursor?: string): Promise<TwitchClips | undefined> {
    if (!this.#validated) return undefined;

    const query = `broadcaster_id=${broadcasterId}`;
    const query2 = cursor !== undefined ? `&after=${cursor}` : '';

    try {
      return (await fetchAndJson(
        `${TWITCH_API_ENDPOINTS.clips}?${query}&first=100${query2}`,
        this.#apiRequestOptions
      )) as TwitchClips;
    } catch (error: unknown) {
      console.error(`Error fetching clips from broadcaster id: ${error instanceof Error ? error : 'error'}`);
      return undefined;
    }
  }

  public async games(ids: Readonly<Iterable<string>>): Promise<TwitchGames | undefined> {
    if (!this.#validated) return undefined;

    const idsArray: readonly string[] = [...ids];
    if (idsArray.length > 100) throw new Error('Cannot get more than 100 users at once');

    const query: string = idsArray.map((id) => `id=${id}`).join('&');
    try {
      return (await fetchAndJson(`${TWITCH_API_ENDPOINTS.games}?${query}`, this.#apiRequestOptions)) as TwitchGames;
    } catch (error: unknown) {
      console.error(`Error fetching games: ${error instanceof Error ? error : 'error'}`);
      return undefined;
    }
  }

  public async users(ids: Readonly<Iterable<string>>): Promise<TwitchUsers | undefined> {
    if (!this.#validated) return undefined;

    const idsArray: readonly string[] = [...ids];
    if (idsArray.length > 100) throw new Error('Cannot get more than 100 users at once');

    const query: string = idsArray.map((id) => `login=${id}`).join('&');
    try {
      return (await fetchAndJson(`${TWITCH_API_ENDPOINTS.users}?${query}`, this.#apiRequestOptions)) as TwitchUsers;
    } catch (error: unknown) {
      console.error(`Error fetching users: ${error instanceof Error ? error : 'error'}`);
      return undefined;
    }
  }

  public async emotesGlobal(): Promise<TwitchGlobalEmotes | undefined> {
    if (!this.#validated) return undefined;

    try {
      return (await fetchAndJson(TWITCH_API_ENDPOINTS.emotesGlobal, this.#apiRequestOptions)) as TwitchGlobalEmotes;
    } catch (error: unknown) {
      console.error(`Error fetching emotesGlobal: ${error instanceof Error ? error : 'error'}`);
      return undefined;
    }
  }
}
