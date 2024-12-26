import type { Index } from 'meilisearch';
import type { EmoteMatcher } from './emoteMatcher.js';
import { newEmoteMatcher } from './utils/constructors/new-emote-matcher.js';
import type { PersonalEmoteEndpoints } from './paths-and-endpoints.js';
import {
  getClipsWithGameNameFromIds,
  getClipsWithGameNameFromBroadcasterName,
  type TwitchApi
} from './api/twitch-api.js';
import type { AddedEmotesDatabase } from './api/database/added-emotes-database.js';
import { listClipIds } from './utils/list-clip-ids.js';

export const GUILD_ID_CUTEDOG = '251211223012474880';
export const GUILD_ID_ELLY = '1265071702812135424';
export const BROADCASTER_NAME_CUTEDOG = 'Cutedog_';
export const BROADCASTER_NAME_ELLY = 'Elly';

export class Guild {
  public readonly id: string;
  private readonly _broadcasterName: string;
  private readonly _personalEmoteEndpoints: PersonalEmoteEndpoints;
  private _emoteMatcher: Readonly<EmoteMatcher>;
  private readonly _twitchClipsMeiliSearchIndex: Index | undefined;

  public constructor(
    id: string,
    broadcasterName: string,
    personalEmoteEndpoints: PersonalEmoteEndpoints,
    emoteMatcher: Readonly<EmoteMatcher>,
    twitchClipsMeiliSearchIndex: Index | undefined
  ) {
    this.id = id;
    this._broadcasterName = broadcasterName;
    this._personalEmoteEndpoints = personalEmoteEndpoints;
    this._emoteMatcher = emoteMatcher;
    this._twitchClipsMeiliSearchIndex = twitchClipsMeiliSearchIndex;
  }

  public async refreshEmotes(
    twitchApi: Readonly<TwitchApi> | undefined,
    addedEmotesDatabase: Readonly<AddedEmotesDatabase>
  ): Promise<void> {
    this._emoteMatcher = await newEmoteMatcher(
      this.id,
      this._personalEmoteEndpoints,
      twitchApi?.isValidated() === true ? twitchApi : undefined,
      addedEmotesDatabase
    );

    return;
  }

  public async refreshClips(twitchApi: Readonly<TwitchApi> | undefined): Promise<void> {
    if (this._twitchClipsMeiliSearchIndex === undefined || twitchApi === undefined) return;
    if (!twitchApi.isValidated()) return;

    let updated = 0;

    if (this.id === GUILD_ID_CUTEDOG) {
      const increment = 100;
      const clipIds = await listClipIds();
      for (let i = 0; i < clipIds.length; i += increment) {
        const clips = await getClipsWithGameNameFromIds(twitchApi, clipIds.slice(i, i + increment));
        void this._twitchClipsMeiliSearchIndex.updateDocuments(clips);
        updated += clips.length;
      }
    } else {
      let [clips, cursor] = await getClipsWithGameNameFromBroadcasterName(twitchApi, this._broadcasterName);
      void this._twitchClipsMeiliSearchIndex.updateDocuments(clips);

      for (let i = 0; i < 9 && cursor !== undefined; i++) {
        [clips, cursor] = await getClipsWithGameNameFromBroadcasterName(twitchApi, this._broadcasterName, cursor);
        void this._twitchClipsMeiliSearchIndex.updateDocuments(clips);
        updated += clips.length;
      }
    }

    console.log(`Updated ${updated} clips.`);
    return;
  }

  public getEmoteMatcher(): Readonly<EmoteMatcher> {
    return this._emoteMatcher;
  }

  public getTwitchClipsMeiliSearchIndex(): Index | undefined {
    return this._twitchClipsMeiliSearchIndex;
  }
}
