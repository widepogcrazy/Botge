import { existsSync } from 'fs';
import { ensureFileSync } from 'fs-extra';
import { writeFile, readFile } from 'node:fs/promises';

import type { CommandInteraction } from 'discord.js';
import type { IEmoteMatcher, SevenEmoteNotInSet } from '../emoteMatcher.js';

const SPLITTER = '/';
const REPLACER = null;
const INDENTATION = 2;

const regExpSevenEmoteNotInSet = new RegExp('/^https://7tv.app/emotes/[A-Z0-9]{26}$/');

export async function readEmotes(filepath: string): Promise<string[] | undefined> {
  try {
    const exists = existsSync(filepath);
    if (!exists) return undefined;

    const emotes = (await JSON.parse((await readFile(filepath)).toString())) as string[];

    return emotes;
  } catch (error) {
    if (error instanceof Error) console.log(`Error at readEmoteHandler --> ${error}`);
    return undefined;
  }
}

function addEmote(filepath: string, emote: string) {
  return async (): Promise<boolean> => {
    try {
      const exists: boolean = existsSync(filepath);
      if (!exists) ensureFileSync(filepath);

      const defaultEmotes: [] = [];
      let emotes: string[] = defaultEmotes;
      if (exists) {
        emotes = (await readEmotes(filepath)) ?? defaultEmotes;
        if (emotes.includes(emote)) {
          return false;
        }
      }

      emotes.push(emote);
      const emotesJSON: string = JSON.stringify(emotes, REPLACER, INDENTATION);
      await writeFile(filepath, emotesJSON);

      return true;
    } catch (error) {
      if (error instanceof Error) console.log(`Error at addemotehandler --> ${error}`);
      return false;
    }
  };
}

export function addEmoteHandlerSevenNotInSet(em: IEmoteMatcher, emoteEndpoint: string, fileEndpoint: string) {
  return async function addEmoteHandlerSevenNotInSetInnerFunction(interaction: CommandInteraction): Promise<boolean> {
    const defer = interaction.deferReply();
    try {
      const text: string = interaction.options.get('text')?.value as string;
      const textSplit: string[] = text.split(SPLITTER);

      const regExpSevenEmoteNotInSetTest: boolean = regExpSevenEmoteNotInSet.test(text);

      if (!regExpSevenEmoteNotInSetTest) {
        return false;
      }

      const sevenEmoteNotInSetId = textSplit.at(-1);
      const sevenEmoteNotInSetURL = `${emoteEndpoint}${SPLITTER}${sevenEmoteNotInSetId}`;

      const sevenEmoteNotInSet: SevenEmoteNotInSet = (await (
        await fetch(sevenEmoteNotInSetURL)
      ).json()) as SevenEmoteNotInSet;

      if (em.matchSingle(sevenEmoteNotInSet.name)) {
        await defer;
        await interaction.editReply('theres already an emote with the same name');
        return false;
      }

      const addEmote_: boolean = await addEmote(fileEndpoint, sevenEmoteNotInSetURL)();

      await defer;
      if (addEmote_) {
        await interaction.editReply(`added emote ${sevenEmoteNotInSet.name}`);
        return true;
      }

      await interaction.editReply('failed to add emote');
      return false;
    } catch (error) {
      if (error instanceof Error) console.log(`Error at ${addEmoteHandlerSevenNotInSet.name} --> ${error}`);

      await defer;
      await interaction.editReply('failed to add emote');
      return false;
    }
  };
}
