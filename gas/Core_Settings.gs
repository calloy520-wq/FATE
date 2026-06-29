// ==========================================
// 命運停駐之夜 - 核心系統 (2026.05 雙軌防護 + JSON結構化批量I/O 極致優化版)
// 🔴【第一部分：基礎設定、ORM 映射與數值統計核心】Core_Settings.gs
// ==========================================

// 🔵 金鑰相容：舊版原本叫 API_KEY，FATE Script 存的是 OPENROUTER_API_KEY；兩個名字都吃，免改 Script 屬性
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
  // 🎴 FATE 專屬眾生 schema（2026-06 砍舊經濟/生活/五圍後，25 欄）。
  //   已移除：財帛(MONEY)、裝備(WEP/ARM/ACC1/ACC2)、生活技能(LIFESKILL)、冗餘職階(CLS)、
  //   舊數值五圍(STR/CON/AGI/INT/LUK)——FATE 戰鬥吃六圍 SIX 階級，HP/MP 由 SIX 推算。
  PC: {
    ID: 0, NAME: 1, SEX: 2, BACK: 3, STATUS: 4, TRAIT: 5, LOC: 6, PREF: 7,
    HP: 8, MP: 9, MAX_HP: 10, MAX_MP: 11,
    REALM: 12, MEMORY: 13, INTENT: 14, FACTION: 15, RANK: 16, CONTRIB: 17, ALIGN: 18,
    PHYSICAL: 19, MARTIAL: 20, GAME_ID: 21, SIX: 22, TAGS: 23, SEEN: 24
  },
  REL: { PC: 0, NPC: 1, FAV: 2, TAG: 3, IS_PARTY: 4, MEMORY: 5, MAJOR_EVENT: 6 },
  MAP: { REGION: 0, NAME: 1, TYPE: 2, COORD: 3, DESC: 4, PARENT: 5 },
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

// 🗑️ 舊階級制(REALMS/REALM_MODIFIERS/REALM_LIMITS)、背包/倉儲/懸賞上限、
//   物品稀有度(RARITY_TABLE/getRarityPoints)、貨幣(CURRENCY_TABLE/getCurrencyValue)、
//   物品類別判定(detectItemType) 全數移除——FATE 雙軌不含階級/物品/金錢經濟。

// 🟢 共用 D20 骰子：1=大失敗、20=大成功
function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}


// ==========================================
// ★ 階段二：通用輔助模組 (Helper Functions)
// ==========================================

// 🟢 姓名限定純中文：移除所有非中日韓統一表意文字(CJK 含擴展A)的字元——英數、符號、空白、emoji 全部濾除。
// 全系統唯一真實來源；前端只做提示與即時擋字，後端此函式才是最終防線。回傳清洗後字串(上限10字)。
function cleanChineseName(s) {
  return String(s == null ? "" : s).replace(/[^㐀-䶿一-鿿]/g, "").slice(0, 10);
}

// 🎴 FATE HP/MP 推算（無階級倍率）：耐久→HP、魔力→MP。取代已移除的舊階級·屬性上限計算器。
function fateMaxHpMp_(con, mag) {
  return {
    hp: 100 + (parseInt(con) || 10) * 10,
    mp: 50 + (parseInt(mag) || 10) * 10
  };
}

// 🎴 從一列的六圍 SIX 推 HP/MP（耐久→con、魔力→mag）。
function maxStatsForRow_(row) {
  var six = {}; try { six = JSON.parse(row[COL.PC.SIX] || "{}"); } catch (e) { }
  return fateMaxHpMp_(svNum_(six["耐久"] || "E"), svNum_(six["魔力"] || "E"));
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

// 🗑️ registerFactionHelper（自動註冊勢力）、updateFactionPower（勢力氣運）、
//   resolveItemName / transferMoney 已隨舊勢力·物品·金錢經濟移除（無呼叫者）。

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
    selfRow[COL.PC.HP], selfRow[COL.PC.MP], totals ? totals.STR : "", totals ? totals.CON : "",
    totals ? totals.AGI : "", totals ? totals.INT : "", totals ? totals.LUK : "",
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
  const cachedMap = cache.get("FATE_MAP_DATA");
  if (cachedMap) return JSON.parse(cachedMap);

  const freshData = sheets.map.getDataRange().getValues();
  cache.put("FATE_MAP_DATA", JSON.stringify(freshData), 3600);
  return freshData;
}

function getCharacterTotalStats(charId, sheets, cachedPcData = null, cachedItemData = null) {
  const pcData = cachedPcData || sheets.pc.getDataRange().getValues();
  const row = pcData.find(r => r[COL.PC.ID] === charId);
  if (!row) return null;

  // 🎴 FATE 六圍制：數值五圍(STR~LUK 欄)已棄用，顯示用值改由六圍 SIX 階級直接推導(svNum_)，無階級倍率。
  let six = {}; try { six = JSON.parse(row[COL.PC.SIX] || "{}"); } catch (e) { }
  const fromSix_ = (k) => svNum_(six[k] || "E");
  let baseSTR = fromSix_("筋力"), baseCON = fromSix_("耐久"), baseAGI = fromSix_("敏捷"), baseINT = fromSix_("魔力"), baseLUK = fromSix_("幸運");

  // 🗑️ 裝備系統亦已棄用：回傳維持原形狀(WEP/wepSTR/armCON/wepName/armName 供下游沿用)，恆為空/0。
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
