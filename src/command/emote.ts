import { CommandInteraction, EmbedAssertions } from 'discord.js';
import { AssetInfo, EmoteMatcher } from '../emoteMatcher';
import { exec, spawn } from 'child_process';
import fetch from 'node-fetch';
import { writeFile, rm } from 'node:fs/promises';
import * as path from 'path';
import * as fs from 'fs-extra';

interface DownloadedAsset {
  filename: string;
  asset: AssetInfo;
  w: number;
  h: number;
  duration: number; // stills are -1
  fps: number;
}

interface HstackElement {
  id: number;
  filterString: (setFps: boolean, fps : string) => Promise<string>;
}

class SimpleElement implements HstackElement {
  id: number;
  asset: DownloadedAsset;

  constructor(id: number, asset: DownloadedAsset) {
    this.id = id;
    this.asset = asset;
  }

  async filterString(setFps: boolean, fps : string): Promise<string> {
    if (setFps) {
      return `[${this.id}:v]scale=-1:64,fps=${fps}[o${this.id}];`;
    }
    return `[${this.id}:v]scale=-1:64[o${this.id}];`;
  }
}

interface Layer {
  id: number;
  asset: AssetInfo[];
}

class OverlayElement implements HstackElement {
  id: number;
  layers: DownloadedAsset[];
  w: number;
  h: number;
  durationSeconds: number; // NaN => not animated

  constructor(id: number, layers: DownloadedAsset[], height: number) {
    this.id = id;
    this.layers = layers;
    this.h = height;
  }

  async _getMaxWidth(scaleToHeight: number): Promise<number> {
    const scaledWidth: number[] = this.layers.map((layer) => {
      return (layer.w / layer.h) * scaleToHeight;
    });
    return Math.max(...scaledWidth);
  }

  async filterString(setFps: boolean, fps: string): Promise<string> {
    this.w = await this._getMaxWidth(this.h);

    const segments: string[] = new Array();

    let id: number = this.id;
    // first layer, pad the canvas
    segments.push(`[${this.id}]scale=-1:64`);
    if (setFps) {
      segments.push(`,fps=${fps}`);
    }
    segments.push(`,pad=${this.w}:${this.h}:-1:-1:color=black@0.0[o${this.id}];`);
    id++;

    // other layers
    for (const _ in this.layers.slice(1)) {
      segments.push(`[${id}]scale=-1:64`);
      if (setFps) {
        segments.push(`,fps=${fps}`);
      }
      segments.push(`[v${id}];[o${this.id}][v${id}]overlay=(W-w)/2:(H-h)/2[o${this.id}];`);
      id++;
    }

    return segments.join('');
    //// SURELY IT WORKS
  }
}

