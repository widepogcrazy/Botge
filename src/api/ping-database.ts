import Database from 'better-sqlite3';

import type { Ping } from '../types.js';

const TABLE_NAME = 'pings';

function getId(ping: Ping): string {
  return `${ping.time}_${ping.userId}_${ping.channelId}`;
}

export class PingsDatabase {
  readonly #database: Database.Database;

  public constructor(filepath: string) {
    this.#database = new Database(filepath);
    this.#createTable();
  }

  public insert(ping: Ping): void {
    const insert = this.#database.prepare(
      `INSERT INTO ${TABLE_NAME} (id,time,hours,minutes,userId,channelId,message) VALUES (?,?,?,?,?,?,?)`
    );
    const { time, hours, minutes, userId, channelId, message } = ping;
    insert.run(getId(ping), time, hours, minutes, userId, channelId, message);
  }

  public delete(ping: Ping): void {
    const del = this.#database.prepare(`DELETE FROM ${TABLE_NAME} WHERE id=(?)`);
    del.run(getId(ping));
  }

  public getAll(): readonly Ping[] {
    const select = this.#database.prepare(`SELECT time,hours,minutes,userId,channelId,message FROM ${TABLE_NAME}`);
    const pings = select.all() as readonly Ping[];

    return pings;
  }

  public close(): void {
    this.#database.close();
  }

  #createTable(): void {
    const createTable = this.#database.prepare(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id TEXT NOT NULL PRIMARY KEY,
        time INTEGER NOT NULL,
        hours INTEGER,
        minutes INTEGER,
        userId TEXT NOT NULL,
        channelId TEXT NOT NULL,
        message TEXT
      );
    `);

    createTable.run();
  }
}
