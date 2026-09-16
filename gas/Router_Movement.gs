// ==========================================
// 🗺️ Router_Movement.gs — 地圖／移動／休息／偵查／搜刮／整備／工房／卸防突襲
//   一切「在地圖上做的事」：actionGetMapNodes/actionMove/actionRest/actionScout/actionScavenge/
//   actionSetWorkshop/actionSecondWind/actionPrepMeal ＋ 對應 MEMORY 標記存取器。
// ==========================================

// 🔵 視覺地圖節點：冬木頂層地點 + 座標 + 我是否在此 + 已偵查敵人數(吃迷霧/game_id)
//   拆成 buildMapNodesPayload_ 供 actionGetMapNodes 與 buildClientState_ 共用，省一趟多餘 round-trip。
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。
//   依【戰爭】標記過濾地點，避免限定據點(如第四次限定)跨戰爭顯示。
function buildMapNodesPayload_(sheets, pcData, myGameId, myLoc) {
  // 坤圖已靜態化，getMapDataCached 直接讀常數，不依賴 sheets.map 分頁存在。
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


// 🚶 抵達敘事提示詞（單一真實來源·2026-09 從 Script.html 收回後端；理由見 CODE_NOTES）。
function arriveStanceNotice_(stance, isSeek) {
  if (stance === 'stealth') return isSeek ? '御主刻意壓低氣息潛近，對方未必立時察覺。' : '御主隱於暗處接近，反而可能先一步發現對方。';
  if (stance === 'open') return isSeek ? '御主毫不掩飾、堂堂逼近，對方老遠便察覺來敵、戒備拉滿。' : '御主明晃晃現身，對方撞見的剎那便認出這份張揚。';
  return isSeek ? '對方先察覺不速之客而起戒備。' : '彼此都帶幾分意外。';
}
function buildArrivePrompt_(a) {
  const foes = (a.people || []).filter(p => p.isExact && (p.faction === '敵御主' || p.faction === '敵從者'));
  const stance = String(a.stance || 'normal');
  // ── 此地：環境與敵情 ──
  const HERE = [`【抵達】御主『${a.pcName}』${a.svName ? `與從者「${a.svName}」` : ''}來到冬木的「${a.target}」，時值${a.timeStr}。`,
    `此地氛圍：${a.locDesc}`,
    foes.length ? `此地有敵蹤：${foes.map(f => `${f.name}（${f.faction}）`).join('、')}。` : '此地暫無明顯敵蹤。'];
  // ── 剛發生：抵達當下 GAS 已裁定的事 ──
  const NOW = [];
  if (a.pursuit) NOW.push(a.pursuit.hitWho === 'us'
    ? `【撤離追擊·已裁定】自「${a.pursuit.enemyName}」的地盤抽身時被追上咬了一記（從者${dmgSeverityWord_(a.pursuit.dmg, a.pursuit.svHpMax || 1)}）——依上方追兵性格演出這記追擊與從者中招的反應，抵達時帶餘悸狼狽，非從容無事。`
    : `【撤離反咬·已裁定】「${a.pursuit.enemyName}」追來卻被從者回身逼退（追兵${dmgSeverityWord_(a.pursuit.dmg, a.pursuit.foeHpMax || 1)}）——我方從者演出斷後的餘裕，抵達時從容退場，非纏戰。`);
  if (a.factionClash) NOW.push(`【撞見兩方敵人·已裁定】${a.factionClash.note}——雙方依性格反應，不可改寫局面、不可自行分出勝負、不可替玩家決定是否出手。`);
  // ── 在場：誰在這裡、什麼態度 ──
  const WHO = [];
  if (foes.length > 1) {
    const pairs = foes.filter(f => f.faction === '敵御主').map(f => `御主「${f.name}」${f.servant ? `↔從者「${f.servant}」` : '（已無從者）'}`)
      .concat(foes.filter(f => f.faction === '敵從者' && !foes.some(m => m.faction === '敵御主' && m.servant === f.name)).map(f => `從者「${f.name}」${f.master ? `↔御主「${f.master}」` : ''}`));
    WHO.push(`【歸屬·勿張冠李戴】${pairs.join('；')}。各組從者只聽命於自己的御主，彼此可能也互為敵手。`);
  }
  if (foes.length) WHO.push((a.preFoes || []).some(n => foes.find(f => f.name === n))
    ? `【找上門】此地本就是敵方據守之處，是御主主動尋來——對方在自己的地盤上。${arriveStanceNotice_(stance, true)}讓敵方依其個性與立場開口、有反應，別當沉默佈景；是否動手由御主下令。`
    : `【偶遇】雙方恰巧在此撞個正著。${arriveStanceNotice_(stance, false)}讓敵方依其個性與立場開口、有反應，別當沉默佈景；是否動手由御主下令。`);
  if (a.foeMood) WHO.push(`【他們對你的溫度·已裁定的事實】${a.foeMood}`);
  foes.filter(f => f.faction === '敵御主' && f.lostServant).forEach(f =>
    WHO.push(`敵御主『${f.name}』已痛失從者（${f.lostServant}）、再無從者可驅使——讓其神情心境流露失恃（依個性：孤注一擲／惶然欲逃／不甘怨懟），切勿演成仍有從者隨侍。`));
  if (a.allyPeril) WHO.push(`【盟友告急·情報】盟友「${a.allyPeril.ally}」此刻正於「${a.allyPeril.loc}」與敵從者「${a.allyPeril.foe}」對上、情勢緊繃（結盟情報共享而得知）——可讓御主/從者有一句反應或掛心，但【是否馳援由玩家決定】，別替玩家起身趕路。`);
  if (!foes.length && stance !== 'normal') WHO.push(`【御主的姿態】御主此刻以〔${stance === 'stealth' ? '潛行' : '張揚'}〕之姿行動——${stance === 'stealth' ? '壓低存在感、盡量不被察覺地接近或抽身' : '毫不掩飾、主動暴露行蹤'}。讓此姿態自然滲入現身與被察覺的方式，勿喧賓奪主。`);
  // ── 怎麼演 ──
  const HOW = [foes.length
    ? '寫這片場地與一觸即發的對峙張力——交戰與否、勝負，都留待御主下令，禁止自行開打或分出勝負。'
    : '寫這片場地與此刻的喘息：巡查、警戒或鬆一口氣，暗示「可偵查四周或轉往他處」。'];
  if (!foes.length) HOW.push('此地此刻並無其他已知角色在場——【禁止】無中生出可對話、有名有姓的人物（不是路人、不是熟人偶遇、不是巧遇的敵手）；環境照寫，但互動對象只有御主與隨行從者。');
  if (a.svName) HOW.push(`從者「${a.svName}」隨行在側，依其個性開口、有反應（至少一句台詞），別寫成御主獨自一人的自言自語。`);
  if (a.hasContext) HOW.push(foes.length
    ? '承接上一則敘事：若眼前敵人正是方才對手，即是一路追上或再度狹路相逢——非初見（對方可能仍帶著傷或怒）。'
    : '承接上一則敘事：依上一戰的勝負與當前血量定調（勿臆測）——大勝→餘勇或警戒；慘勝→疲憊仍挺立；敗逃→狼狽負傷，別演成若無其事。');
  HOW.push('忌套語與雷同結構（動作→台詞→轉身），每次換感官切入點與詞彙。不可逼問玩家，停在決策前的留白讓玩家以按鍵回應。');
  const sec = (t, arr) => arr.length ? `【${t}】\n` + arr.map(x => '· ' + x).join('\n') + '\n' : '';
  const words = ARRIVE_WORDS_[Math.min(NOW.length + (foes.length ? 1 : 0) + (foes.length >= 3 ? 1 : 0), ARRIVE_WORDS_.length - 1)];
  return (a.masterCard || '') + (a.servantCard ? '【我方從者】' + a.servantCard : '') + (a.foeCards ? '【在場敵方·非我方】' + a.foeCards : '')
    + (a.pursuit && a.pursuit.foeCard ? '【撤離途中的追兵】' + a.pursuit.foeCard : '') + (a.perfNote || '')
    + HERE.join('\n') + '\n'
    + sec('剛發生', NOW) + sec('在場', WHO)
    + `★演出這段抵達【${words} 字】：\n` + HOW.map(x => '· ' + x).join('\n');
}
// 篇幅依抵達當下發生了幾件事——追擊/撞見互毆/有敵對峙，不該跟空地落腳同樣字數。
// 人多就要有多一點篇幅：4 張敵方卡＋我方從者＋御主擠在 310 字裡，每人只剩 50 字、AI 只能點名。
const ARRIVE_WORDS_ = ['120~170', '180~240', '240~310', '330~420'];
// 抵達時最多附幾張敵方演出卡（其餘只在「此地有敵蹤」那行點名）。
const ARRIVE_FOE_CARD_CAP_ = 4;

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
    return JSON.stringify({ success: false, needRest: true, message: "行動力不夠，遠行要 2 點。先休息，恢復了再出發。", clock: clockLabel_(moveGameId, allPcData), ap: getAp_(moveGameId, allPcData), apMax: AP_PER_DAY });
  }

  // 💨 撤離追擊(一點點)：從「有活敵從者」的格子離開時，較快的敵從者可能咬一記離別追擊。
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
    const _destWar = String(_destNode[COL.MAP.WAR] || "").trim();
    if (isFateMove && _destWar && _destWar !== getWarName_(allPcData[pIdx][COL.PC.MEMORY])) {
      return JSON.stringify({ success: false, message: "輿圖之上查無此地，無路可達。" });
    }
  } catch (e) { }
  if (tgtTrim === String(allPcData[pIdx][COL.PC.LOC] || "").trim()) {
    return JSON.stringify({ success: false, message: "你已經在此地，無須移動。" });
  }
  // 🥷 悄悄離開：若正從一個「敵人分心」的局面格（趁隙窗口·slip）抽身，此刻離開不會被追擊。
  var _slipWin = isFateMove ? getEncounterWindow_(allPcData[pIdx][COL.PC.MEMORY]) : null;
  var _slipAway = !!(_slipWin && _slipWin.loc === String(allPcData[pIdx][COL.PC.LOC] || "").trim() && encounterChoices_(_slipWin.type).slip);
  var _slipNames = (_slipAway && _slipWin.names && _slipWin.names.length) ? _slipWin.names.map(nameLoose_) : null;
  // 🏃 撤退旗標：前端按「撤退」殺出重圍時帶 retreat=true——敵方【必】追擊(非機率)、GAS 判勝負。
  var isRetreat = isFateMove && (userData.retreat === true || userData.retreat === 'true');
  var _fromLocR = String(allPcData[pIdx][COL.PC.LOC] || "").trim();
  var _atOwnHome = false;
  try { var _ws = getWorkshop_(allPcData[pIdx][COL.PC.MEMORY]); _atOwnHome = !!(_ws && String(_ws).split('-')[0].trim() === _fromLocR.split('-')[0].trim()); } catch (e) { }
  // 🚫 有敵時封鎖從容移動：離場格若有【非盟約·已登場·未友好(BOND<50)】的能戰敵從者，plain 移動被擋，須改按「撤退」。
  if (isFateMove && !_atOwnHome && !isRetreat && tgtTrim !== _fromLocR) {
    var _blockers = [];
    var _hostileHere = allPcData.some(function (r) {
      if (!(String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === moveGameId &&
        !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC] || "").trim() === _fromLocR &&
        !isAllied_(r) && hasArrived_(r, _moveDay()) && (parseInt(r[COL.PC.BOND]) || 0) < 50)) return false;
      // 悄悄離開只豁免窗口點名的那兩位(分心中)，其餘未點名的敵從者依然算「盯著」，強制走撤退。
      if (_slipAway && _slipNames && _slipNames.indexOf(nameLoose_(r[COL.PC.NAME])) !== -1) return false;
      _blockers.push(String(r[COL.PC.NAME]));
      return true;
    });
    // 訊息只講事實、不叫玩家去找按鈕——突圍鈕就在這張卡上（見 Script.html 的 needRetreat 分支）。
    if (_hostileHere) return JSON.stringify({
      success: false, needRetreat: true,
      message: `「${_blockers.slice(0, 3).join('」「')}」${_blockers.length > 3 ? '等' : ''}盯著你，轉身就走會露出破綻——要離開只能殺出重圍（對方必定追擊、成敗當場見真章）。`
    });
  }
  var pursuit = null;
  try {
    var fromLocM = String(allPcData[pIdx][COL.PC.LOC] || "").trim();
    // 🏃 追擊機制已【全數轉移到撤退按鈕】(玩家定案)：唯有 isRetreat（殺出重圍）才觸發追擊——一般移動遇敵已被上方needRetreat 擋下（強制走撤退），遇不到敵則本就無人可追，故不再有「機率性離場追擊」這條路徑。
    if (isFateMove && isRetreat && !_slipAway && !_atOwnHome && fromLocM && tgtTrim && tgtTrim !== fromLocM) {
      var psvIdxM = findPlayerServantIdx_(allPcData, moveGameId, userData.servant, userData.servantId);
      if (psvIdxM !== -1) {
        var psvC = rowToCombatant_(allPcData[psvIdxM]);
        try { injectMysticBuff_(psvC, allPcData[pIdx][COL.PC.MEMORY]); } catch (e) { } // ✨ 逃跑時也吃御主禮裝(如 Avalon 承受寶具減傷)
        psvC._shieldMp = parseInt(allPcData[pIdx][COL.PC.MP]) || 0; // 💠 背擊寶具＝七天盾可展開(扣魔)，付不起張不開
        // 🔮 預告寶具·背後傾瀉：離場格若有敵人正蓄勢寶具預告 → 朝你退卻的背影轟出 NP 級臨別重擊(優先於一般追擊，保1不致死)。
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
          var pr = resolveFateBattle_(chC, psvC, { ambush: true });
          var chaserNm = String(chaser[COL.PC.NAME]);
          var psvHpMaxM = parseInt(allPcData[psvIdxM][COL.PC.MAX_HP]) || 1;
          var chaserSevM = pr.atkWins ? dmgSeverityWord_(Math.max(1, pr.damage), psvHpMaxM) : '';
          pursuit = { enemyName: chaserNm, chaserId: String(chaser[COL.PC.ID]), dmg: Math.max(1, pr.damage), hitWho: pr.atkWins ? 'us' : 'foe', retreat: true,
            note: pr.atkWins
              ? ('你下令撤退，「' + chaserNm + '」強襲擊中從者致其' + chaserSevM + '，從者忍痛掩護，帶你驚險脫離戰場。')
              : ('你下令撤退，「' + chaserNm + '」追擊被從者回身逼退，主從二人毫髮無傷地撤離。') };
        }
      }
    }
  } catch (e) { }

  // 🎭 抵達態度判定（趁世界尚未 tick，看 target 是否已有先客）：先客在＝主動找上門(警惕)；無＝偶遇(意外)。
  const preFoesAtTarget = isFateMove ? allPcData.filter(r =>
    (String(r[COL.PC.FACTION]) === "敵御主" || String(r[COL.PC.FACTION]) === "敵從者")
    && (!moveGameId || String(r[COL.PC.GAME_ID] || "") === moveGameId)
    && !String(r[COL.PC.ID]).startsWith("DEAD_")
    && String(r[COL.PC.LOC] || "").trim() === tgtTrim
    && hasArrived_(r, _moveDay()) // 🕰️ 尚未登場者不算「先客」
  ).map(r => String(r[COL.PC.NAME])) : [];

  let clockLabel = "", worldRumors = [], apLeft = AP_PER_DAY, moveVictory = false, moveDream = "";
  if (isFateMove) {
    try {
      // skipWrite=true：函式結尾本就會整表批次寫回(含這3欄)，這裡只改記憶體，避免 spendAp_ 內部多寫一次同樣的值。
      const sp = spendAp_(moveGameId, 2, allPcData, sheets, true);
      apLeft = sp.ap;
      // 傳 allPcData 給 worldTick_/breakStaleAlliances_ 原地改(陣列傳參考)，免事後重讀整表拿 tick 後狀態。
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
    pursuit.foeCard = pChaserRow ? servantCard_(pChaserRow, { skipClose: true }) : "";
    var pursuitChaserName = pChaserRow ? String(pChaserRow[COL.PC.NAME]) : "";
    pursuitReport = {
      pursuit: true, np: !!pursuit.np, retreat: !!pursuit.retreat, enemyName: pursuit.enemyName, dmg: pursuit.dmg, hitWho: pursuit.hitWho,
      svName: pSvName, svHpMax: pSvHpMax, after: pSvHpAfter
    };
  }

  // ⚔️ 抵達地點若同時有 ≥2 位不同敵御主在場，擲一種「敵營局面」（不再永遠互毆→見你停手）。
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
      var findClashSv_ = function (masterRow) {
        var mN = String(masterRow[COL.PC.NAME] || "");
        return allPcData.find(function (r) {
          return String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === moveGameId &&
            String(r[COL.PC.LOC] || "").trim() === tgtTrim && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
            getServantMaster_(r[COL.PC.MEMORY]) === mN;
        });
      };
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
  if (isFateMove) {
    var _ch = factionClash && factionClash.choices;
    if (_ch && (_ch.ambush || _ch.incite || _ch.slip)) {
      var _windowNames = (typeof svA !== 'undefined' && svA && typeof svB !== 'undefined' && svB) ? [String(svA[COL.PC.NAME]), String(svB[COL.PC.NAME])] : [];
      allPcData[pIdx][COL.PC.MEMORY] = setEncounterWindow_(allPcData[pIdx][COL.PC.MEMORY], tgtTrim, factionClash.type, _windowNames);
    } else {
      allPcData[pIdx][COL.PC.MEMORY] = clearEncounterWindow_(allPcData[pIdx][COL.PC.MEMORY]);
    }
  }

  // ⏳ 時回：移動的 2 小時間，御主與同行從者隨時間自然回復（HP 固定、MP 看魔術迴路）。
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

  // 🎭 隨行從者的「演出依據」卡（含狂化禁言/口吻），供前端抵達敘事讓從者真的在場、有反應，不是御主獨白。（全文見 CODE_NOTES.md）
  var svIdxMove = findPlayerServantIdx_(allPcData, moveGameId, userData.servant, userData.servantId);
  var svCardMove = svIdxMove !== -1 ? servantCard_(allPcData[svIdxMove], { skipClose: true }) : "";
  var perfNamesMove = svIdxMove !== -1 ? [String(allPcData[svIdxMove][COL.PC.NAME])] : [];
  var svNameForAi = svIdxMove !== -1 ? String(allPcData[svIdxMove][COL.PC.NAME]) : "";

  // 🎭 在場敵從者/敵御主人設卡餵給抵達敘事，讓敵人依性格反應而非 AI 即興通用反派；servantCard_ 對敵從者一樣適用(低羈絆→戒備敵意)。
  var foeCardsMove = "";
  try {
    var _foeRowsMove = allPcData.filter(function (r) {
      return String(r[COL.PC.GAME_ID] || "") === moveGameId
        && String(r[COL.PC.LOC] || "").trim() === tgtTrim
        && !String(r[COL.PC.ID]).startsWith("DEAD_")
        && hasArrived_(r, _moveDay())
        && (String(r[COL.PC.FACTION]) === "敵從者" || String(r[COL.PC.FACTION]) === "敵御主");
    });
    if (_foeRowsMove.length > ARRIVE_FOE_CARD_CAP_) _foeRowsMove = _foeRowsMove.slice(0, ARRIVE_FOE_CARD_CAP_);
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
  if (pursuitChaserName && perfNamesMove.indexOf(pursuitChaserName) < 0) perfNamesMove.push(pursuitChaserName);

  // 🫶 遇敵態度（GAS 依「在場敵對者對你的好感」裁定，AI 只照這定調演）：好感高→未必有敵意；好感低→殺氣明顯。
  // GAS 只報「誰對你是什麼溫度」這個事實，怎麼表現由 AI 依各人個性決定（2026-09 玩家定案）。
  //   舊版直接寫「讓他們態度和緩、別演成劍拔弩張」＝替 AI 決定演法；而且取全場平均，
  //   兩個立場相反的敵人會被抹成一個中間值。改成逐人報。
  var foeMoodNote = "";
  try {
    var moodBits = [];
    allPcData.forEach(function (r) {
      if (String(r[COL.PC.GAME_ID] || "") !== moveGameId) return;
      if (String(r[COL.PC.LOC] || "").trim() !== tgtTrim) return;
      if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
      if (!hasArrived_(r, _moveDay())) return;
      var f = String(r[COL.PC.FACTION]);
      if (f !== "敵御主" && f !== "敵從者") return;
      if (isAllied_(r)) return;
      var w = favorWord_(bondFavor_(r));
      if (w) moodBits.push(String(r[COL.PC.NAME]) + w);
    });
    if (moodBits.length) foeMoodNote = moodBits.join("、") + "。";
  } catch (e) { }

  // 🆘 盟友告急（同盟配套）：worldTick 後若有盟友在別處被敵從者纏上→報信＋供「趕去馳援」。
  var allyPeril = null;
  try { if (isFateMove) allyPeril = detectAllyPeril_(allPcData, moveGameId, target, _moveDay()); } catch (e) { }
  if (allyPeril) {
    var _allyPerilSev = allyPeril.hpRatio >= 0.6 ? '尚占上風、應付得來' : allyPeril.hpRatio >= 0.3 ? '戰況膠著' : '命懸一線、情勢危急';
    worldRumors.unshift(`〔盟友告急〕盟友「${allyPeril.ally}」此刻正於「${allyPeril.loc}」與敵從者「${allyPeril.foe}」對上，${_allyPerilSev}。`);
  }

  STATE_PRE_DATA_ = allPcData; // ⚡ 交棒：本 handler 所有寫入(worldTick_/spendAp_/markRivalsSeen_/夜襲…)皆已原地改回 allPcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({
    success: true,
    allyPeril: allyPeril, // 🆘 盟友告急→前端報信＋「趕去馳援」泡泡
    // 🚶 抵達敘事提示詞由後端組好下傳（2026-09 從前端收回，見 buildArrivePrompt_）。
    // 🧹 2026-09：原本 foeMood/masterCard/servantCard/foeCards/perfNote/preFoes 也一起下傳，
    //    註解寫「供前端偵錯與相容」——但全 html 掃過一遍，這幾個欄位前端【一個都沒讀】，
    //    相容的是空氣。實測每次移動白送 1691 字元(整包的 14.6%)，而且 masterCard_/performanceNote_
    //    為了那份沒人看的副本各多算一次。移動是 solo 最常按的鍵，這是每一步都在付的稅。
    arrivePrompt: buildArrivePrompt_({
      pcName: pcName, svName: svNameForAi, target: target, timeStr: String(clockLabel || '').split('・').slice(-1)[0] || '此刻',
      locDesc: mapDesc || '四下靜謐。', people: getLocalPeopleList(sheets, pcName, pcId, target, allPcData),
      preFoes: preFoesAtTarget, pursuit: pursuit, factionClash: factionClash, foeMood: foeMoodNote,
      allyPeril: allyPeril, stance: String(userData.stance || 'normal'), hasContext: !!userData.hasContext,
      masterCard: masterCard_(allPcData[pIdx]), servantCard: svCardMove, foeCards: foeCardsMove,
      perfNote: performanceNote_(perfNamesMove)
    }),
    pursuit: pursuit,
    report: pursuitReport, // 📊 撤離追擊數字戰報卡(見上方建構處)——renderFateBattleReport 秒顯，不等 AI
    factionClash: factionClash, // ⚔️ 抵達時撞見的敵對互毆(見上方建構處)——供前端插入抵達演出提示詞
    victory: moveVictory,
    dreamPrompt: moveDream,
    statusString: buildPlayerStatusString(allPcData[pIdx]),
    // 🧹 move 現為 solo 專屬 action(鑑賞已改走 kanshouMoveTo)，不需分流呼叫 getKanshouPeopleList_。
    people: getLocalPeopleList(sheets, pcName, pcId, target, allPcData),
    locations: getNearbyLocations(target, freshMapData, getWarName_(allPcData[pIdx][COL.PC.MEMORY])).slice(0, 5),
    mapNodes: buildMapNodesPayload_(sheets, allPcData, moveGameId, target), // ⚡ 夾帶地圖節點，免手機抵達後再打一趟 get_map_nodes
    mapDesc: mapDesc,
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
    sheets.pc.getRange(1, 1, pcData.length, pcData[0].length).setValues(pcData);
    // 世界已在同一份 pcData 上 tick 完，直接沿用即可判夜襲，不必重讀整表。
    const restSvIdx = findPlayerServantIdx_(pcData, restGameId, userData.servant, userData.servantId);
    const restAmbush = enemyAmbushOnServant_(sheets, pcData, pIdx, restGameId, 1.5, restSvIdx);
    // 🌙 從者之夢（回想）：安睡(≥3h)且未遭突襲時，有機會順著聯繫夢見從者生前傳說的片段，加深羈絆
    let restDreamPrompt = "";
    if ((!restAmbush || restAmbush.homeRepel || restAmbush.peaceful) && restHours >= 3) { // 🏰 陣地反擊／🎲 按兵不動·試探接觸＝安睡無虞·仍可做夢
      const svRow = pcData.find(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === restGameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
      if (svRow && Math.random() < 0.25) {
        const dSvName = String(svRow[COL.PC.NAME]);
        try { raiseBond_(sheets, restGameId, pcName, dSvName, 3, pcData); } catch (e) { }
        restDreamPrompt = servantCard_(svRow) +
          `【系統·從者之夢·回想】御主沉沉睡去，意識卻順著與從者的靈魂聯繫，墜入「${dSvName}」成為英靈之前的記憶長河——夢見其傳說中的一個片段。\n` +
          `★用夢境／回想的朦朧史詩質感，演出「${dSvName}」這名英靈生前傳說裡的某一幕（取材自其真實的神話／史實／傳說：其榮光、抉擇、孤獨或傷痕）。讓御主（與玩家）窺見這名英靈所背負的過往與信念。\n` +
          `★【show, don't tell】以畫面與情境流露，不直接點破其願望或心結，停在夢醒後的餘韻與一絲說不清的悸動；收尾可帶一絲「${dSvName}」隱約察覺御主窺見了這段記憶的細微反應，份量點到為止即可。\n` +
          ``;
      }
    }
    const restAmbushPrompt = ambushDispatchPrompt_(restAmbush,
      function (a) {
        const restSev = dmgSeverityWord_(a.dmg || 0, a.svHpMax);
        return (a.foeCard || '') + performanceNote_(a.destroyed ? [a.enemyName] : [a.svName, a.enemyName].filter(Boolean)) + `【系統·歇息遭夜襲·已裁定】御主一行於「${pcLoc}」歇息、防備最鬆懈時，潛伏同地的敵從者「${a.enemyName}」${a.stealthy ? '自暗影無聲摸近' : '趁夜殺到'}，一擊擊中「${a.svName || '從者'}」致其${restSev}${a.destroyed ? '，其靈基崩潰、化作光點消散，御主敗北' : ''}。\n★描寫酣息被夜襲撕裂的驚變（語氣留白），勝負已由系統結算。`;
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

  // 🧹 2026-09 砍掉「非 FATE 舊版休養」死分支。
  //    game_id 只有兩種前綴：g_(solo·Router_Creation) 與 k_(鑑賞·Gallery)，而 rest 在
  //    KANSHOU_BLOCKED_ACTIONS_ 裡對鑑賞是擋掉的 → 上面那條 isFateRest 分支【一定會 return】，
  //    這裡本來就永遠走不到。而它裡面藏著兩個跨帳號洩漏：①「同行」全回滿沒帶 game_id
  //    ②bystanderNames 用地點掃全表、把別人那局在同名地點的角色名字一起端出來。
  //    死碼不是無害的，它是「哪天條件變了就直接生效」的地雷。留一道明確的失敗取代它。
  return JSON.stringify({ success: false, message: "此世界不支援休息。" });
}

// ==========================================
// 🍱 整備·進食：耗 1 AP，給御主一行 MEAL_BUFF_HOURS 小時的戰鬥命中 +MEAL_BUFF_BONUS（戰前 buff）
function actionPrepMeal(userData, pcId, sheets) {
  var pcData = sheets.pc.getDataRange().getValues();
  var pIdx = pcData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  var myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  var isFate = myGameId.indexOf("g_") === 0;
  if (isFate && getAp_(myGameId, pcData) < 1) return JSON.stringify({ success: false, needRest: true, message: "行動力不夠，沒辦法好好整備。先休息恢復。" });
  var clk = getClock_(myGameId, pcData);
  if (!clk) return JSON.stringify({ success: false, message: "此刻無法整備。" });
  var nowAbs = clk.day * 24 + clk.hour;
  pcData[pIdx][COL.PC.MEMORY] = stampMeal_(pcData[pIdx][COL.PC.MEMORY], nowAbs + MEAL_BUFF_HOURS);
  var _mealApr = chargeApOrReject_(myGameId, 1, pcData, sheets, "行動力不夠，沒辦法好好整備。先休息恢復。", { isFate: isFate, skipWrite: true });
  var ap = _mealApr.ap, clock = _mealApr.clock;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  // 🎬 aiPrompt 讓 AI 演出這段整備場景，而非只回罐頭 message。
  var mealSvIdx = findPlayerServantIdx_(pcData, myGameId, "");
  // ⚠ 沒有從者在場時，提示詞【不可】還在講「御主與從者」——沒附卡卻點名從者，等於邀 AI 憑空生一個
  //    (同 check_cards.py 在擋的形狀：沒卡＝叫 AI 捏造性格，玩家會當成角色設定)。
  var _mealHasSv = mealSvIdx !== -1;
  var mealPrompt = masterCard_(pcData[pIdx]) + (_mealHasSv ? servantCard_(pcData[mealSvIdx]) : '') +
    (_mealHasSv
      ? `【系統·整備已裁定】御主與從者稍作整備、飽餐一頓——接下來一段時間內，從者的狀態比平常更穩、出手更準。\n★【60~100 字】演出這段戰前用餐、稍事休整的日常小品，依從者性格自然流露對這頓飯／這位御主的反應；語氣輕快不冗長。`
      : `【系統·整備已裁定】御主獨自稍作整備、飽餐一頓。\n★【60~100 字】演出這段獨自用餐、稍事休整的片刻——此刻【身邊沒有從者】，不可讓任何從者出現或開口；語氣輕快不冗長。`);
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

// 🎭 撞見兩方敵人的可能局面（資料驅動·GAS 擲、AI 演）。
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
  // 回傳的是「傷得多重」的白話（不是數字）：提示詞要的是份量，不是點數。
  var chipWord = function (idx, mul) { var _d = chip(idx, mul); return dmgSeverityWord_(_d, parseInt(allPcData[idx] && allPcData[idx][COL.PC.MAX_HP]) || 1); };
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
      note = `你踏進來時，「${mAName}」與「${mBName}」的從者正殺紅了眼死鬥——刀光不停，「${loserName}」已${chipWord(loserIdx, 1.6)}。你的出現沒讓他們收手，兩人仍纏鬥不休，只有一瞬掃來提防的餘光。`;
      break;
    case 'standoff':
      note = `「${mAName}」與「${mBName}」的從者兵刃相向、劍拔弩張地對峙，卻誰也沒先動手。你的踏入像投進火藥的一粒火星——三方的緊繃在同一刻被拉到極限。`;
      break;
    case 'hunt':
      note = `這裡正上演一場追殺：一方從者步步進逼，「${moreHurt}」傷得更重（${chipWord(moreHurtIdx, 1.2)}）、節節後退。你的到來，成了獵人與獵物都得重新盤算的變數。`;
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

// 🎯 撞見敵人後的「可反應窗口」：御主 MEMORY【趁隙】<loc>@<type>@<svA>、<svB>。
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

// 🥷 趁隙偷襲：撞見敵人分心（殺紅眼/對峙/談判/剛結盟）時，我方從者搶一記奇襲。
function playerAmbushOnEnemy_(sheets, pcData, pIdx, gameId, targetName, wantSv, wantSvId) {
  var myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  var day = parseInt(pcData[pIdx][COL.PC.DAY]) || 1;
  var svIdx = findPlayerServantIdx_(pcData, gameId, wantSv, wantSvId);
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
  var out = { enemyName: String(pcData[eIdx][COL.PC.NAME]), svName: String(pcData[svIdx][COL.PC.NAME]), dmg: dmg, hit: !!probe.atkWins, destroyed: false, victory: false, dreamPrompt: "", foeCard: '〔趁隙偷襲的目標〕' + servantCard_(pcData[eIdx], { skipClose: true }) };
  var severed = hasFx_(atkC, 'rule_breaker') || hasFx_(atkC, 'anti_magic_lance');
  var eHp = parseInt(pcData[eIdx][COL.PC.HP]) || 0, after = eHp - dmg;
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
  var _targetKey = nameLoose_(String(userData.targetName || ""));
  if (win.names && win.names.length && _targetKey && win.names.map(nameLoose_).indexOf(_targetKey) === -1) {
    return JSON.stringify({ success: false, message: "此人並未被這場對峙分心，無隙可趁。" });
  }
  if (getAp_(gameId, pcData) < 1) return JSON.stringify({ success: false, needRest: true, message: "行動力不足以搶這一手。" });
  var res = playerAmbushOnEnemy_(sheets, pcData, pIdx, gameId, String(userData.targetName || ""), userData.servant, userData.servantId);
  if (res.err) return JSON.stringify({ success: false, message: res.err });
  pcData[pIdx][COL.PC.MEMORY] = clearEncounterWindow_(pcData[pIdx][COL.PC.MEMORY]); // 用掉即清窗口
  var _ambApr = chargeApOrReject_(gameId, 1, pcData, sheets, "行動力不足以搶這一手。", { isFate: true, skipWrite: true });
  var ap = _ambApr.ap, clock = _ambApr.clock;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]); // 寫回御主列(窗口清除＋AP)
  var _ambSev = dmgSeverityWord_(res.dmg || 0, res.eHpMax);
  var hitTxt = res.hit ? `一擊得手，「${res.enemyName}」${_ambSev}` : `倉促搶攻只擦過「${res.enemyName}」`;
  var _mySvIdx = findPlayerServantIdx_(pcData, gameId, userData.servant, userData.servantId);
  var aiPrompt = servantCard_(pcData[_mySvIdx !== -1 ? _mySvIdx : pIdx], { skipClose: true }) + res.foeCard + performanceNote_([res.svName, res.enemyName]) +
    `【系統·趁隙偷襲·已裁定】趁「${res.enemyName}」分心之際，你的從者搶先發難——${hitTxt}${res.destroyed ? '，將其當場擊破！' : '，對方旋即警覺、不再有隙可趁。'}\n` +
    `★【80~140 字】演出這記趁隙奇襲：把握、突發、對方由鬆懈轉為戒備的瞬間；依雙方性格演，別自行加碼改寫勝負（傷害已由系統結算）。`;
  STATE_PRE_DATA_ = pcData;
  return JSON.stringify({
    success: true, aiPrompt: aiPrompt, report: res.report,
    victory: res.victory || false, dreamPrompt: res.dreamPrompt || "",
    clock: clock, ap: ap, apMax: AP_PER_DAY, statusString: buildPlayerStatusString(pcData[pIdx])
  });
}

// 🎭 挑撥離間 action：對峙/談判局面時煽風點火。GAS 依雙方御主性格擲成敗——成功→兩敵真打起來(雙方扣血·保1)；
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
  var iA, iB;
  if (win.names && win.names.length >= 2) {
    iA = foeSvs.find(function (i) { return String(pcData[i][COL.PC.NAME]) === win.names[0]; });
    iB = foeSvs.find(function (i) { return String(pcData[i][COL.PC.NAME]) === win.names[1]; });
    if (iA == null || iB == null || iA === iB) return JSON.stringify({ success: false, message: "那場對峙的雙方已不在此處，這份談資已經過時了。" });
  } else {
    iA = foeSvs[0]; iB = foeSvs[1]; // foeSvs.length>=2 已由上方(969行)保證
  }
  var mIdxA = enemyMasterIdx_(pcData, iA, gameId), mIdxB = enemyMasterIdx_(pcData, iB, gameId);
  var leanA = mIdxA >= 0 ? masterPersonaLean_(pcData[mIdxA]) : { pragmatic: false, loner: true };
  var leanB = mIdxB >= 0 ? masterPersonaLean_(pcData[mIdxB]) : { pragmatic: false, loner: true };
  var prob = 0.5 + ((leanA.loner || leanB.loner) ? 0.2 : 0) - ((leanA.pragmatic && leanB.pragmatic) ? 0.25 : 0);
  // 🫶 他們越信你(對你好感高)，越聽得進你的挑撥；越提防你，越可能識破反過來一起戒你。
  prob += (bondFavor_(pcData[iA]) + bondFavor_(pcData[iB])) / 2 * 0.25;
  prob = Math.max(0.1, Math.min(0.85, prob));
  var success = Math.random() < prob;
  var svAName = String(pcData[iA][COL.PC.NAME]), svBName = String(pcData[iB][COL.PC.NAME]);
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
    aiPrompt = inciteCardsStr + `【系統·挑撥離間·得逞】你三言兩語點燃了「${svAName}」與「${svBName}」之間的火——兩人當真打了起來，「${loName}」吃了較重的一擊（−${loDmg}），另一方亦掛彩（−${wiDmg}），自此結下樑子。\n` +
      `★【80~140 字】演出你如何煽風點火、兩方如何被激得反目相向；你則在一旁坐收其亂。傷害已由系統結算。`;
    var wiName = cross.atkWins ? svAName : svBName;
    report = { incite: true, success: true, aName: svAName, bName: svBName,
      loName: loName, loDmg: loDmg, loAfter: loAfter, loHpMax: parseInt(pcData[loIdx][COL.PC.MAX_HP]) || loAfter,
      wiName: wiName, wiDmg: wiDmg, wiAfter: wiAfter, wiHpMax: parseInt(pcData[wiIdx][COL.PC.MAX_HP]) || wiAfter };
  } else {
    // 🫶 後續配套：被看穿→兩敵對你更反感，各降 4 好感（你操弄未遂、留下芥蒂）。
    bumpBond_(sheets, pcData, iA, -4, true);
    bumpBond_(sheets, pcData, iB, -4, true);
    aiPrompt = inciteCardsStr + `【系統·挑撥離間·被看穿】你試圖挑撥「${svAName}」與「${svBName}」反目，卻被兩人一眼看穿——他們非但沒中計，反而不約而同地轉過頭，戒備地一同盯向你這攪局的外人，對你的好感也淡了幾分。\n` +
      `★【70~120 字】演出這記挑撥落空、兩方合流戒你的尷尬瞬間；語氣別替玩家決定接下來怎麼辦。`;
    report = { incite: true, success: false, aName: svAName, bName: svBName };
  }
  pcData[pIdx][COL.PC.MEMORY] = clearEncounterWindow_(pcData[pIdx][COL.PC.MEMORY]);
  var _inciteApr = chargeApOrReject_(gameId, 1, pcData, sheets, "行動力不足。", { isFate: true, skipWrite: true });
  var ap = _inciteApr.ap, clock = _inciteApr.clock;
  sheets.pc.getRange(1, 1, pcData.length, pcData[0].length).setValues(pcData);
  STATE_PRE_DATA_ = pcData;
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, report: report, clock: clock, ap: ap, apMax: AP_PER_DAY, statusString: buildPlayerStatusString(pcData[pIdx]) });
}

