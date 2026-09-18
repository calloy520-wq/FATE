#!/usr/bin/env node
/* 🪞 前後端常數鏡射檢查（check.sh 會跑）
 *
 * 擋的漏洞形狀：「前端手抄後端表，後端改了前端沒跟著改」。
 *   實際踩過：地圖分區、關係五階門檻、小道具強度階、催眠第五態…
 *   症狀一律是 UI 說謊——按鈕鎖錯人、標籤顯示錯階、選項少一個，而且不會有任何錯誤訊息。
 *
 * ⚠ 為什麼要「自動發現」而不是手寫清單：
 *   scratchpad 那版是手寫要比對哪幾個常數，於是**新加的 KC_ 常數不會有人記得加進來**——
 *   檢查清單本身就是同一種漏洞。這裡改成掃出所有 `var KC_...` 再去找後端對應：
 *   對不上、又沒登記在 FRONTEND_ONLY 的，直接報錯。新增常數時你只有兩條路：
 *   要嘛它真的有後端對應（那就會被比對），要嘛你得明講它是純前端的並寫下理由。
 *
 * 比對方式：純量/字串陣列逐字比；物件陣列只比「兩邊都有的欄位」——
 *   前端常帶純顯示欄位（emoji、座標、CSS），那不是走鐘，不該報錯。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

// 後端名稱跟前端不是機械對應的少數幾個（歷史命名，不值得為了工具去改動用中的常數名）
const ALIAS = {
  // solo 側的常數不叫 KANSHOU_*，靠 ALIAS 指過去
  'KC_DEADLINE_DAYS_': 'FATE_DEADLINE_DAYS_',
  'KC_MANA_CIRC_CUT_': 'MANA_CIRC_CUT_',
  'KC_MANA_HP_CUT_': 'MANA_HP_CUT_',
  'KC_MANA_TRUST_BOND_': 'MANA_TRUST_BOND_',
  'KC_MANA_LOW_PCT_': 'MANA_LOW_PCT_',
  'KC_HORROR_SHIELD_HP_': 'HORROR_SHIELD_HP',
  'KC_HORROR_REGEN_': 'HORROR_REGEN',
  'KC_HORROR_UPKEEP_': 'HORROR_UPKEEP',
  'KC_HORROR_HOURLY_UPKEEP_': 'HORROR_HOURLY_UPKEEP',
  'KC_PARLEY_': 'PARLEY_ACTS_',
  'KC_TRAIT_SLOTS_': 'TRAIT_SLOTS_',
};
// 純前端常數：沒有後端對應是**設計如此**，每一條都要寫清楚為什麼，否則就是漏了鏡射。
const FRONTEND_ONLY = {
  'KC_QUICK_PHRASES_BUILTIN_': '4 個內建貼圖純前端顯示，後端只管玩家自訂的那份',
  'KC_BAND_SHORT_': '時段名稱的短標籤，純 UI 排版用',
  'KC_ALBUM_BAND_BG_': '相簿卡片依時段的背景色，純樣式',
};
// 🔧 刻意的差異：前後端**本來就不該一模一樣**的地方。每一條都必須寫 why——
//   這正是這支工具的價值所在：不是消滅差異，是逼每個差異都有人為它簽名。
//   沒登記的差異一律當成走鐘擋下來。
const TWEAK = {
  'KC_TIME_BANDS_': { skip: ['label'], why: '前端 label 前面掛 emoji，純顯示；key/startHour 才是判準' },
  'KC_LOCATIONS_': {
    why: '前端把 room 併進 home 分頁顯示，真正的判準是 isRoom',
    front: v => v.map(x => (x.isRoom ? Object.assign({}, x, { region: 'room' }) : x))
  },
  'KC_REGIONS_': {
    why: '同上：前端沒有獨立的 room 分頁，後端有（併進 home）；分頁名稱/說明是各自的顯示文案，id 才是判準',
    skip: ['name', 'desc'],
    back: v => v.filter(x => x.id !== 'room')
  },
  'KC_PARLEY_': {
    why: '前端多的全是顯示欄位（icon/tip/pre 都是 UI 文案）；判準是【三種交涉的 key 與 label 兩邊一致】——'
      + '後端加一種交涉、前端沒跟著加，那顆鈕就不存在（反過來則是按下去查無此交涉）',
    front: v => Object.keys(v).reduce((o, k) => (o[k] = { label: v[k].label }, o), {}),
    back: v => Object.keys(v).reduce((o, k) => (o[k] = { label: v[k].label }, o), {})
  },
  'KC_SUMMON_BLOCKED_IDS_': {
    why: '衛宮士郎-Master 是玩家自己的位置，前端從召喚清單裡濾掉；後端擋它的是 actionKanshouSummonHero 裡單獨那一條(訊息不一樣)，不在這張表上',
    front: v => v.filter(x => x !== '衛宮士郎-Master')
  },
};

function readAll(dir, filter) {
  return fs.readdirSync(dir).filter(filter).map(f => ({ name: f, text: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

// 從原始碼抓 `<kw> NAME = <literal>;`。字面量可能跨行（陣列/物件），用括號配對找結尾，
// 不用「找 \n  ];」那種靠縮排的脆弱寫法（縮排一變就靜靜抓不到→又是一個靜默漏洞）。
function grabLiteral(text, kw, name) {
  const re = new RegExp('(?:^|\\n)\\s*' + kw + '\\s+' + name + '\\s*=\\s*');
  const m = re.exec(text);
  if (!m) return { found: false };
  let i = m.index + m[0].length;
  const open = text[i];
  let end;
  if (open === '[' || open === '{') {
    const close = open === '[' ? ']' : '}';
    let depth = 0, inStr = null, esc = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (esc) { esc = false; continue; }
      if (inStr) { if (c === '\\') esc = true; else if (c === inStr) inStr = null; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '/' && text[j + 1] === '/') { j = text.indexOf('\n', j); if (j < 0) break; continue; }
      if (c === open) depth++;
      else if (c === close) { depth--; if (depth === 0) { end = j + 1; break; } }
    }
  } else {
    end = text.indexOf(';', i);
    if (end < 0) end = text.indexOf('\n', i);
  }
  if (end == null || end < 0) return { found: true, err: '找不到字面量結尾' };
  let body = text.slice(i, end).replace(/\/\/[^\n]*/g, '').trim().replace(/,\s*$/, '');
  // 🔗 一層別名：`const A_ = B_;`(B_ 是同檔另一個常數) 也要解得出來——
  //    2026-09 把寫死的門檻改成從階級表推之後，這裡整排解析失敗。
  //    只跟一跳、且只認【同檔已定義的常數/陣列取值】，避免把整個檔當程式跑。
  let hops = 0;
  while (/^[A-Za-z_$][\w$]*(\s*\[\s*\d+\s*\]\s*\.\s*[\w$]+)?$/.test(body) && hops++ < 4) {
    const root = body.match(/^[A-Za-z_$][\w$]*/)[0];
    const inner = grabLiteral(text, 'const', root) ;
    if (!inner || inner.value === undefined) break;
    const tail = body.slice(root.length);
    try { body = JSON.stringify(eval('(' + JSON.stringify(inner.value) + ')' + tail)); }
    catch (e) { break; }
  }
  try { return { found: true, value: eval('(' + body + ')') }; }
  catch (e) { return { found: true, err: '無法解析：' + e.message }; }
}

