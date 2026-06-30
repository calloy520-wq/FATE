// ==========================================
// 🔵 Account.gs — FATE 帳號層（存檔身分）
//   帳號名(無密碼)登入 → 底下掛一個御主＋game_id。
//   繼續 / 新的一局(清舊檔) / 勝利歷史。
// ==========================================

function findAccountRow_(accSheet, name) {
  var data = accSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.ACC.NAME]).trim() === name) return { idx: i, row: data[i] };
  }
  return null;
}

// 登入：找不到就建立。回傳是否有可繼續的存檔。
function actionAccountLogin(userData, pcId, sheets) {
  var name = String(userData.acctName || "").trim().slice(0, 20);
  if (!name) return JSON.stringify({ success: false, message: "請輸入帳號名稱。" });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  if (!acc) return JSON.stringify({ success: false, message: "帳號表不存在，請重新整理。" });

  var found = findAccountRow_(acc, name);
  if (!found) {
    acc.appendRow([name, "", 0, new Date()]);
    return JSON.stringify({ success: true, name: name, hasGame: false, won: 0 });
  }
  var charId = String(found.row[COL.ACC.PC] || "");
  var won = parseInt(found.row[COL.ACC.WON]) || 0;
  var pcData = charId ? sheets.pc.getDataRange().getValues() : [];
  var pcRow = null;
  if (charId) {
    pcRow = pcData.find(function (r) { return String(r[COL.PC.ID]) === charId && !String(r[COL.PC.ID]).startsWith("DEAD_"); });
  }
  if (pcRow) {
    // 🔵 敗北殘局防呆：御主血歸 0、或該局已無存活從者＝這一局已經結束。
    //   即使玩家上次沒按「返回主畫面」就關掉網頁，下次登入也不會卡在死局——直接清理、解除連結、當作沒有存檔。
    var gid = String(pcRow[COL.PC.GAME_ID] || "");
    var masterAlive = (parseInt(pcRow[COL.PC.HP]) || 0) > 0;
    var servantAlive = false, servantName = "";
    if (gid && gid.indexOf("g_") === 0) {
      for (var j = 1; j < pcData.length; j++) {
        if (String(pcData[j][COL.PC.GAME_ID] || "") !== gid) continue;
        if (String(pcData[j][COL.PC.FACTION]) !== "從者") continue;
        if (!servantName) servantName = String(pcData[j][COL.PC.NAME] || "").replace(/^DEAD_/, "");
        if (String(pcData[j][COL.PC.ID]).startsWith("DEAD_")) continue;
        if ((parseInt(pcData[j][COL.PC.HP]) || 0) > 0) { servantAlive = true; break; }
      }
      if (!masterAlive || !servantAlive) {
        // 戰史已在死亡當下（戰鬥敗北／御主殞命）寫入，這裡只負責清理殘局，避免重複記錄。
        try { purgeGameData_(sheets, gid, pcRow[COL.PC.NAME], name); } catch (e) { }
        return JSON.stringify({ success: true, name: name, hasGame: false, won: won, ended: true });
      }
    }
    return JSON.stringify({
      success: true, name: name, hasGame: true, won: won,
      pcId: charId, pcName: pcRow[COL.PC.NAME], pcSex: pcRow[COL.PC.SEX]
    });
  }
  // charId 指向的御主已被標記 DEAD_（或不存在）→ 殘局，解除連結當作沒有存檔
  if (charId) { try { acc.getRange(found.idx + 1, COL.ACC.PC + 1).setValue(""); } catch (e) { } }
  return JSON.stringify({ success: true, name: name, hasGame: false, won: won });
}

