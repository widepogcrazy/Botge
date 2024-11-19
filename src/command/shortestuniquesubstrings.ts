import type { AssetInfo, IEmoteMatcher } from '../emoteMatcher.js';
import type { CommandInteraction } from 'discord.js';

function getAllSubstrings(str: string): string[] {
  const result: string[] = [];

  for (let i = 0; i < str.length; i++) {
    for (let j: number = i + 1; j < str.length + 1; j++) {
      result.push(str.slice(i, j));
    }
  }

  return result;
}

function getShortestUniqueSubstrings(em: IEmoteMatcher, text: string): [string | undefined, string[] | undefined] {
  try {
    const matchSingle_: AssetInfo | undefined = em.matchSingle(text);
    if (!matchSingle_) {
      return [undefined, undefined];
    }
    const original: string = matchSingle_.name;

    const allSubstrings: string[] = getAllSubstrings(original);
    const allSubstringUniqueness: (boolean | undefined)[] = allSubstrings.map((substring) =>
      em.matchSingleUnique(substring, original)
    );

    const uniqueSubstrings: string[] = allSubstrings.filter((s, i) => {
      if (allSubstringUniqueness[i] !== undefined) {
        return s;
      }
    });

    const shortestUniqueSubstringLength: number | undefined =
      uniqueSubstrings.length !== 0
        ? uniqueSubstrings.reduce((a, b) => (a.length < b.length ? a : b)).length
        : undefined;
    const shortestUniqueSubstrings: string[] | undefined =
      shortestUniqueSubstringLength !== undefined
        ? uniqueSubstrings.filter((s) => s.length === shortestUniqueSubstringLength)
        : undefined;

    return [original, shortestUniqueSubstrings];
  } catch (error) {
    if (error instanceof Error) console.error(`Error getting unique substring(s): ${error}`);
    return [undefined, undefined];
  }
}

export function shortestuniquesubstringsHandler(em: IEmoteMatcher) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const text: string[] = String(interaction.options.get('emotes')?.value).split(/\s+/);
      const getShortestUniqueSubstrings_: [string | undefined, string[] | undefined][] = text.map((t) =>
        getShortestUniqueSubstrings(em, t)
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
      if (error instanceof Error) console.log(`Error at shortestuniquesubstrings --> ${error}`);

      await defer;
      await interaction.editReply('failed to provide shortest unique substrings.');
      return;
    }
  };
}
