import Database from 'better-sqlite3';
const TABLE_NAME = 'settingsPermittedRoleIds';

function getTableName(guildIds: readonly string[]): string {
  return `${TABLE_NAME}_${guildIds.join('_')}`;
}

const SETTINGS_ID_TYPE = 'settingsType';
const ADD_EMOTE_ID_TYPE = 'addEmoteType';
const ROLE_IDS_SEPARATOR = ',';

export class PermittedRoleIdsDatabase {
  readonly #database: Database.Database;

  public constructor(filepath: string) {
    this.#database = new Database(filepath);
  }

  public changeSettingsPermittedRoleIds(guildIds: readonly string[], roleIds: readonly string[]): void {
    const tableName = getTableName(guildIds);
    this.#changePermittedRoleIds(tableName, SETTINGS_ID_TYPE, roleIds);
  }

  public changeAddEmotePermittedRoleIds(guildIds: readonly string[], roleIds: readonly string[]): void {
    const tableName = getTableName(guildIds);
    this.#changePermittedRoleIds(tableName, ADD_EMOTE_ID_TYPE, roleIds);
  }

  public changeAddEmotePermitNoRule(guildIds: readonly string[], permitNoRule: boolean): void {
    const tableName = getTableName(guildIds);
    this.#insertIfIdTypeDoesntExist(tableName, ADD_EMOTE_ID_TYPE, null, Number(permitNoRule));

    const update = this.#database.prepare(`UPDATE ${tableName} SET permitNoRule=(?) WHERE idType=(?)`);
    update.run(Number(permitNoRule), ADD_EMOTE_ID_TYPE);
    return;
  }

  public getSettingsPermittedRoleIds(guildIds: readonly string[]): readonly string[] | null {
    const tableName = getTableName(guildIds);

    if (!this.#idTypeExists(tableName, SETTINGS_ID_TYPE)) return null;
    return this.#getRoleIds(tableName, SETTINGS_ID_TYPE);
  }

  public getAddEmotePermittedRoleIds(guildIds: readonly string[]): readonly string[] | null {
    const tableName = getTableName(guildIds);

    if (!this.#idTypeExists(tableName, ADD_EMOTE_ID_TYPE)) return null;
    return this.#getRoleIds(tableName, ADD_EMOTE_ID_TYPE);
  }

  public getAddEmotePermitNoRule(guildIds: readonly string[]): boolean {
    const tableName = getTableName(guildIds);
    if (!this.#idTypeExists(tableName, ADD_EMOTE_ID_TYPE)) return false;

    const { permitNoRule } = this.#database
      .prepare(`SELECT permitNoRule FROM ${tableName} WHERE idType=(?)`)
      .get(ADD_EMOTE_ID_TYPE) as {
      permitNoRule: number;
    };
    return Boolean(permitNoRule);
  }

  public createTable(guildIds: readonly string[]): void {
    const tableName = getTableName(guildIds);

    const createTable = this.#database.prepare(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        idType TEXT NOT NULL PRIMARY KEY,
        roleIds TEXT,
        permitNoRule INTEGER NOT NULL
      );
    `);
    createTable.run();
  }

  public close(): void {
    this.#database.close();
  }

  #idTypeExists(tableName: string, idType: string): boolean {
    const idTypeExists_ = this.#database.prepare(`SELECT idType FROM ${tableName} WHERE idType=(?)`).get(idType) as
      | string
      | undefined;

    if (idTypeExists_ === undefined) return false;
    return true;
  }

  #insertIfIdTypeDoesntExist(tableName: string, idType: string, roleIds: string | null, permitNoRule: number): void {
    if (this.#idTypeExists(tableName, idType)) return;

    const insert = this.#database.prepare(`INSERT INTO ${tableName} (idType,roleIds,permitNoRule) VALUES (?,?,?)`);
    insert.run(idType, roleIds, permitNoRule);
  }

  #changePermittedRoleIds(tableName: string, idType: string, roleIds: readonly string[]): void {
    const roleIdsJoined = roleIds.length !== 0 ? roleIds.join(ROLE_IDS_SEPARATOR) : null;

    this.#insertIfIdTypeDoesntExist(tableName, idType, roleIdsJoined, Number(false));

    const update = this.#database.prepare(`UPDATE ${tableName} SET roleIds=(?) WHERE idType=(?)`);
    update.run(roleIdsJoined, idType);
  }

  #getRoleIds(tableName: string, idType: string): readonly string[] | null {
    const { roleIds } = this.#database.prepare(`SELECT roleIds FROM ${tableName} WHERE idType=(?)`).get(idType) as {
      roleIds: string | null;
    };

    if (roleIds !== null) return roleIds.split(ROLE_IDS_SEPARATOR);
    return null;
  }
}
