import { strToU8, zipSync } from "fflate";
import type { AnimeAction } from "../../.generated/xglib/contract";
import type { PreviewFrame } from "../viewer/preview";
import type { Decoded } from "./protocol";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
const MAX_PIXELS = 4_194_304;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;

export function actionBounds(frames: PreviewFrame[]): Bounds {
  if (!frames.length) throw new Error("目前動作沒有影格可下載。");
  if (frames.length > 4096) throw new Error("圖片集超過 4096 格下載上限。");
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const frame of frames) {
    if (!frame.image)
      throw new Error("目前動作有缺少或無法解碼的影格，無法下載完整圖片集。");
    const x = frame.flipX ? -frame.x - frame.image.width : frame.x;
    const y = frame.flipY ? -frame.y - frame.image.height : frame.y;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + frame.image.width);
    bottom = Math.max(bottom, y + frame.image.height);
  }
  const width = right - left,
    height = bottom - top;
  if (
    !Number.isSafeInteger(width * height) ||
    width <= 0 ||
    height <= 0 ||
    width > 8192 ||
    height > 8192 ||
    width * height > MAX_PIXELS
  )
    throw new Error(
      "對齊後的圖片尺寸超過下載上限（8192 邊長／4,194,304 像素）。",
    );
  return { x: left, y: top, width, height };
}

export async function graphicPng(image: Decoded): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("瀏覽器無法建立 PNG 畫布。");
    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(image.rgba),
        image.width,
        image.height,
      ),
      0,
      0,
    );
    return await canvasBlob(canvas);
  } finally {
    canvas.width = canvas.height = 0;
  }
}
function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG 編碼失敗。"))),
      "image/png",
    ),
  );
}

export interface AnimeDownload {
  frames: PreviewFrame[];
  action: AnimeAction;
  actionRow: number;
  id: number;
  row: number;
  sources: {
    graphic: string;
    anime: string;
    palette: string;
    hiddenPalette?: string;
  };
}

export async function animeZip(
  data: AnimeDownload,
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
): Promise<Blob> {
  signal.throwIfAborted();
  const bounds = actionBounds(data.frames);
  const canvas = document.createElement("canvas");
  const source = document.createElement("canvas");
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  const files: Record<string, Uint8Array> = {};
  const cache = new Map<Decoded, Uint8Array>();
  let bytes = 0;
  const header =
    "Standard" in data.action.header
      ? data.action.header.Standard
      : data.action.header.Extended;
  const directory = `action_${header.action}_direction_${header.direct}_row_${data.actionRow}`;
  const manifestFrames: object[] = [];
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("瀏覽器無法建立 PNG 畫布。");
    for (const [i, frame] of data.frames.entries()) {
      signal.throwIfAborted();
      const image = frame.image!;
      let png = cache.get(image);
      if (!png) {
        source.width = image.width;
        source.height = image.height;
        const pixels = source.getContext("2d");
        if (!pixels) throw new Error("瀏覽器無法建立 PNG 畫布。");
        pixels.putImageData(
          new ImageData(
            new Uint8ClampedArray(image.rgba),
            image.width,
            image.height,
          ),
          0,
          0,
        );
        context.clearRect(0, 0, bounds.width, bounds.height);
        context.save();
        context.translate(
          (frame.flipX ? -frame.x : frame.x) - bounds.x,
          (frame.flipY ? -frame.y : frame.y) - bounds.y,
        );
        context.scale(frame.flipX ? -1 : 1, frame.flipY ? -1 : 1);
        context.imageSmoothingEnabled = false;
        context.drawImage(source, 0, 0);
        context.restore();
        png = new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer());
        signal.throwIfAborted();
        cache.set(image, png);
      }
      bytes += png.byteLength;
      if (bytes > MAX_ARCHIVE_BYTES)
        throw new Error("PNG 圖片集超過 128 MiB 下載上限。");
      const name = `frame_${String(i + 1).padStart(4, "0")}_graphic_${data.action.frames[i].graphic_id}_row_${image.row}.png`;
      files[`${directory}/${name}`] = png;
      manifestFrames.push({
        file: `${directory}/${name}`,
        ...data.action.frames[i],
        graphicRow: image.row,
        graphicOffset: { x: image.offX, y: image.offY },
        warnings: image.warnings ?? [],
      });
      progress(i + 1, data.frames.length);
      // Let input and cancellation run even when all frames reuse cached PNGs.
      if (i % 16 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    files["manifest.json"] = strToU8(
      JSON.stringify(
        {
          version: 1,
          animeId: data.id,
          animeRow: data.row,
          actionRow: data.actionRow,
          sources: data.sources,
          header: data.action.header,
          bounds,
          origin: { x: -bounds.x, y: -bounds.y },
          frameDurationMs: header.duration / data.frames.length,
          frames: manifestFrames,
        },
        null,
        2,
      ),
    );
    signal.throwIfAborted();
    // PNG already compresses pixels; STORE avoids recompressing it on the UI thread.
    return new Blob([zipSync(files, { level: 0 })], {
      type: "application/zip",
    });
  } finally {
    canvas.width = canvas.height = source.width = source.height = 0;
  }
}

export function downloadName(source: string, id: number, row: number) {
  return `${source.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100)}_id_${id}_row_${row}`;
}
export function saveDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
