import { OpenAI } from 'openai';
import { CommandInteraction } from 'discord.js';

const MAXDISCORDMESSAGELENGTH = 2000;

export function chatgptHandler(openai: OpenAI) {
  return async (interaction: CommandInteraction) => {
    const defer = interaction.deferReply();
    try {
      const text: string = interaction.options.get('text').value as string;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: text }]
      });
      const messagecontent = completion.choices[0].message.content;
      const replytext =
        messagecontent.length > MAXDISCORDMESSAGELENGTH
          ? messagecontent.slice(0, MAXDISCORDMESSAGELENGTH - 5) + ' ...'
          : messagecontent;

      await defer;
      await interaction.editReply(replytext);
      return;
    } catch (error) {
      console.log(`Error at chatgpt --> ${error}`);
      await defer;
      await interaction.editReply('failed to chatpgt.');
      return;
    }
  };
}
