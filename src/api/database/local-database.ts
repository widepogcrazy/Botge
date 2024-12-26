import Database from 'better-sqlite3';

export class LocalDatabase {
  protected readonly database: Database.Database;

  protected constructor(filepath: string) {
    this.database = new Database(filepath);
    this.database.pragma('journal_mode = WAL');
  }

  public close(): void {
    this.database.close();
  }
}
