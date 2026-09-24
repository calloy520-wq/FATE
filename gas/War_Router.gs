// ⚔️ 新聖杯戰爭的 GAS 端：一局一格 JSON、按鈕路由、說書。規則全在 War_Engine.gs。為什麼：見 CODE_NOTES.md『WAR_』。

var WAR_SHEET_ = '聖杯戰局';
var WAR_COL_ = { ACCT: 0, GID: 1, UPDATED: 2, STATE: 3, NARR: 4 };
var WAR_HIST_KEEP_ = 4;        // 說書帶幾段前情
var WAR_LEN_ = { summon: '180～260', start: '150～220', day: '120～180', battle: '100～160', over: '220～300', supply: '800～1000' };
// 開場兩幕各有自己要寫的重點；其餘種類照【這一段發生的事】演就好。
var WAR_SCENE_ = {
  summon: '這是你們第一次見面：召喚陣的光、從者現身的那一刻、第一句問答（照原作，從者會確認眼前這個人是不是自己的御主）。',
  start: '聖杯戰爭開始的第一個白天：冬木看起來跟平常一樣，你們在據點說好接下來怎麼打。'
};

function warSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(WAR_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(WAR_SHEET_);
    sh.appendRow(['帳號', '局ID', '更新', '戰況', '說書']);
  }
  return sh;
}

// 這個帳號的那一列：{ sh, row(1 起算，沒有就 0), st, narr }
function warLoad_(acct) {
  var sh = warSheet_();
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][WAR_COL_.ACCT]) === acct) {
      return { sh: sh, row: i + 1, st: safeJson_(data[i][WAR_COL_.STATE], null), narr: safeJson_(data[i][WAR_COL_.NARR], { seq: 0, hist: [] }) };
    }
  }
  return { sh: sh, row: 0, st: null, narr: { seq: 0, hist: [] } };
}

function warSave_(ref, acct, st) {
  var vals = [acct, st.gid || '', new Date().toISOString(), JSON.stringify(st)];
  if (ref.row) ref.sh.getRange(ref.row, 1, 1, 4).setValues([vals]);
  else { ref.sh.appendRow(vals.concat([JSON.stringify({ seq: 0, hist: [] })])); ref.row = ref.sh.getLastRow(); }
}
function warSaveNarr_(ref, narr) {
  if (ref.row) ref.sh.getRange(ref.row, WAR_COL_.NARR + 1).setValue(JSON.stringify(narr));
}

// 引擎要的種子：從者池、這場戰爭的陣容、名字表。
function warSeedCtx_(war) {
  var seeds = {}, masterNames = {};
  SEED_SERVANTS.forEach(function (s) { seeds[s.id] = s; });
  SEED_MASTERS.forEach(function (m) { masterNames[m.id] = m.name; });
  return {
    pool: SEED_SERVANTS.filter(function (s) { return s.cls !== '御主'; }),
    roster: war === '4th' ? FATE_4TH_ROSTER : FATE_5TH_ROSTER,
    seeds: seeds, masterNames: masterNames
  };
}

function warLogLines_(ev) { return (ev || []).map(function (e) { return { txt: e.txt, num: e.num || '', k: e.k }; }); }

// ── 動作 ──────────────────────────────────────────────
function actionWarLoad(userData) {
  var acct = String(userData.acctName || '');
  if (!acct) return JSON.stringify({ success: false, message: '先登入帳號。' });
  var ref = warLoad_(acct);
  if (!ref.st) return JSON.stringify({ success: true, view: null, story: [], rules: warRules_() });
  return JSON.stringify({ success: true, view: warView_(ref.st), story: (ref.narr.hist || []).map(function (h) { return h.t; }) });
}

