// ==========================================
// 九州江湖 - 天道核心系統 (2026.05 雙軌防護 + JSON結構化批量I/O 極致優化版)
// 🔴【第一部分：基礎設定、ORM 映射與數值統計核心】Core_Settings.gs
// ==========================================

const API_KEY = PropertiesService.getScriptProperties().getProperty('API_KEY');
const MODEL_URL = "https://openrouter.ai/api/v1/chat/completions";

// ==========================================
// ★ 階段一：ORM 資料實體映射 (Data Mapping) 
// ==========================================
const COL = {
  PC: {
    ID: 0, NAME: 1, SEX: 2, BACK: 3, STATUS: 4, MONEY: 5, TRAIT: 6, LOC: 7, PREF: 8,
    HP: 9, MP: 10, STR: 11, CON: 12, AGI: 13, INT: 14, LUK: 15, MAX_HP: 16, MAX_MP: 17,
    WEP: 18, ARM: 19, ACC1: 20, ACC2: 21, REALM: 22, MEMORY: 23, INTENT: 24,
    FACTION: 25, RANK: 26, CONTRIB: 27, ALIGN: 28, PHYSICAL: 29, MARTIAL: 30,
    LIFESKILL: 31
  },
  ITEM: { NAME: 0, TYPE: 1, DESC: 2, PRICE: 3, OWNER: 4, STR: 5, CON: 6, AGI: 7, INT: 8, LUK: 9, ID: 10, LOC2: 11 },
  REL: { PC: 0, NPC: 1, FAV: 2, TAG: 3, IS_PARTY: 4, MEMORY: 5, MAJOR_EVENT: 6 },
  QUEST: { PC: 0, NAME: 1, TARGET: 2, STATUS: 3, MONEY: 4, ITEM: 5, REWARD_LOCKED: 6, DEADLINE: 7 },
  MAP: { REGION: 0, NAME: 1, TYPE: 2, COORD: 3, DESC: 4, PARENT: 5 },
  TASK: { OWNER: 0, FACILITY: 1, WORKER: 2, TARGET: 3, START_TIME: 4 },
  FACTION: { ID: 0, NAME: 1, ALIGN: 2, BASE: 3, LEADER: 4, MOTTO: 5 },
  MAIL: { ID: 0, SENDER: 1, RECEIVER: 2, CONTENT: 3, ITEM_ID: 4, ITEM_NAME: 5, STATUS: 6, TIME: 7 },
  AUTH: { NAME: 0, ID: 1, TITLE: 2, HOME_LOC: 3, DECOR: 4 },
  SHOP: { OWNER: 0, NAME: 1, CATEGORY: 2, DESC: 3, LOC: 4, VAULT: 5, LAST_SETTLE: 6 }
};

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

