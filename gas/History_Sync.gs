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
// 🔴 因果log專用：依tag分級保留，避免承諾/秘密/變故被閒聊擠出歷史
const IMPORTANT_LOG_TAGS = new Set(["承諾", "秘密", "變故"]);

function trimLogRowsByOwner(sheet, pcId, keepCount, importantCap) {
  if (!sheet) return;
  const totalRows = sheet.getLastRow();
  if (totalRows <= 1) return;
  const data = sheet.getRange(2, 1, totalRows - 1, 5).getValues();
  const myRows = [];
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][1]) === String(pcId)) myRows.push({ rowNum: i + 2, tag: String(data[i][4] || "") });
  }
  if (myRows.length <= keepCount) return;

  const casual = myRows.filter(r => !IMPORTANT_LOG_TAGS.has(r.tag));
  const important = myRows.filter(r => IMPORTANT_LOG_TAGS.has(r.tag));

  let overBy = myRows.length - keepCount;
  let toDelete = casual.slice(0, Math.min(overBy, casual.length));
  overBy -= toDelete.length;
  if (overBy > 0 && important.length > importantCap) {
    toDelete = toDelete.concat(important.slice(0, Math.min(overBy, important.length - importantCap)));
  }

  toDelete.sort((a, b) => b.rowNum - a.rowNum).forEach(r => sheet.deleteRows(r.rowNum, 1));
}

// 🔴 取歷史時優先保留承諾/秘密/變故，剩餘額度才依recency填閒聊，避免重要事被擠出視窗
// 🔴 只讀因果表最後 maxRows 筆(從表尾倒讀)，避免歷史成長後每回合全表讀取拖慢。
// pickRelevantLogs 永遠只取最近數筆，故近窗口在語意上等價，但成本固定不隨總歷史量膨脹。
// ⚠️ 僅用於「只需近期因果」的場景；需要完整生涯統計的地方(如成就面板)請勿改用此函式。
function readRecentLogRows(logSheet, maxRows) {
  if (!logSheet) return [];
  const lastRow = logSheet.getLastRow();
  if (lastRow < 2) return [];
  const want = Math.min(maxRows || 2000, lastRow - 1); // 扣除表頭
  const numCols = logSheet.getLastColumn();
  return logSheet.getRange(lastRow - want + 1, 1, want, numCols).getValues();
}

function pickRelevantLogs(rows, limit) {
  const important = rows.filter(r => IMPORTANT_LOG_TAGS.has(String(r[4] || "")));
  const casual = rows.filter(r => !IMPORTANT_LOG_TAGS.has(String(r[4] || "")));
  const importantSlice = important.slice(-limit);
  const casualSlice = casual.slice(-Math.max(0, limit - importantSlice.length));
  return importantSlice.concat(casualSlice).sort((a, b) => new Date(a[0]) - new Date(b[0]));
}

// 🔴 因果寫入專用：地點/性質直接嵌入內容字串，避免後續只取r[2]時遺失地點與標籤資訊
// （此格式純粹給AI後續讀取理解用，玩家永遠不會看到這欄原始內容）
function formatCausalityEntry(loc, tag, peopleStr, eventStr) {
  return `[地:${loc || "未知"}][性:${tag || "閒聊"}] ${peopleStr}：${eventStr}`;
}

// 🔴 慾海模式因果固定樣板：不讓AI自由描述肉體細節寫進因果表，改由GAS依tag挑選隱晦樣板字句，
// 隨機輕微變化避免每筆一模一樣，但內容永遠不含具體姿勢/器官等細節
const NSFW_CAUSALITY_TEMPLATES = {
  "閒聊": ["共度了一段不可言說的春宵", "有了一段曖昧難言的獨處時光", "在無人察覺之處，留下一段隱密的纏綿記憶", "兩人之間的情意，在私密時刻悄然加深"],
  "承諾": ["在情意正濃時，許下了一個不輕的承諾"],
  "秘密": ["在最赤裸的時刻，洩漏了一個藏在心底的秘密"],
  "變故": ["這段私密時光裡，發生了意料之外的變故"]
};
function pickNsfwCausalityEvent(tag) {
  const pool = NSFW_CAUSALITY_TEMPLATES[tag] || NSFW_CAUSALITY_TEMPLATES["閒聊"];
  return pool[Math.floor(Math.random() * pool.length)];
}

// 🔴 因果讀取專用共用函式：統一 filter + pickRelevantLogs + join 邏輯，
// 避免consume_item/use_item_self/贈禮/連擊等多處各自重複一份、未來改動容易漏改。
function getRecentCausalityStr(sheets, pName, npcName, limit) {
  if (!sheets.log) return "（尚無相關因果記錄）";
  const allLogs = readRecentLogRows(sheets.log, 2000);
  const filtered = allLogs.filter(r =>
    String(r[2]).includes(pName) || (npcName && String(r[2]).includes(npcName))
  );
  const picked = pickRelevantLogs(filtered, limit || 5);
  return picked.map(r => r[2]).join("\n") || "（尚無相關因果記錄）";
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
    const safeContent = content ? content.toString().replace(/\n/g, "<br>") : "天道無言。";
    
    if (role === "player") {
      html += `<div class="msg-player"><span class="msg-name">${pcName}</span><span class="msg-text">${safeContent}</span></div>`;
    } else {
      html += `<div class="msg-ai"><b>【天道演化】</b>${safeContent}</div>`;
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
