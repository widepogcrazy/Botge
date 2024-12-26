import type { CommandInteraction } from 'discord.js';

async function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

export function transientHandler() {
  return async function transientHandlerInnerFunction(interaction: CommandInteraction): Promise<undefined> {
    const defer = interaction.deferReply();
    try {
      const attachment = interaction.options.get('file')?.attachment;
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
      await interaction.deleteReply();
    } catch (error: unknown) {
      console.log(`Error at transientHandler --> ${error instanceof Error ? error : 'error'}`);
      return;
    }
  };
}
