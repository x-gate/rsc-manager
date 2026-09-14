import { beforeAll, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { initSync } from "../../.generated/xglib/xglib.js";
import * as bindings from "../../.generated/xglib/xglib.js";
import type * as Contract from "../../.generated/xglib/contract";
import { discover, type ResourceSet } from "../../src/resources/catalog";
import { ResourceSession, preflightAnime } from "../../src/resources/session";
import {
  animationFrame,
  animationInterval,
  animationRgba,
} from "../../src/resources/animation";
import {
  actionBytes,
  animeInfo,
  graphicInfo,
  graphicBytes,
  embeddedGraphic,
  join,
  syntheticResources,
} from "../fixtures";
const parser = bindings as unknown as typeof Contract;
beforeAll(async () =>
  initSync({
    module: await readFile(
      new URL("../../.generated/xglib/xglib_bg.wasm", import.meta.url),
    ),
  }),
);
function catalog() {
  return discover(
    [...syntheticResources()].map(([path, bytes]) => ({
      path,
      file: new File([bytes], path.split("/").pop()!),
    })),
    "synthetic",
  );
}
function set(info: Uint8Array, data: Uint8Array): ResourceSet {
  return {
    name: "test",
    info: { path: "info", file: new File([info], "info") },
    data: { path: "data", file: new File([data], "data") },
  };
}

test("xgtool GIF delay truncates to centiseconds before applying playback speed", () => {
  expect(animationInterval(1000, 6)).toBe(160);
  expect(animationInterval(1000, 6, 2)).toBe(80);
  expect(animationInterval(1000, 6, 0.5)).toBe(320);
  expect(animationInterval(1000, 6, 1, true)).toBe(100);
  for (const duration of [0, -20, 1])
    expect(animationInterval(duration, 10)).toBe(100);
  expect(animationInterval(1000, 0)).toBe(100);
});
test("GIF frames share the top-left origin regardless of Graphic offsets", () => {
  const image = {
    row: 0,
    width: 10,
    height: 20,
    offX: -100,
    offY: 35,
    rgba: new Uint8Array(800),
  };
  expect(animationFrame(image)).toMatchObject({ x: 0, y: 0, image });
  expect(animationFrame(undefined, "missing")).toMatchObject({
    x: 0,
    y: 0,
    error: "missing",
  });
});
test("raw palette color keys do not force a non-key color at index zero transparent", () => {
  const palette = parser.game_palette_build_from_bytes(
    new Uint8Array([
      3, 2, 1, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0,
    ]),
  );
  const rgba = animationRgba([0, 1, 2, 3, 4, 5], palette, 6, 1, false);
  expect([rgba[3], rgba[7], rgba[11], rgba[15], rgba[19], rgba[23]]).toEqual([
    255, 0, 0, 0, 0, 255,
  ]);
});
test("CGP custom color keys preserve opaque fixed pure RGB colors", () => {
  const cgp = new Uint8Array(708);
  cgp.set([0, 0, 255]);
  const palette = parser.game_palette_build_from_cgp(cgp);
  const rgba = animationRgba([0, 16, 249], palette, 3, 1, true);
  expect([rgba[3], rgba[7], rgba[11]]).toEqual([0, 0, 255]);
});
test("WASM uses a single standard header layout even with a later false sentinel and container padding", async () => {
  const second = actionBytes([1]);
  new DataView(second.buffer).setInt16(16, -1, true);
  new DataView(second.buffer).setInt16(18, -1, true);
  const data = join(actionBytes([1]), second, new Uint8Array([7, 8, 9]));
  const c = catalog(),
    s = new ResourceSession(parser);
  await s.initialize(
    c.graphics[0],
    set(animeInfo(100, 0, 2), data),
    c.palettes[0].file,
  );
  const anime = await s.openAnime(0);
  expect(anime.actions[1].header).toMatchObject({ Standard: { frame_cnt: 1 } });
  expect(anime.actions[1].frames[0]).toMatchObject({
    graphic_id: 1,
    off_x: -1,
    off_y: -1,
  });
  expect(s.animePaletteNote).toContain("3 bytes");
  expect(() => preflightAnime(data, 2)).toThrow("尾端");
});
test("GraphicInfo dimensions take precedence over unreliable RD dimensions without hiding pixel length errors", async () => {
  const data = graphicBytes();
  new DataView(data.buffer).setInt32(4, 999, true);
  const c = catalog(),
    s = new ResourceSession(parser);
  await s.initialize(
    set(graphicInfo(), data),
    undefined,
    c.palettes[0].file,
    null,
  );
  const graphic = await s.decode(0);
  expect(graphic.width).toBe(24);
  expect(graphic.warnings?.[0]).toContain("GraphicInfo");
});
test("hidden palette is keyed by Anime ID -> Map ID, selected separately, and does not leak into Graphic preview", async () => {
  const c = catalog(),
    s = new ResourceSession(parser);
  await s.initialize(
    c.graphics[0],
    c.animes[1],
    c.palettes[0].file,
    c.graphics[2],
  );
  await s.openAnime(0);
  expect(s.animePaletteNote).toContain("Map ID 300");
  expect(s.animePaletteNote).toContain("#0");
  const pixel = (16 * 24 + 12) * 4;
  expect([...(await s.decode(1, 0)).rgba.slice(pixel, pixel + 4)]).toEqual([
    210, 60, 25, 255,
  ]);
  expect([...(await s.decode(1)).rgba.slice(pixel, pixel + 4)]).toEqual([
    223, 238, 210, 255,
  ]);
  await s.initialize(c.graphics[0], c.animes[1], c.palettes[0].file, null);
  await s.openAnime(0);
  expect([...(await s.decode(1, 0)).rgba.slice(pixel, pixel + 4)]).toEqual([
    223, 238, 210, 255,
  ]);
});
test("frame embedded palette wins over hidden palette, while empty embedded palettes inherit it", async () => {
  const c = catalog(),
    s = new ResourceSession(parser);
  const own = embeddedGraphic(new Uint8Array([0]), new Uint8Array([9, 8, 7]));
  await s.initialize(
    set(graphicInfo(2, 0, own.length, 1, 1), own),
    c.animes[1],
    c.palettes[0].file,
    c.graphics[2],
  );
  expect([...(await s.decode(0, 0)).rgba]).toEqual([7, 8, 9, 255]);
  const inherit = embeddedGraphic(new Uint8Array([17]), new Uint8Array());
  await s.initialize(
    set(graphicInfo(2, 0, inherit.length, 1, 1), inherit),
    c.animes[1],
    c.palettes[0].file,
    c.graphics[2],
  );
  expect([...(await s.decode(0, 0)).rgba]).toEqual([210, 60, 25, 255]);
});
test("palette lookup falls back when Map ID is absent and rejects broken or out-of-range palette records", async () => {
  const c = catalog(),
    s = new ResourceSession(parser);
  await s.initialize(
    c.graphics[0],
    c.animes[0],
    c.palettes[0].file,
    c.graphics[2],
  );
  await s.openAnime(0);
  expect(s.animePaletteNote).toContain("CGP");
  const broken = graphicInfo(900, 999999, 50, 0, 0);
  new DataView(broken.buffer).setInt32(36, 300, true);
  await s.initialize(
    c.graphics[0],
    c.animes[1],
    c.palettes[0].file,
    set(broken, new Uint8Array(10)),
  );
  await expect(s.openAnime(0)).rejects.toThrow("地址");
  expect(() => animationRgba([2], { colors: [] }, 1, 1, false)).toThrow("超出");
});

test("ignored Graphic offsets cannot reject an otherwise valid animation frame", async () => {
  const c = catalog(),
    s = new ResourceSession(parser),
    info = graphicInfo();
  new DataView(info.buffer).setInt32(12, 20000, true);
  await s.initialize(
    set(info, graphicBytes()),
    c.animes[0],
    c.palettes[0].file,
    null,
  );
  await expect(s.decode(0)).rejects.toThrow("偏移");
  expect((await s.decode(0, 0)).width).toBe(24);
});
