// ==========================================
// 🔋 Router_Economy.gs — 靈基出力／魔境／符文／寶具選／補魔（2026-07 從 Router_Action.gs 拆出）
//   玩家可調的從者旋鈕(樂觀更新 setter)＋actionManaSupply(硬擠迴路回滿共用池)。
// ==========================================

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

// 🗑️ 2026-07：actionSetActiveSkill(主動技開關)已刪——主動技改回攻擊時的「⚡主動」按鈕
//   (fate_battle 夾帶 userData.skill，見 Router_Battle.gs)，玩家定案：開關制手機難按、還多一趟
//   round-trip；MEMORY【主動技】標記隨之棄用(舊存檔殘留無害·無人再讀)。

// 🗑️ 2026-07：actionSetNpChoice(獨立設定多寶具索引的 action)已刪——前端從未呼叫過(從一開始就沒接線)，
//   多寶具索引改走 fate_battle 一併夾帶的 userData.npChoice(見 Router_Battle.gs)。setNpChoice_/npChoice_
//   兩個 helper 仍在用，未動。

// 👗 從者換裝（玩家自訂當前服裝穿著，存從者 MEMORY【換裝】）：純外觀·免費·即時·不耗 AP。
//   只換衣不換人(五官/髮色/體態依種子 look)；空字串＝恢復本相。餵進 servantCard_／actionPlay 敘述、兩軌通用。
function actionSetOutfit(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  // 🆕 self=true：換的是御主本人(鑑賞御主卡「換裝」鈕)，直接鎖定自己這列，不查從者
  const svIdx = userData.self ? pIdx : findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無此從者。" });
  pcData[svIdx][COL.PC.MEMORY] = setOutfit_(pcData[svIdx][COL.PC.MEMORY], userData.outfit); // set 內已剝分隔字元＋限 40 字
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  const now = getOutfit_(pcData[svIdx][COL.PC.MEMORY]);
  const svName = pcData[svIdx][COL.PC.NAME];
  return JSON.stringify({
    success: true, outfit: now,
    message: now ? `已為「${svName}」換上【${now}】——此後敘述將依此裝扮描寫（換衣不換人）。` : `已卸下「${svName}」的自訂裝扮，恢復其本來裝束。`
  }); // 樂觀更新·前端自走輕量 syncData
}