// 物件陣列：只比兩邊都有的欄位（前端的純顯示欄位不算走鐘）
function project(a, b) {
  if (Array.isArray(a) && Array.isArray(b) && a.length && b.length
    && a.every(x => x && typeof x === 'object' && !Array.isArray(x))
    && b.every(x => x && typeof x === 'object' && !Array.isArray(x))) {
    const keys = Object.keys(a[0]).filter(k => Object.prototype.hasOwnProperty.call(b[0], k));
    if (!keys.length) return [a, b];
    const pick = arr => arr.map(o => { const r = {}; keys.forEach(k => r[k] = o[k]); return r; });
    return [pick(a), pick(b), keys];
  }
  return [a, b];
}

// 指出第一個真正對不上的地方，而不是把兩坨 JSON 截斷後丟給人眼比對
function explain(a, b) {
  const J = x => JSON.stringify(x);
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (J(a[i]) !== J(b[i])) {
        return `     第 ${i} 項起不同（前端 ${a.length} 項／後端 ${b.length} 項）\n       前端：${J(a[i])}\n       後端：${J(b[i])}`;
      }
    }
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
    const ks = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    const diff = ks.filter(k => J(a[k]) !== J(b[k]));
    if (diff.length) return `     不同的鍵 ${diff.length} 個：${diff.slice(0, 6).join('、')}\n       前端：${J(a[diff[0]])}\n       後端：${J(b[diff[0]])}`;
  }
  return `     前端：${J(a)}\n     後端：${J(b)}`;
}

