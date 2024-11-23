import type { CommandInteraction } from 'discord.js';

import type { TwitchClip } from '../types.js';

export function clipHandler(twitchClips: readonly TwitchClip[]) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const text = String(interaction.options.get('text')?.value).trim().toLowerCase();

      const twitchClip = twitchClips.find((twitchClip_) => twitchClip_.title.toLowerCase().includes(text));

      await defer;
      if (twitchClip !== undefined) await interaction.editReply(twitchClip.url);
      else await interaction.editReply('Could not find clip.');

      return;
    } catch (error: unknown) {
      console.log(`Error at clipHandler --> ${error instanceof Error ? error : 'error'}`);

      await defer;
      await interaction.editReply('failed to get clip.');
      return;
    }
  };
}
