// ==========================================
// 🔴 Rumor.gs - 滾動江湖傳聞系統
// ==========================================

var RUMOR_TRIGGERS = {
  KILL_NPC:    { weight: 3, template: "聽聞江湖中有人在【{loc}】附近手刃了【{target}】，此人武功之強令人咋舌。" },
  BREAKTHROUGH:{ weight: 2, template: "坊間盛傳，有奇人在【{loc}】一帶閉關突破，引動天地異象，境界已臻【{realm}】。" },
  GIFT_BOND:   { weight: 2, template: "據說【{loc}】一帶，有俠客與【{target}】定下海誓山盟，江湖人稱一段佳話。" },
  FACTION_NEW: { weight: 3, template: "天下風雲變色！新勢力「{target}」悄然現世，據地【{loc}】，其意圖不明，令各方勢力警惕。" },
  QUEST_DONE:  { weight: 1, template: "聽風閣消息：有人在【{loc}】一帶完成了一樁懸賞，江湖中人對此議論紛紛。" },
  EMPOWER:     { weight: 3, template: "奇聞！有人以不知名秘法在【{loc}】為人渡劫傳功，受益者境界暴漲，其手段令修士側目。" }
};

function addRumor(sheets, type, loc, target, extraData) {
  if (!sheets || !sheets.rumor) return;
  const template = RUMOR_TRIGGERS[type];
  if (!template) return;
  
  extraData = extraData || {};
  let content = template.template
    .replace("{loc}", loc || "某處")
    .replace("{target}", target || "某人")
    .replace("{realm}", extraData.realm || "未知境界");
  
  const expireAt = new Date();
  expireAt.setDate(expireAt.getDate() + 7);
  
  try {
    sheets.rumor.appendRow([
      new Date(), type, content, loc || "", target || "",
      template.weight, expireAt, "active"
    ]);
  } catch(e) {
    Logger.log("addRumor 失敗: " + e.message);
  }
}

function getRumors(sheets, limit) {
  limit = limit || 10;
  if (!sheets || !sheets.rumor) return [];
  
  try {
    const now = new Date();
    const lastRow = sheets.rumor.getLastRow();
    if (lastRow <= 1) return []; // 只有標題列
    
    const data = sheets.rumor.getDataRange().getValues();
    return data.slice(1) // 跳過標題列
      .filter(function(r) {
        return r[7] === "active" && r[6] && new Date(r[6]) > now;
      })
      .sort(function(a, b) {
        return new Date(b[0]) - new Date(a[0]);
      })
      .slice(0, limit)
      .map(function(r) {
        return {
          time: r[0], type: r[1], content: r[2],
          loc: r[3], target: r[4], weight: r[5]
        };
      });
  } catch(e) {
    Logger.log("getRumors 失敗: " + e.message);
    return [];
  }
}

function cleanExpiredRumors(sheets) {
  if (!sheets || !sheets.rumor) return;
  try {
    const now = new Date();
    const lastRow = sheets.rumor.getLastRow();
    if (lastRow <= 1) return;
    
    const data = sheets.rumor.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][6] && new Date(data[i][6]) < now) {
        sheets.rumor.deleteRow(i + 1);
      }
    }
  } catch(e) {
    Logger.log("cleanExpiredRumors 失敗: " + e.message);
  }
}
