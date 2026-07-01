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
  "backfill_master_ai": actionBackfillMasterAi, // 🚀 開局非阻塞：create 後於召喚頁背景補御主敘事欄
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
  "narrate_only": actionNarrateOnly
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
//   也不含 narrate_only——前端 narrate() 只吃 res.text、不消費 _state，夾它純浪費整表讀。
const STATE_AFTER_ACTIONS = {
  fate_battle: 1, use_seal: 1, mana_supply: 1, bond: 1, rule_break_steal: 1,
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
  const wm = String(m[COL.PC.MEMORY] || "").match(/【願望】([^｜|【]*)/);
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
      // 🐙 深淵海怪肉身（持 summon_horror 且現存海怪時 {cur,max}）：前端在體力條下方獨立渲染一條海怪血條
      horror: skills.some(function (sk) { return sk && sk.fx === 'summon_horror'; }) ? horrorShieldView_(s[COL.PC.MEMORY], gameId) : undefined,
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
      var mcb = mc.fx && MC_COMBAT_[mc.fx] ? MC_COMBAT_[mc.fx] : null;
      var eff = mcb ? [(mcb.hit ? '命中+' + mcb.hit : ''), (mcb.dmgAdd ? '傷+' + mcb.dmgAdd : ''), (mcb.npMul && mcb.npMul !== 1 ? '寶具×' + mcb.npMul : ''), (mcb.npDefMul && mcb.npDefMul !== 1 ? '承受寶具×' + mcb.npDefMul : '')].filter(Boolean).join('・') : '';
      mystic = { id: mid, name: mc.name, type: mc.type, desc: mc.desc, effect: eff };
    }
  } catch (e) { }
  // 🗝️ 破戒之力（前端決定是否顯示「破戒奪僕」按鈕）：限正式聖杯戰爭世界
  var canRB = false;
  try { if (gameId && gameId.indexOf("g_") === 0) { var pIdxRB = pcData.findIndex(r => r[COL.PC.ID] == pcId); if (pIdxRB >= 0) canRB = canRuleBreak_(pcData, pIdxRB, gameId); } } catch (e) { }
  return { success: true, master: master, servant: servant, servants: servants, economy: economy, bondUsed: bondUsed, mystic: mystic, canRuleBreak: canRB, servantSlots: servants.length };
}

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

