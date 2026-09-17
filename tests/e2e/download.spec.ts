import { test, expect, type Page, type Download } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync, strFromU8 } from "fflate";

async function open(page: Page) {
  await page.goto("/");
  await page
    .locator("#directory-input")
    .setInputFiles(resolve(".generated/fixture-game"));
  await expect(page.locator("#download")).toBeEnabled();
}
async function download(page: Page) {
  const event = page.waitForEvent("download");
  await page.locator("#download").click();
  const item = await event;
  return { name: item.suggestedFilename(), bytes: await contents(item) };
}
async function contents(item: Download) {
  const path = resolve(".generated/downloads", item.suggestedFilename());
  await item.saveAs(path);
  return readFile(path);
}
async function pixels(page: Page, png: Uint8Array) {
  return page.evaluate(
    async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return {
        width: canvas.width,
        height: canvas.height,
        rgba: [...context.getImageData(0, 0, canvas.width, canvas.height).data],
      };
    },
    [...png],
  );
}
test("Graphic PNG uses native pixels, transparency, selected palette and row identity", async ({
  page,
}) => {
  await open(page);
  const first = await download(page);
  expect(first.name).toBe("Graphic_1_id_1_row_0.png");
  expect([...first.bytes.subarray(0, 8)]).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  const image = await pixels(page, first.bytes);
  expect([image.width, image.height]).toEqual([24, 32]);
  expect(image.rgba.slice(0, 4)).toEqual([0, 0, 0, 0]);
  expect(image.rgba.slice((10 * 24 + 10) * 4, (10 * 24 + 10) * 4 + 4)).toEqual([
    103, 166, 75, 255,
  ]);
  await page.locator("#background").click();
  await page.locator("#zoom").click();
  expect((await download(page)).bytes.equals(first.bytes)).toBe(true);
  await page.locator("#palette").selectOption("1");
  await expect(page.locator("#download")).toBeEnabled();
  expect((await download(page)).bytes.equals(first.bytes)).toBe(false);
  await page.locator("#search").fill("#2");
  await expect(page.locator("#entries button")).toHaveCount(1);
  await page.locator("#entries button").click();
  await expect(page.locator("#download")).toBeEnabled();
  expect((await download(page)).name).toBe("Graphic_1_id_1_row_2.png");
});
test("Anime ZIP contains only the selected action, ordered aligned PNGs and mirrored pixels", async ({
  page,
}) => {
  await open(page);
  await page.locator("#anime-source").selectOption("1");
  await expect(page.locator("#loading")).toBeHidden();
  await page.getByRole("tab", { name: "Anime", exact: true }).click();
  await expect(page.locator("#download")).toBeEnabled();
  const first = await download(page);
  expect(first.name).toBe(
    "AnimeEx_1_id_300_row_0_action_0_direction_3_row_0.zip",
  );
  const files = unzipSync(first.bytes);
  const names = Object.keys(files)
    .filter((n) => n.endsWith(".png"))
    .sort();
  expect(names).toEqual([
    "action_0_direction_3_row_0/frame_0001_graphic_2_row_1.png",
    "action_0_direction_3_row_0/frame_0002_graphic_2_row_1.png",
  ]);
  expect(files[names[0]]).toEqual(files[names[1]]);
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  expect(manifest).toMatchObject({
    animeId: 300,
    animeRow: 0,
    actionRow: 0,
    frameDurationMs: 200,
    origin: { x: 12, y: 32 },
    sources: {
      graphic: "Assets/bin/Graphic_1.bin",
      anime: "Assets/bin/AnimeEx_1.Bin",
    },
  });
  const original = await pixels(page, files[names[0]]);
  await page.locator("#action").selectOption("1");
  await expect(page.locator("#download")).toBeEnabled();
  const mirroredFiles = unzipSync((await download(page)).bytes);
  const mirrored = await pixels(
    page,
    mirroredFiles["action_1_direction_3_row_1/frame_0001_graphic_2_row_1.png"],
  );
  expect([mirrored.width, mirrored.height]).toEqual([
    original.width,
    original.height,
  ]);
  for (let y = 0; y < original.height; y++)
    for (let x = 0; x < original.width; x++) {
      const a = (y * original.width + x) * 4,
        b = (y * original.width + original.width - 1 - x) * 4;
      expect(mirrored.rgba.slice(a, a + 4)).toEqual(
        original.rgba.slice(b, b + 4),
      );
    }
  await page.locator("#anime-source").selectOption("0");
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#search").fill("#1");
  await expect(page.locator("#entries button")).toHaveCount(1);
  await page.locator("#entries button").click();
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#action").selectOption("1");
  await expect(page.locator("#warnings")).toContainText("缺少 ID 999");
  await expect(page.locator("#download")).toBeDisabled();
});
test("cancelling or changing selection prevents a stale PNG download", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (...args) {
      (window as unknown as { finishPng: () => void }).finishPng = () =>
        original.apply(this, args);
    };
  });
  await open(page);
  const downloads: string[] = [];
  page.on("download", (item) => downloads.push(item.suggestedFilename()));
  for (const cancel of [true, false]) {
    await page.locator("#download").click();
    await expect(page.locator("#download-cancel")).toBeVisible();
    if (cancel) await page.locator("#download-cancel").click();
    else {
      await page.locator("#graphic-source").selectOption("1");
      await expect(page.locator("#loading")).toBeHidden();
    }
    await page.evaluate(() =>
      (window as unknown as { finishPng: () => void }).finishPng(),
    );
    await expect(page.locator("#download")).toBeEnabled();
    await page.waitForTimeout(100);
    expect(downloads).toEqual([]);
  }
});
