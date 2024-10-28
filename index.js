import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { spawn } = require('node:child_process');
const { unlink } = require('node:fs');


import dotenv from 'dotenv';
dotenv.config();

//import
import { Client } from 'discord.js';
import OpenAI from "openai";
import { v2 } from '@google-cloud/translate';

//client
const client = new Client( { intents: [] } );

//opanai
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
const translateText = async ( text, targetLanguage ) => {
  try {
      let [response] = await translate.translate( text, targetLanguage );
      return response;
  } catch ( error ) {
      console.log( `Error at translateText --> ${error}` );
      return 0;
  }
};

//consts
const url7TVCuteDog = "https://7tv.io/v3/emote-sets/01FDMJPSF8000CJ4MDR2FNZEQ3";
const url7TVGlobal = "https://7tv.io/v3/emote-sets/global";
const urlBTTVCuteDog = "https://api.betterttv.net/3/users/5809977263c97c037fc9e66c";
const urlBTTVGlobal = "https://api.betterttv.net/3/cached/emotes/global";
const urlFFZCutedog = "https://api.frankerfacez.com/v1/room/cutedog_";
const urlFFZGlobal = "https://api.frankerfacez.com/v1/set/global";


// returns a url, or undefined if not found
async function matchEmotes(query, size) {
    let optionsName = query;
    let optionsNameLowerCase = query.toLowerCase();

    //urlge
    const urlgePrefix = "https:";
    const urlgePrefixBTTV = "https://cdn.betterttv.net/emote/";

    //size invalid
    if( !(size > 0 && size < 5) ) return;

    // emotes
    let emotes;


    //7TV CuteDog
    //fetch
    emotes = await fetch( url7TVCuteDog )
    .then( res => res.json() )
    .then( out => { return out.emotes; } )
    .catch( function( err ) {
      console.log( `Error at Fetch 7TVCuteDog: ${err}` );
      return;
    });
    //1-3
    try {
    for( const id in emotes ) {
      //consts
      const is_animated = emotes[ id ].data.animated;
      const urlge = emotes[ id ].data.host.url;
      const name = emotes[ id ].name;
      const urlgeSuffix = "/" + size + "x." + ( is_animated ? "gif" : "webp" );

      //check
      if( name === optionsName ) {
        return  urlgePrefix + urlge + urlgeSuffix ;
      }
    } } catch ( error ) {
      console.log(`Error at 7TVCuteDog1 --> ${error}`);
      return;
    }
    //2-3
    try {
    for( const id in emotes ) {
      //consts
      const is_animated = emotes[ id ].data.animated;
      const urlge = emotes[ id ].data.host.url;
      const nameLowerCase = String(emotes[ id ].name).toLowerCase();
      const urlgeSuffix = "/" + size + "x." + ( is_animated ? "gif" : "webp" );

      //check
      if( nameLowerCase === optionsNameLowerCase ) {
        return urlgePrefix + urlge + urlgeSuffix ;
        return;
      }
    } } catch ( error ) {
      console.log(`Error at 7TVCuteDog2 --> ${error}`);
      return;
    }
    //3-3
    try {
    for( const id in emotes ) {
      //consts
      const is_animated = emotes[ id ].data.animated;
      const urlge = emotes[ id ].data.host.url;
      const nameLowerCase = String(emotes[ id ].name).toLowerCase();
      const urlgeSuffix = "/" + size + "x." + ( is_animated ? "gif" : "webp" );

      //check
      if( nameLowerCase.includes( optionsNameLowerCase ) ) {
        return urlgePrefix + urlge + urlgeSuffix ;
      }
    } } catch ( error ) {
      console.log( `Error at 7TVCuteDog3 --> ${error}` );
      return;
    }


    //7TV Global
    //fetch
    emotes = await fetch( url7TVGlobal )
    .then( res2 => res2.json() )
    .then( out2 => { return out2.emotes; } )
    .catch( function( err ) {
      console.log( `Error at Fetch 7TVGLOBAL: ${err}` );
      return;
    });
    //1-2
    try {
    for( const id in emotes ) {
      //consts
      const is_animated = emotes[ id ].data.animated;
      const urlge = emotes[ id ].data.host.url;
      const name = emotes[ id ].name;
      const urlgeSuffix = "/" + size + "x." + ( is_animated ? "gif" : "webp" );

      //check
      if( name === optionsName ) {
        return ( urlgePrefix + urlge + urlgeSuffix );
        return;
      }
    } } catch ( error ) {
      console.log( `Error at 7TVGlobal1 --> ${error}` );
      return;
    }
    //2-2
    try {
    for( const id in emotes ) {
      //consts
      const is_animated = emotes[ id ].data.animated;
      const urlge = emotes[ id ].data.host.url;
      const nameLowerCase = String(emotes[ id ].name).toLowerCase();
      const urlgeSuffix = "/" + size + "x." + ( is_animated ? "gif" : "webp" );

      //check
      if( nameLowerCase === optionsNameLowerCase ) {
        return ( urlgePrefix + urlge + urlgeSuffix );
        return;
      }
    } } catch ( error ) {
      console.log( `Error at 7TVGlobal2 --> ${error}` );
      return;
    }


    //BTTV CuteDog
    //fetch
    emotes = await fetch( urlBTTVCuteDog )
    .then( res3 => res3.json() )
    .then( out3 => { return out3[ "channelEmotes" ]; } )
    .catch( function( err ) {
      console.log( `Error at Fetch BTTVCuteDog: ${err}` );
      return;
    });
    //1-1
    try {
    for( const id in emotes ) {
      //size 4 is not accaptable
      if( size === 4 ) break;

      //consts
      const is_animated = emotes[ id ].animated;
      const urlge = emotes[ id ].id;
      const nameLowerCase = String( emotes[ id ].code ).toLowerCase();
      const urlgeSuffix = "/" + size + "x." + ( is_animated ? "gif" : "webp" );

      //check
      if( nameLowerCase === optionsNameLowerCase ) {
        return ( urlgePrefixBTTV + urlge + urlgeSuffix );
        return;
      }
    } } catch ( error ) {
      console.log(`Error at BTTVCuteDog --> ${error}`);
      return;
    }


    //BTTV Global
    //fetch
    emotes = await fetch( urlBTTVGlobal )
    .then( res4 => res4.json() )
    .then( out4 => { return out4; })
    .catch( function( err ) {
      console.log( `Error at Fetch BTTV: ${err}` );
      return;
    });
    //1-1
    try {
    for( const id in emotes ) {
      //size 4 is not acceptable
      if( size === 4 ) break;

      //consts
      const is_animated = emotes[ id ].animated;
      const urlge = emotes[ id ].id;
      const nameLowerCase = String( emotes[ id ].code ).toLowerCase();
      const urlgeSuffix = "/" + size + "x." + ( is_animated ? "gif" : "webp" );

      //check
      if( nameLowerCase === optionsNameLowerCase ) {
        return ( urlgePrefixBTTV + urlge + urlgeSuffix );
      }
    } } catch ( error ) {
      console.log( `Error at BTTV --> ${error}` );
      return;
    }


    //FFZ Cutedog
    //fetch
    emotes = await fetch( urlFFZCutedog )
    .then( res5 => res5.json() )
    .then( out5 => { return out5.sets[ "295317" ].emoticons; })
    .catch( function( err ) {
      console.log( `Error at Fetch FFZCutedog: ${err}` );
      return;
    });
    //1-1
    try {
    for( const id in emotes ) {
      //size 3 is not accaptable
      if( size === 3 ) break;

      //consts
      const nameLowerCase = String( emotes[ id ].name ).toLowerCase();
      const urlge = emotes[ id ].urls[ size ];

      //check
      if( nameLowerCase === optionsNameLowerCase ) {
        return ( urlge );
      }
    } } catch ( error ) {
      console.log(`Error at FFZCutedog --> ${error}`);
      return;
    }


    //FFZ Global
    //fetch
    emotes = await fetch( urlFFZGlobal )
    .then( res6 => res6.json() )
    .then( out6 => { return out6.sets[ "3" ].emoticons; } )
    .catch( function( err ) {
      console.log( `Error at Fetch FFZ: ${err}` );
      return;
    });
    //1-1
    try {
    for( const id in emotes ) {
      //size 3 is not acceptable
      if( size === 3 ) break;

      //consts
      const nameLowerCase = String(emotes[ id ].name).toLowerCase();
      const urlge = emotes[ id ].urls[ size ];

      //check
      if( nameLowerCase === optionsNameLowerCase ) {
        return ( urlge );
      }
    } } catch ( error ) {
      console.log( `Error at FFZ --> ${error}` );
      return;
    }
    return;
}

