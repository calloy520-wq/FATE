// ==========================================
// 🔴【第三部分：原生非同步中樞分流器 handleGameAction】Router_Action.gs
// ==========================================

// ------------------------------------------
// 🔹 路由映射表 (Action Router)
// ------------------------------------------
const ActionRouter = {
  "check_name": actionCheckName,
  "check_sheets": actionCheckSheets, // 🔘 登入畫面手動按鈕：檢查/建立缺少的試算表分頁(Setup_FateWorld.gs)
  "account_login": actionAccountLogin,
  "account_new_game": actionAccountNewGame,
  "end_run": actionEndRun, // ⚠ claim_grail(奪杯封存) 已整個砍除，改成單純清理讓玩家開新局
  "enter_kanshou": actionEnterKanshou,
  // 📔 日記鑑賞(第三軌·實驗)：全部實作在 Diary.gs，刪掉那檔＋這三行就整個消失。
  "enter_diary": actionEnterDiary,
  "diary_schedule": actionDiarySchedule,
  "diary_week": actionDiaryWeek,
  "backfill_kanshou_ai": actionBackfillKanshouAi, // 🚀 開局非阻塞：enter_kanshou 首次建檔後背景補御主敘事欄
  "dev_resync_codex": actionDevResyncCodex,
  "purge_orphans": actionPurgeOrphans,
  "kanshou_companions": actionKanshouCompanions,
  "kanshou_memoir_op": actionKanshouMemoirOp, // 💞 共同回憶面板：釘選/取消釘選/刪除(玩家UI手動管理)
  "kanshou_summon_hero": actionKanshouSummonHero, // 🌹 慾海同伴唯一入口：直接從英靈庫召喚，不需先在solo贏得戰爭
  "kanshou_set_sex": actionKanshouSetSex,
  "kanshou_set_name": actionKanshouSetName,
  "kanshou_set_home_name": actionKanshouSetHomeName,
  "kanshou_set_prop": actionKanshouSetProp, // 🎀 小道具面板：裝備/移除/調強度(玩家UI手動管理，GAS直接寫)
  "kanshou_add_custom_prop": actionKanshouAddCustomProp, // 🎀 玩家自訂新道具＋立即裝備(2026-07新增)
  "kanshou_delete_custom_prop": actionKanshouDeleteCustomProp, // 🗑 刪除玩家自訂道具定義(同步清同伴身上的裝備)
  "kanshou_cast_hypnosis": actionKanshouCastHypnosis, // 🌀 催眠指令：跟一般道具分開的獨立入口(2026-07新增，強制ignoreBond+hasIntensity)
  "kanshou_add_quick_phrase": actionKanshouAddQuickPhrase, // 🎀 快速輸入貼圖·玩家自訂新增(2026-07新增)
  "kanshou_delete_quick_phrase": actionKanshouDeleteQuickPhrase, // 🗑 刪除玩家自訂的快速貼圖
  "prep_meal": actionPrepMeal,
  "get_full_status": actionGetFullStatus,
  "update_fate": actionUpdateFate,
  "update_rel_tag": actionUpdateRelTag,
  "kanshou_set_nickname": actionSetNickname, // 🔒 2026-07 五度改版：專屬稱呼比照update_rel_tag同一套bond≥80門檻(見Gallery.gs KANSHOU_CUSTOM_TAG_BOND_)
  "create": actionManualNpc, // 御主創角。
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
  "court_enemy": actionCourtEnemy, // 🕊️ 對未結盟敵人示好·養好感（好感機制的主動入口）
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
  "get_album": actionGetAlbum,   // 📷 鑑賞相簿：讀本局全部照片(拍照本體在 play 的 takePhoto 分支)
  "album_delete": actionAlbumDelete // 📷 刪照片(相簿滿了騰位子)
};

// ------------------------------------------
// 🔹 主進入點 (Main Entry) - 極致精簡版
// ------------------------------------------
// 🔴 全域輸入防護：所有玩家輸入在進入任何 action handler 前，先在此統一過濾。
//   前端 maxlength/檢查皆可被繞過(devtools、直打API)，故後端必須是唯一可信的防線。
function sanitizeUserData_(userData) {
  // 名稱類欄位禁用 HTML/JS 斷字字元，避免在前端各處 innerHTML/onclick 拼接時被拿來做標籤或屬性逃脫
  // 🐛→✅ 舊版寫的是 "newRelName"，但 actionUpdateRelTag 實際讀的欄位叫 userData.newTagText——
  //   兩個字串對不上，這條清洗規則從沒生效過，讓關係稱呼欄位只吃 GLOBAL_MAX 截斷、沒過 HTML 斷字
  //   字元清洗，前端卡片渲染該欄位時又漏包 escapeHtml，等於留一個可注入 innerHTML 的缺口。
  // 🐛→✅ 再一輪稽核抓到：acctName 原本完全沒過濾｜【】——鑑賞首次建檔(actionEnterKanshou)會把
  //   acctName 原樣字串拼接進 MEMORY(`"【帳號】"+acctName+"｜【鑑賞後日談】..."`)，玩家把帳號名稱
  //   打成含｜【】的字串就能偽造任意MEMORY標記(如偽造【自訂道具】帶ignoreBond:1繞過好感門檻)。
  //   併入這裡統一擋，並在下面規則加上｜【】清洗(不只<>&"'`)。
  const STRICT_NAME_FIELDS = new Set(["name", "npcName", "targetName", "factionName", "newTagText", "newNickname", "pcName", "trueName", "acctName"]);
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
      // 🐛→✅ 稽核抓到：slice在trim之前——若字串帶超過NAME_MAX個前導空白(行動裝置自動加空格/
      //   複製貼上常見)，slice會把20字預算全吃在空白上、砍掉後面真正的名字字元，呼叫端事後再trim
      //   就得到空字串，合法名稱被誤判成「未輸入」。改成先trim再slice。
      v = v.trim().replace(/[<>&"'`｜【】]/g, "").slice(0, NAME_MAX);
    } else {
      v = v.slice(0, GLOBAL_MAX);
    }
    userData[key] = v;
  }
  return userData;
}

// ⚡ handler → dispatcher 的整表陣列交棒：寫入完整性已驗證的 handler(其所有寫入 helper 皆原地改回
//   同一份 pcData)在成功返回前設此全域，dispatcher 夾 _state 時直接複用、省一次整表重讀。
//   GAS 每個請求執行環境獨立，全域不跨請求；dispatcher 開頭重置防呆。
var STATE_PRE_DATA_ = null;

