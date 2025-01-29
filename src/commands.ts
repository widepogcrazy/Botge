import { SlashCommandBuilder, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';

import type {
  ReadonlySlashCommandOptionsOnlyBuilder,
  ReadonlySlashCommandStringOption,
  ReadonlySlashCommandBooleanOption,
  ReadonlySlashCommandAttachmentOption,
  ReadonlySlashCommandIntegerOption
} from './types.js';

const emote: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('emote')
  .setDescription('replies with a gif/png. precise lower/upper case not needed for uniquely named emotes')
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option
      .setName('name')
      .setDescription('the emote(s) name(s). works even if this input is a substring of the emotes original name')
      .setRequired(true)
  )
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('size').setDescription('the emotes size(not required): 1, 2, 3 or 4')
  )
  .addBooleanOption((option: ReadonlySlashCommandBooleanOption) =>
    option.setName('fullsize').setDescription('whether to use the full size of the input or not')
  )
  .addBooleanOption((option: ReadonlySlashCommandBooleanOption) =>
    option.setName('stretch').setDescription('whether to stretch the zero-width emotes instead of centering them')
  );

const clip: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('clip')
  .setDescription('replies with clip url, if found.')
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('text').setDescription('the clips name.').setRequired(true)
  );

const addemote: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('addemote')
  .setDescription('adds an emote.')
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('url').setDescription('the 7tv/old.7tv link to the emote.').setRequired(true)
  )
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('alias').setDescription('an alias for the emote.')
  );

const chatgpt: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('chatgpt')
  .setDescription('sends text to chatgpt and chatgpt answers.')
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('text').setDescription('the text to send').setRequired(true)
  );

const translate: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('translate')
  .setDescription('detects language of text, then translates into english.')
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('text').setDescription('the text to translate').setRequired(true)
  );

const shortestuniquesubstrings: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('shortestuniquesubstrings')
  .setDescription('outputs the shortest unique substring(s) for the emote(s)')
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('emotes').setDescription('emote or emotes separated by space').setRequired(true)
  );

const transient: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('transient')
  .setDescription('Sends a message for you, and delete it after a certain time')
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('text').setDescription('text/link to send').setRequired(false)
  )
  .addAttachmentOption((option: ReadonlySlashCommandAttachmentOption) =>
    option.setName('file').setDescription('file to send').setRequired(false)
  )
  .addIntegerOption((option: ReadonlySlashCommandIntegerOption) =>
    option.setName('duration').setDescription('duration in seconds before deletion, default: 3').setRequired(false)
  );

const help: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('help')
  .setDescription('links an image with helpful directions to adding the bot.');

export const commands: readonly Readonly<RESTPostAPIChatInputApplicationCommandsJSONBody>[] = [
  emote.toJSON(),
  clip.toJSON(),
  addemote.toJSON(),
  chatgpt.toJSON(),
  translate.toJSON(),
  shortestuniquesubstrings.toJSON(),
  transient.toJSON(),
  help.toJSON()
];