//on ready
client.on( 'ready', () => {
  console.log( `Logged in as ${client.user.tag}!` );
});

//interaction
client.on( 'interactionCreate', async interaction => {
  //interaction not
  //interaction not
  if ( !interaction.isChatInputCommand() ) return;

  //interaction emote
  //interaction emote
  if ( interaction.commandName === 'emote' ) {
    //name
    const optionsName = String( interaction.options.get( 'name' ).value );

    //size
    const optionsSize = interaction.options.get( 'size' );
    const size = ( optionsSize === null ? 2 : parseInt( optionsSize.value ) );

    
    const ret = await matchEmotes(optionsName, size);
    if (ret) {
     interaction.reply(ret);
     return;
    }

    //no emote found. reply
    interaction.reply( "jij" );
    return;
  }

  if ( interaction.commandName === 'combine' ) {
    //name
    await interaction.deferReply();
    const query = String( interaction.options.get( 'emotes' ).value );
    const emotes = query.split(' ');

    let emoteUrls = [];
    for (var i in emotes) {
      if (emotes[i] == "") {
        continue;
      }
      let url = await matchEmotes(emotes[i], 4);
      if (url) { emoteUrls.push(url); }
    }


    let args = [];
    for (var i in emoteUrls) {
      args.push("-i");
      args.push(emoteUrls[i]);
    }


    args.push("-filter_complex")
    let filter = []

    // align everything to height=64px
    for (let i = 0; i< emoteUrls.length; i++) {
      filter.push("[" + i + "]scale=h=64:w=-1[" + i + 's];');
    }
    for (let i = 0; i< emoteUrls.length; i++) {
      filter.push("[" + i + 's]');
    }

    //hstack
    filter.push('hstack=inputs=' + emoteUrls.length);
    // make gif
    filter.push(',fps=fps=30,split=2[s][1p];[1p]palettegen[p];[s][p]paletteuse')

    args.push(filter.join(''));
    let gifname = "" + interaction.id + ".gif";
    args.push(gifname);

    const ffmpeg = spawn( "ffmpeg" , args);
    ffmpeg.on('close', async function(code) {


      if (code == 0) {
        await interaction.editReply({content: "", files: [gifname]}).then();
      } else {
        console.log('ffmpeg '+ args.join(' '))
        await interaction.editReply('conversion failed');
      }
      // delete file.
      unlink(gifname, (err) => {
      });
    });
  }


  //interaction chatgpt
  //interaction chatgpt
  if ( interaction.commandName === 'chatgpt' ) {
    try {
      const text = interaction.options.get( 'text' ).value;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {"role": "user", "content": text }
        ]
      });
    
      await interaction.reply( completion.choices[ 0 ].message.content );
      return;
    } catch ( error ) {
      console.log( `Error at chatgpt --> ${error}` );
      return;
    }
  }

  //interaction translate
  //interaction translate
  if ( interaction.commandName === 'translate' ) {
    try {
      const text = interaction.options.get( 'text' ).value;

      translateText( text, 'en' )
      .then( ( res ) => {
        interaction.reply( res );
        return;
     })
      .catch( ( err ) => {
        console.log( err );
        return;
     }); } catch ( error ) {
      console.log(`Error at translate --> ${error}`);
      return;
    }
  }

  //interaction help
  //interaction help
  if ( interaction.commandName === 'help' ) {
    try {
      interaction.reply( "https://cdn.discordapp.com/attachments/251211223012474880/1300042554934300722/image.png?ex=671f667a&is=671e14fa&hm=703c0932387a3bc78522323b9f1d7ba21440b18921d6405e9899b14a4d1b96eb&" );
      return;
    } catch ( error ) {
      console.log( `Error at help --> ${error}` );
      return;
    }
  }
});

//login
client.login( process.env.DISCORD_TOKEN );