/** @format */

const lastReplyTime = new Map<string, number>();

/**
 * Whether the channel has posted a bot reply within the last `cooldownSeconds`.
 */
export function isOnCooldown(channelId: string, cooldownSeconds: number): boolean {
  const last = lastReplyTime.get(channelId) ?? 0;
  return (Date.now() - last) / 1000 < cooldownSeconds;
}

/**
 * Stamp a reply time for the channel. Call this ONLY after a reply is
 * successfully sent — not before evaluation.
 */
export function setLastReplyTime(channelId: string): void {
  lastReplyTime.set(channelId, Date.now());
}

/**
 * Test-only helper — clears all cooldown state. Not used by production code.
 */
export function resetCooldownForTesting(): void {
  lastReplyTime.clear();
}
