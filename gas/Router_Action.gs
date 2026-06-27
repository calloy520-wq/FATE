// ==========================================
// 🔴【第三部分：原生非同步中樞分流器 handleGameAction】Router_Action.gs
// ==========================================

// ------------------------------------------
// 🔹 路由映射表 (Action Router)
// ------------------------------------------
const ActionRouter = {
  "check_name": actionCheckName,
  "account_login": actionAccountLogin,
  "account_new_game": actionAccountNewGame,
  "get_victory_history": actionGetVictoryHistory,
  "claim_grail": actionClaimGrail,
  "list_gallery": actionListGallery,
  "enter_gallery": actionEnterGallery,
  "gallery_talk": actionGalleryTalk,
  "send_mail": actionSendMail,
  "cultivate": actionCultivate,
  "consume_item": actionConsumeItem,
  "use_item_on_npc": actionUseItemOnNpc,
  "breakthrough": actionBreakthrough,
  "empower_npc": actionEmpowerNpc,
  "claim_quest_reward": actionClaimQuestReward,
  "quests": actionQuests,
  "abandon_quest": actionAbandonQuest,
  "inventory": actionInventory,
  "discard_item": actionDiscardItem,
  "sell_item": actionSellItem,
  "warehouse_get": actionWarehouseGet,
  "warehouse_store": actionWarehouseStore,
  "warehouse_retrieve": actionWarehouseRetrieve,
  "estate_get": actionEstateGet,
  "estate_harvest_all": actionEstateHarvestAll,
  "play_dice": actionPlayDice,
  "play_horse_race": actionPlayHorseRace,
  "dismiss_party": actionDismissParty,
  "join_party": actionJoinParty,
  "inspect_npc": actionInspectNpc,
  "request_item_from_npc": actionRequestItemFromNpc,
  "request_discard_npc_item": actionRequestDiscardNpcItem,
  "get_available_gear": actionGetAvailableGear,
  "equip_gear": actionEquipGear,
  "get_full_status": actionGetFullStatus,
  "update_fate": actionUpdateFate,
  "update_rel_tag": actionUpdateRelTag,
  "manual_npc": actionManualNpc,
  "create": actionManualNpc, // create 與 manual_npc 共用同一個邏輯
  "summon_servant": actionSummonServant,
  "get_heroes": actionGetHeroes,
  "get_masters": actionGetMasters,
  "get_tags": actionGetTags,
  "fate_battle": actionFateBattle,
  "use_seal": actionUseSeal,
  "mana_supply": actionManaSupply,
  "scout": actionScout,
  "clear_npc_major_event": actionClearNpcMajorEvent,
  "get_all_categorized_maps": actionGetAllCategorizedMaps,
  "get_map_nodes": actionGetMapNodes,
  "move": actionMove,
  "sync": actionSync,
  "rest": actionRest,
  "get_rumors": actionGetRumors,
  "get_mails": actionGetMails,
  "play": actionPlay,
  "delete_mail": actionDeleteMail,
  "claim_mail_item": actionClaimMailItem,
  "get_faction_info": actionGetFactionInfo,
  "get_epic_history": actionGetEpicHistory,
  "get_ranking": actionGetRanking,
  "promote_rank": actionPromoteRank,
  "create_faction": actionCreateFaction,
  "home_get": actionHomeGet,
  "home_create": actionHomeCreate,
  "home_move": actionHomeMove,
  "home_decorate": actionHomeDecorate,
  "spare_npc": actionSpareNpc,
  "give_money": actionGiveMoney,
  "attack_npc": actionAttackNpc,
  "multi_attack": actionMultiAttack,
  "narrate_only": actionNarrateOnly,
  "multi_attack_narrate": actionMultiAttackNarrate,
  "gift_item": actionGiftItem,
  "execute_npc": actionExecuteNpc,
  "use_item_self": actionUseItemSelf,
  "craft_item": actionCraftItem,
  "steal_npc_item": actionStealNpcItem,
  "buy_intel": actionBuyIntel,
  "lifeskill_gather": actionLifeskillGather,
  "shop_get": actionShopGet,
  "shop_create": actionShopCreate,
  "shop_invite_guest": actionShopInviteGuest,
  "shop_dismiss_guest": actionShopDismissGuest,
  "shop_business": actionShopBusiness,
  "shop_settle": actionShopSettle,
  "shop_vault_deposit": actionShopVaultDeposit,
  "shop_vault_withdraw": actionShopVaultWithdraw,
  "shop_close": actionShopClose,
  "home_invite_guest": actionHomeInviteGuest

};

// ------------------------------------------
// 🔹 主進入點 (Main Entry) - 極致精簡版
// ------------------------------------------
// 🔴 全域輸入防護：所有玩家輸入在進入任何 action handler 前，先在此統一過濾。
//   前端 maxlength/檢查皆可被繞過(devtools、直打API)，故後端必須是唯一可信的防線。
function sanitizeUserData_(userData) {
  // 名稱類欄位禁用 HTML/JS 斷字字元，避免在前端各處 innerHTML/onclick 拼接時被拿來做標籤或屬性逃脫
  const STRICT_NAME_FIELDS = new Set(["name", "npcName", "targetName", "factionName", "newRelName", "shopName"]);
  // 🔴 只在「建立角色/登記NPC」的姓名欄位強制純中文(去英數/符號/空白)；
  //   參照既有角色的欄位(targetName/newRelName 等)不清洗，以免破壞改版前可能存在的非中文名查找。
  const CHINESE_NAME_FIELDS = new Set(["name", "npcName"]);
  const NAME_MAX = 20;
  const GLOBAL_MAX = 2000; // 一般自由文字欄位(訊息/敘述/意圖等)的最終上限，各 handler 仍可再收更緊

  // 控制字元、零寬字元、雙向控制字元 —— 對畫面顯示無意義，只會被用來搞渲染或藏字
  const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
  // 開頭為這些字元、寫入 Google Sheet 儲存格時可能被解讀成公式
  const FORMULA_LEAD_RE = /^[=+\-@\t\r]+/;

  for (const key in userData) {
    if (typeof userData[key] !== "string") continue;
    let v = userData[key].replace(CONTROL_RE, "").replace(FORMULA_LEAD_RE, "");
    if (CHINESE_NAME_FIELDS.has(key)) {
      v = cleanChineseName(v);
    } else if (STRICT_NAME_FIELDS.has(key)) {
      v = v.replace(/[<>&"'`]/g, "").slice(0, NAME_MAX);
    } else {
      v = v.slice(0, GLOBAL_MAX);
    }
    userData[key] = v;
  }
  return userData;
}

// 🔴 AI 輸出防呆：JSON.parse 之後、任何欄位被拿去寫入試算表之前，先在此夾住明顯異常值，
//   避免 AI 偶發幻覺(天文數字賞金、爆表好感、型別跑掉、結構非物件)默默污染資料表。
//   只夾「會被寫進表」且「範圍明確」的數值欄位；敘事等自由文字不動。
function sanitizeAiData_(aiData) {
  if (!aiData || typeof aiData !== "object" || Array.isArray(aiData)) {
    throw new Error("AI 回傳結構異常（非物件），已攔截避免污染資料。");
  }
  const clampInt = (v, lo, hi, dflt) => {
    const n = parseInt(v);
    if (isNaN(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  };

  // 好感變動：單回合限 -100 ~ +100
  if (Array.isArray(aiData.rel_changes)) {
    aiData.rel_changes.forEach(rc => {
      if (rc && rc.fav_change !== undefined) rc.fav_change = clampInt(rc.fav_change, -100, 100, 0);
    });
  }
  // 銀兩轉移：金額限 0 ~ 1億(方向由 from/to 決定，amount 永遠為正)，非數字者剔除
  if (Array.isArray(aiData.money_transferred)) {
    aiData.money_transferred = aiData.money_transferred.filter(m => m && m.amount !== undefined && !isNaN(parseInt(m.amount)));
    aiData.money_transferred.forEach(m => { m.amount = clampInt(m.amount, 0, 100000000, 0); });
  }
  // 天命賞金與時限：賞金 0 ~ 1億；deadline_days 為整數天數時限 0 ~ 365
  if (Array.isArray(aiData.quests)) {
    aiData.quests.forEach(q => {
      if (!q) return;
      if (q.reward_money !== undefined) q.reward_money = clampInt(q.reward_money, 0, 100000000, 0);
      if (q.deadline_days !== undefined && q.deadline_days !== "" && !isNaN(parseInt(q.deadline_days))) {
        q.deadline_days = clampInt(q.deadline_days, 0, 365, "");
      }
    });
  }
  return aiData;
}

function handleGameAction(userData) {
  if (typeof userData === "string") {
    try { userData = JSON.parse(userData); }
    catch (err) { return JSON.stringify({ success: false, message: "後端偵測：JSON結構解析異常" }); }
  }
  userData = sanitizeUserData_(userData);

  const action = userData.action || "play";
  const pcId = userData.pcId;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try { ensureFateSheets_(ss); } catch (e) { Logger.log("ensureFateSheets_ 於 handleGameAction 失敗(略過): " + e.message); }
  const sheets = {
    law: ss.getSheetByName("規矩"), map: ss.getSheetByName("坤圖"),
    pc: ss.getSheetByName("眾生"), log: ss.getSheetByName("因果"),
    item: ss.getSheetByName("琳琅"), auth: ss.getSheetByName("權柄"),
    rel: ss.getSheetByName("關係"), epic: ss.getSheetByName("史紀"),
    quest: ss.getSheetByName("天命"), task: ss.getSheetByName("TASK"),
    faction: ss.getSheetByName("勢力"),
    rumor: ss.getSheetByName("傳聞"),
    mail: ss.getSheetByName("飛書"),
    shop: ss.getSheetByName("店鋪")
  };

  const handler = ActionRouter[action];
  if (handler) {
    return handler(userData, pcId, sheets);
  } else {
    return JSON.stringify({ success: false, message: `天道異常：未知的動作指令「${action}」` });
  }
}

// ==========================================
// 🔴 動作處理模組 (Action Handlers)
// ==========================================

function actionCheckName(userData, pcId, sheets) {
  // 🔴 userData.name 已在 sanitizeUserData_ 清成純中文；若清洗後為空，代表玩家輸入含非中文(英數/符號)，直接擋下
  if (!userData.name) {
    return JSON.stringify({ invalidName: true, message: "名號僅限中文字，不可使用英文、數字或符號。" });
  }
  const pcRows = sheets.pc.getDataRange().getValues();
  const found = pcRows.find(r => r[COL.PC.NAME] === userData.name && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  return JSON.stringify({ exists: !!found, pcId: found ? found[COL.PC.ID] : null, sex: found ? found[COL.PC.SEX] : "未知" });
}


function actionCultivate(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  const currentRealm = pcData[pIdx][COL.PC.REALM] || "凡人";
  const rMod = REALM_MODIFIERS[currentRealm] || 1.0;
  const trueLimit = REALM_LIMITS[currentRealm] || 25;

  const statsToUpgrade = [COL.PC.STR, COL.PC.CON, COL.PC.AGI, COL.PC.INT, COL.PC.LUK];
  let isAnyUpgraded = false;

  statsToUpgrade.forEach(col => {
    let currentStat = parseInt(pcData[pIdx][col]) || 10;
    if (currentStat < trueLimit) {
      pcData[pIdx][col] = Math.min(trueLimit, currentStat + 1);
      isAnyUpgraded = true;
    }
  });

  if (!isAnyUpgraded) return JSON.stringify({ success: false, message: `你的所有屬性皆已達「${currentRealm}」面板極限 (${trueLimit})，需先突破境界才能繼續修練！` });

  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  const statusString = getFreshStatusString(pcId, pIdx, sheets);
  return JSON.stringify({ success: true, isSuccess: true, message: `你就地盤膝而坐，引導天地靈氣貫通四肢百骸。【全屬性】皆大幅提升了 1 點！`, statusString: statusString });
}

function actionConsumeItem(userData, pcId, sheets) {
  const { itemId } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人命格。" });

  let itemData = sheets.item.getDataRange().getValues();
  const iIdx = itemData.findIndex(r => r[COL.ITEM.OWNER] == pcId && r[COL.ITEM.ID] === itemId);
  if (iIdx === -1) return JSON.stringify({ success: false, message: "行囊中找不到此丹藥的氣息！" });

  const itemRow = itemData[iIdx];
  const consumableTypes = ["丹藥", "恢復道具"];
  if (!consumableTypes.includes(String(itemRow[COL.ITEM.TYPE]))) {
    return JSON.stringify({ success: false, message: `天道阻擋：「${itemRow[COL.ITEM.NAME]}」並非可服用的丹藥或恢復道具！` });
  }

  // 🔴 獲取當前境界的肉體極限
  const currentRealm = pcData[pIdx][COL.PC.REALM] || "凡人";
  const trueLimit = REALM_LIMITS[currentRealm] || 25;

  let addStr = parseInt(itemRow[COL.ITEM.STR]) || 0; let addCon = parseInt(itemRow[COL.ITEM.CON]) || 0;
  let addAgi = parseInt(itemRow[COL.ITEM.AGI]) || 0; let addInt = parseInt(itemRow[COL.ITEM.INT]) || 0; let addLuk = parseInt(itemRow[COL.ITEM.LUK]) || 0;
  let effectStr = "";

  // 🔴 帶入境界上限檢查，並計算實際增加的數值
  if (addStr > 0) {
    let cur = parseInt(pcData[pIdx][COL.PC.STR]) || 10;
    if (cur < trueLimit) { let actualAdd = Math.min(trueLimit, cur + addStr) - cur; pcData[pIdx][COL.PC.STR] = cur + actualAdd; effectStr += `臂力 +${actualAdd} `; }
  }
  if (addCon > 0) {
    let cur = parseInt(pcData[pIdx][COL.PC.CON]) || 10;
    if (cur < trueLimit) { let actualAdd = Math.min(trueLimit, cur + addCon) - cur; pcData[pIdx][COL.PC.CON] = cur + actualAdd; effectStr += `根骨 +${actualAdd} `; }
  }
  if (addAgi > 0) {
    let cur = parseInt(pcData[pIdx][COL.PC.AGI]) || 10;
    if (cur < trueLimit) { let actualAdd = Math.min(trueLimit, cur + addAgi) - cur; pcData[pIdx][COL.PC.AGI] = cur + actualAdd; effectStr += `身法 +${actualAdd} `; }
  }
  if (addInt > 0) {
    let cur = parseInt(pcData[pIdx][COL.PC.INT]) || 10;
    if (cur < trueLimit) { let actualAdd = Math.min(trueLimit, cur + addInt) - cur; pcData[pIdx][COL.PC.INT] = cur + actualAdd; effectStr += `神識 +${actualAdd} `; }
  }
  if (addLuk > 0) {
    let cur = parseInt(pcData[pIdx][COL.PC.LUK]) || 10;
    if (cur < trueLimit) { let actualAdd = Math.min(trueLimit, cur + addLuk) - cur; pcData[pIdx][COL.PC.LUK] = cur + actualAdd; effectStr += `福緣 +${actualAdd} `; }
  }

  // 🔴 防呆機制：如果是加屬性的丹藥，但所有屬性都沒增加（代表已達極限），拒絕吞服！
  const hasStatBonus = addStr > 0 || addCon > 0 || addAgi > 0 || addInt > 0 || addLuk > 0;
  if (hasStatBonus && effectStr === "") {
    return JSON.stringify({ success: false, message: `你的肉體已達「${currentRealm}」的極限，無法再吸收「${itemRow[COL.ITEM.NAME]}」的藥力，需先突破境界！` });
  }
  const newMaxStats = calculateMaxStats(pcData[pIdx][COL.PC.REALM], pcData[pIdx][COL.PC.CON], pcData[pIdx][COL.PC.INT]);
  pcData[pIdx][COL.PC.MAX_HP] = newMaxStats.hp;
  pcData[pIdx][COL.PC.MAX_MP] = newMaxStats.mp;


  // 🔴 判斷丹藥子類型
  const itemName = itemRow[COL.ITEM.NAME];
  const isHealItem =
    itemRow[COL.ITEM.TYPE] === "恢復道具" ||
    itemName.includes("回血") || itemName.includes("補血") ||
    itemName.includes("回氣") || itemName.includes("補氣") ||
    itemName.includes("回復") || itemName.includes("恢復") ||
    itemName.includes("靈泉") || itemName.includes("傷藥") ||
    itemName.includes("療傷") || (
      // 所有屬性加成都是 0，判定為純回血回氣型
      addStr === 0 && addCon === 0 && addAgi === 0 &&
      addInt === 0 && addLuk === 0
    );

  if (isHealItem) {
    // 恢復型：補血補氣回滿，同時清除負面狀態
    const maxStats = calculateMaxStats(
      pcData[pIdx][COL.PC.REALM],
      pcData[pIdx][COL.PC.CON],
      pcData[pIdx][COL.PC.INT]
    );
    pcData[pIdx][COL.PC.HP] = maxStats.hp;
    pcData[pIdx][COL.PC.MP] = maxStats.mp;
    pcData[pIdx][COL.PC.STATUS] = JSON.stringify({
      "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "氣息平穩"
    });
    effectStr = "氣血與真氣全面回滿，負面狀態一掃而空！";
  } else if (effectStr === "") {
    // 屬性全為 0 但也不是恢復型（保底：回滿）
    const maxStats = calculateMaxStats(
      pcData[pIdx][COL.PC.REALM],
      pcData[pIdx][COL.PC.CON],
      pcData[pIdx][COL.PC.INT]
    );
    pcData[pIdx][COL.PC.HP] = maxStats.hp;
    pcData[pIdx][COL.PC.MP] = maxStats.mp;
    effectStr = "狀態回歸巔峰！";
  }

  sheets.item.deleteRow(iIdx + 1);
  const pcColCount = Object.keys(COL.PC).length;
  while (pcData[pIdx].length < pcColCount) { pcData[pIdx].push(""); }
  sheets.pc.getRange(pIdx + 1, 1, 1, pcColCount).setValues([pcData[pIdx]]);

  // 🔴 補上場景意識：服藥不再是固定罐頭文字，改與 use_item_self 同套手法，
  // 帶入地點、同行夥伴、在場路人與玩家性格卡，交由 AI 寫出貼合當下情境的敘事，效果已鎖死禁止更改。
  const pName = pcData[pIdx][COL.PC.NAME];
  const pLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  const pPrefArr = String(pcData[pIdx][COL.PC.PREF] || "").split('、');
  const pTraitArr = String(pcData[pIdx][COL.PC.TRAIT] || "").split('、');
  const playerCardStr = `【玩家『${pName}』】性格:[表象]${pPrefArr[0] || "無"} [內裡]${pPrefArr[1] || "無"} | 特徵:${pTraitArr[1] || "無"}\n`;

  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  const partyNames = relData.filter(r => r[COL.REL.PC] === pName && r[COL.REL.IS_PARTY] === "同行").map(r => r[COL.REL.NPC]);
  const bystanderNames = pcData
    .filter(r => r[COL.PC.ID] != pcId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === pLoc)
    .map(r => r[COL.PC.NAME]);
  const partyHere = bystanderNames.filter(n => partyNames.includes(n));
  const othersHere = bystanderNames.filter(n => !partyNames.includes(n));
  let placeStr = "";
  if (partyHere.length > 0) placeStr += `同行夥伴${partyHere.join("、")}也在場，請合理帶到其反應。`;
  if (othersHere.length > 0) placeStr += `在場還有：${othersHere.join("、")}，請合理帶到他們的存在或反應，不要視而不見。`;
  if (!placeStr) placeStr = "現場再無旁人，請勿憑空捏造路人或對話對象。";
  const sceneStr = pLoc ? `${playerCardStr}【場景】玩家目前位於『${pLoc}』。${placeStr}\n` : playerCardStr;

  const recentLogStr = getRecentCausalityStr(sheets, pName, null, 5);

  const aiPrompt = `${sceneStr}【近期因果】(僅供背景參考，純屬回憶，並非當下在場！)\n${recentLogStr}\n【系統事件·已裁定，嚴禁更改任何結果】玩家服下了「${itemRow[COL.ITEM.NAME]}」，藥效已底層結算完畢：${effectStr}。請生動描寫藥力於經脈間化開的過程、玩家當下的生理反應，以及周圍人物見狀的態度。\n★【鐵律】嚴禁輸出任何 items_used、items_lost、items_gained 或 stat_changes，已結算完畢，重複輸出會導致天道崩塌！`;

  return JSON.stringify({ success: true, itemName: itemRow[COL.ITEM.NAME], effectStr: effectStr, aiPrompt: aiPrompt, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// 🟢 對同地 NPC 使用丹藥/恢復道具：補血回滿、或單純解去中毒/媚惑等負面狀態
function actionUseItemOnNpc(userData, pcId, sheets) {
  const { itemId, targetName } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人命格。" });
  const pName = pcData[pIdx][COL.PC.NAME];
  const pLoc = String(pcData[pIdx][COL.PC.LOC]).trim();

  const nIdx = pcData.findIndex(r => r[COL.PC.ID] != pcId && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
    String(r[COL.PC.LOC]).trim() === pLoc && String(r[COL.PC.NAME]).includes(targetName));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "對方已不在場，無法施藥。" });
  const npcRow = pcData[nIdx];
  const npcName = npcRow[COL.PC.NAME];

  let itemData = sheets.item.getDataRange().getValues();
  const iIdx = itemData.findIndex(r => r[COL.ITEM.OWNER] == pcId && r[COL.ITEM.ID] === itemId);
  if (iIdx === -1) return JSON.stringify({ success: false, message: "行囊中找不到此丹藥的氣息！" });

  const itemRow = itemData[iIdx];
  const consumableTypes = ["丹藥", "恢復道具"];
  if (!consumableTypes.includes(String(itemRow[COL.ITEM.TYPE]))) {
    return JSON.stringify({ success: false, message: `天道阻擋：「${itemRow[COL.ITEM.NAME]}」並非可施用於他人的丹藥或恢復道具！` });
  }

  const itemName = itemRow[COL.ITEM.NAME];
  const isHealItem =
    itemRow[COL.ITEM.TYPE] === "恢復道具" ||
    itemName.includes("回血") || itemName.includes("補血") ||
    itemName.includes("回氣") || itemName.includes("補氣") ||
    itemName.includes("回復") || itemName.includes("恢復") ||
    itemName.includes("靈泉") || itemName.includes("傷藥") ||
    itemName.includes("療傷");
  const isCureItem = itemName.includes("解");

  let effectStr = "";
  let instructionStr = "";
  if (isHealItem) {
    const maxStats = calculateMaxStats(pcData[nIdx][COL.PC.REALM], pcData[nIdx][COL.PC.CON], pcData[nIdx][COL.PC.INT]);
    pcData[nIdx][COL.PC.HP] = maxStats.hp;
    pcData[nIdx][COL.PC.MP] = maxStats.mp;
    pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "氣息平穩" });
    effectStr = `「${npcName}」氣血與真氣全面回滿，所有負面狀態一掃而空！`;
    instructionStr = `玩家將「${itemName}」施用於「${npcName}」身上，對方氣血與真氣已全面回滿、所有負面狀態一掃而空（結果已定，禁止改變）。請生動描寫施藥的過程與「${npcName}」的反應，語氣務必貼合對方性格。`;
  } else if (isCureItem) {
    let vs = parseVisibleStatus(pcData[nIdx][COL.PC.STATUS]);
    vs["負面"] = "無";
    pcData[nIdx][COL.PC.STATUS] = JSON.stringify(vs);
    effectStr = `「${npcName}」體內的異樣藥力被解去，神色恢復如常。`;
    instructionStr = `玩家將「${itemName}」施用於「${npcName}」身上，對方體內異樣藥力已被解去、神色恢復如常（結果已定，禁止改變）。請生動描寫施藥的過程與「${npcName}」的反應，語氣務必貼合對方性格。`;
  } else {
    return JSON.stringify({ success: false, message: `「${itemName}」不是能施用於他人身上的丹藥。` });
  }

  sheets.item.deleteRow(iIdx + 1);
  sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);

  const aiPrompt = buildNpcRequestPrompt(sheets, pName, pLoc, npcRow, instructionStr, pcData[pIdx]);
  return JSON.stringify({ success: true, itemName: itemName, targetName: npcName, effectStr: effectStr, aiPrompt: aiPrompt });
}

function actionBreakthrough(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false });

  const currentRealm = pcData[pIdx][COL.PC.REALM] || "凡人";
  const curIdx = REALMS.indexOf(currentRealm);
  if (curIdx >= REALMS.length - 1) return JSON.stringify({ success: false, message: `已達巔峰境界「${currentRealm}」，天地間無可突破之法。` });

  const trueLimit = REALM_LIMITS[currentRealm] * (REALM_MODIFIERS[currentRealm] || 1.0);
  const totals = getCharacterTotalStats(pcId, sheets, pcData);
  const stats = [totals.STR, totals.CON, totals.AGI, totals.INT, totals.LUK];
  const countPassed = stats.filter(s => s >= (trueLimit * 0.8)).length;

  if (countPassed < 3) return JSON.stringify({ success: false, message: `需至少 3 項屬性達 ${Math.floor(trueLimit * 0.8)} 以上，方可嘗試衝擊境界。` });

  const baseRates = { "凡人": 90, "引氣": 80, "凝罡": 70, "通玄": 55, "罡氣": 45, "意動": 35, "心象": 25, "登峰": 10, "返璞": 5, "天人": 1 };
  let successRate = (baseRates[currentRealm] || 50) + ((countPassed - 3) * 10);
  let equipPenalty = (String(pcData[pIdx][COL.PC.WEP]).trim() ? 5 : 0) +
    (String(pcData[pIdx][COL.PC.ARM]).trim() ? 5 : 0) +
    (String(pcData[pIdx][COL.PC.ACC1]).trim() ? 5 : 0) +
    (String(pcData[pIdx][COL.PC.ACC2]).trim() ? 5 : 0);
  successRate = Math.max(1, Math.min(100, successRate - equipPenalty));

  if ((Math.floor(Math.random() * 100) + 1) > successRate) {
    pcData[pIdx][COL.PC.HP] = Math.max(1, Math.floor((parseInt(pcData[pIdx][COL.PC.HP]) || 10) / 2));
    pcData[pIdx][COL.PC.MP] = Math.max(0, Math.floor((parseInt(pcData[pIdx][COL.PC.MP]) || 10) / 2));
    pcData[pIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "衣衫被汗水浸濕", "姿勢": "痛苦捂胸", "負面": "真氣逆流", "顏面": "面色慘白" });
    sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
    return JSON.stringify({ success: false, statusString: getFreshStatusString(pcId, pIdx, sheets), message: `突破失敗！(成功率 ${successRate}%)<br>體內真氣失控逆流，氣血大損！` });
  }

  const nextRealm = REALMS[curIdx + 1];
  const maxVals = calculateMaxStats(nextRealm, pcData[pIdx][COL.PC.CON], pcData[pIdx][COL.PC.INT]);

  pcData[pIdx][COL.PC.REALM] = nextRealm;
  pcData[pIdx][COL.PC.MAX_HP] = maxVals.hp; pcData[pIdx][COL.PC.MAX_MP] = maxVals.mp;
  pcData[pIdx][COL.PC.HP] = maxVals.hp; pcData[pIdx][COL.PC.MP] = maxVals.mp;
  pcData[pIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "神采奕奕" });

  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  sheets.log.appendRow([new Date(), pcId, `【境界突破】${pcData[pIdx][COL.PC.NAME]} 突破至 ${nextRealm}`, pcData[pIdx][COL.PC.LOC], "變故"]);
  addRumor(sheets, "BREAKTHROUGH", pcData[pIdx][COL.PC.LOC], pcData[pIdx][COL.PC.NAME], { realm: nextRealm });
  return JSON.stringify({ success: true, message: `金光籠罩，你成功突破至「${nextRealm}」！`, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

function actionEmpowerNpc(userData, pcId, sheets) {
  const { npcName } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  let relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  let itemData = sheets.item ? sheets.item.getDataRange().getValues() : [];

  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === npcName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (pIdx === -1 || nIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  const rIdx = relData.findIndex(r => r[COL.REL.PC] === pcData[pIdx][COL.PC.NAME] && r[COL.REL.NPC] === npcName);
  if ((rIdx !== -1 ? parseInt(relData[rIdx][COL.REL.FAV]) || 0 : 0) < 100) return JSON.stringify({ success: false, message: "好感度未達100！" });

  const pRIdx = REALMS.indexOf(pcData[pIdx][COL.PC.REALM] || "凡人");
  const nRIdx = REALMS.indexOf(pcData[nIdx][COL.PC.REALM] || "凡人");
  if (nRIdx >= pRIdx || nRIdx >= REALMS.length - 1) return JSON.stringify({ success: false, message: `境界未高於對方或對方已達巔峰。` });

  const pillIdx = itemData.findIndex(r => r[COL.ITEM.OWNER] == pcId && r[COL.ITEM.NAME] === "造化綠液");
  if (pillIdx === -1) return JSON.stringify({ success: false, message: "缺乏無上至寶【造化綠液】！" });

  sheets.item.deleteRow(pillIdx + 1);
  const nextRealm = REALMS[nRIdx + 1];
  pcData[nIdx][COL.PC.REALM] = nextRealm;

  const baseFloor = Math.floor(REALM_LIMITS[REALMS[nRIdx]] * 0.8);
  const statCap = REALM_LIMITS[nextRealm];
  [COL.PC.STR, COL.PC.CON, COL.PC.AGI, COL.PC.INT, COL.PC.LUK].forEach(statCol => {
    pcData[nIdx][statCol] = Math.min(statCap, Math.max(baseFloor, parseInt(pcData[nIdx][statCol]) || 10) + Math.floor(Math.random() * 6) + 3);
  });

  const nMax = calculateMaxStats(nextRealm, pcData[nIdx][COL.PC.CON], pcData[nIdx][COL.PC.INT]);
  pcData[nIdx][COL.PC.MAX_HP] = nMax.hp; pcData[nIdx][COL.PC.MAX_MP] = nMax.mp;
  pcData[nIdx][COL.PC.HP] = nMax.hp; pcData[nIdx][COL.PC.MP] = nMax.mp;
  pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "神采奕奕" });

  sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);
  SpreadsheetApp.flush();
  addRumor(sheets, "EMPOWER", pcData[nIdx][COL.PC.LOC], npcName);

  return JSON.stringify({ success: true, promptText: `【天道動作：玩家消耗了一滴蘊含無上生命法則的「造化綠液」護住對方心脈，並與好感度達到 100 的『${npcName}』進行傳功雙修！\n在造化之力的修補下，對方五圍洗髓重塑，境界拔升至「${nextRealm}」！\n請極盡生動地描寫這場靈肉交融與造化法則灌體的情境！(★天道鐵律：底層已結算，嚴禁輸出 items_lost 或 stat_changes 避免重複扣除！)】` });
}

// 🟢 惰性逾期檢查：只改記憶體陣列，由呼叫端決定何時 safeWriteSheet 回寫
function checkAndExpireQuests(sheets, pcId, questData) {
  const now = Date.now();
  let changed = false;
  questData.forEach(row => {
    if (row[COL.QUEST.PC] != pcId || row[COL.QUEST.STATUS] !== "進行中") return;
    const deadline = parseInt(row[COL.QUEST.DEADLINE]);
    if (!deadline || isNaN(deadline) || now <= deadline) return;
    row[COL.QUEST.STATUS] = "逾期失敗";
    changed = true;
  });
  return changed;
}

function actionClaimQuestReward(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pcIndex = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pcIndex === -1) return JSON.stringify({ success: false, message: "天道崩潰：查無大俠之名命格。" });

  const qData = sheets.quest.getDataRange().getValues();
  let questRowIdx = -1;
  for (let i = qData.length - 1; i >= 1; i--) {
    if (qData[i][COL.QUEST.PC] == pcId && qData[i][COL.QUEST.NAME] === userData.questName && qData[i][COL.QUEST.STATUS] === "已結案") {
      questRowIdx = i; break;
    }
  }
  if (questRowIdx === -1) return JSON.stringify({ success: false, message: "找不到已結案的天命任務。" });

  const questRow = qData[questRowIdx];
  const rewardMoney = parseInt(questRow[COL.QUEST.MONEY]) || 0;
  const rewardItemName = String(questRow[COL.QUEST.ITEM] || "").trim();

  if (rewardMoney > 0) pcData[pcIndex][COL.PC.MONEY] = (parseInt(pcData[pcIndex][COL.PC.MONEY]) || 0) + rewardMoney;

  let itemMsg = "無";
  if (rewardItemName && rewardItemName !== "無" && rewardItemName !== "undefined") {
    const newItemId = "ITM_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

    // 🔴 與 items_gained 對齊的強制類別判斷
    let itemType = detectItemType(rewardItemName, "消耗品", null);

    let sSTR = 0, sCON = 0, sAGI = 0, sINT = 0, sLUK = 0;
    if (itemType === "武器") sSTR = 2;
    else if (itemType === "防具") sCON = 2;
    else if (itemType === "法寶") sLUK = 2;
    else if (itemType === "丹藥") { sSTR = 1; sCON = 1; sAGI = 1; sINT = 1; sLUK = 1; }

    itemMsg = rewardItemName;

    if (sheets.item) {
      sheets.item.appendRow([
        rewardItemName, itemType, "天命懸賞賜予的奇珍。",
        100, pcId, sSTR, sCON, sAGI, sINT, sLUK, newItemId
      ]);
    }
  }

  // 🔴 宗門氣運提升核心邏輯！
  const isFactionQuest = userData.questName.startsWith("【宗門】");
  let factionPowerMsg = "";
  if (isFactionQuest) {
    const myFaction = pcData[pcIndex][COL.PC.FACTION];
    if (myFaction && myFaction !== "無") {

      // 取得目前境界在 REALMS 陣列中的索引 (0~9)
      const currentRealm = pcData[pcIndex][COL.PC.REALM] || "凡人";
      const realmIndex = REALMS.indexOf(currentRealm);


      const MAX_FACTION_CONTRIB_GAIN = 3200; // 封頂在「意動」境量級，避免天人境(原51200)指數爆炸
      const gain = Math.min(MAX_FACTION_CONTRIB_GAIN, 100 * Math.pow(2, realmIndex));

      updateFactionPower(sheets, myFaction, 5, `門人圓滿完成了「${userData.questName}」，宗門威望大增！`);
      pcData[pcIndex][COL.PC.CONTRIB] = (parseInt(pcData[pcIndex][COL.PC.CONTRIB]) || 0) + gain;

      factionPowerMsg = `<br>✨ <b>宗門氣運提升了！</b> 獲得 ${gain} 點宗門貢獻。`;
    }
  }

  if (sheets.epic) sheets.epic.appendRow([pcId, `【天命圓滿】完成了任務「${userData.questName}」，領取賞銀 ${rewardMoney} 兩與珍品「${itemMsg}」`, new Date()]);
  sheets.quest.deleteRow(questRowIdx + 1);
  addRumor(sheets, "QUEST_DONE", pcData[pcIndex][COL.PC.LOC], userData.questName);
  sheets.pc.getRange(pcIndex + 1, 1, 1, pcData[pcIndex].length).setValues([pcData[pcIndex]]);

  return JSON.stringify({ success: true, statusString: getFreshStatusString(pcId, pcIndex, sheets), message: `🎉 天命大圓滿！你成功領取了賞銀 ${rewardMoney} 兩 ${rewardItemName !== "無" ? `與奇珍「${rewardItemName}」` : ""}${factionPowerMsg}` });
}

function actionQuests(userData, pcId, sheets) {
  if (!sheets.quest) return JSON.stringify({ success: false, message: "天命表不存在" });
  const data = sheets.quest.getDataRange().getValues();
  if (checkAndExpireQuests(sheets, pcId, data) && data.length > 0) {
    const questColCount = Object.keys(COL.QUEST).length;
    data.forEach(row => { while (row.length < questColCount) row.push(""); });
    safeWriteSheet(sheets.quest, data);
  }
  return JSON.stringify({ success: true, data: data.slice(1).filter(r => r[COL.QUEST.PC] == pcId).map(r => ({ name: r[COL.QUEST.NAME], target: r[COL.QUEST.TARGET] || "調查中", status: r[COL.QUEST.STATUS], money: r.length > 4 ? (parseInt(r[COL.QUEST.MONEY]) || 0) : 0, item: r.length > 5 ? (String(r[COL.QUEST.ITEM] || "").trim() || "無") : "無" })) });
}

function actionAbandonQuest(userData, pcId, sheets) {
  const qData = sheets.quest.getDataRange().getValues();
  for (let i = qData.length - 1; i >= 1; i--) {
    if (qData[i][COL.QUEST.PC] == pcId && qData[i][COL.QUEST.NAME] === userData.questName) {
      if (qData[i][COL.QUEST.STATUS] === "已結案" && sheets.epic) sheets.epic.appendRow([pcId, `【天命結算】達成了因果：「${userData.questName}」`, new Date()]);
      sheets.quest.deleteRow(i + 1); break;
    }
  }
  return JSON.stringify({ success: true });
}

function actionInventory(userData, pcId, sheets) {
  if (!sheets.item) return JSON.stringify({ success: false, message: "琳琅表不存在" });
  const data = sheets.item.getDataRange().getValues();
  return JSON.stringify({
    success: true, data: data.slice(1).filter(r => r[COL.ITEM.OWNER] == pcId && String(r[COL.ITEM.LOC2]).trim() !== "倉庫").map(r => {
      let attrArr = [];
      if (parseInt(r[COL.ITEM.STR])) attrArr.push(`臂力+${r[COL.ITEM.STR]}`);
      if (parseInt(r[COL.ITEM.CON])) attrArr.push(`根骨+${r[COL.ITEM.CON]}`);
      if (parseInt(r[COL.ITEM.AGI])) attrArr.push(`身法+${r[COL.ITEM.AGI]}`);
      if (parseInt(r[COL.ITEM.INT])) attrArr.push(`神識+${r[COL.ITEM.INT]}`);
      if (parseInt(r[COL.ITEM.LUK])) attrArr.push(`福緣+${r[COL.ITEM.LUK]}`);
      return { id: r[COL.ITEM.ID] || r[COL.ITEM.NAME], name: r[COL.ITEM.NAME], type: r[COL.ITEM.TYPE], desc: r[COL.ITEM.DESC], stats: attrArr.join("、") };
    }), max: MAX_BAG_SIZE
  });
}

