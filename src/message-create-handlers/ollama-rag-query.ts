/** @format */

type NarrowOptions = {
  readonly excludeAuthor?: string;
  readonly limit?: number;
};

const DEFAULT_LIMIT = 6;

/**
 * Narrow a formatted chat history down to the last `limit` lines for use as a
 * RAG query. Optionally filters out lines authored by `excludeAuthor` (useful
 * for excluding the bot's own past replies so the query reflects only what
 * the *humans* just said — avoids self-referential embedding).
 *
 * Lines are formatted as `${author}: ${content}`. A line is considered
 * authored by `excludeAuthor` if it starts with `${excludeAuthor}:`.
 *
 * If the filtered result has `limit` or fewer lines, returns all of them.
 * Empty input returns empty string.
 */
export function narrowRagQuery(recentHistory: string, options: NarrowOptions = {}): string {
  if (recentHistory === '') return '';
  const { excludeAuthor, limit = DEFAULT_LIMIT } = options;
  const lines = recentHistory.split('\n');
  const filtered = excludeAuthor !== undefined ? lines.filter((line) => !line.startsWith(`${excludeAuthor}:`)) : lines;
  if (filtered.length <= limit) return filtered.join('\n');
  return filtered.slice(-limit).join('\n');
}
