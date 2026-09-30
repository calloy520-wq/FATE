#!/bin/bash
# SessionStart hook — 開機提醒：現在做的是《東方航路》（打字玩的大航海），紅線與該讀的檔。
set -uo pipefail

cat <<'BRIEF'
⛵ FATE repo 現在是《東方航路》：打字玩的大航海，女副官葉嵐。舊版《命運停駐之夜》在 git 歷史 commit 3dfd6cd，別自己搬回來。
🧱 鐵則：程式記帳，AI 看帳說話（AI 不能直接改數字；副官回話的數字要在資料裡）。
🚨 紅線：
  1. branch：只在 claude/traditional-chinese-chat-q8ptho 開發。push→GitHub Action 只跑 clasp push（不上線）；要上線須另手動觸發 workflow_dispatch 跑 clasp deploy。
  2. 本模型 exact 型號 id（此處刻意不寫出）不可進 repo（commit／PR／code／任何 push 進 repo 的東西）。
📌 開工前先讀：FATE/CLAUDE.md。改完跑 bash FATE/check.sh。
BRIEF

exit 0
