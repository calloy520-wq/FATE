#!/usr/bin/env bash
# check.sh — 一行驗證所有 .gs 語法 ＋ Script.html 內嵌 JS ＋ Index.html/Style.html 標籤配對。改完代碼必跑。
# 用法：bash check.sh   （從 repo 根目錄）
# 原因：.gs 不是 node 認的副檔名，需複製成 .js 才能 node --check；
#       Script.html 是單一 <script> 包裹，去頭尾才是純 JS。CI 不檢查 .html JS，故本地必驗。
#       Index.html/Style.html 沒有單一 <script> 殼可以剝、驗不了JS，但漏刪一個開頭 <div> 沒同步刪
#       對應收尾 </div> 這種標籤配對錯誤，會讓整頁 UI 崩壞卻照樣綠燈部署——靠 check_html.py 逐標籤配對攔下。
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

# Script*.html（Script.html 主檔 ＋ Script_XXX.html 拆檔）：各自去掉首行 <script> 與末行 </script>，驗證內嵌 JS。
#   ★新增 Script_XXX.html 拆檔時不用改這裡——萬用比對自動吃到，別再把驗證寫死成單一檔名。
for f in "$GAS"/Script*.html; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"
  sed '1d;$d' "$f" > "$TMP/${base}.js"
  if node --check "$TMP/${base}.js" 2>"$TMP/err"; then
    echo "OK   $base (內嵌 JS)"
  else
    echo "FAIL $base (內嵌 JS)"; cat "$TMP/err"; fail=1
  fi
done

# Index.html/Style.html（非 Script*.html，沒有單一 <script> 殼可剝）：驗證 HTML 標籤配對是否平衡。
for f in "$GAS"/*.html; do
  [ -e "$f" ] || continue
  case "$(basename "$f")" in Script*) continue;; esac
  if python3 "$ROOT/check_html.py" "$f"; then :; else fail=1; fi
done

# 🔍 鑑賞提示詞不變式（本 session 所有 bug 都是這三種的變體，改成機器擋）
if python3 "$ROOT/check_prompt.py"; then :; else fail=1; fi

echo "──────────────"
if [ "$fail" = 0 ]; then echo "✅ 全部通過"; else echo "❌ 有語法錯誤，勿 push"; fi
exit $fail
