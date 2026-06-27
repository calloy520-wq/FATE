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
  var pcRow = null;
  if (charId) {
    var pcData = sheets.pc.getDataRange().getValues();
    pcRow = pcData.find(function (r) { return String(r[COL.PC.ID]) === charId && !String(r[COL.PC.ID]).startsWith("DEAD_"); });
  }
  if (pcRow) {
    return JSON.stringify({
      success: true, name: name, hasGame: true, won: won,
      pcId: charId, pcName: pcRow[COL.PC.NAME], pcSex: pcRow[COL.PC.SEX]
    });
  }
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
    if (gid) {
      var fresh = sheets.pc.getDataRange().getValues();
      for (var r = fresh.length - 1; r >= 1; r--) {
        if (String(fresh[r][COL.PC.GAME_ID] || "") === gid) sheets.pc.deleteRow(r + 1);
      }
      if (sheets.rel && pcNm) {
        var rd = sheets.rel.getDataRange().getValues();
        for (var k = rd.length - 1; k >= 1; k--) {
          if (String(rd[k][COL.REL.PC]) === pcNm) sheets.rel.deleteRow(k + 1);
        }
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

// 勝利歷史（目前以帳號勝場 + 史紀摘要呈現）
function actionGetVictoryHistory(userData, pcId, sheets) {
  var name = String(userData.acctName || "").trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  var won = 0;
  if (acc) { var f = findAccountRow_(acc, name); if (f) won = parseInt(f.row[COL.ACC.WON]) || 0; }
  return JSON.stringify({ success: true, won: won, records: [] });
}
