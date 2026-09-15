# Puk2／Puk3 子目錄載入修正

日期：2026-09-15。依賴基準：xglib `d1480b4`；修改前 rsc-manager `5188b37`。

## 原因與修正

原本原生資料夾掃描只走訪 Assets/bin 與其 pal 子目錄，catalog 也只配對 Assets/bin 直屬的 GraphicInfo／AnimeInfo。因此使用者指定的 Puk2／Puk3 組合在進入 WASM 前就被漏掉；相容模式雖收到檔案清單，也會被 catalog 排除。

現在兩種選取方式使用相同的資源路徑判斷，搜尋 Assets/bin 的子目錄，只在同一目錄配對 Info 與資料檔。來源顯示相對子目錄，保留不同目錄的同名資源；CGP 顯示相對路徑。沒有推測 Graphic／Anime 尾碼的版本關係，仍由使用者各自選取。掃描範圍不擴張至遊戲根目錄的其他資料夾。

重新選擇包含 Assets 的遊戲根目錄後，可選 Puk2/Graphic_PUK2_2 搭配 Puk2/Anime_PUK2_4，或 Puk3/Graphic_PUK3_1 搭配 Puk3/Anime_PUK3_2。舊清單需要重新選取目錄以重新掃描；只重新載入資源不會更新目錄清單。

## 真實樣本唯讀驗證

使用 `.generated/audit-puk.ts` 接受外部遊戲根目錄，以 discover → ResourceSession → 真實 xglib WASM 檢查全部圖像與 Anime。圖像只解碼於記憶體，沒有保存圖片；Anime 檢查所有動作及 frame 引用是否存在於選定 Graphic。CGP 使用 pal/palet_00.cgp，未選隱藏調色盤。

```sh
bun .generated/audit-puk.ts ../CGoriginmood > .generated/audit-puk-result.json
```

| 組合 | Graphic 索引 | strict 圖像成功 | Anime 成功 | 動作  | frames |
| ---- | ------------ | --------------- | ---------- | ----- | ------ |
| Puk2 | 11033        | 11007           | 343/343    | 15273 | 116627 |
| Puk3 | 4592         | 4562            | 155/155    | 6938  | 57173  |

載入問題與下列已確認的樣本異常分開處理；保留既有 strict 診斷，不將資料自動補零、截尾或重映射：

- Puk2 有 25 張圖的 RLE 解壓長度比 width × height 多 1 byte；另有 #1948 的高度為 -26、記錄長度只有 16 bytes，超出預覽允許範圍。
- Puk3 有 30 張圖的 RLE 解壓長度比 width × height 多 1 byte。
- 上述 55 張的 Info 與 RD 尺寸及長度一致，palette size 為 0。獨立 Python RLE 長度計算也得到多 1 byte，並非目錄配錯檔案；這些圖仍顯示 strict 錯誤。未在此修正中改變已宣告的 strict 契約。
- Puk2 動畫引用包含所選 Graphic 中不存在的 signed ID -65535；Puk3 為 -65535 與 524623。保留缺少圖像診斷，不猜測特殊指令或跨檔映射。

此驗證確認全部 498 筆 Anime 可解析，不等同全部影格可顯示，也不包含原遊戲的視覺姿態、時序、音效或隱藏調色盤校準。此次不修改 xglib 或 map-viewer。

## 合成回歸與建置

- `bun run test`：25 項、90 個 assertions 通過。含巢狀資源的實際 WASM 解碼、跨目錄禁止配對、不同目錄同名檔保留、大小寫衝突及巢狀 CGP。
- `bun run build`：ESLint／Prettier、TypeScript、Vite 通過。
- `E2E_PREVIEW=1 bun run test:e2e`：10 項通過。相容模式檔案清單與原生 picker 的合成 OPFS handle 均測試 Puk2／Puk3 Graphic 顯示、Anime 切換與逐格播放。原生系統授權對話框仍由人工操作；測試不讀原版資源。
- `git diff --check`：通過。

## 輸入指紋

九個原版檔案在驗證前後的 SHA-256 全部一致，inputsUnchanged=true。原始資料嚴格唯讀，沒有加入測試 fixture、Git 或部署產物。

| 路徑（相對遊戲根目錄）                 | SHA-256                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| Assets/bin/pal/palet_00.cgp            | `28822eb7767a714d4d8045c3ed1916ab05d1c4c0eba25c460f1429b7fb921255` |
| Assets/bin/Puk2/GraphicInfo_PUK2_2.bin | `70414dd5f821783fc78db1915e2771a8a168a182263de90eeb0cca1fceaa2f6d` |
| Assets/bin/Puk2/Graphic_PUK2_2.bin     | `e1ba49a7f5421948437d3f809dc2c29f69aab8c71c8b4c93c983debc90d97579` |
| Assets/bin/Puk2/AnimeInfo_PUK2_4.bin   | `624f45c34d1505bb24e67200944d0f8990a917d9e8ed4057eb348d9bec162e96` |
| Assets/bin/Puk2/Anime_PUK2_4.bin       | `fc0e427ba60cc053c4603ea284ef309bc76cf0cc6069f025179c676e5d4bc384` |
| Assets/bin/Puk3/GraphicInfo_PUK3_1.bin | `c5c215e57cc7e4a148d9ffd7cb3c32eff0771c9772c96584e3577fba705170c4` |
| Assets/bin/Puk3/Graphic_PUK3_1.bin     | `e690e06796ddce66688526134031ac8d568f60be97a3cebf756be9f1dc73768f` |
| Assets/bin/Puk3/AnimeInfo_PUK3_2.bin   | `c42e8152fb903f0d33dcb28790eb77c550f6804ad7f61c5d73961ef58014cce1` |
| Assets/bin/Puk3/Anime_PUK3_2.bin       | `e510e4bc96c57b287dfca7bf014bd798c9984dbbf6ff7a5759b19eebca1c146e` |
