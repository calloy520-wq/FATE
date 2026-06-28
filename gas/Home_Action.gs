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

// ------------------------------------------
// 蓋家
// ------------------------------------------

// ------------------------------------------
// 搬家
// ------------------------------------------

// ------------------------------------------
// 招待朋友來家裡坐：對象限「已傾心」者，選中即把她的人挪到家中。
// 沿用店鋪「同地即客人」的邏輯，誰在家直接看 PC.LOC 是否等於家的全名，
// 家是遠端管理面板，邀人時玩家本人不必親自在家。
// ------------------------------------------

// ------------------------------------------
// 裝潢：整段覆蓋坤圖那筆家的 desc
// ------------------------------------------
