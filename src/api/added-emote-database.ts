import Database from 'better-sqlite3';

import type { AddedEmote } from '../types.js';

class LocalDatabase {
  protected readonly database: Database.Database;
  protected constructor(filepath: string) {
    this.database = new Database(filepath);
    this.database.pragma('journal_mode = WAL');
  }

  public close(): void {
    this.database.close();
  }
}

export class AddedEmotesDatabase extends LocalDatabase {
  public constructor(filepath: string) {
    super(filepath);

    this.createTable();
  }

  public insert(addedEmote: AddedEmote): void {
    const insert = this.database.prepare('INSERT INTO addedEmotes (url) VALUES (?)');
    const { url } = addedEmote;

    insert.run(url);
  }

  public getAll(): readonly AddedEmote[] {
    const select = this.database.prepare(`SELECT url FROM addedEmotes`);
    const urls = select.all() as readonly AddedEmote[];

    return urls;
  }

  private createTable(): void {
    const createTable = this.database.prepare(`
      CREATE TABLE IF NOT EXISTS addedEmotes (
        url TEXT NOT NULL PRIMARY KEY
      );
    `);

    createTable.run();
  }
}