function handleGameAction(userData) {
  STATE_PRE_DATA_ = null; // 每次 dispatch 重置(防同執行環境內殘留)
  if (typeof userData === "string") {
    try { userData = JSON.parse(userData); }
    catch (err) { return JSON.stringify({ success: false, message: "連線資料有誤，請重新整理頁面後再試一次。" }); }
  }
  userData = sanitizeUserData_(userData);

  const action = userData.action || "play";
  const pcId = userData.pcId;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // 🔄 試算表存在性檢查改成純手動(check_sheets action、登入畫面按鈕)，不再每個 action 都自動跑一次。
  // 🌹 慾海路由：御主 avatar 以 "KPC_" 開頭 → 整條後日談路徑(actionPlay/sync/move…)改讀「鑑賞眾生」分頁，
  //   與戰爭主表「眾生」完全隔離。solo 御主是 "PC_" 不受影響。
  const isKanshouCtx = String(pcId || "").indexOf("KPC_") === 0;
  // 📔 日記軌：DPC_ 開頭 → 自己的分頁「日記眾生」，跟鑑賞/solo 三方隔離。
  const isDiaryCtx = String(pcId || "").indexOf("DPC_") === 0;
  // 坤圖已靜態化：getMapDataCached 直接讀 FATE_MAP_SEED 常數，不需要 sheets.map，省一次 Sheets API 呼叫。
  const sheets = {
    pc: (isDiaryCtx ? getDiaryPcSheet_(ss) : isKanshouCtx ? getKanshouPcSheet_(ss) : ss.getSheetByName("眾生"))
  };

  const handler = ActionRouter[action];
  if (!handler) {
    return JSON.stringify({ success: false, message: "找不到這個指令，請重新整理頁面後再試一次。" });
  }
  // 🔒 稽核抓到系統性漏洞：get_tags/sync/fate_battle/bond/mana_supply…等近全部solo戰場action，
  //   long-standing只用裸findIndex信任前端傳來的pcId，完全沒反查「帳號」表確認呼叫者真的擁有這個
  //   pcId——pcId是可預測字串("PC_"+timestamp)，猜中/枚舉即可代任意玩家讀取私密狀態或竄改HP/羈絆/
  //   同盟/裝備(部分甚至不可逆，如mana_supply燒蝕迴路)。單一真實來源修法：不逐一補洞，改在
  //   dispatch前統一擋(見verifyPcOwnership_)，比照kanshou原本各handler各自反查帳號表的同一套邏輯
  //   (PC_查COL.ACC.PC／KPC_查COL.ACC.KPC)，故各kanshou handler原本的反查已可精簡成純索引查找
  //   (見Gallery.gs的kanshouPcIdx_)。白名單只留「pcId尚不存在／已用其他方式驗證歸屬」的動作。
  if (pcId && !OWNERSHIP_CHECK_EXEMPT_[action] && !verifyPcOwnership_(userData.acctName, pcId)) {
    return JSON.stringify({ success: false, message: "查無御主。" });
  }
  // 🛡️ 慾海(kanshou)無戰鬥／經濟機制(CLAUDE.md「不打工、無經濟、無戰鬥」)。前端 UI 全部隱藏這批
  //   action，但直打 API 仍可能繞過；統一在此明確擋下，讓限制是結構保證而非依賴資料形狀湊巧擋住。
  if (isKanshouCtx && KANSHOU_BLOCKED_ACTIONS_[action]) {
    return JSON.stringify({ success: false, message: "慾海是純粹的約會後日談，沒有戰鬥／經濟機制。" });
  }
  // 🔒 稽核抓到：actionPlay_(Gallery.gs)因AI呼叫數秒~數十秒故意豁免全域鎖，改用CacheService鍵
  //   kplay_<pcId> 做自己的軟性互斥，只防「同pcId兩次play互撞」；但其餘kanshou setter action
  //   (kanshou_set_prop/kanshou_add_quick_phrase/update_rel_tag/kanshou_set_name等)完全不理會
  //   這把鎖，能在play等AI回應期間插隊執行並成功寫入——而play結尾是「整列覆寫」(見actionPlay_
  //   的dirtyPcRows)，用的是呼叫當下的舊快照，會把這些setter剛寫入的改動悄悄蓋回舊值(玩家已看到
  //   setter回報成功，稍後卻被吃掉)。讓這些setter偵測到同pcId有play在跑時直接請玩家稍候，避免跟
  //   play的整列覆寫競速；只對「非play本身、且會實際取ScriptLock寫表」的action套用，純讀取類不受影響。
  if (isKanshouCtx && action !== 'play' && !LOCK_EXEMPT_ACTIONS_[action]) {
    try {
      if (CacheService.getScriptCache().get("kplay_" + String(pcId || ""))) {
        return JSON.stringify({ success: false, message: "上一步還在處理中，請稍候片刻再試一次。" });
      }
    } catch (e) { }
  }
  // 🔒 寫入互斥：會寫表的動作取 ScriptLock，擋「同鍵重送/連點」重複扣血扣AP。
  //   豁免不取鎖：①純讀取 ②長 AI 敘事(鎖是全域的，被數秒的 AI 呼叫佔住會卡到其他請求)。
  //   搶不到鎖(上一動作尚在結算)→回「稍候」而非疊加重跑。
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
  //   免每個 action 各自判。用回應現成的 clock，僅在真跨日時才做一次眾生讀取建時限夢。
  if (String(pcId || "").indexOf("PC_") === 0 && !isKanshouCtx) {
    try {
      var ro = JSON.parse(out);
      if (ro && ro.success && !ro.victory && !ro.defeat && ro.clock) {
        var dym = String(ro.clock).match(/第\s*(\d+)\s*日/);
        if (dym && parseInt(dym[1]) > 14) {
          // 優先複用 STATE_PRE_DATA_(handler 交棒、已含本次寫入的權威陣列)，沒有才退回整表重讀。
          var pdata = STATE_PRE_DATA_ || sheets.pc.getDataRange().getValues();
          var prow = pdata.find(function (r) { return String(r[COL.PC.ID]) === pcId; });
          if (prow) {
            var gid = String(prow[COL.PC.GAME_ID] || "");
            var svRow = pdata.find(function (r) { return String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gid && !String(r[COL.PC.ID]).startsWith("DEAD_"); });
            ro.defeat = true; ro.deadline = true; ro.victory = false; ro.servantDream = "";
            // 🐛→✅ 舊版這裡傳空字串當願望——唯獨這個「時限耗盡」敗北路徑沒有呼叫 extractWish_(其餘
            //   所有敗北分支：戰鬥/補魔/令咒反噬等都有)，導致單純被14日時限拖垮的玩家，虛假之夢完全
            //   繞過自己設定的願望、讀起來像通用場景，跟其他敗北方式的夢境待遇不一致。
            if (!ro.dreamPrompt) ro.dreamPrompt = buildDreamPrompt_(String(prow[COL.PC.NAME]), extractWish_(prow[COL.PC.MEMORY]), svRow ? String(svRow[COL.PC.NAME]) : "", 'timeout');
            out = JSON.stringify(ro);
          }
        }
      }
    } catch (e) { /* 非 JSON / 無 clock → 略過 */ }
  }
  // ⚡ 2→1：solo 遊戲動作回應自動夾帶最新 client state(_state)，前端套用後即不必再打一趟 sync。
  //   只對 solo 御主(PC_)＋會改動戰場狀態的動作做；查無人/出錯則略過(前端自動 fallback 回真 sync)。
  //   優先吃 STATE_PRE_DATA_ 省掉 buildClientState_ 的整表重讀；未交棒的 handler 照舊 fallback 重讀。
  // 🐛→✅ 2026-07 稽核抓到："KPC_xxx".indexOf("PC_")===1(非0)，這個判斷把鑑賞完全排除在外——
  //   但 update_fate/update_rel_tag 兩個handler本就是特地扣出來給鑑賞共用(見上方KANSHOU_BLOCKED_
  //   ACTIONS_註解)、也确实有交棒STATE_PRE_DATA_，只是這裡的守門條件忘了同步放行，導致鑑賞玩家
  //   改命/改稱呼存檔後前端沒收到_state、白跑一趟真正的sync整表重讀。isKanshouCtx為真時能走到這裡
  //   的action只有這三個(其餘STATE_AFTER_ACTIONS成員都在更早的KANSHOU_BLOCKED_ACTIONS_被擋掉)：
  //   update_fate/update_rel_tag/kanshou_set_nickname(2026-07五度改版新增專屬稱呼手動設定)。
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
//   ⚠ sync 雖會 markRivalsSeen_ 標記 SEEN，但該寫入冪等(重標無害)，不值得為它鎖每一次同步。
// 🔒 pcId 歸屬驗證豁免名單：僅列「pcId 當下尚不存在／已用其他方式驗證歸屬」的動作——
//   account_login/account_new_game/create/enter_kanshou 建立帳號連結前根本不帶 pcId；
//   claim_hero/save_hero 走 persona.creator===acctName 這套不同模型(英靈殿列，非個人pcId列)；
//   get_heroes/get_masters 是公開名冊，handler 本身完全不讀 pcId；
//   check_name/check_sheets/dev_resync_codex 不涉及個別玩家列；purge_orphans 是全局孤兒清理。
//   其餘只要動作帶了 pcId，一律先過 verifyPcOwnership_ 反查「帳號」表確認真的是本人。
const OWNERSHIP_CHECK_EXEMPT_ = {
  // 📔 日記軌(DPC_)：verifyPcOwnership_ 只認 KPC_→COL.ACC.KPC、其餘一律拿去比 solo 的 COL.ACC.PC，
  //   DPC_ 掉進 else 永遠對不上 → 整條路被回「查無御主」(玩家實測「讀不到行程表」)。
  //   ★刻意【不】去改帳號表 schema 加一欄 DPC——這一軌是可整檔刪除的實驗品，動共用 schema 就
  //   刪不乾淨了(且 COL 是位置索引)。改成在這裡豁免、由 Diary.gs 自己用 DIARY_ACCT_TAG_ 驗，
  //   歸屬檢查一點都沒少（見 diaryVerify_）。
  enter_diary: 1, diary_schedule: 1, diary_week: 1,
  check_name: 1, check_sheets: 1, dev_resync_codex: 1, purge_orphans: 1,
  account_login: 1, account_new_game: 1, enter_kanshou: 1, create: 1,
  get_heroes: 1, get_masters: 1, claim_hero: 1, save_hero: 1
};
const LOCK_EXEMPT_ACTIONS_ = {
  check_name: 1, get_full_status: 1, get_heroes: 1, get_masters: 1,
  get_tags: 1, get_map_nodes: 1, sync: 1, get_album: 1,
  narrate_only: 1, play: 1, backfill_master_ai: 1, backfill_kanshou_ai: 1,
  save_hero: 1 // 🛠️ 工房鑄造/修改：含數秒 AI 呼叫·只寫英靈殿(append/單列)不碰戰場——佔全域鎖會卡死其他玩家
};
// ⚡ 會改動 solo 戰場狀態、前端事後會 syncData(整頁刷新) 的動作 → 夾帶 _state 省一趟 round-trip。
//   不含：sync(本身即 state)／get_tags／純讀取(inspect/get_*)／創角召喚(自走 reload)／kanshou(KPC_)；
//   也不含「樂觀更新」的輕量 setter(set_servant_output/set_mage_realm/set_rune_mode)——
//   它們不 syncData、只吃 res.economy，夾 _state 反而白做整表讀取。
//   也不含 narrate_only——前端 narrate() 只吃 res.text、不消費 _state，夾它純浪費整表讀。
//   move 也不含：前端 travelTo() 從不呼叫 syncData()／不消費 __pendingState，靠自己回應的
//   people/locations/mapDesc/mapNodes/statusString 就足夠更新畫面，夾 _state 對這個全遊戲最高頻
//   的動作只是白算一次完整 buildClientState_ 後被原地丟棄。
const STATE_AFTER_ACTIONS = {
  fate_battle: 1, use_seal: 1, mana_supply: 1, spirit_repair: 1, bond: 1, rule_break_steal: 1,
  propose_alliance: 1, break_alliance: 1, ally_bond: 1, set_workshop: 1, scavenge: 1,
  second_wind: 1, scout: 1, rest: 1, summon_horror_beast: 1, dismiss_horror_beast: 1,
  faction_ambush: 1, incite: 1, court_enemy: 1,
  update_fate: 1, update_rel_tag: 1, kanshou_set_nickname: 1
};
// 🛡️ 慾海(KPC_)明確擋下的戰鬥／經濟／結盟類 action——皆為 solo 戰爭專屬，前端在 kanshou 模式下
//   本就全數隱藏對應按鈕，這裡擋 API 直打。取 STATE_AFTER_ACTIONS 扣掉 update_fate/update_rel_tag/
//   kanshou_set_nickname(通用或鑑賞專屬的敘事欄編輯，慾海也適用)，加上 3 個樂觀更新輕量 setter。
//   move 不在名單中：鑑賞移動地圖走 action:'play'+moveTarget，從不真的呼叫 action:'move'；且
//   actionMove 用 KPC_ id 去查「眾生」表本就查無此人、安全但原因與其他表面相似的判斷不同。
//   weapon/get_map_nodes/narrate_only/end_run/create/summon_servant/backfill_master_ai/
//   account_login/account_new_game 皆為 solo 專屬，鑑賞 UI 從未呼叫過，但誤呼叫會寫壞或清錯
//   資料表（如 end_run 會清錯帳號表欄位、create/summon_servant 會把戰鬥 schema 寫進鑑賞眾生表、
//   purge_orphans 若以 KPC_ 呼叫會誤刪整張鑑賞眾生表）——明確擋掉，不依賴資料形狀僥倖安全。
const KANSHOU_BLOCKED_ACTIONS_ = {
  fate_battle: 1, use_seal: 1, mana_supply: 1, spirit_repair: 1, bond: 1, rule_break_steal: 1,
  propose_alliance: 1, break_alliance: 1, ally_bond: 1, set_workshop: 1, scavenge: 1,
  second_wind: 1, scout: 1, rest: 1, summon_horror_beast: 1, dismiss_horror_beast: 1,
  set_servant_output: 1, set_mage_realm: 1, set_rune_mode: 1,
  prep_meal: 1, purge_orphans: 1, faction_ambush: 1, incite: 1, court_enemy: 1,
  weapon: 1, get_map_nodes: 1, narrate_only: 1,
  end_run: 1, create: 1, summon_servant: 1, backfill_master_ai: 1,
  account_login: 1, account_new_game: 1,
  // 🧹 move 已非共用action——鑑賞地圖改走kanshouMoveTo/kanshouProposeMove，前端不再送action:'move'，
  //   讓 Router_Movement.gs 的 actionMove 保證只服務 solo。
  move: 1
};

// ==========================================
// 🔴 動作處理模組 (Action Handlers)
// ==========================================

function actionCheckName(userData, pcId, sheets) {
  // 🔴 userData.name 已在 sanitizeUserData_ 清成純中文；若清洗後為空，代表玩家輸入含非中文(英數/符號)，直接擋下
  if (!userData.name) {
    return JSON.stringify({ invalidName: true, message: "名號僅限中文字，不可使用英文、數字或符號。" });
  }
  // 與 create(actionManualNpc) 一致——不擋跨局同名（game_id 實例化，玩家御主靠 pcId 認人，跨局撞名
  //   無害）。只擋【正典角色名】(避免與本局被種入的同名正典敵手雙胞胎)；想扮演正典請走「扮演正典御主」入口。
  // userData.name 已被 cleanChineseName 洗成純中文去標點，比對對象也需同樣清洗，否則含標點的正典
  // 名號(如「韋伯·維爾維特」)永遠比不中。SEED_SERVANTS 的真名欄位是 `realName`，不是 `name`。
  const _canonHit = (typeof SEED_MASTERS !== 'undefined' && SEED_MASTERS.some(m => m && cleanChineseName(m.name) === userData.name))
    || (typeof SEED_SERVANTS !== 'undefined' && SEED_SERVANTS.some(s => s && cleanChineseName(s.realName) === userData.name));
  return JSON.stringify({ exists: _canonHit, canon: _canonHit, message: _canonHit ? `「${userData.name}」是聖杯戰爭中已知的英靈／御主——請另取名號，或用「扮演正典御主」入口。` : "" });
}

// 🔒 呼叫者身分解析：get_full_status/update_fate/update_rel_tag/kanshou_set_nickname 這4個
//   solo/鑑賞共用handler，用這支找出呼叫者自己的 game_id。歸屬驗證本身已上移到 dispatcher
//   統一擋（`handleGameAction`→`verifyPcOwnership_`，見上方；kanshou/solo pcId 進到這裡時都已
//   確認真的屬於這個帳號），這裡只需要純索引查找＋讀 GAME_ID，不必再反查一次帳號表。
//   回傳null＝查無此列，呼叫端須視同「查無此人」直接回絕；solo一律回字串(可能是"")。
function resolveCallerGameId_(pcData, pcId) {
  if (String(pcId || "").indexOf("KPC_") === 0) {
    const idx = kanshouPcIdx_(pcData, pcId);
    return idx === -1 ? null : String(pcData[idx][COL.PC.GAME_ID] || "");
  }
  // 🐛→✅ 再稽核抓到：查無此列時原本回傳""(非null)，呼叫端只擋null——導致捏造的pcId能讓下游
  //   findPcRowIdx_/手寫的myGameId比對因gid為""(falsy)整個跳過game_id過濾，退化成跨全局姓名搜尋
  //   (get_full_status可讀任意玩家狀態；update_fate/update_rel_tag甚至可跨局竄改)。查無此列一律
  //   回null強制呼叫端拒絕；「找到列但其GAME_ID欄本身是空字串」(舊資料相容)才維持回傳""。
  const me = pcData.find(r => r[COL.PC.ID] == pcId);
  return me ? String(me[COL.PC.GAME_ID] || "") : null;
}

function actionGetFullStatus(userData, pcId, sheets) {
  const targetName = userData.targetName;
  const allPcData = sheets.pc.getDataRange().getValues();
  // 只比對 NAME 會在不同局剛好撞名時洩漏別局角色狀態/關係；限比呼叫者自己的 game_id
  // (myGameId 為空時放行，相容沒有 game_id 的舊資料)。
  const myGameId = resolveCallerGameId_(allPcData, pcId);
  if (myGameId === null) return JSON.stringify({ success: false, message: "查無此人" });
  const tIdx = findPcRowIdx_(allPcData, myGameId, { name: targetName });
  if (tIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });
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
  // 從者狀態(📜 狀態鈕)開的 openStatus 傳的是【名字】非 ID，故需接受 ID 或同行從者名字，
  // 且限本局 game_id(防跨局撞名／名字誤中敵方非同行者)。
  // 🔒 帳號歸屬驗證（2026-07 再稽核抓到的漏洞補上，見 resolveCallerGameId_ 說明）。
  const myGameId = resolveCallerGameId_(pcData, pcId);
  if (myGameId === null) return JSON.stringify({ success: false, message: "查無此人" });
  const pIdx = pcData.findIndex(r => {
    if (String(r[COL.PC.ID]).startsWith("DEAD_")) return false;
    if (myGameId && String(r[COL.PC.GAME_ID] || "") !== myGameId) return false;
    if (r[COL.PC.ID] == targetId) return true; // ID 直配（御主自己／舊路徑）
    // 名字配：solo 限同行從者；鑑賞(k_)無 IS_PARTY 概念(列從不寫此欄·卡片的改命鈕原本恆「查無此人」)，
    //   同世界名字直配——改同伴的敘事欄(個性/特徵/身世/萌點)是合法自訂操作(比照 update_rel_tag 豁免)。
    return String(r[COL.PC.NAME]) === String(targetId) && (myGameId.indexOf("k_") === 0 || String(r[COL.PC.IS_PARTY] || "") === "同行");
  });
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  if (String(pcData[pIdx][COL.PC.ID]) != String(pcId)) {
    // 關係併入眾生列，直接看這名角色自己的 IS_PARTY 欄(鑑賞豁免·同上)。
    if (myGameId.indexOf("k_") !== 0 && String(pcData[pIdx][COL.PC.IS_PARTY] || "") !== "同行") {
      return JSON.stringify({ success: false, message: `僅能對同行的從者逆天改命！` });
    }
  }

  // 🔵 只准改 4 種敘事欄（個性/特徵/身世/萌點）；數值(六圍/迴路/禮裝)與寶具(martial)一律不可改——GAS 掌數值鐵則。
  let targetCol = fateType === 'trait' ? COL.PC.TRAIT : fateType === 'pref' ? COL.PC.PREF : fateType === 'back' ? COL.PC.BACK : fateType === 'intent' ? COL.PC.INTENT : -1;
  if (targetCol === -1) return JSON.stringify({ success: false, message: "此欄位不可修改（只能改個性／特徵／身世／萌點，數值與寶具一律鎖死）。" });
  // 🐛→✅ 玩家要求「真正內化」的萌點：同伴/NPC的萌點只留給AI演出參考，玩家不可查看也不可竄改——
  //   前端已把同伴卡的萌點格連按鈕都藏了，這裡補後端防線，擋掉繞前端直打API的路。
  if (fateType === 'intent' && String(pcData[pIdx][COL.PC.ID]) !== String(pcId)) {
    return JSON.stringify({ success: false, message: "同伴的萌點由AI自行體會，不開放查看或修改。" });
  }
  // 🔴 命格欄位直寫入表格，需自行把關長度：身世/萌點 單格 30；個性/特徵 為 4 格頓號拼接、給較寬上限
  var cap = fateType === 'back' ? 80 : fateType === 'intent' ? 30 : 130; // 經歷(back)放寬到80配合AI滾動
  pcData[pIdx][targetCol] = String(fateValue || "").slice(0, cap);
  // 🐛→✅ 2026-07 拆除「性格鎖」機制（玩家「萌點AI根本亂寫...AI只能改動經歷」）：AI 的滾動側寫
  //   已經完全不會再去動性格/萌點這兩類欄位了，鎖不鎖沒有意義，這裡不再收/寫 prefLocks。
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);

  const relMem = String(pcData[pIdx][COL.PC.REL_MEM] || "");
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：逆天改命的單欄寫入已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, statusString: buildPlayerStatusString(pcData[pIdx], relMem) });
}

