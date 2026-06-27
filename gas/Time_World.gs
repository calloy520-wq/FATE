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


// 🌐 世界自走一輪：敵移位（偵查失效）＋ 暗處從者陣亡（戰爭自走）
//   rounds：跑幾輪（移動 1 輪、歇息 2 輪）；playerLoc：玩家所在（暗處＝非此地）
//   回傳 { rumors:[..文字..], moved:n }
function worldTick_(sheets, gameId, playerLoc, rounds) {
  var rumors = [];
  if (!gameId) return { rumors: rumors, moved: 0 };
  rounds = rounds || 1;
  var moved = 0;

  for (var rd = 0; rd < rounds; rd++) {
    var data = sheets.pc.getDataRange().getValues();

    // 1) 敵御主帶著從者隨機移位（機率 35%），移走者重設偵查旗標→地圖再次隱形
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL.PC.FACTION]) !== "敵御主") continue;
      if (String(data[i][COL.PC.GAME_ID] || "") !== gameId) continue;
      if (String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
      if (Math.random() >= 0.35) continue;
      var oldLoc = String(data[i][COL.PC.LOC]).trim();
      var newLoc = enemyRetreatLoc_(oldLoc);
      if (newLoc === oldLoc) continue;
      data[i][COL.PC.LOC] = newLoc;
      if (COL.PC.SEEN != null) data[i][COL.PC.SEEN] = "";
      sheets.pc.getRange(i + 1, 1, 1, data[i].length).setValues([data[i]]);
      // 同地敵從者隨行
      for (var j = 1; j < data.length; j++) {
        if (String(data[j][COL.PC.FACTION]) !== "敵從者") continue;
        if (String(data[j][COL.PC.GAME_ID] || "") !== gameId) continue;
        if (String(data[j][COL.PC.ID]).startsWith("DEAD_")) continue;
        if (String(data[j][COL.PC.LOC]).trim() !== oldLoc) continue;
        data[j][COL.PC.LOC] = newLoc;
        if (COL.PC.SEEN != null) data[j][COL.PC.SEEN] = "";
        sheets.pc.getRange(j + 1, 1, 1, data[j].length).setValues([data[j]]);
        break;
      }
      moved++;
    }

    // 2) 暗處從者廝殺：玩家不在場的存活敵從者 ≥2 時，小機率有一名殞落（永遠留最後一名給玩家收尾）
    var fresh = sheets.pc.getDataRange().getValues();
    var offstage = [];
    for (var k = 1; k < fresh.length; k++) {
      if (String(fresh[k][COL.PC.FACTION]) !== "敵從者") continue;
      if (String(fresh[k][COL.PC.GAME_ID] || "") !== gameId) continue;
      if (String(fresh[k][COL.PC.ID]).startsWith("DEAD_")) continue;
      offstage.push({ idx: k, name: String(fresh[k][COL.PC.NAME]), loc: String(fresh[k][COL.PC.LOC]).trim() });
    }
    var aliveTotal = offstage.length;
    var faraway = offstage.filter(function (o) { return o.loc !== String(playerLoc).trim(); });
    // 計算各從者「維持費」(六圍 rank 總和)：越貴的英靈，弱御主越養不起、越容易供魔不繼而崩潰
    faraway.forEach(function (o) {
      var six = {}; try { six = JSON.parse(fresh[o.idx][COL.PC.SIX] || "{}"); } catch (e) { }
      var sum = 0; ["筋力", "耐久", "敏捷", "魔力", "幸運", "寶具"].forEach(function (k) { sum += rankVal(six[k] || "C"); });
      o.upkeep = sum; // 約 60(全E)~360(全EX)
    });
    if (aliveTotal >= 2 && faraway.length) {
      // 養不起爆炸：挑「最貴」的那隻當高風險者；維持費越高、爆炸機率越高（最低 12%、最高 ~45%）
      faraway.sort(function (a, b) { return b.upkeep - a.upkeep; });
      var top = faraway[0];
      var boom = Math.max(0.12, Math.min(0.45, (top.upkeep - 150) / 400)); // 150↓幾乎不爆，300+很容易爆
      // 一般暗處廝殺（依維持費加權挑victim）＋ 養不起特判
      var starve = (top.upkeep >= 200 && Math.random() < boom);
      if (starve) {
        fresh[top.idx][COL.PC.ID] = "DEAD_" + String(fresh[top.idx][COL.PC.ID]);
        fresh[top.idx][COL.PC.HP] = 0;
        fresh[top.idx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "供魔不繼·靈基崩潰", "顏面": "已無生息" });
        sheets.pc.getRange(top.idx + 1, 1, 1, fresh[top.idx].length).setValues([fresh[top.idx]]);
        rumors.push("〔風聞〕「" + top.name + "」的御主供魔不繼——龐大的靈基終究餵不飽，化作光點崩潰消散了。");
      } else if (Math.random() < 0.15) {
        var victim = faraway[Math.floor(Math.random() * faraway.length)];
        fresh[victim.idx][COL.PC.ID] = "DEAD_" + String(fresh[victim.idx][COL.PC.ID]);
        fresh[victim.idx][COL.PC.HP] = 0;
        fresh[victim.idx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "暗處殞落", "顏面": "已無生息" });
        sheets.pc.getRange(victim.idx + 1, 1, 1, fresh[victim.idx].length).setValues([fresh[victim.idx]]);
        rumors.push("〔風聞〕昨夜冬木某處傳出靈基崩潰的餘波——「" + victim.name + "」似乎已在他人手中殞落。");
      }
    }
  }
  return { rumors: rumors, moved: moved };
}
