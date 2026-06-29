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
  "enter_kanshou": actionEnterKanshou,
  "dev_seed_gallery": actionDevSeedGallery,
  "kanshou_companions": actionKanshouCompanions,
  "kanshou_add": actionKanshouAdd,
  "kanshou_remove": actionKanshouRemove,
  "kanshou_set_sex": actionKanshouSetSex,
  "kanshou_set_name": actionKanshouSetName,
  "prep_meal": actionPrepMeal,
  "inspect_npc": actionInspectNpc,
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
  "blood_supply": actionBloodSupply,
  "bond": actionBond,
  "use_mystic": actionUseMystic,
  "rule_break_steal": actionRuleBreakSteal,
  "propose_alliance": actionProposeAlliance,
  "break_alliance": actionBreakAlliance,
  "ally_bond": actionAllyBond,
  "set_workshop": actionSetWorkshop,
  "scavenge": actionScavenge,
  "second_wind": actionSecondWind,
  "scout": actionScout,
  "clear_npc_major_event": actionClearNpcMajorEvent,
  "get_all_categorized_maps": actionGetAllCategorizedMaps,
  "get_map_nodes": actionGetMapNodes,
  "move": actionMove,
  "sync": actionSync,
  "rest": actionRest,
  "play": actionPlay,
  "get_epic_history": actionGetEpicHistory,
  "leaderboard": actionLeaderboard,
  "war_chronicle": actionWarChronicle,
  "war_history_list": actionWarHistoryList,
  "spare_npc": actionSpareNpc,
  "narrate_only": actionNarrateOnly,
  "multi_attack_narrate": actionMultiAttackNarrate

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
  // 🌹 慾海路由：御主 avatar 以 "KPC_" 開頭 → 整條後日談路徑(actionPlay/sync/move…)改讀「鑑賞眾生」分頁，
  //   與戰爭主表「眾生」完全隔離。solo 御主是 "PC_" 不受影響。
  const isKanshouCtx = String(pcId || "").indexOf("KPC_") === 0;
  const sheets = {
    map: ss.getSheetByName("坤圖"),
    pc: (isKanshouCtx ? getKanshouPcSheet_(ss) : ss.getSheetByName("眾生")), log: ss.getSheetByName("因果"),
    auth: ss.getSheetByName("權柄"),
    rel: ss.getSheetByName("關係"), epic: ss.getSheetByName("史紀")
  };

  const handler = ActionRouter[action];
  if (handler) {
    return handler(userData, pcId, sheets);
  } else {
    return JSON.stringify({ success: false, message: `系統異常：未知的動作指令「${action}」` });
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
  // 🔵 只有「進行中世界(game_id 非空)」的角色才保留名字；DEAD_ 與 game_id 空的孤兒(舊資料/已清局殘留)不佔名。
  //   這同時維持多帳號間「同名活躍御主」的隔離，又讓重開遊戲後自己的舊名可重用。
  const found = pcRows.find(r => r[COL.PC.NAME] === userData.name
    && !String(r[COL.PC.ID]).startsWith("DEAD_")
    && String(r[COL.PC.GAME_ID] || "") !== "");
  return JSON.stringify({ exists: !!found, pcId: found ? found[COL.PC.ID] : null, sex: found ? found[COL.PC.SEX] : "未知" });
}




// 🟢 對同地 NPC 使用丹藥/恢復道具：補血回滿、或單純解去中毒/媚惑等負面狀態








// 🟢 仙府倉庫：取出倉庫清單(只在開啟時讀取，不影響背包格數)

// 🟢 仙府倉庫：把背包道具存入倉庫(裝備中的道具禁止存入)

// 🟢 仙府倉庫：取出道具回背包(受背包格數上限限制)

// 💰 變賣物品給聽風閣（賣價 = price × 0.4，裝備中與定情信物禁止賣）




