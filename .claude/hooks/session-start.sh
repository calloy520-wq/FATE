#!/bin/bash
# SessionStart hook — 把 FATE 紅線與導引注入每次 session 開頭的 context。
# 這專案是 Google Apps Script（無 package.json、node 已預裝、無 test suite），
# 故本 hook 不裝依賴；唯一工作＝讓失憶的 Claude 一開機就看到紅線與該讀的檔。
set -uo pipefail

cat <<'BRIEF'
🚨 FATE《命運停駐之夜》紅線（違反＝不可逆災難）：
  1. 慾海禁區：gas/Gallery.gs 的 nsfwBaseRules 與整套 NSFW 機制一律不可改；改鄰近處事後 git diff -- gas/Gallery.gs | grep nsfwBaseRules 須逐行核對常數本體 0 改動。
  2. 原始九州 GAS repo（/home/user/GAS）不可動，只能複製；FATE 內部九州衍生碼可放手清理改造。
  3. show-don't-tell：敘事禁直述 願望／個性／萌點 字面。
  4. branch：只在 claude/traditional-chinese-chat-q8ptho 開發。push→GitHub Action 只跑 clasp push（不上線）；要玩家看到新版須另手動觸發 workflow_dispatch 跑 clasp deploy。
  5. 本模型 exact 型號 id（此處刻意不寫出）不可進 repo（commit／PR／code／任何 push 進 repo 的東西）。

📌 開工前先讀：FATE/CLAUDE.md（紅線＋流程）、FATE/PLAYBOOK.md（工作手冊）、FATE/SOLO_REFERENCE.md（solo 代碼地圖）、FATE/KANSHOU_REFERENCE.md（鑑賞現況）。
✅ 改完代碼必跑：bash FATE/check.sh（驗所有 .gs ＋ Script*.html 內嵌 JS；CI 不檢查 .html JS）。
BRIEF

# node 健檢（check.sh 需要）：缺了就提醒，但不阻斷 session
if ! command -v node >/dev/null 2>&1; then
  echo "⚠ 找不到 node，check.sh 無法執行——請確認執行環境。"
fi

exit 0
