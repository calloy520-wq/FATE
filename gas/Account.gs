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