function actionWarNew(userData) {
  var acct = String(userData.acctName || '');
  if (!acct) return JSON.stringify({ success: false, message: '先登入帳號。' });
  var war = userData.war === '4th' ? '4th' : '5th';
  var name = String(userData.pcName || '').trim() || '御主';
  var sex = userData.sex === '女' ? '女' : '男';
  var wish = String(userData.wish || '').replace(/[<>｜【】]/g, '').trim().slice(0, 40);
  var o = warSeedCtx_(war);
  var pick = String(userData.heroId || '');
  if (pick) {
    var canon = SEED_SERVANTS.filter(function (s) { return s.id === pick && s.cls !== '御主'; })[0];
    var orig = canon ? null : warOriginalsFor_(acct).filter(function (r) { return String(r[COL.HERO.ID]) === pick; })[0];
    if (!canon && !orig) return JSON.stringify({ success: false, message: '叫不到這位從者。' });
    o.pool = [canon || warSeedFromRow_(orig)];
  }
  o.name = name; o.sex = sex; o.war = war; o.wish = wish; o.seed = Date.now() % 2147483647;
  var st = warNewGame_(o);
  st.gid = 'w_' + acct + '_' + o.seed;
  st.narr = { seq: 1, kind: 'summon', facts: ['召喚陣亮起，回應你的是 ' + st.sv.cls + '「' + st.sv.name + '」。'] };
  st.seq = 1;
  var ref = warLoad_(acct);
  warSave_(ref, acct, st);
  warSaveNarr_(ref, { seq: 0, hist: [] });
  return JSON.stringify({ success: true, view: warView_(st), log: [{ txt: st.narr.facts[0], num: '', k: 'summon' }] });
}

function actionWarAct(userData) {
  var acct = String(userData.acctName || '');
  var ref = warLoad_(acct);
  if (!ref.st) return JSON.stringify({ success: false, message: '還沒有開始的聖杯戰爭。' });
  var a = userData.act || {};
  var act = { t: String(a.t || ''), id: String(a.id || ''), s: String(a.s || ''), seal: a.seal === true };
  var st = ref.st;
  var r = warAct_(st, act);
  if (!r.ok) return JSON.stringify({ success: false, message: r.msg });
  var kind = st.phase === 'over' ? 'over' : (act.t === 'supply' ? 'supply' : (act.t === 'stance' || st.phase === 'battle' ? 'battle' : (act.t === 'reroll' ? 'summon' : (act.t === 'start' ? 'start' : 'day'))));
  st.narr = { seq: st.seq, kind: kind, facts: r.ev.map(function (e) { return e.txt; }) };
  warSave_(ref, acct, st);
  return JSON.stringify({ success: true, view: warView_(st), log: warLogLines_(r.ev) });
}

// 說書：只演已經算好的那一段；同一個 seq 講過就回快取（連點、重整都不會多花一次 AI）。
function actionWarNarrate(userData) {
  var acct = String(userData.acctName || '');
  var ref = warLoad_(acct);
  var st = ref.st;
  if (!st || !st.narr) return JSON.stringify({ success: true, text: '' });
  var hist = ref.narr.hist || [];
  if (ref.narr.seq === st.narr.seq && hist.length) return JSON.stringify({ success: true, text: hist[hist.length - 1].t });
  var lewd = st.narr.kind === 'supply';
  var cfg = {
    plainText: true, retries: 3, sessionId: 'w_' + acct,
    model: lewd ? LEWD_MODEL : AI_MODEL,
    temperature: lewd ? 1.0 : 0.85,
    max_tokens: lewd ? 3200 : 900,
    chatHistory: hist.slice(-2).reduce(function (acc, h) { return acc.concat([{ role: 'user', content: h.f }, { role: 'assistant', content: h.t }]); }, [])
  };
  var prompt = warNarrPrompt_(st);
  var text = String(callGeminiAPI(prompt, WAR_NARR_SYS_, cfg) || '').trim();
  if (!text) text = '（夜風吹過，什麼也沒留下。）';
  hist.push({ f: st.narr.facts.join('\n'), t: text });
  warSaveNarr_(ref, { seq: st.narr.seq, hist: hist.slice(-WAR_HIST_KEEP_) });
  return JSON.stringify({ success: true, text: text });
}

