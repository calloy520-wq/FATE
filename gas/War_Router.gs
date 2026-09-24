// ⚔️ 新聖杯戰爭的 GAS 端：一局一格 JSON、按鈕路由、說書。規則全在 War_Engine.gs。為什麼：見 CODE_NOTES.md『WAR_』。

var WAR_SHEET_ = '聖杯戰局';
var WAR_COL_ = { ACCT: 0, GID: 1, UPDATED: 2, STATE: 3, NARR: 4 };
var WAR_HIST_KEEP_ = 4;        // 說書帶幾段前情
var WAR_LEN_ = { summon: '150～220', day: '120～180', battle: '100～160', over: '220～300', supply: '800～1000' };

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
  if (!ref.st) return JSON.stringify({ success: true, view: null, story: [] });
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
  var kind = st.phase === 'over' ? 'over' : (act.t === 'supply' ? 'supply' : (act.t === 'stance' || st.phase === 'battle' ? 'battle' : (act.t === 'reroll' ? 'summon' : 'day')));
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
  var sv = st.sv, seed = null;
  SEED_SERVANTS.forEach(function (s) { if (s.id === sv.hero) seed = s; });
  var p = (seed && seed.persona) || {};
  var lines = [];
  lines.push('【你的從者】' + sv.name + '（' + sv.cls + '）。' + [p.look, p.words, p.toMaster].filter(Boolean).join('。') + '。');
  lines.push('【你】' + st.master.name + '，' + st.master.sex + '性，手背上還剩 ' + st.master.seals + ' 劃令咒。'
    + (st.master.wish ? '你想向聖杯許的願：' + st.master.wish + '（藏在心裡，從你的選擇與神情透出來）' : ''));
  if (st.battle) {
    var e = warFoe_(st, st.battle.e);
    var es = null;
    SEED_SERVANTS.forEach(function (s) { if (s.id === e.hero) es = s; });
    lines.push('【對手】' + (e.intel >= 2 ? e.name + '（' + e.cls + '）。' + ((es && es.persona && es.persona.look) || '') : warFoeLabel_(e) + '，真名還不知道。'));
  }
  var when = st.phase === 'day' ? '白天' : (st.phase === 'over' ? '最後' : '夜晚');
  lines.push('【此刻】第 ' + Math.min(st.day, WAR_.NIGHTS) + ' 天的' + when + '。' + sv.name + warHpWord_(sv) + '；你' + (st.master.hp >= st.master.mhp * 0.8 ? '沒有大礙' : '也受了傷') + '。');
  lines.push('【這一段發生的事】\n' + st.narr.facts.map(function (f) { return '・' + f; }).join('\n'));
  var kind = st.narr.kind;
  if (kind === 'supply') {
    lines.push(sealGenderFact_(st.master.sex, (seed && seed.gender) || '', sv.name));
    lines.push('★【' + WAR_LEN_.supply + ' 字】寫這場補魔：魔力流動只是成因，全篇寫在肉體這一側——接觸、溫度、反應。' + LEWD_EXPLICIT_);
  } else if (kind === 'over') {
    lines.push('★【' + WAR_LEN_.over + ' 字】這是這場聖杯戰爭的結局，寫出它的重量。' + (st.result && st.result.win ? '聖杯在你面前，照你心裡的那個願望寫這一刻，把你們一路走來的樣子寫進最後這一幕。' : '寫這一場戰爭怎麼在你手裡結束。'));
  } else {
    lines.push('★篇幅 ' + (WAR_LEN_[kind] || WAR_LEN_.day) + ' 字。');
  }
  return lines.join('\n');
}
