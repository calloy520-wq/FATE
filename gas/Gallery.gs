// ==========================================
// 🏆 Gallery.gs — 鑑賞軌道全集中（慾海後日談，與封存從者的和平約會）
//   從英靈殿直接召喚同伴進入後日談，不必先在 solo 打贏封存；不寫「鑑賞」表(該schema已移除，
//   全代碼庫無讀寫者，留著的空分頁無害可自行刪除)。
//   actionPlay/buildDefaultSystemPrompt(含nsfwBaseRules)也集中在本檔，鑑賞相關代碼只查
//   這一個檔案即可；callGeminiAPI 留在 Engine_Combat.gs(solo/鑑賞共用基礎設施)。solo結束一局的
//   清理(actionEndRun/purgeGameData_/findPlayerServant_)住在Account.gs(2026-07「完全拆分」
//   稽核搬過去——這三個其實是solo game-lifecycle清理，不是鑑賞邏輯，只是historically放錯檔)。
// ==========================================

// 防呆：AI 輸出寫入試算表前夾住異常值(幻覺型別跑掉)，只動範圍明確的數值欄位，單回合好感限 -100~+100。
// 唯一呼叫點是本檔 actionPlay，solo 不用此函式。
function sanitizeAiData_(aiData) {
  if (!aiData || typeof aiData !== "object" || Array.isArray(aiData)) {
    throw new Error("AI 回傳結構異常（非物件），已攔截避免污染資料。");
  }
  const clampInt = (v, lo, hi, dflt) => {
    const n = parseInt(v);
    if (isNaN(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  };
  if (Array.isArray(aiData.rel_changes)) {
    aiData.rel_changes.forEach(rc => {
      if (rc && rc.fav_change !== undefined) rc.fav_change = clampInt(rc.fav_change, -100, 100, 0);
    });
  }
  return aiData;
}

// 把鑑賞(後日談)avatar 連結到帳號——外部表存連結而非角色自稱，確保只有伺服器碼能寫。
// 只服務鑑賞(COL.ACC.KPC欄位)；solo用同檔的linkAccountToPc_/COL.ACC.PC，互不相通。
function linkAccountToKanshouPc_(accountName, kpcId) {
  if (!accountName || !kpcId) return;
  var name = String(accountName).trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  if (!acc) return;
  var found = findAccountRow_(acc, name);
  if (found) {
    acc.getRange(found.idx + 1, COL.ACC.KPC + 1).setValue(kpcId);
  } else {
    var row = Array(Object.keys(COL.ACC).length).fill("");
    row[COL.ACC.NAME] = name; row[COL.ACC.KPC] = kpcId; row[COL.ACC.CREATED] = new Date();
    acc.appendRow(row);
  }
}

// 🌹 查某帳號目前連結的鑑賞 avatar pcId（查無回 ""）。
function getAccountKanshouPcId_(accountName) {
  var name = String(accountName || "").trim();
  if (!name) return "";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  if (!acc) return "";
  var found = findAccountRow_(acc, name);
  return found ? String(found.row[COL.ACC.KPC] || "") : "";
}

// 帳號歸屬驗證：KPC_ ID 只用 Date.now()、理論上可預測，故不能只憑 pcId 找列就信任是本人——
//   每次都查「帳號」表的 KPC 欄位(唯一權威來源)是否確實等於呼叫者聲稱的 pcId。
function kanshouOwnedRowIdx_(data, pcId, acctName) {
  var trueKpc = getAccountKanshouPcId_(acctName);
  if (!trueKpc || trueKpc !== String(pcId || "")) return -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.ID]) === String(pcId)) return i;
  }
  return -1;
}

// 鑑賞專屬眾生分頁：與主「眾生」隔離，頻繁新增/移除角色不污染戰爭主表。schema 與「眾生」同
//   (COL.PC 位置索引一致)。dispatcher 會在 pcId 以 "KPC_" 開頭時自動把 sheets.pc 指到這張表。
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

// 把戰時外貌(如「貼身黑色戰甲勁裝」)轉譯成現代日常穿搭/外型：本相不變、戰甲換成日常打扮；
//   呼叫端(召喚/奪杯封存)僅一次性觸發，失敗時原樣退回戰時描述。
// dailyMoeHint：私密一面與萌點是兩次獨立 AI 呼叫，容易各自發想撞成同一件事，故傳入已算好的
//   dailyMoe 明講「私密一面不可跟這句萌點重複」。
function translateLookToDaily_(name, cls, rawLook, firstP, speech, dailyMoeHint) {
  var look = String(rawLook || "").trim();
  if (!look) return { look: "", outfit: "" };
  try {
    var sys = "你是《命運停駐之夜》的角色側寫顧問。玩家提供一段用「、」或「・」分隔的角色戰時外貌描述" +
      "(前面數段是外貌本相與戰時攻防裝束，最後一段是整體氣質／神情)，以及她的第一人稱自稱、說話語氣。" +
      "這是 Fate／聖杯戰爭的平行世界日常線，想像《衛宮家今天的餐桌風景》那種基調——換上現代日常穿搭，" +
      "但一看就知道是她本人。請輸出兩樣東西：\n" +
      "①look：日常版「外貌」四短句、頓號分隔，依序為[外貌本相(髮色/瞳色/五官/體態等，不含服裝)]、" +
      "[氣質舉止(依和平日常情境自然轉化，但性格底色不變，不可變成另一個人的氣質)]、" +
      "[自稱與口氣：固定格式「自稱「" + (firstP || "我") + "」，再接一句依她原本說話語氣(" + (speech || "無特別描述") + ")寫成的日常口氣描述」]、" +
      "[卸下心防的私密一面(這個角色只有放下戒備才會流露的一個具體、生活化、忠於其性格的小可愛面向，" +
      "不可空泛或套用他人" + (dailyMoeHint ? "；這個角色的招牌萌點已經是「" + dailyMoeHint + "」，這一格【禁止】重複或換句話說同一件事，必須是完全不同的另一個生活切面(小動作/小習慣/情緒觸發點)" : "") + ")]。\n" +
      "②outfit：一句她今天的日常穿搭，保留原本服裝的色系/風格精神、換成現代日常款式，盡量貼近原味，" +
      "不要跟look的內容重複。\n" +
      "★輸出合法 JSON、禁 Markdown：{\"look\":\"四短句頓號分隔\",\"outfit\":\"一句日常穿搭\"}";
    var prompt = "角色：" + name + "（" + cls + "）\n戰時外貌描述：" + look;
    var out = JSON.parse(callGeminiAPI(prompt, sys, { temperature: 0.7, ignoreLaw: true }) || "{}");
    return { look: String(out.look || "").trim() || look, outfit: String(out.outfit || "").trim() };
  } catch (e) { return { look: look, outfit: "" }; }
}

// 跟 Core_Settings.gs 的 enrichPersonalityLikesDislikes_ 不同：那個只補缺項、維持戰時語境給
//   solo 用；這個額外把戰場語境短句(戰意/殺意等)轉譯成適合日常展現的等價說法，只用於鑑賞。
function translatePersonalityToDaily_(name, cls, rawWords) {
  var words = String(rawWords || "").trim();
  if (!words) return words;
  try {
    var sys = "你是《命運停駐之夜》的角色側寫顧問。玩家提供一位角色在聖杯戰爭(戰時)既有的性格短句" +
      "(用「、」分隔，依序對應[日常表象][真實內裡][喜歡的事物][討厭的事物]，段數可能不足4段——" +
      "這是正常的，種子資料本就只服務戰鬥)。這個角色現在要進入現代都市的和平日常生活，想像" +
      "《衛宮家今天的餐桌風景》那種基調——性格核心不變，只是活在和平日常裡，請你：\n" +
      "①若既有短句偏戰場語境(如「戰意」「殺意」「勝負」「殺戮」等)，轉譯成性格本質不變、但適合" +
      "日常場景展現的等價說法；純屬個性核心(不涉戰場)的短句原樣保留、不要亂改。\n" +
      "②段數不足4段時，依既有特質延伸出貼合、具體、適合日常場景的「喜歡的事物」與「討厭的事物」" +
      "補滿4句。\n" +
      "★只輸出最終4句、用「、」分隔，不要輸出任何說明、標籤、引號、前後綴。";
    var prompt = "角色：" + name + "（" + cls + "）\n戰時性格短句：" + words;
    var out = String(callGeminiAPI(prompt, sys, { temperature: 0.75, ignoreLaw: true, plainText: true }) || "").trim();
    return out || words;
  } catch (e) { return words; }
}

// 戰時萌點常靠戰爭/創傷撐出沉重反差，直接照搬到沒發生過聖杯戰爭的平行世界會顯得莫名沉重——
//   改寫成輕量、會心一笑的日常萌點。只用在 AI 原創(ai_gen)英靈；canon 種子英靈已手寫死進
//   persona.dailyMoe(見 Seed_Codex.gs)。
function translateMoeToDaily_(name, cls, rawMoe) {
  var moe = String(rawMoe || "").trim();
  if (!moe) return moe;
  try {
    var sys = "你是《命運停駐之夜》的角色側寫顧問。玩家提供一位角色在聖杯戰爭(戰時)既有的「反差萌」" +
      "一句話——這種戰時反差萌常常是靠沉重背景撐出來的(創傷/自卑/孤獨/悲劇宿命等)。這個角色現在要" +
      "進入一個【平行世界的日常線】：這裡從來沒有發生過聖杯戰爭這回事(她依然是同一位英靈，只是活在" +
      "一個沒有戰爭、不必背負詛咒創傷的和平世界)。想像《衛宮家今天的餐桌風景》那種基調，把這句反差萌" +
      "改寫成一句「日常向」的可愛萌點：\n" +
      "①保留角色的性格核心(如高冷/傲氣/寡言/暖心等本相不變)，只是換一個不需要靠悲劇/創傷/戰爭陰影" +
      "撐出來的呈現方式。\n" +
      "②必須是單看了會覺得溫馨、正面、會心一笑的小萌點(如生活小習慣、意外的手藝、小小的害羞反應等)，" +
      "不要保留原句的沉重/悲傷/自卑成分。\n" +
      "③限18字，務必寫完整一句話，不可斷在句意未完處。\n" +
      "★只輸出這一句話，不要輸出任何說明、標籤、引號、前後綴。";
    var prompt = "角色：" + name + "（" + cls + "）\n戰時反差萌：" + moe;
    var out = String(callGeminiAPI(prompt, sys, { temperature: 0.75, ignoreLaw: true, plainText: true }) || "").trim();
    return out.slice(0, 30) || moe;
  } catch (e) { return moe; }
}

// DAILY_LOOK/DAILY_WORDS 皆在進英靈殿前就保證非空(種子手寫或工房建立時AI預轉)，故此處純讀取，
//   找不到快取值就退回原始戰時 look/words 當保底，不呼叫AI。
function getDailyHeroFields_(heroRow, p) {
  var existingLook = String(heroRow[COL.HERO.DAILY_LOOK] || "").trim();
  var existingWords = String(heroRow[COL.HERO.DAILY_WORDS] || "").trim();
  var existingMoe = String(heroRow[COL.HERO.DAILY_MOE] || "").trim();
  // DAILY_OUTFIT：服裝跟外貌本相分開存，戰時 persona 無對應欄可退，沒快取到值就交給
  //   heroToKanshouRow_ 自己的「日常便服」保底，這裡純讀取不瞎猜。
  var existingOutfit = String(heroRow[COL.HERO.DAILY_OUTFIT] || "").trim();
  var rawLook = String(p.look || "").replace(/・/g, "、");
  var rawWords = String(p.words || "").replace(/・/g, "、");
  var rawMoe = String(p.moe || "");
  return { look: existingLook || rawLook, words: existingWords || rawWords, moe: existingMoe || rawMoe, outfit: existingOutfit };
}

// actionPlay 組同伴命格時，MEMORY 查無【口吻】標記會退回這裡的日常安全版，而非戰時原始
//   codexPersona_(name).speech(如狂化英靈「僅餘低吼」)——避免任何路徑把戰時口吻餵給鑑賞AI。
function dailySpeechByName_(name, preHeroes) {
  try {
    // preHeroes 可選：同一輪 actionPlay 可能對2~3位同伴各呼叫一次，呼叫端可在迴圈外先抓一次
    //   共用傳入，省重複整表解析；不傳則自己抓，行為不變。
    var heroes = preHeroes || getHeroCodexCached();
    var h = heroes.find(function (r) { return String(r[COL.HERO.NAME]).trim() === String(name).trim(); });
    if (!h) return "";
    var parts = String(h[COL.HERO.DAILY_LOOK] || "").split('、').map(function (s) { return s.trim(); }).filter(Boolean);
    return parts.length >= 4 ? parts[2] : "";
  } catch (e) { return ""; }
}

// 直接從英靈庫召喚進後日談，不必先在 solo 打贏封存。不帶戰鬥資料(SIX/TAGS/MARTIAL 留空，慾海無戰鬥)。
// 起始好感刻意給低值(遠低於封存路徑)，讓角色個性決定要花多久暖起來，避免架空「好感未滿80需真實戒備」的一致性鐵律。
function heroToKanshouRow_(heroRow, gameId, loc, curDay) {
  var pcColCount = Object.keys(COL.PC).length;
  var name = String(heroRow[COL.HERO.NAME] || "從者");
  var p = {}; try { p = JSON.parse(heroRow[COL.HERO.PERSONA] || "{}"); } catch (e) { }
  var sex = String(heroRow[COL.HERO.SEX] || "異") || "異";
  var sRow = Array(pcColCount).fill("");
  sRow[COL.PC.ID] = "KHV_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  sRow[COL.PC.NAME] = name;
  sRow[COL.PC.SEX] = sex;
  // 鑑賞無戰鬥：氣血/真氣/上限/STATUS 皆不寫(唯一可能的讀取點 people[].status 從未被前端消費)。
  sRow[COL.PC.LOC] = loc;
  sRow[COL.PC.FACTION] = "從者";
  sRow[COL.PC.RANK] = String(heroRow[COL.HERO.CLS] || "從者");
  // 種子資料慣用「・」當片語內部連接號(如「影之國女王・武人」)，但 formatPref/formatTrait 是用
  //   「、」切成四格餵給AI——沒有「、」可切時整串會被塞進單一格、其餘三格變「無」，吃掉關鍵個性
  //   錨點。比照 solo actionSummonServant 做「・→、」轉換＋parseTraitsHelper 補滿四格。
  // 優先讀英靈殿已快取的日常版(種子手寫／工房建立當下生成)，兩者皆非空，不再有AI呼叫的可能。
  var daily = getDailyHeroFields_(heroRow, p);
  sRow[COL.PC.PREF] = parseTraitsHelper(daily.words, "沉著表象、堅定內裡、珍視之物、厭惡之事");
  // dailyLook 若已是新格式(外貌本相/氣質舉止/自稱與口氣/私密一面四段)直接讀，過渡期舊資料才退回
  //   looksToTraitParts_ 舊拆法，兩者相容。
  var dailyLookParts = String(daily.look || "").split('、').map(function (s) { return s.trim(); }).filter(Boolean);
  var traitSrc = dailyLookParts.length >= 4 ? daily.look : looksToTraitParts_(daily.look, p.firstP);
  sRow[COL.PC.TRAIT] = parseTraitsHelper(traitSrc, "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面");
  // 萌點跟外貌/性格一樣改讀日常版(daily.moe)：戰時 persona.moe 靠戰爭/創傷撐出的沉重反差，在
  //   這個沒打過聖杯戰爭的世界裡沒有來由。
  sRow[COL.PC.INTENT] = daily.moe || "";
  // 戰時 p.back 跟平行世界矛盾，優先讀 p.dailyBack。舊版保底寫死`${RANK}・${name}`(如「Saber・
  //   阿爾托莉雅」)會把職階字眼餵進AI提示詞、演成從者對御主的恭敬——改成中性描述。
  sRow[COL.PC.BACK] = p.dailyBack ? String(p.dailyBack).slice(0, 28) : "生活在這座平行世界城鎮裡的英靈，與你尚無深交";
  // 直接召喚無快照可帶，用該英靈自己的日常衣裝(daily.outfit)墊底，沒有才退回「日常便服」。
  // p.speech/p.tic 是戰時口吻/小動作，跟平行世界矛盾：口吻改用 dailyLook 第3段(自稱與口氣)的
  //   日常安全版；tic 沒有對應日常版，直接不帶。
  var dailySpeechPart = dailyLookParts.length >= 4 ? dailyLookParts[2] : "";
  sRow[COL.PC.MEMORY] = setOutfit_(stampPersonaFlavor_("【鑑賞後日談·初見】從英靈殿被召喚而來的相遇，緣分才剛開始。", dailySpeechPart, ""), daily.outfit || "日常便服");
  // PHYSICAL 留空，跟御主本人(actionEnterKanshou)一致，直到第一次 intimacy_feedback 才寫入；
  //   Router_Narrative.gs 的懶初始化會在 prompt 組裝時臨時補上，AI 不會拿到空物件。
  sRow[COL.PC.GAME_ID] = gameId;
  // REL_TAG(關係標籤)只是這裡設的起始值，之後全程只能透過actionUpdateRelTag(玩家UI手動操作)
  //   更改——AI對這欄位完全沒有寫入權限，不會被AI敘事悄悄帶偏。
  sRow[COL.PC.BOND] = 10;
  sRow[COL.PC.REL_TAG] = "點頭之交";
  // 鑑賞不寫IS_PARTY——已全面改用「LOC是否跟玩家目前位置一致」判斷是否同地點在場(solo自己的
  //   隊伍系統仍讀寫IS_PARTY，兩軌互不干擾)。
  sRow[COL.PC.REL_MEM] = "初次相遇，緣分才剛開始";
  return sRow;
}

