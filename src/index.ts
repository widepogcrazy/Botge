import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { exec, spawn } = require('child_process');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs-extra');

import dotenv from 'dotenv';
dotenv.config();

//import
import { Client } from 'discord.js';
import OpenAI from 'openai';
import { v2 } from '@google-cloud/translate';
import * as https from 'https';
import CacheableRequest from 'cacheable-request';

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
process.on('warning', e => console.warn(e.stack));

//cachable-request
const cacheableRequest = new CacheableRequest(https.request).request();

//twitch
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;
const postDataTwitchAccessToken = `client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_SECRET}&grant_type=client_credentials`;

//options
const optionsTwitchAccessToken = {
  hostname: 'id.twitch.tv',
  path: '/oauth2/token',
  method: 'POST'
};
const options7TVCuteDog = {
  hostname: '7tv.io',
  path: '/v3/emote-sets/01FDMJPSF8000CJ4MDR2FNZEQ3',
  method: 'GET'
};
const options7TVGlobal = {
  hostname: '7tv.io',
  path: '/v3/emote-sets/global',
  method: 'GET'
};
const optionsBTTVCuteDog = {
  hostname: 'api.betterttv.net',
  path: '/3/users/5809977263c97c037fc9e66c',
  method: 'GET'
};
const optionsBTTVGlobal = {
  hostname: 'api.betterttv.net',
  path: '/3/cached/emotes/global',
  method: 'GET'
};
const optionsFFZCutedog = {
  hostname: 'api.frankerfacez.com',
  path: '/v1/room/cutedog_',
  method: 'GET'
};
const optionsFFZGlobal = {
  hostname: 'api.frankerfacez.com',
  path: '/v1/set/global',
  method: 'GET'
};

//reqWithStatusCode
async function reqWithStatusCode(options: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let data: any = [];
    const reqge = https
      .request(options)
      .on('response', (res: any) => {
        res
          .on('data', (d: any) => {
            data.push(d);
          })
          .on('end', () => {
            resolve([Buffer.concat(data).toString(), res.statusCode]);
          });
      })
      .on('error', (err: any) => reject(err));
    reqge.end();
  });
}

//cacheReq
async function cacheReq(options: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let data: any = [];
    cacheableRequest(options)
      .on('response', (res: any) => {
        res
          .on('data', (d: any) => {
            data.push(d);
          })
          .on('end', () => {
            resolve(JSON.parse(Buffer.concat(data).toString()));
          });
      })
      .on('request', (req: any) => {
        req.end();
      })
      .on('error', (err: any) => reject(err));
  });
}

//postdata
async function postData(options: any, postdata: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let data: any = [];
    const req = https
      .request(options)
      .on('response', (res: any) => {
        res
          .on('data', (d: any) => {
            data.push(d);
          })
          .on('end', () => {
            resolve(Buffer.concat(data).toString());
          });
      })
      .on('error', (err: any) => reject(err));
    req.write(postdata);
    req.end();
  });
}

let access_tokenge;
let access_tokenge_statusCode;

async function getTwitchAccessToken() {
  const postdata = await postData(optionsTwitchAccessToken, postDataTwitchAccessToken);
  const postdataJSON = JSON.parse(postdata);
  const access_token = postdataJSON.access_token;
  access_tokenge = access_token;
  console.log('Got Twitch Access Token.');
}

