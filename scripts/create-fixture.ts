import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { syntheticResources } from "../tests/fixtures";
const root = resolve(import.meta.dir, "../.generated/fixture-game");
for (const [path, bytes] of syntheticResources()) {
  const target = resolve(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
console.log("合成測試資料已產生：.generated/fixture-game");
