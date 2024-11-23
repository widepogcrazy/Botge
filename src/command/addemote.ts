import type { CommandInteraction } from 'discord.js';

import type { SevenEmoteNotInSet, RequiredState, AssetInfo } from '../types.js';

import { sevenUrlToSevenNotInSet } from '../utils/sevenUrlToSevenNotInSet.js';

import { sevenNotInSetToAsset } from '../utils/emoteToAssetInfo.js';

export function addEmoteHandlerSevenNotInSet(s: RequiredState, emoteEndpoint: string) {
  return async function addEmoteHandlerSevenNotInSetInnerFunction(interaction: CommandInteraction): Promise<boolean> {
    const defer = interaction.deferReply();
    try {
      const text = String(interaction.options.get('text')?.value);

      const urlToSevenNotInSet_: SevenEmoteNotInSet | undefined = await sevenUrlToSevenNotInSet(text, emoteEndpoint);
      if (urlToSevenNotInSet_ === undefined) return false;

      const sevenEmoteNotInSet = urlToSevenNotInSet_;
      const sevenEmoteNotInSetAssetInfo: AssetInfo = sevenNotInSetToAsset(sevenEmoteNotInSet);

      if (s.emoteMatcher.matchSingle(sevenEmoteNotInSetAssetInfo.name)) {
        await defer;
        await interaction.editReply('theres already an emote with the same name');

        return false;
      }

      await s.fileEmoteDb.add(sevenEmoteNotInSetAssetInfo.url);
      await s.refreshEmotes();

      await defer;
      await interaction.editReply(`added emote ${sevenEmoteNotInSetAssetInfo.name}`);

      return true;
    } catch (error) {
      console.log(`Error at addEmoteHandlerSevenNotInSet --> ${error instanceof Error ? error : 'error'}`);

      await defer;
      await interaction.editReply('failed to add emote');

      return false;
    }
  };
}
