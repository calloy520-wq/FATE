// ==========================================
// 🔴【第三部分：原生非同步中樞分流器 handleGameAction】Router_Action.gs
// ==========================================

// ------------------------------------------
// 🔹 路由映射表 (Action Router)
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。
// ------------------------------------------
const ActionRouter = {
  "account_login": actionAccountLogin,
  "enter_kanshou": actionEnterKanshou,
  "kanshou_reset": actionKanshouReset,   // 🔄 鑑賞歸零重來(只清這個帳號的後日談，不碰英靈殿與 solo)
  "backfill_kanshou_ai": actionBackfillKanshouAi, // 🚀 開局非阻塞：enter_kanshou 首次建檔後背景補御主敘事欄
  "kanshou_companions": actionKanshouCompanions,
  "kanshou_memoir_op": actionKanshouMemoirOp, // 💞 共同回憶面板：釘選/取消釘選/刪除(玩家UI手動管理)
  "world": actionWorld,        // 🌍 世界帳本面板：list/pin/unpin/del(玩家看得到、管得動)
  "kanshou_summon_hero": actionKanshouSummonHero, // 🌹 慾海同伴唯一入口：直接從英靈庫召喚，不需先在solo贏得戰爭
  "kanshou_party": actionKanshouParty,     // 🫂 加入/離開同行（誰在這一幕裡）
  "kanshou_set_sex": actionKanshouSetSex,
  "kanshou_get_style": actionKanshouGetStyle, // 🎨 說書人設定面板：讀整張風格表(預設＋玩家版)
  "kanshou_set_style": actionKanshouSetStyle, // 🎨 改一格／還原一格／全部還原
  "kanshou_set_name": actionKanshouSetName,
  "get_full_status": actionGetFullStatus,
  "update_fate": actionUpdateFate,
  "update_rel_tag": actionUpdateRelTag,
  "kanshou_set_nickname": actionSetNickname, // 🔒 專屬稱呼：玩家設過就上稱呼鎖，AI 不再覆寫
  "get_heroes": actionGetHeroes,
  "get_tags": actionGetTags,
  "outfit": actionSetOutfit,
  "sync": actionSync,
  "play": actionPlay,
  "war_load": actionWarLoad,       // ⚔️ 新聖杯戰爭（War_Router.gs）：讀這個帳號的戰局
  "war_new": actionWarNew,         // ⚔️ 開新局＝召喚
  "war_act": actionWarAct,         // ⚔️ 按下一顆鈕（白天／夜晚／戰鬥姿態）
  "war_narrate": actionWarNarrate, // ⚔️ 說書：演剛剛算好的那一段
  "war_quit": actionWarQuit,       // ⚔️ 放棄這一局
  "war_dojo": actionWarDojo,       // ⚔️🐯 終局後的老虎道場：演 warDebrief_ 算好的戰績與講評
  "war_forge_list": actionWarForgeList, // 🛠️ 英靈工房（War_Forge.gs）：我的原創＋可選技能＋規則
  "war_forge_save": actionWarForgeSave, // 🛠️ 新做／修改一位原創從者
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
  // 🔄 試算表存在性檢查只在登入時跑（ensureWorldReady_，版本號沒變就跳過），不在每個 action 都跑。
  const isKanshouCtx = String(pcId || "").indexOf("KPC_") === 0;
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
  // ⚡ 2→1：會改到角色狀態的動作回應自動夾帶最新 client state(_state)，前端套用後即不必再打一趟 sync。
  if (STATE_AFTER_ACTIONS[action] && isKanshouCtx) {
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
// 🔒 不查角色歸屬的動作：還沒有角色可查（登入、第一次進後日談）或純讀英靈殿。
const OWNERSHIP_CHECK_EXEMPT_ = {
  account_login: 1, enter_kanshou: 1, get_heroes: 1
};
// 🔒 不取寫入鎖的動作：純讀取(不寫表·鎖了白繳成本) ＋ 長 AI 敘事(佔鎖數秒會卡住全域)。
const LOCK_EXEMPT_ACTIONS_ = {
  get_full_status: 1, get_heroes: 1, get_tags: 1, sync: 1, play: 1, backfill_kanshou_ai: 1, war_load: 1, war_narrate: 1, war_dojo: 1, war_forge_list: 1, war_forge_save: 1
};
// ⚡ 會改到角色狀態、前端事後會 syncData(整頁刷新) 的動作 → 夾帶 _state 省一趟 round-trip。
const STATE_AFTER_ACTIONS = {
  update_fate: 1, update_rel_tag: 1, kanshou_set_nickname: 1
};
// ==========================================
// 🔴 動作處理模組 (Action Handlers)
// ==========================================


// solo／鑑賞共用的 handler 靠這支找出呼叫者的 game_id（KPC_ 走鑑賞表索引）。
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
  // 📜 狀態鈕傳的是名字不是 ID，所以兩種都認，且限本局（防跨局撞名）。
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
    if (myGameId.indexOf("k_") !== 0 && String(pcData[pIdx][COL.PC.IS_PARTY] || "") !== "同行") {
      return JSON.stringify({ success: false, message: `只能改跟你同行的從者。` });
    }
  }

  // 只准改三種敘事欄；數值與寶具是 GAS 的（萌點 2026-09 退休，路由一併拔除）。
  let targetCol = fateType === 'trait' ? COL.PC.TRAIT : fateType === 'pref' ? COL.PC.PREF : fateType === 'back' ? COL.PC.BACK : -1;
  if (targetCol === -1) return JSON.stringify({ success: false, message: "這格改不了，只能改個性、特徵、身世。" });
  var cap = fateType === 'back' ? 80 : 130; // 身世單格；個性/特徵是頓號拼接，寬一點
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
  const m = pcData.find(r => r[COL.PC.ID] == pcId);
  if (!m) return { success: false, message: "找不到這個角色，重新整理再試。" };
  const gameId = String(m[COL.PC.GAME_ID] || "");
  const master = {
    name: m[COL.PC.NAME], sex: m[COL.PC.SEX],
    physical: m[COL.PC.PHYSICAL] || "{}",
    outfit: getOutfit_(m[COL.PC.MEMORY]) // 換裝鈕預填
  };
  // 同伴卡：這座城的全部住民（LOC 在鑑賞是 AI 寫的布景，拿它篩會讓卡片消失）。
  const _partyIds = (() => { try { return kanshouGetParty_(m[COL.PC.MEMORY]); } catch (e) { return []; } })();
  const servants = pcData.filter(s => kanshouIsAlly_(s, gameId)).map(s => ({
    id: s[COL.PC.ID], // 前端隨後續 action 回傳，後端認 id 不認名字
    name: s[COL.PC.NAME], cls: s[COL.PC.RANK] || "從者", sex: s[COL.PC.SEX],
    tag: s[COL.PC.REL_TAG] || "", nickname: getNickname_(s[COL.PC.REL_MEM]), // 🏷️關係面板預填；沒設就留空
    party: _partyIds.indexOf(String(s[COL.PC.ID])) >= 0,
    statusString: buildPlayerStatusString(s, String(s[COL.PC.REL_MEM] || "")),
    outfit: getOutfit_(s[COL.PC.MEMORY]), physical: s[COL.PC.PHYSICAL] || "{}"
  }));
  return { success: true, master: master, servants: servants,
    // 🌙 夜未眠(Gallery.gs KANSHOU_NIGHT_SCENE_TAG_)：HUD 那顆鈕要據此把「🌙睡覺」換成「🌅睡到天亮」。
    nightScene: KANSHOU_NIGHT_SCENE_TAG_.get(m[COL.PC.MEMORY]) === (parseInt(m[COL.PC.DAY]) || 0) || undefined };
}

