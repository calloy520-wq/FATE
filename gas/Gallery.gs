// ==========================================
// 🏆 Gallery.gs — 鑑賞軌道全集中（慾海後日談，與封存從者的和平約會）
//   從英靈殿直接召喚同伴進入後日談，不必先在 solo 打贏封存；不寫「鑑賞」表(該schema已移除，
//   全代碼庫無讀寫者，留著的空分頁無害可自行刪除)。
//   actionPlay/buildDefaultSystemPrompt(含nsfwBaseRules)也集中在本檔，鑑賞相關代碼只查
//   這一個檔案即可；callGeminiAPI 留在 Engine_Combat.gs(solo/鑑賞共用基礎設施)。solo結束一局的
//   清理(actionEndRun/purgeGameData_/findPlayerServant_)住在Account.gs(2026-07「完全拆分」
//   稽核搬過去——這三個其實是solo game-lifecycle清理，不是鑑賞邏輯，只是historically放錯檔)。
// ==========================================

// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。
// 防呆：AI 輸出寫入試算表前夾住異常值(幻覺型別跑掉)，只動範圍明確的數值欄位，單回合好感限 -100~+100。
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
  // 🛡️→✅ 2026-07 邊界稽核：options 是原樣轉發給前端、一個字串長一顆按鈕的欄位，卻從沒設過上限。
  // 🧹 順手剝掉鷹架：schema 用「1. [主動]…」教 AI 出四種走向，但那串編號與分類標籤原樣變成按鈕文字，
  //    按下去又原樣回灌成【玩家意圖】、再進近期摘要——分類是給 AI 的，玩家不該看到。
  if (Array.isArray(aiData.options)) {
    aiData.options = aiData.options
      .filter(o => typeof o === 'string' && o.trim())
      .slice(0, 6)
      .map(o => {
        var t = o.trim(), prev = "";
        // 編號與分類標籤可能任一順序、半形全形都有，剝到不再變動為止
        while (t !== prev) { prev = t; t = t.replace(/^\s*[0-9０-９]+\s*[.．、,，)）:：]\s*/, "").replace(/^[\[【（(][^\]】）)]{1,6}[\]】）)]\s*/, "").trim(); }
        return t.slice(0, 60);
      })
      .filter(Boolean);
  }
  // 🛡️ ★指令／〈演出卡〉被原樣抄進敘事：solo(narrateWithState_) 早有這道濾網，鑑賞這條路徑漏掉了。
  //    先把真實換行轉成 <br> 再過濾——濾網掃到下一個「<」為止，沒有 <br> 的話會把整段吃光。
  if (typeof aiData.narration === 'string') {
    aiData.narration = stripLeakedScaffold_(aiData.narration.replace(/\n/g, "<br>"));
  }
  return aiData;
}

// 把鑑賞(後日談)avatar 連結到帳號——外部表存連結而非角色自稱，確保只有伺服器碼能寫。
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

// 帳號歸屬驗證：KPC_ ID 只用 Date.now()、理論上可預測，原本每個 kanshou handler 各自反查「帳號」表的 KPC 欄位確認呼叫者身分。
function kanshouPcIdx_(data, pcId) {
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.ID]) === String(pcId)) return i;
  }
  return -1;
}

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

// 🔤 三支日常化轉譯(look/personality/moe)的共用系統提示詞開場白，含那條三支都要的語言規則。
const KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_ = "你是《命運停駐之夜》的角色側寫顧問。★【語言】所有輸出內容一律使用繁體中文，不得夾雜英文或其他語言字母（JSON 欄位名本身除外）。";
// 🔧 共用呼叫殼子：try/callGeminiAPI/catch-fallback原值三者結構相同，只有「怎麼從API原始回傳值算出最終結果」跟「失敗時的保底值」不同——resultMapper 在 try 內把 raw 轉成最終回傳值(沿用原本各自的 JSON.parse/String(...).trim() 等寫法)，任何一步拋錯都跟原本一樣落到 fallbackValue。
function kanshouDailyTranslateCall_(prompt, sys, apiOpts, resultMapper, fallbackValue) {
  try {
    return resultMapper(callGeminiAPI(prompt, sys, apiOpts));
  } catch (e) { return fallbackValue; }
}

// 把戰時外貌(如「貼身黑色戰甲勁裝」)轉譯成現代日常穿搭/外型：本相不變、戰甲換成日常打扮；呼叫端(召喚/奪杯封存)僅一次性觸發，失敗時原樣退回戰時描述。
function translateLookToDaily_(name, cls, rawLook, firstP, speech, dailyMoeHint, sex) {
  var look = String(rawLook || "").trim();
  if (!look) return { look: "", outfit: "" };
  var figureHint = (sex === "女") ? "，若角色是成年女性、務必包含身形/胸部具體描寫，但要寫成自然的敘述句(如「胸前豐盈」「身形纖瘦」)、不要用「巨乳」這類生硬孤立的分類標籤直接呈現——這句話會顯示在玩家看得到的狀態欄位；「豐滿」單獨出現不夠明確，須明確扣連到胸部，不要只寫髮色瞳色就交差" : "";
  var sys = KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_ + "玩家提供一段用「、」或「・」分隔的角色戰時外貌描述" +
    "(前面數段是外貌本相與戰時攻防裝束，最後一段是整體氣質／神情)，以及這位角色的第一人稱自稱、說話語氣。" +
    "這是 Fate／聖杯戰爭的平行世界日常線，想像《衛宮家今天的餐桌風景》那種基調——換上現代日常穿搭，" +
    "但一看就知道是本人。請輸出兩樣東西：\n" +
    "①look：日常版「外貌」四短句、頓號分隔，每句精簡收束、【每句限" + TRAIT_SEG_HINT_ + "字內寫完整一句話，超過會被截斷】、避免堆疊多重子句，依序為[外貌本相(髮色/瞳色/五官/體態等，不含服裝)" + figureHint + "]、" +
    "[氣質舉止(依和平日常情境自然轉化，但性格底色不變，不可變成另一個人的氣質；【不可與下方口氣段用相同字眼重複描述】，例如兩段都寫「溫柔」「謙恭」)]、" +
    "[日常口氣(依原本說話語氣「" + (speech || "無特別描述") + "」寫成的日常說話口氣；自稱「" + (firstP || "我") + "」若不是尋常的「我」，就把它寫進這一句，是「我」則不必提)]、" +
    "[卸下心防的私密一面(這個角色只有放下戒備才會流露的一個具體、生活化、忠於其性格的小可愛面向，" +
    "【必須用看得到的具體小動作或情境呈現(show-don't-tell)，禁止直接說出內心想法/動機/情感獨白——如「心裡一直惦記著…」「其實很在意…」這類直述寫法一律不允許】，也不要只是把性格或喜好換句話說(那屬於性格欄)，" +
    "不可空泛或套用他人" + (dailyMoeHint ? "；這個角色的招牌萌點已經是「" + dailyMoeHint + "」，這一格【禁止】重複或換句話說同一件事，必須是完全不同的另一個生活切面(小動作/小習慣/情緒觸發點)" : "") + ")]。\n" +
    "②outfit：一句這位角色今天的日常穿搭，保留原本服裝的色系/風格精神、換成現代日常款式，盡量貼近原味，" +
    "不要跟look的內容重複。\n" +
    "★輸出合法 JSON、禁 Markdown：{\"look\":\"四短句頓號分隔\",\"outfit\":\"一句日常穿搭\"}";
  var prompt = "角色：" + name + "（" + cls + "）\n戰時外貌描述：" + look;
  return kanshouDailyTranslateCall_(prompt, sys, { temperature: 0.7, ignoreLaw: true }, function (raw) {
    var out = JSON.parse(raw || "{}");
    var rawOutLook = String(out.look || "").trim() || look;
    return { look: parseTraitsHelper(rawOutLook, look), outfit: String(out.outfit || "").trim() };
  }, { look: look, outfit: "" });
}

function translatePersonalityToDaily_(name, cls, rawWords, lookPrivateHint) {
  var words = String(rawWords || "").trim();
  if (!words) return words;
  var sys = KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_ + "玩家提供一位角色在聖杯戰爭(戰時)既有的性格短句" +
    "(用「、」分隔，依序對應[日常表象][真實內裡][喜歡的事物][討厭的事物]，段數可能不足4段——" +
    "這是正常的，種子資料本就只服務戰鬥)。這個角色現在要進入現代都市的和平日常生活，想像" +
    "《衛宮家今天的餐桌風景》那種基調——性格核心不變，只是活在和平日常裡，請你：\n" +
    "①若既有短句偏戰場語境(如「戰意」「殺意」「勝負」「殺戮」等)，轉譯成性格本質不變、但適合" +
    "日常場景展現的等價說法；純屬個性核心(不涉戰場)的短句原樣保留、不要亂改。\n" +
    "②段數不足4段時，依既有特質延伸出貼合、具體、適合日常場景的「喜歡的事物」與「討厭的事物」" +
    "補滿4句。\n" +
    "③每句精簡收束、【每句限" + TRAIT_SEG_HINT_ + "字內寫完整一句話，超過會被截斷】、避免堆疊多重子句。\n" +
    (lookPrivateHint ? "④這位角色的日常外貌欄已寫好一句「私密一面」：「" + lookPrivateHint + "」——你這4句性格【不要】跟它重複或換句話說同一件事，各自要是獨立的面向。\n" : "") +
    "★只輸出最終4句、用「、」分隔，不要輸出任何說明、標籤、引號、前後綴。";
  var prompt = "角色：" + name + "（" + cls + "）\n戰時性格短句：" + words;
  return kanshouDailyTranslateCall_(prompt, sys, { temperature: 0.75, ignoreLaw: true, plainText: true }, function (raw) {
    var out = String(raw || "").trim();
    return out || words;
  }, words);
}

// 戰時萌點常靠戰爭/創傷撐出沉重反差，直接照搬到沒發生過聖杯戰爭的平行世界會顯得莫名沉重——改寫成輕量、會心一笑的日常萌點。
function translateMoeToDaily_(name, cls, rawMoe) {
  var moe = String(rawMoe || "").trim();
  if (!moe) return moe;
  var sys = KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_ + "玩家提供一位角色在聖杯戰爭(戰時)既有的「萌點」" +
    "一句話——這種戰時萌點常常是靠沉重背景撐出來的(創傷/自卑/孤獨/悲劇宿命等)，形式不拘：可能是" +
    "反差(表面兇其實軟)，也可能只是單純討喜的外觀/行為/習慣特色。這個角色現在要" +
    "進入一個【平行世界的日常線】：這裡從來沒有發生過聖杯戰爭這回事(依然是同一位英靈，只是活在" +
    "一個沒有戰爭、不必背負詛咒創傷的和平世界)。想像《衛宮家今天的餐桌風景》那種基調，把這句戰時萌點" +
    "改寫成一句「日常向」的可愛萌點：\n" +
    "①保留角色的性格核心(如高冷/傲氣/寡言/暖心等本相不變)，只是換一個不需要靠悲劇/創傷/戰爭陰影" +
    "撐出來的呈現方式。\n" +
    "②必須是單看了會覺得溫馨、正面、會心一笑的小萌點(可以是反差、也可以是單純的外觀特色/生活習慣/" +
    "意外的手藝/小小的害羞反應等，不強求一定要寫成「表面X其實Y」的反差句型)，不要保留原句的沉重/悲傷/" +
    "自卑成分。\n" +
    "③限18字，務必寫完整一句話，不可斷在句意未完處。\n" +
    "★只輸出這一句話，不要輸出任何說明、標籤、引號、前後綴。";
  var prompt = "角色：" + name + "（" + cls + "）\n戰時萌點：" + moe;
  return kanshouDailyTranslateCall_(prompt, sys, { temperature: 0.75, ignoreLaw: true, plainText: true }, function (raw) {
    var out = String(raw || "").trim();
    return clampMoe_(out) || moe;
  }, moe);
}

function getDailyHeroFields_(heroRow, p) {
  var existingLook = String(heroRow[COL.HERO.DAILY_LOOK] || "").trim();
  var existingWords = String(heroRow[COL.HERO.DAILY_WORDS] || "").trim();
  var existingMoe = String(heroRow[COL.HERO.DAILY_MOE] || "").trim();
  var existingOutfit = String(heroRow[COL.HERO.DAILY_OUTFIT] || "").trim();
  var rawLook = String(p.look || "").replace(/・/g, "、");
  var rawWords = String(p.words || "").replace(/・/g, "、");
  var rawMoe = String(p.moe || "");
  return { look: existingLook || rawLook, words: existingWords || rawWords, moe: existingMoe || rawMoe, outfit: existingOutfit };
}

function dailySpeechByName_(name, preHeroes) {
  try {
    var heroes = preHeroes || getHeroCodexCached();
    // 🏷️ 候選橋比對：列可能是短名(SABER/櫻)、英靈殿是全名——精確比對會讓遺留列口吻靜默變空。
    var h = heroes.find(function (r) { return kanshouNameCandidates_(String(r[COL.HERO.NAME]).trim()).includes(String(name).trim()) || kanshouNameCandidates_(String(name).trim()).includes(String(r[COL.HERO.NAME]).trim()); });
    if (!h) return "";
    var parts = String(h[COL.HERO.DAILY_LOOK] || "").split('、').map(function (s) { return s.trim(); }).filter(Boolean);
    return parts.length >= 4 ? parts[2] : "";
  } catch (e) { return ""; }
}

// 直接從英靈庫召喚進後日談，不必先在 solo 打贏封存。不帶戰鬥資料(SIX/TAGS/MARTIAL 留空，慾海無戰鬥)。
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
  // 種子資料慣用「・」當片語內部連接號(如「影之國女王・武人」)，但 formatPref/formatTrait 是用「、」切成四格餵給AI——沒有「、」可切時整串會被塞進單一格、其餘三格變「無」，吃掉關鍵個性錨點。
  var daily = getDailyHeroFields_(heroRow, p);
  sRow[COL.PC.PREF] = parseTraitsHelper(daily.words, "沉著表象、堅定內裡、珍視之物、厭惡之事");
  var dailyLookParts = String(daily.look || "").split('、').map(function (s) { return s.trim(); }).filter(Boolean);
  // dailyLook 第3段是日常口吻(下面抽進【口吻】)，不進特徵格。
  var traitSrc = dailyLookParts.length >= 4 ? [dailyLookParts[0], dailyLookParts[1], dailyLookParts[3]].join('、') : looksToTraitParts_(daily.look);
  sRow[COL.PC.TRAIT] = parseTraitsHelper(traitSrc, "外貌出眾、舉止從容、卸下心防時的柔軟一面", TRAIT_SLOTS_);
  sRow[COL.PC.INTENT] = daily.moe || "";
  // 戰時 p.back 跟平行世界矛盾，優先讀 p.dailyBack。
  sRow[COL.PC.BACK] = p.dailyBack ? String(p.dailyBack).slice(0, 28)
    : p.back ? String(p.back).slice(0, 28)
    : "生活在這座城鎮裡的普通身影，與你尚無深交";
  // 直接召喚無快照可帶，用該英靈自己的日常衣裝(daily.outfit)墊底，沒有才退回「日常便服」。
  var dailySpeechPart = dailyLookParts.length >= 4 ? dailyLookParts[2] : "";
  sRow[COL.PC.MEMORY] = setOutfit_(stampPersonaFlavor_("【鑑賞後日談·初見】在這座城裡剛結識的緣分，才剛開始。", dailySpeechPart, ""), daily.outfit || "日常便服");
  // PHYSICAL 留空，跟御主本人(actionEnterKanshou)一致，直到第一次 intimacy_feedback 才寫入；
  sRow[COL.PC.GAME_ID] = gameId;
  // REL_TAG(關係標籤)只是這裡設的起始值，之後全程只能透過actionUpdateRelTag(玩家UI手動操作)更改——AI對這欄位完全沒有寫入權限，不會被AI敘事悄悄帶偏。
  sRow[COL.PC.BOND] = 0;
  sRow[COL.PC.REL_TAG] = "點頭之交";
  sRow[COL.PC.REL_MEM] = "初次相遇，緣分才剛開始";
  // 🏠 2026-07 七度改版：查無專屬豪邸(KANSHOU_HERO_HOME_)就隨機分配一間泛用住處(KANSHOU_GENERIC_HOME_POOL_)，讓她也有家可拜訪/可被夜襲——一次分配、寫進【住處】記憶標記，之後由kanshouGetHeroHome_ 統一讀取，永久持有(不重骰、不會搬家)。
  if (!KANSHOU_HERO_HOME_[String(heroRow[COL.HERO.ID])] && KANSHOU_GENERIC_HOME_POOL_.length) {
    var _homePick = KANSHOU_GENERIC_HOME_POOL_[Math.floor(Math.random() * KANSHOU_GENERIC_HOME_POOL_.length)];
    sRow[COL.PC.MEMORY] = setKanshouHeroHome_(sRow[COL.PC.MEMORY], _homePick.name);
  }
  return sRow;
}

// 關係標籤依好感自動走5階梯度，GAS算、不讓AI插手(AI對REL_TAG本就沒有寫入權限)。
const KANSHOU_REL_TIER_ = [
  { min: 80, label: '戀人', ceiling: '無上限，依情境與個性到底。' },
  { min: 60, label: '親近的人', ceiling: '親吻擁抱依偎可以，脫衣/性事止住。' },
  { min: 40, label: '熟識的朋友', ceiling: '牽手/靠肩/摸頭可以，親吻以上會退開。' },
  { min: 20, label: '普通朋友', ceiling: '可以親近，情慾一律婉拒。' },
  { min: -100, label: '點頭之交', ceiling: '形同陌生人，動手動腳【連碰都碰不到】。' }
];
// 親密尺度：只送在場者實際落在的那幾階。全表五行對小模型是四行雜訊——她們的好感 GAS 本來就知道。
function kanshouIntimacyLines_(bonds) {
  if (!bonds || !bonds.length) return "";   // 沒人在場，這塊規則本回合無事可管
  var hit = {};
  (bonds || []).forEach(function (b) {
    for (var i = 0; i < KANSHOU_REL_TIER_.length; i++) {
      if ((parseInt(b) || 0) >= KANSHOU_REL_TIER_[i].min) { hit[i] = true; return; }
    }
  });
  var idx = Object.keys(hit).map(Number).sort(function (a, b) { return b - a; });
  return idx.map(function (i) {
    var t = KANSHOU_REL_TIER_[i];
    var range = i === 0 ? (t.min + '+') : (i === KANSHOU_REL_TIER_.length - 1 ? ('<' + KANSHOU_REL_TIER_[i - 1].min) : (t.min + '~' + (KANSHOU_REL_TIER_[i - 1].min - 1)));
    return '・' + range + '(' + t.label + ')：' + t.ceiling;
  }).join('\n');
}
// 依當前BOND重算這一列的REL_TAG——但只在「目前這格文字仍等於某個梯度的字面」時才覆寫：玩家一旦透過actionUpdateRelTag手動改成清單外的自訂稱呼，這格文字就再也不匹配任何梯度，之後好感繼續變動也不會被自動蓋回去，尊重玩家的手動選擇。
function kanshouBondFloorOf_(bond) {
  var ths = KANSHOU_REL_TIER_.map(function (t) { return t.min; })
    .concat([KANSHOU_COHABIT_BOND_])
    .filter(function (m) { return m > 0; })
    .sort(function (a, b) { return a - b; });
  var f = 0;
  for (var i = 0; i < ths.length; i++) if (bond >= ths[i]) f = ths[i];
  return f;
}
function kanshouSyncRelTier_(pcData, idx) {
  let bond = parseInt(pcData[idx][COL.PC.BOND]) || 0;
  // 💗 告白牆(2026-07 玩家「沒有一個交往的確定過程·人人都可以自然變成戀人」)：還沒告白成立的人，好感一律夾在【戀人門檻-1】。
  const _loverCap = KANSHOU_REL_TIER_[0].min - 1;
  if (!kanshouIsLover_(pcData[idx])
    && (kanshouIsCohabit_(pcData[idx])
      || String(pcData[idx][COL.PC.REL_TAG] || "") === KANSHOU_REL_TIER_[0].label
      || KANSHOU_BOND_FLOOR_TAG_.get(pcData[idx][COL.PC.MEMORY]) >= KANSHOU_REL_TIER_[0].min)) {
    pcData[idx][COL.PC.MEMORY] = KANSHOU_LOVER_TAG_.set(pcData[idx][COL.PC.MEMORY], 1);
  }
  if (bond > _loverCap && !kanshouIsLover_(pcData[idx])) { bond = _loverCap; pcData[idx][COL.PC.BOND] = bond; }
  const _reachedWas = KANSHOU_BOND_FLOOR_TAG_.get(pcData[idx][COL.PC.MEMORY]);
  // 🏠 已同居⇒地板至少是同居門檻。
  const _reachedNow = Math.max(_reachedWas, kanshouBondFloorOf_(bond),
    kanshouIsCohabit_(pcData[idx]) ? KANSHOU_COHABIT_BOND_ : 0);
  if (_reachedNow !== _reachedWas) pcData[idx][COL.PC.MEMORY] = KANSHOU_BOND_FLOOR_TAG_.set(pcData[idx][COL.PC.MEMORY], _reachedNow);
  if (bond < _reachedNow) { bond = _reachedNow; pcData[idx][COL.PC.BOND] = bond; }
  const curTag = String(pcData[idx][COL.PC.REL_TAG] || "");
  if (KANSHOU_REL_TIER_.some(t => t.label === curTag)) {
    const tier = KANSHOU_REL_TIER_.find(t => bond >= t.min);
    if (tier && tier.label !== curTag) pcData[idx][COL.PC.REL_TAG] = tier.label;
  }
  if (kanshouIsCohabit_(pcData[idx]) && bond < KANSHOU_COHABIT_BOND_) {
    pcData[idx][COL.PC.MEMORY] = KANSHOU_COHABIT_TAG_.set(pcData[idx][COL.PC.MEMORY], 0);
    pcData[idx][COL.PC.MEMORY] = KANSHOU_COHABIT_END_TAG_.set(pcData[idx][COL.PC.MEMORY], 1);
  }
}
// 🔒 2026-07 五度改版·自訂關係稱呼／專屬稱呼門檻(玩家實測：低好感就塞露骨自訂稱呼，這段文字會被字面「TA是你的${tag}」原樣塞進提示詞當既定事實，AI因此無視好感天花板照樣演到底)——玩家指定門檻＝80(戀人)，跟親密尺度五階的「80+無上限」同一個切點，這樣一旦解鎖，尺度本來就已經全開，不會再有「好感沒到、卻被自訂文字撐開尺度」的倒掛狀況。
const KANSHOU_CUSTOM_TAG_BOND_ = 80;

// ══ 💗 告白＝關係階的質變事件（2026-07 玩家「好感太絲滑、沒有一個交往的確定過程、人人都可以自然變成戀人」）═══════════════════════════════════════════════════════════════舊做法：好感爬到 80 就自動長出「戀人」這個標籤，沒有任何一刻是「你們決定在一起」。
const KANSHOU_CONFESS_BOND_ = 60;      // 開得了口的最低好感(＝親近的人)；未達不給按鈕、後端也直接擋
const KANSHOU_CONFESS_COOLDOWN_ = 3;   // 被拒之後幾天內說不出第二次(否則變成每回合連按到過為止)
// 熟悉度對告白成功率的加權：好感是主軸，相處次數是門票——才見過幾次面就告白，那是一時衝動。
const KANSHOU_CONFESS_FAMILIAR_MULT_ = { '初識': 0.35, '混熟': 1, '老交情': 1.2 };
// 好感每高 1 點加多少成功率(自 KANSHOU_CONFESS_BOND_ 起算)：60→0 / 70→.28 / 79→.53(混熟)。
const KANSHOU_CONFESS_SLOPE_ = 0.028;

// ══ 🤝 相處基調（2026-07 玩家「好感太絲滑、想保留很熟但不親密的感覺」）══════════════好感只有一條軸的時候，「她多喜歡你」跟「你們多熟」被迫共用同一個數字，於是好感59×相處20次 跟 好感59×相處300次 演出來一模一樣——前者該是新鮮期的試探與心動，後者該是自在到不必說完整句子、卻也就停在這裡了。
var KANSHOU_MET_COUNT_TAG_ = makeIntTag_('相處', 0);
const KANSHOU_FAMILIAR_TIERS_ = [{ min: 150, key: '老交情' }, { min: 30, key: '混熟' }, { min: 0, key: '初識' }];
// 好感四段（跟 KANSHOU_REL_TIER_ 的五階分開：那個是「稱謂」，這個是「該用什麼調子演」）。
const KANSHOU_RAPPORT_BOND_TIERS_ = [{ min: 80, key: '很喜歡' }, { min: 50, key: '在意' }, { min: 20, key: '朋友' }, { min: 0, key: '陌生' }];
// 🎭 2D 基調表：[好感段][熟悉段] → **一句既定事實**，短到不能再短。
const KANSHOU_RAPPORT_TONE_ = {
  '陌生': {
    '初識': '事實：你對這個人而言是陌生人，對方不談自己、不接受身體接觸。',
    '混熟': '事實：對方認得你，僅止於認得——家人／過去／感情這些不對你講。',
    '老交情': '事實：很熟，但對你【沒有戀愛的意思】：曖昧、牽手、告白一律被擋回來，對方也不覺得可惜。'
  },
  '朋友': {
    '老交情': '事實：老朋友，沒有心動的成分——曖昧的話會被當成玩笑接下去。'
  },
  '在意': {
    '初識': '事實：對方喜歡你，但你們認識還太短，不會承認。',
    '老交情': '事實：對方喜歡你，卻說不出口——你若直接問，會被否認。'
  },
  '很喜歡': {
    '初識': '事實：喜歡跑在相處前面，連本人都還沒跟上。',
    '老交情': '事實：不藏了，明著在等你先開口；但絕不會自己先告白。'
  },
  '交往中': {
    '初識': '事實：已經在交往，但認識還沒多久。',
    '混熟': '事實：交往中——親暱不必再問過誰。',
    '老交情': '事實：交往很久了，親暱自然到不必確認。'
  }
};
// 依好感＋相處次數查表，回傳那一格的基調句（查無＝留白，不輸出這個欄位）。
function kanshouRapportTone_(bond, metCount, isLover) {
  var b = isLover ? '交往中'
    : (KANSHOU_RAPPORT_BOND_TIERS_.find(function (t) { return (parseInt(bond) || 0) >= t.min; }) || {}).key;
  var f = (KANSHOU_FAMILIAR_TIERS_.find(function (t) { return (parseInt(metCount) || 0) >= t.min; }) || {}).key;
  return (KANSHOU_RAPPORT_TONE_[b] || {})[f] || "";
}
// 💬 專屬稱呼(REL_MEM【專屬稱呼】)唯讀取值——關係面板要預填輸入框、companions清單要秀給玩家看，兩處各自寫一次同款 regex 太重複，抽成共用小 helper(鏡射 actionPlay_ 內部的 relMemMemoryStr_，但那支是組提示詞用的完整格式化字串，這支只回傳裸值供 UI 使用)。
function getNickname_(relMem) {
  const m = String(relMem || "").match(/\[專屬稱呼\](.*?)(?=\| \[|$)/);
  const raw = m ? m[1].trim() : "";
  return (raw && raw !== "無") ? raw : "";
}
// 💬 專屬稱呼寫入前的唯一消毒口。
function sanitizeNickname_(s) {
  return String(s || "").trim().replace(/[|｜\[\]]/g, "").slice(0, 20);
}
// 純聊天(AI rel_changes)加好感只能推到「目前所在梯度的上限」就卡住，要靠約定赴約(+5·kanshouPromiseMetStr)或與她獨處於私密場合(+KANSHOU_SCENE_BOND_·見 kanshouAloneBondStr)這類真實相處才能突破到下一梯度。
const KANSHOU_SCENE_BOND_ = 3; // 接受親密橋段(夜襲/共浴/膝枕…非拒絕分支)給的好感，直接寫、不吃聊天上限。

// 🫶 玩家主動提議(相約/牽手/同去)她答不答應——【GAS 依好感擲，AI 只演反應】(2026-07 由 AI 判定改為 GAS 判定)。
function kanshouProposalAccepts_(type, bond) {
  bond = parseInt(bond) || 0;
  var base, slope;
  if (type === 'move') { base = 0.55; slope = 0.006; }         // 一起去某地·門檻最低(0→.55 / 40→.79 / 80→.97)
  else if (type === 'promise') { base = 0.30; slope = 0.007; } // 相約明天·中等(0→.30 / 40→.58 / 80→.86)
  else { base = 0.10; slope = 0.010; }                          // 牽手·最私密最看好感(0→.10 / 40→.50 / 80→.90)
  return Math.random() < Math.max(0.03, Math.min(0.97, base + bond * slope));
}
// 純聊天封頂只從「熟識(40)」這道門檻起算——第一階「點頭之交→普通朋友」本就該靠日常閒聊自然發生(陌生變朋友天經地義)，不該逼玩家在還沒熟時就得約會/夜襲(2026-07 玩家實測卡在19爬不出、矜持角色約定又被婉拒的死結)。
function kanshouRelChatCeiling_(bond) {
  const thresholds = KANSHOU_REL_TIER_.map(t => t.min).concat([KANSHOU_COHABIT_BOND_])
    .filter(m => m >= 40).sort((a, b) => a - b);
  for (const t of thresholds) { if (bond < t) return t - 1; }
  return 100;
}

// 🧠 摘要往回看幾輪、每則保留幾個字。
const KANSHOU_DIGEST_ROUNDS_ = 8;
const KANSHOU_DIGEST_CAP_ = 22;

// 把掉出 chatHistory 窗口的較早回合壓成一行「玩家做過什麼」的事實摘要。
function kanshouRecentDigest_(pcId, windowRows) {
  try {
    const deep = getGameHistoryBatchRaw(pcId, windowRows + KANSHOU_DIGEST_ROUNDS_ * 2);
    if (!deep || deep.length <= windowRows) return "";
    const older = deep.slice(0, deep.length - windowRows);
    const lines = older
      .filter(m => m.speaker === "player")
      .map(m => String(m.content || "").replace(/^【玩家意圖】：/, "").replace(/\s+/g, " ").trim()
        // 剝掉句首的「我」與句尾標點：這些是玩家自己打的字，留著「我」會跟第二人稱旁白打架，
        // 還得多花一句話解釋它是誰。剝成純動作就沒這回事了。
        .replace(/^我[們]?[，,、]?/, "").replace(/[。．.!！?？~～、，,\s]+$/, "").slice(0, KANSHOU_DIGEST_CAP_))
      .filter(Boolean);
    return lines.length ? lines.join("→") : "";
  } catch (e) { return ""; }
}

// 直接從英靈庫召喚一位英靈、讓她「存在」於這個後日談世界(不需先在 solo 封存)。
function actionKanshouSummonHero(userData, pcId, sheets) {
  var kpc = sheets.pc;
  var acctName = String(userData.acctName || "").trim();
  var heroId = String(userData.heroId || "").trim();
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var me = data[meIdx];
  var gid = String(me[COL.PC.GAME_ID] || ""); var loc = String(me[COL.PC.LOC] || "冬木·深山町");
  var heroes = getHeroCodexCached();
  var hero = heroes.find(function (r) { return String(r[COL.HERO.ID]) === heroId; });
  if (!hero) return JSON.stringify({ success: false, message: "英靈庫查無此英靈。" });
  // 衛宮士郎-Master：玩家本人就是這個位置，不開放召喚。
  if (heroId === '衛宮士郎-Master') return JSON.stringify({ success: false, message: "無法召喚——這個位置由你自己擔任。" });
  if (KANSHOU_SUMMON_BLOCKED_IDS_.indexOf(heroId) !== -1) return JSON.stringify({ success: false, message: "這位英靈暫時不開放召喚。" });
  var heroName = KANSHOU_CASUAL_NAME_[heroId] || String(hero[COL.HERO.NAME] || "從者"); // 🏷️ 鑑賞訊息/查重用日常稱呼
  // 男性可被召喚，但不會被actionEnterKanshou自動預先鋪墊進世界(見該函式SEX!=='男'過濾)，只能靠玩家在這裡主動召喚。
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
  if (existingIdx >= 0) return JSON.stringify({ success: false, message: "「" + heroName + "」已經存在於這個世界了，去找找人在哪裡吧。" });
  kpc.appendRow(heroToKanshouRow_(hero, gid, loc, parseInt(me[COL.PC.DAY]) || 1));
  return JSON.stringify({ success: true, added: heroName, message: "「" + heroName + "」來到了你們身邊。" });
}

// 進入慾海·後日談：每個帳號只有【一個】常駐後日談世界，點「進入鑑賞」直接回到這個世界。
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
        quickPhrases: kanshouGetQuickPhrases_(data[r][COL.PC.MEMORY])
      });
    }
    // 連結指向的列不存在(手動整理試算表等邊角情況)→ 當作沒有存檔，往下走新建流程。
  } else {
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
        quickPhrases: kanshouGetQuickPhrases_(data[m][COL.PC.MEMORY])
      });
    }
  }

  // 3️⃣ 沒有常駐御主 → 要新建。
  var mSex = String(userData.pcSex || "").trim();
  var mName = String(userData.pcName || "").trim().slice(0, 16);
  if ((mSex !== "男" && mSex !== "女") || !mName) {
    return JSON.stringify({ success: true, needSetup: true, defaultName: acctName });
  }
  var gameId = "k_" + Date.now();
  // 開場落在自己的房間，不用泛泛的「冬木·深山町」城區——那個值容易被AI演成「剛下車、還在路上」
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
  // 借用solo既有的COL.PC.DAY/HOUR欄位存鑑賞自己的時鐘。
  mRow[COL.PC.DAY] = 1;
  mRow[COL.PC.HOUR] = 6;
  // 【帳號】標記保留供人工檢視試算表時辨識(非驗證用途，真正的歸屬判斷已走帳號表 KPC 欄位)。
  mRow[COL.PC.MEMORY] = setOutfit_("【帳號】" + acctName + "｜【鑑賞後日談】這裡是平行世界的和平日常，與英靈相伴度過尋常時光。", "日常便服");
  mRow[COL.PC.GAME_ID] = gameId;
  // 比照 solo 創角(actionManualNpc)：先用玩家填的種子片段(或預設)秒寫非阻塞，AI 潤色由actionBackfillKanshouAi 於進場後背景補上(見下)。
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

  // 開場只入駐4位起始住民(2026-07玩家定案：大河/凜/櫻/SABER——「本來就住在這座城」感最強的幾位)，其餘女角不建列、不存在於世界，之後靠「出門走走」巧遇→玩家點「結識」才正式入駐(見kanshouEncounterStr/inviteResident)。
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

