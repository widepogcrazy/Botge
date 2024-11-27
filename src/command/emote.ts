import { spawn } from 'child_process';
import { join } from 'path';
import { ensureDirSync } from 'fs-extra';
import { rm } from 'node:fs/promises';
import { CachedUrl } from '../api/cached-url.js';

import type { CommandInteraction } from 'discord.js';

import { downloadAsset } from '../utils/downloadAsset.js';
import { maxPlatformSize, emoteSizeChange, assetSizeChange } from '../utils/sizeChange.js';
import { urlToAssetInfo } from '../utils/urlToAssetInfo.js';
import type { AssetInfo, DownloadedAsset, HstackElement } from '../types.js';

import type { EmoteMatcher } from '../emoteMatcher.js';

const DEFAULTFPS = 25;
const MAXWIDTH = 192;
const MAXHEIGHT = 64;

function getMaxWidth(layers: readonly DownloadedAsset[], scaleToHeight: number): number {
  const scaledWidth = layers.map((layer) => (layer.width / layer.height) * scaleToHeight);

  const ret: number = Math.round(Math.max(...scaledWidth));
  return ret % 2 === 0 ? ret : ret + 1; // rounds up to even number because of ffmpeg
}

class SimpleElement implements HstackElement {
  public readonly id: number;
  private readonly animated: boolean;
  private readonly asset: DownloadedAsset;
  private readonly width: number;
  private readonly heigth: number;

  public constructor(id: number, asset: DownloadedAsset, width: number, height: number) {
    this.id = id;
    this.asset = asset;
    this.width = width;
    this.heigth = height;
    this.animated = this.asset.animated;
  }

  public filterString(): string {
    let filterString = `[${this.id}:v]scale=${this.width}:${this.heigth}:force_original_aspect_ratio=decrease`;

    if (this.animated) filterString += `,fps=${DEFAULTFPS},pad=h=${this.heigth}:x=-1:y=-1:color=black@0.0`;
    filterString += `[o${this.id}];`;

    return filterString;
  }
}

class OverlayElement implements HstackElement {
  public readonly id: number;
  private readonly layers: readonly DownloadedAsset[];
  private readonly stretch: boolean;
  private readonly height: number;
  private readonly width: number;

  public constructor(id: number, layers: readonly DownloadedAsset[], stretch: boolean, width: number, height: number) {
    this.id = id;
    this.layers = layers;
    this.stretch = stretch;

    this.height = height;
    this.width = width !== MAXWIDTH ? width : Math.min(getMaxWidth(this.layers, this.height), MAXWIDTH);
  }

  public filterString(): string {
    const segments: string[] = [];

    let { id } = this;
    let layerId = 0;
    // first layer, pad the canvas
    segments.push(`[${this.id}]scale=${this.width}:${this.height}:force_original_aspect_ratio=decrease`);

    if (this.layers[layerId].animated) segments.push(`,fps=${DEFAULTFPS}`);

    //if (this.stretch) segments.push(`,pad=${this.width}:${this.height}:-1:-1:color=black@0.0[o${this.id}];`);
    segments.push(`,pad=${this.width}:${this.height}:-1:-1:color=black@0.0[o${this.id}];`);

    id++;
    layerId++;

    // other layers
    this.layers.slice(1).forEach(() => {
      segments.push(`[${id}]scale=${this.stretch ? this.width : -1}:${this.stretch ? this.height : MAXHEIGHT}`);

      if (this.layers[layerId].animated) segments.push(`,fps=${DEFAULTFPS}`);
      segments.push(`[v${id}];[o${this.id}][v${id}]overlay=(W-w)/2:(H-h)/2[o${this.id}];`);

      id++;
      layerId++;
    });

    return segments.join('');
  }
}

