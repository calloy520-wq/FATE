#!/usr/bin/env bash
# check.sh — 一行驗證所有 .gs 語法 ＋ Script.html 內嵌 JS。改完代碼必跑。
# 用法：bash check.sh   （從 repo 根目錄）
# 原因：.gs 不是 node 認的副檔名，需複製成 .js 才能 node --check；
#       Script.html 是單一 <script> 包裹，去頭尾才是純 JS。CI 不檢查 .html JS，故本地必驗。
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
GAS="$ROOT/gas"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail=0

for f in "$GAS"/*.gs; do
  [ -e "$f" ] || continue
  base="$(basename "$f" .gs)"
  cp "$f" "$TMP/$base.js"
  if node --check "$TMP/$base.js" 2>"$TMP/err"; then
    echo "OK   $(basename "$f")"
  else
    echo "FAIL $(basename "$f")"; cat "$TMP/err"; fail=1
  fi
done

# Script.html：去掉首行 <script> 與末行 </script>，驗證內嵌 JS
if [ -f "$GAS/Script.html" ]; then
  sed '1d;$d' "$GAS/Script.html" > "$TMP/script_body.js"
  if node --check "$TMP/script_body.js" 2>"$TMP/err"; then
    echo "OK   Script.html (內嵌 JS)"
  else
    echo "FAIL Script.html (內嵌 JS)"; cat "$TMP/err"; fail=1
  fi
fi

echo "──────────────"
if [ "$fail" = 0 ]; then echo "✅ 全部通過"; else echo "❌ 有語法錯誤，勿 push"; fi
exit $fail
