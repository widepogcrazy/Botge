import { existsSync, writeFileSync } from 'fs';
import { ensureFileSync } from 'fs-extra';
import { writeFile, readFile } from 'node:fs/promises';

async function readEmotes(filepath: string): Promise<readonly string[]> {
  const exists = existsSync(filepath);
  if (!exists) throw new Error(filepath + ' does not exist.');

  const emotes: readonly string[] = (await JSON.parse((await readFile(filepath)).toString())) as readonly string[];
  return emotes;
}

export class FileEmoteDb {
  private readonly path: string;
  private readonly content: string[];

  public constructor(path: string, content: readonly string[]) {
    this.path = path;
    this.content = [...content];
  }

  public getAll(): readonly string[] {
    return this.content;
  }

  public async add(url: string): Promise<void> {
    this.content.push(url);
    await writeFile(this.path, JSON.stringify(this.content));
  }
}

export async function createFileEmoteDbConnection(path: string): Promise<Readonly<FileEmoteDb>> {
  const exists: boolean = existsSync(path);
  if (!exists) {
    ensureFileSync(path);
    writeFileSync(path, '[]');
  }

  return new FileEmoteDb(path, await readEmotes(path));
}
