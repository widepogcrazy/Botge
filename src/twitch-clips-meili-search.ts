import type { MeiliSearch, EnqueuedTask, Index } from 'meilisearch';

const INDEX_NAME = 'twitchClips';

function getIndexName(guildId: string): string {
  return `${INDEX_NAME}_${guildId}`;
}

export class TwitchClipsMeiliSearch {
  readonly #meiliSearch: Readonly<MeiliSearch>;

  public constructor(meiliSearch: Readonly<MeiliSearch>) {
    this.#meiliSearch = meiliSearch;
  }

  public async getOrCreateIndex(guildId: string): Promise<Index | undefined> {
    const indexName = getIndexName(guildId);

    const createIndexEnqueuedTask: Readonly<EnqueuedTask> = await this.#meiliSearch.createIndex(indexName, {
      primaryKey: 'id'
    });
    await this.#meiliSearch.waitForTask(createIndexEnqueuedTask.taskUid);

    return await this.#meiliSearch.getIndex(indexName);
  }

  public deleteOldTwitchClipsIndex(): void {
    void this.#meiliSearch.deleteIndex(INDEX_NAME);
  }
}
