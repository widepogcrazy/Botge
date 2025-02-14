import dotenv from 'dotenv';
import process from 'node:process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { REST, Routes } from 'discord.js';

import { commands } from './commands.js';

dotenv.config();

const { APP_ID, DISCORD_TOKEN } = process.env;

export async function updateCommands(lockFilePath: string): Promise<void> {
  const currentCommandsJson: string = ((): string => {
    if (!existsSync(lockFilePath)) return '';
    return readFileSync(lockFilePath, 'utf8');
  })();
  const newCommandsJson = JSON.stringify(commands);

  if (currentCommandsJson === newCommandsJson) {
    console.log('No commands change detected.');
    return;
  }

  console.log('Discord commands updating.');

  if (DISCORD_TOKEN === undefined || APP_ID === undefined) {
    console.log('DISCORD_TOKEN and APP_ID required.');
    return;
  }

  const rest: Readonly<REST> = new REST().setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(APP_ID), { body: commands });
  writeFileSync(lockFilePath, newCommandsJson, { encoding: 'utf8', flag: 'w+' });
  console.log('Discord commands updated.');
}
