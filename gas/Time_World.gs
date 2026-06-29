// ==========================================
// ⏳ Time_World.gs — 輕量時間流動 ＋ 世界自走（找回 AP 爽感，砍掉維持費經濟）
//   1 AP = 1 小時。移動 2／戰鬥 1／補魔 1／偵查 1 耗 AP；聊天/令咒自身向 ＝ 0（凍結）。
//   休息：玩家自選時數，每小時補 2 AP（6h 補滿）。何時休由玩家決定。
//   世界 tick（移動/休息時）：敵移位(偵查失效) ＋ 暗處從者陣亡(戰爭自走)。
// ==========================================

var AP_PER_DAY = 12; // 體力池上限（1 AP = 1 小時的行動）

// 取得（或初始化）某 game_id 的時鐘
function getClock_(gameId) {
  if (!gameId) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("時鐘");
  if (!sh) return null;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.CLK.GAME_ID]) === gameId) {
      var apCell = data[i][COL.CLK.AP];
      var ap = (apCell === "" || apCell == null) ? AP_PER_DAY : (parseInt(apCell) || 0);
      return { sheet: sh, gameId: gameId, row: i + 1, day: parseInt(data[i][COL.CLK.DAY]) || 1, hour: parseInt(data[i][COL.CLK.HOUR]) || 20, ap: ap };
    }
  }
  // 初始化：第 1 日 20:00（夜）、AP 滿
  sh.appendRow([gameId, 1, 20, AP_PER_DAY]);
  return { sheet: sh, gameId: gameId, row: sh.getLastRow(), day: 1, hour: 20, ap: AP_PER_DAY };
}

function writeClock_(clk) {
  if (!clk || !clk.sheet) return;
  clk.sheet.getRange(clk.row, 1, 1, 4).setValues([[clk.gameId, clk.day, clk.hour, clk.ap]]);
}

// 推進小時（內部用，roll day）
function rollHours_(clk, hours) {
  clk.hour += hours;
  while (clk.hour >= 24) { clk.hour -= 24; clk.day += 1; }
}

// 取目前 AP（無時鐘回滿）
function getAp_(gameId) {
  var clk = getClock_(gameId);
  return clk ? clk.ap : AP_PER_DAY;
}

// 消耗 AP：1 AP = 1 小時。足夠則扣 cost、推進 cost 小時、回 {ok,ap}；不足回 {ok:false,ap}
function spendAp_(gameId, cost) {
  var clk = getClock_(gameId);
  if (!clk) return { ok: true, ap: AP_PER_DAY }; // 無時鐘(相容)→不擋
  if (clk.ap < cost) return { ok: false, ap: clk.ap };
  clk.ap -= cost;
  rollHours_(clk, cost);
  writeClock_(clk);
  return { ok: true, ap: clk.ap, day: clk.day, hour: clk.hour };
}

// 🩸 不推進時間、直接補 n 點 AP（second wind 燃燒生命強撐用）
function grantAp_(gameId, n) {
  var clk = getClock_(gameId);
  if (!clk) return AP_PER_DAY;
  clk.ap = Math.min(AP_PER_DAY, clk.ap + n);
  writeClock_(clk);
  return clk.ap;
}

