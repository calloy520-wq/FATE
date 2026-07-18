# FATE — 命運停駐之夜

把九州武俠 GAS 遊戲改造成 **Fate/stay night 聖杯戰爭**（純按鍵單人）的 Google Apps Script 專案。

**雙軌**：🎴 純淨 solo（單人聖杯戰爭，SFW，按鍵＋AI 敘述）／🌹 慾海 kanshou（鑑賞約會後日談，NSFW；不需先打贏，主選單直接進、英靈殿召喚同伴）。
**核心鐵則**：GAS 掌所有數值、AI 只說書。

## 文件
- **`CLAUDE.md`** — 開工前必讀（核心訴求／紅線／流程）。
- **`DESIGN.md`** — 設計鐵則（系統意圖）。
- **`SOLO_REFERENCE.md`** — 單人完整代碼地圖（函數／schema／ActionRouter／MEMORY 標記）。

## 部署
程式在 `gas/`。commit → push → GitHub Action（clasp）自動部署。改完務必跑 `bash check.sh` 驗證。
