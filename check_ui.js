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
// 2026-09：原本寫死三個檔名，新拆出 Script_War.html 時整支看不到它。改成自動抓，Script.html 排第一（其他檔用它的共用工具）。
const FILES = fs.readdirSync(GAS).filter(f => /^Script.*\.html$/.test(f)).sort((a, b) => (a === 'Script.html' ? -1 : b === 'Script.html' ? 1 : a.localeCompare(b)));
const strip = f => fs.readFileSync(path.join(GAS, f), 'utf8')
  .replace(/^\s*<script>\s*\n/, '').replace(/\n\s*<\/script>\s*$/, '');

// 假 DOM 只造得出被 innerHTML 寫出來的 id；住在 Index.html 的容器要先補上。
function mkEl(id) { if (!ctx.document.getElementById(id)) { const e = ctx.document.createElement('div'); e.id = id; ctx.document.body.appendChild(e); } return ctx.document.getElementById(id); }

// 這些是玩家點得到的入口：少一個就是死按鈕
const ENTRIES = [
  'send', 'openCompanions', 'openWorldPanel', 'openKanshouStyle',
  'kanshouNextStage', 'kanshouEndDay',
  'kmSpinner_', 'withProcessing_', 'bgHint_', 'aiHtml_', 'showProcessing',
  'sumMode_', 'setWarFromSelect_', 'pickWar', 'pickOrigin', 'newGameFlow', 'openTutorial',
  'ksRender_', 'ksTier_', 'ksPick_', 'ksSave_', 'ksReset_', 'ksResetAll_',
  'warOpen', 'warStart', 'warDo', 'warToggleSeal', 'warQuit', 'warBackMenu', 'warRenderForm_', 'warRender_'
];
// 這些面板會被真的叫起來一次（不能拋例外）
const RENDERS = [
  ['kmSpinner_', () => typeof ctx.kmSpinner_('t') === 'string'],
  ['aiHtml_', () => ctx.aiHtml_('一句<br>兩句')],
  // 🚪 召喚三選一的門（2026-09 新增）：三種模式都切一遍。random 會真的打後端，這裡不碰。
  ['sumMode_(pick)', () => { ctx.sumMode_('pick'); return disp('sum-gate') === 'none' && disp('sum-pick') === 'block' && disp('sum-create') === 'none'; }],
  ['sumMode_(create)', () => { ctx.sumMode_('create'); return disp('sum-gate') === 'none' && disp('sum-pick') === 'none' && disp('sum-create') === 'block'; }],
  ['sumMode_(回門口)', () => { ctx.sumMode_(''); return disp('sum-gate') === 'block' && disp('sum-pick') === 'none' && disp('sum-create') === 'none'; }],
  ['setWarFromSelect_', () => ctx.setWarFromSelect_()],
  // 📱 拍完當下畫在對話裡的那張卡：後端 kanshouPhotoObj_ 給的形狀，前端 kcAlbumCardHtml_ 要畫得出來
  // ❓ solo 的教學卡：真的畫出來，並確認「御主不上戰場」那段在（2026-09 戰鬥改版後補的，
  //   教學要跟規則對得上，不然玩家會以為自己也要挨打）。
  // 🎨 ⚙ 說書人設定的三態（預設／自訂／關閉）：畫得出來，而且【預設句本體不可以出現在畫面上】。
  //   那串字是提示詞，玩家看到就出戲——這裡餵一個帶 def 的模組物件當誘餌，
  //   哪天有人把 placeholder=m.def 之類的寫法加回來，這條會當場叫。
  // ⚔️ 創角頁三顆常駐戰爭鈕：叫得起來、值真的寫進 hidden #s-war（拉出下拉選單那次改的，2026-09）
  ['pickWar 三顆戰爭鈕', () => {
    const h = ctx.document.createElement('input'); h.id = 's-war'; h.value = '5th'; ctx.document.body.appendChild(h);
    ctx.pickWar('chaos');
    const got = (ctx.document.getElementById('s-war') || {}).value;
    if (got !== 'chaos') throw new Error('選了混亂，#s-war 卻是 ' + got);
    ctx.pickWar('5th');
  }],
  // 🎨 ⚙ 說書人設定：只剩【尺度】(三態)與【篇幅】(檔位)兩格。
  //   ⚠ 這條同時釘兩件事：①預設句本體不可以漏到畫面上（那是提示詞，玩家看到就出戲）；
  //   ②篇幅那排鈕要真的呼叫檔位那支——ksPick_ 曾經被宣告兩次，後者把前者整個蓋掉，
  //   於是按檔位變成送「關閉」，畫面照常、零錯誤訊息。所以這裡比對的是【送出去的 payload】。
  ['ksRender_ 尺度三態＋篇幅檔位', () => {
    const body = ctx.document.createElement('div'); body.id = 'kc-style-body'; ctx.document.body.appendChild(body);
    ctx._ksMods_ = [
      { key: 'lewd', name: '尺度', slot: 'sys', hint: '情慾場面寫多開。', def: '【誘餌】這是提示詞本體，不可外洩。', text: '', on: true, custom: false },
      { key: 'lenTier', name: '篇幅', slot: 'none', kind: 'pick', hint: '一回合寫多長。', def: 'auto', text: 'auto', on: true, custom: false,
        options: [{ key: 'auto', label: '自動' }, { key: '500', label: '500 字' }] }
    ];
    ctx._ksEdit_ = {};
    ctx.ksRender_();
    const h = String(body.innerHTML);
    if (/誘餌/.test(h)) return false;                                   // 預設句漏到畫面上
    if (!/情慾場面寫多開/.test(h) || !/一回合寫多長/.test(h)) return false; // 兩格都在
    if (!/500 字/.test(h)) return false;                                // 檔位鈕畫得出來
    if ((h.match(/<textarea/g) || []).length !== 0) return false;
    ctx.ksPick_('lewd', 'own'); const h2 = String(body.innerHTML);      // 按「自訂」＝本地打開輸入框
    if ((h2.match(/<textarea/g) || []).length !== 1 || /誘餌/.test(h2)) return false;
    // 📏 檔位：攔下 gasRun 看真的送了什麼
    let sent = null; const old = ctx.gasRun; ctx.gasRun = p => { sent = p; return Promise.resolve({ success: true }); };
    try { ctx.ksTier_('lenTier', '500'); } finally { ctx.gasRun = old; }
    return !!sent && sent.key === 'lenTier' && sent.styleText === '500' && sent.on !== false;
  }],
  // ⚔️ 新聖杯戰爭：開局表單、戰鬥畫面、令咒切換都真的畫一次。按鈕全照後端 buttons 畫，
  //   這裡釘的是「令咒一開，說明換成令咒版、充能中的寶具變得按得下去」——那是前端唯一自己決定的事。
  ['warRenderForm_', () => { mkEl('scr-war'); ctx.warRenderForm_(); return /召喚從者/.test(ctx.document.getElementById('scr-war').innerHTML); }],
  ['warRender_ 戰鬥＋令咒', () => {
    mkEl('scr-war'); mkEl('setup');
    const view = { phase: 'battle', day: 3, nights: 14, nightsLeft: 12, alive: 5, unknown: 2,
      master: { name: '測', hp: 80, mhp: 100, seals: 2 },
      sv: { cls: 'Saber', name: '阿爾托莉雅', npName: '誓約勝利之劍', hp: 120, mhp: 220, cd: 2, trait: '直感', exposed: true },
      foes: [{ id: 'e1', label: 'Lancer', intel: 1, alive: true, hp: '負傷', loc: '教會' }],
      battle: { round: 1, rounds: 3, foe: 'Lancer', foeHp: 60, foeWord: '負傷', tele: 'np', ctx: 'sortie' },
      buttons: [{ t: 'stance', s: 'strike', label: '正面', sub: '硬碰硬', sealSub: '必中' },
        { t: 'stance', s: 'np', label: '寶具', sub: '還要 2 夜', sealSub: '無視充能', dis: true, sealOk: true }], result: null };
    ctx.warRender_(view);
    const btns = () => String(ctx.document.getElementById('war-btns').innerHTML);
    if (!/正面/.test(btns()) || !/disabled/.test(btns())) return false;       // 充能中的寶具按不下去
    if (!/要放寶具了/.test(String(ctx.document.getElementById('war-top').innerHTML))) return false;
    ctx.warToggleSeal();
    return /無視充能/.test(btns()) && !/disabled/.test(btns());               // 令咒一開就按得下去
  }],
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
      // ⚠ 2026-09 補 classList：少了它，任何走 classList 的函式（showGamePane、applyModeUI
      //   的分頁退路…）在這支底下都會拋例外，等於永遠驗不到——不是它們壞了，是假件缺零件。
      classList: (() => { const s = new Set(); return {
        add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c),
        toggle: (c, on) => { const v = (on === undefined) ? !s.has(c) : !!on; v ? s.add(c) : s.delete(c); return v; }
      }; })(),
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
// 🔎 ENTRIES 是【手維護】的清單，新按鈕得有人記得加進去——這專案一再修的就是這種會過期的索引。
//    所以再走一遍【從 HTML 自己推導】：每個 inline onclick 點名的函式都必須真的在全域。
//    inline onclick 的作用域只看得到 window，函式若包在別的函式裡，語法完全合法、
//    check.sh 全綠、部署成功，玩家按下去才 ReferenceError（而且多半沒人看 console）。
//    ⚠ 這一段【不列白名單】：叫得到就是叫得到，叫不到就是死按鈕，沒有例外可言。
const ONCLICK_SRC = FILES.concat(['Index.html'])
  .map(f => { try { return fs.readFileSync(path.join(GAS, f), 'utf8'); } catch (e) { return ''; } }).join('\n');
