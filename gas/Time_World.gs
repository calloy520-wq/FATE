// ==========================================
// ⏳ Time_World.gs — 輕量時間流動 ＋ 世界自走（找回 AP 爽感，砍掉維持費經濟）
//   1 AP = 1 小時。移動 2／戰鬥 1／補魔 1／偵查 1 耗 AP；聊天/令咒自身向 ＝ 0（凍結）。
//   休息：玩家自選時數，每小時補 2 AP（6h 補滿）。何時休由玩家決定。
//   世界 tick（移動/休息時）：敵移位(偵查失效) ＋ 暗處從者陣亡(戰爭自走)。
// ==========================================

var AP_PER_DAY = 12; // 體力池上限（1 AP = 1 小時的行動）

// ⏳ 時鐘 2026-07 重構：不再是獨立「時鐘」表——日/時/AP 直接存在【御主自己那一列】(COL.PC.DAY/HOUR/AP)，
//   因為每個世界(game_id)恆只有一位御主，時鐘就是這個世界的狀態、天然 1:1 對應御主列，無需獨立 join 表。
//   函式簽名刻意維持「傳 gameId」不變(呼叫端多達 20+ 處)，只在內部找御主列；效能鍵在於：
//   凡是呼叫端手上已有整表 pcData 時，一律走「_withData」變體直接吃記憶體，不重新整表掃描；
//   只有極少數「手上沒有 pcData」的呼叫點才退回「自己整表掃一次找御主列」的 fallback。

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
function writeClockToRow_(clk, pcData, sheets) {
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
  sh.getRange(clk.masterIdx + 1, COL.PC.DAY + 1, 1, 3).setValues([[clk.day, clk.hour, clk.ap]]);
}

// 取目前 AP（無時鐘回滿）。傳 pcData 可省一次整表讀。
function getAp_(gameId, pcData) {
  var clk = getClock_(gameId, pcData);
  return clk ? clk.ap : AP_PER_DAY;
}

