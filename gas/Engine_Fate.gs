// ==========================================
// ⚔️ Engine_Fate.gs — Fate 戰鬥核心：D20 ＋ 六圍(階級) ＋ fx 標籤 ＋ 寶具
//   每個 fx 效果都隨「技能階級」縮放（rankMul_），所以 對魔力B ≠ 對魔力A。
// ==========================================

// 階級倍率：以 C(30) 為 1.0 基準。E=0.33 D=0.67 C=1.0 B=1.33 A=1.67 EX=2.0；+ 各 +0.17
function rankMul_(r) { return rankVal(r) / 30; }

// 🎲 階級隨機區間（命中用）：每階級不取固定值，而是在 base-10 ~ base+5 之間隨機。
//   E:0~15 D:10~25 C:20~35 B:30~45 A:40~55 EX:50~65——相鄰階級區間重疊，
//   故低階偶能擲贏高階（爆冷），骰運重新有戲，不再「差一階就鎖死」。

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
  // 7｜理想鄉 Avalon：凌駕一切的無敵結界(概念 7 階·專剋 6 階究極寶具)。不入此表跑 pierce 數學——
  //    以 Router_Battle「敵解放≥6階概念 → Avalon 硬擋(耗100魔)」實現，等同不可被任何概念貫穿。
  // 6｜世界·真理級：斬裂世界，凌駕一切防禦與結界
  ea: 6, enuma: 6, // enuma＝恩奇都 Enuma Elish(天之楔·可匹敵乖離劍)

  // 5｜神祖·王權·斬契約級
  excalibur: 5, divine_age: 5, rule_breaker: 5,
  // 4｜固有結界·破魔·必中·深淵召喚·超位階盾級（唯 6 階 ea/enuma 可貫穿 rho_aias）
  ubw: 4, anti_magic_lance: 4, gae_bolg: 4, summon_horror: 4, rho_aias: 4,
  // 3｜傳說武技·不死·暗殺級
  god_hand: 3, tsubame: 3, zabaniya: 3, petrify: 3,
  // 2｜英靈防禦技能級（會被高位階概念壓制的那一層）
  nullify_magic: 2, divine_core: 2, territory: 2
};
var PIERCE_GAP = 2; // 攻方概念階高出守方此值以上 → 概念壓制（無視該防禦）
function conceptTier_(fx) { return CONCEPT_TIER[fx] || 1; }
// 取某戰鬥單位「進攻概念」的最高位階（只看寶具解放時真正打出的高位階攻擊概念）
function offenseTier_(c, isNp) {
  var pierceFx = isNp ? ['ea', 'enuma', 'excalibur', 'rule_breaker', 'ubw', 'summon_horror', 'anti_magic_lance', 'gae_bolg', 'tsubame', 'zabaniya', 'petrify']
                      : ['rule_breaker', 'anti_magic_lance']; // 非解放時，只有破戒/破魔這類「常駐穿透概念」生效
  var t = 1;
  for (var i = 0; i < pierceFx.length; i++) { if (hasFx_(c, pierceFx[i])) t = Math.max(t, conceptTier_(pierceFx[i])); }
  // 🌟 本次解放寶具「自身」的概念也計入(多寶具選定項 / 單寶具簽名)——修正吉爾 Ea·恩奇都 Enuma Elish 等
  //   寶具真名概念不必另掛成 skill 才生效(它們的 fx 在 npOptions 而非 skills，原本被 hasFx_ 漏掉)。
  if (isNp) { var _npfx = npProfile_(c).fx; if (_npfx) t = Math.max(t, conceptTier_(_npfx)); }
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
  // 🎴 寶具該是「決勝重拳·看得出差別」(2026-06 玩家定案·貼近原作：解放寶具就是要轟掉一大塊血)。
  //   仍非必秒(留給概念壓制/規模相剋/連戰)，但明顯凌駕普攻數倍。
  if (/EX/i.test(String(npRank))) return rollDice_(24, 10); // EX
  var v = rankVal(npRank);
  if (v >= 55) return rollDice_(20, 10);  // A+ / A++
  if (v >= 50) return rollDice_(18, 10);  // A
  if (v >= 40) return rollDice_(13, 10);  // B
  if (v >= 30) return rollDice_(9, 10);   // C
  if (v >= 20) return rollDice_(6, 10);   // D
  return rollDice_(4, 10);                // E
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
  if (hasFx_(c, 'ea') || hasFx_(c, 'enuma') || /對界/.test(np)) return '對界';
  // 🗡️ 無限劍製(ubw)＝固有結界的飽和彈幕＝對城級；🐙 召喚大海怪(summon_horror／青鬍子)＝深淵巨獸＝對城級
  if (hasFx_(c, 'excalibur') || hasFx_(c, 'ubw') || hasFx_(c, 'summon_horror') || /對城/.test(np)) return '對城';
  if (/對軍/.test(np)) return '對軍';
  if (/對神/.test(np)) return '對神';   // 弒神寶具(梵天弒神之槍等)：不入規模矩陣，傷害計算特判
  return '對人';
}
// 防禦規模表(對稱 npAtkScale_)：依 fx 定 NP 防禦規模，餵 NP_SCALE_MATRIX。優先序＝陣列順序(對城優先於對軍)。
//   ★固有結界(ubw)是進攻型 NP，NP 防禦由 rho_aias 機制承擔；divine_core/god_hand 各有自己的機制——均不疊加防禦規模。
var DEF_SCALE_ = [['summon_horror', '對城'], ['wall_def', '對城'], ['territory', '對軍']];
function npDefScale_(c) {
  for (var i = 0; i < DEF_SCALE_.length; i++) { if (hasFx_(c, DEF_SCALE_[i][0])) return DEF_SCALE_[i][1]; }
  return '對人';
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
// ⚡ 因果律武器：技能帶 causality:true 的從者，寶具對轟時死亡已在因果上先確定（Gáe Bolg 等）。
function hasCausalityNp_(c) {
  return (c.skills || []).some(function(s) { return s && s.causality; });
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

// ⚡🛡 技能 fx 戰鬥效果「格式表」（2026-07 資料驅動）：把散落的主動技 if 鏈＋線性被動加成收成一張表，
//   要加/調技能＝改一列，引擎(servantActiveSkill_＋fxHitAdd_/fxDmgApply_)自動吃。只收【線性加減乘】型；
//   骰子彈幕(gob/chain)、概念貫穿減傷(rho_aias/territory/神核)、時機/條件觸發(stealth/tsubame/petrify)等
//   特例邏輯【不進表】、保持明碼(硬塞進表＝過度工程)。欄位：
//     active/prio/mpPct/icon/descFn＝主動施放技術(開關制)專用；zh＝中文名(fired 標籤 fallback)；
//     hit/hitAdd＝命中加成(攻方)；dmgMul/dmgAdd＝傷害加成(勝方)——皆可為數字或 r=>.. 或 (r,c)=>..；
//     blockedByLoserFx＝敗方有此 fx 則免疫；silent＝套用時不推 fired 標籤(morale 靜默/self_mod 傷害段避免重列)。
var SKILL_FX_ = {
  // ⚡ 主動施放技術（開關制·單層）：tiny 版由 tinyActiveSkill_ 自動 ×ACTIVE_SKILL_TINY_ 生成
  burst: { active: true, prio: 1, mpPct: 0.15, icon: '💥', zh: '魔力放出', dmgMul: function (r) { return 1 + 0.45 * r; }, descFn: function (ht, dm) { return '本戰傷害 ×' + dm.toFixed(2) + '（灌注魔力放出）'; } },
  str_up: { active: true, prio: 2, mpPct: 0.12, icon: '💪', zh: '怪力', dmgAdd: function (r) { return Math.round(8 * r) + 14; }, descFn: function (ht, dm, da) { return '本戰傷害 +' + da + '（激發怪力）'; } },
  projection: { active: true, prio: 3, mpPct: 0.12, icon: '🗡️', zh: '投影魔術', hit: 9, dmgAdd: function (r, c) { return 34 + Math.round(rankVal((c.six && c.six['寶具']) || 'C') * 0.6); }, descFn: function (ht, dm, da) { return '本戰命中+' + ht + '、傷害+' + da + '（連續投影名劍齊射）'; } },
  // 🛡 常駐被動（每擊自動·免費）：resolveFateBattle_ 於其原位置呼 fxHitAdd_/fxDmgApply_ 套用(順序/標籤與改前一致)
  aim: { passive: true, zh: '千里眼', hitAdd: function (r) { return Math.round(4 * r); } },
  self_mod: { passive: true, zh: '自我改造', hitAdd: 2, dmgAdd: 3, silent: true }, // 傷害段靜默(命中段已列一次)
  morale: { passive: true, zh: '鼓舞', dmgAdd: function (r) { return Math.round(3 * r); }, blockedByLoserFx: 'clear_mind', silent: true },
  fast_cast: { passive: true, zh: '高速詠唱', note: '(連珠疊咒)', dmgAdd: function (r) { return Math.round(12 * r); } },
  mad: { passive: true, zh: '狂化', dmgAdd: function (r) { return Math.round(14 * r); } },       // 命中/迴避 -penalty 仍明碼(雙向·特殊)
  divine_age: { passive: true, zh: '神代魔術', dmgAdd: function (r) { return Math.round(12 * r); } }, // 使敵對魔力半效之交互 仍明碼
  wind_strike: { passive: true, zh: '風王鐵鎚', dmgAdd: function (r) { return Math.round(6 * r); } },
  crafting: { passive: true, zh: '道具作成', note: '(備妥之器)', dmgAdd: function (r) { return Math.round(8 * r); } }
};
function skillFxVal_(v, r, c) { return (typeof v === 'function') ? v(r, c) : v; }

// ⚡ 從者主動技（施放技術·開關制）：掃 SKILL_FX_ 中 active 者依 prio 取第一個持有的。無則 null。
//   數值隨技能自身階級成長(rank 折入)；tinyActiveSkill_ 產微量版(關閉時)。★只增益我方出擊、不碰防禦端。
function servantActiveSkill_(c) {
  var order = ['burst', 'str_up', 'projection']; // 優先序(prio)
  for (var i = 0; i < order.length; i++) {
    var fx = order[i], e = SKILL_FX_[fx], rk = hasFx_(c, fx);
    if (!e || !e.active || !rk) continue;
    var r = rankMul_(rk);
    var ht = e.hit != null ? Math.round(skillFxVal_(e.hit, r, c)) : 0;
    var dm = e.dmgMul != null ? skillFxVal_(e.dmgMul, r, c) : 1.0;
    var da = e.dmgAdd != null ? Math.round(skillFxVal_(e.dmgAdd, r, c)) : 0;
    return { id: fx, name: fxName_(c, fx, e.zh), icon: e.icon, mpPct: e.mpPct, hit: ht, dmgMul: dm, dmgAdd: da, desc: e.descFn(ht, dm, da) };
  }
  return null; // 無真·施放技術者→無主動技（戰力全在被動＋寶具）
}
// ⚡ 主動技【關閉】時的微量被動版：完整效果按 ACTIVE_SKILL_TINY_ 比例縮小、免費。開/關二選一、永不並存(不回 double-dip)。
var ACTIVE_SKILL_TINY_ = 0.35;
function tinyActiveSkill_(buff) {
  if (!buff) return null;
  var F = ACTIVE_SKILL_TINY_;
  return {
    id: buff.id, name: buff.name, icon: buff.icon, mpPct: 0, tiny: true,
    hit: Math.round((buff.hit || 0) * F),
    dmgMul: 1 + ((buff.dmgMul || 1) - 1) * F,
    dmgAdd: Math.round((buff.dmgAdd || 0) * F),
    desc: buff.desc
  };
}
// 🛡 被動命中加成套用（攻方持有 fx 時）：讀 SKILL_FX_[fx].hitAdd。回新 aHit，並推 fired 標籤。
function fxHitAdd_(aHit, atk, fx, fired) {
  var e = SKILL_FX_[fx], rk = e && hasFx_(atk, fx);
  if (!e || !rk || e.hitAdd == null) return aHit;
  var h = Math.round(skillFxVal_(e.hitAdd, rankMul_(rk), atk));
  // 命中段一律推 fired 標籤(self_mod 在此列一次；其傷害段以 silent 避免重列)。
  if (h) { aHit += h; fired.push(atk.name + '·' + fxName_(atk, fx, e.zh) + (e.note || '')); }
  return aHit;
}
// 🛡 被動傷害加成套用（勝方持有 fx 時）：讀 SKILL_FX_[fx].dmgMul/dmgAdd；blockedByLoserFx 則免疫。回新 base。
function fxDmgApply_(base, winner, loser, fx, fired) {
  var e = SKILL_FX_[fx], rk = e && hasFx_(winner, fx);
  if (!e || !rk) return base;
  if (e.blockedByLoserFx && hasFx_(loser, e.blockedByLoserFx)) { fired.push(loser.name + '·透化(免威壓)'); return base; }
  var r = rankMul_(rk);
  if (e.dmgMul != null) base = Math.round(base * skillFxVal_(e.dmgMul, r, winner));
  if (e.dmgAdd != null) { var a = Math.round(skillFxVal_(e.dmgAdd, r, winner)); if (a) base += a; }
  if (!e.silent) fired.push(winner.name + '·' + fxName_(winner, fx, e.zh) + (e.note || ''));
  return base;
}

// 🛡 防禦 fx 格式表（2026-07 資料驅動·對稱 SKILL_FX_）：敗方持有 → 傷害 ×mul，除非被概念貫穿(pierces(pierceKey))／
//   破魔(alsoPiercedByFx)／魔術穿透(physicalOnly 時 atkMagic)。骰子彈幕/必中/復活等仍明碼(不進表)。欄位：
//     mul＝減傷乘子(數字或 r=>..)｜pierceKey＝概念貫穿判定的防禦概念名｜zh/note＝fired 標籤｜
//     physicalOnly＝僅擋物理(魔術系穿透)｜alsoPiercedByFx＝此攻方 fx 亦無視此防禦｜
//     piercedMsg＝被貫穿時推的訊息 fn(winner)→string(無則靜默)｜guardPositive＝base>0 才推套用標籤。
var DEF_FX_ = {
  territory: { mul: 0.74, zh: '陣地', note: '·魔術防壁', pierceKey: 'territory', guardPositive: true, piercedMsg: function (w) { return w.name + '·概念壓制(碾穿結界)'; } },
  rho_aias: { mul: 0.60, zh: '七天盾', note: '(羅·埃亞斯·七層花瓣)', pierceKey: 'rho_aias' },
  divine_core: { mul: function (r) { return 1 - 0.18 * r; }, zh: '神核', pierceKey: 'divine_core', alsoPiercedByFx: 'anti_magic_lance', piercedMsg: function (w) { return w.name + '·' + (hasFx_(w, 'anti_magic_lance') ? '破魔(無視神核)' : '概念壓制(無視神核)'); } },
  wall_def: { mul: 0.82, zh: '城牆防禦', note: '(物理減傷18%)', pierceKey: 'territory', physicalOnly: true }
};
// 🛡 套用防禦減傷（敗方持有 fx 時）：pierces＝概念貫穿判定函式；atkMagic＝本擊是否魔術系。回新 base。
function fxDefApply_(base, loser, winner, fx, pierces, atkMagic, fired) {
  var e = DEF_FX_[fx], rk = e && hasFx_(loser, fx);
  if (!e || !rk) return base;
  if (e.physicalOnly && atkMagic) return base; // 魔術系攻擊穿透物理牆·無減傷無訊息
  if (pierces(e.pierceKey) || (e.alsoPiercedByFx && hasFx_(winner, e.alsoPiercedByFx))) {
    if (e.piercedMsg) fired.push(e.piercedMsg(winner)); // 被貫穿/破魔→減傷失效
    return base;
  }
  var m = (typeof e.mul === 'function') ? e.mul(rankMul_(rk)) : e.mul;
  var pre = base; base = Math.round(base * m);
  if (!e.guardPositive || pre > 0) fired.push(loser.name + '·' + fxName_(loser, fx, e.zh) + (e.note || ''));
  return base;
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
  // 🐕 主從synergy：理想御主(如恩奇都↔銀狼)把從者拉回原作全盛六圍；其餘御主維持削弱基線。
  six = masterSynergySix_(row[COL.PC.NAME], six, row[COL.PC.MEMORY]);
  return {
    name: row[COL.PC.NAME], cls: row[COL.PC.RANK] || '',
    six: six, skills: skills, traits: traits, np: row[COL.PC.MARTIAL] || '',
    hp: parseInt(row[COL.PC.HP]) || 100, hpMax: parseInt(row[COL.PC.MAX_HP]) || 100,
    mp: parseInt(row[COL.PC.MP]) || 50, mpMax: parseInt(row[COL.PC.MAX_MP]) || 50,
    // 🔋 出力電池制：從者靈基出力檔位(20~100)，決定本戰命中/傷害＋御主每小時維持費；御主預設凡人巡航 60。
    output: servantOutput_(row[COL.PC.MEMORY]),
    runeMode: runeMode_(row[COL.PC.MEMORY]), // 🔯 原初符文運用方式(def 減傷／dmg 增傷／regen 回血)
    npChoice: npChoice_(row[COL.PC.MEMORY]) // 🌟 多寶具英靈：玩家選定要解放的寶具索引(預設 0)
  };
}

// 🌟 多寶具英靈的「寶具選單」（玩家點寶具時挑要放哪個）。每項：n 寶具名／scale 尺度／fx 簽名效果碼／desc 短述。
//   依 真名(＋職階) 對應；首項＝主寶具(預設·敵方也用)。回 null＝單寶具(走字串尺度)。要擴充就往這張表加。
function servantNpOptions_(name, cls) {
  name = String(name || ''); cls = String(cls || '');
  if (name.indexOf('斯卡哈') === 0 && cls === 'Lancer') return [
    { n: '貫穿死翔之槍 Gáe Bolg Alternative', scale: '對人', fx: 'gae_bolg', desc: '單體·因果逆轉必中＋投擲斷命' },
    { n: '死亡滿溢的魔境之門 Gate of Skye', scale: '對軍', fx: '', desc: '對軍範圍·吸入影之國（魔力/幸運判定失敗即死）' }
  ];
  if (name.indexOf('吉爾伽美什') >= 0) return [
    { n: '王之財寶 Gate of Babylon', scale: '對人', fx: 'gob', desc: '對人·無盡兵裝的飽和彈幕' },
    { n: '乖離劍 Ea', scale: '對界', fx: 'ea', desc: '對界·天地乖離開闢之星，斬裂世界的最強一擊' }
  ];
  if (name.indexOf('恩奇都') >= 0) return [
    { n: '世人啊、冀以鎖繫神明 Enuma Elish', scale: '對界', fx: 'enuma', desc: '對界·天之楔·反星球/人類破壞行為增幅，可匹敵乖離劍的概念級一擊' },
    { n: '民之睿智 Age of Babylon', scale: '對軍', fx: 'gob', desc: '對軍·自大地召出萬千劍槍鎖齊射（用法類王之財寶·可抵銷之）' }
  ];
  if (name.indexOf('伊斯坎達爾') >= 0) return [
    { n: '王之軍勢 Ionioi Hetairoi', scale: '對軍', fx: '', desc: '對軍·固有結界召喚萬軍亂踏' },
    { n: '神威的車輪 Gordius Wheel', scale: '對人', fx: '', desc: '對人·雷神戰車的單騎衝鋒' }
  ];
  if (name.indexOf('EMIYA') >= 0 || name.indexOf('無名') >= 0) return [
    { n: '無限劍製 Unlimited Blade Works', scale: '對城', fx: 'ubw', desc: '對城·固有結界劍雨壓制（不受對魔力）' },
    { n: '偽·螺旋劍 Caladbolg II', scale: '對人', fx: 'projection', desc: '對人·破斷重塑的流星劍狙擊' }
  ];
  if (name.indexOf('迦爾納') >= 0) return [
    { n: '穿刺死亡之槍 Vasavi Shakti', scale: '對神', fx: '', desc: '對神·梵天弒神之槍：對神性之敵單體特大傷害（弒神）' },
    { n: '日輪啊化作鎧甲吧 Kavacha and Kundala', scale: '對人', fx: 'divine_core', desc: '對人·不滅黃金鎧·常駐防護' }
  ];
  return null;
}
// 單寶具退路：取該從者最主要的「寶具簽名 fx」（決定寶具乘子）。
function firstSignatureFx_(c) {
  var pri = ['ea', 'enuma', 'excalibur', 'ubw', 'summon_horror', 'gae_bolg', 'tsubame', 'zabaniya', 'petrify', 'gob'];
  for (var i = 0; i < pri.length; i++) { if (hasFx_(c, pri[i])) return pri[i]; }
  return '';
}
// 解出「本次寶具解放」的設定檔 {scale, fx, name, multi}。多寶具讀 c.npChoice 選定項；單寶具退回字串尺度＋簽名fx。
function npProfile_(c) {
  var op = servantNpOptions_(c.name, c.cls);
  if (op && op.length) {
    var idx = Math.max(0, Math.min(op.length - 1, parseInt(c.npChoice) || 0));
    return { scale: op[idx].scale, fx: op[idx].fx, name: op[idx].n, multi: true };
  }
  return { scale: npAtkScale_(c), fx: firstSignatureFx_(c), name: String(c.np || ''), multi: false };
}

// 主裁決：一次交手。回傳 {atkWins, winner, loser, damage, aRoll,dRoll,aHit,dEva, fired[], crit, np, seal}
function resolveFateBattle_(atk, def, opts) {
  opts = opts || {};
  var fired = [];
  var d20 = function () { return Math.floor(Math.random() * 20) + 1; };
  // 🌟 本次解放的寶具設定檔(多寶具讀 atk.npChoice 選定項，單寶具退回字串)。簽名效果一律以此判定，多寶具才選得對。
  var atkNp = opts.np ? npProfile_(atk) : null;
  var npIs = function (fx) { return atkNp && atkNp.fx === fx; };

  // 🌟 乖離劍·天地乖離開闢之星(ea)：英雄王自身血量≤40%才卸下傲慢「認真」——解放寶具(opts.np)時，
  //   以神靈概念分割越過一切防禦的「執行殺」。需玩家／敵方主動解放寶具(已由 actionFateBattle 上游補魔閘門把關)，
  //   非每擊免費觸發；血量充足時則走下方常規寶具路徑(×1.7 加成)，體現「對手不值得我認真」。
  if (opts.np && npIs('ea')) {
    var _selfHpPct = (atk.hpMax > 0) ? (atk.hp / atk.hpMax) : 1.0;
    if (typeof opts.selfHpPct === 'number') _selfHpPct = opts.selfHpPct;
    if (_selfHpPct <= 0.4) {
      var _eaDmg = Math.round(rankVal(atk.six['寶具']) * 4) + rollDice_(6, 12) + 200;
      fired.push(atk.name + '·乖離劍·天地乖離開闢之星(認真·執行殺)');
      return { atkWins: true, winner: atk.name, loser: def.name, damage: _eaDmg, aRoll: 20, dRoll: 0, aHit: 99, dEva: 0, fired: fired, crit: 'atk_crit', np: true, seal: !!opts.seal };
    }
  }
  // 💰 黃金律(wealth／吉爾伽美什)：絕境(自身血≤20%)時，自寶藏取出乖離劍(EA)執行殺翻盤。
  //   ★平衡修(2026-06)：須【主動解放寶具】(opts.np)才觸發——上游 actionFateBattle 的補魔閘門會扣御主魔力，
  //   故不再是「殘血時每一發普攻/反擊都免費執行殺」(原本掛在函式頂端每擊重入＝最破壞平衡的單點)。傷害保留。
  if (opts.np && hasFx_(atk, 'wealth')) {
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
  // 魔砲類型不加進 fired（每回合都是、無資訊量；territory 的 buff 效果只在有實際差距時才值得記）
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
  // 自我改造(self_mod)：命中 +2（被動·SKILL_FX_ 表驅動）
  aHit = fxHitAdd_(aHit, atk, 'self_mod', fired);
  // ⚡ 主動技（玩家本戰啟動）：命中加成 + 標記發動
  if (opts.skill) { aHit += (opts.skill.hit || 0); fired.push(atk.name + '·' + opts.skill.name + (opts.skill.tiny ? '(微量)' : '(主動技·全開)')); }
  // ✨ 禮裝被動加持·命中（御主禮裝注入我方從者，見 injectMysticBuff_）
  var mcAtk = mcCombatFx_(atk); if (mcAtk && mcAtk.hit) { aHit += mcAtk.hit; fired.push(atk.name + '·禮裝「' + mcAtk.label + '」(命中+' + mcAtk.hit + ')'); }

  // 騎乘(ride) 機動 +2×階級
  var rideA = hasFx_(atk, 'ride'); if (rideA) aHit += Math.round(2 * rankMul_(rideA));
  // 🎯 千里眼(aim)：恆常的卓越目力鎖破綻（被動·SKILL_FX_ 表驅動）。投影(projection) 為主動技 only、此處不給被動。
  aHit = fxHitAdd_(aHit, atk, 'aim', fired);
  // 🌟 全知全能之星(insight／吉爾伽美什)：看穿本質·洞悉破綻，恆常命中 +4（他懶得認真開·僅中等被動）。
  if (hasFx_(atk, 'insight')) { aHit += 4; fired.push(atk.name + '·' + fxName_(atk, 'insight', '全知全能之星') + '(洞悉破綻·命中+4)'); }
  // 避矢(evade_ranged)：守方對遠程(Archer)迴避 +6×階級
  if (atk.cls === 'Archer') { var er = hasFx_(def, 'evade_ranged'); if (er) { dEva += Math.round(6 * rankMul_(er)); fired.push(def.name + '·' + fxName_(def, 'evade_ranged', '避矢')); } }
  // 氣息遮斷(stealth)：僅【首擊奇襲】(opts.ambush·開場第一擊／敵突襲)吃命中加成·依階級(A+大、A-小)。
  //   ★一旦交手氣息即破功——後續回合的刀不再享奇襲(貼原作：發動攻擊瞬間 presence concealment 掉階)。
  var stA = hasFx_(atk, 'stealth');
  // 🐾 氣息感知(sense／恩奇都)：守方以穿透大地的感知看穿奇襲——階級 ≥ 攻方氣息遮斷者，
  //   突襲的命中先機＋下方「要害一擊」全數失效(貼原作「近距離廢掉同級以下的氣息遮斷」)。
  // 氣息感知(sense)＝穿透大地的感知；全知全能之星(insight／吉爾)＝看穿本質——兩者皆能看破奇襲。
  var senseD = hasFx_(def, 'sense') || hasFx_(def, 'insight');
  var senseNegate = !!(stA && senseD && rankVal(senseD) >= rankVal(stA));
  if (stA && opts.ambush) {
    if (senseNegate) { var _sN = hasFx_(def, 'sense') ? fxName_(def, 'sense', '氣息感知') : fxName_(def, 'insight', '全知全能之星'); fired.push(def.name + '·' + _sN + '·看穿奇襲(氣息遮斷失效)'); }
    else { aHit += Math.round(rankVal(stA) / 10); fired.push(atk.name + '·' + fxName_(atk, 'stealth', '氣息遮斷') + '·奇襲先機'); }
  }
  // 👑 王之財寶(gob)常駐：無盡兵裝鋪天蓋地，命中 +5（飽和彈幕難閃；傷害彈幕在下方）
  if (hasFx_(atk, 'gob')) { aHit += 5; fired.push(atk.name + '·' + fxName_(atk, 'gob', '王之財寶') + '(無盡兵裝)'); }
  // ⛓️ 天之鎖(chain)：命中加成併入既有「縛神性」效果(下方)；輸出走下方萬鎖彈幕。此處不另加命中(避免恩奇都過載)。
  // 燕返(tsubame)：寶具解放時次元摺疊令守方迴避 -5＋×2.3 傷害；普通出擊不適用（需全力釋放方能發動）
  var tsubame = hasFx_(atk, 'tsubame'); if (tsubame && opts.np && npIs('tsubame')) { dEva -= 5; fired.push(atk.name + '·' + fxName_(atk, 'tsubame', '秘劍')); }
  // 🔱 三騎士職階相剋（Saber→Lancer→Archer→Saber）：占上風者搶得先機，命中小幅領先（傷害加成在下方）
  var KNIGHT_BEATS = { 'Saber': 'Lancer', 'Lancer': 'Archer', 'Archer': 'Saber' };
  if (KNIGHT_BEATS[atk.cls] === def.cls) aHit += 3;
  else if (KNIGHT_BEATS[def.cls] === atk.cls) dEva += 3;
  // 🦊 變化(shapeshift／玉藻前·哈桑·恩奇都)：化形流轉，守方滑開致命一擊，迴避小幅提升
  var sm = hasFx_(def, 'shapeshift'); if (sm) { dEva += Math.round(3 * rankMul_(sm)); fired.push(def.name + '·' + fxName_(def, 'shapeshift', '變化') + '(化形閃避)'); }
  // 💋 愛之痣(lovespot／迪盧木多)：魅惑之痣令來犯者一瞬分神，攻方命中 -1(小幅惑亂)
  if (hasFx_(def, 'lovespot')) { aHit -= 1; fired.push(def.name + '·' + fxName_(def, 'lovespot', '愛之痣') + '(惑·敵命中-1)'); }
  // 👁️ 魔眼·石化(petrify／Rider 美杜莎)：以視線鎖死獵物，令對方迴避大減
  var pet = hasFx_(atk, 'petrify'); if (pet) { dEva -= Math.round(2 * rankMul_(pet)); fired.push(atk.name + '·' + fxName_(atk, 'petrify', '魔眼') + '·鎖死身法'); }
  // ⛓️ 天之鎖(chain／Gilgamesh)：對「神性」之敵展開冥界鎖鏈，封住身法
  var chn = hasFx_(atk, 'chain'); var defDivine0 = (def.traits || []).concat(def.skills || []).some(function (t) { return t && /神性|神格|神靈/.test(String(t.n)); });
  if (chn && defDivine0) { dEva -= Math.round(6 * rankMul_(chn)); fired.push(atk.name + '·' + fxName_(atk, 'chain', '天之鎖') + '(縛神性)'); }

  // 必中(gae_bolg)：寶具解放時逆因果直接命中
  var gaebolg = opts.np && npIs('gae_bolg'); if (gaebolg) fired.push(atk.name + '·' + fxName_(atk, 'gae_bolg', '必中之槍') + '(必中)');

  // 🍀 幸運＝上演劇情逆轉的旋鈕：幸運差≥2階 → 高者得福星骰(+0~6)、低者被命運捉弄。
  //   Saber(幸A+)的福星、庫丘林(幸E)屢屢倒楣戰死的詛咒——「故事與運氣才是裁判」實裝。
  //   做法＝自指變異(非對拼)：低運(≤D)每擊小機率失手、高運(≥A)小機率福星，製造爆冷與劇情感，而非讓高運方持續輾壓。
  var lkA = rankVal(atk.six['幸運']), lkD = rankVal(def.six['幸運']);
  if (lkA <= 20 && Math.random() < 0.08) { aHit -= 10; fired.push(atk.name + '·幸運' + (atk.six['幸運'] || 'E') + '·天不從人(失手)'); }
  else if (lkA >= 50 && Math.random() < 0.08) { aHit += 8; fired.push(atk.name + '·幸運·福星眷顧'); }
  if (lkD <= 20 && Math.random() < 0.08) { dEva -= 10; fired.push(def.name + '·幸運' + (def.six['幸運'] || 'E') + '·命運捉弄(露破綻)'); }
  else if (lkD >= 50 && Math.random() < 0.08) { dEva += 8; fired.push(def.name + '·幸運·絕處逢生'); }

  // 🩸 必中之槍·非全無解(貼原作)：因果逆轉雖直接命中，但【高幸運】能改寫既定命運、【直感/心眼】能預感殺機、【變化】能化形滑開。
  //   仍是強力寶具(一般從者照樣被釘死)，只有「能扭轉命運/超越感知」者才搏得一線生機。
  var gbEvaded = false;
  if (gaebolg) {
    var lkDef = rankVal(def.six['幸運']);
    var gbEsc = (lkDef >= 60 ? 0.35 : lkDef >= 50 ? 0.22 : lkDef >= 40 ? 0.10 : 0) // 幸運 A+/A/B
      + ((hasFx_(def, 'first_strike') || hasFx_(def, 'analyze')) ? 0.15 : 0)         // 直感/心眼
      + (hasFx_(def, 'shapeshift') ? 0.10 : 0);                                      // 變化·化形
    gbEsc = Math.min(0.6, gbEsc); // 上限 60%：再強也仍是「必中」級威脅
    if (gbEsc > 0 && Math.random() < gbEsc) {
      gbEvaded = true;
      fired.push(def.name + '·' + (lkDef >= 50 ? '幸運' + (def.six['幸運'] || '') + '改寫命運' : (hasFx_(def, 'shapeshift') ? '化形' : '直感')) + '·避開必中之槍！');
    }
  }
  var atkWins = gaebolg ? !gbEvaded : (aHit >= dEva);
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
  // ⚠ 怪力(str_up)／魔力放出(burst) 已改為【主動技 only】(見 servantActiveSkill_)——此處【不再】給被動傷害，
  //   消滅「被動＋主動雙重計算」；玩家須主動點 ⚡主動技 發動、耗魔力，方享其威能。
  // 勇猛/卡里斯瑪(morale·敵透化免疫)＋自我改造(self_mod)：常駐被動傷害（SKILL_FX_ 表驅動·位置順序不變）。
  base = fxDmgApply_(base, winner, loser, 'morale', fired);
  base = fxDmgApply_(base, winner, loser, 'self_mod', fired);
  // ✨ 禮裝被動加持·傷害（每擊+dmgAdd；解放寶具時另乘 npMul，如寶石劍奇蹟一擊 ×1.5）
  var mcWin = mcCombatFx_(winner);
  if (mcWin) {
    if (mcWin.dmgAdd) base += mcWin.dmgAdd;
    if (opts.np && mcWin.npMul && mcWin.npMul !== 1) { base = Math.round(base * mcWin.npMul); fired.push(winner.name + '·禮裝「' + mcWin.label + '」(寶具×' + mcWin.npMul + ')'); }
    else if (mcWin.dmgAdd) fired.push(winner.name + '·禮裝「' + mcWin.label + '」(傷+' + mcWin.dmgAdd + ')');
  }
  // ⚠ 投影魔術(projection) 已改為【主動技 only】(見 servantActiveSkill_)——連續投影名劍齊射的命中/傷害
  //   全併入主動技，此處【不再】給被動傷害；玩家須點 ⚡主動技 發動、耗魔力，方享劍雨齊射。
  // 🗡️ 首擊奇襲·要害一擊：氣息遮斷者開場突襲命中→額外重創(吃階級·一次性)。僅【普通首擊】生效——
  //   若開場直接解放寶具(opts.np)則走寶具自身爆發，不疊奇襲(避免奇襲×zabaniya 雙重爆擊一發秒人)。
  if (opts.ambush && atkWins && !opts.np && hasFx_(atk, 'stealth') && !senseNegate) {
    var amb = 1.2 + 0.12 * rankMul_(hasFx_(atk, 'stealth')); base = Math.round(base * amb);
    fired.push(atk.name + '·奇襲·要害一擊(×' + amb.toFixed(2) + ')');
  }
  // 🪄 高速詠唱(fast_cast／Caster)：一回合連珠疊咒·魔砲彈幕加成（SKILL_FX_ 表驅動）
  base = fxDmgApply_(base, winner, loser, 'fast_cast', fired);
  // 👑 王之財寶(gob)常駐彈幕：50d3捨1 的無盡兵裝飽和傷害（吉爾伽美什不必開寶具就壓制全場）
  if (hasFx_(winner, 'gob')) { var gv = gobVolley_(); base += gv; fired.push(winner.name + '·' + fxName_(winner, 'gob', '王之財寶') + '·無盡彈幕(' + gv + ')'); }
  // ⛓️ 天之鎖(chain)常駐彈幕：18d3捨1 萬鎖貫穿（金閃有 gob 則不重複；恩奇都專屬輸出，較王財小以平衡其頂級六圍）
  if (hasFx_(winner, 'chain') && !hasFx_(winner, 'gob')) { var cv = chainVolley_(); base += cv; fired.push(winner.name + '·' + fxName_(winner, 'chain', '天之鎖') + '·萬鎖貫穿(' + cv + ')'); }
  // 狂化(mad)傷害暴漲／神代魔術(divine_age·下方另使敵對魔力半效)／風王鐵鎚(wind_strike)／道具作成(crafting)：
  //   皆線性被動傷害加成，SKILL_FX_ 表驅動（位置順序不變；mad 的命中/迴避-penalty 與 divine_age 的對魔力交互仍明碼）。
  base = fxDmgApply_(base, winner, loser, 'mad', fired);
  base = fxDmgApply_(base, winner, loser, 'divine_age', fired);
  base = fxDmgApply_(base, winner, loser, 'wind_strike', fired);
  base = fxDmgApply_(base, winner, loser, 'crafting', fired);
  // 🗡️ 無毀的湖光(weapon_steal／蘭斯洛特·Arondight)：湖之妖精所託的魔劍，對具「龍」屬性之敵解放秘藏威能，傷害×1.5
  if (hasFx_(winner, 'weapon_steal')) {
    var foeDragon = (loser.traits || []).concat(loser.skills || []).some(function (t) { return t && /龍|竜/.test(String(t.n)); });
    if (foeDragon) { base = Math.round(base * 1.5); fired.push(winner.name + '·' + fxName_(winner, 'weapon_steal', '無毀的湖光') + '(對龍解放)'); }
  }
  // 神殺：對有「神性」者最終傷害放大。神性(divine fx 或特性)階級越高 → 越被神殺剋(×1.3~×1.83，依神性階)。
  //   觸發＝技能帶 fx:'god_slay'(資料驅動·如阿爾喀德斯復仇者) 或 技能/特性名含「神殺」(如斯卡哈)。
  var godSlay = hasFx_(winner, 'god_slay') || (winner.skills || []).concat(winner.traits || []).some(function (t) { return t && String(t.n).indexOf('神殺') >= 0; });
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
  if (atkWins && opts.np && npIs('tsubame')) base = Math.round(base * 2.3);
  // 寶具解放：主威力＝依寶具階級的 d10 基礎骰（E3→EX30）；階級小補正錦上添花（軍略 +15%、神性 +10%）
  if (opts.np) {
    // 解放寶具者贏了交手→套用「所選寶具」的簽名乘子；對手反殺(winner=def)則照其自身 fx(不受玩家寶具選擇影響)
    var wRelease = (winner === atk);
    var wSig = function (fx) { return wRelease ? npIs(fx) : !!hasFx_(winner, fx); };
    var npRank = winner.six["寶具"];
    var npDice = npBaseDice_(npRank); base += npDice; fired.push(winner.name + '·寶具骰(' + (rankVal(npRank) >= 60 ? 'EX' : npRank) + ')=' + npDice);
    base += Math.round(rankVal(npRank) * 1.2) + 35; fired.push(winner.name + '·寶具解放' + (wRelease && atkNp && atkNp.name ? ('·' + String(atkNp.name).split(' ')[0]) : '')); // 🎴 寶具威力大幅提升·看得出差別
    if (hasFx_(winner, 'tactics')) { base = Math.round(base * 1.15); fired.push(winner.name + '·' + fxName_(winner, 'tactics', '軍略')); }
    var wDivine = (winner.traits || []).some(function (t) { return t && /神性|神格|神靈/.test(String(t.n)); });
    if (wDivine) base = Math.round(base * 1.1);
    // 🗡️ 無限劍製(ubw／固有結界)：劍之地平展開，攻方在領域內傷害大增
    if (wSig('ubw')) { base = Math.round(base * 1.25); fired.push(winner.name + '·' + fxName_(winner, 'ubw', '無限劍製') + '(固有結界)'); }
    // 🗡️ 妄想心音／霧夜殺戮(zabaniya)：暗殺系寶具＝奪心一擊，命中即致命級重創（救低六圍刺客/狂戰的本命）
    if (wSig('zabaniya')) { base = Math.round(base * 1.9) + 70; fired.push(winner.name + '·' + fxName_(winner, 'zabaniya', '妄想心音') + '(奪心致命)'); }
    // 🐙 螺湮城教本(summon_horror／青鬍子)：自深淵召出觸手大海怪鋪天蓋地碾壓——救低六圍支援法師的本命一擊(對城規模)
    if (wSig('summon_horror')) { base = Math.round(base * 1.6) + rollDice_(8, 10) + 50; fired.push(winner.name + '·' + fxName_(winner, 'summon_horror', '螺湮城教本') + '(深淵海怪)'); }
    // 🌑 魔眼石化(petrify)致殘
    if (wSig('petrify')) { base = Math.round(base * 1.3); fired.push(winner.name + '·' + fxName_(winner, 'petrify', '魔眼') + '·乘隙重創'); }
    // 🌟 乖離劍·天地乖離開闢之星(ea)：概念位階 6，斬裂世界的真理之劍——最高威力，且無視一切防禦概念（下方概念壓制處理）
    if (wSig('ea')) { base = Math.round(base * 1.7) + rollDice_(4, 12) + 80; fired.push(winner.name + '·' + fxName_(winner, 'ea', '乖離劍') + '(天地乖離·真理之劍)'); }
    // 🏰 寶具規模相剋矩陣：對城打對人 ×2.5、對界碾壓常規防禦…（攻擊規模 × 守方防禦規模）。多寶具用所選寶具的尺度。
    var atkScaleLabel = (wRelease && atkNp) ? atkNp.scale : npAtkScale_(winner);
    // 🦠 疫病·病死宿命：蒼白騎兵(疫病具現)對「傳說中死於疾病」之敵(恩奇都等)，重演其宿命之死——無視規模防禦·概念碾壓 ×3。
    var plagueDoom = (winner.traits || []).some(function (t) { return t && /疫病/.test(String(t.n)); }) &&
                     (loser.traits || []).concat(loser.skills || []).some(function (t) { return t && /病死宿命/.test(String(t.n)); });
    // ⚔️ 對神(弒神寶具·梵天弒神之槍 Vasavi Shakti 等)：對「神性」之敵單體特大傷害(弒神)，對凡人僅單體重擊。不入規模矩陣，特判。
    var scaleMult;
    if (plagueDoom) { scaleMult = 3.0; }
    else if (atkScaleLabel === '對神') { scaleMult = loserDivine ? 2.4 : 1.15; }
    else { scaleMult = NP_SCALE_MATRIX[NP_SCALE_IDX[atkScaleLabel]][NP_SCALE_IDX[npDefScale_(loser)]]; }
    if (scaleMult !== 1) { base = Math.round(base * scaleMult); fired.push(winner.name + '·' + (plagueDoom ? '疫病·病死宿命(無可逃避·概念碾壓)' : (atkScaleLabel + '寶具' + (atkScaleLabel === '對神' && loserDivine ? '·弒神特大' : ''))) + ' vs ' + npDefScale_(loser) + '防(×' + scaleMult + ')'); }
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
  base = fxDefApply_(base, loser, winner, 'territory', pierces, atkMagic, fired);
  // 🛡️ 七天盾·羅·埃亞斯(rho_aias／EMIYA)：投影卡帕涅烏斯之盾，七層花瓣硬擋重擊；遭超位階概念(ea等)貫穿則失效
  base = fxDefApply_(base, loser, winner, 'rho_aias', pierces, atkMagic, fired);
  // 🦠 對瘟疫抗性：攻方為「疫病」(蒼白騎兵)時，守方持高魔抗(對魔力≥B·詛咒防護)或神性(神之加護)者抵抗疾病，傷害減半。
  //   ★唯「病死宿命」之敵(恩奇都)不適用——其宿命之死無可逃避(上方已 ×3 概念碾壓)。
  if (!plagueDoom && (winner.traits || []).some(function (t) { return t && /疫病/.test(String(t.n)); })) {
    var plagueImmune = rankVal(hasFx_(loser, 'nullify_magic')) >= 40 || (loser.traits || []).concat(loser.skills || []).some(function (t) { return t && /神性|神格|神靈/.test(String(t.n)); });
    if (plagueImmune) { base = Math.round(base * 0.5); fired.push(loser.name + '·對瘟疫抗性(魔抗/神性·疾病減半)'); }
  }
  // ᚱ 原初符文(rune)·玩家可選運用(c.runeMode)：def 減傷(受傷時·預設)／dmg 增傷(出擊時)／regen 回血(每回合·見 actionFateBattle)。
  //   減傷 10%×階級(A→-17%/EX→-20%)，救持符文的玻璃法師(斯卡蒂/玉藻前/斯卡哈)存活。regen 在此處無戰鬥修正、只在回合迴圈回血。
  var rnL = hasFx_(loser, 'rune');
  if (rnL && (loser.runeMode || 'def') === 'def') { base = Math.round(base * (1 - 0.10 * rankMul_(rnL))); fired.push(loser.name + '·' + fxName_(loser, 'rune', '原初符文') + '(護符減傷)'); }
  var rnW = hasFx_(winner, 'rune');
  if (rnW && winner.runeMode === 'dmg') { base += Math.round(10 * rankMul_(rnW)); fired.push(winner.name + '·' + fxName_(winner, 'rune', '原初符文') + '(符文灼擊·增傷)'); }
  // 神核(divine_core)：減傷 18%×階級；但破魔薔薇(anti_magic_lance)等高位階概念無視神核護甲
  base = fxDefApply_(base, loser, winner, 'divine_core', pierces, atkMagic, fired);
  // 對魔力(nullify_magic)：攻方為魔術系(法師魔砲/魔力放出/神代)時大減魔術傷。
  //   ★原作精髓：A 階對魔力幾乎無視現代魔術——Saber 對 Caster 的魔砲僅如清風拂面。
  //   但神代魔術(神祖之術)凌駕現代對魔力＝完全無視(美狄亞的本領)；概念壓制亦無視。
  // ⚡ 魔力放出改主動 only 後，「本擊是否魔術系」只在【實際發動魔力放出】時成立(灌注魔力才是魔術系一擊)，
  //   而非光憑持有 burst——否則沒發動時只吃對魔力減傷卻無 burst 增益，全是壞處。
  var burstFired = !!(opts.skill && opts.skill.id === 'burst' && !opts.skill.tiny && winner === atk);
  var atkMagic = (wProf.dmg === '魔力') || burstFired || !!hasFx_(winner, 'divine_age');
  var nm = hasFx_(loser, 'nullify_magic');
  // 概念壓制(更高位階進攻概念·破戒/破魔等)→完全無視對魔力；神代魔術→凌駕但【非無敵】(對魔力僅剩三成效果，見下)。
  if (atkMagic && nm && pierces('nullify_magic')) { fired.push(winner.name + '·概念壓制(凌駕對魔力)'); }
  else if (atkMagic && nm) {
    var nmV = rankVal(nm);
    var red = 0.30 * rankMul_(nm);                 // 基礎：階級越高擋越多
    if (nmV >= 50) red = Math.max(red, 0.80);      // A 階以上：現代魔術近乎無效
    else if (nmV >= 40) red = Math.max(red, 0.55); // B 階：大幅削弱
    var daWin = hasFx_(winner, 'divine_age');
    if (daWin) red *= 0.3;                          // 🔱 神代魔術凌駕現代對魔力：效果僅剩三成(非無敵·原作 Caster vs Saber 仍是硬仗)
    red = Math.min(0.92, red);
    base = Math.round(base * (1 - red));
    fired.push(loser.name + '·' + fxName_(loser, 'nullify_magic', '對魔力') + (daWin ? '(神代凌駕·殘三成)' : (nmV >= 50 ? '(無視魔術)' : '')));
  }
  // 🧱 城牆防禦(wall_def)：法師以魔術城牆隔絕物理衝擊，補償 Caster 低耐久（僅擋物理；魔術系傷害穿透）
  base = fxDefApply_(base, loser, winner, 'wall_def', pierces, atkMagic, fired);
  // ✨ 禮裝被動加持·承受寶具減傷（如全世界之鞘 ×0.82／月靈髓液攻防一體 ×0.88）：被動恆常生效，不受概念壓制
  var mcLose = mcCombatFx_(loser);
  if (mcLose && opts.np && mcLose.npDefMul && mcLose.npDefMul !== 1) { base = Math.round(base * mcLose.npDefMul); fired.push(loser.name + '·禮裝「' + mcLose.label + '」(寶具減傷×' + mcLose.npDefMul + ')'); }

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
