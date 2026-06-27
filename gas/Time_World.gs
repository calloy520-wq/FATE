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


// ⏳ 時回：每小時自然回復率。從者 HP 固定（靈基自我修復）；MP 隨「御主魔術迴路」浮動
//   ——迴路越多，能源源導給從者的魔力越穩（呼應舊 Fate 的迴路設定）。circuits 約 10–90。
function regenRatePerHour_(circuits) {
  var c = parseInt(circuits) || 30;
  return {
    hp: 0.05,                               // 靈基自我修復：每小時 +5% 最大 HP
    mp: 0.04 + Math.min(0.05, c / 2000)     // 補魔回流：每小時 +4% MP，再依魔術迴路最多 +5%
  };
}

// 對「御主＋同行從者」施加 hours 小時的時回；mult＝倍率（移動 1、休息 2）。
//   只改記憶體 data（由呼叫端負責寫回）；回傳實際是否有人回復。
function applyRegen_(data, gameId, playerName, partyNames, circuits, hours, mult) {
  if (!gameId || !hours) return false;
  var rate = regenRatePerHour_(circuits);
  var hpF = rate.hp * hours * (mult || 1), mpF = rate.mp * hours * (mult || 1);
  var party = {}; party[String(playerName)] = true;
  (partyNames || []).forEach(function (n) { party[String(n)] = true; });
  var did = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (!party[String(data[i][COL.PC.NAME])]) continue;
    var hpMax = parseInt(data[i][COL.PC.MAX_HP]) || 0, mpMax = parseInt(data[i][COL.PC.MAX_MP]) || 0;
    var hp = parseInt(data[i][COL.PC.HP]) || 0, mp = parseInt(data[i][COL.PC.MP]) || 0;
    var nhp = hpMax ? Math.min(hpMax, hp + Math.round(hpMax * hpF)) : hp;
    var nmp = mpMax ? Math.min(mpMax, mp + Math.round(mpMax * mpF)) : mp;
    if (nhp !== hp || nmp !== mp) { data[i][COL.PC.HP] = nhp; data[i][COL.PC.MP] = nmp; did = true; }
  }
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
      rumors.push("〔風聞〕「" + top.name + "」的御主供魔不繼——龐大的靈基終究餵不飽，崩潰消散了。");
    } else if (Math.random() < 0.07) { // 暗處廝殺：偶爾一名在他人手中殞落
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
