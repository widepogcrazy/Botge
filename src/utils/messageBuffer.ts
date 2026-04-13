/** @format */

import { config } from '../config.js';

const { contextWindow } = config.behavior;

type BufferEntry = { author: string; content: string; timestamp: string };

// Map of channelId → array of message objects
const buffers = new Map<string, BufferEntry[]>();

/**
 * Add a message to a channel's rolling buffer.
 */
export function addMessage(channelId: string, author: string, content: string): void {
  const buffer = buffers.get(channelId) ?? [];
  buffer.push({ author, content, timestamp: new Date().toISOString() });

  if (buffer.length > contextWindow) {
    buffer.splice(0, buffer.length - contextWindow);
  }

  buffers.set(channelId, buffer);
}

/**
 * Format a channel's chat history as a readable string for the prompt.
 */
export function getFormattedHistory(channelId: string): string {
  const buffer = buffers.get(channelId) ?? [];
  return buffer.map((msg: Readonly<BufferEntry>) => `${msg.author}: ${msg.content}`).join('\n');
}

/**
 * How many messages are buffered for a channel.
 */
export function getBufferSize(channelId: string): number {
  return buffers.get(channelId)?.length ?? 0;
}
