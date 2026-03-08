/** @format */

import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

import { getOptionValueWithoutUndefined } from '../utils/get-option-value.ts';
import type { QuoteDatabase } from '../api/quote-database.ts';
import type { Guild } from '../guild.ts';
import { GUILD_ID_CUTEDOG } from '../guilds.ts';

export function quoteHandler(quoteDataBase: Readonly<QuoteDatabase>) {
  return async (interaction: ChatInputCommandInteraction, guild: Readonly<Guild>): Promise<void> => {
    try {
      const name = getOptionValueWithoutUndefined<string>(interaction, 'name');
      const quoteContent = ((): string | undefined => {
        const quoteContent_ = quoteDataBase.getQuoteContent(interaction.user.id, name);
        if (quoteContent_ !== undefined) return quoteContent_;

        return quoteDataBase.getQuoteContent(interaction.user.id, name.toLowerCase());
      })();

      const quoteNotFoundReply = interaction.guildId === GUILD_ID_CUTEDOG ? 'jij' : 'Quote not found.';

      if (quoteContent === undefined) {
        await interaction.reply({ content: quoteNotFoundReply, flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.reply(quoteContent);
    } catch (error) {
      console.log(`Error at quoteHandler --> ${error instanceof Error ? error.message : String(error)}`);

      await interaction.reply({
        content: 'Something went wrong. Please try again later.',
        flags: MessageFlags.Ephemeral
      });
    }
  };
}
