import { EmoteMatcher } from '../../emoteMatcher.js';
import type {
  SevenEmoteNotInSet,
  BTTVEmote,
  SevenEmotes,
  BTTVPersonalEmotes,
  FFZPersonalEmotes,
  FFZGlobalEmotes
} from '../../types.js';
import { GLOBAL_EMOTE_ENDPOINTS, type PersonalEmoteEndpoints } from '../../paths-and-endpoints.js';
import { fetchAndJson } from '../../utils/fetch-and-json.js';
import type { TwitchApi } from '../../api/twitch-api.js';
import type { AddedEmotesDatabase } from '../../api/database/added-emotes-database.js';

export async function newEmoteMatcher(
  guildId: string,
  personalEmoteEndpoints: Readonly<PersonalEmoteEndpoints>,
  twitchApi: Readonly<TwitchApi> | undefined,
  addedEmotesDatabase: Readonly<AddedEmotesDatabase>
): Promise<Readonly<EmoteMatcher>> {
  const sevenPersonal =
    personalEmoteEndpoints.seven !== undefined ? fetchAndJson(personalEmoteEndpoints.seven) : undefined;
  const sevenGlobal = fetchAndJson(GLOBAL_EMOTE_ENDPOINTS.seven);
  const bttvPersonal =
    personalEmoteEndpoints.bttv !== undefined ? fetchAndJson(personalEmoteEndpoints.bttv) : undefined;
  const bttvGlobal = fetchAndJson(GLOBAL_EMOTE_ENDPOINTS.bttv);
  const ffzPersonal = personalEmoteEndpoints.ffz !== undefined ? fetchAndJson(personalEmoteEndpoints.ffz) : undefined;
  const ffzGlobal = fetchAndJson(GLOBAL_EMOTE_ENDPOINTS.ffz);
  const twitchGlobal = twitchApi ? twitchApi.emotesGlobal() : undefined;
  const addedEmotes: readonly Promise<unknown>[] = addedEmotesDatabase
    .getAll(guildId)
    .map(async (addedEmote) => fetchAndJson(addedEmote.url));

  return new EmoteMatcher(
    (await sevenPersonal) as SevenEmotes,
    (await sevenGlobal) as SevenEmotes,
    (await bttvPersonal) as BTTVPersonalEmotes,
    (await bttvGlobal) as readonly BTTVEmote[],
    (await ffzPersonal) as FFZPersonalEmotes,
    (await ffzGlobal) as FFZGlobalEmotes,
    twitchGlobal ? await twitchGlobal : undefined,
    (await Promise.all(addedEmotes)) as readonly SevenEmoteNotInSet[]
  );
}
