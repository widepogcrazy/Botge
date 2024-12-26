import type { AddedEmote } from '../../types.js';
import { LocalDatabase } from './local-database.js';

const TABLE_NAME = 'addedEmotes';

function getTableName(guildId: string): string {
  return `${TABLE_NAME}_${guildId}`;
}

export class AddedEmotesDatabase extends LocalDatabase {
  public constructor(filepath: string) {
    super(filepath);

    this.renameAddedEmotesTable();
  }

  public insert(addedEmote: AddedEmote, guildId: string): void {
    const insertTransaction = this.database.transaction(() => {
      this.createTable(guildId);

      const insert = this.database.prepare(`INSERT INTO ${getTableName(guildId)} (url) VALUES (?)`);
      const { url } = addedEmote;

      insert.run(url);
    });

    insertTransaction();
  }

  public getAll(guildId: string): readonly AddedEmote[] {
    const getAllTranscation = this.database.transaction(() => {
      this.createTable(guildId);

      const select = this.database.prepare(`SELECT url FROM ${getTableName(guildId)}`);
      const urls = select.all() as readonly AddedEmote[];

      return urls;
    });

    return getAllTranscation();
  }

  private createTable(guildId: string): void {
    const createTable = this.database.prepare(`
      CREATE TABLE IF NOT EXISTS ${getTableName(guildId)} (
        url TEXT NOT NULL PRIMARY KEY
      );
    `);

    createTable.run();
  }

  private renameAddedEmotesTable(): void {
    //migrate old cutedog emotes to new table

    const exists = this.database.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='addedEmotes'`);
    const existsResult = exists.get();
    if (existsResult === undefined) return; //doesnt exist

    const exists2 = this.database.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='addedEmotes_251211223012474880'`
    );
    const existsResult2 = exists2.get();
    if (existsResult2 !== undefined) return; //exists

    const rename = this.database.prepare(`ALTER TABLE addedEmotes RENAME TO addedEmotes_251211223012474880`);
    rename.run();
  }
}
