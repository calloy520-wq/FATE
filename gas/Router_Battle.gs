// ==========================================
// ⚔️ Router_Battle.gs — 戰鬥核心（2026-07 從 Router_Action.gs 拆出）
//   fateStrike_(單次出擊裁決)／actionFateBattle(出戰主流程)／御主電池扣費(drainForNp_)／
//   十二試煉命數／令咒餘量／靈基透支死線／餐buff＋海怪護盾 MEMORY 標記存取器。
// ==========================================

// ⚔️ Fate 戰鬥：御主號令從者出擊（D20＋六圍＋fx＋寶具），game_id 隔離
// ==========================================
// ⚔️ 單次出擊裁決：atkC 攻擊 pcData[tgtIdx]。命中才扣血（未中＝撲空、不自傷）。
//   處理破戒/戰鬥續行/令咒緊急脫離/十二試煉復活/死亡(敵→勝利判定；我→敗北)。
//   opts:{np,seal,counterMul}　ctx:{myGameId,pIdx,userData}
function fateStrike_(sheets, pcData, atkC, tgtIdx, opts, ctx) {
  opts = opts || {};
  var defC = rowToCombatant_(pcData[tgtIdx]);
  // ✨ 我方從者作守方時也吃御主禮裝被動（防禦端：如全世界之鞘承受寶具減傷）
  if (String(pcData[tgtIdx][COL.PC.FACTION]) === "從者" && ctx && ctx.pIdx >= 0) injectMysticBuff_(defC, pcData[ctx.pIdx][COL.PC.MEMORY]);
  // 🍱 整備·進食加成：御主一行戰前整備過、且尚在效期內 → 從者出擊命中 +MEAL_BUFF_BONUS
  var mealOn = false;
  try { mealOn = mealBuffActive_(pcData[ctx.pIdx][COL.PC.MEMORY], ctx.myGameId); } catch (e) { }
  var r = resolveFateBattle_(atkC, defC, { np: !!opts.np, seal: !!opts.seal, skill: opts.skill || null, ambush: !!opts.ambush, mealBuff: mealOn ? MEAL_BUFF_BONUS : 0 });
  if (opts.seal) r.atkWins = true; // 絕對命令必中
  // 🌟 寶具對轟結算傷害：傷害已由對轟裁決算好，此處只借 fateStrike_ 套用「死亡/勝負/復活/令咒脫離」全套後續邏輯
  if (opts.forceDamage != null) { r.atkWins = true; r.damage = Math.max(0, Math.round(opts.forceDamage)); r.crit = ''; }
  var out = {
    hit: r.atkWins, damage: 0, fired: (r.fired || []).slice(),
    aRoll: r.aRoll, aHit: r.aHit, dRoll: r.dRoll, dEva: r.dEva, crit: r.crit || "",
    destroyed: "", sealEscaped: false, sealNote: "", godRevived: false, godNote: "",
    victory: false, defeat: false, dreamPrompt: "", knocked: ""
  };
  if (opts.seal && !out.fired.includes('令咒·絕對命令')) out.fired.push('令咒·絕對命令');
  if (!r.atkWins) return out;

  var dmg = r.damage;
  if (opts.counterMul) dmg = Math.max(1, Math.round(dmg * opts.counterMul));
  out.damage = dmg;

  var tgtFaction = String(pcData[tgtIdx][COL.PC.FACTION] || "");
  var isPlayerSv = (tgtFaction === "從者");
  var isFoeSv = (tgtFaction === "敵從者");
  var severed = hasFx_(atkC, 'rule_breaker') || hasFx_(atkC, 'anti_magic_lance');
  var hp = parseInt(pcData[tgtIdx][COL.PC.HP]) || 0;
  // 🐙 海怪掩護：持 summon_horror 者寶具解放後，深淵海怪在前以身擋傷——傷害先扣海怪肉身，潰散後才傷及本體。
  //   faction 無關（玩家青鬍子／敵方青鬍子皆適用）；無「現存海怪」(未解放/已退場)時此段空轉。
  if (hasFx_(defC, 'summon_horror') && dmg > 0) {
    var _hClk = getClock_(ctx.myGameId);
    var _hAbs = _hClk ? _hClk.day * 24 + _hClk.hour : null;
    var _shield = getHorrorShield_(pcData[tgtIdx][COL.PC.MEMORY], _hAbs);
    if (_shield.active && _shield.remaining > 0) {
      var _sAbsorb = Math.min(_shield.remaining, dmg);
      dmg = Math.max(0, dmg - _sAbsorb);
      out.damage = dmg;
      var _sNew = _shield.remaining - _sAbsorb;
      if (_sNew <= 0) {
        pcData[tgtIdx][COL.PC.MEMORY] = clearHorrorShield_(pcData[tgtIdx][COL.PC.MEMORY]);
        out.fired.push(defC.name + '·深淵海怪以身擋下 ' + _sAbsorb + '——海怪潰散！本體暴露');
      } else {
        pcData[tgtIdx][COL.PC.MEMORY] = setHorrorShield_(pcData[tgtIdx][COL.PC.MEMORY], _sNew, _shield.max, _shield.expiry);
        out.fired.push(defC.name + '·深淵海怪以身擋下 ' + _sAbsorb + '（海怪餘 ' + _sNew + '/' + _shield.max + '）');
      }
      out.shieldCur = Math.max(0, _sNew); out.shieldMax = _shield.max; // 戰報/前端可顯示海怪肉身條
      sheets.pc.getRange(tgtIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[tgtIdx][COL.PC.MEMORY]);
    }
  }
  var after = hp - dmg;
  if (severed && after <= 0) out.fired.push(atkC.name + '·斬斷救贖(契約已破)');
  if (after <= 5 && hasFx_(defC, 'survive') && hp > 1 && !severed) { after = 1; out.fired.push(defC.name + '·戰鬥續行'); }

  // 十二試煉（God Hand）：自死亡歸來、不花御主任何資源——優先於令咒脫離判定，別讓有 God Hand 的從者(如赫拉克勒斯)
  //   平白燒掉御主寶貴的令咒逃命，牠自己就能免費復活。高位階寶具概念可「一擊燒掉多條命」，壓倒性 overkill 再加成。
  if (after <= 0 && !severed && hasFx_(defC, 'god_hand')) {
    var lives = getGodHandLives_(pcData[tgtIdx][COL.PC.MEMORY]);
    if (lives > 0) {
      var ghMaxHp = parseInt(pcData[tgtIdx][COL.PC.MAX_HP]) || 300;
      var ghReviveHp = Math.max(1, Math.round(ghMaxHp * 0.20));
      // 🔱 概念優先權：寶具解放且概念位階高 → 多燒命。位階取「fx 概念階」與「寶具規模(對人/軍/城/界)」較高者，
      //   故 Saber 的對城 Excalibur(規模5)、Gilgamesh 的 ea(概念6) 都吃得到，純對人寶具則只靠 overkill。
      var lossN = 1;
      if (opts.np) {
        var ghTier = offenseTier_(atkC, true);
        var ghScale = npAtkScale_(atkC);
        var ghScaleTier = ghScale === '對界' ? 6 : ghScale === '對城' ? 5 : ghScale === '對軍' ? 4 : 1;
        var ghSev = Math.max(ghTier, ghScaleTier);
        if (ghSev >= 6) lossN += 2; else if (ghSev >= 5) lossN += 1;
      }
      // 壓倒性傷害（遠超復活線）也多燒：≥2 倍 +1、≥3 倍 +2。讓 Saber 一記 Excalibur 不會「連一條命都燒不掉」。
      var ghOver = dmg / ghReviveHp;
      if (ghOver >= 3) lossN += 2; else if (ghOver >= 2) lossN += 1;
      if (lossN < lives) {
        var ghRemain = lives - lossN;
        out.godRevived = true;
        pcData[tgtIdx][COL.PC.HP] = ghReviveHp;
        pcData[tgtIdx][COL.PC.MEMORY] = setGodHandLives_(pcData[tgtIdx][COL.PC.MEMORY], ghRemain);
        pcData[tgtIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "神性光輝纏身", "姿勢": "緩緩起身", "負面": `十二試煉·餘${ghRemain}命`, "顏面": "不滅的戰意" });
        sheets.pc.getRange(tgtIdx + 1, 1, 1, pcData[tgtIdx].length).setValues([pcData[tgtIdx]]);
        out.godNote = `「${pcData[tgtIdx][COL.PC.NAME]}」倒下了——卻又緩緩站起。${lossN > 1 ? `這一擊的概念威能極重，一口氣燒去 ${lossN} 條命` : `十二試煉的詛咒讓他自死亡歸來`}（尚餘 ${ghRemain} 條命）。`;
        out.fired.push(pcData[tgtIdx][COL.PC.NAME] + '·十二試煉(God Hand)' + (lossN > 1 ? `·一擊燒${lossN}命` : ''));
        return out;
      }
      // lossN >= lives：餘命被這一擊燒盡 → 不復活，落入下方(令咒脫離／真正崩潰)流程
      pcData[tgtIdx][COL.PC.MEMORY] = setGodHandLives_(pcData[tgtIdx][COL.PC.MEMORY], 0);
      out.fired.push(pcData[tgtIdx][COL.PC.NAME] + '·十二試煉·餘命被一擊燒盡');
    }
  }
  // 令咒緊急脫離（僅敵從者；God Hand 已在上方優先判定過，這裡是「連命都燒盡/沒有 God Hand」才輪到的最後手段）
  if (after <= 0 && isFoeSv && !severed) {
    var eSeals = parseInt(pcData[tgtIdx][COL.PC.CONTRIB]) || 0;
    if (eSeals > 0 && Math.random() < 0.30) {
      out.sealEscaped = true;
      var leftSeals = eSeals - 1;
      pcData[tgtIdx][COL.PC.HP] = 1; pcData[tgtIdx][COL.PC.CONTRIB] = leftSeals;
      // 🕯️ 令咒燒到 0 × 無「單獨行動」→ 靈基失穩，掛上 SEAL_DOOM_HOURS 小時消滅倒數
      var doomNote = "";
      if (leftSeals <= 0 && !rowHasSolo_(pcData[tgtIdx])) {
        var dClk = getClock_(ctx.myGameId);
        if (dClk) {
          var deadAbs = dClk.day * 24 + dClk.hour + SEAL_DOOM_HOURS;
          pcData[tgtIdx][COL.PC.MEMORY] = stampDoom_(pcData[tgtIdx][COL.PC.MEMORY], deadAbs);
          pcData[tgtIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰蝕", "姿勢": "踉蹌", "負面": `令咒耗盡·靈基透支(約 ${SEAL_DOOM_HOURS} 時消滅)`, "顏面": "強撐將潰" });
          doomNote = `——三道令咒至此燃盡，失去令咒穩固的靈基開始崩解；它既無『單獨行動』自持，至多再撐約 ${SEAL_DOOM_HOURS} 小時。`;
        }
      }
      if (!doomNote) pcData[tgtIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基受創", "姿勢": "踉蹌", "負面": "令咒緊急脫離", "顏面": "咬牙退避" });
      var oldLoc = String(pcData[tgtIdx][COL.PC.LOC]).trim(), newLoc = enemyRetreatLoc_(oldLoc);
      pcData[tgtIdx][COL.PC.LOC] = newLoc;
      sheets.pc.getRange(tgtIdx + 1, 1, 1, pcData[tgtIdx].length).setValues([pcData[tgtIdx]]);
      // 🔗 用硬連結【御主】找「這名從者真正的御主」，避免同地多組時抓錯人
      //   （曾出現 A 御主一道令咒帶走 B 御主的從者的離譜 bug）。舊角色無連結→退回同地比對。
      var escMaster = getServantMaster_(pcData[tgtIdx][COL.PC.MEMORY]);
      var escMasterName = escMaster || "";
      for (var mi = 1; mi < pcData.length; mi++) {
        if (String(pcData[mi][COL.PC.FACTION]) !== "敵御主") continue;
        if (String(pcData[mi][COL.PC.GAME_ID] || "") !== ctx.myGameId) continue;
        if (String(pcData[mi][COL.PC.ID]).startsWith("DEAD_")) continue;
        var isOwnMaster = escMaster ? (String(pcData[mi][COL.PC.NAME]) === escMaster)
                                    : (String(pcData[mi][COL.PC.LOC]).trim() === oldLoc);
        if (!isOwnMaster) continue;
        if (!escMasterName) escMasterName = String(pcData[mi][COL.PC.NAME]);
        // 只有「本主與從者同地」才一起撤離；遠端御主只是隔空燃令咒下令，本人不跟著瞬移
        if (String(pcData[mi][COL.PC.LOC]).trim() === oldLoc) {
          pcData[mi][COL.PC.LOC] = newLoc; sheets.pc.getRange(mi + 1, 1, 1, pcData[mi].length).setValues([pcData[mi]]);
        }
        break;
      }
      // ⚠ sealNote 同時會進玩家看得到的回合報告(k.note)，別在這裡塞「★」AI指令字面(那種只該進 aiPrompt，見下方
      //   buildDreamPrompt_ 呼叫處另加的一行)——玩家讀到裸露的鷹架指令會很怪。
      out.sealNote = `${escMasterName ? '敵御主「' + escMasterName + '」' : '對面御主'}一道令咒迸發，強令其從者「${defC.name}」於靈基崩解前一瞬撤離戰場，遁向「${newLoc}」（敵餘令咒 ${leftSeals}）。${doomNote}`;
      logWarEvent_(ctx.myGameId, `${escMasterName ? '敵御主「' + escMasterName + '」' : '敵御主'}燃一道令咒，令重傷的從者「${defC.name}」緊急脫離戰場（敵餘令咒 ${leftSeals}）${doomNote ? '；其令咒已盡、靈基進入透支倒數' : ''}。`, String(ctx.userData.acctName || ""));
      return out;
    }
  }
  if (after <= 0) {
    out.destroyed = String(pcData[tgtIdx][COL.PC.NAME]);
    var killedIsMaster = String(pcData[tgtIdx][COL.PC.FACTION]) === "敵御主"; // 🩸 御主是凡人：斃命倒地、不是靈基化光點
    out.killedMaster = killedIsMaster;
    pcData[tgtIdx][COL.PC.ID] = "DEAD_" + String(pcData[tgtIdx][COL.PC.ID]);
    pcData[tgtIdx][COL.PC.HP] = 0;
    pcData[tgtIdx][COL.PC.STATUS] = killedIsMaster
      ? JSON.stringify({ "衣服": "凌亂", "姿勢": "倒地不起", "負面": "重傷不治·身亡", "顏面": "生機已絕" })
      : JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "靈基崩潰·消滅", "顏面": "已無生息" });
    sheets.pc.getRange(tgtIdx + 1, 1, 1, pcData[tgtIdx].length).setValues([pcData[tgtIdx]]);
    // 🕯️ 御主(非護衛斬首場)戰死 → 失去供魔的敵從者與令咒燒盡同一套下場：無「單獨行動」者掛 SEAL_DOOM_HOURS 倒數消滅，
    //   有「單獨行動」者靠靈基殘存苟活(見 enemyCanAffordNp_ 的 INDEPENDENT_ACTION_RESERVE，不設倒數)。
    //   斬首·護衛在場的即死已在上方 assassinGuardIdx 分支處理，此處只補「無護衛」的一般陣亡路徑。
    if (killedIsMaster) {
      var oClk = getClock_(ctx.myGameId);
      if (oClk) {
        var oDeadAbs = oClk.day * 24 + oClk.hour + SEAL_DOOM_HOURS;
        for (var oi = 1; oi < pcData.length; oi++) {
          if (String(pcData[oi][COL.PC.FACTION]) !== "敵從者") continue;
          if (String(pcData[oi][COL.PC.GAME_ID] || "") !== ctx.myGameId) continue;
          if (String(pcData[oi][COL.PC.ID]).startsWith("DEAD_")) continue;
          if (enemyMasterIdx_(pcData, oi, ctx.myGameId) !== -1) continue; // 仍有在世御主(連結別的御主)，不受此死波及
          if (rowHasSolo_(pcData[oi])) continue;                          // 單獨行動：靈基殘存，不設倒數
          if (getDoom_(pcData[oi][COL.PC.MEMORY]) > 0) continue;          // 已有倒數在算(例如先前令咒燒盡)，不覆蓋
          pcData[oi][COL.PC.MEMORY] = stampDoom_(pcData[oi][COL.PC.MEMORY], oDeadAbs);
          pcData[oi][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰蝕", "姿勢": "踉蹌", "負面": `御主已亡·靈基透支(約 ${SEAL_DOOM_HOURS} 時消滅)`, "顏面": "強撐將潰" });
          sheets.pc.getRange(oi + 1, 1, 1, pcData[oi].length).setValues([pcData[oi]]);
        }
      }
    }
    if (isPlayerSv) {
      var svName = String(pcData[tgtIdx][COL.PC.NAME]);
      // 🗝️ 雙從者：僅當「所有」我方從者皆已消滅才算敗北；尚有從者存活＝只是折損一員
      var stillAlive = 0;
      for (var pai = 1; pai < pcData.length; pai++) {
        if (String(pcData[pai][COL.PC.FACTION]) === "從者" && String(pcData[pai][COL.PC.GAME_ID] || "") === ctx.myGameId && !String(pcData[pai][COL.PC.ID]).startsWith("DEAD_")) stillAlive++;
      }
      out.knocked = out.destroyed;
      if (stillAlive <= 0) {
        out.defeat = true;
        var wish = extractWish_(pcData[ctx.pIdx][COL.PC.MEMORY]);
        out.dreamPrompt = buildDreamPrompt_(pcData[ctx.pIdx][COL.PC.NAME], wish, svName);
        var acctD = String(ctx.userData.acctName || "");
        if (acctD) recordHistory_(acctD, "敗", svName, `「${svName}」於「${atkC.name}」之手靈基崩潰，聖杯戰爭落敗。`);
        logWarEvent_(ctx.myGameId, `我方從者「${svName}」於「${atkC.name}」之手靈基崩潰消滅——聖杯戰爭落敗。`, String(ctx.userData.acctName || ""));
      } else {
        logWarEvent_(ctx.myGameId, `我方從者「${svName}」被「${atkC.name}」擊破消滅（尚有從者續戰）。`, String(ctx.userData.acctName || ""));
      }
    } else {
      out.knocked = out.destroyed;
      // 🕯️ 敵從者被擊破 → 在其御主身上記下「如何痛失從者」，供日後遭遇時 AI 演出無牙御主
      if (isFoeSv) { markMasterLostServant_(sheets.pc, pcData, tgtIdx, `被『${atkC.name}』當場擊破、靈基崩潰消滅`); logWarEvent_(ctx.myGameId, `敵從者「${out.destroyed}」被我方『${atkC.name}』擊破、靈基崩潰消滅。`, String(ctx.userData.acctName || "")); }
      if (isFoeSv && aliveEnemyServants_(sheets, ctx.myGameId) <= 0) {
        out.victory = true;
        var acctW = String(ctx.userData.acctName || "");
        if (acctW) { incrementWin_(acctW); recordHistory_(acctW, "勝", atkC.name, `「${atkC.name}」擊破所有敵對從者，奪得聖杯。`); recordWinSpeed_(acctW, ctx.myGameId); }
        logWarEvent_(ctx.myGameId, `🏆『${atkC.name}』擊破所有敵對從者，奪得聖杯——聖杯戰爭勝利！`, String(ctx.userData.acctName || ""));
      }
    }
  } else {
    pcData[tgtIdx][COL.PC.HP] = after;
    sheets.pc.getRange(tgtIdx + 1, 1, 1, pcData[tgtIdx].length).setValues([pcData[tgtIdx]]);
  }
  return out;
}

