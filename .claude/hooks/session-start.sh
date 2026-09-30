#!/bin/bash
# SessionStart hook — 開機提醒：專案已清空成空殼（2026-09-30），紅線與取回舊版的方法。
set -uo pipefail

cat <<'BRIEF'
📦 FATE《命運停駐之夜》目前是空殼（2026-09-30 玩家決定全部清空、重新想一個新遊戲）。
   舊版留在 git 歷史 commit 3dfd6cd；別自己搬回來，要沿用哪一塊先問玩家。
🚨 紅線：
  1. branch：只在 claude/traditional-chinese-chat-q8ptho 開發。push→GitHub Action 只跑 clasp push（不上線）；要上線須另手動觸發 workflow_dispatch 跑 clasp deploy。
  2. 本模型 exact 型號 id（此處刻意不寫出）不可進 repo（commit／PR／code／任何 push 進 repo 的東西）。
📌 開工前先讀：FATE/CLAUDE.md。
BRIEF

exit 0