function actionInspectNpc(userData, pcId, sheets) {
  const targetName = userData.targetName;
  const allPcData = sheets.pc.getDataRange().getValues();
  const npcRow = allPcData.find(r => r[COL.PC.NAME] === targetName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (!npcRow) return JSON.stringify({ success: false, message: "查無此人。" });

  // 🔴 窺探直接成功：偵查動作（物品系統已移除，回傳空清單）
  return JSON.stringify({ success: true, data: [] });
}

// 🟢 索要：需與該 NPC 好感100且已傾心，方可開口要求一件物品，成功直接轉入玩家行囊(受背包上限限制)

// 🟢 要求丟棄：需與該 NPC 好感100且已傾心，方可要求對方丟棄一件物品(物品直接消失，不轉入玩家)

// 🔹 共用：組裝含地點/性格/關係/近期因果的提示詞，避免索要/丟棄敘事出戲
function buildNpcRequestPrompt(sheets, pName, pLoc, npcRow, instructionStr, pRow) {
  const npcName = npcRow[COL.PC.NAME];
  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  const relRow = relData.find(r => r[COL.REL.PC] === pName && r[COL.REL.NPC] === npcName);
  const prefArr = String(npcRow[COL.PC.PREF] || "").split('、');
  const traitArr = String(npcRow[COL.PC.TRAIT] || "").split('、');
  const nickMatch = relRow ? String(relRow[COL.REL.MEMORY] || "").match(/\[專屬稱呼\](.*?)(?=\| \[|$)/) : null;
  const nickStr = (nickMatch && nickMatch[1].trim()) ? ` | 稱呼玩家:${nickMatch[1].trim()}` : "";
  const npcCardStr = `【${npcName}】性格:[表象]${prefArr[0] || "無"} [內裡]${prefArr[1] || "無"} | 特徵:${traitArr[1] || "無"} | 與玩家關係:${relRow ? relRow[COL.REL.TAG] : "萍水相逢"}(好感:${relRow ? relRow[COL.REL.FAV] : 0})${nickStr}`;

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
    `★【鐵律】嚴禁輸出任何 items_gained、items_transferred、money_transferred 或 stat_changes，已結算完畢，重複輸出會導致結算錯亂！\n` +
    `★【在場驗證】本回合在場者僅有${presentStr}，可合理帶到其存在或反應；近期因果中提到的其他姓名均不在場，嚴禁讓其登場、插話或互動！`;
}

// ==========================================
// 🟢 輕量化群組：贈禮 / 補刀處決 / 道具自用 / 妙手空空 / 煉成 / 聽風閣情報
// GAS 直接裁定結果，AI 只負責補一段不出戲的描寫
// ==========================================

// 🟢 贈禮：好感門檻與物品轉移全由 GAS 裁定，AI 只負責寫對方的反應

// 🟢 補刀處決：HP<=5 才能裁定，戰利品/門派氣運結算全由 GAS 完成，AI 只負責寫終結場面

// 🟢 道具自用(非藥水類)：扣除全由 GAS 完成，AI 只負責寫使用特效

// 🟢 妙手空空(指定物品偷竊)：D20 對抗裁定成敗，成功轉移物品，失敗扣好感+扣血當教訓

// 🟢 煉丹/煉器/煉成：必定成功，品級由 D20 查 RARITY_TABLE 裁定(造化綠液入素材=強制20)，AI 只負責想名字/描述與敘事
const CRAFT_QUALITY_BY_ROLL = ["凡品", "凡品", "粗劣", "粗劣", "普通", "普通", "良品", "良品", "精品", "精品", "珍品", "珍品", "稀世", "稀世", "絕世", "絕世", "神器", "神器", "神器", "傳說"];


// 🟢 聽風閣買情報：扣款由 GAS 結構化裁定，AI 只負責想線索內容與敘事



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
  return JSON.stringify({ success: true, statusString: buildPlayerStatusString(row, getCharacterTotalStats(targetId, sheets, allPcData), [], relMem), targetId: targetId, targetSex: row[COL.PC.SEX], canEditFate: canEditFate });
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

  // 🔵 只准改 4 種敘事欄（個性/特徵/身世/萌點）；數值(六圍/迴路/禮裝)與寶具(martial)一律不可改——GAS 掌數值鐵則。
  let targetCol = fateType === 'trait' ? COL.PC.TRAIT : fateType === 'pref' ? COL.PC.PREF : fateType === 'back' ? COL.PC.BACK : fateType === 'intent' ? COL.PC.INTENT : -1;
  if (targetCol === -1) return JSON.stringify({ success: false, message: "此欄位不可修改（只能改個性／特徵／身世／萌點，數值與寶具一律鎖死）。" });
  // 🔴 命格欄位直寫入表格，需自行把關長度：身世/萌點 單格 30；個性/特徵 為 4 格頓號拼接、給較寬上限
  var cap = (fateType === 'back' || fateType === 'intent') ? 30 : 130;
  pcData[pIdx][targetCol] = String(fateValue || "").slice(0, cap);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);

  let relMem = "";
  if (targetId !== pcId && sheets.rel) {
    const rRecord = sheets.rel.getDataRange().getValues().find(r => r[COL.REL.PC] === pcData.find(r => r[COL.PC.ID] == pcId)[COL.PC.NAME] && r[COL.REL.NPC] === pcData[pIdx][COL.PC.NAME]);
    if (rRecord) relMem = rRecord[COL.REL.MEMORY] || "";
  }
  return JSON.stringify({ success: true, statusString: buildPlayerStatusString(pcData[pIdx], getCharacterTotalStats(targetId, sheets, pcData), [], relMem) });
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
    if (sheets.auth) { try { sheets.auth.appendRow([finalName, newId, "御主", "", ""]); } catch (e) { } }
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

  const sysOverride = `你是《命運停駐之夜》的角色生成核心，負責根據${isCreate ? '玩家執念重構前世今生' : '角色原型進行完整重構'}，舞台是現代冬木市的聖杯戰爭。

★【陣營】無明確所屬則 faction 填「無」、rank 填「無所屬」。
★【OOC】已知動漫/虛構角色保留原著個性語癖即可。

★【四格】traits 與 personality 各剛好 4 短句、頓號分隔、禁數字標籤：
- traits：外貌、氣質舉止、自稱與口氣(第一人稱·如 我/俺/吾＋說話語氣，如 自稱「吾」・睥睨王者腔)、卸下心防的私密一面
- personality：日常表象、真實內裡、喜歡的事物、討厭的事物
- npc_intent：令人會心一笑的「可愛弱點/反差萌」一句話，須結合此角色身分性格量身打造。如冷面殺手怕貓、高傲千金愛吃路邊攤、嚴肅學者收藏兔子玩偶、毒舌醫師暈血。要反差、可愛、獨特。

★【輸出】合法 JSON、禁 Markdown：
{${isCreate ? '"start_loc":"出生地",' : ''}"background":"限20字，禁出現具體物品名","traits":"四格頓號字串","personality":"四格頓號字串","con":12,"int":12,"faction":"無","rank":"無所屬","align":"中立","npc_intent":"結合角色身分的獨特可愛反差萌，一句話","start_item":{"name":"與角色強烈相關的隨身之物","desc":"限15字描述"}}`;

  const npcContext = userData.npcContext ? `\n【登場脈絡】：${userData.npcContext.slice(0, 300)}` : "";
  const promptStr = isCreate
    ? `【御主】：名號『${finalName}』，性別『${finalSex}』\n【外貌】：${appearance || "隨機"}\n【身世／財力】：${standing || identity || "隨機"}\n【願望】：${wish || "隨機"}\n【魔術系統】：${magic || "隨機"}\n【出身】：${origin || "隨機"}\n【可選地點(冬木)】：${validMapNames.join('、')}`
    : `【名號】：『${finalName}』\n【性別】：『${finalSex}』\n【地點】：『${currentLoc}』\n【與玩家『${pcNameStr}』初始關係】：『${npcRel || "萍水相逢"}』${npcContext}`;

  // 🔵 御主創角專用 Fate 框架生成提示（NPC 仍走上面的 sysOverride）
  const MASTER_GEN_SYS = `你是《命運停駐之夜》聖杯戰爭的角色生成核心，為玩家建立一位「御主（Master）」——參與第五次聖杯戰爭的現代魔術師，舞台是冬木市。請依玩家提供的姓名、性別、身世／財力、願望，生成合理且具戲劇張力的設定。

★【演出而非說明】願望與身世只作為設定底層，不要在 background 裡直接複述願望字面。
★【四格】traits 與 personality 各剛好 4 短句、頓號分隔、禁數字標籤：
- traits：外貌、氣質舉止、自稱與口氣(第一人稱·如 我/俺/吾＋說話語氣，如 自稱「吾」・睥睨王者腔)、卸下心防的私密一面
- personality：日常表象、真實內裡、喜歡的事物、討厭的事物
★npc_intent：一句【簡短】萌點（可愛反差，≤15字），結合此御主身分性格，要反差、可愛、獨特。
★background：限20字，呼應其身世／財力，禁出現具體物品名。
★start_loc：從冬木地點中選一個合理的居所或起點：${validMapNames.join('、')}
★faction 填御主所屬（魔術協會／教會／無所屬等，無則「無」），rank 填「御主」。
★【勿輸出數值】戰力數值、HP/MP 一律由系統裁定，prompt【不要】輸出 str/con/agi/int/luk 等任何數值欄位。

★【輸出】合法 JSON、禁 Markdown：
{"start_loc":"冬木地點","background":"限20字","traits":"四格頓號字串","personality":"四格頓號字串","faction":"無","rank":"御主","align":"中立","npc_intent":"結合御主身分的獨特可愛反差萌，一句話","start_item":{"name":"與御主相關的隨身之物","desc":"限15字描述"}}`;

  // 🔴 新版：加上 ignoreLaw: true，把節慶跟天氣隔絕在創建室外
  const aiBriefStr = callGeminiAPI(promptStr, isCreate ? MASTER_GEN_SYS : sysOverride, { temperature: 0.6, ignoreLaw: true });
  try {
    const aiBrief = JSON.parse(aiBriefStr);

    // 🎴 FATE：九州境界系統已移除。御主固定凡人級數值；NPC 採 AI 建議耐久/魔力(夾 8~25)，無境界階梯。
    //   HP/MP 由 fateMaxHpMp_ 推算(無倍率)；五圍 STR~LUK 欄已棄、不寫入。
    let nCon, nInt;
    if (isCreate) {
      // 御主(凡人魔術師)初始：10~15 隨機波動
      nCon = Math.floor(Math.random() * 6) + 10;
      nInt = Math.floor(Math.random() * 6) + 10;
    } else {
      // NPC：採 AI 建議數值(預設12)，夾在 8~25
      const clampStat_ = (v) => Math.max(8, Math.min(25, (parseInt(v) || 12)));
      nCon = clampStat_(aiBrief.con);
      nInt = clampStat_(aiBrief.int);
    }
    const maxStats = fateMaxHpMp_(nCon, nInt);

    let spawnName = isCreate ? (aiBrief.start_loc || validMapNames[0]) : currentLoc;
    if (isCreate && !validMapNames.includes(spawnName)) spawnName = validMapNames.find(n => spawnName.includes(n)) || validMapNames[0];

    const pcColCount = Object.keys(COL.PC).length;
    const newRow = Array(pcColCount).fill("");
    newRow[COL.PC.ID] = newId; newRow[COL.PC.NAME] = finalName; newRow[COL.PC.SEX] = finalSex;
    newRow[COL.PC.BACK] = isCreate ? (standing || aiBrief.background || "來歷不明的魔術師") : (aiBrief.background || "來歷不明"); newRow[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "氣息平穩" });
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
      // ✨ 依財力/身世機率給一件招牌禮裝（非 100%；強禮裝吃迴路）
      try {
        const mysticId = rollMysticForMaster_(standing || identity, circuits);
        if (mysticId) newRow[COL.PC.MEMORY] = equipMysticToMemory_(newRow[COL.PC.MEMORY], mysticId);
      } catch (e) { }
    }
    // 經濟層已移除：不再寫入初始銀兩（身世財力差異由起始禮裝體現）
    newRow[COL.PC.TRAIT] = parseTraitsHelper(aiBrief.traits, "外貌平凡、舉止從容、自稱「我」、卸下心防的私密一面");
    newRow[COL.PC.LOC] = spawnName;
    newRow[COL.PC.PREF] = parseTraitsHelper(aiBrief.personality, "溫婉謙和、內斂堅韌、明哲保身、隨波逐流");
    newRow[COL.PC.HP] = maxStats.hp; newRow[COL.PC.MP] = maxStats.mp;
    // 🎴 五圍(STR~LUK)已棄欄：戰鬥吃六圍 SIX，HP/MP 由 fateMaxHpMp_ 算，不再寫數值。
    newRow[COL.PC.MAX_HP] = maxStats.hp; newRow[COL.PC.MAX_MP] = maxStats.mp;
    newRow[COL.PC.REALM] = "";  // 🎴 境界系統已移除，欄位留空
    newRow[COL.PC.FACTION] = aiBrief.faction || "無"; newRow[COL.PC.RANK] = aiBrief.rank || "散人";
    newRow[COL.PC.CONTRIB] = 0; newRow[COL.PC.ALIGN] = aiBrief.align || "絕對中立";
    newRow[COL.PC.INTENT] = String(aiBrief.npc_intent || "").slice(0, 18) || "（待揭曉）";
    newRow[COL.PC.GAME_ID] = gameId;
    sheets.pc.appendRow(newRow);

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

    // 🗑️ 門派自動註冊(registerFactionHelper)已隨九州門派系統移除。

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

      // 六圍 → 顯示數值（數值即 rankVal，無境界倍率）
      const nStr = svNum_(six.筋力), nCon = svNum_(six.耐久), nAgi = svNum_(six.敏捷), nInt = svNum_(six.魔力), nLuk = svNum_(six.幸運);
      const maxStats = fateMaxHpMp_(nCon, nInt);
      // 從者血厚：耐久越高越肉
      const svHp = 300 + svNum_(six.耐久) * 12, svMp = 120 + svNum_(six.魔力) * 6;

      // 🎴 五圍已棄欄：戰鬥吃六圍 SIX，不再寫數值。
      row[COL.PC.HP] = svHp; row[COL.PC.MP] = svMp; row[COL.PC.MAX_HP] = svHp; row[COL.PC.MAX_MP] = svMp;
      row[COL.PC.REALM] = "";
      // 🎴 特徵(4格敘事：外貌/氣質/自稱與口氣/私密)直接讀寫死的種子 persona.look，穩定一致、不叫 AI 生。
      row[COL.PC.TRAIT] = parseTraitsHelper(String(persona.look || ""), "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面");
      // 🚀 種子英靈：直接用寫死的種子 persona（萌點/口吻 v3 已補齊），不再叫 AI 重生一次——省一次 API、加速召喚。
      //    個性取 persona.words(四關鍵)、萌點取 persona.moe、生平用種子既有 back 或職階真名模板。細緻演出靠 servantCard_(codexPersona_) 注入。
      let svPref = String(persona.words || "").replace(/・/g, "、");
      let svMoe = String(persona.moe || "").slice(0, 18);
      let svBack = persona.back ? String(persona.back).slice(0, 28) : `${cls}・${realName}`;
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
★【演出而非說明】personality 與寶具只作底層，勿直接複述字面。personality 剛好 4 短句頓號分隔：日常表象、真實內裡、喜歡的事物、討厭的事物。
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
      // 🎴 五圍已棄欄：戰鬥吃六圍 SIX，不再寫數值。
      row[COL.PC.HP] = svHp; row[COL.PC.MP] = svMp; row[COL.PC.MAX_HP] = svHp; row[COL.PC.MAX_MP] = svMp;
      row[COL.PC.REALM] = "";
      // 🎴 AI 即時生成的原創從者：特徵走通用敘事預設(不再用戰鬥特性污染敘事欄)，玩家可逆天改命微調。
      row[COL.PC.TRAIT] = parseTraitsHelper("", "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面");
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
    row[COL.PC.LOC] = pcLoc;
    row[COL.PC.FACTION] = "從者"; row[COL.PC.RANK] = cls;
    row[COL.PC.CONTRIB] = 0; row[COL.PC.ALIGN] = align;
    row[COL.PC.MARTIAL] = np;
    row[COL.PC.GAME_ID] = gameId;
    sheets.pc.appendRow(row);

    if (sheets.rel) {
      try { sheets.rel.appendRow([pcName, realName, 35, "從者", "同行", "", ""]); } catch (e) { }
    }

    // 🔵 召喚完成 → 鋪敵方御主×從者進這個 game_id 世界（一次性）
    try { seedRivalsForGame_(gameId, realName, warName, playedMaster); } catch (e) { }
    // 📖 戰記開卷：開戰＋召喚
    try { logWarEvent_(gameId, `⚔️ 冬木的聖杯戰爭開幕——御主『${pcName}』以令咒召喚出 ${cls} 職階的從者「${realName}」，締結契約。`, userData.acctName); } catch (e) { }

    // 🎬 召喚登場場景（精簡敘事用，含角色卡；前端純按鈕模式直接 narrate，不走 options 那套）
    const summonPrompt = servantCard_(row) +
      `【召喚登場】御主『${pcName}』剛以令咒召喚出從者「${realName}」（${cls}），兩人初次同處於冬木的夜。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫所在地的燈火與氛圍，聚焦御主與從者最初的試探、對話與張力（依上方角色背景內化演出，禁止複述設定字面、禁止用外貌代替名字）。場景留下懸念、讓玩家想以行動回應。\n` +
      `★禁止替御主做決定、禁止詢問玩家想做什麼、禁止介紹玩家自身身份、禁止新增任何地圖或NPC。`;
    return JSON.stringify({ success: true, servantName: realName, cls: cls, fromCodex: !!hero, summonPrompt: summonPrompt, message: `【聖杯】令咒迸發，${cls} 職階的從者「${realName}」應召而現，與『${pcName}』締結契約。其餘御主已在冬木各處備戰。` });
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
    hpNum: parseInt(m[COL.PC.HP]) || 0, hpMax: parseInt(m[COL.PC.MAX_HP]) || 0,
    mpNum: parseInt(m[COL.PC.MP]) || 0, mpMax: parseInt(m[COL.PC.MAX_MP]) || 0,
    seals: getPlayerSeals_(m[COL.PC.MEMORY]), wish: wish
  };

  // 🗝️ 雙從者：收齊所有在世我方從者（servants 陣列）；servant＝第一個（向後相容）
  let servants = [];
  const relRows = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  pcData.forEach(s => {
    if (String(s[COL.PC.FACTION]) !== "從者" || String(s[COL.PC.GAME_ID] || "") !== gameId || String(s[COL.PC.ID]).startsWith("DEAD_")) return;
    let bond = 0;
    const rel = relRows.find(r => r[COL.REL.PC] === m[COL.PC.NAME] && r[COL.REL.NPC] === s[COL.PC.NAME]);
    if (rel) bond = parseInt(rel[COL.REL.FAV]) || 0;
    let six = {}, skills = [], traits = [];
    try { six = JSON.parse(s[COL.PC.SIX] || "{}"); } catch (e) { }
    try { const tg = JSON.parse(s[COL.PC.TAGS] || "{}"); skills = tg.skills || []; traits = tg.traits || []; } catch (e) { }
    servants.push({
      name: s[COL.PC.NAME], cls: s[COL.PC.RANK] || "從者", sex: s[COL.PC.SEX],
      condition: buildVisibleStatusString(s[COL.PC.STATUS]),
      hp: hpWord(s[COL.PC.HP], s[COL.PC.MAX_HP]),
      hpNum: parseInt(s[COL.PC.HP]) || 0, hpMax: parseInt(s[COL.PC.MAX_HP]) || 0,
      mpNum: parseInt(s[COL.PC.MP]) || 0, mpMax: parseInt(s[COL.PC.MAX_MP]) || 0,
      np: s[COL.PC.MARTIAL] || "寶具未顯現", bond: bond,
      six: six, skills: skills, traits: traits,
      pref: s[COL.PC.PREF] || "", physical: s[COL.PC.PHYSICAL] || "{}", // 🌹 慾海卡用：個性/肉體
      stolen: /【破戒奪取】/.test(String(s[COL.PC.MEMORY] || ""))
    });
  });
  let servant = servants[0] || null;
  // 💠 供魔收支（左側狀態卡顯示用）：僅正式聖杯戰爭世界算
  var economy = (gameId && gameId.indexOf("g_") === 0) ? playerServantEconomy_(sheets, pcId) : null;
  // 💕 今日已用過的羈絆互動（前端用來灰掉按鈕）
  var bondUsed = [];
  if (gameId && gameId.indexOf("g_") === 0) {
    try { var bclk = getClock_(gameId); bondUsed = getBondUsedToday_(m[COL.PC.MEMORY], bclk ? bclk.day : 1); } catch (e) { }
  }
  // ✨ 禮裝（御主裝備槽）
  var mystic = null;
  try {
    var mid = getMystic_(m[COL.PC.MEMORY]);
    if (mid && MYSTIC_CODES[mid]) {
      var mc = MYSTIC_CODES[mid];
      var ch = getMysticCharges_(m[COL.PC.MEMORY]); if (ch < 0) ch = mc.charges;
      mystic = { id: mid, name: mc.name, type: mc.type, desc: mc.desc, req: mc.req, charges: ch, target: mc.target };
    }
  } catch (e) { }
  // 🗝️ 破戒之力（前端決定是否顯示「破戒奪僕」按鈕）：限正式聖杯戰爭世界
  var canRB = false;
  try { if (gameId && gameId.indexOf("g_") === 0) { var pIdxRB = pcData.findIndex(r => r[COL.PC.ID] == pcId); if (pIdxRB >= 0) canRB = canRuleBreak_(pcData, pIdxRB, gameId); } } catch (e) { }
  return JSON.stringify({ success: true, master: master, servant: servant, servants: servants, economy: economy, bondUsed: bondUsed, mystic: mystic, canRuleBreak: canRB, servantSlots: servants.length });
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
    // 🤝 情報共享：有在世盟友時，盟友通報敵蹤——無視戰爭迷霧，全圖敵人位置揭露
    const allyIntel = hasAllyInGame_(pcData, myGameId);
    const enemyAt = {};
    pcData.slice(1).forEach(r => {
      const fac = String(r[COL.PC.FACTION]);
      if (fac !== "敵御主" && fac !== "敵從者") return;
      if (myGameId && String(r[COL.PC.GAME_ID] || "") !== myGameId) return;
      if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
      if (!r[COL.PC.SEEN] && !allyIntel) return;
      if (isAllied_(r)) return; // 盟友自身不列為敵蹤
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
    return JSON.stringify({ success: true, nodes: nodes, here: myLoc, allyIntel: allyIntel });
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
  const allyIntelMap = hasAllyInGame_(allPcData, myGameIdMap); // 🤝 有盟友→敵蹤全揭露
  const locCount = {};
  allPcData.slice(1).forEach(r => {
    const id = String(r[COL.PC.ID]);
    if (id.startsWith("DEAD_")) return;
    if (myGameIdMap && String(r[COL.PC.GAME_ID] || "") !== myGameIdMap) return;
    const facM = String(r[COL.PC.FACTION]);
    if ((facM === "敵御主" || facM === "敵從者") && !r[COL.PC.SEEN] && !allyIntelMap) return; // 🔵 戰爭迷霧：未偵查到的敵人不在地圖顯示（🤝 有盟友通報則揭露）
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
  let allPcData = sheets.pc.getDataRange().getValues();
  let pIdx = allPcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  // ⏳ 行動點檢查（移動耗 2 AP＝2 小時；鑑賞 k_ 不耗 AP）
  const moveGameId = String(allPcData[pIdx][COL.PC.GAME_ID] || "");
  const isFateMove = moveGameId.indexOf("g_") === 0;
  if (isFateMove && getAp_(moveGameId) < 2) {
    return JSON.stringify({ success: false, message: "行動力不足以遠行（需 2 點）——請『休息』恢復後再出發。", clock: clockLabel_(moveGameId), ap: getAp_(moveGameId), apMax: AP_PER_DAY });
  }

  // 🎭 抵達態度判定（趁世界尚未 tick，看 target 此刻是否「已有先客」）：
  //   先客在＝玩家主動找上門(對方在自己地盤、會警惕戒備)；無＝偶遇(雙方恰巧撞上、都帶幾分意外)。
  const tgtTrim = String(target || "").trim();
  const preFoesAtTarget = allPcData.filter(r =>
    (String(r[COL.PC.FACTION]) === "敵御主" || String(r[COL.PC.FACTION]) === "敵從者")
    && (!moveGameId || String(r[COL.PC.GAME_ID] || "") === moveGameId)
    && !String(r[COL.PC.ID]).startsWith("DEAD_")
    && String(r[COL.PC.LOC] || "").trim() === tgtTrim
  ).map(r => String(r[COL.PC.NAME]));

  // 🌍 世界先動，玩家後到：先讓敵御主／敵從者 tick 到各自的新位置，再把玩家落到 target——
  //   這樣「追到敵人所在地」時，敵人不會在你踏進來的同一瞬間又被傳走（修：撞在一起卻沒對話）。
  //   敵人就位後才讀同地資料給 AI，這一輪它們鎖在原地，遭遇敘事才跑得起來。
  let clockLabel = "", worldRumors = [], apLeft = AP_PER_DAY, moveVictory = false;
  if (isFateMove) {
    try {
      const sp = spendAp_(moveGameId, 2);
      apLeft = sp.ap;
      const tick = worldTick_(sheets, moveGameId, target, 1, false); // 移動只讓敵換位，不死人；但令咒透支倒數可能到期收尾
      worldRumors = tick.rumors || [];
      moveVictory = !!tick.victory;
      try { const ab = breakStaleAlliances_(sheets, moveGameId); if (ab.broken.length) worldRumors.push(`〔盟約${ab.forced ? '瓦解' : '到期'}〕你與「${ab.broken.join('、')}」的同盟已${ab.forced ? '因戰局逼近終局而破裂——最後只能剩一個' : '到期失效'}，重回敵對。`); } catch (e) { }
      clockLabel = clockLabel_(moveGameId);
    } catch (e) { }
  }

  // 🔁 敵人已 tick 就位 → 重讀眾生，再把玩家(與同行從者)落到 target，避免用舊資料覆蓋掉剛剛的敵方移動
  allPcData = sheets.pc.getDataRange().getValues();
  pIdx = allPcData.findIndex(r => r[COL.PC.ID] == pcId);
  allPcData[pIdx][COL.PC.LOC] = target;
  const pcName = allPcData[pIdx][COL.PC.NAME];
  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];

  relData.filter(r => r[COL.REL.PC] === pcName && r[COL.REL.IS_PARTY] === "同行").map(r => r[COL.REL.NPC]).forEach(npcName => {
    const nIdx = allPcData.findIndex(r => r[COL.PC.NAME] === npcName && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!moveGameId || String(r[COL.PC.GAME_ID] || "") === moveGameId));
    if (nIdx !== -1) allPcData[nIdx][COL.PC.LOC] = target;
  });

  // ⏳ 時回：移動的 2 小時間，御主與同行從者隨時間自然回復（HP 固定、MP 看魔術迴路）。
  //   大幅恢復靠「休息」（同一套規則 ×2）。便宜：只改記憶體那幾格，隨移動一起寫回，零額外讀寫，不會變慢。
  let regenNote = "";
  if (isFateMove) {
    const partyNames = relData.filter(r => r[COL.REL.PC] === pcName && r[COL.REL.IS_PARTY] === "同行").map(r => r[COL.REL.NPC]);
    const homeLoc = playerHomeLoc_(sheets, pcId);
    const did = applyRegen_(allPcData, moveGameId, pcName, partyNames, masterCircuits_(allPcData[pIdx]), 2, 1, sheets, target, homeLoc);
    if (did) regenNote = "〔時回〕數小時的奔波之間，靈基與魔力隨時間悄然回流了一些。";
  }
  if (regenNote) worldRumors.unshift(regenNote);

  const pcColCount = Object.keys(COL.PC).length;
  allPcData.forEach(row => { while (row.length < pcColCount) { row.push(""); } });

  sheets.pc.getRange(1, 1, allPcData.length, pcColCount).setValues(allPcData);
  SpreadsheetApp.flush();

  try { markRivalsSeen_(sheets, pcId); } catch (e) { } // 🔵 抵達即偵查到此地敵人（世界 tick 後再揭一次）

  // 📜 正典插針：抵達後依【戰爭】×路線×日×時段×地點檢查正史橋段（自然浮現路線、世界事件、引導）
  let canonBeats = [], canonLeads = [];
  if (isFateMove) { try { const cp = checkCanonPins_(sheets, pcId); canonBeats = cp.beats || []; canonLeads = cp.leads || []; } catch (e) { } }

  const freshMapData = sheets.map.getDataRange().getValues();
  const rootTarget = target ? String(target).split('-')[0].trim() : "";
  const parentMapInfo = freshMapData.find(m => String(m[COL.MAP.NAME]).trim() === rootTarget);
  const subMapInfo = (target !== rootTarget) ? freshMapData.find(m => String(m[COL.MAP.NAME]).trim() === target) : null;
  let mapDesc = parentMapInfo ? `【母區域：${rootTarget}】${parentMapInfo[COL.MAP.DESC]}` : "此處荒煙蔓草，並未記載於輿圖之中。";
  if (subMapInfo) mapDesc += `\n【當前分支：${target}】${subMapInfo[COL.MAP.DESC]}`;

  // 🎭 隨行從者的「演出依據」卡（含狂化禁言/口吻），供前端抵達敘事讓從者真的在場、有反應，不是御主獨白
  var svIdxMove = findPlayerServantIdx_(allPcData, moveGameId, userData.servant);
  var svCardMove = svIdxMove !== -1 ? servantCard_(allPcData[svIdxMove]) : "";

  return JSON.stringify({
    success: true,
    servantCard: svCardMove,
    preFoes: preFoesAtTarget,
    victory: moveVictory,
    statusString: buildPlayerStatusString(allPcData[pIdx], getCharacterTotalStats(pcId, sheets, allPcData), []),
    people: getLocalPeopleList(sheets, pcName, pcId, target, relData, sheets.task ? sheets.task.getDataRange().getValues() : []),
    locations: getNearbyLocations(target, freshMapData).slice(0, 5),
    mapDesc: mapDesc,
    parentRegion: rootTarget,
    clock: clockLabel,
    ap: apLeft,
    apMax: AP_PER_DAY,
    rumors: worldRumors,
    canonBeats: canonBeats,
    canonLeads: canonLeads,
    economy: isFateMove ? playerServantEconomy_(sheets, pcId) : null
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
    statusString: buildPlayerStatusString(allPcData[pcIndex], getCharacterTotalStats(pcId, sheets, allPcData), []),
    people: getLocalPeopleList(sheets, allPcData[pcIndex][COL.PC.NAME], pcId, curL, sheets.rel ? sheets.rel.getDataRange().getValues() : [], sheets.task ? sheets.task.getDataRange().getValues() : []),
    locations: getNearbyLocations(curL, freshMapData),
    mapDesc: currentMapInfo ? currentMapInfo[COL.MAP.DESC] : "四下靜謐。",
    clock: syncClock,
    ap: syncAp,
    apMax: AP_PER_DAY,
    economy: (syncGameId && syncGameId.indexOf("g_") === 0) ? playerServantEconomy_(sheets, pcId) : null
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

  // 🛏️ FATE 休息：玩家自選時數（1/3/6…），每小時補 2 AP；回血回魔＝時回同一套規則 ×2（休息＝雙倍恢復）。
  if (isFateRest) {
    const restHours = Math.max(1, Math.min(12, parseInt(userData.restHours) || 6));
    const prevHp = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
    const hpMaxP = parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 0;
    const wasInjured = prevHp < hpMaxP;
    let healedNames = [pcName];
    const partyNames = [];
    if (sheets.rel) {
      sheets.rel.getDataRange().getValues().filter(r => r[COL.REL.PC] === pcName && r[COL.REL.IS_PARTY] === "同行").map(r => r[COL.REL.NPC]).forEach(npcName => {
        const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === npcName && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!restGameId || String(r[COL.PC.GAME_ID] || "") === restGameId));
        if (nIdx !== -1 && parseInt(pcData[nIdx][COL.PC.HP]) > 0) { partyNames.push(npcName); healedNames.push(npcName); }
      });
    }
    // 時回 ×2：休息 restHours 小時的回復（HP 自我修復；MP 走魔力收支經濟，休息把收入加倍）
    applyRegen_(pcData, restGameId, pcName, partyNames, masterCircuits_(pcData[pIdx]), restHours, 2, sheets, pcLoc, playerHomeLoc_(sheets, pcId));
    // 休滿（HP 回到上限）者重置體態為平穩
    [pIdx].concat(partyNames.map(n => pcData.findIndex(r => r[COL.PC.NAME] === n && String(r[COL.PC.GAME_ID] || "") === restGameId && !String(r[COL.PC.ID]).startsWith("DEAD_")))).forEach(idx => {
      if (idx >= 0 && (parseInt(pcData[idx][COL.PC.HP]) || 0) >= (parseInt(pcData[idx][COL.PC.MAX_HP]) || 0)) pcData[idx][COL.PC.STATUS] = normalStatus;
    });
    sheets.pc.getRange(1, 1, pcData.length, pcData[0].length).setValues(pcData);

    let restClock = "", restRumors = [], apAfter = AP_PER_DAY, restVictory = false;
    try {
      const clk = restHours_(restGameId, restHours);
      apAfter = clk ? clk.ap : AP_PER_DAY;
      const rounds = Math.floor(restHours / 3); // 1h:0、3h:1、6h:2 輪世界自走
      if (rounds > 0) { const tick = worldTick_(sheets, restGameId, pcLoc, rounds, true); restRumors = tick.rumors || []; restVictory = !!tick.victory; }
      restClock = clockLabel_(restGameId);
    } catch (e) { }
    try { sheets.log.appendRow([new Date(), pcId, `【系統】御主一行休息了 ${restHours} 小時，恢復行動力。`, pcLoc]); } catch (e) { }
    // ⚔️ 卸防突襲：當敵蹤同地時休息＝酣睡門戶大開，最為兇險（mul 1.5）
    const restAmbush = enemyAmbushOnServant_(sheets, pcData, pIdx, restGameId, userData, 1.5);
    // 🌙 從者之夢（回想）：安睡(≥3h)且未遭突襲時，有機會順著聯繫夢見從者生前傳說的片段，加深羈絆
    let restDreamPrompt = "";
    if (!restAmbush && restHours >= 3) {
      const svRow = pcData.find(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === restGameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
      if (svRow && Math.random() < 0.55) {
        const dSvName = String(svRow[COL.PC.NAME]);
        try { raiseBond_(sheets, pcName, dSvName, 3); } catch (e) { }
        restDreamPrompt = servantCard_(svRow) +
          `【系統·從者之夢·回想】御主沉沉睡去，意識卻順著與從者的靈魂聯繫，墜入「${dSvName}」成為英靈之前的記憶長河——夢見其傳說中的一個片段。\n` +
          `★以 Fate／TYPE-MOON 筆觸，用夢境／回想的朦朧史詩質感，演出「${dSvName}」這名英靈生前傳說裡的某一幕（取材自其真實的神話／史實／傳說：其榮光、抉擇、孤獨或傷痕）。讓御主（與玩家）窺見這名英靈所背負的過往與信念。\n` +
          `★【show, don't tell】以畫面與情境流露，不直接點破其願望或心結，停在夢醒前的餘韻與一絲說不清的悸動。\n` +
          ``;
      }
    }
    // 📜 正典插針：休息推進時間（可能跨日）後檢查正史橋段
    let restBeats = [], restLeads = [];
    try { const cp = checkCanonPins_(sheets, pcId); restBeats = cp.beats || []; restLeads = cp.leads || []; } catch (e) { }
    let restAmbushPrompt = "";
    if (restAmbush) {
      restAmbushPrompt = `【系統·歇息遭夜襲·已裁定】御主一行於「${pcLoc}」歇息、防備最鬆懈時，潛伏同地的敵從者「${restAmbush.enemyName}」${restAmbush.stealthy ? '自暗影無聲摸近' : '趁夜殺到'}，一擊重創「${(pcData.find(r=>String(r[COL.PC.FACTION])==='從者'&&String(r[COL.PC.GAME_ID]||'')===restGameId)||[])[COL.PC.NAME]||'從者'}」（−${restAmbush.dmg}）${restAmbush.destroyed ? '，其靈基崩潰、化作光點消散，御主敗北' : ''}。★以 Fate／TYPE-MOON 筆觸描寫酣息被夜襲撕裂的驚變（語氣留白），勝負已由系統結算。★【鐵律】嚴禁輸出 stat_changes、items_gained、money_transferred。`;
    }
    return JSON.stringify({
      success: true, statusString: getFreshStatusString(pcId, pIdx, sheets), healedNames: healedNames,
      loc: pcLoc, wasInjured: wasInjured, restHours: restHours, clock: restClock, ap: apAfter, apMax: AP_PER_DAY, rumors: restRumors,
      canonBeats: restBeats, canonLeads: restLeads,
      ambush: !!restAmbush, defeat: restAmbush ? restAmbush.defeat : false, dreamPrompt: restAmbush ? restAmbush.dreamPrompt : "", ambushPrompt: restAmbushPrompt,
      servantDream: restDreamPrompt,
      victory: restVictory && !(restAmbush && restAmbush.defeat),
      economy: playerServantEconomy_(sheets, pcId)
    });
  }

  // ── 以下為非 FATE（九州）舊版休養：全回滿（經濟層已移除，不再收費）──
  let healedNames = [pcName];
  const pMax = maxStatsForRow_(pcData[pIdx]);
  const prevHp = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
  const wasInjured = prevHp < pMax.hp;
  pcData[pIdx][COL.PC.MAX_HP] = pMax.hp; pcData[pIdx][COL.PC.MAX_MP] = pMax.mp;
  pcData[pIdx][COL.PC.HP] = pMax.hp; pcData[pIdx][COL.PC.MP] = pMax.mp;
  pcData[pIdx][COL.PC.STATUS] = normalStatus;

  if (sheets.rel) {
    sheets.rel.getDataRange().getValues().filter(r => r[COL.REL.PC] === pcName && r[COL.REL.IS_PARTY] === "同行").map(r => r[COL.REL.NPC]).forEach(npcName => {
      const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === npcName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
      if (nIdx !== -1 && pcData[nIdx][COL.PC.STATUS] !== "屍體" && parseInt(pcData[nIdx][COL.PC.HP]) > 0) {
        const nMax = maxStatsForRow_(pcData[nIdx]);
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
  sheets.log.appendRow([new Date(), pcId, `【系統】${healedNames.join("與")} 就地休養，狀態回歸平穩。`, pcData[pIdx][COL.PC.LOC]]);
  return JSON.stringify({
    success: true, statusString: getFreshStatusString(pcId, pIdx, sheets), healedNames: healedNames,
    loc: pcLoc, wasInjured: wasInjured, bystanderNames: bystanderNames
  });
}



// ==========================================
// 📜 全新 MMO 級飛書系統 (支援夾帶物品與刪除，完美兼容 NPC)
// ==========================================
// 🔵 信件/賭場/生活/店鋪等九州系統已於 FATE 移除（檔案與 router 註冊一併刪除）。









// ==========================================
// ★ 主遊戲邏輯 (PLAY) 
// ==========================================
function actionPlay(userData, pcId, sheets) {
  const userMsg = userData.message;
  // 🌹 慾海(KPC_ 御主)＝NSFW 後日談軌，一律當 NSFW：否則 intimacy/肉體/衣服狀態整段不回填。
  //   不再依賴前端開關(會被快取/忘了開)。solo 仍純看 userData.isNsfw(預設 SFW)。
  const isNsfwMode = userData.isNsfw || String(pcId || "").indexOf("KPC_") === 0;
  const finalUserMsg = `【玩家意圖】：${userMsg}`;

  const formatPref = (str) => {
    let arr = String(str || "").split('、');
    // 喜好與厭惡是常態情報，全面開放給 AI 參考
    return `[表象]${arr[0] || "無"} [內裡]${arr[1] || "無"} [喜歡]${arr[2] || "無"} [討厭]${arr[3] || "無"}`;
  };

  const formatTrait = (str) => {
    let arr = String(str || "").split('、');
    let base = `[外貌]${arr[0] || "無"} [氣質舉止]${arr[1] || "無"} [自稱]${arr[2] || "無"}`;
    return isNsfwMode ? `${base} [卸下心防的私密一面]${arr[3] || "無"}` : base;
  };


  let pcData = sheets.pc.getDataRange().getValues();
  let relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];

  const pcIndex = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pcIndex === -1) return "查無此人";
  const pc = pcData[pcIndex];
  const pcName = pc[COL.PC.NAME];
  let curL = pc[COL.PC.LOC];



  let isRelChanged = false;
  let knockedOutList = [];
  let justRevived = false;
  let fatePlayerDefeat = false, fateDreamPrompt = ""; // 🔵 FATE：御主血歸 0＝聖杯戰爭敗北（虛假之夢→老虎道場）
  let soulBoundEventMsg = "";
  let freshlyBoundNpcName = "";
  const dirtyPcRows = new Set();
  // 玩家本人一定會被處理到，先加進去
  dirtyPcRows.add(pcIndex);



  // 🔴 只讀一次 log，後面兩處共用；改為只讀最近2000筆，避免歷史成長後每回合全表讀取拖慢
  const allLogs = readRecentLogRows(sheets.log, 2000);

  const history = pickRelevantLogs(allLogs.filter(r => String(r[2]).includes(pcName)), 12).map(r => r[2]).join("\n");
  const pTotal = getCharacterTotalStats(pcId, sheets, pcData, []);
  const currentAmbition = pc[COL.PC.INTENT] ? String(pc[COL.PC.INTENT]).trim() : "尚無明確目標，隨遇而安。";

  const partyMembers = relData.filter(r => r[COL.REL.PC] === pcName && r[COL.REL.IS_PARTY] === "同行").map(r => r[COL.REL.NPC]);
  let partyDetailsArr = [];
  partyMembers.forEach(pName => {
    const r = pcData.find(row => String(row[COL.PC.NAME]).trim() === String(pName).trim() && !String(row[COL.PC.ID]).startsWith("DEAD_"));
    if (r) {
      const nTotal = getCharacterTotalStats(r[COL.PC.ID], sheets, pcData, []);
      const relRecord = relData.find(row => row[COL.REL.PC] === pcName && row[COL.REL.NPC] === pName);
      partyDetailsArr.push(`【同行夥伴】名號:${pName} | 氣血:${r[COL.PC.HP]}/${nTotal.maxHp} | 身世:${r[COL.PC.BACK] || "無"} | 狀態:${r[COL.PC.STATUS]} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])} | 關係:${relRecord ? relRecord[COL.REL.TAG] : "結伴同行"}(好感:${relRecord ? relRecord[COL.REL.FAV] : 0})`);
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
      resistPrompt = "【死仇】恨之入骨，見面即強烈敵意，玩家稍有挑釁便主動出手、下手狠辣。但須符合其身分性格，勝負由雙方實力裁決，非無條件秒殺。";
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

    return `${identityTag}名號:${r[COL.PC.NAME]} 【性別:${r[COL.PC.SEX]}】 陣營:${r[COL.PC.FACTION] || "無"} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])} | 關係:${relRecord ? relRecord[COL.REL.TAG] : "萍水相逢"}(好感:${currentFav}${majorEventStr} -> 行為準則:${resistPrompt})`;
  }).join("\n") : "此地四下無人。";

  if (isNsfwMode) {
    PROMPT_ENV = `【感知屏蔽】：外界感知已封鎖。請專注於當下空間氛圍與私密互動。`;
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
      nsfwMemories += `\n[${r[COL.PC.NAME]} 狀態]：${buildVisibleStatusString(r[COL.PC.STATUS])}\n[${r[COL.PC.NAME]} 肉體]：${JSON.stringify(npcPhysicalObj)}\n[快照]：[技巧]${npcSkills} | [羈絆]${relMem} | [萌點]${r[COL.PC.INTENT] || "無"}`;
    });

    PROMPT_REL = `【當前同地人物】\n${localSceneStr}\n★【情境延續鐵律】：請繼續往後推演！${nsfwMemories}${thirdPartyStr}${genderHintStr}
🛑【絕對禁止 OOC 倒貼鐵律】：NPC 必須【死守】其「性格」與「好感度」！
若好感度未滿 80，或性格屬於冷酷/高傲/剛烈，【絕對禁止】主動迎合、發情或瞬間屈服！必須表現出強烈的抗拒、屈辱、咬牙切齒或冷嘲熱諷。即便肉體有生理反應，靈魂與對話也必須是硬氣且具攻擊性的！違者判定錯亂！`;

  } else {
    // 🎴 solo(SFW)：九州傳聞/勢力/我的家系統已移除，環境欄留空，只給寶具與在場人物。
    PROMPT_ENV = "";
    PROMPT_GEAR = `【寶具／技藝】：${pcData[pcIndex][COL.PC.MARTIAL] || "尚無"}`;
    PROMPT_REL = `【當前同地人物】\n${localSceneStr}${thirdPartyStr}`;
  }

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

      return `- 【${tName}】目前位置:${r[COL.PC.LOC] || "未知"} | 身世:${r[COL.PC.BACK] || "無"} | 性格:${formatPref(r[COL.PC.PREF])} | 玩家與其羈絆:${relTag}(好感:${currentFav})`;
    });

    remoteNpcStr = `\n★【話題人物情報 (遠端/未現身)】：\n玩家在對話中提到了以下不在場的角色。請依據這些真實情報，讓在場的 NPC 給出符合其自身性格與人生閱歷的合理反應（例如：八卦傳聞、敬畏評價、仇恨、或是單純表示不認識）。\n${remoteDetails.join("\n")}\n🛑【鐵律】：以上話題人物【絕對不在場】，嚴禁描寫他們當場現身、開口說話或與玩家產生直接互動！違者敘事錯亂！`;
  }




  const npcDialoguePrompt = displayPeople.length > 0 ? `\n★【對話點名】：若有對話意圖，請包含「${displayPeople.map(r => r[COL.PC.NAME]).join("、")}」的對話。` : "";


  // 🔴【替換開始】淨化後的 prompt 組裝
  const prompt = `【敘事法旨】：當前推演視角鎖定為玩家『${pcName}』(ID: ${pcId})。
${PROMPT_PARTY_SYSTEM}
【玩家命格】：名號:${pcName} 【性別:${pc[COL.PC.SEX]}】 性格:${pc[COL.PC.PREF]} | 特徵:${pc[COL.PC.TRAIT]} | 軟肋:【 ${currentAmbition} 】 | 身世:${pc[COL.PC.BACK] || "來歷不明"} | 位置:${curL} | 狀態:${pc[COL.PC.STATUS] || "氣息平穩"} | 生命:${pc[COL.PC.HP]}/${pc[COL.PC.MAX_HP]} | 魔力:${pc[COL.PC.MP]}/${pc[COL.PC.MAX_MP]}

${PROMPT_ENV}
${PROMPT_GEAR}

【前塵因果】：(此為歷史輪廓，僅供背景參考，請勿當作新事件重複描寫！其中提到的人物，若不在下方【當前同地人物】名單內，純屬「回憶」，本回合絕對禁止讓其現身、開口或互動！)
${history}
${localHistoryStr}

${PROMPT_REL}
${remoteNpcStr}
★【在場驗證鐵律——最高優先級，下筆前必看】：本回合可登場、說話、互動的角色，僅限【目前同行隊伍成員】、緊鄰上方【當前同地人物】清單列出之人，${isNsfwMode ? "本回合為慾海模式(私密場景已隔絕外界)，【絕對禁止】由AI自行安排任何全新陌生人登場打斷或闖入；唯獨玩家本回合輸入內容【明確主動】表達邀請、招呼、引入第三人等意圖時(如呼喚他人加入、開門讓人進來等)，才可讓該玩家指定或暗示的新角色登場，AI不得自作主張額外加碼安排其他陌生人" : "以及AI當下【全新初次原創】、從未出現於前塵因果/歷史紀錄/話題情報中的陌生角色(如路人、店家、新面孔，可正常開口說話、給予姓名)"}！前塵因果、歷史紀錄、話題情報中提到的「已知但不在此清單內」之姓名，才視為不在場的回憶，嚴禁無視「同地」設定憑空召喚、穿越或讓其開口說話、出手！若【當前同地人物】顯示「此地四下無人」，本回合除玩家、同行夥伴${isNsfwMode ? "、以及玩家本回合主動引入之人" : "、與全新原創的陌生人"}外，不可讓任何${isNsfwMode ? "" : "「歷史已知」"}具名角色登場！
${isKanshou ? "" : `
★【系統底層防呆·戰鬥雙向裁決】：發生衝突時綜合比對雙方靈基/實力/環境/戰術公平裁決，禁止單方面秒殺玩家；傷害以相對扣血呈現，允許玩家受傷/纏鬥/撤退/奇謀逆襲；惟聖杯戰爭的從者廝殺一律由系統按鈕裁決，敘述不得自行宣告死亡或輸出生命數值變化。
`}
${isKanshou ? `
💕【鑑賞·後日談模式·最高優先級覆寫】：聖杯戰爭【早已落幕】，這是奪得聖杯後與從者『${displayPeople.length ? displayPeople.map(r => r[COL.PC.NAME]).join("、") : "你的從者"}』共度的【和平日常／約會時光】。
★【絕對禁止】任何戰鬥、廝殺、敵人、敵御主、敵從者、聖杯爭奪、靈基受損、血量／生命變化、寶具對轟、死亡或威脅。世界是安全的。
★氛圍＝溫柔、悠閒、戀愛向的日常：散步、閒聊、吃東西、看風景、逛冬木街景。讓從者貼近其官方性格自然地與御主相處互動。
★【演出而非說明】不得直述其願望／萌點／個性字面。嚴禁輸出任何 stat_changes 生命變化、items_lost、戰鬥裁決。可有 rel_changes(好感)。
★敘事結束停在溫柔的留白，把下一步交還御主。
` : ""}現在演化玩家動作：『${finalUserMsg}』${npcDialoguePrompt}

🚨【敘事終極警告】：
1. 敘事必須在給出結果後，停在「我」的心境，將下一步交還玩家選擇！
2.【名字提取鐵律】：在輸出 stat_changes 或 rel_changes 等任何 JSON 數據時，'target' 或 'npc' 欄位【絕對只能】填寫角色的「真實姓名」（例如：「遠坂凜」）或「自己」。❌嚴禁填入台詞、對話、地名、動作描述或任何標點符號！若名字抓取錯誤將導致解析錯亂！`;

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
        CacheService.getScriptCache().remove("FATE_MAP_DATA");
      }
    }

    // 🗑️ AI 自動生成門派(new_factions / registerFactionHelper)已隨九州門派系統移除。

    if (aiData.events && Array.isArray(aiData.events) && sheets.epic) aiData.events.forEach(ev => { sheets.epic.appendRow([pcId, String(ev).trim(), new Date()]); });

    // 🗑️ 天命/任務(QUEST) 系統已棄用：不再解析 aiData.quests。

    // 🔴 血量快照：記錄所有人變化前的血量，供結尾比對真實扣血
    const hpSnapshot = {};
    pcData.forEach((row, idx) => {
      if (idx === 0) return;
      if (String(row[COL.PC.ID] || "").startsWith("DEAD_")) return;
      hpSnapshot[idx] = parseInt(row[COL.PC.HP]) || 0;
    });
    const mpBefore = parseInt(pcData[pcIndex][COL.PC.MP]) || 0;


    if (aiData.stat_changes && Array.isArray(aiData.stat_changes)) {
      Logger.log("stat_changes: " + JSON.stringify(aiData.stat_changes));


      const attrMap = { "生命": COL.PC.HP, "魔力": COL.PC.MP, "位置": COL.PC.LOC, "陣營": COL.PC.ALIGN, "立場": COL.PC.ALIGN, "貢獻度": COL.PC.CONTRIB, "貢獻": COL.PC.CONTRIB, "身世": COL.PC.BACK };
      const visibleStateKeys = ["衣服", "姿勢", "負面", "顏面"];

      aiData.stat_changes.forEach(sc => {
        const tName = String(sc.target).trim(); const attrKey = String(sc.attr).trim(); const valStr = String(sc.value).trim();
        let targetIdx = (tName === "自己" || tName === String(pcName).trim()) ? pcIndex : pcData.findIndex(r => (String(r[COL.PC.NAME]).trim() === tName || String(r[COL.PC.ID]).trim() === tName) && (!myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId));

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
            } else if ([COL.PC.HP, COL.PC.MP, COL.PC.CONTRIB].includes(colIdx)) {
              let numCurrent = parseInt(pcData[targetIdx][colIdx]) || 0;
              let numNew = (valStr.startsWith("+") || valStr.startsWith("-")) ? numCurrent + parseInt(valStr) : parseInt(valStr);
              if (isNaN(numNew)) numNew = numCurrent; // 🔴 防呆：NaN就維持原值

              if (colIdx === COL.PC.CONTRIB) pcData[targetIdx][colIdx] = Math.max(0, numNew);
              else if (colIdx === COL.PC.HP || colIdx === COL.PC.MP) {
                let hpVal = Math.min(parseInt(pcData[targetIdx][colIdx === COL.PC.HP ? COL.PC.MAX_HP : COL.PC.MAX_MP]) || 100, numNew);
                hpVal = Math.max(0, hpVal); // 🔴 防 AI 輸出負數導致顯示亂碼
                pcData[targetIdx][colIdx] = hpVal;

                const isPlayer = String(pcData[targetIdx][COL.PC.ID]).startsWith("PC_");

                // 玩家：血歸 0
                if (colIdx === COL.PC.HP && hpVal <= 0 && isPlayer) {
                  const isFateG = myGameId && myGameId.indexOf('g_') === 0; // 正式聖杯戰爭世界（k_ 鑑賞約會不會走戰鬥/死亡）
                  if (isFateG && targetIdx === pcIndex) {
                    // 🔵 FATE 敗北：御主殞命＝聖杯戰爭落敗。不復活、不送藥鋪——墜入「願望實現的虛假之夢」→ 老虎道場。
                    pcData[targetIdx][COL.PC.HP] = 0;
                    pcData[targetIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "浴血", "姿勢": "頹然倒臥", "負面": "靈魂將熄", "顏面": "意識朦朧" });
                    fatePlayerDefeat = true;
                    const wishM = String(pcData[pcIndex][COL.PC.MEMORY] || "").match(/【願望】([^|【\n]*)/);
                    const wishTxt = wishM ? wishM[1].trim() : "";
                    let svName = "從者";
                    const svRow = pcData.find(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
                    if (svRow) svName = String(svRow[COL.PC.NAME] || "從者");
                    fateDreamPrompt = buildDreamPrompt_(pcName, wishTxt, svName);
                    // 戰史：御主殞命＝敗北（在死亡當下記錄一次；殘局清理由下次登入處理）
                    try { var acctDp = String(userData.acctName || "") || findAccountByPc_(pcId); if (acctDp) recordHistory_(acctDp, "敗", svName, "御主殞命，聖杯戰爭落敗。"); } catch (e) {}
                  } else {
                    // 九州舊版：血歸 0 送「小醫仙藥鋪」救回（FATE 不走此路）
                    const healLoc = "小醫仙藥鋪";
                    pcData[targetIdx][COL.PC.HP] = 50; pcData[targetIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "換上乾淨素衣", "姿勢": "平躺靜養", "負面": "重傷初癒", "顏面": "蒼白" }); pcData[targetIdx][COL.PC.LOC] = healLoc;
                    if (targetIdx === pcIndex) curL = healLoc;
                    relData.forEach(row => {
                      if (row[COL.REL.PC] === pcData[targetIdx][COL.PC.NAME] && row[COL.REL.IS_PARTY] === "同行") {
                        const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === row[COL.REL.NPC] && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId));
                        if (nIdx !== -1) {
                          pcData[nIdx][COL.PC.LOC] = healLoc;
                          pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "平穩" });
                          pcData[nIdx][COL.PC.HP] = maxStatsForRow_(pcData[nIdx]).hp;
                          dirtyPcRows.add(nIdx);
                        }
                      }
                    });
                    if (sheets.epic) sheets.epic.appendRow([pcId, `【奇蹟救治】${pcData[targetIdx][COL.PC.NAME]} 於生死邊緣被救回。`, new Date()]);
                    if (targetIdx === pcIndex) justRevived = true;
                  }
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
              } else pcData[targetIdx][colIdx] = Math.max(1, Math.min(999, numNew));
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








    // 經濟層（物品/銀兩/天命）已全數移除：items_gained / items_transferred / money_transferred / items_lost / items_used 不再落地。

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
      // 🌹 含慾海角色前綴 KPC_(御主 avatar)／KSV_(同伴從者)，否則後日談的肉體/衣服/親密狀態寫不回去
      if (!id.startsWith("PC_") && !id.startsWith("NPC_") && !id.startsWith("DEAD_") && !id.startsWith("KPC_") && !id.startsWith("KSV_")) return;

      while (row.length < pcColCount) row.push("");

      const maxVals = maxStatsForRow_(row);
      row[COL.PC.MAX_HP] = maxVals.hp;
      row[COL.PC.MAX_MP] = maxVals.mp;
      row[COL.PC.HP] = Math.min(parseInt(row[COL.PC.HP]) || 0, maxVals.hp);
      row[COL.PC.MP] = Math.min(parseInt(row[COL.PC.MP]) || 0, maxVals.mp);

      // 只寫這一行，不寫全表
      sheets.pc.getRange(idx + 1, 1, 1, pcColCount).setValues([row]);
    });

    isRelChanged = isRelChanged || !!(aiData.rel_changes && aiData.rel_changes.length > 0) || !!(aiData.recruited && aiData.recruited.length > 0) || !!dismissedNpc;

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

    curL = pcData[pcIndex][COL.PC.LOC];
    sheets.log.appendRow([new Date(), pcId, formatCausalityEntry(curL, logTag, logPeopleStr, logEvent), curL, logTag]);
    trimLogRowsByOwner(sheets.log, pcId, 60, 20);

    const localPeopleList = getLocalPeopleList(sheets, pcName, pcId, curL, relData, sheets.task ? sheets.task.getDataRange().getValues() : [], pcData);

    let finalResponseText = aiData.narration || "天地混沌，一片寂靜。";
    finalResponseText = finalResponseText.replace(/\n/g, "<br>");






    // 🔴 好感度渲染（經濟層物品/銀兩渲染已移除）
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

    // 🔴 玩家真氣變化（生命已由上面清單統一顯示，這裡不重複；銀兩經濟層已移除）
    const mpAfter = parseInt(pcData[pcIndex][COL.PC.MP]) || 0;
    const extraMsgs = [];
    const mpDiff = mpAfter - mpBefore;
    if (mpDiff !== 0) extraMsgs.push(`<span style="color:#4169e1;">${mpDiff < 0 ? "💨" : "🌀"} 魔力 ${mpDiff > 0 ? "+" : ""}${mpDiff}</span>`);
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
      statusString: buildPlayerStatusString(pcData[pcIndex], getCharacterTotalStats(pcId, sheets, pcData, []), []),
      people: localPeopleList,
      locations: getNearbyLocations(curL, memoryMapData),
      recruited: newlyRecruited,
      options: aiData.options,
      knockedOut: knockedOutList,
      mentionedNames: aiData.mentioned_names || [],
      // 經濟層已移除：不再回傳隨身行囊清單
      myItemNames: [],
      justRevived: justRevived,
      defeat: fatePlayerDefeat, dreamPrompt: fateDreamPrompt, // 🔵 FATE：御主殞命→前端播虛假之夢→老虎道場
      allMapNames: memoryMapData.slice(1).map(m => String(m[COL.MAP.NAME]).trim()).filter(n => n.length >= 2),
      // 🔴 新增：將全九州活著的眾生名單傳給前端，用於三段式判定
      allKnownNames: pcData.filter((r, i) => i !== 0 && !String(r[COL.PC.ID]).startsWith("DEAD_")).map(r => String(r[COL.PC.NAME]).trim())
    });

  } catch (e) { return JSON.stringify({ text: "系統錯誤：" + e.message, people: [] }); }
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
      realm: pcRow[COL.PC.REALM] || ""
    }
  });
}

