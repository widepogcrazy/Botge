export function hoursAndMinutesToMiliseconds(hours: number, minutes: number): number {
  return (hours * 60 + minutes) * 60 * 1000;
}

export function milisecondsToHoursAndMinutes(miliseconds: number): string {
  const hours = Math.floor(miliseconds / 3600000);
  const minutes = Math.floor((miliseconds % 3600000) / 60000);
  const hoursText = hours > 0 ? `${hours} hours and ` : '';
  const minutesText = hours === 0 && minutes === 0 ? 'less than a minute' : `${minutes} minute`;
  return `${hoursText}${minutesText}`;
}

export function getMessage(
  hours: number | undefined,
  minutes: number | undefined,
  message: string | undefined,
  userId: string
): string {
  let timeMessagePart = '';
  if (hours !== undefined && minutes !== undefined) {
    timeMessagePart = `${hours} hours and ${minutes} minutes`;
  } else if (hours !== undefined) {
    timeMessagePart = `${hours} hours`;
  } else {
    const minuteMessagePart = minutes === 1 ? 'minute' : 'minutes';
    timeMessagePart = `${minutes} ${minuteMessagePart}`;
  }
  const messageMessagePart = message !== undefined ? ` With the message: ${message}!` : '';

  return `You have been pinged <@${userId}>, after ${timeMessagePart}!${messageMessagePart}`;
}