const gasDir = path.join(ROOT, 'gas');
const front = readAll(gasDir, f => /^Script.*\.html$/.test(f));
const backText = readAll(gasDir, f => /\.gs$/.test(f)).map(f => f.text).join('\n');

const names = new Set();
front.forEach(f => {
  const re = /(?:^|\n)\s*(?:const|var|let)\s+(KC_[A-Z0-9_]+)\s*=/g;
  let m; while ((m = re.exec(f.text))) names.add(m[1]);
});

let bad = 0, checked = 0, declared = 0;
const problems = [];
[...names].sort().forEach(fn => {
  if (FRONTEND_ONLY[fn]) { declared++; return; }
  const bn = ALIAS[fn] || ('KANSHOU_' + fn.slice(3));
  const b = grabLiteral(backText, '(?:const|var|let)', bn);
  if (!b.found) {
    problems.push(`${fn}：找不到後端對應 ${bn}，也沒登記在 FRONTEND_ONLY——是漏了鏡射，還是純前端？請二選一寫明。`);
    bad++; return;
  }
  let f = null;
  for (const file of front) { const g = grabLiteral(file.text, '(?:const|var|let)', fn); if (g.found) { f = g; break; } }
  if (f.err || b.err) { problems.push(`${fn}：字面量解析失敗（前端:${f.err || '-'} / 後端:${b.err || '-'}）`); bad++; return; }
  const tw = TWEAK[fn] || {};
  const fv = tw.front ? tw.front(f.value) : f.value;
  const bv = tw.back ? tw.back(b.value) : b.value;
  let [pa, pb, keys] = project(fv, bv);
  if (tw.skip && Array.isArray(pa)) {
    const strip = arr => arr.map(o => { const r = Object.assign({}, o); tw.skip.forEach(k => delete r[k]); return r; });
    pa = strip(pa); pb = strip(pb);
    keys = (keys || []).filter(k => tw.skip.indexOf(k) === -1);
  }
  const sa = JSON.stringify(pa), sb = JSON.stringify(pb);
  checked++;
  if (sa !== sb) {
    // ⚠ 只印開頭 240 字的話，差異在後面就整個看不到——「會藏差異的檢查工具」本身就是下一個坑。
    //   陣列/物件一律指出**第一個對不上的元素**，純量才印全文。
    problems.push(`${fn} ↔ ${bn} 走鐘了${keys ? `（比對欄位：${keys.join('/')}）` : ''}\n${explain(pa, pb)}`);
    bad++;
  }
});

// 🗑️ 2026-09「住處熟睡徽章覆蓋」那道隨位置模擬整組退休：鑑賞不再有住處、不再有作息落點，
//    KC_SLEEP_HINTS_／KANSHOU_HERO_HOME_ 兩端都已刪除，沒有東西可以對答案。

