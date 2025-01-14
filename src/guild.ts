import type { Index } from 'meilisearch';

import { GUILD_ID_CUTEDOG } from './guilds.js';
import type { EmoteMatcher } from './emote-matcher.js';
import type { PersonalEmoteMatcherConstructor } from './emote-matcher-constructor.js';
import type { TwitchApi } from './api/twitch-api.js';
import { listCutedogClipIds } from './utils/list-cutedog-clip-ids.js';
import { getClipsWithGameNameFromBroadcasterName, getClipsWithGameNameFromIds } from './utils/twitch-api-utils.js';

export class Guild {
  public readonly ids: readonly string[];
  readonly #broadcasterName: string | undefined;
  #emoteMatcher: Readonly<EmoteMatcher>;
  readonly #twitchClipsMeiliSearchIndex: Index | undefined;
  readonly #personalEmoteMatcherConstructor: Readonly<PersonalEmoteMatcherConstructor>;

  public constructor(
    ids: readonly string[],
    broadcasterName: string | undefined,
    twitchClipsMeiliSearchIndex: Index | undefined,
    emoteMatcher: Readonly<EmoteMatcher>,
    emoteMatcherConstructor: Readonly<PersonalEmoteMatcherConstructor>
  ) {
    this.ids = ids;
    this.#broadcasterName = broadcasterName;
    this.#twitchClipsMeiliSearchIndex = twitchClipsMeiliSearchIndex;
    this.#emoteMatcher = emoteMatcher;
    this.#personalEmoteMatcherConstructor = emoteMatcherConstructor;
  }

  public get emoteMatcher(): Readonly<EmoteMatcher> {
    return this.#emoteMatcher;
  }
  public get twitchClipsMeiliSearchIndex(): Index | undefined {
    return this.#twitchClipsMeiliSearchIndex;
  }
  public get personalEmoteMatcherConstructor(): Readonly<PersonalEmoteMatcherConstructor> {
    return this.#personalEmoteMatcherConstructor;
  }

  public async refreshEmoteMatcher(): Promise<void> {
    this.#emoteMatcher = await this.#personalEmoteMatcherConstructor.constructEmoteMatcher();
  }

  public async refreshClips(twitchApi: Readonly<TwitchApi> | undefined): Promise<void> {
    if (this.#twitchClipsMeiliSearchIndex === undefined || twitchApi === undefined) return;
    if (this.#broadcasterName === undefined) return;

    let updated = 0;

    if (this.ids.some((id) => id === GUILD_ID_CUTEDOG)) {
      //custom clips
      const increment = 100;
      const clipIds = await listCutedogClipIds();

      for (let i = 0; i < clipIds.length; i += increment) {
        const clips = await getClipsWithGameNameFromIds(twitchApi, clipIds.slice(i, i + increment));

        void this.#twitchClipsMeiliSearchIndex.updateDocuments(clips);
        updated += clips.length;
      }
    } else {
      //get top 1000 most viewed clips
      let getClipsWithGameNameFromBroadcasterName_ = await getClipsWithGameNameFromBroadcasterName(
        twitchApi,
        this.#broadcasterName
      );

      let [clips, cursor] = getClipsWithGameNameFromBroadcasterName_;
      void this.#twitchClipsMeiliSearchIndex.updateDocuments(clips);

      for (let i = 0; i < 9 && cursor !== undefined; i++) {
        getClipsWithGameNameFromBroadcasterName_ = await getClipsWithGameNameFromBroadcasterName(
          twitchApi,
          this.#broadcasterName,
          cursor
        );

        [clips, cursor] = getClipsWithGameNameFromBroadcasterName_;
        void this.#twitchClipsMeiliSearchIndex.updateDocuments(clips);
        updated += clips.length;
      }
    }

    console.log(`Updated ${updated} clips.`);
    return;
  }
}
