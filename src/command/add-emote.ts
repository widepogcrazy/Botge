import type { CommandInteraction } from 'discord.js';

import { sevenTVUrlToSevenNotInSet, SPLITTER } from '../utils/platform-url-to-api-url.js';
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
      const text = String(interaction.options.get('text')?.value);

      const sevenTVUrlToSevenNotInSet_ = await sevenTVUrlToSevenNotInSet(text);
      if (sevenTVUrlToSevenNotInSet_ === undefined) {
        await defer;
        await interaction.editReply('invalid url');

        return;
      }

      if (guild.emoteMatcher.matchSingleExact(sevenTVUrlToSevenNotInSet_.name)) {
        await defer;
        await interaction.editReply('theres already an emote with the same name');

        return;
      }

      const emoteId = text.split(SPLITTER).at(-1);
      if (emoteId === undefined) {
        //this shouldnt happen
        await defer;
        await interaction.editReply('something went wrong');

        return;
      }
      const addedEmote: AddedEmote = { url: `${CDN_ENDPOINTS.sevenTVNotInSet}${SPLITTER}${emoteId}` };
      addedEmotesDatabase.insert(addedEmote, guild.id);
      const addedEmoteFetched = (await fetchAndJson(addedEmote.url)) as SevenTVEmoteNotInSet;

      guild.addSevenTVEmoteNotInSet(addedEmoteFetched);

      await defer;
      await interaction.editReply(`added emote ${sevenTVUrlToSevenNotInSet_.name}`);

      return;
    } catch (error) {
      console.log(`Error at addEmoteHandlerSevenNotInSet --> ${error instanceof Error ? error : 'error'}`);

      await defer;
      await interaction.editReply('failed to add emote');

      return;
    }
  };
}
