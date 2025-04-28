import type { ButtonInteraction } from 'discord.js';
import {
  getCounterFromButtonCustomId,
  PREVIOUS_BUTTON_CUSTOM_ID,
  NEXT_BUTTON_CUSTOM_ID,
  FIRST_BUTTON_CUSTOM_ID,
  LAST_BUTTON_CUSTOM_ID,
  SEND_CLIP_LINK_BUTTON_CUSTOM_ID,
  type TwitchClipMessageBuilder
} from '../twitch-clip-message-builder.js';

export function buttonHandler(twitchClipMessageBuilders: TwitchClipMessageBuilder[]) {
  return async (interaction: ButtonInteraction): Promise<void> => {
    try {
      const twitchClipMessageBuilderIndex = twitchClipMessageBuilders.findIndex(
        (twitchClipMessageBuilder_) =>
          twitchClipMessageBuilder_.counter === getCounterFromButtonCustomId(interaction.customId)
      );
      if (twitchClipMessageBuilderIndex === -1) return;
      const twitchClipMessageBuilder = twitchClipMessageBuilders[twitchClipMessageBuilderIndex];

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
        // only allow original sender to click buttons.
        if (interaction.user.id !== twitchClipInteraction.user.id) return;

        await defer;
        await interaction.followUp({
          content: twitchClipMessageBuilder.currentUrl()
        });

        await twitchClipInteraction.deleteReply();
        twitchClipMessageBuilders.splice(twitchClipMessageBuilderIndex, 1);
      } else {
        console.log(`unknown button click: ${customId}`);
      }
    } catch (error) {
      console.log(`Error at button --> ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
