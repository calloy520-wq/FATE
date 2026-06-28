#!/bin/bash
# SessionStart hook — 把 FATE 紅線與導引注入每次 session 開頭的 context。
# 這專案是 Google Apps Script（無 package.json、node 已預裝、無 test suite），
# 故本 hook 不裝依賴；唯一工作＝讓失憶的 Claude 一開機就看到紅線與該讀的檔。
set -uo pipefail

cat <<'BRIEF'
🚨 FATE《命運停駐之夜》紅線（違反＝不可逆災難）：
  1. 慾海禁區：gas/Engine_Combat.gs 的 nsfwBaseRules 與 NSFW 機制一律不可改；改鄰近處事後 git diff | grep nsfwBaseRules 須 0 改動。
  2. 九州 GAS 不可動（只能複製過來）。
  3. show-don't-tell：禁直述 願望／個性／萌點 字面。
  4. branch：只在 claude/fate-error-review-w8q42w 開發；push→clasp 自動部署。
  5. model id claude-opus-4-8 不可進 repo（commit/PR/code）。

📌 開工前先讀：FATE/CLAUDE.md（紅線＋流程）、FATE/SOLO_REFERENCE.md（單人代碼地圖，先查再 grep）。
✅ 改完代碼必跑：bash FATE/check.sh（驗證所有 .gs ＋ Script.html 內嵌 JS；CI 不檢查 .html JS）。
BRIEF

# node 健檢（check.sh 需要）：缺了就提醒，但不阻斷 session
if ! command -v node >/dev/null 2>&1; then
  echo "⚠ 找不到 node，check.sh 無法執行——請確認執行環境。"
fi

exit 0
