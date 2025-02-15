import type { CommandInteraction } from 'discord.js';
import type { ReadonlyGuildEmoji } from '../types.js';

const DEFAULTSIZE = 3;

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

      const emojis = await (await guild.fetch()).emojis.fetch();

      const emojiArray: readonly string[] = Array.from(emojis.entries())
        .filter((emoji: readonly [string, ReadonlyGuildEmoji]) => emoji[1].animated === false)
        .map((emoji: readonly [string, ReadonlyGuildEmoji]) => `<:${emoji[1].name}:${emoji[0]}>`);
      if (emojiArray.length < 2) {
        await defer;
        await interaction.editReply('Must have at least 2 emojis in the server.');
        return;
      }

      let findTheEmoji = '';
      if (emojige !== undefined) {
        if (!emojiArray.some((emoji) => emoji === emojige)) {
          await defer;
          await interaction.editReply('Emoji not found.');
          return;
        }

        findTheEmoji = emojige;
      } else {
        findTheEmoji = emojiArray[Math.floor(Math.random() * emojiArray.length)];
      }

      let alignment = '';
      switch (size) {
        case 3:
          alignment = '               ';
          break;
        case 4:
          alignment = '            ';
          break;
        case 5:
          alignment = '          ';
          break;
        case 6:
          alignment = '      ';
          break;
        case 7:
          alignment = '   ';
          break;
      }

      let reply = '';
      reply += `⬇️ Find the emoji: ${findTheEmoji} ⬇️\n`;
      reply += alignment;

      const findTheEmojiPosition = Math.floor(Math.random() * size * size) + 1;
      for (let i = 1; i <= size * size; i++) {
        if (i === findTheEmojiPosition) {
          reply += `||${findTheEmoji}||`;
        } else {
          let randomEmoji = emojiArray[Math.floor(Math.random() * emojiArray.length)];
          while (randomEmoji === findTheEmoji) randomEmoji = emojiArray[Math.floor(Math.random() * emojiArray.length)];

          reply += `||${randomEmoji}||`;
        }

        if (i % size === 0) {
          reply += '\n';
          reply += alignment;
        }
      }

      await defer;
      await interaction.editReply(reply.trim());
    } catch (error) {
      console.log(`Error at findTheEmojo --> ${error instanceof Error ? error : 'error'}`);

      await defer;
      await interaction.editReply('Failed to generate the find the emoji grid.');
    }
  };
}
