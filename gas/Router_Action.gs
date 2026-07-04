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
  "claim_grail": actionClaimGrail,
  "enter_kanshou": actionEnterKanshou,
  "dev_resync_codex": actionDevResyncCodex,
  "purge_orphans": actionPurgeOrphans,
  "kanshou_companions": actionKanshouCompanions,
  "kanshou_add": actionKanshouAdd,
  "kanshou_summon_hero": actionKanshouSummonHero, // 🌹 直接從英靈庫挑選(與封存路徑並存，不需先在solo贏得戰爭)
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
  "summon_horror_beast": actionSummonHorror, // 🐙 戰前召喚深淵海怪(變身態·付 prana+1AP)
  "dismiss_horror_beast": actionDismissHorror, // 🐙 解除召喚(免費即時·止住每小時維持費)
  "use_seal": actionUseSeal,
  "mana_supply": actionManaSupply,
  "set_servant_output": actionSetServantOutput,
  "set_mage_realm": actionSetMageRealm,
  "set_rune_mode": actionSetRuneMode,
  "outfit": actionSetOutfit,
  "weapon": actionSetWeapon,
  "save_hero": actionSaveHero,
  "bond": actionBond,
  "rule_break_steal": actionRuleBreakSteal,
  "propose_alliance": actionProposeAlliance,
  "break_alliance": actionBreakAlliance,
  "ally_bond": actionAllyBond,
  "set_workshop": actionSetWorkshop,
  "scavenge": actionScavenge,
  "second_wind": actionSecondWind,
  "scout": actionScout,
  "get_map_nodes": actionGetMapNodes,
  "move": actionMove,
  "sync": actionSync,
  "rest": actionRest,
  "play": actionPlay,
  "narrate_only": actionNarrateOnly
};