// 🆘 盟友告急偵測（同盟配套）：找一名在【別處】、與未結盟活敵從者同格的盟友——他正被人纏上、有難。
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
      var allyHpMax = parseInt(r[COL.PC.MAX_HP]) || 1;
      var allyHpRatio = allyHpMax ? (parseInt(r[COL.PC.HP]) || 0) / allyHpMax : 1;
      return { ally: String(r[COL.PC.NAME]), allyFaction: fac, loc: loc, foe: String(foe[COL.PC.NAME]), hpRatio: allyHpRatio };
    }
  }
  return null;
}

// ⚔️ 卸防突襲：在同地有清醒敵從者時做「補魔／羈絆／休息」等卸下防備之舉，會招致敵從者趁隙重擊我方從者（氣息遮斷／暗殺職階更致命）。
function enemyAmbushOnServant_(sheets, pcData, pIdx, gameId, baseMul, preferSvIdx) {
  const myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  const ambushDay = parseInt(pcData[pIdx][COL.PC.DAY]) || 1; // 🕰️ 尚未登場者不會夜襲
  const eIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === myLoc && !isAllied_(r) && hasArrived_(r, ambushDay) && (parseInt(r[COL.PC.BOND]) || 0) < 50);
  if (eIdx === -1) return null;
  const preferOk = typeof preferSvIdx === 'number' && preferSvIdx >= 0 && pcData[preferSvIdx] &&
    String(pcData[preferSvIdx][COL.PC.FACTION]) === "從者" && String(pcData[preferSvIdx][COL.PC.GAME_ID] || "") === gameId &&
    !String(pcData[preferSvIdx][COL.PC.ID]).startsWith("DEAD_");
  const svIdx = preferOk ? preferSvIdx
    : pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (svIdx === -1) return null;
  const homeRank = homeTerritoryRank_(pcData, pIdx, gameId);
  if (homeRank) {
    const wardCost = 20 + Math.round(rankVal(homeRank) * 0.6); // ~30~55 魔·隨陣地作成階
    const mMp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
    if (mMp >= wardCost) {
      pcData[pIdx][COL.PC.MP] = mMp - wardCost;
      sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
      const svR = rowToCombatant_(pcData[svIdx]); injectHomeField_(svR, homeRank);
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
      const eFoeCard = '〔夜襲者〕' + servantCard_(pcData[eIdx], { skipClose: true, foe: true });
      const homeRankScale = rankVal(homeRank) >= 60 ? '堪比城砦的壯闊結界' : rankVal(homeRank) >= 40 ? '頗具規模的堅實結界' : '倉促佈設的簡易結界';
      return {
        homeRepel: true, enemyName: eNm, svName: sNm, backDmg: backDmg, wardCost: wardCost, homeRank: homeRank,
        dmg: 0, destroyed: false, defeat: false, dreamPrompt: "", after: parseInt(pcData[svIdx][COL.PC.HP]) || 0,
        foeCard: eFoeCard,
        repelNote: eFoeCard + `【系統·陣地反擊·已裁定】潛伏同地的敵從者「${eNm}」欲趁御主一行卸防時偷襲，然此地正是我方親手佈設的陣地——${homeRankScale}示警、機關迭起，「${sNm}」從容起身、反手將來犯者擊退驅離（敵受創 −${backDmg}），我方毫髮無傷（御主耗 ${wardCost} 魔維持結界運作）。\n★演出「潛入者反被主場結界與從者從容擊退」的優雅反制，結界的氣勢與規模需貼合上述描述——「${eNm}」依其性格可以有反應/一兩句話(不甘、譏諷、冷笑皆可，狂化者改用低吼/肢體)，別把入侵者寫成毫無聲息的純背景。`,
        report: { homeRepel: true, ambush: false, enemyName: eNm, svName: sNm, backDmg: backDmg, wardCost: wardCost, homeRank: homeRank }
      };
    }
  }
  // 🎲 卸防時刻的敵方反應多樣化（玩家回饋「不可能每次都是打我」）：不是每次都直接開打——依這名敵從者的職階/性格擲一次，多數仍是偷襲(維持既有的臨場威脅感)，但狂化(無法言語)／暗殺(本色即偷襲)以外的職階，有機會按兵不動觀望、或帶著戒心試探接觸(無戰鬥、羈絆小幅變動)。
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
      const foeCard2 = '〔潛伏者〕' + servantCard_(pcData[eIdx], { skipClose: true, foe: true });
      if (outcome === 'observe') {
        return {
          homeRepel: false, peaceful: true, kind: 'observe', enemyName: eNm2, svName: svNm2,
          dmg: 0, destroyed: false, defeat: false, dreamPrompt: "", after: parseInt(pcData[svIdx][COL.PC.HP]) || 0,
          foeCard: foeCard2,
          repelNote: foeCard2 + performanceNote_([eNm2]) + `【系統·卸防時刻·已裁定】潛伏同地的敵從者「${eNm2}」其實已窺見這破綻，卻按兵不動、只是冷眼旁觀——似乎另有盤算，此刻並未出手。\n★演出「${svNm2}」一行渾然不覺、或事後驚覺曾被窺伺的一絲寒意(依性格擇一)；「${eNm2}」依其性格演出這份按兵不動的姿態與神情/隻言片語即可，不必開打。`,
          report: { peaceful: true, kind: 'observe', enemyName: eNm2, svName: svNm2 }
        };
      }
      const bump = 2 + Math.floor(Math.random() * 4); // 小幅 +2~5
      const afterBond = bumpBond_(sheets, pcData, eIdx, bump);
      return {
        homeRepel: false, peaceful: true, kind: 'probe', enemyName: eNm2, svName: svNm2,
        dmg: 0, destroyed: false, defeat: false, dreamPrompt: "", after: parseInt(pcData[svIdx][COL.PC.HP]) || 0,
        foeCard: foeCard2, bondAfter: afterBond,
        repelNote: foeCard2 + performanceNote_([eNm2]) + `【系統·卸防時刻·已裁定】潛伏同地的敵從者「${eNm2}」現身，卻沒有動手——帶著幾分戒心，像是想試探些什麼${(() => { const _w = favorWord_(afterBond / 100); return _w ? "（" + _w + "）" : ""; })()}。\n★演出這場短暫、帶著猜忌與算計的試探性接觸(一兩句交鋒或對峙即可)：兩邊都清楚此刻並非開戰時機，「${eNm2}」依其性格留下一絲若有似無的試探或警告，不必開打、也不必交心。`,
        report: { peaceful: true, kind: 'probe', enemyName: eNm2, svName: svNm2, bondAfter: afterBond }
      };
    }
  }
  const enemyC = rowToCombatant_(pcData[eIdx]);
  const svC = rowToCombatant_(pcData[svIdx]);
  // 🔮 突襲主角是 enemyC(攻方)：補上其硬連結敵御主的魔術支援。
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
  const out = { enemyName: String(pcData[eIdx][COL.PC.NAME]), dmg: dmg, destroyed: false, defeat: false, dreamPrompt: "", after: 0, stealthy: stealthy, svName: String(pcData[svIdx][COL.PC.NAME]), foeCard: '〔夜襲者〕' + servantCard_(pcData[eIdx], { skipClose: true, foe: true }) };
  // 🗡️ 斬斷救贖(severed)：與 fateStrike_ 同一道閘門，確保帶 rule_breaker/anti_magic_lance 的敵從者不會靠突襲繞過戰鬥續行/復活封鎖。
  const severed = hasFx_(enemyC, 'rule_breaker') || hasFx_(enemyC, 'anti_magic_lance');
  let hp = parseInt(pcData[svIdx][COL.PC.HP]) || 0, after = hp - dmg;
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
  if (cur <= cost) return JSON.stringify({ success: false, needRest: true, noSecondWind: true, message: "你的身體太虛弱了，再燒下去會當場斷氣。只能休息恢復，或用令咒脫離。" });
  pcData[pIdx][COL.PC.HP] = cur - cost;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  const ap = grantAp_(myGameId, 4, pcData, sheets);
  const aiPrompt = `【系統·強撐已結算】御主透支魔術迴路與體力、燃燒生命力強行擠出最後的行動之力（代價是燒掉一截生命，行動力回到 ${ap}/${AP_PER_DAY}）。\n` +
    `★描寫御主咬牙硬撐、迴路過載灼痛、以意志逼出餘力的一幕。已結算。\n` +
    ``;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：HP扣減/AP授予皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, ap: ap, apMax: AP_PER_DAY, clock: clockLabel_(myGameId, pcData), statusString: buildPlayerStatusString(pcData[pIdx]) });
}

