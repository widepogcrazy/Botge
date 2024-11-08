import { AssetInfo, EmoteMatcher } from '../emoteMatcher';
import { CommandInteraction } from 'discord.js';

function getShortestUniqueSubstrings(em: EmoteMatcher, text: string): [string | undefined, string[] | undefined] {
  try {
    function getAllSubstrings(str: string): string[] {
      const result: string[] = [];

      for (let i: number = 0; i < str.length; i++)
        for (let j: number = i + 1; j < str.length + 1; j++) result.push(str.slice(i, j));

      return result;
    }

    const matchsingle: AssetInfo | undefined = em.matchSingle(text);
    if (!matchsingle) return [undefined, undefined];
    const original: string = em.matchSingle(text).name;

    const all_substrings: string[] = getAllSubstrings(original);
    const all_substring_uniqueness: boolean[] = all_substrings.map((substring) =>
      em.matchSingleUnique(substring, original)
    );

    const unique_substrings: string[] = all_substrings.filter((s, i) => {
      if (all_substring_uniqueness[i]) {
        return s;
      }
    });

    const shortest_unique_substring_length: number | undefined =
      unique_substrings.length !== 0
        ? unique_substrings.reduce((a, b) => (a.length < b.length ? a : b)).length
        : undefined;
    const shortest_unique_substrings: string[] | undefined = shortest_unique_substring_length
      ? unique_substrings.filter((s) => s.length === shortest_unique_substring_length)
      : undefined;

    return [original, shortest_unique_substrings];
  } catch (error) {
    console.error(`Error getting unique substring(s): ${error}`);
    return [undefined, undefined];
  }
}

export function shortestuniquesubstringsHandler(em: EmoteMatcher) {
  return async (interaction: CommandInteraction) => {
    const defer = interaction.deferReply();
    try {
      const text: string[] = String(interaction.options.get('emotes').value).split(/\s+/);
      const get_shortest_unique_substrings: [string, string[] | undefined][] = text.map((t) =>
        getShortestUniqueSubstrings(em, t)
      );

      let message: string = '';
      for (const i in get_shortest_unique_substrings) {
        const j = get_shortest_unique_substrings[i];

        const original: string | undefined = j[0];
        const shortest_unique_substrings: string[] | undefined = j[1];
        if (!original) {
          message += `Could not find emote '${text[i]}'.\n`;
          continue;
        }

        if (shortest_unique_substrings) {
          if (shortest_unique_substrings.length === 1) message += `${original}: ${shortest_unique_substrings[0]}\n`;
          else message += `${original}: ${shortest_unique_substrings.join(', ')}\n`;
        } else {
          message += `${original}: -\n`;
        }
      }
      message = message.trim();
      await defer;
      await interaction.editReply(message);
      return;
    } catch (error) {
      console.log(`Error at shortestuniquesubstrings --> ${error}`);
      await defer;
      await interaction.editReply('failed to provide shortest unique substrings.');
      return;
    }
  };
}
