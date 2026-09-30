# FATE

Google Apps Script 網頁遊戲專案。**2026-09-30 起清空為空殼。**

- 程式在 `gas/`：只有 `Code.gs`（線上顯示「重新製作中」）與 `appsscript.json`。
- 舊版留在 git 歷史：《命運停駐之夜》commit `3dfd6cd`、《東方航路》commit `a409b92`。取回：`git show <commit>:路徑`。

## 部署
push → GitHub Action 只跑 `clasp push`（不上線）；要讓線上看到新版，手動觸發 workflow_dispatch（`clasp deploy`）。
