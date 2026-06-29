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

// 🎲 擲骰：n 顆 d(sides)，回傳總和（D&D 風傷害骰的核心）。n<=0 回 0。
function rollDice_(n, sides) {
  n = Math.max(0, Math.round(n)); sides = Math.max(1, Math.round(sides));
  var s = 0;
  for (var i = 0; i < n; i++) s += Math.floor(Math.random() * sides) + 1;
  return s;
}
// 階級→骰數階(E=1 D=2 C=3 B=4 A=5 EX=6)：傷害骰顆數隨主屬性階級遞增。
function rankTier_(r) { var v = rankVal(r); if (v >= 60) return 6; if (v >= 50) return 5; if (v >= 40) return 4; if (v >= 30) return 3; if (v >= 20) return 2; return 1; }

// 👑 王之財寶(gob) 無盡兵裝彈幕：50 顆 d3、捨去「1」(沒打中的)，只計 2/3。EV≈83＝飽和重擊(吉爾伽美什常駐)。
function gobVolley_() { var t = 0; for (var i = 0; i < 50; i++) { var r = Math.floor(Math.random() * 3) + 1; if (r >= 2) t += r; } return t; }
// ⛓️ 天之鎖(chain) 萬鎖彈幕：較王財小(18顆，EV≈30)——因恩奇都六圍本就頂級，給滿 50 會壓過金閃；此為平衡取捨。
function chainVolley_() { var t = 0; for (var i = 0; i < 18; i++) { var r = Math.floor(Math.random() * 3) + 1; if (r >= 2) t += r; } return t; }

// ⚔️🔱 概念優先權（Priority）：數字越高＝概念位階越高。Fate 世界觀的「真理＞固有結界＞傳說武技＞英靈技能」階梯。
//   高位階「進攻概念」可碾壓低位階「防禦概念」——當 攻方進攻階 ≥ 守方防禦階 + PIERCE_GAP 時，該防禦被無視（概念壓制）。
//   把原本散落各處的 if（破魔無視神核／神代凌駕對魔力…）系統化成一張可擴充的表。
var CONCEPT_TIER = {
  // 6｜世界·真理級：斬裂世界，凌駕一切防禦與結界
  ea: 6,
  // 5｜神祖·王權·斬契約級
  excalibur: 5, divine_age: 5, rule_breaker: 5,
  // 4｜固有結界·破魔·必中級
  ubw: 4, anti_magic_lance: 4, gae_bolg: 4,
  // 3｜傳說武技·不死·暗殺級
  god_hand: 3, tsubame: 3, zabaniya: 3, petrify: 3,
  // 2｜英靈防禦技能級（會被高位階概念壓制的那一層）
  nullify_magic: 2, divine_core: 2, territory: 2
};
var PIERCE_GAP = 2; // 攻方概念階高出守方此值以上 → 概念壓制（無視該防禦）
function conceptTier_(fx) { return CONCEPT_TIER[fx] || 1; }
// 取某戰鬥單位「進攻概念」的最高位階（只看寶具解放時真正打出的高位階攻擊概念）
function offenseTier_(c, isNp) {
  var pierceFx = isNp ? ['ea', 'excalibur', 'rule_breaker', 'ubw', 'anti_magic_lance', 'gae_bolg', 'tsubame', 'zabaniya', 'petrify']
                      : ['rule_breaker', 'anti_magic_lance']; // 非解放時，只有破戒/破魔這類「常駐穿透概念」生效
  var t = 1;
  for (var i = 0; i < pierceFx.length; i++) { if (hasFx_(c, pierceFx[i])) t = Math.max(t, conceptTier_(pierceFx[i])); }
  return t;
}

// 🔋 寶具 Prana Cost（依寶具階級）：E40 D70 C110 B160 A220 EX300。
//   🔋 出力電池制(2026-06)：寶具魔力全由御主供（從者無池）。已對齊御主池(迴路×8，預設240)——
//   A 階≈耗盡滿池、EX 須再焚血墊；故 EX/EA 仍極罕見。寶具僅在出力 100% 才可解放(見 actionFateBattle 閘門)。
function npPranaCost_(npRank) {
  if (/EX/i.test(String(npRank))) return 300;  // 僅「EX」階；A++(rankVal 亦=60)不算 EX
  var v = rankVal(npRank);
  if (v >= 50) return 220;  // A / A+ / A++
  if (v >= 40) return 160;  // B
  if (v >= 30) return 110;  // C
  if (v >= 20) return 70;   // D
  return 40;                // E
}

// 🎲 寶具基礎傷害骰（依寶具階級，d10 系）：E3d10 D5d10 C8d10 B12d10 A20d10 EX30d10。
//   ★與原作「階級＝絕對威力」掛鉤——寶具解放這一發的主威力來源；其餘 buff 只是錦上添花。
function npBaseDice_(npRank) {
  // 🎴 下修(2026-06平衡)：寶具骰過去近乎一發秒殺(A20d10≈110/EX30d10≈165 vs 血270~450)，極化寶具模式。
  //   壓到「重擊但非必秒」，主威力仍在＋概念壓制/規模相剋輔助；讓寶具是決勝重拳而非一鍵抹除。
  if (/EX/i.test(String(npRank))) return rollDice_(18, 10); // EX
  var v = rankVal(npRank);
  if (v >= 55) return rollDice_(14, 10);  // A+ / A++
  if (v >= 50) return rollDice_(13, 10);  // A
  if (v >= 40) return rollDice_(9, 10);   // B
  if (v >= 30) return rollDice_(6, 10);   // C
  if (v >= 20) return rollDice_(4, 10);   // D
  return rollDice_(3, 10);                // E
}

