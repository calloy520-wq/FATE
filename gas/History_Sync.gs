// History_Sync.gs
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。

function trimRowsByOwner(sheet, pcId, keepCount, idColIndex0Based) {
  if (!sheet) return;
  const totalRows = sheet.getLastRow();
  if (totalRows <= 1) return;
  const idCol = sheet.getRange(2, idColIndex0Based + 1, totalRows - 1, 1).getValues();
  const myRowNumbers = [];
  for (let i = 0; i < idCol.length; i++) {
    if (String(idCol[i][0]) === String(pcId)) myRowNumbers.push(i + 2);
  }
  if (myRowNumbers.length > keepCount) {
    const toDelete = myRowNumbers.slice(0, myRowNumbers.length - keepCount);
    for (let i = toDelete.length - 1; i >= 0; i--) {
      sheet.deleteRows(toDelete[i], 1);
    }
  }
}
// 🔒 稽核抓到：這裡的「讀lastRow→append→trimRowsByOwner(讀全欄→算絕對列號→刪列)」是不折不扣的read-modify-write，但唯一的兩個呼叫端(actionNarrateOnly/actionPlay_)都刻意豁免全域鎖(見Router_Action.gs LOCK_EXEMPT_ACTIONS_——AI呼叫耗時數秒，鎖整個request會卡住其他玩家)。
function saveGameHistoryBatch(pcId, entries) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("歷史暫存");
  if (!sheet) return;
  const rowsToAppend = entries.map(entry => [new Date(), pcId, entry.speaker, entry.content]);
  let _lock = null;
  try { _lock = LockService.getScriptLock(); if (!_lock.tryLock(4000)) _lock = null; } catch (e) { _lock = null; }
  try {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rowsToAppend.length, 4).setValues(rowsToAppend);
    trimRowsByOwner(sheet, pcId, 40, 1);
  } finally { if (_lock) { try { _lock.releaseLock(); } catch (e) { } } }
}

// 🛡️ 儲存型XSS修復：玩家自己打的訊息(message)/鑑賞御主名(pcName)存進「歷史暫存」時未經HTML跳脫，這裡重新載入歷史時又用innerHTML直接塞回頁面——等於玩家自己輸入的文字被當成HTML執行。
function escapeHtml_(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// 讀「歷史暫存」最後 1000 列(避免整表掃描)→ 按 pcId 過濾 → 取最後 limit 筆原始 row。
function readRecentPlayerRows_(pcId, limit) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("歷史暫存");
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const startRow = Math.max(2, lastRow - 1000);
  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 1, numRows, 4).getValues();
  const playerHistory = data.filter(row => String(row[1]) === String(pcId));

  return playerHistory.slice(-limit);
}
function getGameHistory(pcId, pcName) {
  const lastTen = readRecentPlayerRows_(pcId, 10);
  const safePcName = escapeHtml_(pcName);

  let html = "";
  lastTen.forEach(row => {
    const role = row[2];
    const content = row[3];

    // 🛡️ 先HTML跳脫、再轉換換行(順序不能反過來，否則會把自己插入的<br>也跳脫掉)。
    const safeContent = content ? escapeHtml_(content.toString()).replace(/&lt;br\s*\/?&gt;/gi, "<br>").replace(/\n/g, "<br>") : "靜默無言。";

    if (role === "player") {
      html += `<div class="msg-player"><span class="msg-name">${safePcName}</span><span class="msg-text">${safeContent}</span></div>`;
    } else {
      html += `<div class="msg-ai"><b>【敘事】</b>${safeContent}</div>`;
    }
  });

  return html;
}
// ⚠ 刻意【不】逐列 deleteRow：歷史暫存是最肥的一張表，一列一次 API 呼叫會慢到玩家以為當掉。
//    改成「留下來的整批寫回、尾巴一次砍掉」——N 次呼叫變 2 次。solo 的 end_run 也走這支。
function purgeHistoryForPcIds_(pcIds) {
  if (!pcIds || !pcIds.length) return;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("歷史暫存");
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  var idSet = {};
  pcIds.forEach(function (id) { idSet[String(id)] = true; });
  var all = sheet.getDataRange().getValues();
  var kept = [];
  for (var i = 1; i < all.length; i++) {
    if (!idSet[String(all[i][1])]) kept.push(all[i]);
  }
  var tail = (all.length - 1) - kept.length;
  if (tail <= 0) return;
  if (kept.length) sheet.getRange(2, 1, kept.length, all[0].length).setValues(kept);
  sheet.deleteRows(2 + kept.length, tail);
}
function getGameHistoryBatchRaw(pcId, limit) {
  const recentRows = readRecentPlayerRows_(pcId, limit);

  return recentRows.map(row => ({
    speaker: row[2],
    content: row[3]
  }));
}
