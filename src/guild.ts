import type { Index } from 'meilisearch';

import { GUILD_ID_CUTEDOG } from './guilds.js';
import type { EmoteMatcher } from './emote-matcher.js';
import type { PersonalEmoteMatcherConstructor } from './emote-matcher-constructor.js';
import type { TwitchApi } from './api/twitch-api.js';
import { listCutedogClipIds } from './utils/list-cutedog-clip-ids.js';
import { getClipsWithGameNameFromBroadcasterName, getClipsWithGameNameFromIds } from './utils/twitch-api-utils.js';
import type { ReadonlyRecordAny, TwitchClip } from './types.js';

export class Guild {
  public readonly ids: readonly string[];
  readonly #broadcasterName: string | undefined;
  #emoteMatcher: Readonly<EmoteMatcher>;
  readonly #twitchClipsMeiliSearchIndex: Index | undefined;
  readonly #personalEmoteMatcherConstructor: Readonly<PersonalEmoteMatcherConstructor>;
  #uniqueCreatorNames: Set<string> | undefined;
  #uniqueGameIds: Set<string> | undefined;
  #settingsPermittedRoleIds: readonly string[] | null;
  #addEmotePermittedRoleIds: readonly string[] | null;
  #toggleAddEmotePermitNoRole: boolean;

  public constructor(
    ids: readonly string[],
    broadcasterName: string | undefined,
    twitchClipsMeiliSearchIndex: Index | undefined,
    emoteMatcher: Readonly<EmoteMatcher>,
    emoteMatcherConstructor: Readonly<PersonalEmoteMatcherConstructor>,
    settingsPermittedRoleIds: readonly string[] | null,
    addEmotePermittedRoleIds: readonly string[] | null,
    toggleAddEmotePermitNoRole: boolean
  ) {
    this.ids = ids;
    this.#broadcasterName = broadcasterName;
    this.#twitchClipsMeiliSearchIndex = twitchClipsMeiliSearchIndex;
    this.#emoteMatcher = emoteMatcher;
    this.#personalEmoteMatcherConstructor = emoteMatcherConstructor;
    this.#uniqueCreatorNames = new Set<string>();
    this.#uniqueGameIds = new Set<string>();
    this.#settingsPermittedRoleIds = settingsPermittedRoleIds;
    this.#addEmotePermittedRoleIds = addEmotePermittedRoleIds;
    this.#toggleAddEmotePermitNoRole = toggleAddEmotePermitNoRole;
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
  public get uniqueCreatorNames(): Readonly<Set<string>> | undefined {
    return this.#uniqueCreatorNames;
  }
  public get uniqueGameIds(): Readonly<Set<string>> | undefined {
    return this.#uniqueGameIds;
  }

  public get settingsPermittedRoleIds(): readonly string[] | null {
    return this.#settingsPermittedRoleIds;
  }

  public get addEmotePermittedRoleIds(): readonly string[] | null {
    return this.#addEmotePermittedRoleIds;
  }

  public get toggleAddEmotePermitNoRole(): boolean {
    return this.#toggleAddEmotePermitNoRole;
  }

  public changeSettingsPermittedRoleIds(roleIds: readonly string[]): void {
    if (roleIds.length === 0) this.#settingsPermittedRoleIds = null;
    this.#settingsPermittedRoleIds = roleIds;
  }

  public changeAddEmotePermittedRoleIds(roleIds: readonly string[]): void {
    if (roleIds.length === 0) this.#addEmotePermittedRoleIds = null;
    this.#addEmotePermittedRoleIds = roleIds;
  }

  public changeToggleAddEmotePermitNoRole(): void {
    this.#toggleAddEmotePermitNoRole = !this.#toggleAddEmotePermitNoRole;
  }

  public async refreshEmoteMatcher(): Promise<void> {
    this.#emoteMatcher = await this.#personalEmoteMatcherConstructor.constructEmoteMatcher();
  }

  public async refreshClips(twitchApi: Readonly<TwitchApi> | undefined): Promise<void> {
    if (this.#twitchClipsMeiliSearchIndex === undefined || twitchApi === undefined) return;
    if (this.#broadcasterName === undefined) return;

    this.#uniqueCreatorNames = new Set<string>();
    this.#uniqueGameIds = new Set<string>();

    let updated = 0;

    if (this.ids.some((id) => id === GUILD_ID_CUTEDOG)) {
      //custom clips
      const increment = 100;
      const clipIds = await listCutedogClipIds();

      for (let i = 0; i < clipIds.length; i += increment) {
        const clips = (await getClipsWithGameNameFromIds(twitchApi, clipIds.slice(i, i + increment))).map((clip) => {
          if (clip.game_id === '') return { ...clip, game_id: 'N/A' };
          else return clip;
        });

        await this.#twitchClipsMeiliSearchIndex.updateDocuments(clips).waitTask();
        updated += clips.length;
      }
    } else {
      //get top 1000 most viewed clips
      let getClipsWithGameNameFromBroadcasterName_ = await getClipsWithGameNameFromBroadcasterName(
        twitchApi,
        this.#broadcasterName
      );

      let [clips, cursor] = getClipsWithGameNameFromBroadcasterName_;
      clips = clips.map((clip) => {
        if (clip.game_id === '') return { ...clip, game_id: 'N/A' };
        else return clip;
      });

      await this.#twitchClipsMeiliSearchIndex.updateDocuments(clips).waitTask();
      updated += clips.length;

      for (let i = 0; i < 9 && cursor !== undefined; i++) {
        getClipsWithGameNameFromBroadcasterName_ = await getClipsWithGameNameFromBroadcasterName(
          twitchApi,
          this.#broadcasterName,
          cursor
        );

        [clips, cursor] = getClipsWithGameNameFromBroadcasterName_;
        clips = clips.map((clip) => {
          if (clip.game_id === '') return { ...clip, game_id: 'N/A' };
          else return clip;
        });

        await this.#twitchClipsMeiliSearchIndex.updateDocuments(clips).waitTask();
        updated += clips.length;
      }
    }

    await this.refreshUniqueCreatorNamesAndGameIds();
    console.log(`Updated ${updated} clips.`);
  }

  public async refreshUniqueCreatorNamesAndGameIds(): Promise<void> {
    if (this.#twitchClipsMeiliSearchIndex === undefined) return;

    const { maxTotalHits } = await this.#twitchClipsMeiliSearchIndex.getPagination();
    if (maxTotalHits === null || maxTotalHits === undefined) throw new Error('pagination max total hits not set');

    const clipsge: readonly TwitchClip[] = (
      await this.#twitchClipsMeiliSearchIndex.getDocuments({ limit: maxTotalHits })
    ).results
      .map((record: ReadonlyRecordAny) => record as TwitchClip)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    this.#uniqueCreatorNames = new Set(clipsge.map((clip) => clip.creator_name));
    this.#uniqueGameIds = new Set(clipsge.map((clip) => clip.game_id));
  }
}
