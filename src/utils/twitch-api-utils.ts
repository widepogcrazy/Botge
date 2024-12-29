import { TWITCH_API_ENDPOINTS } from '../paths-and-endpoints.js';
import type { ClientCredentialsGrantFlow, TwitchClip, TwitchClips } from '../types.js';
import type { TwitchApi } from '../api/twitch-api.js';

export async function getTwitchAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const resp = await fetch(TWITCH_API_ENDPOINTS.accessToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
  });

  if (!resp.ok) throw new Error(`Cannot get access token from twitch: ${resp.status}`);

  return ((await resp.json()) as ClientCredentialsGrantFlow).access_token;
}

export async function transformClipsGameIdFromIdToName(
  twitchApi: Readonly<TwitchApi>,
  clips: TwitchClips
): Promise<TwitchClip[]> {
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

// max 100 ids
export async function getClipsWithGameNameFromIds(
  twitchApi: Readonly<TwitchApi>,
  ids: Readonly<Iterable<string>>
): Promise<TwitchClip[]> {
  const clips = await twitchApi.clipsFromIds(ids);

  return transformClipsGameIdFromIdToName(twitchApi, clips);
}

export async function getClipsWithGameNameFromBroadcasterName(
  twitchApi: Readonly<TwitchApi>,
  broadcasterName: string,
  cursor?: string
): Promise<readonly [TwitchClip[], string | undefined]> {
  const broadcasterId = (await twitchApi.users([broadcasterName])).data[0].id;
  const clips = await twitchApi.clipsFromBroadcasterId(broadcasterId, cursor);

  return [await transformClipsGameIdFromIdToName(twitchApi, clips), clips.pagination.cursor];
}
