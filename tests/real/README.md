# 真實照片測試資料

```
tests/real/
  photos/          ← 放手機拍的照片（JPEG 或 PNG）
  cases.json       ← 每張照片的人工核對答案（參考 cases.example.json）
  params.json      ← （選填）判讀參數，欄位同 App「設定」；不存在則用預設
  report_*.md      ← npm run test:real 產生
  errors_*.jsonl   ← 每筆不一致的明細
```

`cases.json` 每一筆：

| 欄位 | 說明 |
|---|---|
| `image` | photos/ 內的檔名 |
| `numQuestions` | 題數 |
| `expected` | 人工核對的畫記，一題一個字元：`A`–`D`、`-` 空白、`M` 複選、`?` 人工也無法確定（不計） |
| `seat` | 選填，正確座號 |
| `examCode` | 選填，答案卡上印的識別碼 |
| `conditions` | 情境標籤，例如 `["傾斜","陰影","iPhone"]`，報告會分組統計 |
| `expectReject` | 這張本來就該被拒收（刻意拍糊、出框）時設 `true` |
| `device`、`notes` | 拍攝裝置與備註 |

學生照片含姓名與筆跡，屬個人資料：`photos/` 已列入 `.gitignore`，請勿上傳到公開位置。
