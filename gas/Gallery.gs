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

// 🧪【DEV·測試用·待移除】一鍵替目前登入帳號塞 2 名測試從者進鑑賞，方便還沒奪杯時測慾海。
//   已有任何鑑賞資料(含真實奪杯)就不重塞。確認慾海正常後，連同 ActionRouter "dev_seed_gallery" 與前端按鈕一起刪掉。
function actionDevSeedGallery(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  if (!acctName) return JSON.stringify({ success: false, message: "未登入帳號。" });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gal = ss.getSheetByName("鑑賞"), hero = ss.getSheetByName("英靈殿");
  if (!gal || !hero) return JSON.stringify({ success: false, message: "缺鑑賞/英靈殿表。" });
  var gd = gal.getDataRange().getValues();
  for (var i = 1; i < gd.length; i++) {
    if (String(gd[i][COL.GAL.ACC]).trim() === acctName) return JSON.stringify({ success: false, message: "此帳號已有鑑賞資料，毋需測試塞入。" });
  }
  var heroes = hero.getDataRange().getValues();
  var samples = [];
  for (var h = 1; h < heroes.length && samples.length < 2; h++) {
    if (String(heroes[h][COL.HERO.NAME] || "").trim()) samples.push(heroes[h]);
  }
  if (!samples.length) return JSON.stringify({ success: false, message: "英靈殿無種子資料。" });
  var added = 0;
  samples.forEach(function (hr) {
    var cls = String(hr[COL.HERO.CLS] || "從者"), nm = String(hr[COL.HERO.NAME] || "從者");
    var persona = {}; try { persona = JSON.parse(hr[COL.HERO.PERSONA] || "{}"); } catch (e) { }
    var tags = JSON.stringify({ skills: safeJson_(hr[COL.HERO.CLASS_SKILLS], []).concat(safeJson_(hr[COL.HERO.SKILLS], [])), traits: safeJson_(hr[COL.HERO.TRAITS], []) });
    var pref = String(persona.words || "沉著表象、堅定內裡、溫柔、孤高").replace(/・/g, "、");
    gal.appendRow([
      acctName, nm, cls, String(hr[COL.HERO.SEX] || "女"),
      String(hr[COL.HERO.SIX] || "{}"), tags,
      String(hr[COL.HERO.NP] || "寶具"), cls + " 職階英靈",
      pref, "（測試·萌點留白）",
      "【測試資料】冬木的夜終於安靜下來。你與「" + nm + "」並肩走過那幾日的腥風血雨，這段並肩的記憶被封存於此，供你回味。",
      "（測試·願望深藏於心）", new Date(),
      "測試御主", "男"
    ]);
    added++;
  });
  return JSON.stringify({ success: true, added: added, message: "已塞入 " + added + " 名測試從者，進入鑑賞即可測試。" });
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

// 🌹 鑑賞專屬眾生分頁：慾海角色(御主 avatar＋同伴從者)全部住這、與主「眾生」隔離，
//   後日談頻繁新增/移除角色不污染戰爭主表。schema 與「眾生」同(COL.PC 位置索引一致)。
//   ⚠ dispatcher 會在 pcId 以 "KPC_" 開頭時自動把 sheets.pc 指到這張表。
function getKanshouPcSheet_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("鑑賞眾生");
  if (!sh) {
    sh = ss.insertSheet("鑑賞眾生");
    var main = ss.getSheetByName("眾生");
    if (main && main.getLastColumn() > 0) {
      sh.getRange(1, 1, 1, main.getLastColumn()).setValues(main.getRange(1, 1, 1, main.getLastColumn()).getValues());
    } else {
      var hdr = Array(Object.keys(COL.PC).length).fill(""); hdr[0] = "ID";
      sh.appendRow(hdr);
    }
  }
  return sh;
}

// 由鑑賞紀錄組一筆後日談從者列(enter / 邀請同伴 共用)
function kanshouServantRow_(rec, gameId, loc) {
  var pcColCount = Object.keys(COL.PC).length;
  var name = String(rec[COL.GAL.NAME] || "從者");
  var partnerIsMaster = (String(rec[COL.GAL.CLS] || "") === "御主");
  var sRow = Array(pcColCount).fill("");
  sRow[COL.PC.ID] = "KSV_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
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
  return sRow;
}

// 鑑賞名冊查某帳號某真名的紀錄列
function galleryRec_(ss, acctName, name) {
  var gal = ss.getSheetByName("鑑賞"); if (!gal) return null;
  var gd = gal.getDataRange().getValues();
  for (var i = 1; i < gd.length; i++) {
    if (String(gd[i][COL.GAL.ACC]).trim() === acctName && String(gd[i][COL.GAL.NAME]).trim() === name) return gd[i];
  }
  return null;
}

