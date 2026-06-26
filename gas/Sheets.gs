/**
 * Sheets.gs — 試算表讀寫工具層
 * 把分頁當資料庫：以標題列為 key 讀成物件、查找、新增、更新。
 */

function ss_(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name){
  var s = ss_().getSheetByName(name);
  if(!s) throw new Error('找不到分頁：'+name+'（請先執行 setupDatabase）');
  return s;
}

// ===== 多人單機：寫入序列化（避免兩個玩家同時寫入互相覆蓋／讀到寫一半的資料）=====
// 所有「會寫入試算表」的進入點都用此包起來，確保同一時間只有一個動作在改資料。
function withLock_(fn){
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); }
  catch(e){ return { error:'伺服器忙碌中（另一位玩家正在存檔），請稍候再試。' }; }
  try { return fn(); }
  finally { try { lock.releaseLock(); } catch(e){} }
}

// ===== 單次執行內的整表快取 =====
// 同一次動作會對同一分頁查很多次（英靈殿/地圖/戰場…），快取後只讀一次；任何寫入立即失效。
// 注意：快取只活在「單一次後端執行」內，不跨玩家、不跨請求，因此不會造成資料汙染。
var _SHEET_CACHE_ = {};
function invalidate_(name){ delete _SHEET_CACHE_[name]; }

// JSON 欄位自動解析
function parseMaybe_(v){
  if(typeof v !== 'string') return v;
  var t = v.trim();
  if(t && (t[0]==='[' || t[0]==='{')){ try { return JSON.parse(t); } catch(e){} }
  return v;
}

/** 讀整張分頁 → [{欄位:值, _row:列號}]（單次執行內快取，寫入時自動失效） */
function readAll_(name){
  if(_SHEET_CACHE_[name]) return _SHEET_CACHE_[name];
  var s = sheet_(name);
  var last = s.getLastRow();
  if(last < 2){ _SHEET_CACHE_[name] = []; return _SHEET_CACHE_[name]; }
  var vals = s.getDataRange().getValues();
  var head = vals[0];
  var out = [];
  for(var r=1; r<vals.length; r++){
    var o = { _row: r+1 };
    var empty = true;
    for(var c=0; c<head.length; c++){
      o[head[c]] = parseMaybe_(vals[r][c]);
      if(vals[r][c] !== '' && vals[r][c] !== null) empty = false;
    }
    if(!empty) out.push(o);
  }
  _SHEET_CACHE_[name] = out;
  return out;
}

/**
 * 只讀最後 n 列（窗口讀取）→ [{欄位:值, _row:列號}]，依列序（即時間序）回傳。
 * 用於 事件/記憶 這類「只增不減、會隨遊玩成長」的表：消除每回合整表掃描的成長隱憂。
 * 呼叫端仍須自行用 game_id 過濾——窗口只是限制讀取量，過濾才是資料隔離的保證。
 */
function readTail_(name, n){
  var s = sheet_(name);
  var last = s.getLastRow();
  if(last < 2) return [];
  var head = HEADERS[name];
  var start = Math.max(2, last - n + 1);
  var vals = s.getRange(start, 1, last - start + 1, head.length).getValues();
  var out = [];
  for(var r=0; r<vals.length; r++){
    var o = { _row: start + r };
    var empty = true;
    for(var c=0; c<head.length; c++){
      o[head[c]] = parseMaybe_(vals[r][c]);
      if(vals[r][c] !== '' && vals[r][c] !== null) empty = false;
    }
    if(!empty) out.push(o);
  }
  return out;
}

/** 條件查找（pred 為函式或 {欄位:值}） */
function findRows_(name, pred){
  var fn = (typeof pred === 'function') ? pred
    : function(o){ return Object.keys(pred).every(function(k){ return o[k] === pred[k]; }); };
  return readAll_(name).filter(fn);
}
function findOne_(name, pred){ var a = findRows_(name, pred); return a.length ? a[0] : null; }

/** 物件 → 依標題列順序的列陣列 */
function toRow_(name, obj){
  return HEADERS[name].map(function(h){
    var v = obj[h];
    if(v === undefined || v === null) return '';
    return (typeof v === 'object') ? JSON.stringify(v) : v;
  });
}

/** 新增一列（物件） */
function appendObj_(name, obj){
  sheet_(name).appendRow(toRow_(name, obj));
  invalidate_(name);
}
/** 批次新增多列（物件陣列） */
function appendObjs_(name, objs){
  if(!objs.length) return;
  var rows = objs.map(function(o){ return toRow_(name, o); });
  var s = sheet_(name);
  s.getRange(s.getLastRow()+1, 1, rows.length, HEADERS[name].length).setValues(rows);
  invalidate_(name);
}

/** 更新指定 _row 的某些欄位。
 * 效能：整列「讀一次＋寫一次」（2 次試算表往返），取代過去「每欄一次 setValue」（N 次往返）——
 * 戰鬥/NPC tick 一動作動輒更新數十欄，這是把每回合 I/O 從數秒降到 sub-秒的關鍵。 */
function updateRow_(name, rowIndex, updates){
  var head = HEADERS[name];
  var keys = Object.keys(updates).filter(function(k){ return head.indexOf(k) >= 0; });
  if(!keys.length) return;
  var range = sheet_(name).getRange(rowIndex, 1, 1, head.length);
  var row = range.getValues()[0];                 // 1 次讀
  keys.forEach(function(k){ var c = head.indexOf(k), v = updates[k];
    row[c] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v; });
  range.setValues([row]);                          // 1 次寫
  invalidate_(name);
}

/** 依條件更新（第一筆符合者） */
function updateWhere_(name, pred, updates){
  var row = findOne_(name, pred);
  if(row) updateRow_(name, row._row, updates);
  return row;
}