var WORKSHOP_TAG_ = makeTextTag_('陣地');
function getWorkshop_(memory) { return WORKSHOP_TAG_.get(memory); }
function setWorkshopMemory_(memory, loc) { return WORKSHOP_TAG_.set(memory, loc); }

// 🏰 主場陣地判定：玩家於【自己佈設的陣地】迎戰 → 回主場結界階(供減傷/反擊)；不在自己陣地回空。
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
  if (isFate && getAp_(myGameId, pcData) < 1) return JSON.stringify({ success: false, needRest: true, message: "行動力不夠，沒辦法佈設陣地。先休息恢復。" });
  // 🔮 布設陣地的勞動：灌注魔力築起結界／機關／術式，須御主純魔 ≥ WORKSHOP_MANA_COST
  const mMp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  if (isFate && mMp < WORKSHOP_MANA_COST) return JSON.stringify({ success: false, message: `佈設陣地要灌注魔力築起結界與機關（需 ${WORKSHOP_MANA_COST} 魔），當前御主魔力不足（${mMp}／需 ${WORKSHOP_MANA_COST}）——先補魔或休整。` });
  if (isFate) pcData[pIdx][COL.PC.MP] = Math.max(0, mMp - WORKSHOP_MANA_COST);
  pcData[pIdx][COL.PC.MEMORY] = setWorkshopMemory_(pcData[pIdx][COL.PC.MEMORY], loc);
  const _wsApr = chargeApOrReject_(myGameId, 1, pcData, sheets, "行動力不夠，沒辦法佈設陣地。先休息恢復。", { isFate: isFate, skipWrite: true });
  const ap = _wsApr.ap, clock = _wsApr.clock;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]); // MP＋MEMORY＋AP 一起寫回
  // 🎬 AI 演出：布設陣地的勞作（有陣地作成 Caster→其親手築結界；否則御主張設簡易營地）。給事實素材、少下指令。
  const casterRow = pcData.find(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && hasFx_(rowToCombatant_(r), 'territory'));
  const csName = casterRow ? String(casterRow[COL.PC.NAME]) : "";
  const wsPrompt = masterCard_(pcData[pIdx]) + (casterRow ? servantCard_(casterRow) : '') +
    `【系統·陣地佈設·已裁定】御主一行於「${loc}」紮下陣地——${csName ? `「${csName}」以陣地作成之能，在此地` : '御主親手在此地'}布設層層魔術結界、暗藏機關與監視術式，御主傾注了可觀的魔力為根基。自此這裡成為我方的堡壘：駐留可加速供魔回復，於此迎戰享主場結界庇護，敵人潛入亦難越雷池。\n` +
    `★【90~140 字】演出這場「築起陣地」的勞作——${csName ? `「${csName}」施展術式、鋪設結界的專注與魔力流轉，法師將一方土地化為己身堡壘的過程` : '御主費心張設營地與警戒的辛勞'}；落在完工後那份「這裡是我們的據點了」的踏實與底氣。`;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：MP扣減/陣地標記/spendAp_ 皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, message: `已於「${loc}」佈設陣地（工房）——耗 ${WORKSHOP_MANA_COST} 魔築起結界。駐留供魔提升；於此決戰享主場庇護、敵襲反被擊退。`, aiPrompt: wsPrompt, clock: clock, ap: ap, apMax: AP_PER_DAY, economy: isFate ? playerServantEconomy_(sheets, pcId, pcData) : null });
}