// 🏆 進入鑑賞（後日談·約會）：在「鑑賞眾生」分頁重建御主＋從者，無敵人、無戰鬥，可自由移動閒聊
function actionEnterGallery(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  var name = String(userData.servantName || "").trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rec = galleryRec_(ss, acctName, name);
  if (!rec) return JSON.stringify({ success: false, message: "鑑賞名冊查無此從者。" });

  var kpc = getKanshouPcSheet_(ss);           // 🌹 慾海專屬分頁
  var pcData = kpc.getDataRange().getValues();
  var masterName = String(rec[COL.GAL.MASTER] || "御主") || "御主";

  // 🔁 持久化·不重製：若「本帳號御主 × 這名從者」已有 k_ 後日談世界 → 直接接續(不刪、不重建)，
  //   讓肉體/親密/羈絆狀態延續累積，不再每次歸零。第一次與此從者後日談時才往下新建。
  var hasM = {}, hasS = {}, mIdOf = {}, mLocOf = {}, mSexOf = {};
  for (var r = 1; r < pcData.length; r++) {
    var g = String(pcData[r][COL.PC.GAME_ID] || "");
    if (g.indexOf("k_") !== 0) continue;
    if (String(pcData[r][COL.PC.ID]).startsWith("DEAD_")) continue;
    var nm = String(pcData[r][COL.PC.NAME]); var fac = String(pcData[r][COL.PC.FACTION]);
    if (nm === masterName && fac === "御主") { hasM[g] = true; mIdOf[g] = String(pcData[r][COL.PC.ID]); mLocOf[g] = String(pcData[r][COL.PC.LOC] || "冬木·深山町"); mSexOf[g] = String(pcData[r][COL.PC.SEX] || "異"); }
    if (nm === name && fac === "從者") hasS[g] = true;
  }
  for (var gg in hasM) {
    if (hasS[gg]) {
      var rloc = mLocOf[gg] || "冬木·深山町";
      return JSON.stringify({
        success: true, pcId: mIdOf[gg], pcName: masterName, pcSex: mSexOf[gg],
        servantName: name, loc: rloc, resumed: true,
        message: `又回到「${name}」身邊了——${String(rloc).replace(/^冬木[·・]?/, "")}的空氣一如既往。你們之間的時光，在上次的餘溫裡靜靜延續。`
      });
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
  kpc.appendRow(mRow);

  // 首位同伴從者
  kpc.appendRow(kanshouServantRow_(rec, gameId, loc));

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

// 🌹 進入慾海·後日談（新版單一持久主畫面）：每個帳號只有【一個】常駐後日談世界。
//   點「進入鑑賞」→ 直接回到這個世界（御主 avatar），不再先挑從者、不再每次重講開場。
//   從者由 👥 後日談同伴面板自行邀請。歷史紀錄跟單機一樣靠 pcId 從「歷史暫存」撈。
//   ⚠ 御主 avatar 以 MEMORY 內【帳號】<acct> 標記綁定帳號，id 持久不變(KPC_)，故 getGameHistory 能接續。
function actionEnterKanshou(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  if (!acctName) return JSON.stringify({ success: false, message: "未登入帳號。" });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kpc = getKanshouPcSheet_(ss);            // 🌹 慾海專屬分頁
  var data = kpc.getDataRange().getValues();
  var acctTag = "【帳號】" + acctName;

  // 1️⃣ 找這個帳號既有的常駐後日談御主 → 直接接續(不重製)
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][COL.PC.FACTION]) !== "御主") continue;
    if (String(data[r][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (String(data[r][COL.PC.MEMORY] || "").indexOf(acctTag) === -1) continue;
    var loc = String(data[r][COL.PC.LOC] || "冬木·深山町");
    return JSON.stringify({
      success: true, resumed: true,
      pcId: String(data[r][COL.PC.ID]), pcName: String(data[r][COL.PC.NAME] || acctName),
      pcSex: String(data[r][COL.PC.SEX] || "異"), loc: loc
    });
  }

  // 2️⃣ 沒有常駐御主 → 要新建。御主名字＋性別由玩家「首次進場時自己定」(一帳號可能有不同
  //   名字/性別的奪杯，不該由系統掛帳號或亂猜)。前端沒帶齊 → 回 needSetup 請前端先問一次。
  //   建好後持久存於這列，之後可用 kanshou_set_name／kanshou_set_sex 隨時改。
  var mSex = String(userData.pcSex || "").trim();
  var mName = String(userData.pcName || "").trim();
  if ((mSex !== "男" && mSex !== "女") || !mName) {
    return JSON.stringify({ success: true, needSetup: true, defaultName: acctName });
  }
  var gameId = "k_" + Date.now();
  var loc2 = "冬木·深山町";
  var pcColCount = Object.keys(COL.PC).length;
  var mId = "KPC_" + Date.now();
  var mRow = Array(pcColCount).fill("");
  mRow[COL.PC.ID] = mId;
  mRow[COL.PC.NAME] = mName;
  mRow[COL.PC.SEX] = mSex;
  mRow[COL.PC.REALM] = "凡人";
  mRow[COL.PC.HP] = 100; mRow[COL.PC.MAX_HP] = 100; mRow[COL.PC.MP] = 100; mRow[COL.PC.MAX_MP] = 100;
  mRow[COL.PC.STR] = 10; mRow[COL.PC.CON] = 10; mRow[COL.PC.AGI] = 10; mRow[COL.PC.INT] = 10; mRow[COL.PC.LUK] = 10;
  mRow[COL.PC.STATUS] = JSON.stringify({ "衣服": "便裝", "姿勢": "站立", "負面": "無", "顏面": "神情輕鬆" });
  mRow[COL.PC.LOC] = loc2;
  mRow[COL.PC.MONEY] = 5000;
  mRow[COL.PC.FACTION] = "御主";
  mRow[COL.PC.MEMORY] = acctTag + "｜【鑑賞後日談】聖杯戰爭已結束，這是與封存從者的和平約會時光。";
  mRow[COL.PC.GAME_ID] = gameId;
  kpc.appendRow(mRow);

  return JSON.stringify({
    success: true, resumed: false,
    pcId: mId, pcName: mName, pcSex: mSex, loc: loc2
  });
}

// 👥 列出後日談現有同伴 ＋ 可邀請名單（上限 3 人）。pcId＝慾海御主 avatar(KPC_)。
function actionKanshouCompanions(userData, pcId, sheets) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kpc = getKanshouPcSheet_(ss);
  var acctName = String(userData.acctName || "").trim();
  var data = kpc.getDataRange().getValues();
  var me = null;
  for (var m = 1; m < data.length; m++) { if (String(data[m][COL.PC.ID]) === String(pcId)) { me = data[m]; break; } }
  if (!me) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var gid = String(me[COL.PC.GAME_ID] || "");
  var current = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") === gid && String(data[i][COL.PC.FACTION]) === "從者" && !String(data[i][COL.PC.ID]).startsWith("DEAD_")) current.push(String(data[i][COL.PC.NAME]));
  }
  var gal = ss.getSheetByName("鑑賞"); var gd = gal ? gal.getDataRange().getValues() : [];
  var avail = [];
  for (var j = 1; j < gd.length; j++) {
    if (String(gd[j][COL.GAL.ACC]).trim() !== acctName) continue;
    var n = String(gd[j][COL.GAL.NAME]).trim();
    if (current.indexOf(n) === -1 && avail.indexOf(n) === -1) avail.push(n);
  }
  return JSON.stringify({ success: true, current: current, available: avail, max: 3 });
}

