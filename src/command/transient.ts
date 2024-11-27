import type { CommandInteraction } from 'discord.js';

const sleep = (seconds: number) => new Promise((r) => setTimeout(r, seconds * 1000));

export function transientHandler() {
  return async function transientHandlerInnerFunction(interaction: CommandInteraction): Promise<undefined> {
    const defer = interaction.deferReply();
    try {
      const attachment = interaction.options.get('file')?.attachment;
      const text = interaction.options.get('text')?.value;
      const duration = ((): number => {
        const option = interaction.options.get('duration')?.value;
        if (option === undefined) {
          return 3;
        }
        return Math.min(option as number, 600);
      })();

      const reply = {
        content: attachment === undefined ? (text as string) : attachment!.url
      };
      await defer;
      await interaction.editReply(reply);
      await sleep(duration);
      interaction.deleteReply();
    } catch (error: unknown) {
      console.log(`Error at transientHandler --> ${error instanceof Error ? error : 'error'}`);
      return;
    }
  };
}
