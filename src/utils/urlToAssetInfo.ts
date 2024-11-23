import type { AssetInfo } from '../types.js';
import { sevenNotInSetToAsset } from './emoteToAssetInfo.js';
import { maxPlatformSize } from './sizeChange.js';
import { sevenUrlToSevenNotInSet } from './sevenUrlToSevenNotInSet.js';
import { Platform } from '../enums.js';

export async function urlToAssetInfo(
  url: string,
  emoteEndpoint: string,
  highestSize: boolean
): Promise<AssetInfo | string> {
  const urlToSevenNotInSet_ = await sevenUrlToSevenNotInSet(url, emoteEndpoint);
  const sevenNotInSetToAsset_ =
    urlToSevenNotInSet_ !== undefined
      ? highestSize
        ? sevenNotInSetToAsset(urlToSevenNotInSet_, maxPlatformSize(Platform.sevenNotInSet))
        : sevenNotInSetToAsset(urlToSevenNotInSet_)
      : undefined;

  if (sevenNotInSetToAsset_ !== undefined) return sevenNotInSetToAsset_;

  return url;
}
