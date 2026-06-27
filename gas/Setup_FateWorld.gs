// ==========================================
// 🔵 Setup_FateWorld.gs — 自動建表 + 冬木世界初始化
// 開啟網頁(doGet)或任何動作(handleGameAction)時自動執行：
// 缺哪個分頁就補哪個（含表頭），全程冪等，已存在的分頁完全不動。
// 手機端只要打開 /exec 網址就會自動把試算表建好，免進編輯器。
// ==========================================

// 17 張分頁的表頭定義（欄位順序＝COL 對照表，引擎以索引讀取，表頭僅供人看）
var FATE_SHEET_DEFS = {
  "規矩":   ["時局", "內容"],
  "坤圖":   ["地域", "地名", "類型", "座標", "描述", "上級"],
  "眾生":   ["角色ID","姓名","性別","身世","外顯狀態","財帛","特徵","所在","喜好","氣血","真元","力","體","敏","慧","運","氣血上限","真元上限","武器","防具","飾物一","飾物二","境界","記憶","意圖","勢力","位階","貢獻","陣營","體徵","武學","生活技能","局號","職階","六圍","標籤","已偵查"],
  "英靈殿": ["英靈ID","職階","真名","性別","六圍","職階技能","固有技能","特性","寶具","人格","陣營","出沒戰爭","來源"],
  "御主殿": ["御主ID","姓名","性別","外貌","魔術系統","魔術迴路","體術","魔術階位","居所","願望","人格","戰爭","來源"],
  "戰鬥標籤": ["fx碼","標籤名","類型","效果說明","機制數值"],
  "帳號": ["帳號名","角色ID","勝場","建立時間"],
  "戰史": ["帳號名","結果","從者","摘要","時間"],
  "鑑賞": ["帳號名","真名","職階","性別","六圍","標籤","寶具","生平","個性","萌點","羈絆回憶","願望結局","解鎖時間","御主名","御主性別"],
  "時鐘": ["局號","日","時","行動點"],
  "因果":   ["時間", "對象", "內容", "地點", "標籤"],
  "琳琅":   ["名稱","類型","描述","價格","持有者","力","體","敏","慧","運","物品ID","所在"],
  "權柄":   ["名稱", "ID", "稱號", "居所", "裝飾"],
  "關係":   ["角色", "對象", "好感", "關係標籤", "同行", "關係記憶", "重大事件"],
  "史紀":   ["角色ID", "史紀", "時間"],
  "天命":   ["角色", "任務名", "目標", "狀態", "賞銀", "賞物", "獎勵鎖定", "期限"],
  "TASK":   ["持有者", "設施", "工作者", "目標", "起始時間"],
  "勢力":   ["勢力ID", "名稱", "陣營", "據點", "首領", "格言"],
  "傳聞":   ["時間", "類型", "內容", "地點", "對象", "權重", "到期", "狀態"],
  "飛書":   ["郵件ID", "寄件者", "收件者", "內容", "物品ID", "物品名", "狀態", "時間"],
  "店鋪":   ["持有者", "店名", "類別", "描述", "所在", "金庫", "上次結算"],
  "大勢":   ["勢力", "態勢", "勢力值", "更新時間", "事件"],
  "歷史暫存": ["時間", "角色ID", "發話者", "內容"],
  "天道彙整": ["天道彙整"]
};

// 冬木地圖種子：地域,地名,類型,座標,描述,上級
var FATE_MAP_SEED = [
  ["冬木", "冬木·新都",   "城區", "2,3",   "跨越未遠川西岸的現代都心，高樓林立、人潮喧囂，霓虹徹夜未熄。", ""],
  ["冬木", "冬木·深山町", "城區", "-3,2",  "未遠川東岸的老住宅區，坡道與舊宅交錯，衛宮宅坐落於此。", ""],
  ["冬木", "冬木大橋",     "城區", "0,2",   "橫跨未遠川、連接新都與深山町的大橋，夜裡風聲如刃。", ""],
  ["冬木", "冬木·商店街", "城區", "1,2",   "新都的繁華商街，適合補給與探聽風聲。", ""],
  ["冬木", "穗群原學園",   "城區", "-4,3",  "深山町的高中，白日學子往來，入夜後空曠寂寥。", ""],
  ["冬木", "未遠川河畔",   "靈地", "0,1",   "分隔冬木東西的大河，水氣氤氳，靈脈隱隱流動。", ""],
  ["冬木", "柳洞寺",       "靈地", "5,6",   "未遠川源頭山上的古剎，靈脈匯聚，是絕佳據點，亦是兵家必爭之地。", ""],
  ["冬木", "言峰教會",     "祭壇", "1,5",   "山丘上的天主教堂，聖杯戰爭的監督者於此坐鎮，提供中立庇護。", ""],
  ["冬木", "遠坂宅",       "據點", "3,1",   "新都一隅的西式洋館，遠坂家宅邸，結界森嚴。", ""],
  ["冬木", "間桐宅",       "據點", "-2,-1", "深山町外緣的陰森洋宅，地底蟲窟蔓延，令人作嘔。", ""],
  ["冬木", "冬木·中央公園", "約會", "2,-1",  "新都中心的大型公園，巨大噴泉在陽光下灑落水霧，情侶與孩童在草坪上嬉鬧。", ""],
  ["冬木", "冬木·海濱大道", "約會", "4,-2",  "面海的濱海步道，夕陽把海面染成金紅，海風帶著鹹味與冰淇淋的甜。", ""],
  ["冬木", "冬木·遊樂園",   "約會", "-1,-3", "燈火璀璨的遊樂園，摩天輪緩緩轉動，旋轉木馬與攤販笑語不絕。", ""]
];

