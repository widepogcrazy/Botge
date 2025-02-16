import type { CommandInteraction } from 'discord.js';

import type { ReadonlyTranslator } from '../types.js';

export function translateHandler(translator: ReadonlyTranslator) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const text = String(interaction.options.get('text')?.value);

      // Let DeepL auto-detect the source language by passing null
      const result = await translator.translateText(text, null, 'en-US', {
        modelType: 'latency_optimized',
        formality: 'prefer_less'
      });

      await defer;
      await interaction.editReply(result.text);
    } catch (error: unknown) {
      console.error(`Error at translate --> ${error instanceof Error ? error.message : String(error)}`);

      await defer;
      await interaction.editReply('Failed to translate.');
    }
  };
}