function resolveItemName(idOrName, itemData) {
  if (!idOrName) return "";
  const strVal = String(idOrName).trim();
  if (!itemData) return strVal.startsWith("ITM_") ? "" : strVal;
  const found = itemData.find(i => i[COL.ITEM.ID] === strVal);
  if (found) return found[COL.ITEM.NAME];
  return strVal.startsWith("ITM_") ? "" : strVal;
}

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
  const wName = resolveItemName(selfRow[COL.PC.WEP], itemData);
  const aName = resolveItemName(selfRow[COL.PC.ARM], itemData);
  const ac1Name = resolveItemName(selfRow[COL.PC.ACC1], itemData);
  const ac2Name = resolveItemName(selfRow[COL.PC.ACC2], itemData);

  const safeMemory = String(selfRow[COL.PC.MEMORY] || "").replace(/\|/g, '@@@');
  const safeRelMem = String(relMem || "").replace(/\|/g, '@@@');
  const maskedPhysical = maskPhysicalStatus(selfRow[COL.PC.PHYSICAL] || "{}", isNsfwMode);
  const safePhysical = String(maskedPhysical).replace(/§/g, '###');
  const visibleStatusStr = buildVisibleStatusString(selfRow[COL.PC.STATUS]);
  const safeLifeskill = String(selfRow[COL.PC.LIFESKILL] || "{}").replace(/§/g, '###');

  return [
    visibleStatusStr, selfRow[COL.PC.MONEY], selfRow[COL.PC.TRAIT], selfRow[COL.PC.LOC], selfRow[COL.PC.PREF],
    selfRow[COL.PC.HP], selfRow[COL.PC.MP], totals ? totals.STR : selfRow[COL.PC.STR], totals ? totals.CON : selfRow[COL.PC.CON],
    totals ? totals.AGI : selfRow[COL.PC.AGI], totals ? totals.INT : selfRow[COL.PC.INT], totals ? totals.LUK : selfRow[COL.PC.LUK],
    wName, aName, ac1Name, ac2Name, selfRow[COL.PC.REALM], safeMemory, safeRelMem, selfRow[COL.PC.FACTION],
    selfRow[COL.PC.RANK], selfRow[COL.PC.ALIGN], selfRow[COL.PC.CONTRIB], selfRow[COL.PC.BACK], safePhysical,
    selfRow[COL.PC.INTENT], selfRow[COL.PC.MARTIAL], safeLifeskill
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

  let eqWeapon = row[COL.PC.WEP] ? String(row[COL.PC.WEP]).trim() : "";
  let eqArmor = row[COL.PC.ARM] ? String(row[COL.PC.ARM]).trim() : "";
  let eqAcc1 = row[COL.PC.ACC1] ? String(row[COL.PC.ACC1]).trim() : "";
  let eqAcc2 = row[COL.PC.ACC2] ? String(row[COL.PC.ACC2]).trim() : "";

  let addSTR = 0, addCON = 0, addAGI = 0, addINT = 0, addLUK = 0;
  let wepSTR = 0, armCON = 0, wepName = "", armName = ""; // 🔴 武器/防具本體的原始加成與名稱(不灌realm倍率)，傷害公式跟AI敘述都拿來用，跟骰子命中率脫鉤
  const equippedItems = [eqWeapon, eqArmor, eqAcc1, eqAcc2].filter(name => name !== "");

  if (equippedItems.length > 0 && (cachedItemData || sheets.item)) {
    const itemData = cachedItemData || sheets.item.getDataRange().getValues();
    equippedItems.forEach(eqIdOrName => {
      const itemRow = itemData.find(r => (r[COL.ITEM.ID] === eqIdOrName || r[COL.ITEM.NAME] === eqIdOrName) && r[COL.ITEM.OWNER] === charId);
      if (itemRow) {
        const iSTR = parseInt(itemRow[COL.ITEM.STR]) || 0, iCON = parseInt(itemRow[COL.ITEM.CON]) || 0;
        addSTR += iSTR; addCON += iCON;
        addAGI += parseInt(itemRow[COL.ITEM.AGI]) || 0; addINT += parseInt(itemRow[COL.ITEM.INT]) || 0; addLUK += parseInt(itemRow[COL.ITEM.LUK]) || 0;
        if (eqIdOrName === eqWeapon) { wepSTR = iSTR; wepName = itemRow[COL.ITEM.NAME]; }
        if (eqIdOrName === eqArmor) { armCON = iCON; armName = itemRow[COL.ITEM.NAME]; }
      }
    });
  }

  return {
    id: charId, name: row[COL.PC.NAME], hp: parseInt(row[COL.PC.HP]) || 100, maxHp: parseInt(row[COL.PC.MAX_HP]) || 100,
    STR: baseSTR + addSTR, CON: baseCON + addCON, AGI: baseAGI + addAGI, INT: baseINT + addINT, LUK: baseLUK + addLUK,
    WEP: eqWeapon, ARM: eqArmor, wepSTR: wepSTR, armCON: armCON, wepName: wepName, armName: armName
  };
}

// ==========================================
// 🔴 狀態掃描器與地理雷達
// ==========================================

