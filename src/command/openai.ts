import type { ChatInputCommandInteraction } from 'discord.js';
import type ResponseInput from 'openai';

import type { ReadonlyOpenAI } from '../types.js';
import type { Guild } from '../guild.js';

type openAiResponseInput = ResponseInput.Responses.ResponseInput;

const MAXDISCORDMESSAGELENGTH = 2000;

export function chatgptHandler(openai: ReadonlyOpenAI | undefined) {
  return async (interaction: ChatInputCommandInteraction, guild: Readonly<Guild>): Promise<void> => {
    if (openai === undefined) {
      await interaction.reply('ChatGPT command is not available right now.');
      return;
    }

    const defer = interaction.deferReply();
    try {
      const prompt = String(interaction.options.get('prompt')?.value).trim();
      const image = ((): string | undefined => {
        const image_ = interaction.options.get('image')?.value;
        return image_ !== undefined ? String(image_).trim() : undefined;
      })();
      const instruction = ((): string | undefined => {
        const instruction_ = interaction.options.get('instruction')?.value;
        return instruction_ !== undefined ? String(instruction_) : undefined;
      })();

      if (image !== undefined) {
        if (image.split(/\s+/).length !== 1) {
          await defer;
          await interaction.editReply('Please provide only one link.');
          return;
        }

        try {
          new URL(image);
        } catch {
          await defer;
          await interaction.editReply('Please provide a valid link.');
          return;
        }
      }

      const imageInput: openAiResponseInput | undefined =
        image !== undefined
          ? [
              { role: 'user', content: prompt },
              {
                role: 'user',
                content: [{ type: 'input_image', image_url: image, detail: 'low' }]
              }
            ]
          : undefined;
      const input = imageInput ?? prompt;

      //1 token is around 4 english characters
      const response = await openai.responses.create({
        model: 'gpt-4.1',
        input: input,
        max_output_tokens: 400,
        instructions: instruction
      });
      const messageContent = response.output_text;

      const reply =
        messageContent.length > MAXDISCORDMESSAGELENGTH
          ? messageContent.slice(0, MAXDISCORDMESSAGELENGTH - 5) + ' ...'
          : messageContent;
      await defer;
      await interaction.editReply(reply);
    } catch (error) {
      console.log(`Error at chatgpt --> ${error instanceof Error ? error.message : String(error)}`);

      await defer;
      await interaction.editReply('Failed to ChatGPT.');
    }
  };
}
