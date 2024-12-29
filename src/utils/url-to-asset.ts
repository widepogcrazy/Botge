import { sevenTVNotInSetToAsset } from './emote-to-asset.js';
import { maxPlatformSize } from './size-change.js';
import { sevenTVUrlToSevenNotInSet } from './platform-url-to-api-url.js';
import type { AssetInfo } from '../types.js';
import { Platform } from '../enums.js';

export async function urlToAssetInfo(url: string, highestSize: boolean): Promise<AssetInfo | string | undefined> {
  const urlToSevenNotInSet_ = await sevenTVUrlToSevenNotInSet(url);
  const sevenNotInSetToAsset_ =
    urlToSevenNotInSet_ !== undefined
      ? highestSize
        ? sevenTVNotInSetToAsset(urlToSevenNotInSet_, maxPlatformSize(Platform.sevenNotInSet))
        : sevenTVNotInSetToAsset(urlToSevenNotInSet_)
      : undefined;

  if (sevenNotInSetToAsset_ !== undefined) return sevenNotInSetToAsset_;

  try {
    new URL(url);
    return url;
  } catch {
    return undefined;
  }
}
