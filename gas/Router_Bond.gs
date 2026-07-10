// ==========================================
// 🤝 Router_Bond.gs — 羈絆／令咒／結盟／破戒奪僕／主從連結（2026-07 拆出，戰記已砍）
//   actionBond／actionUseSeal／結盟三部曲(propose/break/ally_bond)／actionRuleBreakSteal／
//   敵御主↔敵從者硬連結／喪失從者標記。
// ==========================================

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

  const aiPrompt = `【系統·令咒已發動，已裁定】御主燃燒一道令咒。${effectMsg}（餘 ${seals} 道令咒）\n` +
    `★以 Fate／TYPE-MOON 筆觸描寫令咒在手背灼亮、絕對命令權貫徹的瞬間（一段即可）。效果已由系統結算。\n` +
    ``;
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, seals: seals, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// 從英靈殿(種子庫)依真名撈完整 persona（含 speech/moe/tic 萌點細緻設定）
// 🐛→✅ 2026-07 稽核抓到真實bug：這兩個函式的正規表達式排除字元集寫成`[^|【]`(排除半形｜)，但
//   MEMORY欄整套標記生態系一律用全形｜分隔(緊鄰的set函式自己`s + "｜"`就是全形)——半形｜從來
//   不會出現在真實資料裡，這個排除規則形同虛設，導致抓值時會把後面緊接的全形｜也一併吃進來。
//   具體後果：若當天先做過其他會寫MEMORY的動作(如令咒/補魔/工房)、把新標記接在【羈絆日】後面，
//   `getBondUsedToday_`抓到的值會變成「together｜」而非「together」，`indexOf("together")`比對
//   不到，等於「今天已經相處過」這個防重複判斷失效，同一天可以對同一動作類型二次加成好感。
//   改成`[^｜【]`(排除全形｜)，跟同檔案/同生態系其餘get/set函式(如getOutfit_)的排除字元集一致。
function getBondUsedToday_(memory, day) {
  var m = String(memory || "").match(/【羈絆日】(\d+):([^｜【]*)/);
  if (!m || parseInt(m[1]) !== day) return [];
  return m[2] ? m[2].split(",").filter(Boolean) : [];
}
function setBondUsedToday_(memory, day, type) {
  var used = getBondUsedToday_(memory, day);
  if (used.indexOf(type) < 0) used.push(type);
  var marker = "【羈絆日】" + day + ":" + used.join(",");
  var s = String(memory || "");
  if (/【羈絆日】\d+:[^｜【]*/.test(s)) return s.replace(/【羈絆日】\d+:[^｜【]*/, marker);
  return (s ? s + "｜" : "") + marker;
}

