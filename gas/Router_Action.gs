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
  "dev_resync_codex": actionDevResyncCodex,
  "purge_orphans": actionPurgeOrphans,
  "kanshou_companions": actionKanshouCompanions,
  "kanshou_add": actionKanshouAdd,
  "kanshou_remove": actionKanshouRemove,
  "kanshou_set_sex": actionKanshouSetSex,
  "kanshou_set_name": actionKanshouSetName,
  "prep_meal": actionPrepMeal,
  "get_full_status": actionGetFullStatus,
  "update_fate": actionUpdateFate,
  "update_rel_tag": actionUpdateRelTag,
  "create": actionManualNpc, // 御主創角(isCreate 分支)。手動建 NPC(manual_npc) 已移除、其 !isCreate 分支成死碼。
  "summon_servant": actionSummonServant,
  "get_heroes": actionGetHeroes,
  "get_masters": actionGetMasters,
  "get_tags": actionGetTags,
  "fate_battle": actionFateBattle,
  "use_seal": actionUseSeal,
  "mana_supply": actionManaSupply,
  "set_servant_output": actionSetServantOutput,
  "set_mage_realm": actionSetMageRealm,
  "set_rune_mode": actionSetRuneMode,
  "set_np_choice": actionSetNpChoice,
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
  "get_map_nodes": actionGetMapNodes,
  "move": actionMove,
  "sync": actionSync,
  "rest": actionRest,
  "play": actionPlay,
  "get_epic_history": actionGetEpicHistory,
  "leaderboard": actionLeaderboard,
  "war_chronicle": actionWarChronicle,
  "war_history_list": actionWarHistoryList,
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
  if (!handler) {
    return JSON.stringify({ success: false, message: `系統異常：未知的動作指令「${action}」` });
  }
  let out = handler(userData, pcId, sheets);
  // ⏳ 14天時限·中央攔截：任何「會推進時間」的動作(回應帶 clock 字串)若已跨過第14日 → 統一補敗北旗標，
  //   免每個 action 各自判。用回應現成的 clock(零額外時鐘讀)；僅在真跨日(罕見)才做一次眾生讀取建時限夢。
  if (String(pcId || "").indexOf("PC_") === 0 && !isKanshouCtx) {
    try {
      var ro = JSON.parse(out);
      if (ro && ro.success && !ro.victory && !ro.defeat && ro.clock) {
        var dym = String(ro.clock).match(/第\s*(\d+)\s*日/);
        if (dym && parseInt(dym[1]) > 14) {
          var pdata = sheets.pc.getDataRange().getValues();
          var prow = pdata.find(function (r) { return String(r[COL.PC.ID]) === pcId; });
          if (prow) {
            var gid = String(prow[COL.PC.GAME_ID] || "");
            var svRow = pdata.find(function (r) { return String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gid && !String(r[COL.PC.ID]).startsWith("DEAD_"); });
            ro.defeat = true; ro.deadline = true; ro.victory = false; ro.servantDream = "";
            if (!ro.dreamPrompt) ro.dreamPrompt = buildDreamPrompt_(String(prow[COL.PC.NAME]), "", svRow ? String(svRow[COL.PC.NAME]) : "", 'timeout');
            out = JSON.stringify(ro);
          }
        }
      }
    } catch (e) { /* 非 JSON / 無 clock → 略過 */ }
  }
  // ⚡ 2→1：solo 遊戲動作回應自動夾帶最新 client state(_state)，前端套用後即不必再打一趟 sync。
  //   只對 solo 御主(PC_)＋會改動戰場狀態的動作做；查無人/出錯則略過(前端自動 fallback 回真 sync)。
  if (STATE_AFTER_ACTIONS[action] && String(pcId || "").indexOf("PC_") === 0) {
    try {
      const obj = JSON.parse(out);
      if (obj && obj.success && obj._state === undefined) {
        const st = buildClientState_(sheets, pcId);
        if (st) { obj._state = st; out = JSON.stringify(obj); }
      }
    } catch (e) { /* 非 JSON 或建構失敗 → 維持原回應，前端 fallback */ }
  }
  return out;
}
// ⚡ 會改動 solo 戰場狀態、前端事後會 syncData(整頁刷新) 的動作 → 夾帶 _state 省一趟 round-trip。
//   不含：sync(本身即 state)／get_tags／純讀取(inspect/get_*)／創角召喚(自走 reload)／kanshou(KPC_)；
//   也不含「樂觀更新」的輕量 setter(set_servant_output/set_mage_realm/set_rune_mode/set_np_choice)——
//   它們不 syncData、只吃 res.economy，夾 _state 反而白做整表讀取。
//   也不含 narrate_only/multi_attack_narrate——前端 narrate() 只吃 res.text、不消費 _state，夾它純浪費整表讀。
const STATE_AFTER_ACTIONS = {
  fate_battle: 1, use_seal: 1, mana_supply: 1, bond: 1, use_mystic: 1, rule_break_steal: 1,
  propose_alliance: 1, break_alliance: 1, ally_bond: 1, set_workshop: 1, scavenge: 1,
  second_wind: 1, scout: 1, move: 1, rest: 1,
  update_fate: 1, update_rel_tag: 1, clear_npc_major_event: 1
};

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
        if (String(rRecord[COL.REL.IS_PARTY] || "") === "同行") canEditFate = true;
      }
    }
  }
  return JSON.stringify({ success: true, statusString: buildPlayerStatusString(row, relMem), targetId: targetId, targetSex: row[COL.PC.SEX], canEditFate: canEditFate });
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
    if ((rIdx !== -1 ? String(relData[rIdx][COL.REL.IS_PARTY]) : "") !== "同行") {
      return JSON.stringify({ success: false, message: `僅能對同行的從者逆天改命！` });
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
  return JSON.stringify({ success: true, statusString: buildPlayerStatusString(pcData[pIdx], relMem) });
}

