// ==========================================
// ⏳ Time_World.gs — 輕量時間流動 ＋ 世界自走（找回 AP 爽感，砍掉維持費經濟）
//   1 AP = 1 小時。移動 2／戰鬥 1／補魔 1／偵查 1 耗 AP；聊天/令咒自身向 ＝ 0（凍結）。
//   休息：玩家自選時數，每小時補 2 AP（6h 補滿）。何時休由玩家決定。
//   世界 tick（移動/休息時）：敵移位(偵查失效) ＋ 暗處從者陣亡(戰爭自走)。
// ==========================================
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。

var AP_PER_DAY = 12; // 體力池上限（1 AP = 1 小時的行動）
// ⏳ 聖杯戰爭的期限＝這一局的敗北條件本身。2026-09 之前它是【四個地方各寫一次的裸數字】：
//    Router_Action 的判定、老虎道場的講評、規則說明的兩句話——check_mirror 只認得 KC_ 常數，
//    寫死的數字它一個都看不到，所以改了其中一處、另外三處繼續說舊值也不會有人叫。
var FATE_DEADLINE_DAYS_ = 14;

// ⏳ 時鐘不用獨立表：每個世界(game_id)恆只有一位御主，日/時/AP 直接存在【御主自己那一列】(COL.PC.DAY/HOUR/AP)，天然 1:1 對應、無需獨立 join 表。

// 內部：在(已載入的) pcData 中找某 game_id 的御主列索引。
function findGameMasterIdx_(pcData, gameId) {
  if (!gameId) return -1;
  for (var i = 1; i < pcData.length; i++) {
    if (String(pcData[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(pcData[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    var f = String(pcData[i][COL.PC.FACTION] || "");
    if (f !== "從者" && f !== "敵從者" && f !== "敵御主") return i; // 御主(含盟友御主等非敵非從者陣營)
  }
  return -1;
}
// 從御主列讀出時鐘 {day,hour,ap}；idx=-1(查無/尚未實例化)回預設滿血時鐘。
function clockFromRow_(pcData, idx) {
  if (idx < 0) return { day: 1, hour: 20, ap: AP_PER_DAY };
  var row = pcData[idx];
  var apCell = row[COL.PC.AP];
  var ap = (apCell === "" || apCell == null) ? AP_PER_DAY : (parseInt(apCell) || 0);
  var day = parseInt(row[COL.PC.DAY]) || 1, hour = row[COL.PC.HOUR] === "" || row[COL.PC.HOUR] == null ? 20 : (parseInt(row[COL.PC.HOUR]) || 0);
  return { day: day, hour: hour, ap: ap };
}
// 取得（或初始化）某 game_id 的時鐘——無 pcData 時自行整表讀一次(fallback，呼叫端沒有現成資料才會走這)。
function getClock_(gameId, pcData, sheets) {
  if (!gameId) return null;
  var data = pcData;
  if (!data) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = (sheets && sheets.pc) || ss.getSheetByName("眾生");
    if (!sh) return null;
    data = sh.getDataRange().getValues();
  }
  var idx = findGameMasterIdx_(data, gameId);
  var clk = clockFromRow_(data, idx);
  clk.gameId = gameId; clk.masterIdx = idx;
  return clk;
}

// 推進小時（內部用，roll day）
function rollHours_(clk, hours) {
  clk.hour += hours;
  while (clk.hour >= 24) { clk.hour -= 24; clk.day += 1; }
}
// 把時鐘寫回御主列 + 表（僅在 masterIdx 有效時才動作；沒有現成 pcData/sheets 則整表讀一次落地）。
function writeClockToRow_(clk, pcData, sheets, skipWrite) {
  if (!clk || clk.masterIdx == null || clk.masterIdx < 0) return;
  var data = pcData, sh = sheets && sheets.pc;
  if (!data || !sh) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    sh = sh || ss.getSheetByName("眾生");
    data = data || sh.getDataRange().getValues();
  }
  data[clk.masterIdx][COL.PC.DAY] = clk.day;
  data[clk.masterIdx][COL.PC.HOUR] = clk.hour;
  data[clk.masterIdx][COL.PC.AP] = clk.ap;
  if (!skipWrite) sh.getRange(clk.masterIdx + 1, COL.PC.DAY + 1, 1, 3).setValues([[clk.day, clk.hour, clk.ap]]);
}

// 取目前 AP（無時鐘回滿）。傳 pcData 可省一次整表讀。
function getAp_(gameId, pcData) {
  var clk = getClock_(gameId, pcData);
  return clk ? clk.ap : AP_PER_DAY;
}

// 消耗 AP：1 AP = 1 小時。
function spendAp_(gameId, cost, pcData, sheets, skipWrite) {
  var clk = getClock_(gameId, pcData, sheets);
  if (!clk || clk.masterIdx < 0) return { ok: true, ap: AP_PER_DAY }; // 無御主列(相容)→不擋
  if (clk.ap < cost) return { ok: false, ap: clk.ap };
  clk.ap -= cost;
  rollHours_(clk, cost);
  writeClockToRow_(clk, pcData, sheets, skipWrite);
  return { ok: true, ap: clk.ap, day: clk.day, hour: clk.hour };
}

// 🩸 不推進時間、直接補 n 點 AP（second wind 燃燒生命強撐用）
function grantAp_(gameId, n, pcData, sheets) {
  var clk = getClock_(gameId, pcData, sheets);
  if (!clk || clk.masterIdx < 0) return AP_PER_DAY;
  clk.ap = Math.min(AP_PER_DAY, clk.ap + n);
  writeClockToRow_(clk, pcData, sheets);
  return clk.ap;
}

// 🛏️ 休息 N 小時：推進 N 小時、補 2×N AP（上限 12）。何時休、休多久由玩家決定。
function restHours_(gameId, hours, pcData, sheets, skipWrite) {
  var clk = getClock_(gameId, pcData, sheets);
  if (!clk || clk.masterIdx < 0) return null;
  hours = Math.max(1, Math.min(12, parseInt(hours) || 1));
  rollHours_(clk, hours);
  clk.ap = Math.min(AP_PER_DAY, clk.ap + hours * 2);
  writeClockToRow_(clk, pcData, sheets, skipWrite);
  return clk;
}

// 時段名（依小時）
function timeBand_(hour) {
  if (hour >= 5 && hour < 11) return "清晨";
  if (hour >= 11 && hour < 17) return "午後";
  if (hour >= 17 && hour < 20) return "黃昏";
  if (hour >= 20 && hour < 24) return "夜";
  return "深夜"; // 0-5
}

// 時鐘文字標籤
function clockLabel_(gameId, pcData) {
  var clk = getClock_(gameId, pcData);
  if (!clk) return "";
  return "第 " + clk.day + " 日・" + ("0" + clk.hour).slice(-2) + ":00・" + timeBand_(clk.hour);
}


// 🔮 靈脈：依坤圖地點「類型」給每小時回魔基值。
function leylineAt_(sheets, loc) {
  if (!sheets || !loc) return 2;
  var root = String(loc).split('-')[0].trim();
  try {
    var data = getMapDataCached(sheets);
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL.MAP.NAME]).trim() !== root) continue;
      var t = String(data[i][COL.MAP.TYPE]).trim();
      if (t === "靈地") return 12;                 // 靈脈匯聚（柳洞寺、未遠川河畔）
      if (t === "祭壇" || t === "據點") return 6;   // 結界森嚴的宅邸／教會
      return 2;                                    // 城區、街道、約會景點
    }
  } catch (e) { }
  return 2;
}
var LEYLINE_LABEL_ = { 12: "靈脈匯聚", 6: "魔力尚可", 2: "魔力稀薄" };

