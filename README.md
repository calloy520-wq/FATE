# FATE — 命運停駐之夜

Google Apps Script 網頁遊戲專案。**2026-09-30 起清空為空殼，新遊戲規劃中。**

- 程式在 `gas/`：目前只有 `Code.gs`（線上顯示「重新製作中」）與 `appsscript.json`。
- 舊版（新聖杯戰爭、鑑賞後日談、英靈工房與全部文件、探針）留在 git 歷史，最後一版是 commit `3dfd6cd`。要拿回任何檔案：`git show 3dfd6cd:路徑` 或 `git checkout 3dfd6cd -- 路徑`。

## 部署
push → GitHub Action 只跑 `clasp push`（不上線）；要讓線上看到新版，手動觸發 workflow_dispatch（`clasp deploy`）。
