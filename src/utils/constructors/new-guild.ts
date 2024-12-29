import { newEmoteMatcher } from './new-emote-matcher.js';
import { Guild } from '../../guild.js';
import type { PersonalEmoteEndpoints } from '../../paths-and-endpoints.js';
import type { TwitchClipsMeiliSearch } from '../../twitch-clips-meili-search.js';
import type { TwitchApi } from '../../api/twitch-api.js';
import type { AddedEmotesDatabase } from '../../api/added-emotes-database.js';

export async function newGuild(
  guildId: string,
  broadcasterName: string,
  personalEmoteEndpoints: Readonly<PersonalEmoteEndpoints>,
  twitchApi: Readonly<TwitchApi> | undefined,
  addedEmotesDatabase: Readonly<AddedEmotesDatabase>,
  twitchClipsMeiliSearch: Readonly<TwitchClipsMeiliSearch> | undefined
): Promise<Readonly<Guild>> {
  addedEmotesDatabase.createTable(guildId);
  const emoteMatcher = newEmoteMatcher(guildId, personalEmoteEndpoints, twitchApi, addedEmotesDatabase);
  const twitchClipsMeiliSearchIndex = twitchClipsMeiliSearch?.getOrCreateIndex(guildId);

  return new Guild(
    guildId,
    broadcasterName,
    personalEmoteEndpoints,
    await emoteMatcher,
    await twitchClipsMeiliSearchIndex
  );
}
