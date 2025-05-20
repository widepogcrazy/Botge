import type { ChatInputCommandInteraction } from 'discord.js';

import type { ReadonlyOpenAI } from '../types.js';
import type { Guild } from '../guild.js';

const MAXDISCORDMESSAGELENGTH = 2000;

export function chatgptHandler(openai: ReadonlyOpenAI | undefined) {
  return async (interaction: ChatInputCommandInteraction, guild: Readonly<Guild>): Promise<void> => {
    if (openai === undefined) {
      await interaction.reply('chatgpt command is not available in this server.');
      return;
    }

    const defer = interaction.deferReply();
    try {
      const prompt = String(interaction.options.get('prompt')?.value).trim();

      //1 token is around 4 english characters
      const response = await openai.responses.create({
        model: 'gpt-4.1',
        input: [{ role: 'user', content: prompt }],
        max_output_tokens: 500
      });
      const messageContent = response.output_text;

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
      console.log(`Error at chatgpt --> ${error instanceof Error ? error.message : String(error)}`);

      await defer;
      await interaction.editReply('failed to chatpgt.');
    }
  };
}
