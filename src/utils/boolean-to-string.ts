const TRUE_STRING = 'Yes';
const FALSE_STRING = 'No';

const ALLOWED_TEXT = 'permitted';
const DISALLOWED_TEXT = 'not permitted';

export function booleanToPermittedOrNotPermitted(bool: boolean): string {
  if (bool) return ALLOWED_TEXT;
  return DISALLOWED_TEXT;
}

export function booleanToString(bool: boolean): string {
  if (bool) return TRUE_STRING;
  return FALSE_STRING;
}

export function stringToBoolean(bool: string): boolean {
  if (bool === TRUE_STRING) return true;
  return false;
}
