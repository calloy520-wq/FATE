#!/usr/bin/env node
/**
 * 🖥️ 前端 runtime 冒煙測試 — CI 只檢查 .gs，check.sh 的語法檢查也只看得到「這段 JS 合不合法」，
 * 但「函式叫得到嗎、面板畫得出來嗎」要真的跑起來才知道。
 *
 * 這個專案被這個形狀燒過：綠燈、部署成功、零錯誤訊息，壞在玩家點下去的那一刻
 * （2026-07 敘事排版壞了四天沒人發現）。語法對 ≠ 跑得動。
 *
 * 做法：把三個 Script*.html 的 JS 串進同一個 VM（等同瀏覽器的共享作用域），配最小 DOM 假件，
 * 然後真的把主要面板叫起來，看它們會不會拋例外。
 * ⚠ 刻意只驗「叫得到、不拋例外」，不驗畫面細節——細節斷言會讓這支變得脆弱又愛叫。
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const GAS = path.join(__dirname, 'gas');
const FILES = ['Script.html', 'Script_Onboarding.html', 'Script_Kanshou.html'];
const strip = f => fs.readFileSync(path.join(GAS, f), 'utf8')
  .replace(/^\s*<script>\s*\n/, '').replace(/\n\s*<\/script>\s*$/, '');

// 這些是玩家點得到的入口：少一個就是死按鈕
const ENTRIES = [
  'send', 'openCompanions', 'openKanshouAlbum', 'openKanshouWorld', 'openKanshouStyle', 'openKanshouTime',
  'kanshouSetPace', 'kanshouSetDateTime', 'kanshouAddRegion', 'kanshouDelRegion',
  'kanshouPlaceMenu', 'kanshouGoNewPlace', 'kanshouNextStage', 'kanshouEndDay',
  'kcMapListHtml_', 'kcChoose_', 'withProcessing_', 'bgHint_', 'aiHtml_', 'showProcessing',
  'sumMode_', 'setWarFromSelect_', 'newGameFlow', 'openTutorial'
];
// 這些面板會被真的叫起來一次（不能拋例外）
const RENDERS = [
  ['kcMapListHtml_', () => ctx.kcMapListHtml_()],
  ['openKanshouTime', () => ctx.openKanshouTime()],
  ['kcChoose_', () => ctx.kcChoose_('t', [{ k: 'a', label: 'a' }])],
  ['aiHtml_', () => ctx.aiHtml_('一句<br>兩句')],
  // 🚪 召喚三選一的門（2026-09 新增）：三種模式都切一遍。random 會真的打後端，這裡不碰。
  ['sumMode_(pick)', () => { ctx.sumMode_('pick'); return disp('sum-gate') === 'none' && disp('sum-pick') === 'block' && disp('sum-create') === 'none'; }],
  ['sumMode_(create)', () => { ctx.sumMode_('create'); return disp('sum-gate') === 'none' && disp('sum-pick') === 'none' && disp('sum-create') === 'block'; }],
  ['sumMode_(回門口)', () => { ctx.sumMode_(''); return disp('sum-gate') === 'block' && disp('sum-pick') === 'none' && disp('sum-create') === 'none'; }],
  ['setWarFromSelect_', () => ctx.setWarFromSelect_()],
  // ❓ solo 的教學卡：真的畫出來，並確認「御主不上戰場」那段在（2026-09 戰鬥改版後補的，
  //   教學要跟規則對得上，不然玩家會以為自己也要挨打）。
  ['openTutorial', () => { let html = ''; const old = ctx.showHistoryOverlay; ctx.showHistoryOverlay = h => { html = String(h); };
    try { ctx.openTutorial(); } finally { ctx.showHistoryOverlay = old; }
    // ⚠ 不可以寫成「打起來不會掉血」——魔力見底時解放寶具仍會燒御主的血當電池（drainForNp_）。
    //   教學要同時講「刀砍不到你」與「供魔會燒血」，兩句都釘。
    return html.length > 300 && /御主不上戰場/.test(html) && /砍不到你/.test(html) && /燒你的命/.test(html); }]
];

function makeCtx(extraSrc) {
  const nodes = {};
  function mk(tag) {
    const el = {
      tagName: tag, id: '', style: { cssText: '' }, _kids: [], textContent: '', dataset: {}, disabled: false,
      appendChild(c) { this._kids.push(c); if (c.id) nodes[c.id] = c; return c; },
      querySelector: () => null, querySelectorAll: () => [], closest: () => null,
      addEventListener() { }, removeChild() { }, getAttribute: () => null, setAttribute() { }
    };
    let h = '';
    Object.defineProperty(el, 'innerHTML', {
      get: () => h,
      set(v) { h = String(v); let m, re = /id="([^"]+)"/g; while ((m = re.exec(h)) !== null) if (!nodes[m[1]]) { const c = mk('div'); c.id = m[1]; nodes[m[1]] = c; } }
    });
    return el;
  }
  const doc = {
    body: mk('body'), head: mk('head'), createElement: mk, getElementById: id => nodes[id] || null,
    addEventListener() { }, querySelector: () => null, querySelectorAll: () => []
  };
  doc.body.appendChild = c => { if (c.id) nodes[c.id] = c; return c; };
  doc.head.appendChild = c => c;
  // ⚠ pc 走 localStorage 餵：Script.html 頂層是 `let pc = JSON.parse(localStorage.getItem(...))`，
  //   頂層 let 的綁定事後蓋不掉，直接指派 ctx.pc 是沒有用的（這個坑踩過）。
  const PC = { id: 'KPC_1', name: '風音', mode: 'kanshou', homeName: '風音的家', account: '風音' };
  const ctx = {
    document: doc, console: { log() { }, error() { }, warn() { } }, setTimeout, clearTimeout,
    JSON, Math, Date, Promise, Error, String, Number, Boolean, Array, Object, RegExp,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    localStorage: { getItem: k => (k === 'kyushu_v27' ? JSON.stringify(PC) : null), setItem() { }, removeItem() { } },
    alert() { }, confirm: () => true, prompt: () => null,
    google: { script: { run: { withSuccessHandler() { return this; }, withFailureHandler() { return this; } } } }
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(strip(f), ctx, { filename: f });
  if (extraSrc) vm.runInContext(extraSrc, ctx, { filename: 'inject' });
  ctx.gasRun = async () => ({ success: true, regions: [], rows: [] });
  // 🚪 召喚三選一的門：三個 div 先造出來，sumMode_ 的顯示切換才驗得到（元素不存在時它會靜靜什麼都不做）。
  ['sum-gate', 'sum-pick', 'sum-create', 'war-note'].forEach(id => { const el = doc.createElement('div'); el.id = id; doc.body.appendChild(el); });
  ctx.kcClock = { band: '午後', hour: 14, label: '2005/12/20 14:00 午後', year: 2005, month: 12, day: 20 };
  ctx.window._lastTags = {
    pace: 10, myRegions: [{ id: 'rg_1', name: '泰國', desc: '熱' }],
    myPlaces: [{ name: '海灘', desc: '', region: 'rg_1', own: '小吃' }],
    locationCounts: {}, unlockedResidences: []
  };
  return ctx;
}

let ctx, bad = [];
try { ctx = makeCtx(); } catch (e) {
  console.log('🖥️ 前端 runtime：❌ 載入就炸 — ' + e.message);
  process.exit(1);
}
ENTRIES.forEach(n => { if (typeof ctx[n] !== 'function') bad.push('叫不到 ' + n + '()'); });
const disp = id => { const el = ctx.document.getElementById(id); return el && el.style ? el.style.display : '(查無此元素)'; };
// 回 false 的當成「跑得動但結果不對」——顯示切換這種事沒有例外可抓，只能看結果。
RENDERS.forEach(([n, fn]) => { try { if (fn() === false) bad.push(n + ' 跑得動，但畫面狀態不對'); } catch (e) { bad.push(n + '() 拋例外：' + e.message); } });

// 🧪 自我退化測試：注入一個會把面板打爆的覆寫，這支必須叫。
//    不會叫的掃描器比沒有更糟——它給你「已經有防線」的錯覺。
let probeFired = false;
try {
  const c2 = makeCtx('function kcMapListHtml_(){ throw new Error("degraded"); }');
  try { c2.kcMapListHtml_(); } catch (e) { probeFired = /degraded/.test(e.message); }
} catch (e) { probeFired = true; }
if (!probeFired) {
  console.log('🖥️ 前端 runtime：❌ 掃描器自身失效（注入的爆炸抓不到）');
  process.exit(1);
}

// 🔰 新手引導點名的每一顆按鈕都必須真的存在（鑑賞沒有 ❓教學 入口，第一次進來那段就是唯一的說明）。
//    寫一顆不存在的鈕比不寫更誤導人——這條規則本來只寫在註解裡，改成機器擋。
//    ⚠ 比對的是【圖示】不是整串字：圖示是穩定的識別碼，後面那幾個字常常會為了語氣微調
//    （「📚 相簿收著你拍的照片」vs 按鈕上的「📚 相簿」）。第一版比整串字，四條全誤報。
const TUT_NOT_A_BUTTON = new Set(['✍️', '🔰']);   // 純粹的段落圖示，不是控制項
const tutorial = (() => {
  const src = fs.readFileSync(path.join(GAS, 'Script_Kanshou.html'), 'utf8');
  const i = src.indexOf('<b>【日常】</b>');
  if (i < 0) return { block: '', icons: [] };
  const j = src.indexOf('日子還長', i);
  const block = src.slice(i, j < 0 ? i + 4000 : j);
  const icons = [...new Set((block.match(/[\u{1F300}-\u{1FAFF}\u2699\u26A0\u270D\u2795\uFF0B][\uFE0F]?/gu) || [])
    .map(x => x.replace(/\uFE0F/g, '')))].filter(x => !TUT_NOT_A_BUTTON.has(x) && !TUT_NOT_A_BUTTON.has(x + '\uFE0F'));
  return { block, icons };
})();
const uiText = FILES.concat(['Index.html'])
  .map(f => fs.readFileSync(path.join(GAS, f), 'utf8')).join('\n')
  .split(tutorial.block).join('');            // 把教學那段本身挖掉，免得自己證明自己
// 控制項＝出現在 onclick 那一段裡，或抽屜的 <i>圖示</i>
const controls = (uiText.match(/onclick=[^>]*>[^<]*|<i>[^<]*<\/i>|title="[^"]*"/g) || []).join('\n');
const ghostBtn = tutorial.icons.filter(ic => controls.indexOf(ic) < 0);
if (!tutorial.icons.length) bad.push('新手引導：一顆按鈕都沒抓到（那段是不是被改掉了？）');
ghostBtn.forEach(v => bad.push('新手引導點名了介面上找不到的控制項圖示：「' + v + '」'));

console.log('🖥️ 前端 runtime：%d 個入口、%d 個面板真的跑起來、新手引導點名 %d 顆鈕（含自我退化測試）'
  .replace('%d', ENTRIES.length).replace('%d', RENDERS.length).replace('%d', tutorial.icons.length));
if (bad.length) {
  console.log('  ❌ ' + bad.length + ' 處壞在 runtime（語法檢查看不到這種）：');
  bad.forEach(b => console.log('     ' + b));
  console.log('  → .html 的 JS 不進 CI，這裡是唯一防線；別靠「語法過了」當作能跑。');
  process.exit(1);
}
console.log('  ✅ 入口都在、面板都畫得出來');
