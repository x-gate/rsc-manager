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
export function discover(files: ResourceFile[], root: string): Catalog {
  const relevant = files.filter(({ path }) =>
    /^assets\/bin\/((graphic|anime)(?:info)?.*\.bin|pal\/[^/]+\.cgp)$/i.test(
      path,
    ),
  );
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
        new RegExp(`^assets/bin/${kind}info(.*)\\.bin$`, "i"),
      );
      if (!match) continue;
      const name = `${kind}${match[1]}`;
      const data = paths.get(`assets/bin/${name}.bin`.toLowerCase());
      if (data) sets.push({ name, info: entry, data });
      else warnings.push(`${entry.path} 缺少配對的 ${name}.bin。`);
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
