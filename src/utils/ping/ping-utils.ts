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

export function getTimeMessagePart(hours: number | undefined, minutes: number | undefined): string {
  if (hours !== undefined && minutes !== undefined) {
    return `${hours} hours and ${minutes} minutes`;
  } else if (hours !== undefined) {
    return `${hours} hours`;
  } else {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
}

export function getMessageMessagePart(message: string | undefined): string {
  return message !== undefined ? ` With the message: ${message}` : '';
}

export function getMessage(
  hours: number | undefined,
  minutes: number | undefined,
  message: string | undefined,
  userId: string
): string {
  return `You have been pinged <@${userId}>, after ${getTimeMessagePart(hours, minutes)}!${getMessageMessagePart(message)}`;
}