// 💠 從者每小時魔力收支（時回與前端顯示共用）。
function servantEconomy_(circuits, six, isMad, leyline, hasWorkshop) {
  var supply = Math.round((parseInt(circuits) || 30) * 0.5);
  var ws = hasWorkshop ? 8 : 0;
  var income = supply + (leyline || 0) + ws;
  var sum = 0; ["筋力", "耐久", "敏捷", "魔力", "幸運", "寶具"].forEach(function (k) { sum += rankVal(six[k] || "C"); });
  var drain = Math.round(sum / 8 * (isMad ? 1.5 : 1));
  return { supply: supply, ley: leyline || 0, workshop: ws, income: income, drain: drain, net: income - drain };
}

// 取玩家家園(居所)所在地；無則 ""。居所併入御主自己那一列(COL.PC.HOME_LOC)，不用獨立表。
function playerHomeLoc_(sheets, pcId, pcData) {
  if (!sheets || !sheets.pc) return "";
  try {
    var d = pcData || sheets.pc.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) {
      if (String(d[i][COL.PC.ID]).trim() === String(pcId).trim()) return String(d[i][COL.PC.HOME_LOC] || "").trim();
    }
  } catch (e) { }
  return "";
}

// 供前端顯示：玩家從者當前魔力收支與所在靈脈（null＝無存活從者）
function playerServantEconomy_(sheets, pcId, preData) {
  var data = preData || sheets.pc.getDataRange().getValues();
  var pIdx = -1; for (var i = 1; i < data.length; i++) { if (String(data[i][COL.PC.ID]) === String(pcId)) { pIdx = i; break; } }
  if (pIdx < 0) return null;
  var gid = String(data[pIdx][COL.PC.GAME_ID] || "");
  var circuits = masterCircuits_(data[pIdx]);
  // pIdx 剛掃過整表找到自己，直接讀 HOME_LOC 省掉再呼叫 playerHomeLoc_ 重複掃描一次。
  var homeLoc = String(data[pIdx][COL.PC.HOME_LOC] || "").trim();
  var sv = null, svRowsE = [];
  for (var j = 1; j < data.length; j++) {
    if (String(data[j][COL.PC.FACTION]) === "從者" && String(data[j][COL.PC.GAME_ID] || "") === gid && !String(data[j][COL.PC.ID]).startsWith("DEAD_")) { if (!sv) sv = data[j]; svRowsE.push(data[j]); }
  }
  if (!sv) return null;
  var loc = String(sv[COL.PC.LOC] || "");
  var ley = leylineAt_(sheets, loc);
  var rootLoc = loc.split('-')[0].trim();
  var atHome = !!(homeLoc && rootLoc && String(homeLoc).split('-')[0].trim() === rootLoc);
  // 🏕️ 陣地(工房)：玩家以 setWorkshop 設定的【陣地】marker，駐留該地→供魔工房加成。
  var workshopLoc = ""; try { workshopLoc = getWorkshop_(data[pIdx][COL.PC.MEMORY]); } catch (e) { }
  var atWorkshop = !!(workshopLoc && rootLoc && String(workshopLoc).split('-')[0].trim() === rootLoc);
  var combatantsE = svRowsE.map(function (r) { return rowToCombatant_(r); });
  var partyMagicVal = 0, anyTerritory = false;
  combatantsE.forEach(function (c0) { partyMagicVal += rankVal(c0.six['魔力'] || 'E'); if (hasFx_(c0, 'territory')) anyTerritory = true; });
  var hasWs = atHome || anyTerritory || atWorkshop;
  var baseEco = servantEconomy_(circuits, {}, false, ley, hasWs);
  var svFeed = Math.round(partyMagicVal * 0.15); // 從者魔力回魔貢獻(比御主少)
  var income = baseEco.income + svFeed;
  // 🔋 出力電池制：維持費 = Σ 各從者(六圍/8·狂化×1.5)×出力檔 drainMul，與 applyRegen_ 同準。
  var drainSum = 0;
  combatantsE.forEach(function (c0) {
    drainSum += servantEconomy_(circuits, c0.six, !!hasFx_(c0, 'mad'), ley, hasWs).drain * outputTier_(c0.output).drainMul;
  });
  var output = servantOutput_(sv[COL.PC.MEMORY]);
  var drain = Math.round(drainSum);
  // 🐙 海怪在場＝共用池另一張嘴(每小時 HORROR_HOURLY_UPKEEP)：HUD 收支與 applyRegen_ 實際時耗對齊。
  var horrorUpkeep = 0;
  try {
    for (var hj = 0; hj < svRowsE.length; hj++) {
      if (horrorPresent_(svRowsE[hj][COL.PC.MEMORY], gid, data)) { horrorUpkeep = HORROR_HOURLY_UPKEEP; break; }
    }
  } catch (e) { }
  drain += horrorUpkeep;
  var net = income - drain;
  return {
    income: income, drain: drain, net: net,
    supply: baseEco.supply, ley: baseEco.ley, workshop: baseEco.workshop, svFeed: svFeed,
    leyLabel: LEYLINE_LABEL_[ley] || "魔力稀薄", loc: rootLoc,
    atHome: atHome, hasTerritory: anyTerritory, atWorkshop: atWorkshop, sustainable: net >= 0, circuits: circuits,
    output: output, outputLabel: outputTier_(output).label, horrorUpkeep: horrorUpkeep
  };
}

