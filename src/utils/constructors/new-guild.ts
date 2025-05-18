import { Guild } from '../../guild.js';
import type { PersonalEmoteSets } from '../../personal-emote-sets.js';
import { PersonalEmoteMatcherConstructor } from '../../emote-matcher-constructor.js';
import type { TwitchClipsMeiliSearch } from '../../twitch-clips-meili-search.js';
import type { AddedEmotesDatabase } from '../../api/added-emotes-database.js';
import type { PermittedRoleIdsDatabase } from '../../api/permitted-role-ids-database.js';

export async function newGuild(
  guildId: string,
  twitchClipsMeiliSearch: Readonly<TwitchClipsMeiliSearch> | undefined,
  addedEmotesDatabase: Readonly<AddedEmotesDatabase>,
  permittedRoleIdsDatabase: Readonly<PermittedRoleIdsDatabase>,
  broadcasterName: string | null,
  personalEmoteSets: PersonalEmoteSets | undefined
): Promise<Readonly<Guild>> {
  addedEmotesDatabase.createTable(guildId);
  permittedRoleIdsDatabase.createTable(guildId);

  const settingsPermittedRoleIds = permittedRoleIdsDatabase.getSettingsPermittedRoleIds(guildId);
  const addEmotePermittedRoleIds = permittedRoleIdsDatabase.getAddEmotePermittedRoleIds(guildId);
  const addEmotePermitNoRole = permittedRoleIdsDatabase.getAddEmotePermitNoRole(guildId);

  const personalEmoteMatcherConstructor = PersonalEmoteMatcherConstructor.create(guildId, personalEmoteSets);
  const emoteMatcher = (await personalEmoteMatcherConstructor).constructEmoteMatcher();
  const twitchClipsMeiliSearchIndex = twitchClipsMeiliSearch?.getOrCreateIndex(guildId);

  return new Guild(
    guildId,
    broadcasterName,
    await twitchClipsMeiliSearchIndex,
    await emoteMatcher,
    await personalEmoteMatcherConstructor,
    settingsPermittedRoleIds,
    addEmotePermittedRoleIds,
    addEmotePermitNoRole
  );
}
