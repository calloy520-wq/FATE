// ==========================================
// 🗺️ Router_Movement.gs — 地圖／移動／休息／偵查／搜刮／整備／工房／卸防突襲（2026-07 拆出）
//   一切「在地圖上做的事」：actionGetMapNodes/actionMove/actionRest/actionScout/actionScavenge/
//   actionSetWorkshop/actionSecondWind/actionPrepMeal ＋ 對應 MEMORY 標記存取器。
// ==========================================

// 🔵 視覺地圖節點：冬木頂層地點 + 座標 + 我是否在此 + 已偵查敵人數(吃迷霧/game_id)
//   ⚡ 2026-07：算法拆成 buildMapNodesPayload_(吃呼叫端已讀好的 pcData/md，零額外整表讀)——
//   actionGetMapNodes(獨立 round-trip) 與 buildClientState_(夾帶進共用 state blob) 共用同一份邏輯，
//   免得地圖每次顯示都要手機再打一趟 google.script.run(這是手機「地圖更新很慢」的根因：多餘 round-trip)。
// ⚠ 2026-07 新增戰爭分流：地圖原本全局共用同一份地點，但海特飯店/麥肯基宅等第四次限定據點
//   若在第五次局也顯示是明確的設定錯誤(那幾位御主根本不在那場戰爭)。查玩家自己這局的
//   【戰爭】標記(getWarName_ 已存在、Router_Creation.gs 定義)，只留通用地點(WAR空白)＋符合本局戰爭者。
function buildMapNodesPayload_(sheets, pcData, myGameId, myLoc) {
  // 🔄 2026-07 玩家定案「坤圖靜態化」：getMapDataCached 已改直接讀FATE_MAP_SEED常數，不再依賴
  //   sheets.map 是否存在(該分頁現在純供人工查閱，遊戲邏輯不讀它)，原本的存在性guard拿掉。
  // 🐛→✅ 2026-07 稽核補漏：這整個函式(找戰爭名/盟友情報揭露/敵蹤掃描/坤圖節點)都是solo戰爭
  //   地圖限定概念——鑑賞早就拔了固定地圖節點系統，前端(applyClientState)本就只在非kanshou模式
  //   才會 renderMapPane(data.mapNodes)，鑑賞這裡算出來的結果從頭到尾沒人渲染。比照其餘solo限定
  //   計算補上guard，鑑賞(game_id非g_開頭)直接回同一份「空」形狀，不再白算敵蹤掃描＋坤圖比對。
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
    return JSON.stringify({ success: false, message: "行動力不足以遠行（需 2 點）——請『休息』恢復後再出發。", clock: clockLabel_(moveGameId, allPcData), ap: getAp_(moveGameId, allPcData), apMax: AP_PER_DAY });
  }

  // 💨 撤離追擊(一點點)：從「有活敵從者」的格子離開時，較快的敵從者可能咬一記離別追擊。
  //   ★可生還·不致死(從者血保 1)——只是不讓你一按就從強敵眼皮底下從容全身而退。用移動【前】的初始資料判定。
  const tgtTrim = String(target || "").trim();
  // 🗺️ 目的地必須存在於坤圖(母區域或分支名)——擋掉偽造參數傳送到「地圖外」當永久安全屋(敵AI/夜襲永遠碰不到)。
  if (!tgtTrim) return JSON.stringify({ success: false, message: "未指定目的地。" });
  // ⚡ 2026-07 提速：坤圖本回合不會變動，這裡先抓一次(維持原本的 try/catch 容錯——失敗時跟原本
  //   一樣悄悄跳過此檢查)，留給下面「抵達場景描述」那段共用，省掉 getMapDataCached 第二次呼叫；
  //   萬一這裡真的失敗(極端邊角)，moveMapData 留 null，後段沿用原本各自獨立呼叫的舊行為。
  let moveMapData = null;
  try {
    moveMapData = getMapDataCached(sheets);
    const _tgtRoot = tgtTrim.split('-')[0].trim();
    if (!moveMapData.some(m => { const nm = String(m[COL.MAP.NAME]).trim(); return nm === tgtTrim || nm === _tgtRoot; })) {
      return JSON.stringify({ success: false, message: "輿圖之上查無此地，無路可達。" });
    }
  } catch (e) { }
  var pursuit = null;
  try {
    var fromLocM = String(allPcData[pIdx][COL.PC.LOC] || "").trim();
    if (isFateMove && fromLocM && tgtTrim && tgtTrim !== fromLocM) {
      var psvIdxM = findPlayerServantIdx_(allPcData, moveGameId, userData.servant);
      if (psvIdxM !== -1) {
        var psvC = rowToCombatant_(allPcData[psvIdxM]);
        try { injectMysticBuff_(psvC, allPcData[pIdx][COL.PC.MEMORY]); } catch (e) { } // ✨ 逃跑時也吃御主禮裝(如 Avalon 承受寶具減傷)
        psvC._shieldMp = parseInt(allPcData[pIdx][COL.PC.MP]) || 0; // 💠 背擊寶具＝七天盾可展開(扣魔)，付不起張不開
        var psvAgi = rankVal(psvC.six['敏捷'] || 'C');
        var psvHp = parseInt(allPcData[psvIdxM][COL.PC.HP]) || 0, psvMax = parseInt(allPcData[psvIdxM][COL.PC.MAX_HP]) || 1;
        // 🔮 預告寶具·背後傾瀉：離場格若有敵人正「寶具預告」蓄勢中 → 朝你退卻的背影傾瀉充能寶具＝NP 級臨別重擊
        //   (優先於一般追擊；八成挨到·騎乘可減、夠強可反擋逼退；保 1 不致死但很痛；消耗預告旗標於下方套用處)。
        // 2026-07 修：原本 forEach 沒 break，離場格多個敵人同時預告寶具時只有陣列順序最後一個會結算，
        //   其餘預告旗標這回合既不觸發也不清除——改 find() 只取第一個相符者(找到即停)。
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
          // 🔋 背擊也要買單(2026-07 修三漏)：①與戰鬥內同準——敵御主電池付得起 prana 才轟得出來(付不起→不發·
          //   走一般追擊)；②解放＝出力全開(原漏設=60 反而比正規弱)；③我方擋下時的反手一擊【另以普通交鋒結算】
          //   ——原本沿用 np 裁決的 winner 傷害，等於我方沒解放寶具卻免費吃到自己寶具骰的 NP 級反擊。
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
                pursuit = { enemyName: teleName, chaserId: String(teleFoe[COL.PC.ID]), dmg: Math.max(1, cntT.atkWins ? cntT.damage : Math.round(rankVal(psvC.six['筋力'] || 'C') * 0.5)), hitWho: 'foe', np: true,
                  note: '「' + teleName + '」的寶具在你身後炸開，卻被你的從者堪堪擋開、反手逼退。' };
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
            var chaserNm = String(chaser[COL.PC.NAME]);
            // 🐛→✅ 2026-07 修：舊版這支六圍追擊只扣血、沒有 note——worldRumors 只在 pursuit.note 存在時才會
            //   推播戰報(見下方 pursuit.note 判斷)，導致玩家從者莫名其妙少一截血、完全看不出發生了什麼，
            //   體感上「撤離判定好像只有寶具預告會發動」(那條有 note、看得到；這條沒有、看不到)。已補上 note。
            pursuit = { enemyName: chaserNm, chaserId: String(chaser[COL.PC.ID]), dmg: Math.max(1, pr.damage), hitWho: pr.atkWins ? 'us' : 'foe',
              note: pr.atkWins
                ? ('「' + chaserNm + '」腳程更快，你才轉身欲走，她已欺身欺至，狠狠螫了你的從者一記——沒能全身而退。')
                : ('「' + chaserNm + '」欺身追至，卻被你的從者堪堪回身擋開、反手逼退。') };
          }
        }
      }
    }
  } catch (e) { }

  // 🎭 抵達態度判定（趁世界尚未 tick，看 target 此刻是否「已有先客」）：
  //   先客在＝玩家主動找上門(對方在自己地盤、會警惕戒備)；無＝偶遇(雙方恰巧撞上、都帶幾分意外)。
  // 🐛→✅ 2026-07 稽核補漏：這段掃「敵御主/敵從者」只有solo的travelTo()(Script.html)會消費
  //   (data.preFoes)，鑑賞從未有這兩種陣營的列——比照其餘solo限定計算補上isFateMove guard，
  //   不再只靠「鑑賞資料形狀恰好filter不到東西」僥倖安全。
  const preFoesAtTarget = isFateMove ? allPcData.filter(r =>
    (String(r[COL.PC.FACTION]) === "敵御主" || String(r[COL.PC.FACTION]) === "敵從者")
    && (!moveGameId || String(r[COL.PC.GAME_ID] || "") === moveGameId)
    && !String(r[COL.PC.ID]).startsWith("DEAD_")
    && String(r[COL.PC.LOC] || "").trim() === tgtTrim
    && hasArrived_(r, _moveDay()) // 🕰️ 尚未登場者不算「先客」
  ).map(r => String(r[COL.PC.NAME])) : [];

  // 🌍 世界先動，玩家後到：先讓敵御主／敵從者 tick 到各自的新位置，再把玩家落到 target——
  //   這樣「追到敵人所在地」時，敵人不會在你踏進來的同一瞬間又被傳走（修：撞在一起卻沒對話）。
  //   敵人就位後才讀同地資料給 AI，這一輪它們鎖在原地，遭遇敘事才跑得起來。
  let clockLabel = "", worldRumors = [], apLeft = AP_PER_DAY, moveVictory = false, moveDream = "";
  if (isFateMove) {
    try {
      // 🐛→✅ 2026-07 稽核抓到(效能)：這裡傳pcData/sheets給spendAp_省整表讀是對的，但函式結尾
      //   (下方 sheets.pc.getRange(1,1,...).setValues(allPcData))本就會整表批次寫回，涵蓋這3欄
      //   在內——spendAp_內部writeClockToRow_原本還會立即單獨寫一次同樣的值，變成完全多餘的一次
      //   Sheets API呼叫。傳skipWrite=true只改記憶體，交給結尾那次批次寫回一起帶出去。
      const sp = spendAp_(moveGameId, 2, allPcData, sheets, true);
      apLeft = sp.ap;
      // ⚡ 2026-07：把 allPcData 傳給 worldTick_/breakStaleAlliances_，讓它們在同一份陣列上原地改
      //   (JS 陣列傳參考)，不必像過去那樣事後重讀整表才能拿到 tick 後的最新狀態。
      const tick = worldTick_(sheets, moveGameId, target, 1, false, allPcData); // 移動只讓敵換位，不死人；但令咒透支倒數可能到期收尾
      worldRumors = tick.rumors || [];
      moveVictory = !!tick.victory;
      moveDream = tick.dreamPrompt || ""; // 🏆 令咒透支延遲結算若剛好收尾此局，願望夢跟著帶出來
      try { const ab = breakStaleAlliances_(sheets, moveGameId, allPcData); if (ab.broken.length) worldRumors.push(`〔盟約${ab.forced ? '瓦解' : '到期'}〕你與「${ab.broken.join('、')}」的同盟已${ab.forced ? '因戰局逼近終局而破裂——最後只能剩一個' : '到期失效'}，重回敵對。`); } catch (e) { }
      clockLabel = clockLabel_(moveGameId, allPcData);
    } catch (e) { }
  }

  // 🔁 敵人已在同一份 allPcData 上 tick 就位(worldTick_/breakStaleAlliances_ 皆原地改、不必重讀)，
  //   直接把玩家(與同行從者)落到 target；pIdx 全程未變(過程中沒有任何列被新增/刪除)。
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
  // 📊🎭 2026-07 修「追擊戰報從者沒有描述」：舊版只把 pursuit.note 塞進抵達提示詞裡當一句附註，
  //   既沒有像卸防突襲那樣的數字戰報卡（玩家反映看不到發生了什麼)，也沒附上追兵的 servantCard_
  //   (性格/口吻卡)——AI 只拿到一句乾巴巴的事實敘述，沒有角色素材可演，難怪從者/敵人都演不出反應。
  //   比照 enemyAmbushOnServant_ 的 foeCard 模式補上：foeCard 讓 AI 知道追兵是誰、什麼調性；
  //   report 讓前端秒顯數字戰報卡(renderFateBattleReport 新增 r.pursuit 分支)，不必等 AI。
  var pursuitReport = null;
  if (pursuit) {
    var pFsvIdx = findPlayerServantIdx_(allPcData, moveGameId, userData.servant);
    var pSvName = pFsvIdx !== -1 ? String(allPcData[pFsvIdx][COL.PC.NAME]) : "從者";
    var pSvHpMax = pFsvIdx !== -1 ? (parseInt(allPcData[pFsvIdx][COL.PC.MAX_HP]) || 0) : 0;
    var pSvHpAfter = pFsvIdx !== -1 ? (parseInt(allPcData[pFsvIdx][COL.PC.HP]) || 0) : 0;
    var pChaserRow = allPcData.find(function (r) { return String(r[COL.PC.ID]) === pursuit.chaserId; });
    pursuit.foeCard = pChaserRow ? servantCard_(pChaserRow) : "";
    pursuitReport = {
      pursuit: true, np: !!pursuit.np, enemyName: pursuit.enemyName, dmg: pursuit.dmg, hitWho: pursuit.hitWho,
      svName: pSvName, svHpMax: pSvHpMax, after: pSvHpAfter
    };
  }

  // ⚔️ 2026-07 玩家提案「兩組敵對人馬同格，應該正在互毆，不是相安無事站著」：抵達地點若同時有
  //   ≥2 位不同敵御主(各帶其從者)在場，判他們早已交手片刻——GAS 先用真實交鋒裁決扣一點血(非全力
  //   死鬥，只是「先前已互相消耗」的餘傷)，AI 只演出「玩家的到來打斷了這場戰鬥」，不讓多批敵人像
  //   沒事發生一樣杵在同一格互不理睬。只挑第一組能配對成功的兩位(3+方同格的極少數情況不重複觸發)。
  var factionClash = null;
  // 🐛→✅ 2026-07 稽核補漏(高風險)：這段不只是「白算」，它會真的對敵御主/敵從者列寫HP(下方
  //   clashDmg扣血)——過去無guard，只是「鑑賞眾生從不存在敵御主列」這個資料形狀讓它永遠掃不到
  //   東西才安全，屬於「僥倖安全」而非「結構保證」。比照專案一貫做法(別只靠資料形狀，明確guard)，
  //   補上isFateMove——這整段本就是「兩組敵對人馬同格先前已交手」的solo戰爭限定演出，鑑賞無戰鬥、
  //   無敵對陣營，結構上不會、也不該跑到這裡。
  try {
    var clashMasters = [];
    if (isFateMove) allPcData.forEach(function (r) {
      if (String(r[COL.PC.GAME_ID] || "") !== moveGameId) return;
      if (String(r[COL.PC.LOC] || "").trim() !== tgtTrim) return;
      if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
      if (String(r[COL.PC.FACTION]) !== "敵御主") return;
      if (isAllied_(r)) return; // 已與玩家結盟者現在算友軍，不參與這場「敵對互毆」演出
      if (!hasArrived_(r, _moveDay())) return; // 🕰️ 尚未登場者不參與這場演出
      clashMasters.push(r);
    });
    if (clashMasters.length >= 2) {
      var findClashSv_ = function (masterRow) {
        var mN = String(masterRow[COL.PC.NAME] || "");
        return allPcData.find(function (r) {
          return String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === moveGameId &&
            String(r[COL.PC.LOC] || "").trim() === tgtTrim && !String(r[COL.PC.ID]).startsWith("DEAD_") &&
            String(r[COL.PC.MEMORY] || "").indexOf("【御主】" + mN) >= 0;
        });
      };
      var svA = findClashSv_(clashMasters[0]), svB = findClashSv_(clashMasters[1]);
      if (svA && svB && String(svA[COL.PC.ID]) !== String(svB[COL.PC.ID])) {
        var crossRes = resolveFateBattle_(rowToCombatant_(svA), rowToCombatant_(svB), {});
        var loserRow = crossRes.atkWins ? svB : svA;
        var loserIdx = allPcData.findIndex(function (r) { return String(r[COL.PC.ID]) === String(loserRow[COL.PC.ID]); });
        var clashDmg = Math.max(1, Math.round((crossRes.damage || 1) * 0.4)); // 🩸 只是先前交手的餘傷，非全力對決
        if (loserIdx !== -1) allPcData[loserIdx][COL.PC.HP] = Math.max(1, (parseInt(allPcData[loserIdx][COL.PC.HP]) || 0) - clashDmg);
        factionClash = {
          aMaster: String(clashMasters[0][COL.PC.NAME]), bMaster: String(clashMasters[1][COL.PC.NAME]),
          loserName: String(loserRow[COL.PC.NAME]), dmg: clashDmg,
          note: `你抵達時，「${String(clashMasters[0][COL.PC.NAME])}」與「${String(clashMasters[1][COL.PC.NAME])}」的從者已鏖戰多時——「${String(loserRow[COL.PC.NAME])}」帶著新添的傷勢（−${clashDmg}），雙方在你踏入的瞬間戒備地停手，各自警惕地看向這個不速之客。`
        };
      }
    }
  } catch (e) { }
  if (factionClash) worldRumors.unshift('〔敵對交鋒〕' + factionClash.note);

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

  // 🐛→✅ 2026-07 稽核補漏：markRivalsSeen_ 是「戰爭迷霧」機制，找同地敵御主/敵從者標記已見過——
  //   鑑賞眾生從不存在這兩種陣營的列，過去無guard、每次移動都白掃一輪從沒中過的迴圈，比照本輪
  //   其餘solo限定計算補上isFateMove guard。
  if (isFateMove) { try { markRivalsSeen_(sheets, pcId, allPcData); } catch (e) { } } // 🔵 抵達即偵查此地敵人；就地標記+批次寫回，免重讀

  // 📜 正典劇情插針已移除（2026-06 玩家定案·沒啥用處）——抵達不再自動塞 Fate 原作橋段／路線引導。

  const freshMapData = moveMapData || getMapDataCached(sheets); // 坤圖已靜態化(讀FATE_MAP_SEED常數，零I/O成本)，這裡複用上面已抓過的結果純粹省一次函式呼叫
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
      if (!hasArrived_(r, _moveDay())) return; // 🕰️ 尚未登場者不出現在抵達敘事的人設卡裡
      if (String(r[COL.PC.FACTION]) === "敵從者") foeCardsMove += servantCard_(r);
    });
  } catch (e) { }

  STATE_PRE_DATA_ = allPcData; // ⚡ 交棒：本 handler 所有寫入(worldTick_/spendAp_/markRivalsSeen_/夜襲…)皆已原地改回 allPcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({
    success: true,
    masterCard: masterCard_(allPcData[pIdx]), // 🎭 御主演出依據→抵達敘事讓「我」依性格開口、不再啞巴主角
    servantCard: svCardMove,
    foeCards: foeCardsMove,
    pursuit: pursuit,
    report: pursuitReport, // 📊 撤離追擊數字戰報卡(見上方建構處)——renderFateBattleReport 秒顯，不等 AI
    factionClash: factionClash, // ⚔️ 抵達時撞見的敵對互毆(見上方建構處)——供前端插入抵達演出提示詞
    preFoes: preFoesAtTarget,
    victory: moveVictory,
    dreamPrompt: moveDream,
    statusString: buildPlayerStatusString(allPcData[pIdx]),
    // 🐛→✅ 2026-07 稽核發現「solo是solo，鑑賞是鑑賞」：move 是刻意讓鑑賞也能用的共用action(慾海
    //   約會地圖也要移動)，但這裡過去無條件呼叫 solo 的 getLocalPeopleList——跟 actionPlay 那次
    //   一樣，算了鑑賞前端從未讀取的一堆欄位。改成跟 sync(buildClientState_)同款分流，鑑賞改用
    //   精簡版 getKanshouPeopleList_(Gallery.gs)。
    people: isFateMove ? getLocalPeopleList(sheets, pcName, pcId, target, allPcData) : getKanshouPeopleList_(pcId, target, allPcData),
    locations: getNearbyLocations(target, freshMapData).slice(0, 5),
    mapNodes: buildMapNodesPayload_(sheets, allPcData, moveGameId, target), // ⚡ 夾帶地圖節點，免手機抵達後再打一趟 get_map_nodes
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
    sheets.pc.getRange(1, 1, pcData.length, pcData[0].length).setValues(pcData);

    let restClock = "", restRumors = [], apAfter = AP_PER_DAY, restVictory = false, restVictoryDream = "";
    try {
      const clk = restHours_(restGameId, restHours, pcData, sheets);
      apAfter = clk ? clk.ap : AP_PER_DAY;
      const rounds = Math.floor(restHours / 3); // 1h:0、3h:1、6h:2 輪世界自走
      // ⚡ 2026-07：worldTick_ 拿 pcData 在同一份陣列上原地改(傳參考)，不必事後重讀整表才拿得到最新狀態。
      if (rounds > 0) {
        const tick = worldTick_(sheets, restGameId, pcLoc, rounds, true, pcData); restRumors = tick.rumors || []; restVictory = !!tick.victory;
        restVictoryDream = tick.dreamPrompt || ""; // 🏆 令咒透支延遲結算若剛好收尾此局，願望夢跟著帶出來
        // 🤝 2026-07 修：同盟到期/終局強制瓦解，原本只在 actionMove 判——玩家只休息不移動就永遠不會過期/強制解盟。
        //   休息一樣會推進時間(worldTick_ 剛 tick 完)，理應同步判一次；沿用同一份 pcData(傳參考)，breakStaleAlliances_ 內部自行寫回。
        try { const ab = breakStaleAlliances_(sheets, restGameId, pcData); if (ab.broken.length) restRumors.push(`〔盟約${ab.forced ? '瓦解' : '到期'}〕你與「${ab.broken.join('、')}」的同盟已${ab.forced ? '因戰局逼近終局而破裂——最後只能剩一個' : '到期失效'}，重回敵對。`); } catch (e) { }
      }
      restClock = clockLabel_(restGameId, pcData);
    } catch (e) { }
    // 世界已在同一份 pcData 上 tick 完(靈基透支到期者可能剛判死·敵可能移位)，直接沿用即可判夜襲——
    //   不必重讀整表：pcData 全程沒有任何列被新增/刪除，剛判死的敵從者狀態也已經在這份陣列裡反映。
    // ⚔️ 卸防突襲：當敵蹤同地時休息＝酣睡門戶大開，最為兇險（mul 1.5）
    const restAmbush = enemyAmbushOnServant_(sheets, pcData, pIdx, restGameId, userData, 1.5);
    // 🌙 從者之夢（回想）：安睡(≥3h)且未遭突襲時，有機會順著聯繫夢見從者生前傳說的片段，加深羈絆
    let restDreamPrompt = "";
    if ((!restAmbush || restAmbush.homeRepel) && restHours >= 3) { // 🏰 陣地反擊＝安睡無虞·仍可做夢
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
    // 📜 正典劇情插針已移除（2026-06）——休息跨日不再自動塞 Fate 原作橋段。
    let restAmbushPrompt = "";
    if (restAmbush && restAmbush.homeRepel) {
      restAmbushPrompt = restAmbush.repelNote; // 🏰 陣地反擊·優雅擊退
    } else if (restAmbush) {
      restAmbushPrompt = (restAmbush.foeCard || '') + `【系統·歇息遭夜襲·已裁定】御主一行於「${pcLoc}」歇息、防備最鬆懈時，潛伏同地的敵從者「${restAmbush.enemyName}」${restAmbush.stealthy ? '自暗影無聲摸近' : '趁夜殺到'}，一擊重創「${restAmbush.svName || '從者'}」（−${restAmbush.dmg}）${restAmbush.destroyed ? '，其靈基崩潰、化作光點消散，御主敗北' : ''}。\n★以 Fate／TYPE-MOON 筆觸描寫酣息被夜襲撕裂的驚變（語氣留白），勝負已由系統結算。`;
    }
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
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, message: "行動力不足以好好整備——請休息恢復後再進食。" });
  var clk = getClock_(myGameId);
  if (!clk) return JSON.stringify({ success: false, message: "此刻無法整備。" });
  var nowAbs = clk.day * 24 + clk.hour;
  pcData[pIdx][COL.PC.MEMORY] = stampMeal_(pcData[pIdx][COL.PC.MEMORY], nowAbs + MEAL_BUFF_HOURS);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  var ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(myGameId, 1, pcData, sheets).ap; clock = clockLabel_(myGameId, pcData); } catch (e) { } }
  // 🎬 2026-07「solo每個按鍵都接上AI敘述」補：整備過去只回罐頭 message，比照偵查/搜索補一段輕量 aiPrompt。
  var mealSvIdx = findPlayerServantIdx_(pcData, myGameId, "");
  var mealPrompt = (mealSvIdx !== -1 ? servantCard_(pcData[mealSvIdx]) : masterCard_(pcData[pIdx])) +
    `【系統·整備已裁定】御主與從者稍作整備、飽餐一頓——接下來約 ${MEAL_BUFF_HOURS} 小時內，從者出擊命中 +${MEAL_BUFF_BONUS}。\n` +
    `★以 Fate／TYPE-MOON 筆觸【精煉 60~100 字】演出這段戰前用餐、稍事休整的日常小品（一段即可），依從者性格自然流露對這頓飯／這位御主的反應；show, don't tell，語氣輕快不冗長。`;
  return JSON.stringify({
    success: true,
    message: `整備完畢——你與從者飽餐一頓、稍事休整。接下來約 ${MEAL_BUFF_HOURS} 小時內，從者出擊命中 +${MEAL_BUFF_BONUS}。`,
    aiPrompt: mealPrompt,
    clock: clock, ap: ap, apMax: AP_PER_DAY, mealBuff: true,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// 🕯️ 喪失從者紀錄：敵從者死亡時，在「同地同 game_id 的敵御主」MEMORY 標記如何失去從者，
//   供 AI 演出形單影隻、再無從者可驅使的無牙御主。配對採同落點(一master一servant結伴移動)。
function enemyAmbushOnServant_(sheets, pcData, pIdx, gameId, userData, baseMul) {
  const myLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
  const ambushDay = parseInt(pcData[pIdx][COL.PC.DAY]) || 1; // 🕰️ 尚未登場者不會夜襲
  const eIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === myLoc && !isAllied_(r) && hasArrived_(r, ambushDay));
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
      const eDefC = rowToCombatant_(pcData[eIdx]);
      const _eWardMasterMem = enemyMasterMemoryFor_(pcData, gameId, pcData[eIdx]);
      if (_eWardMasterMem) { injectMasterMeleeSupport_(eDefC, _eWardMasterMem); injectMasterMagicSupport_(eDefC, _eWardMasterMem); }
      const cr = resolveFateBattle_(svR, eDefC, {});
      const backDmg = Math.max(1, Math.round((cr.atkWins ? (cr.damage || 1) : rankVal(svR.six['筋力'] || 'C')) * 0.6));
      const eHp = parseInt(pcData[eIdx][COL.PC.HP]) || 0, eAfter = Math.max(1, eHp - backDmg); // 驅離·保1不斬殺
      pcData[eIdx][COL.PC.HP] = eAfter;
      sheets.pc.getRange(eIdx + 1, 1, 1, pcData[eIdx].length).setValues([pcData[eIdx]]);
      const eNm = String(pcData[eIdx][COL.PC.NAME]), sNm = String(pcData[svIdx][COL.PC.NAME]);
      return {
        homeRepel: true, enemyName: eNm, svName: sNm, backDmg: backDmg, wardCost: wardCost, homeRank: homeRank,
        dmg: 0, destroyed: false, defeat: false, dreamPrompt: "", after: parseInt(pcData[svIdx][COL.PC.HP]) || 0,
        repelNote: `【系統·陣地反擊·已裁定】潛伏同地的敵從者「${eNm}」欲趁御主一行卸防時偷襲，然此地正是我方親手佈設的陣地——魔術結界示警、機關迭起，「${sNm}」從容起身、反手將來犯者擊退驅離（敵受創 −${backDmg}），我方毫髮無傷（御主耗 ${wardCost} 魔維持結界運作）。\n★以 Fate／TYPE-MOON 筆觸演出「潛入者反被主場結界與從者從容擊退」的優雅反制，語氣留白。`,
        report: { homeRepel: true, ambush: false, enemyName: eNm, svName: sNm, backDmg: backDmg, wardCost: wardCost, homeRank: homeRank }
      };
    }
  }
  const enemyC = rowToCombatant_(pcData[eIdx]);
  const svC = rowToCombatant_(pcData[svIdx]);
  // 🥋🔮 突襲主角是 enemyC(攻方)：補上其硬連結敵御主的體術/魔術支援。
  const _eAmbushMasterMem = enemyMasterMemoryFor_(pcData, gameId, pcData[eIdx]);
  if (_eAmbushMasterMem) { injectMasterMeleeSupport_(enemyC, _eAmbushMasterMem); injectMasterMagicSupport_(enemyC, _eAmbushMasterMem); }
  // 🎯 敵AI自動施展招牌施放技術(免費·戰鬥本色)：還原單層歸屬前這些是免費被動的敵方偷襲威力。
  const probe = resolveFateBattle_(enemyC, svC, { ambush: true, skill: servantActiveSkill_(enemyC) });
  let mul = baseMul || 1.4;
  const stealthy = String(pcData[eIdx][COL.PC.RANK]) === 'Assassin' || !!hasFx_(enemyC, 'stealth');
  if (stealthy) mul *= 1.4; // 氣息遮斷／暗殺趁虛而入更致命
  // 突襲傷害取「敵方端」：敵擲贏→全力(probe.damage 即敵傷)；玩家從者擲贏(擋下偷襲)→大減、底傷依敵筋力，
  //   而非玩家自己的攻擊力(原 bug：玩家從者越強、砸自己頭上的突襲傷反而越重)。
  const enemyBase = probe.atkWins ? (probe.damage || 1) : Math.round(rankVal(enemyC.six['筋力'] || 'C') * 1.2 + 6);
  const dmg = Math.max(1, Math.round(enemyBase * mul));
  // 🎭 foeCard(2026-07 補)：夜襲提示詞原本只有敵從者【名字】，性格/口吻/狂化禁言全靠 AI 即興——
  //   比照戰鬥主路徑附上演出卡，四個突襲呼叫端(休息/羈絆/結盟/補魔)共用。
  const out = { enemyName: String(pcData[eIdx][COL.PC.NAME]), dmg: dmg, destroyed: false, defeat: false, dreamPrompt: "", after: 0, stealthy: stealthy, foeCard: '〔夜襲者〕' + servantCard_(pcData[eIdx]) };
  // 🗡️ 斬斷救贖(severed)：與 fateStrike_ 同一道閘門(2026-07 修)——原本卸防突襲路徑沒有這個概念，
  //   同一隻帶 rule_breaker／anti_magic_lance 的敵從者，正規開戰會封鎖戰鬥續行/十二試煉復活，突襲卻繞得過去。
  const severed = hasFx_(enemyC, 'rule_breaker') || hasFx_(enemyC, 'anti_magic_lance');
  let hp = parseInt(pcData[svIdx][COL.PC.HP]) || 0, after = hp - dmg;
  if (after <= 0 && hasFx_(svC, 'survive') && hp > 1 && !severed) after = 1; // 戰鬥續行(致命傷才硬撐留1·2026-07 修)
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
  const ap = grantAp_(myGameId, 4, pcData, sheets);
  const aiPrompt = `【系統·強撐已結算】御主透支魔術迴路與體力、燃燒生命力強行擠出最後的行動之力（HP −${cost}，行動力 +4＝${ap}/${AP_PER_DAY}）。\n` +
    `★以 Fate／TYPE-MOON 筆觸描寫御主咬牙硬撐、迴路過載灼痛、以意志逼出餘力的一幕（一段即可）。已結算。\n` +
    ``;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：HP扣減/AP授予皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, aiPrompt: aiPrompt, ap: ap, apMax: AP_PER_DAY, clock: clockLabel_(myGameId, pcData), statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