// 🏰 寶具規模相剋矩陣（攻擊規模 × 防禦規模 → 傷害倍率）：
//   對城打對人 ×2.5、對界無視防禦進行概念碾壓。0x（無效）以引擎 Math.max(1) 保底為一絲擦傷，不硬鎖。
var NP_SCALE_IDX = { '對人': 0, '對軍': 1, '對城': 2, '對界': 3 };
// 🎴 壓縮(2026-06平衡)：舊矩陣 ×2.5/×3 會讓「大規模寶具一發秒小規模」＝寶具模式淪為先手樂透。
//   收斂到「規模優勢＝明顯傾向，非必殺」(max ×1.7、min ×0.4)，保留相剋骨架但不再一鍵抹除。
var NP_SCALE_MATRIX = [
  //    對人防  對軍防  對城防  對界防
  [1.00, 0.75, 0.50, 0.40],  // 對人攻
  [1.25, 1.00, 0.75, 0.50],  // 對軍攻
  [1.50, 1.30, 1.00, 0.60],  // 對城攻
  [1.70, 1.50, 1.30, 1.00]   // 對界攻
];
// 攻擊寶具規模：由寶具名(對人/對軍/對城/對界)或 ea/excalibur 標籤推定，預設對人。
function npAtkScale_(c) {
  var np = String(c.np || '');
  if (hasFx_(c, 'ea') || /對界/.test(np)) return '對界';
  // 🗡️ 無限劍製(ubw)＝固有結界的飽和彈幕＝對城級；🐙 召喚大海怪(summon_horror／青鬍子)＝深淵巨獸＝對城級
  if (hasFx_(c, 'excalibur') || hasFx_(c, 'ubw') || hasFx_(c, 'summon_horror') || /對城/.test(np)) return '對城';
  if (/對軍/.test(np)) return '對軍';
  return '對人';
}
// 防禦規模：固有結界/對界寶具持有者＝對界防；神核/十二試煉/對城寶具＝對城防；陣地/對軍寶具＝對軍防；其餘對人防。
function npDefScale_(c) {
  var np = String(c.np || '');
  if (hasFx_(c, 'ubw') || /對界/.test(np)) return '對界';
  if (hasFx_(c, 'divine_core') || hasFx_(c, 'god_hand') || /對城/.test(np)) return '對城';
  if (hasFx_(c, 'territory') || /對軍/.test(np)) return '對軍';
  return '對人';
}
function npScaleMult_(atkC, defC) {
  var a = NP_SCALE_IDX[npAtkScale_(atkC)], d = NP_SCALE_IDX[npDefScale_(defC)];
  return NP_SCALE_MATRIX[a][d];
}

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
// 某 fx 在「這名」從者身上的『實際技能名』（不要硬寫某英靈的招式名，避免張冠李戴）。
function fxName_(c, fx, fallback) {
  var all = (c.skills || []).concat(c.traits || []);
  for (var i = 0; i < all.length; i++) {
    if (all[i] && all[i].fx === fx && all[i].n) return String(all[i].n);
  }
  return fallback || fx;
}

// ⚔️ 戰鬥屬性檔（依職階）：法師以「魔力」轟擊與築壁、弓兵遠程狙擊、其餘近戰靠筋力／敏捷。
//   hit=命中所用六圍　dmg=傷害所用六圍　eva=迴避所用六圍　kind=演出用招式類別
function combatProfile_(c) {
  var cls = String(c.cls || '');
  if (cls === 'Caster') return { hit: '魔力', dmg: '魔力', eva: '敏捷', kind: '魔砲' }; // 魔力轟擊的玻璃大砲：攻強、近身脆
  if (cls === 'Archer') return { hit: '敏捷', dmg: '筋力', eva: '敏捷', kind: '狙擊' }; // 遠程精準
  return { hit: '敏捷', dmg: '筋力', eva: '敏捷', kind: '近戰' };
}