function actionManualNpc(userData, pcId, sheets) {
  // 🎴 御主創角專用（action="create"）。手動建 NPC(manual_npc) 已移除；從者另由 actionSummonServant 處理，與此無關。
  const newId = "PC_" + Date.now();
  const { name, sex, identity, standing, wish, appearance, magic, circuits, origin, melee } = userData;
  const finalName = name;
  const finalSex = sex;

  // 🔴 姓名已在 sanitizeUserData_ 清成純中文；若為空代表含非中文字元，直接擋下不寫表
  if (!finalName) {
    return JSON.stringify({ success: false, message: "名號僅限中文字，不可使用英文、數字或符號。" });
  }

  // 🔴 創角寫入前再次擋撞名，否則會產生兩個同名 PC，後續所有靠姓名查找的功能都會抓錯人。
  const pcRows = sheets.pc.getDataRange().getValues();
  if (pcRows.find(r => r[COL.PC.NAME] === finalName && !String(r[COL.PC.ID]).startsWith("DEAD_"))) return JSON.stringify({ success: false, message: "此名號已有魔術師使用，請換一個名號。" });
  if (sheets.auth) { try { sheets.auth.appendRow([finalName, newId, "御主", "", ""]); } catch (e) { } }

  // 🔵 實例化：御主創角 → 開一個全新 game_id 世界
  const gameId = "g_" + Date.now();

  let validMapNames = ["深山町", "新都", "言峰教會", "未遠川"];
  if (sheets.map) {
    const maps = sheets.map.getDataRange().getValues().slice(1).map(r => String(r[COL.MAP.NAME]).trim()).filter(n => n !== "" && !n.includes('-'));
    if (maps.length > 0) validMapNames = maps;
  }

  const promptStr = `【御主】：名號『${finalName}』，性別『${finalSex}』\n【外貌】：${appearance || "隨機"}\n【身世／財力】：${standing || identity || "隨機"}\n【願望】：${wish || "隨機"}\n【魔術系統】：${magic || "隨機"}\n【出身】：${origin || "隨機"}\n【可選地點(冬木)】：${validMapNames.join('、')}`;

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
{"start_loc":"冬木地點","background":"限20字","traits":"四格頓號字串","personality":"四格頓號字串","faction":"無","rank":"御主","align":"中立","npc_intent":"結合御主身分的獨特可愛反差萌，一句話"}`;

  // 🔴 ignoreLaw: true，把節慶跟天氣隔絕在創建室外
  const aiBriefStr = callGeminiAPI(promptStr, MASTER_GEN_SYS, { temperature: 0.6, ignoreLaw: true });
  try {
    const aiBrief = JSON.parse(aiBriefStr);

    // 🎴 御主(凡人魔術師)初始數值：HP/MP 依魔術迴路(財力/身世決定)推算——御主是凡人，血量與魔力儲備皆遠低於英靈從者。
    const masterStats = masterMaxHpMp_(parseInt(circuits) || 30);

    let spawnName = aiBrief.start_loc || validMapNames[0];
    if (!validMapNames.includes(spawnName)) spawnName = validMapNames.find(n => spawnName.includes(n)) || validMapNames[0];

    const pcColCount = Object.keys(COL.PC).length;
    const newRow = Array(pcColCount).fill("");
    newRow[COL.PC.ID] = newId; newRow[COL.PC.NAME] = finalName; newRow[COL.PC.SEX] = finalSex;
    newRow[COL.PC.BACK] = aiBrief.background || standing || "來歷不明的魔術師"; // AI 生成優先(玩家輸入當種子·像性格/特徵那樣展開)；玩家後續可自改
    newRow[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "氣息平穩" });
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
    newRow[COL.PC.TRAIT] = parseTraitsHelper(aiBrief.traits, "外貌平凡、舉止從容、自稱「我」、卸下心防的私密一面");
    newRow[COL.PC.LOC] = spawnName;
    newRow[COL.PC.PREF] = parseTraitsHelper(aiBrief.personality, "溫婉謙和、內斂堅韌、明哲保身、隨波逐流");
    newRow[COL.PC.HP] = masterStats.hp; newRow[COL.PC.MP] = masterStats.mp;
    newRow[COL.PC.MAX_HP] = masterStats.hp; newRow[COL.PC.MAX_MP] = masterStats.mp;
    newRow[COL.PC.REALM] = "";  // 🎴 階級系統已移除，欄位留空
    newRow[COL.PC.FACTION] = aiBrief.faction || "無"; newRow[COL.PC.RANK] = aiBrief.rank || "御主";
    newRow[COL.PC.CONTRIB] = 0; newRow[COL.PC.ALIGN] = aiBrief.align || "中立";
    newRow[COL.PC.INTENT] = String(aiBrief.npc_intent || "").slice(0, 18) || "（待揭曉）";
    newRow[COL.PC.GAME_ID] = gameId;
    sheets.pc.appendRow(newRow);

    if (userData.account) { try { linkAccountToPc_(userData.account, newId); } catch (e) { } }
    return JSON.stringify({ success: true, pcId: newId, gameId: gameId, message: `【聖杯】因果已定，『${finalName}』於「${spawnName}」締結令咒，成為御主。` });
  } catch (e) { return JSON.stringify({ success: false, message: "建立失敗:" + e.message }); }
}

// ==========================================
// 🔵 召喚從者（Servant）— 寫進御主自己的 game_id 實例，並設為同行夥伴
// ==========================================
// 🔵 六圍階級 → 內部數值（橋接）：rankVal 轉，最低 8
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

      // 六圍 → 顯示數值（數值即 rankVal，無階級倍率）
      const nStr = svNum_(six.筋力), nCon = svNum_(six.耐久), nAgi = svNum_(six.敏捷), nInt = svNum_(six.魔力), nLuk = svNum_(six.幸運);
      const maxStats = fateMaxHpMp_(nCon, nInt);
      // 從者血厚：耐久越高越肉。🔋 出力電池制：從者無自有魔力池(MP欄置0)，靠御主供魔；出力檔存 MEMORY、預設 60 巡航。
      const svHp = 150 + svNum_(six.耐久) * 6, svMp = 0;

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
      const svHp = 150 + svNum_(aiSix.耐久) * 6, svMp = 0; // 🔋 出力電池制：從者無自有魔力池，出力檔存 MEMORY、預設 60 巡航
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

    // 🔋 共用魔力池：把新從者魔力併入御主池上限(迴路×6 + 魔力×2)，締約＝魔力暢通故補到滿池
    try {
      var _circ = masterCircuits_(masterRow);
      var _svMag = 0; try { _svMag = rankVal(JSON.parse(row[COL.PC.SIX] || '{}')['魔力'] || 'E'); } catch (e) { }
      var _newMax = masterPoolMax_(_circ, _svMag);
      var _mIdx = pcData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
      if (_mIdx >= 0) {
        masterRow[COL.PC.MAX_MP] = _newMax; masterRow[COL.PC.MP] = _newMax;
        sheets.pc.getRange(_mIdx + 1, 1, 1, masterRow.length).setValues([masterRow]);
      }
    } catch (e) { }

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
  return JSON.stringify(buildTagsPayload_(sheets, pcId));
}
// 🔧 抽出共用：左側狀態卡資料建構。get_tags 與 sync 共用同一份，讓「一次按鍵」少一趟 round-trip。
//   preData/preRel＝呼叫端已讀好的整表，傳入即免重讀(省整表 I/O)。
function buildTagsPayload_(sheets, pcId, preData, preRel) {
  const pcData = preData || sheets.pc.getDataRange().getValues();
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
  const relRows = preRel || (sheets.rel ? sheets.rel.getDataRange().getValues() : []);
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
      output: servantOutput_(s[COL.PC.MEMORY]), outputLabel: outputTier_(servantOutput_(s[COL.PC.MEMORY])).label, // 🔋 靈基出力檔位
      np: s[COL.PC.MARTIAL] || "寶具未顯現", bond: bond,
      six: six, skills: skills, traits: traits,
      // 🔮 魔境的智慧（斯卡哈）：前端露出可選被動盤。has＝持 mage_realm；pick＝已選 fx；pool＝可選清單
      mageRealm: skills.some(function (sk) { return sk && sk.fx === 'mage_realm'; })
        ? { has: true, pick: mageRealmPick_(s[COL.PC.MEMORY]), pool: mageRealmPool_() } : null,
      // 🔯 原初符文運用方式（持 rune 者才給，前端標籤可點開挑 減傷/增傷/回血）
      runeMode: skills.some(function (sk) { return sk && sk.fx === 'rune'; }) ? runeMode_(s[COL.PC.MEMORY]) : undefined,
      // 🌟 多寶具英靈：寶具選單＋當前選定索引（前端點寶具時挑要放哪個）
      npOptions: servantNpOptions_(s[COL.PC.NAME], s[COL.PC.RANK]) || undefined,
      npChoice: npChoice_(s[COL.PC.MEMORY]),
      pref: s[COL.PC.PREF] || "", physical: s[COL.PC.PHYSICAL] || "{}", // 🌹 慾海卡用：個性/肉體
      stolen: /【破戒奪取】/.test(String(s[COL.PC.MEMORY] || ""))
    });
  });
  let servant = servants[0] || null;
  // 💠 供魔收支（左側狀態卡顯示用）：僅正式聖杯戰爭世界算
  var economy = (gameId && gameId.indexOf("g_") === 0) ? playerServantEconomy_(sheets, pcId, pcData) : null;
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
  return { success: true, master: master, servant: servant, servants: servants, economy: economy, bondUsed: bondUsed, mystic: mystic, canRuleBreak: canRB, servantSlots: servants.length };
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

  // 💨 撤離追擊(一點點)：從「有活敵從者」的格子離開時，較快的敵從者可能咬一記離別追擊。
  //   ★可生還·不致死(從者血保 1)——只是不讓你一按就從強敵眼皮底下從容全身而退。用移動【前】的初始資料判定。
  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : []; // 提前讀一次·下方移動/敘事/追擊判定共用(零淨增讀取)
  const tgtTrim = String(target || "").trim();
  var pursuit = null;
  try {
    var fromLocM = String(allPcData[pIdx][COL.PC.LOC] || "").trim();
    var moverNameM = String(allPcData[pIdx][COL.PC.NAME] || "");
    if (isFateMove && fromLocM && tgtTrim && tgtTrim !== fromLocM) {
      var psvIdxM = findPlayerServantIdx_(allPcData, moveGameId, userData.servant);
      if (psvIdxM !== -1) {
        var psvC = rowToCombatant_(allPcData[psvIdxM]);
        var psvAgi = rankVal(psvC.six['敏捷'] || 'C');
        var psvHp = parseInt(allPcData[psvIdxM][COL.PC.HP]) || 0, psvMax = parseInt(allPcData[psvIdxM][COL.PC.MAX_HP]) || 1;
        var chaser = null, chaserAgi = -1;
        allPcData.forEach(function (r) {
          if (String(r[COL.PC.FACTION]) !== "敵從者") return;
          if (String(r[COL.PC.GAME_ID] || "") !== moveGameId) return;
          if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
          if (String(r[COL.PC.LOC] || "").trim() !== fromLocM) return;
          if (isAllied_(r)) return; // 🤝 盟約/休兵中→不追殺
          var bnd = (relData.find(function (x) { return x[COL.REL.PC] === moverNameM && x[COL.REL.NPC] === String(r[COL.PC.NAME]); }) || [])[COL.REL.FAV];
          if ((parseInt(bnd) || 0) >= 50) return; // 💗 好感友好(≥50)→交情夠·不追殺
          var a = rankVal((rowToCombatant_(r).six['敏捷']) || 'C');
          if (a > chaserAgi) { chaserAgi = a; chaser = r; }
        });
        if (chaser && chaserAgi >= psvAgi) { // 追得上(敵敏≥我敏)才追
          var pProb = 0.30 + (psvHp < psvMax * 0.4 ? 0.20 : 0) - (hasFx_(psvC, 'ride') ? 0.15 : 0);
          var stanceM = String(userData.stance || 'normal'); // 🎭 接敵姿態(純敘述 flavor·僅此處輕觸追擊)：隱蔽−/光明+
          pProb += (stanceM === 'open' ? 0.10 : stanceM === 'stealth' ? -0.10 : 0);
          pProb = Math.max(0, Math.min(0.55, pProb)); // 夾上限·免殘血+光明變「離場必被咬」
          if (Math.random() < pProb) {
            var chC = rowToCombatant_(chaser);
            // ⚔️ 真·交手判定(非單方挨打)：追兵 vs 我方從者一次交鋒，誰輸誰扣血——我方夠強可回身反咬逼退追兵。
            //   雙方保 1 不致死(離別小衝突·防玩家來回刷殺/也防被追擊秒殺)。
            var pr = resolveFateBattle_(chC, psvC, {});
            pursuit = { enemyName: String(chaser[COL.PC.NAME]), chaserId: String(chaser[COL.PC.ID]), dmg: Math.max(1, pr.damage), hitWho: pr.atkWins ? 'us' : 'foe' };
          }
        }
      }
    }
  } catch (e) { }

  // 🎭 抵達態度判定（趁世界尚未 tick，看 target 此刻是否「已有先客」）：
  //   先客在＝玩家主動找上門(對方在自己地盤、會警惕戒備)；無＝偶遇(雙方恰巧撞上、都帶幾分意外)。
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

  relData.filter(r => r[COL.REL.PC] === pcName && r[COL.REL.IS_PARTY] === "同行").map(r => r[COL.REL.NPC]).forEach(npcName => {
    const nIdx = allPcData.findIndex(r => r[COL.PC.NAME] === npcName && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!moveGameId || String(r[COL.PC.GAME_ID] || "") === moveGameId));
    if (nIdx !== -1) allPcData[nIdx][COL.PC.LOC] = target;
  });

  // 💨 套用撤離追擊判定(前述交手)：輸的一方扣血·保 1 不致死(隨下方整表 setValues 寫回)。
  if (pursuit) {
    if (pursuit.hitWho === 'us') { // 我方從者輸→挨追擊
      var fsvIdx = findPlayerServantIdx_(allPcData, moveGameId, userData.servant);
      if (fsvIdx !== -1) { allPcData[fsvIdx][COL.PC.HP] = Math.max(1, (parseInt(allPcData[fsvIdx][COL.PC.HP]) || 0) - pursuit.dmg); }
      else { pursuit = null; }
    } else { // 追兵輸→被回身反咬逼退(對追兵 ID 扣血·保1；追兵已 tick 走/不在則仍報甩脫成功)
      var fchIdx = allPcData.findIndex(function (r) { return String(r[COL.PC.ID]) === pursuit.chaserId; });
      if (fchIdx !== -1) { allPcData[fchIdx][COL.PC.HP] = Math.max(1, (parseInt(allPcData[fchIdx][COL.PC.HP]) || 0) - pursuit.dmg); }
    }
  }

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
  // (拔冗餘 flush：下方 markRivalsSeen_/getDataRange 等讀取本就會 flush pending 寫入)

  try { markRivalsSeen_(sheets, pcId, allPcData); } catch (e) { } // 🔵 抵達即偵查此地敵人；就地標記+批次寫回，免重讀

  // 📜 正典劇情插針已移除（2026-06 玩家定案·沒啥用處）——抵達不再自動塞 Fate 原作橋段／路線引導。

  const freshMapData = getMapDataCached(sheets); // 坤圖靜態→走 1h 快取，免整表讀
  const rootTarget = target ? String(target).split('-')[0].trim() : "";
  const parentMapInfo = freshMapData.find(m => String(m[COL.MAP.NAME]).trim() === rootTarget);
  const subMapInfo = (target !== rootTarget) ? freshMapData.find(m => String(m[COL.MAP.NAME]).trim() === target) : null;
  let mapDesc = parentMapInfo ? `【母區域：${rootTarget}】${parentMapInfo[COL.MAP.DESC]}` : "此處荒煙蔓草，並未記載於輿圖之中。";
  if (subMapInfo) mapDesc += `\n【當前分支：${target}】${subMapInfo[COL.MAP.DESC]}`;

  // 🎭 隨行從者的「演出依據」卡（含狂化禁言/口吻），供前端抵達敘事讓從者真的在場、有反應，不是御主獨白
  var svIdxMove = findPlayerServantIdx_(allPcData, moveGameId, userData.servant);
  var svCardMove = svIdxMove !== -1 ? servantCard_(allPcData[svIdxMove]) : "";

  // 🎭 在場【敵從者】的人設卡——餵給抵達敘事，讓敵人依其性格/口吻反應(慎二色厲內荏、c媽試探…)，
  //   而非 AI 即興一個通用兇狠反派(原本只給名字→反應平淡的根因)。servantCard_ 對敵從者一樣適用(低羈絆→戒備敵意)。
  var foeCardsMove = "";
  try {
    allPcData.forEach(function (r) {
      if (String(r[COL.PC.GAME_ID] || "") !== moveGameId) return;
      if (String(r[COL.PC.LOC] || "").trim() !== tgtTrim) return;
      if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
      if (String(r[COL.PC.FACTION]) === "敵從者") foeCardsMove += servantCard_(r);
    });
  } catch (e) { }

  return JSON.stringify({
    success: true,
    masterCard: masterCard_(allPcData[pIdx]), // 🎭 御主演出依據→抵達敘事讓「我」依性格開口、不再啞巴主角
    servantCard: svCardMove,
    foeCards: foeCardsMove,
    pursuit: pursuit,
    preFoes: preFoesAtTarget,
    victory: moveVictory,
    statusString: buildPlayerStatusString(allPcData[pIdx]),
    people: getLocalPeopleList(sheets, pcName, pcId, target, relData, allPcData),
    locations: getNearbyLocations(target, freshMapData).slice(0, 5),
    mapDesc: mapDesc,
    parentRegion: rootTarget,
    clock: clockLabel,
    ap: apLeft,
    apMax: AP_PER_DAY,
    rumors: worldRumors,
    economy: isFateMove ? playerServantEconomy_(sheets, pcId, allPcData) : null
  });
}

// ⚡ 前端「一次刷新」所需的完整狀態 blob：sync 與「動作夾帶 _state」共用同一份。
//   整表(allPcData)＋關係表(relRows) 只讀一次，下傳 people/economy/tags 共用——省重複整表 I/O。
//   先 markRivalsSeen_(寫 SEEN) 再讀，確保剛到場/剛移動的敵蹤即時點亮(戰爭迷霧)。回 null＝查無此人。
function buildClientState_(sheets, pcId) {
  const allPcData = sheets.pc.getDataRange().getValues();
  try { markRivalsSeen_(sheets, pcId, allPcData); } catch (e) { } // 🔵 戰爭迷霧：就地標記 SEEN+批次寫回，免二次整表讀
  const pcIndex = allPcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pcIndex === -1) return null;
  const curL = allPcData[pcIndex][COL.PC.LOC];
  const freshMapData = getMapDataCached(sheets); // 坤圖靜態→走 1h 快取
  const currentMapInfo = freshMapData.find(m => m[COL.MAP.NAME] === (curL ? String(curL).split('-')[0] : ""));
  const gid = String(allPcData[pcIndex][COL.PC.GAME_ID] || "");
  const isFate = gid && gid.indexOf("g_") === 0;
  let clk = "", ap = AP_PER_DAY;
  if (isFate) { try { clk = clockLabel_(gid); ap = getAp_(gid); } catch (e) { } }
  const relRows = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
  return {
    statusString: buildPlayerStatusString(allPcData[pcIndex]),
    people: getLocalPeopleList(sheets, allPcData[pcIndex][COL.PC.NAME], pcId, curL, relRows, allPcData),
    locations: getNearbyLocations(curL, freshMapData),
    mapDesc: currentMapInfo ? currentMapInfo[COL.MAP.DESC] : "四下靜謐。",
    clock: clk, ap: ap, apMax: AP_PER_DAY,
    economy: isFate ? playerServantEconomy_(sheets, pcId, allPcData) : null,
    tags: buildTagsPayload_(sheets, pcId, allPcData, relRows)
  };
}
function actionSync(userData, pcId, sheets) {
  const st = buildClientState_(sheets, pcId);
  if (!st) return JSON.stringify({ success: false, message: "查無此人" });
  st.success = true;
  return JSON.stringify(st);
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
    // 📜 正典劇情插針已移除（2026-06）——休息跨日不再自動塞 Fate 原作橋段。
    let restAmbushPrompt = "";
    if (restAmbush) {
      restAmbushPrompt = `【系統·歇息遭夜襲·已裁定】御主一行於「${pcLoc}」歇息、防備最鬆懈時，潛伏同地的敵從者「${restAmbush.enemyName}」${restAmbush.stealthy ? '自暗影無聲摸近' : '趁夜殺到'}，一擊重創「${(pcData.find(r=>String(r[COL.PC.FACTION])==='從者'&&String(r[COL.PC.GAME_ID]||'')===restGameId)||[])[COL.PC.NAME]||'從者'}」（−${restAmbush.dmg}）${restAmbush.destroyed ? '，其靈基崩潰、化作光點消散，御主敗北' : ''}。★以 Fate／TYPE-MOON 筆觸描寫酣息被夜襲撕裂的驚變（語氣留白），勝負已由系統結算。`;
    }
    return JSON.stringify({
      success: true, statusString: getFreshStatusString(pcId, pIdx, sheets), healedNames: healedNames,
      loc: pcLoc, wasInjured: wasInjured, restHours: restHours, clock: restClock, ap: apAfter, apMax: AP_PER_DAY, rumors: restRumors,
      ambush: !!restAmbush, defeat: restAmbush ? restAmbush.defeat : false, dreamPrompt: restAmbush ? restAmbush.dreamPrompt : "", ambushPrompt: restAmbushPrompt, report: restAmbush ? restAmbush.report : null,
      servantDream: restDreamPrompt,
      victory: restVictory && !(restAmbush && restAmbush.defeat),
      economy: playerServantEconomy_(sheets, pcId, pcData) // 復用已寫回的 pcData，免整表重讀
    });
  }

  // ── 以下為非 FATE 舊版休養：全回滿（經濟層已移除，不再收費）──
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
  let freshlyBoundNpcName = "";
  const dirtyPcRows = new Set();
  // 玩家本人一定會被處理到，先加進去
  dirtyPcRows.add(pcIndex);



  // 🔴 只讀一次 log，後面兩處共用；改為只讀最近2000筆，避免歷史成長後每回合全表讀取拖慢
  const allLogs = readRecentLogRows(sheets.log, 2000);

  const history = pickRelevantLogs(allLogs.filter(r => String(r[2]).includes(pcName)), 12).map(r => r[2]).join("\n");
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
        if ((parseInt(row[COL.REL.FAV]) || 0) >= 80 || row[COL.REL.IS_PARTY] === "同行") {
          thirdPartyRels.push(`- 『${row[COL.REL.PC]}』對『${row[COL.REL.NPC]}』：${row[COL.REL.TAG]} (好感:${row[COL.REL.FAV]})${row[COL.REL.IS_PARTY] === "同行" ? " [同行中]" : ""}`);
        }
      }
    });
  }
  const thirdPartyStr = thirdPartyRels.length > 0 ? `\n\n★【場景人物交叉羈絆 (旁觀親密流露版)】：\n${thirdPartyRels.join("\n")}\n👉若在場人物有「同行夥伴」等高階親密關係，【絕對禁止】推演為冷血路人！必須讓旁觀者捕捉到外冷內熱的親暱痕跡、假意嗔怒或極度護短的佔有慾！` : "";

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

    return `${identityTag}名號:${r[COL.PC.NAME]} 【性別:${r[COL.PC.SEX]}】 陣營:${r[COL.PC.FACTION] || "無"} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])} | 身世:${String(r[COL.PC.BACK] || "來歷不詳")}(僅供內化演出·show-don't-tell·禁直述、禁預告其原作後續結局) | 關係:${relRecord ? relRecord[COL.REL.TAG] : "萍水相逢"}(好感:${currentFav}${majorEventStr} -> 行為準則:${resistPrompt})`;
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
    // 🎴 solo(SFW)：舊版情報/勢力/我的家系統已移除，環境欄留空，只給寶具與在場人物。
    PROMPT_ENV = "";
    PROMPT_GEAR = `【寶具／技藝】：${pcData[pcIndex][COL.PC.MARTIAL] || "尚無"}`;
    PROMPT_REL = `【當前同地人物】\n${localSceneStr}${thirdPartyStr}`;
  }

  const npcDialoguePrompt = displayPeople.length > 0 ? `\n★【對話點名】：若有對話意圖，請包含「${displayPeople.map(r => r[COL.PC.NAME]).join("、")}」的對話。` : "";


  // 🔴【替換開始】淨化後的 prompt 組裝
  const prompt = `【敘事法旨】：當前推演視角鎖定為玩家『${pcName}』(ID: ${pcId})。
${PROMPT_PARTY_SYSTEM}
【玩家命格】：名號:${pcName} 【性別:${pc[COL.PC.SEX]}】 性格:${pc[COL.PC.PREF]} | 特徵:${pc[COL.PC.TRAIT]} | 軟肋:【 ${currentAmbition} 】 | 身世:${pc[COL.PC.BACK] || "來歷不明"} | 位置:${curL} | 狀態:${pc[COL.PC.STATUS] || "氣息平穩"} | 生命:${pc[COL.PC.HP]}/${pc[COL.PC.MAX_HP]} | 魔力:${pc[COL.PC.MP]}/${pc[COL.PC.MAX_MP]}${((parseInt(pc[COL.PC.HP]) || 0) <= Math.max(1, Math.round((parseInt(pc[COL.PC.MAX_HP]) || 1) * 0.15)) || (parseInt(pc[COL.PC.MP]) || 0) <= Math.round((parseInt(pc[COL.PC.MAX_MP]) || 1) * 0.1)) ? '\n★【瀕死·最高張力】御主氣力放盡、命懸一線(見上方血/魔)——敘述須透出窒迫沉重、孤注一擲的緊繃，連從者氣場都因御主將枯竭而繃緊；嚴禁輕鬆閒適的閒聊感。' : ''}

${PROMPT_ENV}
${PROMPT_GEAR}

【前塵因果】：(此為歷史輪廓，僅供背景參考，請勿當作新事件重複描寫！其中提到的人物，若不在下方【當前同地人物】名單內，純屬「回憶」，本回合絕對禁止讓其現身、開口或互動！)
${history}
${localHistoryStr}

${PROMPT_REL}
★【在場驗證鐵律——最高優先級，下筆前必看】：本回合可登場、說話、互動的角色，僅限【目前同行隊伍成員】、緊鄰上方【當前同地人物】清單列出之人，${isNsfwMode ? "本回合為慾海模式(私密場景已隔絕外界)，【絕對禁止】由AI自行安排任何全新陌生人登場打斷或闖入；唯獨玩家本回合輸入內容【明確主動】表達邀請、招呼、引入第三人等意圖時(如呼喚他人加入、開門讓人進來等)，才可讓該玩家指定或暗示的新角色登場，AI不得自作主張額外加碼安排其他陌生人" : "以及AI當下【全新初次原創】、從未出現於前塵因果/歷史紀錄/話題情報中的陌生角色(如路人、店家、新面孔，可正常開口說話、給予姓名)"}！前塵因果、歷史紀錄、話題情報中提到的「已知但不在此清單內」之姓名，才視為不在場的回憶，嚴禁無視「同地」設定憑空召喚、穿越或讓其開口說話、出手！若【當前同地人物】顯示「此地四下無人」，本回合除玩家、同行夥伴${isNsfwMode ? "、以及玩家本回合主動引入之人" : "、與全新原創的陌生人"}外，不可讓任何${isNsfwMode ? "" : "「歷史已知」"}具名角色登場！
${isKanshou ? "" : `
★【系統底層防呆·戰鬥雙向裁決】：發生衝突時綜合比對雙方靈基/實力/環境/戰術公平裁決，禁止單方面秒殺玩家；傷害以相對扣血呈現，允許玩家受傷/纏鬥/撤退/奇謀逆襲；惟聖杯戰爭的從者廝殺一律由系統按鈕裁決，敘述不得自行宣告死亡或輸出生命數值變化。
`}
${isKanshou ? `
💕【鑑賞·後日談模式·最高優先級覆寫】：聖杯戰爭【早已落幕】，這是奪得聖杯後與從者『${displayPeople.length ? displayPeople.map(r => r[COL.PC.NAME]).join("、") : "你的從者"}』共度的【和平日常／約會時光】。
★【絕對禁止】任何戰鬥、廝殺、敵人、敵御主、敵從者、聖杯爭奪、靈基受損、血量／生命變化、寶具對轟、死亡或威脅。世界是安全的。
★氛圍＝溫柔、悠閒、戀愛向的日常：散步、閒聊、吃東西、看風景、逛冬木街景。讓從者貼近其官方性格自然地與御主相處互動。
★【演出而非說明】不得直述其願望／萌點／個性字面。嚴禁輸出任何 stat_changes 生命變化、戰鬥裁決。可有 rel_changes(好感)。
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
    // 🎴 solo：地圖只走 GAS 坤圖／玩家移動，不讓 AI 在自由敘事裡新增地點（鑑賞約會大地圖才允許 AI 即興擴張）
    if (isNsfwMode && aiData.new_maps && Array.isArray(aiData.new_maps) && sheets.map) {
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

          const newMapRow = ["冬木", fullName, mapType, coordStr, m.desc || "未知地界。", parentName];
          mapsToAppend.push(newMapRow); memoryMapData.push(newMapRow);
        }
      });
      if (mapsToAppend.length > 0) {
        sheets.map.getRange(sheets.map.getLastRow() + 1, 1, mapsToAppend.length, 6).setValues(mapsToAppend);
        CacheService.getScriptCache().remove("FATE_MAP_DATA");
      }
    }

    if (aiData.events && Array.isArray(aiData.events) && sheets.epic) aiData.events.forEach(ev => { sheets.epic.appendRow([pcId, String(ev).trim(), new Date()]); });

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


      // 🎴 FATE：AI 的 stat_changes 只准更新「外顯狀態」(衣服/姿勢/負面/顏面)；
      //   位置/生命/魔力/陣營/貢獻/身世 一律由 GAS(按鈕/戰鬥)裁定，AI 寫了也忽略。
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

          // 其餘 attr(位置/生命/魔力/陣營/貢獻/身世)一律忽略——GAS 掌數值、戰鬥裁定生死，AI 不寫。
        }
      });
    }








    // 經濟層（物品/金錢/任務）已全數移除：items_gained / items_transferred / money_transferred / items_lost / items_used 不再落地。

    // 🎴 solo：招募(新角色入隊)只走 GAS（召喚從者／破戒奪僕／結盟），不讓 AI 在自由敘事裡招募人；鑑賞才允許
    let newlyRecruited = (isNsfwMode && aiData.recruited && Array.isArray(aiData.recruited)) ? aiData.recruited.map(n => String(n).trim()) : [];
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
        // 🎴 solo：好感收歸 GAS——只有羈絆/補魔/結盟等按鈕能動好感，AI 自由敘事不得改好感數值（鑑賞才允許 AI 推進好感）
        let change = isNsfwMode ? (parseInt(rc.fav_change) || 0) : 0;
        let isPartyStr = rIdx !== -1 ? relData[rIdx][COL.REL.IS_PARTY] || "" : "";
        if (newlyRecruited.includes(tNpc)) isPartyStr = "同行"; if (dismissedNpc === tNpc) isPartyStr = "";

        if (rIdx !== -1) {
          let oldFav = parseInt(relData[rIdx][COL.REL.FAV]) || 0; let oldTag = relData[rIdx][COL.REL.TAG] || "萍水相逢";
          let newFav = Math.max(-100, Math.min(100, oldFav + change));

          let finalTag;
          {
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

    const localPeopleList = getLocalPeopleList(sheets, pcName, pcId, curL, relData, pcData);

    let finalResponseText = aiData.narration || "天地混沌，一片寂靜。";
    finalResponseText = finalResponseText.replace(/\n/g, "<br>");






    // 🔴 好感度渲染（經濟層物品/金錢渲染已移除）。🎴 solo 好感已收歸 GAS、AI 不動好感 → 不渲染 AI 的好感數字（鑑賞才顯示）
    if (isNsfwMode && aiData.rel_changes && Array.isArray(aiData.rel_changes)) {
      aiData.rel_changes.forEach(rc => {
        const change = parseInt(rc.fav_change) || 0;
        if (change === 0) return; // 沒變動就跳過

        const icon = change > 0 ? "❤️" : "💔";
        const color = change > 0 ? "#e91e63" : "#555";
        const sign = change > 0 ? "+" : "";

        finalResponseText += `<br><br><span style="color:${color}; font-size:13px; font-weight:bold;">${icon} 「${rc.target}」好感度 ${sign}${change}</span>`;
      });
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

    // 🔴 玩家魔力變化（生命已由上面清單統一顯示，這裡不重複；金錢經濟層已移除）
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
      statusString: buildPlayerStatusString(pcData[pcIndex]),
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
      // 🔴 新增：將全部活著的眾生名單傳給前端，用於三段式判定
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

  // 關係重大紀錄（同行夥伴 + 重大約定）
  let relRecords = [];
  if (sheets.rel) {
    const rData = sheets.rel.getDataRange().getValues();
    relRecords = rData.filter(r => r[COL.REL.PC] === pcName && (
      r[COL.REL.IS_PARTY] === "同行" ||
      (r[COL.REL.MAJOR_EVENT] && r[COL.REL.MAJOR_EVENT] !== "無" && r[COL.REL.MAJOR_EVENT] !== "")
    )).map(r => ({
      npc: r[COL.REL.NPC],
      tag: r[COL.REL.TAG],
      fav: r[COL.REL.FAV],
      majorEvent: r[COL.REL.MAJOR_EVENT] || "無",
      isSoulBound: r[COL.REL.IS_PARTY] === "同行",
      memory: r[COL.REL.MEMORY] || ""
    }));
  }

  // 足跡統計
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
      topIntimacyCount: stats.topIntimacyCount
    }
  });
}