// 👥➕ 邀請一名封存從者進入當前後日談（上限 3）
function actionKanshouAdd(userData, pcId, sheets) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kpc = getKanshouPcSheet_(ss);
  var acctName = String(userData.acctName || "").trim();
  var addName = String(userData.servantName || "").trim();
  var data = kpc.getDataRange().getValues();
  var me = null;
  for (var m = 1; m < data.length; m++) { if (String(data[m][COL.PC.ID]) === String(pcId)) { me = data[m]; break; } }
  if (!me) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var gid = String(me[COL.PC.GAME_ID] || ""); var loc = String(me[COL.PC.LOC] || "冬木·深山町"); var masterName = String(me[COL.PC.NAME] || "御主");
  var cnt = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") === gid && String(data[i][COL.PC.FACTION]) === "從者" && !String(data[i][COL.PC.ID]).startsWith("DEAD_")) {
      cnt++;
      if (String(data[i][COL.PC.NAME]) === addName) return JSON.stringify({ success: false, message: "「" + addName + "」已在場。" });
    }
  }
  if (cnt >= 3) return JSON.stringify({ success: false, message: "後日談最多 3 名同伴，請先請走一位再邀。" });
  var rec = galleryRec_(ss, acctName, addName);
  if (!rec) return JSON.stringify({ success: false, message: "鑑賞名冊查無「" + addName + "」。" });
  kpc.appendRow(kanshouServantRow_(rec, gid, loc));
  if (sheets.rel) {
    try {
      var rd = sheets.rel.getDataRange().getValues();
      var ex = false;
      for (var k = 1; k < rd.length; k++) { if (String(rd[k][COL.REL.PC]) === masterName && String(rd[k][COL.REL.NPC]) === addName) { ex = true; break; } }
      if (!ex) sheets.rel.appendRow([masterName, addName, 90, "從者", "同行", "聖杯戰爭並肩奪杯的羈絆", ""]);
    } catch (e) { }
  }
  return JSON.stringify({ success: true, added: addName, message: "「" + addName + "」來到了你們身邊。" });
}

