// ==========================================
// 🔴【第三部分：原生非同步中樞分流器 handleGameAction】Router_Action.gs
// ==========================================

// ------------------------------------------
// 🔹 路由映射表 (Action Router)
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。
// ------------------------------------------
const ActionRouter = {
  "check_name": actionCheckName,
  "check_sheets": actionCheckSheets, // 🔘 登入畫面手動按鈕：檢查/建立缺少的試算表分頁(Setup_FateWorld.gs)
  "account_login": actionAccountLogin,
  "account_new_game": actionAccountNewGame,
  "end_run": actionEndRun, // ⚠ claim_grail(奪杯封存) 已整個砍除，改成單純清理讓玩家開新局
  "enter_kanshou": actionEnterKanshou,
  "kanshou_reset": actionKanshouReset,   // 🔄 鑑賞歸零重來(只清這個帳號的後日談，不碰英靈殿與 solo)
  "backfill_kanshou_ai": actionBackfillKanshouAi, // 🚀 開局非阻塞：enter_kanshou 首次建檔後背景補御主敘事欄
  "dev_resync_codex": actionDevResyncCodex,
  "purge_orphans": actionPurgeOrphans,
  "kanshou_companions": actionKanshouCompanions,
  "kanshou_memoir_op": actionKanshouMemoirOp, // 💞 共同回憶面板：釘選/取消釘選/刪除(玩家UI手動管理)
  "world": actionWorld,        // 🌍 世界帳本面板：list/pin/unpin/del(玩家看得到、管得動)
  "kanshou_summon_hero": actionKanshouSummonHero, // 🌹 慾海同伴唯一入口：直接從英靈庫召喚，不需先在solo贏得戰爭
  "kanshou_party": actionKanshouParty,     // 🫂 加入/離開同行（誰在這一幕裡）
  "kanshou_set_sex": actionKanshouSetSex,
  "kanshou_get_style": actionKanshouGetStyle, // 🎨 說書人設定面板：讀整張風格表(預設＋玩家版)
  "kanshou_set_style": actionKanshouSetStyle, // 🎨 改一格／還原一格／全部還原
  "kanshou_set_name": actionKanshouSetName,
  "prep_meal": actionPrepMeal,
  "get_full_status": actionGetFullStatus,
  "update_fate": actionUpdateFate,
  "update_rel_tag": actionUpdateRelTag,
  "kanshou_set_nickname": actionSetNickname, // 🔒 專屬稱呼比照 update_rel_tag：solo 吃 CUSTOM_TAG_BOND_ 門檻，鑑賞無門檻
  "roll_fate": actionRollFate, // 🎲 命運測定：一次回三份候選（唯一真實來源在 Core_Settings.gs）
  "create": actionManualNpc, // 御主創角。
  "backfill_master_ai": actionBackfillMasterAi, // 🚀 開局非阻塞：create 後於召喚頁背景補御主敘事欄
  "summon_servant": actionSummonServant,
  "get_heroes": actionGetHeroes,
  "get_masters": actionGetMasters,
  "get_tags": actionGetTags,
  "fate_battle": actionFateBattle,
  "np_respond": actionNpRespond, // 🌟 真名解放·獨立一拍：敵寶具預告後由玩家選應對
  "summon_horror_beast": actionSummonHorror, // 🐙 戰前召喚深淵海怪(變身態·付 prana+1AP)
  "dismiss_horror_beast": actionDismissHorror, // 🐙 解除召喚(免費即時·止住每小時維持費)
  "use_seal": actionUseSeal,
  "mana_supply": actionManaSupply,
  "spirit_repair": actionSpiritRepair, // 🩹 靈基修復：消費共用魔力池為從者療傷（不燃令咒，可重複使用）
  "set_servant_output": actionSetServantOutput,
  "set_mage_realm": actionSetMageRealm,
  "set_rune_mode": actionSetRuneMode,
  "outfit": actionSetOutfit,
  "weapon": actionSetWeapon,
  "save_hero": actionSaveHero,
  "claim_hero": actionClaimHero, // 🖐 認領無主原創英靈(印記功能前鑄的·認領後可修改)
  "bond": actionBond,
  "rule_break_steal": actionRuleBreakSteal,
  "propose_alliance": actionProposeAlliance,
  "break_alliance": actionBreakAlliance,
  "ally_bond": actionAllyBond,
  "parley": actionParley, // 🕊️ 對同地未結盟敵御主交涉：閒聊／交換情報／請他退讓（PARLEY_ACTS_ 一張表）
  "set_workshop": actionSetWorkshop,
  "scavenge": actionScavenge,
  "second_wind": actionSecondWind,
  "scout": actionScout,
  "get_map_nodes": actionGetMapNodes,
  "faction_ambush": actionFactionAmbush, // 🥷 撞見敵人分心時趁隙偷襲
  "incite": actionIncite,                // 🎭 挑撥離間敵對兩方
  "move": actionMove,
  "sync": actionSync,
  "rest": actionRest,
  "play": actionPlay,
  "narrate_only": actionNarrateOnly,
  "tiger_dojo": actionTigerDojo, // 🐯 賽後番外(敗北講評/勝利祝賀)：自帶說書人設定、不吃戰場 miniSystem
};

