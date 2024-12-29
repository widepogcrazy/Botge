import { getTwitchAccessToken } from '../twitch-api-utils.js';
import { TwitchApi } from '../../api/twitch-api.js';

export async function newTwitchApi(twitchClientId: string, twitchSecret: string): Promise<Readonly<TwitchApi>> {
  const accessToken = await getTwitchAccessToken(twitchClientId, twitchSecret);
  const twitchApi: Readonly<TwitchApi> = new TwitchApi(twitchClientId, accessToken);
  await twitchApi.validateAccessToken();
  return twitchApi;
}
