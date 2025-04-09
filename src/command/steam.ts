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

      function getColor(percent: number): string {
        if (percent <= 39) return '\u001b[31m'; //This is red color Hehe
        if (percent <= 69) return '\u001b[33m'; //This is yellow Eww
        return '\u001b[34m'; //This is blue xdd
      }

      function getReviewLabel(percent: number): string {
        if (percent <= 39) return '(Mostly Negative)';
        if (percent <= 69) return '(Mixed)';
        return '(Mostly Positive)';
      }
      
      
      const recentPercent = parseInt(recentMatch[1], 10);
      const allPercent = parseInt(allMatch[1], 10);
      
      const recentColor = getColor(recentPercent);
      const allColor = getColor(allPercent);
      const reset = '\u001b[0m';
      const recentLabel = getReviewLabel(recentPercent);
      const allLabel = getReviewLabel(allPercent);


      let replyText: string =
       '```ansi\n' +
       `RECENT: ${recentColor}${recentPercent}% ${recentLabel}${reset} Positive reviews (${recentMatch[2]})\n` +
       `OVERALL: ${allColor}${allPercent}% ${allLabel}${reset} Positive reviews (${allMatch[2]})\n` +
       `PLAYERS ONLINE RIGHT NOW: \u001b[32m${numberWithCommas(playerCount)}${reset}\n` +
       '```';

      await defer;
      await interaction.editReply(replyText);
    } catch (error) {
      console.log(`Error at chatgpt --> ${error instanceof Error ? error.message : String(error)}`);

      await defer;
      await interaction.editReply('failed to chatpgt.');
    }
  };
}
