// ==========================================
// 🏡 我的家系統 Home_Action.gs (裝潢=坤圖desc版)
// ==========================================

const HOME_CREATE_COST = 1000;
const HOME_MOVE_COST = 500;

function findAuthIdx(authData, pcId) {
  return authData.findIndex(r => String(r[COL.AUTH.ID]).trim() === String(pcId).trim());
}

// 🟢 給 actionPlay 用：傳入位置，若那是某玩家的家就回傳裝潢字串，否則回 ""
function getHomeDecorForLoc(sheets, loc) {
  if (!sheets.map || !loc) return "";
  const mapRow = sheets.map.getDataRange().getValues()
    .find(m => String(m[COL.MAP.NAME]).trim() === String(loc).trim() && String(m[COL.MAP.TYPE]).trim() === "居所");
  return mapRow ? String(mapRow[COL.MAP.DESC] || "").trim() : "";
}

// ------------------------------------------
// 查我的家
// ------------------------------------------
function actionHomeGet(userData, pcId, sheets) {
  if (!sheets.auth) return JSON.stringify({ success: false, message: "權柄表不存在" });

  const authData = sheets.auth.getDataRange().getValues();
  const aIdx = findAuthIdx(authData, pcId);

  if (aIdx === -1 || !authData[aIdx][COL.AUTH.HOME_LOC]) {
    return JSON.stringify({ success: true, hasHome: false });
  }

  const homeLoc = String(authData[aIdx][COL.AUTH.HOME_LOC]).trim();

  let homeDesc = "一處屬於你的安身之所。";
  if (sheets.map) {
    const mapRow = sheets.map.getDataRange().getValues()
      .find(m => String(m[COL.MAP.NAME]).trim() === homeLoc);
    if (mapRow) homeDesc = mapRow[COL.MAP.DESC] || homeDesc;
  }

  let residents = [];
  const pcData = sheets.pc.getDataRange().getValues();
  const myName = (pcData.find(r => r[COL.PC.ID] == pcId) || [])[COL.PC.NAME];
  const relData = sheets.rel ? sheets.rel.getDataRange().getValues() : [];

  for (let i = 1; i < pcData.length; i++) {
    const r = pcData[i];
    if (r[COL.PC.ID] == pcId) continue;
    if (String(r[COL.PC.ID]).startsWith("DEAD_")) continue;
    if (String(r[COL.PC.LOC] || "").trim() !== homeLoc) continue;

    const rel = relData.find(x => x[COL.REL.PC] === myName && x[COL.REL.NPC] === r[COL.PC.NAME]);
    residents.push({
      id: r[COL.PC.ID],
      name: r[COL.PC.NAME],
      isParty: rel ? (rel[COL.REL.IS_PARTY] === "同行") : false,
      relTag: rel ? rel[COL.REL.TAG] : "萍水相逢"
    });
  }

  return JSON.stringify({
    success: true, hasHome: true,
    homeLoc: homeLoc, homeDesc: homeDesc, residents: residents
  });
}

// ------------------------------------------
// 蓋家
// ------------------------------------------
function actionHomeCreate(userData, pcId, sheets) {
  const homeName = String(userData.homeName || "").trim();
  if (!homeName) return JSON.stringify({ success: false, message: "家不可無名！" });
  if (homeName.includes("-")) return JSON.stringify({ success: false, message: "家名不可含「-」符號。" });

  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  if (sheets.auth) {
    const authData = sheets.auth.getDataRange().getValues();
    const aIdx = findAuthIdx(authData, pcId);
    if (aIdx !== -1 && authData[aIdx][COL.AUTH.HOME_LOC]) {
      return JSON.stringify({ success: false, message: "你已有一處家園，可選擇搬遷而非另建。" });
    }
  }

  const money = parseInt(pcData[pIdx][COL.PC.MONEY]) || 0;
  if (money < HOME_CREATE_COST) {
    return JSON.stringify({ success: false, message: `建造家園需 ${HOME_CREATE_COST} 兩白銀，你的盤纏不足。` });
  }

  const curLoc = String(pcData[pIdx][COL.PC.LOC] || "").split('-')[0].trim() || "青丘城";
  const homeFullName = `${curLoc}-${homeName}`;

  if (sheets.map) {
    const mapData = sheets.map.getDataRange().getValues();
    if (mapData.some(m => String(m[COL.MAP.NAME]).trim() === homeFullName)) {
      return JSON.stringify({ success: false, message: "此地已有同名建築，請另取家名。" });
    }
    let pCoord = "0,0";
    const parentMap = mapData.find(m => String(m[COL.MAP.NAME]).trim() === curLoc);
    if (parentMap && parentMap[COL.MAP.COORD]) {
      const parts = String(parentMap[COL.MAP.COORD]).split(',');
      const bx = parseInt(parts[0]) || 0, by = parseInt(parts[1]) || 0;
      pCoord = `${bx + Math.floor(Math.random() * 5) - 2},${by + Math.floor(Math.random() * 5) - 2}`;
    }
    sheets.map.appendRow(["九州", homeFullName, "居所", pCoord, `『${homeName}』，${pcData[pIdx][COL.PC.NAME]}的安身之所。`, curLoc]);
    CacheService.getScriptCache().remove("KYUSHU_MAP_DATA");
  }

  pcData[pIdx][COL.PC.MONEY] = money - HOME_CREATE_COST;
  pcData[pIdx][COL.PC.LOC] = homeFullName;
  sheets.pc.getRange(pIdx + 1, 1, 1, pcData[pIdx].length).setValues([pcData[pIdx]]);

  if (sheets.auth) {
    const authData = sheets.auth.getDataRange().getValues();
    const aIdx = findAuthIdx(authData, pcId);
    if (aIdx !== -1) {
      const row = authData[aIdx];
      while (row.length < 5) row.push("");
      row[COL.AUTH.HOME_LOC] = homeFullName;
      sheets.auth.getRange(aIdx + 1, 1, 1, 5).setValues([row]);
    } else {
      sheets.auth.appendRow([pcData[pIdx][COL.PC.NAME], pcId, "江湖散人", homeFullName, ""]);
    }
  }

  if (sheets.epic) {
    sheets.epic.appendRow([pcId, `【安身立命】在 ${curLoc} 建起了屬於自己的家園「${homeName}」。`, new Date()]);
  }

  return JSON.stringify({
    success: true,
    message: `🏡 你在「${curLoc}」建起了家園「${homeName}」！從此江湖路遠，亦有歸處。`,
    statusString: getFreshStatusString(pcId, pIdx, sheets),
    homeLoc: homeFullName
  });
}

