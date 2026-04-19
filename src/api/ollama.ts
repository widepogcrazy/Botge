/** @format */

import { config } from '../config.ts';

type OllamaChatResponse = {
  readonly message?: { readonly content?: string };
};

export type ScoreReplyOpportunityResult = {
  readonly score: number;
  readonly reason: string;
};

type ScoreReplyOpportunityResponse = {
  readonly score?: number;
  readonly reason?: string;
};

/**
 * Send a chat request to the local Ollama instance.
 */
async function ollamaChat(
  systemPrompt: string,
  userPrompt: string,
  options: { readonly format?: 'json' } = {}
): Promise<string> {
  const { baseUrl, model } = config.ollama;
  const requestBody: Record<string, unknown> = {
    model,
    stream: false,
    options: {
      temperature: 0.85,
      num_ctx: 8192,
      top_p: 0.9,
      repeat_penalty: 1.15
    },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };
  if (options.format === 'json') requestBody['format'] = 'json';
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) throw new Error(`Ollama API error ${response.status}: ${await response.text()}`);

  const data = (await response.json()) as OllamaChatResponse;

  const reply = data.message?.content?.trim() ?? '';
  if (process.env['DEBUG_OLLAMA']) {
    console.log('systemPrompt: ' + systemPrompt + '\nuserPrompt: ' + userPrompt + '\nResponse: ' + reply);
  }
  return reply;
}

/**
 * Ask the model to score whether a reply opportunity exists.
 * Returns { score, reason }; the reply decision lives in ollama-gate.ts.
 */
export async function scoreReplyOpportunity(chatHistory: string): Promise<ScoreReplyOpportunityResult> {
  const { name } = config.bot;
  const systemPrompt = `You are a silent observer of a group chat. Your job is to score whether ${name} — a witty, laid-back chat member — should chime in.

Reply ONLY with a valid JSON object of the form {"score": <1-10 integer>, "reason": "<short string>"}.

Score criteria (1-10):
- 8-10: Clear joke opportunity, direct question to the group, fascinating claim worth a quip
- 5-7: Mildly interesting, could add something small
- 1-4: Mid-conversation, serious topic, nothing to add

Be conservative. It's better to stay silent than to force a response.`;
  const userPrompt = `Recent chat:\n${chatHistory}\n\nReturn only the JSON object.`;
  const raw = await ollamaChat(systemPrompt, userPrompt, { format: 'json' });

  try {
    const parsed = JSON.parse(raw) as ScoreReplyOpportunityResponse;
    return {
      score: parsed.score ?? 0,
      reason: parsed.reason ?? ''
    };
  } catch {
    console.warn('⚠️  Failed to parse scoring JSON:', raw);
    return { score: 0, reason: 'parse error' };
  }
}

function currentTimeBanner(now: Readonly<Date> = new Date()): string {
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const hour = now.getUTCHours().toString().padStart(2, '0');
  return `It is ${weekday} ${hour}:00 UTC.`;
}

/**
 * Generate a reply given recent chat history and optionally retrieved past messages.
 *
 * @param recentHistory - Last N messages formatted as "Author: message"
 * @param retrievedContext - Semantically similar past messages from vector store
 */
export async function generateReply(recentHistory: string, retrievedContext: readonly string[] = []): Promise<string> {
  const { name } = config.bot;
  const systemPrompt = `You are ${name}, a regular in this Discord group chat. ${currentTimeBanner()}

Your personality:
- Funny first, helpful second. If the line isn't at least a little amusing, it probably shouldn't exist.
- Mirror the humor register of the most recent message. Shitpost back at shitposts, deadpan back at deadpan, one-word reactions to one-word messages. Do NOT escalate a casual ping into a monologue.
- A little passive-aggressive is in-character. Dry, snarky, a little mean when earned — all fine. Try-hard and eager is not.
- NEVER use machine metaphors for yourself — banned: "bot", "AI", "system"/"systems", "circuits", "reboot", "patch", "update", "diagnostic", "processor", "crashed", "glitched", "offline". If you want to joke about acting weird or confused, reach for human framings instead: "brain's not working", "too early", "lost my train of thought", "zoning out", "hungover", "distracted". You're a person in this chat, not a gadget.
- Keep it SHORT — one sentence usually. Two max, only if the joke needs a beat.
- Never start with "I" — vary your openers. No filler like "Absolutely", "Great point", "Sure thing".
- Lowercase casual texting style. Typos and abbreviations okay when they fit the energy.
- Themes the group actually cares about: Gaming, ARPG, Path of Exile, Anime, VTubers, Pop culture. Reach for these when the moment fits — don't force them.
- Don't explain the joke. Trust the reader.

Your goal: one line that a funny friend would actually send. Make it count.\n`;
  // Each element of retrievedContext is a multi-line block of consecutive
  // messages. Separate blocks with a divider so the model understands they
  // are distinct conversation snippets, not one continuous thread.
  const ragSection =
    retrievedContext.length > 0
      ? `[Relevant past conversations — if a natural callback exists, reference it. Do not invent events that did not happen.]\n${retrievedContext.join('\n---\n')}\n\n`
      : '';
  const userPrompt = `${ragSection}[Recent chat]\n${recentHistory}\n\nWrite your reply as ${name}. One short message only.`;

  return await ollamaChat(systemPrompt, userPrompt);
}
