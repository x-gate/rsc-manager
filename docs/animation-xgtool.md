# xgtool 動畫相容性修正

> 後續修正：目前行為以 [CGTool 對照](animation-cgtool.md) 為準；以下保留歷史整合紀錄。

日期：2026-09-14。使用者指定 xgtool 為正確解析流程的參考。固定基準為 `a5176dbf107f2f1567951476f652391b76f7f702`；只讀取公開程式流程，未納入 xgtool 程式碼或其遊戲圖像。

## 差異、依據與修正

| 項目          | 原先行為                              | 本次行為與依據                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| header layout | 每個動作獨立偵測 sentinel             | 起點只判定一次 12 / 20，後續沿用。避免 frame 中兩個 -1 偏移誤判。依 [AnimeIndex.Load](https://github.com/x-gate/xgtool/blob/a5176dbf107f2f1567951476f652391b76f7f702/pkg/anime.go)。                                                                                                                                                              |
| 記錄邊界      | 必須填滿下一筆索引前的所有 bytes      | ActCnt 決定實際結尾，剩餘容器 bytes 顯示診斷；單筆 WASM 仍接受恰好一筆資料。                                                                                                                                                                                                                                                                      |
| 位置          | Graphic offset + frame offset         | 與 [Anime.GIF](https://github.com/x-gate/xgtool/blob/a5176dbf107f2f1567951476f652391b76f7f702/pkg/anime.go) 相同的共同左上原點；整段 bounds 依最大圖像尺寸，不套用偏移、flag 或 reversed 效果。                                                                                                                                                   |
| 時序          | duration / frame count 的浮點毫秒     | GIF 使用整數 centiseconds，先截整至 10 ms 再套速度。零／負延遲明確使用 10 FPS fallback。                                                                                                                                                                                                                                                          |
| 隱藏色表      | 僅 CGP 或 frame 自己的色表            | 可指定色表 Graphic 來源，以 Anime ID 查 Map ID 首列；優先順序為 frame 非空色表 > 隱藏色表 > CGP。依 [dump-anime 流程](https://github.com/x-gate/xgtool/blob/a5176dbf107f2f1567951476f652391b76f7f702/cmd/dumpanime/root.go) 與 [隱藏色表測試](https://github.com/x-gate/xgtool/blob/a5176dbf107f2f1567951476f652391b76f7f702/pkg/anime_test.go)。 |
| 動畫透明度    | raw 索引 0 一律透明，其餘一律不透明   | raw / embedded 色表按 RGB 色鍵透明；CGP 自訂區同規則，固定區保留。依 [NewPaletteFromBytes / NewPaletteFromCGP](https://github.com/x-gate/xgtool/blob/a5176dbf107f2f1567951476f652391b76f7f702/pkg/palette.go)。                                                                                                                                   |
| 尺寸來源      | RD header 與索引不同即拒絕            | 使用 GraphicInfo 尺寸並警告差異，沿用 [Graphic.ImgPaletted](https://github.com/x-gate/xgtool/blob/a5176dbf107f2f1567951476f652391b76f7f702/pkg/graphic.go) 的尋址依據，保留 strict 像素數檢查。                                                                                                                                                   |
| 畫布 resize   | 只更新 fit；Pixi resizeTo 監聽 window | 容器 ResizeObserver 同步 app.resize，避免播放列顯示後畫布高度超出可視區、置中錯誤。                                                                                                                                                                                                                                                               |

## 邊界與相容性

- xglib 增加 `anime_build_from_bytes_with_header_size`，舊 Rust / WASM 入口及 palette API 不變。rsc-manager 的 bounds 預檢與 WASM 明確 layout 保持一致，不在 TypeScript 重寫動畫或 RLE 解析。
- raw BGR 與 CGP 的 bytes 契約保持分離。WASM 提供解碼 pixels / 色表，動畫的色鍵 alpha 與 RGBA 是檢視器呈現層的策略；靜態 Graphic 及 map-viewer 的通用透明度不變。
- xgtool 的 `ImgPaletted` 使用 `h - i/w`，會把一列寫在影像邊界外。本次沿用檢視器完整 `h - 1 - floor(i/w)` 翻轉，沒有把該掃描列裁切移入動畫播放修正，因此不宣稱 GIF bytes 或每個像素逐一相等。
- 圖像像素長度異常仍 strict 拒絕，不默默補零、截尾或借用前一格。隱藏色表缺失會回退 CGP；索引存在但內容不合法會保留錯誤。
- 依賴順序：更新 xglib → `bun run build:wasm` → `bun run build`。舊 bindings 沒有新入口，必須重建。沒有資料遷移、遊戲檔案寫入或 map-viewer 修改。

## 回歸驗證

新增合成測試覆蓋：後續假 sentinel、動畫尾端容器間隙、10 ms 截整、共同原點、raw 索引零的非透明色、純色透明鍵、CGP 固定色、隱藏 Map ID 來源與重新初始化、自己的色表優先、空內嵌色表繼承，以及不可靠的 RD 尺寸。

瀏覽器用兩格相同圖像、不同 frame 偏移比較畫布截圖，確認位置不跳動；再實際播放確認 timeline 前進，切換隱藏色表確認像素改變，切回 CGP 確認恢復。截圖均來自原創合成 bytes。未對原版遊戲素材進行畫面或時序校對。

## 整合版本與執行結果

xglib 基準更新至 `272a371`（新增入口，舊 API 保持相容）。rsc-manager 已以這個版本重建 `.generated/xglib`；相關 binaries 與合成資源皆未加入 Git。

- `cargo test --locked --offline`：77 項通過；Python 驗證工具 5 項通過。
- xglib rustfmt、Clippy（拒絕 warnings）與 cargo doc 通過。
- `bun run build:wasm`：Rust wasm32 release 及 JS bindings 產生成功。
- `bun run test`：22 項 WASM / 前端單元測試通過。
- `bun run build`：lint、TypeScript 與 Vite 正式建置通過。
- `E2E_PREVIEW=1 bun run test:e2e`：8082 正式產物的 8 項 Chrome 測試通過，包含動畫逐格畫面一致、播放推進與隱藏色表還原；未借用 8081 的開發伺服器。

來源：上表固定版本的 xgtool 程式碼；新測試資料均為自行產生，未用原版素材驗證。未修改 map-viewer 或 CGoriginmood。
