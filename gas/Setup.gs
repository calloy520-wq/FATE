/**
 * Setup.gs — 自動建表 + 種子資料
 *
 * 使用方式：
 *   1. 開一個 Google 試算表 → 擴充功能 → Apps Script
 *   2. 把 gas/ 內 8 個 .gs 檔分別貼成「指令碼檔」：
 *        Api / Config / Engine / Game / LLM / SeedData / Setup / Sheets
 *      ⚠ index.html 必須用「檔案➕ → HTML」新增成 HTML 檔（命名 index），
 *        絕對不可貼進 .gs，否則會報 SyntaxError: Unexpected token '<'（行1）
 *   3. 專案設定 → 指令碼屬性 → 新增 OPENROUTER_API_KEY = 你的 key
 *   4. 執行 setupDatabase()（第一次會要求授權）
 *
 * 跑一次：建立 10 張分頁＋欄位，並把英靈殿/地圖/戰爭/規則/道具樣本填入。
 * 重跑安全：靜態分頁會重新種子；動態分頁（帳號/戰場/記憶/事件/時鐘）只建表、不清資料。
 */
function setupDatabase(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var summary = [];

  Object.keys(HEADERS).forEach(function(name){
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    // 寫標題列
    var header = HEADERS[name];
    sheet.getRange(1,1,1,header.length).setValues([header])
         .setFontWeight('bold').setBackground('#1f1a2b').setFontColor('#e7c873');
    sheet.setFrozenRows(1);
    summary.push(name);
  });

  // 種子靜態分頁
  // 英靈殿特別處理：重種官方英靈時，保留玩家用「真名召喚／自訂生成」寫入的 AI 英靈（source==='ai_gen'）。
  // 否則重跑建表會清掉它們，導致既有存檔指向不存在的從者而在讀檔/戰鬥時崩潰。
  var aiHeroes = [];
  var hs = ss.getSheetByName(SHEETS.HEROES);
  if(hs && hs.getLastRow() > 1) aiHeroes = readAll_(SHEETS.HEROES).filter(function(h){ return h.source==='ai_gen'; });
  seedSheet_(ss, SHEETS.HEROES,  SEED_SERVANTS.map(servantRow_));
  if(aiHeroes.length){
    var aiRows = aiHeroes.map(function(h){ return toRow_(SHEETS.HEROES, h); });
    hs.getRange(hs.getLastRow()+1, 1, aiRows.length, HEADERS[SHEETS.HEROES].length).setValues(aiRows);
    invalidate_(SHEETS.HEROES);
    Logger.log('保留 %s 筆 AI 生成英靈', aiHeroes.length);
  }
  seedSheet_(ss, SHEETS.MASTERS, SEED_MASTERS.map(masterRow_));
  seedSheet_(ss, SHEETS.MAP,     SEED_LOCATIONS.map(locationRow_));
  seedSheet_(ss, SHEETS.WARS,   SEED_WARS.map(warRow_));
  seedSheet_(ss, SHEETS.RULES,  SEED_RULES);
  seedSheet_(ss, SHEETS.ITEMS,  SEED_ITEMS);

  // 移除預設 "Sheet1/工作表1"（若空）
  ['Sheet1','工作表1'].forEach(function(n){
    var s = ss.getSheetByName(n);
    if(s && ss.getSheets().length>1 && s.getLastRow()===0) ss.deleteSheet(s);
  });

  SpreadsheetApp.getActiveSpreadsheet().toast('建表完成：'+summary.join('、'), '命運停駐之夜', 8);
  Logger.log('完成分頁：' + summary.join('、'));
  Logger.log('英靈殿 %s 筆、地圖 %s 點、戰爭 %s 場', SEED_SERVANTS.length, SEED_LOCATIONS.length, SEED_WARS.length);
}

/** 清空資料列（保留標題）後寫入 rows（二維陣列） */
function seedSheet_(ss, name, rows){
  var sheet = ss.getSheetByName(name);
  var last = sheet.getLastRow();
  if(last > 1) sheet.getRange(2,1,last-1,sheet.getLastColumn()).clearContent();
  if(rows.length){
    sheet.getRange(2,1,rows.length,rows[0].length).setValues(rows);
  }
  invalidate_(name);
}

// ===== 物件 → 列（依 HEADERS 順序，複雜欄位存 JSON）=====
function servantRow_(s){
  return [ s.id, s.cls, s.realName, s.wars.join('/'),
    s.six.筋力, s.six.耐久, s.six.敏捷, s.six.魔力, s.six.幸運, s.six.寶具,
    JSON.stringify(s.classSkills), JSON.stringify(s.skills), JSON.stringify(s.traits),
    s.np, JSON.stringify(s.persona), 'official', s.align||'中立・中庸' ];
}
function masterRow_(m){
  return [ m.id, m.name, m.war, m.magic, m.circuits, m.melee, m.magic_rank, m.home, m.wish, m.persona, 'official' ];
}
function locationRow_(l){
  return [ l.id, l.name, l.x, l.y, l.danger, l.leyline, JSON.stringify(l.adj), l.desc ];
}
function warRow_(w){
  return [ w.war_id, w.name, w.participants, w.partial, JSON.stringify(w.roster) ];
}

/** 選用：選單按鈕 */
function onOpen(){
  SpreadsheetApp.getUi().createMenu('聖杯戰爭')
    .addItem('建立／重建資料庫', 'setupDatabase')
    .addToUi();
}
