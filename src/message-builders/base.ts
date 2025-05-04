import {
  ButtonStyle,
  ButtonBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type CommandInteraction,
  type MessageActionRowComponentBuilder,
  type ModalActionRowComponentBuilder
} from 'discord.js';

import type { ReadonlyActionRowBuilderMessageActionRowComponentBuilder, ReadonlyModalBuilder } from '../types.js';

export const PREVIOUS_BUTTON_BASE_CUSTOM_ID = 'previousButton';
export const NEXT_BUTTON_BASE_CUSTOM_ID = 'nextButton';
export const FIRST_BUTTON_BASE_CUSTOM_ID = 'firstButton';
export const LAST_BUTTON_BASE_CUSTOM_ID = 'lastButton';
export const JUMP_TO_BUTTON_BASE_CUSTOM_ID = 'jumpToButton';
export const JUMP_TO_MODAL_BASE_CUSTOM_ID = 'jumpToModal';
export const JUMP_TO_TEXT_INPUT_BASE_CUSTOM_ID = 'jumpToTextInput';

const BUTTON_CUSTOM_ID_SPLITTER = '-';

export function getBaseCustomIdFromCustomId(customId: string): string {
  return customId.split(BUTTON_CUSTOM_ID_SPLITTER)[0];
}

export function getMessageBuilderTypeFromCustomId(customId: string): string {
  return customId.split(BUTTON_CUSTOM_ID_SPLITTER)[1];
}

export function getCounterFromCustomId(customId: string): number {
  return Number(customId.split(BUTTON_CUSTOM_ID_SPLITTER)[2]);
}

export function getCustomId(baseCustomId: string, messageBuilderType: string, counter: number): string {
  return `${baseCustomId}${BUTTON_CUSTOM_ID_SPLITTER}${messageBuilderType}${BUTTON_CUSTOM_ID_SPLITTER}${counter}`;
}

function randomNumberInInterval(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export class BaseMessageBuilder<ArrayItemType, TransformFunctionReturnType> {
  readonly #counter: number;
  readonly #interaction: CommandInteraction;
  readonly #array: readonly ArrayItemType[];
  readonly #row: ReadonlyActionRowBuilderMessageActionRowComponentBuilder;
  readonly #modal: ReadonlyModalBuilder;
  readonly #transformFunction: (arrayItem: ArrayItemType) => TransformFunctionReturnType;
  #currentIndex: number;

  protected constructor(
    counter: number,
    messageBuilderType: string,
    interaction: CommandInteraction,
    array: readonly ArrayItemType[],
    transformFunction: (arrayItem: ArrayItemType) => TransformFunctionReturnType
  ) {
    this.#counter = counter;
    this.#interaction = interaction;
    this.#array = array;
    this.#transformFunction = transformFunction;
    //-1 because of first element
    this.#currentIndex = -1;

    this.#row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(getCustomId(FIRST_BUTTON_BASE_CUSTOM_ID, messageBuilderType, this.#counter))
        .setLabel('First')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(getCustomId(PREVIOUS_BUTTON_BASE_CUSTOM_ID, messageBuilderType, this.#counter))
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(getCustomId(JUMP_TO_BUTTON_BASE_CUSTOM_ID, messageBuilderType, this.#counter))
        .setLabel('Jump to')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(getCustomId(NEXT_BUTTON_BASE_CUSTOM_ID, messageBuilderType, this.#counter))
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(getCustomId(LAST_BUTTON_BASE_CUSTOM_ID, messageBuilderType, this.#counter))
        .setLabel('Last')
        .setStyle(ButtonStyle.Secondary)
    );
    this.#modal = new ModalBuilder()
      .setCustomId(getCustomId(JUMP_TO_MODAL_BASE_CUSTOM_ID, messageBuilderType, this.#counter))
      .setTitle('Jump to')
      .addComponents(
        new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(getCustomId(JUMP_TO_TEXT_INPUT_BASE_CUSTOM_ID, messageBuilderType, this.#counter))
            .setLabel('Jump to')
            .setMaxLength(6)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('random')
            .setRequired(false)
        )
      );
  }

  public get counter(): number {
    return this.#counter;
  }

  public get interaction(): CommandInteraction {
    return this.#interaction;
  }

  public get row(): ReadonlyActionRowBuilderMessageActionRowComponentBuilder {
    return this.#row;
  }

  public get modal(): ReadonlyModalBuilder {
    return this.#modal;
  }

  protected get currentIndex(): number {
    return this.#currentIndex;
  }

  protected get arrayLength(): number {
    return this.#array.length;
  }

  public previous(): TransformFunctionReturnType | undefined {
    if (this.#currentIndex <= 0) return undefined;
    return this.#transformFunction(this.#array[this.#currentIndex--]);
  }

  public next(): TransformFunctionReturnType | undefined {
    if (this.#currentIndex >= this.#array.length - 1) return undefined;
    return this.#transformFunction(this.#array[this.#currentIndex++]);
  }

  public first(): TransformFunctionReturnType | undefined {
    if (this.#currentIndex === 0) return undefined;
    this.#currentIndex = 0;
    return this.#transformFunction(this.#array[this.#currentIndex]);
  }

  public last(): TransformFunctionReturnType | undefined {
    if (this.#currentIndex === this.#array.length - 1) return undefined;
    this.#currentIndex = this.#array.length - 1;
    return this.#transformFunction(this.#array[this.#currentIndex]);
  }

  public random(): TransformFunctionReturnType | undefined {
    if (this.#array.length === 1) return undefined;

    const randomNumberInInterval_ = ((): number => {
      let randomNumber = randomNumberInInterval(0, this.#array.length - 1);
      while (randomNumber === this.#currentIndex) randomNumber = randomNumberInInterval(0, this.#array.length - 1);

      return randomNumber;
    })();

    this.#currentIndex = randomNumberInInterval_;
    return this.#transformFunction(this.#array[this.#currentIndex]);
  }

  public jumpTo(jumpTo: number): TransformFunctionReturnType | undefined {
    if (jumpTo > this.#array.length - 1) return undefined;
    else if (jumpTo < 0) return undefined;

    if (this.#currentIndex === jumpTo) return undefined;
    this.#currentIndex = jumpTo;
    return this.#transformFunction(this.#array[this.#currentIndex]);
  }
}
