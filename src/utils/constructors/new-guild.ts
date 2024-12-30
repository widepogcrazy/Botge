import { Guild } from '../../guild.js';
import type { EmoteMatcher } from '../../emote-matcher.js';
import type { PersonalEmoteMatcherConstructor } from '../../emote-matcher-constructor.js';
import type { TwitchClipsMeiliSearch } from '../../twitch-clips-meili-search.js';
import type { AddedEmotesDatabase } from '../../api/added-emotes-database.js';

export async function newGuild(
  guildId: string,
  broadcasterName: string | undefined,
  twitchClipsMeiliSearch: Readonly<TwitchClipsMeiliSearch> | undefined,
  addedEmotesDatabase: Readonly<AddedEmotesDatabase>,
  personalEmoteMatcherConstructor: Readonly<PersonalEmoteMatcherConstructor>
): Promise<Readonly<Guild> | undefined> {
  addedEmotesDatabase.createTable(guildId);

  const emoteMatcher = (async (): Promise<Readonly<EmoteMatcher> | undefined> => {
    const refreshBTTVAndFFZPersonalEmotes_ = personalEmoteMatcherConstructor.refreshBTTVAndFFZPersonalEmotes();
    const refreshAddedEmotes_ = personalEmoteMatcherConstructor.refreshAddedEmotes();

    await refreshBTTVAndFFZPersonalEmotes_;
    await refreshAddedEmotes_;
    return await personalEmoteMatcherConstructor.constructEmoteMatcher();
  })();

  const twitchClipsMeiliSearchIndex =
    broadcasterName !== undefined ? twitchClipsMeiliSearch?.getOrCreateIndex(guildId) : undefined;

  const emoteMatcher_ = await emoteMatcher;
  if (emoteMatcher_ === undefined) return undefined;

  return new Guild(
    guildId,
    broadcasterName,
    await twitchClipsMeiliSearchIndex,
    emoteMatcher_,
    personalEmoteMatcherConstructor
  );
}
