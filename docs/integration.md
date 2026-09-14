# 資源檢視器整合紀錄

日期：2026-09-14。

此節以下保留首次整合紀錄；後續動畫修正以 [xgtool 對照紀錄](animation-xgtool.md) 與 README 的目前規則為準。

## 背景與決策

rsc-manager 由 bun create pixi.js 起始模板建立。依工作區規則，資源只由使用者指定的本機遊戲根目錄讀取，解析交由既有 xglib WASM；不建立後端、不修改或納入原版資料。

整合基準：xglib `b111040f69ee27bbd24667be6acebf0d443e3b79`，`wasm-bindgen 0.2.118`。參照 xglib 的 `docs/architecture-api.md`、`src/types/anime.rs` 與 `xglib.d.ts` 核對介面及配置量預檢。map-viewer 的 WASM 建置、目錄 handle 儲存、Worker client 流程在本 repository 調整沿用，RGBA 翻轉沿用其顯示慣例。無執行時 map-viewer 依賴。

## 已核對的解析行為

- GraphicInfo 每列 40 bytes，AnimeInfo 每列 12 bytes。地址、ID 與 signed 欄位保留；列表身份是 row，沒有以 ID 去重。
- Anime 切片終點使用下一個不同且有效的地址，最後一筆使用資料檔大小；排序的是地址，不是 ID。相同地址的索引列共用切片，但仍各自保留動作數與 row。此策略沿用 xglib 樣本支持的容器策略，不宣稱適用所有版本。
- WASM `AnimeHeader` 為 Standard / Extended tagged object。預檢依 xglib 在 offset 16 的 -1 sentinel 判斷 extended，檢查完整動作與 frame 數量後才交給 WASM。
- 圖像使用 strict CGP 入口；WASM 錯誤可能是字串，UI 統一以 String(error) 保留診斷。調色盤與動畫的實際解析未以 TypeScript 重寫。

## 自行設計或待驗證的顯示語意

- 正數 duration 暫視為整段毫秒；可改固定 10 FPS。Graphic offset 與 frame offset 相加。
- 動作／方向以原始數字表示，沒有推測其遊戲名稱。flag、reversed 不自動套用效果。
- 一組 Graphic + 一組 Anime 由使用者明確選取。動畫圖像 ID 重複時用首列並警告；缺少時顯示空白與錯誤訊息。
- 不合併來源，不依尾碼猜映射，不修改資料或匯出素材。

## 驗證範圍

單元測試以自行產生的圖像、索引、CGP 和動畫 bytes 驗證真實 WASM runtime。包含 standard / extended 動作、signed frame 欄位、亂序與共用動畫地址、圖像重複 ID、截斷資料、畸形 frame 數量、strict 錯誤、分頁與固定時鐘時間軸。

瀏覽器測試使用合成目錄，涵蓋首次選取、Graphic／Anime 檢視、來源與調色盤切換、逐格播放、缺少圖像、取消／重新載入、忘記目錄和手機版面。Native directory picker 與瀏覽器授權對話框需手動驗證：首次選根目錄 → 重新整理 → 點繼續使用並允許唯讀 → 忘記資料夾 → 重新整理確認無保留記錄。

本次不對 CGoriginmood 執行工具、不複製原版資源，也未以原版遊戲校對畫面、方向、位移或時序；這些不列為已驗證。

自動化目錄 API 測試以原創合成 OPFS 目錄取代 native picker，確認唯讀掃描與 IndexedDB 不可用時仍可預覽。此環境嘗試將 OPFS handle 儲存至 IndexedDB 時 Chrome 程序崩潰，故未將其當成真實遊戲目錄 handle 的恢復驗證；native 授權及 handle 重新授權保留上述手動驗證步驟。

## 本次執行結果

| 檢查                             | 結果                                                                |
| -------------------------------- | ------------------------------------------------------------------- |
| `bun run build:wasm`             | Rust wasm32 release 與 wasm-bindgen web bindings 產生成功           |
| `bun run build`                  | ESLint / Prettier、TypeScript（含 scripts / tests）與 Vite 建置通過 |
| `bun run test`                   | 12 項通過，41 個 assertions，使用真實 WASM runtime                  |
| `E2E_PREVIEW=1 bun run test:e2e` | 正式 dist 的 7 項 Chrome E2E 全部通過                               |
| 合成資料截圖                     | 已人工檢視首頁與 Anime 預覽版面                                     |
| `git diff --check`               | 通過；.generated / dist / 合成 fixture 均由 Git 忽略                |

建置工具依本機安裝指定 `WASM_BINDGEN=/private/tmp/x-gate-wasm-tools/bin/wasm-bindgen`，Rust 工具位於使用者 `.cargo/bin`。這些是本次環境路徑，不是部署或開發的固定要求。map-viewer 與 xglib 工作樹未修改；沒有原版資源納入產物。
