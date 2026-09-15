import "./style.css";
import {
  discover,
  fromFileList,
  type Catalog,
  type ResourceFile,
} from "./resources/catalog";
import {
  directoryPicker,
  scanDirectory,
  savedDirectory,
  type DirectoryHandle,
} from "./resources/directory";
import { ResourceClient } from "./resources/client";
import { PAGE_SIZE } from "./resources/session";
import {
  animationEvent,
  animationFrame,
  animationInterval,
} from "./resources/animation";
import type { Decoded, Entry, Kind } from "./resources/protocol";
import type { Anime, AnimeAction } from "../.generated/xglib/contract";
import { Preview, type PreviewFrame } from "./viewer/preview";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<header class="topbar"><div class="brand"><span class="mark" aria-hidden="true">▧</span><div><h1>資源檢視器</h1><small>x-gate / Resource explorer</small></div></div><div class="top-actions"><span class="local"><span class="dot"></span>僅在本機處理</span><button id="change" hidden>更換資料夾</button><button id="forget" hidden>忘記資料夾</button></div></header>
<div id="error" role="alert" hidden></div><div id="loading" class="loadbar" hidden><span id="progress" role="status"></span><button id="cancel">取消載入</button></div>
<main id="welcome" class="welcome"><span class="eyebrow">YOUR LOCAL RESOURCE LIBRARY</span><h2>每一張圖像，<br>每一格動作。</h2><p>開啟你的遊戲資料夾，在瀏覽器中探索 Graphic 與 Anime。<br>從靜態像素到完整動畫，讓資源細節一目瞭然。</p><section class="connect-card"><div><h3>連接本機遊戲資源</h3><p>請選擇包含 <code>Assets</code> 的遊戲根目錄。<br>檔案僅供唯讀檢視，不會上傳或修改。</p><div class="button-row"><button id="pick" class="primary">選擇遊戲資料夾 ↗</button><button id="fallback">相容模式選取資料夾</button><button id="resume" hidden></button></div></div><div class="folder-icon" aria-hidden="true">▦</div></section><section class="features"><div><span class="eyebrow">01 / GRAPHIC</span><h3>看見像素細節</h3><p>搜尋圖像 ID、切換資源檔與調色盤，檢視尺寸、偏移和索引。</p></div><div><span class="eyebrow">02 / ANIME</span><h3>拆解每一格動作</h3><p>選擇動作與方向，播放、暫停或逐格檢查圖像與原始欄位。</p></div><div><span class="eyebrow">03 / LOCAL FIRST</span><h3>資源留在你的電腦</h3><p>使用 xglib WASM 在瀏覽器內解析，不需要帳號或後端服務。</p></div></section><p class="note">非官方研究工具，未由 Square Enix 授權或背書。遊戲名稱及商標屬各權利人。<br>請使用你有權使用的本機資料；本工具不提供遊戲素材。</p></main>
<main id="workspace" class="workspace" hidden><aside class="sidebar"><div class="list-heading"><span class="section-label">RESOURCE LIBRARY</span><small id="root-name"></small></div><div class="source-fields"><label>Graphic 資源檔<select id="graphic-source"></select></label><label>Anime 資源檔<select id="anime-source"></select></label><label>調色盤<select id="palette"></select></label><label>動畫隱藏調色盤<select id="palette-source"></select></label></div><button id="reload" hidden>重新載入資源</button><div class="tabs" role="tablist" aria-label="資源類型"><button id="graphic-tab" role="tab" aria-selected="true">Graphic</button><button id="anime-tab" role="tab" aria-selected="false">Anime</button></div><input id="search" class="search" type="search" placeholder="搜尋 ID 或 #索引列…" aria-label="搜尋資源 ID 或索引列"><div class="list-heading"><span class="section-label">索引列表</span><small id="count">—</small></div><div id="entries" class="resource-list" aria-label="資源列表"></div><div class="pager"><button id="prev" aria-label="上一頁">←</button><span id="page">—</span><button id="next" aria-label="下一頁">→</button></div></aside>
<section class="stage-area"><div class="stage-toolbar"><div class="stage-title"><span id="kind" class="tag">GRAPHIC</span><h2 id="selected-title">選擇一筆資源</h2></div><div class="tools"><button id="background" aria-label="切換預覽背景">◐</button><button id="zoom" title="回到 100%">100%</button><button id="fit">適合視窗</button></div></div><div class="canvas-wrap"><div id="canvas"></div><span class="canvas-caption">PIXEL PREVIEW / READ ONLY</span><div id="empty" class="empty-preview">從左側選擇資源以開始預覽</div></div><div id="playback" class="playback" hidden><input id="timeline" type="range" min="0" max="0" value="0" aria-label="動畫影格"><div class="button-row"><button id="back-frame" aria-label="上一格">◀</button><button id="play">播放</button><button id="next-frame" aria-label="下一格">▶</button><span id="frame-info"></span></div></div><div class="stage-foot"><span>拖曳平移 · 滾輪縮放 · 0 適合視窗</span><span>NEAREST PIXEL</span></div></section>
<aside class="inspector"><span class="section-label">INSPECTOR</span><h2>資源資訊</h2><dl id="metadata"><dt>狀態</dt><dd>尚未選取</dd></dl><div id="animation-controls" class="controls" hidden><label>動作 / 方向<select id="action"></select></label><label>播放時序<select id="timing"><option value="duration">CGTool 時序（毫秒）</option><option value="fps">固定 10 FPS</option></select></label><label>速度<select id="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label><p class="note">依 Graphic 偏移定位，套用水平／垂直鏡射。Frame 偏移保留供檢視；事件只顯示，不播放音效。</p></div><p id="source-note"></p><p id="warnings" class="warnings"></p></aside></main>
<footer class="statusbar"><span id="status" role="status">等待選擇遊戲資料夾</span><span>xglib WASM · PixiJS</span></footer><input id="directory-input" type="file" webkitdirectory multiple hidden>
`;
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const select = (id: string) => el<HTMLSelectElement>(id);
const input = (id: string) => el<HTMLInputElement>(id);
const button = (id: string) => el<HTMLButtonElement>(id);
const text = (id: string, value: string) => {
  el(id).textContent = value;
};
const error = (value: unknown) => {
  text("error", String(value));
  el("error").hidden = false;
};
const clearError = () => {
  el("error").hidden = true;
};
const busy = (message?: string) => {
  el("loading").hidden = !message;
  if (message) text("progress", message);
};
let catalog: Catalog | undefined,
  client: ResourceClient | undefined,
  saved: DirectoryHandle | undefined;
let type: Kind = "graphic",
  offset = 0,
  generation = 0,
  selection = 0,
  listing = 0,
  directoryJob = 0;
let selected: Entry | undefined,
  anime: Anime | undefined,
  frames: PreviewFrame[] = [];
let ready = false;

const preview = new Preview();
let previewReady: Promise<void> | undefined;
const header = (action: AnimeAction) =>
  "Standard" in action.header ? action.header.Standard : action.header.Extended;
function options(id: string, values: { label: string; value: string }[]) {
  select(id).replaceChildren(
    ...values.map(({ label, value }) => new Option(label, value)),
  );
}
function metadata(values: Record<string, string | number>) {
  el("metadata").replaceChildren(
    ...Object.entries(values).flatMap(([key, value]) => {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = key;
      dd.textContent = String(value);
      return [dt, dd];
    }),
  );
}
function resetPreview() {
  selection++;
  preview.clear();
  frames = [];
  anime = undefined;

  selected = undefined;
  el("playback").hidden = true;
  el("animation-controls").hidden = true;
  el("empty").hidden = false;
  text("empty", "從左側選擇資源以開始預覽");
  text("selected-title", "選擇一筆資源");
  text("warnings", catalog?.warnings.join("\n") ?? "");
  metadata({ 狀態: "尚未選取" });
}
function stopSession() {
  generation++;
  listing++;
  ready = false;
  client?.dispose();
  client = undefined;
  resetPreview();
  busy();
}
async function loadSources() {
  if (!catalog) return;
  stopSession();
  clearError();
  el("reload").hidden = true;
  el("entries").replaceChildren();
  text("count", "—");
  text("page", "—");
  button("prev").disabled = true;
  button("next").disabled = true;
  const job = generation;
  const active = new ResourceClient();
  client = active;
  const graphic = catalog.graphics[Number(select("graphic-source").value)];
  const animation = catalog.animes[Number(select("anime-source").value)];
  const palette = catalog.palettes[Number(select("palette").value)];
  text(
    "source-note",
    `${graphic.data.path}\n${animation?.data.path ?? "沒有 Anime 資源"}\n${palette.path}`,
  );
  busy("正在建立資源索引…");
  try {
    const result = await active.request({
      kind: "init",
      graphic,
      anime: animation,
      palette: palette.file,
      paletteGraphic:
        select("palette-source").value === "none"
          ? null
          : select("palette-source").value === "current"
            ? undefined
            : catalog.graphics[Number(select("palette-source").value)],
    });
    if (job !== generation || result.kind !== "init") return;
    ready = true;
    offset = 0;
    input("search").value = "";
    text(
      "status",
      `${catalog.root} · ${result.graphics.toLocaleString()} Graphic · ${result.animes.toLocaleString()} Anime · ${result.duplicates} 個重複圖像 ID`,
    );
    busy();
    await renderList(true);
  } catch (e) {
    if (job === generation) {
      busy();
      error(e);
      el("reload").hidden = false;
    }
  }
}
async function renderList(auto = false) {
  if (!client || !ready) return;
  const job = ++listing,
    active = client;
  try {
    const result = await active.request({
      kind: "search",
      type,
      query: input("search").value,
      offset,
    });
    if (job !== listing || active !== client || result.kind !== "search")
      return;
    el("entries").replaceChildren(
      ...result.entries.map((entry) => {
        const b = document.createElement("button");
        b.className = "entry";
        b.dataset.row = String(entry.row);
        b.setAttribute("aria-current", String(selected?.row === entry.row));
        const name = document.createElement("span"),
          detail = document.createElement("small");
        name.textContent = `${type === "graphic" ? "▧" : "▷"}  ${entry.id}`;
        detail.textContent = `#${entry.row} · ${type === "graphic" ? `${entry.width}×${entry.height}` : `${entry.actions} 動作`}`;
        b.append(name, detail);
        b.setAttribute("aria-label", `ID ${entry.id}，索引列 ${entry.row}`);
        b.onclick = () => void openEntry(entry);
        return b;
      }),
    );
    text("count", `${result.total.toLocaleString()} 筆`);
    text(
      "page",
      `${result.total ? Math.floor(offset / PAGE_SIZE) + 1 : 0} / ${Math.ceil(result.total / PAGE_SIZE)}`,
    );
    button("prev").disabled = offset === 0;
    button("next").disabled = offset + PAGE_SIZE >= result.total;
    if (!result.total)
      text(
        "entries",
        type === "anime" && !catalog?.animes.length
          ? "此資料夾沒有 Anime 資源。"
          : "沒有符合的資源。",
      );
    if (auto && result.entries[0]) await openEntry(result.entries[0]);
  } catch (e) {
    if (job === listing && active === client) error(e);
  }
}
async function openEntry(entry: Entry) {
  if (!client || !ready) return;
  resetPreview();
  selected = entry;
  const job = selection,
    active = client;
  clearError();
  for (const b of el("entries").querySelectorAll<HTMLButtonElement>("button"))
    b.setAttribute("aria-current", String(Number(b.dataset.row) === entry.row));
  text("selected-title", `ID ${entry.id}`);
  text("kind", type.toUpperCase());
  metadata({
    ID: entry.id,
    索引列: entry.row,
    地址: `0x${entry.addr.toString(16)}`,
    資料長度: `${entry.len} bytes`,
    ...(type === "graphic"
      ? {
          尺寸: `${entry.width} × ${entry.height}`,
          偏移: `${entry.offX}, ${entry.offY}`,
          "Map ID": String(entry.mapId),
        }
      : { 動作數: String(entry.actions) }),
  });
  busy(`正在解析 ${type} #${entry.row}…`);
  try {
    const result = await active.request({ kind: type, row: entry.row });
    if (job !== selection || active !== client) return;
    if (result.kind === "graphic") {
      const image = result.value;
      frames = [{ image, x: image.offX, y: image.offY }];
      preview.setFrames(frames, 100);
      el("empty").hidden = true;
      text(
        "warnings",
        [...(catalog?.warnings ?? []), ...(image.warnings ?? [])].join("\n"),
      );
      busy();
    } else if (result.kind === "anime") {
      anime = result.value;

      el("animation-controls").hidden = false;
      options(
        "action",
        anime.actions.map((a, i) => ({
          value: String(i),
          label: `#${i} · 動作 ${header(a).action} / 方向 ${header(a).direct} · ${a.frames.length} 格`,
        })),
      );
      if (!anime.actions.length) {
        text("empty", "這筆 Anime 沒有動作。");
        busy();
        return;
      }
      await openAction();
    }
  } catch (e) {
    if (job === selection && active === client) {
      busy();
      error(e);
      text("empty", "無法預覽這筆資源。請查看上方診斷，或選擇其他索引列。");
    }
  }
}
function interval() {
  const action = anime?.actions[Number(select("action").value)];
  return animationInterval(
    action ? header(action).duration : 0,
    action?.frames.length ?? 0,
    Number(select("speed").value),
    select("timing").value === "fps",
  );
}
async function openAction() {
  const action = anime?.actions[Number(select("action").value)];
  if (!action || !client) return;
  const job = ++selection,
    active = client;
  preview.clear();
  frames = [];
  el("playback").hidden = true;
  clearError();
  el("empty").hidden = false;
  text("empty", "正在準備動畫影格…");
  busy("正在解析動畫圖像…");
  try {
    const ids = [...new Set(action.frames.map((frame) => frame.graphic_id))];
    if (ids.length > 512)
      throw new Error("此動作超過 512 張獨立圖像的預覽上限。");
    const images = new Map<number, Decoded>(),
      failures = new Map<number, string>(),
      notes = new Set<string>();
    let bytes = 0;
    for (const id of ids) {
      if (job !== selection || active !== client) return;
      busy(`正在準備圖像 ${images.size + failures.size + 1} / ${ids.length}…`);
      try {
        const refs = await active.request({ kind: "resolve", id });
        if (job !== selection || active !== client) return;
        if (refs.kind !== "resolve" || !refs.rows.length)
          throw new Error(`目前 Graphic 資源缺少 ID ${id}`);
        if (refs.rows.length > 1)
          notes.add(
            `ID ${id} 有 ${refs.rows.length} 筆；依 CGTool 使用末列 #${refs.rows.slice(-1)[0]}，可在 Graphic 分頁逐筆檢視。`,
          );
        const result = await active.request({
          kind: "graphic",
          row: refs.rows.slice(-1)[0]!,
          animeRow: selected!.row,
          animeAction: Number(select("action").value),
        });
        if (job !== selection || active !== client) return;
        if (result.kind === "graphic") {
          bytes += result.value.rgba.byteLength;
          if (bytes > 128 * 1024 * 1024)
            throw new Error("動畫圖像超過 128 MiB 預覽上限。");
          images.set(id, result.value);
          for (const warning of result.value.warnings ?? [])
            notes.add(`圖像 ${id}：${warning}`);
        }
      } catch (e) {
        if (bytes > 128 * 1024 * 1024) throw e;
        failures.set(id, String(e));
      }
    }
    if (job !== selection || active !== client) return;
    frames = action.frames.map((frame) =>
      animationFrame(
        images.get(frame.graphic_id),
        failures.get(frame.graphic_id),
        "Extended" in action.header ? action.header.Extended.reversed : 0,
      ),
    );
    if (header(action).duration <= 0)
      notes.add("週期為零或負值，預覽暫以 10 FPS 播放。");
    for (const [id, message] of failures) notes.add(`圖像 ${id}：${message}`);
    text("warnings", [...(catalog?.warnings ?? []), ...notes].join("\n"));
    input("timeline").max = String(Math.max(0, frames.length - 1));
    el("playback").hidden = !frames.length;
    preview.setFrames(frames, interval());
    text("play", "播放");
    busy();
    if (!frames.length) text("empty", "這個動作沒有影格。");
  } catch (e) {
    if (job === selection && active === client) {
      busy();
      error(e);
      text("empty", "無法預覽這個動作。請選擇其他動作或資源檔。");
    }
  }
}
preview.onFrame = (index) => {
  const frame = frames[index];
  input("timeline").value = String(index);
  el("empty").hidden = !!frame?.image;
  if (frame?.error) text("empty", frame.error);
  const raw = anime?.actions[Number(select("action").value)]?.frames[index];
  const action = anime?.actions[Number(select("action").value)];
  text(
    "frame-info",
    `${index + 1} / ${frames.length}${raw ? ` · Graphic ${raw.graphic_id} · offset ${raw.off_x}, ${raw.off_y} · flag ${raw.flag}` : ""}`,
  );
  if (action && selected)
    metadata({
      ID: selected.id,
      索引列: selected.row,
      地址: `0x${selected.addr.toString(16)}`,
      資料長度: `${selected.len} bytes`,
      動作: header(action).action,
      方向: header(action).direct,
      duration: header(action).duration,
      每格延遲: `${animationInterval(header(action).duration, action.frames.length)} ms（1×）`,
      影格數: action.frames.length,
      header: "Extended" in action.header ? "Extended" : "Standard",
      ...(raw
        ? {
            事件: animationEvent(raw.flag).effect,
            音效編號: animationEvent(raw.flag).audio,
          }
        : {}),
      ...("Extended" in action.header
        ? {
            旗標: action.header.Extended.reversed,
            調色盤欄位:
              action.header.Extended.reserved[0] |
              (action.header.Extended.reserved[1] << 8),
          }
        : {}),
    });
};
preview.onZoom = (zoom) => text("zoom", `${Math.round(zoom * 100)}%`);
async function accept(files: ResourceFile[], root: string, job: number) {
  const next = discover(files, root);
  if (job !== directoryJob) return;
  catalog = next;
  el("welcome").hidden = true;
  el("workspace").hidden = false;
  el("change").hidden = false;
  el("forget").hidden = false;
  text("root-name", root);
  for (const [id, sets] of [
    ["graphic-source", next.graphics],
    ["anime-source", next.animes],
  ] as const)
    options(
      id,
      sets.length
        ? sets.map((set, i) => ({ value: String(i), label: set.name }))
        : [{ value: "", label: "沒有 Anime 資源" }],
    );
  options("palette-source", [
    { value: "current", label: "目前 Graphic 的隱藏調色盤" },
    { value: "none", label: "不使用隱藏色表" },
    ...next.graphics.map((set, i) => ({ value: String(i), label: set.name })),
  ]);
  select("anime-source").disabled = !next.animes.length;
  if (next.animes.length)
    select("anime-source").add(new Option("不載入 Anime", "-1"));
  options(
    "palette",
    next.palettes.map((p, i) => ({
      value: String(i),
      label: p.path.replace(/^assets\/bin\//i, ""),
    })),
  );
  previewReady ??= preview.init(el("canvas"));
  await previewReady;
  if (job === directoryJob) await loadSources();
}
async function choose(handle?: DirectoryHandle) {
  if (!handle && !directoryPicker) {
    input("directory-input").click();
    return;
  }
  const job = ++directoryJob;
  clearError();
  try {
    const root =
      handle ??
      (await directoryPicker!({ mode: "read", id: "x-gate-rsc-manager" }));
    if (
      handle &&
      (await handle.requestPermission({ mode: "read" })) !== "granted"
    )
      throw new Error("未取得讀取權限，請重新選擇資料夾。");
    if (job !== directoryJob) return;
    stopSession();
    busy("正在尋找 Graphic、Anime 與調色盤…");
    const files = await scanDirectory(root, () => job !== directoryJob);
    if (job !== directoryJob) return;
    await accept(files, root.name, job);
    if (job !== directoryJob) return;
    saved = root;
    try {
      await savedDirectory(root);
    } catch {
      error("資源已開啟，但瀏覽器無法記住此資料夾；下次需重新選取。");
    }
  } catch (e) {
    if (job !== directoryJob) return;
    busy();
    if (!(e instanceof DOMException && e.name === "AbortError")) {
      error(e);
      if (catalog) el("reload").hidden = false;
    }
  }
}
input("directory-input").onchange = async () => {
  const files = input("directory-input").files;
  if (!files?.length) return;
  const job = ++directoryJob;
  stopSession();
  clearError();
  busy("正在辨識本機資源…");
  try {
    const chosen = fromFileList(files);
    await accept(chosen.files, chosen.root, job);
    if (job !== directoryJob) return;
    saved = undefined;
    el("resume").hidden = true;
    await savedDirectory(null).catch(() => {});
  } catch (e) {
    if (job === directoryJob) {
      busy();
      error(e);
      if (catalog) el("reload").hidden = false;
    }
  } finally {
    input("directory-input").value = "";
  }
};
button("pick").onclick = () => void choose();
button("change").onclick = () => void choose();
button("fallback").onclick = () => input("directory-input").click();
button("resume").onclick = () => void choose(saved);
button("forget").onclick = async () => {
  directoryJob++;
  stopSession();
  catalog = undefined;
  saved = undefined;
  el("workspace").hidden = true;
  el("welcome").hidden = false;
  el("change").hidden = true;
  el("forget").hidden = true;
  el("resume").hidden = true;
  clearError();
  el("entries").replaceChildren();
  for (const id of [
    "graphic-source",
    "anime-source",
    "palette",
    "palette-source",
  ])
    select(id).replaceChildren();
  text("source-note", "");
  text("status", "資料夾已忘記，遊戲檔案未修改。");
  try {
    await savedDirectory(null);
  } catch {
    error("無法移除瀏覽器內的資料夾記錄；請使用網站設定清除儲存資料。");
  }
};
button("cancel").onclick = () => {
  directoryJob++;
  stopSession();
  text("status", "載入已取消。");
  if (catalog) el("reload").hidden = false;
};
button("reload").onclick = () => void loadSources();
for (const id of [
  "graphic-source",
  "anime-source",
  "palette",
  "palette-source",
])
  select(id).onchange = () => void loadSources();
for (const kind of ["graphic", "anime"] as const)
  button(`${kind}-tab`).onclick = () => {
    type = kind;
    offset = 0;
    input("search").value = "";
    resetPreview();
    busy();
    clearError();
    text("kind", kind.toUpperCase());
    for (const tab of ["graphic", "anime"])
      button(`${tab}-tab`).setAttribute("aria-selected", String(tab === kind));
    void renderList(true);
  };
let searchTimer: ReturnType<typeof setTimeout>;
input("search").oninput = () => {
  listing++;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    offset = 0;
    void renderList();
  }, 150);
};
button("prev").onclick = () => {
  offset = Math.max(0, offset - PAGE_SIZE);
  void renderList();
};
button("next").onclick = () => {
  offset += PAGE_SIZE;
  void renderList();
};
select("action").onchange = () => void openAction();
select("timing").onchange = select("speed").onchange = () =>
  preview.setInterval(interval());
button("play").onclick = () => {
  preview.playing = !preview.playing;
  text("play", preview.playing ? "暫停" : "播放");
};
for (const [id, delta] of [
  ["back-frame", -1],
  ["next-frame", 1],
] as const)
  button(id).onclick = () => {
    preview.playing = false;
    text("play", "播放");
    preview.step(delta);
  };
input("timeline").oninput = () => {
  preview.playing = false;
  text("play", "播放");
  preview.seek(Number(input("timeline").value));
};
button("fit").onclick = () => preview.fit();
button("zoom").onclick = () => preview.setZoom(1);
button("background").onclick = () =>
  el("canvas").parentElement!.classList.toggle("dark");
const initialDirectoryJob = directoryJob;
void savedDirectory()
  .then((handle) => {
    if (initialDirectoryJob !== directoryJob) return;
    saved = handle;
    if (saved) {
      text("resume", `繼續使用 ${saved.name}`);
      el("resume").hidden = false;
      el("forget").hidden = false;
    }
  })
  .catch(() => {});
