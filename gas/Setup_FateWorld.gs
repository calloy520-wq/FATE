// ==========================================
// 🔵 Setup_FateWorld.gs — 自動建表 + 冬木世界初始化
// 開啟網頁(doGet)或任何動作(handleGameAction)時自動執行：
// 缺哪個分頁就補哪個（含表頭），全程冪等，已存在的分頁完全不動。
// 手機端只要打開 /exec 網址就會自動把試算表建好，免進編輯器。
// ==========================================

// 17 張分頁的表頭定義（欄位順序＝COL 對照表，引擎以索引讀取，表頭僅供人看）
var FATE_SHEET_DEFS = {
  "坤圖":   ["地域", "地名", "類型", "座標", "描述", "上級"],
  "眾生":   ["角色ID","姓名","性別","身世","外顯狀態","特徵","所在","喜好","氣血","真元","氣血上限","真元上限","階位","記憶","意圖","歸屬","位階","貢獻","陣營","體徵","寶具","局號","六圍","標籤","已偵查"],
  "英靈殿": ["英靈ID","職階","真名","性別","六圍","職階技能","固有技能","特性","寶具","人格","陣營","出沒戰爭","來源"],
  "御主殿": ["御主ID","姓名","性別","外貌","魔術系統","魔術迴路","體術","魔術階位","居所","願望","人格","戰爭","來源","身世","萌點"],
  "戰鬥標籤": ["fx碼","標籤名","類型","效果說明","機制數值"],
  "帳號": ["帳號名","角色ID","勝場","建立時間","最快奪杯日"],
  "戰史": ["帳號名","結果","從者","摘要","時間"],
  "鑑賞": ["帳號名","真名","職階","性別","六圍","標籤","寶具","生平","個性","萌點","羈絆回憶","願望結局","解鎖時間","御主名","御主性別"],
  "時鐘": ["局號","日","時","行動點"],
  "因果":   ["時間", "對象", "內容", "地點", "標籤"],
  "權柄":   ["名稱", "ID", "稱號", "居所", "裝飾"],
  "關係":   ["角色", "對象", "好感", "關係標籤", "同行", "關係記憶", "重大事件"],
  "史紀":   ["角色ID", "史紀", "時間"],
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
var FATE_MAP_SEED = [
  // 新都（未遠川西岸·現代都心）
  ["冬木", "冬木·新都",   "城區", "30,44", "未遠川西岸的現代都心，高樓林立、霓虹徹夜未熄，最易隱身於人潮的所在。", ""],
  ["冬木", "冬木·商店街", "城區", "12,30", "新都的繁華商街，白日人聲鼎沸，補給與探聽風聲之地。", ""],
  ["冬木", "穗群原學園",   "城區", "16,48", "冬木的市立高中，白晝學子往來、入夜後校舍空曠寂寥，數度交鋒的舞台。", ""],
  ["冬木", "言峰教會",     "祭壇", "44,10", "山丘上的天主教堂，聖杯戰爭的監督者坐鎮於此，向敗北或求援的御主提供中立庇護。", ""],
  // 未遠川（東西分界）
  ["冬木", "未遠川河畔",   "靈地", "50,42", "貫穿冬木、分隔東西的大河，水氣氤氳、靈脈隱隱流動，補魔養力的吉地。", ""],
  ["冬木", "冬木大橋",     "城區", "50,60", "橫跨未遠川、連接新都與深山町的大橋，江風如刃、視野開闊無從藏身。", ""],
  // 深山町（未遠川東岸·老住宅區）
  ["冬木", "冬木·深山町", "城區", "68,46", "未遠川東岸的老住宅區，坡道與舊宅交錯，遠坂宅、間桐宅與衛宮宅皆隱於此。", ""],
  ["冬木", "衛宮宅",       "據點", "86,48", "深山町一隅的日式宅院，庭院寬敞、有座小小的工房，樸素而安寧。", ""],
  ["冬木", "遠坂宅",       "據點", "64,28", "深山町高地上的西式洋館，遠坂家世代宅邸，結界森嚴、底蘊深厚。", ""],
  ["冬木", "間桐宅",       "據點", "82,64", "深山町外緣的陰森洋宅，地底蟲窟蔓延、惡臭撲鼻，間桐家的禁地。", ""],
  ["冬木", "柳洞寺",       "靈地", "70,9",  "深山町後山的古剎，靈脈匯聚、易守難攻，絕佳的結界據點，兵家必爭。", ""],
  // 郊外·森林（愛因茲貝倫領域）
  ["冬木", "冬木森林",     "靈地", "84,28", "城郊綿延的針葉林，遠離人煙、魔力濃郁，深處通往愛因茲貝倫的城堡。", ""],
  ["冬木", "愛因茲貝倫城", "據點", "90,12", "矗立於森林深處的古老城堡，愛因茲貝倫家的據點，冰冷而與世隔絕。", ""],
  ["冬木", "冬木·碼頭",   "城區", "58,78", "未遠川出海口的港灣碼頭，貨櫃與倉庫林立，十年前的大火便始於這片海濱。", ""],
  // 約會景點（鑑賞後日談用）
  ["冬木", "冬木·中央公園", "約會", "22,76", "新都中心的大型公園，巨大噴泉灑落水霧，情侶與孩童在草坪上嬉鬧。", ""],
  ["冬木", "冬木·海濱大道", "約會", "4,-2",  "面海的濱海步道，夕陽把海面染成金紅，海風帶著鹹味與冰淇淋的甜。", ""],
  ["冬木", "冬木·遊樂園",   "約會", "-1,-3", "燈火璀璨的遊樂園，摩天輪緩緩轉動，旋轉木馬與攤販笑語不絕。", ""]
];

// 戰鬥標籤種子：fx 碼,標籤名,類型,效果說明,機制數值（戰鬥系統換 D20 後由此驅動）
var FATE_CTAG_SEED = [
  ["nullify_magic", "對魔力", "職階技能", "抵銷魔術攻擊；階級越高，能無效化越高位階的魔術。", "依階減免魔術傷害"],
  ["ride", "騎乘", "職階技能", "駕馭一切坐騎與載具，戰技嫻熟。", "迴避 +3"],
  ["mad", "狂化", "職階技能", "犧牲理智換取力量（能力已計入成品值）。", "維持費 ×2、難以對話"],
  ["stealth", "氣息遮斷", "職階技能", "抹消氣息潛行，奇襲必殺。", "首擊奇襲傷害 ×1.5"],
  ["territory", "陣地作成", "職階技能", "建立工房／神殿，強化己方魔力環境。", "結界上限提升、回魔加成"],
  ["item_make", "道具作成", "職階技能", "煉成魔術道具與消耗品。", "每小時產出資源"],
  ["divine_core", "神性／神核", "特性", "神靈血脈，先天減傷。", "受傷減免 18%"],
  ["first_strike", "直感", "固有技能", "戰鬥中的第六感，先機與閃避。", "迴避 +3，搶先手"],
  ["analyze", "心眼（真）", "固有技能", "洞察戰況與破綻。", "命中 +、破綻分析"],
  ["unreadable", "宗和的心得", "固有技能", "自身無欲無求，使敵方直感與心眼失效。", "令敵 first_strike/analyze 失效"],
  ["burst", "魔力放出", "固有技能", "以魔力爆發強化一擊。", "傷害 ×1.2"],
  ["morale", "勇猛／卡里斯瑪", "固有技能", "鼓舞與威壓，提振戰意。", "命中/傷害 +3"],
  ["survive", "戰鬥續行", "固有技能", "受致命傷仍能再戰一次。", "致命時留 1 HP（一次）"],
  ["evade_ranged", "避矢", "固有技能", "看穿並迴避遠程攻擊。", "對遠程迴避 +6"],
  ["divine_age", "神代魔術", "固有技能", "神代體系，凌駕現代對魔力。", "使敵方對魔力半效"],
  ["wind_strike", "風王結界", "寶具", "不可視之風，隱藏真名與斬擊軌跡。", "隱真名、風斬一擊"],
  ["tsubame", "燕返", "寶具", "三連同時斬，幾乎無從迴避。", "敵迴避 -8、傷害 ×2.3"],
  ["anti_magic_lance", "破魔紅薔薇", "寶具", "雙槍破魔，斬斷魔力與連結。", "無視神核護甲；致命時敵無法續行/復活/令咒脫離"],
  ["god_hand", "十二試煉", "寶具", "不死之軀，多次自死亡歸來。", "復活 11 次、每次回 20% 靈基；破戒/破魔可斬斷"],
  ["rule_breaker", "破戒全咒", "寶具", "斬斷一切契約與救贖。", "致命一擊下，敵無法戰鬥續行/十二試煉復活/令咒脫離"],
  ["clear_mind", "透化", "固有技能", "清澈靜穆之心，不受精神威壓。", "免疫敵方勇猛／卡里斯瑪加成"],
  ["self_mod", "自我改造", "固有技能", "改造強化過的軀體。", "命中 +2、傷害 +3"],
  ["tactics", "軍略", "固有技能", "用兵之才，臨陣指揮。", "寶具威力 +15%"],
  ["gae_bolg", "刺穿死棘之槍", "寶具", "逆轉因果的必中刺擊。", "必中"],
  ["excalibur", "誓約勝利之劍", "寶具", "對城寶具，光之斬擊。", "大範圍高傷"],
  ["ubw", "無限劍製", "寶具", "固有結界，劍之地平線。", "領域內全面壓制"],
  ["ea", "乖離劍・天地乖離開闢之星", "寶具", "斬裂世界的真理之劍。", "對界，最高傷"]
];

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
    if (name === "戰鬥標籤" && FATE_CTAG_SEED.length) {
      sheet.getRange(2, 1, FATE_CTAG_SEED.length, FATE_CTAG_SEED[0].length).setValues(FATE_CTAG_SEED);
    }
    created.push(name);
  });
  if (created.length) {
    // 新建地圖後清掉舊地圖快取，讓前端讀到新冬木地圖
    try { CacheService.getScriptCache().remove("FATE_MAP_DATA"); } catch (e) {}
  }
  // 英靈殿/御主殿 若為空，自動灌入名冊（Seed_Codex.gs）
  try { if (typeof seedFateCodex_ === "function") seedFateCodex_(ss); } catch (e) { Logger.log("seedFateCodex_ 失敗(略過): " + e.message); }
  // 坤圖/戰鬥標籤 若為空(早期被空建未灌種子)→補；坤圖舊「冬木」母節點→改頂層
  try { reseedIfEmpty_(ss); } catch (e) { Logger.log("reseedIfEmpty_ 失敗(略過): " + e.message); }
  return created;
}

// 🔵 修復：種子表為空就補；坤圖舊資料的 PARENT「冬木」改成頂層("")，避免地圖渲染出錯
var RESEED_VER = 'r1'; // ⚡ bump 此值 → 讓「坤圖升級＋英靈殿補丁」這段一次性遷移重跑一次(改 FATE_MAP_SEED/補丁邏輯時)
function reseedIfEmpty_(ss) {
  var seedMap = { "坤圖": FATE_MAP_SEED, "戰鬥標籤": FATE_CTAG_SEED };
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
        d2[ix][COL.MAP.TYPE] = row[2]; d2[ix][COL.MAP.COORD] = row[3]; d2[ix][COL.MAP.DESC] = row[4]; upserted = true;
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
  var msg = created.length ? ("已新建分頁：" + created.join("、")) : "全部 17 個分頁皆已存在，無需新建。";
  Logger.log(msg);
  return msg;
}
