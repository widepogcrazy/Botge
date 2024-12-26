import { fetchAndJson } from './fetch-and-json.js';
import type { SevenEmoteNotInSet } from '../types.js';
import { SEVEN_NOT_IN_SET_ENDPOINT } from '../paths-and-endpoints.js';

export const SPLITTER = '/';

const regExpSevenEmoteNotInSet: Readonly<RegExp> = new RegExp(/^https:\/\/7tv\.app\/emotes\/[A-Za-z0-9]+$/);

export async function sevenUrlToSevenNotInSet(url: string): Promise<SevenEmoteNotInSet | undefined> {
  const urlSplit: readonly string[] = url.split(SPLITTER);

  const regExpSevenEmoteNotInSetTest: boolean = regExpSevenEmoteNotInSet.test(url);

  if (!regExpSevenEmoteNotInSetTest) return undefined;

  // TODO: USE REGEX CAPTURE
  const sevenEmoteNotInSetId = urlSplit.at(-1);
  const sevenEmoteNotInSetUrl = `${SEVEN_NOT_IN_SET_ENDPOINT}${SPLITTER}${sevenEmoteNotInSetId}`;

  const sevenEmoteNotInSet = (await fetchAndJson(sevenEmoteNotInSetUrl)) as SevenEmoteNotInSet;

  return sevenEmoteNotInSet;
}
