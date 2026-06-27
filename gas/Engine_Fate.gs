// ==========================================
// ⚔️ Engine_Fate.gs — Fate 戰鬥核心：D20 ＋ 六圍(階級) ＋ fx 標籤 ＋ 寶具
//   每個 fx 效果都隨「技能階級」縮放（rankMul_），所以 對魔力B ≠ 對魔力A。
// ==========================================

// 階級倍率：以 C(30) 為 1.0 基準。E=0.33 D=0.67 C=1.0 B=1.33 A=1.67 EX=2.0；+ 各 +0.17
function rankMul_(r) { return rankVal(r) / 30; }

// 🎲 階級隨機區間（命中用）：每階級不取固定值，而是在 base-10 ~ base+5 之間隨機。
//   E:0~15 D:10~25 C:20~35 B:30~45 A:40~55 EX:50~65——相鄰階級區間重疊，
//   故低階偶能擲贏高階（爆冷），骰運重新有戲，不再「差一階就鎖死」。
function rankBand_(r) { return rankVal(r) + (Math.floor(Math.random() * 16) - 10); }

// 令咒緊急脫離的落點：隨機挑一個非約會型的冬木地點（≠ 當前地）
function enemyRetreatLoc_(currentLoc) {
  try {
    var km = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("坤圖");
    if (!km || km.getLastRow() <= 1) return currentLoc;
    var d = km.getDataRange().getValues();
    var pool = [];
    for (var i = 1; i < d.length; i++) {
      var nm = String(d[i][COL.MAP.NAME]).trim();
      var ty = String(d[i][COL.MAP.TYPE]).trim();
      if (!nm || ty === "約會") continue;          // 約會景點不作為撤退落點
      if (nm === String(currentLoc).trim()) continue;
      pool.push(nm);
    }
    if (!pool.length) return currentLoc;
    return pool[Math.floor(Math.random() * pool.length)];
  } catch (e) { return currentLoc; }
}

