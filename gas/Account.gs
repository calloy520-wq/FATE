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
    // 🔵 敗北殘局防呆：御主血歸 0、或「已召喚過從者、但該從者已不在世」＝這一局已經結束。
    //   即使玩家上次沒按「返回主畫面」就關掉網頁，下次登入也不會卡在死局——直接清理、解除連結、當作沒有存檔。
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
      // 🐛→✅ 2026-07 第二輪稽核抓到：締結御主契約(actionManualNpc)到召喚從者(actionSummonServant)
      //   中間隔著一個真實存在的「召喚從者頁」決策畫面(挑職階/瀏覽名冊/工房)，玩家可能在這個畫面
      //   停留一段時間才做決定。這段空窗期「從者根本還沒召喚」跟「已經召喚過、但從者已死」原本共用
      //   同一個 !servantAlive 判斷——尚未召喚時 servantAlive 恆 false，會被誤判成「這局已經結束」
      //   整局直接被清掉，玩家等於在還沒開始打仗前就被判定戰敗、角色憑空消失。改成只在「從者存在過
      //   但已不在世(servantExisted && !servantAlive)」才視為殘局；尚未召喚(!servantExisted)則
      //   視為合法的「還在締結中」存檔，回 needsSummon 讓前端接回召喚頁，而非把整局判死。
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
  // charId 指向的御主已被標記 DEAD_（或不存在）→ 殘局：先把整局世界清掉(從源頭防殘列累積)，再解除連結、當作沒有存檔。
  //   死亡時 ID 會被加上 "DEAD_" 前綴(帳號表仍存原 charId)，故含 DEAD_ 反查那一列拿 game_id，連同敵御主/敵從者殘列一併 purge。
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
    // 🐛→✅ 2026-07 第二輪稽核抓到：御主敗北時 ID 會被加上 "DEAD_" 前綴(帳號表仍存原 charId)，
    //   actionAccountLogin 查殘局時有考慮這個前綴(`rid === charId || rid === "DEAD_" + charId`)，
    //   這裡原本沒有——若 charId 那列已經是 DEAD_ 版本，這裡就查無此列、gid 判斷不到，導致下面的
    //   刪除迴圈找不到任何列可刪，那局的殘列(DEAD_ 御主本人＋同 game_id 的敵御主/敵從者)全部
    //   留在「眾生」表沒被清掉，違背這個函式自己的「開新局前清除舊存檔」設計目的。目前這個情境
    //   在正常前端流程下不會發生(newGameFlow 只在 accountLoginRes.hasGame===true 時呼叫，而
    //   actionAccountLogin 保證 hasGame:true 時 g_ 開頭的局一定御主/從者皆存活)，只有多分頁/
    //   快取的 accountLoginRes 過期等邊緣情境才會觸發，屬防禦性補強。
    var prow = pcData.find(function (r) { var rid = String(r[COL.PC.ID]); return rid === charId || rid === "DEAD_" + charId; });
    var gid = prow ? String(prow[COL.PC.GAME_ID] || "") : "";
    // 刪舊單人戰場：同 game_id 的整個世界 ＋ 御主本人(按 charId 或 DEAD_charId，防 game_id 為空的孤兒殘留佔名)
    //   中間沒有任何寫入，沿用剛讀的 pcData 即可，不必重讀一次整表(2026-07 修：原本重讀的 fresh 純屬多餘)。
    for (var r = pcData.length - 1; r >= 1; r--) {
      var rgid = String(pcData[r][COL.PC.GAME_ID] || "");
      var rid = String(pcData[r][COL.PC.ID]);
      if ((gid && rgid === gid) || rid === charId || rid === "DEAD_" + charId) sheets.pc.deleteRow(r + 1);
    }
  }
  acc.getRange(found.idx + 1, COL.ACC.PC + 1).setValue(""); // 解除連結
  return JSON.stringify({ success: true });
}

// 🧹 清殘列：清掉「孤兒戰局」殘留——已無任何帳號連結的 game_id 世界(敗北殘局/棄局/亡靈) ＋ 所有 DEAD_ 列。
//   每局的敵御主＋敵從者整批殘留是「眾生」表肥大、拖慢每次按鍵整表掃描的主因。
//   安全準則：① 不碰任一帳號「當前連結中」的活躍戰局；② 不碰 game_id 空白列(可能創角中/舊資料)；
//             ③ 鑑賞(KPC_)在另表「鑑賞眾生」不受影響。2026-07：關係已併入眾生列，隨列一起清、不再需要步驟④。
//   一次性整表 rewrite(setValues + 單次 deleteRows tail)，遠快於逐列 deleteRow。
// ⚠ 2026-07 修(嚴重)：上面③那句話原本只是「假設」——孤兒判定只讀「帳號」表的 COL.ACC.PC(solo 連結)，
// 從未讀 COL.ACC.KPC(慾海連結)。原本吃參數傳入的 sheets.pc，但 dispatcher 會依 pcId 前綴把它路由到
// 「鑑賞眾生」；若此 action 被以 KPC_ 呼叫(前端「🧹 DEV：清殘列」按鈕就放在慾海卡片裡緊鄰「進入鑑賞」，
// pc.id 若殘留上次的 KPC_ 就會踩到)，liveGids 永遠對不上任何慾海列的 game_id(k_開頭)，會把整張
// 「鑑賞眾生」表(所有帳號的慾海御主與同伴，含雙修技巧/親密次數等心血)判定為孤兒整批清空。
// 已在 Router_Action.gs 的 KANSHOU_BLOCKED_ACTIONS_ 擋掉這個 action 的 KPC_ 呼叫，但這裡再加一道
// 結構性防線：此函式的設計目的就是「清理 solo 戰局孤兒」，改成直接指名讀「眾生」表，完全不理會
// sheets.pc 被路由到哪，即使 dispatcher 那道擋牆未來被繞過或漏掉，這裡也不可能碰到「鑑賞眾生」。
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

// 🌹 把鑑賞(後日談)avatar 連結到帳號——跟 linkAccountToPc_ 同一套機制(外部表存連結，
//   非角色自己宣稱)，讓「這個帳號的鑑賞世界是哪個 KPC_」結構上只有伺服器碼能寫。
function linkAccountToKanshouPc_(accountName, kpcId) {
  if (!accountName || !kpcId) return;
  var name = String(accountName).trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  if (!acc) return;
  var found = findAccountRow_(acc, name);
  if (found) {
    acc.getRange(found.idx + 1, COL.ACC.KPC + 1).setValue(kpcId);
  } else {
    var row = Array(Object.keys(COL.ACC).length).fill("");
    row[COL.ACC.NAME] = name; row[COL.ACC.KPC] = kpcId; row[COL.ACC.CREATED] = new Date();
    acc.appendRow(row);
  }
}

// 🌹 查某帳號目前連結的鑑賞 avatar pcId（查無回 ""）。
function getAccountKanshouPcId_(accountName) {
  var name = String(accountName || "").trim();
  if (!name) return "";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  if (!acc) return "";
  var found = findAccountRow_(acc, name);
  return found ? String(found.row[COL.ACC.KPC] || "") : "";
}

// 🗑️ 2026-07：排行榜／戰史／勝場計數／最快奪杯天數 全數移除(單人專注·不做跨帳號回顧比拼)。
//   incrementWin_/recordHistory_/recordWinSpeed_/actionLeaderboard/actionGetVictoryHistory 已刪，
//   呼叫端(戰鬥/斬首/夜襲勝利路徑)同步拔除呼叫。
