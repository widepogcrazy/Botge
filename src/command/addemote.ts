import { existsSync } from 'fs';
import { ensureFileSync } from 'fs-extra';
import { writeFile, readFile } from 'node:fs/promises';

import type { CommandInteraction } from 'discord.js';
import type { IEmoteMatcher, SevenEmoteNotInSet } from '../emoteMatcher.js';
import type { FileEmoteDb } from '../api/filedb.js';
import type { EmoteMatcher } from '../emoteMatcher.js';

interface RequiredState {
  db: FileEmoteDb;
  em: EmoteMatcher;
  refreshEmotes(): Promise<void>;
}

const SPLITTER = '/';

const regExpSevenEmoteNotInSet = new RegExp(/^https:\/\/7tv\.app\/emotes\/[A-Z0-9]{26}$/);

export function addEmoteHandlerSevenNotInSet(s: RequiredState, emoteEndpoint: string) {
  return async function addEmoteHandlerSevenNotInSetInnerFunction(interaction: CommandInteraction): Promise<boolean> {
    const defer = interaction.deferReply();
    try {
      const text: string = interaction.options.get('text')?.value as string;
      const textSplit: string[] = text.split(SPLITTER);

      const regExpSevenEmoteNotInSetTest: boolean = regExpSevenEmoteNotInSet.test(text);

      if (!regExpSevenEmoteNotInSetTest) {
        return false;
      }

      // TODO: USE REGEX CAPTURE
      const sevenEmoteNotInSetId = textSplit.at(-1);
      const sevenEmoteNotInSetURL = `${emoteEndpoint}${SPLITTER}${sevenEmoteNotInSetId}`;

      const sevenEmoteNotInSet: SevenEmoteNotInSet = (await (
        await fetch(sevenEmoteNotInSetURL)
      ).json()) as SevenEmoteNotInSet;

      if (s.em.matchSingle(sevenEmoteNotInSet.name)) {
        await defer;
        await interaction.editReply('theres already an emote with the same name');
        return false;
      }

      await s.db.add(sevenEmoteNotInSetURL);

      await defer;
      await interaction.editReply(`added emote ${sevenEmoteNotInSet.name}`);
      s.refreshEmotes();
      return true;
    } catch (error) {
      if (error instanceof Error) {
        console.log(`Error at ${addEmoteHandlerSevenNotInSet.name} --> ${error}`);
      } else {
        console.log(error);
      }

      await defer;
      await interaction.editReply('failed to add emote');
      return false;
    }
  };
}
