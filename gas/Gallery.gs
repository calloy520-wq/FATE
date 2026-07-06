// ==========================================
// 🏆 Gallery.gs — 鑑賞模式（奪杯後封存從者，可日後呼出回味）
//   勝利 → 玩家點「奪得聖杯」→ AI 總結這幾日羈絆 → 存入「鑑賞」表 → 清理該局資料。
//   鑑賞模式：列出已封存的從者，可呼出她（後日談對話）。
// ==========================================

// 🔒 帳號歸屬驗證：比照 solo 的 linkAccountToPc_/COL.ACC.PC 機制——「帳號」表新增的 KPC 欄位
//   才是唯一權威來源，由伺服器碼在 actionEnterKanshou 專責寫入，玩家端無法透過任何參數影響它。
//   ⚠ 2026-07 修：KPC_/g_/k_ 的 ID 只用 Date.now()(無隨機尾碼)，理論上可預測；之前
//   kanshou_add/remove/set_name/set_sex 只憑 pcId 找列就直接改寫，靠角色自己 MEMORY 裡宣稱的
//   【帳號】標記做防護(每個呼叫端得自己記得驗證，容易漏)——只要猜中/取得他人 pcId 就能竄改
//   對方的後日談世界而對方無感。改成跟 solo 同一結構：查「帳號」表這個 acctName 連結的
//   KPC 是否確實等於呼叫者聲稱的 pcId，不符或查無帳號一律視為找不到列。
function kanshouOwnedRowIdx_(data, pcId, acctName) {
  var trueKpc = getAccountKanshouPcId_(acctName);
  if (!trueKpc || trueKpc !== String(pcId || "")) return -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.ID]) === String(pcId)) return i;
  }
  return -1;
}

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