// ⚡ 從者專屬「主動技」：依其 fx 簽名給一個本戰增益按鈕（每個從者至少有「集中」）。
//   mpPct＝啟動耗魔(佔 maxMP 比例，付不起走御主電池)；hit＝本戰每擊命中+；dmgMul/dmgAdd＝本戰每擊傷害增益。
//   ★只增益「我方出擊」，不碰防禦端，避免跨呼叫方向的複雜度。
function servantActiveSkill_(c) {
  // 👑 王之財寶(gob)已改為「常駐被動」(見 resolveFateBattle_：每擊命中+5 ＋ 50d3捨1 無盡兵裝彈幕)，
  //   故不再佔主動技槽；吉爾伽美什的主動技自動落到下一個 fx(鼓舞)。
  if (hasFx_(c, 'burst')) return { id: 'burst', name: fxName_(c, 'burst', '魔力放出'), icon: '💥', mpPct: 0.15, hit: 0, dmgMul: 1.3, dmgAdd: 0, desc: '本戰傷害 ×1.3' };
  if (hasFx_(c, 'stealth')) return { id: 'stealth', name: fxName_(c, 'stealth', '氣息遮斷'), icon: '🌫️', mpPct: 0.12, hit: 6, dmgMul: 1.15, dmgAdd: 0, desc: '本戰命中+6、傷害×1.15(奇襲)' };
  if (hasFx_(c, 'str_up')) return { id: 'str_up', name: fxName_(c, 'str_up', '怪力'), icon: '💪', mpPct: 0.12, hit: 0, dmgMul: 1.0, dmgAdd: 14, desc: '本戰傷害+14' };
  if (hasFx_(c, 'aim') || hasFx_(c, 'projection')) return { id: 'aim', name: fxName_(c, hasFx_(c, 'aim') ? 'aim' : 'projection', '狙準'), icon: '🎯', mpPct: 0.12, hit: 6, dmgMul: 1.0, dmgAdd: 10, desc: '本戰命中+6、傷害+10' };
  if (hasFx_(c, 'morale')) return { id: 'morale', name: fxName_(c, 'morale', '鼓舞'), icon: '📣', mpPct: 0.10, hit: 3, dmgMul: 1.0, dmgAdd: 8, desc: '本戰命中+3、傷害+8' };
  if (hasFx_(c, 'self_mod')) return { id: 'self_mod', name: fxName_(c, 'self_mod', '自我改造'), icon: '🔧', mpPct: 0.10, hit: 4, dmgMul: 1.0, dmgAdd: 6, desc: '本戰命中+4、傷害+6' };
  return { id: 'focus', name: '集中', icon: '🎯', mpPct: 0.10, hit: 5, dmgMul: 1.0, dmgAdd: 0, desc: '本戰命中+5' };
}

// 眾生列 → 戰鬥單位（六圍從六圍欄、技能/特性從標籤欄；無六圍者合成）
function rowToCombatant_(row) {
  var six = {}, skills = [], traits = [];
  try { six = JSON.parse(row[COL.PC.SIX] || "{}"); } catch (e) { }
  try { var tg = JSON.parse(row[COL.PC.TAGS] || "{}"); skills = tg.skills || []; traits = tg.traits || []; } catch (e) { }
  // 🔮 魔境的智慧：持有 mage_realm 的從者（斯卡哈），把玩家選定的通用 A 階被動注入 skills（戰鬥即時生效）。
  if (skills.some(function (sk) { return sk && sk.fx === 'mage_realm'; })) {
    var pick = mageRealmPick_(row[COL.PC.MEMORY]);
    var ent = pick && mageRealmEntry_(pick);
    if (ent && !skills.some(function (sk) { return sk && sk.fx === ent.fx; })) {
      skills = skills.concat([{ n: ent.n, r: 'A', fx: ent.fx }]);
    }
  }
  if (!six["筋力"]) {
    var isServant = String(row[COL.PC.FACTION]) === "從者";
    six = isServant
      ? { 筋力: 'C', 耐久: 'C', 敏捷: 'C', 魔力: 'C', 幸運: 'C', 寶具: 'C' }
      : { 筋力: 'E', 耐久: 'E', 敏捷: 'E', 魔力: 'E', 幸運: 'E', 寶具: '-' }; // 御主/凡人
  }
  // 🐕 主從synergy：理想御主(如恩奇都↔巴茲狄洛特)把從者拉回原作全盛六圍；其餘御主維持削弱基線。
  six = masterSynergySix_(row[COL.PC.NAME], six, row[COL.PC.MEMORY]);
  return {
    name: row[COL.PC.NAME], cls: row[COL.PC.RANK] || '',
    six: six, skills: skills, traits: traits, np: row[COL.PC.MARTIAL] || '',
    hp: parseInt(row[COL.PC.HP]) || 100, hpMax: parseInt(row[COL.PC.MAX_HP]) || 100,
    mp: parseInt(row[COL.PC.MP]) || 50, mpMax: parseInt(row[COL.PC.MAX_MP]) || 50,
    // 🔋 出力電池制：從者靈基出力檔位(20~100)，決定本戰命中/傷害＋御主每小時維持費；御主預設凡人巡航 60。
    output: servantOutput_(row[COL.PC.MEMORY])
  };
}