// ------------------------------------------
// 🔹 主進入點 (Main Entry) - 極致精簡版
// ------------------------------------------
// 🔴 全域輸入防護：所有玩家輸入在進入任何 action handler 前，先在此統一過濾。
//   前端 maxlength/檢查皆可被繞過(devtools、直打API)，故後端必須是唯一可信的防線。
function sanitizeUserData_(userData) {
  // 名稱類欄位禁用 HTML/JS 斷字字元，避免在前端各處 innerHTML/onclick 拼接時被拿來做標籤或屬性逃脫
  const STRICT_NAME_FIELDS = new Set(["name", "npcName", "targetName", "factionName", "newRelName"]);
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

// ⚡ handler → dispatcher 的整表陣列交棒(2026-07 提速)：寫入完整性已驗證的 handler(move/rest/
//   fate_battle——其所有寫入 helper 皆原地改回同一份 pcData)在成功返回前設此全域，dispatcher 夾
//   _state 時直接複用、省一次整表重讀。GAS 每個請求執行環境獨立，全域不跨請求；dispatcher 開頭重置防呆。
var STATE_PRE_DATA_ = null;

function handleGameAction(userData) {
  STATE_PRE_DATA_ = null; // 每次 dispatch 重置(防同執行環境內殘留)
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
    pc: (isKanshouCtx ? getKanshouPcSheet_(ss) : ss.getSheetByName("眾生"))
  };

  const handler = ActionRouter[action];
  if (!handler) {
    return JSON.stringify({ success: false, message: `系統異常：未知的動作指令「${action}」` });
  }
  // 🛡️ 2026-07 加固：慾海(kanshou)無戰鬥／經濟機制(CLAUDE.md「不打工、無經濟、無戰鬥」)，這批戰鬥/
  //   結盟/工房類 action 過去沒有任何明確擋牆——只是前端 UI 全部隱藏(玩家點不到)，後端本身若被直打
  //   API，多半只能靠「鑑賞眾生表從不會有敵對陣營列」這種資料結構上的間接效果提前失敗(如 fate_battle
  //   查無敵方目標)，但並非每個都吃得到這道隱含防線——例如 set_workshop 只跳過費用檢查、陣地標記仍
  //   會被寫入(純無害廢資料，但不是設計上刻意允許)。改在此統一明確擋下，不再依賴各 action 資料結構
  //   湊巧擋住，讓「慾海不能打仗/不能用經濟機制」是結構保證而非副作用。
  if (isKanshouCtx && KANSHOU_BLOCKED_ACTIONS_[action]) {
    return JSON.stringify({ success: false, message: "慾海是純粹的約會後日談，沒有戰鬥／經濟機制。" });
  }
  // 🔒 寫入互斥(2026-07·技術債清償)：會寫表的動作取 ScriptLock，擋「同鍵重送/連點」重複扣血扣AP。
  //   豁免不取鎖(零成本·不礙 3→1 round-trip 鐵則)：①純讀取 ②長 AI 敘事(narrate_only/play/backfill——
  //   鎖是全域的，被數秒的 AI 呼叫佔住會卡到其他請求)。搶不到鎖(上一動作尚在結算)→回「稍候」而非疊加重跑。
  let _mutex = null;
  if (!LOCK_EXEMPT_ACTIONS_[action]) {
    try {
      _mutex = LockService.getScriptLock();
      if (!_mutex.tryLock(8000)) return JSON.stringify({ success: false, message: "上一個動作尚在結算中——請稍候片刻再操作。" });
    } catch (e) { _mutex = null; } // 取鎖機制本身異常 → 照舊執行(不因鎖壞掉癱瘓遊戲)
  }
  try {
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
  //   ⚡ 2026-07 再提速：優先吃 STATE_PRE_DATA_(寫入完整性已驗證的 handler 交棒的權威陣列)，
  //   省掉 buildClientState_ 的整表重讀；未交棒的 handler 照舊 fallback 重讀，正確性不變。
  if (STATE_AFTER_ACTIONS[action] && String(pcId || "").indexOf("PC_") === 0) {
    try {
      const obj = JSON.parse(out);
      if (obj && obj.success && obj._state === undefined) {
        const st = buildClientState_(sheets, pcId, STATE_PRE_DATA_);
        if (st) { obj._state = st; out = JSON.stringify(obj); }
      }
    } catch (e) { /* 非 JSON 或建構失敗 → 維持原回應，前端 fallback */ }
  }
  return out;
  } finally { if (_mutex) { try { _mutex.releaseLock(); } catch (e) { } } }
}
// 🔒 不取寫入鎖的動作：純讀取(不寫表·鎖了白繳成本) ＋ 長 AI 敘事(佔鎖數秒會卡住全域)。
//   ⚠ sync 雖會 markRivalsSeen_ 標記 SEEN，但該寫入冪等(重標無害)，不值得為它鎖每一次同步。
const LOCK_EXEMPT_ACTIONS_ = {
  check_name: 1, get_full_status: 1, get_heroes: 1, get_masters: 1,
  get_tags: 1, get_map_nodes: 1, sync: 1,
  narrate_only: 1, play: 1, backfill_master_ai: 1,
  save_hero: 1 // 🛠️ 工房鑄造/修改：含數秒 AI 呼叫·只寫英靈殿(append/單列)不碰戰場——佔全域鎖會卡死其他玩家
};
// ⚡ 會改動 solo 戰場狀態、前端事後會 syncData(整頁刷新) 的動作 → 夾帶 _state 省一趟 round-trip。
//   不含：sync(本身即 state)／get_tags／純讀取(inspect/get_*)／創角召喚(自走 reload)／kanshou(KPC_)；
//   也不含「樂觀更新」的輕量 setter(set_servant_output/set_mage_realm/set_rune_mode)——
//   它們不 syncData、只吃 res.economy，夾 _state 反而白做整表讀取。
//   也不含 narrate_only——前端 narrate() 只吃 res.text、不消費 _state，夾它純浪費整表讀。
const STATE_AFTER_ACTIONS = {
  fate_battle: 1, use_seal: 1, mana_supply: 1, bond: 1, rule_break_steal: 1,
  propose_alliance: 1, break_alliance: 1, ally_bond: 1, set_workshop: 1, scavenge: 1,
  second_wind: 1, scout: 1, move: 1, rest: 1, summon_horror_beast: 1, dismiss_horror_beast: 1,
  update_fate: 1, update_rel_tag: 1
};
// 🛡️ 慾海(KPC_)明確擋下的戰鬥／經濟／結盟類 action(2026-07 加固)——皆為 solo 戰爭專屬，前端在
//   kanshou 模式下本就全數隱藏對應按鈕(Script.html applyModeUI/renderWarActions)。取自
//   STATE_AFTER_ACTIONS 扣掉 move(慾海約會地圖也要移動)/update_fate/update_rel_tag(確認為通用
//   敘事欄編輯、不涉陣營或戰鬥概念，慾海也適用不擋)，另補上 3 個「樂觀更新」輕量 setter(不進
//   STATE_AFTER_ACTIONS，但同樣是純戰鬥概念、solo 從者卡專屬)。
// ⚠ 2026-07 再修：補上 prep_meal(純戰鬥向 buff，UI 因 war-actions 隱藏而點不到，但未列入黑名單、
//   直打 API 仍可對「鑑賞眾生」寫入無意義的戰鬥記憶戳)、purge_orphans(嚴重——見 Account.gs
//   actionPurgeOrphans 註解，若以 KPC_ 呼叫會誤刪整張「鑑賞眾生」表的所有帳號資料；該函式本身
//   也已改成直接指名讀「眾生」表當第二道防線，這裡是第一道)。
const KANSHOU_BLOCKED_ACTIONS_ = {
  fate_battle: 1, use_seal: 1, mana_supply: 1, bond: 1, rule_break_steal: 1,
  propose_alliance: 1, break_alliance: 1, ally_bond: 1, set_workshop: 1, scavenge: 1,
  second_wind: 1, scout: 1, rest: 1, summon_horror_beast: 1, dismiss_horror_beast: 1,
  set_servant_output: 1, set_mage_realm: 1, set_rune_mode: 1,
  prep_meal: 1, purge_orphans: 1
};