// 清理某 game_id 的整局資料（眾生，含關係/時鐘欄位已隨列一起刪），並解除帳號連結
//   2026-07：關係已併入眾生列自身欄位，刪列即刪關係，不再需要單獨掃關係表。
function purgeGameData_(sheets, gameId, masterName, accountName) {
  if (gameId) {
    var fresh = sheets.pc.getDataRange().getValues();
    for (var r = fresh.length - 1; r >= 1; r--) {
      if (String(fresh[r][COL.PC.GAME_ID] || "") === gameId) sheets.pc.deleteRow(r + 1);
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

// 🎭 封存當下的「外貌肉體」快照：TRAIT(外貌本相，固定錨、不可被 AI 每次重新詮釋)
//   ＋ STATUS 的姿勢/顏面(戰爭落幕那刻的姿態，非重置成通用預設) ＋ PHYSICAL(肉體，若戰時
//   已有 NSFW 互動紀錄則原樣帶走)。合併一格 JSON，避免拆多欄、封存/邀入兩處各自對齊麻煩。
// ⚠ 2026-07 修：只捕捉了外貌/姿態/肉體，漏了 MEMORY 內的[雙修技巧][性愛時敏感部位]與 REL_MEM 內的
//   [專屬稱呼][親密次數][交談輪數]——這些在 solo 正史(SFW)本就不會有(NSFW互動只在慾海發生)，但玩家在
//   慾海裡累積的這些紀錄，若走「請走→再邀」的流程(見 actionKanshouRemove/Add/SummonHero)會需要延續，
//   一併收進快照；bond 也一起帶，讓再次封存/延續時能反映真實好感而非固定值。
function buildGalleryForm_(row) {
  var trait = String(row[COL.PC.TRAIT] || "");
  var st = {}; try { st = JSON.parse(row[COL.PC.STATUS] || "{}"); } catch (e) { }
  var phys = String(row[COL.PC.PHYSICAL] || "").trim();
  return JSON.stringify({
    trait: trait, pose: st["姿勢"] || "", face: st["顏面"] || "",
    physical: (phys && phys !== "{}") ? phys : "",
    memory: String(row[COL.PC.MEMORY] || ""), relMem: String(row[COL.PC.REL_MEM] || ""),
    bond: parseInt(row[COL.PC.BOND]) || 0
  });
}
// 邀入慾海時解開快照，寫回新列。肉體若戰時從未有 NSFW 紀錄(SFW 正史本就不會有)→ 依性別給
// 正確的起始狀態(不再無視性別統一預設女性生理結構)；之後由既有的 pfb/nfb.physical_state 機制接手演進。
// defaultBond：查無快照紀錄的 bond(0/未定義)時退回的初始值，由呼叫端依情境(封存90/直召喚45)決定。
function applyGalleryForm_(sRow, formStr, sex, defaultBond) {
  var f = {}; try { f = JSON.parse(formStr || "{}"); } catch (e) { }
  sRow[COL.PC.TRAIT] = f.trait || "";
  sRow[COL.PC.STATUS] = JSON.stringify({ "衣服": "便裝", "姿勢": f.pose || "站立", "負面": "無", "顏面": f.face || "神情柔和" });
  sRow[COL.PC.PHYSICAL] = f.physical || ((String(sex) === "男") ? JSON.stringify({ "肉棒": "如常" }) : JSON.stringify({ "蜜穴": "未開", "菊穴": "緊閉" }));
  sRow[COL.PC.MEMORY] = f.memory || "【鑑賞後日談】聖杯戰爭已結束，安然陪伴在御主身邊。";
  sRow[COL.PC.REL_MEM] = f.relMem || "聖杯戰爭並肩奪杯的羈絆";
  sRow[COL.PC.BOND] = (f.bond > 0) ? f.bond : defaultBond;
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
  var cls = String(s[COL.PC.RANK] || "從者");

  // 羈絆值（2026-07：關係併入眾生列，直接讀這名從者自己的 BOND 欄）
  var bond = parseInt(s[COL.PC.BOND]) || 0;
  // 御主願望（show-don't-tell：只供 AI 建構回憶氛圍）
  var wish = "";
  var wm = String(pcData[pIdx][COL.PC.MEMORY] || "").match(/【願望】([^｜|【\n]*)/);
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
    memoir = String(callGeminiAPI(prompt, sys, { temperature: 0.75, ignoreLaw: true, plainText: true }) || "").trim();
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
      masterName, String(pcData[pIdx][COL.PC.SEX] || ""), buildGalleryForm_(s)
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
    //   2026-07：關係併入眾生列，直接讀該列自己的 BOND 欄，不再需要關係表查找。
    try {
      var galNow = gal.getDataRange().getValues();
      for (var ai = 1; ai < pcData.length; ai++) {
        if (String(pcData[ai][COL.PC.GAME_ID] || "") !== gameId) continue;
        var afac = String(pcData[ai][COL.PC.FACTION]);
        if (afac !== "敵御主" && afac !== "敵從者") continue;
        if (String(pcData[ai][COL.PC.ID]).startsWith("DEAD_")) continue;
        var aMem = String(pcData[ai][COL.PC.MEMORY] || "");
        var aName = String(pcData[ai][COL.PC.NAME] || "");
        var aBond = parseInt(pcData[ai][COL.PC.BOND]) || 0;
        if (!/【鑑賞緣】/.test(aMem) && aBond < 90) continue; // 未達羈絆門檻、不入名冊
        var aIsMaster = (afac === "敵御主");
        var aCls = aIsMaster ? "御主" : String(pcData[ai][COL.PC.RANK] || "從者");
        var aMemoir = aIsMaster
          ? ("聖杯戰爭的腥風血雨裡，「" + aName + "」曾與你並肩立於同一陣線。猜忌與算計之外，你們之間悄然長出了某種無需言明的牽絆——硝煙散盡後，那個身影仍留在你身旁。")
          : ("「" + aName + "」本是敵對陣營的從者，卻在那段暫時休兵的日子裡與你結下了超越敵我的羈絆。戰爭落幕，這份惺惺相惜並未隨之消散。");
        var aRow = [
          acctName, aName, aCls, String(pcData[ai][COL.PC.SEX] || ""),
          String(pcData[ai][COL.PC.SIX] || "{}"), String(pcData[ai][COL.PC.TAGS] || "{}"),
          String(pcData[ai][COL.PC.MARTIAL] || ""), String(pcData[ai][COL.PC.BACK] || ""),
          String(pcData[ai][COL.PC.PREF] || ""), String(pcData[ai][COL.PC.INTENT] || ""),
          aMemoir, "（並肩走過聖杯戰爭的盟友）", new Date(),
          masterName, String(pcData[pIdx][COL.PC.SEX] || ""), buildGalleryForm_(pcData[ai])
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
  if (partnerIsMaster) {
    sRow[COL.PC.HP] = 100; sRow[COL.PC.MAX_HP] = 100; sRow[COL.PC.MP] = 120; sRow[COL.PC.MAX_MP] = 120;
    // 🎴 五圍已棄欄：戰鬥吃六圍 SIX。
  } else {
    sRow[COL.PC.HP] = 480; sRow[COL.PC.MAX_HP] = 480; sRow[COL.PC.MP] = 200; sRow[COL.PC.MAX_MP] = 200;
    // 🎴 五圍已棄欄：戰鬥吃六圍 SIX。
  }
  applyGalleryForm_(sRow, String(rec[COL.GAL.FORM] || ""), sRow[COL.PC.SEX], 90); // 外貌本相+姿勢/顏面+肉體+雙修技巧/專屬稱呼+好感 一次解開寫回(查無紀錄退回90＝並肩奪杯)
  sRow[COL.PC.LOC] = loc;
  sRow[COL.PC.FACTION] = "從者";
  sRow[COL.PC.RANK] = String(rec[COL.GAL.CLS] || "從者");
  sRow[COL.PC.MARTIAL] = String(rec[COL.GAL.NP] || "");
  sRow[COL.PC.BACK] = String(rec[COL.GAL.BACK] || "");
  sRow[COL.PC.PREF] = String(rec[COL.GAL.PREF] || "");
  sRow[COL.PC.INTENT] = String(rec[COL.GAL.MOE] || "");
  sRow[COL.PC.SIX] = String(rec[COL.GAL.SIX] || "{}");
  sRow[COL.PC.TAGS] = String(rec[COL.GAL.TAGS] || "{}");
  sRow[COL.PC.GAME_ID] = gameId;
  // 🆕 關係欄(併入眾生列)：邀入的同伴直接帶著並肩奪杯的羈絆入場，同行狀態即刻生效
  sRow[COL.PC.REL_TAG] = "從者"; sRow[COL.PC.IS_PARTY] = "同行"; sRow[COL.PC.MAJOR_EVENT] = "";
  return sRow;
}

// 🌹 慾海直接從英靈庫挑選(2026-07 玩家定案·與「封存後邀請」並存)：不必先在 solo 打贏一場戰爭
// 封存，直接從英靈殿挑一位召喚進後日談。刻意【不帶任何戰鬥資料】(SIX/TAGS/MARTIAL 留空)——
// 慾海本就無戰鬥，養這些資料只白增加 AI 誤讀/亂加戲的風險面，不是漏寫。
// 好感給 45(「尚淺·剛認識」門檻，非封存路徑「並肩奪杯」的 90)：剛見面就給滿好感會架空
// Router_Narrative.gs 那條「好感未滿80/性格冷酷高傲者要演出真實戒備」的一致性鐵律，
// 冷艷/高傲角色會被迫演出不符設定的毫無防備——45 讓角色自己的性格決定要花多久暖起來。
function heroToKanshouRow_(heroRow, gameId, loc) {
  var pcColCount = Object.keys(COL.PC).length;
  var name = String(heroRow[COL.HERO.NAME] || "從者");
  var p = {}; try { p = JSON.parse(heroRow[COL.HERO.PERSONA] || "{}"); } catch (e) { }
  var sex = String(heroRow[COL.HERO.SEX] || "異") || "異";
  var sRow = Array(pcColCount).fill("");
  sRow[COL.PC.ID] = "KHV_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  sRow[COL.PC.NAME] = name;
  sRow[COL.PC.SEX] = sex;
  sRow[COL.PC.HP] = 480; sRow[COL.PC.MAX_HP] = 480; sRow[COL.PC.MP] = 200; sRow[COL.PC.MAX_MP] = 200;
  sRow[COL.PC.STATUS] = JSON.stringify({ "衣服": "便裝", "姿勢": "站立", "負面": "無", "顏面": "神情從容" });
  sRow[COL.PC.LOC] = loc;
  sRow[COL.PC.FACTION] = "從者";
  sRow[COL.PC.RANK] = String(heroRow[COL.HERO.CLS] || "從者");
  sRow[COL.PC.PREF] = p.words || "";
  sRow[COL.PC.TRAIT] = p.look || "";
  sRow[COL.PC.INTENT] = p.moe || "";
  sRow[COL.PC.MEMORY] = stampPersonaFlavor_("【鑑賞後日談·初見】從英靈殿被召喚而來的相遇，緣分才剛開始。", p.speech, p.tic);
  sRow[COL.PC.PHYSICAL] = (sex === "男") ? JSON.stringify({ "肉棒": "如常" }) : JSON.stringify({ "蜜穴": "未開", "菊穴": "緊閉" });
  sRow[COL.PC.GAME_ID] = gameId;
  sRow[COL.PC.BOND] = 45; sRow[COL.PC.REL_TAG] = "從者"; sRow[COL.PC.IS_PARTY] = "同行";
  sRow[COL.PC.REL_MEM] = "初次相遇，緣分才剛開始"; sRow[COL.PC.MAJOR_EVENT] = "";
  return sRow;
}

// 👥➕ 直接從英靈庫召喚一位英靈進入當前後日談(不需先在 solo 封存；上限與封存路徑共用同一個 3)
function actionKanshouSummonHero(userData, pcId, sheets) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kpc = getKanshouPcSheet_(ss);
  var acctName = String(userData.acctName || "").trim();
  var heroId = String(userData.heroId || "").trim();
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var me = data[meIdx];
  var gid = String(me[COL.PC.GAME_ID] || ""); var loc = String(me[COL.PC.LOC] || "冬木·深山町");
  var heroes = getHeroCodexCached();
  var hero = heroes.find(function (r) { return String(r[COL.HERO.ID]) === heroId; });
  if (!hero) return JSON.stringify({ success: false, message: "英靈庫查無此英靈。" });
  var heroName = String(hero[COL.HERO.NAME] || "從者");
  var heroSex = String(hero[COL.HERO.SEX] || "異") || "異";
  // 🎨 玩家定案·不開放男男配對(與封存路徑同一條規則)
  if (String(me[COL.PC.SEX]) === "男" && heroSex === "男") {
    return JSON.stringify({ success: false, message: "「" + heroName + "」暫時無法召喚——僅支援 男女／女女 配對。" });
  }
  // ⚠ 2026-07 修：同上(actionKanshouAdd)——請走已改成保留列只退出同行，先找「此局是否已有這位
  // 英靈的列」，有就直接喚回延續累積紀錄，不重建覆蓋掉。
  var cnt = 0, existingIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") !== gid || String(data[i][COL.PC.FACTION]) !== "從者" || String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (String(data[i][COL.PC.NAME]) === heroName) existingIdx = i;
    if (String(data[i][COL.PC.IS_PARTY] || "") === "同行") cnt++;
  }
  if (existingIdx >= 0 && String(data[existingIdx][COL.PC.IS_PARTY] || "") === "同行") return JSON.stringify({ success: false, message: "「" + heroName + "」已在場。" });
  if (cnt >= 3) return JSON.stringify({ success: false, message: "後日談最多 3 名同伴，請先請走一位再邀。" });
  if (existingIdx >= 0) {
    kpc.getRange(existingIdx + 1, COL.PC.IS_PARTY + 1).setValue("同行");
    kpc.getRange(existingIdx + 1, COL.PC.LOC + 1).setValue(loc);
    return JSON.stringify({ success: true, added: heroName, message: "「" + heroName + "」回到了你們身邊。" });
  }
  kpc.appendRow(heroToKanshouRow_(hero, gid, loc));
  return JSON.stringify({ success: true, added: heroName, message: "「" + heroName + "」來到了你們身邊。" });
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

// 🌹 進入慾海·後日談（新版單一持久主畫面）：每個帳號只有【一個】常駐後日談世界。
//   點「進入鑑賞」→ 直接回到這個世界（御主 avatar），不再先挑從者、不再每次重講開場。
//   從者由 👥 後日談同伴面板自行邀請。歷史紀錄跟單機一樣靠 pcId 從「歷史暫存」撈。
//   🔒 2026-07 修：御主 avatar 綁定帳號原本靠角色自己 MEMORY 內【帳號】<acct> 標記宣稱，
//   沒有結構性防護(任何操作忘了驗證就能被冒充/竄改)。改成比照 solo 的 linkAccountToPc_ 機制——
//   權威連結存在「帳號」表新增的 KPC 欄位，只有伺服器碼(這裡)會寫，玩家端無法影響。
function actionEnterKanshou(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  if (!acctName) return JSON.stringify({ success: false, message: "未登入帳號。" });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kpc = getKanshouPcSheet_(ss);            // 🌹 慾海專屬分頁
  var data = kpc.getDataRange().getValues();

  // 1️⃣ 帳號表已有連結(權威來源) → 直接接續(不重製)
  var linkedKpcId = getAccountKanshouPcId_(acctName);
  if (linkedKpcId) {
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][COL.PC.ID]) !== linkedKpcId) continue;
      var loc = String(data[r][COL.PC.LOC] || "冬木·深山町");
      return JSON.stringify({
        success: true, resumed: true,
        pcId: linkedKpcId, pcName: String(data[r][COL.PC.NAME] || acctName),
        pcSex: String(data[r][COL.PC.SEX] || "異"), loc: loc
      });
    }
    // 連結指向的列不存在(手動整理試算表等邊角情況)→ 當作沒有存檔，往下走新建流程。
  } else {
    // 2️⃣ 一次性遷移：帳號表還沒連結，但舊版用 MEMORY【帳號】標記識別的角色可能還在——
    //    找到就補寫帳號表連結(下次直接走①)，不必讓玩家既有的後日談世界憑空消失。
    var acctTag = "【帳號】" + acctName;
    for (var m = 1; m < data.length; m++) {
      if (String(data[m][COL.PC.FACTION]) !== "御主") continue;
      if (String(data[m][COL.PC.ID]).startsWith("DEAD_")) continue;
      if (String(data[m][COL.PC.MEMORY] || "").indexOf(acctTag) === -1) continue;
      var migId = String(data[m][COL.PC.ID]);
      linkAccountToKanshouPc_(acctName, migId);
      return JSON.stringify({
        success: true, resumed: true,
        pcId: migId, pcName: String(data[m][COL.PC.NAME] || acctName),
        pcSex: String(data[m][COL.PC.SEX] || "異"), loc: String(data[m][COL.PC.LOC] || "冬木·深山町")
      });
    }
  }

  // 3️⃣ 沒有常駐御主 → 要新建。御主名字＋性別由玩家「首次進場時自己定」(一帳號可能有不同
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
  mRow[COL.PC.HP] = 100; mRow[COL.PC.MAX_HP] = 100; mRow[COL.PC.MP] = 100; mRow[COL.PC.MAX_MP] = 100;
  // 🎴 五圍已棄欄：戰鬥吃六圍 SIX。
  mRow[COL.PC.STATUS] = JSON.stringify({ "衣服": "便裝", "姿勢": "站立", "負面": "無", "顏面": "神情輕鬆" });
  mRow[COL.PC.LOC] = loc2;
  mRow[COL.PC.FACTION] = "御主";
  // 【帳號】標記保留供人工檢視試算表時辨識(非驗證用途，真正的歸屬判斷已走帳號表 KPC 欄位)。
  mRow[COL.PC.MEMORY] = "【帳號】" + acctName + "｜【鑑賞後日談】聖杯戰爭已結束，這是與封存從者的和平約會時光。";
  mRow[COL.PC.GAME_ID] = gameId;
  // 🐛→✅ 2026-07 修：原本只建名字＋性別，BACK/TRAIT/PREF/INTENT 全空——玩家自己的鑑賞人物毫無設定，
  //   同伴卡有身世/外貌/個性/萌點、御主本人卻一片空白。比照 solo 創角(actionManualNpc)：先用玩家填的
  //   種子片段(或預設)秒寫非阻塞，AI 潤色由 actionBackfillKanshouAi 於進場後背景補上(見下)。
  var kAppear = String(userData.appearance || "").trim();
  var kStanding = String(userData.standing || "").trim();
  var kPersona = String(userData.persona || "").trim();
  mRow[COL.PC.BACK] = kStanding || "後日談裡的尋常身影，聖杯戰爭已成過去";
  mRow[COL.PC.TRAIT] = parseTraitsHelper(kAppear, "外貌平凡、舉止從容、自稱「我」、卸下心防的私密一面");
  mRow[COL.PC.PREF] = parseTraitsHelper(kPersona, "溫婉謙和、內斂堅韌、明哲保身、隨波逐流");
  mRow[COL.PC.INTENT] = "（待揭曉）";
  kpc.appendRow(mRow);
  linkAccountToKanshouPc_(acctName, mId); // 🔒 權威連結寫進帳號表

  return JSON.stringify({
    success: true, resumed: false,
    pcId: mId, pcName: mName, pcSex: mSex, loc: loc2
  });
}

// 🚀 鑑賞御主敘事·非阻塞補生成(2026-07)：比照 actionBackfillMasterAi 的「先種子秒建、AI 背景潤色」
//   模式——enter_kanshou 首次建檔已用玩家片段(或預設)秒寫，此處於進場後背景補 AI 版 4 個敘事欄，
//   失敗＝保留種子預設(優雅降級)。數值/位置/MEMORY 一律不碰；只單格 setValue，不整列寫回。
function actionBackfillKanshouAi(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const row = pcData[pIdx];
  const finalName = String(row[COL.PC.NAME] || ""), finalSex = String(row[COL.PC.SEX] || "異");
  const appearance = String(userData.appearance || ""), standing = String(userData.standing || "");
  const persona = String(userData.persona || "");

  const promptStr = `【御主】：名號『${finalName}』，性別『${finalSex}』\n【外貌】：${appearance || "隨機"}\n【身世】：${standing || "隨機"}\n【個性方向】：${persona || "隨機"}`;

  const KANSHOU_GEN_SYS = `你是《命運停駐之夜》後日談(鑑賞)的角色生成核心，為玩家建立一位已結束聖杯戰爭、與封存從者共度和平時光的「御主」本人形象。請依玩家提供的姓名、性別、外貌、身世、個性方向，生成合理且溫暖自然的設定。

★【演出而非說明】設定只作為底層依據，不要在 background 裡直接複述字面。
★【四格】traits 與 personality 各剛好 4 短句、頓號分隔、禁數字標籤：
- traits：外貌、氣質舉止、自稱與口氣(第一人稱·如 我/俺/吾＋說話語氣)、卸下心防的私密一面
- personality：日常表象、真實內裡、喜歡的事物、討厭的事物
★npc_intent：一句【簡短】萌點（可愛反差，≤15字），結合此人身分性格，要反差、可愛、獨特。
★background：限20字，呼應其身世，不出現具體物品名，語氣平和(聖杯戰爭已結束)。
★【勿輸出數值】戰力數值一律不需要，也不要輸出地點。

★【輸出】合法 JSON、禁 Markdown：
{"background":"限20字","traits":"四格頓號字串","personality":"四格頓號字串","npc_intent":"結合此人身分的獨特可愛反差萌，一句話"}`;

  try {
    const aiBrief = JSON.parse(callGeminiAPI(promptStr, KANSHOU_GEN_SYS, { temperature: 0.6, ignoreLaw: true }));
    // 🔒 競態修(比照 actionBackfillMasterAi)：backfill 豁免寫入鎖，pIdx 是 AI 呼叫【前】的列索引——寫回前重定位。
    const wIdx = buildLiveIdIndex_(sheets.pc)[String(pcId)];
    if (wIdx === undefined) return JSON.stringify({ success: false, message: "御主列已不存在（可能剛被清理）。" });
    if (aiBrief.background) sheets.pc.getRange(wIdx + 1, COL.PC.BACK + 1).setValue(String(aiBrief.background).slice(0, 40));
    if (aiBrief.traits) sheets.pc.getRange(wIdx + 1, COL.PC.TRAIT + 1).setValue(parseTraitsHelper(aiBrief.traits, row[COL.PC.TRAIT]));
    if (aiBrief.personality) sheets.pc.getRange(wIdx + 1, COL.PC.PREF + 1).setValue(parseTraitsHelper(aiBrief.personality, row[COL.PC.PREF]));
    if (aiBrief.npc_intent) sheets.pc.getRange(wIdx + 1, COL.PC.INTENT + 1).setValue(String(aiBrief.npc_intent).slice(0, 18));
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ success: false, message: "背景補生成失敗（已保留種子設定）" });
  }
}