// 關係標籤依好感自動走5階梯度，GAS算、不讓AI插手(AI對REL_TAG本就沒有寫入權限)。
//   門檻借用鑑賞既有的兩個好感節點(60=夜襲橋段門檻、80=同床共枕門檻)當切點，數字只有一處來源。
const KANSHOU_REL_TIER_ = [
  { min: 80, label: '戀人' },
  { min: 60, label: '親近的人' },
  { min: 40, label: '熟識的朋友' },
  { min: 20, label: '普通朋友' },
  { min: -100, label: '點頭之交' }
];
// 依當前BOND重算這一列的REL_TAG——但只在「目前這格文字仍等於某個梯度的字面」時才覆寫：玩家
//   一旦透過actionUpdateRelTag手動改成清單外的自訂稱呼，這格文字就再也不匹配任何梯度，之後好感
//   繼續變動也不會被自動蓋回去，尊重玩家的手動選擇。呼叫時機：任何讓BOND變動的地方之後都補呼叫
//   一次(目前有②送禮加好感、③AI rel_changes)，冪等、重複呼叫不出錯。
function kanshouSyncRelTier_(pcData, idx) {
  const curTag = String(pcData[idx][COL.PC.REL_TAG] || "");
  if (!KANSHOU_REL_TIER_.some(t => t.label === curTag)) return;
  const bond = parseInt(pcData[idx][COL.PC.BOND]) || 0;
  const tier = KANSHOU_REL_TIER_.find(t => bond >= t.min);
  if (tier && tier.label !== curTag) pcData[idx][COL.PC.REL_TAG] = tier.label;
}
// 純聊天(AI rel_changes)加好感只能推到「目前所在梯度的上限」就卡住，要送禮(shopItem gift分支，
//   不吃這個上限)才能突破到下一梯度。上限沿用KANSHOU_REL_TIER_同一份門檻，不重複開新數字。
function kanshouRelChatCeiling_(bond) {
  const thresholds = KANSHOU_REL_TIER_.map(t => t.min).filter(m => m > -100).sort((a, b) => a - b);
  for (const t of thresholds) { if (bond < t) return t - 1; }
  return 100;
}

// [雙修技巧]標記專用讀取——舊寫法曾把整格MEMORY(含關係介紹句、口吻、換裝等其他標記)當「技巧」
//   字面餵給AI，讓AI讀到過期又不相干的內容。只該讀這個標記本身的值。
function kanshouSkillTagStr_(memory) {
  const m = String(memory || "").match(/\[雙修技巧\]([^｜]*)/);
  const raw = m ? m[1].trim() : "";
  return raw || "無";
}

// 直接從英靈庫召喚一位英靈、讓她「存在」於這個後日談世界(不需先在 solo 封存)。召喚是一次性的
//   「讓她出現」，不是「加入隊伍」——沒有隊伍容量上限，之後她依kanshouRollDailyLocation_自己
//   過自己的生活。同一位只能被召喚一次(已存在就不重複建列)。
function actionKanshouSummonHero(userData, pcId, sheets) {
  // dispatcher(Router_Action.gs)已依 pcId 開頭 KPC_ 把 sheets.pc 指到「鑑賞眾生」，
  //   這 5 顆 action 全部只吃 KPC_ 呼叫，不必再自己重查。
  var kpc = sheets.pc;
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
  // 衛宮士郎-Master：玩家本人就是這個位置，不開放召喚。
  if (heroId === '衛宮士郎-Master') return JSON.stringify({ success: false, message: "無法召喚——這個位置由你自己擔任。" });
  // 避免同一位英靈用兩種職階分身重複存在於這個世界，暫時移出鑑賞可召喚名單(資料驅動，見
  //   KANSHOU_SUMMON_BLOCKED_IDS_，日後想調整只改那份清單)。
  if (KANSHOU_SUMMON_BLOCKED_IDS_.indexOf(heroId) !== -1) return JSON.stringify({ success: false, message: "這位英靈暫時不開放召喚。" });
  var heroName = String(hero[COL.HERO.NAME] || "從者");
  // 男性可被召喚，但不會被actionEnterKanshou自動預先鋪墊進世界(見該函式SEX!=='男'過濾)，只能
  //   靠玩家在這裡主動召喚。
  // 玩家原創(ai_gen)只有創造者本人可召喚進鑑賞——前端清單已濾掉，這裡是第二道防線(防直打API
  //   繞過前端過濾)。種子(正典)英靈不受限、人人可召喚。
  if (String(hero[COL.HERO.SOURCE]) === "ai_gen") {
    var _hp = {}; try { _hp = JSON.parse(hero[COL.HERO.PERSONA] || "{}"); } catch (e) { }
    if (!_hp.creator || _hp.creator !== acctName) {
      return JSON.stringify({ success: false, message: "「" + heroName + "」是其他玩家的原創英靈，僅創造者本人可召喚。" });
    }
  }
  var heroSex = String(hero[COL.HERO.SEX] || "異") || "異";
  // 🎨 玩家定案·不開放男男配對
  if (String(me[COL.PC.SEX]) === "男" && heroSex === "男") {
    return JSON.stringify({ success: false, message: "「" + heroName + "」暫時無法召喚——僅支援 男女／女女 配對。" });
  }
  // 只能召喚一次——先找「此局是否已有這位英靈的列」，有的話代表她已經存在於這個世界，不重複建列。
  var existingIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") !== gid || String(data[i][COL.PC.FACTION]) !== "從者" || String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (String(data[i][COL.PC.NAME]) === heroName) { existingIdx = i; break; }
  }
  if (existingIdx >= 0) return JSON.stringify({ success: false, message: "「" + heroName + "」已經存在於這個世界了，去找找她在哪裡吧。" });
  kpc.appendRow(heroToKanshouRow_(hero, gid, loc, parseInt(me[COL.PC.DAY]) || 1));
  return JSON.stringify({ success: true, added: heroName, message: "「" + heroName + "」來到了你們身邊。" });
}

// 進入慾海·後日談：每個帳號只有【一個】常駐後日談世界，點「進入鑑賞」直接回到這個世界。
//   御主 avatar 綁定帳號比照 solo 的 linkAccountToPc_ 機制：權威連結存在「帳號」表的 KPC
//   欄位，只有伺服器碼會寫(MEMORY 內【帳號】標記僅供人工檢視辨識)。
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
        success: true,
        pcId: linkedKpcId, pcName: String(data[r][COL.PC.NAME] || acctName),
        pcSex: String(data[r][COL.PC.SEX] || "異"), loc: loc,
        homeName: getKanshouHomeName_(data[r][COL.PC.MEMORY])
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
        success: true,
        pcId: migId, pcName: String(data[m][COL.PC.NAME] || acctName),
        pcSex: String(data[m][COL.PC.SEX] || "異"), loc: String(data[m][COL.PC.LOC] || "冬木·深山町"),
        homeName: getKanshouHomeName_(data[m][COL.PC.MEMORY])
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
  // 開場落在自己的房間，不用泛泛的「冬木·深山町」城區——那個值容易被AI演成「剛下車、還在路上」
  //   的外地開場，跟「本來就住在這裡」矛盾。
  var loc2 = "我的房間";
  var pcColCount = Object.keys(COL.PC).length;
  var mId = "KPC_" + Date.now();
  var mRow = Array(pcColCount).fill("");
  mRow[COL.PC.ID] = mId;
  mRow[COL.PC.NAME] = mName;
  mRow[COL.PC.SEX] = mSex;
  // 鑑賞無戰鬥：氣血/真氣/上限/STATUS 皆不寫(見 heroToKanshouRow_ 同款理由)。五圍已棄欄，戰鬥吃六圍 SIX。
  mRow[COL.PC.LOC] = loc2;
  mRow[COL.PC.FACTION] = "御主";
  // 借用solo既有的COL.PC.DAY/HOUR欄位存鑑賞自己的時鐘。開局(及結束一天醒來)固定清晨6點——
  //   仍落在timeBand_的「清晨」時段，不強制加「必須先做早餐才能行動」的機關，交給時段感提示詞
  //   讓AI自然帶出晨間氛圍。
  mRow[COL.PC.DAY] = 1;
  mRow[COL.PC.HOUR] = 6;
  // 【帳號】標記保留供人工檢視試算表時辨識(非驗證用途，真正的歸屬判斷已走帳號表 KPC 欄位)。
  // 種子秒寫階段(AI潤色前)的預設值：平行世界框架，不斷言「曾經打過又結束了一場聖杯戰爭」。
  mRow[COL.PC.MEMORY] = setOutfit_("【帳號】" + acctName + "｜【鑑賞後日談】這裡是平行世界的和平日常，與英靈相伴度過尋常時光。", "日常便服");
  mRow[COL.PC.GAME_ID] = gameId;
  // 比照 solo 創角(actionManualNpc)：先用玩家填的種子片段(或預設)秒寫非阻塞，AI 潤色由
  //   actionBackfillKanshouAi 於進場後背景補上(見下)。
  var kAppear = String(userData.appearance || "").trim();
  var kStanding = String(userData.standing || "").trim();
  var kPersona = String(userData.persona || "").trim();
  mRow[COL.PC.BACK] = kStanding || "這個平行世界裡的尋常身影，過著平靜的日常生活";
  mRow[COL.PC.TRAIT] = parseTraitsHelper(kAppear, "外貌平凡、舉止從容、自稱「我」、卸下心防的私密一面");
  mRow[COL.PC.PREF] = parseTraitsHelper(kPersona, "溫婉謙和、內斂堅韌、明哲保身、隨波逐流");
  mRow[COL.PC.INTENT] = "（待揭曉）";
  kpc.appendRow(mRow);
  linkAccountToKanshouPc_(acctName, mId); // 🔒 權威連結寫進帳號表

  // 開場涵蓋全部女性英靈(種子/來源皆算，ai_gen玩家原創除外)，起始好感/關係標籤走一般泛泛之
  //   交，純粹讓她們已經「活在這個世界裡」，各自落在自己原本的住處/日常地點，等玩家撞見。
  var starterHeroes = getHeroCodexCached().slice(1).filter(function (r) {
    return r[COL.HERO.ID] && String(r[COL.HERO.SEX]) !== '男' && KANSHOU_SUMMON_BLOCKED_IDS_.indexOf(String(r[COL.HERO.ID])) === -1 && String(r[COL.HERO.SOURCE]) !== 'ai_gen';
  });
  var starterRows = starterHeroes.map(function (hero) {
    return heroToKanshouRow_(hero, gameId, kanshouRollDailyLocation_(String(hero[COL.HERO.NAME])), 1);
  });
  if (starterRows.length) {
    kpc.getRange(kpc.getLastRow() + 1, 1, starterRows.length, pcColCount).setValues(starterRows);
  }

  return JSON.stringify({
    success: true,
    pcId: mId, pcName: mName, pcSex: mSex, loc: loc2, homeName: "家"
  });
}

// 🚀 鑑賞御主敘事·非阻塞補生成：比照 actionBackfillMasterAi 的「先種子秒建、AI 背景潤色」模式，
//   於進場後背景補 AI 版 4 個敘事欄，失敗＝保留種子預設。數值/位置/MEMORY 一律不碰，只單格 setValue。
function actionBackfillKanshouAi(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const row = pcData[pIdx];
  const finalName = String(row[COL.PC.NAME] || ""), finalSex = String(row[COL.PC.SEX] || "異");
  const appearance = String(userData.appearance || ""), standing = String(userData.standing || "");
  const persona = String(userData.persona || "");

  const promptStr = `【御主】：名號『${finalName}』，性別『${finalSex}』\n【外貌】：${appearance || "隨機"}\n【身世】：${standing || "隨機"}\n【個性方向】：${persona || "隨機"}`;

  // 「御主」在這裡當成單純稱謂使用，不代表真的打過仗；「已結束聖杯戰爭/已落幕」這類斷言禁止
  //   出現(跟平行世界設定矛盾)。
  const KANSHOU_MASTER_GEN_SYS = `你是《命運停駐之夜》後日談(鑑賞)的角色生成核心，為玩家建立一位生活在平行世界(這裡從來沒有發生過聖杯戰爭這回事)、與身邊英靈共度和平日常的「御主」本人形象。請依玩家提供的姓名、性別、外貌、身世、個性方向，生成合理且溫暖自然的設定。

★【演出而非說明】設定只作為底層依據，不要在 background 裡直接複述字面。
★【四格】traits 與 personality 各剛好 4 短句、頓號分隔、禁數字標籤：
- traits：外貌、氣質舉止、自稱與口氣(第一人稱·如 我/俺/吾＋說話語氣)、卸下心防的私密一面
- personality：日常表象、真實內裡、喜歡的事物、討厭的事物
★npc_intent：一句【簡短】萌點（可愛反差，≤18字，系統會在30字處硬性截斷、務必精簡），結合此人身分性格，要反差、可愛、獨特。務必寫完整一句話，不可斷在句意未完處。【禁】誤用聖杯戰爭機制專有詞(令咒/寶具/魔術迴路/從者/職階等)當裝飾性魔法元素湊萌點——這個平行世界從未發生過聖杯戰爭，這些詞在這裡沒有來由，請改用生活化情境(手作/習慣/小癖好等)。★這個萌點必須是單看了會覺得溫馨、正面、會心一笑的日常小反差(如生活小習慣、意外的手藝、小小的害羞反應等)，【禁】靠創傷/自卑/孤獨/悲劇宿命撐出反差感——那是戰時角色才需要的沉重寫法，這裡是輕鬆的日常後日談。
★background：限20字，呼應其身世，不出現具體物品名，語氣平和溫馨，不涉及聖杯戰爭或任何戰爭史。
★outfit：一句她/他今天的日常穿搭(限20字)，依外貌與個性方向自然搭配(如文靜者素雅、活潑者亮色休閒)，純日常便服/居家/外出風格，不含任何戰甲/武裝/戰鬥裝束字眼。
★【勿輸出數值】戰力數值一律不需要，也不要輸出地點。

★【輸出】合法 JSON、禁 Markdown：
{"background":"限20字","traits":"四格頓號字串","personality":"四格頓號字串","npc_intent":"結合此人身分的獨特可愛反差萌，一句話","outfit":"一句日常穿搭"}`;

  try {
    const aiBrief = JSON.parse(callGeminiAPI(promptStr, KANSHOU_MASTER_GEN_SYS, { temperature: 0.6, ignoreLaw: true }));
    // 🔒 競態修(比照 actionBackfillMasterAi)：backfill 豁免寫入鎖，pIdx 是 AI 呼叫【前】的列索引——寫回前重定位。
    const wIdx = buildLiveIdIndex_(sheets.pc)[String(pcId)];
    if (wIdx === undefined) return JSON.stringify({ success: false, message: "御主列已不存在（可能剛被清理）。" });
    if (aiBrief.background) sheets.pc.getRange(wIdx + 1, COL.PC.BACK + 1).setValue(String(aiBrief.background).slice(0, 40));
    if (aiBrief.traits) sheets.pc.getRange(wIdx + 1, COL.PC.TRAIT + 1).setValue(parseTraitsHelper(aiBrief.traits, row[COL.PC.TRAIT]));
    if (aiBrief.personality) sheets.pc.getRange(wIdx + 1, COL.PC.PREF + 1).setValue(parseTraitsHelper(aiBrief.personality, row[COL.PC.PREF]));
    // N 欄(萌點)給足緩衝空間(30字)，避免一句話太緊被腰斬成半句。
    if (aiBrief.npc_intent) sheets.pc.getRange(wIdx + 1, COL.PC.INTENT + 1).setValue(String(aiBrief.npc_intent).slice(0, 30));
    // AI 生成的衣裝比照英靈那邊(daily.outfit)補上，生成失敗/沒給值時種子預設「日常便服」繼續
    //   當保底。這是非阻塞背景呼叫，`row` 是AI呼叫【前】的MEMORY快照——若期間玩家觸發了其他會
    //   動MEMORY的動作，用舊快照當合併基底會蓋掉新寫入，故在真正寫入前用 wIdx 重讀最新值再合併。
    if (aiBrief.outfit) {
      const liveMem = sheets.pc.getRange(wIdx + 1, COL.PC.MEMORY + 1).getValue();
      sheets.pc.getRange(wIdx + 1, COL.PC.MEMORY + 1).setValue(setOutfit_(liveMem, aiBrief.outfit));
    }
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ success: false, message: "背景補生成失敗（已保留種子設定）" });
  }
}

