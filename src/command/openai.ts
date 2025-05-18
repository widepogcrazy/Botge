import type { CommandInteraction } from 'discord.js';

import type { ReadonlyOpenAI } from '../types.js';
import type { Guild } from '../guild.js';

const MAXDISCORDMESSAGELENGTH = 2000;

export function chatgptHandler(openai: ReadonlyOpenAI | undefined) {
  return async (interaction: CommandInteraction, guild: Readonly<Guild>): Promise<void> => {
    if (openai === undefined) {
      void interaction.reply('chatgpt command is not available in this server.');
      return;
    }
    const defer = interaction.deferReply();
    try {
      const text = String(interaction.options.get('text')?.value).trim();

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: text }]
      });
      const messageContent = completion.choices[0].message.content;

      const replyText =
        messageContent !== null
          ? messageContent.length > MAXDISCORDMESSAGELENGTH
            ? messageContent.slice(0, MAXDISCORDMESSAGELENGTH - 5) + ' ...'
            : messageContent
          : '';

      await defer;
      await interaction.editReply(replyText);
    } catch (error) {
      console.log(`Error at chatgpt --> ${error instanceof Error ? error.message : String(error)}`);

      await defer;
      await interaction.editReply('failed to chatpgt.');
    }
  };
}