function actionWarQuit(userData) {
  var acct = String(userData.acctName || '');
  var ref = warLoad_(acct);
  if (ref.row) ref.sh.deleteRow(ref.row);
  return JSON.stringify({ success: true });
}

// ── 世界書：這一段發生的事提到了什麼，才把那一條的原作設定遞給說書 ──
// 冬木的地點（兩次戰爭的據點都在這裡）與戰爭本身的規矩。寶具、喜惡從各自的種子長出來（warLoreEntries_）。
var WAR_WORLD_BOOK_ = [
  { keys: ['深山町'], content: '深山町是冬木市未遠川西岸的老城區，坡道多、老宅多，御三家的宅邸都在這一側' },
  { keys: ['新都'], content: '新都在未遠川東岸，車站、高樓與中央公園都在那邊，夜裡的辦公大樓頂樓空無一人' },
  { keys: ['未遠川', '冬木大橋'], content: '未遠川把冬木分成兩半，冬木大橋是橫跨河面的紅色鋼橋' },
  { keys: ['柳洞寺'], content: '柳洞寺在深山町後山的圓藏山上，一段很長的石階通往山門；整座山張著阻擋靈體的結界，從者只能從正面山門那條路上去' },
  { keys: ['聖杯在柳洞寺', '聖杯降臨'], content: '大聖杯藏在圓藏山地底的大空洞，聖杯戰爭走到最後，剩下的從者都會被引到那裡' },
  { keys: ['教會', '言峰'], content: '冬木教會在新都郊外的山丘上，是聖杯戰爭的監督所在；失去從者的御主可以到那裡尋求庇護' },
  { keys: ['遠坂宅', '遠坂邸'], content: '遠坂邸是深山町坡道頂上的紅磚洋館，遠坂家世代的魔術工房' },
  { keys: ['間桐宅', '間桐邸'], content: '間桐邸是深山町另一棟終日陰暗的洋館，間桐家的魔術據點' },
  { keys: ['衛宮邸', '衛宮家'], content: '衛宮邸是深山町的大和式老宅，有道場，後院還有一座土藏' },
  { keys: ['海特飯店'], content: '海特飯店是新都的高樓飯店，肯尼斯包下了整整一層布成工房' },
  { keys: ['麥肯基宅'], content: '麥肯基家是深山町一戶普通的民宅，韋伯用暗示讓那對老夫婦把自己當成從國外回來的孫子' },
  { keys: ['碼頭倉庫', '倉庫街'], content: '冬木港邊的倉庫街入夜後沒有人煙，一排排貨櫃與鐵皮倉庫' },
  { keys: ['令咒'], content: '令咒是刻在御主手上的三劃絕對命令權，能讓從者做到平常做不到的事；用掉的那一劃會褪去' },
  { keys: ['補魔', '魔力'], content: '從者靠御主供給的魔力留在現世，御主的魔力不夠時，從者連寶具都放不出來' }
];

// 這一局能觸發的條目：世界書＋我方從者的喜惡＋場上每一位的寶具原作描述。
//   寶具條目只寫寶具本身、不寫持有者——真名還沒看穿的對手，說書也不該先知道是誰。
function warLoreEntries_(st) {
  var out = WAR_WORLD_BOOK_.slice();
  var sc = (st.sv && st.sv.card) || {};
  (sc.book || []).forEach(function (e) { if (e && e.content) out.push({ keys: e.keys || [], content: st.sv.name + e.content }); });
  [st.sv].concat(st.enemies || []).forEach(function (u) {
    String((u && u.card && u.card.np) || '').split('／').forEach(function (piece) {
      var n = warNpName_(piece);
      if (piece.trim() && n !== '寶具') out.push({ keys: [n], content: '寶具「' + n + '」：' + piece.trim() });
    });
  });
  return out;
}
// 這一段的事件文字碰到的條目 → 一行；沒有就空字串。
function warLoreStr_(st) {
  var hits = loreHits_(warLoreEntries_(st), ((st.narr && st.narr.facts) || []).join('\n'), {});
  var seen = {};
  hits = hits.filter(function (h) { if (seen[h]) return false; seen[h] = 1; return true; }).slice(0, KANSHOU_LORE_MAX_);
  return hits.length ? '【這一段碰到的原作設定】寫到的時候照這個寫：' + hits.join('｜') + '。' : '';
}

