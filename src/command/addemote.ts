import type { CommandInteraction } from 'discord.js';

import type { SevenEmoteNotInSet, RequiredState } from '../types.js';

const SPLITTER = '/';

const regExpSevenEmoteNotInSet: Readonly<RegExp> = new RegExp(/^https:\/\/7tv\.app\/emotes\/[A-Z0-9]{26}$/);

export function addEmoteHandlerSevenNotInSet(s: RequiredState, emoteEndpoint: string) {
  return async function addEmoteHandlerSevenNotInSetInnerFunction(interaction: CommandInteraction): Promise<boolean> {
    const defer = interaction.deferReply();
    try {
      const text = String(interaction.options.get('text')?.value);
      const textSplit: readonly string[] = text.split(SPLITTER);

      const regExpSevenEmoteNotInSetTest: boolean = regExpSevenEmoteNotInSet.test(text);

      if (!regExpSevenEmoteNotInSetTest) return false;

      // TODO: USE REGEX CAPTURE
      const sevenEmoteNotInSetId = textSplit.at(-1);
      const sevenEmoteNotInSetURL = `${emoteEndpoint}${SPLITTER}${sevenEmoteNotInSetId}`;

      const sevenEmoteNotInSet: SevenEmoteNotInSet = (await (
        await fetch(sevenEmoteNotInSetURL)
      ).json()) as SevenEmoteNotInSet;

      if (s.emoteMatcher.matchSingle(sevenEmoteNotInSet.name)) {
        await defer;
        await interaction.editReply('theres already an emote with the same name');

        return false;
      }

      await s.fileEmoteDb.add(sevenEmoteNotInSetURL);
      await s.refreshEmotes();

      await defer;
      await interaction.editReply(`added emote ${sevenEmoteNotInSet.name}`);

      return true;
    } catch (error) {
      console.log(`Error at addEmoteHandlerSevenNotInSet --> ${error instanceof Error ? error : 'error'}`);

      await defer;
      await interaction.editReply('failed to add emote');

      return false;
    }
  };
}
