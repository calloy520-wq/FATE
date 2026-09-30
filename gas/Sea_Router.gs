// 航海的對外入口：登入、每一回合（打字 → 翻成動作 → 引擎執行 → 副官回話 → 存檔）、重新開始。
// 存檔：分頁「航海存檔」每個帳號一列（帳號｜整份狀態 JSON｜更新時間）；分頁「航海日誌」每回合加一列。

var SEA_SAVE_SHEET_ = '航海存檔', SEA_LOG_SHEET_ = '航海日誌';

function seaApi(payload) {
  try {
    var p = payload || {}, name = String(p.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
    if (!name) return JSON.stringify({ ok: false, msg: '先輸入船長的名字。' });
    if (p.act === 'login') return JSON.stringify(seaLogin_(name));
    if (p.act === 'reset') return JSON.stringify(seaReset_(name));
    if (p.act === 'turn') return JSON.stringify(seaTurn_(name, String(p.text || '').slice(0, 300), p.seq));
    return JSON.stringify({ ok: false, msg: '不認得的動作。' });
  } catch (e) {
    try { Logger.log('[seaApi] ' + e.stack); } catch (e2) { }
    return JSON.stringify({ ok: false, msg: '出了點狀況：' + e.message });
  }
}

// ── 存檔 ──────────────────────────────────────────────
function seaSheet_(nm, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(nm);
  if (!sh) { sh = ss.insertSheet(nm); sh.appendRow(head); sh.setFrozenRows(1); }
  return sh;
}
function seaRow_(sh, name) {
  var n = sh.getLastRow(); if (n < 2) return 0;
  var col = sh.getRange(2, 1, n - 1, 1).getDisplayValues();
  for (var i = 0; i < col.length; i++) if (col[i][0] === name) return i + 2;
  return 0;
}
function seaLoadState_(name) {
  var sh = seaSheet_(SEA_SAVE_SHEET_, ['帳號', '狀態', '更新時間']), r = seaRow_(sh, name);
  if (!r) return null;
  try { return JSON.parse(sh.getRange(r, 2).getValue()); } catch (e) { return null; }
}
function seaSaveState_(name, st) {
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = seaSheet_(SEA_SAVE_SHEET_, ['帳號', '狀態', '更新時間']), r = seaRow_(sh, name), json = JSON.stringify(st);
    while (json.length > 48000 && st.ledger.length > 20) { st.ledger.splice(0, 20); json = JSON.stringify(st); }   // 一格上限五萬字：先砍最舊的帳
    if (!r) { r = sh.getLastRow() + 1; sh.getRange(r, 1).setNumberFormat('@'); }
    sh.getRange(r, 1, 1, 3).setValues([[name, json, new Date()]]);
  } finally { lock.releaseLock(); }
}
function seaLog_(name, st, text, reply, results) {
  try { seaSheet_(SEA_LOG_SHEET_, ['時間', '帳號', '遊戲日期', '船長', '葉嵐', '結果']).appendRow([new Date(), name, seaDate_(st.day), text, reply, JSON.stringify(results)]); } catch (e) { }
}

// ── 登入／重來 ────────────────────────────────────────
function seaLogin_(name) {
  var st = seaLoadState_(name), fresh = !st;
  if (!st) { st = seaNewGame_(name); st.recent.push({ u: '', a: seaOpening_(st) }); seaSaveState_(name, st); }
  return { ok: true, fresh: fresh, seq: st.seq, view: seaView_(st) };
}
function seaReset_(name) {
  var st = seaNewGame_(name); st.recent.push({ u: '', a: seaOpening_(st) }); seaSaveState_(name, st);
  return { ok: true, fresh: true, seq: st.seq, view: seaView_(st) };
}
function seaOpening_(st) {
  return '（' + SEA_MATE_.name + '把帳本往船舷上一拍）船長，' + seaDate_(st.day) + '，泉州港。「' + st.ship.name + '」是艘' + st.ship.type
    + '，貨艙 ' + st.ship.cap + ' 箱，船員 ' + st.ship.crew + ' 人，糧水 ' + seaSupplyDays_(st) + ' 天份，現銀 ' + st.gold + ' 兩——就這麼多家當。想先做什麼？買貨、出航、問行情，直接跟我說就行。';
}

