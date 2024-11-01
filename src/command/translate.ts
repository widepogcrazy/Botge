import { v2 } from '@google-cloud/translate';
import { CommandInteraction } from 'discord.js';

export function TranslateHandler(translate: v2.Translate) {
  return async (interaction: CommandInteraction) => {
    const defer = interaction.deferReply();
    const text = interaction.options.get('text').value as string;
    try {
      const resp = await translate.translate(text, 'en');
      const translatedText = resp[0];
      // const api_resp = resp[1];  // how to check error?
      await defer;
      await interaction.editReply(translatedText);
    } catch (error) {
      console.log(`Error at translate --> ${error}`);
      await interaction.editReply('Failed to translate.');
      return;
    }
  };
}
