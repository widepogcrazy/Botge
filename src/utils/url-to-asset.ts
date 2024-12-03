import { sevenNotInSetToAsset } from './emote-to-asset.js';
import { maxPlatformSize } from './size-change.js';
import { sevenUrlToSevenNotInSet } from './platform-url-to-api-url.js';
import type { AssetInfo } from '../types.js';
import { Platform } from '../enums.js';

export async function urlToAssetInfo(url: string, highestSize: boolean): Promise<AssetInfo | string | undefined> {
  const urlToSevenNotInSet_ = await sevenUrlToSevenNotInSet(url);
  const sevenNotInSetToAsset_ =
    urlToSevenNotInSet_ !== undefined
      ? highestSize
        ? sevenNotInSetToAsset(urlToSevenNotInSet_, maxPlatformSize(Platform.sevenNotInSet))
        : sevenNotInSetToAsset(urlToSevenNotInSet_)
      : undefined;

  if (sevenNotInSetToAsset_ !== undefined) return sevenNotInSetToAsset_;

  try {
    new URL(url);
    return url;
  } catch {
    return undefined;
  }
}
