import schedule from 'node-schedule';

import type { Client, ChatInputCommandInteraction, TextChannel } from 'discord.js';

import type { Ping } from '../types.js';
import type { PingsDatabase } from '../api/ping-database.js';
import {
  hoursAndMinutesToMiliseconds,
  getMessage,
  getTimeMessagePart,
  getMessageMessagePart
} from '../utils/ping/ping-utils.js';
import type { Guild } from '../guild.js';

export function pingMeHandler(pingsDataBase: Readonly<PingsDatabase>, client: Client) {
  return async (interaction: ChatInputCommandInteraction, guild: Readonly<Guild>): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const hours = ((): number | undefined => {
        const hoursOptions = interaction.options.get('hours')?.value;
        return hoursOptions !== undefined ? Number(hoursOptions) : undefined;
      })();
      const minutes = ((): number | undefined => {
        const minutesOptions = interaction.options.get('minutes')?.value;
        return minutesOptions !== undefined ? Number(minutesOptions) : undefined;
      })();
      const message = ((): string | undefined => {
        const messageOptions = interaction.options.get('message')?.value;
        return messageOptions !== undefined ? String(messageOptions).trim() : undefined;
      })();

      if (hours === undefined && minutes === undefined) {
        await defer;
        await interaction.editReply('Either hours or minutes must be specified.');
        return;
      }

      if (hours !== undefined && hours < 1) {
        await defer;
        await interaction.editReply('Hours must at least 1.');
        return;
      }
      if (minutes !== undefined && minutes < 1) {
        await defer;
        await interaction.editReply('Minutes must at least 1.');
        return;
      }

      if (message !== undefined && message.length > 1800) {
        await defer;
        await interaction.editReply('Message must be at most 1800 characters.');
        return;
      }

      if (interaction.guild === null) {
        await defer;
        await interaction.editReply('The bot must be in a server for this command to work.');
        return;
      }

      const timeNow = Date.now();
      const pingDate = new Date(timeNow + hoursAndMinutesToMiliseconds(hours ?? 0, minutes ?? 0));

      const { channelId } = interaction;
      let channel: TextChannel | undefined = undefined;

      try {
        channel = (await client.channels.fetch(channelId)) as TextChannel;
      } catch {
        await defer;
        await interaction.editReply('The command can only be used in a text channel.');
        return;
      }

      const userId = interaction.user.id;

      const ping: Ping = {
        time: timeNow,
        hours: hours ?? null,
        minutes: minutes ?? null,
        userId: userId,
        channelId: channelId,
        message: message ?? null
      };
      pingsDataBase.insert(ping);

      schedule.scheduleJob(pingDate, () => {
        void channel.send(getMessage(hours, minutes, message, userId));
        pingsDataBase.delete(ping);
      });

      await defer;
      await interaction.editReply(
        `The ping has been registered for ${getTimeMessagePart(hours, minutes)}${getMessageMessagePart(message)}`
      );
    } catch (error) {
      console.log(`Error at pingMe --> ${error instanceof Error ? error.message : String(error)}`);

      await defer;
      await interaction.editReply('Failed to register the ping.');
    }
  };
}
