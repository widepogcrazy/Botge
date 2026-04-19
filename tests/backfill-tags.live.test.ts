/** @format */

import { describe, test, expect } from 'vitest';

// Live backfill of topic tags for existing Chroma entries.
//
// Runs against a real Chroma + Ollama. Walks every message in the collection
// that has no `tags` metadata (or empty tags) and tags it using the configured
// TAGGER_MODEL. Idempotent — re-running after completion is a no-op.
//
// Usage:
//   RUN_BACKFILL=1 npx vitest run tests/backfill-tags.live.test.ts --reporter=verbose
//
// Requirements:
//   - Chroma running at $CHROMA_URL (default http://chromadb:8000)
//   - Ollama running with $TAGGER_MODEL pulled (default llama3.2:3b)

describe.runIf(process.env.RUN_BACKFILL === '1')('backfill topic tags for existing chroma entries', () => {
  test('walk the collection, tag any entry without tags, upsert in place', async () => {
    const { getCollectionForTesting } = await import('src/api/vector-store.ts');
    const { tagMessage } = await import('src/api/tagger.ts');

    const collection = await getCollectionForTesting();
    const total = await collection.count();
    console.log(`Total entries in collection: ${total}`);

    if (total === 0) {
      console.log('Collection is empty — nothing to backfill.');
      return;
    }

    const batchSize = 50;
    let offset = 0;
    let tagged = 0;
    let skipped = 0;

    while (offset < total) {
      const batch = await collection.get({
        limit: batchSize,
        offset,
        include: ['documents', 'metadatas', 'embeddings']
      });

      for (let i = 0; i < batch.ids.length; i++) {
        const id = batch.ids[i];
        const doc = batch.documents[i];
        const meta = batch.metadatas[i];
        const existingTags = (meta?.['tags'] as string | undefined) ?? '';

        if (existingTags.length > 0) {
          skipped++;
          continue;
        }

        if (doc === null) {
          skipped++;
          continue;
        }

        // doc is formatted "author: content" — tagger sees the content half
        const content = doc.includes(': ') ? doc.slice(doc.indexOf(': ') + 2) : doc;
        const tags = await tagMessage(content);
        const tagsString = tags.length > 0 ? tags.join(',') : '';

        await collection.upsert({
          ids: [id],
          metadatas: [{ ...meta, tags: tagsString }]
        });

        tagged++;
        if (tagged % 10 === 0) console.log(`Tagged ${tagged} / ${total - skipped} remaining...`);
      }

      offset += batchSize;
    }

    console.log(`Backfill complete: ${tagged} tagged, ${skipped} already-tagged or empty-doc, ${total} total.`);
    expect(tagged + skipped).toBe(total);
  }, 600_000); // 10 minute timeout for long runs
});
