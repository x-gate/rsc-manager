import { beforeAll, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { initSync } from "../../.generated/xglib/xglib.js";
import * as bindings from "../../.generated/xglib/xglib.js";
import type * as Contract from "../../.generated/xglib/contract";
import { discover } from "../../src/resources/catalog";
import {
  ResourceSession,
  readIndex,
  preflightAnime,
} from "../../src/resources/session";
import { frameAt } from "../../src/viewer/preview";
import {
  syntheticResources,
  join,
  graphicInfo,
  graphicBytes,
  animeInfo,
  actionBytes,
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
    "合成遊戲",
  );
}
async function session() {
  const c = catalog(),
    s = new ResourceSession(parser);
  await s.initialize(c.graphics[0], c.animes[0], c.palettes[0].file);
  return s;
}
test("discovers mixed case Graphic/Anime pairs independently, without requiring maps", () => {
  const c = catalog();
  expect(c.graphics.map((s) => s.name)).toEqual([
    "Graphic_1",
    "GraphicEx_5",
    "GraphicPalette_1",
  ]);
  expect(c.animes.map((s) => s.name)).toEqual(["Anime_4", "AnimeEx_1"]);
});
test("rejects wrong roots, missing graphics and case collisions", () => {
  expect(() => discover([], "root")).toThrow("遊戲根目錄");
  const c = catalog();
  expect(() =>
    discover([c.graphics[0].info, c.graphics[0].info], "root"),
  ).toThrow("大小寫衝突");
});
test("incomplete Anime pairs warn but do not block Graphic browsing", () => {
  const c = catalog();
  const result = discover(
    [c.graphics[0].info, c.graphics[0].data, c.palettes[0], c.animes[0].info],
    "root",
  );
  expect(result.animes).toHaveLength(0);
  expect(result.warnings).toHaveLength(1);
});
test("preserves duplicate graphic rows; searches by ID and exact index row with pagination", async () => {
  const s = await session();
  expect(s.resolve(1)).toEqual([0, 2]);
  expect(s.search("graphic", "", 0).entries).toHaveLength(60);
  expect(s.search("graphic", "", 60).entries).toHaveLength(5);
  expect(s.search("graphic", "#2", 0).entries[0].id).toBe(1);
});
test("real WASM strict decoding converts CGP, transparency and bottom-up rows", async () => {
  const c = catalog(),
    s = new ResourceSession(parser),
    data = graphicBytes(1, 2);
  data.set([16, 0], 16);
  await s.initialize(
    {
      ...c.graphics[0],
      info: {
        path: "info",
        file: new File([graphicInfo(1, 0, 18, 1, 2)], "info"),
      },
      data: { path: "data", file: new File([data], "data") },
    },
    undefined,
    c.palettes[0].file,
  );
  const graphic = await s.decode(0);
  expect([...graphic.rgba]).toEqual([0, 0, 0, 0, 103, 166, 75, 255]);
  expect(graphic.offX).toBe(-12);
});
test("strict errors remain recoverable and do not poison other records", async () => {
  const s = await session();
  await expect(s.decode(64)).rejects.toContain("InvalidMagic");
  expect((await s.decode(1)).width).toBe(24);
});
test("bounds index addresses, dimensions and truncated record lengths", async () => {
  const c = catalog(),
    s = new ResourceSession(parser);
  await s.initialize(
    {
      ...c.graphics[0],
      info: { path: "info", file: new File([graphicInfo(1, 999999)], "info") },
    },
    undefined,
    c.palettes[0].file,
  );
  await expect(s.decode(0)).rejects.toThrow("地址");
  await s.initialize(
    {
      ...c.graphics[0],
      info: {
        path: "info",
        file: new File([graphicInfo(1, 0, 784, 25, 32)], "info"),
      },
    },
    undefined,
    c.palettes[0].file,
  );
  await expect(s.decode(0)).rejects.toContain("graphic payload");
  expect(() => readIndex(new Uint8Array(41), "graphic", 100)).toThrow("40");
});
test("uses next distinct address for unsorted Anime rows and preserves duplicate IDs and addresses", async () => {
  const s = await session();
  const entries = s.search("anime", "", 0).entries;
  expect(entries[0].addr).toBeGreaterThan(entries[1].addr);
  expect(entries[1].len).toBe(entries[0].addr);
  expect(entries[2]).toMatchObject({ id: 100, addr: 0, len: entries[1].len });
  const anime = await s.openAnime(1);
  expect(anime.actions).toHaveLength(2);
  expect(anime.actions[0].frames[0].graphic_id).toBe(1);
  expect(anime.actions[1].header).toMatchObject({
    Extended: { action: 1, direct: 3, reversed: 1 },
  });
  expect(anime.actions[1].frames[1]).toMatchObject({
    graphic_id: 999,
    off_x: 2,
    off_y: -1,
    flag: 5,
  });
  expect(s.resolve(999)).toEqual([]);
});
test("bounds Anime allocations before WASM and rejects trailing/truncated data", () => {
  const bad = actionBytes();
  new DataView(bad.buffer).setInt32(8, 2147483647, true);
  expect(() => preflightAnime(bad, 1)).toThrow("frame");
  expect(() => preflightAnime(actionBytes().slice(0, -1), 1)).toThrow("frame");
  expect(() =>
    preflightAnime(join(actionBytes(), new Uint8Array(1)), 1),
  ).toThrow("尾端");
  expect(() => preflightAnime(actionBytes(), -1)).toThrow("動作");
});
test("empty anime actions, signed IDs and negative addresses are retained for diagnosis", () => {
  const entries = readIndex(
    join(animeInfo(-2, 0, 0), animeInfo(-3, -1, 1)),
    "anime",
    0,
  );
  expect(entries[0]).toMatchObject({ id: -2, len: 0, actions: 0 });
  expect(entries[1].addr).toBe(-1);
  expect(() => preflightAnime(new Uint8Array(), 0)).not.toThrow();
});
test("rejects malformed CGP and can initialize again", async () => {
  const c = catalog(),
    s = new ResourceSession(parser);
  await expect(
    s.initialize(
      c.graphics[0],
      undefined,
      new File([new Uint8Array(10)], "bad"),
    ),
  ).rejects.toThrow("CGP");
  await s.initialize(c.graphics[1], c.animes[1], c.palettes[1].file);
  expect(s.resolve(1)).toEqual([]);
  expect(s.resolve(2)).toEqual([0]);
  expect((await s.openAnime(0)).info.id).toBe(300);
});
test("deterministic preview timeline wraps, clamps and supports zero frames", () => {
  expect(frameAt(0, 100, 4)).toBe(0);
  expect(frameAt(0.35, 0.1, 4)).toBe(3);
  expect(frameAt(399, 100, 4)).toBe(3);
  expect(frameAt(400, 100, 4)).toBe(0);
  expect(frameAt(-10, 100, 4)).toBe(0);
  expect(frameAt(400, 100, 0)).toBe(0);
});

test("Graphic container addresses retain the unsigned WASM address range", () => {
  const info = graphicInfo();
  new DataView(info.buffer).setUint32(4, 0x80000000, true);
  expect(readIndex(info, "graphic", 0x90000000)[0].addr).toBe(0x80000000);
});
