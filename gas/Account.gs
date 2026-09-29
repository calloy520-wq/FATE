// ==========================================
// 🔵 Account.gs — FATE 帳號層（存檔身分）
//   帳號名(無密碼)登入；帳號列記著這個帳號的後日談角色 ID（新聖杯戰爭的存檔以帳號名為鍵，見 War_Router.gs）。
// ==========================================
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。

function findAccountRow_(accSheet, name) {
  var data = accSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.ACC.NAME]).trim() === name) return { idx: i, row: data[i] };
  }
  return null;
}

// 🔒 單一真實來源：「這個 pcId 真的屬於這個帳號嗎」驗證。
function verifyPcOwnership_(acctName, pcId) {
  try {
    var id = String(pcId || "");
    if (!id) return false;
    var name = String(acctName || "").trim();
    if (!name) return false;
    var acc = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("帳號");
    var found = acc && findAccountRow_(acc, name);
    if (!found) return false;
    var col = id.indexOf("KPC_") === 0 ? COL.ACC.KPC : COL.ACC.PC;
    return String(found.row[col] || "") === id;
  } catch (e) { return false; }
}


// 登入：找不到就建立；回傳這個帳號有沒有後日談存檔。
function actionAccountLogin(userData, pcId, sheets) {
  var name = String(userData.acctName || "").trim().slice(0, 20);
  if (!name) return JSON.stringify({ success: false, message: "先打個帳號名。" });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { ensureWorldReady_(ss); } catch (e) { Logger.log("ensureWorldReady_ 失敗(略過): " + e.message); }
  var acc = ss.getSheetByName("帳號");
  if (!acc) return JSON.stringify({ success: false, message: "帳號表不見了，重新整理。" });
  if (!findAccountRow_(acc, name)) {
    acc.getRange(acc.getLastRow() + 1, COL.ACC.NAME + 1).setNumberFormat("@");
    acc.appendRow([name, "", new Date()]);
  }
  // 🌹 鑑賞存檔狀態：主選單要據此決定顯不顯示「後日談歸零重來」(沒東西可清就不長那顆鈕)。
  var kpcId = "";
  try { kpcId = getAccountKanshouPcId_(name) || ""; } catch (e) { }
  return JSON.stringify({ success: true, name: name, kpcId: kpcId });
}


