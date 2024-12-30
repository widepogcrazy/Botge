import { fetchAndJson } from './fetch-and-json.js';
import type { SevenTVEmoteNotInSet } from '../types.js';
import { CDN_ENDPOINTS } from '../paths-and-endpoints.js';

export const SPLITTER = '/';

const regExpSevenTVEmoteNotInSet: Readonly<RegExp> = new RegExp(/^https:\/\/7tv\.app\/emotes\/[A-Za-z0-9]+$/);
const regExpOldSevenTVEmoteNotInSet: Readonly<RegExp> = new RegExp(/^https:\/\/old\.7tv\.app\/emotes\/[A-Za-z0-9]+$/);

export async function sevenTVUrlToSevenNotInSet(url: string): Promise<SevenTVEmoteNotInSet | undefined> {
  const urlSplit: readonly string[] = url.split(SPLITTER);

  if (!regExpSevenTVEmoteNotInSet.test(url)) if (!regExpOldSevenTVEmoteNotInSet.test(url)) return undefined;

  // TODO: USE REGEX CAPTURE
  const sevenEmoteNotInSetId = urlSplit.at(-1);
  const sevenEmoteNotInSetUrl = `${CDN_ENDPOINTS.sevenTVNotInSet}${SPLITTER}${sevenEmoteNotInSetId}`;

  try {
    const sevenEmoteNotInSet = (await fetchAndJson(sevenEmoteNotInSetUrl)) as SevenTVEmoteNotInSet;
    return sevenEmoteNotInSet;
  } catch (error: unknown) {
    console.error(
      `Error fetching sevenEmoteNotInSet in sevenTVUrlToSevenNotInSet: ${error instanceof Error ? error : 'error'}`
    );
    return undefined;
  }
}