// 👥➖ 請走一名同伴（從當前後日談移除；資料仍封存在鑑賞名冊，隨時可再邀）
function actionKanshouRemove(userData, pcId, sheets) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kpc = getKanshouPcSheet_(ss);
  var rmName = String(userData.servantName || "").trim();
  var data = kpc.getDataRange().getValues();
  var me = null;
  for (var m = 1; m < data.length; m++) { if (String(data[m][COL.PC.ID]) === String(pcId)) { me = data[m]; break; } }
  if (!me) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var gid = String(me[COL.PC.GAME_ID] || "");
  for (var d = data.length - 1; d >= 1; d--) {
    if (String(data[d][COL.PC.GAME_ID] || "") === gid && String(data[d][COL.PC.FACTION]) === "從者" && String(data[d][COL.PC.NAME]) === rmName) kpc.deleteRow(d + 1);
  }
  return JSON.stringify({ success: true, removed: rmName, message: "「" + rmName + "」暫別了，隨時可再邀回。" });
}

// ⚧ 切換後日談御主 avatar 的性別（隨時可改；只動 SEX 欄，不影響從者/歷史）。pcId＝KPC_。
function actionKanshouSetSex(userData, pcId, sheets) {
  var newSex = String(userData.pcSex || "").trim();
  if (newSex !== "男" && newSex !== "女") return JSON.stringify({ success: false, message: "性別僅限 男／女。" });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kpc = getKanshouPcSheet_(ss);
  var data = kpc.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.ID]) === String(pcId)) {
      kpc.getRange(i + 1, COL.PC.SEX + 1).setValue(newSex);
      return JSON.stringify({ success: true, pcSex: newSex, message: "已切換為「" + newSex + "」之身。" });
    }
  }
  return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
}

// ✏ 更改後日談御主 avatar 的名字（隨時可改）。pcId＝KPC_。
//   一併把當前同伴的羈絆列(REL.PC=舊名)遷到新名，避免改名後 bond 斷掉。
function actionKanshouSetName(userData, pcId, sheets) {
  var newName = String(userData.pcName || "").trim();
  if (!newName) return JSON.stringify({ success: false, message: "名字不能空白。" });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kpc = getKanshouPcSheet_(ss);
  var data = kpc.getDataRange().getValues();
  var meIdx = -1, oldName = "", gid = "";
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.ID]) === String(pcId)) { meIdx = i; oldName = String(data[i][COL.PC.NAME] || ""); gid = String(data[i][COL.PC.GAME_ID] || ""); break; }
  }
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  // 當前同伴名單（只遷這些人的羈絆，避免誤動跨局/單機同名列）
  var comps = [];
  for (var c = 1; c < data.length; c++) {
    if (String(data[c][COL.PC.GAME_ID] || "") === gid && String(data[c][COL.PC.FACTION]) === "從者" && !String(data[c][COL.PC.ID]).startsWith("DEAD_")) comps.push(String(data[c][COL.PC.NAME]));
  }
  kpc.getRange(meIdx + 1, COL.PC.NAME + 1).setValue(newName);
  if (sheets.rel && oldName && oldName !== newName) {
    try {
      var rd = sheets.rel.getDataRange().getValues();
      for (var k = 1; k < rd.length; k++) {
        if (String(rd[k][COL.REL.PC]) === oldName && comps.indexOf(String(rd[k][COL.REL.NPC])) !== -1) {
          sheets.rel.getRange(k + 1, COL.REL.PC + 1).setValue(newName);
        }
      }
    } catch (e) { }
  }
  return JSON.stringify({ success: true, pcName: newName, message: "御主已改名為「" + newName + "」。" });
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
