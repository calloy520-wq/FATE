// 網頁入口：封魔錄（東方仙俠的戰棋，2026-10-08 起照機器人大戰的玩法）。遊戲規則全在 Game.html、跑在玩家的瀏覽器裡。
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
function gpOldName_(name) { return String(name || '').replace(/[\s<>"'&]/g, '').slice(0, 16); }   // 改版前的整理方式（舊帳號用）
function gpFind_(sh, name, raw) {
  var old = raw != null ? gpOldName_(raw) : null, cache = CacheService.getScriptCache(), key = 'row:' + (old != null ? old : name), hit = +cache.get(key);
  var exact = function (cell) { return String(cell) === (old != null ? old : name); };   // 存的名字跟輸入的一字不差：一定是這列
  if (hit >= 2 && hit <= sh.getLastRow() && exact(sh.getRange(hit, 1).getValue())) return hit;
  var n = sh.getLastRow(); if (n < 2) return 0;
  var names = sh.getRange(2, 1, n - 1, 1).getValues(), loose = 0;
  for (var i = 0; i < names.length; i++) {
    if (exact(names[i][0])) { try { cache.put(key, String(i + 2), 21600); } catch (e) { } return i + 2; }
    if (!loose && gpName_(names[i][0]) === name) loose = i + 2;   // 全形半形不同、開頭多了符號的舊帳號：沒有一字不差的才用它
  }
  return loose;
}
// 帳號名稱：全形半形一致（NFKC）、拿掉看不見的字與空白、開頭不能是 = + - @（試算表會當成公式）
function gpName_(name) {
  var s = String(name || ''); try { s = s.normalize('NFKC'); } catch (e) { }
  return Array.from(s.replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g, '').replace(/[\s<>"'&]/g, '').replace(/^[=+\-@]+/, '')).slice(0, 16).join('');
}
// 新帳號只能用繁體中文、2 到 10 個字（玩家定）：一 0x4E00～0x9FA5 的漢字裡，Big5 收得到的才算（簡化字這套碼表沒有）
var GP_TRAD = 'i/9zw0BoDxus6UzzAAIIwFx5Psp2eUgG3y/w9zoD/6g37z8jBLBZ/crz//+f3vn//6v3fQDA7I6/7tv/A9D6ReH6/t/vv6sQ6/+q/D/v/SSteHZ/DPD/7fbP+iz592vr/R+/lXdmv7/7O7T+rnviEYGmvkE1FMNycH2RcQMAayfLV89wMkfvDdp+dPwG/rS9nz/Ki0l+AFiPIuzrXIq73WDv57YPpJPyuzeeVEvQr5sUxNT3sDAUCggv0Ih+/y8Z2v8H+/F/63vvxRAA/5n//dd5ZwXn/8v9/8NAQPdvjr3635cEwPT/W3vt59B+BOD4n/8+t/59Loj9/3++/oPE9lfz/biA1n3vZ1eIR33/38P/8Kk34H38cG8/muyzTIGGnj9c3Q33GUij/gcAVq//OA2YuO89QGC3ztg1kL9y/z/3fxF6u/f/qwD/vm88qXL+788b8WvbCvzmw37vnJsQ9kjw9Ba1/oJRsce7FYdu3/s/5M1j/8F+fuv9X317d/78C5bq2yli6FPfN+/99TaBvRjcvfzk0v//1z/g/29/+K+um9lu+/UV8al5+708Wq+tutusH/xxeYP3fF/D/99nBZr/Z4Q0FYvf8/lzM733Gl5Avz+g///rAcDf3c8AddOrw/jW7v1D/7evXidCrJuG9tcnvPaH97c1zap24edJn+JcVPKvPyvYYTv8uLvP/317lb/gHP19/0P2X/7/79POxLaNvK3cY+sRWd/QI7S+2/PnH8fbY//k+iuy92M77bqtAf7/fvf/vAL/Mj3v/P8FgPt39bwNAff/+/86v1cA/9977329iNvUyPP/fO3uXf9WDX5frJb/f9XuP0DB+W/n/5t3d46/bl3kz28fX3/g3/7b1/4BAP97+9T/3x8A+P//j/t7AAC/XH////MHoOvnPb/31/u//wNg/f/tv7vvfwJA/v3d//354gtoH/vj+/2vpJ/t9316D/i+7tUPXbuf/dvy+Tt//szraof6c/yV/J+fEPf6t93Nu374zexm8z88/f8/sPfpfgaulgb+dtXXX9E/86MHz7dv0Z9Ef1l73dM7r72pz306/+D76/YBtP//+nq/twDA/Q9//x///P7/lQAA3LVj7z4/f/sbAADo9vvvnt+4n/8/ANB7//Xb3/8/8P2/ACCEvbs3397/bf/zD0xg+177//v6Xv4ZAvR53vn3p/rr6wE0/9Prc+/Xr0DAu3L/3H/x2C/suAv+o90LHx2Pz0crsd7/7n9z2v8kxMtd9/LL/ezttPm/3U3dmY37f7t7r/vdWclP/LX6469fbf//fT8AeNv//7b/fq/7LwKb/8fvpf///wcAAMf/9/H//X+/AQDcvP31v///f///PikAAL7/+X//+25+/f/LngMA4937/8zf9v//fxEA+Pb77+c81+/+798LwL/t3/7N/fV7/UD//1+33/8w+d/7l9zz/vK/34+/338X5u1/D1M1fER+hxL6u0Xg7Z53F4DZv1V+id5vwUcE3npd9/9XBSn3hpX+s5cv8//PdZ/3cRf77jQZ7sw3Ye/Wn0zvj9bd+3N7723+1zGkf17Xl1sP2P+Dnc577CL/3D12h+/n3+39/0/8oHc7/NvtPdx/qW9w9fs/QCx//3+EV+y33pzmL/LrD7XV66/n7S+M8P9/U/Donbn/tWb/j+eB2RC+fJzB49GcMye8DG3/t/y379+g//8Lv3v+/6M/NcwTzZc3dif71s9sflDsMe18Zxz8+va/X7oPL66to/5/8Px03u//APK/+6L+rz3/vJT2uV+t848/bPIfoO//vwEodwVwNf8D2vvS+se/Px1cOv8z7K+3nP42Up96+r8i5/ef//y7Lx22Bu39Hdd93+8j62bx2X7ADT09v99FyYO60X3QnYd7c8/zn/XDDd/+xbMMAoN56MCuc8cPb339Pwnx/1cB+2L/AbT98zsTsLJD014w//8Pn+vv/gPy7z+J+6k3mZ753iynMzf2wa6BPv4gXffyhdXXaf////8H22///8R/2c7vD7578V7wz/a3//dehO/L198OCP///D/u////E//XD6/9f8e9+h8AAAAAAAAAAAAAAAAAAAAAAABA5zi9M/nrf+3+6H92fPez7/+v/rfYb/+/+/v499tSF/niyIVHdZCQ7+P0nm0/Lu42Bbz38397oD9/ZwVg6766AWbY/D9Y98rfh82/oP/NW7/+/ban7+93nN+3P3f4J538t7XK799a+7bxOewf77/7+38NAP7a+71/Tv8zwFr1v/6fv/9fAAAA+P3K//1v/c8BoP/f8vu/33//2v4PCAi6/7/9etfu6/v5Z0Tgk/+X31ef9/7fCIDf3/7F//73+/8DaPtn+mv/f+Jf//9z/9+H++f966f3fr/H7/Megt//dn7fyXl92r7vmx7gfPt3vof7//8b2/9cP+BP/38OX/93v91P8P/////4D76j3/0c/P3/fR+e+/+93N5vP/u6f9/v+xt97C6Or/fyD3vuz5YdxncH/vX/gtnff+Ze/8fu/u95VprP/1/+Xt5uiej5XvTE5gEAfL5/O9/dndXv6aw0U95z9fdLT3v/nv64bkf7DUX//av++9fp/9337f9//d3rfufP/7fpvZHvdV181wAAAAAAAAAAAAAAAAAAAAAAAID67v/xtHa/7y93tr93v5/9/7+Vrvb/dTt/9af5CgAAAAAAAAAA0PvdKzP2f5qr/fzW5vnrv9/fH/T9pv///0p787d/+f7/tlwd9n//5XsfBCQFvp7549vy3+9v//151vzL/ev/7x8AAAAAAACYSOEXgHRq/gB/bfH9f7jz/h/gdvGW7j97jev9//+ts8vvhH/hqk3wvz+/P/7/69f/3/9/z/v/7YU/17wH/64P/q/9v3bv+rs33H+6o/+291b4YN/nYf/fTPuwRf/tffo//x/8Gv//r+PTx4PfV/t97//veBPA/vdfuzTjXg339u/+178AnfX3995R4P/J/n8DAV/vv/Gfp2Ad7//xDwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgDxN+x/ZOnvj/uk/f9w/AAAAAAAAUB/1B74d/Bv5Hrz/cflvvluWVxub/3/8/y6H56/160/z/d8l59wLRF1HV939P+2Qd399yIr6+vnzKiBL7//1z3nTq6ULeveP+72OHwAAAAAAAPNO/VcaAIisrlR2rRf/zbL/L/SqW//bAgAAAAAAwHPq+T8ujvr/u7x20//+7nJ+vX7353/3/c71DwAAAAAAAACpm9vHpH+RyvjOfnp958e9y67cfv12j9OR83zlAS9Md+1go9sH+F73HYEh4GucMDo73vpTf/XDzWG6BwAAAAAAAAAAAAAAAOAm/r75A7XrbePL6S+c3r+Dn7+r9x/V/9+3/t+u/e//fvv97/+qv24AAAAAAAAAAAAAILbNf56+s2LxWA3xe/3x6f2+w8ZtXz3//2nP//T7+9z3TwAgNxEV';
var GP_TRAD_BITS = null;
function gpTradWhy_(name) {   // 不行的話回傳原因（給玩家看），可以就回 ''
  if (!GP_TRAD_BITS) GP_TRAD_BITS = Utilities.base64Decode(GP_TRAD);
  var a = Array.from(name);
  if (a.length < 2) return '新帳號至少要 2 個字';
  if (a.length > 10) return '新帳號最多 10 個字（現在 ' + a.length + ' 個）';
  for (var k = 0; k < a.length; k++) { var ch = a[k], i = ch.charCodeAt(0) - 0x4E00; if (!(ch.length === 1 && i >= 0 && i < 0x9FA6 - 0x4E00 && (GP_TRAD_BITS[i >> 3] & (1 << (i & 7))) !== 0)) return '「' + ch + '」不是繁體中文字：新帳號只能用繁體中文'; }
  return '';
}
function gpTradOk_(name) { return !gpTradWhy_(name); }
// 排行榜上的名字：藏起第一個字
function gpMask_(name) { var a = Array.from(String(name)); return a.length ? '○' + a.slice(1).join('') : ''; }
// 戰績合併：兩個分頁、兩台裝置都在存，不能誰蓋掉誰——數字取大、清單取聯集；新手提示與造型照最新的
function gpTagScore_(t) { return !t ? -1 : (t === '封魘' || t === '斬心魔') ? 99 : t === '通關' ? 50 : (String(t).indexOf('第二章') === 0 ? 20 : 0) + (parseInt(String(t).replace(/^.*第 /, ''), 10) || 0); }
function gpMerge_(a, b, key) {
  if (key === 'tips' || key === 'skin') return b === undefined ? a : b;
  if (b === undefined || b === null) return a;
  if (a === undefined || a === null) return b;
  if (key === 'best' && typeof a === 'object' && typeof b === 'object') { var o0 = {}; Object.keys(a).forEach(function (k) { o0[k] = a[k]; }); Object.keys(b).forEach(function (k) { if (gpTagScore_(b[k]) >= gpTagScore_(o0[k])) o0[k] = b[k]; }); return o0; }
  if (key === 'srwTurns' && typeof a === 'number' && typeof b === 'number') return a > 0 && b > 0 ? Math.min(a, b) : Math.max(a, b);   // 最少回合：越小越好（0＝還沒有）
  if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
  if (Array.isArray(a) && Array.isArray(b)) { var o1 = a.slice(); b.forEach(function (x) { if (o1.indexOf(x) < 0) o1.push(x); }); return o1; }
  if (typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) { var o = {}; Object.keys(a).forEach(function (k) { o[k] = a[k]; }); Object.keys(b).forEach(function (k) { o[k] = gpMerge_(a[k], b[k], k); }); return o; }
  return b;
}

// 登入：只要帳號，不用密碼；沒有這個帳號就直接建立。回傳 { ok, token, name, meta, run, created }
// （以前建立的帳號有密碼雜湊，現在不再檢查；通行碼仍由那一格算出，所以「記住我」照樣有效）
function gpLogin(name) {
  var raw = name; name = gpName_(name);
  if (!name) return { ok: false, msg: '先輸入帳號' };
  var lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return { ok: false, busy: true, msg: '伺服器忙，等一下再試' };   // 等不到鎖：講清楚是忙，不要當成斷線
  try {
    var sh = gpSheet_(), row = gpFind_(sh, name, raw);
    if (!row) {
      var why = gpTradWhy_(name); if (why) return { ok: false, msg: why };
      var salt = Utilities.getUuid(), hash = gpHash_(salt, ''), now = new Date();
      sh.appendRow([name, salt, hash, now, now, '', '', 0]);
      try { CacheService.getScriptCache().put('row:' + name, String(sh.getLastRow()), 21600); } catch (e) { }
      return { ok: true, created: true, name: name, token: gpToken_(name, hash), meta: null, run: null, runTs: 0 };
    }
    var v = sh.getRange(row, 1, 1, 8).getValues()[0], stored = String(v[GP_COL.NAME]);
    return { ok: true, name: stored, token: gpToken_(stored, v[GP_COL.HASH]), meta: v[GP_COL.META] || null, run: v[GP_COL.RUN] || null, runTs: +v[GP_COL.RUNTS] || 0 };
  } finally { lock.releaseLock(); }
}
// 用通行碼重新登入（記住我）
function gpResume(name, token) {
  var raw = name; name = gpName_(name);
  var sh = gpSheet_(), row = gpFind_(sh, name, raw); if (!row) return { ok: false, msg: '沒有這個帳號' };
  var v = sh.getRange(row, 1, 1, 8).getValues()[0], stored = String(v[GP_COL.NAME]);
  if (gpToken_(stored, v[GP_COL.HASH]) !== token) return { ok: false, msg: '請重新登入' };
  return { ok: true, name: stored, token: token, meta: v[GP_COL.META] || null, run: v[GP_COL.RUN] || null, runTs: +v[GP_COL.RUNTS] || 0 };
}
// 存檔：meta、run 都是字串（run＝'' 代表這局結束了）；傳 null 的那一格不動
// 一次讀整列、一次寫回（以前一次存檔要叫試算表八次）；鎖只鎖這一下，搶不到就請瀏覽器等一下再送
// meta：跟伺服器上的合併（數字取大、清單聯集）；run：帶著這一局的版本 runTs 與「從哪一版接著玩」baseTs
// 伺服器上的版本比 baseTs 新（別的分頁、裝置已經往前玩了）就不蓋，回 stale 叫瀏覽器重新接上；沒帶 baseTs 的（改版前開著的舊頁面）照舊的規則：比伺服器上的舊才不寫
function gpSave(name, token, meta, run, runTs, baseTs) {
  var raw = name; name = gpName_(name);
  var lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return { ok: false, busy: true, msg: '伺服器忙，等一下再存' };
  try {
    var sh = gpSheet_(), row = gpFind_(sh, name, raw); if (!row) return { ok: false, msg: '沒有這個帳號' };
    var v = sh.getRange(row, 1, 1, 8).getValues()[0];
    if (gpToken_(String(v[GP_COL.NAME]), v[GP_COL.HASH]) !== token) return { ok: false, msg: '請重新登入' };
    var outMeta = v[GP_COL.META], outRun = v[GP_COL.RUN], outTs = +v[GP_COL.RUNTS] || 0, stale = false;
    if (meta != null) {
      var a = null, b = null; try { a = outMeta ? JSON.parse(outMeta) : null; } catch (e) { } try { b = JSON.parse(meta); } catch (e) { }
      outMeta = b && a ? JSON.stringify(gpMerge_(a, b, '')) : String(meta);
      if (outMeta.length > GP_CELL_MAX) return { ok: false, fatal: true, msg: '資料太大' };
    }
    if (run != null) {
      if (String(run).length > GP_CELL_MAX) return { ok: false, fatal: true, msg: '存檔太大' };
      if (baseTs == null) {   // 改版前開著的舊頁面（沒帶 baseTs）：照舊的規則，比伺服器上的舊才不寫
        if (runTs != null && +runTs < outTs) stale = true;
        else { outRun = String(run); outTs = Math.max(outTs + 1, +runTs || Date.now()); }
      }
      else if (outTs > (+baseTs || 0)) stale = true;   // 伺服器上已經有更新的一局：不蓋
      else { outRun = String(run); outTs = Math.max(+runTs || 0, outTs + 1); }
    }
    sh.getRange(row, GP_COL.UPDATED + 1, 1, 4).setValues([[new Date(), outMeta, outRun, outTs]]);
    SpreadsheetApp.flush();   // 放鎖之前寫進去：下一個讀的人才看得到
    return { ok: true, stale: stale, runTs: outTs };
  } finally { lock.releaseLock(); }
}

// 對局紀錄：每局結束記一列（真人的勝率、死在哪、主修選了什麼），調平衡用。新分頁「對局紀錄」
var GP_LOG = '對局紀錄';
var GP_LOG_HEAD = ['時間', '帳號', '角色', '主修', '第一章後', '難度', '模式', '機緣', '結果', '章', '列', '走過格數', '死在', '戰鬥', '牌組張數', '法寶數', '最大生命', '擊敗', '神通次數', '丹藥'];
function gpLog(name, token, d) {
  var raw = name; name = gpName_(name);
  var sh = gpSheet_(), row = gpFind_(sh, name, raw); if (!row) return { ok: false };
  var v = sh.getRange(row, 1, 1, 3).getValues()[0];
  if (gpToken_(String(v[GP_COL.NAME]), v[GP_COL.HASH]) !== token) return { ok: false };
  d = d || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet(), lg = ss.getSheetByName(GP_LOG);
  if (!lg) { lg = ss.insertSheet(GP_LOG); lg.appendRow(GP_LOG_HEAD); lg.setFrozenRows(1); }
  var cut = function (x) { var s = String(x == null ? '' : x).slice(0, 80); return /^[=+\-@]/.test(s) ? "'" + s : s; };   // 開頭是 = + - @ 的會被試算表當成公式，前面加 ' 當純文字
  lg.appendRow([new Date(), cut(name), cut(d.who), cut(d.major), cut(d.second), cut(d.diff), cut(d.mode), cut(d.fates), cut(d.result), +d.act || 0, +d.floor || 0, +d.floors || 0,
    cut(d.killer), cut(d.kind), +d.deck || 0, +d.relics || 0, +d.maxHp || 0, +d.kills || 0, +d.np || 0, +d.pills || 0]);
  return { ok: true };
}

// 戰棋紀錄（2026-10-08）：每關打完記一列（哪一關、勝敗、回合數、平均等級），調關卡難度用。新分頁「戰棋紀錄」
var GP_SLOG = '戰棋紀錄';
var GP_SLOG_HEAD = ['時間', '帳號', '關卡', '結果', '回合', '平均等級', '靈石', '功勳', '累計回合'];
function gpStageLog(name, token, d) {
  var raw = name; name = gpName_(name);
  var sh = gpSheet_(), row = gpFind_(sh, name, raw); if (!row) return { ok: false };
  var v = sh.getRange(row, 1, 1, 3).getValues()[0];
  if (gpToken_(String(v[GP_COL.NAME]), v[GP_COL.HASH]) !== token) return { ok: false };
  d = d || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet(), lg = ss.getSheetByName(GP_SLOG);
  if (!lg) { lg = ss.insertSheet(GP_SLOG); lg.appendRow(GP_SLOG_HEAD); lg.setFrozenRows(1); }
  var cut = function (x) { var s = String(x == null ? '' : x).slice(0, 80); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  lg.appendRow([new Date(), cut(name), cut(d.stage), cut(d.result), +d.turns || 0, +d.lv || 0, +d.gold || 0, +d.merit || 0, +d.total || 0]);
  return { ok: true };
}

// 排行榜：彙整每個帳號的戰績（戰棋：一周目通關最少總回合 srwTurns、打過幾周目 srwLoop；通關次數；舊卡牌版的無盡最遠）。大家一起看同一份，快取一分鐘
function gpBoardRow_(name, m) {
  if (!m || !m.stats) return null;
  var e = m.stats.endless || {}, who = '', best = 0;
  Object.keys(e).forEach(function (k) { if (e[k] > best) { best = e[k]; who = k; } });
  var num = function (x) { x = Math.floor(Number(x) || 0); return x > 0 ? Math.min(x, 1e6) : 0; };   // 存檔是瀏覽器送來的：只認數字
  return { name: gpMask_(name), key: gpHash_('board', gpName_(name)).slice(0, 10), endless: num(best), who: who, wins: num(m.stats.wins), trueEnds: num(m.stats.trueEnds), runs: num(m.stats.runs), srwTurns: num(m.stats.srwTurns), srwLoop: num(m.stats.srwLoop) };
}
function gpBoard(me) {
  var cache = CacheService.getScriptCache(), hit = cache.get('gp_board'), mine = me ? gpHash_('board', gpName_(me)).slice(0, 10) : '';
  if (hit) { var h = JSON.parse(hit); h.me = mine; return h; }
  var sh = gpSheet_(), n = sh.getLastRow(), list = [];
  if (n >= 2) sh.getRange(2, 1, n - 1, GP_COL.META + 1).getValues().forEach(function (v) {
    var m = null; try { m = v[GP_COL.META] ? JSON.parse(v[GP_COL.META]) : null; } catch (e) { }
    var r = gpBoardRow_(String(v[GP_COL.NAME]), m); if (r && (r.endless || r.wins || r.srwTurns || r.srwLoop)) list.push(r);
  });
  var top = function (k, asc) { return list.filter(function (r) { return r[k] > 0; }).sort(function (x, y) { return asc ? x[k] - y[k] : y[k] - x[k]; }).slice(0, 60); };   // 只回每個榜的前段
  var pickd = {}, short = top('endless').concat(top('wins'), top('srwTurns', true), top('srwLoop')).filter(function (r) { if (pickd[r.key]) return false; pickd[r.key] = 1; return true; });
  var out = { ok: true, list: short };
  try { cache.put('gp_board', JSON.stringify(out), 60); } catch (e) { }
  out.me = mine; return out;
}