// 🟢 新增：天道強行抹除/斬斷 NPC 的重大事件約定
function actionClearNpcMajorEvent(userData, pcId, sheets) {
  if (!sheets.rel) return JSON.stringify({ success: false, message: "系統異常：REL關係表不存在。" });

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
// ⚔️ 單次出擊裁決：atkC 攻擊 pcData[tgtIdx]。命中才扣血（未中＝撲空、不自傷）。
//   處理破戒/戰鬥續行/令咒緊急脫離/十二試煉復活/死亡(敵→勝利判定；我→敗北)。
//   opts:{np,seal,counterMul}　ctx:{myGameId,pIdx,userData}
function fateStrike_(sheets, pcData, atkC, tgtIdx, opts, ctx) {
  opts = opts || {};
  var defC = rowToCombatant_(pcData[tgtIdx]);
  // 🍱 整備·進食加成：御主一行戰前整備過、且尚在效期內 → 從者出擊命中 +MEAL_BUFF_BONUS
  var mealOn = false;
  try { mealOn = mealBuffActive_(pcData[ctx.pIdx][COL.PC.MEMORY], ctx.myGameId); } catch (e) { }
  var r = resolveFateBattle_(atkC, defC, { np: !!opts.np, seal: !!opts.seal, mealBuff: mealOn ? MEAL_BUFF_BONUS : 0 });
  if (opts.seal) r.atkWins = true; // 絕對命令必中
  var out = {
    hit: r.atkWins, damage: 0, fired: (r.fired || []).slice(),
    aRoll: r.aRoll, aHit: r.aHit, dRoll: r.dRoll, dEva: r.dEva, crit: r.crit || "",
    destroyed: "", sealEscaped: false, sealNote: "", godRevived: false, godNote: "",
    victory: false, defeat: false, dreamPrompt: "", knocked: ""
  };
  if (opts.seal && !out.fired.includes('令咒·絕對命令')) out.fired.push('令咒·絕對命令');
  if (!r.atkWins) return out;

  var dmg = r.damage;
  if (opts.counterMul) dmg = Math.max(1, Math.round(dmg * opts.counterMul));
  out.damage = dmg;

  var tgtFaction = String(pcData[tgtIdx][COL.PC.FACTION] || "");
  var isPlayerSv = (tgtFaction === "從者");
  var isFoeSv = (tgtFaction === "敵從者");
  var severed = hasFx_(atkC, 'rule_breaker') || hasFx_(atkC, 'anti_magic_lance');
  var hp = parseInt(pcData[tgtIdx][COL.PC.HP]) || 0;
  var after = hp - dmg;
  if (severed && after <= 0) out.fired.push(atkC.name + '·斬斷救贖(契約已破)');
  if (after <= 5 && hasFx_(defC, 'survive') && hp > 1 && !severed) { after = 1; out.fired.push(defC.name + '·戰鬥續行'); }

  // 令咒緊急脫離（僅敵從者）
  if (after <= 0 && isFoeSv && !severed) {
    var eSeals = parseInt(pcData[tgtIdx][COL.PC.CONTRIB]) || 0;
    if (eSeals > 0 && Math.random() < 0.30) {
      out.sealEscaped = true;
      var leftSeals = eSeals - 1;
      pcData[tgtIdx][COL.PC.HP] = 1; pcData[tgtIdx][COL.PC.CONTRIB] = leftSeals;
      // 🕯️ 令咒燒到 0 × 無「單獨行動」→ 靈基失穩，掛上 SEAL_DOOM_HOURS 小時消滅倒數
      var doomNote = "";
      if (leftSeals <= 0 && !rowHasSolo_(pcData[tgtIdx])) {
        var dClk = getClock_(ctx.myGameId);
        if (dClk) {
          var deadAbs = dClk.day * 24 + dClk.hour + SEAL_DOOM_HOURS;
          pcData[tgtIdx][COL.PC.MEMORY] = stampDoom_(pcData[tgtIdx][COL.PC.MEMORY], deadAbs);
          pcData[tgtIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰蝕", "姿勢": "踉蹌", "負面": `令咒耗盡·靈基透支(約 ${SEAL_DOOM_HOURS} 時消滅)`, "顏面": "強撐將潰" });
          doomNote = `——三道令咒至此燃盡，失去令咒穩固的靈基開始崩解；它既無『單獨行動』自持，至多再撐約 ${SEAL_DOOM_HOURS} 小時。`;
        }
      }
      if (!doomNote) pcData[tgtIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基受創", "姿勢": "踉蹌", "負面": "令咒緊急脫離", "顏面": "咬牙退避" });
      var oldLoc = String(pcData[tgtIdx][COL.PC.LOC]).trim(), newLoc = enemyRetreatLoc_(oldLoc);
      pcData[tgtIdx][COL.PC.LOC] = newLoc;
      sheets.pc.getRange(tgtIdx + 1, 1, 1, pcData[tgtIdx].length).setValues([pcData[tgtIdx]]);
      // 🔗 用硬連結【御主】找「這名從者真正的御主」，避免同地多組時抓錯人
      //   （曾出現 A 御主一道令咒帶走 B 御主的從者的離譜 bug）。舊角色無連結→退回同地比對。
      var escMaster = getServantMaster_(pcData[tgtIdx][COL.PC.MEMORY]);
      var escMasterName = escMaster || "";
      for (var mi = 1; mi < pcData.length; mi++) {
        if (String(pcData[mi][COL.PC.FACTION]) !== "敵御主") continue;
        if (String(pcData[mi][COL.PC.GAME_ID] || "") !== ctx.myGameId) continue;
        if (String(pcData[mi][COL.PC.ID]).startsWith("DEAD_")) continue;
        var isOwnMaster = escMaster ? (String(pcData[mi][COL.PC.NAME]) === escMaster)
                                    : (String(pcData[mi][COL.PC.LOC]).trim() === oldLoc);
        if (!isOwnMaster) continue;
        if (!escMasterName) escMasterName = String(pcData[mi][COL.PC.NAME]);
        // 只有「本主與從者同地」才一起撤離；遠端御主只是隔空燃令咒下令，本人不跟著瞬移
        if (String(pcData[mi][COL.PC.LOC]).trim() === oldLoc) {
          pcData[mi][COL.PC.LOC] = newLoc; sheets.pc.getRange(mi + 1, 1, 1, pcData[mi].length).setValues([pcData[mi]]);
        }
        break;
      }
      out.sealNote = `${escMasterName ? '敵御主「' + escMasterName + '」' : '對面御主'}一道令咒迸發，強令其從者「${defC.name}」於靈基崩解前一瞬撤離戰場，遁向「${newLoc}」（敵餘令咒 ${leftSeals}）。★此撤離僅止於「${defC.name}」及其本主，與在場其他御主／從者無關。${doomNote}`;
      logWarEvent_(ctx.myGameId, `${escMasterName ? '敵御主「' + escMasterName + '」' : '敵御主'}燃一道令咒，令重傷的從者「${defC.name}」緊急脫離戰場（敵餘令咒 ${leftSeals}）${doomNote ? '；其令咒已盡、靈基進入透支倒數' : ''}。`, String(ctx.userData.acctName || ""));
      return out;
    }
  }
  // 十二試煉
  if (after <= 0 && !severed && hasFx_(defC, 'god_hand')) {
    var lives = getGodHandLives_(pcData[tgtIdx][COL.PC.MEMORY]);
    if (lives > 0) {
      out.godRevived = true;
      pcData[tgtIdx][COL.PC.HP] = Math.max(1, Math.round((parseInt(pcData[tgtIdx][COL.PC.MAX_HP]) || 480) * 0.40));
      pcData[tgtIdx][COL.PC.MEMORY] = setGodHandLives_(pcData[tgtIdx][COL.PC.MEMORY], lives - 1);
      pcData[tgtIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "神性光輝纏身", "姿勢": "緩緩起身", "負面": `十二試煉·餘${lives - 1}命`, "顏面": "不滅的戰意" });
      sheets.pc.getRange(tgtIdx + 1, 1, 1, pcData[tgtIdx].length).setValues([pcData[tgtIdx]]);
      out.godNote = `「${pcData[tgtIdx][COL.PC.NAME]}」倒下了——卻又緩緩站起。十二試煉的詛咒讓他一次次自死亡歸來（尚餘 ${lives - 1} 條命）。`;
      out.fired.push(pcData[tgtIdx][COL.PC.NAME] + '·十二試煉(God Hand)');
      return out;
    }
  }
  if (after <= 0) {
    out.destroyed = String(pcData[tgtIdx][COL.PC.NAME]);
    pcData[tgtIdx][COL.PC.ID] = "DEAD_" + String(pcData[tgtIdx][COL.PC.ID]);
    pcData[tgtIdx][COL.PC.HP] = 0;
    pcData[tgtIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "靈基崩潰·消滅", "顏面": "已無生息" });
    sheets.pc.getRange(tgtIdx + 1, 1, 1, pcData[tgtIdx].length).setValues([pcData[tgtIdx]]);
    if (isPlayerSv) {
      var svName = String(pcData[tgtIdx][COL.PC.NAME]);
      // 🗝️ 雙從者：僅當「所有」我方從者皆已消滅才算敗北；尚有從者存活＝只是折損一員
      var stillAlive = 0;
      for (var pai = 1; pai < pcData.length; pai++) {
        if (String(pcData[pai][COL.PC.FACTION]) === "從者" && String(pcData[pai][COL.PC.GAME_ID] || "") === ctx.myGameId && !String(pcData[pai][COL.PC.ID]).startsWith("DEAD_")) stillAlive++;
      }
      out.knocked = out.destroyed;
      if (stillAlive <= 0) {
        out.defeat = true;
        var wish = extractWish_(pcData[ctx.pIdx][COL.PC.MEMORY]);
        out.dreamPrompt = buildDreamPrompt_(pcData[ctx.pIdx][COL.PC.NAME], wish, svName);
        var acctD = String(ctx.userData.acctName || "");
        if (acctD) recordHistory_(acctD, "敗", svName, `「${svName}」於「${atkC.name}」之手靈基崩潰，聖杯戰爭落敗。`);
        logWarEvent_(ctx.myGameId, `我方從者「${svName}」於「${atkC.name}」之手靈基崩潰消滅——聖杯戰爭落敗。`, String(ctx.userData.acctName || ""));
      } else {
        logWarEvent_(ctx.myGameId, `我方從者「${svName}」被「${atkC.name}」擊破消滅（尚有從者續戰）。`, String(ctx.userData.acctName || ""));
      }
    } else {
      out.knocked = out.destroyed;
      // 🕯️ 敵從者被擊破 → 在其御主身上記下「如何痛失從者」，供日後遭遇時 AI 演出無牙御主
      if (isFoeSv) { markMasterLostServant_(sheets.pc, pcData, tgtIdx, `被『${atkC.name}』當場擊破、靈基崩潰消滅`); logWarEvent_(ctx.myGameId, `敵從者「${out.destroyed}」被我方『${atkC.name}』擊破、靈基崩潰消滅。`, String(ctx.userData.acctName || "")); }
      if (isFoeSv && aliveEnemyServants_(sheets, ctx.myGameId) <= 0) {
        out.victory = true;
        var acctW = String(ctx.userData.acctName || "");
        if (acctW) { incrementWin_(acctW); recordHistory_(acctW, "勝", atkC.name, `「${atkC.name}」斬盡所有敵對從者，奪得聖杯。`); recordWinSpeed_(acctW, ctx.myGameId); }
        logWarEvent_(ctx.myGameId, `🏆『${atkC.name}』斬盡所有敵對從者，奪得聖杯——聖杯戰爭勝利！`, String(ctx.userData.acctName || ""));
      }
    }
  } else {
    pcData[tgtIdx][COL.PC.HP] = after;
    sheets.pc.getRange(tgtIdx + 1, 1, 1, pcData[tgtIdx].length).setValues([pcData[tgtIdx]]);
  }
  return out;
}

// 名字比對容錯：忽略各種「間隔點」(·・•‧⋅・全形等)與空白，避免種子名點號不一致(英靈殿混用 U+00B7／U+30FB)
//   導致明明同地有敵卻「此世界查無此目標」。傳入空字串時回空(呼叫端須自行擋空名)。
function nameLoose_(s) { return String(s == null ? "" : s).replace(/[·・•‧∙⋅･·\s]/g, ""); }

function actionFateBattle(userData, pcId, sheets) {
  const npcName = String(userData.npcName || "").trim();
  if (!npcName) return JSON.stringify({ success: false, message: "未指定攻擊目標。" });
  const npcKey = nameLoose_(npcName);
  const useNp = !!userData.np;
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");

  // 🗝️ 雙從者：若指定出戰從者(userData.servant)則用之，否則取第一個在世從者
  const wantSv = String(userData.servant || "").trim();
  let atkIdx = wantSv ? pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.NAME]).includes(wantSv)) : -1;
  if (atkIdx === -1) atkIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (atkIdx === -1) return JSON.stringify({ success: false, message: "你尚未召喚從者，無從者可出戰。" });

  let nIdx = pcData.findIndex(r => nameLoose_(r[COL.PC.NAME]).indexOf(npcKey) !== -1 && r[COL.PC.ID] != pcData[atkIdx][COL.PC.ID] && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "此世界查無此目標。" });
  if (String(pcData[pIdx][COL.PC.LOC]).trim() !== String(pcData[nIdx][COL.PC.LOC]).trim()) {
    return JSON.stringify({ success: false, message: "對方不在你身邊，鞭長莫及。" });
  }

  // 🗡️ 斬首戰術：目標為敵御主時，若其從者尚在同地護衛 → 需「大成功(擲 20)」才能突破斬殺御主，
  //    否則被從者捨命格擋、並反噬 1.5 倍傷害。從者已亡 → 御主手無寸鐵，直接擊殺（走一般流程）。
  let interceptNote = "";
  let isMasterTarget = (String(pcData[nIdx][COL.PC.FACTION]) === "敵御主");
  let assassinGuardIdx = -1;
  if (isMasterTarget) {
    const guardLoc = String(pcData[nIdx][COL.PC.LOC]).trim();
    assassinGuardIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者"
      && String(r[COL.PC.GAME_ID] || "") === myGameId
      && !String(r[COL.PC.ID]).startsWith("DEAD_")
      && String(r[COL.PC.LOC]).trim() === guardLoc);
  }

  // ⏳ 戰鬥耗 1 AP（＝推進 1 小時，1 AP＝1 小時）；行動點不足則無法出戰
  const isFateBattle = myGameId.indexOf("g_") === 0;
  if (isFateBattle && getAp_(myGameId) < 1) {
    return JSON.stringify({ success: false, message: "行動點已耗盡，從者也需喘息——請『歇息』恢復後再戰。" });
  }

  // 🤝 盟友不可攻擊：須先撕毀盟約
  if (isAllied_(pcData[nIdx])) {
    return JSON.stringify({ success: false, message: `「${pcData[nIdx][COL.PC.NAME]}」是你的盟友——若要動手，須先『撕毀盟約』。` });
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

  // 🗡️ 斬首裁決：敵御主仍有從者在側護衛時，唯有「大成功（擲 20）」能突破護衛、一擊斬殺御主；
  //    否則護衛捨身格擋、並反手予我方從者 1.5 倍痛擊（可能致敗）。寶具／令咒對奇襲斬首不適用。
  if (isMasterTarget && assassinGuardIdx !== -1) {
    const masterName = String(pcData[nIdx][COL.PC.NAME]);
    const guardName = String(pcData[assassinGuardIdx][COL.PC.NAME]);
    // 🗝️ 雙從者：每名在世從者各擲一次 D20（出戰中排第一）——更多嘗試＝更高斬首機率，但失手者各遭護衛反噬
    const asnParty = [];
    for (let pi = 1; pi < pcData.length; pi++) {
      if (String(pcData[pi][COL.PC.FACTION]) === "從者" && String(pcData[pi][COL.PC.GAME_ID] || "") === myGameId && !String(pcData[pi][COL.PC.ID]).startsWith("DEAD_")) {
        if (pi === atkIdx) asnParty.unshift(pi); else asnParty.push(pi);
      }
    }
    const rolls = asnParty.map(idx => ({ idx: idx, name: String(pcData[idx][COL.PC.NAME]), roll: Math.floor(Math.random() * 20) + 1 }));
    const crit = rolls.find(r => r.roll === 20) || null;
    const dualAsn = asnParty.length > 1;
    let asnReport, asnPrompt, asnVictory = false, asnDefeat = false, asnDream = "", asnKnocked = [];

    if (crit) {
      // 大成功：斬殺御主；御主既亡，護衛從者失去魔力供給隨之消滅
      pcData[nIdx][COL.PC.ID] = "DEAD_" + String(pcData[nIdx][COL.PC.ID]);
      pcData[nIdx][COL.PC.HP] = 0;
      pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "鮮血浸染", "姿勢": "頹然倒地", "負面": "咽喉已斷·身亡", "顏面": "錯愕凝固" });
      sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);
      pcData[assassinGuardIdx][COL.PC.ID] = "DEAD_" + String(pcData[assassinGuardIdx][COL.PC.ID]);
      pcData[assassinGuardIdx][COL.PC.HP] = 0;
      pcData[assassinGuardIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "化作光點", "負面": "御主既亡·魔力斷絕消滅", "顏面": "黯然消散" });
      sheets.pc.getRange(assassinGuardIdx + 1, 1, 1, pcData[assassinGuardIdx].length).setValues([pcData[assassinGuardIdx]]);
      asnKnocked = [masterName, guardName];
      logWarEvent_(myGameId, `我方『${crit.name}』奇襲斬首敵御主「${masterName}」，御主既亡、護衛從者「${guardName}」失去魔力供給隨之消散。`, String(userData.acctName || ""));
      if (aliveEnemyServants_(sheets, myGameId) <= 0) {
        asnVictory = true;
        const acctW = String(userData.acctName || "");
        if (acctW) { incrementWin_(acctW); recordHistory_(acctW, "勝", crit.name, `「${crit.name}」奇襲斬首敵御主「${masterName}」，奪得聖杯。`); recordWinSpeed_(acctW, myGameId); }
        logWarEvent_(myGameId, `🏆 已無敵對從者存世——聖杯到手，聖杯戰爭勝利！`, String(userData.acctName || ""));
      }
      asnReport = {
        assassination: true, success: true, aRoll: 20, rolls: rolls.map(r => ({ name: r.name, roll: r.roll })), dual: dualAsn,
        atk: crit.name, master: masterName, guard: guardName,
        note: `${crit.name} 擲出 20 — 大成功！撕開「${guardName}」的守備，一擊斬斷御主「${masterName}」咽喉。御主既亡，「${guardName}」隨之消散。`,
        selfDmg: 0, victory: asnVictory, defeat: false,
        atkHp: parseInt(pcData[atkIdx][COL.PC.HP]) || 0, atkHpMax: parseInt(pcData[atkIdx][COL.PC.MAX_HP]) || 0
      };
      asnPrompt = `【系統·斬首戰報·已裁定】御主號令${dualAsn ? '兩名從者齊撲' : `從者『${crit.name}』`}奇襲敵御主「${masterName}」。命運的骰子由『${crit.name}』擲出 20 — 大成功！撕開護衛從者「${guardName}」的防線，一擊斬斷御主咽喉。御主既亡、魔力供給斷絕，「${guardName}」當場化作光點消散。${asnVictory ? '此為最後的敵對陣營——聖杯已然在握！' : ''}\n` +
        `★以 Fate／TYPE-MOON 筆觸描寫這萬中選一、石破天驚的斬首瞬間（一段即可）${dualAsn ? '：兩名從者夾擊、其中一人覷得破綻一劍封喉' : ''}。勝負已由系統結算。\n` +
        ``;
    } else {
      // 全部失手：護衛捨身格擋，反手 1.5 倍痛擊「每一名」參與斬首的從者
      const guardC = rowToCombatant_(pcData[assassinGuardIdx]);
      const hits = [];
      rolls.forEach(r => {
        const sC = rowToCombatant_(pcData[r.idx]);
        const probe = resolveFateBattle_(guardC, sC, {});
        const selfDmg = Math.max(1, Math.round((probe.damage || 1) * 1.5));
        const ahp = parseInt(pcData[r.idx][COL.PC.HP]) || 0;
        let after = ahp - selfDmg;
        if (after <= 5 && hasFx_(sC, 'survive') && ahp > 1) after = 1; // 戰鬥續行
        let knocked = false;
        if (after <= 0) {
          knocked = true;
          pcData[r.idx][COL.PC.ID] = "DEAD_" + String(pcData[r.idx][COL.PC.ID]);
          pcData[r.idx][COL.PC.HP] = 0;
          pcData[r.idx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "斬首反噬·靈基崩潰", "顏面": "已無生息" });
        } else {
          pcData[r.idx][COL.PC.HP] = after;
        }
        sheets.pc.getRange(r.idx + 1, 1, 1, pcData[r.idx].length).setValues([pcData[r.idx]]);
        hits.push({ name: r.name, roll: r.roll, dmg: selfDmg, knocked: knocked, hp: parseInt(pcData[r.idx][COL.PC.HP]) || 0, hpMax: parseInt(pcData[r.idx][COL.PC.MAX_HP]) || 0 });
      });
      // 敗北：所有我方從者皆亡
      let aliveLeft = 0;
      for (let pi = 1; pi < pcData.length; pi++) { if (String(pcData[pi][COL.PC.FACTION]) === "從者" && String(pcData[pi][COL.PC.GAME_ID] || "") === myGameId && !String(pcData[pi][COL.PC.ID]).startsWith("DEAD_")) aliveLeft++; }
      if (aliveLeft <= 0) {
        asnDefeat = true;
        const wish = extractWish_(pcData[pIdx][COL.PC.MEMORY]);
        asnDream = buildDreamPrompt_(pcData[pIdx][COL.PC.NAME], wish, hits[0].name);
        const acctD = String(userData.acctName || "");
        if (acctD) recordHistory_(acctD, "敗", hits[0].name, `斬首失手，遭護衛「${guardName}」反噬全滅，聖杯戰爭落敗。`);
      }
      const rollsTxt = hits.map(h => `${h.name}擲${h.roll}→受創 −${h.dmg}${h.knocked ? '·崩潰' : ''}`).join('；');
      asnReport = {
        assassination: true, success: false, dual: dualAsn, rolls: rolls.map(r => r.roll), hits: hits,
        aRoll: rolls[0].roll, atk: atkC.name, master: masterName, guard: guardName,
        note: `唯擲 20 方能突破。${rollsTxt}。`,
        selfDmg: hits.reduce((a, h) => a + h.dmg, 0), victory: false, defeat: asnDefeat,
        atkHp: parseInt(pcData[atkIdx][COL.PC.HP]) || 0, atkHpMax: parseInt(pcData[atkIdx][COL.PC.MAX_HP]) || 0
      };
      const whoTxt = dualAsn ? '兩名從者' : `從者『${atkC.name}』`;
      if (asnDefeat) {
        asnPrompt = `【系統·斬首戰報·已裁定】御主號令${whoTxt}奇襲敵御主「${masterName}」，無人擲出 20。護衛從者「${guardName}」捨身擋下、反手以 1.5 倍之力逐一痛擊（${rollsTxt}），我方從者悉數靈基崩潰、化作光點消散，御主敗北。\n` +
          `★以 Fate／TYPE-MOON 筆觸沉痛描寫斬首落空、護衛反殺、從者消滅的瞬間（一段即可），語氣留白。勝負已由系統結算。\n` +
          ``;
      } else {
        asnPrompt = `【系統·斬首戰報·已裁定】御主號令${whoTxt}欲奇襲敵御主「${masterName}」，無人擲出 20（大成功）。護衛從者「${guardName}」如影攔在御主身前、硬生生擋下，並反手以 1.5 倍之力逐一痛擊（${rollsTxt}）。御主未能得手。\n` +
          `★以 Fate／TYPE-MOON 筆觸描寫護衛捨身格擋、反噬重擊${dualAsn ? '、兩名從者同遭反震' : ''}的險惡瞬間（一段即可）。傷害已由系統結算。\n` +
          `★未崩潰之從者最多重傷，【絕對禁止】描寫其死亡。\n` +
          ``;
      }
    }

    return JSON.stringify({
      success: true, aiPrompt: asnPrompt, knockedOut: asnKnocked,
      victory: asnVictory, defeat: asnDefeat, dreamPrompt: asnDream,
      sealEscaped: false, report: asnReport,
      clock: isFateBattle ? clockLabel_(myGameId) : "", ap: battleAp, apMax: AP_PER_DAY,
      statusString: getFreshStatusString(pcId, pIdx, sheets)
    });
  }

  // ⚔️ 一次出戰＝最多 ROUNDS 個來回（我攻→敵反擊），命中才扣血、未中＝撲空；任一方倒下即止。
  //   寶具/令咒只在開場第一擊生效；其後為普通互砍。敵御主空手不反擊。
  const ROUNDS = 3;
  if (useSeal) {
    const left = getPlayerSeals_(pcData[pIdx][COL.PC.MEMORY]) - 1;
    pcData[pIdx][COL.PC.MEMORY] = setPlayerSeals_(pcData[pIdx][COL.PC.MEMORY], left);
    sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
    logWarEvent_(String(pcData[pIdx][COL.PC.GAME_ID] || ""), `御主燃一道令咒·絕對命令，強令『${atkC.name}』對「${defC.name}」發動必中的全力一擊（我餘令咒 ${left}）。`, String(userData.acctName || ""));
  }
  if (useNp) {
    pcData[atkIdx][COL.PC.MP] = Math.max(0, (parseInt(pcData[atkIdx][COL.PC.MP]) || 0) - Math.round((parseInt(pcData[atkIdx][COL.PC.MAX_MP]) || 100) * 0.35));
    sheets.pc.getRange(atkIdx + 1, 1, 1, pcData[atkIdx].length).setValues([pcData[atkIdx]]);
    atkC.mp = parseInt(pcData[atkIdx][COL.PC.MP]) || 0; // 反映耗魔後的出力
  }

  let knockedOut = [], victory = false, defeat = false, dreamPrompt = "", destroyedName = "", sealEscaped = false, sealNote = "", godRevived = false, godNote = "";
  let enemyNpSpent = false; // 敵寶具一場限一次
  const rounds = [];
  const ctx = { myGameId: myGameId, pIdx: pIdx, userData: userData };
  const targetIsFoeServant = String(pcData[nIdx][COL.PC.FACTION]) === "敵從者";

  // 🗝️ 雙從者齊攻：收齊所有在世我方從者（出戰中 atkIdx 排第一；寶具/令咒只加在他身上）。每回合每名各出一擊。
  const partyIdxs = [];
  for (let pi = 1; pi < pcData.length; pi++) {
    if (String(pcData[pi][COL.PC.FACTION]) === "從者" && String(pcData[pi][COL.PC.GAME_ID] || "") === myGameId && !String(pcData[pi][COL.PC.ID]).startsWith("DEAD_")) {
      if (pi === atkIdx) partyIdxs.unshift(pi); else partyIdxs.push(pi);
    }
  }
  const dualAttack = partyIdxs.length > 1;

  // 🤝 協同強襲（同盟背景生效）：同地盟友從者（敵從者＋盟約在身）對「共同敵人」每回合助攻一擊。
  //   原作依據：第五次冬木·遠坂凜＆Archer 為士郎掩護夾擊、聯手圍攻 Caster／Berserker。盟友提供掩護火力，
  //   只助攻、不被本場反擊（風險已由盟友自身承擔），讓「養同盟」在戰場上真正有感。
  let allyAtkIdx = -1, allyAssistName = "";
  if (targetIsFoeServant) {
    const allyLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
    allyAtkIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && isAllied_(r) && String(r[COL.PC.LOC]).trim() === allyLoc && r[COL.PC.ID] != pcData[nIdx][COL.PC.ID]);
    if (allyAtkIdx !== -1) allyAssistName = String(pcData[allyAtkIdx][COL.PC.NAME]);
  }

  for (let rd = 0; rd < ROUNDS; rd++) {
    if (sealEscaped || destroyedName || defeat || victory) break;
    if (String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_")) break;
    const livingParty = partyIdxs.filter(i => !String(pcData[i][COL.PC.ID]).startsWith("DEAD_"));
    if (!livingParty.length) break;
    const opening = (rd === 0);
    const rl = { n: rd + 1, strikes: [], eHit: false, eDmg: 0, eRoll: 0, eHitVal: 0, eFired: [], eTarget: "" };

    // ── 我方出擊（每名在世從者各出一擊）──
    for (let k = 0; k < livingParty.length; k++) {
      const sidx = livingParty[k];
      if (String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_")) break;
      const sC = rowToCombatant_(pcData[sidx]);
      const isActive = (sidx === atkIdx);
      const ps = fateStrike_(sheets, pcData, sC, nIdx, { np: opening && useNp && isActive, seal: opening && useSeal && isActive }, ctx);
      rl.strikes.push({ by: sC.name, pRoll: ps.aRoll, pHitVal: ps.aHit, dRoll: ps.dRoll, dEvaVal: ps.dEva, pHit: ps.hit, pDmg: ps.hit ? ps.damage : 0, pCrit: ps.crit, pFired: ps.fired, note: ps.sealNote || ps.godNote || "" });
      if (ps.destroyed) destroyedName = ps.destroyed;
      if (ps.knocked) knockedOut.push(ps.knocked);
      if (ps.sealEscaped) { sealEscaped = true; sealNote = ps.sealNote; }
      if (ps.godRevived) { godRevived = true; godNote = ps.godNote; }
      if (ps.victory) victory = true;
      if (destroyedName || sealEscaped) break;
    }

    // 🤝 盟友協同助攻一擊（共同敵人尚存活、本回合未分勝負才出手）
    if (allyAtkIdx !== -1 && !String(pcData[allyAtkIdx][COL.PC.ID]).startsWith("DEAD_")
        && !String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_") && !destroyedName && !sealEscaped && !victory) {
      const allyC = rowToCombatant_(pcData[allyAtkIdx]);
      const aps = fateStrike_(sheets, pcData, allyC, nIdx, {}, ctx);
      rl.strikes.push({ by: allyC.name, ally: true, pRoll: aps.aRoll, pHitVal: aps.aHit, dRoll: aps.dRoll, dEvaVal: aps.dEva, pHit: aps.hit, pDmg: aps.hit ? aps.damage : 0, pCrit: aps.crit, pFired: aps.fired, note: "盟友協同" });
      if (aps.destroyed) destroyedName = aps.destroyed;
      if (aps.knocked) knockedOut.push(aps.knocked);
      if (aps.victory) victory = true;
    }

    if (sealEscaped || destroyedName || victory) { rounds.push(rl); break; }

    // ── 敵反擊 ──（敵從者尚存活才回擊；打出戰中從者，若已亡則改打另一在世從者；空手敵御主不反擊）
    if (targetIsFoeServant && !String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_")) {
      let ctgt = atkIdx;
      if (String(pcData[ctgt][COL.PC.ID]).startsWith("DEAD_")) {
        const alt = partyIdxs.find(i => !String(pcData[i][COL.PC.ID]).startsWith("DEAD_"));
        if (alt != null) ctgt = alt;
      }
      if (!String(pcData[ctgt][COL.PC.ID]).startsWith("DEAD_")) {
        const enemyNow = rowToCombatant_(pcData[nIdx]);
        // 🔥 敵人也會解放寶具！殘血越急越想拼、暗殺/狂戰系更愛搏命；開寶具則全力(不打折)
        const eHpRatio = (parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1) > 0 ? (parseInt(pcData[nIdx][COL.PC.HP]) || 0) / (parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1) : 1;
        const eNpUrge = (hasFx_(enemyNow, 'zabaniya') || hasFx_(enemyNow, 'mad')) ? 0.22 : 0.10;
        const enemyFireNp = !enemyNpSpent && (Math.random() < (eNpUrge + (1 - eHpRatio) * 0.45));
        if (enemyFireNp) enemyNpSpent = true;
        const es = fateStrike_(sheets, pcData, enemyNow, ctgt, { counterMul: enemyFireNp ? 1.0 : 0.85, np: enemyFireNp }, ctx);
        rl.eHit = es.hit; rl.eRoll = es.aRoll; rl.eHitVal = es.aHit; rl.eDmg = es.hit ? es.damage : 0; rl.eFired = es.fired; rl.eTarget = String(pcData[ctgt][COL.PC.NAME]); rl.eNp = enemyFireNp;
        if (es.defeat) { defeat = true; victory = false; dreamPrompt = es.dreamPrompt; }
      }
    }
    rounds.push(rl);
    if (defeat) break;
  }

  // 戰報摘要
  const totalDealt = rounds.reduce((s, r) => s + (r.strikes || []).reduce((a, k) => a + (k.pDmg || 0), 0), 0);
  const totalTaken = rounds.reduce((s, r) => s + (r.eDmg || 0), 0);
  const nRounds = rounds.length;
  const atkLabel = dualAttack ? `${atkC.name} 與另一名從者協同` : atkC.name;
  const roundsBrief = rounds.map(r =>
    `第${r.n}回合：` + (r.strikes || []).map(k => `${k.by}${k.pHit ? `命中(−${k.pDmg})` : '揮空'}${k.note ? `【${String(k.note).replace(/\n/g, ' ')}】` : ''}`).join('、') +
    (targetIsFoeServant ? (r.eDmg ? `，「${defC.name}」回擊${r.eTarget ? `「${r.eTarget}」` : ''}(−${r.eDmg})` : (r.eHit === false ? `，「${defC.name}」反擊被擋` : '')) : '')
  ).join('\n');
  const finalLine = destroyedName
    ? `「${defC.name}」靈基崩潰、徹底消滅${victory ? '——此乃最後一名敵對從者，聖杯已近！' : '。'}`
    : sealEscaped ? `「${defC.name}」被對面御主令咒緊急扯離戰場、遁走不在場。`
      : godRevived ? `「${defC.name}」屢屢自死亡歸來、仍未倒下。`
        : defeat ? `『${atkC.name}』靈基崩潰、化作光點消散，御主敗北。`
          : `「${defC.name}」重傷未死，戰局未決——可再出擊打磨。`;

  let aiPrompt;
  if (defeat) {
    aiPrompt = `【系統戰報·已裁定】御主號令從者『${atkC.name}』與「${defC.name}」鏖戰 ${nRounds} 回合，終致『${atkC.name}』靈基崩潰、化作光點消散，御主於聖杯戰爭中敗北。\n` +
      `★以 Fate／TYPE-MOON 筆觸沉痛描寫這數回合廝殺後從者消滅的瞬間（一段即可），語氣留白。勝負已由系統結算。\n` +
      ``;
  } else {
    aiPrompt = servantCard_(pcData[atkIdx]) +
      `【系統戰報·已裁定，嚴禁更改勝負】御主號令${atkLabel}${useNp ? '解放寶具' : ''}${useSeal ? '·燃令咒絕對命令' : ''}出擊，與「${defC.name}」短兵相接，共 ${nRounds} 個回合的你來我往。\n` +
      (dualAttack ? `★【雙從者協同·務必演出】我方有兩名從者並肩齊攻——請描寫二人默契夾擊、攻防交織壓制單一敵手的場面（敵以一敵二、險象環生）。\n` : "") +
      (allyAssistName ? `★【盟友協同·務必演出】盟友從者「${allyAssistName}」依約自側翼掩護助攻、與我方從者交叉夾擊「${defC.name}」——請演出同盟並肩作戰的默契與「暫時休兵」下的微妙信任。\n` : "") +
      (interceptNote ? `〔護主攔截〕${interceptNote}\n` : "") +
      `${roundsBrief}\n` +
      `我方共造成 ${totalDealt} 傷害、受創 ${totalTaken}。最終：${finalLine}\n` +
      `★【篇幅約 220~280 字】以 Fate／TYPE-MOON 筆觸生動描寫這 ${nRounds} 回合互有攻防、你來我往的廝殺（不是單方面挨打），凸顯雙方發動的技能／寶具威能與靈基壓迫感（演出而非複述標籤名）。勝負與傷害已由系統結算。\n` +
      (useSeal ? `★【令咒·絕對命令·務必演出】御主高舉左手，手背上的紅色令咒咒印（聖痕）灼然迸亮、其中一道紋路在燃燒中消褪——請明確描寫「御主燃燒一道令咒、下達不可違逆的絕對命令」這一幕，以及那道命令如何貫徹從者全身、強行引爆超越極限的戰力（這一擊必中）。\n` : "") +
      (useNp ? `★【寶具解放·務必演出】請描寫從者高呼寶具真名、解放其象徵傳說之力的壯麗瞬間與毀滅性威能。\n` : "") +
      (godRevived ? `★【十二試煉】${godNote}請演出他靈基崩解又自死亡歸來、神性光輝重燃的不滅之姿。\n` : "") +
      (sealEscaped ? `★【令咒介入】${sealNote}請演出對面御主令咒爆閃、強行扯離重傷從者的瞬間，敵已遁走、不在場。\n` : "") +
      ((!destroyedName && !sealEscaped && !godRevived) ? `★敗方最多重傷，【絕對禁止】描寫死亡／消滅／屍體，生死由御主後續定奪。\n` : "") +
      ``;
  }

  // 📊 給前端的多回合視覺戰報
  const report = {
    atk: atkLabel, def: defC.name, rounds: rounds, intercept: !!interceptNote, dual: dualAttack, allyAssist: allyAssistName,
    useNp: useNp, useSeal: useSeal, totalDealt: totalDealt, totalTaken: totalTaken,
    destroyed: destroyedName || "", godRevived: godRevived, sealEscaped: sealEscaped, victory: victory, defeat: defeat,
    defHp: parseInt(pcData[nIdx][COL.PC.HP]) || 0, defHpMax: parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 0,
    atkHp: parseInt(pcData[atkIdx][COL.PC.HP]) || 0, atkHpMax: parseInt(pcData[atkIdx][COL.PC.MAX_HP]) || 0,
    party: partyIdxs.map(i => ({ name: String(pcData[i][COL.PC.NAME]), hp: parseInt(pcData[i][COL.PC.HP]) || 0, hpMax: parseInt(pcData[i][COL.PC.MAX_HP]) || 0 }))
  };

  return JSON.stringify({
    success: true, aiPrompt: aiPrompt, knockedOut: knockedOut,
    victory: victory, defeat: defeat, dreamPrompt: dreamPrompt,
    sealEscaped: sealEscaped, report: report,
    clock: isFateBattle ? clockLabel_(myGameId) : "", ap: battleAp, apMax: AP_PER_DAY,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// 十二試煉(God Hand) 剩餘命數（從者 MEMORY【試煉】N；無標記預設 7，呼應 FSN 殘存命數）
function getGodHandLives_(memory) {
  var m = String(memory || "").match(/【試煉】(\d+)/);
  return m ? parseInt(m[1]) : 7;
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

// 🕯️ 令咒耗盡·靈基透支倒數：令咒燒到 0 又無「單獨行動」的敵從者，只能再撐 SEAL_DOOM_HOURS 小時。
var SEAL_DOOM_HOURS = 3; // 失去令咒穩固、無單獨行動自持的靈基存續上限（遊戲內小時）
// 該從者列(TAGS JSON 的 skills/traits)是否帶「單獨行動」(fx:'solo')
function rowHasSolo_(row) {
  try { var tg = JSON.parse(row[COL.PC.TAGS] || "{}"); return (tg.skills || []).concat(tg.traits || []).some(function (s) { return s && s.fx === 'solo'; }); }
  catch (e) { return false; }
}
// 在 MEMORY 標記/讀取靈基透支的「絕對死線」(遊戲內總時數 = day*24+hour)
function stampDoom_(memory, deadAbsHour) {
  var s = String(memory || "").replace(/【靈基透支】\d+/, "");
  s = s.replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  return (s ? s + "｜" : "") + "【靈基透支】" + deadAbsHour;
}
function getDoom_(memory) {
  var m = String(memory || "").match(/【靈基透支】(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

// 🍱 整備·進食（戰前 buff）：solo 無商城/道具欄，食物由「整備」抽象供給(AI 敘述來源)，
//   不寫道具列、不花錢。MEMORY 記【整備至】<絕對小時>，過期自動失效。
var MEAL_BUFF_HOURS = 8;   // 持續時數（遊戲內）
var MEAL_BUFF_BONUS = 2;   // 從者出擊命中加值
function stampMeal_(memory, expiryAbsHour) {
  var s = String(memory || "").replace(/【整備至】\d+/, "");
  s = s.replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  return (s ? s + "｜" : "") + "【整備至】" + expiryAbsHour;
}
function getMeal_(memory) {
  var m = String(memory || "").match(/【整備至】(\d+)/);
  return m ? parseInt(m[1]) : 0;
}
// 目前是否仍在整備加成效期內（吃 game clock 的絕對小時：day*24+hour）
function mealBuffActive_(memory, gameId) {
  var exp = getMeal_(memory); if (!exp) return false;
  var clk = getClock_(gameId); if (!clk) return false;
  return (clk.day * 24 + clk.hour) < exp;
}
// 🍱 整備·進食：耗 1 AP，給御主一行 MEAL_BUFF_HOURS 小時的戰鬥命中 +MEAL_BUFF_BONUS（戰前 buff）
function actionPrepMeal(userData, pcId, sheets) {
  var pcData = sheets.pc.getDataRange().getValues();
  var pIdx = pcData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  var myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  var isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, message: "行動力不足以好好整備——請休息恢復後再進食。" });
  var clk = getClock_(myGameId);
  if (!clk) return JSON.stringify({ success: false, message: "此刻無法整備。" });
  var nowAbs = clk.day * 24 + clk.hour;
  pcData[pIdx][COL.PC.MEMORY] = stampMeal_(pcData[pIdx][COL.PC.MEMORY], nowAbs + MEAL_BUFF_HOURS);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  var ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(myGameId, 1).ap; clock = clockLabel_(myGameId); } catch (e) { } }
  try { sheets.log.appendRow([new Date(), pcId, `【系統】御主一行整備進食，戰意高昂（從者命中 +${MEAL_BUFF_BONUS}，約 ${MEAL_BUFF_HOURS} 小時）。`, pcData[pIdx][COL.PC.LOC]]); } catch (e) { }
  return JSON.stringify({
    success: true,
    message: `整備完畢——你與從者飽餐一頓、稍事休整。接下來約 ${MEAL_BUFF_HOURS} 小時內，從者出擊命中 +${MEAL_BUFF_BONUS}。`,
    clock: clock, ap: ap, apMax: AP_PER_DAY, mealBuff: true,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// 🕯️ 喪失從者紀錄：敵從者死亡時，在「同地同 game_id 的敵御主」MEMORY 標記如何失去從者，
//   供 AI 演出形單影隻、再無從者可驅使的無牙御主。配對採同落點(一master一servant結伴移動)。
function stampLostServant_(memory, svName, cause) {
  var s = String(memory || "");
  if (/【喪失從者】/.test(s)) return s; // 已記過就保留第一次，不覆蓋
  return (s ? s + "｜" : "") + "【喪失從者】" + svName + "·" + cause;
}
function getLostServant_(memory) {
  var m = String(memory || "").match(/【喪失從者】([^｜]+)/);
  return m ? m[1] : "";
}
// 🔗 敵御主↔敵從者硬連結（種子時互寫於 MEMORY，解決多組同場時「誰是誰」）
function getServantMaster_(memory) { var m = String(memory || "").match(/【御主】([^｜]+)/); return m ? m[1] : ""; }
function getMasterServant_(memory) { var m = String(memory || "").match(/【從者】([^｜]+)/); return m ? m[1] : ""; }

// 📖 本場戰記（里程碑）：用 GAS 寫進獨立「戰記」表，附遊戲內日期時段，供玩家回顧。
//   只記 solo 戰爭局(g_)；schema = [game_id, 帳號, 日, 時, 內容]。表不存在則自動建立。
//   帳號用於回顧過去戰役(帳號表只記當前局)；每場召喚必帶帳號→靠那筆把整場 game_id 歸戶。
//   上限：超過 2000 列就砍最舊 500（≈ 數十場戰役），避免無限成長。
function logWarEvent_(gameId, text, acctName) {
  try {
    var gid = String(gameId || "");
    if (gid.indexOf("g_") !== 0 || !text) return; // 只記單人聖杯戰爭局
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName("戰記");
    if (!sh) { sh = ss.insertSheet("戰記"); sh.appendRow(["game_id", "帳號", "日", "時", "內容"]); }
    var clk = getClock_(gid);
    var day = clk ? clk.day : 0, hour = clk ? clk.hour : 0;
    sh.appendRow([gid, String(acctName || ""), day, hour, String(text)]);
    var last = sh.getLastRow();
    if (last > 2000) { try { sh.deleteRows(2, last - 1500); } catch (e) { } }
  } catch (e) { }
}

// 📖 取戰記：預設玩家當前 game_id；若帶 userData.gameId(回顧過去)則驗證屬於該帳號才給。
function actionWarChronicle(userData, pcId, sheets) {
  var wantGid = String((userData && userData.gameId) || "").trim();
  var acct = String((userData && userData.acctName) || "").trim();
  var gid = wantGid;
  if (!gid) {
    var allPc = sheets.pc.getDataRange().getValues();
    var me = allPc.find(function (r) { return r[COL.PC.ID] == pcId; });
    gid = me ? String(me[COL.PC.GAME_ID] || "") : "";
  }
  var events = [];
  if (gid) {
    try {
      var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("戰記");
      if (sh) {
        var data = sh.getDataRange().getValues();
        // 回顧過去局：必須該 game_id 有任一列帳號 === 登入帳號，才放行(防越權看別人戰役)
        var owned = !wantGid;
        if (wantGid && acct) { for (var k = 1; k < data.length; k++) { if (String(data[k][0]) === gid && String(data[k][1]) === acct) { owned = true; break; } } }
        if (owned) {
          for (var i = 1; i < data.length; i++) {
            if (String(data[i][0]) === gid) events.push({ day: data[i][2], hour: data[i][3], text: String(data[i][4] || "") });
          }
        }
      }
    } catch (e) { }
  }
  return JSON.stringify({ success: true, events: events });
}

// 📖 戰役回顧清單：列出某帳號歷來的戰役(依戰記表帳號欄)，每場給標題/結果/最後日。
function actionWarHistoryList(userData, pcId, sheets) {
  var acct = String((userData && userData.acctName) || "").trim();
  var wars = [];
  if (acct) {
    try {
      var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("戰記");
      if (sh) {
        var data = sh.getDataRange().getValues();
        var order = [], map = {};
        for (var i = 1; i < data.length; i++) {
          if (String(data[i][1]) !== acct) continue;
          var g = String(data[i][0]); var txt = String(data[i][4] || "");
          if (!map[g]) { map[g] = { gameId: g, title: txt, result: "進行中", lastDay: data[i][2] || 0 }; order.push(g); }
          map[g].lastDay = data[i][2] || map[g].lastDay;
          if (/奪得聖杯|聖杯戰爭勝利|聖杯到手/.test(txt)) map[g].result = "奪杯";
          else if (/落敗|敗北/.test(txt)) map[g].result = "敗北";
        }
        // 當前局排最前；其餘依出現序倒過來(新到舊)
        order.reverse();
        wars = order.map(function (g) { return map[g]; });
      }
    } catch (e) { }
  }
  return JSON.stringify({ success: true, wars: wars });
}
// data：眾生二維陣列；svIdx：剛死亡的敵從者列索引；sheet：sheets.pc。就地改 data 並寫回該御主列。
//   配對優先用硬連結【御主】名(精準，不怕多組同地)，舊角色無連結則退回同落點比對。
function markMasterLostServant_(sheet, data, svIdx, cause) {
  try {
    var svName = String(data[svIdx][COL.PC.NAME] || "從者");
    var gid = String(data[svIdx][COL.PC.GAME_ID] || "");
    var linkedMaster = getServantMaster_(data[svIdx][COL.PC.MEMORY]);
    var loc = String(data[svIdx][COL.PC.LOC] || "").trim();
    for (var m = 1; m < data.length; m++) {
      if (String(data[m][COL.PC.FACTION]) !== "敵御主") continue;
      if (String(data[m][COL.PC.GAME_ID] || "") !== gid) continue;
      if (String(data[m][COL.PC.ID]).startsWith("DEAD_")) continue;
      var isMatch = linkedMaster ? (String(data[m][COL.PC.NAME]) === linkedMaster)
                                 : (String(data[m][COL.PC.LOC] || "").trim() === loc);
      if (!isMatch) continue;
      var before = String(data[m][COL.PC.MEMORY] || "");
      var after = stampLostServant_(before, svName, cause);
      if (after !== before) { data[m][COL.PC.MEMORY] = after; sheet.getRange(m + 1, 1, 1, data[m].length).setValues([data[m]]); }
      return;
    }
  } catch (e) { }
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

  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
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
  logWarEvent_(myGameId, `御主燃一道令咒（${type === 'repair' ? '靈基重塑·回滿' : type === 'mana' ? '灌頂補魔' : '緊急脫離'}）施於「${svName}」（我餘令咒 ${seals}）。`, String(userData.acctName || ""));

  const aiPrompt = `【系統·令咒已發動，已裁定】御主燃燒一道令咒。${effectMsg}（餘 ${seals} 道令咒）\n` +
    `★以 Fate／TYPE-MOON 筆觸描寫令咒在手背灼亮、絕對命令權貫徹的瞬間（一段即可）。效果已由系統結算。\n` +
    ``;
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, seals: seals, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// 從英靈殿(種子庫)依真名撈完整 persona（含 speech/moe/tic 萌點細緻設定）
function codexPersona_(name) {
  try {
    var hs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('英靈殿');
    if (!hs || hs.getLastRow() <= 1) return {};
    var d = hs.getDataRange().getValues();
    var nm = String(name || "").trim();
    if (!nm) return {};
    for (var i = 1; i < d.length; i++) {
      var hn = String(d[i][COL.HERO.NAME]).trim();
      if (hn === nm || hn.indexOf(nm) >= 0 || nm.indexOf(hn) >= 0) {
        try { return JSON.parse(d[i][COL.HERO.PERSONA] || "{}"); } catch (e) { return {}; }
      }
    }
  } catch (e) { }
  return {};
}

// 🎭 從者「演出依據」卡：真名/職階/第一人稱/個性/對御主/口吻/萌點/招牌動作/六圍/技能/寶具
//   壓成一段塞進 narration 提示詞，讓 AI 依『我們定義的角色』內化演出（只當背景、不准說嘴）。
function servantCard_(row) {
  if (!row) return "";
  try {
    var name = String(row[COL.PC.NAME] || "");
    var cls = String(row[COL.PC.RANK] || "");
    var mem = String(row[COL.PC.MEMORY] || "");
    var p = codexPersona_(name); // 種子庫的細緻人設（萌點/口吻）
    var fp = p.firstP || (mem.match(/第一人稱「([^」]*)」/) || [])[1] || "我";
    var toM = p.toMaster || (mem.match(/對御主：([^|【]*)/) || [])[1] || "";
    var prefArr = String(row[COL.PC.PREF] || "").split('、').filter(Boolean);
    var persona = p.words || prefArr.slice(0, 4).join('、');
    var np = String(row[COL.PC.MARTIAL] || "");
    // 狂化偵測：喪失言語、只咆哮（如赫拉克勒斯、蘭斯洛特）。開膛手傑克等會說話的狂戰士不命中。
    var mad = /狂化|無法言語|僅?咆哮|不語/.test(String(p.speech || "") + String(fp));
    var card = `〈${name}·${cls}·演出依據(僅供內化，禁複述設定字面)〉自稱「${fp}」｜對御主：${toM || '依真名'}｜性格：${persona || '依真名'}` +
      (p.speech ? `｜口吻：${p.speech}` : "") +
      (p.moe ? `｜萌點：${p.moe}` : "") +
      (p.tic ? `｜小動作：${p.tic}` : "") +
      (np ? `｜寶具「${np}」` : "") + `。\n`;
    if (mad) card += `★【狂化·絕對】此從者已狂化、喪失言語：【嚴禁】說出任何完整句子或台詞，只能以低吼、咆哮、肢體與本能反應表達（旁白可寫其情緒，但他不開口）。\n`;
    card += `★依「${name}」真名與上述性格/口吻演出（show, don't tell）：用言行神態自然流露，【禁】把性格詞/萌點/六圍/技能/寶具名當台詞或由旁白點破。依羈絆高低調親疏：低→保留戒備矜持、高→漸親近，守住性格內核、未深不越界倒貼。\n`;
    return card;
  } catch (e) { return ""; }
}

// 🎭 御主「演出依據」卡（精簡）：讓 AI 知道玩家御主是誰(性別/性格/特徵/願望)，以便 portray 互動。
//   ★只供內化、禁複述；願望僅供氛圍不直述；仍【禁止替御主做決定或代御主說話】。
function masterCard_(row) {
  if (!row) return "";
  try {
    var name = String(row[COL.PC.NAME] || "御主");
    var sex = String(row[COL.PC.SEX] || "");
    var prefArr = String(row[COL.PC.PREF] || "").split('、').filter(function (x) { return x && x !== "無"; });
    var traitArr = String(row[COL.PC.TRAIT] || "").split('、').filter(function (x) { return x && x !== "無"; });
    var wish = (String(row[COL.PC.MEMORY] || "").match(/【願望】([^|【\n]*)/) || [])[1] || "";
    return `〈御主「${name}」·演出依據(僅內化、禁複述)〉` + (sex ? `性別${sex}` : "") +
      (prefArr.length ? `｜性格：${prefArr.slice(0, 4).join('、')}` : "") +
      (traitArr.length ? `｜特徵：${traitArr.slice(0, 4).join('、')}` : "") +
      (wish ? `｜願望(僅供氛圍、禁直述)：${wish}` : "") +
      `。御主是玩家本人，禁止替御主做決定或代御主說出台詞，只描寫其神態/反應供玩家接續。\n`;
  } catch (e) { return ""; }
}

// 🗝️ 取我方從者列索引：指定 wantName 則優先取該名，否則取第一個在世從者（雙從者用）
function findPlayerServantIdx_(pcData, gameId, wantName) {
  var want = String(wantName || "").trim();
  if (want) {
    var i = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.NAME]).includes(want));
    if (i !== -1) return i;
  }
  return pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
}

// 🔵 補魔（魔力供給）：把御主魔力導入從者，回魔＋羈絆＋fade 演出。耗 1 AP（導入魔力需時）
function actionManaSupply(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
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

  // ⚔️ 卸防突襲：補魔時門戶大開，同地若有清醒敵從者→趁隙重擊我方從者（可能致敗）
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, userData, 1.4);

  // 戰場補魔：甜而克制的曖昧 fade（給點甜頭、不開慾海引擎）——真・慾海留給鑑賞
  let aiPrompt;
  if (ambush) {
    aiPrompt = `【系統·補魔遭突襲·已裁定】御主正以魔力供給「${svName}」、彼此門戶大開之際，潛伏同地的敵從者「${ambush.enemyName}」${ambush.stealthy ? '自陰影中無聲撲出' : '抓住這破綻猛然殺到'}，一記重擊狠狠貫入「${svName}」（−${ambush.dmg}）${ambush.destroyed ? '，其靈基當場崩潰、化作光點消散，御主敗北' : ''}。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫補魔的私密一刻被突襲打斷的驚變：魔力交融的脆弱、敵襲的兇險、${ambush.destroyed ? '從者消滅的痛楚（語氣留白）' : '從者強忍重傷護住御主的瞬間'}。傷害與勝負已由系統結算。\n` +
      ``;
  } else {
    aiPrompt = masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
      `【系統·補魔已結算】御主以魔力供給「${svName}」，其魔力回復至 ${restored}/${mpMax}，羈絆微升。\n` +
      `★以 Fate／TYPE-MOON 筆觸【精煉 90~140 字】，溫柔且帶一絲曖昧張力地描寫這場魔力供給——肌膚相觸、魔力交融的私密一刻（體溫、心跳、屏息、半句未盡的情話），甜美而克制，最後 fade-to-black 留白。\n` +
      `★【鐵律】止於唯美曖昧、點到為止；【不可】出現性器官、性交或露骨情慾描寫（那是奪杯後鑑賞的事）。演出而非複述設定。`;
  }
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, clock: manaClock, ap: manaAp, apMax: AP_PER_DAY, ambush: !!ambush, defeat: ambush ? ambush.defeat : false, dreamPrompt: ambush ? ambush.dreamPrompt : "", statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// 🩸 燃血補魔（血→魔）：御主燃燒自身生命力轉化為魔力、大量灌注從者。代價＝御主 HP，回報＝從者大量回魔。
//   原作依據：魔術師以己身為媒、燃燒生命供給從者 prana（代價型補魔）。御主 HP 可休息回復，故可持續但有代價。
function actionBloodSupply(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無從者可供魔。" });
  const svName = pcData[svIdx][COL.PC.NAME];
  const svMpMax = parseInt(pcData[svIdx][COL.PC.MAX_MP]) || 200;
  const svMp = parseInt(pcData[svIdx][COL.PC.MP]) || 0;
  if (svMp >= svMpMax) return JSON.stringify({ success: false, message: `「${svName}」的魔力已充盈，毋須燃血。` });

  const mHp = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
  const mMaxHp = parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 100;
  const cost = Math.max(8, Math.round(mMaxHp * 0.18));
  const floor = Math.round(mMaxHp * 0.15);
  if (mHp - cost < floor) return JSON.stringify({ success: false, message: `你的血量太低（${mHp}/${mMaxHp}），再燃血恐危及性命——請先『休息』回血。` });

  const isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, message: "行動力不足以行燃血之儀——請『休息』恢復後再來。" });

  // 結算：御主扣血、從者大量回魔（約 70% 上限）
  const restored = Math.min(svMpMax, svMp + Math.round(svMpMax * 0.7));
  pcData[pIdx][COL.PC.HP] = mHp - cost;
  pcData[svIdx][COL.PC.MP] = restored;
  sheets.pc.getRange(pIdx + 1, COL.PC.HP + 1).setValue(mHp - cost);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  raiseBond_(sheets, pcData[pIdx][COL.PC.NAME], svName, 5);

  let bap = AP_PER_DAY, bclock = "";
  if (isFate) { try { bap = spendAp_(myGameId, 1).ap; bclock = clockLabel_(myGameId); } catch (e) { } }

  // ⚔️ 卸防突襲：燃血時門戶大開，同地未結盟敵從者可能趁隙重擊
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, userData, 1.4);

  let aiPrompt;
  if (ambush) {
    aiPrompt = `【系統·燃血補魔遭突襲·已裁定】御主割破掌心、燃燒血肉化為魔力灌入「${svName}」、門戶大開之際，潛伏同地的敵從者「${ambush.enemyName}」${ambush.stealthy ? '自陰影中無聲撲出' : '抓住這破綻猛然殺到'}，一記重擊狠狠貫入「${svName}」（−${ambush.dmg}）${ambush.destroyed ? '，其靈基當場崩潰、化作光點消散，御主敗北' : ''}。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫燃血供魔的私密一刻被突襲撕裂的驚變${ambush.destroyed ? '、從者消滅的痛楚（語氣留白）' : '、從者強忍重傷護住臉色慘白的御主'}。傷害與勝負已由系統結算。\n` +
      ``;
  } else {
    aiPrompt = masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
      `【系統·燃血補魔已結算】御主以自身血肉為媒，燃燒生命力轉化為魔力（耗血 ${cost}，餘 ${mHp - cost}/${mMaxHp}），大量灌注「${svName}」，其魔力回復至 ${restored}/${svMpMax}，羈絆加深。\n` +
      `★以 Fate／TYPE-MOON 筆觸【精煉 90~140 字】描寫這場「以血為魔」的補魔之儀——御主咬牙逼出赤紅的血色魔力、順著相握的手流入從者體內；強調這是燃燒自身生命的沉重代價、從者察覺御主臉色發白時的不忍與心疼，兩人間一絲悲壯而緊密的羈絆。\n` +
      `★【防護】這是魔術師嚴肅悲壯的燃血供魔，血只是魔力媒介——【不可】血腥獵奇、【不可】情慾露骨，點到即止。演出而非複述設定。`;
  }
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, clock: bclock, ap: bap, apMax: AP_PER_DAY, ambush: !!ambush, defeat: ambush ? ambush.defeat : false, dreamPrompt: ambush ? ambush.dreamPrompt : "", statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// ── 💕 羈絆日限：記於御主 MEMORY 的【羈絆日】D:type1,type2（跨日自動重置）──
function getBondUsedToday_(memory, day) {
  var m = String(memory || "").match(/【羈絆日】(\d+):([^|【]*)/);
  if (!m || parseInt(m[1]) !== day) return [];
  return m[2] ? m[2].split(",").filter(Boolean) : [];
}
function setBondUsedToday_(memory, day, type) {
  var used = getBondUsedToday_(memory, day);
  if (used.indexOf(type) < 0) used.push(type);
  var marker = "【羈絆日】" + day + ":" + used.join(",");
  var s = String(memory || "");
  if (/【羈絆日】\d+:[^|【]*/.test(s)) return s.replace(/【羈絆日】\d+:[^|【]*/, marker);
  return (s ? s + "｜" : "") + marker;
}

// 💕 羈絆互動（純按鈕，無對話框）：閒聊／共餐／並肩特訓／促膝夜談。每種每遊戲日限一次、跨日重置。
//   觸發角色語氣 AI 短劇＋升羈絆；羈絆會餵給路線自然浮現（深羈絆→偏 Fate 線）。
var BOND_ACTS = {
  chat: { label: '閒聊', bond: 4, frame: '在巡查或歇腳的空檔閒話家常——些瑣碎的日常、對這個時代的見聞、半開玩笑的拌嘴' },
  meal: { label: '共餐', bond: 6, frame: '一同用一頓飯——食物的香氣、從者進食的神態、飯桌上難得卸下戒備的尋常溫度' },
  train: { label: '並肩特訓', bond: 5, frame: '並肩切磋武藝、調整默契——汗水、喘息、招式間的信任，以及戰技之外悄然滋長的默契' },
  talk: { label: '促膝夜談', bond: 8, frame: '夜深人靜時的促膝長談——交換各自背負的過往與此刻的心緒，一句句靠近彼此的內裡' }
};
function actionBond(userData, pcId, sheets) {
  const type = String(userData.bondType || "").trim();
  const act = BOND_ACTS[type];
  if (!act) return JSON.stringify({ success: false, message: "未知的羈絆互動。" });
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無從者可相伴。" });
  const svName = pcData[svIdx][COL.PC.NAME];
  const masterName = pcData[pIdx][COL.PC.NAME];

  // 日限檢查
  const clk = getClock_(myGameId);
  const day = clk ? clk.day : 1;
  const band = clk ? timeBand_(clk.hour) : "夜";
  let usedToday = getBondUsedToday_(pcData[pIdx][COL.PC.MEMORY], day);
  if (usedToday.indexOf(type) >= 0) {
    return JSON.stringify({ success: false, message: `今日已與「${svName}」${act.label}過了，來日方長，明日再敘。`, bondUsed: usedToday });
  }

  // 升羈絆＋寫回日限標記
  raiseBond_(sheets, masterName, svName, act.bond);
  pcData[pIdx][COL.PC.MEMORY] = setBondUsedToday_(pcData[pIdx][COL.PC.MEMORY], day, type);
  sheets.pc.getRange(pIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[pIdx][COL.PC.MEMORY]);
  usedToday = getBondUsedToday_(pcData[pIdx][COL.PC.MEMORY], day);

  // 取最新羈絆值供顯示
  let bondNow = 0;
  if (sheets.rel) {
    const rel = sheets.rel.getDataRange().getValues().find(r => r[COL.REL.PC] === masterName && r[COL.REL.NPC] === svName);
    if (rel) bondNow = parseInt(rel[COL.REL.FAV]) || 0;
  }

  // ⚔️ 卸防突襲：相伴談心時門戶大開，同地若有清醒敵從者→趁隙重擊
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, userData, 1.2);

  let aiPrompt;
  if (ambush) {
    aiPrompt = `【系統·相伴遭突襲·已裁定】御主『${masterName}』與「${svName}」正${act.label}、卸下心防之際，潛伏同地的敵從者「${ambush.enemyName}」${ambush.stealthy ? '自暗處無聲突襲' : '抓準這破綻殺出'}，一擊重創「${svName}」（−${ambush.dmg}）${ambush.destroyed ? '，其靈基崩潰、化作光點消散，御主敗北' : ''}。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫溫存被突襲撕裂的驚變與兇險，${ambush.destroyed ? '及從者消滅的痛楚（語氣留白）' : '及從者強撐重傷護主的瞬間'}。傷害與勝負已由系統結算。\n` +
      ``;
  } else {
    aiPrompt = masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
      `【系統·羈絆已結算】御主『${masterName}』與從者「${svName}」${act.label}，兩人的羈絆又深了一分（時值${band}）。\n` +
      `★以 Fate／TYPE-MOON 筆觸寫一段【精煉 90~150 字、輕快不冗長】${svName} 與御主${act.frame}的小品。務必貼合上方「演出依據」中的性格、自稱與口吻，演出其獨有神態，點到為止留餘味。\n` +
      `★【show, don't tell】用言行、神態、停頓去流露情感與性格，絕不可直白說出其「願望／個性／萌點」等設定詞；停在含蓄的留白。\n` +
      `★【鐵律】保持溫暖日常或戰友情誼的分寸，不踰矩。`;
  }
  return JSON.stringify({
    success: true, aiPrompt: aiPrompt, bond: bondNow, bondUsed: usedToday,
    ambush: !!ambush, defeat: ambush ? ambush.defeat : false, dreamPrompt: ambush ? ambush.dreamPrompt : "",
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// ✨ 發動禮裝（主動型）：吃迴路（不足走火）＋耗魔力＋扣充能，對同地敵從者/敵御主造成魔力傷害
function actionUseMystic(userData, pcId, sheets) {
  const npcName = String(userData.npcName || "").trim();
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const memory = String(pcData[pIdx][COL.PC.MEMORY] || "");
  const id = getMystic_(memory);
  const code = MYSTIC_CODES[id];
  if (!code) return JSON.stringify({ success: false, message: "你並未持有禮裝。" });
  if (code.type !== 'active') return JSON.stringify({ success: false, message: `「${code.name}」是被動禮裝，持有即生效。` });

  let charges = getMysticCharges_(memory); if (charges < 0) charges = code.charges;
  if (charges <= 0) return JSON.stringify({ success: false, message: `「${code.name}」的充能已耗盡。` });

  const isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, message: "行動力不足以發動禮裝——請休息恢復。" });
  const mpCur = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  if (mpCur < Math.round(code.mp * 0.5)) return JSON.stringify({ success: false, message: `御主魔力不足以驅動「${code.name}」。` });

  const wantFaction = code.target === 'master' ? '敵御主' : '敵從者';
  const myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  const nIdx = pcData.findIndex(r => String(r[COL.PC.NAME]).includes(npcName) && String(r[COL.PC.FACTION]) === wantFaction && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === myLoc);
  if (nIdx === -1) return JSON.stringify({ success: false, message: code.target === 'master' ? "此地沒有可狙擊的敵御主。" : "此地沒有可轟擊的敵從者。" });

  // 🔧 迴路門檻 → 走火（不足越多越易反噬/啞火）
  const circuits = masterCircuits_(pcData[pIdx]);
  let powerMul = Math.min(1, code.req > 0 ? circuits / code.req : 1);
  let backfire = false, fizzle = false;
  if (circuits < code.req) {
    const gap = (code.req - circuits) / code.req;
    if (Math.random() < gap * 0.80) backfire = true;
    if (Math.random() < gap * 0.35) fizzle = true;
  }

  // 扣 AP / 魔力 / 充能
  let ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(myGameId, 1).ap; clock = clockLabel_(myGameId); } catch (e) { } }
  const mpCost = code.mp + (backfire ? Math.round(code.mp * 0.5) : 0);
  pcData[pIdx][COL.PC.MP] = Math.max(0, mpCur - mpCost);
  charges -= 1;
  pcData[pIdx][COL.PC.MEMORY] = setMysticCharges_(memory, charges);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);

  const ctx = { myGameId: myGameId, acctName: String(userData.acctName || ""), masterName: pcData[pIdx][COL.PC.NAME] };
  const tgtName = String(pcData[nIdx][COL.PC.NAME]);
  let report = { mystic: true, name: code.name, target: tgtName, backfire: backfire, fizzle: fizzle, charges: charges, victory: false, dmg: 0, destroyed: "", godRevived: false, masterKilled: false, fade: "" };
  let aiCore = "";

  if (fizzle) {
    aiCore = `禮裝「${code.name}」因御主魔術迴路不足（${circuits}／需求 ${code.req}），魔力潰散、當場啞火，未能成形。`;
  } else {
    let dmg = Math.round((30 + circuits * 2) * code.power * powerMul);
    if (backfire) dmg = Math.round(dmg * 0.5);
    report.dmg = dmg;
    if (code.target === 'master') {
      let mhp = parseInt(pcData[nIdx][COL.PC.HP]) || 0, mafter = mhp - dmg;
      if (mafter <= 0) {
        pcData[nIdx][COL.PC.ID] = "DEAD_" + String(pcData[nIdx][COL.PC.ID]); pcData[nIdx][COL.PC.HP] = 0;
        pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "鮮血浸染", "姿勢": "倒地", "負面": "迴路碎裂·身亡", "顏面": "錯愕" });
        sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);
        const gIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === myLoc);
        if (gIdx >= 0) {
          report.fade = String(pcData[gIdx][COL.PC.NAME]);
          pcData[gIdx][COL.PC.ID] = "DEAD_" + String(pcData[gIdx][COL.PC.ID]); pcData[gIdx][COL.PC.HP] = 0;
          pcData[gIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "化作光點", "負面": "御主既亡·消滅", "顏面": "消散" });
          sheets.pc.getRange(gIdx + 1, 1, 1, pcData[gIdx].length).setValues([pcData[gIdx]]);
        }
        report.masterKilled = true;
        if (aliveEnemyServants_(sheets, myGameId) <= 0) { report.victory = true; if (ctx.acctName) { incrementWin_(ctx.acctName); recordHistory_(ctx.acctName, "勝", ctx.masterName, "以起源彈狙殺敵御主，奪得聖杯。"); recordWinSpeed_(ctx.acctName, myGameId); } }
        aiCore = `${code.flavor}子彈貫入敵御主「${tgtName}」，魔術迴路碎裂、當場斃命${report.fade ? `，其從者「${report.fade}」失去魔力供給、隨之消散` : ""}。`;
      } else {
        pcData[nIdx][COL.PC.HP] = mafter; sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);
        aiCore = `${code.flavor}子彈擊中敵御主「${tgtName}」，重創其魔術迴路，但未致命。`;
      }
    } else {
      const r = applyMysticDamageToServant_(sheets, pcData, nIdx, dmg, ctx);
      report.destroyed = r.destroyed; report.godRevived = r.godRevived; report.victory = r.victory;
      report.defHp = r.after; report.defHpMax = parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 0;
      aiCore = `${code.flavor}對「${tgtName}」造成 ${dmg} 點重創${r.destroyed ? "，其靈基崩潰、徹底消滅" : ""}${r.godRevived ? "，但對方竟自死亡歸來" : ""}。`;
    }
  }

  const aiPrompt = `【系統·禮裝已裁定】御主『${ctx.masterName}』發動禮裝「${code.name}」` +
    `（迴路 ${circuits}／需求 ${code.req}${backfire ? "，迴路不足·走火反噬" : ""}）。${aiCore}（餘充能 ${charges}）\n` +
    `★以 Fate／TYPE-MOON 筆觸描寫這次禮裝發動的奇景與威能（一段即可）${backfire ? "，並演出迴路駕馭不全、魔力反噬御主自身的險象" : ""}。效果與勝負已由系統結算。\n` +
    ``;
  return JSON.stringify({
    success: true, aiPrompt: aiPrompt, report: report,
    victory: report.victory, charges: charges,
    clock: clock, ap: ap, apMax: AP_PER_DAY, statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// ── 🤝 結盟（暫時非敵對）：盟約標記存於敵御主/敵從者列 MEMORY 的【盟約至】<day> ──
function isAllied_(row) { return /【盟約至】\d+/.test(String(row && row[COL.PC.MEMORY] || "")); }
// 🤝 當前世界是否尚有在世盟友（敵御主／敵從者·結盟中）——用於情報共享（無視戰爭迷霧）
function hasAllyInGame_(pcData, gameId) {
  for (var i = 1; i < pcData.length; i++) {
    if (gameId && String(pcData[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    var f = String(pcData[i][COL.PC.FACTION] || "");
    if ((f === "敵御主" || f === "敵從者") && !String(pcData[i][COL.PC.ID]).startsWith("DEAD_") && isAllied_(pcData[i])) return true;
  }
  return false;
}
function allyUntil_(row) { var m = String(row && row[COL.PC.MEMORY] || "").match(/【盟約至】(\d+)/); return m ? parseInt(m[1]) : 0; }
function setAllyMem_(memory, untilDay) {
  var s = String(memory || "");
  if (/【盟約至】\d+/.test(s)) return s.replace(/【盟約至】\d+/, "【盟約至】" + untilDay);
  return (s ? s + "｜" : "") + "【盟約至】" + untilDay;
}
function clearAllyMem_(memory) { return String(memory || "").replace(/｜?【盟約至】\d+/, ""); }

// 結盟意願（GAS 判定，不靠 AI）：依對方御主性格/陣營 ＋ 戰局階段 ＋ 共同強敵
function allianceWillingness_(masterRow, aliveFoes) {
  var p = String(masterRow[COL.PC.PREF] || "") + "｜" + String(masterRow[COL.PC.MEMORY] || "") + "｜" + String(masterRow[COL.PC.BACK] || "");
  var w = 0.42;
  if (/務實|冷靜|算計|理性|成長|自卑|好強|悲憤|拯救|守護|溫柔|不擇手段|名門/.test(p)) w += 0.25; // 肯談的務實/有目的者
  if (/孤高|傲慢|瘋狂|狂|虔誠|扭曲|壓抑|暴君|惡意|看好戲|喜悅|空虛|純粹/.test(p)) w -= 0.32;     // 孤狼/瘋狂/看戲者難說動
  if (aliveFoes <= 3) w -= 0.45; else if (aliveFoes >= 6) w += 0.15; // 「最後只能剩一個」——剩越少越不肯
  return Math.max(0.05, Math.min(0.9, w));
}

// 🤝 交涉結盟：對同地敵御主提議；GAS 判定成敗，AI 只演出談判場景。成盟＝該御主＋其從者暫時非敵對。
function actionProposeAlliance(userData, pcId, sheets) {
  const npcName = String(userData.npcName || "").trim();
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  const mIdx = pcData.findIndex(r => String(r[COL.PC.NAME]).includes(npcName) && String(r[COL.PC.FACTION]) === "敵御主" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === myLoc);
  if (mIdx === -1) return JSON.stringify({ success: false, message: "此地沒有可交涉的敵御主。" });
  if (isAllied_(pcData[mIdx])) return JSON.stringify({ success: false, message: `你已與「${pcData[mIdx][COL.PC.NAME]}」結盟。` });

  const isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, message: "行動力不足以交涉——請休息恢復。" });

  const aliveFoes = aliveEnemyServants_(sheets, myGameId);
  const w = allianceWillingness_(pcData[mIdx], aliveFoes);
  const ok = Math.random() < w;
  const masterName = String(pcData[mIdx][COL.PC.NAME]);

  let ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(myGameId, 1).ap; clock = clockLabel_(myGameId); } catch (e) { } }
  const clk = getClock_(myGameId); const day = clk ? clk.day : 1;

  let aiPrompt;
  if (ok) {
    const until = day + 3; // 盟約效期約 3 日
    // 盟主＋其同地從者一併標記盟約
    pcData[mIdx][COL.PC.MEMORY] = setAllyMem_(pcData[mIdx][COL.PC.MEMORY], until);
    sheets.pc.getRange(mIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[mIdx][COL.PC.MEMORY]);
    const gIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === myLoc);
    let allyServant = "";
    if (gIdx >= 0) { allyServant = String(pcData[gIdx][COL.PC.NAME]); pcData[gIdx][COL.PC.MEMORY] = setAllyMem_(pcData[gIdx][COL.PC.MEMORY], until); sheets.pc.getRange(gIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[gIdx][COL.PC.MEMORY]); }
    logWarEvent_(myGameId, `與敵御主「${masterName}」${allyServant ? `（從者「${allyServant}」）` : ""}締結同盟、暫時休兵（至第 ${until} 日）。`, String(userData.acctName || ""));
    aiPrompt = servantCard_(gIdx >= 0 ? pcData[gIdx] : null) +
      `【系統·結盟已達成·已裁定】御主『${pcData[pIdx][COL.PC.NAME]}』向敵御主「${masterName}」${allyServant ? `（從者「${allyServant}」）` : ""}提議結盟，對方權衡利害後接受了——雙方暫時休兵、互不侵犯（至第 ${until} 日前後）。\n` +
      `★以 Fate／TYPE-MOON 筆觸【約 120~180 字】演出這場談判：「${masterName}」依其性格回應（務實的權衡、開出條件或冷淡的「暫時」），最後達成不穩固的同盟。對方的算計與保留要演出來，留一絲不信任的伏筆。\n` +
      ``;
    return JSON.stringify({ success: true, allied: true, aiPrompt: aiPrompt, master: masterName, until: until, clock: clock, ap: ap, apMax: AP_PER_DAY, statusString: getFreshStatusString(pcId, pIdx, sheets) });
  } else {
    aiPrompt = `【系統·結盟破局·已裁定】御主『${pcData[pIdx][COL.PC.NAME]}』向敵御主「${masterName}」提議結盟，對方拒絕了。\n` +
      `★以 Fate／TYPE-MOON 筆觸【約 100~150 字】演出「${masterName}」依其性格回絕的瞬間（嘲諷、警戒、或「聖杯只能有一個」的冷冽）。氣氛轉為一觸即發，但本回合不開打。\n` +
      ``;
    return JSON.stringify({ success: true, allied: false, aiPrompt: aiPrompt, master: masterName, clock: clock, ap: ap, apMax: AP_PER_DAY, statusString: getFreshStatusString(pcId, pIdx, sheets) });
  }
}