function sanitizeUserData_(userData) {
  // 名稱類欄位禁用 HTML/JS 斷字字元，避免在前端各處 innerHTML/onclick 拼接時被拿來做標籤或屬性逃脫。（全文見 CODE_NOTES.md）
  // 🐛→✅ 2026-09：世界帳本的條目名原本借用 `name` 鍵，被下面 CHINESE_NAME_FIELDS 當成 solo 創角姓名清成
  //   純中文≤10字——玩家開的「Cafe 藍調」變「藍調」、帶「·」的地名被剝掉，而 AI 寫進同一張帳本的名字
  //   卻允許英數＋20 字。改用 entryName／newName 走這裡（剝 HTML/MEMORY 結構字元、上限 20＝AI 那條規則）。
  const STRICT_NAME_FIELDS = new Set(["name", "npcName", "targetName", "factionName", "newTagText", "newNickname", "pcName", "trueName", "acctName", "servantName", "foeName", "newPlace", "entryName", "newName"]);
  // 🔴 只在「建立角色/登記NPC」的姓名欄位強制純中文(去英數/符號/空白)；
  const CHINESE_NAME_FIELDS = new Set(["name", "npcName"]);
  const NAME_MAX = 20;
  const GLOBAL_MAX = 2000; // 一般自由文字欄位(訊息/敘述/意圖等)的最終上限，各 handler 仍可再收更緊

  // 控制字元、零寬字元、雙向控制字元 —— 對畫面顯示無意義，只會被用來搞渲染或藏字
  const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
  // 開頭為這些字元、寫入 Google Sheet 儲存格時可能被解讀成公式
  const FORMULA_LEAD_RE = /^[=+\-@\t\r]+/;

  for (const key in userData) {
    if (typeof userData[key] !== "string") continue;
    let v = userData[key].replace(CONTROL_RE, "");
    if (CHINESE_NAME_FIELDS.has(key)) {
      v = cleanChineseName(v);
    } else if (STRICT_NAME_FIELDS.has(key)) {
      v = v.trim().replace(/[<>&"'`｜【】]/g, "").slice(0, NAME_MAX);
    } else {
      v = v.slice(0, GLOBAL_MAX);
    }
    userData[key] = v.replace(FORMULA_LEAD_RE, "");
  }
  return userData;
}

// ⚡ handler → dispatcher 的整表陣列交棒：寫入完整性已驗證的 handler(其所有寫入 helper 皆原地改回同一份 pcData)在成功返回前設此全域，dispatcher 夾 _state 時直接複用、省一次整表重讀。
var STATE_PRE_DATA_ = null;

function handleGameAction(userData) {
  STATE_PRE_DATA_ = null; // 每次 dispatch 重置(防同執行環境內殘留)
  if (typeof userData === "string") {
    try { userData = JSON.parse(userData); }
    catch (err) { return JSON.stringify({ success: false, message: "資料對不上，重新整理再試。" }); }
  }
  userData = sanitizeUserData_(userData);

  const action = userData.action || "play";
  const pcId = userData.pcId;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // 🔄 試算表存在性檢查改成純手動(check_sheets action、登入畫面按鈕)，不再每個 action 都自動跑一次。
  const isKanshouCtx = String(pcId || "").indexOf("KPC_") === 0;
  // 坤圖已靜態化：getMapDataCached 直接讀 FATE_MAP_SEED 常數，不需要 sheets.map，省一次 Sheets API 呼叫。
  const sheets = {
    pc: (isKanshouCtx ? getKanshouPcSheet_(ss) : ss.getSheetByName("眾生"))
  };

  const handler = ActionRouter[action];
  if (!handler) {
    return JSON.stringify({ success: false, message: "沒有這個動作，重新整理再試。" });
  }
  // 🔒 稽核抓到系統性漏洞：get_tags/sync/fate_battle/bond/mana_supply…等近全部solo戰場action，long-standing只用裸findIndex信任前端傳來的pcId，完全沒反查「帳號」表確…（全文見 CODE_NOTES.md）
  if (pcId && !OWNERSHIP_CHECK_EXEMPT_[action] && !verifyPcOwnership_(userData.acctName, pcId)) {
    return JSON.stringify({ success: false, message: "找不到你的角色。" });
  }
  if (isKanshouCtx && KANSHOU_BLOCKED_ACTIONS_[action]) {
    return JSON.stringify({ success: false, message: "後日談沒有戰鬥。" });
  }
  // 🔒 稽核抓到：actionPlay_(Gallery.gs)因AI呼叫數秒~數十秒故意豁免全域鎖，改用CacheService鍵kplay_<pcId> 做自己的軟性互斥，只防「同pcId兩次play互撞」；但其餘kanshou sette…（全文見 CODE_NOTES.md）
  if (isKanshouCtx && action !== 'play' && !LOCK_EXEMPT_ACTIONS_[action]) {
    try {
      if (CacheService.getScriptCache().get("kplay_" + String(pcId || ""))) {
        return JSON.stringify({ success: false, message: "上一步還在跑，等一下。" });
      }
    } catch (e) { }
  }
  // 🔒 寫入互斥：會寫表的動作取 ScriptLock，擋「同鍵重送/連點」重複扣血扣AP。
  let _mutex = null;
  if (!LOCK_EXEMPT_ACTIONS_[action]) {
    try {
      _mutex = LockService.getScriptLock();
      if (!_mutex.tryLock(8000)) return JSON.stringify({ success: false, message: "上一步還在算，等一下。" });
    } catch (e) { _mutex = null; } // 取鎖機制本身異常 → 照舊執行(不因鎖壞掉癱瘓遊戲)
  }
  try {
  let out = handler(userData, pcId, sheets);
  if (String(pcId || "").indexOf("PC_") === 0 && !isKanshouCtx) {
    try {
      var ro = JSON.parse(out);
      if (ro && ro.success && !ro.victory && !ro.defeat) {
        // 日子從【資料】問，不從回傳的時鐘【字串】解析（見 CODE_NOTES.md）。
        // 優先複用 STATE_PRE_DATA_(handler 交棒、已含本次寫入的權威陣列)；沒交棒又有 clock 才整表重讀。
        var pdata = STATE_PRE_DATA_ || (ro.clock ? sheets.pc.getDataRange().getValues() : null);
        var prow = pdata ? pdata.find(function (r) { return String(r[COL.PC.ID]) === pcId; }) : null;
        var gid = prow ? String(prow[COL.PC.GAME_ID] || "") : "";
        var _clk = gid ? getClock_(gid, pdata) : null;
        if (_clk && _clk.day > FATE_DEADLINE_DAYS_) {
          var svRow = pdata.find(function (r) { return String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gid && !String(r[COL.PC.ID]).startsWith("DEAD_"); });
          ro.defeat = true; ro.deadline = true; ro.victory = false; ro.servantDream = "";
          if (!ro.dreamPrompt) ro.dreamPrompt = buildDreamPrompt_(String(prow[COL.PC.NAME]), extractWish_(prow[COL.PC.MEMORY]), svRow ? String(svRow[COL.PC.NAME]) : "", 'timeout');
          out = JSON.stringify(ro);
        }
      }
    } catch (e) { /* 非 JSON / 無 clock → 略過 */ }
  }
  // ⚡ 2→1：solo 遊戲動作回應自動夾帶最新 client state(_state)，前端套用後即不必再打一趟 sync。
  if (STATE_AFTER_ACTIONS[action] && (String(pcId || "").indexOf("PC_") === 0 || isKanshouCtx)) {
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
const OWNERSHIP_CHECK_EXEMPT_ = {
  check_name: 1, check_sheets: 1, dev_resync_codex: 1, purge_orphans: 1,
  account_login: 1, account_new_game: 1, enter_kanshou: 1, create: 1,
  get_heroes: 1, get_masters: 1, claim_hero: 1, save_hero: 1
};
const LOCK_EXEMPT_ACTIONS_ = {
  check_name: 1, get_full_status: 1, get_heroes: 1, get_masters: 1,
  get_tags: 1, get_map_nodes: 1, sync: 1,
  narrate_only: 1, tiger_dojo: 1, play: 1, backfill_master_ai: 1, backfill_kanshou_ai: 1,
  save_hero: 1 // 🛠️ 工房鑄造/修改：含數秒 AI 呼叫·只寫英靈殿(append/單列)不碰戰場——佔全域鎖會卡死其他玩家
};
// ⚡ 會改動 solo 戰場狀態、前端事後會 syncData(整頁刷新) 的動作 → 夾帶 _state 省一趟 round-trip。
const STATE_AFTER_ACTIONS = {
  fate_battle: 1, np_respond: 1, use_seal: 1, mana_supply: 1, spirit_repair: 1, bond: 1, rule_break_steal: 1,
  propose_alliance: 1, break_alliance: 1, ally_bond: 1, set_workshop: 1, scavenge: 1,
  second_wind: 1, scout: 1, rest: 1, summon_horror_beast: 1, dismiss_horror_beast: 1,
  faction_ambush: 1, incite: 1, parley: 1, move: 1,
  update_fate: 1, update_rel_tag: 1, kanshou_set_nickname: 1
};
// 🛡️ 慾海(KPC_)明確擋下的戰鬥／經濟／結盟類 action——皆為 solo 戰爭專屬，前端在 kanshou 模式下本就全數隱藏對應按鈕，這裡擋 API 直打。
const KANSHOU_BLOCKED_ACTIONS_ = {
  fate_battle: 1, np_respond: 1, use_seal: 1, mana_supply: 1, spirit_repair: 1, bond: 1, rule_break_steal: 1,
  propose_alliance: 1, break_alliance: 1, ally_bond: 1, set_workshop: 1, scavenge: 1,
  second_wind: 1, scout: 1, rest: 1, summon_horror_beast: 1, dismiss_horror_beast: 1,
  set_servant_output: 1, set_mage_realm: 1, set_rune_mode: 1,
  prep_meal: 1, purge_orphans: 1, faction_ambush: 1, incite: 1, parley: 1,
  weapon: 1, get_map_nodes: 1, narrate_only: 1, tiger_dojo: 1,
  end_run: 1, create: 1, summon_servant: 1, backfill_master_ai: 1,
  account_login: 1, account_new_game: 1,
  move: 1
};

// ==========================================
// 🔴 動作處理模組 (Action Handlers)
// ==========================================

function actionCheckName(userData, pcId, sheets) {
  // 🔴 userData.name 已在 sanitizeUserData_ 清成純中文；若清洗後為空，代表玩家輸入含非中文(英數/符號)，直接擋下
  if (!userData.name) {
    return JSON.stringify({ invalidName: true, message: "名字只能用中文字。" });
  }
  // 與 create(actionManualNpc) 一致——不擋跨局同名（game_id 實例化，玩家御主靠 pcId 認人，跨局撞名無害）。
  const _canonHit = (typeof SEED_MASTERS !== 'undefined' && SEED_MASTERS.some(m => m && cleanChineseName(m.name) === userData.name))
    || (typeof SEED_SERVANTS !== 'undefined' && SEED_SERVANTS.some(s => s && cleanChineseName(s.realName) === userData.name));
  return JSON.stringify({ exists: _canonHit, canon: _canonHit, message: _canonHit ? `「${userData.name}」是聖杯戰爭中已知的英靈／御主——請另取名號，或用「扮演正典御主」入口。` : "" });
}

// 🔒 呼叫者身分解析：get_full_status/update_fate/update_rel_tag/kanshou_set_nickname 這4個solo/鑑賞共用handler，用這支找出呼叫者自己的 game_id。
function resolveCallerGameId_(pcData, pcId) {
  if (String(pcId || "").indexOf("KPC_") === 0) {
    const idx = kanshouPcIdx_(pcData, pcId);
    return idx === -1 ? null : String(pcData[idx][COL.PC.GAME_ID] || "");
  }
  const me = pcData.find(r => r[COL.PC.ID] == pcId);
  return me ? String(me[COL.PC.GAME_ID] || "") : null;
}

function actionGetFullStatus(userData, pcId, sheets) {
  const targetName = userData.targetName;
  const allPcData = sheets.pc.getDataRange().getValues();
  const myGameId = resolveCallerGameId_(allPcData, pcId);
  if (myGameId === null) return JSON.stringify({ success: false, message: "找不到這個人" });
  const tIdx = findPcRowIdx_(allPcData, myGameId, { name: targetName });
  if (tIdx === -1) return JSON.stringify({ success: false, message: "找不到這個人" });
  const row = allPcData[tIdx];

  const targetId = row[COL.PC.ID];
  // 關係併入眾生列，這名角色對御主的關係就是他自己這一列的欄位，不用再查關係表。
  const relMem = String(row[COL.PC.REL_MEM] || "");
  const canEditFate = (String(row[COL.PC.IS_PARTY] || "") === "同行");
  return JSON.stringify({ success: true, statusString: buildPlayerStatusString(row, relMem), targetId: targetId, targetSex: row[COL.PC.SEX], canEditFate: canEditFate });
}

function actionUpdateFate(userData, pcId, sheets) {
  const { targetId, fateType, fateValue } = userData;
  let pcData = sheets.pc.getDataRange().getValues();
  // 從者狀態(📜 狀態鈕)開的 openStatus 傳的是【名字】非 ID，故需接受 ID 或同行從者名字，且限本局 game_id(防跨局撞名／名字誤中敵方非同行者)。
  const myGameId = resolveCallerGameId_(pcData, pcId);
  if (myGameId === null) return JSON.stringify({ success: false, message: "找不到這個人" });
  const pIdx = pcData.findIndex(r => {
    if (String(r[COL.PC.ID]).startsWith("DEAD_")) return false;
    if (myGameId && String(r[COL.PC.GAME_ID] || "") !== myGameId) return false;
    if (r[COL.PC.ID] == targetId) return true; // ID 直配（御主自己／舊路徑）
    return String(r[COL.PC.NAME]) === String(targetId) && (myGameId.indexOf("k_") === 0 || String(r[COL.PC.IS_PARTY] || "") === "同行");
  });
  if (pIdx === -1) return JSON.stringify({ success: false, message: "找不到這個人" });

  if (String(pcData[pIdx][COL.PC.ID]) != String(pcId)) {
    // 關係併入眾生列，直接看這名角色自己的 IS_PARTY 欄(鑑賞豁免·同上)。
    if (myGameId.indexOf("k_") !== 0 && String(pcData[pIdx][COL.PC.IS_PARTY] || "") !== "同行") {
      return JSON.stringify({ success: false, message: `只能改跟你同行的從者。` });
    }
  }

  // 🔵 只准改 3 種敘事欄（個性/特徵/身世）；數值(六圍/迴路/禮裝)與寶具(martial)一律不可改——GAS 掌數值鐵則。
  //    ⚠ 'intent'(萌點) 2026-09 整組退休，路由一併拔除——玩家「萌不萌是玩家的事情，我們只給性格」。
  let targetCol = fateType === 'trait' ? COL.PC.TRAIT : fateType === 'pref' ? COL.PC.PREF : fateType === 'back' ? COL.PC.BACK : -1;
  if (targetCol === -1) return JSON.stringify({ success: false, message: "這格改不了，只能改個性、特徵、身世。" });
  // 🔴 命格欄位直寫入表格，需自行把關長度：身世 單格 80；個性/特徵 為頓號拼接、給較寬上限
  var cap = fateType === 'back' ? 80 : 130; // 經歷(back)放寬到80配合AI滾動
  pcData[pIdx][targetCol] = String(fateValue || "").slice(0, cap);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);

  const relMem = String(pcData[pIdx][COL.PC.REL_MEM] || "");
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：逆天改命的單欄寫入已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, statusString: buildPlayerStatusString(pcData[pIdx], relMem) });
}

function actionGetTags(userData, pcId, sheets) {
  return JSON.stringify(buildTagsPayload_(sheets, pcId));
}
// 🔧 抽出共用：左側狀態卡資料建構。get_tags 與 sync 共用同一份，讓「一次按鍵」少一趟 round-trip。
function buildTagsPayload_(sheets, pcId, preData) {
  const pcData = preData || sheets.pc.getDataRange().getValues();
  // mIdx 順手記下來，下面 canRuleBreak_ 需要索引時直接複用，不必再 findIndex 重掃一次。
  const mIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  const m = mIdx >= 0 ? pcData[mIdx] : undefined;
  if (!m) return { success: false };
  const gameId = String(m[COL.PC.GAME_ID] || "");
  const isFateCtx = gameId.indexOf("g_") === 0;

  const hpWord = (hp, mx) => {
    hp = parseInt(hp) || 0; mx = parseInt(mx) || 1; const p = hp / mx;
    return p >= 0.99 ? "無傷" : p >= 0.7 ? "輕傷" : p >= 0.4 ? "負傷" : p > 0.15 ? "重傷" : p > 0 ? "瀕死" : "力竭";
  };

  let wish = "";
  const wm = String(m[COL.PC.MEMORY] || "").match(/【願望】([^｜|【]*)/);
  if (wm) wish = wm[1].trim();

  const master = {
    name: m[COL.PC.NAME], sex: m[COL.PC.SEX],
    // 🎴 外顯狀態(condition)自 payload 移除——solo 卡不顯示、慾海御主卡以 physical(肉體)抵換
    physical: m[COL.PC.PHYSICAL] || "{}", // 🌹 慾海御主卡「肉體狀態抵換外顯」用；solo 恆 "{}"、前端不顯示
    hp: hpWord(m[COL.PC.HP], m[COL.PC.MAX_HP]),
    hpNum: parseInt(m[COL.PC.HP]) || 0, hpMax: parseInt(m[COL.PC.MAX_HP]) || 0,
    mpNum: parseInt(m[COL.PC.MP]) || 0, mpMax: parseInt(m[COL.PC.MAX_MP]) || 0,
    // seals(令咒)是純solo戰爭概念，用 isFateCtx 讓鑑賞列結構性恆為0，不依賴資料形狀僥倖安全。
    seals: isFateCtx ? getPlayerSeals_(m[COL.PC.MEMORY]) : 0, wish: wish,
    outfit: getOutfit_(m[COL.PC.MEMORY]) // 👕 慾海御主本人換裝(與從者outfit同款·供卡片「換裝」鈕預填)
  };

  // 🗝️ 雙從者：收齊所有在世我方從者（servants 陣列）；servant＝第一個（向後相容）🌍 solo 靠 IS_PARTY==="同行" 過濾隊伍；鑑賞無「隊伍」概念，改用 LOC 是否與玩家目前位置一致，卡片只顯示同地點的英靈。
  let servants = [];
  // 🫂 同行名單：鑑賞的從者卡要直接畫「同行／解散」，玩家才不必為了一顆鈕去開「誰在哪」面板
  //    （2026-09 玩家：「應該要把同行放到左邊的詳細狀態跟關係那邊吧…不然我還要打開誰在哪這個畫面」）。
  let _partyIds = [];
  try { if (m) _partyIds = kanshouGetParty_(m[COL.PC.MEMORY]); } catch (e) { }
  pcData.forEach(s => {
    if (String(s[COL.PC.FACTION]) !== "從者" || String(s[COL.PC.GAME_ID] || "") !== gameId || String(s[COL.PC.ID]).startsWith("DEAD_")) return;
    if (isFateCtx ? (String(s[COL.PC.IS_PARTY] || "") !== "同行") : (String(s[COL.PC.LOC] || "").trim() !== String(m[COL.PC.LOC] || "").trim())) return;
    // 關係併入眾生列，好感直接是這名從者自己的 BOND 欄
    const bond = parseInt(s[COL.PC.BOND]) || 0;
    let six = {}, skills = [], traits = [];
    try { six = JSON.parse(s[COL.PC.SIX] || "{}"); } catch (e) { }
    try { const tg = JSON.parse(s[COL.PC.TAGS] || "{}"); skills = tg.skills || []; traits = tg.traits || []; } catch (e) { }
    servants.push({
      // 🆔 2026-07「整體重構·id優先」：舊版卡片只帶 name，前端只能用名字回指定這名從者(雙從者名字撞前綴時就會選錯人)——補上 id，前端存起來隨後續 action 回傳，後端 findPcRowIdx_/findPlayerServantIdx_ 才有 id 可用、不必再靠名字比對這條容易出錯的路。
      id: s[COL.PC.ID],
      name: s[COL.PC.NAME], cls: s[COL.PC.RANK] || "從者", sex: s[COL.PC.SEX],
      tag: s[COL.PC.REL_TAG] || "從者", // 🏷️ 關係標籤(鑑賞卡片「🏷️關係」鈕預填用；solo不使用此欄)
      nickname: getNickname_(s[COL.PC.REL_MEM]), // 💬 專屬稱呼裸值(鑑賞卡片「🏷️關係」面板預填用)
      party: _partyIds.indexOf(String(s[COL.PC.ID])) >= 0, // 🫂 她是不是跟著你走(鑑賞卡片的同行/解散鈕)
      // 預取狀態字串隨 state 一併帶回，前端切從者直接秒顯，免每次都打一趟 get_full_status round-trip。
      statusString: buildPlayerStatusString(s, String(s[COL.PC.REL_MEM] || "")),
      hp: hpWord(s[COL.PC.HP], s[COL.PC.MAX_HP]),
      hpNum: parseInt(s[COL.PC.HP]) || 0, hpMax: parseInt(s[COL.PC.MAX_HP]) || 0,
      mpNum: parseInt(s[COL.PC.MP]) || 0, mpMax: parseInt(s[COL.PC.MAX_MP]) || 0,
      output: servantOutput_(s[COL.PC.MEMORY]), outputLabel: outputTier_(servantOutput_(s[COL.PC.MEMORY])).label, // 🔋 靈基出力檔位
      np: s[COL.PC.MARTIAL] || "寶具未顯現", bond: isFateCtx ? bond : undefined,
      six: six, skills: skills, traits: traits,
      // 🔮 魔境的智慧（斯卡哈）：前端露出可選被動盤。has＝持 mage_realm；pick＝已選 fx；pool＝可選清單
      mageRealm: isFateCtx && skills.some(function (sk) { return sk && sk.fx === 'mage_realm'; })
        ? { has: true, pick: mageRealmPick_(s[COL.PC.MEMORY]), pool: mageRealmPool_() } : null,
      // 🔯 原初符文運用方式（持 rune 者才給，前端標籤可點開挑 減傷/增傷/回血）
      runeMode: isFateCtx && skills.some(function (sk) { return sk && sk.fx === 'rune'; }) ? runeMode_(s[COL.PC.MEMORY]) : undefined,
      // 🐕 主從synergy（恩奇都·變容）：與銀狼結契時亮起全盛(全能A·寶A++)、否則暗示需該御主。玩家不可控·御主決定
      synergy: isFateCtx ? masterSynergyView_(s[COL.PC.NAME], s[COL.PC.MEMORY]) : null,
      // 🗡️ 理想鄉·無敵結界（阿爾托莉雅＋御主持 Avalon 禮裝）：被動自動·敵解放 6 階究極寶具且御主魔力≥100 時自動擋下(耗 100 魔)。
      canIdealRealm: isFateCtx && (String(s[COL.PC.NAME] || "").trim() === '阿爾托莉雅·潘德拉貢' && String(s[COL.PC.RANK]) === 'Saber' && getMystic_(m[COL.PC.MEMORY]) === 'avalon'),
      // 🌟 多寶具英靈：寶具選單＋當前選定索引（前端點寶具時挑要放哪個）
      npOptions: isFateCtx ? (servantNpOptions_(s[COL.PC.NAME], s[COL.PC.RANK]) || undefined) : undefined,
      npChoice: isFateCtx ? npChoice_(s[COL.PC.MEMORY]) : undefined,
      // 🐙 深淵海怪肉身（持 summon_horror 且現存海怪時 {cur,max}）：前端在體力條下方獨立渲染一條海怪血條
      horror: isFateCtx && skills.some(function (sk) { return sk && sk.fx === 'summon_horror'; }) ? horrorShieldView_(s[COL.PC.MEMORY], gameId, pcData) : undefined,
      ghLives: isFateCtx && skills.some(function (sk) { return sk && sk.fx === 'god_hand'; }) ? getGodHandLives_(s[COL.PC.MEMORY]) : undefined,
      // 🐙 戰前召喚鈕：持 summon_horror 且海怪【尚未在場】→ 前端露出「召喚海怪」按鈕(變身態·跨戰鬥 12h)
      canSummonHorror: isFateCtx && skills.some(function (sk) { return sk && sk.fx === 'summon_horror'; }) && !horrorShieldView_(s[COL.PC.MEMORY], gameId, pcData),
      outfit: getOutfit_(s[COL.PC.MEMORY]), // 👕 玩家換裝：當前服裝(前端預填/顯示·換衣不換人)
      weapon: getWeapon_(s[COL.PC.MEMORY]), // ⚔️ 玩家自定武裝：武器/戰鬥方式(前端預填/顯示·敘述以此為準)
      pref: s[COL.PC.PREF] || "", physical: s[COL.PC.PHYSICAL] || "{}", // 🌹 慾海卡用：個性/肉體
      trait: s[COL.PC.TRAIT] || "",
      stolen: /【破戒奪取】/.test(String(s[COL.PC.MEMORY] || ""))
    });
  });
  let servant = servants[0] || null;
  // 💠 供魔收支（左側狀態卡顯示用）：僅正式聖杯戰爭世界算
  var economy = (gameId && gameId.indexOf("g_") === 0) ? playerServantEconomy_(sheets, pcId, pcData) : null;
  // 💕 今日已用過的羈絆互動（前端用來灰掉按鈕）
  var bondUsed = [];
  if (gameId && gameId.indexOf("g_") === 0) {
    try { var bclk = getClock_(gameId, pcData); bondUsed = getBondUsedToday_(m[COL.PC.MEMORY], bclk ? bclk.day : 1); } catch (e) { }
  }
  // ✨ 禮裝（御主裝備槽）：純solo戰鬥被動加成概念，用 isFateCtx 結構性擋掉鑑賞列，同 seals 手法。
  var mystic = null;
  try {
    var mid = isFateCtx ? getMystic_(m[COL.PC.MEMORY]) : "";
    if (mid && MYSTIC_CODES[mid]) {
      var mc = MYSTIC_CODES[mid];
      var mcb = mc.fx && MC_COMBAT_[mc.fx] ? MC_COMBAT_[mc.fx] : null;
      var eff = mcb ? [(mcb.hit ? '命中+' + mcb.hit : ''), (mcb.dmgAdd ? '傷+' + mcb.dmgAdd : ''), (mcb.npMul && mcb.npMul !== 1 ? '寶具×' + mcb.npMul : ''), (mcb.npDefMul && mcb.npDefMul !== 1 ? '承受寶具×' + mcb.npDefMul : '')].filter(Boolean).join('・') : '';
      mystic = { id: mid, name: mc.name, type: mc.type, desc: mc.desc, effect: eff };
    }
  } catch (e) { }
  // 🗝️ 破戒之力（前端決定是否顯示「破戒奪僕」按鈕）：限正式聖杯戰爭世界
  var canRB = false;
  try { if (gameId && gameId.indexOf("g_") === 0 && mIdx >= 0) canRB = canRuleBreak_(pcData, mIdx, gameId); } catch (e) { }
  // 🗑️ 2026-09 地點整組退休：這裡原本算 myPlaces／myPeople／myRegions 三份下傳給【地圖】畫，
  //    地圖沒了就沒人讀了（同伴清單走 kanshou_companions，跟這裡無關）。
  // 🎯 撞見敵人的可反應窗口（趁隙/挑撥/溜走）：僅 solo 且窗口 loc＝目前所在地時給前端，供顯示情境按鈕。
  var encWin = null;
  if (isFateCtx) {
    var _w = getEncounterWindow_(m[COL.PC.MEMORY]);
    if (_w && _w.loc === String(m[COL.PC.LOC] || "").trim()) encWin = { type: _w.type, choices: encounterChoices_(_w.type) };
  }
  // 🗺️ myLoc：玩家此刻所在地。
  return { success: true, master: master, servant: servant, servants: servants, economy: economy, bondUsed: bondUsed, mystic: mystic, canRuleBreak: canRB, worldTextMax: (gameId && gameId.indexOf("k_") === 0) ? worldSpec_(gameId).textMax : undefined,
      encounterWindow: encWin, myLoc: String(m[COL.PC.LOC] || ""),
    // 🌙 夜未眠(Gallery.gs KANSHOU_NIGHT_SCENE_TAG_)：HUD 那顆鈕要據此把「🌙睡覺」換成「🌅睡到天亮」。
    nightScene: (typeof KANSHOU_NIGHT_SCENE_TAG_ !== 'undefined'
      && KANSHOU_NIGHT_SCENE_TAG_.get(m[COL.PC.MEMORY]) === (parseInt(m[COL.PC.DAY]) || 0)) || undefined };
}

function buildClientState_(sheets, pcId, preData) {
  const allPcData = preData || sheets.pc.getDataRange().getValues();
  const isKanshouSync_ = /^(KPC_|KHV_|KSV_)/.test(String(pcId || ""));
  if (!isKanshouSync_) { try { markRivalsSeen_(sheets, pcId, allPcData); } catch (e) { } } // 🔵 戰爭迷霧：就地標記 SEEN+批次寫回，免二次整表讀
  const pcIndex = allPcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pcIndex === -1) return null;
  const curL = allPcData[pcIndex][COL.PC.LOC];
  const freshMapData = getMapDataCached(sheets); // 坤圖已靜態化，直讀常數，零I/O成本(非快取，過期措辭已更正)
  const currentMapInfo = freshMapData.find(m => m[COL.MAP.NAME] === (curL ? String(curL).split('-')[0] : ""));
  const gid = String(allPcData[pcIndex][COL.PC.GAME_ID] || "");
  const isFate = gid && gid.indexOf("g_") === 0;
  // 時鐘併入御主列，clockLabel_/getAp_ 傳 allPcData 走記憶體查找，不再另外整表讀時鐘表。
  let clk = "", ap = AP_PER_DAY, kanshouClock = null;
  if (isFate) { try { clk = clockLabel_(gid, allPcData); ap = getAp_(gid, allPcData); } catch (e) { } }
  const isKanshouCtx_ = gid.indexOf("k_") === 0;
  if (isKanshouCtx_) { try { const ci = kanshouClockInfo_(allPcData[pcIndex]); clk = ci.label; kanshouClock = ci; } catch (e) { } }
  return {
    statusString: buildPlayerStatusString(allPcData[pcIndex]),
    // 關係併入眾生列，不再需要關係表 → 少一次整表讀
    // 鑑賞不送 people：那一軌前端沒有任何讀取端（2026-09 連同後端的整表掃描一起拿掉）；solo 照舊。
    people: isKanshouCtx_ ? [] : getLocalPeopleList(sheets, allPcData[pcIndex][COL.PC.NAME], pcId, curL, allPcData),
    locations: getNearbyLocations(curL, freshMapData, isFate ? getWarName_(allPcData[pcIndex][COL.PC.MEMORY]) : ""),
    mapDesc: currentMapInfo ? currentMapInfo[COL.MAP.DESC] : "四下靜謐。",
    clock: clk, ap: ap, apMax: AP_PER_DAY,
    kanshouClock: kanshouClock,
    economy: isFate ? playerServantEconomy_(sheets, pcId, allPcData) : null,
    tags: buildTagsPayload_(sheets, pcId, allPcData),
    // 地圖節點夾帶進共用 state blob(allPcData 已在手，零額外整表讀)，免每次切地圖頁另打一趟 round-trip。
    mapNodes: buildMapNodesPayload_(sheets, allPcData, gid, curL ? String(curL).trim() : "")
  };
}
function actionSync(userData, pcId, sheets) {
  const st = buildClientState_(sheets, pcId);
  if (!st) return JSON.stringify({ success: false, message: "找不到這個人" });
  st.success = true;
  return JSON.stringify(st);
}

// 關係併入眾生列——直接改這名 NPC 自己那一列的 REL_TAG 欄，不再查關係表。
function actionUpdateRelTag(userData, pcId, sheets) {
  const { targetName, newTagText, targetId } = userData;
  // 🧹 空白＝清掉這一格。2026-09 起 REL_TAG 的預設值【就是空的】（見 heroToKanshouRow_），
  //    空是合法狀態，UI 必須走得回去——否則玩家會被鎖在一個他不要的標籤上（實測：AI 把
  //    提示詞裡的「純女女之愛」四個人全填了一遍，玩家清不掉）。清除同時解開【關係鎖】，
  //    等於「撤回我的指定」，這一格回到交給 AI 維護的預設狀態。
  const _clearing = !String(newTagText == null ? "" : newTagText).trim();

  const pcData = sheets.pc.getDataRange().getValues();
  // 光靠姓名+下方「同行」門檻不保證是「我這局」的同行者；不同局剛好有同名同行從者仍會被誤改，故需再比對呼叫者自己列的 game_id(myGameId 為空時放行，相容沒有 game_id 的舊資料)。
  const myGameId = resolveCallerGameId_(pcData, pcId);
  if (myGameId === null) return JSON.stringify({ success: false, message: "找不到這段關係。" });
  const tIdx = findPcRowIdx_(pcData, myGameId, { id: targetId, name: targetName });
  if (tIdx === -1) return JSON.stringify({ success: false, message: "找不到這段關係。" });

  // 🔵 solo 仍要求「同行的從者才能重新定義稱呼」；鑑賞無 IS_PARTY 概念，改稱呼是低風險設定、不要求同行。
  if (myGameId.indexOf("k_") !== 0 && String(pcData[tIdx][COL.PC.IS_PARTY] || "") !== "同行") {
    return JSON.stringify({ success: false, message: "只能改跟你同行的從者。" });
  }

  const finalTag = _clearing ? "" : String(newTagText).trim();
  // 🔒 自訂稱呼會被字面「TA是你的${tag}」原樣塞進 AI 提示詞當既定事實，低羈絆就打露骨自訂稱呼
  //    會讓 AI 照著演。solo 仍吃這道門檻；鑑賞 2026-09 好感整組砍除後沒有這個數字，稱呼全交玩家。
  if (myGameId.indexOf("k_") !== 0) {
    const bond = parseInt(pcData[tIdx][COL.PC.BOND]) || 0;
    if (bond < CUSTOM_TAG_BOND_) {
      return JSON.stringify({ success: false, message: `羈絆到 ${CUSTOM_TAG_BOND_} 才能自己取稱呼，現在 ${bond}。` });
    }
  }

  // 需同步寫回 pcData 的記憶體鏡射，才能安全交棒 STATE_PRE_DATA_(否則夾帶的 _state.people 會顯示舊稱呼)。
  pcData[tIdx][COL.PC.REL_TAG] = finalTag;
  sheets.pc.getRange(tIdx + 1, COL.PC.REL_TAG + 1).setValue(finalTag);
  // 🔒 玩家自己打過就鎖住：從此 AI 不再改這一格（鑑賞的 intimacy_feedback.npcs[].rel_tag 會跳過）。
  {
    const _rm = String(pcData[tIdx][COL.PC.REL_MEM] || "");
    const _newRm = kanshouRelMemBuild_(getNickname_(_rm), { nick: kanshouRelLocked_(_rm, 'nick'), tag: !_clearing });
    if (_newRm !== _rm) {
      pcData[tIdx][COL.PC.REL_MEM] = _newRm;
      sheets.pc.getRange(tIdx + 1, COL.PC.REL_MEM + 1).setValue(_newRm);
    }
  }

  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：REL_TAG改寫已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, message: _clearing ? "關係稱呼清掉了。" : `改成「${finalTag}」了。`, newTag: finalTag });
}