// 👥 列出後日談現有同伴 ＋ 可邀請名單（上限 3 人）。pcId＝慾海御主 avatar(KPC_)。
function actionKanshouCompanions(userData, pcId, sheets) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kpc = getKanshouPcSheet_(ss);
  var acctName = String(userData.acctName || "").trim();
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var me = data[meIdx];
  var gid = String(me[COL.PC.GAME_ID] || "");
  var current = [];
  for (var i = 1; i < data.length; i++) {
    // ⚠ 2026-07 修：請走已改成「保留列、只退出同行」(見 actionKanshouRemove)，此處必須加 IS_PARTY
    // 過濾，否則被請走、資料仍在表上的同伴會被誤判成「在場」。
    if (String(data[i][COL.PC.GAME_ID] || "") === gid && String(data[i][COL.PC.FACTION]) === "從者" && String(data[i][COL.PC.IS_PARTY] || "") === "同行" && !String(data[i][COL.PC.ID]).startsWith("DEAD_")) current.push(String(data[i][COL.PC.NAME]));
  }
  var gal = ss.getSheetByName("鑑賞"); var gd = gal ? gal.getDataRange().getValues() : [];
  var meSex = String(me[COL.PC.SEX] || "");
  var avail = [];
  for (var j = 1; j < gd.length; j++) {
    if (String(gd[j][COL.GAL.ACC]).trim() !== acctName) continue;
    if (meSex === "男" && String(gd[j][COL.GAL.SEX]).trim() === "男") continue; // 不開放男男配對，可邀清單就不列出
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
  var meIdx = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var me = data[meIdx];
  var gid = String(me[COL.PC.GAME_ID] || ""); var loc = String(me[COL.PC.LOC] || "冬木·深山町");
  // ⚠ 2026-07 修：同時找「此局是否已有這位同伴的列」(不論在場與否)——請走已改成保留列只退出
  // 同行，若這裡只看在場人數會漏掉「之前請走過、資料還在」的情況，導致重建新列蓋掉累積的
  // 雙修技巧/性愛時敏感部位/專屬稱呼/親密次數/好感，變回請走一次就全部歸零。
  var cnt = 0, existingIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") !== gid || String(data[i][COL.PC.FACTION]) !== "從者" || String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (String(data[i][COL.PC.NAME]) === addName) existingIdx = i;
    if (String(data[i][COL.PC.IS_PARTY] || "") === "同行") {
      cnt++;
      if (String(data[i][COL.PC.NAME]) === addName) return JSON.stringify({ success: false, message: "「" + addName + "」已在場。" });
    }
  }
  if (cnt >= 3) return JSON.stringify({ success: false, message: "後日談最多 3 名同伴，請先請走一位再邀。" });
  if (existingIdx >= 0) {
    // 🔁 之前請走過、資料仍在此局——直接喚回，雙修技巧/性癖/專屬稱呼/親密次數/好感全部延續，不重建。
    kpc.getRange(existingIdx + 1, COL.PC.IS_PARTY + 1).setValue("同行");
    kpc.getRange(existingIdx + 1, COL.PC.LOC + 1).setValue(loc);
    return JSON.stringify({ success: true, added: addName, message: "「" + addName + "」回到了你們身邊。" });
  }
  var rec = galleryRec_(ss, acctName, addName);
  if (!rec) return JSON.stringify({ success: false, message: "鑑賞名冊查無「" + addName + "」。" });
  // 🎨 玩家定案：不開放男男配對(女女/男女皆可)。慾海御主性別在 actionEnterKanshou 就已鎖死只能
  // 「男」或「女」二選一，故只需擋這一種組合；同伴性別非「男」(含女/異/無)一律放行。
  if (String(me[COL.PC.SEX]) === "男" && String(rec[COL.GAL.SEX]) === "男") {
    return JSON.stringify({ success: false, message: "「" + addName + "」暫時無法邀入——僅支援 男女／女女 配對。" });
  }
  // 🆕 羈絆已直接寫在 kanshouServantRow_ 建好的列上(BOND/IS_PARTY 等)，不再需要另寫關係表。
  kpc.appendRow(kanshouServantRow_(rec, gid, loc));
  return JSON.stringify({ success: true, added: addName, message: "「" + addName + "」來到了你們身邊。" });
}

