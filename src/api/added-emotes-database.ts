import Database from 'better-sqlite3';

import type { AddedEmote } from '../types.js';

const TABLE_NAME = 'addedEmotes';

function getTableName(guildId: string): string {
  return `${TABLE_NAME}_${guildId}`;
}

export class AddedEmotesDatabase {
  readonly #database: Database.Database;

  public constructor(filepath: string) {
    this.#database = new Database(filepath);
  }

  public insert(addedEmote: AddedEmote, guildId: string): void {
    const insert = this.#database.prepare(`INSERT INTO ${getTableName(guildId)} (url) VALUES (?)`);
    const { url } = addedEmote;

    insert.run(url);
  }

  public getAll(guildId: string): readonly AddedEmote[] {
    const select = this.#database.prepare(`SELECT url FROM ${getTableName(guildId)}`);
    const urls = select.all() as readonly AddedEmote[];

    return urls;
  }

  public createTable(guildId: string): void {
    const createTable = this.#database.prepare(`
      CREATE TABLE IF NOT EXISTS ${getTableName(guildId)} (
        url TEXT NOT NULL PRIMARY KEY
      );
    `);

    createTable.run();
  }

  public close(): void {
    this.#database.close();
  }
}