// 🛠️ 工房能挑的效果 ↔ 後端收的白名單：註解本來就寫著「改後端 ALLOWED_FX_ 記得同步 FORGE_FX」，
//    那種靠人記得的規則遲早會漏。漏的症狀是玩家捏完按存檔才被退貨（或某個效果永遠沒人選得到）。
(function () {
  const feAll = front.map(x => x.text).join('\n');
  const i = feAll.indexOf('var FORGE_FX_GROUPS');
  if (i < 0) { checked++; bad++; problems.push('工房效果目錄：前端找不到 FORGE_FX_GROUPS（改名了？這道檢查會靜靜失效，所以直接報錯）'); return; }
  const j = feAll.indexOf('var FORGE_FX =', i);
  const offered = [...new Set([...feAll.slice(i, j < 0 ? i + 8000 : j).matchAll(/\[\s*'([a-z_0-9]+)'\s*,/g)].map(m => m[1]))].sort();
  const b = grabLiteral(backText, '(?:const|var|let)', 'ALLOWED_FX_');
  if (!b.found || !b.value) { checked++; bad++; problems.push('工房效果目錄：後端找不到 ALLOWED_FX_'); return; }
  const allowed = Object.keys(b.value).sort();
  const ghost = offered.filter(x => allowed.indexOf(x) < 0);
  const unused = allowed.filter(x => offered.indexOf(x) < 0);
  checked++;
  if (ghost.length || unused.length) {
    bad++;
    problems.push(`工房效果目錄 ↔ ALLOWED_FX_ 對不上\n     前端給得出來、後端會退貨：${ghost.join('、') || '無'}\n     後端收、工房卻沒開放：${unused.join('、') || '無'}`);
  }
})();

// ── 名字不叫 KC_ 的手抄常數（上面的自動掃描只認 KC_ 前綴，這些得逐條點名）──
//    每一條都是「前端寫死一個數字、後端另外寫死同一個數字」的形狀，改一邊忘另一邊就會靜靜說謊。
[
  { front: 'FORGE_BUDGET', back: 'FORGE_BUDGET', why: '自訂英靈工房的點數預算（前端算給玩家看、後端驗收）' },
  { front: 'FORGE_PTS', back: 'RANK_VALUE', why: '階級→點數對照（前端拿來扣預算、後端拿來算六圍）' },
  // 🛠️ 工房計價（2026-09 補）：前端把價錢算給玩家看、後端拿自己那份驗收。
  //    對不上的症狀是「畫面說買得起、按下去被退貨」，或反過來被多收點數——而且不會有錯誤訊息。
  { front: 'FORGE_SK_PTS', back: 'SKILL_PTS_', why: '技能階級定價（一般軌）' },
  { front: 'FORGE_SK_PTS_BIG', back: 'SKILL_PTS_BIG_', why: '技能階級定價（強軌：千里眼/魔眼/高速神言…）' },
  { front: 'FORGE_SK_PTS_SMALL', back: 'SKILL_PTS_SMALL_', why: '技能階級定價（弱軌：騎乘/風王/卡里斯瑪）' },
  { front: 'FORGE_SK_TRACK', back: 'SKILL_TRACK_', why: '哪個 fx 走強軌/弱軌（分軌表本身）' },
  { front: 'FORGE_FLAT_FX', back: 'FLAT_FX_', why: '固定價的概念級 fx（十二試煉/燕返/寶具級…）' },
  { front: 'FORGE_CLS_BONUS', back: 'FORGE_CLS_BONUS_', why: '職階附贈預算（Berserker +30）' },
].forEach(pair => {
  const f = grabLiteral(front.map(x => x.text).join('\n'), '(?:const|var|let)', pair.front);
  const b = grabLiteral(backText, '(?:const|var|let)', pair.back);
  checked++;
  if (f.value === undefined || b.value === undefined) {
    bad++; problems.push(`${pair.front} ↔ ${pair.back}：抓不到其中一邊的定義（改名了？檢查沒跟上就等於沒檢查）`);
    return;
  }
  const same = JSON.stringify(f.value) === JSON.stringify(b.value);
  if (!same) { bad++; problems.push(`${pair.front}(前) ↔ ${pair.back}(後) 不一致 —— ${pair.why}\n     前端：${JSON.stringify(f.value)}\n     後端：${JSON.stringify(b.value)}`); }
});

console.log(`🪞 前後端常數鏡射：比對 ${checked} 組，純前端 ${declared} 組`);
if (bad) { console.log(`  ❌ ${bad} 處不一致`); problems.forEach(p => console.log('     ' + p)); }
else console.log('  ✅ 全部一致');
process.exit(bad ? 1 : 0);
