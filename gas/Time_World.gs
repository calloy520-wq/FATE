// ==========================================
// ⏳ Time_World.gs — 輕量時間流動 ＋ 世界自走（忠於舊版精神，砍掉 AP/維持費）
//   聊天/補魔/令咒/互動 ＝ 免費凍結；移動／歇息 ＝ 推進時間＋世界 tick。
//   世界 tick：敵移位(偵查失效) ＋ 暗處從者陣亡(戰爭自走) ＋ 深夜野外夜襲機率。
// ==========================================

var AP_PER_DAY = 12; // 每日行動點（1 AP = 2 小時 → 12 AP = 24h）

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

// 消耗 AP：足夠則扣 cost、推進 cost×2 小時、回 {ok,ap,day,hour}；不足回 {ok:false,ap}
function spendAp_(gameId, cost) {
  var clk = getClock_(gameId);
  if (!clk) return { ok: true, ap: AP_PER_DAY }; // 無時鐘(相容)→不擋
  if (clk.ap < cost) return { ok: false, ap: clk.ap };
  clk.ap -= cost;
  rollHours_(clk, cost * 2);
  writeClock_(clk);
  return { ok: true, ap: clk.ap, day: clk.day, hour: clk.hour };
}

// ☕ 小憩：推進 1 小時、補 2 AP（上限 12）
function napRest_(gameId) {
  var clk = getClock_(gameId);
  if (!clk) return null;
  rollHours_(clk, 1);
  clk.ap = Math.min(AP_PER_DAY, clk.ap + 2);
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

// 🛏️ 過夜：跳到隔日清晨 06:00、AP 補滿
function restToMorning_(gameId) {
  var clk = getClock_(gameId);
  if (!clk) return null;
  clk.day += 1; clk.hour = 6; clk.ap = AP_PER_DAY;
  writeClock_(clk);
  return clk;
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
    if (aliveTotal >= 2 && faraway.length && Math.random() < 0.18) {
      var victim = faraway[Math.floor(Math.random() * faraway.length)];
      fresh[victim.idx][COL.PC.ID] = "DEAD_" + String(fresh[victim.idx][COL.PC.ID]);
      fresh[victim.idx][COL.PC.HP] = 0;
      fresh[victim.idx][COL.PC.STATUS] = JSON.stringify({ "衣服": "靈基潰散", "姿勢": "倒地", "負面": "暗處殞落", "顏面": "已無生息" });
      sheets.pc.getRange(victim.idx + 1, 1, 1, fresh[victim.idx].length).setValues([fresh[victim.idx]]);
      rumors.push("〔風聞〕昨夜冬木某處傳出靈基崩潰的餘波——「" + victim.name + "」似乎已在他人手中殞落。");
    }
  }
  return { rumors: rumors, moved: moved };
}