// 🟢 新增：系統強制抹除/斬斷 NPC 的重大事件約定
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
  var r = resolveFateBattle_(atkC, defC, { np: !!opts.np, seal: !!opts.seal, skill: opts.skill || null, ambush: !!opts.ambush, mealBuff: mealOn ? MEAL_BUFF_BONUS : 0 });
  if (opts.seal) r.atkWins = true; // 絕對命令必中
  // 🌟 寶具對轟結算傷害：傷害已由對轟裁決算好，此處只借 fateStrike_ 套用「死亡/勝負/復活/令咒脫離」全套後續邏輯
  if (opts.forceDamage != null) { r.atkWins = true; r.damage = Math.max(0, Math.round(opts.forceDamage)); r.crit = ''; }
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
  // 🐙 海怪護盾：優先吸收傷害（護盾歸零或超過 HORROR_SHIELD_HOURS 時消散）
  if (isPlayerSv && dmg > 0) {
    var _hClk = getClock_(ctx.myGameId);
    var _hAbs = _hClk ? _hClk.day * 24 + _hClk.hour : null;
    var _shield = getHorrorShield_(pcData[tgtIdx][COL.PC.MEMORY], _hAbs);
    if (_shield.active && _shield.remaining > 0) {
      var _sAbsorb = Math.min(_shield.remaining, dmg);
      dmg = Math.max(0, dmg - _sAbsorb);
      out.damage = dmg;
      var _sNew = _shield.remaining - _sAbsorb;
      if (_sNew <= 0) {
        pcData[tgtIdx][COL.PC.MEMORY] = clearHorrorShield_(pcData[tgtIdx][COL.PC.MEMORY]);
        out.fired.push(defC.name + '·海怪護盾(吸收' + _sAbsorb + '·護盾破碎)');
      } else {
        pcData[tgtIdx][COL.PC.MEMORY] = setHorrorShield_(pcData[tgtIdx][COL.PC.MEMORY], _sNew, _shield.expiry);
        out.fired.push(defC.name + '·海怪護盾(吸收' + _sAbsorb + '·餘' + _sNew + ')');
      }
      sheets.pc.getRange(tgtIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[tgtIdx][COL.PC.MEMORY]);
    }
  }
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
  // 十二試煉（God Hand）：自死亡歸來；但高位階寶具概念可「一擊燒掉多條命」，壓倒性 overkill 再加成。
  if (after <= 0 && !severed && hasFx_(defC, 'god_hand')) {
    var lives = getGodHandLives_(pcData[tgtIdx][COL.PC.MEMORY]);
    if (lives > 0) {
      var ghMaxHp = parseInt(pcData[tgtIdx][COL.PC.MAX_HP]) || 300;
      var ghReviveHp = Math.max(1, Math.round(ghMaxHp * 0.20));
      // 🔱 概念優先權：寶具解放且概念位階高 → 多燒命。位階取「fx 概念階」與「寶具規模(對人/軍/城/界)」較高者，
      //   故 Saber 的對城 Excalibur(規模5)、Gilgamesh 的 ea(概念6) 都吃得到，純對人寶具則只靠 overkill。
      var lossN = 1;
      if (opts.np) {
        var ghTier = offenseTier_(atkC, true);
        var ghScale = npAtkScale_(atkC);
        var ghScaleTier = ghScale === '對界' ? 6 : ghScale === '對城' ? 5 : ghScale === '對軍' ? 4 : 1;
        var ghSev = Math.max(ghTier, ghScaleTier);
        if (ghSev >= 6) lossN += 2; else if (ghSev >= 5) lossN += 1;
      }
      // 壓倒性傷害（遠超復活線）也多燒：≥2 倍 +1、≥3 倍 +2。讓 Saber 一記 Excalibur 不會「連一條命都燒不掉」。
      var ghOver = dmg / ghReviveHp;
      if (ghOver >= 3) lossN += 2; else if (ghOver >= 2) lossN += 1;
      if (lossN < lives) {
        var ghRemain = lives - lossN;
        out.godRevived = true;
        pcData[tgtIdx][COL.PC.HP] = ghReviveHp;
        pcData[tgtIdx][COL.PC.MEMORY] = setGodHandLives_(pcData[tgtIdx][COL.PC.MEMORY], ghRemain);
        pcData[tgtIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "神性光輝纏身", "姿勢": "緩緩起身", "負面": `十二試煉·餘${ghRemain}命`, "顏面": "不滅的戰意" });
        sheets.pc.getRange(tgtIdx + 1, 1, 1, pcData[tgtIdx].length).setValues([pcData[tgtIdx]]);
        out.godNote = `「${pcData[tgtIdx][COL.PC.NAME]}」倒下了——卻又緩緩站起。${lossN > 1 ? `這一擊的概念威能極重，一口氣燒去 ${lossN} 條命` : `十二試煉的詛咒讓他自死亡歸來`}（尚餘 ${ghRemain} 條命）。`;
        out.fired.push(pcData[tgtIdx][COL.PC.NAME] + '·十二試煉(God Hand)' + (lossN > 1 ? `·一擊燒${lossN}命` : ''));
        return out;
      }
      // lossN >= lives：餘命被這一擊燒盡 → 不復活，靈基真正崩潰（落入下方 destroyed 流程）
      pcData[tgtIdx][COL.PC.MEMORY] = setGodHandLives_(pcData[tgtIdx][COL.PC.MEMORY], 0);
      out.fired.push(pcData[tgtIdx][COL.PC.NAME] + '·十二試煉·餘命被一擊燒盡');
    }
  }
  if (after <= 0) {
    out.destroyed = String(pcData[tgtIdx][COL.PC.NAME]);
    var killedIsMaster = String(pcData[tgtIdx][COL.PC.FACTION]) === "敵御主"; // 🩸 御主是凡人：斃命倒地、不是靈基化光點
    out.killedMaster = killedIsMaster;
    pcData[tgtIdx][COL.PC.ID] = "DEAD_" + String(pcData[tgtIdx][COL.PC.ID]);
    pcData[tgtIdx][COL.PC.HP] = 0;
    pcData[tgtIdx][COL.PC.STATUS] = killedIsMaster
      ? JSON.stringify({ "衣服": "凌亂", "姿勢": "倒地不起", "負面": "重傷不治·身亡", "顏面": "生機已絕" })
      : JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "靈基崩潰·消滅", "顏面": "已無生息" });
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

