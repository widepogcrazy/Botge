import { EmbedBuilder, type CommandInteraction } from 'discord.js';

import type { AssetInfo, EmoteMessageBuilderTransformFunctionReturnType } from '../types.js';
import { Platform } from '../enums.js';
import { BaseMessageBuilder } from './base.js';

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

export class EmoteMessageBuilder extends BaseMessageBuilder<AssetInfo, EmoteMessageBuilderTransformFunctionReturnType> {
  public static readonly messageBuilderType = 'Emote';
  static #staticCounter = 0;

  public constructor(interaction: CommandInteraction, emotes: readonly AssetInfo[]) {
    const transformFunction = (assetInfo: AssetInfo): EmoteMessageBuilderTransformFunctionReturnType => {
      const { name, url, zeroWidth, platform, width, height } = assetInfo;

      const embed = new EmbedBuilder()
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

      return {
        embeds: [embed],
        components: [this.row]
      } as EmoteMessageBuilderTransformFunctionReturnType;
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
