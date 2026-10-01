// 網頁入口：聖杯之路（Fate 題材的卡牌冒險）。遊戲規則全在 Game.html、跑在玩家的瀏覽器裡。
// 伺服器只做一件事：帳號（只要帳號名稱）與存檔。存在這個專案綁定的試算表「聖杯之路帳號」分頁，換裝置也接得上。
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('聖杯之路')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

var GP_SHEET = '聖杯之路帳號';   // 「密碼雜湊」欄現在只用來算通行碼
var GP_COL = { NAME: 0, SALT: 1, HASH: 2, CREATED: 3, UPDATED: 4, META: 5, RUN: 6 };   // META＝聖晶石、解鎖、命座、戰績；RUN＝進行中的一局
var GP_CELL_MAX = 49000;   // 試算表一格最多五萬字

function gpSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(GP_SHEET);
  if (!sh) { sh = ss.insertSheet(GP_SHEET); sh.appendRow(['帳號', '鹽', '密碼雜湊', '建立', '更新', '資料', '進行中']); sh.getRange('A:A').setNumberFormat('@'); }
  return sh;
}
function gpHash_(salt, text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
// 登入後拿到的通行碼：由帳號與「密碼雜湊」那一格算出來，不用另外存
function gpToken_(name, hash) { return gpHash_('token', name + '|' + hash); }
function gpFind_(sh, name) {
  var n = sh.getLastRow(); if (n < 2) return 0;
  var names = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < names.length; i++) if (String(names[i][0]) === name) return i + 2;
  return 0;
}
function gpName_(name) { return String(name || '').replace(/[\s<>"'&]/g, '').slice(0, 16); }

// 登入：只要帳號，不用密碼；沒有這個帳號就直接建立。回傳 { ok, token, name, meta, run, created }
// （以前建立的帳號有密碼雜湊，現在不再檢查；通行碼仍由那一格算出，所以「記住我」照樣有效）
function gpLogin(name) {
  name = gpName_(name);
  if (!name) return { ok: false, msg: '先輸入帳號' };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = gpSheet_(), row = gpFind_(sh, name);
    if (!row) {
      var salt = Utilities.getUuid(), hash = gpHash_(salt, ''), now = new Date();
      sh.appendRow([name, salt, hash, now, now, '', '']);
      return { ok: true, created: true, name: name, token: gpToken_(name, hash), meta: null, run: null };
    }
    var v = sh.getRange(row, 1, 1, 7).getValues()[0];
    return { ok: true, name: name, token: gpToken_(name, v[GP_COL.HASH]), meta: v[GP_COL.META] || null, run: v[GP_COL.RUN] || null };
  } finally { lock.releaseLock(); }
}
// 用通行碼重新登入（記住我）
function gpResume(name, token) {
  name = gpName_(name);
  var sh = gpSheet_(), row = gpFind_(sh, name); if (!row) return { ok: false, msg: '沒有這個帳號' };
  var v = sh.getRange(row, 1, 1, 7).getValues()[0];
  if (gpToken_(name, v[GP_COL.HASH]) !== token) return { ok: false, msg: '請重新登入' };
  return { ok: true, name: name, token: token, meta: v[GP_COL.META] || null, run: v[GP_COL.RUN] || null };
}
// 存檔：meta、run 都是字串（run＝'' 代表這局結束了）；傳 null 的那一格不動
function gpSave(name, token, meta, run) {
  name = gpName_(name);
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = gpSheet_(), row = gpFind_(sh, name); if (!row) return { ok: false, msg: '沒有這個帳號' };
    var hash = sh.getRange(row, GP_COL.HASH + 1).getValue();
    if (gpToken_(name, hash) !== token) return { ok: false, msg: '請重新登入' };
    if (meta != null) { if (String(meta).length > GP_CELL_MAX) return { ok: false, msg: '資料太大' }; sh.getRange(row, GP_COL.META + 1).setValue(String(meta)); }
    if (run != null) { if (String(run).length > GP_CELL_MAX) return { ok: false, msg: '存檔太大' }; sh.getRange(row, GP_COL.RUN + 1).setValue(String(run)); }
    sh.getRange(row, GP_COL.UPDATED + 1).setValue(new Date());
    return { ok: true };
  } finally { lock.releaseLock(); }
}

// 排行榜：彙整每個帳號的戰績（無盡最遠、通關次數）。大家一起看同一份，快取一分鐘
function gpBoardRow_(name, m) {
  if (!m || !m.stats) return null;
  var e = m.stats.endless || {}, who = '', best = 0;
  Object.keys(e).forEach(function (k) { if (e[k] > best) { best = e[k]; who = k; } });
  return { name: name, endless: best, who: who, wins: m.stats.wins || 0, trueEnds: m.stats.trueEnds || 0, runs: m.stats.runs || 0 };
}
function gpBoard() {
  var cache = CacheService.getScriptCache(), hit = cache.get('gp_board');
  if (hit) return JSON.parse(hit);
  var sh = gpSheet_(), n = sh.getLastRow(), list = [];
  if (n >= 2) sh.getRange(2, 1, n - 1, GP_COL.META + 1).getValues().forEach(function (v) {
    var m = null; try { m = v[GP_COL.META] ? JSON.parse(v[GP_COL.META]) : null; } catch (e) { }
    var r = gpBoardRow_(String(v[GP_COL.NAME]), m); if (r && (r.endless || r.wins)) list.push(r);
  });
  var out = { ok: true, list: list };
  try { cache.put('gp_board', JSON.stringify(out), 60); } catch (e) { }
  return out;
}
