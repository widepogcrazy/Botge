import type { Database } from 'better-sqlite3';

export function renameTable(tableName: string, database: Readonly<Database>): void {
  const oldTableName = `${tableName}_251211223012474880_981663968437358622`;
  const newTableName = `${tableName}_251211223012474880`;

  const tableExists_ = database.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=(?)`);
  const tableExistsOld = tableExists_.get(oldTableName);
  const tableExistsNew = tableExists_.get(newTableName);
  if (tableExistsOld === undefined || tableExistsNew !== undefined) {
    return;
  }

  const renameTable_ = database.prepare(`ALTER TABLE ${oldTableName} RENAME TO ${newTableName}`);
  renameTable_.run();
}
