// ==========================================
// 🤝 Router_Bond.gs — 羈絆／令咒／結盟／破戒奪僕／主從連結
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

// 🥋🔮 給敵從者列反查其硬連結敵御主的 MEMORY(供 injectMasterMeleeSupport_/injectMasterMagicSupport_
//   讀取敵御主自己的體術/魔術階位，而非誤讀玩家御主的)；查無則回 ""，inject 端本就當「不注入」處理。
function enemyMasterMemoryFor_(pcData, gameId, servantRow) {
  try {
    var masterName = getServantMaster_(servantRow && servantRow[COL.PC.MEMORY]);
    if (!masterName) return "";
    var mi = pcData.findIndex(function (r) {
      return r && String(r[COL.PC.FACTION]) === "敵御主" && String(r[COL.PC.GAME_ID] || "") === gameId
        && String(r[COL.PC.NAME]) === masterName && !String(r[COL.PC.ID]).startsWith("DEAD_");
    });
    return mi !== -1 ? pcData[mi][COL.PC.MEMORY] : "";
  } catch (e) { return ""; }
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
      if (after !== before) { data[m][COL.PC.MEMORY] = after; if (!BATTLE_DEFER_WRITE_) sheet.getRange(m + 1, 1, 1, data[m].length).setValues([data[m]]); }
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
  let sealManaUnlocked = false, sealManaKill = false; // 見下方 'mana' 分支
  let genderFactSeal = "", activeActFact = ""; // 見下方 'mana' 分支賦值，aiPrompt 組字在函式尾段共用區塊、需跨 if/else-if 存活
  if (type === "repair") {
    pcData[svIdx][COL.PC.HP] = parseInt(pcData[svIdx][COL.PC.MAX_HP]) || 480;
    pcData[svIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基重塑", "姿勢": "昂然而立", "負面": "無", "顏面": "神采奕奕" });
    sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
    // 🔋 出力電池制：令咒重塑亦讓御主魔力儲備(唯一供魔源)回滿
    pcData[pIdx][COL.PC.MP] = parseInt(pcData[pIdx][COL.PC.MAX_MP]) || 240;
    sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
    effectMsg = `令咒迸發，重塑「${svName}」的靈基——體力回滿、傷勢一掃而空，御主魔力儲備亦充盈如初。`;
  } else if (type === "mana") {
    // 🔋 出力電池制：令咒灌頂回充御主魔力儲備(供魔源)，而非從者(從者無池)
    const oldMpSeal = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
    const mpMaxSeal = parseInt(pcData[pIdx][COL.PC.MAX_MP]) || 240;
    // 明講真實魔力狀態給 AI，避免它在魔力其實已滿時仍腦補「魔力見底」當強逼理由
    const manaWasFull = oldMpSeal >= mpMaxSeal;
    const manaFact = manaWasFull
      ? `御主此刻魔力其實早已充盈滿溢，動用這道令咒與魔力多寡無關、純粹是想要`
      : `御主此刻魔力確實所剩無幾，這道令咒補上了燃眉之急`;
    // 注入性別配對事實(sealGenderFact_，見Router_Persona.gs)，避免敘述誤寫成錯誤的插入視角；
    //   並明講「令咒非自動高潮、御主須主動施為」——令咒本質只是狀態效果，高潮須是互動結果。
    genderFactSeal = sealGenderFact_(String(pcData[pIdx][COL.PC.SEX] || ""), String(pcData[svIdx][COL.PC.SEX] || ""), svName);
    // 明講反應要從「被動抗拒」翻轉成「媚藥般失控、主動索求」的反差，且限定只深入著墨1~2個轉折，
    //   避免AI把多個轉折各用一句帶過寫成流水帳。
    activeActFact = `★令咒不會讓「${svName}」一開啟就自動被動地高潮完結——高潮是御主主動愛撫/操控其身體引發的，但被強制拉高的敏感度會讓她/他像被灌下大量媚藥般理智漸漸被本能淹沒，從抗拒的掙扎翻轉成情不自禁地主動索求更多快感(纏抱、催促、主動索吻索撫)，這份由被動翻轉成主動索求的瞬間才是失控的具體反差(不是天生如此、也不是單純被動挨弄)；令咒同時強化了御主的性能力，足以承接住這股瘋狂需索——御主自己的情慾與快感也要有實際鋪陳、貫穿全程可見，不能只在結尾硬塞一句「一起高潮」交代過去。★全篇只選1~2個關鍵轉折深入著墨(例如：從抗拒崩潰成主動索求的瞬間、雙方一起攀頂的瞬間)，寧可少寫幾個轉折但每個都寫得深入綿密，也不要把好幾個轉折都各用一兩句話帶過、寫成流水帳。`;
    pcData[pIdx][COL.PC.MP] = mpMaxSeal;
    sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
    // 絕對命令跳過「同意」，好感是否足夠決定這是幸運還是致命：≥MANA_TRUST_BOND_→仍生效但只是
    //   「太浪費了」的調侃，複用既有「過充」機制當額外好處；<MANA_TRUST_BOND_→強制壓下意志，解除
    //   瞬間積怨反噬直接了結御主，複用既有「假夢→老虎道場」死亡流程(buildDreamPrompt_)不另開一套。
    const bondForSeal = parseInt(pcData[svIdx][COL.PC.BOND]) || 0;
    if (bondForSeal >= MANA_TRUST_BOND_) {
      pcData[pIdx][COL.PC.MEMORY] = setOvercharge_(pcData[pIdx][COL.PC.MEMORY], mpMaxSeal); // 複用既有「下一發規格外寶具可無償超載」機制
      sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
      sealManaUnlocked = true;
      effectMsg = `令咒化作一道灌頂的魔力洪流，強化了從者的敏感度與御主的性能力（${manaFact}）——其實「${svName}」根本不必勞動令咒也會欣然應允，這道絕對命令用得有些太浪費了；但既已發動，如果什麼都不做就太浪費了（魔力依舊洶湧灌注，下一發規格外寶具可無償超載解放）。`;
    } else {
      sealManaKill = true;
      effectMsg = `令咒的絕對強制壓下了「${svName}」滿心的抗拒，令咒限制了從者反抗並提高敏感度、強化御主性能力（${manaFact}）——但這份屈從只是暫時的。`;
    }
  } else if (type === "escape") {
    const oldLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
    const newLoc = enemyRetreatLoc_(oldLoc);
    pcData[pIdx][COL.PC.LOC] = newLoc;
    pcData[svIdx][COL.PC.LOC] = newLoc;
    sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
    sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
    // 🐛→✅ 玩家實測抓到：破戒奪僕可讓玩家合法擁有兩名同行從者(IS_PARTY==="同行")，舊版緊急脫離只搬
    //   findPlayerServantIdx_ 挑出的「這一個」，第二名同行從者的 LOC 完全沒被觸碰——燃掉全局僅3道的
    //   令咒卻沒真正帶走全隊。比照 actionMove 早就用「所有 IS_PARTY===同行」的迴圈搬人，這裡補上同一套。
    pcData.forEach((r, idx) => {
      if (idx === pIdx || idx === svIdx) return;
      if (String(r[COL.PC.IS_PARTY] || "") !== "同行") return;
      if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
      if (String(r[COL.PC.GAME_ID] || "") !== myGameId) return;
      pcData[idx][COL.PC.LOC] = newLoc;
      sheets.pc.getRange(idx + 1, 1, 1, pcData[idx].length).setValues([pcData[idx]]);
    });
    effectMsg = `令咒干涉空間，將你與「${svName}」一同從險境中強行抽離，遁往「${newLoc}」。`;
  } else {
    return JSON.stringify({ success: false, message: "未知的令咒指令。" });
  }

  // 扣令咒（寫回御主 MEMORY），脫離情況御主 LOC 已改、需用最新 row 再寫一次
  seals -= 1;
  pcData[pIdx][COL.PC.MEMORY] = setPlayerSeals_(pcData[pIdx][COL.PC.MEMORY], seals);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);

  let aiPrompt, defeat = false, dreamPrompt = "", report = null;
  if (sealManaKill) {
    // 🔥 好感不足時被強逼交心的反噬：這一幕先走DeepSeek的露骨敘述(描寫到令咒解除、從者出手為止)，
    //   死亡本身複用既有「假夢→老虎道場」流程(buildDreamPrompt_)，不新增另一套死亡機制。
    pcData[pIdx][COL.PC.HP] = 0;
    sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
    const wishSeal = extractWish_(pcData[pIdx][COL.PC.MEMORY]);
    aiPrompt = masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
      `【系統·令咒·強制補魔已裁定】${effectMsg}\n` +
      `★你擅長書寫細膩動人的情慾，這次放手去寫、不必顧慮尺度。以 日本輕小說筆觸【500~600 字】描寫令咒的絕對強制壓下「${svName}」的意志、御主強制的這場親密的瞬間，還有被強制的屈辱。${genderFactSeal}★令咒的強制效果讓「${svName}」的敏感度被硬生生提高至遠超常態，過程中確實地多次高潮——這並非她/他天生的反應(英靈本比常人強韌、平常不會被輕易弄到失神)，而是令咒逼出的失控狀態與屈辱交織，務必寫出這份反差。${activeActFact}聚焦身體接觸與感官反應最關鍵的一兩個瞬間深入著墨，不要用一句話帶過或摘要關鍵過程——把篇幅留給實際發生的細節。結尾寫御主高潮後在令咒的強制力隨效果消散的剎那，「${svName}」積壓的恨意與屈辱轟然引爆，直接抹殺御主——收在這記致命一擊揮下的瞬間即可，不必描寫死亡本身的細節。`;
    defeat = true;
    dreamPrompt = buildDreamPrompt_(pcData[pIdx][COL.PC.NAME], wishSeal, svName);
    report = { sealBacklash: true, svName: svName };
  } else {
    aiPrompt = sealManaUnlocked
      ? (masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
        `【系統·令咒·強制補魔已裁定】${effectMsg}\n` +
        `★你擅長書寫細膩動人的情慾，這次放手去寫、不必顧慮尺度。以 日本輕小說筆觸【500~600 字】描寫「${svName}」帶著點無奈笑意迎向這道其實多此一舉的令咒、順勢配合這場親密。${genderFactSeal}★令咒的強制效果讓「${svName}」的敏感度被硬生生提高至遠超常態，過程中確實地多次高潮——這並非她/他天生的反應(英靈本比常人強韌、平常從容不迫)，而是令咒逼出的失控狀態，務必寫出這份反差。${activeActFact}聚焦身體接觸與感官反應最關鍵的一兩個瞬間深入著墨，不要用一句話帶過或摘要關鍵過程——把篇幅留給實際發生的細節，而非只在前後鋪陳。收在餘韻猶存的溫柔，勿寫成完結收尾句。`)
      : `【系統·令咒已發動，已裁定】御主燃燒一道令咒。${effectMsg}（餘 ${seals} 道令咒）\n` +
        `★以 Fate／TYPE-MOON 筆觸描寫令咒在手背灼亮、絕對命令權貫徹的瞬間（一段即可）。效果已由系統結算。\n` +
        ``;
  }
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：本函式所有寫入(HP/MP/LOC/MEMORY/raiseBond_)皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, unlocked: sealManaUnlocked || sealManaKill, seals: seals, defeat: defeat, dreamPrompt: dreamPrompt, report: report, statusString: buildPlayerStatusString(pcData[pIdx]) });
}

