// ==========================================
// 🔵 Setup_FateWorld.gs — 自動建表 + 冬木世界初始化
// 開啟網頁(doGet)或任何動作(handleGameAction)時自動執行：
// 缺哪個分頁就補哪個（含表頭），全程冪等，已存在的分頁完全不動。
// 手機端只要打開 /exec 網址就會自動把試算表建好，免進編輯器。
// ==========================================

// 7 張分頁的表頭定義（欄位順序＝COL 對照表，引擎以索引讀取，表頭僅供人看）
// 🆕 2026-07 重構：關係(REL)/時鐘(CLK)/權柄(AUTH)/因果(LOG)/史紀(EPIC)/戰史(HIST) 六表全數砍除或併入眾生列尾端
//   (BOND/REL_TAG/IS_PARTY/MAJOR_EVENT/REL_MEM/DAY/HOUR/AP/HOME_LOC，欄序需與 COL.PC 完全對齊)。
var FATE_SHEET_DEFS = {
  "坤圖":   ["地域", "地名", "類型", "座標", "描述", "上級", "戰爭"],
  "眾生":   ["角色ID","姓名","性別","身世","外顯狀態","特徵","所在","喜好","氣血","真元","氣血上限","真元上限","記憶","意圖","歸屬","位階","貢獻","陣營","體徵","寶具","局號","六圍","標籤","已偵查","好感","關係標籤","同行","重大事件","關係記憶","日","時","行動點","居所"],
  // 🆕 尾端新增「日常外貌／日常性格／日常萌點／日常衣裝」(2026-07)：鑑賞用都市日常版，懶惰快取
  //   (見 COL.HERO 註解/heroToKanshouRow_)。🐛→✅ 稽核發現「日常萌點」「日常衣裝」兩欄標籤過去
  //   漏補(COL.HERO 早已是17欄，這裡卻只列15個表頭標籤)，既有試算表這2欄表頭一直是空白——已補上，
  //   下次任何 action 觸發 ensureFateSheets_ 時會自動補上這2個缺的尾端表頭標籤(不覆蓋既有資料)。
  "英靈殿": ["英靈ID","職階","真名","性別","六圍","職階技能","固有技能","特性","寶具","人格","陣營","出沒戰爭","來源","日常外貌","日常性格","日常萌點","日常衣裝"],
  "御主殿": ["御主ID","姓名","性別","外貌","魔術系統","魔術迴路","體術","魔術階位","居所","願望","人格","戰爭","來源","身世","萌點"],
  "帳號": ["帳號名","角色ID","建立時間","鑑賞角色ID"],
  // 🗑️ 2026-07 稽核確認並整條移除「鑑賞」(GAL)：奪杯封存機制已整套砍掉，全代碼庫grep確認這張表
  //   無任何讀寫者(COL.GAL同步移除，見Core_Settings.gs)。若試算表本體已存在這張分頁，移除定義後
  //   不會自動刪除實體分頁，留著空分頁無害，玩家可自行手動刪除。
  "歷史暫存": ["時間", "角色ID", "發話者", "內容"]
};

// 🧹 一鍵清除專案所有觸發器（舊版「自動移動／自動發信／自動彙整」的殘留時間觸發器，
//   函式本體早已隨經濟/飛書清理移除，但 Apps Script 專案裡可能還掛著指向它們的時間觸發器）。
//   在 GAS 編輯器選此函式手動執行一次即可全清。FATE 世界推進靠玩家按鍵時的 worldTick_，不需任何觸發器。
function removeAllTriggers() {
  var ts = ScriptApp.getProjectTriggers();
  ts.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log("已清除 " + ts.length + " 個觸發器。");
  return "已清除 " + ts.length + " 個觸發器。";
}

