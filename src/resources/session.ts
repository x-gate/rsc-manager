import type * as Contract from "../../.generated/xglib/contract";
import type { ResourceSet } from "./catalog";
import type { Decoded, Entry, Kind } from "./protocol";
export const PAGE_SIZE = 60;
const MAX_BYTES = 16 * 1024 * 1024;
export function readIndex(
  bytes: Uint8Array,
  kind: Kind,
  dataSize: number,
): Entry[] {
  const stride = kind === "graphic" ? 40 : 12;
  if (bytes.length % stride)
    throw new Error(`${kind} 索引長度必須是 ${stride} 的倍數。`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: Entry[] = [];
  for (let offset = 0; offset < bytes.length; offset += stride) {
    const entry: Entry = {
      row: offset / stride,
      id: view.getInt32(offset, true),
      addr: view.getInt32(offset + 4, true),
      len: 0,
    };
    if (kind === "graphic")
      Object.assign(entry, {
        len: view.getInt32(offset + 8, true),
        offX: view.getInt32(offset + 12, true),
        offY: view.getInt32(offset + 16, true),
        width: view.getInt32(offset + 20, true),
        height: view.getInt32(offset + 24, true),
        mapId: view.getInt32(offset + 36, true),
      });
    else entry.actions = view.getInt16(offset + 8, true);
    entries.push(entry);
  }
  if (kind === "anime") {
    // xglib's documented container strategy: next distinct address, never ID order.
    const addresses = [
      ...new Set(
        entries.map((e) => e.addr).filter((a) => a >= 0 && a <= dataSize),
      ),
    ].sort((a, b) => a - b);
    const ends = new Map(
      addresses.map((a, i) => [a, addresses[i + 1] ?? dataSize]),
    );
    for (const entry of entries)
      entry.len = (ends.get(entry.addr) ?? entry.addr) - entry.addr;
  }
  return entries;
}
export function preflightAnime(bytes: Uint8Array, count: number) {
  if (count < 0 || count > 4096) throw new Error("動畫動作數超出上限。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0,
    total = 0;
  for (let action = 0; action < count; action++) {
    if (offset + 12 > bytes.length) throw new Error("動畫 header 截斷。");
    const frames = view.getInt32(offset + 8, true);
    const header =
      offset + 20 <= bytes.length && view.getInt32(offset + 16, true) === -1
        ? 20
        : 12;
    total += frames;
    if (
      frames < 0 ||
      total > 100_000 ||
      offset + header + frames * 10 > bytes.length
    )
      throw new Error("動畫 frame 數量或資料長度無效。");
    offset += header + frames * 10;
  }
  if (offset !== bytes.length) throw new Error("動畫切片有未解析的尾端資料。");
}
export class ResourceSession {
  private graphic?: ResourceSet;
  private anime?: ResourceSet;
  private graphicIndex = new Uint8Array();
  private animeIndex = new Uint8Array();
  private palette = new Uint8Array();
  private graphics: Entry[] = [];
  private animes: Entry[] = [];
  private ids = new Map<number, number[]>();
  constructor(private parser: typeof Contract) {}
  async initialize(
    graphic: ResourceSet,
    anime: ResourceSet | undefined,
    palette: File,
  ) {
    if (![672, 708].includes(palette.size))
      throw new Error("CGP 長度必須為 672 或 708 bytes。");
    if (
      graphic.info.file.size > 40_000_000 ||
      (anime?.info.file.size ?? 0) > 12_000_000
    )
      throw new Error("索引超過一百萬列上限。");
    this.palette = new Uint8Array(await palette.arrayBuffer());
    this.parser.game_palette_build_from_cgp(this.palette);
    this.graphicIndex = new Uint8Array(await graphic.info.file.arrayBuffer());
    this.animeIndex = anime
      ? new Uint8Array(await anime.info.file.arrayBuffer())
      : new Uint8Array();
    this.graphics = readIndex(
      this.graphicIndex,
      "graphic",
      graphic.data.file.size,
    );
    this.animes = readIndex(
      this.animeIndex,
      "anime",
      anime?.data.file.size ?? 0,
    );
    this.graphic = graphic;
    this.anime = anime;
    this.ids.clear();
    for (const entry of this.graphics) {
      const rows = this.ids.get(entry.id) ?? [];
      rows.push(entry.row);
      this.ids.set(entry.id, rows);
    }
    return {
      graphics: this.graphics.length,
      animes: this.animes.length,
      duplicates: this.graphics.length - this.ids.size,
    };
  }
  search(kind: Kind, query: string, offset: number) {
    const entries = kind === "graphic" ? this.graphics : this.animes;
    const term = query.trim().toLowerCase();
    const matched = term
      ? entries.filter((e) => `${e.id}`.includes(term) || `#${e.row}` === term)
      : entries;
    return {
      total: matched.length,
      entries: matched.slice(offset, offset + PAGE_SIZE),
    };
  }
  resolve(id: number) {
    return this.ids.get(id) ?? [];
  }
  private async slice(set: ResourceSet | undefined, entry: Entry | undefined) {
    if (
      !set ||
      !entry ||
      entry.addr < 0 ||
      entry.len < 0 ||
      entry.len > MAX_BYTES ||
      entry.addr + entry.len > set.data.file.size
    )
      throw new Error("索引地址或長度超出資源範圍。");
    const bytes = new Uint8Array(
      await set.data.file
        .slice(entry.addr, entry.addr + entry.len)
        .arrayBuffer(),
    );
    if (bytes.length !== entry.len)
      throw new Error("檔案長度已變更，請重新選擇資料夾。");
    return bytes;
  }
  async decode(row: number): Promise<Decoded> {
    const entry = this.graphics[row];
    if (!entry) throw new Error("找不到圖像索引列。");
    const { width = 0, height = 0, offX = 0, offY = 0 } = entry;
    if (
      width <= 0 ||
      height <= 0 ||
      width > 4096 ||
      height > 4096 ||
      width * height > 4_194_304 ||
      Math.abs(offX) > 8192 ||
      Math.abs(offY) > 8192
    )
      throw new Error("圖像尺寸或偏移超出預覽上限。");
    const bytes = await this.slice(this.graphic, entry);
    if (bytes.length < 16) throw new Error("圖像 header 截斷。");
    const header = new DataView(bytes.buffer);
    if (
      header.getInt32(4, true) !== width ||
      header.getInt32(8, true) !== height
    )
      throw new Error("索引尺寸與 RD header 不符。");
    const graphic = this.parser.graphic_strict_build_from_cgp(
      this.graphicIndex.slice(row * 40, row * 40 + 40),
      bytes,
      this.palette,
    );
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < graphic.payload.length; i++) {
      const color = graphic.palette.colors[graphic.payload[i]];
      if (!color) throw new Error("色彩索引超出調色盤。");
      const target =
        ((height - 1 - Math.floor(i / width)) * width + (i % width)) * 4;
      rgba.set([color.red, color.green, color.blue, color.alpha], target);
    }
    return { row, width, height, offX, offY, rgba };
  }
  async openAnime(row: number) {
    const entry = this.animes[row];
    const bytes = await this.slice(this.anime, entry);
    preflightAnime(bytes, entry.actions ?? 0);
    return this.parser.anime_build_from_bytes(
      this.animeIndex.slice(row * 12, row * 12 + 12),
      bytes,
    );
  }
}
