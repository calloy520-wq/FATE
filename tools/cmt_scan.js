// 找「行尾註解把後面的程式吃掉」：一行裡 // 後面還接著 if (…)、return …;、a.b = … 這類程式。
// 用法：node tools/cmt_scan.js gas/*.html（有可疑的就列出來、結束碼 1）
const fs = require('fs');
let acorn; for (const p of ['acorn', '/opt/node22/lib/node_modules/eslint/node_modules/acorn']) { try { acorn = require(p); break; } catch (e) { } }
if (!acorn) { console.log('  （沒有 acorn，略過）'); process.exit(0); }
const CODE = /(\bif \(|\breturn\b[^。，、]*;|\bvar \w+ =|\w+\.\w+ = |\}\s*\)?;\s*$|function \w*\s*\()/;
let bad = 0;
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, 'utf8'), re = /<script>([\s\S]*?)<\/script>/g; let m;
  while ((m = re.exec(src))) {
    const off = src.slice(0, m.index + 8).split('\n').length - 1, cs = [];
    try { acorn.parse(m[1].replace(/<\?!=[\s\S]*?\?>/g, ''), { ecmaVersion: 2020, locations: true, onComment: (block, text, s, e, loc) => { if (!block) cs.push([text, loc]); } }); }
    catch (e) { continue; }   // 語法錯由 check.sh 的語法檢查抓
    cs.forEach(([t, loc]) => { if (CODE.test(t)) { bad++; console.log('  ❌ ' + f + ':' + (off + loc.line) + '  //' + t.slice(0, 100)); } });
  }
}
if (bad) process.exit(1); console.log('  ✅ 沒有被註解吃掉的程式');