// 規矩種子：開局時局
var FATE_LAW_SEED = [
  ["第五次聖杯戰爭", "七位御主與七騎從者齊聚冬木，爭奪能實現任何願望的聖杯。教會為監督者，維持表面中立。白晝需隱藏身份於常人之中，夜晚才是廝殺與謀略的時刻。"]
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
  ["anti_magic_lance", "破魔紅薔薇", "寶具", "斬斷魔力與連結。", "消敵增益、破神核"],
  ["god_hand", "十二試煉", "寶具", "不死之軀，多次復活。", "12 條命、復活留 40% HP"],
  ["rule_breaker", "破戒全咒", "寶具", "斬斷一切契約。", "敵令咒歸 0、增益盡除"],
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
    if (name === "規矩" && FATE_LAW_SEED.length) {
      sheet.getRange(2, 1, FATE_LAW_SEED.length, FATE_LAW_SEED[0].length).setValues(FATE_LAW_SEED);
    }
    if (name === "戰鬥標籤" && FATE_CTAG_SEED.length) {
      sheet.getRange(2, 1, FATE_CTAG_SEED.length, FATE_CTAG_SEED[0].length).setValues(FATE_CTAG_SEED);
    }
    created.push(name);
  });
  if (created.length) {
    // 新建地圖後清掉舊地圖快取，讓前端讀到新冬木地圖
    try { CacheService.getScriptCache().remove("KYUSHU_MAP_DATA"); } catch (e) {}
  }
  // 英靈殿/御主殿 若為空，自動灌入名冊（Seed_Codex.gs）
  try { if (typeof seedFateCodex_ === "function") seedFateCodex_(ss); } catch (e) { Logger.log("seedFateCodex_ 失敗(略過): " + e.message); }
  // 坤圖/規矩/戰鬥標籤 若為空(早期被空建未灌種子)→補；坤圖舊「冬木」母節點→改頂層
  try { reseedIfEmpty_(ss); } catch (e) { Logger.log("reseedIfEmpty_ 失敗(略過): " + e.message); }
  return created;
}

// 🔵 修復：種子表為空就補；坤圖舊資料的 PARENT「冬木」改成頂層("")，避免地圖渲染出錯
function reseedIfEmpty_(ss) {
  var seedMap = { "坤圖": FATE_MAP_SEED, "規矩": FATE_LAW_SEED, "戰鬥標籤": FATE_CTAG_SEED };
  Object.keys(seedMap).forEach(function (name) {
    var sh = ss.getSheetByName(name); if (!sh) return;
    var seed = seedMap[name];
    if (sh.getLastRow() <= 1 && seed.length) {
      sh.getRange(2, 1, seed.length, seed[0].length).setValues(seed);
    }
  });
  var km = ss.getSheetByName("坤圖");
  if (km && km.getLastRow() > 1) {
    var data = km.getDataRange().getValues();
    var changed = false;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL.MAP.PARENT]).trim() === "冬木") { data[i][COL.MAP.PARENT] = ""; changed = true; }
    }
    if (changed) km.getRange(1, 1, data.length, data[0].length).setValues(data);
    // 補上新增的約會地點（既有地圖不會被整批覆蓋，逐一檢查補入）
    var existNames = {};
    var d2 = km.getDataRange().getValues();
    for (var j = 1; j < d2.length; j++) existNames[String(d2[j][COL.MAP.NAME]).trim()] = true;
    var dateNodes = FATE_MAP_SEED.filter(function (row) { return String(row[2]) === "約會" && !existNames[String(row[1]).trim()]; });
    if (dateNodes.length) {
      km.getRange(km.getLastRow() + 1, 1, dateNodes.length, dateNodes[0].length).setValues(dateNodes);
    }
  }
  try { CacheService.getScriptCache().remove("KYUSHU_MAP_DATA"); } catch (e) { }
}

// 🔵 可從編輯器手動執行：回報建了哪些分頁
function setupFateWorld() {
  var created = ensureFateSheets_();
  var msg = created.length ? ("已新建分頁：" + created.join("、")) : "全部 17 個分頁皆已存在，無需新建。";
  Logger.log(msg);
  return msg;
}