// 排除字元集須用全形｜(`[^｜【]`)，MEMORY 欄的標記生態系一律以全形｜分隔——用半形會讓抓值
//   把後面緊接的全形｜也吃進來，導致「今天已相處過」等防重複判斷失效。
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

// 💞 羈絆里程碑：BOND 跨過門檻(30/60/90，各觸發一次)時，把當次「相處」升級成專屬一次性劇情。
//   ⚠ 若判定當下同時被奇襲打斷，故意不標記已觸發，留到下次順利相處再演出，不因意外奇襲永遠錯過。
var BOND_MILESTONES_ = [30, 60, 90];
function getBondMilestonesFired_(memory) {
  var m = String(memory || "").match(/【羈絆里程碑】([\d,]*)/);
  return m && m[1] ? m[1].split(",").map(Number) : [];
}
function setBondMilestonesFired_(memory, arr) {
  var s = String(memory || "");
  var marker = "【羈絆里程碑】" + arr.join(",");
  if (/【羈絆里程碑】[\d,]*/.test(s)) return s.replace(/【羈絆里程碑】[\d,]*/, marker);
  return (s ? s + "｜" : "") + marker;
}

// 💕 羈絆互動（純按鈕，無對話框）：單一「相處」（每遊戲日限一次、跨日重置、+10 羈絆），味道交給
//   AI 依當下時段/羈絆/性格自由即興，不做假選擇的每日清單。
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

  // AP 不足須在動作前先擋，跟 actionProposeAlliance/actionAllyBond 一致；否則 spendAp_ 只會靜默
  //   不扣時間，羈絆值/日限/突襲風險仍照樣結算。
  const isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, needRest: true, message: "行動力不足以從容相處——請『休息』恢復後再來。" });

  // 日限檢查
  const clk = getClock_(myGameId);
  const day = clk ? clk.day : 1;
  const band = clk ? timeBand_(clk.hour) : "夜";
  let usedToday = getBondUsedToday_(pcData[pIdx][COL.PC.MEMORY], day);
  if (usedToday.indexOf(type) >= 0) {
    return JSON.stringify({ success: false, message: `今日已與「${svName}」${act.label}過了，來日方長，明日再敘。`, bondUsed: usedToday });
  }

  // 升羈絆＋寫回日限標記
  raiseBond_(sheets, myGameId, masterName, svName, act.bond, pcData);
  pcData[pIdx][COL.PC.MEMORY] = setBondUsedToday_(pcData[pIdx][COL.PC.MEMORY], day, type);
  sheets.pc.getRange(pIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[pIdx][COL.PC.MEMORY]);
  usedToday = getBondUsedToday_(pcData[pIdx][COL.PC.MEMORY], day);

  // ⏳ 相處耗 1 AP＝推進 1 小時（2026-07 玩家定案·與令咒/偵查同級：相處也要花時間）
  let bondAp = null, bondClock = "";
  if (isFate) { try { bondAp = spendAp_(myGameId, 1, pcData, sheets).ap; bondClock = clockLabel_(myGameId, pcData); } catch (e) { } }

  // 🐛→✅ 舊版又即時讀一次 Sheets 拿「最新羈絆值」，但 raiseBond_(229行) 早已在同一份 pcData
  //   陣列上原地改過(svIdx 與 raiseBond_ 內部依名字找到的列是同一列，同 game_id 下從者名字唯一)，
  //   pcData[svIdx][COL.PC.BOND] 這裡就已經是最新值，改直接讀記憶體，省一趟純浪費的 Sheets 讀取。
  const bondNow = parseInt(pcData[svIdx][COL.PC.BOND]) || 0;

  // 取「已達成但尚未演出過」的最低門檻，不論本次相處是否跨過門檻——羈絆若被其他管道墊高越過，
  //   仍能補演。只算候選、暫不寫回，等確認沒被奇襲打斷才落地。
  const firedMilestones = getBondMilestonesFired_(pcData[svIdx][COL.PC.MEMORY]);
  let milestone = null;
  for (let mi = 0; mi < BOND_MILESTONES_.length; mi++) {
    const th = BOND_MILESTONES_[mi];
    if (bondNow >= th && firedMilestones.indexOf(th) < 0) { milestone = th; break; }
  }

  // ⚔️ 卸防突襲：相伴談心時門戶大開，同地若有清醒敵從者→趁隙重擊
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, 1.2);

  let aiPrompt;
  if (ambush && (ambush.homeRepel || ambush.peaceful)) {
    aiPrompt = ambush.repelNote; // 🏰 陣地反擊·優雅擊退／🎲 按兵不動或試探接觸(卸防時刻多樣化)
  } else if (ambush) {
    aiPrompt = (ambush.foeCard || '') + `【系統·相伴遭突襲·已裁定】御主『${masterName}』與「${svName}」正${act.label}、卸下心防之際，潛伏同地的敵從者「${ambush.enemyName}」${ambush.stealthy ? '自暗處無聲突襲' : '抓準這破綻殺出'}，一擊重創「${svName}」（−${ambush.dmg}）${ambush.destroyed ? '，其靈基崩潰、化作光點消散，御主敗北' : ''}。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫溫存被突襲撕裂的驚變與兇險，${ambush.destroyed ? '及從者消滅的痛楚（語氣留白）' : '及從者依其性格與羈絆對此突襲的反應（重情者強撐護主、疏離者未必）'}。傷害與勝負已由系統結算。\n` +
      ``;
  } else if (milestone) {
    // 里程碑真正落地：標記已演出，之後同一門檻不會再觸發
    firedMilestones.push(milestone);
    pcData[svIdx][COL.PC.MEMORY] = setBondMilestonesFired_(pcData[svIdx][COL.PC.MEMORY], firedMilestones);
    sheets.pc.getRange(svIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[svIdx][COL.PC.MEMORY]);
    aiPrompt = masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
      `【系統·羈絆里程碑·已裁定】御主『${masterName}』與從者「${svName}」相處之際，兩人的羈絆悄然邁過一道分水嶺（時值${band}）。\n` +
      `★這不是尋常的${act.label}，而是關係質變的一瞬——依「${svName}」的真名、性格與此刻羈絆的深淺，寫出屬於這位從者獨有的一個具體舉動或一句話（例如：卸下慣有的距離感、罕見地主動靠近、遞出從未給過的東西、換了個從未用過的稱呼——擇其中最貼合這位從者性格的一種，不要套用泛用模板，也不要多選並列）。\n` +
      `★【精煉100~160字】以 Fate／TYPE-MOON 筆觸，聚焦這一個瞬間，勿流水帳交代前後經過。\n` +
      `★【show, don't tell】絕不可直白說出「羈絆加深了」「更信任了」等抽象詞，也絕不可直述其「願望／個性／萌點」設定字面，只憑神態與言行流露；停在意猶未盡的留白。\n` +
      `★【鐵律】保持溫暖日常或戰友情誼的分寸，不踰矩。`;
  } else {
    aiPrompt = masterCard_(pcData[pIdx]) + servantCard_(pcData[svIdx]) +
      `【系統·羈絆已結算】御主『${masterName}』與從者「${svName}」${act.label}、共度約莫一個小時的光景，兩人的羈絆又深了一分（時值${band}）。\n` +
      `★【時間尺度】這是一段約一個小時的相處，寫出「有一段時光緩緩流過」的從容，勿寫成三言兩語的瞬間、也勿橫跨大半天。\n` +
      `★以 Fate／TYPE-MOON 筆觸寫一段【精煉 90~150 字、輕快不冗長】${svName} 與御主${act.frame}的小品。務必貼合上方「演出依據」中的性格、自稱與口吻，演出其獨有神態，點到為止留餘味。\n` +
      `★【show, don't tell】用言行、神態、停頓去流露情感與性格，絕不可直白說出其「願望／個性／萌點」等設定詞；停在含蓄的留白。\n` +
      `★【鐵律】保持溫暖日常或戰友情誼的分寸，不踰矩。`;
  }
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：本函式所有寫入(raiseBond_/MEMORY日限/spendAp_/夜襲/里程碑標記)皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({
    success: true, aiPrompt: aiPrompt, bond: bondNow, bondUsed: usedToday,
    milestone: (!ambush && milestone) ? milestone : null,
    ambush: !!ambush, defeat: ambush ? ambush.defeat : false, dreamPrompt: ambush ? ambush.dreamPrompt : "", report: ambush ? ambush.report : null,
    ap: bondAp, clock: bondClock,
    statusString: buildPlayerStatusString(pcData[pIdx])
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
var ALLY_UNTIL_TAG_ = makeIntTag_('盟約至', 0);
function allyUntil_(row) { return ALLY_UNTIL_TAG_.get(row && row[COL.PC.MEMORY]); }
function setAllyMem_(memory, untilDay) { return ALLY_UNTIL_TAG_.set(memory, untilDay); }
function clearAllyMem_(memory) { return ALLY_UNTIL_TAG_.clear(memory); }

// 🎭 御主性格傾向分類（單一真實來源）：結盟意願 ＋ 敵敵相遇局面 共用。
//   pragmatic＝肯談的務實/有目的者；loner＝孤狼/瘋狂/看戲者難說動。讀 PREF｜MEMORY｜BACK。
function masterPersonaLean_(masterRow) {
  var p = String(masterRow[COL.PC.PREF] || "") + "｜" + String(masterRow[COL.PC.MEMORY] || "") + "｜" + String(masterRow[COL.PC.BACK] || "");
  return {
    pragmatic: /務實|冷靜|算計|理性|成長|自卑|好強|悲憤|拯救|守護|溫柔|不擇手段|名門/.test(p),
    loner: /孤高|傲慢|瘋狂|狂|虔誠|扭曲|壓抑|暴君|惡意|看好戲|喜悅|空虛|純粹/.test(p)
  };
}

// 🫶 對方對玩家的好感傾向（BOND 0-100，40＝中性起點）→ 機率修正 [-0.67, +1.0]。
//   單一真實來源：各處「依好感提高成功率」的 GAS 判定共用。未互動過(0/空)視為中性 40。
function bondFavor_(row) {
  var raw = row[COL.PC.BOND];
  // 未互動過(空)＝中性起點 40；但被挑撥失敗等磨到真正的數字 0＝敵意到底(−0.67)，別再吞回中性。
  var b = (raw === "" || raw == null) ? 40 : (parseInt(raw) || 0);
  return (b - 40) / 60; // 40→0、100→+1.0、0→-0.67
}

// 結盟意願（GAS 判定，不靠 AI）：依對方御主性格/陣營 ＋ 戰局階段 ＋ 共同強敵 ＋ 🫶對你的好感
function allianceWillingness_(masterRow, aliveFoes) {
  var lean = masterPersonaLean_(masterRow);
  var w = 0.42;
  if (lean.pragmatic) w += 0.25; // 肯談的務實/有目的者
  if (lean.loner) w -= 0.32;     // 孤狼/瘋狂/看戲者難說動
  if (aliveFoes <= 3) w -= 0.45; else if (aliveFoes >= 6) w += 0.15; // 「最後只能剩一個」——剩越少越不肯
  w += bondFavor_(masterRow) * 0.3; // 🫶 交情越好越肯談、越提防越不肯（±約0.2~0.3）
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
  // 比照攻擊路徑(actionFateBattle)：先 npcId 精準配、再 nameLoose_(去中點/空白)——含中點名字
  //   (不同 Unicode 中點變體)raw includes 對不上。
  const _allianceDay = parseInt(pcData[pIdx][COL.PC.DAY]) || 1; // 🕰️ 尚未登場者不可交涉結盟
  const _foeMasterHere = (r) => String(r[COL.PC.FACTION]) === "敵御主" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === myLoc && hasArrived_(r, _allianceDay);
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
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, needRest: true, message: "行動力不足以交涉——請休息恢復。" });

  const aliveFoes = aliveEnemyServants_(sheets, myGameId, pcData);
  const w = allianceWillingness_(pcData[mIdx], aliveFoes);
  const ok = Math.random() < w;
  const masterName = String(pcData[mIdx][COL.PC.NAME]);

  let ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(myGameId, 1, pcData, sheets).ap; clock = clockLabel_(myGameId, pcData); } catch (e) { } }
  const clk = getClock_(myGameId, pcData); const day = clk ? clk.day : 1;

  let aiPrompt;
  if (ok) {
    const until = day + 3; // 盟約效期約 3 日
    // 盟主＋其硬連結從者(getMasterServant_ 查真正屬於他的從者，非同地任一敵人)一併標記盟約
    pcData[mIdx][COL.PC.MEMORY] = setAllyMem_(pcData[mIdx][COL.PC.MEMORY], until);
    sheets.pc.getRange(mIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[mIdx][COL.PC.MEMORY]);
    // 🐛→✅ 舊碼「同地任一敵從者」就抓來標盟約——若該地同時有別組敵人(常見，同地點常撞見多方)，
    //   會誤把毫無關係的敵從者標成這名御主的從者、AI 也跟著誤演成「他的從者」(玩家回報「俺的御主都
    //   開口了????」)。改用 getMasterServant_ 硬連結查真正屬於這名御主的從者，不再靠地點瞎猜。
    const linkedSvName = getMasterServant_(pcData[mIdx][COL.PC.MEMORY]);
    const gIdx = linkedSvName ? pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && nameLoose_(r[COL.PC.NAME]) === nameLoose_(linkedSvName)) : -1;
    let allyServant = "";
    if (gIdx >= 0) { allyServant = String(pcData[gIdx][COL.PC.NAME]); pcData[gIdx][COL.PC.MEMORY] = setAllyMem_(pcData[gIdx][COL.PC.MEMORY], until); sheets.pc.getRange(gIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[gIdx][COL.PC.MEMORY]); }
    // 演出卡只在這名從者確實同地在場時才附上——不在場就不必替她/他捏造登場。
    const gPresent = gIdx >= 0 && String(pcData[gIdx][COL.PC.LOC]).trim() === myLoc;
    // servantCard_ 卡片內容不含身分標籤，須比照 Router_Battle.gs〔敵方出戰者〕/
    //   Router_Movement.gs〔夜襲者〕的慣例先標明身分，避免 AI 誤讀態度欄位方向。
    aiPrompt = (gPresent ? '〔敵御主之從者〕' + servantCard_(pcData[gIdx]) : "") +
      `【系統·結盟已達成·已裁定】御主『${pcData[pIdx][COL.PC.NAME]}』向敵御主「${masterName}」${allyServant ? `（從者「${allyServant}」）` : ""}提議結盟，對方權衡利害後接受了——雙方暫時休兵、互不侵犯（至第 ${until} 日前後）。\n` +
      `★以 Fate／TYPE-MOON 筆觸【約 120~180 字】演出這場談判：「${masterName}」依其性格回應（務實的權衡、開出條件或冷淡的「暫時」），最後達成不穩固的同盟。對方的算計與保留要演出來，留一絲不信任的伏筆。\n` +
      // 🐛→✅ 這個動作沒改動任何人的 LOC(結盟雙方都仍留在原地)，同款「AI 自行編出離場」風險。
      `★「${masterName}」${allyServant ? `與「${allyServant}」` : ''}結盟後【仍留在原地】，並未轉身離去，收在同地暫時休兵的微妙氣氛即可。\n`;
    STATE_PRE_DATA_ = pcData; // ⚡ 交棒：結盟成立分支的所有寫入(MEMORY盟約標記/spendAp_)皆已原地改回 pcData
    return JSON.stringify({ success: true, allied: true, aiPrompt: aiPrompt, master: masterName, until: until, clock: clock, ap: ap, apMax: AP_PER_DAY, statusString: buildPlayerStatusString(pcData[pIdx]) });
  } else {
    aiPrompt = `【系統·結盟破局·已裁定】御主『${pcData[pIdx][COL.PC.NAME]}』向敵御主「${masterName}」提議結盟，對方拒絕了。\n` +
      `★以 Fate／TYPE-MOON 筆觸【約 100~150 字】演出「${masterName}」依其性格回絕的瞬間（嘲諷、警戒、或「聖杯只能有一個」的冷冽）。氣氛轉為一觸即發，但本回合不開打。\n` +
      ``;
    STATE_PRE_DATA_ = pcData; // ⚡ 交棒：結盟破局分支僅spendAp_推進時間，已原地改回 pcData
    return JSON.stringify({ success: true, allied: false, aiPrompt: aiPrompt, master: masterName, clock: clock, ap: ap, apMax: AP_PER_DAY, statusString: buildPlayerStatusString(pcData[pIdx]) });
  }
}