// 💔 撕毀盟約：解除與某敵御主(及其從者)的同盟，恢復敵對
function actionBreakAlliance(userData, pcId, sheets) {
  const npcName = String(userData.npcName || "").trim();
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  let broke = 0, who = "";
  for (let i = 1; i < pcData.length; i++) {
    if (String(pcData[i][COL.PC.GAME_ID] || "") !== myGameId) continue;
    const fac = String(pcData[i][COL.PC.FACTION]);
    if ((fac === "敵御主" || fac === "敵從者") && isAllied_(pcData[i]) && (!npcName || String(pcData[i][COL.PC.NAME]).includes(npcName))) {
      pcData[i][COL.PC.MEMORY] = clearAllyMem_(pcData[i][COL.PC.MEMORY]);
      sheets.pc.getRange(i + 1, COL.PC.MEMORY + 1).setValue(pcData[i][COL.PC.MEMORY]);
      if (fac === "敵御主") who = String(pcData[i][COL.PC.NAME]);
      broke++;
    }
  }
  if (!broke) return JSON.stringify({ success: false, message: "你目前沒有與此人結盟。" });
  logWarEvent_(myGameId, `單方面撕毀與「${who || npcName}」的盟約，雙方重回敵對。`, String(userData.acctName || ""));
  const aiPrompt = `【系統·盟約撕毀·已裁定】御主『${pcData[pIdx][COL.PC.NAME]}』單方面撕毀與「${who || npcName}」的盟約，雙方重回敵對。\n` +
    `★以 Fate／TYPE-MOON 筆觸【約 80~130 字】演出背叛/決裂的一瞬間張力。`;
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// ⏳ 盟約自然瓦解：效期到 或 存活敵從者 ≤3（最後只能剩一個→強制翻臉）。回傳破裂的御主名單。
function breakStaleAlliances_(sheets, gameId) {
  try {
    var clk = getClock_(gameId); var day = clk ? clk.day : 1;
    var data = sheets.pc.getDataRange().getValues();
    var aliveFoes = 0;
    for (var i = 1; i < data.length; i++) { if (String(data[i][COL.PC.FACTION]) === "敵從者" && String(data[i][COL.PC.GAME_ID] || "") === gameId && !String(data[i][COL.PC.ID]).startsWith("DEAD_")) aliveFoes++; }
    var forceAll = aliveFoes <= 3;
    var broken = [];
    for (var j = 1; j < data.length; j++) {
      var fac = String(data[j][COL.PC.FACTION]);
      if ((fac === "敵御主" || fac === "敵從者") && String(data[j][COL.PC.GAME_ID] || "") === gameId && isAllied_(data[j])) {
        if (forceAll || day > allyUntil_(data[j])) {
          data[j][COL.PC.MEMORY] = clearAllyMem_(data[j][COL.PC.MEMORY]);
          sheets.pc.getRange(j + 1, COL.PC.MEMORY + 1).setValue(data[j][COL.PC.MEMORY]);
          if (fac === "敵御主") { broken.push(String(data[j][COL.PC.NAME])); logWarEvent_(gameId, `與「${String(data[j][COL.PC.NAME])}」的同盟${forceAll ? '因戰局逼近終局而瓦解' : '到期失效'}，重回敵對。`); }
        }
      }
    }
    return { broken: broken, forced: forceAll && broken.length > 0 };
  } catch (e) { return { broken: [], forced: false }; }
}

// 取得 PC↔對象 羈絆值（無紀錄＝0）
function getBond_(sheets, pcName, npcName) {
  if (!sheets.rel) return 0;
  try {
    var rd = sheets.rel.getDataRange().getValues();
    for (var i = 1; i < rd.length; i++) {
      if (String(rd[i][COL.REL.PC]) === pcName && String(rd[i][COL.REL.NPC]) === npcName) return parseInt(rd[i][COL.REL.FAV]) || 0;
    }
  } catch (e) { }
  return 0;
}
// 羈絆 +delta（無此列則新建，盟友起步約 40），回傳新值
function bumpBond_(sheets, pcName, npcName, delta, tag) {
  if (!sheets.rel) return 0;
  try {
    var rd = sheets.rel.getDataRange().getValues();
    for (var i = 1; i < rd.length; i++) {
      if (String(rd[i][COL.REL.PC]) === pcName && String(rd[i][COL.REL.NPC]) === npcName) {
        var v = Math.max(0, Math.min(100, (parseInt(rd[i][COL.REL.FAV]) || 0) + delta));
        sheets.rel.getRange(i + 1, COL.REL.FAV + 1).setValue(v);
        return v;
      }
    }
    var nv = Math.max(0, Math.min(100, 40 + delta));
    sheets.rel.appendRow([pcName, npcName, nv, tag || "盟友", "", "聖杯戰爭中暫時結盟、漸生交情", ""]);
    return nv;
  } catch (e) { return 0; }
}

// 🤝 與盟友共處／共濟魔力：對同地盟友（敵御主或敵從者·結盟中）交流增進羈絆——同盟的「交流」維度。
//   原作依據：聖杯戰爭中的同盟羈絆（遠坂凜↔士郎並肩信賴、共通後勤）。羈絆養至 90↑ → 戰後可納入鑑賞名冊。
//   ★此處僅止於 SFW 的信賴／曖昧鋪陳（fade）；真・親密一律留給戰後鑑賞世界，絕不在戰場開啟慾海引擎。
function actionAllyBond(userData, pcId, sheets) {
  const npcName = String(userData.npcName || "").trim();
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  const aIdx = pcData.findIndex(r => String(r[COL.PC.NAME]).includes(npcName)
    && (String(r[COL.PC.FACTION]) === "敵御主" || String(r[COL.PC.FACTION]) === "敵從者")
    && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_")
    && isAllied_(r) && String(r[COL.PC.LOC]).trim() === myLoc);
  if (aIdx === -1) return JSON.stringify({ success: false, message: "此地沒有可交流的盟友——須與盟友同處一地。" });

  const isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, message: "行動力不足以從容相處——請『休息』恢復後再來。" });

  const masterName = String(pcData[pIdx][COL.PC.NAME]);
  const allyName = String(pcData[aIdx][COL.PC.NAME]);
  const allyIsMaster = String(pcData[aIdx][COL.PC.FACTION]) === "敵御主";
  const allyPref = String(pcData[aIdx][COL.PC.PREF] || "神祕莫測");

  let ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(myGameId, 1).ap; clock = clockLabel_(myGameId); } catch (e) { } }

  // ⚔️ 卸防突襲：與盟友交流時門戶大開，同地若有「未結盟」敵從者→趁隙重擊我方從者
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, userData, 1.3);
  if (ambush) {
    const aiPromptA = `【系統·盟誼遭突襲·已裁定】御主『${masterName}』正與盟友「${allyName}」交心共處、卸下戒備之際，潛伏同地的敵從者「${ambush.enemyName}」${ambush.stealthy ? '自陰影中無聲撲出' : '抓住這破綻猛然殺到'}，一記重擊狠狠貫入我方從者（−${ambush.dmg}）${ambush.destroyed ? '，其靈基當場崩潰、化作光點消散，御主敗北' : ''}。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫盟誼的私密一刻被突襲撕裂的驚變${ambush.destroyed ? '、從者消滅的痛楚（語氣留白）' : '、從者強撐重傷護主的瞬間'}。傷害與勝負已由系統結算。\n` +
      ``;
    return JSON.stringify({ success: true, aiPrompt: aiPromptA, clock: clock, ap: ap, apMax: AP_PER_DAY, ambush: true, defeat: ambush.defeat, dreamPrompt: ambush.dreamPrompt || "", statusString: getFreshStatusString(pcId, pIdx, sheets) });
  }

  const gain = 6 + Math.floor(Math.random() * 6); // +6~11
  const after = bumpBond_(sheets, masterName, allyName, gain, allyIsMaster ? "盟友御主" : "盟友從者");
  let unlocked = false;
  if (after >= 90 && !/【鑑賞緣】/.test(String(pcData[aIdx][COL.PC.MEMORY] || ""))) {
    pcData[aIdx][COL.PC.MEMORY] = String(pcData[aIdx][COL.PC.MEMORY] || "") + "｜【鑑賞緣】";
    sheets.pc.getRange(aIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[aIdx][COL.PC.MEMORY]);
    unlocked = true;
  }

  // 羈絆分級·嚴格控制親疏（盟友＝暫時利益結合，低羈絆務必冷淡，唯 90+ 才解鎖親近）
  const tier = after >= 90 ? "【羈絆深厚】可流露真切的信任與溫柔（守住性格內核、不踰矩，真親密留待奪杯後鑑賞）"
    : after >= 70 ? "【羈絆漸增】有限度的信任、偶爾流露一絲真心，但仍保留戒備與分寸，不主動親暱"
    : after >= 45 ? "【羈絆尚淺】純屬利益結盟：維持戒備、客套與算計，【絕不可】親近或交心，至多一閃而過的微妙交集"
    : "【幾無私交】冷淡、警惕、公事公辦，話語間滿是試探與保留";
  // 盟友從者→servantCard_(含狂化禁言等口吻)；盟友御主→簡短性格
  const allyCard = allyIsMaster ? `〈盟友御主「${allyName}」·演出依據(僅內化、禁複述)〉性格：${allyPref}。\n` : servantCard_(pcData[aIdx]);
  const aiPrompt = masterCard_(pcData[pIdx]) + allyCard +
    `【系統·盟誼】御主『${masterName}』與盟友「${allyName}」${allyIsMaster ? '共處' : '交流'}，當前羈絆 ${after}/100。\n` +
    `★Fate 筆觸【90~140字】寫一段此次共處的小品，自由發揮、勿每次都同一套說辭。語氣親疏【務必嚴格】貼合當前羈絆：${tier}。對方仍是「暫時」盟友，留一絲各自的算計與保留。show, don't tell。` +
    (unlocked ? `（此次羈絆首度臻至深處，結尾可用一個眼神或半句未盡之言，含蓄點出情誼悄然越過了「暫時」的界線。）` : "");
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, bond: after, unlocked: unlocked, ally: allyName, clock: clock, ap: ap, apMax: AP_PER_DAY, ambush: false, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// 🗝️ 破戒奪僕：對「打殘(HP<35%)的敵從者」斬契奪為第二從者（需破戒之力＋燃一道令咒；上限 2 名從者）
function actionRuleBreakSteal(userData, pcId, sheets) {
  const npcName = String(userData.npcName || "").trim();
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  if (!canRuleBreak_(pcData, pIdx, myGameId)) return JSON.stringify({ success: false, message: "你不具破戒全咒之力——須召喚 Caster（美狄亞）或持有破戒禮裝。" });
  const svCount = pcData.filter(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_")).length;
  if (svCount >= 2) return JSON.stringify({ success: false, message: "你已同時駕馭兩名從者，靈魂的負荷已達極限，無法再奪。" });
  let seals = getPlayerSeals_(pcData[pIdx][COL.PC.MEMORY]);
  if (seals <= 0) return JSON.stringify({ success: false, message: "重新締約需燃燒一道令咒，但你的令咒已用盡。" });
  const myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  const nIdx = pcData.findIndex(r => String(r[COL.PC.NAME]).includes(npcName) && String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === myLoc);
  if (nIdx === -1) return JSON.stringify({ success: false, message: "此地沒有這名敵從者。" });
  const hp = parseInt(pcData[nIdx][COL.PC.HP]) || 0, hpMax = parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1;
  if (hp / hpMax >= 0.35) return JSON.stringify({ success: false, message: `「${pcData[nIdx][COL.PC.NAME]}」靈基仍旺（${Math.round(hp / hpMax * 100)}%），破戒奪僕無法奏效——須先在戰鬥中將其打殘至 35% 以下。` });

  const stolenName = String(pcData[nIdx][COL.PC.NAME]);
  pcData[nIdx][COL.PC.FACTION] = "從者";
  pcData[nIdx][COL.PC.HP] = Math.max(hp, Math.round(hpMax * 0.5));
  pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "契約重締", "姿勢": "屈膝聽令", "負面": "無", "顏面": "複雜而臣服" });
  pcData[nIdx][COL.PC.CONTRIB] = 0;
  pcData[nIdx][COL.PC.MEMORY] = String(pcData[nIdx][COL.PC.MEMORY] || "") + "｜【破戒奪取】契約已轉予新御主。";
  sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);
  seals -= 1;
  pcData[pIdx][COL.PC.MEMORY] = setPlayerSeals_(pcData[pIdx][COL.PC.MEMORY], seals);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  try { raiseBond_(sheets, pcData[pIdx][COL.PC.NAME], stolenName, 10); } catch (e) { }

  const aiPrompt = `【系統·破戒奪僕·已裁定】御主以破戒全咒（緣紅短劍）斬斷「${stolenName}」與原御主的契約、強行重締為己用——「${stolenName}」自此成為你的第二從者（燃一道令咒，餘 ${seals} 道）。\n` +
    `★以 Fate／TYPE-MOON 筆觸描寫緣紅短劍刺入、舊契約如琉璃寸寸碎裂、新締約的魔力烙印纏上手背的瞬間，與這名從者被迫易主的複雜神情（一段即可）。已結算。\n` +
    ``;
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, stolen: stolenName, seals: seals, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// ⚔️ 卸防突襲：在同地有清醒敵從者時做「補魔／羈絆／休息」等卸下防備之舉，會招致敵從者趁隙重擊我方從者
//   （氣息遮斷／暗殺職階更致命）。回 null＝無敵不觸發；否則 {enemyName,dmg,defeat,dreamPrompt,after,stealthy}。
function enemyAmbushOnServant_(sheets, pcData, pIdx, gameId, userData, baseMul) {
  const myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  const eIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === myLoc && !isAllied_(r));
  if (eIdx === -1) return null;
  const svIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (svIdx === -1) return null;
  const enemyC = rowToCombatant_(pcData[eIdx]);
  const svC = rowToCombatant_(pcData[svIdx]);
  const probe = resolveFateBattle_(enemyC, svC, {});
  let mul = baseMul || 1.4;
  const stealthy = String(pcData[eIdx][COL.PC.RANK]) === 'Assassin' || !!hasFx_(enemyC, 'stealth');
  if (stealthy) mul *= 1.4; // 氣息遮斷／暗殺趁虛而入更致命
  const dmg = Math.max(1, Math.round((probe.damage || 1) * mul));
  const out = { enemyName: String(pcData[eIdx][COL.PC.NAME]), dmg: dmg, destroyed: false, defeat: false, dreamPrompt: "", after: 0, stealthy: stealthy };
  let hp = parseInt(pcData[svIdx][COL.PC.HP]) || 0, after = hp - dmg;
  if (after <= 5 && hasFx_(svC, 'survive') && hp > 1) after = 1;
  if (after <= 0 && hasFx_(svC, 'god_hand')) {
    const lives = getGodHandLives_(pcData[svIdx][COL.PC.MEMORY]);
    if (lives > 0) { after = Math.max(1, Math.round((parseInt(pcData[svIdx][COL.PC.MAX_HP]) || 480) * 0.4)); pcData[svIdx][COL.PC.MEMORY] = setGodHandLives_(pcData[svIdx][COL.PC.MEMORY], lives - 1); }
  }
  if (after <= 0) {
    out.destroyed = true;
    pcData[svIdx][COL.PC.ID] = "DEAD_" + String(pcData[svIdx][COL.PC.ID]); pcData[svIdx][COL.PC.HP] = 0;
    pcData[svIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "卸防遭突襲·靈基崩潰", "顏面": "已無生息" });
    // 🗝️ 雙從者：仍有從者存活則不算敗
    let stillAlive = 0;
    for (var pai = 1; pai < pcData.length; pai++) { if (String(pcData[pai][COL.PC.FACTION]) === "從者" && String(pcData[pai][COL.PC.GAME_ID] || "") === gameId && !String(pcData[pai][COL.PC.ID]).startsWith("DEAD_")) stillAlive++; }
    if (stillAlive <= 0) {
      out.defeat = true;
      const wish = extractWish_(pcData[pIdx][COL.PC.MEMORY]);
      out.dreamPrompt = buildDreamPrompt_(pcData[pIdx][COL.PC.NAME], wish, String(pcData[svIdx][COL.PC.NAME]));
      const acctD = String(userData.acctName || ""); if (acctD) recordHistory_(acctD, "敗", String(pcData[svIdx][COL.PC.NAME]), `「${pcData[svIdx][COL.PC.NAME]}」卸下防備時遭「${out.enemyName}」突襲斬殺。`);
    }
  } else {
    pcData[svIdx][COL.PC.HP] = after;
  }
  out.after = parseInt(pcData[svIdx][COL.PC.HP]) || 0;
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  return out;
}

