import type { CommandInteraction } from 'discord.js';
import type { v2 } from '@google-cloud/translate';

export function translateHandler(translate: v2.Translate) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const text = String(interaction.options.get('text')?.value);
      const [translatedText] = await translate.translate(text, 'en');
      // const api_resp = resp[1];  // how to check error?

      await defer;
      await interaction.editReply(translatedText);
      return;
    } catch (error) {
      console.log(`Error at translate --> ${error instanceof Error ? error : 'error'}`);

      await defer;
      await interaction.editReply('Failed to translate.');
      return;
    }
  };
}
