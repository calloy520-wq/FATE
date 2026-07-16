// History_Sync.gs

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
function saveGameHistoryBatch(pcId, entries) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("歷史暫存");
  if (!sheet) return;
  const rowsToAppend = entries.map(entry => [new Date(), pcId, entry.speaker, entry.content]);
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rowsToAppend.length, 4).setValues(rowsToAppend);
  trimRowsByOwner(sheet, pcId, 40, 1);
}

// 🛡️ 儲存型XSS修復：玩家自己打的訊息(message)/鑑賞御主名(pcName)存進「歷史暫存」時未經
//   HTML跳脫，這裡重新載入歷史時又用innerHTML直接塞回頁面——等於玩家自己輸入的文字被當成
//   HTML執行。真正該修的是輸入端(sanitizeUserData_)，但輸出端(這裡)也要有跳脫，雙重防護。
function escapeHtml_(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function getGameHistory(pcId, pcName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("歷史暫存");
  if (!sheet) return "";

  // 只讀最後 1000 列，避免整表掃描
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return "";

  const startRow = Math.max(2, lastRow - 1000);
  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 1, numRows, 4).getValues();
  const playerHistory = data.filter(row => String(row[1]) === String(pcId));

  const lastTen = playerHistory.slice(-10);
  const safePcName = escapeHtml_(pcName);

  let html = "";
  lastTen.forEach(row => {
    const role = row[2];
    const content = row[3];

    // 🛡️ 先HTML跳脫、再轉換換行(順序不能反過來，否則會把自己插入的<br>也跳脫掉)。
    //   歷史遺留：舊紀錄可能存了字面 <br>(Gemini 直接輸出標籤)，跳脫後變裸字——一併轉回換行。
    const safeContent = content ? escapeHtml_(content.toString()).replace(/&lt;br\s*\/?&gt;/gi, "<br>").replace(/\n/g, "<br>") : "靜默無言。";

    if (role === "player") {
      html += `<div class="msg-player"><span class="msg-name">${safePcName}</span><span class="msg-text">${safeContent}</span></div>`;
    } else {
      html += `<div class="msg-ai"><b>【敘事】</b>${safeContent}</div>`;
    }
  });

  return html;
}
// trimRowsByOwner 只擋單一 pcId 超量，整張表從不清；結束局在此清掉該局所有 pcId 的歷史列，
// 否則表無上限成長，久未登入帳號的紀錄也會被擠出 getGameHistory 的最後 1000 列讀取窗口而靜默遺失。
function purgeHistoryForPcIds_(pcIds) {
  if (!pcIds || !pcIds.length) return;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("歷史暫存");
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  var idSet = {};
  pcIds.forEach(function (id) { idSet[String(id)] = true; });
  var idCol = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (var i = idCol.length - 1; i >= 0; i--) {
    if (idSet[String(idCol[i][0])]) sheet.deleteRow(i + 2);
  }
}
function getGameHistoryBatchRaw(pcId, limit) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("歷史暫存");
  if (!sheet) return [];
  
  // 同上：只讀最後 1000 列避免整表掃描
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  const startRow = Math.max(2, lastRow - 1000);
  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 1, numRows, 4).getValues();
  
  const playerHistory = data.filter(row => String(row[1]) === String(pcId));
  
  const recentRows = playerHistory.slice(-limit);
  
  return recentRows.map(row => ({
    speaker: row[2],
    content: row[3]
  }));
}
