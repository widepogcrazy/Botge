import type { CommandInteraction } from 'discord.js';

import { sevenUrlToSevenNotInSet, SPLITTER } from '../utils/platform-url-to-api-url.js';
import type { SevenEmoteNotInSet, RequiredState, AddedEmote } from '../types.js';
import { EMOTE_ENDPOINTS } from '../paths-and-endpoints.js';

export function addEmoteHandlerSevenNotInSet(s: RequiredState) {
  return async function addEmoteHandlerSevenNotInSetInnerFunction(interaction: CommandInteraction): Promise<void> {
    const defer = interaction.deferReply();
    try {
      const text = String(interaction.options.get('text')?.value);

      const urlToSevenNotInSet_: SevenEmoteNotInSet | undefined = await sevenUrlToSevenNotInSet(text);
      if (urlToSevenNotInSet_ === undefined) return;

      if (s.emoteMatcher.matchSingleExact(urlToSevenNotInSet_.name)) {
        await defer;
        await interaction.editReply('theres already an emote with the same name');

        return;
      }

      const emoteId = text.split(SPLITTER).at(-1);
      const addedEmote: AddedEmote = { url: `${EMOTE_ENDPOINTS.sevenEmotesNotInSet}${SPLITTER}${emoteId}` };
      if (emoteId !== undefined) s.addedEmotesDatabase.insert(addedEmote);
      await s.refreshEmotes();

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
