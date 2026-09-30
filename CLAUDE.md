# CLAUDE.md — 開工前必讀（每次 session 自動載入）

《命運停駐之夜》：Google Apps Script 網頁遊戲專案。**2026-09-30 玩家決定整個清空重來**（舊的新聖杯戰爭與鑑賞都不好玩），現在是空殼，新遊戲還在跟玩家一起規劃。

- `gas/` 只有 `Code.gs`（線上顯示「重新製作中」）與 `appsscript.json`。
- 舊版全部留在 git 歷史，最後一版 commit `3dfd6cd`（`git show 3dfd6cd:路徑` 取回）。**別自己把舊東西搬回來**，玩家要的是新東西；要沿用哪一塊先問。

## 🚨 紅線（仍然有效）

1. **branch＋兩段式部署**：只在 `claude/traditional-chinese-chat-q8ptho` 開發。push → GitHub Action 只跑 `clasp push`。要玩家看到新版，須**另外手動觸發 workflow_dispatch**（`clasp deploy`），等 `completed/success`、head_sha 對上，才回報「已上線」。
2. **model id**：本模型的 exact 型號 id 不可出現在 commit／PR／程式碼／任何 push 進 repo 的東西。chat 回覆才可講。
3. **commit footer**：
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_016XEdY9i7dRc5MWBkSMi9YN
   ```
4. **台灣繁體**：repo 裡的字用繁體。

## 🧭 做新遊戲之前

先跟玩家把「想玩什麼、核心玩法是什麼」談清楚再動手。上一版的教訓：一直往「貼近原作」補劇本，玩家自己的選擇反而不重要——原作是舞台，不是劇本。