// 開新局前清除舊存檔（刪該 game_id 的眾生 + 該御主的關係），並解除帳號連結
function actionAccountNewGame(userData, pcId, sheets) {
  var name = String(userData.acctName || "").trim().slice(0, 20);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  if (!acc) return JSON.stringify({ success: false, message: "帳號表不存在。" });
  var found = findAccountRow_(acc, name);
  if (!found) return JSON.stringify({ success: true }); // 沒帳號＝沒舊檔

  var charId = String(found.row[COL.ACC.PC] || "");
  if (charId) {
    var pcData = sheets.pc.getDataRange().getValues();
    var prow = pcData.find(function (r) { return String(r[COL.PC.ID]) === charId; });
    var gid = prow ? String(prow[COL.PC.GAME_ID] || "") : "";
    var pcNm = prow ? prow[COL.PC.NAME] : "";
    // 刪舊單人戰場：同 game_id 的整個世界 ＋ 御主本人(按 charId，防 game_id 為空的孤兒殘留佔名)
    var fresh = sheets.pc.getDataRange().getValues();
    for (var r = fresh.length - 1; r >= 1; r--) {
      var rgid = String(fresh[r][COL.PC.GAME_ID] || "");
      var rid = String(fresh[r][COL.PC.ID]);
      if ((gid && rgid === gid) || rid === charId) sheets.pc.deleteRow(r + 1);
    }
    if (sheets.rel && pcNm) {
      var rd = sheets.rel.getDataRange().getValues();
      for (var k = rd.length - 1; k >= 1; k--) {
        if (String(rd[k][COL.REL.PC]) === pcNm) sheets.rel.deleteRow(k + 1);
      }
    }
  }
  acc.getRange(found.idx + 1, COL.ACC.PC + 1).setValue(""); // 解除連結
  return JSON.stringify({ success: true });
}

// 🧹 清殘列：清掉「孤兒戰局」殘留——已無任何帳號連結的 game_id 世界(敗北殘局/棄局/亡靈) ＋ 所有 DEAD_ 列。
//   每局的敵御主＋敵從者整批殘留是「眾生」表肥大、拖慢每次按鍵整表掃描的主因。
//   安全準則：① 不碰任一帳號「當前連結中」的活躍戰局；② 不碰 game_id 空白列(可能創角中/舊資料)；
//             ③ 鑑賞(KPC_)在另表「鑑賞眾生」不受影響；④ 關係表只清「被刪御主」名下、且非鑑賞御主的 rel 列。
//   一次性整表 rewrite(setValues + 單次 deleteRows tail)，遠快於逐列 deleteRow。
function actionPurgeOrphans(userData, pcId, sheets) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pc = sheets.pc;
  if (!pc) return JSON.stringify({ success: false, message: "眾生表不存在。" });
  var all = pc.getDataRange().getValues();
  if (all.length < 2) return JSON.stringify({ success: true, removed: 0, kept: 0, relRemoved: 0, message: "眾生表無資料，無殘列可清。" });
  var header = all[0];

  // 1) 收集所有帳號「當前連結中」的御主 charId
  var linkedIds = {};
  var acc = ss.getSheetByName("帳號");
  if (acc) {
    var ad = acc.getDataRange().getValues();
    for (var a = 1; a < ad.length; a++) { var cid = String(ad[a][COL.ACC.PC] || ""); if (cid) linkedIds[cid] = true; }
  }
  // 2) 由連結御主反推「活躍 game_id」（只有這些世界要保）
  var liveGids = {};
  for (var i = 1; i < all.length; i++) {
    var id0 = String(all[i][COL.PC.ID]);
    if (id0.indexOf("DEAD_") === 0) continue;
    if (linkedIds[id0]) { var g0 = String(all[i][COL.PC.GAME_ID] || ""); if (g0) liveGids[g0] = true; }
  }
  // 3) 逐列保留判定；記下被刪的御主名(供關係表清理)
  var kept = [], survivors = {}, purgedMasters = {};
  for (var r = 1; r < all.length; r++) {
    var row = all[r];
    var rid = String(row[COL.PC.ID]);
    var gid = String(row[COL.PC.GAME_ID] || "");
    var keep;
    if (rid.indexOf("DEAD_") === 0) keep = false;   // 死列一律清
    else if (!gid) keep = true;                      // 無 game_id：保守保留
    else keep = !!liveGids[gid];                     // 只留活躍戰局
    if (keep) { kept.push(row); survivors[String(row[COL.PC.NAME])] = true; }
    else if (rid.indexOf("PC_") === 0) purgedMasters[String(row[COL.PC.NAME])] = true; // 玩家御主以 PC_ 為準(FACTION 是門派非"御主")
  }
  var removed = (all.length - 1) - kept.length;
  if (removed > 0) {
    var dataRows = all.length - 1;
    if (kept.length) pc.getRange(2, 1, kept.length, header.length).setValues(kept);
    var tail = dataRows - kept.length;
    if (tail > 0) pc.deleteRows(2 + kept.length, tail);
  }

  // 4) 關係表清理：只刪「被刪御主名下、且該名既非存活御主、也非鑑賞御主」的 rel 列（防誤刪鑑賞關係）
  var relRemoved = 0;
  if (sheets.rel) {
    var kanshouNames = {};
    try {
      var ksh = ss.getSheetByName("鑑賞眾生");
      if (ksh) { var kd = ksh.getDataRange().getValues(); for (var x = 1; x < kd.length; x++) kanshouNames[String(kd[x][COL.PC.NAME])] = true; }
    } catch (e) { }
    var rd = sheets.rel.getDataRange().getValues();
    if (rd.length > 1) {
      var rhead = rd[0], rkept = [];
      for (var k = 1; k < rd.length; k++) {
        var pcNm = String(rd[k][COL.REL.PC]);
        var orphan = purgedMasters[pcNm] && !survivors[pcNm] && !kanshouNames[pcNm];
        if (!orphan) rkept.push(rd[k]);
      }
      relRemoved = (rd.length - 1) - rkept.length;
      if (relRemoved > 0) {
        if (rkept.length) sheets.rel.getRange(2, 1, rkept.length, rhead.length).setValues(rkept);
        var rtail = (rd.length - 1) - rkept.length;
        if (rtail > 0) sheets.rel.deleteRows(2 + rkept.length, rtail);
      }
    }
  }

  return JSON.stringify({
    success: true, removed: removed, kept: kept.length, relRemoved: relRemoved,
    message: "🧹 清殘列完成：眾生移除 " + removed + " 列（孤兒戰局／亡靈殘留），保留 " + kept.length + " 列；關係表清 " + relRemoved + " 列。每次按鍵的整表掃描會更快。"
  });
}

