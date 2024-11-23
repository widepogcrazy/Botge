import type { AssetInfo } from '../types.js';
import { Platform } from '../enums.js';
import { sevenNotInSetToAsset } from './emoteToAssetInfo.js';
import { sevenUrlToSevenNotInSet } from './sevenUrlToSevenNotInSet.js';

export function maxPlatformSize(platform: Platform): number {
  if (platform === Platform.bttv || platform === Platform.twitch) return 3;

  return 4;
}

export function emoteSizeChange(url: string, size: number | undefined, platform: Platform): string {
  if (size === undefined) return url;

  if (size >= 1 && size <= 4) {
    if (platform === Platform.sevenInSet || platform === Platform.sevenNotInSet) {
      return url.replace('/2x', `/${size}x`);
    }
    if (platform === Platform.bttv) {
      if (size < 4) {
        return url.replace('/2x', `/${size}x`);
      }
    }
    if (platform === Platform.ffz) {
      if (size !== 3) {
        return url.slice(0, -1) + `${size}`;
      }
    }
    if (platform === Platform.twitch) {
      if (size < 4) {
        return url.replace('/2.0', `/${size}.0`);
      }
    }
  }

  return url;
}

export async function assetSizeChange(asset: AssetInfo, size: number, emoteEndpoint: string): Promise<AssetInfo> {
  const { url, platform } = asset;

  if (platform === Platform.sevenInSet || platform === Platform.sevenNotInSet) {
    const emoteId = url.split('/').at(-2);
    const sevenUrl = `https://7tv.app/emotes/${emoteId}`;
    const sevenUrlToSevenNotInSet_ = await sevenUrlToSevenNotInSet(sevenUrl, emoteEndpoint);
    const sevenNotInSetToAsset_ =
      sevenUrlToSevenNotInSet_ !== undefined ? sevenNotInSetToAsset(sevenUrlToSevenNotInSet_, size) : undefined;

    return sevenNotInSetToAsset_ ?? asset;
  }

  return asset;
}
