// ==========================================
// 🔵 Account.gs — FATE 帳號層（存檔身分）
//   帳號名(無密碼)登入 → 底下掛一個御主＋game_id。
//   繼續 / 新的一局(清舊檔)。
// ==========================================
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。

function findAccountRow_(accSheet, name) {
  var data = accSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.ACC.NAME]).trim() === name) return { idx: i, row: data[i] };
  }
  return null;
}

// 🔒 單一真實來源：solo(PC_)／鑑賞(KPC_) 共用的「這個 pcId 真的屬於這個帳號嗎」驗證。
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

// 依 charId 找「眾生」列，含已標記 DEAD_ 的殘局列：帳號表存的是原始 charId，御主死亡時ID 會被加上 "DEAD_" 前綴但帳號連結不會跟著改，故兩者都要查。
function findPcRowByCharId_(pcData, charId) {
  return pcData.find(function (r) { var rid = String(r[COL.PC.ID]); return rid === charId || rid === "DEAD_" + charId; });
}

// 找玩家目前世界仍存活的從者列（回傳 row 與 index）。
function findPlayerServant_(pcData, gameId) {
  for (var i = 1; i < pcData.length; i++) {
    if (String(pcData[i][COL.PC.FACTION]) !== "從者") continue;
    if (gameId && String(pcData[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(pcData[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    return { idx: i, row: pcData[i] };
  }
  return null;
}

// 清理某 game_id 的整局資料（眾生，關係已併入列自身欄位，刪列即刪關係），並解除帳號連結。
function purgeGameData_(sheets, gameId, accountName, preData, accIdx) {
  if (gameId) {
    var fresh = preData || sheets.pc.getDataRange().getValues();
    var purgedPcIds = [];
    for (var r = fresh.length - 1; r >= 1; r--) {
      if (String(fresh[r][COL.PC.GAME_ID] || "") === gameId) {
        purgedPcIds.push(String(fresh[r][COL.PC.ID]).replace(/^DEAD_/, ""));
        sheets.pc.deleteRow(r + 1);
      }
    }
    try { purgeHistoryForPcIds_(purgedPcIds); } catch (e) { }
    // 📜 這一局的因果帳本也一起清：solo 從 2026-09 起會往世界帳本寫「因果」，
    //    不清的話每開一局就多一批永遠沒人讀的孤兒列（鑑賞歸零那邊早就有這一步）。
    try { kanshouPurgeByGame_(worldSheet_(), KW_.GID, gameId, null); worldBust_(gameId); } catch (e) { }
  }
  if (accountName) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var acc = ss.getSheetByName("帳號");
    if (acc) {
      var idx = accIdx != null ? accIdx : (function () { var f = findAccountRow_(acc, accountName); return f ? f.idx : null; })();
      if (idx != null) acc.getRange(idx + 1, COL.ACC.PC + 1).setValue("");
    }
  }
}

// 🏆 奪得聖杯／結束本局：不再封存，只做清理，讓玩家能立刻開新局。
function actionEndRun(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  var found = acc && acctName ? findAccountRow_(acc, acctName) : null;
  // 🔒 稽核抓到：原本純用pcId(格式"PC_"+時間戳，可預測)裸find，完全沒驗證acctName是否真的擁有這個pcId——等同任何人皆可猜/枚舉pcId替別人結束並清空整局存檔。
  if (!found || String(found.row[COL.ACC.PC] || "") !== String(pcId)) {
    return JSON.stringify({ success: false, message: "找不到你的角色。" });
  }
  var pcData = sheets.pc.getDataRange().getValues();
  var pIdx = pcData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
  if (pIdx === -1) return JSON.stringify({ success: false, message: "找不到你的角色。" });
  var gameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");

  var sv = findPlayerServant_(pcData, gameId);
  var realName = sv ? String(sv.row[COL.PC.NAME] || "從者") : "";

  purgeGameData_(sheets, gameId, acctName, pcData, found.idx);

  return JSON.stringify({ success: true, servantName: realName });
}

// 登入：找不到就建立。回傳是否有可繼續的存檔。
function actionAccountLogin(userData, pcId, sheets) {
  var name = String(userData.acctName || "").trim().slice(0, 20);
  if (!name) return JSON.stringify({ success: false, message: "先打個帳號名。" });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { ensureWorldReady_(ss); } catch (e) { Logger.log("ensureWorldReady_ 失敗(略過): " + e.message); }
  var acc = ss.getSheetByName("帳號");
  if (!acc) return JSON.stringify({ success: false, message: "帳號表不見了，重新整理。" });

  // 🌹 鑑賞存檔狀態：主選單要據此決定顯不顯示「後日談歸零重來」(沒東西可清就不長那顆鈕)。
  var _kpcOf = function (n) { try { return getAccountKanshouPcId_(n) || ""; } catch (e) { return ""; } };
  var found = findAccountRow_(acc, name);
  if (!found) {
    var _newRow = acc.getLastRow() + 1;
    acc.getRange(_newRow, COL.ACC.NAME + 1).setNumberFormat("@");
    acc.appendRow([name, "", new Date()]);
    return JSON.stringify({ success: true, name: name, hasGame: false, kpcId: "" });  // 全新帳號，必然沒有後日談
  }
  var charId = String(found.row[COL.ACC.PC] || "");
  var pcData = charId ? sheets.pc.getDataRange().getValues() : [];
  var pcRow = null;
  if (charId) {
    pcRow = pcData.find(function (r) { return String(r[COL.PC.ID]) === charId && !String(r[COL.PC.ID]).startsWith("DEAD_"); });
  }
  if (pcRow) {
    // 敗北殘局防呆：御主血歸 0，或已召喚過的從者已不在世＝這局已結束；即使玩家沒按返回就關網頁，下次登入也不會卡在死局。
    var gid = String(pcRow[COL.PC.GAME_ID] || "");
    var masterAlive = (parseInt(pcRow[COL.PC.HP]) || 0) > 0;
    var servantAlive = false, servantExisted = false, servantName = "";
    if (gid && gid.indexOf("g_") === 0) {
      for (var j = 1; j < pcData.length; j++) {
        if (String(pcData[j][COL.PC.GAME_ID] || "") !== gid) continue;
        if (String(pcData[j][COL.PC.FACTION]) !== "從者") continue;
        servantExisted = true;
        if (!servantName) servantName = String(pcData[j][COL.PC.NAME] || "").replace(/^DEAD_/, "");
        if (String(pcData[j][COL.PC.ID]).startsWith("DEAD_")) continue;
        if ((parseInt(pcData[j][COL.PC.HP]) || 0) > 0) { servantAlive = true; break; }
      }
      if (!masterAlive || (servantExisted && !servantAlive)) {
        try { purgeGameData_(sheets, gid, name, pcData, found.idx); } catch (e) { }
        return JSON.stringify({ success: true, name: name, hasGame: false, ended: true });
      }
    }
    return JSON.stringify({
      success: true, name: name, hasGame: true,
      pcId: charId, pcName: pcRow[COL.PC.NAME], pcSex: pcRow[COL.PC.SEX],
      needsSummon: gid.indexOf("g_") === 0 && !servantExisted,
      kpcId: _kpcOf(name)
    });
  }
  if (charId) {
    try {
      var deadRow = findPcRowByCharId_(pcData, charId);
      if (deadRow) {
        var deadGid = String(deadRow[COL.PC.GAME_ID] || "");
        if (deadGid && deadGid.indexOf("g_") === 0) {
          purgeGameData_(sheets, deadGid, name, pcData, found.idx);
        }
      }
    } catch (e) { }
    try { acc.getRange(found.idx + 1, COL.ACC.PC + 1).setValue(""); } catch (e) { }
  }
  return JSON.stringify({ success: true, name: name, hasGame: false, kpcId: _kpcOf(name) });
}

// 開新局前清除舊存檔（刪該 game_id 的整個眾生世界，關係已隨列一起刪），並解除帳號連結
function actionAccountNewGame(userData, pcId, sheets) {
  var name = String(userData.acctName || "").trim().slice(0, 20);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  if (!acc) return JSON.stringify({ success: false, message: "帳號表不見了。" });
  var found = findAccountRow_(acc, name);
  if (!found) return JSON.stringify({ success: true }); // 沒帳號＝沒舊檔

  var charId = String(found.row[COL.ACC.PC] || "");
  if (charId) {
    var pcData = sheets.pc.getDataRange().getValues();
    var prow = findPcRowByCharId_(pcData, charId);
    var gid = prow ? String(prow[COL.PC.GAME_ID] || "") : "";
    if (gid) {
      purgeGameData_(sheets, gid, null, pcData);
    } else {
      for (var r = pcData.length - 1; r >= 1; r--) {
        var rid = String(pcData[r][COL.PC.ID]);
        if (rid === charId || rid === "DEAD_" + charId) sheets.pc.deleteRow(r + 1);
      }
      try { purgeHistoryForPcIds_([charId]); } catch (e) { }
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
    acc.appendRow([name, pcCharId, new Date()]);
  }
}