// 某 game_id 世界中仍存活的「敵從者」數（DEAD_ 開頭視為已消滅）
function aliveEnemyServants_(sheets, gameId) {
  var data = sheets.pc.getDataRange().getValues();
  var n = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.FACTION]) !== "敵從者") continue;
    if (gameId && String(data[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    n++;
  }
  return n;
}

// 找某 fx，回傳其階級字串(或 'C')；查無回 null。技能與特性都找。
function hasFx_(c, fx) {
  var all = (c.skills || []).concat(c.traits || []);
  for (var i = 0; i < all.length; i++) {
    if (all[i] && all[i].fx === fx) return (all[i].r || 'C');
  }
  return null;
}
function hasTrait_(c, name) {
  var t = (c.traits || []);
  for (var i = 0; i < t.length; i++) { if (t[i] && String(t[i].n).indexOf(name) >= 0) return true; }
  return false;
}

// 眾生列 → 戰鬥單位（六圍從六圍欄、技能/特性從標籤欄；無六圍者合成）
function rowToCombatant_(row) {
  var six = {}, skills = [], traits = [];
  try { six = JSON.parse(row[COL.PC.SIX] || "{}"); } catch (e) { }
  try { var tg = JSON.parse(row[COL.PC.TAGS] || "{}"); skills = tg.skills || []; traits = tg.traits || []; } catch (e) { }
  if (!six["筋力"]) {
    var isServant = String(row[COL.PC.FACTION]) === "從者";
    six = isServant
      ? { 筋力: 'C', 耐久: 'C', 敏捷: 'C', 魔力: 'C', 幸運: 'C', 寶具: 'C' }
      : { 筋力: 'E', 耐久: 'E', 敏捷: 'E', 魔力: 'E', 幸運: 'E', 寶具: '-' }; // 御主/凡人
  }
  return {
    name: row[COL.PC.NAME], cls: row[COL.PC.RANK] || row[COL.PC.CLS] || '',
    six: six, skills: skills, traits: traits,
    hp: parseInt(row[COL.PC.HP]) || 100, hpMax: parseInt(row[COL.PC.MAX_HP]) || 100,
    mp: parseInt(row[COL.PC.MP]) || 50, mpMax: parseInt(row[COL.PC.MAX_MP]) || 50
  };
}

// 主裁決：一次交手。回傳 {atkWins, winner, loser, damage, aRoll,dRoll,aHit,dEva, fired[], crit, np, seal}
function resolveFateBattle_(atk, def, opts) {
  opts = opts || {};
  var fired = [];
  var d20 = function () { return Math.floor(Math.random() * 20) + 1; };

  // 出力：攻方當前魔力% 影響表現（補魔充足生龍活虎／餓著發揮不出）
  var mpPct = atk.mpMax > 0 ? atk.mp / atk.mpMax : 1;
  var outMod = mpPct >= 1 ? 2 : mpPct >= 0.7 ? 0 : mpPct >= 0.4 ? -2 : mpPct >= 0.15 ? -5 : -8;

  var aRoll = d20(), dRoll = d20();
  // 命中／迴避的敏捷改用「階級隨機區間」(base-10~base+5)，讓低階偶能爆冷、骰運重新有戲
  var aHit = aRoll + rankBand_(atk.six["敏捷"]) + outMod;
  var dEva = dRoll + rankBand_(def.six["敏捷"]);

  // 直感/心眼(first_strike/analyze)：攻守先機 +3×階級
  var fsA = hasFx_(atk, 'first_strike') || hasFx_(atk, 'analyze'); if (fsA) { aHit += Math.round(3 * rankMul_(fsA)); fired.push(atk.name + (hasFx_(atk, 'analyze') ? '·心眼' : '·直感')); }
  var fsD = hasFx_(def, 'first_strike') || hasFx_(def, 'analyze');
  if (hasFx_(atk, 'unreadable')) { fsD = null; fired.push(atk.name + '·宗和的心得(封先機)'); } // 使對方直感/心眼失效
  if (fsD) { dEva += Math.round(3 * rankMul_(fsD)); fired.push(def.name + (hasFx_(def, 'analyze') ? '·心眼' : '·直感')); }

  // 狂化(mad)：六圍暴漲但理智低 → 命中／迴避 -3×階級（傷害加成在下方）
  var madA = hasFx_(atk, 'mad'); if (madA) aHit -= Math.round(3 * rankMul_(madA));
  var madD = hasFx_(def, 'mad'); if (madD) dEva -= Math.round(3 * rankMul_(madD));
  // 自我改造(self_mod)：命中 +2
  if (hasFx_(atk, 'self_mod')) { aHit += 2; fired.push(atk.name + '·自我改造'); }

  // 騎乘(ride) 機動 +2×階級
  var rideA = hasFx_(atk, 'ride'); if (rideA) aHit += Math.round(2 * rankMul_(rideA));
  // 避矢(evade_ranged)：守方對遠程(Archer)迴避 +6×階級
  if (atk.cls === 'Archer') { var er = hasFx_(def, 'evade_ranged'); if (er) { dEva += Math.round(6 * rankMul_(er)); fired.push(def.name + '·避矢'); } }
  // 氣息遮斷(stealth)：攻方奇襲 +3
  if (hasFx_(atk, 'stealth')) { aHit += 3; fired.push(atk.name + '·氣息遮斷·奇襲'); }
  // 燕返(tsubame)：攻方令守方迴避 -8
  var tsubame = hasFx_(atk, 'tsubame'); if (tsubame) { dEva -= 8; fired.push(atk.name + '·秘劍燕返'); }
  // 必中(gae_bolg)：寶具解放時逆因果直接命中
  var gaebolg = opts.np && hasFx_(atk, 'gae_bolg'); if (gaebolg) fired.push(atk.name + '·刺穿死棘之槍(必中)');

  var atkWins = gaebolg ? true : (aHit >= dEva);
  var winner = atkWins ? atk : def;
  var loser = atkWins ? def : atk;

  // 傷害：勝方筋力為底 + 分差
  var base = rankVal(winner.six["筋力"]) + Math.round(Math.abs(aHit - dEva) * 1.2);
  var su = hasFx_(winner, 'str_up'); if (su) { base += Math.round(8 * rankMul_(su)); fired.push(winner.name + '·怪力'); }
  var burst = hasFx_(winner, 'burst'); if (burst) { base = Math.round(base * (1 + 0.2 * rankMul_(burst))); fired.push(winner.name + '·魔力放出'); }
  // 勇猛/卡里斯瑪(morale)：傷害+；但對方「透化(clear_mind)」免疫此精神威壓
  var mor = hasFx_(winner, 'morale'); if (mor && !hasFx_(loser, 'clear_mind')) { base += Math.round(3 * rankMul_(mor)); }
  else if (mor && hasFx_(loser, 'clear_mind')) { fired.push(loser.name + '·透化(免威壓)'); }
  // 自我改造(self_mod)：傷害 +3
  if (hasFx_(winner, 'self_mod')) base += 3;
  // 狂化(mad)：傷害暴漲
  var madW = hasFx_(winner, 'mad'); if (madW) { base += Math.round(14 * rankMul_(madW)); fired.push(winner.name + '·狂化'); }
  // 神代魔術(divine_age)：魔力傷害大增（下方對魔力減免也減半）
  var da = hasFx_(winner, 'divine_age'); if (da) { base += Math.round(12 * rankMul_(da)); fired.push(winner.name + '·神代魔術'); }
  // 風王鐵鎚(wind_strike)：不可視之劍追加
  var ws = hasFx_(winner, 'wind_strike'); if (ws) { base += Math.round(6 * rankMul_(ws)); fired.push(winner.name + '·風王鐵鎚'); }
  // 神殺：對「神性」特性追加 ×1.5
  var godSlay = (winner.skills || []).concat(winner.traits || []).some(function (t) { return t && String(t.n).indexOf('神殺') >= 0; });
  var loserDivine = (loser.traits || []).concat(loser.skills || []).some(function (t) { return t && /神性|神格|神靈/.test(String(t.n)); });
  if (godSlay && loserDivine) { base = Math.round(base * 1.5); fired.push(winner.name + '·神殺(剋神性)'); }
  if (atkWins && tsubame) base = Math.round(base * 2.3);
  // 寶具解放：加寶具階級威能（軍略 +15%、神性 +10%）
  if (opts.np) {
    base += Math.round(rankVal(winner.six["寶具"]) * 1.6) + 18; fired.push(winner.name + '·寶具解放');
    if (hasFx_(winner, 'tactics')) { base = Math.round(base * 1.15); fired.push(winner.name + '·軍略'); }
    var wDivine = (winner.traits || []).some(function (t) { return t && /神性|神格|神靈/.test(String(t.n)); });
    if (wDivine) base = Math.round(base * 1.1);
  }
  // 令咒·絕對命令：全力一擊
  if (opts.seal) { base = Math.round(base * 1.5); fired.push('令咒·絕對命令'); }

  // 守方減傷：耐久（階級）
  base -= Math.round(rankVal(loser.six["耐久"]) / 2);
  // 神核(divine_core)：減傷 18%×階級；但破魔薔薇(anti_magic_lance)無視神核護甲
  var dc = hasFx_(loser, 'divine_core');
  if (dc && hasFx_(winner, 'anti_magic_lance')) { fired.push(winner.name + '·破魔(無視神核)'); }
  else if (dc) { base = Math.round(base * (1 - 0.18 * rankMul_(dc))); fired.push(loser.name + '·神核'); }
  // 對魔力(nullify_magic)：攻方為魔術系(Caster/魔力放出/神代)時，減魔術傷 25%×階級；神代魔術使其減免折半
  var atkMagic = (winner.cls === 'Caster') || !!hasFx_(winner, 'burst') || !!hasFx_(winner, 'divine_age');
  var nm = hasFx_(loser, 'nullify_magic');
  if (atkMagic && nm) {
    var red = 0.25 * rankMul_(nm);
    if (hasFx_(winner, 'divine_age')) red *= 0.5; // 神代魔術凌駕一般對魔力
    base = Math.round(base * (1 - red)); fired.push(loser.name + '·對魔力');
  }

  var damage = Math.max(1, base);

  var crit = (atkWins && aRoll === 20) ? 'atk_crit' : (!atkWins && dRoll === 20) ? 'def_crit'
    : (aRoll === 1 && !atkWins) ? 'atk_fumble' : (dRoll === 1 && atkWins) ? 'def_fumble' : '';
  if (crit === 'atk_crit' || crit === 'def_crit') damage += 30;

  return {
    atkWins: atkWins, winner: winner.name, loser: loser.name, damage: damage,
    aRoll: aRoll, dRoll: dRoll, aHit: aHit, dEva: dEva, fired: fired, crit: crit,
    np: !!opts.np, seal: !!opts.seal
  };
}
