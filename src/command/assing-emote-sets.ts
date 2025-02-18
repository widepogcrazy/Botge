import {
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalBuilder,
  type ModalActionRowComponentBuilder,
  type CommandInteraction,
  type ModalSubmitInteraction
} from 'discord.js';

const SEVENTV_INPUT = new TextInputBuilder()
  .setCustomId('sevenTVInput')
  .setLabel('SevenTV Emote Set Link')
  .setStyle(TextInputStyle.Short)
  .setRequired(false);
const BTTV_INPUT = new TextInputBuilder()
  .setCustomId('bttvInput')
  .setLabel('BTTV Emote Set Link')
  .setStyle(TextInputStyle.Short)
  .setRequired(false);
const FFZ_INPUT = new TextInputBuilder()
  .setCustomId('ffzInput')
  .setLabel('SevenTV Emote Set Link')
  .setStyle(TextInputStyle.Short)
  .setRequired(false);

const SEVENTV_ACTION_ROW = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(SEVENTV_INPUT);
const BTTV_ACTION_ROW = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(BTTV_INPUT);
const FFZ_ACTION_ROW = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(FFZ_INPUT);

const MODAL = new ModalBuilder()
  .setCustomId('assign-emote-sets')
  .setTitle('Assign Emote Sets')
  .addComponents(SEVENTV_ACTION_ROW, BTTV_ACTION_ROW, FFZ_ACTION_ROW);

const MODAL_SUBMIT_FILTER = (modalInteraction_: ModalSubmitInteraction): boolean =>
  modalInteraction_.customId === MODAL.data.custom_id;

export function assignEmoteSetsHandler() {
  return async (interaction: CommandInteraction): Promise<void> => {
    try {
      await interaction.showModal(MODAL);

      const modalInteraction = await interaction.awaitModalSubmit({ filter: MODAL_SUBMIT_FILTER, time: 60000 });
      await modalInteraction.reply('Modal submitted');
    } catch (error) {
      console.log(`Error at assignEmoteSets --> ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
