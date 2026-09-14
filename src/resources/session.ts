import type * as Contract from "../../.generated/xglib/contract";
import type { ResourceSet } from "./catalog";
import type { Decoded, Entry, Kind } from "./protocol";
import { animationRgba, rawPalette } from "./animation";
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
export function preflightAnime(
  bytes: Uint8Array,
  count: number,
  allowContainerTail = false,
) {
  if (count < 0 || count > 4096) throw new Error("動畫動作數超出上限。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0,
    total = 0;
  // xgtool selects the layout once at the AnimeInfo address, for all actions.
  const header: 12 | 20 =
    bytes.length >= 20 && view.getInt32(16, true) === -1 ? 20 : 12;
  for (let action = 0; action < count; action++) {
    if (offset + header > bytes.length) throw new Error("動畫 header 截斷。");
    const frames = view.getInt32(offset + 8, true);
    total += frames;
    if (
      frames < 0 ||
      total > 100_000 ||
      offset + header + frames * 10 > bytes.length
    )
      throw new Error("動畫 frame 數量或資料長度無效。");
    offset += header + frames * 10;
  }
  if (!allowContainerTail && offset !== bytes.length)
    throw new Error("動畫切片有未解析的尾端資料。");
  return { headerSize: header, length: offset };
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
  private paletteGraphic?: ResourceSet;
  private paletteIndex = new Uint8Array();
  private paletteEntries: Entry[] = [];
  private paletteIds = new Map<number, Entry[]>();
  private cgp!: Contract.Palette;
  private animePalette?: {
    row: number;
    palette: Contract.Palette;
    cgp: boolean;
  };
  animePaletteNote = "";
  constructor(private parser: typeof Contract) {}
  async initialize(
    graphic: ResourceSet,
    anime: ResourceSet | undefined,
    palette: File,
    paletteGraphic: ResourceSet | null = graphic,
  ) {
    if (![672, 708].includes(palette.size))
      throw new Error("CGP 長度必須為 672 或 708 bytes。");
    if (
      graphic.info.file.size > 40_000_000 ||
      (anime?.info.file.size ?? 0) > 12_000_000 ||
      (paletteGraphic?.info.file.size ?? 0) > 40_000_000
    )
      throw new Error("索引超過一百萬列上限。");
    this.palette = new Uint8Array(await palette.arrayBuffer());
    this.cgp = this.parser.game_palette_build_from_cgp(this.palette);
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
    this.animePalette = undefined;
    this.animePaletteNote = "";
    this.paletteGraphic = paletteGraphic ?? undefined;
    this.paletteIndex =
      paletteGraphic === graphic
        ? this.graphicIndex
        : paletteGraphic
          ? new Uint8Array(await paletteGraphic.info.file.arrayBuffer())
          : new Uint8Array();
    this.paletteEntries = paletteGraphic
      ? readIndex(this.paletteIndex, "graphic", paletteGraphic.data.file.size)
      : [];
    this.paletteIds.clear();
    for (const entry of this.paletteEntries)
      if (entry.mapId !== 0) {
        const rows = this.paletteIds.get(entry.mapId!) ?? [];
        rows.push(entry);
        this.paletteIds.set(entry.mapId!, rows);
      }
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
  async decode(row: number, animeRow?: number): Promise<Decoded> {
    const entry = this.graphics[row];
    if (!entry) throw new Error("找不到圖像索引列。");
    const { width = 0, height = 0, offX = 0, offY = 0 } = entry;
    if (
      width <= 0 ||
      height <= 0 ||
      width > 4096 ||
      height > 4096 ||
      width * height > 4_194_304 ||
      (animeRow === undefined &&
        (Math.abs(offX) > 8192 || Math.abs(offY) > 8192))
    )
      throw new Error("圖像尺寸或偏移超出預覽上限。");
    const bytes = await this.slice(this.graphic, entry);
    if (bytes.length < 16) throw new Error("圖像 header 截斷。");
    const header = new DataView(bytes.buffer);
    const warnings: string[] = [];
    if (
      header.getInt32(4, true) !== width ||
      header.getInt32(8, true) !== height
    )
      warnings.push(
        "索引尺寸與 RD header 不符，依 xgtool 使用 GraphicInfo 尺寸。",
      );
    const index = this.graphicIndex.slice(row * 40, row * 40 + 40);
    if (animeRow !== undefined) {
      const selected = await this.prepareAnimePalette(animeRow);
      // Raw BGR stays distinct from CGP. Embedded non-empty palettes win;
      // palette-less v2/v3 frames inherit the selected Anime palette.
      const graphic = this.parser.graphic_strict_build_from_bytes(
        index,
        bytes,
        rawPalette(selected.palette),
      );
      const embedded = bytes[2] >= 2 && graphic.palette.colors.length > 0;
      const palette = embedded ? graphic.palette : selected.palette;
      const rgba = animationRgba(
        graphic.payload,
        palette,
        width,
        height,
        !embedded && selected.cgp,
      );
      return { row, width, height, offX, offY, rgba, warnings };
    }
    const graphic = this.parser.graphic_strict_build_from_cgp(
      index,
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
    return { row, width, height, offX, offY, rgba, warnings };
  }
  private async prepareAnimePalette(row: number) {
    if (this.animePalette?.row === row) return this.animePalette;
    const anime = this.animes[row];
    if (!anime) throw new Error("找不到動畫索引列。");
    const candidates = this.paletteIds.get(anime.id) ?? [];
    const entry = candidates[0];
    let palette = this.cgp,
      cgp = true;
    this.animePaletteNote = "動畫調色盤：CGP";
    if (entry) {
      if (
        (entry.width ?? -1) < 0 ||
        (entry.height ?? -1) < 0 ||
        entry.width! > 4096 ||
        entry.height! > 4096 ||
        entry.width! * entry.height! > 4_194_304
      )
        throw new Error("隱藏調色盤圖像尺寸超出上限。");
      const data = await this.slice(this.paletteGraphic, entry);
      if (data.length < 20 || data[2] < 2)
        throw new Error(`Map ID ${anime.id} 的調色盤圖像沒有內嵌色表。`);
      const graphic = this.parser.graphic_strict_build_from_bytes(
        this.paletteIndex.slice(entry.row * 40, entry.row * 40 + 40),
        data,
        new Uint8Array(),
      );
      if (graphic.palette.colors.length > 256)
        throw new Error("隱藏調色盤超過 256 色。");
      if (graphic.palette.colors.length) {
        palette = graphic.palette;
        cgp = false;
        this.animePaletteNote = `動畫調色盤：${this.paletteGraphic!.name} · Map ID ${anime.id} · #${entry.row}${candidates.length > 1 ? `（${candidates.length} 筆，依 xgtool 使用首列）` : ""}`;
      }
    } else if (this.paletteGraphic) {
      this.animePaletteNote += `（${this.paletteGraphic.name} 沒有 Map ID ${anime.id} 的隱藏調色盤）`;
    }
    this.animePalette = { row, palette, cgp };
    return this.animePalette;
  }
  async openAnime(row: number) {
    const entry = this.animes[row];
    const bytes = await this.slice(this.anime, entry);
    const layout = preflightAnime(bytes, entry.actions ?? 0, true);
    const anime = this.parser.anime_build_from_bytes_with_header_size(
      this.animeIndex.slice(row * 12, row * 12 + 12),
      bytes.subarray(0, layout.length),
      layout.headerSize,
    );
    await this.prepareAnimePalette(row);
    if (layout.length < bytes.length)
      this.animePaletteNote += `；動作結束後尚有 ${bytes.length - layout.length} bytes 容器間隙，未作為動畫解析。`;
    return anime;
  }
}
