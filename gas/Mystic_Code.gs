// ==========================================
// ✨ Mystic_Code.gs — 禮裝（御主裝備）系統（Block ③-2）
//   1 個專屬槽，存於御主 MEMORY：【禮裝】id。不佔道具欄，創角自選，不設迴路/財力門檻。
// ==========================================

// 📕 禮裝圖鑑。type:'passive' 持有即生效，自動加持我方從者；'special'＝破戒奪僕(另套機制)。
//   fx＝戰鬥效果碼(進 MC_COMBAT_ 表)；tier 目前無消費端，純資料備註。
var MYSTIC_CODES = {
  avalon: {
    name: '全世界之鞘 Avalon', type: 'passive', fx: 'avalon', tier: 5,
    desc: '亞瑟王傳說的理想鄉之鞘。持有時，從者體力持續回復加快（時回），且承受寶具傷害大幅減免。',
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
  // 官方設定 Rule Breaker 是七彩流光短劍非紅色，故正名（原「緣紅短劍」）。
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
  // ⚠ 單一真實來源提醒(2026-07稽核抓到)：這裡的 npDefMul 0.82 沒有階級縮放(禮裝不像從者技能吃
  //   rankMul_)，是純手動維護的常數——Script.html 的 FX_DESC.avalon_saber／showIdealRealm() 各自
  //   手打了一份「×0.82」文字(GAS常數無法直接餵給client端HTML)，日後調整這裡記得同步改那兩處。
  avalon:         { hit: 0, dmgAdd: 0,  npMul: 1.0,  npDefMul: 0.82, label: '全世界之鞘' },
  // Avalon 回到阿爾托莉雅手中時減傷/時回同一般 avalon；理想鄉全擋 6 階究極寶具是 Router_Battle.gs
  // 的攔截判定(idealRealm，耗 100 魔，見該檔 offenseTier_>=6 分支)，不在此表常駐生效。同上，
  // Script.html 的「≥100/100 魔」文字也是手動維護的複本，改這裡的門檻/耗魔量記得同步那邊。
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
  // 持 Avalon 的阿爾托莉雅額外標記 avalon_saber + 時回，供 Router_Battle 理想鄉攔截判定用；
  // 非阿爾托莉雅持 Avalon 走下方一般被動(僅減傷，無理想鄉攔截)。
  // 🐛→✅ 舊版用子字串正則(/阿爾托莉雅/.test(...))比對，玩家自訂/AI 生成的 Saber 從者只要真名剛好
  //   包含這四個字(如刻意取名「阿爾托莉雅・奧爾塔」)就會被誤判成王之聖劍的合法持有者——這類機制本該
  //   資料驅動(如 FORGE_CLS_SKILLS_/ALLOWED_FX_)、至少也該用精確比對，改成完整真名相等。
  // 🐛→✅ 2026-07 前次修正比對錯了字串：種子真名其實是「阿爾托莉雅·潘德拉貢」(Seed_Codex.gs)，
  //   前次改的完整相等只比對到「阿爾托莉雅」四字，永遠對不上召喚後 c.name 的完整全名，導致理想鄉
  //   對唯一合法持有者(正典本尊)從此再也無法觸發——改比對真正的完整真名。
  if (getMystic_(masterMemory) === 'avalon' && c && String(c.name || '').trim() === '阿爾托莉雅·潘德拉貢' && String(c.cls) === 'Saber') {
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

// 給御主 MEMORY 裝上禮裝（被動·持有即生效），回傳新 memory
function equipMysticToMemory_(memory, id) {
  if (!id || !MYSTIC_CODES[id]) return memory;
  return setMystic_(memory, id);
}
