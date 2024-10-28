import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { exec, spawn } = require('child_process');
const path = require('path');
const { unlink } = require('node:fs');
const fetch = require('node-fetch');
const fs = require('fs-extra');

import dotenv from 'dotenv';
dotenv.config();

//import
import { Client } from 'discord.js';
import OpenAI from 'openai';
import { v2 } from '@google-cloud/translate';

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

//consts
const url7TVCuteDog = 'https://7tv.io/v3/emote-sets/01FDMJPSF8000CJ4MDR2FNZEQ3';
const url7TVGlobal = 'https://7tv.io/v3/emote-sets/global';
const urlBTTVCuteDog = 'https://api.betterttv.net/3/users/5809977263c97c037fc9e66c';
const urlBTTVGlobal = 'https://api.betterttv.net/3/cached/emotes/global';
const urlFFZCutedog = 'https://api.frankerfacez.com/v1/room/cutedog_';
const urlFFZGlobal = 'https://api.frankerfacez.com/v1/set/global';

// Temporary storage for downloaded GIFs
const tempDir = './temp_gifs';
// Clear directory of temp gifs after each use
function resetDirectory() {
  try {
    // Ensure the directory exists
    fs.ensureDirSync(tempDir);
    
    // Remove the directory
    fs.removeSync(tempDir);
    
    // Ensure the directory exists again
    fs.ensureDirSync(tempDir);
    
    console.log(`Directory ${tempDir} has been reset.`);
  } catch (error) {
    console.error(`Error resetting directory: ${error.message}`);
  }
}
// Ensure the temporary directory exists and is empty (in case bot crashes mid-download)
resetDirectory();
// Function to download GIFs from URLs
async function downloadGifs(urls) {
  const downloadedFiles = [];
  let counter = 1;
  for (const url of urls) {
    const response = await fetch(url);
    const buffer = await response.buffer();
    let fileName = path.basename(url);
    fileName = `${counter}_${fileName}`;
    const filePath = path.join(tempDir, fileName);
    await fs.writeFile(filePath, buffer);
    downloadedFiles.push(filePath);
    counter++;
  }
  return downloadedFiles;
}