async function validateTwitchAccessToken(access_token: any): Promise<any> {
  const optionsTwitchAccessTokenValidate = {
    hostname: 'id.twitch.tv',
    path: '/oauth2/validate',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${access_token}`
    }
  };

  const res = await reqWithStatusCode(optionsTwitchAccessTokenValidate);
  const resJSON = JSON.parse(res[0]);
  const resStatusCode = res[1];
  if (resStatusCode === 401) {
    console.log(`TwitchAccessToken is invalid. statusCode: ${resStatusCode}`);
  } else {
    console.log(`TwitchAccessToken is valid. statusCode: ${resStatusCode}`);
  }
  console.log(resJSON);
  return resStatusCode;
}

function getOptionsTwitchGlobal(access_token: any): any | undefined {
  if (access_tokenge_statusCode === 401) {
    return undefined;
  }
  const optionsTwitchGlobal = {
    hostname: 'api.twitch.tv',
    path: '/helix/chat/emotes/global',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Client-Id': TWITCH_CLIENT_ID
    }
  };
  return optionsTwitchGlobal;
}

try {
  await getTwitchAccessToken();
  await validateTwitchAccessToken(access_tokenge);
  setInterval(
    async function () {
      console.log('Hourly Twitch Access Token Check.');
      if ((await validateTwitchAccessToken(access_tokenge)) === 401) {
        await getTwitchAccessToken();
        await validateTwitchAccessToken(access_tokenge);
      }
    },
    60 * 60 * 1000
  );
} catch (err) {
  console.log(err);
}

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
async function downloadGifs(urls, outdir) {
  const downloadedFiles = [];
  let counter = 1;
  for (const url of urls) {
    const response = await fetch(url);
    const buffer = await response.buffer();
    const fileName = `${counter}_` + path.basename(url);
    const filePath = path.join(outdir, fileName);
    await fs.writeFile(filePath, buffer);
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

async function stackGifs(files, outdir) {
  try {
    // Download GIFs - having local files is faster when using ffmpeg
    const downloadedFiles = await downloadGifs(files, outdir);
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
      files
        .map((_, index) => {
          if (has_animated) {
            return `[${index}:v]scale=-1:64,fps=30[v${index}];`;
          }
          return `[${index}:v]scale=-1:64[v${index}];`;
        })
        .join('') +
      downloadedFiles.map((_, index) => `[v${index}]`).join('') +
      `hstack=inputs=${files.length}[stacked];[stacked]split=2[stacked][palette];[palette]palettegen[p];[stacked][p]paletteuse`;

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
// returns a url, or undefined if not found
async function matchEmotes(query, size) {
  const optionsName = query;
  const optionsNameLowerCase = query.toLowerCase();

  //urlge
  const urlgePrefix = 'https:';
  const urlgePrefixBTTV = 'https://cdn.betterttv.net/emote/';

  //size invalid
  if (!(size > 0 && size < 5)) return;

  //functions
  function matchEmotesTwitchGlobal(emotes: any, template: string): string | undefined {
    try {
      const sizege = size === 4 ? 2 : size;
      for (const id in emotes) {
        //consts
        const emote = emotes[id];
        const emote_id = emote.id;
        const nameLowerCase = String(emote.name).toLowerCase();
        const format = emote.format;
        const scale = emote.scale;
        const theme_mode = emote.theme_mode;

        //check
        if (nameLowerCase === optionsNameLowerCase) {
          const urlge = template
            .replace('{{id}}', emote_id)
            .replace('{{format}}', format.length === 2 ? format[1] : format[0])
            .replace('{{theme_mode}}', theme_mode.length === 2 ? theme_mode[1] : theme_mode[0])
            .replace('{{scale}}', scale[sizege - 1]);

          return urlge;
        }
      }

      return undefined;
    } catch (error) {
      console.log(`Error at matchEmotes7TV --> ${error}`);
      return undefined;
    }
  }
  function matchEmotes7TV(emotes: any, isLowerCase: boolean, isInclude: boolean): string | undefined {
    try {
      for (const id in emotes) {
        //consts
        const emote = emotes[id];
        const is_animated = emote.data.animated;
        const urlge = emote.data.host.url;
        const name = isLowerCase ? String(emote.name).toLowerCase() : String(emote.name);
        const urlgeSuffix = '/' + size + 'x.' + (is_animated ? 'gif' : 'webp');

        //check
        if (
          isInclude ? name.includes(optionsNameLowerCase) : name === (isLowerCase ? optionsNameLowerCase : optionsName)
        ) {
          return urlgePrefix + urlge + urlgeSuffix;
        }
      }

      return undefined;
    } catch (error) {
      console.log(`Error at matchEmotes7TV --> ${error}`);
      return undefined;
    }
  }

  function matchEmotesBTTV(emotes: any): string | undefined {
    try {
      //size 4 is not accaptable, work with size 2
      const sizege = size === 4 ? 2 : size;

      for (const id in emotes) {
        //consts
        const emote = emotes[id];
        const is_animated = emote.animated;
        const urlge = emote.id;
        const nameLowerCase = String(emote.code).toLowerCase();
        const urlgeSuffix = '/' + sizege + 'x.' + (is_animated ? 'gif' : 'webp');

        //check
        if (nameLowerCase === optionsNameLowerCase) {
          return urlgePrefixBTTV + urlge + urlgeSuffix;
        }
      }

      return undefined;
    } catch (error) {
      console.log(`Error at matchEmotesBTTV --> ${error}`);
      return undefined;
    }
  }

  function matchEmotesFFZ(emotes: any): string | undefined {
    try {
      //size 4 is not accaptable, work with size 2
      const sizege = size === 3 ? 2 : size;

      for (const id in emotes) {
        //consts
        const emote = emotes[id];
        const nameLowerCase = String(emote.name).toLowerCase();
        const urlge = emote.urls[sizege];

        //check
        if (nameLowerCase === optionsNameLowerCase) {
          return urlge;
        }
      }

      return undefined;
    } catch (error) {
      console.log(`Error at matchEmotesFFZ --> ${error}`);
      return undefined;
    }
  }

  //7TV CuteDog
  //cacheReq & emotes
  const cachereq7TV_CD = await cacheReq(options7TVCuteDog);
  const emotes7TV_CD = cachereq7TV_CD.emotes;
  //matchEmotes - default check
  const matchemotes7TV_CD_1 = matchEmotes7TV(emotes7TV_CD, false, false);
  if (matchemotes7TV_CD_1 !== undefined) return matchemotes7TV_CD_1;
  //matchEmotes - lowercase check
  const matchemotes7TV_CD_2 = matchEmotes7TV(emotes7TV_CD, true, false);
  if (matchemotes7TV_CD_2 !== undefined) return matchemotes7TV_CD_2;

  //7TV Global
  //cacheReq & emotes
  const cachereq7TV_G = await cacheReq(options7TVGlobal);
  const emotes7TV_G = cachereq7TV_G.emotes;
  //matchEmotes
  const matchemotes7TV_G = matchEmotes7TV(emotes7TV_G, true, false);
  if (matchemotes7TV_G !== undefined) return matchemotes7TV_G;

  //BTTV CuteDog
  //cacheReq
  const cachereqBTTV_CD = await cacheReq(optionsBTTVCuteDog);

  //BTTV CuteDog 1-2 Channel Emotes
  //emotes
  const emotesBTTV_CD_1 = cachereqBTTV_CD['channelEmotes'];
  //matchEmotes
  const matchemotesBTTV_CD_1 = matchEmotesBTTV(emotesBTTV_CD_1);
  if (matchemotesBTTV_CD_1 !== undefined) return matchemotesBTTV_CD_1;

  //BTTV CuteDog 2-2 Shared Emotes
  //emotes
  const emotesBTTV_CD_2 = cachereqBTTV_CD['sharedEmotes'];
  //matchEmotes
  const matchemotesBTTV_CD_2 = matchEmotesBTTV(emotesBTTV_CD_2);
  if (matchemotesBTTV_CD_2 !== undefined) return matchemotesBTTV_CD_2;

  //BTTV Global
  //cacheReq & emotes
  const cachereqBTTV_G = await cacheReq(optionsBTTVGlobal);
  const emotesBTTV_G = cachereqBTTV_G;
  //matchEmotes
  const matchemotesBTTV_G = matchEmotesBTTV(emotesBTTV_G);
  if (matchemotesBTTV_G !== undefined) return matchemotesBTTV_G;

  //FFZ Cutedog
  //cacheReq & emotes
  const cachereqFFZ_CD = await cacheReq(optionsFFZCutedog);
  const emotesFFZ_CD = cachereqFFZ_CD.sets['295317'].emoticons;
  //matchEmotes
  const matchemotesFFZ_CD = matchEmotesFFZ(emotesFFZ_CD);
  if (matchemotesFFZ_CD !== undefined) return matchemotesFFZ_CD;

  //FFZ Global
  //cacheReq & emotes
  const cachereqFFZ_G = await cacheReq(optionsFFZGlobal);
  const emotesFFZ_G = cachereqFFZ_G.sets['3'].emoticons;
  //matchEmotes
  const matchemotesFFZ_G = matchEmotesFFZ(emotesFFZ_G);
  if (matchemotesFFZ_G !== undefined) return matchemotesFFZ_G;

  //Twitch Global
  //options
  const optionsTwitchGlobal = await getOptionsTwitchGlobal(access_tokenge);
  if (optionsTwitchGlobal !== undefined) {
    //cacheReq & emotes
    const cachereqTwitch_G = await cacheReq(optionsTwitchGlobal);
    const templateTwitch_G = String(cachereqTwitch_G.template);
    const emotesTwitch_G = cachereqTwitch_G.data;

    //matchEmotes
    const matchemotesTwitch_G = matchEmotesTwitchGlobal(emotesTwitch_G, templateTwitch_G);
    if (matchemotesTwitch_G !== undefined) return matchemotesTwitch_G;
  }

  //7TV CuteDog - Last check, if nothing matched so far
  //matchEmotes - lowercase include check
  const matchemotes7TV_CD_3 = matchEmotes7TV(emotes7TV_CD, true, true);
  if (matchemotes7TV_CD_3 !== undefined) return matchemotes7TV_CD_3;

  return;
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
    //name
    await interaction.deferReply();
    const optionsName = String(interaction.options.get('name').value);

    //size
    const optionsSize: string = interaction.options.get('size')?.value as string;
    const size = optionsSize === undefined ? 2 : parseInt(optionsSize);

    const ret = await matchEmotes(optionsName, size);
    if (ret) {
      await interaction.editReply(ret);
      return;
    }

    //no emote found. reply
    await interaction.editReply('jij');
    return;
  }

  if (interaction.commandName === 'combine') {
    //name
    await interaction.deferReply();
    const query = String(interaction.options.get('emotes').value);
    const emotes = query.split(' ');

    const emoteUrls = [];
    for (const i in emotes) {
      if (emotes[i] == '') {
        continue;
      }
      const url = await matchEmotes(emotes[i], 4);
      if (url) {
        emoteUrls.push(url);
      }
    }
    const outdir = path.join('temp_gifs', interaction.id);
    fs.ensureDirSync(outdir);
    // Dont need try catch if it works 100% of the time YEP
    const ffmpeg_process = await stackGifs(emoteUrls, outdir);

    ffmpeg_process.on(
      'close',
      (function (interaction) {
        //Here you can get the exit code of the script
        return function (code) {
          if (code == 0) {
            interaction.editReply({ files: [path.join(outdir, 'output.gif')] }).then((message) => {
              fs.removeSync(outdir);
            });
            return;
          }
          interaction.editReply({ content: 'gif creation failed' });
          fs.removeSync(outdir);
        };
      })(interaction) // closure to keep |interaction|
    );
  }

  //interaction chatgpt
  if (interaction.commandName === 'chatgpt') {
    try {
      const text: string = interaction.options.get('text').value as string;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: text }]
      });

      await interaction.reply(completion.choices[0].message.content);
      return;
    } catch (error) {
      console.log(`Error at chatgpt --> ${error}`);
      return;
    }
  }

  //interaction translate
  if (interaction.commandName === 'translate') {
    try {
      const text = interaction.options.get('text').value;

      translateText(text, 'en')
        .then((res: string) => {
          interaction.reply(res);
          return;
        })
        .catch((err) => {
          console.log(err);
          return;
        });
    } catch (error) {
      console.log(`Error at translate --> ${error}`);
      return;
    }
  }

  //interaction help
  if (interaction.commandName === 'help') {
    try {
      interaction.reply(
        'https://cdn.discordapp.com/attachments/251211223012474880/1300042554934300722/image.png?ex=671f667a&is=671e14fa&hm=703c0932387a3bc78522323b9f1d7ba21440b18921d6405e9899b14a4d1b96eb&'
      );
      return;
    } catch (error) {
      console.log(`Error at help --> ${error}`);
      return;
    }
  }
});

//login
client.login(process.env.DISCORD_TOKEN);
