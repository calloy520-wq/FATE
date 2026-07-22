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
      "①look：日常版「外貌」四短句、頓號分隔，每句精簡收束、避免堆疊多重子句，依序為[外貌本相(髮色/瞳色/五官/體態等，不含服裝)]、" +
      "[氣質舉止(依和平日常情境自然轉化，但性格底色不變，不可變成另一個人的氣質；【不可與下方口氣段用相同字眼重複描述】，例如兩段都寫「溫柔」「謙恭」)]、" +
      "[自稱與口氣：固定格式「自稱「" + (firstP || "我") + "」，再接一句依她原本說話語氣(" + (speech || "無特別描述") + ")寫成的日常口氣描述」]、" +
      "[卸下心防的私密一面(這個角色只有放下戒備才會流露的一個具體、生活化、忠於其性格的小可愛面向，" +
      "【必須用看得到的具體小動作或情境呈現(show-don't-tell)，禁止直接說出她的內心想法/動機/情感獨白——如「心裡一直惦記著…」「其實很在意…」這類直述寫法一律不允許】，也不要只是把她的性格或喜好換句話說(那屬於性格欄)，" +
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
function translatePersonalityToDaily_(name, cls, rawWords, lookPrivateHint) {
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
      "③每句精簡收束、避免堆疊多重子句。\n" +
      (lookPrivateHint ? "④她的日常外貌欄已寫好一句「私密一面」：「" + lookPrivateHint + "」——你這4句性格【不要】跟它重複或換句話說同一件事，各自要是獨立的面向。\n" : "") +
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
    // 🏷️ 候選橋比對：列可能是短名(SABER/櫻)、英靈殿是全名——精確比對會讓遺留列口吻靜默變空。
    var h = heroes.find(function (r) { return kanshouNameCandidates_(String(r[COL.HERO.NAME]).trim()).includes(String(name).trim()) || kanshouNameCandidates_(String(name).trim()).includes(String(r[COL.HERO.NAME]).trim()); });
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
  // 🏷️ 鑑賞用日常稱呼(SABER/RIDER/櫻/凜…)當 NAME——比對經 kanshouNameCandidates_ 別名橋接，全名照樣對得上。
  sRow[COL.PC.NAME] = KANSHOU_CASUAL_NAME_[String(heroRow[COL.HERO.ID])] || name;
  sRow[COL.PC.SEX] = sex;
  // 鑑賞無戰鬥：體力/魔力/上限/STATUS 皆不寫(唯一可能的讀取點 people[].status 從未被前端消費)。
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
  // 身世優先序：①種子手寫的 dailyBack(canon英靈)②工房原創英靈沒 dailyBack→退回 forge 的 back(原創角色
  //   身世本就非戰時悲劇、可直接用)③兩者皆空才給通用預設。避免工房捏的角色也掉進「普通身影」預設。
  sRow[COL.PC.BACK] = p.dailyBack ? String(p.dailyBack).slice(0, 28)
    : p.back ? String(p.back).slice(0, 28)
    : "生活在這座城鎮裡的普通身影，與你尚無深交";
  // 直接召喚無快照可帶，用該英靈自己的日常衣裝(daily.outfit)墊底，沒有才退回「日常便服」。
  // p.speech/p.tic 是戰時口吻/小動作，跟平行世界矛盾：口吻改用 dailyLook 第3段(自稱與口氣)的
  //   日常安全版；tic 沒有對應日常版，直接不帶。
  var dailySpeechPart = dailyLookParts.length >= 4 ? dailyLookParts[2] : "";
  sRow[COL.PC.MEMORY] = setOutfit_(stampPersonaFlavor_("【鑑賞後日談·初見】在這座城裡剛結識的緣分，才剛開始。", dailySpeechPart, ""), daily.outfit || "日常便服");
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
//   一次(目前有②約定赴約/橋段加好感、③AI rel_changes)，冪等、重複呼叫不出錯。
function kanshouSyncRelTier_(pcData, idx) {
  const bond = parseInt(pcData[idx][COL.PC.BOND]) || 0;
  const curTag = String(pcData[idx][COL.PC.REL_TAG] || "");
  if (KANSHOU_REL_TIER_.some(t => t.label === curTag)) {
    const tier = KANSHOU_REL_TIER_.find(t => bond >= t.min);
    if (tier && tier.label !== curTag) pcData[idx][COL.PC.REL_TAG] = tier.label;
  }
  // 🐛→✅ 2026-07 稽核抓到：【同居】只有邀請成立/她主動提議兩處會寫成1，全檔案沒有任何地方
  //   清回0——好感若在同居後一路跌破門檻(爽約/冒犯累積)，標記仍在，AI仍每晚照樣把她骰進和室、
  //   仍觸發夜襲/賴床，敘事跟「都快變成點頭之交了」的數值直接矛盾。跟REL_TAG同一個函式做，因為
  //   两者都是「BOND變動後的下游狀態同步」，呼叫時機也完全一致(冪等、任何BOND變動處都會補呼叫)。
  if (kanshouIsCohabit_(pcData[idx]) && bond < KANSHOU_COHABIT_BOND_) {
    pcData[idx][COL.PC.MEMORY] = KANSHOU_COHABIT_TAG_.set(pcData[idx][COL.PC.MEMORY], 0);
  }
}
// 純聊天(AI rel_changes)加好感只能推到「目前所在梯度的上限」就卡住，要靠約定赴約(+5·kanshouPromiseMetStr)
//   或一起經歷橋段(+KANSHOU_SCENE_BOND_·下方roomEventAccept)這類真實相處才能突破到下一梯度(經濟/送禮已砍)。
//   上限沿用KANSHOU_REL_TIER_同一份門檻，不重複開新數字。
const KANSHOU_SCENE_BOND_ = 3; // 接受親密橋段(夜襲/共浴/膝枕…非拒絕分支)給的好感，直接寫、不吃聊天上限。

// 🫶 玩家主動提議(相約/牽手/同去)她答不答應——【GAS 依好感擲，AI 只演反應】(2026-07 由 AI 判定改為 GAS 判定)。
//   好感越高越可能答應；不同提議親密度不同起點/斜率（牽手最看好感、同去最隨和）。個性風味留給 AI 在敘述裡演。
function kanshouProposalAccepts_(type, bond) {
  bond = parseInt(bond) || 0;
  var base, slope;
  if (type === 'move') { base = 0.45; slope = 0.006; }         // 一起去某地·門檻低(0→.45 / 40→.69 / 80→.93)
  else if (type === 'promise') { base = 0.30; slope = 0.007; } // 相約明天·中等(0→.30 / 40→.58 / 80→.86)
  else { base = 0.10; slope = 0.010; }                          // 牽手·最私密最看好感(0→.10 / 40→.50 / 80→.90)
  return Math.random() < Math.max(0.03, Math.min(0.97, base + bond * slope));
}
// 純聊天封頂只從「熟識(40)」這道門檻起算——第一階「點頭之交→普通朋友」本就該靠日常閒聊自然發生
//   (陌生變朋友天經地義)，不該逼玩家在還沒熟時就得約會/夜襲(2026-07 玩家實測卡在19爬不出、矜持角色
//   約定又被婉拒的死結)。聊天可自由爬到39；40/60/80 三道親密門檻維持要約定赴約/橋段才能突破(slow burn)。
function kanshouRelChatCeiling_(bond) {
  const thresholds = KANSHOU_REL_TIER_.map(t => t.min).filter(m => m >= 40).sort((a, b) => a - b);
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
  var heroName = KANSHOU_CASUAL_NAME_[heroId] || String(hero[COL.HERO.NAME] || "從者"); // 🏷️ 鑑賞訊息/查重用日常稱呼
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
    // 🏷️ 跨名比對(短名列 vs 英靈殿全名)：候選集含別名橋，兩個方向都查。
    if (kanshouNameCandidates_(String(data[i][COL.PC.NAME])).includes(heroName) || kanshouNameCandidates_(heroName).includes(String(data[i][COL.PC.NAME]))) { existingIdx = i; break; }
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
      // 🏷️ 日常稱呼一次性遷移(冪等)：既有列若還是正式全名(間桐櫻/伊莉雅絲菲爾/阿爾托莉雅·潘德拉貢…)
      //   → 正名成短名；玩家 MEMORY 的牽手標記存的是她的名字，一併正名。已是短名的列跳過零寫入。
      try {
        var _cnMap = {};
        for (var _cid in KANSHOU_CASUAL_NAME_) {
          var _sd = SEED_SERVANTS.find(function (h) { return h.id === _cid; });
          if (_sd && _sd.realName !== KANSHOU_CASUAL_NAME_[_cid]) _cnMap[_sd.realName] = KANSHOU_CASUAL_NAME_[_cid];
        }
        var _myGid = String(data[r][COL.PC.GAME_ID] || "");
        for (var _cw = 1; _cw < data.length; _cw++) {
          if (String(data[_cw][COL.PC.GAME_ID] || "") !== _myGid) continue;
          if (String(data[_cw][COL.PC.FACTION]) !== "從者") continue; // 🛡️ 只正名 NPC——玩家 avatar 若自取名「遠坂凜」不得被強改
          var _cwNm = String(data[_cw][COL.PC.NAME] || "");
          if (_cnMap[_cwNm]) { data[_cw][COL.PC.NAME] = _cnMap[_cwNm]; kpc.getRange(_cw + 1, COL.PC.NAME + 1).setValue(_cnMap[_cwNm]); }
        }
        var _hhOld = KANSHOU_HANDHOLD_TAG_.get(String(data[r][COL.PC.MEMORY] || ""));
        if (_hhOld && _cnMap[_hhOld]) {
          var _newMem = KANSHOU_HANDHOLD_TAG_.set(String(data[r][COL.PC.MEMORY] || ""), _cnMap[_hhOld]);
          data[r][COL.PC.MEMORY] = _newMem;
          kpc.getRange(r + 1, COL.PC.MEMORY + 1).setValue(_newMem);
        }
      } catch (e) { }
      return JSON.stringify({
        success: true,
        pcId: linkedKpcId, pcName: String(data[r][COL.PC.NAME] || acctName),
        pcSex: String(data[r][COL.PC.SEX] || "異"), loc: loc,
        homeName: getKanshouHomeName_(data[r][COL.PC.MEMORY], String(data[r][COL.PC.NAME] || acctName)),
        prefLocks: kanshouGetPrefLocks_(data[r][COL.PC.MEMORY]) // 🔒 進場即下傳，重載後改命視窗開關狀態才正確(不再無聲清鎖)
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
        homeName: getKanshouHomeName_(data[m][COL.PC.MEMORY], String(data[m][COL.PC.NAME] || acctName)),
        prefLocks: kanshouGetPrefLocks_(data[m][COL.PC.MEMORY])
      });
    }
  }

  // 3️⃣ 沒有常駐御主 → 要新建。御主名字＋性別由玩家「首次進場時自己定」(一帳號可能有不同
  //   名字/性別的奪杯，不該由系統掛帳號或亂猜)。前端沒帶齊 → 回 needSetup 請前端先問一次。
  //   建好後持久存於這列，之後可用 kanshou_set_name／kanshou_set_sex 隨時改。
  var mSex = String(userData.pcSex || "").trim();
  // 🐛→✅ 稽核抓到：改名路徑(actionKanshouSetName)有卡≤16字，但這條「首次進場建檔」路徑完全沒設
  //   長度上限——只靠前端 maxlength=16 擋，繞過前端直接呼叫就能塞任意長度進 NAME 欄。補上同款上限。
  var mName = String(userData.pcName || "").trim().slice(0, 16);
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
  // 鑑賞無戰鬥：體力/魔力/上限/STATUS 皆不寫(見 heroToKanshouRow_ 同款理由)。五圍已棄欄，戰鬥吃六圍 SIX。
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
  // 🌱 2026-07 玩家御主改「留白＋滾動成長」：不再開局 AI 擴寫玩家內心——玩家的性格/經歷靠玩出來，
  //   AI 於 actionPlay 用 master_note 慢慢補【仍空的】欄(玩家自己填過的不動)、經歷隨劇情滾動更新。
  //   這裡只秒寫最小預設：TRAIT 四格=外貌(玩家填·留空則空)/氣質(空)/自稱「我」/私密一面「無」；
  //   PREF 四格=對外性格(玩家填「個性方向」·留空則空)/獨處性格/喜歡/討厭(後三格全留空待 AI 慢慢長)。
  // 🐛→✅ 同上：外貌/個性方向也只靠前端 textarea maxlength=60 擋，backend 補同款上限。
  var kAppear = String(userData.appearance || "").trim().slice(0, 60);
  var kPersona = String(userData.persona || "").trim().slice(0, 60);
  var _apPart = kAppear.replace(/、/g, "·").trim();   // 外貌塞第1格(內部頓號換·，免溢位其他格)
  var _psPart = kPersona.replace(/、/g, "·").trim();  // 個性方向塞「對外性格」第1格
  mRow[COL.PC.BACK] = "剛搬來冬木市";                  // 經歷開局(原「身世」正名；之後 AI 滾動＋玩家可改命)
  mRow[COL.PC.TRAIT] = _apPart + "、、我、無";
  mRow[COL.PC.PREF] = _psPart + "、、、";
  mRow[COL.PC.INTENT] = "";                            // 萌點留空→AI 遊玩時盲寫觀察補上第一個發現(master_note.萌點)、之後不覆寫；玩家改命可覆蓋
  kpc.appendRow(mRow);
  linkAccountToKanshouPc_(acctName, mId); // 🔒 權威連結寫進帳號表

  // 開場只入駐4位起始住民(2026-07玩家定案：大河/凜/櫻/SABER——「本來就住在這座城」感最強的
  //   幾位)，其餘女角不建列、不存在於世界，之後靠「出門走走」巧遇→玩家點「結識」才正式入駐
  //   (見kanshouEncounterStr/inviteResident)。起始好感/關係走一般泛泛之交，各自落在住處/日常地點。
  var starterHeroes = getHeroCodexCached().slice(1).filter(function (r) {
    return KANSHOU_STARTER_IDS_.indexOf(String(r[COL.HERO.ID])) !== -1;
  });
  var starterRows = starterHeroes.map(function (hero) {
    return heroToKanshouRow_(hero, gameId, kanshouRollDailyLocation_(String(hero[COL.HERO.NAME]), 6), 1);
  });
  if (starterRows.length) {
    kpc.getRange(kpc.getLastRow() + 1, 1, starterRows.length, pcColCount).setValues(starterRows);
  }

  return JSON.stringify({
    success: true,
    pcId: mId, pcName: mName, pcSex: mSex, loc: loc2, homeName: getKanshouHomeName_(mRow[COL.PC.MEMORY], mName)
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
  // 🐛→✅ 稽核抓到：這三欄餵進AI提示詞前也從沒設過長度上限，只靠前端擋，補上同款(60字)。
  const appearance = String(userData.appearance || "").slice(0, 60), standing = String(userData.standing || "").slice(0, 60);
  const persona = String(userData.persona || "").slice(0, 60);

  const promptStr = `【御主】：名號『${finalName}』，性別『${finalSex}』\n【外貌】：${appearance || "隨機"}\n【身世】：${standing || "隨機"}\n【個性方向】：${persona || "隨機"}`;

  // 「御主」在這裡當成單純稱謂使用，不代表真的打過仗；「已結束聖杯戰爭/已落幕」這類斷言禁止
  //   出現(跟平行世界設定矛盾)。
  const KANSHOU_MASTER_GEN_SYS = `你是《命運停駐之夜》後日談(鑑賞)的角色生成核心，為玩家建立一位生活在平行世界(這裡從來沒有發生過聖杯戰爭這回事)、與身邊英靈共度和平日常的「御主」本人形象。請依玩家提供的姓名、性別、外貌、身世、個性方向，生成合理且溫暖自然的設定。

★【演出而非說明】設定只作為底層依據，不要在 background 裡直接複述字面。
★【四格·格式鐵律】traits 與 personality 各【恰好4段】，只用頓號「、」分隔成4段，【絕對不要用句號「。」或半形句點】，每段是一個【簡短詞組】(不是完整句子)，每段內部也【不要】再用頓號列舉多項；禁數字標籤。
- traits：外貌、氣質舉止、自稱與口氣(第一人稱·如 我/俺/吾＋說話語氣)、卸下心防的私密一面。範例：「黑長直髮琥珀瞳、氣質溫婉恬靜、自稱「我」語氣輕柔、私下愛對植物自言自語」
- personality：日常表象、真實內裡、喜歡的事物、討厭的事物。範例：「文靜內向、內心溫柔細膩、照顧小動物與植物、大聲喧嘩與浪費食物」
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
  var propCatalog = kanshouAllProps_(me[COL.PC.MEMORY]); // 內建+玩家自訂道具合併目錄
  var current = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") === gid && String(data[i][COL.PC.FACTION]) === "從者" && !String(data[i][COL.PC.ID]).startsWith("DEAD_")) {
      var loc = String(data[i][COL.PC.LOC] || "");
      // 面板需要顯示目前所在地點(玩家要精準知道去哪找她)、關係標籤＋好感(供玩家決定要不要改標籤)；
      // isHere(是否跟玩家同地點)；locLabel：房間類地點的動態顯示名稱，見kanshouRoomDisplayName_。
      // 📅 待赴約定：讓同伴列顯示「M/D 在X有約」，玩家不必自己記(見 kanshouGetPromise_)。
      var _pm = kanshouGetPromise_(data[i][COL.PC.MEMORY]);
      var _pmDate = _pm ? kanshouAbsDayToDate_(_pm.day) : null;
      // memoir：共同回憶(27欄)原樣下傳(★前綴=玩家釘選)，供面板顯示/釘選/刪除。
      var _pmTime = _pm ? (KANSHOU_APPT_BANDS_.find(function (b) { return b.band === _pm.band; }) || {}).label : "";
      current.push({ name: String(data[i][COL.PC.NAME]), tag: String(data[i][COL.PC.REL_TAG] || "點頭之交"), bond: parseInt(data[i][COL.PC.BOND]) || 0, loc: loc, locLabel: kanshouRoomDisplayName_(loc, data, gid, myName, meIdx), isHere: loc === myLoc, promise: _pm ? { loc: _pm.loc, date: _pmDate.month + '/' + _pmDate.day, time: _pmTime || '' } : null, memoir: String(data[i][COL.PC.MEMOIR] || "").split('｜').map(function (s) { return s.trim(); }).filter(Boolean), props: kanshouGetProps_(data[i][COL.PC.MEMORY], propCatalog) });
    }
  }
  return JSON.stringify({ success: true, current: current, customProps: kanshouGetCustomProps_(me[COL.PC.MEMORY]) });
}

// 💞 共同回憶面板操作(釘選/取消釘選/刪除)——比照 update_rel_tag「玩家 UI 手動管理、AI 無權」精神。
//   釘選=條目加 ★ 前綴(processMemoir_ 淘汰舊條目時永不驅逐★)；刪除=整條移除。
//   op: 'pin'|'unpin'|'del'；item=條目原文(不含★)。帳號綁定：kanshouOwnedRowIdx_ 驗過才動同 gid 的列。
function actionKanshouMemoirOp(userData, pcId, sheets) {
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」
  var acctName = String(userData.acctName || "").trim();
  var op = String(userData.op || "").trim();
  var item = String(userData.item || "").replace(/[｜【】\[\]★]/g, "").trim();
  var targetName = String(userData.targetName || "").trim();
  if (!item || !targetName || ['pin', 'unpin', 'del'].indexOf(op) === -1) return JSON.stringify({ success: false, message: "參數不完整。" });
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  var tIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") === gid && String(data[i][COL.PC.FACTION]) === "從者" && !String(data[i][COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(data[i][COL.PC.NAME])).includes(targetName)) { tIdx = i; break; }
  }
  if (tIdx < 0) return JSON.stringify({ success: false, message: "找不到這位同伴。" });
  var entries = String(data[tIdx][COL.PC.MEMOIR] || "").split('｜').map(function (s) { return s.trim(); }).filter(Boolean);
  var hit = entries.findIndex(function (e) { return e.replace(/^★/, "") === item; });
  if (hit === -1) return JSON.stringify({ success: false, message: "找不到這條回憶(可能已被更新)。" });
  if (op === 'del') entries.splice(hit, 1);
  else if (op === 'pin') {
    // 釘選上限8：釘滿10會讓新回憶永遠擠不進(總量上限10)，留2格給新的。
    if (entries.filter(function (e) { return e.charAt(0) === '★'; }).length >= 8) return JSON.stringify({ success: false, message: "釘選已達上限(8條)，先取消一些吧。" });
    entries[hit] = '★' + entries[hit].replace(/^★/, "");
  }
  else entries[hit] = entries[hit].replace(/^★/, "");
  var joined = entries.join('｜');
  kpc.getRange(tIdx + 1, COL.PC.MEMOIR + 1).setValue(joined);
  return JSON.stringify({ success: true, memoir: entries });
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
      return JSON.stringify({ success: false, message: "這個世界裡已經有男性同伴存在——僅支援男女／女女配對，此存檔無法切換為男性。" });
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
  if (newName.length > 16) return JSON.stringify({ success: false, message: "名字請在16字以內。" });
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

// 🎀 小道具面板/快速控制抽屜共用：裝備/移除/調整強度，玩家UI手動操作、GAS直接寫，不靠AI判斷要
//   不要記(見上方KANSHOU_PROPS_註解)。level空字串＝移除這一件(其餘已裝備道具不受影響，2026-07
//   玩家「其他道具怎麼辦，一次只能一種？」改成多件同時裝備)。比照 actionKanshouMemoirOp 同款帳號
//   驗證+目標同伴查找寫法。
function actionKanshouSetProp(userData, pcId, sheets) {
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」
  var acctName = String(userData.acctName || "").trim();
  var targetName = String(userData.targetName || "").trim();
  var propId = String(userData.propId || "").trim();
  var level = String(userData.level || "").trim();
  if (!targetName || !propId) return JSON.stringify({ success: false, message: "參數不完整。" });
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  var tIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") === gid && String(data[i][COL.PC.FACTION]) === "從者" && !String(data[i][COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(data[i][COL.PC.NAME])).includes(targetName)) { tIdx = i; break; }
  }
  if (tIdx < 0) return JSON.stringify({ success: false, message: "找不到這位同伴。" });
  var def = kanshouAllProps_(data[meIdx][COL.PC.MEMORY]).find(function (p) { return p.id === propId; });
  if (!def) return JSON.stringify({ success: false, message: "查無此道具。" });
  var finalLevel = "";
  if (level) {
    finalLevel = def.hasIntensity ? (KANSHOU_PROP_LEVELS_.indexOf(level) !== -1 ? level : KANSHOU_PROP_LEVELS_[0]) : "戴著";
    // 🔒 2026-07 玩家「整個小道具直接卡80吧...還沒80都鎖起來」：不只啟動，裝備本身(含關閉/戴著起手)
    //   都卡好感門檻——好感不夠她根本不會讓你碰。移除(level空字串)不受此限，隨時能拿掉。
    if ((parseInt(data[tIdx][COL.PC.BOND]) || 0) < KANSHOU_PROP_EQUIP_BOND_) {
      return JSON.stringify({ success: false, message: "好感還沒到那個地步，她不會讓你這麼做。" });
    }
    // 🔢 只卡「新增裝備」：propId還沒在她身上的已裝備清單才算新增，調整已裝備項目的強度不占額外名額。
    var _existingP = kanshouGetProps_(data[tIdx][COL.PC.MEMORY]);
    if (!_existingP.some(function (p) { return p.id === propId; }) && _existingP.length >= KANSHOU_PROP_EQUIP_CAP_) {
      return JSON.stringify({ success: false, message: "同時最多只能裝備" + KANSHOU_PROP_EQUIP_CAP_ + "件，先移除一件吧。" });
    }
  }
  var newMemory = kanshouToggleProp_(data[tIdx][COL.PC.MEMORY], propId, finalLevel);
  kpc.getRange(tIdx + 1, COL.PC.MEMORY + 1).setValue(newMemory);
  return JSON.stringify({ success: true, props: kanshouGetProps_(newMemory, kanshouAllProps_(data[meIdx][COL.PC.MEMORY])) });
}

// 🎀 自訂道具新增：玩家自建新道具定義＋立即裝備在targetName身上(合併成一步，體驗比「先建目錄、
//   再另外裝備」更順)。name≤10字，玩家自訂目錄上限KANSHOU_CUSTOM_PROP_CAP_筆；同名再次新增＝
//   更新hasIntensity/part(以最後一次設定為準)。裝備這步一樣卡KANSHOU_PROP_EQUIP_BOND_好感門檻
//   (2026-07「整個小道具直接卡80吧」)——目錄本身可以先建，但好感不夠就只是建了定義、還不能裝上去。
//   part(部位)選填(2026-07「選填吧，想指定就自己打，沒有就AI自己想辦法發揮」)：留空則不注入部位
//   敘述，交給AI自行決定戴在哪。
function actionKanshouAddCustomProp(userData, pcId, sheets) {
  var kpc = sheets.pc;
  var acctName = String(userData.acctName || "").trim();
  var targetName = String(userData.targetName || "").trim();
  var name = kanshouSanitizeTagValue_(userData.name, 10);
  var hasIntensity = !!userData.hasIntensity;
  var part = kanshouSanitizeTagValue_(userData.part, 8); // 選填，留空就讓AI自己發揮(不注入部位敘述)
  if (!targetName || !name) return JSON.stringify({ success: false, message: "參數不完整。" });
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  // 🐛→✅ 稽核抓到：原本比對 p.id(內建道具的內部代號如'egg_vibrator')跟玩家打的中文名，永遠不
  //   會相等，撞名檢查形同虛設(玩家真的取名「跳蛋」反而不會被擋)。改比對顯示名稱 p.name。
  if (KANSHOU_PROPS_.some(function (p) { return p.name === name; })) return JSON.stringify({ success: false, message: "這個名字跟內建道具重複了，換一個名字吧。" });
  var custom = kanshouGetCustomProps_(data[meIdx][COL.PC.MEMORY]);
  var already = custom.some(function (p) { return p.id === name; });
  if (!already && custom.length >= KANSHOU_CUSTOM_PROP_CAP_) return JSON.stringify({ success: false, message: "自訂道具已達上限(" + KANSHOU_CUSTOM_PROP_CAP_ + "件)，先刪掉一些吧。" });
  custom = custom.filter(function (p) { return p.id !== name; });
  custom.push({ id: name, hasIntensity: hasIntensity, part: part });
  var newPlayerMemory = kanshouSetCustomProps_(data[meIdx][COL.PC.MEMORY], custom);
  kpc.getRange(meIdx + 1, COL.PC.MEMORY + 1).setValue(newPlayerMemory);
  var gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  var tIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") === gid && String(data[i][COL.PC.FACTION]) === "從者" && !String(data[i][COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(data[i][COL.PC.NAME])).includes(targetName)) { tIdx = i; break; }
  }
  if (tIdx < 0) return JSON.stringify({ success: true, props: [], customProps: custom, message: "已新增到你的道具目錄，但找不到這位同伴可裝備。" });
  if ((parseInt(data[tIdx][COL.PC.BOND]) || 0) < KANSHOU_PROP_EQUIP_BOND_) {
    return JSON.stringify({ success: true, props: kanshouGetProps_(data[tIdx][COL.PC.MEMORY], KANSHOU_PROPS_.concat(custom)), customProps: custom, message: "已新增到你的道具目錄，但好感還沒到那個地步，她還不會讓你幫她裝備。" });
  }
  var _existingT = kanshouGetProps_(data[tIdx][COL.PC.MEMORY]);
  if (!_existingT.some(function (p) { return p.id === name; }) && _existingT.length >= KANSHOU_PROP_EQUIP_CAP_) {
    return JSON.stringify({ success: true, props: kanshouGetProps_(data[tIdx][COL.PC.MEMORY], KANSHOU_PROPS_.concat(custom)), customProps: custom, message: "已新增到你的道具目錄，但她身上裝備已達上限(" + KANSHOU_PROP_EQUIP_CAP_ + "件)，先移除一件才能裝上這個。" });
  }
  var finalLevel = hasIntensity ? KANSHOU_PROP_LEVELS_[0] : "戴著"; // 新裝備一律關閉起手
  var newMemory = kanshouToggleProp_(data[tIdx][COL.PC.MEMORY], name, finalLevel);
  kpc.getRange(tIdx + 1, COL.PC.MEMORY + 1).setValue(newMemory);
  return JSON.stringify({ success: true, props: kanshouGetProps_(newMemory, KANSHOU_PROPS_.concat(custom)), customProps: custom });
}

// 🗑 刪除玩家自訂道具定義：同步清掉所有同伴身上目前裝備的這一項，避免留下型錄查無定義的孤兒資料。
function actionKanshouDeleteCustomProp(userData, pcId, sheets) {
  var kpc = sheets.pc;
  var acctName = String(userData.acctName || "").trim();
  var name = String(userData.name || "").trim();
  if (!name) return JSON.stringify({ success: false, message: "參數不完整。" });
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouOwnedRowIdx_(data, pcId, acctName);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var custom = kanshouGetCustomProps_(data[meIdx][COL.PC.MEMORY]).filter(function (p) { return p.id !== name; });
  kpc.getRange(meIdx + 1, COL.PC.MEMORY + 1).setValue(kanshouSetCustomProps_(data[meIdx][COL.PC.MEMORY], custom));
  var gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") === gid && String(data[i][COL.PC.FACTION]) === "從者" && !String(data[i][COL.PC.ID]).startsWith("DEAD_")) {
      var existing = kanshouGetProps_(data[i][COL.PC.MEMORY]);
      if (existing.some(function (p) { return p.id === name; })) {
        kpc.getRange(i + 1, COL.PC.MEMORY + 1).setValue(kanshouToggleProp_(data[i][COL.PC.MEMORY], name, ""));
      }
    }
  }
  return JSON.stringify({ success: true, customProps: custom });
}


// ==========================================
// 🔴【鑑賞 AI 核心】buildDefaultSystemPrompt／actionPlay
//   solo 是按鍵+AI說故事，鑑賞是依角色資料自然演出(只有🔥點不點火這一個變因)——兩者共用
//   callGeminiAPI(留在 Engine_Combat.gs)這個基礎設施，但系統提示詞組裝／敘事引擎各自獨立，
//   跟本檔其餘鑑賞 action(召喚/進場/AI深化)集中一處，好查找。
// ==========================================

// 🔠 對話與敘事格式·全遊戲【單一真實來源】：solo 的 miniSystem(Router_Narrative.gs) 與鑑賞的
//   nsfwBaseVars(本檔 nsfwBaseRules 第3條) 都呼叫這一支，杜絕兩處各改一半又不一致(工程準則·單一
//   真實來源)。核心分界：凡是「她的口／喉」發出的聲音(話語＋喘息＋吸吮/咀嚼等嘴部聲)一律當台詞
//   進「」；看得見的動作、以及「不是她嘴發出的」聲響(肉體相撞/兵刃/水聲/環境)走敘事擬聲。濃淡(日常
//   ↔激烈/情慾)由各軌自己的規則(色度跟隨/親密尺度天花板/戰況)決定，此格式只管『怎麼寫』不管『寫多濃』。
function dialogueFormatRule_() {
  return `對話與敘事格式（全遊戲統一·自然散文，以輕小說筆觸書寫）：
① 【凡是她「口／喉」發出的聲音都當台詞、直接寫進單層「」】——話語，以及喘息、輕吟、悶哼、笑聲、吸吮、舔啜、咀嚼、吞嚥等口腔聲響，可與話語自由交錯（例：「唔……啾，好甜」「哈啊……唔嗯」）。【不要】用（輕哼）（嬌喘）這類括號描述聲音、也不要改寫成第三人稱旁白。
② 【每一句「角色說出口的台詞」都在「」前冠上說話者的名字——硬格式·不可省】——例：櫻「風音學姐……」、凜「哼，隨便你。」。跨回合也絕不認錯人。喘息／擬聲若混在某角色的台詞串裡，跟著那句一起掛在她名下。★唯一例外：以第一人稱『我』推演的【玩家本人】台詞不必冠名，直接寫「……」即可。
③ 【看得見的動作、以及「不是她嘴發出的」聲響都走敘事】——不出聲的肢體動作與身體反應（蹙眉、別過臉、指尖收緊、腰肢繃緊）當自然敘事句融進行文；不是她嘴發出的聲響（肉體相撞的啪啪、環境音、兵刃聲）則用狀聲詞寫進敘事。★【硬規則】武器／物件／環境發出的狀聲詞以及任何肢體動作【絕不可】寫進「」台詞引號內，一律移到「」外當動作／環境敘事。
④ 引號全文只用單層「」、禁巢狀『』（連狀聲詞也不可用『』夾進「」）；純背景／環境描述精簡帶過，把篇幅留給互動本身。`;
}

// 只被鑑賞(慾海)呼叫——solo走完全獨立的 miniSystem。唯一呼叫來源 actionPlay 的 isNsfwMode
//   恆為 true，故不再分 SFW/NSFW 分支，直接寫死唯一會用到的版本。driveOn(主動掌握)由
//   actionPlay 自己組的 driveStr 處理，不在這裡管轄。
// 🌱 master_note(玩家御主滾動側寫)動態 schema：actionPlay 傳入「玩家沒鎖的性格欄」清單，這裡只把
//   沒鎖的格放進範本——鎖了的格【連欄位都不出現】，AI 根本不知道有這欄(玩家定案，比「叫他別寫」更乾淨)。
//   經歷永遠在(不鎖)。未傳(undefined)＝四格全開(相容 solo/舊呼叫)。
// 🌀 includeMasterNote=false(側寫節流·非側寫回合)＝整塊 master_note 從 schema 拿掉，AI 專心敘事；
//   undefined/true＝照常帶(相容舊呼叫)。
// 🎛️ includeOptions=false(玩家關掉【命運的抉擇】開關)＝options 欄整個拿掉——玩家看不到的東西
//   不必叫 AI 每回合生 4 條(省 token 省注意力)。undefined/true＝照常帶。
function buildDefaultSystemPrompt(masterNoteUnlocked, includeMasterNote, includeOptions) {
  // physical_state 只留顏面神情(≤15字)：只管表情，衣裝狀態拆進獨立的 appearance_extras 欄
  //   (下方)，兩者關注點不同——前者是每回合都可能變的暫時神情，後者是要持久記住的實際穿著。
  const _physicalState = "角色當下顏面神情(第三人稱·≤15字)";
  // 🌱 依鎖狀態動態組 master_note：只納入沒鎖的性格欄(鎖的連提都不提)。
  const _mnDescs = {
    "對外性格": "玩家人前性格判斷(詞組·有更準才更新·否則空)",
    "獨處性格": "玩家獨處真實一面(詞組·有更準才更新·否則空)",
    "喜歡": "玩家明確喜歡的事物(詞組·有新發現才更新·否則空)",
    "討厭": "玩家明確討厭的事物(詞組·有新發現才更新·否則空)"
  };
  const _mnKeysOpen = Array.isArray(masterNoteUnlocked) ? masterNoteUnlocked : ["對外性格", "獨處性格", "喜歡", "討厭"];
  const _masterNote = {
    "_note": "觀察玩家本人慢慢認識他(不顯示·非敘事)·有新觀察才更新否則留空保持原樣",
    "經歷": "承接舊經歷·只增補這回合有意義的新遭遇·回滾動摘要≤50字·沒新事就原樣回舊值",
    "萌點": "暗中觀察到玩家一個反差/可愛弱點就寫詞組·否則空·★絕不在敘述點破(show-don't-tell)·你看不到現值照觀察寫"
  };
  _mnKeysOpen.forEach(function (k) { if (_mnDescs[k]) _masterNote[k] = _mnDescs[k]; });

  // appearance_extras(原 outfit_change，2026-07 改名)：角色當下實際穿著狀態，AI 可依劇情如實更新
  //   (正常穿著寫身上衣物，全裸/沐浴/更衣等狀態也要如實反映)，會寫回持久的【換裝】記錄，不是每回合
  //   就消失的暫時描述。
  // 🐛→✅ 2026-07 玩家實測「幫她戴貓耳朵，過幾輪就忘記」：舊欄名"outfit_change"字面就是「換裝」，
  //   容易連AI帶欄名一起窄化成只認「衣服本身的替換」，當時補了配飾類範例(「貓耳頭飾」)把玩家臨時
  //   加的道具也塞進這欄一起救。**2026-07再修**（玩家「小道具已經有專門機制了，外觀服裝也幫我專注
  //   在外觀服裝吧」）：現在持久小道具(KANSHOU_PROPS_/自訂道具)才是配飾/道具類的機制保證正解，這欄
  //   改回**只專注服裝本身**，不再兼管配飾——避免兩套機制搶著記同一件事、混淆該由誰負責。AI 若自己
  //   想在敘事順帶提到身上的小道具(如貓耳)，那是它自由發揮，不強求也不靠這欄記錄。
  const _appearanceExtras = "角色當下穿著的衣物狀態(第三人稱·≤20字·名詞短語如「絲綢襯衫」「牛仔褲」·禁動作句「換上了…」)";

  // 🔴 npc的範本欄位填「同上」：actionPlay 落地端(本檔·intimacy_feedback 解析)的 ignoreWords 防呆清單本就
  // 含「同上」，即使AI偷懶照抄範本字面值也會被當成敷衍語忽略、不會寫進玩家看到的狀態欄，省字數不引入新的失敗模式。
  const _physicalStateRef = "同上";
  const _appearanceExtrasRef = "同上";

  const finalJson = {
    // 強制思維鏈：放範本第一位讓模型先自省再寫敘事。後端 sanitizeAiData_ 不讀此欄，純粹是給
    //   AI 自己看的思考格，零程式面副作用。第三人稱總結(而非第一人稱)是為了不跟 narration 的
    //   敘事視角(玩家「我」)打架；「本回合開始前」明講時態，避免被誤讀成預寫本回合結果。
    "inner_monologue": "【純思考·不顯示·約50字】第三人稱總結主NPC本回合開始前的狀態([性格尊嚴]vs[當下情緒身體])·承接歷史勿歸零",
    "narration": "劇情(第一人稱·禁替玩家做決定·篇幅依下方【篇幅隨關係濃淡】)",
    // 🗺️ 2026-07 移動改「同意泡泡」制(見§134)：AI 不得自行搬動玩家。此處刻意【不設 location 欄】——
    //   玩家的所在地一律由 GAS 掌握(地圖按鈕/赴約/跳時間時寫好)，AI 每回合照抄毫無意義、徒增 token 與
    //   自相矛盾風險；想換場景一律走下面的 move_proposal 提議。後端仍保留 aiData.location 攔截層當保險
    //   (萬一模型自作主張硬吐 location→照樣轉成 move_proposal 泡泡，不會無聲搬人)。
    // move_proposal是「提議」不是「已發生」——填了這欄，narration必須停在邀請當下、不可先寫出移動或
    //   抵達，真正是否移動由玩家事後回應決定。
    "move_proposal": "出現「一起去某地」共識就填目標地名(限地點清單)：她邀你或你邀她而她答應皆填·意圖非結果·narration停在提議當下勿演移動。婉拒/無意圖填空。有【提議·同去】標記時【不填此欄】——同去結果由系統裁定、你只演反應",
    // 📅 她主動邀約(promise_proposal)：跟 move_proposal 同理的「提議」——她開口約改天見面，narration 停在
    //   她邀約的當下，由玩家按泡泡決定。GAS 只在玩家同意後才落地【約定】(意圖非結果)。band 限午後/黃昏/夜。
    "promise_proposal": "在場同伴想主動約你改天見面才填 {\"name\":\"真名\",\"loc\":\"清單地名\",\"band\":\"午後|黃昏|夜或空\"}·narration停在她邀約當下·否則{}",
    // 🏠 她主動邀同居(cohabit_proposal)：僅在她對玩家好感很深、且還沒同住時才有意義；同 move_proposal 的
    //   提議語意，narration 停在她開口當下，玩家同意後 GAS 才落地【同居】。
    "cohabit_proposal": "在場同伴好感極深且未同住·她想邀你同住才填她真名·narration停在她開口當下·否則空",
    // proposal_accept：【已停用·GAS 判定】相約/牽手/同去她答不答應由 GAS 依好感於 pre-AI 擲定、寫在敘事鐵律區
    //   (★【提議…GAS已裁定…】)，AI 只照裁定演反應。此欄保留相容但後端一律忽略——不必填、填了也不影響結果。
    "proposal_accept": "【已停用·忽略】她答不答應由系統裁定並寫在鐵律區·你只演反應·此欄留空即可",
    // npc_exit：同伴自主權——她可自然告辭離場，GAS真的把她移出場景(不再是嘴上說走卻還在)。只認此刻
    //   在場同伴，去向由系統依作息決定；被牽的人離場→牽手自動鬆開。不必每回合遣散，只在情境自然時。
    "npc_exit": "在場同伴自然告辭離場的真名陣列(可多位)·narration演出她離開·否則[]",
    "options": ["1. [主動]強勢掌握主導...", "2. [被動]順從委婉試探...", "3. [接續]順劇情延續互動...", "4. [反差]跳脫氛圍的驚人舉動..."],
    "intimacy_feedback": {
      "_note": "physical_state=顏面神情(第三人稱·禁內心戲·≤15字)；appearance_extras=穿著狀態(名詞短語·≤20字·持久)。★差分：沒實質變化就填空(系統沿用舊值)、有變化(神情轉變/脫穿沐浴/情事進展)才更新。npcs每位與player同格式。",
      "player": {
        "physical_state": _physicalState,
        "appearance_extras": _appearanceExtras,
        "dynamic_skills": "雙修技巧名(2~5字，規則見上方慾海律令第5條)"
      },
      "npcs": [{
        "name": "NPC真名(固定真名·不填暱稱/職階)",
        "physical_state": _physicalStateRef,
        "appearance_extras": _appearanceExtrasRef,
        "dynamic_skills": "雙修技巧名(2~5字·見律令5)",
        "mutual_nicknames": "雙方自然發展的暱稱(見律令5)",
        "attitude": "NPC對御主當下臨場態度(第三人稱·≤15字·見律令6)",
        "memory": "本回合若有值得長期記的里程碑(告白/初牽手/難忘約會橋段/重要約定達成)寫一句≤30字·玩家第一人稱「我」記我們做的事·禁寫成她的視角/第三人稱·尋常閒聊填「無」·★同一件事只記一次(與她【共同回憶】已有的重複就填無)"
      }]
    },
    // target 只能填真名(schema級約束，比事後再說一次更有效)。tag 欄位不存在：關係標籤
    //   (COL.PC.REL_TAG)只能由御主透過UI(update_rel_tag)手動更改，AI對標籤的影響力只剩
    //   「認不認同」，寫在 intimacy_feedback.npcs[].attitude，不是靠覆寫這個欄位表達。
    "rel_changes": [{
      "_note": "fav_change整數：日常+1~2、明顯心動/重大進展+3~5、單回合上限+5、冒犯可負。",
      "target": "NPC真名(固定真名·不填暱稱/職階/台詞/地名)", "fav_change": 3
    }],
    // 🌱 玩家御主「滾動側寫」：AI 每回合觀察玩家、慢慢認識他(像對話 AI 記住使用者習慣)。GAS 只採用
    //   【玩家仍留白】的欄位(玩家自己填過的一律鎖住、不覆寫)；經歷則每回合承接舊值滾動更新。詳見 §玩家側寫。
    "master_note": _masterNote,
    // mentioned_names/event/tag/log_summary 等死欄已移除：皆是寫入後從未被任何地方讀回的
    //   死路(前端不消費、AI不依此決策)，拿掉後AI不用再每回合多填這些欄位。
  };
  // 🌀 側寫節流：非側寫回合把整塊 master_note 拿掉(AI 連這欄都看不到、專心敘事)。落地端 if(aiData.master_note)
  //   守衛自動跳過缺席回合，經歷/性格/萌點保留舊值不動。
  if (includeMasterNote === false) { delete finalJson.master_note; }
  if (includeOptions === false) { delete finalJson.options; }

  // 🔠 對話格式規則已上移為頂層 dialogueFormatRule_()(單一真實來源，solo miniSystem 與此處共用)，見本檔上方。

  // 🔴 NSFW(慾海模式)：本回合聚焦當下的近身互動(情慾/調情/鋪陳皆可)，雜務(物品/金錢/陣營/任務/招募/地圖/戰鬥數值/身世)
  // 完全不追蹤、不輸出，鐵律文字大幅精簡，盡量交給AI自行判斷。意圖攔截只依[個性]判斷(鑑賞無戰鬥
  // 概念，[戰力]門檻與世界觀矛盾)；不設傾心/道侶等詞彙黑名單，實質行為門檻改由玩家提示詞的
  // 【親密尺度·分五階】(好感 20/40/60/80 天花板)統一約束，此處系統規則只講原則、不再硬編單一 80 門檻。
  const nsfwBaseRules = `後日談敘事核心·輕小說筆觸·台灣繁體中文·第一人稱「我」·禁上帝視角。鐵律：
1. 承接玩家最新動作與台詞【語氣照原樣】(疑問就疑問、吐槽就吐槽)·不擴寫不代玩家加戲·被搭話NPC本回合必給完整真實反應·優先接反轉/否定/突發情緒。
2. 每2~3句 <br><br> 分段·女子體態柔美(柔嫩/雪白/婉約·出力柔中帶勁)。
3. ${dialogueFormatRule_()}
4. 依玩家輸入【確實推演往下走·不停滯敷衍】——玩家自己的動作/台詞如實發生、被搭話NPC必給回應；NPC的反應由她[個性]×[好感]真實決定(順從/猶豫/半推半就/婉拒皆可·玩家不能替她決定她的反應)·肢體親密受下方【親密尺度五階】好感門檻硬約束、不得跨階。
5. 關係標籤玩家定·你只在 attitude 認不認；萌點/語癖/名號自然滲入偶爾點到即可·禁每段重複同一個。
6. 聚焦當下近身互動·只輸出合法JSON${includeOptions === false ? '' : '·options固定4條每條≤20字'}。`;

// ⚠ 2026-07 玩家「色色部分都搬去給點火」實驗：色度跟隨(原0)＋情慾場生理特寫(原4)兩條搬進
//   driveStr(見下方，僅driveOn=true才組進提示詞)——這兩條原本是「怎麼寫得好」的常駐風格指導、
//   不是「准不准寫」的開關(准不准寫仍是【親密尺度五階】的好感天花板在管，跟driveOn無關)。搬走後
//   矜持模式(driveOn=false)不再拿到這兩條的具體寫作指引，即使好感已達戀人階、天花板允許無上限，
//   矜持模式下的措辭可能反而更保守含糊；主動掌握模式因為同時拿到driveStr的推進指令＋這兩條的
//   露骨寫作指引，兩者疊加會更猛。玩家已知情況下要求先試試看，若實測矜持模式下高好感場景意外
//   變乾癟，這是根因、把這兩條原樣搬回來即可。
const specificRules = `
【慾海律令】
1. 先在 inner_monologue 依「玩家輸入×NPC個性×近期歷史」判最真實反應·再寫 narration。
2. 繼承歷史情緒與親密階·絕不無故重置(降溫只因被打斷/翻臉等明確事件)·玩家只是日常時禁憑空推進情慾。
3. 女女：純女女之愛·主導跟隨依個性·動作柔美；男女：依器官自然互動·女性側柔美。
4. dynamic_skills/mutual_nicknames：本回合真發生才填·否則「無」。
5. attitude(≤15字)：有明顯轉變才填·空=沿用舊值。`;

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
// 🧭 給AI的地點脈絡：光一個地名(如「客廳」)AI分不出是御主自己家還是別人家，容易誤演成「在他家中」。
//   依 region 補一句大分區脈絡，讓AI知道此刻身處何種場域。找不到(AI自創地點)就回空字串、不硬套。
function kanshouLocContextForAI_(locName, homeName) {
  const loc = KANSHOU_LOCATIONS_.find(l => l.name === String(locName || "").trim());
  if (!loc) return "";
  switch (loc.region) {
    case 'room': return `御主自己的家「${homeName}」的私人房間`;
    case 'home': return `御主自己的家「${homeName}」的共用空間`;
    case 'visit': return `這是別人的住處，御主是登門造訪的客人、不是自己家`;
    case 'shinzan': return `深山町（溫馨的住宅生活區）`;
    case 'fuyuki': return `冬木市中心（熱鬧的商業生活區）`;
    case 'dojo': return `山林（安靜神秘的郊野區）`;
    default: return "";
  }
}
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
  { name: '和室', region: 'home', desc: '鋪著榻榻米的和室，同居人的寢間。', noEncounter: true },

  { name: '河邊小徑', region: 'shinzan', desc: '晨昏都靜謐的河堤小徑，水聲潺潺。' },
  { name: '古老神社', region: 'shinzan', desc: '石階盡頭的老神社，香火氣息。' },
  { name: '社區公園', region: 'shinzan', desc: '孩子嬉鬧、長椅斑駁的社區公園。' },
  { name: '便利商店', region: 'shinzan', desc: '燈火通明、24小時營業的街角小店。' },

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
// 🏘️ 開局起始住民(2026-07玩家定案)：只有這4位一開始就「活在這座城裡」，其餘靠巧遇結識後才入駐。
const KANSHOU_STARTER_IDS_ = ['藤村大河-Master', '遠坂凜-Master', '間桐櫻黑化-Master', '阿爾托莉雅-Saber'];
// 地點×角色 氛圍標籤(資料驅動，往陣列塞一筆 SEED_SERVANTS 的 id 就能加，不動抽選邏輯)：
//   查無標籤或抽不中標籤池時退回全女性保底池KANSHOU_ENCOUNTER_FEMALE_IDS_；不含
//   KANSHOU_SUMMON_BLOCKED_IDS_裡暫時移出的id，避免巧遇到根本無法被正式召喚入駐的人。
const KANSHOU_LOCATION_TAGS_ = {
  '河邊小徑': ['斯卡哈-Lancer', '美杜莎-Rider'],
  '商店街': ['美遊-Saber', '藤村大河-Master'],
  '古老神社': ['美狄亞-Caster'],
  '社區公園': ['小黑-Archer', '伊莉雅絲菲爾-Master'],
  '咖啡廳': ['阿爾托莉雅-Saber'],
  '便利商店': ['遠坂凜-Master'],
  '書店二樓': ['美杜莎-Rider'],
  '廢棄神社': ['間桐櫻黑化-Master']
};
// 🏷️ 2026-07「移動過去 他們必須是要在打工或是消費活動...不然聊一聊會不會忘記他是在工作」玩家
//   定案：商業性質地點給一句「當下在做什麼」的輕量敘事引子，讓AI對「為什麼她在這個店裡」有個
//   合理交代、且整回合對話都能維持一致(不需要持久狀態——每回合都直接依她當下真實LOC現查現算，
//   本來就不會忘記；純寫死的地點→活動對照表，沒有寫死的地點沒有這句提示，AI自然發揮，不受限)。
// 🎲 2026-07 玩家「有時打工有時當客人」：每地點改成多個活動變體(店員側/客人側/自然變化)，
//   用「名字+日期+地點」決定性挑選(kanshouLocActivity_)——同一人同一天同地點恆同一個(聊到一半
//   不會店員忽然變客人)，跨日/換人/換地自然輪替。零持久化、每回合現算。
const KANSHOU_LOCATION_ACTIVITY_ = {
  '咖啡廳': ['正在這裡打工，忙著沖泡咖啡、招呼客人', '今天是客人，正坐在窗邊慢慢啜著熱咖啡', '正在櫃檯前排隊點單，琢磨要喝什麼'],
  '便利商店': ['正在這裡打工值班，忙著上架與結帳', '今天是客人，正在店裡挑著零食與飲料', '正站在雜誌架前隨手翻閱'],
  '商店街': ['正在這裡逛街購物，挑揀著攤位上的東西', '正幫熟識的店家顧攤，招呼過路客人', '正提著剛買的東西，邊走邊吃小點心'],
  '書店二樓': ['正在這裡挑書、翻閱架上的書籍', '正幫店裡整理書架，把書一一歸位', '正窩在角落的椅子上安靜讀書'],
  '河邊小徑': ['正沿著河堤散步或慢跑，吹著河風', '正坐在河堤邊發呆，看著水面波光'],
  '古老神社': ['正在參拜或幫忙打掃境內，神色安寧', '正坐在石階上休息，望著鳥居出神'],
  '社區公園': ['正在公園裡消磨時光，看孩子嬉鬧或餵著鴿子', '正坐在鞦韆上輕輕晃著，神情放鬆'],
  '屋頂花園': ['正倚著欄杆眺望城市風景，放空發呆', '正給花圃澆水、撥弄葉片'],
  '老道場': ['正在道場裡晨練或擦拭木地板，一身汗水', '正坐在道場邊緣休息，擦著汗喝水'],
  '山間小徑': ['正在山道上健行，享受林蔭與鳥鳴', '正停在展望點，眺望山下的街景'],
  '隱藏溫泉': ['正泡在溫泉裡放鬆，神情舒暢', '正坐在池邊泡腳，臉頰微微發紅'],
  '廢棄神社': ['正獨自待在荒草間，靜靜出神', '正蹲在殘破的石燈籠旁，若有所思']
};
// 決定性挑活動：hash(名字+日+地點) % 變體數——不存狀態、重跑同回合結果不變(冪等)。
function kanshouLocActivity_(loc, name, day) {
  const opts = KANSHOU_LOCATION_ACTIVITY_[loc];
  if (!opts || !opts.length) return "";
  const key = String(name || "") + "#" + (parseInt(day, 10) || 0) + "#" + String(loc || "");
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return opts[h % opts.length];
}
// kanshouRollEncounter_的保底池：純女性名單(衛宮士郎-Master仍整個移出巧遇/召喚相關名單)。
//   不含KANSHOU_SUMMON_BLOCKED_IDS_暫時移出的id。
const KANSHOU_ENCOUNTER_FEMALE_IDS_ = ['阿爾托莉雅-Saber', '美杜莎-Rider', '美狄亞-Caster', '斯卡哈-Lancer', '美遊-Saber', '小黑-Archer', '遠坂凜-Master', '伊莉雅絲菲爾-Master', '間桐櫻黑化-Master', '藤村大河-Master'];
// 同地點AI詳細卡片上限(見actionPlay的partyRows)——同地點的人湊在一起時的prompt篇幅上限。
const KANSHOU_PARTY_DETAIL_CAP_ = 5;
// 世界概況(輕量版)名單上限——同伴一多，每回合都列全部人+所在地會讓提示詞無限膨脹，只取好感前幾位。
const KANSHOU_WORLD_ROSTER_CAP_ = 8;
// 橋段庫：GAS先決定「觸發條件」與「這次走向」，AI只負責照著選中的走向演出具體細節，玩家不必
//   自己打字下劇本。之後想加新橋段，往這裡加一筆即可，不必另開一條平行的敘事管線。branches
//   依bond由高到低排列，取第一個bond達標的當作這次走向。
//   每筆橋段除branches外帶4個演出欄位({n}=候選人真名，後端替換)：label=前端邀請框文字、
//   btn=按鈕字、verb=接受後提示詞的動作前綴(「${verb}『名字』」要讀得通順)、intent=玩家意圖句。
const KANSHOU_SCENE_EVENTS_ = {
  夜襲: {
    label: '🌙 「{n}」似乎還醒著，要不要更靠近一點？', btn: '靠近她',
    verb: '深夜靠近了', intent: '靠近了『{n}』，似乎想更進一步。',
    branches: [
      { min: 60, tag: '先是一驚，隨即化為驚喜，帶著歡喜迎接這個不速之客' },
      { min: 30, tag: '嚇了一跳、又驚又羞，嘴上抵抗、卻沒有真的推拒或喊人' },
      { min: -100, tag: '被嚇得繃緊神經、下意識帶著防備，需要玩家主動放軟才能卸下戒心' }
    ]
  },
  // 跟夜襲同一套「走進同住人房間」觸發框架，只是時段換成清晨——她此刻還在賴床，好感夠高才會
  //   演成黏人不想起床。
  賴床叫醒: {
    label: '☀️ 「{n}」還在賴床……要叫醒她嗎？', btn: '叫醒她',
    verb: '清晨靠近了還在賴床的', intent: '伸手想輕輕叫醒還在賴床的『{n}』。',
    branches: [
      { min: 80, tag: '睡眼惺忪卻格外黏人，緊抓著不放，一副也想拉你一起賴床、捨不得起身的樣子' },
      { min: 40, tag: '被看見還沒睡醒的樣子有些不好意思，睡意未消卻嘴硬要趕人起床' },
      { min: -100, tag: '被突然喚醒嚇了一跳，睡意瞬間清醒、有點防備地拉起被子撐住距離' }
    ]
  },
  // ── 地點橋段(KANSHOU_LOCATION_EVENTS_觸發)：她剛好在特定地點×特定時段，就跳出邀請按鈕 ──
  共浴: {
    label: '🛁 浴室裡傳來水聲——「{n}」正在沐浴……要進去嗎？', btn: '走進浴室',
    verb: '在浴室撞見了正在沐浴的', intent: '推開浴室的門，走向正在沐浴的『{n}』。',
    branches: [
      { min: 70, tag: '微紅著臉卻大方接受，往旁挪出位置邀你一起，甚至自然地替你擦背' },
      { min: 35, tag: '驚呼一聲慌忙遮掩、嘴上罵你不敲門，卻在罵完之後彆扭地默許你留下' },
      { min: -100, tag: '又驚又怒地潑水把你轟出去，隔著門氣鼓鼓地數落，短時間別想再踏進半步' }
    ]
  },
  溫泉同浴: {
    label: '♨️ 氤氳霧氣中「{n}」正在泡湯……要一起泡嗎？', btn: '一起泡湯',
    verb: '在隱藏溫泉遇上了正在泡湯的', intent: '走進霧氣繚繞的溫泉，向泉中的『{n}』打了聲招呼。',
    branches: [
      { min: 70, tag: '大方向你招手讓你一起泡，泡著泡著聊起平時不會說的心裡話，氣氛比泉水更暖' },
      { min: 35, tag: '隔著岩石各泡各的，嘴上說「不許過來」，卻有一搭沒一搭地跟你聊個不停' },
      { min: -100, tag: '警戒地沉到只露出眼睛，跟你保持整池的距離，你一靠近就濺水警告' }
    ]
  },
  膝枕: {
    label: '💤 慵懶的午後——想枕在「{n}」的膝上小憩嗎？', btn: '開口拜託',
    verb: '午後在客廳裡開口拜託了', intent: '在沙發旁鼓起勇氣，向『{n}』提出想枕著她的膝小睡片刻。',
    branches: [
      { min: 70, tag: '輕笑著拍拍自己的膝蓋讓你躺上來，一邊替你梳髮，語氣比平常都溫柔' },
      { min: 35, tag: '紅著臉彆扭答應「就、就一下下」，全程僵硬得不敢亂動，心跳聲藏都藏不住' },
      { min: -100, tag: '一臉錯愕地把抱枕塞過來——「枕這個」，想都別想碰到她的膝蓋' }
    ]
  },
  下廚: {
    label: '🍳 「{n}」正在準備晚餐……要進廚房幫忙嗎？', btn: '進去幫忙',
    verb: '黃昏的廚房裡走近了正在做晚餐的', intent: '挽起袖子走進廚房，想幫『{n}』一起準備晚餐。',
    branches: [
      { min: 70, tag: '自然地遞來圍裙讓你打下手，配合默契得像老夫老妻，不時舀一勺讓你試味道' },
      { min: 35, tag: '嘴硬說不需要幫忙，卻在你接手切菜時偷偷鬆了口氣，開始小聲指揮你' },
      { min: -100, tag: '警惕地護著鍋子不讓你靠近半步，堅稱自己一個人就行，把你請出廚房' }
    ]
  },
  觀星: {
    label: '🌌 夜空清澈——邀「{n}」一起看星星嗎？', btn: '一起看星',
    verb: '夜裡在屋頂花園走近了仰望星空的', intent: '走到『{n}』身旁坐下，一同抬頭仰望星空。',
    branches: [
      { min: 70, tag: '自然地靠上你的肩，指著星空講起她故鄉的星座與往事，聲音比夜色還柔' },
      { min: 35, tag: '並肩坐著保持一個拳頭的距離，聊著聊著話不知不覺多了起來' },
      { min: -100, tag: '淡淡應了聲「你也來了」便繼續望天，各看各的星，偶爾才答一句' }
    ]
  },
  // ── 節慶橋段(KANSHOU_FESTIVAL_EVENTS_觸發)：日曆走到節慶當天×時段吻合×身邊有人 ──
  初詣: {
    label: '🎍 新年初一——邀「{n}」一起去初詣參拜？', btn: '一起初詣',
    verb: '新年初一邀了', intent: '向『{n}』提議一起去神社初詣參拜。',
    branches: [
      { min: 70, tag: '難得盛裝與你並肩參拜，搖鈴合掌許願後，偷偷告訴你她的願望跟你有關' },
      { min: 35, tag: '盛裝被稱讚會不好意思，抽到吉籤便忍不住向你炫耀，一路上話比平常多' },
      { min: -100, tag: '維持著剛好同路的距離感，參拜完便打算離開，你不主動搭話就要走散了' }
    ]
  },
  情人節巧克力: {
    label: '🍫 今天是情人節——去「{n}」身邊看看？', btn: '走向她',
    verb: '情人節這天走近了', intent: '情人節這天，走到『{n}』的面前。',
    branches: [
      { min: 70, tag: '紅著臉塞給你一盒手作巧克力，強調「不是義理」，非要看你當面嚐一口才罷休' },
      { min: 35, tag: '彆扭地遞出一小包「只是練習品」的巧克力，眼睛卻直勾勾盯著你的反應' },
      { min: -100, tag: '手上似乎拿著什麼，見你看過來就藏到身後，堅稱跟你沒有關係' }
    ]
  },
  七夕短冊: {
    label: '🎋 今晚是七夕——邀「{n}」一起掛短冊許願？', btn: '一起許願',
    verb: '七夕夜邀了', intent: '邀『{n}』一起在竹枝上掛短冊許願。',
    branches: [
      { min: 70, tag: '拉著你一起寫短冊，趁你不注意偷看你寫了什麼，自己那張卻遮得死緊' },
      { min: 35, tag: '認真挑了根好竹枝掛上短冊，被問到願望就岔開話題，耳根卻悄悄紅了' },
      { min: -100, tag: '獨自掛完短冊便望著竹枝出神，那個願望，似乎與眼前的你無關' }
    ]
  },
  中秋賞月: {
    label: '🌕 今晚月色正好——邀「{n}」一起賞月？', btn: '一起賞月',
    verb: '中秋夜邀了', intent: '邀『{n}』一起賞中秋的滿月。',
    branches: [
      { min: 70, tag: '分你一半月見糰子，自然地靠著你賞月，輕聲說「明年也要一起看」' },
      { min: 35, tag: '並肩坐著吃糰子，話題繞著月亮打轉，誰都沒敢提「明年」兩個字' },
      { min: -100, tag: '各自賞各自的月，偶爾交換一句客套話，月色再美也照不進兩人之間' }
    ]
  },
  聖誕約會: {
    label: '🎄 今天是聖誕節——邀「{n}」共度聖誕夜？', btn: '交換禮物',
    verb: '聖誕夜邀了', intent: '在聖誕燈飾下，向『{n}』拿出準備好的禮物。',
    branches: [
      { min: 70, tag: '交換禮物時她準備的那份顯然用足了心，燈飾下的她比聖誕樹更耀眼，遲遲捨不得道晚安' },
      { min: 35, tag: '彆扭地拿出「剛好多的」禮物跟你交換，燈飾下走著走著，肩膀的距離悄悄近了半步' },
      { min: -100, tag: '節日的熱鬧反而突顯生疏，禮物客套地收下，道別來得比平常更早' }
    ]
  },
  跨年倒數: {
    label: '🎆 跨年夜——和「{n}」一起倒數迎接新年？', btn: '一起倒數',
    verb: '跨年夜拉著', intent: '拉著『{n}』一起等待跨年的倒數。',
    branches: [
      { min: 70, tag: '倒數到零的瞬間她轉頭看向你，新年的第一句話、第一個擁抱都給了你' },
      { min: 35, tag: '跟著遠處的鐘聲一起倒數，互道新年快樂時，眼神多停留了幾秒' },
      { min: -100, tag: '各數各的倒數，鐘聲響起時只交換了一句形式上的新年快樂' }
    ]
  }
};
// 「同住人房間橋段」依時段對應不同事件(資料驅動，加新時段往這裡加一組band:eventKey即可)：
//   深夜=夜襲、清晨=賴床叫醒。
const KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_ = { '深夜': '夜襲', '清晨': '賴床叫醒' };
// 地點橋段觸發表：她剛好在這個地點×時段吻合→跳出邀請按鈕(同一套offer/accept流程)。
//   加新地點橋段＝這裡加一筆＋KANSHOU_SCENE_EVENTS_加對應事件，不動觸發邏輯。
const KANSHOU_LOCATION_EVENTS_ = {
  '浴室': { eventKey: '共浴', bands: ['夜', '深夜'] },
  '隱藏溫泉': { eventKey: '溫泉同浴', bands: ['午後', '黃昏', '夜'] },
  '客廳': { eventKey: '膝枕', bands: ['午後'] },
  '廚房': { eventKey: '下廚', bands: ['黃昏'] },
  '屋頂花園': { eventKey: '觀星', bands: ['夜', '深夜'] }
};
// 節慶橋段觸發表：日曆走到節慶當天(KANSHOU_FESTIVALS_的month/day)×時段吻合×玩家所在地有同伴
//   →跳出邀請按鈕。key對齊KANSHOU_FESTIVALS_.key。
const KANSHOU_FESTIVAL_EVENTS_ = {
  newyear: { eventKey: '初詣', bands: ['清晨', '午後'] },
  valentine: { eventKey: '情人節巧克力', bands: ['清晨', '午後', '黃昏', '夜'] },
  qixi: { eventKey: '七夕短冊', bands: ['黃昏', '夜', '深夜'] },
  midautumn: { eventKey: '中秋賞月', bands: ['夜', '深夜'] },
  xmas: { eventKey: '聖誕約會', bands: ['黃昏', '夜'] },
  nye: { eventKey: '跨年倒數', bands: ['夜', '深夜'] }
};
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
  // 短名優先(id 唯一對應，不受真名撞名影響)，再退回真名候選比對。
  const n = String(heroName || "").trim();
  for (var cid in KANSHOU_CASUAL_NAME_) { if (KANSHOU_CASUAL_NAME_[cid] === n) return cid; }
  const hero = SEED_SERVANTS.find(h => kanshouNameCandidates_(h.realName).includes(heroName));
  return hero ? hero.id : null;
}
// 🔒 拜訪私人住處門檻：跟屋主(KANSHOU_HERO_HOME_反查)在本局已入駐、且好感≥KANSHOU_VISIT_BOND_(熟識40)
//   才解鎖登門——沒熟到一定程度不好貿然闖進人家家裡。單一真實來源，前端(buildTagsPayload_ unlockedResidences)
//   跟後端移動攔截(actionPlay)共用這個判定。可跨聊天上限：靠赴約(kanshouPromiseMetStr +5·不吃chat ceiling)推過40。
function kanshouResidenceUnlocked_(pcData, residenceName, gameId) {
  if (!residenceName) return false;
  return pcData.some(function (r) {
    if (String(r[COL.PC.FACTION]) !== "從者" || String(r[COL.PC.ID]).startsWith("DEAD_")) return false;
    if (gameId && String(r[COL.PC.GAME_ID] || "") !== gameId) return false;
    const hid = kanshouHeroIdByName_(String(r[COL.PC.NAME]));
    const home = hid && KANSHOU_HERO_HOME_[hid];
    return home === residenceName && (parseInt(r[COL.PC.BOND]) || 0) >= KANSHOU_VISIT_BOND_;
  });
}
// 🐛→✅ 2026-07 稽核抓到的「必爽約陷阱」：約定成立當下有檢查地點解鎖(見actionPlay的_pmLocOk)，
//   但約定成立後、赴約前若好感因其他事件跌破熟識(40)，屋主的私宅會重新上鎖——玩家想赴約走過去卻被
//   kanshouVisitBlockedStr攔在門外，隔天還被系統判「爽約」倒扣好感，兩個機制都各自正確卻互相矛盾。
//   已成立的約定若目的地正是這裡、且還沒過期(day>=curDay)，移動時豁免解鎖檢查——赴約優先於門檻。
function kanshouLocHasPendingPromise_(pcData, loc, curDay, gameId) {
  return pcData.some(function (r) {
    if (gameId && String(r[COL.PC.GAME_ID] || "") !== gameId) return false;
    const p = kanshouGetPromise_(r[COL.PC.MEMORY]);
    return !!(p && p.day >= curDay && p.loc === loc);
  });
}
// 同住人深夜/清晨睡不著出門走走的機率，獨立於一般英靈的homeBias，資料只存一處。
// 幫「不在身邊」的英靈決定當下要去哪——反查KANSHOU_LOCATION_TAGS_有沒有標到這位英靈，有就
//   加權隨機挑一個常去地點，沒標到就全地點隨機挑。hour：深夜/清晨時段大機率改回「她自己原本
//   就有的住處」(KANSHOU_HERO_HOME_，查無就退回通用的「自己的住處」)。
function kanshouRollDailyLocation_(heroName, hour, cohabit) {
  const heroId = kanshouHeroIdByName_(heroName);
  if (hour !== undefined && hour !== null) {
    const band = timeBand_(hour);
    if (cohabit) {
      // 🏠 同居中：深夜大多回「和室」就寢(未命中=在外遊蕩的生活感)、清晨一半還在賴床、
      //   夜間多在家中公共空間活動；白天(清晨/午後/黃昏未命中)照常走下方一般骰出門晃。
      if (band === '深夜' && Math.random() < 0.85) return KANSHOU_COHABIT_ROOM_;
      if (band === '清晨' && Math.random() < 0.5) return KANSHOU_COHABIT_ROOM_;
      if (band === '夜' && Math.random() < 0.75) {
        const homes = KANSHOU_LOCATIONS_.filter(l => l.region === 'home').map(l => l.name);
        return homes[Math.floor(Math.random() * homes.length)];
      }
    } else {
      const homeBias = band === '深夜' ? 0.85 : (band === '清晨' ? 0.5 : 0);
      if (homeBias > 0 && Math.random() < homeBias) {
        return (heroId && KANSHOU_HERO_HOME_[heroId]) || '自己的住處';
      }
    }
  }
  const haunts = heroId ? Object.keys(KANSHOU_LOCATION_TAGS_).filter(loc => KANSHOU_LOCATION_TAGS_[loc].includes(heroId)) : [];
  // 🌙 全地點保底池排除'room'(玩家自己的房間)跟'visit'(別人登記的住處，見KANSHOU_HERO_HOME_)
  //   兩個分區——不同行的英靈不該隨機骰進玩家臥室或別人家裡，那裡只能靠「拜訪」主動走進去，
  //   不是隨機亂晃能撞到的地方；否則沒有haunts標籤/沒有登記住處的英靈可能隨機骰進遠坂邸這種
  //   別人的家，跟夜襲/賴床叫醒橋段「LOC剛好等於某人家」的判定衝突，觸發在錯的人身上。
  //   'home'分區(共用生活空間，客廳/廚房等)不算私人，維持可被隨機骰中。
  const pool = haunts.length ? haunts : KANSHOU_LOCATIONS_.filter(l => l.region !== 'room' && l.region !== 'visit').map(l => l.name);
  return pool[Math.floor(Math.random() * pool.length)];
}
// 真正的西曆年/月/日(每年固定365天、不算閏年，遊戲用途夠精準)，只抓3年區間(見actionPlay的
//   advanceHours上限)不追求無限年份。Day1固定對應12月20日——過幾天日常後 12/25 聖誕、12/31
//   跨年接連到來，新玩家開局就撞得到節慶橋段(見 KANSHOU_FESTIVAL_EVENTS_)。
const KANSHOU_CAL_START_MONTH_ = 12, KANSHOU_CAL_START_DAY_ = 20;
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
// ⏰ 時間隨玩家動作自然流動：一般 AI 敘事回合每次推進幾小時(讓「到處跑卻永遠停在6點」的凍結感消失)。
//   刻意夾在當日 KANSHOU_DAY_LAST_HOUR_(23:00)不跨日——跨日(睡覺)只由「結束一天」儀式負責。
//   0.5＝每個動作約半小時(玩家定案：一小時太久)；時鐘因此支援 X:30，格式化走 kanshouFmtHM_。
const KANSHOU_HOUR_PER_ACTION_ = 1 / 6; // 每動作推進10分鐘(2026-07 玩家「問個菜色都中午了」→半小時太兇)。真要快轉用「⏩下一階段」。
const KANSHOU_DAY_LAST_HOUR_ = 23;
// 小時(可含 .5)→「HH:MM」，支援半小時刻度。
function kanshouFmtHM_(h) {
  var hh = Math.floor(h);
  var mm = Math.round((h - hh) * 60);
  if (mm >= 60) { hh += 1; mm -= 60; }
  return ("0" + hh).slice(-2) + ":" + ("0" + mm).slice(-2);
}
// 天氣文字→小圖示(HUD時鐘旁顯示用)。降水優先判定，再晴，再陰，再風。
function kanshouWeatherEmoji_(w) {
  w = String(w || "");
  if (/雪/.test(w)) return '❄️';
  if (/雷/.test(w)) return '⛈️';
  if (/雨/.test(w)) return '🌧️';
  if (/霧/.test(w)) return '🌫️';
  if (/晴|日|爽|和/.test(w)) return '☀️';
  if (/陰|雲/.test(w)) return '☁️';
  if (/風/.test(w)) return '🌬️';
  return '☀️';
}
// 「跳到時段」＋「時段行動」按鈕都需要前端知道現在幾點——這裡統一格式化成單一真實來源，
//   buildClientState_/actionPlay的回應都呼叫這支，不各自重複拼字串。
// 🩹 2026-07玩家「這要顯示幾年幾月幾號」定案：label從抽象的「第X日」改成實際年月日(跟敘述
//   文字${newDate.year}年${newDate.month}月${newDate.day}日同一種格式)，跳節慶/大跳躍後玩家
//   能親眼確認日期真的有推進，不會看起來像卡住不動。
function kanshouClockInfo_(pcRow) {
  const day = parseInt(pcRow[COL.PC.DAY]) || 1;
  const hour = (pcRow[COL.PC.HOUR] === "" || pcRow[COL.PC.HOUR] == null) ? 8 : (parseFloat(pcRow[COL.PC.HOUR]) || 0);
  const band = timeBand_(hour);
  const d = kanshouAbsDayToDate_(day);
  const wx = kanshouWeather_(day);
  const loc = String(pcRow[COL.PC.LOC] || "").trim();
  // month/dayOfMonth：前端「睡前爽約警示」要跟同伴 promise.date('M/D') 比對今天日期用。
  return { day: day, hour: hour, band: band, weather: wx, month: d.month, dayOfMonth: d.day, label: (loc ? "📍" + loc + "　" : "") + d.year + "年" + d.month + "月" + d.day + "日・" + kanshouFmtHM_(hour) + "・" + band + "・" + kanshouWeatherEmoji_(wx) + wx };
}

// 結束一天(準備就寢)時的機率事件，命中就先不推進日期、改讓前端跳出開門/不予理會。
const KANSHOU_KNOCK_CHANCE_ = 0.2;  // 每次「結束一天」的敲門機率
// 🚪 深夜敲門的候選門檻：只有同居、或好感≥此值(親近的人)的同伴才會半夜登你家門——泛泛之交
//   半夜跑來敲門跟「陌生人世界」設定矛盾。要更容易撞見改小、要只限同住改大即可。
const KANSHOU_KNOCK_MIN_BOND_ = 60;

// 好感≥80觸發同床共枕的那次結束一天，順手記一筆「今晚共度良宵的對象」，下一回合(不論玩家做
//   什麼)讀一次就清掉(一次性旗標)，餵進提示詞當【晨間餘韻】引子。刻意不斷言「一定發生了」，
//   交給AI依上一回合實際演出內容判斷要不要接續。
var KANSHOU_MORNING_AFTER_TAG_ = makeTextTag_('晨間餘韻');
// 🎭 橋段當日戳(存該同伴列MEMORY·absDay)：同一位同伴、同一天，只有第一次接受橋段才給
//   KANSHOU_SCENE_BOND_ 好感——防「靠近她/叫醒她」按鈕在同地×時段吻合時每 0.5h 重覆刷 +3、
//   繞過細水長流節奏。0=今天尚未經歷橋段。橋段敘事本身照演，只擋重覆加好感。
var KANSHOU_SCENE_DAY_TAG_ = makeIntTag_('橋段日', 0);
// 📅 初見日(存該同伴列MEMORY·absDay)：首次跟玩家同地當下蓋戳，之後相識滿7/30/100/365天且人
//   在場時餵一行紀念日提示。0=尚未記錄(舊存檔首次相遇當天補戳，從那天起算)。
var KANSHOU_FIRST_MET_DAY_TAG_ = makeIntTag_('初見日', 0);
// 📅 約定 2.0(存該同伴列MEMORY)：【約定】absDay:時段:地點＝「那天午後在X見」。同時只存一筆(新約蓋舊約)。
//   band 為 KANSHOU_APPT_BANDS_ 之一(午後/黃昏/夜)；舊格式【約定】day:loc(無時段)向後相容＝整天有效。
// 約定時刻表：她提前10分到場、準時窗=[時刻-10分, 時刻+30分]、之後~2h算遲到、整天沒去=爽約。排除
//   清晨/深夜(約會不約6點或半夜)。UI 用 band key、顯示名見 label。
var KANSHOU_APPT_BANDS_ = [
  { band: '午後', hour: 14, label: '午後 14:00' },
  { band: '黃昏', hour: 18, label: '黃昏 18:00' },
  { band: '夜',   hour: 20, label: '夜晚 20:00' }
];
// 🔒 性格鎖(存玩家御主列 MEMORY·【性格鎖】對外性格,喜歡)：玩家用改命【自訂】的性格格會登記在此，
//   AI 的 master_note 側寫【只更新沒被鎖的格】、絕不覆寫玩家自訂的——區分「玩家設的(鎖死)」vs
//   「AI 自己設的(可持續 refine)」，解決「AI 第一次寫完就再也不改」的問題。經歷不鎖(玩家改命=修正，
//   AI 之後照樣滾動)、只鎖離散的性格四格。
function kanshouGetPrefLocks_(memory) {
  const m = String(memory || "").match(/【性格鎖】([^｜【】]*)/);
  return m ? m[1].split(",").map(function (s) { return s.trim(); }).filter(Boolean) : [];
}
function kanshouSetPrefLocks_(memory, keysArr) {
  const cleared = String(memory || "").replace(/｜?【性格鎖】[^｜【】]*/g, "").replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  if (!keysArr || !keysArr.length) return cleared;
  return (cleared ? cleared + "｜" : "") + "【性格鎖】" + keysArr.join(",");
}
// 🌀 側寫節流：master_note(經歷/性格/萌點)每回合都問會分散 AI 對敘事的注意力。改成每 N 回合才把
//   master_note 放進 schema，其餘回合 AI 完全不知道有這回事、專心寫敘事。計數存玩家列 MEMORY——該列
//   每回合本就必寫回(pcIndex 恆在 dirtyPcRows)，故零額外 round-trip。N=3 剛好貼齊 6筆/3輪 的歷史窗。
const KANSHOU_SIDEWRITE_EVERY_ = 3;
function kanshouGetSideWriteCount_(memory) {
  const m = String(memory || "").match(/【側寫計數】(\d+)/);
  return m ? (parseInt(m[1], 10) || 0) : 0;
}
function kanshouSetSideWriteCount_(memory, n) {
  const cleared = String(memory || "").replace(/｜?【側寫計數】\d*/g, "").replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  return (cleared ? cleared + "｜" : "") + "【側寫計數】" + (parseInt(n, 10) || 0);
}
function kanshouApptHour_(band) {
  var b = KANSHOU_APPT_BANDS_.find(function (x) { return x.band === band; });
  return b ? b.hour : null; // null=舊格式無時段(整天有效·向後相容)
}
function kanshouGetPromise_(memory) {
  const m = String(memory || "").match(/【約定】(\d+):([^｜【】]+)/);
  if (!m) return null;
  const parts = String(m[2]).split(':'); // 新:band:loc(2段) 舊:loc(1段)。band/loc 皆不含冒號
  const band = parts.length >= 2 ? parts[0].trim() : "";
  const loc = (parts.length >= 2 ? parts[1] : parts[0]).trim();
  return { day: parseInt(m[1]), band: band, loc: loc };
}
function kanshouClearPromise_(memory) {
  return String(memory || "").replace(/｜?【約定】\d+:[^｜【】]*/g, "").replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
}
function kanshouSetPromise_(memory, absDay, loc, band) {
  const s = kanshouClearPromise_(memory);
  const mid = (band ? band + ":" : "") + loc; // 有時段才寫 band:，無則沿用舊格式
  return (s ? s + "｜" : "") + "【約定】" + absDay + ":" + mid;
}
// 有時段的約定：她約定時刻前10分到場、待到時刻+2h(碰面窗過了自然離開，不整天空等)；無時段(舊)=整天釘。
//   curHour 供時段判定；沒傳(舊呼叫)則退回整天釘、不破壞既有行為。
function kanshouPromisePin_(row, absDay, curHour) {
  const p = kanshouGetPromise_(row[COL.PC.MEMORY]);
  if (!p || p.day !== absDay) return null;
  const ah = kanshouApptHour_(p.band);
  if (ah === null || typeof curHour !== 'number') return p.loc; // 無時段或沒傳時→整天釘(相容)
  return (curHour >= ah - 1 / 6 && curHour < ah + 2) ? p.loc : null;
}
// 🏠 同居(存該同伴列MEMORY·【同居】1)：好感≥KANSHOU_COHABIT_BOND_且本人在場才邀得成。
//   同居後行程骰改走同居版(見kanshouRollDailyLocation_)：深夜85%回「和室」就寢(15%在外遊蕩)、
//   清晨50%還在和室賴床、夜間75%在家中公共空間活動，白天照常出門過她自己的生活。
var KANSHOU_COHABIT_TAG_ = makeIntTag_('同居', 0);
// 🤝 牽手(存玩家列·單一對象)：選定的同行對象，移動時她若同地就一定跟著走(優先但不獨佔——睡覺
//   仍看好感80+全部，見結束一天邏輯)。放手=清空。她只是「優先帶走」的標記，不影響她的獨立生活。
var KANSHOU_HANDHOLD_TAG_ = makeTextTag_('牽手');
const KANSHOU_COHABIT_BOND_ = 90;
// 🔒 登門拜訪私人住處(region:'visit')的好感門檻＝熟識的朋友(見 KANSHOU_REL_TIER_ 的40切點)。
const KANSHOU_VISIT_BOND_ = 40;
const KANSHOU_COHABIT_ROOM_ = '和室';
function kanshouIsCohabit_(row) { return KANSHOU_COHABIT_TAG_.get(row[COL.PC.MEMORY]) > 0; }
// 🎀 小道具(存該同伴列MEMORY·【小道具】id1:強度1,id2:強度2,...·多件同時裝備·逗號分隔比照【性格鎖】
//   同款寫法)：玩家UI手動裝備/移除/調強度(kanshouOwnedRowIdx_驗過才動)，GAS直接寫，不靠AI自己判斷
//   要不要記——這是2026-07「幫她戴貓耳朵過幾輪就忘記」問題的根治版：不持久的設定改走這條「機制
//   保證」路徑，而非指望AI每次都正確判斷「這算不算變化」。資料驅動：之後想加項圈/眼罩/手銬之類，
//   只要往KANSHOU_PROPS_加一筆，前端清單自動跟著長。hasIntensity=true的道具額外支援強度分級
//   (KANSHOU_PROP_LEVELS_)；false的只有戴上/移除二態(level固定"戴著")。
const KANSHOU_PROPS_ = [
  { id: 'egg_vibrator', name: '跳蛋', hasIntensity: true }
];
const KANSHOU_PROP_LEVELS_ = ['關閉', '微弱', '中等', '強勁'];
// 🔒 2026-07 玩家「AI也不能反抗，感覺缺少鑑賞的感覺」：小道具原本繞過[性格]×[好感]完全不設防，
//   跟親密尺度五階/情慾場「沒到那個地步她會依個性擋下」的精神不一致。**2026-07再修**（玩家「整個
//   小道具直接卡80吧...還沒80都鎖起來」）：一開始只卡「啟動(強度非關閉)」、裝備成關閉/戴著不設限，
//   後來玩家覺得連裝備本身都該卡——好感不夠她根本不會讓你碰，不只是「碰了但不會動」。現版本＝
//   任何等於「新增/切換到某個非空level」的操作(裝備/改強度，含選『關閉』)都卡這個門檻，唯獨
//   **移除**(level空字串)不受限、隨時能拿掉。比照情慾場/無上限同一個切點(戀人80)，不靠AI自己判斷
//   要不要演抵抗(那樣容易出現「機制上開著、敘事卻在抵抗」的矛盾)，直接在GAS這層擋下。
const KANSHOU_PROP_EQUIP_BOND_ = 80;
// 🔢 同時裝備上限(2026-07 玩家「設個上限5個?」)：避免道具無限疊加在同一人身上，只擋「新增裝備」，
//   已裝備項目調強度/移除不受此限——判準看propId是否已在該同伴的已裝備清單裡。
const KANSHOU_PROP_EQUIP_CAP_ = 5;
// 🎀 自訂道具(玩家自建·存玩家列MEMORY【自訂道具】name1:hasIntensity1:part1,name2:hasIntensity2:part2,...)：
//   內建KANSHOU_PROPS_清單之外，玩家可自己命名新增(2026-07「不能玩家自己新增?」)。跟內建清單合併
//   使用同一套KANSHOU_PROP_LEVELS_強度階，不重新發明標籤。上限KANSHOU_CUSTOM_PROP_CAP_筆。part(部位)
//   選填，留空由AI自行決定戴在哪(2026-07「選填吧...沒有就AI自己想辦法發揮」)。
const KANSHOU_CUSTOM_PROP_CAP_ = 10;
function kanshouGetCustomProps_(memory) {
  const m = String(memory || "").match(/【自訂道具】([^｜【】]*)/);
  if (!m || !m[1]) return [];
  return m[1].split(',').filter(Boolean).map(function (pair) {
    const parts = pair.split(':');
    return { id: parts[0], name: parts[0], hasIntensity: parts[1] === '1', part: parts[2] || '' };
  });
}
function kanshouSetCustomProps_(memory, arr) {
  const cleared = String(memory || "").replace(/｜?【自訂道具】[^｜【】]*/g, "").replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  if (!arr || !arr.length) return cleared;
  const joined = arr.map(function (p) { return p.id + ':' + (p.hasIntensity ? '1' : '0') + ':' + (p.part || ''); }).join(',');
  return (cleared ? cleared + "｜" : "") + "【自訂道具】" + joined;
}
// 通用【tag】值淨化：清掉標籤分隔字元(,/:/｜/【/】)避免撐破 MEMORY 裡任何單值 tag 的格式(自訂道具
//   名稱/部位、住所名…)，順手也清掉引號/角括號(防止原樣塞進前端onclick屬性時破壞HTML)。maxLen不帶
//   預設8。🐛→✅ 稽核比對 solo Router_Creation.gs 的同款清洗(cleanTagText_/_fClean)發現那邊多清
//   \n\r\t(換行/tab)這裡沒清——雖不會撐破｜【】格式(regex排除集本就含隱式匹配換行)，但跟既有
//   慣例對齊，一併補上。
function kanshouSanitizeTagValue_(value, maxLen) {
  return String(value || "").replace(/[,:｜【】"'<>\n\r\t]/g, "").trim().slice(0, maxLen || 8);
}
// 內建＋玩家自訂合併後的完整道具目錄(查找/顯示用)——傳玩家列(KPC_)的MEMORY進來。
function kanshouAllProps_(playerMemory) {
  return KANSHOU_PROPS_.concat(kanshouGetCustomProps_(playerMemory));
}
// catalog 可選：不傳就只認內建清單(舊呼叫相容)；要認得玩家自訂道具的呼叫端請傳 kanshouAllProps_(...)。
function kanshouGetProps_(memory, catalog) {
  const m = String(memory || "").match(/【小道具】([^｜【】]*)/);
  if (!m || !m[1]) return [];
  const cat = catalog || KANSHOU_PROPS_;
  return m[1].split(',').filter(Boolean).map(function (pair) {
    const parts = pair.split(':');
    const id = parts[0], level = parts[1] || '';
    const def = cat.find(function (p) { return p.id === id; });
    return { id: id, name: def ? def.name : id, hasIntensity: def ? def.hasIntensity : false, level: level, part: (def && def.part) || '' };
  });
}
function kanshouSetProps_(memory, propsArr) {
  const cleared = String(memory || "").replace(/｜?【小道具】[^｜【】]*/g, "").replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  if (!propsArr || !propsArr.length) return cleared;
  const joined = propsArr.map(function (p) { return p.id + ':' + p.level; }).join(',');
  return (cleared ? cleared + "｜" : "") + "【小道具】" + joined;
}
// 切換單一道具：level空字串＝移除該項、非空＝裝備/改強度，其餘已裝備道具原樣保留。不做好感檢查
// (純資料層工具函式)——好感門檻在呼叫端(actionKanshouSetProp/actionKanshouAddCustomProp)判斷。
function kanshouToggleProp_(memory, propId, level) {
  const rest = kanshouGetProps_(memory).filter(function (p) { return p.id !== propId; });
  if (level) rest.push({ id: propId, level: level });
  return kanshouSetProps_(memory, rest);
}
// 📷 相簿(拍照收集·2026-07玩家定案)：A案色卡寶麗來(不畫人·時段色調×天氣×髮色標記)、每日底片
//   KANSHOU_FILM_PER_DAY_張、隔天沖洗(拍攝日<今天才看得到敘述)、親密可拍、每局上限
//   KANSHOU_ALBUM_CAP_張(滿了要刪舊照)。小敘述由AI在拍照當回合的回應JSON多吐photo_caption
//   (同一次呼叫·零額外round-trip)，AI沒吐才用模板保底。
const KANSHOU_FILM_PER_DAY_ = 3;
const KANSHOU_ALBUM_CAP_ = 100;
// 相簿分頁(lazy建表)。欄位位置索引：0遊戲ID/1照片ID/2拍攝日/3時段/4地點/5天氣/6人物(、連接)/
//   7活動/8小敘述/9旗標(親密·節慶名)/10髮色hex
function kanshouAlbumSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('相簿');
  if (!sh) { sh = ss.insertSheet('相簿'); sh.appendRow(['遊戲ID', '照片ID', '拍攝日', '時段', '地點', '天氣', '人物', '活動', '小敘述', '旗標', '髮色']); }
  return sh;
}
// 底片(存玩家MEMORY)：【底片】day:used——day跟今天不符＝新的一天自動歸零，不需排程重置。
function kanshouFilmUsed_(memory, day) {
  const m = String(memory || "").match(/【底片】(\d+):(\d+)/);
  return (m && parseInt(m[1]) === day) ? parseInt(m[2]) : 0;
}
function kanshouFilmStamp_(memory, day, used) {
  const s = String(memory || "").replace(/｜?【底片】\d+:\d+/g, "").replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  return (s ? s + "｜" : "") + "【底片】" + day + ":" + used;
}
// 髮色解析：從角色TRAIT(dailyLook外貌段)文字抓色詞→hex——種子/工房新角色通吃(dailyLook建檔時
//   必生成)、永遠零手工；順序敏感(深紫在紫前、紅褐在紅/褐前)，查無色詞退回中性深棕。
const KANSHOU_HAIR_COLORS_ = [
  ['深紫', '#4a3a5e'], ['紫', '#7a5a9a'], ['金', '#e8c86a'], ['白髮', '#e8e4ea'], ['銀', '#d8d8e0'],
  ['黑', '#241f2e'], ['紅褐', '#8a4a34'], ['栗色', '#8a5a3a'], ['褐', '#6a4a34'], ['棕', '#6a4a34'],
  ['藍', '#4a6a9a'], ['粉', '#d88aa8'], ['青綠', '#5a9a8a'], ['綠', '#5a8a6a'], ['紅', '#b04a3a'], ['橙', '#c87a3a']
];
function kanshouHairHex_(lookText) {
  const s = String(lookText || "");
  for (let i = 0; i < KANSHOU_HAIR_COLORS_.length; i++) {
    if (s.indexOf(KANSHOU_HAIR_COLORS_[i][0]) >= 0) return KANSHOU_HAIR_COLORS_[i][1];
  }
  return '#5a4a3e';
}
const KANSHOU_ANNIV_MILESTONES_ = [7, 30, 100, 365];
// ☁️ 今日天氣(純敘事·不存表)：依月份查季節池、依日數確定性雜湊挑一項——同一天永遠同一個天氣、
//   跨日自然換，零round-trip零寫入。
const KANSHOU_WEATHER_BY_SEASON_ = {
  winter: ['晴朗清冷', '陰天', '小雪紛飛', '大雪初霽', '寒風凜冽'],
  spring: ['風和日麗', '花瓣隨風', '細雨綿綿', '多雲舒爽'],
  summer: ['烈日當空', '晴朗悶熱', '午後雷陣雨', '蟬鳴燥熱'],
  autumn: ['秋高氣爽', '涼風習習', '陰天微涼', '細雨薄霧']
};
function kanshouWeather_(absDay) {
  const d = kanshouAbsDayToDate_(absDay);
  const season = (d.month === 12 || d.month <= 2) ? 'winter' : d.month <= 5 ? 'spring' : d.month <= 8 ? 'summer' : 'autumn';
  const pool = KANSHOU_WEATHER_BY_SEASON_[season];
  return pool[((absDay * 1103515245 + 12345) >>> 16) % pool.length];
}
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
// MEMORY標記存取器【住所】：玩家自訂的「家」顯示名稱，查無標記時預設「我家」(中性·自創御主
//   通用；玩家仍可隨時改名)，比照 getOutfit_/setOutfit_ 同款「清除舊值再整段append」寫法。
function getKanshouHomeName_(memory, playerName) {
  const m = String(memory || "").match(/【住所】([^｜【】]*)/);
  const nm = m ? m[1].trim() : "";
  // 未自訂時預設「(玩家名)的家」——讓玩家與AI都一眼看出這是御主自己的家；無名字才退回「我家」。
  const dflt = String(playerName || "").trim() ? String(playerName).trim() + "的家" : "我家";
  return nm || dflt;
}
function setKanshouHomeName_(memory, name) {
  const s = String(memory || "");
  const cleaned = s.replace(/｜?【住所】[^｜【】]*/g, "");
  // 🐛→✅ 稽核抓到：原本沒清掉｜/【/】等標籤分隔字元，玩家取名帶這些字元會撐壞這行MEMORY格式
  //   (讀取時regex在第一個｜就截斷，殘餘字變成脫隊在tag外的孤兒文字)。比照自訂道具同款淨化。
  const safe = kanshouSanitizeTagValue_(name, 12) || "我家";
  return (cleaned ? cleaned + "｜" : "") + "【住所】" + safe;
}
// 部分英靈殿角色的 realName 帶括號附註(如「克洛伊·馮·愛因茲貝倫（Archer install）」)，AI 敘事自然只會用括號前後其中
//   一段稱呼TA，但 rel_changes[].target 等比對要求逐字完全相符——會悄悄比對失敗、整條被跳過。
//   抽出候選字串(全名/括號前/括號內)供比對，不用改動任何一位角色的既有 realName 資料。
// 🏷️ 日常稱呼(2026-07 玩家定案「姓氏太多餘、名字太正式」)：鑑賞的世界一律用短名/職階稱呼。
//   keyed by SEED id(名字可能撞、id 唯一)。⚠ 種子庫只有一位櫻(id 間桐櫻黑化-Master·真名間桐櫻)，
//   直接叫「櫻」。英靈殿/solo 不動，只有鑑賞建列與敘事用短名。
const KANSHOU_CASUAL_NAME_ = {
  '阿爾托莉雅-Saber': 'SABER',
  '美杜莎-Rider': 'RIDER',
  '伊莉雅絲菲爾-Master': '伊莉雅',
  '間桐櫻黑化-Master': '櫻',
  '遠坂凜-Master': '凜',
  '藤村大河-Master': '大河',
  '衛宮士郎-Master': '士郎'
};
// 全名↔短名雙向別名(名字比對的橋)：舊存檔列/歷史/AI 引用不論寫哪一種都對得上人。
const KANSHOU_NAME_ALIAS_ = {
  '阿爾托莉雅·潘德拉貢': ['SABER'], 'SABER': ['阿爾托莉雅·潘德拉貢'],
  '美杜莎': ['RIDER'], 'RIDER': ['美杜莎'],
  '伊莉雅絲菲爾': ['伊莉雅'], '伊莉雅': ['伊莉雅絲菲爾'],
  '間桐櫻': ['櫻'], '櫻': ['間桐櫻'],
  '遠坂凜': ['凜'], '凜': ['遠坂凜'],
  '藤村大河': ['大河'], '大河': ['藤村大河'],
  '衛宮士郎': ['士郎'], '士郎': ['衛宮士郎']
};
// 顯示用短名：有登記用短名，沒登記(工房原創/男性英靈等)維持原名。
function kanshouCasualOf_(hero) { return (hero && (KANSHOU_CASUAL_NAME_[String(hero.id)] || hero.realName)) || ""; }
function kanshouNameCandidates_(fullName) {
  const s = String(fullName || "").trim();
  const m = s.match(/^(.*?)[（(]([^（()）]*)[）)]\s*$/);
  const base = m ? [s, m[1].trim(), m[2].trim()].filter(Boolean) : [s];
  // 疊上日常稱呼別名(全名↔短名)，任何一種寫法都算同一個人。
  const out = base.slice();
  base.forEach(n => (KANSHOU_NAME_ALIAS_[n] || []).forEach(a => { if (out.indexOf(a) === -1) out.push(a); }));
  // 🛡️ 拉丁字母大小寫寬容(SABER/Saber/saber)：AI 對英文名很常自行正規化大小寫，精確比對會
  //   讓 rel_changes/intimacy_feedback/npc_exit 整條靜默失效——含英文的候選補上三種寫法。
  out.slice().forEach(n => {
    if (/[A-Za-z]/.test(n)) {
      [n.toUpperCase(), n.toLowerCase(), n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()].forEach(v => { if (out.indexOf(v) === -1) out.push(v); });
    }
  });
  return out;
}

// 🔒 併發保護（2026-07 全面稽核·兩組獨立agent各自抓到同一根因）：actionPlay 故意豁免全域鎖
//   (見 Router_Action.gs LOCK_EXEMPT_ACTIONS_，理由是AI呼叫4-5秒~最壞49秒不等，鎖全域會拖累其他
//   玩家)，但寫回機制是「整表快照→本回合全部改動只在記憶體→結尾整列覆寫」(見下方dirtyPcRows)，
//   若同一個pcId的兩次呼叫執行窗口重疊(同帳號兩分頁/兩裝置同時操作、或聊天等AI回應時另開改命
//   視窗存檔)，後flush的請求會用自己那份舊快照整列覆寫掉先flush者的所有改動——不分青紅皂白，
//   好感/MEMORY標記/服裝/技巧全部蓋掉。這裡不加全域鎖(仍會拖累其他玩家)，改用CacheService做
//   「同一pcId」的軟性互斥：偵測到同pcId仍有一次actionPlay在跑，直接拒絕本次待玩家稍候，不讓
//   兩者的整列覆寫互相競速。
function actionPlay(userData, pcId, sheets) {
  const _lockKey = "kplay_" + String(pcId || "");
  const _cache = CacheService.getScriptCache();
  if (_cache.get(_lockKey)) return JSON.stringify({ success: false, message: "上一步還在處理中，請稍候片刻再送出。" });
  _cache.put(_lockKey, "1", 90); // 90秒涵蓋最壞情境(降階重試~49秒)+安全margin，逾時自動失效不會卡死
  try {
    return actionPlay_(userData, pcId, sheets);
  } finally {
    _cache.remove(_lockKey);
  }
}

function actionPlay_(userData, pcId, sheets) {
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

  // 🔒 帳號歸屬驗證（2026-07 稽核抓到的漏洞補上）：pcId(KPC_+時間戳)理論上可預測/枚舉，此前
  //   這裡只用裸 findIndex 信任呼叫者聲稱的 pcId，等於整個 actionPlay(讀寫好感/地點/回憶/相簿門檻
  //   全靠這裡)完全沒查是不是呼叫者本人的帳號——其餘6個kanshou handler都有比照kanshouOwnedRowIdx_
  //   反查帳號表，唯獨系統負擔最重、寫入面最廣的這裡漏了。
  const acctName = String(userData.acctName || "").trim();
  const pcIndex = kanshouOwnedRowIdx_(pcData, pcId, acctName);
  if (pcIndex === -1) return JSON.stringify({ text: "查無此人", people: [] });
  const pc = pcData[pcIndex];
  const pcName = pc[COL.PC.NAME];
  let curL = pc[COL.PC.LOC];
  // ⏰ 2026-07「推進時間」玩法：鑑賞借用solo既有的COL.PC.DAY/HOUR欄位存自己的時鐘(兩軌從不共用
  //   同一個game_id，欄位互不干擾)，不另開新欄。查無值(舊存檔/尚未跑過這輪改動)時給預設(Day1 08:00)。
  let curDay = parseInt(pc[COL.PC.DAY]) || 1;
  let curHour = (pc[COL.PC.HOUR] === "" || pc[COL.PC.HOUR] == null) ? 8 : (parseFloat(pc[COL.PC.HOUR]) || 0);
  let jumpFest = null; // 🎊 有跳到節慶時記著，餵進下方提示詞當氛圍靈感(見★【氛圍靈感·非強制】)

  // 鑑賞地點移動：前端點選地點按鈕時帶 moveTarget，跟一般對話同一次 round-trip 解決——比對
  //   KANSHOU_LOCATIONS_ 合法地點清單，查無效比對一律當成普通對話。
  const moveTarget0_ = KANSHOU_LOCATIONS_.find(l => l.name === String(userData.moveTarget || "").trim());
  // 🔒 拜訪私人住處門檻：跟屋主好感未達熟識(40)前不好貿然登門——擋在移動前，當作沒真的進門(留原地)，
  //   給AI一句在門外卻步的情境，維持她家的私人邊界(前端已把鎖住的住處灰掉，這裡是直打API的後端保底)。
  const _myGid_ = pc && pc[COL.PC.GAME_ID] ? String(pc[COL.PC.GAME_ID]) : "";
  let kanshouVisitBlockedStr = "";
  let moveTarget = moveTarget0_;
  if (moveTarget0_ && moveTarget0_.region === 'visit' && !kanshouResidenceUnlocked_(pcData, moveTarget0_.name, _myGid_) && !kanshouLocHasPendingPromise_(pcData, moveTarget0_.name, curDay, _myGid_)) {
    kanshouVisitBlockedStr = `\n★【登門未果·私人住處】：你來到「${moveTarget0_.name}」門前，卻想起跟這裡的主人還沒熟到能這樣直接登門造訪——演出你在門外停步、終究沒敲門就轉身離開的猶豫即可(不要進屋、不要讓屋主出現、不必解釋機制或提到數值)。`;
    moveTarget = null;
  }
  const moveName = moveTarget ? moveTarget.name : "";
  let finalUserMsg = kanshouVisitBlockedStr
    ? `【玩家意圖】：想直接登門造訪「${moveTarget0_.name}」。`
    : moveTarget
      ? `【玩家意圖】：走向了「${moveName}」，四處看看那裡有什麼、有沒有遇見誰。`
      : `【玩家意圖】：${userMsg}`;

  // 鑑賞世界觀明文禁止任何戰鬥/血量變化/死亡威脅，故不帶 solo 戰鬥引擎的殘留概念(擊倒/復活/
  //   戰敗虛假之夢/剛結盟NPC排除等)。
  const dirtyPcRows = new Set();
  dirtyPcRows.add(pcIndex); // 玩家本人一定會被處理到，先加進去

  const currentAmbition = pc[COL.PC.INTENT] ? String(pc[COL.PC.INTENT]).trim() : "尚無明確目標，隨遇而安。";
  // 玩家自己的換裝(玩家UI設定或AI依appearance_extras更新)，比照【同行夥伴】卡片(partyDetailsArr)
  //   同款「裝扮:XXX(當前服裝·五官體態不變)」格式補上，AI 才能讀到當前實際服裝，而非憑空假設。
  const myOutfit = getOutfit_(pc[COL.PC.MEMORY]);
  // 晨間餘韻：讀一次(上一回合結束一天留下的旗標，若有)就立刻清掉，只讓「緊接著的下一回合」
  //   吃到這個提示詞引子，不論這回合玩家做什麼(聊天/移動/購物皆可)。
  const morningAfterNames = KANSHOU_MORNING_AFTER_TAG_.get(pc[COL.PC.MEMORY]);
  if (morningAfterNames) pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');

  // 實例化：只取自己 game_id 世界內、同地點的人（御主無 game_id 時不過濾，相容舊角色）
  const myGameId = pc && pc[COL.PC.GAME_ID] ? String(pc[COL.PC.GAME_ID]) : "";
  const sameGame = (r) => !myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId;

  // 📅 相約(玩家在同伴卡點「相約」→前端帶promiseMeet{name,loc})：只能跟「此刻在場」的同伴約、
  //   地點限公開清單(不含玩家私室)；成立→她列MEMORY蓋【約定】明日:地點(新約蓋舊約)，約定日她的
  //   行程骰被釘在該地點(見kanshouPromisePin_呼叫端)，赴約/爽約每回合結算(見下方【依約相會】)。
  // 📅🤝 待玩家提議、需她回應的相約/牽手：不在此刻落地狀態，先記下待判定，交由AI依個性與好感決定
  //   接不接受(proposal_accept)，回應後(見下方post-AI區)才真正寫MEMORY——貫徹「意圖非結果」，避免
  //   低好感/矜持角色被系統強制答應(舊做法在按下當回合就寫死tag、提示詞還逼AI演成功)。
  let _pendingProposal = null; // {type:'promise'|'hold', idx, loc?, name?}
  // 📣 成立/婉拒/撲空的明確回饋(相約/牽手/同居/她主動邀約 共用)——pre-AI 撲空婉拒與 post-AI 判定
  //   都可能寫它，一回合只走一條路。宣告須在相約區塊「之前」，撲空案例才寫得進去。
  let kanshouProposalResult_ = null;
  // 🔍 她在哪(撲空提示用)：不限同地找她的列、回報 LOC——玩家本就能從同伴面板看到位置，非洩密。
  const _whereIsHer = (nm) => {
    const _n = String(nm || "").trim();
    const _r = _n ? pcData.find((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(_n)) : null;
    return _r ? String(_r[COL.PC.LOC] || "").trim() : "";
  };
  let kanshouPromiseStr = "";
  if (userData.promiseMeet && typeof userData.promiseMeet === 'object') {
    const _pmName = String(userData.promiseMeet.name || "").trim();
    const _pmLoc = String(userData.promiseMeet.loc || "").trim();
    // 私人住處(visit)未解鎖不可當約定地——約成立後玩家根本進不去(前端灰鎖＋後端擋移動)＝必然爽約陷阱。
    const _pmLocOk = KANSHOU_LOCATIONS_.some(l => l.name === _pmLoc && l.region !== 'room' && (l.region !== 'visit' || kanshouResidenceUnlocked_(pcData, _pmLoc, _myGid_)));
    const _pmIdx = _pmName ? pcData.findIndex((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(_pmName) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()) : -1;
    if (_pmLocOk && _pmIdx !== -1) {
      const _pmBond = parseInt(pcData[_pmIdx][COL.PC.BOND]) || 0;
      const _pmHer = String(pcData[_pmIdx][COL.PC.NAME]);
      // 時段：前端帶 band(午後/黃昏/夜)；不合法或沒帶→退回無時段(舊「整天有效」·向後相容)。
      const _pmBand = kanshouApptHour_(String(userData.promiseMeet.band || "").trim()) !== null ? String(userData.promiseMeet.band).trim() : "";
      const _pmBandLabel = _pmBand ? (KANSHOU_APPT_BANDS_.find(b => b.band === _pmBand) || {}).label : "";
      _pendingProposal = { type: 'promise', idx: _pmIdx, loc: _pmLoc, band: _pmBand, accepted: kanshouProposalAccepts_('promise', _pmBond) };
      kanshouPromiseStr = `\n★【提議·相約·GAS已裁定】你向『${_pmHer}』提議【明天${_pmBandLabel ? _pmBandLabel + '於' : '在'}「${_pmLoc}」見面】。系統已依好感(${_pmBond}/100)裁定她${_pendingProposal.accepted ? '【答應】了——請 narration 依她的個性演出答應的反應（雀躍／害羞／矜持地點頭皆可），系統明天會記得這個約' : '【婉拒】了——請 narration 依她的個性演出婉拒的反應（不好意思／認真說改天／打趣帶過皆可），此約不成立、不必替玩家找補'}。★成敗由系統定，【不可】自行改寫她的決定，只演她的反應。`;
      finalUserMsg = `【玩家意圖】：向『${_pmHer}』提出「明天${_pmBandLabel || ''}在${_pmLoc}見面」的約定。`;
    } else if (_pmName) {
      kanshouPromiseStr = `\n★【相約撲空】：你想找『${_pmName}』相約見面，但她此刻並不在這裡——演出這份撲空的悵然即可，約定沒有成立。`;
      finalUserMsg = `【玩家意圖】：想找『${_pmName}』相約，卻發現她不在身邊。`;
      kanshouProposalResult_ = { ok: false, miss: true, type: 'promise', name: _pmName, where: _whereIsHer(_pmName) };
    }
  }

  // 🚶👋 玩家提議同去(地圖 👋 鈕→proposeMove=地點)：走跟相約/牽手同一條「確定性提議」管線——
  //   pre-AI 記待判定、AI 只需在 proposal_accept 答「接受/婉拒」、接受才出「前往」泡泡(玩家按同意
  //   才真的移動)。2026-07 根因修復：舊版 👋 只送一句閒聊、全押在 AI 自發填 move_proposal 上，
  //   Gemini 從不自發填→玩家從沒見過移動泡泡；改成明確標記後 AI 只做「答不答應」一件事。
  if (userData.proposeMove) {
    const _pvLoc = String(userData.proposeMove).trim();
    const _pvLocOk = KANSHOU_LOCATIONS_.some(l => l.name === _pvLoc && l.region !== 'room') && _pvLoc !== String(curL || "").trim();
    // 提議對象＝此刻在場的同伴(多人在場＝一起邀，以第一位的個性判定；接受後 moveWithCompanion 本就帶同地全部人)。
    const _pvIdx = pcData.findIndex((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim());
    if (_pvLocOk && _pvIdx !== -1) {
      const _pvHer = String(pcData[_pvIdx][COL.PC.NAME]);
      const _pvBond = parseInt(pcData[_pvIdx][COL.PC.BOND]) || 0;
      _pendingProposal = { type: 'move', idx: _pvIdx, loc: _pvLoc, accepted: kanshouProposalAccepts_('move', _pvBond) };
      kanshouPromiseStr += `\n★【提議·同去·GAS已裁定】你向『${_pvHer}』提議【現在一起去「${_pvLoc}」】。系統已依好感(${_pvBond}/100)裁定她${_pendingProposal.accepted ? '【答應】同行——請 narration 依她的個性演出答應的反應' : '【婉拒】了——請 narration 依她的個性演出婉拒的反應'}。本回合【不要】另填 move_proposal，是否動身由系統處理；narration 停在她給出回應的當下，【不可】演出發、走路或抵達。★成敗由系統定，別自行改寫她的決定。`;
      finalUserMsg = `【玩家意圖】：邀身旁的『${_pvHer}』現在一起去「${_pvLoc}」。`;
    } else if (_pvIdx === -1) {
      kanshouPromiseStr += `\n★【提議撲空】：你想邀人一起去「${_pvLoc}」，但此刻身邊沒有同伴——演出這份獨自的悵然即可(玩家可自己用地圖移動)。`;
      finalUserMsg = `【玩家意圖】：想邀同伴一起去「${_pvLoc}」，卻發現身邊沒有人。`;
    }
  }

  // 📅 玩家同意她主動提的約(她 promise_proposal→泡泡→玩家按同意→帶 promiseAccept 回來)：她已開口、
  //   玩家點頭，直接落地【約定】，不走 proposal_accept 二次判定(她不會婉拒自己提的約)。
  //   🔵 2026-07 玩家定案「她約完就走也沒問題」：約是她提的、意思已表達完，契約只差玩家點頭——她還在
  //   不在場【不影響成立】(舊版錯把「玩家發起需對方在場」的規則套過來、擋成撲空，已改)。差別只在敘事：
  //   在場演她聽到答覆的反應；已離場演玩家記下這個約(目送背影/寫進心裡)。
  if (userData.promiseAccept && typeof userData.promiseAccept === 'object') {
    const _paName = String(userData.promiseAccept.name || "").trim();
    const _paLoc = String(userData.promiseAccept.loc || "").trim();
    const _paLocOk = KANSHOU_LOCATIONS_.some(l => l.name === _paLoc && l.region !== 'room');
    const _paBand = kanshouApptHour_(String(userData.promiseAccept.band || "").trim()) !== null ? String(userData.promiseAccept.band).trim() : "";
    const _paIdx = _paName ? pcData.findIndex((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(_paName)) : -1;
    if (_paLocOk && _paIdx !== -1) {
      const _paHer = String(pcData[_paIdx][COL.PC.NAME]);
      const _paBandLabel = _paBand ? (KANSHOU_APPT_BANDS_.find(b => b.band === _paBand) || {}).label : "";
      const _paInScene = String(pcData[_paIdx][COL.PC.LOC] || "").trim() === String(curL || "").trim();
      pcData[_paIdx][COL.PC.MEMORY] = kanshouSetPromise_(pcData[_paIdx][COL.PC.MEMORY], curDay + 1, _paLoc, _paBand);
      dirtyPcRows.add(_paIdx);
      kanshouProposalResult_ = { ok: true, type: 'promise', name: _paHer, loc: _paLoc, bandLabel: _paBandLabel };
      const _paWhen = `【明天${_paBandLabel ? _paBandLabel + '於' : '在'}「${_paLoc}」見面】`;
      kanshouPromiseStr = _paInScene
        ? `\n★【約定·敲定】：你答應了『${_paHer}』的邀約——你們約好${_paWhen}。演出你點頭答應這一刻、她聽到後依性格的反應(雀躍/靦腆/故作淡定皆可)。`
        : `\n★【約定·敲定】：你答應了『${_paHer}』的邀約——你們約好${_paWhen}。她此刻已先離開了，演出你把這個約放進心裡的樣子(目送過的背影/默默記下/一點期待)，約定已確實成立、不必演她在場回應。`;
      finalUserMsg = `【玩家意圖】：答應了『${_paHer}』改天在「${_paLoc}」見面的邀約。`;
    }
  }

  // 🏠 邀請同居(同伴卡「同居」鈕→cohabitInvite=name)：她在場＋好感≥門檻→蓋【同居】標記(行程骰
  //   改走同居版)；好感未達→依性格婉拒、不動任何數值；不在場→撲空。
  let kanshouCohabitStr = "";
  if (userData.cohabitInvite) {
    const _chName = String(userData.cohabitInvite).trim();
    const _chIdx = _chName ? pcData.findIndex((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(_chName) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()) : -1;
    if (_chIdx === -1) {
      kanshouCohabitStr = `\n★【邀請撲空】：你想邀『${_chName}』搬來同住，但她此刻並不在這裡——演出這份撲空的悵然即可。`;
      finalUserMsg = `【玩家意圖】：想邀『${_chName}』搬來一起住，卻發現她不在身邊。`;
      kanshouProposalResult_ = { ok: false, miss: true, type: 'cohabit', name: _chName, where: _whereIsHer(_chName) };
    } else {
      const _chRealName = String(pcData[_chIdx][COL.PC.NAME]);
      if (kanshouIsCohabit_(pcData[_chIdx])) {
        kanshouCohabitStr = `\n★【已在同居】：『${_chRealName}』早就跟你住在同一個屋簷下了——演出她對這個明知故問依性格的反應(好笑/沒好氣/趁機撒嬌皆可)。`;
        finalUserMsg = `【玩家意圖】：又問了『${_chRealName}』要不要搬來一起住。`;
      } else if ((parseInt(pcData[_chIdx][COL.PC.BOND]) || 0) < KANSHOU_COHABIT_BOND_) {
        kanshouCohabitStr = `\n★【同居·婉拒】：你邀『${_chRealName}』搬來同住，但你們的關係還沒深到能同住一個屋簷下——演出她依性格婉拒的反應(害羞岔開/認真說還太早/打趣帶過皆可)，這件事沒有成立、也沒有任何數值變動。`;
        finalUserMsg = `【玩家意圖】：鼓起勇氣邀『${_chRealName}』搬來一起住。`;
        // 📣 走查抓到的資訊黑洞：舊版婉拒只有敘事、無機制回饋，玩家不知道是好感不足還是演出婉拒。
        kanshouProposalResult_ = { ok: false, type: 'cohabit', name: _chRealName };
      } else {
        pcData[_chIdx][COL.PC.MEMORY] = KANSHOU_COHABIT_TAG_.set(pcData[_chIdx][COL.PC.MEMORY], 1);
        dirtyPcRows.add(_chIdx);
        kanshouProposalResult_ = { ok: true, type: 'cohabit', name: _chRealName };
        kanshouCohabitStr = `\n★【同居開始】：『${_chRealName}』答應搬來與你同住了！從今以後她深夜會回這個家的「和室」就寢、清晨可能還賴在被窩、晚間常在家中活動，白天依然過她自己的生活——演出她答應這一刻依性格的反應(欣喜/彆扭/故作平靜皆可)，這是關係的一大步。`;
        finalUserMsg = `【玩家意圖】：鼓起勇氣邀『${_chRealName}』搬來一起住。`;
      }
    }
  }

  // 🏠 玩家同意「她主動邀的同居」(cohabit_proposal→泡泡→cohabitAccept)：玩家總原則「AI給明確答覆、
  //   GAS就寫入——她邀完就走也沒差」。跟上面 cohabitInvite(玩家發起、需她在場被問)是兩條路：這條
  //   是她已開口、只差玩家點頭，找她【不要求同地】、點頭即蓋【同居】。好感門檻仍複驗(防直打API繞過)。
  if (userData.cohabitAccept) {
    const _caName = String(userData.cohabitAccept).trim();
    const _caIdx = _caName ? pcData.findIndex((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(_caName)) : -1;
    if (_caIdx !== -1 && !kanshouIsCohabit_(pcData[_caIdx]) && (parseInt(pcData[_caIdx][COL.PC.BOND]) || 0) >= KANSHOU_COHABIT_BOND_) {
      const _caHer = String(pcData[_caIdx][COL.PC.NAME]);
      const _caInScene = String(pcData[_caIdx][COL.PC.LOC] || "").trim() === String(curL || "").trim();
      pcData[_caIdx][COL.PC.MEMORY] = KANSHOU_COHABIT_TAG_.set(pcData[_caIdx][COL.PC.MEMORY], 1);
      dirtyPcRows.add(_caIdx);
      kanshouProposalResult_ = { ok: true, type: 'cohabit', name: _caHer };
      kanshouCohabitStr = _caInScene
        ? `\n★【同居開始】：你答應了『${_caHer}』的心意——她要搬來與你同住了！深夜她會回這個家的「和室」就寢、清晨可能賴在被窩、晚間常在家中。演出你點頭這一刻、她聽到後依性格的反應(欣喜/彆扭/故作平靜皆可)，這是關係的一大步。`
        : `\n★【同居開始】：你答應了『${_caHer}』想搬來同住的心意。她此刻已先離開了，演出你把這個決定放進心裡的樣子——同居已確實成立，她今晚就會回這個家的「和室」就寢，不必演她在場回應。`;
      finalUserMsg = `【玩家意圖】：答應了『${_caHer}』想搬來一起住的心意。`;
    }
  }

  // 🤝 牽手/放手(同伴卡「牽手」鈕→handHold=name；放手→handHold='__release__')：牽的對象存玩家
  //   MEMORY，移動時她若同地就一定跟著走(見 kanshouPreMoveCompanions_)。牽手要她此刻在場才牽得成。
  let kanshouHandHoldStr = "";
  if (userData.handHold) {
    const _hhArg = String(userData.handHold).trim();
    if (_hhArg === '__release__') {
      const _hhPrev = KANSHOU_HANDHOLD_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]);
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_HANDHOLD_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');
      dirtyPcRows.add(pcIndex);
      kanshouHandHoldStr = _hhPrev ? `\n★【放手】：你輕輕鬆開了與『${_hhPrev}』牽著的手——演出這個自然的放手瞬間即可(不必解釋機制)。` : "";
      if (_hhPrev) finalUserMsg = `【玩家意圖】：鬆開了與『${_hhPrev}』牽著的手。`;
    } else {
      const _hhIdx = pcData.findIndex((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(_hhArg) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim());
      if (_hhIdx === -1) {
        kanshouHandHoldStr = `\n★【牽手落空】：你想牽『${_hhArg}』的手，但她此刻並不在你身邊——演出這份撲空即可。`;
        finalUserMsg = `【玩家意圖】：想牽『${_hhArg}』的手，卻發現她不在身邊。`;
        kanshouProposalResult_ = { ok: false, miss: true, type: 'hold', name: _hhArg, where: _whereIsHer(_hhArg) };
      } else {
        const _hhName = String(pcData[_hhIdx][COL.PC.NAME]);
        const _hhBond = parseInt(pcData[_hhIdx][COL.PC.BOND]) || 0;
        // 牽手tag存在玩家自己列(pcIndex)、值=她的名字；接受與否由AI判定，接受後才在post-AI區寫回。
        _pendingProposal = { type: 'hold', idx: pcIndex, name: _hhName, accepted: kanshouProposalAccepts_('hold', _hhBond) };
        kanshouHandHoldStr = `\n★【提議·牽手·GAS已裁定】你伸手想牽起『${_hhName}』的手。系統已依好感(${_hhBond}/100)裁定她${_pendingProposal.accepted ? '【讓你牽了】——narration 必須真實演出【她的手交到你手中／你們牽起手】的那一刻(不可只碰衣角、拉衣袖之類含糊帶過——那不算牽手)，語氣依其個性（大方／害羞／彆扭皆可）；她接受後，之後你移動她會相伴同行(直到放手)' : '【收回了手】——narration 依其個性演出她收手／避開、沒牽成的反應，不必替玩家找補'}。★成敗由系統定，別自行改寫她的決定。`;
        finalUserMsg = `【玩家意圖】：伸手想牽起『${_hhName}』的手。`;
      }
    }
  }
  // 牽手中的對象名(供移動帶人＋提示詞氛圍)——每回合讀一次現值。let：結束一天會自然放手(下方 endDay)。
  let kanshouHeldName_ = KANSHOU_HANDHOLD_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]);
  // 🤝 不同地自動放手(不變量·玩家實測「她跑掉了卻還牽著、重逢自動續牽、移動硬拖人」)：牽手是
  //   「此刻牽著」的狀態——她因任何原因(作息/離場/舊版bug殘留)已不在你身邊，就自然鬆開。
  //   也順手清掉歷史遺留的殭屍牽手標記(舊版時間快轉把人骰走但標記沒清的存檔)。
  if (kanshouHeldName_) {
    const _heldHere = pcData.some((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(kanshouHeldName_) && String(r[COL.PC.LOC] || "").trim() === String(pcData[pcIndex][COL.PC.LOC] || "").trim());
    if (!_heldHere) {
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_HANDHOLD_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');
      kanshouHeldName_ = '';
      dirtyPcRows.add(pcIndex);
    }
  }

  // 🤝 結識(巧遇→入駐)：巧遇對象只是路人(不記好感·離開即散)，玩家點「結識」(inviteResident=name)
  //   才正式建列入駐——驗證對象必須真的是【邂逅中】的那位(防直打API憑空加人)、且尚未入駐。
  //   入駐後她從此活在這座城裡(有行程/好感/可堵可約)，本回合就地拿到完整在場卡片。
  let kanshouInviteStr = "";
  if (userData.inviteResident) {
    const _ivName = String(userData.inviteResident).trim();
    const _ivActiveId = getKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY]);
    const _ivHero = _ivActiveId ? SEED_SERVANTS.find(h => h.id === _ivActiveId) : null;
    const _ivMatch = _ivHero && kanshouNameCandidates_(_ivHero.realName).includes(_ivName);
    const _ivAlready = _ivMatch && pcData.some((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(_ivHero.realName));
    const _ivMaleMale = _ivMatch && String(pc[COL.PC.SEX]) === "男" && String(_ivHero.gender) === "男";
    if (!_ivMatch || _ivAlready || _ivMaleMale) {
      kanshouInviteStr = `\n★【結識未成】：你想跟『${_ivName}』深交下去，但這段緣分此刻不成立(對方已離開、或早已相識)——演出這份悵然即可。`;
      finalUserMsg = `【玩家意圖】：想跟『${_ivName}』深交，卻發現緣分沒有接上。`;
    } else {
      const _ivCodexRow = getHeroCodexCached().slice(1).find(r => String(r[COL.HERO.ID]) === String(_ivHero.id));
      if (_ivCodexRow) {
        const _ivNewRow = heroToKanshouRow_(_ivCodexRow, myGameId, String(curL || "").trim(), curDay);
        sheets.pc.appendRow(_ivNewRow);
        pcData.push(_ivNewRow); // 本回合就地生效：partyRows/在場卡片馬上抓得到她
        pcData[pcIndex][COL.PC.MEMORY] = clearKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY]); // 她不再是「路人例外」，改走正式在場人物
        dirtyPcRows.add(pcIndex);
        kanshouInviteStr = `\n★【正式結識】：你與『${kanshouCasualOf_(_ivHero)}』交換了聯絡方式，這段萍水相逢的緣分正式接上了——從今以後她也是這座城裡你認識的人，會有自己的生活與去處。演出這一刻依她性格的反應(大方/靦腆/意外皆可)，關係才剛起步、保持剛認識的分寸。`;
        finalUserMsg = `【玩家意圖】：鼓起勇氣向『${kanshouCasualOf_(_ivHero)}』提出想繼續深交、交換聯絡方式。`;
      }
    }
  }

  // 🎭 橋段觸發：按鈕(roomEventOffer)在候選人存在期間持續可用，玩家點下去(userData.
  //   roomEventAccept)才真正骰一次走向；候選人＝目標地點上的同世界同伴，隨機挑一位。
  const kanshouRoomEventTargetLoc_ = moveTarget ? moveName : curL;
  // ⏱️ offer 用「本回合結束時」的時刻算時段——按鈕是給回應後的玩家看的，用回合開始的舊時刻會
  //   慢半拍(玩家實測：10:5x走進客廳沒跳膝枕、原地再點(已11:2x午後)才跳)。各推進型回合各自預測：
  //   結束一天→6點；跳時段→目標時段起點；推進N小時→+N；一般回合→+0.5(夾23)。
  let _reHourAfter = curHour;
  if (userData.endDay === true) _reHourAfter = 6;
  else if (userData.jumpBand) { const _rb = KANSHOU_TIME_BANDS_.find(b => b.key === String(userData.jumpBand)); if (_rb) _reHourAfter = _rb.startHour; }
  else if (parseFloat(userData.advanceHours) > 0) _reHourAfter = ((curHour + parseFloat(userData.advanceHours)) % 24 + 24) % 24;
  else if (userData.jumpFestival) _reHourAfter = 6; // 跳節慶恆落在前一天清晨6點(kanshouHoursUntilDate_ 的落點)
  else if (curHour < KANSHOU_DAY_LAST_HOUR_) _reHourAfter = Math.min(KANSHOU_DAY_LAST_HOUR_, curHour + KANSHOU_HOUR_PER_ACTION_);
  const kanshouReBand_ = timeBand_(_reHourAfter);
  const kanshouHomeLocs_ = Object.values(KANSHOU_HERO_HOME_);
  // 橋段觸發三層(擇一，優先序由稀至常)：①節慶(一年一天)→②同住人房間(她家×深夜/清晨)→③地點×時段。
  //   三層共用同一套候選人蒐集＋offer按鈕＋accept骰走向流程，只是決定eventKey的來源不同。
  let kanshouRoomEventKey_ = null;
  const kanshouReDate_ = kanshouAbsDayToDate_(curDay);
  const kanshouReFest_ = KANSHOU_FESTIVALS_.find(f => f.month === kanshouReDate_.month && f.day === kanshouReDate_.day) || null;
  if (kanshouReFest_) {
    const _fe = KANSHOU_FESTIVAL_EVENTS_[kanshouReFest_.key];
    if (_fe && _fe.bands.indexOf(kanshouReBand_) >= 0) kanshouRoomEventKey_ = _fe.eventKey;
  }
  if (!kanshouRoomEventKey_ && (kanshouHomeLocs_.includes(kanshouRoomEventTargetLoc_) || kanshouRoomEventTargetLoc_ === KANSHOU_COHABIT_ROOM_)) {
    // 她自己的住處、或同居人的「和室」寢間，深夜/清晨都吃同一套夜襲/賴床橋段。
    kanshouRoomEventKey_ = KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_[kanshouReBand_] || null;
  }
  if (!kanshouRoomEventKey_) {
    const _locEv = KANSHOU_LOCATION_EVENTS_[kanshouRoomEventTargetLoc_];
    if (_locEv && _locEv.bands.indexOf(kanshouReBand_) >= 0) kanshouRoomEventKey_ = _locEv.eventKey;
  }
  let kanshouRoomEventCandidate_ = null;
  if (kanshouRoomEventKey_) {
    // 蒐集此地(和室/她住處)所有在場的同伴——多人同居擠一間時，全部列出讓玩家【點名要靠近誰】，
    //   不再隨機挑(玩家「我可以挑選夜襲誰？！」→可以)。單人時前端就一顆按鈕、體驗跟以前一樣。
    const _reMatches = [];
    pcData.forEach((r, i) => {
      // 🚫 今天已跟她經歷過橋段(KANSHOU_SCENE_DAY_TAG_==今天)就不再把她列進候選——擋「重複詢問」：
      //   §132 只擋重複加好感、按鈕仍每回合冒；這裡連 offer 都收掉，一天一位一次特別相處，隔天(結束
      //   這天後 curDay+1)自然重新開放。
      if (i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC] || "").trim() === kanshouRoomEventTargetLoc_ && KANSHOU_SCENE_DAY_TAG_.get(r[COL.PC.MEMORY]) !== curDay) _reMatches.push(i);
    });
    if (_reMatches.length) {
      kanshouRoomEventCandidate_ = { eventKey: kanshouRoomEventKey_, matches: _reMatches.map(i => ({ name: String(pcData[i][COL.PC.NAME]), idx: i })) };
    }
  }
  // 玩家按下按鈕(roomEventAccept帶姓名，第二道防線比對姓名確實在候選清單裡，防直打API帶假名字)：
  //   才真的依bond骰一次走向、寫進提示詞；不點按鈕的話這個字串維持空白，narration完全走一般對話。
  let kanshouRoomEventStr = "";
  // 🐛→✅ 玩家實測前主動抓到：橋段對象(reHeroName)沒被排進下方「作息自然告辭」的留下理由清單——
  //   賴床叫醒的觸發時窗剛好卡在深夜→清晨邊界，這回合接受橋段後、被動時間流動很容易同一回合就跨過
  //   時段邊界，兩段指令便自相矛盾(「她剛回應了你叫醒她」+「她已到了該走的時間、道別離場」同時出現)。
  //   reIdx/reHeroName 原本只在 if(_reHit){} 區塊內宣告，這裡先宣告一個外層變數讓稍後的自然告辭
  //   邏輯也讀得到。
  let kanshouRoomEventPartnerName_ = "";
  if (userData.roomEventAccept && kanshouRoomEventCandidate_) {
    const _reAcc = String(userData.roomEventAccept).trim();
    const _reHit = kanshouRoomEventCandidate_.matches.find(m => kanshouNameCandidates_(m.name).includes(_reAcc));
    if (_reHit) {
      const reEventKey = kanshouRoomEventCandidate_.eventKey, reIdx = _reHit.idx, reHeroName = _reHit.name;
      kanshouRoomEventPartnerName_ = reHeroName;
      const reEv = KANSHOU_SCENE_EVENTS_[reEventKey] || {};
      const reBond = parseInt(pcData[reIdx][COL.PC.BOND]) || 0;
      const reBranch = kanshouRollSceneBranch_(reEventKey, reBond);
      if (reBranch) {
        const reVerb = String(reEv.verb || '靠近了');
        kanshouRoomEventStr = `\n★【橋段·${reEventKey}(GAS已骰定這次走向，AI只需依此演出，不必徵詢玩家、也不必逐字照抄下方措辭)】：${reVerb}『${reHeroName}』，她此刻的反應走向是——${reBranch.tag}。依她的既有性格詮釋這個走向具體要怎麼表現、講什麼話，細節全由你發揮，但情緒基調不要偏離這個走向。`;
        finalUserMsg = `【玩家意圖】：${String(reEv.intent || '靠近了『{n}』。').replace('{n}', reHeroName)}`;
        // 💞 一起經歷橋段(非拒絕分支·min>=0)給一份【不吃聊天上限】的好感——這就是取代「送禮突破」的
        //   約會路徑：真實相處過的特別時刻能推著關係跨過梯度。拒絕/警戒分支(min:-100)不給。
        // 非拒絕分支給好感，但同一同伴同一天只給一次——擋按鈕重覆刷分(見 KANSHOU_SCENE_DAY_TAG_)。
        //   橋段敘事(kanshouRoomEventStr)照演，只有「又近了一些」的加分＋提示語限首次。
        if (reBranch.min >= 0 && KANSHOU_SCENE_DAY_TAG_.get(pcData[reIdx][COL.PC.MEMORY]) !== curDay) {
          pcData[reIdx][COL.PC.BOND] = Math.min(100, reBond + KANSHOU_SCENE_BOND_);
          kanshouSyncRelTier_(pcData, reIdx);
          kanshouRoomEventStr += `（這樣一段特別的相處，讓你們的關係又近了一些——好感已由系統上調，敘事勿再另計。）`;
        }
        // 🚫 當日鎖不分分支(玩家實測：低好感走「防備拒絕」分支不落鎖→按鈕永遠重生、可無限重試)：
        //   一天一人一次「特別橋段」，被拒也算試過了——明天再來(+3 仍限非拒絕分支)。
        pcData[reIdx][COL.PC.MEMORY] = KANSHOU_SCENE_DAY_TAG_.set(pcData[reIdx][COL.PC.MEMORY], curDay);
        dirtyPcRows.add(reIdx);
        // 晨間餘韻(暗示昨夜共度)只在好感已達同床門檻(≥80·與 intimateNightNames 同一切點)才蓋——
        //   夜襲頂分支雖 min:60，但 60~79(親近)依親密尺度天花板尚止於性事之前，不算共度春宵。
        if (reEventKey === '夜襲' && reBond >= 80) pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], reHeroName);
      }
      // 🧱 鬼按鈕修復(玩家實測「居然可以連續膝枕??」)：offer 候選清單在 accept 處理【前】就建好、
      //   還含著剛經歷完橋段的她——事後把她移出，按鈕不再原地重生(同日防重刷靠 SCENE_DAY_TAG，
      //   這裡只是讓本回合回應的按鈕清單跟事實同步)。
      kanshouRoomEventCandidate_.matches = kanshouRoomEventCandidate_.matches.filter(m => m.idx !== reIdx);
      if (!kanshouRoomEventCandidate_.matches.length) kanshouRoomEventCandidate_ = null;
    }
  }

  // 結束一天(準備就寢)前先擲一次骰，命中就不執行日期推進，直接回傳knockEvent讓前端跳出
  //   「開門/不予理會」——選「不予理會」帶skipKnockCheck重送一次(跳過判定，直接推進日期)；
  //   選「開門」則帶knockAccept把訪客接來(見下)。候選池限「已建立資料列、不在玩家所在地」的
  //   舊識，不會憑空生出一個從未召喚過的陌生人半夜敲門。
  if (userData.endDay === true && !userData.skipKnockCheck) {
    const knockPool = pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.LOC] || "").trim() !== curL && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && (kanshouIsCohabit_(r) || (parseInt(r[COL.PC.BOND]) || 0) >= KANSHOU_KNOCK_MIN_BOND_));
    if (knockPool.length && Math.random() < KANSHOU_KNOCK_CHANCE_) {
      const visitor = knockPool[Math.floor(Math.random() * knockPool.length)];
      // ⚠ 不帶 people——這條早退沒人移動，夾 people:[] 會把前端 localNPCs 快取洗成空(泡泡期間開拍照
      //   面板變「沒有可拍的人」)；前端只在 data.people 是陣列時才更新快取。
      return JSON.stringify({ text: "正準備歇下的時候，忽然聽見一陣輕輕的敲門聲……", knockEvent: String(visitor[COL.PC.NAME]) });
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
  let kanshouClockMoved_ = false; // 結束一天/時段跳躍已自行設時鐘→標記，避免下方每回合流動又加一次
  if (userData.endDay === true) {
    // 🛏️ 結束一天＝睡到「即將到來的清晨6點」：凌晨(深夜0~5點)睡下→【同一天】的6點——跨日已在
    //   「夜→深夜(00:00)」那一步發生過了；晚上睡下才是隔天6點。修玩家實測「一晚被收兩天」
    //   (夜→深夜已+1天、結束一天又+1天)。
    if (curHour >= 6) curDay = curDay + 1;
    curHour = 6;
    kanshouClockMoved_ = true;
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
    // 🤝 睡覺自然放手：牽手不跨夜(同床是同床、不是牽著手到天亮)，結束一天一律鬆開，
    //   避免隔天還掛著昨天的牽手標記。
    if (kanshouHeldName_) { pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_HANDHOLD_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], ''); kanshouHeldName_ = ''; }
    curL = kanshouMyRoomLoc_;
    allEstablished.forEach(r => {
      const idx = pcData.indexOf(r);
      // 優先序：同床過夜(留玩家房間) > 今天有約(釘約定地點守著) > 照常骰行程(同居者走同居版)。curDay已是隔天。
      pcData[idx][COL.PC.LOC] = intimateNightNames.includes(r[COL.PC.NAME]) ? kanshouMyRoomLoc_ : (kanshouPromisePin_(r, curDay, curHour) || kanshouRollDailyLocation_(r[COL.PC.NAME], curHour, kanshouIsCohabit_(r)));
      dirtyPcRows.add(idx);
    });
    finalUserMsg = `【一天結束】夜幕降臨，${intimateNightNames.length ? `跟『${intimateNightNames.join('、')}』一起` : ""}回到房間安頓下來，今天到此為止，明天又是新的一天。`;
  } else {
    // 推進時間：跟結束一天不同——不強制拉玩家回家，只是讓時鐘往前跳N小時；不在身邊的英靈依
    //   新時刻重骰去向，同行同伴不受影響。上限抓3年區間防呆，不做逐小時模擬(跳多久都是O(1))。
    let advanceHours = Math.max(0, Math.min(parseFloat(userData.advanceHours) || 0, 24 * 365 * 3)); // parseFloat：支援「跳到約定前10分」的小數時數
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
      kanshouClockMoved_ = true;
      pcData[pcIndex][COL.PC.DAY] = curDay;
      pcData[pcIndex][COL.PC.HOUR] = curHour;
      // ⏩ 這是玩家【主動按鈕跳時段/節慶】的刻意時間快轉——跟「每回合被動+0.5h流動」(§122，那條根本
      //   不重骰任何人)不同：既然玩家選擇快轉數小時，全世界(含此刻正跟你在一起的那位)都該依新時刻回到
      //   各自的作息去向，所以【不再排除同地在場者】。原§84排除是為了擋「被動流動把互動中的人傳走」的
      //   突兀，那個場景現在由被動流動不重骰負責，主動快轉反而應該讓世界真的動起來。
      const allEstablishedForTime = pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
      allEstablishedForTime.forEach(r => {
        const idx = pcData.indexOf(r);
        // 🤝 牽手例外(玩家實測「牽手後推進時間她就不見了」)：正被你牽著、且此刻同地的她，
        //   陪你一起跳過這段時間——牽手＝她選擇跟著你，不被作息骰走(直到放手/結束一天)。
        if (kanshouHeldName_ && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim() && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(kanshouHeldName_)) return;
        // 今天有約→釘在約定地點守著；沒約→照常骰(同居者走同居版)。curDay已是推進後的日期。
        pcData[idx][COL.PC.LOC] = kanshouPromisePin_(r, curDay, curHour) || kanshouRollDailyLocation_(r[COL.PC.NAME], curHour, kanshouIsCohabit_(r));
        dirtyPcRows.add(idx);
      });
      const newDate = kanshouAbsDayToDate_(curDay);
      // ★換幕鐵律：時間快轉後是全新場景——AI 最容易犯的錯是接著把上一段(如剛才的牽手/對話)再演一次，
      //   這裡明講禁止複述、直接寫新時段的當下。
      const _jumpSceneBreak = `（★這是時間快轉後的【全新場景·換幕】：直接寫此刻新時段的當下光景，【絕對禁止】接續、複述或重演上一段已經發生的動作與對話——那些都已經過去了。若剛才在一起的人此刻已依作息離開，就自然演出你獨自或身邊換了人的當下。）`;
      finalUserMsg = (jumpFest
        ? `【時間推進】時間一路快轉，明天就是${jumpFest.name}了——此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${kanshouFmtHM_(curHour)}・${timeBand_(curHour)}。`
        : jumpBand
          ? `【時間推進】時間悄悄流轉到了${jumpBand.label}，此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${kanshouFmtHM_(curHour)}・${timeBand_(curHour)}。`
          : `【時間推進】${advanceHours}個小時悄悄過去，此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${kanshouFmtHM_(curHour)}・${timeBand_(curHour)}。`) + _jumpSceneBreak;
    }
  }
  // ⏰ 時間隨動作流動：一般 AI 敘事回合(非結束一天/非時段跳躍)每次推進 KANSHOU_HOUR_PER_ACTION_ 小時，
  //   讓聊天/移動/拍照/橋段等按鍵都會讓時鐘往前走，消除「到處跑卻永遠6點」的凍結感。夾在當日23:00不
  //   跨日——跨午夜(睡覺)由「結束一天」儀式負責(回家/同床/晨間餘韻/隔天6點重置)，不讓時間偷偷滾過午夜。
  //   只動時鐘、不重骰不在場同伴的位置(那由結束一天/時段跳躍負責)，免得每句對話有人被傳送走。
  let kanshouBandCrossed_ = false; // 被動流動跨過時段邊界→下方「作息自然告辭」用
  if (!kanshouClockMoved_ && curHour < KANSHOU_DAY_LAST_HOUR_) {
    const _pbBand = timeBand_(curHour);
    curHour = Math.min(KANSHOU_DAY_LAST_HOUR_, curHour + KANSHOU_HOUR_PER_ACTION_);
    pcData[pcIndex][COL.PC.HOUR] = curHour;
    dirtyPcRows.add(pcIndex);
    kanshouBandCrossed_ = timeBand_(curHour) !== _pbBand;
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
  //   每句對話重算。移動不再強制拖走任何已存在的英靈(每個人都是獨立的)——想帶誰同行：地圖 👋
  //   提議同去(proposeMove 確定性提議管線，見上方★【提議·同去】)或牽手跟隨。
  // 🐛→✅ 例外：玩家按下的是「同意」AI剛提議的move_proposal(userData.moveWithCompanion)時，
  //   UI已經明確告訴玩家「好，一起去」，若不真的把提議者也帶過去，她會被留在舊地點、卻在敘事
  //   跟人物列表裡憑空消失——這裡先在curL變動【前】記下當時同地點的人，帶她們一起走。
  //   ⚡ 帶人三態：①同意AI提議一起去(moveWithCompanion)→帶當時同地全部人；②否則有牽手對象且
  //   她此刻同地→只帶她(牽手優先跟隨)；③否則只帶自己。
  const kanshouPreMoveCompanions_ = !moveTarget ? []
    : userData.moveWithCompanion
      ? pcData.filter(r => r !== pc && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim())
      : (kanshouHeldName_ ? pcData.filter(r => r !== pc && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(kanshouHeldName_) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()) : []);
  let kanshouEncounterHero = null, kanshouEncounterMetBefore = false, kanshouEncounterLocName = "";
  let kanshouEventSeed = null;
  if (moveTarget) {
    curL = moveName;
    pcData[pcIndex][COL.PC.LOC] = curL;
    dirtyPcRows.add(pcIndex);
    kanshouPreMoveCompanions_.forEach(r => {
      const nIdx = pcData.indexOf(r);
      if (nIdx === -1) return;
      pcData[nIdx][COL.PC.LOC] = curL;
      dirtyPcRows.add(nIdx);
    });
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
    // 態度：NPC對御主當下的臨場態度(與好感分開追蹤，見慾海律令第6條)，讓AI下筆前看得到自己
    //   上一輪演的態度，不會忽冷忽熱亂跳。
    const attMatch = s.match(/\[態度\](.*?)(?=\| \[|$)/);
    const attTrim = attMatch ? attMatch[1].trim() : "";
    const attStr = (attTrim && attTrim !== "無") ? ` [態度:${attTrim}]` : "";
    return nickStr + attStr;
  }

  // 🚶‍♀️ 作息自然告辭(玩家實測「NPC 不會自己離開?」)：npc_exit 靠 AI 自發填＝Gemini 從不填(同
  //   move_proposal 教訓)，作息重骰又只在結束一天/跳時段——一般聊天流程裡在場者永不離場。改成
  //   確定性：被動時間流動【跨過時段邊界】時(一天約4次)，同地 NPC 依作息重骰去向；有「留下理由」
  //   的不走(牽手中/這回合剛跟你一起走來/今天約在這裡等你)。要走的注入告辭提示讓 AI 演出道別。
  let kanshouNpcLeaveStr_ = "";
  if (kanshouBandCrossed_) {
    const _lvNames = [];
    pcData.forEach((r, i) => {
      if (i === pcIndex || String(r[COL.PC.FACTION]) !== "從者" || !sameGame(r) || String(r[COL.PC.ID]).startsWith("DEAD_")) return;
      if (String(r[COL.PC.LOC] || "").trim() !== String(curL || "").trim()) return;
      const _nm = String(r[COL.PC.NAME]);
      if (kanshouHeldName_ && kanshouNameCandidates_(_nm).includes(kanshouHeldName_)) return; // 牽手中＝她選擇留下
      if (kanshouPreMoveCompanions_.some(cr => String(cr[COL.PC.NAME]).trim() === _nm.trim())) return; // 剛跟你一起走來
      if (kanshouRoomEventPartnerName_ && kanshouNameCandidates_(_nm).includes(kanshouRoomEventPartnerName_)) return; // 本回合剛回應了橋段(如賴床叫醒)，不會轉頭就走
      // 玩家本回合正對她提議(相約/牽手/同去·_pendingProposal)——她留下聽完回應：否則被動+10分恰跨時段時，
      //   AI 同回合收到「向她提議」＋「她已告辭」兩條矛盾指令，接受還會把牽手/同去落到已離場的人身上。
      if (_pendingProposal) {
        const _ppN = String(_pendingProposal.name || pcData[_pendingProposal.idx][COL.PC.NAME] || "");
        if (_ppN && kanshouNameCandidates_(_nm).includes(_ppN)) return;
      }
      const _newLoc = String(kanshouPromisePin_(r, curDay, curHour) || kanshouRollDailyLocation_(_nm, curHour, kanshouIsCohabit_(r)) || "").trim();
      if (_newLoc && _newLoc !== String(curL || "").trim()) {
        pcData[i][COL.PC.LOC] = _newLoc;
        dirtyPcRows.add(i);
        _lvNames.push(_nm);
      }
    });
    if (_lvNames.length) kanshouNpcLeaveStr_ = `\n★【自然告辭·作息——本回合特別豁免，不受【在場驗證鐵律】限制】：時段來到${timeBand_(curHour)}，『${_lvNames.join('、')}』到了該走的時間——她(們)雖已不在【目前在場人物】名單，本回合【唯獨允許】她(們)開口說這最後一句道別(依你記憶中她的個性，有事要辦/該回去了皆可，去向不必交代)，narration 要把道別演出來、不可無聲消失；道別之後她(們)就真的不在場了。`;
  }

  // 📅 赴約/爽約結算 2.0(時間×地點驅動)：【必須在 partyRows 之前】——命中赴約會把她 pin 到 curL 讓她
  //   登場，這一步要先於在場名單計算，AI 才拿得到「她來了」的在場卡(否則純聊天/拍照這種不重骰位置的路徑，
  //   partyRows 會在她被拉來之前就定案、AI 完全不知道她到了)。準時窗[時刻-10,時刻+30]赴約+5(早到→「都早到」
  //   味道)／窗後~當天結束遲到+3／太早(她還沒到)回 kanshouPromiseWait_ 給前端「等到約定前10分」框／日期已過
  //   爽約-5。舊格式無時段(ah=null)沿用「當天到場即赴約」。同回合剛成立的約(day=明天)不會自我觸發。
  let kanshouPromiseMetStr = "";
  let kanshouPromiseWait_ = null; // {name,loc,apptLabel,targetHour}：太早到→前端等待框
  // 📣 赴約/爽約結算回饋走【獨立通道】(promiseSettle)，不再借用 kanshouProposalResult_ 單槽——
  //   同回合「結算＋另一個提議被接受」時 post-AI 的提議結果會無條件覆寫單槽(稽核三路都撞到)，
  //   結算通知被吞、前端也漏掉重抓 _kcCur 的觸發。兩事件本就獨立，各走各的通知條。
  // 🐛→✅ 玩家實測前主動抓到：這裡本身也是單槽——若玩家同時跟兩位同伴各有一筆待結算的約(如A今天
  //   赴約成功、B的舊約同時判定爽約)，這個 forEach 跑兩輪，後跑的那筆會無條件覆寫前一筆，前一筆的
  //   通知條就這樣消失(底層BOND/MEMORY寫入不受影響，只有這條UI通知被吞)。改成陣列，兩筆都保留。
  let kanshouPromiseSettle_ = []; // [{ok,type:'promise_met'|'promise_missed',name,loc}, ...]
  pcData.forEach((r, i) => {
    if (i === pcIndex || String(r[COL.PC.FACTION]) !== "從者" || !sameGame(r) || String(r[COL.PC.ID]).startsWith("DEAD_")) return;
    const _pr = kanshouGetPromise_(r[COL.PC.MEMORY]);
    if (!_pr) return;
    const _her = String(r[COL.PC.NAME]);
    const _atApptLoc = String(curL || "").trim() === String(_pr.loc).trim();
    const _ah = kanshouApptHour_(_pr.band);
    const _settle = (delta, note) => { // delta 好感、note 敘事
      pcData[i][COL.PC.LOC] = curL; // 命中→她登場(確保在場，即使作息還沒把她骰過來)
      pcData[i][COL.PC.MEMORY] = kanshouClearPromise_(pcData[i][COL.PC.MEMORY]);
      pcData[i][COL.PC.BOND] = Math.max(0, Math.min(100, (parseInt(r[COL.PC.BOND]) || 0) + delta));
      kanshouSyncRelTier_(pcData, i); // 跨/跌梯度同步REL_TAG
      dirtyPcRows.add(i);
      kanshouPromiseMetStr += note;
      // 📣 赴約成功發明確回饋——前端靠它跳綠條＋重抓同伴清單(_kcCur)，睡前爽約警示才不會
      //   拿過期資料誤報「今天還有沒赴的約」(稽核抓到的假警報)。
      kanshouPromiseSettle_.push({ ok: true, type: 'promise_met', name: _her, loc: _pr.loc });
    };
    if (_pr.day === curDay) {
      if (!_atApptLoc) return; // 今天但不在約定地點→還沒到、也還沒過，等你去，不結算
      if (_ah === null) { // 舊格式無時段：當天到場即赴約
        _settle(5, `\n★【依約相會】：今天正是你與『${_her}』約好在「${_pr.loc}」見面的日子，你們此刻真的相會了——演出「約定被守住」的欣喜(好感已上調，勿另計)。`);
      } else if (curHour < _ah - 1 / 6 - 1e-6) { // 太早：她還沒到→回等待框(−1e-6 epsilon：跳到13:50後浮點誤差不會又被判太早卡死)
        if (!kanshouPromiseWait_) kanshouPromiseWait_ = { name: _her, loc: _pr.loc, apptLabel: kanshouFmtHM_(_ah), targetHour: _ah - 1 / 6 };
      } else if (curHour <= _ah + 0.5) { // 準時窗[時刻-10,時刻+30]
        const _early = curHour < _ah;
        _settle(5, _early
          ? `\n★【依約相會·都早到了】：你與『${_her}』約在${kanshouFmtHM_(_ah)}於「${_pr.loc}」見面，而你倆此刻(${kanshouFmtHM_(curHour)})都提早到了——演出兩人都早到、剛好碰上的甜蜜當下與那份心照不宣的默契(好感已上調，勿另計)。`
          : `\n★【依約相會】：約定的${kanshouFmtHM_(_ah)}，你準時到「${_pr.loc}」與『${_her}』相會——演出約定被守住的欣喜(好感已上調，勿另計)。`);
      } else { // 遲到(當天、過了準時窗)
        _settle(3, `\n★【遲到赴約】：你與『${_her}』約在${kanshouFmtHM_(_ah)}，卻拖到${kanshouFmtHM_(curHour)}才到「${_pr.loc}」——她等了你好一會，依個性流露嗔怪/委屈/嘴硬說沒關係(好感仍上調但你遲到了，勿另計)。`);
      }
    } else if (_pr.day < curDay) { // 過了約定日還沒赴約=爽約
      pcData[i][COL.PC.MEMORY] = kanshouClearPromise_(pcData[i][COL.PC.MEMORY]);
      pcData[i][COL.PC.BOND] = Math.max(0, (parseInt(r[COL.PC.BOND]) || 0) - 5);
      kanshouSyncRelTier_(pcData, i);
      dirtyPcRows.add(i);
      if (String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()) kanshouPromiseMetStr += `\n★【爽約之後】：你先前與『${_her}』約好在「${_pr.loc}」見面卻沒赴約——讓她依性格流露被放鴿子的在意(慍怒/落寞/嘴硬說沒關係，好感已下調，勿另計)。`;
      // 📣 爽約明確回饋(玩家實測「約定標示無聲消失、以為是bug」)：她不在場時結算完全無聲——
      //   補通知條讓玩家知道約過期了、好感掉了。
      kanshouPromiseSettle_.push({ ok: false, type: 'promise_missed', name: _her, loc: _pr.loc });
      // 💔 她要「記得」被放鴿子(玩家實測：系統扣了好感、她卻渾然不知還演「我照約來了」)：爽約寫進
      //   共同回憶(玩家第一人稱視角·比照 memoir 鐵則)，之後每回合經 partyDetailsArr 餵給 AI，
      //   她才演得出在意/彆扭，也給玩家道歉挽回的戲肉。cap 交給下次 processMemoir_ 自然淘汰。
      const _missBandL = _pr.band ? ((KANSHOU_APPT_BANDS_.find(b => b.band === _pr.band) || {}).label || "") : "";
      const _missLine = `我爽約了——說好${_missBandL}在「${_pr.loc}」見面卻沒去，讓她空等了一場`;
      const _oldMemoir2 = String(pcData[i][COL.PC.MEMOIR] || "").trim();
      if (_oldMemoir2.indexOf(_missLine) === -1) pcData[i][COL.PC.MEMOIR] = _oldMemoir2 ? (_oldMemoir2 + "｜" + _missLine) : _missLine;
    }
  });

  // 「開放世界·背景人煙」設計：路人可自由描寫增添生活感，但不具名、不追蹤好感、不能被指名互動；
  //   真正能被指名、好感會被記錄的對象只有【在場人物】，判準是「LOC是否跟玩家目前位置一致」，
  //   不看IS_PARTY。
  // 同地點最多給KANSHOU_PARTY_DETAIL_CAP_位詳細卡片(敘事複雜度/prompt篇幅上限，不是隊伍容量)，
  //   依好感高低取前幾位；超過上限的人依然存在、依然可被特定劇情點名，只是這回合沒有詳細卡。
  const partyRows = pcData.filter(r => r !== pc && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim())
    .sort((a, b) => (parseInt(b[COL.PC.BOND]) || 0) - (parseInt(a[COL.PC.BOND]) || 0)).slice(0, KANSHOU_PARTY_DETAIL_CAP_);
  const partyMembers = partyRows.map(r => r[COL.PC.NAME]);
  // 🌍 世界概況(輕量版·2026-07 玩家「NPC不知道彼此存在」)：只給名字＋大分區，不給精確地點/在幹嘛，
  //   純粹讓AI知道「這局還認識誰、大概在哪」以便自然閒聊提及——不是在場資料，不影響【在場驗證鐵律】
  //   (指名互動/追蹤好感仍只認同地點的partyRows)。依好感取前KANSHOU_WORLD_ROSTER_CAP_位，避免同伴
  //   一多每回合就無限膨脹。
  const kanshouWorldRosterStr = (() => {
    const _elsewhere = pcData.filter(r => r !== pc && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() !== String(curL || "").trim())
      .sort((a, b) => (parseInt(b[COL.PC.BOND]) || 0) - (parseInt(a[COL.PC.BOND]) || 0)).slice(0, KANSHOU_WORLD_ROSTER_CAP_);
    if (!_elsewhere.length) return "";
    const _list = _elsewhere.map(r => {
      const _loc = KANSHOU_LOCATIONS_.find(l => l.name === String(r[COL.PC.LOC] || "").trim());
      const _region = _loc && KANSHOU_REGIONS_.find(g => g.id === _loc.region);
      return `${r[COL.PC.NAME]}(${_region ? _region.name : "行蹤不明"})`;
    }).join('、');
    return `\n★【世界概況·僅供閒聊背景】：這局你還認識這些人，大略所在：${_list}。只能當閒聊話題自然提一下存在/大概去向，絕不可讓她們憑空出現、開口、或被指名互動——這不影響在場驗證鐵律，只有此刻真的同地點的人才算在場。`;
  })();
  // 📅 初見日戳＋相識紀念日：同地即相識——沒戳過的在場同伴當下蓋【初見日】(冪等，之後只讀不改)；
  //   已有戳的算相識天數，命中里程碑(7/30/100/365天)就收進紀念日提示(當天內重複對話會重複提及，
  //   跟節慶氛圍同一種「全天有效的氛圍線」設計，AI自然不會每句都講)。
  const kanshouAnnivLines_ = [];
  partyRows.forEach(r => {
    const _ri = pcData.indexOf(r);
    if (_ri < 0) return;
    const _met = KANSHOU_FIRST_MET_DAY_TAG_.get(r[COL.PC.MEMORY]);
    if (!_met) {
      pcData[_ri][COL.PC.MEMORY] = KANSHOU_FIRST_MET_DAY_TAG_.set(pcData[_ri][COL.PC.MEMORY], curDay);
      dirtyPcRows.add(_ri);
    } else if (KANSHOU_ANNIV_MILESTONES_.indexOf(curDay - _met) >= 0) {
      kanshouAnnivLines_.push(`與『${String(r[COL.PC.NAME])}』相識恰好滿${curDay - _met}天`);
    }
  });
  const kanshouAnnivStr = kanshouAnnivLines_.length ? `\n★【紀念日·非強制】：今天是${kanshouAnnivLines_.join('、')}的日子——若氣氛合適可自然帶出這份紀念的溫度(她記得、或你記得皆可)，不必強行慶祝或報幕。` : "";
  // 💢 醋意暗流(輕量·非橋段)：兩位以上好感≥60的同伴同場時20%機率餵一行提示——AI即興演出醋意
  //   火花，不骰走向、不加按鈕，點到為止不喧賓奪主。
  const _jealousPool = partyRows.filter(r => (parseInt(r[COL.PC.BOND]) || 0) >= 60);
  const kanshouJealousStr = (_jealousPool.length >= 2 && Math.random() < 0.2)
    ? `\n★【醋意暗流·非強制】：『${_jealousPool.map(r => String(r[COL.PC.NAME])).join('、')}』跟你的羈絆都不淺、此刻又同在一處——可讓她們之間自然流露一絲互相較勁或暗暗吃味的醋意火花(依各自性格，明爭暗鬥/故作大方/悄悄觀察皆可)，點到為止、不喧賓奪主。`
    : "";
  // 🤝 牽手中·常駐氛圍：牽的對象此刻真的同地在場才提示(被時間推進骰走就不提)。這回合剛牽/放手
  //   的當下演出走 kanshouHandHoldStr，這條是「牽著手的後續回合」持續帶出親密感。
  const kanshouHoldingStr = (kanshouHeldName_ && partyMembers.some(n => kanshouNameCandidates_(String(n)).includes(kanshouHeldName_)) && !(userData.handHold))
    ? `\n★【牽手中·背景資訊·別過度著墨】：你和『${kanshouHeldName_}』正牽著手一起行動——她【此刻就在你身邊、和你同處一地】，是牽著你的手一起走過來/一起待在這裡的，【絕不是】在別處等你、也【不會】說「你怎麼跑進來了」「說好在○○等你」這種把你倆講成分處兩地的話。★這份牽手只是【低調的背景親密】，【不必每回合都描寫交握的手】——偶爾在情境合適時輕輕帶一筆即可，別讓每一段敘事都圍著「握著的手／指尖的溫度」打轉，重心放在當下真正在發生的互動與對話。`
    : "";

  // 📷 拍照(takePhoto)：先驗底片/容量——通過才餵拍照提示＋要求AI多吐photo_caption；
  //   實際落地(耗底片＋寫相簿)在AI成功回應後(見下方)，AI失敗不浪費底片。
  //   拍攝對象：photoIntent(輸入框先打字再按快門·如「拍那隻橘貓」)有指定且沒點名同伴→風景/生活照
  //   (AI自由入鏡街貓/狗兒/光影)；沒指定→有同伴拍同伴、沒同伴拍風景。風景照人物欄記「風景」，
  //   相簿自動長出「風景」篩選分頁。
  let kanshouPhotoStr = "", kanshouPhotoPending_ = null, kanshouPhotoDenied_ = "";
  if (userData.takePhoto === true) {
    const _phUsed = kanshouFilmUsed_(pcData[pcIndex][COL.PC.MEMORY], curDay);
    const _phIntent = String(userData.photoIntent || "").replace(/[<>&"'`｜【】]/g, "").slice(0, 60);
    let _phCount = 0;
    try { const _ar = kanshouAlbumSheet_().getDataRange().getValues(); for (let i = 1; i < _ar.length; i++) { if (String(_ar[i][0]) === myGameId) _phCount++; } } catch (e) { }
    if (_phUsed >= KANSHOU_FILM_PER_DAY_) {
      kanshouPhotoDenied_ = 'film';
      kanshouPhotoStr = `\n★【底片用盡】：玩家舉起相機才想起今天的底片已經用完了——演出這份「想拍卻拍不了」的小小扼腕即可(明天底片自然會補上，不必解釋機制)。`;
      finalUserMsg = `【玩家意圖】：舉起相機，才發現今天的底片用完了。`;
    } else if (_phCount >= KANSHOU_ALBUM_CAP_) {
      kanshouPhotoDenied_ = 'cap';
      kanshouPhotoStr = `\n★【相簿已滿】：玩家舉起相機，卻想起相簿已經放不下更多照片了——演出這份「回憶太滿」的感嘆即可。`;
      finalUserMsg = `【玩家意圖】：舉起相機，卻想起相簿已經滿了。`;
    } else {
      // 指定拍誰：intent點名了哪些在場同伴(可多位)——只拍被點名的那些人；沒點名到任何人才算風景。
      // 🏷️ 點名比對走候選橋：列是短名(SABER/櫻)，玩家打全名「拍阿爾托莉雅」也要命中，免得人像被誤判風景。
      const _phNamedMembers = _phIntent ? partyMembers.filter(n => kanshouNameCandidates_(String(n)).some(c => _phIntent.indexOf(c) >= 0)) : [];
      const _phScenery = !partyMembers.length || (_phIntent && !_phNamedMembers.length);
      if (_phScenery) {
        kanshouPhotoPending_ = { names: ['風景'], used: _phUsed, scenery: true };
        kanshouPhotoStr = `\n★【拍照·風景】：玩家舉起相機${_phIntent ? `，想拍的是「${_phIntent}」，` : "，"}拍下此刻「${String(curL || "")}」的一隅——鏡頭裡可以是街貓、狗兒、鳥雀、光影、不具名路人的背影等生活細節(依地點/時段/天氣自然想像${_phIntent ? "，以玩家想拍的東西為主角" : ""})；若有同伴在場，她們可以自然反應或亂入鏡頭邊角。並【務必】在回應JSON中額外加一個欄位 "photo_caption"：以玩家第一人稱寫一句30~60字的照片小敘述(這張拍到了什麼，禁HTML與引號)。`;
        finalUserMsg = `【玩家意圖】：舉起相機，${_phIntent ? `拍下「${_phIntent}」` : "拍下眼前的光景"}。`;
      } else {
        // 點名了誰就只拍那(幾)位；沒點名(空手按)＝在場好感最高的前3位一起入鏡合照。
        const _phTargets = _phNamedMembers.length ? _phNamedMembers.slice(0, 3) : partyMembers.slice(0, 3);
        const _phSolo = _phTargets.length === 1;
        kanshouPhotoPending_ = { names: _phTargets, used: _phUsed };
        kanshouPhotoStr = `\n★【拍照】：玩家舉起相機，${_phSolo ? `單獨` : ``}拍下『${_phTargets.join('、')}』此刻的身影${_phTargets.length > 1 ? `(這是一張把她們一起框進來的合照)` : ``}——讓被拍的人依各自性格與好感演出被拍瞬間的反應(大方擺姿勢/害羞遮臉/嗔怪/渾然未覺皆可)${partyMembers.length > _phTargets.length ? `；在場其他沒被拍到的人可以自然旁觀或起鬨` : ``}。並【務必】在回應JSON中額外加一個欄位 "photo_caption"：以玩家第一人稱寫一句30~60字的照片小敘述(這張照片定格了什麼瞬間、她們當下的動作神態，禁HTML與引號)。`;
        finalUserMsg = `【玩家意圖】：舉起相機，拍下『${_phTargets.join('、')}』此刻的樣子。`;
      }
    }
  }
  // 📷 看照片(showPhoto=照片ID)：把「洗好的」照片拿給在場的人看——拍到自己→害羞/得意，
  //   拍到別人→評論/暗暗吃味；還沒洗好(拍攝日=今天)→只能演「明天才看得到」的期待。
  let kanshouShowPhotoStr = "";
  if (userData.showPhoto) {
    try {
      const _spRows = kanshouAlbumSheet_().getDataRange().getValues();
      let _spRow = null;
      for (let i = 1; i < _spRows.length; i++) { if (String(_spRows[i][0]) === myGameId && String(_spRows[i][1]) === String(userData.showPhoto).trim()) { _spRow = _spRows[i]; break; } }
      if (_spRow && (parseInt(_spRow[2]) || 0) >= curDay) {
        kanshouShowPhotoStr = `\n★【照片還沒洗好】：玩家想拿照片給大家看，才想起那張還在沖洗、明天才會好——演出這份小小的期待感即可。`;
        finalUserMsg = `【玩家意圖】：想拿照片給大家看，才想起還沒洗好。`;
      } else if (_spRow) {
        kanshouShowPhotoStr = `\n★【看照片】：玩家拿出一張洗好的照片給在場的人看——照片內容：${String(_spRow[3])}的「${String(_spRow[4])}」、拍到的是『${String(_spRow[6])}』${_spRow[8] ? `(${String(_spRow[8])})` : ""}。讓在場的人依性格反應：照片裡是自己→害羞/得意/嫌拍得糊皆可；照片裡是別人→好奇評論，跟玩家關係深的人可以暗暗吃味。`;
        finalUserMsg = `【玩家意圖】：拿出一張照片給在場的人看。`;
      }
    } catch (e) { }
  }
  // 📅 赴約/爽約結算已上移到 partyRows 之前(見上方)——她登場(pin到curL)必須先於在場名單計算，
  //   否則「純聊天/拍照」路徑(不重骰位置)會讓 AI 拿到沒有她的在場卡。此處不再重複。
  let partyDetailsArr = [];
  // ⚡ 提速：dailySpeechByName_ 對每位同伴呼叫都會重新解析英靈殿快取字串，這裡在迴圈外先抓一次
  //   共用傳入，省掉重複整表解析。
  const _partyHeroCodex = partyMembers.length > 0 ? getHeroCodexCached() : null;
  const _kanshouPropCatalog = kanshouAllProps_(pc[COL.PC.MEMORY]); // 內建+玩家自訂道具合併目錄，迴圈外先算一次
  partyMembers.forEach(pName => {
    // 需要 sameGame 過濾——若不同局/不同帳號剛好撞名(種子有限、AI原創從者皆可能撞)，會把別局
    //   同名者的資料塞進本局的敘事提示詞。
    const r = pcData.find(row => String(row[COL.PC.NAME]).trim() === String(pName).trim() && !String(row[COL.PC.ID]).startsWith("DEAD_") && sameGame(row));
    if (r) {
      const pOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👗 換裝：當前服裝穿著(換衣不換人；玩家UI設定或AI依appearance_extras更新)
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
      const pAtCeilingStr = (pChatCeiling < 100 && pBond >= pChatCeiling) ? "・單靠對話目前已到這個階段的上限，需要透過約定赴約、或一起經歷特別的橋段(夜襲/共浴/膝枕…)這類真實相處才能再加深，這回合維持細水長流的相處基調，不要寫成關係大幅推進" : "";
      // REL_TAG的梯度字面本身沒告訴AI「該演出什麼熟悉程度」，AI容易預設熱絡口吻跟數字矛盾。
      //   只在低梯度(尚不熟識)才加一句態度提示，中高梯度不需要、也不該畫蛇添足限制發揮。
      const pRelTagStr = r[COL.PC.REL_TAG] || "點頭之交";
      const pTierToneStr = (pRelTagStr === "點頭之交") ? "，彼此才剛認識不久，口吻應保持禮貌卻略帶生疏保留，不該表現得像已相識多年的熟人或表現得過分熱絡親密"
        : (pRelTagStr === "普通朋友") ? "，交情仍屬普通朋友，可自然閒聊但仍保留一定分寸與距離感，不宜過度親密"
        : "";
      // 地點的「當下在做什麼」輕量引子(見上方KANSHOU_LOCATION_ACTIVITY_)，沒對照到的地點
      //   不加這句，AI自然發揮即可。⚠ 只給「原本就在這裡」的人——這回合剛跟玩家一起移動過來的
      //   同伴(kanshouPreMoveCompanions_)不套，否則被你帶來咖啡廳的人會被誤標成「正在打工」。
      const _pCameWithMe = kanshouPreMoveCompanions_.some(cr => String(cr[COL.PC.NAME]).trim() === String(pName).trim());
      const pActivityStr = (() => { const _a = !_pCameWithMe ? kanshouLocActivity_(curL, pName, curDay) : ""; return _a ? ` | 現況:${_a}` : ""; })();
      // 🐛→✅ 玩家實測前主動抓到：kanshouIsCohabit_ 只在同居提議成立/日常重骰去向時被GAS拿來用，
      //   卻從沒告訴AI「這個人現在跟你同居」這個事實——平常聊天靠AI自己從對話歷史猜，換幕縮窗(見下方
      //   history-trim)又只留1~2回合，猜不準時容易忘記她已經住這、演成外人作客的疏離語氣。補一句明講。
      const pCohabitStr = kanshouIsCohabit_(r) ? " | 同居中:是(她現在與你同住一處，語氣可依此帶著日常同居的親近感、不是作客)" : "";
      // 🎀 小道具(玩家UI裝備·GAS直接寫·非AI自行判斷)：既定事實直接告訴AI，narration自然反映其存在
      //   與目前狀態，不必等玩家每回合重提——這是「機制保證」路徑，不靠AI自己判斷該不該記。
      //   2026-07 玩家「關閉就是還在體內」：強度關閉≠移除，怕AI把「關閉」誤讀成「拿掉了」而漏演
      //   仍配戴的既定事實，補一句明講(只在真的有hasIntensity道具目前關閉時才加，避免每回合都提)。
      const pPropsArr = kanshouGetProps_(r[COL.PC.MEMORY], _kanshouPropCatalog);
      // part(部位)玩家選填才有；沒填就不提部位，讓AI自己決定戴在哪(2026-07「選填吧...沒有就AI自己想辦法發揮」)。
      const pPropStr = pPropsArr.length ? ` | 佩戴道具:${pPropsArr.map(p => {
        const bits = [];
        if (p.part) bits.push(`戴在${p.part}`);
        if (p.hasIntensity) bits.push(p.level);
        return `${p.name}${bits.length ? `(${bits.join('，')})` : ""}`;
      }).join('、')}——這是既定事實，narration須自然反映其存在${pPropsArr.some(p => p.hasIntensity && p.level !== '關閉') ? `，其中正在運作的道具依強度影響她的反應` : ``}${pPropsArr.some(p => p.hasIntensity && p.level === '關閉') ? `（強度關閉≠取下，仍配戴在身上、只是暫時沒運作）` : ``}` : "";
      // 💞 共同回憶(27欄 MEMOIR)：你們一路走來累積的里程碑，讓 AI 自然承接你倆的專屬過往(儲存用全形｜
      //   分隔，餵給 AI 時換成「；」較好讀)。空的就不加這行。
      const pMemoirRaw = String(r[COL.PC.MEMOIR] || "").trim();
      // ★是玩家釘選標記(面板用)，餵AI時去掉、不外洩機制符號。
      const pMemoirStr = pMemoirRaw ? ` | 你們的共同回憶(你倆一路走來的點滴，敘事可自然承接呼應、但別生硬複述):${pMemoirRaw.replace(/★/g, '').replace(/｜/g, '；')}` : "";
      // 📅 待赴約定(玩家追問「AI每次都看得到約定吧?」查出的缺口)：約成立到赴約之間的等待回合，AI 原本
      //   完全不知道有這個約——聊「期待明天嗎」她會一臉茫然、甚至另約衝突計畫。補一行讓她記得；
      //   赴約當天碰面/爽約由結算注入(且結算先清約)，不會與此行重複。
      const _pdPr = kanshouGetPromise_(r[COL.PC.MEMORY]);
      let pPromiseStr = "";
      if (_pdPr && _pdPr.day >= curDay) {
        const _pdWhen = _pdPr.day === curDay ? "今天稍後" : _pdPr.day === curDay + 1 ? "明天" : (_pdPr.day - curDay) + "天後";
        const _pdBandL = _pdPr.band ? ((KANSHOU_APPT_BANDS_.find(b => b.band === _pdPr.band) || {}).label || _pdPr.band) : "";
        pPromiseStr = ` | 與玩家的約定:${_pdWhen}${_pdBandL}在「${_pdPr.loc}」見面——她記得這個約，聊到相關話題時自然帶著這份期待/在意，但勿每回合主動提起`;
      }
      // 明講方向的「TA是你的${tag}」(而非單純「關係:${tag}」)，避免AI誤讀方向、演反成玩家服侍TA。
      partyDetailsArr.push(`【在場人物】名號:${pName} | 身世:${r[COL.PC.BACK] || "無"}${pOutfit ? ` | 裝扮:${pOutfit}` : ""} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])}${pFlavorStr}${pMoeStr ? ` | 萌點(反差·僅供內化):${pMoeStr}` : ""}${pActivityStr}${pCohabitStr}${pPropStr}${pMemoirStr}${pPromiseStr} | 關係:TA是你的${pRelTagStr}(好感:${pBond}${pMemStr}${pAtCeilingStr}${pTierToneStr})`);
    }
  });
  const PROMPT_PARTY_SYSTEM = partyDetailsArr.length > 0 ? `【目前在場人物命格詳情】:\n${partyDetailsArr.join("\n")}` : "目前這個地點沒有其他人，玩家是獨自行動的。";

  // 具名/互動/好感的完整規則只在下方【在場驗證鐵律】講一次(canonical)，這裡只給「可以寫路人」的正面許可。
  const backgroundCrowdStr = `★【開放世界·背景人煙】：這是有血有肉的開放世界——場景可自由描寫路過行人、店員、其他顧客等不具名背景人物，增添生活感；但僅供氛圍點綴，具名與互動限制見下方【在場驗證鐵律】。`;

  // 🟢 性別配對提示，直接算好給 AI，不需要它自己推理。3人同場時先分組(與玩家同性/異性)，同組
  //   共用一句規則、只在句首列名字，避免逐一 NPC 各寫一整句規則重複。
  let genderHintStr = "";
  const presentRowsForGender = pcData.filter((r, i) => i !== 0 && r[COL.PC.ID] != pcId && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim() && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_"));
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

  // 🛡️ 比照Core_Settings.gs讀同一欄位(mergePhysicalStatus/parseVisibleStatus)的try/catch防呆——
  //   PHYSICAL理論上只會被JSON.stringify寫入，但COL是位置索引，欄位一旦錯位/被手動改壞，這裡
  //   若沒擋，該角色從此每回合都會拋錯、永遠好不了(見CLAUDE.md「邊界先擋」)。
  let pPhysicalObj = {}; try { pPhysicalObj = JSON.parse(pcData[pcIndex][COL.PC.PHYSICAL] || "{}"); } catch (e) { }
  if (Object.keys(pPhysicalObj).length === 0) pPhysicalObj = { "狀態": "如常" };
  // 提示詞只給前5個(即使實際存到30個)，省字數；真正的技巧清單仍完整存在MEMORY裡不受影響。
  let pSkills = kanshouSkillTagStr_(pcData[pcIndex][COL.PC.MEMORY]).split('、').slice(0, 5).join('、');
  // 玩家自己的換裝也要補進[情境延續]區塊(比照NPC每回合補進[名字 裝扮]行)，這是情慾場景AI主要
  //   參照的區塊，不能只在【玩家命格】看得到。
  let nsfwMemories = `\n[玩家『${pcName}』肉體]：${JSON.stringify(pPhysicalObj)}\n[身體記憶]：${pSkills}${myOutfit ? `\n[玩家『${pcName}』裝扮]：${myOutfit}（當前服裝·五官/髮色/體態不變）` : ""}`;

  // ⚡ 提速：跟上面 presentRowsForGender 是完全相同的 filter 條件，直接複用，省掉第二次整表掃描。
  let allPresentRows = presentRowsForGender;
  allPresentRows.forEach(r => {
    let npcPhysicalObj = {}; try { npcPhysicalObj = JSON.parse(r[COL.PC.PHYSICAL] || "{}"); } catch (e) { }
    if (Object.keys(npcPhysicalObj).length === 0) npcPhysicalObj = { "狀態": "如常" };
    let npcSkills = kanshouSkillTagStr_(r[COL.PC.MEMORY]).split('、').slice(0, 5).join('、');
    let relMem = r[COL.PC.REL_MEM] || "無";
    let npcOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👗 換裝：當前服裝穿著(換衣不換人·五官體態依本相；玩家UI設定或AI依appearance_extras更新)
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
    return `\n★【本回合系統指定巧遇——這次到訪期間持續有效的例外，不受【在場驗證鐵律】限制】：『${kanshouCasualOf_(kanshouEncounterHero)}』此刻恰好也在「${kanshouEncounterLocName}」，${kanshouEncounterMetBefore ? "是已經打過照面的熟面孔" : "是初次的邂逅"}——外貌氣質:${look}／日常個性:${words}。允許TA以真實姓名登場、持續互動，這段緣分在玩家離開這個地點前都有效，TA目前只是萍水相逢的路人：好感/關係不追蹤記錄；若情境合適，TA也可以自然道別離開，不必勉強撐到玩家換地點。${friendshipOnly}`;
  })() : "";

  // 深夜訪客(knockAccept選擇「開門」)：她的LOC已在前面被設成curL，之後會自動出現在partyRows
  //   裡拿到完整卡片，這裡只補一句「剛敲門進來」的情境描述(卡片本身不會講這件事的來龍去脈)。
  const kanshouKnockGuestStr = kanshouKnockGuestName
    ? `\n★【情境提示】：『${kanshouKnockGuestName}』是深夜敲了門、玩家剛讓TA進來的，可以自然帶出「剛開門迎接」的情境細節，不必假裝TA本來就一直在場。`
    : "";

  const driveStr = driveOn ? `
🔥【主動掌握·玩家已開啟】：在場同伴主動掌握節奏·把互動推進至「實際發生」·拒絕無止盡的曖昧空轉。①主動程度嚴依好感分階(好感<40僅言語試弄不肢體糾纏；高好感才解鎖進一步肢體接觸；80+方可索求到底)；②保持角色一致性(冷傲者冷傲地主動、羞怯者鼓起勇氣踏出一步)·禁霸道模板；③禁對玩家造成真正傷害；④文字尺度受好感天花板約束·篇幅依【篇幅隨關係濃淡】；⑤色度跟隨：玩家主動色·你在好感允許的親密階內跟隨玩家色度、細膩露骨寫肉體反應(禁無故迴避淡化)·未達該階依個性真實反應(拒絕/迴避/害羞/半推半就)·不得跨天花板；⑥情慾場(限好感達可情慾階)：大量具體生理特寫(絞緊/吸吮/痙攣/蜜液/水聲/啪啪)＋角色化斷續喘息破碎台詞·越色越露骨·未達階止於天花板依個性婉拒。` : '';

  const PROMPT_REL = `${backgroundCrowdStr}
★【視角鎖定】：旁白的「我」永遠只是玩家『${pcName}』本人·絕不把在場角色的心境誤寫成旁白第一人稱。請繼續往後推演！${nsfwMemories}${genderHintStr}${driveStr}
🛑【角色一致性】：NPC反應死守[性格]×[好感]落差(依下方【親密尺度五階】所處階段·未達戀人階不進情慾·高傲/剛烈者依個性拒斥)·不因劇情推進就線性軟化。即便肉體有生理反應·靈魂態度仍守設定——【用原本人格承受快感】(高傲咬牙不示弱、虔敬掙扎、活潑藏羞)·語癖自稱最激烈處也不崩·嚴禁退化成發情機器。`;

  // 有【專屬稱呼】就用暱稱取代真名；JSON 姓名欄不受影響、仍填真名。
  const npcDialoguePrompt = partyMembers.length > 0 ? `\n★【稱呼】：在場者有【專屬稱呼】就用暱稱、否則用真名「${partyMembers.join("、")}」·不自創第三種稱呼(僅narration/台詞·JSON欄仍填真名)。非清單所有人都要出聲。` : "";


  // 🌱 動態 master_note 的前置計算(要在 USER prompt 組裝【之前】算好——下面【玩家命格】那行的
  //   「你可透過 master_note.經歷 滾動增補」提及必須跟著 _doSideWrite 條件化，否則非側寫回合
  //   schema 已刪掉 master_note、USER prompt 卻還在催，AI 會自發吐出 schema 外的欄位擊穿節流)。
  const _allPrefKeys = ["對外性格", "獨處性格", "喜歡", "討厭"];
  const _prefLocks = kanshouGetPrefLocks_(pc[COL.PC.MEMORY]);
  const _unlockedPrefKeys = _allPrefKeys.filter(function (k) { return _prefLocks.indexOf(k) === -1; });
  // 🌀 側寫節流：計數 +1 存回 MEMORY(玩家列恆寫回·零額外 round-trip)，只在第 1、N+1、2N+1… 回合帶
  //   master_note(首回合必寫·抓初印象)。非側寫回合整塊拿掉、AI 專心敘事，落地端守衛同步擋掉自發輸出。
  const _swCount = kanshouGetSideWriteCount_(pc[COL.PC.MEMORY]) + 1;
  pc[COL.PC.MEMORY] = kanshouSetSideWriteCount_(pc[COL.PC.MEMORY], _swCount);
  const _doSideWrite = (_swCount % KANSHOU_SIDEWRITE_EVERY_ === 1);

  // 鑑賞無戰鬥，御主的 HP/MP/MAX_HP/MAX_MP 這4欄從未寫入，故 prompt 不提血量/魔力數值或瀕死判斷
  //   (與世界觀規則「禁止血量/生命變化」一致——該禁令在下方 USER 世界觀＋演出而非說明兩行)。
  const prompt = `【敘事法旨】：視角鎖定玩家『${pcName}』(ID: ${pcId})。
${PROMPT_PARTY_SYSTEM}
【玩家命格】：名號:${pcName} 【性別:${pc[COL.PC.SEX]}】 性格:${pc[COL.PC.PREF]} | 特徵:${pc[COL.PC.TRAIT]}${myOutfit ? ` | 裝扮:${myOutfit}` : ""} | 經歷:${pc[COL.PC.BACK] || "剛搬來冬木市"}${_doSideWrite ? '(可透過 master_note.經歷 滾動增補)' : ''} | 位置:${curL}${(() => { const _c = kanshouLocContextForAI_(curL, getKanshouHomeName_(pc[COL.PC.MEMORY], pcName)); return _c ? `（${_c}）` : ""; })()}

${PROMPT_REL}
★【在場驗證·最高優先】：只有【目前在場人物】可被指名對話/持續互動/記錄好感；背景路人不具名、不可指名互動、不追蹤好感、不可寫成固定角色。例外：①玩家明確邀請/招呼/引入第三人時該人可登場　②系統注入段明示豁免者(如【自然告辭】道別、【系統指定巧遇】)依該段辦。歷史提到但不在場的名字＝不在場的回憶·嚴禁憑空登場開口。
★【焦點禮讓】：玩家只對一位互動時焦點留給她·其他在場者維持背景(輕描一筆·不搶話打斷/介入親密·除非系統另有醋意/橋段提示)。${kanshouWorldRosterStr}${kanshouEncounterStr}${kanshouKnockGuestStr}${kanshouRoomEventStr}${kanshouNpcLeaveStr_}${kanshouVisitBlockedStr}${kanshouPromiseStr}${kanshouPromiseMetStr}${kanshouCohabitStr}${kanshouInviteStr}${kanshouHandHoldStr}${kanshouHoldingStr}${kanshouJealousStr}${kanshouPhotoStr}${kanshouShowPhotoStr}${kanshouEventSeed ? `\n★【氛圍靈感·非強制】：可自然納入一個小細節——${kanshouEventSeed}·不合劇情可不用。` : ""}${(() => { const _f = KANSHOU_FESTIVALS_.find(f => f.month === curDateObj_.month && f.day === curDateObj_.day); if (_f) return `\n★【節慶】：今天是「${_f.name}」·narration 自然帶入應景氣氛·不報幕。`; if (jumpFest) return `\n★【節慶】：明天就是「${jumpFest.name}」·街頭已有前夕氣氛·自然帶入不報幕。`; return ""; })()}
★【今日天氣】：${kanshouWeather_(curDay)}·自然滲入場景不必每句提。${kanshouAnnivStr}${intimateNightNames.length ? `\n★【入夜·好感達門檻】：『${intimateNightNames.join('、')}』與你羈絆已深(≥80)·今晚可自然發展到同床·依個性決定要不要跨出這步·不強制寫到底；未達門檻者各自安睡不越界。` : ""}${morningAfterNames ? `\n★【晨間餘韻·非強制】：昨夜與『${morningAfterNames}』或許共度親密(依上回合實際內容·沒跨出就當平常早晨)·可自然帶晨間溫馨曖昧·不強制不複述細節。` : ""}
💕【後日談模式·最高優先覆寫】：${partyRows.length === 0
    ? `眼下無相識者在場·玩家一個人的尋常時光。`
    : (partyRows.every(r => String(r[COL.PC.ID]).indexOf("KHV_") === 0) && partyRows.every(r => (parseInt(r[COL.PC.BOND]) || 0) < 20))
      ? `『${partyMembers.join("、")}』才剛與玩家在這城認識不久——非舊識重逢·是【初次相遇】後的日常·相處生澀依好感升溫·嚴禁暗示早已相熟或有共同過往。`
      : partyRows.every(r => String(r[COL.PC.ID]).indexOf("KHV_") === 0)
        ? `你與『${partyMembers.join("、")}』是在這城從陌生相識一路相處到現在——【無】戰前舊識或共同過往·但這段日子的感情真實·依各自好感/關係標籤演出該有的熟悉·別退回「才剛認識」的生澀。`
        : `與『${partyMembers.join("、")}』共度這座和平城鎮的尋常時光。`
  }
🕰️現在${curDateObj_.year}年${curDateObj_.month}月${curDateObj_.day}日・${kanshouFmtHM_(curHour)}・${timeBand_(curHour)}(揣摩氛圍用·不報時)。★【此刻＝${timeBand_(curHour)}·唯一真實】：歷史停在別的時段一律以此刻為準改寫·禁沿用舊時段(「這麼晚了」)。★一個動作約【十分鐘】·narration 只寫當下片段·禁自行跳時段/寫「過了好幾個鐘頭」「過了一段時間」(唯系統明確宣告推進時才承接)。
★世界觀＝和平現代城鎮日常：禁一切戰鬥/敵人/血量/死亡/威脅；即使認得名字的原作背景·也嚴禁提聖杯戰爭/從者/御主/令咒/寶具/英靈/召喚(這世界從未有·只沿用性格外貌氣質)。基調可閒可熱·不鎖「悠閒」。
★【親密尺度·依好感五階·最高優先·凌駕色度跟隨/慾海律令/主動掌握】：每位在場者肢體親密以她好感為天花板·玩家再主動露骨都不得越階·未達門檻她依個性擋下(人格不崩)：
・<20(點頭之交)：形同陌生人·一動手動腳就【連碰都碰不到】(閃避/擋手/喝止/還手依個性)。
・20~39(普通朋友)：婉拒一切情慾越界·可friendly不接受親密。
・40~59(熟識)：彆扭接受輕度接觸(牽手/靠肩/摸頭)·親吻以上會退開。
・60~79(親近)：親吻擁抱依偎可·脫衣/性事仍止住。
・80+(戀人)：無上限·依情境個性到底。
★多人各依各自好感·不共用同階。
★【篇幅隨關係濃淡】：低好感(點頭之交/普通朋友)點到為止(200~300字)·別把陌生互動寫成大段內心戲；熟識(40~59)約350~450字；親近以上(60+)約450~600字·隨關係加深逐步拉長、細節與內心刻畫同步加深，別卡在跟低好感差不多的字數。
★【演出而非說明】不直述其願望/萌點/個性字面。僅 rel_changes(好感)·不輸出生命變化或戰鬥。
★【地點清單】：世界只有這些地點：${KANSHOU_LOCATIONS_.map(l => l.name).join('、')}——move_proposal 只能填清單內名·禁自創地名。
★★【移動鐵律】：你和玩家【此刻在「${curL}」】。任何換場景都只能填 move_proposal(有【提議·同去】標記時【不填】·同去結果由系統裁定、你只演反應)·narration 停在「提議/達成共識/正要起身」就打住·禁演移動過程/抵達——沒填就是還在${curL}。禁把「泡泡/按鈕/地圖」等介面詞寫進敘事。(例外：玩家已用地圖移動＝系統已寫好新位置·直接寫此地當下·不再演路程。)
★【此地唯一真實】：場景/氛圍/對話對象一律以「${curL}」與在場名單為準·歷史在別地/別人的已是過去(被想起可以·開口不行·【自然告辭】豁免除外)·換幕就寫新場景。
★【不憑空生東西】：無金錢/物品/背包·禁自作主張讓玩家「準備好禮物」「掏錢包」「變道具」·送禮由玩家輸入決定。
★【不替玩家腦補·結尾停外部】：第一人稱『我』只演玩家實際輸入的動作＋當下五感·禁腦補大段內心戲/願望/替他做決定·禁把段落收在玩家的期待/渴望上·結尾停【外部當下】(對方反應/眼前場景/未完成的動作)·把「下一步想怎樣」留給玩家。
現在演化玩家動作：『${finalUserMsg}』${npcDialoguePrompt}

🚨【收尾${driveOn ? '·主動掌握' : ''}】：${driveOn ? '同伴主導推進·本回合大幅推進到位·該親暱該進一步就真的發生·別在曖昧邊緣空轉。但仍' : ''}停在「我」當下進行式的情緒·留未完成的動作/未說完的話交還玩家——但被玩家搭話的在場人物【必須先給出她此刻的回應】(答話或神情動作)才停筆·禁只寫完玩家動作就收尾·禁「那一刻/那一夜/自此/從此」等翻頁式總結收尾。`;

  try {
    // 🔥 平時矜持模式(driveOn=false)用跟solo共用的低延遲小模型(SOLO_MODEL)，只有主動掌握模式
    //   (driveOn=true)才切回鑑賞原本用的大型模型(AI_MODEL)——大多數回合是輕鬆日常對話，犯不著
    //   每次都吃重量級模型的延遲。max_tokens=1500：narration目標約500字＋其餘欄位，太低容易讓
    //   模型輸出被截斷成不完整JSON。
    // 🎛️ 2026-07 玩家調整採樣參數：temperature/top_p 略升、加top_k/repetition_penalty/presence_penalty/
    //   frequency_penalty 抑制重複套路句(如老是收在同一種收尾語氣)，僅driveOn吃到大模型(AI_MODEL)時
    //   這幾顆額外旋鈕才會實際生效，矜持模式(SOLO_MODEL)不支援的部分由OpenRouter靜默忽略。
    // 🚀 2026-07 探針實測定案(v2硬版·六階梯度)：SOLO_MODEL(當時為gemini-3.1-flash-lite，同月稍後升級為
    //   gemini-3.5-flash-lite，下述具體秒數/命中數字是舊版測的，僅供參考·未針對3.5重新探針)在真慾海律令下
    //   階4~6全過、露骨度🔥(極致階命中13個器官/水聲/動作字眼·真敢寫到底)、每次僅~4-5秒；反觀原本
    //   點火(driveOn=true)硬吃的 AI_MODEL(deepseek)慢達15~49秒、且極致露骨那階還被審查擋下。故【兩模式
    //   一律先打快 Gemini】、DeepSeek 只留最後備援(rare fallback，本就少觸發)。driveOn 從此【只控敘事
    //   推進幅度的提示詞強度、不再切模型】。retries=1：Gemini 腿試一次、真被擋才交棒，不浪費柔化重試。
    // ⚡ 純時間轉場(跳時段/結束一天/跳節慶/推進時間)只是換幕、不需 AI 寫滿500字場景——上限砍到600
    //   讓生成快一截(玩家實測「讓時間流轉到夜晚超級久」)。一般聊天/移動仍1500(narration目標約500字·
    //   太低會截斷成不完整JSON)。移動(moveTarget)不算轉場提速範圍——走到新地點仍要完整場景。
    const _timeJump = !!(userData.endDay === true || userData.jumpBand || userData.jumpFestival || (parseFloat(userData.advanceHours) || 0) > 0);
    let aiConfig = { temperature: 1.08, top_p: 0.97, top_k: 60, repetition_penalty: 1.12, presence_penalty: 0.25, frequency_penalty: 0.25, retries: 1, model: SOLO_MODEL, isNsfwMode: true, max_tokens: _timeJump ? 600 : 1500 };
    aiConfig.fallbackModel = AI_MODEL;

    // 抓取近 6 筆原始歷史(3輪)，轉換為 API 格式。
    // 🎬 換幕縮窗(確定性根治「換地點/換時段後被舊場景帶著跑」)：移動/跳時段/結束一天的回合只餵
    //   最近 1 輪——舊場景的對話根本不進 AI 眼睛、物理上不可能沿用；保留最近 1 輪讓「決定要來
    //   這裡」的話題接得上(帶同伴同行時對話不斷裂)。
    const _sceneCut = !!(moveTarget || userData.endDay === true || userData.jumpBand || userData.jumpFestival || (parseFloat(userData.advanceHours) || 0) > 0);
    const recentHistoryRaw = getGameHistoryBatchRaw(pcId, _sceneCut ? 2 : 6);
    if (recentHistoryRaw && recentHistoryRaw.length > 0) {
      aiConfig.chatHistory = recentHistoryRaw.map(msg => ({
        role: msg.speaker === "player" ? "user" : "assistant",
        content: String(msg.content)
      }));
    }

    // 🌱 動態 master_note：只把玩家【沒鎖】的性格欄交給 AI(鎖的連欄位都不出現在 schema)。buildDefaultSystemPrompt
    //   只有此處呼叫，故把系統提示詞在這裡組好、當 systemOverride 傳入(取代 callGeminiAPI 內的無參數 fallback)。
    //   _unlockedPrefKeys/_doSideWrite 已在 USER prompt 組裝前算好(見上方·prompt 內的經歷提及要跟著條件化)。
    // 🎛️ 玩家關掉【命運的抉擇】→ options 欄整個不進 schema(前端帶 optionsOn；沒帶=舊前端，照常給)。
    const _sysPrompt = buildDefaultSystemPrompt(_unlockedPrefKeys, _doSideWrite, userData.optionsOn !== false);
    const aiResponseRaw = callGeminiAPI(prompt, _sysPrompt, aiConfig);
    const start = aiResponseRaw.indexOf('{');
    const end = aiResponseRaw.lastIndexOf('}');
    const cleanJson = aiResponseRaw.substring(start, end + 1);
    const aiData = sanitizeAiData_(JSON.parse(cleanJson));

    // 🐛→✅ callGeminiAPI 全部重試/審查攔截皆失敗時，回傳的是一組「保底文字」JSON(而非丟例外)，
    //   長相跟真正生成成功的回應一模一樣——若照舊往下跑，這句「什麼都沒發生」的保底文字會被
    //   後面 saveGameHistoryBatch 原封不動存進歷史，下次呼叫又把它當成上一輪的既定事實餵回AI，
    //   可能讓AI誤以為劇情已經走到某個曖昧不明的狀態、接續出跟實際劇情矛盾的敘事。callGeminiAPI
    //   在保底文字裡加了 _genFailed 旗標即可辨識，失敗就在這裡直接回給前端、完全不進入後面任何
    //   側效(拍照/性格/回憶/提議…)、也不寫進歷史。
    if (aiData._genFailed) {
      // ⚠ 不帶 people——理由同上方 knockEvent 早退：這條沒人真的移動，夾 people:[] 會把前端
      //   localNPCs 快取洗成空(2026-07 稽核抓到這裡漏做了同一個已修過的防護)。
      return JSON.stringify({ text: aiData.narration, options: aiData.options });
    }

    // 📷 拍照落地：AI成功回應才耗底片＋寫相簿(失敗＝底片不浪費)。敘述吃AI的photo_caption，
    //   沒吐就用「時段的地點·人物」模板保底；髮色從第一位被拍者的TRAIT現場解析(通吃工房新角色)。
    var kanshouPhotoResult_ = null;
    if (kanshouPhotoPending_) {
      try {
        const _phCap = String(aiData.photo_caption || `${timeBand_(curHour)}的${String(curL || "")}，${kanshouPhotoPending_.names.join('、')}的身影。`).replace(/[<>&"'`｜【】]/g, "").slice(0, 90);
        const _phSubj = kanshouPhotoPending_.scenery ? null : pcData.find(r => String(r[COL.PC.NAME]).trim() === String(kanshouPhotoPending_.names[0]).trim() && String(r[COL.PC.FACTION]) === "從者" && sameGame(r));
        const _phHair = kanshouPhotoPending_.scenery ? '#7a9a6a' : kanshouHairHex_(_phSubj ? String(_phSubj[COL.PC.TRAIT] || "") : ""); // 風景照緞帶固定草綠
        const _phFlag = (driveOn || userData.roomEventAccept) ? '親密' : (kanshouReFest_ ? kanshouReFest_.name : '');
        const _phId = 'PH_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        kanshouAlbumSheet_().appendRow([myGameId, _phId, curDay, timeBand_(curHour), String(curL || ""), kanshouWeather_(curDay), kanshouPhotoPending_.names.join('、'), kanshouLocActivity_(curL, (kanshouPhotoPending_.names[0] || ""), curDay), _phCap, _phFlag, _phHair]);
        pcData[pcIndex][COL.PC.MEMORY] = kanshouFilmStamp_(pcData[pcIndex][COL.PC.MEMORY], curDay, kanshouPhotoPending_.used + 1);
        dirtyPcRows.add(pcIndex);
        kanshouPhotoResult_ = { ok: true, filmLeft: KANSHOU_FILM_PER_DAY_ - kanshouPhotoPending_.used - 1 };
      } catch (e) { kanshouPhotoResult_ = { ok: false, reason: 'error' }; }
    } else if (kanshouPhotoDenied_) {
      kanshouPhotoResult_ = { ok: false, reason: kanshouPhotoDenied_ };
    }




    // 💭 AI 不得自行搬動玩家(§134)：範本已不設 location 欄(見上)，正常回合 aiData.location 為 undefined、
    //   下面 aiLocRaw 得到空字串、aiAutoMoveProposal 恆空——此段對正常流程等於無操作。保留純為【保險】：
    //   萬一模型無視範本硬吐一個 location，也照樣轉成 move_proposal 泡泡由玩家決定，絕不無聲搬人。
    //   驗證同 move_proposal：只認 KANSHOU_LOCATIONS_ 內的合法地名，杜絕玩家點不到的幽靈地點。
    // 🚫→💭 能走到這裡的 aiData.location 一定是「AI 自作主張要換地點」的情況——
    //   玩家用地圖按鈕移動時，上游 moveTarget 管線(見1739)早已把 curL 寫好，AI 只是照抄、aiLoc===curL
    //   不會進這塊。故一律【不直接寫 LOC】，改把目標地名轉成 move_proposal 提議、跟同伴邀約共用同一個
    //   「同意/拒絕」泡泡(見下方 moveProposal 合併)，玩家按同意才走既有 moveTarget 管線真的移動(含巧遇/
    //   同伴跟隨)。這樣「AI 想移動玩家」也必須玩家點頭，不再無聲搬人。
    const aiLocRaw = String(aiData.location || "").trim().slice(0, 20);
    const aiAutoMoveProposal = (aiLocRaw && KANSHOU_LOCATIONS_.some(l => l.name === aiLocRaw) && aiLocRaw !== curL) ? aiLocRaw : "";

    // AI提議換地點需玩家同意：只轉發給前端顯示同意/拒絕UI，不在這裡寫LOC——真正的移動要等
    //   玩家按下「同意」、前端帶著moveTarget再送一次，走既有moveTarget管線。
    const moveProposalRaw = String(aiData.move_proposal || "").trim();
    // AI 明確填的 move_proposal 優先；沒填但它自作主張寫了 location(aiAutoMoveProposal)也一併轉成提議，
    //   兩條路最後都走同一個「同意」泡泡。
    let moveProposal = (moveProposalRaw && KANSHOU_LOCATIONS_.some(l => l.name === moveProposalRaw) ? moveProposalRaw : "") || aiAutoMoveProposal; // let：下方玩家提議同去(type:'move')她接受時會回填

    // 📅🤝 相約/牽手的成立判定：pre-AI只記了待判定(_pendingProposal)、沒動MEMORY，這裡讀AI依角色
    //   個性與好感給出的 proposal_accept 才決定要不要落地。fail-closed：只有明確「接受」且無「拒」字
    //   才算成立，空字串/模稜兩可一律視為未答應(寧可不成立，不讓提議太容易通過)。
    // kanshouProposalResult_ 已於 pre-AI(promiseAccept 那塊)宣告——這裡直接賦值，別再 let 蓋出內層影子
    //   變數(否則回傳時讀到的是外層那個、拿不到這裡寫的值)。一回合只走 promiseAccept 或 proposal_accept 一條。
    if (_pendingProposal) {
      // 🫶 成敗由 GAS 於 pre-AI 依好感擲定(_pendingProposal.accepted)，不再讀 AI 的 proposal_accept——
      //   AI 只負責照裁定演出她的反應。(2026-07 由 AI 判定改 GAS 判定·kanshouProposalAccepts_)
      const _accepted = !!_pendingProposal.accepted;
      // 🐛→✅ 牽手(hold)的 idx 是【玩家自己列】(標記存玩家MEMORY)，拿 idx 的名字會變成玩家自己
      //   (「風音沒有讓你牽手」)——她的名字存在 _pendingProposal.name，優先用它。
      const _ppHer = String(_pendingProposal.name || pcData[_pendingProposal.idx][COL.PC.NAME] || "");
      if (_accepted) {
        if (_pendingProposal.type === 'promise') {
          pcData[_pendingProposal.idx][COL.PC.MEMORY] = kanshouSetPromise_(pcData[_pendingProposal.idx][COL.PC.MEMORY], curDay + 1, _pendingProposal.loc, _pendingProposal.band);
          // 📅 明確回饋：後端默默寫 tag、玩家不知成沒成(實測黑洞)——回傳 proposalResult 讓前端跳通知條。
          const _prBandLabel = _pendingProposal.band ? (KANSHOU_APPT_BANDS_.find(b => b.band === _pendingProposal.band) || {}).label : "";
          kanshouProposalResult_ = { ok: true, type: 'promise', name: _ppHer, loc: _pendingProposal.loc, bandLabel: _prBandLabel };
        } else if (_pendingProposal.type === 'hold') {
          pcData[_pendingProposal.idx][COL.PC.MEMORY] = KANSHOU_HANDHOLD_TAG_.set(pcData[_pendingProposal.idx][COL.PC.MEMORY], _pendingProposal.name);
          kanshouProposalResult_ = { ok: true, type: 'hold', name: _ppHer };
        } else if (_pendingProposal.type === 'move') {
          // 🚶 她答應同去→轉成既有「前往」泡泡(玩家按同意才真的移動，走 moveTarget 管線、帶同地眾人)
          moveProposal = _pendingProposal.loc;
          kanshouProposalResult_ = { ok: true, type: 'move', name: _ppHer, loc: _pendingProposal.loc };
        }
        dirtyPcRows.add(_pendingProposal.idx);
      } else {
        // 她婉拒同去時清掉 moveProposal——AI 偶爾會順手把 move_proposal 也填了(移動鐵律的「不填＝不會發生」
        //   讓它緊張)，不清＝玩家同時收到「她婉拒了」通知＋「前往」泡泡，自相矛盾。
        if (_pendingProposal.type === 'move') moveProposal = "";
        // loc：move 婉拒的通知條要顯示地名(稽核抓到「不想去「」」空字串)；其他型別不讀此欄、帶著無害。
        kanshouProposalResult_ = { ok: false, type: _pendingProposal.type, name: _ppHer, loc: _pendingProposal.loc || "" };
      }
    }

    // 📅🏠 她主動提議(promise_proposal / cohabit_proposal)：AI 這回合讓某在場同伴開口邀約→GAS 驗證後轉成
    //   「同意泡泡」回傳前端(kanshouAiPromise_/kanshouAiCohabit_)，玩家按同意才落地(意圖非結果，跟 move_proposal
    //   同一套)。只認此刻同地在場、且未婉拒門檻的對象；驗不過就當她只是隨口說說、不跳泡泡。
    let kanshouAiPromise_ = null, kanshouAiCohabit_ = null;
    const _inSceneIdxByName = (nm) => {
      const n = String(nm || "").trim();
      return n ? pcData.findIndex((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(n) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()) : -1;
    };
    // 她邀約：只在玩家這回合沒有正在處理的提議泡泡(moveProposal)時才浮，避免一次跳兩個泡泡打架。
    if (!moveProposal && aiData.promise_proposal && typeof aiData.promise_proposal === 'object') {
      const _apLoc = String(aiData.promise_proposal.loc || "").trim();
      const _apIdx = _inSceneIdxByName(aiData.promise_proposal.name);
      // 同 promiseMeet：未解鎖私宅不可當約定地(必爽約陷阱)，AI 約在那裡＝當她隨口說說、不跳泡泡。
      if (_apIdx !== -1 && KANSHOU_LOCATIONS_.some(l => l.name === _apLoc && l.region !== 'room' && (l.region !== 'visit' || kanshouResidenceUnlocked_(pcData, _apLoc, _myGid_)))) {
        const _apBand = kanshouApptHour_(String(aiData.promise_proposal.band || "").trim()) !== null ? String(aiData.promise_proposal.band).trim() : "";
        const _apLabel = _apBand ? (KANSHOU_APPT_BANDS_.find(b => b.band === _apBand) || {}).label : "";
        kanshouAiPromise_ = { name: String(pcData[_apIdx][COL.PC.NAME]), loc: _apLoc, band: _apBand, bandLabel: _apLabel };
      }
    }
    // 她邀同居：需在場＋好感達門檻＋尚未同住(同 cohabitInvite 落地端的門檻，玩家按同意走既有 cohabitInvite)。
    if (!moveProposal && !kanshouAiPromise_ && aiData.cohabit_proposal) {
      const _acIdx = _inSceneIdxByName(aiData.cohabit_proposal);
      if (_acIdx !== -1 && (parseInt(pcData[_acIdx][COL.PC.BOND]) || 0) >= KANSHOU_COHABIT_BOND_ && !kanshouIsCohabit_(pcData[_acIdx])) {
        kanshouAiCohabit_ = { name: String(pcData[_acIdx][COL.PC.NAME]) };
      }
    }

    // 🚶‍♀️ 同伴自主離場(npc_exit)：AI判斷某在場同伴這回合自然告辭時，GAS真的把她移出場景——依當前
    //   時刻骰她的日常去向(獨立住民作息)，下回合就不在你身邊，解掉舊「嘴上說走卻還在場」的違和。
    //   只認此刻同地在場的同伴(防AI點名不在場者)；骰回原地就改去登記住處/任一非原地公開地點，確保
    //   她真的離開。被牽著手的她若在此離場→牽手一併鬆開(不能牽著已離場的人)。
    {
      const exitList = Array.isArray(aiData.npc_exit) ? aiData.npc_exit : [];
      if (exitList.length) {
        const _heldNow = KANSHOU_HANDHOLD_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]);
        exitList.forEach(nm => {
          const exitName = String(nm || "").trim();
          if (!exitName) return;
          const eIdx = pcData.findIndex((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(exitName) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim());
          if (eIdx === -1) return;
          let dest = kanshouRollDailyLocation_(pcData[eIdx][COL.PC.NAME], curHour, kanshouIsCohabit_(pcData[eIdx]));
          if (String(dest || "").trim() === String(curL || "").trim()) {
            const eHeroId = kanshouHeroIdByName_(pcData[eIdx][COL.PC.NAME]);
            const eHome = eHeroId && KANSHOU_HERO_HOME_[eHeroId];
            dest = (eHome && eHome !== curL) ? eHome
              : ((KANSHOU_LOCATIONS_.filter(l => l.region !== 'room' && l.region !== 'visit' && l.name !== curL)[0] || {}).name || dest);
          }
          pcData[eIdx][COL.PC.LOC] = dest;
          dirtyPcRows.add(eIdx);
          if (_heldNow && kanshouNameCandidates_(String(pcData[eIdx][COL.PC.NAME])).includes(_heldNow)) {
            pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_HANDHOLD_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');
            dirtyPcRows.add(pcIndex);
          }
        });
      }
    }

    // 鑑賞無戰鬥：血量快照/stat_changes(外顯狀態刷新)/經濟層(物品/金錢/任務)皆不追蹤、不落地。
    //   肉體/外顯走 intimacy_feedback(physical_state)。

    {
      // 🛡️ AI偶爾會漏包陣列包裝或塞null元素，forEach前先擋形狀，避免整回合(含narration)被
      //   一個TypeError整段吞掉——防呆原則跟本檔其餘AI輸入處理一致(sanitizeAiData_同款精神)。
      const relChangesToProcess = Array.isArray(aiData.rel_changes) ? aiData.rel_changes : [];

      relChangesToProcess.forEach(rc => {
        if (!rc || typeof rc !== 'object') return;
        const tNpc = rc.target ? String(rc.target).trim() : String(rc.npc || "").trim();
        if (!tNpc || tNpc === pcName || tNpc === "自己") return;

        // 羈絆已併入該 NPC 自己列（BOND/REL_TAG）——找不到該人此局的列就無可寫入。
        //   用 kanshouNameCandidates_ 比對，容忍AI只用括號前後其中一段稱呼TA。
        const nIdx = pcData.findIndex(r => kanshouNameCandidates_(r[COL.PC.NAME]).includes(tNpc) && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
        if (nIdx === -1) return;
        // 🐛→✅ 玩家實測前主動抓到：這裡從沒檢查這個人是否真的在場(partyRows)——AI若因對話歷史殘留
        //   或幻覺提到不在場的人名，好感值仍會被悄悄寫入。提示詞明講「只有目前在場人物」才准變動好感
        //   (2463行「後日談模式」段)，這裡補上同一道在場檢查，跟 npc_exit(2660行)/intimacy_feedback
        //   共用同一個判準，不再各自為政。
        if (String(pcData[nIdx][COL.PC.LOC] || "").trim() !== String(curL || "").trim()) return;
        dirtyPcRows.add(nIdx);

        // 鑑賞允許好感依劇情推進（solo 的好感收歸 GAS 按鈕，走不同的 narrate_only 路徑，不受這裡影響）
        // 🐛→✅ 玩家實測前主動抓到：提示詞明講單回合好感漲幅上限(±5)，但這裡只有 sanitizeAiData_ 的
        //   [-100,100]粗夾，AI 一次亂寫的極端值(如100)在低好感時仍可能一口氣衝過好幾個等級。改成先夾
        //   單回合漲跌幅本身，再套用既有的梯度上限/範圍檢查，說到做到。
        let change = Math.max(-5, Math.min(5, parseInt(rc.fav_change) || 0));

        let oldFav = parseInt(pcData[nIdx][COL.PC.BOND]) || 0;
        let newFav = Math.max(-100, Math.min(100, oldFav + change));
        // 純聊天加好感卡在目前梯度上限，約定赴約/橋段才能突破(見kanshouRelChatCeiling_)——只夾正向漲幅，
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

      // physical_state 只管顏面神情。提示詞要求≤15字，後端刻意截 20 當【容錯緩衝】——AI 常超寫兩三字
      //   (如「…因尷尬而生的紅暈」17字)，硬剪 15 會產生斷尾殘句(「…因尷尬而生的」·玩家實測回報)，
      //   寧可放寬 5 字也不要斷句。⚠ 別再「對齊文件」改回 15，這個差距是刻意的。
      const sanitizePhysicalState = (rawState) => {
        if (typeof rawState !== 'string') return "";
        const val = rawState.trim().slice(0, 20);
        return (!val || ignoreWords.includes(val)) ? "" : val;
      };

      // appearance_extras：AI 如實回報的當下實際穿著/配飾，篩掉敷衍語後直接交給既有 setOutfit_ 寫回
      //   持久的【換裝】記錄(setOutfit_ 本身已有 40 字硬上限與清洗特殊字元，這裡不重複截斷)。
      const sanitizeAppearanceExtras = (rawOutfit) => {
        if (typeof rawOutfit !== 'string') return "";
        // 🩹 這欄要的是【穿著本身】(如「質地優雅的絲綢襯衫」)，AI 偶爾寫成動作句(「換上了一件…。」)，
        //   卡片顯示「裝扮 換上了一件…」變病句(玩家實測)——剝掉動作前綴/量詞/句尾標點，留衣物描述。
        const val = rawOutfit.trim()
          .replace(/^(剛?(換|穿|披|套|繫|着|著)上了?|換回了?|改穿了?)\s*/, "")
          .replace(/^(一件|一身|一套|一襲)\s*/, "")
          .replace(/[。！!，,]+$/, "").trim();
        return (!val || ignoreWords.includes(val)) ? "" : val;
      };


      const processSkills = (oldMem, newSkillsStr) => {
        // 邊界用全形｜(跟整個MEMORY生態系其餘標記【換裝】【邂逅】等一致)，而非半形「| [」。
        let skillMap = {}; let oldSkills = (oldMem.match(/\[雙修技巧\]([^｜]*)/) || [])[1]?.trim() || "";
        if (oldSkills && oldSkills !== "無") oldSkills.replace(/^\.\.\./, "").split('、').forEach(p => { let m = p.match(/(.+?)\(Lv\.(\d+)\)/); if (m) skillMap[m[1].trim()] = parseInt(m[2], 10); else if (p.trim()) skillMap[p.trim()] = 1; });
        // 🛡️ AI可能幻覺出帶｜【】的技巧名(這串本身就充滿這類格式範例)，比照setOutfit_/setWeapon_
        //   同款清洗，避免污染到MEMORY其餘標記的邊界。
        if (String(newSkillsStr || "").trim() && String(newSkillsStr || "").trim() !== "無") String(newSkillsStr || "").trim().split('、').forEach(s => { let cn = s.replace(/[\(\[]?Lv\.?\d+[\)\]]?/gi, '').replace(/[｜【】\[\]]/g, '').trim(); if (cn) skillMap[cn] = Math.min((skillMap[cn] || 0) + 1, 10); });
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

      // 💞 共同回憶(27欄 MEMOIR)：同 processTags 精神——append 去重、保留最近 maxCount 條。差別是這格是
      //   獨立 cell(非 REL_MEM 裡的標籤)，且一條回憶句子本身可能含「、」，故【改用全形｜當條目分隔】、
      //   寫入前先清掉句中的 ｜【】[] 避免污染分隔(比照 setOutfit_/processSkills 的清洗)。
      const processMemoir_ = (oldMemoir, newLine, maxCount) => {
        let arr = String(oldMemoir || "").split('｜').map(x => x.trim()).filter(x => x !== "" && x !== "無");
        let clean = String(newLine || "").replace(/[｜【】\[\]★]/g, "").trim().slice(0, 40);
        // 🛡️ 相似度去重(玩家實測「超級洗畫面」)：同一事件在3輪歷史窗裡迴盪，Gemini每回合換句話說
        //   重記一條(「約定去社區公園」記了四種說法)。精確比對擋不住換句話說→加「字元雙字組
        //   containment」：與【最近3條】任一條重疊率≥0.6視為同一件事、不收(只比近期＝針對迴盪
        //   窗，久遠條目不誤殺真正的新里程碑)。
        const _bi = s => { const t = String(s).replace(/^★/, "").replace(/[，。、！？…\s]/g, ""); const o = new Set(); for (let i = 0; i < t.length - 1; i++) o.add(t.substr(i, 2)); return o; };
        const _echoDup = (cand) => {
          const cb = _bi(cand); if (cb.size < 4) return false;
          return arr.slice(-3).some(x => {
            const xb = _bi(x); if (xb.size < 4) return false;
            let hit = 0; cb.forEach(g => { if (xb.has(g)) hit++; });
            return hit / Math.min(cb.size, xb.size) >= 0.6;
          });
        };
        // 去重比對忽略★前綴(玩家釘選標記，見actionKanshouMemoirOp)，避免同一條被釘選後又重複收錄。
        if (clean && clean !== "無" && !arr.some(x => x.replace(/^★/, "") === clean) && !_echoDup(clean)) arr.push(clean);
        if (arr.length <= maxCount) return arr.join('｜');
        // 超量淘汰：★釘選的永不驅逐，只淘汰未釘選裡最舊的；輸出保持原本時序。
        const pinnedCount = arr.filter(x => x.charAt(0) === '★').length;
        let dropLeft = Math.max(0, arr.length - Math.max(maxCount, pinnedCount));
        return arr.filter(x => { if (x.charAt(0) === '★' || dropLeft === 0) return true; dropLeft--; return false; }).join('｜');
      };

      if (aiData.intimacy_feedback.player) {
        const pfb = aiData.intimacy_feedback.player;
        const pCleanState = sanitizePhysicalState(pfb.physical_state);
        if (pCleanState) pcData[pcIndex][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[pcIndex][COL.PC.PHYSICAL], pCleanState);

        const pAppearanceExtras = sanitizeAppearanceExtras(pfb.appearance_extras);
        if (pAppearanceExtras) pcData[pcIndex][COL.PC.MEMORY] = setOutfit_(pcData[pcIndex][COL.PC.MEMORY], pAppearanceExtras);

        let oldPMem = pcData[pcIndex][COL.PC.MEMORY] || "";
        pcData[pcIndex][COL.PC.MEMORY] = setSkillTag_(oldPMem, processSkills(oldPMem, pfb.dynamic_skills));
      }

      if (Array.isArray(aiData.intimacy_feedback.npcs)) {
        aiData.intimacy_feedback.npcs.forEach(nfb => {
          if (!nfb || typeof nfb !== 'object') return;
          const tName = String(nfb.name || "").trim();
          // 🛡️ 跟上面rel_changes同款自己排除——AI若在npcs清單誤寫玩家本名(NSFW雙向情境確實
          //   可能誤觸發)，這裡沒擋會找到pcIndex、把「NPC視角」的欄位寫進玩家自己列。
          if (!tName || tName === pcName || tName === "自己") return;
          // 同款括號全名比對問題(見上方 kanshouNameCandidates_)，這裡也會影響每回合寫入失敗。
          const targetIdx = pcData.findIndex(r => kanshouNameCandidates_(r[COL.PC.NAME]).includes(tName) && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
          if (targetIdx === -1) return;
          // 🐛→✅ 同上方 rel_changes 的漏洞：從沒檢查這個人是否真的在場，AI幻覺/歷史殘留提到的不在場
          //   人物一樣能被寫入外顯/技巧/共同回憶——比照補上同一道在場檢查。
          if (String(pcData[targetIdx][COL.PC.LOC] || "").trim() !== String(curL || "").trim()) return;

          dirtyPcRows.add(targetIdx);
          const nCleanState = sanitizePhysicalState(nfb.physical_state);
          if (nCleanState) pcData[targetIdx][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[targetIdx][COL.PC.PHYSICAL], nCleanState);
          const nAppearanceExtras = sanitizeAppearanceExtras(nfb.appearance_extras);
          if (nAppearanceExtras) pcData[targetIdx][COL.PC.MEMORY] = setOutfit_(pcData[targetIdx][COL.PC.MEMORY], nAppearanceExtras);
          if (nfb.dynamic_skills) {
            let oldNMem = pcData[targetIdx][COL.PC.MEMORY] || "";
            pcData[targetIdx][COL.PC.MEMORY] = setSkillTag_(oldNMem, processSkills(oldNMem, nfb.dynamic_skills));
          }

          // 羈絆記憶已併入該 NPC 自己列的 REL_MEM 欄，現在只剩專屬稱呼。
          let oldRMem = pcData[targetIdx][COL.PC.REL_MEM] || "";
          let nickPart = `[專屬稱呼]${processTags(oldRMem, /\[專屬稱呼\](.*?)(?=\| \[|$)/, nfb.mutual_nicknames, 3)}`;
          // 態度是「當下這一刻」的快照(跟累積/去重的專屬稱呼不同)，每回合直接覆蓋成最新值。
          let attRaw = (typeof nfb.attitude === 'string') ? nfb.attitude.trim().slice(0, 15) : "";
          // 🩹 差分模式配套：AI 留空(無變化)/「無」/敷衍語(同上、維持現狀…)→沿用舊態度，
          //   不再整欄洗掉、也不讓「同上」被當真值寫進 REL_MEM 持久污染。
          if (!attRaw || attRaw === "無" || ignoreWords.includes(attRaw)) attRaw = ((String(oldRMem).match(/\| \[態度\](.*)$/) || [])[1] || "").trim();
          let attPart = (attRaw && attRaw !== "無") ? `| [態度]${attRaw}` : "";
          pcData[targetIdx][COL.PC.REL_MEM] = `${nickPart}${attPart}`;

          // 💞 共同回憶：AI 這回合若吐了里程碑 memory，append 進她自己列的 27 欄(最近 10 條、去重)。
          //   只記里程碑、日常填「無」不動；她在場時會被讀回在場卡(見 partyDetailsArr)餵給 AI 承接。
          if (nfb.memory && String(nfb.memory).trim() && String(nfb.memory).trim() !== "無") {
            pcData[targetIdx][COL.PC.MEMOIR] = processMemoir_(pcData[targetIdx][COL.PC.MEMOIR], nfb.memory, 10);
          }
        });
      }
    }

    // 🌱 玩家御主「滾動側寫」(master_note)：AI 慢慢認識玩家。經歷每回合承接舊值滾動更新(bounded)；
    //   性格四格【只回填玩家仍留白的欄】(玩家自己改命填過的＝鎖，AI 絕不覆寫，判準：該格非空)。
    //   _doSideWrite 守衛：非側寫回合 AI 若無視 schema 自發吐 master_note 也不落地(節流不可被擊穿)。
    if (_doSideWrite && aiData.master_note && typeof aiData.master_note === 'object') {
      const mn = aiData.master_note;
      // 經歷：AI 承接舊值增補後回傳整段，這裡直接採用；空/未給則保留原經歷不動。
      //   不鎖——玩家改命=修正，AI 之後照樣繼續滾動更新。
      //   ⚠ slice(0,80)：schema 跟 AI 說 ≤50，這 30 字是刻意的容錯緩衝(比照 physical_state 15/20)，
      //   AI 略超時不半句腰斬——別「對齊文件」改回 50。
      const _newExp = String(mn["經歷"] || "").replace(/[<>【】｜]/g, "").trim().slice(0, 80);
      if (_newExp) { pcData[pcIndex][COL.PC.BACK] = _newExp; dirtyPcRows.add(pcIndex); }
      // 性格四格(對外/獨處/喜歡/討厭)：【玩家改命自訂的鎖死不碰、AI 自己寫的可持續 refine】。
      //   判準改用【性格鎖】標記(非「格子是否空」)——AI 給了新值就更新(允許修正自己先前的判斷)。
      const _locks = kanshouGetPrefLocks_(pcData[pcIndex][COL.PC.MEMORY]);
      const _prefSlots = String(pcData[pcIndex][COL.PC.PREF] || "").split("、");
      while (_prefSlots.length < 4) _prefSlots.push("");
      const _mnKeys = ["對外性格", "獨處性格", "喜歡", "討厭"];
      let _prefChanged = false;
      _mnKeys.forEach((k, i) => {
        if (_locks.indexOf(k) !== -1) return; // 玩家改命自訂→鎖死，AI 絕不覆寫
        const v = String(mn[k] || "").replace(/[<>【】、｜]/g, "").trim().slice(0, 12);
        if (v && v !== String(_prefSlots[i] || "").trim()) { _prefSlots[i] = v; _prefChanged = true; } // AI 給值且有變→更新(可refine)
      });
      if (_prefChanged) { pcData[pcIndex][COL.PC.PREF] = _prefSlots.slice(0, 4).join("、"); dirtyPcRows.add(pcIndex); }
      // 萌點：AI 盲寫(看不到現值·紅線②不餵)，故【只補第一個發現、之後不覆寫】——INTENT 空才寫，
      //   非空(AI 補過 or 玩家改命填過)＝鎖死不動。玩家改命隨時可覆蓋。
      const _curMoe = String(pcData[pcIndex][COL.PC.INTENT] || "").trim();
      if (!_curMoe) {
        const _newMoe = String(mn["萌點"] || "").replace(/[<>【】、｜]/g, "").trim().slice(0, 20);
        if (_newMoe) { pcData[pcIndex][COL.PC.INTENT] = _newMoe; dirtyPcRows.add(pcIndex); }
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

    // 橋段邀請按鈕(夜襲/賴床/地點/節慶共用)：candidate在回合開頭(任何LOC寫入之前)就算好了，
    //   這裡直接沿用，不應該重算——重算會撞回「同行同伴LOC已被同步」的舊bug。label/btn由
    //   KANSHOU_SCENE_EVENTS_資料驅動，前端照顯示、不再硬編各事件文字。
    // 🤝 巧遇中對象→前端「結識」邀請框(encounterOffer)：她只是路人，玩家點了才正式入駐。
    const encounterOffer = kanshouEncounterHero ? { name: String(kanshouCasualOf_(kanshouEncounterHero)) } : undefined;
    const roomEventOffer = kanshouRoomEventCandidate_ ? (() => {
      const _ev = KANSHOU_SCENE_EVENTS_[kanshouRoomEventCandidate_.eventKey] || {};
      // 候選快照建於告辭/快轉重骰之前——回傳前用當下 LOC 重驗一次，別把已離場者的幽靈按鈕發出去。
      kanshouRoomEventCandidate_.matches = kanshouRoomEventCandidate_.matches.filter(m => String(pcData[m.idx][COL.PC.LOC] || "").trim() === String(curL || "").trim());
      if (!kanshouRoomEventCandidate_.matches.length) return undefined;
      const _names = kanshouRoomEventCandidate_.matches.map(m => m.name);
      // candidates=在場全部；labelTpl帶{n}讓前端各自替換(單人)，多人時前端列每人一顆按鈕。
      return { eventKey: kanshouRoomEventCandidate_.eventKey, candidates: _names, name: _names[0], labelTpl: String(_ev.label || ''), btn: String(_ev.btn || '靠近她') };
    })() : undefined;

    const localPeopleList = getKanshouPeopleList_(pcId, curL, pcData);

    let finalResponseText = aiData.narration || "天地混沌，一片寂靜。";
    finalResponseText = finalResponseText.replace(/\n/g, "<br>");






    // 好感度渲染／血量變化顯示區塊皆不輸出：好感度不顯示在敘述介面上，鑑賞無戰鬥不顯示血量變化。






    saveGameHistoryBatch(pcId, [
      { speaker: "player", content: userMsg },
      // 🩹 <br> 正規化：Gemini 偶爾直接輸出 <br> 標籤——即時顯示走 innerHTML 看不出來，但存進
      //   歷史表後重載會被 escapeHtml 跳脫成裸字「<br><br>」(玩家實測)。存檔前一律轉回換行。
      { speaker: "ai", content: String(aiData.narration || "").replace(/<br\s*\/?>/gi, "\n") }  // 用原始 narration 不用 finalResponseText
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
      encounterOffer: encounterOffer,
      proposalResult: kanshouProposalResult_ || undefined,
      promiseSettle: kanshouPromiseSettle_.length ? kanshouPromiseSettle_ : undefined, // 📅 赴約/爽約結算通知陣列(獨立通道·不與提議結果搶單槽·可同時容納多筆)
      promiseWait: kanshouPromiseWait_ || undefined,
      promiseProposal: kanshouAiPromise_ || undefined, // 📅 她主動邀約→前端跳同意泡泡
      cohabitProposal: kanshouAiCohabit_ || undefined, // 🏠 她主動邀同居→前端跳同意泡泡
      prefLocks: _prefLocks, // 🔒 玩家已鎖的性格欄→前端快取，改命視窗顯示開關狀態
      photoResult: kanshouPhotoResult_ || undefined,
      kanshouClock: kanshouClock,
      // 修過的bug：#clock-hud讀共用的updateClock(data.clock,...)，但data.clock在鑑賞這條路徑
      //   上從來沒被設過，導致HUD一直被當成「沒有clock」隱藏。這裡補上同一份kanshouClock.label
      //   餵給共用HUD，不是另開一條時鐘。
      clock: kanshouClock ? kanshouClock.label : ""
    });

  } catch (e) {
    // 🐛→✅ 2026-07 稽核抓到：舊版這裡回的物件沒有 success:false，前端因此判斷成「正常敘事」
    //   直接把原始JS例外訊息(如 TypeError...)當「說書人」台詞演出，違反show-don't-tell、玩家也
    //   分不出是劇情還是系統壞了。改回前端既有的 success:false 分支(⚠警示樣式，不進敘事流)。
    return JSON.stringify({ success: false, message: "系統暫時發生錯誤，請再試一次。" });
  }
}

// ==========================================
// 📷 相簿 actions（拍照本體在 actionPlay 的 takePhoto/showPhoto 分支，這裡只有讀取與刪除）
// ==========================================
// 讀相簿：本局全部照片(新到舊)＋今日剩餘底片。dateLabel後端算好(kanshouAbsDayToDate_)，前端零日曆邏輯。
function actionGetAlbum(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = kanshouOwnedRowIdx_(pcData, pcId, String(userData.acctName || "").trim());
  if (pIdx === -1) return JSON.stringify({ success: false, photos: [] });
  const gid = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const curDay = parseInt(pcData[pIdx][COL.PC.DAY]) || 1;
  const rows = kanshouAlbumSheet_().getDataRange().getValues();
  const photos = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) !== gid) continue;
    const d = parseInt(rows[i][2]) || 0;
    const dt = kanshouAbsDayToDate_(d);
    photos.push({
      id: String(rows[i][1]), day: d, dateLabel: `${dt.month}月${dt.day}日`, band: String(rows[i][3]),
      loc: String(rows[i][4]), weather: String(rows[i][5]), names: String(rows[i][6]),
      activity: String(rows[i][7]), caption: String(rows[i][8]), flag: String(rows[i][9]),
      hair: String(rows[i][10]), developed: d < curDay
    });
  }
  const filmLeft = Math.max(0, KANSHOU_FILM_PER_DAY_ - kanshouFilmUsed_(pcData[pIdx][COL.PC.MEMORY], curDay));
  return JSON.stringify({ success: true, photos: photos, filmLeft: filmLeft, filmPerDay: KANSHOU_FILM_PER_DAY_, cap: KANSHOU_ALBUM_CAP_ });
}
// 刪照片：只能刪自己這局的(照片ID＋遊戲ID雙比對)，相簿滿了得騰位子才能再拍。
function actionAlbumDelete(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = kanshouOwnedRowIdx_(pcData, pcId, String(userData.acctName || "").trim());
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const gid = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  const pid = String(userData.photoId || "").trim();
  if (!pid) return JSON.stringify({ success: false, message: "未指定照片" });
  const sh = kanshouAlbumSheet_();
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === gid && String(rows[i][1]) === pid) {
      sh.deleteRow(i + 1);
      return JSON.stringify({ success: true });
    }
  }
  return JSON.stringify({ success: false, message: "查無此照片" });
}
