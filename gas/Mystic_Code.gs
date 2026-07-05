// ==========================================
// ✨ Mystic_Code.gs — 禮裝（御主裝備）系統（Block ③-2）
//   1 個專屬槽，存於御主 MEMORY：【禮裝】id。不佔道具欄。
//   ▸ 取得：創角玩家自選(2026-07)。⚠ 2026-07 玩家定案：迴路/財力門檻沒意義，已取消——
//     不論身世/迴路多少，皆可自由挑選任一款被動禮裝，不設限制。
// ==========================================

// 📕 禮裝圖鑑（2026-06 全面被動化·玩家定案）。type:'passive' 持有即生效，戰鬥時自動加持我方從者；
//   'special'＝破戒奪僕(另套機制)。不再有主動發動／充能／迴路門檻。
//   fx＝戰鬥效果碼(進 MC_COMBAT_ 表)；tier＝稀有度標記(僅供 rollMysticForMaster_ 保留的未來掉落用途分級，創角自選不吃這欄)。
var MYSTIC_CODES = {
  avalon: {
    name: '全世界之鞘 Avalon', type: 'passive', fx: 'avalon', tier: 5,
    desc: '亞瑟王傳說的理想鄉之鞘。持有時，從者氣血持續回復加快（時回），且承受寶具傷害大幅減免。',
    flavor: '溫煦的金色光輝自體內漫出，將傷勢一點一滴撫平——這是隔絕於世界之外的、永不凋零的理想鄉。'
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
  // ⚠ 2026-07 修(玩家要求全改官方)：查證 Rule Breaker 官方描述是「妖しく七色に輝く歪な形の短剣」
  //   (妖異七彩流光的歪異短劍)，非紅色——全專案「緣紅短劍」的既定命名一併正名為「七彩短劍」。
  rule_breaker: {
    name: '破戒全咒 Rule Breaker（七彩短劍）', type: 'special', fx: 'rule_break', tier: 5,
    desc: '美狄亞之寶具凝成的妖異七彩短劍。能斬斷一切締約——可對「打殘(HP<35%)的敵從者」斬契奪僕，化為你的第二從者（需燃一道令咒重締）。在地圖頁／敵卡操作。',
    flavor: '妖異七彩流光的短劍劃過，舊有的契約如琉璃般寸寸碎裂。'
  }
};

// ⚔️ 禮裝戰鬥效果表（被動·自動加持我方從者）：fx → {hit 命中+, dmgAdd 每擊傷+, npMul 寶具傷×(攻), npDefMul 承受寶具傷×(防)}。
//   要新增/調整禮裝戰力，只動這張表＋上面的 fx 對應；引擎(resolveFateBattle_)透過 mcCombatFx_ 自動讀取。
var MC_COMBAT_ = {
  mc_blackkey:    { hit: 2, dmgAdd: 0,  npMul: 1.0,  npDefMul: 1.0,  label: '黑鍵·牽制' },
  mc_jewel_minor: { hit: 1, dmgAdd: 10, npMul: 1.0,  npDefMul: 1.0,  label: '魔力儲存寶石' },
  avalon:         { hit: 0, dmgAdd: 0,  npMul: 1.0,  npDefMul: 0.82, label: '全世界之鞘' },
  // 🗡️ Avalon 回到正主阿爾托莉雅手中：被動＝鞘之基本減傷(×0.82·同一般 Avalon)＋時回；
  //    「理想鄉·無敵結界」的【完全擋寶具】＝被動自動(無開關)：敵解放 6 階究極寶具(ea/enuma)且御主魔力≥100
  //    → Router_Battle 敵擊前攔截完全擋下＋扣 100 魔（見 idealRealm 邏輯），不在此表永久生效。
  avalon_saber:   { hit: 0, dmgAdd: 0,  npMul: 1.0,  npDefMul: 0.82, label: '全世界遙遠的理想鄉' }
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
  // 🗡️ Avalon（全世界之鞘）回到正主阿爾托莉雅手中 → 注入 avalon_saber(鞘之基本減傷 ×0.82·同一般 avalon)＋常駐時回(regen)；
  //   「完全擋 6 階究極寶具」由 Router_Battle 理想鄉攔截(耗 100 魔)以 avalon_saber 旗標觸發，非此處乘子。
  //   非阿爾托莉雅持 Avalon → 走下方一般 avalon(鞘之基本減傷 ×0.82·無理想鄉攔截)。
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

// 🎲 依財力/身世「機率」給禮裝（非 100%）。⚠ 2026-07 創角已改【玩家自選】(Router_Creation 讀 userData.mystic)，
//   此函式現無呼叫者·保留給「戰中可另獲禮裝」等未來掉落用途。鉅富/名門/鐘塔→高機率好禮裝；窮學徒→多半空手。
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
