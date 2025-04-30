import type { AutocompleteInteraction, ApplicationCommandOptionChoiceData } from 'discord.js';
import type { EmoteMatcher } from '../emote-matcher.js';
import type { Index } from 'meilisearch';
import type { TwitchClip, ReadonlyHit } from '../types.js';
import { getShortestUniqueSubstrings } from '../command/shortest-unique-substrings.js';
import { applicableSizes } from '../utils/size-change.js';

export function autocompleteHandler(
  emoteMatcher: Readonly<EmoteMatcher>,
  twitchClipsMeiliSearchIndex: Index | undefined,
  uniqueCreatorNames: Readonly<Set<string>> | undefined,
  uniqueGameIds: Readonly<Set<string>> | undefined
) {
  return async (interaction: AutocompleteInteraction): Promise<void> => {
    try {
      const interactionCommandName = interaction.commandName;
      const focusedOption = interaction.options.getFocused(true);
      const focusedOptionName = focusedOption.name;
      const focusedOptionValue = focusedOption.value;

      if (interactionCommandName === 'emote') {
        if (focusedOptionName === 'emote') {
          const matches = emoteMatcher.matchSingleArray(focusedOptionValue.trim(), 25, true) ?? [];
          const options: readonly ApplicationCommandOptionChoiceData<string>[] = matches.map((match) => {
            return {
              name: match.name.trim(),
              value: match.name.trim()
            } as ApplicationCommandOptionChoiceData<string>;
          });

          await interaction.respond(options);
        } else if (focusedOptionName === 'size') {
          const emote = String(interaction.options.get('emote')?.value).trim();
          const match = emoteMatcher.matchSingle(emote);
          const applicableSizes_ = applicableSizes(match?.platform);

          const options: readonly ApplicationCommandOptionChoiceData<number>[] = applicableSizes_.map(
            (applicableSize) => {
              return {
                name: applicableSize.toString(),
                value: applicableSize
              } as ApplicationCommandOptionChoiceData<number>;
            }
          );

          await interaction.respond(options);
        }
      } else if (interactionCommandName === 'clip') {
        if (
          twitchClipsMeiliSearchIndex === undefined ||
          uniqueCreatorNames === undefined ||
          uniqueGameIds === undefined
        )
          return;

        if (focusedOptionName === 'title') {
          const { maxTotalHits } = await twitchClipsMeiliSearchIndex.getPagination();
          if (maxTotalHits === null || maxTotalHits === undefined) throw new Error('pagination max total hits not set');

          const search = await twitchClipsMeiliSearchIndex.search(focusedOptionValue.trim(), {
            sort: ['created_at:desc'],
            limit: maxTotalHits
          });
          const options: readonly ApplicationCommandOptionChoiceData<string>[] = search.hits
            .map((hit: ReadonlyHit) => hit as TwitchClip)
            .map((clip) => {
              return { name: clip.title, value: clip.title } as ApplicationCommandOptionChoiceData<string>;
            });

          await interaction.respond(
            options.length > 25
              ? (options.slice(0, 25) as readonly ApplicationCommandOptionChoiceData<string>[])
              : options
          );
        } else if (focusedOptionName === 'clipper') {
          const options: readonly ApplicationCommandOptionChoiceData<string>[] = [...uniqueCreatorNames.keys()]
            .filter((uniqueCreatorName) => uniqueCreatorName.toLowerCase().includes(focusedOptionValue.trim()))
            .map((uniqueCreatorName) => {
              return {
                name: uniqueCreatorName,
                value: uniqueCreatorName
              } as ApplicationCommandOptionChoiceData<string>;
            });

          await interaction.respond(
            options.length > 25
              ? (options.slice(0, 25) as readonly ApplicationCommandOptionChoiceData<string>[])
              : options
          );
        } else if (focusedOptionName === 'game') {
          const options: readonly ApplicationCommandOptionChoiceData<string>[] = [...uniqueGameIds.keys()]
            .filter((uniqueGameId) => uniqueGameId.toLowerCase().includes(focusedOptionValue.trim()))
            .map((uniqueGameId) => {
              return {
                name: uniqueGameId,
                value: uniqueGameId
              } as ApplicationCommandOptionChoiceData<string>;
            });

          await interaction.respond(
            options.length > 25
              ? (options.slice(0, 25) as readonly ApplicationCommandOptionChoiceData<string>[])
              : options
          );
        }
      } else if (interactionCommandName === 'shortestuniquesubstrings') {
        if (focusedOptionName === 'emotes') {
          const focusedOptionValueSplit = focusedOptionValue.split(/\s+/);
          const focusedOptionValueLast = focusedOptionValueSplit.at(-1) ?? '';
          const focusedOptionValueEverythingButLast = focusedOptionValueSplit
            .slice(0, -1)
            .map((emote) => {
              const [, shortestUniqueSubstrings] = getShortestUniqueSubstrings(emoteMatcher, emote);
              if (shortestUniqueSubstrings !== undefined) return shortestUniqueSubstrings[0];
              else return emote;
            })
            .join(' ');

          const matches = emoteMatcher.matchSingleArray(focusedOptionValueLast.trim(), 25, true) ?? [];
          const options: readonly ApplicationCommandOptionChoiceData<string>[] = matches.map((match) => {
            const [, shortestUniqueSubstrings] = getShortestUniqueSubstrings(emoteMatcher, match.name);
            const shortestUniqueSubstring =
              shortestUniqueSubstrings !== undefined ? shortestUniqueSubstrings[0] : match.name;

            return {
              name: `${focusedOptionValueEverythingButLast} ${match.name}`.trim(),
              value: `${focusedOptionValueEverythingButLast} ${shortestUniqueSubstring}`.trim()
            } as ApplicationCommandOptionChoiceData<string>;
          });

          if (options.some((option: Readonly<ApplicationCommandOptionChoiceData<string>>) => option.name.length > 100))
            return;

          await interaction.respond(
            options.length > 25
              ? (options.slice(0, 25) as readonly ApplicationCommandOptionChoiceData<string>[])
              : options
          );
        }
      }
    } catch (error) {
      console.log(`Error at autocomplete --> ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}
