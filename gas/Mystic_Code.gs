// ==========================================
// ✨ Mystic_Code.gs — 禮裝（御主裝備）系統（Block ③-2）
//   1 個專屬槽，存於御主 MEMORY：【禮裝】id、【禮充】n（剩餘充能）。不佔道具欄。
//   ▸ 取得：創角依財力/身世機率給；戰中可另獲（非 100%）。
//   ▸ 使用難度（肯尼斯·月靈髓液精髓）：強禮裝吃魔術迴路——啟動時若御主迴路 ≥ 需求→全力；
//     不足→走火（威力打折＋魔力反噬，差越多越慘），再加魔力消耗＋充能上限。
// ==========================================

// 📕 禮裝圖鑑（2026-06 全面被動化·玩家定案）。type:'passive' 持有即生效，戰鬥時自動加持我方從者；
//   'special'＝破戒奪僕(另套機制)。不再有主動發動／充能／迴路門檻。
//   fx＝戰鬥效果碼(進 MC_COMBAT_ 表)；tier＝稀有度(創角依財力給的門檻)。
var MYSTIC_CODES = {
  avalon: {
    name: '全世界之鞘 Avalon', type: 'passive', fx: 'avalon', tier: 5,
    desc: '亞瑟王傳說的理想鄉之鞘。持有時，從者氣血持續回復加快（時回），且承受寶具傷害大幅減免。',
    flavor: '溫煦的金色光輝自體內漫出，將傷勢一點一滴撫平——這是隔絕於世界之外的、永不凋零的理想鄉。'
  },
  jeweled_sword: {
    name: '寶石劍 Zelretch', type: 'passive', fx: 'mc_jewel', tier: 5,
    desc: '第二魔法的結晶兵裝。傾瀉平行世界魔力於從者寶具，解放時威力奇蹟般大增。',
    flavor: '寶石劍引來貫穿平行世界的魔力洪流，注入從者的寶具——這一擊已不只屬於這個世界。'
  },
  volumen: {
    name: '月靈髓液（水銀）', type: 'passive', fx: 'mc_mercury', tier: 4,
    desc: '肯尼斯引以為傲的攻防一體水銀禮裝。如活物般環繞從者，攻擊更銳、且削減承受的寶具傷害。',
    flavor: '銀色水銀如有生命般環身翻湧，既是斬向敵手的千刃、也是擋下殺著的壁壘。'
  },
  origin_bullet: {
    name: '起源彈', type: 'passive', fx: 'mc_origin', tier: 3,
    desc: '衛宮切嗣的特製彈：以「斷絕」為起源。從者攻擊染上斷絕之概念，命中更準、傷害更沉。',
    flavor: '那以「斷絕」為起源的概念悄然附於每一擊——擦中即是難以挽回的崩解。'
  },
  jewels: {
    name: '魔力儲存寶石', type: 'passive', fx: 'mc_jewel_minor', tier: 2,
    desc: '遠坂家風格的儲魔寶石。源源供給從者額外魔力，每擊傷害略增。',
    flavor: '袖中寶石微微發燙，將封存的魔力一縷縷渡入從者的每一次出手。'
  },
  black_keys: {
    name: '黑鍵', type: 'passive', fx: 'mc_blackkey', tier: 1,
    desc: '聖堂教會代行者的擲擊聖鍵。輕巧的牽制掩護，讓從者出手時的命中略為提升。',
    flavor: '數柄黑色聖鍵不時自暗處激射牽制，為從者撕開一線可乘之機。'
  },
  rule_breaker: {
    name: '破戒全咒 Rule Breaker（緣紅短劍）', type: 'special', fx: 'rule_break', tier: 5,
    desc: '美狄亞之寶具凝成的緣紅短劍。能斬斷一切締約——可對「打殘(HP<35%)的敵從者」斬契奪僕，化為你的第二從者（需燃一道令咒重締）。在地圖頁／敵卡操作。',
    flavor: '緣紅的短劍劃過，舊有的契約如琉璃般寸寸碎裂。'
  }
};