// 名字比對容錯：忽略各種「間隔點」(·・•‧⋅・全形等)與空白，避免種子名點號不一致(英靈殿混用 U+00B7／U+30FB)
//   導致明明同地有敵卻「此世界查無此目標」。傳入空字串時回空(呼叫端須自行擋空名)。
function nameLoose_(s) { return String(s == null ? "" : s).replace(/[·・•‧∙⋅･·\s]/g, ""); }

// 🔋 御主電池（出力電池制 2026-06）：從者【沒有自有魔力池】，寶具/技能魔力全由御主供——
//   付款順序：①御主 MP(主資源) → ②御主 HP(2 HP 換 1 MP，焚血供能、御主血量不可低於 1)。
//   寫回試算表並回傳明細，供戰報／敘述演出「拿御主當電池」。fromSv 恆 0（保留欄位相容舊戰報）。
var BATTERY_HP_PER_MP = 2; // 御主以血供魔的兌率：每 1 點魔力＝2 點生命
function drainForNp_(sheets, pcData, svIdx, masterIdx, mpCost) {
  mpCost = Math.max(0, Math.round(mpCost));
  var need = mpCost;
  var mMp = masterIdx >= 0 ? (parseInt(pcData[masterIdx][COL.PC.MP]) || 0) : 0;
  var fromMMp = Math.min(mMp, need);
  need -= fromMMp;
  var mHp = masterIdx >= 0 ? (parseInt(pcData[masterIdx][COL.PC.HP]) || 0) : 0;
  var hpAvail = Math.max(0, mHp - 1);                       // 御主血量底線 1，不可被供能榨死
  var hpForMp = Math.min(need, Math.floor(hpAvail / BATTERY_HP_PER_MP));
  var fromMHp = hpForMp * BATTERY_HP_PER_MP;
  need -= hpForMp;                                          // 仍未付清的缺口（油盡燈枯，寶具勉力強放）
  // 寫回御主（有動到才寫）
  if (masterIdx >= 0 && (fromMMp > 0 || fromMHp > 0)) {
    pcData[masterIdx][COL.PC.MP] = Math.max(0, mMp - fromMMp);
    pcData[masterIdx][COL.PC.HP] = Math.max(1, mHp - fromMHp);
    sheets.pc.getRange(masterIdx + 1, 1, 1, pcData[masterIdx].length).setValues([pcData[masterIdx]]);
  }
  return {
    cost: mpCost, fromSv: 0, fromMasterMp: fromMMp, fromMasterHp: fromMHp, shortfall: need,
    usedBattery: (fromMMp > 0 || fromMHp > 0), bledMaster: (fromMHp > 0),
    masterHp: masterIdx >= 0 ? (parseInt(pcData[masterIdx][COL.PC.HP]) || 0) : 0,
    masterHpMax: masterIdx >= 0 ? (parseInt(pcData[masterIdx][COL.PC.MAX_HP]) || 0) : 0,
    masterMp: masterIdx >= 0 ? (parseInt(pcData[masterIdx][COL.PC.MP]) || 0) : 0,
    svMp: 0  // 出力電池制：從者無自有魔力池
  };
}

