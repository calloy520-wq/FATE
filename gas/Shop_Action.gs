// ==========================================
// 🏪 開店系統 Shop_Action.gs
// ==========================================

const SHOP_CREATE_COST = 2000;
const SHOP_VAULT_TIERS = [
  { min: 0, rate: 0.5 },
  { min: 1000, rate: 2 },
  { min: 10000, rate: 8 },
  { min: 100000, rate: 20 }
];
const SHOP_VAULT_MAX_ACCUMULATE_MS = 24 * 60 * 60 * 1000;
const SHOP_BUSINESS_COOLDOWN_SEC = 20;

function getShopVaultRate(vaultMoney) {
  let rate = SHOP_VAULT_TIERS[0].rate;
  for (const tier of SHOP_VAULT_TIERS) {
    if (vaultMoney >= tier.min) rate = tier.rate;
  }
  return rate;
}

function findShopIdxByOwner(shopData, pcId) {
  return shopData.findIndex(r => String(r[COL.SHOP.OWNER]) === String(pcId));
}

function isAtOwnShop(pcData, pIdx, shopLoc) {
  return pIdx !== -1 && String(pcData[pIdx][COL.PC.LOC] || "").trim() === shopLoc;
}

// 🟢 誰在店裡：跟 actionHomeGet 的「居所同住者」判斷邏輯一致，
// 客人是不是「同行」狀態，純粹比對 PC.LOC 是否落在店鋪全名，無需另開欄位記錄。
function getShopGuests(pcData, relData, shopLoc, myName) {
  return pcData.filter((r, i) =>
    i > 0 &&
    String(r[COL.PC.LOC] || "").trim() === shopLoc &&
    r[COL.PC.NAME] !== myName &&
    !String(r[COL.PC.ID]).startsWith("DEAD_")
  ).map(r => {
    const rel = relData.find(x => x[COL.REL.PC] === myName && x[COL.REL.NPC] === r[COL.PC.NAME]);
    return {
      name: r[COL.PC.NAME],
      fav: rel ? (parseInt(rel[COL.REL.FAV]) || 0) : 0,
      tag: rel ? rel[COL.REL.TAG] : "萍水相逢",
      isParty: rel ? rel[COL.REL.IS_PARTY] === "同行" : false
    };
  });
}

// 🔴 結算小金庫應計利息並存入背包，回傳實際入帳金額(可能為0)。
// 共用於「結算」按鈕，以及「存入/取出」前置——確保動本金前已發生的收益不會被回頭套利。
function settleShopVault(sheets, shopData, sIdx, pcData, pIdx) {
  const vaultMoney = parseInt(shopData[sIdx][COL.SHOP.VAULT]) || 0;
  const lastSettle = parseInt(shopData[sIdx][COL.SHOP.LAST_SETTLE]) || Date.now();
  const now = Date.now();
  const elapsed = Math.min(now - lastSettle, SHOP_VAULT_MAX_ACCUMULATE_MS);
  const earned = Math.floor(getShopVaultRate(vaultMoney) * (elapsed / (60 * 60 * 1000)));

  shopData[sIdx][COL.SHOP.LAST_SETTLE] = now;
  sheets.shop.getRange(sIdx + 1, COL.SHOP.LAST_SETTLE + 1).setValue(now);

  if (earned > 0) {
    const newMoney = (parseInt(pcData[pIdx][COL.PC.MONEY]) || 0) + earned;
    pcData[pIdx][COL.PC.MONEY] = newMoney;
    sheets.pc.getRange(pIdx + 1, COL.PC.MONEY + 1).setValue(newMoney);
  }
  return earned;
}

// ------------------------------------------
// 查我的店
// ------------------------------------------
function actionShopGet(userData, pcId, sheets) {
  if (!sheets.shop) return JSON.stringify({ success: false, message: "店鋪表不存在" });

  const shopData = sheets.shop.getDataRange().getValues();
  const sIdx = findShopIdxByOwner(shopData, pcId);
  if (sIdx === -1) return JSON.stringify({ success: true, hasShop: false });

  const row = shopData[sIdx];
  const shopLoc = String(row[COL.SHOP.LOC]).trim();
  const pcData = sheets.pc.getDataRange().getValues();
  const myRow = pcData.find(r => r[COL.PC.ID] == pcId);
  const myName = myRow ? myRow[COL.PC.NAME] : "";
  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];

  const vaultMoney = parseInt(row[COL.SHOP.VAULT]) || 0;
  return JSON.stringify({
    success: true, hasShop: true,
    shopName: row[COL.SHOP.NAME], category: row[COL.SHOP.CATEGORY], desc: row[COL.SHOP.DESC],
    loc: shopLoc, vaultMoney: vaultMoney, vaultRate: getShopVaultRate(vaultMoney),
    guests: getShopGuests(pcData, relData, shopLoc, myName)
  });
}