function actionBackfillKanshouAi(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = kanshouPcIdx_(pcData, pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const row = pcData[pIdx];
  const finalName = String(row[COL.PC.NAME] || ""), finalSex = String(row[COL.PC.SEX] || "異");
  const appearance = String(userData.appearance || "").slice(0, 60), standing = String(userData.standing || "").slice(0, 60);
  const persona = String(userData.persona || "").slice(0, 60);

  const promptStr = `【主角】：名字『${finalName}』，性別『${finalSex}』\n【外貌】：${appearance || "隨機"}\n【身世】：${standing || "隨機"}\n【個性方向】：${persona || "隨機"}`;

  const KANSHOU_MASTER_GEN_SYS = `你是《命運停駐之夜》後日談(鑑賞)的角色生成核心，為玩家建立一位生活在平行世界(這裡從來沒有發生過聖杯戰爭這回事)、與身邊夥伴共度和平日常的主角本人形象。請依玩家提供的姓名、性別、外貌、身世、個性方向，生成合理且溫暖自然的設定。

★【語言】除 JSON 欄位名本身外，所有輸出內容一律使用繁體中文，不得夾雜英文或其他語言字母；玩家描述若含英文人名/詞彙，請意譯或音譯成中文寫入。
★【萌點怎麼寫】萌點/設定是【給你內化的素材】，禁複述字面：情境對了才讓它自然浮現一次·不必每回合硬塞·連續回合勿重複同一個具體動作(牽涉隨身物品時尤忌每次都靠「摸/看一眼」交差)。
★【格式鐵律】traits 【恰好3段】、personality 【恰好4段】，只用頓號「、」分隔，【絕對不要用句號「。」或半形句點】，每段是一個【簡短詞組】(不是完整句子)，每段內部也【不要】再用頓號列舉多項；禁數字標籤。
- traits：外貌、氣質舉止、卸下心防的私密一面。${finalSex === '女' ? BUST_NOTE_ : ''}格式範例(只示範斷句，內容一律依玩家給的性別與描述重寫)：「(外貌)、(氣質舉止)、(獨處時的小動作)」
- personality：日常表象、真實內裡、喜歡的事物、討厭的事物。格式範例(只示範斷句)：「(表象)、(內裡)、(喜歡的)、(討厭的)」
★npc_intent：一句讓人喜歡上這個人的萌點，**18 字內講完一句完整的話**。可以是反差、也可以只是討喜的外觀或小習慣(雙馬尾、大食、路痴之類)。★語氣溫馨正面、看了會心一笑，【禁】靠創傷/自卑/孤獨/悲劇宿命撐——這裡是輕鬆的日常後日談。【禁】拿聖杯戰爭專有詞(令咒/寶具/魔術迴路/從者/職階)湊萌點：這個平行世界從沒發生過那場戰爭，那些詞在這裡沒有來由。
★background：限20字，呼應其身世，不出現具體物品名，語氣平和溫馨，不涉及聖杯戰爭或任何戰爭史。
★outfit：一句她/他今天的日常穿搭(限20字)，依外貌與個性方向自然搭配(如文靜者素雅、活潑者亮色休閒)，純日常便服/居家/外出風格，不含任何戰甲/武裝/戰鬥裝束字眼。
★【勿輸出數值】戰力數值一律不需要，也不要輸出地點。

★【輸出】合法 JSON、禁 Markdown：
{"background":"限20字","traits":"三格頓號字串","personality":"四格頓號字串","npc_intent":"結合此人身分的獨特可愛萌點(不限反差)，一句話","outfit":"一句日常穿搭"}`;

  try {
    const aiBrief = JSON.parse(callGeminiAPI(promptStr, KANSHOU_MASTER_GEN_SYS, { temperature: 0.6, ignoreLaw: true }));
    // 🔒 競態修(比照 actionBackfillMasterAi)：backfill 豁免寫入鎖，pIdx 是 AI 呼叫【前】的列索引——寫回前重定位。
    const wIdx = buildLiveIdIndex_(sheets.pc)[String(pcId)];
    if (wIdx === undefined) return JSON.stringify({ success: false, message: "御主列已不存在（可能剛被清理）。" });
    if (aiBrief.background) sheets.pc.getRange(wIdx + 1, COL.PC.BACK + 1).setValue(String(aiBrief.background).slice(0, 40));
    if (aiBrief.traits) sheets.pc.getRange(wIdx + 1, COL.PC.TRAIT + 1).setValue(parseTraitsHelper(aiBrief.traits, traitParts_(row[COL.PC.TRAIT]).join('、'), TRAIT_SLOTS_));
    if (aiBrief.personality) sheets.pc.getRange(wIdx + 1, COL.PC.PREF + 1).setValue(parseTraitsHelper(aiBrief.personality, row[COL.PC.PREF]));
    if (aiBrief.npc_intent) sheets.pc.getRange(wIdx + 1, COL.PC.INTENT + 1).setValue(clampMoe_(aiBrief.npc_intent));
    // AI 生成的衣裝比照英靈那邊(daily.outfit)補上，生成失敗/沒給值時種子預設「日常便服」繼續當保底。
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
function actionKanshouCompanions(userData, pcId, sheets) {
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var me = data[meIdx];
  var gid = String(me[COL.PC.GAME_ID] || "");
  var myLoc = String(me[COL.PC.LOC] || "");
  var myName = String(me[COL.PC.NAME] || "");
  var current = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") === gid && String(data[i][COL.PC.FACTION]) === "從者" && !String(data[i][COL.PC.ID]).startsWith("DEAD_")) {
      var loc = String(data[i][COL.PC.LOC] || "");
      // 面板需要顯示目前所在地點(玩家要精準知道去哪找她)、關係標籤＋好感(供玩家決定要不要改標籤)；isHere(是否跟玩家同地點)；locLabel：房間類地點的動態顯示名稱，見kanshouRoomDisplayName_。
      var _pm = kanshouGetPromise_(data[i][COL.PC.MEMORY]);
      var _pmDate = _pm ? kanshouAbsDayToDate_(_pm.day) : null;
      // memoir：共同回憶(27欄)原樣下傳(★前綴=玩家釘選)，供面板顯示/釘選/刪除。
      var _pmTime = _pm ? (KANSHOU_APPT_BANDS_.find(function (b) { return b.band === _pm.band; }) || {}).label : "";
      // 🆔 2026-07「整體重構·id優先」：補id讓前端能存起來隨後續action(牽手/邀同居/相約/結識等)回傳，後端才有id可用、不必只靠名字(kanshouNameCandidates_別名表已處理大部分情況，但id才是真正杜絕撞名/前綴混淆的單一真實來源)。
      current.push({ id: String(data[i][COL.PC.ID]), name: String(data[i][COL.PC.NAME]), tag: String(data[i][COL.PC.REL_TAG] || "點頭之交"), nickname: getNickname_(data[i][COL.PC.REL_MEM]), bond: parseInt(data[i][COL.PC.BOND]) || 0, loc: loc, locLabel: kanshouRoomDisplayName_(loc, data, gid, myName, meIdx), isHere: loc === myLoc, promise: _pm ? { loc: _pm.loc, date: _pmDate.month + '/' + _pmDate.day, time: _pmTime || '' } : null, memoir: String(data[i][COL.PC.MEMOIR] || "").split('｜').map(function (s) { return s.trim(); }).filter(Boolean) });
    }
  }
  return JSON.stringify({ success: true, current: current, quickPhrases: kanshouGetQuickPhrases_(me[COL.PC.MEMORY]) });
}

// 🎀 快速輸入貼圖·玩家自訂(2026-07「表情包文字也想自訂」，同月再縮減內建數量)：4個內建貼圖(害羞/小聲/苦笑/臉紅)寫死在Script_Kanshou.html(KC_QUICK_PHRASES_BUILTIN_)純前端顯示，這裡只管玩家自己額外新增的——存玩家列MEMORY【快速貼圖】text1,text2,...，逗號分隔比照【自訂道具】同款寫法。
const KANSHOU_QUICK_PHRASE_CAP_ = 8;
function kanshouGetQuickPhrases_(memory) {
  const m = String(memory || "").match(/【快速貼圖】([^｜【】]*)/);
  if (!m || !m[1]) return [];
  return m[1].split(',').filter(Boolean);
}
function kanshouSetQuickPhrases_(memory, arr) {
  const cleared = String(memory || "").replace(/｜?【快速貼圖】[^｜【】]*/g, "").replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  if (!arr || !arr.length) return cleared;
  return (cleared ? cleared + "｜" : "") + "【快速貼圖】" + arr.join(',');
}
function actionKanshouAddQuickPhrase(userData, pcId, sheets) {
  var kpc = sheets.pc;
  var text = kanshouSanitizeTagValue_(userData.text, 12);
  if (!text) return JSON.stringify({ success: false, message: "請輸入貼圖文字。" });
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var phrases = kanshouGetQuickPhrases_(data[meIdx][COL.PC.MEMORY]);
  if (phrases.indexOf(text) !== -1) return JSON.stringify({ success: false, message: "這句已經在你的快速貼圖裡了。" });
  if (phrases.length >= KANSHOU_QUICK_PHRASE_CAP_) return JSON.stringify({ success: false, message: "自訂貼圖已達上限(" + KANSHOU_QUICK_PHRASE_CAP_ + "句)，先刪掉一些吧。" });
  phrases.push(text);
  var newMemory = kanshouSetQuickPhrases_(data[meIdx][COL.PC.MEMORY], phrases);
  kpc.getRange(meIdx + 1, COL.PC.MEMORY + 1).setValue(newMemory);
  return JSON.stringify({ success: true, quickPhrases: phrases });
}
function actionKanshouDeleteQuickPhrase(userData, pcId, sheets) {
  var kpc = sheets.pc;
  var text = String(userData.text || "").trim();
  if (!text) return JSON.stringify({ success: false, message: "參數不完整。" });
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var phrases = kanshouGetQuickPhrases_(data[meIdx][COL.PC.MEMORY]).filter(function (t) { return t !== text; });
  var newMemory = kanshouSetQuickPhrases_(data[meIdx][COL.PC.MEMORY], phrases);
  kpc.getRange(meIdx + 1, COL.PC.MEMORY + 1).setValue(newMemory);
  return JSON.stringify({ success: true, quickPhrases: phrases });
}

// 💞 共同回憶面板操作(釘選/取消釘選/刪除)——比照 update_rel_tag「玩家 UI 手動管理、AI 無權」精神。
function actionKanshouMemoirOp(userData, pcId, sheets) {
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」
  var op = String(userData.op || "").trim();
  var item = String(userData.item || "").replace(/[｜【】\[\]★]/g, "").trim();
  var targetName = String(userData.targetName || "").trim();
  if (!item || !targetName || ['pin', 'unpin', 'del'].indexOf(op) === -1) return JSON.stringify({ success: false, message: "參數不完整。" });
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  var tIdx = findPcRowIdx_(data, gid, { name: targetName, faction: "從者", nameCandidates: kanshouNameCandidates_ });
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

// ⚧ 切換後日談御主 avatar 的性別（隨時可改；只動 SEX 欄，不影響從者/歷史）。
function actionKanshouSetSex(userData, pcId, sheets) {
  var newSex = String(userData.pcSex || "").trim();
  if (newSex !== "男" && newSex !== "女") return JSON.stringify({ success: false, message: "性別僅限 男／女。" });
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
  var data = kpc.getDataRange().getValues();
  var i = kanshouPcIdx_(data, pcId);
  if (i < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  if (newSex === "男") {
    var gid = String(data[i][COL.PC.GAME_ID] || "");
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
function actionKanshouSetName(userData, pcId, sheets) {
  var newName = String(userData.pcName || "").trim();
  if (!newName) return JSON.stringify({ success: false, message: "名字不能空白。" });
  if (newName.length > 16) return JSON.stringify({ success: false, message: "名字請在16字以內。" });
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  kpc.getRange(meIdx + 1, COL.PC.NAME + 1).setValue(newName);
  return JSON.stringify({ success: true, pcName: newName, message: "御主已改名為「" + newName + "」。" });
}

function actionKanshouSetHomeName(userData, pcId, sheets) {
  var newName = String(userData.homeName || "").trim();
  if (!newName) return JSON.stringify({ success: false, message: "名稱不能空白。" });
  if (newName.length > 12) return JSON.stringify({ success: false, message: "名稱請在12字以內。" });
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var newMemory = setKanshouHomeName_(data[meIdx][COL.PC.MEMORY], newName);
  kpc.getRange(meIdx + 1, COL.PC.MEMORY + 1).setValue(newMemory);
  return JSON.stringify({ success: true, homeName: newName, message: "住所已改名為「" + newName + "」。" });
}


// ==========================================
// 🔴【鑑賞 AI 核心】buildDefaultSystemPrompt／actionPlaysolo 是按鍵+AI說故事，鑑賞是依角色資料自然演出(只有🔥點不點火這一個變因)——兩者共用callGeminiAPI(留在 Engine_Combat.gs)這個基礎設施，但系統提示詞組裝／敘事引擎各自獨立，跟本檔其餘鑑賞 action(召喚/進場/AI深化)集中一處，好查找。
// ==========================================

// 🔠 對話與敘事格式·全遊戲【單一真實來源】：solo 的 miniSystem(Router_Narrative.gs) 與鑑賞的nsfwBaseVars(本檔 nsfwBaseRules 第3條) 都呼叫這一支，杜絕兩處各改一半又不一致(工程準則·單一真實來源)。
function dialogueFormatRule_() {
  return `對話格式(輕小說筆觸)：
①口/喉聲音(話語+喘息/輕吟/悶哼/笑聲/吸吮/舔啜/咀嚼/吞嚥)都寫進單層「」(例：「唔……啾，好甜」)，禁（輕哼）括號描述、禁轉旁白。
②每句台詞前冠說話者名(例：櫻「風音學姐……」)，跨回合不認錯人，喘息混台詞算同一人名下。★玩家台詞免冠名、直接「……」，且照原句寫，禁改寫成轉述句。
③肢體動作/非口部聲響(啪啪/環境音/兵刃聲)一律走敘事，絕不放進「」內。
④只用單層「」禁巢狀『』；背景描述精簡，篇幅留給互動。`;
}

// 只被鑑賞(慾海)呼叫——solo走完全獨立的 miniSystem。
function buildDefaultSystemPrompt(includeMasterNote, includeOptions) {
  const _physicalState = "此刻臉上看得到的神色·眼神/臉色/表情(第三人稱·≤15字)·不寫動作劇情·沒變就留空";
  const _masterNote = {
    "經歷": "(不顯示)承接舊經歷·只增補本回合有意義的新事·滾動摘要≤50字·沒新事就回舊值"
  };

  // appearance_extras(原 outfit_change)：角色當下實際穿著與配飾，AI 依劇情如實更新，寫回持久的【換裝】記錄。2026-09 小道具機制移除後，配飾類事實回歸由這一欄承接。
  const _appearanceExtras = "穿著與配飾(第三人稱·≤20字·名詞短語如「浴巾」「貓耳髮箍」「全裸」)·禁動作句與場景姿勢·沒換就留空";

  const _physicalStateRef = "同上";
  const _appearanceExtrasRef = "同上";

  const finalJson = {
    // 強制思維鏈：放範本第一位讓模型先自省再寫敘事。
    "inner_monologue": "【不顯示·約50字】第三人稱總結【被搭話的那個人】此刻的真實狀態([性格]vs[情緒身體])·承接歷史·只算【在場人物】名單上的人",
    "narration": "劇情(第二人稱「你」＝玩家·字數照下方【篇幅】·不可少於下限)",
    // 🗺️ 2026-07 移動改「同意泡泡」制(見§134)；2026-07再修（玩家實測「AI一直提議移動、頭痛」）：move_proposal 欄位整個砍掉，AI 不再有任何管道自己決定要不要換場景/換去哪。
    "npc_exit": "本回合告辭離場者的真名陣列·narration須演出那個人離開·否則[]",
    "options": ["1. [主動]…（固定4條·各≤20字·就本回合 narration 出題·只出在場者此刻真做得到的動作·不含換地點）", "2. [被動]…", "3. [接續]…", "4. [反差]…"],
    "intimacy_feedback": {
      "player": {
        "physical_state": _physicalState,
        "appearance_extras": _appearanceExtras
      },
      "npcs": [{
        "name": "NPC真名·不填暱稱/稱號/台詞/地名",
        "physical_state": _physicalStateRef,
        "appearance_extras": _appearanceExtrasRef,
        "mutual_nicknames": "本回合真的叫出口的暱稱·否則「無」",
        "memory": "里程碑(告白/初牽手/難忘約會/重要約定)才寫≤30字·同 narration 用第二人稱「你」稱玩家·其餘填「無」·同一事只記一次"
      }]
    },
    // target 只能填真名(schema級約束，比事後再說一次更有效)。
    "rel_changes": [{
      "target": "NPC真名",
      "fav_change": "整數·日常+1~2、明顯心動或重大進展+3~5、冒犯給負"
    }],
    "master_note": _masterNote,
  };
  // 🌀 側寫節流改在【落地端】做（`_doSideWrite` 才寫回表），schema 一律保留 master_note。
  //    原本是非側寫回合把這一欄從範本刪掉——省 77 字，卻讓 system prompt 每 3 回合變一次形狀，
  //    整個 1,655 字的可快取前綴跟著作廢。參數保留只為相容既有呼叫。
  if (includeMasterNote === false) { /* 不再改動 schema，見上 */ }
  if (includeOptions === false) { delete finalJson.options; }

  // 🔠 對話格式規則：2026-09 起只剩鑑賞在用——那套含喘息/吸吮的例子是 NSFW 取向，solo 是 SFW 戰鬥敘事，改用 miniSystem 內的短版。

  // 🔴 NSFW(慾海模式)：本回合聚焦當下的近身互動(情慾/調情/鋪陳皆可)，雜務(物品/金錢/陣營/任務/招募/地圖/戰鬥數值/身世)完全不追蹤、不輸出，鐵律文字大幅精簡，盡量交給AI自行判斷。
  const nsfwBaseRules = `後日談敘事核心·輕小說筆觸·台灣繁體中文·第二人稱「你」＝玩家·禁上帝視角。鐵律：
1. 承接玩家最新動作與台詞【語氣照原樣】(疑問就疑問、吐槽就吐槽)·不擴寫不代玩家加戲·被搭話的人本回合必給完整真實反應·優先接反轉/否定/突發情緒。
2. 每3~4句 <br><br> 分段。
3. ${dialogueFormatRule_()}
4. 依玩家輸入【確實推演往下走·不停滯敷衍】——答不答應由對方的[個性]×[好感]決定(順從/猶豫/半推半就/婉拒皆可)，玩家不能替對方決定反應；肢體親密照【親密尺度五階】。
5. 先在 inner_monologue 判對方此刻最真實的反應·再寫 narration。
6. 繼承歷史情緒與親密階·絕不無故重置(降溫只因被打斷/翻臉等明確事件)·玩家只是日常時不憑空推進情慾。
7. 肢體互動依雙方【性別】欄自然呈現。
8. 萌點/語癖/專屬稱呼自然滲入、偶爾點到即可·同一個不重複用。關係標籤由玩家定，不可改動。
9. 玩家指定的裝扮＝既定事實，直到劇情真讓那個人換裝為止——不因為「這身跟這幕不搭」就自行改寫或省略。
10. 敘事只寫這個世界裡看得到聽得到的：好感數字、關係階級、系統/回合/選項/欄位名一律不進 narration，也不報幕宣告任何變化——要表現就用神情、語氣與彼此的距離。
11. 聚焦當下近身互動·只輸出合法JSON(各欄怎麼填見下方輸出範本)。`;

const specificRules = "";

return nsfwBaseRules + "\n" + specificRules + "\n\n★【輸出範本】\n" + JSON.stringify(finalJson, null, 2);
}

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

const KANSHOU_REGIONS_ = [
  { id: 'room', name: '房間', desc: '私人房間' },
  { id: 'home', name: '家的共用空間', desc: '共用生活空間' },
  { id: 'shinzan', name: '深山町', desc: '溫馨日常區' },
  { id: 'fuyuki', name: '冬木市中心', desc: '熱鬧生活區' },
  { id: 'dojo', name: '山林', desc: '安靜神秘區' },
  { id: 'visit', name: '拜訪住處', desc: '同伴們各自的家' }
];
// 🧭 給AI的地點脈絡：光一個地名(如「客廳」)AI分不出是御主自己家還是別人家，容易誤演成「在他家中」。
function kanshouLocContextForAI_(locName, homeName) {
  const loc = KANSHOU_LOCATIONS_.find(l => l.name === String(locName || "").trim());
  if (!loc) return "";
  switch (loc.region) {
    case 'room': return `你自己的家「${homeName}」的私人房間`;
    case 'home': return `你自己的家「${homeName}」的共用空間`;
    case 'visit': return `這是別人的住處，你是登門造訪的客人、不是自己家`;
    case 'shinzan': return `深山町（溫馨的住宅生活區）`;
    case 'fuyuki': return `冬木市中心（熱鬧的商業生活區）`;
    case 'dojo': return `山林（安靜神秘的郊野區）`;
    default: return "";
  }
}
// 🌸 鑑賞地點清單：純資料驅動的小陣列，不進 MAP 試算表(不跟solo共用坤圖)——之後要加/改地點只動這裡。
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
  { name: '書店二樓', region: 'fuyuki', desc: '安靜得只聽見翻頁聲的二樓書架間。', bands: ['清晨', '午後', '黃昏'] },
  { name: '屋頂花園', region: 'fuyuki', desc: '高樓頂上的一方綠意，能望見整座城市。' },
  { name: '商店街', region: 'fuyuki', desc: '人聲鼎沸的商店街，攤販林立。' },
  { name: '摩天輪', region: 'fuyuki', desc: '入夜會點燈的摩天輪，是情侶間熱門的約會景點。', bands: ['清晨', '午後', '黃昏', '夜'] },
  { name: '水族館', region: 'fuyuki', desc: '館內盡是幽藍燈光，水母缸前總擠著竊竊私語的情侶。', bands: ['清晨', '午後'] },
  { name: '深夜賓館', region: 'fuyuki', desc: '招牌亮著曖昧的霓虹燈，房間隔音很好，沒有人會多問一句。', noEncounter: true, dateOnly: true, bands: ['黃昏', '夜', '深夜'] },

  { name: '老道場', region: 'dojo', desc: '木地板與竹刀氣味的老道場。' },
  { name: '山間小徑', region: 'dojo', desc: '林蔭遮天、只聞鳥鳴的山間小路。' },
  { name: '隱藏溫泉', region: 'dojo', desc: '深藏山林間、鮮少人知的一方溫泉。' },
  { name: '廢棄神社', region: 'dojo', desc: '荒草蔓生、早已無人祭拜的廢棄神社。' },
  { name: '夜景展望台', region: 'dojo', desc: '能俯瞰整座冬木市萬家燈火的高地，晚風正好，兩人並肩無語也不尷尬。', bands: ['黃昏', '夜', '深夜'] },
  { name: '情侶溫泉套房', region: 'dojo', desc: '只租給兩人的溫泉旅館房間，一拉上紙門，外頭的世界就與你們無關了。', noEncounter: true, dateOnly: true, bands: ['黃昏', '夜', '深夜'] },

  // 拜訪住處：只保留女性角色的住處，noEncounter:true(私人住處，恆不觸發陌生人巧遇)，name務必與下方KANSHOU_HERO_HOME_的值逐字一致，否則kanshouRollDailyLocation_骰到的地點對不上這裡。
  { name: '隱蔽的工房', region: 'visit', desc: '隱藏在巷尾、飄著藥草氣味的工房。', noEncounter: true },
  { name: '島嶼道場', region: 'visit', desc: '孤懸海上、只有濤聲相伴的道場。', noEncounter: true },
  { name: '埃德費爾特宅邸', region: 'visit', desc: '歐風古典的埃德費爾特家宅邸。', noEncounter: true },
  { name: '愛因茲貝倫城', region: 'visit', desc: '終年白雪覆蓋的愛因茲貝倫城堡。', noEncounter: true },
  { name: '遠坂邸', region: 'visit', desc: '老字號魔術師家系的遠坂邸。', noEncounter: true },
  { name: '藤村家', region: 'visit', desc: '熱鬧溫馨、時常傳出笑鬧聲的藤村家。', noEncounter: true }
];
// 🏷️ 送進提示詞的地名：資料鍵「我的房間」是第一人稱，跟第二人稱旁白打架(旁白會照抄成「走進我的房間」)。
//    只改餵 AI 的字面，存表/比對一律仍用原鍵。
function kanshouLocNameForAI_(locName) {
  return String(locName || "").trim() === '我的房間' ? '你的房間' : String(locName || "");
}
// 🏠 房間顯示名稱：只剩玩家自己的房間，永遠顯示「(玩家名)的房間」。
function kanshouRoomDisplayName_(locKey, pcData, gameId, myName, myIdx) {
  if (locKey === '我的房間') return String(myName || "自己") + '的房間';
  return locKey;
}
// 暫時移出鑑賞的英靈id清單(單一來源)，召喚/巧遇/地點標籤/住處全部共用同一份。
const KANSHOU_SUMMON_BLOCKED_IDS_ = ['斯卡哈-Assassin', '伊莉雅-Caster', '恩奇都-Lancer'];
// 🏘️ 開局起始住民(2026-07玩家定案)：只有這4位一開始就「活在這座城裡」，其餘靠巧遇結識後才入駐。
const KANSHOU_STARTER_IDS_ = ['藤村大河-Master', '遠坂凜-Master', '間桐櫻黑化-Master', '阿爾托莉雅-Saber'];
// 地點×角色 氛圍標籤(資料驅動，往陣列塞一筆 SEED_SERVANTS 的 id 就能加，不動抽選邏輯)：查無標籤或抽不中標籤池時退回全女性保底池KANSHOU_ENCOUNTER_FEMALE_IDS_；不含KANSHOU_SUMMON_BLOCKED_IDS_裡暫時移出的id，避免巧遇到根本無法被正式召喚入駐的人。
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
// 🏷️ 2026-07「移動過去 他們必須是要在打工或是消費活動...不然聊一聊會不會忘記他是在工作」玩家定案：商業性質地點給一句「當下在做什麼」的輕量敘事引子，讓AI對「為什麼她在這個店裡」有個合理交代、且整回合對話都能維持一致(不需要持久狀態——每回合都直接依她當下真實LOC現查現算，本來就不會忘記；純寫死的地點→活動對照表，沒有寫死的地點沒有這句提示，AI自然發揮，不受限)。
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
const KANSHOU_ENCOUNTER_FEMALE_IDS_ = ['阿爾托莉雅-Saber', '美杜莎-Rider', '美狄亞-Caster', '斯卡哈-Lancer', '美遊-Saber', '小黑-Archer', '遠坂凜-Master', '伊莉雅絲菲爾-Master', '間桐櫻黑化-Master', '藤村大河-Master'];
// 同地點AI詳細卡片上限(見actionPlay的partyRows)——同地點的人湊在一起時的prompt篇幅上限。
const KANSHOU_PARTY_DETAIL_CAP_ = 5;
// 世界概況(輕量版)名單上限——同伴一多，每回合都列全部人+所在地會讓提示詞無限膨脹，只取好感前幾位。
const KANSHOU_WORLD_ROSTER_CAP_ = 8;
// 橋段庫：GAS先決定「觸發條件」與「這次走向」，AI只負責照著選中的走向演出具體細節，玩家不必自己打字下劇本。
const KANSHOU_SCENE_EVENTS_ = {
  // ── 地點×時段(KANSHOU_LOCATION_EVENTS_) ──
  共浴: { ambient: '浴室裡傳來水聲，對方正在沐浴' },
  溫泉同浴: { ambient: '氤氳的霧氣裡，對方正泡在溫泉中' },
  膝枕: { ambient: '午後的客廳很慵懶，對方正窩在沙發上' },
  下廚: { ambient: '廚房飄出飯菜香，對方正在準備晚餐' },
  觀星: { ambient: '今晚夜空格外清澈，對方在屋頂花園仰望星空' },
  // ── 節慶(KANSHOU_FESTIVAL_EVENTS_) ──
  初詣: { ambient: '新年頭一天，街上到處是要去神社參拜的人潮與攤販' },
  情人節巧克力: { ambient: '今天是情人節，街上的店家全擺出了巧克力與心形包裝' },
  七夕短冊: { ambient: '七夕，街上到處立著掛滿短冊的竹枝' },
  中秋賞月: { ambient: '中秋，空氣裡都是月餅與團圓的味道，今晚的月亮會特別圓' },
  聖誕約會: { ambient: '聖誕，整條街的燈飾與音樂都在提醒今天不一樣' },
  跨年倒數: { ambient: '一年的最後一天，街上到處是準備跨年的人與收攤的年貨' },
  // ── 同居日常(KANSHOU_COHABIT_EVENTS_·僅同居中的她) ──
  同居晨光: { ambient: '清晨的家裡，對方已經起身在活動' },
  同居午後: { ambient: '午後的家裡只有你們兩人，對方正做著自己的事' },
  同居黃昏: { ambient: '傍晚了，對方在廚房張羅著晚飯' },
  同居夜話: { ambient: '夜深了，對方還沒去睡，看來是想說說話' },
  同居深夜: { ambient: '半夜，對方竟也還醒著' }
};
// 睡眠時刻切點(玩家實測要求：0~8點在她家/和室/玩家房間必定熟睡)——不依附 timeBand_ 的深夜/清晨切法，清晨 band 原本一路延伸到 11 點、超出「還在睡」的合理範圍。
const KANSHOU_ASLEEP_HOUR_END_ = 8;
const KANSHOU_NIGHT_RAID_HOUR_END_ = 5;
// 地點橋段觸發表：她剛好在這個地點×時段吻合→把該事件的 ambient 當「此地此刻·情境事實」注入提示詞(2026-07 泡泡拆除後不再跳按鈕，見 kanshouSceneAmbientStr)。
const KANSHOU_LOCATION_EVENTS_ = {
  '浴室': { eventKey: '共浴', bands: ['夜', '深夜'] },
  '隱藏溫泉': { eventKey: '溫泉同浴', bands: ['午後', '黃昏', '夜'] },
  '客廳': { eventKey: '膝枕', bands: ['午後'] },
  '廚房': { eventKey: '下廚', bands: ['黃昏'] },
  '屋頂花園': { eventKey: '觀星', bands: ['夜', '深夜'] }
};
// 節慶橋段觸發表：日曆走到節慶當天(KANSHOU_FESTIVALS_的month/day)×時段吻合×玩家所在地有同伴→注入該事件的 ambient 情境事實。
const KANSHOU_FESTIVAL_EVENTS_ = {
  newyear: { eventKey: '初詣', bands: ['清晨', '午後'], doneLoc: ['古老神社'], todo: '到神社初詣參拜' },
  valentine: { eventKey: '情人節巧克力', bands: ['清晨', '午後', '黃昏', '夜'], doneLoc: ['咖啡廳'], todo: '找間店坐下來，好好過這個情人節' },
  qixi: { eventKey: '七夕短冊', bands: ['黃昏', '夜', '深夜'], doneLoc: ['古老神社'], todo: '到神社把心願寫上短冊、掛上竹枝' },
  midautumn: { eventKey: '中秋賞月', bands: ['夜', '深夜'], doneLoc: ['屋頂花園', '夜景展望台'], todo: '找個看得見月亮的高處一起賞月' },
  xmas: { eventKey: '聖誕約會', bands: ['黃昏', '夜'], doneLoc: ['商店街'], todo: '到亮著燈飾的商店街走一趟' },
  nye: { eventKey: '跨年倒數', bands: ['夜', '深夜'], doneLoc: ['古老神社'], todo: '到神社迎接新年的第一刻' }
};
var KANSHOU_FESTIVAL_DONE_TAG_ = makeIntTag_('節慶達成', 0);
// 🏠 同居日常橋段觸發表(時段→事件)：她【同居中】×兩人同處玩家居所×該時段有對應日常→注入 ambient。
const KANSHOU_COHABIT_EVENTS_ = {
  清晨: '同居晨光', 午後: '同居午後', 黃昏: '同居黃昏', 夜: '同居夜話', 深夜: '同居深夜'
};
// 🌙 深夜訪客「別有用心」的分寸判準(2026-07 泡泡拆除後，唯一呼叫點只剩深夜敲門那條)：好感決定這次能走到哪一階，不寫死台詞，具體怎麼演、講什麼話全交AI依角色性格發揮。
function kanshouAsleepOutcomeStr_(bond) {
  if (bond >= 80) return '兩人的關係已經很深，對方可以徹底卸下防備、主動迎合，這次能順著情境發展下去，不受親密尺度五階節奏限制';
  if (bond >= 60) return '兩人已有一定好感，對方可能半推半就地放任靠近、甚至有點主動回應，但親密尺度五階此刻卡在「親吻擁抱」這一階，不宜真的推展到更進一步';
  return '兩人好感還沒到能這樣的地步，對方會又驚又惱，甚至直接把人趕走，不會就此讓事情繼續下去';
}
// 修過的bug：kanshouRollDailyLocation_原本深夜/清晨的homeBias會直接回傳玩家自己家的房間，讓不在場的人溜進玩家家裡——改成每位英靈自己的住處(資料驅動，同KANSHOU_LOCATION_TAGS_寫法)，…（全文見 CODE_NOTES.md）
const KANSHOU_HERO_HOME_ = {
  '美狄亞-Caster': '隱蔽的工房', '斯卡哈-Lancer': '島嶼道場',
  '美遊-Saber': '埃德費爾特宅邸', '小黑-Archer': '愛因茲貝倫城',
  '遠坂凜-Master': '遠坂邸', '伊莉雅絲菲爾-Master': '愛因茲貝倫城', '藤村大河-Master': '藤村家'
};
// 🏠 泛用住處池(七度改版新增)：沒有專屬豪邸的英靈隨機抽一間、終身持有。
const KANSHOU_GENERIC_HOME_POOL_ = [
  { name: '河畔小公寓', desc: '面河的小公寓，採光通風都好，租金也親民。' },
  { name: '巷弄老屋', desc: '藏在巷弄深處的老式住宅，帶點懷舊氣息。' },
  { name: '高塔套房', desc: '城區高處的一間套房，能眺望遠方街景。' },
  { name: '郊區透天', desc: '稍嫌偏僻但寬敞安靜的獨棟透天厝。' },
  { name: '老街閣樓', desc: '老街屋頂加蓋的一間安靜閣樓。' },
  { name: '街角公寓', desc: '鬧區街角的公寓，樓下就是店家，出入方便。' },
  { name: '靜巷租屋', desc: '藏身在安靜巷弄裡的一處租屋。' },
  { name: '河堤畔宅', desc: '鄰近河堤的一棟住宅，晨昏都靜謐。' }
];
KANSHOU_GENERIC_HOME_POOL_.forEach(function (h) {
  KANSHOU_LOCATIONS_.push({ name: h.name, region: 'visit', desc: h.desc, noEncounter: true, generic: true });
});
function kanshouGetHeroHome_(heroId, memory) {
  if (heroId && KANSHOU_HERO_HOME_[heroId]) return KANSHOU_HERO_HOME_[heroId];
  const m = String(memory || "").match(/【住處】([^｜【】]*)/);
  return (m && m[1].trim()) || '自己的住處';
}
// 寫入隨機分配的住處記憶標記，比照 setOutfit_ 同款「清除舊值再整段append」寫法。
function setKanshouHeroHome_(memory, homeName) {
  const cleaned = String(memory || "").replace(/｜?【住處】[^｜【】]*/g, "");
  return homeName ? (cleaned ? cleaned + "｜" : "") + "【住處】" + homeName : cleaned;
}
// 🏷️ MEMORY標記存取器【邂逅】：逗號分隔的巧遇過姓名清單，去重、僅供「似曾相識」氛圍參考——同行隊伍成員的好感/關係走既有 REL_TAG/BOND，這裡只記路人巧遇過誰，不重複記錄。
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
// 巧遇抽選共用邏輯(70%機率)：「出門走走」按鈕跟「原地問還有誰」共用同一套加權隨機。
function kanshouRollEncounter_(locName, excludeIds) {
  const excl = excludeIds || [];
  const tagPool = KANSHOU_LOCATION_TAGS_[locName] || [];
  const basePool = tagPool.length ? tagPool : KANSHOU_ENCOUNTER_FEMALE_IDS_;
  const pool = basePool.filter(id => !excl.includes(id));
  if (!pool.length || Math.random() >= 0.7) return null;
  const pickId = pool[Math.floor(Math.random() * pool.length)];
  return SEED_SERVANTS.find(h => h.id === pickId) || null;
}
function kanshouHeroIdByName_(heroName) {
  // 短名優先(id 唯一對應，不受真名撞名影響)，再退回真名候選比對。
  const n = String(heroName || "").trim();
  for (var cid in KANSHOU_CASUAL_NAME_) { if (KANSHOU_CASUAL_NAME_[cid] === n) return cid; }
  const hero = SEED_SERVANTS.find(h => kanshouNameCandidates_(h.realName).includes(heroName));
  return hero ? hero.id : null;
}
// 🔒 拜訪私人住處門檻：跟屋主(KANSHOU_HERO_HOME_反查)在本局已入駐、且好感≥KANSHOU_VISIT_BOND_(熟識40)才解鎖登門——沒熟到一定程度不好貿然闖進人家家裡。
function kanshouResidenceUnlocked_(pcData, residenceName, gameId) {
  if (!residenceName) return false;
  return pcData.some(function (r) {
    if (String(r[COL.PC.FACTION]) !== "從者" || String(r[COL.PC.ID]).startsWith("DEAD_")) return false;
    if (gameId && String(r[COL.PC.GAME_ID] || "") !== gameId) return false;
    const hid = kanshouHeroIdByName_(String(r[COL.PC.NAME]));
    const home = kanshouGetHeroHome_(hid, r[COL.PC.MEMORY]);
    return home === residenceName && home !== '自己的住處' && (parseInt(r[COL.PC.BOND]) || 0) >= KANSHOU_VISIT_BOND_;
  });
}
function kanshouLocHasPendingPromise_(pcData, loc, curDay, gameId) {
  return pcData.some(function (r) {
    if (gameId && String(r[COL.PC.GAME_ID] || "") !== gameId) return false;
    const p = kanshouGetPromise_(r[COL.PC.MEMORY]);
    return !!(p && p.day >= curDay && p.loc === loc);
  });
}
// 同住人深夜/清晨睡不著出門走走的機率，獨立於一般英靈的homeBias，資料只存一處。
function kanshouRollDailyLocation_(heroName, hour, cohabit, memory) {
  const heroId = kanshouHeroIdByName_(heroName);
  if (hour !== undefined && hour !== null) {
    const band = timeBand_(hour);
    if (cohabit) {
      if (band === '深夜' && Math.random() < 0.85) return KANSHOU_COHABIT_ROOM_;
      if (band === '清晨' && Math.random() < 0.5) return KANSHOU_COHABIT_ROOM_;
      if (band === '夜' && Math.random() < 0.75) {
        const homes = KANSHOU_LOCATIONS_.filter(l => l.region === 'home').map(l => l.name);
        return homes[Math.floor(Math.random() * homes.length)];
      }
    } else {
      const homeBias = band === '深夜' ? 0.85 : (band === '清晨' ? 0.5 : 0);
      if (homeBias > 0 && Math.random() < homeBias) {
        return kanshouGetHeroHome_(heroId, memory);
      }
    }
  }
  const haunts = heroId ? Object.keys(KANSHOU_LOCATION_TAGS_).filter(loc => KANSHOU_LOCATION_TAGS_[loc].includes(heroId)) : [];
  // 🌙 全地點保底池排除'room'(玩家自己的房間)跟'visit'(別人登記的住處，見KANSHOU_HERO_HOME_)兩個分區——不同行的英靈不該隨機骰進玩家臥室或別人家裡，那裡只能靠「拜訪」主動走進去，不是隨機亂晃能撞到的地方；否則沒有haunts標籤/沒有登記住處的英靈可能隨機骰進遠坂邸這種別人的家，跟夜襲/賴床叫醒橋段「LOC剛好等於某人家」的判定衝突，觸發在錯的人身上。
  const pool = haunts.length ? haunts : KANSHOU_LOCATIONS_.filter(l => l.region !== 'room' && l.region !== 'visit' && !l.dateOnly).map(l => l.name);
  return pool[Math.floor(Math.random() * pool.length)];
}
// 真正的西曆年/月/日(每年固定365天、不算閏年，遊戲用途夠精準)，只抓3年區間(見actionPlay的advanceHours上限)不追求無限年份。
const KANSHOU_CAL_START_MONTH_ = 12, KANSHOU_CAL_START_DAY_ = 20;
// 開局那年的西元年。原本沒有這個常數、year 直接算成「第幾年」，開局就顯示「1年12月20日」——
// 那個年份不存在於任何世界裡，玩家的時鐘與送給 AI 的日期都在講一個假年份。
const KANSHOU_CAL_START_YEAR_ = 2005;
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
  const year = KANSHOU_CAL_START_YEAR_ + Math.floor(totalOff / 365);
  let doy = totalOff % 365;
  let month = 0;
  while (doy >= KANSHOU_DAYS_IN_MONTH_[month]) { doy -= KANSHOU_DAYS_IN_MONTH_[month]; month++; }
  return { year: year, month: month + 1, day: doy + 1 };
}
// 算「從現在」到「下一次」某月日前一天早上6點的小時數(2026-07玩家定案：提前一天抵達，讓敘事能帶出「明天才是節慶」的期待感，而非直接落在節慶當天)。
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

// 「跳到時段」：GAS算好差幾小時再丟進既有advanceHours管線，跟跳到節慶(kanshouHoursUntilDate_)同一種「單一真實來源在後端」寫法。
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
// 「跳到時段」＋「時段行動」按鈕都需要前端知道現在幾點——這裡統一格式化成單一真實來源，buildClientState_/actionPlay的回應都呼叫這支，不各自重複拼字串。
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

// 結束一天(準備就寢)時的機率事件：命中就【直接讓她進門】、本回合不推進日期。
const KANSHOU_KNOCK_CHANCE_ = 0.2;  // 每次「結束一天」的敲門機率
const KANSHOU_KNOCK_MIN_BOND_ = 60;
// 🌙 深夜訪客好感達門檻時，這次來訪帶「別有用心」夜襲鏡像版的機率——不是每次都這樣才有驚喜感。
const KANSHOU_KNOCK_RAID_CHANCE_ = 0.5;

// 好感≥80觸發同床共枕的那次結束一天，順手記一筆「今晚共度良宵的對象」，下一回合(不論玩家做什麼)讀一次就清掉(一次性旗標)，餵進提示詞當【晨間餘韻】引子。
var KANSHOU_MORNING_AFTER_TAG_ = makeTextTag_('晨間餘韻');
// 🌙 同款一次性旗標的另一半：那些「昨晚陪你到最後、卻沒留下來」的人。
var KANSHOU_NIGHT_PART_TAG_ = makeTextTag_('昨夜道別');
// 🌙 夜未眠(存玩家列·absDay)：2026-07 玩家「睡覺按鈕這裡有被夜襲判定+色色…要再切一段深夜的大戰時刻...?」。
var KANSHOU_NIGHT_SCENE_TAG_ = makeIntTag_('夜未眠', 0);

// 🙋 她主動(2026-07 玩家「泡泡用的應該也很少了…NPC 是不是就不太主動了？
var KANSHOU_INITIATIVE_DAY_TAG_ = makeIntTag_('主動日', 0);
// 📐 調校依據(2026-07 模擬 40 天實跑)：初版 BASE .006/PER_BOND .0002 打完整天會 39/40 天都有事，「每天都有」讀起來很腳本。
const KANSHOU_INIT_BASE_ = 0.002;       // 每回合基礎機率
const KANSHOU_INIT_PER_BOND_ = 0.00012; // 每點好感加成(越親近越常主動)
const KANSHOU_INIT_MAX_ = 0.02;         // 單回合上限，避免高好感時每天開場就觸發
// 🕘 只有「她自己走來找你」這條要看時鐘：另外兩種她本來就已經在你面前，幾點都不奇怪。
const KANSHOU_INIT_VISIT_FROM_ = 9;
const KANSHOU_INIT_VISIT_TO_ = 21;
const KANSHOU_INIT_WANTS_ = [
  '手上拿著剛買回來的東西，本來就是打算拿給你的',
  '心裡想去某個地方走走，話還卡在嘴邊沒說出口',
  '有件事想問你，猶豫著要不要現在開口',
  '只是想要你陪一下，理由對方自己會找',
  '注意到你身上或身邊有什麼跟平常不一樣',
  '手邊的事告一段落了，正好空下來，眼睛開始往你這邊看'
];
// 🎭 橋段當日戳(存該同伴列MEMORY·absDay)：同一位同伴、同一天，只有第一次接受橋段才給KANSHOU_SCENE_BOND_ 好感——防「靠近她/叫醒她」按鈕在同地×時段吻合時每 0.5h 重覆刷 +3、繞過細水長流節奏。
var KANSHOU_SCENE_DAY_TAG_ = makeIntTag_('橋段日', 0);
var KANSHOU_KNOCK_DAY_TAG_ = makeIntTag_('夜訪日', 0);
// 🚪 這次夜訪的客人姓名(存【玩家】列)：「送客」的唯一姓名來源——dismissGuest 是下一個 request才送來的，後端得記得是誰；刻意不吃 client 傳的名字。
var KANSHOU_NIGHT_GUEST_TAG_ = makeTextTag_('夜訪客');
var KANSHOU_FIRST_MET_DAY_TAG_ = makeIntTag_('初見日', 0);
function getKanshouAnnivFired_(memory) {
  var m = String(memory || "").match(/【紀念日里程碑】([\d,]*)/);
  return m && m[1] ? m[1].split(",").map(Number) : [];
}
function setKanshouAnnivFired_(memory, arr) {
  var s = String(memory || "");
  var marker = "【紀念日里程碑】" + arr.join(",");
  if (/【紀念日里程碑】[\d,]*/.test(s)) return s.replace(/【紀念日里程碑】[\d,]*/, marker);
  return (s ? s + "｜" : "") + marker;
}
// 💞 結構化「第一次」帳(存該同伴列MEMORY)：【初次】事件:absDay,事件:absDay,…為什麼不靠 memoir：memoir 是 AI 自由書寫、cap 10 會被新回憶擠掉——玩久了開頭那段必然消失，於是「我們第一次牽手是哪天」這種只要講錯就直接戳破沉浸感的事實，反而是最先被遺忘的。
var KANSHOU_FIRSTS_TAG_ = makeTextTag_('初次');
function kanshouGetFirsts_(memory) {
  var raw = KANSHOU_FIRSTS_TAG_.get(memory);
  if (!raw) return [];
  return String(raw).split(",").map(function (s) {
    var p = String(s).split(":");
    return { key: String(p[0] || "").trim(), day: parseInt(p[1]) || 0 };
  }).filter(function (o) { return o.key && o.day; });
}
var KANSHOU_FIRSTS_CAP_ = 20; // 存儲上限：現有 key 約 15 種(4 個關係節點＋各式橋段)，留餘裕又不讓 MEMORY 無限長
var KANSHOU_FIRSTS_SHOW_ = 5; // 每回合進提示詞的筆數上限(依日期取最早幾筆)——存得下不代表每回合都該送
function kanshouStampFirst_(memory, key, absDay) {
  var k = String(key || "").replace(/[,:｜|【】]/g, "").trim();
  var d = parseInt(absDay) || 0;
  if (!k || !d) return memory;
  var cur = kanshouGetFirsts_(memory);
  if (cur.some(function (o) { return o.key === k; })) return memory; // 只記第一次
  if (cur.length >= KANSHOU_FIRSTS_CAP_) return memory;              // 滿了就不再收(既有的永不驅逐)
  cur.push({ key: k, day: d });
  return KANSHOU_FIRSTS_TAG_.set(memory, cur.map(function (o) { return o.key + ":" + o.day; }).join(","));
}
// 💗 關係階級「歷來最高階」標記(存該同伴列MEMORY·1=點頭之交…5=戀人)：用來偵測「這回合剛跨階」。
var KANSHOU_REL_RANK_TAG_ = makeIntTag_('關係階', 0);
// 🔒 好感棘輪的高水位(存她那一列)：這輩子跨過的最高門檻，見 kanshouBondFloorOf_／kanshouSyncRelTier_。
var KANSHOU_BOND_FLOOR_TAG_ = makeIntTag_('好感底線', 0);
// 🧊 最近一次「讓她不高興」是哪一天(absDay·存她那列)。
var KANSHOU_CHILL_DAY_TAG_ = makeIntTag_('冷卻日', 0);
// 單回合掉幾分才算數。1~2 分是 AI 的日常微調噪音，寫成「不愉快」會讓她每回合都在鬧脾氣；
var KANSHOU_CHILL_MIN_DROP_ = 3;
// 這件事還沒過去的天數。當天＋隔天共兩天，第三天就翻篇——鑑賞是慢節奏日常，記太久會變成怨懟。
var KANSHOU_CHILL_DAYS_ = 1;
function kanshouRelRank_(bond) {
  var i = KANSHOU_REL_TIER_.findIndex(function (t) { return bond >= t.min; });
  return i < 0 ? 1 : (KANSHOU_REL_TIER_.length - i); // 陣列由高到低，故反轉成「由低到高」的階數
}
function kanshouRelTierLabel_(rank) {
  var t = KANSHOU_REL_TIER_[KANSHOU_REL_TIER_.length - rank];
  return t ? t.label : "";
}
// 📅 約定 2.0(存該同伴列MEMORY)：【約定】absDay:時段:地點＝「那天午後在X見」。
var KANSHOU_APPT_BANDS_ = [
  { band: '午後', hour: 14, label: '午後 14:00' },
  { band: '黃昏', hour: 18, label: '黃昏 18:00' },
  { band: '夜',   hour: 20, label: '夜晚 20:00' }
];
// 🌀 側寫節流：master_note(經歷)每回合都問會分散 AI 對敘事的注意力。
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
  const parts = String(m[2]).split(':'); // band:loc(2段) / band:loc:1(3段·她單方面) / loc(1段·舊)
  const band = parts.length >= 2 ? parts[0].trim() : "";
  const loc = (parts.length >= 2 ? parts[1] : parts[0]).trim();
  return { day: parseInt(m[1]), band: band, loc: loc, byHer: parts.length >= 3 && parts[2].trim() === '1' };
}
function kanshouClearPromise_(memory) {
  return String(memory || "").replace(/｜?【約定】\d+:[^｜【】]*/g, "").replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
}
function kanshouSetPromise_(memory, absDay, loc, band, byHer) {
  const s = kanshouClearPromise_(memory);
  const mid = (band ? band + ":" : "") + loc + (band && byHer ? ":1" : "");
  return (s ? s + "｜" : "") + "【約定】" + absDay + ":" + mid;
}
// 有時段的約定：她約定時刻前10分到場、待到時刻+2h(碰面窗過了自然離開，不整天空等)；無時段(舊)=整天釘。
const KANSHOU_APPT_LEAVE_EARLY_ = 0.5;
function kanshouPromisePin_(row, absDay, curHour) {
  const p = kanshouGetPromise_(row[COL.PC.MEMORY]);
  if (!p || p.day !== absDay) return null;
  const ah = kanshouApptHour_(p.band);
  if (ah === null || typeof curHour !== 'number') return p.loc; // 無時段或沒傳時→整天釘(相容)
  return (curHour >= ah - KANSHOU_APPT_LEAVE_EARLY_ && curHour < ah + 2) ? p.loc : null;
}
// 🏠 同居(存該同伴列MEMORY·【同居】1)：好感≥KANSHOU_COHABIT_BOND_且本人在場才邀得成。
var KANSHOU_COHABIT_TAG_ = makeIntTag_('同居', 0);
// 🏠 同居剛被解除的一次性旗標(蓋在她那一列)：kanshouSyncRelTier_ 在好感跌破門檻時蓋，actionPlay_組提示詞時讀一次就清。
var KANSHOU_COHABIT_END_TAG_ = makeIntTag_('同居解除', 0);
var KANSHOU_HANDHOLD_TAG_ = makeTextTag_('牽手');
// 🌙 醒著陪同標記(存該同伴列MEMORY·地點值)：牽手/剛同意同去而醒著陪同的同伴，即使之後放手、或玩家離開又走回來，只要人還在同一個地點沒變動，就持續視為醒著——否則放手的瞬間、或離開再進來的下一回合，她就會被誤判成剛好躺在自己家/和室裡熟睡，儘管全程明明醒著陪在玩家身邊互動(玩家實測「放開手馬上跳出賴床叫醒的泡泡」「離開又進去，敘事明明醒著卻還跳賴床泡泡」)。
var KANSHOU_AWAKE_HERE_TAG_ = makeTextTag_('醒著陪同');
const KANSHOU_COHABIT_BOND_ = 90;
// 🏠 同居邀請「已問過」一次性標記(2026-07 玩家「同居做成泡泡問一次、完全隱藏才是正解」)：好感首次達 KANSHOU_COHABIT_BOND_ 且她在場時跳一次邀請泡泡，跳過就蓋章、之後永不再問。
var KANSHOU_COHABIT_ASKED_TAG_ = makeIntTag_('同居問過', 0);
var KANSHOU_LOVER_TAG_ = makeIntTag_('戀人', 0);
// 💔 上一次告白被拒的日子(存該同伴列·absDay)：KANSHOU_CONFESS_COOLDOWN_ 天內說不出第二次。
var KANSHOU_CONFESS_DAY_TAG_ = makeIntTag_('告白日', 0);
// 💗 她是不是你的戀人(告白成立)。單一判準，前後端與提示詞全部走這支。
function kanshouIsLover_(row) {
  return !!KANSHOU_LOVER_TAG_.get(row[COL.PC.MEMORY]);
}
// 💔 還要幾天才說得出第二次告白（0＝現在就能開口）。單一真實來源：後端擋、前端鎖按鈕都走這支。
function kanshouConfessWait_(row, curDay) {
  var last = KANSHOU_CONFESS_DAY_TAG_.get(row[COL.PC.MEMORY]);
  if (!last) return 0;
  return Math.max(0, KANSHOU_CONFESS_COOLDOWN_ - ((parseInt(curDay) || 1) - last));
}
// 💗 告白成不成——【GAS 依 好感×相處次數 擲，AI 只演】(比照 kanshouProposalAccepts_ 的分工)。
function kanshouConfessAccepts_(bond, metCount) {
  var f = (KANSHOU_FAMILIAR_TIERS_.find(function (t) { return (parseInt(metCount) || 0) >= t.min; }) || {}).key;
  var p = ((parseInt(bond) || 0) - KANSHOU_CONFESS_BOND_) * KANSHOU_CONFESS_SLOPE_
    * (KANSHOU_CONFESS_FAMILIAR_MULT_[f] || 1);
  return Math.random() < Math.max(0.02, Math.min(0.95, p));
}
// 🔒 登門拜訪私人住處(region:'visit')的好感門檻＝熟識的朋友(見 KANSHOU_REL_TIER_ 的40切點)。
const KANSHOU_VISIT_BOND_ = 40;
const KANSHOU_COHABIT_ROOM_ = '和室';
function kanshouIsCohabit_(row) { return KANSHOU_COHABIT_TAG_.get(row[COL.PC.MEMORY]) > 0; }
// 通用【tag】值淨化：清掉標籤分隔字元(,/:/｜/【/】)避免撐破 MEMORY 裡任何單值 tag 的格式(住所名…)，順手也清掉引號/角括號(防提示詞注入)。
function kanshouSanitizeTagValue_(value, maxLen) {
  return String(value || "").replace(/[,:｜【】"'<>\n\r\t]/g, "").trim().slice(0, maxLen || 8);
}
// 📷 相簿(拍照收集)：手機拍照·2026-07 再修（玩家「拍照要改成手機、不用等」）——原本是寶麗來設定(每日底片限量+隔天沖洗)，玩家覺得手機沒有底片這種東西、拍完也該立刻能看，兩個限制都拔掉了。
const KANSHOU_ALBUM_CAP_ = 100;
function kanshouAlbumSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('相簿');
  if (!sh) { sh = ss.insertSheet('相簿'); sh.appendRow(['遊戲ID', '照片ID', '拍攝日', '時段', '地點', '天氣', '人物', '活動', '小敘述', '旗標', '髮色']); }
  return sh;
}
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
const KANSHOU_WEATHER_BY_SEASON_ = {
  winter: ['晴朗清冷', '陰天', '小雪紛飛', '雪後轉晴', '寒風凜冽'],
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
// 🏷️ MEMORY標記存取器【邂逅中】：這次到訪、還留在場邊可持續互動的巧遇對象(存hero id，單一值)——跟永久性的【邂逅】(邂逅過的名單，不會清除)不同，這個是「這次到訪期間」的暫時狀態，玩家移動離開該地點時清除(換地點＝這段緣分結束，下次到訪重新擲)。
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
  const safe = kanshouSanitizeTagValue_(name, 12) || "我家";
  return (cleaned ? cleaned + "｜" : "") + "【住所】" + safe;
}
// 部分英靈殿角色的 realName 帶括號附註(如「克洛伊·馮·愛因茲貝倫（Archer install）」)，AI 敘事自然只會用括號前後其中一段稱呼TA，但 rel_changes[].target 等比對要求逐字完全相符——會悄悄比對失敗、整條被跳過。
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
  out.slice().forEach(n => {
    if (/[A-Za-z]/.test(n)) {
      [n.toUpperCase(), n.toLowerCase(), n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()].forEach(v => { if (out.indexOf(v) === -1) out.push(v); });
    }
  });
  return out;
}

const KANSHOU_MISS_COPY_ = {
  promise: { title: '相約撲空', body: (n) => `你想找『${n}』相約見面，但對方此刻並不在這裡——演出這份撲空的悵然即可，約定沒有成立。` },
  move: { title: '提議撲空', body: (n) => `你想邀人一起去「${n}」，但此刻身邊沒有同伴——演出這份獨自的悵然即可(玩家可自己用地圖移動)。` },
  cohabit: { title: '邀請撲空', body: (n) => `你想邀『${n}』搬來同住，但對方此刻並不在這裡——演出這份撲空的悵然即可。` },
  hold: { title: '牽手落空', body: (n) => `你想牽『${n}』的手，但對方此刻並不在你身邊——演出這份撲空即可。` },
  confess: { title: '告白撲空', body: (n) => `你鼓起勇氣要向『${n}』告白，才發現對方此刻並不在這裡——演出這份話沒說出口的悵然即可。` },
  invite: { title: '結識未成', body: (n) => `你想跟『${n}』深交下去，但這段緣分此刻不成立(對方已離開、或早已相識)——演出這份悵然即可。` }
};
function kanshouMissStr_(type, name) {
  const c = KANSHOU_MISS_COPY_[type];
  return c ? `\n★【${c.title}】：${c.body(name)}` : '';
}

// 🔒 併發保護（2026-07 全面稽核·兩組獨立agent各自抓到同一根因）：actionPlay 故意豁免全域鎖(見 Router_Action.gs LOCK_EXEMPT_ACTIONS_，理由是AI呼叫4-5秒~最壞49秒不等，鎖全…（全文見 CODE_NOTES.md）
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
  const userMsg = String(userData.message || "").replace(/[｜【】]/g, ""); // 📅 endDay 呼叫不一定會帶 message，防呆避免下方 .includes 炸掉

  if (String(pcId || "").indexOf("KPC_") !== 0) return JSON.stringify({ text: "此功能僅限鑑賞使用。", people: [] });
  const driveOn = (userData.drive === true || String(userData.drive) === "true");
  const encounterOn = !(userData.encounter === false || String(userData.encounter) === "false");

  // 喜好與厭惡是常態情報，全面開放給 AI 參考🎯 送出時砍格(2026-07 玩家「性格四格／特徵四格分這麼細，AI 也沒辦法演出來」)：儲存仍是 4 格(逆天改命 UI／工房／solo 共用同一個 schema，動它是全面重構)，只精簡【送給 AI 的呈現】。
  const _qv = (v) => { const t = String(v || "").trim(); return QUAD_EMPTY_.indexOf(t) < 0 ? t : ""; };
  const formatPref = (str) => {
    const a = String(str || "").split('、');
    return [_qv(a[0]) && `[表象]${_qv(a[0])}`, _qv(a[1]) && `[內裡]${_qv(a[1])}`].filter(Boolean).join(' ');
  };

  const formatTrait = (str) => {
    const a = traitParts_(str);
    const _look = [_qv(a[0]), _qv(a[1])].filter(Boolean).join('・');
    return _look ? `[外貌氣質]${_look}` : "";
  };
  // 🎯 2026-07 玩家「『私下對可愛小物多看兩眼還故作矜持』這個就是萌點就好，不一定要反差」：第4格[私下一面]與[萌點]本來就是同一種功能(她那份惹人喜歡的隱藏面)，種子資料裡的萌點還早就寫成反差句(「食量驚人卻吃相優雅」)——等於同一件事包了兩層、各寫一遍。
  const traitPrivateOf_ = (str) => _qv(traitParts_(str)[2]);


  let pcData = sheets.pc.getDataRange().getValues();

  const pcIndex = kanshouPcIdx_(pcData, pcId);
  if (pcIndex === -1) return JSON.stringify({ text: "查無此人", people: [] });
  const pc = pcData[pcIndex];
  const pcName = pc[COL.PC.NAME];
  let curL = pc[COL.PC.LOC];
  let curDay = parseInt(pc[COL.PC.DAY]) || 1;
  let curHour = (pc[COL.PC.HOUR] === "" || pc[COL.PC.HOUR] == null) ? 8 : (parseFloat(pc[COL.PC.HOUR]) || 0);
  let jumpFest = null; // 🎊 有跳到節慶時記著，餵進下方提示詞當氛圍靈感(見★【氛圍靈感·非強制】)

  const moveTarget0_ = KANSHOU_LOCATIONS_.find(l => l.name === String(userData.moveTarget || "").trim());
  const _myGid_ = pc && pc[COL.PC.GAME_ID] ? String(pc[COL.PC.GAME_ID]) : "";
  let kanshouVisitBlockedStr = "";
  let moveTarget = moveTarget0_;
  if (moveTarget0_ && moveTarget0_.region === 'visit' && !kanshouResidenceUnlocked_(pcData, moveTarget0_.name, _myGid_) && !kanshouLocHasPendingPromise_(pcData, moveTarget0_.name, curDay, _myGid_)) {
    kanshouVisitBlockedStr = `\n★【登門未果·私人住處】：你來到「${moveTarget0_.name}」門前，卻想起跟這裡的主人還沒熟到能這樣直接登門造訪——演出你在門外停步、終究沒敲門就轉身離開的猶豫即可(不要進屋、不要讓屋主出現、不必解釋機制或提到數值)。`;
    moveTarget = null;
  }
  // 🕐 2026-07 六度改版·時段限定地點門檻：跟上面私人住處同一套「擋在移動前、當作沒真的進去」寫法。
  let kanshouTimeBlockedStr = "";
  if (moveTarget && Array.isArray(moveTarget.bands) && moveTarget.bands.indexOf(timeBand_(curHour)) === -1 && !kanshouLocHasPendingPromise_(pcData, moveTarget.name, curDay, _myGid_)) {
    kanshouTimeBlockedStr = `\n★【撲空·地點未開放】：你來到「${moveTarget.name}」，卻發現此刻(${timeBand_(curHour)})根本還沒到營業/開放的時段——演出你意識到撲了個空、隨即轉身作罷即可(不要進去、不要讓任何人出現、不必解釋機制或提到數值)。`;
    moveTarget = null;
  }
  const moveName = moveTarget ? moveTarget.name : "";
  let finalUserMsg = kanshouVisitBlockedStr
    ? `【玩家意圖】：想直接登門造訪「${moveTarget0_.name}」。`
    : kanshouTimeBlockedStr
      ? `【玩家意圖】：走向了「${moveTarget0_.name}」，卻發現這時段還沒開放。`
      : moveTarget
        ? (userData.moveWithCompanion
          ? `【玩家意圖】：和身旁答應同行的人一起走向了「${moveName}」。`
          : `【玩家意圖】：走向了「${moveName}」，四處看看那裡有什麼、有沒有遇見誰。`)
        : `【玩家意圖】：${userMsg}`;

  const dirtyPcRows = new Set();
  dirtyPcRows.add(pcIndex); // 玩家本人一定會被處理到，先加進去
  let _pendingNewPcRow_ = null;

  const currentAmbition = pc[COL.PC.INTENT] ? String(pc[COL.PC.INTENT]).trim() : "尚無明確目標，隨遇而安。";
  // 玩家自己的換裝(玩家UI設定或AI依appearance_extras更新)，比照【同行夥伴】卡片(partyDetailsArr)
  const myOutfit = getOutfit_(pc[COL.PC.MEMORY]);
  // 晨間餘韻：讀一次(上一回合結束一天留下的旗標，若有)就立刻清掉，只讓「緊接著的下一回合」
  const morningAfterNames = KANSHOU_MORNING_AFTER_TAG_.get(pc[COL.PC.MEMORY]);
  if (morningAfterNames) pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');
  // 🌙 夜未眠的出口②：玩家自己走出這個房間，這一夜就到此為止(人都不在了，沒有「獨處」可言)。
  if (userData.moveTarget && KANSHOU_NIGHT_SCENE_TAG_.get(pcData[pcIndex][COL.PC.MEMORY])) {
    pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_SCENE_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], 0);
    pc[COL.PC.MEMORY] = pcData[pcIndex][COL.PC.MEMORY];
  }
  // 🌙 夜未眠：這一刻是否已在「深夜獨處」段落中(見 KANSHOU_NIGHT_SCENE_TAG_)。
  const kanshouNightSceneOn_ = KANSHOU_NIGHT_SCENE_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]) === curDay;
  // 同款一次性旗標：昨夜陪你到最後卻沒留下的人。跟上面一樣讀完立刻清，只影響緊接著的這一回合。
  const nightPartNames = KANSHOU_NIGHT_PART_TAG_.get(pc[COL.PC.MEMORY]);
  if (nightPartNames) pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_PART_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');

  // 實例化：只取自己 game_id 世界內、同地點的人（御主無 game_id 時不過濾，相容舊角色）
  const myGameId = pc && pc[COL.PC.GAME_ID] ? String(pc[COL.PC.GAME_ID]) : "";
  const sameGame = (r) => !myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId;

  // 📸 回合【開始時】就跟玩家同地的人（名字快照）。
  const kanshouWithMeAtStart_ = pcData.filter((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者"
    && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_")
    && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()).map(r => String(r[COL.PC.NAME]).trim());

  // 🚪 深夜訪客擲骰：必須排在【最前面】——它會取消本回合的 endDay，而 _reHourAfter(情境時段)與kanshouTimeJumped_(在場來由)都讀 endDay，晚一步算就會拿到「已經睡到清晨6點」的錯值。
  let kanshouNightGuest_ = "";
  let _knockGuestReq_ = "";
  if (userData.endDay === true && !userData.skipKnockCheck
    && KANSHOU_KNOCK_DAY_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]) !== curDay) {
    const knockPool = pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.LOC] || "").trim() !== curL && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && (kanshouIsCohabit_(r) || (parseInt(r[COL.PC.BOND]) || 0) >= KANSHOU_KNOCK_MIN_BOND_));
    if (knockPool.length && Math.random() < KANSHOU_KNOCK_CHANCE_) {
      kanshouNightGuest_ = String(knockPool[Math.floor(Math.random() * knockPool.length)][COL.PC.NAME]);
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_KNOCK_DAY_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], curDay);
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_GUEST_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], kanshouNightGuest_);
      dirtyPcRows.add(pcIndex);
      userData.endDay = false;                    // 她來了，這一夜先不睡——日期不推進
      _knockGuestReq_ = kanshouNightGuest_;       // 交給既有接人流程
      // 🌙 2026-07 玩家「夜襲改簡單點？
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_SCENE_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], curDay);
      if (timeBand_(curHour) !== '夜' && timeBand_(curHour) !== '深夜') {
        curHour = KANSHOU_DAY_LAST_HOUR_;
        pcData[pcIndex][COL.PC.HOUR] = curHour;
      }
    }
  }
  // ⏳ 這回合是否發生「時間跳躍」——單一真實來源。
  const kanshouTimeJumped_ = !!(userData.endDay === true || userData.jumpBand || userData.jumpFestival || (parseFloat(userData.advanceHours) || 0) > 0);

  // 📅 相約(玩家在同伴卡點「相約」→前端帶promiseMeet{name,loc})：只能跟「此刻在場」的同伴約、地點限公開清單(不含玩家私室)；成立→她列MEMORY蓋【約定】明日:地點(新約蓋舊約)，約定日她的行程骰被釘在該地點(見kanshouPromisePin_呼叫端)，赴約/爽約每回合結算(見下方【依約相會】)。
  let _pendingProposal = null; // {type:'promise'|'hold', idx, loc?, name?}
  // 🎯 本回合「GAS 已經裁定完、AI 不能再改」的那個結果，會接在提示詞【最後一行】的玩家意圖後面。
  let _settledVerdict = "";
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
    // 時段：前端帶 band(午後/黃昏/夜)；不合法或沒帶→退回無時段(舊「整天有效」·向後相容)。
    const _pmBand = kanshouApptHour_(String(userData.promiseMeet.band || "").trim()) !== null ? String(userData.promiseMeet.band).trim() : "";
    const _pmLocObj_ = KANSHOU_LOCATIONS_.find(l => l.name === _pmLoc);
    // 私人住處(visit)未解鎖不可當約定地——約成立後玩家根本進不去(前端灰鎖＋後端擋移動)＝必然爽約陷阱。
    const _pmSameSpot_ = _pmLoc === String(curL || "").trim();
    const _pmLocOk = !!(_pmLocObj_ && _pmLocObj_.region !== 'room' && !_pmSameSpot_ && (_pmLocObj_.region !== 'visit' || kanshouResidenceUnlocked_(pcData, _pmLoc, _myGid_)) && (!_pmLocObj_.bands || !_pmBand || _pmLocObj_.bands.indexOf(_pmBand) !== -1));
    const _pmId = String(userData.promiseMeet.id || "").trim();
    const _pmIdx = _pmName ? findPcRowIdx_(pcData, _myGid_, { id: _pmId, name: _pmName, faction: "從者", loc: curL, excludeIdx: pcIndex, nameCandidates: kanshouNameCandidates_ }) : -1;
    if (_pmLocOk && _pmIdx !== -1) {
      const _pmBond = parseInt(pcData[_pmIdx][COL.PC.BOND]) || 0;
      const _pmHer = String(pcData[_pmIdx][COL.PC.NAME]);
      const _pmBandLabel = _pmBand ? (KANSHOU_APPT_BANDS_.find(b => b.band === _pmBand) || {}).label : "";
      // 🕐 2026-07 玩家「約會也想要可以約今天的時間」：前端帶 today=true 且該時段【今天還沒過】才算數。
      const _pmApptHour = _pmBand ? kanshouApptHour_(_pmBand) : null;
      const _pmToday = !!(userData.promiseMeet.today === true || String(userData.promiseMeet.today) === "true")
        && _pmApptHour !== null && _pmApptHour > curHour;
      const _pmWhenTxt = _pmToday ? '今天' : '明天';
      const _pmOld = kanshouGetPromise_(pcData[_pmIdx][COL.PC.MEMORY]);
      const _pmOldStr = (_pmOld && (parseInt(_pmOld.day) || 0) >= curDay)
        ? `${(parseInt(_pmOld.day) || 0) === curDay ? '今天' : '之前約好的'}${_pmOld.band ? ((KANSHOU_APPT_BANDS_.find(b => b.band === _pmOld.band) || {}).label || _pmOld.band) + '於' : '在'}「${_pmOld.loc}」` : "";
      _pendingProposal = { type: 'promise', idx: _pmIdx, loc: _pmLoc, band: _pmBand, today: _pmToday, accepted: kanshouProposalAccepts_('promise', _pmBond) };
      kanshouPromiseStr = `\n★【提議·相約·系統已裁定】你向『${_pmHer}』提議【${_pmWhenTxt}${_pmBandLabel ? _pmBandLabel + '於' : '在'}「${_pmLoc}」見面】。系統已依好感(${_pmBond}/100)裁定對方${_pendingProposal.accepted ? `【答應】了——請 narration 依對方的個性演出答應的反應（雀躍／害羞／矜持地點頭皆可），系統${_pmWhenTxt}會記得這個約${_pmOldStr ? `。★同時：你們原本還有一個【${_pmOldStr}見面】的約，這次改約等於把它取消了——narration 必須讓對方自然把這件事說出口(確認改期／有點可惜／順口調侃皆可)，不可讓舊的約無聲消失` : ''}` : '【婉拒】了——請 narration 依對方的個性演出婉拒的反應（不好意思／認真說改天／打趣帶過皆可），此約不成立、不必替玩家找補'}。★成敗由系統定，【不可】自行改寫對方的決定，只演對方的反應。`;
      finalUserMsg = `【玩家意圖】：向『${_pmHer}』提出「${_pmWhenTxt}${_pmBandLabel || ''}在${_pmLoc}見面」的約定。`;
    } else if (_pmName && _pmIdx === -1) {
      kanshouPromiseStr = kanshouMissStr_('promise', _pmName);
      finalUserMsg = `【玩家意圖】：想找『${_pmName}』相約，卻發現對方不在身邊。`;
      kanshouProposalResult_ = { ok: false, miss: true, type: 'promise', name: _pmName, where: _whereIsHer(_pmName) };
    } else if (_pmName) {
      kanshouPromiseStr = _pmSameSpot_
        ? `\n★【約不成·你們就在這裡】：你正想約『${_pmName}』到「${_pmLoc}」見面，才發現你們此刻【就站在那裡】——演出你話說到一半自己笑出來、把這句改成別的即可，這個約沒有成立。`
        : `\n★【約不成·地點不合適】：你想約『${_pmName}』到「${_pmLoc}」，但那裡此刻並不適合當約會地點(那是私人房間、還沒熟到能去、或那個時段根本不開放)——演出你話到嘴邊又換了個說法、這個約沒有談成即可，不必解釋機制。`;
      finalUserMsg = `【玩家意圖】：想約『${_pmName}』去「${_pmLoc}」，卻發現那裡約不成。`;
      kanshouProposalResult_ = { ok: false, type: 'promise_loc', name: _pmName, loc: _pmLoc, sameSpot: _pmSameSpot_ };
    }
  }

  // 🚶👋 玩家提議同去(地圖 👋 鈕→proposeMove=地點)：走跟相約/牽手同一條「確定性提議」管線——pre-AI 記待判定、AI 只需在 proposal_accept 答「接受/婉拒」、接受才出「前往」泡泡(玩家按同意才真的移動)。
  if (userData.proposeMove) {
    const _pvLoc = String(userData.proposeMove).trim();
    // 🔒 地點判準與 promiseMeet 對齊(同一類「必然撲空陷阱」)：舊版只擋 room 與同地，沒擋未解鎖住處與未開放時段——她答應了、玩家按同意，卻在移動那一步被門檻擋成「登門未果／撲空」，等於系統自己安排了一趟不可能成行的邀約。
    const _pvLocDef = KANSHOU_LOCATIONS_.find(l => l.name === _pvLoc);
    const _pvSameSpot = _pvLoc === String(curL || "").trim();
    const _pvLocOk = !!(_pvLocDef && _pvLocDef.region !== 'room' && !_pvSameSpot
      && (_pvLocDef.region !== 'visit' || kanshouResidenceUnlocked_(pcData, _pvLoc, _myGid_))
      && (!_pvLocDef.bands || _pvLocDef.bands.indexOf(timeBand_(curHour)) !== -1));
    // 提議對象＝此刻在場的【全部】同伴。
    const _pvIdxs = [];
    pcData.forEach((r, i) => {
      if (i === pcIndex || String(r[COL.PC.FACTION]) !== "從者" || !sameGame(r) || String(r[COL.PC.ID]).startsWith("DEAD_")) return;
      if (String(r[COL.PC.LOC] || "").trim() !== String(curL || "").trim()) return;
      _pvIdxs.push(i);
    });
    if (_pvLocOk && _pvIdxs.length) {
      const _pvNames = _pvIdxs.map(i => String(pcData[i][COL.PC.NAME]));
      const _pvHer = _pvNames.join('、');
      // 🎲 裁定基準＝在場同伴的【平均】好感。
      const _pvBonds = _pvIdxs.map(i => parseInt(pcData[i][COL.PC.BOND]) || 0);
      const _pvBond = Math.round(_pvBonds.reduce(function (a, b) { return a + b; }, 0) / _pvBonds.length);
      const _pvMulti = _pvNames.length > 1;
      _pendingProposal = { type: 'move', idx: _pvIdxs[0], names: _pvNames, name: _pvHer, loc: _pvLoc, accepted: kanshouProposalAccepts_('move', _pvBond) };
      kanshouPromiseStr += `\n★【提議·同去·系統已裁定】你向『${_pvHer}』提議【現在一起去「${_pvLoc}」】。系統已依好感(${_pvMulti ? `在場平均 ${_pvBond}` : _pvBond}/100)裁定${_pvMulti ? '她們全體' : '對方'}${_pendingProposal.accepted ? `【答應】同行——請 narration ${_pvMulti ? '讓被點名的每一位都各依自己的個性給出答應的反應(可有人爽快、有人半推半就，但結論一致)' : '依對方的個性演出答應的反應'}` : `【婉拒】了——請 narration ${_pvMulti ? '讓被點名的每一位都各依自己的個性給出婉拒的反應' : '依對方的個性演出婉拒的反應'}`}。是否動身由系統處理；narration 停在${_pvMulti ? '她們' : '對方'}給出回應的當下，【不可】演出發、走路或抵達。★成敗由系統定，別自行改寫${_pvMulti ? '她們' : '對方'}的決定。`;
      finalUserMsg = `【玩家意圖】：邀身旁的『${_pvHer}』現在一起去「${_pvLoc}」。`;
    } else if (!_pvIdxs.length) {
      kanshouPromiseStr += kanshouMissStr_('move', _pvLoc);
      finalUserMsg = `【玩家意圖】：想邀同伴一起去「${_pvLoc}」，卻發現身邊沒有人。`;
    } else {
      const _pvHer0 = _pvIdxs.map(i => String(pcData[i][COL.PC.NAME])).join('、');
      kanshouPromiseStr += _pvSameSpot
        ? `\n★【邀不成·你們就在這裡】：你正想邀『${_pvHer0}』一起去「${_pvLoc}」，才發現你們此刻【就站在那裡】——演出你話說到一半自己笑出來、把這句改成別的即可，沒有人要去哪裡。`
        : `\n★【邀不成·地點去不成】：你想邀『${_pvHer0}』一起去「${_pvLoc}」，但那裡此刻去不了(那是私人房間、還沒熟到能登門、或那個時段根本不開放)——演出你話到嘴邊又換了個說法即可，這趟沒有成行，不必解釋機制。`;
      finalUserMsg = `【玩家意圖】：想邀『${_pvHer0}』一起去「${_pvLoc}」，卻發現那裡此刻去不成。`;
      kanshouProposalResult_ = { ok: false, type: 'move_loc', name: _pvHer0, loc: _pvLoc, sameSpot: _pvSameSpot };
    }
  }

  let kanshouCohabitStr = "";
  if (userData.cohabitInvite) {
    const _chName = String(userData.cohabitInvite).trim();
    // 🆔 2026-07「整體重構·id優先」：同上，id對得上優先鎖定，找不到才退回別名比對。
    const _chId = String(userData.cohabitInviteId || "").trim();
    const _chIdx = _chName ? findPcRowIdx_(pcData, _myGid_, { id: _chId, name: _chName, faction: "從者", loc: curL, excludeIdx: pcIndex, nameCandidates: kanshouNameCandidates_ }) : -1;
    if (_chIdx === -1) {
      kanshouCohabitStr = kanshouMissStr_('cohabit', _chName);
      finalUserMsg = `【玩家意圖】：想邀『${_chName}』搬來一起住，卻發現對方不在身邊。`;
      kanshouProposalResult_ = { ok: false, miss: true, type: 'cohabit', name: _chName, where: _whereIsHer(_chName) };
    } else {
      const _chRealName = String(pcData[_chIdx][COL.PC.NAME]);
      if (kanshouIsCohabit_(pcData[_chIdx])) {
        kanshouCohabitStr = `\n★【已在同居】：『${_chRealName}』早就跟你住在同一個屋簷下了——演出對方面對這個明知故問、依性格給的反應(好笑/沒好氣/趁機撒嬌皆可)。`;
        finalUserMsg = `【玩家意圖】：又問了『${_chRealName}』要不要搬來一起住。`;
        _settledVerdict = `『${_chRealName}』早就跟你住在同一個屋簷下了`;
      } else if ((parseInt(pcData[_chIdx][COL.PC.BOND]) || 0) < KANSHOU_COHABIT_BOND_) {
        kanshouCohabitStr = `\n★【同居·婉拒】：你邀『${_chRealName}』搬來同住，但你們的關係還沒深到能同住一個屋簷下——演出對方依性格婉拒的反應(害羞岔開/認真說還太早/打趣帶過皆可)，這件事沒有成立、也沒有任何數值變動。`;
        finalUserMsg = `【玩家意圖】：鼓起勇氣邀『${_chRealName}』搬來一起住。`;
        _settledVerdict = `『${_chRealName}』婉拒了同住`;
        // 📣 走查抓到的資訊黑洞：舊版婉拒只有敘事、無機制回饋，玩家不知道是好感不足還是演出婉拒。
        kanshouProposalResult_ = { ok: false, type: 'cohabit', name: _chRealName };
      } else {
        pcData[_chIdx][COL.PC.MEMORY] = KANSHOU_COHABIT_TAG_.set(pcData[_chIdx][COL.PC.MEMORY], 1);
        pcData[_chIdx][COL.PC.MEMORY] = kanshouStampFirst_(pcData[_chIdx][COL.PC.MEMORY], '同居', curDay);
        dirtyPcRows.add(_chIdx);
        kanshouProposalResult_ = { ok: true, type: 'cohabit', name: _chRealName };
        kanshouCohabitStr = `\n★【同居開始】：『${_chRealName}』答應搬來與你同住了！從今以後對方深夜會回這個家的「和室」就寢、清晨可能還賴在被窩、晚間常在家中活動，白天依然過對方自己的生活——演出對方答應這一刻依性格的反應(欣喜/彆扭/故作平靜皆可)，這是關係的一大步。`;
        finalUserMsg = `【玩家意圖】：鼓起勇氣邀『${_chRealName}』搬來一起住。`;
        _settledVerdict = `『${_chRealName}』答應搬來同住了`;
      }
    }
  }

  // 💗 告白(關係中樞「向她告白」鈕→confess=name)：走跟同居同一條「當場裁定、當場落地」的管線——成敗由 kanshouConfessAccepts_ 依 好感×相處次數 擲定，AI 只演反應、不得改寫結果。
  let kanshouConfessStr = "";
  if (userData.confess) {
    const _cfName = String(userData.confess).trim();
    const _cfId = String(userData.confessId || "").trim();
    const _cfIdx = _cfName ? findPcRowIdx_(pcData, _myGid_, { id: _cfId, name: _cfName, faction: "從者", loc: curL, excludeIdx: pcIndex, nameCandidates: kanshouNameCandidates_ }) : -1;
    if (_cfIdx === -1) {
      kanshouConfessStr = kanshouMissStr_('confess', _cfName);
      finalUserMsg = `【玩家意圖】：想向『${_cfName}』告白，卻發現對方不在身邊。`;
      kanshouProposalResult_ = { ok: false, miss: true, type: 'confess', name: _cfName, where: _whereIsHer(_cfName) };
    } else {
      const _cfHer = String(pcData[_cfIdx][COL.PC.NAME]);
      const _cfBond = parseInt(pcData[_cfIdx][COL.PC.BOND]) || 0;
      const _cfMet = KANSHOU_MET_COUNT_TAG_.get(pcData[_cfIdx][COL.PC.MEMORY]);
      const _cfWait = kanshouConfessWait_(pcData[_cfIdx], curDay);
      if (kanshouIsLover_(pcData[_cfIdx])) {
        kanshouConfessStr = `\n★【已經在一起了】：你又向『${_cfHer}』說了一次喜歡——你們早就是戀人，這不是告白而是情話。演出對方依個性收下這句話的反應(嫌你肉麻／耳根紅／回敬一句皆可)。`;
        finalUserMsg = `【玩家意圖】：又對『${_cfHer}』說了一次喜歡。`;
        _settledVerdict = `『${_cfHer}』收下了這句情話，你們早就是戀人`;
      } else if (_cfWait > 0) {
        // 💔 冷卻期：不擲骰、不動數值，只演「話又吞回去」——按鈕在前端本來就會鎖，這裡是後端保險。
        kanshouConfessStr = `\n★【說不出口】：你想再對『${_cfHer}』說一次那句話，但前幾天才被對方拒絕過、此刻怎麼樣都開不了口——演出你把話吞回去、改口講了別的，以及對方察覺到你欲言又止時依個性的反應(裝作沒發現／追問／不自在皆可)。這次沒有告白，沒有任何數值變動。`;
        finalUserMsg = `【玩家意圖】：想再告白一次，話到嘴邊又吞了回去。`;
        _settledVerdict = `『${_cfHer}』只看到你欲言又止，這次沒有告白出口`;
        kanshouProposalResult_ = { ok: false, type: 'confess', name: _cfHer, wait: _cfWait, blocked: true };
      } else if (_cfBond < KANSHOU_CONFESS_BOND_) {
        kanshouConfessStr = `\n★【告白·被拒】：你向『${_cfHer}』告白了，但你們之間還遠不到那個程度——演出對方依個性拒絕的反應(錯愕／認真說我們還不夠了解彼此／笑著當成玩笑帶過皆可)，這次不成立，不必替玩家找補。`;
        finalUserMsg = `【玩家意圖】：鼓起勇氣向『${_cfHer}』告白。`;
        _settledVerdict = `『${_cfHer}』沒有答應`;
        kanshouProposalResult_ = { ok: false, type: 'confess', name: _cfHer };
      } else if (kanshouConfessAccepts_(_cfBond, _cfMet)) {
        // 💗 成立：先蓋【戀人】(告白牆的鑰匙)，再把好感推過門檻，最後照既有漏斗同步標籤/棘輪。
        pcData[_cfIdx][COL.PC.MEMORY] = KANSHOU_LOVER_TAG_.set(pcData[_cfIdx][COL.PC.MEMORY], 1);
        pcData[_cfIdx][COL.PC.MEMORY] = KANSHOU_CONFESS_DAY_TAG_.set(pcData[_cfIdx][COL.PC.MEMORY], 0);
        pcData[_cfIdx][COL.PC.MEMORY] = kanshouStampFirst_(pcData[_cfIdx][COL.PC.MEMORY], '告白', curDay);
        pcData[_cfIdx][COL.PC.BOND] = Math.max(_cfBond, KANSHOU_REL_TIER_[0].min);
        kanshouSyncRelTier_(pcData, _cfIdx);
        dirtyPcRows.add(_cfIdx);
        kanshouProposalResult_ = { ok: true, type: 'confess', name: _cfHer };
        kanshouConfessStr = `\n★【告白·成立】：『${_cfHer}』答應了——從這一刻起你們是戀人。演出對方點頭那一瞬間依個性的反應(眼眶紅／彆扭地別開臉／故作鎮定卻聲音在抖皆可)，並讓這一回合停在剛在一起的餘韻裡，別急著跳到之後的日子。★這是關係的質變，不是又一次閒聊。`;
        finalUserMsg = `【玩家意圖】：鼓起勇氣向『${_cfHer}』告白。`;
        _settledVerdict = `『${_cfHer}』答應了，你們成為戀人`;
      } else {
        // 💔 被拒：扣既有的橋段增量(棘輪仍會把她接在已達門檻之上，不會一路崩)，並蓋冷卻日。
        pcData[_cfIdx][COL.PC.BOND] = Math.max(0, _cfBond - KANSHOU_SCENE_BOND_);
        pcData[_cfIdx][COL.PC.MEMORY] = KANSHOU_CONFESS_DAY_TAG_.set(pcData[_cfIdx][COL.PC.MEMORY], curDay);
        kanshouSyncRelTier_(pcData, _cfIdx);
        dirtyPcRows.add(_cfIdx);
        kanshouProposalResult_ = { ok: false, type: 'confess', name: _cfHer, wait: KANSHOU_CONFESS_COOLDOWN_ };
        kanshouConfessStr = `\n★【告白·被拒】：你向『${_cfHer}』告白了，對方沒有答應——不是討厭你，是對方此刻還沒辦法把你放在那個位置上。演出對方依個性說出口的拒絕(抱歉而認真／慌張逃開／硬邦邦地否認皆可)，以及被拒之後空氣裡那份尷尬；這一回合就停在這裡，別讓對方自己反悔改口。★成敗由系統定，不可改寫對方的決定。`;
        finalUserMsg = `【玩家意圖】：鼓起勇氣向『${_cfHer}』告白。`;
        _settledVerdict = `『${_cfHer}』沒有答應`;
      }
    }
  }

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
      // 🆔 2026-07「整體重構·id優先」：同上，id對得上優先鎖定，找不到才退回別名比對。
      const _hhId = String(userData.handHoldId || "").trim();
      const _hhIdx = findPcRowIdx_(pcData, _myGid_, { id: _hhId, name: _hhArg, faction: "從者", loc: curL, excludeIdx: pcIndex, nameCandidates: kanshouNameCandidates_ });
      if (_hhIdx === -1) {
        kanshouHandHoldStr = kanshouMissStr_('hold', _hhArg);
        finalUserMsg = `【玩家意圖】：想牽『${_hhArg}』的手，卻發現對方不在身邊。`;
        kanshouProposalResult_ = { ok: false, miss: true, type: 'hold', name: _hhArg, where: _whereIsHer(_hhArg) };
      } else {
        const _hhName = String(pcData[_hhIdx][COL.PC.NAME]);
        const _hhBond = parseInt(pcData[_hhIdx][COL.PC.BOND]) || 0;
        const _hhPrevN = KANSHOU_HANDHOLD_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]);
        const _hhSwitch = (_hhPrevN && !kanshouNameCandidates_(_hhName).includes(_hhPrevN)) ? _hhPrevN : "";
        // 牽手tag存在玩家自己列(pcIndex)、值=她的名字；接受與否由AI判定，接受後才在post-AI區寫回。
        _pendingProposal = { type: 'hold', idx: pcIndex, herIdx: _hhIdx, name: _hhName, accepted: kanshouProposalAccepts_('hold', _hhBond) };
        kanshouHandHoldStr = `\n★【提議·牽手·系統已裁定】你伸手想牽起『${_hhName}』的手。系統已依好感(${_hhBond}/100)裁定對方${_pendingProposal.accepted ? `【讓你牽了】——narration 必須真實演出【對方的手交到你手中／你們牽起手】的那一刻(不可只碰衣角、拉衣袖之類含糊帶過——那不算牽手)，語氣依其個性（大方／害羞／彆扭皆可）；對方接受後，之後你移動對方會相伴同行(直到放手)${_hhSwitch ? `。★同時：你原本牽著的是『${_hhSwitch}』的手，這一牽等於當著對方的面鬆開了對方——narration 必須把這個鬆手先演出來(一個動作或一個眼神都好)、並讓『${_hhSwitch}』依對方的個性有所反應，不可讓對方的手憑空消失` : ''}` : '【收回了手】——narration 依其個性演出對方收手／避開、沒牽成的反應，不必替玩家找補'}。★成敗由系統定，別自行改寫對方的決定。`;
        finalUserMsg = `【玩家意圖】：伸手想牽起『${_hhName}』的手。`;
      }
    }
  }
  // 牽手中的對象名(供移動帶人＋提示詞氛圍)——每回合讀一次現值。let：結束一天會自然放手(下方 endDay)。
  let kanshouHeldName_ = KANSHOU_HANDHOLD_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]);
  // 🤝 不同地自動放手(不變量·玩家實測「她跑掉了卻還牽著、重逢自動續牽、移動硬拖人」)：牽手是「此刻牽著」的狀態——她因任何原因(作息/離場/舊版bug殘留)已不在你身邊，就自然鬆開。
  if (kanshouHeldName_) {
    const _heldHere = pcData.some((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(kanshouHeldName_) && String(r[COL.PC.LOC] || "").trim() === String(pcData[pcIndex][COL.PC.LOC] || "").trim());
    if (!_heldHere) {
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_HANDHOLD_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');
      kanshouHeldName_ = '';
      dirtyPcRows.add(pcIndex);
    }
  }
  const kanshouArrivingNames_ = !moveTarget ? []
    : userData.moveWithCompanion
      ? pcData.filter(r => r !== pc && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()).map(r => String(r[COL.PC.NAME]))
      : (kanshouHeldName_ ? [kanshouHeldName_] : []);
  function kanshouIsAwakeWithMe_(idx) {
    const row = pcData[idx];
    const name = String(row[COL.PC.NAME]);
    const loc = String(row[COL.PC.LOC] || "").trim();
    const _isNow = (kanshouHeldName_ && kanshouNameCandidates_(name).includes(kanshouHeldName_)) || kanshouArrivingNames_.some(n => kanshouNameCandidates_(name).includes(String(n)));
    const _tagLoc = KANSHOU_AWAKE_HERE_TAG_.get(row[COL.PC.MEMORY]);
    const _awake = _isNow || (!!_tagLoc && _tagLoc === loc);
    const _newTagVal = _awake ? loc : '';
    if (_newTagVal !== (_tagLoc || '')) {
      pcData[idx][COL.PC.MEMORY] = KANSHOU_AWAKE_HERE_TAG_.set(row[COL.PC.MEMORY], _newTagVal);
      dirtyPcRows.add(idx);
    }
    return _awake;
  }

  // 🤝 結識(巧遇→入駐)：巧遇對象只是路人(不記好感·離開即散)，玩家點「結識」(inviteResident=name)才正式建列入駐——驗證對象必須真的是【邂逅中】的那位(防直打API憑空加人)、且尚未入駐。
  let kanshouInviteStr = "";
  if (userData.inviteResident) {
    const _ivName = String(userData.inviteResident).trim();
    const _ivActiveId = getKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY]);
    const _ivHero = _ivActiveId ? SEED_SERVANTS.find(h => h.id === _ivActiveId) : null;
    const _ivMatch = _ivHero && kanshouNameCandidates_(_ivHero.realName).includes(_ivName);
    const _ivAlready = _ivMatch && pcData.some((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(_ivHero.realName));
    const _ivMaleMale = _ivMatch && String(pc[COL.PC.SEX]) === "男" && String(_ivHero.gender) === "男";
    if (!_ivMatch || _ivAlready || _ivMaleMale) {
      kanshouInviteStr = kanshouMissStr_('invite', _ivName);
      finalUserMsg = `【玩家意圖】：想跟『${_ivName}』深交，卻發現緣分沒有接上。`;
    } else {
      const _ivCodexRow = getHeroCodexCached().slice(1).find(r => String(r[COL.HERO.ID]) === String(_ivHero.id));
      if (_ivCodexRow) {
        const _ivNewRow = heroToKanshouRow_(_ivCodexRow, myGameId, String(curL || "").trim(), curDay);
        _pendingNewPcRow_ = _ivNewRow;
        pcData.push(_ivNewRow); // 本回合就地生效：partyRows/在場卡片馬上抓得到她
        pcData[pcIndex][COL.PC.MEMORY] = clearKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY]); // 她不再是「路人例外」，改走正式在場人物
        dirtyPcRows.add(pcIndex);
        kanshouInviteStr = `\n★【正式結識】：你與『${kanshouCasualOf_(_ivHero)}』交換了聯絡方式，這段萍水相逢的緣分正式接上了——從今以後對方也是這座城裡你認識的人，會有自己的生活與去處。演出這一刻依對方性格的反應(大方/靦腆/意外皆可)，關係才剛起步、保持剛認識的分寸。`;
        finalUserMsg = `【玩家意圖】：鼓起勇氣向『${kanshouCasualOf_(_ivHero)}』提出想繼續深交、交換聯絡方式。`;
        _settledVerdict = `『${kanshouCasualOf_(_ivHero)}』同意交換聯絡方式，這段緣分正式接上了`;
      }
    }
  }

  // 🎭 情境氛圍(2026-07 玩家「橋段太過生硬」根治改版)：舊版是「跳按鈕→玩家點→GAS骰走向→AI照劇本演」的四段式 apparatus，選單感重、且同好感區間每次演出雷同(branches[].tag 是寫死的劇本)。
  const kanshouSceneLoc_ = moveTarget ? moveName : curL;
  let _reHourAfter = curHour;
  if (userData.endDay === true) _reHourAfter = 6;
  else if (userData.jumpBand) { const _rb = KANSHOU_TIME_BANDS_.find(b => b.key === String(userData.jumpBand)); if (_rb) _reHourAfter = _rb.startHour; }
  else if (parseFloat(userData.advanceHours) > 0) _reHourAfter = ((curHour + parseFloat(userData.advanceHours)) % 24 + 24) % 24;
  else if (userData.jumpFestival) _reHourAfter = 6; // 跳節慶恆落在前一天清晨6點(kanshouHoursUntilDate_ 的落點)
  else if (curHour < KANSHOU_DAY_LAST_HOUR_) _reHourAfter = Math.min(KANSHOU_DAY_LAST_HOUR_, curHour + KANSHOU_HOUR_PER_ACTION_);
  const kanshouReBand_ = timeBand_(_reHourAfter);
  // 🏠 玩家自己的居所(同居日常的舞台)：家中各處＋玩家房間。與「她的住處」(region 'visit')是兩回事。
  const kanshouPlayerHomeLocs_ = KANSHOU_LOCATIONS_.filter(l => l.region === 'home').map(l => l.name).concat(['我的房間']);
  let kanshouSceneKey_ = null;
  const kanshouReDate_ = kanshouAbsDayToDate_(curDay);
  const kanshouReFest_ = KANSHOU_FESTIVALS_.find(f => f.month === kanshouReDate_.month && f.day === kanshouReDate_.day) || null;
  // 🎊 節慶【已移出這條優先鏈】：改走下方獨立的 kanshouFestivalStr。
  {
    const _locEv = KANSHOU_LOCATION_EVENTS_[kanshouSceneLoc_];
    if (_locEv && _locEv.bands.indexOf(kanshouReBand_) >= 0) kanshouSceneKey_ = _locEv.eventKey;
  }
  let _sceneIsCohabit_ = false;
  if (!kanshouSceneKey_ && kanshouPlayerHomeLocs_.indexOf(kanshouSceneLoc_) >= 0) {
    const _coEvKey = KANSHOU_COHABIT_EVENTS_[kanshouReBand_];
    if (_coEvKey) { kanshouSceneKey_ = _coEvKey; _sceneIsCohabit_ = true; }
  }
  let kanshouSceneAmbientStr = "";
  if (kanshouSceneKey_) {
    const _ev = KANSHOU_SCENE_EVENTS_[kanshouSceneKey_];
    const _sceneNames = [];
    pcData.forEach((r, i) => {
      if (i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_")
        && String(r[COL.PC.LOC] || "").trim() === kanshouSceneLoc_ && (!_sceneIsCohabit_ || kanshouIsCohabit_(r))) _sceneNames.push(String(r[COL.PC.NAME]));
    });
    if (_ev && _ev.ambient && _sceneNames.length) {
      kanshouSceneAmbientStr = `\n★【此地此刻·情境事實】：${_sceneNames.join('、')}——${_ev.ambient}。這只是眼下的客觀情境，【不是】既定劇情：要不要理會、想怎麼互動，全部由玩家自己決定。只需讓這個情境自然存在於場景描寫裡，【不可】替玩家做決定、不可推著玩家行動、更不可自行把事情演完。`;
    }
  }

  let kanshouKnockGuestName = "";
  let kanshouKnockRaidStr = "";
  if (_knockGuestReq_) {
    const guestName = String(_knockGuestReq_).trim();
    const guestIdx = pcData.findIndex(r => kanshouNameCandidates_(r[COL.PC.NAME]).includes(guestName) && String(r[COL.PC.LOC] || "").trim() !== curL && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
    if (guestIdx !== -1) {
      pcData[guestIdx][COL.PC.LOC] = curL;
      pcData[guestIdx][COL.PC.MEMORY] = KANSHOU_AWAKE_HERE_TAG_.set(pcData[guestIdx][COL.PC.MEMORY], curL);
      dirtyPcRows.add(guestIdx);
      kanshouKnockGuestName = String(pcData[guestIdx][COL.PC.NAME]);
      finalUserMsg = `【玩家意圖】：打開了門，是「${kanshouKnockGuestName}」深夜來訪。`;
      // 🌙 2026-07 玩家「能不能也設計一個被夜襲的橋段呢」——夜襲的鏡像版：不是玩家去找她，是她主動來敲玩家的門。
      const _kgBond = parseInt(pcData[guestIdx][COL.PC.BOND]) || 0;
      if (_kgBond >= KANSHOU_KNOCK_MIN_BOND_ && Math.random() < KANSHOU_KNOCK_RAID_CHANCE_) {
        kanshouKnockRaidStr = `\n★【深夜訪客「${kanshouKnockGuestName}」·別有用心(對方這次登門不只是單純想聊聊，帶著幾分主動靠近你的心思，沒有固定台詞，依對方性格自由發揮)】：${kanshouAsleepOutcomeStr_(_kgBond)}。要不要挑明、怎麼發展，全由你依對方性格拿捏。`;
        if (KANSHOU_SCENE_DAY_TAG_.get(pcData[guestIdx][COL.PC.MEMORY]) !== curDay) {
          pcData[guestIdx][COL.PC.BOND] = Math.min(100, _kgBond + KANSHOU_SCENE_BOND_);
          kanshouSyncRelTier_(pcData, guestIdx);
          kanshouKnockRaidStr += `（這樣一段特別的相處，讓你們的關係又近了一些——好感已由系統上調，敘事勿再另計。）`;
        }
        pcData[guestIdx][COL.PC.MEMORY] = KANSHOU_SCENE_DAY_TAG_.set(pcData[guestIdx][COL.PC.MEMORY], curDay);
      }
    }
  }

  // 結束一天：忽略玩家打的文字，改用系統組好的合成訊息——複用actionPlay整條既有敘事管線(在場驗證/NSFW規則/rel_changes/intimacy_feedback全部照常跑)，不另開一條平行路徑。
  let kanshouGuestSentHome_ = "";
  if (userData.dismissGuest) {
    const _dgName = KANSHOU_NIGHT_GUEST_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]);
    const _dgIdx = _dgName ? pcData.findIndex((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(_dgName)) : -1;
    if (_dgIdx !== -1) {
      pcData[_dgIdx][COL.PC.LOC] = kanshouGetHeroHome_(kanshouHeroIdByName_(String(pcData[_dgIdx][COL.PC.NAME])), pcData[_dgIdx][COL.PC.MEMORY]);
      pcData[_dgIdx][COL.PC.MEMORY] = KANSHOU_AWAKE_HERE_TAG_.set(pcData[_dgIdx][COL.PC.MEMORY], '');
      dirtyPcRows.add(_dgIdx);
      kanshouGuestSentHome_ = String(pcData[_dgIdx][COL.PC.NAME]);
      finalUserMsg = `【玩家意圖】：送『${kanshouGuestSentHome_}』回去之後，自己也準備歇下了。`;
    }
  }
  // 這次來訪就此結束(留下過夜／送她回去／單純結束一天 都算)——清掉夜訪客標記，善後選項不再出現。
  if (userData.endDay === true || userData.dismissGuest) {
    if (KANSHOU_NIGHT_GUEST_TAG_.get(pcData[pcIndex][COL.PC.MEMORY])) {
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_GUEST_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');
      dirtyPcRows.add(pcIndex);
    }
  }

  let intimateNightNames = [];
  // 🌙 昨夜道別(2026-07 玩家實測「好感沒80，牽手睡覺 NPC 會自己回家？
  let kanshouNarrDay_ = null, kanshouNarrHour_ = null;
  let kanshouNightPartStr = "";
  let kanshouClockMoved_ = false; // 結束一天/時段跳躍已自行設時鐘→標記，避免下方每回合流動又加一次
  // 🌙 兩段式就寢·第一段：按下「睡覺」時若身邊有羈絆已深(≥80)的人、且還沒進過深夜段落 →【不結束這一天】，改成把時間推到就寢時刻、進入「夜未眠」。
  let kanshouNightSceneNames_ = [];
  if (userData.endDay === true && !kanshouNightSceneOn_) {
    kanshouNightSceneNames_ = pcData.filter((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者"
      && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_")
      && (parseInt(r[COL.PC.BOND]) || 0) >= KANSHOU_KNOCK_MIN_BOND_
      && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()).map(r => String(r[COL.PC.NAME]).trim());
    if (kanshouNightSceneNames_.length) {
      userData.endDay = false;                       // 這一按不結束一天
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_SCENE_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], curDay);
      if (timeBand_(curHour) !== '夜' && timeBand_(curHour) !== '深夜') curHour = KANSHOU_DAY_LAST_HOUR_;
      kanshouClockMoved_ = true;
      pcData[pcIndex][COL.PC.HOUR] = curHour;
      finalUserMsg = `【玩家意圖】：夜深了，你和『${kanshouNightSceneNames_.join('、')}』留在這個房間裡，沒有要就此睡去的意思。`;
    }
  }
  if (userData.endDay === true) {
    // 🛏️ 結束一天＝睡到「即將到來的清晨6點」：凌晨(深夜0~5點)睡下→【同一天】的6點——跨日已在「夜→深夜(00:00)」那一步發生過了；晚上睡下才是隔天6點。
    const _nightDay = curDay; // 同床發生在「睡下去」的那一天(遞增前)——【初次】記帳要記那天，不是醒來那天
    // 🕰️→✅ 2026-07 玩家「那我按睡到天亮會有甚麼事情.....」：狀態必須推進到隔天 6:00(眾人重骰行程/日閘門全部依賴它)，但【這一回合要演的是睡下去的那個當下】。
    pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_SCENE_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], 0);
    kanshouNarrDay_ = curDay;
    // 敘事時刻＝「就寢的那一刻」，不是按下按鈕的那一刻。
    kanshouNarrHour_ = (timeBand_(curHour) === '夜' || timeBand_(curHour) === '深夜') ? curHour : KANSHOU_DAY_LAST_HOUR_;
    if (curHour >= 6) curDay = curDay + 1;
    curHour = 6;
    kanshouClockMoved_ = true;
    pcData[pcIndex][COL.PC.DAY] = curDay;
    pcData[pcIndex][COL.PC.HOUR] = curHour;
    const allEstablished = pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
    intimateNightNames = allEstablished.filter(r => (parseInt(r[COL.PC.BOND]) || 0) >= 80 && String(r[COL.PC.LOC] || "").trim() === curL).map(r => r[COL.PC.NAME]);
    if (intimateNightNames.length) {
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], intimateNightNames.join('、'));
      // 💞 第一次同床：記在她那一列(intimateNightNames 取自 COL.PC.NAME 原值，故可直接精確比對)。
      pcData.forEach((r, idx) => {
        if (idx !== pcIndex && intimateNightNames.indexOf(r[COL.PC.NAME]) !== -1) {
          pcData[idx][COL.PC.MEMORY] = kanshouStampFirst_(pcData[idx][COL.PC.MEMORY], '同床', _nightDay);
          dirtyPcRows.add(idx);
        }
      });
    }
    // 玩家自己不管白天晃到哪，結束一天一律強制拉回自己房間——「玩家永遠有路可退」的安全閥。
    const kanshouMyRoomLoc_ = '我的房間';
    pcData[pcIndex][COL.PC.LOC] = kanshouMyRoomLoc_;
    dirtyPcRows.add(pcIndex);
    pcData[pcIndex][COL.PC.MEMORY] = clearKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY]);
    // 🌙 誰在你身邊、卻不留下過夜——用回合開始時的同地快照(kanshouWithMeAtStart_)扣掉留宿名單，而不是重新掃 LOC：這一行以上 intimateNightNames 已算完但人還沒被骰走，只有那份快照能回答「她剛才確實在你旁邊」。
    const _partNames = kanshouWithMeAtStart_.filter(n => intimateNightNames.indexOf(n) === -1);
    if (_partNames.length) {
      const _partHeld = kanshouHeldName_ && _partNames.some(n => kanshouNameCandidates_(n).includes(kanshouHeldName_));
      kanshouNightPartStr = `\n★【夜裡道別】：夜深了，你要歇下，而『${_partNames.join('、')}』今晚不留在這裡——本回合最後一次讓要走的人開口道別，依各自個性演出這一刻(依依不捨／匆匆丟下一句就走／嘴上說得輕鬆皆可)${_partHeld ? `；其中『${kanshouHeldName_}』的手還牽著，必須先演出鬆開的那一下再讓對方走` : ''}。道別完這些人就不在場了，之後任何回合一律禁止再讓這些人開口或被觸碰。`;
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_PART_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], _partNames.join('、'));
    }
    // 🤝 睡覺自然放手：牽手不跨夜(同床是同床、不是牽著手到天亮)，結束一天一律鬆開，避免隔天還掛著昨天的牽手標記。
    if (kanshouHeldName_) { pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_HANDHOLD_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], ''); kanshouHeldName_ = ''; }
    curL = kanshouMyRoomLoc_;
    allEstablished.forEach(r => {
      const idx = pcData.indexOf(r);
      // 優先序：同床過夜(留玩家房間) > 今天有約(釘約定地點守著) > 照常骰行程(同居者走同居版)。curDay已是隔天。
      pcData[idx][COL.PC.LOC] = intimateNightNames.includes(r[COL.PC.NAME]) ? kanshouMyRoomLoc_ : (kanshouPromisePin_(r, curDay, curHour) || kanshouRollDailyLocation_(r[COL.PC.NAME], curHour, kanshouIsCohabit_(r), r[COL.PC.MEMORY]));
      dirtyPcRows.add(idx);
    });
    finalUserMsg = `【一天結束】夜幕降臨，${intimateNightNames.length ? `跟『${intimateNightNames.join('、')}』一起` : ""}回到房間安頓下來，今天到此為止，明天又是新的一天。`;
  } else {
    let advanceHours = Math.max(0, Math.min(parseFloat(userData.advanceHours) || 0, 24 * 365 * 3)); // parseFloat：支援「跳到約定前10分」的小數時數
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
      pcData[pcIndex][COL.PC.MEMORY] = clearKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY]);
      // ⏩ 這是玩家【主動按鈕跳時段/節慶】的刻意時間快轉——跟「每回合被動+0.5h流動」(§122，那條根本不重骰任何人)不同：玩家選擇快轉數小時，不在身邊的人依新時刻重骰去向，讓世界動起來。
      const allEstablishedForTime = pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
      allEstablishedForTime.forEach(r => {
        const idx = pcData.indexOf(r);
        if (String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()) return;
        // 今天有約→釘在約定地點守著；沒約→照常骰(同居者走同居版)。curDay已是推進後的日期。
        pcData[idx][COL.PC.LOC] = kanshouPromisePin_(r, curDay, curHour) || kanshouRollDailyLocation_(r[COL.PC.NAME], curHour, kanshouIsCohabit_(r), r[COL.PC.MEMORY]);
        dirtyPcRows.add(idx);
      });
      const newDate = kanshouAbsDayToDate_(curDay);
      const _jumpSceneBreak = `（★這是時間快轉後的【全新場景·換幕】：直接寫此刻新時段的當下光景，【絕對禁止】接續、複述或重演上一段已經發生的動作與對話——那些都已經過去了。若剛才在一起的人此刻已依作息離開，就自然演出你獨自或身邊換了人的當下。）`;
      finalUserMsg = (jumpFest
        ? `【時間推進】時間一路快轉，明天就是${jumpFest.name}了——此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${kanshouFmtHM_(curHour)}・${timeBand_(curHour)}。`
        : jumpBand
          ? `【時間推進】時間悄悄流轉到了${jumpBand.label}，此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${kanshouFmtHM_(curHour)}・${timeBand_(curHour)}。`
          : `【時間推進】${advanceHours}個小時悄悄過去，此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${kanshouFmtHM_(curHour)}・${timeBand_(curHour)}。`) + _jumpSceneBreak;
    }
  }
  // ⏰ 時間隨動作流動：一般 AI 敘事回合(非結束一天/非時段跳躍)每次推進 KANSHOU_HOUR_PER_ACTION_ 小時，讓聊天/移動/拍照/橋段等按鍵都會讓時鐘往前走，消除「到處跑卻永遠6點」的凍結感。
  let kanshouBandCrossed_ = false; // 被動流動跨過時段邊界→下方「作息自然告辭」用
  if (!kanshouClockMoved_ && curHour < KANSHOU_DAY_LAST_HOUR_) {
    const _pbBand = timeBand_(curHour);
    curHour = Math.min(KANSHOU_DAY_LAST_HOUR_, curHour + KANSHOU_HOUR_PER_ACTION_);
    pcData[pcIndex][COL.PC.HOUR] = curHour;
    dirtyPcRows.add(pcIndex);
    kanshouBandCrossed_ = timeBand_(curHour) !== _pbBand;
  }
  // 供下方🕰️提示詞用，只算一次不重複呼叫。★讀敘事時鐘而非狀態時鐘——兩者只有 endDay 會不同。
  const _narrDay_ = (kanshouNarrDay_ === null) ? curDay : kanshouNarrDay_;
  const _narrHour_ = (kanshouNarrHour_ === null) ? curHour : kanshouNarrHour_;
  const curDateObj_ = kanshouAbsDayToDate_(_narrDay_);

  // 🎨 2026-07「為何偶遇沒有女性」玩家反映：此局已經正式召喚過的英靈(不論是否仍同行)不該又以「陌生人」身分重複出現(如SABER已同行時，路上不該再巧遇一位不具名的SABER)。
  const kanshouEstablishedNames_ = new Set(pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r)).map(r => String(r[COL.PC.NAME]).trim()));
  const kanshouExcludeIds_ = SEED_SERVANTS.filter(h => kanshouNameCandidates_(h.realName).some(c => kanshouEstablishedNames_.has(c))).map(h => h.id);

  // 移動時若目的地已經有established的人在，就不再另外擲一次陌生人巧遇(優先呈現熟人在場)。
  const kanshouSomeoneAlreadyHere_ = pcData.some((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() === String(moveName || curL || "").trim());

  // 合法地點時才寫入LOC＋抽選巧遇＋記錄邂逅名單。
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
    kanshouEncounterHero = (encounterOn && !moveTarget.noEncounter && !kanshouSomeoneAlreadyHere_) ? kanshouRollEncounter_(moveTarget.name, kanshouExcludeIds_) : null;
    if (kanshouEncounterHero) {
      pcData[pcIndex][COL.PC.MEMORY] = setKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY], kanshouEncounterHero.id);
    }
    kanshouEventSeed = kanshouRollEvent_(driveOn);
  } else {
    const curLocDef = KANSHOU_LOCATIONS_.find(l => l.name === String(curL || "").trim());
    if (curLocDef) {
      const activeId = getKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY]);
      if (activeId) {
        kanshouEncounterLocName = curLocDef.name;
        kanshouEncounterHero = SEED_SERVANTS.find(h => h.id === activeId) || null;
      } else if (encounterOn && !curLocDef.noEncounter && !kanshouSomeoneAlreadyHere_ && userData.lookAround === true) {
        // 前端明確的「看看四周」按鈕(lookAround:true)。
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


  function relMemMemoryStr_(relMem) {
    const s = String(relMem || "");
    const nickMatch = s.match(/\[專屬稱呼\](.*?)(?=\| \[|$)/);
    const nickTrim = nickMatch ? nickMatch[1].trim() : "";
    const nickStr = (nickTrim && nickTrim !== "無") ? ` [專屬稱呼:${nickTrim}]` : "";
    // 態度：NPC對御主當下的臨場態度(與好感分開追蹤，見慾海律令第5條)，讓AI下筆前看得到自己上一輪演的態度，不會忽冷忽熱亂跳。
    return nickStr;
  }

  // 🚶‍♀️ 作息自然告辭(玩家實測「NPC 不會自己離開?」)：npc_exit 靠 AI 自發填＝Gemini 從不填(同move_proposal 教訓)，作息重骰又只在結束一天/跳時段——一般聊天流程裡在場者永不離場。
  let kanshouNpcLeaveStr_ = "";
  if (kanshouBandCrossed_) {
    const _lvNames = [];
    pcData.forEach((r, i) => {
      if (i === pcIndex || String(r[COL.PC.FACTION]) !== "從者" || !sameGame(r) || String(r[COL.PC.ID]).startsWith("DEAD_")) return;
      if (String(r[COL.PC.LOC] || "").trim() !== String(curL || "").trim()) return;
      const _nm = String(r[COL.PC.NAME]);
      if (kanshouHeldName_ && kanshouNameCandidates_(_nm).includes(kanshouHeldName_)) return; // 牽手中＝她選擇留下
      if (kanshouPreMoveCompanions_.some(cr => String(cr[COL.PC.NAME]).trim() === _nm.trim())) return; // 剛跟你一起走來
      // 玩家本回合正對她提議(相約/牽手/同去·_pendingProposal)——她留下聽完回應：否則被動+10分恰跨時段時，AI 同回合收到「向她提議」＋「她已告辭」兩條矛盾指令，接受還會把牽手/同去落到已離場的人身上。
      if (_pendingProposal) {
        const _ppNs = _pendingProposal.names || [String(_pendingProposal.name || pcData[_pendingProposal.idx][COL.PC.NAME] || "")];
        if (_ppNs.some(n => n && kanshouNameCandidates_(_nm).includes(String(n)))) return;
      }
      const _newLoc = String(kanshouPromisePin_(r, curDay, curHour) || kanshouRollDailyLocation_(_nm, curHour, kanshouIsCohabit_(r), r[COL.PC.MEMORY]) || "").trim();
      if (_newLoc && _newLoc !== String(curL || "").trim()) {
        pcData[i][COL.PC.LOC] = _newLoc;
        dirtyPcRows.add(i);
        _lvNames.push(_nm);
      }
    });
    if (_lvNames.length) kanshouNpcLeaveStr_ = `\n★【自然告辭·作息】：時段來到${timeBand_(curHour)}，『${_lvNames.join('、')}』到了該走的時間——本回合最後一次允許要走的人開口道別(若剛才有肢體接觸/牽制/擁抱，先演出中斷再道別)，之後這些人就不在場了。★不在場的人，之後任何回合一律禁止捏造對方開口、被觸碰、或仍在場，沒有例外。`;
  }

  // 📅 赴約/爽約結算 2.0(時間×地點驅動)：【必須在 partyRows 之前】——命中赴約會把她 pin 到 curL 讓她登場，這一步要先於在場名單計算，AI 才拿得到「她來了」的在場卡(否則純聊天/拍照這種不重骰位置的路徑，partyRows 會在她被拉來之前就定案、AI 完全不知道她到了)。
  let kanshouPromiseMetStr = "";
  let kanshouPromiseWait_ = null; // {name,loc,apptLabel,targetHour}：太早到→前端等待框
  const kanshouApptTodoArr_ = []; // 今天有約但還沒赴的：{name,loc,at}，見下方結算迴圈
  let kanshouPromiseSettle_ = []; // [{ok,type:'promise_met'|'promise_missed'|'promise_byher',name,loc}, ...]
  // 📅 豁免掉的約(人就在你身邊/她單方面約的)：先記名字，待 partyMembers 算出後依在場過濾成句。
  const kanshouApptWaivedArr_ = [];
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
      pcData[i][COL.PC.MEMORY] = kanshouStampFirst_(pcData[i][COL.PC.MEMORY], '約會', curDay); // 💞 第一次赴約(準時/遲到都算)
      dirtyPcRows.add(i);
      kanshouPromiseMetStr += note;
      kanshouPromiseSettle_.push({ ok: true, type: 'promise_met', name: _her, loc: _pr.loc });
    };
    const _standUp = () => {
      // 🧠→✅ 人類邏輯稽核抓到：「她整晚睡在你旁邊，系統卻記下我讓她空等了一場」。
      if (_pr.byHer
        || String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()
        || kanshouWithMeAtStart_.indexOf(String(r[COL.PC.NAME]).trim()) !== -1) {
        pcData[i][COL.PC.MEMORY] = kanshouClearPromise_(pcData[i][COL.PC.MEMORY]);
        dirtyPcRows.add(i);
        kanshouApptWaivedArr_.push({ name: _her, loc: _pr.loc });
        return;
      }
      pcData[i][COL.PC.MEMORY] = kanshouClearPromise_(pcData[i][COL.PC.MEMORY]);
      pcData[i][COL.PC.BOND] = Math.max(0, (parseInt(r[COL.PC.BOND]) || 0) - 5);
      pcData[i][COL.PC.MEMORY] = KANSHOU_CHILL_DAY_TAG_.set(pcData[i][COL.PC.MEMORY], curDay); // 🧊 放她鴿子＝明確的不愉快
      kanshouSyncRelTier_(pcData, i);
      dirtyPcRows.add(i);
      kanshouPromiseSettle_.push({ ok: false, type: 'promise_missed', name: _her, loc: _pr.loc });
      // 💔 她要「記得」被放鴿子(玩家實測：系統扣了好感、她卻渾然不知還演「我照約來了」)：爽約寫進共同回憶(用第二人稱稱玩家·比照 memoir 鐵則)，之後每回合經 partyDetailsArr 餵給 AI，她才演得出在意/彆扭，也給玩家道歉挽回的戲肉。
      const _missBandL = _pr.band ? ((KANSHOU_APPT_BANDS_.find(b => b.band === _pr.band) || {}).label || "") : "";
      const _missLine = `你爽約了——說好${_missBandL}在「${_pr.loc}」見面卻沒去，讓對方空等了一場`;
      const _oldMemoir2 = String(pcData[i][COL.PC.MEMOIR] || "").trim();
      if (_oldMemoir2.indexOf(_missLine) === -1) pcData[i][COL.PC.MEMOIR] = _oldMemoir2 ? (_oldMemoir2 + "｜" + _missLine) : _missLine;
    };
    if (_pr.day === curDay) {
      // 🚶‍♀️→✅ 2026-07 玩家「沒有根絕方式嗎…感覺可以讓她時間快到的時候出現在約會地點」：根因是「同地點的人永遠不會被重骰」，所以她可以被牽著走一整天、直接錯過自己的約。
      if (_ah !== null && !_atApptLoc && curHour >= _ah - KANSHOU_APPT_LEAVE_EARLY_ && curHour < _ah + 2
        && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()) {
        pcData[i][COL.PC.LOC] = _pr.loc;
        pcData[i][COL.PC.MEMORY] = KANSHOU_AWAKE_HERE_TAG_.set(pcData[i][COL.PC.MEMORY], '');
        dirtyPcRows.add(i);
        // 她走了就不再算「一直陪著你」——否則之後真的沒去，爽約豁免會誤放行。
        const _wi = kanshouWithMeAtStart_.indexOf(String(r[COL.PC.NAME]).trim());
        if (_wi !== -1) kanshouWithMeAtStart_.splice(_wi, 1);
        // 🤝 牽著手也得放開：人要先走了。
        if (kanshouHeldName_ && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(kanshouHeldName_)) {
          pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_HANDHOLD_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');
          kanshouHeldName_ = '';
        }
        kanshouPromiseMetStr += `\n★【對方先過去了】：快到你們約好的${kanshouFmtHM_(_ah)}了，『${_her}』看了眼時間，說了聲要先過去「${_pr.loc}」等你，就從這裡動身離開了——演出對方起身道別的那一刻(期待/彆扭/催你別遲到皆可)。對方【已經不在這裡】，這段之後不可再讓對方開口或在場。`;
        return; // 她已離場，本回合不再結算
      }
      if (!_atApptLoc) {
        // 📌 今天有約、你還沒到那裡——記一筆待辦。
        kanshouApptTodoArr_.push({ name: _her, loc: _pr.loc, at: _ah === null ? "" : kanshouFmtHM_(_ah) });
        return;
      }
      if (_ah === null) { // 舊格式無時段：當天到場即赴約
        _settle(5, `\n★【依約相會】：今天正是你與『${_her}』約好在「${_pr.loc}」見面的日子，你們此刻真的相會了——演出「約定被守住」的欣喜(好感已上調，勿另計)。`);
      } else if (curHour < _ah - KANSHOU_APPT_LEAVE_EARLY_ - 1e-6) { // 她還沒動身→回等待框(−1e-6 epsilon：跳到抵達時刻後浮點誤差不會又被判太早卡死)
        if (!kanshouPromiseWait_) kanshouPromiseWait_ = { name: _her, loc: _pr.loc, apptLabel: kanshouFmtHM_(_ah), targetHour: _ah - KANSHOU_APPT_LEAVE_EARLY_, waitLabel: kanshouFmtHM_(_ah - KANSHOU_APPT_LEAVE_EARLY_) };
      } else if (curHour <= _ah + 0.5) { // 準時窗[時刻-10,時刻+30]
        const _early = curHour < _ah;
        _settle(5, _early
          ? `\n★【依約相會·都早到了】：你與『${_her}』約在${kanshouFmtHM_(_ah)}於「${_pr.loc}」見面，而你倆此刻(${kanshouFmtHM_(curHour)})都提早到了——演出兩人都早到、剛好碰上的甜蜜當下與那份心照不宣的默契(好感已上調，勿另計)。`
          : `\n★【依約相會】：約定的${kanshouFmtHM_(_ah)}，你準時到「${_pr.loc}」與『${_her}』相會——演出約定被守住的欣喜(好感已上調，勿另計)。`);
      } else if (curHour <= _ah + 2) { // 遲到(準時窗後~2小時內)
        _settle(3, `\n★【遲到赴約】：你與『${_her}』約在${kanshouFmtHM_(_ah)}，卻拖到${kanshouFmtHM_(curHour)}才到「${_pr.loc}」——對方等了你好一會，依個性流露嗔怪/委屈/嘴硬說沒關係(好感仍上調但你遲到了，勿另計)。`);
      } else { // 遲到超過2小時：視為當天已經放鴿子，比照爽約結算
        _standUp();
      }
    } else if (_pr.day < curDay) { // 過了約定日還沒赴約=爽約
      _standUp();
    }
  });

  let kanshouInitStr = "";
  let kanshouInitVisitName_ = "";
  (function () {
    // 只在「玩家自己推進的普通回合」擲：時間跳躍/結束一天/深夜段落各有自己的節奏，硬插會打架。
    if (kanshouTimeJumped_ || kanshouNightSceneOn_ || kanshouNightGuest_ || kanshouEncounterHero) return;
    if (KANSHOU_INITIATIVE_DAY_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]) === curDay) return;
    const _all = pcData.filter((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者"
      && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_"));
    if (!_all.length) return;
    // 📉 節流：機率除以「手上未赴的約數」(玩家「有約的話機率再下降一點」)。0個=全速、1個=半速…（全文見 CODE_NOTES.md）
    const _pending = _all.filter(r => { const p = kanshouGetPromise_(r[COL.PC.MEMORY]); return p && p.day >= curDay; }).length;
    const _maxBond = _all.reduce((m, r) => Math.max(m, parseInt(r[COL.PC.BOND]) || 0), 0);
    const _p = Math.min(KANSHOU_INIT_MAX_, KANSHOU_INIT_BASE_ + _maxBond * KANSHOU_INIT_PER_BOND_) / (1 + _pending);
    if (Math.random() >= _p) return;

    const _hereRows = _all.filter(r => String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim());
    const _locObj = KANSHOU_LOCATIONS_.find(l => l.name === String(curL || "").trim());
    // ① 她來找你：她不在場、好感夠、而且你此刻【不是待在別人家】(那該是你去拜訪，不是她跑來)
    const _visitOk = _locObj && _locObj.region !== 'visit'
      && curHour >= KANSHOU_INIT_VISIT_FROM_ && curHour < KANSHOU_INIT_VISIT_TO_;
    const _visitPool = _visitOk
      ? _all.filter(r => String(r[COL.PC.LOC] || "").trim() !== String(curL || "").trim()
        && (parseInt(r[COL.PC.BOND]) || 0) >= KANSHOU_VISIT_BOND_) : [];
    // ② 她開口約你：她在場、熟識以上、而且【她自己】名下沒有還沒赴的約
    const _invitePool = _hereRows.filter(r => (parseInt(r[COL.PC.BOND]) || 0) >= KANSHOU_VISIT_BOND_
      && !(function () { const p = kanshouGetPromise_(r[COL.PC.MEMORY]); return p && p.day >= curDay; })());
    // ③ 她想要什麼：她在場即可，不看好感——這條不動任何數值，只是讓日常有人味
    const _wantPool = _hereRows;
    const _kinds = [];
    if (_visitPool.length) _kinds.push('visit');
    if (_invitePool.length) _kinds.push('invite');
    if (_wantPool.length) _kinds.push('want');
    // 📐 三型等權(2026-07 實跑調校)：初版給 want 加倍權重，結果邀約變成 20 天才一次——因為邀約本來就還要再過「她自己名下沒有未赴的約」這道閘，兩層壓抑疊起來太稀有。
    if (!_kinds.length) return;
    const _kind = _kinds[Math.floor(Math.random() * _kinds.length)];
    const _pick = a => a[Math.floor(Math.random() * a.length)];
    const _stamp = () => {
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_INITIATIVE_DAY_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], curDay);
      dirtyPcRows.add(pcIndex);
    };

    if (_kind === 'visit') {
      const _r = _pick(_visitPool), _i = pcData.indexOf(_r);
      pcData[_i][COL.PC.LOC] = curL;
      // 她是自己走來的、當然醒著——同深夜訪客，不標會在自家時段被 pSleepStr 判成熟睡。
      pcData[_i][COL.PC.MEMORY] = KANSHOU_AWAKE_HERE_TAG_.set(pcData[_i][COL.PC.MEMORY], curL);
      dirtyPcRows.add(_i); _stamp();
      kanshouInitVisitName_ = String(_r[COL.PC.NAME]);
      kanshouInitStr = `\n★【對方自己找來了】：『${String(_r[COL.PC.NAME])}』剛剛出現在「${kanshouLocNameForAI_(curL)}」——不是你叫對方來的，是對方自己想見你才過來的。這件事【已經發生】，由對方依自己的個性演出對方是怎麼出現、怎麼開的口(若無其事／找個藉口／直說皆可)。`;
    } else if (_kind === 'invite') {
      const _r = _pick(_invitePool), _i = pcData.indexOf(_r);
      const _band = _pick(KANSHOU_APPT_BANDS_);
      const _cands = KANSHOU_LOCATIONS_.filter(l => l.region !== 'room'
        && l.name !== String(curL || "").trim()
        && (l.region !== 'visit' || kanshouResidenceUnlocked_(pcData, l.name, myGameId))
        && (!l.bands || l.bands.indexOf(_band.band) !== -1));
      if (!_cands.length) return;
      const _loc = _pick(_cands);
      // 這個時段今天還來得及就約今天，否則約明天。
      const _today = _band.hour > curHour + 1;
      pcData[_i][COL.PC.MEMORY] = kanshouSetPromise_(pcData[_i][COL.PC.MEMORY], curDay + (_today ? 0 : 1), _loc.name, _band.band, true);
      dirtyPcRows.add(_i); _stamp();
      kanshouPromiseSettle_.push({ ok: true, type: 'promise_byher', name: String(_r[COL.PC.NAME]), loc: _loc.name,
        when: _today ? '今天' : '明天', bandLabel: _band.label });
      kanshouInitStr = `\n★【對方開口約你】：『${String(_r[COL.PC.NAME])}』說了${_today ? '今天' : '明天'}${_band.label}在「${_loc.name}」等你——這句話【已經說出口】，由對方依自己的個性演出對方是怎麼提的(慎重／裝作隨口／彆扭地繞一圈才講皆可)。★這是對方單方面的邀約，你答不答應都行，narration【不可】替玩家決定要去或不去。`;
    } else {
      const _r = _pick(_wantPool);
      _stamp();
      kanshouInitStr = `\n★【對方此刻的心思】：『${String(_r[COL.PC.NAME])}』${_pick(KANSHOU_INIT_WANTS_)}——這是對方心裡真的有的事，這一回合讓它自然浮出來一次(要不要說破、怎麼說，依對方的個性決定)。★只是一個起頭，【不可】替玩家決定要怎麼回應。`;
    }
  })();

  // 「開放世界·背景人煙」設計：路人可自由描寫增添生活感，但不具名、不追蹤好感、不能被指名互動；真正能被指名、好感會被記錄的對象只有【在場人物】，判準是「LOC是否跟玩家目前位置一致」，不看IS_PARTY。
  const partyRows = pcData.filter(r => r !== pc && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim())
    .sort((a, b) => (parseInt(b[COL.PC.BOND]) || 0) - (parseInt(a[COL.PC.BOND]) || 0)).slice(0, KANSHOU_PARTY_DETAIL_CAP_);
  const partyMembers = partyRows.map(r => r[COL.PC.NAME]);
  // 🎊 節慶三態(2026-07 玩家「想要一個類似任務重點…沒去做的話 AI 可以很委婉地提醒，做過就完成不要再出現」)。
  const kanshouFestivalStr = (() => {
    const _f = KANSHOU_FESTIVALS_.find(f => f.month === curDateObj_.month && f.day === curDateObj_.day);
    if (!_f) {
      // 明天就是節慶：只給前夕氣氛，不談習俗(還沒到日子)。
      return jumpFest ? `\n★【節慶前夕】：明天就是「${jumpFest.name}」，街頭已有前夕的氣氛——自然帶入即可、不報幕。` : "";
    }
    const _fe = KANSHOU_FESTIVAL_EVENTS_[_f.key] || {};
    const _amb = (KANSHOU_SCENE_EVENTS_[_fe.eventKey] || {}).ambient || "";
    const _done = KANSHOU_FESTIVAL_DONE_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]) === curDay;
    if (_done) return `\n★【節慶】：今天是「${_f.name}」，該做的事你們已經一起做過了——餘韻自然帶到即可，別再提還沒去。`;
    const _locOk = Array.isArray(_fe.doneLoc) && _fe.doneLoc.indexOf(String(curL || "").trim()) !== -1;
    if (_locOk && partyMembers.length) {
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_FESTIVAL_DONE_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], curDay);
      dirtyPcRows.add(pcIndex);
      return `\n★【節慶·就是此刻】：今天是「${_f.name}」，而你和『${partyMembers.join('、')}』正好就在「${kanshouLocNameForAI_(curL)}」——${_fe.todo || '一起過這個節'}這件事，此刻就在發生。把這一幕好好寫出來(這是今天的重頭戲，值得多給一點筆墨)。`;
    }
    const _fTodo = _fe.todo ? `這一天的老規矩是【${_fe.todo}】，而你還沒去成。` : '';
    const _fNudge = (_fe.todo && partyMembers.length)
      ? `若情境合適，可由『${partyMembers[0]}』【自然地】提一句(期待/試探/嘴上說無所謂都行)——只能點到為止，【不可】催促玩家、不可替玩家決定去不去、更不可自行演成已經去過了。`
      : '';
    return `\n★【節慶】：今天是「${_f.name}」——${_amb}。${_fTodo}${_fNudge}`;
  })();

  const kanshouApptTodoStr = kanshouApptTodoArr_.length
    ? `\n★【今天的約·尚未赴】：${kanshouApptTodoArr_.map(t => `${t.at ? t.at + '於' : ''}「${t.loc}」見『${t.name}』`).join('；')}——這是今天確實還沒完成的事，不是背景設定。${kanshouApptTodoArr_.some(t => partyMembers.indexOf(t.name) !== -1) ? `其中人就在你面前的那位，若情境合適可由她自然提起(確認/催一下/嘴上說不急都行)。` : `對方此刻不在你身邊，只能寫成你自己記著這件事，【不可】讓她開口或出現。`}`
    : "";

  // 📅 那個約就算了(豁免)：這裡才依「此刻真的在場」過濾——見 _standUp 內的說明。人不在場就整句不送。
  const kanshouApptWaivedStr = (() => {
    const _here = kanshouApptWaivedArr_.filter(t => partyMembers.indexOf(t.name) !== -1);
    if (!_here.length) return "";
    return `\n★【那個約就算了】：你與『${_here.map(t => t.name).join('、')}』本來約在「${_here.map(t => t.loc).join('、')}」見面、結果沒去成，但你們這段時間本來就一直在一起——不是放鴿子，沒有人空等。可自然帶過那個沒去成的約——語氣是相視一笑的默契，【不必】演成道歉或責備，也沒有任何數值變動。`;
  })();

  // 🌍 世界概況(輕量版·2026-07 玩家「NPC不知道彼此存在」)：只給名字＋大分區，不給精確地點/在幹嘛，純粹讓AI知道「這局還認識誰、大概在哪」以便自然閒聊提及——不是在場資料，不影響【在場驗證鐵律】(指名互動/追蹤好感仍只認同地點的partyRows)。
  const kanshouWorldRosterStr = (() => {
    const _elsewhere = pcData.filter(r => r !== pc && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() !== String(curL || "").trim())
      .sort((a, b) => (parseInt(b[COL.PC.BOND]) || 0) - (parseInt(a[COL.PC.BOND]) || 0)).slice(0, KANSHOU_WORLD_ROSTER_CAP_);
    if (!_elsewhere.length) return "";
    // 🎯 觸發收緊(2026-07 玩家「條件式區塊的觸發條件收緊」)：這段【唯一用途】是讓 AI 能正確回答「認不認識某某」，但它原本每回合都送(只要有人不在場就成立＝幾乎永遠)，等於絕大多數回合都在燒 200+字 講一件玩家沒問的事。
    const _rosterAsk = /認識|聽過|見過|知道|在哪|去哪|哪裡|怎麼樣了|還好嗎/.test(userMsg)
      || _elsewhere.some(r => kanshouNameCandidates_(String(r[COL.PC.NAME] || "")).some(c => c && userMsg.indexOf(c) >= 0));
    if (!_rosterAsk) return "";
    const _list = _elsewhere.map(r => {
      const _loc = KANSHOU_LOCATIONS_.find(l => l.name === String(r[COL.PC.LOC] || "").trim());
      const _region = _loc && KANSHOU_REGIONS_.find(g => g.id === _loc.region);
      const _name = String(r[COL.PC.NAME] || "");
      const _variants = /[A-Za-z]/.test(_name)
        ? [...new Set([_name.toUpperCase(), _name.charAt(0).toUpperCase() + _name.slice(1).toLowerCase(), _name.toLowerCase()])].filter(v => v !== _name)
        : [];
      const _caseNote = _variants.length ? `，${_variants.join('/')}也是同一人` : '';
      return `${_name}(${_region ? _region.name : "行蹤不明"}${_caseNote})`;
    }).join('、');
    return `\n★【世界概況·這座城裡認識的人】：玩家與在場的人都確實認識以下這些人，此刻分處異地，大略所在：${_list}。玩家若直接問起「認不認識/聽過某某」，只要名字(不分大小寫，英文名任何大小寫寫法都算同一人)出現在這份名單裡，被問到的那個人就【確實認識、要肯定回答「是」】，可以自然帶一句對方大概在哪／大概是怎樣的人；【不可】因為對方此刻不在場就裝作沒聽過或反問「那是誰」——大家都是同一座城裡認識的人。名單外的名字才是真的沒聽過、可以照實說不認識。★但認識歸認識，仍【不可】讓對方憑空出現、開口、或被指名互動——這不影響在場驗證鐵律，只有此刻真的同地點的人才算在場，能做的只是口頭確認「認識」，人不會登場。`;
  })();
  // 📅 初見日戳＋相識紀念日：同地即相識——沒戳過的在場同伴當下蓋【初見日】(冪等，之後只讀不改)；已有戳的算相識天數，命中里程碑(7/30/100/365天)就收進紀念日提示(當天內重複對話會重複提及，跟節慶氛圍同一種「全天有效的氛圍線」設計，AI自然不會每句都講)。
  let kanshouAloneBondStr = "";
  if (partyRows.length === 1 && !kanshouTimeJumped_) {
    const _alIdx = pcData.indexOf(partyRows[0]);
    const _alLocObj = KANSHOU_LOCATIONS_.find(l => l.name === String(curL || "").trim());
    const _alBond = parseInt(partyRows[0][COL.PC.BOND]) || 0;
    if (_alIdx >= 0 && _alLocObj && _alLocObj.noEncounter === true && _alBond >= kanshouRelChatCeiling_(0)
      && KANSHOU_SCENE_DAY_TAG_.get(partyRows[0][COL.PC.MEMORY]) !== curDay) {
      pcData[_alIdx][COL.PC.BOND] = Math.min(100, _alBond + KANSHOU_SCENE_BOND_);
      kanshouSyncRelTier_(pcData, _alIdx);
      pcData[_alIdx][COL.PC.MEMORY] = KANSHOU_SCENE_DAY_TAG_.set(pcData[_alIdx][COL.PC.MEMORY], curDay);
      dirtyPcRows.add(_alIdx);
      kanshouAloneBondStr = `\n★【獨處時光】：此刻這個地方只有你和『${String(partyRows[0][COL.PC.NAME])}』兩個人——不必特別點破，讓這份「沒有別人」的私密感自然滲進對方的語氣與距離感即可(好感已由系統上調，敘事勿再另計)。`;
    }
  }
  const kanshouAnnivLines_ = [];
  const kanshouTierCrossLines_ = [];   // 💗 這回合剛跨進新關係階的人
  const kanshouCohabitEndNames_ = []; // 🏠 這回合剛被解除同居的人
  const kanshouFirstsLines_ = [];      // 💞 在場者的「第一次」帳
  const kanshouFirstsAnnivLines_ = []; // 🎂 今天剛好是某個「第一次」的週年
  let kanshouFirstsStampedToday_ = false; // 本回合(或今天)剛發生一件「第一次」→ 值得讓 AI 知道
  // 🏠 同居邀請泡泡(2026-07 玩家「同居做成泡泡問一次、完全隱藏才是正解」)：綁在【跨進戀人】那一刻——那正是「要不要住在一起」第一次成立的敘事時機，而且 KANSHOU_REL_RANK_TAG_ 只升不降，這個跨階天生只會發生一次，不必另外記「問過沒」。
  let kanshouCohabitOffer_ = null;
  partyRows.forEach(r => {
    const _ri = pcData.indexOf(r);
    if (_ri < 0) return;
    const _tierBond = parseInt(r[COL.PC.BOND]) || 0;
    const _tierNow = kanshouRelRank_(_tierBond);
    // 🏠 同居邀請·一生一次：好感首次達門檻(90)且尚未同住、也還沒問過 → 跳一次泡泡並蓋章。
    if (!kanshouCohabitOffer_ && _tierBond >= KANSHOU_COHABIT_BOND_ && !kanshouIsCohabit_(r)
      && KANSHOU_COHABIT_ASKED_TAG_.get(r[COL.PC.MEMORY]) !== curDay) {
      kanshouCohabitOffer_ = { name: String(r[COL.PC.NAME]), id: String(r[COL.PC.ID] || "") };
      pcData[_ri][COL.PC.MEMORY] = KANSHOU_COHABIT_ASKED_TAG_.set(pcData[_ri][COL.PC.MEMORY], curDay);
      dirtyPcRows.add(_ri);
    }
    const _tierWas = KANSHOU_REL_RANK_TAG_.get(r[COL.PC.MEMORY]);
    if (!_tierWas) {
      pcData[_ri][COL.PC.MEMORY] = KANSHOU_REL_RANK_TAG_.set(pcData[_ri][COL.PC.MEMORY], _tierNow);
      dirtyPcRows.add(_ri);
    } else if (_tierNow !== _tierWas) {
      // 🎯 只給【事實】(誰·從哪一階到哪一階)，不給寫好的文案——怎麼演由 AI 依她性格自由發揮。
      const _lbWas = kanshouRelTierLabel_(_tierWas), _lbNow = kanshouRelTierLabel_(_tierNow);
      const _up = _tierNow > _tierWas;
      if (_lbNow) kanshouTierCrossLines_.push(`『${String(r[COL.PC.NAME])}』從「${_lbWas}」${_up ? '跨進' : '退回'}「${_lbNow}」`);
      pcData[_ri][COL.PC.MEMORY] = KANSHOU_REL_RANK_TAG_.set(pcData[_ri][COL.PC.MEMORY], _tierNow);
      dirtyPcRows.add(_ri);
    }
    // 🏠 她剛被解除同居(好感跌破門檻·kanshouSyncRelTier_ 蓋的一次性旗標)：讀一次就清。
    if (KANSHOU_COHABIT_END_TAG_.get(r[COL.PC.MEMORY])) {
      kanshouCohabitEndNames_.push(String(r[COL.PC.NAME]));
      pcData[_ri][COL.PC.MEMORY] = KANSHOU_COHABIT_END_TAG_.set(pcData[_ri][COL.PC.MEMORY], 0);
      dirtyPcRows.add(_ri);
    }
    const _fsts = kanshouGetFirsts_(r[COL.PC.MEMORY]).sort((a, b) => a.day - b.day);
    if (_fsts.length) {
      const _herN = String(r[COL.PC.NAME]);
      kanshouFirstsLines_.push(`與『${_herN}』：` + _fsts.slice(0, KANSHOU_FIRSTS_SHOW_).map(o => {
        const _fd = kanshouAbsDayToDate_(o.day);
        const _ago = Math.max(0, curDay - o.day);
        return `第一次${o.key}＝${_fd.month}月${_fd.day}日${_ago > 0 ? `(${_ago}天前)` : "(就是今天)"}`;
      }).join('、'));
      // 🎂 週年：曆法固定 365 天/年(kanshouAbsDayToDate_)，故「同月同日」必然是整年數之差。
      if (_fsts.some(o => o.day === curDay)) kanshouFirstsStampedToday_ = true;
      const _todayD = kanshouAbsDayToDate_(curDay);
      _fsts.forEach(o => {
        const _fd2 = kanshouAbsDayToDate_(o.day);
        const _yrs = Math.round((curDay - o.day) / 365);
        if (_yrs >= 1 && _fd2.month === _todayD.month && _fd2.day === _todayD.day) {
          kanshouFirstsAnnivLines_.push(`『${_herN}』——今天正好是你們第一次${o.key}的${_yrs}週年`);
        }
      });
    }
    // 🤝 相處計數 +1（2026-07 新增）：跟【初見日】同一個位置蓋戳——這裡本來就是「對每位在場者逐一處理」的迴圈，而且每回合只跑一次，天然冪等，不必另外記日戳。
    if (!kanshouTimeJumped_) {
      pcData[_ri][COL.PC.MEMORY] = KANSHOU_MET_COUNT_TAG_.set(
        pcData[_ri][COL.PC.MEMORY], KANSHOU_MET_COUNT_TAG_.get(r[COL.PC.MEMORY]) + 1);
      dirtyPcRows.add(_ri);
    }
    const _met = KANSHOU_FIRST_MET_DAY_TAG_.get(r[COL.PC.MEMORY]);
    if (!_met) {
      pcData[_ri][COL.PC.MEMORY] = KANSHOU_FIRST_MET_DAY_TAG_.set(pcData[_ri][COL.PC.MEMORY], curDay);
      dirtyPcRows.add(_ri);
    } else {
      const _daysKnown = curDay - _met;
      const _annivFired = getKanshouAnnivFired_(r[COL.PC.MEMORY]);
      const _crossed = KANSHOU_ANNIV_MILESTONES_.filter(m => _daysKnown >= m);
      const _newlyDue = _crossed.filter(m => _annivFired.indexOf(m) === -1);
      if (_newlyDue.length) {
        const _biggest = Math.max(..._newlyDue);
        kanshouAnnivLines_.push(`與『${String(r[COL.PC.NAME])}』相識已滿${_biggest}天`);
        // 跨過門檻一次補齊全標記已發，避免之後又補announce較小、已經跨過的門檻
        pcData[_ri][COL.PC.MEMORY] = setKanshouAnnivFired_(pcData[_ri][COL.PC.MEMORY], _crossed);
        dirtyPcRows.add(_ri);
      }
    }
  });
  const kanshouAnnivStr = kanshouAnnivLines_.length ? `\n★【紀念日·非強制】：今天是${kanshouAnnivLines_.join('、')}的日子——若氣氛合適可自然帶出這份紀念的溫度(對方記得、或你記得皆可)，不必強行慶祝或報幕。` : "";
  // 🌅 兩條「昨夜」線都必須依【這回合她到底在不在場】過濾(2026-07 玩家「如果我直接移動呢....」)：旗標在回合開頭就讀掉了，但那時還不知道玩家這回合要去哪。
  const _morningHere_ = String(morningAfterNames || "").split('、').map(n => n.trim())
    .filter(n => n && partyMembers.indexOf(n) !== -1).join('、');
  const _partedAway_ = String(nightPartNames || "").split('、').map(n => n.trim())
    .filter(n => n && partyMembers.indexOf(n) === -1).join('、');
  // 🌙 深夜獨處(夜未眠)：只給「此刻是什麼場合」這個事實，怎麼發展全看玩家推進與她的個性。
  const kanshouNightSceneStr = (kanshouNightSceneOn_ || kanshouNightSceneNames_.length)
    ? `\n★【夜已深·門關上了】：這個房間此刻只剩你和『${(kanshouNightSceneNames_.length ? kanshouNightSceneNames_ : partyMembers).join('、')}』，外頭安靜下來，今晚不會再有別人進來，時間也不急著走。★這一段【還沒有結束】：不要寫成睡著、天亮、或一夜就這樣過去了——這一夜什麼時候收，由玩家自己決定，系統會宣告；本回合只演此刻正在發生的這十分鐘，結尾一樣停在進行式、把下一步交還玩家。`
    : "";
  // 🏠 同居結束：只給事實，怎麼收由 AI 依她性格演——可以是她自己開口要搬、也可以是不告而別。
  const kanshouCohabitEndStr = kanshouCohabitEndNames_.length
    ? `\n★【對方不再住在這裡了】：『${kanshouCohabitEndNames_.join('、')}』已不再與你同住——這是這段關係走到現在的結果，不是意外。若對方此刻就在你面前，讓這件事在這回合被說開(對方提出要搬／你察覺對方東西收走了皆可)；★【不可】寫成系統宣告，也【不可】當作沒發生過。`
    : "";

  // 💗 關係質變：跨進新階的當下演一次。給的是「方向」不是台詞——具體怎麼表現交給 AI 依她性格拿捏。
  const kanshouTierCrossStr = kanshouTierCrossLines_.length
    ? `\n★【關係質變·就在此刻】：${kanshouTierCrossLines_.join('；')}——就在這回合剛變動。依對方自己的性格讓這份轉變真實發生一次(往回退的那些，演的是那份親近正在收回去：語氣、距離、能不能碰，都退回這一階該有的樣子)，★【不可】報幕式宣告階級或數字、不可寫成系統提示。`
    : "";
  // 💞 第一次帳：GAS 蓋的既定事實，供 AI 精確回想「我們第一次做某件事是哪天」而非自行編造。
  const _firstsNeeded = kanshouFirstsAnnivLines_.length > 0 || kanshouFirstsStampedToday_
    || /第一次|初次|當初|那時|那天|以前|記得|多久|以來|一開始|剛認識/.test(userMsg);
  const kanshouFirstsStr = (kanshouFirstsLines_.length && _firstsNeeded)
    ? `\n★【你們之間的「第一次」·既定事實】：${kanshouFirstsLines_.join('；')}。這些日期是【確定發生過的事實】，若話題自然聊到往事、或今天恰好是其中某個日子，可以據此準確回憶(對方記得、或你記得皆可)；★【不可】自行編造清單以外的「第一次」，也【不必】每回合主動提起。`
    : "";
  // 🎂 週年當天才出現的加強句：這是把「第一次」記成結構化事實的主要回報，值得比一般回憶更被看見。
  const kanshouFirstsAnnivStr = kanshouFirstsAnnivLines_.length
    ? `\n★【週年·今天】：${kanshouFirstsAnnivLines_.join('；')}。若氣氛合適，讓「剛好是今天」這件事自然浮現一次——可以是對方記得而你忘了、你記得而對方驚訝、或兩人心照不宣，依對方的性格決定怎麼處理這個日子(甚至可以是彆扭地假裝不記得)。不必大張旗鼓慶祝，也【不必】報幕式地宣告年份數字。`
    : "";
  const kanshouHoldingStr = (kanshouHeldName_ && partyMembers.some(n => kanshouNameCandidates_(String(n)).includes(kanshouHeldName_)) && !(userData.handHold))
    ? `\n★【牽手中·背景資訊·別過度著墨】：你和『${kanshouHeldName_}』正牽著手一起行動——對方【此刻就在你身邊、和你同處一地】，是牽著你的手一起走過來/一起待在這裡的，【絕不是】在別處等你、也【不會】說「你怎麼跑進來了」「說好在○○等你」這種把你倆講成分處兩地的話。★這份牽手只是【低調的背景親密】，【不必每回合都描寫交握的手】——偶爾在情境合適時輕輕帶一筆即可，別讓每一段敘事都圍著「握著的手／指尖的溫度」打轉，重心放在當下真正在發生的互動與對話。`
    : "";

  // 📷 拍照(takePhoto)：手機拍照·2026-07 再修（玩家「拍照要改成手機、不用等」）——手機沒有底片這種東西，只驗相簿總容量；拍完立刻存進相簿、立刻能看，不再有「隔天沖洗」的等待。
  let kanshouPhotoStr = "", kanshouPhotoPending_ = null, kanshouPhotoDenied_ = "";
  if (userData.takePhoto === true) {
    const _phIntent = String(userData.photoIntent || "").replace(/[<>&"'`｜【】]/g, "").slice(0, 60);
    let _phCount = 0, _phCountErr = false;
    try { const _ar = kanshouAlbumSheet_().getDataRange().getValues(); for (let i = 1; i < _ar.length; i++) { if (String(_ar[i][0]) === myGameId) _phCount++; } } catch (e) { _phCountErr = true; }
    if (_phCountErr || _phCount >= KANSHOU_ALBUM_CAP_) {
      kanshouPhotoDenied_ = 'cap';
      kanshouPhotoStr = `\n★【相簿已滿】：玩家舉起手機，卻想起相簿已經放不下更多照片了——演出這份「回憶太滿」的感嘆即可。`;
      finalUserMsg = `【玩家意圖】：舉起手機，卻想起相簿已經滿了。`;
    } else {
      // 指定拍誰：intent點名了哪些在場同伴(可多位)——只拍被點名的那些人；沒點名到任何人才算風景。
      const _phNamedMembers = _phIntent ? partyMembers.filter(n => kanshouNameCandidates_(String(n)).some(c => _phIntent.indexOf(c) >= 0)) : [];
      const _phScenery = !partyMembers.length || (_phIntent && !_phNamedMembers.length);
      const _phCaptionRule = `並【務必】在回應JSON中額外加一個欄位 "photo_caption"：同 narration 用第二人稱「你」稱玩家、寫一句30~60字的照片小敘述(禁HTML與引號)，若拍到的是親密畫面也直接寫實描述，不用刻意隱晦帶過。`;
      if (_phScenery) {
        kanshouPhotoPending_ = { names: ['風景'], scenery: true };
        kanshouPhotoStr = `\n★【拍照·風景】：玩家舉起手機${_phIntent ? `，想拍的是「${_phIntent}」，` : "，"}拍下此刻「${kanshouLocNameForAI_(curL)}」的一隅——鏡頭裡可以是街貓、狗兒、鳥雀、光影、不具名路人的背影等生活細節(依地點/時段/天氣自然想像${_phIntent ? "，以玩家想拍的東西為主角" : ""})；若有同伴在場，她們可以自然反應或亂入鏡頭邊角。${_phCaptionRule}`;
        finalUserMsg = `【玩家意圖】：舉起手機，${_phIntent ? `拍下「${_phIntent}」` : "拍下眼前的光景"}。`;
      } else {
        // 點名了誰就只拍那(幾)位；沒點名(空手按)＝在場好感最高的前3位一起入鏡合照。
        const _phTargets = _phNamedMembers.length ? _phNamedMembers.slice(0, 3) : partyMembers.slice(0, 3);
        const _phSolo = _phTargets.length === 1;
        kanshouPhotoPending_ = { names: _phTargets };
        kanshouPhotoStr = `\n★【拍照】：玩家舉起手機，${_phSolo ? `單獨` : ``}拍下『${_phTargets.join('、')}』此刻的身影${_phTargets.length > 1 ? `(這是一張把她們一起框進來的合照)` : ``}——讓被拍的人依各自性格與好感演出被拍瞬間的反應(大方擺姿勢/害羞遮臉/嗔怪/渾然未覺皆可)${partyMembers.length > _phTargets.length ? `；在場其他沒被拍到的人可以自然旁觀或起鬨` : ``}。${_phCaptionRule}`;
        finalUserMsg = `【玩家意圖】：舉起手機，拍下『${_phTargets.join('、')}』此刻的樣子。`;
      }
    }
  }
  let kanshouShowPhotoStr = "";
  if (userData.showPhoto) {
    try {
      const _spRows = kanshouAlbumSheet_().getDataRange().getValues();
      let _spRow = null;
      for (let i = 1; i < _spRows.length; i++) { if (String(_spRows[i][0]) === myGameId && String(_spRows[i][1]) === String(userData.showPhoto).trim()) { _spRow = _spRows[i]; break; } }
      if (_spRow) {
        kanshouShowPhotoStr = `\n★【看照片】：玩家拿出手機把一張照片給在場的人看——照片內容：${String(_spRow[3])}的「${String(_spRow[4])}」、拍到的是『${String(_spRow[6])}』${_spRow[8] ? `(${String(_spRow[8])})` : ""}。讓在場的人依性格反應：照片裡是自己→害羞/得意/嫌拍得糊皆可；照片裡是別人→好奇評論，跟玩家關係深的人可以暗暗吃味。`;
        finalUserMsg = `【玩家意圖】：拿出手機給在場的人看一張照片。`;
      }
    } catch (e) { }
  }
  let partyDetailsArr = [];
  const _presenceSeen_ = {};
  const _partyHeroCodex = partyMembers.length > 0 ? getHeroCodexCached() : null;
  partyMembers.forEach(pName => {
    const r = pcData.find(row => String(row[COL.PC.NAME]).trim() === String(pName).trim() && !String(row[COL.PC.ID]).startsWith("DEAD_") && sameGame(row));
    if (r) {
      // 🛡️ REL_TAG 是 BOND 的衍生值，組提示詞前對齊一次——寫入端各自負責同步，這裡是唯一的讀取端。
      const _pSyncIdx = pcData.indexOf(r);
      if (_pSyncIdx >= 0) {
        const _wasTag = String(r[COL.PC.REL_TAG] || ""), _wasBond = String(r[COL.PC.BOND] || ""), _wasMem = String(r[COL.PC.MEMORY] || "");
        kanshouSyncRelTier_(pcData, _pSyncIdx);
        if (String(r[COL.PC.REL_TAG] || "") !== _wasTag || String(r[COL.PC.BOND] || "") !== _wasBond || String(r[COL.PC.MEMORY] || "") !== _wasMem) dirtyPcRows.add(_pSyncIdx);
      }
      const pOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👕 換裝：當前服裝穿著(換衣不換人；玩家UI設定或AI依appearance_extras更新)
      // 鑑賞無戰鬥，HP/STATUS 恆定不變(已被 physical_state 取代)，不重複注入。
      const pMemStr = relMemMemoryStr_(r[COL.PC.REL_MEM]);
      const pMoeStr = String(r[COL.PC.INTENT] || "").trim();
      // 口吻/招牌小動作(persona.speech/tic)：召喚時已存進 MEMORY 的【口吻】【小動作】標記，直接複用 getPersonaSpeech_/getPersonaTic_ 讀取，讓角色演出招牌語癖而非千篇一律。
      const pSpeech = getPersonaSpeech_(r[COL.PC.MEMORY]) || dailySpeechByName_(pName, _partyHeroCodex);
      const pTic = getPersonaTic_(r[COL.PC.MEMORY]);
      const pFlavorStr = `${pSpeech ? ` | 口吻:${pSpeech}` : ""}${pTic ? ` | 招牌小動作:${pTic}` : ""}`;
      const pBond = parseInt(r[COL.PC.BOND]) || 0;
      const pChatCeiling = kanshouRelChatCeiling_(pBond);
      const pAtCeilingStr = (pChatCeiling < 100 && pBond >= pChatCeiling) ? "・單靠對話目前已到這個階段的上限，需要透過約定赴約、或一起經歷特別的橋段(夜襲/共浴/膝枕…)這類真實相處才能再加深，這回合維持細水長流的相處基調，不要寫成關係大幅推進" : "";
      // REL_TAG的梯度字面本身沒告訴AI「該演出什麼熟悉程度」，AI容易預設熱絡口吻跟數字矛盾。
      const pRelTagStr = r[COL.PC.REL_TAG] || "點頭之交";
      const _chillDay = KANSHOU_CHILL_DAY_TAG_.get(r[COL.PC.MEMORY]);
      const pChillStr = (_chillDay && curDay - _chillDay >= 0 && curDay - _chillDay <= KANSHOU_CHILL_DAYS_)
        ? `・${curDay === _chillDay ? '就在今天' : '昨天'}你們之間有過一次不愉快，對方還沒完全放下——這份芥蒂要真實反映在對方此刻的語氣與距離感裡(依對方的個性決定是話變少、刻意找碴、還是笑得比平常淡)，但別演成翻臉決裂`
        : "";
      // 🤝 相處基調（2026-07 取代舊的 pTierToneStr）：舊版只看關係階、只在最低兩階出現，是這件事的退化 1D 版；現在改查 好感×相處次數 的 2D 表（見 KANSHOU_RAPPORT_TONE_）。
      const pMetCount = KANSHOU_MET_COUNT_TAG_.get(r[COL.PC.MEMORY]);
      //   isLover：告白成立者直接走【交往中】那一排，不再看好感段（見 KANSHOU_LOVER_TAG_）。
      const _rapport = kanshouRapportTone_(pBond, pMetCount, kanshouIsLover_(r));
      const pTierToneStr = _rapport ? `，${_rapport}` : "";
      // 地點的「當下在做什麼」輕量引子(見上方KANSHOU_LOCATION_ACTIVITY_)，沒對照到的地點不加這句，AI自然發揮即可。
      const _pCameWithMe = kanshouPreMoveCompanions_.some(cr => String(cr[COL.PC.NAME]).trim() === String(pName).trim());
      const pActivityStr = (() => {
        if (!moveTarget) return "";
        const _a = !_pCameWithMe ? kanshouLocActivity_(curL, pName, curDay) : "";
        return _a ? ` | 現況:${_a}(對方本來就是這個狀態，不是這回合才開始，別演出「換上/開始」這類起始動作)` : "";
      })();
      // 🌙 2026-07 玩家「深夜或清晨去她房間找她，有提示AI要讓她們是睡眠狀態嗎?」——查證後確實沒有：kanshouRoomEventStr(她的反應走向)只在玩家按下夜襲/賴床叫醒同意鈕【之後】才會注入，剛推門進去、按鈕還沒點的這一回合完全沒有任何提示，AI只能自己從時段猜，容易演成她還醒著閒聊，跟「深夜找她＝多半在睡」的直覺矛盾。
      const pSleepStr = (() => {
        if (kanshouIsAwakeWithMe_(pcData.indexOf(r))) return "";
        const _pHomeHeroId = kanshouHeroIdByName_(pName);
        const _pHome = kanshouGetHeroHome_(_pHomeHeroId, r[COL.PC.MEMORY]);
        const _pAtHome = (_pHome !== '自己的住處' && curL === _pHome) || (kanshouIsCohabit_(r) && curL === KANSHOU_COHABIT_ROOM_) || curL === '我的房間';
        if (!_pAtHome) return "";
        // 「我的房間」是【玩家】的房間，不是她家——措辭要跟著實際地點走。
        const _pWhere = (curL === '我的房間') ? "此刻人在你房裡" : "此刻在自己家";
        if (curHour < KANSHOU_NIGHT_RAID_HOUR_END_) return _pWhere + "、多半已熟睡，睡著/半夢半醒";
        if (curHour < KANSHOU_ASLEEP_HOUR_END_) return _pWhere + "、多半還在賴床、意識朦朧，剛睡醒或仍賴床";
        return "";
      })();
      const pCohabitStr = kanshouIsCohabit_(r) ? " | 同居中:是(對方現在與你同住一處，語氣可依此帶著日常同居的親近感、不是作客)" : "";
      const pBackStr = (() => {
        const _b = String(r[COL.PC.BACK] || "").trim();
        if (!_b || _b === `${String(r[COL.PC.RANK] || "")}・${pName}` || /職階英靈$/.test(_b) || QUAD_EMPTY_.indexOf(_b) !== -1) return "";
        return ` | 經歷:${_b}`;
      })();
      const pMemoirRaw = String(r[COL.PC.MEMOIR] || "").trim();
      // ★是玩家釘選標記(面板用)，餵AI時去掉、不外洩機制符號。
      const pMemoirStr = pMemoirRaw ? ` | 你們的共同回憶(你倆一路走來的點滴，敘事可自然承接呼應、但別生硬複述):${pMemoirRaw.replace(/★/g, '').replace(/｜/g, '；')}` : "";
      // 📅 待赴約定(玩家追問「AI每次都看得到約定吧?」查出的缺口)：約成立到赴約之間的等待回合，AI 原本完全不知道有這個約——聊「期待明天嗎」她會一臉茫然、甚至另約衝突計畫。
      const _pdPr = kanshouGetPromise_(r[COL.PC.MEMORY]);
      let pPromiseStr = "";
      if (_pdPr && _pdPr.day >= curDay) {
        const _pdWhen = _pdPr.day === curDay ? "今天稍後" : _pdPr.day === curDay + 1 ? "明天" : (_pdPr.day - curDay) + "天後";
        const _pdBandL = _pdPr.band ? ((KANSHOU_APPT_BANDS_.find(b => b.band === _pdPr.band) || {}).label || _pdPr.band) : "";
        pPromiseStr = ` | 與玩家的約定:${_pdWhen}${_pdBandL}在「${_pdPr.loc}」見面——對方記得這個約，聊到相關話題時自然帶著這份期待/在意，但勿每回合主動提起`;
      }
      // 明講方向的「她/他是你的${tag}」(而非單純「關係:${tag}」)，避免AI誤讀方向、演反成玩家服侍對方。
      const pPresenceStr = (() => {
        if (kanshouKnockGuestName && String(pName).trim() === String(kanshouKnockGuestName).trim()) {
          return "【剛剛敲了你的門、這一刻才進來】(不是本來就在場，也不是跟你一起回來的)";
        }
        // 🙋 自己找上門(見★【她自己找來了】)：同深夜訪客，是這一刻才出現的，不是本來就在場。
        if (kanshouInitVisitName_ && String(pName).trim() === String(kanshouInitVisitName_).trim()) {
          return "【是自己找上門來的、這一刻才出現在這裡】(不是本來就在場，也不是跟你一起來的)";
        }
        if (moveTarget) {
          return kanshouPreMoveCompanions_.some(cr => String(cr[COL.PC.NAME]).trim() === String(pName).trim())
            ? "【與你結伴一起來到】這裡(不是在這裡等你、更不會問你怎麼來了)"
            : "你剛抵達，【原本就在這裡】(不是跟你一起來的)";
        }
        if (kanshouTimeJumped_) return "時間流轉之後，【此刻人在這裡】(別預設你們剛才一直待在一起)";
        return "【你們從剛才就一直在這裡】——早已在場，接著這一刻往下寫";
      })();
      _presenceSeen_[pPresenceStr] = (_presenceSeen_[pPresenceStr] || 0) + 1;
      partyDetailsArr.push(`【在場人物】名字:${pName}【性別:${String(r[COL.PC.SEX] || "").trim() || "異"}】｜__PRESENCE__${pPresenceStr}__/PRESENCE__${pOutfit ? ` | 裝扮:${pOutfit}` : ""}${(() => { const _p = formatPref(r[COL.PC.PREF]); return _p ? ` | 性格:${_p}` : ""; })()}${(() => { const _t = formatTrait(r[COL.PC.TRAIT]); return _t ? ` | 特徵:${_t}` : ""; })()}${pFlavorStr}${pBackStr}${(() => { const _mo = [pMoeStr, traitPrivateOf_(r[COL.PC.TRAIT])].filter(Boolean).join("／"); return _mo ? ` | 萌點(僅供內化):${_mo}` : ""; })()}${pActivityStr}${pSleepStr ? ` | 現況:${pSleepStr}` : ""}${pCohabitStr}${pMemoirStr}${pPromiseStr} | 關係:${pron_(r[COL.PC.SEX])}是你的${pRelTagStr}(好感:${pBond}${pMemStr}${pAtCeilingStr}${pTierToneStr}${pChillStr})`);
    }
  });
  // 在場來由人人相同時（多數回合都是），抽成抬頭講一次，不在每張卡上逐字重複。
  const _anySleeper_ = partyDetailsArr.some(t => / \| 現況:[^|]*(賴床|熟睡|半夢半醒)/.test(t));
  const _presenceKeys_ = Object.keys(_presenceSeen_);
  const _presenceShared_ = (_presenceKeys_.length === 1 && partyDetailsArr.length > 1) ? _presenceKeys_[0] : "";
  const _partyCards_ = partyDetailsArr.map(t => _presenceShared_
    ? t.replace(/｜__PRESENCE__[\s\S]*?__\/PRESENCE__/, "")
    : t.replace(/｜__PRESENCE__([\s\S]*?)__\/PRESENCE__/, " | 在場來由:$1"));
  const PROMPT_PARTY_SYSTEM = partyDetailsArr.length > 0
    ? `【角色背景資料】(裝扮＝各人此刻穿的衣服，五官/髮色/體態不隨換裝改變)：${_presenceShared_ ? `\n★在場來由(以下每一位都一樣)：${_presenceShared_}` : ""}${_anySleeper_ ? `\n★標了【現況·賴床/熟睡】的人維持那個狀態演出，除非橋段已明確把人叫醒——不宜寫成清醒閒聊。` : ""}\n${_partyCards_.join("\n")}`
    : "目前這個地點沒有其他人，玩家是獨自行動的。";

  // 路人與缺席者是同一件事的兩面（誰只是背景／誰不在場），合成一條；能開口的名單在結尾講。
  const backgroundCrowdStr = `★【路人與缺席者】：路過行人、店員等不具名背景人物可自由寫來增添生活感，但只當氛圍、不追蹤。歷史提過而這回合不在的人，一句話交代去向就好。`;

  let genderHintStr = "";
  const presentRowsForGender = pcData.filter((r, i) => i !== 0 && r[COL.PC.ID] != pcId && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim() && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (presentRowsForGender.length > 0) {
    const playerSex = pc[COL.PC.SEX] || "未知";
    // 「異/無」(如開膛手傑克「無固定實體」)這類非二元性別值一律按女性向處理(對齊heroToKanshouRow_ 的肉體起始預設)。
    const sameSexF = [];
    presentRowsForGender.forEach(r => {
      const npcSexRaw = r[COL.PC.SEX] || "未知";
      const npcSex = (npcSexRaw === "男" || npcSexRaw === "女") ? npcSexRaw : "女";
      if (playerSex === "女" && npcSex === "女") sameSexF.push(r[COL.PC.NAME]);
    });
    genderHintStr = sameSexF.length
      ? `\n★【性別配對】：${sameSexF.join("、")}(女女配對)：純女女之愛，禁插入式陽具動作，以手指/舌頭/器物替代。`
      : "";
  }

  // 🛡️ 比照Core_Settings.gs讀同一欄位(mergePhysicalStatus/parseVisibleStatus)的try/catch防呆——PHYSICAL理論上只會被JSON.stringify寫入，但COL是位置索引，欄位一旦錯位/被手動改壞，這裡若沒擋，該角色從此每回合都會拋錯、永遠好不了(見CLAUDE.md「邊界先擋」)。
  let pPhysicalObj = {}; try { pPhysicalObj = JSON.parse(pcData[pcIndex][COL.PC.PHYSICAL] || "{}"); } catch (e) { }
  if (Object.keys(pPhysicalObj).length === 0) pPhysicalObj = { "狀態": "如常" };
  const _isPlainBody_ = o => Object.keys(o).length === 1 && o["狀態"] === "如常"; // 預設值＝沒事，不必送
  let nsfwMemories = `${_isPlainBody_(pPhysicalObj) ? "" : `\n[玩家『${pcName}』肉體]：${JSON.stringify(pPhysicalObj)}`}`;

  // ⚡ 提速：跟上面 presentRowsForGender 是完全相同的 filter 條件，直接複用，省掉第二次整表掃描。
  let allPresentRows = presentRowsForGender;
  allPresentRows.forEach(r => {
    let npcPhysicalObj = {}; try { npcPhysicalObj = JSON.parse(r[COL.PC.PHYSICAL] || "{}"); } catch (e) { }
    if (Object.keys(npcPhysicalObj).length === 0) npcPhysicalObj = { "狀態": "如常" };
    // 👕 裝扮已由【在場人物】那一行帶（同一個值不送兩次）；REL_MEM 的【專屬稱呼】同理走 pMemStr。
    if (!_isPlainBody_(npcPhysicalObj)) nsfwMemories += `\n[${r[COL.PC.NAME]} 肉體]：${JSON.stringify(npcPhysicalObj)}`;
  });

  // 巧遇者是還沒被召喚、沒有資料列的陌生人，明講「這次到訪期間的系統例外」，避免跟下方【在場驗證鐵律】(只有在場人物能被指名互動)打架，同時允許同一次到訪期間持續互動。
  const kanshouEncounterStr = kanshouEncounterHero ? (() => {
    const p = kanshouEncounterHero.persona || {};
    const look = p.dailyLook || p.look || "";
    const words = p.dailyWords || p.words || "";
    const isMaleMale = String(pc[COL.PC.SEX]) === "男" && String(kanshouEncounterHero.gender) === "男";
    const _encPron = pron_(kanshouEncounterHero.gender);
    const friendshipOnly = isMaleMale ? "★對方與玩家同為男性，這段交流僅止於同性情誼／夥伴／損友式互動，不發展曖昧、戀愛或情慾內容，不做任何親密肢體接觸。" : "";
    return `\n★【本回合系統指定巧遇——這次到訪期間持續有效的例外，不受【在場驗證鐵律】限制】：『${kanshouCasualOf_(kanshouEncounterHero)}』此刻恰好也在「${kanshouLocNameForAI_(kanshouEncounterLocName)}」，${kanshouEncounterMetBefore ? "是已經打過照面的熟面孔" : "是初次的邂逅"}——外貌氣質:${look}／日常個性:${words}。允許${_encPron}以真實姓名登場、持續互動，這段緣分在玩家離開這個地點前都有效，${_encPron}目前只是萍水相逢的路人：好感/關係不追蹤記錄；若情境合適，${_encPron}也可以自然道別離開，不必勉強撐到玩家換地點。${friendshipOnly}`;
  })() : "";

  const kanshouNightGuestStr = kanshouNightGuest_ ? (() => {
    const _others = pcData.filter((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r)
      && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC] || "").trim() === curL
      && String(r[COL.PC.NAME]).trim() !== kanshouNightGuest_.trim()).map(r => String(r[COL.PC.NAME]));
    return `\n★【夜訪·客觀事實】：你原本正準備歇下，『${kanshouNightGuest_}』就在這時候找上門、人已經進來了。`
      + (_others.length ? `此刻這裡還有『${_others.join('、')}』——她們原本也正要各自歇下，這一下全被打斷了。` : `此刻這裡只有你們兩人。`)
      + `這一夜要怎麼收由【玩家自己決定】：本回合只演出此刻各人依性格與好感的真實反應，【不可】替玩家留人或送客、不可自行把整夜演完。`;
  })() : "";


  const _kanshouMaxBond_ = partyRows.reduce((m, r) => Math.max(m, parseInt(r[COL.PC.BOND]) || 0), 0);
  const _intimacyLines_ = kanshouIntimacyLines_(partyRows.map(r => r[COL.PC.BOND]));
  // 📏 篇幅查表：好感給【底盤】(關係越深、值得細寫的東西越多)，這一回合真的發生了大事才拉到【上限】。
  //    舊版只看好感——場上有人 ≥60 就連一句「早安」都得寫到 700~900 字，那不是細膩、是逼 AI 灌水。
  //    ⚠ 一律給【下限~上限】而不是「約 X 字」：小模型對「約」一律往下取，實測過(見 KANSHOU_REFERENCE)。
  //    ⚠ 上限必須跟 max_tokens 一起看：JSON 固定開銷典型 757 字、欄位全滿 1057 字，narration 超出去就會被截斷成壞 JSON。
  const KANSHOU_WORDS_ = [
    { min: 60, range: '480~620', big: '700~900' },
    { min: 40, range: '400~520', big: '600~750' },
    { min: -100, range: '300~400', big: '450~580' }
  ];
  // 「大事」不靠猜——這些區塊本回合有沒有組出字串，GAS 自己最清楚。加新橋段就往這串加一個旗標。
  const _kanshouBigBeat_ = !!(kanshouConfessStr || kanshouTierCrossStr || kanshouFirstsAnnivStr
    || kanshouNightSceneStr || kanshouKnockRaidStr || kanshouCohabitStr || kanshouCohabitEndStr
    || kanshouPromiseMetStr || driveOn || /就是此刻/.test(kanshouFestivalStr));
  const _kanshouWordRow_ = KANSHOU_WORDS_.find(t => _kanshouMaxBond_ >= t.min) || KANSHOU_WORDS_[KANSHOU_WORDS_.length - 1];
  const _kanshouTargetWords_ = _kanshouBigBeat_ ? _kanshouWordRow_.big : _kanshouWordRow_.range;

  if (_pendingProposal && !_settledVerdict) {
    const _ppName = String(_pendingProposal.name || (pcData[_pendingProposal.idx] || [])[COL.PC.NAME] || "對方");
    const _ppWho = _pendingProposal.names && _pendingProposal.names.length > 1 ? '她們' : `『${_ppName}』`;
    const _ppYes = { promise: `${_ppWho}答應了這個約定`, move: `${_ppWho}答應現在一起去`, hold: `${_ppWho}讓你牽住了手` };
    const _ppNo = { promise: `${_ppWho}婉拒了這個約定`, move: `${_ppWho}婉拒了同行`, hold: `${_ppWho}沒有讓你牽` };
    _settledVerdict = (_pendingProposal.accepted ? _ppYes : _ppNo)[_pendingProposal.type] || "";
  }
  const _settledTail_ = _settledVerdict
    ? `\n【結果·系統已裁定，不可改寫】${_settledVerdict}——本回合演到這件事發生為止。`
    : "";

  const driveStr = driveOn ? `
🔥【主動掌握】：尺度一律以【親密尺度五階】為準，這一段只講【怎麼寫】：①她依自己的個性主動出擊，色度可以走在玩家前面——Dirty Talk、直白不迴避，允許範圍內盡量細膩露骨；②情慾場：大量生理特寫(絞緊/吸吮/痙攣/蜜液/水聲/啪啪)+斷續喘息破碎台詞。` : '';

  const PROMPT_REL = `${backgroundCrowdStr}
${nsfwMemories}${genderHintStr}${driveStr}
🛑【角色一致性】：劇情推進不軟化在場者的性格；情慾裡生理反應可以有，但那個人說話做事仍照自己的個性。★資料裡標「事實：」的是系統裁定的既定事實、不是演法——怎麼表現一律依那個人自己的個性。`;

  // 有【專屬稱呼】就用暱稱取代真名；JSON 姓名欄不受影響、仍填真名。
  const npcDialoguePrompt = "";  // 名單/稱呼併入結尾的【在場名單】鐵律，見下方 prompt


  // 🌱 動態 master_note 的前置計算(要在 USER prompt 組裝【之前】算好——下面【玩家命格】那行的「你可透過 master_note.經歷 滾動增補」提及必須跟著 _doSideWrite 條件化，否則非側寫回合schema 已刪掉 master_note、USER prompt 卻還在催，AI 會自發吐出 schema 外的欄位擊穿節流)。
  const _swCount = kanshouGetSideWriteCount_(pc[COL.PC.MEMORY]) + 1;
  pc[COL.PC.MEMORY] = kanshouSetSideWriteCount_(pc[COL.PC.MEMORY], _swCount);
  const _doSideWrite = (_swCount % KANSHOU_SIDEWRITE_EVERY_ === 1);

  // 剛換場景/剛跳時間就砍短 chatHistory；摘要與 chatHistory 共用這個窗口值，不各算各的。
  const _sceneCut = !!(moveTarget || kanshouTimeJumped_);
  const _histWindow_ = _sceneCut ? 2 : 6;
  const _earlierDigest_ = kanshouRecentDigest_(pcId, _histWindow_);


  // 🧊 排序原則：【穩定的放前面、每回合會變的放後面】——prompt cache 是逐 token 比對前綴，
  //    一個會變的東西插在中間，它後面全部作廢。天氣/時間原本卡在第 5 行，把整份 user prompt
  //    的可快取前綴砍到只剩 48%。唯二的例外是 🚨【收尾】與★【在場名單】：它們雖然穩定，但
  //    recency 對它們特別重要（實測過「事實寫在 20 行以前就會被 AI 當成沒發生」），故仍壓在最後。
  const prompt = `★世界觀＝和平的現代冬木市，大家都是住在這裡的普通市民，沒有魔術與從者。
${PROMPT_REL}
★【只演給的資料】：系統給的資料就是這個世界的全部，沒寫到的人/物/過往都不存在；萌點、個性只演出來，不把那幾個字寫進敘述。玩家專一對著一個人時，其他在場者維持背景輕描。
★【視角鎖定】：旁白一律用第二人稱，「你」＝玩家『${pcName}』本人，只演你實際輸入的動作與五感——你看不見自己的神情。旁白【不可】用「我」；場上每個角色引號內的台詞才用得到「我」。同伴外貌只取材各人自己那份資料。

【玩家資料】：名字:${pcName} 【性別:${pc[COL.PC.SEX]}】${(() => { const _p = formatPref(pc[COL.PC.PREF]); return _p ? ` 性格:${_p}` : ""; })()}${(() => { const _t = formatTrait(pc[COL.PC.TRAIT]); return _t ? ` | 特徵:${_t}` : ""; })()}${myOutfit ? ` | 裝扮:${myOutfit}` : ""} | 經歷:${pc[COL.PC.BACK] || "剛搬來冬木市"}
${PROMPT_PARTY_SYSTEM}
${_intimacyLines_ ? `★【親密尺度·最高優先】：肢體親密以好感為天花板，超過的那一步不會發生，怎麼擋下來依各人的個性${_intimacyLines_.indexOf('\n') >= 0 ? '（多人各依各自好感，不共用同階）' : ''}：\n${_intimacyLines_}\n` : ''}
★【篇幅】：本回合 narration 寫 ${_kanshouTargetWords_} 字，【不可少於下限】——寫不滿就往互動裡加：在場者的動作細節、觸感／氣味／聲音等感官、以及多給一次真實反應。別靠拉長環境描寫充數。
★★【地點釘死】：此刻在「${kanshouLocNameForAI_(curL)}」${(() => { const _c = kanshouLocContextForAI_(curL, getKanshouHomeName_(pc[COL.PC.MEMORY], pcName)); return _c ? `（${_c}）` : ""; })()}，敘事不離開這裡——想去別處只能嘴上聊，真要換地方由系統宣告。${moveTarget ? '你們剛到，直接從抵達後的當下寫起、路程不演。' : ''}
${kanshouWorldRosterStr}${kanshouEncounterStr}${kanshouNightGuestStr}${kanshouKnockRaidStr}${kanshouSceneAmbientStr}${kanshouAloneBondStr}${kanshouNpcLeaveStr_}${kanshouNightPartStr}${kanshouVisitBlockedStr}${kanshouTimeBlockedStr}${kanshouPromiseStr}${kanshouPromiseMetStr}${kanshouCohabitStr}${kanshouConfessStr}${kanshouInviteStr}${kanshouHandHoldStr}${kanshouHoldingStr}${kanshouPhotoStr}${kanshouShowPhotoStr}${kanshouEventSeed ? `\n★【氛圍靈感·非強制】：可自然納入一個小細節——${kanshouEventSeed}·不合劇情可不用。` : ""}${kanshouFestivalStr}${kanshouApptTodoStr}${kanshouApptWaivedStr}${kanshouCohabitEndStr}${kanshouNightSceneStr}${kanshouInitStr}
★【今日天氣】：${kanshouWeather_(curDay)}。${kanshouTierCrossStr}${kanshouFirstsAnnivStr}${kanshouFirstsStr}${kanshouAnnivStr}${intimateNightNames.length ? `\n★【入夜·好感達門檻】：『${intimateNightNames.join('、')}』與你羈絆已深(≥80)·今晚可自然發展到同床·依個性決定要不要跨出這步·不強制寫到底；未達門檻者各自安睡不越界。` : ""}${_morningHere_ ? `\n★【晨間餘韻·非強制】：昨夜與『${_morningHere_}』或許共度親密(依上回合實際內容·沒跨出就當平常早晨)·可自然帶晨間溫馨曖昧·不強制不複述細節。` : ""}${_partedAway_ ? `\n★【昨夜對方走了·非強制】：昨晚陪你到最後的『${_partedAway_}』並沒有留下過夜·可自然帶一點昨夜餘溫未散的感覺·對方此刻【不在場】·禁讓對方開口或出現。` : ""}
🕰️現在${curDateObj_.year}年${curDateObj_.month}月${curDateObj_.day}日・${kanshouFmtHM_(_narrHour_)}・${timeBand_(_narrHour_)}(揣摩氛圍用·不報時)。★光線/氣溫/作息一律依【此刻＝${timeBand_(_narrHour_)}】寫。★本回合只寫這十分鐘內的片段，時間推進由系統宣告。
${npcDialoguePrompt}${_earlierDigest_ ? `\n★【稍早做過的事】：${_earlierDigest_}——都已發生過，需要時自然呼應，別重演。` : ""}
🚨【收尾${driveOn ? '·主動掌握' : ''}】：${driveOn ? '大幅推進到位，該發生就發生，別在曖昧邊緣空轉。但仍' : ''}把最後一句留給被搭話的那個人——用那個人的答話或神情收尾，並讓那個人拋出一個玩家接得住的話題(問句、邀約、此刻在意的事都行)，停在等玩家回應的那一刻。沒有別人在場時才收在「你」的動作上。
★【在場名單】：${partyMembers.length ? `只有『${partyMembers.join('、')}』在場——開口/被觸碰的只能是這些人，其他名字即使歷史提過也不准出現，名單上每個人這回合都要真實存在(沒被搭話的人有個動作或反應即可，不必平分戲份)；有【專屬稱呼】就叫暱稱、否則叫真名。` : '沒有其他人在場。'}

接著往下演，玩家這一步是：『${finalUserMsg}${_settledTail_}』`;

  try {
    // 兩軌共用 AI_MODEL；被擋才自動換 FALLBACK_MODEL（Engine_Combat.gs 全域行為）。driveOn 只控敘事推進幅度、不換模型。
    const _timeJump = kanshouTimeJumped_;
    let aiConfig = { temperature: 1.08, top_p: 0.97, top_k: 60, repetition_penalty: 1.12, presence_penalty: 0.25, frequency_penalty: 0.25, retries: 1, model: AI_MODEL, isNsfwMode: true, max_tokens: (_timeJump && partyRows.length === 0) ? 700 : 2400 };

    // 抓取近 6 筆原始歷史(3輪)，轉換為 API 格式。
    const recentHistoryRaw = getGameHistoryBatchRaw(pcId, _histWindow_);
    if (recentHistoryRaw && recentHistoryRaw.length > 0) {
      aiConfig.chatHistory = recentHistoryRaw.map(msg => ({
        role: msg.speaker === "player" ? "user" : "assistant",
        content: String(msg.content)
      }));
    }

    // 🌱 動態 master_note：只剩經歷會滾動(性格四格/萌點已不再交給AI，見buildDefaultSystemPrompt註解)。
    const _sysPrompt = buildDefaultSystemPrompt(_doSideWrite, userData.optionsOn !== false);
    const aiResponseRaw = callGeminiAPI(prompt, _sysPrompt, aiConfig);
    // 🛡️→✅ 2026-07 邊界稽核：模型偶爾會回【截斷的 JSON】(吐到 max token 就斷)或純文字道歉，這在真實運行中是常態、不是例外。
    let aiData;
    try {
      const start = aiResponseRaw.indexOf('{');
      const end = aiResponseRaw.lastIndexOf('}');
      aiData = sanitizeAiData_(JSON.parse(aiResponseRaw.substring(start, end + 1)));
    } catch (e) {
      try { Logger.log("[actionPlay_ AI回應無法解析] " + String(aiResponseRaw).slice(0, 300)); } catch (e2) { }
      aiData = aiFallbackData_(false);
    }

    if (aiData._genFailed) {
      return JSON.stringify({ text: aiData.narration, options: aiData.options });
    }

    var kanshouPhotoResult_ = null;
    if (kanshouPhotoPending_) {
      try {
        const _phCap = String(aiData.photo_caption || `${timeBand_(curHour)}的${String(curL || "")}，${kanshouPhotoPending_.names.join('、')}的身影。`)
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
          .replace(/[<>&"'`｜【】]/g, "").slice(0, 90)
          .replace(/^[=+\-@\t\r]+/, "");
        const _phSubj = kanshouPhotoPending_.scenery ? null : pcData.find(r => String(r[COL.PC.NAME]).trim() === String(kanshouPhotoPending_.names[0]).trim() && String(r[COL.PC.FACTION]) === "從者" && sameGame(r));
        const _phHair = kanshouPhotoPending_.scenery ? '#7a9a6a' : kanshouHairHex_(_phSubj ? String(_phSubj[COL.PC.TRAIT] || "") : ""); // 風景照緞帶固定草綠
        const _phFlag = driveOn ? '親密' : (kanshouReFest_ ? kanshouReFest_.name : '');
        const _phId = 'PH_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        const _phSubjName0 = kanshouPhotoPending_.names[0] || "";
        const _phCameWithMe = !!moveTarget && kanshouPreMoveCompanions_.some(cr => String(cr[COL.PC.NAME]).trim() === _phSubjName0.trim());
        const _phActivity = _phCameWithMe ? "" : kanshouLocActivity_(curL, _phSubjName0, curDay);
        kanshouAlbumSheet_().appendRow([myGameId, _phId, curDay, timeBand_(curHour), String(curL || ""), kanshouWeather_(curDay), kanshouPhotoPending_.names.join('、'), _phActivity, _phCap, _phFlag, _phHair]);
        kanshouPhotoResult_ = { ok: true };
      } catch (e) { kanshouPhotoResult_ = { ok: false, reason: 'error' }; }
    } else if (kanshouPhotoDenied_) {
      kanshouPhotoResult_ = { ok: false, reason: kanshouPhotoDenied_ };
    }




    // 💭 AI 不得自行搬動玩家、也不再有任何欄位讓它自己提議換地方(§134·2026-07再修，玩家實測「AI一直提議移動、頭痛」後把 move_proposal 整欄砍掉)：地點只有兩條合法變動路徑——玩家自己用地圖走(moveTarget，見上游1739)，或玩家在地圖向同伴提議同去、GAS 依好感直接裁定(_pendingProposal.type==='move'，下方判定式會回填這裡)。
    let moveProposal = ""; // let：下方玩家提議同去(type:'move')她接受時會回填

    // 📅🤝 相約/牽手的成立判定：pre-AI只記了待判定(_pendingProposal)、沒動MEMORY，這裡讀AI依角色個性與好感給出的 proposal_accept 才決定要不要落地。
    if (_pendingProposal) {
      const _accepted = !!_pendingProposal.accepted;
      const _ppHer = String(_pendingProposal.name || pcData[_pendingProposal.idx][COL.PC.NAME] || "");
      if (_accepted) {
        if (_pendingProposal.type === 'promise') {
          // 🕐 約當天(today)＝存 curDay，否則照舊 curDay+1。today 已在上游驗過「該時段今天還沒過」。
          pcData[_pendingProposal.idx][COL.PC.MEMORY] = kanshouSetPromise_(pcData[_pendingProposal.idx][COL.PC.MEMORY], curDay + (_pendingProposal.today ? 0 : 1), _pendingProposal.loc, _pendingProposal.band);
          // 📅 明確回饋：後端默默寫 tag、玩家不知成沒成(實測黑洞)——回傳 proposalResult 讓前端跳通知條。
          const _prBandLabel = _pendingProposal.band ? (KANSHOU_APPT_BANDS_.find(b => b.band === _pendingProposal.band) || {}).label : "";
          kanshouProposalResult_ = { ok: true, type: 'promise', name: _ppHer, loc: _pendingProposal.loc, bandLabel: _prBandLabel, today: !!_pendingProposal.today };
        } else if (_pendingProposal.type === 'hold') {
          pcData[_pendingProposal.idx][COL.PC.MEMORY] = KANSHOU_HANDHOLD_TAG_.set(pcData[_pendingProposal.idx][COL.PC.MEMORY], _pendingProposal.name);
          // 💞 第一次牽手：記在她那一列(idx 是玩家自己，牽手 tag 才寫玩家列)。
          const _ppHerIdx = _pendingProposal.herIdx;
          if (_ppHerIdx >= 0 && pcData[_ppHerIdx]) {
            pcData[_ppHerIdx][COL.PC.MEMORY] = kanshouStampFirst_(pcData[_ppHerIdx][COL.PC.MEMORY], '牽手', curDay);
            dirtyPcRows.add(_ppHerIdx);
          }
          kanshouProposalResult_ = { ok: true, type: 'hold', name: _ppHer };
        } else if (_pendingProposal.type === 'move') {
          // 🚶 她答應同去→轉成既有「前往」泡泡(玩家按同意才真的移動，走 moveTarget 管線、帶同地眾人)
          moveProposal = _pendingProposal.loc;
          kanshouProposalResult_ = { ok: true, type: 'move', name: _ppHer, loc: _pendingProposal.loc };
        }
        dirtyPcRows.add(_pendingProposal.idx);
      } else {
        // 她婉拒同去：moveProposal 本就固定從""起始、只有上面 _accepted 分支會填，這裡不需要再清一次。
        kanshouProposalResult_ = { ok: false, type: _pendingProposal.type, name: _ppHer, loc: _pendingProposal.loc || "" };
      }
    }


    // 🚶‍♀️ 同伴自主離場(npc_exit)：AI判斷某在場同伴這回合自然告辭時，GAS真的把她移出場景——依當前時刻骰她的日常去向(獨立住民作息)，下回合就不在你身邊，解掉舊「嘴上說走卻還在場」的違和。
    {
      const exitList = Array.isArray(aiData.npc_exit) ? aiData.npc_exit : [];
      if (exitList.length) {
        const _heldNow = KANSHOU_HANDHOLD_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]);
        exitList.forEach(nm => {
          const exitName = String(nm || "").trim();
          if (!exitName) return;
          const eIdx = pcData.findIndex((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(exitName) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim());
          if (eIdx === -1) return;
          let dest = kanshouRollDailyLocation_(pcData[eIdx][COL.PC.NAME], curHour, kanshouIsCohabit_(pcData[eIdx]), pcData[eIdx][COL.PC.MEMORY]);
          if (String(dest || "").trim() === String(curL || "").trim()) {
            const eHeroId = kanshouHeroIdByName_(pcData[eIdx][COL.PC.NAME]);
            const eHome = kanshouGetHeroHome_(eHeroId, pcData[eIdx][COL.PC.MEMORY]);
            dest = (eHome && eHome !== '自己的住處' && eHome !== curL) ? eHome
              : ((KANSHOU_LOCATIONS_.filter(l => l.region !== 'room' && l.region !== 'visit' && !l.dateOnly && l.name !== curL)[0] || {}).name || dest);
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

    {
      const relChangesToProcess = Array.isArray(aiData.rel_changes) ? aiData.rel_changes : [];

      relChangesToProcess.forEach(rc => {
        if (!rc || typeof rc !== 'object') return;
        const tNpc = rc.target ? String(rc.target).trim() : String(rc.npc || "").trim();
        if (!tNpc || tNpc === pcName || tNpc === "自己") return;

        // 羈絆已併入該 NPC 自己列（BOND/REL_TAG）——找不到該人此局的列就無可寫入。
        const nIdx = pcData.findIndex(r => kanshouNameCandidates_(r[COL.PC.NAME]).includes(tNpc) && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
        if (nIdx === -1) return;
        if (String(pcData[nIdx][COL.PC.LOC] || "").trim() !== String(curL || "").trim()) return;
        dirtyPcRows.add(nIdx);

        // 鑑賞允許好感依劇情推進（solo 的好感收歸 GAS 按鈕，走不同的 narrate_only 路徑，不受這裡影響）。（全文見 CODE_NOTES.md）
        let change = Math.max(-5, Math.min(5, parseInt(rc.fav_change) || 0));

        let oldFav = parseInt(pcData[nIdx][COL.PC.BOND]) || 0;
        let newFav = Math.max(-100, Math.min(100, oldFav + change));
        if (change > 0) newFav = Math.min(newFav, kanshouRelChatCeiling_(oldFav));

        // REL_TAG 不允許AI直接指定文字寫入，好感變動後GAS依kanshouSyncRelTier_自動升降級；
        pcData[nIdx][COL.PC.BOND] = newFav;
        if (change <= -KANSHOU_CHILL_MIN_DROP_) pcData[nIdx][COL.PC.MEMORY] = KANSHOU_CHILL_DAY_TAG_.set(pcData[nIdx][COL.PC.MEMORY], curDay);
        kanshouSyncRelTier_(pcData, nIdx);
      });
    }



    if (aiData.intimacy_feedback) {
      // 🔴 防禦機制：過濾掉 AI 偷懶不想更新狀態時的敷衍用語
      const ignoreWords = ["維持現狀", "無變化", "不變", "維持", "同上", "保持現狀", "沒有變化"];

      // physical_state 只管神色。
      const sanitizePhysicalState = (rawState) => {
        if (typeof rawState !== 'string') return "";
        let val = rawState.trim();
        if (!val || ignoreWords.includes(val)) return "";
        if (val.length > 20) {
          const cut = val.slice(0, 20);
          const m = cut.match(/^[\s\S]*[，、。；！？]/); // 貪婪：取預算內最後一個標點為止
          val = m ? m[0].replace(/[，、；]$/, "") : cut;  // 尾巴的逗號/頓號拿掉，句號驚嘆號保留
        }
        return ignoreWords.includes(val) ? "" : val;
      };

      const sanitizeAppearanceExtras = (rawOutfit) => {
        if (typeof rawOutfit !== 'string') return "";
        const val = rawOutfit.trim()
          .replace(/^(剛?(換|穿|披|套|繫|着|著)上了?|換回了?|改穿了?)\s*/, "")
          .replace(/^(一件|一身|一套|一襲)\s*/, "")
          .replace(/[。！!，,]+$/, "").trim();
        return (!val || ignoreWords.includes(val)) ? "" : val;
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

      // 💞 共同回憶(27欄 MEMOIR)：同 processTags 精神——append 去重、保留最近 maxCount 條。
      const processMemoir_ = (oldMemoir, newLine, maxCount) => {
        let arr = String(oldMemoir || "").split('｜').map(x => x.trim()).filter(x => x !== "" && x !== "無");
        let clean = String(newLine || "").replace(/[｜【】\[\]★]/g, "").trim().slice(0, 40);
        // 🛡️ 相似度去重(玩家實測「超級洗畫面」)：同一事件在3輪歷史窗裡迴盪，Gemini每回合換句話說重記一條(「約定去社區公園」記了四種說法)。
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
      }

      if (Array.isArray(aiData.intimacy_feedback.npcs)) {
        aiData.intimacy_feedback.npcs.forEach(nfb => {
          if (!nfb || typeof nfb !== 'object') return;
          const tName = String(nfb.name || "").trim();
          if (!tName || tName === pcName || tName === "自己") return;
          // 同款括號全名比對問題(見上方 kanshouNameCandidates_)，這裡也會影響每回合寫入失敗。
          const targetIdx = pcData.findIndex(r => kanshouNameCandidates_(r[COL.PC.NAME]).includes(tName) && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
          if (targetIdx === -1) return;
          if (String(pcData[targetIdx][COL.PC.LOC] || "").trim() !== String(curL || "").trim()) return;

          dirtyPcRows.add(targetIdx);
          const nCleanState = sanitizePhysicalState(nfb.physical_state);
          if (nCleanState) pcData[targetIdx][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[targetIdx][COL.PC.PHYSICAL], nCleanState);
          const nAppearanceExtras = sanitizeAppearanceExtras(nfb.appearance_extras);
          if (nAppearanceExtras) pcData[targetIdx][COL.PC.MEMORY] = setOutfit_(pcData[targetIdx][COL.PC.MEMORY], nAppearanceExtras);

          // 羈絆記憶已併入該 NPC 自己列的 REL_MEM 欄，現在只剩專屬稱呼。
          let oldRMem = pcData[targetIdx][COL.PC.REL_MEM] || "";
          // 🔒 2026-07 五度改版·玩家透過 kanshou_set_nickname 手動鎖定過專屬稱呼後(【稱呼鎖】是)，AI 不再自動累加新稱呼進來——尊重玩家的手動選擇，同 kanshouSyncRelTier_ 對自訂關係稱呼「一旦手動改過就不再被自動覆寫」的精神。
          const nickLocked = /\[稱呼鎖\]是/.test(oldRMem);
          let nickPart = nickLocked
            ? `[專屬稱呼]${getNickname_(oldRMem) || "無"}| [稱呼鎖]是`
            // 🔒 AI 給的稱呼一律先過 sanitizeNickname_(逐項消毒＋限長)——見該函式說明：這格能偽造欄位。
            : `[專屬稱呼]${processTags(oldRMem, /\[專屬稱呼\](.*?)(?=\| \[|$)/,
              String(nfb.mutual_nicknames || "").split('、').map(sanitizeNickname_).filter(Boolean).join('、'), 3)}`;
          // 🗑 2026-07 態度不再落地（見 relMemMemoryStr_ 的說明：它是會自我鎖死的形容詞標籤）。
          pcData[targetIdx][COL.PC.REL_MEM] = nickPart;

          // 💞 共同回憶：AI 這回合若吐了里程碑 memory，append 進她自己列的 27 欄(最近 10 條、去重)。
          if (nfb.memory && String(nfb.memory).trim() && String(nfb.memory).trim() !== "無") {
            pcData[targetIdx][COL.PC.MEMOIR] = processMemoir_(pcData[targetIdx][COL.PC.MEMOIR], nfb.memory, 10);
          }
        });
      }
    }

    // 🌱 玩家御主「滾動側寫」(master_note)：2026-07 再修（玩家「萌點AI根本亂寫...AI只能改動經歷」）——性格四格與萌點已在創角時由AI一次生成完整(見actionBackfillKanshouAi)，遊玩期間AI完全看不到這兩類欄位(schema已拿掉)、也就無從寫。
    if (_doSideWrite && aiData.master_note && typeof aiData.master_note === 'object') {
      const mn = aiData.master_note;
      // 經歷：AI 承接舊值增補後回傳整段，這裡直接採用；空/未給則保留原經歷不動。
      const _newExp = String(mn["經歷"] || "").replace(/[<>【】｜]/g, "").trim().slice(0, 80);
      if (_newExp) { pcData[pcIndex][COL.PC.BACK] = _newExp; dirtyPcRows.add(pcIndex); }
    }

    const pcColCount = Object.keys(COL.PC).length;

    // 競態修：play 豁免寫入鎖(AI 呼叫佔數秒會卡全域)，但上面的列索引是 AI 呼叫【前】讀到的——期間其他上鎖動作若刪列，索引會位移。
    if (_pendingNewPcRow_) sheets.pc.appendRow(_pendingNewPcRow_);
    const liveIdx = buildLiveIdIndex_(sheets.pc);

    // MAX_HP/MAX_MP 重算只針對有變動的行，不全表掃描
    dirtyPcRows.forEach(idx => {
      const row = pcData[idx];
      if (!row) return;
      const id = String(row[COL.PC.ID] || "");
      if (!id.startsWith("PC_") && !id.startsWith("NPC_") && !id.startsWith("DEAD_") && !id.startsWith("KPC_") && !id.startsWith("KSV_") && !id.startsWith("KHV_")) return;
      const curIdx = liveIdx[id];
      if (curIdx === undefined) return; // 列在 AI 呼叫期間被刪(競態) → 安全跳過

      while (row.length < pcColCount) row.push("");

      // 只寫這一行，不寫全表(用重定位後的真實列索引)
      sheets.pc.getRange(curIdx + 1, 1, 1, pcColCount).setValues([row]);
    });

    curL = pcData[pcIndex][COL.PC.LOC];

    // 橋段邀請按鈕(夜襲/賴床/地點/節慶共用)：candidate在回合開頭(任何LOC寫入之前)就算好了，這裡直接沿用，不應該重算——重算會撞回「同行同伴LOC已被同步」的舊bug。
    const encounterOffer = kanshouEncounterHero ? { name: String(kanshouCasualOf_(kanshouEncounterHero)) } : undefined;

    const localPeopleList = getKanshouPeopleList_(pcId, curL, pcData);

    let finalResponseText = aiData.narration || "天地混沌，一片寂靜。";
    finalResponseText = finalResponseText.replace(/\n/g, "<br>");






    // 好感度渲染／血量變化顯示區塊皆不輸出：好感度不顯示在敘述介面上，鑑賞無戰鬥不顯示血量變化。






    saveGameHistoryBatch(pcId, [
      { speaker: "player", content: userMsg },
      { speaker: "ai", content: String(aiData.narration || "").replace(/<br\s*\/?>/gi, "\n") }  // 用原始 narration 不用 finalResponseText
    ]);

    // 提速：pcData 這裡已是本回合全部異動寫回後的權威陣列，直接複用它建一份跟 get_tags 同格式的 payload 夾帶回去，省掉前端另打一趟 get_tags 的 round-trip；建構失敗就不夾帶，前端會自動退回原本的 get_tags 補呼叫。
    let tagsPayload = null;
    try { const tp = buildTagsPayload_(sheets, pcId, pcData); if (tp && tp.success) tagsPayload = tp; } catch (e) { }

    let kanshouClock = null;
    try { kanshouClock = kanshouClockInfo_(pcData[pcIndex]); } catch (e) { }

    return JSON.stringify({
      text: finalResponseText,
      statusString: buildPlayerStatusString(pcData[pcIndex]),
      people: localPeopleList,
      options: aiData.options,
      tags: tagsPayload,
      moveProposal: moveProposal || undefined,
      cohabitOffer: kanshouCohabitOffer_ || undefined,
      // 🚪 善後選項【只在她進門那一回合給一次】(2026-07 玩家「就只要問一次就好」)。
      nightGuest: kanshouNightGuest_ || undefined,
      encounterOffer: encounterOffer,
      proposalResult: kanshouProposalResult_ || undefined,
      promiseSettle: kanshouPromiseSettle_.length ? kanshouPromiseSettle_ : undefined, // 📅 赴約/爽約結算通知陣列(獨立通道·不與提議結果搶單槽·可同時容納多筆)
      promiseWait: kanshouPromiseWait_ || undefined,
      photoResult: kanshouPhotoResult_ || undefined,
      kanshouClock: kanshouClock,
      // 修過的bug：#clock-hud讀共用的updateClock(data.clock,...)，但data.clock在鑑賞這條路徑上從來沒被設過，導致HUD一直被當成「沒有clock」隱藏。
      clock: kanshouClock ? kanshouClock.label : ""
    });

  } catch (e) {
    return JSON.stringify({ success: false, message: "系統暫時發生錯誤，請再試一次。" });
  }
}

function actionGetAlbum(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = kanshouPcIdx_(pcData, pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, photos: [] });
  const gid = String(pcData[pIdx][COL.PC.GAME_ID] || "");
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
      hair: String(rows[i][10])
    });
  }
  return JSON.stringify({ success: true, photos: photos, cap: KANSHOU_ALBUM_CAP_ });
}
// 刪照片：只能刪自己這局的(照片ID＋遊戲ID雙比對)，相簿滿了得騰位子才能再拍。
function actionAlbumDelete(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = kanshouPcIdx_(pcData, pcId);
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