// 冬木地圖種子：地域,地名,類型,座標,描述,上級
// ⚠ 2026-07 新增第7欄「戰爭」：空字串＝通用地點(任何戰爭/鑑賞皆顯示)；'4th'＝僅第四次聖杯戰爭顯示。
//   既有17個地點皆為冬木的通用地理/建築，兩次戰爭都存在，維持空字串；只有新補的3個第四次限定地點才標記。
var FATE_MAP_SEED = [
  // 新都（未遠川西岸·現代都心）
  ["冬木", "冬木·新都",   "城區", "30,44", "未遠川西岸的現代都心，高樓林立、霓虹徹夜未熄，最易隱身於人潮的所在。", "", ""],
  ["冬木", "冬木·商店街", "城區", "12,30", "新都的繁華商街，白日人聲鼎沸，補給與探聽風聲之地。", "", ""],
  ["冬木", "穗群原學園",   "城區", "16,48", "冬木的市立高中，白晝學子往來、入夜後校舍空曠寂寥，數度交鋒的舞台。", "", ""],
  ["冬木", "言峰教會",     "祭壇", "44,10", "山丘上的天主教堂，聖杯戰爭的監督者坐鎮於此，向敗北或求援的御主提供中立庇護。", "", ""],
  // 未遠川（東西分界）
  ["冬木", "未遠川河畔",   "靈地", "50,42", "貫穿冬木、分隔東西的大河，水氣氤氳、靈脈隱隱流動，補魔養力的吉地。", "", ""],
  ["冬木", "冬木大橋",     "城區", "50,60", "橫跨未遠川、連接新都與深山町的大橋，江風如刃、視野開闊無從藏身。", "", ""],
  // 深山町（未遠川東岸·老住宅區）
  ["冬木", "冬木·深山町", "城區", "68,46", "未遠川東岸的老住宅區，坡道與舊宅交錯，遠坂宅、間桐宅與衛宮宅皆隱於此。", "", ""],
  ["冬木", "衛宮宅",       "據點", "86,48", "深山町一隅的日式宅院，庭院寬敞、有座小小的工房，樸素而安寧。", "", ""],
  ["冬木", "遠坂宅",       "據點", "64,28", "深山町高地上的西式洋館，遠坂家世代宅邸，結界森嚴、底蘊深厚。", "", ""],
  ["冬木", "間桐宅",       "據點", "82,64", "深山町外緣的陰森洋宅，地底蟲窟蔓延、惡臭撲鼻，間桐家的禁地。", "", ""],
  ["冬木", "柳洞寺",       "靈地", "70,9",  "深山町後山的古剎，靈脈匯聚、易守難攻，絕佳的結界據點，兵家必爭。", "", ""],
  // 郊外·森林（愛因茲貝倫領域）
  ["冬木", "冬木森林",     "靈地", "84,28", "城郊綿延的針葉林，遠離人煙、魔力濃郁，深處通往愛因茲貝倫的城堡。", "", ""],
  ["冬木", "愛因茲貝倫城", "據點", "90,12", "矗立於森林深處的古老城堡，愛因茲貝倫家的據點，冰冷而與世隔絕。", "", ""],
  ["冬木", "冬木·碼頭",   "城區", "58,78", "未遠川出海口的港灣碼頭，貨櫃與倉庫林立，十年前的大火便始於這片海濱。", "", ""],
  // 第四次聖杯戰爭限定地點（衛宮切嗣一代，海特飯店已於本次戰爭中期被毀，麥肯基宅/碼頭倉庫皆為當代限定據點）
  ["冬木", "海特飯店",     "據點", "18,44", "新都邊緣的高樓飯店，時鐘塔貴族御主下榻於此、頂樓布下重重結界，居高臨下俯瞰全城。", "", "4th"],
  ["冬木", "麥肯基宅",     "據點", "56,24", "深山町山丘上的英式老宅，屋主夫婦收留了一名落魄年輕魔術師，寧靜中藏著局外人的棲身之所。", "", "4th"],
  ["冬木", "碼頭倉庫",     "據點", "46,80", "碼頭邊荒廢已久的舊倉庫工房，鏽蝕鐵門深鎖，內裡藏著不欲人知的祕密勾當。", "", "4th"],
  // 約會景點（鑑賞後日談用）
  ["冬木", "冬木·中央公園", "約會", "22,76", "新都中心的大型公園，巨大噴泉灑落水霧，情侶與孩童在草坪上嬉鬧。", "", ""],
  ["冬木", "冬木·海濱大道", "約會", "4,-2",  "面海的濱海步道，夕陽把海面染成金紅，海風帶著鹹味與冰淇淋的甜。", "", ""],
  ["冬木", "冬木·遊樂園",   "約會", "-1,-3", "燈火璀璨的遊樂園，摩天輪緩緩轉動，旋轉木馬與攤販笑語不絕。", "", ""]
];

// 🗑️ FATE_CTAG_SEED（戰鬥標籤分頁種子）已移除：全庫零讀取的 write-only 死資料——
//    戰鬥 fx 實際走 hasFx_＋SEED_SERVANTS 的 skills/traits JSON，不讀此分頁（CLAUDE.md「死符號 CTAG 清」）。

// 🔵 冪等建表主函式：缺則補、含則略。回傳本次新建的分頁名陣列。
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

    // 只有「首次建立」時才灌入種子資料
    if (name === "坤圖" && FATE_MAP_SEED.length) {
      sheet.getRange(2, 1, FATE_MAP_SEED.length, FATE_MAP_SEED[0].length).setValues(FATE_MAP_SEED);
    }
    created.push(name);
  });
  if (created.length) {
    // 新建地圖後清掉舊地圖快取，讓前端讀到新冬木地圖
    try { CacheService.getScriptCache().remove("FATE_MAP_DATA"); } catch (e) {}
  }
  // 英靈殿/御主殿 若為空，自動灌入名冊（Seed_Codex.gs）
  try { if (typeof seedFateCodex_ === "function") seedFateCodex_(ss); } catch (e) { Logger.log("seedFateCodex_ 失敗(略過): " + e.message); }
  // 坤圖若為空(早期被空建未灌種子)→補；坤圖舊「冬木」母節點→改頂層
  try { reseedIfEmpty_(ss); } catch (e) { Logger.log("reseedIfEmpty_ 失敗(略過): " + e.message); }
  return created;
}

