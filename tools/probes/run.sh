#!/usr/bin/env bash
# 🧪 一次跑完所有有斷言的探針，只印摘要（改完代碼、上線前跑）。用法：bash tools/probes/run.sh
#    探針只讀 repo（假試算表在記憶體裡），要試改動請複製一份 gas/ 再用 GAS_DIR 指過去。
cd "$(dirname "$0")"
pass=0; fail=0; failed=""
for f in $(ls *.js | grep -v '^probe.js$\|^sheet.js$'); do
  out=$(timeout 300 node "$f" 2>&1); code=$?
  n_ok=$(printf '%s' "$out" | grep -c '✅'); n_bad=$(printf '%s' "$out" | grep -c '❌')
  if [ $code -ne 0 ] || [ "$n_bad" -gt 0 ]; then
    fail=$((fail+1)); failed="$failed $f"
    printf '  ❌ %-16s exit=%s ✅%s ❌%s\n' "$f" "$code" "$n_ok" "$n_bad"
    printf '%s\n' "$out" | grep -E '❌' | head -3 | sed 's/^/       /'
  else
    pass=$((pass+1)); printf '  ✅ %-16s %s 條\n' "$f" "$n_ok"
  fi
done
echo "──────────────"
if [ $fail -eq 0 ]; then echo "✅ $pass 支探針全過"; else echo "❌ $fail 支有問題：$failed（通過 $pass 支）"; fi
exit $fail