// ── 一回合 ────────────────────────────────────────────
function seaTurn_(name, text, seq) {
  text = text.replace(/[\u0000-\u001f]/g, ' ').trim();
  if (!text) return { ok: false, msg: '想做什麼，打字告訴葉嵐。' };
  var st = seaLoadState_(name);
  if (!st) return { ok: false, msg: '找不到存檔，重新整理一下。' };
  if (seq !== undefined && seq !== st.seq) return { ok: false, msg: '畫面不是最新的，重新整理一下。', stale: true };
  var models = aiModels_();
  var plan = aiJson_(SEA_PARSE_SYS_, seaParsePrompt_(st, text), { model: models.parse, temperature: 0.1, max_tokens: 500 });
  if (!plan) return { ok: false, msg: '海風太大，葉嵐沒聽清楚（AI 沒有回應），再說一次。' };
  var results = seaApply_(st, seaCleanActs_(plan.actions));
  var memo = String(plan.memo || '').replace(/[<>]/g, '').trim().slice(0, 80);
  if (memo) { st.notes.push({ d: st.day, txt: memo }); if (st.notes.length > SEA_RULE_.NOTES_KEEP) st.notes.shift(); }
  var goods = [].concat(plan.goods || [], (plan.actions || []).map(function (a) { return a && a.good; })).map(seaGood_).filter(Boolean);
  var reply = seaTalk_(st, text, results, goods, models.talk);
  st.recent.push({ u: text, a: reply }); if (st.recent.length > SEA_RULE_.RECENT_TURNS) st.recent.shift();
  st.seq++;
  seaSaveState_(name, st);
  seaLog_(name, st, text, reply, results);
  return { ok: true, seq: st.seq, reply: reply, results: results, view: seaView_(st) };
}
// AI 給的動作只收認得的種類與欄位（其餘丟掉），數字欄位轉成數字。
function seaCleanActs_(acts) {
  var keep = { buy: ['good', 'qty', 'budget'], sell: ['good', 'qty'], sail: ['to'], repair: [], supply: ['days'], hire: ['n'], fire: ['n'],
    buy_ship: ['ship', 'name'], rename: ['name'], wait: ['days'] };
  return (Array.isArray(acts) ? acts : []).filter(function (a) { return a && keep[a.type]; }).slice(0, 6).map(function (a) {
    var o = { type: a.type };
    keep[a.type].forEach(function (k) { if (a[k] === undefined || a[k] === null || a[k] === '') return; var v = a[k]; o[k] = /^\d+$/.test(String(v)) ? parseInt(v, 10) : String(v).slice(0, 20); });
    return o;
  });
}

var SEA_PARSE_SYS_ = [
  '你是航海遊戲的指令翻譯。把船長這句話翻成遊戲動作 JSON，不寫故事、不回答問題。',
  '可用的動作（照船長說的先後排）：',
  'buy {good, qty:數字 或 "max"} 或 {good, budget:兩}｜sell {good, qty:數字 或 "all"}｜sail {to:港口}｜repair {}｜supply {days:數字 或 "full"}',
  'hire {n}｜fire {n}｜buy_ship {ship:船型, name:新船名(可省)}｜rename {name}｜wait {days}',
  '規則：',
  '1. 船長明確說要做才輸出動作；只是問問題、問價錢、問帳、閒聊、猶豫、說「考慮一下」→ actions 給空陣列。',
  '2. 貨名、港口、船型只能從清單裡選；清單沒有的就不要輸出那個動作。',
  '3. 船長交代要記住的事（約定、計畫、偏好、遇到的人名）寫進 memo，一句話；沒有就空字串。',
  '4. 船長提到或問到的貨名放進 goods 陣列（查帳用）。',
  '只輸出：{"actions":[…],"memo":"","goods":[]}'
].join('\n');

function seaParsePrompt_(st, text) {
  var s = st.ship;
  return ['【清單】貨：' + Object.keys(SEA_GOODS_).join('、') + '｜港口：' + Object.keys(SEA_PORTS_).join('、') + '｜船型：' + Object.keys(SEA_SHIPS_).join('、'),
    '【現在】' + (st.port ? '停在' + st.port : '在海上') + '；船「' + s.name + '」' + s.type + '；現銀 ' + st.gold + ' 兩；貨艙 ' + seaLoad_(st) + '／' + s.cap + ' 箱'
      + (st.cargo.length ? '（' + seaCargoStr_(st) + '）' : '（空）'),
    st.recent.length ? '【上一句】船長：' + (st.recent[st.recent.length - 1].u || '（開場）') + '／葉嵐：' + String(st.recent[st.recent.length - 1].a).slice(0, 120) : '',
    '【船長說】' + text].filter(Boolean).join('\n');
}
function seaCargoStr_(st) {
  var sum = {};
  st.cargo.forEach(function (l) { sum[l.good] = (sum[l.good] || 0) + l.qty; });
  return Object.keys(sum).map(function (g) { return g + ' ' + sum[g] + ' 箱'; }).join('、');
}

var SEA_TALK_SYS_ = [
  '你是「' + SEA_MATE_.name + '」，船長的副官。' + SEA_MATE_.card,
  '你正在跟船長說話。規則：',
  '1. 【這回合結果】是剛剛真的發生的事，照實告訴船長；寫著失敗的，就說沒做成、為什麼，再給一個建議。',
  '2. 結果裡沒有的交易、航行、價格都沒有發生，只能當作建議或提醒來講。',
  '3. 數字只能用下面資料裡出現過的，一律寫阿拉伯數字；資料裡找不到的數字就不要講。',
  '4. 船長問帳、問價、問船況，先從【帳本】【貨艙】【船】【本港行情】找答案，照著念。',
  '5. 用葉嵐的口吻對話，可以夾一兩句括號裡的小動作。60～180 字。',
  '6. 決定權在船長；你可以提醒風險和機會，不替船長下決定。',
  '只輸出：{"reply":"……"}'
].join('\n');

