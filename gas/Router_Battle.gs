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
// 💠 「展開扣魔」防禦(七天盾)的帳單結算：引擎只在呼叫端注入 c._shieldMp(御主純魔)時才收費、記帳於
//   c._shieldSpent，此處統一從御主純魔扣款落表。冪等：結算後清 _shieldSpent，重呼不重扣。
function settleShieldMana_(sheets, pcData, masterIdx, c) {
  var spent = c && c._shieldSpent;
  if (!spent || masterIdx == null || masterIdx < 0) return;
  pcData[masterIdx][COL.PC.MP] = Math.max(0, (parseInt(pcData[masterIdx][COL.PC.MP]) || 0) - spent);
  sheets.pc.getRange(masterIdx + 1, COL.PC.MP + 1).setValue(pcData[masterIdx][COL.PC.MP]);
  c._shieldSpent = 0;
}

function fateStrike_(sheets, pcData, atkC, tgtIdx, opts, ctx) {
  opts = opts || {};
  var defC = rowToCombatant_(pcData[tgtIdx]);
  // ✨ 我方從者作守方時也吃御主禮裝被動（防禦端：如全世界之鞘承受寶具減傷）＋
  //   💠 注入御主純魔作「展開扣魔」防禦(七天盾)的付費額度——引擎付不起就張不開
  if (String(pcData[tgtIdx][COL.PC.FACTION]) === "從者" && ctx && ctx.pIdx >= 0) {
    injectMysticBuff_(defC, pcData[ctx.pIdx][COL.PC.MEMORY]); injectHomeField_(defC, ctx && ctx.homeField);
    injectMasterMeleeSupport_(defC, pcData[ctx.pIdx][COL.PC.MEMORY]); // 🥋 御主體術參戰（守方時亦生效）
    injectMasterMagicSupport_(defC, pcData[ctx.pIdx][COL.PC.MEMORY]); // 🔮 御主魔術支援（守方時亦生效·僅Caster）
    defC._shieldMp = parseInt(pcData[ctx.pIdx][COL.PC.MP]) || 0;
  } else if (String(pcData[tgtIdx][COL.PC.FACTION]) === "敵從者" && ctx && ctx.myGameId) {
    // 🥋🔮 敵從者防守時同樣吃「自己御主」的體術/魔術支援(讀硬連結敵御主)，讓敵御主的能力也反應在戰報傷害上。
    var _eMasterMem = enemyMasterMemoryFor_(pcData, ctx.myGameId, pcData[tgtIdx]);
    if (_eMasterMem) {
      injectMasterMeleeSupport_(defC, _eMasterMem);
      injectMasterMagicSupport_(defC, _eMasterMem);
    }
  }
  // 🍱 整備·進食加成：御主一行戰前整備過、且尚在效期內 → 從者出擊命中 +MEAL_BUFF_BONUS。
  //   ⚠ 只屬於【我方陣營的出擊】——目標是我方從者＝攻擊者是敵人，不吃玩家的餐；盟友助攻亦非御主一行，
  //   呼叫端以 opts.noMeal 排除。
  var mealOn = false;
  if (String(pcData[tgtIdx][COL.PC.FACTION]) !== "從者" && !opts.noMeal) {
    try { mealOn = mealBuffActive_(pcData[ctx.pIdx][COL.PC.MEMORY], ctx.myGameId); } catch (e) { }
  }
  // ❖ 令咒必中(opts.seal)已在 resolveFateBattle_ 內部定生死(damage 屬於攻方)——勿在此事後翻 atkWins。
  var r = resolveFateBattle_(atkC, defC, { np: !!opts.np, seal: !!opts.seal, skill: opts.skill || null, ambush: !!opts.ambush, mealBuff: mealOn ? MEAL_BUFF_BONUS : 0, round: opts.round || 1 });
  // 💠 七天盾展開費結算（引擎已判付得起才展開；僅玩家側從者有 _shieldMp 會產生帳單）
  settleShieldMana_(sheets, pcData, ctx ? ctx.pIdx : -1, defC);
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
  //   faction 無關；無「現存海怪」(未解放/已退場)時此段空轉。
  //   ⚖️ 貫穿判定：summon_horror 在 CONCEPT_TIER 與 rho_aias 同 4 階(唯 6 階 ea/enuma 可貫穿)，沿用同一份
  //   offenseTier_/conceptTier_/PIERCE_GAP 算貫穿，與 rho_aias 同框架，高階概念寶具可直接無視護盾。
  if (hasFx_(defC, 'summon_horror') && dmg > 0) {
    var _hClk = getClock_(ctx.myGameId);
    var _hAbs = _hClk ? _hClk.day * 24 + _hClk.hour : null;
    var _shield = getHorrorShield_(pcData[tgtIdx][COL.PC.MEMORY], _hAbs);
    var _hPierced = offenseTier_(atkC, !!opts.np) >= conceptTier_('summon_horror') + PIERCE_GAP;
    if (_shield.active && _shield.remaining > 0 && _hPierced) {
      out.fired.push(atkC.name + '·概念貫穿(深淵海怪護盾失效)');
    } else if (_shield.active && _shield.remaining > 0) {
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
      // 不在此立刻補寫 MEMORY 單格：下方 4 條出路都會對 pcData[tgtIdx] 做一次整列 setValues()，
      //   此格寫入必被覆蓋——省一次多餘 API 呼叫，隨後面任一整列寫入一起落表。
    }
  }
  var after = hp - dmg;
  if (severed && after <= 0) out.fired.push(atkC.name + '·斬斷救贖(契約已破)');
  // 🛡️ 戰鬥續行＝受【致命傷】(after<=0)才觸發硬撐留 1——非「殘血 2~5 也被拖到 1」。
  //   「僅一次」由 hp>1 天然保證：撐過後站在 1 血，下一記致死擊不再觸發。
  // survive 與 god_hand 結構性互斥（別靠「種子資料別同時掛」自律）：兩者若同掛，survive 判定順序在前
  //   會免費接住致命傷、god_hand 燒命判定永遠輪不到。持有 god_hand 者一律優先吃 god_hand。
  if (after <= 0 && hasFx_(defC, 'survive') && !hasFx_(defC, 'god_hand') && hp > 1 && !severed) { after = 1; out.fired.push(defC.name + '·戰鬥續行'); }

  // 十二試煉（God Hand）：自死亡歸來、不花御主任何資源——優先於令咒脫離判定，別讓有 God Hand 的從者(如赫拉克勒斯)
  //   平白燒掉御主寶貴的令咒逃命，牠自己就能免費復活。高位階寶具概念可「一擊燒掉多條命」，壓倒性 overkill 再加成。
  if (after <= 0 && !severed && hasFx_(defC, 'god_hand')) {
    var lives = getGodHandLives_(pcData[tgtIdx][COL.PC.MEMORY]);
    if (lives > 0) {
      var ghMaxHp = parseInt(pcData[tgtIdx][COL.PC.MAX_HP]) || 300;
      var ghReviveHp = Math.max(1, Math.round(ghMaxHp * 0.20));
      // 🔱 概念優先權【下限】：寶具解放且概念位階高 → 保證燒多命(世界級概念繞過不死·即使傷害普通)。
      //   位階取「fx 概念階」與「寶具規模(對人/軍/城/界)」較高者，故 Saber 對城 Excalibur、Gilgamesh 的 ea 都吃得到。
      var lossN = 1;
      if (opts.np) {
        var ghTier = offenseTier_(atkC, true);
        var ghScale = npAtkScale_(atkC);
        var ghScaleTier = ghScale === '對界' ? 6 : ghScale === '對城' ? 5 : ghScale === '對軍' ? 4 : 1;
        var ghSev = Math.max(ghTier, ghScaleTier);
        if (ghSev >= 6) lossN = Math.max(lossN, 3); else if (ghSev >= 5) lossN = Math.max(lossN, 2);
      }
      // 🩸 傷害溢出【不封頂】：一擊打穿現有 HP 後，每再滿一個「復活線(20%靈基)」的溢出傷害 → 多燒一條命
      //   (同海怪護盾的溢出原則)。故一記壓倒性寶具可一口氣燒去多條命，而非每擊固定一條。與概念下限取較狠者。
      lossN = Math.max(lossN, 1 + Math.floor(Math.max(0, dmg - hp) / ghReviveHp));
      // 【試煉】N＝剩餘可復活次數：lossN 恰等於 lives 時＝最後的命也用上、以餘 0 站起(下一擊必死)。
      if (lossN <= lives) {
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
    //   有「單獨行動」者靠靈基殘存苟活(見 enemyCanAffordNp_ 的 INDEPENDENT_ACTION_RESERVE)。
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
      }
    } else {
      out.knocked = out.destroyed;
      // 🕯️ 敵從者被擊破 → 在其御主身上記下「如何痛失從者」，供日後遭遇時 AI 演出無牙御主
      if (isFoeSv) markMasterLostServant_(sheets.pc, pcData, tgtIdx, `被『${atkC.name}』當場擊破、靈基崩潰消滅`);
      if (isFoeSv && aliveEnemyServants_(sheets, ctx.myGameId, pcData) <= 0) {
        out.victory = true;
        // 🏆 勝利同款「願望夢」：與敗北的 buildDreamPrompt_ 對稱，帶玩家自己的從者(atkC，此刻是攻方)入場。
        var vWish = extractWish_(pcData[ctx.pIdx][COL.PC.MEMORY]);
        out.dreamPrompt = buildVictoryDreamPrompt_(pcData[ctx.pIdx][COL.PC.NAME], vWish, atkC.name);
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
  // 🕯️ 無主「單獨行動」者：以殘存靈基【殘存】N 支付——確實扣減、用光即啞火。
  if (masterIdx < 0 && need > 0 && svIdx >= 0 && rowHasSolo_(pcData[svIdx])) {
    var _solo = getSoloReserve_(pcData[svIdx][COL.PC.MEMORY]);
    var _fromSolo = Math.min(_solo, need);
    if (_fromSolo > 0) {
      need -= _fromSolo;
      pcData[svIdx][COL.PC.MEMORY] = setSoloReserve_(pcData[svIdx][COL.PC.MEMORY], _solo - _fromSolo);
      sheets.pc.getRange(svIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[svIdx][COL.PC.MEMORY]);
    }
  }
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
// 🕯️ 殘存靈基(無主單獨行動者的「最後一口氣」)：MEMORY【殘存】N，無標記＝滿額 INDEPENDENT_ACTION_RESERVE。
//   用掉就少、【不回復】。
var SOLO_RESERVE_TAG_ = makeIntTag_('殘存', INDEPENDENT_ACTION_RESERVE);
function getSoloReserve_(memory) { return SOLO_RESERVE_TAG_.get(memory); }
function setSoloReserve_(memory, n) { return SOLO_RESERVE_TAG_.set(memory, Math.max(0, Math.round(n))); }
// 🔋 敵方寶具買單：（同陣敵御主）電池是否付得起 prana(從者無自有魔力池，跟玩家從者同制)；
//   無主時僅「單獨行動」者靠殘存靈基硬撐（讀【殘存】餘額·drainForNp_ 實扣），其餘無主即啞火。回 {afford, masterIdx}。
function enemyCanAffordNp_(pcData, svIdx, gameId, prana) {
  var mi = enemyMasterIdx_(pcData, svIdx, gameId);
  var mMp = mi >= 0 ? (parseInt(pcData[mi][COL.PC.MP]) || 0) : 0;
  var mHp = mi >= 0 ? (parseInt(pcData[mi][COL.PC.HP]) || 0) : 0;
  var maxPay = mMp + Math.floor(Math.max(0, mHp - 1) / BATTERY_HP_PER_MP);
  if (mi < 0 && rowHasSolo_(pcData[svIdx])) maxPay += getSoloReserve_(pcData[svIdx][COL.PC.MEMORY]);
  return { afford: maxPay >= prana, masterIdx: mi };
}

// 🎌 御主參戰風格（與前端「御主戰法」三段藥丸同鍵）：御主替從者分擔戰損的比例。
//   後方支援(stealth)＝0%·躲在後方不涉險；見機行事(normal)＝5%·相機補位；正大光明(open)＝10%·堂堂立於陣前共擔傷勢。
var STANCE_SHARE_ = { stealth: 0.0, normal: 0.05, open: 0.10 };
function stanceShareOf_(stance) { var s = STANCE_SHARE_[String(stance || "")]; return (typeof s === 'number') ? s : STANCE_SHARE_.normal; }
// 🩸 傷害轉移：從者剛吃了 dmg(fateStrike_ 已寫入從者HP＋sheet)，御主依風格「討回」share 比例替其承受——
//   從者HP回補 shared、御主HP扣 shared，兩列即刻寫回 sheet(與 backlash/drainForNp_ 同一套逐事件寫法)。
//   御主不因分擔而死(保底1)；已瀕死(≤1)則無力再擋。回實際分擔值(供戰報)。
function applyMasterStanceShare_(sheets, pcData, svIdx, masterIdx, dmg, share) {
  if (!share || share <= 0 || dmg <= 0 || svIdx < 0 || masterIdx < 0 || svIdx === masterIdx) return 0;
  var mHp = parseInt(pcData[masterIdx][COL.PC.HP]) || 0;
  if (mHp <= 1) return 0;
  // 🎯 忠於標稱百分比：四捨五入即可、【不】保底1——小額擦傷(如 5% 的個位數傷)攤到 0 就不扣御主，
  //   免每一記都硬吃 1 讓實際分擔遠超標稱％。御主不因分擔而死(夾 mHp−1)。
  var shared = Math.min(Math.round(dmg * share), mHp - 1);
  if (shared <= 0) return 0;
  var svMax = parseInt(pcData[svIdx][COL.PC.MAX_HP]) || 999999;
  pcData[svIdx][COL.PC.HP] = Math.min(svMax, (parseInt(pcData[svIdx][COL.PC.HP]) || 0) + shared);
  pcData[masterIdx][COL.PC.HP] = mHp - shared;
  sheets.pc.getRange(svIdx + 1, COL.PC.HP + 1).setValue(pcData[svIdx][COL.PC.HP]);
  sheets.pc.getRange(masterIdx + 1, COL.PC.HP + 1).setValue(pcData[masterIdx][COL.PC.HP]);
  return shared;
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
  // 🛡️ 常駐寶具閘：God Hand/治癒結界等【常駐寶具】自動生效、不是攻擊——擋下攻擊解放
  //   (前端💥鈕已灰化，此為舊快取前端的後端保險)。
  if (useNp && atkIdx !== -1 && /【常駐寶具】/.test(String(pcData[atkIdx][COL.PC.MARTIAL] || ""))) {
    return JSON.stringify({ success: false, message: "此從者的寶具為【常駐型】（已自動生效），並非可解放的攻擊寶具——請以普攻／主動技／令咒作戰。" });
  }
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

  // 🎯 目標解析：優先用前端帶的【穩定列 ID】(npcId)精準命中——名字比對(nameLoose·CJK 點號/全形括號變體)易失手，
  //   常見「查無此目標」正因名字位元組不一致。ID 為主、名字為退路(相容舊前端/無 id 情況)。
  const npcId = String(userData.npcId || "").trim();
  // 🛡️ 目標必須是敵方陣營(敵從者/敵御主)——擋掉偽造參數打自己御主/自己第二從者(盟友另有 isAllied_ 專屬擋牆)
  // 🕰️ 登場日閘門：尚未登場者不可被鎖定攻擊(前端本就看不到，這裡防直打API繞過)
  const _battleDay = parseInt(pcData[pIdx][COL.PC.DAY]) || 1;
  const _notMeAlive = function (r) { var f = String(r[COL.PC.FACTION] || ""); return (f === "敵從者" || f === "敵御主") && r[COL.PC.ID] != pcData[atkIdx][COL.PC.ID] && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId) && hasArrived_(r, _battleDay); };
  let nIdx = npcId ? pcData.findIndex(r => String(r[COL.PC.ID]) === npcId && _notMeAlive(r)) : -1;
  if (nIdx === -1) nIdx = pcData.findIndex(r => nameLoose_(r[COL.PC.NAME]).indexOf(npcKey) !== -1 && _notMeAlive(r));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "此世界查無此目標。" });
  if (String(pcData[pIdx][COL.PC.LOC]).trim() !== String(pcData[nIdx][COL.PC.LOC]).trim()) {
    return JSON.stringify({ success: false, message: "對方不在你身邊，鞭長莫及。" });
  }

  // 🗡️ 斬首戰術：目標為敵御主時，若其從者尚在同地護衛 → 需「大成功(擲 20)」才能突破斬殺御主，
  //    否則被從者捨命格擋、並反噬 1.5 倍傷害。從者已亡 → 御主手無寸鐵，直接擊殺（走一般流程）。
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
  //   getAp_/spendAp_ 傳入手上這份 pcData(記憶體查找+原地改)，免整表重讀，結尾可直接餵 buildClientState_。
  const isFateBattle = myGameId.indexOf("g_") === 0;
  if (isFateBattle && getAp_(myGameId, pcData) < 1) {
    return JSON.stringify({ success: false, message: "行動點已耗盡，從者也需喘息——請『歇息』恢復後再戰。" });
  }

  // 🤝 盟友不可攻擊：須先撕毀盟約
  if (isAllied_(pcData[nIdx])) {
    return JSON.stringify({ success: false, message: `「${pcData[nIdx][COL.PC.NAME]}」是你的盟友——若要動手，須先『撕毀盟約』。` });
  }

  // 🐙 清逾時海怪殘影(戰前)：讓 atkC.horrorUp 與城防判定準確——單一真實來源不留過期字串
  {
    const _hce = clearExpiredHorror_(pcData[atkIdx][COL.PC.MEMORY], myGameId);
    if (_hce.cleared) { pcData[atkIdx][COL.PC.MEMORY] = _hce.mem; sheets.pc.getRange(atkIdx + 1, COL.PC.MEMORY + 1).setValue(_hce.mem); }
  }
  const homeField = homeTerritoryRank_(pcData, pIdx, myGameId); // 🏰 於自己陣地決戰＋隊有陣地作成→主場結界階級(否則"")
  const atkC = rowToCombatant_(pcData[atkIdx]);
  injectMysticBuff_(atkC, pcData[pIdx][COL.PC.MEMORY]);  // ✨ 御主禮裝被動加持我方從者（含開場對轟攻防）
  injectMasterMeleeSupport_(atkC, pcData[pIdx][COL.PC.MEMORY]); // 🥋 御主體術參戰（開場對轟）
  injectMasterMagicSupport_(atkC, pcData[pIdx][COL.PC.MEMORY]); // 🔮 御主魔術支援（開場對轟·僅Caster）
  injectHomeField_(atkC, homeField);                    // 🏰 主場·陣地結界（僅玩家於自己陣地決戰）
  const defC = rowToCombatant_(pcData[nIdx]);

  // 🔋 寶具魔力（出力電池制）：寶具全由御主供魔。① 寶具僅能在「出力 100%（全開·認真）」解放——御主把魔力全灌進去才釋放得了真名。
  //   ② 御主魔力(MP)＋焚血(HP)都湊不出 prana → 油盡燈枯，擋下。
  if (useNp) {
    const atkOutput = servantOutput_(pcData[atkIdx][COL.PC.MEMORY]);
    if (atkOutput < 100) {
      return JSON.stringify({ success: false, message: `寶具乃靈基全力之解放——須先將「${atkC.name}」的出力推到 100%（全開）並支付寶具底費，方能釋放真名。當前出力 ${atkOutput}%。` });
    }
    const npCostPre = npPranaCost_(npEffectiveRank_(atkC)); // 🎴 吃玩家所選寶具的官方階級(多寶具選項各自定價)，非概括六圍表寶具值
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
  if (isFateBattle) { try { battleAp = spendAp_(myGameId, 1, pcData, sheets).ap; } catch (e) { } }

  // ⚔️ 交手即削好感：拔劍相向直接 −5（不勞 AI 判定）。只削既有交情列、不憑空建列(萍水相逢者本就 0)。
  //   ★同時是「刷好感躲追殺」的天然制衡：要奪杯就得打、打了好感掉破 50→追擊閘重新開啟。
  try { raiseBond_(sheets, myGameId, String(pcData[pIdx][COL.PC.NAME]), String(pcData[nIdx][COL.PC.NAME]), -5, pcData); } catch (e) { }

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
      // 大成功：斬殺御主；御主既亡，護衛從者失去魔力供給隨之消滅（十二試煉等 god_hand 免死特效仍可救回護衛）
      pcData[nIdx][COL.PC.ID] = "DEAD_" + String(pcData[nIdx][COL.PC.ID]);
      pcData[nIdx][COL.PC.HP] = 0;
      pcData[nIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "凌亂", "姿勢": "倒地不起", "負面": "重傷不治·身亡", "顏面": "生機已絕" });
      sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);
      const guardC = rowToCombatant_(pcData[assassinGuardIdx]);
      let guardSurvived = false;
      if (hasFx_(guardC, 'god_hand')) {
        const ghLives = getGodHandLives_(pcData[assassinGuardIdx][COL.PC.MEMORY]);
        if (ghLives > 0) {
          guardSurvived = true;
          pcData[assassinGuardIdx][COL.PC.HP] = Math.max(1, Math.round((parseInt(pcData[assassinGuardIdx][COL.PC.MAX_HP]) || 300) * 0.2));
          pcData[assassinGuardIdx][COL.PC.MEMORY] = setGodHandLives_(pcData[assassinGuardIdx][COL.PC.MEMORY], ghLives - 1);
        }
      }
      if (!guardSurvived) {
        pcData[assassinGuardIdx][COL.PC.ID] = "DEAD_" + String(pcData[assassinGuardIdx][COL.PC.ID]);
        pcData[assassinGuardIdx][COL.PC.HP] = 0;
        pcData[assassinGuardIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "化作光點", "負面": "御主既亡·魔力斷絕消滅", "顏面": "黯然消散" });
      }
      sheets.pc.getRange(assassinGuardIdx + 1, 1, 1, pcData[assassinGuardIdx].length).setValues([pcData[assassinGuardIdx]]);
      asnKnocked = guardSurvived ? [masterName] : [masterName, guardName];
      if (aliveEnemyServants_(sheets, myGameId, pcData) <= 0) {
        asnVictory = true;
        var asnWish = extractWish_(pcData[pIdx][COL.PC.MEMORY]);
        asnDream = buildVictoryDreamPrompt_(pcData[pIdx][COL.PC.NAME], asnWish, crit.name);
      }
      asnReport = {
        assassination: true, success: true, aRoll: 20, rolls: rolls.map(r => ({ name: r.name, roll: r.roll })), dual: dualAsn,
        atk: crit.name, master: masterName, guard: guardName,
        note: guardSurvived
          ? `${crit.name} 擲出 20 — 大成功！撕開「${guardName}」的守備、一擊取御主「${masterName}」性命。御主既亡，然「${guardName}」以異於常理之神秘力量強行維繫靈基、未隨之消散。`
          : `${crit.name} 擲出 20 — 大成功！撕開「${guardName}」的守備、一擊取御主「${masterName}」性命。御主既亡，「${guardName}」隨之消散。`,
        selfDmg: 0, victory: asnVictory, defeat: false,
        atkHp: parseInt(pcData[atkIdx][COL.PC.HP]) || 0, atkHpMax: parseInt(pcData[atkIdx][COL.PC.MAX_HP]) || 0
      };
      asnPrompt = `【系統·斬首戰報·已裁定】御主號令${dualAsn ? '兩名從者齊撲' : `從者『${crit.name}』`}奇襲敵御主「${masterName}」。命運的骰子由『${crit.name}』擲出 20 — 大成功！撕開護衛從者「${guardName}」的防線、取下御主性命。御主既亡（凡人之軀·斃命，非靈基消滅）、魔力供給斷絕，` +
        (guardSurvived ? `然「${guardName}」憑一己神秘之力強行維繫靈基、瀕死重創卻未消散。` : `從者「${guardName}」失去供魔當場化作光點消散。`) +
        `${asnVictory ? '此為最後的敵對陣營——聖杯已然在握！' : ''}\n` +
        `★以 Fate／TYPE-MOON 筆觸描寫這萬中選一、石破天驚的斬首瞬間（一段即可）。【致命的手段由你依『${crit.name}』的職階與真名自行演出——法師為魔術一擊、近戰為兵刃、弓兵為遠程，勿假設特定方式】${dualAsn ? '，兩名從者夾擊、其中一人覷得破綻收尾' : ''}。勝負已由系統結算。\n` +
        (guardSurvived ? `★「${guardName}」雖重創瀕死，【絕對禁止】描寫其消散或死亡。\n` : ``);
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
        if (after <= 0 && hasFx_(sC, 'survive') && ahp > 1) after = 1; // 戰鬥續行(致命傷才硬撐留1·2026-07 修)
        if (after <= 0 && hasFx_(sC, 'god_hand')) {
          const ghLives = getGodHandLives_(pcData[r.idx][COL.PC.MEMORY]);
          if (ghLives > 0) {
            after = Math.max(1, Math.round((parseInt(pcData[r.idx][COL.PC.MAX_HP]) || 300) * 0.2));
            pcData[r.idx][COL.PC.MEMORY] = setGodHandLives_(pcData[r.idx][COL.PC.MEMORY], ghLives - 1);
          }
        }
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

    STATE_PRE_DATA_ = pcData; // ⚡ 交棒：斬首路徑的所有寫入(fateStrike_/spendAp_/raiseBond_)皆已原地改回 pcData
    return JSON.stringify({
      success: true, aiPrompt: asnPrompt, knockedOut: asnKnocked,
      victory: asnVictory, defeat: asnDefeat, dreamPrompt: asnDream,
      sealEscaped: false, report: asnReport,
      clock: isFateBattle ? clockLabel_(myGameId, pcData) : "", ap: battleAp, apMax: AP_PER_DAY,
      statusString: buildPlayerStatusString(pcData[pIdx]) // ⚡ pcData 即權威，免 getFreshStatusString 的整表重讀
    });
  }

  // ⚔️ 一次出戰＝最多 ROUNDS 個來回（我攻→敵反擊），命中才扣血、未中＝撲空；任一方倒下即止。
  //   寶具/令咒只在開場第一擊生效；其後為普通互砍。敵御主空手不反擊。
  const ROUNDS = 3;
  if (useSeal) {
    const left = getPlayerSeals_(pcData[pIdx][COL.PC.MEMORY]) - 1;
    pcData[pIdx][COL.PC.MEMORY] = setPlayerSeals_(pcData[pIdx][COL.PC.MEMORY], left);
    sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
  }
  // 🔋 寶具魔力 = 依寶具階級的 Prana Cost（E40 D70 C110 B160 A220 EX300）。從者付不起 → 御主電池接力供能。
  let battery = null, backlash = null;
  if (useNp) {
    const prana = npPranaCost_(npEffectiveRank_(atkC)); // 🎴 吃所選寶具官方階級
    // 🔥 灌魔加乘：規格外寶具(＋/EX)於【全開 100%】時，把御主餘裕魔力超載灌入 → 威力線性放大至上限(＋×1.5、＋＋/EX×2)。
    //   超載＝固定價格檔位、依寶具階等比(A階＝總耗 220/440/660，即底費P/2P/3P)，魔力優先支付、不足才焚血
    //   (drainForNp_ 2HP=1MP)。userData.overload：false＝僅底費／'p1'＝超載檔(總價2P·灌P)／'p2'＝極限檔
    //   (總價3P·灌2P)／true·'blood'·未帶旗標(舊前端/敵方)＝相容檔。過充 token 只無償折抵超載段。
    const cap = npOverloadCap_(npEffectiveRank_(atkC)); // 🎴 超載上限依所選寶具階級(如迦爾納選A階黃金鎧則無法超載，選EX的Vasavi Shakti才能)
    const ov = userData.overload;
    const wantOverload = !(ov === false || ov === 'false');         // 未帶旗標(舊前端/敵方)＝超載(不焚血)
    let totalDrain = prana, npOverloadMul = 1.0, ocUsed = 0, usedOvercharge = false;
    if (cap > 1.0 && wantOverload && (parseInt(atkC.output) || 60) >= 100) { // 僅規格外(＋/EX)寶具·全開時可超載/動用過充
      const ocBonus = getOvercharge_(pcData[pIdx][COL.PC.MEMORY]);
      const mMp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
      const mHp = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
      const extraToCap = prana * 2;                                 // 灌好灌滿＝再灌「底費×2」(總價3P)
      // 🔋 底費恆由御主自付(上游閘門已保證付得起)；過充【只】擴充「超載段」預算、絕不代付底費。
      const payableAll = mMp + Math.floor(Math.max(0, mHp - 1) / BATTERY_HP_PER_MP); // 血也列入(定檔/梭哈才用)
      let pourTarget, pourBudget;
      if (ov === 'p1' || ov === 'p2') {          // 🎚️ 定檔制：固定總價、MP 優先、缺口焚血
        pourTarget = (ov === 'p2') ? extraToCap : prana;
        pourBudget = Math.max(0, payableAll - prana) + ocBonus;
      } else if (ov === 'blood') {               // 相容：舊「全力梭哈」(血列入·灌到滿或灌到乾)
        pourTarget = extraToCap;
        pourBudget = Math.max(0, payableAll - prana) + ocBonus;
      } else {                                    // true/未帶旗標：只灌 MP 餘裕(不焚血)
        pourTarget = extraToCap;
        pourBudget = Math.max(0, mMp - prana) + ocBonus;
      }
      const pour = Math.min(pourTarget, pourBudget);                // 超載段實灌＝檔位目標與預算取小
      npOverloadMul = 1 + (pour / extraToCap) * (cap - 1);
      totalDrain = prana + pour;
      ocUsed = Math.min(ocBonus, pour);               // 過充【只】無償支付超載段·絕不代付底費(修雙重折抵)
      usedOvercharge = ocUsed > 0;                     // 真的灌到超載才消耗；沒派上用場則保留過充(修無謂燒 token)
      if (usedOvercharge) {                            // 過充一次性：確實流入這一發即清
        pcData[pIdx][COL.PC.MEMORY] = clearOvercharge_(pcData[pIdx][COL.PC.MEMORY]);
        sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);
      }
    }
    battery = drainForNp_(sheets, pcData, atkIdx, pIdx, totalDrain - ocUsed);
    atkC.npOverloadMul = npOverloadMul;    // → resolveFateBattle_ 放大寶具威力
    atkC.overcharge = usedOvercharge;      // → resolveFateBattle_ 全能力微揚
    atkC.mp = parseInt(pcData[atkIdx][COL.PC.MP]) || 0; // 反映耗魔後的出力
    // ⚡🩸 過載反噬：凡人之軀強行導引倍額魔力，解放後機率性迴路暴走隨機扣血。不致死·保底1——反噬是資源壓力
    //   (血魔雙空＝接下來放不了寶具/主動)，不是即死輪盤。只掛玩家【明選】的超載檔位(p1/p2/舊blood比照p2)。
    var OVERLOAD_BACKLASH_ = { p1: { chance: 0.30, min: 0.04, max: 0.12 }, p2: { chance: 0.65, min: 0.08, max: 0.24 } };
    var _blKey = (ov === 'p2' || ov === 'blood') ? 'p2' : (ov === 'p1' ? 'p1' : null);
    if (_blKey && npOverloadMul > 1.0 && Math.random() < OVERLOAD_BACKLASH_[_blKey].chance) {
      var _bl = OVERLOAD_BACKLASH_[_blKey];
      var _mMaxHp = parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 100;
      var _blDmg = Math.max(1, Math.round(_mMaxHp * (_bl.min + Math.random() * (_bl.max - _bl.min))));
      var _mHpNow = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
      pcData[pIdx][COL.PC.HP] = Math.max(1, _mHpNow - _blDmg); // 保底1·不致死
      sheets.pc.getRange(pIdx + 1, COL.PC.HP + 1).setValue(pcData[pIdx][COL.PC.HP]);
      backlash = { dmg: _blDmg, hp: parseInt(pcData[pIdx][COL.PC.HP]) || 1, hpMax: _mMaxHp };
    }
  }

  // 🎲 從者主動技已改「被動化」(玩家 2026-07 定案)：不再有手動「⚡主動」按鈕、不扣魔、無微效保底——
  //   改為每一擊獨立 50% 機率自動【全效】發動(見下方 rollSkill_，於 rounds 迴圈與開場對轟各自擲)。
  //   skillFired 只記「本戰至少發動過一次」，供敘述/戰報標示。
  const SKILL_PROC_ = 0.5;
  const _fullSkill = servantActiveSkill_(atkC);  // 完整效果表(或 null＝無真·施放技術)
  let skillFired = false;
  const rollSkill_ = function () {
    if (_fullSkill && Math.random() < SKILL_PROC_) { skillFired = true; return _fullSkill; }
    return null;
  };

  // 🎌 御主參戰風格：御主替從者分擔本戰所受傷害的比例(後方支援0%/見機行事5%/正大光明10%)。masterShared 累計實際分擔血量(供戰報)。
  const _stanceShare = stanceShareOf_(userData.stance);
  let masterShared = 0;

  let knockedOut = [], victory = false, defeat = false, dreamPrompt = "", destroyedName = "", sealEscaped = false, sealNote = "", godRevived = false, godNote = "";
  let enemyNpSpent = false; // 敵寶具一場限一次
  let npTeleHandled = false; // 🔮 本次按鍵的「預告/發動」決策一次即止(rounds loop 多回合勿重複蓄勢)
  let idealRealmFired = false, idealRealmFoe = "", idealRealmSaber = ""; // 🗡️ 理想鄉是否擋下究極寶具(供 AI 敘述＋前端)
  const rounds = [];
  const ctx = { myGameId: myGameId, pIdx: pIdx, userData: userData, homeField: homeField };
  const targetIsFoeServant = String(pcData[nIdx][COL.PC.FACTION]) === "敵從者";
  // 🕯️ 十二試煉·燒命總帳：godNote 只留最後一回合那句，AI 無法自己數「倒下了」出現幾次——
  //   把整戰燒命數(戰前後 lives 差)算好餵給它，並明講「燒命數」與「倒地次數」是兩回事。
  const ghLivesStart = getGodHandLives_(pcData[nIdx][COL.PC.MEMORY]);

  // 🌟 寶具對轟（光與光的對撞）：玩家開場解放寶具、目標為敵從者時，值得一戰的對手以寶具相迎。
  //   雙方先算「寶具火力」→ 高者壓過低者，差額貫穿敗方、勝方僅受少量回震；火力相當(±10%)則相抵僵持。
  //   ★ 對轟輸方不致死：差值再大也只打到 1 HP——英雄倒下前總能拼出最後一口氣。
  let openingNp = useNp, openingSeal = useSeal; // 對轟已用掉開場 NP/令咒威能則清掉，避免回合迴圈重放
  let clash = null;
  if (useNp && targetIsFoeServant && !String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_")) {
    const enemyC0 = rowToCombatant_(pcData[nIdx]);
    // 🥋🔮 對轟中 enemyC0 稍後會反過來當攻方(ePow，見下)，補上其硬連結敵御主的體術/魔術支援。
    const _e0MasterMem = enemyMasterMemoryFor_(pcData, myGameId, pcData[nIdx]);
    if (_e0MasterMem) { injectMasterMeleeSupport_(enemyC0, _e0MasterMem); injectMasterMagicSupport_(enemyC0, _e0MasterMem); }
    // 敵方從未被 setNpChoice_ 寫入選擇，npChoice_ 會退回預設索引0——多寶具敵人(如吉爾伽美什索引0是
    //   對人的王之財寶)須改選最強寶具，與下方「敵反擊」段落同步，避免同場戰鬥前後不一致地低估敵方火力。
    enemyC0.npChoice = bestNpChoice_(enemyC0.name, enemyC0.cls);
    const enemyHasNp = !!String(pcData[nIdx][COL.PC.MARTIAL] || "").trim() && rankVal(enemyC0.six["寶具"] || "-") >= 10;
    // 只有「攻擊型寶具」才對轟；防禦/生存/召喚型(God Hand、summon_horror…)不去抵銷玩家寶具。
    const CLASH_OFF_FX = ['ea', 'excalibur', 'ubw', 'gob', 'gae_bolg', 'tsubame', 'zabaniya', 'petrify', 'chain', 'anti_magic_lance', 'wind_strike', 'projection'];
    const eScaleClash = npAtkScale_(enemyC0);
    const enemyOffensiveNp = enemyHasNp && (eScaleClash === '對軍' || eScaleClash === '對城' || eScaleClash === '對界' || CLASH_OFF_FX.some(function (f) { return hasFx_(enemyC0, f); }));
    const eHpR = (parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1) > 0 ? (parseInt(pcData[nIdx][COL.PC.HP]) || 0) / (parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1) : 1;
    const clashUrge = 0.6 + (hasFx_(enemyC0, 'mad') || hasFx_(enemyC0, 'zabaniya') ? 0.25 : 0) - (1 - eHpR) * 0.3;
    const clashPrana = npPranaCost_(npEffectiveRank_(enemyC0)); // 🎴 吃已選定(bestNpChoice_)寶具的官方階級
    const clashAfford = enemyOffensiveNp ? enemyCanAffordNp_(pcData, nIdx, myGameId, clashPrana) : { afford: false, masterIdx: -1 };
    if (enemyOffensiveNp && clashAfford.afford && Math.random() < clashUrge) {
      drainForNp_(sheets, pcData, nIdx, clashAfford.masterIdx, clashPrana);
      enemyC0.mp = parseInt(pcData[nIdx][COL.PC.MP]) || 0;
      enemyNpSpent = true;
      // 🔮 敵寶具已在對轟中答覆解放 → 消耗其【寶具預告】旗標(原漏清：殘旗會讓下一場無條件再必發＋逃跑背擊誤觸發)
      pcData[nIdx][COL.PC.MEMORY] = clearNpTelegraph_(pcData[nIdx][COL.PC.MEMORY]);
      sheets.pc.getRange(nIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[nIdx][COL.PC.MEMORY]);
      openingNp = false; openingSeal = false;
      enemyC0.output = 100;
      // 🎯 火力取樣用 forceHit：damage 恆屬「攻方」——擲輸時取到的是對面的反殺傷害，會把與寶具威能
      //   無關的噪音帶進對轟比大小，故強制取攻方 damage。
      const pPow = resolveFateBattle_(atkC, enemyC0, { np: true, seal: useSeal, skill: rollSkill_(), forceHit: true }).damage;
      // 敵方火力取樣須補 servantActiveSkill_(敵AI恆全效免費)：burst/str_up/projection 是主動 only 技能，
      //   漏帶會讓持這三技的敵從者開場對轟火力系統性偏低。
      // 💠 對轟中敵寶具轟向我方從者＝七天盾的正戲：注入御主純魔供其展開(削 ePow)，取樣後立即結算費用
      atkC._shieldMp = parseInt(pcData[pIdx][COL.PC.MP]) || 0;
      const ePow = resolveFateBattle_(enemyC0, atkC, { np: true, skill: servantActiveSkill_(enemyC0), forceHit: true }).damage;
      settleShieldMana_(sheets, pcData, pIdx, atkC);
      // ⚡ 對轟裁決：四層特例(雙向因果律/輸方保1/pLethal)收進 Engine_Fate.gs 的純函式 resolveNpClash_
      //   (單一優先序階梯·可單元測試)，這裡只做 I/O：取樣火力→拿決策→落傷。
      const clashRes = resolveNpClash_(
        pPow, ePow,
        parseInt(pcData[atkIdx][COL.PC.HP]) || 0,
        parseInt(pcData[nIdx][COL.PC.HP]) || 0,
        hasCausalityNp_(atkC), hasCausalityNp_(enemyC0)
      );
      const outcome = clashRes.outcome;
      const pDmgTaken = clashRes.pDmg, eDmgTaken = clashRes.eDmg, pLethalOk = clashRes.pLethal;
      const eHit = fateStrike_(sheets, pcData, atkC, nIdx, { forceDamage: eDmgTaken }, ctx);
      if (eHit.destroyed) destroyedName = eHit.destroyed;
      if (eHit.knocked) knockedOut.push(eHit.knocked);
      if (eHit.sealEscaped) { sealEscaped = true; sealNote = eHit.sealNote; }
      if (eHit.godRevived) { godRevived = true; godNote = eHit.godNote; }
      if (eHit.victory) { victory = true; dreamPrompt = eHit.dreamPrompt; }
      if (!sealEscaped) {
        // ★ 對轟【回震】不致死(勝方/僵持方吃的是餘波)：夾到至多打到 1 HP，避免「同一場先記勝又記敗」的
        //   勝敗雙記。輸方(outcome='enemy')在上方已同樣保 1；唯獨敵方因果律截斷(pLethalOk)是刻意例外
        //   ——那本就該真的打死(死亡在投擲前已確定)，不能被這道通用保命線攔下，否則會架空必死分支。
        const spill0 = (destroyedName && !pLethalOk) ? Math.round(pDmgTaken * 0.5) : pDmgTaken;
        const spill = pLethalOk ? spill0 : Math.min(spill0, Math.max(0, (parseInt(pcData[atkIdx][COL.PC.HP]) || 1) - 1));
        const pHit = fateStrike_(sheets, pcData, enemyC0, atkIdx, { forceDamage: spill }, ctx);
        if (pHit.destroyed && pHit.knocked) knockedOut.push(pHit.knocked);
        if (pHit.defeat) { defeat = true; victory = false; dreamPrompt = pHit.dreamPrompt; }
        // 🎌 御主參戰風格·對轟回震也替從者分擔(非致命時)
        else if (spill > 0) { const _shC = applyMasterStanceShare_(sheets, pcData, atkIdx, pIdx, spill, _stanceShare); if (_shC) masterShared += _shC; }
      }
      clash = {
        outcome: outcome, pPow: pPow, ePow: ePow, pDmgTaken: pDmgTaken, eDmgTaken: eDmgTaken,
        enemyNp: String(pcData[nIdx][COL.PC.MARTIAL] || ""),
        atkHp: parseInt(pcData[atkIdx][COL.PC.HP]) || 0, atkHpMax: parseInt(pcData[atkIdx][COL.PC.MAX_HP]) || 0,
        defHp: parseInt(pcData[nIdx][COL.PC.HP]) || 0, defHpMax: parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 0
      };
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

  // 🤝 敵盟·協防（同盟功能·敵方版）：你攻擊的敵從者，其御主若與另一敵御主締有【敵盟】(未逾期)，且該盟友御主的
  //   從者同地在場→盟友從者每回合替其反擊我方一記（敵版協同強襲，讓敵盟在正面戰鬥真的有分量）。
  let pactDefIdx = -1, pactDefName = "";
  if (targetIsFoeServant) {
    const _tgtMaster = getServantMaster_(pcData[nIdx][COL.PC.MEMORY]); // 被攻擊敵從者的御主名
    const _mRow = _tgtMaster ? pcData.find(r => String(r[COL.PC.FACTION]) === "敵御主" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && nameLoose_(r[COL.PC.NAME]) === nameLoose_(_tgtMaster)) : null;
    const _pact = _mRow ? getEnemyPact_(_mRow[COL.PC.MEMORY]) : null;
    const _curDay = ((getClock_(myGameId, pcData) || {}).day) || 1;
    if (_pact && _pact.until >= _curDay) {
      const _defLoc = String(pcData[nIdx][COL.PC.LOC]).trim();
      pactDefIdx = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "敵從者" && String(r[COL.PC.GAME_ID] || "") === myGameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC]).trim() === _defLoc && r[COL.PC.ID] != pcData[nIdx][COL.PC.ID] && !isAllied_(r) && nameLoose_(getServantMaster_(r[COL.PC.MEMORY])) === nameLoose_(_pact.partner));
      if (pactDefIdx !== -1) pactDefName = String(pcData[pactDefIdx][COL.PC.NAME]);
    }
  }


  // 🐙 螺湮城教本(變身框架)：青鬍子解放寶具【或戰前召喚】→ 深淵海怪在場(狀態存 MEMORY·無期限·魔力維持制)。
  //   在場則：以肉身擋傷(fateStrike_)＋每回合再生＋並肩追擊(每交鋒回合抽 HORROR_UPKEEP)＋本體防禦升對城規模(npDefScale)；
  //   場外每小時另抽 HORROR_HOURLY_UPKEEP(applyRegen_·池赤字海怪先沉)。★寶具解放當下(重新)召喚·刷新肉身；已在場則沿用。
  if (useNp && hasFx_(atkC, 'summon_horror')) {
    pcData[atkIdx][COL.PC.MEMORY] = summonHorror_(pcData[atkIdx][COL.PC.MEMORY], myGameId);
    sheets.pc.getRange(atkIdx + 1, 1, 1, pcData[atkIdx].length).setValues([pcData[atkIdx]]);
    atkC.horrorUp = true; // 反映到本場已建好的 atkC(後續回合的 sC 由 rowToCombatant_ 讀新 MEMORY 自然帶旗)
  }
  let horrorActive = horrorPresent_(pcData[atkIdx][COL.PC.MEMORY], myGameId); // 召喚當下 or 先前已召喚未解除 → 在場
  // 深淵海怪的「肉身血池」＝海怪護盾(setHorrorShield_)；此 horrorC 的 hp 僅追擊判定用、肉身存亡看護盾。
  const horrorC = horrorActive ? {
    name: '深淵海怪', cls: 'Berserker', np: '',
    six: { 筋力: 'A', 耐久: 'A', 敏捷: 'C', 魔力: 'E', 幸運: 'E', 寶具: '-' },
    skills: [], traits: [{ n: '巨獸' }], output: 100,
    hp: HORROR_SHIELD_HP, hpMax: HORROR_SHIELD_HP, mp: 0, mpMax: 0
  } : null;

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
      injectMasterMeleeSupport_(sC, pcData[pIdx][COL.PC.MEMORY]); // 🥋 御主體術參戰（每回合出擊）
      injectMasterMagicSupport_(sC, pcData[pIdx][COL.PC.MEMORY]); // 🔮 御主魔術支援（每回合出擊·僅Caster）
      injectHomeField_(sC, homeField);                     // 🏰 主場·陣地結界
      const isActive = (sidx === atkIdx);
      // npOverloadMul/overcharge 只設在 atkC 上、不存進 MEMORY，而 sC 是每回合重新建的新物件讀不到——
      //   除了對轟分支直接用 atkC 外，一般路徑(多數情況)都走這條每回合迴圈用 sC 結算，需手動複製過去，
      //   否則玩家已付超載代價卻吃不到超載倍率/過充加成。
      if (isActive && opening && openingNp) { sC.npOverloadMul = atkC.npOverloadMul; sC.overcharge = atkC.overcharge; }
      const ps = fateStrike_(sheets, pcData, sC, nIdx, { np: opening && openingNp && isActive, seal: opening && openingSeal && isActive, ambush: opening && isActive, skill: isActive ? rollSkill_() : null, round: rd + 1 }, ctx);
      // 目標為敵御主(非從者)：引擎計算了反傷 fired 但不套用，過濾掉「winner·武器骰」等傷害計算噪音
      const _pFiredClean = isMasterTarget
        ? (ps.fired || []).filter(function (t) { return !/·武器骰|·出力\d/.test(String(t)); })
        : (ps.fired || []);
      rl.strikes.push({ by: sC.name, pRoll: ps.aRoll, pHitVal: ps.aHit, dRoll: ps.dRoll, dEvaVal: ps.dEva, pHit: ps.hit, pDmg: ps.hit ? ps.damage : 0, pCrit: ps.crit, pFired: _pFiredClean, note: ps.sealNote || ps.godNote || "" });
      if (ps.destroyed) destroyedName = ps.destroyed;
      if (ps.knocked) knockedOut.push(ps.knocked);
      if (ps.sealEscaped) { sealEscaped = true; sealNote = ps.sealNote; }
      if (ps.godRevived) { godRevived = true; godNote = ps.godNote; }
      if (ps.victory) { victory = true; dreamPrompt = ps.dreamPrompt; }
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
        horrorActive = false; // 海怪肉身潰散/逾時 → 退場
        // 🐙 清 MEMORY 殘影(逾時的護盾字串仍在)：讓後續 horrorUp/城防歸位·單一真實來源
        if (/【海怪護盾】/.test(String(pcData[atkIdx][COL.PC.MEMORY] || ""))) {
          pcData[atkIdx][COL.PC.MEMORY] = clearHorrorShield_(pcData[atkIdx][COL.PC.MEMORY]);
          sheets.pc.getRange(atkIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[atkIdx][COL.PC.MEMORY]);
        }
      }
    }

    // 🐙 深淵海怪追擊：青鬍子寶具召喚物，常駐每回合撕咬敵手——先扣御主魔力維持，撐不住則潰散退場。
    if (horrorActive && targetIsFoeServant && !String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_") && !destroyedName && !sealEscaped && !victory) {
      const hUp = drainForNp_(sheets, pcData, atkIdx, pIdx, HORROR_UPKEEP);
      if (hUp.shortfall > 0) {
        horrorActive = false;
        // 🐙 維持費付不出 → 海怪潰散，清肉身狀態(不留殘影·下場不再誤判在場)
        pcData[atkIdx][COL.PC.MEMORY] = clearHorrorShield_(pcData[atkIdx][COL.PC.MEMORY]);
        sheets.pc.getRange(atkIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[atkIdx][COL.PC.MEMORY]);
        rl.strikes.push({ by: '🐙深淵海怪', horror: true, pHit: false, pDmg: 0, pCrit: '', pFired: [], note: '御主魔力枯竭·海怪潰散退場' });
      } else {
        const hs = fateStrike_(sheets, pcData, horrorC, nIdx, { round: rd + 1 }, ctx);
        rl.strikes.push({ by: '🐙深淵海怪', horror: true, pRoll: hs.aRoll, pHitVal: hs.aHit, dRoll: hs.dRoll, dEvaVal: hs.dEva, pHit: hs.hit, pDmg: hs.hit ? hs.damage : 0, pCrit: hs.crit, pFired: hs.fired, note: '深淵海怪·觸手撕咬' });
        if (hs.destroyed) destroyedName = hs.destroyed;
        if (hs.knocked) knockedOut.push(hs.knocked);
        if (hs.godRevived) { godRevived = true; godNote = hs.godNote; }
        if (hs.victory) { victory = true; dreamPrompt = hs.dreamPrompt; }
        if (hs.sealEscaped) { sealEscaped = true; sealNote = hs.sealNote; }
      }
    }

    // 🤝 盟友協同助攻一擊（共同敵人尚存活、本回合未分勝負才出手）
    if (allyAtkIdx !== -1 && !String(pcData[allyAtkIdx][COL.PC.ID]).startsWith("DEAD_")
        && !String(pcData[nIdx][COL.PC.ID]).startsWith("DEAD_") && !destroyedName && !sealEscaped && !victory) {
      const allyC = rowToCombatant_(pcData[allyAtkIdx]);
      const aps = fateStrike_(sheets, pcData, allyC, nIdx, { noMeal: true, round: rd + 1 }, ctx); // 盟友非御主一行·不吃整備餐
      rl.strikes.push({ by: allyC.name, ally: true, pRoll: aps.aRoll, pHitVal: aps.aHit, dRoll: aps.dRoll, dEvaVal: aps.dEva, pHit: aps.hit, pDmg: aps.hit ? aps.damage : 0, pCrit: aps.crit, pFired: aps.fired, note: "盟友協同" });
      if (aps.destroyed) destroyedName = aps.destroyed;
      if (aps.knocked) knockedOut.push(aps.knocked);
      if (aps.victory) { victory = true; dreamPrompt = aps.dreamPrompt; }
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
        // 🥋🔮 敵從者本回合出擊(對玩家)：補上其硬連結敵御主的體術/魔術支援，讓敵御主的能力真的算進傷害。
        const _eNowMasterMem = enemyMasterMemoryFor_(pcData, myGameId, pcData[nIdx]);
        if (_eNowMasterMem) { injectMasterMeleeSupport_(enemyNow, _eNowMasterMem); injectMasterMagicSupport_(enemyNow, _eNowMasterMem); }
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
            const ePranaT = npPranaCost_(npEffectiveRank_(enemyNow)); // 🎴 吃已選定寶具的官方階級
            if (enemyCanAffordNp_(pcData, nIdx, myGameId, ePranaT).afford) {
              pcData[nIdx][COL.PC.MEMORY] = setNpTelegraph_(pcData[nIdx][COL.PC.MEMORY]);
              sheets.pc.getRange(nIdx + 1, 1, 1, pcData[nIdx].length).setValues([pcData[nIdx]]);
              rl.eTelegraph = String(pcData[nIdx][COL.PC.MARTIAL] || "").split(/[（(／]/)[0].trim() || defC.name; // 前端/AI 警告用
              npTeleHandled = true;
            }
          }
          // 🔋 敵寶具也要吃魔力：自身 MP＋敵御主電池須付得起 prana，否則放不出（EX/EA 幾乎沒人付得起→極罕見）
          if (enemyFireNp) {
            const ePrana = npPranaCost_(npEffectiveRank_(enemyNow)); // 🎴 同上
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
          rl.eHit = false; rl.eDmg = 0; rl.eNp = true; rl.eTarget = String(pcData[ctgt][COL.PC.NAME]); rl.idealBlock = true;
          rl.eFired = [`「${enemyNow.name}」的究極真名解放 vs 「${pcData[ctgt][COL.PC.NAME]}」·理想鄉——Avalon 展開隔絕於世界之外的無敵結界(概念 7 階·凌駕一切)，連斬裂世界的一擊亦盡數湮滅（御主耗 100 魔）`];
          idealRealmFired = true; idealRealmFoe = String(enemyNow.name); idealRealmSaber = String(pcData[ctgt][COL.PC.NAME]);
        } else {
          // 🎯 敵AI無主動技按鈕→自動施展其招牌施放技術(魔力放出/怪力/投影)，免費(視為其戰鬥本色)——
          //   精確還原「改制前這些是免費被動」的敵方戰力，避免單層歸屬後悄悄削弱敵人(玩家側才改為主動付魔)。
          const eSkill = servantActiveSkill_(enemyNow);
          const es = fateStrike_(sheets, pcData, enemyNow, ctgt, { counterMul: enemyFireNp ? 1.0 : 0.85, np: enemyFireNp, skill: eSkill, round: rd + 1 }, ctx);
          rl.eHit = es.hit; rl.eRoll = es.aRoll; rl.eHitVal = es.aHit; rl.eDmg = es.hit ? es.damage : 0; rl.eFired = es.fired; rl.eTarget = String(pcData[ctgt][COL.PC.NAME]); rl.eNp = enemyFireNp;
          if (es.defeat) { defeat = true; victory = false; dreamPrompt = es.dreamPrompt; }
          // 🎌 御主參戰風格·替從者分擔：只在從者挨了非致命一擊時，御主討回 share 比例的傷勢自己扛。
          else if (es.hit && rl.eDmg > 0) { const _sh = applyMasterStanceShare_(sheets, pcData, ctgt, pIdx, rl.eDmg, _stanceShare); if (_sh) { masterShared += _sh; rl.masterShared = (rl.masterShared || 0) + _sh; } }
        }
      }
    }

    // 🤝 敵盟·協防反擊：被攻擊者的敵盟夥伴每回合替其回擊我方一記（雙方尚未分勝負才出手；純普攻·不解放寶具）
    if (pactDefIdx !== -1 && !String(pcData[pactDefIdx][COL.PC.ID]).startsWith("DEAD_") && !defeat && !victory && !destroyedName && !sealEscaped) {
      let ctgt2 = atkIdx;
      if (String(pcData[ctgt2][COL.PC.ID]).startsWith("DEAD_")) { const alt2 = partyIdxs.find(i => !String(pcData[i][COL.PC.ID]).startsWith("DEAD_")); if (alt2 != null) ctgt2 = alt2; }
      if (!String(pcData[ctgt2][COL.PC.ID]).startsWith("DEAD_")) {
        const pdC = rowToCombatant_(pcData[pactDefIdx]);
        const _pdMem = enemyMasterMemoryFor_(pcData, myGameId, pcData[pactDefIdx]);
        if (_pdMem) { injectMasterMeleeSupport_(pdC, _pdMem); injectMasterMagicSupport_(pdC, _pdMem); }
        const pds = fateStrike_(sheets, pcData, pdC, ctgt2, { counterMul: 0.85, skill: servantActiveSkill_(pdC), round: rd + 1 }, ctx);
        rl.pactDef = { name: pdC.name, hit: pds.hit, dmg: pds.hit ? pds.damage : 0, target: String(pcData[ctgt2][COL.PC.NAME]) };
        if (pds.defeat) { defeat = true; victory = false; dreamPrompt = pds.dreamPrompt; }
        // 🎌 御主參戰風格·連協防這記也替從者分擔(非致命時)
        else if (pds.hit && rl.pactDef.dmg > 0) { const _sh2 = applyMasterStanceShare_(sheets, pcData, ctgt2, pIdx, rl.pactDef.dmg, _stanceShare); if (_sh2) { masterShared += _sh2; rl.masterShared = (rl.masterShared || 0) + _sh2; } }
      }
    }

    rounds.push(rl);
    if (defeat) break;
  }

  // 戰報摘要（含寶具對轟的傷害）
  const totalDealt = rounds.reduce((s, r) => s + (r.strikes || []).reduce((a, k) => a + (k.pDmg || 0), 0), 0) + (clash ? (clash.eDmgTaken || 0) : 0);
  // 受創含敵盟協防那記(rl.pactDef.dmg)——否則「受創X − 御主替扛Y」對不上從者實際血量掉幅(協防傷也走 masterShared)。
  const totalTaken = rounds.reduce((s, r) => s + (r.eDmg || 0) + (r.pactDef && r.pactDef.hit ? (r.pactDef.dmg || 0) : 0), 0) + (clash ? (clash.pDmgTaken || 0) : 0);
  const nRounds = rounds.length;
  const atkLabel = dualAttack ? `${atkC.name} 與另一名從者協同` : atkC.name;
  const roundsBrief = rounds.map(r =>
    `第${r.n}回合：` + (r.strikes || []).map(k => `${k.by}${k.pHit ? `命中(−${k.pDmg})` : '揮空'}${k.note ? `【${String(k.note).replace(/\n/g, ' ')}】` : ''}`).join('、') +
    (targetIsFoeServant ? (r.eDmg ? `，「${defC.name}」回擊${r.eTarget ? `「${r.eTarget}」` : ''}(−${r.eDmg})` : (r.eHit === false ? `，「${defC.name}」反擊被擋` : '')) : '') +
    (r.eTelegraph ? `　⚠️敵「${defC.name}」真名解放的預兆匯聚·寶具蓄勢待發(下次接觸必傾瀉)` : '')
  ).join('\n');
  const npTelegraphed = rounds.some(r => r.eTelegraph); // 🔮 本戰敵寶具進入預告→AI 演出＋前端保底警告
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
  let enemyMasterCardStr = enemyMasterRow ? enemyMasterCard_(enemyMasterRow) : "";
  // 🎭 關係錨：明說在場敵御主與「defC」的契約關係——否則兩人在提示詞裡只是不相干的名詞，AI 演不出
  //   「自己的從者在眼前交戰/被消滅」的切身衝擊，只會照性格詞即興出「冷眼旁觀」的類型套路。
  if (enemyMasterCardStr && !isMasterTarget) {
    enemyMasterCardStr += `★上述敵御主正是「${defC.name}」的契約御主——自己的從者正在眼前搏命交戰，戰局每一刀都切身相關。\n`;
    // 🎭 戰局實況錨點：光有性格/關係卡沒有戰況資訊，AI 容易讓敵御主反應跟當下實際戰況脫節。把已算好的
    //   HP比例/傷害交換即時算成一句白話戰況，逼反應對應當下真實場面。
    const _defHpNow = parseInt(pcData[nIdx][COL.PC.HP]) || 0, _defHpMaxNow = parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 1;
    const _hpRatioNow = _defHpMaxNow > 0 ? _defHpNow / _defHpMaxNow : 1;
    const _situText = defeat ? '己方從者完全壓制、我方從者早已潰敗'
      : destroyedName ? '己方從者剛親手終結了對面戰力'
        : _hpRatioNow <= 0.25 ? '己方從者身陷重創、命懸一線，情勢危急'
          : _hpRatioNow <= 0.55 ? '己方從者已見劣勢、傷勢漸重'
            : (totalTaken > totalDealt * 1.3) ? '己方從者正壓著對方打、明顯佔上風'
              : (totalDealt > totalTaken * 1.3) ? '己方從者略顯吃力、被壓著打'
                : '雙方勢均力敵、勝負未有定論';
    enemyMasterCardStr += `★【戰局實況】此刻真實情勢是：${_situText}——敵御主的神態/語氣/台詞必須讀懂這個場面(得意、焦慮、強撐、嘲諷、動搖皆可，由性格決定怎麼反應，但反應內容不可無視當下戰況自說自話)。\n`;
  }
  // 🎭 敵從者演出卡：附上敵從者卡，讓性格/口吻/狂化禁言有依據，而非全靠 AI 憑真名即興；
  //   同一張 servantCard_，狂化「嚴禁台詞」鐵則對敵方一併生效。
  const foeServantCardStr = targetIsFoeServant ? '〔敵方出戰者〕' + servantCard_(pcData[nIdx]) : "";

  // 💥 本次解放寶具的【真名】(多寶具取所選那把)：拆中文／原名供戰報橫幅＋AI 高呼。寶具解放必唸真名。
  let npName = null;
  if (useNp) {
    try {
      atkC.npChoice = (userData.npChoice != null ? userData.npChoice : npChoice_(pcData[atkIdx][COL.PC.MEMORY]));
      const _npFull = String(npProfile_(atkC).name || atkC.np || "").split(/[（(／]/)[0].trim();
      const _m = _npFull.match(/^([^A-Za-z]+?)\s*([A-Za-z][A-Za-z0-9 :·'’.\-]*)?$/);
      npName = { zh: (_m && _m[1] ? _m[1].trim() : _npFull), en: (_m && _m[2] ? _m[2].trim() : "") };
    } catch (e) { npName = null; }
  }

  let aiPrompt;
  // 🎬 敘述：給 AI【事實素材】，少下指令——讓它自己演。只保留必要紅線(show-don't-tell／勿擅自寫死)。
  const horrorFired = rounds.some(r => (r.strikes || []).some(k => k.horror));
  // 🎴 每擊 pFired 陣列存了戰鬥中觸發的特殊機制旗標；十二試煉／令咒脫離已各自走專屬素材行
  //   (godNote/sealNote)，但「戰鬥續行」(致命傷卻硬撐留1)／「斬斷救贖」(此類護命效果被破戒/反魔力
  //   兵裝之類的手段強行突破)這兩種只進了 pFired、從沒進過 aiPrompt——AI 看不出「這下明明該死卻沒死」
  //   或「原本免死的招式這次被打穿了」的關鍵轉折，收攏成一句素材補上。
  const extraFired = [];
  rounds.forEach(r => (r.strikes || []).forEach(k => (k.pFired || []).forEach(t => {
    const s = String(t || "");
    if (/·戰鬥續行|·斬斷救贖/.test(s) && extraFired.indexOf(s) < 0) extraFired.push(s);
  })));
  // 🥋🔮 御主體術/魔術參戰：跟上面同一種「有記錄沒講給AI聽」的落差——這兩個 fx 每擊都可能悄悄加傷害，
  //   卻從沒被塞進 aiPrompt，AI 完全不知道御主動手了，只能憑空演出御主在旁乾看/捏著寶石不出手的空氣戲。
  //   我方出擊的 fired 進 strikes[].pFired；敵方反擊的 fired 是獨立存在 rl.eFired(不在 strikes[] 裡)，
  //   兩邊各自查，才不會漏掉敵御主(如凜的魔術)明明在戰報數字裡出力、敘述卻對此隻字不提。
  const ourMeleeFired = rounds.some(r => (r.strikes || []).some(k => (k.pFired || []).some(t => /·御主體術/.test(String(t)))));
  const ourMagicFired = rounds.some(r => (r.strikes || []).some(k => (k.pFired || []).some(t => /·御主魔術/.test(String(t)))));
  const foeMeleeFired = rounds.some(r => (r.eFired || []).some(t => /·御主體術/.test(String(t))));
  const foeMagicFired = rounds.some(r => (r.eFired || []).some(t => /·御主魔術/.test(String(t))));
  if (defeat) {
    aiPrompt = servantCard_(pcData[atkIdx]) + foeServantCardStr + enemyMasterCardStr +
      `【戰報·已裁定】御主號令『${atkC.name}』與「${defC.name}」鏖戰 ${nRounds} 回合。\n${roundsBrief}\n結局：『${atkC.name}』靈基崩潰、化作光點消散，御主敗北。\n` +
      `★以 Fate／TYPE-MOON 筆觸演出這場敗北的最後一幕(一段即可)${atkC.cls === 'Caster' ? '（Caster 以魔術轟擊為主、非肉搏）' : ''}，語氣留白。勝負已定，你只演過程。`;
  } else {
    aiPrompt = servantCard_(pcData[atkIdx]) + foeServantCardStr + enemyMasterCardStr +
      `【戰報·已裁定，勝負與傷害不可改】御主號令${atkLabel}出擊，與「${defC.name}」交鋒 ${nRounds} 回合。\n` +
      `${roundsBrief}\n我方造成 ${totalDealt} 傷害、受創 ${totalTaken}。${finalLine}\n` +
      `── 本戰發生的事(素材，自行織入畫面，勿複述標籤名) ──\n` +
      (useSeal ? `· 御主燃燒一道令咒·絕對命令，強令此擊必中、引爆超限戰力。\n` : "") +
      (clash ? `· 寶具對轟：${clash.outcome === 'causality' ? `因果律先行截斷——『${atkC.name}』的死亡詛咒在敵方寶具解放之前便已降臨，敵 NP 殘波極微。` : clash.outcome === 'player' ? '我方威能壓過對手。' : clash.outcome === 'enemy' ? '對面威能壓過我方（從者以鋼鐵意志撐住）。' : '勢均力敵、轟然相抵、雙方震退。'}\n` : (useNp ? (hasFx_(atkC, 'mad')
        ? `· ${atkC.name} 解放了寶具【${npName ? (npName.zh + (npName.en ? '　' + npName.en : '')) : '真名'}】——★此從者已狂化、無法詠唱：解放是咆哮與本能的爆發，旁白可呈現真名與威能，但【嚴禁】讓其開口唸出任何字句。\n`
        : `· ${atkC.name} 高呼真名【${npName ? (npName.zh + (npName.en ? '　' + npName.en : '')) : '真名'}】、解放了寶具——★演出時務必讓其【親口唸出這個真名】(中文真名與原名並呼、氣勢拉滿)，這是 Fate 寶具解放的靈魂。\n`) : "")) +
      ((useNp && atkC.npOverloadMul && atkC.npOverloadMul > 1.25) ? `· 【灌魔超載】御主${atkC.npOverloadMul >= 1.9 ? '把餘裕魔力盡數傾注' : '將大量魔力加壓灌注'}這一發真名解放${atkC.overcharge ? '（方才補魔蓄積的澎湃魔力一併傾瀉而出）' : ''}——寶具威能被推至${atkC.npOverloadMul >= 1.9 ? '極限、化作規格外的毀滅光輝' : '遠超尋常的輝度'}。演出這股${atkC.npOverloadMul >= 1.9 ? '「傾盡一切、超載解放」的壯烈與光壓' : '「加壓超載」的灼熱光壓'}。\n` : "") +
      (backlash ? `· 【過載反噬】倍額魔力灌注的代價在解放後湧回——御主魔術迴路暴走灼身(−${backlash.dmg} HP)，強撐住了意識。★這是迴路過載的內在劇痛與虛脫，非外傷流血，切勿描寫成血流滿地。\n` : "") +
      (skillFired ? `· 交鋒間，我方從者的技術「${_fullSkill.name}」自然而發、順勢加持了攻勢。\n` : "") +
      (masterShared > 0 ? `· 【御主參戰·正大光明／見機行事】御主未躲在後方，而是立於陣前一同承擔——替從者硬扛下 ${masterShared} 點傷勢(御主自身流血受創)。演出御主涉險共戰、以身擋傷的擔當(這是內在覺悟與肉身代價，數值已由 GAS 結算)。\n` : "") +
      (horrorFired ? `· 我方術師以螺湮城教本自深淵召出觸手巨獸「深淵海怪」，常駐戰場、每回合與本人並肩撕咬，靠御主魔力維持(枯竭則潰散)。\n` : "") +
      (dualAttack ? `· 我方兩名從者並肩夾擊同一敵手。\n` : "") +
      (allyAssistName ? `· 盟友從者「${allyAssistName}」依約自側翼掩護助攻。\n` : "") +
      (pactDefName ? `· 敵方盟友「${pactDefName}」（與「${defC.name}」的御主締有密約）並肩馳援、替其反擊我方——你攻其一，兩敵同禦。\n` : "") +
      (npTelegraphed ? `· 「${defC.name}」的靈基驟然高鳴——真名解放的預兆正急速匯聚、殺意如實質般壓來，寶具即將出鞘卻【尚未發動】。演出這股「山雨欲來、下一擊便是真名解放」的窒息壓迫感，讓御主明白必須當機立斷。\n` : "") +
      (homeField ? `· 【主場·陣地】這場交鋒發生在我方 Caster 親手佈設的陣地之中——魔術防壁、結界與布下的機關層層環伺，這裡是法師的堡壘。我方全員承其庇護、受創大減；敵手則在滿是術式的敵境中步步受制。演出「引敵入陣地決戰」的主場壓制感。\n` : "") +
      (idealRealmFired ? `· 【理想鄉】「${idealRealmFoe}」傾盡全力解放了斬裂世界／碾穿一切的究極真名，然而在觸及「${idealRealmSaber}」的剎那，全世界遙遠的理想鄉 Avalon 悄然展開——那是隔絕於世界之外、永不凋零的無敵結界。究極寶具的威能盡數湮滅於金色的理想鄉中，「${idealRealmSaber}」毫髮無傷。演出這一擋的神聖、靜謐與絕對，御主付出大量魔力方換得此護。\n` : "") +
      ((battery && battery.usedBattery) ? `· 御主電池：${battery.bledMaster ? `御主燃燒生命力硬扛魔力缺口，魔術迴路過載灼痛難當(餘 ${battery.masterHp}/${battery.masterHpMax} HP)——★這是迴路透支的內在劇痛與虛脫，非外傷流血，切勿描寫成血流滿地或皮肉傷` : `御主順暢導流自身魔力(無焚血、無透支)——★本次供魔從容有餘，勿寫成迴路焚燒/殘存魔力/瀕死透支等慘狀(那是先前戰鬥的舊事)`}為從者頂上魔力缺口。\n` : "") +
      (godRevived ? (() => { let godTally = ""; try { const ghNow = getGodHandLives_(pcData[nIdx][COL.PC.MEMORY]); const ghBurn = Math.max(0, ghLivesStart - ghNow); if (ghBurn > 0) godTally = `★本戰共燒去 ${ghBurn} 條命、尚餘 ${ghNow}；「燒命數」與「倒地站起的次數」是兩回事(單擊可一口氣燒多命)，勿混寫成同一個數。`; } catch (e) { } return `· 十二試煉：${godNote}${godTally}\n`; })() : "") +
      (sealEscaped ? `· 對面御主燃令咒、強行扯離重傷從者，敵已遁走不在場。${sealNote}★此撤離僅止於該從者及其本主，與在場其他御主／從者無關。\n` : "") +
      ((destroyedName && targetIsFoeServant && enemyMasterRow && !isMasterTarget) ? `· 在場敵御主「${String(enemyMasterRow[COL.PC.NAME])}」親眼目睹自己契約的從者靈基崩潰、化作光點消散——失去從者＝失去依靠與這場戰爭的資格。★依其性格與身世演出這一刻的衝擊與反應(崩潰/嘶喊/怔忡/強撐皆可，由性格定)，非沉默背景板。\n` : "") +
      ((!destroyedName && !sealEscaped && !godRevived) ? `· 敗方尚有餘力(見上方 HP)，勿描寫死亡／消滅／屍體。此乃御主下令出擊、雙方仍在交鋒中，下回合是否再戰仍由御主決定。\n` : "") +
      (atkC.cls === 'Caster' ? `· 出戰從者為 Caster（魔術師）職階：此戰以魔術轟擊為主、非肉搏，演出時勿讓其上前近戰。\n` : "") +
      (extraFired.length ? `· 戰局關鍵轉折：${extraFired.join('；')}。\n` : "") +
      (ourMeleeFired ? `· 我方御主親自出手體術助拳，這場交鋒的攻勢不全是『${atkC.name}』一人之力。\n` : "") +
      (ourMagicFired ? `· 我方御主暗中引動自身魔術支援這一擊，攻勢裡混著御主自己的魔力。\n` : "") +
      (foeMeleeFired ? `· 對面御主同樣親自體術助陣，敵方這回合的攻勢摻著御主自己的招式，並非「${defC.name}」隻身出手。\n` : "") +
      (foeMagicFired ? `· 對面御主也在暗中以魔術支援，敵方這回合的攻勢不全是「${defC.name}」一人所為。\n` : "") +
      // 🗡️ 戰鬥未分生死時，讓從者依性格對這回交手給出主觀判斷/建議——純角色觀察與口吻，不是戰略指令；
      //   狂化角色改用肢體/低吼傳達，服從 servantCard_ 已內建的「嚴禁完整台詞」鐵則。
      ((!destroyedName && !sealEscaped && !godRevived) ? (hasFx_(atkC, 'mad')
        ? `★戰後讓「${atkC.name}」以其已狂化的方式(低吼／肢體動作／神情)透出對這場交手的直覺判斷，不成篇整句台詞。\n`
        : `★戰後讓「${atkC.name}」依其性格與口吻，對這場交鋒給出簡短的主觀判斷或建議(如看出的破綻、對方寶具是否已現底牌、值得乘勝追擊還是該見好就收)——是角色的觀察與建議，不是戰略指令，下一步仍由御主按鍵定奪。\n`) : "") +
      `★以 Fate／TYPE-MOON 筆觸演出這 ${nRounds} 回合互有攻防的交鋒(約 220~280 字)：show, don't tell，把上列事實化為畫面與張力，技能/寶具演其威能而非報菜名。`;
  }

  // 📊 給前端的多回合視覺戰報
  const report = {
    atk: atkLabel, def: defC.name, rounds: rounds, dual: dualAttack, allyAssist: allyAssistName,
    useNp: useNp, npName: npName, useSeal: useSeal, totalDealt: totalDealt, totalTaken: totalTaken,
    masterShared: masterShared, // 🎌 御主參戰風格·本戰替從者分擔的血量(0＝後方支援或未觸發)→前端戰報卡
    overload: (useNp && atkC.npOverloadMul && atkC.npOverloadMul > 1.01) ? +atkC.npOverloadMul.toFixed(2) : 0, // 🔥 灌魔超載倍率→前端橫幅
    overcharge: !!(useNp && atkC.overcharge), // 🔥 本發吃到補魔過充
    backlash: backlash, // ⚡🩸 過載反噬 {dmg,hp,hpMax}→前端紅幅(不致死·純資源傷害)

    destroyed: destroyedName || "", godRevived: godRevived, sealEscaped: sealEscaped, victory: victory, defeat: defeat,
    telegraph: npTelegraphed ? String(defC.name) : "", // 🔮 敵寶具預告→前端彈紅框警告
    homeField: homeField || "", // 🏰 主場·陣地結界階級(在自己陣地決戰)→前端標示

    idealRealm: idealRealmFired ? { foe: idealRealmFoe, saber: idealRealmSaber } : null, // 🗡️ 理想鄉擋下究極寶具→前端金框

    defHp: parseInt(pcData[nIdx][COL.PC.HP]) || 0, defHpMax: parseInt(pcData[nIdx][COL.PC.MAX_HP]) || 0,
    atkHp: parseInt(pcData[atkIdx][COL.PC.HP]) || 0, atkHpMax: parseInt(pcData[atkIdx][COL.PC.MAX_HP]) || 0,
    battery: (battery && battery.usedBattery) ? { fromMasterMp: battery.fromMasterMp, fromMasterHp: battery.fromMasterHp, bledMaster: battery.bledMaster, masterHp: battery.masterHp, masterHpMax: battery.masterHpMax } : null,
    skill: skillFired ? { name: _fullSkill.name, icon: _fullSkill.icon, desc: _fullSkill.desc } : null,
    clash: clash,
    masterHp: parseInt(pcData[pIdx][COL.PC.HP]) || 0, masterHpMax: parseInt(pcData[pIdx][COL.PC.MAX_HP]) || 0,
    party: partyIdxs.map(i => ({ name: String(pcData[i][COL.PC.NAME]), hp: parseInt(pcData[i][COL.PC.HP]) || 0, hpMax: parseInt(pcData[i][COL.PC.MAX_HP]) || 0 }))
  };

  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：主戰鬥路徑所有寫入(fateStrike_/drainForNp_/spendAp_/raiseBond_/對轟/預告旗標)皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({
    success: true, aiPrompt: aiPrompt, knockedOut: knockedOut,
    victory: victory, defeat: defeat, dreamPrompt: dreamPrompt,
    sealEscaped: sealEscaped, report: report,
    clock: isFateBattle ? clockLabel_(myGameId, pcData) : "", ap: battleAp, apMax: AP_PER_DAY,
    statusString: buildPlayerStatusString(pcData[pIdx]) // ⚡ pcData 即權威，免 getFreshStatusString 的整表重讀
  });
}

// 🐙 戰前召喚·螺湮城教本：不進戰鬥、先自深淵召出「深淵海怪」變身態（無期限·魔力維持制）。
//   持 summon_horror 的我方從者→付寶具 prana(御主電池·同解放)＋耗 1AP。
//   在場則：以肉身擋傷＋每回合再生＋並肩追擊(每交鋒回合抽 10 魔)＋本體防禦升對城規模；
//   場外每小時另抽 HORROR_HOURLY_UPKEEP 魔(applyRegen_·池赤字時海怪先沉回深淵、才輪到御主燃血)。
//   玩家可隨時「解除召喚」(actionDismissHorror·免費即時)止住時耗；重召須再付全額 prana。
//   ★這是「變身框架」的戰前入口——日後其它變身技(靈基二階段等)照此模式加一個 action 即可。
function actionSummonHorror(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const gameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const wantSv = String(userData.servant || "").trim();
  // 找持 summon_horror 的我方從者(指定優先·否則第一個具此力者)
  let svIdx = -1;
  for (let i = 1; i < pcData.length; i++) {
    if (String(pcData[i][COL.PC.FACTION]) !== "從者") continue;
    if (String(pcData[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(pcData[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (!hasFx_(rowToCombatant_(pcData[i]), 'summon_horror')) continue;
    if (wantSv && String(pcData[i][COL.PC.NAME]).indexOf(wantSv) === -1) continue;
    svIdx = i; break;
  }
  if (svIdx === -1) return JSON.stringify({ success: false, message: "無能翻閱螺湮城教本的從者（需持此寶具的召喚師·如吉爾·德·萊斯）。" });
  const svC = rowToCombatant_(pcData[svIdx]);
  const svName = String(pcData[svIdx][COL.PC.NAME]);
  // 已在場？先清逾時殘影再判
  const _hce = clearExpiredHorror_(pcData[svIdx][COL.PC.MEMORY], gameId);
  if (_hce.cleared) pcData[svIdx][COL.PC.MEMORY] = _hce.mem;
  if (horrorPresent_(pcData[svIdx][COL.PC.MEMORY], gameId)) {
    return JSON.stringify({ success: false, message: "深淵海怪已在場，無需重複召喚。" });
  }
  const isFate = gameId.indexOf("g_") === 0;
  if (isFate && getAp_(gameId) < 1) return JSON.stringify({ success: false, message: "行動點不足——召喚深淵海怪需 1 AP。" });
  // ⚖️ 刻意不設「出力 100%」閘(與戰鬥內解放的差異)：戰鬥中解放要全開是「臨戰瞬間灌注」的張力；
  //   戰前召喚是不趕時間的儀式詠唱(出力檔本就免費即時可調·設閘只是無意義的點擊摩擦)。prana 全額照付。
  // 🔋 付寶具 prana（御主電池·MP＋焚血）：湊不出則召不動。用 npEffectiveRank_ 與同檔其餘呼叫點一致
  //   (單一真實來源)，避免未來 summon_horror 若掛到多寶具英靈身上時算錯魔力費。
  const prana = npPranaCost_(npEffectiveRank_(svC));
  const mMp = parseInt(pcData[pIdx][COL.PC.MP]) || 0, mHp = parseInt(pcData[pIdx][COL.PC.HP]) || 0;
  if (mMp + Math.floor(Math.max(0, mHp - 1) / BATTERY_HP_PER_MP) < prana) {
    return JSON.stringify({ success: false, message: `御主魔力不足以自深淵召出海怪（需 ${prana}）——須先休整／補魔。` });
  }
  const battery = drainForNp_(sheets, pcData, svIdx, pIdx, prana);
  // 🐙 設肉身 12h（變身態·單一狀態源）
  pcData[svIdx][COL.PC.MEMORY] = summonHorror_(pcData[svIdx][COL.PC.MEMORY], gameId);
  sheets.pc.getRange(svIdx + 1, 1, 1, pcData[svIdx].length).setValues([pcData[svIdx]]);
  let ap = AP_PER_DAY, clock = "";
  if (isFate) { try { ap = spendAp_(gameId, 1, pcData, sheets).ap; clock = clockLabel_(gameId, pcData); } catch (e) { } }
  const aiPrompt = servantCard_(pcData[svIdx]) +
    `【系統·螺湮城教本·已解放】御主號令「${svName}」翻開螺湮城教本，自深淵召出觸手巨獸「深淵海怪」（肉身 ${HORROR_SHIELD_HP}）常駐身側——只要魔力供養不絕，海怪便持續以身擋傷、每回合再生、並肩撕咬敵手，本體防禦亦升至對城規模；代價是每小時抽 ${HORROR_HOURLY_UPKEEP} 魔、每個交鋒回合另抽 ${HORROR_UPKEEP} 魔維持，共用魔力見底時海怪將先行沉回深淵。\n` +
    `★以 Fate／TYPE-MOON 筆觸演出深淵巨獸自書頁裂隙湧現、觸手蔽天的壓迫一幕（一段即可）。已結算。`;
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：drainForNp_/海怪標記/spendAp_ 皆已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({
    success: true, aiPrompt: aiPrompt, clock: clock, ap: ap, apMax: AP_PER_DAY,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// 🐙 解除召喚·深淵海怪：玩家隨時把海怪送回深淵——免費、即時、不耗 AP（止住每小時的維持費）。
//   重召須再付全額寶具 prana（actionSummonHorror），這就是「養 vs 解」的資源決策。
function actionDismissHorror(userData, pcId, sheets) {
  let pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const gameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  // 找隊上「現有海怪在場」的從者
  let svIdx = -1;
  for (let i = 1; i < pcData.length; i++) {
    if (String(pcData[i][COL.PC.FACTION]) !== "從者") continue;
    if (String(pcData[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(pcData[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (horrorPresent_(pcData[i][COL.PC.MEMORY], gameId)) { svIdx = i; break; }
  }
  if (svIdx === -1) return JSON.stringify({ success: false, message: "深淵海怪並不在場，無可解除。" });
  const svName = String(pcData[svIdx][COL.PC.NAME]);
  pcData[svIdx][COL.PC.MEMORY] = clearHorrorShield_(pcData[svIdx][COL.PC.MEMORY]);
  sheets.pc.getRange(svIdx + 1, COL.PC.MEMORY + 1).setValue(pcData[svIdx][COL.PC.MEMORY]);
  STATE_PRE_DATA_ = pcData; // ⚡ 交棒：海怪標記清除已原地改回 pcData，dispatcher 夾 _state 免整表重讀
  return JSON.stringify({
    success: true, message: `「深淵海怪」已沉回深淵（停止每小時 ${HORROR_HOURLY_UPKEEP} 魔的維持）。要再召喚須重付寶具魔力。`,
    statusString: getFreshStatusString(pcId, pIdx, sheets)
  });
}

// 十二試煉(God Hand) 剩餘命數（從者 MEMORY【試煉】N；無標記預設 11＝十二命扣除本體，呼應 FSN 設定）
// 實作收斂進 Core_Settings.gs 的 makeIntTag_ 共用工廠。
var GOD_HAND_TAG_ = makeIntTag_('試煉', 11);
function getGodHandLives_(memory) { return GOD_HAND_TAG_.get(memory); }
function setGodHandLives_(memory, n) { return GOD_HAND_TAG_.set(memory, n); }

// 玩家令咒餘量（存於御主 MEMORY 的【令咒】N 標記；舊角色無標記則視為 3）
var PLAYER_SEALS_TAG_ = makeIntTag_('令咒', 3);
function getPlayerSeals_(memory) { return PLAYER_SEALS_TAG_.get(memory); }
// 寫回令咒餘量（回傳更新後的 MEMORY 字串）
function setPlayerSeals_(memory, n) { return PLAYER_SEALS_TAG_.set(memory, n); }

// 🕯️ 令咒耗盡·靈基透支倒數：令咒燒到 0 又無「單獨行動」的敵從者，只能再撐 SEAL_DOOM_HOURS 小時。
var SEAL_DOOM_HOURS = 3; // 失去令咒穩固、無單獨行動自持的靈基存續上限（遊戲內小時）
// 該從者列(TAGS JSON 的 skills/traits)是否帶「單獨行動」(fx:'solo')
function rowHasSolo_(row) {
  try { var tg = JSON.parse(row[COL.PC.TAGS] || "{}"); return (tg.skills || []).concat(tg.traits || []).some(function (s) { return s && s.fx === 'solo'; }); }
  catch (e) { return false; }
}
// 在 MEMORY 標記/讀取靈基透支的「絕對死線」(遊戲內總時數 = day*24+hour)
var DOOM_TAG_ = makeIntTag_('靈基透支', 0);
function stampDoom_(memory, deadAbsHour) { return DOOM_TAG_.set(memory, deadAbsHour); }
function getDoom_(memory) { return DOOM_TAG_.get(memory); }

// 🍱 整備·進食（戰前 buff）：solo 無商城/道具欄，食物由「整備」抽象供給(AI 敘述來源)，
//   不寫道具列、不花錢。MEMORY 記【整備至】<絕對小時>，過期自動失效。
var MEAL_BUFF_HOURS = 8;   // 持續時數（遊戲內）
var MEAL_BUFF_BONUS = 2;   // 從者出擊命中加值
// 🐙 海怪護盾 ＝ 深淵海怪的「肉身血池」：螺湮城教本解放後，海怪自深淵現身、以身掩護術師——
//   傷害先扣海怪、海怪潰散後才傷及本體；每回合自深淵汲魔再生；逾時退場。
//   單一真實來源＝MEMORY【海怪護盾】<cur>|<max>|<expiryAbsHour>（三欄·舊兩欄相容讀取）。
//   要擴充「召喚物掩護」類技能：照此 get/set/clear + view 模式複製即可。
var HORROR_SHIELD_HP = 300;   // 海怪肉身上限（召喚時的滿值）
var HORROR_REGEN = 10;        // 每回合肉身再生量（不超過上限）
var HORROR_UPKEEP = 10;       // 海怪在場·每交鋒回合抽御主魔力維持（撐不住則潰散）
var HORROR_HOURLY_UPKEEP = 8; // 🐙 時間維持費：海怪在場＝共用池每小時另一張嘴；池赤字時【海怪先沉回深淵、
//                                才輪到御主燃血】(見 applyRegen_)。無期限、玩家可隨時解除。
// 🐙 變身框架·單一狀態源：海怪是否在場＝現存肉身(cur>0)且(若帶舊制碼表)未逾時。擋傷/回血/追擊/城防 全讀它。
//   ★這是「MEMORY 狀態旗標→引擎讀旗標調整攻防」的通用變身範本；日後靈基二階段/化身切換照此複製。
function horrorPresent_(memory, gameId) {
  var abs = null; try { var c = getClock_(gameId); if (c) abs = c.day * 24 + c.hour; } catch (e) { }
  return getHorrorShield_(memory, abs).active;
}
// 🐙 召喚/刷新海怪肉身：設 300/300/0（expiry 0＝無期限·維持全靠魔力經濟）。寶具解放與【戰前召喚】共用同一入口。
function summonHorror_(memory, gameId) {
  return setHorrorShield_(memory, HORROR_SHIELD_HP, HORROR_SHIELD_HP, 0);
}
// 🐙 清除逾時海怪的 MEMORY 殘影(舊制碼表存檔的過渡清理·新召 expiry 0 永不逾時)。回 {mem, cleared}。
function clearExpiredHorror_(memory, gameId) {
  var m = String(memory || "");
  if (!/【海怪護盾】/.test(m)) return { mem: m, cleared: false };
  if (horrorPresent_(m, gameId)) return { mem: m, cleared: false };
  return { mem: clearHorrorShield_(m), cleared: true };
}
var MEAL_TAG_ = makeIntTag_('整備至', 0);
function stampMeal_(memory, expiryAbsHour) { return MEAL_TAG_.set(memory, expiryAbsHour); }
function getMeal_(memory) { return MEAL_TAG_.get(memory); }
// 目前是否仍在整備加成效期內（吃 game clock 的絕對小時：day*24+hour）
function mealBuffActive_(memory, gameId) {
  var exp = getMeal_(memory); if (!exp) return false;
  var clk = getClock_(gameId); if (!clk) return false;
  return (clk.day * 24 + clk.hour) < exp;
}
// 讀海怪肉身：回 {active, remaining, max, expiry}。expiry 0＝【無期限】(魔力維持制·時耗見 applyRegen_)；
//   非 0＝舊制碼表存檔·逾時 active:false。相容舊兩欄(cur|expiry，max 退回 cur)。
function getHorrorShield_(memory, absHour) {
  var m = String(memory || "").match(/【海怪護盾】(\d+)\|(\d+)(?:\|(\d+))?/);
  if (!m) return { active: false, remaining: 0, max: 0, expiry: 0 };
  var rem, max, exp;
  if (m[3] != null) { rem = parseInt(m[1]); max = parseInt(m[2]); exp = parseInt(m[3]); }   // 新三欄 cur|max|expiry(0=無期限)
  else { rem = parseInt(m[1]); max = rem; exp = parseInt(m[2]); }                            // 舊兩欄 cur|expiry
  if (exp > 0 && absHour != null && absHour >= exp) return { active: false, remaining: 0, max: max, expiry: exp };
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
