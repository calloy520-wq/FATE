// 🧵 敘事渲染檢查（check.sh 會跑）
//
// 擋的是一個「兩邊各自都對、湊在一起就壞」的漏洞形狀，2026-07 真的踩過整整四天：
//
//   提示詞說：「換行一律用 <br><br> 分段」（鑑賞 nsfwBaseRules、solo miniSystem 都這樣寫）
//   前端說　：AI 敘事本文要 escapeHtml，免得提示注入吐出 <img onerror=…> 就地執行
//
// 兩句話分開看都沒錯，合在一起就是：分段標籤被 escape 成畫面上看得見的「<br><br>」四個字。
// 補 XSS 的那個 commit 綠燈、部署成功、沒有任何錯誤訊息，玩家玩了四天才回報。
//
// 這種形狀沒辦法用「讀代碼」擋，只能【真的把函式跑起來】對答案。所以這支不看寫法、只看行為：
// 從 Script.html 抓出真的 escapeHtml/aiHtml_，餵幾組輸入，兩個方向同時釘死——
//   ① 排版：AI 寫的 <br> 必須真的換行（壞了＝玩家看到字面標籤）
//   ② 安全：其餘任何標籤都不准活著出去（壞了＝self-XSS）
// 任何一邊被改壞，這裡就紅燈。**修改 aiHtml_ 前先看這支在釘什麼。**
//
// 用法：node check_render.js   ← 有問題回傳非 0

const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = __dirname;
const GAS = path.join(ROOT, 'gas');
const front = fs.readFileSync(path.join(GAS, 'Script.html'), 'utf8');
const problems = [];

// ── 抓出真的那兩支函式（括號配對，不靠縮排）────────────────────
function grabFn(name, src) {
  const m = src.match(new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{'));
  if (!m) return null;
  let d = 0, j = m.index + m[0].length - 1;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}' && --d === 0) break;
  }
  return src.slice(m.index, j + 1);
}

const esc = grabFn('escapeHtml', front);
const ai = grabFn('aiHtml_', front);
let aiHtml_ = null;
if (!esc || !ai) {
  problems.push(`抓不到 ${!esc ? 'escapeHtml' : ''}${!esc && !ai ? ' 與 ' : ''}${!ai ? 'aiHtml_' : ''} 的定義`
    + '（改名了？檢查沒跟上就等於沒檢查——請同步這支的函式名）');
} else {
  const ctx = { String };
  vm.createContext(ctx);
  vm.runInContext(esc + '\n' + ai, ctx);
  aiHtml_ = t => vm.runInContext('aiHtml_(' + JSON.stringify(t) + ')', ctx);
}

// ── ① 行為釘死：排版要活、標籤要死 ────────────────────────────
// [說明, 輸入, 判斷] —— 判斷寫成「輸出必須長怎樣」，不是「代碼必須怎麼寫」。
const CASES = [
  ['AI 寫的 <br><br> 要真的分段', '第一段。<br><br>第二段。', h => h === '第一段。<br><br>第二段。'],
  ['大寫 <BR> 與自閉合 <br /> 同等對待', 'a<BR>b<br />c', h => h === 'a<br><br>b<br><br>c'],
  ['連打的 <br> 只算一次分段', '一。<br><br><br><br>二。', h => h === '一。<br><br>二。'],
  ['標籤混真換行也只算一次', '一。<br>\n\n二。', h => h === '一。<br><br>二。'],
  ['首尾的空段不留白', '<br><br>正文。<br><br>', h => h === '正文。'],
  ['真換行照樣轉成分段', 'a\n\nb', h => h === 'a<br><br>b'],
  ['<img onerror> 必須失效', '嗨<img src=x onerror=alert(1)>', h => !h.includes('<img') && h.includes('&lt;img')],
  ['<script> 必須失效', '<script>bad()</script>', h => !h.toLowerCase().includes('<script')],
  ['帶屬性的假 <br> 不放行', '<br onload=alert(1)>', h => !h.includes('<br onload')],
  ['AI 寫出跳脫過的字面 <br> 不誤放行', '&lt;br&gt;', h => !h.includes('<br>')],
  ['引號要跳脫（免得逃出屬性）', `他說"你好"和'再見'`, h => h.includes('&quot;') && h.includes('&#39;')],
  ['空值不炸', '', h => h === ''],
];
if (aiHtml_) {
  for (const [label, input, ok] of CASES) {
    let out;
    try { out = aiHtml_(input); }
    catch (e) { problems.push(`① aiHtml_ 對「${label}」直接炸了：${e.message}`); continue; }
    if (!ok(out)) problems.push(`① ${label}｜輸入 ${JSON.stringify(input)} → 得到 ${JSON.stringify(out)}`);
  }
}

// ── ② 沒有人繞過 aiHtml_ ──────────────────────────────────
// 【說書人】這個標籤只掛在 AI 敘事氣泡上（系統通知走別的樣式），所以它是精準的錨點：
//   凡是印【說書人】的那一行，本文就必須經過 aiHtml_，不准自己手刻一套 escape＋換行。
for (const f of fs.readdirSync(GAS).filter(n => /^Script.*\.html$/.test(n))) {
  const src = fs.readFileSync(path.join(GAS, f), 'utf8');
  src.split('\n').forEach((line, i) => {
    if (line.includes('【說書人】') && !line.includes('aiHtml_')) {
      problems.push(`② ${f}:${i + 1} 印【說書人】卻沒走 aiHtml_——手刻的 escape 換行遲早跟提示詞脫節，`
        + `這正是 2026-07 那次四天沒人發現的形狀`);
    }
  });
}

// ── ③ 提示詞與渲染器的約定沒有單方面毀約 ──────────────────────
// 後端提示詞若還在叫 AI 用 <br> 分段，前端就必須放行 <br>；哪天提示詞改成別的分段方式，
// 這條會提醒你回來把放行清單一起收掉（留著一個沒人用的 HTML 放行口是白白多一個風險）。
const backAll = fs.readdirSync(GAS).filter(n => n.endsWith('.gs'))
  .map(n => fs.readFileSync(path.join(GAS, n), 'utf8')).join('\n');
const promptWantsBr = /<br><br>\s*分段|換行一律用\s*<br>/.test(backAll);
const rendererAllowsBr = aiHtml_ ? aiHtml_('a<br>b').includes('<br>') : false;
if (promptWantsBr && !rendererAllowsBr) {
  problems.push('③ 後端提示詞還在叫 AI 用 <br><br> 分段，前端卻不放行 <br>——玩家會看到字面標籤');
} else if (!promptWantsBr && rendererAllowsBr) {
  problems.push('③ 提示詞已經不叫 AI 用 <br> 分段了，前端卻還放行這個標籤——請把放行清單一起收掉');
}

console.log(`🧵 敘事渲染：行為釘 ${CASES.length} 條、【說書人】渲染點 `
  + `${fs.readdirSync(GAS).filter(n => /^Script.*\.html$/.test(n))
    .reduce((a, n) => a + (fs.readFileSync(path.join(GAS, n), 'utf8').match(/【說書人】/g) || []).length, 0)} 處、`
  + `提示詞↔渲染器約定 ${promptWantsBr ? '<br> 分段' : '（提示詞未要求 <br>）'}`);
if (problems.length) {
  console.log(`  ❌ ${problems.length} 處`);
  problems.forEach(p => console.log('     ' + p));
} else {
  console.log('  ✅ 全部通過');
}
process.exit(problems.length ? 1 : 0);