// 🌍 列出這個世界裡「已經存在」的所有英靈(駐留清單)，各自附上目前所在地點，供玩家決定要去找誰。
//   pcId＝慾海御主 avatar(KPC_)。2026-07「加入這個世界的感覺」玩家定案：不再有「隊伍」與人數上限，
//   召喚只是讓她第一次出現在這個世界(見actionKanshouSummonHero)，之後她就自己過自己的生活。
function actionKanshouCompanions(userData, pcId, sheets) {
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
  var acctName = String(userData.acctName || "").trim();
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var me = data[meIdx];
  var gid = String(me[COL.PC.GAME_ID] || "");
  var myLoc = String(me[COL.PC.LOC] || "");
  var myName = String(me[COL.PC.NAME] || "");
  var current = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") === gid && String(data[i][COL.PC.FACTION]) === "從者" && !String(data[i][COL.PC.ID]).startsWith("DEAD_")) {
      var loc = String(data[i][COL.PC.LOC] || "");
      // 面板需要顯示目前所在地點(玩家要精準知道去哪找她)、關係標籤＋好感(供玩家決定要不要改標籤)；
      // isHere(是否跟玩家同地點)；locLabel：房間類地點的動態顯示名稱，見kanshouRoomDisplayName_。
      current.push({ name: String(data[i][COL.PC.NAME]), tag: String(data[i][COL.PC.REL_TAG] || "點頭之交"), bond: parseInt(data[i][COL.PC.BOND]) || 0, loc: loc, locLabel: kanshouRoomDisplayName_(loc, data, gid, myName, meIdx), isHere: loc === myLoc });
    }
  }
  return JSON.stringify({ success: true, current: current });
}