// 🔵 修復：種子表為空就補；坤圖舊資料的 PARENT「冬木」改成頂層("")，避免地圖渲染出錯
var RESEED_VER = 'r2'; // ⚡ bump 此值 → 讓「坤圖升級＋英靈殿補丁」這段一次性遷移重跑一次(改 FATE_MAP_SEED/補丁邏輯時)
// r2：新增第四次限定地點(海特飯店/麥肯基宅/碼頭倉庫)＋補WAR欄同步，見下方 upsert 迴圈。
function reseedIfEmpty_(ss) {
  var seedMap = { "坤圖": FATE_MAP_SEED };
  Object.keys(seedMap).forEach(function (name) {
    var sh = ss.getSheetByName(name); if (!sh) return;
    var seed = seedMap[name];
    if (sh.getLastRow() <= 1 && seed.length) {
      sh.getRange(2, 1, seed.length, seed[0].length).setValues(seed);
    }
  });
  // ⚡ 以下坤圖升級＋赫拉克勒斯補丁＝一次性遷移(過去每按鍵都重跑：坤圖整表讀×2＋英靈殿整表讀×1＋清掉地圖快取)。
  //   版本旗標守門：套用過即 return；如此 getMapDataCached 的 1h 快取才不會每按鍵被 line 清掉而失效。
  try { if (PropertiesService.getScriptProperties().getProperty('fate_reseed_ver') === RESEED_VER) return; } catch (e) { }
  var km = ss.getSheetByName("坤圖");
  if (km && km.getLastRow() > 1) {
    var data = km.getDataRange().getValues();
    var changed = false;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL.MAP.PARENT]).trim() === "冬木") { data[i][COL.MAP.PARENT] = ""; changed = true; }
    }
    if (changed) km.getRange(1, 1, data.length, data[0].length).setValues(data);
    // 🗺️ 地圖升級：依種子(以地名為鍵)更新既有地點的 類型/座標/描述，並補入缺少的地點。
    //   坤圖是純地理表(無 per-game 資料)，故安全。修正舊資料的錯誤(如遠坂宅誤標新都)＋補新地點。
    var d2 = km.getDataRange().getValues();
    var nameToIdx = {};
    for (var j = 1; j < d2.length; j++) nameToIdx[String(d2[j][COL.MAP.NAME]).trim()] = j;
    var toAppend = [], upserted = false;
    FATE_MAP_SEED.forEach(function (row) {
      var nm = String(row[1]).trim();
      if (nameToIdx[nm] != null) {
        var ix = nameToIdx[nm];
        d2[ix][COL.MAP.TYPE] = row[2]; d2[ix][COL.MAP.COORD] = row[3]; d2[ix][COL.MAP.DESC] = row[4]; d2[ix][COL.MAP.WAR] = row[6] || ""; upserted = true;
      } else { toAppend.push(row); }
    });
    if (upserted) km.getRange(1, 1, d2.length, d2[0].length).setValues(d2);
    if (toAppend.length) km.getRange(km.getLastRow() + 1, 1, toAppend.length, toAppend[0].length).setValues(toAppend);
  }
  try { CacheService.getScriptCache().remove("FATE_MAP_DATA"); } catch (e) { }

  // 🔧 既有英靈殿補丁：赫拉克勒斯的「十二試煉」過去只在 np 文字、缺 fx:god_hand → 補上技能
  try {
    var hs = ss.getSheetByName("英靈殿");
    if (hs && hs.getLastRow() > 1) {
      var hd = hs.getDataRange().getValues();
      for (var h = 1; h < hd.length; h++) {
        if (String(hd[h][COL.HERO.NAME]).indexOf("赫拉克勒斯") < 0) continue;
        var sk = []; try { sk = JSON.parse(hd[h][COL.HERO.SKILLS] || "[]"); } catch (e) { sk = []; }
        var has = sk.some(function (x) { return x && x.fx === "god_hand"; });
        if (!has) {
          sk.push({ n: "十二試煉", r: "A", fx: "god_hand" });
          hs.getRange(h + 1, COL.HERO.SKILLS + 1).setValue(JSON.stringify(sk));
          try { CacheService.getScriptCache().remove("FATE_HERO_CODEX"); } catch (e) { }
        }
        break;
      }
    }
  } catch (e) { }
  try { PropertiesService.getScriptProperties().setProperty('fate_reseed_ver', RESEED_VER); } catch (e) { } // 一次性遷移完成、之後跳過
}

// 🔵 可從編輯器手動執行：回報建了哪些分頁
function setupFateWorld() {
  var created = ensureFateSheets_();
  var msg = created.length ? ("已新建分頁：" + created.join("、")) : "全部 13 個分頁皆已存在，無需新建。";
  Logger.log(msg);
  return msg;
}
