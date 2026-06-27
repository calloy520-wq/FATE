// ==========================================
// 九州江湖 - 天道排程系統
// Scheduler.gs
// ==========================================

function dailyNpcMove() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pcSheet = ss.getSheetByName("眾生");
  const mapSheet = ss.getSheetByName("坤圖");
  const relSheet = ss.getSheetByName("關係");
  
  if (!pcSheet || !mapSheet || !relSheet) return;

  const pcData = pcSheet.getDataRange().getValues();
  const mapData = mapSheet.getDataRange().getValues();
  const relData = relSheet.getDataRange().getValues();

  const validLocs = mapData.slice(1)
    .filter(r => !String(r[COL.MAP.NAME]).includes('-'))
    .map(r => String(r[COL.MAP.NAME]).trim())
    .filter(n => n !== "");

  if (validLocs.length === 0) return;

  const partyNPCs = new Set(
    relData.filter(r => r[COL.REL.IS_PARTY] === "同行")
           .map(r => r[COL.REL.NPC])
  );

  let changed = false;
  pcData.forEach((row, idx) => {
    if (idx === 0) return;
    const id = String(row[COL.PC.ID]);
    if (id.startsWith("PC_") || id.startsWith("DEAD_")) return;
    if (partyNPCs.has(row[COL.PC.NAME])) return;

    // 🔴 喚醒重傷昏迷者：血回滿、狀態清乾淨，自然甦醒，並移動到隨機地點
    // 正常的NPC不在此處理範圍內，留在原地，不亂跑
    let statusObj = {};
    try { statusObj = JSON.parse(row[COL.PC.STATUS] || "{}"); } catch (e) {}
    const isKnockedOut = String(statusObj["負面"] || "").includes("重傷昏迷")
      || (parseInt(row[COL.PC.HP]) || 0) <= 1;
    if (!isKnockedOut) return;

    const maxStats = calculateMaxStats(row[COL.PC.REALM], row[COL.PC.CON], row[COL.PC.INT]);
    pcData[idx][COL.PC.HP] = maxStats.hp;
    pcData[idx][COL.PC.MP] = maxStats.mp;
    pcData[idx][COL.PC.MAX_HP] = maxStats.hp;
    pcData[idx][COL.PC.MAX_MP] = maxStats.mp;
    pcData[idx][COL.PC.STATUS] = JSON.stringify({
      "衣服": "重新整理過的衣衫", "姿勢": "站立", "負面": "無", "顏面": "傷後初癒"
    });

    const newLoc = validLocs[Math.floor(Math.random() * validLocs.length)];
    pcData[idx][COL.PC.LOC] = newLoc;
    changed = true;
  });

  if (changed) {
    const pcColCount = Object.keys(COL.PC).length;
    pcData.forEach(row => { while (row.length < pcColCount) row.push(""); });
    pcSheet.getRange(1, 1, pcData.length, pcColCount).setValues(pcData);
    SpreadsheetApp.flush();
    Logger.log("【天道排程】每日NPC移動完成");
  }
}
function generateNpcMessage(npcRow, playerRow, relRow) {
  const npcName = npcRow[COL.PC.NAME];
  const npcPref = npcRow[COL.PC.PREF] || "";
  const npcIntent = npcRow[COL.PC.INTENT] || "";
  const npcBack = npcRow[COL.PC.BACK] || "";
  const playerName = playerRow[COL.PC.NAME];
  const fav = parseInt(relRow[COL.REL.FAV]) || 0;
  const tag = relRow[COL.REL.TAG] || "萍水相逢";
  const isParty = relRow[COL.REL.IS_PARTY] === "同行";
  const isSoulBound = String(tag).includes("已傾心");
  const majorEvent = relRow[COL.REL.MAJOR_EVENT] || "無";

  // 🔴 動態時間感知
  const hour = new Date().getHours();
  let timeDesc = "";
  if (hour >= 5 && hour < 12) timeDesc = "清晨";
  else if (hour >= 12 && hour < 17) timeDesc = "午後";
  else if (hour >= 17 && hour < 20) timeDesc = "黃昏";
  else if (hour >= 20 && hour < 23) timeDesc = "入夜";
  else timeDesc = "深夜";

 let situation = "";
  if (isParty) {
    situation = `${timeDesc}，你們正結伴同行，她就在你身邊。這是她隨口說的一句話——可能是${timeDesc}的碎念、看到什麼東西忽然說、或什麼都沒發生就是想說一句。完全日常，不需要劇情感，就像真正的同伴。語氣必須符合她的【個性】。`;
  } else if (isSoulBound) {
    situation = `${timeDesc}，你們並不同行，她在遠處傳音給『${playerName}』。她傾心於他，但思念這件事會被她的個性過濾——溫柔的人直接說想你，冷傲的人說出來的是別的話但意思是想你，毒舌的人罵一句但罵的內容藏著在意。必須符合她的【個性】，禁止所有人都變成同一種思念方式。`;
  } else {
    situation = `${timeDesc}，玩家『${playerName}』寄了封傳音給她。她依照與玩家目前的關係「${tag}」（好感 ${fav}）與自身個性回一句話。好感低就客套、疏離甚至冷淡，好感越高才越親近。語氣必須符合她的【個性】，並貼合這個好感距離。`;
  }

  // 🔴 修改點：將「禁止 JSON」改為「強制輸出指定格式的 JSON」
  const sysOverride = `你是九州天道演化核心。請根據角色個性，生成一句NPC主動傳音給玩家的訊息內容。
★【鐵律】：
- 必須完全符合該角色的語氣、語癖、個性
- 禁止溫柔過頭或肉麻，符合好感度與個性裁決
- 禁止提及遊戲系統、禁止OOC
- 強制台灣繁體中文
- 【強制輸出格式】：請務必回傳 JSON 格式，包含一個 "message" 欄位，字數限制 50~70 字。範例：{"message": "傳音內容..."}`;

  const prompt = `【NPC】${npcName}
【個性】${npcPref}
【身世】${npcBack}
【軟肋】${npcIntent}
【與玩家關係】${tag}（好感：${fav}）
【未竟約定】${majorEvent}
【情境】${situation}
【玩家名號】${playerName}

請生成傳音：`;

  // 加上 ignoreLaw: true 可以避免排程發信時被主線天機異象干擾日常感
  const result = callGeminiAPI(prompt, sysOverride, {
    temperature: 0.9,
    max_tokens: 150,
    retries: 2,
    ignoreLaw: true 
  });

  try {
    const parsed = JSON.parse(result);
    // 完美接住 AI 回傳的 message 欄位，或是意外觸發防護網時的 narration
    const finalMsg = parsed.message || parsed.narration || parsed.content || "";
    return finalMsg.replace(/["{}]/g, "").trim();
  } catch (e) {
    Logger.log(`解析 JSON 失敗: ${e.message}`);
    return "";
  }
}

// ==========================================
// 🔴 半自動主線彙整：不自動生成主線，只彙整全體玩家現況寫進「天道彙整」分頁，
// 由站長自行判讀後，再手動把主線結論寫進「規矩」表。
// 建議在 Apps Script 編輯器的「觸發條件」介面手動加一個每日時間驅動的觸發器指向此函式。
// ==========================================
function generateWorldSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pcSheet = ss.getSheetByName("眾生");
  const questSheet = ss.getSheetByName("天命");
  const epicSheet = ss.getSheetByName("史紀");
  const trendSheet = ss.getSheetByName("大勢");
  if (!pcSheet) return;

  const pcData = pcSheet.getDataRange().getValues();
  const players = pcData.slice(1).filter(r => String(r[COL.PC.ID]).startsWith("PC_"));

  // 1. 境界分布
  const realmCount = {};
  REALMS.forEach(r => realmCount[r] = 0);
  players.forEach(r => {
    const realm = r[COL.PC.REALM] || "凡人";
    realmCount[realm] = (realmCount[realm] || 0) + 1;
  });
  const realmLines = REALMS.filter(r => realmCount[r] > 0).map(r => `${r}：${realmCount[r]}人`);

  // 2. 陣營消長（直接讀現成的「大勢」表）
  let trendLines = [];
  if (trendSheet) {
    const tData = trendSheet.getDataRange().getValues();
    trendLines = tData.slice(1).filter(r => r[0]).map(r => `${r[0]}：${r[1] || "中立"}(${r[2] || 50}) — ${r[4] || "無近期動態"}`);
  }

  // 3. 近期大事（全體玩家最近30筆史紀）
  let epicLines = [];
  if (epicSheet) {
    const eData = epicSheet.getDataRange().getValues();
    epicLines = eData.slice(1).slice(-30).reverse().map(r => `[${r[0]}] ${r[1]}`);
  }

  // 4. 天命任務完成統計
  let questStatusCount = { "進行中": 0, "已結案": 0, "逾期失敗": 0 };
  if (questSheet) {
    const qData = questSheet.getDataRange().getValues();
    qData.slice(1).forEach(r => {
      const status = r[COL.QUEST.STATUS];
      questStatusCount[status] = (questStatusCount[status] || 0) + 1;
    });
  }
  const questLines = Object.keys(questStatusCount).map(s => `${s}：${questStatusCount[s]}件`);

  // 5. 寫入「天道彙整」分頁（每次重新整理，只留最新一份）
  let outSheet = ss.getSheetByName("天道彙整");
  if (!outSheet) outSheet = ss.insertSheet("天道彙整");
  outSheet.clear();

  const rows = [
    [`【天道彙整】更新時間：${new Date().toLocaleString()}`],
    [""],
    ["▍境界分布"], ...realmLines.map(l => [l]),
    [""],
    ["▍陣營消長"], ...(trendLines.length ? trendLines.map(l => [l]) : [["（尚無陣營資料）"]]),
    [""],
    ["▍近期江湖大事（最新30筆）"], ...(epicLines.length ? epicLines.map(l => [l]) : [["（尚無紀錄）"]]),
    [""],
    ["▍天命任務統計"], ...questLines.map(l => [l]),
    [""],
    ["（此分頁僅供站長判讀現況，不會自動寫回遊戲；主線結論請手動填入「規矩」表）"]
  ];
  outSheet.getRange(1, 1, rows.length, 1).setValues(rows);
  outSheet.setColumnWidth(1, 600);
}
