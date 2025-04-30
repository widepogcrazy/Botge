import {
  type CommandInteraction,
  EmbedBuilder,
  ButtonStyle,
  ButtonBuilder,
  ActionRowBuilder,
  type MessageActionRowComponentBuilder
} from 'discord.js';

import type {
  TwitchClip,
  ReadonlyEmbedBuilder,
  ReadonlyActionRowBuilderMessageActionRowComponentBuilder
} from './types.js';

export const PREVIOUS_BUTTON_CUSTOM_ID_CLIP = 'previousButtonClip';
export const NEXT_BUTTON_CUSTOM_ID_CLIP = 'nextButtonClip';
export const FIRST_BUTTON_CUSTOM_ID_CLIP = 'firstButtonClip';
export const LAST_BUTTON_CUSTOM_ID_CLIP = 'lastButtonClip';
export const SEND_LINK_BUTTON_CUSTOM_ID_CLIP = 'sendLinkButtonClip';
export const SEND_LINK_FOR_YOURSELF_BUTTON_CUSTOM_ID_CLIP = 'sendLinkForYourselfButtonClip';

const BUTTON_CUSTOM_ID_SPLITTER = '-';

export function getCounterFromButtonCustomIdClip(buttonCustomID: string): number {
  return Number(buttonCustomID.split(BUTTON_CUSTOM_ID_SPLITTER)[1]);
}

function getButtonCustomId(buttonBaseCustomID: string, counter: number): string {
  return `${buttonBaseCustomID}${BUTTON_CUSTOM_ID_SPLITTER}${counter}`;
}

export class TwitchClipMessageBuilder {
  static #counter = 0;
  public readonly counter: number;
  public readonly interaction: CommandInteraction;
  readonly #twitchClips: readonly TwitchClip[];
  readonly #ephemeral: boolean;
  readonly #row: ReadonlyActionRowBuilderMessageActionRowComponentBuilder;
  readonly #sortedBy: string | undefined;
  #currentClipCounter: number;

  public constructor(
    interaction: CommandInteraction,
    twitchClips: readonly TwitchClip[],
    ephemeral: boolean,
    sortedBy: string | undefined
  ) {
    this.counter = TwitchClipMessageBuilder.#counter++;
    this.interaction = interaction;
    this.#twitchClips = twitchClips;
    this.#ephemeral = ephemeral;
    this.#row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(getButtonCustomId(PREVIOUS_BUTTON_CUSTOM_ID_CLIP, this.counter))
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(getButtonCustomId(NEXT_BUTTON_CUSTOM_ID_CLIP, this.counter))
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(getButtonCustomId(FIRST_BUTTON_CUSTOM_ID_CLIP, this.counter))
        .setLabel('First')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(getButtonCustomId(LAST_BUTTON_CUSTOM_ID_CLIP, this.counter))
        .setLabel('Last')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(getButtonCustomId(SEND_LINK_BUTTON_CUSTOM_ID_CLIP, this.counter))
        .setLabel('Send Clip Link')
        .setStyle(ButtonStyle.Primary)
    );
    this.#sortedBy = sortedBy;
    this.#currentClipCounter = 0;
  }

  public get ephemeral(): boolean {
    return this.#ephemeral;
  }

  public get row(): ReadonlyActionRowBuilderMessageActionRowComponentBuilder {
    return this.#row;
  }

  public currentUrl(): string {
    return this.#twitchClips[this.#currentClipCounter].url;
  }

  public previous(): ReadonlyEmbedBuilder {
    if (this.#currentClipCounter > 0) this.#currentClipCounter--;
    return this.#currentEmbed();
  }

  public next(): ReadonlyEmbedBuilder {
    if (this.#currentClipCounter < this.#twitchClips.length - 1) this.#currentClipCounter++;
    return this.#currentEmbed();
  }

  public first(): ReadonlyEmbedBuilder {
    this.#currentClipCounter = 0;
    return this.#currentEmbed();
  }

  public last(): ReadonlyEmbedBuilder {
    this.#currentClipCounter = this.#twitchClips.length - 1;
    return this.#currentEmbed();
  }

  #currentEmbed(): ReadonlyEmbedBuilder {
    const { title, url, creator_name, game_id, view_count, created_at, thumbnail_url } =
      this.#twitchClips[this.#currentClipCounter];
    const sortedByText = this.#sortedBy !== undefined ? `${this.#sortedBy} then views` : 'views';

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
        text: `${this.#currentClipCounter + 1}/${this.#twitchClips.length}. Sorted by ${sortedByText}.`
      });
  }
}