// ── 🏕️ 陣地（工房）：存於御主 MEMORY【陣地】loc，駐留該地時供魔得工房加成 ──
// 🐛→✅ 2026-07 稽核抓到同一類bug(見Router_Bond.gs的getBondUsedToday_同批修正)：setWorkshopMemory_
//   的排除字元集寫成`[^|【]`(半形｜)，但這裡的get版本(上一行)其實已經正確排除`｜|【`兩種——只有
//   set這邊漏掉全形｜。若【陣地】後面緊接著全形｜分隔的下一個標記，這裡的replace regex會把那個｜
//   也吃掉，讓兩個標記黏在一起變成沒有分隔符(雖然各自的get函式仍能靠自己的【tag】字面重新定位、
//   不會讀錯值，但分隔符結構被破壞終究不乾淨，比照getBondUsedToday_同批修正)。
function getWorkshop_(memory) { var m = String(memory || "").match(/【陣地】([^｜|【]+)/); return m ? m[1].trim() : ""; }
function setWorkshopMemory_(memory, loc) {
  var s = String(memory || "");
  if (/【陣地】[^｜【]*/.test(s)) return s.replace(/【陣地】[^｜【]*/, "【陣地】" + loc);
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
  if (isFate && getAp_(myGameId) < 1) return JSON.stringify({ success: false, message: "行動力不足以佈設陣地——請休息恢復。" });
  // 🔮 布設陣地的勞動：灌注魔力築起結界／機關／術式，須御主純魔 ≥ WORKSHOP_MANA_COST
  const mMp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
  if (isFate && mMp < WORKSHOP_MANA_COST) return JSON.stringify({ success: false, message: `佈設陣地要灌注魔力築起結界與機關（需 ${WORKSHOP_MANA_COST} 魔），當前御主魔力不足（${mMp}／需 ${WORKSHOP_MANA_COST}）——先補魔或休整。` });
  if (isFate) pcData[pIdx][COL.PC.MP] = Math.max(0, mMp - WORKSHOP_MANA_COST);
  pcData[pIdx][COL.PC.MEMORY] = setWorkshopMemory_(pcData[pIdx][COL.PC.MEMORY], loc);
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]); // MP＋MEMORY 一起寫回
  let ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(myGameId, 1, pcData, sheets).ap; clock = clockLabel_(myGameId, pcData); } catch (e) { } }
  // 🎬 AI 演出：布設陣地的勞作（有陣地作成 Caster→其親手築結界；否則御主張設簡易營地）。給事實素材、少下指令。
  const casterRow = pcData.find(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && hasFx_(rowToCombatant_(r), 'territory'));
  const csName = casterRow ? String(casterRow[COL.PC.NAME]) : "";
  const wsPrompt = (casterRow ? servantCard_(casterRow) : masterCard_(pcData[pIdx])) +
    `【系統·陣地佈設·已裁定】御主一行於「${loc}」紮下陣地——${csName ? `「${csName}」以陣地作成之能，在此地` : '御主親手在此地'}布設層層魔術結界、暗藏機關與監視術式，御主灌注了 ${WORKSHOP_MANA_COST} 點魔力為根基。自此這裡成為我方的堡壘：駐留可加速供魔回復，於此迎戰享主場結界庇護，敵人潛入亦難越雷池。\n` +
    `★以 Fate／TYPE-MOON 筆觸【精煉 90~140 字】演出這場「築起陣地」的勞作——${csName ? `「${csName}」施展術式、鋪設結界的專注與魔力流轉，法師將一方土地化為己身堡壘的過程` : '御主費心張設營地與警戒的辛勞'}；show, don't tell，落在完工後那份「這裡是我們的據點了」的踏實與底氣。`;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：MP扣減/陣地標記/spendAp_ 皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, message: `已於「${loc}」佈設陣地（工房）——耗 ${WORKSHOP_MANA_COST} 魔築起結界。駐留供魔提升；於此決戰享主場庇護、敵襲反被擊退。`, aiPrompt: wsPrompt, clock: clock, ap: ap, apMax: AP_PER_DAY, economy: isFate ? playerServantEconomy_(sheets, pcId, pcData) : null });
}

