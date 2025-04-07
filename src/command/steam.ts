import type { CommandInteraction } from 'discord.js';

const RecentReviewRegex = /([0-9]+)% of the ([0-9,]+) user reviews in the last 30 days are positive\./;
const AllReviewRegex = /([0-9]+)% of the ([0-9,]+) user reviews for this game are positive\./;

function numberWithCommas(x: number) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function steamHandler(gameName: string, gameId: string) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const store = fetch(`https://store.steampowered.com/app/${gameId}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      const GetNumberOfCurrentPlayers = await fetch(
        `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${gameId}`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        }
      );

      let storeResponse = await store;
      let currentPlayerResponse = await GetNumberOfCurrentPlayers;

      if (!storeResponse.ok || !currentPlayerResponse.ok) {
        return;
      }

      const html = await storeResponse.text();
      const recentMatch = RecentReviewRegex.exec(html);
      const allMatch = AllReviewRegex.exec(html);
      const playerCount: number = (await currentPlayerResponse.json()).response.player_count;

      if (!recentMatch || recentMatch.length < 3 || !allMatch || allMatch.length < 3) {
        return;
      }

      let replyText: string =
        `RECENT REVIEWS: **${recentMatch[1]}%** Positive (${recentMatch[2]})\n` +
        `ALL REVIEWS: **${allMatch[1]}%** Positive (${allMatch[2]})\n` +
        `PLAYERS RIGHT NOW: **${numberWithCommas(playerCount)}**`;

      await defer;
      await interaction.editReply(replyText);
    } catch (error) {
      console.log(`Error at chatgpt --> ${error instanceof Error ? error.message : String(error)}`);

      await defer;
      await interaction.editReply('failed to chatpgt.');
    }
  };
}
