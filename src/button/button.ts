import type { ButtonInteraction } from 'discord.js';
import {
  getCounterFromButtonCustomIdClip,
  PREVIOUS_BUTTON_CUSTOM_ID_CLIP,
  NEXT_BUTTON_CUSTOM_ID_CLIP,
  FIRST_BUTTON_CUSTOM_ID_CLIP,
  LAST_BUTTON_CUSTOM_ID_CLIP,
  SEND_LINK_BUTTON_CUSTOM_ID_CLIP,
  type TwitchClipMessageBuilder
} from '../twitch-clip-message-builder.js';
import {
  getCounterFromButtonCustomIdEmote,
  PREVIOUS_BUTTON_CUSTOM_ID_EMOTE,
  NEXT_BUTTON_CUSTOM_ID_EMOTE,
  FIRST_BUTTON_CUSTOM_ID_EMOTE,
  LAST_BUTTON_CUSTOM_ID_EMOTE,
  SEND_LINK_BUTTON_CUSTOM_ID_EMOTE,
  type EmoteMessageBuilder
} from '../emote-message-builder.js';

export function buttonHandler(
  twitchClipMessageBuilders: TwitchClipMessageBuilder[],
  emoteMessageBuilders: EmoteMessageBuilder[]
) {
  return async (interaction: ButtonInteraction): Promise<void> => {
    try {
      const { customId } = interaction;

      if (customId.includes('Clip')) {
        const twitchClipMessageBuilderIndex = twitchClipMessageBuilders.findIndex(
          (twitchClipMessageBuilder_: Readonly<TwitchClipMessageBuilder>) =>
            twitchClipMessageBuilder_.counter === getCounterFromButtonCustomIdClip(customId)
        );
        if (twitchClipMessageBuilderIndex === -1) return;
        const twitchClipMessageBuilder = twitchClipMessageBuilders[twitchClipMessageBuilderIndex];

        const twitchClipInteraction = twitchClipMessageBuilder.interaction;
        const { row, ephemeral } = twitchClipMessageBuilder;

        const defer = interaction.deferUpdate();
        if (customId.includes(PREVIOUS_BUTTON_CUSTOM_ID_CLIP)) {
          await twitchClipInteraction.editReply({
            embeds: [twitchClipMessageBuilder.previous()],
            components: [row]
          });
        } else if (customId.includes(NEXT_BUTTON_CUSTOM_ID_CLIP)) {
          await defer;
          await twitchClipInteraction.editReply({
            embeds: [twitchClipMessageBuilder.next()],
            components: [row]
          });
        } else if (customId.includes(FIRST_BUTTON_CUSTOM_ID_CLIP)) {
          await defer;
          await twitchClipInteraction.editReply({
            embeds: [twitchClipMessageBuilder.first()],
            components: [row]
          });
        } else if (customId.includes(LAST_BUTTON_CUSTOM_ID_CLIP)) {
          await defer;
          await twitchClipInteraction.editReply({
            embeds: [twitchClipMessageBuilder.last()],
            components: [row]
          });
        } else if (customId.includes(SEND_LINK_BUTTON_CUSTOM_ID_CLIP)) {
          //only allow original clip command user to send not ephemeral link.
          await defer;
          if (interaction.user.id === twitchClipInteraction.user.id && ephemeral) {
            await interaction.followUp({
              content: twitchClipMessageBuilder.currentUrl()
            });
          } else {
            await interaction.followUp({
              content: twitchClipMessageBuilder.currentUrl(),
              flags: 'Ephemeral'
            });
          }
        } else {
          console.log(`unknown button click clip: ${customId}`);
        }
      } else if (customId.includes('Emote')) {
        const emoteMessageBuilderIndex = emoteMessageBuilders.findIndex(
          (emoteMessageBuilder_: Readonly<EmoteMessageBuilder>) =>
            emoteMessageBuilder_.counter === getCounterFromButtonCustomIdEmote(customId)
        );
        if (emoteMessageBuilderIndex === -1) return;
        const emoteMessageBuilder = emoteMessageBuilders[emoteMessageBuilderIndex];

        const emoteInteraction = emoteMessageBuilder.interaction;
        const { row, ephemeral } = emoteMessageBuilder;

        const defer = interaction.deferUpdate();
        if (customId.includes(PREVIOUS_BUTTON_CUSTOM_ID_EMOTE)) {
          await emoteInteraction.editReply({
            embeds: [emoteMessageBuilder.previous()],
            components: [row]
          });
        } else if (customId.includes(NEXT_BUTTON_CUSTOM_ID_EMOTE)) {
          await defer;
          await emoteInteraction.editReply({
            embeds: [emoteMessageBuilder.next()],
            components: [row]
          });
        } else if (customId.includes(FIRST_BUTTON_CUSTOM_ID_EMOTE)) {
          await defer;
          await emoteInteraction.editReply({
            embeds: [emoteMessageBuilder.first()],
            components: [row]
          });
        } else if (customId.includes(LAST_BUTTON_CUSTOM_ID_EMOTE)) {
          await defer;
          await emoteInteraction.editReply({
            embeds: [emoteMessageBuilder.last()],
            components: [row]
          });
        } else if (customId.includes(SEND_LINK_BUTTON_CUSTOM_ID_EMOTE)) {
          //only allow original clip command user to send not ephemeral link.
          await defer;
          if (interaction.user.id === emoteInteraction.user.id && ephemeral) {
            await interaction.followUp({
              content: emoteMessageBuilder.currentUrl()
            });
          } else {
            await interaction.followUp({
              content: emoteMessageBuilder.currentUrl(),
              flags: 'Ephemeral'
            });
          }
        } else {
          console.log(`unknown button click emote: ${customId}`);
        }
      }
    } catch (error) {
      console.log(`Error at button --> ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
