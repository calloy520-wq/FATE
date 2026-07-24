// ==========================================
// 🗺️ Router_Movement.gs — 地圖／移動／休息／偵查／搜刮／整備／工房／卸防突襲
//   一切「在地圖上做的事」：actionGetMapNodes/actionMove/actionRest/actionScout/actionScavenge/
//   actionSetWorkshop/actionSecondWind/actionPrepMeal ＋ 對應 MEMORY 標記存取器。
// ==========================================

// 🔵 視覺地圖節點：冬木頂層地點 + 座標 + 我是否在此 + 已偵查敵人數(吃迷霧/game_id)
//   拆成 buildMapNodesPayload_ 供 actionGetMapNodes 與 buildClientState_ 共用，省一趟多餘 round-trip。
//   依【戰爭】標記過濾地點，避免限定據點(如第四次限定)跨戰爭顯示。
function buildMapNodesPayload_(sheets, pcData, myGameId, myLoc) {
  // 坤圖已靜態化，getMapDataCached 直接讀常數，不依賴 sheets.map 分頁存在。
  // 地圖節點是 solo 戰爭限定概念，鑑賞前端從不渲染 mapNodes，非 solo 直接回空形狀、省去白算。
  if (!myGameId || myGameId.indexOf("g_") !== 0) return { nodes: [], here: myLoc, allyIntel: false };
  const myMasterIdx = findGameMasterIdx_(pcData, myGameId);
  const myWar = myMasterIdx !== -1 ? getWarName_(pcData[myMasterIdx][COL.PC.MEMORY]) : "";
  // 🤝 情報共享：有在世盟友時，盟友通報敵蹤——無視戰爭迷霧，全圖敵人位置揭露
  const allyIntel = hasAllyInGame_(pcData, myGameId);
  const mapDay = myMasterIdx !== -1 ? (parseInt(pcData[myMasterIdx][COL.PC.DAY]) || 1) : 1; // 🕰️ 尚未登場者不上地圖
  const enemyAt = {};
  pcData.slice(1).forEach(r => {
    const fac = String(r[COL.PC.FACTION]);
    if (fac !== "敵御主" && fac !== "敵從者") return;
    if (myGameId && String(r[COL.PC.GAME_ID] || "") !== myGameId) return;
    if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
    if (!hasArrived_(r, mapDay)) return;
    if (!r[COL.PC.SEEN] && !allyIntel) return;
    if (isAllied_(r)) return; // 盟友自身不列為敵蹤
    const loc = String(r[COL.PC.LOC] || "").trim();
    enemyAt[loc] = (enemyAt[loc] || 0) + 1;
  });
  const md = getMapDataCached(sheets); // 坤圖已靜態化：getMapDataCached 直接讀FATE_MAP_SEED常數，零I/O成本
  const nodes = [];
  for (let i = 1; i < md.length; i++) {
    const name = String(md[i][COL.MAP.NAME] || "").trim();
    if (!name) continue;
    if (String(md[i][COL.MAP.PARENT] || "").trim() !== "") continue; // 只取頂層冬木地點
    const nodeWar = String(md[i][COL.MAP.WAR] || "").trim();
    if (nodeWar && nodeWar !== myWar) continue; // 戰爭限定地點：非通用且與本局戰爭不符 → 不顯示
    const co = String(md[i][COL.MAP.COORD] || "0,0").split(',');
    nodes.push({
      name: name, type: String(md[i][COL.MAP.TYPE] || ""),
      x: parseFloat(co[0]) || 0, y: parseFloat(co[1]) || 0,
      here: name === myLoc, enemy: enemyAt[name] || 0
    });
  }
  return { nodes: nodes, here: myLoc, allyIntel: allyIntel };
}

function actionGetMapNodes(userData, pcId, sheets) {
  try {
    const pcData = sheets.pc.getDataRange().getValues();
    const me = pcData.find(r => r[COL.PC.ID] == pcId);
    const myGameId = me ? String(me[COL.PC.GAME_ID] || "") : "";
    const myLoc = me ? String(me[COL.PC.LOC] || "").trim() : "";
    const payload = buildMapNodesPayload_(sheets, pcData, myGameId, myLoc);
    return JSON.stringify(Object.assign({ success: true }, payload));
  } catch (e) {
    return JSON.stringify({ success: false, nodes: [], message: e.message });
  }
}

