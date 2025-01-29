import { spawn } from 'child_process';
import { join } from 'path';
import { ensureDirSync } from 'fs-extra';
import { rm } from 'node:fs/promises';

import type { CommandInteraction } from 'discord.js';

import { GUILD_ID_CUTEDOG } from '../guilds.js';
import { downloadAsset } from '../utils/download-asset.js';
import { maxPlatformSize, emoteSizeChange, assetSizeChange } from '../utils/size-change.js';
import { parseToken } from '../utils/parse-token.js';
import type { CachedUrl } from '../api/cached-url.js';
import type { AssetInfo, DownloadedAsset, HstackElement } from '../types.js';
import type { EmoteMatcher } from '../emote-matcher.js';
import { TMP_DIR } from '../paths-and-endpoints.js';

const DEFAULTFPS = 25;
const MAXWIDTH = 192;
const MAXHEIGHT = 64;
const DOWNLOAD_ASSET_ERROR_MESSAGE = 'Failed to download asset(s).';

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
    let filterString = `[${this.id}:v]scale=${this.width}:${this.heigth}:force_original_aspect_ratio=decrease,pad=h=${this.heigth}:x=-1:y=-1:color=black@0.0`;

    if (this.animated) filterString += `,fps=${DEFAULTFPS}`;
    filterString += `[o${this.id}];`;

    return filterString;
  }
}

class OverlayElement implements HstackElement {
  public readonly id: number;
  private readonly layers: readonly DownloadedAsset[];
  private readonly fullSize: boolean;
  private readonly stretch: boolean;
  private readonly height: number;
  private readonly width: number;

  public constructor(
    id: number,
    layers: readonly DownloadedAsset[],
    fullSize: boolean,
    stretch: boolean,
    width: number,
    height: number
  ) {
    this.id = id;
    this.layers = layers;
    this.fullSize = fullSize;
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
      const segmentWidth = this.stretch ? this.width : this.fullSize ? this.layers[layerId].width : -1;
      const segmentHeight = this.stretch ? this.height : this.fullSize ? this.layers[layerId].height : MAXHEIGHT;

      segments.push(`[${id}]scale=${segmentWidth}:${segmentHeight}`);

      if (this.layers[layerId].animated) segments.push(`,fps=${DEFAULTFPS}`);
      segments.push(`[v${id}];[o${this.id}][v${id}]overlay=(W-w)/2:(H-h)/2[o${this.id}];`);

      id++;
      layerId++;
    });

    return segments.join('');
  }
}

export function emoteHandler(emoteMatcher: Readonly<EmoteMatcher>, cachedUrl: Readonly<CachedUrl>) {
  return async (interaction: CommandInteraction): Promise<void> => {
    const defer = interaction.deferReply();
    const outdir = join(TMP_DIR, String(interaction.id));

    try {
      const tokens: readonly string[] = String(interaction.options.get('name')?.value).trim().split(/\s+/);
      const size = ((): number | undefined => {
        const sizeOptions = interaction.options.get('size')?.value;
        return sizeOptions !== undefined ? Number(sizeOptions) : undefined;
      })();
      const fullSize = Boolean(interaction.options.get('fullsize')?.value);
      const stretch = Boolean(interaction.options.get('stretch')?.value);
      const emoteNotFoundReply = interaction.guildId === GUILD_ID_CUTEDOG ? 'jij' : 'emote not found';

      if (tokens.length === 1) {
        const [token] = tokens;
        const match = emoteMatcher.matchSingle(token);

        if (match === undefined) {
          await defer;
          try {
            new URL(token);
            await interaction.editReply('posting link through Botge wtf');
          } catch {
            await interaction.editReply(emoteNotFoundReply);
          }
          return;
        }

        const { url, platform } = match;
        const reply = fullSize
          ? emoteSizeChange(url, maxPlatformSize(platform), platform)
          : size !== undefined
            ? emoteSizeChange(url, size, platform)
            : url;

        await defer;
        await interaction.editReply(reply);
        return;
      }

      //dir sync only if multiple emotes
      ensureDirSync(outdir);

      const assetsWithUndefined: readonly (AssetInfo | string | undefined)[] = await Promise.all(
        emoteMatcher
          .matchMulti(tokens)
          .map(async (match, i) =>
            match !== undefined
              ? fullSize
                ? assetSizeChange(match, maxPlatformSize(match.platform))
                : size !== undefined
                  ? assetSizeChange(match, size)
                  : match
              : parseToken(tokens[i], fullSize)
          )
      );
      const assets: readonly (AssetInfo | string)[] = assetsWithUndefined.filter((asset) => asset !== undefined);

      if (assetsWithUndefined.some((asset) => asset === undefined)) {
        await defer;
        await interaction.editReply(emoteNotFoundReply);
        return;
      }

      const downloadedAssets: readonly DownloadedAsset[] = (
        await Promise.all(assets.map(async (asset, i) => downloadAsset(outdir, asset, i, cachedUrl)))
      ).filter((downloadedAsset) => downloadedAsset !== undefined);
      if (downloadedAssets.length !== assets.length) throw new Error(DOWNLOAD_ASSET_ERROR_MESSAGE);

      const maxHeight = ((): number => {
        const maxHeight_ = Math.max(...downloadedAssets.map((asset) => asset.height));
        return fullSize ? (maxHeight_ % 2 === 0 ? maxHeight_ : maxHeight_ + 1) : MAXHEIGHT;
      })();
      const maxWidth = fullSize ? getMaxWidth(downloadedAssets, maxHeight) : MAXWIDTH;

      const elements: HstackElement[] = [];
      (() : void => {
        // at least 2
        let boundary = 0;
        let i = 0;
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
                new OverlayElement(
                  boundary,
                  downloadedAssets.slice(boundary, i),
                  fullSize,
                  stretch,
                  maxWidth,
                  maxHeight
                )
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
          elements.push(
            new OverlayElement(boundary, downloadedAssets.slice(boundary, i), fullSize, stretch, maxWidth, maxHeight)
          );
        }
      })();

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

      if (animated) filter.push(',split=2[stacked][palette];[palette]palettegen[p];[stacked][p]paletteuse');
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
        (() => {
          //Here you can get the exit code of the script
          return async function (code: number): Promise<void> {
            await defer;
            if (code === 0) await interaction.editReply({ files: [outfile] });
            else await interaction.editReply('gif creation failed');
            void rm(outdir, { recursive: true });
          };
        })()
      );

      await defer;
    } catch (error: unknown) {
      console.log(`Error at emoteHandler --> ${error instanceof Error ? error : 'error'}`);
      const editReplyMessage =
        error instanceof Error && error.message === DOWNLOAD_ASSET_ERROR_MESSAGE
          ? 'failed to download gif(s)/png(s)'
          : 'gif creation failed.';

      await defer;
      await interaction.editReply(editReplyMessage);
      void rm(outdir, { recursive: true });

      return;
    }
  };
}
