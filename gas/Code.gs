// 網頁入口：封魔錄（東方仙俠的卡牌冒險）。遊戲規則全在 Game.html、跑在玩家的瀏覽器裡。
// 伺服器只做一件事：帳號（只要帳號名稱）與存檔。存在這個專案綁定的試算表「聖杯之路帳號」分頁，換裝置也接得上。
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('封魔錄')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

var GP_SHEET = '聖杯之路帳號';   // 分頁名沿用舊版（帳號資料都在這裡，不能改名）；「密碼雜湊」欄現在只用來算通行碼
var GP_COL = { NAME: 0, SALT: 1, HASH: 2, CREATED: 3, UPDATED: 4, META: 5, RUN: 6, RUNTS: 7 };   // META＝戰績、圖鑑、解鎖、設定；RUN＝進行中的一局；RUNTS＝那一局最後一次變動的時間（舊的不能蓋新的）
var GP_CELL_MAX = 49000;   // 試算表一格最多五萬字

function gpSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(GP_SHEET);
  if (!sh) { sh = ss.insertSheet(GP_SHEET); sh.appendRow(['帳號', '鹽', '密碼雜湊', '建立', '更新', '資料', '進行中', '進行中時間']); sh.getRange('A:A').setNumberFormat('@'); }
  return sh;
}
function gpHash_(salt, text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
// 登入後拿到的通行碼：由帳號與「密碼雜湊」那一格算出來，不用另外存
function gpToken_(name, hash) { return gpHash_('token', name + '|' + hash); }
// 找帳號在第幾列：先看快取（列不會刪，只會往下加），讀到的那列名字不對再整欄找
function gpFind_(sh, name) {
  var cache = CacheService.getScriptCache(), key = 'row:' + name, hit = +cache.get(key);
  if (hit >= 2 && hit <= sh.getLastRow() && gpName_(sh.getRange(hit, 1).getValue()) === name) return hit;
  var n = sh.getLastRow(); if (n < 2) return 0;
  var names = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < names.length; i++) if (gpName_(names[i][0]) === name) { try { cache.put(key, String(i + 2), 21600); } catch (e) { } return i + 2; }
  return 0;
}
// 帳號名稱：全形半形一致（NFKC）、拿掉看不見的字與空白、開頭不能是 = + - @（試算表會當成公式）
function gpName_(name) {
  var s = String(name || ''); try { s = s.normalize('NFKC'); } catch (e) { }
  return Array.from(s.replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g, '').replace(/[\s<>"'&]/g, '').replace(/^[=+\-@]+/, '')).slice(0, 16).join('');
}
// 戰績合併：兩個分頁、兩台裝置都在存，不能誰蓋掉誰——數字取大、清單取聯集；新手提示與造型照最新的
function gpTagScore_(t) { return !t ? -1 : (t === '封魘' || t === '斬心魔') ? 99 : t === '通關' ? 50 : (String(t).indexOf('第二章') === 0 ? 20 : 0) + (parseInt(String(t).replace(/^.*第 /, ''), 10) || 0); }
function gpMerge_(a, b, key) {
  if (key === 'tips' || key === 'skin') return b === undefined ? a : b;
  if (b === undefined || b === null) return a;
  if (a === undefined || a === null) return b;
  if (key === 'best' && typeof a === 'object' && typeof b === 'object') { var o0 = {}; Object.keys(a).forEach(function (k) { o0[k] = a[k]; }); Object.keys(b).forEach(function (k) { if (gpTagScore_(b[k]) >= gpTagScore_(o0[k])) o0[k] = b[k]; }); return o0; }
  if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
  if (Array.isArray(a) && Array.isArray(b)) { var o1 = a.slice(); b.forEach(function (x) { if (o1.indexOf(x) < 0) o1.push(x); }); return o1; }
  if (typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) { var o = {}; Object.keys(a).forEach(function (k) { o[k] = a[k]; }); Object.keys(b).forEach(function (k) { o[k] = gpMerge_(a[k], b[k], k); }); return o; }
  return b;
}

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
      sh.appendRow([name, salt, hash, now, now, '', '', 0]);
      try { CacheService.getScriptCache().put('row:' + name, String(sh.getLastRow()), 21600); } catch (e) { }
      return { ok: true, created: true, name: name, token: gpToken_(name, hash), meta: null, run: null, runTs: 0 };
    }
    var v = sh.getRange(row, 1, 1, 8).getValues()[0];
    return { ok: true, name: name, token: gpToken_(name, v[GP_COL.HASH]), meta: v[GP_COL.META] || null, run: v[GP_COL.RUN] || null, runTs: +v[GP_COL.RUNTS] || 0 };
  } finally { lock.releaseLock(); }
}
// 用通行碼重新登入（記住我）
function gpResume(name, token) {
  name = gpName_(name);
  var sh = gpSheet_(), row = gpFind_(sh, name); if (!row) return { ok: false, msg: '沒有這個帳號' };
  var v = sh.getRange(row, 1, 1, 8).getValues()[0];
  if (gpToken_(name, v[GP_COL.HASH]) !== token) return { ok: false, msg: '請重新登入' };
  return { ok: true, name: name, token: token, meta: v[GP_COL.META] || null, run: v[GP_COL.RUN] || null, runTs: +v[GP_COL.RUNTS] || 0 };
}
// 存檔：meta、run 都是字串（run＝'' 代表這局結束了）；傳 null 的那一格不動
// 一次讀整列、一次寫回（以前一次存檔要叫試算表八次）；鎖只鎖這一下，搶不到就請瀏覽器等一下再送
// meta：跟伺服器上的合併（數字取大、清單聯集）；run：帶著最後變動的時間 runTs，比伺服器上的舊就不寫（別的分頁、裝置已經往前玩了）
function gpSave(name, token, meta, run, runTs) {
  name = gpName_(name);
  var lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return { ok: false, busy: true, msg: '伺服器忙，等一下再存' };
  try {
    var sh = gpSheet_(), row = gpFind_(sh, name); if (!row) return { ok: false, msg: '沒有這個帳號' };
    var v = sh.getRange(row, 1, 1, 8).getValues()[0];
    if (gpToken_(name, v[GP_COL.HASH]) !== token) return { ok: false, msg: '請重新登入' };
    var outMeta = v[GP_COL.META], outRun = v[GP_COL.RUN], outTs = +v[GP_COL.RUNTS] || 0, stale = false;
    if (meta != null) {
      var a = null, b = null; try { a = outMeta ? JSON.parse(outMeta) : null; } catch (e) { } try { b = JSON.parse(meta); } catch (e) { }
      outMeta = b && a ? JSON.stringify(gpMerge_(a, b, '')) : String(meta);
      if (outMeta.length > GP_CELL_MAX) return { ok: false, msg: '資料太大' };
    }
    if (run != null) {
      if (String(run).length > GP_CELL_MAX) return { ok: false, msg: '存檔太大' };
      if (+runTs && outTs && +runTs < outTs) stale = true;   // 比較舊的那一局：不蓋
      else { outRun = String(run); outTs = +runTs || Date.now(); }
    }
    sh.getRange(row, GP_COL.UPDATED + 1, 1, 4).setValues([[new Date(), outMeta, outRun, outTs]]);
    return { ok: true, stale: stale };
  } finally { lock.releaseLock(); }
}

