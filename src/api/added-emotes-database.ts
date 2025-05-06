import Database from 'better-sqlite3';

import type { AddedEmote } from '../types.js';

const TABLE_NAME = 'addedEmotes';

function getTableName(guildIds: readonly string[]): string {
  return `${TABLE_NAME}_${guildIds.join('_')}`;
}

export class AddedEmotesDatabase {
  readonly #database: Database.Database;

  public constructor(filepath: string) {
    this.#database = new Database(filepath);
  }

  public insert(addedEmote: AddedEmote, guildIds: readonly string[]): void {
    const { url, alias } = addedEmote;

    const prepare_ = this.#database.prepare(`INSERT INTO ${getTableName(guildIds)} (url,alias) VALUES (?,?)`);
    prepare_.run(url, alias);
  }

  public delete(addedEmote: AddedEmote, guildIds: readonly string[]): void {
    const { url, alias } = addedEmote;

    const prepare_ = this.#database.prepare(
      `DELETE FROM ${getTableName(guildIds)} WHERE url=(?) AND (alias=(?) OR alias IS NULL)`
    );
    prepare_.run(url, alias);
  }

  public getAll(guildIds: readonly string[]): readonly AddedEmote[] {
    const select = this.#database.prepare(`SELECT url,alias FROM ${getTableName(guildIds)}`);
    const addedEmotes = select.all() as readonly AddedEmote[];

    return addedEmotes;
  }

  public createTable(guildIds: readonly string[]): void {
    const tableName = getTableName(guildIds);

    const createTable = this.#database.prepare(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        url TEXT NOT NULL PRIMARY KEY,
        alias TEXT
      );
    `);

    createTable.run();
  }

  public close(): void {
    this.#database.close();
  }
}
