# ExamFactory OMR — 離線智慧閱卷系統

用手機拍紙本答案卡，在瀏覽器本機以 OpenCV.js 辨識畫記、自動批改、記錄成績、匯出 CSV。
不需要雲端、不需要付費 API；影像與成績只存在使用者的裝置。

**線上版：https://maxwelivin.github.io/examfactory-omr/**（GitHub Pages，HTTPS；搜尋引擎不收錄）

**目前進度：Phase 1（MVP）完成**。即時相機掃描是 Phase 2，PWA 離線是 Phase 3。詳見 `docs/KNOWN_LIMITATIONS.md`。

## 功能（Phase 1）

- 建立考試（10/20/30/40/50 題、A–D 單選）、快速或逐題輸入標準答案、每題配分、多份考試切換
- 產生 A4 答案卡（四角定位點、座號劃記、考試識別碼條、姓名欄），可列印或另存 PDF，可預印座號
- 拍照或上傳照片（可一次多張，依序批改）
- OpenCV.js 定位 → 透視校正 → 光照正規化 → 逐格取樣 → 判讀（答案／空白／複選／待確認）
- 批改結果：分數、對錯空白待確認、校正後影像疊圖、逐題一鍵修正、修正紀錄
- 同座號、相同畫記的重複掃描提醒；識別碼不符提醒
- 成績列表、逐題答對率、CSV 匯出（Excel 可直接開中文）
- IndexedDB 本機儲存、JSON 備份與還原、可調整判讀閾值、深色／淺色模式

## 技術架構

| 層 | 技術 |
|---|---|
| 介面 | React 18 + TypeScript + Vite，hash 路由，無 UI 套件 |
| 影像辨識 | OpenCV.js 5.0（`@techstark/opencv-js`，WebAssembly 內嵌）於 Web Worker 執行 |
| 儲存 | IndexedDB（`idb`）、設定用 localStorage |
| 答案卡 | 由 `layout.ts` 產生 SVG（mm 單位）→ 瀏覽器列印 |
| 測試 | Vitest（Node 中跑同一個 OpenCV.js 與引擎）、resvg 點陣化合成影像、Playwright（Python）端到端 |

```
omr/
├─ src/
│  ├─ omr/
│  │  ├─ layout.ts      答案卡座標規格（產生與辨識共用的唯一來源）
│  │  ├─ engine.ts      影像處理：定位、透視、正規化、取樣、品質檢查
│  │  ├─ classify.ts    判讀規則（純函式）
│  │  ├─ idcode.ts      考試識別碼 16 位元＋CRC-4
│  │  ├─ worker.ts      Web Worker 入口
│  │  ├─ client.ts      主執行緒呼叫 Worker
│  │  └─ cv.ts          等待 OpenCV.js 初始化
│  ├─ sheet/svg.ts      答案卡 SVG 產生器
│  ├─ grading.ts        計分、指紋（重複偵測）
│  ├─ record.ts         掃描紀錄建立與人工修正
│  ├─ csv.ts  db.ts  image.ts  settings.ts  hooks.ts  types.ts
│  ├─ components/ResultEditor.tsx   批改結果與修正介面
│  └─ pages/            首頁、考試、答案與配分、答案卡、閱卷、成績、單筆紀錄、設定
├─ tests/
│  ├─ unit.test.ts                 單元測試
│  ├─ engine.synthetic.test.ts     合成影像辨識測試
│  ├─ synthetic/                   合成影像產生器
│  ├─ e2e/e2e_smoke.py             瀏覽器端到端測試
│  └─ real/                        真實照片測試（放照片＋人工答案 → 報告與錯誤紀錄）
└─ docs/  ALGORITHM.md  ANSWER_SHEET_SPEC.md  TESTING.md  KNOWN_LIMITATIONS.md
```

## 安裝與啟動

需要 Node.js 20 以上（本機為 `C:\Program Files\nodejs`）。

```powershell
cd C:\ClaudeWorkspace\ExamFactory\omr
npm install
npm run dev          # 開發伺服器，終端機會顯示 Local 與 Network 網址
npm test             # 42 項單元＋合成影像測試
npm run build        # 產生 dist/（靜態網站，可放任何 HTTPS 主機）
npm run preview      # 預覽建置結果
```

### 用手機測試（同一個 Wi-Fi）

1. `npm run dev`，記下 `Network: http://192.168.x.x:5173/`。
2. 手機瀏覽器開這個網址（Windows 防火牆第一次可能詢問，請允許私人網路）。
3. Phase 1 的「拍攝答案卡」使用系統相機（`<input capture>`），HTTP 也能用。
   Phase 2 的即時相機需要 HTTPS，屆時會加上自簽憑證或部署到 GitHub Pages。

## 發布到 GitHub Pages

```powershell
git add -A; git commit -m "說明"; git push        # 原始碼 → main
powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1   # 測試＋建置 → gh-pages（約 1 分鐘後生效）
```

## 實體答案卡測試方法

1. 電腦開 App →「考試」→ 建立 20 題考試 → 輸入答案 → 儲存。
2. 「答案卡」→ 列印（A4、邊界無、100%）數張。
3. 用 2B 鉛筆作答，劃記座號。建議同時做幾張「刁難」的：淡塗、擦掉重塗、複選、空白、打勾。
4. 手機開 App →「閱卷」→「拍攝答案卡」。整張入鏡、四角黑塊可見、光線均勻。
5. 核對畫面：右側校正影像上，綠框＝答對、紅框＝答錯、橘框＝待確認；勾「顯示畫記分數」可看每格數值。
6. 有錯就點逐題按鈕修正，並把照片與正確答案放進 `tests/real/`，跑 `npm run test:real` 留下紀錄（見 `docs/TESTING.md`）。
7. 「成績」→ 匯出 CSV。

注意：在電腦建立的考試只存在電腦的瀏覽器。手機要批改，請在手機上建立同一份考試；
或在電腦「設定 → 備份」，把 JSON 傳到手機後「從備份還原」（識別碼會一致）。

## 隱私

- 照片在瀏覽器內解碼、辨識，不經過任何伺服器。
- 成績與校正後的答案卡縮圖存在 IndexedDB；備份檔由使用者自行保管。
- 沒有統計、追蹤或第三方請求。

## 文件

- `docs/ALGORITHM.md` — 影像處理與判讀原理、數學、門檻來源
- `docs/ANSWER_SHEET_SPEC.md` — 答案卡座標規格與列印注意事項
- `docs/TESTING.md` — 三層測試方法、真實照片人工比對流程、實機檢查表
- `docs/KNOWN_LIMITATIONS.md` — 已知限制、瀏覽器限制與替代方案、下一步
