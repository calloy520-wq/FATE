// ==========================================
// 🔵 Account.gs — FATE 帳號層（存檔身分）
//   帳號名(無密碼)登入 → 底下掛一個御主＋game_id。
//   繼續 / 新的一局(清舊檔)。
// ==========================================

function findAccountRow_(accSheet, name) {
  var data = accSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.ACC.NAME]).trim() === name) return { idx: i, row: data[i] };
  }
  return null;
}

// 🔒 單一真實來源：solo(PC_)／鑑賞(KPC_) 共用的「這個 pcId 真的屬於這個帳號嗎」驗證。
//   比照 actionEndRun 原本各自手寫的反查「帳號」表寫法抽出，讓 handleGameAction 能在
//   dispatch 前統一擋下「猜中/枚舉他人 pcId 即可代操作」這整類漏洞，不必每個 handler 各自補。
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

// 依 charId 找「眾生」列，含已標記 DEAD_ 的殘局列：帳號表存的是原始 charId，御主死亡時
//   ID 會被加上 "DEAD_" 前綴但帳號連結不會跟著改，故兩者都要查。actionAccountLogin／
//   actionAccountNewGame 皆靠這條反查殘局的 game_id 以便整局清除。
function findPcRowByCharId_(pcData, charId) {
  return pcData.find(function (r) { var rid = String(r[COL.PC.ID]); return rid === charId || rid === "DEAD_" + charId; });
}

// 找玩家目前世界仍存活的從者列（回傳 row 與 index）。
// 🧹 跟下面兩個函式同屬 solo game-lifecycle(結束一局/清檔)邏輯，鑑賞不會呼叫。
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
//   preData 可選：呼叫端若已有整表快照可傳入省一次讀取，不傳則自己讀。
//   accIdx 可選：呼叫端若已查過帳號表拿到列索引(findAccountRow_的結果)可傳入省一次帳號表整表重讀，
//   不傳則自己用 accountName 查一次(相容舊呼叫)。
function purgeGameData_(sheets, gameId, accountName, preData, accIdx) {
  if (gameId) {
    var fresh = preData || sheets.pc.getDataRange().getValues();
    // 順手收集要刪的每一列 pcId，一併清掉「歷史暫存」裡屬於這些 pcId 的對話列，避免結束對局的
    //   歷史列無上限累積。
    var purgedPcIds = [];
    for (var r = fresh.length - 1; r >= 1; r--) {
      if (String(fresh[r][COL.PC.GAME_ID] || "") === gameId) {
        purgedPcIds.push(String(fresh[r][COL.PC.ID]).replace(/^DEAD_/, ""));
        sheets.pc.deleteRow(r + 1);
      }
    }
    try { purgeHistoryForPcIds_(purgedPcIds); } catch (e) { }
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
//   從者/盟友要在慾海重逢，改用「英靈殿直接召喚」(見 actionKanshouSummonHero)。
function actionEndRun(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  var found = acc && acctName ? findAccountRow_(acc, acctName) : null;
  // 🔒 稽核抓到：原本純用pcId(格式"PC_"+時間戳，可預測)裸find，完全沒驗證acctName是否真的擁有
  //   這個pcId——等同任何人皆可猜/枚舉pcId替別人結束並清空整局存檔。改比對帳號表COL.ACC.PC實際
  //   連結的charId，不符直接拒絕。
  if (!found || String(found.row[COL.ACC.PC] || "") !== String(pcId)) {
    return JSON.stringify({ success: false, message: "查無御主。" });
  }
  var pcData = sheets.pc.getDataRange().getValues();
  var pIdx = pcData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主。" });
  var gameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");

  var sv = findPlayerServant_(pcData, gameId);
  var realName = sv ? String(sv.row[COL.PC.NAME] || "從者") : "";

  // 🐛→✅ 稽核抓到：found.idx早就查過了，這裡再傳acctName字串會讓purgeGameData_內部又整表重讀
  //   一次「帳號」表——直接傳found.idx省掉這次重讀。
  purgeGameData_(sheets, gameId, acctName, pcData, found.idx);

  return JSON.stringify({ success: true, servantName: realName });
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
    // 🐛→✅ 稽核抓到：帳號名稱欄位從未鎖成純文字格式——玩家若取純數字帳號(如"0123")，Sheets在
    //   「自動」格式下寫入時會把看似數字的字串自動轉型(去前導零/長數字轉科學記號)，下次登入時
    //   findAccountRow_的字串比對永遠對不上，等於每次登入都被誤判成「找不到」而another建一列，
    //   玩家存檔被鎖在第一列、永遠連不回去。寫入前先鎖該格為純文字，避免自動轉型。
    var _newRow = acc.getLastRow() + 1;
    acc.getRange(_newRow, COL.ACC.NAME + 1).setNumberFormat("@");
    acc.appendRow([name, "", new Date()]);
    return JSON.stringify({ success: true, name: name, hasGame: false });
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
      // 尚未召喚從者時 servantAlive 恆 false，不能與「已召喚但已死」共用同一判斷，否則會在
      // 玩家還停留在召喚從者頁時就誤判整局已結束；只有 servantExisted && !servantAlive 才算殘局。
      if (!masterAlive || (servantExisted && !servantAlive)) {
        try { purgeGameData_(sheets, gid, name, pcData, found.idx); } catch (e) { }
        return JSON.stringify({ success: true, name: name, hasGame: false, ended: true });
      }
    }
    return JSON.stringify({
      success: true, name: name, hasGame: true,
      pcId: charId, pcName: pcRow[COL.PC.NAME], pcSex: pcRow[COL.PC.SEX],
      needsSummon: gid.indexOf("g_") === 0 && !servantExisted
    });
  }
  // charId 指向的御主已被標記 DEAD_（或不存在）→ 殘局：先清掉整局世界再解除連結。死亡時 ID 會加 "DEAD_" 前綴，
  // 帳號表仍存原 charId，故需含 DEAD_ 反查該列拿 game_id 一併 purge。
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
  return JSON.stringify({ success: true, name: name, hasGame: false });
}

