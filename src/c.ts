import dotenv from 'dotenv';
import process from 'node:process';

import { REST, Routes } from 'discord.js';

dotenv.config();

const APP_ID: string = process.env.APP_ID;
const DISCORD_TOKEN: string = process.env.DISCORD_TOKEN;

const commands = [
  {
    name: 'emote',
    description: 'replies with emote gif/webp. precise lower/upper case not needed for uniquely named emotes.',
    options: [
      {
        type: 3,
        name: 'name',
        description: 'the emote(s) name(s). works even if this input is a substring of the emotes original name.',
        required: true
      }
    ]
  },
  {
    name: 'chatgpt',
    description: 'sends text to chatgpt and chatgpt answers.',
    options: [
      {
        type: 3,
        name: 'text',
        description: 'the text to send',
        required: true
      }
    ]
  },
  {
    name: 'translate',
    description: 'detects language of text, then translates into english.',
    options: [
      {
        type: 3,
        name: 'text',
        description: 'the text to translate',
        required: true
      }
    ]
  },
  {
    name: 'shortestuniquesubstrings',
    description: 'outputs the shortest unique substring(s) for the emote(s)',
    options: [
      {
        type: 3,
        name: 'emotes',
        description: 'emote or emotes separated by space',
        required: true
      }
    ]
  },
  {
    name: 'help',
    description: 'links an image with helpful directions to adding the bot.'
  }
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

try {
  console.log('Commands starting.');

  await rest.put(Routes.applicationCommands(APP_ID), { body: commands });

  console.log('Commands done.');
} catch (error) {
  console.error(error);
}