// ------------------------------------------
// 搬家
// ------------------------------------------
function actionHomeMove(userData, pcId, sheets) {
  if (!sheets.auth) return JSON.stringify({ success: false, message: "權柄表不存在" });

  const authData = sheets.auth.getDataRange().getValues();
  const aIdx = findAuthIdx(authData, pcId);
  if (aIdx === -1 || !authData[aIdx][COL.AUTH.HOME_LOC]) {
    return JSON.stringify({ success: false, message: "你尚無家園可搬遷。" });
  }
  const oldHomeLoc = String(authData[aIdx][COL.AUTH.HOME_LOC]).trim();

  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });

  const money = parseInt(pcData[pIdx][COL.PC.MONEY]) || 0;
  if (money < HOME_MOVE_COST) {
    return JSON.stringify({ success: false, message: `遷址需 ${HOME_MOVE_COST} 兩白銀，你的盤纏不足。` });
  }

  const newParent = String(pcData[pIdx][COL.PC.LOC] || "").split('-')[0].trim() || "青丘城";
  const homeName = oldHomeLoc.split('-')[1] || oldHomeLoc;
  const newHomeLoc = `${newParent}-${homeName}`;

  if (newHomeLoc === oldHomeLoc) {
    return JSON.stringify({ success: false, message: "你已身在家中所屬的區域，無需遷址。" });
  }

  let oldDesc = `${homeName}`;
  if (sheets.map) {
    const mapData = sheets.map.getDataRange().getValues();
    if (mapData.some(m => String(m[COL.MAP.NAME]).trim() === newHomeLoc)) {
      return JSON.stringify({ success: false, message: `「${newParent}」已有同名建築，無法遷入。` });
    }
    const mIdx = mapData.findIndex(m => String(m[COL.MAP.NAME]).trim() === oldHomeLoc);
    if (mIdx !== -1) oldDesc = mapData[mIdx][COL.MAP.DESC] || oldDesc; // 保留裝潢

    let pCoord = "0,0";
    const parentMap = mapData.find(m => String(m[COL.MAP.NAME]).trim() === newParent);
    if (parentMap && parentMap[COL.MAP.COORD]) {
      const parts = String(parentMap[COL.MAP.COORD]).split(',');
      const bx = parseInt(parts[0]) || 0, by = parseInt(parts[1]) || 0;
      pCoord = `${bx + Math.floor(Math.random() * 5) - 2},${by + Math.floor(Math.random() * 5) - 2}`;
    }

    const newMapRow = ["九州", newHomeLoc, "居所", pCoord, oldDesc, newParent];
    if (mIdx !== -1) {
      sheets.map.getRange(mIdx + 1, 1, 1, 6).setValues([newMapRow]);
    } else {
      // 🔴 防呆：舊家地圖列意外缺失時，改為直接新增一列，避免新家變成沒有地圖紀錄的幽靈地址
      sheets.map.appendRow(newMapRow);
    }
    CacheService.getScriptCache().remove("KYUSHU_MAP_DATA");
  }

  let changed = false;
  for (let i = 0; i < pcData.length; i++) {
    if (String(pcData[i][COL.PC.LOC] || "").trim() === oldHomeLoc) {
      pcData[i][COL.PC.LOC] = newHomeLoc;
      changed = true;
    }
  }
  if (String(pcData[pIdx][COL.PC.LOC]).trim() !== newHomeLoc) pcData[pIdx][COL.PC.LOC] = newHomeLoc;
  pcData[pIdx][COL.PC.MONEY] = money - HOME_MOVE_COST;

  const pcColCount = Object.keys(COL.PC).length;
  pcData.forEach(row => { while (row.length < pcColCount) row.push(""); });
  sheets.pc.getRange(1, 1, pcData.length, pcColCount).setValues(pcData);
  SpreadsheetApp.flush();

  const arow = authData[aIdx];
  while (arow.length < 5) arow.push("");
  arow[COL.AUTH.HOME_LOC] = newHomeLoc;
  sheets.auth.getRange(aIdx + 1, 1, 1, 5).setValues([arow]);

  return JSON.stringify({
    success: true,
    message: `🏡 你花費 ${HOME_MOVE_COST} 兩，將家園遷至「${newParent}」。家中之人一併隨遷。`,
    statusString: getFreshStatusString(pcId, pIdx, sheets),
    homeLoc: newHomeLoc
  });
}

