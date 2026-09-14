# Anime 100001 的圖像引用排查

日期：2026-09-14。排查基準：rsc-manager `90a759b`、xglib `d1480b4`。使用者觀察 `Graphic_66.bin` / `Anime_4.bin` 的動畫 100001 應使用圖像 20065–20070，目前顯示 20066–20071。

後續對照 xgtool 已確認：同圖號的解壓像素一致；20065–20070 完整序列實際出現在最後一段的 **Anime 100000、row 2375、方向 7、動作 3**。xgtool 對 Anime ID 採末筆覆蓋，因此 Anime 100001 使用 **row 2376**，而不是本次最初檢查的 row 1。詳見下方後續驗證。

## 已確認事實

獨立 Python little-endian 讀取與實際 `ResourceSession` → xglib WASM 路徑，均得到相同結果。`AnimeInfo_4.bin` 的零起算 row 1 為 ID 100001、addr 11200、160 個動作；其中 action row 1 為方向 0、動作 1、1000 ms、6 frames。

動作 header 從 `Anime_4.bin` 的 `0x2d0c` 開始，為 standard 12 bytes。六個 frame 的第一個 i32 如下（其後每格 6 bytes 為偏移與旗標）：

| Frame | 絕對 byte offset | 圖像欄位 bytes | 原始值 = WASM 值 = 解決後 Graphic row |
| ----- | ---------------- | -------------- | ------------------------------------- |
| 0     | 0x2d18           | 62 4e 00 00    | 20066                                 |
| 1     | 0x2d22           | 63 4e 00 00    | 20067                                 |
| 2     | 0x2d2c           | 64 4e 00 00    | 20068                                 |
| 3     | 0x2d36           | 65 4e 00 00    | 20069                                 |
| 4     | 0x2d40           | 66 4e 00 00    | 20070                                 |
| 5     | 0x2d4a           | 67 4e 00 00    | 20071                                 |

`GraphicInfo_66.bin` 的 ID 20065–20071 每個都只有一列，且 ID 與零起算 row 相等。ID 20065 的資料地址為 85045541、尺寸 64 × 70；ID 20066 地址為 85047245、尺寸 60 × 72；ID 20071 地址為 85055972、尺寸 48 × 75。這七筆 Info 尺寸均與各自 RD header 相符，WASM strict 圖像解碼成功。沒有輸出或保存原版圖像，只比較尺寸與解碼結果雜湊。

因此此案例不涉及重複 Graphic ID 的首／末列政策，也沒有一開始為零的 row 與從一開始的序號混用。`xglib/src/types/anime.rs::parse_anime_frame` 原樣讀取 i32；`session.ts::resolve` 用索引內 ID 查找 rows；`main.ts::openAction` 將查到的 row 傳給圖像解碼，三處均未 +1。

## 同號動畫記錄

`AnimeInfo_4.bin` 中 ID 100001 不是唯一鍵：

| Anime row（零起算） | 資料地址 | 方向 0／動作 1 的六個原始圖像 ID |
| ------------------- | -------- | -------------------------------- |
| 1                   | 11200    | 20066–20071                      |
| 791                 | 6968086  | 20071–20076                      |
| 1581                | 13925062 | 20071–20076                      |
| 2376                | 20882628 | 20138–20143                      |

其餘本機 AnimeInfo 檔案的 ID 欄位未找到 100001；沒有自動換用其他資源集。上述四筆都不是使用者預期的 20065–20070。

## 第一階段結論與當時未確定部分

已排除本次檢視器／WASM 在此記錄讀取時加一、Graphic ID 重複覆蓋，以及 GraphicInfo 與 RD 尺寸錯配。差異在於這筆來源 frame 引用本身與使用者指定的正確圖像範圍不同。

這不證明來源資料損壞，也不證明目前畫面語意正確。版本配對、原遊戲是否另有 ID 重映射、以及預期範圍所依據工具的編號方式，仍需獨立依據；不能只由這個案例對所有動畫套用 `graphic_id - 1`。本次未變更解析或播放行為，也未修改原始檔案。

## 後續驗證：xgtool 圖像與重複 Anime 序列

