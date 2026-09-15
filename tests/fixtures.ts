// Original synthetic bytes only. No original game content is used in tests.
export function graphicBytes(width = 24, height = 32, color = 16) {
  const bytes = new Uint8Array(16 + width * height),
    view = new DataView(bytes.buffer);
  bytes.set([82, 68, 0, 0]);
  view.setInt32(4, width, true);
  view.setInt32(8, height, true);
  view.setInt32(12, bytes.length, true);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (x > 3 && x < width - 4 && y > 2 && y < height - 3)
        bytes[16 + y * width + x] = color;
      if (y > height - 12 && y < height - 9 && (x === 8 || x === width - 9))
        bytes[16 + y * width + x] = 17;
    }
  if (width > 10 && height > 10)
    bytes[16 + 6 * width + 5] = color === 17 ? 16 : 17;
  return bytes;
}
export function graphicInfo(
  id = 1,
  addr = 0,
  len = 784,
  width = 24,
  height = 32,
) {
  const bytes = new Uint8Array(40),
    view = new DataView(bytes.buffer);
  view.setInt32(0, id, true);
  view.setInt32(4, addr, true);
  view.setInt32(8, len, true);
  view.setInt32(12, -12, true);
  view.setInt32(16, -32, true);
  view.setInt32(20, width, true);
  view.setInt32(24, height, true);
  view.setInt32(36, id + 1000, true);
  return bytes;
}
export function animeInfo(id: number, addr: number, count: number) {
  const bytes = new Uint8Array(12),
    view = new DataView(bytes.buffer);
  view.setInt32(0, id, true);
  view.setInt32(4, addr, true);
  view.setInt16(8, count, true);
  return bytes;
}
export function actionBytes(ids = [1, 2], extended = false, action = 0) {
  const size = extended ? 20 : 12,
    bytes = new Uint8Array(size + ids.length * 10),
    view = new DataView(bytes.buffer);
  view.setInt16(0, 3, true);
  view.setInt16(2, action, true);
  view.setInt32(4, 400, true);
  view.setInt32(8, ids.length, true);
  if (extended) {
    bytes.set([0xab, 0xcd], 12);
    view.setInt16(14, 1, true);
    view.setInt32(16, -1, true);
  }
  ids.forEach((id, i) => {
    view.setInt32(size + i * 10, id, true);
    view.setInt16(size + i * 10 + 4, i * 2, true);
    view.setInt16(size + i * 10 + 6, -i, true);
    view.setInt16(size + i * 10 + 8, 5, true);
  });
  return bytes;
}
export function join(...records: Uint8Array[]) {
  const bytes = new Uint8Array(records.reduce((sum, r) => sum + r.length, 0));
  let offset = 0;
  for (const record of records) {
    bytes.set(record, offset);
    offset += record.length;
  }
  return bytes;
}
export function paletteBytes(blue = false) {
  const bytes = new Uint8Array(708);
  bytes.set(blue ? [210, 130, 70, 50, 40, 30] : [75, 166, 103, 210, 238, 223]);
  return bytes;
}
export function syntheticResources() {
  const index: Uint8Array[] = [],
    data: Uint8Array[] = [];
  let offset = 0;
  for (let row = 0; row < 65; row++) {
    const graphic = graphicBytes(24, 32, row % 2 ? 17 : 16);
    if (row === 64) graphic[0] = 0;
    index.push(graphicInfo(row === 2 ? 1 : row + 1, offset, graphic.length));
    data.push(graphic);
    offset += graphic.length;
  }
  const first = join(
    actionBytes([1, 2, 1, 2], true),
    actionBytes([2, 999], true, 1),
  );
  const second = actionBytes([2, 1], true, 2);
  const aIndex = join(
    animeInfo(200, first.length, 1),
    animeInfo(100, 0, 2),
    animeInfo(100, 0, 2),
  );
  const hidden = hiddenPaletteResources();
  return new Map<string, Uint8Array>([
    ["Assets/bin/GraphicInfo_1.bin", join(...index)],
    ["Assets/bin/Graphic_1.bin", join(...data)],
    ["Assets/bin/GraphicInfoEx_5.bin", graphicInfo(2)],
    ["Assets/bin/GraphicEx_5.bin", graphicBytes(24, 32, 17)],
    ["Assets/bin/AnimeInfo_4.bin", aIndex],
    ["Assets/bin/Anime_4.bin", join(first, second)],
    ["Assets/bin/AnimeInfoEx_1.Bin", animeInfo(300, 0, 4)],
    [
      "Assets/bin/AnimeEx_1.Bin",
      join(
        ...[0, 1, 2, 3].map((flags) => {
          const bytes = actionBytes([2, 2], true, flags);
          new DataView(bytes.buffer).setInt16(14, flags, true);
          return bytes;
        }),
      ),
    ],
    ["Assets/bin/GraphicInfoPalette_1.bin", hidden.info],
    ["Assets/bin/GraphicPalette_1.bin", hidden.data],
    ["Assets/bin/pal/palet_00.cgp", paletteBytes()],
    ["Assets/bin/pal/palet_01.cgp", paletteBytes(true)],
    ["Assets/bin/Puk2/GraphicInfo_PUK2_2.bin", graphicInfo(201)],
    ["Assets/bin/Puk2/Graphic_PUK2_2.bin", graphicBytes()],
    ["Assets/bin/Puk2/AnimeInfo_PUK2_4.bin", animeInfo(1201, 0, 1)],
    ["Assets/bin/Puk2/Anime_PUK2_4.bin", actionBytes([201, 201], true)],
    ["Assets/bin/Puk3/GraphicInfo_PUK3_1.bin", graphicInfo(301)],
    ["Assets/bin/Puk3/Graphic_PUK3_1.bin", graphicBytes(24, 32, 17)],
    ["Assets/bin/Puk3/AnimeInfo_PUK3_2.bin", animeInfo(1301, 0, 1)],
    ["Assets/bin/Puk3/Anime_PUK3_2.bin", actionBytes([301, 301], true)],
  ]);
}

export function embeddedGraphic(
  pixels: Uint8Array,
  palette: Uint8Array,
  width = 1,
  height = 1,
) {
  const bytes = new Uint8Array(20 + pixels.length + palette.length),
    view = new DataView(bytes.buffer);
  bytes.set([82, 68, 2, 0]);
  view.setInt32(4, width, true);
  view.setInt32(8, height, true);
  view.setInt32(12, bytes.length, true);
  view.setUint32(16, palette.length, true);
  bytes.set(pixels, 20);
  bytes.set(palette, 20 + pixels.length);
  return bytes;
}
export function hiddenPaletteResources() {
  const palette = new Uint8Array(256 * 3);
  palette.set([40, 70, 90], 0); // Index zero stays transparent even with non-black RGB.
  palette.set([25, 60, 210], 17 * 3);
  const data = embeddedGraphic(new Uint8Array(), palette, 0, 0);
  const info = graphicInfo(900, 0, data.length, 0, 0);
  new DataView(info.buffer).setInt32(36, 300, true); // Lookup is Map ID, not graphic ID.
  return { info, data };
}
