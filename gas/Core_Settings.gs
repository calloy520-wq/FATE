// ==========================================
// 九州江湖 - 天道核心系統 (2026.05 雙軌防護 + JSON結構化批量I/O 極致優化版)
// 🔴【第一部分：基礎設定、ORM 映射與數值統計核心】Core_Settings.gs
// ==========================================

// 🔵 金鑰相容：九州原本叫 API_KEY，FATE Script 存的是 OPENROUTER_API_KEY；兩個名字都吃，免改 Script 屬性
const API_KEY = (function () {
  var p = PropertiesService.getScriptProperties();
  return p.getProperty('API_KEY')
      || p.getProperty('OPENROUTER_API_KEY')
      || p.getProperty('OPENROUTER_KEY')
      || p.getProperty('OPENROUTER')
      || '';
})();
const MODEL_URL = "https://openrouter.ai/api/v1/chat/completions";

// ==========================================
// ★ 階段一：ORM 資料實體映射 (Data Mapping) 
// ==========================================
const COL = {
  // 🎴 FATE 專屬眾生 schema（2026-06 砍九州經濟/生活層後重排，30 欄）。
  //   已移除：財帛(MONEY)、裝備(WEP/ARM/ACC1/ACC2)、生活技能(LIFESKILL)、冗餘職階(CLS)。
  PC: {
    ID: 0, NAME: 1, SEX: 2, BACK: 3, STATUS: 4, TRAIT: 5, LOC: 6, PREF: 7,
    HP: 8, MP: 9, STR: 10, CON: 11, AGI: 12, INT: 13, LUK: 14, MAX_HP: 15, MAX_MP: 16,
    REALM: 17, MEMORY: 18, INTENT: 19, FACTION: 20, RANK: 21, CONTRIB: 22, ALIGN: 23,
    PHYSICAL: 24, MARTIAL: 25, GAME_ID: 26, SIX: 27, TAGS: 28, SEEN: 29
  },
  REL: { PC: 0, NPC: 1, FAV: 2, TAG: 3, IS_PARTY: 4, MEMORY: 5, MAJOR_EVENT: 6 },
  MAP: { REGION: 0, NAME: 1, TYPE: 2, COORD: 3, DESC: 4, PARENT: 5 },
  FACTION: { ID: 0, NAME: 1, ALIGN: 2, BASE: 3, LEADER: 4, MOTTO: 5 },
  AUTH: { NAME: 0, ID: 1, TITLE: 2, HOME_LOC: 3, DECOR: 4 },
  // 🔵 英靈殿(從者範本)、御主殿（戰鬥標籤分頁仍在、以 fx 碼查找，不需 COL 索引）
  HERO: { ID: 0, CLS: 1, NAME: 2, SEX: 3, SIX: 4, CLASS_SKILLS: 5, SKILLS: 6, TRAITS: 7, NP: 8, PERSONA: 9, ALIGN: 10, WARS: 11, SOURCE: 12 },
  MASTER: { ID: 0, NAME: 1, SEX: 2, APPEAR: 3, MAGIC: 4, CIRCUITS: 5, MELEE: 6, MAGIC_RANK: 7, HOME: 8, WISH: 9, PERSONA: 10, WAR: 11, SOURCE: 12, BACK: 13, MOE: 14 },
  // 帳號（存檔身分）：帳號名 → 目前御主角色ID、勝場
  ACC: { NAME: 0, PC: 1, WON: 2, CREATED: 3, BEST_DAYS: 4 },
  // 戰史：每局結果紀錄
  HIST: { ACC: 0, RESULT: 1, SERVANT: 2, SUMMARY: 3, TIME: 4 },
  // 鑑賞：奪杯後封存的從者（可於鑑賞模式呼出）
  GAL: { ACC: 0, NAME: 1, CLS: 2, SEX: 3, SIX: 4, TAGS: 5, NP: 6, BACK: 7, PREF: 8, MOE: 9, MEMOIR: 10, WISH: 11, TIME: 12, MASTER: 13, MSEX: 14 },
  // 時鐘：每個 game_id 一筆（第幾日／幾點／行動點）。1 AP = 1 小時，每日 12 AP（休息每小時補 2 AP）。
  CLK: { GAME_ID: 0, DAY: 1, HOUR: 2, AP: 3 }
};

