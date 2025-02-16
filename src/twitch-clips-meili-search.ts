import type { MeiliSearch, EnqueuedTask, Index } from 'meilisearch';

const INDEX_NAME = 'twitchClips';

function getIndexName(guildIds: readonly string[]): string {
  return `${INDEX_NAME}_${guildIds.join('_')}`;
}

export class TwitchClipsMeiliSearch {
  readonly #meiliSearch: Readonly<MeiliSearch>;

  public constructor(meiliSearch: MeiliSearch) {
    this.#meiliSearch = meiliSearch;
  }

  public async getOrCreateIndex(guildIds: readonly string[]): Promise<Index | undefined> {
    const indexName = getIndexName(guildIds);

    const createIndexEnqueuedTask: Readonly<EnqueuedTask> = await this.#meiliSearch.createIndex(indexName, {
      primaryKey: 'id'
    });
    await this.#meiliSearch.waitForTask(createIndexEnqueuedTask.taskUid);

    return await this.#meiliSearch.getIndex(indexName);
  }
}
