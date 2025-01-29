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
    const insert = this.#database.prepare(`INSERT INTO ${getTableName(guildIds)} (url,alias) VALUES (?,?)`);
    const { url, alias } = addedEmote;
    insert.run(url, alias);
  }

  public getAll(guildIds: readonly string[]): readonly AddedEmote[] {
    const select = this.#database.prepare(`SELECT url FROM ${getTableName(guildIds)}`);
    const urls = select.all() as readonly AddedEmote[];

    return urls;
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
