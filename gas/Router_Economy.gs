// ==========================================
// 🔋 Router_Economy.gs — 靈基出力／魔境／符文／寶具選／補魔
//   玩家可調的從者旋鈕(樂觀更新 setter)＋actionManaSupply(硬擠迴路回滿共用池)。
// ==========================================
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。

function actionSetServantOutput(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "找不到你的角色" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant, userData.servantId);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你還沒有從者。" });
  const want = snapOutput_(userData.output);
  pcData[svIdx][COL.PC.MEMORY] = setServantOutput_(pcData[svIdx][COL.PC.MEMORY], want);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  const t = outputTier_(want);
  const svName = pcData[svIdx][COL.PC.NAME];
  return JSON.stringify({
    success: true, output: want, label: t.label,
    message: `「${svName}」的出力調到 ${want}%（${t.label}）。`,
    economy: playerServantEconomy_(sheets, pcId, pcData) // 樂觀更新只吃 economy；不再算前端會丟棄的 statusString(省一次整表讀)
  });
}

// 🔮 設定魔境的智慧選定標籤（斯卡哈專屬，玩家點選 1 個通用 A 階被動）：免費、即時、不耗 AP。
function actionSetMageRealm(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "找不到你的角色" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant, userData.servantId);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你沒有這個從者。" });
  let skills = [];
  try { const tg = JSON.parse(pcData[svIdx][COL.PC.TAGS] || "{}"); skills = tg.skills || []; } catch (e) { }
  if (!skills.some(sk => sk && sk.fx === 'mage_realm')) {
    return JSON.stringify({ success: false, message: "這個從者沒有「魔境的智慧」。" });
  }
  const wantFx = String(userData.fx || "");
  const ent = wantFx ? mageRealmEntry_(wantFx) : null;
  if (wantFx && !ent) return JSON.stringify({ success: false, message: "魔境選不了這個。" });
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
  if (pIdx === -1) return JSON.stringify({ success: false, message: "找不到你的角色" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant, userData.servantId);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你沒有這個從者。" });
  let skills = [];
  try { const tg = JSON.parse(pcData[svIdx][COL.PC.TAGS] || "{}"); skills = (tg.classSkills || []).concat(tg.skills || []); } catch (e) { }
  if (!skills.some(sk => sk && sk.fx === 'rune')) {
    return JSON.stringify({ success: false, message: "這個從者沒有「原初符文」。" });
  }
  const want = String(userData.mode || 'def');
  if (RUNE_MODES_.indexOf(want) < 0) return JSON.stringify({ success: false, message: "沒有這種用法。" });
  pcData[svIdx][COL.PC.MEMORY] = setRuneMode_(pcData[svIdx][COL.PC.MEMORY], want);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  const label = { def: '減傷（護符結界）', dmg: '增傷（符文灼擊）', regen: '回血（治癒符文）' }[want];
  return JSON.stringify({
    success: true, mode: want,
    message: `「${pcData[svIdx][COL.PC.NAME]}」將原初符文運用為【${label}】。`
  }); // 樂觀更新·前端自走輕量 syncData，不再算丟棄的 statusString
}

// 👕 從者換裝（玩家自訂當前服裝穿著，存從者 MEMORY【換裝】）：純外觀·免費·即時·不耗 AP。
function actionSetOutfit(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "找不到你的角色" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  // self=true：換的是御主本人(鑑賞御主卡「換裝」鈕)，鎖定自己這列，不查從者
  const svIdx = userData.self ? pIdx : findPlayerServantIdx_(pcData, myGameId, userData.servant, userData.servantId);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你沒有這個從者。" });
  pcData[svIdx][COL.PC.MEMORY] = setOutfit_(pcData[svIdx][COL.PC.MEMORY], userData.outfit); // set 內已剝分隔字元＋限 40 字
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  const now = getOutfit_(pcData[svIdx][COL.PC.MEMORY]);
  const svName = pcData[svIdx][COL.PC.NAME];
  return JSON.stringify({
    success: true, outfit: now,
    message: now ? `已為「${svName}」換上【${now}】——此後敘述將依此裝扮描寫（換衣不換人）。` : `已卸下「${svName}」的自訂裝扮，恢復其本來裝束。`
  }); // 樂觀更新·前端自走輕量 syncData
}

// ⚔️ 設定從者武裝（存 MEMORY【武裝】）：玩家自定武器/戰鬥方式，敘述以此為準(蓋過職階慣例/原典習慣)。
function actionSetWeapon(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "找不到你的角色" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant, userData.servantId);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你沒有這個從者。" });
  pcData[svIdx][COL.PC.MEMORY] = setWeapon_(pcData[svIdx][COL.PC.MEMORY], userData.weapon); // set 內已剝分隔字元＋限 30 字
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  const now = getWeapon_(pcData[svIdx][COL.PC.MEMORY]);
  const svName = pcData[svIdx][COL.PC.NAME];
  return JSON.stringify({
    success: true, weapon: now,
    message: now ? `已為「${svName}」定下武裝【${now}】——此後攻防敘述皆以此為準。` : `已清除「${svName}」的自訂武裝，恢復依職階與傳說自然演出。`
  }); // 樂觀更新·前端自走輕量 syncData
}