// 👥➖ 請走一名同伴（退出當前同行；資料原地保留，隨時可再邀回、累積紀錄不歸零）
// ⚠ 2026-07 修：原本直接 deleteRow，等於把這位同伴在慾海裡累積的雙修技巧/性愛時敏感部位
// (MEMORY)、專屬稱呼/親密次數/交談輪數(REL_MEM)、當下肉體(PHYSICAL)、好感(BOND)全部銷毀——
// 「資料仍封存在鑑賞名冊」這句話其實只精確到「原始封存那一刻」的舊快照，請走之後在慾海裡
// 累積的一切都救不回來。改成只退出同行(IS_PARTY 清空)、保留整列，之後 actionKanshouAdd/
// SummonHero 偵測到同名列存在時會直接喚回、不重建。
function actionKanshouRemove(userData, pcId, sheets) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kpc = getKanshouPcSheet_(ss);
  var acctName = String(userData.acctName || "").trim();
  var rmName = String(userData.servantName || "").trim();
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var me = data[meIdx];
  var gid = String(me[COL.PC.GAME_ID] || "");
  var found = false;
  for (var d = 1; d < data.length; d++) {
    if (String(data[d][COL.PC.GAME_ID] || "") === gid && String(data[d][COL.PC.FACTION]) === "從者" && String(data[d][COL.PC.NAME]) === rmName && String(data[d][COL.PC.IS_PARTY] || "") === "同行" && !String(data[d][COL.PC.ID]).startsWith("DEAD_")) {
      kpc.getRange(d + 1, COL.PC.IS_PARTY + 1).setValue("");
      found = true;
    }
  }
  if (!found) return JSON.stringify({ success: false, message: "「" + rmName + "」不在場。" });
  return JSON.stringify({ success: true, removed: rmName, message: "「" + rmName + "」暫別了，隨時可再邀回（過往點滴都還在）。" });
}

