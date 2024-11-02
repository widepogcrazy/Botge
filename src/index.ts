import dotenv from 'dotenv';
import { exec, spawn } from 'child_process';
import * as path from 'path';
import fetch from 'node-fetch';
import * as fs from 'fs-extra';
import { writeFile, rm } from 'node:fs/promises';
import { Client } from 'discord.js';
import OpenAI from 'openai';
import { v2 } from '@google-cloud/translate';
import * as https from 'https';

import { TranslateHandler } from './command/translate.js';
import { chatgptHandler } from './command/openai.js';
import { AssetInfo, EmoteMatcher } from './emoteMatcher.js';
import { TwitchGlobalHandler } from './TwitchGlobalHandler.js';
import * as schedule from 'node-schedule';

dotenv.config();

//client
const client = new Client({ intents: [] });

//openai
const OPENAI_API_KEYTWO = process.env.OPENAI_API_KEYTWO;
const openai = new OpenAI({ apiKey: OPENAI_API_KEYTWO });

//translate
const { Translate } = v2;
const CREDENTIALS = JSON.parse(process.env.CREDENTIALS);
const translate = new Translate({
  credentials: CREDENTIALS,
  projectId: CREDENTIALS.project_id
});

// print stack on warnings
process.on('warning', (e) => console.log(e.stack));

//twitch
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;
const twitchglobalhandler = TwitchGlobalHandler.getInstance(TWITCH_CLIENT_ID, TWITCH_SECRET);

async function getAndValidateTwitchAccessToken() {
  await twitchglobalhandler.getTwitchAccessToken();
  await twitchglobalhandler.validateTwitchAccessToken();
}

function logGotAccessToken() {
  if (twitchglobalhandler.gotAccessToken()) {
    console.log('Got Twitch Access Token.');
  } else {
    console.log('Failed to get Twitch Access Token.');
  }
}
function logIsAccessTokenValidated() {
  if (twitchglobalhandler.isAccessTokenValidated()) {
    console.log('Twitch Access Token is valid.');
  } else {
    console.log('Twitch Access Token is invalid.');
  }
}

await getAndValidateTwitchAccessToken();
logGotAccessToken();
logIsAccessTokenValidated();

schedule.scheduleJob('*/60 * * * *', async () => {
  await twitchglobalhandler.validateTwitchAccessToken();
  logIsAccessTokenValidated();
  if (!twitchglobalhandler.isAccessTokenValidated()) {
    await getAndValidateTwitchAccessToken();
    logGotAccessToken();
    logIsAccessTokenValidated();
  }
});

// emotes
const emote_endpoints = {
  sevenPersonal: 'https://7tv.io/v3/emote-sets/01FDMJPSF8000CJ4MDR2FNZEQ3',
  sevenGlobal: 'https://7tv.io/v3/emote-sets/global',
  bttvPersonal: 'https://api.betterttv.net/3/users/5809977263c97c037fc9e66c',
  bttvGlobal: 'https://api.betterttv.net/3/cached/emotes/global',
  ffzPersonal: 'https://api.frankerfacez.com/v1/room/cutedog_',
  ffzGlobal: 'https://api.frankerfacez.com/v1/set/global',
  twitchGlobal: 'https://api.twitch.tv/helix/chat/emotes/global'
};

export async function newEmoteMatcher(): Promise<EmoteMatcher> {
  try {
    const twitchGlobalOptions = await twitchglobalhandler.getOptionsTwitchGlobal();

    const sevenPersonal = fetch(emote_endpoints.sevenPersonal);
    const sevenGlobal = fetch(emote_endpoints.sevenGlobal);
    const bttvPersonal = fetch(emote_endpoints.bttvPersonal);
    const bttvGlobal = fetch(emote_endpoints.bttvGlobal);
    const ffzPersonal = fetch(emote_endpoints.ffzPersonal);
    const ffzGlobal = fetch(emote_endpoints.ffzGlobal);
    const twitchGlobal = twitchGlobalOptions ? fetch(emote_endpoints.twitchGlobal, twitchGlobalOptions) : undefined;
    return new EmoteMatcher(
      await (await sevenPersonal).json(),
      await (await sevenGlobal).json(),
      await (await bttvPersonal).json(),
      await (await bttvGlobal).json(),
      await (await ffzPersonal).json(),
      await (await ffzGlobal).json(),
      await (await twitchGlobal)?.json()
    );
  } catch (err) {
    console.log(err);
  }
}

let em = await newEmoteMatcher();
console.log('Emote cache ready');

// update ever 5 minutes
schedule.scheduleJob('*/5 * * * *', async () => {
  console.log('Emote cache refreshing');
  em = await newEmoteMatcher();
  console.log('Emote cache refreshed');
});

//translateText
const translateText = async (text, targetLanguage) => {
  try {
    const [response] = await translate.translate(text, targetLanguage);
    return response;
  } catch (error) {
    console.log(`Error at translateText --> ${error}`);
    return 0;
  }
};

// Function to download GIFs from URLs
async function downloadGifs(emotes: AssetInfo[], outdir) {
  const downloadedFiles = [];
  let counter = 1;
  for (const emote of emotes) {
    const response = await fetch(emote.url);
    const buffer = await response.buffer();
    const fileName = `${counter}_` + path.basename(emote.url);
    const filePath = path.join(outdir, fileName);
    await writeFile(filePath, buffer);
    downloadedFiles.push(filePath);
    counter++;
  }
  return downloadedFiles;
}

