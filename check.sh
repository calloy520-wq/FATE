#!/usr/bin/env bash
# check.sh — 一行驗證所有 .gs 語法 ＋ Script.html 內嵌 JS ＋ Index.html/Style.html 標籤配對。改完代碼必跑。
# 用法：bash check.sh   （從 repo 根目錄）
#       另跑十二支不變式掃描：check_prompt(提示詞)／check_mirror(前後端常數)／check_wiring(接線)／
#       check_render(敘事排版↔XSS)／check_simp(簡體字)／check_memory(solo 敘事記憶)／
#       check_pronoun(寫死的性別代名詞)／check_cards(點名↔角色卡)／check_undef(未宣告識別字)／
#       check_docs(文件↔代碼)／check_wait(等待畫面)／check_ui(前端 runtime)。
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

# 🔍 鑑賞提示詞不變式（代名詞無指涉／寫死台詞，改成機器擋）
if python3 "$ROOT/check_prompt.py"; then :; else fail=1; fi

# 🪞 前後端常數鏡射（前端手抄後端表、後端改了前端沒跟著改——UI 會靜靜說謊）
if node "$ROOT/check_mirror.js"; then :; else fail=1; fi

# 🔌 接線檢查（永遠不會成功的按鈕／查表漏一格／三階套同一句／掃描器自己漏看／死路由）
if python3 "$ROOT/check_wiring.py"; then :; else fail=1; fi

# 🧵 敘事渲染（提示詞叫 AI 用 <br> 分段、前端又整段 escape——兩邊各自都對，湊起來排版就死）
if node "$ROOT/check_render.js"; then :; else fail=1; fi

# 🈶 簡體字（提示詞叫 AI 寫繁體，我們自己卻拿簡體示範給它看——玩家要的是台灣繁體中文）
if python3 "$ROOT/check_simp.py"; then :; else fail=1; fi

# 🧵 solo 敘事記憶（存進歷史的必須是「這回合發生的事」，不是提示詞開頭的角色卡）
if node "$ROOT/check_memory.js"; then :; else fail=1; fi

# ⚧ 提示詞代名詞（全層曾預設「御主是男、同伴是女」，但兩邊都是資料決定的）
if python3 "$ROOT/check_pronoun.py"; then :; else fail=1; fi

# 🎭 點名↔角色卡（performanceNote_ 點名了誰，就必須有誰的卡；沒卡＝叫 AI 憑空捏造性格）
if python3 "$ROOT/check_cards.py"; then :; else fail=1; fi

# 🔎 未宣告識別字（語法檢查看不到「叫一個不存在的東西」；那段若又包在 try/catch 裡就是靜默失敗）
if python3 "$ROOT/check_undef.py"; then :; else fail=1; fi

# 📚 文件↔代碼（函式砍掉/改名、索引沒跟著改——下一個失憶的我照著文件去 grep 會查無此函式）
if python3 "$ROOT/check_docs.py"; then :; else fail=1; fi

# ⏳ 等待畫面（按下去畫面靜止一兩秒、沒有任何訊息——玩家只會以為沒按到，然後再按一次）
if python3 "$ROOT/check_wait.py"; then :; else fail=1; fi

# 🔌 前後端契約（路由兩端對不對得上——既有掃描器全都看不見這一塊）
if python3 "$ROOT/check_contract.py"; then :; else fail=1; fi

# 🧮 技能說明的算式 ↔ 引擎公式（同一條式子存兩處，改了後端沒改說明＝玩家看到假數字）
if python3 "$ROOT/check_fx.py"; then :; else fail=1; fi

# 🔒 節流戳記落地（扣了 AP 卻在蓋戳之前提早 return——走那條路就能無限重按，而且完全靜默）
if python3 "$ROOT/check_throttle.py"; then :; else fail=1; fi

# 🖥️ 前端 runtime 冒煙（語法對 ≠ 跑得動；.html 的 JS 不進 CI，這裡是唯一防線）
if node "$ROOT/check_ui.js"; then :; else fail=1; fi

echo "──────────────"
if [ "$fail" = 0 ]; then echo "✅ 全部通過"; else echo "❌ 有語法錯誤，勿 push"; fi
exit $fail
