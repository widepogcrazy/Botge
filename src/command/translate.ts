import type { CommandInteraction } from 'discord.js';
import type { ReadonlyTranslator } from '../types.js';

export function translateHandler(translator: ReadonlyTranslator) {
  return async (interaction: CommandInteraction): Promise<void> => {
    await interaction.deferReply();

    try {
      const text = String(interaction.options.get('text')?.value);

      // Let DeepL auto-detect the source language by passing null
      const result = await translator.translateText(text, null, 'en-US');

      await interaction.editReply(result.text);
      return;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error at translate --> ${errorMessage}`);

      await interaction.editReply('Failed to translate.');
    }
  };
}