// 🔍 搜索物資：偵查鄰近敵蹤為主，順手撿拾零星魔力（耗 1 AP）⚠ 反「無痛回魔」：每地的散逸魔力有限，搜刮一次即枯竭——同地重搜只得殘渣。
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
  if (isFate && getAp_(myGameId, pcData) < 1) return JSON.stringify({ success: false, needRest: true, message: "行動力不夠，沒辦法好好搜索。先休息恢復。" });
  // 🔋 撿拾零星魔力：基礎 ~10% 上限；同地已搜刮過→枯竭、僅得殘渣 ~3%。靠移動探索換取、非站樁刷魔。
  const mpMax = parseInt(pcData[pIdx][COL.PC.MAX_MP]) || 80;
  const cur = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  const curLoc = String(pcData[pIdx][COL.PC.LOC] || "").trim();
  const depleted = curLoc !== "" && getScavengedLocs_(pcData[pIdx][COL.PC.MEMORY]).indexOf(curLoc) >= 0;
  const rate = depleted ? 0.03 : 0.10;
  const gain = Math.max(0, Math.min(mpMax, cur + Math.round(mpMax * rate)) - cur);
  pcData[pIdx][COL.PC.MP] = cur + gain;
  if (!depleted && curLoc) pcData[pIdx][COL.PC.MEMORY] = addScavengedLoc_(pcData[pIdx][COL.PC.MEMORY], curLoc);
  const _scavApr = chargeApOrReject_(myGameId, 1, pcData, sheets, "行動力不夠，沒辦法好好搜索。先休息恢復。", { isFate: isFate, skipWrite: true });
  const ap = _scavApr.ap, clock = _scavApr.clock;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  // 35% 機率察覺鄰近敵蹤（揭露一名最近的未偵查敵）——搜索的真正價值在情報。（全文見 CODE_NOTES.md）
  const scavMapData = getMapDataCached(sheets);
  const scavWar = isFate ? getWarName_(pcData[pIdx][COL.PC.MEMORY]) : "";
  let scavScope = [curLoc];
  try { getNearbyLocations(curLoc, scavMapData, scavWar).forEach(l => { const nm = (l && l.name) ? l.name : l; if (nm) scavScope.push(String(nm).trim()); }); } catch (e) { }
  const scavDay = parseInt(pcData[pIdx][COL.PC.DAY]) || 1;
  let intel = "";
  if (Math.random() < 0.35) {
    for (var i = 1; i < pcData.length; i++) {
      var fac = String(pcData[i][COL.PC.FACTION]);
      if ((fac === "敵御主" || fac === "敵從者") && String(pcData[i][COL.PC.GAME_ID] || "") === myGameId && !String(pcData[i][COL.PC.ID]).startsWith("DEAD_") && !pcData[i][COL.PC.SEEN] && scavScope.indexOf(String(pcData[i][COL.PC.LOC] || "").trim()) !== -1 && hasArrived_(pcData[i], scavDay)) {
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
    `★【60~100 字】演出這段翻找、感應散逸魔力的搜索過程；${intel ? '收尾帶出察覺遠處氣息時的警覺' : '收尾停在暫時平靜的餘韻'}；是否交戰仍由御主下令。`;
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
    return JSON.stringify({ success: false, needRest: true, message: "行動力不夠，沒辦法偵查。先休息，恢復了再探。" });
  }
  const curLoc = String(pcData[pIdx][COL.PC.LOC] || "").trim();
  // 附近地點（含當前）作為偵查範圍
  const mapData = getMapDataCached(sheets); // 坤圖已靜態化：getMapDataCached 直接讀FATE_MAP_SEED常數，零I/O成本
  let scope = [curLoc];
  const scoutWar = isFateScout ? getWarName_(pcData[pIdx][COL.PC.MEMORY]) : "";
  try { getNearbyLocations(curLoc, mapData, scoutWar).forEach(l => { const nm = (l && l.name) ? l.name : l; if (nm) scope.push(String(nm).trim()); }); } catch (e) { }

  const scoutDay = parseInt(pcData[pIdx][COL.PC.DAY]) || 1;
  let revealedHere = [], revealedNear = [];
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
    (loc === curLoc ? revealedHere : revealedNear).push(String(pcData[i][COL.PC.NAME]) + (loc === curLoc ? "" : "（" + loc + "）"));
  }

  const _scoutApr = chargeApOrReject_(myGameId, 1, pcData, sheets, "行動力不夠，沒辦法偵查。先休息，恢復了再探。", { isFate: isFateScout });
  const scoutAp = _scoutApr.ap, scoutClock = _scoutApr.clock;

  const revealed = revealedHere.concat(revealedNear);
  const msg = revealed.length
    ? `偵查四方，捕捉到氣息：${revealed.join("、")}。`
    : `偵查四方，附近暫無敵蹤現形。`;
  // 🎬 aiPrompt 只給「有無揭露敵蹤」，不夾帶座標/戰術細節(那些留給地圖UI)，AI只負責演出當下氛圍/警覺。
  const scoutSvIdx = findPlayerServantIdx_(pcData, myGameId, "");
  const scoutPrompt = masterCard_(pcData[pIdx]) + (scoutSvIdx !== -1 ? servantCard_(pcData[scoutSvIdx]) : '') +
    `【已裁定】御主凝神探查氣息${revealed.length
      ? `${revealedHere.length ? `——${revealedHere.join("、")}就在這裡、已無所遁形` : ''}${revealedNear.length ? `${revealedHere.length ? '；另' : '——'}於鄰近之地捕捉到：${revealedNear.join("、")}` : ''}。`
      : `，四下風平浪靜、暫無敵蹤現形。`}\n` +
    `★【60~100 字】演出這段探查，${revealedHere.length ? '對方就在眼前、彼此都清楚已被看穿，寫這份一觸即發的緊繃' : revealedNear.length ? '氣息來自別處、尚隔著距離，寫這份山雨欲來的警覺' : '寫短暫的鬆一口氣、與不敢鬆懈的戒備'}；是否交戰仍由御主下令。`;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：SEEN揭露/spendAp_ 皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, message: msg, revealed: revealed, aiPrompt: scoutPrompt, clock: scoutClock, ap: scoutAp, apMax: AP_PER_DAY, statusString: buildPlayerStatusString(pcData[pIdx]) });
}