// 把新建的御主連結到帳號（創角後呼叫）
function linkAccountToPc_(accountName, pcCharId) {
  if (!accountName || !pcCharId) return;
  var name = String(accountName).trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  if (!acc) return;
  var found = findAccountRow_(acc, name);
  if (found) {
    acc.getRange(found.idx + 1, COL.ACC.PC + 1).setValue(pcCharId);
  } else {
    acc.appendRow([name, pcCharId, 0, new Date()]);
  }
}

// 由御主 charId 反查所屬帳號名（供 actionPlay 等沒帶 acctName 的路徑記錄戰史）
function findAccountByPc_(charId) {
  if (!charId) return "";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  if (!acc) return "";
  var data = acc.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.ACC.PC]) === String(charId)) return String(data[i][COL.ACC.NAME] || "");
  }
  return "";
}

// 帳號勝場 +1
function incrementWin_(accountName) {
  var name = String(accountName || "").trim();
  if (!name) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  if (!acc) return;
  var found = findAccountRow_(acc, name);
  if (found) {
    var w = parseInt(found.row[COL.ACC.WON]) || 0;
    acc.getRange(found.idx + 1, COL.ACC.WON + 1).setValue(w + 1);
  }
}

// 寫入一筆戰史（勝/敗）
function recordHistory_(accountName, result, servant, summary) {
  var name = String(accountName || "").trim();
  if (!name) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var his = ss.getSheetByName("戰史");
  if (!his) return;
  his.appendRow([name, String(result || ""), String(servant || ""), String(summary || ""), new Date()]);
}

