import {
  ActionRowBuilder,
  ButtonStyle,
  ButtonBuilder,
  MessageFlags,
  type CommandInteraction,
  type MessageActionRowComponentBuilder,
  type GuildMember
} from 'discord.js';

import { booleanToPermittedOrNotPermitted } from '../utils/boolean-to-string.js';
import type { Guild } from '../guild.js';

export const SELECT_SETTINGS_PERMITTED_ROLES_BUTTON_CUSTOM_ID = 'selectSettingsPermittedRolesButton';
export const SELECT_ADD_EMOTE_PERMITTED_ROLES_BUTTON_CUSTOM_ID = 'selectAddEmotePermittedRolesButton';
export const TOGGLE_ADD_EMOTE_PERMIT_NO_ROLE_BUTTON_CUSTOM_ID = 'toggleAddEmotePermitNoRoleButton';
export const SHOW_ADDED_EMOTE_DELETION_MENU_BUTTON_CUSTOM_ID = 'showAddedEmoteDeletionMenuButton';

export function settingsHandler(guild: Readonly<Guild>) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const { member } = interaction;
      const interactionGuild = interaction.guild;
      if (interactionGuild === null || member === null) return;

      const member_ = member as GuildMember;
      const memberRolesCache = member_.roles.cache;
      const memberRoles = [...memberRolesCache.values()];
      const owner = member_.user.id === interactionGuild.ownerId;
      const administrator = memberRoles.some((memberRole) => memberRole.permissions.has('Administrator'));

      const permitted = ((): boolean => {
        if (owner || administrator) return true;

        const { settingsPermittedRoleIds } = guild;
        const memberRoleIds = [...memberRolesCache.keys()];

        if (settingsPermittedRoleIds === null) return false;
        const intersection: readonly string[] = settingsPermittedRoleIds.filter((settingsPermittedRoleId) =>
          memberRoleIds.includes(settingsPermittedRoleId)
        );
        return intersection.length !== 0;
      })();
      if (!permitted) {
        await defer;
        await interaction.editReply('You do not have the necessary permissions to use this command.');
        return;
      }

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>();
      if (owner || administrator) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(SELECT_SETTINGS_PERMITTED_ROLES_BUTTON_CUSTOM_ID)
            .setLabel('Select Settings Permitted Roles')
            .setStyle(ButtonStyle.Success)
        );
      }

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(SELECT_ADD_EMOTE_PERMITTED_ROLES_BUTTON_CUSTOM_ID)
          .setLabel('Select Add Emote Permitted Roles')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(TOGGLE_ADD_EMOTE_PERMIT_NO_ROLE_BUTTON_CUSTOM_ID)
          .setLabel(
            `Toggle Add Emote Permit No Rule (Currently: ${booleanToPermittedOrNotPermitted(guild.toggleAddEmotePermitNoRule)})`
          )
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(SHOW_ADDED_EMOTE_DELETION_MENU_BUTTON_CUSTOM_ID)
          .setLabel('Show the added emote deletion menu')
          .setStyle(ButtonStyle.Danger)
      );

      await defer;
      await interaction.editReply({ components: [row] });
    } catch (error) {
      console.log(`Error at settings --> ${error instanceof Error ? error.message : String(error)}`);

      await defer;
      await interaction.editReply('Failed to output settings.');
    }
  };
}
