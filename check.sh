#!/bin/bash
# 改完必跑：引擎＋回合流程測試、網頁內嵌 JS 語法、repo 裡沒有簡體字。
set -o pipefail
cd "$(dirname "$0")"
fail=0
echo "── 引擎與回合流程"; node tools/sea_test.js | tail -1 || fail=1
echo "── 網頁 JS 語法"
for f in gas/*.html; do
  node -e "const s=require('fs').readFileSync('$f','utf8'); const js=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n'); new Function(js);" && echo "  ✅ $f" || { echo "  ❌ $f"; fail=1; }
done
echo "── 簡體字"
node -e "
const fs=require('fs'); const vm=require('vm'); const c={}; vm.createContext(c); vm.runInContext(fs.readFileSync('gas/Ai.gs','utf8'),c);
const simp=new Set(c.TRAD_MAP_SIMP_); let bad=[];
for (const f of ['gas/Sea_Data.gs','gas/Sea_Engine.gs','gas/Sea_Router.gs','gas/Index.html','gas/Code.gs','README.md','CLAUDE.md']) { const s=fs.readFileSync(f,'utf8'); [...s].forEach((ch,i)=>{ if(simp.has(ch)) bad.push(f+':'+ch); }); }
if (bad.length) { console.log('  ❌ '+bad.slice(0,10).join(' ')); process.exit(1); } console.log('  ✅ 沒有簡體字');" || fail=1
echo "──────────────"
[ $fail = 0 ] && echo "✅ 全部通過" || { echo "❌ 有沒過的"; exit 1; }