// ⚧ 切換後日談御主 avatar 的性別（隨時可改；只動 SEX 欄，不影響從者/歷史）。pcId＝KPC_。
// 除驗證新性別合法，也要檢查會不會跟現有「同行」同伴組成不合規配對(比照
//   actionKanshouSummonHero 的規則)，避免御主切換性別後跟既有同伴悄悄變成不合規配對。
function actionKanshouSetSex(userData, pcId, sheets) {
  var newSex = String(userData.pcSex || "").trim();
  if (newSex !== "男" && newSex !== "女") return JSON.stringify({ success: false, message: "性別僅限 男／女。" });
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
  var acctName = String(userData.acctName || "").trim();
  var data = kpc.getDataRange().getValues();
  var i = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (i < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  if (newSex === "男") {
    var gid = String(data[i][COL.PC.GAME_ID] || "");
    // 不看IS_PARTY——只要這個世界裡「存在」男性從者(多半是禁召前留下的舊存檔)，就不開放切換
    //   成男性玩家，避免悄悄變成不合規的男男配對。
    var hasMaleCompanion = data.some(function (r, ri) {
      return ri !== i && String(r[COL.PC.GAME_ID] || "") === gid && String(r[COL.PC.FACTION]) === "從者" &&
        String(r[COL.PC.SEX]) === "男" && !String(r[COL.PC.ID]).startsWith("DEAD_");
    });
    if (hasMaleCompanion) {
      return JSON.stringify({ success: false, message: "這個世界裡已經有男性從者存在——僅支援男女／女女配對，此存檔無法切換為男性。" });
    }
  }
  var oldSex = String(data[i][COL.PC.SEX] || "");
  kpc.getRange(i + 1, COL.PC.SEX + 1).setValue(newSex);
  // 真的切換性別時重置回中性預設值，跟玩家肉體懶初始化／heroToKanshouRow_ 同一套預設值看齊。
  if (oldSex !== newSex) {
    kpc.getRange(i + 1, COL.PC.PHYSICAL + 1).setValue(JSON.stringify({ "狀態": "如常" }));
  }
  return JSON.stringify({ success: true, pcSex: newSex, message: "已切換為「" + newSex + "」之身。" });
}

// ✏ 更改後日談御主 avatar 的名字（隨時可改）。pcId＝KPC_。
//   關係併入眾生列(存在同伴自己那一列，不記「對誰」的名字)，改名不影響任何同伴的羈絆，無需遷移。
function actionKanshouSetName(userData, pcId, sheets) {
  var newName = String(userData.pcName || "").trim();
  if (!newName) return JSON.stringify({ success: false, message: "名字不能空白。" });
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
  var acctName = String(userData.acctName || "").trim();
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  kpc.getRange(meIdx + 1, COL.PC.NAME + 1).setValue(newName);
  return JSON.stringify({ success: true, pcName: newName, message: "御主已改名為「" + newName + "」。" });
}

// 🏠「出門走走」面板的「家」選項可自由改名(如「工房」「我的公寓」)，比照 actionKanshouSetName
//   同款寫法，只是寫進 MEMORY【住所】標記而非獨立欄位。
function actionKanshouSetHomeName(userData, pcId, sheets) {
  var newName = String(userData.homeName || "").trim();
  if (!newName) return JSON.stringify({ success: false, message: "名稱不能空白。" });
  if (newName.length > 12) return JSON.stringify({ success: false, message: "名稱請在12字以內。" });
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
  var acctName = String(userData.acctName || "").trim();
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var newMemory = setKanshouHomeName_(data[meIdx][COL.PC.MEMORY], newName);
  kpc.getRange(meIdx + 1, COL.PC.MEMORY + 1).setValue(newMemory);
  return JSON.stringify({ success: true, homeName: newName, message: "住所已改名為「" + newName + "」。" });
}


// ==========================================
// 🔴【鑑賞 AI 核心】buildDefaultSystemPrompt／actionPlay
//   solo 是按鍵+AI說故事，鑑賞是依角色資料自然演出(只有🔥點不點火這一個變因)——兩者共用
//   callGeminiAPI(留在 Engine_Combat.gs)這個基礎設施，但系統提示詞組裝／敘事引擎各自獨立，
//   跟本檔其餘鑑賞 action(召喚/進場/請走/AI深化)集中一處，好查找。
// ==========================================

// 只被鑑賞(慾海)呼叫——solo走完全獨立的 miniSystem。唯一呼叫來源 actionPlay 的 isNsfwMode
//   恆為 true，故不再分 SFW/NSFW 分支，直接寫死唯一會用到的版本。driveOn(主動掌握)由
//   actionPlay 自己組的 driveStr 處理，不在這裡管轄。
function buildDefaultSystemPrompt() {
  // physical_state 只留顏面神情(≤15字)：只管表情，衣裝狀態拆進獨立的 outfit_change 欄
  //   (下方)，兩者關注點不同——前者是每回合都可能變的暫時神情，後者是要持久記住的實際穿著。
  const _physicalState = "本回合角色當下的顏面神情(第三人稱填寫，依情境自然帶到即可，≤15字)";

  // outfit_change：角色當下實際穿著狀態，AI 可依劇情如實更新(正常穿著寫身上衣物，全裸/沐浴/
  //   更衣等狀態也要如實反映)，會寫回持久的【換裝】記錄，不是每回合就消失的暫時描述。
  const _outfitChange = "本回合角色實際穿著狀態(第三人稱如實反映，≤20字)";

  // 🔴 npc的範本欄位填「同上」：Router_Action.gs解析intimacy_feedback時的ignoreWords防呆清單本就含「同上」，
  // 即使AI偷懶照抄範本字面值也會被當成敷衍語忽略、不會寫進玩家看到的狀態欄，省字數不引入新的失敗模式。
  const _physicalStateRef = "同上";
  const _outfitChangeRef = "同上";

  const finalJson = {
    // 強制思維鏈：放範本第一位讓模型先自省再寫敘事。後端 sanitizeAiData_ 不讀此欄，純粹是給
    //   AI 自己看的思考格，零程式面副作用。第三人稱總結(而非第一人稱)是為了不跟 narration 的
    //   敘事視角(玩家「我」)打架；「本回合開始前」明講時態，避免被誤讀成預寫本回合結果。
    "inner_monologue": "【必填·純思考用·絕不顯示】鎖定本回合主要互動對象(那名NPC)，用第三人稱總結其「本回合開始前」承接自過往互動的狀態(約50字，此欄不是該角色的台詞或視角，NPC本人不可用「我」自稱)。公式：[該NPC原本的性格尊嚴] vs [當下情緒與身體的真實狀態]。情緒溫度必須銜接歷史紀錄，禁止歸零重來。",
    "narration": "劇情描述(約500字，第一人稱，嚴禁替玩家做決定；篇幅分配依下方慾海律令第4條)...",
    // 🗺️ 鑑賞無固定地圖節點清單，地點完全由AI自主決定何時、換去哪(可自創場景)。
    //   ★鐵律：narration必須先把移動/抵達的過程實際寫出來，這欄才能填新地名，不可無故憑空跳地點。
    "location": "本回合結束時御主所在地點——若narration有實際敘述移動/抵達，填新地點名稱(可自創、不限於冬木既有地名)；沒有移動則原樣填目前地點",
    // move_proposal是「提議」不是「已發生」，跟上面location欄(已經抵達)完全不同時態——填了
    //   這欄，narration必須停在邀請當下、不可先寫出移動或抵達，真正是否移動由玩家事後回應決定。
    "move_proposal": "若同伴這回合自然而然想邀你換個地方(如「要不要去圖書館?」)，填目標地點名稱(需為既有地點清單裡的名字)；沒有這個意圖就填空字串",
    "options": ["1. [主動]強勢掌握主導...", "2. [被動]順從委婉試探...", "3. [接續]順劇情延續互動...", "4. [反差]跳脫氛圍的驚人舉動..."],
    "intimacy_feedback": {
      "_note": "★physical_state只寫角色「自身」當下的顏面神情，禁內心戲，第三人稱填寫，絕對禁寫'自己'，≤15字。★outfit_change是角色當下實際穿著狀態(第三人稱如實反映，≤20字)：正常穿著就寫身上衣物，若劇情中角色被脫光、沐浴、更衣，也要如實反映當下真實狀態，這欄會持久記住、不是每回合就消失的暫時描述。★兩者每回合都要據實反映最新狀態，不可偷懶沿用舊值。npcs每位與player共用此格式，依其實際狀態填寫。",
      "player": {
        "physical_state": _physicalState,
        "outfit_change": _outfitChange,
        "dynamic_skills": "雙修技巧名(2~5字，規則見下方慾海律令第6條)"
      },
      "npcs": [{
        "name": "NPC真實姓名(不論敘事/對話裡怎麼稱呼TA，此欄固定填真實姓名，不可填暱稱或職階)",
        "physical_state": _physicalStateRef,
        "outfit_change": _outfitChangeRef,
        "dynamic_skills": "雙修技巧名(2~5字，規則見下方慾海律令第6條)",
        "mutual_nicknames": "雙方間已自然發展出的暱稱/愛稱(規則見下方慾海律令第6條)",
        "attitude": "這名NPC對御主當下的臨場態度(非好感趨勢，第三人稱，≤15字，規則見下方慾海律令第7條)"
      }]
    },
    // target 只能填真名(schema級約束，比事後再說一次更有效)。tag 欄位不存在：關係標籤
    //   (COL.PC.REL_TAG)只能由御主透過UI(update_rel_tag)手動更改，AI對標籤的影響力只剩
    //   「認不認同」，寫在 intimacy_feedback.npcs[].attitude，不是靠覆寫這個欄位表達。
    "rel_changes": [{
      "_note": "fav_change為整數(可正可負)，關係要慢慢培養、不可躁進：日常閒聊+1~2、明顯心動或重大進展+3~5，單回合上限+5，不可一次跳大段；越界冒犯可填負數。★fav_change純粹是好感升降的數字，與口吻/語氣描述無關。",
      "target": "NPC真實姓名或「自己」(不論敘事/對話裡怎麼稱呼TA，此欄固定填真實姓名，不可填暱稱、職階、台詞、地名或動作等其他內容)", "fav_change": 3
    }],
    // mentioned_names/event/tag/log_summary 等死欄已移除：皆是寫入後從未被任何地方讀回的
    //   死路(前端不消費、AI不依此決策)，拿掉後AI不用再每回合多填這些欄位。
  };

  // 🔠 對話格式規則抽成共用函式，杜絕未來改一半、又不一致的風險。動作可放名字前/引號內(以聲音
  //   呈現)/引號後，不限次數與位置組合；邊說邊動作或帶聲音必須寫出來夾進台詞裡，不可省略。
  function dialogueFormatRule_(example) {
    return `對話格式：（角色動作或神情，例如：${example}）名字：「台詞、或（聲音）、或（動作）、或（聲音+動作），可與台詞自由交錯」。★【鐵律】：
- 角色說話時若有動作或聲音（如低吟、輕笑、喘息、嬌喘），**必須**用（）標記，並夾在對應位置。
- 同一段落可重複名字、可多次使用（）括號。
- 引號只用單層「」，禁止巢狀引號。
- 純背景/環境敘事（無角色動作、無聲音）**不使用任何符號**，直接寫敘事文字，且盡量精簡，把篇幅留給角色互動。`;
}

  // 🔴 NSFW(慾海模式)：本回合聚焦當下的近身互動(情慾/調情/鋪陳皆可)，雜務(物品/金錢/陣營/任務/招募/地圖/戰鬥數值/身世)
  // 完全不追蹤、不輸出，鐵律文字大幅精簡，盡量交給AI自行判斷。意圖攔截只依[個性]判斷(鑑賞無戰鬥
  // 概念，[戰力]門檻與世界觀矛盾)；不設傾心/道侶等詞彙黑名單，只保留「好感未滿80嚴禁傾心倒貼」
  // 的實質行為門檻。
  const nsfwBaseRules = `你是後日談的敘事演化核心，以細膩動人的輕小說筆觸推演因果，強制台灣繁體中文。第一人稱「我」，禁上帝視角。以下為不可違背之鐵律：

【敘事與對話】
1. 絕對響應：開頭必須以第一人稱完整重現玩家最新動作與台詞，優先承接反轉/否定/突發情緒；NPC當回合給完整、真實的態度。
2. 格式分段：每2~3句插入 <br><br> 換段；女子體態/動作一律用柔嫩/雪白/輕盈/婉約等柔美詞，出力亦柔中帶勁。
3. ${dialogueFormatRule_("眼神一沉")}

【世界與NPC自主】
1. 意圖非結果：玩家輸入僅為「意圖」，NPC依當下[個性]與[好感]真實反應——順從、猶豫、半推半就、抗拒、日常互動皆可，不預設結果。
2. 慢熱與傾心：依角色個性與當下好感自然發展，不套用固定門檻。
2b. 【關係標籤由御主決定，你只能認不認】：NPC依個性與好感真實回應是否接受該定位（寫在 attitude 欄）。
3. 萌點節制：僅自然場景輕輕帶過，禁止刻意反覆強調。

【色度跟隨鐵律・最高優先】
- **日常模式**：玩家未主動進行明顯情慾/親密行為時，保持自然輕鬆的日常互動與對話，描寫溫馨、日常、氛圍感即可，禁止無中生有推進情慾。
- **情慾模式**：玩家主動進行情慾、親密、露骨行為時，必須立即切換到**極致細膩、直白、露骨**的描寫：
  - 大量使用具體生理特寫（肉壁蠕動絞緊、滾燙吸吮、痙攣抽搐、蜜液噴濺、拉絲體液、咕啾水聲、啪啪撞擊聲等）
  - 搭配角色個性化的斷續喘息與破碎台詞（啊……哈……更深……唔嗯……）
  - 強調「身體極度誠實」與「人格堅持」的強烈反差（即使快感強烈，依然用原本的驕傲/冷靜/害羞等方式承受）

【狀態與輸出】
1. 本回合聚焦當下近身互動，依玩家輸入自然推進（日常就日常，情慾就情慾）。
2. 只輸出合法JSON，options固定4個、順序不可變、每項20字。`;

const specificRules = `
【慾海律令】
你擅長書寫細膩動人的情慾，以下為核心鐵律：

0. 【色度跟隨鐵律・最高優先】玩家未主動進行明顯情慾行為時，保持自然日常互動；當玩家主動進行情慾、親密、露骨行為時，NPC必須立即跟隨**相同或更高色度**，以極致細膩、直白、露骨的方式描寫肉體交合、喘息、體液、感官反應。【絕對禁止】迴避、淡化、突然害羞或轉移話題。

1. 【先思考，後敘事】禁直接開寫narration！先在inner_monologue中依「玩家本回合實際輸入」＋「NPC[個性]」＋「近期歷史」三者判斷最真實的反應，再寫narration。呈現NPC用原本人格承受當下一切。

2. 【絕不重置溫度】必須繼承歷史情緒基調與親密階段。降溫只能因明確事件（被打斷、翻臉等）。玩家本回合若只是日常互動，【絕對禁止】無中生有推進情慾描寫。

3. 【依配對自然演出】女女配對：純女女之愛，主導與跟隨依個性自然流露，動作仍柔美；男女配對：依實際器官自然互動，女性側保持柔美。

4. 【極致感官】情慾場面時，大量使用具體生理特寫（肉壁蠕動絞緊、滾燙吸吮、痙攣抽搐、蜜液噴濺、拉絲、咕啾水聲、啪啪撞擊等），搭配角色個性化的斷續喘息與破碎台詞（啊……哈……更深……唔嗯……）。玩家輸入越色，描寫必須越露骨，但永遠是用原本的人格去承受快感——語癖、自稱、個性絕對不崩壞。

5. physical_state（≤15字）：只寫顏面神情，禁寫衣裝狀態；outfit_change（≤20字）：只寫當下實際穿著。兩者每回合都據實更新，不可沿用舊值。
6. dynamic_skills / mutual_nicknames：僅本回合確實發生才填，否則填「無」。
7. 【attitude·態度】（≤15字）：每回合據實反映NPC當下臨場心情與對關係標籤的認同/抗拒，不可沿用舊值。`;

return nsfwBaseRules + "\n" + specificRules + "\n\n★【輸出範本】\n" + JSON.stringify(finalJson, null, 2);
}

// 鑑賞自己算一份精簡版「同地人物」清單，不借用 solo 的 getLocalPeopleList(那是為敵蹤/盟友情報
//   共享等一整套機制設計的，多算了12個欄位，鑑賞前端只用得到 .name/.isExact)。
function getKanshouPeopleList_(pcId, curL, allPcData) {
  const safeCurL = String(curL || "");
  const meRow = allPcData.find(r => r[COL.PC.ID] == pcId);
  const myGameId = meRow ? String(meRow[COL.PC.GAME_ID] || "") : "";
  const list = [];
  for (let i = 1; i < allPcData.length; i++) {
    const r = allPcData[i];
    if (r[COL.PC.ID] == pcId || String(r[COL.PC.ID]).startsWith("DEAD_")) continue;
    if (myGameId && String(r[COL.PC.GAME_ID] || "") !== myGameId) continue;
    // 不靠IS_PARTY篩選——isExact(是否跟玩家同地點)才是「在場」的唯一判準。
    list.push({ id: r[COL.PC.ID], name: r[COL.PC.NAME], isExact: (String(r[COL.PC.LOC] || "") === safeCurL) });
  }
  return list;
}

// 鑑賞大地圖分區：純資料驅動的分區清單，只供UI分組/顯示用，region只是KANSHOU_LOCATIONS_
//   每筆的一個標籤欄位，不影響任何既有比對/抽選邏輯(那些都認location的name)。
const KANSHOU_REGIONS_ = [
  { id: 'room', name: '房間', desc: '私人房間' },
  { id: 'home', name: '家的共用空間', desc: '共用生活空間' },
  { id: 'shinzan', name: '深山町', desc: '溫馨日常區' },
  { id: 'fuyuki', name: '冬木市中心', desc: '熱鬧生活區' },
  { id: 'dojo', name: '山林', desc: '安靜神秘區' },
  { id: 'visit', name: '拜訪住處', desc: '同伴們各自的家' }
];
// 🌸 鑑賞地點清單：純資料驅動的小陣列，不進 MAP 試算表(不跟solo共用坤圖)——之後要加/改地點只動
//   這裡。前端 Script_Kanshou.html 另有一份同名清單純供畫按鈕(改地點時兩邊都要更新)，實際驗證/
//   邏輯只認這裡這份。region對應KANSHOU_REGIONS_的id，純UI分組用。noEncounter:true代表私人
//   空間，恆不觸發陌生人巧遇(見kanshouRollEncounter_呼叫端)。
//   🏠 房間分區的name是穩定不變的內部key(給LOC比對用)，顯示給玩家/AI看的名稱是動態算的
//   (kanshouRoomDisplayName_)——「我的房間」永遠顯示「(玩家名)的房間」。2026-07 經濟/房東房客
//   世界觀砍除後，鑑賞不再有可指派的客房，同伴們各自落腳在自己原本的住處(KANSHOU_HERO_HOME_)。
const KANSHOU_LOCATIONS_ = [
  { name: '我的房間', region: 'room', desc: '安穩靜謐、只屬於自己的房間。', noEncounter: true, isRoom: true },

  { name: '客廳', region: 'home', desc: '沙發與電視的日常起居空間。', noEncounter: true },
  { name: '廚房', region: 'home', desc: '飄著飯菜香、鍋碗交錯的小廚房。', noEncounter: true },
  { name: '浴室', region: 'home', desc: '水氣氤氳、放鬆卸下一天疲憊的地方。', noEncounter: true },
  { name: '庭院', region: 'home', desc: '老日式庭院，草木扶疏、四季各有風景。', noEncounter: true },

  { name: '河邊小徑', region: 'shinzan', desc: '晨昏都靜謐的河堤小徑，水聲潺潺。' },
  { name: '古老神社', region: 'shinzan', desc: '石階盡頭的老神社，香火氣息。' },
  { name: '社區公園', region: 'shinzan', desc: '孩子嬉鬧、長椅斑駁的社區公園。' },
  { name: '深夜便利店', region: 'shinzan', desc: '徹夜燈火通明，深夜歸途的小小驛站。' },

  { name: '咖啡廳', region: 'fuyuki', desc: '磨豆香氣繚繞的小巧咖啡館。' },
  { name: '書店二樓', region: 'fuyuki', desc: '安靜得只聽見翻頁聲的二樓書架間。' },
  { name: '屋頂花園', region: 'fuyuki', desc: '高樓頂上的一方綠意，能望見整座城市。' },
  { name: '商店街', region: 'fuyuki', desc: '人聲鼎沸的商店街，攤販林立。' },

  { name: '老道場', region: 'dojo', desc: '木地板與竹刀氣味的老道場。' },
  { name: '山間小徑', region: 'dojo', desc: '林蔭遮天、只聞鳥鳴的山間小路。' },
  { name: '隱藏溫泉', region: 'dojo', desc: '深藏山林間、鮮少人知的一方溫泉。' },
  { name: '廢棄神社', region: 'dojo', desc: '荒草蔓生、早已無人祭拜的廢棄神社。' },

  // 拜訪住處：只保留女性角色的住處，noEncounter:true(私人住處，恆不觸發陌生人巧遇)，name
  //   務必與下方KANSHOU_HERO_HOME_的值逐字一致，否則kanshouRollDailyLocation_骰到的地點對不上這裡。
  { name: '隱蔽的工房', region: 'visit', desc: '隱藏在巷尾、飄著藥草氣味的工房。', noEncounter: true },
  { name: '島嶼道場', region: 'visit', desc: '孤懸海上、只有濤聲相伴的道場。', noEncounter: true },
  { name: '埃德費爾特宅邸', region: 'visit', desc: '歐風古典的埃德費爾特家宅邸。', noEncounter: true },
  { name: '愛因茲貝倫城', region: 'visit', desc: '終年白雪覆蓋的愛因茲貝倫城堡。', noEncounter: true },
  { name: '遠坂邸', region: 'visit', desc: '老字號魔術師家系的遠坂邸。', noEncounter: true },
  { name: '藤村家', region: 'visit', desc: '熱鬧溫馨、時常傳出笑鬧聲的藤村家。', noEncounter: true }
];
// 🏠 房間顯示名稱：只剩玩家自己的房間，永遠顯示「(玩家名)的房間」。
function kanshouRoomDisplayName_(locKey, pcData, gameId, myName, myIdx) {
  if (locKey === '我的房間') return String(myName || "御主") + '的房間';
  return locKey;
}
// 暫時移出鑑賞的英靈id清單(單一來源)，召喚/巧遇/地點標籤/住處全部共用同一份。
const KANSHOU_SUMMON_BLOCKED_IDS_ = ['斯卡哈-Assassin', '伊莉雅-Caster', '恩奇都-Lancer'];
// 地點×角色 氛圍標籤(資料驅動，往陣列塞一筆 SEED_SERVANTS 的 id 就能加，不動抽選邏輯)：
//   查無標籤或抽不中標籤池時退回全女性保底池KANSHOU_ENCOUNTER_FEMALE_IDS_；不含
//   KANSHOU_SUMMON_BLOCKED_IDS_裡暫時移出的id，避免巧遇到根本無法被正式召喚入駐的人。
const KANSHOU_LOCATION_TAGS_ = {
  '河邊小徑': ['斯卡哈-Lancer'],
  '商店街': ['美遊-Saber', '藤村大河-Master'],
  '古老神社': ['美狄亞-Caster'],
  '社區公園': ['小黑-Archer'],
  '咖啡廳': ['阿爾托莉雅-Saber'],
  '深夜便利店': ['遠坂凜-Master']
};
// 🏷️ 2026-07「移動過去 他們必須是要在打工或是消費活動...不然聊一聊會不會忘記他是在工作」玩家
//   定案：商業性質地點給一句「當下在做什麼」的輕量敘事引子，讓AI對「為什麼她在這個店裡」有個
//   合理交代、且整回合對話都能維持一致(不需要持久狀態——每回合都直接依她當下真實LOC現查現算，
//   本來就不會忘記；純寫死的地點→活動對照表，沒有寫死的地點沒有這句提示，AI自然發揮，不受限)。
const KANSHOU_LOCATION_ACTIVITY_ = {
  '咖啡廳': '正在這裡打工，忙著沖泡咖啡、招呼客人',
  '深夜便利店': '正在這裡打工值班，忙著上架與結帳',
  '商店街': '正在這裡逛街購物，挑揀著攤位上的東西',
  '書店二樓': '正在這裡挑書、翻閱架上的書籍'
};
// kanshouRollEncounter_的保底池：純女性名單(衛宮士郎-Master仍整個移出巧遇/召喚相關名單)。
//   不含KANSHOU_SUMMON_BLOCKED_IDS_暫時移出的id。
const KANSHOU_ENCOUNTER_FEMALE_IDS_ = ['阿爾托莉雅-Saber', '美杜莎-Rider', '美狄亞-Caster', '斯卡哈-Lancer', '美遊-Saber', '小黑-Archer', '遠坂凜-Master', '伊莉雅絲菲爾-Master', '間桐櫻黑化-Master', '藤村大河-Master'];
// 同地點AI詳細卡片上限(見actionPlay的partyRows)——同地點的人湊在一起時的prompt篇幅上限。
const KANSHOU_PARTY_DETAIL_CAP_ = 5;
// 橋段庫：GAS先決定「觸發條件」與「這次走向」，AI只負責照著選中的走向演出具體細節，玩家不必
//   自己打字下劇本。之後想加新橋段，往這裡加一筆即可，不必另開一條平行的敘事管線。branches
//   依bond由高到低排列，取第一個bond達標的當作這次走向。
const KANSHOU_SCENE_EVENTS_ = {
  夜襲: {
    branches: [
      { min: 60, tag: '先是一驚，隨即化為驚喜，帶著歡喜迎接這個不速之客' },
      { min: 30, tag: '嚇了一跳、又驚又羞，嘴上抵抗、卻沒有真的推拒或喊人' },
      { min: -100, tag: '被嚇得繃緊神經、下意識帶著防備，需要玩家主動放軟才能卸下戒心' }
    ]
  },
  // 跟夜襲同一套「走進同住人房間」觸發框架，只是時段換成清晨——她此刻還在賴床，好感夠高才會
  //   演成黏人不想起床。
  賴床叫醒: {
    branches: [
      { min: 80, tag: '睡眼惺忪卻格外黏人，緊抓著不放，一副也想拉你一起賴床、捨不得起身的樣子' },
      { min: 40, tag: '被看見還沒睡醒的樣子有些不好意思，睡意未消卻嘴硬要趕人起床' },
      { min: -100, tag: '被突然喚醒嚇了一跳，睡意瞬間清醒、有點防備地拉起被子撐住距離' }
    ]
  }
};
// 「同住人房間橋段」依時段對應不同事件(資料驅動，加新時段往這裡加一組band:eventKey即可)：
//   深夜=夜襲、清晨=賴床叫醒。
const KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_ = { '深夜': '夜襲', '清晨': '賴床叫醒' };
// 依bond從KANSHOU_SCENE_EVENTS_挑出這次橋段該走的分支(資料驅動，橋段本身不寫死走向)。
function kanshouRollSceneBranch_(eventKey, bond) {
  const ev = KANSHOU_SCENE_EVENTS_[eventKey];
  if (!ev) return null;
  return ev.branches.find(b => bond >= b.min) || ev.branches[ev.branches.length - 1];
}
// 修過的bug：kanshouRollDailyLocation_原本深夜/清晨的homeBias會直接回傳玩家自己家的房間，
//   讓不在場的人溜進玩家家裡——改成每位英靈自己的住處(資料驅動，同KANSHOU_LOCATION_TAGS_
//   寫法)，已同步登記進KANSHOU_LOCATIONS_(region:'visit')成為可造訪的真實地點；也是夜襲/
//   賴床叫醒橋段候選地點的唯一真實來源(見actionPlay)。查無資料(如玩家原創英靈)退回通用值
//   「自己的住處」——這個值刻意不登記進KANSHOU_LOCATIONS_，多位角色共用同一泛用字串會混淆
//   是哪一位，故維持不可造訪。
const KANSHOU_HERO_HOME_ = {
  '美狄亞-Caster': '隱蔽的工房', '斯卡哈-Lancer': '島嶼道場',
  '美遊-Saber': '埃德費爾特宅邸', '小黑-Archer': '愛因茲貝倫城',
  '遠坂凜-Master': '遠坂邸', '伊莉雅絲菲爾-Master': '愛因茲貝倫城', '藤村大河-Master': '藤村家'
};
// 🏷️ MEMORY標記存取器【邂逅】：逗號分隔的巧遇過姓名清單，去重、僅供「似曾相識」氛圍參考——
//   同行隊伍成員的好感/關係走既有 REL_TAG/BOND，這裡只記路人巧遇過誰，不重複記錄。
//   比照 getOutfit_/setOutfit_(Core_Settings.gs)同款「清除舊值再整段append」寫法。
function getKanshouMetSet_(memory) {
  const m = String(memory || "").match(/【邂逅】([^｜【】]*)/);
  return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
}
function addKanshouMet_(memory, name) {
  const s = String(memory || "");
  const set = getKanshouMetSet_(s);
  if (set.includes(name)) return s;
  set.push(name);
  const cleaned = s.replace(/｜?【邂逅】[^｜【】]*/g, "");
  return (cleaned ? cleaned + "｜" : "") + "【邂逅】" + set.join(',');
}
// 巧遇抽選共用邏輯(70%機率)：「出門走走」按鈕跟「原地問還有誰」共用同一套加權隨機。查無
//   標籤地點退回全池保底。excludeIds：已正式召喚過的英靈已有真實好感記錄，不該又以「陌生人」
//   身分重複出現，故排除在骰池外。
function kanshouRollEncounter_(locName, excludeIds) {
  const excl = excludeIds || [];
  const tagPool = KANSHOU_LOCATION_TAGS_[locName] || [];
  const basePool = tagPool.length ? tagPool : KANSHOU_ENCOUNTER_FEMALE_IDS_;
  const pool = basePool.filter(id => !excl.includes(id));
  if (!pool.length || Math.random() >= 0.7) return null;
  const pickId = pool[Math.floor(Math.random() * pool.length)];
  return SEED_SERVANTS.find(h => h.id === pickId) || null;
}
// 依真名反查SEED_SERVANTS的hero物件(共用小helper，避免kanshouRollDailyLocation_/結束一天房間
//   分配各自重複寫一次同款find邏輯)。
function kanshouHeroIdByName_(heroName) {
  const hero = SEED_SERVANTS.find(h => kanshouNameCandidates_(h.realName).includes(heroName));
  return hero ? hero.id : null;
}
// 同住人深夜/清晨睡不著出門走走的機率，獨立於一般英靈的homeBias，資料只存一處。
// 幫「不在身邊」的英靈決定當下要去哪——反查KANSHOU_LOCATION_TAGS_有沒有標到這位英靈，有就
//   加權隨機挑一個常去地點，沒標到就全地點隨機挑。hour：深夜/清晨時段大機率改回「她自己原本
//   就有的住處」(KANSHOU_HERO_HOME_，查無就退回通用的「自己的住處」)。
function kanshouRollDailyLocation_(heroName, hour) {
  const heroId = kanshouHeroIdByName_(heroName);
  if (hour !== undefined && hour !== null) {
    const band = timeBand_(hour);
    const homeBias = band === '深夜' ? 0.85 : (band === '清晨' ? 0.5 : 0);
    if (homeBias > 0 && Math.random() < homeBias) {
      return (heroId && KANSHOU_HERO_HOME_[heroId]) || '自己的住處';
    }
  }
  const haunts = heroId ? Object.keys(KANSHOU_LOCATION_TAGS_).filter(loc => KANSHOU_LOCATION_TAGS_[loc].includes(heroId)) : [];
  // 🌙 全地點保底池排除'room'分區(玩家自己的房間)——不同行的英靈不該隨機骰進玩家臥室，那裡
  //   只能靠「拜訪」主動走進去，不是隨機亂晃能撞到的地方；'home'分區(共用生活空間，客廳/廚房
  //   等)不算私人，維持可被隨機骰中。
  const pool = haunts.length ? haunts : KANSHOU_LOCATIONS_.filter(l => l.region !== 'room').map(l => l.name);
  return pool[Math.floor(Math.random() * pool.length)];
}
// 真正的西曆年/月/日(每年固定365天、不算閏年，遊戲用途夠精準)，只抓3年區間(見actionPlay的
//   advanceHours上限)不追求無限年份。Day1固定對應12月28日——28/29/30三天日常後，第4天自然
//   就是KANSHOU_FESTIVALS_裡的跨年夜12/31，不必特地跳。
const KANSHOU_CAL_START_MONTH_ = 12, KANSHOU_CAL_START_DAY_ = 28;
const KANSHOU_DAYS_IN_MONTH_ = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const KANSHOU_FESTIVALS_ = [
  { key: 'newyear', name: '新年初一', month: 1, day: 1 },
  { key: 'valentine', name: '情人節', month: 2, day: 14 },
  { key: 'qixi', name: '七夕', month: 7, day: 7 },
  { key: 'midautumn', name: '中秋節', month: 9, day: 15 },
  { key: 'xmas', name: '聖誕節', month: 12, day: 25 },
  { key: 'nye', name: '跨年夜', month: 12, day: 31 }
];
// 某月日距離「當年1/1」是第幾天(0-based)，供年/月/日互換共用。
function kanshouDoyOffset_(month, day) {
  let off = 0;
  for (let m = 0; m < month - 1; m++) off += KANSHOU_DAYS_IN_MONTH_[m];
  return off + (day - 1);
}
// absDay(從Day1累積的天數) → {year, month, day}，Day1固定對應KANSHOU_CAL_START_MONTH_/DAY_。
function kanshouAbsDayToDate_(absDay) {
  const startOff = kanshouDoyOffset_(KANSHOU_CAL_START_MONTH_, KANSHOU_CAL_START_DAY_);
  const totalOff = startOff + (Math.max(1, absDay) - 1);
  const year = Math.floor(totalOff / 365) + 1;
  let doy = totalOff % 365;
  let month = 0;
  while (doy >= KANSHOU_DAYS_IN_MONTH_[month]) { doy -= KANSHOU_DAYS_IN_MONTH_[month]; month++; }
  return { year: year, month: month + 1, day: doy + 1 };
}
// 算「從現在」到「下一次」某月日前一天早上6點的小時數(2026-07玩家定案：提前一天抵達，讓
//   敘事能帶出「明天才是節慶」的期待感，而非直接落在節慶當天)。已經錯過這次(節慶前一天6點已過)
//   就自動算成明年(hours<=0時+365天)。
function kanshouHoursUntilDate_(curDay, curHour, targetMonth, targetDay) {
  const startOff = kanshouDoyOffset_(KANSHOU_CAL_START_MONTH_, KANSHOU_CAL_START_DAY_);
  const curDoy = (startOff + (curDay - 1)) % 365;
  const targetDoy = kanshouDoyOffset_(targetMonth, targetDay) - 1; // 節慶前一天
  let deltaDays = targetDoy - curDoy;
  if (deltaDays < 0) deltaDays += 365;
  let hours = deltaDays * 24 + 6 - curHour;
  if (hours <= 0) hours += 365 * 24;
  return hours;
}

// 「跳到時段」：GAS算好差幾小時再丟進既有advanceHours管線，跟跳到節慶(kanshouHoursUntilDate_)
//   同一種「單一真實來源在後端」寫法。已在目標時段時一律跳「下一次」。startHour對應
//   timeBand_(Time_World.gs)的5段分界，兩處改動要保持同步。
const KANSHOU_TIME_BANDS_ = [
  { key: '清晨', label: '清晨', startHour: 5 },
  { key: '午後', label: '午後', startHour: 11 },
  { key: '黃昏', label: '黃昏', startHour: 17 },
  { key: '夜', label: '夜晚', startHour: 20 },
  { key: '深夜', label: '深夜', startHour: 0 }
];
function kanshouHoursUntilBand_(curHour, targetStartHour) {
  let diff = targetStartHour - curHour;
  if (diff <= 0) diff += 24; // 已在該時段內也跳下一次，不回傳0
  return diff;
}
// 「跳到時段」＋「時段行動」按鈕都需要前端知道現在幾點——這裡統一格式化成單一真實來源，
//   buildClientState_/actionPlay的回應都呼叫這支，不各自重複拼字串。
// 🩹 2026-07玩家「這要顯示幾年幾月幾號」定案：label從抽象的「第X日」改成實際年月日(跟敘述
//   文字${newDate.year}年${newDate.month}月${newDate.day}日同一種格式)，跳節慶/大跳躍後玩家
//   能親眼確認日期真的有推進，不會看起來像卡住不動。
function kanshouClockInfo_(pcRow) {
  const day = parseInt(pcRow[COL.PC.DAY]) || 1;
  const hour = (pcRow[COL.PC.HOUR] === "" || pcRow[COL.PC.HOUR] == null) ? 8 : (parseInt(pcRow[COL.PC.HOUR]) || 0);
  const band = timeBand_(hour);
  const d = kanshouAbsDayToDate_(day);
  return { day: day, hour: hour, band: band, label: d.year + "年" + d.month + "月" + d.day + "日・" + ("0" + hour).slice(-2) + ":00・" + band };
}

// 結束一天(準備就寢)時的機率事件，命中就先不推進日期、改讓前端跳出開門/不予理會。
const KANSHOU_KNOCK_CHANCE_ = 0.2;  // 每次「結束一天」的敲門機率

// 好感≥80觸發同床共枕的那次結束一天，順手記一筆「今晚共度良宵的對象」，下一回合(不論玩家做
//   什麼)讀一次就清掉(一次性旗標)，餵進提示詞當【晨間餘韻】引子。刻意不斷言「一定發生了」，
//   交給AI依上一回合實際演出內容判斷要不要接續。
var KANSHOU_MORNING_AFTER_TAG_ = makeTextTag_('晨間餘韻');
// Phase3 輕量小事件：抵達新地點時20%機率抽一顆短句靈感種子注入提示詞，純粹給AI參考的引子
//   (非預寫劇本、非強制發生)。分三類：日常可愛/曖昧小互動恆定開放，色氣類僅driveOn開啟時抽到。
const KANSHOU_EVENT_SEEDS_ = {
  daily: [
    '風吹起了一片落葉，剛好飄落在兩人之間',
    '路過的小攤傳來熟悉的香氣，勾起了些許食慾',
    '天色忽然轉陰，似乎快要下雨了',
    '不遠處有隻貓懶洋洋地曬著太陽，引人多看兩眼',
    '手機或懷錶提醒了某個早已被遺忘的小約定'
  ],
  ambiguous: [
    '不經意的肢體碰觸，讓兩人都是一愣',
    '對方今天的打扮似乎特別用心，讓人忍不住多看了兩眼',
    '一陣沉默後，兩人的視線恰好對上',
    '距離比平常靠近了一些，誰都沒有主動拉開',
    '對方忽然說了句意味不明的話，讓人心跳漏了一拍'
  ],
  spicy: [
    '氣氛忽然變得曖昧，空氣中彷彿有什麼一觸即發',
    '對方湊近耳邊，說話時的氣息帶著明顯的試探',
    '衣衫不經意地滑落了些許，誰都沒急著整理',
    '一個大膽的舉動，讓場面瞬間升溫'
  ]
};
function kanshouRollEvent_(driveOn) {
  if (Math.random() >= 0.2) return null;
  const pool = driveOn ? ['daily', 'ambiguous', 'spicy'] : ['daily', 'ambiguous'];
  const cat = pool[Math.floor(Math.random() * pool.length)];
  const seeds = KANSHOU_EVENT_SEEDS_[cat];
  return seeds[Math.floor(Math.random() * seeds.length)];
}
// 🏷️ MEMORY標記存取器【邂逅中】：這次到訪、還留在場邊可持續互動的巧遇對象(存hero id，單一值)——
//   跟永久性的【邂逅】(邂逅過的名單，不會清除)不同，這個是「這次到訪期間」的暫時狀態，玩家移動
//   離開該地點時清除(換地點＝這段緣分結束，下次到訪重新擲)。比照 getOutfit_/setOutfit_ 同款寫法。
function getKanshouActiveEncounter_(memory) {
  const m = String(memory || "").match(/【邂逅中】([^｜【】]*)/);
  return m ? m[1].trim() : "";
}
function setKanshouActiveEncounter_(memory, heroId) {
  const s = String(memory || "");
  if (/【邂逅中】[^｜【】]*/.test(s)) return s.replace(/【邂逅中】[^｜【】]*/, "【邂逅中】" + heroId);
  return (s ? s + "｜" : "") + "【邂逅中】" + heroId;
}
function clearKanshouActiveEncounter_(memory) {
  return String(memory || "").replace(/｜?【邂逅中】[^｜【】]*/g, "");
}
// MEMORY標記存取器【住所】：玩家自訂的「家」顯示名稱，查無標記時預設「衛宮宅」(鎖定世界觀
//   預設值，玩家仍可隨時改名)，比照 getOutfit_/setOutfit_ 同款「清除舊值再整段append」寫法。
function getKanshouHomeName_(memory) {
  const m = String(memory || "").match(/【住所】([^｜【】]*)/);
  const nm = m ? m[1].trim() : "";
  return nm || "衛宮宅";
}
function setKanshouHomeName_(memory, name) {
  const s = String(memory || "");
  const cleaned = s.replace(/｜?【住所】[^｜【】]*/g, "");
  const safe = String(name || "").trim().slice(0, 12) || "衛宮宅";
  return (cleaned ? cleaned + "｜" : "") + "【住所】" + safe;
}
// 部分英靈殿角色的 realName 帶括號附註(如「間桐櫻（黑化）」)，AI 敘事自然只會用括號前後其中
//   一段稱呼TA，但 rel_changes[].target 等比對要求逐字完全相符——會悄悄比對失敗、整條被跳過。
//   抽出候選字串(全名/括號前/括號內)供比對，不用改動任何一位角色的既有 realName 資料。
function kanshouNameCandidates_(fullName) {
  const s = String(fullName || "").trim();
  const m = s.match(/^(.*?)[（(]([^（()）]*)[）)]\s*$/);
  if (!m) return [s];
  const before = m[1].trim(), inside = m[2].trim();
  return [s, before, inside].filter(Boolean);
}

function actionPlay(userData, pcId, sheets) {
  const userMsg = userData.message || ""; // 📅 endDay 呼叫不一定會帶 message，防呆避免下方 .includes 炸掉

  // 慾海(KPC_ 御主)專用引擎：鑑賞玩家 pcId 恆為 KPC_ 前綴，全專案已無路徑呼叫這裡走solo——
  //   入口直接擋下非 KPC_ 呼叫，函式其餘部分永遠當作鑑賞情境處理，不再分支。
  if (String(pcId || "").indexOf("KPC_") !== 0) return JSON.stringify({ text: "此功能僅限鑑賞使用。", people: [] });
  const driveOn = (userData.drive === true || String(userData.drive) === "true");
  // 巧遇開關：前端「出門走走」面板可關閉「路上巧遇陌生人」——只影響下方隨機巧遇擲骰，不影響
  //   已在場的【邂逅中】對象持續互動、也不影響同行隊伍成員。
  const encounterOn = !(userData.encounter === false || String(userData.encounter) === "false");

  const formatPref = (str) => {
    let arr = String(str || "").split('、');
    // 喜好與厭惡是常態情報，全面開放給 AI 參考
    return `[表象]${arr[0] || "無"} [內裡]${arr[1] || "無"} [喜歡]${arr[2] || "無"} [討厭]${arr[3] || "無"}`;
  };

  // [自稱] 這格內容通常已是「自稱「我」」這類完整片語，跟敘事視角說明的「我」字面相鄰容易混淆
  //   (小模型尤其)，標籤加註明確限定範圍，比照 servantCard_ 的修法。
  const formatTrait = (str) => {
    let arr = String(str || "").split('、');
    return `[外貌]${arr[0] || "無"} [氣質舉止]${arr[1] || "無"} [台詞自稱(僅其本人引號內用，非旁白視角)]${arr[2] || "無"} [卸下心防的私密一面]${arr[3] || "無"}`;
  };


  let pcData = sheets.pc.getDataRange().getValues();

  const pcIndex = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pcIndex === -1) return "查無此人";
  const pc = pcData[pcIndex];
  const pcName = pc[COL.PC.NAME];
  let curL = pc[COL.PC.LOC];
  // ⏰ 2026-07「推進時間」玩法：鑑賞借用solo既有的COL.PC.DAY/HOUR欄位存自己的時鐘(兩軌從不共用
  //   同一個game_id，欄位互不干擾)，不另開新欄。查無值(舊存檔/尚未跑過這輪改動)時給預設(Day1 08:00)。
  let curDay = parseInt(pc[COL.PC.DAY]) || 1;
  let curHour = (pc[COL.PC.HOUR] === "" || pc[COL.PC.HOUR] == null) ? 8 : (parseInt(pc[COL.PC.HOUR]) || 0);
  let jumpFest = null; // 🎊 有跳到節慶時記著，餵進下方提示詞當氛圍靈感(見★【氛圍靈感·非強制】)

  // 鑑賞地點移動：前端點選地點按鈕時帶 moveTarget，跟一般對話同一次 round-trip 解決——比對
  //   KANSHOU_LOCATIONS_ 合法地點清單，查無效比對一律當成普通對話。
  const moveTarget = KANSHOU_LOCATIONS_.find(l => l.name === String(userData.moveTarget || "").trim());
  const moveName = moveTarget ? moveTarget.name : "";
  let finalUserMsg = moveTarget
    ? `【玩家意圖】：走向了「${moveName}」，四處看看那裡有什麼、有沒有遇見誰。`
    : `【玩家意圖】：${userMsg}`;

  // 鑑賞世界觀明文禁止任何戰鬥/血量變化/死亡威脅，故不帶 solo 戰鬥引擎的殘留概念(擊倒/復活/
  //   戰敗虛假之夢/剛結盟NPC排除等)。
  const dirtyPcRows = new Set();
  dirtyPcRows.add(pcIndex); // 玩家本人一定會被處理到，先加進去

  const currentAmbition = pc[COL.PC.INTENT] ? String(pc[COL.PC.INTENT]).trim() : "尚無明確目標，隨遇而安。";
  // 玩家自己的換裝(玩家UI設定或AI依outfit_change更新)，比照【同行夥伴】卡片(partyDetailsArr)
  //   同款「裝扮:XXX(當前服裝·五官體態不變)」格式補上，AI 才能讀到當前實際服裝，而非憑空假設。
  const myOutfit = getOutfit_(pc[COL.PC.MEMORY]);
  // 晨間餘韻：讀一次(上一回合結束一天留下的旗標，若有)就立刻清掉，只讓「緊接著的下一回合」
  //   吃到這個提示詞引子，不論這回合玩家做什麼(聊天/移動/購物皆可)。
  const morningAfterNames = KANSHOU_MORNING_AFTER_TAG_.get(pc[COL.PC.MEMORY]);
  if (morningAfterNames) pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');

  // 實例化：只取自己 game_id 世界內、同地點的人（御主無 game_id 時不過濾，相容舊角色）
  const myGameId = pc && pc[COL.PC.GAME_ID] ? String(pc[COL.PC.GAME_ID]) : "";
  const sameGame = (r) => !myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId;

  // 橋段·夜襲/賴床叫醒：候選人只認「這個地點是不是某位英靈自己原本就有的住處(KANSHOU_HERO_
  //   HOME_)、且真的有人LOC剛好等於這裡」，不再靠「客房」這種房東房客框架——半夜/清晨走進她
  //   自己家、她剛好在，就有機會觸發。按鈕(roomEventOffer)在候選人存在期間持續可用，玩家點
  //   下去(userData.roomEventAccept)才真正骰一次走向。
  const kanshouRoomEventTargetLoc_ = moveTarget ? moveName : curL;
  const kanshouRoomEventKey_ = KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_[timeBand_(curHour)];
  let kanshouRoomEventCandidate_ = null;
  const kanshouHomeLocs_ = Object.values(KANSHOU_HERO_HOME_);
  if (kanshouRoomEventKey_ && kanshouHomeLocs_.includes(kanshouRoomEventTargetLoc_)) {
    const _reIdx = pcData.findIndex((r, i) => i !== pcIndex && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC] || "").trim() === kanshouRoomEventTargetLoc_);
    if (_reIdx !== -1) kanshouRoomEventCandidate_ = { eventKey: kanshouRoomEventKey_, hero: { realName: String(pcData[_reIdx][COL.PC.NAME]) }, idx: _reIdx };
  }
  // 玩家按下按鈕(roomEventAccept帶姓名，第二道防線比對姓名確實吻合candidate，防直打API帶假名字)：
  //   才真的依bond骰一次走向、寫進提示詞；不點按鈕的話這個字串維持空白，narration完全走一般對話。
  let kanshouRoomEventStr = "";
  if (userData.roomEventAccept && kanshouRoomEventCandidate_ && kanshouNameCandidates_(kanshouRoomEventCandidate_.hero.realName).includes(String(userData.roomEventAccept).trim())) {
    const { eventKey: reEventKey, hero: reHero, idx: reIdx } = kanshouRoomEventCandidate_;
    const reBond = parseInt(pcData[reIdx][COL.PC.BOND]) || 0;
    const reBranch = kanshouRollSceneBranch_(reEventKey, reBond);
    if (reBranch) {
      const reVerb = reEventKey === '夜襲' ? '深夜靠近了' : '清晨靠近了還在賴床的';
      kanshouRoomEventStr = `\n★【橋段·${reEventKey}(GAS已骰定這次走向，AI只需依此演出，不必徵詢玩家、也不必逐字照抄下方措辭)】：${reVerb}『${reHero.realName}』，她此刻的反應走向是——${reBranch.tag}。依她的既有性格詮釋這個走向具體要怎麼表現、講什麼話，細節全由你發揮，但情緒基調不要偏離這個走向。`;
      finalUserMsg = reEventKey === '夜襲' ? `【玩家意圖】：靠近了『${reHero.realName}』，似乎想更進一步。` : `【玩家意圖】：伸手想輕輕叫醒還在賴床的『${reHero.realName}』。`;
      if (reEventKey === '夜襲' && reBranch.min >= 60) pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], reHero.realName);
    }
  }

  // 結束一天(準備就寢)前先擲一次骰，命中就不執行日期推進，直接回傳knockEvent讓前端跳出
  //   「開門/不予理會」——選「不予理會」帶skipKnockCheck重送一次(跳過判定，直接推進日期)；
  //   選「開門」則帶knockAccept把訪客接來(見下)。候選池限「已建立資料列、不在玩家所在地」的
  //   舊識，不會憑空生出一個從未召喚過的陌生人半夜敲門。
  if (userData.endDay === true && !userData.skipKnockCheck) {
    const knockPool = pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.LOC] || "").trim() !== curL && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
    if (knockPool.length && Math.random() < KANSHOU_KNOCK_CHANCE_) {
      const visitor = knockPool[Math.floor(Math.random() * knockPool.length)];
      return JSON.stringify({ text: "正準備歇下的時候，忽然聽見一陣輕輕的敲門聲……", knockEvent: String(visitor[COL.PC.NAME]), people: [] });
    }
  }

  // 開門迎接深夜訪客(knockEvent選擇「開門」)：把訪客接來玩家現在的位置，本回合可指名互動，
  //   不推進日期——訪客只是這回合出現，玩家想睡再自己重新點一次「結束一天」即可。
  let kanshouKnockGuestName = "";
  if (userData.knockAccept) {
    const guestName = String(userData.knockAccept).trim();
    const guestIdx = pcData.findIndex(r => kanshouNameCandidates_(r[COL.PC.NAME]).includes(guestName) && String(r[COL.PC.LOC] || "").trim() !== curL && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
    if (guestIdx !== -1) {
      pcData[guestIdx][COL.PC.LOC] = curL;
      dirtyPcRows.add(guestIdx);
      kanshouKnockGuestName = String(pcData[guestIdx][COL.PC.NAME]);
      finalUserMsg = `【玩家意圖】：打開了門，是「${kanshouKnockGuestName}」深夜來訪。`;
    }
  }

  // 結束一天：忽略玩家打的文字，改用系統組好的合成訊息——複用actionPlay整條既有敘事管線
  //   (在場驗證/NSFW規則/rel_changes/intimacy_feedback全部照常跑)，不另開一條平行路徑。
  //   不在身邊的英靈：GAS直接幫她們決定隔天去哪(kanshouRollDailyLocation_)，玩家不用手動指派。
  // 只有結束一天(真的要過夜)才判定好感≥80能否同行睡覺，推進時間不觸發(那不是「睡下去」的
  //   動作)。門檻由GAS算好，AI只負責依角色性格自然演繹要不要跨出這一步。
  let intimateNightNames = [];
  if (userData.endDay === true) {
    // 結束一天固定跳到「隔天清晨6點」(不論此刻幾點)，時鐘跟著寫回，往後「推進時間」、鑑賞
    //   主敘事的時段感提示才有真實的日/時可讀。
    curDay = curDay + 1;
    curHour = 6;
    pcData[pcIndex][COL.PC.DAY] = curDay;
    pcData[pcIndex][COL.PC.HOUR] = curHour;
    // 不分「同行/不同行」，所有已存在的英靈結束一天都依自己的生活重新決定要去哪——唯一例外
    //   是好感≥80且此刻確實跟玩家同地點的人，直接留在玩家房間過夜(同床共枕)。
    const allEstablished = pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
    intimateNightNames = allEstablished.filter(r => (parseInt(r[COL.PC.BOND]) || 0) >= 80 && String(r[COL.PC.LOC] || "").trim() === curL).map(r => r[COL.PC.NAME]);
    if (intimateNightNames.length) pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], intimateNightNames.join('、'));
    // 玩家自己不管白天晃到哪，結束一天一律強制拉回自己房間——「玩家永遠有路可退」的安全閥。
    const kanshouMyRoomLoc_ = '我的房間';
    pcData[pcIndex][COL.PC.LOC] = kanshouMyRoomLoc_;
    dirtyPcRows.add(pcIndex);
    pcData[pcIndex][COL.PC.MEMORY] = clearKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY]);
    curL = kanshouMyRoomLoc_;
    allEstablished.forEach(r => {
      const idx = pcData.indexOf(r);
      pcData[idx][COL.PC.LOC] = intimateNightNames.includes(r[COL.PC.NAME]) ? kanshouMyRoomLoc_ : kanshouRollDailyLocation_(r[COL.PC.NAME], curHour);
      dirtyPcRows.add(idx);
    });
    finalUserMsg = `【一天結束】夜幕降臨，${intimateNightNames.length ? `跟『${intimateNightNames.join('、')}』一起` : ""}回到房間安頓下來，今天到此為止，明天又是新的一天。`;
  } else {
    // 推進時間：跟結束一天不同——不強制拉玩家回家，只是讓時鐘往前跳N小時；不在身邊的英靈依
    //   新時刻重骰去向，同行同伴不受影響。上限抓3年區間防呆，不做逐小時模擬(跳多久都是O(1))。
    let advanceHours = Math.max(0, Math.min(parseInt(userData.advanceHours) || 0, 24 * 365 * 3));
    // 🎊「跳到節慶」：advanceHours未指定時，改由jumpFestival算出「到下一次該節慶還有幾小時」，
    //   算好就丟進同一套邏輯，不重複寫一次時鐘推進/地點重骰。
    if (!advanceHours && userData.jumpFestival) {
      jumpFest = KANSHOU_FESTIVALS_.find(f => f.key === String(userData.jumpFestival)) || null;
      if (jumpFest) advanceHours = kanshouHoursUntilDate_(curDay, curHour, jumpFest.month, jumpFest.day);
    }
    // ⏰「跳到時段」：跟跳到節慶互斥判斷同一順位，advanceHours/jumpFestival都沒指定時才輪到它。
    let jumpBand = null;
    if (!advanceHours && !jumpFest && userData.jumpBand) {
      jumpBand = KANSHOU_TIME_BANDS_.find(b => b.key === String(userData.jumpBand)) || null;
      if (jumpBand) advanceHours = kanshouHoursUntilBand_(curHour, jumpBand.startHour);
    }
    if (advanceHours > 0) {
      const clk = { day: curDay, hour: curHour };
      rollHours_(clk, advanceHours);
      curDay = clk.day; curHour = clk.hour;
      pcData[pcIndex][COL.PC.DAY] = curDay;
      pcData[pcIndex][COL.PC.HOUR] = curHour;
      // 修過的bug：原本沒排除「當下正跟玩家同地點」的人，導致正在互動中的同伴被時間推進的
      //   重骰隨機傳送走、玩家本人位置卻沒變。改成LOC此刻等於curL(正在場)的人不重骰、原地
      //   不動，只有「不在玩家身邊」的人才依時刻重新決定去向。
      const allEstablishedForTime = pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() !== String(curL || "").trim());
      allEstablishedForTime.forEach(r => {
        const idx = pcData.indexOf(r);
        pcData[idx][COL.PC.LOC] = kanshouRollDailyLocation_(r[COL.PC.NAME], curHour);
        dirtyPcRows.add(idx);
      });
      const newDate = kanshouAbsDayToDate_(curDay);
      finalUserMsg = jumpFest
        ? `【時間推進】時間一路快轉，明天就是${jumpFest.name}了——此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${("0" + curHour).slice(-2)}:00・${timeBand_(curHour)}。`
        : jumpBand
          ? `【時間推進】時間悄悄流轉到了${jumpBand.label}，此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${("0" + curHour).slice(-2)}:00・${timeBand_(curHour)}。`
          : `【時間推進】${advanceHours}個小時悄悄過去，此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${("0" + curHour).slice(-2)}:00・${timeBand_(curHour)}。`;
    }
  }
  const curDateObj_ = kanshouAbsDayToDate_(curDay); // 供下方🕰️提示詞用，只算一次不重複呼叫

  // 🎨 2026-07「為何偶遇沒有女性」玩家反映：此局已經正式召喚過的英靈(不論是否仍同行)不該又以
  //   「陌生人」身分重複出現(如SABER已同行時，路上不該再巧遇一位不具名的SABER)。用真名候選比對
  //   (kanshouNameCandidates_，容忍括號附註差異)反查對應的SEED_SERVANTS id 清單餵給抽選函式排除。
  const kanshouEstablishedNames_ = new Set(pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r)).map(r => String(r[COL.PC.NAME]).trim()));
  const kanshouExcludeIds_ = SEED_SERVANTS.filter(h => kanshouNameCandidates_(h.realName).some(c => kanshouEstablishedNames_.has(c))).map(h => h.id);

  // 移動時若目的地已經有established的人在，就不再另外擲一次陌生人巧遇(優先呈現熟人在場)。
  const kanshouSomeoneAlreadyHere_ = pcData.some((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() === String(moveName || curL || "").trim());

  // 合法地點時才寫入LOC＋抽選巧遇＋記錄邂逅名單。抽選只在「按下移動按鈕」這個瞬間跑一次，不會
  //   每句對話重算。移動不再強制拖走任何已存在的英靈(每個人都是獨立的)——想帶誰同行，交給AI
  //   敘事自然演出(見下方「玩家反向邀約」規則)。
  let kanshouEncounterHero = null, kanshouEncounterMetBefore = false, kanshouEncounterLocName = "";
  let kanshouEventSeed = null;
  if (moveTarget) {
    curL = moveName;
    pcData[pcIndex][COL.PC.LOC] = curL;
    dirtyPcRows.add(pcIndex);
    // 離開原地(換地點)＝上一段巧遇緣分結束，先清掉舊的【邂逅中】，這個新地點才重新擲一次巧遇。
    pcData[pcIndex][COL.PC.MEMORY] = clearKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY]);
    kanshouEncounterLocName = moveName;
    // 巧遇開關 + noEncounter地點(家的房間)是私人空間 + 此地已有established的人在場：三者皆需
    //   通過才擲陌生人骰。
    kanshouEncounterHero = (encounterOn && !moveTarget.noEncounter && !kanshouSomeoneAlreadyHere_) ? kanshouRollEncounter_(moveTarget.name, kanshouExcludeIds_) : null;
    if (kanshouEncounterHero) {
      pcData[pcIndex][COL.PC.MEMORY] = setKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY], kanshouEncounterHero.id);
    }
    // 🎲 Phase3 輕量小事件：每次抵達新地點才擲一次，20%機率抽一顆靈感種子注入提示詞，只是給
    //   AI參考的引子、非強制劇本(家也適用——這是同行同伴間的氛圍調味，不是陌生人巧遇)。
    kanshouEventSeed = kanshouRollEvent_(driveOn);
  } else {
    const curLocDef = KANSHOU_LOCATIONS_.find(l => l.name === String(curL || "").trim());
    if (curLocDef) {
      // 這次到訪還在場邊的巧遇對象(【邂逅中】)，只要人還沒隨著換地點離開，就持續讓AI知道可以
      //   繼續指名互動——不只是觸發那一瞬間的單回合permission，同一次到訪期間都有效。
      const activeId = getKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY]);
      if (activeId) {
        kanshouEncounterLocName = curLocDef.name;
        kanshouEncounterHero = SEED_SERVANTS.find(h => h.id === activeId) || null;
      } else if (encounterOn && !curLocDef.noEncounter && userData.lookAround === true) {
        // 前端明確的「看看四周」按鈕(lookAround:true)。目前還沒有巧遇中的對象時，用目前地點
        //   重新擲一次巧遇——跟按移動按鈕同一套加權隨機，不寫LOC(沒有移動)。noEncounter地點
        //   (家)恆不觸發此路徑。
        kanshouEncounterLocName = curLocDef.name;
        kanshouEncounterHero = kanshouRollEncounter_(curLocDef.name, kanshouExcludeIds_);
        if (kanshouEncounterHero) {
          pcData[pcIndex][COL.PC.MEMORY] = setKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY], kanshouEncounterHero.id);
        }
      }
    }
  }
  if (kanshouEncounterHero) {
    const nm = kanshouEncounterHero.realName;
    kanshouEncounterMetBefore = getKanshouMetSet_(pcData[pcIndex][COL.PC.MEMORY]).includes(nm);
    if (!kanshouEncounterMetBefore) {
      pcData[pcIndex][COL.PC.MEMORY] = addKanshouMet_(pcData[pcIndex][COL.PC.MEMORY], nm);
    }
  }


  // 「專屬稱呼」記憶點：抽成共用函式，鑑賞同伴清單(partyDetailsArr)跟其他清單一起補上，
  //   不重複貼一次解析邏輯。
  function relMemMemoryStr_(relMem) {
    const s = String(relMem || "");
    const nickMatch = s.match(/\[專屬稱呼\](.*?)(?=\| \[|$)/);
    const nickTrim = nickMatch ? nickMatch[1].trim() : "";
    const nickStr = (nickTrim && nickTrim !== "無") ? ` [專屬稱呼:${nickTrim}]` : "";
    // 態度：NPC對御主當下的臨場態度(與好感分開追蹤，見慾海律令第7條)，讓AI下筆前看得到自己
    //   上一輪演的態度，不會忽冷忽熱亂跳。
    const attMatch = s.match(/\[態度\](.*?)(?=\| \[|$)/);
    const attTrim = attMatch ? attMatch[1].trim() : "";
    const attStr = (attTrim && attTrim !== "無") ? ` [態度:${attTrim}]` : "";
    return nickStr + attStr;
  }

  // 「開放世界·背景人煙」設計：路人可自由描寫增添生活感，但不具名、不追蹤好感、不能被指名互動；
  //   真正能被指名、好感會被記錄的對象只有【在場人物】，判準是「LOC是否跟玩家目前位置一致」，
  //   不看IS_PARTY。
  // 同地點最多給KANSHOU_PARTY_DETAIL_CAP_位詳細卡片(敘事複雜度/prompt篇幅上限，不是隊伍容量)，
  //   依好感高低取前幾位；超過上限的人依然存在、依然可被特定劇情點名，只是這回合沒有詳細卡。
  const partyRows = pcData.filter(r => r !== pc && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim())
    .sort((a, b) => (parseInt(b[COL.PC.BOND]) || 0) - (parseInt(a[COL.PC.BOND]) || 0)).slice(0, KANSHOU_PARTY_DETAIL_CAP_);
  const partyMembers = partyRows.map(r => r[COL.PC.NAME]);
  let partyDetailsArr = [];
  // ⚡ 提速：dailySpeechByName_ 對每位同伴呼叫都會重新解析英靈殿快取字串，這裡在迴圈外先抓一次
  //   共用傳入，省掉重複整表解析。
  const _partyHeroCodex = partyMembers.length > 0 ? getHeroCodexCached() : null;
  partyMembers.forEach(pName => {
    // 需要 sameGame 過濾——若不同局/不同帳號剛好撞名(種子有限、AI原創從者皆可能撞)，會把別局
    //   同名者的資料塞進本局的敘事提示詞。
    const r = pcData.find(row => String(row[COL.PC.NAME]).trim() === String(pName).trim() && !String(row[COL.PC.ID]).startsWith("DEAD_") && sameGame(row));
    if (r) {
      const pOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👗 換裝：當前服裝穿著(換衣不換人；玩家UI設定或AI依outfit_change更新)
      // 鑑賞無戰鬥，HP/STATUS 恆定不變(已被 physical_state 取代)，不重複注入。
      const pMemStr = relMemMemoryStr_(r[COL.PC.REL_MEM]);
      const pMoeStr = String(r[COL.PC.INTENT] || "").trim();
      // 口吻/招牌小動作(persona.speech/tic)：召喚時已存進 MEMORY 的【口吻】【小動作】標記，直接
      //   複用 getPersonaSpeech_/getPersonaTic_ 讀取，讓角色演出招牌語癖而非千篇一律。查無時
      //   speech 退回 dailySpeechByName_(日常安全版)，tic 沒有對應日常版就留空，不退回戰時原始值。
      const pSpeech = getPersonaSpeech_(r[COL.PC.MEMORY]) || dailySpeechByName_(pName, _partyHeroCodex);
      const pTic = getPersonaTic_(r[COL.PC.MEMORY]);
      const pFlavorStr = `${pSpeech ? ` | 口吻:${pSpeech}` : ""}${pTic ? ` | 招牌小動作:${pTic}` : ""}`;
      // 純聊天好感卡在梯度上限這件事本身不會反映在數字上——GAS默默夾住漲幅，若不順便告訴AI，
      //   narration可能寫出「感情大幅推進」這種跟機制矛盾的橋段。只在卡住時才加這句提示。
      const pBond = parseInt(r[COL.PC.BOND]) || 0;
      const pChatCeiling = kanshouRelChatCeiling_(pBond);
      const pAtCeilingStr = (pChatCeiling < 100 && pBond >= pChatCeiling) ? "・單靠對話目前已到這個階段的上限，需要收到禮物才能繼續加深，這回合維持細水長流的相處基調，不要寫成關係大幅推進" : "";
      // REL_TAG的梯度字面本身沒告訴AI「該演出什麼熟悉程度」，AI容易預設熱絡口吻跟數字矛盾。
      //   只在低梯度(尚不熟識)才加一句態度提示，中高梯度不需要、也不該畫蛇添足限制發揮。
      const pRelTagStr = r[COL.PC.REL_TAG] || "點頭之交";
      const pTierToneStr = (pRelTagStr === "點頭之交") ? "，彼此才剛認識不久，口吻應保持禮貌卻略帶生疏保留，不該表現得像已相識多年的熟人或表現得過分熱絡親密"
        : (pRelTagStr === "普通朋友") ? "，交情仍屬普通朋友，可自然閒聊但仍保留一定分寸與距離感，不宜過度親密"
        : "";
      // 商業地點的「當下在做什麼」輕量引子(見上方KANSHOU_LOCATION_ACTIVITY_)，沒對照到的地點
      //   不加這句，AI自然發揮即可。
      const pActivityStr = KANSHOU_LOCATION_ACTIVITY_[curL] ? ` | 現況:${KANSHOU_LOCATION_ACTIVITY_[curL]}` : "";
      // 明講方向的「TA是你的${tag}」(而非單純「關係:${tag}」)，避免AI誤讀方向、演反成玩家服侍TA。
      partyDetailsArr.push(`【在場人物】名號:${pName} | 身世:${r[COL.PC.BACK] || "無"}${pOutfit ? ` | 裝扮:${pOutfit}(當前服裝·五官體態不變)` : ""} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])}${pFlavorStr}${pMoeStr ? ` | 萌點(反差·僅供內化):${pMoeStr}` : ""}${pActivityStr} | 關係:TA是你的${pRelTagStr}(好感:${pBond}${pMemStr}${pAtCeilingStr}${pTierToneStr})`);
    }
  });
  const PROMPT_PARTY_SYSTEM = partyDetailsArr.length > 0 ? `【目前在場人物命格詳情】:\n${partyDetailsArr.join("\n")}` : "目前這個地點沒有其他人，玩家是獨自行動的。";

  const backgroundCrowdStr = `★【開放世界·背景人煙】：這是有血有肉的開放世界，不是與世隔絕的私密結界——場景中可以自由描寫路過的行人、店員、其他顧客等不具名的背景人物，增添生活感與人煙氣息；但這些背景人物僅供氛圍點綴，【不具名、不可被指名互動、不追蹤好感或關係】。真正能被指名對話、持續互動、且好感/關係會被記錄延續的對象，僅限【目前在場人物】(與玩家同地點的已建立英靈)。`;

  // 🟢 性別配對提示，直接算好給 AI，不需要它自己推理。3人同場時先分組(與玩家同性/異性)，同組
  //   共用一句規則、只在句首列名字，避免逐一 NPC 各寫一整句規則重複。
  let genderHintStr = "";
  const presentRowsForGender = pcData.filter((r, i) => i !== 0 && r[COL.PC.ID] != pcId && r[COL.PC.LOC] === curL && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (presentRowsForGender.length > 0) {
    const playerSex = pc[COL.PC.SEX] || "未知";
    // 「異/無」(如開膛手傑克「無固定實體」)這類非二元性別值一律按女性向處理(對齊
    //   heroToKanshouRow_ 的肉體起始預設)。不開放男男配對(邀請關卡已擋)，故只有「女女」是
    //   特殊配對組，其餘一律走「依各自實際性別自然互動」。
    const sameSexF = [], others = [];
    presentRowsForGender.forEach(r => {
      const npcSexRaw = r[COL.PC.SEX] || "未知";
      const npcSex = (npcSexRaw === "男" || npcSexRaw === "女") ? npcSexRaw : "女";
      (playerSex === "女" && npcSex === "女" ? sameSexF : others).push(r[COL.PC.NAME]);
    });
    const parts = [];
    if (sameSexF.length) parts.push(`${sameSexF.join("、")}(女女配對)：純女女之愛，禁插入式陽具動作，以手指/舌頭/器物替代`);
    if (others.length) parts.push(`${others.join("、")}：依各自實際性別自然互動`);
    genderHintStr = parts.length ? `\n★【性別配對】：${parts.join("；")}。` : "";
  }

  let pPhysicalObj = JSON.parse(pcData[pcIndex][COL.PC.PHYSICAL] || "{}");
  if (Object.keys(pPhysicalObj).length === 0) pPhysicalObj = { "狀態": "如常" };
  // 提示詞只給前5個(即使實際存到30個)，省字數；真正的技巧清單仍完整存在MEMORY裡不受影響。
  let pSkills = kanshouSkillTagStr_(pcData[pcIndex][COL.PC.MEMORY]).split('、').slice(0, 5).join('、');
  // 玩家自己的換裝也要補進[情境延續]區塊(比照NPC每回合補進[名字 裝扮]行)，這是情慾場景AI主要
  //   參照的區塊，不能只在【玩家命格】看得到。
  let nsfwMemories = `\n[玩家『${pcName}』肉體]：${JSON.stringify(pPhysicalObj)}\n[身體記憶]：${pSkills}${myOutfit ? `\n[玩家『${pcName}』裝扮]：${myOutfit}（當前服裝·五官/髮色/體態不變）` : ""}`;

  // ⚡ 提速：跟上面 presentRowsForGender 是完全相同的 filter 條件，直接複用，省掉第二次整表掃描。
  let allPresentRows = presentRowsForGender;
  allPresentRows.forEach(r => {
    let npcPhysicalObj = JSON.parse(r[COL.PC.PHYSICAL] || "{}");
    if (Object.keys(npcPhysicalObj).length === 0) npcPhysicalObj = { "狀態": "如常" };
    let npcSkills = kanshouSkillTagStr_(r[COL.PC.MEMORY]).split('、').slice(0, 5).join('、');
    let relMem = r[COL.PC.REL_MEM] || "無";
    let npcOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👗 換裝：當前服裝穿著(換衣不換人·五官體態依本相；玩家UI設定或AI依outfit_change更新)
    nsfwMemories += `${npcOutfit ? `\n[${r[COL.PC.NAME]} 裝扮]：${npcOutfit}（當前服裝·五官/髮色/體態不變）` : ""}\n[${r[COL.PC.NAME]} 肉體]：${JSON.stringify(npcPhysicalObj)}\n[快照]：[技巧]${npcSkills} | [羈絆]${relMem}`;
  });

  // 巧遇者是還沒被召喚、沒有資料列的陌生人，明講「這次到訪期間的系統例外」，避免跟下方
  //   【在場驗證鐵律】(只有在場人物能被指名互動)打架，同時允許同一次到訪期間持續互動。
  // 巧遇池走的是跟 actionKanshouSummonHero(僅支援男女／女女配對)完全不同的路徑，不經過那
  //   兩處守門——僅「男御主遇男性巧遇對象」這組明講僅止於同性情誼，其餘組合一律自然發展。
  const kanshouEncounterStr = kanshouEncounterHero ? (() => {
    const p = kanshouEncounterHero.persona || {};
    const look = p.dailyLook || p.look || "";
    const words = p.dailyWords || p.words || "";
    const isMaleMale = String(pc[COL.PC.SEX]) === "男" && String(kanshouEncounterHero.gender) === "男";
    const friendshipOnly = isMaleMale ? "★TA與玩家同為男性，這段交流僅止於同性情誼／夥伴／損友式互動，不發展曖昧、戀愛或情慾內容，不做任何親密肢體接觸。" : "";
    return `\n★【本回合系統指定巧遇——這次到訪期間持續有效的例外，不受下方在場驗證鐵律限制】：『${kanshouEncounterHero.realName}』（${kanshouEncounterHero.cls}）此刻恰好也在「${kanshouEncounterLocName}」，${kanshouEncounterMetBefore ? "是已經打過照面的熟面孔" : "是初次的邂逅"}——外貌氣質:${look}／日常個性:${words}。允許TA以真實姓名登場、持續互動，這段緣分在玩家離開這個地點前都有效，TA還不是這個世界裡已經召喚存在的人物：好感/關係不追蹤記錄；若情境合適，TA也可以自然道別離開，不必勉強撐到玩家換地點。${friendshipOnly}`;
  })() : "";

  // 深夜訪客(knockAccept選擇「開門」)：她的LOC已在前面被設成curL，之後會自動出現在partyRows
  //   裡拿到完整卡片，這裡只補一句「剛敲門進來」的情境描述(卡片本身不會講這件事的來龍去脈)。
  const kanshouKnockGuestStr = kanshouKnockGuestName
    ? `\n★【情境提示】：『${kanshouKnockGuestName}』是深夜敲了門、玩家剛讓TA進來的，可以自然帶出「剛開門迎接」的情境細節，不必假裝TA本來就一直在場。`
    : "";

  const driveStr = driveOn ? `
🔥【主動掌握模式·玩家已明確開啟】：本回合起，在場同伴主動掌握節奏、推進互動——手法必須貼合她/他本人真實的性格與語癖去把玩家逼向毫無招架餘地，禁止套用固定公式或別的角色的手法；玩家若試圖迴避、轉移話題、抽身離開，同伴會依個性攔下、堵住退路、追上來，營造「想跑也跑不掉」的壓迫與心跳感。★這走向確定不可逆，不必每回合寫到終點，但每回合都要確實往前推進，不可退回平日矜持基準。注意：①主動的【形式】仍依好感高低——低好感是強勢試探/挑釁/戲弄的攻勢而非傾心示愛，高好感才不加掩飾索求；②【角色一致性鐵律】仍完全有效，禁千篇一律的霸道模板；③壓迫止於情境張力，嚴禁真正傷害玩家；④★文字尺度同步拉到最滿——這個模式下的情慾描寫可以毫不含蓄、直白露骨地放手寫，不必比照平日的留白節制，篇幅分配規則(慾海律令第4條)仍要遵守，但用詞與畫面感不必收斂。` : '';

  const PROMPT_REL = `${backgroundCrowdStr}
★【視角鎖定】：以上「在場人物」卡片內「自稱」只限她/他自己的引號台詞——通篇敘事旁白的「我」永遠、只能是玩家『${pcName}』本人，絕不可把在場任何一位角色的心境或反應誤寫成旁白第一人稱。
★【情境延續鐵律】：請繼續往後推演！${nsfwMemories}${genderHintStr}${driveStr}
🛑【角色一致性鐵律】：NPC 的反應必須【死守】其「性格」與目前「好感度」的真實落差——好感未滿 80、或性格屬於冷酷/高傲/剛烈者，依這個設定判斷此刻合理的抗拒/抵觸程度演出，不因劇情推進就無視好感度線性軟化。即便肉體有生理反應，靈魂與對話的態度仍以角色設定為準。真正的沉溺不是放棄人格，而是【用原本的人格去承受快感】——高傲者咬牙不肯示弱、虔敬者於信仰間掙扎、活潑者笑鬧裡藏羞、深情者愈發黏膩——語癖、自稱與個性在最激烈處也不崩壞，【絕對禁止】任何角色在情慾中退化成千篇一律的發情機器。`;

  // 這裡只提供正確姓名給 AI 拼字用，是否真的互動仍完全依上方【在場驗證鐵律】判斷。已有
  //   【專屬稱呼】就自然用暱稱取代真名；不影響下方 rel_changes/intimacy_feedback 仍固定要求真名。
  const npcDialoguePrompt = partyMembers.length > 0 ? `\n★【稱呼慣例】：對話/敘事中稱呼在場人物時，若該人已有【專屬稱呼】(見上方在場人物卡片)，可自然使用該暱稱取代真名，不必每次都字正腔圓喊全名；尚未發展出專屬稱呼、或情境特別鄭重深情時，仍使用真實姓名「${partyMembers.join("、")}」，不得自創真名與專屬稱呼以外的第三種稱呼。★此稱呼慣例僅供narration/對話台詞使用，與下方JSON輸出(rel_changes/intimacy_feedback)的姓名欄位無關，那兩處規則各自獨立、一律固定填真實姓名；是否互動仍依上方在場規則與各人強制互動限制判斷，非清單所有人都要出聲。` : "";


  // 鑑賞無戰鬥，御主的 HP/MP/MAX_HP/MAX_MP 這4欄從未寫入，故 prompt 不提血量/魔力數值或瀕死判斷
  //   (與世界觀、specificRules「絕對禁止血量/生命變化」皆一致)。
  const prompt = `【敘事法旨】：當前推演視角鎖定為玩家『${pcName}』(ID: ${pcId})。
${PROMPT_PARTY_SYSTEM}
【玩家命格】：名號:${pcName} 【性別:${pc[COL.PC.SEX]}】 性格:${pc[COL.PC.PREF]} | 特徵:${pc[COL.PC.TRAIT]}${myOutfit ? ` | 裝扮:${myOutfit}(當前服裝·五官體態不變)` : ""} | 軟肋:【 ${currentAmbition} 】 | 身世:${pc[COL.PC.BACK] || "來歷不明"} | 位置:${curL}

${PROMPT_REL}
★【在場驗證鐵律——最高優先級，下筆前必看】：本回合可被指名對話、持續互動、且好感/關係會被記錄延續的角色僅限【目前在場人物】(與玩家同地點的已建立英靈)；背景路人可自由描寫增添氣氛(見上方【開放世界·背景人煙】)，但一律不具名、不可被指名互動、不追蹤好感，【絕對禁止】把某個背景路人寫成有名有姓、持續登場的固定角色。唯獨玩家本回合輸入內容【明確主動】表達邀請、招呼、引入第三人等意圖時(如呼喚他人加入、開門讓人進來等)，才可讓該玩家指定或暗示的新角色登場並開始被指名互動。歷史紀錄、話題情報中提到但不在【目前在場人物】內的姓名，僅視為不在場的回憶，嚴禁無視此規則憑空召喚、穿越或讓其開口說話、出手！${kanshouEncounterStr}${kanshouKnockGuestStr}${kanshouRoomEventStr}${kanshouEventSeed ? `\n★【氛圍靈感·非強制】：可自然納入本回合場景的一個小細節——${kanshouEventSeed}。這只是引子，若跟劇情不合可完全不採用，不必刻意提及或解釋。` : ""}${jumpFest ? `\n★【節慶氛圍】：今天是「${jumpFest.name}」，narration可自然帶入應景的裝飾/活動/氣氛，不必特別報幕或解釋這個詞彙本身。` : ""}${intimateNightNames.length ? `\n★【入夜氛圍·好感門檻已達】：『${intimateNightNames.join('、')}』與你的羈絆已深(好感≥80)，今晚可以自然發展到同床共枕，依其性格自然決定要不要跨出這一步、氛圍濃烈到什麼程度，不強制每次都寫到底；好感未達此門檻的同伴，一律維持各自安睡、不越界。` : ""}${morningAfterNames ? `\n★【晨間餘韻·非強制】：昨夜與『${morningAfterNames}』或許共度了親密的時光(依上一回合實際演出的內容為準，若上次並未真的跨出那一步就當作平常的早晨)，這是新的一天第一個場景，若情境合適可以自然帶出晨間的溫馨/曖昧餘韻(如一起吃早餐、彼此害羞或黏膩的互動)，不強制一定要提及、也不需要複述昨夜細節，一切依角色個性自然發展。` : ""}
💕【鑑賞·後日談模式·最高優先級覆寫】：${partyRows.length === 0
    ? `這裡是平行世界的和平都市日常——聖杯戰爭這回事從未在這個世界發生過，眼下沒有同行的英靈在場，就是御主一人的尋常時光。`
    : partyRows.every(r => String(r[COL.PC.ID]).indexOf("KHV_") === 0)
      ? `『${partyMembers.join("、")}』是剛從英靈殿被召喚而來——這不是並肩打過聖杯戰爭的緣分，是彼此【初次相遇】的日常時光，讓相處自然生澀、依好感漸漸升溫，嚴禁暗示雙方早已相熟或曾並肩作戰。`
      : `這裡是平行世界的和平都市日常，聖杯戰爭這回事從未真正發生過，與『${partyMembers.join("、")}』共度的是尋常相處的時光，嚴禁提及聖杯爭奪或並肩作戰的往事。`
  }
🕰️現在是${curDateObj_.year}年${curDateObj_.month}月${curDateObj_.day}日・${timeBand_(curHour)}，僅供揣摩場景氛圍與時段感(如深夜靜謐、清晨慵懶、應景節氣)，不必刻意報時或提及具體數字。
★世界觀＝和平的現代都市日常：【絕對禁止】任何戰鬥、廝殺、敵人、聖杯爭奪、靈基受損、血量／生命變化、寶具對轟、死亡或威脅，世界是安全的；但節奏與親密程度依劇情、好感與玩家/同伴當下意圖自然發展，可以是散步閒聊的尋常時光，也可以是更靠近、更熱烈的相處，不強制鎖在「悠閒」基調(尤其🔥主動掌握模式開啟或情慾已自然升溫時)，讓從者貼近其官方性格自然地與御主相處互動。
★【演出而非說明】不得直述其願望／萌點／個性字面。僅可有 rel_changes(好感)，不輸出任何生命變化或戰鬥裁決。
★【地點清單】：這個世界目前只有以下這些地點存在：${KANSHOU_LOCATIONS_.map(l => l.name).join('、')}——下方location／move_proposal兩個欄位只能填這份清單裡的名字，【絕對禁止】自創或憑空發明清單以外的地名(如「一家安靜的咖啡廳」這類寫法不再允許)。
★【換場地】你可自主決定何時、換去上方清單裡的哪個地點——但【絕對禁止】無故憑空跳地點：須先在narration把移動/抵達的過程實際寫出來，location欄位才能填新地名(且必須是上方清單之一)；沒有移動就讓location原樣照抄目前地點。
★【提議換地點需玩家同意】：若這回合你判斷同伴自然而然想邀玩家換個地方，填move_proposal(地點需為上方清單之一)，narration只寫到「邀請/提議」的當下、【絕對禁止】接著寫出移動或抵達的過程，是否成行交由玩家事後決定；沒有這類意圖時move_proposal留空，不要每回合都提議。
★【玩家反向邀約】：這跟上面「AI提議」方向相反——若這回合是玩家本人主動邀同伴一起換地方，同伴的反應由你當場依其個性決定，答應就直接在這句narration裡把邀約、移動、抵達的過程一次演完並更新location(必須是上方清單之一)；不想去就自然演出委婉推辭或提出想法，location維持原樣。這種情況【不需要】走move_proposal欄位，一回合內就地判斷完畢，不必分兩段等玩家再次確認。
現在演化玩家動作：『${finalUserMsg}』${npcDialoguePrompt}

${driveOn ? `🚨【敘事終極警告·主動掌握模式】：同伴主導推進，本回合可以確實大幅向前推展——不必像平日矜持模式那樣每次都停在剛起步的瞬間，讓「步步進逼」的壓迫感真的往前走、玩家打少少字也能推進不少。但仍【絕對禁止】把這整段相處寫成「那一夜／自此／就這樣／從此」等總結收尾句，不可讓這回合讀起來像已經翻頁的完結篇章——停在「我」當下進行式的心境與情緒中，留一點空間給玩家插入反應、喊停或喘息，而非停在原地一動也不動。`
    : `🚨【敘事終極警告】：結果後必須停在「我」當下進行式的心境與情緒中，留一個未完成的動作、未說完的話或懸而未決的情緒把下一步交還玩家——【絕對禁止】寫出「那一刻／那一夜／自此／就這樣／從此」等總結收尾句，讓這回合讀起來像已經翻頁的完結篇章！`}`;

  try {
    // 🔥 平時矜持模式(driveOn=false)用跟solo共用的低延遲小模型(SOLO_MODEL)，只有主動掌握模式
    //   (driveOn=true)才切回鑑賞原本用的大型模型(AI_MODEL)——大多數回合是輕鬆日常對話，犯不著
    //   每次都吃重量級模型的延遲。max_tokens=1500：narration目標約500字＋其餘欄位，太低容易讓
    //   模型輸出被截斷成不完整JSON。
    // 🎛️ 2026-07 玩家調整採樣參數：temperature/top_p 略升、加top_k/repetition_penalty/presence_penalty/
    //   frequency_penalty 抑制重複套路句(如老是收在同一種收尾語氣)，僅driveOn吃到大模型(AI_MODEL)時
    //   這幾顆額外旋鈕才會實際生效，矜持模式(SOLO_MODEL)不支援的部分由OpenRouter靜默忽略。
    let aiConfig = { temperature: 1.08, top_p: 0.97, top_k: 60, repetition_penalty: 1.12, presence_penalty: 0.25, frequency_penalty: 0.25, retries: 2, model: driveOn ? AI_MODEL : SOLO_MODEL, isNsfwMode: true, max_tokens: 1500 };
    if (!driveOn) aiConfig.fallbackModel = AI_MODEL;

    // 抓取近 6 筆原始歷史(3輪)，轉換為 API 格式
    const recentHistoryRaw = getGameHistoryBatchRaw(pcId, 6);
    if (recentHistoryRaw && recentHistoryRaw.length > 0) {
      aiConfig.chatHistory = recentHistoryRaw.map(msg => ({
        role: msg.speaker === "player" ? "user" : "assistant",
        content: String(msg.content)
      }));
    }

    const aiResponseRaw = callGeminiAPI(prompt, null, aiConfig);
    const start = aiResponseRaw.indexOf('{');
    const end = aiResponseRaw.lastIndexOf('}');
    const cleanJson = aiResponseRaw.substring(start, end + 1);
    const aiData = sanitizeAiData_(JSON.parse(cleanJson));




    // 鑑賞拔除地圖按鈕，改AI自主決定地點——每回合讀 aiData.location 直接寫回 LOC。不靠IS_PARTY
    //   同步任何人：只有這回合一開始就跟玩家同地點在場的人(partyRows)才會跟著移動到新地點。
    // location不接受AI自創地名——跟move_proposal同一份KANSHOU_LOCATIONS_清單驗證(不合法就當
    //   沒這回事)，避免同伴LOC被寫成玩家點不到、後續橋段/巧遇等機制也對不上的幽靈地點。
    const aiLocRaw = String(aiData.location || "").trim().slice(0, 20);
    const aiLoc = aiLocRaw && KANSHOU_LOCATIONS_.some(l => l.name === aiLocRaw) ? aiLocRaw : "";
    if (aiLoc && aiLoc !== curL) {
      pcData[pcIndex][COL.PC.LOC] = aiLoc;
      dirtyPcRows.add(pcIndex);
      partyRows.forEach(r => {
        const nIdx = pcData.indexOf(r);
        if (nIdx === -1 || String(r[COL.PC.ID]).startsWith("DEAD_") || !sameGame(r)) return;
        pcData[nIdx][COL.PC.LOC] = aiLoc;
        dirtyPcRows.add(nIdx);
      });
      curL = aiLoc;
    }

    // AI提議換地點需玩家同意：只轉發給前端顯示同意/拒絕UI，不在這裡寫LOC——真正的移動要等
    //   玩家按下「同意」、前端帶著moveTarget再送一次，走既有moveTarget管線。
    const moveProposalRaw = String(aiData.move_proposal || "").trim();
    const moveProposal = moveProposalRaw && KANSHOU_LOCATIONS_.some(l => l.name === moveProposalRaw) ? moveProposalRaw : "";

    // 鑑賞無戰鬥：血量快照/stat_changes(外顯狀態刷新)/經濟層(物品/金錢/任務)皆不追蹤、不落地。
    //   肉體/外顯走 intimacy_feedback(physical_state)。

    {
      const relChangesToProcess = aiData.rel_changes || [];

      relChangesToProcess.forEach(rc => {
        const tNpc = rc.target ? String(rc.target).trim() : String(rc.npc).trim();
        if (tNpc === pcName || tNpc === "自己") return;

        // 羈絆已併入該 NPC 自己列（BOND/REL_TAG）——找不到該人此局的列就無可寫入。
        //   用 kanshouNameCandidates_ 比對，容忍AI只用括號前後其中一段稱呼TA。
        const nIdx = pcData.findIndex(r => kanshouNameCandidates_(r[COL.PC.NAME]).includes(tNpc) && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
        if (nIdx === -1) return;
        dirtyPcRows.add(nIdx);

        // 鑑賞允許好感依劇情推進（solo 的好感收歸 GAS 按鈕，走不同的 narrate_only 路徑，不受這裡影響）
        let change = parseInt(rc.fav_change) || 0;

        let oldFav = parseInt(pcData[nIdx][COL.PC.BOND]) || 0;
        let newFav = Math.max(-100, Math.min(100, oldFav + change));
        // 純聊天加好感卡在目前梯度上限，送禮才能突破(見kanshouRelChatCeiling_)——只夾正向漲幅，
        //   好感下滑(change<0)不受影響。
        if (change > 0) newFav = Math.min(newFav, kanshouRelChatCeiling_(oldFav));

        // REL_TAG 不允許AI直接指定文字寫入，好感變動後GAS依kanshouSyncRelTier_自動升降級；
        //   AI對標籤的影響力只剩「認不認同」，演在 intimacy_feedback.npcs[].attitude 裡。
        pcData[nIdx][COL.PC.BOND] = newFav;
        kanshouSyncRelTier_(pcData, nIdx);
      });
    }



    if (aiData.intimacy_feedback) {
      // 🔴 防禦機制：過濾掉 AI 偷懶不想更新狀態時的敷衍用語
      const ignoreWords = ["維持現狀", "無變化", "不變", "維持", "同上", "保持現狀", "沒有變化"];

      // physical_state 只管顏面神情，這裡補上後端強制截斷防呆(15字)，不完全依賴AI自律守住上限。
      const sanitizePhysicalState = (rawState) => {
        if (typeof rawState !== 'string') return "";
        const val = rawState.trim().slice(0, 20);
        return (!val || ignoreWords.includes(val)) ? "" : val;
      };

      // outfit_change：AI 如實回報的當下實際穿著，篩掉敷衍語後直接交給既有 setOutfit_ 寫回
      //   持久的【換裝】記錄(setOutfit_ 本身已有 40 字硬上限與清洗特殊字元，這裡不重複截斷)。
      const sanitizeOutfitChange = (rawOutfit) => {
        if (typeof rawOutfit !== 'string') return "";
        const val = rawOutfit.trim();
        return (!val || ignoreWords.includes(val)) ? "" : val;
      };


      const processSkills = (oldMem, newSkillsStr) => {
        // 邊界用全形｜(跟整個MEMORY生態系其餘標記【換裝】【邂逅】等一致)，而非半形「| [」。
        let skillMap = {}; let oldSkills = (oldMem.match(/\[雙修技巧\]([^｜]*)/) || [])[1]?.trim() || "";
        if (oldSkills && oldSkills !== "無") oldSkills.replace(/^\.\.\./, "").split('、').forEach(p => { let m = p.match(/(.+?)\(Lv\.(\d+)\)/); if (m) skillMap[m[1].trim()] = parseInt(m[2], 10); else if (p.trim()) skillMap[p.trim()] = 1; });
        if (String(newSkillsStr || "").trim() && String(newSkillsStr || "").trim() !== "無") String(newSkillsStr || "").trim().split('、').forEach(s => { let cn = s.replace(/[\(\[]?Lv\.?\d+[\)\]]?/gi, '').trim(); if (cn) skillMap[cn] = Math.min((skillMap[cn] || 0) + 1, 10); });
        let sorted = Object.keys(skillMap).map(k => ({ n: k, lv: skillMap[k] })).sort((a, b) => b.lv - a.lv);
        return sorted.length > 0 ? sorted.slice(0, 30).map(sk => `${sk.n}(Lv.${sk.lv})`).join('、') : "無";
      };
      // MEMORY欄是多個標記共用同一顆cell(【換裝】【帳號】【口吻】【邂逅中】等全擠在這裡，用全形｜
      //   分隔)，只能用 setSkillTag_ 只更新雙修技巧那一段、不動其餘標記，絕不能整格覆寫MEMORY。
      const setSkillTag_ = (oldMem, newSkillsStr) => {
        const cleaned = String(oldMem || "").replace(/｜?\[雙修技巧\][^｜]*/g, "");
        return (cleaned ? cleaned + "｜" : "") + "[雙修技巧]" + newSkillsStr;
      };

      const processTags = (oldMem, regex, newTagStr, maxCount) => {
        // 1. 取出舊標籤，拆成單項陣列(去頭部殘留的...、濾空白)
        let oldStr = (oldMem.match(regex) || [])[1]?.trim() || "無";
        let arr = (oldStr === "無" || oldStr === "")
          ? []
          : oldStr.replace(/^\.\.\./, "").split('、').map(x => x.trim()).filter(x => x !== "");

        // 2. 把新進來的字串也拆成單項(AI 可能一次吐多個，如「唇瓣、頸部」)
        let newItems = String(newTagStr || "").trim();
        if (newItems && newItems !== "無") {
          newItems.split('、').map(x => x.trim()).filter(x => x !== "").forEach(item => {
            // 3. 逐項去重：只有陣列裡還沒有這一項，才加進去
            if (!arr.includes(item)) arr.push(item);
          });
        }

        // 4. 超過上限保留最新的 maxCount 項
        if (arr.length === 0) return "無";
        return (arr.length > maxCount ? arr.slice(-maxCount) : arr).join('、');
      };

      if (aiData.intimacy_feedback.player) {
        const pfb = aiData.intimacy_feedback.player;
        const pCleanState = sanitizePhysicalState(pfb.physical_state);
        if (pCleanState) pcData[pcIndex][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[pcIndex][COL.PC.PHYSICAL], pCleanState);

        const pOutfitChange = sanitizeOutfitChange(pfb.outfit_change);
        if (pOutfitChange) pcData[pcIndex][COL.PC.MEMORY] = setOutfit_(pcData[pcIndex][COL.PC.MEMORY], pOutfitChange);

        let oldPMem = pcData[pcIndex][COL.PC.MEMORY] || "";
        pcData[pcIndex][COL.PC.MEMORY] = setSkillTag_(oldPMem, processSkills(oldPMem, pfb.dynamic_skills));
      }

      if (aiData.intimacy_feedback.npcs) {
        aiData.intimacy_feedback.npcs.forEach(nfb => {
          const tName = String(nfb.name).trim();
          // 同款括號全名比對問題(見上方 kanshouNameCandidates_)，這裡也會影響每回合寫入失敗。
          const targetIdx = pcData.findIndex(r => kanshouNameCandidates_(r[COL.PC.NAME]).includes(tName) && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
          if (targetIdx === -1) return;

          dirtyPcRows.add(targetIdx);
          const nCleanState = sanitizePhysicalState(nfb.physical_state);
          if (nCleanState) pcData[targetIdx][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[targetIdx][COL.PC.PHYSICAL], nCleanState);
          const nOutfitChange = sanitizeOutfitChange(nfb.outfit_change);
          if (nOutfitChange) pcData[targetIdx][COL.PC.MEMORY] = setOutfit_(pcData[targetIdx][COL.PC.MEMORY], nOutfitChange);
          if (nfb.dynamic_skills) {
            let oldNMem = pcData[targetIdx][COL.PC.MEMORY] || "";
            pcData[targetIdx][COL.PC.MEMORY] = setSkillTag_(oldNMem, processSkills(oldNMem, nfb.dynamic_skills));
          }

          // 羈絆記憶已併入該 NPC 自己列的 REL_MEM 欄，現在只剩專屬稱呼。
          let oldRMem = pcData[targetIdx][COL.PC.REL_MEM] || "";
          let nickPart = `[專屬稱呼]${processTags(oldRMem, /\[專屬稱呼\](.*?)(?=\| \[|$)/, nfb.mutual_nicknames, 3)}`;
          // 態度是「當下這一刻」的快照(跟累積/去重的專屬稱呼不同)，每回合直接覆蓋成最新值。
          let attRaw = (typeof nfb.attitude === 'string') ? nfb.attitude.trim().slice(0, 15) : "";
          let attPart = (attRaw && attRaw !== "無") ? `| [態度]${attRaw}` : "";
          pcData[targetIdx][COL.PC.REL_MEM] = `${nickPart}${attPart}`;
        });
      }
    }

    const pcColCount = Object.keys(COL.PC).length;

    // 競態修：play 豁免寫入鎖(AI 呼叫佔數秒會卡全域)，但上面的列索引是 AI 呼叫【前】讀到的——
    //   期間其他上鎖動作若刪列，索引會位移。寫回前做一次 ID 欄窄讀重定位，列已被刪就跳過。
    const liveIdx = buildLiveIdIndex_(sheets.pc);

    // MAX_HP/MAX_MP 重算只針對有變動的行，不全表掃描
    dirtyPcRows.forEach(idx => {
      const row = pcData[idx];
      if (!row) return;
      const id = String(row[COL.PC.ID] || "");
      // 含慾海角色前綴 KPC_(御主 avatar)／KSV_(封存邀請同伴)／KHV_(直接召喚同伴)，否則後日談的
      //   好感/肉體/衣服/親密狀態寫不回去。
      if (!id.startsWith("PC_") && !id.startsWith("NPC_") && !id.startsWith("DEAD_") && !id.startsWith("KPC_") && !id.startsWith("KSV_") && !id.startsWith("KHV_")) return;
      const curIdx = liveIdx[id];
      if (curIdx === undefined) return; // 列在 AI 呼叫期間被刪(競態) → 安全跳過

      while (row.length < pcColCount) row.push("");

      // 只寫這一行，不寫全表(用重定位後的真實列索引)
      sheets.pc.getRange(curIdx + 1, 1, 1, pcColCount).setValues([row]);
    });

    curL = pcData[pcIndex][COL.PC.LOC];

    // 橋段·夜襲/賴床叫醒的按鈕：candidate在回合開頭(任何LOC寫入之前)就算好了，這裡直接沿用，
    //   不應該重算——重算會撞回「同行同伴LOC已被同步」的舊bug。
    const roomEventOffer = kanshouRoomEventCandidate_ ? { name: kanshouRoomEventCandidate_.hero.realName, eventKey: kanshouRoomEventCandidate_.eventKey } : undefined;

    const localPeopleList = getKanshouPeopleList_(pcId, curL, pcData);

    let finalResponseText = aiData.narration || "天地混沌，一片寂靜。";
    finalResponseText = finalResponseText.replace(/\n/g, "<br>");






    // 好感度渲染／血量變化顯示區塊皆不輸出：好感度不顯示在敘述介面上，鑑賞無戰鬥不顯示血量變化。






    saveGameHistoryBatch(pcId, [
      { speaker: "player", content: userMsg },
      { speaker: "ai", content: aiData.narration || "" }  // 用原始 narration 不用 finalResponseText
    ]);

    // 提速：pcData 這裡已是本回合全部異動寫回後的權威陣列，直接複用它建一份跟 get_tags 同格式
    //   的 payload 夾帶回去，省掉前端另打一趟 get_tags 的 round-trip；建構失敗就不夾帶，前端會
    //   自動退回原本的 get_tags 補呼叫。
    let tagsPayload = null;
    try { const tp = buildTagsPayload_(sheets, pcId, pcData); if (tp && tp.success) tagsPayload = tp; } catch (e) { }

    // 時段按鈕/時段行動需要每回合都拿到最新時鐘，跟buildClientState_同一份kanshouClockInfo_，
    //   不重複拼字串。
    let kanshouClock = null;
    try { kanshouClock = kanshouClockInfo_(pcData[pcIndex]); } catch (e) { }

    return JSON.stringify({
      text: finalResponseText,
      statusString: buildPlayerStatusString(pcData[pcIndex]),
      people: localPeopleList,
      options: aiData.options,
      tags: tagsPayload,
      moveProposal: moveProposal || undefined,
      roomEventOffer: roomEventOffer,
      kanshouClock: kanshouClock,
      // 修過的bug：#clock-hud讀共用的updateClock(data.clock,...)，但data.clock在鑑賞這條路徑
      //   上從來沒被設過，導致HUD一直被當成「沒有clock」隱藏。這裡補上同一份kanshouClock.label
      //   餵給共用HUD，不是另開一條時鐘。
      clock: kanshouClock ? kanshouClock.label : ""
    });

  } catch (e) { return JSON.stringify({ text: "系統錯誤：" + e.message, people: [] }); }
}