function seaTalkPrompt_(st, text, results, goods) {
  var s = st.ship, L = [];
  L.push('【船長】' + st.name);
  L.push('【現在】' + seaDate_(st.day) + '，' + (st.port ? '停在' + st.port + '（' + SEA_PORTS_[st.port].note + '）' : '在海上'));
  L.push('【船】' + s.type + '「' + s.name + '」：耐久 ' + s.hull + '／' + s.hullMax + '、貨艙 ' + s.cap + ' 箱、船速 ' + s.speed + '、砲門 ' + s.guns + '、船員 ' + s.crew + '／' + s.crewMax + ' 名（至少 ' + s.crewMin + ' 名）；'
    + seaDate_(s.bought.day) + '在' + s.bought.port + '以 ' + s.bought.price + ' 兩買下' + (s.log.length ? '；' + s.log.slice(-4).map(function (x) { return seaDate_(x.d) + x.txt; }).join('；') : ''));
  L.push('【現銀】' + st.gold + ' 兩｜【糧水】' + seaSupplyDays_(st) + ' 天份');
  L.push('【貨艙】' + seaLoad_(st) + '／' + s.cap + ' 箱' + (st.cargo.length ? '：' + st.cargo.map(function (l) { return l.good + ' ' + l.qty + ' 箱（' + seaDate_(l.d) + '在' + l.port + '進貨，一箱 ' + l.cost + ' 兩）'; }).join('；') : '，空的'));
  if (st.port) L.push('【本港行情】買價／賣價（兩／箱）：' + Object.keys(SEA_GOODS_).map(function (g) { return g + ' ' + seaPrice_(st, st.port, g, 0) + '／' + seaSellPrice_(st, st.port, g, 0); }).join('、')
    + '｜船廠：' + (SEA_PORTS_[st.port].ships || []).map(function (t) { return t + ' ' + SEA_SHIPS_[t].price + ' 兩'; }).join('、')
    + '｜航程：' + Object.keys(SEA_PORTS_).filter(function (p) { return p !== st.port && seaRoute_(st.port, p); }).map(function (p) { return p + ' ' + Math.max(1, Math.ceil(seaRoute_(st.port, p) * 5 / s.speed)) + ' 天'; }).join('、'));
  var asksBook = /帳|買過|賣過|成本|花了|賺|賠|上次|之前/.test(text);
  var rel = st.ledger.filter(function (e) { return goods.length ? goods.indexOf(e.good) >= 0 : true; });
  var lines = (goods.length || asksBook ? rel.slice(-12) : st.ledger.slice(-5)).map(seaLedgerLine_);
  if (lines.length) L.push('【帳本】' + lines.join('；'));
  if (st.notes.length) L.push('【船長交代過的事】' + st.notes.slice(-10).map(function (n) { return seaDate_(n.d) + '：' + n.txt; }).join('；'));
  L.push('【總資產】' + seaAssets_(st) + ' 兩（目標 ' + SEA_GOAL_ + ' 兩）');
  if (st.recent.length) L.push('【最近的對話】\n' + st.recent.slice(-4).map(function (r) { return (r.u ? '船長：' + r.u + '\n' : '') + '葉嵐：' + r.a; }).join('\n'));
  L.push('【這回合結果】' + (results.length ? results.map(function (r) { return (r.ok ? '' : '（沒做成）') + r.txt; }).join('｜') : '沒有執行任何動作（船長在說話或發問）'));
  L.push('【船長說】' + text);
  return L.join('\n');
}

// 副官回話：數字不在資料裡就退回重寫一次；再不行就改用程式寫的結果（數字絕不出錯）。
function seaTalk_(st, text, results, goods, model) {
  var prompt = seaTalkPrompt_(st, text, results, goods);
  for (var i = 0; i < 2; i++) {
    var out = aiJson_(SEA_TALK_SYS_, prompt + (i ? '\n【注意】上一次你講了資料裡沒有的數字。只能用資料裡出現過的數字。' : ''), { model: model, temperature: 0.8, max_tokens: 700 });
    var reply = out && String(out.reply || '').trim();
    if (reply && seaNumbersOk_(reply, prompt)) return reply.slice(0, 600);
  }
  return '（' + SEA_MATE_.name + '翻開帳本念給你聽）' + (results.length ? results.map(function (r) { return r.txt; }).join('') : '船長，剛剛那句我沒聽清楚，再說一次？');
}
// 回話裡的每個數字都要在資料（提示詞）裡出現過。
function seaNumbersOk_(reply, source) {
  var have = {};
  (String(source).match(/\d+/g) || []).forEach(function (n) { have[String(parseInt(n, 10))] = 1; });
  return (String(reply).match(/\d+/g) || []).every(function (n) { return have[String(parseInt(n, 10))]; });
}