function getGifDuration(file): Promise<number> {
  return new Promise((resolve, reject) => {
    console.log(file);
    exec(
      `ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`,
      (error, stdout, stderr) => {
        if (error) {
          reject(`Error getting duration: ${stderr}`);
          return;
        }
        const duration = stdout.trim();
        const default_duration = 3; // :3
        // Check if duration is "N/A" or empty, and use a default value
        if (duration === 'N/A' || duration === '') {
          resolve(default_duration); // or any default value you prefer
        } else {
          resolve(parseFloat(duration));
        }
      }
    );
  });
}

async function stackGifs(emotes: AssetInfo[], outdir: string) {
  try {
    // Download GIFs - having local files is faster when using ffmpeg
    const downloadedFiles = await downloadGifs(emotes, outdir);
    // Get durations for each GIF
    const durations = await Promise.all(downloadedFiles.map(getGifDuration));
    const maxDuration = Math.max(...durations.filter((value) => !Number.isNaN(value)));
    console.log(`Max duration: ${maxDuration}`);
    const has_animated: boolean = maxDuration != -Infinity;

    const args = [];
    downloadedFiles.forEach((file) => {
      if (has_animated) {
        args.push('-stream_loop');
        args.push('-1');
        args.push('-t');
        args.push(`${maxDuration}`);
      }
      args.push('-i');
      args.push(`${file}`);
    });

    args.push('-filter_complex');

    const filterString =
      downloadedFiles
        .map((_, index) => {
          if (has_animated) {
            return `[${index}:v]scale=-1:64,fps=30[v${index}];`;
          }
          return `[${index}:v]scale=-1:64[v${index}];`;
        })
        .join('') +
      downloadedFiles.map((_, index) => `[v${index}]`).join('') +
      `hstack=inputs=${downloadedFiles.length}[stacked];[stacked]split=2[stacked][palette];[palette]palettegen[p];[stacked][p]paletteuse`;

    args.push(filterString);

    if (has_animated) {
      args.push('-t');
      args.push(`${maxDuration}`);
    }

    args.push('-y');
    args.push('-fs');
    args.push('25M');

    const outputfile = path.join(outdir, 'output.gif');
    args.push(outputfile);

    console.log('Running command: ffmpeg ' + args.join(' '));
    return spawn('ffmpeg', args);
  } catch (error) {
    console.error(`Error stacking GIFs: ${error}`);
  }
}

//on ready
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

//interaction
client.on('interactionCreate', async (interaction) => {
  //interaction not
  if (!interaction.isChatInputCommand()) return;

  //interaction emote
  if (interaction.commandName === 'emote') {
    try {
      //name
      await interaction.deferReply();
      const optionsName = String(interaction.options.get('name').value);

      //size
      const optionsSize: string = interaction.options.get('size')?.value as string;
      const size = optionsSize === undefined ? 2 : parseInt(optionsSize);

      const ret = em.matchSingle(optionsName);
      if (ret) {
        await interaction.editReply(ret.url);
        return;
      } else {
        //no emote found. reply
        await interaction.editReply('jij');
        return;
      }
    } catch (error) {
      console.log(error.stack);
      console.log(`Error at emote --> ${error}`);
      await interaction.editReply('Failed to provide emote.');
      return;
    }
  }

  if (interaction.commandName === 'combine') {
    //name
    await interaction.deferReply();
    const query = String(interaction.options.get('emotes').value);
    const emotes: AssetInfo[] = em.matchMulti(query);
    const outdir = path.join('temp_gifs', interaction.id);
    fs.ensureDirSync(outdir);
    // Dont need try catch if it works 100% of the time YEP
    const ffmpeg_process = await stackGifs(emotes, outdir);

    ffmpeg_process.on(
      'close',
      (function (interaction) {
        //Here you can get the exit code of the script
        return async function (code) {
          if (code == 0) {
            await interaction.editReply({ files: [path.join(outdir, 'output.gif')] }).then((message) => {
              rm(outdir, { recursive: true });
            });
            return;
          }
          await interaction.editReply({ content: 'gif creation failed' });
          rm(outdir, { recursive: true });
        };
      })(interaction) // closure to keep |interaction|
    );
  }

  //interaction chatgpt
  if (interaction.commandName === 'chatgpt') {
    chatgptHandler(openai)(interaction);
  }

  //interaction translate
  if (interaction.commandName === 'translate') {
    TranslateHandler(translate)(interaction);
  }

  //interaction help
  if (interaction.commandName === 'help') {
    try {
      await interaction.deferReply();
      await interaction.editReply(
        'https://cdn.discordapp.com/attachments/251211223012474880/1300042554934300722/image.png?ex=671f667a&is=671e14fa&hm=703c0932387a3bc78522323b9f1d7ba21440b18921d6405e9899b14a4d1b96eb&'
      );
      return;
    } catch (error) {
      console.log(`Error at help --> ${error}`);
      await interaction.editReply('Failed to help.');
      return;
    }
  }
});
