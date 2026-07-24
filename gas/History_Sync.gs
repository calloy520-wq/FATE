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
// 🔒 稽核抓到：這裡的「讀lastRow→append→trimRowsByOwner(讀全欄→算絕對列號→刪列)」是不折不扣的
//   read-modify-write，但唯一的兩個呼叫端(actionNarrateOnly/actionPlay_)都刻意豁免全域鎖(見
//   Router_Action.gs LOCK_EXEMPT_ACTIONS_——AI呼叫耗時數秒，鎖整個request會卡住其他玩家)。
//   此表solo/鑑賞共用、所有玩家併發寫入，兩個請求交錯時可能：①同pcId併發append互相覆寫剛寫入的列，
//   ②trimRowsByOwner算出的絕對列號在deleteRows執行前，被另一個pcId併發的trim/deleteRows推移，
//   刪到已經不屬於自己的列(跨玩家)。這個函式本身在AI回應已經拿到之後才呼叫，只是單純Sheets讀寫、
//   耗時遠低於秒級——用短暫ScriptLock只包住這個函式本體(非整個action)：搶到鎖＝消除競態；搶不到
//   (極端併發下)＝退回今天原本的無鎖行為，不會比現狀更差、也不會讓其他玩家等一場數秒的AI呼叫。
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

// 🛡️ 儲存型XSS修復：玩家自己打的訊息(message)/鑑賞御主名(pcName)存進「歷史暫存」時未經
//   HTML跳脫，這裡重新載入歷史時又用innerHTML直接塞回頁面——等於玩家自己輸入的文字被當成
//   HTML執行。真正該修的是輸入端(sanitizeUserData_)，但輸出端(這裡)也要有跳脫，雙重防護。
function escapeHtml_(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
// 讀「歷史暫存」最後 1000 列(避免整表掃描)→ 按 pcId 過濾 → 取最後 limit 筆原始 row。
//   getGameHistory(轉HTML)／getGameHistoryBatchRaw(回傳原始物件)共用同一份讀表邏輯。
// ⚠ 稽核備註(已知規模限制·非本輪修復範圍)：這 1000 列窗口是「整張共用表」的最後1000列，不是
//   「這個pcId」的最後1000列——若同時段有夠多其他玩家(solo+鑑賞共用同一張表)瘋狂觸發narrate_only
//   /play，一個暫時不活躍但仍在進行中的玩家，其本應在40列扣打內的舊列可能被擠出這個窗口，
//   getGameHistory(讀歷史還原)／getGameHistoryBatchRaw(AI連戲上下文)會靜默回傳截斷/空結果。
//   purgeHistoryForPcIds_只在局終/刪檔時清表，不解決「進行中對局被別人擠出窗口」這個情境。
//   目前玩家規模下發生機率低，先記錄在案；真的要根治需要改用per-pcId索引或加大窗口，屬於較大改動。
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
  const recentRows = readRecentPlayerRows_(pcId, limit);

  return recentRows.map(row => ({
    speaker: row[2],
    content: row[3]
  }));
}