// 💕 羈絆互動（純按鈕，無對話框）：2026-07 玩家定案——原本閒聊/共餐/特訓/夜談 4 種「每日打卡」
//   收成單一「相處」（每遊戲日限一次、跨日重置、+10 羈絆）。味道(閒話/共餐/特訓/夜談)交給 AI
//   依當下時段/羈絆/性格自由即興，不再是假選擇的每日清單。羈絆會餵給路線自然浮現（深羈絆→偏 Fate 線）。
var BOND_ACTS = {
  together: { label: '相處', bond: 10, frame: '一段與御主相處的時光——由你依當下時段、兩人羈絆的深淺與從者性格，自由定調是巡查歇腳的閒話家常、一同用餐的尋常溫度、並肩切磋的默契，或夜深促膝的交心；擇一自然發生、勿逐項羅列' }
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

  // 🐛→✅ 2026-07 稽核抓到：本函式註解明講「相處耗 1 AP・與令咒/偵查同級」，但沒有像
  //   actionProposeAlliance/actionAllyBond 那樣在動作前先擋 AP 不足——原本只在最後靜默呼叫
  //   spendAp_(myGameId,1)，AP 不足時 spendAp_ 內部雖不會讓 AP 變負值，卻也【不吭聲放行】
  //   (回傳 ok:false 但呼叫端沒理會)：羈絆值/日限標記/突襲風險照樣結算，只是不消耗時間，
  //   跟其他同級動作「AP 不足直接擋下」的一致行為不符。日限本身已限 1 次/天，實際可乘之機很
  //   小，但仍補齊此擋以符合「與令咒/偵查同級」的設計初衷、行為一致。
  const isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, message: "行動力不足以從容相處——請『休息』恢復後再來。" });

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

  // ⏳ 相處耗 1 AP＝推進 1 小時（2026-07 玩家定案·與令咒/偵查同級：相處也要花時間）
  let bondAp = null, bondClock = "";
  if (isFate) { try { bondAp = spendAp_(myGameId, 1).ap; bondClock = clockLabel_(myGameId); } catch (e) { } }

  // 取最新羈絆值供顯示（羈絆存於從者自己列的 BOND 欄，raiseBond_ 已寫回，這裡重讀一次拿最新值）
  let bondNow = 0;
  try {
    const freshSv = sheets.pc.getRange(svIdx + 1, COL.PC.BOND + 1).getValue();
    bondNow = parseInt(freshSv) || 0;
  } catch (e) { }

  // ⚔️ 卸防突襲：相伴談心時門戶大開，同地若有清醒敵從者→趁隙重擊
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, userData, 1.2);

  let aiPrompt;
  if (ambush && ambush.homeRepel) {
    aiPrompt = ambush.repelNote; // 🏰 陣地反擊·優雅擊退
  } else if (ambush) {
    aiPrompt = (ambush.foeCard || '') + `【系統·相伴遭突襲·已裁定】御主『${masterName}』與「${svName}」正${act.label}、卸下心防之際，潛伏同地的敵從者「${ambush.enemyName}」${ambush.stealthy ? '自暗處無聲突襲' : '抓準這破綻殺出'}，一擊重創「${svName}」（−${ambush.dmg}）${ambush.destroyed ? '，其靈基崩潰、化作光點消散，御主敗北' : ''}。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫溫存被突襲撕裂的驚變與兇險，${ambush.destroyed ? '及從者消滅的痛楚（語氣留白）' : '及從者依其性格與羈絆對此突襲的反應（重情者強撐護主、疏離者未必）'}。傷害與勝負已由系統結算。\n` +
      ``;
  } else {
    aiPrompt = masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
      `【系統·羈絆已結算】御主『${masterName}』與從者「${svName}」${act.label}、共度約莫一個小時的光景，兩人的羈絆又深了一分（時值${band}）。\n` +
      `★【時間尺度】這是一段約一個小時的相處，寫出「有一段時光緩緩流過」的從容，勿寫成三言兩語的瞬間、也勿橫跨大半天。\n` +
      `★以 Fate／TYPE-MOON 筆觸寫一段【精煉 90~150 字、輕快不冗長】${svName} 與御主${act.frame}的小品。務必貼合上方「演出依據」中的性格、自稱與口吻，演出其獨有神態，點到為止留餘味。\n` +
      `★【show, don't tell】用言行、神態、停頓去流露情感與性格，絕不可直白說出其「願望／個性／萌點」等設定詞；停在含蓄的留白。\n` +
      `★【鐵律】保持溫暖日常或戰友情誼的分寸，不踰矩。`;
  }
  return JSON.stringify({
    success: true, aiPrompt: aiPrompt, bond: bondNow, bondUsed: usedToday,
    ambush: !!ambush, defeat: ambush ? ambush.defeat : false, dreamPrompt: ambush ? ambush.dreamPrompt : "", report: ambush ? ambush.report : null,
    ap: bondAp, clock: bondClock,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// ✨ 禮裝已全面被動化（2026-06 玩家定案）：持有即於戰鬥自動加持我方從者（見 injectMysticBuff_ / MC_COMBAT_），
//   不再有主動發動入口。原 actionUseMystic（吃迴路/耗魔/充能/起源彈狙御主）已移除。

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
  const npcId = String(userData.npcId || "").trim();
  const npcKey = nameLoose_(npcName); // 去中點/空白·比照攻擊路徑
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  // 🔧 比照攻擊路徑(actionFateBattle)：先 npcId 精準配、再 nameLoose_(去中點/空白)——原本 raw includes
  //   對含中點名字(韋伯·維爾維特·不同 Unicode 中點變體)對不上→「打得到英靈、卻交涉恆沒人」。
  const _foeMasterHere = (r) => String(r[COL.PC.FACTION]) === "敵御主" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === myLoc;
  let mIdx = npcId ? pcData.findIndex(r => String(r[COL.PC.ID]) === npcId && _foeMasterHere(r)) : -1;
  if (mIdx === -1) mIdx = pcData.findIndex(r => nameLoose_(r[COL.PC.NAME]).indexOf(npcKey) !== -1 && _foeMasterHere(r));
  if (mIdx === -1) {
    // 🔍 診斷：照名字(loose)找這名敵御主(不限地點)，回報他實際在哪 vs 玩家在哪——不同地＝顯示過期。
    const anyIdx = pcData.findIndex(r => nameLoose_(r[COL.PC.NAME]).indexOf(npcKey) !== -1 && String(r[COL.PC.FACTION]) === "敵御主" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
    const detail = anyIdx >= 0 ? `「${pcData[anyIdx][COL.PC.NAME]}」現在「${String(pcData[anyIdx][COL.PC.LOC]).trim()}」，你在「${myLoc}」` : `名冊查無「${npcName}」`;
    return JSON.stringify({ success: false, message: `此地沒有可交涉的敵御主（${detail}）——須與對方同處一地才能交涉。` });
  }
  if (isAllied_(pcData[mIdx])) return JSON.stringify({ success: false, message: `你已與「${pcData[mIdx][COL.PC.NAME]}」結盟。` });

  const isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, message: "行動力不足以交涉——請休息恢復。" });

  const aliveFoes = aliveEnemyServants_(sheets, myGameId, pcData);
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
    if ((fac === "敵御主" || fac === "敵從者") && isAllied_(pcData[i]) && (!npcName || nameLoose_(pcData[i][COL.PC.NAME]).indexOf(nameLoose_(npcName)) !== -1)) { // 🔧 loose 比對·含中點名字不漏
      pcData[i][COL.PC.MEMORY] = clearAllyMem_(pcData[i][COL.PC.MEMORY]);
      if (fac === "敵御主") who = String(pcData[i][COL.PC.NAME]);
      broke++;
    }
  }
  if (!broke) return JSON.stringify({ success: false, message: "你目前沒有與此人結盟。" });
  // 一組同盟通常master+從者一起破，MEMORY 整欄一次寫回(取代逐列 setValues 的零散往返)
  const brokeMemCol = []; for (let z = 1; z < pcData.length; z++) brokeMemCol.push([pcData[z][COL.PC.MEMORY]]);
  sheets.pc.getRange(2, COL.PC.MEMORY + 1, brokeMemCol.length, 1).setValues(brokeMemCol);
  const aiPrompt = `【系統·盟約撕毀·已裁定】御主『${pcData[pIdx][COL.PC.NAME]}』單方面撕毀與「${who || npcName}」的盟約，雙方重回敵對。\n` +
    `★以 Fate／TYPE-MOON 筆觸【約 80~130 字】演出背叛/決裂的一瞬間張力。`;
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// ⏳ 盟約自然瓦解：效期到 或 存活敵從者 ≤3（最後只能剩一個→強制翻臉）。回傳破裂的御主名單。
//   ⚡ 2026-07：preData 給了就在同一份陣列上原地改，不重讀；沒給(相容)才自己整表讀一次。
function breakStaleAlliances_(sheets, gameId, preData) {
  try {
    var data = preData || sheets.pc.getDataRange().getValues();
    var clk = getClock_(gameId, data); var day = clk ? clk.day : 1;
    var aliveFoes = 0;
    for (var i = 1; i < data.length; i++) { if (String(data[i][COL.PC.FACTION]) === "敵從者" && String(data[i][COL.PC.GAME_ID] || "") === gameId && !String(data[i][COL.PC.ID]).startsWith("DEAD_")) aliveFoes++; }
    var forceAll = aliveFoes <= 3;
    var broken = [], dirty = false;
    for (var j = 1; j < data.length; j++) {
      var fac = String(data[j][COL.PC.FACTION]);
      if ((fac === "敵御主" || fac === "敵從者") && String(data[j][COL.PC.GAME_ID] || "") === gameId && isAllied_(data[j])) {
        if (forceAll || day > allyUntil_(data[j])) {
          data[j][COL.PC.MEMORY] = clearAllyMem_(data[j][COL.PC.MEMORY]);
          dirty = true;
          if (fac === "敵御主") broken.push(String(data[j][COL.PC.NAME]));
        }
      }
    }
    // forceAll(終局逼近)時常一次瓦解多組同盟，MEMORY 整欄一次寫回(取代逐列 setValues 的零散往返)
    if (dirty) {
      var memCol = []; for (var z = 1; z < data.length; z++) memCol.push([data[z][COL.PC.MEMORY]]);
      sheets.pc.getRange(2, COL.PC.MEMORY + 1, memCol.length, 1).setValues(memCol);
    }
    return { broken: broken, forced: forceAll && broken.length > 0 };
  } catch (e) { return { broken: [], forced: false }; }
}

