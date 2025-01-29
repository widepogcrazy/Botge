import { Platform } from '../enums.js';
import type {
  SevenTVEmoteFile,
  SevenTVEmoteInSet,
  SevenTVEmoteNotInSet,
  BTTVEmote,
  FFZEmote,
  TwitchEmote,
  AssetInfo
} from '../types.js';
import { CDN_ENDPOINTS } from '../paths-and-endpoints.js';

const EMOTESIZE = 2;

export function sevenTVInSetToAsset(emote: SevenTVEmoteInSet, size?: number): AssetInfo {
  const { name, flags, data } = emote;
  const { host, animated } = data;
  const filename = `${size ?? EMOTESIZE}x.${animated ? 'gif' : 'png'}`;
  const file = host.files.find((f: SevenTVEmoteFile) => f.name === filename);
  return {
    name: name,
    url: `https:${host.url}/${file?.name}`,
    zeroWidth: !!(1 & flags),
    animated: animated,
    width: file?.width,
    height: file?.height,
    platform: Platform.sevenInSet
  };
}

export function sevenTVNotInSetToAsset(emote: Readonly<SevenTVEmoteNotInSet>, size?: number): AssetInfo {
  const { name, flags, host, animated } = emote;
  const filename = `${size ?? EMOTESIZE}x.${animated ? 'gif' : 'png'}`;
  const file = host.files.find((f: SevenTVEmoteFile) => f.name === filename);
  return {
    name: name,
    url: `https:${host.url}/${file?.name}`,
    zeroWidth: !!(256 & flags),
    animated: animated,
    width: file?.width,
    height: file?.height,
    platform: Platform.sevenNotInSet
  };
}

export function bttvToAsset(emote: BTTVEmote): AssetInfo {
  const { id, code, animated } = emote;
  const filename = `${EMOTESIZE}x.${animated ? 'gif' : 'png'}`;
  return {
    name: code,
    url: `https://${CDN_ENDPOINTS.bttv}/${id}/${filename}`,
    zeroWidth: false,
    animated: animated,
    width: undefined,
    height: undefined,
    platform: Platform.bttv
  };
}

export function ffzToAsset(emote: FFZEmote): AssetInfo {
  const { name, urls } = emote;
  return {
    name: name,
    url: urls[`${EMOTESIZE}`],
    zeroWidth: false,
    animated: false,
    width: undefined,
    height: undefined,
    platform: Platform.ffz
  };
}

export function twitchToAsset(emote: TwitchEmote): AssetInfo {
  const { name, id, format, theme_mode } = emote;
  const animated = format.length === 2;
  const chosenFormat = animated ? format[1] : format[0];
  const chosenThemeMode = theme_mode.length === 2 ? theme_mode[1] : theme_mode[0];
  return {
    name: name,
    url: `https://${CDN_ENDPOINTS.twitch}/${id}/${chosenFormat}/${chosenThemeMode}/${EMOTESIZE}.0`,
    zeroWidth: false,
    animated: animated,
    width: undefined,
    height: undefined,
    platform: Platform.twitch
  };
}