// 🔒 從者不是有求必應：補魔／強制補魔(令咒)共用的信任門檻，單一真實來源，兩處都讀這個常數。
// 💧 補魔的永久代價。原本是函式內的區域 const，而前端有兩句話各自寫死同一組數字
//    （狀態面板的按鈕、規則說明），改一邊另一邊不會跟——抽成檔案層常數並鏡射給前端。
var MANA_CIRC_CUT_ = 3;
var MANA_HP_CUT_ = 15;
var MANA_TRUST_BOND_ = 60;   // 2026-09 玩家定案 80→60：對齊羈絆里程碑，跨過 60 ＝ 願意託付
var MANA_LOW_PCT_ = 0.30;     // 💧補魔的「魔力夠低」線（≤ 上限的三成）；2026-09 由 10% 放寬

// 🔵 補魔（魔力供給）：把御主魔力導入從者，回魔＋羈絆＋fade 演出。耗 1 AP（導入魔力需時）
function actionManaSupply(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "找不到你的角色" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant, userData.servantId);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你還沒有從者。" });
  const svName = pcData[svIdx][COL.PC.NAME];
  // 補魔＝御主硬擠魔術迴路、回滿共用池——但【永久】燒蝕：血量上限−15、迴路−3(有地板)。
  const CIRC_FLOOR = 8, HP_FLOOR = 40;
  const curMpMax = parseInt(pcData[pIdx][COL.PC.MAX_MP]) || masterPoolMax_(masterCircuits_(pcData[pIdx]), 0);
  const curMp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  if (curMp >= curMpMax) return JSON.stringify({ success: false, message: `魔力是滿的，不用補。` });

  const bondForMana = parseInt(pcData[svIdx][COL.PC.BOND]) || 0;
  const lowEnoughForMana = curMp <= curMpMax * MANA_LOW_PCT_;
  if (bondForMana < MANA_TRUST_BOND_ || !lowEnoughForMana) {
    // GAS 只給裁定後的事實，理由留給 AI 用她的個性演——舊版把「信任尚淺、羈絆未至可託付如此私密之事的深度」
    const declineWhy = bondForMana < MANA_TRUST_BOND_ ? '兩人的交情還不到這一步' : '魔力還撐得住，用不著付出這種代價';
    const declinePrompt = masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
      `【已裁定】御主開口求補魔，「${svName}」婉拒了——${declineWhy}。\n` +
      `★【60~100 字】演出這個「不」：依對方的個性，用眼神、動作或一句話帶過，理由留在言外。收在御主被回絕的那一刻。`;
    STATE_PRE_DATA_ = pcData; // ⚡ 沒寫入也要交棒，否則 dispatcher 的 STATE_AFTER_ACTIONS 夾帶會退回整表重讀
    return JSON.stringify({ success: true, declined: true, aiPrompt: declinePrompt, statusString: buildPlayerStatusString(pcData[pIdx]) }); // ⚡ pcData 即權威，免 getFreshStatusString 的整表重讀
  }

  const isFateMana = myGameId.indexOf("g_") === 0;
  if (isFateMana && getAp_(myGameId, pcData) < 1) {
    return JSON.stringify({ success: false, needRest: true, message: "行動力不夠。" });
  }
  const oldCirc = masterCircuits_(pcData[pIdx]);
  if (oldCirc <= CIRC_FLOOR) {
    return JSON.stringify({ success: false, message: `你的迴路只剩 ${oldCirc} 條，再擠會斷。` });
  }
  // 永久代價：迴路−3、血量上限−15（各有地板）——補魔燒身是「賭上未來換這一發」的重決定，非廉價回魔。
  const circCut = MANA_CIRC_CUT_;
  const hpCut = MANA_HP_CUT_;
  const newCirc = Math.max(CIRC_FLOOR, oldCirc - circCut);
  const oldMaxHp = parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 100;
  const newMaxHp = Math.max(HP_FLOOR, oldMaxHp - hpCut);
  // 同隊從者魔力 → 重算池上限(新迴路 + 魔力×2)；回滿
  let partyMag = 0;
  pcData.forEach(function (r) { if (String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_")) { try { partyMag += rankVal(JSON.parse(r[COL.PC.SIX] || '{}')['魔力'] || 'E'); } catch (e) { } } });
  const newMpMax = masterPoolMax_(newCirc, partyMag);
  const restored = newMpMax; // 回滿池
  // 寫回：迴路(MEMORY)、血上限、(夾)當前血、池上限、回滿魔
  pcData[pIdx][COL.PC.MEMORY] = MASTER_CIRCUITS_TAG_.set(pcData[pIdx][COL.PC.MEMORY], newCirc);
  pcData[pIdx][COL.PC.MAX_HP] = newMaxHp;
  pcData[pIdx][COL.PC.HP] = Math.min(parseInt(pcData[pIdx][COL.PC.HP]) || 0, newMaxHp);
  pcData[pIdx][COL.PC.MAX_MP] = newMpMax;
  pcData[pIdx][COL.PC.MP] = restored;
  // 🔥 補魔過充：除回滿池，另存「下一發規格外寶具(＋/EX)可【無償】超載灌入的一池份魔力」(一次性·發動即清)
  pcData[pIdx][COL.PC.MEMORY] = setOvercharge_(pcData[pIdx][COL.PC.MEMORY], newMpMax);
  const mpMax = newMpMax; // 給下方敘述沿用

  const _manaApr = chargeApOrReject_(myGameId, 1, pcData, sheets, "行動力不夠。", { isFate: isFateMana, skipWrite: true });
  const manaAp = _manaApr.ap, manaClock = _manaApr.clock;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  raiseBond_(sheets, myGameId, pcData[pIdx][COL.PC.NAME], svName, 3, pcData);

  // ⚔️ 卸防突襲：補魔時門戶大開，同地若有清醒敵從者→趁隙重擊我方從者（可能致敗）
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, 1.4, svIdx);

  // 戰場補魔：甜而克制的曖昧 fade（給點甜頭、不開慾海引擎）——真・慾海留給鑑賞
  const aiPrompt = ambushDispatchPrompt_(ambush,
    function (a) {
      return masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx], { skipClose: true }) + (a.foeCard || '') + `【系統·補魔遭突襲·已裁定】御主硬擠魔術迴路為「${svName}」回滿共用魔力池（迴路永久燒蝕至 ${newCirc} 條、生命上限永久跌為 ${newMaxHp}）已然結算完成；就在彼此門戶大開之際，潛伏同地的敵從者「${a.enemyName}」${a.stealthy ? '自陰影中無聲撲出' : '抓住這破綻猛然殺到'}，一記重擊狠狠命中「${svName}」、致其${dmgSeverityWord_(a.dmg || 0, a.svHpMax)}${a.destroyed ? '，其靈基當場崩潰、化作光點消散，御主敗北' : ''}。\n` +
        `★寫補魔的私密一刻被突襲打斷：補魔已經完成，緊接著被打斷。${a.destroyed ? '從者消滅的痛楚，語氣留白。' : `「${svName}」依性格與羈絆對這記突襲做出反應。`}傷害與勝負已由系統結算。\n` +
        performanceNote_(a.destroyed ? [svName] : [svName, a.enemyName]);
    },
    function () {
      // 此分支只在好感≥門檻且魔力見底時走到——從者是真心信任、主動託付的，敘述可更直接大膽；篇幅也拉長(前端manaSupply()的unlocked旗標→narrate(...,{longForm:true})→後端加大 max_tokens，模型不變)。
      const genderFactMana = sealGenderFact_(String(pcData[pIdx][COL.PC.SEX] || ""), String(pcData[svIdx][COL.PC.SEX] || ""), svName);
      return masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
        `【已裁定】御主硬擠魔術迴路，為「${svName}」回滿共用魔力池（${restored}/${mpMax}）；迴路永久燒蝕至 ${newCirc} 條、生命上限永久跌為 ${newMaxHp}——御主拿自己的身體上限換了這場供魔。羈絆微升。「${svName}」的羈絆 ${bondForMana}，是真心託付。下一發規格外寶具可全力超載。\n` +
        `${genderFactMana}★【500~600 字】寫這場供魔：魔力流動只是成因，全篇寫在肉體這一側——接觸、溫度、反應。${LEWD_EXPLICIT_}這一場的節奏由「${svName}」掌控：英靈遠比常人強韌，何時攀頂由「${svName}」自己決定。御主剛燒過迴路，到最後是癱軟的那一方。「${svName}」在魔力上飽足了，肉體這一側還留著沒盡興的餘裕。挑一兩個關鍵瞬間深寫，篇幅全給實際發生的細節。收在餘韻猶存的溫柔。`;
    }
  );
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：迴路/血量上限燒蝕/MP回滿/raiseBond_/spendAp_/夜襲 皆已原地改回 pcData
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, unlocked: !ambush, clock: manaClock, ap: manaAp, apMax: AP_PER_DAY, ambush: !!ambush, defeat: ambush ? ambush.defeat : false, dreamPrompt: ambush ? ambush.dreamPrompt : "", report: ambush ? ambush.report : null, statusString: buildPlayerStatusString(pcData[pIdx]) }); // ⚡ pcData 即權威，免 getFreshStatusString 的整表重讀
}

