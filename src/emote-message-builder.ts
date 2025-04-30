import {
  type CommandInteraction,
  EmbedBuilder,
  ButtonStyle,
  ButtonBuilder,
  ActionRowBuilder,
  type MessageActionRowComponentBuilder
} from 'discord.js';

import type {
  ReadonlyEmbedBuilder,
  ReadonlyActionRowBuilderMessageActionRowComponentBuilder,
  AssetInfo
} from './types.js';
import { Platform } from './enums.js';

export const PREVIOUS_BUTTON_CUSTOM_ID_EMOTE = 'previousButtonEmote';
export const NEXT_BUTTON_CUSTOM_ID_EMOTE = 'nextButtonEmote';
export const FIRST_BUTTON_CUSTOM_ID_EMOTE = 'firstButtonEmote';
export const LAST_BUTTON_CUSTOM_ID_EMOTE = 'lastButtonEmote';
export const SEND_LINK_BUTTON_CUSTOM_ID_EMOTE = 'sendLinkButtonEmote';

const BUTTON_CUSTOM_ID_SPLITTER = '-';

export function getCounterFromButtonCustomIdEmote(buttonCustomID: string): number {
  return Number(buttonCustomID.split(BUTTON_CUSTOM_ID_SPLITTER)[1]);
}

function getButtonCustomId(buttonBaseCustomID: string, counter: number): string {
  return `${buttonBaseCustomID}${BUTTON_CUSTOM_ID_SPLITTER}${counter}`;
}

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

export class EmoteMessageBuilder {
  static #counter = 0;
  public readonly counter: number;
  public readonly interaction: CommandInteraction;
  readonly #emotes: readonly AssetInfo[];
  readonly #ephemeral: boolean;
  readonly #row: ReadonlyActionRowBuilderMessageActionRowComponentBuilder;
  #currentEmoteCounter: number;

  public constructor(interaction: CommandInteraction, emotes: readonly AssetInfo[], ephemeral: boolean) {
    this.counter = EmoteMessageBuilder.#counter++;
    this.interaction = interaction;
    this.#emotes = emotes;
    this.#ephemeral = ephemeral;
    this.#row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(getButtonCustomId(PREVIOUS_BUTTON_CUSTOM_ID_EMOTE, this.counter))
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(getButtonCustomId(NEXT_BUTTON_CUSTOM_ID_EMOTE, this.counter))
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(getButtonCustomId(FIRST_BUTTON_CUSTOM_ID_EMOTE, this.counter))
        .setLabel('First')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(getButtonCustomId(LAST_BUTTON_CUSTOM_ID_EMOTE, this.counter))
        .setLabel('Last')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(getButtonCustomId(SEND_LINK_BUTTON_CUSTOM_ID_EMOTE, this.counter))
        .setLabel('Send Emote Link')
        .setStyle(ButtonStyle.Primary)
    );
    this.#currentEmoteCounter = 0;
  }

  public get ephemeral(): boolean {
    return this.#ephemeral;
  }

  public get row(): ReadonlyActionRowBuilderMessageActionRowComponentBuilder {
    return this.#row;
  }

  public currentUrl(): string {
    return this.#emotes[this.#currentEmoteCounter].url;
  }

  public previous(): ReadonlyEmbedBuilder {
    if (this.#currentEmoteCounter > 0) this.#currentEmoteCounter--;
    return this.#currentEmbed();
  }

  public next(): ReadonlyEmbedBuilder {
    if (this.#currentEmoteCounter < this.#emotes.length - 1) this.#currentEmoteCounter++;
    return this.#currentEmbed();
  }

  public first(): ReadonlyEmbedBuilder {
    this.#currentEmoteCounter = 0;
    return this.#currentEmbed();
  }

  public last(): ReadonlyEmbedBuilder {
    this.#currentEmoteCounter = this.#emotes.length - 1;
    return this.#currentEmbed();
  }

  #currentEmbed(): ReadonlyEmbedBuilder {
    const { name, url, zeroWidth, platform, width, height } = this.#emotes[this.#currentEmoteCounter];

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
        text: `${this.#currentEmoteCounter + 1}/${this.#emotes.length}. Sorted by date added.`
      });
  }
}