// ── 🩸 燃燒生命強撐（second wind）：透支體力換 AP，每遊戲日一次（MEMORY【強撐】D）──
function getSecondWindDay_(memory) { var m = String(memory || "").match(/【強撐】(\d+)/); return m ? parseInt(m[1]) : 0; }
function setSecondWindDay_(memory, day) {
  var s = String(memory || "");
  if (/【強撐】\d+/.test(s)) return s.replace(/【強撐】\d+/, "【強撐】" + day);
  return (s ? s + "｜" : "") + "【強撐】" + day;
}
// 🩸 強撐：沒 AP 又被困時的保命解——扣御主生命換 +4 AP，每日一次（不燒令咒）
function actionSecondWind(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  if (myGameId.indexOf("g_") !== 0) return JSON.stringify({ success: false, message: "此處無需強撐。" });
  const clk = getClock_(myGameId); const day = clk ? clk.day : 1;
  if (getSecondWindDay_(pcData[pIdx][COL.PC.MEMORY]) === day) return JSON.stringify({ success: false, message: "今日已透支過一次——再燃燒生命會有性命之危，先歇息恢復吧。" });
  if (clk && clk.ap >= AP_PER_DAY - 1) return JSON.stringify({ success: false, message: "行動力尚足，毋須燃燒生命強撐。" });
  const maxHp = parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 120;
  const cur = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
  const cost = Math.max(10, Math.round(maxHp * 0.20));
  if (cur <= cost) return JSON.stringify({ success: false, message: "你的身體太過虛弱，再強撐恐危及性命——請務必先休息或脫離。" });
  pcData[pIdx][COL.PC.HP] = cur - cost;
  pcData[pIdx][COL.PC.MEMORY] = setSecondWindDay_(pcData[pIdx][COL.PC.MEMORY], day);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  const ap = grantAp_(myGameId, 4);
  const aiPrompt = `【系統·強撐已結算】御主透支魔術迴路與體力、燃燒生命力強行擠出最後的行動之力（HP −${cost}，行動力 +4＝${ap}/${AP_PER_DAY}）。\n` +
    `★以 Fate／TYPE-MOON 筆觸描寫御主咬牙硬撐、迴路過載灼痛、以意志逼出餘力的一幕（一段即可）。已結算。\n` +
    ``;
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, ap: ap, apMax: AP_PER_DAY, clock: clockLabel_(myGameId), statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// ── 🏕️ 陣地（工房）：存於御主 MEMORY【陣地】loc，駐留該地時供魔得工房加成 ──
function getWorkshop_(memory) { var m = String(memory || "").match(/【陣地】([^|【]+)/); return m ? m[1].trim() : ""; }
function setWorkshopMemory_(memory, loc) {
  var s = String(memory || "");
  if (/【陣地】[^|【]*/.test(s)) return s.replace(/【陣地】[^|【]*/, "【陣地】" + loc);
  return (s ? s + "｜" : "") + "【陣地】" + loc;
}

// 🏕️ 設置陣地：把當前地設為工房（提升駐留供魔）。耗 1 AP。
function actionSetWorkshop(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const isFate = myGameId.indexOf("g_") === 0;
  const loc = String(pcData[pIdx][COL.PC.LOC] || "").trim();
  if (!loc) return JSON.stringify({ success: false, message: "無法在虛無之地佈設陣地。" });
  if (getWorkshop_(pcData[pIdx][COL.PC.MEMORY]) === loc) return JSON.stringify({ success: false, message: `「${loc}」已是你的陣地。` });
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, message: "行動力不足以佈設陣地——請休息恢復。" });
  pcData[pIdx][COL.PC.MEMORY] = setWorkshopMemory_(pcData[pIdx][COL.PC.MEMORY], loc);
  sheets.pc.getRange(pIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[pIdx][COL.PC.MEMORY]);
  let ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(myGameId, 1).ap; clock = clockLabel_(myGameId); } catch (e) { } }
  return JSON.stringify({ success: true, message: `已於「${loc}」佈設陣地（工房）——駐留此地時，從者供魔收入提升。`, clock: clock, ap: ap, apMax: AP_PER_DAY, economy: isFate ? playerServantEconomy_(sheets, pcId) : null });
}