// 🏆 記錄「最快奪杯日數」（取 min 更新）：勝利時由 game_id 讀時鐘當前遊戲日。game_id 空/無時鐘則略過。
function recordWinSpeed_(accountName, gameId) {
  try {
    var name = String(accountName || "").trim();
    if (!name) return;
    var clk = getClock_(gameId);
    if (!clk) return;
    var days = parseInt(clk.day) || 0;
    if (days <= 0) return;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var acc = ss.getSheetByName("帳號");
    if (!acc) return;
    // 補表頭（本版新增欄，冪等）
    try { if (String(acc.getRange(1, COL.ACC.BEST_DAYS + 1).getValue() || "") === "") acc.getRange(1, COL.ACC.BEST_DAYS + 1).setValue("最快奪杯日"); } catch (e) { }
    var found = findAccountRow_(acc, name);
    if (!found) return;
    var prev = parseInt(found.row[COL.ACC.BEST_DAYS]) || 0;
    if (prev <= 0 || days < prev) acc.getRange(found.idx + 1, COL.ACC.BEST_DAYS + 1).setValue(days);
  } catch (e) { }
}

// 🏆 排行榜（以帳號為單位，只撈持久層：帳號表勝場/最快奪杯/建立時間 ＋ 鑑賞圖鑑數）
function actionLeaderboard(userData, pcId, sheets) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var acc = ss.getSheetByName("帳號");
    if (!acc) return JSON.stringify({ success: true, rows: [] });
    var accData = acc.getDataRange().getValues();
    // 鑑賞圖鑑數（每帳號封存的從者數）
    var galCount = {};
    var gal = ss.getSheetByName("鑑賞");
    if (gal) {
      var gd = gal.getDataRange().getValues();
      for (var i = 1; i < gd.length; i++) {
        var ga = String(gd[i][COL.GAL.ACC] || "").trim();
        if (ga) galCount[ga] = (galCount[ga] || 0) + 1;
      }
    }
    var me = String(userData.acctName || "").trim();
    var rows = [];
    for (var r = 1; r < accData.length; r++) {
      var nm = String(accData[r][COL.ACC.NAME] || "").trim();
      if (!nm) continue;
      var won = parseInt(accData[r][COL.ACC.WON]) || 0;
      var best = parseInt(accData[r][COL.ACC.BEST_DAYS]) || 0;
      var created = accData[r][COL.ACC.CREATED];
      var createdStr = "";
      try { createdStr = (created instanceof Date) ? Utilities.formatDate(created, Session.getScriptTimeZone(), "yyyy-MM-dd") : String(created || ""); } catch (e) { }
      rows.push({ name: nm, wins: won, bestDays: best, gallery: galCount[nm] || 0, created: createdStr, isMe: (nm === me) });
    }
    // 排序：勝場↓ → 最快奪杯↑(0=未達標排後) → 圖鑑↓
    rows.sort(function (a, b) {
      if (b.wins !== a.wins) return b.wins - a.wins;
      var ab = a.bestDays || 99999, bb = b.bestDays || 99999;
      if (ab !== bb) return ab - bb;
      return b.gallery - a.gallery;
    });
    return JSON.stringify({ success: true, rows: rows.slice(0, 100), me: me });
  } catch (e) { return JSON.stringify({ success: false, message: String(e) }); }
}

// 勝利歷史（帳號勝場 + 戰史明細，新到舊）
function actionGetVictoryHistory(userData, pcId, sheets) {
  var name = String(userData.acctName || "").trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  var won = 0;
  if (acc) { var f = findAccountRow_(acc, name); if (f) won = parseInt(f.row[COL.ACC.WON]) || 0; }

  var records = [];
  var his = ss.getSheetByName("戰史");
  if (his) {
    var data = his.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][COL.HIST.ACC]).trim() !== name) continue;
      var t = data[i][COL.HIST.TIME];
      var ts = "";
      try { ts = (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") : String(t || ""); } catch (e) { ts = String(t || ""); }
      records.push({
        result: String(data[i][COL.HIST.RESULT] || ""),
        servant: String(data[i][COL.HIST.SERVANT] || ""),
        summary: String(data[i][COL.HIST.SUMMARY] || ""),
        time: ts
      });
    }
    records.reverse(); // 新到舊
  }
  return JSON.stringify({ success: true, won: won, records: records });
}
