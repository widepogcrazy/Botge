import type { CommandInteraction } from 'discord.js';

import type { TwitchClipsDatabase } from '../api/twitch-clips-database.js';

export function clipHandler(twitchClipsDatabase: Readonly<TwitchClipsDatabase>) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const text = String(interaction.options.get('text')?.value).trim().toLowerCase();

      const getByTitle_ = twitchClipsDatabase.getByTitle(text);

      if (getByTitle_.length === 0) {
        await defer;
        await interaction.editReply('Could not find clip.');
      } else if (getByTitle_.length === 1) {
        await defer;
        await interaction.editReply(getByTitle_[0].url);
      } else {
        const urls = getByTitle_.map((twitchClip) => twitchClip.url).join('\n');

        await defer;
        if(urls.length >= 2000 ) await interaction.editReply('too many clips.');
        else await interaction.editReply(urls);
      }

      return;
    } catch (error: unknown) {
      console.log(`Error at clipHandler --> ${error instanceof Error ? error : 'error'}`);

      await defer;
      await interaction.editReply('failed to get clip.');
      return;
    }
  };
}
