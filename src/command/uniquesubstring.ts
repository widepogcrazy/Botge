import { AssetInfo, EmoteMatcher } from '../emoteMatcher';

export function getShortestUniqueSubstrings(
  em: EmoteMatcher,
  text: string
): [string | undefined, string[] | undefined] {
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

    const all_substrings: string[] = getAllSubstrings(original); //array is same length as all_substring_uniqueness
    const all_substring_uniqueness: boolean[] = em.matchUnique(all_substrings, original); //array is same length as all_substrings

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
