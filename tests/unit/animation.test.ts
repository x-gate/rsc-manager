import { beforeAll, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { initSync } from "../../.generated/xglib/xglib.js";
import * as bindings from "../../.generated/xglib/xglib.js";
import type * as Contract from "../../.generated/xglib/contract";
import { discover, type ResourceSet } from "../../src/resources/catalog";
import { ResourceSession, preflightAnime } from "../../src/resources/session";
import {
  animationEvent,
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

test("CGTool timing preserves fractional milliseconds and applies speed", () => {
  expect(animationInterval(1000, 6)).toBeCloseTo(166.666667);
  expect(animationInterval(1000, 6, 2)).toBeCloseTo(83.333333);
  expect(animationInterval(1, 10)).toBe(0.1);
  expect(animationInterval(1000, 6, 1, true)).toBe(100);
  for (const duration of [0, -20])
    expect(animationInterval(duration, 10)).toBe(100);
  expect(animationInterval(1000, 0)).toBe(100);
});
test("CGTool uses Graphic offsets and independent horizontal and vertical flags", () => {
  const image = {
    row: 0,
    width: 10,
    height: 20,
    offX: -100,
    offY: 35,
    rgba: new Uint8Array(800),
  };
  expect(animationFrame(image)).toMatchObject({
    x: -100,
    y: 35,
    image,
    flipX: false,
    flipY: false,
  });
  expect(animationFrame(image, undefined, 3)).toMatchObject({
    flipX: true,
    flipY: true,
  });
  expect(animationFrame(image, undefined, 12)).toMatchObject({
    flipX: false,
    flipY: false,
  });
  expect(animationFrame(undefined, "missing")).toMatchObject({
    x: 0,
    y: 0,
    error: "missing",
  });
});
test("CGTool transparency depends on index zero, including non-black zero and pure RGB colors", () => {
  const palette = parser.game_palette_build_from_bytes(
    new Uint8Array([3, 2, 1, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]),
  );
  const rgba = animationRgba([0, 1, 2, 3, 4], palette, 5, 1);
  expect([rgba[3], rgba[7], rgba[11], rgba[15], rgba[19]]).toEqual([
    0, 255, 255, 255, 255,
  ]);
  const cgp = new Uint8Array(708);
  cgp.set([0, 0, 255]);
  expect(
    animationRgba([16], parser.game_palette_build_from_cgp(cgp), 1, 1)[3],
  ).toBe(255);
});
test("WASM detects mixed header layouts per action and allows diagnosed container gaps", async () => {
  const data = join(
    actionBytes([1]),
    actionBytes([2], true),
    actionBytes([1]),
    new Uint8Array([7, 8, 9]),
  );
  const c = catalog(),
    s = new ResourceSession(parser);
  await s.initialize(
    c.graphics[0],
    set(animeInfo(100, 0, 3), data),
    c.palettes[0].file,
  );
  const anime = await s.openAnime(0);
  expect(anime.actions.map((a) => Object.keys(a.header)[0])).toEqual([
    "Standard",
    "Extended",
    "Standard",
  ]);
  expect(anime.actions[1].frames[0].graphic_id).toBe(2);
  expect(s.animePaletteNote).toContain("3 bytes");
  expect(() => preflightAnime(data, 3)).toThrow("尾端");
});
test("frame event boundaries match CGTool without dropping raw flags", () => {
  expect(animationEvent(20001)).toEqual({ effect: "命中", audio: 1 });
  expect(animationEvent(20000)).toEqual({ effect: "攻擊結束", audio: 10000 });
  expect(animationEvent(10000)).toEqual({ effect: "無", audio: 10000 });
  expect(animationEvent(10001)).toEqual({ effect: "攻擊結束", audio: 1 });
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
test("high-version hidden palette wins over embedded palette, while standard actions use embedded colors", async () => {
  const c = catalog(),
    s = new ResourceSession(parser);
  const own = embeddedGraphic(new Uint8Array([17]), new Uint8Array(54).fill(9));
  await s.initialize(
    set(graphicInfo(2, 0, own.length, 1, 1), own),
    c.animes[1],
    c.palettes[0].file,
    c.graphics[2],
  );
  expect([...(await s.decode(0, 0)).rgba]).toEqual([210, 60, 25, 255]);
  const mixed = join(actionBytes([2]), actionBytes([2], true));
  await s.initialize(
    set(graphicInfo(2, 0, own.length, 1, 1), own),
    set(animeInfo(300, 0, 2), mixed),
    c.palettes[0].file,
    c.graphics[2],
  );
  expect([...(await s.decode(0, 0, 0)).rgba]).toEqual([9, 9, 9, 255]);
  expect([...(await s.decode(0, 0, 1)).rgba]).toEqual([210, 60, 25, 255]);
  expect([...(await s.decode(0, 0, 0)).rgba]).toEqual([9, 9, 9, 255]);
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
  expect(() => animationRgba([2], { colors: [] }, 1, 1)).toThrow("超出");
});

test("applied Graphic offsets obey preview bounds for static and animated images", async () => {
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
  await expect(s.decode(0, 0)).rejects.toThrow("偏移");
});
