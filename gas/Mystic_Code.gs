// ==========================================
// ✨ Mystic_Code.gs — 禮裝（御主裝備）系統（Block ③-2）
//   1 個專屬槽，存於御主 MEMORY：【禮裝】id、【禮充】n（剩餘充能）。不佔道具欄。
//   ▸ 取得：創角依財力/身世機率給；戰中可另獲（非 100%）。
//   ▸ 使用難度（肯尼斯·月靈髓液精髓）：強禮裝吃魔術迴路——啟動時若御主迴路 ≥ 需求→全力；
//     不足→走火（威力打折＋魔力反噬，差越多越慘），再加魔力消耗＋充能上限。
// ==========================================

// 📕 禮裝圖鑑。type:'passive' 持有即生效；'active' 需啟動（耗魔力/充能/吃迴路）。
//   req＝全力發揮所需魔術迴路；mp＝啟動魔力消耗（御主MP）；charges＝充能次數；power＝威力係數；
//   target:'servant'|'master'；tier＝稀有度(創角依財力給的門檻)。
var MYSTIC_CODES = {
  avalon: {
    name: '全世界之鞘 Avalon', type: 'passive', fx: 'avalon', tier: 5, req: 0, mp: 0, charges: 0, power: 0, target: '',
    desc: '亞瑟王傳說的理想鄉之鞘。持有時，從者氣血持續回復加快，並對寶具傷害有所減免。',
    flavor: '溫煦的金色光輝自體內漫出，將傷勢一點一滴撫平——這是隔絕於世界之外的、永不凋零的理想鄉。'
  },
  jeweled_sword: {
    name: '寶石劍 Zelretch', type: 'active', fx: 'jewel_blast', tier: 5, req: 45, mp: 60, charges: 2, power: 2.0, target: 'servant',
    desc: '第二魔法的結晶兵裝。傾瀉龐大魔力的奇蹟一擊，足以打破僵局、轟破不死之軀。極吃迴路。',
    flavor: '寶石劍尖凝聚起足以扭曲因果的魔力洪流，向目標傾瀉出一道貫穿平行世界的奇蹟之光。'
  },
  volumen: {
    name: '月靈髓液（水銀）', type: 'active', fx: 'mercury', tier: 4, req: 50, mp: 45, charges: 99, power: 1.4, target: 'servant',
    desc: '肯尼斯引以為傲的攻防一體水銀禮裝。威力強橫，但對掌控者的迴路要求極高——駕馭不了便是反噬。',
    flavor: '銀色的水銀如有生命般翻湧而起，化作千百道利刃與壁壘，朝目標絞殺而去。'
  },
  origin_bullet: {
    name: '起源彈', type: 'active', fx: 'origin_round', tier: 3, req: 20, mp: 30, charges: 3, power: 1.0, target: 'master',
    desc: '衛宮切嗣的特製彈：以自身起源「斷絕」貫入，破壞敵御主的魔術迴路。專獵御主的暗殺利器。',
    flavor: '一聲悶響，那發以「斷絕」為起源的子彈精準貫入——魔術迴路被生生攪碎，再無迴轉的可能。'
  },
  jewels: {
    name: '魔力儲存寶石', type: 'active', fx: 'jewel_minor', tier: 2, req: 15, mp: 25, charges: 5, power: 0.7, target: 'servant',
    desc: '遠坂家風格的儲魔寶石。預先封存魔力、臨陣釋放中等魔力衝擊，輕便而易於驅使。',
    flavor: '指間的寶石應聲碎裂，封存其中的魔力化作一道衝擊轟然迸發。'
  },
  black_keys: {
    name: '黑鍵', type: 'active', fx: 'black_key', tier: 1, req: 5, mp: 15, charges: 6, power: 0.4, target: 'servant',
    desc: '聖堂教會代行者的擲擊聖鍵。輕巧廉價的牽制，魔力門檻極低、人人可使。',
    flavor: '數柄細長的黑色聖鍵自指縫激射而出，劃破空氣釘向目標。'
  },
  rule_breaker: {
    name: '破戒全咒 Rule Breaker（緣紅短劍）', type: 'special', fx: 'rule_break', tier: 5, req: 0, mp: 0, charges: 0, power: 0, target: '',
    desc: '美狄亞之寶具凝成的緣紅短劍。能斬斷一切締約——可對「打殘(HP<35%)的敵從者」斬契奪僕，化為你的第二從者（需燃一道令咒重締）。在地圖頁／敵卡操作。',
    flavor: '緣紅的短劍劃過，舊有的契約如琉璃般寸寸碎裂。'
  }
};

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

