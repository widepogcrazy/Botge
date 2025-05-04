import { EmbedBuilder, type CommandInteraction } from 'discord.js';

import type { ReadonlyEmbedBuilder, AssetInfo } from './types.js';
import { Platform } from './enums.js';
import { BaseMessageBuilder } from './message-builders/base.js';

function booleanToString(bool: boolean): string {
  if (bool) return 'Yes';
  else return 'No';
}

function platformToString(platform: Platform): string {
  if (platform === Platform.sevenInSet || platform === Platform.sevenNotInSet) return '7TV';
  else if (platform === Platform.bttv) return 'BTTV';
  else if (platform === Platform.ffz) return 'FFZ';
  else return 'Twitch';
}

export class EmoteMessageBuilder extends BaseMessageBuilder<AssetInfo, ReadonlyEmbedBuilder> {
  public static readonly messageBuilderType = 'Emote';
  static #staticCounter = 0;

  public constructor(interaction: CommandInteraction, emotes: readonly AssetInfo[]) {
    const transformFunction = (assetInfo: AssetInfo): ReadonlyEmbedBuilder => {
      const { name, url, zeroWidth, platform, width, height } = assetInfo;

      return new EmbedBuilder()
        .setColor('DarkButNotBlack')
        .setTitle(name)
        .setURL(url)
        .addFields(
          { name: 'Platform', value: platformToString(platform) },
          { name: 'Zero width', value: booleanToString(zeroWidth), inline: true },
          { name: 'Width', value: width?.toString() ?? '', inline: true },
          { name: 'Height', value: height?.toString() ?? '', inline: true }
        )
        .setImage(url)
        .setFooter({
          text: `${this.currentIndex + 1}/${this.arrayLength}. Sorted by date added.`
        });
    };

    super(
      EmoteMessageBuilder.#staticCounter++,
      EmoteMessageBuilder.messageBuilderType,
      interaction,
      emotes,
      transformFunction
    );
  }
}
