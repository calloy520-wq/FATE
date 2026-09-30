# 東方航路

打字玩的大航海：1560 年前後的東亞海域，從泉州出發，跟副官葉嵐說你想做什麼——買貨、出航、修船、換船、問帳——遊戲就真的照做。
Google Apps Script 網頁遊戲；程式記帳，AI 看帳說話。細節見 `CLAUDE.md`。

- 程式在 `gas/`；測試 `bash check.sh`。
- 舊版《命運停駐之夜》留在 git 歷史 commit `3dfd6cd`。

## 部署
push → GitHub Action 只跑 `clasp push`（不上線）；要讓線上看到新版，手動觸發 workflow_dispatch（`clasp deploy`）。
