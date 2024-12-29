import type { MeiliSearch, EnqueuedTask, Index } from 'meilisearch';

const INDEX_NAME = 'twitchClips';

function getIndexName(guildId: string): string {
  return `${INDEX_NAME}_${guildId}`;
}

export class TwitchClipsMeiliSearch {
  private readonly _meiliSearch: Readonly<MeiliSearch>;

  public constructor(meiliSearch: Readonly<MeiliSearch>) {
    this._meiliSearch = meiliSearch;
  }

  public async getOrCreateIndex(guildId: string): Promise<Index | undefined> {
    const indexName = getIndexName(guildId);

    const createIndexEnqueuedTask: Readonly<EnqueuedTask> = await this._meiliSearch.createIndex(indexName, {
      primaryKey: 'id'
    });
    await this._meiliSearch.waitForTask(createIndexEnqueuedTask.taskUid);

    return await this._meiliSearch.getIndex(indexName);
  }

  public deleteOldTwitchClipsIndex(): void {
    void this._meiliSearch.deleteIndex(INDEX_NAME);
  }
}