function getGifDuration(file) {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`,
      (error, stdout, stderr) => {
        if (error) {
          reject(`Error getting duration: ${stderr}`);
          return;
        }
        const duration = stdout.trim();
        const default_duration = 3 // :3
        // Check if duration is "N/A" or empty, and use a default value
        if (duration === "N/A" || duration === "") {
          resolve(default_duration); // or any default value you prefer
        } else {
          resolve(parseFloat(duration));
        }
      }
    );
  });
}


async function stackGifs(files) {
  try {
    resetDirectory();
    // Download GIFs - having local files is faster when using ffmpeg
    const downloadedFiles = await downloadGifs(files);
    // Get durations for each GIF
    const durations = await Promise.all(files.map(getGifDuration));
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
    args.push('output.gif');

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

  // emotes
  let emotes;

  //7TV CuteDog
  //fetch
  emotes = await fetch(url7TVCuteDog)
    .then((res) => res.json())
    .then((out) => {
      return out.emotes;
    })
    .catch(function (err) {
      console.log(`Error at Fetch 7TVCuteDog: ${err}`);
      return;
    });
  //1-3
  try {
    for (const id in emotes) {
      //consts
      const is_animated = emotes[id].data.animated;
      const urlge = emotes[id].data.host.url;
      const name = emotes[id].name;
      const urlgeSuffix = '/' + size + 'x.' + (is_animated ? 'gif' : 'webp');

      //check
      if (name === optionsName) {
        return urlgePrefix + urlge + urlgeSuffix;
      }
    }
  } catch (error) {
    console.log(`Error at 7TVCuteDog1 --> ${error}`);
    return;
  }
  //2-3
  try {
    for (const id in emotes) {
      //consts
      const is_animated = emotes[id].data.animated;
      const urlge = emotes[id].data.host.url;
      const nameLowerCase = String(emotes[id].name).toLowerCase();
      const urlgeSuffix = '/' + size + 'x.' + (is_animated ? 'gif' : 'webp');

      //check
      if (nameLowerCase === optionsNameLowerCase) {
        return urlgePrefix + urlge + urlgeSuffix;
        return;
      }
    }
  } catch (error) {
    console.log(`Error at 7TVCuteDog2 --> ${error}`);
    return;
  }
  //3-3
  try {
    for (const id in emotes) {
      //consts
      const is_animated = emotes[id].data.animated;
      const urlge = emotes[id].data.host.url;
      const nameLowerCase = String(emotes[id].name).toLowerCase();
      const urlgeSuffix = '/' + size + 'x.' + (is_animated ? 'gif' : 'webp');

      //check
      if (nameLowerCase.includes(optionsNameLowerCase)) {
        return urlgePrefix + urlge + urlgeSuffix;
      }
    }
  } catch (error) {
    console.log(`Error at 7TVCuteDog3 --> ${error}`);
    return;
  }

  //7TV Global
  //fetch
  emotes = await fetch(url7TVGlobal)
    .then((res2) => res2.json())
    .then((out2) => {
      return out2.emotes;
    })
    .catch(function (err) {
      console.log(`Error at Fetch 7TVGLOBAL: ${err}`);
      return;
    });
  //1-2
  try {
    for (const id in emotes) {
      //consts
      const is_animated = emotes[id].data.animated;
      const urlge = emotes[id].data.host.url;
      const name = emotes[id].name;
      const urlgeSuffix = '/' + size + 'x.' + (is_animated ? 'gif' : 'webp');

      //check
      if (name === optionsName) {
        return urlgePrefix + urlge + urlgeSuffix;
        return;
      }
    }
  } catch (error) {
    console.log(`Error at 7TVGlobal1 --> ${error}`);
    return;
  }
  //2-2
  try {
    for (const id in emotes) {
      //consts
      const is_animated = emotes[id].data.animated;
      const urlge = emotes[id].data.host.url;
      const nameLowerCase = String(emotes[id].name).toLowerCase();
      const urlgeSuffix = '/' + size + 'x.' + (is_animated ? 'gif' : 'webp');

      //check
      if (nameLowerCase === optionsNameLowerCase) {
        return urlgePrefix + urlge + urlgeSuffix;
        return;
      }
    }
  } catch (error) {
    console.log(`Error at 7TVGlobal2 --> ${error}`);
    return;
  }

  //BTTV CuteDog
  //fetch
  emotes = await fetch(urlBTTVCuteDog)
    .then((res3) => res3.json())
    .then((out3) => {
      return out3['channelEmotes'];
    })
    .catch(function (err) {
      console.log(`Error at Fetch BTTVCuteDog: ${err}`);
      return;
    });
  //1-1
  try {
    for (const id in emotes) {
      //size 4 is not accaptable
      if (size === 4) break;

      //consts
      const is_animated = emotes[id].animated;
      const urlge = emotes[id].id;
      const nameLowerCase = String(emotes[id].code).toLowerCase();
      const urlgeSuffix = '/' + size + 'x.' + (is_animated ? 'gif' : 'webp');

      //check
      if (nameLowerCase === optionsNameLowerCase) {
        return urlgePrefixBTTV + urlge + urlgeSuffix;
        return;
      }
    }
  } catch (error) {
    console.log(`Error at BTTVCuteDog --> ${error}`);
    return;
  }

  //BTTV Global
  //fetch
  emotes = await fetch(urlBTTVGlobal)
    .then((res4) => res4.json())
    .then((out4) => {
      return out4;
    })
    .catch(function (err) {
      console.log(`Error at Fetch BTTV: ${err}`);
      return;
    });
  //1-1
  try {
    for (const id in emotes) {
      //size 4 is not acceptable
      if (size === 4) break;

      //consts
      const is_animated = emotes[id].animated;
      const urlge = emotes[id].id;
      const nameLowerCase = String(emotes[id].code).toLowerCase();
      const urlgeSuffix = '/' + size + 'x.' + (is_animated ? 'gif' : 'webp');

      //check
      if (nameLowerCase === optionsNameLowerCase) {
        return urlgePrefixBTTV + urlge + urlgeSuffix;
      }
    }
  } catch (error) {
    console.log(`Error at BTTV --> ${error}`);
    return;
  }

  //FFZ Cutedog
  //fetch
  emotes = await fetch(urlFFZCutedog)
    .then((res5) => res5.json())
    .then((out5) => {
      return out5.sets['295317'].emoticons;
    })
    .catch(function (err) {
      console.log(`Error at Fetch FFZCutedog: ${err}`);
      return;
    });
  //1-1
  try {
    for (const id in emotes) {
      //size 3 is not accaptable
      if (size === 3) break;

      //consts
      const nameLowerCase = String(emotes[id].name).toLowerCase();
      const urlge = emotes[id].urls[size];

      //check
      if (nameLowerCase === optionsNameLowerCase) {
        return urlge;
      }
    }
  } catch (error) {
    console.log(`Error at FFZCutedog --> ${error}`);
    return;
  }

  //FFZ Global
  //fetch
  emotes = await fetch(urlFFZGlobal)
    .then((res6) => res6.json())
    .then((out6) => {
      return out6.sets['3'].emoticons;
    })
    .catch(function (err) {
      console.log(`Error at Fetch FFZ: ${err}`);
      return;
    });
  //1-1
  try {
    for (const id in emotes) {
      //size 3 is not acceptable
      if (size === 3) break;

      //consts
      const nameLowerCase = String(emotes[id].name).toLowerCase();
      const urlge = emotes[id].urls[size];

      //check
      if (nameLowerCase === optionsNameLowerCase) {
        return urlge;
      }
    }
  } catch (error) {
    console.log(`Error at FFZ --> ${error}`);
    return;
  }
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
    const optionsName = String(interaction.options.get('name').value);

    //size
    const optionsSize: string = interaction.options.get('size')?.value as string;
    const size = optionsSize === undefined ? 2 : parseInt(optionsSize);

    const ret = await matchEmotes(optionsName, size);
    if (ret) {
      interaction.reply(ret);
      return;
    }

    //no emote found. reply
    interaction.reply('jij');
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
    // Dont need try catch if it works 100% of the time YEP
    const ffmpeg_process = await stackGifs(emoteUrls);

    ffmpeg_process.on(
      'close',
      (function (interaction) {
        //Here you can get the exit code of the script
        return function (code) {
          if (code == 0) {
            interaction.editReply({ files: ['output.gif'] }).then((message) => {
              return unlink('output.gif', (err) => {});
            });
            return;
          }
          interaction.editReply({ content: 'gif creation failed' });
          unlink('output.gif', (err) => {});
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
