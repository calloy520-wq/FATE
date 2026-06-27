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
      String(s[COL.PC.MARTIAL] || ""), back, pref, moe, memoir, wishEnd, new Date()
    ];
    var gd = gal.getDataRange().getValues();
    var existingIdx = -1;
    for (var i = 1; i < gd.length; i++) {
      if (String(gd[i][COL.GAL.ACC]).trim() === acctName && String(gd[i][COL.GAL.NAME]).trim() === realName) { existingIdx = i; break; }
    }
    if (existingIdx >= 0) gal.getRange(existingIdx + 1, 1, 1, row.length).setValues([row]);
    else gal.appendRow(row);
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

  var sys = "你扮演《命運停駐之夜》鑑賞模式中被御主再次呼出的從者「" + name + "」（" + String(rec[COL.GAL.CLS] || "") + "職階）。\n" +
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