// 消耗 AP：1 AP = 1 小時。足夠則扣 cost、推進 cost 小時、回 {ok,ap}；不足回 {ok:false,ap}。
//   傳 pcData+sheets 可全程零額外整表讀寫(只改記憶體+單列3欄寫回)；不傳則自行整表讀一次(相容舊呼叫)。
function spendAp_(gameId, cost, pcData, sheets) {
  var clk = getClock_(gameId, pcData, sheets);
  if (!clk || clk.masterIdx < 0) return { ok: true, ap: AP_PER_DAY }; // 無御主列(相容)→不擋
  if (clk.ap < cost) return { ok: false, ap: clk.ap };
  clk.ap -= cost;
  rollHours_(clk, cost);
  writeClockToRow_(clk, pcData, sheets);
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
function restHours_(gameId, hours, pcData, sheets) {
  var clk = getClock_(gameId, pcData, sheets);
  if (!clk || clk.masterIdx < 0) return null;
  hours = Math.max(1, Math.min(12, parseInt(hours) || 1));
  rollHours_(clk, hours);
  clk.ap = Math.min(AP_PER_DAY, clk.ap + hours * 2);
  writeClockToRow_(clk, pcData, sheets);
  return clk;
}

// 時段名（依小時）
function timeBand_(hour) {
  if (hour >= 5 && hour <= 10) return "清晨";
  if (hour >= 11 && hour <= 16) return "午後";
  if (hour >= 17 && hour <= 19) return "黃昏";
  if (hour >= 20 && hour <= 23) return "夜";
  return "深夜";
}

// 時鐘文字標籤
function clockLabel_(gameId, pcData) {
  var clk = getClock_(gameId, pcData);
  if (!clk) return "";
  return "第 " + clk.day + " 日・" + ("0" + clk.hour).slice(-2) + ":00・" + timeBand_(clk.hour);
}


// 🔮 靈脈：依坤圖地點「類型」給每小時回魔基值。靈地(柳洞寺/河畔)匯聚最高、據點/祭壇(宅邸/教會)中等、城區野外最低。
//   沿用既有 TYPE 欄，不動 schema。坤圖是靜態資料→走 getMapDataCached(1h 快取)，
//   別再整表 sheets.map.getDataRange()：此函式被 applyRegen_(每次移動/休息)＋
//   playerServantEconomy_(幾乎每個動作都刷 HUD) 呼叫，原本每次都真的整表讀一次坤圖，
//   跟同一請求內其他地方已在用的快取重複，2026-07 修。
function leylineAt_(sheets, loc) {
  if (!sheets || !sheets.map || !loc) return 2;
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

// 💠 從者每小時魔力收支（時回與前端顯示共用）。有理有據的供養經濟：
//   收入 = 御主供給(迴路×0.5) + 靈脈(地點) + 工房(在自己居所／Caster 陣地 +8)
//   支出 = 維持費(六圍總和/8；狂化×1.5)——越貴的英靈越難養
//   回傳每小時魔力點數 { supply, ley, workshop, income, drain, net }
function servantEconomy_(circuits, six, isMad, leyline, hasWorkshop) {
  var supply = Math.round((parseInt(circuits) || 30) * 0.5);
  var ws = hasWorkshop ? 8 : 0;
  var income = supply + (leyline || 0) + ws;
  var sum = 0; ["筋力", "耐久", "敏捷", "魔力", "幸運", "寶具"].forEach(function (k) { sum += rankVal(six[k] || "C"); });
  var drain = Math.round(sum / 8 * (isMad ? 1.5 : 1));
  return { supply: supply, ley: leyline || 0, workshop: ws, income: income, drain: drain, net: income - drain };
}

// 取玩家家園(居所)所在地；無則 ""。2026-07：權柄表已刪，居所併入御主自己那一列(COL.PC.HOME_LOC)。
//   傳 pcData 可省一次整表讀(呼叫端手上通常已有)；沒傳才自行整表讀一次(相容)。
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
  var homeLoc = playerHomeLoc_(sheets, pcId, data);
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
  //   與 applyRegen_(實際時回) 對齊，否則 HUD 顯示不出陣地收益（「陣地效果沒有時回」）。
  var workshopLoc = ""; try { workshopLoc = getWorkshop_(data[pIdx][COL.PC.MEMORY]); } catch (e) { }
  var atWorkshop = !!(workshopLoc && rootLoc && String(workshopLoc).split('-')[0].trim() === rootLoc);
  // 🧮 2026-07 修：HUD 與 applyRegen_(實際時回) 完全同一套算式——原本 ①收入漏算「從者魔力×0.15」
  //   回魔貢獻 ②雙從者時只算第一位的維持費 ③工房判定漏看第二從者的 territory，玩家看到的
  //   「淨 X/時」對不上實際魔力增量。日後改收支公式，兩函式務必一起動。
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
  //   掃全隊(海怪可能掛在第二從者·如破戒奪來的青鬍子)，與 applyRegen_ 的 svRows 掃描同準。
  var horrorUpkeep = 0;
  try {
    for (var hj = 0; hj < svRowsE.length; hj++) {
      if (horrorPresent_(svRowsE[hj][COL.PC.MEMORY], gid)) { horrorUpkeep = HORROR_HOURLY_UPKEEP; break; }
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
//   HP：靈基自我修復(每小時 5%×倍率)；MP(從者)：走魔力收支經濟(供給+靈脈+工房-維持)，
//   休息把「收入」加倍、維持不變；魔力觸底會反傷靈基。只改記憶體 data；回傳是否有變動。
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

  // 🔋 出力電池制(2026-06)：從者【沒有自有魔力池】——御主MP 是唯一且持續的魔力資源，被同隊從者按「出力檔位」持續抽取。
  //   先蒐集御主列＋在世同隊從者，再算御主魔力收支：收入(迴路供給+靈脈+工房) − Σ 從者維持費×出力 drainMul。
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
  // 🐙 深淵海怪·時間維持費(2026-07 玩家定案·取代 12h 碼表)：海怪在場＝共用池的另一張嘴，
  //   每小時另抽 HORROR_HOURLY_UPKEEP。池赤字時【海怪先沉回深淵、才輪到御主燃血】(見下方 deficit 分支)。
  var horrorIdx = -1;
  svRows.forEach(function (ri) {
    if (horrorIdx !== -1) return;
    if (horrorPresent_(data[ri][COL.PC.MEMORY], gameId)) horrorIdx = ri;
  });
  if (horrorIdx !== -1) totalDrain += HORROR_HOURLY_UPKEEP;

  // 御主魔力淨收支（休息把收入加倍、維持不變）→ 寫回御主 MP。
  //   🩸 被動燃血(2026-07 玩家定案：只扣御主)：池見底、時消耗補不上的缺口 → 御主自動燃命續契約——
  //   缺口÷2 全額由御主血肉支付、【從者一律不扣血】(從者無自有魔力池，代價全在電池=御主身上)。
  //   不再強制降出力(玩家想少流血就自己節流)；保底 1 HP(被動 tick 不直接秒死，但會磨成殘血任人宰)。
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
    // 🩸 被動燃血(玩家定 2026-07)：缺口/2 全額由御主承擔——從者不扣血(電池代價歸電池)。
    masterBurn = Math.round(unfunded / 2);
    var mHpMax = parseInt(data[masterI][COL.PC.MAX_HP]) || 0, mHp = parseInt(data[masterI][COL.PC.HP]) || 0;
    // 缺口時御主被動燃血扣血(保底1)；否則自我修復
    var nMHp = unfunded > 0 ? Math.max(1, mHp - masterBurn)
                            : (mHpMax ? Math.min(mHpMax, mHp + Math.round(mHpMax * hpRate * hours * mult)) : mHp);
    if (nMMp !== mMp || nMHp !== mHp) { data[masterI][COL.PC.MP] = nMMp; data[masterI][COL.PC.HP] = nMHp; did = true; }
  }

  // 從者：【不參與燃血】(2026-07 玩家定案)。缺口時魔力短缺、靈基自我修復停擺(HP 不動)；無缺口則正常自我修復。
  //   出力檔＝玩家旋鈕，不在時回變動；無自有魔力池。
  var deficitNow = masterBurn > 0;
  svRows.forEach(function (ri) {
    var shpMax = parseInt(data[ri][COL.PC.MAX_HP]) || 0, shp = parseInt(data[ri][COL.PC.HP]) || 0;
    var snhp = deficitNow ? shp
                          : (shpMax ? Math.min(shpMax, shp + Math.round(shpMax * hpRate * hours * mult)) : shp);
    if (snhp !== shp) { data[ri][COL.PC.HP] = snhp; did = true; }
  });
  return did;
}

// 從御主列的 MEMORY 取魔術迴路數（【迴路】N），無則預設 30。
function masterCircuits_(masterRow) {
  var m = String(masterRow && masterRow[COL.PC.MEMORY] || "").match(/【迴路】(\d+)/);
  return m ? parseInt(m[1]) : 30;
}

// 🔋 敵御主每日回魔：敵御主電池只會被 drainForNp_ 扣、從不隨時間自然回——長局若不補，
//   放過一次寶具後就永久魔力見底，往後所有遭遇都啞火(反而喪失「寶具是孤注一擲」的張力)。
//   不用玩家那套逐時供需經濟(NPC 不必算到那麼細)，改用最簡單的「新的一天回滿」：MEMORY 記
//   最後回魔的絕對日；worldTick_ 每次執行，見到記錄的日 < 當前日 → 補滿並蓋新日期戳。
function getManaDay_(memory) { var m = String(memory || "").match(/【回魔日】(\d+)/); return m ? parseInt(m[1]) : -1; }
function stampManaDay_(memory, day) {
  var s = String(memory || "").replace(/【回魔日】\d+/, "");
  s = s.replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  return (s ? s + "｜" : "") + "【回魔日】" + day;
}
function refillMastersDaily_(sheets, gameId, day, preData) {
  var data = preData || sheets.pc.getDataRange().getValues();
  var dirty = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.FACTION]) !== "敵御主") continue;
    if (String(data[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (getManaDay_(data[i][COL.PC.MEMORY]) >= day) continue; // 今天已補過
    var maxMp = parseInt(data[i][COL.PC.MAX_MP]) || 0;
    data[i][COL.PC.MP] = maxMp;
    data[i][COL.PC.MEMORY] = stampManaDay_(data[i][COL.PC.MEMORY], day);
    dirty = true;
  }
  // 多名敵御主同天需回魔時，MP/MEMORY 各整欄一次寫回(取代迴圈內逐列 setValues 的零散往返，同 worldTick_ LOC 批寫手法)
  if (dirty) {
    var mpCol = [], memCol = [];
    for (var z = 1; z < data.length; z++) { mpCol.push([data[z][COL.PC.MP]]); memCol.push([data[z][COL.PC.MEMORY]]); }
    sheets.pc.getRange(2, COL.PC.MP + 1, mpCol.length, 1).setValues(mpCol);
    sheets.pc.getRange(2, COL.PC.MEMORY + 1, memCol.length, 1).setValues(memCol);
  }
}

// 🌐 世界自走一輪：敵移位（偵查失效）＋ 暗處從者陣亡（戰爭自走）
//   rounds：跑幾輪；allowAttrition：是否允許「暗處廝殺/養不起爆炸」（僅休息時 true，移動只換位）
//   回傳 { rumors:[..文字..], moved:n }
var WORLD_FLOOR_ = 4; // 世界自走永遠至少保留這麼多名敵從者給玩家親手解決（不會被自走清光）
var ATTRITION_START_DAY = 3; // ⏳ 開戰前期不減員：第 N 日(含)前，世界不會有從者暗處殞落（給玩家喘息＋貼戰爭初期蟄伏）
// 🩹 2026-07：敵從者每輪世界自走小幅回血(不看同地/攻防狀態、不吃玩家 rest×2 加成)——
//   玩家自己(applyRegen_)每次休息都全額回血回魔，敵從者卻永遠沒有對應機制，傷勢會一直停在原地。
//   撤離又幾乎零成本(見 actionMove 撤離判定)，兩者相加＝「打一下、撤退回血、再打一下」保證磨死任何敵人，
//   毫無風險。給敵從者一點點自癒(比玩家慢很多、不隨休息倍增)，讓無限次撤退刷血不再穩贏，逼玩家要嘛
//   加快節奏、要嘛正面找到真正的剋制手段——而不是純靠耐心。
//   ⚠ 2026-07 二修(玩家反饋 0.03 太少、6h 只回 6% 沒感覺)：0.03→0.06，休息 6h(2輪)回 12%、
//   12h上限(4輪)回 24%；對比玩家自己休息 6h 回 60% HP(0.05×6×2)，敵人仍慢得多，但磨血刀不再幾乎無感。
var ENEMY_REGEN_RATE_ = 0.06;
function worldTick_(sheets, gameId, playerLoc, rounds, allowAttrition, preData) {
  var rumors = [];
  if (!gameId) return { rumors: rumors, moved: 0 };
  rounds = rounds || 1;
  // ⚡ 2026-07 收斂：全函式只整表讀一次，往後各階段(移位/廝殺/透支判定)共用同一份記憶體 data、
  //   只做局部批次寫回(LOC欄/單列)——原本每輪重讀一次+廝殺前後各再讀一次，一次 worldTick_ 呼叫最多整表讀 3+ 次。
  // ⚡ 2026-07 再收斂：呼叫端(actionMove/actionRest)手上通常已有剛讀好的整表 → 傳 preData 直接在
  //   同一份陣列上原地改(JS 陣列傳參考)，呼叫端事後不必為了「拿到 tick 後最新狀態」而重讀一次整表；
  //   沒傳(其餘呼叫點)才自己整表讀一次(相容)。
  var data = preData || sheets.pc.getDataRange().getValues();
  var _ck0 = getClock_(gameId, data); if (_ck0) refillMastersDaily_(sheets, gameId, _ck0.day, data);
  var moved = 0;
  // ⚡ 2026-07 收斂：LOC/HP 整欄批次寫回原本各輪跑一次(rounds 最多4輪·12h休息)，改成跨輪累積髒旗標、
  //   迴圈跑完後各自只寫一次——data 是同一份陣列全程原地改，跑完才寫不影響任何一輪讀到的中間值。
  var anyLocDirty = false, anyHpDirty = false;

  for (var rd = 0; rd < rounds; rd++) {
    // 1) 敵御主帶著從者隨機移位（機率 35%），移走者重設偵查旗標→地圖再次隱形
    var freezeLoc = String(playerLoc || "").trim(); // 🔒 玩家所在/將抵達的格子上的敵人禁止移動，否則玩家永遠追不到人
    var locDirty = false;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL.PC.FACTION]) !== "敵御主") continue;
      if (String(data[i][COL.PC.GAME_ID] || "") !== gameId) continue;
      if (String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
      var oldLoc = String(data[i][COL.PC.LOC]).trim();
      if (freezeLoc && oldLoc === freezeLoc) continue; // 敵在玩家格上→鎖住，留給玩家正面遭遇
      if (Math.random() >= 0.35) continue;
      var newLoc = enemyRetreatLoc_(oldLoc);
      if (newLoc === oldLoc) continue;
      data[i][COL.PC.LOC] = newLoc; locDirty = true;
      // 🔭 已偵查到的敵人移位後【保持可見】(不再清 SEEN)：一旦感應到對手氣息就持續追蹤其當前位置，否則敵人每動一次就
      //   重新隱形、玩家永遠追不到人。未偵查者 SEEN 仍為空、維持迷霧。LOC 改記憶體、整輪後整欄批寫(取代逐列 setValues)。
      // 同地敵從者隨行：優先比對 MEMORY 裡的【御主】tag，避免同格多組互搶從者
      var mName = String(data[i][COL.PC.NAME] || "");
      var foundServant = false;
      // 第一輪：找 MEMORY 有【御主】=mName 的配對從者
      for (var j = 1; j < data.length; j++) {
        if (String(data[j][COL.PC.FACTION]) !== "敵從者") continue;
        if (String(data[j][COL.PC.GAME_ID] || "") !== gameId) continue;
        if (String(data[j][COL.PC.ID]).startsWith("DEAD_")) continue;
        if (String(data[j][COL.PC.LOC]).trim() !== oldLoc) continue;
        if (String(data[j][COL.PC.MEMORY] || "").indexOf("【御主】" + mName) < 0) continue;
        data[j][COL.PC.LOC] = newLoc; foundServant = true; break;
      }
      // 第二輪：找不到配對 → fallback 抓同格任一孤身從者（MEMORY 無【御主】或御主不在同格）
      if (!foundServant) {
        for (var j = 1; j < data.length; j++) {
          if (String(data[j][COL.PC.FACTION]) !== "敵從者") continue;
          if (String(data[j][COL.PC.GAME_ID] || "") !== gameId) continue;
          if (String(data[j][COL.PC.ID]).startsWith("DEAD_")) continue;
          if (String(data[j][COL.PC.LOC]).trim() !== oldLoc) continue;
          data[j][COL.PC.LOC] = newLoc; break;
        }
      }
      moved++;
    }
    if (locDirty) anyLocDirty = true; // 整欄寫回挪到迴圈外一次做，這裡只累積旗標

    // 🩹 敵從者小幅自癒(見 ENEMY_REGEN_RATE_ 註解)：不論攻防/是否同地，move/rest 兩種 tick 都跑，
    //   免額外整表讀寫——沿用同一份 data，整欄批次寫回同樣挪到迴圈外一次做。
    for (var hi = 1; hi < data.length; hi++) {
      if (String(data[hi][COL.PC.FACTION]) !== "敵從者") continue;
      if (String(data[hi][COL.PC.GAME_ID] || "") !== gameId) continue;
      if (String(data[hi][COL.PC.ID]).startsWith("DEAD_")) continue;
      var eHpMax = parseInt(data[hi][COL.PC.MAX_HP]) || 0, eHp = parseInt(data[hi][COL.PC.HP]) || 0;
      if (!eHpMax || eHp <= 0 || eHp >= eHpMax) continue;
      var eNHp = Math.min(eHpMax, eHp + Math.round(eHpMax * ENEMY_REGEN_RATE_));
      if (eNHp !== eHp) { data[hi][COL.PC.HP] = eNHp; anyHpDirty = true; }
    }

    // 🩹 敵從者小幅自癒(見 ENEMY_REGEN_RATE_ 註解)：不論攻防/是否同地，move/rest 兩種 tick 都跑，
    //   免額外整表讀寫——沿用同一份 data、跟 LOC 一樣整欄批次寫回。
    var hpDirty = false;
    for (var hi = 1; hi < data.length; hi++) {
      if (String(data[hi][COL.PC.FACTION]) !== "敵從者") continue;
      if (String(data[hi][COL.PC.GAME_ID] || "") !== gameId) continue;
      if (String(data[hi][COL.PC.ID]).startsWith("DEAD_")) continue;
      var eHpMax = parseInt(data[hi][COL.PC.MAX_HP]) || 0, eHp = parseInt(data[hi][COL.PC.HP]) || 0;
      if (!eHpMax || eHp <= 0 || eHp >= eHpMax) continue;
      var eNHp = Math.min(eHpMax, eHp + Math.round(eHpMax * ENEMY_REGEN_RATE_));
      if (eNHp !== eHp) { data[hi][COL.PC.HP] = eNHp; hpDirty = true; }
    }
    if (hpDirty) {
      var hpCol = [];
      for (var z1 = 1; z1 < data.length; z1++) hpCol.push([data[z1][COL.PC.HP]]);
      sheets.pc.getRange(2, COL.PC.HP + 1, hpCol.length, 1).setValues(hpCol);
    }

    // 2) 暗處從者廝殺：只在「休息」時可能發生（移動只換位，不死人）；
    //    且永遠至少保留 WORLD_FLOOR_ 名敵從者給玩家親手解決——絕不會被世界自走清光。
    if (!allowAttrition) continue;
    // ⏳ 開戰前期(第 ATTRITION_START_DAY 日前)世界不減員——給玩家喘息，也貼「戰爭初期各方按兵蟄伏」。
    var _ckR = getClock_(gameId, data);
    if (_ckR && _ckR.day < ATTRITION_START_DAY) continue;
    var offstage = [];
    for (var k = 1; k < data.length; k++) {
      if (String(data[k][COL.PC.FACTION]) !== "敵從者") continue;
      if (String(data[k][COL.PC.GAME_ID] || "") !== gameId) continue;
      if (String(data[k][COL.PC.ID]).startsWith("DEAD_")) continue;
      // 🩸 戰力分＝六圍階總和(給「低能力先死」用)；解析失敗給高分(不優先被清)
      var pw = 999; try { var _s6 = JSON.parse(data[k][COL.PC.SIX] || '{}'); pw = ['筋力', '耐久', '敏捷', '魔力', '幸運', '寶具'].reduce(function (a, key) { return a + rankVal(_s6[key] || 'E'); }, 0); } catch (e) { }
      offstage.push({ idx: k, name: String(data[k][COL.PC.NAME]), loc: String(data[k][COL.PC.LOC]).trim(), pow: pw });
    }
    var aliveTotal = offstage.length;
    if (aliveTotal <= WORLD_FLOOR_) continue; // 已到底線→世界不再清人，剩下的全交給玩家
    var faraway = offstage.filter(function (o) { return o.loc !== String(playerLoc).trim(); });
    if (!faraway.length) continue;
    // 🗑️ 養不起爆炸(2026-07 移除)：不管怎麼調門檻，全種子庫能真正撞進危險區的組合幾乎只有士郎配阿爾托莉雅
    //   (小迴路撐頂級從者)，其餘配對池子夠用、根本進不了候選——結果變成「隨機世界事件」實際上總是同一個目標，
    //   跟「隨機」的初衷矛盾，玩家體感就是「Saber每次都爆炸」。移除，不留殘骸；masterless 有 SEAL_DOOM_HOURS，
    //   一般戰損有 fateStrike_，死法夠多，不缺這個。
    if (Math.random() < 0.07) { // 暗處廝殺：偶爾一名在他人手中殞落
      // 🩸 低能力先死：挑「戰力(六圍階總和)最低」者殞落——貼「弱者先在混戰中出局」；同分則隨機
      faraway.sort(function (a, b) { return a.pow - b.pow; });
      var _weak = faraway[0].pow;
      var _pool = faraway.filter(function (o) { return o.pow === _weak; });
      var victim = _pool[Math.floor(Math.random() * _pool.length)];
      data[victim.idx][COL.PC.ID] = "DEAD_" + String(data[victim.idx][COL.PC.ID]);
      data[victim.idx][COL.PC.HP] = 0;
      data[victim.idx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "暗處殞落", "顏面": "已無生息" });
      sheets.pc.getRange(victim.idx + 1, 1, 1, data[victim.idx].length).setValues([data[victim.idx]]);
      markMasterLostServant_(sheets.pc, data, victim.idx, "在冬木暗處的廝殺中、歿於他人之手");
      rumors.push("〔風聞〕昨夜冬木某處傳出靈基崩潰的餘波——「" + victim.name + "」似乎已在他人手中殞落。");
    }
  }
  // ⚡ LOC/HP 整欄一次寫回(取代原本每輪各寫一次·最多12h休息=4輪就是4次)——data 全程原地改，
  //   等所有輪跑完才寫，仍是同一份最終狀態，只是省去中途的重複 Sheets 寫入次數。
  if (anyLocDirty) {
    var locColF = [];
    for (var zl = 1; zl < data.length; zl++) locColF.push([data[zl][COL.PC.LOC]]);
    sheets.pc.getRange(2, COL.PC.LOC + 1, locColF.length, 1).setValues(locColF);
  }
  if (anyHpDirty) {
    var hpColF = [];
    for (var zh = 1; zh < data.length; zh++) hpColF.push([data[zh][COL.PC.HP]]);
    sheets.pc.getRange(2, COL.PC.HP + 1, hpColF.length, 1).setValues(hpColF);
  }
  // 🕯️ 令咒耗盡·靈基透支：時間到 → 無「單獨行動」自持的脫逃敵從者，靈基崩解消滅。
  //   這不是世界隨機清人(那有 WORLD_FLOOR_ 保底)，而是玩家親手把對方打到燃盡令咒後的「延遲結算」，故允許收尾、可觸發勝利。
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
        var dl = getDoom_(data[di][COL.PC.MEMORY]);
        if (dl > 0 && nowAbs >= dl) {
          data[di][COL.PC.ID] = "DEAD_" + String(data[di][COL.PC.ID]);
          data[di][COL.PC.HP] = 0;
          data[di][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "令咒耗盡·靈基透支消滅", "顏面": "已無生息" });
          sheets.pc.getRange(di + 1, 1, 1, data[di].length).setValues([data[di]]);
          markMasterLostServant_(sheets.pc, data, di, "三道令咒燃盡、靈基透支崩解而消滅");
          rumors.push("〔風聞〕「" + String(data[di][COL.PC.NAME]) + "」三道令咒已燃盡、又無『單獨行動』自持，失穩的靈基終究撐不過——崩解消散於冬木的夜色中。");
          faded = true;
        }
      }
      if (faded && aliveEnemyServants_(sheets, gameId) <= 0) {
        victory = true;
        // 🏆 這裡是唯二的「非直接戰鬥致勝」路徑(令咒透支延遲結算)，同樣要有願望夢——查玩家自己的
        // 御主/從者列給 buildVictoryDreamPrompt_。
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

  return { rumors: rumors, moved: moved, victory: victory, dreamPrompt: dreamPrompt };
}