// ------------------------------------------
// 開店(一次性、不可變更)
// ------------------------------------------
function actionShopCreate(userData, pcId, sheets) {
  if (!sheets.shop) return JSON.stringify({ success: false, message: "店鋪表不存在" });

  const shopName = String(userData.shopName || "").trim();
  const category = String(userData.category || "").trim();
  const desc = String(userData.desc || "").trim();
  if (!shopName || !category || !desc) return JSON.stringify({ success: false, message: "店名、類別、服務內容皆不可空白。" });
  if (shopName.includes("-")) return JSON.stringify({ success: false, message: "店名不可含「-」符號。" });
  if (shopName.length > 8) return JSON.stringify({ success: false, message: "店名不可超過 8 字。" });
  if (category.length > 10) return JSON.stringify({ success: false, message: "類別不可超過 10 字。" });
  if (desc.length > 150) return JSON.stringify({ success: false, message: "服務內容不可超過 150 字。" });

  const shopData = sheets.shop.getDataRange().getValues();
  if (findShopIdxByOwner(shopData, pcId) !== -1) {
    return JSON.stringify({ success: false, message: "你已有一間店鋪，無法另開分號。" });
  }

  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  const money = parseInt(pcData[pIdx][COL.PC.MONEY]) || 0;
  if (money < SHOP_CREATE_COST) {
    return JSON.stringify({ success: false, message: `開店需 ${SHOP_CREATE_COST} 兩白銀，你的盤纏不足。` });
  }

  const curLoc = String(pcData[pIdx][COL.PC.LOC] || "").split('-')[0].trim() || "青丘城";
  const pcName = pcData[pIdx][COL.PC.NAME];
  // 🔴 子地點改為以「玩家姓名」命名，方便系統識別產業歸屬並顯示於輿圖
  const shopFullName = `${curLoc}-${pcName}的店鋪`;

  const mapData = sheets.map.getDataRange().getValues();
  if (mapData.some(m => String(m[COL.MAP.NAME]).trim() === shopFullName)) {
    return JSON.stringify({ success: false, message: "此地已有同名建築，請另取店名。" });
  }

  let pCoord = "0,0";
  const parentMap = mapData.find(m => String(m[COL.MAP.NAME]).trim() === curLoc);
  if (parentMap && parentMap[COL.MAP.COORD]) {
    const parts = String(parentMap[COL.MAP.COORD]).split(',');
    const bx = parseInt(parts[0]) || 0, by = parseInt(parts[1]) || 0;
    pCoord = `${bx + Math.floor(Math.random() * 5) - 2},${by + Math.floor(Math.random() * 5) - 2}`;
  }
  sheets.map.appendRow(["九州", shopFullName, "店鋪", pCoord, `『${shopName}』，經營項目：${category}。${desc}`, curLoc]);
  CacheService.getScriptCache().remove("KYUSHU_MAP_DATA");

  sheets.shop.appendRow([pcId, shopName, category, desc, shopFullName, 0, Date.now()]);

  pcData[pIdx][COL.PC.MONEY] = money - SHOP_CREATE_COST;
  pcData[pIdx][COL.PC.LOC] = shopFullName;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);

  if (sheets.epic) {
    sheets.epic.appendRow([pcId, `【開店立業】在 ${curLoc} 開了一間「${shopName}」(${category})。`, new Date()]);
  }

  return JSON.stringify({
    success: true,
    message: `🏪 你在「${curLoc}」開了一間店「${shopName}」！`,
    statusString: getFreshStatusString(pcId, pIdx, sheets),
    shopLoc: shopFullName
  });
}

