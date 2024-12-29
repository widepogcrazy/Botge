import { EmoteMatcher } from '../../emote-matcher.js';
import type {
  SevenTVEmoteNotInSet,
  BTTVEmote,
  BTTVPersonalEmotes,
  FFZPersonalEmotes,
  FFZGlobalEmotes,
  SevenTVEmotes
} from '../../types.js';
import { GLOBAL_EMOTE_ENDPOINTS, type PersonalEmoteEndpoints } from '../../paths-and-endpoints.js';
import { fetchAndJson } from '../../utils/fetch-and-json.js';
import type { TwitchApi } from '../../api/twitch-api.js';
import type { AddedEmotesDatabase } from '../../api/added-emotes-database.js';

export async function newEmoteMatcher(
  guildId: string,
  personalEmoteEndpoints: Readonly<PersonalEmoteEndpoints>,
  twitchApi: Readonly<TwitchApi> | undefined,
  addedEmotesDatabase: Readonly<AddedEmotesDatabase>
): Promise<Readonly<EmoteMatcher>> {
  const sevenPersonal =
    personalEmoteEndpoints.sevenTV !== undefined
      ? (fetchAndJson(personalEmoteEndpoints.sevenTV) as Promise<SevenTVEmotes>)
      : undefined;
  const sevenGlobal = fetchAndJson(GLOBAL_EMOTE_ENDPOINTS.sevenTV) as Promise<SevenTVEmotes>;
  const bttvPersonal =
    personalEmoteEndpoints.bttv !== undefined
      ? (fetchAndJson(personalEmoteEndpoints.bttv) as Promise<BTTVPersonalEmotes>)
      : undefined;
  const bttvGlobal = fetchAndJson(GLOBAL_EMOTE_ENDPOINTS.bttv) as Promise<readonly BTTVEmote[]>;
  const ffzPersonal =
    personalEmoteEndpoints.ffz !== undefined
      ? (fetchAndJson(personalEmoteEndpoints.ffz) as Promise<FFZPersonalEmotes>)
      : undefined;
  const ffzGlobal = fetchAndJson(GLOBAL_EMOTE_ENDPOINTS.ffz) as Promise<FFZGlobalEmotes>;
  const twitchGlobal = twitchApi?.emotesGlobal();
  const addedEmotes = addedEmotesDatabase
    .getAll(guildId)
    .map(async (addedEmote) => fetchAndJson(addedEmote.url)) as readonly Promise<SevenTVEmoteNotInSet>[];

  return new EmoteMatcher(
    await sevenPersonal,
    await sevenGlobal,
    await bttvPersonal,
    await bttvGlobal,
    await ffzPersonal,
    await ffzGlobal,
    await twitchGlobal,
    await Promise.all(addedEmotes)
  );
}
