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

// JSON 欄位自動解析
function parseMaybe_(v){
  if(typeof v !== 'string') return v;
  var t = v.trim();
  if(t && (t[0]==='[' || t[0]==='{')){ try { return JSON.parse(t); } catch(e){} }
  return v;
}

/** 讀整張分頁 → [{欄位:值, _row:列號}] */
function readAll_(name){
  var s = sheet_(name);
  var last = s.getLastRow();
  if(last < 2) return [];
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
}
/** 批次新增多列（物件陣列） */
function appendObjs_(name, objs){
  if(!objs.length) return;
  var rows = objs.map(function(o){ return toRow_(name, o); });
  var s = sheet_(name);
  s.getRange(s.getLastRow()+1, 1, rows.length, HEADERS[name].length).setValues(rows);
}

/** 更新指定 _row 的某些欄位 */
function updateRow_(name, rowIndex, updates){
  var s = sheet_(name);
  var head = HEADERS[name];
  Object.keys(updates).forEach(function(k){
    var col = head.indexOf(k);
    if(col < 0) return;
    var v = updates[k];
    s.getRange(rowIndex, col+1).setValue((typeof v === 'object') ? JSON.stringify(v) : v);
  });
}

/** 依條件更新（第一筆符合者） */
function updateWhere_(name, pred, updates){
  var row = findOne_(name, pred);
  if(row) updateRow_(name, row._row, updates);
  return row;
}