// 找某敵從者的「敵御主」列索引（硬連結【御主】優先，退回同 game 同地的敵御主）；masterless 則 -1。
function enemyMasterIdx_(pcData, svIdx, gameId) {
  var link = getServantMaster_(pcData[svIdx][COL.PC.MEMORY]);
  var loc = String(pcData[svIdx][COL.PC.LOC]).trim();
  for (var i = 1; i < pcData.length; i++) {
    if (String(pcData[i][COL.PC.FACTION]) !== "敵御主") continue;
    if (String(pcData[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(pcData[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (link ? (String(pcData[i][COL.PC.NAME]) === link) : (String(pcData[i][COL.PC.LOC]).trim() === loc)) return i;
  }
  return -1;
}

// 🔮 單獨行動(Independent Action)：御主已亡/查無連結時，僅此特性的從者能靠靈基殘存硬撐一手——
//   是「殘存的最後一口氣」不是「獨立供魔」，固定小額、不隨階級放大，通常不夠再放一次寶具(見 npPranaCost_)。
var INDEPENDENT_ACTION_RESERVE = 60;
// 🔋 敵方寶具買單：（同陣敵御主）電池是否付得起 prana(從者無自有魔力池，跟玩家從者同制)；
//   無主時僅「單獨行動」者靠殘存靈基硬撐 INDEPENDENT_ACTION_RESERVE，其餘無主即啞火。回 {afford, masterIdx}。
function enemyCanAffordNp_(pcData, svIdx, gameId, prana) {
  var mi = enemyMasterIdx_(pcData, svIdx, gameId);
  var mMp = mi >= 0 ? (parseInt(pcData[mi][COL.PC.MP]) || 0) : 0;
  var mHp = mi >= 0 ? (parseInt(pcData[mi][COL.PC.HP]) || 0) : 0;
  var maxPay = mMp + Math.floor(Math.max(0, mHp - 1) / BATTERY_HP_PER_MP);
  if (mi < 0 && rowHasSolo_(pcData[svIdx])) maxPay += INDEPENDENT_ACTION_RESERVE;
  return { afford: maxPay >= prana, masterIdx: mi };
}

function actionFateBattle(userData, pcId, sheets) {
  const npcName = String(userData.npcName || "").trim();
  if (!npcName) return JSON.stringify({ success: false, message: "未指定攻擊目標。" });
  const npcKey = nameLoose_(npcName);
  const useNp = !!userData.np;
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const myGameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");

  // 🗝️ 雙從者：若指定出戰從者(userData.servant)則用之，否則取第一個在世從者
  const wantSv = String(userData.servant || "").trim();
  let atkIdx = wantSv ? pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.NAME]).includes(wantSv)) : -1;
  if (atkIdx === -1) atkIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (atkIdx === -1) return JSON.stringify({ success: false, message: "你尚未召喚從者，無從者可出戰。" });
  // 🌟 多寶具選定索引 ＋ 🔋 解放寶具自動全開出力：兩者隨 fate_battle 一起送來，省去單獨 set_np_choice／set_servant_output 往返。
  let atkMemDirty = false;
  if (userData.npChoice !== undefined && userData.npChoice !== null) {
    pcData[atkIdx][COL.PC.MEMORY] = setNpChoice_(pcData[atkIdx][COL.PC.MEMORY], userData.npChoice); atkMemDirty = true;
  }
  if (userData.output !== undefined && userData.output !== null) {
    pcData[atkIdx][COL.PC.MEMORY] = setServantOutput_(pcData[atkIdx][COL.PC.MEMORY], snapOutput_(userData.output)); atkMemDirty = true;
  }
  if (atkMemDirty) sheets.pc.getRange(atkIdx + 1, 1, 1, pcData[atkIdx].length).setValues([pcData[atkIdx]]);

  let nIdx = pcData.findIndex(r => nameLoose_(r[COL.PC.NAME]).indexOf(npcKey) !== -1 && r[COL.PC.ID] != pcData[atkIdx][COL.PC.ID] && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "此世界查無此目標。" });
  if (String(pcData[pIdx][COL.PC.LOC]).trim() !== String(pcData[nIdx][COL.PC.LOC]).trim()) {
    return JSON.stringify({ success: false, message: "對方不在你身邊，鞭長莫及。" });
  }

  // 🗡️ 斬首戰術：目標為敵御主時，若其從者尚在同地護衛 → 需「大成功(擲 20)」才能突破斬殺御主，
  //    否則被從者捨命格擋、並反噬 1.5 倍傷害。從者已亡 → 御主手無寸鐵，直接擊殺（走一般流程）。
  let interceptNote = "";
  let isMasterTarget = (String(pcData[nIdx][COL.PC.FACTION]) === "敵御主");
  let assassinGuardIdx = -1;
  if (isMasterTarget) {
    const guardLoc = String(pcData[nIdx][COL.PC.LOC]).trim();
    const masterName = String(pcData[nIdx][COL.PC.NAME]);
    const ownServantName = getMasterServant_(pcData[nIdx][COL.PC.MEMORY]); // 🔗 這名御主【自己的】從者(硬連結)
    // 🛡️ 只有「這名御主本人的從者」能護衛——硬連結優先(按名)。別組(B 御主)的從者不會跑來幫 A 御主擋刀。
    if (ownServantName) {
      assassinGuardIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者"
        && String(r[COL.PC.GAME_ID] || "") === myGameId
        && !String(r[COL.PC.ID]).startsWith("DEAD_")
        && String(r[COL.PC.NAME]) === ownServantName
        && String(r[COL.PC.LOC]).trim() === guardLoc);
    }
    // 退回(舊存檔無【從者】連結)：同地敵從者中，須其【御主】反指這名御主，仍不會抓到別組
    if (assassinGuardIdx === -1) {
      assassinGuardIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者"
        && String(r[COL.PC.GAME_ID] || "") === myGameId
        && !String(r[COL.PC.ID]).startsWith("DEAD_")
        && String(r[COL.PC.LOC]).trim() === guardLoc
        && getServantMaster_(r[COL.PC.MEMORY]) === masterName);
    }
  }

  // ⏳ 戰鬥耗 1 AP（＝推進 1 小時，1 AP＝1 小時）；行動點不足則無法出戰
  const isFateBattle = myGameId.indexOf("g_") === 0;
  if (isFateBattle && getAp_(myGameId) < 1) {
    return JSON.stringify({ success: false, message: "行動點已耗盡，從者也需喘息——請『歇息』恢復後再戰。" });
  }

  // 🤝 盟友不可攻擊：須先撕毀盟約
  if (isAllied_(pcData[nIdx])) {
    return JSON.stringify({ success: false, message: `「${pcData[nIdx][COL.PC.NAME]}」是你的盟友——若要動手，須先『撕毀盟約』。` });
  }

  const atkC = rowToCombatant_(pcData[atkIdx]);
  injectMysticBuff_(atkC, pcData[pIdx][COL.PC.MEMORY]);  // ✨ 御主禮裝被動加持我方從者（含開場對轟攻防）
  const defC = rowToCombatant_(pcData[nIdx]);

  // 🔋 寶具魔力（出力電池制）：寶具全由御主供魔。① 寶具僅能在「出力 100%（全開·認真）」解放——御主把魔力全灌進去才釋放得了真名。
  //   ② 御主魔力(MP)＋焚血(HP)都湊不出 prana → 油盡燈枯，擋下。
  if (useNp) {
    const atkOutput = servantOutput_(pcData[atkIdx][COL.PC.MEMORY]);
    if (atkOutput < 100) {
      return JSON.stringify({ success: false, message: `寶具乃靈基全力之解放——須先將「${atkC.name}」的出力推到 100%（全開），御主灌注全部魔力，方能釋放真名。當前出力 ${atkOutput}%。` });
    }
    const npCostPre = npPranaCost_(atkC.six["寶具"]);
    const mMpPre = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
    const mHpPre = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
    const maxPay = mMpPre + Math.floor(Math.max(0, mHpPre - 1) / BATTERY_HP_PER_MP);
    if (maxPay < npCostPre) {
      return JSON.stringify({ success: false, message: `御主魔力已油盡燈枯——以血魔竭力相湊仍不足以供「${atkC.name}」解放寶具(需 ${npCostPre})，須先休整／補魔。` });
    }
  }

  // ❖ 令咒·絕對命令（必中＋威力倍增）：消耗一道玩家令咒
  const useSeal = !!userData.seal;
  if (useSeal && getPlayerSeals_(pcData[pIdx][COL.PC.MEMORY]) <= 0) {
    return JSON.stringify({ success: false, message: "你的令咒已用盡，無法施加絕對命令。" });
  }

  // 戰鬥確定開打 → 耗 1 AP（推進 2 小時）
  let battleAp = AP_PER_DAY;
  if (isFateBattle) { try { battleAp = spendAp_(myGameId, 1).ap; } catch (e) { } }

  // ⚔️ 交手即削好感：拔劍相向直接 −5（不勞 AI 判定）。只削既有交情列、不憑空建列(萍水相逢者本就 0)。
  //   ★同時是「刷好感躲追殺」的天然制衡：要奪杯就得打、打了好感掉破 50→追擊閘重新開啟。
  try { raiseBond_(sheets, String(pcData[pIdx][COL.PC.NAME]), String(pcData[nIdx][COL.PC.NAME]), -5); } catch (e) { }

  // 🗡️ 斬首裁決：敵御主仍有從者在側護衛時，唯有「大成功（擲 20）」能突破護衛、一擊斬殺御主；
  //    否則護衛捨身格擋、並反手予我方從者 1.5 倍痛擊（可能致敗）。寶具／令咒對奇襲斬首不適用。
  if (isMasterTarget && assassinGuardIdx !== -1) {
    const masterName = String(pcData[nIdx][COL.PC.NAME]);
    const guardName = String(pcData[assassinGuardIdx][COL.PC.NAME]);
    // 🗝️ 雙從者：每名在世從者各擲一次 D20（出戰中排第一）——更多嘗試＝更高斬首機率，但失手者各遭護衛反噬
    const asnParty = [];
    for (let pi = 1; pi < pcData.length; pi++) {
      if (String(pcData[pi][COL.PC.FACTION]) === "從者" && String(pcData[pi][COL.PC.GAME_ID] || "") === myGameId && !String(pcData[pi][COL.PC.ID]).startsWith("DEAD_")) {
        if (pi === atkIdx) asnParty.unshift(pi); else asnParty.push(pi);
      }
    }
    const rolls = asnParty.map(idx => ({ idx: idx, name: String(pcData[idx][COL.PC.NAME]), roll: Math.floor(Math.random() * 20) + 1 }));
    const crit = rolls.find(r => r.roll === 20) || null;
    const dualAsn = asnParty.length > 1;
    let asnReport, asnPrompt, asnVictory = false, asnDefeat = false, asnDream = "", asnKnocked = [];

    if (crit) {
      // 大成功：斬殺御主；御主既亡，護衛從者失去魔力供給隨之消滅
      pcData[nIdx][COL.PC.ID] = "DEAD_" + String(pcData[nIdx][COL.PC.ID]);
      pcData[nIdx][COL.PC.HP] = 0;
      pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "凌亂", "姿勢": "倒地不起", "負面": "重傷不治·身亡", "顏面": "生機已絕" });
      sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);
      pcData[assassinGuardIdx][COL.PC.ID] = "DEAD_" + String(pcData[assassinGuardIdx][COL.PC.ID]);
      pcData[assassinGuardIdx][COL.PC.HP] = 0;
      pcData[assassinGuardIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "化作光點", "負面": "御主既亡·魔力斷絕消滅", "顏面": "黯然消散" });
      sheets.pc.getRange(assassinGuardIdx + 1, 1, 1, pcData[assassinGuardIdx].length).setValues([pcData[assassinGuardIdx]]);
      asnKnocked = [masterName, guardName];
      logWarEvent_(myGameId, `我方『${crit.name}』奇襲斬首敵御主「${masterName}」，御主既亡、護衛從者「${guardName}」失去魔力供給隨之消散。`, String(userData.acctName || ""));
      if (aliveEnemyServants_(sheets, myGameId) <= 0) {
        asnVictory = true;
        const acctW = String(userData.acctName || "");
        if (acctW) { incrementWin_(acctW); recordHistory_(acctW, "勝", crit.name, `「${crit.name}」奇襲斬首敵御主「${masterName}」，奪得聖杯。`); recordWinSpeed_(acctW, myGameId); }
        logWarEvent_(myGameId, `🏆 已無敵對從者存世——聖杯到手，聖杯戰爭勝利！`, String(userData.acctName || ""));
      }
      asnReport = {
        assassination: true, success: true, aRoll: 20, rolls: rolls.map(r => ({ name: r.name, roll: r.roll })), dual: dualAsn,
        atk: crit.name, master: masterName, guard: guardName,
        note: `${crit.name} 擲出 20 — 大成功！撕開「${guardName}」的守備、一擊取御主「${masterName}」性命。御主既亡，「${guardName}」隨之消散。`,
        selfDmg: 0, victory: asnVictory, defeat: false,
        atkHp: parseInt(pcData[atkIdx][COL.PC.HP]) || 0, atkHpMax: parseInt(pcData[atkIdx][COL.PC.MAX_HP]) || 0
      };
      asnPrompt = `【系統·斬首戰報·已裁定】御主號令${dualAsn ? '兩名從者齊撲' : `從者『${crit.name}』`}奇襲敵御主「${masterName}」。命運的骰子由『${crit.name}』擲出 20 — 大成功！撕開護衛從者「${guardName}」的防線、取下御主性命。御主既亡（凡人之軀·斃命，非靈基消滅）、魔力供給斷絕，從者「${guardName}」失去供魔當場化作光點消散。${asnVictory ? '此為最後的敵對陣營——聖杯已然在握！' : ''}\n` +
        `★以 Fate／TYPE-MOON 筆觸描寫這萬中選一、石破天驚的斬首瞬間（一段即可）。【致命的手段由你依『${crit.name}』的職階與真名自行演出——法師為魔術一擊、近戰為兵刃、弓兵為遠程，勿假設特定方式】${dualAsn ? '，兩名從者夾擊、其中一人覷得破綻收尾' : ''}。勝負已由系統結算。\n` +
        ``;
    } else {
      // 全部失手：護衛捨身格擋，反手 1.5 倍痛擊「每一名」參與斬首的從者
      const guardC = rowToCombatant_(pcData[assassinGuardIdx]);
      const hits = [];
      rolls.forEach(r => {
        const sC = rowToCombatant_(pcData[r.idx]);
        const probe = resolveFateBattle_(guardC, sC, {});
        // 反噬取「護衛端」傷害：護衛擲贏→其全力反噬(probe.damage 即護衛傷)；護衛擲輸(奇襲突破)→反噬大減，
        //   底傷依護衛筋力而非玩家自己的攻擊力(原 bug：玩家擲贏時 probe.damage 是玩家傷害，反噬越強自噬越重)。
        const guardBase = probe.atkWins ? (probe.damage || 1) : Math.round(rankVal(guardC.six['筋力'] || 'C') * 1.5 + 8);
        const selfDmg = Math.max(1, Math.round(guardBase * 1.5));
        const ahp = parseInt(pcData[r.idx][COL.PC.HP]) || 0;
        let after = ahp - selfDmg;
        if (after <= 5 && hasFx_(sC, 'survive') && ahp > 1) after = 1; // 戰鬥續行
        let knocked = false;
        if (after <= 0) {
          knocked = true;
          pcData[r.idx][COL.PC.ID] = "DEAD_" + String(pcData[r.idx][COL.PC.ID]);
          pcData[r.idx][COL.PC.HP] = 0;
          pcData[r.idx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "斬首反噬·靈基崩潰", "顏面": "已無生息" });
        } else {
          pcData[r.idx][COL.PC.HP] = after;
        }
        sheets.pc.getRange(r.idx + 1, 1, 1, pcData[r.idx].length).setValues([pcData[r.idx]]);
        hits.push({ name: r.name, roll: r.roll, dmg: selfDmg, knocked: knocked, hp: parseInt(pcData[r.idx][COL.PC.HP]) || 0, hpMax: parseInt(pcData[r.idx][COL.PC.MAX_HP]) || 0 });
      });
      // 敗北：所有我方從者皆亡
      let aliveLeft = 0;
      for (let pi = 1; pi < pcData.length; pi++) { if (String(pcData[pi][COL.PC.FACTION]) === "從者" && String(pcData[pi][COL.PC.GAME_ID] || "") === myGameId && !String(pcData[pi][COL.PC.ID]).startsWith("DEAD_")) aliveLeft++; }
      if (aliveLeft <= 0) {
        asnDefeat = true;
        const wish = extractWish_(pcData[pIdx][COL.PC.MEMORY]);
        asnDream = buildDreamPrompt_(pcData[pIdx][COL.PC.NAME], wish, hits[0].name);
        const acctD = String(userData.acctName || "");
        if (acctD) recordHistory_(acctD, "敗", hits[0].name, `斬首失手，遭護衛「${guardName}」反噬全滅，聖杯戰爭落敗。`);
      }
      const rollsTxt = hits.map(h => `${h.name}擲${h.roll}→受創 −${h.dmg}${h.knocked ? '·崩潰' : ''}`).join('；');
      asnReport = {
        assassination: true, success: false, dual: dualAsn, rolls: rolls.map(r => r.roll), hits: hits,
        aRoll: rolls[0].roll, atk: atkC.name, master: masterName, guard: guardName,
        note: `唯擲 20 方能突破。${rollsTxt}。`,
        selfDmg: hits.reduce((a, h) => a + h.dmg, 0), victory: false, defeat: asnDefeat,
        atkHp: parseInt(pcData[atkIdx][COL.PC.HP]) || 0, atkHpMax: parseInt(pcData[atkIdx][COL.PC.MAX_HP]) || 0
      };
      const whoTxt = dualAsn ? '兩名從者' : `從者『${atkC.name}』`;
      if (asnDefeat) {
        asnPrompt = `【系統·斬首戰報·已裁定】御主號令${whoTxt}奇襲敵御主「${masterName}」，無人擲出 20。護衛從者「${guardName}」捨身擋下、反手以 1.5 倍之力逐一痛擊（${rollsTxt}），我方從者悉數靈基崩潰、化作光點消散，御主敗北。\n` +
          `★以 Fate／TYPE-MOON 筆觸沉痛描寫斬首落空、護衛反殺、從者消滅的瞬間（一段即可），語氣留白。勝負已由系統結算。\n` +
          ``;
      } else {
        asnPrompt = `【系統·斬首戰報·已裁定】御主號令${whoTxt}欲奇襲敵御主「${masterName}」，無人擲出 20（大成功）。護衛從者「${guardName}」如影攔在御主身前、硬生生擋下，並反手以 1.5 倍之力逐一痛擊（${rollsTxt}）。御主未能得手。\n` +
          `★以 Fate／TYPE-MOON 筆觸描寫護衛捨身格擋、反噬重擊${dualAsn ? '、兩名從者同遭反震' : ''}的險惡瞬間（一段即可）。傷害已由系統結算。\n` +
          `★未崩潰之從者最多重傷，【絕對禁止】描寫其死亡。\n` +
          ``;
      }
    }

    return JSON.stringify({
      success: true, aiPrompt: asnPrompt, knockedOut: asnKnocked,
      victory: asnVictory, defeat: asnDefeat, dreamPrompt: asnDream,
      sealEscaped: false, report: asnReport,
      clock: isFateBattle ? clockLabel_(myGameId) : "", ap: battleAp, apMax: AP_PER_DAY,
      statusString: getFreshStatusString(pcId, pIdx, sheets)
    });
  }

  // ⚔️ 一次出戰＝最多 ROUNDS 個來回（我攻→敵反擊），命中才扣血、未中＝撲空；任一方倒下即止。
  //   寶具/令咒只在開場第一擊生效；其後為普通互砍。敵御主空手不反擊。
  const ROUNDS = 3;
  if (useSeal) {
    const left = getPlayerSeals_(pcData[pIdx][COL.PC.MEMORY]) - 1;
    pcData[pIdx][COL.PC.MEMORY] = setPlayerSeals_(pcData[pIdx][COL.PC.MEMORY], left);
    sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
    logWarEvent_(String(pcData[pIdx][COL.PC.GAME_ID] || ""), `御主燃一道令咒·絕對命令，強令『${atkC.name}』對「${defC.name}」發動必中的全力一擊（我餘令咒 ${left}）。`, String(userData.acctName || ""));
  }
  // 🔋 寶具魔力 = 依寶具階級的 Prana Cost（E50 D100 C200 B350 A500 EX800）。從者付不起 → 御主電池接力供能。
  let battery = null;
  if (useNp) {
    const prana = npPranaCost_(atkC.six["寶具"]);
    battery = drainForNp_(sheets, pcData, atkIdx, pIdx, prana);
    atkC.mp = parseInt(pcData[atkIdx][COL.PC.MP]) || 0; // 反映耗魔後的出力
    if (battery.usedBattery) {
      logWarEvent_(myGameId, `『${atkC.name}』解放寶具魔力不足，御主以${battery.bledMaster ? '自身血肉與' : ''}魔力為電池供能（御主餘 ${battery.masterHp}/${battery.masterHpMax} HP）。`, String(userData.acctName || ""));
    }
  }

  // ⚡ 從者主動技（2026-07 開關制）：改由從者 MEMORY【主動技】開關決定，不再是每次攻擊的按鈕——
  //   開＝每場戰鬥自動【全效】發動＋【扣魔一次】(非每回合)；關(預設)＝【微量】被動、免費。開/關二選一、永不並存。
  let skillBuff = null, skillBattery = null, skillActivated = false;
  const _fullSkill = servantActiveSkill_(atkC);  // 完整效果表(或 null＝無真·施放技術)
  if (_fullSkill) {
    if (activeSkillOn_(pcData[atkIdx][COL.PC.MEMORY])) {
      skillBuff = _fullSkill; skillActivated = true;
      const skCost = Math.round(200 * skillBuff.mpPct);   // 🔋 整場扣一次(此區塊只跑一次·非回合迴圈內)，付不起走御主電池
      skillBattery = drainForNp_(sheets, pcData, atkIdx, pIdx, skCost);
      atkC.mp = parseInt(pcData[atkIdx][COL.PC.MP]) || 0;
      if (skillBattery.usedBattery) {
        logWarEvent_(myGameId, `『${atkC.name}』全力催動「${skillBuff.name}」，御主${skillBattery.bledMaster ? '焚血' : '導魔'}供能（御主餘 ${skillBattery.masterHp}/${skillBattery.masterHpMax} HP）。`, String(userData.acctName || ""));
      }
    } else {
      skillBuff = tinyActiveSkill_(_fullSkill);   // 關閉→微量被動、免費(無 drain)
    }
  }

  let knockedOut = [], victory = false, defeat = false, dreamPrompt = "", destroyedName = "", sealEscaped = false, sealNote = "", godRevived = false, godNote = "";
  let enemyNpSpent = false; // 敵寶具一場限一次
  let npTeleHandled = false; // 🔮 本次按鍵的「預告/發動」決策一次即止(rounds loop 多回合勿重複蓄勢)
  const rounds = [];
  const ctx = { myGameId: myGameId, pIdx: pIdx, userData: userData };
  const targetIsFoeServant = String(pcData[nIdx][COL.PC.FACTION]) === "敵從者";

  // 🌟 寶具對轟（光與光的對撞）：玩家開場解放寶具、目標為敵從者時，值得一戰的對手以寶具相迎。
  //   雙方先算「寶具火力」→ 高者壓過低者，差額貫穿敗方、勝方僅受少量回震；火力相當(±10%)則相抵僵持。
  //   ★ 對轟輸方不致死：差值再大也只打到 1 HP——英雄倒下前總能拼出最後一口氣。
  let openingNp = useNp, openingSeal = useSeal; // 對轟已用掉開場 NP/令咒威能則清掉，避免回合迴圈重放
  let clash = null;
  if (useNp && targetIsFoeServant && !String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_")) {
    const enemyC0 = rowToCombatant_(pcData[nIdx]);
    const enemyHasNp = !!String(pcData[nIdx][COL.PC.MARTIAL] || "").trim() && rankVal(enemyC0.six["寶具"] || "-") >= 10;
    // 只有「攻擊型寶具」才對轟；防禦/生存/召喚型(God Hand、summon_horror…)不去抵銷玩家寶具。
    const CLASH_OFF_FX = ['ea', 'excalibur', 'ubw', 'gob', 'gae_bolg', 'tsubame', 'zabaniya', 'petrify', 'chain', 'anti_magic_lance', 'wind_strike', 'projection'];
    const eScaleClash = npAtkScale_(enemyC0);
    const enemyOffensiveNp = enemyHasNp && (eScaleClash === '對軍' || eScaleClash === '對城' || eScaleClash === '對界' || CLASH_OFF_FX.some(function (f) { return hasFx_(enemyC0, f); }));
    const eHpR = (parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1) > 0 ? (parseInt(pcData[nIdx][COL.PC.HP]) || 0) / (parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1) : 1;
    const clashUrge = 0.6 + (hasFx_(enemyC0, 'mad') || hasFx_(enemyC0, 'zabaniya') ? 0.25 : 0) - (1 - eHpR) * 0.3;
    const clashPrana = npPranaCost_(enemyC0.six["寶具"]);
    const clashAfford = enemyOffensiveNp ? enemyCanAffordNp_(pcData, nIdx, myGameId, clashPrana) : { afford: false, masterIdx: -1 };
    if (enemyOffensiveNp && clashAfford.afford && Math.random() < clashUrge) {
      drainForNp_(sheets, pcData, nIdx, clashAfford.masterIdx, clashPrana);
      enemyC0.mp = parseInt(pcData[nIdx][COL.PC.MP]) || 0;
      enemyNpSpent = true;
      openingNp = false; openingSeal = false;
      enemyC0.output = 100;
      const pPow = resolveFateBattle_(atkC, enemyC0, { np: true, seal: useSeal, skill: skillBuff }).damage;
      const ePow = resolveFateBattle_(enemyC0, atkC, { np: true }).damage;
      // ⚡ 因果律武器（Gáe Bolg 等）：死亡在投擲前已確定──優先結算，壓過對手寶具威能
      //   致死：敵方 NP 被截斷，只剩極少殘波打回來；未致死：火力 ×1.35、比完大小再走正常流程。
      const playerCausality = hasCausalityNp_(atkC);
      const effectivePPow = playerCausality ? Math.round(pPow * 1.35) : pPow;
      const eHpNow = parseInt(pcData[nIdx][COL.PC.HP]) || 0;
      const band = Math.round((effectivePPow + ePow) * 0.10);
      let outcome, pDmgTaken = 0, eDmgTaken = 0;
      if (playerCausality && effectivePPow >= eHpNow) {
        // ★ 因果律截斷：敵方在因果時間線上已死，其 NP 主力消散，只剩殘波 8%
        outcome = 'causality';
        eDmgTaken = effectivePPow;
        pDmgTaken = Math.round(ePow * 0.08);
      } else if (Math.abs(effectivePPow - ePow) <= band) {
        outcome = 'stalemate';
        eDmgTaken = Math.round(band * 0.5); pDmgTaken = Math.round(band * 0.5);
      } else if (effectivePPow > ePow) {
        outcome = 'player';
        eDmgTaken = effectivePPow - ePow; pDmgTaken = Math.round((effectivePPow - ePow) * 0.15);
      } else {
        outcome = 'enemy';
        var _rawPDmg = ePow - effectivePPow;
        // ★ 對轟輸方不致死：差值再大也只扣到 1 HP 為止
        pDmgTaken = Math.min(_rawPDmg, Math.max(0, (parseInt(pcData[atkIdx][COL.PC.HP]) || 1) - 1));
        eDmgTaken = Math.round(_rawPDmg * 0.15);
      }
      const eHit = fateStrike_(sheets, pcData, atkC, nIdx, { forceDamage: eDmgTaken }, ctx);
      if (eHit.destroyed) destroyedName = eHit.destroyed;
      if (eHit.knocked) knockedOut.push(eHit.knocked);
      if (eHit.sealEscaped) { sealEscaped = true; sealNote = eHit.sealNote; }
      if (eHit.godRevived) { godRevived = true; godNote = eHit.godNote; }
      if (eHit.victory) victory = true;
      if (!sealEscaped) {
        const spill = (destroyedName ? Math.round(pDmgTaken * 0.5) : pDmgTaken);
        const pHit = fateStrike_(sheets, pcData, enemyC0, atkIdx, { forceDamage: spill }, ctx);
        if (pHit.destroyed && pHit.knocked) knockedOut.push(pHit.knocked);
        if (pHit.defeat) { defeat = true; victory = false; dreamPrompt = pHit.dreamPrompt; }
      }
      clash = {
        outcome: outcome, pPow: pPow, ePow: ePow, pDmgTaken: pDmgTaken, eDmgTaken: eDmgTaken,
        enemyNp: String(pcData[nIdx][COL.PC.MARTIAL] || ""),
        atkHp: parseInt(pcData[atkIdx][COL.PC.HP]) || 0, atkHpMax: parseInt(pcData[atkIdx][COL.PC.MAX_HP]) || 0,
        defHp: parseInt(pcData[nIdx][COL.PC.HP]) || 0, defHpMax: parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 0
      };
      logWarEvent_(myGameId, `寶具對轟！『${atkC.name}』與「${defC.name}」真名解放正面對撞——${outcome === 'causality' ? '因果律先行截斷——在敵方寶具離弦之前，死亡已先降臨' : outcome === 'player' ? '我方威能壓過對手' : outcome === 'enemy' ? '敵寶具威能壓過我方（但從者拼死撐住）' : '勢均力敵、兩相抵銷'}。`, String(userData.acctName || ""));
    }
  }

  // 🗝️ 雙從者齊攻：收齊所有在世我方從者（出戰中 atkIdx 排第一；寶具/令咒只加在他身上）。每回合每名各出一擊。
  const partyIdxs = [];
  for (let pi = 1; pi < pcData.length; pi++) {
    if (String(pcData[pi][COL.PC.FACTION]) === "從者" && String(pcData[pi][COL.PC.GAME_ID] || "") === myGameId && !String(pcData[pi][COL.PC.ID]).startsWith("DEAD_")) {
      if (pi === atkIdx) partyIdxs.unshift(pi); else partyIdxs.push(pi);
    }
  }
  const dualAttack = partyIdxs.length > 1;

  // 🤝 協同強襲（同盟背景生效）：同地盟友從者（敵從者＋盟約在身）對「共同敵人」每回合助攻一擊。
  //   原作依據：第五次冬木·遠坂凜＆Archer 為士郎掩護夾擊、聯手圍攻 Caster／Berserker。盟友提供掩護火力，
  //   只助攻、不被本場反擊（風險已由盟友自身承擔），讓「養同盟」在戰場上真正有感。
  let allyAtkIdx = -1, allyAssistName = "";
  if (targetIsFoeServant) {
    const allyLoc = String(pcData[pIdx][COL.PC.LOC]).trim();
    allyAtkIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && isAllied_(r) && String(r[COL.PC.LOC]).trim() === allyLoc && r[COL.PC.ID] != pcData[nIdx][COL.PC.ID]);
    if (allyAtkIdx !== -1) allyAssistName = String(pcData[allyAtkIdx][COL.PC.NAME]);
  }


  // 🐙 螺湮城教本：玩家青鬍子解放寶具 → 自深淵召出「深淵海怪」常駐戰場，每回合與本人並肩撕咬，
  //   靠御主魔力維持(每回合扣 HORROR_UPKEEP)；御主魔力撐不住 → 海怪潰散退場。巨獸物理攻擊、不受對魔力。
  let horrorActive = (useNp && hasFx_(atkC, 'summon_horror'));
  const HORROR_UPKEEP = 30;
  // 深淵海怪的「肉身血池」＝海怪護盾(下方 setHorrorShield_)；此 horrorC 的 hp 僅追擊判定用、肉身存亡看護盾。
  const horrorC = horrorActive ? {
    name: '深淵海怪', cls: 'Berserker', np: '',
    six: { 筋力: 'A', 耐久: 'A', 敏捷: 'C', 魔力: 'E', 幸運: 'E', 寶具: '-' },
    skills: [], traits: [{ n: '巨獸' }], output: 100,
    hp: HORROR_SHIELD_HP, hpMax: HORROR_SHIELD_HP, mp: 0, mpMax: 0
  } : null;
  // 🐙 召喚海怪：寶具解放當下，海怪自深淵現身、以肉身(HORROR_SHIELD_HP)在前掩護術師（逾 HORROR_SHIELD_HOURS 遊戲時退場）。
  if (horrorActive) {
    var _hshClk = getClock_(myGameId);
    if (_hshClk) {
      var _hshExp = _hshClk.day * 24 + _hshClk.hour + HORROR_SHIELD_HOURS;
      pcData[atkIdx][COL.PC.MEMORY] = setHorrorShield_(pcData[atkIdx][COL.PC.MEMORY], HORROR_SHIELD_HP, HORROR_SHIELD_HP, _hshExp);
      sheets.pc.getRange(atkIdx + 1, 1, 1, pcData[atkIdx].length).setValues([pcData[atkIdx]]);
    }
  }

  for (let rd = 0; rd < ROUNDS; rd++) {
    if (sealEscaped || destroyedName || defeat || victory) break;
    if (String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_")) break;
    const livingParty = partyIdxs.filter(i => !String(pcData[i][COL.PC.ID]).startsWith("DEAD_"));
    if (!livingParty.length) break;
    const opening = (rd === 0);
    const rl = { n: rd + 1, strikes: [], eHit: false, eDmg: 0, eRoll: 0, eHitVal: 0, eFired: [], eTarget: "" };

    // ── 我方出擊（每名在世從者各出一擊）──
    for (let k = 0; k < livingParty.length; k++) {
      const sidx = livingParty[k];
      if (String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_")) break;
      const sC = rowToCombatant_(pcData[sidx]);
      injectMysticBuff_(sC, pcData[pIdx][COL.PC.MEMORY]);  // ✨ 御主禮裝被動加持我方從者（每回合出擊）
      const isActive = (sidx === atkIdx);
      const ps = fateStrike_(sheets, pcData, sC, nIdx, { np: opening && openingNp && isActive, seal: opening && openingSeal && isActive, ambush: opening && isActive, skill: isActive ? skillBuff : null }, ctx);
      // 目標為敵御主(非從者)：引擎計算了反傷 fired 但不套用，過濾掉「winner·武器骰」等傷害計算噪音
      const _pFiredClean = isMasterTarget
        ? (ps.fired || []).filter(function (t) { return !/·武器骰|·出力\d/.test(String(t)); })
        : (ps.fired || []);
      rl.strikes.push({ by: sC.name, pRoll: ps.aRoll, pHitVal: ps.aHit, dRoll: ps.dRoll, dEvaVal: ps.dEva, pHit: ps.hit, pDmg: ps.hit ? ps.damage : 0, pCrit: ps.crit, pFired: _pFiredClean, note: ps.sealNote || ps.godNote || "" });
      if (ps.destroyed) destroyedName = ps.destroyed;
      if (ps.knocked) knockedOut.push(ps.knocked);
      if (ps.sealEscaped) { sealEscaped = true; sealNote = ps.sealNote; }
      if (ps.godRevived) { godRevived = true; godNote = ps.godNote; }
      if (ps.victory) victory = true;
      if (destroyedName || sealEscaped) break;
    }

    // 🩹 每回合涓流回血（約 2.5%×階/回合·上限30）：兩種來源——①原初符文運用為 regen(玩家選模式)
    //   ②持有專屬治癒 fx `regen`(回復魔藥/狐之治癒等·常駐、無需選模式)。標籤顯示技能自己的名字。
    for (let rk = 0; rk < livingParty.length; rk++) {
      const ridx = livingParty[rk];
      if (String(pcData[ridx][COL.PC.ID]).startsWith("DEAD_")) continue;
      const rc = rowToCombatant_(pcData[ridx]);
      const rrn = hasFx_(rc, 'rune');
      const runeRegen = rrn && rc.runeMode === 'regen';
      const healFx = hasFx_(rc, 'regen');              // 專屬治癒 fx
      const healRank = runeRegen ? rrn : healFx;       // 符文 regen 優先(同時有也不疊)
      if (healRank) {
        const hpMaxR = parseInt(pcData[ridx][COL.PC.MAX_HP]) || 0;
        const healR = Math.min(Math.round(hpMaxR * 0.025 * rankMul_(healRank)), 30);
        const curR = parseInt(pcData[ridx][COL.PC.HP]) || 0;
        if (healR > 0 && curR > 0 && curR < hpMaxR) {
          pcData[ridx][COL.PC.HP] = Math.min(hpMaxR, curR + healR);
          sheets.pc.getRange(ridx + 1, 1, 1, pcData[ridx].length).setValues([pcData[ridx]]);
          const healLbl = runeRegen ? '原初符文·治癒' : fxName_(rc, 'regen', '治癒');
          rl.strikes.push({ by: rc.name, rune: true, pHit: false, pDmg: 0, pCrit: '', pFired: [], note: healLbl + '（+' + Math.min(healR, hpMaxR - curR) + '）' });
        }
      }
    }

    // 🐙 深淵海怪·肉身養護：護盾＝海怪肉身，每回合自深淵汲魔再生 +HORROR_REGEN（不過上限）；
    //   肉身已潰散(護盾歸零/逾時) → 海怪退場、本回合起不再追擊。
    if (hasFx_(atkC, 'summon_horror')) {
      var _hgClk = getClock_(ctx.myGameId);
      var _hgAbs = _hgClk ? _hgClk.day * 24 + _hgClk.hour : null;
      var _hgSh = getHorrorShield_(pcData[atkIdx][COL.PC.MEMORY], _hgAbs);
      if (_hgSh.active && _hgSh.remaining > 0) {
        if (_hgSh.remaining < _hgSh.max) {
          var _hgNew = Math.min(_hgSh.max, _hgSh.remaining + HORROR_REGEN);
          pcData[atkIdx][COL.PC.MEMORY] = setHorrorShield_(pcData[atkIdx][COL.PC.MEMORY], _hgNew, _hgSh.max, _hgSh.expiry);
          sheets.pc.getRange(atkIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[atkIdx][COL.PC.MEMORY]);
          rl.strikes.push({ by: '🐙深淵海怪', horror: true, pHit: false, pDmg: 0, pCrit: '', pFired: [], note: '深淵海怪·肉身再生（+' + (_hgNew - _hgSh.remaining) + '·餘 ' + _hgNew + '/' + _hgSh.max + '）' });
        }
      } else {
        horrorActive = false; // 海怪肉身潰散 → 退場
      }
    }

    // 🐙 深淵海怪追擊：青鬍子寶具召喚物，常駐每回合撕咬敵手——先扣御主魔力維持，撐不住則潰散退場。
    if (horrorActive && targetIsFoeServant && !String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_") && !destroyedName && !sealEscaped && !victory) {
      const hUp = drainForNp_(sheets, pcData, atkIdx, pIdx, HORROR_UPKEEP);
      if (hUp.shortfall > 0) {
        horrorActive = false;
        rl.strikes.push({ by: '🐙深淵海怪', horror: true, pHit: false, pDmg: 0, pCrit: '', pFired: [], note: '御主魔力枯竭·海怪潰散退場' });
      } else {
        const hs = fateStrike_(sheets, pcData, horrorC, nIdx, {}, ctx);
        rl.strikes.push({ by: '🐙深淵海怪', horror: true, pRoll: hs.aRoll, pHitVal: hs.aHit, dRoll: hs.dRoll, dEvaVal: hs.dEva, pHit: hs.hit, pDmg: hs.hit ? hs.damage : 0, pCrit: hs.crit, pFired: hs.fired, note: '深淵海怪·觸手撕咬' });
        if (hs.destroyed) destroyedName = hs.destroyed;
        if (hs.knocked) knockedOut.push(hs.knocked);
        if (hs.godRevived) { godRevived = true; godNote = hs.godNote; }
        if (hs.victory) victory = true;
        if (hs.sealEscaped) { sealEscaped = true; sealNote = hs.sealNote; }
      }
    }

    // 🤝 盟友協同助攻一擊（共同敵人尚存活、本回合未分勝負才出手）
    if (allyAtkIdx !== -1 && !String(pcData[allyAtkIdx][COL.PC.ID]).startsWith("DEAD_")
        && !String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_") && !destroyedName && !sealEscaped && !victory) {
      const allyC = rowToCombatant_(pcData[allyAtkIdx]);
      const aps = fateStrike_(sheets, pcData, allyC, nIdx, {}, ctx);
      rl.strikes.push({ by: allyC.name, ally: true, pRoll: aps.aRoll, pHitVal: aps.aHit, dRoll: aps.dRoll, dEvaVal: aps.dEva, pHit: aps.hit, pDmg: aps.hit ? aps.damage : 0, pCrit: aps.crit, pFired: aps.fired, note: "盟友協同" });
      if (aps.destroyed) destroyedName = aps.destroyed;
      if (aps.knocked) knockedOut.push(aps.knocked);
      if (aps.victory) victory = true;
    }

    if (sealEscaped || destroyedName || victory) { rounds.push(rl); break; }

    // ── 敵反擊 ──（敵從者尚存活才回擊；打出戰中從者，若已亡則改打另一在世從者；空手敵御主不反擊）
    if (targetIsFoeServant && !String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_")) {
      let ctgt = atkIdx;
      if (String(pcData[ctgt][COL.PC.ID]).startsWith("DEAD_")) {
        const alt = partyIdxs.find(i => !String(pcData[i][COL.PC.ID]).startsWith("DEAD_"));
        if (alt != null) ctgt = alt;
      }
      if (!String(pcData[ctgt][COL.PC.ID]).startsWith("DEAD_")) {
        const enemyNow = rowToCombatant_(pcData[nIdx]);
        enemyNow.npChoice = bestNpChoice_(enemyNow.name, enemyNow.cls); // 🌟 敵解放/預告用最強攻擊寶具(如吉爾掏乖離劍·非預設王財)
        // 🔥 敵人也會解放寶具！殘血越急越想拼、暗殺/狂戰系更愛搏命；開寶具則全力(不打折)
        const eHpRatio = (parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1) > 0 ? (parseInt(pcData[nIdx][COL.PC.HP]) || 0) / (parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1) : 1;
        const eNpUrge = (hasFx_(enemyNow, 'zabaniya') || hasFx_(enemyNow, 'mad')) ? 0.22 : 0.10;
        // ⚔️ 只有「攻擊型寶具」才反擊解放(與對轟同準)：純防禦/對人寶具(如 Rule Breaker 對人C·無攻擊 fx)不該吃解放加成
        const ECF = ['ea', 'excalibur', 'ubw', 'summon_horror', 'gob', 'gae_bolg', 'tsubame', 'zabaniya', 'petrify', 'chain', 'anti_magic_lance', 'wind_strike', 'projection'];
        const eOffensiveNp = !!String(pcData[nIdx][COL.PC.MARTIAL] || "").trim() && rankVal(enemyNow.six["寶具"] || "-") >= 10
          && (['對軍', '對城', '對界'].indexOf(npAtkScale_(enemyNow)) >= 0 || ECF.some(function (f) { return hasFx_(enemyNow, f); }));
        // 🛡️ 寶具是孤注一擲的殺招、不是見面的招呼：敵方唯有【自己被打殘】或【對方已殘可收尾】才解放真名——
        //    免得玩家一接觸就被無預警的寶具秒殺(「見面開寶具」的惡感)。健康對健康＝先以普攻試探。
        const pHpRatio = (parseInt(pcData[ctgt][COL.PC.MAX_HP]) || 1) > 0 ? (parseInt(pcData[ctgt][COL.PC.HP]) || 0) / (parseInt(pcData[ctgt][COL.PC.MAX_HP]) || 1) : 1;
        const eDesperate = eHpRatio < 0.5;   // 敵自身被打殘→搏命解放
        const eFinisher = pHpRatio < 0.45;   // 我方從者已殘→敵收尾
        // 🔮 寶具預告制：敵寶具不再無預警秒殺——首次達成解放條件時「預告」(蓄勢·存 MEMORY 跨按鍵)，
        //    下次接觸必定發動，給玩家整整一回合準備(開結界/寶具對轟/逃跑)。旗標消耗於發動或被寶具對轟答覆。
        const eTelegraphed = getNpTelegraph_(pcData[nIdx][COL.PC.MEMORY]); // 上次已預告→這次必發
        const eWantsNp = eOffensiveNp && (eDesperate || eFinisher)
          && (Math.random() < (eNpUrge + (1 - eHpRatio) * 0.45 + (eFinisher ? 0.30 : 0)));
        let enemyFireNp = false;
        if (!enemyNpSpent && !npTeleHandled) {
          if (eTelegraphed && eOffensiveNp) {
            enemyFireNp = true; // ⚡ 已預告→這回合必定發動
          } else if (eWantsNp && !eTelegraphed) {
            // 尚未預告→這次只蓄勢預告、不發動；設旗標＋警告，須付得起 prana 才值得預告
            const ePranaT = npPranaCost_(enemyNow.six["寶具"]);
            if (enemyCanAffordNp_(pcData, nIdx, myGameId, ePranaT).afford) {
              pcData[nIdx][COL.PC.MEMORY] = setNpTelegraph_(pcData[nIdx][COL.PC.MEMORY]);
              sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);
              rl.eTelegraph = String(pcData[nIdx][COL.PC.MARTIAL] || "").split(/[（(／]/)[0].trim() || defC.name; // 前端/AI 警告用
              npTeleHandled = true;
            }
          }
          // 🔋 敵寶具也要吃魔力：自身 MP＋敵御主電池須付得起 prana，否則放不出（EX/EA 幾乎沒人付得起→極罕見）
          if (enemyFireNp) {
            const ePrana = npPranaCost_(enemyNow.six["寶具"]);
            const eAfford = enemyCanAffordNp_(pcData, nIdx, myGameId, ePrana);
            if (eAfford.afford) {
              drainForNp_(sheets, pcData, nIdx, eAfford.masterIdx, ePrana);
              enemyNow.output = 100; // ⚖️ 敵解放寶具＝全開(與玩家對等)
              enemyNpSpent = true;
              pcData[nIdx][COL.PC.MEMORY] = clearNpTelegraph_(pcData[nIdx][COL.PC.MEMORY]); // 消耗預告
              sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);
              npTeleHandled = true;
            } else {
              enemyFireNp = false; // 魔力不足(通常不會·預告時已驗)，改普攻
            }
          }
        }
        // 🗡️ 理想鄉·無敵結界（被動自動·概念 7 階·專剋 6 階究極寶具）：敵本回合解放【6 階概念寶具】(ea/enuma·
        //   會碾穿一切防禦·一發足以秒殺)、目標為阿爾托莉雅(持 Avalon)、且御主純魔 ≥100 → Avalon 自動展開無敵結界、
        //   完全擋下該發＋扣 100 魔。普通寶具(＜6階)不勞理想鄉·靠基本鞘減傷(×0.82)＋六圍扛。付不起 100 魔則張不起。
        let idealBlocked = false;
        if (enemyFireNp) {
          const tgtC0 = rowToCombatant_(pcData[ctgt]); injectMysticBuff_(tgtC0, pcData[pIdx][COL.PC.MEMORY]);
          const mMpNow = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
          if (hasFx_(tgtC0, 'avalon_saber') && offenseTier_(enemyNow, true) >= 6 && mMpNow >= 100) {
            pcData[pIdx][COL.PC.MP] = mMpNow - 100;
            sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
            idealBlocked = true;
          }
        }
        if (idealBlocked) {
          rl.eHit = false; rl.eDmg = 0; rl.eNp = true; rl.eTarget = String(pcData[ctgt][COL.PC.NAME]);
          rl.eFired = [`「${enemyNow.name}」的究極真名解放 vs 「${pcData[ctgt][COL.PC.NAME]}」·理想鄉——Avalon 展開隔絕於世界之外的無敵結界(概念 7 階·凌駕一切)，連斬裂世界的一擊亦盡數湮滅（御主耗 100 魔）`];
        } else {
          // 🎯 敵AI無主動技按鈕→自動施展其招牌施放技術(魔力放出/怪力/投影)，免費(視為其戰鬥本色)——
          //   精確還原「改制前這些是免費被動」的敵方戰力，避免單層歸屬後悄悄削弱敵人(玩家側才改為主動付魔)。
          const eSkill = servantActiveSkill_(enemyNow);
          const es = fateStrike_(sheets, pcData, enemyNow, ctgt, { counterMul: enemyFireNp ? 1.0 : 0.85, np: enemyFireNp, skill: eSkill }, ctx);
          rl.eHit = es.hit; rl.eRoll = es.aRoll; rl.eHitVal = es.aHit; rl.eDmg = es.hit ? es.damage : 0; rl.eFired = es.fired; rl.eTarget = String(pcData[ctgt][COL.PC.NAME]); rl.eNp = enemyFireNp;
          if (es.defeat) { defeat = true; victory = false; dreamPrompt = es.dreamPrompt; }
        }
      }
    }
    rounds.push(rl);
    if (defeat) break;
  }

  // 戰報摘要（含寶具對轟的傷害）
  const totalDealt = rounds.reduce((s, r) => s + (r.strikes || []).reduce((a, k) => a + (k.pDmg || 0), 0), 0) + (clash ? (clash.eDmgTaken || 0) : 0);
  const totalTaken = rounds.reduce((s, r) => s + (r.eDmg || 0), 0) + (clash ? (clash.pDmgTaken || 0) : 0);
  const nRounds = rounds.length;
  const atkLabel = dualAttack ? `${atkC.name} 與另一名從者協同` : atkC.name;
  const roundsBrief = rounds.map(r =>
    `第${r.n}回合：` + (r.strikes || []).map(k => `${k.by}${k.pHit ? `命中(−${k.pDmg})` : '揮空'}${k.note ? `【${String(k.note).replace(/\n/g, ' ')}】` : ''}`).join('、') +
    (targetIsFoeServant ? (r.eDmg ? `，「${defC.name}」回擊${r.eTarget ? `「${r.eTarget}」` : ''}(−${r.eDmg})` : (r.eHit === false ? `，「${defC.name}」反擊被擋` : '')) : '') +
    (r.eTelegraph ? `　⚠️【寶具預兆】「${defC.name}」真名解放的預兆匯聚——下次接觸必傾瀉而出！速謀防禦／寶具對衝／脫離。` : '')
  ).join('\n');
  const finalLine = destroyedName
    ? (!targetIsFoeServant
        ? `敵御主「${defC.name}」已斃命——凡人之軀、並非靈基消滅（${atkC.cls === 'Caster' ? 'Caster 以魔術給予決定性一擊、非肉搏；' : ''}致命手段依出戰從者職階自行演出）${victory ? '；其從者失去供魔亦將隨之消散，聖杯已近！' : '。'}`
        : `「${defC.name}」靈基崩潰、徹底消滅${victory ? '——此乃最後一名敵對從者，聖杯已近！' : '。'}`)
    : sealEscaped ? `「${defC.name}」被對面御主令咒緊急扯離戰場、遁走不在場。`
      : godRevived ? `「${defC.name}」屢屢自死亡歸來、仍未倒下。`
        : defeat ? `『${atkC.name}』靈基崩潰、化作光點消散，御主敗北。`
          : `「${defC.name}」HP ${parseInt(pcData[nIdx][COL.PC.HP]) || 0}/${parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 0}，交鋒未分生死，尚存。`;

  // 🎭 敵御主本人是否在場(同地)：是的話給AI一張精簡演出卡，讓對方在戰報裡也有反應/台詞，不再全程沉默旁觀。
  var enemyMasterRow = null;
  if (isMasterTarget) {
    enemyMasterRow = pcData[nIdx];
  } else {
    var _emIdx = enemyMasterIdx_(pcData, nIdx, myGameId);
    if (_emIdx >= 0 && String(pcData[_emIdx][COL.PC.LOC]).trim() === String(pcData[nIdx][COL.PC.LOC]).trim()) {
      enemyMasterRow = pcData[_emIdx];
    }
  }
  const enemyMasterCardStr = enemyMasterRow ? enemyMasterCard_(enemyMasterRow) : "";

  let aiPrompt;
  // 🎬 敘述：給 AI【事實素材】，少下指令——讓它自己演。只保留必要紅線(show-don't-tell／勿擅自寫死)。
  const horrorFired = rounds.some(r => (r.strikes || []).some(k => k.horror));
  if (defeat) {
    aiPrompt = servantCard_(pcData[atkIdx]) + enemyMasterCardStr +
      `【戰報·已裁定】御主號令『${atkC.name}』與「${defC.name}」鏖戰 ${nRounds} 回合。\n${roundsBrief}\n結局：『${atkC.name}』靈基崩潰、化作光點消散，御主敗北。\n` +
      `★以 Fate／TYPE-MOON 筆觸演出這場敗北的最後一幕(一段即可)${atkC.cls === 'Caster' ? '（Caster 以魔術轟擊為主、非肉搏）' : ''}，語氣留白。勝負已定，你只演過程。`;
  } else {
    aiPrompt = servantCard_(pcData[atkIdx]) + enemyMasterCardStr +
      `【戰報·已裁定，勝負與傷害不可改】御主號令${atkLabel}出擊，與「${defC.name}」交鋒 ${nRounds} 回合。\n` +
      `${roundsBrief}\n我方造成 ${totalDealt} 傷害、受創 ${totalTaken}。${finalLine}\n` +
      `── 本戰發生的事(素材，自行織入畫面，勿複述標籤名) ──\n` +
      (useSeal ? `· 御主燃燒一道令咒·絕對命令，強令此擊必中、引爆超限戰力。\n` : "") +
      (clash ? `· 寶具對轟：${clash.outcome === 'causality' ? `因果律先行截斷——『${atkC.name}』的死亡詛咒在敵方寶具解放之前便已降臨，敵 NP 殘波極微。` : clash.outcome === 'player' ? '我方威能壓過對手。' : clash.outcome === 'enemy' ? '對面威能壓過我方（從者以鋼鐵意志撐住）。' : '勢均力敵、轟然相抵、雙方震退。'}\n` : (useNp ? `· ${atkC.name} 高呼真名、解放了寶具。\n` : "")) +
      (skillActivated ? `· 我方全力催動了主動技「${skillBuff.name}」。\n` : "") +
      (horrorFired ? `· 青鬍子以螺湮城教本自深淵召出觸手巨獸「深淵海怪」，常駐戰場、每回合與本人並肩撕咬，靠御主魔力維持(枯竭則潰散)。\n` : "") +
      (dualAttack ? `· 我方兩名從者並肩夾擊同一敵手。\n` : "") +
      (allyAssistName ? `· 盟友從者「${allyAssistName}」依約自側翼掩護助攻。\n` : "") +
      (interceptNote ? `· ${interceptNote}\n` : "") +
      ((battery && battery.usedBattery) ? `· 御主電池：${battery.bledMaster ? `御主焚燒自身血肉(餘 ${battery.masterHp}/${battery.masterHpMax} HP)` : `御主導流自身魔力`}為從者頂上魔力缺口。\n` : "") +
      (godRevived ? `· 十二試煉：${godNote}\n` : "") +
      (sealEscaped ? `· 對面御主燃令咒、強行扯離重傷從者，敵已遁走不在場。${sealNote}★此撤離僅止於該從者及其本主，與在場其他御主／從者無關。\n` : "") +
      ((!destroyedName && !sealEscaped && !godRevived) ? `· 敗方尚有餘力(見上方 HP)，勿描寫死亡／消滅／屍體。此乃御主下令出擊、雙方仍在交鋒中，下回合是否再戰仍由御主決定。\n` : "") +
      (atkC.cls === 'Caster' ? `· 出戰從者為 Caster（魔術師）職階：此戰以魔術轟擊為主、非肉搏，演出時勿讓其上前近戰。\n` : "") +
      `★以 Fate／TYPE-MOON 筆觸演出這 ${nRounds} 回合互有攻防的交鋒(約 220~280 字)：show, don't tell，把上列事實化為畫面與張力，技能/寶具演其威能而非報菜名。`;
  }

  // 📊 給前端的多回合視覺戰報
  const report = {
    atk: atkLabel, def: defC.name, rounds: rounds, intercept: !!interceptNote, dual: dualAttack, allyAssist: allyAssistName,
    useNp: useNp, useSeal: useSeal, totalDealt: totalDealt, totalTaken: totalTaken,
    destroyed: destroyedName || "", godRevived: godRevived, sealEscaped: sealEscaped, victory: victory, defeat: defeat,
    defHp: parseInt(pcData[nIdx][COL.PC.HP]) || 0, defHpMax: parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 0,
    atkHp: parseInt(pcData[atkIdx][COL.PC.HP]) || 0, atkHpMax: parseInt(pcData[atkIdx][COL.PC.MAX_HP]) || 0,
    battery: (battery && battery.usedBattery) ? { fromMasterMp: battery.fromMasterMp, fromMasterHp: battery.fromMasterHp, bledMaster: battery.bledMaster, masterHp: battery.masterHp, masterHpMax: battery.masterHpMax } : null,
    skill: skillActivated ? { name: skillBuff.name, icon: skillBuff.icon, desc: skillBuff.desc, bledMaster: !!(skillBattery && skillBattery.bledMaster), fromMasterHp: skillBattery ? skillBattery.fromMasterHp : 0 } : null,
    clash: clash,
    masterHp: parseInt(pcData[pIdx][COL.PC.HP]) || 0, masterHpMax: parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 0,
    party: partyIdxs.map(i => ({ name: String(pcData[i][COL.PC.NAME]), hp: parseInt(pcData[i][COL.PC.HP]) || 0, hpMax: parseInt(pcData[i][COL.PC.MAX_HP]) || 0 }))
  };

  return JSON.stringify({
    success: true, aiPrompt: aiPrompt, knockedOut: knockedOut,
    victory: victory, defeat: defeat, dreamPrompt: dreamPrompt,
    sealEscaped: sealEscaped, report: report,
    clock: isFateBattle ? clockLabel_(myGameId) : "", ap: battleAp, apMax: AP_PER_DAY,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// 十二試煉(God Hand) 剩餘命數（從者 MEMORY【試煉】N；無標記預設 7，呼應 FSN 殘存命數）
function getGodHandLives_(memory) {
  var m = String(memory || "").match(/【試煉】(\d+)/);
  return m ? parseInt(m[1]) : 11;
}
function setGodHandLives_(memory, n) {
  var s = String(memory || "");
  if (/【試煉】\d+/.test(s)) return s.replace(/【試煉】\d+/, "【試煉】" + n);
  return (s ? s + "｜" : "") + "【試煉】" + n;
}

// 玩家令咒餘量（存於御主 MEMORY 的【令咒】N 標記；舊角色無標記則視為 3）
function getPlayerSeals_(memory) {
  var m = String(memory || "").match(/【令咒】(\d+)/);
  return m ? parseInt(m[1]) : 3;
}
// 寫回令咒餘量（回傳更新後的 MEMORY 字串）
function setPlayerSeals_(memory, n) {
  var s = String(memory || "");
  if (/【令咒】\d+/.test(s)) return s.replace(/【令咒】\d+/, "【令咒】" + n);
  return (s ? s + "｜" : "") + "【令咒】" + n;
}

// 🕯️ 令咒耗盡·靈基透支倒數：令咒燒到 0 又無「單獨行動」的敵從者，只能再撐 SEAL_DOOM_HOURS 小時。
var SEAL_DOOM_HOURS = 3; // 失去令咒穩固、無單獨行動自持的靈基存續上限（遊戲內小時）
// 該從者列(TAGS JSON 的 skills/traits)是否帶「單獨行動」(fx:'solo')
function rowHasSolo_(row) {
  try { var tg = JSON.parse(row[COL.PC.TAGS] || "{}"); return (tg.skills || []).concat(tg.traits || []).some(function (s) { return s && s.fx === 'solo'; }); }
  catch (e) { return false; }
}
// 在 MEMORY 標記/讀取靈基透支的「絕對死線」(遊戲內總時數 = day*24+hour)
function stampDoom_(memory, deadAbsHour) {
  var s = String(memory || "").replace(/【靈基透支】\d+/, "");
  s = s.replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  return (s ? s + "｜" : "") + "【靈基透支】" + deadAbsHour;
}
function getDoom_(memory) {
  var m = String(memory || "").match(/【靈基透支】(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

// 🍱 整備·進食（戰前 buff）：solo 無商城/道具欄，食物由「整備」抽象供給(AI 敘述來源)，
//   不寫道具列、不花錢。MEMORY 記【整備至】<絕對小時>，過期自動失效。
var MEAL_BUFF_HOURS = 8;   // 持續時數（遊戲內）
var MEAL_BUFF_BONUS = 2;   // 從者出擊命中加值
// 🐙 海怪護盾 ＝ 深淵海怪的「肉身血池」：螺湮城教本解放後，海怪自深淵現身、以身掩護術師——
//   傷害先扣海怪、海怪潰散後才傷及本體；每回合自深淵汲魔再生；逾時退場。
//   單一真實來源＝MEMORY【海怪護盾】<cur>|<max>|<expiryAbsHour>（三欄·舊兩欄相容讀取）。
//   要擴充「召喚物掩護」類技能：照此 get/set/clear + view 模式複製即可。
var HORROR_SHIELD_HP = 300;   // 海怪肉身上限（召喚時的滿值）
var HORROR_SHIELD_HOURS = 8;  // 持續上限（遊戲內小時·逾時自深淵退場）
var HORROR_REGEN = 10;        // 每回合肉身再生量（不超過上限）
function stampMeal_(memory, expiryAbsHour) {
  var s = String(memory || "").replace(/【整備至】\d+/, "");
  s = s.replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  return (s ? s + "｜" : "") + "【整備至】" + expiryAbsHour;
}
function getMeal_(memory) {
  var m = String(memory || "").match(/【整備至】(\d+)/);
  return m ? parseInt(m[1]) : 0;
}
// 目前是否仍在整備加成效期內（吃 game clock 的絕對小時：day*24+hour）
function mealBuffActive_(memory, gameId) {
  var exp = getMeal_(memory); if (!exp) return false;
  var clk = getClock_(gameId); if (!clk) return false;
  return (clk.day * 24 + clk.hour) < exp;
}
// 讀海怪肉身：回 {active, remaining, max, expiry}。逾時 → active:false。相容舊兩欄(cur|expiry，max 退回 cur)。
function getHorrorShield_(memory, absHour) {
  var m = String(memory || "").match(/【海怪護盾】(\d+)\|(\d+)(?:\|(\d+))?/);
  if (!m) return { active: false, remaining: 0, max: 0, expiry: 0 };
  var rem, max, exp;
  if (m[3] != null) { rem = parseInt(m[1]); max = parseInt(m[2]); exp = parseInt(m[3]); }   // 新三欄 cur|max|expiry
  else { rem = parseInt(m[1]); max = rem; exp = parseInt(m[2]); }                            // 舊兩欄 cur|expiry
  if (absHour != null && absHour >= exp) return { active: false, remaining: 0, max: max, expiry: exp };
  return { active: rem > 0, remaining: rem, max: max, expiry: exp };
}
function setHorrorShield_(memory, remaining, max, expiry) {
  var s = String(memory || "").replace(/【海怪護盾】\d+\|\d+(?:\|\d+)?/, "");
  s = s.replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  return (s ? s + "｜" : "") + "【海怪護盾】" + remaining + "|" + max + "|" + expiry;
}
function clearHorrorShield_(memory) {
  return String(memory || "").replace(/｜?【海怪護盾】\d+\|\d+(?:\|\d+)?/, "").replace(/^｜|｜$/, "");
}
// 前端視圖：持 summon_horror 的從者，現存海怪肉身 {cur,max}（無/潰散→null）。供 servant 卡渲染獨立血條。
function horrorShieldView_(memory, gameId) {
  var abs = null;
  try { var c = getClock_(gameId); if (c) abs = c.day * 24 + c.hour; } catch (e) { }
  var sh = getHorrorShield_(memory, abs);
  return sh.active ? { cur: sh.remaining, max: sh.max } : null;
}