function getLocalPeopleList(sheets, pcName, pcId, curL, relData, taskData, allPcData) {
  if (!allPcData) allPcData = sheets.pc.getDataRange().getValues();
  const localPeopleList = [];
  const safeCurL = String(curL || "");

  for (let i = 1; i < allPcData.length; i++) {
    const r = allPcData[i];
    if (r[COL.PC.ID] == pcId || String(r[COL.PC.ID]).startsWith("DEAD_")) continue;

    const tLoc = String(r[COL.PC.LOC] || ""); const tName = r[COL.PC.NAME];
    const relRecord = relData.find(row => row[COL.REL.PC] === pcName && row[COL.REL.NPC] === tName);
    const rVal = relRecord ? parseInt(relRecord[COL.REL.FAV]) || 0 : 0;
    const rIsParty = relRecord ? (relRecord[COL.REL.IS_PARTY] === "同行") : false;
    const otherParty = relData.find(row => row[COL.REL.NPC] === tName && row[COL.REL.IS_PARTY] === "同行" && row[COL.REL.PC] !== pcName);

    if (tLoc === safeCurL || rVal >= 60 || rIsParty) {
      let finalDisplayStatus = buildVisibleStatusString(r[COL.PC.STATUS]);
      localPeopleList.push({
        id: r[COL.PC.ID], isPC: String(r[COL.PC.ID]).startsWith("PC_"), name: tName, status: finalDisplayStatus,
        pref: r[COL.PC.PREF] || "神祕莫測", relTag: relRecord ? relRecord[COL.REL.TAG] : "萍水相逢", relVal: rVal,
        loc: tLoc, isExact: (tLoc === safeCurL), isHighRel: (rVal >= 60), isParty: rIsParty,
        busyWith: otherParty ? otherParty[COL.REL.PC] : null, hp: r[COL.PC.HP], mp: r[COL.PC.MP]
      });
    }
  }
  return localPeopleList;
}

// 💰 通用銀兩轉移：fromName 給 toName 轉 amount 兩
// 回傳 { success, message }；不夠錢、找不到人都會擋
// pcDataRef 可選：若呼叫端已讀好 pcData 就傳進來共用(避免重讀)，並會就地改值
function transferMoney(fromName, toName, amount, sheets, pcDataRef = null) {
  amount = parseInt(amount) || 0;
  if (amount <= 0) return { success: false, message: "轉移金額必須大於 0。" };
  if (fromName === toName) return { success: false, message: "不能轉給自己。" };

  const pcData = pcDataRef || sheets.pc.getDataRange().getValues();
  const fromIdx = pcData.findIndex(r => r[COL.PC.NAME] === fromName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  const toIdx   = pcData.findIndex(r => r[COL.PC.NAME] === toName   && !String(r[COL.PC.ID]).startsWith("DEAD_"));

  if (fromIdx === -1) return { success: false, message: `找不到「${fromName}」。` };
  if (toIdx === -1)   return { success: false, message: `找不到「${toName}」。` };

  const fromMoney = parseInt(pcData[fromIdx][COL.PC.MONEY]) || 0;
  if (fromMoney < amount) {
    return { success: false, message: `「${fromName}」身上只有 ${fromMoney} 兩，不足以給出 ${amount} 兩。` };
  }

  // 扣款方、收款方
  const newFrom = fromMoney - amount;
  const newTo   = (parseInt(pcData[toIdx][COL.PC.MONEY]) || 0) + amount;
  pcData[fromIdx][COL.PC.MONEY] = newFrom;
  pcData[toIdx][COL.PC.MONEY]   = newTo;

  // 寫回試算表(只寫這兩格，精準不傷其他資料)
  sheets.pc.getRange(fromIdx + 1, COL.PC.MONEY + 1).setValue(newFrom);
  sheets.pc.getRange(toIdx + 1, COL.PC.MONEY + 1).setValue(newTo);

  return {
    success: true,
    message: `「${fromName}」給了「${toName}」${amount} 兩白銀。`,
    fromIdx, toIdx, newFrom, newTo
  };
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
