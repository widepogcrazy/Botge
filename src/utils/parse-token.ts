import twemoji from '@twemoji/api';

import { sevenTVNotInSetToAsset } from './emote-to-asset.js';
import { maxPlatformSize } from './size-change.js';
import { sevenTVUrlToSevenTVNotInSet } from './platform-url-to-api-url.js';
import type { AssetInfo } from '../types.js';
import { Platform } from '../enums.js';

function parseSingleLetterOrNumber(token: string): string | undefined {
  const base = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji/assets/72x72';
  switch (token) {
    case 'A':
      return `${base}/1f1e6.png`;
    case 'B':
      return `${base}/1f1e7.png`;
    case 'C':
      return `${base}/1f1e8.png`;
    case 'D':
      return `${base}/1f1e9.png`;
    case 'E':
      return `${base}/1f1ea.png`;
    case 'F':
      return `${base}/1f1eb.png`;
    case 'G':
      return `${base}/1f1ec.png`;
    case 'H':
      return `${base}/1f1ed.png`;
    case 'I':
      return `${base}/1f1ee.png`;
    case 'J':
      return `${base}/1f1ef.png`;
    case 'K':
      return `${base}/1f1f0.png`;
    case 'L':
      return `${base}/1f1f1.png`;
    case 'M':
      return `${base}/1f1f2.png`;
    case 'N':
      return `${base}/1f1f3.png`;
    case 'O':
      return `${base}/1f1f4.png`;
    case 'P':
      return `${base}/1f1f5.png`;
    case 'Q':
      return `${base}/1f1f6.png`;
    case 'R':
      return `${base}/1f1f7.png`;
    case 'S':
      return `${base}/1f1f8.png`;
    case 'T':
      return `${base}/1f1f9.png`;
    case 'U':
      return `${base}/1f1fa.png`;
    case 'V':
      return `${base}/1f1fb.png`;
    case 'W':
      return `${base}/1f1fc.png`;
    case 'X':
      return `${base}/1f1fd.png`;
    case 'Y':
      return `${base}/1f1fe.png`;
    case 'Z':
      return `${base}/1f1ff.png`;
    case '0':
      return `${base}/30-20e3.png`;
    case '1':
      return `${base}/31-20e3.png`;
    case '2':
      return `${base}/32-20e3.png`;
    case '3':
      return `${base}/33-20e3.png`;
    case '4':
      return `${base}/34-20e3.png`;
    case '5':
      return `${base}/35-20e3.png`;
    case '6':
      return `${base}/36-20e3.png`;
    case '7':
      return `${base}/37-20e3.png`;
    case '8':
      return `${base}/38-20e3.png`;
    case '9':
      return `${base}/39-20e3.png`;
    default:
      return undefined;
  }
}

function parseEmoji(emoji: string): string | undefined {
  const parsedEmoji = twemoji
    .parse(emoji)
    .split(/\s+/)[4]
    .split('=')[1]
    .replace('"', '')
    .replace('"', '')
    .replace('/>', '');

  if (parsedEmoji === emoji) return undefined;
  return parsedEmoji;
}

export async function parseToken(url: string, highestSize: boolean): Promise<AssetInfo | string | undefined> {
  const sevenTVUrlToSevenTVNotInSet_ = await sevenTVUrlToSevenTVNotInSet(url);
  const sevenTVNotInSetToAsset_ =
    sevenTVUrlToSevenTVNotInSet_ !== undefined
      ? highestSize
        ? sevenTVNotInSetToAsset(sevenTVUrlToSevenTVNotInSet_, maxPlatformSize(Platform.sevenNotInSet))
        : sevenTVNotInSetToAsset(sevenTVUrlToSevenTVNotInSet_)
      : undefined;

  if (sevenTVNotInSetToAsset_ !== undefined) return sevenTVNotInSetToAsset_;

  try {
    new URL(url);
    if (url.startsWith('https://tenor.com/view/') && !url.endsWith('.gif')) return url + '.gif';
    return url;
  } catch {
    try {
      const parseEmoji_ = parseEmoji(url);
      if (parseEmoji_ !== undefined) return parseEmoji_;
    } catch {
      return parseSingleLetterOrNumber(url.toUpperCase());
    }

    return undefined;
  }
}
