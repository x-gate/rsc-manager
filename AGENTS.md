# rsc-manager 維護指引

本 repository 是以 PixiJS / TypeScript / Vite 建立的本機遊戲資源檢視器，遵循上層工作區 AGENTS.md。

- 開始修改前閱讀 README.md 與 docs/integration.md，確認工作樹狀態。
- 唯一跨 repository 依賴為 rsc-manager → xglib。以 Bun 管理依賴及指令，提交 bun.lock。
- 圖像、CGP 與 Anime 的實際解碼使用 xglib WASM；TypeScript 僅負責容器索引尋址、配置量預檢、RGBA 轉換及預覽。
- 檔案只由使用者選取的根目錄讀取，不寫回、不上傳、不加入部署產物。不要加入原版遊戲素材；測試一律自行產生 bytes。
- 使用者可主動下載 Graphic PNG 或目前 Anime 動作的 PNG ZIP；輸出在瀏覽器本機產生，測試下載只能使用合成資料，不能把原版輸出加入 repository。
- 索引列身份由資源檔、類型與 row 決定，不能以 ID 去重或默默覆寫。Anime 與 Graphic 來源分開選擇；不要猜測版本尾碼對應。
- 未確認的 duration、偏移、方向或 flag 語意，必須在介面與文件標示假設。
- WASM bindings、Rust 編譯快取、測試資料及截圖只產生於已忽略的 .generated/。不要手動編輯產生的 bindings。
- 行為修改同步補上有意義的合成測試。交付前執行 bun run build、bun run test 與相關 bun run test:e2e。
- 使用 Conventional Commits；跨 branch 合併採 squash merge。
