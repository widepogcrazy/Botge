import type { CommandInteraction, GuildMember, Role } from 'discord.js';

import { sevenTVUrlToSevenTVNotInSet, SPLITTER } from '../utils/platform-url-to-api-url.js';
import type { AddedEmote, SevenTVEmoteNotInSet } from '../types.js';
import { CDN_ENDPOINTS } from '../paths-and-endpoints.js';
import type { AddedEmotesDatabase } from '../api/added-emotes-database.js';
import type { Guild } from '../guild.js';
import { fetchAndJson } from '../utils/fetch-and-json.js';
import { permitted, owner, globalAdministrator } from '../utils/permitted.js';

export function addEmoteHandlerSevenTVNotInSet(addedEmotesDatabase: Readonly<AddedEmotesDatabase>) {
  return async (interaction: CommandInteraction, guild: Readonly<Guild>): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const { member } = interaction;
      const interactionGuild = interaction.guild;
      if (interactionGuild === null || member === null) return;

      const member_ = member as GuildMember;
      const memberRolesCache: readonly (readonly [string, Role])[] = [...member_.roles.cache];
      if (
        !guild.allowEveryoneToAddEmote &&
        !permitted(memberRolesCache, guild.addEmotePermittedRoleIds) &&
        !owner(member_, interactionGuild) &&
        !globalAdministrator(member_)
      ) {
        await defer;
        await interaction.editReply('You do not have the necessary permissions to use this command.');
        return;
      }

      const url = String(interaction.options.get('url')?.value).trim();
      const alias = ((): string | null => {
        const aliasOptions = interaction.options.get('alias')?.value;
        return aliasOptions !== undefined ? String(aliasOptions).trim() : null;
      })();

      const sevenTVUrlToSevenNotInSet_ = await sevenTVUrlToSevenTVNotInSet(url);
      if (sevenTVUrlToSevenNotInSet_ === undefined) {
        await defer;
        await interaction.editReply('invalid url');

        return;
      }

      if (guild.emoteMatcher.matchSingleExact(alias ?? sevenTVUrlToSevenNotInSet_.name)) {
        await defer;
        await interaction.editReply('theres already an emote with the same name');

        return;
      }

      const emoteId = url.split(SPLITTER).at(-1);
      const addedEmote: AddedEmote = { url: `${CDN_ENDPOINTS.sevenTVNotInSet}${SPLITTER}${emoteId}`, alias: alias };
      const addedEmotes = addedEmotesDatabase.getAll(guild.id);
      if (addedEmotes.some((addedEmote_) => addedEmote_.url === addedEmote.url)) {
        await defer;
        await interaction.editReply('theres already an emote with the same url');

        return;
      }

      addedEmotesDatabase.insert(addedEmote, guild.id);

      const sevenTVEmoteNotInSet = await (async (): Promise<SevenTVEmoteNotInSet> => {
        const sevenTVEmoteNotInSet_ = (await fetchAndJson(addedEmote.url)) as SevenTVEmoteNotInSet;

        if (alias !== null) return { ...sevenTVEmoteNotInSet_, name: alias };
        else return sevenTVEmoteNotInSet_;
      })();

      guild.personalEmoteMatcherConstructor.addSevenTVEmoteNotInSet(sevenTVEmoteNotInSet);
      guild.emoteMatcher.addSevenTVEmoteNotInSetSuffix(sevenTVEmoteNotInSet);

      await defer;
      await interaction.editReply(
        `added emote ${sevenTVUrlToSevenNotInSet_.name}${alias !== null ? ` with alias ${alias}` : ''}`
      );
    } catch (error) {
      console.log(
        `Error at addEmoteHandlerSevenNotInSet --> ${error instanceof Error ? error.message : String(error)}`
      );

      await defer;
      await interaction.editReply('failed to add emote');
    }
  };
}