function actionMove(userData, pcId, sheets) {
  const { target } = userData;
  let allPcData = sheets.pc.getDataRange().getValues();
  let pIdx = allPcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });
  // 🕰️ 登場日閘門用：讀即時值(而非快取一次)，讓本函式各處判斷都吃到當下(含 worldTick_ 推進後)的日期。
  const _moveDay = () => parseInt(allPcData[pIdx][COL.PC.DAY]) || 1;

  // ⏳ 行動點檢查（移動耗 2 AP＝2 小時；鑑賞 k_ 不耗 AP）
  const moveGameId = String(allPcData[pIdx][COL.PC.GAME_ID] || "");
  const isFateMove = moveGameId.indexOf("g_") === 0;
  if (isFateMove && getAp_(moveGameId, allPcData) < 2) {
    return JSON.stringify({ success: false, needRest: true, message: "行動力不足以遠行（需 2 點）——請『休息』恢復後再出發。", clock: clockLabel_(moveGameId, allPcData), ap: getAp_(moveGameId, allPcData), apMax: AP_PER_DAY });
  }

  // 💨 撤離追擊(一點點)：從「有活敵從者」的格子離開時，較快的敵從者可能咬一記離別追擊。
  //   ★可生還·不致死(從者血保 1)——只是不讓你一按就從強敵眼皮底下從容全身而退。用移動【前】的初始資料判定。
  const tgtTrim = String(target || "").trim();
  // 🗺️ 目的地必須存在於坤圖(母區域或分支名)——擋掉偽造參數傳送到「地圖外」當永久安全屋(敵AI/夜襲永遠碰不到)。
  if (!tgtTrim) return JSON.stringify({ success: false, message: "未指定目的地。" });
  // 坤圖本回合不會變動，先抓一次供下方「抵達場景描述」複用，省第二次 getMapDataCached 呼叫；失敗則留 null、退回獨立呼叫。
  let moveMapData = null;
  try {
    moveMapData = getMapDataCached(sheets);
    const _tgtRoot = tgtTrim.split('-')[0].trim();
    const _destNode = moveMapData.find(m => { const nm = String(m[COL.MAP.NAME]).trim(); return nm === tgtTrim || nm === _tgtRoot; });
    if (!_destNode) {
      return JSON.stringify({ success: false, message: "輿圖之上查無此地，無路可達。" });
    }
    // 🐛→✅ 稽核抓到：這裡只驗證地名是否存在於全坤圖，完全沒套用buildMapNodesPayload_/getNearbyLocations
    //   /enemyRetreatLoc_都有的【戰爭】標記過濾——前端節點選單雖只列出符合本局戰爭的地點，但直打API
    //   帶戰爭限定地點名(如非第四次局的「海特飯店」)仍會被這裡放行完成整趟移動，把玩家傳送到依設計
    //   對本局根本不存在的地點。比照手足函式同一套規則補上。
    const _destWar = String(_destNode[COL.MAP.WAR] || "").trim();
    if (isFateMove && _destWar && _destWar !== getWarName_(allPcData[pIdx][COL.PC.MEMORY])) {
      return JSON.stringify({ success: false, message: "輿圖之上查無此地，無路可達。" });
    }
  } catch (e) { }
  // 🐛→✅ 目的地＝當前所在地：地圖節點/故事內文的地名連結都沒擋這個案例(點自己所在的◈節點一樣可觸發
  //   travelTo)，此路徑會白耗 2 AP、跑一輪世界推進與抵達敘事，卻哪裡都沒去——原地無意義的「移動」。
  if (tgtTrim === String(allPcData[pIdx][COL.PC.LOC] || "").trim()) {
    return JSON.stringify({ success: false, message: "你已經在此地，無須移動。" });
  }
  // 🥷 悄悄離開：若正從一個「敵人分心」的局面格（趁隙窗口·slip）抽身，此刻離開不會被追擊。
  var _slipWin = isFateMove ? getEncounterWindow_(allPcData[pIdx][COL.PC.MEMORY]) : null;
  var _slipAway = !!(_slipWin && _slipWin.loc === String(allPcData[pIdx][COL.PC.LOC] || "").trim() && encounterChoices_(_slipWin.type).slip);
  // 🏃 撤退旗標：前端按「撤退」殺出重圍時帶 retreat=true——敵方【必】追擊(非機率)、GAS 判勝負。
  var isRetreat = isFateMove && (userData.retreat === true || userData.retreat === 'true');
  // 🏰 在自己陣地＝安全港：主場結界／機關掩護，敵人闖進來也困不住你——不強制撤退、離場亦不被追擊
  //   (與 slip 同級的豁免)。這是「設置陣地」承諾的主場優勢，敵在你陣地反被守株(見 enemyAmbushOnServant_ 陣地反擊)。
  var _fromLocR = String(allPcData[pIdx][COL.PC.LOC] || "").trim();
  var _atOwnHome = false;
  try { var _ws = getWorkshop_(allPcData[pIdx][COL.PC.MEMORY]); _atOwnHome = !!(_ws && String(_ws).split('-')[0].trim() === _fromLocR.split('-')[0].trim()); } catch (e) { }
  // 🚫 有敵時封鎖從容移動：離場格若有【非盟約·已登場·未友好(BOND<50)】的能戰敵從者，plain 移動被擋，須改按「撤退」。
  //   分心窗口(slip)可悄悄離開則不受此限；撤退本身(isRetreat)也放行；在自己陣地(_atOwnHome)享安全港·不封鎖。
  if (isFateMove && !_slipAway && !_atOwnHome && !isRetreat && tgtTrim !== _fromLocR) {
    var _hostileHere = allPcData.some(function (r) {
      return String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === moveGameId &&
        !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC] || "").trim() === _fromLocR &&
        !isAllied_(r) && hasArrived_(r, _moveDay()) && (parseInt(r[COL.PC.BOND]) || 0) < 50;
    });
    if (_hostileHere) return JSON.stringify({ success: false, needRetreat: true, message: "此地有敵從者盯著，無法從容轉身離去——須按「🏃 撤退」殺出重圍（對方必定追擊、成敗當場見真章）。" });
  }
  var pursuit = null;
  try {
    var fromLocM = String(allPcData[pIdx][COL.PC.LOC] || "").trim();
    // 🏃 追擊機制已【全數轉移到撤退按鈕】(玩家定案)：唯有 isRetreat（殺出重圍）才觸發追擊——一般移動遇敵已被上方
    //   needRetreat 擋下（強制走撤退），遇不到敵則本就無人可追，故不再有「機率性離場追擊」這條路徑。
    //   🏰 從自己陣地離場享安全港·不被追擊(_atOwnHome)——即便按了撤退，主場結界也掩護你從容抽身。
    if (isFateMove && isRetreat && !_slipAway && !_atOwnHome && fromLocM && tgtTrim && tgtTrim !== fromLocM) {
      var psvIdxM = findPlayerServantIdx_(allPcData, moveGameId, userData.servant, userData.servantId);
      if (psvIdxM !== -1) {
        var psvC = rowToCombatant_(allPcData[psvIdxM]);
        try { injectMysticBuff_(psvC, allPcData[pIdx][COL.PC.MEMORY]); } catch (e) { } // ✨ 逃跑時也吃御主禮裝(如 Avalon 承受寶具減傷)
        psvC._shieldMp = parseInt(allPcData[pIdx][COL.PC.MP]) || 0; // 💠 背擊寶具＝七天盾可展開(扣魔)，付不起張不開
        // 🔮 預告寶具·背後傾瀉：離場格若有敵人正蓄勢寶具預告 → 朝你退卻的背影轟出 NP 級臨別重擊(優先於一般追擊，保1不致死)。
        //   用 find() 只取第一個相符者，避免多個預告敵人同格時只有最後一個結算、其餘旗標卡住不清。
        var teleFoe = allPcData.find(function (r) {
          if (String(r[COL.PC.FACTION]) !== "敵從者") return false;
          if (String(r[COL.PC.GAME_ID] || "") !== moveGameId) return false;
          if (String(r[COL.PC.ID]).startsWith("DEAD_")) return false;
          if (String(r[COL.PC.LOC] || "").trim() !== fromLocM) return false;
          if (isAllied_(r)) return false;
          if (!hasArrived_(r, _moveDay())) return false; // 🕰️ 尚未登場者不會追擊
          return !!getNpTelegraph_(r[COL.PC.MEMORY]);
        }) || null;
        if (teleFoe) {
          var teleName = String(teleFoe[COL.PC.NAME]);
          // 🔋 背擊寶具比照戰鬥內規則：需敵御主付得起 prana 才發動；出力全開；我方擋下時的反手另以普通交鋒結算(不白嫖NP骰)。
          var teleIdx = allPcData.findIndex(function (r) { return String(r[COL.PC.ID]) === String(teleFoe[COL.PC.ID]); });
          var foeC2 = rowToCombatant_(teleFoe);
          var telePrana = npPranaCost_(npEffectiveRank_(foeC2) || '-'); // 🎴 2026-07 六波：吃該敵從者已選定寶具的官方階級
          var teleAfford = (teleIdx !== -1) ? enemyCanAffordNp_(allPcData, teleIdx, moveGameId, telePrana) : { afford: false, masterIdx: -1 };
          if (teleAfford.afford) {
            drainForNp_(sheets, allPcData, teleIdx, teleAfford.masterIdx, telePrana); // 寶具已離弦(中與不中都燒魔)
            foeC2.output = 100;
            var teleProb = 0.85 - (hasFx_(psvC, 'ride') ? 0.15 : 0);
            if (Math.random() < teleProb) {
              var prT = resolveFateBattle_(foeC2, psvC, { np: true });
              settleShieldMana_(sheets, allPcData, pIdx, psvC); // 💠 七天盾展開費結算(引擎已判付得起才展開)
              if (prT.atkWins) {
                pursuit = { enemyName: teleName, chaserId: String(teleFoe[COL.PC.ID]), dmg: Math.max(1, prT.damage), hitWho: 'us', np: true,
                  note: '「' + teleName + '」蓄勢已久的真名解放朝你退卻的背影轟然傾瀉——這一擊的代價，是逃離強敵的必然。' };
              } else {
                var cntT = resolveFateBattle_(psvC, foeC2, {}); // 反手＝普通交鋒(不白嫖寶具骰)
                // 🐛→✅ 舊版無條件講「堪堪擋開」(千鈞一髮)，但 prT(foe的寶具骰)其實已經算出這次躲得有多輕鬆——
                //   命中值(prT.aHit)跟迴避值(prT.dEva)差距大時根本不算「堪堪」，跟後面的骰子margin矛盾。
                var counterMargin = prT.dEva - prT.aHit;
                var counterDesc = counterMargin >= 8 ? '從容擋下、反手逼退' : '堪堪擋開、反手逼退';
                pursuit = { enemyName: teleName, chaserId: String(teleFoe[COL.PC.ID]), dmg: Math.max(1, cntT.atkWins ? cntT.damage : Math.round(rankVal(psvC.six['筋力'] || 'C') * 0.5)), hitWho: 'foe', np: true,
                  note: '「' + teleName + '」的寶具在你身後炸開，卻被你的從者' + counterDesc + '。' };
              }
            } else {
              pursuit = { enemyName: teleName, chaserId: String(teleFoe[COL.PC.ID]), dmg: 0, hitWho: 'foe', np: true,
                note: '你在「' + teleName + '」真名解放的前一瞬堪堪脫離範圍——寶具的餘威掃過空無一人的殘影。' };
            }
          }
        }
        var chaser = null, chaserAgi = -1;
        if (!pursuit) allPcData.forEach(function (r) {
          if (String(r[COL.PC.FACTION]) !== "敵從者") return;
          if (String(r[COL.PC.GAME_ID] || "") !== moveGameId) return;
          if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
          if (String(r[COL.PC.LOC] || "").trim() !== fromLocM) return;
          if (isAllied_(r)) return; // 🤝 盟約/休兵中→不追殺
          if (!hasArrived_(r, _moveDay())) return; // 🕰️ 尚未登場者不會追擊
          if ((parseInt(r[COL.PC.BOND]) || 0) >= 50) return; // 💗 好感友好(≥50，2026-07 讀該敵從者自己的 BOND 欄)→交情夠·不追殺
          var a = rankVal((rowToCombatant_(r).six['敏捷']) || 'C');
          if (a > chaserAgi) { chaserAgi = a; chaser = r; }
        });
        // 🏃 撤退＝敵方【必】追擊（本區塊唯 isRetreat 才進·見上方 guard）：無視敏捷門檻與機率，對方全力追殺。
        if (!pursuit && chaser) {
          var chC = rowToCombatant_(chaser);
          // ⚔️ 真·交手判定(非單方挨打)：追兵 vs 我方從者一次交鋒，誰輸誰扣血——我方夠強可回身反咬逼退追兵。
          //   雙方保 1 不致死。撤退時追兵搶得先機(ambush)、更難全身而退。
          var pr = resolveFateBattle_(chC, psvC, { ambush: true });
          var chaserNm = String(chaser[COL.PC.NAME]);
          // 🐛→✅ 舊版無條件講「重創」，但 pr.damage 可能只是 Math.max(1,...) 的地板值(輕傷)——GAS
          //   明明知道這擊佔從者上限多少比例，卻沒換算成對應的傷勢用詞餵給AI，讓文字跟血條可能對不上。
          var psvHpMaxM = parseInt(allPcData[psvIdxM][COL.PC.MAX_HP]) || 1;
          var chaserSevM = pr.atkWins ? dmgSeverityWord_(Math.max(1, pr.damage), psvHpMaxM) : '';
          // 🐛→✅ 舊文案「燃令咒疾追」把這場【每次撤退必定觸發、不設機率】的追擊，寫成敵方燒了一道
          //   令咒——但令咒是全局僅 3 道、真正花費時會扣減 leftSeals 的稀缺資源(見 Router_Battle.gs
          //   sealEscaped)，這裡從沒動過那個計數，純屬掛羊頭的敘事詞，卻讓玩家每撤退一次就以為對面
          //   燒掉一次奇蹟(玩家反應「?!」)。改成不涉及令咒的純體能追擊措辭。
          // note 必給——worldRumors 只在 pursuit.note 存在時才推播戰報，缺了 note 扣血就看不出原因。
          pursuit = { enemyName: chaserNm, chaserId: String(chaser[COL.PC.ID]), dmg: Math.max(1, pr.damage), hitWho: pr.atkWins ? 'us' : 'foe', retreat: true,
            // 🐛→✅ 玩家實測抓到：「沒能全身而退」讀起來容易誤解成「撤退失敗、沒能脫身」，但這場撤退
            //   本就必定成功抵達目的地(只是途中挨了一記)——改成明確講「帶傷脫身」，不再有歧義。
            note: pr.atkWins
              ? ('你下令撤退，「' + chaserNm + '」強襲擊中從者致其' + chaserSevM + '，從者忍痛掩護，帶你驚險脫離戰場。')
              : ('你下令撤退，「' + chaserNm + '」追擊被從者回身逼退，主從二人毫髮無傷地撤離。') };
        }
      }
    }
  } catch (e) { }

  // 🎭 抵達態度判定（趁世界尚未 tick，看 target 是否已有先客）：先客在＝主動找上門(警惕)；無＝偶遇(意外)。
  //   isFateMove guard：preFoes 只有 solo 前端(travelTo)會消費，鑑賞無此陣營列，明確guard避免僥倖依賴資料形狀。
  const preFoesAtTarget = isFateMove ? allPcData.filter(r =>
    (String(r[COL.PC.FACTION]) === "敵御主" || String(r[COL.PC.FACTION]) === "敵從者")
    && (!moveGameId || String(r[COL.PC.GAME_ID] || "") === moveGameId)
    && !String(r[COL.PC.ID]).startsWith("DEAD_")
    && String(r[COL.PC.LOC] || "").trim() === tgtTrim
    && hasArrived_(r, _moveDay()) // 🕰️ 尚未登場者不算「先客」
  ).map(r => String(r[COL.PC.NAME])) : [];

  // 🌍 世界先動，玩家後到：先讓敵御主／敵從者 tick 到新位置，再把玩家落到 target，
  //   避免「追到敵人所在地」時敵人在你踏進來同一瞬間又被傳走，遭遇敘事才跑得起來。
  let clockLabel = "", worldRumors = [], apLeft = AP_PER_DAY, moveVictory = false, moveDream = "";
  if (isFateMove) {
    try {
      // skipWrite=true：函式結尾本就會整表批次寫回(含這3欄)，這裡只改記憶體，避免 spendAp_ 內部多寫一次同樣的值。
      const sp = spendAp_(moveGameId, 2, allPcData, sheets, true);
      apLeft = sp.ap;
      // 傳 allPcData 給 worldTick_/breakStaleAlliances_ 原地改(陣列傳參考)，免事後重讀整表拿 tick 後狀態。
      // 🐛→✅ 補最後一個 deferWrite=true 參數：worldTick_ 舊版不管有沒有人要求都會自己即時寫回
      // LOC/HP/MEMORY/MP，本函式結尾(340行)又整表 setValues 一次，同一批值等於送進 Sheets 兩次——
      // 幾乎每次移動都會踩到(敵35%機率移位、敵御主每日回魔)。傳 true 讓 worldTick_ 只改記憶體，交給
      // 這裡收尾一次寫完。
      const tick = worldTick_(sheets, moveGameId, target, 1, false, allPcData, true); // 移動只讓敵換位，不死人；但令咒透支倒數可能到期收尾
      worldRumors = tick.rumors || [];
      moveVictory = !!tick.victory;
      moveDream = tick.dreamPrompt || ""; // 🏆 令咒透支延遲結算若剛好收尾此局，願望夢跟著帶出來
      try { const ab = breakStaleAlliances_(sheets, moveGameId, allPcData); if (ab.broken.length) worldRumors.push(`〔盟約${ab.forced ? '瓦解' : '到期'}〕你與「${ab.broken.join('、')}」的同盟已${ab.forced ? '因戰局逼近終局而破裂——最後只能剩一個' : '到期失效'}，重回敵對。`); } catch (e) { }
      clockLabel = clockLabel_(moveGameId, allPcData);
    } catch (e) { }
  }

  // 🔁 敵人已在同一份 allPcData 上 tick 就位，直接把玩家(與同行從者)落到 target；pIdx 全程未變。
  allPcData[pIdx][COL.PC.LOC] = target;
  const pcName = allPcData[pIdx][COL.PC.NAME];

  allPcData.forEach((r, nIdx) => {
    if (nIdx === pIdx) return;
    if (String(r[COL.PC.IS_PARTY] || "") !== "同行") return;
    if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
    if (moveGameId && String(r[COL.PC.GAME_ID] || "") !== moveGameId) return;
    allPcData[nIdx][COL.PC.LOC] = target;
  });

  // 💨 套用撤離追擊判定(前述交手)：輸的一方扣血·保 1 不致死(隨下方整表 setValues 寫回)。
  if (pursuit) {
    if (pursuit.hitWho === 'us') { // 我方從者輸→挨追擊
      var fsvIdx = findPlayerServantIdx_(allPcData, moveGameId, userData.servant, userData.servantId);
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
  // 📊🎭 比照 enemyAmbushOnServant_ 補上 foeCard(追兵性格素材，AI才演得出反應)＋report(前端秒顯數字戰報卡，不等AI)。
  var pursuitReport = null;
  if (pursuit) {
    var pFsvIdx = findPlayerServantIdx_(allPcData, moveGameId, userData.servant, userData.servantId);
    var pSvName = pFsvIdx !== -1 ? String(allPcData[pFsvIdx][COL.PC.NAME]) : "從者";
    var pSvHpMax = pFsvIdx !== -1 ? (parseInt(allPcData[pFsvIdx][COL.PC.MAX_HP]) || 0) : 0;
    var pSvHpAfter = pFsvIdx !== -1 ? (parseInt(allPcData[pFsvIdx][COL.PC.HP]) || 0) : 0;
    var pChaserRow = allPcData.find(function (r) { return String(r[COL.PC.ID]) === pursuit.chaserId; });
    // 🐛→✅ 玩家實測抓到：這張追兵卡常常跟抵達場景的己方/敵方servantCard_同框——skipClose，
    //   讓下方 perfNamesMove 一併收進統一收尾(pursuitChaserName 供尚未宣告的 perfNamesMove 稍後合併)。
    pursuit.foeCard = pChaserRow ? servantCard_(pChaserRow, { skipClose: true }) : "";
    var pursuitChaserName = pChaserRow ? String(pChaserRow[COL.PC.NAME]) : "";
    pursuitReport = {
      pursuit: true, np: !!pursuit.np, retreat: !!pursuit.retreat, enemyName: pursuit.enemyName, dmg: pursuit.dmg, hitWho: pursuit.hitWho,
      svName: pSvName, svHpMax: pSvHpMax, after: pSvHpAfter
    };
  }

  // ⚔️ 抵達地點若同時有 ≥2 位不同敵御主在場，擲一種「敵營局面」（不再永遠互毆→見你停手）。
  //   局面種類/後果全由 resolveFactionEncounter_ 依雙方性格＋傷勢＋戰局 GAS 裁定，AI 只演出。
  var factionClash = null;
  // isFateMove guard：這段會真的寫HP/MEMORY，明確guard而非依賴「鑑賞無敵對陣營列」的資料形狀僥倖安全。
  try {
    var clashMasters = [];
    if (isFateMove) allPcData.forEach(function (r) {
      if (String(r[COL.PC.GAME_ID] || "") !== moveGameId) return;
      if (String(r[COL.PC.LOC] || "").trim() !== tgtTrim) return;
      if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
      if (String(r[COL.PC.FACTION]) !== "敵御主") return;
      if (isAllied_(r)) return; // 已與玩家結盟者現在算友軍，不參與這場敵營局面演出
      if (!hasArrived_(r, _moveDay())) return; // 🕰️ 尚未登場者不參與這場演出
      clashMasters.push(r);
    });
    if (clashMasters.length >= 2) {
      // 🐛→✅ 舊版用 indexOf("【御主】"+mN) 子字串比對，同地若某敵御主真名恰為另一人的前綴(如
      //   「Illya」vs「Illyasviel」)會誤配硬連結——改用單一真實來源 getServantMaster_(嚴格切到下個
      //   ｜分隔符)取出的完整真名做精確比對。
      var findClashSv_ = function (masterRow) {
        var mN = String(masterRow[COL.PC.NAME] || "");
        return allPcData.find(function (r) {
          return String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === moveGameId &&
            String(r[COL.PC.LOC] || "").trim() === tgtTrim && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
            getServantMaster_(r[COL.PC.MEMORY]) === mN;
        });
      };
      // 🐛→✅ 舊版固定只挑 clashMasters[0]/[1]，同地若有 3 組以上敵御主，第 3 組以後永遠沒有機會
      //   演出這場「敵營動向」——改成從全部在場組別中隨機挑一對，多組時輪流有機會登場。
      var ia = 0, ib = 1;
      if (clashMasters.length > 2) {
        ia = Math.floor(Math.random() * clashMasters.length);
        do { ib = Math.floor(Math.random() * clashMasters.length); } while (ib === ia);
      }
      var svA = findClashSv_(clashMasters[ia]), svB = findClashSv_(clashMasters[ib]);
      if (svA && svB && String(svA[COL.PC.ID]) !== String(svB[COL.PC.ID])) {
        factionClash = resolveFactionEncounter_(allPcData, clashMasters[ia], clashMasters[ib], svA, svB, moveGameId, _moveDay());
      }
    }
  } catch (e) { }
  if (factionClash) worldRumors.unshift('〔敵營動向〕' + factionClash.note);
  // 🎯 撞見敵人的可反應窗口：把局面 type 寫進御主 MEMORY，決定抵達這格開放哪些情境選擇（趁隙/挑撥/溜走）。
  //   無可反應局面則清掉舊窗口。隨下方整表 setValues 一併寫回。
  if (isFateMove) {
    var _ch = factionClash && factionClash.choices;
    if (_ch && (_ch.ambush || _ch.incite || _ch.slip)) {
      // svA/svB 是上面 resolveFactionEncounter_ 實際敘事的那兩名敵從者(見 clashMasters[ia]/[ib] 配對)，
      // 隨窗口存進 MEMORY 供 actionIncite 精確鎖定，不再讓它自己猜陣列前兩個。
      var _windowNames = (typeof svA !== 'undefined' && svA && typeof svB !== 'undefined' && svB) ? [String(svA[COL.PC.NAME]), String(svB[COL.PC.NAME])] : [];
      allPcData[pIdx][COL.PC.MEMORY] = setEncounterWindow_(allPcData[pIdx][COL.PC.MEMORY], tgtTrim, factionClash.type, _windowNames);
    } else {
      allPcData[pIdx][COL.PC.MEMORY] = clearEncounterWindow_(allPcData[pIdx][COL.PC.MEMORY]);
    }
  }

  // ⏳ 時回：移動的 2 小時間，御主與同行從者隨時間自然回復（HP 固定、MP 看魔術迴路）。
  //   大幅恢復靠「休息」（同一套規則 ×2）。便宜：只改記憶體那幾格，隨移動一起寫回，零額外讀寫，不會變慢。
  let regenNote = "";
  if (isFateMove) {
    const partyNames = allPcData.filter(r => String(r[COL.PC.GAME_ID] || "") === moveGameId && String(r[COL.PC.IS_PARTY] || "") === "同行" && !String(r[COL.PC.ID]).startsWith("DEAD_")).map(r => r[COL.PC.NAME]);
    const homeLoc = playerHomeLoc_(sheets, pcId, allPcData);
    const did = applyRegen_(allPcData, moveGameId, pcName, partyNames, masterCircuits_(allPcData[pIdx]), 2, 1, sheets, target, homeLoc);
    if (did) regenNote = "〔時回〕數小時的奔波之間，靈基與魔力隨時間悄然回流了一些。";
  }
  if (regenNote) worldRumors.unshift(regenNote);

  const pcColCount = Object.keys(COL.PC).length;
  allPcData.forEach(row => { while (row.length < pcColCount) { row.push(""); } });

  sheets.pc.getRange(1, 1, allPcData.length, pcColCount).setValues(allPcData);
  // (拔冗餘 flush：下方 markRivalsSeen_/getDataRange 等讀取本就會 flush pending 寫入)

  // isFateMove guard：markRivalsSeen_ 找敵御主/敵從者做戰爭迷霧標記，鑑賞無此陣營列，避免白掃一輪。
  if (isFateMove) { try { markRivalsSeen_(sheets, pcId, allPcData); } catch (e) { } } // 🔵 抵達即偵查此地敵人；就地標記+批次寫回，免重讀

  const freshMapData = moveMapData || getMapDataCached(sheets); // 坤圖已靜態化(讀FATE_MAP_SEED常數，零I/O成本)，這裡複用上面已抓過的結果純粹省一次函式呼叫
  const rootTarget = target ? String(target).split('-')[0].trim() : "";
  const parentMapInfo = freshMapData.find(m => String(m[COL.MAP.NAME]).trim() === rootTarget);
  const subMapInfo = (target !== rootTarget) ? freshMapData.find(m => String(m[COL.MAP.NAME]).trim() === target) : null;
  let mapDesc = parentMapInfo ? `【母區域：${rootTarget}】${parentMapInfo[COL.MAP.DESC]}` : "此處荒煙蔓草，並未記載於輿圖之中。";
  if (subMapInfo) mapDesc += `\n【當前分支：${target}】${subMapInfo[COL.MAP.DESC]}`;

  // 🎭 隨行從者的「演出依據」卡（含狂化禁言/口吻），供前端抵達敘事讓從者真的在場、有反應，不是御主獨白
  // 🐛→✅ 玩家實測抓到：抵達場景常同框我方從者＋同地多名敵人＋撤離追兵，可能有3張以上servantCard_，
  //   每張各自帶一份完整收尾句——全部skipClose，收集這場戲實際出現的真名，perfNamesMove統一收尾一次。
  var svIdxMove = findPlayerServantIdx_(allPcData, moveGameId, userData.servant, userData.servantId);
  var svCardMove = svIdxMove !== -1 ? servantCard_(allPcData[svIdxMove], { skipClose: true }) : "";
  var perfNamesMove = svIdxMove !== -1 ? [String(allPcData[svIdxMove][COL.PC.NAME])] : [];

  // 🎭 在場敵從者/敵御主人設卡餵給抵達敘事，讓敵人依性格反應而非 AI 即興通用反派；servantCard_ 對敵從者一樣適用(低羈絆→戒備敵意)。
  //   🐛→✅ 原本只餵敵從者的卡——若目的地只有孤身敵御主(從者已死/在別處)，或有兩方敵御主互動的場面，
  //   AI 對這名敵御主毫無性格依據，只能即興通用反派。補上 enemyMasterCard_(比照戰鬥路徑的用法)。
  var foeCardsMove = "";
  try {
    // 🐛→✅ 玩家實測抓到的同類問題：同地若同時有 ≥2 組敵人(各自帶從者)，舊版把每張卡原樣串接、
    //   完全沒標「哪張從者卡屬於哪張御主卡」，AI 沒有配對依據可能把 A 組從者的台詞演成對 B 組御主講。
    //   只在同地確實有 ≥2 位敵御主時才加標籤(單組場面維持原樣、不增加噪音)，用硬連結【御主】tag 標出
    //   真正歸屬，而非同地任一比對。
    var _foeRowsMove = allPcData.filter(function (r) {
      return String(r[COL.PC.GAME_ID] || "") === moveGameId
        && String(r[COL.PC.LOC] || "").trim() === tgtTrim
        && !String(r[COL.PC.ID]).startsWith("DEAD_")
        && hasArrived_(r, _moveDay())
        && (String(r[COL.PC.FACTION]) === "敵從者" || String(r[COL.PC.FACTION]) === "敵御主");
    });
    var _multiFoeGroupsMove = _foeRowsMove.filter(function (r) { return String(r[COL.PC.FACTION]) === "敵御主"; }).length > 1;
    _foeRowsMove.forEach(function (r) {
      if (String(r[COL.PC.FACTION]) === "敵從者") {
        var _ownTag = "";
        if (_multiFoeGroupsMove) {
          var _ownName = getServantMaster_(r[COL.PC.MEMORY]);
          if (_ownName) _ownTag = '〔「' + _ownName + '」之從者〕';
        }
        foeCardsMove += _ownTag + servantCard_(r, { skipClose: true });
        perfNamesMove.push(String(r[COL.PC.NAME]));
      } else if (String(r[COL.PC.FACTION]) === "敵御主") {
        foeCardsMove += enemyMasterCard_(r, { skipClose: true });
        perfNamesMove.push(String(r[COL.PC.NAME]));
      }
    });
  } catch (e) { }
  // 🐛→✅ 併入撤離追兵真名（若有）——同框素材統一收尾一次，避免 pursuit.foeCard 自帶的收尾句重複出現
  if (pursuitChaserName && perfNamesMove.indexOf(pursuitChaserName) < 0) perfNamesMove.push(pursuitChaserName);

  // 🫶 遇敵態度（GAS 依「在場敵對者對你的好感」裁定，AI 只照這定調演）：好感高→未必有敵意；好感低→殺氣明顯。
  //   中性(未培養過好感)→留空，維持既有找上門/偶遇 steer。
  var foeMoodNote = "";
  try {
    var moodFavs = [];
    allPcData.forEach(function (r) {
      if (String(r[COL.PC.GAME_ID] || "") !== moveGameId) return;
      if (String(r[COL.PC.LOC] || "").trim() !== tgtTrim) return;
      if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
      if (!hasArrived_(r, _moveDay())) return;
      var f = String(r[COL.PC.FACTION]);
      if ((f === "敵御主" || f === "敵從者") && !isAllied_(r)) moodFavs.push(bondFavor_(r));
    });
    if (moodFavs.length) {
      var moodAvg = moodFavs.reduce(function (a, b) { return a + b; }, 0) / moodFavs.length;
      if (moodAvg >= 0.45) foeMoodNote = "此地敵對者對你已有相當好感——讓他們此刻態度和緩、流露幾分親近或至少不設防，別演成一見面就劍拔弩張。";
      else if (moodAvg >= 0.15) foeMoodNote = "此地敵對者對你略有好感——態度偏克制觀望，戒備仍在但留了餘地，別演成純然殺意。";
      else if (moodAvg <= -0.35) foeMoodNote = "此地敵對者對你頗有敵意——讓他們的殺氣與提防更外顯。";
    }
  } catch (e) { }

  // 🆘 盟友告急（同盟配套）：worldTick 後若有盟友在別處被敵從者纏上→報信＋供「趕去馳援」。
  var allyPeril = null;
  try { if (isFateMove) allyPeril = detectAllyPeril_(allPcData, moveGameId, target, _moveDay()); } catch (e) { }
  // 🐛→✅ 舊版無條件講「情勢緊繃」，GAS 明明算出 allyPeril.hpRatio 卻沒依實際血量分級——比照修正。
  if (allyPeril) {
    var _allyPerilSev = allyPeril.hpRatio >= 0.6 ? '尚占上風、應付得來' : allyPeril.hpRatio >= 0.3 ? '戰況膠著' : '命懸一線、情勢危急';
    worldRumors.unshift(`〔盟友告急〕盟友「${allyPeril.ally}」此刻正於「${allyPeril.loc}」與敵從者「${allyPeril.foe}」對上，${_allyPerilSev}。`);
  }

  STATE_PRE_DATA_ = allPcData; // ⚡ 交棒：本 handler 所有寫入(worldTick_/spendAp_/markRivalsSeen_/夜襲…)皆已原地改回 allPcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({
    success: true,
    foeMood: foeMoodNote, // 🫶 遇敵態度·GAS 依好感裁定→前端注入抵達 steer
    allyPeril: allyPeril, // 🆘 盟友告急→前端報信＋「趕去馳援」泡泡
    masterCard: masterCard_(allPcData[pIdx]), // 🎭 御主演出依據→抵達敘事讓「我」依性格開口、不再啞巴主角
    servantCard: svCardMove,
    foeCards: foeCardsMove,
    perfNote: performanceNote_(perfNamesMove), // 🎭 抵達場景可能同框多張 servantCard_(皆已 skipClose)，統一收尾一次
    pursuit: pursuit,
    report: pursuitReport, // 📊 撤離追擊數字戰報卡(見上方建構處)——renderFateBattleReport 秒顯，不等 AI
    factionClash: factionClash, // ⚔️ 抵達時撞見的敵對互毆(見上方建構處)——供前端插入抵達演出提示詞
    preFoes: preFoesAtTarget,
    victory: moveVictory,
    dreamPrompt: moveDream,
    statusString: buildPlayerStatusString(allPcData[pIdx]),
    // 🧹 move 現為 solo 專屬 action(鑑賞已改走 kanshouMoveTo)，不需分流呼叫 getKanshouPeopleList_。
    people: getLocalPeopleList(sheets, pcName, pcId, target, allPcData),
    // 🐛→✅ 同批修正：漏傳戰爭標記會讓第四次限定地點(海特飯店等)混進撤退突圍/鄰近地點清單。
    locations: getNearbyLocations(target, freshMapData, getWarName_(allPcData[pIdx][COL.PC.MEMORY])).slice(0, 5),
    mapNodes: buildMapNodesPayload_(sheets, allPcData, moveGameId, target), // ⚡ 夾帶地圖節點，免手機抵達後再打一趟 get_map_nodes
    mapDesc: mapDesc,
    parentRegion: rootTarget,
    clock: clockLabel,
    ap: apLeft,
    apMax: AP_PER_DAY,
    rumors: worldRumors,
    economy: playerServantEconomy_(sheets, pcId, allPcData)
  });
}

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
    // 🐛→✅ 稽核抓到：世界自走輪數用 Math.floor(restHours/3)，只對{1,3,6}(前端openRestMenu()唯一
    //   提供的三個按鈕值)這組設計值正確對齊(1h:0/3h:1/6h:2)；舊版clamp卻放行1~12任意整數，直打API
    //   傳4/5/7/8/10/11這類非3倍數值時，AP/HP/MP回復跟時鐘照樣吃滿完整restHours，世界模擬輪數卻
    //   被floor砍掉餘數小時份——同樣的世界風險換到更多回復量與時間推進，形同可鑽的失衡缺口。改成
    //   白名單收斂到公式實際設計覆蓋的值，不再仰賴前端按鈕巧合對齊。
    const _restAllowed = [1, 3, 6];
    const restHours = _restAllowed.includes(parseInt(userData.restHours)) ? parseInt(userData.restHours) : 6;
    const prevHp = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
    const hpMaxP = parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 0;
    const wasInjured = prevHp < hpMaxP;
    let healedNames = [pcName];
    const partyNames = [];
    pcData.forEach(r => {
      if (String(r[COL.PC.NAME]) === pcName) return;
      if (String(r[COL.PC.IS_PARTY] || "") !== "同行") return;
      if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
      if (restGameId && String(r[COL.PC.GAME_ID] || "") !== restGameId) return;
      if (parseInt(r[COL.PC.HP]) > 0) { partyNames.push(r[COL.PC.NAME]); healedNames.push(r[COL.PC.NAME]); }
    });
    // 時回 ×2：休息 restHours 小時的回復（HP 自我修復；MP 走魔力收支經濟，休息把收入加倍）
    applyRegen_(pcData, restGameId, pcName, partyNames, masterCircuits_(pcData[pIdx]), restHours, 2, sheets, pcLoc, playerHomeLoc_(sheets, pcId, pcData));
    // 休滿（HP 回到上限）者重置體態為平穩
    [pIdx].concat(partyNames.map(n => pcData.findIndex(r => r[COL.PC.NAME] === n && String(r[COL.PC.GAME_ID] || "") === restGameId && !String(r[COL.PC.ID]).startsWith("DEAD_")))).forEach(idx => {
      if (idx >= 0 && (parseInt(pcData[idx][COL.PC.HP]) || 0) >= (parseInt(pcData[idx][COL.PC.MAX_HP]) || 0)) pcData[idx][COL.PC.STATUS] = normalStatus;
    });
    // 🐛→✅ 舊版這裡先整表寫一次(只含時回結果)，緊接著 restHours_/worldTick_/breakStaleAlliances_
    // 又各自即時寫入同一批列——單次休息最壞可疊到3~5次個別Sheets寫入。改成這裡先不寫，開
    // BATTLE_DEFER_WRITE_ 讓下面三支只改記憶體，等三者都跑完後一次整表寫回(見下方收尾)。
    const _prevDeferRest = BATTLE_DEFER_WRITE_;
    BATTLE_DEFER_WRITE_ = true;

    let restClock = "", restRumors = [], apAfter = AP_PER_DAY, restVictory = false, restVictoryDream = "";
    try {
      const clk = restHours_(restGameId, restHours, pcData, sheets, true);
      apAfter = clk ? clk.ap : AP_PER_DAY;
      const rounds = Math.floor(restHours / 3); // 1h:0、3h:1、6h:2 輪世界自走
      // worldTick_ 拿 pcData 在同一份陣列上原地改(傳參考)，不必事後重讀整表才拿得到最新狀態。
      if (rounds > 0) {
        const tick = worldTick_(sheets, restGameId, pcLoc, rounds, true, pcData, true); restRumors = tick.rumors || []; restVictory = !!tick.victory;
        restVictoryDream = tick.dreamPrompt || ""; // 🏆 令咒透支延遲結算若剛好收尾此局，願望夢跟著帶出來
        // 🤝 同盟到期/終局強制瓦解原本只在 actionMove 判——休息也會推進時間，理應同步判一次(沿用同一份 pcData傳參考)。
        try { const ab = breakStaleAlliances_(sheets, restGameId, pcData); if (ab.broken.length) restRumors.push(`〔盟約${ab.forced ? '瓦解' : '到期'}〕你與「${ab.broken.join('、')}」的同盟已${ab.forced ? '因戰局逼近終局而破裂——最後只能剩一個' : '到期失效'}，重回敵對。`); } catch (e) { }
      }
      restClock = clockLabel_(restGameId, pcData);
    } catch (e) { }
    BATTLE_DEFER_WRITE_ = _prevDeferRest;
    // 收尾一次整表寫回：時回／時鐘／世界自走／盟約瓦解全部已在同一份 pcData 上改完，這裡一次寫完，
    // 取代舊版散落的多趟寫入。下方 enemyAmbushOnServant_／raiseBond_ 各自的寫入發生在此之後，維持原樣不動。
    sheets.pc.getRange(1, 1, pcData.length, pcData[0].length).setValues(pcData);
    // 世界已在同一份 pcData 上 tick 完，直接沿用即可判夜襲，不必重讀整表。
    // ⚔️ 卸防突襲：當敵蹤同地時休息＝酣睡門戶大開，最為兇險（mul 1.5）
    const restAmbush = enemyAmbushOnServant_(sheets, pcData, pIdx, restGameId, 1.5);
    // 🌙 從者之夢（回想）：安睡(≥3h)且未遭突襲時，有機會順著聯繫夢見從者生前傳說的片段，加深羈絆
    let restDreamPrompt = "";
    if ((!restAmbush || restAmbush.homeRepel || restAmbush.peaceful) && restHours >= 3) { // 🏰 陣地反擊／🎲 按兵不動·試探接觸＝安睡無虞·仍可做夢
      const svRow = pcData.find(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === restGameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
      if (svRow && Math.random() < 0.25) {
        const dSvName = String(svRow[COL.PC.NAME]);
        try { raiseBond_(sheets, restGameId, pcName, dSvName, 3, pcData); } catch (e) { }
        restDreamPrompt = servantCard_(svRow) +
          `【系統·從者之夢·回想】御主沉沉睡去，意識卻順著與從者的靈魂聯繫，墜入「${dSvName}」成為英靈之前的記憶長河——夢見其傳說中的一個片段。\n` +
          `★以 Fate／TYPE-MOON 筆觸，用夢境／回想的朦朧史詩質感，演出「${dSvName}」這名英靈生前傳說裡的某一幕（取材自其真實的神話／史實／傳說：其榮光、抉擇、孤獨或傷痕）。讓御主（與玩家）窺見這名英靈所背負的過往與信念。\n` +
          `★【show, don't tell】以畫面與情境流露，不直接點破其願望或心結，停在夢醒後的餘韻與一絲說不清的悸動；收尾可帶一絲「${dSvName}」隱約察覺御主窺見了這段記憶的細微反應，份量點到為止即可。\n` +
          ``;
      }
    }
    // ⚔️ 卸防突襲三分派(單一真實來源 ambushDispatchPrompt_)：歇息這裡沒有獨立的「正常結果」敘事
    //   (那部分由下方 restVictory/restFinalDream 另外處理)，normalFn 只需回空字串即可。
    const restAmbushPrompt = ambushDispatchPrompt_(restAmbush,
      function (a) {
        // 🐛→✅ 舊版無條件講「重創」，GAS 明明已算出 svHpMax/dmg 卻沒換算成實際傷勢用詞——比照撤退追擊同款修法。
        const restSev = dmgSeverityWord_(a.dmg || 0, a.svHpMax);
        return (a.foeCard || '') + `【系統·歇息遭夜襲·已裁定】御主一行於「${pcLoc}」歇息、防備最鬆懈時，潛伏同地的敵從者「${a.enemyName}」${a.stealthy ? '自暗影無聲摸近' : '趁夜殺到'}，一擊擊中「${a.svName || '從者'}」致其${restSev}（−${a.dmg}）${a.destroyed ? '，其靈基崩潰、化作光點消散，御主敗北' : ''}。\n★以 Fate／TYPE-MOON 筆觸描寫酣息被夜襲撕裂的驚變（語氣留白），勝負已由系統結算。`;
      },
      function () { return ""; }
    );
    // 🏆 夢的優先序：夜襲致敗的虛假之夢 > 令咒透支延遲結算的勝利真夢 > 空——兩者互斥(defeat/victory 本就互斥)。
    const restFinalVictory = restVictory && !(restAmbush && restAmbush.defeat);
    const restFinalDream = (restAmbush && restAmbush.defeat) ? restAmbush.dreamPrompt : (restFinalVictory ? restVictoryDream : "");
    STATE_PRE_DATA_ = pcData; // ⚡ 交棒：restHours_/worldTick_/breakStale/夜襲/raiseBond_ 皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
    return JSON.stringify({
      success: true, statusString: buildPlayerStatusString(pcData[pIdx]), healedNames: healedNames, // ⚡ pcData 即權威，免 getFreshStatusString 整表重讀
      loc: pcLoc, wasInjured: wasInjured, restHours: restHours, clock: restClock, ap: apAfter, apMax: AP_PER_DAY, rumors: restRumors,
      ambush: !!restAmbush, defeat: restAmbush ? restAmbush.defeat : false, dreamPrompt: restFinalDream, ambushPrompt: restAmbushPrompt, report: restAmbush ? restAmbush.report : null,
      servantDream: restDreamPrompt,
      victory: restFinalVictory,
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

  pcData.forEach((r, nIdx) => {
    if (String(r[COL.PC.NAME]) === pcName) return;
    if (String(r[COL.PC.IS_PARTY] || "") !== "同行") return;
    if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
    if (r[COL.PC.STATUS] === "屍體" || !(parseInt(r[COL.PC.HP]) > 0)) return;
    const nMax = maxStatsForRow_(r);
    pcData[nIdx][COL.PC.MAX_HP] = nMax.hp; pcData[nIdx][COL.PC.MAX_MP] = nMax.mp;
    pcData[nIdx][COL.PC.HP] = nMax.hp; pcData[nIdx][COL.PC.MP] = nMax.mp;
    pcData[nIdx][COL.PC.STATUS] = normalStatus;
    healedNames.push(r[COL.PC.NAME]);
  });
  const bystanderNames = pcData
    .filter(r => r[COL.PC.ID] != pcId && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
      String(r[COL.PC.LOC]).trim() === pcLoc && !healedNames.includes(r[COL.PC.NAME]))
    .map(r => r[COL.PC.NAME]);
  sheets.pc.getRange(1, 1, pcData.length, pcData[0].length).setValues(pcData);
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：上一行整表寫回的正是這份陣列，權威性由構造保證
  return JSON.stringify({
    success: true, statusString: buildPlayerStatusString(pcData[pIdx]), healedNames: healedNames,
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
  if (isFate && getAp_(myGameId, pcData) < 1) return JSON.stringify({ success: false, needRest: true, message: "行動力不足以好好整備——請休息恢復後再進食。" });
  var clk = getClock_(myGameId, pcData);
  if (!clk) return JSON.stringify({ success: false, message: "此刻無法整備。" });
  var nowAbs = clk.day * 24 + clk.hour;
  pcData[pIdx][COL.PC.MEMORY] = stampMeal_(pcData[pIdx][COL.PC.MEMORY], nowAbs + MEAL_BUFF_HOURS);
  // 🐛→✅ 稽核抓到：原本先整列寫回(帶著扣AP前的舊AP)、chargeApOrReject_才扣AP，讓它內部那道
  //   3欄窄寫又補寫一次——同一列兩次Sheets I/O。改成先扣AP(skipWrite跳過內部窄寫)、扣完AP的
  //   最終狀態再整列寫回一次，跟actionFateBattle同款省I/O寫法。
  var _mealApr = chargeApOrReject_(myGameId, 1, pcData, sheets, "行動力不足以好好整備——請休息恢復後再進食。", { isFate: isFate, skipWrite: true });
  var ap = _mealApr.ap, clock = _mealApr.clock;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  // 🎬 aiPrompt 讓 AI 演出這段整備場景，而非只回罐頭 message。
  var mealSvIdx = findPlayerServantIdx_(pcData, myGameId, "");
  var mealPrompt = masterCard_(pcData[pIdx]) + (mealSvIdx !== -1 ? servantCard_(pcData[mealSvIdx]) : '') +
    `【系統·整備已裁定】御主與從者稍作整備、飽餐一頓——接下來約 ${MEAL_BUFF_HOURS} 小時內，從者出擊命中 +${MEAL_BUFF_BONUS}。\n` +
    `★以 Fate／TYPE-MOON 筆觸【精煉 60~100 字】演出這段戰前用餐、稍事休整的日常小品（一段即可），依從者性格自然流露對這頓飯／這位御主的反應；show, don't tell，語氣輕快不冗長。`;
  // 🐛→✅ 這是本檔唯一沒交棒 STATE_PRE_DATA_ 的耗AP動作(其餘 actionScavenge/actionScout/
  //   actionSetWorkshop/actionSecondWind 等皆有)——平時不影響任何東西(prep_meal 不在
  //   STATE_AFTER_ACTIONS 名單內)，但若這動作剛好跨過第14日時限，Router_Action.gs 的中央攔截拿不到
  //   交棒的 pcData 會多做一次整表重讀，跟其餘動作行為不一致，順手補上。
  STATE_PRE_DATA_ = pcData;
  return JSON.stringify({
    success: true,
    message: `整備完畢——你與從者飽餐一頓、稍事休整。接下來約 ${MEAL_BUFF_HOURS} 小時內，從者出擊命中 +${MEAL_BUFF_BONUS}。`,
    aiPrompt: mealPrompt,
    clock: clock, ap: ap, apMax: AP_PER_DAY, mealBuff: true,
    statusString: buildPlayerStatusString(pcData[pIdx])
  });
}

// 🤝 敵敵盟約標記（【敵盟】<對方御主名>:<到期day>）：撞見兩方敵人擲到「結盟」時 GAS 蓋在雙方御主 MEMORY。
function getEnemyPact_(memory) {
  var m = String(memory || "").match(/【敵盟】([^｜:]+):(\d+)/);
  return m ? { partner: m[1], until: parseInt(m[2]) || 0 } : null;
}
function setEnemyPact_(memory, partnerName, untilDay) {
  var mem = String(memory || "").replace(/【敵盟】[^｜]*/g, "").replace(/｜｜+/g, "｜").replace(/^｜|｜$/g, "");
  var tag = "【敵盟】" + String(partnerName || "").replace(/[｜:【】]/g, "") + ":" + (parseInt(untilDay) || 0);
  return mem ? mem + "｜" + tag : tag;
}

// 🔥 敵敵交惡標記（【交惡】<對方御主名>:<到期day>）：挑撥離間得逞後 GAS 蓋雙方御主——之後撞見他們更可能
//   火併/追殺、不會結盟休整（敵盟的反面）。與敵盟互斥（設交惡先清敵盟、反之亦然）。
function getEnemyFeud_(memory) {
  var m = String(memory || "").match(/【交惡】([^｜:]+):(\d+)/);
  return m ? { partner: m[1], until: parseInt(m[2]) || 0 } : null;
}
function setEnemyFeud_(memory, partnerName, untilDay) {
  var mem = String(memory || "").replace(/【交惡】[^｜]*/g, "").replace(/【敵盟】[^｜]*/g, "").replace(/｜｜+/g, "｜").replace(/^｜|｜$/g, "");
  var tag = "【交惡】" + String(partnerName || "").replace(/[｜:【】]/g, "") + ":" + (parseInt(untilDay) || 0);
  return mem ? mem + "｜" + tag : tag;
}

// 🛡️ 遭趁隙偷襲後的警覺（【提防】<絕對小時>）：短期(WARY_HOURS_)內對你戒心加重，下次趁隙偷襲加乘打折。
var WARY_HOURS_ = 6;
function getWaryAbs_(memory) { var m = String(memory || "").match(/【提防】(\d+)/); return m ? (parseInt(m[1]) || 0) : 0; }
function setWary_(memory, absHour) {
  var mem = String(memory || "").replace(/｜?【提防】\d+/g, "");
  return (mem ? mem + "｜" : "") + "【提防】" + (parseInt(absHour) || 0);
}

// 🎭 撞見兩方敵人的可能局面（資料驅動·GAS 擲、AI 演）。取代舊「永遠互毆→見你停手」單一劇本：
//   依雙方御主性格投契度（masterPersonaLean_）＋從者傷勢＋戰局殘敵數，擲一種局面；HP 餘傷／敵敵盟約
//   等後果由 GAS 落地寫進 allPcData，note 只給 AI 當演出事實。回 factionClash {type,aMaster,bMaster,loserName,note}。
//   加局面＝往權重表 W 加一項＋switch 補一段 note，引擎自動吃。
function resolveFactionEncounter_(allPcData, mA, mB, svA, svB, gameId, day) {
  var idxOf = function (row) { return allPcData.findIndex(function (r) { return String(r[COL.PC.ID]) === String(row[COL.PC.ID]); }); };
  var idxA = idxOf(svA), idxB = idxOf(svB), mIdxA = idxOf(mA), mIdxB = idxOf(mB);
  var mAName = String(mA[COL.PC.NAME] || ""), mBName = String(mB[COL.PC.NAME] || "");
  var svAName = String(svA[COL.PC.NAME] || ""), svBName = String(svB[COL.PC.NAME] || "");
  var hpRatio = function (r) { return (parseInt(r[COL.PC.HP]) || 0) / Math.max(1, parseInt(r[COL.PC.MAX_HP]) || 1); };
  var hpA = hpRatio(svA), hpB = hpRatio(svB);

  // 已締敵盟且未逾期 → 直接演「早已結為一夥」，不再火併。
  var pactA = getEnemyPact_(String(mA[COL.PC.MEMORY] || "")), pactB = getEnemyPact_(String(mB[COL.PC.MEMORY] || ""));
  var alreadyPacted = pactA && pactB && pactA.partner === mBName && pactB.partner === mAName && pactA.until >= day && pactB.until >= day;
  // 🔥 已交惡且未逾期（被你挑撥成功過）→ 撞見時更可能火併/追殺、不會結盟休整。
  var feudA = getEnemyFeud_(String(mA[COL.PC.MEMORY] || "")), feudB = getEnemyFeud_(String(mB[COL.PC.MEMORY] || ""));
  var feuding = feudA && feudB && feudA.partner === mBName && feudB.partner === mAName && feudA.until >= day && feudB.until >= day;

  var leanA = masterPersonaLean_(mA), leanB = masterPersonaLean_(mB);
  var bothPrag = leanA.pragmatic && leanB.pragmatic;
  var anyLoner = leanA.loner || leanB.loner;
  var aliveFoes = 0;
  allPcData.forEach(function (r) {
    if (String(r[COL.PC.GAME_ID] || "") === gameId && String(r[COL.PC.FACTION]) === "敵從者" && !String(r[COL.PC.ID]).startsWith("DEAD_")) aliveFoes++;
  });
  var endgame = aliveFoes <= 3;
  var lopsided = Math.abs(hpA - hpB) >= 0.35;

  // 交手裁決一次（純函式·無 I/O）：定「誰吃虧」；不同局面決定要不要真的落血、落多少。
  var cross = resolveFateBattle_(rowToCombatant_(svA), rowToCombatant_(svB), {});
  var loserIdx = cross.atkWins ? idxB : idxA; // atk=svA 贏→輸家 svB
  var loserName = cross.atkWins ? svBName : svAName;
  var baseDmg = Math.max(1, Math.round((cross.damage || 1) * 0.4));
  // 📊 GAS 戰報：撞見兩方敵人時 GAS 實際落血，記進 clashHits 供前端畫數字卡（絕不讓 AI 亂掰傷害）。
  var clashHits = [];
  var chip = function (idx, mul) {
    if (idx < 0) return 0;
    var d = Math.max(1, Math.round(baseDmg * mul));
    var after = Math.max(1, (parseInt(allPcData[idx][COL.PC.HP]) || 0) - d);
    allPcData[idx][COL.PC.HP] = after;
    clashHits.push({ name: String(allPcData[idx][COL.PC.NAME] || ""), dmg: d, after: after, hpMax: parseInt(allPcData[idx][COL.PC.MAX_HP]) || after });
    return d;
  };
  var moreHurt = (hpA <= hpB) ? svAName : svBName, moreHurtIdx = (hpA <= hpB) ? idxA : idxB;

  // 權重表（資料驅動·依性格/傷勢/戰局動態加權）
  var W = {
    clash: 10,                                                 // 交手餘傷·見你戒備停手（原味）
    frenzy: 6 + (anyLoner ? 6 : 0) + (endgame ? 5 : 0),        // 殺紅眼·沒理你繼續打
    standoff: 6 + (!bothPrag && !anyLoner ? 6 : 0),            // 對峙未發·你的到來是引信
    hunt: 4 + (lopsided ? 9 : 0) + (anyLoner ? 3 : 0),         // 一方追殺殘方
    unite: 5 + (bothPrag ? 4 : 0) + (endgame ? 4 : 0),         // 暫時聯手戒你這外人
    pact: 3 + (bothPrag ? 9 : 0) + (endgame ? 4 : 0),          // 敵敵結盟（設【敵盟】）
    truce: 4 + (bothPrag ? 3 : 0),                             // 各自休整·井水不犯河水
    parley: 3 + (bothPrag ? 7 : 0)                             // 談判中·被你打斷
  };
  // 🔥 交惡中：他們彼此有仇（你挑撥過）→ 抽掉一切和睦選項、狠推火併/追殺。
  if (feuding) {
    W.pact = 0; W.unite = 0; W.truce = 0; W.parley = 0; W.standoff = 0;
    W.frenzy += 14; W.hunt += 8;
  }
  var type;
  if (alreadyPacted) type = 'allied_pair';
  else {
    var total = 0, k;
    for (k in W) total += W[k];
    var roll = Math.random() * total, acc = 0;
    for (k in W) { acc += W[k]; if (roll < acc) { type = k; break; } }
    if (!type) type = 'clash';
  }

  var note;
  switch (type) {
    case 'frenzy':
      note = `你踏進來時，「${mAName}」與「${mBName}」的從者正殺紅了眼死鬥——刀光不停，「${loserName}」已添新傷（−${chip(loserIdx, 1.6)}）。你的出現沒讓他們收手，兩人仍纏鬥不休，只有一瞬掃來提防的餘光。`;
      break;
    case 'standoff':
      note = `「${mAName}」與「${mBName}」的從者兵刃相向、劍拔弩張地對峙，卻誰也沒先動手。你的踏入像投進火藥的一粒火星——三方的緊繃在同一刻被拉到極限。`;
      break;
    case 'hunt':
      note = `這裡正上演一場追殺：一方從者步步進逼，「${moreHurt}」帶著更重的傷（−${chip(moreHurtIdx, 1.2)}）節節後退。你的到來，成了獵人與獵物都得重新盤算的變數。`;
      break;
    case 'unite':
      note = `「${mAName}」與「${mBName}」方才還互不相讓，見你這不速之客闖入，兩人卻不約而同收住招式、警惕地一同轉向你——眼下這個外人，似乎比彼此更值得提防。`;
      break;
    case 'pact':
      if (mIdxA >= 0) allPcData[mIdxA][COL.PC.MEMORY] = setEnemyPact_(String(allPcData[mIdxA][COL.PC.MEMORY] || ""), mBName, day + 3);
      if (mIdxB >= 0) allPcData[mIdxB][COL.PC.MEMORY] = setEnemyPact_(String(allPcData[mIdxB][COL.PC.MEMORY] || ""), mAName, day + 3);
      note = `你撞見的不是廝殺，而是一樁剛談成的密約——「${mAName}」與「${mBName}」握手言和、暫結一夥。兩方從者並肩而立，用審視的目光打量闖入的你：眼下他們是同一陣線。`;
      break;
    case 'truce':
      note = `這裡並沒有火併：一方從者正就地養傷、整備，另一方按兵不動，井水不犯河水地各據一角。你的出現打破了這份微妙的平靜。`;
      break;
    case 'parley':
      note = `你撞見「${mAName}」與「${mBName}」正低聲交涉——條件、算計、彼此的保留都寫在神情裡。談判尚未有結果，你的闖入讓兩人同時噤聲、戒備地看過來。`;
      break;
    case 'allied_pair':
      note = `「${mAName}」與「${mBName}」早已結為一夥，此刻並肩守在這裡。他們沒有內鬥，只有對你這外人的共同戒心。`;
      break;
    case 'clash':
    default:
      type = 'clash';
      note = `你抵達時，「${mAName}」與「${mBName}」的從者已鏖戰多時——「${loserName}」帶著新添的傷勢（−${chip(loserIdx, 1.0)}），雙方在你踏入的瞬間戒備地停手，各自警惕地看向這個不速之客。`;
      break;
  }
  // 有實際落血才附戰報卡（frenzy/hunt/clash 三種會 chip；其餘局面無傷→無卡，純敘事）。
  var report = clashHits.length ? { factionClash: true, ftype: type, aMaster: mAName, bMaster: mBName, hits: clashHits } : null;
  return { type: type, aMaster: mAName, bMaster: mBName, loserName: loserName, note: note, report: report, choices: encounterChoices_(type) };
}

// 局面 type → 開放的情境選擇（前端據此顯示按鈕）。ambush＝趁隙偷襲／incite＝挑撥離間／slip＝悄悄離開不被追擊。
var FACTION_ENCOUNTER_CHOICES_ = {
  frenzy:      { ambush: true,  incite: false, slip: true },  // 殺紅眼死鬥·忙著彼此→可趁隙、可溜走
  standoff:    { ambush: true,  incite: true,  slip: false }, // 對峙·可趁隙、可煽動開打
  parley:      { ambush: true,  incite: true,  slip: true },  // 談判中·可趁隙、可攪局、可溜走
  pact:        { ambush: true,  incite: false, slip: true },  // 剛結盟·注意力在彼此→可趁隙、可溜走
  hunt:        { ambush: false, incite: false, slip: false },
  unite:       { ambush: false, incite: false, slip: false }, // 已一起盯著你→無隙可趁
  clash:       { ambush: false, incite: false, slip: false },
  truce:       { ambush: false, incite: false, slip: false },
  allied_pair: { ambush: false, incite: false, slip: false }
};
function encounterChoices_(type) { return FACTION_ENCOUNTER_CHOICES_[type] || { ambush: false, incite: false, slip: false }; }

// 🎯 撞見敵人後的「可反應窗口」：御主 MEMORY【趁隙】<loc>@<type>@<svA>、<svB>。決定抵達這格開放哪些情境選擇。
//   窗口在「再次移動」時清掉（悄悄離開）或被下一次抵達覆寫；趁隙/挑撥用掉即清。
// 🐛→✅ names 補上這場局面實際牽涉的兩名敵從者真名——舊版只存 loc@type，actionIncite 事後靠
//   陣列順序重新猜「前兩個」敵從者，同地若有第三組完全無關的敵人排在更前面，會被誤挑撥/誤傷，
//   跟玩家剛讀到的敘事(哪兩個在對峙)完全脫鉤。有 names 就精確鎖定，缺 names(相容舊呼叫)才退回猜測。
function setEncounterWindow_(memory, loc, type, names) {
  var mem = clearEncounterWindow_(memory);
  var safeNames = (names || []).filter(Boolean).map(function (n) { return String(n).replace(/[｜@【】、]/g, ""); });
  var tag = "【趁隙】" + String(loc || "").replace(/[｜@【】]/g, "") + "@" + String(type || "") + (safeNames.length ? "@" + safeNames.join("、") : "");
  return mem ? mem + "｜" + tag : tag;
}
function getEncounterWindow_(memory) {
  var m = String(memory || "").match(/【趁隙】([^｜@]+)@([a-z_]+)(?:@([^｜]*))?/);
  return m ? { loc: m[1], type: m[2], names: m[3] ? m[3].split("、").filter(Boolean) : [] } : null;
}
function clearEncounterWindow_(memory) {
  return String(memory || "").replace(/【趁隙】[^｜]*/g, "").replace(/｜｜+/g, "｜").replace(/^｜|｜$/g, "");
}

// 🥷 趁隙偷襲：撞見敵人分心（殺紅眼/對峙/談判/剛結盟）時，我方從者搶一記奇襲。複用 resolveFateBattle_ 的 ambush 先機，
//   鏡射 enemyAmbushOnServant_ 反向版：命中才傷、奇襲加乘、處理敵死亡(DEAD_/無牙御主/勝利)。回 out 物件（err＝不合法）。
function playerAmbushOnEnemy_(sheets, pcData, pIdx, gameId, targetName) {
  var myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  var day = parseInt(pcData[pIdx][COL.PC.DAY]) || 1;
  var svIdx = pcData.findIndex(function (r) { return String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_"); });
  if (svIdx === -1) return { err: "你沒有可出擊的從者。" };
  var want = nameLoose_(targetName);
  var eIdx = pcData.findIndex(function (r) {
    return String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
      String(r[COL.PC.LOC]).trim() === myLoc && !isAllied_(r) && hasArrived_(r, day) && (!want || nameLoose_(r[COL.PC.NAME]) === want);
  });
  if (eIdx === -1) return { err: "當前沒有那名可趁隙偷襲的敵從者。" };
  var atkC = rowToCombatant_(pcData[svIdx]);
  injectMysticBuff_(atkC, pcData[pIdx][COL.PC.MEMORY]);
  injectMasterSupportFor_(atkC, pcData, gameId, pcData[pIdx], false);
  var defC = rowToCombatant_(pcData[eIdx]);
  var probe = resolveFateBattle_(atkC, defC, { ambush: true, skill: servantActiveSkill_(atkC) });
  var baseDmg = probe.atkWins ? (probe.damage || 1) : Math.max(1, Math.round(rankVal(atkC.six['筋力'] || 'C') * 0.5));
  // 🗡️🫶 趁隙奇襲加乘：敵越信你(對你好感高)＝越沒料到你會偷襲＝這一記越狠；越提防你則打不出全效。
  var ambushMul = 1.3 + Math.max(-0.25, Math.min(0.5, bondFavor_(pcData[eIdx]) * 0.5));
  // 🛡️ 近期才被你趁隙偷襲過(【提防】)＝戒心未消、這一記大打折扣（配套後續：偷襲不再能無限白嫖同一人）。
  var _absNow = (parseInt(pcData[pIdx][COL.PC.DAY]) || 1) * 24 + (parseInt(pcData[pIdx][COL.PC.HOUR]) || 0);
  var _wary = getWaryAbs_(pcData[eIdx][COL.PC.MEMORY]);
  var stillWary = _wary > 0 && (_absNow - _wary) >= 0 && (_absNow - _wary) < WARY_HOURS_;
  if (stillWary) ambushMul *= 0.6;
  var dmg = Math.max(1, Math.round(baseDmg * ambushMul));
  // 🐛→✅ 玩家實測抓到：foeCard 跟呼叫端的己方servantCard_各自帶一份收尾句——這裡skipClose，
  //   呼叫端(actionPlayerAmbush)組完兩張卡後用performanceNote_()統一講一次。
  var out = { enemyName: String(pcData[eIdx][COL.PC.NAME]), svName: String(pcData[svIdx][COL.PC.NAME]), dmg: dmg, hit: !!probe.atkWins, destroyed: false, victory: false, dreamPrompt: "", foeCard: '〔趁隙偷襲的目標〕' + servantCard_(pcData[eIdx], { skipClose: true }) };
  var severed = hasFx_(atkC, 'rule_breaker') || hasFx_(atkC, 'anti_magic_lance');
  var eHp = parseInt(pcData[eIdx][COL.PC.HP]) || 0, after = eHp - dmg;
  // 🐛→✅ 稽核抓到：survive跟god_hand結構性互斥(見fateStrike_同款規則)，這裡原本沒排除god_hand——
  //   同時持有兩者時survive會搶先頂血，god_hand的after<=0判斷永遠進不去，燒命帳目跟主戰鬥路徑對不上。
  if (after <= 0 && hasFx_(defC, 'survive') && !hasFx_(defC, 'god_hand') && eHp > 1 && !severed) after = 1;
  if (after <= 0 && !severed && hasFx_(defC, 'god_hand')) {
    var lives = getGodHandLives_(pcData[eIdx][COL.PC.MEMORY]);
    if (lives > 0) { after = Math.max(1, Math.round((parseInt(pcData[eIdx][COL.PC.MAX_HP]) || 300) * 0.2)); pcData[eIdx][COL.PC.MEMORY] = setGodHandLives_(pcData[eIdx][COL.PC.MEMORY], lives - 1); out.godRevived = true; }
  }
  if (after <= 0) {
    out.destroyed = true;
    markMasterLostServant_(sheets.pc, pcData, eIdx, `被『${atkC.name}』趁隙偷襲當場擊破`);
    pcData[eIdx][COL.PC.ID] = "DEAD_" + String(pcData[eIdx][COL.PC.ID]); pcData[eIdx][COL.PC.HP] = 0;
    pcData[eIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "遭趁隙奇襲·靈基崩潰", "顏面": "已無生息" });
    if (aliveEnemyServants_(sheets, gameId, pcData) <= 0) {
      out.victory = true;
      out.dreamPrompt = buildVictoryDreamPrompt_(pcData[pIdx][COL.PC.NAME], extractWish_(pcData[pIdx][COL.PC.MEMORY]), atkC.name);
    }
  } else {
    pcData[eIdx][COL.PC.HP] = after;
    pcData[eIdx][COL.PC.MEMORY] = setWary_(pcData[eIdx][COL.PC.MEMORY], _absNow); // 🛡️ 沒殺死→對方戒心加重，短期內難再趁隙
    out.nowWary = true;
  }
  sheets.pc.getRange(eIdx + 1, 1, 1, pcData[eIdx].length).setValues([pcData[eIdx]]);
  out.after = Math.max(0, after);
  out.eHpMax = parseInt(pcData[eIdx][COL.PC.MAX_HP]) || 0;
  out.report = { ambush: true, player: true, enemyName: out.enemyName, svName: out.svName, dmg: dmg, after: out.after, eHpMax: out.eHpMax, destroyed: out.destroyed, victory: out.victory, hit: out.hit };
  return out;
}

// 🥷 趁隙偷襲 action：只在有效趁隙窗口＋窗口 loc＝當前地＋type 允許 ambush 時可用。耗 1 AP、用掉即清窗口。
function actionFactionAmbush(userData, pcId, sheets) {
  var pcData = sheets.pc.getDataRange().getValues();
  var pIdx = pcData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  var gameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  if (gameId.indexOf("g_") !== 0) return JSON.stringify({ success: false, message: "此刻無法行動。" });
  var win = getEncounterWindow_(pcData[pIdx][COL.PC.MEMORY]);
  if (!win || win.loc !== String(pcData[pIdx][COL.PC.LOC]).trim() || !encounterChoices_(win.type).ambush)
    return JSON.stringify({ success: false, message: "眼下已沒有可趁的空隙了。" });
  if (getAp_(gameId, pcData) < 1) return JSON.stringify({ success: false, needRest: true, message: "行動力不足以搶這一手。" });
  var res = playerAmbushOnEnemy_(sheets, pcData, pIdx, gameId, String(userData.targetName || ""));
  if (res.err) return JSON.stringify({ success: false, message: res.err });
  pcData[pIdx][COL.PC.MEMORY] = clearEncounterWindow_(pcData[pIdx][COL.PC.MEMORY]); // 用掉即清窗口
  // 🐛→✅ 稽核抓到：chargeApOrReject_原本沒skipWrite，內部窄寫(AP/day/hour)後緊接著下一行又整列
  //   寫回同一列——同一列兩次Sheets I/O。補skipWrite:true，讓下面這次整列寫回一次到位。
  var _ambApr = chargeApOrReject_(gameId, 1, pcData, sheets, "行動力不足以搶這一手。", { isFate: true, skipWrite: true });
  var ap = _ambApr.ap, clock = _ambApr.clock;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]); // 寫回御主列(窗口清除＋AP)
  // 🐛→✅ 舊版命中就無條件講「重創」，GAS 明明算出 eHpMax 卻沒換算實際傷勢比例——比照其餘兩處撤退/夜襲同款修法。
  var _ambSev = dmgSeverityWord_(res.dmg || 0, res.eHpMax);
  var hitTxt = res.hit ? `一擊得手，「${res.enemyName}」${_ambSev}（−${res.dmg}）` : `倉促搶攻只擦過「${res.enemyName}」（−${res.dmg}）`;
  var _mySvIdx = findPlayerServantIdx_(pcData, gameId, "");
  var aiPrompt = servantCard_(pcData[_mySvIdx !== -1 ? _mySvIdx : pIdx], { skipClose: true }) + res.foeCard + performanceNote_([res.svName, res.enemyName]) +
    `【系統·趁隙偷襲·已裁定】趁「${res.enemyName}」分心之際，你的從者搶先發難——${hitTxt}${res.destroyed ? '，將其當場擊破！' : '，對方旋即警覺、不再有隙可趁。'}\n` +
    `★以 Fate／TYPE-MOON 筆觸【約 80~140 字】演出這記趁隙奇襲：把握、突發、對方由鬆懈轉為戒備的瞬間；依雙方性格演，別自行加碼改寫勝負（傷害已由系統結算）。`;
  STATE_PRE_DATA_ = pcData;
  return JSON.stringify({
    success: true, aiPrompt: aiPrompt, report: res.report,
    victory: res.victory || false, dreamPrompt: res.dreamPrompt || "",
    clock: clock, ap: ap, apMax: AP_PER_DAY, statusString: buildPlayerStatusString(pcData[pIdx])
  });
}

// 🎭 挑撥離間 action：對峙/談判局面時煽風點火。GAS 依雙方御主性格擲成敗——成功→兩敵真打起來(雙方扣血·保1)；
//   反效果→他們看穿、一起轉頭戒你(無數值懲罰、白費 1 AP)。耗 1 AP、用掉即清窗口。
function actionIncite(userData, pcId, sheets) {
  var pcData = sheets.pc.getDataRange().getValues();
  var pIdx = pcData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  var gameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  if (gameId.indexOf("g_") !== 0) return JSON.stringify({ success: false, message: "此刻無法行動。" });
  var myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  var day = parseInt(pcData[pIdx][COL.PC.DAY]) || 1;
  var win = getEncounterWindow_(pcData[pIdx][COL.PC.MEMORY]);
  if (!win || win.loc !== myLoc || !encounterChoices_(win.type).incite)
    return JSON.stringify({ success: false, message: "此刻沒有可挑撥的對立局面。" });
  if (getAp_(gameId, pcData) < 1) return JSON.stringify({ success: false, needRest: true, message: "行動力不足。" });
  // 找同地兩名不同陣營敵從者（各自御主判性格）
  var foeSvs = [];
  pcData.forEach(function (r, i) {
    if (String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
      String(r[COL.PC.LOC]).trim() === myLoc && !isAllied_(r) && hasArrived_(r, day)) foeSvs.push(i);
  });
  if (foeSvs.length < 2) return JSON.stringify({ success: false, message: "這裡沒有兩方可供挑撥的敵人。" });
  // 🐛→✅ 舊版固定取 foeSvs[0]/[1](陣列/試算表列序)，跟玩家剛讀到的敘事(resolveFactionEncounter_
  //   實際挑中哪兩組)毫無關聯——同地≥3組敵人時，可能挑撥/傷到敘事完全沒提到的第三組。win.names
  //   帶著那場敘事真正牽涉的兩個真名，優先用真名精確比對；缺 names(相容舊窗口)才退回陣列順序猜測。
  var iA, iB;
  if (win.names && win.names.length >= 2) {
    iA = foeSvs.find(function (i) { return String(pcData[i][COL.PC.NAME]) === win.names[0]; });
    iB = foeSvs.find(function (i) { return String(pcData[i][COL.PC.NAME]) === win.names[1]; });
  }
  if (iA == null || iB == null || iA === iB) { iA = foeSvs[0]; iB = foeSvs[1]; }
  var mIdxA = enemyMasterIdx_(pcData, iA, gameId), mIdxB = enemyMasterIdx_(pcData, iB, gameId);
  var leanA = mIdxA >= 0 ? masterPersonaLean_(pcData[mIdxA]) : { pragmatic: false, loner: true };
  var leanB = mIdxB >= 0 ? masterPersonaLean_(pcData[mIdxB]) : { pragmatic: false, loner: true };
  var prob = 0.5 + ((leanA.loner || leanB.loner) ? 0.2 : 0) - ((leanA.pragmatic && leanB.pragmatic) ? 0.25 : 0);
  // 🫶 他們越信你(對你好感高)，越聽得進你的挑撥；越提防你，越可能識破反過來一起戒你。
  prob += (bondFavor_(pcData[iA]) + bondFavor_(pcData[iB])) / 2 * 0.25;
  prob = Math.max(0.1, Math.min(0.85, prob));
  var success = Math.random() < prob;
  var svAName = String(pcData[iA][COL.PC.NAME]), svBName = String(pcData[iB][COL.PC.NAME]);
  // 🐛→✅ 挑撥離間指名兩個具體角色、要求AI演出他們反目/合流戒備的性格化反應，卻從沒附上他們的演出依據
  //   卡(比照唯一姊妹路徑 actionFactionAmbush 已有的 servantCard_+foeCard 慣例)。
  // 🐛→✅ 玩家實測抓到：兩張卡各自帶一份完整「怎麼演」收尾句——skipClose後用performanceNote_()講一次。
  var inciteCardsStr = '〔敵方A〕' + servantCard_(pcData[iA], { skipClose: true }) + '〔敵方B〕' + servantCard_(pcData[iB], { skipClose: true }) + performanceNote_([svAName, svBName]);
  var aiPrompt, report;
  if (success) {
    var cross = resolveFateBattle_(rowToCombatant_(pcData[iA]), rowToCombatant_(pcData[iB]), {});
    var loIdx = cross.atkWins ? iB : iA, wiIdx = cross.atkWins ? iA : iB;
    var loName = cross.atkWins ? svBName : svAName;
    var loDmg = Math.max(1, Math.round((cross.damage || 1) * 0.6));
    var wiDmg = Math.max(1, Math.round((cross.damage || 1) * 0.25));
    var loAfter = Math.max(1, (parseInt(pcData[loIdx][COL.PC.HP]) || 0) - loDmg);
    var wiAfter = Math.max(1, (parseInt(pcData[wiIdx][COL.PC.HP]) || 0) - wiDmg);
    pcData[loIdx][COL.PC.HP] = loAfter;
    pcData[wiIdx][COL.PC.HP] = wiAfter;
    // 🔥 後續配套：得逞→兩敵結下樑子(【交惡】雙方御主，至 day+3)，之後撞見他們更可能火併/追殺、不會結盟。
    if (mIdxA >= 0 && mIdxB >= 0) {
      var _mAName = String(pcData[mIdxA][COL.PC.NAME]), _mBName = String(pcData[mIdxB][COL.PC.NAME]);
      pcData[mIdxA][COL.PC.MEMORY] = setEnemyFeud_(pcData[mIdxA][COL.PC.MEMORY], _mBName, day + 3);
      pcData[mIdxB][COL.PC.MEMORY] = setEnemyFeud_(pcData[mIdxB][COL.PC.MEMORY], _mAName, day + 3);
    }
    // 🐛→✅ 稽核抓到：舊版loIdx/wiIdx/mIdxA/mIdxB各自立即setValues(最多4次)，改成全程只改記憶體，
    //   跟函式尾端bumpBond_(skipWrite)/chargeApOrReject_(skipWrite)一起併入下方單次整表寫回。
    aiPrompt = inciteCardsStr + `【系統·挑撥離間·得逞】你三言兩語點燃了「${svAName}」與「${svBName}」之間的火——兩人當真打了起來，「${loName}」吃了較重的一擊（−${loDmg}），另一方亦掛彩（−${wiDmg}），自此結下樑子。\n` +
      `★以 Fate／TYPE-MOON 筆觸【約 80~140 字】演出你如何煽風點火、兩方如何被激得反目相向；你則在一旁坐收其亂。傷害已由系統結算。`;
    var wiName = cross.atkWins ? svAName : svBName;
    report = { incite: true, success: true, aName: svAName, bName: svBName,
      loName: loName, loDmg: loDmg, loAfter: loAfter, loHpMax: parseInt(pcData[loIdx][COL.PC.MAX_HP]) || loAfter,
      wiName: wiName, wiDmg: wiDmg, wiAfter: wiAfter, wiHpMax: parseInt(pcData[wiIdx][COL.PC.MAX_HP]) || wiAfter };
  } else {
    // 🫶 後續配套：被看穿→兩敵對你更反感，各降 4 好感（你操弄未遂、留下芥蒂）。
    bumpBond_(sheets, pcData, iA, -4, true);
    bumpBond_(sheets, pcData, iB, -4, true);
    aiPrompt = inciteCardsStr + `【系統·挑撥離間·被看穿】你試圖挑撥「${svAName}」與「${svBName}」反目，卻被兩人一眼看穿——他們非但沒中計，反而不約而同地轉過頭，戒備地一同盯向你這攪局的外人，對你的好感也淡了幾分。\n` +
      `★以 Fate／TYPE-MOON 筆觸【約 70~120 字】演出這記挑撥落空、兩方合流戒你的尷尬瞬間；語氣別替玩家決定接下來怎麼辦。`;
    report = { incite: true, success: false, aName: svAName, bName: svBName };
  }
  pcData[pIdx][COL.PC.MEMORY] = clearEncounterWindow_(pcData[pIdx][COL.PC.MEMORY]);
  // 🐛→✅ 稽核抓到：chargeApOrReject_原本沒skipWrite，內部窄寫後下一行又整列寫回同一列，同一列
  //   兩次Sheets I/O。補skipWrite:true，讓下面這次整列寫回一次到位。
  var _inciteApr = chargeApOrReject_(gameId, 1, pcData, sheets, "行動力不足。", { isFate: true, skipWrite: true });
  var ap = _inciteApr.ap, clock = _inciteApr.clock;
  // 🐛→✅ 稽核抓到：舊版loIdx/wiIdx/mIdxA/mIdxB各自立即setValues、bumpBond_也各自立即setValue，
  //   成功分支最多6次Sheets I/O往返——現全程只改記憶體pcData，這裡單次整表寫回一次到位。
  sheets.pc.getRange(1, 1, pcData.length, pcData[0].length).setValues(pcData);
  STATE_PRE_DATA_ = pcData;
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, report: report, clock: clock, ap: ap, apMax: AP_PER_DAY, statusString: buildPlayerStatusString(pcData[pIdx]) });
}

// 🆘 盟友告急偵測（同盟配套）：找一名在【別處】、與未結盟活敵從者同格的盟友——他正被人纏上、有難。
//   回 {ally, loc, foe, allyFaction} 供前端報信＋「趕去馳援」；查無回 null。情報共享故玩家得知(結盟即無戰爭迷霧)。
function detectAllyPeril_(pcData, gameId, playerLoc, curDay) {
  var pl = String(playerLoc || "").trim(), d = parseInt(curDay) || 1;
  for (var i = 1; i < pcData.length; i++) {
    var r = pcData[i];
    if (String(r[COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(r[COL.PC.ID]).startsWith("DEAD_")) continue;
    var fac = String(r[COL.PC.FACTION]);
    if ((fac !== "敵御主" && fac !== "敵從者") || !isAllied_(r)) continue; // 只看盟友
    var loc = String(r[COL.PC.LOC] || "").trim();
    if (!loc || loc === pl) continue; // 在玩家這格＝已能就近援手、不必報信
    var foe = pcData.find(function (x) {
      return String(x[COL.PC.FACTION]) === "敵從者" && String(x[COL.PC.GAME_ID] || "") === gameId &&
        !String(x[COL.PC.ID]).startsWith("DEAD_") && !isAllied_(x) && String(x[COL.PC.LOC] || "").trim() === loc && hasArrived_(x, d);
    });
    if (foe) {
      // 🐛→✅ 舊版回傳沒帶血量，呼叫端只能無條件講「情勢緊繃」——GAS明明有這名盟友的HP/上限，
      //   卻沒算成緊急程度餵給AI，導致95%血量從容應對 跟 8%血量命懸一線 讀起來一樣嚴重。
      var allyHpMax = parseInt(r[COL.PC.MAX_HP]) || 1;
      var allyHpRatio = allyHpMax ? (parseInt(r[COL.PC.HP]) || 0) / allyHpMax : 1;
      return { ally: String(r[COL.PC.NAME]), allyFaction: fac, loc: loc, foe: String(foe[COL.PC.NAME]), hpRatio: allyHpRatio };
    }
  }
  return null;
}

// ⚔️ 卸防突襲：在同地有清醒敵從者時做「補魔／羈絆／休息」等卸下防備之舉，會招致敵從者趁隙重擊我方從者
//   （氣息遮斷／暗殺職階更致命）。回 null＝無敵不觸發；否則 {enemyName,dmg,defeat,dreamPrompt,after,stealthy}。
function enemyAmbushOnServant_(sheets, pcData, pIdx, gameId, baseMul) {
  const myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  const ambushDay = parseInt(pcData[pIdx][COL.PC.DAY]) || 1; // 🕰️ 尚未登場者不會夜襲
  // 🐛→✅ 玩家反應「不可能每次休息/補魔/結盟都是打我吧」——舊碼不論好感一律突襲，跟移動路徑既有的
  //   「BOND≥50＝友好·不追殺」門檻(見上方 actionMove 的 hostile check)不一致：已經養出交情的敵從者
  //   沒理由每次都翻臉偷襲。門檻對齊同一顆常數，友好者這裡直接視為無敵可趁。
  const eIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === myLoc && !isAllied_(r) && hasArrived_(r, ambushDay) && (parseInt(r[COL.PC.BOND]) || 0) < 50);
  if (eIdx === -1) return null;
  const svIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (svIdx === -1) return null;
  // 🏰 陣地·安全港·反擊：玩家於【自己佈設的陣地】(隊有陣地作成從者)遭潛入 → 結界示警、機關迭起，從者從容起身反擊、
  //   將來犯者擊退驅離(敵扣血·保1不斬)，我方毫髮無傷；代價＝御主耗魔維持結界。魔力不足則結界失效、照常挨突襲。
  const homeRank = homeTerritoryRank_(pcData, pIdx, gameId);
  if (homeRank) {
    const wardCost = 20 + Math.round(rankVal(homeRank) * 0.6); // ~30~55 魔·隨陣地作成階
    const mMp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
    if (mMp >= wardCost) {
      pcData[pIdx][COL.PC.MP] = mMp - wardCost;
      sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
      const svR = rowToCombatant_(pcData[svIdx]); injectHomeField_(svR, homeRank);
      // 🐛→✅ 稽核抓到：反擊方svR漏注禮裝(injectMysticBuff_)與御主體術/魔術支援(injectMasterSupportFor_)，
      //   對照鏡射函式playerAmbushOnEnemy_(831-833行)兩者皆注——同一段代碼裡敵方eDefC卻正確拿到
      //   支援，形成不對稱，禮裝越貴/御主養得越好的玩家在這條合法防禦機制裡傷害被系統性低估。
      injectMysticBuff_(svR, pcData[pIdx][COL.PC.MEMORY]);
      injectMasterSupportFor_(svR, pcData, gameId, pcData[pIdx], false);
      const eDefC = rowToCombatant_(pcData[eIdx]);
      injectMasterSupportFor_(eDefC, pcData, gameId, pcData[eIdx], true);
      const cr = resolveFateBattle_(svR, eDefC, {});
      const backDmg = Math.max(1, Math.round((cr.atkWins ? (cr.damage || 1) : rankVal(svR.six['筋力'] || 'C')) * 0.6));
      const eHp = parseInt(pcData[eIdx][COL.PC.HP]) || 0, eAfter = Math.max(1, eHp - backDmg); // 驅離·保1不斬殺
      pcData[eIdx][COL.PC.HP] = eAfter;
      sheets.pc.getRange(eIdx + 1, 1, 1, pcData[eIdx].length).setValues([pcData[eIdx]]);
      const eNm = String(pcData[eIdx][COL.PC.NAME]), sNm = String(pcData[svIdx][COL.PC.NAME]);
      // 🐛→✅ 這支從沒附上入侵者的演出卡(servantCard_)，指令又寫死「語氣留白」——AI 完全沒有這名
      //   敵從者的性格/口吻依據，只能寫成無聲的暗影，玩家回報「對方沒有對話??」。四個突襲呼叫端
      //   (休息/羈絆/結盟/補魔)都吃這支函式的回傳，補一次就四處一起修好(單一真實來源)。
      const eFoeCard = '〔夜襲者〕' + servantCard_(pcData[eIdx]);
      // 🐛→✅ homeRank(D~EX)是GAS已經算出的陣地規模事實，舊版卻沒換算成強度用詞——同一句「優雅擊退」
      //   套在陽春D階土壘跟EX階空中庭園級結界上，AI完全分不出差異，讀起來千篇一律。
      const homeRankScale = rankVal(homeRank) >= 60 ? '堪比城砦的壯闊結界' : rankVal(homeRank) >= 40 ? '頗具規模的堅實結界' : '倉促佈設的簡易結界';
      return {
        homeRepel: true, enemyName: eNm, svName: sNm, backDmg: backDmg, wardCost: wardCost, homeRank: homeRank,
        dmg: 0, destroyed: false, defeat: false, dreamPrompt: "", after: parseInt(pcData[svIdx][COL.PC.HP]) || 0,
        foeCard: eFoeCard,
        repelNote: eFoeCard + `【系統·陣地反擊·已裁定】潛伏同地的敵從者「${eNm}」欲趁御主一行卸防時偷襲，然此地正是我方親手佈設的陣地——${homeRankScale}示警、機關迭起，「${sNm}」從容起身、反手將來犯者擊退驅離（敵受創 −${backDmg}），我方毫髮無傷（御主耗 ${wardCost} 魔維持結界運作）。\n★以 Fate／TYPE-MOON 筆觸演出「潛入者反被主場結界與從者從容擊退」的優雅反制，結界的氣勢與規模需貼合上述描述——「${eNm}」依其性格可以有反應/一兩句話(不甘、譏諷、冷笑皆可，狂化者改用低吼/肢體)，別把入侵者寫成毫無聲息的純背景。`,
        report: { homeRepel: true, ambush: false, enemyName: eNm, svName: sNm, backDmg: backDmg, wardCost: wardCost, homeRank: homeRank }
      };
    }
  }
  // 🎲 卸防時刻的敵方反應多樣化（玩家回饋「不可能每次都是打我」）：不是每次都直接開打——
  //   依這名敵從者的職階/性格擲一次，多數仍是偷襲(維持既有的臨場威脅感)，但狂化(無法言語)／
  //   暗殺(本色即偷襲)以外的職階，有機會按兵不動觀望、或帶著戒心試探接觸(無戰鬥、羈絆小幅變動)。
  const eClsForRoll = String(pcData[eIdx][COL.PC.RANK] || "");
  const eCombatant0 = rowToCombatant_(pcData[eIdx]);
  const eCantTalk = hasFx_(eCombatant0, 'mad') || eClsForRoll === 'Assassin';
  if (!eCantTalk) {
    const eLean = masterPersonaLean_(pcData[eIdx]);
    const eBondNow = parseInt(pcData[eIdx][COL.PC.BOND]) || 40;
    const W = {
      ambush: 62 - (eLean.pragmatic ? 10 : 0) + (eLean.loner ? 8 : 0),
      observe: 20 + (eLean.pragmatic ? 6 : 0),
      probe: 18 + Math.max(0, Math.round((eBondNow - 40) / 3)) // 好感越接近友好門檻，越傾向試探而非開打
    };
    const totalW = W.ambush + W.observe + W.probe;
    const rollW = Math.random() * totalW;
    const outcome = rollW < W.ambush ? 'ambush' : (rollW < W.ambush + W.observe ? 'observe' : 'probe');
    if (outcome !== 'ambush') {
      const eNm2 = String(pcData[eIdx][COL.PC.NAME]), svNm2 = String(pcData[svIdx][COL.PC.NAME]);
      const foeCard2 = '〔潛伏者〕' + servantCard_(pcData[eIdx]);
      if (outcome === 'observe') {
        return {
          homeRepel: false, peaceful: true, kind: 'observe', enemyName: eNm2, svName: svNm2,
          dmg: 0, destroyed: false, defeat: false, dreamPrompt: "", after: parseInt(pcData[svIdx][COL.PC.HP]) || 0,
          foeCard: foeCard2,
          repelNote: foeCard2 + `【系統·卸防時刻·已裁定】潛伏同地的敵從者「${eNm2}」其實已窺見這破綻，卻按兵不動、只是冷眼旁觀——似乎另有盤算，此刻並未出手。\n★以 Fate／TYPE-MOON 筆觸演出「${svNm2}」一行渾然不覺、或事後驚覺曾被窺伺的一絲寒意(依性格擇一)；「${eNm2}」依其性格演出這份按兵不動的姿態與神情/隻言片語即可，不必開打。`,
          report: { peaceful: true, kind: 'observe', enemyName: eNm2, svName: svNm2 }
        };
      }
      const bump = 2 + Math.floor(Math.random() * 4); // 小幅 +2~5
      const afterBond = bumpBond_(sheets, pcData, eIdx, bump);
      return {
        homeRepel: false, peaceful: true, kind: 'probe', enemyName: eNm2, svName: svNm2,
        dmg: 0, destroyed: false, defeat: false, dreamPrompt: "", after: parseInt(pcData[svIdx][COL.PC.HP]) || 0,
        foeCard: foeCard2, bondAfter: afterBond,
        repelNote: foeCard2 + `【系統·卸防時刻·已裁定】潛伏同地的敵從者「${eNm2}」現身，卻沒有動手——帶著幾分戒心，像是想試探些什麼(好感 ${afterBond}/100)。\n★以 Fate／TYPE-MOON 筆觸演出這場短暫、帶著猜忌與算計的試探性接觸(一兩句交鋒或對峙即可)：兩邊都清楚此刻並非開戰時機，「${eNm2}」依其性格留下一絲若有似無的試探或警告，不必開打、也不必交心。`,
        report: { peaceful: true, kind: 'probe', enemyName: eNm2, svName: svNm2, bondAfter: afterBond }
      };
    }
  }
  const enemyC = rowToCombatant_(pcData[eIdx]);
  const svC = rowToCombatant_(pcData[svIdx]);
  // 🥋🔮 突襲主角是 enemyC(攻方)：補上其硬連結敵御主的體術/魔術支援。
  injectMasterSupportFor_(enemyC, pcData, gameId, pcData[eIdx], true);
  // 🎯 敵AI自動施展招牌施放技術(免費·戰鬥本色)：還原單層歸屬前這些是免費被動的敵方偷襲威力。
  const probe = resolveFateBattle_(enemyC, svC, { ambush: true, skill: servantActiveSkill_(enemyC) });
  let mul = baseMul || 1.4;
  const stealthy = String(pcData[eIdx][COL.PC.RANK]) === 'Assassin' || !!hasFx_(enemyC, 'stealth');
  if (stealthy) mul *= 1.4; // 氣息遮斷／暗殺趁虛而入更致命
  // 突襲傷害取「敵方端」：敵擲贏→全力；玩家從者擲贏(擋下)→大減、底傷依敵方筋力而非我方攻擊力(避免從者越強、突襲傷反而越重)。
  const enemyBase = probe.atkWins ? (probe.damage || 1) : Math.round(rankVal(enemyC.six['筋力'] || 'C') * 1.2 + 6);
  const dmg = Math.max(1, Math.round(enemyBase * mul));
  // 🎭 foeCard：比照戰鬥主路徑附上敵從者演出卡(性格/口吻/狂化禁言)，四個突襲呼叫端(休息/羈絆/結盟/補魔)共用。
  const out = { enemyName: String(pcData[eIdx][COL.PC.NAME]), dmg: dmg, destroyed: false, defeat: false, dreamPrompt: "", after: 0, stealthy: stealthy, foeCard: '〔夜襲者〕' + servantCard_(pcData[eIdx]) };
  // 🗡️ 斬斷救贖(severed)：與 fateStrike_ 同一道閘門，確保帶 rule_breaker/anti_magic_lance 的敵從者不會靠突襲繞過戰鬥續行/復活封鎖。
  const severed = hasFx_(enemyC, 'rule_breaker') || hasFx_(enemyC, 'anti_magic_lance');
  let hp = parseInt(pcData[svIdx][COL.PC.HP]) || 0, after = hp - dmg;
  // 🐛→✅ 稽核抓到：survive跟god_hand結構性互斥(見fateStrike_同款規則)，這裡原本沒排除god_hand——
  //   同時持有兩者時survive會搶先頂血，god_hand的after<=0判斷永遠進不去，燒命帳目跟主戰鬥路徑對不上。
  if (after <= 0 && hasFx_(svC, 'survive') && !hasFx_(svC, 'god_hand') && hp > 1 && !severed) after = 1; // 戰鬥續行(致命傷才硬撐留1·2026-07 修)
  if (after <= 0 && !severed && hasFx_(svC, 'god_hand')) {
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
  const clk = getClock_(myGameId, pcData);
  // 🩸 強撐不耗AP、可重複，唯一限制是「血夠不夠燒」(每次扣20%上限)——不設每日次數，避免違背「燃燒生命續行」的初衷；HP即天然煞車。
  if (clk && clk.ap >= AP_PER_DAY - 1) return JSON.stringify({ success: false, message: "行動力尚足，毋須燃燒生命強撐。" });
  const maxHp = parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 120;
  const cur = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
  const cost = Math.max(10, Math.round(maxHp * 0.20));
  if (cur <= cost) return JSON.stringify({ success: false, needRest: true, noSecondWind: true, message: "你的身體太過虛弱，再燃燒生命恐當場斷氣——唯有『休息』恢復，或令咒脫離。" });
  pcData[pIdx][COL.PC.HP] = cur - cost;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  const ap = grantAp_(myGameId, 4, pcData, sheets);
  const aiPrompt = `【系統·強撐已結算】御主透支魔術迴路與體力、燃燒生命力強行擠出最後的行動之力（HP −${cost}，行動力 +4＝${ap}/${AP_PER_DAY}）。\n` +
    `★以 Fate／TYPE-MOON 筆觸描寫御主咬牙硬撐、迴路過載灼痛、以意志逼出餘力的一幕（一段即可）。已結算。\n` +
    ``;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：HP扣減/AP授予皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, ap: ap, apMax: AP_PER_DAY, clock: clockLabel_(myGameId, pcData), statusString: buildPlayerStatusString(pcData[pIdx]) });
}

// ── 🏕️ 陣地（工房）：存於御主 MEMORY【陣地】loc，駐留該地時供魔得工房加成 ──
// 實作收斂進 Core_Settings.gs 的 makeTextTag_ 共用工廠，函式名/外部行為不變。
var WORKSHOP_TAG_ = makeTextTag_('陣地');
function getWorkshop_(memory) { return WORKSHOP_TAG_.get(memory); }
function setWorkshopMemory_(memory, loc) { return WORKSHOP_TAG_.set(memory, loc); }

// 🏰 主場陣地判定：玩家於【自己佈設的陣地】迎戰 → 回主場結界階(供減傷/反擊)；不在自己陣地回空。
//   ★任何人親手設的陣地(結界/機關/監視術式)都給【基礎 D 階】主場防禦——這是「設置陣地」對所有人承諾的
//   「敵襲反被擊退／安全港」；隊上若有【陣地作成】從者則升到其階(C/B/A/EX·空中庭園級)、結界更強。
//   (2026-07 修：舊版沒陣地作成從者就回空→無陣地作成的玩家設了陣地卻毫無防禦、被敵直接突襲，與承諾不符。)
function homeTerritoryRank_(pcData, pIdx, gameId) {
  try {
    var ws = getWorkshop_(pcData[pIdx][COL.PC.MEMORY]); if (!ws) return "";
    var battleLoc = String(pcData[pIdx][COL.PC.LOC] || "").trim();
    if (!battleLoc || String(ws).split('-')[0].trim() !== battleLoc.split('-')[0].trim()) return "";
    var best = "D"; // 基礎陣地防禦(任何人設的陣地都有)
    for (var i = 0; i < pcData.length; i++) {
      if (String(pcData[i][COL.PC.FACTION]) !== "從者" || String(pcData[i][COL.PC.GAME_ID] || "") !== gameId || String(pcData[i][COL.PC.ID]).startsWith("DEAD_")) continue;
      var r = hasFx_(rowToCombatant_(pcData[i]), 'territory');
      if (r && rankVal(r) > rankVal(best)) best = r; // 陣地作成從者升階
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

// 🏕️ 設置陣地：把當前地設為工房（提升駐留供魔＋主場結界／安全港的前提）。耗 1 AP ＋ 御主魔力（布設結界的勞動）。
var WORKSHOP_MANA_COST = 40;
function actionSetWorkshop(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const isFate = myGameId.indexOf("g_") === 0;
  const loc = String(pcData[pIdx][COL.PC.LOC] || "").trim();
  if (!loc) return JSON.stringify({ success: false, message: "無法在虛無之地佈設陣地。" });
  if (getWorkshop_(pcData[pIdx][COL.PC.MEMORY]) === loc) return JSON.stringify({ success: false, message: `「${loc}」已是你的陣地。` });
  if (isFate && getAp_(myGameId, pcData) < 1) return JSON.stringify({ success: false, needRest: true, message: "行動力不足以佈設陣地——請休息恢復。" });
  // 🔮 布設陣地的勞動：灌注魔力築起結界／機關／術式，須御主純魔 ≥ WORKSHOP_MANA_COST
  const mMp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  if (isFate && mMp < WORKSHOP_MANA_COST) return JSON.stringify({ success: false, message: `佈設陣地要灌注魔力築起結界與機關（需 ${WORKSHOP_MANA_COST} 魔），當前御主魔力不足（${mMp}／需 ${WORKSHOP_MANA_COST}）——先補魔或休整。` });
  if (isFate) pcData[pIdx][COL.PC.MP] = Math.max(0, mMp - WORKSHOP_MANA_COST);
  pcData[pIdx][COL.PC.MEMORY] = setWorkshopMemory_(pcData[pIdx][COL.PC.MEMORY], loc);
  // 🐛→✅ 稽核抓到：原本先整列寫回(帶著扣AP前的舊AP)、chargeApOrReject_才扣AP，內部又補寫一次
  //   ——同一列兩次Sheets I/O。改成先扣AP(skipWrite跳過內部窄寫)，最終狀態再整列一次寫回。
  const _wsApr = chargeApOrReject_(myGameId, 1, pcData, sheets, "行動力不足以佈設陣地——請休息恢復。", { isFate: isFate, skipWrite: true });
  const ap = _wsApr.ap, clock = _wsApr.clock;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]); // MP＋MEMORY＋AP 一起寫回
  // 🎬 AI 演出：布設陣地的勞作（有陣地作成 Caster→其親手築結界；否則御主張設簡易營地）。給事實素材、少下指令。
  const casterRow = pcData.find(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && hasFx_(rowToCombatant_(r), 'territory'));
  const csName = casterRow ? String(casterRow[COL.PC.NAME]) : "";
  const wsPrompt = masterCard_(pcData[pIdx]) + (casterRow ? servantCard_(casterRow) : '') +
    `【系統·陣地佈設·已裁定】御主一行於「${loc}」紮下陣地——${csName ? `「${csName}」以陣地作成之能，在此地` : '御主親手在此地'}布設層層魔術結界、暗藏機關與監視術式，御主灌注了 ${WORKSHOP_MANA_COST} 點魔力為根基。自此這裡成為我方的堡壘：駐留可加速供魔回復，於此迎戰享主場結界庇護，敵人潛入亦難越雷池。\n` +
    `★以 Fate／TYPE-MOON 筆觸【精煉 90~140 字】演出這場「築起陣地」的勞作——${csName ? `「${csName}」施展術式、鋪設結界的專注與魔力流轉，法師將一方土地化為己身堡壘的過程` : '御主費心張設營地與警戒的辛勞'}；show, don't tell，落在完工後那份「這裡是我們的據點了」的踏實與底氣。`;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：MP扣減/陣地標記/spendAp_ 皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, message: `已於「${loc}」佈設陣地（工房）——耗 ${WORKSHOP_MANA_COST} 魔築起結界。駐留供魔提升；於此決戰享主場庇護、敵襲反被擊退。`, aiPrompt: wsPrompt, clock: clock, ap: ap, apMax: AP_PER_DAY, economy: isFate ? playerServantEconomy_(sheets, pcId, pcData) : null });
}