// 主裁決：一次交手。回傳 {atkWins, winner, loser, damage, aRoll,dRoll,aHit,dEva, fired[], crit, np, seal}
function resolveFateBattle_(atk, def, opts) {
  opts = opts || {};
  var fired = [];
  var d20 = function () { return Math.floor(Math.random() * 20) + 1; };

  // 🌟 乖離劍·天地乖離開闢之星(ea)：英雄王自身血量≤40%才卸下傲慢「認真」——解放寶具(opts.np)時，
  //   以神靈概念分割越過一切防禦的「執行殺」。需玩家／敵方主動解放寶具(已由 actionFateBattle 上游補魔閘門把關)，
  //   非每擊免費觸發；血量充足時則走下方常規寶具路徑(×1.7 加成)，體現「對手不值得我認真」。
  if (opts.np && hasFx_(atk, 'ea')) {
    var _selfHpPct = (atk.hpMax > 0) ? (atk.hp / atk.hpMax) : 1.0;
    if (typeof opts.selfHpPct === 'number') _selfHpPct = opts.selfHpPct;
    if (_selfHpPct <= 0.4) {
      var _eaDmg = Math.round(rankVal(atk.six['寶具']) * 4) + rollDice_(6, 12) + 200;
      fired.push(atk.name + '·乖離劍·天地乖離開闢之星(認真·執行殺)');
      return { atkWins: true, winner: atk.name, loser: def.name, damage: _eaDmg, aRoll: 20, dRoll: 0, aHit: 99, dEva: 0, fired: fired, crit: 'atk_crit', np: true, seal: !!opts.seal };
    }
  }
  // 💰 黃金律(wealth／吉爾伽美什)：絕境(自身血≤20%)時，無盡財寶供能→【無視魔力】自寶藏取出乖離劍(EA)執行殺。
  //   讓金閃殘血翻盤的招牌：不需 opts.np、不吃御主魔力(黃金律＝無限資源)。復活原本死掉的 wealth＋ea 兩標籤。
  if (hasFx_(atk, 'wealth')) {
    var _whp = (atk.hpMax > 0) ? (atk.hp / atk.hpMax) : 1.0;
    if (_whp <= 0.2) {
      var _waDmg = Math.round(rankVal(atk.six['寶具']) * 4) + rollDice_(6, 12) + 200;
      fired.push(atk.name + '·黃金律·絕境取乖離劍(無盡財寶供能·執行殺)');
      return { atkWins: true, winner: atk.name, loser: def.name, damage: _waDmg, aRoll: 20, dRoll: 0, aHit: 99, dEva: 0, fired: fired, crit: 'atk_crit', np: true, seal: !!opts.seal };
    }
  }

  // 🔋 出力：攻方靈基出力檔位決定表現（御主把魔力灌多少進來）。高檔強但燒御主、低檔有懲罰。
  //   命中端 +outMod；傷害端 ×outTier.dmgMul（於下方主威力處套用）。御主供魔越足、從者越生龍活虎。
  var outTier = outputTier_(atk.output);
  var outMod = outTier.hit;

  // ⚔️ 依職階決定攻防屬性：法師用魔力轟擊＋魔術防壁、弓兵狙擊、近戰靠敏捷。讓「魔力型」也有舞台，不再只有敏／力吃香。
  var aProf = combatProfile_(atk), dProf = combatProfile_(def);
  var aRoll = d20(), dRoll = d20();
  // 命中／迴避改用「階級隨機區間」(base-10~base+5)，讓低階偶能爆冷、骰運重新有戲
  // 🎴 六圍＝角色速寫，只給「微傾向」：命中/迴避吃 rankTier×K_STAT(階差壓到~12)，讓 D20(運氣)重新主導。
  //   ★TYPE-MOON 官方：參數是「讓人快速理解這從者」的速寫，非戰力試算表。庫丘林六圍頂尖卻幸運E→
  //   故事與運氣才是裁判。舊版用 rankVal(差距50)當主導項→差兩階就鎖死→必然極化，此為根因修正。
  //   迴避＝敏捷(身法)×0.65＋耐久(底子)×0.35：拆掉「敏捷雙吃(命中又迴避)」。命中端純看敏/魔(進攻)。
  var K_STAT = 2.5;
  var aHit = aRoll + Math.round(rankTier_(atk.six[aProf.hit]) * K_STAT) + (Math.floor(Math.random() * 7) - 3) + outMod;
  var dEva = dRoll + Math.round((rankTier_(def.six['敏捷']) * 0.65 + rankTier_(def.six['耐久']) * 0.35) * K_STAT) + (Math.floor(Math.random() * 7) - 3);
  if (aProf.kind === '魔砲') fired.push(atk.name + '·' + (fxName_(atk, 'territory', '魔術詠唱')));
  // 🍱 整備·進食（戰前 buff）：攻方命中 +opts.mealBuff（由 fateStrike_ 依御主整備狀態傳入）
  if (opts.mealBuff) { aHit += opts.mealBuff; fired.push(atk.name + '·整備進食(+' + opts.mealBuff + ')'); }

  // 直感/心眼(first_strike/analyze)：攻守先機 +3×階級
  var fsA = hasFx_(atk, 'first_strike') || hasFx_(atk, 'analyze'); if (fsA) { aHit += Math.round(3 * rankMul_(fsA)); fired.push(atk.name + '·' + fxName_(atk, hasFx_(atk, 'analyze') ? 'analyze' : 'first_strike', hasFx_(atk, 'analyze') ? '心眼' : '直感')); }
  var fsD = hasFx_(def, 'first_strike') || hasFx_(def, 'analyze');
  if (hasFx_(atk, 'unreadable')) { fsD = null; fired.push(atk.name + '·' + fxName_(atk, 'unreadable', '無貌') + '(封先機)'); } // 使對方直感/心眼失效
  if (fsD) { dEva += Math.round(3 * rankMul_(fsD)); fired.push(def.name + '·' + fxName_(def, hasFx_(def, 'analyze') ? 'analyze' : 'first_strike', hasFx_(def, 'analyze') ? '心眼' : '直感')); }

  // 狂化(mad)：六圍暴漲但理智低 → 命中／迴避 -3×階級（傷害加成在下方）
  var madA = hasFx_(atk, 'mad'); if (madA) aHit -= Math.round(3 * rankMul_(madA));
  var madD = hasFx_(def, 'mad'); if (madD) dEva -= Math.round(3 * rankMul_(madD));
  // 自我改造(self_mod)：命中 +2
  if (hasFx_(atk, 'self_mod')) { aHit += 2; fired.push(atk.name + '·' + fxName_(atk, 'self_mod', '自我改造')); }
  // ⚡ 主動技（玩家本戰啟動）：命中加成 + 標記發動
  if (opts.skill) { aHit += (opts.skill.hit || 0); fired.push(atk.name + '·' + opts.skill.name + '(主動技)'); }

  // 騎乘(ride) 機動 +2×階級
  var rideA = hasFx_(atk, 'ride'); if (rideA) aHit += Math.round(2 * rankMul_(rideA));
  // 🎯 千里眼(aim)／投影魔術(projection)：弓兵的命中靠眼力與劍雨飽和，不全看身法
  var aimA = hasFx_(atk, 'aim'); if (aimA) { aHit += Math.round(4 * rankMul_(aimA)); fired.push(atk.name + '·' + fxName_(atk, 'aim', '千里眼')); }
  var projA = hasFx_(atk, 'projection'); if (projA) aHit += 3;
  // 避矢(evade_ranged)：守方對遠程(Archer)迴避 +6×階級
  if (atk.cls === 'Archer') { var er = hasFx_(def, 'evade_ranged'); if (er) { dEva += Math.round(6 * rankMul_(er)); fired.push(def.name + '·' + fxName_(def, 'evade_ranged', '避矢')); } }
  // 氣息遮斷(stealth)：攻方奇襲 +3
  if (hasFx_(atk, 'stealth')) { aHit += 3; fired.push(atk.name + '·' + fxName_(atk, 'stealth', '氣息遮斷') + '·奇襲'); }
  // 👑 王之財寶(gob)常駐：無盡兵裝鋪天蓋地，命中 +5（飽和彈幕難閃；傷害彈幕在下方）
  if (hasFx_(atk, 'gob')) { aHit += 5; fired.push(atk.name + '·' + fxName_(atk, 'gob', '王之財寶') + '(無盡兵裝)'); }
  // ⛓️ 天之鎖(chain)：命中加成併入既有「縛神性」效果(下方)；輸出走下方萬鎖彈幕。此處不另加命中(避免恩奇都過載)。
  // 燕返(tsubame)：寶具解放時次元摺疊令守方迴避 -5＋×2.3 傷害；普通出擊不適用（需全力釋放方能發動）
  var tsubame = hasFx_(atk, 'tsubame'); if (tsubame && opts.np) { dEva -= 5; fired.push(atk.name + '·' + fxName_(atk, 'tsubame', '秘劍')); }
  // 🔱 三騎士職階相剋（Saber→Lancer→Archer→Saber）：占上風者搶得先機，命中小幅領先（傷害加成在下方）
  var KNIGHT_BEATS = { 'Saber': 'Lancer', 'Lancer': 'Archer', 'Archer': 'Saber' };
  if (KNIGHT_BEATS[atk.cls] === def.cls) aHit += 3;
  else if (KNIGHT_BEATS[def.cls] === atk.cls) dEva += 3;
  // 🦊 變化(shapeshift／玉藻前·哈桑·恩奇都)：化形流轉，守方滑開致命一擊，迴避小幅提升
  var sm = hasFx_(def, 'shapeshift'); if (sm) { dEva += Math.round(3 * rankMul_(sm)); fired.push(def.name + '·' + fxName_(def, 'shapeshift', '變化') + '(化形閃避)'); }
  // 👁️ 魔眼·石化(petrify／Rider 美杜莎)：以視線鎖死獵物，令對方迴避大減
  var pet = hasFx_(atk, 'petrify'); if (pet) { dEva -= Math.round(2 * rankMul_(pet)); fired.push(atk.name + '·' + fxName_(atk, 'petrify', '魔眼') + '·石化壓制'); }
  // ⛓️ 天之鎖(chain／Gilgamesh)：對「神性」之敵展開冥界鎖鏈，封住身法
  var chn = hasFx_(atk, 'chain'); var defDivine0 = (def.traits || []).concat(def.skills || []).some(function (t) { return t && /神性|神格|神靈/.test(String(t.n)); });
  if (chn && defDivine0) { dEva -= Math.round(6 * rankMul_(chn)); fired.push(atk.name + '·' + fxName_(atk, 'chain', '天之鎖') + '(縛神性)'); }

  // 必中(gae_bolg)：寶具解放時逆因果直接命中
  var gaebolg = opts.np && hasFx_(atk, 'gae_bolg'); if (gaebolg) fired.push(atk.name + '·' + fxName_(atk, 'gae_bolg', '必中之槍') + '(必中)');

  // 🍀 幸運＝上演劇情逆轉的旋鈕：幸運差≥2階 → 高者得福星骰(+0~6)、低者被命運捉弄。
  //   Saber(幸A+)的福星、庫丘林(幸E)屢屢倒楣戰死的詛咒——「故事與運氣才是裁判」實裝。
  //   做法＝自指變異(非對拼)：低運(≤D)每擊小機率失手、高運(≥A)小機率福星，製造爆冷與劇情感，而非讓高運方持續輾壓。
  var lkA = rankVal(atk.six['幸運']), lkD = rankVal(def.six['幸運']);
  if (lkA <= 20 && Math.random() < 0.08) { aHit -= 10; fired.push(atk.name + '·幸運' + (atk.six['幸運'] || 'E') + '·天不從人(失手)'); }
  else if (lkA >= 50 && Math.random() < 0.08) { aHit += 8; fired.push(atk.name + '·幸運·福星眷顧'); }
  if (lkD <= 20 && Math.random() < 0.08) { dEva -= 10; fired.push(def.name + '·幸運' + (def.six['幸運'] || 'E') + '·命運捉弄(露破綻)'); }
  else if (lkD >= 50 && Math.random() < 0.08) { dEva += 8; fired.push(def.name + '·幸運·絕處逢生'); }

  var atkWins = gaebolg ? true : (aHit >= dEva);
  var winner = atkWins ? atk : def;
  var loser = atkWins ? def : atk;

  // 傷害：勝方依職階主屬性為底（法師＝魔力轟擊／近戰＝筋力）+ 分差
  //   🎲 D&D 風武器骰：底傷 = 階級基底×0.5（穩定底）＋ rankTier 顆 d8（武器骰，帶骰運起伏）＋ 命中分差×1.2
  //   中位數約等於舊「rankVal 平值」，但每一擊有 ±的浮動，低階偶爆高傷、高階偶失手，貼近擲骰桌遊手感。
  var wProf = (winner === atk) ? aProf : dProf;
  var wDmgRank = winner.six[wProf.dmg];
  var wTier = rankTier_(wDmgRank);
  var weaponDice = rollDice_(wTier, 8);
  // 🎴 傷害同樣降六圍權重(flat 0.8→0.6)：避免高階一發轟死；主威力交給武器骰(帶骰運)＋命中分差＋fx/寶具。
  var base = Math.round(rankVal(wDmgRank) * 0.6) + weaponDice + Math.round(Math.abs(aHit - dEva) * 1.2);
  fired.push(winner.name + '·武器骰' + wTier + 'd8=' + weaponDice);
  // 🔋 出力傷害乘子：依勝方(出擊方)靈基出力檔位放大/縮小本擊威力（御主供魔越足、傷害越高）。
  var wOut = outputTier_(winner.output);
  if (wOut.dmgMul !== 1.0) { base = Math.round(base * wOut.dmgMul); fired.push(winner.name + '·出力' + (winner.output || 60) + '%·' + wOut.label); }
  var su = hasFx_(winner, 'str_up'); if (su) { base += Math.round(8 * rankMul_(su)); fired.push(winner.name + '·' + fxName_(winner, 'str_up', '怪力')); }
  var burst = hasFx_(winner, 'burst'); if (burst) { base = Math.round(base * (1 + 0.2 * rankMul_(burst))); fired.push(winner.name + '·' + fxName_(winner, 'burst', '魔力放出')); }
  // 勇猛/卡里斯瑪(morale)：傷害+；但對方「透化(clear_mind)」免疫此精神威壓
  var mor = hasFx_(winner, 'morale'); if (mor && !hasFx_(loser, 'clear_mind')) { base += Math.round(3 * rankMul_(mor)); }
  else if (mor && hasFx_(loser, 'clear_mind')) { fired.push(loser.name + '·透化(免威壓)'); }
  // 自我改造(self_mod)：傷害 +3
  if (hasFx_(winner, 'self_mod')) base += 3;
  // 🗡️ 投影魔術(projection)：每擊都連續投影複製名劍齊射，給持續傷害底火（救低筋力的 EMIYA）
  if (hasFx_(winner, 'projection')) { base += 24 + Math.round(rankVal(winner.six["寶具"]) * 0.6); fired.push(winner.name + '·投影連射'); }
  // 🪄 高速詠唱(fast_cast／Caster)：一回合內連珠疊咒，魔砲彈幕加成（救低耐玻璃魔女的輸出）
  var fc = hasFx_(winner, 'fast_cast'); if (fc) { base += Math.round(12 * rankMul_(fc)); fired.push(winner.name + '·' + fxName_(winner, 'fast_cast', '高速詠唱') + '(連珠疊咒)'); }
  // 👑 王之財寶(gob)常駐彈幕：50d3捨1 的無盡兵裝飽和傷害（吉爾伽美什不必開寶具就壓制全場）
  if (hasFx_(winner, 'gob')) { var gv = gobVolley_(); base += gv; fired.push(winner.name + '·' + fxName_(winner, 'gob', '王之財寶') + '·無盡彈幕(' + gv + ')'); }
  // ⛓️ 天之鎖(chain)常駐彈幕：18d3捨1 萬鎖貫穿（金閃有 gob 則不重複；恩奇都專屬輸出，較王財小以平衡其頂級六圍）
  if (hasFx_(winner, 'chain') && !hasFx_(winner, 'gob')) { var cv = chainVolley_(); base += cv; fired.push(winner.name + '·' + fxName_(winner, 'chain', '天之鎖') + '·萬鎖貫穿(' + cv + ')'); }
  // 狂化(mad)：傷害暴漲
  var madW = hasFx_(winner, 'mad'); if (madW) { base += Math.round(14 * rankMul_(madW)); fired.push(winner.name + '·' + fxName_(winner, 'mad', '狂化')); }
  // 神代魔術(divine_age)：魔力傷害大增（下方對魔力減免也減半）
  var da = hasFx_(winner, 'divine_age'); if (da) { base += Math.round(12 * rankMul_(da)); fired.push(winner.name + '·' + fxName_(winner, 'divine_age', '神代魔術')); }
  // 風王鐵鎚(wind_strike)：不可視之劍追加
  var ws = hasFx_(winner, 'wind_strike'); if (ws) { base += Math.round(6 * rankMul_(ws)); fired.push(winner.name + '·' + fxName_(winner, 'wind_strike', '風王鐵鎚')); }
  // 🧪 道具作成(crafting／法師·EMIYA)：事前備妥的暗器/毒/符具於關鍵一擊派上用場，傷害小幅追加
  var craft = hasFx_(winner, 'crafting'); if (craft) { base += Math.round(8 * rankMul_(craft)); fired.push(winner.name + '·' + fxName_(winner, 'crafting', '道具作成') + '(備妥之器)'); }
  // 神殺：對有「神性」者最終傷害放大。神性(divine fx 或特性)階級越高 → 越被神殺剋(×1.3~×1.83，依神性階)。
  var godSlay = (winner.skills || []).concat(winner.traits || []).some(function (t) { return t && String(t.n).indexOf('神殺') >= 0; });
  var divFx = hasFx_(loser, 'divine');  // 神性 fx 的階級(若有)
  var divTrait = (loser.traits || []).concat(loser.skills || []).filter(function (t) { return t && /神性|神格|神靈/.test(String(t.n)); });
  var loserDivine = !!divFx || divTrait.length > 0;
  if (godSlay && loserDivine) {
    var divRank = divFx || (divTrait[0] && divTrait[0].r) || 'C';   // 取神性階級(fx 優先，再特性，預設C)
    var slayMul = Math.min(2.0, 1 + 0.5 * rankMul_(divRank));        // C→1.5、A→1.83、E→1.17、EX→2.0
    base = Math.round(base * slayMul); fired.push(winner.name + '·神殺(剋神性' + (divFx || (divTrait[0] && divTrait[0].r) || '') + '·×' + slayMul.toFixed(2) + ')');
  }
  // 🔱 職階相性傷害加成：克制方下手更狠（與上方命中先機呼應）
  if (KNIGHT_BEATS[winner.cls] === loser.cls) { base = Math.round(base * 1.12); fired.push(winner.name + '·職階相性·壓制' + loser.cls); }
  if (atkWins && tsubame && opts.np) base = Math.round(base * 2.3);
  // 寶具解放：主威力＝依寶具階級的 d10 基礎骰（E3→EX30）；階級小補正錦上添花（軍略 +15%、神性 +10%）
  if (opts.np) {
    var npRank = winner.six["寶具"];
    var npDice = npBaseDice_(npRank); base += npDice; fired.push(winner.name + '·寶具骰(' + (rankVal(npRank) >= 60 ? 'EX' : npRank) + ')=' + npDice);
    base += Math.round(rankVal(npRank) * 0.6) + 10; fired.push(winner.name + '·寶具解放');
    if (hasFx_(winner, 'tactics')) { base = Math.round(base * 1.15); fired.push(winner.name + '·' + fxName_(winner, 'tactics', '軍略')); }
    var wDivine = (winner.traits || []).some(function (t) { return t && /神性|神格|神靈/.test(String(t.n)); });
    if (wDivine) base = Math.round(base * 1.1);
    // 🗡️ 無限劍製(ubw／固有結界)：劍之地平展開，攻方在領域內傷害大增
    if (hasFx_(winner, 'ubw')) { base = Math.round(base * 1.25); fired.push(winner.name + '·' + fxName_(winner, 'ubw', '無限劍製') + '(固有結界)'); }
    // (王之財寶已移至主動技，寶具槽改為執行殺 EA)
    // 🗡️ 妄想心音／霧夜殺戮(zabaniya)：暗殺系寶具＝奪心一擊，命中即致命級重創（救低六圍刺客/狂戰的本命）
    if (hasFx_(winner, 'zabaniya')) { base = Math.round(base * 1.9) + 70; fired.push(winner.name + '·' + fxName_(winner, 'zabaniya', '妄想心音') + '(奪心致命)'); }
    // 🐙 螺湮城教本(summon_horror／青鬍子)：自深淵召出觸手大海怪鋪天蓋地碾壓——救低六圍支援法師的本命一擊(對城規模)
    if (hasFx_(winner, 'summon_horror')) { base = Math.round(base * 1.6) + rollDice_(8, 10) + 50; fired.push(winner.name + '·' + fxName_(winner, 'summon_horror', '螺湮城教本') + '(深淵海怪)'); }
    // 🌑 規則破壞(rule_breaker)寶具化／魔眼石化(petrify)等控場寶具的小加成已於上方命中處理；此處給魔眼一發致殘
    if (hasFx_(winner, 'petrify')) { base = Math.round(base * 1.3); fired.push(winner.name + '·魔眼·石化貫穿'); }
    // 🌟 乖離劍·天地乖離開闢之星(ea)：概念位階 6，斬裂世界的真理之劍——最高威力，且無視一切防禦概念（下方概念壓制處理）
    if (hasFx_(winner, 'ea')) { base = Math.round(base * 1.7) + rollDice_(4, 12) + 80; fired.push(winner.name + '·' + fxName_(winner, 'ea', '乖離劍') + '(天地乖離·真理之劍)'); }
    // 🏰 寶具規模相剋矩陣：對城打對人 ×2.5、對界碾壓常規防禦…（攻擊規模 × 守方防禦規模）
    var scaleMult = npScaleMult_(winner, loser);
    if (scaleMult !== 1) { base = Math.round(base * scaleMult); fired.push(winner.name + '·' + npAtkScale_(winner) + '寶具 vs ' + npDefScale_(loser) + '防(×' + scaleMult + ')'); }
  }
  // ⚡ 主動技傷害增益（僅當攻方獲勝＝此增益屬於攻方時生效）
  if (opts.skill && atkWins) {
    if (opts.skill.dmgMul && opts.skill.dmgMul !== 1) base = Math.round(base * opts.skill.dmgMul);
    if (opts.skill.dmgAdd) base += opts.skill.dmgAdd;
  }
  // 令咒·絕對命令：全力一擊
  if (opts.seal) { base = Math.round(base * 1.5); fired.push('令咒·絕對命令'); }

  // 🔱 概念優先權壓制：勝方的最高「進攻概念」位階若高出某防禦概念 PIERCE_GAP 階以上 → 該防禦被無視。
  //   把「破魔無視神核」「ea 凌駕一切結界」這類交互系統化：pierces(防禦fx) 為 true 即跳過該減傷。
  var pierceT = offenseTier_(winner, !!opts.np);
  var pierces = function (defFx) { return pierceT >= conceptTier_(defFx) + PIERCE_GAP; };
  // 守方減傷：耐久（階級）
  base -= Math.round(rankVal(loser.six["耐久"]) / 2);
  // 🛡️ 陣地作成(territory)：法師以魔術防壁／結界減傷，補償其低耐久（救玻璃大砲美狄亞的存活）
  if (hasFx_(loser, 'territory') && !pierces('territory')) { base = Math.round(base * 0.74); fired.push(loser.name + '·' + fxName_(loser, 'territory', '陣地') + '·魔術防壁'); }
  else if (hasFx_(loser, 'territory')) { fired.push(winner.name + '·概念壓制(碾穿結界)'); }
  // ᚱ 原初符文(rune)：護符結界減傷 10%×階級(A→-17%/EX→-20%)。救持符文的玻璃法師(斯卡蒂/玉藻前/斯卡哈)存活。
  //   ※暫採「減傷」單一效果；未來可做「增傷/減傷/回合回血」三選一(需 UI／MEMORY 旗標)。
  var rn = hasFx_(loser, 'rune'); if (rn) { base = Math.round(base * (1 - 0.10 * rankMul_(rn))); fired.push(loser.name + '·' + fxName_(loser, 'rune', '原初符文') + '(護符減傷)'); }
  // 神核(divine_core)：減傷 18%×階級；但破魔薔薇(anti_magic_lance)等高位階概念無視神核護甲
  var dc = hasFx_(loser, 'divine_core');
  if (dc && (hasFx_(winner, 'anti_magic_lance') || pierces('divine_core'))) { fired.push(winner.name + '·' + (hasFx_(winner, 'anti_magic_lance') ? '破魔(無視神核)' : '概念壓制(無視神核)')); }
  else if (dc) { base = Math.round(base * (1 - 0.18 * rankMul_(dc))); fired.push(loser.name + '·' + fxName_(loser, 'divine_core', '神核')); }
  // 對魔力(nullify_magic)：攻方為魔術系(法師魔砲/魔力放出/神代)時大減魔術傷。
  //   ★原作精髓：A 階對魔力幾乎無視現代魔術——Saber 對 Caster 的魔砲僅如清風拂面。
  //   但神代魔術(神祖之術)凌駕現代對魔力＝完全無視(美狄亞的本領)；概念壓制亦無視。
  var atkMagic = (wProf.dmg === '魔力') || !!hasFx_(winner, 'burst') || !!hasFx_(winner, 'divine_age');
  var nm = hasFx_(loser, 'nullify_magic');
  if (atkMagic && nm && hasFx_(winner, 'divine_age')) { fired.push(winner.name + '·' + fxName_(winner, 'divine_age', '神代魔術') + '(凌駕對魔力)'); }
  else if (atkMagic && nm && pierces('nullify_magic')) { fired.push(winner.name + '·概念壓制(凌駕對魔力)'); }
  else if (atkMagic && nm) {
    var nmV = rankVal(nm);
    var red = 0.30 * rankMul_(nm);                 // 基礎：階級越高擋越多
    if (nmV >= 50) red = Math.max(red, 0.80);      // A 階以上：現代魔術近乎無效
    else if (nmV >= 40) red = Math.max(red, 0.55); // B 階：大幅削弱
    if (hasFx_(winner, 'divine_age')) red *= 0.3;  // 神代魔術凌駕一般對魔力（神祖之術，現代對魔力難擋）
    red = Math.min(0.92, red);
    base = Math.round(base * (1 - red)); fired.push(loser.name + '·' + fxName_(loser, 'nullify_magic', '對魔力') + (nmV >= 50 ? '(無視魔術)' : ''));
  }

  var damage = Math.max(1, base);

  var crit = (atkWins && aRoll === 20) ? 'atk_crit' : (!atkWins && dRoll === 20) ? 'def_crit'
    : (aRoll === 1 && !atkWins) ? 'atk_fumble' : (dRoll === 1 && atkWins) ? 'def_fumble' : '';
  // 🎯 暴擊(擲 20)＝多骰一輪武器骰再 +12（D&D 風「爆擊多擲傷害骰」），比固定 +30 更有起伏
  if (crit === 'atk_crit' || crit === 'def_crit') { var critDice = rollDice_(wTier, 8) + 12; damage += critDice; fired.push(winner.name + '·暴擊爆傷+' + critDice); }

  return {
    atkWins: atkWins, winner: winner.name, loser: loser.name, damage: damage,
    aRoll: aRoll, dRoll: dRoll, aHit: aHit, dEva: dEva, fired: fired, crit: crit,
    np: !!opts.np, seal: !!opts.seal
  };
}