// ⚔️ 禮裝戰鬥效果表（被動·自動加持我方從者）：fx → {hit 命中+, dmgAdd 每擊傷+, npMul 寶具傷×(攻), npDefMul 承受寶具傷×(防)}。
//   要新增/調整禮裝戰力，只動這張表＋上面的 fx 對應；引擎(resolveFateBattle_)透過 mcCombatFx_ 自動讀取。
var MC_COMBAT_ = {
  mc_blackkey:    { hit: 2, dmgAdd: 0,  npMul: 1.0,  npDefMul: 1.0,  label: '黑鍵·牽制' },
  mc_jewel_minor: { hit: 1, dmgAdd: 10, npMul: 1.0,  npDefMul: 1.0,  label: '魔力儲存寶石' },
  mc_origin:      { hit: 3, dmgAdd: 8,  npMul: 1.0,  npDefMul: 1.0,  label: '起源彈·斷絕' },
  mc_mercury:     { hit: 4, dmgAdd: 0,  npMul: 1.0,  npDefMul: 0.88, label: '月靈髓液·攻防一體' },
  mc_jewel:       { hit: 0, dmgAdd: 0,  npMul: 1.5,  npDefMul: 1.0,  label: '寶石劍·奇蹟一擊' },
  avalon:         { hit: 0, dmgAdd: 0,  npMul: 1.0,  npDefMul: 0.82, label: '全世界之鞘' },
  // 🗡️ 理想鄉：Avalon 回到正主阿爾托莉雅手中＝隔絕於世界之外的無敵結界，承受寶具傷近乎歸零(×0.20)。
  avalon_saber:   { hit: 0, dmgAdd: 0,  npMul: 1.0,  npDefMul: 0.20, label: '全世界遙遠的理想鄉' }
};
// 取某戰鬥單位身上的禮裝戰鬥效果（找第一個命中 MC_COMBAT_ 的 fx）。回 null＝無。
function mcCombatFx_(c) {
  var all = (c && c.skills || []).concat(c && c.traits || []);
  for (var i = 0; i < all.length; i++) { var s = all[i]; if (s && s.fx && MC_COMBAT_[s.fx]) return MC_COMBAT_[s.fx]; }
  return null;
}
// 御主持有的禮裝 → 給我方從者注入的「被動加持技能」{n,r,fx}（戰鬥單位建好後注入 skills）。無戰鬥效果(如破戒)回 null。
function masterMysticBuffSkill_(memory) {
  var id = getMystic_(memory); if (!id) return null;
  var code = MYSTIC_CODES[id]; if (!code || !code.fx || !MC_COMBAT_[code.fx]) return null;
  return { n: code.name, r: 'A', fx: code.fx };
}
// 把御主禮裝被動加持注入「我方從者」戰鬥單位 c（c 由 servantRow 建；masterMemory＝其御主 MEMORY）。已注入則略過。
function injectMysticBuff_(c, masterMemory) {
  // 🗡️ Avalon（全世界之鞘）回到正主阿爾托莉雅手中 → 理想鄉全效：承受寶具傷近乎歸零(avalon_saber ×0.20)＋常駐時回(regen)。
  //   非阿爾托莉雅持 Avalon → 走下方一般 avalon(鞘之基本減傷 ×0.82)。
  if (getMystic_(masterMemory) === 'avalon' && c && /阿爾托莉雅/.test(String(c.name || '')) && String(c.cls) === 'Saber') {
    c.skills = (c.skills || []);
    if (!c.skills.some(function (s) { return s && s.fx === 'avalon_saber'; })) c.skills = c.skills.concat([{ n: '理想鄉 Avalon', r: 'A', fx: 'avalon_saber' }]);
    if (!c.skills.some(function (s) { return s && s.fx === 'regen'; })) c.skills = c.skills.concat([{ n: '鞘之恩澤', r: 'A', fx: 'regen' }]);
    return c;
  }
  var sk = masterMysticBuffSkill_(masterMemory); if (!sk) return c;
  c.skills = (c.skills || []);
  if (!c.skills.some(function (s) { return s && s.fx === sk.fx; })) c.skills = c.skills.concat([sk]);
  return c;
}