export function emoteHandler(em: Readonly<EmoteMatcher>, emoteEndpont: string, cachedUrl: CachedUrl) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    const outdir = join('tmp', String(interaction.id));
    try {
      const tokens: readonly string[] = String(interaction.options.get('name')?.value).trim().split(/\s+/);
      const sizeOptions = interaction.options.get('size')?.value;
      const size = sizeOptions !== undefined ? Number(sizeOptions) : undefined;
      const fullSize = Boolean(interaction.options.get('fullsize')?.value);
      const stretch = Boolean(interaction.options.get('stretch')?.value);

      const matchMulti_ = em.matchMulti(tokens);

      const assetsWithUndefined: readonly (AssetInfo | string | undefined)[] = await Promise.all(
        matchMulti_.map(async (asset, i) =>
          asset !== undefined
            ? fullSize
              ? assetSizeChange(asset, maxPlatformSize(asset.platform), emoteEndpont)
              : size !== undefined
                ? assetSizeChange(asset, size, emoteEndpont)
                : asset
            : urlToAssetInfo(tokens[i], emoteEndpont, fullSize)
        )
      );
      const assets: readonly (AssetInfo | string)[] = assetsWithUndefined.filter((asset) => asset !== undefined);

      if (assetsWithUndefined.some((asset) => asset === undefined)) {
        await defer;
        await interaction.editReply('jij');
        return;
      }

      if (assets.length === 1) {
        const [asset] = assets;

        if (typeof asset === 'string') {
          await defer;
          await interaction.editReply('sending link through Botge wtf');

          return;
        }

        await defer;
        await interaction.editReply(emoteSizeChange(asset.url, size, asset.platform));
        return;
      }

      ensureDirSync(outdir);

      const downloadedAssets: readonly DownloadedAsset[] = (
        await Promise.all(assets.map(async (asset, i) => downloadAsset(outdir, asset, i, cachedUrl)))
      ).filter((downloadedAsset) => downloadedAsset !== undefined);
      if (downloadedAssets.length !== assets.length) {
        throw new Error('Failed to download asset(s).');
      }

      const maxHeight_ = Math.max(...downloadedAssets.map((asset) => asset.height));
      const maxHeight = fullSize ? (maxHeight_ % 2 === 0 ? maxHeight_ : maxHeight_ + 1) : MAXHEIGHT;
      const maxWidth = fullSize ? getMaxWidth(downloadedAssets, maxHeight) : MAXWIDTH;

      // at least 2
      let boundary = 0;
      let i = 0;
      const elements: HstackElement[] = [];
      for (; i < downloadedAssets.length; i++) {
        const asset = assets[i];
        if ((typeof asset === 'object' && !asset.zeroWidth) || typeof asset === 'string') {
          // new group
          if (i === boundary + 1) {
            // single element
            elements.push(new SimpleElement(boundary, downloadedAssets[boundary], maxWidth, maxHeight));
            boundary = i;
          } else if (i > boundary) {
            // at least 2
            elements.push(
              new OverlayElement(boundary, downloadedAssets.slice(boundary, i), stretch, maxWidth, maxHeight)
            );
            boundary = i;
          }
        }
      }

      // don't forget last one
      if (i === boundary + 1) {
        // single element
        elements.push(new SimpleElement(boundary, downloadedAssets[boundary], maxWidth, maxHeight));
      } else if (i > boundary) {
        // at least 2
        elements.push(new OverlayElement(boundary, downloadedAssets.slice(boundary, i), stretch, maxWidth, maxHeight));
      }

      const maxDuration = Math.max(...downloadedAssets.map((layer) => layer.duration));
      const animated = downloadedAssets.some((asset) => asset.animated);

      const args: string[] = [];

      downloadedAssets.forEach((asset) => {
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
      const filter: string[] = elements.map((element) => element.filterString());

      // hstack
      if (elements.length > 1) {
        filter.push(elements.map((element) => `[o${element.id}]`).join(''));
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
    } catch (error: unknown) {
      console.log(`Error at emoteHandler --> ${error instanceof Error ? error : 'error'}`);

      await defer;
      await interaction.editReply('gif creation failed.');
      void rm(outdir, { recursive: true });
      return;
    }
  };
}