// ── 說書提示詞 ────────────────────────────────────────
var WAR_NARR_SYS_ = '《命運停駐之夜》說書人。Fate／TYPE-MOON 的筆觸，台灣繁體中文。\n'
  + '1. 旁白用第二人稱：「你」是御主本人，寫你看見、聽見、感覺到的。\n'
  + '2. 台詞前冠說話者的名字，用單層「」；動作與環境聲響寫在引號外。\n'
  + '3. 每 2～3 句用 <br><br> 分一段。\n'
  + '4. 【這一段發生的事】是系統已經算好的結果，照順序寫成畫面：誰打中誰、傷得多重、誰撤退、誰倒下，讀的人都要看得出來。數字留在系統那邊，文字裡寫成畫面。\n'
  + '5. 寶具與令咒要念出名字；其餘的招式寫成動作。\n'
  + '6. 角色的個性從言行裡透出來，照 Fate 原作的認知演。\n'
  + '7. 只輸出敘事本文。';

function warNarrPrompt_(st) {
  var sv = st.sv, p = sv.card || {};
  var lines = [];
  lines.push('【你的從者】' + sv.name + '（' + sv.cls + '）。' + [p.look, p.words, p.toMaster].filter(Boolean).join('。') + '。');
  lines.push('【你】' + st.master.name + '，' + st.master.sex + '性，手背上還剩 ' + st.master.seals + ' 劃令咒。'
    + (st.master.wish ? '你想向聖杯許的願：' + st.master.wish + '（藏在心裡，從你的選擇與神情透出來）' : ''));
  if (st.battle) {
    var e = warFoe_(st, st.battle.e);
    lines.push('【對手】' + (e.intel >= 2 ? e.name + '（' + e.cls + '）。' + ((e.card && e.card.look) || '') : warFoeLabel_(e) + '，真名還不知道。'));
  }
  var when = st.phase === 'day' ? '白天' : (st.phase === 'over' ? '最後' : '夜晚');
  lines.push('【此刻】第 ' + Math.min(st.day, WAR_.NIGHTS) + ' 天的' + when + '。' + sv.name + warHpWord_(sv) + '；你' + (st.master.hp >= st.master.mhp * 0.8 ? '沒有大礙' : '也受了傷') + '。');
  lines.push('【這一段發生的事】\n' + st.narr.facts.map(function (f) { return '・' + f; }).join('\n'));
  var lore = warLoreStr_(st);
  if (lore) lines.push(lore);
  var kind = st.narr.kind;
  if (kind === 'supply') {
    lines.push(sealGenderFact_(st.master.sex, p.gender || '', sv.name));
    lines.push('★【' + WAR_LEN_.supply + ' 字】寫這場補魔：魔力流動只是成因，全篇寫在肉體這一側——接觸、溫度、反應。' + LEWD_EXPLICIT_);
  } else if (kind === 'over') {
    lines.push('★【' + WAR_LEN_.over + ' 字】這是這場聖杯戰爭的結局，寫出它的重量。' + (st.result && st.result.win ? '聖杯在你面前，照你心裡的那個願望寫這一刻，把你們一路走來的樣子寫進最後這一幕。' : '寫這一場戰爭怎麼在你手裡結束。'));
  } else {
    lines.push('★篇幅 ' + (WAR_LEN_[kind] || WAR_LEN_.day) + ' 字。' + (WAR_SCENE_[kind] || ''));
  }
  return lines.join('\n');
}
