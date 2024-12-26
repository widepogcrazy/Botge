# Botge

Botge is a Discord bot that provides functionalities inspired by the [Twitch](https://www.twitch.tv) chat experience, including emote handling, [Twitch](https://www.twitch.tv) clip searching and other functionalities that enchance the Discord experience like [Google Cloud Translation](https://cloud.google.com/translate) and interacting with [OpenAI's](https://openai.com) GPT models.

Currently only two channels are supported.

## Features

- **Emote Handling**:  Search emotes from platforms: [7TV](https://7tv.app), [BTTV](https://betterttv.com), [FFZ](https://www.frankerfacez.com) and [Twitch](https://www.twitch.tv), including using zero-width emotes.\
It fetches global emotes and channel specific emotes(if specified) from those platforms.
- **Twitch Clip Search**: Search Twitch clips from the 1000 most viewed channel specific clips.
- **Add Emote**: Add an emote to the emote pool.
- **Shortest unique substring**: Display the shortest unique substring for the specified emote(s) in comparison to the other emotes in the emote pool.
- **ChatGPT Integration**: Interact with OpenAI's GPT models for generating responses.
- **Translation**: Translate text to English using Google Cloud Translate. **Currently broken.**
- **Transient Messages**: Send messages that auto-delete after a specified duration.
- **Help**: Send a message on how to add the bot.

## Usage

Add the bot by either [link](https://discord.com/oauth2/authorize?client_id=1298983961992757328) or by clicking the Bot's profile in [Discord](https://discord.com), if someone has used it before.

Using TAB when typing the command name is recommended.\
Detailed tooltip is displayed when typing the command name.

### Commands

- **/emote**: Fill out the `name` option.\
Optionally Use the `size` option to specify the size.\
Optionally Use the `fullsize` option when using zero-width emotes to bypass the resolution limit.\
Optionally Use the `stretch` option to stretch the zero-width emote instead of centering it.\
The `name` option is case insensitive and the substring of the emote name is sufficent.
- **/clip**: Fill out the `text` option with keyword(s).
- **/addemote**: Fill out the `text` option with a [7TV](https://7tv.app) link to an emote.
- **/shortestuniquesubstrings**: Fill out the `emotes` option with the name(s) of the emote(s).
- **/chatgpt**: Fill out the `text` option.
- **/translate**: Fill out the `text` option. **Currently broken.**
- **/transient**: Fill out the `text` option or the `attachment` option, optionally fill out the `duration` option.
- **/help**: Send the command..

## Deployment

### Prerequisites

- [Node.js](https://nodejs.org)
- [Docker](https://www.docker.com)

### Non-Docker

1. Clone the repository:
    ```sh
    git clone <repository-url>
    cd <repository-directory>
    ```

2. Install the dependencies:
    ```sh
    npm install
    ```

3. Create a `.env` file and fill out the environment variables:
    ```env
    APP_ID=your_discord_bot_app_id
    DISCORD_TOKEN=your_discord_bot_token
    OPENAI_API_KEY=your_openai_api_key
    CREDENTIALS=your_google_cloud_credentials
    TWITCH_CLIENT_ID=your_twitch_client_id
    TWITCH_SECRET=your_twitch_secret
    ```

    You can get the `APP_ID` and `DISCORD_TOKEN` variables by creating an application on the [Discord Developer Portal](https://discord.com/developers/applications). The `DISCORD_TOKEN` is the Client Secret under OAuth2 in Settings.\
    The `OPENAI_API_KEY`, `CREDENTIALS`, `TWITCH_CLIENT_ID`, and `TWITCH_SECRET` variables are optional.

4. Start the application (you may need to restart Discord for the commands to show up):
    ```sh
    npm run start
    ```

### Docker

1. Clone the repository:
    ```sh
    git clone <repository-url>
    cd <repository-directory>
    ```

2. Install the dependencies:
    ```sh
    npm install
    ```

3. Update the commands:
    ```sh
    npm run commandgeupdate
    ```

4. Copy `compose.sample.yaml` to `compose.yaml` and fill out the environment variables:
    ```yaml
    environment:
      - APP_ID=your_discord_bot_app_id
      - DISCORD_TOKEN=your_discord_bot_token
      - OPENAI_API_KEY=your_openai_api_key
      - CREDENTIALS=your_google_cloud_credentials
      - TWITCH_CLIENT_ID=your_twitch_client_id
      - TWITCH_SECRET=your_twitch_secret
    ```

    You can get the `APP_ID` and `DISCORD_TOKEN` variables by creating an application on the [Discord Developer Portal](https://discord.com/developers/applications). It is the Client Secret under OAuth2 in Settings.\
    The `OPENAI_API_KEY`, `CREDENTIALS`, `TWITCH_CLIENT_ID`, and `TWITCH_SECRET` variables are optional. If you have them, uncomment the corresponding lines by removing the `#` symbol.

5. Run the Docker containers (you may need to restart Discord for the commands to show up):
    ```sh
    docker compose up --build
    ```

## License

This project is licensed under the MIT License.