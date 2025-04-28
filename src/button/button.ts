import type { ButtonInteraction } from 'discord.js';
import {
  getCounterFromButtonCustomId,
  type TwitchClipMessageBuilder,
  PREVIOUS_BUTTON_CUSTOM_ID,
  NEXT_BUTTON_CUSTOM_ID,
  FIRST_BUTTON_CUSTOM_ID,
  LAST_BUTTON_CUSTOM_ID,
  SEND_CLIP_LINK_BUTTON_CUSTOM_ID
} from '../twitch-clip-message-builder.js';

export function buttonHandler(twitchClipMessageBuilders: readonly TwitchClipMessageBuilder[]) {
  return async (interaction: ButtonInteraction): Promise<void> => {
    try {
      if (interaction.message.interactionMetadata!.user.id !== interaction.user.id) {
        // only allow original sender to click buttons.
        return;
      }
      const twitchClipMessageBuilder = twitchClipMessageBuilders.find(
        (twitchClipMessageBuilder_) =>
          twitchClipMessageBuilder_.counter === getCounterFromButtonCustomId(interaction.customId)
      );
      if (twitchClipMessageBuilder === undefined) return;

      const { customId } = interaction;
      const twitchClipInteraction = twitchClipMessageBuilder.interaction;
      const { row } = twitchClipMessageBuilder;

      const defer = interaction.deferUpdate();
      if (customId.includes(PREVIOUS_BUTTON_CUSTOM_ID)) {
        await twitchClipInteraction.editReply({
          embeds: [twitchClipMessageBuilder.previous()],
          components: [row]
        });
      } else if (customId.includes(NEXT_BUTTON_CUSTOM_ID)) {
        await defer;
        await twitchClipInteraction.editReply({
          embeds: [twitchClipMessageBuilder.next()],
          components: [row]
        });
      } else if (customId.includes(FIRST_BUTTON_CUSTOM_ID)) {
        await defer;
        await twitchClipInteraction.editReply({
          embeds: [twitchClipMessageBuilder.first()],
          components: [row]
        });
      } else if (customId.includes(LAST_BUTTON_CUSTOM_ID)) {
        await defer;
        await twitchClipInteraction.editReply({
          embeds: [twitchClipMessageBuilder.last()],
          components: [row]
        });
      } else if (interaction.customId.includes(SEND_CLIP_LINK_BUTTON_CUSTOM_ID)) {
        await defer;
        await interaction.followUp({
          content: twitchClipMessageBuilder.currentUrl()
        });
        await interaction.message.delete();
      } else {
        console.log(`unknown button click: ${customId}`);
      }
    } catch (error) {
      console.log(`Error at button --> ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
