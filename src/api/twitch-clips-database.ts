import type { TwitchClip } from '../types.js';
import { LocalDatabase } from './local-database.js';

export class TwitchClipsDatabase extends LocalDatabase {
  public constructor(filepath: string) {
    super(filepath);

    this.createTable();
  }

  public insert(twitchClips: readonly TwitchClip[]): void {
    const insert = this.database.prepare(
      `INSERT OR IGNORE INTO twitchClips (url, creator_name, game_id, title) VALUES (?, ?, ?, ?)`
    );

    this.database.transaction((): void => {
      twitchClips.forEach((twitchClip) => {
        const { url, creator_name, game_id, title } = twitchClip;
        insert.run(url, creator_name, game_id, title);
      });

      this.deleteDifference(twitchClips);
    })();
  }

  public getByTitle(title: string): readonly TwitchClip[] {
    const select = this.database.prepare(
      `SELECT url, creator_name, game_id, title FROM twitchClips WHERE title LIKE ?`
    );
    const twitchClips = select.all(`%${title}%`) as readonly TwitchClip[];

    return twitchClips;
  }

  private getAllUrls(): readonly string[] {
    const select = this.database.prepare(`SELECT url FROM twitchClips`);
    const twitchClipUrls = select.all() as readonly { readonly url: string }[];
    const twitchClipUrlsMapped: readonly string[] = twitchClipUrls.map((twitchClipUrl) => twitchClipUrl.url);

    return twitchClipUrlsMapped;
  }

  private deleteDifference(twitchClips: readonly TwitchClip[]): void {
    const select = this.database.prepare(`DELETE FROM twitchClips WHERE url = ?`);

    const twitchClipUrls1 = this.getAllUrls();
    const twitchClipUrls2: readonly string[] = twitchClips.map((twitchClip) => twitchClip.url);
    const difference = twitchClipUrls1.filter((twitchClipUrl1) => !twitchClipUrls2.includes(twitchClipUrl1));

    this.database.transaction((): void => {
      difference.forEach((diff) => {
        select.run(diff);
      });
    })();
  }

  private createTable(): void {
    const createTable = this.database.prepare(`
      CREATE TABLE IF NOT EXISTS twitchClips (
        url TEXT NOT NULL PRIMARY KEY,
        creator_name TEXT NOT NULL,
        game_id INTEGER NOT NULL,
        title TEXT NOT NULL
      );
    `);

    createTable.run();
  }
}
