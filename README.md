# Botge

Botge is a Discord bot that provides functionalities inspired by the [Twitch](https://www.twitch.tv) chat experience, including emote handling, [Twitch](https://www.twitch.tv) clip searching and other functionalities that enchance the Discord experience like [Google Cloud Translation](https://cloud.google.com/translate)(**Currently broken.**) and interacting with [OpenAI's](https://openai.com) GPT models.

Currently only two channels are supported.

## Features

- **Emote Handling**:  Search emotes from platforms: [7TV](https://7tv.app), [BTTV](https://betterttv.com), [FFZ](https://www.frankerfacez.com) and [Twitch](https://www.twitch.tv), including using zero-width emotes and [discord emojis](https://github.com/jdecked/twemoji).\
It fetches global emotes and channel specific emotes(if specified) from those platforms.
- **Twitch Clip Search**: Search Twitch clips from the 1000 most viewed channel specific clips.
- **Add Emote**: Add an emote to the emote pool.
- **Shortest unique substring**: Display the shortest unique substring for the specified emote(s) in comparison to the other emotes in the emote pool.
- **ChatGPT Integration**: Interact with OpenAI's GPT models for generating responses.
- **Translation**: Translate text to English using Google Cloud Translate. **Currently broken.**
- **Transient Messages**: Send messages that auto-delete after a specified duration.
- **Find the emoji**: Generates a x by x grid, where each grid element is a random non-animated server emoji and is in spoiler tag, with only a single occurence of the the specified emoji.
- **Ping Me**: Pings you after the specified time, optionally with a message.
- **Help**: Send a message on how to add the bot.

## Usage

Add the bot by either [link](https://discord.com/oauth2/authorize?client_id=1298983961992757328) or by clicking the Bot's profile in [Discord](https://discord.com).

Using TAB when typing the command name is recommended.\
Detailed tooltip is displayed when typing the command name.

## License

This project is licensed under the MIT License.