// 開新局前清除舊存檔（刪該 game_id 的整個眾生世界，關係已隨列一起刪），並解除帳號連結
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
    // charId 那列可能已是 DEAD_ 版本（敗北時 ID 加 "DEAD_" 前綴，帳號表仍存原 charId），須兩者都查，
    // 否則 gid 查無、下面刪除迴圈找不到列可刪，殘列留在「眾生」表，違背本函式清舊存檔的目的。
    var prow = findPcRowByCharId_(pcData, charId);
    var gid = prow ? String(prow[COL.PC.GAME_ID] || "") : "";
    // 🐛→✅ 稽核抓到：原本自行重寫一份刪除迴圈，沒像 purgeGameData_ 一樣同步清「歷史暫存」表——
    //   開新局是玩家最常見的棄局路徑，一直沒清會讓歷史表持續累積孤兒列。gid存在時直接共用
    //   purgeGameData_(含歷史清理)；gid為空(孤兒charId，無對應game_id世界)才維持原本單獨刪列
    //   + 補一次歷史清理，兩種情況都不再遺漏。
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

// 🧹 清殘列：清掉無帳號連結的 game_id 世界(敗北殘局/棄局/亡靈)＋DEAD_列，避免眾生表養肥拖慢整表掃描。
//   安全準則：不碰帳號當前連結的活躍戰局／game_id空白列；鑑賞(KPC_)在另表「鑑賞眾生」不受影響。
//   一次性整表 rewrite(setValues + 單次 deleteRows tail)，遠快於逐列 deleteRow。
// ⚠ 孤兒判定只讀「帳號」表的 COL.ACC.PC(solo 連結)、不讀 COL.ACC.KPC(慾海連結)——若此 action 被以
// KPC_ 呼叫，dispatcher 會把 sheets.pc 路由到「鑑賞眾生」，liveGids 對不上 k_ 開頭的 game_id 而誤清整張表。
// KANSHOU_BLOCKED_ACTIONS_ 已擋下 KPC_ 呼叫，這裡再加一道結構性防線：直接指名讀「眾生」表。
function actionPurgeOrphans(userData, pcId, sheets) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pc = ss.getSheetByName("眾生");
  if (!pc) return JSON.stringify({ success: false, message: "眾生表不存在。" });
  var all = pc.getDataRange().getValues();
  if (all.length < 2) return JSON.stringify({ success: true, removed: 0, kept: 0, message: "眾生表無資料，無殘列可清。" });
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
  // 3) 逐列保留判定
  var kept = [];
  var removedIds = [];
  for (var r = 1; r < all.length; r++) {
    var row = all[r];
    var rid = String(row[COL.PC.ID]);
    var gid = String(row[COL.PC.GAME_ID] || "");
    var keep;
    if (rid.indexOf("DEAD_") === 0) keep = false;   // 死列一律清
    else if (!gid) keep = true;                      // 無 game_id：保守保留
    else keep = !!liveGids[gid];                     // 只留活躍戰局
    if (keep) kept.push(row); else removedIds.push(rid.replace(/^DEAD_/, ""));
  }
  var removed = (all.length - 1) - kept.length;
  if (removed > 0) {
    var dataRows = all.length - 1;
    if (kept.length) pc.getRange(2, 1, kept.length, header.length).setValues(kept);
    var tail = dataRows - kept.length;
    if (tail > 0) pc.deleteRows(2 + kept.length, tail);
    // 🐛→✅ 稽核抓到：這裡原本沒同步清「歷史暫存」——違反History_Sync.gs自己的設計前提(結束局
    //   要清孤兒pcId的歷史列，否則表無上限成長)，比照purgeGameData_補上。
    try { purgeHistoryForPcIds_(removedIds); } catch (e) { }
  }

  return JSON.stringify({
    success: true, removed: removed, kept: kept.length,
    message: "🧹 清殘列完成：眾生移除 " + removed + " 列（孤兒戰局／亡靈殘留），保留 " + kept.length + " 列。每次按鍵的整表掃描會更快。"
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
    acc.appendRow([name, pcCharId, new Date()]);
  }
}

