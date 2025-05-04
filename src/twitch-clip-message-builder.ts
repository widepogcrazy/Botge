import { EmbedBuilder, type CommandInteraction } from 'discord.js';

import type { ReadonlyEmbedBuilder, TwitchClip } from './types.js';
import { BaseMessageBuilder } from './message-builders/base.js';

export class TwitchClipMessageBuilder extends BaseMessageBuilder<TwitchClip, ReadonlyEmbedBuilder> {
  public static readonly messageBuilderType = 'Clip';
  static #staticCounter = 0;
  readonly #sortedByText: string | undefined;

  public constructor(
    interaction: CommandInteraction,
    twitchClips: readonly TwitchClip[],
    sortedBy: string | undefined
  ) {
    const transformFunction = (twitchClip: TwitchClip): ReadonlyEmbedBuilder => {
      const { title, url, creator_name, game_id, view_count, created_at, thumbnail_url } = twitchClip;

      return new EmbedBuilder()
        .setColor('DarkButNotBlack')
        .setTitle(title)
        .setURL(url)
        .addFields(
          { name: 'Clipper', value: creator_name },
          { name: 'Game', value: game_id, inline: true },
          { name: 'Views', value: view_count.toString(), inline: true },
          { name: 'Created', value: created_at, inline: true }
        )
        .setImage(thumbnail_url)
        .setFooter({
          text: `${this.currentIndex + 1}/${this.arrayLength}. Sorted by ${this.#sortedByText}.`
        });
    };

    super(
      TwitchClipMessageBuilder.#staticCounter++,
      TwitchClipMessageBuilder.messageBuilderType,
      interaction,
      twitchClips,
      transformFunction
    );

    this.#sortedByText = sortedBy !== undefined ? `${sortedBy} then views` : 'views';
  }
}
