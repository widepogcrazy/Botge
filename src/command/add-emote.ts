import type { CommandInteraction } from 'discord.js';

import { sevenUrlToSevenNotInSet, SPLITTER } from '../utils/platform-url-to-api-url.js';
import type { SevenEmoteNotInSet, AddedEmote } from '../types.js';
import { SEVEN_NOT_IN_SET_ENDPOINT } from '../paths-and-endpoints.js';
import type { AddedEmotesDatabase } from '../api/database/added-emotes-database.js';
import type { TwitchApi } from '../api/twitch-api.js';
import type { Guild } from '../guild.js';

export function addEmoteHandlerSevenNotInSet(
  twitchApi: Readonly<TwitchApi> | undefined,
  addedEmotesDatabase: Readonly<AddedEmotesDatabase>,
  guild: Readonly<Guild>
) {
  return async function addEmoteHandlerSevenNotInSetInnerFunction(interaction: CommandInteraction): Promise<void> {
    const defer = interaction.deferReply();
    try {
      const text = String(interaction.options.get('text')?.value);

      const urlToSevenNotInSet_: SevenEmoteNotInSet | undefined = await sevenUrlToSevenNotInSet(text);
      if (urlToSevenNotInSet_ === undefined) return;

      if (guild.getEmoteMatcher().matchSingleExact(urlToSevenNotInSet_.name)) {
        await defer;
        await interaction.editReply('theres already an emote with the same name');

        return;
      }

      const emoteId = text.split(SPLITTER).at(-1);
      const addedEmote: AddedEmote = { url: `${SEVEN_NOT_IN_SET_ENDPOINT}${SPLITTER}${emoteId}` };
      if (emoteId !== undefined) addedEmotesDatabase.insert(addedEmote, guild.id);
      await guild.refreshEmotes(twitchApi, addedEmotesDatabase);

      await defer;
      await interaction.editReply(`added emote ${urlToSevenNotInSet_.name}`);

      return;
    } catch (error) {
      console.log(`Error at addEmoteHandlerSevenNotInSet --> ${error instanceof Error ? error : 'error'}`);

      await defer;
      await interaction.editReply('failed to add emote');

      return;
    }
  };
}