// 🔒 專屬稱呼比照 update_rel_tag 同一套門檻與同一個 injection 風險；玩家手動設定後蓋【稱呼鎖】，AI 不再自動覆寫。
function actionSetNickname(userData, pcId, sheets) {
  const { targetName, newNickname, targetId } = userData;
  if (!newNickname || !String(newNickname).trim()) return JSON.stringify({ success: false, message: "稱呼不能空白。" });

  const pcData = sheets.pc.getDataRange().getValues();
  // 🔒 帳號歸屬驗證（2026-07 再稽核抓到的漏洞補上，見 resolveCallerGameId_ 說明）。
  const myGameId = resolveCallerGameId_(pcData, pcId);
  if (myGameId === null) return JSON.stringify({ success: false, message: "找不到這段關係。" });
  const tIdx = findPcRowIdx_(pcData, myGameId, { id: targetId, name: targetName });
  if (tIdx === -1) return JSON.stringify({ success: false, message: "找不到這段關係。" });

  if (myGameId.indexOf("k_") !== 0) {
    const bond = parseInt(pcData[tIdx][COL.PC.BOND]) || 0;
    if (bond < CUSTOM_TAG_BOND_) {
      return JSON.stringify({ success: false, message: `羈絆到 ${CUSTOM_TAG_BOND_} 才能自己取稱呼，現在 ${bond}。` });
    }
  }

  // 分隔符安全：清掉可能撞到REL_MEM組字格式的符號(｜全形/[]方括號)，避免污染後續欄位解析。
  const finalNick = sanitizeNickname_(newNickname);
  if (!finalNick) return JSON.stringify({ success: false, message: "稱呼不能空白。" });

  const oldRMem = String(pcData[tIdx][COL.PC.REL_MEM] || "");
  // 🔒 覆寫【專屬稱呼】＋補上【稱呼鎖】；另一把鎖(關係)原樣留著——走共用組裝口，少接一把就會被洗掉。
  const newRMem = kanshouRelMemBuild_(finalNick, { nick: true, tag: kanshouRelLocked_(oldRMem, 'tag') });

  pcData[tIdx][COL.PC.REL_MEM] = newRMem;
  sheets.pc.getRange(tIdx + 1, COL.PC.REL_MEM + 1).setValue(newRMem);

  STATE_PRE_DATA_ = pcData;
  return JSON.stringify({ success: true, message: `對方會叫你「${finalNick}」了。`, newNickname: finalNick });
}