// ── 存取：【禮裝】id、【禮充】n ──
function getMystic_(memory) { var m = String(memory || "").match(/【禮裝】([a-z_]+)/); return m ? m[1] : ""; }
function setMystic_(memory, id) {
  var s = String(memory || "");
  if (/【禮裝】[a-z_]+/.test(s)) s = s.replace(/【禮裝】[a-z_]+/, "【禮裝】" + id);
  else s = (s ? s + "｜" : "") + "【禮裝】" + id;
  return s;
}
function getMysticCharges_(memory) { var m = String(memory || "").match(/【禮充】(\d+)/); return m ? parseInt(m[1]) : -1; }
function setMysticCharges_(memory, n) {
  var s = String(memory || "");
  if (/【禮充】\d+/.test(s)) return s.replace(/【禮充】\d+/, "【禮充】" + n);
  return (s ? s + "｜" : "") + "【禮充】" + n;
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

// 給御主 MEMORY 裝上禮裝（含初始充能），回傳新 memory
function equipMysticToMemory_(memory, id) {
  if (!id || !MYSTIC_CODES[id]) return memory;
  var mem = setMystic_(memory, id);
  var code = MYSTIC_CODES[id];
  if (code.type === 'active') mem = setMysticCharges_(mem, code.charges);
  return mem;
}

// 🩸 對從者套用禮裝傷害（god_hand/戰鬥續行/消滅/勝利判定），仿 fateStrike_ 的死亡處理
function applyMysticDamageToServant_(sheets, pcData, tgtIdx, dmg, ctx) {
  var out = { destroyed: "", godRevived: false, godNote: "", victory: false, after: 0 };
  var defC = rowToCombatant_(pcData[tgtIdx]);
  var hp = parseInt(pcData[tgtIdx][COL.PC.HP]) || 0;
  var after = hp - dmg;
  if (after <= 5 && hasFx_(defC, 'survive') && hp > 1) { after = 1; }
  if (after <= 0 && hasFx_(defC, 'god_hand')) {
    var lives = getGodHandLives_(pcData[tgtIdx][COL.PC.MEMORY]);
    if (lives > 0) {
      out.godRevived = true;
      pcData[tgtIdx][COL.PC.HP] = Math.max(1, Math.round((parseInt(pcData[tgtIdx][COL.PC.MAX_HP]) || 480) * 0.40));
      pcData[tgtIdx][COL.PC.MEMORY] = setGodHandLives_(pcData[tgtIdx][COL.PC.MEMORY], lives - 1);
      sheets.pc.getRange(tgtIdx + 1, 1, 1, pcData[tgtIdx].length).setValues([pcData[tgtIdx]]);
      out.godNote = '「' + pcData[tgtIdx][COL.PC.NAME] + '」自死亡歸來（餘 ' + (lives - 1) + ' 命）。';
      out.after = parseInt(pcData[tgtIdx][COL.PC.HP]) || 0;
      return out;
    }
  }
  if (after <= 0) {
    out.destroyed = String(pcData[tgtIdx][COL.PC.NAME]);
    pcData[tgtIdx][COL.PC.ID] = "DEAD_" + String(pcData[tgtIdx][COL.PC.ID]);
    pcData[tgtIdx][COL.PC.HP] = 0;
    pcData[tgtIdx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "禮裝轟殺·消滅", "顏面": "已無生息" });
    sheets.pc.getRange(tgtIdx + 1, 1, 1, pcData[tgtIdx].length).setValues([pcData[tgtIdx]]);
    if (String(pcData[tgtIdx][COL.PC.FACTION]) === "敵從者" && aliveEnemyServants_(sheets, ctx.myGameId) <= 0) {
      out.victory = true;
      var acctW = String(ctx.acctName || "");
      if (acctW) { incrementWin_(acctW); recordHistory_(acctW, "勝", ctx.masterName, "以禮裝之力斬盡敵從者，奪得聖杯。"); }
    }
  } else {
    pcData[tgtIdx][COL.PC.HP] = after;
    sheets.pc.getRange(tgtIdx + 1, 1, 1, pcData[tgtIdx].length).setValues([pcData[tgtIdx]]);
  }
  out.after = parseInt(pcData[tgtIdx][COL.PC.HP]) || 0;
  return out;
}