// 🗝️ 是否具破戒全咒之力：我方從者帶 rule_breaker(Caster) 或 御主持破戒禮裝
function canRuleBreak_(pcData, pIdx, gameId) {
  if (masterMysticFx_(pcData[pIdx][COL.PC.MEMORY], 'rule_break')) return true;
  for (var i = 1; i < pcData.length; i++) {
    if (String(pcData[i][COL.PC.FACTION]) === "從者" && String(pcData[i][COL.PC.GAME_ID] || "") === gameId && !String(pcData[i][COL.PC.ID]).startsWith("DEAD_")) {
      if (hasFx_(rowToCombatant_(pcData[i]), 'rule_breaker')) return true;
    }
  }
  return false;
}

// ── 存取：【禮裝】id（禮裝全面被動化後，不再有【禮充】充能）──
function getMystic_(memory) { var m = String(memory || "").match(/【禮裝】([a-z_]+)/); return m ? m[1] : ""; }
function setMystic_(memory, id) {
  var s = String(memory || "");
  if (/【禮裝】[a-z_]+/.test(s)) s = s.replace(/【禮裝】[a-z_]+/, "【禮裝】" + id);
  else s = (s ? s + "｜" : "") + "【禮裝】" + id;
  return s;
}
// 持有的禮裝是否帶某 fx（給戰鬥/時回查被動用，如 avalon）
function masterMysticFx_(memory, fx) { var id = getMystic_(memory); return (id && MYSTIC_CODES[id] && MYSTIC_CODES[id].fx === fx) ? id : ""; }

// 🎲 創角依財力/身世「機率」給禮裝（非 100%）。鉅富/名門/鐘塔→高機率好禮裝；窮學徒→多半空手。
function rollMysticForMaster_(standing, circuits) {
  var s = String(standing || ""), c = parseInt(circuits) || 30;
  var rich = /鐘塔|貴族|名門|富|世家|豪|大魔術師|君主|繼承|聖堂|教會|協會菁英/.test(s);
  var poor = /平民|學徒|孤兒|貧|流浪|無名|散|庶民|養子/.test(s);
  var roll = Math.random();
  // 機率帶：富裕高機率拿到強禮裝；一般中等；清貧多半空手或廉價品
  if (rich || c >= 45) {
    if (roll < 0.30) return pickByTier_([5]);          // 30% 頂級
    if (roll < 0.70) return pickByTier_([3, 4]);       // 40% 中高
    if (roll < 0.90) return pickByTier_([1, 2]);       // 20% 入門
    return "";                                         // 10% 空手
  } else if (poor || c < 20) {
    if (roll < 0.35) return pickByTier_([1]);          // 35% 廉價
    if (roll < 0.50) return pickByTier_([2]);          // 15% 入門
    return "";                                         // 50% 空手
  } else {
    if (roll < 0.15) return pickByTier_([4, 5]);       // 15% 高階
    if (roll < 0.55) return pickByTier_([2, 3]);       // 40% 中階
    if (roll < 0.80) return pickByTier_([1]);          // 25% 入門
    return "";                                         // 20% 空手
  }
}
function pickByTier_(tiers) {
  var pool = Object.keys(MYSTIC_CODES).filter(function (k) { return tiers.indexOf(MYSTIC_CODES[k].tier) >= 0; });
  if (!pool.length) return "";
  return pool[Math.floor(Math.random() * pool.length)];
}

// 給御主 MEMORY 裝上禮裝（被動·持有即生效），回傳新 memory
function equipMysticToMemory_(memory, id) {
  if (!id || !MYSTIC_CODES[id]) return memory;
  return setMystic_(memory, id);
}
