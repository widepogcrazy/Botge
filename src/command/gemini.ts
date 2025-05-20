import type { ChatInputCommandInteraction } from 'discord.js';
import type { GoogleGenAI } from '@google/genai';
import type { Guild } from '../guild.js';

const MAXDISCORDMESSAGELENGTH = 2000;

export function geminiHandler(googleGenAi: Readonly<GoogleGenAI> | undefined) {
  return async (interaction: ChatInputCommandInteraction, guild: Readonly<Guild>): Promise<void> => {
    if (googleGenAi === undefined) {
      await interaction.reply('gemini command is not available in this server.');
      return;
    }

    const defer = interaction.deferReply();
    try {
      const prompt = String(interaction.options.get('prompt')?.value).trim();

      //1 token is around 4 english characters
      const response = await googleGenAi.models.generateContent({
        model: 'gemini-2.5-flash-preview-04-17',
        contents: prompt,
        config: { maxOutputTokens: 500 }
      });
      const messageContent = response.text;

      await defer;
      if (messageContent === undefined) {
        await interaction.editReply('gemini returned empty response.');
        return;
      }
      if (messageContent.length > MAXDISCORDMESSAGELENGTH) {
        await defer;
        await interaction.editReply(messageContent.slice(0, MAXDISCORDMESSAGELENGTH - 5) + ' ...');

        const followUp = '... ' + messageContent.slice(MAXDISCORDMESSAGELENGTH - 5);
        if (followUp.length > MAXDISCORDMESSAGELENGTH)
          await interaction.followUp(followUp.slice(0, MAXDISCORDMESSAGELENGTH - 5) + ' ...');
        else await interaction.followUp(followUp);
      } else {
        await defer;
        await interaction.editReply(messageContent);
      }
    } catch (error) {
      console.log(`Error at gemini --> ${error instanceof Error ? error.message : String(error)}`);

      await defer;
      await interaction.editReply('failed to gemini.');
    }
  };
}