// 羈絆 +delta（寫在該 NPC 自己列的 BOND 欄；無互動過的盟友起步約 40），回傳新值
function bumpBond_(sheets, pcData, npcIdx, delta) {
  var v = Math.max(0, Math.min(100, (parseInt(pcData[npcIdx][COL.PC.BOND]) || 40) + delta));
  pcData[npcIdx][COL.PC.BOND] = v;
  sheets.pc.getRange(npcIdx + 1, COL.PC.BOND + 1).setValue(v);
  return v;
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
  const aIdx = pcData.findIndex(r => nameLoose_(r[COL.PC.NAME]).indexOf(nameLoose_(npcName)) !== -1 // 🔧 loose 比對·含中點名字不漏
    && (String(r[COL.PC.FACTION]) === "敵御主" || String(r[COL.PC.FACTION]) === "敵從者")
    && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_")
    && isAllied_(r) && String(r[COL.PC.LOC]).trim() === myLoc);
  if (aIdx === -1) return JSON.stringify({ success: false, message: "此地沒有可交流的盟友——須與盟友同處一地。" });

  const isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, message: "行動力不足以從容相處——請『休息』恢復後再來。" });

  const masterName = String(pcData[pIdx][COL.PC.NAME]);
  const allyName = String(pcData[aIdx][COL.PC.NAME]);
  const allyIsMaster = String(pcData[aIdx][COL.PC.FACTION]) === "敵御主";

  let ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(myGameId, 1).ap; clock = clockLabel_(myGameId); } catch (e) { } }

  // ⚔️ 卸防突襲：與盟友交流時門戶大開，同地若有「未結盟」敵從者→趁隙重擊我方從者
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, userData, 1.3);
  if (ambush) {
    const aiPromptA = ambush.homeRepel ? ambush.repelNote : ((ambush.foeCard || '') + `【系統·盟誼遭突襲·已裁定】御主『${masterName}』正與盟友「${allyName}」交心共處、卸下戒備之際，潛伏同地的敵從者「${ambush.enemyName}」${ambush.stealthy ? '自陰影中無聲撲出' : '抓住這破綻猛然殺到'}，一記重擊狠狠命中我方從者（−${ambush.dmg}）${ambush.destroyed ? '，其靈基當場崩潰、化作光點消散，御主敗北' : ''}。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫盟誼的私密一刻被突襲撕裂的驚變${ambush.destroyed ? '、從者消滅的痛楚（語氣留白）' : '、從者強撐重傷護主的瞬間'}。傷害與勝負已由系統結算。\n`);
    return JSON.stringify({ success: true, aiPrompt: aiPromptA, clock: clock, ap: ap, apMax: AP_PER_DAY, ambush: true, defeat: ambush.defeat, dreamPrompt: ambush.dreamPrompt || "", report: ambush.report || null, statusString: getFreshStatusString(pcId, pIdx, sheets) });
  }

  const gain = 6 + Math.floor(Math.random() * 6); // +6~11
  const after = bumpBond_(sheets, pcData, aIdx, gain);
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
  // 盟友從者→servantCard_(含狂化禁言等口吻)；盟友御主→enemyMasterCard_(性格/特徵/萌點反差)
  // ⚠ 2026-07 修：原本盟友御主是手刻的「性格：xxx」一行陽春卡(漏特徵/萌點)，跟同一角色在
  //   戰鬥交鋒(Router_Battle.gs)拿到的 enemyMasterCard_ 厚度不一致——結盟橋段反而比戰鬥時更扁平。
  const allyCard = allyIsMaster ? enemyMasterCard_(pcData[aIdx]) : servantCard_(pcData[aIdx]);
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
  // 🤝 盟友不可奪：與 actionFateBattle 同一道閘門(2026-07 修破戒奪僕漏擋盟友)——若要奪，須先撕毀盟約。
  if (isAllied_(pcData[nIdx])) {
    return JSON.stringify({ success: false, message: `「${pcData[nIdx][COL.PC.NAME]}」是你的盟友——若要奪僕，須先『撕毀盟約』。` });
  }
  const hp = parseInt(pcData[nIdx][COL.PC.HP]) || 0, hpMax = parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1;
  if (hp / hpMax >= 0.35) return JSON.stringify({ success: false, message: `「${pcData[nIdx][COL.PC.NAME]}」靈基仍旺（${Math.round(hp / hpMax * 100)}%），破戒奪僕無法奏效——須先在戰鬥中將其打殘至 35% 以下。` });

  const stolenName = String(pcData[nIdx][COL.PC.NAME]);
  pcData[nIdx][COL.PC.FACTION] = "從者";
  pcData[nIdx][COL.PC.HP] = Math.max(hp, Math.round(hpMax * 0.5));
  pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "契約重締", "姿勢": "屈膝聽令", "負面": "無", "顏面": "複雜而臣服" });
  pcData[nIdx][COL.PC.CONTRIB] = 0;
  // 🧹 清除敵屬時代殘留標記(2026-07 修)：舊主硬連結【御主】(殘留會誤觸 masterSynergy 全盛六圍/主從誤鏈)、
  //   【寶具預告】【盟約至】【靈基透支】(敵方機制·奪來後不再適用)。
  var _stMem = String(pcData[nIdx][COL.PC.MEMORY] || "")
    .replace(/｜?【御主】[^｜]+/g, "")
    .replace(/｜?【寶具預告】1/g, "")
    .replace(/｜?【盟約至】\d+/g, "")
    .replace(/｜?【靈基透支】\d+/g, "")
    .replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  pcData[nIdx][COL.PC.MEMORY] = _stMem + "｜【破戒奪取】契約已轉予新御主。";
  sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);
  seals -= 1;
  pcData[pIdx][COL.PC.MEMORY] = setPlayerSeals_(pcData[pIdx][COL.PC.MEMORY], seals);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  try { raiseBond_(sheets, pcData[pIdx][COL.PC.NAME], stolenName, 10); } catch (e) { }

  const aiPrompt = `【系統·破戒奪僕·已裁定】御主以破戒全咒（七彩短劍）斬斷「${stolenName}」與原御主的契約、強行重締為己用——「${stolenName}」自此成為你的第二從者（燃一道令咒，餘 ${seals} 道）。\n` +
    `★以 Fate／TYPE-MOON 筆觸描寫妖異七彩短劍刺入、舊契約如琉璃寸寸碎裂、新締約的魔力烙印纏上手背的瞬間，與這名從者被迫易主的複雜神情（一段即可）。已結算。\n` +
    ``;
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, stolen: stolenName, seals: seals, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// ⚔️ 卸防突襲：在同地有清醒敵從者時做「補魔／羈絆／休息」等卸下防備之舉，會招致敵從者趁隙重擊我方從者
//   （氣息遮斷／暗殺職階更致命）。回 null＝無敵不觸發；否則 {enemyName,dmg,defeat,dreamPrompt,after,stealthy}。