// ==========================================
// 🔴 動作處理模組 (Action Handlers)
// ==========================================

function actionCheckName(userData, pcId, sheets) {
  // 🔴 userData.name 已在 sanitizeUserData_ 清成純中文；若清洗後為空，代表玩家輸入含非中文(英數/符號)，直接擋下
  if (!userData.name) {
    return JSON.stringify({ invalidName: true, message: "名號僅限中文字，不可使用英文、數字或符號。" });
  }
  // 🔵 2026-07 修：與 create(actionManualNpc) 一致——不再擋跨局同名（game_id 實例化·多帳號分流·玩家御主
  //   靠 pcId 認人，跨局撞名無害；原本全表擋撞名害「分享出去多人玩」時常見/正典名號被別局佔走而創不了角）。
  //   只擋【正典角色名】(避免與本局被種入的同名正典敵手雙胞胎)；想扮演正典請走「扮演正典御主」入口。省整表讀。
  const _canonHit = (typeof SEED_MASTERS !== 'undefined' && SEED_MASTERS.some(m => m && m.name === userData.name))
    || (typeof SEED_SERVANTS !== 'undefined' && SEED_SERVANTS.some(s => s && s.name === userData.name));
  return JSON.stringify({ exists: _canonHit, canon: _canonHit, message: _canonHit ? `「${userData.name}」是聖杯戰爭中已知的英靈／御主——請另取名號，或用「扮演正典御主」入口。` : "" });
}

