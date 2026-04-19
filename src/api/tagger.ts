/** @format */

import { config } from '../config.ts';

export const TAG_TAXONOMY: readonly string[] = [
  'anime',
  'vtuber',
  'poe',
  'gaming',
  'meme',
  'cat',
  'tech',
  'personal',
  'rant',
  'joke-setup',
  'link',
  'question',
  'serious',
  'meta'
] as const;

const MAX_TAGS = 3;

type OllamaChatResponse = {
  readonly message?: { readonly content?: string };
};

/**
 * Classify a single message with up to 3 tags from the closed taxonomy.
 * Uses Ollama's native JSON format for reliable parsing. Returns an empty
 * array on parse failure — tagging is best-effort, the ingest path must
 * not throw on a tagger hiccup.
 */
export async function tagMessage(text: string): Promise<readonly string[]> {
  const { baseUrl, taggerModel } = config.ollama;
  const systemPrompt = `You classify chat messages into up to 3 topic tags from a fixed list. Reply ONLY with a JSON array of strings.

Valid tags: ${TAG_TAXONOMY.join(', ')}.

Pick only tags that clearly apply. Fewer is fine. Never invent tags outside the list.`;

  const userPrompt = `Message: "${text}"\n\nReturn a JSON array of tags.`;

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: taggerModel,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    if (!res.ok) return [];
    const data = (await res.json()) as OllamaChatResponse;
    const raw = data.message?.content?.trim() ?? '';
    return parseTagArray(raw);
  } catch {
    return [];
  }
}

function parseTagArray(raw: string): readonly string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter((t): t is string => typeof t === 'string').filter((t) => TAG_TAXONOMY.includes(t));
    return valid.slice(0, MAX_TAGS);
  } catch {
    return [];
  }
}
