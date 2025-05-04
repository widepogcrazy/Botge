import type { ButtonInteraction } from 'discord.js';
import { TwitchClipMessageBuilder } from '../twitch-clip-message-builder.js';
import { EmoteMessageBuilder } from '../emote-message-builder.js';

import {
  getBaseCustomIdFromCustomId,
  getMessageBuilderTypeFromCustomId,
  getCounterFromCustomId,
  FIRST_BUTTON_BASE_CUSTOM_ID,
  LAST_BUTTON_BASE_CUSTOM_ID,
  PREVIOUS_BUTTON_BASE_CUSTOM_ID,
  NEXT_BUTTON_BASE_CUSTOM_ID,
  JUMP_TO_BUTTON_BASE_CUSTOM_ID
} from '../message-builders/base.js';

export function buttonHandler(
  twitchClipMessageBuilders: readonly Readonly<TwitchClipMessageBuilder>[],
  emoteMessageBuilders: readonly Readonly<EmoteMessageBuilder>[]
) {
  return async (interaction: ButtonInteraction): Promise<void> => {
    try {
      const { customId } = interaction;

      const messageBuilders = (():
        | readonly Readonly<TwitchClipMessageBuilder>[]
        | readonly Readonly<EmoteMessageBuilder>[]
        | undefined => {
        const messageBuilderType = getMessageBuilderTypeFromCustomId(customId);

        if (messageBuilderType === TwitchClipMessageBuilder.messageBuilderType) return twitchClipMessageBuilders;
        else if (messageBuilderType === EmoteMessageBuilder.messageBuilderType) return emoteMessageBuilders;
        return undefined;
      })();
      if (messageBuilders === undefined) return;

      const counter = getCounterFromCustomId(customId);
      const messageBuilderIndex = messageBuilders.findIndex(
        (messageBuilder: Readonly<TwitchClipMessageBuilder> | Readonly<EmoteMessageBuilder>) =>
          messageBuilder.counter === counter
      );
      if (messageBuilderIndex === -1) return;

      const baseCustomId = getBaseCustomIdFromCustomId(customId);
      const messageBuilder = messageBuilders[messageBuilderIndex];
      const messageBuilderInteraction = messageBuilder.interaction;
      const { row } = messageBuilder;

      //can't defer, when showing modal
      if (baseCustomId === PREVIOUS_BUTTON_BASE_CUSTOM_ID) {
        const embed = messageBuilder.previous();
        await interaction.deferUpdate();

        if (embed === undefined) return;
        await messageBuilderInteraction.editReply({
          embeds: [embed],
          components: [row]
        });
      } else if (baseCustomId === NEXT_BUTTON_BASE_CUSTOM_ID) {
        const embed = messageBuilder.next();
        await interaction.deferUpdate();

        if (embed === undefined) return;
        await messageBuilderInteraction.editReply({
          embeds: [embed],
          components: [row]
        });
      } else if (baseCustomId === FIRST_BUTTON_BASE_CUSTOM_ID) {
        const embed = messageBuilder.first();
        await interaction.deferUpdate();

        if (embed === undefined) return;
        await messageBuilderInteraction.editReply({
          embeds: [embed],
          components: [row]
        });
      } else if (baseCustomId === LAST_BUTTON_BASE_CUSTOM_ID) {
        const embed = messageBuilder.last();
        await interaction.deferUpdate();

        if (embed === undefined) return;
        await messageBuilderInteraction.editReply({
          embeds: [embed],
          components: [row]
        });
      } else if (baseCustomId === JUMP_TO_BUTTON_BASE_CUSTOM_ID) {
        await interaction.showModal(messageBuilder.modal);
      }
    } catch (error) {
      console.log(`Error at button --> ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
