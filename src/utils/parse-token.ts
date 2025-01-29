import twemoji from '@twemoji/api';

import { sevenTVNotInSetToAsset } from './emote-to-asset.js';
import { maxPlatformSize } from './size-change.js';
import { sevenTVUrlToSevenTVNotInSet } from './platform-url-to-api-url.js';
import type { AssetInfo } from '../types.js';
import { Platform } from '../enums.js';

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
    return url;
  } catch {
    try {
      const parseEmoji_ = parseEmoji(url);
      if (parseEmoji_ !== undefined) return parseEmoji_;
    } catch {
      return undefined;
    }

    return undefined;
  }
}
