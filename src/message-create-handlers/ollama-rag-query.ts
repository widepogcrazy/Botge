/** @format */

/**
 * Returns only the last 3 lines of the formatted chat history, so the RAG
 * query vector reflects the *current* moment rather than an averaged blur
 * of the whole 30-message buffer.
 *
 * If the input has 3 or fewer lines, returns it unchanged.
 * Empty input returns empty string.
 */
export function narrowRagQuery(recentHistory: string): string {
  if (recentHistory === '') return '';
  const lines = recentHistory.split('\n');
  if (lines.length <= 3) return recentHistory;
  return lines.slice(-3).join('\n');
}
