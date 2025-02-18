import type { CommandInteraction } from 'discord.js';

import type { ReadonlyOpenAI } from '../types.js';

const MAXDISCORDMESSAGELENGTH = 2000;

export function chatgptHandler(openai: ReadonlyOpenAI) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const text = String(interaction.options.get('text')?.value);

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
