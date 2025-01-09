import dotenv from 'dotenv';
import process from 'node:process';

import { REST, Routes } from 'discord.js';

import { commands } from './commands.js';

dotenv.config();

const APP_ID: string | undefined = process.env.APP_ID;
const DISCORD_TOKEN: string | undefined = process.env.DISCORD_TOKEN;

try {
  console.log('Discord commands updating.');

  if (DISCORD_TOKEN === undefined || APP_ID === undefined) {
    console.log('DISCORD_TOKEN and APP_ID required.');
  }

  const rest: Readonly<REST> = new REST({ version: '10' }).setToken(DISCORD_TOKEN!);
  await rest.put(Routes.applicationCommands(APP_ID!), { body: commands });
  console.log('Discord commands updated.');
} catch (error: unknown) {
  console.error(`Error updating discord commands: ${error instanceof Error ? error : 'error'}`);
}