// 對「御主＋同行從者」施加 hours 小時的時回；mult＝倍率（移動 1、休息 2）。
function applyRegen_(data, gameId, playerName, partyNames, circuits, hours, mult, sheets, loc, homeLoc) {
  if (!gameId || !hours) return false;
  mult = mult || 1;
  var ley = leylineAt_(sheets, loc);
  var rootLoc = String(loc || "").split('-')[0].trim();
  var atHome = !!(homeLoc && rootLoc && String(homeLoc).split('-')[0].trim() === rootLoc);
  var party = {}; party[String(playerName)] = true;
  (partyNames || []).forEach(function (n) { party[String(n)] = true; });
  // ✨ 禮裝·全世界之鞘(Avalon)：全隊回血加快；🏕️ 陣地(工房)：駐留該地→供魔工房加成
  var avalon = false, workshopLoc = "";
  for (var ai = 1; ai < data.length; ai++) {
    if (String(data[ai][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(data[ai][COL.PC.NAME]) === String(playerName) && String(data[ai][COL.PC.FACTION]) !== "從者") {
      avalon = !!masterMysticFx_(data[ai][COL.PC.MEMORY], 'avalon');
      try { workshopLoc = getWorkshop_(data[ai][COL.PC.MEMORY]); } catch (e) { }
      break;
    }
  }
  var atWorkshop = !!(workshopLoc && rootLoc && String(workshopLoc).split('-')[0].trim() === rootLoc);
  var hpRate = 0.05 * (avalon ? 1.6 : 1);
  var did = false;

  // 🔋 出力電池制：從者【沒有自有魔力池】——御主MP 是唯一且持續的魔力資源，被同隊從者按「出力檔位」持續抽取。
  var masterI = -1, svRows = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (!party[String(data[i][COL.PC.NAME])]) continue;
    if (String(data[i][COL.PC.FACTION]) === "從者") svRows.push(i);
    else if (masterI < 0) masterI = i;
  }

  // 🔋 共用魔力池：同隊從者魔力 rankVal 總和 → 重算池上限(迴路×10 + 魔力×2) ＋ 從者回魔貢獻(少)。
  var partyMagicVal = 0;
  svRows.forEach(function (ri) { var cs = rowToCombatant_(data[ri]); partyMagicVal += rankVal(cs.six['魔力'] || 'E'); });

  // 收入(每小時，靈脈/工房只餵御主一次，不隨從者數倍增)；工房＝居所/已設陣地/任一從者自帶陣地作成(Caster)
  var anyTerritory = svRows.some(function (ri) { return !!hasFx_(rowToCombatant_(data[ri]), 'territory'); });
  var hasWs = atHome || atWorkshop || anyTerritory;
  //   收入 = 御主迴路供給 + 靈脈 + 工房 + 從者魔力回魔(×0.15，比御主少)
  var income = servantEconomy_(circuits, {}, false, ley, hasWs).income + Math.round(partyMagicVal * 0.15);
  // 支出(每小時)：Σ 各從者維持費 × 其出力檔 drainMul
  var totalDrain = 0;
  svRows.forEach(function (ri) {
    var cs = rowToCombatant_(data[ri]);
    var d = servantEconomy_(circuits, cs.six, !!hasFx_(cs, 'mad'), ley, hasWs).drain;
    totalDrain += d * outputTier_(cs.output).drainMul;
  });
  // 🐙 深淵海怪·時間維持費：海怪在場＝共用池的另一張嘴，每小時另抽 HORROR_HOURLY_UPKEEP。
  var horrorIdx = -1;
  svRows.forEach(function (ri) {
    if (horrorIdx !== -1) return;
    if (horrorPresent_(data[ri][COL.PC.MEMORY], gameId, data)) horrorIdx = ri;
  });
  if (horrorIdx !== -1) totalDrain += HORROR_HOURLY_UPKEEP;

  // 御主魔力淨收支（休息把收入加倍、維持不變）→ 寫回御主 MP。
  var masterBurn = 0;
  if (masterI >= 0) {
    // 重算共用池上限(把同隊從者魔力併進來)；夾住當前 MP
    var mMpMax = masterPoolMax_(circuits, partyMagicVal);
    if (mMpMax !== (parseInt(data[masterI][COL.PC.MAX_MP]) || 0)) { data[masterI][COL.PC.MAX_MP] = mMpMax; did = true; }
    var mMp = Math.min(parseInt(data[masterI][COL.PC.MP]) || 0, mMpMax);
    var perHour = (income * mult) - totalDrain;
    var rawNew = mMp + perHour * hours;                                  // 可能為負＝池補不上的缺口
    // 🐙 海怪先於御主血沉沒：池補不上且海怪在場 → 放走召喚物止耗、重算收支，御主不必為牠燃血
    if (mMpMax && rawNew < 0 && horrorIdx !== -1) {
      data[horrorIdx][COL.PC.MEMORY] = clearHorrorShield_(data[horrorIdx][COL.PC.MEMORY]);
      did = true;
      totalDrain -= HORROR_HOURLY_UPKEEP;
      horrorIdx = -1;
      perHour = (income * mult) - totalDrain;
      rawNew = mMp + perHour * hours;
    }
    var nMMp = mMpMax ? Math.max(0, Math.min(mMpMax, Math.round(rawNew))) : mMp;
    var unfunded = (mMpMax && rawNew < 0) ? Math.round(-rawNew) : 0;     // 缺口(mana)，改由血肉支付
    // 🩸 被動燃血：缺口/2 全額由御主承擔——從者不扣血(電池代價歸電池)。
    masterBurn = Math.round(unfunded / 2);
    var mHpMax = parseInt(data[masterI][COL.PC.MAX_HP]) || 0, mHp = parseInt(data[masterI][COL.PC.HP]) || 0;
    // 缺口時御主被動燃血扣血(保底1)；否則自我修復
    var nMHp = unfunded > 0 ? Math.max(1, mHp - masterBurn)
                            : (mHpMax ? Math.min(mHpMax, mHp + Math.round(mHpMax * hpRate * hours * mult)) : mHp);
    if (nMMp !== mMp || nMHp !== mHp) { data[masterI][COL.PC.MP] = nMMp; data[masterI][COL.PC.HP] = nMHp; did = true; }
  }

  // 從者：【不參與燃血】。缺口時魔力短缺、靈基自我修復停擺(HP 不動)；無缺口則正常自我修復。
  var deficitNow = masterBurn > 0;
  svRows.forEach(function (ri) {
    var shpMax = parseInt(data[ri][COL.PC.MAX_HP]) || 0, shp = parseInt(data[ri][COL.PC.HP]) || 0;
    var snhp = deficitNow ? shp
                          : (shpMax ? Math.min(shpMax, shp + Math.round(shpMax * hpRate * hours * mult)) : shp);
    if (snhp !== shp) { data[ri][COL.PC.HP] = snhp; did = true; }
  });
  return did;
}

// 從御主列的 MEMORY 取魔術迴路數，無則預設 30（讀寫都走 MASTER_CIRCUITS_TAG_）。
function masterCircuits_(masterRow) {
  return getMasterCircuits_(masterRow && masterRow[COL.PC.MEMORY]);
}

// 🔋 敵御主每日回魔：敵御主電池只會被 drainForNp_ 扣、從不隨時間自然回——長局若不補，放過一次寶具後就永久魔力見底，往後所有遭遇都啞火(反而喪失「寶具是孤注一擲」的張力)。
var MANA_DAY_TAG_ = makeIntTag_('回魔日', -1);
function getManaDay_(memory) { return MANA_DAY_TAG_.get(memory); }
function stampManaDay_(memory, day) { return MANA_DAY_TAG_.set(memory, day); }
// 🔮 蓄勢的真名撐不撐得住：每天重骰一次，讓敵人自己決定要不要繼續等（玩家定案：「讓敵人自己決定放不放」）。
//    資料驅動——往表加一列就多一種性格，不寫 if 鏈。
var NP_HOLD_DAY_TAG_ = makeIntTag_('蓄勢日', -1);
var NP_HOLD_BASE_ = 0.55;           // 基礎續抱機率
var NP_HOLD_DESPERATE_ = 0.30;      // 自己血越少越非放不可（×血量缺口）
var NP_HOLD_ = [
  { fx: 'mad', add: 0.40, why: '理智已被黑霧吞沒，不會改主意' },
  { fx: 'zabaniya', add: 0.25, why: '暗殺者有的是耐心' },
  { fx: 'gob', add: 0.20, why: '出鞘的寶物沒有收回的道理' }
];

// 回傳這一天「放棄蓄勢」的風聲（讓玩家知道壓力解除了，不是靜靜消失）。
function reconsiderNpHoldDaily_(sheets, gameId, day, preData) {
  var out = [];
  var data = preData || sheets.pc.getDataRange().getValues();
  var dirty = false;
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[COL.PC.FACTION]) !== "敵從者") continue;
    if (String(r[COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(r[COL.PC.ID]).startsWith("DEAD_")) continue;
    if (!getNpTelegraph_(r[COL.PC.MEMORY])) continue;
    if (NP_HOLD_DAY_TAG_.get(r[COL.PC.MEMORY]) >= day) continue; // 今天已決定過
    var c = null; try { c = rowToCombatant_(r); } catch (e) { }
    var keep = NP_HOLD_BASE_;
    if (c) NP_HOLD_.forEach(function (t) { if (hasFx_(c, t.fx)) keep += t.add; });
    var hpMax = parseInt(r[COL.PC.MAX_HP]) || 1;
    var hpR = Math.max(0, Math.min(1, (parseInt(r[COL.PC.HP]) || 0) / hpMax));
    keep += (1 - hpR) * NP_HOLD_DESPERATE_;   // 快死了就更非放不可
    data[i][COL.PC.MEMORY] = NP_HOLD_DAY_TAG_.set(r[COL.PC.MEMORY], day);
    if (Math.random() >= Math.min(0.95, keep)) {
      data[i][COL.PC.MEMORY] = clearNpTelegraph_(data[i][COL.PC.MEMORY]);
      out.push('〔風聲〕「' + String(r[COL.PC.NAME]) + '」高漲的靈基壓力悄然平復下來——那道蓄勢已久的真名，似乎被收了回去。');
    }
    dirty = true;
  }
  if (dirty && !BATTLE_DEFER_WRITE_) {
    var memCol = []; for (var z = 1; z < data.length; z++) memCol.push([data[z][COL.PC.MEMORY]]);
    sheets.pc.getRange(2, COL.PC.MEMORY + 1, memCol.length, 1).setValues(memCol);
  }
  return out;
}