function actionGetFullStatus(userData, pcId, sheets) {
  const targetName = userData.targetName;
  const allPcData = sheets.pc.getDataRange().getValues();
  // ⚠ 2026-07 修：原本純用 NAME 找列，沒比對 game_id——不同帳號/不同局若剛好撞名(種子有限、
  // chaos/AI原創從者都可能撞)，會把別局角色的狀態字串/關係/是否可編修洩漏出去。改比對呼叫者
  // 自己那列現查出的 game_id(myGameId 為空時放行，相容沒有 game_id 的舊資料)。
  const me = allPcData.find(r => r[COL.PC.ID] == pcId);
  const myGameId = me ? String(me[COL.PC.GAME_ID] || "") : "";
  const row = allPcData.find(r => r[COL.PC.NAME] === targetName && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId));
  if (!row) return JSON.stringify({ success: false, message: "查無此人" });

  const targetId = row[COL.PC.ID];
  // 2026-07：關係併入眾生列，這名角色對御主的關係就是他自己這一列的欄位，不用再查關係表。
  const relMem = String(row[COL.PC.REL_MEM] || "");
  const canEditFate = (String(row[COL.PC.IS_PARTY] || "") === "同行");
  return JSON.stringify({ success: true, statusString: buildPlayerStatusString(row, relMem), targetId: targetId, targetSex: row[COL.PC.SEX], canEditFate: canEditFate });
}