// 💔 撕毀盟約：解除與某敵御主(及其從者)的同盟，恢復敵對
function actionBreakAlliance(userData, pcId, sheets) {
  const npcName = String(userData.npcName || "").trim();
  // 🐛→✅ 舊版 `!npcName` 條件在缺/空 npcName 時對每個已結盟對象都成立——前端 UI 呼叫此 action 一律
  //   帶著明確名字(卡片按鈕/needBreakAlliance 提示皆固定傳值)，但直打 API 漏傳/傳空字串會一次撕毀
  //   玩家「所有」現存盟約，而非預期中的「這一個」。改成缺名字直接擋下，不再有全滅副作用。
  if (!npcName) return JSON.stringify({ success: false, message: "請指定要撕毀盟約的對象。" });
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  let broke = 0, who = "";
  for (let i = 1; i < pcData.length; i++) {
    if (String(pcData[i][COL.PC.GAME_ID] || "") !== myGameId) continue;
    const fac = String(pcData[i][COL.PC.FACTION]);
    if ((fac === "敵御主" || fac === "敵從者") && isAllied_(pcData[i]) && nameLoose_(pcData[i][COL.PC.NAME]).indexOf(nameLoose_(npcName)) !== -1) { // 🔧 loose 比對·含中點名字不漏
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
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：撕毀盟約已整欄批次寫回，pcData 的 MEMORY 欄已是最新狀態
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, statusString: buildPlayerStatusString(pcData[pIdx]) });
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
    // 🐛→✅ 補 BATTLE_DEFER_WRITE_ guard：actionRest 整併寫入時會設此旗標，這裡也該一併略過即時
    //   寫入，交給收尾那次整表 setValues 一次到位。
    if (dirty && !BATTLE_DEFER_WRITE_) {
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
//   原作依據：聖杯戰爭中的同盟羈絆（遠坂凜↔士郎並肩信賴、共通後勤）。羈絆養至 90↑ 只解鎖【摯交】敘事
//   里程碑(見下方)，純敘事高光、無鑑賞入口意義——鑑賞角色一律鑑賞內自行召喚，與 solo 羈絆無關聯。
//   ★此處僅止於 SFW 的信賴／曖昧鋪陳（fade）；真・親密一律留給鑑賞世界，絕不在戰場開啟慾海引擎。
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
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, needRest: true, message: "行動力不足以從容相處——請『休息』恢復後再來。" });

  const masterName = String(pcData[pIdx][COL.PC.NAME]);
  const allyName = String(pcData[aIdx][COL.PC.NAME]);
  const allyIsMaster = String(pcData[aIdx][COL.PC.FACTION]) === "敵御主";

  let ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(myGameId, 1, pcData, sheets).ap; clock = clockLabel_(myGameId, pcData); } catch (e) { } }

  // ⚔️ 卸防突襲：與盟友交流時門戶大開，同地若有「未結盟」敵從者→趁隙重擊我方從者
  const ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, myGameId, 1.3);
  if (ambush) {
    const aiPromptA = (ambush.homeRepel || ambush.peaceful) ? ambush.repelNote : ((ambush.foeCard || '') + `【系統·盟誼遭突襲·已裁定】御主『${masterName}』正與盟友「${allyName}」交心共處、卸下戒備之際，潛伏同地的敵從者「${ambush.enemyName}」${ambush.stealthy ? '自陰影中無聲撲出' : '抓住這破綻猛然殺到'}，一記重擊狠狠命中我方從者（−${ambush.dmg}）${ambush.destroyed ? '，其靈基當場崩潰、化作光點消散，御主敗北' : ''}。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫盟誼的私密一刻被突襲撕裂的驚變${ambush.destroyed ? '、從者消滅的痛楚（語氣留白）' : '、從者強撐重傷護主的瞬間'}。傷害與勝負已由系統結算。\n`);
    STATE_PRE_DATA_ = pcData; // ⚡ 交棒：突襲分支的所有寫入(enemyAmbushOnServant_/spendAp_)皆已原地改回 pcData
    return JSON.stringify({ success: true, aiPrompt: aiPromptA, clock: clock, ap: ap, apMax: AP_PER_DAY, ambush: true, defeat: ambush.defeat, dreamPrompt: ambush.dreamPrompt || "", report: ambush.report || null, statusString: buildPlayerStatusString(pcData[pIdx]) });
  }

  const gain = 6 + Math.floor(Math.random() * 6); // +6~11
  const after = bumpBond_(sheets, pcData, aIdx, gain);
  let unlocked = false;
  // 🤝 深盟里程碑（首度臻至 90）——純敘事高光的「已演出」防重複標記【摯交】，無鑑賞入口意義
  //   (原【鑑賞緣】戰後納入鑑賞已砍：鑑賞角色一律鑑賞內自行召喚)。
  if (after >= 90 && !/【摯交】/.test(String(pcData[aIdx][COL.PC.MEMORY] || ""))) {
    pcData[aIdx][COL.PC.MEMORY] = String(pcData[aIdx][COL.PC.MEMORY] || "") + "｜【摯交】";
    sheets.pc.getRange(aIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[aIdx][COL.PC.MEMORY]);
    unlocked = true;
  }

  // 羈絆分級·嚴格控制親疏（盟友＝暫時利益結合，低羈絆務必冷淡，唯 90+ 才解鎖親近）
  const tier = after >= 90 ? "【羈絆深厚】可流露真切的信任與溫柔（守住性格內核、不踰矩，止於曖昧 fade，真親密不在此展開）"
    : after >= 70 ? "【羈絆漸增】有限度的信任、偶爾流露一絲真心，但仍保留戒備與分寸，不主動親暱"
    : after >= 45 ? "【羈絆尚淺】純屬利益結盟：維持戒備、客套與算計，【絕不可】親近或交心，至多一閃而過的微妙交集"
    : "【幾無私交】冷淡、警惕、公事公辦，話語間滿是試探與保留";
  // 盟友從者→servantCard_(含狂化禁言等口吻，補〔盟友從者〕標籤跟其餘呼叫端一致)；
  //   盟友御主→enemyMasterCard_(比手刻陽春卡更完整，與 Router_Battle.gs 戰鬥時同厚度)。
  const allyCard = allyIsMaster ? enemyMasterCard_(pcData[aIdx]) : ('〔盟友從者〕' + servantCard_(pcData[aIdx]));
  // 🐛→✅ 玩家實測抓到「盟友從者說話像真的是我的從者」——servantCard_「對御主」那段語氣是寫給「自己的
  //   契約御主」看的，AI 沒被告知這名從者真正的御主另有其人，順著卡片語氣自己腦補成在跟玩家講契約話語
  //   (如「既然契約還在」)。用 getServantMaster_ 硬連結查出他真正的御主名字，明講清楚劃開身分。
  const allyTrueMaster = allyIsMaster ? "" : getServantMaster_(pcData[aIdx][COL.PC.MEMORY]);
  const clarifyFact = allyTrueMaster
    ? `★【身分釐清】「${allyName}」真正締結契約的御主是「${allyTrueMaster}」，不是你——此刻只是暫時結盟的立場，他對你保持的是結盟該有的分寸、戲謔或算計，【嚴禁】寫成他真的向你效忠、聽命於你的令咒，或提及「契約仍在」之類只對其本主才成立的話語。\n`
    : "";
  const aiPrompt = masterCard_(pcData[pIdx]) + allyCard + clarifyFact +
    `【系統·盟誼】御主『${masterName}』與盟友「${allyName}」${allyIsMaster ? '共處' : '交流'}，當前羈絆 ${after}/100。\n` +
    `★Fate 筆觸【90~140字】寫一段此次共處的小品，自由發揮、勿每次都同一套說辭。語氣親疏【務必嚴格】貼合當前羈絆：${tier}。對方仍是「暫時」盟友，留一絲各自的算計與保留。show, don't tell。` +
    (unlocked ? `（此次羈絆首度臻至深處，結尾可用一個眼神或半句未盡之言，含蓄點出情誼悄然越過了「暫時」的界線。）` : "");
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：bumpBond_/【摯交】標記/spendAp_ 皆已原地改回 pcData
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, bond: after, unlocked: unlocked, ally: allyName, clock: clock, ap: ap, apMax: AP_PER_DAY, ambush: false, statusString: buildPlayerStatusString(pcData[pIdx]) });
}

