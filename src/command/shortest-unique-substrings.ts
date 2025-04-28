import type { CommandInteraction } from 'discord.js';

import type { EmoteMatcher } from '../emote-matcher.js';

function getAllSubstrings(str: string): readonly string[] {
  const result: string[] = [];

  for (let i = 0; i < str.length; i++) {
    for (let j = i + 1; j < str.length + 1; j++) {
      result.push(str.slice(i, j));
    }
  }

  return result;
}

function getShortestUniqueSubstrings(
  em: Readonly<EmoteMatcher>,
  text: string
): readonly [string | undefined, readonly string[] | undefined] {
  const matchSingle_ = em.matchSingle(text);
  if (!matchSingle_) return [undefined, undefined];
  const original = matchSingle_.name;

  const allSubstrings: readonly string[] = getAllSubstrings(original);
  const allSubstringUniqueness: readonly (boolean | undefined)[] = allSubstrings.map((substring) =>
    em.matchSingleUnique(substring, original)
  );

  const uniqueSubstrings: readonly string[] = allSubstrings
    .map((s, i) => {
      if (allSubstringUniqueness[i] !== undefined && allSubstringUniqueness[i]) return s;
      return undefined;
    })
    .filter((s) => s !== undefined);

  const shortestUniqueSubstringLength =
    uniqueSubstrings.length !== 0 ? uniqueSubstrings.reduce((a, b) => (a.length < b.length ? a : b)).length : undefined;

  const shortestUniqueSubstrings: readonly string[] | undefined =
    shortestUniqueSubstringLength !== undefined
      ? uniqueSubstrings.filter((s) => s.length === shortestUniqueSubstringLength)
      : undefined;

  return [original, shortestUniqueSubstrings];
}

export function shortestuniquesubstringsHandler(em: Readonly<EmoteMatcher>) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const ephemeral = Boolean(interaction.options.get('ephemeral')?.value);
    const defer = ephemeral ? interaction.deferReply({ flags: 'Ephemeral' }) : interaction.deferReply();
    try {
      const text: readonly string[] = String(interaction.options.get('emotes')?.value).split(/\s+/);
      const getShortestUniqueSubstrings_: readonly (readonly [string | undefined, readonly string[] | undefined])[] =
        text.map((t) => getShortestUniqueSubstrings(em, t));

      let message = '';
      getShortestUniqueSubstrings_.forEach((i: readonly [string | undefined, readonly string[] | undefined], j) => {
        const [original, shortestUniqueSubstrings] = i;
        if (original === undefined) {
          message += `Could not find emote '${text[j]}'.\n`;
          return;
        }

        if (shortestUniqueSubstrings !== undefined) {
          if (shortestUniqueSubstrings.length === 1) message += `${original}: ${shortestUniqueSubstrings[0]}\n`;
          else message += `${original}: ${shortestUniqueSubstrings.join(', ')}\n`;
        } else {
          message += `${original}: -\n`;
        }
      });

      await defer;
      await interaction.editReply(message.trim());
    } catch (error) {
      console.log(`Error at shortestuniquesubstrings --> ${error instanceof Error ? error.message : String(error)}`);

      await defer;
      await interaction.editReply('failed to provide shortest unique substrings.');
    }
  };
}
