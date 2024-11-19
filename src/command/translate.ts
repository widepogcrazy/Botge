import type { v2 } from '@google-cloud/translate';
import type { CommandInteraction } from 'discord.js';

export default function translateHandler(translate: v2.Translate) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const text = interaction.options.get('text')?.value as string;
      const resp = await translate.translate(text, 'en');
      const [translatedText] = resp;
      // const api_resp = resp[1];  // how to check error?

      await defer;
      await interaction.editReply(translatedText);
      return;
    } catch (error) {
      if (error instanceof Error) console.log(`Error at translate --> ${error}`);
      await defer;
      await interaction.editReply('Failed to translate.');
      return;
    }
  };
}
