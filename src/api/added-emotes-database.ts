import Database from 'better-sqlite3';

import type { AddedEmote } from '../types.js';

const TABLE_NAME = 'addedEmotes';

function getTableName(guildIds: readonly string[]): string {
  return `${TABLE_NAME}_${guildIds.join('_')}`;
}

type ColumCountResult = {
  readonly COLUMNCOUNT: number;
};

export class AddedEmotesDatabase {
  readonly #database: Database.Database;

  public constructor(filepath: string) {
    this.#database = new Database(filepath);

    this.#renameOldTable();
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

    const exists = this.#database.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
    const existsResult = exists.get();

    if (existsResult !== undefined) {
      //exists
      const columnCount = this.#database.prepare(
        `SELECT COUNT(*) AS COLUMNCOUNT FROM pragma_table_info('${tableName}') WHERE name='alias'`
      );
      const columnCountResult = columnCount.get() as ColumCountResult;

      if (columnCountResult.COLUMNCOUNT === 0) {
        const addColumn = this.#database.prepare(`ALTER TABLE ${tableName} ADD COLUMN alias TEXT`);
        addColumn.run();
      }
    } else {
      //doesnt exist
      const createTable = this.#database.prepare(`
        CREATE TABLE ${tableName} (
          url TEXT NOT NULL PRIMARY KEY,
          alias TEXT
        );
      `);

      createTable.run();
    }
  }

  public close(): void {
    this.#database.close();
  }

  #renameOldTable(): void {
    //migrate old cutedog added emotes to new table
    const exists = this.#database.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='addedEmotes_251211223012474880'`
    );
    const existsResult = exists.get();
    if (existsResult === undefined) return; //doesnt exist

    const exists2 = this.#database.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='addedEmotes_251211223012474880_981663968437358622'`
    );
    const existsResult2 = exists2.get();
    if (existsResult2 !== undefined) return; //exists

    const rename = this.#database.prepare(
      `ALTER TABLE addedEmotes_251211223012474880 RENAME TO addedEmotes_251211223012474880_981663968437358622`
    );
    rename.run();
  }
}