function actionUpdateFate(userData, pcId, sheets) {
  const { targetId, fateType, fateValue } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  // 🔧 2026-07 修：從者狀態(📜 狀態鈕)開的 openStatus 傳的是【名字】非 ID(currentStatusTargetId=名)——
  //   原本只比對 r.ID===targetId，對從者改命恆「查無此人」。改成【ID 或 同行從者名字】皆可、限本局
  //   game_id(防跨局撞名／名字誤中敵方非同行者)。御主自己走 ID 分支照舊。
  const me = pcData.find(r => r[COL.PC.ID] == pcId);
  const myGameId = me ? String(me[COL.PC.GAME_ID] || "") : "";
  const pIdx = pcData.findIndex(r => {
    if (String(r[COL.PC.ID]).startsWith("DEAD_")) return false;
    if (myGameId && String(r[COL.PC.GAME_ID] || "") !== myGameId) return false;
    if (r[COL.PC.ID] == targetId) return true; // ID 直配（御主自己／舊路徑）
    return String(r[COL.PC.NAME]) === String(targetId) && String(r[COL.PC.IS_PARTY] || "") === "同行"; // 名字配·限同行從者
  });
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  if (String(pcData[pIdx][COL.PC.ID]) != String(pcId)) {
    // 2026-07：關係併入眾生列，直接看這名角色自己的 IS_PARTY 欄。
    if (String(pcData[pIdx][COL.PC.IS_PARTY] || "") !== "同行") {
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

  const relMem = String(pcData[pIdx][COL.PC.REL_MEM] || "");
  return JSON.stringify({ success: true, statusString: buildPlayerStatusString(pcData[pIdx], relMem) });
}

function actionGetTags(userData, pcId, sheets) {
  return JSON.stringify(buildTagsPayload_(sheets, pcId));
}
// 🔧 抽出共用：左側狀態卡資料建構。get_tags 與 sync 共用同一份，讓「一次按鍵」少一趟 round-trip。
//   preData＝呼叫端已讀好的整表，傳入即免重讀(省整表 I/O)。2026-07：關係併入眾生列，不再需要 preRel。
function buildTagsPayload_(sheets, pcId, preData) {
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
    // 🎴 2026-07：外顯狀態(condition)自 payload 移除——solo 卡不顯示、慾海御主卡以 physical(肉體)抵換
    physical: m[COL.PC.PHYSICAL] || "{}", // 🌹 慾海御主卡「肉體狀態抵換外顯」用；solo 恆 "{}"、前端不顯示
    hp: hpWord(m[COL.PC.HP], m[COL.PC.MAX_HP]),
    hpNum: parseInt(m[COL.PC.HP]) || 0, hpMax: parseInt(m[COL.PC.MAX_HP]) || 0,
    mpNum: parseInt(m[COL.PC.MP]) || 0, mpMax: parseInt(m[COL.PC.MAX_MP]) || 0,
    seals: getPlayerSeals_(m[COL.PC.MEMORY]), wish: wish
  };

  // 🗝️ 雙從者：收齊所有在世我方從者（servants 陣列）；servant＝第一個（向後相容）
  let servants = [];
  pcData.forEach(s => {
    if (String(s[COL.PC.FACTION]) !== "從者" || String(s[COL.PC.GAME_ID] || "") !== gameId || String(s[COL.PC.ID]).startsWith("DEAD_")) return;
    // 2026-07：關係併入眾生列，好感直接是這名從者自己的 BOND 欄
    const bond = parseInt(s[COL.PC.BOND]) || 0;
    let six = {}, skills = [], traits = [];
    try { six = JSON.parse(s[COL.PC.SIX] || "{}"); } catch (e) { }
    try { const tg = JSON.parse(s[COL.PC.TAGS] || "{}"); skills = tg.skills || []; traits = tg.traits || []; } catch (e) { }
    servants.push({
      name: s[COL.PC.NAME], cls: s[COL.PC.RANK] || "從者", sex: s[COL.PC.SEX],
      // ⚡ 預取狀態字串(2026-07 提速)：隨 state 一併帶回，前端「📋資料→切從者」直接秒顯，
      //   免每次點從者都打一趟 get_full_status(GAS round-trip 正是那 5~6 秒的根因)。與御主自看(localStorage 快照)同款即時。
      statusString: buildPlayerStatusString(s, String(s[COL.PC.REL_MEM] || "")),
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
      // 🐕 主從synergy（恩奇都·變容）：與銀狼結契時亮起全盛(全能A·寶A++)、否則暗示需該御主。玩家不可控·御主決定
      synergy: masterSynergyView_(s[COL.PC.NAME], s[COL.PC.MEMORY]),
      // 🗡️ 理想鄉·無敵結界（阿爾托莉雅＋御主持 Avalon 禮裝）：被動自動·敵解放 6 階究極寶具且御主魔力≥100 時自動擋下(耗 100 魔)。此旗標僅供卡片資訊標籤
      canIdealRealm: (/阿爾托莉雅/.test(String(s[COL.PC.NAME] || "")) && String(s[COL.PC.RANK]) === 'Saber' && getMystic_(m[COL.PC.MEMORY]) === 'avalon'),
      // 🌟 多寶具英靈：寶具選單＋當前選定索引（前端點寶具時挑要放哪個）
      npOptions: servantNpOptions_(s[COL.PC.NAME], s[COL.PC.RANK]) || undefined,
      npChoice: npChoice_(s[COL.PC.MEMORY]),
      // 🐙 深淵海怪肉身（持 summon_horror 且現存海怪時 {cur,max}）：前端在體力條下方獨立渲染一條海怪血條
      horror: skills.some(function (sk) { return sk && sk.fx === 'summon_horror'; }) ? horrorShieldView_(s[COL.PC.MEMORY], gameId) : undefined,
      // 🐙 戰前召喚鈕：持 summon_horror 且海怪【尚未在場】→ 前端露出「召喚海怪」按鈕(變身態·跨戰鬥 12h)
      canSummonHorror: skills.some(function (sk) { return sk && sk.fx === 'summon_horror'; }) && !horrorShieldView_(s[COL.PC.MEMORY], gameId),
      outfit: getOutfit_(s[COL.PC.MEMORY]), // 👗 玩家換裝：當前服裝(前端預填/顯示·換衣不換人)
      weapon: getWeapon_(s[COL.PC.MEMORY]), // ⚔️ 玩家自定武裝：武器/戰鬥方式(前端預填/顯示·敘述以此為準)
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

// ⚡ preData(2026-07 提速)：手上已有最新整表陣列的呼叫端(見 STATE_PRE_DATA_ 交棒機制)傳入複用，
//   省掉這裡的整表重讀——前提是該 handler 的所有寫入都已反映回它那份陣列(worldTick_/spendAp_/
//   raiseBond_/fateStrike_ 等 helper 皆已支援原地改)。沒給→照舊自己讀(權威 fallback)。
function buildClientState_(sheets, pcId, preData) {
  const allPcData = preData || sheets.pc.getDataRange().getValues();
  try { markRivalsSeen_(sheets, pcId, allPcData); } catch (e) { } // 🔵 戰爭迷霧：就地標記 SEEN+批次寫回，免二次整表讀
  const pcIndex = allPcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pcIndex === -1) return null;
  const curL = allPcData[pcIndex][COL.PC.LOC];
  const freshMapData = getMapDataCached(sheets); // 坤圖靜態→走 1h 快取
  const currentMapInfo = freshMapData.find(m => m[COL.MAP.NAME] === (curL ? String(curL).split('-')[0] : ""));
  const gid = String(allPcData[pcIndex][COL.PC.GAME_ID] || "");
  const isFate = gid && gid.indexOf("g_") === 0;
  // ⚡ 2026-07：時鐘併入御主列，clockLabel_/getAp_ 傳 allPcData 走記憶體查找，不再另外整表讀時鐘表。
  let clk = "", ap = AP_PER_DAY;
  if (isFate) { try { clk = clockLabel_(gid, allPcData); ap = getAp_(gid, allPcData); } catch (e) { } }
  return {
    statusString: buildPlayerStatusString(allPcData[pcIndex]),
    // 2026-07：關係併入眾生列，不再需要關係表 → 少一次整表讀
    people: getLocalPeopleList(sheets, allPcData[pcIndex][COL.PC.NAME], pcId, curL, allPcData),
    locations: getNearbyLocations(curL, freshMapData),
    mapDesc: currentMapInfo ? currentMapInfo[COL.MAP.DESC] : "四下靜謐。",
    clock: clk, ap: ap, apMax: AP_PER_DAY,
    economy: isFate ? playerServantEconomy_(sheets, pcId, allPcData) : null,
    tags: buildTagsPayload_(sheets, pcId, allPcData),
    // ⚡ 2026-07：地圖節點夾帶進共用 state blob(零額外整表讀，allPcData 已在手)——
    //   免得手機每次切到地圖頁/每個動作後都要另打一趟 get_map_nodes round-trip(地圖更新慢的根因)。
    mapNodes: buildMapNodesPayload_(sheets, allPcData, gid, curL ? String(curL).trim() : "")
  };
}
function actionSync(userData, pcId, sheets) {
  const st = buildClientState_(sheets, pcId);
  if (!st) return JSON.stringify({ success: false, message: "查無此人" });
  st.success = true;
  return JSON.stringify(st);
}

// 2026-07：關係併入眾生列——直接改這名 NPC 自己那一列的 REL_TAG 欄，不再查關係表。
function actionUpdateRelTag(userData, pcId, sheets) {
  const { targetName, newTagText } = userData;
  if (!newTagText || !String(newTagText).trim()) return JSON.stringify({ success: false, message: "稱呼不可為空。" });

  const pcData = sheets.pc.getDataRange().getValues();
  // ⚠ 2026-07 修：原本純比對姓名就直接寫 REL_TAG——下面雖有「同行」門檻，但那只檢查該列自己
  // 的 IS_PARTY 旗標，不保證是「我這局」的同行者；不同局剛好有同名同行從者仍會被誤改。改比對
  // 呼叫者自己列現查出的 game_id(myGameId 為空時放行，相容沒有 game_id 的舊資料)。
  const me = pcData.find(r => r[COL.PC.ID] == pcId);
  const myGameId = me ? String(me[COL.PC.GAME_ID] || "") : "";
  const tIdx = pcData.findIndex(r => r[COL.PC.NAME] === targetName && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId));
  if (tIdx === -1) return JSON.stringify({ success: false, message: "查無此段羈絆。" });

  // 🔵 門檻：同行的從者才能重新定義稱呼
  if (String(pcData[tIdx][COL.PC.IS_PARTY] || "") !== "同行") {
    return JSON.stringify({ success: false, message: "僅能為同行的從者重新定義這段關係。" });
  }

  const finalTag = String(newTagText).trim();
  sheets.pc.getRange(tIdx + 1, COL.PC.REL_TAG + 1).setValue(finalTag);

  return JSON.stringify({ success: true, message: `羈絆已重新定義為「${finalTag}」。`, newTag: finalTag });
}

