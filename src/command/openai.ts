import { CommandInteraction } from 'discord.js';
import { OpenAI } from 'openai';

export function chatgptHandler(openai: OpenAI) {
  return async (interaction: CommandInteraction) => {
    try {
      const defer = interaction.deferReply();
      const text: string = interaction.options.get('text').value as string;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: text }]
      });

      await defer;
      await interaction.editReply(completion.choices[0].message.content);
    } catch (error) {
      console.log(`Error at chatgpt --> ${error}`);
      await interaction.editReply('failed to translate.');
    }
  };
}
