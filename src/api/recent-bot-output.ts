/** @format */

import { embed } from './ollama-embed.ts';

type RecentEntry = {
  readonly text: string;
  readonly embedding: readonly number[];
};

const MAX_ENTRIES_PER_CHANNEL = 20;
const buffers = new Map<string, RecentEntry[]>();

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Record a bot output for the channel. Embeds the text once on insert so
 * later similarity checks are fast. Evicts oldest entries past the 20-per-channel cap.
 */
export async function addBotOutput(channelId: string, text: string): Promise<void> {
  const embedding = await embed(text);
  const buffer = buffers.get(channelId) ?? [];
  buffer.push({ text, embedding });
  if (buffer.length > MAX_ENTRIES_PER_CHANNEL) {
    buffer.splice(0, buffer.length - MAX_ENTRIES_PER_CHANNEL);
  }
  buffers.set(channelId, buffer);
}

/**
 * Check whether `candidate` is cosine-similar to any of the stored recent
 * outputs in the channel, above the given threshold.
 */
export async function isCosineSimilarToRecent(
  channelId: string,
  candidate: string,
  threshold: number
): Promise<boolean> {
  const buffer = buffers.get(channelId);
  if (buffer === undefined || buffer.length === 0) return false;
  const candidateEmbedding = await embed(candidate);
  return buffer.some((entry) => cosineSimilarity(entry.embedding, candidateEmbedding) >= threshold);
}

/**
 * Test-only helper — clears all per-channel buffers.
 */
export function resetRecentBotOutputForTesting(): void {
  buffers.clear();
}