同日依使用者補充的視覺觀察及 row 2375 線索，對照 [xgtool a5176db](https://github.com/x-gate/xgtool/tree/a5176dbf107f2f1567951476f652391b76f7f702)。下述是原版檔案實測；「早期資料因何產生」仍未驗證。

### 同圖號確實對應同一張圖

實際執行 xgtool 的 `NewGraphicResource → Graphic.Load → ImgRGBA`，與 rsc-manager 的 `ResourceSession.decode → xglib WASM` 比較。使用未修改的 `pkg/graphic.go`、`pkg/anime.go`、`pkg/palette.go`、`internal/codec.go`，逐一核對 Git blob SHA；研究 harness 與 GPL 授權文件留在 workspace 外的暫存目錄，沒有匯入產品 repository。

- Graphic ID **20065–20143 共 79 張**：解壓後色彩索引的 SHA-256 **79/79 一致**，涵蓋使用者指定的 20065–20070、原先多出的 20071，以及末筆動畫引用的 20138–20143。
- 使用同一 CGP、統一上下翻轉座標後，RGBA SHA-256 **79/79 一致**。不是只比較尺寸，也不是用 xglib 模擬另一套解碼器。
- 原樣 xgtool `ImgRGBA` 的 RGBA 與 viewer **0/79 一致**，原因可完整重現為一列像素的垂直位移：它使用 `y = height - i / width`，viewer 使用 `height - 1 - floor(i / width)`。將 viewer 結果下移一列、裁去底列並補透明頂列後，**79/79** 與原樣 xgtool RGBA 相同。這是同一張圖的輸出座標差異，與 Graphic ID 加一無關。
- `dump-graphic` 以 `GraphicInfo.ID` 命名檔案，如 `20065-0.jpg`；沒有編號減一。比較在 JPEG 壓縮前進行，PNG 亦只編碼至 SHA-256 writer，未保存任何圖片。

依據：[Graphic 索引及圖像輸出](https://github.com/x-gate/xgtool/blob/a5176dbf107f2f1567951476f652391b76f7f702/pkg/graphic.go)、[dump-graphic 檔名](https://github.com/x-gate/xgtool/blob/a5176dbf107f2f1567951476f652391b76f7f702/cmd/dumpgraphic/root.go)。

### row 2375 線索在本機樣本成立，但實際有四段

獨立 little-endian 掃描得到 3186 列、806 個不同 ID。ID 100000 的四次出現為：

| 段落（依檔案順序） | 起始 row | 起始 Anime ID | 起始地址 |
| ------------------ | -------- | ------------- | -------- |
| 1                  | 0        | 100000        | 0        |
| 2                  | 790      | 100000        | 6956886  |
| 3                  | 1580     | 100000        | 13913862 |
| 4                  | 2375     | 100000        | 20871428 |

四段的前 790 筆 ID 次序全部一致；第三段之後另有新增記錄，因此不能以固定 790 的倍數計算最後一段，也不能對任意資源檔硬編碼 2375。所謂「第 2375 號才是第 0 號」對應本檔最後一段的起點；「總共三遍」與本檔的四次出現不完全一致。開發錯誤的歷史原因沒有一手證據。

xgtool 的 [NewAnimeResource](https://github.com/x-gate/xgtool/blob/a5176dbf107f2f1567951476f652391b76f7f702/pkg/anime.go) 逐列執行 `ar[ai.ID] = ...`，因此 **同 Anime ID 採末筆覆蓋**，並非把 Graphic ID 修正一個常數。實跑得到：

- ID 100000：地址 20871428，即 row 2375。
- ID 100001：地址 20882628，即 row 2376；方向 0／動作 1 使用 20138–20143。
- row 2376 的 **160 個動作、全部 frame Graphic ID**，xgtool 與 xglib WASM 逐動作比較完全一致。

### 20065–20070 的確是完整動作，但屬於 100000

獨立掃描全部 3186 筆動畫的動作序列，精確尋找 `[20065, 20066, 20067, 20068, 20069, 20070]`，只有一筆：

| Anime ID | Anime row | 動作 row | 方向 | 動作 |
| -------- | --------- | -------- | ---- | ---- |
| 100000   | 2375      | 147      | 7    | 3    |

此對應另由 xgtool 的實際 Anime loader 及 ResourceSession → WASM 確認。因此使用者觀察到「六張圖片屬於同一動作」是有來源資料支持的；但將它當成 Anime 100001 的方向 0／動作 1，會混淆不同動畫記錄與動作。

本案差異位於 **Anime 記錄的選擇**：viewer 原始列表保留所有 row，選到 #1 會忠實播放早期引用；xgtool 用 ID 查詢時直接取得末筆 #2376。前次只排除 parser 加一，尚不足以解釋這層載入語意。

在現有 viewer 可直接驗證：

1. 選 Graphic_66、Anime_4，在 Anime 分頁搜尋 `#2376`，選方向 0／動作 1：應為 20138–20143，與 xgtool 的 Anime 100001 相同。
2. 搜尋 `#2375`，選動作選單 `#147 · 動作 3 / 方向 7`：應為 20065–20070。

此次維持原始 row 可檢視的行為，沒有改 xglib、map-viewer 或套用 `graphic_id - 1`。若後續提供「依 ID 播放」入口，應採末筆解析並顯示實際 row，同時保留原始索引列表；這是依 xgtool 得出的後續改善方向，不宣稱已實作。尚未以原遊戲執行畫面校準動作姿態與方向名稱。

### 驗證方法與保護

Go harness 以 `os.Open` 唯讀原版檔案，只輸出 metadata 和 SHA-256；Bun 使用真實 WASM 與 ResourceSession，以同樣五個輸入比對。xgtool 核心檔案的 Git blob SHA 分別為：

- `pkg/graphic.go`：`19dcfb3cb05fe1fb0a1e39460626aaccc1c0bbb3`
- `pkg/anime.go`：`8b2729c224ab211bccc8e6651d73313fdc47931e`
- `pkg/palette.go`：`bc42962873e79b8cc6a3c124f746b9ff82b09d5a`
- `internal/codec.go`：`5fb5b4fee4a200522303708c73ba6c2a860df94c`

本次研究命令（暫存 harness，不是產品 CLI；Go 僅使用標準函式庫）：

```sh
# cwd: /private/tmp/xgtool-anime-audit
GOCACHE=/private/tmp/xgtool-anime-audit/cache GOPROXY=off go run . /Users/chivincent/repos/x-gate/CGoriginmood/Assets/bin > result.json
# cwd: rsc-manager
bun .generated/compare-xgtool.ts ../CGoriginmood /private/tmp/xgtool-anime-audit/result.json
```

Go 與 Bun 各自重算執行前後五個輸入指紋，互相比較及與下表一致，`inputsUnchanged=true`。沒有啟動原遊戲、沒有寫入原版目錄、沒有匯出遊戲圖片。

## 唯讀驗證與指紋

所有原版輸入以唯讀方式開啟；Python 直接讀取索引／frame，Bun 實際初始化 WASM 並呼叫 ResourceSession.openAnime、resolve、decode。Bun 使用的五個原版輸入在執行前後重新計算 SHA-256，相同（inputsUnchanged=true）：

| 檔案（相對 Assets/bin） | SHA-256                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| GraphicInfo_66.bin      | fbb97bc1dbda348333603a690bd4af0a0ddb912bc55fed361ba9121bbbcdfd0b |
| Graphic_66.bin          | 318237a7a7208c13761f95e51f9b97010a6fe3124761e3c3e880e4d7209cc0a1 |
| AnimeInfo_4.bin         | 6211d843537e374677210b3de56e7b6f4bb0ff449cf6c61069d894c45d554d0c |
| Anime_4.bin             | b95873a2299f84af723330e6b2ac80f201a42b70190b1b679d94c5abad8dd653 |
| pal/palet_00.cgp        | 28822eb7767a714d4d8045c3ed1916ab05d1c4c0eba25c460f1429b7fb921255 |

未啟動原遊戲或 Unity，未以輸出圖片進行人工姿勢分類。已驗證的是解析、尋址、來源引用，以及後續補充的 xgtool 同圖號像素與末筆動畫查找行為；不宣稱已驗證遊戲內的視覺姿態。