// 🔍 搜索物資：回復御主魔力，偶察覺鄰近敵蹤（耗 1 AP）
function actionScavenge(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, message: "行動力不足以細細搜索——請休息恢復。" });
  // 回復御主魔力 ~30%
  const mpMax = parseInt(pcData[pIdx][COL.PC.MAX_MP]) || 80;
  const cur = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  const gain = Math.max(0, Math.min(mpMax, cur + Math.round(mpMax * 0.30)) - cur);
  pcData[pIdx][COL.PC.MP] = cur + gain;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  let ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(myGameId, 1).ap; clock = clockLabel_(myGameId); } catch (e) { } }
  // 30% 機率察覺鄰近敵蹤（揭露一名最近的未偵查敵）
  let intel = "";
  if (Math.random() < 0.35) {
    for (var i = 1; i < pcData.length; i++) {
      var fac = String(pcData[i][COL.PC.FACTION]);
      if ((fac === "敵御主" || fac === "敵從者") && String(pcData[i][COL.PC.GAME_ID] || "") === myGameId && !String(pcData[i][COL.PC.ID]).startsWith("DEAD_") && !pcData[i][COL.PC.SEEN]) {
        sheets.pc.getRange(i + 1, COL.PC.SEEN + 1).setValue(1);
        intel = `搜索間隱約察覺「${pcData[i][COL.PC.LOC]}」一帶有「${pcData[i][COL.PC.NAME]}」的氣息。`;
        break;
      }
    }
  }
  const msg = `搜索此地補給，導入零散魔力——御主魔力 +${gain}（${pcData[pIdx][COL.PC.MP]}/${mpMax}）。${intel || "此地別無所獲。"}`;
  return JSON.stringify({ success: true, message: msg, clock: clock, ap: ap, apMax: AP_PER_DAY, statusString: getFreshStatusString(pcId, pIdx, sheets) });
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
    `★【鐵律】只輸出夢境敘事，禁選項或系統字樣。`;
}