// 🔋 御主電池（出力電池制 2026-06）：從者【沒有自有魔力池】，寶具/技能魔力全由御主供——
//   付款順序：①御主 MP(主資源) → ②御主 HP(2 HP 換 1 MP，焚血供能、御主血量不可低於 1)。
//   寫回試算表並回傳明細，供戰報／敘述演出「拿御主當電池」。fromSv 恆 0（保留欄位相容舊戰報）。
var BATTERY_HP_PER_MP = 2; // 御主以血供魔的兌率：每 1 點魔力＝2 點生命
function drainForNp_(sheets, pcData, svIdx, masterIdx, mpCost) {
  mpCost = Math.max(0, Math.round(mpCost));
  var need = mpCost;
  var mMp = masterIdx >= 0 ? (parseInt(pcData[masterIdx][COL.PC.MP]) || 0) : 0;
  var fromMMp = Math.min(mMp, need);
  need -= fromMMp;
  var mHp = masterIdx >= 0 ? (parseInt(pcData[masterIdx][COL.PC.HP]) || 0) : 0;
  var hpAvail = Math.max(0, mHp - 1);                       // 御主血量底線 1，不可被供能榨死
  var hpForMp = Math.min(need, Math.floor(hpAvail / BATTERY_HP_PER_MP));
  var fromMHp = hpForMp * BATTERY_HP_PER_MP;
  need -= hpForMp;                                          // 仍未付清的缺口（油盡燈枯，寶具勉力強放）
  // 寫回御主（有動到才寫）
  if (masterIdx >= 0 && (fromMMp > 0 || fromMHp > 0)) {
    pcData[masterIdx][COL.PC.MP] = Math.max(0, mMp - fromMMp);
    pcData[masterIdx][COL.PC.HP] = Math.max(1, mHp - fromMHp);
    sheets.pc.getRange(masterIdx + 1, 1, 1, pcData[masterIdx].length).setValues([pcData[masterIdx]]);
  }
  return {
    cost: mpCost, fromSv: 0, fromMasterMp: fromMMp, fromMasterHp: fromMHp, shortfall: need,
    usedBattery: (fromMMp > 0 || fromMHp > 0), bledMaster: (fromMHp > 0),
    masterHp: masterIdx >= 0 ? (parseInt(pcData[masterIdx][COL.PC.HP]) || 0) : 0,
    masterHpMax: masterIdx >= 0 ? (parseInt(pcData[masterIdx][COL.PC.MAX_HP]) || 0) : 0,
    masterMp: masterIdx >= 0 ? (parseInt(pcData[masterIdx][COL.PC.MP]) || 0) : 0,
    svMp: 0  // 出力電池制：從者無自有魔力池
  };
}