function actionSpiritRepair(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "找不到你的角色" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant, userData.servantId);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你還沒有從者。" });
  const svName = pcData[svIdx][COL.PC.NAME];

  const isFateMana = myGameId.indexOf("g_") === 0;
  if (isFateMana && getAp_(myGameId, pcData) < 1) {
    return JSON.stringify({ success: false, needRest: true, message: "行動力不夠。" });
  }

  const svMaxHp = parseInt(pcData[svIdx][COL.PC.MAX_HP]) || 450;
  const svHp = parseInt(pcData[svIdx][COL.PC.HP]) || 0;
  if (svHp >= svMaxHp) return JSON.stringify({ success: false, message: `「${svName}」血是滿的，不用療。` });

  const mpMax = parseInt(pcData[pIdx][COL.PC.MAX_MP]) || masterPoolMax_(masterCircuits_(pcData[pIdx]), 0);
  const mp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  const REPAIR_MP_COST_PCT = 0.40, REPAIR_HEAL_PCT = 0.35; // 消費池4成、回復從者上限3成半——單一真實來源，兩處(前端提示/戰報)皆讀這裡算出的結果，不重複硬編碼
  const cost = Math.round(mpMax * REPAIR_MP_COST_PCT);
  if (mp < cost) return JSON.stringify({ success: false, message: `魔力不夠療傷（要 ${cost}，剩 ${mp}）。` });

  const healed = Math.min(svMaxHp - svHp, Math.round(svMaxHp * REPAIR_HEAL_PCT));
  pcData[svIdx][COL.PC.HP] = svHp + healed;
  pcData[pIdx][COL.PC.MP] = mp - cost;

  const _repApr = chargeApOrReject_(myGameId, 1, pcData, sheets, "行動力不夠。", { isFate: isFateMana, skipWrite: true });
  const repAp = _repApr.ap, repClock = _repApr.clock;
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  raiseBond_(sheets, myGameId, pcData[pIdx][COL.PC.NAME], svName, 2, pcData);

  // ⚔️ 卸防突襲：療傷時同樣門戶大開，同地若有清醒敵從者→趁隙重擊我方從者（可能致敗）
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, 1.3, svIdx);

  const aiPrompt = ambushDispatchPrompt_(ambush,
    function (a) {
      return masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx], { skipClose: true }) + (a.foeCard || '') + `【系統·靈基修復遭突襲·已裁定】御主引動共用魔力池為「${svName}」療傷、傷勢已有起色；就在彼此門戶大開之際，潛伏同地的敵從者「${a.enemyName}」${a.stealthy ? '自陰影中無聲撲出' : '抓住這破綻猛然殺到'}，一記重擊狠狠命中「${svName}」、致其${dmgSeverityWord_(a.dmg || 0, svMaxHp)}${a.destroyed ? '，其靈基當場崩潰、化作光點消散，御主敗北' : ''}。\n` +
        `★寫療傷的私密一刻被突襲打斷：療傷已經完成，緊接著被打斷。${a.destroyed ? '從者消滅的痛楚，語氣留白。' : `「${svName}」依性格與羈絆對這記突襲做出反應。`}傷害與勝負已由系統結算。\n` +
        performanceNote_(a.destroyed ? [svName] : [svName, a.enemyName]);
    },
    function () {
      return masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
        `【系統·靈基修復已結算】御主引動共用魔力池為「${svName}」療傷，傷勢明顯好轉（現況：${hpStateWord_(pcData[svIdx][COL.PC.HP], svMaxHp) || '已無大礙'}）。羈絆微升。\n` +
        `★【60~100 字】描寫這場療傷小品——魔力沿契約流向從者、傷勢緩緩平復的觸感與體溫，依「${svName}」性格與當前羈絆自然反應演出（不預設溫情，冷傲疏離者可淡然受之）。\n` +
        `★【show, don't tell】反應、願望與個性全部用言行與神態去流露。`;
    }
  );
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：HP回復/MP扣減/raiseBond_/spendAp_/夜襲 皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({
    success: true, aiPrompt: aiPrompt, healed: healed, cost: cost, ap: repAp, clock: repClock, apMax: AP_PER_DAY,
    ambush: !!ambush, defeat: ambush ? ambush.defeat : false, dreamPrompt: ambush ? ambush.dreamPrompt : "", report: ambush ? ambush.report : null,
    statusString: buildPlayerStatusString(pcData[pIdx]) // ⚡ pcData 即權威，免 getFreshStatusString 的整表重讀
  });
}

