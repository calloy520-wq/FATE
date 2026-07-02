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

function getGameHistory(pcId, pcName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("歷史暫存");
  if (!sheet) return "";
  
  // 🟡 效能優化：限制讀取範圍
  // 如果資料量大，不建議讀取整張表，這裡讀取最後 1000 行應該足夠應付大部分對話需求
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return ""; 
  
  // 讀取最後 1000 行 (或不足 1000 行時讀取全部)
  const startRow = Math.max(2, lastRow - 1000);
  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 1, numRows, 4).getValues();
  // 篩選該玩家 ID 的紀錄
  const playerHistory = data.filter(row => String(row[1]) === String(pcId));
  
  // 取最後 10 筆
  const lastTen = playerHistory.slice(-10);
  
  let html = "";
  lastTen.forEach(row => {
    const role = row[2]; 
    const content = row[3];
    
    // 🛡️ 內容洗滌器
    const safeContent = content ? content.toString().replace(/\n/g, "<br>") : "靜默無言。";
    
    if (role === "player") {
      html += `<div class="msg-player"><span class="msg-name">${pcName}</span><span class="msg-text">${safeContent}</span></div>`;
    } else {
      html += `<div class="msg-ai"><b>【敘事】</b>${safeContent}</div>`;
    }
  });
  
  return html;
}
function getGameHistoryBatchRaw(pcId, limit) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("歷史暫存");
  if (!sheet) return [];
  
  // 🟡 效能優化：限制讀取範圍，邏輯同上
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  const startRow = Math.max(2, lastRow - 1000);
  const numRows = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 1, numRows, 4).getValues();
  
  const playerHistory = data.filter(row => String(row[1]) === String(pcId));
  
  // 取最後指定筆數
  const recentRows = playerHistory.slice(-limit);
  
  return recentRows.map(row => ({
    speaker: row[2],
    content: row[3]
  }));
}
