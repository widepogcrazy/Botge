import { existsSync } from 'fs';
import * as fs from 'fs-extra';
import { writeFile, readFile } from 'node:fs/promises';

import { CommandInteraction } from 'discord.js';
import { EmoteMatcher, SevenEmoteNotInSet } from '../emoteMatcher.js';

const SPLITTER = '/';
const SPLITTER2 = '.';
const REPLACER: null = null;
const INDENTATION: number = 2;

export async function readEmotes(filepath: string): Promise<string[] | undefined> {
  try {
    if (!existsSync(filepath)) return undefined;

    const emotes = (await JSON.parse((await readFile(filepath)).toString())) as string[];

    return emotes;
  } catch (error) {
    console.log(`Error at readEmoteHandler --> ${error}`);
    return undefined;
  }
}

function addEmote(filepath: string, emote: string) {
  return async (): Promise<boolean> => {
    try {
      const exists: boolean = existsSync(filepath);
      if (!exists) fs.ensureFileSync(filepath);

      const emotes: string[] = exists ? await readEmotes(filepath) : [];
      if (emotes.includes(emote)) return false;

      emotes.push(emote);
      const emotesJSON: string = JSON.stringify(emotes, REPLACER, INDENTATION);
      await writeFile(filepath, emotesJSON);

      return true;
    } catch (error) {
      console.log(`Error at addemotehandler --> ${error}`);
      return false;
    }
  };
}

export function addEmoteHandlerSevenNotInSet(em: EmoteMatcher, endpoint: string, filepath: string) {
  return async (interaction: CommandInteraction): Promise<boolean> => {
    const defer = interaction.deferReply();
    try {
      const text: string = interaction.options.get('text').value as string;

      const textSplit: string[] = text.split(SPLITTER);
      const endpointSplit: string[] = endpoint.split(SPLITTER);

      const textPlatform: string = textSplit.at(2).split(SPLITTER2).at(0);
      const endpointPlatform: string = endpointSplit.at(2).split(SPLITTER2).at(0);

      if (textPlatform !== endpointPlatform) return false;

      const emoteId: string = textSplit.at(-1);
      const emote: string = `${endpoint}${SPLITTER}${emoteId}`;

      const emoteJSON: SevenEmoteNotInSet = (await (await fetch(emote)).json()) as SevenEmoteNotInSet;
      if (em.matchSingle(emoteJSON.name)) {
        await defer;
        await interaction.editReply('theres already an emote with the same name');
        return false;
      }

      const addemote = await addEmote(filepath, emote)();

      await defer;
      if (addemote) {
        await interaction.editReply(`added emote ${emoteJSON.name}`);
        return true;
      }

      await interaction.editReply('failed to add emote');
      return false;
    } catch (error) {
      console.log(`Error at addEmoteHandlerSevenNotInSet --> ${error}`);
      await defer;
      await interaction.editReply('failed to add emote');
      return false;
    }
  };
}
