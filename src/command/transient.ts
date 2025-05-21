import type { ChatInputCommandInteraction } from 'discord.js';

import type { Guild } from '../guild.js';

async function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

export function transientHandler() {
  return async function transientHandlerInnerFunction(
    interaction: ChatInputCommandInteraction,
    guild: Readonly<Guild>
  ): Promise<undefined> {
    const defer = interaction.deferReply();
    try {
      const attachment = interaction.options.get('attachment')?.attachment;
      const text = interaction.options.get('text')?.value;

      const duration = ((): number => {
        const option = interaction.options.get('duration')?.value;
        if (option === undefined) return 3;
        return Math.min(option as number, 600);
      })();

      const reply = {
        content:
          attachment === undefined ? (text === undefined ? 'Empty command wtf' : (text as string)) : attachment.url
      };

      await defer;
      await interaction.editReply(reply);

      await sleep(duration);
      await interaction.editReply({ content: 'biboo' });
      await interaction.deleteReply();
    } catch (error: unknown) {
      console.log(`Error at transientHandler --> ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