// 🔍 搜索物資：偵查鄰近敵蹤為主，順手撿拾零星魔力（耗 1 AP）
//   ⚠ 反「無痛回魔」：每地的散逸魔力有限，搜刮一次即枯竭——同地重搜只得殘渣。
//   想真正回滿池要付永久代價(補魔)或靠時間(靈脈/陣地/休息)。標記記於 MEMORY【搜刮】loc1、loc2...(已枯竭地點清單)。
// 🐛→✅ 舊版用 makeTextTag_ 只能存「單一」最近搜刮地點，玩家在A、B兩地間來回搜刮可無限白嫖：
//   搜A(標記枯竭=A)→搜B(標記被覆寫成枯竭=B，A的枯竭紀錄就此消失)→回搜A又被當成全新地點、領滿額——
//   跟註解自陳的「同地重搜只得殘渣」設計意圖矛盾。改成存「所有已枯竭地點」清單、用 indexOf 判斷
//   是否曾搜過，而非跟單一最近值相等比對，才是真的「每地限一次」。
function getScavengedLocs_(memory) {
  var m = String(memory || '').match(/【搜刮】([^｜【]+)/);
  return m ? m[1].split('、').filter(Boolean) : [];
}
function addScavengedLoc_(memory, loc) {
  var locs = getScavengedLocs_(memory);
  if (locs.indexOf(loc) < 0) locs.push(loc);
  var s = String(memory || '');
  var tag = '【搜刮】' + locs.join('、');
  return /【搜刮】[^｜【]*/.test(s) ? s.replace(/【搜刮】[^｜【]*/, tag) : (s ? s + '｜' : '') + tag;
}
function actionScavenge(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId, pcData) < 1) return JSON.stringify({ success: false, needRest: true, message: "行動力不足以細細搜索——請休息恢復。" });
  // 🔋 撿拾零星魔力：基礎 ~10% 上限；同地已搜刮過→枯竭、僅得殘渣 ~3%。靠移動探索換取、非站樁刷魔。
  const mpMax = parseInt(pcData[pIdx][COL.PC.MAX_MP]) || 80;
  const cur = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  const curLoc = String(pcData[pIdx][COL.PC.LOC] || "").trim();
  const depleted = curLoc !== "" && getScavengedLocs_(pcData[pIdx][COL.PC.MEMORY]).indexOf(curLoc) >= 0;
  const rate = depleted ? 0.03 : 0.10;
  const gain = Math.max(0, Math.min(mpMax, cur + Math.round(mpMax * rate)) - cur);
  pcData[pIdx][COL.PC.MP] = cur + gain;
  if (!depleted && curLoc) pcData[pIdx][COL.PC.MEMORY] = addScavengedLoc_(pcData[pIdx][COL.PC.MEMORY], curLoc);
  // 🐛→✅ 稽核抓到：原本先整列寫回(帶著扣AP前的舊AP)、chargeApOrReject_才扣AP，內部又補寫一次
  //   ——同一列兩次Sheets I/O。改成先扣AP(skipWrite跳過內部窄寫)，最終狀態再整列一次寫回。
  const _scavApr = chargeApOrReject_(myGameId, 1, pcData, sheets, "行動力不足以細細搜索——請休息恢復。", { isFate: isFate, skipWrite: true });
  const ap = _scavApr.ap, clock = _scavApr.clock;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  // 35% 機率察覺鄰近敵蹤（揭露一名最近的未偵查敵）——搜索的真正價值在情報
  let intel = "";
  if (Math.random() < 0.35) {
    for (var i = 1; i < pcData.length; i++) {
      var fac = String(pcData[i][COL.PC.FACTION]);
      if ((fac === "敵御主" || fac === "敵從者") && String(pcData[i][COL.PC.GAME_ID] || "") === myGameId && !String(pcData[i][COL.PC.ID]).startsWith("DEAD_") && !pcData[i][COL.PC.SEEN]) {
        // 需同步寫回 pcData[i][COL.PC.SEEN]，否則交棒給 STATE_PRE_DATA_ 的陣列仍是「未偵查」，跟訊息文字自相矛盾。
        pcData[i][COL.PC.SEEN] = "1";
        sheets.pc.getRange(i + 1, COL.PC.SEEN + 1).setValue("1");
        intel = `搜索間隱約察覺「${pcData[i][COL.PC.LOC]}」一帶有「${pcData[i][COL.PC.NAME]}」的氣息。`;
        break;
      }
    }
  }
  const haulNote = depleted ? `此地散逸魔力已被你搜刮殆盡，僅再得殘渣——魔力 +${gain}（${pcData[pIdx][COL.PC.MP]}/${mpMax}）。`
    : `搜索此地補給，導入零星散逸魔力——御主魔力 +${gain}（${pcData[pIdx][COL.PC.MP]}/${mpMax}）。`;
  const msg = `${haulNote}${intel || "此地別無敵蹤所獲。"}`;
  // 🎬 aiPrompt 讓 AI 演出這段搜索場景，而非只回罐頭 message。
  const scavSvIdx = findPlayerServantIdx_(pcData, myGameId, "");
  const scavPrompt = masterCard_(pcData[pIdx]) + (scavSvIdx !== -1 ? servantCard_(pcData[scavSvIdx]) : '') +
    `【系統·搜索已裁定】御主一行在此地細細搜索，${depleted ? '此地散逸魔力早被搜刮殆盡、只餘殘渣' : '導入了零星散逸的魔力'}。${intel ? intel : ''}\n` +
    `★以 Fate／TYPE-MOON 筆觸【精煉 60~100 字】演出這段翻找、感應散逸魔力的搜索過程（一段即可）；${intel ? '收尾帶出察覺遠處氣息時的警覺' : '收尾停在暫時平靜的餘韻'}；show, don't tell，是否交戰仍由御主下令。`;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：MP/MEMORY搜刮枯竭標記/SEEN揭露/spendAp_ 皆已原地改回 pcData
  return JSON.stringify({ success: true, message: msg, aiPrompt: scavPrompt, clock: clock, ap: ap, apMax: AP_PER_DAY, statusString: buildPlayerStatusString(pcData[pIdx]) });
}