function buildClientState_(sheets, pcId, preData) {
  const allPcData = preData || sheets.pc.getDataRange().getValues();
  const pcIndex = allPcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pcIndex === -1) return null;
  let clk = "", kanshouClock = null;
  try { const ci = kanshouClockInfo_(allPcData[pcIndex]); clk = ci.label; kanshouClock = ci; } catch (e) { }
  return {
    statusString: buildPlayerStatusString(allPcData[pcIndex]),
    clock: clk,
    kanshouClock: kanshouClock,
    tags: buildTagsPayload_(sheets, pcId, allPcData)
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

  const finalTag = _clearing ? "" : String(newTagText).trim();
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

// 🔒 專屬稱呼：玩家手動設定後蓋【稱呼鎖】，AI 不再自動覆寫。
function actionSetNickname(userData, pcId, sheets) {
  const { targetName, newNickname, targetId } = userData;
  if (!newNickname || !String(newNickname).trim()) return JSON.stringify({ success: false, message: "稱呼不能空白。" });

  const pcData = sheets.pc.getDataRange().getValues();
  // 🔒 帳號歸屬驗證（2026-07 再稽核抓到的漏洞補上，見 resolveCallerGameId_ 說明）。
  const myGameId = resolveCallerGameId_(pcData, pcId);
  if (myGameId === null) return JSON.stringify({ success: false, message: "找不到這段關係。" });
  const tIdx = findPcRowIdx_(pcData, myGameId, { id: targetId, name: targetName });
  if (tIdx === -1) return JSON.stringify({ success: false, message: "找不到這段關係。" });

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