// ==========================================
// ⚔️ 多目標群戰裁決：解析玩家輸入中的 [攻擊XXX]敘述 標籤，依序逐一裁定
// 中途玩家陣亡則立即停止後續目標，並自動放過本次連擊中已被打昏者（不可能補刀）
// ==========================================

// ==========================================
// 🟢 輕量敘事專用路由：結算已由 GAS 完成，這裡只請 AI 補一段純文字描寫
// 不讀規矩表、不帶歷史、不解析 JSON 數值，token 砍到最低
// ==========================================
function actionNarrateOnly(userData, pcId, sheets) {
  const { promptText, isNsfw } = userData;

  const miniSystem = `你是《命運停駐之夜》的說書人。用 Fate／TYPE-MOON 筆觸、第一人稱「我」（玩家＝御主）、強制台灣繁體中文，依指令生動描寫一段劇情。【篇幅以下方指令指定的字數為準，務必節奏明快、不灌水、不堆砌華麗辭藻；無指定時預設精煉 100~160 字】。若為從者廝殺，把關鍵攻防、技能與寶具威能寫得有張力即可，不必逐回合流水帳。
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
    max_tokens: 720,            // 戰鬥約250字、其餘閒聊更短；各情境自指定字數
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
    return JSON.stringify({ success: true, text: "（此處因果已定，氣息微微一閃。）" });
  }
}

// ==========================================
// 🟢 連擊戰報專用輕量路由：同樣不讀規矩表，但帶 2 筆歷史以維持語氣連貫，
// 取代 actionMultiAttack 原本走的完整 play 管線。不產生 options，
// 因為連擊後直接點同地NPC名字(超連結)繼續打即可，不需要選項。
// ==========================================
function actionMultiAttackNarrate(userData, pcId, sheets) {
  const { promptText, isNsfw, touchedNames, knockedOut } = userData;

  const miniSystem = `你是《命運停駐之夜》的說書人。用 Fate／TYPE-MOON 筆觸、第一人稱「我」（玩家＝御主）、強制台灣繁體中文，依指令生動描寫一段交鋒過程（150~250字）。
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
    return JSON.stringify({ success: true, text: "（此處因果已定，氣息微微一閃。）" });
  }
}

function actionUpdateRelTag(userData, pcId, sheets) {
  const { targetName, newTagText } = userData;
  if (!sheets.rel) return JSON.stringify({ success: false, message: "系統異常：關係表不存在。" });
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