// 🔍 搜索物資：偵查鄰近敵蹤為主，順手撿拾零星魔力（耗 1 AP）
//   ⚠ 反「無痛回魔」：每地的散逸魔力有限，搜刮一次即枯竭——同地重搜只得殘渣。
//   想真正回滿池要付永久代價(補魔)或靠時間(靈脈/陣地/休息)。標記記於 MEMORY【搜刮】loc。
// 🐛→✅ 2026-07 稽核抓到同一類bug(見getWorkshop_/setWorkshopMemory_同批修正)：set這邊排除字元集
//   同樣漏了全形｜，改成跟get版本一致的`[^｜【]`。
function getScavengedLoc_(memory) { var m = String(memory || "").match(/【搜刮】([^｜|【]+)/); return m ? m[1].trim() : ""; }
function setScavengedLoc_(memory, loc) {
  var s = String(memory || "");
  if (/【搜刮】[^｜【]*/.test(s)) return s.replace(/【搜刮】[^｜【]*/, "【搜刮】" + loc);
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
  if (isFate) { try { ap = spendAp_(myGameId, 1, pcData, sheets).ap; clock = clockLabel_(myGameId, pcData); } catch (e) { } }
  // 35% 機率察覺鄰近敵蹤（揭露一名最近的未偵查敵）——搜索的真正價值在情報
  let intel = "";
  if (Math.random() < 0.35) {
    for (var i = 1; i < pcData.length; i++) {
      var fac = String(pcData[i][COL.PC.FACTION]);
      if ((fac === "敵御主" || fac === "敵從者") && String(pcData[i][COL.PC.GAME_ID] || "") === myGameId && !String(pcData[i][COL.PC.ID]).startsWith("DEAD_") && !pcData[i][COL.PC.SEEN]) {
        // 🐛→✅ 2026-07 稽核抓到：原本只寫進sheet、沒同步寫回pcData[i][COL.PC.SEEN]——若之後
        //   把pcData交棒給STATE_PRE_DATA_(dispatcher夾_state用)，這裡剛揭露的敵蹤在交棒的陣列裡
        //   仍是「未偵查」，跟本回合訊息文字「搜索間隱約察覺...」自相矛盾。比照actionScout同款先寫記憶體。
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
  // 🎬 2026-07「solo每個按鍵都接上AI敘述」補：搜索過去只回罐頭 message，比照偵查/工房補一段輕量 aiPrompt。
  const scavSvIdx = findPlayerServantIdx_(pcData, myGameId, "");
  const scavPrompt = (scavSvIdx !== -1 ? servantCard_(pcData[scavSvIdx]) : masterCard_(pcData[pIdx])) +
    `【系統·搜索已裁定】御主一行在此地細細搜索，${depleted ? '此地散逸魔力早被搜刮殆盡、只餘殘渣' : '導入了零星散逸的魔力'}。${intel ? intel : ''}\n` +
    `★以 Fate／TYPE-MOON 筆觸【精煉 60~100 字】演出這段翻找、感應散逸魔力的搜索過程（一段即可）；${intel ? '收尾帶出察覺遠處氣息時的警覺' : '收尾停在暫時平靜的餘韻'}；show, don't tell，是否交戰仍由御主下令。`;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：MP/MEMORY搜刮枯竭標記/SEEN揭露/spendAp_ 皆已原地改回 pcData
  return JSON.stringify({ success: true, message: msg, aiPrompt: scavPrompt, clock: clock, ap: ap, apMax: AP_PER_DAY, statusString: getFreshStatusString(pcId, pIdx, sheets) });
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
  const mapData = getMapDataCached(sheets); // 坤圖已靜態化：getMapDataCached 直接讀FATE_MAP_SEED常數，零I/O成本
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
  if (isFateScout) { try { scoutAp = spendAp_(myGameId, 1, pcData, sheets).ap; scoutClock = clockLabel_(myGameId, pcData); } catch (e) { } }

  const msg = revealed.length
    ? `偵查四方，捕捉到氣息：${revealed.join("、")}。`
    : `偵查四方，附近暫無敵蹤現形。`;
  // 🎬 2026-07「solo每個按鍵都接上AI敘述」補：偵查過去只回罐頭 message，AI 完全沒吃到——現比照
  //   actionSetWorkshop 補一段輕量 aiPrompt。有隨行從者→帶 servantCard_ 一起演出；facts 只給
  //   「有無揭露敵蹤」，不夾帶座標/戰術細節（那些留給地圖UI，AI只負責演出當下的氛圍/警覺）。
  const scoutSvIdx = findPlayerServantIdx_(pcData, myGameId, "");
  const scoutPrompt = (scoutSvIdx !== -1 ? servantCard_(pcData[scoutSvIdx]) : masterCard_(pcData[pIdx])) +
    `【系統·偵查已裁定】${revealed.length ? `御主凝神探查四周氣息，察覺到潛伏的敵蹤：${revealed.join("、")}。` : `御主凝神探查四周氣息，附近暫無敵蹤現形，一時風平浪靜。`}\n` +
    `★以 Fate／TYPE-MOON 筆觸【精煉 60~100 字】演出這段凝神戒備、探查四周的氣息與觀察（一段即可），${revealed.length ? '流露警覺與一絲山雨欲來的張力' : '流露短暫的鬆一口氣或不敢鬆懈的警戒'}；show, don't tell，是否交戰仍由御主下令。`;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：SEEN揭露/spendAp_ 皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({ success: true, message: msg, revealed: revealed, aiPrompt: scoutPrompt, clock: scoutClock, ap: scoutAp, apMax: AP_PER_DAY, statusString: getFreshStatusString(pcId, pIdx, sheets) });
}