async function _getDimension(filename: string): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 ${filename}`,
      (error, stdout, stderr) => {
        if (error) {
          reject(`Error getting widthAndHeight: ${stderr}`);
          return;
        }
        const widthAndHeight = stdout.trim();

        if (widthAndHeight === 'N/A' || widthAndHeight === '') {
          reject();
        } else {
          const widthAndHeight2 = widthAndHeight.split('x');
          const width = Number(widthAndHeight2[0]);
          const height = Number(widthAndHeight2[1]);
          resolve([width, height]);
        }
      }
    );
  });
}

async function _getDuration(filename: string): Promise<number> {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${filename}"`,
      (error, stdout, stderr) => {
        if (error) {
          reject(`Error getting duration: ${stderr}`);
          return;
        }
        const duration = stdout.trim();
        const default_duration = -1;
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

async function downloadAsset(outdir: string, asset: AssetInfo, i: number): Promise<DownloadedAsset> {
  const response = await fetch(asset.url);
  const buffer = await response.buffer();
  const filename = path.join(outdir, `${i}_` + path.basename(asset.url));
  await writeFile(filename, buffer);

  const duration = asset.animated? await _getDuration(filename) : -1;
  let w : number, h : number;
  if( asset.width && asset.height ) [w,h] = [asset.width, asset.height];
  else [w,h] = await _getDimension(filename);
  console.log([w,h])
  let fps : number = (duration !== -1 && asset.frame_count) ? (asset.frame_count/duration) : -1;

  return {
    filename: filename,
    asset: asset,
    w: w,
    h: h,
    duration: duration,
    fps: fps
  };
}

export function emoteHandler() {
  return async (interaction: CommandInteraction, em: EmoteMatcher) => {
    const outdir = String(interaction.id);
    try {
      const defer = interaction.deferReply();
      const tokens: string[] = String(interaction.options.get('name').value).trim().split(/\s+/);
      const assets = em.matchMulti(tokens);

      for (const asset of assets) {
        if (asset === undefined) {
          await defer;
          await interaction.editReply('jij');
          return;
        }
      }

      if (assets.length == 1) {
        await defer;
        await interaction.editReply(assets[0].url);
        return;
      }

      const outdir = path.join('temp_gifs', String(interaction.id));
      fs.ensureDirSync(outdir);

      const downloadedAssets: DownloadedAsset[] = await Promise.all(
        assets.map((asset, i) => downloadAsset(outdir, asset, i))
      );

      const maxDuration: number = Math.max(...downloadedAssets.map((layer) => layer.duration));
      const validfpsAssests = downloadedAssets.filter(asset=>asset.fps !== -1);
      const sumFps = validfpsAssests.map(asset=>asset.fps).reduce((a, b) => a + b,0);
      const avgFps = (sumFps / validfpsAssests.length).toFixed(0) || String(0);

      // at least 2
      let boundary: number = 0;
      let i: number = 0;
      const elements: HstackElement[] = new Array();
      for (; i < downloadedAssets.length; i++) {
        if (!assets[i].zero_width) {
          // new group
          if (i == boundary + 1) {
            // single element
            elements.push(new SimpleElement(boundary, downloadedAssets[boundary]));
            boundary = i;
          } else if (i > boundary) {
            // at least 2
            elements.push(new OverlayElement(boundary, downloadedAssets.slice(boundary, i), 64));
            boundary = i;
          }
        }
      }

      // don't forget last one
      if (i == boundary + 1) {
        // single element
        elements.push(new SimpleElement(boundary, downloadedAssets[boundary]));
      } else if (i > boundary) {
        // at least 2
        elements.push(new OverlayElement(boundary, downloadedAssets.slice(boundary, i), 64));
      }

      const animated: boolean = maxDuration != -1;

      const args: string[] = new Array();

      downloadedAssets.forEach((asset) => {
        if (animated && asset.duration > 0) {
          args.push('-stream_loop');
          args.push('-1');
          args.push('-t');
          args.push(`${maxDuration}`);
        }
        args.push('-i');
        args.push(`${asset.filename}`);
      });
      args.push('-filter_complex');

      let filter: string[] = await Promise.all(elements.map((e) => e.filterString(animated, avgFps)));

      // hstack
      if (elements.length > 1) {
        filter.push(elements.map((e) => `[o${e.id}]`).join(''));
        filter.push(`hstack=inputs=${elements.length}`);
      } else {
        filter.push(`[o0]scale`); // only to point the output stream
      }

      if (animated) {
        filter.push(',split=2[stacked][palette];[palette]palettegen[p];[stacked][p]paletteuse');
      }
      args.push(filter.join(''));

      args.push('-y');
      args.push('-fs');
      args.push('25M');

      const outfile = path.join(outdir, animated ? 'output.gif' : 'output.png');
      args.push(outfile);

      const ffmpeg = spawn('ffmpeg', args);

      console.log("ffmpeg '" + args.join("' '") + "'");

      ffmpeg.on(
        'close',
        (function (interaction, defer) {
          //Here you can get the exit code of the script
          return async function (code) {
            if (code == 0) {
              await defer;
              await interaction.editReply({ files: [outfile] }).then((message) => {
                rm(outdir, { recursive: true });
              });
              return;
            }
            await defer;
            await interaction.editReply({ content: 'gif creation failed' }).then((message) => {
              rm(outdir, { recursive: true });
            });
          };
        })(interaction, defer) // closure to keep |interaction|
      );

      await defer;
    } catch (error) {
    } finally {
      // rm(outdir, { recursive: true })
    }
  };
}
