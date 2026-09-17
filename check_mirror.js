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
  'KC_REL_TIERS_': 'KANSHOU_REL_TIER_',   // 前端多了一個 S
  // solo 側的常數不叫 KANSHOU_*，靠 ALIAS 指過去
  'KC_DEADLINE_DAYS_': 'FATE_DEADLINE_DAYS_',
  'KC_MANA_CIRC_CUT_': 'MANA_CIRC_CUT_',
  'KC_MANA_HP_CUT_': 'MANA_HP_CUT_',
  'KC_HORROR_SHIELD_HP_': 'HORROR_SHIELD_HP',
  'KC_HORROR_REGEN_': 'HORROR_REGEN',
  'KC_HORROR_UPKEEP_': 'HORROR_UPKEEP',
  'KC_HORROR_HOURLY_UPKEEP_': 'HORROR_HOURLY_UPKEEP',
};
// 純前端常數：沒有後端對應是**設計如此**，每一條都要寫清楚為什麼，否則就是漏了鏡射。
const FRONTEND_ONLY = {
  'KC_QUICK_PHRASES_BUILTIN_': '4 個內建貼圖純前端顯示，後端只管玩家自訂的那份',
  'KC_BAND_SHORT_': '時段名稱的短標籤，純 UI 排版用',
  'KC_ALBUM_BAND_BG_': '相簿卡片依時段的背景色，純樣式',
  'KC_SLEEP_HINTS_': '地圖上的「她熟睡中」提示，純顯示——同一件事後端是 pSleepStr 每回合算好餵給 AI（KANSHOU_ASLEEP_HOUR_END_ 才是真實來源），不是一張對照表',
};
// 🔧 刻意的差異：前後端**本來就不該一模一樣**的地方。每一條都必須寫 why——
//   這正是這支工具的價值所在：不是消滅差異，是逼每個差異都有人為它簽名。
//   沒登記的差異一律當成走鐘擋下來。
const TWEAK = {
  'KC_TIME_BANDS_': { skip: ['label'], why: '前端 label 前面掛 emoji，純顯示；key/startHour 才是判準' },
  'KC_APPT_BANDS_': { skip: ['label'], why: '同上，前端 label 掛 emoji；band/hour 才是判準' },
  'KC_LOCATIONS_': {
    why: '① 前端把 room 併進 home 分頁顯示，真正的判準是 isRoom ② 後端在檔案載入時才把泛用住處池 push 進 '
      + 'KANSHOU_LOCATIONS_（單一真實來源），靜態讀字面量看不到那 8 間，這裡照同樣規則補上',
    front: v => v.map(x => (x.isRoom ? Object.assign({}, x, { region: 'room' }) : x)),
    back: (v, ctx) => v.concat(ctx.pool.map(h => ({ name: h.name, region: 'visit', desc: h.desc, noEncounter: true, generic: true })))
  },
  // 前端這張表混了兩件事：① 橋段徽章（對後端 KANSHOU_LOCATION_EVENTS_）② 住處的「她熟睡中」徽章
  //   （對後端所有住處＝手寫豪邸 KANSHOU_HERO_HOME_ 的值 ∪ 泛用住處池）。分開比，兩邊都要全中——
  //   後端新增一位英靈的專屬豪邸卻忘了補前端，徽章就會靜靜不見，這正是要擋的。
  'KC_REGIONS_': {
    why: '同上：前端沒有獨立的 room 分頁，後端有（併進 home）；分頁名稱/說明是各自的顯示文案，id 才是判準',
    skip: ['name', 'desc'],
    back: v => v.filter(x => x.id !== 'room')
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
  const body = text.slice(i, end).replace(/\/\/[^\n]*/g, '');
  try { return { found: true, value: eval('(' + body.trim().replace(/,\s*$/, '') + ')') }; }
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

// 有些後端表在載入時會被程式再加工（例：泛用住處池 push 進 KANSHOU_LOCATIONS_），
//   靜態讀字面量看不到——把需要的原料先備好交給 TWEAK.back 自己補。
const CTX = {
  pool: (grabLiteral(backText, 'const', 'KANSHOU_GENERIC_HOME_POOL_').value || []),
  heroHome: (grabLiteral(backText, 'const', 'KANSHOU_HERO_HOME_').value || {}),
  cohabitRoom: grabLiteral(backText, 'const', 'KANSHOU_COHABIT_ROOM_').value,
};

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
  const bv = tw.back ? tw.back(b.value, CTX) : b.value;
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

// 🌙 住處熟睡徽章覆蓋：前端 atHome 那批必須剛好等於「後端所有住處」。
//   後端多加一位英靈的專屬豪邸而忘了補前端 → 那間住處的熟睡徽章會靜靜不見（不會有任何錯誤）。
(function () {
  let fe = null;
  // ⚠ 2026-09 抓到：這張表已改名 KC_LOCATION_EVENTS_ → KC_SLEEP_HINTS_（橋段那半隨預寫池砍掉、
  //   只剩熟睡提示），而這裡還在找舊名字——找不到就靜靜 return，這道檢查等於死了一段時間。
  //   找不到就【叫】，不要默默跳過：查無此表本身就是走鐘。
  for (const file of front) { const g = grabLiteral(file.text, '(?:const|var|let)', 'KC_SLEEP_HINTS_'); if (g.found && g.value) { fe = g.value; break; } }
  if (!fe) { checked++; bad++; problems.push('住處熟睡徽章覆蓋：前端找不到 KC_SLEEP_HINTS_（改名了？這道檢查會靜靜失效，所以直接報錯）'); return; }
  const fHomes = Object.keys(fe).filter(k => fe[k].atHome).sort();
  // 後端 pSleepStr 的熟睡地點＝她自己的住處 ∪ 同居房 ∪ 我的房間（見 Gallery.gs 的 _pAtHome）。
  //   同居房名稱一樣從後端常數讀，不在這裡寫死。
  const bHomes = [...new Set([...Object.values(CTX.heroHome), ...CTX.pool.map(h => h.name),
    CTX.cohabitRoom, '我的房間'].filter(Boolean))].sort();
  const missing = bHomes.filter(x => fHomes.indexOf(x) < 0);
  const extra = fHomes.filter(x => bHomes.indexOf(x) < 0);
  checked++;
  if (missing.length || extra.length) {
    bad++;
    problems.push(`住處熟睡徽章覆蓋不全（KC_SLEEP_HINTS_ 的 atHome ↔ 後端所有住處）\n     前端少了：${missing.join('、') || '無'}\n     前端多了：${extra.join('、') || '無'}`);
  }
})();

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
