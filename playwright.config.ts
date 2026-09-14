import { defineConfig } from "@playwright/test";
const production = !!process.env.E2E_PREVIEW;
const url = `http://127.0.0.1:${production ? 8082 : 8081}`;
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  workers: 2,
  expect: { timeout: 10000 },
  use: {
    baseURL: url,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      channel: "chrome",
      args: [
        "--enable-webgl",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: production ? "bun run preview --port 8082" : "bun run dev",
    url,
    reuseExistingServer: !process.env.CI && !production,
  },
});