// ------------------------------------------
// 指定招待：下拉選單只列對玩家已傾心的NPC，選中即把她的人挪進店裡。
// 不單獨記錄「目前客人」欄位——誰在店裡，直接看 PC.LOC 是否等於店鋪全名即可，
// 可以陸續招待多人，跟朋友來家裡玩一樣不限一位。
// ------------------------------------------
function actionShopInviteGuest(userData, pcId, sheets) {
  if (!sheets.shop || !sheets.rel) return JSON.stringify({ success: false, message: "天道異常：表不存在" });

  const npcName = String(userData.npcName || "").trim();
  if (!npcName) return JSON.stringify({ success: false, message: "請指定招待對象。" });

  const shopData = sheets.shop.getDataRange().getValues();
  const sIdx = findShopIdxByOwner(shopData, pcId);
  if (sIdx === -1) return JSON.stringify({ success: false, message: "你尚未開店。" });
  const shopLoc = String(shopData[sIdx][COL.SHOP.LOC]).trim();

  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });
  if (!isAtOwnShop(pcData, pIdx, shopLoc)) return JSON.stringify({ success: false, message: "你不在自己的店裡，無法招待客人。" });

  const myName = pcData[pIdx][COL.PC.NAME];
  const relData = sheets.rel.getDataRange().getValues();
  const rIdx = relData.findIndex(r => r[COL.REL.PC] === myName && r[COL.REL.NPC] === npcName);
  const fav = rIdx !== -1 ? (parseInt(relData[rIdx][COL.REL.FAV]) || 0) : 0;
  const isSoulBound = rIdx !== -1 && String(relData[rIdx][COL.REL.TAG] || "").includes("(已傾心)");
  if (fav < 100 || !isSoulBound) {
    return JSON.stringify({ success: false, message: `「${npcName}」尚未對你傾心，無法招待入店。` });
  }

  const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === npcName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "查無此人。" });
  if (String(pcData[nIdx][COL.PC.LOC] || "").trim() === shopLoc) {
    return JSON.stringify({ success: false, message: `「${npcName}」已經在店裡了。` });
  }

  const isBusy = relData.find(r => r[COL.REL.NPC] === npcName && r[COL.REL.IS_PARTY] === "同行" && r[COL.REL.PC] !== myName);
  if (isBusy) return JSON.stringify({ success: false, message: `天道阻礙：「${npcName}」已與『${isBusy[COL.REL.PC]}』結伴，無法招待！` });

  pcData[nIdx][COL.PC.LOC] = shopLoc;
  sheets.pc.getRange(nIdx + 1, COL.PC.LOC + 1).setValue(shopLoc);

  return JSON.stringify({ success: true, message: `你將「${npcName}」招待入店。` });
}

// ------------------------------------------
// 送客：店裡所有「非同行」的客人一次送走，統一送回母地區，不再分散到子地點。
// 同行的夥伴視為自己人，不算客人，不在送客範圍內。
// ------------------------------------------
function actionShopDismissGuest(userData, pcId, sheets) {
  if (!sheets.shop) return JSON.stringify({ success: false, message: "店鋪表不存在" });

  const shopData = sheets.shop.getDataRange().getValues();
  const sIdx = findShopIdxByOwner(shopData, pcId);
  if (sIdx === -1) return JSON.stringify({ success: false, message: "你尚未開店。" });
  const shopLoc = String(shopData[sIdx][COL.SHOP.LOC]).trim();

  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });
  if (!isAtOwnShop(pcData, pIdx, shopLoc)) return JSON.stringify({ success: false, message: "你不在自己的店裡，無法送客。" });

  const myName = pcData[pIdx][COL.PC.NAME];
  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  const guests = getShopGuests(pcData, relData, shopLoc, myName);
  const toSend = guests.filter(g => !g.isParty);
  if (toSend.length === 0) return JSON.stringify({ success: false, message: "店裡目前沒有需要遣走的客人。" });

  const rootLoc = shopLoc.split('-')[0].trim();
  const sentNames = [];

  toSend.forEach(g => {
    const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === g.name && !String(r[COL.PC.ID]).startsWith("DEAD_"));
    if (nIdx !== -1) {
      pcData[nIdx][COL.PC.LOC] = rootLoc;
      sheets.pc.getRange(nIdx + 1, COL.PC.LOC + 1).setValue(rootLoc);
      sentNames.push(`「${g.name}」往「${rootLoc}」去了`);
    }
  });

  return JSON.stringify({ success: true, message: sentNames.join("<br>") });
}

