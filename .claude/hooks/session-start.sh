#!/bin/bash
# SessionStart hook — 開機提醒：現在做的是《封魔錄》（東方仙俠卡牌冒險），紅線與該讀的檔。
set -uo pipefail

cat <<'BRIEF'
🃏 FATE repo 現在是《封魔錄》：東方仙俠的卡牌冒險（像殺戮尖塔），五位原創女修、戰鬥舞台。按鈕跑系統，AI 之後只當聊天。
   角色設定在 docs/設定書.md。舊版在 git 歷史（《聖杯之路》71c2ef2、《命運停駐之夜》3dfd6cd、《東方航路》a409b92）；別自己搬回來，也別用有版權的角色。
🚨 紅線：
  1. branch：只在 claude/traditional-chinese-chat-q8ptho 開發。push→GitHub Action 只跑 clasp push（不上線）；要上線須另手動觸發 workflow_dispatch 跑 clasp deploy。
  2. 本模型 exact 型號 id（此處刻意不寫出）不可進 repo（commit／PR／code／任何 push 進 repo 的東西）。
📌 開工前先讀：FATE/CLAUDE.md。改完跑 bash FATE/check.sh。
BRIEF

exit 0
