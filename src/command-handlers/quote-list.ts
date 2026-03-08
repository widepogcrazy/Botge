/** @format */

import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

import { QuoteMessageBuilder } from '../message-builders/quote-message-builder.ts';
import { getOptionValue } from '../utils/get-option-value.ts';
import type { QuoteDatabase } from '../api/quote-database.ts';
import type { Guild } from '../guild.ts';
import type { Quote } from '../types.ts';

export function quoteListHandler(
  quoteDataBase: Readonly<QuoteDatabase>,
  quoteMessageBuilders: Readonly<QuoteMessageBuilder>[]
) {
  return async (interaction: ChatInputCommandInteraction, guild: Readonly<Guild>): Promise<void> => {
    const defer = interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const sortBy = getOptionValue<string>(interaction, 'sortby');
      const userId = interaction.user.id;
      const allQuote = ((): readonly Quote[] => {
        const allQuote_ = quoteDataBase.getAllQuote(userId);

        if (sortBy === 'alphabetical') return [...allQuote_].sort((a, b) => a.name.localeCompare(b.name));
        return allQuote_;
      })();

      if (allQuote.length === 0) {
        await defer;
        await interaction.editReply('You do not have any quote added.');
        return;
      }

      const quoteMessageBuilder = new QuoteMessageBuilder(interaction, allQuote, sortBy);

      const reply = quoteMessageBuilder.first();
      await defer;

      if (reply === undefined) return;
      await interaction.editReply(reply);
      quoteMessageBuilders.push(quoteMessageBuilder);
    } catch (error) {
      console.log(`Error at quoteListHandler --> ${error instanceof Error ? error.stack : String(error)}`);

      await defer;
      await interaction.editReply('Failed to show quote list.');
    }
  };
}
