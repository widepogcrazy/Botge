/** @format */

import { describe, test } from 'vitest';

// Offline replay harness — loads a real chat window from Chroma ending at a
// specified trigger message, runs the full Phase 1 pipeline offline, and
// prints what Botge would have said. Gated by RUN_REPLAY=1 so it does not
// run in the deterministic suite.
//
// Usage:
//   RUN_REPLAY=1 REPLAY_CHANNEL=<channelId> REPLAY_MESSAGE_ID=<msgId> npx vitest run tests/replay-harness.live.test.ts --reporter=verbose
//
// Window: the 30 messages immediately preceding (and including) REPLAY_MESSAGE_ID, ordered by seqNum.
//
// Requirements:
//   - Chroma running at $CHROMA_URL, populated by prior ingest
//   - Ollama running with $OLLAMA_MODEL pulled (defaults to gemma3:27b)

describe.runIf(process.env.RUN_REPLAY === '1')('botge offline replay', () => {
  test('replay the window ending at REPLAY_MESSAGE_ID and print the reply it would have made', async () => {
    const channelId = process.env.REPLAY_CHANNEL;
    const messageId = process.env.REPLAY_MESSAGE_ID;
    if (channelId === undefined || messageId === undefined) {
      console.error('Set REPLAY_CHANNEL and REPLAY_MESSAGE_ID env vars.');
      throw new Error('missing env vars');
    }

    const { getCollectionForTesting, findSimilarWithContext } = await import('src/api/vector-store.ts');
    const { generateReply } = await import('src/api/ollama.ts');
    const { applyReplyEditor } = await import('src/api/reply-editor.ts');
    const { narrowRagQuery } = await import('src/message-create-handlers/ollama-rag-query.ts');
    const { config } = await import('src/config.ts');

    const collection = await getCollectionForTesting();

    // 1. Find the trigger message's seqNum to anchor the window.
    const anchor = await collection.get({ ids: [messageId], include: ['metadatas'] });
    const anchorMeta = anchor.metadatas?.[0];
    if (anchorMeta === null || anchorMeta === undefined) {
      console.error(`Trigger message ${messageId} not found in collection.`);
      throw new Error('trigger not found');
    }
    const anchorSeq = anchorMeta['seqNum'] as number;
    const windowSize = 30;
    const loSeq = Math.max(1, anchorSeq - windowSize + 1);

    // 2. Fetch the 30-message window by seqNum range.
    const windowResult = await collection.get({
      where: {
        $and: [{ channelId: { $eq: channelId } }, { seqNum: { $gte: loSeq } }, { seqNum: { $lte: anchorSeq } }]
      },
      include: ['documents', 'metadatas']
    });

    const paired = windowResult.documents
      .map((doc: string | null, i: number) => ({
        doc,
        seq: (windowResult.metadatas[i]?.['seqNum'] as number | undefined) ?? 0
      }))
      .filter((p: { doc: string | null; seq: number }) => p.doc !== null)
      .sort((a: { doc: string | null; seq: number }, b: { doc: string | null; seq: number }) => a.seq - b.seq);

    const recentHistory = paired.map((p: { doc: string | null; seq: number }) => p.doc).join('\n');

    console.log('\n══════════════════════════════════════════════════════════');
    console.log(`REPLAY: channel=${channelId} trigger=${messageId} window=${paired.length} msgs`);
    console.log('──────────────────────────────────────────────────────────');
    console.log('history (seqNum order):');
    console.log(recentHistory);
    console.log('──────────────────────────────────────────────────────────');

    // 3. Retrieve RAG context using the same narrowing as production.
    const retrieved = await findSimilarWithContext(
      narrowRagQuery(recentHistory, { excludeAuthor: config.bot.name, limit: 6 }),
      channelId,
      config.behavior.ragResults,
      config.behavior.ragWindowSize
    );
    console.log(`retrieved ${retrieved.length} RAG blocks`);

    // 4. Generate.
    const rawReply = await generateReply(recentHistory, retrieved);
    console.log(`rawReply: ${rawReply}`);

    // 5. Edit.
    const edited = await applyReplyEditor(rawReply, channelId);
    if (edited.accepted) {
      console.log(`FINAL: ${edited.text}`);
    } else {
      console.log(`EDITOR REJECTED: ${edited.reason}`);
    }
    console.log('');
  }, 180_000);
});
