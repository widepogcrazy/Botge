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
  .setDescription('replies with a gif/png')
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('emote').setDescription("the emote' name").setRequired(true).setAutocomplete(true)
  )
  .addIntegerOption((option: ReadonlySlashCommandIntegerOption) =>
    option.setName('size').setDescription("the emote's size").setAutocomplete(true)
  );

const emotes: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('emotes')
  .setDescription('replies with a webp/png')
  .setDescription('emote command for combined emote usage')
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option
      .setName('emotes')
      .setDescription('the emotes names. works even if this input is a substring of the emotes original name')
      .setRequired(true)
  )
  .addBooleanOption((option: ReadonlySlashCommandBooleanOption) =>
    option.setName('fullsize').setDescription('whether to use the full size of the input or not')
  )
  .addBooleanOption((option: ReadonlySlashCommandBooleanOption) =>
    option.setName('stretch').setDescription('whether to stretch the zero-width emotes instead of centering them')
  );

const emotelist: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('emotelist')
  .setDescription('replies with a webp/png')
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('query').setDescription('the query').setAutocomplete(true)
  );

const clip: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('clip')
  .setDescription('replies with clip url, if found.')
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('title').setDescription('the clips name').setAutocomplete(true)
  )
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('clipper').setDescription('the username of the clipper').setAutocomplete(true)
  )
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('game').setDescription("the game's name").setAutocomplete(true)
  )
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option
      .setName('sortby')
      .setDescription("sort by this. by default it's sorted by views")
      .addChoices({ name: 'Created', value: 'created' })
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
    option
      .setName('emotes')
      .setDescription('emote or emotes separated by space')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addBooleanOption((option: ReadonlySlashCommandBooleanOption) =>
    option.setName('ephemeral').setDescription('whether to output the result so only you can see it')
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

const findTheEmoji: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('findtheemoji')
  .setDescription('generates a find the emoji grid, where each grid element is in a spoiler tag.')
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option
      .setName('emoji')
      .setDescription('the emoji to find, by default its a random server emoji.')
      .setRequired(false)
  )
  .addIntegerOption((option: ReadonlySlashCommandIntegerOption) =>
    option.setName('size').setDescription('the size of the grid, by default its 3x3.').setRequired(false)
  );

const pingMe: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('pingme')
  .setDescription('pings you after the specified time. the hours and minutes get added together')
  .addIntegerOption((option: ReadonlySlashCommandIntegerOption) =>
    option.setName('hours').setDescription('the hours to wait before pinging you').setRequired(false)
  )
  .addIntegerOption((option: ReadonlySlashCommandIntegerOption) =>
    option.setName('minutes').setDescription('the minutes to wait before pinging you').setRequired(false)
  )
  .addStringOption((option: ReadonlySlashCommandStringOption) =>
    option.setName('message').setDescription('the message to attach to the ping').setRequired(false)
  );

const poe2: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('poe2')
  .setDescription('Get poe2 steam stats');

/*
const assignEmoteSets: ReadonlySlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
  .setName('assignemotesets')
  .setDescription(
    'outputs a modal, where you can input emote set urls to assign to the server(only for administrators)'
  );
*/

export const commands: readonly Readonly<RESTPostAPIChatInputApplicationCommandsJSONBody>[] = [
  emote.toJSON(),
  emotes.toJSON(),
  emotelist.toJSON(),
  clip.toJSON(),
  addemote.toJSON(),
  chatgpt.toJSON(),
  translate.toJSON(),
  shortestuniquesubstrings.toJSON(),
  transient.toJSON(),
  findTheEmoji.toJSON(),
  pingMe.toJSON(),
  poe2.toJSON()
];
