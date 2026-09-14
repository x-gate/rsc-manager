import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
const fixture = resolve(".generated/fixture-game");
async function open(page: Page) {
  await page.goto("/");
  await page.locator("#directory-input").setInputFiles(fixture);
  await expect(page.locator("#status")).toContainText("65 Graphic");
  await expect(page.locator("#selected-title")).toHaveText("ID 1");
  await expect(page.locator("#loading")).toBeHidden();
}
test("onboarding is local and has no remote requests", async ({ page }) => {
  const remote: string[] = [];
  page.on("request", (r) => {
    if (!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      remote.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /每一張圖像，\s*每一格動作。/ }),
  ).toBeVisible();
  await expect(page.locator("#workspace")).toBeHidden();
  await page.screenshot({ path: ".generated/welcome.png", fullPage: true });
  expect(remote).toEqual([]);
});
test("Graphic browsing, pagination, duplicate rows, palette and source switching", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator("#entries button")).toHaveCount(60);
  await page.getByRole("button", { name: "下一頁", exact: true }).click();
  await expect(page.locator("#entries button")).toHaveCount(5);
  await page
    .getByRole("button", { name: "ID 65，索引列 64", exact: true })
    .click();
  await expect(page.locator("#error")).toContainText("InvalidMagic");
  await page.locator("#search").fill("#2");
  await expect(page.locator("#entries button")).toHaveCount(1);
  await page.locator("#entries button").click();
  await expect(page.locator("#error")).toBeHidden();
  await expect(page.locator("#metadata")).toContainText("1001");
  await page.locator("#palette").selectOption("1");
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#graphic-source").selectOption("1");
  await expect(page.locator("#count")).toHaveText("1 筆");
  await expect(page.locator("#selected-title")).toHaveText("ID 2");
  expect(errors).toEqual([]);
});
test("Anime action selection, step, playback, missing frames and independent sources", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("tab", { name: "Anime", exact: true }).click();
  await expect(page.locator("#playback")).toBeVisible();
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#search").fill("#1");
  await expect(page.locator("#entries button")).toHaveCount(1);
  await page.locator("#entries button").click();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#warnings")).toContainText("暫用首列");
  await page.getByRole("button", { name: "下一格", exact: true }).click();
  await expect(page.locator("#frame-info")).toContainText("2 / 4");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "暫停", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "暫停", exact: true }).click();
  await page.locator("#action").selectOption("1");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#warnings")).toContainText("缺少 ID 999");
  await page.getByRole("button", { name: "下一格", exact: true }).click();
  await expect(page.locator("#empty")).toContainText("缺少 ID 999");
  await expect(page.locator("#metadata")).toContainText("Extended");
  await page.locator("#anime-source").selectOption("1");
  await expect(page.locator("#selected-title")).toHaveText("ID 300");
  await expect(page.locator("#loading")).toBeHidden();
  await page.screenshot({ path: ".generated/anime.png", fullPage: true });
});
test("fast source changes, cancellation and forgetting clear prior resources", async ({
  page,
}) => {
  await open(page);
  await page.locator("#graphic-source").selectOption("1");
  await page.locator("#graphic-source").selectOption("0");
  await expect(page.locator("#status")).toContainText("65 Graphic");
  await expect(page.locator("#loading")).toBeHidden();
  await page.evaluate(() => {
    document
      .querySelector<HTMLSelectElement>("#palette")!
      .dispatchEvent(new Event("change"));
    document.querySelector<HTMLButtonElement>("#cancel")!.click();
  });
  await expect(page.locator("#reload")).toBeVisible();
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#reload").click();
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#forget").click();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#workspace")).toBeHidden();
  await expect(page.locator("#entries button")).toHaveCount(0);
});
test("mobile layout remains usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("directory picker scans local handles even when persistence is unavailable", async ({
  page,
}) => {
  // Only synthetic OPFS files are created. Native picker UI is replaced.
  const { syntheticResources } = await import("../fixtures");
  const resources = [...syntheticResources()].map(([path, bytes]) => ({
    path,
    bytes: [...bytes],
  }));
  await page.addInitScript(
    ({ resources }) => {
      // Exercise unsupported storage explicitly, without serializing OPFS handles.
      indexedDB.open = () => {
        throw new Error("Synthetic unavailable storage");
      };
      Object.defineProperty(window, "showDirectoryPicker", {
        configurable: true,
        value: async (options: { mode: string }) => {
          if (options.mode !== "read")
            throw new Error("Expected read-only access");
          const storage = await navigator.storage.getDirectory();
          const root = await storage.getDirectoryHandle("synthetic-root", {
            create: true,
          });
          for (const { path, bytes } of resources) {
            const parts = path.split("/");
            let directory = root;
            for (const part of parts.slice(0, -1))
              directory = await directory.getDirectoryHandle(part, {
                create: true,
              });
            const file = await directory.getFileHandle(
              parts[parts.length - 1],
              { create: true },
            );
            const writer = await file.createWritable();
            await writer.write(new Uint8Array(bytes));
            await writer.close();
          }
          return root;
        },
      });
    },
    { resources },
  );
  await page.goto("/");
  await page.locator("#pick").click();
  await expect(page.locator("#status")).toContainText("synthetic-root");
  await expect(page.locator("#selected-title")).toHaveText("ID 1");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#error")).toContainText("瀏覽器無法記住此資料夾");
  await page.getByRole("tab", { name: "Anime", exact: true }).click();
  await expect(page.locator("#playback")).toBeVisible();
  await expect(page.locator("#loading")).toBeHidden();
});

test("disabling Anime keeps Graphic browsing available", async ({ page }) => {
  await open(page);
  await page.locator("#anime-source").selectOption("-1");
  await expect(page.locator("#status")).toContainText("0 Anime");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#selected-title")).toHaveText("ID 1");
  await page.getByRole("tab", { name: "Anime", exact: true }).click();
  await expect(page.locator("#count")).toHaveText("0 筆");
  await expect(page.locator("#playback")).toBeHidden();
});

test("xgtool playback keeps identical frames aligned and applies the selected hidden palette", async ({
  page,
}) => {
  await open(page);
  await page.locator("#anime-source").selectOption("1");
  await expect(page.locator("#loading")).toBeHidden();
  await page.getByRole("tab", { name: "Anime", exact: true }).click();
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#selected-title")).toHaveText("ID 300");
  await expect(page.locator("#metadata")).toContainText("200 ms");
  const first = await page
    .locator("#canvas canvas")
    .screenshot({ path: ".generated/frame-first.png" });
  await page.getByRole("button", { name: "下一格", exact: true }).click();
  await expect(page.locator("#frame-info")).toContainText("offset 2, -1");
  const second = await page
    .locator("#canvas canvas")
    .screenshot({ path: ".generated/frame-second.png" });
  expect(second.equals(first)).toBe(true);
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect
    .poll(() => page.locator("#timeline").inputValue(), { intervals: [30] })
    .toBe("0");
  await page.getByRole("button", { name: "暫停", exact: true }).click();
  await page.locator("#palette-source").selectOption("2");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#warnings")).toContainText(
    "GraphicPalette_1 · Map ID 300 · #0",
  );
  const hidden = await page.locator("#canvas canvas").screenshot();
  expect(hidden.equals(first)).toBe(false);
  await page.locator("#palette-source").selectOption("none");
  await expect(page.locator("#loading")).toBeHidden();
  expect(
    (await page.locator("#canvas canvas").screenshot()).equals(first),
  ).toBe(true);
});
