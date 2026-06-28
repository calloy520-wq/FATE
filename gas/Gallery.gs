// ==========================================
// 🏆 Gallery.gs — 鑑賞模式（奪杯後封存從者，可日後呼出回味）
//   勝利 → 玩家點「奪得聖杯」→ AI 總結這幾日羈絆 → 存入「鑑賞」表 → 清理該局資料。
//   鑑賞模式：列出已封存的從者，可呼出她（後日談對話）。
// ==========================================

// 找玩家目前世界仍存活的從者列（回傳 row 與 index）
function findPlayerServant_(pcData, gameId) {
  for (var i = 1; i < pcData.length; i++) {
    if (String(pcData[i][COL.PC.FACTION]) !== "從者") continue;
    if (gameId && String(pcData[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(pcData[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    return { idx: i, row: pcData[i] };
  }
  return null;
}

// 清理某 game_id 的整局資料（眾生 + 該御主關係），並解除帳號連結
function purgeGameData_(sheets, gameId, masterName, accountName) {
  if (gameId) {
    var fresh = sheets.pc.getDataRange().getValues();
    for (var r = fresh.length - 1; r >= 1; r--) {
      if (String(fresh[r][COL.PC.GAME_ID] || "") === gameId) sheets.pc.deleteRow(r + 1);
    }
  }
  if (sheets.rel && masterName) {
    var rd = sheets.rel.getDataRange().getValues();
    for (var k = rd.length - 1; k >= 1; k--) {
      if (String(rd[k][COL.REL.PC]) === masterName) sheets.rel.deleteRow(k + 1);
    }
  }
  if (accountName) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var acc = ss.getSheetByName("帳號");
    if (acc) {
      var found = findAccountRow_(acc, accountName);
      if (found) acc.getRange(found.idx + 1, COL.ACC.PC + 1).setValue("");
    }
  }
}

// 🏆 奪得聖杯：封存從者（含 AI 後日談）＋ 清理該局
function actionClaimGrail(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  var pcData = sheets.pc.getDataRange().getValues();
  var pIdx = pcData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主。" });
  var masterName = String(pcData[pIdx][COL.PC.NAME] || "");
  var gameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");

  var sv = findPlayerServant_(pcData, gameId);
  if (!sv) return JSON.stringify({ success: false, message: "查無存活從者，無從封存。" });
  var s = sv.row;
  var realName = String(s[COL.PC.NAME] || "從者");
  var cls = String(s[COL.PC.RANK] || s[COL.PC.CLS] || "從者");

  // 羈絆值
  var bond = 0;
  if (sheets.rel) {
    var rel = sheets.rel.getDataRange().getValues().find(function (r) {
      return r[COL.REL.PC] === masterName && r[COL.REL.NPC] === realName;
    });
    if (rel) bond = parseInt(rel[COL.REL.FAV]) || 0;
  }
  // 御主願望（show-don't-tell：只供 AI 建構回憶氛圍）
  var wish = "";
  var wm = String(pcData[pIdx][COL.PC.MEMORY] || "").match(/【願望】([^|【\n]*)/);
  if (wm) wish = wm[1].trim();
  var pref = String(s[COL.PC.PREF] || "");
  var back = String(s[COL.PC.BACK] || "");
  var moe = String(s[COL.PC.INTENT] || "");

  // AI 總結這幾日的羈絆 → 鑑賞回憶（後日談）
  var memoir = "";
  try {
    var sys = "你為《命運停駐之夜》撰寫聖杯戰爭落幕後的『後日談回憶』，供鑑賞模式回味。\n" +
      "★以溫柔內斂的 Fate／TYPE-MOON 筆觸，第二人稱（你＝御主），寫一段 80～130 字的回憶：濃縮御主與這名從者並肩走過的數日、勝利當下的情緒、以及兩人之間的羈絆。\n" +
      "★【鐵律·演出而非說明】嚴禁直接寫出『願望』『萌點』『個性』等字面設定，只能以情景與細節暗示。\n" +
      "★只輸出回憶散文本體，禁任何系統字樣、JSON、選項、標籤名。";
    var prompt = "御主：" + masterName + "\n從者真名：" + realName + "（" + cls + "職階）\n" +
      "羈絆深度：" + bond + "\n個性參考：" + pref + "\n" +
      (wish ? "御主願望（僅供氛圍，嚴禁直述）：" + wish + "\n" : "") +
      "結局：御主斬盡所有敵對從者，奪得聖杯。";
    memoir = String(callGeminiAPI(prompt, sys, { temperature: 0.75, ignoreLaw: true }) || "").trim();
  } catch (e) { memoir = ""; }
  if (!memoir) memoir = "冬木的夜終於安靜下來。你與「" + realName + "」並肩走過那幾日的腥風血雨，如今聖杯就在眼前——而比起願望，你更想記住的，是她始終在你身側的身影。";

  // 願望結局摘要（簡短）
  var wishEnd = wish ? wish : "（願望深藏於心）";

  // 寫入鑑賞表（同帳號同真名則覆蓋最新一筆，避免重複堆積）
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gal = ss.getSheetByName("鑑賞");
  if (gal) {
    var row = [
      acctName, realName, cls, String(s[COL.PC.SEX] || ""),
      String(s[COL.PC.SIX] || "{}"), String(s[COL.PC.TAGS] || "{}"),
      String(s[COL.PC.MARTIAL] || ""), back, pref, moe, memoir, wishEnd, new Date(),
      masterName, String(pcData[pIdx][COL.PC.SEX] || "")
    ];
    var gd = gal.getDataRange().getValues();
    var existingIdx = -1;
    for (var i = 1; i < gd.length; i++) {
      if (String(gd[i][COL.GAL.ACC]).trim() === acctName && String(gd[i][COL.GAL.NAME]).trim() === realName) { existingIdx = i; break; }
    }
    if (existingIdx >= 0) gal.getRange(existingIdx + 1, 1, 1, row.length).setValues([row]);
    else gal.appendRow(row);

    // 🤝 同盟羈絆封存：羈絆養至 90↑（或已標【鑑賞緣】）的盟友（御主／從者）一併納入鑑賞名冊。
    //   原作依據：聖杯戰爭中結下深刻羈絆的同伴（遠坂凜／間桐櫻 等）戰後相伴。御主搭檔以 CLS="御主" 為辨識。
    try {
      var relAll = sheets.rel ? sheets.rel.getDataRange().getValues() : [];
      var galNow = gal.getDataRange().getValues();
      for (var ai = 1; ai < pcData.length; ai++) {
        if (String(pcData[ai][COL.PC.GAME_ID] || "") !== gameId) continue;
        var afac = String(pcData[ai][COL.PC.FACTION]);
        if (afac !== "敵御主" && afac !== "敵從者") continue;
        if (String(pcData[ai][COL.PC.ID]).startsWith("DEAD_")) continue;
        var aMem = String(pcData[ai][COL.PC.MEMORY] || "");
        var aName = String(pcData[ai][COL.PC.NAME] || "");
        var aBond = 0;
        var aRel = relAll.find(function (r) { return r[COL.REL.PC] === masterName && r[COL.REL.NPC] === aName; });
        if (aRel) aBond = parseInt(aRel[COL.REL.FAV]) || 0;
        if (!/【鑑賞緣】/.test(aMem) && aBond < 90) continue; // 未達羈絆門檻、不入名冊
        var aIsMaster = (afac === "敵御主");
        var aCls = aIsMaster ? "御主" : String(pcData[ai][COL.PC.RANK] || pcData[ai][COL.PC.CLS] || "從者");
        var aMemoir = aIsMaster
          ? ("聖杯戰爭的腥風血雨裡，「" + aName + "」曾與你並肩立於同一陣線。猜忌與算計之外，你們之間悄然長出了某種無需言明的牽絆——硝煙散盡後，那個身影仍留在你身旁。")
          : ("「" + aName + "」本是敵對陣營的從者，卻在那段暫時休兵的日子裡與你結下了超越敵我的羈絆。戰爭落幕，這份惺惺相惜並未隨之消散。");
        var aRow = [
          acctName, aName, aCls, String(pcData[ai][COL.PC.SEX] || ""),
          String(pcData[ai][COL.PC.SIX] || "{}"), String(pcData[ai][COL.PC.TAGS] || "{}"),
          String(pcData[ai][COL.PC.MARTIAL] || ""), String(pcData[ai][COL.PC.BACK] || ""),
          String(pcData[ai][COL.PC.PREF] || ""), String(pcData[ai][COL.PC.INTENT] || ""),
          aMemoir, "（並肩走過聖杯戰爭的盟友）", new Date(),
          masterName, String(pcData[pIdx][COL.PC.SEX] || "")
        ];
        var aExist = -1;
        for (var gj = 1; gj < galNow.length; gj++) {
          if (String(galNow[gj][COL.GAL.ACC]).trim() === acctName && String(galNow[gj][COL.GAL.NAME]).trim() === aName) { aExist = gj; break; }
        }
        if (aExist >= 0) gal.getRange(aExist + 1, 1, 1, aRow.length).setValues([aRow]);
        else { gal.appendRow(aRow); galNow.push(aRow); }
      }
    } catch (eAlly) { }
  }

  // 清理該局資料（封存後一局結束）
  purgeGameData_(sheets, gameId, masterName, acctName);

  return JSON.stringify({ success: true, servantName: realName, cls: cls, memoir: memoir });
}

// 鑑賞模式：列出帳號已封存的從者
function actionListGallery(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gal = ss.getSheetByName("鑑賞");
  var list = [];
  if (gal) {
    var gd = gal.getDataRange().getValues();
    for (var i = 1; i < gd.length; i++) {
      if (String(gd[i][COL.GAL.ACC]).trim() !== acctName) continue;
      var six = {}, tags = { skills: [], traits: [] };
      try { six = JSON.parse(gd[i][COL.GAL.SIX] || "{}"); } catch (e) { }
      try { tags = JSON.parse(gd[i][COL.GAL.TAGS] || "{}"); } catch (e) { }
      var t = gd[i][COL.GAL.TIME], ts = "";
      try { ts = (t instanceof Date) ? Utilities.formatDate(t, Session.getScriptTimeZone(), "yyyy-MM-dd") : String(t || ""); } catch (e) { ts = String(t || ""); }
      list.push({
        name: String(gd[i][COL.GAL.NAME] || ""), cls: String(gd[i][COL.GAL.CLS] || ""),
        sex: String(gd[i][COL.GAL.SEX] || ""), np: String(gd[i][COL.GAL.NP] || ""),
        back: String(gd[i][COL.GAL.BACK] || ""), pref: String(gd[i][COL.GAL.PREF] || ""),
        moe: String(gd[i][COL.GAL.MOE] || ""), memoir: String(gd[i][COL.GAL.MEMOIR] || ""),
        wish: String(gd[i][COL.GAL.WISH] || ""),
        six: six, skills: tags.skills || [], traits: tags.traits || [], time: ts
      });
    }
    list.reverse();
  }
  return JSON.stringify({ success: true, servants: list });
}

// 🏆 進入鑑賞（後日談·約會）：在 k_ 世界重建御主＋從者，無敵人、無戰鬥，可自由移動閒聊
function actionEnterGallery(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  var name = String(userData.servantName || "").trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gal = ss.getSheetByName("鑑賞");
  if (!gal) return JSON.stringify({ success: false, message: "鑑賞表不存在。" });
  var gd = gal.getDataRange().getValues();
  var rec = null;
  for (var i = 1; i < gd.length; i++) {
    if (String(gd[i][COL.GAL.ACC]).trim() === acctName && String(gd[i][COL.GAL.NAME]).trim() === name) { rec = gd[i]; break; }
  }
  if (!rec) return JSON.stringify({ success: false, message: "鑑賞名冊查無此從者。" });

  // 清掉此帳號殘留的舊鑑賞世界（k_ 開頭且關聯本帳號御主）
  //   ⚠ 兩段式：先掃出所有要清的 k_ game_id，再一次刪除——避免「邊讀邊刪縮短陣列」造成 pcData[r] undefined 崩潰。
  var pcData = sheets.pc.getDataRange().getValues();
  var masterName = String(rec[COL.GAL.MASTER] || "御主") || "御主";
  var killGids = {};
  for (var r = 1; r < pcData.length; r++) {
    var gidOld = String(pcData[r][COL.PC.GAME_ID] || "");
    if (gidOld.indexOf("k_") === 0 && String(pcData[r][COL.PC.NAME]) === masterName) killGids[gidOld] = true;
  }
  if (Object.keys(killGids).length) {
    for (var d = pcData.length - 1; d >= 1; d--) {
      if (killGids[String(pcData[d][COL.PC.GAME_ID] || "")]) sheets.pc.deleteRow(d + 1);
    }
  }

  var gameId = "k_" + Date.now();
  var loc = "冬木·深山町";
  var pcColCount = Object.keys(COL.PC).length;

  // 御主 avatar（凡人，僅供視角／移動，無戰鬥意義）
  var mId = "KPC_" + Date.now();
  var mRow = Array(pcColCount).fill("");
  mRow[COL.PC.ID] = mId;
  mRow[COL.PC.NAME] = masterName;
  mRow[COL.PC.SEX] = String(rec[COL.GAL.MSEX] || "異") || "異";
  mRow[COL.PC.REALM] = "凡人";
  mRow[COL.PC.HP] = 100; mRow[COL.PC.MAX_HP] = 100; mRow[COL.PC.MP] = 100; mRow[COL.PC.MAX_MP] = 100;
  mRow[COL.PC.STR] = 10; mRow[COL.PC.CON] = 10; mRow[COL.PC.AGI] = 10; mRow[COL.PC.INT] = 10; mRow[COL.PC.LUK] = 10;
  mRow[COL.PC.STATUS] = JSON.stringify({ "衣服": "便裝", "姿勢": "站立", "負面": "無", "顏面": "神情輕鬆" });
  mRow[COL.PC.LOC] = loc;
  mRow[COL.PC.MONEY] = 5000;
  mRow[COL.PC.FACTION] = "御主";
  mRow[COL.PC.MEMORY] = "【鑑賞後日談】聖杯戰爭已結束，與從者的和平約會時光。";
  mRow[COL.PC.GAME_ID] = gameId;
  sheets.pc.appendRow(mRow);

  // 從者／盟友御主：由鑑賞紀錄還原（CLS="御主" ＝ 戰時結下深羈絆的盟友御主搭檔，凡人之軀）
  var partnerIsMaster = (String(rec[COL.GAL.CLS] || "") === "御主");
  var sId = "KSV_" + Date.now();
  var sRow = Array(pcColCount).fill("");
  sRow[COL.PC.ID] = sId;
  sRow[COL.PC.NAME] = name;
  sRow[COL.PC.SEX] = String(rec[COL.GAL.SEX] || "異") || "異";
  sRow[COL.PC.REALM] = "凡人";
  if (partnerIsMaster) {
    sRow[COL.PC.HP] = 100; sRow[COL.PC.MAX_HP] = 100; sRow[COL.PC.MP] = 120; sRow[COL.PC.MAX_MP] = 120;
    sRow[COL.PC.STR] = 12; sRow[COL.PC.CON] = 12; sRow[COL.PC.AGI] = 12; sRow[COL.PC.INT] = 30; sRow[COL.PC.LUK] = 18;
  } else {
    sRow[COL.PC.HP] = 480; sRow[COL.PC.MAX_HP] = 480; sRow[COL.PC.MP] = 200; sRow[COL.PC.MAX_MP] = 200;
    sRow[COL.PC.STR] = 45; sRow[COL.PC.CON] = 45; sRow[COL.PC.AGI] = 45; sRow[COL.PC.INT] = 40; sRow[COL.PC.LUK] = 35;
  }
  sRow[COL.PC.STATUS] = JSON.stringify({ "衣服": "便裝", "姿勢": "站立", "負面": "無", "顏面": "神情柔和" });
  sRow[COL.PC.LOC] = loc;
  sRow[COL.PC.FACTION] = "從者";
  sRow[COL.PC.RANK] = String(rec[COL.GAL.CLS] || "從者");
  sRow[COL.PC.CLS] = String(rec[COL.GAL.CLS] || "從者");
  sRow[COL.PC.MARTIAL] = String(rec[COL.GAL.NP] || "");
  sRow[COL.PC.BACK] = String(rec[COL.GAL.BACK] || "");
  sRow[COL.PC.PREF] = String(rec[COL.GAL.PREF] || "");
  sRow[COL.PC.INTENT] = String(rec[COL.GAL.MOE] || "");
  sRow[COL.PC.SIX] = String(rec[COL.GAL.SIX] || "{}");
  sRow[COL.PC.TAGS] = String(rec[COL.GAL.TAGS] || "{}");
  sRow[COL.PC.MEMORY] = "【鑑賞後日談】聖杯戰爭已結束，安然陪伴在御主身邊。";
  sRow[COL.PC.GAME_ID] = gameId;
  sheets.pc.appendRow(sRow);

  // 羈絆（高好感起步，畢竟是並肩奪杯的搭檔）
  if (sheets.rel) {
    try { sheets.rel.appendRow([masterName, name, 90, "從者", "同行", "聖杯戰爭並肩奪杯的羈絆", ""]); } catch (e) { }
  }

  return JSON.stringify({
    success: true, pcId: mId, pcName: masterName, pcSex: mRow[COL.PC.SEX],
    servantName: name, loc: loc,
    message: `聖杯戰爭的硝煙早已散去。冬木的午後，你與「${name}」並肩站在深山町的坡道上——這一次，沒有敵人，只有兩個人的時光。`
  });
}

// 鑑賞模式：呼出某從者「閒話後日談」（純對話，無戰鬥/血量），回傳 AI 旁白
function actionGalleryTalk(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  var name = String(userData.servantName || "").trim();
  var sayTo = String(userData.message || "").trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gal = ss.getSheetByName("鑑賞");
  if (!gal) return JSON.stringify({ success: false, message: "鑑賞表不存在。" });
  var gd = gal.getDataRange().getValues();
  var rec = null;
  for (var i = 1; i < gd.length; i++) {
    if (String(gd[i][COL.GAL.ACC]).trim() === acctName && String(gd[i][COL.GAL.NAME]).trim() === name) { rec = gd[i]; break; }
  }
  if (!rec) return JSON.stringify({ success: false, message: "鑑賞名冊查無此從者。" });

  var galCls = String(rec[COL.GAL.CLS] || "");
  var roleDesc = (galCls === "御主")
    ? "曾在聖杯戰爭中與御主並肩結盟、結下超越敵我之羈絆的盟友御主「" + name + "」（凡人之軀，非從者）"
    : "被御主再次呼出的從者「" + name + "」（" + galCls + "職階）";
  var sys = "你扮演《命運停駐之夜》鑑賞模式中" + roleDesc + "。\n" +
    "聖杯戰爭已結束、你已奪杯，此為和平的後日談時光，【沒有戰鬥、沒有血量、沒有敵人】。\n" +
    "個性參考：" + String(rec[COL.GAL.PREF] || "") + "\n萌點：" + String(rec[COL.GAL.MOE] || "") + "\n" +
    "★以第一人稱、貼近該英靈官方性格與這名從者的口吻，溫柔自然地與御主互動。演出而非複述設定。\n" +
    "★只輸出對話與情景，禁任何系統字樣、stat_changes、選項、JSON。";
  var prompt = sayTo ? ("御主對你說：「" + sayTo + "」") : "御主靜靜望著再次顯現的你。請主動開口。";
  var out = "";
  try { out = String(callGeminiAPI(prompt, sys, { temperature: 0.85, ignoreLaw: true }) || "").trim(); } catch (e) { out = ""; }
  if (!out) out = "「……又見面了，御主。」" + name + "的身影在你眼前緩緩凝實，眉眼間是只屬於戰後的安寧。";
  return JSON.stringify({ success: true, reply: out });
}
