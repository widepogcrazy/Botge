import type { ModalSubmitInteraction } from 'discord.js';

import { TwitchClipMessageBuilder } from '../message-builders/twitch-clip-message-builder.js';
import { EmoteMessageBuilder } from '../message-builders/emote-message-builder.js';
import {
  getBaseCustomIdFromCustomId,
  getMessageBuilderTypeFromCustomId,
  getCounterFromCustomId,
  getCustomId,
  JUMP_TO_MODAL_BASE_CUSTOM_ID,
  JUMP_TO_TEXT_INPUT_BASE_CUSTOM_ID
} from '../message-builders/base.js';

export function modalSubmitHandler(
  twitchClipMessageBuilders: readonly Readonly<TwitchClipMessageBuilder>[],
  emoteMessageBuilders: readonly Readonly<EmoteMessageBuilder>[]
) {
  return async (interaction: ModalSubmitInteraction): Promise<void> => {
    try {
      const { customId } = interaction;

      const messageBuilderType = getMessageBuilderTypeFromCustomId(customId);
      const messageBuilders = (():
        | readonly Readonly<TwitchClipMessageBuilder>[]
        | readonly Readonly<EmoteMessageBuilder>[]
        | undefined => {
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

      const messageBuilder = messageBuilders[messageBuilderIndex];
      const messageBuilderInteraction = messageBuilder.interaction;

      const defer = interaction.deferUpdate();
      const baseCustomId = getBaseCustomIdFromCustomId(customId);
      if (baseCustomId === JUMP_TO_MODAL_BASE_CUSTOM_ID) {
        const jumpToTextIntputValue = interaction.fields
          .getTextInputValue(getCustomId(JUMP_TO_TEXT_INPUT_BASE_CUSTOM_ID, messageBuilderType, messageBuilder.counter))
          .trim();

        if (jumpToTextIntputValue === '') {
          const reply = messageBuilder.random();
          await defer;

          if (reply === undefined) return;
          await messageBuilderInteraction.editReply(reply);
          return;
        }

        const jumpToTextIntputValueNumber = Number(jumpToTextIntputValue);
        if (Number.isNaN(jumpToTextIntputValueNumber)) return;

        const reply = messageBuilder.jumpTo(jumpToTextIntputValueNumber - 1);
        await defer;

        if (reply === undefined) return;
        await messageBuilderInteraction.editReply(reply);
      }
    } catch (error) {
      console.log(`Error at modalSubmit --> ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
