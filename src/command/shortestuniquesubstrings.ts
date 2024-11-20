import type { CommandInteraction } from 'discord.js';

import type { AssetInfo } from '../types.js';
import type { EmoteMatcher } from '../emoteMatcher.js';

function getAllSubstrings(str: string): readonly string[] {
  const result: string[] = [];

  for (let i = 0; i < str.length; i++) {
    for (let j: number = i + 1; j < str.length + 1; j++) {
      result.push(str.slice(i, j));
    }
  }

  return result;
}

function getShortestUniqueSubstrings(
  em: Readonly<EmoteMatcher>,
  text: string
): [string | undefined, readonly string[] | undefined] {
  const matchSingle_: AssetInfo | undefined = em.matchSingle(text);
  if (!matchSingle_) {
    return [undefined, undefined];
  }
  const original: string = matchSingle_.name;

  const allSubstrings: readonly string[] = getAllSubstrings(original);
  const allSubstringUniqueness: readonly (boolean | undefined)[] = allSubstrings.map((substring) =>
    em.matchSingleUnique(substring, original)
  );

  const uniqueSubstrings: readonly string[] = allSubstrings
    .map((s, i) => {
      if (allSubstringUniqueness[i] !== undefined) return s;
      return undefined;
    })
    .filter((s) => s !== undefined);

  const shortestUniqueSubstringLength: number | undefined =
    uniqueSubstrings.length !== 0 ? uniqueSubstrings.reduce((a, b) => (a.length < b.length ? a : b)).length : undefined;

  const shortestUniqueSubstrings: readonly string[] | undefined =
    shortestUniqueSubstringLength !== undefined
      ? uniqueSubstrings.filter((s) => s.length === shortestUniqueSubstringLength)
      : undefined;

  return [original, shortestUniqueSubstrings];
}

export function shortestuniquesubstringsHandler(em: Readonly<EmoteMatcher>) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const text: readonly string[] = String(interaction.options.get('emotes')?.value).split(/\s+/);
      const getShortestUniqueSubstrings_: readonly [string | undefined, readonly string[] | undefined][] = text.map(
        (t) => getShortestUniqueSubstrings(em, t)
      );

      let message = '';
      getShortestUniqueSubstrings_.forEach((i: readonly [string | undefined, readonly string[] | undefined], j) => {
        const original: string | undefined = i[0];
        const shortestUniqueSubstrings: readonly string[] | undefined = i[1];
        if (original === undefined) {
          message += `Could not find emote '${text[j]}'.\n`;
          return;
        }

        if (shortestUniqueSubstrings) {
          if (shortestUniqueSubstrings.length === 1) {
            message += `${original}: ${shortestUniqueSubstrings[0]}\n`;
          } else {
            message += `${original}: ${shortestUniqueSubstrings.join(', ')}\n`;
          }
        } else {
          message += `${original}: -\n`;
        }
      });

      message = message.trim();

      await defer;
      await interaction.editReply(message);
      return;
    } catch (error) {
      console.log(`Error at shortestuniquesubstrings --> ${error instanceof Error ? error : 'error'}`);

      await defer;
      await interaction.editReply('failed to provide shortest unique substrings.');
      return;
    }
  };
}
