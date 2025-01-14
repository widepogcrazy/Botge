import type { CommandInteraction } from 'discord.js';

import { sevenTVUrlToSevenTVNotInSet, SPLITTER } from '../utils/platform-url-to-api-url.js';
import type { AddedEmote, SevenTVEmoteNotInSet } from '../types.js';
import { CDN_ENDPOINTS } from '../paths-and-endpoints.js';
import type { AddedEmotesDatabase } from '../api/added-emotes-database.js';
import type { Guild } from '../guild.js';
import { fetchAndJson } from '../utils/fetch-and-json.js';

export function addEmoteHandlerSevenTVNotInSet(
  addedEmotesDatabase: Readonly<AddedEmotesDatabase>,
  guild: Readonly<Guild>
) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const url = String(interaction.options.get('url')?.value);
      const aliasOption = interaction.options.get('alias')?.value;
      const alias = aliasOption !== undefined ? String(aliasOption) : undefined;

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
      const addedEmotes = addedEmotesDatabase.getAll(guild.ids);
      if (addedEmotes.some((addedEmote_) => addedEmote_.url === addedEmote.url)) {
        await defer;
        await interaction.editReply('theres already an emote with the same url');

        return;
      }

      addedEmotesDatabase.insert(addedEmote, guild.ids);

      const sevenTVEmoteNotInSet = (await fetchAndJson(addedEmote.url)) as SevenTVEmoteNotInSet;
      if (alias !== undefined) sevenTVEmoteNotInSet.name = alias;

      guild.personalEmoteMatcherConstructor.addSevenTVEmoteNotInSet(sevenTVEmoteNotInSet);
      guild.emoteMatcher.addSevenTVEmoteNotInSetSuffix(sevenTVEmoteNotInSet);

      await defer;
      await interaction.editReply(
        `added emote ${sevenTVUrlToSevenNotInSet_.name}${alias !== undefined ? ` with alias ${alias}` : ''}`
      );

      return;
    } catch (error) {
      console.log(`Error at addEmoteHandlerSevenNotInSet --> ${error instanceof Error ? error : 'error'}`);

      await defer;
      await interaction.editReply('failed to add emote');

      return;
    }
  };
}
