import type { MeiliSearch, Index } from 'meilisearch';

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

    await this.#meiliSearch
      .createIndex(indexName, {
        primaryKey: 'id'
      })
      .waitTask();

    const index = await this.#meiliSearch.getIndex(indexName);
    return index;
  }
}
