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
function purgeGameData_(sheets, gameId, accountName, preData) {
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
      var found = findAccountRow_(acc, accountName);
      if (found) acc.getRange(found.idx + 1, COL.ACC.PC + 1).setValue("");
    }
  }
}

// 🏆 奪得聖杯／結束本局：不再封存，只做清理，讓玩家能立刻開新局。
//   從者/盟友要在慾海重逢，改用「英靈殿直接召喚」(見 actionKanshouSummonHero)。
function actionEndRun(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  var pcData = sheets.pc.getDataRange().getValues();
  var pIdx = pcData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主。" });
  var gameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");

  var sv = findPlayerServant_(pcData, gameId);
  var realName = sv ? String(sv.row[COL.PC.NAME] || "從者") : "";

  purgeGameData_(sheets, gameId, acctName, pcData);

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
        try { purgeGameData_(sheets, gid, name, pcData); } catch (e) { }
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
      var deadRow = pcData.find(function (r) { var rid = String(r[COL.PC.ID]); return rid === charId || rid === "DEAD_" + charId; });
      if (deadRow) {
        var deadGid = String(deadRow[COL.PC.GAME_ID] || "");
        if (deadGid && deadGid.indexOf("g_") === 0) {
          purgeGameData_(sheets, deadGid, name, pcData);
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
    var prow = pcData.find(function (r) { var rid = String(r[COL.PC.ID]); return rid === charId || rid === "DEAD_" + charId; });
    var gid = prow ? String(prow[COL.PC.GAME_ID] || "") : "";
    // 刪舊單人戰場：同 game_id 的整個世界 ＋ 御主本人(按 charId 或 DEAD_charId，防 game_id 為空的孤兒殘留佔名)。
    for (var r = pcData.length - 1; r >= 1; r--) {
      var rgid = String(pcData[r][COL.PC.GAME_ID] || "");
      var rid = String(pcData[r][COL.PC.ID]);
      if ((gid && rgid === gid) || rid === charId || rid === "DEAD_" + charId) sheets.pc.deleteRow(r + 1);
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
  for (var r = 1; r < all.length; r++) {
    var row = all[r];
    var rid = String(row[COL.PC.ID]);
    var gid = String(row[COL.PC.GAME_ID] || "");
    var keep;
    if (rid.indexOf("DEAD_") === 0) keep = false;   // 死列一律清
    else if (!gid) keep = true;                      // 無 game_id：保守保留
    else keep = !!liveGids[gid];                     // 只留活躍戰局
    if (keep) kept.push(row);
  }
  var removed = (all.length - 1) - kept.length;
  if (removed > 0) {
    var dataRows = all.length - 1;
    if (kept.length) pc.getRange(2, 1, kept.length, header.length).setValues(kept);
    var tail = dataRows - kept.length;
    if (tail > 0) pc.deleteRows(2 + kept.length, tail);
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

