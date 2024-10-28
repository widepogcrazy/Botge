import dotenv from 'dotenv';
dotenv.config();
import { REST, Routes } from 'discord.js';

const commands = [
  {
    name: 'emote',
    description: 'replies with emote gif/webp. precise lower/upper case not needed for uniquely named emotes.',
    options: [
      {
        type: 3,
        name: 'name',
        description: 'the emotes name. works even if this input is a substring of the emotes original name.',
        required: true,
      },
      {
        type: 3,
        name: 'size',
        description: 'the emotes size( not required ). 1,2,3 or 4.',
      },
    ],
  },
  {
    name: 'chatgpt',
    description: 'sends text to chatgpt and chatgpt answers.',
    options: [
      {
        type: 3,
        name: 'text',
        description: 'the text to send',
        required: true,
      },
    ],
  },
  {
    name: 'translate',
    description: 'detects language of text, then translates into english.',
    options: [
      {
        type: 3,
        name: 'text',
        description: 'the text to translate',
        required: true,
      },
    ],
  },
  {
    name: 'combine',
    description: 'combine a list of emotes into a single image',
    options: [
      {
        type: 3,
        name: 'emotes',
        description: 'list of emotes separated by space',
        required: true,
      },
    ],
  },
  {
    name: 'help',
    description: 'links an image with helpful directions to adding the bot.',
  },
];

const rest = new REST({ version: '10' }).setToken( process.env.DISCORD_TOKEN );

try {
  console.log('Commands starting.');

  await rest.put(Routes.applicationCommands( process.env.APP_ID ), { body: commands });

  console.log('Commands done.');
} catch (error) {
  console.error(error);
}