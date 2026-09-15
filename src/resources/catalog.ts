export interface ResourceFile {
  path: string;
  file: File;
}
export interface ResourceSet {
  name: string;
  info: ResourceFile;
  data: ResourceFile;
}
export interface Catalog {
  root: string;
  graphics: ResourceSet[];
  animes: ResourceSet[];
  palettes: ResourceFile[];
  warnings: string[];
}
// Both folder handles and file-list uploads use the same resource boundary.
export function isResourcePath(path: string) {
  return (
    /^assets\/bin\/(?:[^/]+\/)*(?:graphic|anime)[^/]*\.bin$/i.test(path) ||
    /^assets\/bin\/(?:[^/]+\/)*pal\/[^/]+\.cgp$/i.test(path)
  );
}
export function discover(files: ResourceFile[], root: string): Catalog {
  const relevant = files.filter(({ path }) => isResourcePath(path));
  const paths = new Map<string, ResourceFile>();
  for (const file of relevant) {
    const key = file.path.toLowerCase();
    if (paths.has(key)) throw new Error(`檔案路徑大小寫衝突：${file.path}`);
    paths.set(key, file);
  }
  const warnings: string[] = [];
  function pairs(kind: string) {
    const sets: ResourceSet[] = [];
    for (const entry of relevant) {
      const match = entry.path.match(
        new RegExp(`^(assets/bin/(?:[^/]+/)*)${kind}info([^/]*)\\.bin$`, "i"),
      );
      if (!match) continue;
      const basename = `${kind}${match[2]}`;
      const name = `${match[1].slice("assets/bin/".length)}${basename}`;
      const data = paths.get(`${match[1]}${basename}.bin`.toLowerCase());
      if (data) sets.push({ name, info: entry, data });
      else warnings.push(`${entry.path} 缺少同目錄的 ${basename}.bin。`);
    }
    return sets.sort((a, b) =>
      a.name.localeCompare(b.name, "en", { numeric: true }),
    );
  }
  const graphics = pairs("Graphic"),
    animes = pairs("Anime");
  const palettes = relevant
    .filter(({ path }) => /\/pal\/[^/]+\.cgp$/i.test(path))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (!graphics.length || !palettes.length)
    throw new Error(
      "找不到必要資源：Assets/bin/GraphicInfo*.bin、配對的 Graphic*.bin 與 pal/*.cgp。請選擇包含 Assets 的遊戲根目錄。",
    );
  return { root, graphics, animes, palettes, warnings };
}
export function fromFileList(files: FileList | File[]) {
  const list = Array.from(files);
  const root = list[0]?.webkitRelativePath.split("/")[0];
  if (!root) throw new Error("無法取得資料夾路徑，請重新選擇遊戲根目錄。");
  return {
    root,
    files: list.map((file) => ({
      file,
      path: file.webkitRelativePath.split("/").slice(1).join("/"),
    })),
  };
}
