import { exec, spawn, type ExecException } from 'child_process';
import { join, basename } from 'path';
import { ensureDirSync } from 'fs-extra';
import fetch from 'node-fetch';
import { writeFile, rm } from 'node:fs/promises';

import type { CommandInteraction } from 'discord.js';

import { Platform, type AssetInfo, type IEmoteMatcher } from '../emoteMatcher.js';

const DEFAULTDURATION = 0;
const DEFAULTFPS = 25;
const MAXWIDTH = 192;
const MAXHEIGHT = 64;

interface DownloadedAsset {
  readonly filename: string;
  readonly asset: AssetInfo;
  readonly w: number | undefined;
  readonly h: number | undefined;
  readonly duration: number; // stills are DEFAULTDURATION
  readonly animated: boolean;
}

interface HstackElement {
  readonly id: number;
  readonly animated: boolean;
  readonly filterString: () => string;
}

class SimpleElement implements HstackElement {
  public readonly id: number;
  public readonly asset: DownloadedAsset;
  public readonly animated: boolean;

  public constructor(id: number, asset: DownloadedAsset) {
    this.id = id;
    this.asset = asset;
    this.animated = this.asset.animated;
  }

  public filterString(): string {
    let filterString = `[${this.id}:v]scale=${MAXWIDTH}:${MAXHEIGHT}:force_original_aspect_ratio=decrease`;
    if (this.animated) filterString += `,fps=${DEFAULTFPS},pad=h=${MAXHEIGHT}:x=-1:y=-1:color=black@0.0`;
    filterString += `[o${this.id}];`;
    return filterString;
  }
}

class OverlayElement implements HstackElement {
  public readonly id: number;
  public readonly layers: readonly DownloadedAsset[];
  public readonly w: number | undefined;
  public readonly h: number;
  //durationSeconds: number; // NaN => not animated
  public readonly animated: boolean;

  public constructor(id: number, layers: readonly DownloadedAsset[], height: number) {
    this.id = id;
    this.layers = layers;
    this.h = height;
    this.w = this._getMaxWidth(this.h);
    this.animated = this.layers.some((layer: DownloadedAsset) => layer.animated);
  }

  public filterString(): string {
    const segments: string[] = [];

    let id: number = this.id;
    let layerId = 0;
    // first layer, pad the canvas
    segments.push(`[${this.id}]scale=${MAXWIDTH}:${MAXHEIGHT}:force_original_aspect_ratio=decrease`);
    if (this.animated && this.layers[layerId].animated) segments.push(`,fps=${DEFAULTFPS}`);
    segments.push(`,pad=${this.w}:${this.h}:-1:-1:color=black@0.0[o${this.id}];`);
    id++;
    layerId++;

    // other layers
    this.layers.slice(1).forEach(() => {
      segments.push(`[${id}]scale=-1:${MAXHEIGHT}`);
      if (this.animated && this.layers[layerId].animated) segments.push(`,fps=${DEFAULTFPS}`);
      segments.push(`[v${id}];[o${this.id}][v${id}]overlay=(W-w)/2:(H-h)/2[o${this.id}];`);
      id++;
      layerId++;
    });

    return segments.join('');
    //// SURELY IT WORKS
  }

  private _getMaxWidth(scaleToHeight: number): number {
    const scaledWidth: (number | undefined)[] = this.layers.map((layer: DownloadedAsset) => {
      return layer.w !== undefined && layer.h !== undefined ? (layer.w / layer.h) * scaleToHeight : undefined;
    });
    const ret: number = Math.round(Math.min(Math.max(...scaledWidth.filter((sW) => sW !== undefined)), MAXWIDTH));
    return ret % 2 === 0 ? ret : ret + 1; // rounds up to even number because of ffmpeg
  }
}