// 🟢 仙府倉庫：取出倉庫清單(只在開啟時讀取，不影響背包格數)
function actionWarehouseGet(userData, pcId, sheets) {
  if (!sheets.item) return JSON.stringify({ success: false, message: "琳琅表不存在" });
  const data = sheets.item.getDataRange().getValues();
  return JSON.stringify({
    success: true, data: data.slice(1).filter(r => r[COL.ITEM.OWNER] == pcId && String(r[COL.ITEM.LOC2]).trim() === "倉庫").map(r => {
      let attrArr = [];
      if (parseInt(r[COL.ITEM.STR])) attrArr.push(`臂力+${r[COL.ITEM.STR]}`);
      if (parseInt(r[COL.ITEM.CON])) attrArr.push(`根骨+${r[COL.ITEM.CON]}`);
      if (parseInt(r[COL.ITEM.AGI])) attrArr.push(`身法+${r[COL.ITEM.AGI]}`);
      if (parseInt(r[COL.ITEM.INT])) attrArr.push(`神識+${r[COL.ITEM.INT]}`);
      if (parseInt(r[COL.ITEM.LUK])) attrArr.push(`福緣+${r[COL.ITEM.LUK]}`);
      return { id: r[COL.ITEM.ID] || r[COL.ITEM.NAME], name: r[COL.ITEM.NAME], type: r[COL.ITEM.TYPE], desc: r[COL.ITEM.DESC], stats: attrArr.join("、") };
    }), max: MAX_WAREHOUSE_SIZE
  });
}

// 🟢 仙府倉庫：把背包道具存入倉庫(裝備中的道具禁止存入)
function actionWarehouseStore(userData, pcId, sheets) {
  const { itemId } = userData;
  if (!sheets.item) return JSON.stringify({ success: false, message: "琳琅表不存在" });

  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人命格。" });

  const pcRow = pcData[pIdx];
  const equipped = [pcRow[COL.PC.WEP], pcRow[COL.PC.ARM], pcRow[COL.PC.ACC1], pcRow[COL.PC.ACC2]]
    .map(x => String(x || "").trim());

  let itemData = sheets.item.getDataRange().getValues();
  const iIdx = itemData.findIndex(r => r[COL.ITEM.ID] === itemId && String(r[COL.ITEM.OWNER]) === String(pcId));
  if (iIdx === -1) return JSON.stringify({ success: false, message: "行囊中找不到此物。" });

  const itemName = String(itemData[iIdx][COL.ITEM.NAME]).trim();
  if (equipped.includes(String(itemId).trim())) return JSON.stringify({ success: false, message: "裝備中的道具無法存入倉庫，請先卸下！" });

  const warehouseCount = itemData.filter(r => String(r[COL.ITEM.OWNER]) === String(pcId) && String(r[COL.ITEM.LOC2]).trim() === "倉庫").length;
  if (warehouseCount >= MAX_WAREHOUSE_SIZE) return JSON.stringify({ success: false, message: "倉庫已滿，無法再存入！" });

  sheets.item.getRange(iIdx + 1, COL.ITEM.LOC2 + 1).setValue("倉庫");
  return JSON.stringify({ success: true, message: `已將「${itemName}」存入仙府倉庫。` });
}

// 🟢 仙府倉庫：取出道具回背包(受背包格數上限限制)
function actionWarehouseRetrieve(userData, pcId, sheets) {
  const { itemId } = userData;
  if (!sheets.item) return JSON.stringify({ success: false, message: "琳琅表不存在" });

  let itemData = sheets.item.getDataRange().getValues();
  const iIdx = itemData.findIndex(r => r[COL.ITEM.ID] === itemId && String(r[COL.ITEM.OWNER]) === String(pcId) && String(r[COL.ITEM.LOC2]).trim() === "倉庫");
  if (iIdx === -1) return JSON.stringify({ success: false, message: "倉庫中找不到此物。" });

  const bagCount = itemData.filter(r => String(r[COL.ITEM.OWNER]) === String(pcId) && String(r[COL.ITEM.LOC2]).trim() !== "倉庫").length;
  if (bagCount >= MAX_BAG_SIZE) return JSON.stringify({ success: false, message: `行囊已滿（${MAX_BAG_SIZE}/${MAX_BAG_SIZE}），請先清理包包！` });

  const itemName = itemData[iIdx][COL.ITEM.NAME];
  sheets.item.getRange(iIdx + 1, COL.ITEM.LOC2 + 1).setValue("");
  return JSON.stringify({ success: true, message: `已將「${itemName}」取出至行囊。` });
}

function actionDiscardItem(userData, pcId, sheets) {
  const itemData = sheets.item.getDataRange().getValues();
  for (let i = itemData.length - 1; i >= 1; i--) {
    if ((itemData[i][COL.ITEM.ID] === userData.itemName || itemData[i][COL.ITEM.NAME] === userData.itemName) && itemData[i][COL.ITEM.OWNER] == pcId) {
      sheets.item.deleteRow(i + 1); break;
    }
  }
  return JSON.stringify({ success: true });
}
// 💰 變賣物品給聽風閣（賣價 = price × 0.4，裝備中與定情信物禁止賣）
function actionSellItem(userData, pcId, sheets) {
  const { itemId } = userData;
  if (!sheets.item) return JSON.stringify({ success: false, message: "琳琅表不存在" });

  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人命格。" });

  let itemData = sheets.item.getDataRange().getValues();
  const iIdx = itemData.findIndex(r => r[COL.ITEM.ID] === itemId && String(r[COL.ITEM.OWNER]) === String(pcId));
  if (iIdx === -1) return JSON.stringify({ success: false, message: "行囊中找不到此物。" });

  const itemRow = itemData[iIdx];
  const itemName = itemRow[COL.ITEM.NAME];

  // 🔴 防呆 1：定情信物禁止變賣
  if (String(itemRow[COL.ITEM.TYPE]) === "定情信物") {
    return JSON.stringify({ success: false, message: `「${itemName}」承載著難以割捨的情意，無法變賣。` });
  }

  // 🔴 防呆 2：裝備中的物品禁止變賣
  const pcRow = pcData[pIdx];
  const equipped = [pcRow[COL.PC.WEP], pcRow[COL.PC.ARM], pcRow[COL.PC.ACC1], pcRow[COL.PC.ACC2]]
    .map(x => String(x || "").trim());
  if (equipped.includes(String(itemId).trim())) {
    return JSON.stringify({ success: false, message: `「${itemName}」正裝備在身，請先卸下再變賣。` });
  }

  // 計算賣價（4 折，最低保底 1 兩）
  // 計算賣價：貨幣物品 1:1 兌換，其餘物品 4 折(最低保底 1 兩)
  const price = parseInt(itemRow[COL.ITEM.PRICE]) || 0;
  const isCurrency = String(itemRow[COL.ITEM.TYPE]) === "貨幣";
  const sellPrice = isCurrency ? price : Math.max(1, Math.floor(price * 0.4));

  // 扣物品、加銀兩
  sheets.item.deleteRow(iIdx + 1);
  pcData[pIdx][COL.PC.MONEY] = (parseInt(pcData[pIdx][COL.PC.MONEY]) || 0) + sellPrice;
  sheets.pc.getRange(pIdx + 1, COL.PC.MONEY + 1).setValue(pcData[pIdx][COL.PC.MONEY]);

  return JSON.stringify({
    success: true,
    message: `將「${itemName}」賣給了聽風閣，得銀 ${sellPrice} 兩。`,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}
function actionEstateGet(userData, pcId, sheets) {
  if (!sheets.task) return JSON.stringify({ success: false, message: "TASK表不存在" });
  const taskData = sheets.task.getDataRange().getValues();
  return JSON.stringify({ success: true, tasks: taskData.filter((r, i) => i > 0 && r[0] == pcId).map(r => ({ facility: r[1], lastHarvest: r[4] })) });
}

function actionEstateHarvestAll(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  const taskData = sheets.task.getDataRange().getValues();
  const now = Date.now();
  let resultMsgs = [], newItemsToAppend = [], totalGainedMoney = 0, hasHarvested = false;

  const facilities = [
    { name: "聚寶金蟾", reqTime: 60 * 60 * 1000, maxAccumulate: 24 * 60 * 60 * 1000 },
    { name: "掌天小瓶", reqTime: 12 * 60 * 60 * 1000, maxAccumulate: 24 * 60 * 60 * 1000 },
    { name: "天地丹爐", reqTime: 12 * 60 * 60 * 1000, maxAccumulate: 24 * 60 * 60 * 1000 }
  ];

  facilities.forEach(fac => {
    let taskRowIndex = -1, lastHarvest = 0;
    for (let i = 1; i < taskData.length; i++) {
      if (taskData[i][0] == pcId && taskData[i][1] === fac.name) { taskRowIndex = i; lastHarvest = parseInt(taskData[i][4]) || 0; break; }
    }

    let timePassed = taskRowIndex === -1 ? fac.reqTime : now - lastHarvest;
    if (timePassed >= fac.reqTime) {
      hasHarvested = true;
      const cappedTimePassed = Math.min(timePassed, fac.maxAccumulate);
      const yieldCount = Math.floor(cappedTimePassed / fac.reqTime);
      const newLastHarvest = now - (cappedTimePassed - yieldCount * fac.reqTime);

      if (taskRowIndex === -1) sheets.task.appendRow([pcId, fac.name, "無", "無", newLastHarvest]);
      else sheets.task.getRange(taskRowIndex + 1, 5).setValue(newLastHarvest);

      if (fac.name === "聚寶金蟾") {
        totalGainedMoney += yieldCount; resultMsgs.push(`【聚寶金蟾】吐出了 ${yieldCount} 兩白銀`);
      } else if (fac.name === "掌天小瓶") {
        for (let i = 0; i < yieldCount; i++) newItemsToAppend.push(["造化綠液", "消耗品", "一滴散發著恐怖生命法則的靈液。", 999, pcId, 0, 0, 0, 0, 0, "ITM_" + Date.now() + "_bottle_" + i]);
        resultMsgs.push(`【掌天小瓶】收集了 ${yieldCount} 滴 造化綠液`);
      } else if (fac.name === "天地丹爐") {
        for (let i = 0; i < yieldCount; i++) newItemsToAppend.push(["【造化】九轉金丹", "丹藥", "服下可使所有五圍屬性全面 +1！", 50, pcId, 1, 1, 1, 1, 1, "ITM_" + Date.now() + "_furnace_" + i]);
        resultMsgs.push(`【天地丹爐】煉製了 ${yieldCount} 顆 九轉金丹`);
      }
    }
  });

  if (!hasHarvested) return JSON.stringify({ success: false, message: "靈氣尚未匯聚完成，無物可收。" });
  if (totalGainedMoney > 0) sheets.pc.getRange(pIdx + 1, COL.PC.MONEY + 1).setValue((parseInt(pcData[pIdx][COL.PC.MONEY]) || 0) + totalGainedMoney);
  if (newItemsToAppend.length > 0) sheets.item.getRange(sheets.item.getLastRow() + 1, 1, newItemsToAppend.length, newItemsToAppend[0].length).setValues(newItemsToAppend);

  return JSON.stringify({ success: true, message: resultMsgs.join("<br>"), statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

function actionPlayDice(userData, pcId, sheets) {
  // 假設 Casino.gs 中存在 playDiceGame 函數
  return playDiceGame(pcId, userData.betType, userData.betAmount, sheets, COL);
}

function actionPlayHorseRace(userData, pcId, sheets) {
  // 假設 Casino.gs 中存在 playHorseRaceGame 函數
  return playHorseRaceGame(pcId, userData.horseId, userData.betAmount, sheets, COL);
}

function actionLifeskillGather(userData, pcId, sheets) {
  return playLifeskillGather(pcId, userData.skill, userData.rollCount, sheets, COL);
}

function actionDismissParty(userData, pcId, sheets) {
  const npcName = userData.npcName;
  const myName = sheets.pc.getDataRange().getValues().find(r => r[COL.PC.ID] == pcId)[COL.PC.NAME];
  if (sheets.rel) {
    const relData = sheets.rel.getDataRange().getValues();
    const rIdx = relData.findIndex(r => r[COL.REL.PC] === myName && r[COL.REL.NPC] === npcName);
    if (rIdx !== -1) sheets.rel.getRange(rIdx + 1, COL.REL.IS_PARTY + 1).setValue("");
  }
  return JSON.stringify({ success: true });
}

function actionJoinParty(userData, pcId, sheets) {
  const npcName = userData.npcName;
  const myName = sheets.pc.getDataRange().getValues().find(r => r[COL.PC.ID] == pcId)[COL.PC.NAME];

  if (sheets.rel) {
    const relData = sheets.rel.getDataRange().getValues();
    const isBusy = relData.find(r => r[COL.REL.NPC] === npcName && r[COL.REL.IS_PARTY] === "同行" && r[COL.REL.PC] !== myName);
    if (isBusy) return JSON.stringify({ success: false, message: `天道阻礙：「${npcName}」已與『${isBusy[COL.REL.PC]}』結伴！` });

    const rIdx = relData.findIndex(r => r[COL.REL.PC] === myName && r[COL.REL.NPC] === npcName);
    const currentFav = (rIdx !== -1) ? parseInt(relData[rIdx][COL.REL.FAV]) || 0 : 0;
    if (currentFav < 30) return JSON.stringify({ success: false, message: `與「${npcName}」羈絆尚淺(目前好感${currentFav})，對方拒絕同行！(需30以上)` });

    if (rIdx !== -1) sheets.rel.getRange(rIdx + 1, COL.REL.IS_PARTY + 1).setValue("同行");
    else sheets.rel.appendRow([myName, npcName, currentFav, "萍水相逢", "同行"]);
    return JSON.stringify({ success: true, message: `你與「${npcName}」結伴同行！` });
  }
  return JSON.stringify({ success: false, message: "天道異常：REL關係表不存在。" });
}

function actionInspectNpc(userData, pcId, sheets) {
  const targetName = userData.targetName;
  const allPcData = sheets.pc.getDataRange().getValues();
  const npcRow = allPcData.find(r => r[COL.PC.NAME] === targetName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (!npcRow) return JSON.stringify({ success: false, message: "查無此人。" });

  // 🔴 窺探直接成功：偵查動作，風險留給真正動手偷
  const itemData = sheets.item ? sheets.item.getDataRange().getValues() : [];
  return JSON.stringify({ success: true, data: itemData.slice(1).filter(r => r[COL.ITEM.OWNER] === npcRow[COL.PC.ID]).map(r => ({ id: r[COL.ITEM.ID], name: r[COL.ITEM.NAME], type: r[COL.ITEM.TYPE], desc: r[COL.ITEM.DESC] })) });
}

// 🟢 索要：需與該 NPC 好感100且已傾心，方可開口要求一件物品，成功直接轉入玩家行囊(受背包上限限制)
function actionRequestItemFromNpc(userData, pcId, sheets) {
  const { targetName, itemId } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人命格。" });
  const pName = pcData[pIdx][COL.PC.NAME];
  const pLoc = String(pcData[pIdx][COL.PC.LOC]).trim();

  const nIdx = pcData.findIndex(r => r[COL.PC.ID] != pcId && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
    String(r[COL.PC.LOC]).trim() === pLoc && String(r[COL.PC.NAME]).includes(targetName));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "對方已不在場。" });
  const npcRow = pcData[nIdx];
  const npcName = npcRow[COL.PC.NAME];

  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  const rIdx = relData.findIndex(r => r[COL.REL.PC] === pName && r[COL.REL.NPC] === npcName);
  const relRow = rIdx !== -1 ? relData[rIdx] : null;
  if ((relRow ? parseInt(relRow[COL.REL.FAV]) || 0 : 0) < 100 || !(relRow ? String(relRow[COL.REL.TAG]) : "").includes("(已傾心)")) {
    return JSON.stringify({ success: false, message: `「${npcName}」對妳尚未全心託付（需好感 100 且已傾心），不肯把東西交給妳。` });
  }

  let itemData = sheets.item.getDataRange().getValues();
  const iIdx = itemData.findIndex(r => r[COL.ITEM.ID] === itemId && String(r[COL.ITEM.OWNER]) === String(npcRow[COL.PC.ID]));
  if (iIdx === -1) return JSON.stringify({ success: false, message: "對方身上找不到此物。" });
  const itemName = itemData[iIdx][COL.ITEM.NAME];

  const equipped = [npcRow[COL.PC.WEP], npcRow[COL.PC.ARM], npcRow[COL.PC.ACC1], npcRow[COL.PC.ACC2]].map(x => String(x || "").trim());
  if (equipped.includes(String(itemId).trim())) {
    return JSON.stringify({ success: false, message: `「${itemName}」正裝備在「${npcName}」身上，無法索要。` });
  }

  const bagCount = itemData.filter(r => String(r[COL.ITEM.OWNER]) === String(pcId) && String(r[COL.ITEM.LOC2]).trim() !== "倉庫").length;
  if (bagCount >= MAX_BAG_SIZE) return JSON.stringify({ success: false, message: `行囊已滿（${MAX_BAG_SIZE}/${MAX_BAG_SIZE}），請先清理包包！` });

  sheets.item.getRange(iIdx + 1, COL.ITEM.OWNER + 1).setValue(pcId);

  const aiPrompt = buildNpcRequestPrompt(sheets, pName, pLoc, npcRow, `玩家開口向「${npcName}」索要「${itemName}」，對方已答應交出此物（結果已定，禁止改變）。請描寫玩家開口的話術與「${npcName}」交出物品時的反應，語氣務必貼合對方性格與雙方關係。`, pcData[pIdx]);
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, itemName: itemName, npcName: npcName });
}

// 🟢 要求丟棄：需與該 NPC 好感100且已傾心，方可要求對方丟棄一件物品(物品直接消失，不轉入玩家)
function actionRequestDiscardNpcItem(userData, pcId, sheets) {
  const { targetName, itemId } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人命格。" });
  const pName = pcData[pIdx][COL.PC.NAME];
  const pLoc = String(pcData[pIdx][COL.PC.LOC]).trim();

  const nIdx = pcData.findIndex(r => r[COL.PC.ID] != pcId && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
    String(r[COL.PC.LOC]).trim() === pLoc && String(r[COL.PC.NAME]).includes(targetName));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "對方已不在場。" });
  const npcRow = pcData[nIdx];
  const npcName = npcRow[COL.PC.NAME];

  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  const rIdx = relData.findIndex(r => r[COL.REL.PC] === pName && r[COL.REL.NPC] === npcName);
  const relRow = rIdx !== -1 ? relData[rIdx] : null;
  if ((relRow ? parseInt(relRow[COL.REL.FAV]) || 0 : 0) < 100 || !(relRow ? String(relRow[COL.REL.TAG]) : "").includes("(已傾心)")) {
    return JSON.stringify({ success: false, message: `「${npcName}」對妳尚未全心託付（需好感 100 且已傾心），不肯讓妳做主丟棄她的東西。` });
  }

  let itemData = sheets.item.getDataRange().getValues();
  const iIdx = itemData.findIndex(r => r[COL.ITEM.ID] === itemId && String(r[COL.ITEM.OWNER]) === String(npcRow[COL.PC.ID]));
  if (iIdx === -1) return JSON.stringify({ success: false, message: "對方身上找不到此物。" });
  const itemName = itemData[iIdx][COL.ITEM.NAME];

  const equipped = [npcRow[COL.PC.WEP], npcRow[COL.PC.ARM], npcRow[COL.PC.ACC1], npcRow[COL.PC.ACC2]].map(x => String(x || "").trim());
  if (equipped.includes(String(itemId).trim())) {
    return JSON.stringify({ success: false, message: `「${itemName}」正裝備在「${npcName}」身上，無法丟棄。` });
  }

  sheets.item.deleteRow(iIdx + 1);

  const aiPrompt = buildNpcRequestPrompt(sheets, pName, pLoc, npcRow, `玩家要求「${npcName}」丟棄「${itemName}」，對方因對玩家已是全心傾心，依言照辦、親手丟棄了此物（結果已定，禁止改變）。請描寫玩家開口的話術與「${npcName}」依言丟棄物品時的反應，語氣務必貼合對方性格與雙方深厚關係。`, pcData[pIdx]);
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, itemName: itemName, npcName: npcName });
}

// 🔹 共用：組裝含地點/性格/關係/近期因果的提示詞，避免索要/丟棄敘事出戲
function buildNpcRequestPrompt(sheets, pName, pLoc, npcRow, instructionStr, pRow) {
  const npcName = npcRow[COL.PC.NAME];
  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  const relRow = relData.find(r => r[COL.REL.PC] === pName && r[COL.REL.NPC] === npcName);
  const prefArr = String(npcRow[COL.PC.PREF] || "").split('、');
  const traitArr = String(npcRow[COL.PC.TRAIT] || "").split('、');
  const nickMatch = relRow ? String(relRow[COL.REL.MEMORY] || "").match(/\[專屬稱呼\](.*?)(?=\| \[|$)/) : null;
  const nickStr = (nickMatch && nickMatch[1].trim()) ? ` | 稱呼玩家:${nickMatch[1].trim()}` : "";
  const npcCardStr = `【${npcName}】境界:${npcRow[COL.PC.REALM] || "凡人"} | 性格:[表象]${prefArr[0] || "無"} [內裡]${prefArr[1] || "無"} | 特徵:${traitArr[1] || "無"} | 與玩家關係:${relRow ? relRow[COL.REL.TAG] : "萍水相逢"}(好感:${relRow ? relRow[COL.REL.FAV] : 0})${nickStr}`;

  // 🔴 玩家自己的性格也要讓AI知道，台詞與反應才不會千人一面
  const pPrefArr = String((pRow && pRow[COL.PC.PREF]) || "").split('、');
  const pTraitArr = String((pRow && pRow[COL.PC.TRAIT]) || "").split('、');
  const playerCardStr = pRow ? `【玩家『${pName}』】性格:[表象]${pPrefArr[0] || "無"} [內裡]${pPrefArr[1] || "無"} | 特徵:${pTraitArr[1] || "無"}\n` : "";

  const recentLogStr = getRecentCausalityStr(sheets, pName, npcName, 5);

  // 🔴 同地點的其他人都是真的在場，不可被「在場驗證」誤鎖成不在場；同行夥伴另外標出，AI才知道誰會吃醋誰只是路人
  const pcDataAll = sheets.pc.getDataRange().getValues();
  const partyNames = relData.filter(r => r[COL.REL.PC] === pName && r[COL.REL.IS_PARTY] === "同行").map(r => r[COL.REL.NPC]);
  const bystanderNames = pcDataAll.filter(r =>
    String(r[COL.PC.LOC]).trim() === pLoc && r[COL.PC.NAME] !== pName && r[COL.PC.NAME] !== npcName &&
    !String(r[COL.PC.ID]).startsWith("DEAD_")
  ).map(r => r[COL.PC.NAME]);
  const partyHere = bystanderNames.filter(n => partyNames.includes(n));
  const othersHere = bystanderNames.filter(n => !partyNames.includes(n));
  let presentStr = `玩家與「${npcName}」`;
  if (partyHere.length > 0) presentStr += `，同行夥伴${partyHere.join('、')}也在場`;
  if (othersHere.length > 0) presentStr += `，以及在場的${othersHere.join('、')}`;

  return `【場景】玩家『${pName}』目前位於『${pLoc}』。\n【近期因果】(僅供背景參考，純屬回憶，並非當下在場！)\n${recentLogStr}\n【對象資料】\n${npcCardStr}\n${playerCardStr}\n` +
    `【系統事件·已裁定，嚴禁更改任何結果】${instructionStr}\n` +
    `★【鐵律】嚴禁輸出任何 items_gained、items_transferred、money_transferred 或 stat_changes，已結算完畢，重複輸出會導致天道崩塌！\n` +
    `★【在場驗證】本回合在場者僅有${presentStr}，可合理帶到其存在或反應；近期因果中提到的其他姓名均不在場，嚴禁讓其登場、插話或互動！`;
}

// ==========================================
// 🟢 輕量化群組：贈禮 / 補刀處決 / 道具自用 / 妙手空空 / 煉成 / 聽風閣情報
// GAS 直接裁定結果，AI 只負責補一段不出戲的描寫
// ==========================================

// 🟢 贈禮：好感門檻與物品轉移全由 GAS 裁定，AI 只負責寫對方的反應
function actionGiftItem(userData, pcId, sheets) {
  const { targetName, giftItemId, newRelName } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人命格。" });
  const pName = pcData[pIdx][COL.PC.NAME];
  const pLoc = String(pcData[pIdx][COL.PC.LOC]).trim();

  const nIdx = pcData.findIndex(r => r[COL.PC.ID] != pcId && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
    String(r[COL.PC.LOC]).trim() === pLoc && String(r[COL.PC.NAME]).includes(targetName));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "對方已不在場。" });
  const npcRow = pcData[nIdx];
  const npcName = npcRow[COL.PC.NAME];

  let itemData = sheets.item.getDataRange().getValues();
  const iIdx = itemData.findIndex(r => r[COL.ITEM.ID] === giftItemId && String(r[COL.ITEM.OWNER]) === String(pcId));
  if (iIdx === -1) return JSON.stringify({ success: false, message: "行囊中查無此物。" });
  const giftItem = itemData[iIdx];
  const itemName = giftItem[COL.ITEM.NAME];

  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  const rIdx = relData.findIndex(r => r[COL.REL.PC] === pName && r[COL.REL.NPC] === npcName);
  const currentFav = rIdx !== -1 ? parseInt(relData[rIdx][COL.REL.FAV]) || 0 : 0;

  if (giftItem[COL.ITEM.TYPE] === "定情信物" && currentFav >= 80) {
    const finalTag = (newRelName || "生死相許").replace(/\(已傾心\)/g, "") + "(已傾心)";
    sheets.item.getRange(iIdx + 1, COL.ITEM.OWNER + 1).setValue(npcRow[COL.PC.ID]);
    if (rIdx !== -1) {
      sheets.rel.getRange(rIdx + 1, COL.REL.TAG + 1).setValue(finalTag);
      sheets.rel.getRange(rIdx + 1, COL.REL.FAV + 1).setValue(100);
      sheets.rel.getRange(rIdx + 1, COL.REL.MAJOR_EVENT + 1).setValue(`收下信物「${itemName}」，徹底傾心。`);
    } else if (sheets.rel) {
      sheets.rel.appendRow([pName, npcName, 100, finalTag, "同行", "", `收下信物「${itemName}」，徹底傾心。`]);
    }
    addRumor(sheets, "GIFT_BOND", pLoc, npcName);
    const aiPrompt = buildNpcRequestPrompt(sheets, pName, pLoc, npcRow, `玩家將定情信物「${itemName}」贈予「${npcName}」，對方好感度滿溢，已滿心歡喜收下並徹底傾心於玩家（結果已定，禁止改變）！請細膩描寫符合對方個性、掩飾不住的喜悅與締結羈絆的對話。`, pcData[pIdx]);
    return JSON.stringify({
      success: true, aiPrompt, itemName, npcName, soulBound: true,
      soulBoundEventMsg: `💞 「${npcName}」收下了「${itemName}」，徹底傾心於你！<br><span style="font-size:13px; color:#ffb6c1;">✨ 羈絆已至深處，「逆天改命」功能已解鎖，可重新賦予對方命格與裝備之權。</span>`,
      freshlyBoundNpcName: npcName
    });
  } else if (currentFav < 30) {
    const aiPrompt = buildNpcRequestPrompt(sheets, pName, pLoc, npcRow, `玩家想將「${itemName}」送給「${npcName}」，但兩人交情尚淺（好感${currentFav}），對方並未收下，物品仍在玩家身上（結果已定，禁止改變）。請依「${npcName}」的個性，描寫她疏離婉拒、不收禮物的反應。`, pcData[pIdx]);
    return JSON.stringify({ success: true, aiPrompt, itemName, npcName, rejected: true });
  } else {
    sheets.item.getRange(iIdx + 1, COL.ITEM.OWNER + 1).setValue(npcRow[COL.PC.ID]);
    const aiPrompt = buildNpcRequestPrompt(sheets, pName, pLoc, npcRow, `玩家已將「${itemName}」交給「${npcName}」，系統底層已完成物品轉移（結果已定，禁止改變）。請依「${npcName}」的個性與好感，純描寫她收下禮物的反應與神情。`, pcData[pIdx]);
    return JSON.stringify({ success: true, aiPrompt, itemName, npcName });
  }
}

// 🟢 補刀處決：HP<=5 才能裁定，戰利品/門派氣運結算全由 GAS 完成，AI 只負責寫終結場面
function actionExecuteNpc(userData, pcId, sheets) {
  const { targetName } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人命格。" });
  const pName = pcData[pIdx][COL.PC.NAME];
  const pLoc = String(pcData[pIdx][COL.PC.LOC]).trim();

  const execIdx = pcData.findIndex(r => r[COL.PC.NAME] === targetName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (execIdx === -1) return JSON.stringify({ success: false, message: "對方已不在場。" });
  const execTarget = pcData[execIdx];
  if ((parseInt(execTarget[COL.PC.HP]) || 0) > 5) {
    return JSON.stringify({ success: false, message: `「${targetName}」根本未昏迷倒地，談何補刀處決！` });
  }

  if (sheets.epic) sheets.epic.appendRow([pcId, `【因果終結】${execTarget[COL.PC.NAME]} 被玩家補刀隕落。`, new Date()]);

  let itemData = sheets.item.getDataRange().getValues();
  const dropMoney = parseInt(execTarget[COL.PC.MONEY]) || 0;
  if (dropMoney > 0) {
    sheets.item.appendRow([`${execTarget[COL.PC.NAME]}的遺產`, "消耗品", "殺人越貨得來的碎銀。", dropMoney, pcId, 0, 0, 0, 0, 0, "ITM_" + Date.now() + "_" + Math.floor(Math.random() * 1000)]);
  }
  for (let i = 1; i < itemData.length; i++) {
    if (itemData[i][COL.ITEM.OWNER] == execTarget[COL.PC.ID]) {
      sheets.item.getRange(i + 1, COL.ITEM.OWNER + 1).setValue(pcId);
    }
  }

  sheets.pc.getRange(execIdx + 1, COL.PC.STATUS + 1).setValue(JSON.stringify({ "衣服": "殘破染血", "姿勢": "倒地不起", "負面": "死亡", "顏面": "一具死屍" }));
  addRumor(sheets, "KILL_NPC", pLoc, execTarget[COL.PC.NAME]);
  const deadFaction = execTarget[COL.PC.FACTION];
  const deadRank = String(execTarget[COL.PC.RANK] || "門人").trim();

  if (deadFaction && deadFaction !== "無") {
    let powerLoss = -2, eventMsg = `基層${deadRank}在${pLoc}被殺`;
    if (deadRank.match(/掌門|宗主|教主|門主|谷主|閣主|魁首/)) { powerLoss = -40; eventMsg = `【震驚天下】${deadRank}在${pLoc}隕落！`; }
    else if (deadRank.match(/長老|護法|副|太上/)) { powerLoss = -15; eventMsg = `高層${deadRank}在${pLoc}遭人擊殺`; }
    else if (deadRank.match(/堂主|真傳|執事|首席|香主/)) { powerLoss = -8; eventMsg = `核心${deadRank}在${pLoc}遇害`; }
    updateFactionPower(sheets, deadFaction, powerLoss, eventMsg);
  }

  const aiPrompt = buildNpcRequestPrompt(sheets, pName, pLoc, execTarget, `玩家對昏迷倒地的「${targetName}」補刀處決，對方已徹底隕落，財物與裝備已盡數歸入玩家行囊（結果已定，禁止改變）。請生動描寫補刀終結的場面。`, pcData[pIdx]);
  sheets.pc.getRange(execIdx + 1, COL.PC.ID + 1).setValue("DEAD_" + execTarget[COL.PC.ID]);
  return JSON.stringify({ success: true, aiPrompt, npcName: targetName });
}

// 🟢 道具自用(非藥水類)：扣除全由 GAS 完成，AI 只負責寫使用特效
function actionUseItemSelf(userData, pcId, sheets) {
  const { itemId, itemName } = userData;
  let itemData = sheets.item.getDataRange().getValues();
  const iIdx = itemData.findIndex(r => r[COL.ITEM.ID] === itemId && String(r[COL.ITEM.OWNER]) === String(pcId));
  if (iIdx === -1) return JSON.stringify({ success: false, message: "行囊中查無此物。" });
  const actualName = itemData[iIdx][COL.ITEM.NAME] || itemName;
  sheets.item.deleteRow(iIdx + 1);

  // 🔴 補上地點 + 在場旁人(分清同行夥伴與路人) + 玩家自身性格，避免AI寫出與當前場景/人物不符或憑空捏造的反應
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  const pName = pIdx !== -1 ? pcData[pIdx][COL.PC.NAME] : "";
  const pLoc = pIdx !== -1 ? String(pcData[pIdx][COL.PC.LOC]).trim() : "";
  const pPrefArr = String((pIdx !== -1 && pcData[pIdx][COL.PC.PREF]) || "").split('、');
  const pTraitArr = String((pIdx !== -1 && pcData[pIdx][COL.PC.TRAIT]) || "").split('、');
  const playerCardStr = pIdx !== -1 ? `【玩家『${pName}』】性格:[表象]${pPrefArr[0] || "無"} [內裡]${pPrefArr[1] || "無"} | 特徵:${pTraitArr[1] || "無"}\n` : "";

  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  const partyNames = relData.filter(r => r[COL.REL.PC] === pName && r[COL.REL.IS_PARTY] === "同行").map(r => r[COL.REL.NPC]);
  const bystanderNames = pcData
    .filter(r => r[COL.PC.ID] != pcId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === pLoc)
    .map(r => r[COL.PC.NAME]);
  const partyHere = bystanderNames.filter(n => partyNames.includes(n));
  const othersHere = bystanderNames.filter(n => !partyNames.includes(n));
  let placeStr = "";
  if (partyHere.length > 0) placeStr += `同行夥伴${partyHere.join("、")}也在場，請合理帶到其反應。`;
  if (othersHere.length > 0) placeStr += `在場還有：${othersHere.join("、")}，請合理帶到他們的存在或反應，不要視而不見。`;
  if (!placeStr) placeStr = "現場再無旁人，請勿憑空捏造路人或對話對象。";
  const sceneStr = pLoc ? `${playerCardStr}【場景】玩家目前位於『${pLoc}』。${placeStr}\n` : playerCardStr;

  const recentLogStr = getRecentCausalityStr(sheets, pName, null, 5);

  const aiPrompt = `${sceneStr}【近期因果】(僅供背景參考，純屬回憶，並非當下在場！)\n${recentLogStr}\n【系統事件·已裁定，嚴禁更改任何結果】玩家將「${actualName}」消耗/施放了，系統底層已將物品扣除完畢。請生動描寫使用的效果與周圍的反應；若是強行食用不可食之物，請描寫滑稽場面。\n★【鐵律】嚴禁輸出任何 items_used、items_lost、items_gained 或 stat_changes，已結算完畢，重複輸出會導致天道崩塌！`;
  return JSON.stringify({ success: true, aiPrompt, itemName: actualName });
}

// 🟢 妙手空空(指定物品偷竊)：D20 對抗裁定成敗，成功轉移物品，失敗扣好感+扣血當教訓
function actionStealNpcItem(userData, pcId, sheets) {
  const { targetName, stealItemId, stealItemName } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人命格。" });
  const pName = pcData[pIdx][COL.PC.NAME];
  const pLoc = String(pcData[pIdx][COL.PC.LOC]).trim();

  const nIdx = pcData.findIndex(r => r[COL.PC.ID] != pcId && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
    String(r[COL.PC.LOC]).trim() === pLoc && String(r[COL.PC.NAME]).includes(targetName));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "對方已不在場。" });
  const npcRow = pcData[nIdx];
  const npcName = npcRow[COL.PC.NAME];

  let itemData = sheets.item.getDataRange().getValues();
  const iIdx = itemData.findIndex(r => r[COL.ITEM.ID] === stealItemId && String(r[COL.ITEM.OWNER]) === String(npcRow[COL.PC.ID]));
  if (iIdx === -1) return JSON.stringify({ success: false, message: "對方身上已無此物。" });
  const itemName = itemData[iIdx][COL.ITEM.NAME] || stealItemName;

  const equipped = [npcRow[COL.PC.WEP], npcRow[COL.PC.ARM], npcRow[COL.PC.ACC1], npcRow[COL.PC.ACC2]].map(x => String(x || "").trim());
  if (equipped.includes(String(stealItemId).trim())) {
    return JSON.stringify({ success: false, message: `「${itemName}」正裝備在「${npcName}」身上，無法下手。` });
  }

  const pTotal = getCharacterTotalStats(pcId, sheets, pcData, itemData);
  const nTotal = getCharacterTotalStats(npcRow[COL.PC.ID], sheets, pcData, itemData);
  const pRoll = rollD20(), nRoll = rollD20();
  const pMod = Math.round(((pTotal.AGI || 0) + (pTotal.LUK || 0)) / 6);
  const nMod = Math.round(((nTotal.AGI || 0) + (nTotal.INT || 0)) / 6);
  const pScore = pRoll + pMod, nScore = nRoll + nMod;
  const pCrit = pRoll === 20, pFumble = pRoll === 1;
  const nCrit = nRoll === 20, nFumble = nRoll === 1;

  let success;
  if (pFumble && !nFumble) success = false;
  else if (nFumble && !pFumble) success = true;
  else if (pCrit && !nCrit) success = true;
  else if (nCrit && !pCrit) success = false;
  else success = pScore >= nScore;

  let aiPrompt;
  if (success) {
    const bagCount = itemData.filter(r => String(r[COL.ITEM.OWNER]) === String(pcId) && String(r[COL.ITEM.LOC2]).trim() !== "倉庫").length;
    if (bagCount >= MAX_BAG_SIZE) {
      return JSON.stringify({ success: false, message: `行囊已滿（${MAX_BAG_SIZE}/${MAX_BAG_SIZE}），下手得手也無處安放，請先清理包包再來！` });
    }
    sheets.item.getRange(iIdx + 1, COL.ITEM.OWNER + 1).setValue(pcId);
    aiPrompt = buildNpcRequestPrompt(sheets, pName, pLoc, npcRow, `玩家妙手空空，暗中將「${npcName}」身上的「${itemName}」偷天換日轉移到自己行囊，對方渾然未覺（結果已定，禁止改變）！請生動描寫玩家不著痕跡的偷竊手法，以及對方毫無所覺的反應。`, pcData[pIdx]);
  } else {
    const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
    const rIdx = relData.findIndex(r => r[COL.REL.PC] === pName && r[COL.REL.NPC] === npcName);
    if (rIdx !== -1) {
      const newFav = Math.max(-100, Math.min(100, (parseInt(relData[rIdx][COL.REL.FAV]) || 0) - 5));
      sheets.rel.getRange(rIdx + 1, COL.REL.FAV + 1).setValue(newFav);
    } else if (sheets.rel) {
      sheets.rel.appendRow([pName, npcName, -5, "萍水相逢", "", "", `偷竊「${itemName}」被識破`]);
    }
    const newHp = Math.max(1, (parseInt(pcData[pIdx][COL.PC.HP]) || 0) - 10);
    sheets.pc.getRange(pIdx + 1, COL.PC.HP + 1).setValue(newHp);
    aiPrompt = buildNpcRequestPrompt(sheets, pName, pLoc, npcRow, `玩家妙手空空企圖偷取「${npcName}」身上的「${itemName}」，卻被當場識破！對方震怒反擊，玩家因而損失了好感並受了些皮肉傷（結果已定，禁止改變）。請生動描寫玩家偷竊失手、被識破當場的尷尬與對方的怒意反擊。`, pcData[pIdx]);
  }

  return JSON.stringify({ success: true, aiPrompt, itemName, npcName, stealSuccess: success });
}