// 🔵 Fate 六圍階級：E~EX 轉數值（戰鬥系統換 D20 後會用到；+ 視為 +5）
const RANK_VALUE = { "E": 10, "D": 20, "C": 30, "B": 40, "A": 50, "EX": 60 };
function rankVal(r) {
  r = String(r || "E").trim();
  let base = RANK_VALUE[r.replace(/[+\-]/g, "").toUpperCase()] || 10;
  const plus = (r.match(/\+/g) || []).length;
  const minus = (r.match(/\-/g) || []).length;
  return base + plus * 5 - minus * 3;
}

const REALMS = ["凡人", "引氣", "凝罡", "通玄", "罡氣", "意動", "心象", "登峰", "返璞", "天人"];
const REALM_MODIFIERS = {
  "凡人": 1.0, "引氣": 1.3, "凝罡": 1.6, "通玄": 2.0, "罡氣": 2.5,
  "意動": 3.2, "心象": 4.0,
  "登峰": 8.0, "返璞": 20.0, "天人": 50.0
};
const REALM_LIMITS = {
  "凡人": 20, "引氣": 25, "凝罡": 30, "通玄": 40, "罡氣": 50,
  "意動": 65, "心象": 80,
  "登峰": 120, "返璞": 160, "天人": 200
};
const MAX_BAG_SIZE = 20;
const MAX_WAREHOUSE_SIZE = 200;
const MAX_QUEST_REWARD_MONEY = 2000; // 天命懸賞銀兩上限：系統隨機獎勵約100~500，給4倍彈性空間防AI暴增

// 🟢 共用 D20 骰子：1=大失敗、20=大成功
function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

// 🟢 物品稀有度十階對照表（唯一真實來源：AI 輸出階名，GAS 查此表給屬性點）
const RARITY_TABLE = {
  "凡品": { gear: 1, pill: 1 },
  "粗劣": { gear: 1, pill: 1 },
  "普通": { gear: 2, pill: 1 },
  "良品": { gear: 2, pill: 2 },
  "精品": { gear: 3, pill: 2 },
  "珍品": { gear: 4, pill: 2 },
  "稀世": { gear: 5, pill: 3 },
  "絕世": { gear: 6, pill: 3 },
  "神器": { gear: 8, pill: 4 },
  "傳說": { gear: 10, pill: 5 }
};

// 🟢 查表小工具：傳回該稀有度的屬性點，查不到一律 fallback 凡品最低階
function getRarityPoints(rarity, isPill) {
  const entry = RARITY_TABLE[String(rarity || "").trim()] || RARITY_TABLE["凡品"];
  return isPill ? entry.pill : entry.gear;
}


// 🟢 貨幣物品對照表（NPC 打賞用，固定金額，AI 不可自訂價格）
const CURRENCY_TABLE = {
  "碎銀": 20,
  "黃金": 100
};

// 🟢 查表小工具：傳回該貨幣物品的固定兌換價，查不到回傳 0（代表不是貨幣物）
function getCurrencyValue(name) {
  return CURRENCY_TABLE[String(name || "").trim()] || 0;
}