// 🛏️ 休息 N 小時：推進 N 小時、補 2×N AP（上限 12）。何時休、休多久由玩家決定。
function restHours_(gameId, hours) {
  var clk = getClock_(gameId);
  if (!clk) return null;
  hours = Math.max(1, Math.min(12, parseInt(hours) || 1));
  rollHours_(clk, hours);
  clk.ap = Math.min(AP_PER_DAY, clk.ap + hours * 2);
  writeClock_(clk);
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
function clockLabel_(gameId) {
  var clk = getClock_(gameId);
  if (!clk) return "";
  return "第 " + clk.day + " 日・" + ("0" + clk.hour).slice(-2) + ":00・" + timeBand_(clk.hour);
}


// 🔮 靈脈：依坤圖地點「類型」給每小時回魔基值。靈地(柳洞寺/河畔)匯聚最高、據點/祭壇(宅邸/教會)中等、城區野外最低。
//   沿用既有 TYPE 欄，不動 schema。
function leylineAt_(sheets, loc) {
  if (!sheets || !sheets.map || !loc) return 2;
  var root = String(loc).split('-')[0].trim();
  try {
    var data = sheets.map.getDataRange().getValues();
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

// 取玩家家園(居所 COL.AUTH.HOME_LOC)所在地；無則 ""。
function playerHomeLoc_(sheets, pcId) {
  if (!sheets || !sheets.auth) return "";
  try {
    var d = sheets.auth.getDataRange().getValues();
    for (var i = 1; i < d.length; i++) {
      if (String(d[i][COL.AUTH.ID]).trim() === String(pcId).trim()) return String(d[i][COL.AUTH.HOME_LOC] || "").trim();
    }
  } catch (e) { }
  return "";
}

// 供前端顯示：玩家從者當前魔力收支與所在靈脈（null＝無存活從者）
function playerServantEconomy_(sheets, pcId) {
  var data = sheets.pc.getDataRange().getValues();
  var pIdx = -1; for (var i = 1; i < data.length; i++) { if (String(data[i][COL.PC.ID]) === String(pcId)) { pIdx = i; break; } }
  if (pIdx < 0) return null;
  var gid = String(data[pIdx][COL.PC.GAME_ID] || "");
  var circuits = masterCircuits_(data[pIdx]);
  var homeLoc = playerHomeLoc_(sheets, pcId);
  var sv = null;
  for (var j = 1; j < data.length; j++) {
    if (String(data[j][COL.PC.FACTION]) === "從者" && String(data[j][COL.PC.GAME_ID] || "") === gid && !String(data[j][COL.PC.ID]).startsWith("DEAD_")) { sv = data[j]; break; }
  }
  if (!sv) return null;
  var loc = String(sv[COL.PC.LOC] || "");
  var ley = leylineAt_(sheets, loc);
  var rootLoc = loc.split('-')[0].trim();
  var atHome = !!(homeLoc && rootLoc && String(homeLoc).split('-')[0].trim() === rootLoc);
  var c = rowToCombatant_(sv);
  var hasTerritory = !!hasFx_(c, 'territory');
  var eco = servantEconomy_(circuits, c.six, !!hasFx_(c, 'mad'), ley, atHome || hasTerritory);
  // 🔋 出力電池制：顯示的是「御主MP」收支——維持費依從者出力檔位放大/縮小。
  var output = servantOutput_(sv[COL.PC.MEMORY]);
  var drain = Math.round(eco.drain * outputTier_(output).drainMul);
  var net = eco.income - drain;
  return {
    income: eco.income, drain: drain, net: net,
    supply: eco.supply, ley: eco.ley, workshop: eco.workshop,
    leyLabel: LEYLINE_LABEL_[ley] || "魔力稀薄", loc: rootLoc,
    atHome: atHome, hasTerritory: hasTerritory, sustainable: net >= 0, circuits: circuits,
    output: output, outputLabel: outputTier_(output).label
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

  // 🔋 共用魔力池：同隊從者魔力 rankVal 總和 → 重算池上限(迴路×6 + 魔力×2) ＋ 從者回魔貢獻(少)。
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

  // 御主魔力淨收支（休息把收入加倍、維持不變）→ 寫回御主 MP。
  //   🩸 被動燃血(2026-06)：池見底、時消耗補不上的缺口 → 自動燃命續契約——缺口÷2，同時扣御主HP＋從者HP(平均)。
  //   不再強制降出力(玩家想少流血就自己節流)；各保底 1 HP(被動 tick 不直接秒死，但會磨成殘血任人宰)。
  var masterBurn = 0, svBurnEach = 0;
  if (masterI >= 0) {
    // 重算共用池上限(把同隊從者魔力併進來)；夾住當前 MP
    var mMpMax = masterPoolMax_(circuits, partyMagicVal);
    if (mMpMax !== (parseInt(data[masterI][COL.PC.MAX_MP]) || 0)) { data[masterI][COL.PC.MAX_MP] = mMpMax; did = true; }
    var mMp = Math.min(parseInt(data[masterI][COL.PC.MP]) || 0, mMpMax);
    var perHour = (income * mult) - totalDrain;
    var rawNew = mMp + perHour * hours;                                  // 可能為負＝池補不上的缺口
    var nMMp = mMpMax ? Math.max(0, Math.min(mMpMax, Math.round(rawNew))) : mMp;
    var unfunded = (mMpMax && rawNew < 0) ? Math.round(-rawNew) : 0;     // 缺口(mana)，改由血肉支付
    masterBurn = Math.round(unfunded / 2);
    svBurnEach = (unfunded - masterBurn) > 0 && svRows.length ? Math.round((unfunded - masterBurn) / svRows.length) : 0;
    var mHpMax = parseInt(data[masterI][COL.PC.MAX_HP]) || 0, mHp = parseInt(data[masterI][COL.PC.HP]) || 0;
    // 缺口時御主被動燃血扣血(保底1)；否則自我修復
    var nMHp = unfunded > 0 ? Math.max(1, mHp - masterBurn)
                            : (mHpMax ? Math.min(mHpMax, mHp + Math.round(mHpMax * hpRate * hours * mult)) : mHp);
    if (nMMp !== mMp || nMHp !== mHp) { data[masterI][COL.PC.MP] = nMMp; data[masterI][COL.PC.HP] = nMHp; did = true; }
  }

  // 從者：缺口時被動燃血扣 HP(平均分擔另一半缺口，保底1)；否則靈基自我修復。出力檔＝玩家旋鈕，不在時回變動；無自有魔力池。
  svRows.forEach(function (ri) {
    var shpMax = parseInt(data[ri][COL.PC.MAX_HP]) || 0, shp = parseInt(data[ri][COL.PC.HP]) || 0;
    var snhp = svBurnEach > 0 ? Math.max(1, shp - svBurnEach)
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

// 🌐 世界自走一輪：敵移位（偵查失效）＋ 暗處從者陣亡（戰爭自走）
//   rounds：跑幾輪；allowAttrition：是否允許「暗處廝殺/養不起爆炸」（僅休息時 true，移動只換位）
//   回傳 { rumors:[..文字..], moved:n }
var WORLD_FLOOR_ = 4; // 世界自走永遠至少保留這麼多名敵從者給玩家親手解決（不會被自走清光）
function worldTick_(sheets, gameId, playerLoc, rounds, allowAttrition) {
  var rumors = [];
  if (!gameId) return { rumors: rumors, moved: 0 };
  rounds = rounds || 1;
  var moved = 0;

  for (var rd = 0; rd < rounds; rd++) {
    var data = sheets.pc.getDataRange().getValues();

    // 1) 敵御主帶著從者隨機移位（機率 35%），移走者重設偵查旗標→地圖再次隱形
    var freezeLoc = String(playerLoc || "").trim(); // 🔒 玩家所在/將抵達的格子上的敵人禁止移動，否則玩家永遠追不到人
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL.PC.FACTION]) !== "敵御主") continue;
      if (String(data[i][COL.PC.GAME_ID] || "") !== gameId) continue;
      if (String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
      var oldLoc = String(data[i][COL.PC.LOC]).trim();
      if (freezeLoc && oldLoc === freezeLoc) continue; // 敵在玩家格上→鎖住，留給玩家正面遭遇
      if (Math.random() >= 0.35) continue;
      var newLoc = enemyRetreatLoc_(oldLoc);
      if (newLoc === oldLoc) continue;
      data[i][COL.PC.LOC] = newLoc;
      // 🔭 已偵查到的敵人移位後【保持可見】(不再清 SEEN)：一旦感應到對手氣息就持續追蹤其當前位置，
      //   否則敵人每動一次就重新隱形、玩家永遠追不到人(「又找不到人」的根因)。未偵查者 SEEN 仍為空、維持迷霧。
      sheets.pc.getRange(i + 1, 1, 1, data[i].length).setValues([data[i]]);
      // 同地敵從者隨行
      for (var j = 1; j < data.length; j++) {
        if (String(data[j][COL.PC.FACTION]) !== "敵從者") continue;
        if (String(data[j][COL.PC.GAME_ID] || "") !== gameId) continue;
        if (String(data[j][COL.PC.ID]).startsWith("DEAD_")) continue;
        if (String(data[j][COL.PC.LOC]).trim() !== oldLoc) continue;
        data[j][COL.PC.LOC] = newLoc;
        // (同上)隨行從者移位後也保持原本的偵查狀態，不重置隱形
        sheets.pc.getRange(j + 1, 1, 1, data[j].length).setValues([data[j]]);
        break;
      }
      moved++;
    }

    // 2) 暗處從者廝殺/養不起爆炸：只在「休息」時可能發生（移動只換位，不死人）；
    //    且永遠至少保留 WORLD_FLOOR_ 名敵從者給玩家親手解決——絕不會被世界自走清光。
    if (!allowAttrition) continue;
    var fresh = sheets.pc.getDataRange().getValues();
    var offstage = [];
    for (var k = 1; k < fresh.length; k++) {
      if (String(fresh[k][COL.PC.FACTION]) !== "敵從者") continue;
      if (String(fresh[k][COL.PC.GAME_ID] || "") !== gameId) continue;
      if (String(fresh[k][COL.PC.ID]).startsWith("DEAD_")) continue;
      offstage.push({ idx: k, name: String(fresh[k][COL.PC.NAME]), loc: String(fresh[k][COL.PC.LOC]).trim() });
    }
    var aliveTotal = offstage.length;
    if (aliveTotal <= WORLD_FLOOR_) continue; // 已到底線→世界不再清人，剩下的全交給玩家
    var faraway = offstage.filter(function (o) { return o.loc !== String(playerLoc).trim(); });
    if (!faraway.length) continue;
    // 維持費(六圍 rank 總和)：越貴越可能養不起
    faraway.forEach(function (o) {
      var six = {}; try { six = JSON.parse(fresh[o.idx][COL.PC.SIX] || "{}"); } catch (e) { }
      var sum = 0; ["筋力", "耐久", "敏捷", "魔力", "幸運", "寶具"].forEach(function (k) { sum += rankVal(six[k] || "C"); });
      o.upkeep = sum;
    });
    faraway.sort(function (a, b) { return b.upkeep - a.upkeep; });
    var top = faraway[0];
    // 養不起爆炸：只有「極度昂貴(>=260)」的英靈才有機會，且機率溫和(上限 18%)
    var boom = (top.upkeep >= 260) ? Math.min(0.18, (top.upkeep - 260) / 500 + 0.06) : 0;
    if (boom > 0 && Math.random() < boom) {
      fresh[top.idx][COL.PC.ID] = "DEAD_" + String(fresh[top.idx][COL.PC.ID]);
      fresh[top.idx][COL.PC.HP] = 0;
      fresh[top.idx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "供魔不繼·靈基崩潰", "顏面": "已無生息" });
      sheets.pc.getRange(top.idx + 1, 1, 1, fresh[top.idx].length).setValues([fresh[top.idx]]);
      markMasterLostServant_(sheets.pc, fresh, top.idx, "供魔不繼、靈基終究餵不飽而崩潰消散");
      logWarEvent_(gameId, "敵從者「" + top.name + "」的御主供魔不繼，龐大靈基餵不飽而崩潰消散。");
      rumors.push("〔風聞〕「" + top.name + "」的御主供魔不繼——龐大的靈基終究餵不飽，崩潰消散了。");
    } else if (Math.random() < 0.07) { // 暗處廝殺：偶爾一名在他人手中殞落
      var victim = faraway[Math.floor(Math.random() * faraway.length)];
      fresh[victim.idx][COL.PC.ID] = "DEAD_" + String(fresh[victim.idx][COL.PC.ID]);
      fresh[victim.idx][COL.PC.HP] = 0;
      fresh[victim.idx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "暗處殞落", "顏面": "已無生息" });
      sheets.pc.getRange(victim.idx + 1, 1, 1, fresh[victim.idx].length).setValues([fresh[victim.idx]]);
      markMasterLostServant_(sheets.pc, fresh, victim.idx, "在冬木暗處的廝殺中、歿於他人之手");
      logWarEvent_(gameId, "敵從者「" + victim.name + "」在冬木暗處的廝殺中歿於他人之手。");
      rumors.push("〔風聞〕昨夜冬木某處傳出靈基崩潰的餘波——「" + victim.name + "」似乎已在他人手中殞落。");
    }
  }
  // 🕯️ 令咒耗盡·靈基透支：時間到 → 無「單獨行動」自持的脫逃敵從者，靈基崩解消滅。
  //   這不是世界隨機清人(那有 WORLD_FLOOR_ 保底)，而是玩家親手把對方打到燃盡令咒後的「延遲結算」，故允許收尾、可觸發勝利。
  var victory = false;
  try {
    var ck = getClock_(gameId);
    if (ck) {
      var nowAbs = ck.day * 24 + ck.hour;
      var dd = sheets.pc.getDataRange().getValues();
      var faded = false;
      for (var di = 1; di < dd.length; di++) {
        if (String(dd[di][COL.PC.FACTION]) !== "敵從者") continue;
        if (String(dd[di][COL.PC.GAME_ID] || "") !== gameId) continue;
        if (String(dd[di][COL.PC.ID]).startsWith("DEAD_")) continue;
        var dl = getDoom_(dd[di][COL.PC.MEMORY]);
        if (dl > 0 && nowAbs >= dl) {
          dd[di][COL.PC.ID] = "DEAD_" + String(dd[di][COL.PC.ID]);
          dd[di][COL.PC.HP] = 0;
          dd[di][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "令咒耗盡·靈基透支消滅", "顏面": "已無生息" });
          sheets.pc.getRange(di + 1, 1, 1, dd[di].length).setValues([dd[di]]);
          markMasterLostServant_(sheets.pc, dd, di, "三道令咒燃盡、靈基透支崩解而消滅");
          logWarEvent_(gameId, "敵從者「" + String(dd[di][COL.PC.NAME]) + "」三道令咒燃盡、無單獨行動自持，靈基透支崩解消滅。");
          rumors.push("〔風聞〕「" + String(dd[di][COL.PC.NAME]) + "」三道令咒已燃盡、又無『單獨行動』自持，失穩的靈基終究撐不過——崩解消散於冬木的夜色中。");
          faded = true;
        }
      }
      if (faded && aliveEnemyServants_(sheets, gameId) <= 0) victory = true;
    }
  } catch (e) { }

  return { rumors: rumors, moved: moved, victory: victory };
}