async function _getDimension(filename: string): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 ${filename}`,
      (error: Readonly<ExecException | null>, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        const widthAndHeight = stdout.trim();

        if (widthAndHeight === 'N/A' || widthAndHeight === '') {
          reject(new Error('Width and height is either N/A or empty.'));
        } else {
          const widthAndHeightSplit = widthAndHeight.split('x');
          const width = Number(widthAndHeightSplit[0]);
          const height = Number(widthAndHeightSplit[1]);
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
      (error: Readonly<ExecException | null>, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        const duration = stdout.trim();
        // Check if duration is "N/A" or empty, and use a default value
        if (duration === 'N/A' || duration === '') {
          reject(new Error('Duration is either N/A or empty.')); // or any default value you prefer
        } else {
          resolve(parseFloat(duration));
        }
      }
    );
  });
}

async function downloadAsset(outdir: string, asset: AssetInfo, i: number): Promise<DownloadedAsset> {
  const response = await fetch(asset.url);
  const buffer = await response.arrayBuffer();
  const { animated } = asset;
  const hasWidthAndHeight = asset.width !== undefined && asset.height !== undefined;
  const filename = join(outdir, `${i.toString()}_` + basename(asset.url));
  await writeFile(filename, Buffer.from(buffer));

  let duration: Promise<number> | number = DEFAULTDURATION;
  let widthAndHeight: Promise<[number, number]> | [number | undefined, number | undefined] = [
    asset.width,
    asset.height
  ];
  if (animated) {
    duration = _getDuration(filename);
  }
  if (!hasWidthAndHeight) {
    widthAndHeight = _getDimension(filename);
  }

  widthAndHeight = await widthAndHeight;
  duration = await duration;
  return {
    filename: filename,
    asset: asset,
    w: widthAndHeight[0],
    h: widthAndHeight[1],
    duration: duration,
    animated: duration !== DEFAULTDURATION
  };
}

export function emoteHandler(em: IEmoteMatcher) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    try {
      const tokens: string[] = String(interaction.options.get('name')?.value).trim().split(/\s+/);
      const matchMulti_: readonly (AssetInfo | undefined)[] = em.matchMulti(tokens);
      const assets: AssetInfo[] = matchMulti_.filter((asset: AssetInfo | undefined) => asset !== undefined);

      if (assets.length === 0) {
        await defer;
        await interaction.editReply('jij');
        return;
      }

      if (assets.length === 1) {
        const asset: AssetInfo = assets[0];
        const platform: Platform = asset.platform;
        const sizeString: string | undefined = String(interaction.options.get('size')?.value);
        const size: number | undefined = sizeString ? Number(sizeString) : undefined;
        let url: string = asset.url;

        if (size !== undefined) {
          if (size >= 1 && size <= 4) {
            if (platform === Platform.seven) {
              url = url.replace('/2x', `/${size}x`);
            } else if (platform === Platform.bttv) {
              if (size < 4) {
                url = url.replace('/2x', `/${size}x`);
              }
            } else if (platform === Platform.ffz) {
              if (size !== 3) {
                url = url.slice(0, -1) + `${size}`;
              }
            } else {
              if (size < 4) {
                url = url.replace('/2.0', `/${size}.0`);
              }
            }
          }
        }

        await defer;
        await interaction.editReply(url);
        return;
      }

      const outdir = join('tmp', String(interaction.id));
      ensureDirSync(outdir);

      const downloadedAssets: DownloadedAsset[] = await Promise.all(
        assets.map(async (asset: AssetInfo, i) => downloadAsset(outdir, asset, i))
      );

      // at least 2
      let boundary = 0;
      let i = 0;
      const elements: HstackElement[] = [];
      for (; i < downloadedAssets.length; i++) {
        if (!assets[i].zeroWidth) {
          // new group
          if (i === boundary + 1) {
            // single element
            elements.push(new SimpleElement(boundary, downloadedAssets[boundary]));
            boundary = i;
          } else if (i > boundary) {
            // at least 2
            elements.push(new OverlayElement(boundary, downloadedAssets.slice(boundary, i), MAXHEIGHT));
            boundary = i;
          }
        }
      }

      // don't forget last one
      if (i === boundary + 1) {
        // single element
        elements.push(new SimpleElement(boundary, downloadedAssets[boundary]));
      } else if (i > boundary) {
        // at least 2
        elements.push(new OverlayElement(boundary, downloadedAssets.slice(boundary, i), MAXHEIGHT));
      }

      const maxDuration: number = Math.max(...downloadedAssets.map((layer: DownloadedAsset) => layer.duration));
      const animated: boolean = maxDuration !== DEFAULTDURATION;

      const args: string[] = [];

      downloadedAssets.forEach((asset: DownloadedAsset) => {
        if (animated && asset.animated) {
          args.push('-stream_loop');
          args.push('-1');
          args.push('-t');
          args.push(`${maxDuration}`);
        }
        args.push('-i');
        args.push(asset.filename);
      });

      args.push('-filter_complex');
      const filter: string[] = elements.map((e: Readonly<HstackElement>) => e.filterString());

      // hstack
      if (elements.length > 1) {
        filter.push(elements.map((e: Readonly<HstackElement>) => `[o${e.id}]`).join(''));
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

      const outfile = join(outdir, animated ? 'output.gif' : 'output.png');
      args.push(outfile);

      const ffmpeg = spawn('ffmpeg', args);

      console.log("ffmpeg '" + args.join("' '") + "'");

      ffmpeg.on(
        'close',
        (function () {
          //Here you can get the exit code of the script
          return async function (code: number): Promise<void> {
            if (code === 0) {
              await defer;
              await interaction.editReply({ files: [outfile] }).then(() => {
                void rm(outdir, { recursive: true });
              });
              return;
            }
            await defer;
            await interaction.editReply({ content: 'gif creation failed' }).then(() => {
              void rm(outdir, { recursive: true });
            });
            return;
          };
        })() // closure to keep |interaction|
      );

      await defer;
    } catch (error) {
      console.log(error);

      await defer;
      return;
    }
    /*} finally {
      // rm(outdir, { recursive: true })
    }*/
  };
}