// 🟢 唯一真實來源：物品類別判定器
// name: 物品名 / fallbackType: AI原本給的類型(查無關鍵字時用) / hasStatBonus: true有五圍加成 false無 null未知
function detectItemType(name, fallbackType, hasStatBonus) {
  const n = String(name || "");
  const ft = fallbackType || "消耗品";

  // 🟢 貨幣物品優先判定，蓋過所有其他規則
  if (CURRENCY_TABLE.hasOwnProperty(n.trim())) return "貨幣";
  if (n.match(/劍|刀|槍|棍|鞭|爪|斧|錘|弓|弩|暗器|匕|鉤|鐮|刃/)) return "武器";
  if (n.match(/甲|袍|衣|靴|盔|盾|護|鎧/)) return "防具";
  if (n.match(/符|印|鏡|鈴|珠|扇|旗|幡|令牌|玉佩|法器/)) return "法寶";
  if (n.match(/簪|香囊|信物|戒指|玉環|手鐲|耳環|髮飾/)) return "定情信物";

  // 恢復道具：靠名字，或「明確無屬性加成的丹藥型」
  if (n.match(/回血|補血|回氣|補氣|靈泉|傷藥|療傷|回復|恢復|復元/)) return "恢復道具";
  if (ft === "丹藥" && hasStatBonus === false) return "恢復道具";

  // 丹藥：叫丹丸散液膏，且(未知加成 或 確定有加成)
  if (n.match(/丹|丸|散|液|膏/) && hasStatBonus !== false) return "丹藥";

  if (n.match(/毒|蠱/) && !n.match(/解毒|避毒/)) return "毒藥";
  if (n.match(/媚|春藥|情花/)) return "媚藥";

  return ft;
}


// ==========================================
// ★ 階段二：通用輔助模組 (Helper Functions)
// ==========================================

// 🟢 姓名限定純中文：移除所有非中日韓統一表意文字(CJK 含擴展A)的字元——英數、符號、空白、emoji 全部濾除。
// 全系統唯一真實來源；前端只做提示與即時擋字，後端此函式才是最終防線。回傳清洗後字串(上限10字)。
function cleanChineseName(s) {
  return String(s == null ? "" : s).replace(/[^㐀-䶿一-鿿]/g, "").slice(0, 10);
}

// 🟢 屬性上限計算器
function calculateMaxStats(realm, con, int) {
  const rMod = REALM_MODIFIERS[realm || "凡人"] || 1.0;
  return {
    hp: 100 + (Math.floor((parseInt(con) || 10) * rMod) * 10),
    mp: 50 + (Math.floor((parseInt(int) || 10) * rMod) * 10)
  };
}

