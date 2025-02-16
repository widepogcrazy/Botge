import type { CommandInteraction, GuildEmoji } from 'discord.js';

const DEFAULTSIZE = 5;

export function findTheEmojiHandler() {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const emojige = ((): string | undefined => {
        const emojiOptions = interaction.options.get('emoji')?.value;
        return emojiOptions !== undefined ? String(emojiOptions).trim() : undefined;
      })();
      const size = ((): number => {
        const sizeOptions = interaction.options.get('size')?.value;
        return sizeOptions !== undefined ? Number(sizeOptions) : DEFAULTSIZE;
      })();

      if (size < 3) {
        await defer;
        await interaction.editReply('Size must be at least 3.');
        return;
      } else if (size > 7) {
        await defer;
        await interaction.editReply('Size must be at most 7.');
        return;
      }

      const { guild } = interaction;
      if (guild === null) {
        await defer;
        await interaction.editReply('The bot must be in a server for this command to work.');
        return;
      }

      const emojiArray: readonly string[] = Array.from((await (await guild.fetch()).emojis.fetch()).entries())
        .filter((emoji: readonly [string, GuildEmoji]) => emoji[1].animated === false)
        .map((emoji: readonly [string, GuildEmoji]) => `<:${emoji[1].name}:${emoji[0]}>`);

      if (emojiArray.length < 2) {
        await defer;
        await interaction.editReply('Must have at least 2 non-animated emojis in the server.');
        return;
      }
      if (emojige !== undefined && !emojiArray.some((emoji) => emoji === emojige)) {
        await defer;
        await interaction.editReply('Emoji must be from this server.');
        return;
      }

      const findTheEmoji = emojige ?? emojiArray[Math.floor(Math.random() * emojiArray.length)];

      const alignment = ((): string => {
        switch (size) {
          case 3:
            return '               ';
          case 4:
            return '            ';
          case 5:
            return '          ';
          case 6:
            return '      ';
          case 7:
            return '   ';
          default:
            return '';
        }
      })();

      const reply = ((): string => {
        let reply_ = `⬇️ Find the emoji: ${findTheEmoji} ⬇️`;
        reply_ += `\n${alignment}`;

        const findTheEmojiPosition = Math.floor(Math.random() * size * size) + 1;
        for (let i = 1; i <= size * size; i++) {
          if (i !== findTheEmojiPosition) {
            let randomEmoji = emojiArray[Math.floor(Math.random() * emojiArray.length)];
            while (randomEmoji === findTheEmoji)
              randomEmoji = emojiArray[Math.floor(Math.random() * emojiArray.length)];

            reply_ += `||${randomEmoji}||`;
          } else {
            reply_ += `||${findTheEmoji}||`;
          }

          if (i % size === 0) reply_ += `\n${alignment}`;
        }

        return reply_.trim();
      })();

      await defer;
      await interaction.editReply(reply);
      throw Error('This is a test error');
    } catch (error) {
      console.log(`Error at findTheEmoji --> ${error instanceof Error ? error.message : String(error)}`);

      await defer;
      await interaction.editReply('Failed to generate the find the emoji grid.');
    }
  };
}
