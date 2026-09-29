// ==========================================
// 🔵 Setup_FateWorld.gs — 自動建表
// 登入時（ensureWorldReady_）缺哪個分頁就補哪個（含表頭），全程冪等，已存在的分頁完全不動。
// ==========================================

// 分頁的表頭定義（欄位順序＝COL 對照表，引擎以索引讀取，表頭僅供人看）。聖杯戰局／鑑賞眾生／世界帳本／鑑賞風格由各自的模組建。
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。
// 關係/時鐘/權柄/因果/史紀/戰史 六表已併入眾生列尾端(BOND/REL_TAG/IS_PARTY/MEMOIR/REL_MEM/DAY/HOUR/AP/HOME_LOC)，欄序需與 COL.PC 對齊。(27 槽原 MAJOR_EVENT 死欄已復用為鑑賞 MEMOIR 共同回憶)
var FATE_SHEET_DEFS = {
  "眾生":   ["角色ID","姓名","性別","身世","外顯狀態","特徵","所在","喜好","體力","魔力","體力上限","魔力上限","記憶","意圖","歸屬","位階","貢獻","陣營","體徵","寶具","局號","六圍","標籤","已偵查","好感","關係標籤","同行","重大事件","關係記憶","日","時","行動點","居所"],
  // 尾端「日常外貌／日常性格／(棄用)／日常衣裝」：鑑賞用都市日常版懶惰快取(見 COL.HERO 註解/heroToKanshouRow_)。
  // ⚠ 第15欄原為「日常萌點」，2026-09 萌點退休後永遠空著——COL 是位置索引，欄位留著不刪。
  //   ensureFateSheets_ 只補尾端缺少的表頭標籤，不覆蓋既有資料。
  "英靈殿": ["英靈ID","職階","真名","性別","六圍","職階技能","固有技能","特性","寶具","人格","陣營","出沒戰爭","來源","日常外貌","日常性格","(棄用·原日常萌點)","日常衣裝"],
  "帳號": ["帳號名","角色ID","建立時間","鑑賞角色ID"],
  // 「鑑賞」(GAL)已整套移除(COL.GAL同步移除，見Core_Settings.gs)：若試算表已有此分頁，移除定義後
  //   不會自動刪除實體分頁，留著無害，可手動刪除。
  "歷史暫存": ["時間", "角色ID", "發話者", "內容"]
};


// 登入時跑：版本號變了（種子改過）或主表不見了，才跑一次冪等建表＋種子更新；平常只讀一個設定值、找兩張表。
function ensureWorldReady_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var ver = CODEX_PERSONA_VER;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('world_ready_ver') === ver && ss.getSheetByName('帳號') && ss.getSheetByName('英靈殿')) return false;
  ensureFateSheets_(ss);
  props.setProperty('world_ready_ver', ver);
  return true;
}

// 🔵 冪等建表主函式：缺則補、含則略。
function ensureFateSheets_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var created = [];
  Object.keys(FATE_SHEET_DEFS).forEach(function (name) {
    var headers = FATE_SHEET_DEFS[name];
    var existing = ss.getSheetByName(name);
    if (existing) {
      // 已存在：只補「尾端缺少的表頭欄位標籤」(例如新加的 職階/六圍/標籤)，絕不覆蓋既有欄位或資料
      var lastCol = existing.getLastColumn();
      if (lastCol > 0 && lastCol < headers.length) {
        existing.getRange(1, lastCol + 1, 1, headers.length - lastCol).setValues([headers.slice(lastCol)]);
      }
      return;
    }
    var sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    created.push(name);
  });
  // 英靈殿若為空，自動灌入名冊（Seed_Codex.gs）
  try { if (typeof seedFateCodex_ === "function") seedFateCodex_(ss); } catch (e) { Logger.log("seedFateCodex_ 失敗(略過): " + e.message); }
  return created;
}