// ------------------------------------------
// 營業：純敘事，背景客人風味文字，短冷卻防連點
// ------------------------------------------
function actionShopBusiness(userData, pcId, sheets) {
  if (!sheets.shop) return JSON.stringify({ success: false, message: "店鋪表不存在" });

  const cache = CacheService.getScriptCache();
  const cacheKey = `SHOP_BIZ_${pcId}`;
  if (cache.get(cacheKey)) {
    return JSON.stringify({ success: false, message: "客人剛走，且讓我緩口氣再說。" });
  }

  const shopData = sheets.shop.getDataRange().getValues();
  const sIdx = findShopIdxByOwner(shopData, pcId);
  if (sIdx === -1) return JSON.stringify({ success: false, message: "你尚未開店。" });
  const shopLoc = String(shopData[sIdx][COL.SHOP.LOC]).trim();

  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (!isAtOwnShop(pcData, pIdx, shopLoc)) return JSON.stringify({ success: false, message: "你不在自己的店裡，無法營業。" });

  const { isNsfw, promptText } = userData;
  const shopName = shopData[sIdx][COL.SHOP.NAME];
  const category = shopData[sIdx][COL.SHOP.CATEGORY];

  const miniSystem = `你是九州說書人。用日系武俠輕小說筆觸、第一人稱「我」、強制台灣繁體中文，描寫一小段「${shopName}」(${category})裡背景客人來來去去的風味文字（100~200字）。
【鐵律】
1. 旁白第一人稱「我」(店主)，禁用「你」與上帝視角。
2. 出現的路人客人只活在這段文字裡，禁止給出可互動的具體姓名角色，純粹氛圍描寫。
3. 強制分段：每2~3句插入 <br><br>，整段至少2個 <br><br>，禁止整坨。換行一律用 <br><br>，禁止真實換行，禁止輸出任何 HTML 標籤。
4. 只輸出 JSON：{"narration":"你的敘述，內含<br><br>分段"}，禁止任何其他欄位、禁止 Markdown。`;

  const raw = callGeminiAPI(String(promptText || "描寫店內此刻的尋常生意光景。").trim(), miniSystem, {
    temperature: 0.85,
    ignoreLaw: true,
    max_tokens: 500,
    model: "google/gemini-3.1-flash-lite",
    isNsfwMode: !!isNsfw
  });

  cache.put(cacheKey, "1", SHOP_BUSINESS_COOLDOWN_SEC);

  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const data = JSON.parse(raw.substring(start, end + 1));
    return JSON.stringify({ success: true, text: data.narration || "客人三三兩兩，尋常一日。" });
  } catch (e) {
    return JSON.stringify({ success: true, text: "（門外人聲鼎沸，倒也說不清誰來過誰走了。）" });
  }
}