function actionGetTags(userData, pcId, sheets) {
  return JSON.stringify(buildTagsPayload_(sheets, pcId));
}
// 🔧 抽出共用：左側狀態卡資料建構。get_tags 與 sync 共用同一份，讓「一次按鍵」少一趟 round-trip。
//   preData＝呼叫端已讀好的整表，傳入即免重讀(省整表 I/O)。關係併入眾生列，不再需要 preRel。
function buildTagsPayload_(sheets, pcId, preData) {
  const pcData = preData || sheets.pc.getDataRange().getValues();
  // mIdx 順手記下來，下面 canRuleBreak_ 需要索引時直接複用，不必再 findIndex 重掃一次。
  const mIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  const m = mIdx >= 0 ? pcData[mIdx] : undefined;
  // 🐛→✅ 2026-07 稽核抓到：這裡原本回傳「已stringify的字串」，跟下方成功路徑回傳「物件」型別不一致——
  //   `actionGetTags` 呼叫端會再包一層JSON.stringify，字串誤入變成雙重編碼；另兩處直接把回傳值當
  //   物件用(`tp.success`／`tags:`欄位)，字串會讓`.success`讀到undefined、或讓`tags`欄位變成一段
  //   跳脫過的JSON字串而非巢狀物件。改回傳物件，跟成功路徑型別一致。
  if (!m) return { success: false };
  const gameId = String(m[COL.PC.GAME_ID] || "");
  // 下方 servants.push 組裝的戰鬥限定欄位(魔境/符文/synergy/理想鄉/多寶具/深淵海怪)須明確以
  // isFateCtx 擋成 null，不能只靠「鑑賞列 TAGS/SKILLS 恆空」這種資料形狀僥倖安全。
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

  // 🗝️ 雙從者：收齊所有在世我方從者（servants 陣列）；servant＝第一個（向後相容）
  // 🌍 solo 靠 IS_PARTY==="同行" 過濾隊伍；鑑賞無「隊伍」概念，改用 LOC 是否與玩家目前位置一致，
  //   卡片只顯示同地點的英靈。
  let servants = [];
  // 🤝 牽手中對象(鑑賞限定)：供同伴卡顯示「牽手/放手」狀態。solo 恆空。
  const heldName = !isFateCtx && typeof KANSHOU_HANDHOLD_TAG_ !== 'undefined' ? KANSHOU_HANDHOLD_TAG_.get(m[COL.PC.MEMORY]) : "";
  pcData.forEach(s => {
    if (String(s[COL.PC.FACTION]) !== "從者" || String(s[COL.PC.GAME_ID] || "") !== gameId || String(s[COL.PC.ID]).startsWith("DEAD_")) return;
    if (isFateCtx ? (String(s[COL.PC.IS_PARTY] || "") !== "同行") : (String(s[COL.PC.LOC] || "").trim() !== String(m[COL.PC.LOC] || "").trim())) return;
    // 關係併入眾生列，好感直接是這名從者自己的 BOND 欄
    const bond = parseInt(s[COL.PC.BOND]) || 0;
    let six = {}, skills = [], traits = [];
    try { six = JSON.parse(s[COL.PC.SIX] || "{}"); } catch (e) { }
    try { const tg = JSON.parse(s[COL.PC.TAGS] || "{}"); skills = tg.skills || []; traits = tg.traits || []; } catch (e) { }
    servants.push({
      // 🆔 2026-07「整體重構·id優先」：舊版卡片只帶 name，前端只能用名字回指定這名從者(雙從者名字
      // 撞前綴時就會選錯人)——補上 id，前端存起來隨後續 action 回傳，後端 findPcRowIdx_/
      // findPlayerServantIdx_ 才有 id 可用、不必再靠名字比對這條容易出錯的路。
      id: s[COL.PC.ID],
      name: s[COL.PC.NAME], cls: s[COL.PC.RANK] || "從者", sex: s[COL.PC.SEX],
      tag: s[COL.PC.REL_TAG] || "從者", // 🏷️ 關係標籤(鑑賞卡片「🏷️關係」鈕預填用；solo不使用此欄)
      nickname: getNickname_(s[COL.PC.REL_MEM]), // 💬 專屬稱呼裸值(鑑賞卡片「🏷️關係」面板預填用)
      cohabit: kanshouIsCohabit_(s), // 🏠 是否同居中(鑑賞卡片「關係」中樞面板顯示狀態用·solo恆false)
      // 預取狀態字串隨 state 一併帶回，前端切從者直接秒顯，免每次都打一趟 get_full_status round-trip。
      statusString: buildPlayerStatusString(s, String(s[COL.PC.REL_MEM] || "")),
      hp: hpWord(s[COL.PC.HP], s[COL.PC.MAX_HP]),
      hpNum: parseInt(s[COL.PC.HP]) || 0, hpMax: parseInt(s[COL.PC.MAX_HP]) || 0,
      mpNum: parseInt(s[COL.PC.MP]) || 0, mpMax: parseInt(s[COL.PC.MAX_MP]) || 0,
      output: servantOutput_(s[COL.PC.MEMORY]), outputLabel: outputTier_(servantOutput_(s[COL.PC.MEMORY])).label, // 🔋 靈基出力檔位
      np: s[COL.PC.MARTIAL] || "寶具未顯現", bond: bond,
      six: six, skills: skills, traits: traits,
      // 🔮 魔境的智慧（斯卡哈）：前端露出可選被動盤。has＝持 mage_realm；pick＝已選 fx；pool＝可選清單
      mageRealm: isFateCtx && skills.some(function (sk) { return sk && sk.fx === 'mage_realm'; })
        ? { has: true, pick: mageRealmPick_(s[COL.PC.MEMORY]), pool: mageRealmPool_() } : null,
      // 🔯 原初符文運用方式（持 rune 者才給，前端標籤可點開挑 減傷/增傷/回血）
      runeMode: isFateCtx && skills.some(function (sk) { return sk && sk.fx === 'rune'; }) ? runeMode_(s[COL.PC.MEMORY]) : undefined,
      // 🐕 主從synergy（恩奇都·變容）：與銀狼結契時亮起全盛(全能A·寶A++)、否則暗示需該御主。玩家不可控·御主決定
      synergy: isFateCtx ? masterSynergyView_(s[COL.PC.NAME], s[COL.PC.MEMORY]) : null,
      // 🗡️ 理想鄉·無敵結界（阿爾托莉雅＋御主持 Avalon 禮裝）：被動自動·敵解放 6 階究極寶具且御主魔力≥100 時自動擋下(耗 100 魔)。此旗標僅供卡片資訊標籤
      // 🐛→✅ 2026-07 玩家「檢查solo看看有沒有問題」稽核抓到：這裡的子字串比對(/阿爾托莉雅/.test)
      //   跟 Mystic_Code.gs injectMysticBuff_ 實際戰鬥判定用的精確全名比對不是同一份謂詞——子字串
      //   版本連「阿爾托莉雅・奧爾塔」這類變體都會誤判成真，且兩處各自維護早已漂移；戰鬥實際判定曾
      //   一度改比對到錯的短名「阿爾托莉雅」(已於同批次修正)，這裡的卡片旗標卻從未同步更新，導致卡片
      //   顯示「理想鄉已啟用」但實戰從未真正觸發。改成同一份精確全名比對，兩處判準統一。
      canIdealRealm: isFateCtx && (String(s[COL.PC.NAME] || "").trim() === '阿爾托莉雅·潘德拉貢' && String(s[COL.PC.RANK]) === 'Saber' && getMystic_(m[COL.PC.MEMORY]) === 'avalon'),
      // 🌟 多寶具英靈：寶具選單＋當前選定索引（前端點寶具時挑要放哪個）
      npOptions: isFateCtx ? (servantNpOptions_(s[COL.PC.NAME], s[COL.PC.RANK]) || undefined) : undefined,
      npChoice: isFateCtx ? npChoice_(s[COL.PC.MEMORY]) : undefined,
      // 🐙 深淵海怪肉身（持 summon_horror 且現存海怪時 {cur,max}）：前端在體力條下方獨立渲染一條海怪血條
      horror: isFateCtx && skills.some(function (sk) { return sk && sk.fx === 'summon_horror'; }) ? horrorShieldView_(s[COL.PC.MEMORY], gameId, pcData) : undefined,
      // 🐛→✅ god_hand(十二試煉)說明 popup 舊版前端寫死「11次」，只對種子赫拉克勒斯正確——工房/AI生成
      //   固定3命、尼祿等敵方各自有專屬命數(【試煉】N)。帶上這名從者實際剩餘命數，供卡片說明 popup 顯示真值。
      ghLives: isFateCtx && skills.some(function (sk) { return sk && sk.fx === 'god_hand'; }) ? getGodHandLives_(s[COL.PC.MEMORY]) : undefined,
      // 🐙 戰前召喚鈕：持 summon_horror 且海怪【尚未在場】→ 前端露出「召喚海怪」按鈕(變身態·跨戰鬥 12h)
      canSummonHorror: isFateCtx && skills.some(function (sk) { return sk && sk.fx === 'summon_horror'; }) && !horrorShieldView_(s[COL.PC.MEMORY], gameId, pcData),
      outfit: getOutfit_(s[COL.PC.MEMORY]), // 👕 玩家換裝：當前服裝(前端預填/顯示·換衣不換人)
      weapon: getWeapon_(s[COL.PC.MEMORY]), // ⚔️ 玩家自定武裝：武器/戰鬥方式(前端預填/顯示·敘述以此為準)
      pref: s[COL.PC.PREF] || "", physical: s[COL.PC.PHYSICAL] || "{}", // 🌹 慾海卡用：個性/肉體
      // 🌹 慾海卡「特徵」用：COL.PC.TRAIT 才是全代碼庫「特徵」的真實定義(外貌描述)，
      //   TAGS.traits 是戰鬥特性標籤(神性/英雄)，兩者不可混用。
      trait: s[COL.PC.TRAIT] || "",
      held: !!(heldName && kanshouNameCandidates_(String(s[COL.PC.NAME])).includes(heldName)), // 🤝 是否正被牽手
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
  // 🗺️ 鑑賞地圖分頁按地點顯示人數，供玩家決定去哪找誰；只在鑑賞世界算(gameId以"k_"開頭)，solo無此概念。
  var locationCounts = {};
  // 🔒 拜訪住處解鎖清單：跟屋主好感≥熟識(40)才能登門，前端據此把鎖住的住處灰掉(同一判定後端 actionPlay 也擋)。
  var unlockedResidences = {};
  if (gameId && gameId.indexOf("k_") === 0) {
    pcData.forEach(function (r) {
      if (String(r[COL.PC.FACTION]) !== "從者" || String(r[COL.PC.GAME_ID] || "") !== gameId || String(r[COL.PC.ID]).startsWith("DEAD_")) return;
      var l = String(r[COL.PC.LOC] || "").trim();
      if (l) locationCounts[l] = (locationCounts[l] || 0) + 1;
      var hid = kanshouHeroIdByName_(String(r[COL.PC.NAME]));
      // 🐛→✅ 2026-07 七度改版稽核抓到：原本只認KANSHOU_HERO_HOME_(7位種子英靈手寫豪邸)，隨機
      //   分配到泛用住處池的英靈永遠解鎖不了——改用kanshouGetHeroHome_統一讀取(手寫優先、查無
      //   讀【住處】隨機分配標記)，同 kanshouResidenceUnlocked_(Gallery.gs)那套判定同步。
      var home = kanshouGetHeroHome_(hid, r[COL.PC.MEMORY]);
      if (home && home !== '自己的住處' && (parseInt(r[COL.PC.BOND]) || 0) >= KANSHOU_VISIT_BOND_) unlockedResidences[home] = true;
    });
  }
  // 🎯 撞見敵人的可反應窗口（趁隙/挑撥/溜走）：僅 solo 且窗口 loc＝目前所在地時給前端，供顯示情境按鈕。
  var encWin = null;
  if (isFateCtx) {
    var _w = getEncounterWindow_(m[COL.PC.MEMORY]);
    if (_w && _w.loc === String(m[COL.PC.LOC] || "").trim()) encWin = { type: _w.type, choices: encounterChoices_(_w.type) };
  }
  // 🗺️ myLoc：玩家此刻所在地。鑑賞前端本來完全沒有這個資訊的可靠來源(只有 locationCounts 這種
  //   彙總數字)，導致「約定地點清單要排除你正站著的地方」之類的判斷做不出來。放進既有 payload
  //   ＝零額外 round-trip，單一真實來源在後端。
  return { success: true, master: master, servant: servant, servants: servants, economy: economy, bondUsed: bondUsed, mystic: mystic, canRuleBreak: canRB, servantSlots: servants.length, locationCounts: locationCounts, unlockedResidences: Object.keys(unlockedResidences), encounterWindow: encWin, myLoc: String(m[COL.PC.LOC] || ""),
    // 🌙 夜未眠(Gallery.gs KANSHOU_NIGHT_SCENE_TAG_)：HUD 那顆鈕要據此把「🌙睡覺」換成「🌅睡到天亮」。
    //   掛在 tags 而非 play 回傳的頂層——tags 是前端的狀態通道(window._lastTags)，也會被
    //   STATE_AFTER_ACTIONS 重新拉，玩家重新整理頁面後按鈕不會退回錯的字。
    nightScene: (typeof KANSHOU_NIGHT_SCENE_TAG_ !== 'undefined'
      && KANSHOU_NIGHT_SCENE_TAG_.get(m[COL.PC.MEMORY]) === (parseInt(m[COL.PC.DAY]) || 0)) || undefined };
}

// ⚡ preData：手上已有最新整表陣列的呼叫端(見 STATE_PRE_DATA_ 交棒機制)傳入複用，省掉整表重讀——
//   前提是該 handler 的所有寫入都已反映回它那份陣列。沒給→照舊自己讀(權威 fallback)。
function buildClientState_(sheets, pcId, preData) {
  const allPcData = preData || sheets.pc.getDataRange().getValues();
  // markRivalsSeen_ 是「戰爭迷霧」機制(找同 game_id/同地敵對陣營標記已見過)，鑑賞眾生從無敵對
  // 陣營列，跳過以免每次白掃一輪從沒中過的迴圈。
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
  // 鑑賞用精簡版 getKanshouPeopleList_，避免借用 solo 版算出一堆鑑賞前端從不讀取的欄位。
  const isKanshouCtx_ = gid.indexOf("k_") === 0;
  // 🕰️ 鑑賞需把day/hour餵給前端才能判斷時段(如是否顯示「準備早餐」)；沿用`clock`放顯示字串(HUD同solo)，
  //   kanshouClock 另給結構化欄位供前端邏輯判斷(顯示字串不好拿來比對)。
  if (isKanshouCtx_) { try { const ci = kanshouClockInfo_(allPcData[pcIndex]); clk = ci.label; kanshouClock = ci; } catch (e) { } }
  return {
    statusString: buildPlayerStatusString(allPcData[pcIndex]),
    // 關係併入眾生列，不再需要關係表 → 少一次整表讀
    people: isKanshouCtx_ ? getKanshouPeopleList_(pcId, curL, allPcData) : getLocalPeopleList(sheets, allPcData[pcIndex][COL.PC.NAME], pcId, curL, allPcData),
    // 🐛→✅ 玩家實測抓到：漏傳戰爭標記，第四次限定地點(海特飯店等)會漏濾、出現在撤退突圍/鄰近地點清單裡
    //   （地圖本體 buildMapNodesPayload_ 有比對戰爭、這裡原本沒有，兩處各自兜規則導致不一致）。
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
  if (!st) return JSON.stringify({ success: false, message: "查無此人" });
  st.success = true;
  return JSON.stringify(st);
}

// 關係併入眾生列——直接改這名 NPC 自己那一列的 REL_TAG 欄，不再查關係表。
function actionUpdateRelTag(userData, pcId, sheets) {
  const { targetName, newTagText } = userData;
  if (!newTagText || !String(newTagText).trim()) return JSON.stringify({ success: false, message: "稱呼不可為空。" });

  const pcData = sheets.pc.getDataRange().getValues();
  // 光靠姓名+下方「同行」門檻不保證是「我這局」的同行者；不同局剛好有同名同行從者仍會被誤改，
  // 故需再比對呼叫者自己列的 game_id(myGameId 為空時放行，相容沒有 game_id 的舊資料)。
  // 🔒 帳號歸屬驗證（2026-07 再稽核抓到的漏洞補上，見 resolveCallerGameId_ 說明）。
  const myGameId = resolveCallerGameId_(pcData, pcId);
  if (myGameId === null) return JSON.stringify({ success: false, message: "查無此段羈絆。" });
  const tIdx = findPcRowIdx_(pcData, myGameId, { name: targetName });
  if (tIdx === -1) return JSON.stringify({ success: false, message: "查無此段羈絆。" });

  // 🔵 solo 仍要求「同行的從者才能重新定義稱呼」；鑑賞無 IS_PARTY 概念，改稱呼是低風險設定、不要求同行。
  if (myGameId.indexOf("k_") !== 0 && String(pcData[tIdx][COL.PC.IS_PARTY] || "") !== "同行") {
    return JSON.stringify({ success: false, message: "僅能為同行的從者重新定義這段關係。" });
  }

  const finalTag = String(newTagText).trim();
  // 🔒 2026-07 五度改版·自訂稱呼會被字面「TA是你的${tag}」原樣塞進AI提示詞當既定事實，玩家實測
  //   低好感就打露骨自訂稱呼會讓AI無視好感天花板照樣演到底——5階預設標籤(KANSHOU_REL_TIER_)本就
  //   由GAS依好感計算，不受此限；只擋「自訂文字不等於任一預設標籤」這條路徑。
  const isPreset = KANSHOU_REL_TIER_.some(t => t.label === finalTag);
  const bond = parseInt(pcData[tIdx][COL.PC.BOND]) || 0;
  if (!isPreset && bond < KANSHOU_CUSTOM_TAG_BOND_) {
    return JSON.stringify({ success: false, message: `好感達到${KANSHOU_CUSTOM_TAG_BOND_}(戀人)才能自訂關係稱呼，目前${bond}。` });
  }

  // 需同步寫回 pcData 的記憶體鏡射，才能安全交棒 STATE_PRE_DATA_(否則夾帶的 _state.people 會顯示舊稱呼)。
  pcData[tIdx][COL.PC.REL_TAG] = finalTag;
  sheets.pc.getRange(tIdx + 1, COL.PC.REL_TAG + 1).setValue(finalTag);

  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：REL_TAG改寫已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, message: `羈絆已重新定義為「${finalTag}」。`, newTag: finalTag });
}

// 🔒 2026-07 五度改版·專屬稱呼比照 update_rel_tag 同一套bond門檻+同一個injection風險，玩家手動設定
//   後寫入【稱呼鎖】旗標，讓AI的rel_changes.mutual_nicknames不再自動覆寫(尊重玩家的手動選擇，同
//   kanshouSyncRelTier_對自訂關係稱呼「一旦手動改過就不再被自動覆寫」的精神)。
function actionSetNickname(userData, pcId, sheets) {
  const { targetName, newNickname } = userData;
  if (!newNickname || !String(newNickname).trim()) return JSON.stringify({ success: false, message: "稱呼不可為空。" });

  const pcData = sheets.pc.getDataRange().getValues();
  // 🔒 帳號歸屬驗證（2026-07 再稽核抓到的漏洞補上，見 resolveCallerGameId_ 說明）。
  const myGameId = resolveCallerGameId_(pcData, pcId);
  if (myGameId === null) return JSON.stringify({ success: false, message: "查無此段羈絆。" });
  const tIdx = findPcRowIdx_(pcData, myGameId, { name: targetName });
  if (tIdx === -1) return JSON.stringify({ success: false, message: "查無此段羈絆。" });

  const bond = parseInt(pcData[tIdx][COL.PC.BOND]) || 0;
  if (bond < KANSHOU_CUSTOM_TAG_BOND_) {
    return JSON.stringify({ success: false, message: `好感達到${KANSHOU_CUSTOM_TAG_BOND_}(戀人)才能自訂專屬稱呼，目前${bond}。` });
  }

  // 分隔符安全：清掉可能撞到REL_MEM組字格式的符號(｜全形/[]方括號)，避免污染後續欄位解析。
  const finalNick = String(newNickname).trim().replace(/[｜\[\]]/g, "").slice(0, 20);
  if (!finalNick) return JSON.stringify({ success: false, message: "稱呼不可為空。" });

  const oldRMem = String(pcData[tIdx][COL.PC.REL_MEM] || "");
  // 保留既有【態度】段(若有)，只覆寫【專屬稱呼】+補上【稱呼鎖】。
  const attMatch = oldRMem.match(/\[態度\](.*?)(?=\| \[|$)/);
  const attPart = attMatch ? `| [態度]${attMatch[1].trim()}` : "";
  const newRMem = `[專屬稱呼]${finalNick}| [稱呼鎖]是${attPart}`;

  pcData[tIdx][COL.PC.REL_MEM] = newRMem;
  sheets.pc.getRange(tIdx + 1, COL.PC.REL_MEM + 1).setValue(newRMem);

  STATE_PRE_DATA_ = pcData;
  return JSON.stringify({ success: true, message: `專屬稱呼已設為「${finalNick}」。`, newNickname: finalNick });
}

