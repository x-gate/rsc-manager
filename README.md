# x-gate 資源檢視器

以 PixiJS 8 與 xglib WASM，在網頁介面唯讀檢視使用者提供的 Graphic、Anime 與 CGP 資源。繁體中文介面，不需要帳號、後端或地圖檔案。

## 安裝與啟動

先決條件：Bun、支援 edition 2024 的 Rust、`wasm32-unknown-unknown` target，以及與 `../xglib/Cargo.lock` 相符的 `wasm-bindgen-cli`（本次 0.2.118）。同工作區需有 `../xglib`。

```sh
bun install --frozen-lockfile
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.118 --locked
bun run build:wasm
bun run dev
```

開啟 [本機檢視器](http://127.0.0.1:8081)。使用 8081 避開 map-viewer 的 8080。

建置腳本只讀取 xglib，將 Rust 快取、WASM、JS glue 與 TypeScript 契約產生於本 repository 的 `.generated/`。更新 xglib 後需重新執行 `bun run build:wasm`。可用環境變數 `XGLIB_DIR` / `WASM_BINDGEN` 指定其他 xglib 目錄 / CLI 路徑；相對路徑以本 repository 為基準。

## 選擇遊戲根目錄

首次開啟需選擇**包含 Assets 的根目錄**，例如：

```text
遊戲根目錄/
└── Assets/bin/
    ├── GraphicInfo_66.bin
    ├── Graphic_66.bin
    ├── GraphicInfoEx_5.bin   # 可選其他 Graphic 來源
    ├── GraphicEx_5.bin
    ├── AnimeInfo_4.bin      # Anime 可省略
    ├── Anime_4.bin
    ├── AnimeInfoEx_1.Bin
    ├── AnimeEx_1.Bin
    └── pal/palet_00.cgp
```

檔名配對不區分大小寫；`GraphicInfo<後綴>.bin` 與 `Graphic<後綴>.bin` 配對，Anime 同理。大小寫衝突會報錯；缺少配對資料檔會提示。Graphic 和 Anime 的尾碼沒有被視為相同版本契約，需由使用者分別選取。

Chrome / Edge 可將唯讀資料夾 handle 記在本網站的 IndexedDB。下次點「繼續使用」時重新要求讀取權限；不記錄檔案 bytes。瀏覽器可能撤銷授權。「忘記資料夾」清除記錄與目前資源，不修改遊戲資料。

不支援 `showDirectoryPicker` 時自動改用 `webkitdirectory`，也可選「相容模式選取資料夾」；相容模式每次開啟都需重選，且會清除先前儲存的 handle。目錄 API 需 localhost 或 HTTPS；不要以 `file://` 開啟。

## 操作

- 左側選擇 Graphic、Anime 與調色盤；也可選「不載入 Anime」單獨瀏覽 Graphic。切換任一來源會取消舊 Worker、清除預覽與舊紋理，再建立新索引。
- Graphic / Anime 分頁列出各來源的索引。搜尋 ID 的數字片段，或以 `#2` 精確尋找零起算的索引列 2。每頁 60 筆，重複 ID 分別列出。
- Graphic 顯示單張圖像、尺寸、signed 偏移、Map ID、索引列、地址與資料長度。使用 strict 解碼，失敗會顯示原因，不補零或截尾。
- Anime 可選動作 / 方向組合，播放、暫停、逐格前後移動、拖曳時間軸，並調整速度。顯示原始 duration、方向、action、flag 與 extended reversed。
- 圖像使用最近鄰取樣；拖曳平移、滾輪縮放，比例按鈕回到 100%。「適合視窗」依整段動作的所有影格範圍置中，避免動畫逐格跳動。
- 畫布聚焦後可按 `+` / `-` 縮放、`0` 適合視窗；◐ 切換深淺棋盤背景。
- 載入期間可取消，再按「重新載入資源」。壞資料或缺少圖像只影響相應預覽，可繼續選其他資源。

## 動畫呈現假設與界限

xglib 只解析結構，不定義播放器語意。本工具預設把正數 `duration` 視為整段毫秒，平均分配給影格；這是**預覽假設**，可改成固定 10 FPS。非正數使用 10 FPS。速度可選 0.5×、1×、2×。

圖像由 bottom-up 轉 top-down，沿用 map-viewer 慣例；Anime 暫以 Graphic 偏移加 frame 偏移呈現。`flag`、`reversed`、方向數字和 reserved 保留解析結果，不推測鏡射、音效或戰鬥語意。畫面與時序尚未對照原版遊戲驗證。

動畫只在目前選取的 Graphic 來源中尋找 `graphic_id`。重複 ID 暫用該來源第一列，會顯示診斷；Graphic 分頁仍可逐列檢視。缺少或無法解碼的圖像在對應影格顯示原因，不會借用其他資源集或前一格圖像。

索引上限一百萬列。單筆圖像與動畫切片最多 16 MiB；圖像邊長最多 4096、像素最多 4,194,304，Graphic 偏移絕對值最多 8192。單筆 Anime 最多 4096 個動作、100,000 個 frame；單一動作最多預覽 512 張獨立圖像，RGBA 合計最多 128 MiB。這是 RGBA 預覽上限，並非包含 WASM、canvas、GPU 與索引的總記憶體上限。

動畫進入 WASM 前會依目前 xglib header 規則檢查 frame 配置量與完整切片。xglib RLE 仍無完整的解壓配置上限，Worker 隔離與上述檢查不等於任意惡意檔案的安全保證。

## 開發、驗證與部署

```sh
bun run format       # 格式化維護中的檔案
bun run lint         # ESLint / Prettier
bun run typecheck    # TypeScript 嚴格檢查
bun run test         # 合成 bytes + 真實 WASM runtime
bun run test:e2e     # 產生合成資料並以本機 Chrome 測試
bun run build        # lint + typecheck + Vite 正式建置
bun run preview      # 預覽 dist，127.0.0.1:8081
E2E_PREVIEW=1 bun run test:e2e  # 對已建置的 dist 執行相同瀏覽器測試
```

E2E 使用已安裝的 Google Chrome；缺少時可用 `bunx playwright install chrome` 安裝。一般測試不讀取原版資源，截圖只包含原創合成資料。測試 fixture 與截圖位於忽略的 `.generated/`。

正式部署只需將 `dist/` 放至靜態 HTTP(S) 主機；`base: "./"` 支援子目錄。沒有上傳 API、遙測、外部字型或遊戲資源請求。起始模板的 `public/` 未使用，且透過 `publicDir: false` 排除部署。

## 模組與對外介面

| 模組                                                    | 責任                                         |
| ------------------------------------------------------- | -------------------------------------------- |
| `src/resources/catalog.ts` / `directory.ts`             | 本機目錄唯讀讀取、配對、handle 記錄          |
| `src/resources/session.ts`                              | 容器索引、切片、配置量檢查、WASM 呼叫與 RGBA |
| `src/resources/protocol.ts` / `client.ts` / `worker.ts` | 有型別的 Worker request / result，可終止載入 |
| `src/viewer/preview.ts`                                 | PixiJS 紋理生命週期、縮放、平移、動畫時間軸  |
| `src/main.ts` / `style.css`                             | 目錄流程、搜尋分頁、預覽與診斷介面           |
| `scripts/build-wasm.ts`                                 | 依 Cargo.lock 編譯 xglib 與產生 bindings     |

唯一跨 repository 依賴是 `rsc-manager → xglib`，無公開網路 API。使用 `graphic_strict_build_from_cgp`、`game_palette_build_from_cgp` 與 `anime_build_from_bytes`；傳入 `Uint8Array`，契約複製自 xglib 的 `xglib.d.ts`。不需修改 map-viewer 或 xglib。建置與部署順序為準備 xglib → 產生 WASM → 建置 rsc-manager → 部署 dist。整合基準和驗證範圍見 [整合紀錄](docs/integration.md)。

## 授權與歸屬

此工具為非官方研究專案，未由 Square Enix 授權或背書。遊戲名稱與商標屬各權利人。使用者應自行提供有權使用的本機資料，本 repository 不提供或散布原版程式碼、圖像、動畫、音樂或其他遊戲素材。專案尚未訂定正式授權；不自行假定可依某個開源授權散布。
