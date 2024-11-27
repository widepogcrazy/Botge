import type { Index } from 'meilisearch';
import type { CommandInteraction } from 'discord.js';
import type { TwitchClip, ReadonlyHit } from '../types.js';

export function clipHandler(twitchClipsMeiliSearchIndex: Index) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const text = String(interaction.options.get('text')?.value).trim().toLowerCase();

      const search = await twitchClipsMeiliSearchIndex.search(text, {
        attributesToSearchOn: ['title', 'creator_name', 'game_id']
      });
      const hits: readonly TwitchClip[] = search.hits.map((hit: ReadonlyHit) => hit as TwitchClip);

      if (hits.length === 0) {
        await defer;
        await interaction.editReply('Could not find clip.');
      } else {
        await defer;
        await interaction.editReply(hits[0].url);
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
