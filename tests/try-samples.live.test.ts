/** @format */

import { describe, test } from 'vitest';

import { scoreReplyOpportunity, generateReply } from 'src/api/ollama.ts';

// Live smoke samples — hits a real local Ollama to see what Botge actually
// says for a handful of inputs. Gated behind RUN_LIVE=1 so it does not run
// in the normal deterministic suite.
//
// Requirements:
//   - Ollama running at http://localhost:11434 (or OLLAMA_BASE_URL override)
//   - The chat model pulled (defaults to gemma3:27b; set OLLAMA_MODEL to override)
//
// Usage:
//   RUN_LIVE=1 npx vitest run tests/try-samples.live.test.ts --reporter=verbose
//
// RAG retrieval is skipped (no Chroma call) — pass-through generation only,
// with the most-recent buffer as the only context. That is enough to answer
// "does Botge's voice feel right?" without spinning up the full stack.

const SURROUNDING_CONTEXT: readonly string[] = [
  'alice: yo just woke up',
  'bob: same lmao',
  'carol: botge was acting weird earlier ngl',
  'alice: yeah like frozen mid-sentence'
] as const;

const SAMPLES: readonly string[] = [
  'botge how does it feel knowing you are being fixed by claude rn?',
  'Holy botge funny as af',
  'Botge, is gbob a weeb?',
  'hi botge, how was your day?'
] as const;

describe.runIf(process.env.RUN_LIVE === '1')('botge live sample replies', () => {
  for (const sample of SAMPLES) {
    test(
      sample,
      async () => {
        const history = [...SURROUNDING_CONTEXT, `user: ${sample}`].join('\n');

        console.log('\n══════════════════════════════════════════════════════════');
        console.log('INPUT:', sample);
        console.log('──────────────────────────────────────────────────────────');
        console.log('chat history fed to model:');
        console.log(history);
        console.log('──────────────────────────────────────────────────────────');

        const scoring = await scoreReplyOpportunity(history);
        console.log(`SCORE: ${scoring.score}/10   REASON: ${scoring.reason}`);

        const reply = await generateReply(history, []);
        console.log(`REPLY: ${reply}`);
        console.log('');
      },
      120_000
    );
  }
});