// ------------------------------------------
// 招待朋友來家裡坐：對象限「已傾心」者，選中即把她的人挪到家中。
// 沿用店鋪「同地即客人」的邏輯，誰在家直接看 PC.LOC 是否等於家的全名，
// 家是遠端管理面板，邀人時玩家本人不必親自在家。
// ------------------------------------------
function actionHomeInviteGuest(userData, pcId, sheets) {
  if (!sheets.auth || !sheets.rel) return JSON.stringify({ success: false, message: "天道異常：表不存在" });

  const npcName = String(userData.npcName || "").trim();
  if (!npcName) return JSON.stringify({ success: false, message: "請指定邀請對象。" });

  const authData = sheets.auth.getDataRange().getValues();
  const aIdx = findAuthIdx(authData, pcId);
  if (aIdx === -1 || !authData[aIdx][COL.AUTH.HOME_LOC]) {
    return JSON.stringify({ success: false, message: "你尚無家園，無從邀人來坐。" });
  }
  const homeLoc = String(authData[aIdx][COL.AUTH.HOME_LOC]).trim();

  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無此人" });
  const myName = pcData[pIdx][COL.PC.NAME];

  const relData = sheets.rel.getDataRange().getValues();
  const rIdx = relData.findIndex(r => r[COL.REL.PC] === myName && r[COL.REL.NPC] === npcName);
  const fav = rIdx !== -1 ? (parseInt(relData[rIdx][COL.REL.FAV]) || 0) : 0;
  const isSoulBound = rIdx !== -1 && String(relData[rIdx][COL.REL.TAG] || "").includes("(已傾心)");
  if (fav < 100 || !isSoulBound) {
    return JSON.stringify({ success: false, message: `「${npcName}」尚未對你傾心，無法邀來家中。` });
  }

  const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === npcName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (nIdx === -1) return JSON.stringify({ success: false, message: "查無此人。" });
  if (String(pcData[nIdx][COL.PC.LOC] || "").trim() === homeLoc) {
    return JSON.stringify({ success: false, message: `「${npcName}」已經在家裡了。` });
  }

  const isBusy = relData.find(r => r[COL.REL.NPC] === npcName && r[COL.REL.IS_PARTY] === "同行" && r[COL.REL.PC] !== myName);
  if (isBusy) return JSON.stringify({ success: false, message: `天道阻礙：「${npcName}」已與『${isBusy[COL.REL.PC]}』結伴，無法邀來！` });

  pcData[nIdx][COL.PC.LOC] = homeLoc;
  sheets.pc.getRange(nIdx + 1, COL.PC.LOC + 1).setValue(homeLoc);

  return JSON.stringify({ success: true, message: `你邀請「${npcName}」來家裡坐坐。` });
}

// ------------------------------------------
// 裝潢：整段覆蓋坤圖那筆家的 desc
// ------------------------------------------
function actionHomeDecorate(userData, pcId, sheets) {
  if (!sheets.auth) return JSON.stringify({ success: false, message: "權柄表不存在" });

  const authData = sheets.auth.getDataRange().getValues();
  const aIdx = findAuthIdx(authData, pcId);
  if (aIdx === -1 || !authData[aIdx][COL.AUTH.HOME_LOC]) {
    return JSON.stringify({ success: false, message: "你尚無家園可佈置。" });
  }
  const homeLoc = String(authData[aIdx][COL.AUTH.HOME_LOC]).trim();
  const newDesc = String(userData.desc || "").trim().slice(0, 200) || "一處屬於你的安身之所。";

  if (!sheets.map) return JSON.stringify({ success: false, message: "坤圖表不存在" });
  const mapData = sheets.map.getDataRange().getValues();
  const mIdx = mapData.findIndex(m => String(m[COL.MAP.NAME]).trim() === homeLoc);
  if (mIdx === -1) return JSON.stringify({ success: false, message: "找不到家園的輿圖紀錄。" });

  sheets.map.getRange(mIdx + 1, COL.MAP.DESC + 1).setValue(newDesc);
  CacheService.getScriptCache().remove("KYUSHU_MAP_DATA");

  return JSON.stringify({ success: true, message: "家園佈置已更新。", homeDesc: newDesc });
}