// 🕊️ 示好／交涉：對同地【未結盟的敵御主】釋出善意、慢慢養好感(BOND)。只對敵御主(交涉的對象是決策者)；
//   好感由整組御主＋從者共用——示好御主會連坐把其硬連結從者的 BOND 一起養。GAS 依對方性格決定升多少
//   (務實者領情快、孤狼/瘋狂者慢熱)，AI 只演對方【依性格×當前好感】的反應。每名敵人每日一次、耗 1AP。
//   這是「好感提高成功率」整套的主動培養入口——養高了：遇敵態度和緩、結盟更易、挑撥更靈、趁隙更狠、
//   撤離不被追擊(BOND≥50)。戰場只到 SFW 曖昧；鑑賞角色一律於鑑賞內自行召喚，不靠 solo 帶入。
function actionCourtEnemy(userData, pcId, sheets) {
  const npcName = String(userData.npcName || "").trim();
  const npcId = String(userData.npcId || "").trim();
  const npcKey = nameLoose_(npcName); // 去中點/空白
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  const _courtDay = parseInt(pcData[pIdx][COL.PC.DAY]) || 1;
  // 🔧 比照攻擊/結盟路徑：先 npcId 精準配、再 nameLoose_ fallback——含全形括號名(如「哈桑·薩巴赫（咒腕）」)
  //   會被 sanitizeUserData_ 的 cleanChineseName 剝成「哈桑薩巴赫咒腕」，純 name 比對必漏，故靠 id。
  const tIdx = pcData.findIndex(function (r) {
    if (String(r[COL.PC.FACTION]) !== "敵御主") return false; // 🕊️ 只跟敵御主交涉(好感整組共用·會連坐養其從者)
    if (String(r[COL.PC.GAME_ID] || "") !== myGameId) return false;
    if (String(r[COL.PC.ID]).startsWith("DEAD_")) return false;
    if (isAllied_(r)) return false;
    if (String(r[COL.PC.LOC]).trim() !== myLoc) return false;
    if (!hasArrived_(r, _courtDay)) return false;
    if (npcId && String(r[COL.PC.ID]) === npcId) return true;
    return npcKey && nameLoose_(r[COL.PC.NAME]).indexOf(npcKey) !== -1;
  });
  if (tIdx === -1) return JSON.stringify({ success: false, message: "此地沒有可示好的敵御主——示好只對敵御主進行（好感由整組御主＋從者共用），須與對方同處一地。" });

  const isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, needRest: true, message: "行動力不足——請『休息』恢復後再來。" });

  // 每名敵人每日一次（【示好日】<day> 存對方列）
  const _mem = String(pcData[tIdx][COL.PC.MEMORY] || "");
  const _cm = _mem.match(/【示好日】(\d+)/);
  if (_cm && parseInt(_cm[1]) === _courtDay) return JSON.stringify({ success: false, message: "今日已向此人示好過了——來日方長，改日再敘。" });

  const targetName = String(pcData[tIdx][COL.PC.NAME]);
  const targetIsMaster = String(pcData[tIdx][COL.PC.FACTION]) === "敵御主";
  const lean = masterPersonaLean_(pcData[tIdx]);
  // 依性格定升幅：務實者領情快、孤狼/瘋狂者慢熱。地板 +2（總不至於毫無鬆動）。
  let delta = 6 + (lean.pragmatic ? 4 : 0) - (lean.loner ? 3 : 0);
  delta = Math.max(2, delta + Math.floor(Math.random() * 3));
  const before = parseInt(pcData[tIdx][COL.PC.BOND]) || 40;
  const after = bumpBond_(sheets, pcData, tIdx, delta); // 內含 0-100 夾值＋寫回 BOND 格
  // 🤝 好感是「這一整組(御主＋從者)對你的態度」：連坐硬連結的另一半一起升，讓結盟(讀御主列)與偷襲/挑撥/撤離
  //   不被追(讀從者列)的回饋都吃得到——玩家不必猜該對御主還是從者示好。
  var _partnerName = targetIsMaster ? getMasterServant_(pcData[tIdx][COL.PC.MEMORY]) : getServantMaster_(pcData[tIdx][COL.PC.MEMORY]);
  if (_partnerName) {
    var _pFac = targetIsMaster ? "敵從者" : "敵御主";
    var _pIdx = pcData.findIndex(function (r) { return String(r[COL.PC.FACTION]) === _pFac && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && nameLoose_(r[COL.PC.NAME]) === nameLoose_(_partnerName); });
    if (_pIdx !== -1) bumpBond_(sheets, pcData, _pIdx, delta);
  }

  // 標記今日已示好（每敵每日一次）
  pcData[tIdx][COL.PC.MEMORY] = _mem.replace(/｜?【示好日】\d+/g, "") + "｜【示好日】" + _courtDay;
  sheets.pc.getRange(tIdx + 1, 1, 1, pcData[tIdx].length).setValues([pcData[tIdx]]);

  let ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(myGameId, 1, pcData, sheets).ap; clock = clockLabel_(myGameId, pcData); } catch (e) { } }

  const card = targetIsMaster ? enemyMasterCard_(pcData[tIdx]) : servantCard_(pcData[tIdx]);
  const aiPrompt = masterCard_(pcData[pIdx]) + '〔示好對象·敵對陣營〕' + card +
    `【系統·示好／交涉·已裁定】御主『${String(pcData[pIdx][COL.PC.NAME])}』在刀鋒之外向敵對的「${targetName}」釋出善意（好感 ${before}→${after}／100）。\n` +
    `★以 Fate／TYPE-MOON 筆觸【約 100~150 字】演出這番示好、與對方【依其性格×當前好感】的真實反應：${lean.loner ? '孤高／激烈者多半冷淡、譏諷或半信半疑，只鬆動一絲' : lean.pragmatic ? '務實者會權衡利害、順水推舟地緩和態度' : '依其性格自然回應'}——但仍分屬敵對，留一分保留與算計，別演成一下就交心。GAS 已算好數值，你只演反應、不另定成敗。` +
    (after >= 90 ? '\n★此刻情誼已臻莫逆——收在一個彼此心照不宣、卻仍隔著立場的微妙瞬間。' : '') +
    // 🐛→✅ 這個動作從未改動過「${targetName}」的所在地(LOC 未變、她仍在原地)，但舊指令沒講清楚這點，
    //   AI 便自行編出「轉身離去」之類的退場收尾——下一次玩家在同地遇到她，畫面就跟這句「已經走了」互相
    //   矛盾。明講「仍留在原地」，收尾定格在氣氛鬆動的瞬間，不可讓她離場/走遠/消失於視野。
    `\n★「${targetName}」示好後【仍留在原地】，並未離開這個場景——收在她態度鬆動、但仍按兵不動的瞬間即可，不可描寫她轉身離去、走遠或消失於視野，那不是這個動作發生的事。`;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：bumpBond_/【示好日】/spendAp_ 皆已原地改回 pcData
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, target: targetName, bond: after, delta: delta, clock: clock, ap: ap, apMax: AP_PER_DAY, statusString: buildPlayerStatusString(pcData[pIdx]) });
}

