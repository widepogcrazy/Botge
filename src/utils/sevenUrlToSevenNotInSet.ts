import type { SevenEmoteNotInSet } from '../types.js';

import { fetchAndJson } from './fetchAndJson.js';

const SPLITTER = '/';

const regExpSevenEmoteNotInSet: Readonly<RegExp> = new RegExp(/^https:\/\/7tv\.app\/emotes\/[A-Z0-9]{26}$/);

export async function sevenUrlToSevenNotInSet(
  url: string,
  emoteEndpoint: string
): Promise<SevenEmoteNotInSet | undefined> {
  const urlSplit: readonly string[] = url.split(SPLITTER);

  const regExpSevenEmoteNotInSetTest: boolean = regExpSevenEmoteNotInSet.test(url);

  if (!regExpSevenEmoteNotInSetTest) return undefined;

  // TODO: USE REGEX CAPTURE
  const sevenEmoteNotInSetId = urlSplit.at(-1);
  const sevenEmoteNotInSetUrl = `${emoteEndpoint}${SPLITTER}${sevenEmoteNotInSetId}`;

  const sevenEmoteNotInSet: SevenEmoteNotInSet = (await fetchAndJson(sevenEmoteNotInSetUrl)) as SevenEmoteNotInSet;

  return sevenEmoteNotInSet;
}