const onclickFns = [...new Set((ONCLICK_SRC.match(/onclick=["'`]\s*([A-Za-z_$][\w$]*)\s*\(/g) || [])
  .map(m => (m.match(/onclick=["'`]\s*([A-Za-z_$][\w$]*)/) || [])[1]).filter(Boolean))];
onclickFns.forEach(n => { if (typeof ctx[n] !== 'function') bad.push('死按鈕：onclick 點名 ' + n + '() 但全域裡沒有'); });
const disp = id => { const el = ctx.document.getElementById(id); return el && el.style ? el.style.display : '(查無此元素)'; };
// 🚪 2026-09 地點退休：地圖分頁在鑑賞底下要藏起來，而且【停在那一頁的人要被拉回故事頁】
//    ——不然手機上會看到一片空白，連地圖鈕都不見了（沒有退路可按）。
try {
  // ⚠ 這兩個節點住在 Index.html，mock DOM 只造得出被 innerHTML 寫出來的 id——先補上。
  //   ctx.pc 不必指派：makeCtx 已經從 localStorage 餵成 kanshou（見上面那段說明）。
  ['tab-map', 'pane-map'].forEach(id => {
    const el = ctx.document.createElement('div'); el.id = id; ctx.document.body.appendChild(el);
  });
  const _pm = ctx.document.getElementById('pane-map');
  _pm.classList.add('active');
  ctx.applyModeUI();
  if (disp('tab-map') !== 'none') bad.push('鑑賞底下地圖【分頁鈕】沒藏起來');
  if (disp('pane-map') !== 'none') bad.push('鑑賞底下地圖【面板】沒藏起來');
  if (_pm && _pm.classList.contains('active')) bad.push('停在地圖頁的玩家沒被拉回故事頁（會看到空白）');
} catch (e) { bad.push('applyModeUI(kanshou) 拋例外：' + e.message); }
// 回 false 的當成「跑得動但結果不對」——顯示切換這種事沒有例外可抓，只能看結果。
RENDERS.forEach(([n, fn]) => { try { if (fn() === false) bad.push(n + ' 跑得動，但畫面狀態不對'); } catch (e) { bad.push(n + '() 拋例外：' + e.message); } });

// 🧪 自我退化測試：注入一個會把面板打爆的覆寫，這支必須叫。
//    不會叫的掃描器比沒有更糟——它給你「已經有防線」的錯覺。
let probeFired = false;
try {
  // ⚠ 2026-09 探針對象從 kcChoose_ 換成 kmSpinner_：前者是地點時代的小選單，遊戲裡已經沒人叫，
  //   一支函式只為了當測試夾具而活著就是死碼。kmSpinner_ 是真的每天在用的讀條。
  const c2 = makeCtx('function kmSpinner_(){ throw new Error("degraded"); }');
  try { c2.kmSpinner_('t'); } catch (e) { probeFired = /degraded/.test(e.message); }
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
  // ⚠ 收尾用【結構】不用語氣句：舊版切到「日子還長」為止，那是一句文案，玩家一句話就改掉了，
  //    切點跟著失效、整段只剩開頭幾個字，掃描器會安靜地少看好幾顆鈕。`</div>` 是模板字串的真正結尾。
  const j = src.indexOf('</div>', i);
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

console.log('🖥️ 前端 runtime：%d 個入口、%d 個 onclick 目標、%d 個面板真的跑起來、新手引導點名 %d 顆鈕（含自我退化測試）'
  .replace('%d', ENTRIES.length).replace('%d', onclickFns.length).replace('%d', RENDERS.length).replace('%d', tutorial.icons.length));
if (bad.length) {
  console.log('  ❌ ' + bad.length + ' 處壞在 runtime（語法檢查看不到這種）：');
  bad.forEach(b => console.log('     ' + b));
  console.log('  → .html 的 JS 不進 CI，這裡是唯一防線；別靠「語法過了」當作能跑。');
  process.exit(1);
}
console.log('  ✅ 入口都在、面板都畫得出來');
