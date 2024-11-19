import { existsSync } from 'fs';
import { ensureFileSync } from 'fs-extra';
import { writeFile, readFile } from 'node:fs/promises';

async function readEmotes(filepath: string): Promise<string[]> {
  const exists = existsSync(filepath);
  if (!exists) {
    throw new Error(filepath + ' does not exist.');
  }
  const emotes = (await JSON.parse((await readFile(filepath)).toString())) as string[];
  return emotes;
}

export class FileEmoteDb {
  private readonly path: string;
  private content: string[];

  constructor(path: string, content: string[]) {
    const exists: boolean = existsSync(path);
    if (!exists) ensureFileSync(path);
    this.path = path;
    this.content = content;
  }

  getAll(): string[] {
    return this.content;
  }

  async add(url: string) {
    this.content.push(url);
    await writeFile(this.path, JSON.stringify(this.content));
  }
}

export async function createFileEmoteDbConnection(path: string) {
  return new FileEmoteDb(path, await readEmotes(path));
}