// 🟢 煉丹/煉器/煉成：必定成功，品級由 D20 查 RARITY_TABLE 裁定(造化綠液入素材=強制20)，AI 只負責想名字/描述與敘事
const CRAFT_QUALITY_BY_ROLL = ["凡品", "凡品", "粗劣", "粗劣", "普通", "普通", "良品", "良品", "精品", "精品", "珍品", "珍品", "稀世", "稀世", "絕世", "絕世", "神器", "神器", "神器", "傳說"];

function actionCraftItem(userData, pcId, sheets) {
  const { method, intent, materials } = userData;
  if (!materials || !Array.isArray(materials) || materials.length === 0) {
    return JSON.stringify({ success: false, message: "未投入任何素材，無法開爐。" });
  }
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人命格。" });

  let itemData = sheets.item.getDataRange().getValues();
  const matIds = materials.map(m => m.id);
  let consumedNames = [];
  let hasCatalyst = false;
  for (let i = itemData.length - 1; i >= 1; i--) {
    if (itemData[i][COL.ITEM.OWNER] == pcId && matIds.includes(itemData[i][COL.ITEM.ID])) {
      if (String(itemData[i][COL.ITEM.NAME]).trim() === "造化綠液") hasCatalyst = true;
      consumedNames.push(itemData[i][COL.ITEM.NAME]);
      sheets.item.deleteRow(i + 1);
      itemData.splice(i, 1);
    }
  }
  if (consumedNames.length === 0) return JSON.stringify({ success: false, message: "行囊中查無投入的素材。" });

  const bagCount = itemData.filter(r => String(r[COL.ITEM.OWNER]) === String(pcId) && String(r[COL.ITEM.LOC2]).trim() !== "倉庫").length;
  if (bagCount >= MAX_BAG_SIZE) {
    return JSON.stringify({ success: false, message: `行囊已滿（${MAX_BAG_SIZE}/${MAX_BAG_SIZE}），煉成的成品已無處安放，請先清理包包！` });
  }

  const roll = hasCatalyst ? 20 : rollD20();
  const quality = CRAFT_QUALITY_BY_ROLL[roll - 1];

  const craftSystem = `你是九州煉器/煉丹宗師。玩家正在使用「${method}」陣法煉製物品，意圖為「${intent}」，投入素材：${consumedNames.join("、")}。
系統已裁定此次煉製【必定成功】，品級固定為【${quality}】（不可更改）。你只需要：
1. 構思一個符合意圖、素材與品級氣質的物品名稱(name)與簡短描述(desc，30字內)。
2. 判定其類別 type，只能是以下其中之一：武器、防具、法寶、丹藥、恢復道具、消耗品。
3. 若 type 為武器/防具/法寶，須額外給出 stat_type，只能是：臂力、根骨、身法、神識、福緣 之一(依物品意境挑選最貼切的一項)；若 type 為丹藥/恢復道具/消耗品則 stat_type 填無。
4. 用 100~180 字生動描寫開爐煉成、爆發異象、成品出爐的過程(narration)。
只輸出 JSON：{"narration":"...","name":"...","desc":"...","type":"...","stat_type":"..."}，禁止其他欄位、禁止 Markdown。`;

  const raw = callGeminiAPI(`開爐煉成，意圖：${intent}`, craftSystem, {
    temperature: 0.9, ignoreLaw: true, max_tokens: 600, model: "google/gemini-3.1-flash-lite"
  });

  let data;
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    data = JSON.parse(raw.substring(start, end + 1));
  } catch (e) { data = {}; }

  const itemName = (data.name && String(data.name).trim()) || `${method}・${quality}成品`;
  const itemDesc = (data.desc && String(data.desc).trim()) || `由「${consumedNames.join("、")}」煉製而成的${quality}之物。`;
  const narrationText = (data.narration && String(data.narration).trim()) || `爐火熊熊，異象乍現，一件${quality}成品自爐中誕生！`;
  const itemType = data.type || "消耗品";

  const p = getRarityPoints(quality, itemType === "丹藥");
  let sSTR = 0, sCON = 0, sAGI = 0, sINT = 0, sLUK = 0;
  if (["武器", "防具", "法寶", "丹藥"].includes(itemType)) {
    if (itemType === "武器") sSTR = p;
    else if (itemType === "防具") sCON = p;
    else {
      if (data.stat_type === "臂力") sSTR = p;
      else if (data.stat_type === "根骨") sCON = p;
      else if (data.stat_type === "身法") sAGI = p;
      else if (data.stat_type === "神識") sINT = p;
      else sLUK = p;
    }
  }
  const hasBonus = (sSTR > 0 || sCON > 0 || sAGI > 0 || sINT > 0 || sLUK > 0);
  const correctedType = detectItemType(itemName, itemType, hasBonus);
  const newItemId = "ITM_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  sheets.item.appendRow([itemName, correctedType, itemDesc, 10, pcId, sSTR, sCON, sAGI, sINT, sLUK, newItemId]);

  saveGameHistoryBatch(pcId, [
    { speaker: "player", content: `【系統動作】玩家啟動「${method}」陣法，投入「${consumedNames.join("、")}」，意圖：「${intent}」。` },
    { speaker: "ai", content: narrationText }
  ]);

  return JSON.stringify({ success: true, text: narrationText, itemName, rarity: quality });
}

// 🟢 聽風閣買情報：扣款由 GAS 結構化裁定，AI 只負責想線索內容與敘事
function actionBuyIntel(userData, pcId, sheets) {
  const { intelType, intent } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人命格。" });
  const money = parseInt(pcData[pIdx][COL.PC.MONEY]) || 0;
  if (money < 50) {
    return JSON.stringify({ success: false, message: "你摸了摸乾癟的錢袋，連 50 兩的情報費都湊不出來，訕訕地退出了聽風閣。" });
  }
  sheets.pc.getRange(pIdx + 1, COL.PC.MONEY + 1).setValue(money - 50);

  const intelSystem = `你是九州情報販子「聽風閣」閣主。玩家花費 50 兩銀子(已由系統扣除完畢)，指名打聽關於「${intelType}」的精確情報${intent ? `(玩家個人傾向：${intent})` : ''}。
請構思一則明確線索（東西在哪、在誰手上、或下一步該去哪），並用 100~180 字以情報販子的口吻生動描寫告知過程(narration)。
只輸出 JSON：{"narration":"...","quest_name":"...","quest_target":"..."}，quest_target 為線索指向的明確地點或目標(20字內)，禁止其他欄位、禁止 Markdown。`;

  const raw = callGeminiAPI(`打探情報：${intelType}`, intelSystem, {
    temperature: 0.85, ignoreLaw: true, max_tokens: 500, model: "google/gemini-3.1-flash-lite"
  });

  let data;
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    data = JSON.parse(raw.substring(start, end + 1));
  } catch (e) { data = {}; }

  const narrationText = (data.narration && String(data.narration).trim()) || `閣主壓低了聲音，將關於「${intelType}」的線索告知了你。`;
  const questName = (data.quest_name && String(data.quest_name).trim()) || `打聽：${intelType}`;
  const questTarget = (data.quest_target && String(data.quest_target).trim()) || "調查中";

  if (sheets.quest) {
    let questData = sheets.quest.getDataRange().getValues();
    const qIdx = questData.findIndex(r => r[COL.QUEST.PC] == pcId && r[COL.QUEST.NAME] === questName && r[COL.QUEST.STATUS] === "進行中");
    if (qIdx !== -1) {
      sheets.quest.getRange(qIdx + 1, COL.QUEST.TARGET + 1).setValue(questTarget);
    } else {
      sheets.quest.appendRow([pcId, questName, questTarget, "進行中", 0, "無"]);
    }
  }

  saveGameHistoryBatch(pcId, [
    { speaker: "player", content: `【系統動作】玩家在『聽風閣』花費 50 兩，指名打聽關於「${intelType}」的情報。` },
    { speaker: "ai", content: narrationText }
  ]);

  return JSON.stringify({ success: true, text: narrationText, questName, questTarget });
}

function actionGetAvailableGear(userData, pcId, sheets) {
  const { slotType, targetId } = userData;
  const actualTarget = targetId || pcId;
  if (!sheets.item) return JSON.stringify({ success: false, message: "琳琅表不存在" });
  const pcRow = sheets.pc.getDataRange().getValues().find(r => r[COL.PC.ID] == actualTarget);
  if (!pcRow) return JSON.stringify({ success: false, message: "查無此人" });

  const eqWeapon = pcRow[COL.PC.WEP] ? String(pcRow[COL.PC.WEP]).trim() : "";
  const eqArmor = pcRow[COL.PC.ARM] ? String(pcRow[COL.PC.ARM]).trim() : "";
  const eqAcc1 = pcRow[COL.PC.ACC1] ? String(pcRow[COL.PC.ACC1]).trim() : "";
  const eqAcc2 = pcRow[COL.PC.ACC2] ? String(pcRow[COL.PC.ACC2]).trim() : "";
  const allEquipped = [eqWeapon, eqArmor, eqAcc1, eqAcc2].filter(x => x !== "");

  let targetType = slotType.startsWith("法寶") ? "法寶" : slotType;
  const availableGears = [];
  sheets.item.getDataRange().getValues().slice(1).filter(r => (r[COL.ITEM.OWNER] == pcId || r[COL.ITEM.OWNER] == actualTarget) && r[COL.ITEM.TYPE] === targetType).forEach(r => {
    const id = String(r[COL.ITEM.ID] || r[COL.ITEM.NAME]).trim();
    let isEq = (slotType === "武器" && eqWeapon === id) || (slotType === "防具" && eqArmor === id) || (slotType === "法寶1" && eqAcc1 === id) || (slotType === "法寶2" && eqAcc2 === id);

    if (!allEquipped.includes(id) || isEq) {
      let attrDesc = [];
      if (parseInt(r[COL.ITEM.STR])) attrDesc.push(`臂力+${r[COL.ITEM.STR]}`); if (parseInt(r[COL.ITEM.CON])) attrDesc.push(`根骨+${r[COL.ITEM.CON]}`);
      if (parseInt(r[COL.ITEM.AGI])) attrDesc.push(`身法+${r[COL.ITEM.AGI]}`); if (parseInt(r[COL.ITEM.INT])) attrDesc.push(`神識+${r[COL.ITEM.INT]}`);
      if (parseInt(r[COL.ITEM.LUK])) attrDesc.push(`福緣+${r[COL.ITEM.LUK]}`);
      availableGears.push({ id: id, name: r[COL.ITEM.NAME], type: r[COL.ITEM.TYPE], desc: r[COL.ITEM.DESC] || "無描述", stats: attrDesc.join(", ") || "無附加屬性", isEquipped: isEq });
    }
  });
  return JSON.stringify({ success: true, data: availableGears });
}

function actionEquipGear(userData, pcId, sheets) {
  const { slotType, itemId, targetId } = userData;
  const actualTarget = targetId || pcId;
  const pcRows = sheets.pc.getDataRange().getValues();
  const pIdx = pcRows.findIndex(r => r[COL.PC.ID] == actualTarget);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  if (actualTarget !== pcId) {
    const myName = pcRows.find(r => r[COL.PC.ID] == pcId)[COL.PC.NAME];
    const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
    const rIdx = relData.findIndex(r => r[COL.REL.PC] === myName && r[COL.REL.NPC] === pcRows[pIdx][COL.PC.NAME]);
    if ((rIdx !== -1 ? parseInt(relData[rIdx][COL.REL.FAV]) || 0 : 0) < 100 || !(rIdx !== -1 ? String(relData[rIdx][COL.REL.TAG]) : "").includes("(已傾心)")) {
      return JSON.stringify({ success: false, message: "對方對妳尚未全心託付（需好感 100 且已傾心），拒絕更換裝備。" });
    }
  }

  let targetCol = slotType === "武器" ? COL.PC.WEP + 1 : slotType === "防具" ? COL.PC.ARM + 1 : slotType === "法寶1" ? COL.PC.ACC1 + 1 : slotType === "法寶2" ? COL.PC.ACC2 + 1 : -1;
  if (targetCol === -1) return JSON.stringify({ success: false, message: "無效的裝備部位！" });

  if (itemId) {
    const itemDataForCheck = sheets.item ? sheets.item.getDataRange().getValues() : [];
    const strItemId = String(itemId).trim();
    const iIdx = itemDataForCheck.findIndex(r => String(r[COL.ITEM.ID]).trim() === strItemId && (r[COL.ITEM.OWNER] == pcId || r[COL.ITEM.OWNER] == actualTarget));
    if (iIdx === -1) return JSON.stringify({ success: false, message: "行囊中無此氣息，無法裝備！" });

    if (itemDataForCheck[iIdx][COL.ITEM.OWNER] != actualTarget) {
      const oldOwner = itemDataForCheck[iIdx][COL.ITEM.OWNER];
      sheets.item.getRange(iIdx + 1, COL.ITEM.OWNER + 1).setValue(actualTarget);
      const oldOwnerIdx = pcRows.findIndex(r => r[COL.PC.ID] == oldOwner);
      if (oldOwnerIdx !== -1) {
        const oldRow = pcRows[oldOwnerIdx];
        if (String(oldRow[COL.PC.WEP]).trim() === strItemId) sheets.pc.getRange(oldOwnerIdx + 1, COL.PC.WEP + 1).setValue("");
        if (String(oldRow[COL.PC.ARM]).trim() === strItemId) sheets.pc.getRange(oldOwnerIdx + 1, COL.PC.ARM + 1).setValue("");
        if (String(oldRow[COL.PC.ACC1]).trim() === strItemId) sheets.pc.getRange(oldOwnerIdx + 1, COL.PC.ACC1 + 1).setValue("");
        if (String(oldRow[COL.PC.ACC2]).trim() === strItemId) sheets.pc.getRange(oldOwnerIdx + 1, COL.PC.ACC2 + 1).setValue("");
      }
    }
  }

  sheets.pc.getRange(pIdx + 1, targetCol).setValue(itemId || "");
  return JSON.stringify({ success: true, statusString: getFreshStatusString(actualTarget, pIdx, sheets) });
}

function actionGetFullStatus(userData, pcId, sheets) {
  const targetName = userData.targetName;
  const allPcData = sheets.pc.getDataRange().getValues();
  const row = allPcData.find(r => r[COL.PC.NAME] === targetName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (!row) return JSON.stringify({ success: false, message: "查無此人" });

  const targetId = row[COL.PC.ID];
  let relMem = "", canEditFate = false;
  if (sheets.rel) {
    const pcRow = allPcData.find(r => r[COL.PC.ID] == pcId);
    if (pcRow) {
      const rRecord = sheets.rel.getDataRange().getValues().find(r => r[COL.REL.PC] === pcRow[COL.PC.NAME] && r[COL.REL.NPC] === targetName);
      if (rRecord) {
        relMem = rRecord[COL.REL.MEMORY] || "";
        if ((parseInt(rRecord[COL.REL.FAV]) || 0) >= 100 && String(rRecord[COL.REL.TAG] || "").includes("已傾心")) canEditFate = true;
      }
    }
  }
  return JSON.stringify({ success: true, statusString: buildPlayerStatusString(row, getCharacterTotalStats(targetId, sheets, allPcData), sheets.item ? sheets.item.getDataRange().getValues() : [], relMem), targetId: targetId, targetSex: row[COL.PC.SEX], canEditFate: canEditFate });
}

function actionUpdateFate(userData, pcId, sheets) {
  const { targetId, fateType, fateValue } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] === targetId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  if (targetId !== pcId) {
    const myName = pcData.find(r => r[COL.PC.ID] == pcId)[COL.PC.NAME];
    const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
    const rIdx = relData.findIndex(r => r[COL.REL.PC] === myName && r[COL.REL.NPC] === pcData[pIdx][COL.PC.NAME]);
    if ((rIdx !== -1 ? parseInt(relData[rIdx][COL.REL.FAV]) || 0 : 0) < 100 || !(rIdx !== -1 ? String(relData[rIdx][COL.REL.TAG]) : "").includes("(已傾心)")) {
      return JSON.stringify({ success: false, message: `對方羈絆未達至深處，無法逆天改命！` });
    }
  }

  let targetCol = fateType === 'trait' ? COL.PC.TRAIT : fateType === 'pref' ? COL.PC.PREF : fateType === 'back' ? COL.PC.BACK : fateType === 'intent' ? COL.PC.INTENT : fateType === 'martial' ? COL.PC.MARTIAL : -1;
  if (targetCol === -1) return JSON.stringify({ success: false, message: "未知的命格類型" });
  // 🔴 命格欄位直寫入表格，需自行把關長度（全域 sanitizer 只做通用上限）
  pcData[pIdx][targetCol] = String(fateValue || "").slice(0, 120);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);

  let relMem = "";
  if (targetId !== pcId && sheets.rel) {
    const rRecord = sheets.rel.getDataRange().getValues().find(r => r[COL.REL.PC] === pcData.find(r => r[COL.PC.ID] == pcId)[COL.PC.NAME] && r[COL.REL.NPC] === pcData[pIdx][COL.PC.NAME]);
    if (rRecord) relMem = rRecord[COL.REL.MEMORY] || "";
  }
  return JSON.stringify({ success: true, statusString: buildPlayerStatusString(pcData[pIdx], getCharacterTotalStats(targetId, sheets, pcData), sheets.item ? sheets.item.getDataRange().getValues() : [], relMem) });
}

function actionManualNpc(userData, pcId, sheets) {
  const isCreate = userData.action === "create";
  const newId = isCreate ? "PC_" + Date.now() : "NPC_" + Date.now();
  const { name, sex, identity, standing, wish, appearance, magic, circuits, origin, melee, currentLoc, npcRel, npcName, npcSex } = userData;
  const finalName = isCreate ? name : npcName;
  const finalSex = isCreate ? sex : (npcSex || "異");

  // 🔴 姓名已在 sanitizeUserData_ 清成純中文；若為空代表含非中文字元，直接擋下不寫表
  if (!finalName) {
    return JSON.stringify({ success: false, message: "名號僅限中文字，不可使用英文、數字或符號。" });
  }

  if (!isCreate) {
    const pcRows = sheets.pc.getDataRange().getValues();
    if (pcRows.find(r => r[COL.PC.NAME] === finalName && !String(r[COL.PC.ID]).startsWith("DEAD_"))) return JSON.stringify({ success: false, message: "此人已在名錄。" });
  } else {
    // 🔴 玩家創角：前端check_name只在送出前驗證過一次，仍可能因延遲填表或直打API而與其他玩家撞名，
    //   故創角寫入前必須再次擋重複，否則會產生兩個同名PC，後續所有靠姓名查找的功能都會抓錯人。
    const pcRows = sheets.pc.getDataRange().getValues();
    if (pcRows.find(r => r[COL.PC.NAME] === finalName && !String(r[COL.PC.ID]).startsWith("DEAD_"))) return JSON.stringify({ success: false, message: "此名號已有大俠使用，請換一個名號。" });
    if (sheets.auth) { try { sheets.auth.appendRow([finalName, newId, "江湖散人", "", ""]); } catch (e) { } }
  }

  const pcRow = sheets.pc.getDataRange().getValues().find(r => r[COL.PC.ID] == pcId);
  const pcNameStr = pcRow ? pcRow[COL.PC.NAME] : "神祕人";
  // 🔵 實例化：御主創角 → 開新 game_id 世界；其餘(NPC)沿用操作者所屬 game_id
  const gameId = isCreate ? ("g_" + Date.now()) : (pcRow ? String(pcRow[COL.PC.GAME_ID] || "") : "");

  let validMapNames = ["落雁峰", "桃花塢", "崑崙秘境", "萬毒沼澤"];
  if (sheets.map) {
    const maps = sheets.map.getDataRange().getValues().slice(1).map(r => String(r[COL.MAP.NAME]).trim()).filter(n => n !== "" && !n.includes('-'));
    if (maps.length > 0) validMapNames = maps;
  }

  const sysOverride = `你是九州天道演化核心，負責根據${isCreate ? '玩家執念重構前世今生' : '角色原型進行完整重構'}。

★【陣營】無明確師承則 faction 填「無」、rank 填「散人」。
★【階級】rank 須含：掌門/宗主/長老/護法/堂主/執事/弟子/門人，無門派填「散人」。
★【境界】realm 從中選：${REALMS.join('、')}。對應身分：
- 普通市井(商人/農夫/店家/僕役/路人)：只能填凡人
- 初入江湖(茶客/普通鏢師/混混/小頭目)：凡人或引氣
- 江湖好手(散修/精銳鏢師/盜賊頭目/捕快)：引氣或凝罡
- 門派中堅(真傳弟子/執事/堂主)：凝罡或通玄
- 門派高層(長老/護法/總鏢頭)：通玄
- 頂尖大能(掌門/宗主/教主)：罡氣或意動
★絕大多數街頭結識的 NPC 應落在凡人～凝罡；通玄以上須有明確崇高地位(大派長老、一方掌門)佐證，禁止僅憑氣勢外貌濫發高境界。心象以上幾乎不應隨機出現。沒有明確武林身分的路人一律凡人。
★【OOC】已知動漫/虛構角色保留原著個性語癖，武俠化即可。

★【四格】traits 與 personality 各剛好 4 短句、頓號分隔、禁數字標籤：
- traits：外貌、氣質舉止、偏門技巧、床笫之間的反應
- personality：日常表象、真實內裡、喜歡的事、討厭的事
- npc_intent：令人會心一笑的「可愛弱點/反差萌」一句話，須結合此角色身分性格量身打造。如冷面殺手怕貓、高傲千金愛吃路邊攤、嚴肅宗主收藏兔子玩偶、毒舌大夫暈血。要反差、可愛、獨特。

★【輸出】合法 JSON、禁 Markdown：
{${isCreate ? '"start_loc":"出生地",' : ''}"background":"限20字，禁出現具體物品名","traits":"四格頓號字串","personality":"四格頓號字串","realm":"凡人","str":12,"con":12,"agi":12,"int":12,"luk":12,"faction":"無","rank":"散人","align":"絕對中立","npc_intent":"結合角色身分的獨特可愛反差萌，一句話","start_item":{"name":"與角色強烈相關的隨身之物","desc":"限15字描述"}}`;

  const npcContext = userData.npcContext ? `\n【登場脈絡】：${userData.npcContext.slice(0, 300)}` : "";
  const promptStr = isCreate
    ? `【御主】：名號『${finalName}』，性別『${finalSex}』\n【外貌】：${appearance || "隨機"}\n【身世／財力】：${standing || identity || "隨機"}\n【願望】：${wish || "隨機"}\n【魔術系統】：${magic || "隨機"}\n【出身】：${origin || "隨機"}\n【可選地點(冬木)】：${validMapNames.join('、')}`
    : `【名號】：『${finalName}』\n【性別】：『${finalSex}』\n【地點】：『${currentLoc}』\n【與玩家『${pcNameStr}』初始關係】：『${npcRel || "萍水相逢"}』${npcContext}`;

  // 🔵 御主創角專用 Fate 框架生成提示（NPC 仍走上面的 sysOverride）
  const MASTER_GEN_SYS = `你是《命運停駐之夜》聖杯戰爭的角色生成核心，為玩家建立一位「御主（Master）」——參與第五次聖杯戰爭的現代魔術師，舞台是冬木市。請依玩家提供的姓名、性別、身世／財力、願望，生成合理且具戲劇張力的設定。

★【演出而非說明】願望與身世只作為設定底層，不要在 background 裡直接複述願望字面。
★【四格】traits 與 personality 各剛好 4 短句、頓號分隔、禁數字標籤：
- traits：外貌、氣質舉止、魔術或戰鬥傾向、私下不為人知的一面
- personality：日常表象、真實內裡、喜歡的事、討厭的事
★npc_intent：一句【簡短】萌點（可愛反差，≤15字），結合此御主身分性格，要反差、可愛、獨特。
★background：限20字，呼應其身世／財力，禁出現具體物品名。
★start_loc：從冬木地點中選一個合理的居所或起點：${validMapNames.join('、')}
★realm 一律填「凡人」（御主靈基由系統裁定）。faction 填御主所屬（魔術協會／教會／無所屬等，無則「無」），rank 填「御主」。

★【輸出】合法 JSON、禁 Markdown：
{"start_loc":"冬木地點","background":"限20字","traits":"四格頓號字串","personality":"四格頓號字串","realm":"凡人","str":12,"con":12,"agi":12,"int":12,"luk":12,"faction":"無","rank":"御主","align":"中立","npc_intent":"結合御主身分的獨特可愛反差萌，一句話","start_item":{"name":"與御主相關的隨身之物","desc":"限15字描述"}}`;

  // 🔴 新版：加上 ignoreLaw: true，把節慶跟天氣隔絕在創建室外
  const aiBriefStr = callGeminiAPI(promptStr, isCreate ? MASTER_GEN_SYS : sysOverride, { temperature: 0.6, ignoreLaw: true });
  try {
    const aiBrief = JSON.parse(aiBriefStr);

    // 🔴 境界決定權收歸 GAS：AI 只能「建議」，實際境界由系統依身份+擲骰裁定
    let targetRealm;
    const rankStr = String(aiBrief.rank || "");

    if (isCreate) {
      // 玩家創角：永遠鎖死凡人
      targetRealm = "凡人";
    } else {
      // 先看 AI 有沒有標明確的高位頭銜，有的話按身份給對應境界
      if (rankStr.match(/掌門|宗主|教主|門主|谷主|閣主|魁首|老祖/)) {
        // 一派之主：罡氣 ~ 意動
        targetRealm = Math.random() < 0.5 ? "罡氣" : "意動";
      } else if (rankStr.match(/長老|護法|太上|副宗主/)) {
        // 門派高層：通玄 ~ 罡氣
        targetRealm = Math.random() < 0.5 ? "通玄" : "罡氣";
      } else if (rankStr.match(/堂主|真傳|首席|執事|香主|統領/)) {
        // 門派中堅：凝罡 ~ 通玄
        targetRealm = Math.random() < 0.5 ? "凝罡" : "通玄";
      } else {
        // 🎲 沒有明確高位身份 = 普通江湖人，GAS 擲骰決定，絕大多數是凡人
        const roll = Math.random() * 100;
        if (roll < 70) targetRealm = "凡人";        // 70%
        else if (roll < 90) targetRealm = "引氣";   // 20%
        else if (roll < 98) targetRealm = "凝罡";   // 8%
        else targetRealm = "通玄";                  // 2% 隱世高手
      }
    }

    const rIdx = REALMS.indexOf(targetRealm);
    let baseFloor = 8, statCap = 25;
    if (rIdx > 0) {
      baseFloor = Math.floor(REALM_LIMITS[REALMS[rIdx - 1]] * 0.8);
      statCap = REALM_LIMITS[targetRealm];
    }

    // 🔴 3. 數值生成：不信任 AI 的數值平衡！玩家新建強制鎖死在初始範圍，NPC 則依境界給定。
    let nStr, nCon, nAgi, nInt, nLuk;
    if (isCreate) {
      // 玩家初始屬性：給予 10~15 的隨機波動，保留凡人(上限25)的修練與吃藥空間
      nStr = Math.floor(Math.random() * 6) + 10;
      nCon = Math.floor(Math.random() * 6) + 10;
      nAgi = Math.floor(Math.random() * 6) + 10;
      nInt = Math.floor(Math.random() * 6) + 10;
      nLuk = Math.floor(Math.random() * 6) + 10;
    } else {
      // NPC 屬性：依照 AI 給的數值 (預設12) 加上該境界的樓地板計算，並受限於該境界上限
      nStr = Math.max(baseFloor, Math.min(statCap, (parseInt(aiBrief.str) || 12) + baseFloor - 8));
      nCon = Math.max(baseFloor, Math.min(statCap, (parseInt(aiBrief.con) || 12) + baseFloor - 8));
      nAgi = Math.max(baseFloor, Math.min(statCap, (parseInt(aiBrief.agi) || 12) + baseFloor - 8));
      nInt = Math.max(baseFloor, Math.min(statCap, (parseInt(aiBrief.int) || 12) + baseFloor - 8));
      nLuk = Math.max(baseFloor, Math.min(statCap, (parseInt(aiBrief.luk) || 12) + baseFloor - 8));
    }
    const maxStats = calculateMaxStats(targetRealm, nCon, nInt);

    let spawnName = isCreate ? (aiBrief.start_loc || validMapNames[0]) : currentLoc;
    if (isCreate && !validMapNames.includes(spawnName)) spawnName = validMapNames.find(n => spawnName.includes(n)) || validMapNames[0];

    const pcColCount = Object.keys(COL.PC).length;
    const newRow = Array(pcColCount).fill("");
    newRow[COL.PC.ID] = newId; newRow[COL.PC.NAME] = finalName; newRow[COL.PC.SEX] = finalSex;
    newRow[COL.PC.BACK] = isCreate ? (standing || aiBrief.background || "來歷不明的魔術師") : (aiBrief.background || "江湖散人"); newRow[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "氣息平穩" });
    if (isCreate) {
      newRow[COL.PC.MEMORY] = [
        wish ? `【願望】${wish}` : "",
        magic ? `【魔術】${magic}` : "",
        circuits ? `【迴路】${circuits}` : "",
        origin ? `【出身】${origin}` : "",
        melee ? `【體術】${melee}` : "",
        "【令咒】3",
        `【模式】${userData.warMode === 'chaos' ? 'chaos' : 'canon'}`,
        userData.warMode === 'chaos' ? "" : `【戰爭】${['4th', '5th', 'fake'].indexOf(String(userData.war)) >= 0 ? userData.war : '5th'}`,
        (userData.warMode !== 'chaos' && userData.playedMaster) ? `【扮演】${String(userData.playedMaster).trim()}` : ""
      ].filter(Boolean).join("｜");
    }
    // 🔴 NPC 初始銀兩依境界給(玩家創角固定 50)，錢有變化、高人更富
    if (isCreate) {
      newRow[COL.PC.MONEY] = 150;
    } else {
      const rk = REALMS.indexOf(targetRealm);
      let lo, hi;
      if (rk <= 0) { lo = 30; hi = 60; }   // 凡人：口袋零錢
      else if (rk <= 2) { lo = 80; hi = 150; }   // 引氣、凝罡：江湖好手
      else if (rk === 3) { lo = 200; hi = 400; }   // 通玄：門派中堅高層
      else { lo = 500; hi = 1000; }  // 罡氣以上：一方大能
      newRow[COL.PC.MONEY] = lo + Math.floor(Math.random() * (hi - lo + 1));
    }
    newRow[COL.PC.TRAIT] = parseTraitsHelper(aiBrief.traits, "深藏不露、武功平平、雜學精通、床笫之間的反應");
    newRow[COL.PC.LOC] = spawnName;
    newRow[COL.PC.PREF] = parseTraitsHelper(aiBrief.personality, "溫婉謙和、內斂堅韌、明哲保身、隨波逐流");
    newRow[COL.PC.HP] = maxStats.hp; newRow[COL.PC.MP] = maxStats.mp;
    newRow[COL.PC.STR] = nStr; newRow[COL.PC.CON] = nCon; newRow[COL.PC.AGI] = nAgi; newRow[COL.PC.INT] = nInt; newRow[COL.PC.LUK] = nLuk;
    newRow[COL.PC.MAX_HP] = maxStats.hp; newRow[COL.PC.MAX_MP] = maxStats.mp;
    newRow[COL.PC.REALM] = isCreate ? "凡人" : targetRealm;
    newRow[COL.PC.FACTION] = aiBrief.faction || "無"; newRow[COL.PC.RANK] = aiBrief.rank || "散人";
    newRow[COL.PC.CONTRIB] = 0; newRow[COL.PC.ALIGN] = aiBrief.align || "絕對中立";
    newRow[COL.PC.INTENT] = String(aiBrief.npc_intent || "").slice(0, 18) || "（待揭曉）";
    newRow[COL.PC.GAME_ID] = gameId;
    sheets.pc.appendRow(newRow);

    if (!isCreate && aiBrief.start_item && aiBrief.start_item.name) {
      sheets.item.appendRow([
        aiBrief.start_item.name,
        "隨身之物",
        aiBrief.start_item.desc || "隨身攜帶的物品。",
        0,
        newId,
        0, 0, 0, 0, 0,
        "ITM_" + Date.now() + "_born"
      ]);
    }

    if (!isCreate && sheets.rel) {
      // 🔴 防呆：檢查關係表裡是不是已經有感情基礎了 (例如未收錄前就加了好感)
      const relData = sheets.rel.getDataRange().getValues();
      const existingRel = relData.find(r => r[COL.REL.PC] === pcNameStr && r[COL.REL.NPC] === finalName);

      if (!existingRel) {
        // 只有真的完全不認識，才給予預設好感度
        let initialFav = npcRel === "奴僕" ? 60 : (npcRel === "主子" ? 20 : (String(npcRel).includes("結義") ? 70 : 10));
        sheets.rel.appendRow([pcNameStr, finalName, initialFav, npcRel, "", ""]);
      }
    }

    registerFactionHelper(aiBrief.faction, aiBrief.rank, aiBrief.align, spawnName, finalName, sheets, isCreate ? newId : pcId, finalName, sheets.faction ? sheets.faction.getDataRange().getValues() : []);

      if (isCreate && userData.account) { try { linkAccountToPc_(userData.account, newId); } catch (e) { } }
  return JSON.stringify({ success: true, pcId: isCreate ? newId : undefined, gameId: isCreate ? gameId : undefined, message: `【聖杯】因果已定，『${finalName}』${isCreate ? `於「${spawnName}」締結令咒，成為御主` : `已收錄`}。` });
  } catch (e) { return JSON.stringify({ success: false, message: "建立失敗:" + e.message }); }
}

// ==========================================
// 🔵 召喚從者（Servant）— 寫進御主自己的 game_id 實例，並設為同行夥伴
// ==========================================
// 🔵 六圍階級 → 九州數值（橋接）：rankVal 轉，最低 8
function svNum_(rank) { return Math.max(8, rankVal(rank)); }

// 🔵 提供前端瀏覽英靈殿：回傳 [{id,cls,name,gender,np}]
// 從御主 MEMORY 讀戰役模式（canon=正史 / chaos=混亂；舊角色預設 canon）
function getWarMode_(memory) {
  var m = String(memory || "").match(/【模式】(canon|chaos)/);
  return m ? m[1] : "canon";
}
// 鋪敵用的「戰爭」字串：混亂→chaos；正史→【戰爭】(4th/5th/fake，預設 5th)
function getWarName_(memory) {
  if (getWarMode_(memory) === "chaos") return "chaos";
  var m = String(memory || "").match(/【戰爭】(4th|5th|fake)/);
  return m ? m[1] : "5th";
}
// 玩家扮演的正典御主 id（自創則空）
function getPlayedMaster_(memory) {
  var m = String(memory || "").match(/【扮演】([^|【]+)/);
  return m ? m[1].trim() : "";
}

function actionGetHeroes(userData, pcId, sheets) {
  try {
    const hs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("英靈殿");
    if (!hs || hs.getLastRow() <= 1) return JSON.stringify({ success: true, heroes: [] });
    const rows = hs.getDataRange().getValues().slice(1);
    const heroes = rows.filter(r => r[COL.HERO.ID]).map(r => ({
      id: r[COL.HERO.ID], cls: r[COL.HERO.CLS], name: r[COL.HERO.NAME],
      gender: r[COL.HERO.SEX], np: r[COL.HERO.NP]
    }));
    return JSON.stringify({ success: true, heroes: heroes });
  } catch (e) {
    return JSON.stringify({ success: false, heroes: [], message: e.message });
  }
}

// 取某場戰爭的正典御主清單（供「扮演正典御主」帶入預設）
function actionGetMasters(userData, pcId, sheets) {
  const war = String(userData.war || "5th");
  const roster = (war === '4th') ? FATE_4TH_ROSTER : FATE_5TH_ROSTER;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const msh = ss.getSheetByName("御主殿");
  if (!msh) return JSON.stringify({ success: true, masters: [] });
  const mrows = msh.getDataRange().getValues();
  const out = roster.map(function (r) {
    const m = mrows.find(function (x) { return String(x[COL.MASTER.ID]) === r.master; });
    if (!m) return null;
    return {
      id: String(m[COL.MASTER.ID]), name: String(m[COL.MASTER.NAME] || ""),
      sex: String(m[COL.MASTER.SEX] || "異"), appear: String(m[COL.MASTER.APPEAR] || ""),
      magic: String(m[COL.MASTER.MAGIC] || ""), wish: String(m[COL.MASTER.WISH] || ""),
      servant: r.hero
    };
  }).filter(Boolean);
  return JSON.stringify({ success: true, masters: out });
}

// 引擎實際吃得到的 fx 字典（AI 生成新從者時從中挑選，確保新角色也能「吃到標籤」）
var ALLOWED_FX_ = {
  nullify_magic: 1, first_strike: 1, analyze: 1, str_up: 1, burst: 1, ride: 1, stealth: 1,
  evade_ranged: 1, survive: 1, divine_core: 1, mad: 1, morale: 1, divine_age: 1,
  unreadable: 1, wind_strike: 1, tsubame: 1, gae_bolg: 1, god_hand: 1,
  clear_mind: 1, self_mod: 1, tactics: 1, anti_magic_lance: 1, rule_breaker: 1
};
var FX_MENU_ = "【可用技能效果碼 fx】挑契合此英靈的，沒對應就填空字串\"\"：" +
  "對魔力=nullify_magic、直感=first_strike、心眼=analyze、怪力=str_up、魔力放出=burst、騎乘=ride、" +
  "氣息遮斷=stealth、避矢=evade_ranged、戰鬥續行=survive、神核=divine_core、狂化=mad、" +
  "勇猛/卡里斯瑪=morale、神代魔術=divine_age、無欲(封先機)=unreadable、透化(免威壓)=clear_mind、" +
  "自我改造(命中傷害+)=self_mod、軍略(寶具+)=tactics、必中槍=gae_bolg、不死復活=god_hand、" +
  "破魔(無視神核/續行)=anti_magic_lance、破戒(斬契約救贖)=rule_breaker";

