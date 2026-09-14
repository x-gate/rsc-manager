# CGTool 動畫播放對照

日期：2026-09-14。基準為 [HonorLee-cn/CGTool b4d0811](https://github.com/HonorLee-cn/CGTool/tree/b4d08112524aa16b9fdb416ef865f8c196ffac20)。使用者本次指定此實作正確；因此本文件取代先前 xgtool GIF 播放規則。舊文件保留為歷史，不代表目前預設。

| 項目        | 目前行為                                                                                                          | 依據                                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| header      | 每個動作獨立判定 12/20-byte header，呼叫既有 WASM anime_build_from_bytes；容器間隙仍診斷                          | [Anime.ReadAnimeData](https://github.com/HonorLee-cn/CGTool/blob/b4d08112524aa16b9fdb416ef865f8c196ffac20/CrossgateToolkit/Anime.cs)                                              |
| 時間        | duration / frameCount / speed 毫秒，保留小數；不再截整到 GIF 的 10 ms                                             | [AnimePlayer.CreateAnimeOption / SetSpeed](https://github.com/HonorLee-cn/CGTool/blob/b4d08112524aa16b9fdb416ef865f8c196ffac20/CrossgateToolkit/AnimePlayer.cs)                   |
| 定位        | 使用 GraphicInfo offset；frame offset 只顯示，不相加                                                              | 同上 UpdateFrame 的 SpriteRenderer 路徑與 GraphicData 建立的 pivot                                                                                                                |
| 鏡射        | Extended.reversed 的 bit 0/1 分別水平／垂直鏡射，繞共同原點反射；整段 bounds 包含反射後的範圍。切換動作重設 flags | 同上 SpriteRenderer.flipX / flipY                                                                                                                                                 |
| 隱藏色表    | 只有 extended 動作依 Anime ID → GraphicInfo.MapID 查詢所選來源；末列優先。隱藏色表 > frame 非空內嵌色表 > CGP     | [GraphicData.UnpackGraphic](https://github.com/HonorLee-cn/CGTool/blob/b4d08112524aa16b9fdb416ef865f8c196ffac20/CrossgateToolkit/GraphicData.cs) 與 AnimePlayer 非 batch 載入流程 |
| 透明度      | 索引 0 透明；其他色不因純黑／紅／綠／藍而透明。空內嵌色表回退外部                                                 | 同上，WASM Palette 提供 alpha                                                                                                                                                     |
| 重複圖像 ID | 動畫使用目前 Graphic 來源的末列，仍提示來源與列；列表保留全部重複項                                               | [GraphicInfo.Init](https://github.com/HonorLee-cn/CGTool/blob/b4d08112524aa16b9fdb416ef865f8c196ffac20/CrossgateToolkit/GraphicInfo.cs) 字典賦值                                  |
| 事件        | flag > 20000 為命中，音效編號扣 20000；否則 > 10000 為攻擊結束，扣 10000；其他為原始音效編號                      | Anime.ReadAnimeData                                                                                                                                                               |

GraphicInfo 尺寸仍優先於 RD 尺寸，並顯示診斷。上下掃描列完整翻轉，符合 Unity Texture2D 的來源排列與網頁 RGBA 座標轉換。圖像、動畫與調色盤 bytes 仍由 xglib WASM 解析；未加入另一套 TypeScript 解壓器。

## 邊界

- Extended 的 reserved 顯示為 little-endian「調色盤欄位」，reversed 顯示為「旗標」；CGTool 解析 LOCK_PAL / LIGHT_THROUGH 但其播放器未使用，故不推測效果，也不以 Palet 欄位覆蓋來源選項。
- CGTool 使用全域版本字典；此檢視器保留手動選擇 Graphic、Anime、隱藏色表來源，不自動合併跨版本。標準／延伸動作切換時，色表快取包含動作索引，避免互相汙染。
- CGTool 也可由全域 Palet registry 找到同 Anime ID 的既載入色表；目前 UI 的隱藏色表來源只提供 Graphic 檔，CGP 由使用者單獨選擇，沒有自動建立跨檔全域 registry。
- 固定 10 FPS、零／負週期 fallback、動畫整段 fit 與掉幀後依累計時間追上進度是檢視器設計。非正週期有提示；不複製 Unity 每次 render tick 只推進一格造成的累積漂移。
- 事件僅作 metadata，不播放音效、不執行戰鬥事件。strict 像素／色表越界錯誤繼續顯示，沒有把損壞圖像轉成透明成功結果。
- 測試使用合成的不對稱圖像、混合 header、不同偏移和四種鏡射組合；未啟動 Unity 或拿原版素材逐格校對。

## 整合

xglib 的 CGTool 修正先更新，再在本 repository 重跑 `bun run build:wasm`。使用既有 auto header API；固定 header API 留在 xglib 供其他使用者。沒有檔案格式遷移或遊戲目錄寫入。共用解碼層的完整差異另見 `../xglib/docs/cgtool-audit.md`。

## 本次執行結果

xglib 整合 commit：`d1480b4`。`bun run build:wasm`、`bun run build`（lint / TypeScript / Vite）、23 項 Bun 單元測試與 9 項正式產物 Chrome E2E 通過；E2E 使用 8082。新增測試確認四種鏡射畫面不同且切回可還原、影格偏移不相加、時間軸推進、隱藏色表切換，以及 standard / extended 動作間不殘留色表。未以原版遊戲素材或 Unity runtime 校對。