function refillMastersDaily_(sheets, gameId, day, preData) {
  var data = preData || sheets.pc.getDataRange().getValues();
  var dirty = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.FACTION]) !== "敵御主") continue;
    if (String(data[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (!hasArrived_(data[i], day)) continue; // 🕰️ 尚未登場者不參與世界自走(不回魔)
    if (getManaDay_(data[i][COL.PC.MEMORY]) >= day) continue; // 今天已補過
    var maxMp = parseInt(data[i][COL.PC.MAX_MP]) || 0;
    data[i][COL.PC.MP] = maxMp;
    data[i][COL.PC.MEMORY] = stampManaDay_(data[i][COL.PC.MEMORY], day);
    dirty = true;
  }
  // 多名敵御主同天需回魔時，MP/MEMORY 各整欄一次寫回(取代迴圈內逐列 setValues 的零散往返，同 worldTick_ LOC 批寫手法)。（全文見 CODE_NOTES.md）
  if (dirty && !BATTLE_DEFER_WRITE_) {
    var mpCol = [], memCol = [];
    for (var z = 1; z < data.length; z++) { mpCol.push([data[z][COL.PC.MP]]); memCol.push([data[z][COL.PC.MEMORY]]); }
    sheets.pc.getRange(2, COL.PC.MP + 1, mpCol.length, 1).setValues(mpCol);
    sheets.pc.getRange(2, COL.PC.MEMORY + 1, memCol.length, 1).setValues(memCol);
  }
}

// 🌐 世界自走一輪：敵移位（偵查失效）＋ 暗處從者陣亡（戰爭自走）rounds：跑幾輪；allowAttrition：是否允許「暗處廝殺/養不起爆炸」（僅休息時 true，移動只換位）回傳 { rumors:[..文字..], moved:n }
var WORLD_FLOOR_ = 4; // 世界自走永遠至少保留這麼多名敵從者給玩家親手解決（不會被自走清光）
var ATTRITION_START_DAY = 3; // ⏳ 開戰前期不減員：第 N 日(含)前，世界不會有從者暗處殞落（給玩家喘息＋貼戰爭初期蟄伏）
var ENEMY_REGEN_RATE_ = 0.06;
function worldTick_(sheets, gameId, playerLoc, rounds, allowAttrition, preData, deferWrite) {
  var rumors = [];
  if (!gameId) return { rumors: rumors, moved: 0 };
  rounds = rounds || 1;
  var _prevDefer = BATTLE_DEFER_WRITE_;
  if (deferWrite) BATTLE_DEFER_WRITE_ = true;
  // 全函式只整表讀一次，各階段(移位/廝殺/透支判定)共用同一份記憶體 data、只做局部批次寫回。
  var data = preData || sheets.pc.getDataRange().getValues();
  var _ck0 = getClock_(gameId, data); if (_ck0) refillMastersDaily_(sheets, gameId, _ck0.day, data);
  if (_ck0) { try { rumors = rumors.concat(reconsiderNpHoldDaily_(sheets, gameId, _ck0.day, data)); } catch (e) { } }
  var _myWar = "";
  try {
    var _myMIdx = data.findIndex(function (r) { return String(r[COL.PC.FACTION]) === "御主" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_"); });
    if (_myMIdx !== -1) _myWar = getWarName_(data[_myMIdx][COL.PC.MEMORY]);
  } catch (e) { }
  var moved = 0;
  var anyMemDirty = false;
  // 🔮 登場預告：尚未登場、但已進入「登場前1~2天」窗口的敵從者，世界風聲提前透露一絲氣息——只觸發一次(MEMORY【已預告】避免每輪重播)，不洩漏精確位置/天數；有自訂提示句(【登場提示】)就用，沒有就退回依職階的泛用措辭。
  if (_ck0) {
    for (var hn = 1; hn < data.length; hn++) {
      if (String(data[hn][COL.PC.FACTION]) !== "敵從者") continue;
      if (String(data[hn][COL.PC.GAME_ID] || "") !== gameId) continue;
      if (String(data[hn][COL.PC.ID]).startsWith("DEAD_")) continue;
      var hnMem = String(data[hn][COL.PC.MEMORY] || "");
      var hnArrDay = getArriveDay_(hnMem);
      if (hnArrDay <= 1) continue; // 開局即登場者不需要預告
      if (_ck0.day >= hnArrDay) continue; // 已登場
      if (hnArrDay - _ck0.day > 2) continue; // 還不到預告窗口(登場前1~2天內)
      if (/【已預告】/.test(hnMem)) continue; // 已預告過，不重複
      var hnHint = getArriveHint_(hnMem);
      var hnCls = String(data[hn][COL.PC.RANK] || "從者");
      rumors.push(hnHint
        ? ('〔風聞〕' + hnHint)
        : ('〔風聞〕坊間隱約流傳，某道屬於「' + hnCls + '」職階的強大氣息正在冬木邊緣遊蕩、若隱若現——似乎有人尚未正式現身於這場聖杯戰爭。'));
      data[hn][COL.PC.MEMORY] = hnMem + "｜【已預告】";
      anyMemDirty = true;
    }
  }
  var anyLocDirty = false, anyHpDirty = false;

  for (var rd = 0; rd < rounds; rd++) {
    // 1) 敵御主帶著從者隨機移位（機率 35%），移走者重設偵查旗標→地圖再次隱形
    var freezeLoc = String(playerLoc || "").trim(); // 🔒 玩家所在/將抵達的格子上的敵人禁止移動，否則玩家永遠追不到人
    var locDirty = false;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL.PC.FACTION]) !== "敵御主") continue;
      if (String(data[i][COL.PC.GAME_ID] || "") !== gameId) continue;
      if (String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
      if (_ck0 && !hasArrived_(data[i], _ck0.day)) continue; // 🕰️ 尚未登場者不會移位(仍蟄伏、不參與世界自走)
      var oldLoc = String(data[i][COL.PC.LOC]).trim();
      if (freezeLoc && oldLoc === freezeLoc) continue; // 敵在玩家格上→鎖住，留給玩家正面遭遇
      if (Math.random() >= 0.35) continue;
      var newLoc = enemyRetreatLoc_(oldLoc, _myWar);
      if (newLoc === oldLoc) continue;
      data[i][COL.PC.LOC] = newLoc; locDirty = true;
      // 🔭 已偵查到的敵人移位後【保持可見】(不清 SEEN)：一旦感應到對手氣息就持續追蹤其當前位置，否則敵人每動一次就重新隱形、玩家永遠追不到人。
      var mName = String(data[i][COL.PC.NAME] || "");
      var foundServant = false;
      // 第一輪：找 MEMORY 有【御主】=mName 的配對從者。（全文見 CODE_NOTES.md）
      for (var j = 1; j < data.length; j++) {
        if (String(data[j][COL.PC.FACTION]) !== "敵從者") continue;
        if (String(data[j][COL.PC.GAME_ID] || "") !== gameId) continue;
        if (String(data[j][COL.PC.ID]).startsWith("DEAD_")) continue;
        if (String(data[j][COL.PC.LOC]).trim() !== oldLoc) continue;
        if (getServantMaster_(data[j][COL.PC.MEMORY]) !== mName) continue;
        data[j][COL.PC.LOC] = newLoc; foundServant = true; break;
      }
      // 第二輪：找不到配對 → fallback 抓同格任一孤身從者（MEMORY 無【御主】或御主不在同格）。（全文見 CODE_NOTES.md）
      if (!foundServant) {
        for (var j = 1; j < data.length; j++) {
          if (String(data[j][COL.PC.FACTION]) !== "敵從者") continue;
          if (String(data[j][COL.PC.GAME_ID] || "") !== gameId) continue;
          if (String(data[j][COL.PC.ID]).startsWith("DEAD_")) continue;
          if (String(data[j][COL.PC.LOC]).trim() !== oldLoc) continue;
          var svOwner = getServantMaster_(data[j][COL.PC.MEMORY]);
          if (svOwner) {
            var ownerStillHere = false;
            for (var ow = 1; ow < data.length; ow++) {
              if (String(data[ow][COL.PC.FACTION]) !== "敵御主") continue;
              if (String(data[ow][COL.PC.GAME_ID] || "") !== gameId) continue;
              if (String(data[ow][COL.PC.ID]).startsWith("DEAD_")) continue;
              if (String(data[ow][COL.PC.NAME]) !== svOwner) continue;
              if (String(data[ow][COL.PC.LOC]).trim() !== oldLoc) continue;
              ownerStillHere = true; break;
            }
            if (ownerStillHere) continue; // 有自己活著的御主同地在場→不是孤身，別搶
          }
          data[j][COL.PC.LOC] = newLoc; break;
        }
      }
      moved++;
    }
    if (locDirty) anyLocDirty = true; // 整欄寫回挪到迴圈外一次做，這裡只累積旗標

    for (var hi = 1; hi < data.length; hi++) {
      if (String(data[hi][COL.PC.FACTION]) !== "敵從者") continue;
      if (String(data[hi][COL.PC.GAME_ID] || "") !== gameId) continue;
      if (String(data[hi][COL.PC.ID]).startsWith("DEAD_")) continue;
      if (_ck0 && !hasArrived_(data[hi], _ck0.day)) continue; // 🕰️ 尚未登場者不自癒(仍蟄伏)
      var eHpMax = parseInt(data[hi][COL.PC.MAX_HP]) || 0, eHp = parseInt(data[hi][COL.PC.HP]) || 0;
      if (!eHpMax || eHp <= 0 || eHp >= eHpMax) continue;
      var eNHp = Math.min(eHpMax, eHp + Math.round(eHpMax * ENEMY_REGEN_RATE_));
      if (eNHp !== eHp) { data[hi][COL.PC.HP] = eNHp; anyHpDirty = true; }
    }

    // 2) 暗處從者互鬥：只在「休息」時可能發生（移動只換位，不受傷）；且永遠至少保留 WORLD_FLOOR_ 名敵從者給玩家親手解決——絕不會被世界自走清光。
    if (!allowAttrition) continue;
    // ⏳ 開戰前期(第 ATTRITION_START_DAY 日前)世界不減員——給玩家喘息，也貼「戰爭初期各方按兵蟄伏」。
    var _ckR = getClock_(gameId, data);
    if (_ckR && _ckR.day < ATTRITION_START_DAY) continue;
    var offstage = [];
    for (var k = 1; k < data.length; k++) {
      if (String(data[k][COL.PC.FACTION]) !== "敵從者") continue;
      if (String(data[k][COL.PC.GAME_ID] || "") !== gameId) continue;
      if (String(data[k][COL.PC.ID]).startsWith("DEAD_")) continue;
      if (!hasArrived_(data[k], _ckR ? _ckR.day : 1)) continue; // 🕰️ 尚未登場者不參與暗處互鬥
      if (isAllied_(data[k])) continue;
      offstage.push({ idx: k, name: String(data[k][COL.PC.NAME]), loc: String(data[k][COL.PC.LOC]).trim() });
    }
    var aliveTotal = offstage.length;
    if (aliveTotal <= WORLD_FLOOR_) continue; // 已到底線→世界不再清人，剩下的全交給玩家
    var faraway = offstage.filter(function (o) { return o.loc !== String(playerLoc).trim(); });
    if (faraway.length < 2) continue; // 互鬥至少要湊得出兩名離場者
    if (Math.random() < 0.07) { // 暗處互鬥：偶爾湊兩名離場者真打一場(沿用既有觸發機率，只是結果不再是瞬殺)
      var _pickA = Math.floor(Math.random() * faraway.length);
      var _pickB; do { _pickB = Math.floor(Math.random() * faraway.length); } while (_pickB === _pickA);
      var infoA = faraway[_pickA], infoB = faraway[_pickB];
      // 🤝 敵盟：兩名離場敵從者若其御主已締盟(未逾期)→是同一陣線、不自相殘殺，跳過這場暗鬥。
      try {
        var _mAn = getServantMaster_(data[infoA.idx][COL.PC.MEMORY]), _mBn = getServantMaster_(data[infoB.idx][COL.PC.MEMORY]);
        if (_mAn && _mBn) {
          var _mARow = null;
          for (var _z = 1; _z < data.length; _z++) {
            if (String(data[_z][COL.PC.FACTION]) === "敵御主" && String(data[_z][COL.PC.GAME_ID] || "") === gameId && !String(data[_z][COL.PC.ID]).startsWith("DEAD_") && nameLoose_(data[_z][COL.PC.NAME]) === nameLoose_(_mAn)) { _mARow = data[_z]; break; }
          }
          if (_mARow) {
            var _pt = getEnemyPact_(_mARow[COL.PC.MEMORY]);
            if (_pt && nameLoose_(_pt.partner) === nameLoose_(_mBn) && _pt.until >= (_ckR ? _ckR.day : 1)) continue;
          }
        }
      } catch (e) { }
      var comA = rowToCombatant_(data[infoA.idx]), comB = rowToCombatant_(data[infoB.idx]);
      // 一次交鋒＝A出擊、B存活才反擊(跟fateStrike_同款一來一往，不無限回合硬打到死)
      var strikeAB = resolveFateBattle_(comA, comB, {});
      var hpBAfter = Math.max(0, comB.hp - (strikeAB.atkWins ? strikeAB.damage : 0));
      var hpAAfter = comA.hp;
      if (hpBAfter > 0) {
        var strikeBA = resolveFateBattle_(comB, comA, {});
        hpAAfter = Math.max(0, comA.hp - (strikeBA.atkWins ? strikeBA.damage : 0));
      }
      var severedByA = hasFx_(comA, 'rule_breaker') || hasFx_(comA, 'anti_magic_lance'); // A是strikeAB攻擊方→擋B復活
      var severedByB = hasFx_(comB, 'rule_breaker') || hasFx_(comB, 'anti_magic_lance'); // B是strikeBA攻擊方→擋A復活
      if (hpAAfter <= 0 && hasFx_(comA, 'survive') && !hasFx_(comA, 'god_hand') && comA.hp > 1 && !severedByB) hpAAfter = 1;
      if (hpBAfter <= 0 && hasFx_(comB, 'survive') && !hasFx_(comB, 'god_hand') && comB.hp > 1 && !severedByA) hpBAfter = 1;
      if (hpAAfter <= 0 && !severedByB && hasFx_(comA, 'god_hand')) {
        var livesA = getGodHandLives_(data[infoA.idx][COL.PC.MEMORY]);
        if (livesA > 0) { hpAAfter = Math.max(1, Math.round((parseInt(data[infoA.idx][COL.PC.MAX_HP]) || 300) * 0.2)); data[infoA.idx][COL.PC.MEMORY] = setGodHandLives_(data[infoA.idx][COL.PC.MEMORY], livesA - 1); }
      }
      if (hpBAfter <= 0 && !severedByA && hasFx_(comB, 'god_hand')) {
        var livesB = getGodHandLives_(data[infoB.idx][COL.PC.MEMORY]);
        if (livesB > 0) { hpBAfter = Math.max(1, Math.round((parseInt(data[infoB.idx][COL.PC.MAX_HP]) || 300) * 0.2)); data[infoB.idx][COL.PC.MEMORY] = setGodHandLives_(data[infoB.idx][COL.PC.MEMORY], livesB - 1); }
      }
      // ⚡ 只改記憶體＋掀 anyHpDirty，交給結尾的 HP 整欄批次寫回落盤(免暗處互鬥每對各兩次逐格 setValue)。
      data[infoA.idx][COL.PC.HP] = hpAAfter; data[infoB.idx][COL.PC.HP] = hpBAfter; anyHpDirty = true;
      var aDied = hpAAfter <= 0, bDied = hpBAfter <= 0;
      [{ died: aDied, info: infoA }, { died: bDied, info: infoB }].forEach(function (o) {
        if (!o.died) return;
        data[o.info.idx][COL.PC.ID] = "DEAD_" + String(data[o.info.idx][COL.PC.ID]);
        data[o.info.idx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "暗處殞落", "顏面": "已無生息" });
        if (!BATTLE_DEFER_WRITE_) sheets.pc.getRange(o.info.idx + 1, 1, 1, data[o.info.idx].length).setValues([data[o.info.idx]]);
        markMasterLostServant_(sheets.pc, data, o.info.idx, "在冬木暗處的互鬥中、歿於他人之手");
      });
      if (aDied || bDied) {
        var victimName = aDied ? infoA.name : infoB.name;
        var lethalTpl = [
          "〔風聞〕昨夜冬木某處傳出靈基崩潰的餘波——「" + victimName + "」似乎已在他人手中殞落。",
          "〔風聞〕一陣猛烈的寶具氣息劃破夜空後歸於沉寂——「" + victimName + "」的靈基似乎未能撐過那一擊。",
          "〔風聞〕坊間流傳某場從者交鋒以一方潰散告終，「" + victimName + "」自此音訊全無。"
        ];
        rumors.push(lethalTpl[Math.floor(Math.random() * lethalTpl.length)]);
      } else {
        var mildTpl = [
          "〔風聞〕昨夜遠方似有魔力震盪一閃即逝，恐是有從者交手，然勝負未有定論。",
          "〔風聞〕深夜片刻，隱約感應到寶具解放的氣息劃過夜空——像是某處曾有過一場交鋒。",
          "〔風聞〕坊間傳言某地曾有靈基波動劇烈起伏，看來昨夜並不平靜，卻無人知曉勝負。",
          "〔風聞〕魔術協會低調記錄了一場異常的能量殘留，研判是從者間的短暫交手，未見傷亡回報。",
          "〔風聞〕冬木某處在深夜掀起一陣不尋常的靈氣紊亂，似有兩道身影短兵相接，各自負傷離去。"
        ];
        rumors.push(mildTpl[Math.floor(Math.random() * mildTpl.length)]);
      }
    }
  }
  // ⚡ LOC/HP 整欄一次寫回(取代原本每輪各寫一次·最多12h休息=4輪就是4次)——data 全程原地改，等所有輪跑完才寫，仍是同一份最終狀態，只是省去中途的重複 Sheets 寫入次數。
  if (anyLocDirty && !BATTLE_DEFER_WRITE_) {
    var locColF = [];
    for (var zl = 1; zl < data.length; zl++) locColF.push([data[zl][COL.PC.LOC]]);
    sheets.pc.getRange(2, COL.PC.LOC + 1, locColF.length, 1).setValues(locColF);
  }
  if (anyHpDirty && !BATTLE_DEFER_WRITE_) {
    var hpColF = [];
    for (var zh = 1; zh < data.length; zh++) hpColF.push([data[zh][COL.PC.HP]]);
    sheets.pc.getRange(2, COL.PC.HP + 1, hpColF.length, 1).setValues(hpColF);
  }
  // 🔮 登場預告(【已預告】旗標)整欄一次寫回：同一批次寫回慣例，跟 LOC/HP 同時機、只寫一次。
  if (anyMemDirty && !BATTLE_DEFER_WRITE_) {
    var memColF = [];
    for (var zm = 1; zm < data.length; zm++) memColF.push([data[zm][COL.PC.MEMORY]]);
    sheets.pc.getRange(2, COL.PC.MEMORY + 1, memColF.length, 1).setValues(memColF);
  }
  // 🕯️ 令咒耗盡·靈基透支：時間到 → 無「單獨行動」自持的脫逃敵從者，靈基崩解消滅。
  var victory = false, dreamPrompt = "";
  try {
    var ck = getClock_(gameId, data);
    if (ck) {
      var nowAbs = ck.day * 24 + ck.hour;
      var faded = false;
      for (var di = 1; di < data.length; di++) {
        if (String(data[di][COL.PC.FACTION]) !== "敵從者") continue;
        if (String(data[di][COL.PC.GAME_ID] || "") !== gameId) continue;
        if (String(data[di][COL.PC.ID]).startsWith("DEAD_")) continue;
        if (isAllied_(data[di])) continue;
        if (!hasArrived_(data[di], ck.day)) continue; // 🕰️ 尚未登場者不會有靈基透支倒數
        var dl = getDoom_(data[di][COL.PC.MEMORY]);
        if (dl > 0 && nowAbs >= dl) {
          data[di][COL.PC.ID] = "DEAD_" + String(data[di][COL.PC.ID]);
          data[di][COL.PC.HP] = 0;
          data[di][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "令咒耗盡·靈基透支消滅", "顏面": "已無生息" });
          if (!BATTLE_DEFER_WRITE_) sheets.pc.getRange(di + 1, 1, 1, data[di].length).setValues([data[di]]);
          markMasterLostServant_(sheets.pc, data, di, "三道令咒燃盡、靈基透支崩解而消滅");
          rumors.push("〔風聞〕「" + String(data[di][COL.PC.NAME]) + "」三道令咒已燃盡、又無『單獨行動』自持，失穩的靈基終究撐不過——崩解消散於冬木的夜色中。");
          faded = true;
        }
      }
      if (faded && aliveEnemyServants_(sheets, gameId, data) <= 0) {
        victory = true;
        try {
          var vmIdx = findGameMasterIdx_(data, gameId);
          var vsIdx = data.findIndex(function (r) { return String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_"); });
          if (vmIdx !== -1) {
            var vWish = extractWish_(data[vmIdx][COL.PC.MEMORY]);
            dreamPrompt = buildVictoryDreamPrompt_(String(data[vmIdx][COL.PC.NAME]), vWish, vsIdx !== -1 ? String(data[vsIdx][COL.PC.NAME]) : "");
          }
        } catch (e) { }
      }
    }
  } catch (e) { }

  if (deferWrite) BATTLE_DEFER_WRITE_ = _prevDefer; // 還原旗標，不影響呼叫端後續其他邏輯的判斷
  return { rumors: rumors, moved: moved, victory: victory, dreamPrompt: dreamPrompt };
}