// 🟢 亂碼特徵粉碎器
function parseTraitsHelper(data, defaultStr) {
  let str = "";
  if (!data) str = defaultStr;
  else if (Array.isArray(data)) str = data.join("、");
  else if (typeof data === "object") str = Object.values(data).join("、");
  else str = String(data).replace(/[\[\]"{}]/g, "").trim();

  // 🔴 終極防呆：清除 AI 雞婆加上的標籤與數字 (例如 "1.", "表象:", "外貌:" 等)
  str = str.replace(/(表象|內裡|底線|性癖|外貌|武技|雜學|弱點|牽絆|色色弱點)[:：]/g, "")
    .replace(/\d+[\.、]/g, "");

  // 切割並過濾空字串
  let parts = str.split('、').map(s => s.trim()).filter(s => s !== "");

  // 強制補滿 4 格，如果 AI 給太少就塞「無」
  while (parts.length < 4) {
    parts.push("無");
  }

  // 保證只回傳前 4 格
  return parts.slice(0, 4).join("、");
}

// 🟢 自動註冊門派勢力中樞
function registerFactionHelper(factionName, rankStr, align, baseLoc, leaderFallback, sheets, pcId, triggerName, currentFactions) {
  const name = String(factionName || "無").trim();
  const ignoreFactions = ["無", "無門派", "散修", "散人", "江湖散客", "未知", "未加入", "無所屬", "江湖散人"];
  if (ignoreFactions.includes(name) || !sheets.faction) return false;

  if (!currentFactions.some(r => String(r[COL.FACTION.NAME]).trim() === name)) {
    const fId = "FAC_" + Date.now() + Math.floor(Math.random() * 100);
    const leaderKeywords = ["掌門", "宗主", "教主", "門主", "谷主", "閣主", "殿主", "幫主", "老祖", "首領", "魁首", "尊者"];
    let factionLeader = `神祕的${name}之主`;
    if (leaderKeywords.some(keyword => String(rankStr).includes(keyword))) factionLeader = leaderFallback;

    const newFacRow = [fId, name, align || "絕對中立", baseLoc, factionLeader, "暗中發展的未知勢力"];
    sheets.faction.appendRow(newFacRow);
    addRumor(sheets, "FACTION_NEW", baseLoc, name);
    currentFactions.push(newFacRow); // 記憶體同步防重複

    if (sheets.epic && pcId) {
      sheets.epic.appendRow([pcId, `【勢力初現】『${triggerName}』的現身，揭露了隱藏門派「${name}」的存在。`, new Date()]);
    }
    return true;
  }
  return false;
}

// 🗑️ resolveItemName / transferMoney 已隨九州物品·銀兩經濟移除（無呼叫者）。

// 🟢 安全寫入：先寫新資料，再刪多餘舊行，避免 clearContent 競態清空表
function safeWriteSheet(sheet, data) {
  if (!sheet || !data || data.length === 0) return;

  const numCols = data[0].length;
  const numRows = data.length;

  // 1. 先把新資料全部寫上去（覆蓋現有行）
  sheet.getRange(1, 1, numRows, numCols).setValues(data);

  // 2. 如果舊表比新資料多行，把多的刪掉
  const oldLastRow = sheet.getLastRow();
  if (oldLastRow > numRows) {
    sheet.deleteRows(numRows + 1, oldLastRow - numRows);
  }

  SpreadsheetApp.flush();
}

// 在 Core_Settings.gs 新增
function updateFactionPower(sheets, factionName, delta, currentEvent = "") {
  if (!factionName || factionName === "無") return;

  // 找到大勢表中該勢力
  const trendSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("大勢");
  if (!trendSheet) return;

  const data = trendSheet.getDataRange().getValues();
  const rowIdx = data.findIndex(r => r[0] === factionName);

  if (rowIdx !== -1) {
    let newPower = Math.max(0, Math.min(100, (parseInt(data[rowIdx][2]) || 50) + delta));
    let status = newPower >= 70 ? "崛起" : newPower >= 30 ? "中立" : "衰落";
    trendSheet.getRange(rowIdx + 1, 3).setValue(newPower);
    trendSheet.getRange(rowIdx + 1, 2).setValue(status);
    trendSheet.getRange(rowIdx + 1, 4).setValue(new Date());
    if (currentEvent) trendSheet.getRange(rowIdx + 1, 5).setValue(currentEvent);
  } else {
    trendSheet.appendRow([factionName, "中立", 50 + delta, new Date(), currentEvent || "初入江湖"]);
  }
}

// ==========================================
// ★ 階段三：狀態融合與資料封裝
// ==========================================

function parseVisibleStatus(rawStatus) {
  if (!rawStatus) return { "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "平靜" };
  try {
    let obj = JSON.parse(rawStatus);
    return { "衣服": obj["衣服"] || "穿戴整齊", "姿勢": obj["姿勢"] || "站立", "負面": obj["負面"] || "無", "顏面": obj["顏面"] || "平靜" };
  } catch (e) {
    return { "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": String(rawStatus).trim() };
  }
}

function buildVisibleStatusString(rawStatus) {
  const vs = parseVisibleStatus(rawStatus);
  let parts = [];
  if (vs["衣服"] && vs["衣服"] !== "無") parts.push(vs["衣服"]);
  if (vs["姿勢"] && vs["姿勢"] !== "無") parts.push(vs["姿勢"]);
  if (vs["負面"] && !["無", "氣息平穩", "平穩", "正常", "健康"].includes(vs["負面"])) parts.push(vs["負面"]);
  if (vs["顏面"] && vs["顏面"] !== "無") parts.push(vs["顏面"]);
  return parts.length > 0 ? parts.join("，") : "氣息平穩";
}

function mergePhysicalStatus(oldJson, newObjOrStr) {
  try {
    let oldObj = JSON.parse(oldJson || "{}");
    let newObj = typeof newObjOrStr === 'string' ? JSON.parse(newObjOrStr || "{}") : (newObjOrStr || {});
    return JSON.stringify(Object.assign(oldObj, newObj));
  } catch (e) { return oldJson || "{}"; }
}

function maskPhysicalStatus(jsonStr, isNsfwMode) {
  if (isNsfwMode) return jsonStr;
  try {
    let obj = JSON.parse(jsonStr || "{}");
    const sensitiveKeys = ["胸部", "蜜穴", "肉棒", "口", "舌頭", "菊穴"];
    sensitiveKeys.forEach(k => { if (obj[k] && obj[k] !== "無") obj[k] = "???"; });
    return JSON.stringify(obj);
  } catch (e) { return "{}"; }
}

function buildPlayerStatusString(selfRow, totals, itemData, relMem = "", isNsfwMode = false) {
  // 🗑️ FATE 已棄用 裝備(WEP/ARM/ACC1/ACC2) 與 生活技能(LIFESKILL)：§ 位置保留空字串、不再讀那些欄，
  //   前端 s[N] 契約完全不動(零風險)，依賴解除後該些欄即可於 schema 重建時安全刪除。
  const safeMemory = String(selfRow[COL.PC.MEMORY] || "").replace(/\|/g, '@@@');
  const safeRelMem = String(relMem || "").replace(/\|/g, '@@@');
  const maskedPhysical = maskPhysicalStatus(selfRow[COL.PC.PHYSICAL] || "{}", isNsfwMode);
  const safePhysical = String(maskedPhysical).replace(/§/g, '###');
  const visibleStatusStr = buildVisibleStatusString(selfRow[COL.PC.STATUS]);

  return [
    visibleStatusStr, "", selfRow[COL.PC.TRAIT], selfRow[COL.PC.LOC], selfRow[COL.PC.PREF],
    selfRow[COL.PC.HP], selfRow[COL.PC.MP], totals ? totals.STR : selfRow[COL.PC.STR], totals ? totals.CON : selfRow[COL.PC.CON],
    totals ? totals.AGI : selfRow[COL.PC.AGI], totals ? totals.INT : selfRow[COL.PC.INT], totals ? totals.LUK : selfRow[COL.PC.LUK],
    "", "", "", "", selfRow[COL.PC.REALM], safeMemory, safeRelMem, selfRow[COL.PC.FACTION],
    selfRow[COL.PC.RANK], selfRow[COL.PC.ALIGN], selfRow[COL.PC.CONTRIB], selfRow[COL.PC.BACK], safePhysical,
    selfRow[COL.PC.INTENT], selfRow[COL.PC.MARTIAL], ""
  ].join('§');
}

function getFreshStatusString(targetId, pIdx, sheets) {
  SpreadsheetApp.flush();
  const freshPcData = sheets.pc.getDataRange().getValues();
  const totals = getCharacterTotalStats(targetId, sheets, freshPcData);
  const freshItemData = sheets.item ? sheets.item.getDataRange().getValues() : [];
  return buildPlayerStatusString(freshPcData[pIdx], totals, freshItemData);
}

function getMapDataCached(sheets) {
  if (!sheets.map) return [];
  const cache = CacheService.getScriptCache();
  const cachedMap = cache.get("KYUSHU_MAP_DATA");
  if (cachedMap) return JSON.parse(cachedMap);

  const freshData = sheets.map.getDataRange().getValues();
  cache.put("KYUSHU_MAP_DATA", JSON.stringify(freshData), 3600);
  return freshData;
}

function getCharacterTotalStats(charId, sheets, cachedPcData = null, cachedItemData = null) {
  const pcData = cachedPcData || sheets.pc.getDataRange().getValues();
  const row = pcData.find(r => r[COL.PC.ID] === charId);
  if (!row) return null;

  let realmName = row[COL.PC.REALM] || "凡人";
  let realmMod = REALM_MODIFIERS[realmName] || 1.0;

  let baseSTR = Math.floor((parseInt(row[COL.PC.STR]) || 10) * realmMod);
  let baseCON = Math.floor((parseInt(row[COL.PC.CON]) || 10) * realmMod);
  let baseAGI = Math.floor((parseInt(row[COL.PC.AGI]) || 10) * realmMod);
  let baseINT = Math.floor((parseInt(row[COL.PC.INT]) || 10) * realmMod);
  let baseLUK = Math.floor((parseInt(row[COL.PC.LUK]) || 10) * realmMod);

  // 🗑️ FATE 已棄用裝備系統：六圍不再吃武器/防具/飾物加成（FATE 角色從不設裝備欄，原本恆為空 no-op）。
  //   回傳維持原形狀(WEP/wepSTR/armCON/wepName/armName 供下游傷害公式與敘述沿用)，恆為空/0。
  return {
    id: charId, name: row[COL.PC.NAME], hp: parseInt(row[COL.PC.HP]) || 100, maxHp: parseInt(row[COL.PC.MAX_HP]) || 100,
    STR: baseSTR, CON: baseCON, AGI: baseAGI, INT: baseINT, LUK: baseLUK,
    WEP: "", ARM: "", wepSTR: 0, armCON: 0, wepName: "", armName: ""
  };
}

// ==========================================
// 🔴 狀態掃描器與地理雷達
// ==========================================

function getLocalPeopleList(sheets, pcName, pcId, curL, relData, taskData, allPcData) {
  if (!allPcData) allPcData = sheets.pc.getDataRange().getValues();
  const localPeopleList = [];
  const safeCurL = String(curL || "");

  // 🔵 實例化：只看自己 game_id 世界內的人（御主沒有 game_id 時不過濾，相容舊角色）
  const meRow = allPcData.find(r => r[COL.PC.ID] == pcId);
  const myGameId = meRow ? String(meRow[COL.PC.GAME_ID] || "") : "";

  // 🤝 情報共享（同盟背景生效）：只要當前世界尚有任一盟友（敵御主/敵從者結盟中），盟友便會通報敵情——
  //   敵從者的「職階」對玩家揭露（原作依據：遠坂凜為士郎判明敵方職階／真名）。無盟友則維持迷霧。
  let hasAlly = false;
  for (let a = 1; a < allPcData.length; a++) {
    const ar = allPcData[a];
    if (myGameId && String(ar[COL.PC.GAME_ID] || "") !== myGameId) continue;
    const af = String(ar[COL.PC.FACTION] || "");
    if ((af === "敵御主" || af === "敵從者") && !String(ar[COL.PC.ID]).startsWith("DEAD_") && /【盟約至】\d+/.test(String(ar[COL.PC.MEMORY] || ""))) { hasAlly = true; break; }
  }

  for (let i = 1; i < allPcData.length; i++) {
    const r = allPcData[i];
    if (r[COL.PC.ID] == pcId || String(r[COL.PC.ID]).startsWith("DEAD_")) continue;
    if (myGameId && String(r[COL.PC.GAME_ID] || "") !== myGameId) continue;

    const tLoc = String(r[COL.PC.LOC] || ""); const tName = r[COL.PC.NAME];
    const relRecord = relData.find(row => row[COL.REL.PC] === pcName && row[COL.REL.NPC] === tName);
    const rVal = relRecord ? parseInt(relRecord[COL.REL.FAV]) || 0 : 0;
    const rIsParty = relRecord ? (relRecord[COL.REL.IS_PARTY] === "同行") : false;
    const otherParty = relData.find(row => row[COL.REL.NPC] === tName && row[COL.REL.IS_PARTY] === "同行" && row[COL.REL.PC] !== pcName);

    if (tLoc === safeCurL || rVal >= 60 || rIsParty) {
      let finalDisplayStatus = buildVisibleStatusString(r[COL.PC.STATUS]);
      // 🤝 結盟中的敵御主/敵從者 → 對前端顯示為「盟友*」，即不再列為可攻擊敵蹤
      let fac = String(r[COL.PC.FACTION] || "");
      const rawFac = fac;
      const allied = (fac === "敵御主" || fac === "敵從者") && /【盟約至】\d+/.test(String(r[COL.PC.MEMORY] || ""));
      if (allied) fac = (fac === "敵御主") ? "盟友御主" : "盟友從者";
      // 🤝 情報共享：有盟友在世時，揭露敵從者／盟友從者的職階（盟友通報的敵情）
      const isServantKind = (rawFac === "敵從者" || rawFac === "從者");
      const revealCls = (hasAlly && isServantKind) ? String(r[COL.PC.RANK] || "") : "";
      // 🕯️ 喪失從者的敵御主：標記如何痛失從者，供 AI 演出形單影隻、無牙的御主
      const lostSv = (rawFac === "敵御主") ? getLostServant_(r[COL.PC.MEMORY]) : "";
      // 🔗 敵對歸屬硬連結：御主→其從者、從者→其御主，讓多組同場時 AI 不張冠李戴
      const pairMaster = (rawFac === "敵從者") ? getServantMaster_(r[COL.PC.MEMORY]) : "";
      const pairServant = (rawFac === "敵御主") ? getMasterServant_(r[COL.PC.MEMORY]) : "";
      localPeopleList.push({
        id: r[COL.PC.ID], isPC: String(r[COL.PC.ID]).startsWith("PC_"), name: tName, status: finalDisplayStatus,
        pref: r[COL.PC.PREF] || "神祕莫測", relTag: relRecord ? relRecord[COL.REL.TAG] : "萍水相逢", relVal: rVal,
        loc: tLoc, isExact: (tLoc === safeCurL), isHighRel: (rVal >= 60), isParty: rIsParty,
        faction: fac, allied: allied, intelCls: revealCls, lostServant: lostSv,
        master: pairMaster, servant: pairServant,
        busyWith: otherParty ? otherParty[COL.REL.PC] : null, hp: r[COL.PC.HP], mp: r[COL.PC.MP]
      });
    }
  }
  return localPeopleList;
}

function getNearbyLocations(currentLoc, mapData) {
  if (!currentLoc) return [];
  const rootLoc = String(currentLoc).split('-')[0].trim();
  const parentInfo = mapData.find(m => String(m[COL.MAP.NAME]).trim() === rootLoc);
  let pCoord = parentInfo && parentInfo[COL.MAP.COORD] ? String(parentInfo[COL.MAP.COORD]).split(',').map(Number) : [0, 0];
  if (isNaN(pCoord[0]) || isNaN(pCoord[1])) pCoord = [0, 0];

  let nearbyLocs = [];
  for (let i = 1; i < mapData.length; i++) {
    const mName = String(mapData[i][COL.MAP.NAME]).trim();
    if (!mName || mName === rootLoc || mName.startsWith(rootLoc + "-")) continue;
    let coords = mapData[i][COL.MAP.COORD] ? String(mapData[i][COL.MAP.COORD]).split(',').map(Number) : [0, 0];
    if (isNaN(coords[0]) || isNaN(coords[1])) coords = [0, 0];
    nearbyLocs.push({ name: mName, type: mapData[i][COL.MAP.TYPE] || "荒野", desc: mapData[i][COL.MAP.DESC] || "一處未知的地帶。", dist: Math.abs(coords[0] - pCoord[0]) + Math.abs(coords[1] - pCoord[1]) });
  }
  return nearbyLocs.sort((a, b) => a.dist - b.dist).slice(0, 5);
}

// 🟢 提供前端注入用：唯一真實來源
function getRealmConstantsJson() {
  return JSON.stringify({ REALMS, REALM_MODIFIERS, REALM_LIMITS });
}
