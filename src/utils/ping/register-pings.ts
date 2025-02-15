import scheduler from 'node-schedule';

import type { Client, TextChannel } from 'discord.js';

import { hoursAndMinutesToMiliseconds, getMessage, milisecondsToHoursAndMinutes } from './ping-utils.js';
import type { PingsDatabase } from '../../api/ping-database.js';

export async function registerPings(client: Readonly<Client>, pingsDataBase: Readonly<PingsDatabase>): Promise<void> {
  const pings = pingsDataBase.getAll();

  for (const ping of pings) {
    const { time, hours, minutes, userId, channelId, message } = ping;

    const timeMilliseconds = time + hoursAndMinutesToMiliseconds(hours ?? 0, minutes ?? 0);
    const pingDate = new Date(timeMilliseconds);

    let channel: TextChannel | undefined = undefined;
    try {
      channel = (await client.channels.fetch(channelId)) as TextChannel;
    } catch {
      return;
    }

    const difference = timeMilliseconds - Date.now();
    const messageToSend = getMessage(hours ?? undefined, minutes ?? undefined, message ?? undefined, userId);
    if (difference > 0) {
      scheduler.scheduleJob(pingDate, () => {
        void channel.send(messageToSend);
        pingsDataBase.delete(ping);
      });
    } else {
      void channel.send(
        `${messageToSend} Sorry for the bot downtime! The ping was delivered with a ${milisecondsToHoursAndMinutes(-difference)} delay!`
      );
      pingsDataBase.delete(ping);
    }
  }
}