// 對局紀錄：每局結束記一列（真人的勝率、死在哪、主修選了什麼），調平衡用。新分頁「對局紀錄」
var GP_LOG = '對局紀錄';
var GP_LOG_HEAD = ['時間', '帳號', '角色', '主修', '第一章後', '難度', '模式', '機緣', '結果', '章', '列', '走過格數', '死在', '戰鬥', '牌組張數', '法寶數', '最大生命', '擊敗', '神通次數', '丹藥'];
function gpLog(name, token, d) {
  name = gpName_(name);
  var sh = gpSheet_(), row = gpFind_(sh, name); if (!row) return { ok: false };
  if (gpToken_(name, sh.getRange(row, GP_COL.HASH + 1).getValue()) !== token) return { ok: false };
  d = d || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet(), lg = ss.getSheetByName(GP_LOG);
  if (!lg) { lg = ss.insertSheet(GP_LOG); lg.appendRow(GP_LOG_HEAD); lg.setFrozenRows(1); }
  var cut = function (x) { var s = String(x == null ? '' : x).slice(0, 80); return /^[=+\-@]/.test(s) ? "'" + s : s; };   // 開頭是 = + - @ 的會被試算表當成公式，前面加 ' 當純文字
  lg.appendRow([new Date(), cut(name), cut(d.who), cut(d.major), cut(d.second), cut(d.diff), cut(d.mode), cut(d.fates), cut(d.result), +d.act || 0, +d.floor || 0, +d.floors || 0,
    cut(d.killer), cut(d.kind), +d.deck || 0, +d.relics || 0, +d.maxHp || 0, +d.kills || 0, +d.np || 0, +d.pills || 0]);
  return { ok: true };
}

// 排行榜：彙整每個帳號的戰績（無盡最遠、通關次數）。大家一起看同一份，快取一分鐘
function gpBoardRow_(name, m) {
  if (!m || !m.stats) return null;
  var e = m.stats.endless || {}, who = '', best = 0;
  Object.keys(e).forEach(function (k) { if (e[k] > best) { best = e[k]; who = k; } });
  var num = function (x) { x = Math.floor(Number(x) || 0); return x > 0 ? Math.min(x, 1e6) : 0; };   // 存檔是瀏覽器送來的：只認數字
  return { name: name, endless: num(best), who: who, wins: num(m.stats.wins), trueEnds: num(m.stats.trueEnds), runs: num(m.stats.runs) };
}
function gpBoard() {
  var cache = CacheService.getScriptCache(), hit = cache.get('gp_board');
  if (hit) return JSON.parse(hit);
  var sh = gpSheet_(), n = sh.getLastRow(), list = [];
  if (n >= 2) sh.getRange(2, 1, n - 1, GP_COL.META + 1).getValues().forEach(function (v) {
    var m = null; try { m = v[GP_COL.META] ? JSON.parse(v[GP_COL.META]) : null; } catch (e) { }
    var r = gpBoardRow_(String(v[GP_COL.NAME]), m); if (r && (r.endless || r.wins)) list.push(r);
  });
  var top = function (k) { return list.slice().sort(function (x, y) { return y[k] - x[k]; }).slice(0, 60); };   // 只回兩個榜的前段
  var pickd = {}, short = top('endless').concat(top('wins')).filter(function (r) { if (pickd[r.name]) return false; pickd[r.name] = 1; return true; });
  var out = { ok: true, list: short };
  try { cache.put('gp_board', JSON.stringify(out), 60); } catch (e) { }
  return out;
}
