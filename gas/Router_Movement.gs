// ==========================================
// 🗺️ Router_Movement.gs — 地圖／移動／休息／偵查／搜刮／整備／工房／卸防突襲（2026-07 拆出）
//   一切「在地圖上做的事」：actionGetMapNodes/actionMove/actionRest/actionScout/actionScavenge/
//   actionSetWorkshop/actionSecondWind/actionPrepMeal ＋ 對應 MEMORY 標記存取器。
// ==========================================

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
        try { injectMysticBuff_(psvC, allPcData[pIdx][COL.PC.MEMORY]); } catch (e) { } // ✨ 逃跑時也吃御主禮裝(如 Avalon 承受寶具減傷)
        var psvAgi = rankVal(psvC.six['敏捷'] || 'C');
        var psvHp = parseInt(allPcData[psvIdxM][COL.PC.HP]) || 0, psvMax = parseInt(allPcData[psvIdxM][COL.PC.MAX_HP]) || 1;
        // 🔮 預告寶具·背後傾瀉：離場格若有敵人正「寶具預告」蓄勢中 → 朝你退卻的背影傾瀉充能寶具＝NP 級臨別重擊
        //   (優先於一般追擊；八成挨到·騎乘可減、夠強可反擋逼退；保 1 不致死但很痛；消耗預告旗標於下方套用處)。
        var teleFoe = null;
        allPcData.forEach(function (r) {
          if (String(r[COL.PC.FACTION]) !== "敵從者") return;
          if (String(r[COL.PC.GAME_ID] || "") !== moveGameId) return;
          if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
          if (String(r[COL.PC.LOC] || "").trim() !== fromLocM) return;
          if (isAllied_(r)) return;
          if (getNpTelegraph_(r[COL.PC.MEMORY])) teleFoe = r;
        });
        if (teleFoe) {
          var teleProb = 0.85 - (hasFx_(psvC, 'ride') ? 0.15 : 0);
          var teleName = String(teleFoe[COL.PC.NAME]);
          if (Math.random() < teleProb) {
            var prT = resolveFateBattle_(rowToCombatant_(teleFoe), psvC, { np: true });
            pursuit = { enemyName: teleName, chaserId: String(teleFoe[COL.PC.ID]), dmg: Math.max(1, prT.damage), hitWho: prT.atkWins ? 'us' : 'foe', np: true,
              note: prT.atkWins ? ('「' + teleName + '」蓄勢已久的真名解放朝你退卻的背影轟然傾瀉——這一擊的代價，是逃離強敵的必然。') : ('「' + teleName + '」的寶具在你身後炸開，卻被你的從者堪堪擋開、反手逼退。') };
          } else {
            pursuit = { enemyName: teleName, chaserId: String(teleFoe[COL.PC.ID]), dmg: 0, hitWho: 'foe', np: true,
              note: '你在「' + teleName + '」真名解放的前一瞬堪堪脫離範圍——寶具的餘威掃過空無一人的殘影。' };
          }
        }
        var chaser = null, chaserAgi = -1;
        if (!pursuit) allPcData.forEach(function (r) {
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
        if (!pursuit && chaser && chaserAgi >= psvAgi) { // 追得上(敵敏≥我敏)才追
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
    } else if (pursuit.dmg) { // 追兵輸→被回身反咬逼退(對追兵 ID 扣血·保1；追兵已 tick 走/不在則仍報甩脫成功)
      var fchIdx = allPcData.findIndex(function (r) { return String(r[COL.PC.ID]) === pursuit.chaserId; });
      if (fchIdx !== -1) { allPcData[fchIdx][COL.PC.HP] = Math.max(1, (parseInt(allPcData[fchIdx][COL.PC.HP]) || 0) - pursuit.dmg); }
    }
    // 🔮 消耗預告寶具旗標(已朝你砸出/落空)——在 tick 後資料上清、隨最終 setValues 寫回；並補戰報進見聞
    if (pursuit && pursuit.np && pursuit.chaserId) {
      var tClrIdx = allPcData.findIndex(function (r) { return String(r[COL.PC.ID]) === pursuit.chaserId; });
      if (tClrIdx !== -1) allPcData[tClrIdx][COL.PC.MEMORY] = clearNpTelegraph_(allPcData[tClrIdx][COL.PC.MEMORY]);
    }
    if (pursuit && pursuit.note) {
      worldRumors.unshift('〔撤離·' + (pursuit.np ? '寶具追擊' : '追擊') + '〕' + pursuit.note + (pursuit.dmg ? `（${pursuit.hitWho === 'us' ? '從者受創' : '反咬逼退追兵'} −${pursuit.dmg}）` : ''));
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
      if (svRow && Math.random() < 0.25) {
        const dSvName = String(svRow[COL.PC.NAME]);
        try { raiseBond_(sheets, pcName, dSvName, 3); } catch (e) { }
        restDreamPrompt = servantCard_(svRow) +
          `【系統·從者之夢·回想】御主沉沉睡去，意識卻順著與從者的靈魂聯繫，墜入「${dSvName}」成為英靈之前的記憶長河——夢見其傳說中的一個片段。\n` +
          `★以 Fate／TYPE-MOON 筆觸，用夢境／回想的朦朧史詩質感，演出「${dSvName}」這名英靈生前傳說裡的某一幕（取材自其真實的神話／史實／傳說：其榮光、抉擇、孤獨或傷痕）。讓御主（與玩家）窺見這名英靈所背負的過往與信念。\n` +
          `★【show, don't tell】以畫面與情境流露，不直接點破其願望或心結，停在夢醒後的餘韻與一絲說不清的悸動；收尾可帶一絲「${dSvName}」隱約察覺御主窺見了這段記憶的細微反應，份量點到為止即可。\n` +
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
function enemyAmbushOnServant_(sheets, pcData, pIdx, gameId, userData, baseMul) {
  const myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  const eIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === myLoc && !isAllied_(r));
  if (eIdx === -1) return null;
  const svIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (svIdx === -1) return null;
  const enemyC = rowToCombatant_(pcData[eIdx]);
  const svC = rowToCombatant_(pcData[svIdx]);
  // 🎯 敵AI自動施展招牌施放技術(免費·戰鬥本色)：還原單層歸屬前這些是免費被動的敵方偷襲威力。
  const probe = resolveFateBattle_(enemyC, svC, { ambush: true, skill: servantActiveSkill_(enemyC) });
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
function getWorkshop_(memory) { var m = String(memory || "").match(/【陣地】([^｜|【]+)/); return m ? m[1].trim() : ""; }
function setWorkshopMemory_(memory, loc) {
  var s = String(memory || "");
  if (/【陣地】[^|【]*/.test(s)) return s.replace(/【陣地】[^|【]*/, "【陣地】" + loc);
  return (s ? s + "｜" : "") + "【陣地】" + loc;
}

// 🏰 主場陣地判定：玩家於【自己佈設的陣地】迎戰、且隊上有【陣地作成】從者 → 回最高陣地作成階(供主場結界減傷)；否則空。
//   引敵入陣地決戰＝主場優勢的核心。階級越高(EX 空中庭園級)結界越強。
function homeTerritoryRank_(pcData, pIdx, gameId) {
  try {
    var ws = getWorkshop_(pcData[pIdx][COL.PC.MEMORY]); if (!ws) return "";
    var battleLoc = String(pcData[pIdx][COL.PC.LOC] || "").trim();
    if (!battleLoc || String(ws).split('-')[0].trim() !== battleLoc.split('-')[0].trim()) return "";
    var best = "";
    for (var i = 0; i < pcData.length; i++) {
      if (String(pcData[i][COL.PC.FACTION]) !== "從者" || String(pcData[i][COL.PC.GAME_ID] || "") !== gameId || String(pcData[i][COL.PC.ID]).startsWith("DEAD_")) continue;
      var r = hasFx_(rowToCombatant_(pcData[i]), 'territory');
      if (r && (!best || rankVal(r) > rankVal(best))) best = r;
    }
    return best;
  } catch (e) { return ""; }
}
// 把「主場·陣地結界」buff 注入我方從者戰鬥單位（僅玩家於自己陣地決戰時）——複用 DEF_FX_ home_field·隨陣地作成階減傷。
function injectHomeField_(c, rank) {
  if (!rank || !c) return c;
  c.skills = (c.skills || []);
  if (!c.skills.some(function (s) { return s && s.fx === 'home_field'; })) c.skills = c.skills.concat([{ n: '主場·陣地結界', r: rank, fx: 'home_field' }]);
  return c;
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
function getScavengedLoc_(memory) { var m = String(memory || "").match(/【搜刮】([^｜|【]+)/); return m ? m[1].trim() : ""; }
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