// 清洗 AI 給的技能陣列為 [{n,r,fx}]（fx 不在字典就清空，仍保留為演出用標籤）
function sanitizeSkills_(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(Boolean).slice(0, 5).map(function (s) {
    var fx = String((s && (s.fx || s.效果碼)) || "").trim();
    return {
      n: String((s && (s.n || s.名稱 || s.name)) || "技能").slice(0, 10),
      r: String((s && (s.r || s.階級 || s.rank)) || "C").slice(0, 2).toUpperCase(),
      fx: ALLOWED_FX_[fx] ? fx : ""
    };
  });
}
// 清洗六圍：6 鍵齊全、階級合法（E~EX、可帶+）；缺則補 C
function sanitizeSix_(o) {
  var keys = ["筋力", "耐久", "敏捷", "魔力", "幸運", "寶具"], out = {};
  var ok = function (v) { return /^(E|D|C|B|A|EX)\+?$/.test(String(v || "").toUpperCase()); };
  keys.forEach(function (k) { var v = o && o[k] ? String(o[k]).toUpperCase() : "C"; out[k] = ok(v) ? v : "C"; });
  return out;
}

// 🆕 把 AI 生成的原創從者寫回英靈殿（重名則不收；御主不適用此機制）
function recordOriginalHero_(name, cls, sex, sixJson, classSkills, skills, traits, np, personaWords, align) {
  name = String(name || "").trim();
  if (!name) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hs = ss.getSheetByName("英靈殿");
  if (!hs) return;
  var data = hs.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.HERO.NAME]).trim() === name) return; // 已有同名 → 不重複收錄
  }
  var persona = JSON.stringify({ words: String(personaWords || ""), firstP: "我", toMaster: "" });
  hs.appendRow([name + "-" + cls, cls, name, sex || "異", sixJson || "{}",
    JSON.stringify(classSkills || []), JSON.stringify(skills || []), JSON.stringify(traits || []),
    np || "", persona, align || "中立", "[]", "ai_gen"]);
}

function actionSummonServant(userData, pcId, sheets) {
  const VALID_CLS = ["Saber", "Archer", "Lancer", "Rider", "Caster", "Assassin", "Berserker"];
  const reqCls = VALID_CLS.includes(userData.cls) ? userData.cls : "";
  const heroId = String(userData.heroId || "").trim();
  const trueName = String(userData.trueName || "").trim().slice(0, 20);
  const custDesc = String(userData.desc || "").trim().slice(0, 120); // 自訂描述生成原創從者

  const pcData = sheets.pc.getDataRange().getValues();
  const masterRow = pcData.find(r => r[COL.PC.ID] == pcId);
  if (!masterRow) return JSON.stringify({ success: false, message: "找不到御主，請重新登入。" });
  const pcName = masterRow[COL.PC.NAME];
  const pcLoc = masterRow[COL.PC.LOC] || "冬木·新都";
  const gameId = String(masterRow[COL.PC.GAME_ID] || "");

  const already = pcData.find(r =>
    String(r[COL.PC.FACTION]) === "從者" &&
    String(r[COL.PC.GAME_ID] || "") === gameId &&
    !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (already) return JSON.stringify({ success: false, message: `你已締約從者「${already[COL.PC.NAME]}」，無法再召喚。` });

  // 戰役資訊（正史可自由奪取正典從者，被奪的那組會從對手名單移除）
  const warName = getWarName_(masterRow[COL.PC.MEMORY]);
  const playedMaster = getPlayedMaster_(masterRow[COL.PC.MEMORY]);

  // ── 從英靈殿尋找對應英靈（heroId 指定 / 真名比對 / 隨機）──
  let hero = null;
  try {
    const hs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("英靈殿");
    if (hs && hs.getLastRow() > 1) {
      const hrows = hs.getDataRange().getValues().slice(1).filter(r => r[COL.HERO.ID]);
      if (heroId) {
        hero = hrows.find(r => String(r[COL.HERO.ID]) === heroId);
      } else if (trueName) {
        hero = hrows.find(r => String(r[COL.HERO.NAME]).includes(trueName) || trueName.includes(String(r[COL.HERO.NAME])));
      } else {
        let pool = reqCls ? hrows.filter(r => r[COL.HERO.CLS] === reqCls) : hrows;
        if (pool.length) hero = pool[Math.floor(Math.random() * pool.length)];
      }
    }
  } catch (e) { hero = null; }
  if (custDesc) hero = null; // 自訂描述 → 強制走 AI 生成原創，不抓名冊

  const newId = "NPC_" + Date.now();
  const pcColCount = Object.keys(COL.PC).length;
  const row = Array(pcColCount).fill("");
  let realName, cls, align, np, sex;

  try {
    if (hero) {
      // ✅ 從英靈殿實體化：用真實六圍/技能/寶具/人格
      cls = hero[COL.HERO.CLS];
      realName = hero[COL.HERO.NAME];
      sex = (hero[COL.HERO.SEX] === "無" ? "異" : (hero[COL.HERO.SEX] || "異"));
      align = hero[COL.HERO.ALIGN] || "中立";
      np = hero[COL.HERO.NP] || "寶具（未顯現）";
      const six = JSON.parse(hero[COL.HERO.SIX] || "{}");
      const classSkills = JSON.parse(hero[COL.HERO.CLASS_SKILLS] || "[]");
      const skills = JSON.parse(hero[COL.HERO.SKILLS] || "[]");
      const traits = JSON.parse(hero[COL.HERO.TRAITS] || "[]");
      const persona = JSON.parse(hero[COL.HERO.PERSONA] || "{}");

      // 六圍 → 九州數值（REALM 凡人，倍率 1.0，數值即 rankVal）
      const nStr = svNum_(six.筋力), nCon = svNum_(six.耐久), nAgi = svNum_(six.敏捷), nInt = svNum_(six.魔力), nLuk = svNum_(six.幸運);
      const maxStats = calculateMaxStats("凡人", nCon, nInt);
      // 從者血厚：耐久越高越肉
      const svHp = 300 + svNum_(six.耐久) * 12, svMp = 120 + svNum_(six.魔力) * 6;

      row[COL.PC.STR] = nStr; row[COL.PC.CON] = nCon; row[COL.PC.AGI] = nAgi; row[COL.PC.INT] = nInt; row[COL.PC.LUK] = nLuk;
      row[COL.PC.HP] = svHp; row[COL.PC.MP] = svMp; row[COL.PC.MAX_HP] = svHp; row[COL.PC.MAX_MP] = svMp;
      row[COL.PC.REALM] = "凡人";
      row[COL.PC.TRAIT] = parseTraitsHelper(traits.map(t => t.n).join("、"), "氣場凜然、舉止從容、精擅戰技、深藏之面");
      // 依人格補完 4 格個性（含喜歡/討厭）＋ 短萌點
      let svPref = String(persona.words || "").replace(/・/g, "、");
      let svMoe = "";
      let svBack = `${cls}・${realName}`;
      try {
        const en = JSON.parse(callGeminiAPI(
          `從者真名：${realName}（${cls}職階）\n性格關鍵：${persona.words || ""}\n對御主：${persona.toMaster || ""}\n寶具：${np}`,
          `為《命運停駐之夜》的從者補完設定（依該英靈真實傳說，只給設定、勿演出複述）。\n★生平：一句【貼近官方傳說】的生平梗概，≤24 字。\n★personality：剛好 4 短句、頓號分隔，依序為「日常表象、真實內裡、喜歡的事、討厭的事」。\n★萌點：一句【簡短】可愛反差，≤15 字。\n輸出合法 JSON、禁 Markdown：{"生平":"≤24字","personality":"四格頓號字串","萌點":"≤15字"}`,
          { temperature: 0.7, ignoreLaw: true }));
        if (en && en.personality) svPref = en.personality;
        svMoe = String((en && en.萌點) || "").slice(0, 18);
        if (en && en.生平) svBack = String(en.生平).slice(0, 28);
      } catch (e) { }
      row[COL.PC.PREF] = parseTraitsHelper(svPref, "沉著表象、堅定內裡、珍視之物、厭惡之事");
      row[COL.PC.MEMORY] = `第一人稱「${persona.firstP || "我"}」｜對御主：${persona.toMaster || "保持距離"}`;
      row[COL.PC.SIX] = JSON.stringify(six);
      row[COL.PC.TAGS] = JSON.stringify({ skills: classSkills.concat(skills), traits: traits });
      row[COL.PC.INTENT] = svMoe;
      row[COL.PC.BACK] = svBack;
    } else {
      // 🌀 名冊查無 → AI 即時生成「第一級從者」：含真實六圍階級＋帶 fx 的技能（吃得到標籤）
      cls = reqCls || "Saber";
      const sysOverride = `你是《命運停駐之夜》的英靈召喚核心。玩家御主召喚出一名「從者（Servant）」，職階為「${cls}」。${custDesc ? `這是玩家【自訂描述的原創英靈】，請依描述創作一位全新原創從者（可自取貼切真名），忠於描述的形象與氣質。` : (trueName ? `指定真名為「${trueName}」，請忠於該英靈的傳說與性格（可跨作品：動漫／遊戲／神話／歷史皆可）。` : "請挑選一位契合此職階、知名的歷史或傳說英靈。")}

★【六圍 six】依該英靈強弱給「筋力/耐久/敏捷/魔力/幸運/寶具」各一個階級，階級用 E,D,C,B,A,EX（強處可加 + 如 A+）；務必有強有弱、貼合傳說。
★【技能帶 fx】classSkills(職階技能 1~2 個)＋skills(固有技能 2~3 個)，每個含 {"n":"技能名","r":"階級","fx":"效果碼"}。
${FX_MENU_}
★【特性 traits】1~3 個，{"n":"特性名"}（如 王/龍/人類/神性/巨人/猛獸；有神性者會被神殺剋）。
★【演出而非說明】personality 與寶具只作底層，勿直接複述字面。personality 剛好 4 短句頓號分隔：日常表象、真實內裡、喜歡的事、討厭的事。
★np：寶具名＋一句威能簡述。★npc_intent：一句【簡短】反差萌（≤15字）。★sex 從 男／女／異 擇一。

★【輸出】合法 JSON、禁 Markdown：
{"realName":"英靈真名","sex":"女","align":"中立・善","background":"限20字","npc_intent":"反差萌一句","personality":"四格頓號","np":"寶具名（簡述）","six":{"筋力":"B","耐久":"C","敏捷":"A","魔力":"D","幸運":"C","寶具":"B"},"classSkills":[{"n":"對魔力","r":"B","fx":"nullify_magic"}],"skills":[{"n":"直感","r":"A","fx":"first_strike"},{"n":"怪力","r":"B","fx":"str_up"}],"traits":[{"n":"人類"}]}`;
      const aiBrief = JSON.parse(callGeminiAPI(`【職階】：${cls}\n【御主】：${pcName}${trueName ? `\n【指定真名】：${trueName}` : ""}${custDesc ? `\n【玩家自訂描述】：${custDesc}` : ""}`, sysOverride, { temperature: custDesc ? 0.85 : 0.6, ignoreLaw: true }));
      realName = String(aiBrief.realName || trueName || (cls + "從者")).trim() || (cls + "從者");
      sex = aiBrief.sex || "異"; align = aiBrief.align || "中立"; np = aiBrief.np || "寶具（未顯現）";
      const aiSix = sanitizeSix_(aiBrief.six);
      const aiCSkills = sanitizeSkills_(aiBrief.classSkills);
      const aiSkills = sanitizeSkills_(aiBrief.skills);
      const aiTraits = Array.isArray(aiBrief.traits) ? aiBrief.traits.filter(Boolean).slice(0, 4).map(t => ({ n: String((t && (t.n || t.名稱 || t.name)) || t).slice(0, 8) })) : [];
      // 六圍 → 數值（與名冊路徑一致，svNum_ 橋接）
      const nStr = svNum_(aiSix.筋力), nCon = svNum_(aiSix.耐久), nAgi = svNum_(aiSix.敏捷), nInt = svNum_(aiSix.魔力), nLuk = svNum_(aiSix.幸運);
      const svHp = 300 + svNum_(aiSix.耐久) * 12, svMp = 120 + svNum_(aiSix.魔力) * 6;
      row[COL.PC.STR] = nStr; row[COL.PC.CON] = nCon; row[COL.PC.AGI] = nAgi; row[COL.PC.INT] = nInt; row[COL.PC.LUK] = nLuk;
      row[COL.PC.HP] = svHp; row[COL.PC.MP] = svMp; row[COL.PC.MAX_HP] = svHp; row[COL.PC.MAX_MP] = svMp;
      row[COL.PC.REALM] = "凡人";
      row[COL.PC.TRAIT] = parseTraitsHelper(aiTraits.map(t => t.n).join("、"), "氣場凜然、舉止從容、精擅戰技、不為人知的一面");
      row[COL.PC.PREF] = parseTraitsHelper(aiBrief.personality, "沉著表象、堅定內裡、珍視之物、厭惡之事");
      row[COL.PC.INTENT] = String(aiBrief.npc_intent || "").slice(0, 18);
      row[COL.PC.SIX] = JSON.stringify(aiSix);
      row[COL.PC.TAGS] = JSON.stringify({ skills: aiCSkills.concat(aiSkills), traits: aiTraits });
      row[COL.PC.BACK] = aiBrief.background || `${cls} 職階的英靈`;
      // 🆕 不重名的原創從者 → 寫回英靈殿（含六圍/技能fx/特性），日後可重用（御主不收）
      try { recordOriginalHero_(realName, cls, sex, row[COL.PC.SIX], aiCSkills, aiSkills, aiTraits, np, aiBrief.personality, align); } catch (e) { }
    }

    row[COL.PC.ID] = newId;
    row[COL.PC.NAME] = realName;
    row[COL.PC.SEX] = sex;
    row[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "氣息平穩" });
    row[COL.PC.MONEY] = 0;
    row[COL.PC.LOC] = pcLoc;
    row[COL.PC.FACTION] = "從者"; row[COL.PC.RANK] = cls; row[COL.PC.CLS] = cls;
    row[COL.PC.CONTRIB] = 0; row[COL.PC.ALIGN] = align;
    row[COL.PC.MARTIAL] = np;
    row[COL.PC.GAME_ID] = gameId;
    sheets.pc.appendRow(row);

    if (sheets.rel) {
      try { sheets.rel.appendRow([pcName, realName, 35, "從者", "同行", "", ""]); } catch (e) { }
    }

    // 🔵 召喚完成 → 鋪敵方御主×從者進這個 game_id 世界（一次性）
    try { seedRivalsForGame_(gameId, realName, warName, playedMaster); } catch (e) { }

    return JSON.stringify({ success: true, servantName: realName, cls: cls, fromCodex: !!hero, message: `【聖杯】令咒迸發，${cls} 職階的從者「${realName}」應召而現，與『${pcName}』締結契約。其餘御主已在冬木各處備戰。` });
  } catch (e) {
    return JSON.stringify({ success: false, message: "召喚失敗：" + e.message });
  }
}

// ==========================================
// 🔵 御主／從者 標籤資料（左側狀態卡用）：只給動作姿勢/令咒/羈絆/寶具，不給六維
// ==========================================
function actionGetTags(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const m = pcData.find(r => r[COL.PC.ID] == pcId);
  if (!m) return JSON.stringify({ success: false });
  const gameId = String(m[COL.PC.GAME_ID] || "");

  const hpWord = (hp, mx) => {
    hp = parseInt(hp) || 0; mx = parseInt(mx) || 1; const p = hp / mx;
    return p >= 0.99 ? "無傷" : p >= 0.7 ? "輕傷" : p >= 0.4 ? "負傷" : p > 0.15 ? "重傷" : p > 0 ? "瀕死" : "力竭";
  };

  let wish = "";
  const wm = String(m[COL.PC.MEMORY] || "").match(/【願望】([^|【]*)/);
  if (wm) wish = wm[1].trim();

  const master = {
    name: m[COL.PC.NAME], sex: m[COL.PC.SEX],
    condition: buildVisibleStatusString(m[COL.PC.STATUS]),
    hp: hpWord(m[COL.PC.HP], m[COL.PC.MAX_HP]),
    seals: getPlayerSeals_(m[COL.PC.MEMORY]), wish: wish
  };

  let servant = null;
  const s = pcData.find(r =>
    String(r[COL.PC.FACTION]) === "從者" &&
    String(r[COL.PC.GAME_ID] || "") === gameId &&
    !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (s) {
    let bond = 0;
    if (sheets.rel) {
      const rel = sheets.rel.getDataRange().getValues().find(r => r[COL.REL.PC] === m[COL.PC.NAME] && r[COL.REL.NPC] === s[COL.PC.NAME]);
      if (rel) bond = parseInt(rel[COL.REL.FAV]) || 0;
    }
    let six = {}, skills = [], traits = [];
    try { six = JSON.parse(s[COL.PC.SIX] || "{}"); } catch (e) { }
    try { const tg = JSON.parse(s[COL.PC.TAGS] || "{}"); skills = tg.skills || []; traits = tg.traits || []; } catch (e) { }
    servant = {
      name: s[COL.PC.NAME], cls: s[COL.PC.RANK] || "從者", sex: s[COL.PC.SEX],
      condition: buildVisibleStatusString(s[COL.PC.STATUS]),
      hp: hpWord(s[COL.PC.HP], s[COL.PC.MAX_HP]),
      np: s[COL.PC.MARTIAL] || "寶具未顯現", bond: bond,
      six: six, skills: skills, traits: traits
    };
  }
  return JSON.stringify({ success: true, master: master, servant: servant });
}

// 🔴 修正：原本所有缺座標的地點都會被塞進 (0,0)，導致俯瞰圖上大量節點重疊堆疊。
// 改用方形螺旋演算法，讓每個缺座標的地點依序分配到唯一、不重疊的座標。
function _spiralCoordForIndex(n) {
  let x = 0, y = 0, dx = 0, dy = -1;
  for (let i = 0; i < n; i++) {
    if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
      const t = dx; dx = -dy; dy = t;
    }
    x += dx; y += dy;
  }
  return [x, y];
}

// 🔵 視覺地圖節點：冬木頂層地點 + 座標 + 我是否在此 + 已偵查敵人數(吃迷霧/game_id)
function actionGetMapNodes(userData, pcId, sheets) {
  try {
    if (!sheets.map) return JSON.stringify({ success: false, nodes: [] });
    const pcData = sheets.pc.getDataRange().getValues();
    const me = pcData.find(r => r[COL.PC.ID] == pcId);
    const myGameId = me ? String(me[COL.PC.GAME_ID] || "") : "";
    const myLoc = me ? String(me[COL.PC.LOC] || "").trim() : "";
    const enemyAt = {};
    pcData.slice(1).forEach(r => {
      const fac = String(r[COL.PC.FACTION]);
      if (fac !== "敵御主" && fac !== "敵從者") return;
      if (myGameId && String(r[COL.PC.GAME_ID] || "") !== myGameId) return;
      if (!r[COL.PC.SEEN]) return;
      const loc = String(r[COL.PC.LOC] || "").trim();
      enemyAt[loc] = (enemyAt[loc] || 0) + 1;
    });
    const md = sheets.map.getDataRange().getValues();
    const nodes = [];
    for (let i = 1; i < md.length; i++) {
      const name = String(md[i][COL.MAP.NAME] || "").trim();
      if (!name) continue;
      if (String(md[i][COL.MAP.PARENT] || "").trim() !== "") continue; // 只取頂層冬木地點
      const co = String(md[i][COL.MAP.COORD] || "0,0").split(',');
      nodes.push({
        name: name, type: String(md[i][COL.MAP.TYPE] || ""),
        x: parseFloat(co[0]) || 0, y: parseFloat(co[1]) || 0,
        here: name === myLoc, enemy: enemyAt[name] || 0
      });
    }
    return JSON.stringify({ success: true, nodes: nodes, here: myLoc });
  } catch (e) {
    return JSON.stringify({ success: false, nodes: [], message: e.message });
  }
}

function actionGetAllCategorizedMaps(userData, pcId, sheets) {
  if (!sheets.map) return JSON.stringify({ success: false, message: "坤圖表不存在" });
  try {
  const mapData = sheets.map.getDataRange().getValues();
  let missingCoordIndex = 0;
  const SPIRAL_SPACING = 4; // 網格間距，避免自動分配的節點互相重疊
  const nextFallbackCoord = () => {
    const [sx, sy] = _spiralCoordForIndex(missingCoordIndex++);
    return `${sx * SPIRAL_SPACING},${sy * SPIRAL_SPACING}`;
  };
  // 🔴 母節點座標去重：展開神識時母節點是用座標定位的，只要座標為空、或與已用座標相撞
  //    (含舊資料字面 "0,0")，就改派一個唯一的螺旋座標，徹底避免在 (0,0) 重疊堆疊。
  const usedCoords = new Set();
  const resolveCoord = (desired) => {
    let c = String(desired || "").trim();
    if (c === "") c = nextFallbackCoord();
    while (usedCoords.has(c)) c = nextFallbackCoord();
    usedCoords.add(c);
    return c;
  };

  // 🔴 統計每個地點的人數（🔵 只算自己 game_id 世界的人，杜絕跨世界人數外洩）
  const allPcData = sheets.pc.getDataRange().getValues();
  const meRowMap = allPcData.find(r => r[COL.PC.ID] == pcId);
  const myGameIdMap = meRowMap ? String(meRowMap[COL.PC.GAME_ID] || "") : "";
  const locCount = {};
  allPcData.slice(1).forEach(r => {
    const id = String(r[COL.PC.ID]);
    if (id.startsWith("DEAD_")) return;
    if (myGameIdMap && String(r[COL.PC.GAME_ID] || "") !== myGameIdMap) return;
    const facM = String(r[COL.PC.FACTION]);
    if ((facM === "敵御主" || facM === "敵從者") && !r[COL.PC.SEEN]) return; // 🔵 戰爭迷霧：未偵查到的敵人不在地圖顯示
    const fullLoc = String(r[COL.PC.LOC] || "").trim();
    const rootLoc = fullLoc.split('-')[0].trim();

    // 母區域計數
    if (rootLoc) locCount[rootLoc] = (locCount[rootLoc] || 0) + 1;

    // 子分支計數（只有真的在子分支才加）
    if (fullLoc !== rootLoc && fullLoc) {
      locCount[fullLoc] = (locCount[fullLoc] || 0) + 1;
    }
  });

  const mapTree = {};
  for (let i = 1; i < mapData.length; i++) {
    const name = String(mapData[i][COL.MAP.NAME]).trim();
    const cat = String(mapData[i][COL.MAP.TYPE] || "未分類").trim();
    const parent = String(mapData[i][COL.MAP.PARENT] || "").trim();
    const desc = String(mapData[i][COL.MAP.DESC] || "");
    // 🔴 這裡多抓了 COORD 欄位（缺座標或撞號時改派唯一座標，避免疊圖在0,0）
    const rawCoord = String(mapData[i][COL.MAP.COORD] || "").trim();

    if (!mapTree[cat]) mapTree[cat] = {};
    if (parent === "") {
      // 🔴 這裡把 coord 塞進去（若子分支已先建立佔位節點，補上真正的座標與描述）
      const existing = mapTree[cat][name];
      if (existing) {
        existing.desc = desc;
        existing.coord = resolveCoord(rawCoord);
      } else {
        mapTree[cat][name] = { desc: desc, subs: [], count: locCount[name] || 0, coord: resolveCoord(rawCoord) };
      }
    } else {
      if (!mapTree[cat][parent]) mapTree[cat][parent] = { desc: "區域中心", subs: [], count: locCount[parent] || 0, coord: resolveCoord("") };
      mapTree[cat][parent].subs.push({
        name: name, desc: desc, count: locCount[name] || 0
      });
    }
  }
  return JSON.stringify({ success: true, data: mapTree });
  } catch (e) { return JSON.stringify({ success: false, message: "地圖讀取異常：" + e.message }); }
}

function actionMove(userData, pcId, sheets) {
  const { target } = userData;
  const allPcData = sheets.pc.getDataRange().getValues();
  const pIdx = allPcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  // ⏳ 行動點檢查（移動耗 2 AP＝2 小時；鑑賞 k_ 不耗 AP）
  const moveGameId = String(allPcData[pIdx][COL.PC.GAME_ID] || "");
  const isFateMove = moveGameId.indexOf("g_") === 0;
  if (isFateMove && getAp_(moveGameId) < 2) {
    return JSON.stringify({ success: false, message: "行動力不足以遠行（需 2 點）——請『休息』恢復後再出發。", clock: clockLabel_(moveGameId), ap: getAp_(moveGameId), apMax: AP_PER_DAY });
  }

  allPcData[pIdx][COL.PC.LOC] = target;
  const pcName = allPcData[pIdx][COL.PC.NAME];
  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];

  relData.filter(r => r[COL.REL.PC] === pcName && r[COL.REL.IS_PARTY] === "同行").map(r => r[COL.REL.NPC]).forEach(npcName => {
    const nIdx = allPcData.findIndex(r => r[COL.PC.NAME] === npcName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
    if (nIdx !== -1) allPcData[nIdx][COL.PC.LOC] = target;
  });

  const pcColCount = Object.keys(COL.PC).length;
  allPcData.forEach(row => { while (row.length < pcColCount) { row.push(""); } });

  sheets.pc.getRange(1, 1, allPcData.length, pcColCount).setValues(allPcData);
  SpreadsheetApp.flush();

  // ⏳ 移動耗 1 AP（＝推進 2 小時）＋ 世界自走一輪；聊天不會走到這裡
  let clockLabel = "", worldRumors = [], apLeft = AP_PER_DAY;
  if (isFateMove) {
    try {
      const sp = spendAp_(moveGameId, 2);
      apLeft = sp.ap;
      const tick = worldTick_(sheets, moveGameId, target, 1, false); // 移動只讓敵換位，不死人
      worldRumors = tick.rumors || [];
      clockLabel = clockLabel_(moveGameId);
    } catch (e) { }
  }
  try { markRivalsSeen_(sheets, pcId); } catch (e) { } // 🔵 抵達即偵查到此地敵人（世界 tick 後再揭一次）

  const freshMapData = sheets.map.getDataRange().getValues();
  const rootTarget = target ? String(target).split('-')[0].trim() : "";
  const parentMapInfo = freshMapData.find(m => String(m[COL.MAP.NAME]).trim() === rootTarget);
  const subMapInfo = (target !== rootTarget) ? freshMapData.find(m => String(m[COL.MAP.NAME]).trim() === target) : null;
  let mapDesc = parentMapInfo ? `【母區域：${rootTarget}】${parentMapInfo[COL.MAP.DESC]}` : "此處荒煙蔓草，並未記載於輿圖之中。";
  if (subMapInfo) mapDesc += `\n【當前分支：${target}】${subMapInfo[COL.MAP.DESC]}`;

  return JSON.stringify({
    success: true,
    statusString: buildPlayerStatusString(allPcData[pIdx], getCharacterTotalStats(pcId, sheets, allPcData), sheets.item ? sheets.item.getDataRange().getValues() : []),
    people: getLocalPeopleList(sheets, pcName, pcId, target, relData, sheets.task ? sheets.task.getDataRange().getValues() : []),
    locations: getNearbyLocations(target, freshMapData).slice(0, 5),
    mapDesc: mapDesc,
    parentRegion: rootTarget,
    clock: clockLabel,
    ap: apLeft,
    apMax: AP_PER_DAY,
    rumors: worldRumors
  });
}

function actionSync(userData, pcId, sheets) {
  try { markRivalsSeen_(sheets, pcId); } catch (e) { } // 🔵 戰爭迷霧：到場即偵查到此地敵人
  const allPcData = sheets.pc.getDataRange().getValues();
  const pcIndex = allPcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pcIndex === -1) return JSON.stringify({ success: false, message: "查無此人" });
  const curL = allPcData[pcIndex][COL.PC.LOC];
  const freshMapData = sheets.map.getDataRange().getValues();
  const currentMapInfo = freshMapData.find(m => m[COL.MAP.NAME] === (curL ? String(curL).split('-')[0] : ""));
  const syncGameId = String(allPcData[pcIndex][COL.PC.GAME_ID] || "");
  let syncClock = "", syncAp = AP_PER_DAY;
  if (syncGameId && syncGameId.indexOf("g_") === 0) { try { syncClock = clockLabel_(syncGameId); syncAp = getAp_(syncGameId); } catch (e) { } }

  return JSON.stringify({
    success: true,
    statusString: buildPlayerStatusString(allPcData[pcIndex], getCharacterTotalStats(pcId, sheets, allPcData), sheets.item ? sheets.item.getDataRange().getValues() : []),
    people: getLocalPeopleList(sheets, allPcData[pcIndex][COL.PC.NAME], pcId, curL, sheets.rel ? sheets.rel.getDataRange().getValues() : [], sheets.task ? sheets.task.getDataRange().getValues() : []),
    locations: getNearbyLocations(curL, freshMapData),
    mapDesc: currentMapInfo ? currentMapInfo[COL.MAP.DESC] : "四下靜謐。",
    clock: syncClock,
    ap: syncAp,
    apMax: AP_PER_DAY
  });
}

function actionRest(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  const restGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const isFateRest = restGameId.indexOf("g_") === 0; // FATE 單人聖杯戰爭：自由休息、推進時間
  const normalStatus = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "平躺歇息", "負面": "無", "顏面": "氣息平穩" });
  const pcName = pcData[pIdx][COL.PC.NAME];
  const pcLoc = String(pcData[pIdx][COL.PC.LOC] || "").trim();

  // 🛏️ FATE 休息：玩家自選時數（1/3/6…），每小時補 2 AP；回血回魔按時數比例（6 小時≈全滿）
  if (isFateRest) {
    const restHours = Math.max(1, Math.min(12, parseInt(userData.restHours) || 6));
    const frac = Math.min(1, restHours / 6);
    let healedNames = [pcName];
    const healRow = (idx) => {
      const hpMax = parseInt(pcData[idx][COL.PC.MAX_HP]) || 100;
      const mpMax = parseInt(pcData[idx][COL.PC.MAX_MP]) || 100;
      pcData[idx][COL.PC.HP] = Math.min(hpMax, Math.round((parseInt(pcData[idx][COL.PC.HP]) || 0) + hpMax * frac));
      pcData[idx][COL.PC.MP] = Math.min(mpMax, Math.round((parseInt(pcData[idx][COL.PC.MP]) || 0) + mpMax * frac));
      if (frac >= 1) pcData[idx][COL.PC.STATUS] = normalStatus;
    };
    const prevHp = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
    const wasInjured = prevHp < (parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 0);
    healRow(pIdx);
    if (sheets.rel) {
      sheets.rel.getDataRange().getValues().filter(r => r[COL.REL.PC] === pcName && r[COL.REL.IS_PARTY] === "同行").map(r => r[COL.REL.NPC]).forEach(npcName => {
        const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === npcName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
        if (nIdx !== -1 && parseInt(pcData[nIdx][COL.PC.HP]) > 0) { healRow(nIdx); healedNames.push(npcName); }
      });
    }
    sheets.pc.getRange(1, 1, pcData.length, pcData[0].length).setValues(pcData);

    let restClock = "", restRumors = [], apAfter = AP_PER_DAY;
    try {
      const clk = restHours_(restGameId, restHours);
      apAfter = clk ? clk.ap : AP_PER_DAY;
      const rounds = Math.floor(restHours / 3); // 1h:0、3h:1、6h:2 輪世界自走
      if (rounds > 0) { const tick = worldTick_(sheets, restGameId, pcLoc, rounds, true); restRumors = tick.rumors || []; }
      restClock = clockLabel_(restGameId);
    } catch (e) { }
    try { sheets.log.appendRow([new Date(), pcId, `【系統】御主一行休息了 ${restHours} 小時，恢復行動力。`, pcLoc]); } catch (e) { }
    return JSON.stringify({
      success: true, statusString: getFreshStatusString(pcId, pIdx, sheets), healedNames: healedNames,
      loc: pcLoc, wasInjured: wasInjured, restHours: restHours, clock: restClock, ap: apAfter, apMax: AP_PER_DAY, rumors: restRumors
    });
  }

  // ── 以下為非 FATE（九州）舊版休養：花 100 銀兩、全回滿 ──
  let currentMoney = parseInt(pcData[pIdx][COL.PC.MONEY]) || 0;
  if (currentMoney < 100) return JSON.stringify({ success: false, message: "盤纏不足 100 銀兩，無法休養！" });
  pcData[pIdx][COL.PC.MONEY] = currentMoney - 100;
  let healedNames = [pcName];
  const pMax = calculateMaxStats(pcData[pIdx][COL.PC.REALM], pcData[pIdx][COL.PC.CON], pcData[pIdx][COL.PC.INT]);
  const prevHp = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
  const wasInjured = prevHp < pMax.hp;
  pcData[pIdx][COL.PC.MAX_HP] = pMax.hp; pcData[pIdx][COL.PC.MAX_MP] = pMax.mp;
  pcData[pIdx][COL.PC.HP] = pMax.hp; pcData[pIdx][COL.PC.MP] = pMax.mp;
  pcData[pIdx][COL.PC.STATUS] = normalStatus;

  if (sheets.rel) {
    sheets.rel.getDataRange().getValues().filter(r => r[COL.REL.PC] === pcName && r[COL.REL.IS_PARTY] === "同行").map(r => r[COL.REL.NPC]).forEach(npcName => {
      const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === npcName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
      if (nIdx !== -1 && pcData[nIdx][COL.PC.STATUS] !== "屍體" && parseInt(pcData[nIdx][COL.PC.HP]) > 0) {
        const nMax = calculateMaxStats(pcData[nIdx][COL.PC.REALM], pcData[nIdx][COL.PC.CON], pcData[nIdx][COL.PC.INT]);
        pcData[nIdx][COL.PC.MAX_HP] = nMax.hp; pcData[nIdx][COL.PC.MAX_MP] = nMax.mp;
        pcData[nIdx][COL.PC.HP] = nMax.hp; pcData[nIdx][COL.PC.MP] = nMax.mp;
        pcData[nIdx][COL.PC.STATUS] = normalStatus;
        healedNames.push(npcName);
      }
    });
  }
  const bystanderNames = pcData
    .filter(r => r[COL.PC.ID] != pcId && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
      String(r[COL.PC.LOC]).trim() === pcLoc && !healedNames.includes(r[COL.PC.NAME]))
    .map(r => r[COL.PC.NAME]);
  sheets.pc.getRange(1, 1, pcData.length, pcData[0].length).setValues(pcData);
  sheets.log.appendRow([new Date(), pcId, `【系統】花費了 100 銀兩，${healedNames.join("與")} 就地休養，狀態回歸平穩。`, pcData[pIdx][COL.PC.LOC]]);
  return JSON.stringify({
    success: true, statusString: getFreshStatusString(pcId, pIdx, sheets), healedNames: healedNames,
    loc: pcLoc, wasInjured: wasInjured, bystanderNames: bystanderNames
  });
}


function actionGetRumors(userData, pcId, sheets) {
  const rumors = getRumors(sheets, 15);
  // 按熱度降冪再排（getRumors 已按時間，這裡再加熱度權重）
  rumors.sort(function (a, b) {
    return (b.weight || 1) - (a.weight || 1);
  });
  return JSON.stringify({ success: true, data: rumors });
}


function actionGiveMoney(userData, pcId, sheets) {
  const { targetName, amount } = userData;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 最多等 10 秒，拿不到鎖就丟例外
  } catch (e) {
    return JSON.stringify({ success: false, message: "天道擁擠，請稍候再試一次。" });
  }

  try {
    const pcData = sheets.pc.getDataRange().getValues();
    const meIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
    if (meIdx === -1) return JSON.stringify({ success: false, message: "查無此人命格。" });
    const myName = pcData[meIdx][COL.PC.NAME];

    // 🔴 安全鎖：付款方一定是「呼叫者本人」，玩家只能給出自己的錢
    const result = transferMoney(myName, targetName, amount, sheets, pcData);
    if (!result.success) return JSON.stringify(result);

    return JSON.stringify({
      success: true,
      message: result.message,
      statusString: getFreshStatusString(pcId, meIdx, sheets)
    });
  } finally {
    lock.releaseLock();
  }
}
// ==========================================
// 📜 全新 MMO 級飛書系統 (支援夾帶物品與刪除，完美兼容 NPC)
// ==========================================
// 🔴 飛書(信件)系統已拆分至 Mail_Action.gs：actionSendMail / actionGetMails / actionClaimMailItem / actionDeleteMail









