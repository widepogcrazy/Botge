import type { CommandInteraction } from 'discord.js';

export function helpHandler() {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      await defer;
      await interaction.editReply(
        'https://cdn.discordapp.com/attachments/251211223012474880/1300042554934300722/image.png?ex=671f667a&is=671e14fa&hm=703c0932387a3bc78522323b9f1d7ba21440b18921d6405e9899b14a4d1b96eb&'
      );
    } catch (error) {
      console.log(`Error at help --> ${error instanceof Error ? error : 'error'}`);

      await defer;
      await interaction.editReply('Failed to help.');
    }
  };
}
