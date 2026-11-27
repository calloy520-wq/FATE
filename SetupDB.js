/**
 * ============================================================
 * FATE 第五次聖杯戰爭 — SetupDB（試算表初始化）
 *
 * 試算表只保留兩個分頁：
 *   Players_Save：玩家存檔（32 欄，欄位順序不可更動）
 *   ChatLog：對話紀錄
 * 角色、陣營、世界書都內建在 GAS（GameData.js、Code.js 的 CANONICAL_7_FACTIONS_、Lore.js）。
 *
 * 安全原則：只會「建立缺少的分頁並寫入標題列」，絕對不清除、不刪除任何既有資料。
 * 舊的 Char_Appearance、Factions_Relations、Lorebook 分頁已不再使用，可自行手動刪除。
 * ============================================================
 */
function initFateDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const created = [];
  if (ensureSheetWithHeaders_(ss, 'Players_Save', PLAYERS_SAVE_HEADERS_, '#064e3b')) created.push('Players_Save');
  if (ensureSheetWithHeaders_(ss, 'ChatLog', CHATLOG_HEADERS_, '#4c1d95')) created.push('ChatLog');
  SpreadsheetApp.flush();
  Logger.log(created.length > 0
    ? `✅ 已建立分頁：${created.join('、')}`
    : '✅ Players_Save 與 ChatLog 都已存在，未做任何更動。');
}

const PLAYERS_SAVE_HEADERS_ = [
  '玩家名稱(繁中5字內)',   // A  row[0]
  '最後登入時間',           // B  row[1]
  '遊戲階段',               // C  row[2]
  '遊玩模式',               // D  row[3]
  '自動生圖',               // E  row[4]
  '成人模式 (TRUE=允許裸露/NSFW圖)', // F row[5]
  '天數(Day)',              // G  row[6]
  '時段',                   // H  row[7]
  '剩餘AP',                 // I  row[8]
  '警戒度(0-100)',          // J  row[9]
  '當前地點',               // K  row[10]
  '御主性別',               // L  row[11]
  '御主出身',               // M  row[12]
  '御主外觀Tags',           // N  row[13]
  '御主HP (未使用・保留)',  // O  row[14]
  '御主MP',                 // P  row[15]
  '剩餘令咒',               // Q  row[16]
  '主從者ID',               // R  row[17]
  '主從者職階',             // S  row[18]
  '主從者真名',             // T  row[19]
  '主從者HP (未使用・保留)', // U row[20]
  '主從者好感度 (0-100)',   // V  row[21]
  '主從者六維',             // W  row[22]
  '副從者ID',               // X  row[23]
  '副從者職階',             // Y  row[24]
  '副從者真名',             // Z  row[25]
  '副從者HP (未使用・保留)', // AA row[26]
  '副從者NP (未使用・保留)', // AB row[27]
  '動態服裝狀態JSON',       // AC row[28]
  '陣營關係與結盟JSON',     // AD row[29]
  '長期記憶摘要',           // AE row[30]
  '遊戲狀態meta JSON (勝敗/背包/手機/回合數/路線/重要事件)' // AF row[31]
];

const CHATLOG_HEADERS_ = [
  '玩家名稱',
  '回合數',
  '時間戳記',
  '地點與時段',
  '玩家行動輸入',
  'Gemini 劇情回覆',
  '出場角色ID',
  'NAI 繪圖 payload（只保留最近 6 回合）',
  'Seed'
];

// 分頁不存在才建立並寫入標題；已存在就完全不動。回傳是否新建。
function ensureSheetWithHeaders_(ss, name, headers, color) {
  if (ss.getSheetByName(name)) return false;
  const sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground(color).setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  return true;
}