// ==========================================
// ★ 主遊戲邏輯 (PLAY) 
// ==========================================
function actionPlay(userData, pcId, sheets) {
  const userMsg = userData.message;
  const isNsfwMode = userData.isNsfw || false;
  const finalUserMsg = `【玩家意圖】：${userMsg}`;

  const formatPref = (str) => {
    let arr = String(str || "").split('、');
    // 喜好與厭惡是常態情報，全面開放給 AI 參考
    return `[表象]${arr[0] || "無"} [內裡]${arr[1] || "無"} [喜歡]${arr[2] || "無"} [討厭]${arr[3] || "無"}`;
  };

  const formatTrait = (str) => {
    let arr = String(str || "").split('、');
    let base = `[外貌]${arr[0] || "無"} [氣質舉止]${arr[1] || "無"} [偏門技巧]${arr[2] || "無"}`;
    return isNsfwMode ? `${base} [床笫之間的反應]${arr[3] || "無"}` : base;
  };


  let pcData = sheets.pc.getDataRange().getValues();
  let itemData = sheets.item ? sheets.item.getDataRange().getValues() : [];
  let relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  let questData = sheets.quest ? sheets.quest.getDataRange().getValues() : [];
  const questExpiredFlag = sheets.quest ? checkAndExpireQuests(sheets, pcId, questData) : false;

  let factionListDesc = "尚無勢力現世。";
  if (sheets.faction) {
    const factionData = sheets.faction.getDataRange().getValues();

    // 🔴 偷偷去抓「大勢」表
    let trendData = [];
    const trendSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("大勢");
    if (trendSheet) trendData = trendSheet.getDataRange().getValues();

    if (factionData.length > 1) {
      factionListDesc = factionData.slice(1).map(r => {
        let facName = r[COL.FACTION.NAME];

        // 🔴 去大勢表比對，找出該門派目前的氣運狀態
        let tRow = trendData.find(t => t[0] === facName);
        let powerDesc = tRow ? `(氣運:${tRow[1]}|影響力:${tRow[2]})` : "(氣運:中立)";

        return `勢力:${facName} ${powerDesc} | 陣營:${r[COL.FACTION.ALIGN]} | 駐地:${r[COL.FACTION.BASE]} | 掌舵者:${r[COL.FACTION.LEADER] || "神祕人"} | 宗旨:${r[COL.FACTION.MOTTO] || "未知"}`;
      }).join("\n");
    }
  }

  const pcIndex = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pcIndex === -1) return "查無此人";
  const pc = pcData[pcIndex];
  const pcName = pc[COL.PC.NAME];
  let curL = pc[COL.PC.LOC];
  const curLRoot = String(curL).split('-')[0].trim();
  const locOwnershipNote = String(curL).includes('-') ? `\n★【地點歸屬鐵律】：玩家當前位置「${curL}」只是「${curLRoot}」境內由玩家自建的一處私人據點（店鋪/居所/領地等），玩家僅擁有這一處據點本身！「${curLRoot}」依然是廣闊的公共城鎮/地區，住滿其他百姓、商家與往來人物，絕非玩家的地盤或私產！嚴禁將整座「${curLRoot}」敘述成只屬於玩家、唯玩家獨尊，或讓無關路人因此對玩家卑躬屈膝、俯首稱臣！` : '';

  let shopInfoStr = "";
  if (sheets.shop && String(curL).includes('-')) {
    const shopRow = sheets.shop.getDataRange().getValues().find(r => String(r[COL.SHOP.LOC] || "").trim() === String(curL).trim());
    if (shopRow) {
      const isOwnShop = String(shopRow[COL.SHOP.OWNER]) === String(pcId);
      shopInfoStr = `\n★【在地店鋪資訊】：此處座標標籤為「${curL}」，但其世俗招牌（品牌名）為「${shopRow[COL.SHOP.NAME]}」。類型：${shopRow[COL.SHOP.CATEGORY]}，經營內容：${shopRow[COL.SHOP.DESC]}。${isOwnShop ? "（此店為玩家本人所有）" : "（此店並非玩家所有）"}`;
    }
  }


  let isItemChanged = false;
  let soulGiftProtectedIds = []; // 傾心信物已在記憶體轉移，須保護不被遺失過濾器誤刪
  let isRelChanged = false;
  let isQuestChanged = false;
  let knockedOutList = [];
  let justRevived = false;
  let soulBoundEventMsg = "";
  let freshlyBoundNpcName = "";
  const newNpcMap = {};
  const dirtyPcRows = new Set();
  // 玩家本人一定會被處理到，先加進去
  dirtyPcRows.add(pcIndex);



  // 🔴 只讀一次 log，後面兩處共用；改為只讀最近2000筆，避免歷史成長後每回合全表讀取拖慢
  const allLogs = readRecentLogRows(sheets.log, 2000);

  const history = pickRelevantLogs(allLogs.filter(r => String(r[2]).includes(pcName)), 12).map(r => r[2]).join("\n");
  const pTotal = getCharacterTotalStats(pcId, sheets, pcData, itemData);
  const currentAmbition = pc[COL.PC.INTENT] ? String(pc[COL.PC.INTENT]).trim() : "初入江湖，隨遇而安。";

  const partyMembers = relData.filter(r => r[COL.REL.PC] === pcName && r[COL.REL.IS_PARTY] === "同行").map(r => r[COL.REL.NPC]);
  let partyDetailsArr = [];
  partyMembers.forEach(pName => {
    const r = pcData.find(row => String(row[COL.PC.NAME]).trim() === String(pName).trim() && !String(row[COL.PC.ID]).startsWith("DEAD_"));
    if (r) {
      const nTotal = getCharacterTotalStats(r[COL.PC.ID], sheets, pcData, itemData);
      const relRecord = relData.find(row => row[COL.REL.PC] === pcName && row[COL.REL.NPC] === pName);
      partyDetailsArr.push(`【同行夥伴】名號:${pName}(境界:${r[COL.PC.REALM] || "凡人"}) | 氣血:${r[COL.PC.HP]}/${nTotal.maxHp} | 身世:${r[COL.PC.BACK] || "無"} | 狀態:${r[COL.PC.STATUS]} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])} | 關係:${relRecord ? relRecord[COL.REL.TAG] : "結伴同行"}(好感:${relRecord ? relRecord[COL.REL.FAV] : 0})`);
    }
  });
  const PROMPT_PARTY_SYSTEM = partyDetailsArr.length > 0 ? `【目前同行隊伍成員命格詳情】:\n${partyDetailsArr.join("\n")}` : "目前沒有同行夥伴，玩家是獨自行動的。";

  // 🔵 實例化：只取自己 game_id 世界內、同地點的人（御主無 game_id 時不過濾，相容舊角色）
  const myGameId = pc && pc[COL.PC.GAME_ID] ? String(pc[COL.PC.GAME_ID]) : "";
  const isKanshou = myGameId.indexOf("k_") === 0; // 鑑賞（後日談·約會）世界
  const sameGame = (r) => !myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId;
  const allLocals = pcData.filter((r, i) => i !== 0 && r[COL.PC.ID] != pcId && (r[COL.PC.LOC] === curL) && sameGame(r) && !partyMembers.includes(r[COL.PC.NAME]));
  let displayPeople = allLocals.length > 6 ? allLocals.sort((a, b) => (b[COL.PC.PREF].includes(pcName) ? 1 : 0) - (a[COL.PC.PREF].includes(pcName) ? 1 : 0)).slice(0, 6) : allLocals;


  const presentNpcNamesForLog = [...displayPeople.map(r => r[COL.PC.NAME]), ...partyMembers];
  let localHistoryStr = "";

  if (presentNpcNamesForLog.length > 0) {
    const localLogs = allLogs.filter(r => {
      const eventStr = String(r[2] || "");
      return !eventStr.includes(pcName) && presentNpcNamesForLog.some(n => eventStr.includes(n));
    });
    const localHistory = pickRelevantLogs(localLogs, 10).map(r => `[他人因果] ${r[2]}`).join("\n");
    if (localHistory) localHistoryStr = `\n★【眼前眾生近期遭遇】：(NPC 可能會告狀或展露餘韻！)\n${localHistory}`;
  }

  let thirdPartyRels = [];
  const presentNames = [...displayPeople.map(r => r[COL.PC.NAME]), ...partyMembers];
  if (presentNames.length > 1) {
    relData.forEach(row => {
      if (row[COL.REL.PC] !== pcName && presentNames.includes(row[COL.REL.PC]) && presentNames.includes(row[COL.REL.NPC])) {
        if ((parseInt(row[COL.REL.FAV]) || 0) >= 80 || String(row[COL.REL.TAG] || "").includes("已傾心") || row[COL.REL.IS_PARTY] === "同行") {
          thirdPartyRels.push(`- 『${row[COL.REL.PC]}』對『${row[COL.REL.NPC]}』：${row[COL.REL.TAG]} (好感:${row[COL.REL.FAV]})${row[COL.REL.IS_PARTY] === "同行" ? " [同行中]" : ""}`);
        }
      }
    });
  }
  const thirdPartyStr = thirdPartyRels.length > 0 ? `\n\n★【場景人物交叉羈絆 (旁觀親密流露版)】：\n${thirdPartyRels.join("\n")}\n👉若在場人物有「已傾心」等高階親密關係，【絕對禁止】推演為冷血路人！必須讓旁觀者捕捉到外冷內熱的親暱痕跡、假意嗔怒或極度護短的佔有慾！` : "";

  let PROMPT_ENV = "", PROMPT_GEAR = "", PROMPT_REL = "";

  // 🔴 統一建構 localSceneStr，SFW/NSFW 共用同一份好感抗拒邏輯
  const localSceneStr = displayPeople.length > 0 ? displayPeople.map(r => {
    const relRecord = relData.find(row => row[COL.REL.PC] === pcName && row[COL.REL.NPC] === r[COL.PC.NAME]);
    let currentFav = relRecord ? parseInt(relRecord[COL.REL.FAV]) || 0 : 0;

    let resistPrompt = "";
    if (currentFav <= -50) {
      resistPrompt = "【死仇】恨之入骨，見面即強烈敵意，玩家稍有挑釁便主動出手、下手狠辣。但須符合其境界性格，勝負由雙方實力裁決，非無條件秒殺。";
    } else if (currentFav <= -30) {
      resistPrompt = "【仇視】充滿敵意，會威脅、冷硬驅趕；唯有玩家正面挑釁、動手或羞辱時才反擊，平時不主動攻擊。";
    } else if (currentFav < 0) {
      resistPrompt = "【厭惡戒備】反感、防備、話少。不主動動手，僅在玩家嚴重冒犯或暴力相向時才警告、推開或自衛。";
    } else if (currentFav < 30) {
      resistPrompt = "【陌生】萍水相逢的路人，禮貌而疏離，正常應對，無敵意也不親近。";
    } else if (currentFav < 50) {
      resistPrompt = "【相識】已有基本好感，態度和善，願意閒聊與小忙。";
    } else if (currentFav < 80) {
      resistPrompt = "【友好】信得過的朋友，親近願助，但個性與底線仍在。";
    } else {
      resistPrompt = "【摯友／傾心】允許依賴與配合，但個性語癖與底線永久保留，禁止人格崩壞！";
    }

    let identityTag = String(r[COL.PC.ID]).startsWith("PC_") ? "【另一位玩家】" : "【NPC】";
    if (!String(r[COL.PC.ID]).startsWith("PC_")) {
      identityTag += partyMembers.includes(r[COL.PC.NAME]) ? "【同行伴侶】" : "【同地路人/嚴禁強制互動】";
    }

    const majorEventStr = (relRecord && relRecord[COL.REL.MAJOR_EVENT] && relRecord[COL.REL.MAJOR_EVENT] !== "無")
      ? ` [未完成約定:${relRecord[COL.REL.MAJOR_EVENT]}]` : "";

    return `${identityTag}名號:${r[COL.PC.NAME]} 【性別:${r[COL.PC.SEX]}】 境界:${r[COL.PC.REALM] || "凡人"} | 門派:${r[COL.PC.FACTION] || "無"} | 銀兩:${r[COL.PC.MONEY] || 0} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])} | 關係:${relRecord ? relRecord[COL.REL.TAG] : "萍水相逢"}(好感:${currentFav}${majorEventStr} -> 行為準則:${resistPrompt})`;
  }).join("\n") : "此地四下無人。";

  if (isNsfwMode) {
    PROMPT_ENV = `【天道屏蔽】：外界感知已封鎖。請專注於當下空間氛圍與私密互動。`;
    PROMPT_GEAR = `【武裝與情報】：(暫時屏蔽)`;

    // 🟢 新增：性別配對提示，直接算好給 AI，不需要它自己推理
    let genderHintStr = "";
    const presentRowsForGender = pcData.filter((r, i) => i !== 0 && r[COL.PC.ID] != pcId && r[COL.PC.LOC] === curL && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_"));
    if (presentRowsForGender.length > 0) {
      const playerSex = pc[COL.PC.SEX] || "未知";
      const pairHints = presentRowsForGender.map(r => {
        const npcSex = r[COL.PC.SEX] || "未知";
        let combo = "";
        if (playerSex === "女" && npcSex === "女") combo = "女女配對：禁止插入式陽具動作，肉棒欄位雙方皆填「無」，以手指/舌頭/器物替代器官接觸";
        else if (playerSex === "男" && npcSex === "男") combo = "男男配對：依雙方實際器官裁決動作邏輯";
        else combo = `${playerSex}(${pcName}) × ${npcSex}(${r[COL.PC.NAME]})配對：依雙方實際性別器官裁決`;
        return `${r[COL.PC.NAME]}：${combo}`;
      });
      genderHintStr = `\n★【性別配對核對】：${pairHints.join("；")}`;
    }

    let pPhysicalObj = JSON.parse(pcData[pcIndex][COL.PC.PHYSICAL] || "{}");
    if (Object.keys(pPhysicalObj).length === 0) {
      pPhysicalObj = { "蜜穴": "未開", "菊穴": "緊閉" };
    }
    let pSkills = (pcData[pcIndex][COL.PC.MEMORY] || "無").replace(/\[雙修技巧\](.*?)(?=\| \[|$)/, (m, p1) => `[雙修技巧]${p1.trim().split('、').slice(0, 5).join('、')}`);
    let nsfwMemories = `\n[玩家『${pcName}』狀態]：${pcData[pcIndex][COL.PC.STATUS]}\n[玩家『${pcName}』肉體]：${JSON.stringify(pPhysicalObj)}\n[身體記憶]：${pSkills}`;

    let allPresentRows = pcData.filter((r, i) => i !== 0 && r[COL.PC.ID] != pcId && r[COL.PC.LOC] === curL && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_"));
    allPresentRows.forEach(r => {
      let npcPhysicalObj = JSON.parse(r[COL.PC.PHYSICAL] || "{}");
      if (Object.keys(npcPhysicalObj).length === 0) npcPhysicalObj = { "蜜穴": "未開" };
      let npcSkills = (r[COL.PC.MEMORY] || "無").replace(/\[雙修技巧\](.*?)(?=\| \[|$)/, (m, p1) => `[雙修技巧]${p1.trim().split('、').slice(0, 5).join('、')}`);
      let relMem = (relData.find(row => row[COL.REL.PC] === pcName && row[COL.REL.NPC] === r[COL.PC.NAME]) || {})[COL.REL.MEMORY] || "無";
      nsfwMemories += `\n[${r[COL.PC.NAME]} 狀態]：${buildVisibleStatusString(r[COL.PC.STATUS])}\n[${r[COL.PC.NAME]} 肉體]：${JSON.stringify(npcPhysicalObj)}\n[快照]：[技巧]${npcSkills} | [羈絆]${relMem} | [軟肋]${r[COL.PC.INTENT] || "無"}`;
    });

    PROMPT_REL = `【當前同地人物】\n${localSceneStr}\n★【情境延續鐵律】：請繼續往後推演！${nsfwMemories}${thirdPartyStr}${genderHintStr}
🛑【絕對禁止 OOC 倒貼鐵律】：NPC 必須【死守】其「性格」與「好感度」！
若好感度未滿 80，或性格屬於冷酷/高傲/剛烈，【絕對禁止】主動迎合、發情或瞬間屈服！必須表現出強烈的抗拒、屈辱、咬牙切齒或冷嘲熱諷。即便肉體有生理反應，靈魂與對話也必須是硬氣且具攻擊性的！違者天道崩塌！`;

  } else {
    const activeQuests = questData.filter(r => r[COL.QUEST.PC] == pcId && r[COL.QUEST.STATUS] === "進行中").map(r => `【${r[COL.QUEST.NAME]}】${r[COL.QUEST.TARGET]}`).join("\n") || "尚無天命。";

    let rumorDesc = "";
    const recentRumors = getRumors(sheets, 5);
    if (recentRumors.length > 0) {
      rumorDesc = `【江湖近聞】\n` + recentRumors.map(r => `• ${r.content}`).join("\n") + "\n\n";
    }

    PROMPT_ENV = `【身負天命】\n${activeQuests}\n\n${rumorDesc}【天下勢力】\n${factionListDesc}`;
    const inventoryDesc = itemData.filter(it => it[COL.ITEM.OWNER] == pcId).slice(-30).map(it => it[COL.ITEM.NAME]).join("、") || "空空如也";
    PROMPT_GEAR = `【武裝】：${resolveItemName(pcData[pcIndex][COL.PC.WEP], itemData) || "赤手空拳"}\n【武學】：${pcData[pcIndex][COL.PC.MARTIAL]
      ? `【玩家自創、已掌握】${pcData[pcIndex][COL.PC.MARTIAL]}（★絕對禁止讓NPC重複教授或聲稱是自己的武學！）`
      : "尚無自創武學"}\n【行囊】：${inventoryDesc}`;
    PROMPT_REL = `【當前同地人物】\n${localSceneStr}${thirdPartyStr}`;
  }

  // 🏡 在家才餵裝潢給 AI（在外面完全不撈，零負擔）
  let homeDecorPrompt = "";
  try {
    const decorStr = getHomeDecorForLoc(sheets, curL);
    if (decorStr) {
      homeDecorPrompt = `\n★【此處是玩家親手佈置的家】：${decorStr}\n(請將此居家環境自然融入場景描寫，但這是玩家的佈置，AI只可描述、嚴禁擅自更動或新增家具陳設。)`;
    }
  } catch (e) { }

  // ==========================================
  // 🔴 新增：話題人物/遠端打聽系統
  // ==========================================
  let remoteNpcStr = "";
  const mentionedRemoteNPCs = [];

  pcData.forEach((r, i) => {
    if (i === 0 || r[COL.PC.ID] == pcId) return; // 排除標題與玩家自己
    const npcName = String(r[COL.PC.NAME]).trim();

    // 確保名字長度 >= 2 避免單字誤判，且玩家確實提及
    // 確保名字有效
    // 確保名字長度 >= 2 避免單字誤判
    if (npcName && npcName.length >= 2) {
      let isMentioned = false;

      // 1. 先比對全名 (最精準，任何人都能提)
      if (userMsg.includes(npcName)) {
        isMentioned = true;
      }
      // 2. 如果是三個字的名字，允許只提後兩個字 (例如：柳如煙 -> 如煙)
      else if (npcName.length === 3) {
        const shortName = npcName.substring(1); // 取得後兩個字

        if (userMsg.includes(shortName)) {
          // 🔴 加上限制：檢查這個 NPC 是否在關係表 (relData) 裡與玩家有過交集
          const isKnown = relData.some(row => row[COL.REL.PC] === pcName && row[COL.REL.NPC] === npcName);

          if (isKnown) {
            isMentioned = true;
          }
        }
      }

      // 只要確認被提到，就檢查是否在現場
      if (isMentioned) {
        const isParty = partyMembers.includes(npcName);
        const isLocal = allLocals.some(local => local[COL.PC.NAME] === npcName);

        // 不在同行隊伍，也不在當前場景，才是遠端話題人物
        if (!isParty && !isLocal) {
          mentionedRemoteNPCs.push(r);
        }
      }
    }
  });

  if (mentionedRemoteNPCs.length > 0) {
    const remoteDetails = mentionedRemoteNPCs.map(r => {
      const tName = r[COL.PC.NAME];
      const relRecord = relData.find(row => row[COL.REL.PC] === pcName && row[COL.REL.NPC] === tName);
      const currentFav = relRecord ? parseInt(relRecord[COL.REL.FAV]) || 0 : 0;
      const relTag = relRecord ? relRecord[COL.REL.TAG] : "萍水相逢";

      return `- 【${tName}】(境界:${r[COL.PC.REALM] || "凡人"}) | 目前位置:${r[COL.PC.LOC] || "未知"} | 身世:${r[COL.PC.BACK] || "無"} | 性格:${formatPref(r[COL.PC.PREF])} | 玩家與其羈絆:${relTag}(好感:${currentFav})`;
    });

    remoteNpcStr = `\n★【話題人物情報 (遠端/未現身)】：\n玩家在對話中提到了以下不在場的角色。請天道根據這些真實情報，讓在場的 NPC 給出符合其自身性格與江湖閱歷的合理反應（例如：八卦傳聞、敬畏評價、仇恨、或是單純表示不認識）。\n${remoteDetails.join("\n")}\n🛑【天道鐵律】：以上話題人物【絕對不在場】，嚴禁描寫他們當場現身、開口說話或與玩家產生直接互動！違者天道崩塌！`;
  }




  const npcDialoguePrompt = displayPeople.length > 0 ? `\n★【對話點名】：若有對話意圖，請包含「${displayPeople.map(r => r[COL.PC.NAME]).join("、")}」的對話。` : "";


  // 🔴【替換開始】淨化後的 prompt 組裝
  const prompt = `【天道法旨】：當前推演視角鎖定為玩家『${pcName}』(ID: ${pcId})。
${PROMPT_PARTY_SYSTEM}
【玩家命格】：名號:${pcName} 【性別:${pc[COL.PC.SEX]}】 境界:${pc[COL.PC.REALM]} | 性格:${pc[COL.PC.PREF]} | 特徵:${pc[COL.PC.TRAIT]} | 軟肋:【 ${currentAmbition} 】 | 身世:${pc[COL.PC.BACK] || "江湖散人"} | 位置:${curL} | 狀態:${pc[COL.PC.STATUS] || "氣息平穩"} | 生命:${pc[COL.PC.HP]}/${pc[COL.PC.MAX_HP]} | 真氣:${pc[COL.PC.MP]}/${pc[COL.PC.MAX_MP]} | 臂力:${pTotal.STR} | 根骨:${pTotal.CON} | 身法:${pTotal.AGI} | 神識:${pTotal.INT} | 福緣:${pTotal.LUK}| 銀兩:${pc[COL.PC.MONEY]}

${PROMPT_ENV}
${PROMPT_GEAR}
${homeDecorPrompt}
${shopInfoStr}

【前塵因果】：(此為歷史輪廓，僅供背景參考，請勿當作新事件重複描寫！其中提到的人物，若不在下方【當前同地人物】名單內，純屬「回憶」，本回合絕對禁止讓其現身、開口或互動！)
${history}
${localHistoryStr}

${PROMPT_REL}
${remoteNpcStr}
★【在場驗證鐵律——最高優先級，下筆前必看】：本回合可登場、說話、互動的角色，僅限【目前同行隊伍成員】、緊鄰上方【當前同地人物】清單列出之人，${isNsfwMode ? "本回合為慾海模式(私密場景已天道屏蔽)，【絕對禁止】由AI自行安排任何全新陌生人登場打斷或闖入；唯獨玩家本回合輸入內容【明確主動】表達邀請、招呼、引入第三人等意圖時(如呼喚他人加入、開門讓人進來等)，才可讓該玩家指定或暗示的新角色登場，AI不得自作主張額外加碼安排其他陌生人" : "以及AI當下【全新初次原創】、從未出現於前塵因果/歷史紀錄/話題情報中的陌生角色(如路人、店家、新面孔，可正常開口說話、給予姓名)"}！前塵因果、歷史紀錄、話題情報中提到的「已知但不在此清單內」之姓名，才視為不在場的回憶，嚴禁無視「同地」設定憑空召喚、穿越或讓其開口說話、出手！若【當前同地人物】顯示「此地四下無人」，本回合除玩家、同行夥伴${isNsfwMode ? "、以及玩家本回合主動引入之人" : "、與全新原創的陌生人"}外，不可讓任何${isNsfwMode ? "" : "「歷史已知」"}具名角色登場！
${locOwnershipNote}

★【系統底層防呆】：
1. 【戰鬥雙向裁決】：發生衝突時，綜合比對【雙方境界、五圍、所在環境、戰術、當下狀態】公平裁決，禁止僅憑境界高低就單方面秒殺玩家：
   - 傷害一律以【相對扣血】呈現（依雙方差距合理增減），允許玩家受傷、纏鬥、撤退、求饒，也允許玩家憑地形/奇謀/拼死反撲/道具/偷襲逆境反擊或全身而退。
   - 境界高者佔優但非無敵；玩家落敗時保留掙扎、逃跑與後續報復空間，禁止無條件抹殺。
   - 僅當玩家明顯不敵、傷重且無路可退時，生命才可能歸零並由系統送藥鋪救治。NPC的下手輕重須符合其性格與陣營。

${isKanshou ? `
💕【鑑賞·後日談模式·最高優先級覆寫】：聖杯戰爭【早已落幕】，這是奪得聖杯後與從者『${displayPeople.length ? displayPeople.map(r => r[COL.PC.NAME]).join("、") : "你的從者"}』共度的【和平日常／約會時光】。
★【絕對禁止】任何戰鬥、廝殺、敵人、敵御主、敵從者、聖杯爭奪、靈基受損、血量／生命變化、寶具對轟、死亡或威脅。世界是安全的。
★氛圍＝溫柔、悠閒、戀愛向的日常：散步、閒聊、吃東西、看風景、逛冬木街景。讓從者貼近其官方性格自然地與御主相處互動。
★【演出而非說明】不得直述其願望／萌點／個性字面。嚴禁輸出任何 stat_changes 生命變化、items_lost、戰鬥裁決。可有 rel_changes(好感)。
★敘事結束停在溫柔的留白，把下一步交還御主。
` : ""}現在演化玩家動作：『${finalUserMsg}』${npcDialoguePrompt}

🚨【天道終極警告】：
1. 敘事必須在給出結果後，停在「我」的心境，將下一步交還玩家選擇！
2.【名字提取鐵律】：在輸出 stat_changes 或 rel_changes 等任何 JSON 數據時，'target' 或 'npc' 欄位【絕對只能】填寫角色的「真實姓名」（例如：「沈清霜」）或「自己」。❌嚴禁填入台詞、對話、地名、動作描述或任何標點符號！若名字抓取錯誤將導致天道崩塌！`;

  try {
    let aiConfig = isNsfwMode ? { temperature: 1.0, top_p: 0.95, retries: 2, model: "google/gemini-3.1-flash-lite", isNsfwMode: true } : {};
    aiConfig.backLocked = userData.backLocked || false;

    // 🔴【新增】抓取近 6 筆原始歷史(3輪)，轉換為 API 格式
    const recentHistoryRaw = getGameHistoryBatchRaw(pcId, 6);
    if (recentHistoryRaw && recentHistoryRaw.length > 0) {
      aiConfig.chatHistory = recentHistoryRaw.map(msg => ({
        role: msg.speaker === "player" ? "user" : "assistant",
        content: String(msg.content)
      }));
    }

    const aiResponseRaw = callGeminiAPI(prompt, null, aiConfig);
    const start = aiResponseRaw.indexOf('{');
    const end = aiResponseRaw.lastIndexOf('}');
    const cleanJson = aiResponseRaw.substring(start, end + 1);
    const aiData = sanitizeAiData_(JSON.parse(cleanJson));




    let memoryMapData = getMapDataCached(sheets);
    if (aiData.new_maps && Array.isArray(aiData.new_maps) && sheets.map) {
      let mapsToAppend = [];
      aiData.new_maps.forEach(m => {
        let fullName = String(m.name || "").trim();
        if (fullName && !memoryMapData.some(r => String(r[COL.MAP.NAME] || "").trim() === fullName)) {
          let parentName = fullName.includes('-') ? fullName.split('-')[0].trim() : "";
          let parentNode = memoryMapData.find(r => String(r[COL.MAP.NAME] || "").trim() === parentName);
          let mapType = parentNode ? parentNode[COL.MAP.TYPE] : (m.type || "險地");
          let coordStrObj = parentNode && parentNode[COL.MAP.COORD] ? String(parentNode[COL.MAP.COORD]) : "0,0";
          let coordStr, attempts = 0;
          let baseX = parseInt(coordStrObj.split(',')[0]) || 0;
          let baseY = parseInt(coordStrObj.split(',')[1]) || 0;
          do {
            // 🔴 修正：隨嘗試次數擴大搜尋半徑，避免子節點擠在父座標周圍 9 格而耗盡、導致座標重複堆疊
            let spread = parentNode ? (1 + Math.floor(attempts / 8)) : 60;
            let offsetX = Math.floor(Math.random() * (spread * 2 + 1)) - spread;
            let offsetY = Math.floor(Math.random() * (spread * 2 + 1)) - spread;
            coordStr = `${baseX + offsetX},${baseY + offsetY}`;
            attempts++; // 🔴 修正：原本漏了遞增，導致 attempts<200 防呆煞車永遠失效、可能無限迴圈逾時
          } while (memoryMapData.some(r => String(r[COL.MAP.COORD] || "").trim() === coordStr) && attempts < 200);

          const newMapRow = ["九州", fullName, mapType, coordStr, m.desc || "未知地界。", parentName];
          mapsToAppend.push(newMapRow); memoryMapData.push(newMapRow);
        }
      });
      if (mapsToAppend.length > 0) {
        sheets.map.getRange(sheets.map.getLastRow() + 1, 1, mapsToAppend.length, 6).setValues(mapsToAppend);
        CacheService.getScriptCache().remove("KYUSHU_MAP_DATA");
      }
    }

    if (aiData.new_factions && Array.isArray(aiData.new_factions) && sheets.faction) {
      let currentFactions = sheets.faction.getDataRange().getValues();
      aiData.new_factions.forEach(f => {
        registerFactionHelper(f.name, "掌門", f.align, f.base, f.leader, sheets, pcId, f.leader || "未知人物", currentFactions);
      });
    }

    if (aiData.events && Array.isArray(aiData.events) && sheets.epic) aiData.events.forEach(ev => { sheets.epic.appendRow([pcId, String(ev).trim(), new Date()]); });

    // 🔴 驗證閘門：只在玩家本回合明確點名該任務並執行任務時，才放行AI把任務狀態改成「進行中」以外的值
    const isExplicitQuestAction = (qName) =>
      String(userMsg || "").includes(`「${qName}」`) && String(userMsg || "").includes("執行任務");

    if (aiData.quests && Array.isArray(aiData.quests) && sheets.quest) {
      aiData.quests.forEach(q => {
        const qName = String(q.name || "").trim();
        // 🔴 防呆：AI 沒給任務名（多半是只想更新目標時漏填）就略過，避免生出一筆無名任務
        if (!qName) return;
        const qIdx = questData.findIndex(r => r[COL.QUEST.PC] == pcId && r[COL.QUEST.NAME] === qName && r[COL.QUEST.STATUS] === "進行中");
        if (qIdx !== -1) {
          if (q.target) questData[qIdx][COL.QUEST.TARGET] = q.target;
          if (q.status && q.status !== "進行中" && isExplicitQuestAction(questData[qIdx][COL.QUEST.NAME])) {
            // 🔴 不採信AI自訂的結案字串：一律正規化為「已結案」，確保領賞檢查的字串比對永遠可靠
            questData[qIdx][COL.QUEST.STATUS] = "已結案";
          }
          const isRewardLocked = questData[qIdx][COL.QUEST.REWARD_LOCKED] === "Y";
          if (!isRewardLocked) {
            if (q.reward_money !== undefined) {
              questData[qIdx][COL.QUEST.MONEY] = Math.max(0, Math.min(MAX_QUEST_REWARD_MONEY, parseInt(q.reward_money) || 0));
            }
            if (q.reward_item !== undefined) {
              questData[qIdx][COL.QUEST.ITEM] = String(q.reward_item).trim() || "無";
            }
            if (q.reward_money !== undefined || q.reward_item !== undefined) questData[qIdx][COL.QUEST.REWARD_LOCKED] = "Y";
          }
        } else {
          // 🔴 防重複堆疊生成：若已存在同名任務（不論已結案/逾期失敗），代表 AI 只是在敘事中重述舊任務，
          // 直接略過，不再 append 一筆全新的重複任務，避免天命面板出現多筆同名任務堆疊。
          const existsSameName = questData.some(r => r[COL.QUEST.PC] == pcId && r[COL.QUEST.NAME] === qName);
          if (existsSameName) return;
          const rewardMoney = q.reward_money !== undefined ? Math.max(0, Math.min(MAX_QUEST_REWARD_MONEY, parseInt(q.reward_money) || 0)) : Math.floor(Math.random() * 400) + 100;
          const rewardItem = q.reward_item !== undefined ? (String(q.reward_item).trim() || "無") : "無";
          const rewardLocked = (q.reward_money !== undefined || q.reward_item !== undefined) ? "Y" : "";
          const deadlineVal = (q.deadline_days && parseInt(q.deadline_days) > 0) ? (Date.now() + parseInt(q.deadline_days) * 86400000) : "";
          questData.push([pcId, qName, (q.target ? String(q.target).trim() : "調查中"), q.status || "進行中", rewardMoney, rewardItem, rewardLocked, deadlineVal]);
          sheets.quest.appendRow(questData[questData.length - 1]);
        }
      });
    }


    // 🔴 血量快照：記錄所有人變化前的血量，供結尾比對真實扣血
    const hpSnapshot = {};
    pcData.forEach((row, idx) => {
      if (idx === 0) return;
      if (String(row[COL.PC.ID] || "").startsWith("DEAD_")) return;
      hpSnapshot[idx] = parseInt(row[COL.PC.HP]) || 0;
    });
    const mpBefore = parseInt(pcData[pcIndex][COL.PC.MP]) || 0;
    const moneyBefore = parseInt(pcData[pcIndex][COL.PC.MONEY]) || 0;


    if (aiData.stat_changes && Array.isArray(aiData.stat_changes)) {
      Logger.log("stat_changes: " + JSON.stringify(aiData.stat_changes));


      const attrMap = { "生命": COL.PC.HP, "真氣": COL.PC.MP, "位置": COL.PC.LOC, "臂力": COL.PC.STR, "根骨": COL.PC.CON, "身法": COL.PC.AGI, "神識": COL.PC.INT, "福緣": COL.PC.LUK, "門派": COL.PC.FACTION, "幫派": COL.PC.FACTION, "宗門": COL.PC.FACTION, "階級": COL.PC.RANK, "職位": COL.PC.RANK, "稱號": COL.PC.RANK, "陣營": COL.PC.ALIGN, "立場": COL.PC.ALIGN, "貢獻度": COL.PC.CONTRIB, "貢獻": COL.PC.CONTRIB, "身世": COL.PC.BACK };
      const visibleStateKeys = ["衣服", "姿勢", "負面", "顏面"];

      aiData.stat_changes.forEach(sc => {
        const tName = String(sc.target).trim(); const attrKey = String(sc.attr).trim(); const valStr = String(sc.value).trim();
        let targetIdx = (tName === "自己" || tName === String(pcName).trim()) ? pcIndex : pcData.findIndex(r => String(r[COL.PC.NAME]).trim() === tName || String(r[COL.PC.ID]).trim() === tName);

        if (targetIdx !== -1) {
          dirtyPcRows.add(targetIdx);

          // 🔴 支援 AI 合併輸出，例如 attr:"姿勢/衣服/負面/顏面"
          if (attrKey.includes('/') && valStr.includes('/')) {
            const attrParts = attrKey.split('/').map(a => a.trim());
            const valParts = valStr.split('/').map(v => v.trim());
            attrParts.forEach((a, i) => {
              if (visibleStateKeys.includes(a)) {
                let currentVs = parseVisibleStatus(pcData[targetIdx][COL.PC.STATUS]);
                currentVs[a] = valParts[i] || "無";
                pcData[targetIdx][COL.PC.STATUS] = JSON.stringify(currentVs);
              }
            });
            return;
          }
          if (visibleStateKeys.includes(attrKey)) {
            let currentVs = parseVisibleStatus(pcData[targetIdx][COL.PC.STATUS]);
            currentVs[attrKey] = valStr; pcData[targetIdx][COL.PC.STATUS] = JSON.stringify(currentVs); return;
          }

          const colIdx = attrMap[attrKey];
          if (colIdx !== undefined) {
            if (colIdx === COL.PC.PREF || colIdx === COL.PC.TRAIT) return;
            if (colIdx === COL.PC.LOC) {
              let newLoc = valStr.replace(/九州-/g, "").replace(/\[|\]/g, "").trim();
              // 🔴 防呆：「行蹤不明」只是AI在劇情沒交代去向時的占位語意，不是真地名，禁止落地存檔或被坤圖自動建檔成假地點，否則NPC會從此完全失聯
              if (newLoc === "行蹤不明" || newLoc === "") {
                const oldRootLoc = String(pcData[targetIdx][COL.PC.LOC] || "").split('-')[0].trim() || "青丘城";
                Logger.log(`【位置防呆】AI 將「${tName}」位置設為「${valStr}」，已退回母地圖「${oldRootLoc}」`);
                pcData[targetIdx][COL.PC.LOC] = oldRootLoc; if (targetIdx === pcIndex) curL = oldRootLoc;
                return;
              }
              let rootLoc = newLoc.split('-')[0].trim();
              const rootKnown = !sheets.map || (typeof memoryMapData !== 'undefined' && memoryMapData.some(r => String(r[COL.MAP.NAME] || "").trim() === rootLoc));
              const isFateWorld = myGameId && (myGameId.indexOf('g_') === 0 || myGameId.indexOf('k_') === 0);
              if (!rootKnown && isFateWorld) {
                // 🔵 FATE：地圖固定在冬木，【絕不】自動長新地點——AI 亂報的新母地圖一律退回原地
                const oldRoot = String(pcData[targetIdx][COL.PC.LOC] || "").split('-')[0].trim() || rootLoc;
                Logger.log(`【FATE 地圖鎖定】AI 想把「${tName}」移到未知母地圖「${rootLoc}」，已退回「${oldRoot}」`);
                pcData[targetIdx][COL.PC.LOC] = oldRoot; if (targetIdx === pcIndex) curL = oldRoot;
                return;
              }
              pcData[targetIdx][COL.PC.LOC] = newLoc; if (targetIdx === pcIndex) curL = newLoc;
              if (!rootKnown && sheets.map && rootLoc) {
                // 九州舊行為：未知母地圖自動建檔（FATE 不會走到這）
                const fallbackMapRow = ["九州", rootLoc, "荒野", `${Math.floor(Math.random() * 120) - 60},${Math.floor(Math.random() * 120) - 60}`, "未探明區域。"];
                sheets.map.appendRow(fallbackMapRow); memoryMapData.push(fallbackMapRow);
              }
            } else if ([COL.PC.HP, COL.PC.MP, COL.PC.MONEY, COL.PC.STR, COL.PC.CON, COL.PC.AGI, COL.PC.INT, COL.PC.LUK, COL.PC.CONTRIB].includes(colIdx)) {
              let numCurrent = parseInt(pcData[targetIdx][colIdx]) || 0;
              let numNew = (valStr.startsWith("+") || valStr.startsWith("-")) ? numCurrent + parseInt(valStr) : parseInt(valStr);
              if (isNaN(numNew)) numNew = numCurrent; // 🔴 防呆：NaN就維持原值

              if (colIdx === COL.PC.MONEY || colIdx === COL.PC.CONTRIB) pcData[targetIdx][colIdx] = Math.max(0, numNew);
              else if (colIdx === COL.PC.HP || colIdx === COL.PC.MP) {
                let hpVal = Math.min(parseInt(pcData[targetIdx][colIdx === COL.PC.HP ? COL.PC.MAX_HP : COL.PC.MAX_MP]) || 100, numNew);
                hpVal = Math.max(0, hpVal); // 🔴 防 AI 輸出負數導致顯示亂碼
                pcData[targetIdx][colIdx] = hpVal;

                const isPlayer = String(pcData[targetIdx][COL.PC.ID]).startsWith("PC_");

                // 玩家：血歸 0 才送藥鋪
                if (colIdx === COL.PC.HP && hpVal <= 0 && isPlayer) {
                  const healLoc = "小醫仙藥鋪"; pcData[targetIdx][COL.PC.HP] = 50; pcData[targetIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "換上乾淨素衣", "姿勢": "平躺靜養", "負面": "重傷初癒", "顏面": "蒼白" }); pcData[targetIdx][COL.PC.LOC] = healLoc; pcData[targetIdx][COL.PC.MONEY] = Math.max(0, (parseInt(pcData[targetIdx][COL.PC.MONEY]) || 0) - 20);
                  if (targetIdx === pcIndex) curL = healLoc;
                  relData.forEach(row => {
                    if (row[COL.REL.PC] === pcData[targetIdx][COL.PC.NAME] && row[COL.REL.IS_PARTY] === "同行") {
                      const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === row[COL.REL.NPC] && !String(r[COL.PC.ID]).startsWith("DEAD_"));
                      if (nIdx !== -1) {
                        pcData[nIdx][COL.PC.LOC] = healLoc;
                        pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "平穩" });
                        pcData[nIdx][COL.PC.HP] = calculateMaxStats(pcData[nIdx][COL.PC.REALM], pcData[nIdx][COL.PC.CON], pcData[nIdx][COL.PC.INT]).hp;
                        dirtyPcRows.add(nIdx);
                      }
                    }
                  });
                  if (sheets.epic) sheets.epic.appendRow([pcId, `【奇蹟救治】${pcData[targetIdx][COL.PC.NAME]} 於生死邊緣被救回。`, new Date()]);
                  if (targetIdx === pcIndex) justRevived = true;
                }
                // NPC：血掉到 5 以下→鎖 1 血昏迷待處置，生死由玩家定奪
                else if (colIdx === COL.PC.HP && hpVal <= 5 && !isPlayer) {
                  knockedOutList.push(pcData[targetIdx][COL.PC.NAME]);
                  pcData[targetIdx][COL.PC.HP] = 1;
                  pcData[targetIdx][COL.PC.STATUS] = JSON.stringify({
                    "衣服": "衣衫破爛", "姿勢": "倒地不起",
                    "負面": "重傷昏迷", "顏面": "面色慘白"
                  });
                }
              } else pcData[targetIdx][colIdx] = Math.max(1, Math.min(REALM_LIMITS[pcData[targetIdx][COL.PC.REALM] || "凡人"] || 25, numNew));
            } else if (colIdx === COL.PC.BACK) {
              // 🔴 身世為終身史記：禁止整段覆寫，新內容以「、」追加並只留最近6段；玩家鎖定時後端強制擋下，不依賴AI自律
              if (!(targetIdx === pcIndex && userData.backLocked)) {
                const oldBack = String(pcData[targetIdx][colIdx] || "").trim();
                let backArr = (!oldBack || oldBack === "無") ? [] : oldBack.split('、').map(x => x.trim()).filter(x => x !== "");
                if (valStr && valStr !== "無" && !backArr.includes(valStr)) backArr.push(valStr);
                pcData[targetIdx][colIdx] = (backArr.length > 6 ? backArr.slice(-6) : backArr).join('、') || "無";
              }
            } else pcData[targetIdx][colIdx] = valStr;
          }
        }
      });
    }








    let bagCounts = {}; itemData.forEach(it => { if (String(it[COL.ITEM.LOC2]).trim() === "倉庫") return; bagCounts[it[COL.ITEM.OWNER]] = (bagCounts[it[COL.ITEM.OWNER]] || 0) + 1; });
    let overLimitWarnings = [];
    let grantedNamesThisTurn = {}; // 🔴 同回合內也要防重複：key = ownerId|name
    if (aiData.items_gained && Array.isArray(aiData.items_gained)) {
      let allowedGains = [];
      aiData.items_gained.forEach(it => {
        // 🔴 最源頭防呆：無名物品直接跳過，不佔背包計數
        if (!it.name || String(it.name).trim() === "") return;

        let oName = String(it.owner || "自己").trim();
        let targetPcMatch = pcData.find(r => String(r[COL.PC.NAME]).trim() === oName);
        let finalId = (oName === "自己" || oName === String(pcName).trim()) ? pcId : (targetPcMatch ? targetPcMatch[COL.PC.ID] : (newNpcMap[oName] || oName));
        const trimmedName = String(it.name).trim();

        // 🔴 重複賜予硬鎖：非丹藥/貨幣類，若該角色已持有或本回合已給過同名物品，直接捨棄這筆，防止AI記憶錯亂重複塞道具
        if (it.type !== "丹藥" && it.type !== "貨幣") {
          const dedupeKey = finalId + "|" + trimmedName;
          const alreadyOwned = itemData.some(row => row[COL.ITEM.OWNER] == finalId && String(row[COL.ITEM.NAME]).trim() === trimmedName);
          if (alreadyOwned || grantedNamesThisTurn[dedupeKey]) return;
          grantedNamesThisTurn[dedupeKey] = true;
        }

        if ((bagCounts[finalId] || 0) < MAX_BAG_SIZE) { allowedGains.push(it); bagCounts[finalId] = (bagCounts[finalId] || 0) + 1; }
        else if (finalId === pcId) overLimitWarnings.push(`無法獲取「${it.name}」`);
      });
      aiData.items_gained = allowedGains;
    }

    if (overLimitWarnings.length > 0 && aiData.narration) aiData.narration += `\n\n<span style="color:#ff4d4d; font-weight:bold;">【系統警告】：行囊已滿（${MAX_BAG_SIZE}/${MAX_BAG_SIZE}），${overLimitWarnings.join("、")}，請先清理包包！</span>`;

    if (aiData.items_gained && Array.isArray(aiData.items_gained) && sheets.item) {
      let currencyCountThisTurn = 0; // 🟢 本回合貨幣物品計數器

      aiData.items_gained.forEach((it) => {
        // 🔴 最源頭防呆：無名物品直接跳過，避免白跑類別判定
        if (!it.name || String(it.name).trim() === "") return;

        // 1. 重新定義 targetPcMatch (修復原本會報錯的問題)
        let oName = String(it.owner || "自己").trim();
        let targetPcMatch = pcData.find(r => String(r[COL.PC.NAME]).trim() === oName);
        let finalId = (oName === "自己" || oName === String(pcName).trim()) ? pcId : (targetPcMatch ? targetPcMatch[COL.PC.ID] : (newNpcMap[oName] || oName));

        // 2. 🟢 修正：生成唯一的 ID (這裡保證每一個物品都有獨立的身分證)
        const newItemId = "ITM_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

        // 3. 屬性計算邏輯
        let sSTR = 0, sCON = 0, sAGI = 0, sINT = 0, sLUK = 0;
        let p = getRarityPoints(it.rarity, it.type === "丹藥");

        if (["武器", "防具", "法寶", "丹藥"].includes(it.type)) {
          if (it.type === "武器") sSTR = p; else if (it.type === "防具") sCON = p; else {
            if (it.stat_type === "臂力") sSTR = p; else if (it.stat_type === "根骨") sCON = p; else if (it.stat_type === "身法") sAGI = p; else if (it.stat_type === "神識") sINT = p; else sLUK = p;
          }
        }


        // 4. 強制修正 AI 亂給的物品類別（統一走 detectItemType）
        const hasBonus = (sSTR > 0 || sCON > 0 || sAGI > 0 || sINT > 0 || sLUK > 0);
        let correctedType = detectItemType(it.name, it.type, hasBonus);

        // 🟢 5. 貨幣物品特殊處理：單回合上限 + 強制查表覆寫價格
        let finalPrice = it.price || 10;
        if (correctedType === "貨幣") {
          currencyCountThisTurn++;
          if (currencyCountThisTurn > 2) return; // 超過上限，直接捨棄不寫入
          finalPrice = getCurrencyValue(it.name); // 完全不採信 AI 給的 price
          if (finalPrice === 0) return; // 保險：萬一查不到表，視為無效物品捨棄
        }

        // 6. 🟢 推入陣列：使用正確的 newItemId
        itemData.push([it.name, correctedType, it.desc, finalPrice, finalId, sSTR, sCON, sAGI, sINT, sLUK, newItemId]);
      });
    }

    // 1. 處理「物品轉移」(贈禮 / 偷竊 / 裝備給NPC) —— 全面 ID 化，支援來源 owner
    let protectedItemIds = soulGiftProtectedIds.slice(); // 併入傾心信物保護
    if (aiData.items_transferred && Array.isArray(aiData.items_transferred) && sheets.item) {
      aiData.items_transferred.forEach(transfer => {
        // 解析新擁有者 ID
        let newOwnerName = String(transfer.new_owner || "").trim();
        let targetPcMatch = pcData.find(r => String(r[COL.PC.NAME]).trim() === newOwnerName);
        let finalId = (newOwnerName === "自己" || newOwnerName === String(pcName).trim()) ? pcId : (targetPcMatch ? targetPcMatch[COL.PC.ID] : (newNpcMap[newOwnerName] || newOwnerName));

        // 解析來源擁有者：偷竊時來源是 NPC；未指定則預設玩家自己（贈禮情境）
        let fromName = String(transfer.old_owner || transfer.from || "").trim();
        let fromMatch = fromName ? pcData.find(r => String(r[COL.PC.NAME]).trim() === fromName) : null;
        let fromId = fromName ? (fromMatch ? fromMatch[COL.PC.ID] : (newNpcMap[fromName] || fromName)) : pcId;

        // 🟢 優先用 ID 精準比對，找不到才退回 name；只在來源者身上找
        const wantId = String(transfer.id || "").trim();
        for (let i = 1; i < itemData.length; i++) {
          const ownerOk = (itemData[i][COL.ITEM.OWNER] == fromId);
          const idOk = wantId && String(itemData[i][COL.ITEM.ID]).trim() === wantId;
          const nameOk = !wantId && itemData[i][COL.ITEM.NAME] === transfer.name;
          if (ownerOk && (idOk || nameOk)) {
            itemData[i][COL.ITEM.OWNER] = finalId;
            protectedItemIds.push(itemData[i][COL.ITEM.ID]);
            // 若該物正被來源者裝備中，順手清空其裝備欄
            const fIdx = pcData.findIndex(r => r[COL.PC.ID] == fromId);
            if (fIdx !== -1) {
              [COL.PC.WEP, COL.PC.ARM, COL.PC.ACC1, COL.PC.ACC2].forEach(c => {
                if (String(pcData[fIdx][c]).trim() === String(itemData[i][COL.ITEM.ID]).trim()) { pcData[fIdx][c] = ""; dirtyPcRows.add(fIdx); }
              });
            }
            break;
          }
        }
      });
      if (aiData.items_transferred.length > 0) isItemChanged = true;
    }
    // 💰 銀兩轉移：NPC↔玩家、玩家↔NPC 都從「付款方自己身上」扣，錢守恆、不夠就給上限
    let moneyTransferMsgs = [];
    if (aiData.money_transferred && Array.isArray(aiData.money_transferred)) {
      aiData.money_transferred.forEach(mt => {
        let fromName = String(mt.from || "").trim();
        let toName = String(mt.to || "").trim();
        let amount = parseInt(mt.amount) || 0;
        if (amount <= 0 || !fromName || !toName || fromName === toName) return;

        // 把「自己」轉成玩家名
        if (fromName === "自己") fromName = pcName;
        if (toName === "自己") toName = pcName;

        const fromIdx = pcData.findIndex(r => String(r[COL.PC.NAME]).trim() === fromName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
        const toIdx = pcData.findIndex(r => String(r[COL.PC.NAME]).trim() === toName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
        if (fromIdx === -1 || toIdx === -1) return; // 找不到人就作廢

        // 🔴 核心：付款方有多少才給多少，給不出超過自己有的
        const fromMoney = parseInt(pcData[fromIdx][COL.PC.MONEY]) || 0;
        const realAmount = Math.min(amount, fromMoney);
        if (realAmount <= 0) return; // 付款方沒錢，整筆作廢

        pcData[fromIdx][COL.PC.MONEY] = fromMoney - realAmount;
        pcData[toIdx][COL.PC.MONEY] = (parseInt(pcData[toIdx][COL.PC.MONEY]) || 0) + realAmount;
        dirtyPcRows.add(fromIdx);
        dirtyPcRows.add(toIdx);

        // 只有跟玩家有關的轉移才提示玩家
        if (fromIdx === pcIndex) moneyTransferMsgs.push(`給了「${toName}」${realAmount} 兩`);
        else if (toIdx === pcIndex) moneyTransferMsgs.push(`「${fromName}」給了你 ${realAmount} 兩`);
      });
    }

    // 2. 🔴 使用 filter 統一處理「使用」與「遺失」—— items_lost / items_used 皆支援 ID 或 name
    let lostIds = (aiData.items_lost || []).map(x => String((x && x.id) || "").trim()).filter(Boolean);
    let lostNames = (aiData.items_lost || []).map(x => String((x && x.name) || x || "").trim()).filter(Boolean);
    // 🟢 新增：AI 判定「已使用而消耗」的物品（非丹藥類物品走 play 時用），同樣支援 ID 或 name
    let usedIds = (aiData.items_used || []).map(x => String((x && x.id) || "").trim()).filter(Boolean);
    let usedNames = (aiData.items_used || []).map(x => String((x && x.name) || x || "").trim()).filter(Boolean);
    let actionItemId = (userData.combatData && userData.combatData.actionItemId) ? userData.combatData.actionItemId : null;
    let protectedIdsSet = new Set(protectedItemIds);

    // 🔴 實體阻擋：只有真的從行囊裡刪掉東西才算數，玩家畫面上的「失去/使用」提示只能來自這兩個陣列，
    // 嚴禁直接信任 aiData.items_lost / items_used 的文字宣稱（AI可能憑空捏造玩家根本沒有的道具）。
    const verifiedLostNames = [];
    const verifiedUsedNames = [];

    // 一次性過濾 itemData
    itemData = itemData.filter(it => {
      // 如果是剛才轉移過的物品，保留
      if (protectedIdsSet.has(it[COL.ITEM.ID])) return true;

      // 如果是本次行動主動使用的物品，過濾掉 (只過濾第一個符合的)
      if (actionItemId && it[COL.ITEM.OWNER] == pcId && it[COL.ITEM.ID] === actionItemId) {
        actionItemId = null; // 標記已處理，防止後續重複過濾
        return false;
      }

      // 如果是 AI 判定的遺失物：優先用 ID，再退回 name（只刪玩家自己的）
      const idHit = lostIds.indexOf(String(it[COL.ITEM.ID]).trim());
      if (idHit !== -1 && it[COL.ITEM.OWNER] == pcId) { lostIds.splice(idHit, 1); verifiedLostNames.push(it[COL.ITEM.NAME]); return false; }

      const nameHit = lostNames.indexOf(String(it[COL.ITEM.NAME]).trim());
      if (nameHit !== -1 && it[COL.ITEM.OWNER] == pcId) { lostNames.splice(nameHit, 1); verifiedLostNames.push(it[COL.ITEM.NAME]); return false; }

      // 🟢 如果是 AI 判定「已使用消耗」的物品：優先 ID，再退回 name（只刪玩家自己的）
      const usedIdHit = usedIds.indexOf(String(it[COL.ITEM.ID]).trim());
      if (usedIdHit !== -1 && it[COL.ITEM.OWNER] == pcId) { usedIds.splice(usedIdHit, 1); verifiedUsedNames.push(it[COL.ITEM.NAME]); return false; }

      const usedNameHit = usedNames.indexOf(String(it[COL.ITEM.NAME]).trim());
      if (usedNameHit !== -1 && it[COL.ITEM.OWNER] == pcId) { usedNames.splice(usedNameHit, 1); verifiedUsedNames.push(it[COL.ITEM.NAME]); return false; }

      return true; // 其他物品全數保留
    });

    let newlyRecruited = aiData.recruited && Array.isArray(aiData.recruited) ? aiData.recruited.map(n => String(n).trim()) : [];
    let dismissedNpc = userMsg.includes("解除了組隊同行關係") ? (userMsg.match(/與「(.*?)」解除/) || [])[1]?.trim() || "" : "";

    if (sheets.rel) {
      const relChangesToProcess = aiData.rel_changes || [];
      newlyRecruited.forEach(npc => { if (!relChangesToProcess.find(r => r.npc === npc)) relChangesToProcess.push({ npc: npc }); });
      if (dismissedNpc && !relChangesToProcess.find(r => r.npc === dismissedNpc)) relChangesToProcess.push({ npc: dismissedNpc });

      relChangesToProcess.forEach(rc => {
        const tNpc = rc.target ? String(rc.target).trim() : String(rc.npc).trim();
        if (tNpc === pcName || tNpc === "自己") return;
        if (tNpc === freshlyBoundNpcName) return;

        const rIdx = relData.findIndex(r => r[COL.REL.PC] === pcName && r[COL.REL.NPC] === tNpc);
        let change = parseInt(rc.fav_change) || 0;
        let isPartyStr = rIdx !== -1 ? relData[rIdx][COL.REL.IS_PARTY] || "" : "";
        if (newlyRecruited.includes(tNpc)) isPartyStr = "同行"; if (dismissedNpc === tNpc) isPartyStr = "";

        if (rIdx !== -1) {
          let oldFav = parseInt(relData[rIdx][COL.REL.FAV]) || 0; let oldTag = relData[rIdx][COL.REL.TAG] || "萍水相逢";
          const isSoulLocked = oldTag.includes("(已傾心)");
          if (isSoulLocked) change = Math.max(0, change);
          let newFav = Math.max(-100, Math.min(100, oldFav + change));

          let finalTag;
          if (isSoulLocked) {
            // 🔴 已傾心永久鎖死：TAG完全不受AI影響，只有玩家透過 update_rel_tag 手動能改
            finalTag = oldTag;
          } else {
            let aiProvidedTag = (rc.tag && typeof rc.tag === 'string') ? rc.tag.trim() : "";
            let isValidAiTag = aiProvidedTag !== "" && aiProvidedTag !== "無" && !aiProvidedTag.includes("禁止");
            if (rc.forceTag) finalTag = rc.tag;
            else if (isValidAiTag) finalTag = aiProvidedTag;
            else finalTag = oldTag;
          }

          relData[rIdx][COL.REL.FAV] = newFav; relData[rIdx][COL.REL.TAG] = finalTag; relData[rIdx][COL.REL.IS_PARTY] = isPartyStr;

          if (rc.major_event && rc.major_event.trim() !== "無") {
            let oldEventsStr = String(relData[rIdx][COL.REL.MAJOR_EVENT] || "").trim();
            let newEvent = String(rc.major_event).trim();
            let eventArray = (oldEventsStr === "無" || oldEventsStr === "") ? [] : oldEventsStr.split('、').map(e => e.trim());

            if (newEvent === "[清空]") relData[rIdx][COL.REL.MAJOR_EVENT] = "無";
            else if (newEvent.includes("[達成]")) {
              let doneTask = newEvent.replace("[達成]", "").trim();
              if (doneTask) {
                if (sheets.epic) sheets.epic.appendRow([pcId, `【因果圓滿】『${pcName}』兌現了昔日諾言，與『${tNpc}』達成了約定：${eventArray.find(e => e.includes(doneTask)) || doneTask}。`, new Date()]);
                eventArray = eventArray.filter(e => !e.includes(doneTask));
                relData[rIdx][COL.REL.MAJOR_EVENT] = eventArray.length > 0 ? eventArray.join("、") : "無";
              }
            } else if (!eventArray.includes(newEvent)) {
              eventArray.push(newEvent); if (eventArray.length > 3) eventArray.shift();
              relData[rIdx][COL.REL.MAJOR_EVENT] = eventArray.join("、");
            }
          }
        } else {
          relData.push([pcName, tNpc, Math.max(-100, Math.min(100, change)), rc.forceTag ? rc.tag : "萍水相逢", isPartyStr, "", rc.major_event || "無"]);
        }
      });
    }



    if (aiData.intimacy_feedback) {
      // 🔴 防禦機制：過濾掉 AI 偷懶不想更新狀態時的敷衍用語
      const ignoreWords = ["維持現狀", "無變化", "不變", "維持", "同上", "保持現狀", "沒有變化"];

      const sanitizePhysicalState = (rawState, isPlayer = false) => {
        if (!rawState || typeof rawState !== 'object') return {};
        let cleanState = {};
        // 🔴 AI現在以數字代碼輸出(1~5)，此處解碼回內部真實詞；保留舊文字key作防呆相容
        // 🔴 雙手已由右手/左手兩格合併為單一「雙手」；舊代碼5與舊文字key右手/左手一律映射回雙手相容
        const keyMapping = { "陰道": "蜜穴", "陰莖": "肉棒", "屁眼": "菊穴", "1": "蜜穴", "2": "肉棒", "3": "菊穴", "4": "雙手", "5": "雙手", "右手": "雙手", "左手": "雙手" };
        const allowedKeys = ["蜜穴", "肉棒", "菊穴", "雙手"];
        Object.keys(rawState).forEach(k => {
          let standardKey = keyMapping[k] || k;
          let val = String(rawState[k]).trim();
          if (allowedKeys.includes(standardKey) && !ignoreWords.includes(val)) {
            cleanState[standardKey] = val;
          }
        });
        return cleanState;
      };

      const mergeVisibleState = (oldStatusStr, newVsObj) => {
        let currentVs = parseVisibleStatus(oldStatusStr);
        if (newVsObj && typeof newVsObj === 'object') {
          for (let k in newVsObj) {
            let val = String(newVsObj[k]).trim();
            // 只有當 AI 給出具體狀態，且不是敷衍用語時才更新
            if (val && val !== "無" && !ignoreWords.includes(val)) {
              currentVs[k] = val;
            }
          }
        }
        return JSON.stringify(currentVs);
      };

      const processSkills = (oldMem, newSkillsStr) => {
        let skillMap = {}; let oldSkills = (oldMem.match(/\[雙修技巧\](.*?)(?=\| \[|$)/) || [])[1]?.trim() || "";
        if (oldSkills && oldSkills !== "無") oldSkills.replace(/^\.\.\./, "").split('、').forEach(p => { let m = p.match(/(.+?)\(Lv\.(\d+)\)/); if (m) skillMap[m[1].trim()] = parseInt(m[2], 10); else if (p.trim()) skillMap[p.trim()] = 1; });
        if (String(newSkillsStr || "").trim() && String(newSkillsStr || "").trim() !== "無") String(newSkillsStr || "").trim().split('、').forEach(s => { let cn = s.replace(/[\(\[]?Lv\.?\d+[\)\]]?/gi, '').trim(); if (cn) skillMap[cn] = Math.min((skillMap[cn] || 0) + 1, 10); });
        let sorted = Object.keys(skillMap).map(k => ({ n: k, lv: skillMap[k] })).sort((a, b) => b.lv - a.lv);
        return sorted.length > 0 ? sorted.slice(0, 30).map(sk => `${sk.n}(Lv.${sk.lv})`).join('、') : "無";
      };

      const processTags = (oldMem, regex, newTagStr, maxCount) => {
        // 1. 取出舊標籤，拆成單項陣列(去頭部殘留的...、濾空白)
        let oldStr = (oldMem.match(regex) || [])[1]?.trim() || "無";
        let arr = (oldStr === "無" || oldStr === "")
          ? []
          : oldStr.replace(/^\.\.\./, "").split('、').map(x => x.trim()).filter(x => x !== "");

        // 2. 把新進來的字串也拆成單項(AI 可能一次吐多個，如「唇瓣、頸部」)
        let newItems = String(newTagStr || "").trim();
        if (newItems && newItems !== "無") {
          newItems.split('、').map(x => x.trim()).filter(x => x !== "").forEach(item => {
            // 3. 逐項去重：只有陣列裡還沒有這一項，才加進去
            if (!arr.includes(item)) arr.push(item);
          });
        }

        // 4. 超過上限保留最新的 maxCount 項
        if (arr.length === 0) return "無";
        return (arr.length > maxCount ? arr.slice(-maxCount) : arr).join('、');
      };

      if (isNsfwMode && aiData.intimacy_feedback.player) {
        const pfb = aiData.intimacy_feedback.player;
        if (pfb.visible_state) pcData[pcIndex][COL.PC.STATUS] = mergeVisibleState(pcData[pcIndex][COL.PC.STATUS], pfb.visible_state);
        if (pfb.physical_state) pcData[pcIndex][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[pcIndex][COL.PC.PHYSICAL], sanitizePhysicalState(pfb.physical_state));

        let oldPMem = pcData[pcIndex][COL.PC.MEMORY] || "";
        pcData[pcIndex][COL.PC.MEMORY] = `[雙修技巧]${processSkills(oldPMem, pfb.dynamic_skills)} | [性愛時敏感部位]${processTags(oldPMem, /\[性愛時敏感部位\](.*?)(?=\| \[|$)/, pfb.erogenous_zones, 5)}`;
      }

      if (aiData.intimacy_feedback.npcs) {
        aiData.intimacy_feedback.npcs.forEach(nfb => {
          const tName = String(nfb.name).trim();
          const targetIdx = pcData.findIndex(r => r[COL.PC.NAME] === tName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
          const rIdx = relData.findIndex(r => r[COL.REL.PC] === pcName && r[COL.REL.NPC] === tName);

          if (targetIdx !== -1 && isNsfwMode) {
            dirtyPcRows.add(targetIdx); // 🔴 新增
            if (nfb.visible_state) {
              pcData[targetIdx][COL.PC.STATUS] = mergeVisibleState(pcData[targetIdx][COL.PC.STATUS], nfb.visible_state);
            }
            if (nfb.physical_state) {
              pcData[targetIdx][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[targetIdx][COL.PC.PHYSICAL], sanitizePhysicalState(nfb.physical_state));
            }
            if (nfb.dynamic_skills || nfb.erogenous_zones) {
              let oldNMem = pcData[targetIdx][COL.PC.MEMORY] || "";
              pcData[targetIdx][COL.PC.MEMORY] = `[雙修技巧]${processSkills(oldNMem, nfb.dynamic_skills)} | [性愛時敏感部位]${processTags(oldNMem, /\[性愛時敏感部位\](.*?)(?=\| \[|$)/, nfb.erogenous_zones, 5)}`;
            }
          }

          if (rIdx !== -1) {
            let oldRMem = relData[rIdx][COL.REL.MEMORY] || "";
            let count = (oldRMem.match(/\[親密次數\](\d+)/) || [])[1] ? parseInt((oldRMem.match(/\[親密次數\](\d+)/) || [])[1]) : 0;
            if (isNsfwMode) count += 1;
            let talkStr = (oldRMem.match(/\[交談輪數\](\d+)/) || [])[1] ? ` | [交談輪數]${(oldRMem.match(/\[交談輪數\](\d+)/) || [])[1]}` : "";
            relData[rIdx][COL.REL.MEMORY] = `[專屬稱呼]${processTags(oldRMem, /\[專屬稱呼\](.*?)(?=\| \[|$)/, nfb.mutual_nicknames, 3)} | [親密次數]${count}${talkStr}`;
          }
        });
      }
    }

    partyMembers.forEach(pName => {
      const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === pName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
      if (nIdx !== -1) {
        pcData[nIdx][COL.PC.LOC] = pcData[pcIndex][COL.PC.LOC];
        dirtyPcRows.add(nIdx); // 🔴 加進去才會寫入
      }
    });



    const pcColCount = Object.keys(COL.PC).length;

    // MAX_HP/MAX_MP 重算只針對有變動的行，不全表掃描
    dirtyPcRows.forEach(idx => {
      const row = pcData[idx];
      if (!row) return;
      const id = String(row[COL.PC.ID] || "");
      if (!id.startsWith("PC_") && !id.startsWith("NPC_") && !id.startsWith("DEAD_")) return;

      while (row.length < pcColCount) row.push("");

      const maxVals = calculateMaxStats(row[COL.PC.REALM], row[COL.PC.CON], row[COL.PC.INT]);
      row[COL.PC.MAX_HP] = maxVals.hp;
      row[COL.PC.MAX_MP] = maxVals.mp;
      row[COL.PC.HP] = Math.min(parseInt(row[COL.PC.HP]) || 0, maxVals.hp);
      row[COL.PC.MP] = Math.min(parseInt(row[COL.PC.MP]) || 0, maxVals.mp);

      // 只寫這一行，不寫全表
      sheets.pc.getRange(idx + 1, 1, 1, pcColCount).setValues([row]);
    });

    isRelChanged = isRelChanged || !!(aiData.rel_changes && aiData.rel_changes.length > 0) || !!(aiData.recruited && aiData.recruited.length > 0) || !!dismissedNpc;
    isItemChanged = isItemChanged || !!(aiData.items_gained && aiData.items_gained.length > 0) || verifiedLostNames.length > 0 || verifiedUsedNames.length > 0 || !!(aiData.items_transferred && aiData.items_transferred.length > 0);
    isQuestChanged = isQuestChanged || questExpiredFlag || !!(aiData.quests && aiData.quests.length > 0);

    const logSum = aiData.log_summary || {};
    // 相容新結構(subject/object/event)與舊結構(people/event)
    let logSubject = String(logSum.subject || "").trim();
    let logObject = String(logSum.object || "").trim();
    let logTag = IMPORTANT_LOG_TAGS.has(String(logSum.tag || "").trim()) ? String(logSum.tag).trim() : "閒聊";
    // 🔴 慾海模式：因果文字不交由AI自由生成(避免肉體細節寫入表單)，改由GAS依tag固定挑選隱晦樣板
    let logEvent = isNsfwMode ? pickNsfwCausalityEvent(logTag) : String(logSum.event || "因果輪轉").trim();
    // 組出「人」欄字串：有主被動就標方向，沒有就退回舊寫法
    let logPeopleStr;
    if (logSubject) {
      let dirPart = (logObject && logObject !== "無" && logObject !== logSubject)
        ? `${logSubject}→${logObject}`   // 主→受 方向錨
        : logSubject;
      logPeopleStr = dirPart;
    } else {
      logPeopleStr = String(logSum.people || pcName).trim();  // 完全相容舊格式
    }
    const validInteractNames = new Set([
      ...displayPeople.map(r => r[COL.PC.NAME]),
      ...partyMembers
    ]);
    pcData.map(r => r[COL.PC.NAME]).filter(name =>
      name &&
      name !== pcName &&
      String(logSum.people).includes(name) &&
      validInteractNames.has(name)
    ).forEach(tName => {
      let rIdx = relData.findIndex(r => r[COL.REL.PC] === pcName && r[COL.REL.NPC] === tName);
      if (rIdx !== -1) {
        let oldMem = String(relData[rIdx][COL.REL.MEMORY] || "");
        let countMatch = oldMem.match(/\[交談輪數\](\d+)/);
        relData[rIdx][COL.REL.MEMORY] = countMatch ? oldMem.replace(/\[交談輪數\]\d+/, `[交談輪數]${parseInt(countMatch[1]) + 1}`) : (oldMem ? oldMem + ` | [交談輪數]1` : `[交談輪數]1`);
        isRelChanged = true;
      } else {
        relData.push([pcName, tName, 0, "萍水相逢", "", "[交談輪數]1", "無"]); isRelChanged = true;
      }
    });

    if (isRelChanged && relData.length > 0) {
      safeWriteSheet(sheets.rel, relData);
    }
    if (isItemChanged && itemData.length > 0) {
      safeWriteSheet(sheets.item, itemData);
    }
    const questColCount = Object.keys(COL.QUEST).length;
    questData.forEach(row => { while (row.length < questColCount) row.push(""); });
    if (isQuestChanged && questData.length > 0) {
      safeWriteSheet(sheets.quest, questData);
    }

    curL = pcData[pcIndex][COL.PC.LOC];
    sheets.log.appendRow([new Date(), pcId, formatCausalityEntry(curL, logTag, logPeopleStr, logEvent), curL, logTag]);
    trimLogRowsByOwner(sheets.log, pcId, 60, 20);

    const localPeopleList = getLocalPeopleList(sheets, pcName, pcId, curL, relData, sheets.task ? sheets.task.getDataRange().getValues() : [], pcData);

    let finalResponseText = aiData.narration || "天地混沌，一片寂靜。";
    finalResponseText = finalResponseText.replace(/\n/g, "<br>");






    // 🟢 統一標籤工具：元素是物件取 .name，是字串就用自己（兩種格式通吃）
    const _itemLabel = arr => (arr || [])
      .map(i => (i && typeof i === 'object') ? i.name : i)
      .filter(n => n && String(n).trim() !== "")
      .map(n => `【${String(n).trim()}】`)
      .join('、');

    if (aiData.items_gained && aiData.items_gained.length > 0) {
      const names = _itemLabel(aiData.items_gained);
      if (names) finalResponseText += `<br><br><span style="color:#d4af37; font-size:13px;">✨ 獲得：${names}</span>`;
    }
    // 2. 遺失邏輯：只渲染上面過濾itemData時「真的有刪到」的物品，AI宣稱玩家沒有的東西絕不顯示
    if (verifiedLostNames.length > 0) {
      const names = _itemLabel(verifiedLostNames);
      if (names) finalResponseText += `<br><br><span style="color:#d9534f; font-size:13px;">💔 失去：${names}</span>`;
    }
    // 3. 使用邏輯：同上，僅渲染真實從行囊扣除的物品
    if (verifiedUsedNames.length > 0) {
      const names = _itemLabel(verifiedUsedNames);
      if (names) finalResponseText += `<br><br><span style="color:#5bc0de; font-size:13px;">🧪 使用：${names}</span>`;
    }
    // 🔴 在處理完 items_gained 之後，緊接著加上這段好感度渲染
    if (aiData.rel_changes && Array.isArray(aiData.rel_changes)) {
      aiData.rel_changes.forEach(rc => {
        const change = parseInt(rc.fav_change) || 0;
        if (change === 0) return; // 沒變動就跳過

        const icon = change > 0 ? "❤️" : "💔";
        const color = change > 0 ? "#e91e63" : "#555";
        const sign = change > 0 ? "+" : "";

        finalResponseText += `<br><br><span style="color:${color}; font-size:13px; font-weight:bold;">${icon} 「${rc.target}」好感度 ${sign}${change}</span>`;
      });
    }
    // 🟢 新增：徹底傾心事件的專屬渲染（比一般獲得物品更隆重的視覺標記）
    if (soulBoundEventMsg) {
      finalResponseText += `<br><br><span style="color:#ff69b4; font-size:15px; font-weight:bold; text-shadow: 0 0 8px rgba(255,105,180,0.6);">${soulBoundEventMsg}</span>`;
    }

    // 🔴 全員血量變化（讀系統真實結算值，AI亂寫value也不影響）
    const hpChangeMsgs = [];
    dirtyPcRows.forEach(idx => {
      const row = pcData[idx];
      if (!row) return;
      const before = hpSnapshot[idx];
      if (before === undefined) return; // 新生成的角色沒快照
      const after = parseInt(row[COL.PC.HP]) || 0;
      if (after === before) return;
      const nm = row[COL.PC.NAME];
      const maxHp = parseInt(row[COL.PC.MAX_HP]) || 100;
      const diff = after - before;
      const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
      const color = diff < 0 ? "#d9534f" : "#2e8b57";
      const isMe = (idx === pcIndex);
      hpChangeMsgs.push(`<span style="color:${color};">${isMe ? "🧍" : "⚔️"} ${nm} ${diffStr} (${after}/${maxHp})</span>`);
    });
    if (hpChangeMsgs.length > 0) {
      finalResponseText += `<br><br><span style="font-size:13px; line-height:1.8;">${hpChangeMsgs.join("<br>")}</span>`;
    }

    // 🔴 玩家真氣與銀兩（生命已由上面清單統一顯示，這裡不重複）
    const mpAfter = parseInt(pcData[pcIndex][COL.PC.MP]) || 0;
    const moneyAfter = parseInt(pcData[pcIndex][COL.PC.MONEY]) || 0;
    const extraMsgs = [];
    const mpDiff = mpAfter - mpBefore;
    const moneyDiff = moneyAfter - moneyBefore;
    if (mpDiff !== 0) extraMsgs.push(`<span style="color:#4169e1;">${mpDiff < 0 ? "💨" : "🌀"} 真氣 ${mpDiff > 0 ? "+" : ""}${mpDiff}</span>`);
    if (moneyDiff !== 0) extraMsgs.push(`<span style="color:#b8860b;">${moneyDiff < 0 ? "💸" : "💰"} 銀兩 ${moneyDiff > 0 ? "+" : ""}${moneyDiff}</span>`);
    if (extraMsgs.length > 0) {
      finalResponseText += `<br><span style="font-size:13px;">${extraMsgs.join('　')}</span>`;
    }








    // 下面這行不用動，保持原樣：
    // 改這行
    saveGameHistoryBatch(pcId, [
      { speaker: "player", content: userMsg },
      { speaker: "ai", content: aiData.narration || "" }  // 用原始 narration 不用 finalResponseText
    ]);


    return JSON.stringify({
      text: finalResponseText,
      statusString: buildPlayerStatusString(pcData[pcIndex], getCharacterTotalStats(pcId, sheets, pcData, itemData), itemData),
      people: localPeopleList,
      locations: getNearbyLocations(curL, memoryMapData),
      recruited: newlyRecruited,
      options: aiData.options,
      knockedOut: knockedOutList,
      mentionedNames: aiData.mentioned_names || [],
      // 🟢 物品連結(純前端)：回傳玩家隨身行囊清單，由前端掃描敘事文字、命中即做成綠色連結(不依賴AI標記)
      myItemNames: itemData.filter(r => r[COL.ITEM.OWNER] == pcId && String(r[COL.ITEM.LOC2]).trim() !== "倉庫")
        .map(r => ({ id: String(r[COL.ITEM.ID] || r[COL.ITEM.NAME]).trim(), name: String(r[COL.ITEM.NAME]).trim(), type: String(r[COL.ITEM.TYPE] || "雜物"), desc: String(r[COL.ITEM.DESC] || "") }))
        .filter(it => it.name.length >= 2),
      justRevived: justRevived,
      allMapNames: memoryMapData.slice(1).map(m => String(m[COL.MAP.NAME]).trim()).filter(n => n.length >= 2),
      // 🔴 新增：將全九州活著的眾生名單傳給前端，用於三段式判定
      allKnownNames: pcData.filter((r, i) => i !== 0 && !String(r[COL.PC.ID]).startsWith("DEAD_")).map(r => String(r[COL.PC.NAME]).trim())
    });

  } catch (e) { return JSON.stringify({ text: "天道崩潰：" + e.message, people: [] }); }
}



function actionGetFactionInfo(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pcRow = pcData.find(r => r[COL.PC.ID] == pcId);
  if (!pcRow) return JSON.stringify({ success: false });

  const myFaction = pcRow[COL.PC.FACTION] || "無";
  const myRank = pcRow[COL.PC.RANK] || "散人";
  const myContrib = pcRow[COL.PC.CONTRIB] || 0;

  // 取得我的門派詳情
  let myFactionData = null;
  if (myFaction !== "無" && sheets.faction) {
    const fData = sheets.faction.getDataRange().getValues();
    const fRow = fData.find(r => r[COL.FACTION.NAME] === myFaction);
    if (fRow) {
      // 從大勢表取氣運
      let power = 50, status = "中立";
      const trendSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("大勢");
      if (trendSheet) {
        const tData = trendSheet.getDataRange().getValues();
        const tRow = tData.find(r => r[0] === myFaction);
        if (tRow) { power = tRow[2]; status = tRow[1]; }
      }
      myFactionData = {
        name: fRow[COL.FACTION.NAME],
        align: fRow[COL.FACTION.ALIGN],
        base: fRow[COL.FACTION.BASE],
        leader: fRow[COL.FACTION.LEADER],
        motto: fRow[COL.FACTION.MOTTO],
        power: power,
        status: status
      };
    }
  }

  // 取得天下所有勢力排行
  let allFactions = [];
  if (sheets.faction) {
    const fData = sheets.faction.getDataRange().getValues();
    const trendSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("大勢");
    let trendData = [];
    if (trendSheet) trendData = trendSheet.getDataRange().getValues();

    allFactions = fData.slice(1).map(r => {
      const tRow = trendData.find(t => t[0] === r[COL.FACTION.NAME]);
      return {
        name: r[COL.FACTION.NAME],
        align: r[COL.FACTION.ALIGN],
        base: r[COL.FACTION.BASE],
        leader: r[COL.FACTION.LEADER] || "神祕人",
        power: tRow ? tRow[2] : 50,
        status: tRow ? tRow[1] : "中立"
      };
    }).sort((a, b) => b.power - a.power);
  }

  return JSON.stringify({
    success: true,
    myFaction: myFaction,
    myRank: myRank,
    myContrib: myContrib,
    myFactionData: myFactionData,
    allFactions: allFactions
  });
}

function actionGetEpicHistory(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pcRow = pcData.find(r => r[COL.PC.ID] == pcId);
  if (!pcRow) return JSON.stringify({ success: false });
  const pcName = pcRow[COL.PC.NAME];

  // 史紀大事
  let epicEvents = [];
  if (sheets.epic) {
    const eData = sheets.epic.getDataRange().getValues();
    epicEvents = eData.filter(r => r[0] == pcId)
      .map(r => ({ content: r[1], time: r[2] }))
      .reverse().slice(0, 50);
  }

  // 關係重大紀錄（已傾心 + 重大約定）
  let relRecords = [];
  if (sheets.rel) {
    const rData = sheets.rel.getDataRange().getValues();
    relRecords = rData.filter(r => r[COL.REL.PC] === pcName && (
      String(r[COL.REL.TAG] || "").includes("已傾心") ||
      (r[COL.REL.MAJOR_EVENT] && r[COL.REL.MAJOR_EVENT] !== "無" && r[COL.REL.MAJOR_EVENT] !== "")
    )).map(r => ({
      npc: r[COL.REL.NPC],
      tag: r[COL.REL.TAG],
      fav: r[COL.REL.FAV],
      majorEvent: r[COL.REL.MAJOR_EVENT] || "無",
      isSoulBound: String(r[COL.REL.TAG]).includes("已傾心"),
      memory: r[COL.REL.MEMORY] || ""
    }));
  }

  // 江湖足跡統計
  let stats = {
    kills: 0,
    questsDone: 0,
    locationsVisited: new Set(),
    intimacyTotal: 0,
    topIntimacy: null,
    topIntimacyCount: 0
  };

  if (sheets.epic) {
    const eData = sheets.epic.getDataRange().getValues();
    eData.filter(r => r[0] == pcId).forEach(r => {
      const content = String(r[1] || "");
      if (content.includes("因果終結")) stats.kills++;
      if (content.includes("天命圓滿")) stats.questsDone++;
    });
  }

  if (sheets.log) {
    const lData = sheets.log.getDataRange().getValues();
    lData.filter(r => String(r[1]) == pcId || String(r[2]).includes(pcName)).forEach(r => {
      if (r[3]) stats.locationsVisited.add(String(r[3]).split('-')[0]);
    });
  }

  if (sheets.rel) {
    const rData = sheets.rel.getDataRange().getValues();
    rData.filter(r => r[COL.REL.PC] === pcName).forEach(r => {
      const mem = String(r[COL.REL.MEMORY] || "");
      const countMatch = mem.match(/\[親密次數\](\d+)/);
      if (countMatch) {
        const count = parseInt(countMatch[1]);
        stats.intimacyTotal += count;
        if (count > stats.topIntimacyCount) {
          stats.topIntimacyCount = count;
          stats.topIntimacy = r[COL.REL.NPC];
        }
      }
    });
  }

  return JSON.stringify({
    success: true,
    epicEvents: epicEvents,
    relRecords: relRecords,
    stats: {
      kills: stats.kills,
      questsDone: stats.questsDone,
      locationsCount: stats.locationsVisited.size,
      intimacyTotal: stats.intimacyTotal,
      topIntimacy: stats.topIntimacy,
      topIntimacyCount: stats.topIntimacyCount,
      realm: pcRow[COL.PC.REALM] || "凡人"
    }
  });
}
function actionGetRanking(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();

  const ranking = [];

  pcData.slice(1).forEach(row => {
    const id = String(row[COL.PC.ID]);
    if (id.startsWith("DEAD_")) return;

    const realm = row[COL.PC.REALM] || "凡人";
    const realmMod = REALM_MODIFIERS[realm] || 1.0;

    const str = Math.floor((parseInt(row[COL.PC.STR]) || 0) * realmMod);
    const con = Math.floor((parseInt(row[COL.PC.CON]) || 0) * realmMod);
    const agi = Math.floor((parseInt(row[COL.PC.AGI]) || 0) * realmMod);
    const int = Math.floor((parseInt(row[COL.PC.INT]) || 0) * realmMod);
    const luk = Math.floor((parseInt(row[COL.PC.LUK]) || 0) * realmMod);
    const power = str + con + agi + int + luk;

    ranking.push({
      name: row[COL.PC.NAME],
      realm: realm,
      power: power,
      faction: row[COL.PC.FACTION] || "無",
      rank: row[COL.PC.RANK] || "散人",
      isPlayer: id.startsWith("PC_")
    });
  });

  ranking.sort((a, b) => b.power - a.power);

  return JSON.stringify({ success: true, data: ranking.slice(0, 50) });
}

// 🟢 新增：天道強行抹除/斬斷 NPC 的重大事件約定
function actionClearNpcMajorEvent(userData, pcId, sheets) {
  if (!sheets.rel) return JSON.stringify({ success: false, message: "天道異常：REL關係表不存在。" });

  // 1. 透過 pcId 撈出玩家本人的名號
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人命格。" });
  const myName = pcData[pIdx][COL.PC.NAME];

  const targetName = userData.targetName; // 前端傳過來的 NPC 名字

  // 2. 進入關係表尋找這兩人的因果列
  let relData = sheets.rel.getDataRange().getValues();
  const rIdx = relData.findIndex(r => r[COL.REL.PC] === myName && r[COL.REL.NPC] === targetName);

  if (rIdx === -1) {
    return JSON.stringify({ success: false, message: "在冥冥眾生冊中，未尋得你與此人的命運約定。" });
  }

  // 3. 完美對齊：利用妳的 COL 欄位常數，強行將該列的重大事件覆寫為 "無"
  sheets.rel.getRange(rIdx + 1, COL.REL.MAJOR_EVENT + 1).setValue("無");

  return JSON.stringify({ success: true, message: "天命已改，因果落筆重塑！" });
}


// ==========================================
// 🎖️ 宗門晉升邏輯
// ==========================================
function actionPromoteRank(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  const faction = pcData[pIdx][COL.PC.FACTION] || "無";
  let rank = String(pcData[pIdx][COL.PC.RANK] || "散人").trim();
  const contrib = parseInt(pcData[pIdx][COL.PC.CONTRIB]) || 0;

  if (faction === "無" || faction === "無門派") {
    return JSON.stringify({ success: false, message: "你尚無宗門，何來晉升？" });
  }

  // 1. 最高統治者防呆
  if (rank.match(/宗主|掌門|教主|門主|谷主|閣主|魁首|老祖/)) {
    return JSON.stringify({ success: false, message: `大能說笑了，你已是【${faction}】的${rank}，萬人之上，無可晉升！若要更高，除非飛升仙界。` });
  }

  // 2. 定義宗門階級與對應的「累計貢獻度」門檻
  const rankPath = [
    { name: "記名弟子", req: 0 },
    { name: "外門弟子", req: 300 },
    { name: "內門弟子", req: 1000 },
    { name: "真傳弟子", req: 3000 },
    { name: "執事", req: 6000 },
    { name: "堂主", req: 12000 },
    { name: "護法", req: 25000 },
    { name: "長老", req: 50000 },
    { name: "副宗主", req: 100000 }
  ];

  // 尋找目前階級在哪裡
  let currentRankIdx = rankPath.findIndex(r => r.name === rank);

  // 如果玩家現在的階級是被 AI 亂編的 (不在表內)，預設把他當作外門弟子來升級
  if (currentRankIdx === -1) {
    currentRankIdx = 0;
  }

  // 檢查是否已經封頂
  if (currentRankIdx >= rankPath.length - 1) {
    return JSON.stringify({ success: false, message: "你已達到副手之極，再往上就只能篡位當宗主了！" });
  }

  const nextRank = rankPath[currentRankIdx + 1];

  // 3. 貢獻度門檻審查
  if (contrib < nextRank.req) {
    return JSON.stringify({
      success: false,
      message: `晉升【${nextRank.name}】需要累積達 ${nextRank.req} 點貢獻，你目前只有 ${contrib} 點。請多為宗門效力！`
    });
  }

  // 4. 晉升成功！(我們設計為看「累計貢獻」，所以不扣貢獻度，這樣地位才不會掉)
  pcData[pIdx][COL.PC.RANK] = nextRank.name;

  // 寫入資料庫
  sheets.pc.getRange(pIdx + 1, COL.PC.RANK + 1).setValue(nextRank.name);

  if (sheets.epic) {
    sheets.epic.appendRow([pcId, `【宗門晉升】在「${faction}」中屢建奇功，憑藉 ${contrib} 點貢獻晉升為【${nextRank.name}】。`, new Date()]);
  }

  return JSON.stringify({
    success: true,
    message: `鐘聲作響，天地昭告！憑藉著累積達 ${contrib} 點的卓著貢獻，你成功晉升為【${faction}】的【${nextRank.name}】！`,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}



function actionSpareNpc(userData, pcId, sheets) {
  const { npcName } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === npcName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  // 放過＝從昏迷恢復成「清醒虛弱」，血拉回 20%，能正常活動而非永久躺 1 血
  const maxHp = parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 100;
  pcData[nIdx][COL.PC.HP] = Math.max(1, Math.floor(maxHp * 0.2));
  pcData[nIdx][COL.PC.STATUS] = JSON.stringify({
    "衣服": "衣衫破損", "姿勢": "勉強起身", "負面": "傷勢未癒", "顏面": "虛弱"
  });
  sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);
  return JSON.stringify({ success: true });
}
// ==========================================
// ⚔️ 系統裁決攻擊 (雙方D20 + 放大後五圍 + 自訂招式，傷害看差距，不致死只到昏迷)
// ==========================================
// ==========================================
// ⚔️ Fate 戰鬥：御主號令從者出擊（D20＋六圍＋fx＋寶具），game_id 隔離
// ==========================================
function actionFateBattle(userData, pcId, sheets) {
  const npcName = String(userData.npcName || "").trim();
  const useNp = !!userData.np;
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");

  let atkIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (atkIdx === -1) return JSON.stringify({ success: false, message: "你尚未召喚從者，無從者可出戰。" });

  const nIdx = pcData.findIndex(r => String(r[COL.PC.NAME]).includes(npcName) && r[COL.PC.ID] != pcData[atkIdx][COL.PC.ID] && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "此世界查無此目標。" });
  if (String(pcData[pIdx][COL.PC.LOC]).trim() !== String(pcData[nIdx][COL.PC.LOC]).trim()) {
    return JSON.stringify({ success: false, message: "對方不在你身邊，鞭長莫及。" });
  }

  // ⏳ 戰鬥耗 1 AP（＝推進 2 小時）；行動點不足則無法出戰
  const isFateBattle = myGameId.indexOf("g_") === 0;
  if (isFateBattle && getAp_(myGameId) < 1) {
    return JSON.stringify({ success: false, message: "行動點已耗盡，從者也需喘息——請『歇息』恢復後再戰。" });
  }

  const atkC = rowToCombatant_(pcData[atkIdx]);
  const defC = rowToCombatant_(pcData[nIdx]);

  if (useNp && atkC.mp < Math.round(atkC.mpMax * 0.3)) {
    return JSON.stringify({ success: false, message: `${atkC.name} 魔力不足以解放寶具，需先補魔。` });
  }

  // ❖ 令咒·絕對命令（必中＋威力倍增）：消耗一道玩家令咒
  const useSeal = !!userData.seal;
  if (useSeal && getPlayerSeals_(pcData[pIdx][COL.PC.MEMORY]) <= 0) {
    return JSON.stringify({ success: false, message: "你的令咒已用盡，無法施加絕對命令。" });
  }

  // 戰鬥確定開打 → 耗 1 AP（推進 2 小時）
  let battleAp = AP_PER_DAY;
  if (isFateBattle) { try { battleAp = spendAp_(myGameId, 1).ap; } catch (e) { } }

  const fb = resolveFateBattle_(atkC, defC, { np: useNp, seal: useSeal });
  if (useSeal) {
    fb.atkWins = true; // 絕對命令＝必中，強制由玩家從者命中
    const left = getPlayerSeals_(pcData[pIdx][COL.PC.MEMORY]) - 1;
    pcData[pIdx][COL.PC.MEMORY] = setPlayerSeals_(pcData[pIdx][COL.PC.MEMORY], left);
    sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
    if (!fb.fired.includes('令咒·絕對命令')) fb.fired.push('令咒·絕對命令');
  }

  // 寶具耗魔
  if (useNp) {
    pcData[atkIdx][COL.PC.MP] = Math.max(0, (parseInt(pcData[atkIdx][COL.PC.MP]) || 0) - Math.round((parseInt(pcData[atkIdx][COL.PC.MAX_MP]) || 100) * 0.35));
    sheets.pc.getRange(atkIdx + 1, 1, 1, pcData[atkIdx].length).setValues([pcData[atkIdx]]);
  }

  // 套用傷害：勝→守方受傷；負→從者受傷
  let knockedOut = [];
  let victory = false, defeat = false, dreamPrompt = "", destroyedName = "", sealEscaped = false, sealNote = "";
  const dmgIdx = fb.atkWins ? nIdx : atkIdx;
  const dmgC = fb.atkWins ? defC : atkC;
  const dmgFaction = String(pcData[dmgIdx][COL.PC.FACTION] || "");
  let hp = parseInt(pcData[dmgIdx][COL.PC.HP]) || 0;
  let after = hp - fb.damage;
  // 🗡️ 破戒全咒/破魔薔薇(rule_breaker/anti_magic_lance)：勝方斬斷敵之契約與救贖——
  //    此擊之下，敗方無法令咒脫離、戰鬥續行、十二試煉復活，一旦致命即為終結。
  const severed = fb.atkWins && (hasFx_(atkC, 'rule_breaker') || hasFx_(atkC, 'anti_magic_lance'));
  if (severed && after <= 0) fb.fired.push(atkC.name + '·斬斷救贖(契約已破)');
  if (after <= 5 && hasFx_(dmgC, 'survive') && hp > 1 && !severed) { after = 1; fb.fired.push(dmgC.name + '·戰鬥續行'); }

  // 🔵 敵御主令咒反應：敵從者瀕死時，有令咒餘量則 30% 隨機燃令咒「緊急脫離」，靈基受創退場保命
  if (after <= 0 && dmgFaction === "敵從者" && !severed) {
    let eSeals = parseInt(pcData[dmgIdx][COL.PC.CONTRIB]) || 0;
    if (eSeals > 0 && Math.random() < 0.30) {
      sealEscaped = true;
      pcData[dmgIdx][COL.PC.HP] = 1;
      pcData[dmgIdx][COL.PC.CONTRIB] = eSeals - 1;
      pcData[dmgIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基受創", "姿勢": "踉蹌", "負面": "令咒緊急脫離", "顏面": "咬牙退避" });
      const oldLoc = String(pcData[dmgIdx][COL.PC.LOC]).trim();
      const newLoc = enemyRetreatLoc_(oldLoc);
      pcData[dmgIdx][COL.PC.LOC] = newLoc;
      sheets.pc.getRange(dmgIdx + 1, 1, 1, pcData[dmgIdx].length).setValues([pcData[dmgIdx]]);
      // 同地敵御主隨從者一起脫離
      for (let mi = 1; mi < pcData.length; mi++) {
        if (String(pcData[mi][COL.PC.FACTION]) === "敵御主" &&
            String(pcData[mi][COL.PC.GAME_ID] || "") === myGameId &&
            String(pcData[mi][COL.PC.LOC]).trim() === oldLoc &&
            !String(pcData[mi][COL.PC.ID]).startsWith("DEAD_")) {
          pcData[mi][COL.PC.LOC] = newLoc;
          sheets.pc.getRange(mi + 1, 1, 1, pcData[mi].length).setValues([pcData[mi]]);
          break;
        }
      }
      sealNote = `對面御主一道令咒迸發，強令「${defC.name}」於靈基崩解前一瞬撤離戰場，遁向「${newLoc}」（敵餘令咒 ${eSeals - 1}）。`;
    }
  }

  // ⚡ 十二試煉(god_hand)：擁此寶具者(赫拉克勒斯)靈基崩解前自死亡歸來，耗一條命
  let godRevived = false, godNote = "";
  if (after <= 0 && !sealEscaped && !severed && hasFx_(dmgC, 'god_hand')) {
    let lives = getGodHandLives_(pcData[dmgIdx][COL.PC.MEMORY]);
    if (lives > 0) {
      godRevived = true;
      pcData[dmgIdx][COL.PC.HP] = parseInt(pcData[dmgIdx][COL.PC.MAX_HP]) || 480;
      pcData[dmgIdx][COL.PC.MEMORY] = setGodHandLives_(pcData[dmgIdx][COL.PC.MEMORY], lives - 1);
      pcData[dmgIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "神性光輝纏身", "姿勢": "緩緩起身", "負面": `十二試煉·餘${lives - 1}命`, "顏面": "不滅的戰意" });
      sheets.pc.getRange(dmgIdx + 1, 1, 1, pcData[dmgIdx].length).setValues([pcData[dmgIdx]]);
      godNote = `「${pcData[dmgIdx][COL.PC.NAME]}」倒下了——卻又緩緩站起。十二試煉的詛咒讓他一次次自死亡歸來（尚餘 ${lives - 1} 條命）。`;
      fb.fired.push(pcData[dmgIdx][COL.PC.NAME] + '·十二試煉(God Hand)');
    }
  }

  if (after <= 0 && !sealEscaped && !godRevived) {
    // 靈基崩潰＝徹底消滅（不可復原）
    destroyedName = String(pcData[dmgIdx][COL.PC.NAME]);
    pcData[dmgIdx][COL.PC.ID] = "DEAD_" + String(pcData[dmgIdx][COL.PC.ID]);
    pcData[dmgIdx][COL.PC.HP] = 0;
    pcData[dmgIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "靈基崩潰·消滅", "顏面": "已無生息" });
    sheets.pc.getRange(dmgIdx + 1, 1, 1, pcData[dmgIdx].length).setValues([pcData[dmgIdx]]);

    if (dmgFaction === "從者") {
      // 玩家從者被消滅 → 敗北
      defeat = true;
      var wish = extractWish_(pcData[pIdx][COL.PC.MEMORY]);
      dreamPrompt = buildDreamPrompt_(pcData[pIdx][COL.PC.NAME], wish, atkC.name);
      var acctD = String(userData.acctName || "");
      if (acctD) recordHistory_(acctD, "敗", atkC.name, `「${atkC.name}」靈基崩潰於「${defC.name}」之手，聖杯戰爭落敗。`);
    } else {
      // 敵對陣營被消滅
      if (dmgFaction === "敵從者") {
        knockedOut.push(destroyedName);
        var remain = aliveEnemyServants_(sheets, myGameId);
        if (remain <= 0) {
          // 所有敵從者皆已消滅 → 勝利（其他御主存活無妨）
          victory = true;
          var acctW = String(userData.acctName || "");
          if (acctW) {
            incrementWin_(acctW);
            recordHistory_(acctW, "勝", atkC.name, `「${atkC.name}」斬盡所有敵對從者，奪得聖杯。`);
          }
        }
      } else {
        knockedOut.push(destroyedName);
      }
    }
  } else if (!sealEscaped) {
    pcData[dmgIdx][COL.PC.HP] = after;
    sheets.pc.getRange(dmgIdx + 1, 1, 1, pcData[dmgIdx].length).setValues([pcData[dmgIdx]]);
  }

  const resultMsg = (fb.atkWins
    ? `${atkC.name} 命中「${defC.name}」，造成 ${fb.damage} 點傷害！${sealEscaped ? sealNote : (destroyedName && dmgFaction !== "從者" ? `「${defC.name}」靈基崩潰，徹底消滅！` : "")}`
    : `「${defC.name}」化解並反擊，${atkC.name} 受創 ${fb.damage}！${destroyedName && dmgFaction === "從者" ? `${atkC.name} 靈基崩潰，化作光點消散……` : ""}`)
    + (godRevived ? `　${godNote}` : "");
  const firedStr = fb.fired.length ? `\n〔技能／寶具發動〕${fb.fired.join('、')}` : "";
  const critMap = { atk_crit: `${fb.winner} 擲出大成功，一擊洞穿！`, def_crit: `${fb.winner} 擲出大成功，完美反制！`, atk_fumble: `${atkC.name} 擲出大失敗，露出破綻！`, def_fumble: `「${defC.name}」擲出大失敗！` };

  let aiPrompt;
  if (defeat) {
    // 敗北：不在此處演出（前端會先播虛假之夢→老虎道場），戰報僅作收場
    aiPrompt = `【系統戰報·已裁定】御主號令從者『${atkC.name}』迎戰「${defC.name}」，然『${atkC.name}』靈基崩潰、化作光點消散。御主於聖杯戰爭中敗北。\n` +
      `★以 Fate／TYPE-MOON 筆觸沉痛描寫從者消滅的瞬間（一段即可），語氣留白。勝負已由系統結算。\n` +
      `★【鐵律】嚴禁輸出任何 stat_changes、items_gained、money_transferred。`;
  } else {
    aiPrompt = `【系統戰報·已裁定，嚴禁更改勝負】御主號令從者『${atkC.name}』${useNp ? '解放寶具' : '出擊'}，迎戰「${defC.name}」。\n` +
      `擲骰：${atkC.name} 命中 ${fb.aHit}（d20=${fb.aRoll}） vs 「${defC.name}」迴避 ${fb.dEva}（d20=${fb.dRoll}）。${fb.crit ? (critMap[fb.crit] || '') : ''}${firedStr}\n` +
      `最終結果：${resultMsg}\n` +
      `★請以 Fate／TYPE-MOON 筆觸生動描寫這場聖杯戰爭的廝殺，凸顯上面發動的技能／寶具威能與靈基壓迫感（演出而非複述標籤名）。勝負與傷害已由系統結算。\n` +
      (godRevived
        ? `★【十二試煉】${godNote}請演出他靈基崩解後又自死亡歸來、神性光輝重燃的不滅之姿，本回合【未死亡】。\n`
        : (sealEscaped
          ? `★【令咒介入】${sealNote}請演出對面御主令咒光芒爆閃、強行將重傷從者扯離戰場的瞬間，本回合【無人死亡】，敵已遁走、不在場。\n`
          : (destroyedName && dmgFaction !== "從者"
            ? `★「${defC.name}」已靈基崩潰、徹底消滅，可描寫其消散；${victory ? '此乃最後一名敵對從者，聖杯已近。' : ''}\n`
            : `★【鐵律】敗方最多重傷跪地，【絕對禁止】描寫死亡、消滅或屍體，生死由御主後續定奪。\n`))) +
      `★【鐵律】嚴禁輸出任何 stat_changes 生命變化、items_gained、money_transferred。`;
  }

  return JSON.stringify({
    success: true, aiPrompt: aiPrompt, knockedOut: knockedOut,
    victory: victory, defeat: defeat, dreamPrompt: dreamPrompt,
    sealEscaped: sealEscaped,
    clock: isFateBattle ? clockLabel_(myGameId) : "", ap: battleAp, apMax: AP_PER_DAY,
    statusString: getFreshStatusString(pcId, pIdx, sheets), combatResult: fb
  });
}

// 十二試煉(God Hand) 剩餘命數（從者 MEMORY【試煉】N；無標記預設 11）
function getGodHandLives_(memory) {
  var m = String(memory || "").match(/【試煉】(\d+)/);
  return m ? parseInt(m[1]) : 11;
}
function setGodHandLives_(memory, n) {
  var s = String(memory || "");
  if (/【試煉】\d+/.test(s)) return s.replace(/【試煉】\d+/, "【試煉】" + n);
  return (s ? s + "｜" : "") + "【試煉】" + n;
}

// 玩家令咒餘量（存於御主 MEMORY 的【令咒】N 標記；舊角色無標記則視為 3）
function getPlayerSeals_(memory) {
  var m = String(memory || "").match(/【令咒】(\d+)/);
  return m ? parseInt(m[1]) : 3;
}
// 寫回令咒餘量（回傳更新後的 MEMORY 字串）
function setPlayerSeals_(memory, n) {
  var s = String(memory || "");
  if (/【令咒】\d+/.test(s)) return s.replace(/【令咒】\d+/, "【令咒】" + n);
  return (s ? s + "｜" : "") + "【令咒】" + n;
}

// ❖ 玩家令咒（固定選單·絕對命令權）：修復／補魔／脫離（命中走 fate_battle 的 seal 旗標）
function actionUseSeal(userData, pcId, sheets) {
  const type = String(userData.sealType || "").trim(); // 'repair' | 'mana' | 'escape'
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  let seals = getPlayerSeals_(pcData[pIdx][COL.PC.MEMORY]);
  if (seals <= 0) return JSON.stringify({ success: false, message: "你的令咒已經用盡，無法再施加絕對命令。" });

  const svIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無從者，令咒無從施加。" });
  const svName = pcData[svIdx][COL.PC.NAME];

  let effectMsg = "";
  if (type === "repair") {
    pcData[svIdx][COL.PC.HP] = parseInt(pcData[svIdx][COL.PC.MAX_HP]) || 480;
    pcData[svIdx][COL.PC.MP] = parseInt(pcData[svIdx][COL.PC.MAX_MP]) || 200;
    pcData[svIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基重塑", "姿勢": "昂然而立", "負面": "無", "顏面": "神采奕奕" });
    sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
    effectMsg = `令咒迸發，重塑「${svName}」的靈基——氣血與魔力盡數回滿，傷勢一掃而空。`;
  } else if (type === "mana") {
    pcData[svIdx][COL.PC.MP] = parseInt(pcData[svIdx][COL.PC.MAX_MP]) || 200;
    sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
    raiseBond_(sheets, pcData[pIdx][COL.PC.NAME], svName, 8);
    effectMsg = `令咒化作一道灌頂的魔力洪流，「${svName}」的魔力瞬間充盈到極限，羈絆也更深了一分。`;
  } else if (type === "escape") {
    const oldLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
    const newLoc = enemyRetreatLoc_(oldLoc);
    pcData[pIdx][COL.PC.LOC] = newLoc;
    pcData[svIdx][COL.PC.LOC] = newLoc;
    sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
    sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
    effectMsg = `令咒干涉空間，將你與「${svName}」一同從險境中強行抽離，遁往「${newLoc}」。`;
  } else {
    return JSON.stringify({ success: false, message: "未知的令咒指令。" });
  }

  // 扣令咒（寫回御主 MEMORY），脫離情況御主 LOC 已改、需用最新 row 再寫一次
  seals -= 1;
  pcData[pIdx][COL.PC.MEMORY] = setPlayerSeals_(pcData[pIdx][COL.PC.MEMORY], seals);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);

  const aiPrompt = `【系統·令咒已發動，已裁定】御主燃燒一道令咒。${effectMsg}（餘 ${seals} 道令咒）\n` +
    `★以 Fate／TYPE-MOON 筆觸描寫令咒在手背灼亮、絕對命令權貫徹的瞬間（一段即可）。效果已由系統結算。\n` +
    `★【鐵律】嚴禁輸出任何 stat_changes、items_gained、money_transferred。`;
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, seals: seals, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// 🔵 補魔（魔力供給）：把御主魔力導入從者，回魔＋羈絆＋fade 演出。耗 1 AP（導入魔力需時）
function actionManaSupply(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無從者可供魔。" });
  const svName = pcData[svIdx][COL.PC.NAME];
  const mpMax = parseInt(pcData[svIdx][COL.PC.MAX_MP]) || 200;
  const cur = parseInt(pcData[svIdx][COL.PC.MP]) || 0;
  if (cur >= mpMax) return JSON.stringify({ success: false, message: `「${svName}」的魔力已然充盈，毋須補魔。` });

  const isFateMana = myGameId.indexOf("g_") === 0;
  if (isFateMana && getAp_(myGameId) < 1) {
    return JSON.stringify({ success: false, message: "行動力不足以行補魔之儀——請『休息』恢復後再來。" });
  }

  const restored = Math.min(mpMax, cur + Math.round(mpMax * 0.5));
  pcData[svIdx][COL.PC.MP] = restored;
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  raiseBond_(sheets, pcData[pIdx][COL.PC.NAME], svName, 3);

  let manaAp = AP_PER_DAY, manaClock = "";
  if (isFateMana) { try { manaAp = spendAp_(myGameId, 1).ap; manaClock = clockLabel_(myGameId); } catch (e) { } }

  // 戰場補魔：甜而克制的曖昧 fade（給點甜頭、不開慾海引擎）——真・慾海留給鑑賞
  const aiPrompt = `【系統·補魔已結算】御主以魔力供給「${svName}」，其魔力回復至 ${restored}/${mpMax}，羈絆微升。\n` +
    `★以 Fate／TYPE-MOON 筆觸，溫柔且帶一絲曖昧張力地描寫這場魔力供給——御主與從者肌膚相觸、魔力交融的私密一刻：可有體溫、心跳、靠近、屏息、半句未盡的情話與心動，氛圍甜美而克制，最後 fade-to-black 留白。聚焦兩人之間悄然升溫的羈絆。\n` +
    `★【鐵律】止於唯美曖昧、點到為止；【不可】出現性器官、性交或露骨情慾描寫（那是奪杯後鑑賞的事）。演出而非複述設定；嚴禁輸出任何 stat_changes 生命變化、items_gained、money_transferred。`;
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, clock: manaClock, ap: manaAp, apMax: AP_PER_DAY, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// 🔍 偵查：耗 1 AP，揭露「附近地點」藏匿的敵御主／敵從者（戰爭迷霧；marks SEEN）
function actionScout(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const isFateScout = myGameId.indexOf("g_") === 0;
  if (isFateScout && getAp_(myGameId) < 1) {
    return JSON.stringify({ success: false, message: "行動力不足以偵查——請『休息』恢復後再探。" });
  }
  const curLoc = String(pcData[pIdx][COL.PC.LOC] || "").trim();
  // 附近地點（含當前）作為偵查範圍
  const mapData = sheets.map ? sheets.map.getDataRange().getValues() : [];
  let scope = [curLoc];
  try { getNearbyLocations(curLoc, mapData).forEach(l => { const nm = (l && l.name) ? l.name : l; if (nm) scope.push(String(nm).trim()); }); } catch (e) { }

  let revealed = [];
  for (let i = 1; i < pcData.length; i++) {
    const fac = String(pcData[i][COL.PC.FACTION]);
    if (fac !== "敵御主" && fac !== "敵從者") continue;
    if (String(pcData[i][COL.PC.GAME_ID] || "") !== myGameId) continue;
    if (String(pcData[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    const loc = String(pcData[i][COL.PC.LOC]).trim();
    if (scope.indexOf(loc) === -1) continue;
    if (!String(pcData[i][COL.PC.SEEN] || "")) {
      pcData[i][COL.PC.SEEN] = "1";
      sheets.pc.getRange(i + 1, COL.PC.SEEN + 1).setValue("1");
    }
    revealed.push(pcData[i][COL.PC.NAME] + "（" + loc + "）");
  }

  let scoutAp = AP_PER_DAY, scoutClock = "";
  if (isFateScout) { try { scoutAp = spendAp_(myGameId, 1).ap; scoutClock = clockLabel_(myGameId); } catch (e) { } }

  const msg = revealed.length
    ? `偵查四方，捕捉到氣息：${revealed.join("、")}。`
    : `偵查四方，附近暫無敵蹤現形。`;
  return JSON.stringify({ success: true, message: msg, revealed: revealed, clock: scoutClock, ap: scoutAp, apMax: AP_PER_DAY, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// 提升御主×從者羈絆（關係表好感）
function raiseBond_(sheets, pcName, svName, delta) {
  if (!sheets.rel) return;
  try {
    const rd = sheets.rel.getDataRange().getValues();
    for (let i = 1; i < rd.length; i++) {
      if (String(rd[i][COL.REL.PC]) === pcName && String(rd[i][COL.REL.NPC]) === svName) {
        const v = Math.min(100, (parseInt(rd[i][COL.REL.FAV]) || 0) + delta);
        sheets.rel.getRange(i + 1, COL.REL.FAV + 1).setValue(v);
        return;
      }
    }
  } catch (e) { }
}

// 從御主 MEMORY 取出【願望】內容（show-don't-tell：僅供生成虛假之夢，不直述）
function extractWish_(memory) {
  var m = String(memory || "").match(/【願望】([^【\n]+)/);
  return m ? m[1].trim() : "";
}

// 建立「願望實現的虛假之夢」prompt（敗北安慰幻象，之後接老虎道場）
function buildDreamPrompt_(pcName, wish, servantName) {
  return `【虛假之夢·已裁定】御主『${pcName}』在聖杯戰爭中敗北，意識墜入聖杯泥所編織的甜美幻象。\n` +
    `在這場夢裡，御主的最深願望彷彿已然實現——一切圓滿、溫柔而虛假。從者『${servantName}』也仿佛仍在身旁。\n` +
    (wish ? `（願望核心參考，僅供你構築夢境氛圍，嚴禁逐字複述或直接點明）：${wish}\n` : "") +
    `★以 Fate／TYPE-MOON 筆觸，第二人稱，寫一段唯美而令人心碎的虛假美夢：讓「演出」暗示願望成真的幸福感，絕不可直接說出願望內容或「這是假的」。結尾要微微露出破綻（過於完美的失真感）。\n` +
    `★【鐵律】只輸出夢境敘事，嚴禁任何 stat_changes、items_gained、money_transferred、選項或系統字樣。`;
}

function actionAttackNpc(userData, pcId, sheets) {
  const { npcName, skillName } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  const itemData = sheets.item ? sheets.item.getDataRange().getValues() : []; // 讀一次共用，避免下面算戰力時各自重讀
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  // 🔵 攻擊者＝御主的從者（凡人御主不肉身上陣）；若無從者則御主親自(弱)
  let atkIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (atkIdx === -1) atkIdx = pIdx;
  // 🔵 目標限本實例(game_id)，杜絕跨世界同名誤傷
  const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === npcName && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "此世界查無此人" });

  // 同地點才能打（以御主所在判定，從者隨行）
  if (String(pcData[pIdx][COL.PC.LOC]).trim() !== String(pcData[nIdx][COL.PC.LOC]).trim()) {
    return JSON.stringify({ success: false, message: "對方不在你身邊，鞭長莫及。" });
  }

  const pName = pcData[atkIdx][COL.PC.NAME];
  const pTotal = getCharacterTotalStats(pcData[atkIdx][COL.PC.ID], sheets, pcData, itemData);
  const nTotal = getCharacterTotalStats(pcData[nIdx][COL.PC.ID], sheets, pcData, itemData);

  // d20
  const pRoll = Math.floor(Math.random() * 20) + 1;
  const nRoll = Math.floor(Math.random() * 20) + 1;

  // 加成：攻方看臂力+身法，守方看根骨+身法（皆為境界放大後的值）
  const skillBonus = (skillName && String(skillName).trim()) ? 1 : 0;
  const pMod = Math.round(((pTotal.STR || 0) + (pTotal.AGI || 0)) / 6) + skillBonus;
  const nMod = Math.round(((nTotal.CON || 0) + (nTotal.AGI || 0)) / 6);

  let pScore = pRoll + pMod;
  let nScore = nRoll + nMod;

  // 特殊值處理
  const pCrit = pRoll === 20, pFumble = pRoll === 1;
  const nCrit = nRoll === 20, nFumble = nRoll === 1;

  // 判定勝負方向：true=玩家贏(打NPC)，false=NPC贏(反擊玩家)
  let playerWins;
  let critFlavor = ""; // 給前端與AI的特殊演出標記
  let dmgMultiplier = 1;

  if (pFumble && !nFumble) { playerWins = false; dmgMultiplier = 1.5; critFlavor = "player_fumble"; }
  else if (nFumble && !pFumble) { playerWins = true; dmgMultiplier = 1.5; critFlavor = "npc_fumble"; }
  else if (pCrit && !nCrit) { playerWins = true; critFlavor = "player_crit"; }
  else if (nCrit && !pCrit) { playerWins = false; critFlavor = "npc_crit"; }
  else { playerWins = pScore >= nScore; } // 含「雙方都特殊值」→回歸比總分

  // 傷害 = 差距 ×7；大成功保底破防 +30；大失敗 ×1.5
  let diff = Math.abs(pScore - nScore);
  let damage = Math.max(1, diff * 7);
  if ((playerWins && pCrit && !nCrit) || (!playerWins && nCrit && !pCrit)) damage += 30; // 大成功保底（雙方同時大成功時不疊加，回歸純分差判定）
  damage = Math.round(damage * dmgMultiplier);

  let resultMsg = "";
  let knockedOut = [];
  let justRevived = false;

  if (playerWins) {
    // 打 NPC：鎖血，最低到1昏迷，絕不致死
    let nHp = parseInt(pcData[nIdx][COL.PC.HP]) || 0;
    let nHpAfter = nHp - damage;
    if (nHpAfter <= 5) {
      pcData[nIdx][COL.PC.HP] = 1;
      pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "衣衫破爛", "姿勢": "倒地不起", "負面": "重傷昏迷", "顏面": "面色慘白" });
      knockedOut.push(npcName);
    } else {
      pcData[nIdx][COL.PC.HP] = nHpAfter;
    }
    sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);
    resultMsg = `你擊中了「${npcName}」，造成 ${damage} 點傷害！`;
  } else {
    // 反擊：傷的是從者(靈基)，不是御主肉身
    let aHp = parseInt(pcData[atkIdx][COL.PC.HP]) || 0;
    let aHpAfter = aHp - damage;
    if (aHpAfter <= 5) {
      pcData[atkIdx][COL.PC.HP] = 1;
      pcData[atkIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基受創", "姿勢": "單膝跪地", "負面": "靈基重創", "顏面": "咬牙強撐" });
    } else {
      pcData[atkIdx][COL.PC.HP] = aHpAfter;
    }
    sheets.pc.getRange(atkIdx + 1, 1, 1, pcData[atkIdx].length).setValues([pcData[atkIdx]]);
    resultMsg = `「${npcName}」反擊得手，${pName} 受了 ${damage} 點傷！`;
  }

  // 給 AI 的指令：結果已定，只能照演
  let critText = "";
  if (critFlavor === "player_crit") critText = `${pName} 骰出【大成功】，這一擊精妙絕倫、無視防禦命中要害！`;
  else if (critFlavor === "npc_crit") critText = `「${npcName}」骰出【大成功】，${pName} 的進攻被完美化解並遭凌厲反擊！`;
  else if (critFlavor === "player_fumble") critText = `${pName} 骰出【大失敗】，招式露出致命破綻，被對方狠狠教訓！`;
  else if (critFlavor === "npc_fumble") critText = `「${npcName}」骰出【大失敗】，露出天大破綻，被 ${pName} 打得毫無還手之力！`;

  const aiPrompt = `【系統戰報·已裁定，嚴禁更改勝負】御主令從者『${pName}』向「${npcName}」發動攻擊${skillName ? `（寶具／技：${skillName}）` : ""}。\n` +
    `擲骰結果：玩家 ${pRoll}+${pMod}=${pScore}，${npcName} ${nRoll}+${nMod}=${nScore}。\n` +
    `${critText}\n最終結果：${resultMsg}\n` +
    `★請依此結果生動描寫這場交手，勝負與傷害已由系統結算完畢。\n` +
    `★【鐵律】「${npcName}」最多只是重傷昏迷倒地，【絕對禁止】描寫其死亡、斷氣、隕落或屍體！生死由玩家後續定奪。\n` +
    `★【鐵律】嚴禁輸出任何 stat_changes 的生命變化，傷害已結算完畢，重複輸出會導致天道崩塌！\n` +
    `★【鐵律】此為單純切磋交手，嚴禁輸出 items_gained、items_transferred 或 money_transferred，戰利品掠奪需待對方昏迷後另行處決才可結算！`;
  return JSON.stringify({
    success: true,
    combatResult: {
      playerName: pName, npcName: npcName,
      pRoll: pRoll, pMod: pMod, pScore: pScore,
      nRoll: nRoll, nMod: nMod, nScore: nScore,
      playerWins: playerWins, damage: damage, critFlavor: critFlavor
    },
    aiPrompt: aiPrompt,
    knockedOut: knockedOut,
    justRevived: justRevived,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// ==========================================
// ⚔️ 多目標群戰裁決：解析玩家輸入中的 [攻擊XXX]敘述 標籤，依序逐一裁定
// 中途玩家陣亡則立即停止後續目標，並自動放過本次連擊中已被打昏者（不可能補刀）
// ==========================================
function actionMultiAttack(userData, pcId, sheets) {
  const { rawInput } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  let itemData = sheets.item ? sheets.item.getDataRange().getValues() : [];
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });
  const pName = pcData[pIdx][COL.PC.NAME];
  const pLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  // 🔵 從者代御主出戰（凡人御主不肉身上陣）
  let atkIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (atkIdx === -1) atkIdx = pIdx;
  const svName = pcData[atkIdx][COL.PC.NAME];

  const tagRegex = /\[(攻擊|下毒|媚藥)(.+?)\]([^\[]*)/g;
  let segments = [];
  let m;
  while ((m = tagRegex.exec(String(rawInput || ""))) !== null) {
    segments.push({ actionType: m[1], targetName: m[2].trim(), flavor: m[3].trim() });
  }
  if (segments.length === 0) {
    return JSON.stringify({ success: false, message: "未偵測到攻擊指令" });
  }

  // 🔴 戰鬥硬上限：每次對話最多結算 3 個動作（攻擊/下毒/媚藥合計）。
  //   後端強制截斷，不信任前端，玩家手打塞再多標籤也只前 3 個生效。
  const MAX_COMBO = 3;
  let comboTrimmed = 0;
  if (segments.length > MAX_COMBO) {
    comboTrimmed = segments.length - MAX_COMBO;
    segments = segments.slice(0, MAX_COMBO);
  }

  const pTotal = getCharacterTotalStats(pcData[atkIdx][COL.PC.ID], sheets, pcData, itemData);
  let results = [];
  let knockedOutAll = [];
  let justRevived = false;
  let aiPromptParts = [];
  let playerDead = false;

  for (const seg of segments) {
    if (playerDead) break;

    const nIdx = pcData.findIndex(r => r[COL.PC.ID] != pcId && r[COL.PC.ID] != pcData[atkIdx][COL.PC.ID] && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
      (!myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId) &&
      String(r[COL.PC.LOC]).trim() === pLoc && String(r[COL.PC.NAME]).includes(seg.targetName));
    if (nIdx === -1) {
      results.push({ actionType: seg.actionType, targetName: seg.targetName, skipped: true });
      aiPromptParts.push(`【系統】玩家欲對「${seg.targetName}」動作，但對方查無此人或不在場，此招落空未能命中任何人。玩家原話：「${seg.flavor || "（未多說）"}」`);
      continue;
    }
    const npcName = pcData[nIdx][COL.PC.NAME];
    if (seg.actionType === "攻擊" && (parseInt(pcData[nIdx][COL.PC.HP]) || 0) <= 1 && knockedOutAll.includes(npcName)) {
      results.push({ actionType: seg.actionType, targetName: npcName, skipped: true, reason: "already_down" });
      aiPromptParts.push(`【系統】「${npcName}」已昏迷倒地，玩家未再追擊。`);
      continue;
    }

    if (seg.actionType === "下毒" || seg.actionType === "媚藥") {
      const isPoison = seg.actionType === "下毒";
      const itIdx = itemData.findIndex(r => r[COL.ITEM.OWNER] == pcId &&
        (String(r[COL.ITEM.TYPE]) === (isPoison ? "毒藥" : "媚藥") || (String(r[COL.ITEM.NAME]).includes(isPoison ? "毒" : "春") && !String(r[COL.ITEM.NAME]).includes("解"))));
      if (itIdx === -1) {
        results.push({ actionType: seg.actionType, targetName: npcName, skipped: true, reason: "no_item" });
        aiPromptParts.push(`【系統】玩家想對「${npcName}」${seg.actionType}，但翻遍行囊找不到合適的藥材，此招落空，未能對其下藥。玩家原話：「${seg.flavor || "（未多說）"}」`);
        continue;
      }
      const usedItemName = itemData[itIdx][COL.ITEM.NAME];
      sheets.item.deleteRow(itIdx + 1);
      itemData.splice(itIdx, 1);

      const nTotal = getCharacterTotalStats(pcData[nIdx][COL.PC.ID], sheets, pcData, itemData);
      const pRoll = Math.floor(Math.random() * 20) + 1;
      const nRoll = Math.floor(Math.random() * 20) + 1;
      const pMod = Math.round(((pTotal.INT || 0) + (pTotal.LUK || 0)) / 6);
      const nMod = Math.round(((nTotal.CON || 0) + (nTotal.INT || 0)) / 6);
      let pScore = pRoll + pMod;
      let nScore = nRoll + nMod;
      const pCrit = pRoll === 20, pFumble = pRoll === 1;
      const nCrit = nRoll === 20, nFumble = nRoll === 1;

      let success, critFlavor = "";
      if (pFumble && !nFumble) { success = false; critFlavor = "player_fumble"; }
      else if (nFumble && !pFumble) { success = true; critFlavor = "npc_fumble"; }
      else if (pCrit && !nCrit) { success = true; critFlavor = "player_crit"; }
      else if (nCrit && !pCrit) { success = false; critFlavor = "npc_crit"; }
      else { success = pScore >= nScore; }

      let resultMsg = "";
      if (success) {
        let vs = parseVisibleStatus(pcData[nIdx][COL.PC.STATUS]);
        const debuffName = isPoison ? "中毒" : "媚惑";
        // 🔴 中毒/媚惑各自獨立、不分層，命中即生效(重複下藥不加成，純粹維持/覆蓋)
        const curRaw = String(vs["負面"] || "");
        const alreadyHas = curRaw.includes(debuffName);
        const otherHas = curRaw.includes(isPoison ? "媚惑" : "中毒");
        const hasPoisonNow = isPoison ? true : otherHas;
        const hasCharmNow = isPoison ? otherHas : true;
        vs["負面"] = (hasPoisonNow ? "中毒" : "") + (hasCharmNow ? "媚惑" : "");
        pcData[nIdx][COL.PC.STATUS] = JSON.stringify(vs);
        if (alreadyHas) resultMsg = `「${usedItemName}」再次奏效，「${npcName}」的「${debuffName}」效力持續壓制！`;
        else if (otherHas) resultMsg = `「${usedItemName}」奏效，「${npcName}」如今「中毒」與「媚惑」雙重纏身！`;
        else resultMsg = `「${usedItemName}」奏效，「${npcName}」中了「${debuffName}」！`;
      } else {
        resultMsg = `「${npcName}」識破了這一手，「${usedItemName}」未能奏效！`;

        // 🔴 失敗教訓：被識破當場，扣好感+扣血，不然太爽了
        const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
        const rIdx = relData.findIndex(r => r[COL.REL.PC] === pName && r[COL.REL.NPC] === npcName);
        if (rIdx !== -1) {
          const newFav = Math.max(-100, Math.min(100, (parseInt(relData[rIdx][COL.REL.FAV]) || 0) - 5));
          sheets.rel.getRange(rIdx + 1, COL.REL.FAV + 1).setValue(newFav);
        } else if (sheets.rel) {
          sheets.rel.appendRow([pName, npcName, -5, "萍水相逢", "", "", `${seg.actionType}「${npcName}」被識破`]);
        }
        pcData[pIdx][COL.PC.HP] = Math.max(1, (parseInt(pcData[pIdx][COL.PC.HP]) || 0) - 10);
      }

      let critText = "";
      if (critFlavor === "player_crit") critText = "玩家骰出【大成功】，下藥手法不著痕跡，對方毫無察覺！";
      else if (critFlavor === "npc_crit") critText = `「${npcName}」骰出【大成功】，神識敏銳，當場識破並躲開了藥效！`;
      else if (critFlavor === "player_fumble") critText = "玩家骰出【大失敗】，手法生硬，動作被對方瞧個正著！";
      else if (critFlavor === "npc_fumble") critText = `「${npcName}」骰出【大失敗】，毫無防備，正中下懷！`;

      aiPromptParts.push(
        `【${seg.actionType}：玩家 vs 「${npcName}」】玩家原話：「${seg.flavor || "（未多說，直接動手）"}」\n` +
        `擲骰：玩家 ${pRoll}+${pMod}=${pScore}，「${npcName}」 ${nRoll}+${nMod}=${nScore}。${critText}\n` +
        `結果：${resultMsg}`
      );

      results.push({
        actionType: seg.actionType, targetName: npcName, pRoll: pRoll, pMod: pMod, pScore: pScore,
        nRoll: nRoll, nMod: nMod, nScore: nScore,
        playerWins: success, critFlavor: critFlavor, flavor: seg.flavor
      });
      continue;
    }

    const nTotal = getCharacterTotalStats(pcData[nIdx][COL.PC.ID], sheets, pcData, itemData);
    const pRoll = Math.floor(Math.random() * 20) + 1;
    const nRoll = Math.floor(Math.random() * 20) + 1;
    const pMod = Math.round(((pTotal.STR || 0) + (pTotal.AGI || 0)) / 6);

    // 🔴 中毒/媚惑狀態懲罰：各自獨立、各 -3，兩者皆中則 -6
    const nDebuffRaw = String(parseVisibleStatus(pcData[nIdx][COL.PC.STATUS])["負面"] || "");
    const nHasPoison = nDebuffRaw.includes("中毒");
    const nHasCharm = nDebuffRaw.includes("媚惑");
    const nDebuffPenalty = (nHasPoison ? 3 : 0) + (nHasCharm ? 3 : 0);
    const nMod = Math.round(((nTotal.CON || 0) + (nTotal.AGI || 0)) / 6) - nDebuffPenalty;

    let pScore = pRoll + pMod;
    let nScore = nRoll + nMod;
    const pCrit = pRoll === 20, pFumble = pRoll === 1;
    const nCrit = nRoll === 20, nFumble = nRoll === 1;

    let diff = Math.abs(pScore - nScore);
    let playerWins, critFlavor = "", dmgMultiplier = 1, isStalemate = false;
    if (pFumble && !nFumble) { playerWins = false; dmgMultiplier = 1.5; critFlavor = "player_fumble"; }
    else if (nFumble && !pFumble) { playerWins = true; dmgMultiplier = 1.5; critFlavor = "npc_fumble"; }
    else if (pCrit && !nCrit) { playerWins = true; critFlavor = "player_crit"; }
    else if (nCrit && !pCrit) { playerWins = false; critFlavor = "npc_crit"; }
    // 🔴 棋逢對手：分數差距在2以內，視為僵持(擊中卸力或被堂堂正正閃避)，不掉血，江湖氣味的「沒打到/打到沒傷」
    else if (diff <= 2) { isStalemate = true; playerWins = pScore >= nScore; }
    else { playerWins = pScore >= nScore; }

    let damage = isStalemate ? 0 : Math.max(1, diff * 7);
    if (!isStalemate && ((playerWins && pCrit && !nCrit) || (!playerWins && nCrit && !pCrit))) damage += 30;
    damage = Math.round(damage * dmgMultiplier);

    // 🔴 武器/防具的「痛感」加成：跟骰子命中脫鉤，神兵打中就是比較痛、防具擋下就是比較不痛，不然空手跟拿神兵傷害感覺一樣很怪
    const atkWepBonus = isStalemate ? 0 : (playerWins ? (pTotal.wepSTR || 0) : (nTotal.wepSTR || 0));
    const defArmBonus = isStalemate ? 0 : (playerWins ? (nTotal.armCON || 0) : (pTotal.armCON || 0));
    if (!isStalemate) damage = Math.max(1, damage + atkWepBonus * 3 - defArmBonus * 2);

    let resultMsg = "";
    let isDodge = false;
    if (isStalemate) {
      isDodge = Math.random() < 0.5;
      resultMsg = isDodge
        ? `你與「${npcName}」棋逢對手，這一招被對方堂堂正正地避開了，未能命中！`
        : `你與「${npcName}」棋逢對手，這一擊確實碰上了，但對方及時卸力化開，未能造成實質傷害！`;
    } else if (playerWins) {
      let nHp = parseInt(pcData[nIdx][COL.PC.HP]) || 0;
      let nHpAfter = nHp - damage;
      if (nHpAfter <= 5) {
        pcData[nIdx][COL.PC.HP] = 1;
        pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "衣衫破爛", "姿勢": "倒地不起", "負面": "重傷昏迷", "顏面": "面色慘白" });
        knockedOutAll.push(npcName);
      } else {
        pcData[nIdx][COL.PC.HP] = nHpAfter;
      }
      resultMsg = `你擊中了「${npcName}」，造成 ${damage} 點傷害！`;
    } else {
      // 反擊：傷的是從者(靈基)，不是御主肉身
      let aHp = parseInt(pcData[atkIdx][COL.PC.HP]) || 0;
      let aHpAfter = aHp - damage;
      if (aHpAfter <= 5) {
        pcData[atkIdx][COL.PC.HP] = 1;
        pcData[atkIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基受創", "姿勢": "單膝跪地", "負面": "靈基重創", "顏面": "咬牙強撐" });
        justRevived = false;
        playerDead = true; // 從者倒下，停止後續連擊
      } else {
        pcData[atkIdx][COL.PC.HP] = aHpAfter;
      }
      resultMsg = `「${npcName}」反擊得手，${svName} 受了 ${damage} 點傷！`;
    }

    let critText = "";
    if (critFlavor === "player_crit") critText = `${svName} 骰出【大成功】，這一擊精妙絕倫、無視防禦命中要害！`;
    else if (critFlavor === "npc_crit") critText = `「${npcName}」骰出【大成功】，${svName} 的進攻被完美化解並遭凌厲反擊！`;
    else if (critFlavor === "player_fumble") critText = `${svName} 骰出【大失敗】，招式露出致命破綻，被對方狠狠教訓！`;
    else if (critFlavor === "npc_fumble") critText = `「${npcName}」骰出【大失敗】，露出天大破綻，被 ${svName} 打得毫無還手之力！`;

    let debuffHint = "";
    if (nHasPoison && nHasCharm) debuffHint = `（「${npcName}」身上中毒與媚惑雙重纏身，反應遲滯，可在敘述中帶到這點）\n`;
    else if (nHasPoison) debuffHint = `（「${npcName}」身上中毒尚未消退，反應遲滯，可在敘述中帶到這點）\n`;
    else if (nHasCharm) debuffHint = `（「${npcName}」身上媚惑尚未消退，意亂神迷，可在敘述中帶到這點）\n`;

    // 🔴 武器/防具達一定品階才提示AI帶到，並把實際物品名稱餵給AI，避免凡品雜物也硬寫一句神兵防身
    let gearHint = "";
    if (atkWepBonus >= 4) {
      const wepName = (playerWins ? pTotal.wepName : nTotal.wepName) || "兵刃";
      gearHint += `（${playerWins ? "玩家" : `「${npcName}」`}手中「${wepName}」材質不凡，這一擊格外沉重）\n`;
    }
    if (defArmBonus >= 4) {
      const armName = (playerWins ? nTotal.armName : pTotal.armName) || "防具";
      gearHint += `（${playerWins ? `「${npcName}」` : "玩家"}身披「${armName}」，硬生生卸去不少力道）\n`;
    }

    aiPromptParts.push(
      `【對戰：御主之從者 ${svName} vs 「${npcName}」】御主原話：「${seg.flavor || "（未多說，直接令從者出手）"}」\n` +
      debuffHint + gearHint +
      `擲骰：${svName} ${pRoll}+${pMod}=${pScore}，「${npcName}」 ${nRoll}+${nMod}=${nScore}。${critText}\n` +
      `結果：${resultMsg}`
    );

    results.push({
      actionType: "攻擊", targetName: npcName, pRoll: pRoll, pMod: pMod, pScore: pScore,
      nRoll: nRoll, nMod: nMod, nScore: nScore,
      playerWins: playerWins, damage: damage, critFlavor: critFlavor, flavor: seg.flavor,
      isStalemate: isStalemate, isDodge: isDodge
    });
  }

  // 玩家中途陣亡：不可能補刀，自動放過本次連擊中所有被打昏者
  if (playerDead && knockedOutAll.length > 0) {
    knockedOutAll.forEach(name => {
      const idx = pcData.findIndex(r => r[COL.PC.NAME] === name && !String(r[COL.PC.ID]).startsWith("DEAD_"));
      if (idx !== -1) {
        const maxHp = parseInt(pcData[idx][COL.PC.MAX_HP]) || 100;
        pcData[idx][COL.PC.HP] = Math.max(1, Math.floor(maxHp * 0.2));
        pcData[idx][COL.PC.STATUS] = JSON.stringify({ "衣服": "衣衫破損", "姿勢": "勉強起身", "負面": "傷勢未癒", "顏面": "虛弱" });
      }
    });
    knockedOutAll = [];
  }

  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  if (atkIdx !== pIdx) sheets.pc.getRange(atkIdx + 1, 1, 1, pcData[atkIdx].length).setValues([pcData[atkIdx]]);
  // 🔴 連擊結束：未在本次被重新下藥的中毒/媚惑對象，效力直接清除(無分層，靠資源消耗維持壓制)
  const redosedPoison = new Set(), redosedCharm = new Set();
  results.forEach(r => {
    if (!r.playerWins) return;
    if (r.actionType === "下毒") redosedPoison.add(r.targetName);
    if (r.actionType === "媚藥") redosedCharm.add(r.targetName);
  });
  const decayedNames = new Set();
  pcData.forEach((row, idx) => {
    if (idx === pIdx) return;
    if (String(row[COL.PC.LOC]).trim() !== pLoc) return;
    const vs = parseVisibleStatus(row[COL.PC.STATUS]);
    const raw = String(vs["負面"] || "");
    let hasPoison = raw.includes("中毒");
    let hasCharm = raw.includes("媚惑");
    if (!hasPoison && !hasCharm) return;
    let changed = false;
    if (hasPoison && !redosedPoison.has(row[COL.PC.NAME])) { hasPoison = false; changed = true; }
    if (hasCharm && !redosedCharm.has(row[COL.PC.NAME])) { hasCharm = false; changed = true; }
    if (!changed) return;
    vs["負面"] = (hasPoison ? "中毒" : "") + (hasCharm ? "媚惑" : "") || "無";
    row[COL.PC.STATUS] = JSON.stringify(vs);
    decayedNames.add(row[COL.PC.NAME]);
  });

  const touchedNames = new Set([...results.map(r => r.targetName).filter(Boolean), ...decayedNames]);
  pcData.forEach((row, idx) => {
    if (idx !== pIdx && touchedNames.has(row[COL.PC.NAME])) {
      sheets.pc.getRange(idx + 1, 1, 1, row.length).setValues([row]);
    }
  });

  // 🔴 補充前因後果：地點 + 參戰者性格卡 + 近期因果，避免敘事出戲(無視同地人物/角色性格跑掉)
  let npcCardsArr = [];
  const relDataForCards = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  touchedNames.forEach(name => {
    const r = pcData.find(row => String(row[COL.PC.NAME]).trim() === name);
    if (!r) return;
    const relRow = relDataForCards.find(rr => rr[COL.REL.PC] === pName && rr[COL.REL.NPC] === name);
    const prefArr = String(r[COL.PC.PREF] || "").split('、');
    const traitArr = String(r[COL.PC.TRAIT] || "").split('、');
    npcCardsArr.push(`【${name}】境界:${r[COL.PC.REALM] || "凡人"} | 性格:[表象]${prefArr[0] || "無"} [內裡]${prefArr[1] || "無"} | 特徵:${traitArr[1] || "無"} | 與玩家關係:${relRow ? relRow[COL.REL.TAG] : "萍水相逢"}(好感:${relRow ? relRow[COL.REL.FAV] : 0})`);
  });
  const npcCardsStr = npcCardsArr.length > 0 ? `\n【參戰者資料】\n${npcCardsArr.join("\n")}` : "";

  const recentLogStr = getRecentCausalityStr(sheets, pName, null, 5);

  // 🔴 同地點但沒被攻擊波及的人(例如同行夥伴單純在場圍觀)，也算真的在場，不可被「在場驗證」誤鎖
  const untouchedBystanders = pcData
    .filter(r => r[COL.PC.ID] != pcId && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
      String(r[COL.PC.LOC]).trim() === pLoc && !touchedNames.has(r[COL.PC.NAME]))
    .map(r => r[COL.PC.NAME]);
  const presentStr = untouchedBystanders.length > 0
    ? `玩家、【參戰者資料】列出之人，以及在場的${untouchedBystanders.join('、')}`
    : `玩家與【參戰者資料】列出之人`;

  const aiPrompt = `【場景】玩家『${pName}』目前位於『${pLoc}』。\n【近期因果】(僅供背景參考，純屬回憶，並非當下在場！)\n${recentLogStr}${npcCardsStr}\n\n` +
    `【系統戰報·已裁定，嚴禁更改任何勝負、傷害或藥效判定】御主『${pName}』號令從者『${svName}』展開連續攻勢：\n\n` +
    aiPromptParts.join("\n\n") + `\n\n` +
    (comboTrimmed > 0 ? `★【系統】玩家本想一氣呵成更多招，但連續出手 3 次後招式已用老、氣力難繼，餘下 ${comboTrimmed} 次動作未能施展，請在敘述收尾帶到玩家後繼乏力、不得不暫歇的窘態，且這些未施展的動作完全不結算任何數值。\n\n` : "") +
    `★請依此結果，並參照上方地點、近期因果與參戰者性格資料，將以上每一段交手依序串接成一段流暢生動的描寫，可參考玩家自己描述的招式、語氣與下藥手法。\n` +
    `★【在場驗證】本回合在場者僅有${presentStr}，可合理帶到其存在或反應；近期因果中提到的其他姓名均不在場，嚴禁讓其登場、插話或互動！\n` +
    `★【鐵律】任何被擊倒者最多只是重傷昏迷倒地，【絕對禁止】描寫死亡、斷氣、隕落或屍體！生死由玩家後續定奪。\n` +
    `★【鐵律】嚴禁輸出任何 stat_changes 的生命變化或負面狀態變化，已結算完畢，重複輸出會導致天道崩塌！\n` +
    `★【鐵律】此為單純切磋／下藥交鋒，嚴禁輸出 items_gained、items_transferred 或 money_transferred！` +
    (playerDead ? `\n★【鐵律】玩家中途力竭被擊倒，已自動送醫並放過先前打昏的對象，請描寫玩家狼狽敗退、被送醫的過程，絕對禁止描寫對方追殺或補刀！` : "");

  return JSON.stringify({
    success: true,
    results: results,
    aiPrompt: aiPrompt,
    knockedOut: knockedOutAll,
    justRevived: justRevived,
    touchedNames: Array.from(touchedNames),
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// ==========================================
// 🟢 輕量敘事專用路由：結算已由 GAS 完成，這裡只請 AI 補一段純文字描寫
// 不讀規矩表、不帶歷史、不解析 JSON 數值，token 砍到最低
// ==========================================
function actionNarrateOnly(userData, pcId, sheets) {
  const { promptText, isNsfw } = userData;

  const miniSystem = `你是九州說書人。用日系武俠輕小說筆觸、第一人稱「我」、強制台灣繁體中文，依指令生動描寫一小段劇情（150~250字）。
【鐵律】
1. 旁白第一人稱「我」，禁用「你」與上帝視角。
2. 對話格式：角色名：「（動作/神態/眼神/微表情）台詞……（動作/神態/眼神/微表情）台詞（動作/神態/眼神/微表情）」。動作神態【絕對禁止】獨立成段或寫在引號外，一律用全形括號「（）」嵌入台詞開頭/中間/結尾，至少穿插2次以上。
3. 強制分段：每2~3句插入 <br><br>，整段至少3個 <br><br>，禁止整坨。換行一律用 <br><br>，禁止真實換行，禁止輸出任何 HTML 標籤。
4. ★這是純敘事補完，系統底層已結算完所有數值，你只負責寫字。
5. ★對話歷史中的內容是「已經發生並結束」的既定事實，僅供掌握語氣與情緒連貫，禁止把歷史中的動作當成本回合又重演一次；本回合唯一真正發生的新事件，只有當前這句指令提供的內容。
6. 只輸出 JSON：{"narration":"你的敘述，內含<br><br>分段"}，禁止任何其他欄位、禁止 Markdown。`;

  let aiConfig = {
    temperature: 0.85,
    ignoreLaw: true,            // 不疊規矩表(節慶/天時)
    max_tokens: 700,            // 比 actionPlay 的 2000 砍掉一大半
    model: "google/gemini-3.1-flash-lite",
    isNsfwMode: !!isNsfw        // NSFW 時讓 fallback 文案合理，但不啟用完整慾海規則
  };

  // 🔴 帶最近2筆歷史維持語氣連貫，避免緊接著前一回合劇情卻完全失憶導致出戲；
  // miniSystem規則5已明確告知AI：歷史是既定事實，不可被誤認成本回合重演。
  const recentHistoryRaw = getGameHistoryBatchRaw(pcId, 2);
  if (recentHistoryRaw && recentHistoryRaw.length > 0) {
    aiConfig.chatHistory = recentHistoryRaw.map(msg => ({
      role: msg.speaker === "player" ? "user" : "assistant",
      content: String(msg.content)
    }));
  }

  const raw = callGeminiAPI(promptText, miniSystem, aiConfig);

  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const data = JSON.parse(raw.substring(start, end + 1));
    const narrationText = data.narration || "天地靜默，一片祥和。";
    saveGameHistoryBatch(pcId, [
      { speaker: "player", content: promptText },
      { speaker: "ai", content: narrationText }
    ]);
    return JSON.stringify({ success: true, text: narrationText });
  } catch (e) {
    return JSON.stringify({ success: true, text: "（此處因果已定，天機微微一閃。）" });
  }
}

// ==========================================
// 🟢 連擊戰報專用輕量路由：同樣不讀規矩表，但帶 2 筆歷史以維持語氣連貫，
// 取代 actionMultiAttack 原本走的完整 play 管線。不產生 options，
// 因為連擊後直接點同地NPC名字(超連結)繼續打即可，不需要選項。
// ==========================================
function actionMultiAttackNarrate(userData, pcId, sheets) {
  const { promptText, isNsfw, touchedNames, knockedOut } = userData;

  const miniSystem = `你是九州說書人。用日系武俠輕小說筆觸、第一人稱「我」、強制台灣繁體中文，依指令生動描寫一段交鋒過程（150~250字）。
【鐵律】
1. 旁白第一人稱「我」，禁用「你」與上帝視角。
2. 對話格式：角色名：「（動作/神態/眼神/微表情）台詞……（動作/神態/眼神/微表情）台詞（動作/神態/眼神/微表情）」。動作神態【絕對禁止】獨立成段或寫在引號外，一律用全形括號「（）」嵌入台詞開頭/中間/結尾，至少穿插2次以上。
3. 強制分段：每2~3句插入 <br><br>，整段至少3個 <br><br>，禁止整坨。換行一律用 <br><br>，禁止真實換行，禁止輸出任何 HTML 標籤。
4. ★這是純敘事補完，系統底層已結算完所有勝負、傷害與藥效數值，你只負責寫過程的字，禁止更改任何結果。
5. 敘事務必與提供的【場景】地點、【近期因果】與【參戰者資料】(性格/特徵/關係)一致，禁止憑空換地點或讓角色性格走偏。
6. ★對話歷史中的內容是「已經發生並結束」的既定事實：歷史中的行動方式(例如特定接近手法、招式、道具)絕對禁止被當成本回合仍在持續或重新發生一次；但歷史造成的後續影響(例如NPC因此產生的警戒、敵意、態度轉變)必須視為既定事實並自然延續下去。本回合唯一真正發生的新事件，只有【系統戰報】裡提供的內容。
7. 戰報中提到的武器/防具名稱，僅供你掌握該角色當下用的是什麼兵刃/護具以維持敘述合理(例如持槊者不該被寫成肉搏、披甲者不該被寫成衣衫單薄)，並非要求逐字唸出全名，可視文筆需要改用「手中兵刃」、「身上護甲」等代稱，禁止每段都機械式重複完整物品名稱。
8. 只輸出 JSON：{"narration":"你的敘述，內含<br><br>分段"}，禁止任何其他欄位、禁止 Markdown。`;

  let aiConfig = {
    temperature: 0.85,
    ignoreLaw: true,           // 不疊規矩表(節慶/天時)
    max_tokens: 700,           // 比 actionPlay 的 2000 砍掉一大半
    model: "google/gemini-3.1-flash-lite",
    isNsfwMode: !!isNsfw
  };

  // 🔴 帶最近2筆歷史維持劇情連續性；但miniSystem規則6已明確告知AI：歷史是既定事實，
  // 結果要延續(NPC態度等)，但動作本身不能被誤認成本回合又重演一次。
  const recentHistoryRaw = getGameHistoryBatchRaw(pcId, 2);
  if (recentHistoryRaw && recentHistoryRaw.length > 0) {
    aiConfig.chatHistory = recentHistoryRaw.map(msg => ({
      role: msg.speaker === "player" ? "user" : "assistant",
      content: String(msg.content)
    }));
  }

  const raw = callGeminiAPI(promptText, miniSystem, aiConfig);

  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const data = JSON.parse(raw.substring(start, end + 1));
    const narrationText = data.narration || "天地靜默，一片祥和。";

    saveGameHistoryBatch(pcId, [
      { speaker: "player", content: promptText },
      { speaker: "ai", content: narrationText }
    ]);

    // 🔴 補上因果紀錄：連擊戰報結束後也要寫入「因果」表，否則後續近期因果/play()歷史都看不到這場戰鬥
    // 改寫結構化短摘要(誰打誰/有無擊倒)取代整段150字花俏旁白，避免擠爆casual配額；有擊倒則標「變故」而非「閒聊」
    if (sheets.log) {
      const pcData = sheets.pc.getDataRange().getValues();
      const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
      if (pIdx !== -1) {
        const pName = pcData[pIdx][COL.PC.NAME];
        const pLoc = pcData[pIdx][COL.PC.LOC];
        const targets = Array.isArray(touchedNames) ? [...new Set(touchedNames)].filter(Boolean) : [];
        const downed = Array.isArray(knockedOut) ? [...new Set(knockedOut)].filter(Boolean) : [];
        const tag = downed.length > 0 ? "變故" : "閒聊";
        let summary = targets.length > 0 ? `${pName}與${targets.join("、")}交手` : `${pName}動手交鋒`;
        if (downed.length > 0) summary += `，擊倒了${downed.join("、")}`;
        sheets.log.appendRow([new Date(), pcId, formatCausalityEntry(pLoc, tag, pName, summary), pLoc, tag]);
        trimLogRowsByOwner(sheets.log, pcId, 60, 20);
      }
    }

    return JSON.stringify({ success: true, text: narrationText });
  } catch (e) {
    return JSON.stringify({ success: true, text: "（此處因果已定，天機微微一閃。）" });
  }
}

function actionUpdateRelTag(userData, pcId, sheets) {
  const { targetName, newTagText } = userData;
  if (!sheets.rel) return JSON.stringify({ success: false, message: "天道異常：關係表不存在。" });
  if (!newTagText || !String(newTagText).trim()) return JSON.stringify({ success: false, message: "稱呼不可為空。" });

  const pcData = sheets.pc.getDataRange().getValues();
  const myName = pcData.find(r => r[COL.PC.ID] == pcId)[COL.PC.NAME];

  let relData = sheets.rel.getDataRange().getValues();
  const rIdx = relData.findIndex(r => r[COL.REL.PC] === myName && r[COL.REL.NPC] === targetName);

  if (rIdx === -1) return JSON.stringify({ success: false, message: "查無此段羈絆。" });

  const currentFav = parseInt(relData[rIdx][COL.REL.FAV]) || 0;
  const isSoulBound = String(relData[rIdx][COL.REL.TAG] || "").includes("(已傾心)");

  // 🔴 門檻：好感100 + 已傾心，跟送禮解鎖邏輯一致
  if (currentFav < 100 || !isSoulBound) {
    return JSON.stringify({ success: false, message: "羈絆未至深處（需好感100且已傾心），尚無法重新定義這段關係。" });
  }

  // 清掉舊稱呼的"(已傾心)"後綴，套用新文字，再強制補回後綴（後綴永遠鎖死，不開放修改）
  const cleanNewTag = String(newTagText).trim().replace(/\(已傾心\)/g, "").trim();
  const finalTag = `${cleanNewTag}(已傾心)`;

  sheets.rel.getRange(rIdx + 1, COL.REL.TAG + 1).setValue(finalTag);

  return JSON.stringify({ success: true, message: `羈絆已重新定義為「${finalTag}」。`, newTag: finalTag });
}
// ==========================================
// 🏰 開宗立派邏輯 (高門檻 + 獨立領地版)
// ==========================================
function actionCreateFaction(userData, pcId, sheets) {
  const { factionName, align, motto, baseLoc } = userData;
  if (!sheets.faction) return JSON.stringify({ success: false, message: "勢力表不存在" });

  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  // 1. 後端雙重防呆：驗證銀兩與境界
  const currentMoney = parseInt(pcData[pIdx][COL.PC.MONEY]) || 0;
  if (currentMoney < 50000) return JSON.stringify({ success: false, message: "銀兩不足 50000 兩" });

  const currentRealm = pcData[pIdx][COL.PC.REALM] || "凡人";
  if (REALMS.indexOf(currentRealm) < REALMS.indexOf("通玄")) {
    return JSON.stringify({ success: false, message: "境界未達通玄，無法鎮壓宗門氣運！" });
  }

  // 2. 檢查是否撞名
  const currentFactions = sheets.faction.getDataRange().getValues();
  if (currentFactions.some(r => String(r[COL.FACTION.NAME]).trim() === factionName.trim())) {
    return JSON.stringify({ success: false, message: "江湖中已有同名宗門，請另尋霸氣名號！" });
  }

  // 3. 領地邏輯：在當前母區域下，開闢「專屬子地圖」 (例如: 青丘城-天魔教)
  const sectMapName = `${baseLoc}-${factionName}`;

  if (sheets.map) {
    const mapData = sheets.map.getDataRange().getValues();
    if (!mapData.some(m => String(m[COL.MAP.NAME]).trim() === sectMapName)) {
      // 抓取母區域座標，做微微偏移
      let pCoord = "0,0";
      const parentMap = mapData.find(m => String(m[COL.MAP.NAME]).trim() === baseLoc);
      if (parentMap && parentMap[COL.MAP.COORD]) {
        let parts = String(parentMap[COL.MAP.COORD]).split(',');
        let bx = parseInt(parts[0]) || 0; let by = parseInt(parts[1]) || 0;
        pCoord = `${bx + Math.floor(Math.random() * 5) - 2},${by + Math.floor(Math.random() * 5) - 2}`;
      }
      // 寫入《坤圖》：REGION, NAME, TYPE, COORD, DESC, PARENT
      sheets.map.appendRow(["九州", sectMapName, "宗門", pCoord, `『${factionName}』的宗門重地，外設強大護山大陣。宗旨：${motto}`, baseLoc]);
      // 清除地圖快取，讓前端能馬上讀到新宗門
      CacheService.getScriptCache().remove("KYUSHU_MAP_DATA");
    }
  }

  // 4. 扣錢、升官、將玩家傳送到自己的宗門領地
  pcData[pIdx][COL.PC.MONEY] = currentMoney - 50000;
  pcData[pIdx][COL.PC.FACTION] = factionName;
  pcData[pIdx][COL.PC.RANK] = "宗主";
  pcData[pIdx][COL.PC.CONTRIB] = 9999;
  pcData[pIdx][COL.PC.ALIGN] = align;
  pcData[pIdx][COL.PC.LOC] = sectMapName; // 📍 搬家到專屬領地！

  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);

  // 5. 寫入勢力表 (基地位置設為新開闢的地圖)
  const fId = "FAC_" + Date.now();
  const pcName = pcData[pIdx][COL.PC.NAME];
  sheets.faction.appendRow([fId, factionName, align, sectMapName, pcName, motto]);

  // 6. 寫入大勢表 (新勢力給予初始氣運 50)
  updateFactionPower(sheets, factionName, 50, `由通玄境大能『${pcName}』橫空出世創立`);

  // 7. 廣播傳聞與個人史紀
  addRumor(sheets, "FACTION_NEW", sectMapName, factionName);
  if (sheets.epic) {
    sheets.epic.appendRow([pcId, `【開宗立派】修為達「${currentRealm}」，豪擲五萬兩於 ${baseLoc} 開闢福地，創立了「${factionName}」。`, new Date()]);
  }

  return JSON.stringify({ success: true, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}