// 找某敵從者的「敵御主」列索引（硬連結【御主】優先，退回同 game 同地的敵御主）；masterless 則 -1。
function enemyMasterIdx_(pcData, svIdx, gameId) {
  var link = getServantMaster_(pcData[svIdx][COL.PC.MEMORY]);
  var loc = String(pcData[svIdx][COL.PC.LOC]).trim();
  for (var i = 1; i < pcData.length; i++) {
    if (String(pcData[i][COL.PC.FACTION]) !== "敵御主") continue;
    if (String(pcData[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(pcData[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (link ? (String(pcData[i][COL.PC.NAME]) === link) : (String(pcData[i][COL.PC.LOC]).trim() === loc)) return i;
  }
  return -1;
}

// 🔋 敵方寶具買單：敵從者自身 MP ＋（同陣敵御主）電池 是否付得起 prana。回 {afford, masterIdx}。
function enemyCanAffordNp_(pcData, svIdx, gameId, prana) {
  var mi = enemyMasterIdx_(pcData, svIdx, gameId);
  var mp = parseInt(pcData[svIdx][COL.PC.MP]) || 0;
  var mMp = mi >= 0 ? (parseInt(pcData[mi][COL.PC.MP]) || 0) : 0;
  var mHp = mi >= 0 ? (parseInt(pcData[mi][COL.PC.HP]) || 0) : 0;
  var maxPay = mp + mMp + Math.floor(Math.max(0, mHp - 1) / BATTERY_HP_PER_MP);
  return { afford: maxPay >= prana, masterIdx: mi };
}

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
  // 🌟 多寶具選定索引 ＋ 🔋 解放寶具自動全開出力：兩者隨 fate_battle 一起送來，省去單獨 set_np_choice／set_servant_output 往返。
  let atkMemDirty = false;
  if (userData.npChoice !== undefined && userData.npChoice !== null) {
    pcData[atkIdx][COL.PC.MEMORY] = setNpChoice_(pcData[atkIdx][COL.PC.MEMORY], userData.npChoice); atkMemDirty = true;
  }
  if (userData.output !== undefined && userData.output !== null) {
    pcData[atkIdx][COL.PC.MEMORY] = setServantOutput_(pcData[atkIdx][COL.PC.MEMORY], snapOutput_(userData.output)); atkMemDirty = true;
  }
  if (atkMemDirty) sheets.pc.getRange(atkIdx + 1, 1, 1, pcData[atkIdx].length).setValues([pcData[atkIdx]]);

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
    const masterName = String(pcData[nIdx][COL.PC.NAME]);
    const ownServantName = getMasterServant_(pcData[nIdx][COL.PC.MEMORY]); // 🔗 這名御主【自己的】從者(硬連結)
    // 🛡️ 只有「這名御主本人的從者」能護衛——硬連結優先(按名)。別組(B 御主)的從者不會跑來幫 A 御主擋刀。
    if (ownServantName) {
      assassinGuardIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者"
        && String(r[COL.PC.GAME_ID] || "") === myGameId
        && !String(r[COL.PC.ID]).startsWith("DEAD_")
        && String(r[COL.PC.NAME]) === ownServantName
        && String(r[COL.PC.LOC]).trim() === guardLoc);
    }
    // 退回(舊存檔無【從者】連結)：同地敵從者中，須其【御主】反指這名御主，仍不會抓到別組
    if (assassinGuardIdx === -1) {
      assassinGuardIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者"
        && String(r[COL.PC.GAME_ID] || "") === myGameId
        && !String(r[COL.PC.ID]).startsWith("DEAD_")
        && String(r[COL.PC.LOC]).trim() === guardLoc
        && getServantMaster_(r[COL.PC.MEMORY]) === masterName);
    }
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

  // 🔋 寶具魔力（出力電池制）：寶具全由御主供魔。① 寶具僅能在「出力 100%（全開·認真）」解放——御主把魔力全灌進去才釋放得了真名。
  //   ② 御主魔力(MP)＋焚血(HP)都湊不出 prana → 油盡燈枯，擋下。
  if (useNp) {
    const atkOutput = servantOutput_(pcData[atkIdx][COL.PC.MEMORY]);
    if (atkOutput < 100) {
      return JSON.stringify({ success: false, message: `寶具乃靈基全力之解放——須先將「${atkC.name}」的出力推到 100%（全開），御主灌注全部魔力，方能釋放真名。當前出力 ${atkOutput}%。` });
    }
    const npCostPre = npPranaCost_(atkC.six["寶具"]);
    const mMpPre = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
    const mHpPre = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
    const maxPay = mMpPre + Math.floor(Math.max(0, mHpPre - 1) / BATTERY_HP_PER_MP);
    if (maxPay < npCostPre) {
      return JSON.stringify({ success: false, message: `御主魔力已油盡燈枯——以血魔竭力相湊仍不足以供「${atkC.name}」解放寶具(需 ${npCostPre})，須先休整／補魔。` });
    }
  }

  // ❖ 令咒·絕對命令（必中＋威力倍增）：消耗一道玩家令咒
  const useSeal = !!userData.seal;
  if (useSeal && getPlayerSeals_(pcData[pIdx][COL.PC.MEMORY]) <= 0) {
    return JSON.stringify({ success: false, message: "你的令咒已用盡，無法施加絕對命令。" });
  }

  // 戰鬥確定開打 → 耗 1 AP（推進 2 小時）
  let battleAp = AP_PER_DAY;
  if (isFateBattle) { try { battleAp = spendAp_(myGameId, 1).ap; } catch (e) { } }

  // ⚔️ 交手即削好感：拔劍相向直接 −5（不勞 AI 判定）。只削既有交情列、不憑空建列(萍水相逢者本就 0)。
  //   ★同時是「刷好感躲追殺」的天然制衡：要奪杯就得打、打了好感掉破 50→追擊閘重新開啟。
  try { raiseBond_(sheets, String(pcData[pIdx][COL.PC.NAME]), String(pcData[nIdx][COL.PC.NAME]), -5); } catch (e) { }

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
      pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "凌亂", "姿勢": "倒地不起", "負面": "重傷不治·身亡", "顏面": "生機已絕" });
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
        note: `${crit.name} 擲出 20 — 大成功！撕開「${guardName}」的守備、一擊取御主「${masterName}」性命。御主既亡，「${guardName}」隨之消散。`,
        selfDmg: 0, victory: asnVictory, defeat: false,
        atkHp: parseInt(pcData[atkIdx][COL.PC.HP]) || 0, atkHpMax: parseInt(pcData[atkIdx][COL.PC.MAX_HP]) || 0
      };
      asnPrompt = `【系統·斬首戰報·已裁定】御主號令${dualAsn ? '兩名從者齊撲' : `從者『${crit.name}』`}奇襲敵御主「${masterName}」。命運的骰子由『${crit.name}』擲出 20 — 大成功！撕開護衛從者「${guardName}」的防線、取下御主性命。御主既亡（凡人之軀·斃命，非靈基消滅）、魔力供給斷絕，從者「${guardName}」失去供魔當場化作光點消散。${asnVictory ? '此為最後的敵對陣營——聖杯已然在握！' : ''}\n` +
        `★以 Fate／TYPE-MOON 筆觸描寫這萬中選一、石破天驚的斬首瞬間（一段即可）。【致命的手段由你依『${crit.name}』的職階與真名自行演出——法師為魔術一擊、近戰為兵刃、弓兵為遠程，勿假設特定方式】${dualAsn ? '，兩名從者夾擊、其中一人覷得破綻收尾' : ''}。勝負已由系統結算。\n` +
        ``;
    } else {
      // 全部失手：護衛捨身格擋，反手 1.5 倍痛擊「每一名」參與斬首的從者
      const guardC = rowToCombatant_(pcData[assassinGuardIdx]);
      const hits = [];
      rolls.forEach(r => {
        const sC = rowToCombatant_(pcData[r.idx]);
        const probe = resolveFateBattle_(guardC, sC, {});
        // 反噬取「護衛端」傷害：護衛擲贏→其全力反噬(probe.damage 即護衛傷)；護衛擲輸(奇襲突破)→反噬大減，
        //   底傷依護衛筋力而非玩家自己的攻擊力(原 bug：玩家擲贏時 probe.damage 是玩家傷害，反噬越強自噬越重)。
        const guardBase = probe.atkWins ? (probe.damage || 1) : Math.round(rankVal(guardC.six['筋力'] || 'C') * 1.5 + 8);
        const selfDmg = Math.max(1, Math.round(guardBase * 1.5));
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
  // 🔋 寶具魔力 = 依寶具階級的 Prana Cost（E50 D100 C200 B350 A500 EX800）。從者付不起 → 御主電池接力供能。
  let battery = null;
  if (useNp) {
    const prana = npPranaCost_(atkC.six["寶具"]);
    battery = drainForNp_(sheets, pcData, atkIdx, pIdx, prana);
    atkC.mp = parseInt(pcData[atkIdx][COL.PC.MP]) || 0; // 反映耗魔後的出力
    if (battery.usedBattery) {
      logWarEvent_(myGameId, `『${atkC.name}』解放寶具魔力不足，御主以${battery.bledMaster ? '自身血肉與' : ''}魔力為電池供能（御主餘 ${battery.masterHp}/${battery.masterHpMax} HP）。`, String(userData.acctName || ""));
    }
  }

  // ⚡ 從者主動技：玩家本戰啟動 → 付啟動魔力(付不起走御主電池)，整場我方出擊吃增益。
  let skillBuff = null, skillBattery = null;
  if (userData.skill) {
    skillBuff = servantActiveSkill_(atkC);
    // 🔋 出力電池制：技能魔力亦由御主供。改以固定基準(200)×mpPct 計，不再依已廢的從者魔力池。
    const skCost = Math.round(200 * skillBuff.mpPct);
    skillBattery = drainForNp_(sheets, pcData, atkIdx, pIdx, skCost);
    atkC.mp = parseInt(pcData[atkIdx][COL.PC.MP]) || 0;
    if (skillBattery.usedBattery) {
      logWarEvent_(myGameId, `『${atkC.name}』啟動「${skillBuff.name}」魔力不足，御主${skillBattery.bledMaster ? '焚血' : '導魔'}供能（御主餘 ${skillBattery.masterHp}/${skillBattery.masterHpMax} HP）。`, String(userData.acctName || ""));
    }
  }

  let knockedOut = [], victory = false, defeat = false, dreamPrompt = "", destroyedName = "", sealEscaped = false, sealNote = "", godRevived = false, godNote = "";
  let enemyNpSpent = false; // 敵寶具一場限一次
  const rounds = [];
  const ctx = { myGameId: myGameId, pIdx: pIdx, userData: userData };
  const targetIsFoeServant = String(pcData[nIdx][COL.PC.FACTION]) === "敵從者";

  // 🌟 寶具對轟（光與光的對撞）：玩家開場解放寶具、目標為敵從者時，值得一戰的對手以寶具相迎。
  //   雙方先算「寶具火力」→ 高者壓過低者，差額貫穿敗方、勝方僅受少量回震；火力相當(±10%)則相抵僵持。
  //   ★ 對轟輸方不致死：差值再大也只打到 1 HP——英雄倒下前總能拼出最後一口氣。
  let openingNp = useNp, openingSeal = useSeal; // 對轟已用掉開場 NP/令咒威能則清掉，避免回合迴圈重放
  let clash = null;
  if (useNp && targetIsFoeServant && !String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_")) {
    const enemyC0 = rowToCombatant_(pcData[nIdx]);
    const enemyHasNp = !!String(pcData[nIdx][COL.PC.MARTIAL] || "").trim() && rankVal(enemyC0.six["寶具"] || "-") >= 10;
    // 只有「攻擊型寶具」才對轟；防禦/生存/召喚型(God Hand、summon_horror…)不去抵銷玩家寶具。
    const CLASH_OFF_FX = ['ea', 'excalibur', 'ubw', 'gob', 'gae_bolg', 'tsubame', 'zabaniya', 'petrify', 'chain', 'anti_magic_lance', 'wind_strike', 'projection'];
    const eScaleClash = npAtkScale_(enemyC0);
    const enemyOffensiveNp = enemyHasNp && (eScaleClash === '對軍' || eScaleClash === '對城' || eScaleClash === '對界' || CLASH_OFF_FX.some(function (f) { return hasFx_(enemyC0, f); }));
    const eHpR = (parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1) > 0 ? (parseInt(pcData[nIdx][COL.PC.HP]) || 0) / (parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1) : 1;
    const clashUrge = 0.6 + (hasFx_(enemyC0, 'mad') || hasFx_(enemyC0, 'zabaniya') ? 0.25 : 0) - (1 - eHpR) * 0.3;
    const clashPrana = npPranaCost_(enemyC0.six["寶具"]);
    const clashAfford = enemyOffensiveNp ? enemyCanAffordNp_(pcData, nIdx, myGameId, clashPrana) : { afford: false, masterIdx: -1 };
    if (enemyOffensiveNp && clashAfford.afford && Math.random() < clashUrge) {
      drainForNp_(sheets, pcData, nIdx, clashAfford.masterIdx, clashPrana);
      enemyC0.mp = parseInt(pcData[nIdx][COL.PC.MP]) || 0;
      enemyNpSpent = true;
      openingNp = false; openingSeal = false;
      enemyC0.output = 100;
      const pPow = resolveFateBattle_(atkC, enemyC0, { np: true, seal: useSeal, skill: skillBuff }).damage;
      const ePow = resolveFateBattle_(enemyC0, atkC, { np: true }).damage;
      const band = Math.round((pPow + ePow) * 0.10);
      let outcome, pDmgTaken = 0, eDmgTaken = 0;
      if (Math.abs(pPow - ePow) <= band) {
        outcome = 'stalemate';
        eDmgTaken = Math.round(band * 0.5); pDmgTaken = Math.round(band * 0.5);
      } else if (pPow > ePow) {
        outcome = 'player';
        eDmgTaken = pPow - ePow; pDmgTaken = Math.round((pPow - ePow) * 0.15);
      } else {
        outcome = 'enemy';
        var _rawPDmg = ePow - pPow;
        // ★ 對轟輸方不致死：差值再大也只扣到 1 HP 為止
        pDmgTaken = Math.min(_rawPDmg, Math.max(0, (parseInt(pcData[atkIdx][COL.PC.HP]) || 1) - 1));
        eDmgTaken = Math.round(_rawPDmg * 0.15);
      }
      const eHit = fateStrike_(sheets, pcData, atkC, nIdx, { forceDamage: eDmgTaken }, ctx);
      if (eHit.destroyed) destroyedName = eHit.destroyed;
      if (eHit.knocked) knockedOut.push(eHit.knocked);
      if (eHit.sealEscaped) { sealEscaped = true; sealNote = eHit.sealNote; }
      if (eHit.godRevived) { godRevived = true; godNote = eHit.godNote; }
      if (eHit.victory) victory = true;
      if (!sealEscaped) {
        const spill = (destroyedName ? Math.round(pDmgTaken * 0.5) : pDmgTaken);
        const pHit = fateStrike_(sheets, pcData, enemyC0, atkIdx, { forceDamage: spill }, ctx);
        if (pHit.destroyed && pHit.knocked) knockedOut.push(pHit.knocked);
        if (pHit.defeat) { defeat = true; victory = false; dreamPrompt = pHit.dreamPrompt; }
      }
      clash = {
        outcome: outcome, pPow: pPow, ePow: ePow, pDmgTaken: pDmgTaken, eDmgTaken: eDmgTaken,
        enemyNp: String(pcData[nIdx][COL.PC.MARTIAL] || ""),
        atkHp: parseInt(pcData[atkIdx][COL.PC.HP]) || 0, atkHpMax: parseInt(pcData[atkIdx][COL.PC.MAX_HP]) || 0,
        defHp: parseInt(pcData[nIdx][COL.PC.HP]) || 0, defHpMax: parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 0
      };
      logWarEvent_(myGameId, `寶具對轟！『${atkC.name}』與「${defC.name}」真名解放正面對撞——${outcome === 'player' ? '我方光潮壓過、貫穿對手' : outcome === 'enemy' ? '敵寶具壓過、貫穿我方（但從者拼死撐住）' : '勢均力敵、兩相抵銷'}。`, String(userData.acctName || ""));
    }
  }

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


  // 🐙 螺湮城教本：玩家青鬍子解放寶具 → 自深淵召出「深淵海怪」常駐戰場，每回合與本人並肩撕咬，
  //   靠御主魔力維持(每回合扣 HORROR_UPKEEP)；御主魔力撐不住 → 海怪潰散退場。巨獸物理攻擊、不受對魔力。
  let horrorActive = (useNp && hasFx_(atkC, 'summon_horror'));
  const HORROR_UPKEEP = 30;
  const horrorC = horrorActive ? {
    name: '深淵海怪', cls: 'Berserker', np: '',
    six: { 筋力: 'A', 耐久: 'A', 敏捷: 'C', 魔力: 'E', 幸運: 'E', 寶具: '-' },
    skills: [], traits: [{ n: '巨獸' }], output: 100,
    hp: 400, hpMax: 400, mp: 0, mpMax: 0
  } : null;
  // 🐙 海怪護盾：深淵海怪以身為盾護住吉爾，寶具觸發當下即生效（200 HP 護盾，8 遊戲時後消散）
  if (horrorActive) {
    var _hshClk = getClock_(myGameId);
    if (_hshClk) {
      var _hshExp = _hshClk.day * 24 + _hshClk.hour + HORROR_SHIELD_HOURS;
      pcData[atkIdx][COL.PC.MEMORY] = setHorrorShield_(pcData[atkIdx][COL.PC.MEMORY], HORROR_SHIELD_HP, _hshExp);
      sheets.pc.getRange(atkIdx + 1, 1, 1, pcData[atkIdx].length).setValues([pcData[atkIdx]]);
    }
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
      const ps = fateStrike_(sheets, pcData, sC, nIdx, { np: opening && openingNp && isActive, seal: opening && openingSeal && isActive, ambush: opening && isActive, skill: isActive ? skillBuff : null }, ctx);
      // 目標為敵御主(非從者)：引擎計算了反傷 fired 但不套用，過濾掉「winner·武器骰」等傷害計算噪音
      const _pFiredClean = isMasterTarget
        ? (ps.fired || []).filter(function (t) { return !/·武器骰|·出力\d/.test(String(t)); })
        : (ps.fired || []);
      rl.strikes.push({ by: sC.name, pRoll: ps.aRoll, pHitVal: ps.aHit, dRoll: ps.dRoll, dEvaVal: ps.dEva, pHit: ps.hit, pDmg: ps.hit ? ps.damage : 0, pCrit: ps.crit, pFired: _pFiredClean, note: ps.sealNote || ps.godNote || "" });
      if (ps.destroyed) destroyedName = ps.destroyed;
      if (ps.knocked) knockedOut.push(ps.knocked);
      if (ps.sealEscaped) { sealEscaped = true; sealNote = ps.sealNote; }
      if (ps.godRevived) { godRevived = true; godNote = ps.godNote; }
      if (ps.victory) victory = true;
      if (destroyedName || sealEscaped) break;
    }

    // 🔯 原初符文·回血運用：本回合我方持符文且運用為 regen 的從者回復一截體力（5%×階/回合）——持久符文流。
    for (let rk = 0; rk < livingParty.length; rk++) {
      const ridx = livingParty[rk];
      if (String(pcData[ridx][COL.PC.ID]).startsWith("DEAD_")) continue;
      const rc = rowToCombatant_(pcData[ridx]);
      const rrn = hasFx_(rc, 'rune');
      if (rrn && rc.runeMode === 'regen') {
        const hpMaxR = parseInt(pcData[ridx][COL.PC.MAX_HP]) || 0;
        const healR = Math.min(Math.round(hpMaxR * 0.025 * rankMul_(rrn)), 30); // 🔧 涓流回血(約4%/回合·上限30)，不再無敵壁
        const curR = parseInt(pcData[ridx][COL.PC.HP]) || 0;
        if (healR > 0 && curR > 0 && curR < hpMaxR) {
          pcData[ridx][COL.PC.HP] = Math.min(hpMaxR, curR + healR);
          sheets.pc.getRange(ridx + 1, 1, 1, pcData[ridx].length).setValues([pcData[ridx]]);
          rl.strikes.push({ by: rc.name, rune: true, pHit: false, pDmg: 0, pCrit: '', pFired: [], note: '原初符文·治癒（+' + Math.min(healR, hpMaxR - curR) + '）' });
        }
      }
    }

    // 🐙 深淵海怪追擊：青鬍子寶具召喚物，常駐每回合撕咬敵手——先扣御主魔力維持，撐不住則潰散退場。
    if (horrorActive && targetIsFoeServant && !String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_") && !destroyedName && !sealEscaped && !victory) {
      const hUp = drainForNp_(sheets, pcData, atkIdx, pIdx, HORROR_UPKEEP);
      if (hUp.shortfall > 0) {
        horrorActive = false;
        rl.strikes.push({ by: '🐙深淵海怪', horror: true, pHit: false, pDmg: 0, pCrit: '', pFired: [], note: '御主魔力枯竭·海怪潰散退場' });
      } else {
        const hs = fateStrike_(sheets, pcData, horrorC, nIdx, {}, ctx);
        rl.strikes.push({ by: '🐙深淵海怪', horror: true, pRoll: hs.aRoll, pHitVal: hs.aHit, dRoll: hs.dRoll, dEvaVal: hs.dEva, pHit: hs.hit, pDmg: hs.hit ? hs.damage : 0, pCrit: hs.crit, pFired: hs.fired, note: '深淵海怪·觸手撕咬' });
        if (hs.destroyed) destroyedName = hs.destroyed;
        if (hs.knocked) knockedOut.push(hs.knocked);
        if (hs.godRevived) { godRevived = true; godNote = hs.godNote; }
        if (hs.victory) victory = true;
        if (hs.sealEscaped) { sealEscaped = true; sealNote = hs.sealNote; }
      }
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
        // ⚔️ 只有「攻擊型寶具」才反擊解放(與對轟同準)：純防禦/對人寶具(如 Rule Breaker 對人C·無攻擊 fx)不該吃解放加成
        const ECF = ['ea', 'excalibur', 'ubw', 'summon_horror', 'gob', 'gae_bolg', 'tsubame', 'zabaniya', 'petrify', 'chain', 'anti_magic_lance', 'wind_strike', 'projection'];
        const eOffensiveNp = !!String(pcData[nIdx][COL.PC.MARTIAL] || "").trim() && rankVal(enemyNow.six["寶具"] || "-") >= 10
          && (['對軍', '對城', '對界'].indexOf(npAtkScale_(enemyNow)) >= 0 || ECF.some(function (f) { return hasFx_(enemyNow, f); }));
        // 🛡️ 寶具是孤注一擲的殺招、不是見面的招呼：敵方唯有【自己被打殘】或【對方已殘可收尾】才解放真名——
        //    免得玩家一接觸就被無預警的寶具秒殺(「見面開寶具」的惡感)。健康對健康＝先以普攻試探。
        const pHpRatio = (parseInt(pcData[ctgt][COL.PC.MAX_HP]) || 1) > 0 ? (parseInt(pcData[ctgt][COL.PC.HP]) || 0) / (parseInt(pcData[ctgt][COL.PC.MAX_HP]) || 1) : 1;
        const eDesperate = eHpRatio < 0.5;   // 敵自身被打殘→搏命解放
        const eFinisher = pHpRatio < 0.45;   // 我方從者已殘→敵收尾
        let enemyFireNp = eOffensiveNp && !enemyNpSpent && (eDesperate || eFinisher)
          && (Math.random() < (eNpUrge + (1 - eHpRatio) * 0.45 + (eFinisher ? 0.30 : 0)));
        // 🔋 敵寶具也要吃魔力：自身 MP＋敵御主電池須付得起 prana，否則放不出（EX/EA 幾乎沒人付得起→極罕見；masterless 補不了魔→自限）
        if (enemyFireNp) {
          const ePrana = npPranaCost_(enemyNow.six["寶具"]);
          const eAfford = enemyCanAffordNp_(pcData, nIdx, myGameId, ePrana);
          if (eAfford.afford) {
            drainForNp_(sheets, pcData, nIdx, eAfford.masterIdx, ePrana);
            enemyNow.mp = parseInt(pcData[nIdx][COL.PC.MP]) || 0; // 反映耗魔後出力
            enemyNow.output = 100; // ⚖️ 敵解放寶具＝全開(與玩家對等)
            enemyNpSpent = true;
          } else {
            enemyFireNp = false; // 魔力不足，放不出寶具，改為普攻
          }
        }
        const es = fateStrike_(sheets, pcData, enemyNow, ctgt, { counterMul: enemyFireNp ? 1.0 : 0.85, np: enemyFireNp }, ctx);
        rl.eHit = es.hit; rl.eRoll = es.aRoll; rl.eHitVal = es.aHit; rl.eDmg = es.hit ? es.damage : 0; rl.eFired = es.fired; rl.eTarget = String(pcData[ctgt][COL.PC.NAME]); rl.eNp = enemyFireNp;
        if (es.defeat) { defeat = true; victory = false; dreamPrompt = es.dreamPrompt; }
      }
    }
    rounds.push(rl);
    if (defeat) break;
  }

  // 戰報摘要（含寶具對轟的傷害）
  const totalDealt = rounds.reduce((s, r) => s + (r.strikes || []).reduce((a, k) => a + (k.pDmg || 0), 0), 0) + (clash ? (clash.eDmgTaken || 0) : 0);
  const totalTaken = rounds.reduce((s, r) => s + (r.eDmg || 0), 0) + (clash ? (clash.pDmgTaken || 0) : 0);
  const nRounds = rounds.length;
  const atkLabel = dualAttack ? `${atkC.name} 與另一名從者協同` : atkC.name;
  const roundsBrief = rounds.map(r =>
    `第${r.n}回合：` + (r.strikes || []).map(k => `${k.by}${k.pHit ? `命中(−${k.pDmg})` : '揮空'}${k.note ? `【${String(k.note).replace(/\n/g, ' ')}】` : ''}`).join('、') +
    (targetIsFoeServant ? (r.eDmg ? `，「${defC.name}」回擊${r.eTarget ? `「${r.eTarget}」` : ''}(−${r.eDmg})` : (r.eHit === false ? `，「${defC.name}」反擊被擋` : '')) : '')
  ).join('\n');
  const finalLine = destroyedName
    ? (!targetIsFoeServant
        ? `敵御主「${defC.name}」已斃命——凡人之軀、並非靈基消滅（${atkC.cls === 'Caster' ? 'Caster 以魔術給予決定性一擊、非肉搏；' : ''}致命手段依出戰從者職階自行演出）${victory ? '；其從者失去供魔亦將隨之消散，聖杯已近！' : '。'}`
        : `「${defC.name}」靈基崩潰、徹底消滅${victory ? '——此乃最後一名敵對從者，聖杯已近！' : '。'}`)
    : sealEscaped ? `「${defC.name}」被對面御主令咒緊急扯離戰場、遁走不在場。`
      : godRevived ? `「${defC.name}」屢屢自死亡歸來、仍未倒下。`
        : defeat ? `『${atkC.name}』靈基崩潰、化作光點消散，御主敗北。`
          : `「${defC.name}」HP ${parseInt(pcData[nIdx][COL.PC.HP]) || 0}/${parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 0}，尚存——生死由御主後續定奪。`;

  let aiPrompt;
  // 🎬 敘述：給 AI【事實素材】，少下指令——讓它自己演。只保留必要紅線(show-don't-tell／勿擅自寫死)。
  const horrorFired = rounds.some(r => (r.strikes || []).some(k => k.horror));
  if (defeat) {
    aiPrompt = servantCard_(pcData[atkIdx]) +
      `【戰報·已裁定】御主號令『${atkC.name}』與「${defC.name}」鏖戰 ${nRounds} 回合。\n${roundsBrief}\n結局：『${atkC.name}』靈基崩潰、化作光點消散，御主敗北。\n` +
      `★以 Fate／TYPE-MOON 筆觸演出這場敗北的最後一幕(一段即可)${atkC.cls === 'Caster' ? '（Caster 以魔術轟擊為主、非肉搏）' : ''}，語氣留白。勝負已定，你只演過程。`;
  } else {
    aiPrompt = servantCard_(pcData[atkIdx]) +
      `【戰報·已裁定，勝負與傷害不可改】御主號令${atkLabel}出擊，與「${defC.name}」交鋒 ${nRounds} 回合。\n` +
      `${roundsBrief}\n我方造成 ${totalDealt} 傷害、受創 ${totalTaken}。${finalLine}\n` +
      `── 本戰發生的事(素材，自行織入畫面，勿複述標籤名) ──\n` +
      (useSeal ? `· 御主燃燒一道令咒·絕對命令，強令此擊必中、引爆超限戰力。\n` : "") +
      (clash ? `· 寶具對轟：雙方同時解放真名正面對撞，${clash.outcome === 'player' ? '我方威能壓過、光潮貫穿對手' : clash.outcome === 'enemy' ? '對面威能壓過、貫穿我方（從者以鋼鐵意志撐住）' : '勢均力敵、轟然相抵、雙方震退'}。\n` : (useNp ? `· ${atkC.name} 高呼真名、解放了寶具。\n` : "")) +
      (skillBuff ? `· 我方啟動了主動技「${skillBuff.name}」。\n` : "") +
      (horrorFired ? `· 青鬍子以螺湮城教本自深淵召出觸手巨獸「深淵海怪」，常駐戰場、每回合與本人並肩撕咬，靠御主魔力維持(枯竭則潰散)。\n` : "") +
      (dualAttack ? `· 我方兩名從者並肩夾擊同一敵手。\n` : "") +
      (allyAssistName ? `· 盟友從者「${allyAssistName}」依約自側翼掩護助攻。\n` : "") +
      (interceptNote ? `· ${interceptNote}\n` : "") +
      ((battery && battery.usedBattery) ? `· 御主電池：${battery.bledMaster ? `御主焚燒自身血肉(餘 ${battery.masterHp}/${battery.masterHpMax} HP)` : `御主導流自身魔力`}為從者頂上魔力缺口。\n` : "") +
      (godRevived ? `· 十二試煉：${godNote}\n` : "") +
      (sealEscaped ? `· 對面御主燃令咒、強行扯離重傷從者，敵已遁走不在場。${sealNote}\n` : "") +
      ((!destroyedName && !sealEscaped && !godRevived) ? `· 敗方尚有餘力(見上方 HP)——勿描寫死亡／消滅／屍體，生死由御主後續定奪。\n` : "") +
      (atkC.cls === 'Caster' ? `· 出戰從者為 Caster（魔術師）職階：此戰以魔術轟擊為主、非肉搏，演出時勿讓其上前近戰。\n` : "") +
      `★以 Fate／TYPE-MOON 筆觸演出這 ${nRounds} 回合互有攻防的交鋒(約 220~280 字)：show, don't tell，把上列事實化為畫面與張力，技能/寶具演其威能而非報菜名。`;
  }

  // 📊 給前端的多回合視覺戰報
  const report = {
    atk: atkLabel, def: defC.name, rounds: rounds, intercept: !!interceptNote, dual: dualAttack, allyAssist: allyAssistName,
    useNp: useNp, useSeal: useSeal, totalDealt: totalDealt, totalTaken: totalTaken,
    destroyed: destroyedName || "", godRevived: godRevived, sealEscaped: sealEscaped, victory: victory, defeat: defeat,
    defHp: parseInt(pcData[nIdx][COL.PC.HP]) || 0, defHpMax: parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 0,
    atkHp: parseInt(pcData[atkIdx][COL.PC.HP]) || 0, atkHpMax: parseInt(pcData[atkIdx][COL.PC.MAX_HP]) || 0,
    battery: (battery && battery.usedBattery) ? { fromMasterMp: battery.fromMasterMp, fromMasterHp: battery.fromMasterHp, bledMaster: battery.bledMaster, masterHp: battery.masterHp, masterHpMax: battery.masterHpMax } : null,
    skill: skillBuff ? { name: skillBuff.name, icon: skillBuff.icon, desc: skillBuff.desc, bledMaster: !!(skillBattery && skillBattery.bledMaster), fromMasterHp: skillBattery ? skillBattery.fromMasterHp : 0 } : null,
    clash: clash,
    masterHp: parseInt(pcData[pIdx][COL.PC.HP]) || 0, masterHpMax: parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 0,
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
// 🐙 海怪護盾：吉爾解放寶具後，深淵海怪以身為盾護住術師；以 MEMORY【海怪護盾】remaining|expiryAbsHour 持久化。
var HORROR_SHIELD_HP = 200;   // 護盾初始量
var HORROR_SHIELD_HOURS = 8;  // 持續上限（遊戲內小時）
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
function getHorrorShield_(memory, absHour) {
  var m = String(memory || "").match(/【海怪護盾】(\d+)\|(\d+)/);
  if (!m) return { active: false, remaining: 0, expiry: 0 };
  var rem = parseInt(m[1]), exp = parseInt(m[2]);
  if (absHour != null && absHour >= exp) return { active: false, remaining: 0, expiry: exp };
  return { active: rem > 0, remaining: rem, expiry: exp };
}
function setHorrorShield_(memory, remaining, expiry) {
  var s = String(memory || "").replace(/【海怪護盾】\d+\|\d+/, "");
  s = s.replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  return (s ? s + "｜" : "") + "【海怪護盾】" + remaining + "|" + expiry;
}
function clearHorrorShield_(memory) {
  return String(memory || "").replace(/｜?【海怪護盾】\d+\|\d+/, "").replace(/^｜|｜$/, "");
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
    pcData[svIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基重塑", "姿勢": "昂然而立", "負面": "無", "顏面": "神采奕奕" });
    sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
    // 🔋 出力電池制：令咒重塑亦讓御主魔力儲備(唯一供魔源)回滿
    pcData[pIdx][COL.PC.MP] = parseInt(pcData[pIdx][COL.PC.MAX_MP]) || 240;
    sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
    effectMsg = `令咒迸發，重塑「${svName}」的靈基——氣血回滿、傷勢一掃而空，御主魔力儲備亦充盈如初。`;
  } else if (type === "mana") {
    // 🔋 出力電池制：令咒灌頂回充御主魔力儲備(供魔源)，而非從者(從者無池)
    pcData[pIdx][COL.PC.MP] = parseInt(pcData[pIdx][COL.PC.MAX_MP]) || 240;
    sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
    raiseBond_(sheets, pcData[pIdx][COL.PC.NAME], svName, 8);
    effectMsg = `令咒化作一道灌頂的魔力洪流，御主魔力儲備瞬間充盈到極限，與「${svName}」的羈絆也更深了一分。`;
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
    var mad = /狂化|無法言語|僅咆哮|不語/.test(String(p.speech || "") + String(fp));
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
//   ★只供內化、禁複述；願望僅供氛圍不直述；【可】依性格給御主台詞/反應(讓角色有聲)，但【不替御主拍板戰略抉擇】。
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
      `。御主＝玩家所扮演的角色：【可】依其性格/身世自然開口、有神態反應與台詞，讓角色鮮活有聲(別只當沉默旁觀者)；但【不可】替御主拍板下一步戰略抉擇(是否出戰/結盟/移動/補魔由玩家按鍵定奪)、不可逼問玩家要做什麼、不可把劇情快轉越過決策點。\n`;
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

// 🔋 設定從者靈基出力檔位（20/40/60/80/100）：玩家旋鈕，存從者 MEMORY【出力】。免費、即時，不耗 AP。
//   高檔＝戰力強但御主每小時維持費高；100%＝唯一能解放寶具的檔。決定戰鬥表現與御主魔力消耗速度。
function actionSetServantOutput(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無從者可調整出力。" });
  const want = snapOutput_(userData.output);
  pcData[svIdx][COL.PC.MEMORY] = setServantOutput_(pcData[svIdx][COL.PC.MEMORY], want);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  const t = outputTier_(want);
  const svName = pcData[svIdx][COL.PC.NAME];
  return JSON.stringify({
    success: true, output: want, label: t.label,
    message: `已將「${svName}」的靈基出力調至 ${want}%（${t.label}）。${want >= 100 ? '全力解放——可釋放寶具，但御主魔力消耗最劇。' : (want <= 20 ? '僅維持靈基——御主魔力消耗最省，但戰力明顯受限、無法解放寶具。' : '')}`,
    economy: playerServantEconomy_(sheets, pcId, pcData) // 樂觀更新只吃 economy；不再算前端會丟棄的 statusString(省一次整表讀)
  });
}

// 🔮 設定魔境的智慧選定標籤（斯卡哈專屬，玩家點選 1 個通用 A 階被動）：免費、即時、不耗 AP。
//   只接受 mageRealmPool_ 池內 fx；持 mage_realm 的從者才能設；空字串＝清除選擇。
function actionSetMageRealm(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無此從者。" });
  let skills = [];
  try { const tg = JSON.parse(pcData[svIdx][COL.PC.TAGS] || "{}"); skills = tg.skills || []; } catch (e) { }
  if (!skills.some(sk => sk && sk.fx === 'mage_realm')) {
    return JSON.stringify({ success: false, message: "此從者不具「魔境的智慧」，無法自選武技。" });
  }
  const wantFx = String(userData.fx || "");
  const ent = wantFx ? mageRealmEntry_(wantFx) : null;
  if (wantFx && !ent) return JSON.stringify({ success: false, message: "該標籤不在魔境可選之列。" });
  pcData[svIdx][COL.PC.MEMORY] = setMageRealmPick_(pcData[svIdx][COL.PC.MEMORY], wantFx);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  const svName = pcData[svIdx][COL.PC.NAME];
  return JSON.stringify({
    success: true, pick: wantFx,
    message: ent ? `「${svName}」以魔境的智慧運起【${ent.n} A】——${ent.desc}` : `「${svName}」收起所運武技，回歸本來。`
  }); // 樂觀更新·前端自走輕量 syncData，不再算丟棄的 statusString
}

// 🔯 設定原初符文運用方式（持 rune 的從者，玩家選 減傷/增傷/回血）：免費、即時、不耗 AP。
function actionSetRuneMode(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無此從者。" });
  let skills = [];
  try { const tg = JSON.parse(pcData[svIdx][COL.PC.TAGS] || "{}"); skills = (tg.classSkills || []).concat(tg.skills || []); } catch (e) { }
  if (!skills.some(sk => sk && sk.fx === 'rune')) {
    return JSON.stringify({ success: false, message: "此從者不具「原初符文」。" });
  }
  const want = String(userData.mode || 'def');
  if (RUNE_MODES_.indexOf(want) < 0) return JSON.stringify({ success: false, message: "無此符文運用方式。" });
  pcData[svIdx][COL.PC.MEMORY] = setRuneMode_(pcData[svIdx][COL.PC.MEMORY], want);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  const label = { def: '減傷（護符結界）', dmg: '增傷（符文灼擊）', regen: '回血（治癒符文）' }[want];
  return JSON.stringify({
    success: true, mode: want,
    message: `「${pcData[svIdx][COL.PC.NAME]}」將原初符文運用為【${label}】。`
  }); // 樂觀更新·前端自走輕量 syncData，不再算丟棄的 statusString
}

// 🌟 設定多寶具英靈要解放哪個寶具（存從者 MEMORY【寶具選】N）：免費、即時、不耗 AP。
function actionSetNpChoice(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無此從者。" });
  const opts = servantNpOptions_(pcData[svIdx][COL.PC.NAME], pcData[svIdx][COL.PC.RANK]);
  if (!opts || !opts.length) return JSON.stringify({ success: false, message: "此從者只有單一寶具，無從選擇。" });
  const idx = Math.max(0, Math.min(opts.length - 1, parseInt(userData.idx) || 0));
  pcData[svIdx][COL.PC.MEMORY] = setNpChoice_(pcData[svIdx][COL.PC.MEMORY], idx);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  return JSON.stringify({
    success: true, idx: idx,
    message: `「${pcData[svIdx][COL.PC.NAME]}」此戰將解放【${opts[idx].n}】——${opts[idx].desc}`
  }); // 樂觀更新·前端自走輕量 syncData，不再算丟棄的 statusString
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
  // 🔋 共用魔力池制：補魔＝御主硬擠魔術迴路、回滿共用池——但【永久】燒蝕：血量上限−5~10、迴路−1~2(有地板)。
  //   過度補魔＝慢性自盡(迴路↓→池縮、回魔慢、禮裝弱)。另有「被動燃血」：池見底時 applyRegen_ 自動扣御主＋從者HP續契約。
  const CIRC_FLOOR = 8, HP_FLOOR = 40;
  const curMpMax = parseInt(pcData[pIdx][COL.PC.MAX_MP]) || masterPoolMax_(masterCircuits_(pcData[pIdx]), 0);
  const curMp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  if (curMp >= curMpMax) return JSON.stringify({ success: false, message: `御主的魔力儲備已然充盈，毋須補魔（免付燒蝕之代價）。` });

  const isFateMana = myGameId.indexOf("g_") === 0;
  if (isFateMana && getAp_(myGameId) < 1) {
    return JSON.stringify({ success: false, message: "行動力不足以行補魔之儀——請『休息』恢復後再來。" });
  }
  const oldCirc = masterCircuits_(pcData[pIdx]);
  if (oldCirc <= CIRC_FLOOR) {
    return JSON.stringify({ success: false, message: `你的魔術迴路已燒蝕至極限（${oldCirc} 條），再以補魔強擠恐徹底斷絕——改以靈脈／陣地／休息回魔吧。` });
  }
  // 永久代價：迴路−1~2、血量上限−5~10（各有地板）
  const circCut = Math.floor(Math.random() * 2) + 1;   // 1~2
  const hpCut = Math.floor(Math.random() * 6) + 5;     // 5~10
  const newCirc = Math.max(CIRC_FLOOR, oldCirc - circCut);
  const oldMaxHp = parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 100;
  const newMaxHp = Math.max(HP_FLOOR, oldMaxHp - hpCut);
  // 同隊從者魔力 → 重算池上限(新迴路 + 魔力×2)；回滿
  let partyMag = 0;
  pcData.forEach(function (r) { if (String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_")) { try { partyMag += rankVal(JSON.parse(r[COL.PC.SIX] || '{}')['魔力'] || 'E'); } catch (e) { } } });
  const newMpMax = masterPoolMax_(newCirc, partyMag);
  const restored = newMpMax; // 回滿池
  // 寫回：迴路(MEMORY)、血上限、(夾)當前血、池上限、回滿魔
  pcData[pIdx][COL.PC.MEMORY] = /【迴路】\d+/.test(String(pcData[pIdx][COL.PC.MEMORY] || ""))
    ? String(pcData[pIdx][COL.PC.MEMORY]).replace(/【迴路】\d+/, '【迴路】' + newCirc)
    : (String(pcData[pIdx][COL.PC.MEMORY] || "") + '｜【迴路】' + newCirc);
  pcData[pIdx][COL.PC.MAX_HP] = newMaxHp;
  pcData[pIdx][COL.PC.HP] = Math.min(parseInt(pcData[pIdx][COL.PC.HP]) || 0, newMaxHp);
  pcData[pIdx][COL.PC.MAX_MP] = newMpMax;
  pcData[pIdx][COL.PC.MP] = restored;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  raiseBond_(sheets, pcData[pIdx][COL.PC.NAME], svName, 3);
  const mpMax = newMpMax; // 給下方敘述沿用

  let manaAp = AP_PER_DAY, manaClock = "";
  if (isFateMana) { try { manaAp = spendAp_(myGameId, 1).ap; manaClock = clockLabel_(myGameId); } catch (e) { } }

  // ⚔️ 卸防突襲：補魔時門戶大開，同地若有清醒敵從者→趁隙重擊我方從者（可能致敗）
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, userData, 1.4);

  // 戰場補魔：甜而克制的曖昧 fade（給點甜頭、不開慾海引擎）——真・慾海留給鑑賞
  let aiPrompt;
  if (ambush) {
    aiPrompt = `【系統·補魔遭突襲·已裁定】御主正以魔力供給「${svName}」、彼此門戶大開之際，潛伏同地的敵從者「${ambush.enemyName}」${ambush.stealthy ? '自陰影中無聲撲出' : '抓住這破綻猛然殺到'}，一記重擊狠狠貫入「${svName}」（−${ambush.dmg}）${ambush.destroyed ? '，其靈基當場崩潰、化作光點消散，御主敗北' : ''}。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫補魔的私密一刻被突襲打斷的驚變：魔力交融的脆弱、敵襲的兇險、${ambush.destroyed ? '從者消滅的痛楚（語氣留白）' : '從者依其性格與羈絆對此突襲的反應（重情者強撐護主、疏離者未必）'}。傷害與勝負已由系統結算。\n` +
      ``;
  } else {
    aiPrompt = masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
      `【系統·補魔已結算】御主硬擠魔術迴路為「${svName}」回滿共用魔力池（${restored}/${mpMax}），代價沉重——魔術迴路永久燒蝕至 ${newCirc} 條、生命上限永久跌為 ${newMaxHp}。羈絆微升。\n` +
      `★以 Fate／TYPE-MOON 筆觸【精煉 90~140 字】描寫這場「燃迴路續契約」的私密而沉重的一刻——御主強行催動將要燒斷的魔術迴路、魔力沿靈魂聯繫流向從者、體溫與屏息、從者察覺御主迴路受損／面色透支時的反應【一概依其性格與當前羈絆自然演出·不預設溫情(高羈絆或有不忍、冷傲疏離者則淡然受之)】，最後 fade-to-black 留白。\n` +
      `★【鐵律】止於唯美曖昧、點到為止；【不可】出現性器官、性交或露骨情慾描寫（那是奪杯後鑑賞的事）。演出而非複述設定。`;
  }
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, clock: manaClock, ap: manaAp, apMax: AP_PER_DAY, ambush: !!ambush, defeat: ambush ? ambush.defeat : false, dreamPrompt: ambush ? ambush.dreamPrompt : "", report: ambush ? ambush.report : null, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// 🩸 燃血補魔已改為【被動機制】(2026-06)：不再是主動 action。
//   共用魔力池見底、時消耗補不上時，於 applyRegen_(Time_World) 自動「燃命續契約」——
//   缺口÷2，同時扣御主HP＋從者HP(各保底1)。詳見 applyRegen_。舊主動 actionBloodSupply 已移除。

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
      `★以 Fate／TYPE-MOON 筆觸描寫溫存被突襲撕裂的驚變與兇險，${ambush.destroyed ? '及從者消滅的痛楚（語氣留白）' : '及從者依其性格與羈絆對此突襲的反應（重情者強撐護主、疏離者未必）'}。傷害與勝負已由系統結算。\n` +
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
    ambush: !!ambush, defeat: ambush ? ambush.defeat : false, dreamPrompt: ambush ? ambush.dreamPrompt : "", report: ambush ? ambush.report : null,
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
    return JSON.stringify({ success: true, aiPrompt: aiPromptA, clock: clock, ap: ap, apMax: AP_PER_DAY, ambush: true, defeat: ambush.defeat, dreamPrompt: ambush.dreamPrompt || "", report: ambush.report || null, statusString: getFreshStatusString(pcId, pIdx, sheets) });
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
  const probe = resolveFateBattle_(enemyC, svC, { ambush: true });
  let mul = baseMul || 1.4;
  const stealthy = String(pcData[eIdx][COL.PC.RANK]) === 'Assassin' || !!hasFx_(enemyC, 'stealth');
  if (stealthy) mul *= 1.4; // 氣息遮斷／暗殺趁虛而入更致命
  // 突襲傷害取「敵方端」：敵擲贏→全力(probe.damage 即敵傷)；玩家從者擲贏(擋下偷襲)→大減、底傷依敵筋力，
  //   而非玩家自己的攻擊力(原 bug：玩家從者越強、砸自己頭上的突襲傷反而越重)。
  const enemyBase = probe.atkWins ? (probe.damage || 1) : Math.round(rankVal(enemyC.six['筋力'] || 'C') * 1.2 + 6);
  const dmg = Math.max(1, Math.round(enemyBase * mul));
  const out = { enemyName: String(pcData[eIdx][COL.PC.NAME]), dmg: dmg, destroyed: false, defeat: false, dreamPrompt: "", after: 0, stealthy: stealthy };
  let hp = parseInt(pcData[svIdx][COL.PC.HP]) || 0, after = hp - dmg;
  if (after <= 5 && hasFx_(svC, 'survive') && hp > 1) after = 1;
  if (after <= 0 && hasFx_(svC, 'god_hand')) {
    const lives = getGodHandLives_(pcData[svIdx][COL.PC.MEMORY]);
    if (lives > 0) { after = Math.max(1, Math.round((parseInt(pcData[svIdx][COL.PC.MAX_HP]) || 300) * 0.2)); pcData[svIdx][COL.PC.MEMORY] = setGodHandLives_(pcData[svIdx][COL.PC.MEMORY], lives - 1); }
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
  // 📊 卸防突襲也給戰報卡（讓玩家看到數字，不只 AI 敘述）
  out.svName = String(pcData[svIdx][COL.PC.NAME]);
  out.svHpMax = parseInt(pcData[svIdx][COL.PC.MAX_HP]) || 0;
  out.report = {
    ambush: true, enemyName: out.enemyName, svName: out.svName, stealthy: stealthy,
    dmg: dmg, after: out.after, svHpMax: out.svHpMax, destroyed: out.destroyed, defeat: out.defeat
  };
  return out;
}

// 🩸 強撐：沒 AP 又被困時的保命解——扣御主生命換 +4 AP（不耗AP·可重複；舊【強撐】每日限制已棄用）
function actionSecondWind(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  if (myGameId.indexOf("g_") !== 0) return JSON.stringify({ success: false, message: "此處無需強撐。" });
  const clk = getClock_(myGameId);
  // 🩸 強撐＝沒 AP 又被困時的保命解，本身【不耗 AP、可重複】——唯一限制是「血夠不夠燒」(每次扣 20% 上限)。
  //   不再每日一次(那會逼玩家去休息·推時間，違背「燃燒生命續行」初衷)。HP 才是天然煞車：燒到接近見底就擋。
  if (clk && clk.ap >= AP_PER_DAY - 1) return JSON.stringify({ success: false, message: "行動力尚足，毋須燃燒生命強撐。" });
  const maxHp = parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 120;
  const cur = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
  const cost = Math.max(10, Math.round(maxHp * 0.20));
  if (cur <= cost) return JSON.stringify({ success: false, message: "你的身體太過虛弱，再燃燒生命恐當場斷氣——請改用『休息』恢復，或令咒脫離。" });
  pcData[pIdx][COL.PC.HP] = cur - cost;
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
  return JSON.stringify({ success: true, message: `已於「${loc}」佈設陣地（工房）——駐留此地時，從者供魔收入提升。`, clock: clock, ap: ap, apMax: AP_PER_DAY, economy: isFate ? playerServantEconomy_(sheets, pcId, pcData) : null });
}

// 🔍 搜索物資：偵查鄰近敵蹤為主，順手撿拾零星魔力（耗 1 AP）
//   ⚠ 反「無痛回魔」：每地的散逸魔力有限，搜刮一次即枯竭——同地重搜只得殘渣。
//   想真正回滿池要付永久代價(補魔)或靠時間(靈脈/陣地/休息)。標記記於 MEMORY【搜刮】loc。
function getScavengedLoc_(memory) { var m = String(memory || "").match(/【搜刮】([^|【]+)/); return m ? m[1].trim() : ""; }
function setScavengedLoc_(memory, loc) {
  var s = String(memory || "");
  if (/【搜刮】[^|【]*/.test(s)) return s.replace(/【搜刮】[^|【]*/, "【搜刮】" + loc);
  return (s ? s + "｜" : "") + "【搜刮】" + loc;
}
function actionScavenge(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, message: "行動力不足以細細搜索——請休息恢復。" });
  // 🔋 撿拾零星魔力：基礎 ~10% 上限；同地已搜刮過→枯竭、僅得殘渣 ~3%。靠移動探索換取、非站樁刷魔。
  const mpMax = parseInt(pcData[pIdx][COL.PC.MAX_MP]) || 80;
  const cur = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  const curLoc = String(pcData[pIdx][COL.PC.LOC] || "").trim();
  const depleted = getScavengedLoc_(pcData[pIdx][COL.PC.MEMORY]) === curLoc && curLoc !== "";
  const rate = depleted ? 0.03 : 0.10;
  const gain = Math.max(0, Math.min(mpMax, cur + Math.round(mpMax * rate)) - cur);
  pcData[pIdx][COL.PC.MP] = cur + gain;
  if (!depleted && curLoc) pcData[pIdx][COL.PC.MEMORY] = setScavengedLoc_(pcData[pIdx][COL.PC.MEMORY], curLoc);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  let ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(myGameId, 1).ap; clock = clockLabel_(myGameId); } catch (e) { } }
  // 35% 機率察覺鄰近敵蹤（揭露一名最近的未偵查敵）——搜索的真正價值在情報
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
  const haulNote = depleted ? `此地散逸魔力已被你搜刮殆盡，僅再得殘渣——魔力 +${gain}（${pcData[pIdx][COL.PC.MP]}/${mpMax}）。`
    : `搜索此地補給，導入零星散逸魔力——御主魔力 +${gain}（${pcData[pIdx][COL.PC.MP]}/${mpMax}）。`;
  const msg = `${haulNote}${intel || "此地別無敵蹤所獲。"}`;
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
  const mapData = getMapDataCached(sheets); // 坤圖靜態→走 1h 快取
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
        const v = Math.max(0, Math.min(100, (parseInt(rd[i][COL.REL.FAV]) || 0) + delta)); // 地板 0：負 delta(交手削好感)不破底
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
// 敗北虛假之夢（聖杯泥編織的願望成真幻象）。cause==='timeout'＝第14日時限耗盡(破綻改成時鐘停在第14日)；否則＝戰鬥/補魔等敗死。
function buildDreamPrompt_(pcName, wish, servantName, cause) {
  var lead = (cause === 'timeout')
    ? `【虛假之夢·時限耗盡·已裁定】聖杯戰爭的第十四日已盡，御主『${pcName}』終究未能在期限內奪得聖杯，聖杯陷入沉默、戰爭悄然落幕。意識在不甘與疲憊中，墜入聖杯泥所編織的甜美幻象。`
    : `【虛假之夢·已裁定】御主『${pcName}』在聖杯戰爭中敗北，意識墜入聖杯泥所編織的甜美幻象。`;
  var flaw = (cause === 'timeout')
    ? `結尾微露破綻（過於完美的失真，或時鐘永遠停在第十四日的詭異靜止）`
    : `結尾要微微露出破綻（過於完美的失真感）`;
  return lead + `\n` +
    `在這場夢裡，御主的最深願望彷彿已然實現——一切圓滿、溫柔而虛假。${servantName ? `從者『${servantName}』也彷彿仍並肩在側。` : ""}\n` +
    (wish ? `（願望核心參考，僅供構築夢境氛圍，嚴禁逐字複述或直接點明）：${wish}\n` : "") +
    `★以 Fate／TYPE-MOON 筆觸，第二人稱，寫一段唯美而令人心碎的虛假美夢：讓「演出」暗示願望成真的幸福感，絕不可直接說出願望內容或「這是假的」。${servantName ? `從者依其性格自然相伴。` : ""}${flaw}。\n` +
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
// 🧹 把「給 AI 的提示詞」洗成「給玩家看的簡短回顧」：去掉演出依據卡〈…〉、★指令行、──素材──、·條列、【系統標籤】，
//   只留行動梗概並截短。重整歷史時 getGameHistory 顯示的是這個乾淨版，而非整串幕後鷹架。
function cleanNarrateEcho_(promptText) {
  var s = String(promptText || "");
  s = s.replace(/〈[^〉]*〉[^\n]*/g, "");                       // 整段演出依據卡(到行尾)
  s = s.split('\n').filter(function (line) {
    var t = line.trim();
    if (!t) return false;
    if (t.charAt(0) === '★' || t.charAt(0) === '·') return false; // 指令行／素材條列
    if (t.indexOf('──') === 0) return false;                    // 素材分隔
    return true;
  }).join(' ');
  s = s.replace(/【[^】]*】/g, '').replace(/\s+/g, ' ').trim();    // 去【標籤】、收斂空白
  return s.slice(0, 80) || '御主有所行動。';
}

// 🟢 共用敘事核心：帶最近2筆歷史(chatHistory 維持語氣連貫)＋當前狀態(御主/在場從者 HP/MP)，
//   呼叫輕量模型生成一段敘述。回 narrationText；JSON 解析失敗回 null(呼叫端給 fallback)。
//   stateBrief 只給 AI 看、不存歷史。actionNarrateOnly 與 actionMultiAttackNarrate 共用(只差 miniSystem)。
function narrateWithState_(pcId, sheets, promptText, miniSystem, opts) {
  opts = opts || {};
  var aiConfig = {
    temperature: 0.85,
    ignoreLaw: true,            // 不疊規矩表(節慶/天時)
    max_tokens: opts.maxTokens || 720,
    model: "google/gemini-3.1-flash-lite",
    isNsfwMode: !!opts.isNsfw    // NSFW 時讓 fallback 文案合理，但不啟用完整慾海規則
  };
  // 帶最近2筆歷史(miniSystem 已告知 AI：歷史是既定事實、不可重演)
  var recentHistoryRaw = getGameHistoryBatchRaw(pcId, 2);
  if (recentHistoryRaw && recentHistoryRaw.length > 0) {
    aiConfig.chatHistory = recentHistoryRaw.map(function (msg) {
      return { role: msg.speaker === "player" ? "user" : "assistant", content: String(msg.content) };
    });
  }
  // 🩸 自動附「當前狀態」(御主＋在場從者 HP/MP)，敘事才連貫(剛被爆打後該寫狼狽、非沒事人)。讀不到就略過。
  var stateBrief = "";
  try {
    var stData = sheets.pc.getDataRange().getValues();
    var stIdx = stData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
    if (stIdx >= 0) {
      var stGid = String(stData[stIdx][COL.PC.GAME_ID] || "");
      var sParts = ['御主 HP ' + (parseInt(stData[stIdx][COL.PC.HP]) || 0) + '/' + (parseInt(stData[stIdx][COL.PC.MAX_HP]) || 0) + '·魔力 ' + (parseInt(stData[stIdx][COL.PC.MP]) || 0) + '/' + (parseInt(stData[stIdx][COL.PC.MAX_MP]) || 0)];
      stData.forEach(function (r) {
        if (String(r[COL.PC.FACTION]) === '從者' && String(r[COL.PC.GAME_ID] || "") === stGid && !String(r[COL.PC.ID]).startsWith('DEAD_')) {
          sParts.push('從者「' + r[COL.PC.NAME] + '」HP ' + (parseInt(r[COL.PC.HP]) || 0) + '/' + (parseInt(r[COL.PC.MAX_HP]) || 0));
        }
      });
      stateBrief = '【當前狀態·供連貫演出，勿複述數字】' + sParts.join('；') + '。\n';
    }
  } catch (e) { }
  var raw = callGeminiAPI(stateBrief + promptText, miniSystem, aiConfig);
  try {
    var start = raw.indexOf('{'), end = raw.lastIndexOf('}');
    var data = JSON.parse(raw.substring(start, end + 1));
    return data.narration || "天地靜默，一片祥和。";
  } catch (e) { return null; }
}

function actionNarrateOnly(userData, pcId, sheets) {
  const { promptText, isNsfw } = userData;

  const miniSystem = `你是《命運停駐之夜》的說書人。用 Fate／TYPE-MOON 筆觸、第一人稱「我」（玩家＝御主）、強制台灣繁體中文，依指令生動描寫一段劇情。【篇幅以下方指令指定的字數為準，務必節奏明快、不灌水、不堆砌華麗辭藻；無指定時預設精煉 100~160 字】。若為從者廝殺，把關鍵攻防、技能與寶具威能寫得有張力即可，不必逐回合流水帳。
【鐵律】
1. 旁白第一人稱「我」，禁用「你」與上帝視角。
2. 對話格式：角色名：「（動作/神態/眼神/微表情）台詞……（動作/神態/眼神/微表情）台詞（動作/神態/眼神/微表情）」。動作神態【絕對禁止】獨立成段或寫在引號外，一律用全形括號「（）」嵌入台詞開頭/中間/結尾，至少穿插2次以上。
3. 強制分段：每2~3句插入 <br><br>，整段至少3個 <br><br>，禁止整坨。換行一律用 <br><br>，禁止真實換行，禁止輸出任何 HTML 標籤。
4. ★這是純敘事補完，系統底層已結算完所有數值，你只負責寫字。
5. ★對話歷史中的內容是「已經發生並結束」的既定事實，僅供掌握語氣與情緒連貫，禁止把歷史中的動作當成本回合又重演一次；本回合唯一真正發生的新事件，只有當前這句指令提供的內容。
6. ★【連貫與當下狀態】務必依【當前狀態】(血量/魔力)與最近歷史承接劇情，但語氣由「實際勝負與狀態」決定、【不可臆測勝敗】：剛大勝→昂揚或警戒餘悸；浴血慘勝→疲憊卻挺立；落敗→負傷狼狽。血魔將盡(瀕死)→命懸一線、窒迫緊繃，嚴禁輕鬆閒適的閒聊感。移動/互動皆接續前情，不可表現得若無其事；但也別把打贏寫成敗走。禁止複述數字、禁止重演歷史動作。
7. 只輸出 JSON：{"narration":"你的敘述，內含<br><br>分段"}，禁止任何其他欄位、禁止 Markdown。`;

  const narrationText = narrateWithState_(pcId, sheets, promptText, miniSystem, { isNsfw: isNsfw, maxTokens: 720 });
  if (narrationText === null) return JSON.stringify({ success: true, text: "（此處因果已定，氣息微微一閃。）" });
  saveGameHistoryBatch(pcId, [
    { speaker: "player", content: cleanNarrateEcho_(promptText) }, // 🧹 存洗淨摘要、非整串提示詞(否則重整歷史會把演出依據/★指令/素材全攤給玩家看)
    { speaker: "ai", content: narrationText }
  ]);
  return JSON.stringify({ success: true, text: narrationText });
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
7. 依角色職階與寶具掌握其戰鬥方式以維持敘述合理(槍兵突刺、弓兵遠射、術師魔砲、劍兵格鬥、騎兵衝鋒…，勿讓法師被寫成肉搏、弓兵被寫成貼身纏鬥)；寶具／技能名不必逐字複誦全名，可視文筆改用代稱。
8. 只輸出 JSON：{"narration":"你的敘述，內含<br><br>分段"}，禁止任何其他欄位、禁止 Markdown。`;

  const narrationText = narrateWithState_(pcId, sheets, promptText, miniSystem, { isNsfw: isNsfw, maxTokens: 700 });
  if (narrationText === null) return JSON.stringify({ success: true, text: "（此處因果已定，氣息微微一閃。）" });
  try {
    saveGameHistoryBatch(pcId, [
      { speaker: "player", content: cleanNarrateEcho_(promptText) }, // 洗掉提示詞鷹架，不外洩給玩家(同 actionNarrateOnly)
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
  } catch (e) { }
  return JSON.stringify({ success: true, text: narrationText });
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
  // 🔵 門檻：同行的從者才能重新定義稱呼
  if (String(relData[rIdx][COL.REL.IS_PARTY]) !== "同行") {
    return JSON.stringify({ success: false, message: "僅能為同行的從者重新定義這段關係。" });
  }

  const finalTag = String(newTagText).trim();

  sheets.rel.getRange(rIdx + 1, COL.REL.TAG + 1).setValue(finalTag);

  return JSON.stringify({ success: true, message: `羈絆已重新定義為「${finalTag}」。`, newTag: finalTag });
}
// ==========================================
// 🏰 開宗立派邏輯 (高門檻 + 獨立領地版)
// ==========================================