// ⚧ 切換後日談御主 avatar 的性別（隨時可改；只動 SEX 欄，不影響從者/歷史）。pcId＝KPC_。
// ⚠ 2026-07 修：原本只驗證新性別合法，沒回頭檢查會不會跟現有「同行」同伴組成不合規配對——
// 御主原本是女、邀了一位男同伴(合法)後改成男，該男同伴會悄悄變成不合規配對卻沒被擋、也沒被
// 請走，之後的敘事框架仍會用新性別去演出。比照 actionKanshouAdd 的規則直接擋下這次改性別。
function actionKanshouSetSex(userData, pcId, sheets) {
  var newSex = String(userData.pcSex || "").trim();
  if (newSex !== "男" && newSex !== "女") return JSON.stringify({ success: false, message: "性別僅限 男／女。" });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kpc = getKanshouPcSheet_(ss);
  var acctName = String(userData.acctName || "").trim();
  var data = kpc.getDataRange().getValues();
  var i = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (i < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  if (newSex === "男") {
    var gid = String(data[i][COL.PC.GAME_ID] || "");
    var hasMaleCompanion = data.some(function (r, ri) {
      return ri !== i && String(r[COL.PC.GAME_ID] || "") === gid && String(r[COL.PC.FACTION]) === "從者" &&
        String(r[COL.PC.IS_PARTY] || "") === "同行" && String(r[COL.PC.SEX]) === "男" && !String(r[COL.PC.ID]).startsWith("DEAD_");
    });
    if (hasMaleCompanion) {
      return JSON.stringify({ success: false, message: "目前有男性同伴同行中——僅支援男女／女女配對，請先請走該同伴再切換性別。" });
    }
  }
  kpc.getRange(i + 1, COL.PC.SEX + 1).setValue(newSex);
  return JSON.stringify({ success: true, pcSex: newSex, message: "已切換為「" + newSex + "」之身。" });
}

// ✏ 更改後日談御主 avatar 的名字（隨時可改）。pcId＝KPC_。
//   2026-07：關係併入眾生列(存在同伴自己那一列，不記「對誰」的名字)，改名不影響任何同伴的羈絆，無需遷移。
function actionKanshouSetName(userData, pcId, sheets) {
  var newName = String(userData.pcName || "").trim();
  if (!newName) return JSON.stringify({ success: false, message: "名字不能空白。" });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kpc = getKanshouPcSheet_(ss);
  var acctName = String(userData.acctName || "").trim();
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  kpc.getRange(meIdx + 1, COL.PC.NAME + 1).setValue(newName);
  return JSON.stringify({ success: true, pcName: newName, message: "御主已改名為「" + newName + "」。" });
}