// ⚔️ 設定從者武裝（存 MEMORY【武裝】·2026-07）：玩家自定武器/戰鬥方式，敘述以此為準(蓋過職階慣例/原典習慣)。
//   免費、即時、不耗 AP；留空＝清除、恢復自然演出。鏡射 actionSetOutfit。
function actionSetWeapon(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無此從者。" });
  pcData[svIdx][COL.PC.MEMORY] = setWeapon_(pcData[svIdx][COL.PC.MEMORY], userData.weapon); // set 內已剝分隔字元＋限 30 字
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  const now = getWeapon_(pcData[svIdx][COL.PC.MEMORY]);
  const svName = pcData[svIdx][COL.PC.NAME];
  return JSON.stringify({
    success: true, weapon: now,
    message: now ? `已為「${svName}」定下武裝【${now}】——此後攻防敘述皆以此為準。` : `已清除「${svName}」的自訂武裝，恢復依職階與傳說自然演出。`
  }); // 樂觀更新·前端自走輕量 syncData
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
  // 🔋 共用魔力池制：補魔＝御主硬擠魔術迴路、回滿共用池——但【永久】燒蝕：血量上限−15、迴路−3(有地板)。
  //   過度補魔＝慢性自盡(迴路↓→池縮、回魔慢、禮裝弱)。另有「被動燃血」：池見底時 applyRegen_ 自動扣【御主】HP續契約(從者不扣血)。
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
  // 永久代價：迴路−3、血量上限−15（各有地板）。2026-07 加碼——補魔燒身該是「賭上未來換這一發」的重決定，非廉價回魔。
  const circCut = 3;
  const hpCut = 15;
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
  // 🔥 補魔過充：除回滿池，另存「下一發規格外寶具(＋/EX)可【無償】超載灌入的一池份魔力」(一次性·發動即清)
  pcData[pIdx][COL.PC.MEMORY] = setOvercharge_(pcData[pIdx][COL.PC.MEMORY], newMpMax);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  raiseBond_(sheets, myGameId, pcData[pIdx][COL.PC.NAME], svName, 3, pcData);
  const mpMax = newMpMax; // 給下方敘述沿用

  let manaAp = AP_PER_DAY, manaClock = "";
  if (isFateMana) { try { manaAp = spendAp_(myGameId, 1, pcData, sheets).ap; manaClock = clockLabel_(myGameId, pcData); } catch (e) { } }

  // ⚔️ 卸防突襲：補魔時門戶大開，同地若有清醒敵從者→趁隙重擊我方從者（可能致敗）
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, userData, 1.4);

  // 戰場補魔：甜而克制的曖昧 fade（給點甜頭、不開慾海引擎）——真・慾海留給鑑賞
  let aiPrompt;
  if (ambush && ambush.homeRepel) {
    aiPrompt = ambush.repelNote; // 🏰 陣地反擊·優雅擊退
  } else if (ambush) {
    aiPrompt = (ambush.foeCard || '') + `【系統·補魔遭突襲·已裁定】御主正以魔力供給「${svName}」、彼此門戶大開之際，潛伏同地的敵從者「${ambush.enemyName}」${ambush.stealthy ? '自陰影中無聲撲出' : '抓住這破綻猛然殺到'}，一記重擊狠狠命中「${svName}」（−${ambush.dmg}）${ambush.destroyed ? '，其靈基當場崩潰、化作光點消散，御主敗北' : ''}。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫補魔的私密一刻被突襲打斷的驚變：魔力交融的脆弱、敵襲的兇險、${ambush.destroyed ? '從者消滅的痛楚（語氣留白）' : '從者依其性格與羈絆對此突襲的反應（重情者強撐護主、疏離者未必）'}。傷害與勝負已由系統結算。\n` +
      ``;
  } else {
    aiPrompt = masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
      `【系統·補魔已結算】御主硬擠魔術迴路為「${svName}」回滿共用魔力池（${restored}/${mpMax}），代價沉重——魔術迴路永久燒蝕至 ${newCirc} 條、生命上限永久跌為 ${newMaxHp}。羈絆微升。澎湃魔力於體內鼓盪、蓄勢待發——【下一發規格外寶具可全力超載解放】。\n` +
      `★以 Fate／TYPE-MOON 筆觸【精煉 90~140 字】描寫這場「燃迴路續契約」的私密而沉重的一刻——御主強行催動將要燒斷的魔術迴路、魔力沿靈魂聯繫流向從者、體溫與屏息、從者察覺御主迴路受損／面色透支時的反應【一概依其性格與當前羈絆自然演出·不預設溫情(高羈絆或有不忍、冷傲疏離者則淡然受之)】，最後 fade-to-black 留白。\n` +
      `★【鐵律】止於唯美曖昧、點到為止；【不可】出現性器官、性交或露骨情慾描寫（那是奪杯後鑑賞的事）。演出而非複述設定。`;
  }
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：迴路/血量上限燒蝕/MP回滿/raiseBond_/spendAp_/夜襲 皆已原地改回 pcData
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, clock: manaClock, ap: manaAp, apMax: AP_PER_DAY, ambush: !!ambush, defeat: ambush ? ambush.defeat : false, dreamPrompt: ambush ? ambush.dreamPrompt : "", report: ambush ? ambush.report : null, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// 🩹 靈基修復（2026-07 新增·原從者卡「令咒」鈕挪去御主卡後空出的欄位）：消費共用魔力池為從者療傷，
//   回復部分氣血——不燃令咒、可重複使用，但吃掉的魔力池本可拿去放寶具/衝高出力，形成「現在回血
//   還是留著打」的即時取捨。與令咒選單裡那個一次性全滿版(❖ 絕對修復·耗令咒·雙方回滿)刻意區隔：
//   那個是絕對命令的孤注一擲，這個才是常態、可日常使用的手段。
function actionSpiritRepair(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const svIdx = findPlayerServantIdx_(pcData, myGameId, userData.servant);
  if (svIdx === -1) return JSON.stringify({ success: false, message: "你尚無從者可供修復。" });
  const svName = pcData[svIdx][COL.PC.NAME];

  const isFateMana = myGameId.indexOf("g_") === 0;
  if (isFateMana && getAp_(myGameId) < 1) {
    return JSON.stringify({ success: false, message: "行動力不足以行靈基修復之儀——請『休息』恢復後再來。" });
  }

  const svMaxHp = parseInt(pcData[svIdx][COL.PC.MAX_HP]) || 450;
  const svHp = parseInt(pcData[svIdx][COL.PC.HP]) || 0;
  if (svHp >= svMaxHp) return JSON.stringify({ success: false, message: `「${svName}」氣血已然充盈，毋須修復。` });

  const mpMax = parseInt(pcData[pIdx][COL.PC.MAX_MP]) || masterPoolMax_(masterCircuits_(pcData[pIdx]), 0);
  const mp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  const REPAIR_MP_COST_PCT = 0.40, REPAIR_HEAL_PCT = 0.35; // 消費池4成、回復從者上限3成半——單一真實來源，兩處(前端提示/戰報)皆讀這裡算出的結果，不重複硬編碼
  const cost = Math.round(mpMax * REPAIR_MP_COST_PCT);
  if (mp < cost) return JSON.stringify({ success: false, message: `共用魔力池不足以支撐靈基修復（需 ${cost}，僅剩 ${mp}）。` });

  const healed = Math.min(svMaxHp - svHp, Math.round(svMaxHp * REPAIR_HEAL_PCT));
  pcData[svIdx][COL.PC.HP] = svHp + healed;
  pcData[pIdx][COL.PC.MP] = mp - cost;
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  raiseBond_(sheets, myGameId, pcData[pIdx][COL.PC.NAME], svName, 2, pcData);

  let repAp = AP_PER_DAY, repClock = "";
  if (isFateMana) { try { repAp = spendAp_(myGameId, 1, pcData, sheets).ap; repClock = clockLabel_(myGameId, pcData); } catch (e) { } }

  // ⚔️ 卸防突襲：療傷時同樣門戶大開，同地若有清醒敵從者→趁隙重擊我方從者（可能致敗）
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, userData, 1.3);

  let aiPrompt;
  if (ambush && ambush.homeRepel) {
    aiPrompt = ambush.repelNote; // 🏰 陣地反擊·優雅擊退
  } else if (ambush) {
    aiPrompt = (ambush.foeCard || '') + `【系統·靈基修復遭突襲·已裁定】御主正引共用魔力池為「${svName}」療傷、彼此門戶大開之際，潛伏同地的敵從者「${ambush.enemyName}」${ambush.stealthy ? '自陰影中無聲撲出' : '抓住這破綻猛然殺到'}，一記重擊狠狠命中「${svName}」（−${ambush.dmg}）${ambush.destroyed ? '，其靈基當場崩潰、化作光點消散，御主敗北' : ''}。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫療傷的私密一刻被突襲打斷的驚變，${ambush.destroyed ? '及從者消滅的痛楚（語氣留白）' : '及從者依其性格與羈絆對此突襲的反應（重情者強撐護主、疏離者未必）'}。傷害與勝負已由系統結算。\n` +
      ``;
  } else {
    aiPrompt = masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
      `【系統·靈基修復已結算】御主引動共用魔力池（−${cost}）為「${svName}」療傷，氣血回復 ${healed} 點（現 ${pcData[svIdx][COL.PC.HP]}/${svMaxHp}）。羈絆微升。\n` +
      `★以 Fate／TYPE-MOON 筆觸【精煉 60~100 字】描寫這場療傷小品——魔力沿契約流向從者、傷勢緩緩平復的觸感與體溫，依「${svName}」性格與當前羈絆自然反應演出（不預設溫情，冷傲疏離者可淡然受之）。\n` +
      `★【show, don't tell】用言行、神態去流露反應，不可直白說出其願望／個性／萌點等設定詞。`;
  }
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：HP回復/MP扣減/raiseBond_/spendAp_/夜襲 皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({
    success: true, aiPrompt: aiPrompt, healed: healed, cost: cost, ap: repAp, clock: repClock, apMax: AP_PER_DAY,
    ambush: !!ambush, defeat: ambush ? ambush.defeat : false, dreamPrompt: ambush ? ambush.dreamPrompt : "", report: ambush ? ambush.report : null,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// 🩸 燃血補魔已改為【被動機制】(2026-06)：不再是主動 action。
//   共用魔力池見底、時消耗補不上時，於 applyRegen_(Time_World) 自動「燃命續契約」——
//   缺口÷2 全額扣【御主】HP(保底1)、從者不扣血(2026-07 玩家定案)。詳見 applyRegen_。舊主動 actionBloodSupply 已移除。

// ── 💕 羈絆日限：記於御主 MEMORY 的【羈絆日】D:type1,type2（跨日自動重置）──
