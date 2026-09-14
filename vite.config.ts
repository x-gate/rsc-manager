import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  publicDir: false,
  server: { port: 8081, strictPort: true, host: "127.0.0.1" },
  worker: { format: "es" },
});