// 🔍 偵查：耗 1 AP，揭露「附近地點」藏匿的敵御主／敵從者（戰爭迷霧；marks SEEN）
function actionScout(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const isFateScout = myGameId.indexOf("g_") === 0;
  if (isFateScout && getAp_(myGameId, pcData) < 1) {
    return JSON.stringify({ success: false, needRest: true, message: "行動力不足以偵查——請『休息』恢復後再探。" });
  }
  const curLoc = String(pcData[pIdx][COL.PC.LOC] || "").trim();
  // 附近地點（含當前）作為偵查範圍
  const mapData = getMapDataCached(sheets); // 坤圖已靜態化：getMapDataCached 直接讀FATE_MAP_SEED常數，零I/O成本
  let scope = [curLoc];
  // 🐛→✅ 同批修正：漏傳戰爭標記會讓偵查範圍納入第四次限定地點(海特飯店等)，白掃一個本局根本不存在的地點。
  const scoutWar = isFateScout ? getWarName_(pcData[pIdx][COL.PC.MEMORY]) : "";
  try { getNearbyLocations(curLoc, mapData, scoutWar).forEach(l => { const nm = (l && l.name) ? l.name : l; if (nm) scope.push(String(nm).trim()); }); } catch (e) { }

  // 🐛→✅ 稽核抓到：舊版漏了hasArrived_「尚未登場」日期閘門——對照buildMapNodesPayload_/actionMove
  //   等其餘所有敵蹤可見性判斷都會擋這道，唯獨這裡漏掉，會把還沒登場的敵御主/敵從者真名+地點提早
  //   洩漏給玩家與AI敘事、還永久標記SEEN，形同繞過戰爭迷霧設計。
  const scoutDay = parseInt(pcData[pIdx][COL.PC.DAY]) || 1;
  let revealed = [];
  for (let i = 1; i < pcData.length; i++) {
    const fac = String(pcData[i][COL.PC.FACTION]);
    if (fac !== "敵御主" && fac !== "敵從者") continue;
    if (String(pcData[i][COL.PC.GAME_ID] || "") !== myGameId) continue;
    if (String(pcData[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (!hasArrived_(pcData[i], scoutDay)) continue;
    const loc = String(pcData[i][COL.PC.LOC]).trim();
    if (scope.indexOf(loc) === -1) continue;
    if (!String(pcData[i][COL.PC.SEEN] || "")) {
      pcData[i][COL.PC.SEEN] = "1";
      sheets.pc.getRange(i + 1, COL.PC.SEEN + 1).setValue("1");
    }
    revealed.push(pcData[i][COL.PC.NAME] + "（" + loc + "）");
  }

  const _scoutApr = chargeApOrReject_(myGameId, 1, pcData, sheets, "行動力不足以偵查——請『休息』恢復後再探。", { isFate: isFateScout });
  const scoutAp = _scoutApr.ap, scoutClock = _scoutApr.clock;

  const msg = revealed.length
    ? `偵查四方，捕捉到氣息：${revealed.join("、")}。`
    : `偵查四方，附近暫無敵蹤現形。`;
  // 🎬 aiPrompt 只給「有無揭露敵蹤」，不夾帶座標/戰術細節(那些留給地圖UI)，AI只負責演出當下氛圍/警覺。
  const scoutSvIdx = findPlayerServantIdx_(pcData, myGameId, "");
  const scoutPrompt = masterCard_(pcData[pIdx]) + (scoutSvIdx !== -1 ? servantCard_(pcData[scoutSvIdx]) : '') +
    `【系統·偵查已裁定】${revealed.length ? `御主凝神探查四周氣息，察覺到潛伏的敵蹤：${revealed.join("、")}。` : `御主凝神探查四周氣息，附近暫無敵蹤現形，一時風平浪靜。`}\n` +
    `★以 Fate／TYPE-MOON 筆觸【精煉 60~100 字】演出這段凝神戒備、探查四周的氣息與觀察（一段即可），${revealed.length ? '流露警覺與一絲山雨欲來的張力' : '流露短暫的鬆一口氣或不敢鬆懈的警戒'}；show, don't tell，是否交戰仍由御主下令。`;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：SEEN揭露/spendAp_ 皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, message: msg, revealed: revealed, aiPrompt: scoutPrompt, clock: scoutClock, ap: scoutAp, apMax: AP_PER_DAY, statusString: buildPlayerStatusString(pcData[pIdx]) });
}