// ------------------------------------------
// 結算：依小金庫本金的門檁速率，按經過的真實時間入帳
// ------------------------------------------
function actionShopSettle(userData, pcId, sheets) {
  if (!sheets.shop) return JSON.stringify({ success: false, message: "店鋪表不存在" });

  const shopData = sheets.shop.getDataRange().getValues();
  const sIdx = findShopIdxByOwner(shopData, pcId);
  if (sIdx === -1) return JSON.stringify({ success: false, message: "你尚未開店。" });
  const shopLoc = String(shopData[sIdx][COL.SHOP.LOC]).trim();

  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });
  if (!isAtOwnShop(pcData, pIdx, shopLoc)) return JSON.stringify({ success: false, message: "你不在自己的店裡，無法結算。" });

  const earned = settleShopVault(sheets, shopData, sIdx, pcData, pIdx);
  if (earned <= 0) return JSON.stringify({ success: false, message: "小金庫尚未匯聚出新的收益。" });

  return JSON.stringify({
    success: true,
    message: `結算小金庫，入帳 ${earned} 兩白銀。`,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// ------------------------------------------
// 資金注入：銀行式存提，動本金前先結清應計利息
// ------------------------------------------
function actionShopVaultDeposit(userData, pcId, sheets) {
  if (!sheets.shop) return JSON.stringify({ success: false, message: "店鋪表不存在" });

  const amount = parseInt(userData.amount) || 0;
  if (amount <= 0) return JSON.stringify({ success: false, message: "存入金額須為正整數。" });

  const shopData = sheets.shop.getDataRange().getValues();
  const sIdx = findShopIdxByOwner(shopData, pcId);
  if (sIdx === -1) return JSON.stringify({ success: false, message: "你尚未開店。" });
  const shopLoc = String(shopData[sIdx][COL.SHOP.LOC]).trim();

  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });
  if (!isAtOwnShop(pcData, pIdx, shopLoc)) return JSON.stringify({ success: false, message: "你不在自己的店裡，無法操作小金庫。" });

  settleShopVault(sheets, shopData, sIdx, pcData, pIdx);

  const money = parseInt(pcData[pIdx][COL.PC.MONEY]) || 0;
  if (money < amount) return JSON.stringify({ success: false, message: "盤纏不足，無法存入這麼多。" });

  const newVault = (parseInt(shopData[sIdx][COL.SHOP.VAULT]) || 0) + amount;
  sheets.shop.getRange(sIdx + 1, COL.SHOP.VAULT + 1).setValue(newVault);

  const newMoney = money - amount;
  pcData[pIdx][COL.PC.MONEY] = newMoney;
  sheets.pc.getRange(pIdx + 1, COL.PC.MONEY + 1).setValue(newMoney);

  return JSON.stringify({
    success: true,
    message: `存入小金庫 ${amount} 兩，目前本金 ${newVault} 兩。`,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

function actionShopVaultWithdraw(userData, pcId, sheets) {
  if (!sheets.shop) return JSON.stringify({ success: false, message: "店鋪表不存在" });

  const amount = parseInt(userData.amount) || 0;
  if (amount <= 0) return JSON.stringify({ success: false, message: "取出金額須為正整數。" });

  const shopData = sheets.shop.getDataRange().getValues();
  const sIdx = findShopIdxByOwner(shopData, pcId);
  if (sIdx === -1) return JSON.stringify({ success: false, message: "你尚未開店。" });
  const shopLoc = String(shopData[sIdx][COL.SHOP.LOC]).trim();

  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });
  if (!isAtOwnShop(pcData, pIdx, shopLoc)) return JSON.stringify({ success: false, message: "你不在自己的店裡，無法操作小金庫。" });

  settleShopVault(sheets, shopData, sIdx, pcData, pIdx);

  const vaultMoney = parseInt(shopData[sIdx][COL.SHOP.VAULT]) || 0;
  if (amount > vaultMoney) return JSON.stringify({ success: false, message: "小金庫本金不足，無法取出這麼多。" });

  const newVault = vaultMoney - amount;
  sheets.shop.getRange(sIdx + 1, COL.SHOP.VAULT + 1).setValue(newVault);

  const newMoney = (parseInt(pcData[pIdx][COL.PC.MONEY]) || 0) + amount;
  pcData[pIdx][COL.PC.MONEY] = newMoney;
  sheets.pc.getRange(pIdx + 1, COL.PC.MONEY + 1).setValue(newMoney);

  return JSON.stringify({
    success: true,
    message: `取出小金庫 ${amount} 兩，目前本金 ${newVault} 兩。`,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// ------------------------------------------
// 關門大吉：結清利息、全額退還本金，清除坤圖與店鋪資料
// 店裡所有人(不分客人或同行)跟著店主一併移回母地圖，比照搬家「家中之人一併隨遷」的邏輯。
// 🔴 前端按下前務必再跳一次確認對話框，這是不可逆操作
// ------------------------------------------
function actionShopClose(userData, pcId, sheets) {
  if (!sheets.shop) return JSON.stringify({ success: false, message: "店鋪表不存在" });

  const shopData = sheets.shop.getDataRange().getValues();
  const sIdx = findShopIdxByOwner(shopData, pcId);
  if (sIdx === -1) return JSON.stringify({ success: false, message: "你尚未開店。" });
  const shopLoc = String(shopData[sIdx][COL.SHOP.LOC]).trim();
  const shopName = shopData[sIdx][COL.SHOP.NAME];
  const rootLoc = shopLoc.split('-')[0].trim();

  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });
  if (!isAtOwnShop(pcData, pIdx, shopLoc)) return JSON.stringify({ success: false, message: "你不在自己的店裡，無法關店。" });

  settleShopVault(sheets, shopData, sIdx, pcData, pIdx);

  // 🔴 全額退還本金(利息已先結清入帳)
  const refund = parseInt(shopData[sIdx][COL.SHOP.VAULT]) || 0;
  const newMoney = (parseInt(pcData[pIdx][COL.PC.MONEY]) || 0) + refund;
  pcData[pIdx][COL.PC.MONEY] = newMoney;
  sheets.pc.getRange(pIdx + 1, COL.PC.MONEY + 1).setValue(newMoney);

  // 🔴 店裡所有人(店主+任何客人/同行)一併移回母地圖，避免有人卡在即將消失的地點
  for (let i = 0; i < pcData.length; i++) {
    if (String(pcData[i][COL.PC.LOC] || "").trim() === shopLoc) {
      pcData[i][COL.PC.LOC] = rootLoc;
      sheets.pc.getRange(i + 1, COL.PC.LOC + 1).setValue(rootLoc);
    }
  }

  const mapData = sheets.map.getDataRange().getValues();
  const mapRowIdx = mapData.findIndex(m => String(m[COL.MAP.NAME]).trim() === shopLoc);
  if (mapRowIdx !== -1) {
    sheets.map.deleteRow(mapRowIdx + 1);
    CacheService.getScriptCache().remove("KYUSHU_MAP_DATA");
  }
  sheets.shop.deleteRow(sIdx + 1);

  return JSON.stringify({
    success: true,
    message: `🏪 你關了「${shopName}」，退回本金 ${refund} 兩，江湖路上又少一間鋪子。`,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}
