import type { ChatInputCommandInteraction } from 'discord.js';
import type { GoogleGenAI } from '@google/genai';
import type { Guild } from '../guild.js';

const MAXDISCORDMESSAGELENGTH = 2000;

export function geminiHandler(googleGenAi: Readonly<GoogleGenAI> | undefined) {
  return async (interaction: ChatInputCommandInteraction, guild: Readonly<Guild>): Promise<void> => {
    if (googleGenAi === undefined) {
      await interaction.reply('Gemini command is not available right now.');
      return;
    }

    const defer = interaction.deferReply();
    try {
      const prompt = String(interaction.options.get('prompt')?.value).trim();

      //1 token is around 4 english characters
      const response = await googleGenAi.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: prompt,
        config: { maxOutputTokens: 400 }
      });
      const messageContent = response.text;

      if (messageContent === undefined) {
        await defer;
        await interaction.editReply('Gemini returned empty response.');
        return;
      }

      const reply =
        messageContent.length > MAXDISCORDMESSAGELENGTH
          ? messageContent.slice(0, MAXDISCORDMESSAGELENGTH - 5) + ' ...'
          : messageContent;
      await defer;
      await interaction.editReply(reply);
    } catch (error) {
      console.log(`Error at gemini --> ${error instanceof Error ? error.message : String(error)}`);

      await defer;
      await interaction.editReply('Failed to Gemini.');
    }
  };
}
