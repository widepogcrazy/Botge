import type { OpenAI } from 'openai';
import type { CommandInteraction } from 'discord.js';

const MAXDISCORDMESSAGELENGTH = 2000;

export function chatgptHandler(openai: OpenAI) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const text: string = interaction.options.get('text')?.value as string;

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
      return;
    } catch (error) {
      if (error instanceof Error) console.log(`Error at chatgpt --> ${error}`);
      await defer;
      await interaction.editReply('failed to chatpgt.');
      return;
    }
  };
}