// 🗝️ 破戒奪僕：對「打殘(HP<35%)的敵從者」斬契奪為第二從者（需破戒之力＋燃一道令咒；上限 2 名從者）
function actionRuleBreakSteal(userData, pcId, sheets) {
  const npcName = String(userData.npcName || "").trim();
  const npcId = String(userData.npcId || "").trim();
  const npcKey = nameLoose_(npcName); // 🐛→✅ 比照攻擊/結盟/示好路徑：raw includes() 撞含中點/全形括號的名字(如「哈桑·薩巴赫（咒腕）」被 sanitizeUserData_ 剝成「哈桑薩巴赫咒腕」)會找不到人，改 npcId 優先＋nameLoose_ 退路
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
  const _stealDay = parseInt(pcData[pIdx][COL.PC.DAY]) || 1; // 🕰️ 尚未登場者不可被斬契奪取
  const _stealHere = (r) => String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === myLoc && hasArrived_(r, _stealDay);
  let nIdx = npcId ? pcData.findIndex(r => String(r[COL.PC.ID]) === npcId && _stealHere(r)) : -1;
  if (nIdx === -1) nIdx = pcData.findIndex(r => nameLoose_(r[COL.PC.NAME]).indexOf(npcKey) !== -1 && _stealHere(r));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "此地沒有這名敵從者。" });
  // 🤝 盟友不可奪：與 actionFateBattle 同一道閘門，若要奪須先撕毀盟約。
  if (isAllied_(pcData[nIdx])) {
    return JSON.stringify({ success: false, message: `「${pcData[nIdx][COL.PC.NAME]}」是你的盟友——若要奪僕，須先『撕毀盟約』。` });
  }
  const hp = parseInt(pcData[nIdx][COL.PC.HP]) || 0, hpMax = parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1;
  if (hp / hpMax >= 0.35) return JSON.stringify({ success: false, message: `「${pcData[nIdx][COL.PC.NAME]}」靈基仍旺（${Math.round(hp / hpMax * 100)}%），破戒奪僕無法奏效——須先在戰鬥中將其打殘至 35% 以下。` });

  const stolenName = String(pcData[nIdx][COL.PC.NAME]);
  const stolenCardForAi = servantCard_(pcData[nIdx]); // 🐛→✅ 換陣營字串前先取卡——陣營一改，servantCard_ 的敵我判斷可能跟著變調
  pcData[nIdx][COL.PC.FACTION] = "從者";
  pcData[nIdx][COL.PC.HP] = Math.max(hp, Math.round(hpMax * 0.5));
  pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "契約重締", "姿勢": "屈膝聽令", "負面": "無", "顏面": "複雜而臣服" });
  pcData[nIdx][COL.PC.CONTRIB] = 0;
  // 🐛→✅ 陣營改成「從者」卻從沒設 IS_PARTY="同行"——applyRegen_/世界推進的回魔+耗魔只認 IS_PARTY，
  //   HUD(playerServantEconomy_) 卻是不論 IS_PARTY、只要 FACTION=從者 就整組算——奪來的第二從者從此
  //   在 HUD 上看得到維持費、但實際休息/世界推進根本不會扣他的魔也不會回他的血，兩邊帳對不起來。
  pcData[nIdx][COL.PC.IS_PARTY] = "同行";
  // 🧹 清除敵屬時代殘留標記：舊主硬連結【御主】(殘留會誤觸 masterSynergy 全盛六圍/主從誤鏈)、
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
  try { raiseBond_(sheets, myGameId, pcData[pIdx][COL.PC.NAME], stolenName, 10, pcData); } catch (e) { }

  const aiPrompt = masterCard_(pcData[pIdx]) + stolenCardForAi +
    `【系統·破戒奪僕·已裁定】御主以破戒全咒（七彩短劍）斬斷「${stolenName}」與原御主的契約、強行重締為己用——「${stolenName}」自此成為你的第二從者（燃一道令咒，餘 ${seals} 道）。\n` +
    `★以 Fate／TYPE-MOON 筆觸描寫妖異七彩短劍刺入、舊契約如琉璃寸寸碎裂、新締約的魔力烙印纏上手背的瞬間，與這名從者依其性格被迫易主的複雜神情（一段即可）。已結算。\n` +
    ``;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：陣營轉換/HP/MEMORY清理/令咒扣除/raiseBond_ 皆已原地改回 pcData
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, stolen: stolenName, seals: seals, statusString: buildPlayerStatusString(pcData[pIdx]) });
}
