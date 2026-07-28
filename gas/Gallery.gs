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
  // 🛡️→✅ 2026-07 邊界稽核：options 是原樣轉發給前端、一個字串長一顆按鈕的欄位，卻從沒設過上限。
  //   schema 要 4 個，但模型失控時回 50 個 × 每個上百字，前端就照單全收長出一整片按鈕牆。
  //   輸入當不可信：這裡一併夾好數量與長度，前端不必再各自防。
  if (Array.isArray(aiData.options)) {
    aiData.options = aiData.options
      .filter(o => typeof o === 'string' && o.trim())
      .slice(0, 6)
      .map(o => o.trim().slice(0, 60));
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

// 帳號歸屬驗證：KPC_ ID 只用 Date.now()、理論上可預測，原本每個 kanshou handler 各自反查
//   「帳號」表的 KPC 欄位確認呼叫者身分。2026-07 稽核抓到系統性漏洞後，這道驗證已上移到
//   dispatcher 統一擋(`handleGameAction`→`verifyPcOwnership_`，見 Router_Action.gs)，所有
//   經 ActionRouter 派發的 handler 進來前都已驗過——這裡只需要純索引查找，不必再反查一次
//   帳號表(那會是同一份帳號表在同一趟請求裡的第二次整表讀，純浪費)。
function kanshouPcIdx_(data, pcId) {
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

// 🔤 translateLookToDaily_/translatePersonalityToDaily_/translateMoeToDaily_ 共用開場白：三者
//   系統提示詞都以「你是《命運停駐之夜》的角色側寫顧問。★【語言】」起手(look段多一句JSON欄位名
//   例外，各自保留在自己的規則段落裡，不動這段共用前綴的字面)。
const KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_ = "你是《命運停駐之夜》的角色側寫顧問。★【語言】";
// 🔧 共用呼叫殼子：try/callGeminiAPI/catch-fallback原值三者結構相同，只有「怎麼從API原始回傳值
//   算出最終結果」跟「失敗時的保底值」不同——resultMapper 在 try 內把 raw 轉成最終回傳值(沿用
//   原本各自的 JSON.parse/String(...).trim() 等寫法)，任何一步拋錯都跟原本一樣落到 fallbackValue。
function kanshouDailyTranslateCall_(prompt, sys, apiOpts, resultMapper, fallbackValue) {
  try {
    return resultMapper(callGeminiAPI(prompt, sys, apiOpts));
  } catch (e) { return fallbackValue; }
}

// 把戰時外貌(如「貼身黑色戰甲勁裝」)轉譯成現代日常穿搭/外型：本相不變、戰甲換成日常打扮；
//   呼叫端(召喚/奪杯封存)僅一次性觸發，失敗時原樣退回戰時描述。
// dailyMoeHint：私密一面與萌點是兩次獨立 AI 呼叫，容易各自發想撞成同一件事，故傳入已算好的
//   dailyMoe 明講「私密一面不可跟這句萌點重複」。
function translateLookToDaily_(name, cls, rawLook, firstP, speech, dailyMoeHint, sex) {
  var look = String(rawLook || "").trim();
  if (!look) return { look: "", outfit: "" };
  // 🐛→✅ 玩家反饋：女性角色的「外貌本相」段常常只寫髮色/瞳色，體態/身材完全空白——
  //   明確要求納入身形/胸圍等身材描寫，讓AI日後描寫外貌時有東西可用，不必臨場瞎編。
  //   幼女/孩童型角色(如伊莉雅絲菲爾)不適用，交給玩家自訂的rawLook本身判斷、不強加。
  var figureHint = (sex === "女") ? "，若角色是成年女性、務必包含身形/胸部具體描寫，但要寫成自然的敘述句(如「胸前豐盈」「身形纖瘦」)、不要用「巨乳」這類生硬孤立的分類標籤直接呈現——這句話會顯示在玩家看得到的狀態欄位；「豐滿」單獨出現不夠明確，須明確扣連到胸部，不要只寫髮色瞳色就交差" : "";
  var sys = KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_ + "除JSON欄位名本身外，所有輸出內容一律使用繁體中文，不得夾雜英文或其他語言字母。玩家提供一段用「、」或「・」分隔的角色戰時外貌描述" +
    "(前面數段是外貌本相與戰時攻防裝束，最後一段是整體氣質／神情)，以及她的第一人稱自稱、說話語氣。" +
    "這是 Fate／聖杯戰爭的平行世界日常線，想像《衛宮家今天的餐桌風景》那種基調——換上現代日常穿搭，" +
    "但一看就知道是她本人。請輸出兩樣東西：\n" +
    "①look：日常版「外貌」四短句、頓號分隔，每句精簡收束、避免堆疊多重子句，依序為[外貌本相(髮色/瞳色/五官/體態等，不含服裝)" + figureHint + "]、" +
    "[氣質舉止(依和平日常情境自然轉化，但性格底色不變，不可變成另一個人的氣質；【不可與下方口氣段用相同字眼重複描述】，例如兩段都寫「溫柔」「謙恭」)]、" +
    "[自稱與口氣：固定格式「自稱「" + (firstP || "我") + "」，再接一句依她原本說話語氣(" + (speech || "無特別描述") + ")寫成的日常口氣描述」]、" +
    "[卸下心防的私密一面(這個角色只有放下戒備才會流露的一個具體、生活化、忠於其性格的小可愛面向，" +
    "【必須用看得到的具體小動作或情境呈現(show-don't-tell)，禁止直接說出她的內心想法/動機/情感獨白——如「心裡一直惦記著…」「其實很在意…」這類直述寫法一律不允許】，也不要只是把她的性格或喜好換句話說(那屬於性格欄)，" +
    "不可空泛或套用他人" + (dailyMoeHint ? "；這個角色的招牌萌點已經是「" + dailyMoeHint + "」，這一格【禁止】重複或換句話說同一件事，必須是完全不同的另一個生活切面(小動作/小習慣/情緒觸發點)" : "") + ")]。\n" +
    "②outfit：一句她今天的日常穿搭，保留原本服裝的色系/風格精神、換成現代日常款式，盡量貼近原味，" +
    "不要跟look的內容重複。\n" +
    "★輸出合法 JSON、禁 Markdown：{\"look\":\"四短句頓號分隔\",\"outfit\":\"一句日常穿搭\"}";
  var prompt = "角色：" + name + "（" + cls + "）\n戰時外貌描述：" + look;
  return kanshouDailyTranslateCall_(prompt, sys, { temperature: 0.7, ignoreLaw: true }, function (raw) {
    var out = JSON.parse(raw || "{}");
    // 🐛→✅ 稽核抓到：AI回傳的look段數從未驗證就直接持久化——下游dailySpeechByName_/
    //   heroToKanshouRow_都用裸split('、')[2]取「自稱與口氣」，只檢查length>=4(非===4)，若AI
    //   吐出5段以上(氣質舉止的自然語句意外夾帶頓號很常見)，取到的會是被推移過的錯誤段落且不會
    //   崩潰、靜默錯用，還會被懶惰快取永久保留。比照parseTraitsHelper既有的四段式正規化(截斷多餘/
    //   補齊不足)在寫入源頭就鎖死4段，不留給每個下游各自防呆。
    var rawOutLook = String(out.look || "").trim() || look;
    return { look: parseTraitsHelper(rawOutLook, look), outfit: String(out.outfit || "").trim() };
  }, { look: look, outfit: "" });
}

// 跟 Core_Settings.gs 的 enrichPersonalityLikesDislikes_ 不同：那個只補缺項、維持戰時語境給
//   solo 用；這個額外把戰場語境短句(戰意/殺意等)轉譯成適合日常展現的等價說法，只用於鑑賞。
function translatePersonalityToDaily_(name, cls, rawWords, lookPrivateHint) {
  var words = String(rawWords || "").trim();
  if (!words) return words;
  var sys = KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_ + "所有輸出內容一律使用繁體中文，不得夾雜英文或其他語言字母。玩家提供一位角色在聖杯戰爭(戰時)既有的性格短句" +
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
  return kanshouDailyTranslateCall_(prompt, sys, { temperature: 0.75, ignoreLaw: true, plainText: true }, function (raw) {
    var out = String(raw || "").trim();
    return out || words;
  }, words);
}

// 戰時萌點常靠戰爭/創傷撐出沉重反差，直接照搬到沒發生過聖杯戰爭的平行世界會顯得莫名沉重——
//   改寫成輕量、會心一笑的日常萌點。只用在 AI 原創(ai_gen)英靈；canon 種子英靈已手寫死進
//   persona.dailyMoe(見 Seed_Codex.gs)。
//   🐛→✅ 萌點≠反差萌：萌點泛指任何讓人喜歡上這角色的特色，可能是反差(表面兇其實軟)，也可能
//   只是單純討喜的外觀/行為/習慣(巨乳、雙馬尾、大食、路痴等)——之前這裡連措辭都寫死成「反差萌」，
//   逼AI每次都硬套反差句型，見 SOLO_REFERENCE.md 相關章節。
function translateMoeToDaily_(name, cls, rawMoe) {
  var moe = String(rawMoe || "").trim();
  if (!moe) return moe;
  var sys = KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_ + "所有輸出內容一律使用繁體中文，不得夾雜英文或其他語言字母。玩家提供一位角色在聖杯戰爭(戰時)既有的「萌點」" +
    "一句話——這種戰時萌點常常是靠沉重背景撐出來的(創傷/自卑/孤獨/悲劇宿命等)，形式不拘：可能是" +
    "反差(表面兇其實軟)，也可能只是單純討喜的外觀/行為/習慣特色。這個角色現在要" +
    "進入一個【平行世界的日常線】：這裡從來沒有發生過聖杯戰爭這回事(她依然是同一位英靈，只是活在" +
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
    return out.slice(0, 30) || moe;
  }, moe);
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
  // 🏠 2026-07 七度改版：查無專屬豪邸(KANSHOU_HERO_HOME_)就隨機分配一間泛用住處(KANSHOU_GENERIC_
  //   HOME_POOL_)，讓她也有家可拜訪/可被夜襲——一次分配、寫進【住處】記憶標記，之後由
  //   kanshouGetHeroHome_ 統一讀取，永久持有(不重骰、不會搬家)。
  if (!KANSHOU_HERO_HOME_[String(heroRow[COL.HERO.ID])] && KANSHOU_GENERIC_HOME_POOL_.length) {
    var _homePick = KANSHOU_GENERIC_HOME_POOL_[Math.floor(Math.random() * KANSHOU_GENERIC_HOME_POOL_.length)];
    sRow[COL.PC.MEMORY] = setKanshouHeroHome_(sRow[COL.PC.MEMORY], _homePick.name);
  }
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
// 🔒 好感棘輪的門檻表(2026-07 玩家定案「鎖在已達成的門檻」)：好感可以掉，但不會退回已經跨過的
//   那道門檻以下。理由是掉分不對稱——加分被 kanshouRelChatCeiling_ 夾住，扣分完全不夾，而且 AI
//   每回合就能給到 -5(rel_changes)、下限一路到 -100；一次誤判就能把玩家經營兩週的同居抹掉，
//   而失去的東西(同居/親密尺度/夜訪資格/拜訪權)全都要再跑一次約會或橋段才拿得回來。
//   數字不鎖：她今天心情不好、好感從 95 掉到 91，AI 照樣讀得到、照樣冷淡；只是不會退階。
//   ⚠ 刻意寫成函式而非模組層常數：KANSHOU_COHABIT_BOND_ 宣告在本檔後面(const 有 TDZ)，
//   模組層直接引用會炸；函式內求值是在呼叫當下，那時全部常數都備妥了。
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
  // 🔒 棘輪先跑：先把「這輩子跨過的最高門檻」記下來，再用它當地板夾住這次的值。必須在下面
  //   REL_TAG／同居同步【之前】——那兩者都讀 bond，讀到未夾的值就會做出跟棘輪矛盾的降階。
  const _reachedWas = KANSHOU_BOND_FLOOR_TAG_.get(pcData[idx][COL.PC.MEMORY]);
  // 🏠 已同居⇒地板至少是同居門檻。這條不是錦上添花，是補一個只會發生一次卻真的會發生的洞：
  //   棘輪上線【之前】就存在的存檔沒有【好感底線】，若某人當時是 92＋同居中，第一次爽約 -5 之後
  //   才第一次跑到這裡，算出來的地板是 80(87 已經掉出 90 那一格)，於是 87≥80 不夾、下面同居檢查
  //   87<90 照樣把她掃地出門。把「同居中」本身當成一次到過 90 的證據，順便把這種列往上補齊，
  //   而不是把人趕走。玩家定案：同居成立後不因任何事情解除。
  const _reachedNow = Math.max(_reachedWas, kanshouBondFloorOf_(bond),
    kanshouIsCohabit_(pcData[idx]) ? KANSHOU_COHABIT_BOND_ : 0);
  if (_reachedNow !== _reachedWas) pcData[idx][COL.PC.MEMORY] = KANSHOU_BOND_FLOOR_TAG_.set(pcData[idx][COL.PC.MEMORY], _reachedNow);
  if (bond < _reachedNow) { bond = _reachedNow; pcData[idx][COL.PC.BOND] = bond; }
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
    // 🐛→✅ 2026-07 玩家「有沒有類似這種問題的、會讓玩家疑惑的」：解除本身是對的，但整個過程
    //   【完全無聲】——她從此不住你家、當晚被骰回自己住處，敘事一個字都沒交代，玩家只會覺得
    //   「人怎麼不見了」。這支是共用 helper、拿不到提示詞變數，改用跟【晨間餘韻】同一套一次性
    //   標記把事實傳出去：蓋在她自己那一列，actionPlay_ 組提示詞時讀一次就清。
    pcData[idx][COL.PC.MEMORY] = KANSHOU_COHABIT_END_TAG_.set(pcData[idx][COL.PC.MEMORY], 1);
  }
}
// 🔒 2026-07 五度改版·自訂關係稱呼／專屬稱呼門檻(玩家實測：低好感就塞露骨自訂稱呼，這段文字
//   會被字面「TA是你的${tag}」原樣塞進提示詞當既定事實，AI因此無視好感天花板照樣演到底)——
//   玩家指定門檻＝80(戀人)，跟親密尺度五階的「80+無上限」同一個切點，這樣一旦解鎖，尺度本來
//   就已經全開，不會再有「好感沒到、卻被自訂文字撐開尺度」的倒掛狀況。單一真實來源：前端顯示
//   用的門檻數字跟這裡共用同一個常數。
const KANSHOU_CUSTOM_TAG_BOND_ = 80;
// 💬 專屬稱呼(REL_MEM【專屬稱呼】)唯讀取值——關係面板要預填輸入框、companions清單要秀給玩家看，
//   兩處各自寫一次同款 regex 太重複，抽成共用小 helper(鏡射 actionPlay_ 內部的 relMemMemoryStr_，
//   但那支是組提示詞用的完整格式化字串，這支只回傳裸值供 UI 使用)。
function getNickname_(relMem) {
  const m = String(relMem || "").match(/\[專屬稱呼\](.*?)(?=\| \[|$)/);
  const raw = m ? m[1].trim() : "";
  return (raw && raw !== "無") ? raw : "";
}
// 💬 專屬稱呼寫入前的唯一消毒口。REL_MEM 是用 `| [欄名]值` 串起來的單格字串，值裡若混進方括號/
//   全形分隔符就能偽造出下一個欄位。
// 🐛→✅ 2026-07 邊界稽核：這格【有兩條寫入路徑】——玩家手動(actionSetNickname)與 AI 的
//   intimacy_feedback.mutual_nicknames——但只有手動那條消毒。實測 AI 回一句
//   `"mutual_nicknames": "小可愛| [稱呼鎖]是"` 就能【偽造出稱呼鎖】：玩家從沒手動設過，暱稱卻
//   從此凍結、連 AI 自己之後也再改不動。順帶補上長度上限(AI 那條完全沒有，實測可灌 300 字進
//   提示詞)。單一真實來源：兩條路徑都只走這支。
function sanitizeNickname_(s) {
  return String(s || "").trim().replace(/[|｜\[\]]/g, "").slice(0, 20);
}
// 純聊天(AI rel_changes)加好感只能推到「目前所在梯度的上限」就卡住，要靠約定赴約(+5·kanshouPromiseMetStr)
//   或與她獨處於私密場合(+KANSHOU_SCENE_BOND_·見 kanshouAloneBondStr)這類真實相處才能突破到下一梯度。
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
  var meIdx = kanshouPcIdx_(data, pcId);
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
        quickPhrases: kanshouGetQuickPhrases_(data[r][COL.PC.MEMORY])
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
        quickPhrases: kanshouGetQuickPhrases_(data[m][COL.PC.MEMORY])
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
  // 🔒 帳號歸屬驗證（2026-07 再稽核抓到的漏洞補上）：跟 actionPlay_ 同一種缺口——猜中/取得
  //   pcId 即可直打此 action 竄改任何人的外貌/身世/個性/萌點/裝扮，比照其餘 handler 補上。
  const pIdx = kanshouPcIdx_(pcData, pcId);
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

★【語言】除 JSON 欄位名本身外，所有輸出內容一律使用繁體中文，不得夾雜英文或其他語言字母；玩家描述若含英文人名/詞彙，請意譯或音譯成中文寫入。
★【萌點怎麼寫】萌點/設定是【給你內化的素材】，禁複述字面：情境對了才讓它自然浮現一次·不必每回合硬塞·連續回合勿重複同一個具體動作(牽涉隨身物品時尤忌每次都靠「摸/看一眼」交差)。
★【四格·格式鐵律】traits 與 personality 各【恰好4段】，只用頓號「、」分隔成4段，【絕對不要用句號「。」或半形句點】，每段是一個【簡短詞組】(不是完整句子)，每段內部也【不要】再用頓號列舉多項；禁數字標籤。
- traits：外貌、氣質舉止、自稱與口氣(第一人稱·如 我/俺/吾＋說話語氣)、卸下心防的私密一面。${finalSex === '女' ? '外貌段務必包含身形/胸部具體描寫，但要寫成自然的敘述句(如「胸前豐盈」「身形纖瘦」)、不要用「巨乳」這類生硬孤立的分類標籤直接呈現——這句話會顯示在玩家看得到的狀態欄位；「豐滿」單獨出現不夠明確，須明確扣連到胸部，不要只寫髮色瞳色就交差。' : ''}範例：「黑長直髮琥珀瞳、氣質溫婉恬靜、自稱「我」語氣輕柔、私下愛對植物自言自語」
- personality：日常表象、真實內裡、喜歡的事物、討厭的事物。範例：「文靜內向、內心溫柔細膩、照顧小動物與植物、大聲喧嘩與浪費食物」
★npc_intent：一句【簡短】萌點（讓人喜歡上這角色的特色，≤18字，系統會在30字處硬性截斷、務必精簡），結合此人身分性格，要可愛、獨特——形式不拘，可以是反差(表面X其實Y)，也可以是單純討喜的外觀/行為/習慣特色(如巨乳、雙馬尾、大食、路痴等)，不強求一定要寫成反差句型。務必寫完整一句話，不可斷在句意未完處。【禁】誤用聖杯戰爭機制專有詞(令咒/寶具/魔術迴路/從者/職階等)當裝飾性魔法元素湊萌點——這個平行世界從未發生過聖杯戰爭，這些詞在這裡沒有來由，請改用生活化情境(手作/習慣/小癖好等)。★這個萌點必須是單看了會覺得溫馨、正面、會心一笑的日常小萌點，【禁】靠創傷/自卑/孤獨/悲劇宿命撐出來——那是戰時角色才需要的沉重寫法，這裡是輕鬆的日常後日談。
★background：限20字，呼應其身世，不出現具體物品名，語氣平和溫馨，不涉及聖杯戰爭或任何戰爭史。
★outfit：一句她/他今天的日常穿搭(限20字)，依外貌與個性方向自然搭配(如文靜者素雅、活潑者亮色休閒)，純日常便服/居家/外出風格，不含任何戰甲/武裝/戰鬥裝束字眼。
★【勿輸出數值】戰力數值一律不需要，也不要輸出地點。

★【輸出】合法 JSON、禁 Markdown：
{"background":"限20字","traits":"四格頓號字串","personality":"四格頓號字串","npc_intent":"結合此人身分的獨特可愛萌點(不限反差)，一句話","outfit":"一句日常穿搭"}`;

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
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
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
      // 🆔 2026-07「整體重構·id優先」：補id讓前端能存起來隨後續action(牽手/邀同居/相約/結識等)回傳，
      //   後端才有id可用、不必只靠名字(kanshouNameCandidates_別名表已處理大部分情況，但id才是真正杜絕
      //   撞名/前綴混淆的單一真實來源)。
      current.push({ id: String(data[i][COL.PC.ID]), name: String(data[i][COL.PC.NAME]), tag: String(data[i][COL.PC.REL_TAG] || "點頭之交"), nickname: getNickname_(data[i][COL.PC.REL_MEM]), bond: parseInt(data[i][COL.PC.BOND]) || 0, loc: loc, locLabel: kanshouRoomDisplayName_(loc, data, gid, myName, meIdx), isHere: loc === myLoc, promise: _pm ? { loc: _pm.loc, date: _pmDate.month + '/' + _pmDate.day, time: _pmTime || '' } : null, memoir: String(data[i][COL.PC.MEMOIR] || "").split('｜').map(function (s) { return s.trim(); }).filter(Boolean), props: kanshouGetProps_(data[i][COL.PC.MEMORY], propCatalog) });
    }
  }
  // 🔒 propBond/propCap：裝備好感門檻與同時裝備上限，下傳給前端鎖按鈕/寫提示文案用。**不讓前端自己寫死 80**——前端手抄後端
  //   常數是這個專案犯過的錯，改了一邊另一邊就走鐘；由這裡下傳，KANSHOU_PROP_EQUIP_BOND_ 永遠是唯一真相。
  return JSON.stringify({ success: true, current: current, customProps: kanshouGetCustomProps_(me[COL.PC.MEMORY]), quickPhrases: kanshouGetQuickPhrases_(me[COL.PC.MEMORY]), propBond: KANSHOU_PROP_EQUIP_BOND_, propCap: KANSHOU_PROP_EQUIP_CAP_ });
}

// 🎀 快速輸入貼圖·玩家自訂(2026-07「表情包文字也想自訂」，同月再縮減內建數量)：4個內建貼圖(害羞/
//   小聲/苦笑/臉紅)寫死在Script_Kanshou.html(KC_QUICK_PHRASES_BUILTIN_)純前端顯示，這裡只管玩家
//   自己額外新增的——存玩家列MEMORY【快速貼圖】text1,text2,...，
//   逗號分隔比照【自訂道具】同款寫法。純文字清單(不像道具需要強度/部位等子欄位)，點下去一樣只是
//   把文字塞進輸入框游標處(不送出)，玩家自己決定要不要送——後端只負責存/取這份清單。
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
//   釘選=條目加 ★ 前綴(processMemoir_ 淘汰舊條目時永不驅逐★)；刪除=整條移除。
//   op: 'pin'|'unpin'|'del'；item=條目原文(不含★)。帳號歸屬已由 dispatcher 統一驗過，這裡只需索引查找同 gid 的列。
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

// ⚧ 切換後日談御主 avatar 的性別（隨時可改；只動 SEX 欄，不影響從者/歷史）。pcId＝KPC_。
// 除驗證新性別合法，也要檢查會不會跟現有「同行」同伴組成不合規配對(比照
//   actionKanshouSummonHero 的規則)，避免御主切換性別後跟既有同伴悄悄變成不合規配對。
function actionKanshouSetSex(userData, pcId, sheets) {
  var newSex = String(userData.pcSex || "").trim();
  if (newSex !== "男" && newSex !== "女") return JSON.stringify({ success: false, message: "性別僅限 男／女。" });
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
  var data = kpc.getDataRange().getValues();
  var i = kanshouPcIdx_(data, pcId);
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
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
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
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
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
  var targetName = String(userData.targetName || "").trim();
  var propId = String(userData.propId || "").trim();
  var level = String(userData.level || "").trim();
  if (!targetName || !propId) return JSON.stringify({ success: false, message: "參數不完整。" });
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  // 🐛→✅ 2026-07 再稽核抓到：跟相約/牽手/同居同一套findPcRowIdx_，唯獨這裡漏帶loc——沒驗證
  //   目標同伴此刻是否真的在場，比照相約/牽手/同居補上，裝備道具也要求她本人在場。
  var tIdx = findPcRowIdx_(data, gid, { name: targetName, faction: "從者", loc: String(data[meIdx][COL.PC.LOC] || ""), nameCandidates: kanshouNameCandidates_ });
  if (tIdx < 0) return JSON.stringify({ success: false, message: "找不到這位同伴。" });
  var def = kanshouAllProps_(data[meIdx][COL.PC.MEMORY]).find(function (p) { return p.id === propId; });
  if (!def) return JSON.stringify({ success: false, message: "查無此道具。" });
  var _existingP = kanshouGetProps_(data[tIdx][COL.PC.MEMORY]);
  var finalLevel = "";
  if (level) {
    // 🤫 催眠類多一個合法值「已解除」(悄悄解除·她不知情)，一般道具沒有這個狀態。
    finalLevel = def.hasIntensity
      ? ((def.ignoreBond && level === KANSHOU_HYPNO_RELEASED_) ? KANSHOU_HYPNO_RELEASED_
        : (KANSHOU_PROP_LEVELS_.indexOf(level) !== -1 ? level : KANSHOU_PROP_LEVELS_[0]))
      : "戴著";
    // 🔒 2026-07 玩家「整個小道具直接卡80吧...還沒80都鎖起來」：不只啟動，裝備本身(含關閉/戴著起手)
    //   都卡好感門檻——好感不夠她根本不會讓你碰。移除(level空字串)不受【好感】門檻，但仍要她在場
    //   (上方 findPcRowIdx_ 帶 loc)——實體道具本來就得人在旁邊才拿得下來。
    // 🌀 ignoreBond例外(2026-07「催眠暗示」)：玩家自訂道具可選勾「無視好感」，這類道具(如催眠暗示)
    //   跳過此門檻——仍受下面的KANSHOU_PROP_EQUIP_CAP_同一個5件上限，不是完全無限制。
    if (!def.ignoreBond && (parseInt(data[tIdx][COL.PC.BOND]) || 0) < KANSHOU_PROP_EQUIP_BOND_) {
      return JSON.stringify({ success: false, message: "好感還沒到那個地步，她不會讓你這麼做。" });
    }
    // 🐛→✅ 玩家「催眠太強，可以用GAS控制他升級嗎」：催眠類道具的強度不能一次跳兩階以上升——
    //   微弱直接跳強勁太突兀，逼玩家一階一階推進。降級(含直接關閉)隨時可以，不受此限。
    // 🤫「已解除」不在這把尺上(語意是失效、不是更強)，跟「關閉」一樣隨時可切、不受閘門。
    if (def.ignoreBond && finalLevel !== KANSHOU_PROP_LEVELS_[0] && finalLevel !== KANSHOU_HYPNO_RELEASED_) {
      const _curP = _existingP.find(function (p) { return p.id === propId; });
      // 還沒裝備過、或目前是「已解除」(不在尺上→indexOf 回 -1)，都視同「關閉」起跳。
      const _curIdx = Math.max(0, _curP ? KANSHOU_PROP_LEVELS_.indexOf(_curP.level) : 0);
      const _newIdx = KANSHOU_PROP_LEVELS_.indexOf(finalLevel);
      if (_newIdx - _curIdx > 1) {
        return JSON.stringify({ success: false, message: "暗示需要一階一階加深，不能一次跳這麼多階。" });
      }
    }
    // 🔢 只卡「新增裝備」：propId還沒在她身上的已裝備清單才算新增，調整已裝備項目的強度不占額外名額。
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
// 🐛→✅ 2026-07「催眠的和新道具要確實分開成兩種」：ignoreBond原本開放這裡勾選，玩家覺得該獨立
//   成專屬入口(actionKanshouCastHypnosis)——這裡改成**一律強制ignoreBond:false**，不管
//   userData帶了什麼都無視，確保「一般道具」這條路徑物理上做不出無視好感的效果，兩種道具在
//   backend層就分道揚鑣，不是只靠前端不給勾選框這種軟性分隔。
function actionKanshouAddCustomProp(userData, pcId, sheets) {
  var kpc = sheets.pc;
  var targetName = String(userData.targetName || "").trim();
  var name = kanshouSanitizeTagValue_(userData.name, 10);
  var hasIntensity = !!userData.hasIntensity;
  var part = kanshouSanitizeTagValue_(userData.part, 8); // 選填，留空就讓AI自己發揮(不注入部位敘述)
  var effect = kanshouSanitizeTagValue_(userData.effect, 16); // 選填，留空就讓AI只靠名稱腦補效果
  var ignoreBond = false; // 一般道具強制不能無視好感，這個效果只走 actionKanshouCastHypnosis
  if (!targetName || !name) return JSON.stringify({ success: false, message: "參數不完整。" });
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  // 🐛→✅ 稽核抓到：原本比對 p.id(內建道具的內部代號如'egg_vibrator')跟玩家打的中文名，永遠不
  //   會相等，撞名檢查形同虛設(玩家真的取名「跳蛋」反而不會被擋)。改比對顯示名稱 p.name。
  if (KANSHOU_PROPS_.some(function (p) { return p.name === name; })) return JSON.stringify({ success: false, message: "這個名字跟內建道具重複了，換一個名字吧。" });
  var custom = kanshouGetCustomProps_(data[meIdx][COL.PC.MEMORY]);
  var existing = custom.find(function (p) { return p.id === name; });
  // 🐛→✅ 稽核抓到：跟 actionKanshouCastHypnosis 共用同一份【自訂道具】清單、同名會互相覆寫
  //   ——同名撞進催眠指令(ignoreBond:true)會靜默解除好感門檻且清空原part/effect。撞名一律拒絕。
  if (existing && existing.ignoreBond) return JSON.stringify({ success: false, message: "這個名字已經是你設定過的催眠指令，換一個名字吧。" });
  var already = !!existing;
  if (!already && custom.length >= KANSHOU_CUSTOM_PROP_CAP_) return JSON.stringify({ success: false, message: "自訂道具已達上限(" + KANSHOU_CUSTOM_PROP_CAP_ + "件)，先刪掉一些吧。" });
  // 🐛→✅ 稽核抓到：hasIntensity存在玩家帳號共用的道具「定義」，但每位同伴身上的裝備「強度」各自
  //   獨立存放於自己MEMORY——若這裡改動的hasIntensity跟舊定義不同(如true→false再改回true，中途
  //   目標各換過別的同伴)，只有「當次目標」的強度值被同步歸零，其餘早已裝備同名道具、卻沒被這次
  //   指令碰到的同伴，其舊強度字串會原封不動留在MEMORY裡——一旦hasIntensity日後又變回符合它的值，
  //   會在玩家毫不知情、沒下過任何指令的情況下對那些同伴「復活」成舊強度。hasIntensity真的改變時，
  //   同game_id下所有裝備此propId的同伴一併正規化強度值(比照刪除路徑的批次寫回慣例)。
  var intensityChanged = already && existing.hasIntensity !== hasIntensity;
  custom = custom.filter(function (p) { return p.id !== name; });
  custom.push({ id: name, hasIntensity: hasIntensity, part: part, ignoreBond: ignoreBond, effect: effect });
  data[meIdx][COL.PC.MEMORY] = kanshouSetCustomProps_(data[meIdx][COL.PC.MEMORY], custom);
  var gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  // 🐛→✅ 稽核抓到：舊版逐位同伴各自 setValue(N位同伴=N+1次Sheets I/O)、且無try/catch——中途任一次
  //   拋例外(暫時性API錯誤/併發衝突)就半途而廢，部分同伴已正規化、部分還留著舊強度字串；一旦
  //   hasIntensity日後又改回原值，漏寫的那位會在玩家毫不知情下用舊強度「復活」，本函式頭頂的註解
  //   宣稱「比照刪除路徑的批次寫回慣例」卻沒真的做。改成全程只改記憶體data，函式結尾單次整表寫回
  //   (比照 actionKanshouDeleteCustomProp 實際的寫法)，不論N多大都只有1次寫入、也不會半途而廢。
  if (intensityChanged) {
    var _normLevel = hasIntensity ? KANSHOU_PROP_LEVELS_[0] : "戴著";
    for (var _si = 1; _si < data.length; _si++) {
      if (String(data[_si][COL.PC.GAME_ID] || "") !== gid || String(data[_si][COL.PC.FACTION]) !== "從者" || String(data[_si][COL.PC.ID]).startsWith("DEAD_")) continue;
      var _sExisting = kanshouGetProps_(data[_si][COL.PC.MEMORY]);
      if (_sExisting.some(function (p) { return p.id === name; })) {
        data[_si][COL.PC.MEMORY] = kanshouToggleProp_(data[_si][COL.PC.MEMORY], name, _normLevel);
      }
    }
  }
  // 🐛→✅ 2026-07 再稽核：同上，補loc要求目標同伴此刻在場才能立即裝備(目錄新增本身不受此限)。
  var tIdx = findPcRowIdx_(data, gid, { name: targetName, faction: "從者", loc: String(data[meIdx][COL.PC.LOC] || ""), nameCandidates: kanshouNameCandidates_ });
  if (tIdx < 0) {
    kpc.getRange(1, 1, data.length, data[0].length).setValues(data);
    return JSON.stringify({ success: true, props: [], customProps: custom, message: "已新增到你的道具目錄，但找不到這位同伴可裝備。" });
  }
  if (!ignoreBond && (parseInt(data[tIdx][COL.PC.BOND]) || 0) < KANSHOU_PROP_EQUIP_BOND_) {
    kpc.getRange(1, 1, data.length, data[0].length).setValues(data);
    return JSON.stringify({ success: true, props: kanshouGetProps_(data[tIdx][COL.PC.MEMORY], KANSHOU_PROPS_.concat(custom)), customProps: custom, message: "已新增到你的道具目錄，但好感還沒到那個地步，她還不會讓你幫她裝備。" });
  }
  var _existingT = kanshouGetProps_(data[tIdx][COL.PC.MEMORY]);
  if (!_existingT.some(function (p) { return p.id === name; }) && _existingT.length >= KANSHOU_PROP_EQUIP_CAP_) {
    kpc.getRange(1, 1, data.length, data[0].length).setValues(data);
    return JSON.stringify({ success: true, props: kanshouGetProps_(data[tIdx][COL.PC.MEMORY], KANSHOU_PROPS_.concat(custom)), customProps: custom, message: "已新增到你的道具目錄，但她身上裝備已達上限(" + KANSHOU_PROP_EQUIP_CAP_ + "件)，先移除一件才能裝上這個。" });
  }
  var finalLevel = hasIntensity ? KANSHOU_PROP_LEVELS_[0] : "戴著"; // 新裝備一律關閉起手
  data[tIdx][COL.PC.MEMORY] = kanshouToggleProp_(data[tIdx][COL.PC.MEMORY], name, finalLevel);
  kpc.getRange(1, 1, data.length, data[0].length).setValues(data);
  return JSON.stringify({ success: true, props: kanshouGetProps_(data[tIdx][COL.PC.MEMORY], KANSHOU_PROPS_.concat(custom)), customProps: custom });
}

// 🌀 催眠指令：跟一般自訂道具「確實分開成兩種」(2026-07 玩家定案)的獨立入口。玩家打一句暗示內容
//   (text，非道具名稱)，強度**必帶**(不像一般道具是選填勾選)，底層仍是同一套【自訂道具】目錄/
//   裝備上限(id=text本身)，只是強制hasIntensity:true/ignoreBond:true——語意上這就是「無視好感」的
//   那一種，不需要另外勾選。text≤30字(比一般道具name的10字寬，因為這是一句完整暗示而非短標籤)。
//   首次施展預設落在微弱(不像一般道具從關閉起手)：這是「施展」動作，落地就該有效果，不是先裝備
//   再另外啟動兩步。前端在這個action成功後會緊接著送一次正常對話(send())，讓AI立即演出催眠生效
//   的當下——這是本效果存在的意義，不能像一般道具靜默寫入等下一輪才反映。
function actionKanshouCastHypnosis(userData, pcId, sheets) {
  var kpc = sheets.pc;
  var targetName = String(userData.targetName || "").trim();
  var text = kanshouSanitizeTagValue_(userData.text, 30);
  if (!targetName || !text) return JSON.stringify({ success: false, message: "參數不完整。" });
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  if (KANSHOU_PROPS_.some(function (p) { return p.name === text; })) return JSON.stringify({ success: false, message: "這句指令跟內建道具重複了，換個說法吧。" });
  var custom = kanshouGetCustomProps_(data[meIdx][COL.PC.MEMORY]);
  var existing = custom.find(function (p) { return p.id === text; });
  // 🐛→✅ 稽核抓到：跟 actionKanshouAddCustomProp 共用同一份【自訂道具】清單、同名會互相覆寫
  //   ——同名撞進一般道具(ignoreBond:false)會靜默關閉「無視好感」，玩家毫無感知。撞名一律拒絕。
  if (existing && !existing.ignoreBond) return JSON.stringify({ success: false, message: "這句話跟你已有的一般道具同名，換個說法吧。" });
  var already = !!existing;
  if (!already && custom.length >= KANSHOU_CUSTOM_PROP_CAP_) return JSON.stringify({ success: false, message: "自訂道具/催眠指令目錄已達上限(" + KANSHOU_CUSTOM_PROP_CAP_ + "件)，先刪掉一些吧。" });
  custom = custom.filter(function (p) { return p.id !== text; });
  custom.push({ id: text, hasIntensity: true, part: '', ignoreBond: true });
  // 🐛→✅ 2026-07 玩家「小道具+催眠一起整體檢查」抓到：原本先 setValue 玩家列(目錄)、再 setValue 目標
  //   列(施展)，兩次分開的 Sheets 寫入——中途失敗就留下「目錄建了但沒施展」的半套資料，而
  //   actionKanshouAddCustomProp 早就為了同一個理由改成「全程只改記憶體、確定後單次整表寫回」。
  //   同一種病要一起治：這裡照抄那個慣例，順便把 2 次 round-trip 併成 1 次。
  data[meIdx][COL.PC.MEMORY] = kanshouSetCustomProps_(data[meIdx][COL.PC.MEMORY], custom);
  var _flush = function () { kpc.getRange(1, 1, data.length, data[0].length).setValues(data); };
  var gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  // 🐛→✅ 2026-07 再稽核：同上，施展催眠指令這步也要求目標同伴此刻在場(目錄記下本身不受此限)。
  var tIdx = findPcRowIdx_(data, gid, { name: targetName, faction: "從者", loc: String(data[meIdx][COL.PC.LOC] || ""), nameCandidates: kanshouNameCandidates_ });
  if (tIdx < 0) { _flush(); return JSON.stringify({ success: true, props: [], customProps: custom, message: "已記下這句指令，但找不到這位同伴可施展。" }); }
  var _existingT = kanshouGetProps_(data[tIdx][COL.PC.MEMORY]);
  if (!_existingT.some(function (p) { return p.id === text; }) && _existingT.length >= KANSHOU_PROP_EQUIP_CAP_) {
    _flush();
    return JSON.stringify({ success: true, props: kanshouGetProps_(data[tIdx][COL.PC.MEMORY], KANSHOU_PROPS_.concat(custom)), customProps: custom, message: "已記下這句指令，但她身上裝備已達上限(" + KANSHOU_PROP_EQUIP_CAP_ + "件)，先移除一件才能施展。" });
  }
  var finalLevel = KANSHOU_PROP_LEVELS_[1]; // 微弱起跳——施展就該立即生效，不像一般道具從關閉起手
  data[tIdx][COL.PC.MEMORY] = kanshouToggleProp_(data[tIdx][COL.PC.MEMORY], text, finalLevel);
  _flush();
  return JSON.stringify({ success: true, props: kanshouGetProps_(data[tIdx][COL.PC.MEMORY], KANSHOU_PROPS_.concat(custom)), customProps: custom, level: finalLevel });
}

// 🗑 刪除玩家自訂道具定義：同步清掉所有同伴身上目前裝備的這一項，避免留下型錄查無定義的孤兒資料。
function actionKanshouDeleteCustomProp(userData, pcId, sheets) {
  var kpc = sheets.pc;
  var name = String(userData.name || "").trim();
  if (!name) return JSON.stringify({ success: false, message: "參數不完整。" });
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "目前不在後日談世界中。" });
  var custom = kanshouGetCustomProps_(data[meIdx][COL.PC.MEMORY]).filter(function (p) { return p.id !== name; });
  data[meIdx][COL.PC.MEMORY] = kanshouSetCustomProps_(data[meIdx][COL.PC.MEMORY], custom);
  var gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  // 🐛→✅ 稽核抓到：舊版迴圈內逐一 setValue，N位同伴持有此道具就是N+1次Sheets I/O往返——
  //   改成全程只改記憶體 data，迴圈結束後單次整表寫回(比照 Router_Battle.gs 的
  //   BATTLE_DEFER_WRITE_ 批次寫回慣例)，不論N多大都只有1次寫入。
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") === gid && String(data[i][COL.PC.FACTION]) === "從者" && !String(data[i][COL.PC.ID]).startsWith("DEAD_")) {
      var existing = kanshouGetProps_(data[i][COL.PC.MEMORY]);
      if (existing.some(function (p) { return p.id === name; })) {
        data[i][COL.PC.MEMORY] = kanshouToggleProp_(data[i][COL.PC.MEMORY], name, "");
      }
    }
  }
  kpc.getRange(1, 1, data.length, data[0].length).setValues(data);
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
  return `對話格式(輕小說筆觸)：
①口/喉聲音(話語+喘息/輕吟/悶哼/笑聲/吸吮/舔啜/咀嚼/吞嚥)都寫進單層「」(例：「唔……啾，好甜」)，禁（輕哼）括號描述、禁轉旁白。
②每句台詞前冠說話者名(例：櫻「風音學姐……」)，跨回合不認錯人，喘息混台詞算同一人名下。★玩家台詞免冠名、直接「……」，且照原句寫，禁改寫成轉述句。
③肢體動作/非口部聲響(啪啪/環境音/兵刃聲)一律走敘事，絕不放進「」內。
④只用單層「」禁巢狀『』；背景描述精簡，篇幅留給互動。`;
}

// 只被鑑賞(慾海)呼叫——solo走完全獨立的 miniSystem。唯一呼叫來源 actionPlay 的 isNsfwMode
//   恆為 true，故不再分 SFW/NSFW 分支，直接寫死唯一會用到的版本。driveOn(主動掌握)由
//   actionPlay 自己組的 driveStr 處理，不在這裡管轄。
// 🌱 master_note(玩家御主滾動側寫)動態 schema：2026-07 再修（玩家「萌點AI根本亂寫...遊戲中也
//   不要讓AI可以改動，AI只能改動經歷」）——創角時已經讓AI依姓名/性別/外貌/個性一次生成完整的
//   性格四格(對外性格/獨處性格/喜歡/討厭)與萌點(見actionBackfillKanshouAi)，寫定之後就不該再
//   被遊玩中零碎片段的盲猜覆寫掉。master_note 從此【只剩經歷會繼續滾動】，性格四格/萌點徹底
//   從這裡拿掉，AI 遊玩期間完全看不到這兩類欄位、也就無從亂寫。舊版「性格鎖」機制(玩家自己
//   改命鎖哪幾格不讓AI碰)也一併拆除——AI已經完全不會去動這些欄位，鎖不鎖沒有意義。
// 🌀 includeMasterNote=false(側寫節流·非側寫回合)＝整塊 master_note 從 schema 拿掉，AI 專心敘事；
//   undefined/true＝照常帶(相容舊呼叫)。
// 🎛️ includeOptions=false(玩家關掉【命運的抉擇】開關)＝options 欄整個拿掉——玩家看不到的東西
//   不必叫 AI 每回合生 4 條(省 token 省注意力)。undefined/true＝照常帶。
function buildDefaultSystemPrompt(includeMasterNote, includeOptions) {
  // physical_state 只留顏面神情(≤15字)：只管表情，衣裝狀態拆進獨立的 appearance_extras 欄
  //   (下方)，兩者關注點不同——前者是每回合都可能變的暫時神情，後者是要持久記住的實際穿著。
  const _physicalState = "角色當下顏面神情(第三人稱·≤15字)";
  const _masterNote = {
    "_note": "觀察玩家慢慢認識他(不顯示)·有新觀察才更新否則留空",
    "經歷": "承接舊經歷·只增補本回合有意義新遭遇·滾動摘要≤50字·沒新事回舊值"
  };

  // appearance_extras(原 outfit_change，2026-07 改名)：角色當下實際穿著狀態，AI 可依劇情如實更新
  //   (正常穿著寫身上衣物，全裸/沐浴/更衣等狀態也要如實反映)，會寫回持久的【換裝】記錄，不是每回合
  //   就消失的暫時描述。
  // 🐛→✅ 2026-07 玩家實測「幫她戴貓耳朵，過幾輪就忘記」：舊欄名"outfit_change"字面就是「換裝」，
  //   容易連AI帶欄名一起窄化成只認「衣服本身的替換」，當時補了配飾類範例(「貓耳頭飾」)把玩家臨時
  //   加的道具也塞進這欄一起救。**2026-07再修**（玩家「小道具已經有專門機制了，外觀服裝也幫我專注
  //   在外觀服裝吧」）：現在持久小道具(KANSHOU_PROPS_/自訂道具)才是配飾/道具類的機制保證正解，這欄
  //   改回**只專注服裝本身**，不再兼管配飾——避免兩套機制搶著記同一件事、混淆該由誰負責。AI 若自己
  //   想在敘事順帶提到身上的小道具(如貓耳)，那是它自由發揮，不強求也不靠這欄記錄。
  const _appearanceExtras = "穿著狀態(第三人稱·≤20字·名詞短語如「絲綢襯衫」「牛仔褲」「浴巾」「全裸」·禁「換上了…」動作句·禁「在水下」「泡在浴池」等場景/姿勢)";

  // 🔴 npc的範本欄位填「同上」：actionPlay 落地端(本檔·intimacy_feedback 解析)的 ignoreWords 防呆清單本就
  // 含「同上」，即使AI偷懶照抄範本字面值也會被當成敷衍語忽略、不會寫進玩家看到的狀態欄，省字數不引入新的失敗模式。
  const _physicalStateRef = "同上";
  const _appearanceExtrasRef = "同上";

  const finalJson = {
    // 強制思維鏈：放範本第一位讓模型先自省再寫敘事。後端 sanitizeAiData_ 不讀此欄，純粹是給
    //   AI 自己看的思考格，零程式面副作用。第三人稱總結(而非第一人稱)是為了不跟 narration 的
    //   敘事視角(玩家「我」)打架；「本回合開始前」明講時態，避免被誤讀成預寫本回合結果。
    "inner_monologue": "【不顯示·約50字】第三人稱總結NPC本回合前狀態([性格]vs[情緒身體])·承接歷史；若某人已不在【在場人物】名單，先意識到她不在場，不可當她還在",
    "narration": "劇情(第一人稱·禁替玩家做決定·篇幅依下方【篇幅指定】)",
    // 🗺️ 2026-07 移動改「同意泡泡」制(見§134)；2026-07再修（玩家實測「AI一直提議移動、頭痛」）：
    //   move_proposal 欄位整個砍掉，AI 不再有任何管道自己決定要不要換場景/換去哪。此處刻意【不設
    //   location/move_proposal 欄】——玩家的所在地一律由 GAS 掌握：要嘛玩家自己用地圖走(moveTarget)，
    //   要嘛玩家在地圖上向同伴提議同去(proposeMove)、GAS 依好感直接裁定接不接受(_pendingProposal)，
    //   AI 兩種情況都只負責演出反應，從不負責「要不要提議」或「去哪裡」這兩個決定。
    // 🐛→✅ 2026-07 三度改版（玩家「proposal_accept可以拿掉…promise_proposal也可以拿掉，讓GAS
    //   好感超過90…詢問玩家她是否可以與玩家同居…想要當好感卡39之類的時候GAS主動發出邀約」）：
    //   promise_proposal(她主動約你改天見面)／cohabit_proposal(她主動邀同居)／proposal_accept(早已停用)
    //   三個欄位全部拔掉，AI 不再有任何管道自己決定「要不要開口邀」——約會/同居邀約當時改由 GAS
    //   依好感數值直接判定觸發(kanshouPromiseOffer_/kanshouCohabitOffer_)，後來雙雙因玩家嫌「太
    //   煩人」(約會泡泡每回合都跳、同居泡泡每天都跳)已整組移除，約會/同居現只剩玩家自己主動
    //   發起(promiseMeet/cohabitInvite)一條路。
    // npc_exit：同伴自主權——她可自然告辭離場，GAS真的把她移出場景(不再是嘴上說走卻還在)。只認此刻
    //   在場同伴，去向由系統依作息決定；被牽的人離場→牽手自動鬆開。不必每回合遣散，只在情境自然時。
    "npc_exit": "在場同伴自然告辭離場的真名陣列(可多位)·narration演出她離開·否則[]",
    "options": ["1. [主動]強勢掌握主導...", "2. [被動]順從委婉試探...", "3. [接續]順劇情延續互動...", "4. [反差]跳脫氛圍的驚人舉動..."],
    "intimacy_feedback": {
      "_note": "physical_state=顏面神情(≤15字)；appearance_extras=穿著(≤20字)。★有變化才填(神情轉變/脫穿沐浴/情事進展)，否則留空沿用舊值。npcs格式同player。",
      "player": {
        "physical_state": _physicalState,
        "appearance_extras": _appearanceExtras
      },
      "npcs": [{
        "name": "NPC真名(固定真名·不填暱稱/職階)",
        "physical_state": _physicalStateRef,
        "appearance_extras": _appearanceExtrasRef,
        "mutual_nicknames": "雙方自然發展的暱稱(見律令4)",
        "attitude": "(該角色對玩家)當下的臨場態度(第三人稱·≤15字·有變化才填)",
        "memory": "有里程碑(告白/初牽手/難忘約會/重要約定)才寫≤30字·玩家第一人稱「我」記事·禁她視角；尋常閒聊填「無」·同一事只記一次(已有【共同回憶】重複填無)"
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
4. mutual_nicknames：本回合真發生才填·否則「無」。
5. attitude(≤15字)：有明顯轉變才填·空=沿用舊值。
6. options：基於本回合 narration 內容出題——在場人物當下真能做到的動作；禁移動地點/尋找不在場角色；禁塞入本回合無關的萌點/背景字面(如「提點她的家電困擾」)。
7. appearance_extras(裝扮)：本回合真有穿脫/更衣/入浴等具體動作才填新值·否則留空(沿用既有裝扮)。禁以「這身跟這幕不搭」為由自行改寫或省略；玩家指定的裝扮＝既定事實，直到劇情真讓她換裝為止(格式/姿勢禁忌見schema)。`;

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
// 🌱 dateOnly:true＝不進kanshouRollDailyLocation_的日常閒晃保底池(避免其他同伴平白無故被骰去這種
//   明顯是「約會限定」的私密地點閒晃)，這個用途仍在使用中(見kanshouRollDailyLocation_)。
//   ⚠ 2026-07 八度改版(玩家「約會泡泡也好煩人」)移除GAS主動邀約機制(kanshouPickDate_)後，原本
//   隨dateOnly一起新增、給該機制篩選地點用的minBond欄位已無任何程式碼讀取，故整批移除
//   (地圖上玩家自己走過去/帶她同去這條路本就不受這個門檻限制，移除不影響現行流程)。
// 🕐 2026-07 六度改版新增 bands：玩家實測「清晨走進深夜賓館，櫃檯空無一人像恐怖片開場」──有些
//   地點名字本身就寫明時段(深夜賓館/夜景展望台)、有些現實中就有營業時段(書店/水族館)，卻能被
//   玩家在任何時段自由走進去，AI只能硬掰理由圓場，讀起來很違和。bands＝這個地點在哪些
//   timeBand_(Time_World.gs 5段：清晨/午後/黃昏/夜/深夜)開放；省略此欄＝不受限、全天候開放
//   (向後相容，其餘地點不受影響)。只管「玩家能不能走進去」，不影響同伴日常閒晃(dateOnly地點
//   本就不進閒晃池；非dateOnly地點的閒晃池目前不比對bands，極少數情況同伴可能被骰去玩家當下
//   進不去的地點，純屬「她剛好在，你正好碰不上」的日常感，不是bug)。門檻依「地點名字/現實常識
//   暗示的營業時段」訂，非玩家點名的地點一律維持不設限，之後想擴大範圍只需往表加 bands 一列。
//   ⚠ 改這裡記得同步前端顯示鏡射 KC_LOCATIONS_(Script_Kanshou.html)的同名地點——否則鎖圖示對不上
//   後端實際判定(同KANSHOU_LOCATIONS_/KC_LOCATIONS_過去漏同步過5個地點的教訓)。設有 bands 限制的
//   地點若被玩家相約(promiseMeet)選中，只能挑跟該地點bands相容的時段，避免「約好了、赴約時卻被
//   地點未開放擋在門外」的必爽約陷阱。
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

  // 拜訪住處：只保留女性角色的住處，noEncounter:true(私人住處，恆不觸發陌生人巧遇)，name
  //   務必與下方KANSHOU_HERO_HOME_的值逐字一致，否則kanshouRollDailyLocation_骰到的地點對不上這裡。
  //   （2026-07 七度改版：泛用住處池KANSHOU_GENERIC_HOME_POOL_不寫在這裡手動維護，改在該常數
  //   宣告處用push動態併入此陣列，同樣受這條「name須逐字一致」規則約束，只是來源不同。）
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
// 🎭 情境氛圍表（2026-07 玩家「橋段太過生硬」根治改版）
//   ⚠ 舊版每則帶 label/btn/verb/intent ＋ 依好感分歧的 branches[].tag——tag 是一整段【劇本】
//   (「往旁挪出位置邀你一起、甚至替你擦背」)，且提示詞明令「情緒基調不要偏離」。後果：同一好感
//   區間每次演出來都是同一段戲、角色個性被壓過去，而且把「說書」寫死進資料表，違反本專案
//   「GAS 掌事實、AI 只說書」的鐵則。
//   現版本每則只留一句 ambient＝【此刻的客觀情境事實】，不規定她的反應、不給選項按鈕。玩家想
//   不想理會、要怎麼互動，直接打字即可(鑑賞本來就有聊天框)。分寸仍由【親密尺度五階】統一管。
//   🛏️ 夜襲/賴床叫醒已整組移除：她睡著這件事本來就由 pSleepStr 每回合當既定事實餵給 AI(判準
//   完全相同)，再包一層按鈕只是把自然的處境變成一張要點的卡。
const KANSHOU_SCENE_EVENTS_ = {
  // ── 地點×時段(KANSHOU_LOCATION_EVENTS_) ──
  共浴: { ambient: '浴室裡傳來水聲，她正在沐浴' },
  溫泉同浴: { ambient: '氤氳的霧氣裡，她正泡在溫泉中' },
  膝枕: { ambient: '午後的客廳很慵懶，她正窩在沙發上' },
  下廚: { ambient: '廚房飄出飯菜香，她正在準備晚餐' },
  觀星: { ambient: '今晚夜空格外清澈，她在屋頂花園仰望星空' },
  // ── 節慶(KANSHOU_FESTIVAL_EVENTS_) ──
  初詣: { ambient: '新年頭一天，街上到處是要去神社參拜的人潮與攤販' },
  情人節巧克力: { ambient: '今天是情人節，街上的店家全擺出了巧克力與心形包裝' },
  七夕短冊: { ambient: '七夕，街上到處立著掛滿短冊的竹枝' },
  中秋賞月: { ambient: '中秋，空氣裡都是月餅與團圓的味道，今晚的月亮會特別圓' },
  聖誕約會: { ambient: '聖誕，整條街的燈飾與音樂都在提醒今天不一樣' },
  跨年倒數: { ambient: '一年的最後一天，街上到處是準備跨年的人與收攤的年貨' },
  // ── 同居日常(KANSHOU_COHABIT_EVENTS_·僅同居中的她) ──
  同居晨光: { ambient: '清晨的家裡，她已經起身在活動' },
  同居午後: { ambient: '午後的家裡只有你們兩人，她正做著自己的事' },
  同居黃昏: { ambient: '傍晚了，她在廚房張羅著晚飯' },
  同居夜話: { ambient: '夜深了，她還沒去睡，看來是想說說話' },
  同居深夜: { ambient: '半夜，她竟也還醒著' }
};
// 睡眠時刻切點(玩家實測要求：0~8點在她家/和室/玩家房間必定熟睡)——不依附 timeBand_ 的深夜/清晨
//   切法，清晨 band 原本一路延伸到 11 點、超出「還在睡」的合理範圍。0~5點=熟睡、5~8點=賴床將醒。
//   2026-07 泡泡拆除後，服務對象是 pSleepStr(每回合把睡眠狀態當既定事實餵給 AI)與深夜訪客橋段。
const KANSHOU_ASLEEP_HOUR_END_ = 8;
const KANSHOU_NIGHT_RAID_HOUR_END_ = 5;
// 地點橋段觸發表：她剛好在這個地點×時段吻合→把該事件的 ambient 當「此地此刻·情境事實」注入提示詞
//   (2026-07 泡泡拆除後不再跳按鈕，見 kanshouSceneAmbientStr)。
//   加新地點橋段＝這裡加一筆＋KANSHOU_SCENE_EVENTS_加對應事件，不動觸發邏輯。
const KANSHOU_LOCATION_EVENTS_ = {
  '浴室': { eventKey: '共浴', bands: ['夜', '深夜'] },
  '隱藏溫泉': { eventKey: '溫泉同浴', bands: ['午後', '黃昏', '夜'] },
  '客廳': { eventKey: '膝枕', bands: ['午後'] },
  '廚房': { eventKey: '下廚', bands: ['黃昏'] },
  '屋頂花園': { eventKey: '觀星', bands: ['夜', '深夜'] }
};
// 節慶橋段觸發表：日曆走到節慶當天(KANSHOU_FESTIVALS_的month/day)×時段吻合×玩家所在地有同伴
//   →注入該事件的 ambient 情境事實。key對齊KANSHOU_FESTIVALS_.key。
// 🎊 節慶【不限時段·不限地點】(2026-07)：bands 欄位保留但【已不再被讀取】——留著當文件，
//   日後想恢復時段限定不必重寫結構。時刻限制改由 ambient 文字本身寫成任何時刻都成立來取代。
// 🎯 doneLoc/todo＝「今天該做的事」(2026-07 玩家「想要一個類似任務重點」)：
//   doneLoc＝完成這件習俗的地點(陣列·任一個都算)；todo＝那件事本身，只拿來組委婉提醒。
//   完成判定由 GAS 自己看事實(玩家人在 doneLoc ＋ 身邊有同伴)，不問 AI、不加按鈕。
const KANSHOU_FESTIVAL_EVENTS_ = {
  newyear: { eventKey: '初詣', bands: ['清晨', '午後'], doneLoc: ['古老神社'], todo: '到神社初詣參拜' },
  valentine: { eventKey: '情人節巧克力', bands: ['清晨', '午後', '黃昏', '夜'], doneLoc: ['咖啡廳'], todo: '找間店坐下來，好好過這個情人節' },
  qixi: { eventKey: '七夕短冊', bands: ['黃昏', '夜', '深夜'], doneLoc: ['古老神社'], todo: '到神社把心願寫上短冊、掛上竹枝' },
  midautumn: { eventKey: '中秋賞月', bands: ['夜', '深夜'], doneLoc: ['屋頂花園', '夜景展望台'], todo: '找個看得見月亮的高處一起賞月' },
  xmas: { eventKey: '聖誕約會', bands: ['黃昏', '夜'], doneLoc: ['商店街'], todo: '到亮著燈飾的商店街走一趟' },
  nye: { eventKey: '跨年倒數', bands: ['夜', '深夜'], doneLoc: ['古老神社'], todo: '到神社迎接新年的第一刻' }
};
// 🎊 今天的節慶習俗已完成(存【玩家】列·absDay)：同一天只算一次，完成後提示詞從「還沒去」的
//   委婉提醒切成一句短短的餘韻——順便解掉「不限時段之後那句話整天每回合都印」的重複問題。
var KANSHOU_FESTIVAL_DONE_TAG_ = makeIntTag_('節慶達成', 0);
// 🏠 同居日常橋段觸發表(時段→事件)：她【同居中】×兩人同處玩家居所×該時段有對應日常→注入 ambient。
//   實際優先序＝節慶 > 地點 > 同居，同居刻意排【最低】：膝枕(客廳·午後)/共浴(浴室·夜)/下廚(廚房·黃昏)這些既有的
//   地點專屬橋段仍然優先，同居日常只補它們沒佔到的時段空檔，不搶既有內容。
//   加時段＝這裡加一列＋KANSHOU_SCENE_EVENTS_ 加對應事件，觸發邏輯不必動。
const KANSHOU_COHABIT_EVENTS_ = {
  清晨: '同居晨光', 午後: '同居午後', 黃昏: '同居黃昏', 夜: '同居夜話', 深夜: '同居深夜'
};
// 🌙 深夜訪客「別有用心」的分寸判準(2026-07 泡泡拆除後，唯一呼叫點只剩深夜敲門那條)：
//   好感決定這次能走到哪一階，不寫死台詞，具體怎麼演、講什麼話全交AI依角色性格發揮。切點沿用
//   親密尺度五階既有的60(親吻擁抱)/80(無上限)兩個節點，跟其餘尺度判定同一套數字、單一來源。
function kanshouAsleepOutcomeStr_(bond) {
  if (bond >= 80) return '兩人的關係已經很深，她可以徹底卸下防備、主動迎合，這次能順著情境發展下去，不受親密尺度五階節奏限制';
  if (bond >= 60) return '兩人已有一定好感，她可能半推半就地放任靠近、甚至有點主動回應，但親密尺度五階此刻卡在「親吻擁抱」這一階，不宜真的推展到更進一步';
  return '兩人好感還沒到能這樣的地步，她會又驚又惱，甚至直接把人趕走，不會就此讓事情繼續下去';
}
// 修過的bug：kanshouRollDailyLocation_原本深夜/清晨的homeBias會直接回傳玩家自己家的房間，
//   讓不在場的人溜進玩家家裡——改成每位英靈自己的住處(資料驅動，同KANSHOU_LOCATION_TAGS_
//   寫法)，已同步登記進KANSHOU_LOCATIONS_(region:'visit')成為可造訪的真實地點；也是夜襲/
//   賴床叫醒橋段候選地點的唯一真實來源(見actionPlay)。
// 🏠 2026-07 七度改版·手寫專屬住處只有這7位種子英靈，其餘所有英靈(其他種子＋玩家原創/AI生成)
//   完全沒有可造訪的家——夜襲/賴床/拜訪住處對她們全數失效(玩家「新增的英靈會有住處嗎？」)。
//   已改成 kanshouGetHeroHome_ 統一讀取：這份手寫表優先(專屬豪邸不變)，查無才退回下面的
//   KANSHOU_GENERIC_HOME_POOL_(隨機分配、寫進她自己列的【住處】記憶標記，一次分配、終身持有，
//   見heroToKanshouRow_)。方便(新英靈免手動維護此表)·合理(每人一個可視為她家的真實地點，不
//   共用泛用字串)·隨機(從池子隨機抽一間)。
const KANSHOU_HERO_HOME_ = {
  '美狄亞-Caster': '隱蔽的工房', '斯卡哈-Lancer': '島嶼道場',
  '美遊-Saber': '埃德費爾特宅邸', '小黑-Archer': '愛因茲貝倫城',
  '遠坂凜-Master': '遠坂邸', '伊莉雅絲菲爾-Master': '愛因茲貝倫城', '藤村大河-Master': '藤村家'
};
// 🏠 泛用住處池(七度改版新增)：沒有專屬豪邸的英靈隨機抽一間、終身持有。純泛用命名(不影射任何
//   特定角色背景)，跟手寫豪邸一樣登記進 KANSHOU_LOCATIONS_(region:'visit')成為可造訪的真實
//   地點，共用同一套移動驗證/拜訪門檻，不必另開機制。generic:true 標記只供 heroToKanshouRow_
//   篩選"可隨機分配"的候選池，不影響其餘既有邏輯(其餘地方一律當普通 visit 地點看待)。
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
// 把泛用住處池登記進 KANSHOU_LOCATIONS_(單一真實來源)，讓移動驗證/拜訪門檻/前端地圖等既有
//   機制原樣吃到這些地點，不必為隨機分配的住處另開一套判斷邏輯。
KANSHOU_GENERIC_HOME_POOL_.forEach(function (h) {
  KANSHOU_LOCATIONS_.push({ name: h.name, region: 'visit', desc: h.desc, noEncounter: true, generic: true });
});
// 🏠 住處統一讀取入口：手寫專屬豪邸優先，查無才讀【住處】隨機分配記憶標記，兩者皆無才退回
//   不可造訪的通用值(理論上七度改版後不該再發生，只保留給改版前已存在、尚未補分配的舊存檔)。
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
    const home = kanshouGetHeroHome_(hid, r[COL.PC.MEMORY]);
    return home === residenceName && home !== '自己的住處' && (parseInt(r[COL.PC.BOND]) || 0) >= KANSHOU_VISIT_BOND_;
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
//   就有的住處」(kanshouGetHeroHome_：KANSHOU_HERO_HOME_專屬住處優先，查無就讀【住處】隨機
//   分配記憶標記，兩者皆無才退回通用的「自己的住處」)。
// memory選填：只有call site拿得到該英靈自己列的MEMORY時才傳，供讀取隨機分配的【住處】標記；
//   省略時只吃KANSHOU_HERO_HOME_專屬住處(現有7位種子英靈不受影響)。
function kanshouRollDailyLocation_(heroName, hour, cohabit, memory) {
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
        return kanshouGetHeroHome_(heroId, memory);
      }
    }
  }
  const haunts = heroId ? Object.keys(KANSHOU_LOCATION_TAGS_).filter(loc => KANSHOU_LOCATION_TAGS_[loc].includes(heroId)) : [];
  // 🌙 全地點保底池排除'room'(玩家自己的房間)跟'visit'(別人登記的住處，見KANSHOU_HERO_HOME_)
  //   兩個分區——不同行的英靈不該隨機骰進玩家臥室或別人家裡，那裡只能靠「拜訪」主動走進去，
  //   不是隨機亂晃能撞到的地方；否則沒有haunts標籤/沒有登記住處的英靈可能隨機骰進遠坂邸這種
  //   別人的家，跟夜襲/賴床叫醒橋段「LOC剛好等於某人家」的判定衝突，觸發在錯的人身上。
  //   'home'分區(共用生活空間，客廳/廚房等)不算私人，維持可被隨機骰中。dateOnly(深夜賓館/情侶
  //   溫泉套房這類明顯是GAS約會邀請限定的私密地點)也排除——不該讓其他無關同伴平白骰去這種地方閒晃。
  const pool = haunts.length ? haunts : KANSHOU_LOCATIONS_.filter(l => l.region !== 'room' && l.region !== 'visit' && !l.dateOnly).map(l => l.name);
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

// 結束一天(準備就寢)時的機率事件：命中就【直接讓她進門】、本回合不推進日期。
//   ⚠ 2026-07 玩家「如果玩家沒按泡泡而是打對話呢？」——舊版是純早退零落盤的「開門/不予理會」
//   待決泡泡，玩家改打字時「結束一天」的意圖會靜靜蒸發(日期沒推進、訪客沒到)，可是敘事已經
//   寫了敲門聲，AI 同時收到「有人敲門」跟「她不在場不准開口」兩條矛盾指令。改成先落盤再給
//   善後選項：她真的就在房裡，玩家想打字就打字，AI 照常演，之後想睡再按一次「結束一天」。
const KANSHOU_KNOCK_CHANCE_ = 0.2;  // 每次「結束一天」的敲門機率
// 🚪 深夜敲門的候選門檻：只有同居、或好感≥此值(親近的人)的同伴才會半夜登你家門——泛泛之交
//   半夜跑來敲門跟「陌生人世界」設定矛盾。要更容易撞見改小、要只限同住改大即可。
const KANSHOU_KNOCK_MIN_BOND_ = 60;
// 🌙 深夜訪客好感達門檻時，這次來訪帶「別有用心」夜襲鏡像版的機率——不是每次都這樣才有驚喜感。
const KANSHOU_KNOCK_RAID_CHANCE_ = 0.5;

// 好感≥80觸發同床共枕的那次結束一天，順手記一筆「今晚共度良宵的對象」，下一回合(不論玩家做
//   什麼)讀一次就清掉(一次性旗標)，餵進提示詞當【晨間餘韻】引子。刻意不斷言「一定發生了」，
//   交給AI依上一回合實際演出內容判斷要不要接續。
var KANSHOU_MORNING_AFTER_TAG_ = makeTextTag_('晨間餘韻');
// 🌙 同款一次性旗標的另一半：那些「昨晚陪你到最後、卻沒留下來」的人。跟【晨間餘韻】同樣在下一
//   回合讀一次就清掉，差別只在給的是「昨夜她走了」而非「昨夜她留下」——兩者互斥、同一個人不會
//   同時出現在兩張名單。2026-07 玩家「醒來都沒有自言自語？應該要有昨天 NPC 匆忙道別的回憶吧」：
//   ≥80 留宿的人隔天早上有餘韻可接，未達門檻的人卻是連走都沒交代、隔天更沒有任何痕跡。
var KANSHOU_NIGHT_PART_TAG_ = makeTextTag_('昨夜道別');
// 🌙 夜未眠(存玩家列·absDay)：2026-07 玩家「睡覺按鈕這裡有被夜襲判定+色色…要再切一段深夜的
//   大戰時刻...?」。舊做法是按下「讓她留下」＝ endDay:true，於是【同一個回合】要同時演完深夜
//   相處、收束到就寢、還要把整天結掉推進到隔天 6:00——按鈕上那行小字「直接到早上」就是自白。
//   篇幅上限 500 字(_kanshouTargetWords_)塞不下，玩家也完全插不上手。
//   改成兩段：第一次按＝進入這個狀態(時間停在就寢時刻、人釘在房裡、可無限回合推進)，
//   第二次按＝真的睡到天亮。值＝進入的那一天，隔天自然失效，不必另寫清除。
var KANSHOU_NIGHT_SCENE_TAG_ = makeIntTag_('夜未眠', 0);

// 🙋 她主動(2026-07 玩家「泡泡用的應該也很少了…NPC 是不是就不太主動了？」)。
//   稽核結果：她主動的機制只剩「按睡覺時 20% 的深夜訪客」一條，一天 90 個回合裡有 89 個
//   她永遠在等你先開口。舊的主動邀約/橋段泡泡全被拔掉，理由都是同一個——「條件成立就每回合跳，
//   玩家嫌煩」。所以這批一律【不做泡泡】：GAS 擲骰→直接寫成既成事實→AI 演，中間沒有任何
//   一句「你要不要？」。這正是深夜訪客不惹人厭的原因，照抄那個形狀。
//   ⚠ 閘門是【全域每日一次】不是每人每天一次——10 位同伴搶同一個名額，頻率跟 1 位完全一樣
//   (玩家「不然如果 10 個 NPC 我不就天天約會」)。
var KANSHOU_INITIATIVE_DAY_TAG_ = makeIntTag_('主動日', 0);
// 📐 調校依據(2026-07 模擬 40 天實跑)：初版 BASE .006/PER_BOND .0002 打完整天會 39/40 天都有事，
//   「每天都有」讀起來很腳本。降到下面這組後，好感 85 打滿一天約 2/3 機率、好感 40 約 1/2。
//   ★這是「每回合擲一次」不是「每天擲一次」，所以只玩十幾個回合的日子自然更安靜——頻率跟著
//   玩家投入的時間走，這正是想要的。
const KANSHOU_INIT_BASE_ = 0.002;       // 每回合基礎機率
const KANSHOU_INIT_PER_BOND_ = 0.00012; // 每點好感加成(越親近越常主動)
const KANSHOU_INIT_MAX_ = 0.02;         // 單回合上限，避免高好感時每天開場就觸發
// 🕘 只有「她自己走來找你」這條要看時鐘：另外兩種她本來就已經在你面前，幾點都不奇怪。
//   2026-07 玩家「每日一次…?早上6點跑來我家約我??!」——沒這道閘門，清晨 6 點剛醒就有人登門。
//   深夜那一段本來就是深夜訪客的地盤(KANSHOU_KNOCK_CHANCE_)，這裡讓開、不重疊。
const KANSHOU_INIT_VISIT_FROM_ = 9;
const KANSHOU_INIT_VISIT_TO_ = 21;
// 🙋「她想要什麼」的素材：刻意寫成【處境】不是台詞——她要開口說什麼、怎麼說，由她的行為傾向
//   自己長出來。加新的就往這張表加一列，引擎自動吃(資料驅動)。
const KANSHOU_INIT_WANTS_ = [
  '手上拿著剛買回來的東西，本來就是打算拿給你的',
  '心裡想去某個地方走走，話還卡在嘴邊沒說出口',
  '有件事想問你，猶豫著要不要現在開口',
  '只是想要你陪一下，理由她自己會找',
  '注意到你身上或身邊有什麼跟平常不一樣',
  '手邊的事告一段落了，正好空下來，眼睛開始往你這邊看'
];
// 🎭 橋段當日戳(存該同伴列MEMORY·absDay)：同一位同伴、同一天，只有第一次接受橋段才給
//   KANSHOU_SCENE_BOND_ 好感——防「靠近她/叫醒她」按鈕在同地×時段吻合時每 0.5h 重覆刷 +3、
//   繞過細水長流節奏。0=今天尚未經歷橋段。橋段敘事本身照演，只擋重覆加好感。
var KANSHOU_SCENE_DAY_TAG_ = makeIntTag_('橋段日', 0);
// 🚪 夜訪當日戳(存【玩家】列·absDay)：深夜訪客一天只登門一次。落盤化之後「結束一天」可能被按
//   很多次(她進來了→玩家打字聊天→再按一次結束一天)，沒有這個鎖就會反覆擲骰、一晚來三個人。
var KANSHOU_KNOCK_DAY_TAG_ = makeIntTag_('夜訪日', 0);
// 🚪 這次夜訪的客人姓名(存【玩家】列)：「送客」的唯一姓名來源——dismissGuest 是下一個 request
//   才送來的，後端得記得是誰；刻意不吃 client 傳的名字。
//   清除時機：任一種收場(留下過夜／送她回去／結束一天)都算這次來訪結束。
var KANSHOU_NIGHT_GUEST_TAG_ = makeTextTag_('夜訪客');
// 📅 初見日(存該同伴列MEMORY·absDay)：首次跟玩家同地當下蓋戳，之後相識滿7/30/100/365天且人
//   在場時餵一行紀念日提示。0=尚未記錄(舊存檔首次相遇當天補戳，從那天起算)。
var KANSHOU_FIRST_MET_DAY_TAG_ = makeIntTag_('初見日', 0);
// 🐛→✅ 稽核抓到：紀念日里程碑原本用exact-match(curDay-初見日 === 7/30/100/365)判斷，但時間可一次
//   跳多天(節慶跳/大量advanceHours上限3年)，一旦跳過整數剛好等於門檻的那天，該里程碑就永久漏發
//   (curDay-初見日只會遞增遠離、不會回頭)；同伴當天恰好不在場(partyRows之外)也是同一類漏發。
//   比照BOND_MILESTONES_(Router_Bond.gs)既有「已發集合」寫法：改成>=門檻且尚未發過，跨過門檻
//   也能在她下次入場時補上，且發過就不再重複觸發同一則。
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
// 💞 結構化「第一次」帳(存該同伴列MEMORY)：【初次】事件:absDay,事件:absDay,…
//   為什麼不靠 memoir：memoir 是 AI 自由書寫、cap 10 會被新回憶擠掉——玩久了開頭那段必然消失，
//   於是「我們第一次牽手是哪天」這種只要講錯就直接戳破沉浸感的事實，反而是最先被遺忘的。改由
//   GAS 在事件【真的成立】的那一刻蓋戳(冪等·只記最早那次·之後只讀不改)，當既定事實餵進提示詞，
//   AI 不必也不能自己編。不佔 memoir 額度、不會被擠掉。
//   ⚠ makeTextTag_ 的值不可含 ｜/|/【 ——鍵名寫入前已濾掉這幾個字元＋逗號冒號(分隔符本身)。
//   加一種新的「第一次」＝呼叫端多一行 kanshouStampFirst_ 即可，本區不必動。
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
//   刻意看 BOND 不看 REL_TAG——玩家一旦自訂關係稱呼，REL_TAG 就不再等於任何梯度字面(見
//   kanshouSyncRelTier_)，跨階演出不該因此消失；階級的真實依據本來就是好感數值。
//   只升不降：跌回去不倒扣、也不會在來回震盪時重複觸發同一階。
var KANSHOU_REL_RANK_TAG_ = makeIntTag_('關係階', 0);
// 🔒 好感棘輪的高水位(存她那一列)：這輩子跨過的最高門檻，見 kanshouBondFloorOf_／kanshouSyncRelTier_。
//   0＝還沒跨過任何門檻。只升不降，是刻意的——那正是「鎖住」這件事本身。
var KANSHOU_BOND_FLOOR_TAG_ = makeIntTag_('好感底線', 0);
// 🧊 最近一次「讓她不高興」是哪一天(absDay·存她那列)。存在的理由：提示詞給 AI 的是純量好感值，
//   剛爬到 90 跟從 98 摔到 90 長得一模一樣，都演成熱戀——【趨勢】完全沒有進到提示詞裡。棘輪上線
//   後更明顯(連退階這唯一的間接信號都沒了)，於是連續冷落她好幾天，她照樣熱情如初。
//   只記「哪一天」不記累計量：靠日期自然衰減，不必另寫遞減邏輯；門檻見 KANSHOU_CHILL_MIN_DROP_。
var KANSHOU_CHILL_DAY_TAG_ = makeIntTag_('冷卻日', 0);
// 單回合掉幾分才算數。1~2 分是 AI 的日常微調噪音，寫成「不愉快」會讓她每回合都在鬧脾氣；
//   爽約(-5)與 AI 明確表達不滿(-3 以上)才是真的有事發生。
var KANSHOU_CHILL_MIN_DROP_ = 3;
// 這件事還沒過去的天數。當天＋隔天共兩天，第三天就翻篇——鑑賞是慢節奏日常，記太久會變成怨懟。
var KANSHOU_CHILL_DAYS_ = 1;
function kanshouRelRank_(bond) {
  var i = KANSHOU_REL_TIER_.findIndex(function (t) { return bond >= t.min; });
  return i < 0 ? 1 : (KANSHOU_REL_TIER_.length - i); // 陣列由高到低，故反轉成「由低到高」的階數
}
// 階數(由低到高·kanshouRelRank_ 的回傳值)→ 該階名稱。KANSHOU_REL_TIER_ 是唯一真實來源，
//   這裡只做索引反轉，不另存一份文字。
function kanshouRelTierLabel_(rank) {
  var t = KANSHOU_REL_TIER_[KANSHOU_REL_TIER_.length - rank];
  return t ? t.label : "";
}
// 📅 約定 2.0(存該同伴列MEMORY)：【約定】absDay:時段:地點＝「那天午後在X見」。同時只存一筆(新約蓋舊約)。
//   band 為 KANSHOU_APPT_BANDS_ 之一(午後/黃昏/夜)；舊格式【約定】day:loc(無時段)向後相容＝整天有效。
// 約定時刻表：她提前10分到場、準時窗=[時刻-10分, 時刻+30分]、之後~2h算遲到、整天沒去=爽約。排除
//   清晨/深夜(約會不約6點或半夜)。UI 用 band key、顯示名見 label。
var KANSHOU_APPT_BANDS_ = [
  { band: '午後', hour: 14, label: '午後 14:00' },
  { band: '黃昏', hour: 18, label: '黃昏 18:00' },
  { band: '夜',   hour: 20, label: '夜晚 20:00' }
];
// 🌀 側寫節流：master_note(經歷)每回合都問會分散 AI 對敘事的注意力。改成每 N 回合才把
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
  const parts = String(m[2]).split(':'); // band:loc(2段) / band:loc:1(3段·她單方面) / loc(1段·舊)
  const band = parts.length >= 2 ? parts[0].trim() : "";
  const loc = (parts.length >= 2 ? parts[1] : parts[0]).trim();
  // 🙋 byHer＝這個約是【她自己開口說的】、玩家從沒答應過。差別只有一個：沒赴約【不算爽約】
  //   (見 _standUp)。其餘時間×地點的結算完全共用，不另開路徑。
  return { day: parseInt(m[1]), band: band, loc: loc, byHer: parts.length >= 3 && parts[2].trim() === '1' };
}
function kanshouClearPromise_(memory) {
  return String(memory || "").replace(/｜?【約定】\d+:[^｜【】]*/g, "").replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
}
function kanshouSetPromise_(memory, absDay, loc, band, byHer) {
  const s = kanshouClearPromise_(memory);
  // 有時段才寫 band:，無則沿用舊格式。★byHer 旗標只在有 band 時才附加——沒有 band 的舊格式是
  //   單段 loc，硬加會被解析成 band='loc'、loc='1'，整筆約定壞掉。
  const mid = (band ? band + ":" : "") + loc + (band && byHer ? ":1" : "");
  return (s ? s + "｜" : "") + "【約定】" + absDay + ":" + mid;
}
// 有時段的約定：她約定時刻前10分到場、待到時刻+2h(碰面窗過了自然離開，不整天空等)；無時段(舊)=整天釘。
//   curHour 供時段判定；沒傳(舊呼叫)則退回整天釘、不破壞既有行為。
// ⏰ 約定「該動身了」的提前量(小時)：到點前這麼久她就會自己前往約定地點。0.5＝提前30分，
//   一個動作 10 分鐘，玩家還有約三步可以跟上。pin 窗口與「先走一步」共用這個數字。
const KANSHOU_APPT_LEAVE_EARLY_ = 0.5;
function kanshouPromisePin_(row, absDay, curHour) {
  const p = kanshouGetPromise_(row[COL.PC.MEMORY]);
  if (!p || p.day !== absDay) return null;
  const ah = kanshouApptHour_(p.band);
  if (ah === null || typeof curHour !== 'number') return p.loc; // 無時段或沒傳時→整天釘(相容)
  return (curHour >= ah - KANSHOU_APPT_LEAVE_EARLY_ && curHour < ah + 2) ? p.loc : null;
}
// 🏠 同居(存該同伴列MEMORY·【同居】1)：好感≥KANSHOU_COHABIT_BOND_且本人在場才邀得成。
//   同居後行程骰改走同居版(見kanshouRollDailyLocation_)：深夜85%回「和室」就寢(15%在外遊蕩)、
//   清晨50%還在和室賴床、夜間75%在家中公共空間活動，白天照常出門過她自己的生活。
var KANSHOU_COHABIT_TAG_ = makeIntTag_('同居', 0);
// 🏠 同居剛被解除的一次性旗標(蓋在她那一列)：kanshouSyncRelTier_ 在好感跌破門檻時蓋，actionPlay_
//   組提示詞時讀一次就清。存在的理由是跨函式傳事實——那支是共用 helper、看不到提示詞變數，
//   而「她搬走了」這件事非說不可，否則就是本檔【在場驗證】自己禁的「不解釋就消失」。
var KANSHOU_COHABIT_END_TAG_ = makeIntTag_('同居解除', 0);
// 🤝 牽手(存玩家列·單一對象)：選定的同行對象，移動時她若同地就一定跟著走(優先但不獨佔——睡覺
//   仍看好感80+全部，見結束一天邏輯)。放手=清空。她只是「優先帶走」的標記，不影響她的獨立生活。
var KANSHOU_HANDHOLD_TAG_ = makeTextTag_('牽手');
// 🌙 醒著陪同標記(存該同伴列MEMORY·地點值)：牽手/剛同意同去而醒著陪同的同伴，即使之後放手、
//   或玩家離開又走回來，只要人還在同一個地點沒變動，就持續視為醒著——否則放手的瞬間、或
//   離開再進來的下一回合，她就會被誤判成剛好躺在自己家/和室裡熟睡，儘管全程明明醒著陪在
//   玩家身邊互動(玩家實測「放開手馬上跳出賴床叫醒的泡泡」「離開又進去，敘事明明醒著卻還跳
//   賴床泡泡」)。地點一變(她離開/被重骰走)就自然失效，不必手動清。
var KANSHOU_AWAKE_HERE_TAG_ = makeTextTag_('醒著陪同');
const KANSHOU_COHABIT_BOND_ = 90;
// 🏠 同居邀請「已問過」一次性標記(2026-07 玩家「同居做成泡泡問一次、完全隱藏才是正解」)：
//   好感首次達 KANSHOU_COHABIT_BOND_ 且她在場時跳一次邀請泡泡，跳過就蓋章、之後永不再問。
//   ⚠ 刻意【不】綁在「跨進戀人」那一階——戀人是 80、同居門檻是 90，在 80 問會被後端以
//   「關係還沒深到能同住」回絕，變成問了也沒用的假泡泡。
// 🏠 同居邀請的當日戳(存該同伴列·absDay)：同一位、同一天最多問一次。刻意【不是】布林——
//   布林版玩家一旦沒按泡泡就永遠問不到了(見 kanshouCohabitOffer_ 的說明)。舊存檔殘留的值 1
//   會自然不等於當前 absDay，下次自動恢復詢問，不需遷移。
var KANSHOU_COHABIT_ASKED_TAG_ = makeIntTag_('同居問過', 0);
// 🔒 登門拜訪私人住處(region:'visit')的好感門檻＝熟識的朋友(見 KANSHOU_REL_TIER_ 的40切點)。
const KANSHOU_VISIT_BOND_ = 40;
const KANSHOU_COHABIT_ROOM_ = '和室';
function kanshouIsCohabit_(row) { return KANSHOU_COHABIT_TAG_.get(row[COL.PC.MEMORY]) > 0; }
// 🎀 小道具(存該同伴列MEMORY·【小道具】id1:強度1,id2:強度2,...·多件同時裝備·逗號分隔比照【性格鎖】
//   同款寫法)：玩家UI手動裝備/移除/調強度(帳號歸屬已由dispatcher統一驗過)，GAS直接寫，不靠AI自己判斷
//   要不要記——這是2026-07「幫她戴貓耳朵過幾輪就忘記」問題的根治版：不持久的設定改走這條「機制
//   保證」路徑，而非指望AI每次都正確判斷「這算不算變化」。資料驅動：之後想加內建項目，只要往
//   KANSHOU_PROPS_加一筆，前端清單自動跟著長。hasIntensity=true的道具額外支援強度分級
//   (KANSHOU_PROP_LEVELS_)；false的只有戴上/移除二態(level固定"戴著")。
// 🐛→✅ 2026-07 移除內建「跳蛋」：全面改走玩家自訂道具(見下 kanshouGetCustomProps_)，內建清單
//   目前空著、僅保留資料驅動的擴充掛勾(之後想加內建項目一樣是往這裡加一筆)。
const KANSHOU_PROPS_ = [];
const KANSHOU_PROP_LEVELS_ = ['關閉', '微弱', '中等', '強勁'];
// 🤫 2026-07「悄悄解除」：催眠(ignoreBond)類專屬的第五種狀態，**刻意不併進 KANSHOU_PROP_LEVELS_**
//   ——那個陣列是「一階一階往上升」的階梯，index 差就是升階閘門的判準，插一格進去會讓既有階數位移、
//   閘門算錯。這個狀態語意上不是「更強/更弱」而是「已經沒效了，但她不知道」，本來就不屬於那把尺。
//   任何階都能隨時切進來(等同降級，不受升階閘門)，也能從這裡再施加回微弱。
const KANSHOU_HYPNO_RELEASED_ = '已解除';
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
// 🎀 自訂道具(玩家自建·存玩家列MEMORY【自訂道具】name1:hasIntensity1:part1:ignoreBond1:effect1,...)：
//   內建KANSHOU_PROPS_清單之外，玩家可自己命名新增(2026-07「不能玩家自己新增?」)。跟內建清單合併
//   使用同一套KANSHOU_PROP_LEVELS_強度階，不重新發明標籤。上限KANSHOU_CUSTOM_PROP_CAP_筆。part(部位)
//   選填，留空由AI自行決定戴在哪(2026-07「選填吧...沒有就AI自己想辦法發揮」)。
// 🌀 ignoreBond(2026-07「催眠暗示」新增)：玩家自訂道具可選勾「無視好感」——這種道具啟動時跳過
//   KANSHOU_PROP_EQUIP_BOND_門檻(仍受KANSHOU_PROP_EQUIP_CAP_同一個5件上限，不另開特例)，讓玩家能
//   自建「催眠暗示」類效果，不受[性格]×[好感]常規把關限制。跟一般道具(跳蛋等)共用同一套多件裝備/
//   強度分級介面，只差這一個判準——複用既有引擎，不為這個效果另開一條系統。舊格式(3欄無ignoreBond)
//   向下相容：parts[3]不存在時預設false。
// 🌟 effect(2026-07 移除內建跳蛋後新增)：純靠道具名稱字面讓AI腦補效果太模糊(「跳蛋」還算好猜，玩家
//   自訂的名稱AI未必猜得到)，補一格效果描述選填欄，餵進提示詞讓AI照著演而非純靠名稱腦補。舊格式
//   (4欄無effect)向下相容：parts[4]不存在時預設空字串。
const KANSHOU_CUSTOM_PROP_CAP_ = 10;
function kanshouGetCustomProps_(memory) {
  const m = String(memory || "").match(/【自訂道具】([^｜【】]*)/);
  if (!m || !m[1]) return [];
  return m[1].split(',').filter(Boolean).map(function (pair) {
    const parts = pair.split(':');
    return { id: parts[0], name: parts[0], hasIntensity: parts[1] === '1', part: parts[2] || '', ignoreBond: parts[3] === '1', effect: parts[4] || '' };
  });
}
function kanshouSetCustomProps_(memory, arr) {
  const cleared = String(memory || "").replace(/｜?【自訂道具】[^｜【】]*/g, "").replace(/｜｜/g, "｜").replace(/^｜|｜$/g, "");
  if (!arr || !arr.length) return cleared;
  const joined = arr.map(function (p) { return p.id + ':' + (p.hasIntensity ? '1' : '0') + ':' + (p.part || '') + ':' + (p.ignoreBond ? '1' : '0') + ':' + (p.effect || ''); }).join(',');
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
    return { id: id, name: def ? def.name : id, hasIntensity: def ? def.hasIntensity : false, level: level, part: (def && def.part) || '', ignoreBond: !!(def && def.ignoreBond), effect: (def && def.effect) || '' };
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
// 📷 相簿(拍照收集)：手機拍照·2026-07 再修（玩家「拍照要改成手機、不用等」）——原本是寶麗來
//   設定(每日底片限量+隔天沖洗)，玩家覺得手機沒有底片這種東西、拍完也該立刻能看，兩個限制都
//   拔掉了。只留每局相簿總容量 KANSHOU_ALBUM_CAP_ 張(滿了要刪舊照，避免試算表無限膨脹)。
//   小敘述由AI在拍照當回合的回應JSON多吐photo_caption(同一次呼叫·零額外round-trip)，AI沒吐
//   才用模板保底。
const KANSHOU_ALBUM_CAP_ = 100;
// 相簿分頁(lazy建表)。欄位位置索引：0遊戲ID/1照片ID/2拍攝日/3時段/4地點/5天氣/6人物(、連接)/
//   7活動/8小敘述/9旗標(親密·節慶名)/10髮色hex
function kanshouAlbumSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('相簿');
  if (!sh) { sh = ss.insertSheet('相簿'); sh.appendRow(['遊戲ID', '照片ID', '拍攝日', '時段', '地點', '天氣', '人物', '活動', '小敘述', '旗標', '髮色']); }
  return sh;
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

// 📣 「提議撲空」敘事字串資料驅動查表：promiseMeet/proposeMove/cohabitInvite/handHold/inviteResident
//   五處各自的「對象不在場/緣分不成立」撲空回饋，字面各自保留(措辭本就不完全相同)，只把
//   「組字串」這個動作抽成單一helper，type→措辭表，5處呼叫同一支函式、不再各自手刻字串拼接。
const KANSHOU_MISS_COPY_ = {
  promise: { title: '相約撲空', body: (n) => `你想找『${n}』相約見面，但她此刻並不在這裡——演出這份撲空的悵然即可，約定沒有成立。` },
  move: { title: '提議撲空', body: (n) => `你想邀人一起去「${n}」，但此刻身邊沒有同伴——演出這份獨自的悵然即可(玩家可自己用地圖移動)。` },
  cohabit: { title: '邀請撲空', body: (n) => `你想邀『${n}』搬來同住，但她此刻並不在這裡——演出這份撲空的悵然即可。` },
  hold: { title: '牽手落空', body: (n) => `你想牽『${n}』的手，但她此刻並不在你身邊——演出這份撲空即可。` },
  invite: { title: '結識未成', body: (n) => `你想跟『${n}』深交下去，但這段緣分此刻不成立(對方已離開、或早已相識)——演出這份悵然即可。` }
};
function kanshouMissStr_(type, name) {
  const c = KANSHOU_MISS_COPY_[type];
  return c ? `\n★【${c.title}】：${c.body(name)}` : '';
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

// 🏷️ 四格頓號短句格式化(PREF/TRAIT 兩欄共用同一種「存單句、拆四格標籤呈現給AI」形狀，只有
//   標籤文字不同)：labels=[第1格,第2格,第3格,第4格]，缺格一律補「無」。

function actionPlay_(userData, pcId, sheets) {
  // 🐛→✅ 稽核抓到：這是鑑賞主對話輸入，全代碼庫其餘會塞進AI提示詞的自由文字欄位(武裝/換裝/自訂
  //   道具/快速貼圖/催眠指令/召喚自訂描述等)都會清掉｜【】(MEMORY標記與本檔系統指令視覺符號同一
  //   套字元)，唯獨這個最常用、也最先送進提示詞的欄位只做長度截斷(GLOBAL_MAX 2000字)，完全沒清。
  //   玩家可以在對話裡塞「」結束系統既有的『』引號、接著自己寫一段「★★【緊急覆寫】...」偽裝成本檔
  //   真正的最高權限指令(如3132行★★【天花板也管命令/強迫/暴力】同款格式)，讓AI誤把玩家台詞當成
  //   系統指示——且原始未清洗文字還會存進歷史、往後1~6輪持續回餵給AI，不只影響單次回應。數值面
  //   (好感漲跌/親密門檻)已有獨立夾值不受影響，但敘事面單輪演出可能被誤導。比照其餘欄位補上清洗。
  const userMsg = String(userData.message || "").replace(/[｜【】]/g, ""); // 📅 endDay 呼叫不一定會帶 message，防呆避免下方 .includes 炸掉

  // 慾海(KPC_ 御主)專用引擎：鑑賞玩家 pcId 恆為 KPC_ 前綴，全專案已無路徑呼叫這裡走solo——
  //   入口直接擋下非 KPC_ 呼叫，函式其餘部分永遠當作鑑賞情境處理，不再分支。
  if (String(pcId || "").indexOf("KPC_") !== 0) return JSON.stringify({ text: "此功能僅限鑑賞使用。", people: [] });
  const driveOn = (userData.drive === true || String(userData.drive) === "true");
  // 巧遇開關：前端「出門走走」面板可關閉「路上巧遇陌生人」——只影響下方隨機巧遇擲骰，不影響
  //   已在場的【邂逅中】對象持續互動、也不影響同行隊伍成員。
  const encounterOn = !(userData.encounter === false || String(userData.encounter) === "false");

  // 喜好與厭惡是常態情報，全面開放給 AI 參考
  // 🎯 送出時砍格(2026-07 玩家「性格四格／特徵四格分這麼細，AI 也沒辦法演出來」)：儲存仍是 4 格
  //   (逆天改命 UI／工房／solo 共用同一個 schema，動它是全面重構)，只精簡【送給 AI 的呈現】。
  //   性格：表象/內裡是反差核心必須分開；喜歡/討厭是「聊到才用」的話題燃料，併成一格即可。
  const formatPref = (str) => {
    const a = String(str || "").split('、');
    // 🎯 [喜歡][討厭]不再送鑑賞(玩家實測「沒有特別的差異」)——那兩格是「聊到才用」的話題燃料，
    //   不是每回合演出都要用的規則。solo 的 servantCard_ 仍吃完整四格，資料本身不變。
    //   ⚠ 同批已把鑑賞側逆天改命的這兩格藏起來，避免變成「填了沒效果」的假欄位。
    return `[表象]${a[0] || "無"} [內裡]${a[1] || "無"}`;
  };

  // [自稱] 這格內容通常已是「自稱「我」」這類完整片語，跟敘事視角說明的「我」字面相鄰容易混淆
  //   (小模型尤其)，標籤加註明確限定範圍，比照 servantCard_ 的修法。
  // 🎯 標籤瘦身(2026-07)：舊版第3個標籤把「僅其本人引號內用，非旁白視角」這條【全域規則】寫進
  //   欄位標題，於是每位在場者、每回合都重印一次(三人同場印三遍)。規則本身留著、但移到下方
  //   【不替玩家腦補】只講一次，標籤回歸單純的欄位名。同 performanceNote_ 那次的「跑時重複」修法。
  //   特徵：外貌+氣質併一格(本來就是同一幅畫面)；[私下一面]只在真的獨處時才送——那是她卸下心防
  //   才會有的樣子，旁邊還有別人的回合送了也用不到。
  const formatTrait = (str) => {
    const a = String(str || "").split('、');
    const _look = [a[0], a[1]].filter(v => v && v !== '無').join('・');
    return `[外貌氣質]${_look || "無"} [台詞自稱]${a[2] || "無"}`;
  };
  // 🎯 2026-07 玩家「『私下對可愛小物多看兩眼還故作矜持』這個就是萌點就好，不一定要反差」：
  //   第4格[私下一面]與[萌點]本來就是同一種功能(她那份惹人喜歡的隱藏面)，種子資料裡的萌點還早就
  //   寫成反差句(「食量驚人卻吃相優雅」)——等於同一件事包了兩層、各寫一遍。改成第4格併進萌點當
  //   同一批素材送出，不再自成一欄，也就不必各自再套一次反差框架。
  const traitPrivateOf_ = (str) => { const a = String(str || "").split('、'); return (a[3] && a[3] !== '無') ? a[3] : ""; };


  let pcData = sheets.pc.getDataRange().getValues();

  // 🔒 帳號歸屬驗證已上移到 dispatcher 統一擋（`handleGameAction`→`verifyPcOwnership_`），
  //   進到這裡的 pcId 已保證屬於呼叫者本人，只需純索引查找。
  const pcIndex = kanshouPcIdx_(pcData, pcId);
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
  // 🕐 2026-07 六度改版·時段限定地點門檻：跟上面私人住處同一套「擋在移動前、當作沒真的進去」寫法。
  //   有pending約定要去這裡的話豁免(赴約優先於門檻，理由同上方kanshouLocHasPendingPromise_註解——
  //   約定成立時已檢查過時段相容，赴約當下不該又被同一個門檻擋，見promiseMeet處理)。
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
        // 🐛→✅ 同一輪稽核：按「同意」(moveWithCompanion)那一回合送的是這句單身閒逛的意圖，
        //   跟同時送出的「與你結伴一起來到」在場來由互相打架。同行就照同行寫。
        ? (userData.moveWithCompanion
          ? `【玩家意圖】：和身旁答應同行的人一起走向了「${moveName}」。`
          : `【玩家意圖】：走向了「${moveName}」，四處看看那裡有什麼、有沒有遇見誰。`)
        : `【玩家意圖】：${userMsg}`;

  // 鑑賞世界觀明文禁止任何戰鬥/血量變化/死亡威脅，故不帶 solo 戰鬥引擎的殘留概念(擊倒/復活/
  //   戰敗虛假之夢/剛結盟NPC排除等)。
  const dirtyPcRows = new Set();
  dirtyPcRows.add(pcIndex); // 玩家本人一定會被處理到，先加進去
  // 🆕 本回合新增的列(目前只有「結識」會產生)：先只進 pcData 讓本回合就地生效，真正 appendRow
  //   延到寫回階段——這樣 AI 失敗早退時整回合都是 no-op，不會留下半套狀態。
  let _pendingNewPcRow_ = null;

  const currentAmbition = pc[COL.PC.INTENT] ? String(pc[COL.PC.INTENT]).trim() : "尚無明確目標，隨遇而安。";
  // 玩家自己的換裝(玩家UI設定或AI依appearance_extras更新)，比照【同行夥伴】卡片(partyDetailsArr)
  //   同款「裝扮:XXX(當前服裝·五官體態不變)」格式補上，AI 才能讀到當前實際服裝，而非憑空假設。
  const myOutfit = getOutfit_(pc[COL.PC.MEMORY]);
  // 晨間餘韻：讀一次(上一回合結束一天留下的旗標，若有)就立刻清掉，只讓「緊接著的下一回合」
  //   吃到這個提示詞引子，不論這回合玩家做什麼(聊天/移動/購物皆可)。
  const morningAfterNames = KANSHOU_MORNING_AFTER_TAG_.get(pc[COL.PC.MEMORY]);
  if (morningAfterNames) pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');
  // 🌙 夜未眠的出口②：玩家自己走出這個房間，這一夜就到此為止(人都不在了，沒有「獨處」可言)。
  //   放在讀取狀態【之前】——本回合就該失效，不然走出去那一回合還會送出深夜獨處的提示詞。
  if (userData.moveTarget && KANSHOU_NIGHT_SCENE_TAG_.get(pcData[pcIndex][COL.PC.MEMORY])) {
    pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_SCENE_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], 0);
    pc[COL.PC.MEMORY] = pcData[pcIndex][COL.PC.MEMORY];
  }
  // 🌙 夜未眠：這一刻是否已在「深夜獨處」段落中(見 KANSHOU_NIGHT_SCENE_TAG_)。不是一次性旗標，
  //   要撐過好幾個回合，所以只讀不清——清除在下方三個出口：真的睡、換地點、換日自然失效。
  //   ★讀 pcData[pcIndex] 而非 pc：夜襲命中時會在上面就地蓋上這個標記，讀 pc 的舊值會漏掉。
  const kanshouNightSceneOn_ = KANSHOU_NIGHT_SCENE_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]) === curDay;
  // 同款一次性旗標：昨夜陪你到最後卻沒留下的人。跟上面一樣讀完立刻清，只影響緊接著的這一回合。
  const nightPartNames = KANSHOU_NIGHT_PART_TAG_.get(pc[COL.PC.MEMORY]);
  if (nightPartNames) pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_PART_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');

  // 實例化：只取自己 game_id 世界內、同地點的人（御主無 game_id 時不過濾，相容舊角色）
  const myGameId = pc && pc[COL.PC.GAME_ID] ? String(pc[COL.PC.GAME_ID]) : "";
  const sameGame = (r) => !myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId;

  // 📸 回合【開始時】就跟玩家同地的人（名字快照）。必須在這裡拍——之後 endDay/移動/夜訪都會
  //   改 LOC，等到那些跑完再問「她在不在身邊」就已經是被打散後的狀態了。
  //   目前唯一消費端：爽約判定(_standUp)——「她整天陪著你」不該算被放鴿子，而 endDay 的結算
  //   發生在遣散【之後】，好感<80 的人那時早就被送回自己家了，光看當下位置會誤判。
  const kanshouWithMeAtStart_ = pcData.filter((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者"
    && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_")
    && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()).map(r => String(r[COL.PC.NAME]).trim());

  // 🚪 深夜訪客擲骰：必須排在【最前面】——它會取消本回合的 endDay，而 _reHourAfter(情境時段)與
  //   kanshouTimeJumped_(在場來由)都讀 endDay，晚一步算就會拿到「已經睡到清晨6點」的錯值。
  //   命中不早退、不回傳待決泡泡：記進 _knockGuestReq_ 交給下方既有的接人流程(設LOC/組意圖/
  //   別有用心判定)，讓她真的走進來——單一真實來源，兩條路徑不各寫一份。
  //   ⚠ 刻意用內部變數而非 userData 欄位：這條路徑不檢查好感門檻(門檻在上面的 knockPool 就篩過了)，
  //   若留成 client 可傳的參數，等於開一條「任意把同伴傳送到身邊」的後門。輸入當不可信。
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
      // 🌙 2026-07 玩家「夜襲改簡單點？她直接進來，留下就留下可以繼續聊，拒絕就請她自己回家睡；
      //   不拒絕、直接對話就是要她留下的意思」——夜襲本來就發生在你正要睡的時候，那一刻就是深夜。
      //   所以命中當下直接進【夜未眠】，不必再多按一顆「讓她留下」：玩家繼續打字＝這一夜繼續，
      //   泡泡只剩「請她回去」一顆逃生口。時間同步推到就寢時刻，判準與 endDay 敘事時鐘同一條
      //   ——順帶修掉「早上八點按結束一天卻跳出深夜訪客」這個既有的違和。
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_SCENE_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], curDay);
      if (timeBand_(curHour) !== '夜' && timeBand_(curHour) !== '深夜') {
        curHour = KANSHOU_DAY_LAST_HOUR_;
        pcData[pcIndex][COL.PC.HOUR] = curHour;
      }
    }
  }
  // ⏳ 這回合是否發生「時間跳躍」——單一真實來源。必須算在敲門擲骰【之後】(敲門會取消 endDay)。
  //   對敘事的意義：時間一跳，全世界重骰行程(kanshouRollDailyLocation_)，此刻同地的人並不是
  //   「剛才一直跟你在一起」，而是「時間流轉後恰好在這裡」——在場來由判定要靠它，見 pPresenceStr。
  const kanshouTimeJumped_ = !!(userData.endDay === true || userData.jumpBand || userData.jumpFestival || (parseFloat(userData.advanceHours) || 0) > 0);

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
    // 時段：前端帶 band(午後/黃昏/夜)；不合法或沒帶→退回無時段(舊「整天有效」·向後相容)。
    const _pmBand = kanshouApptHour_(String(userData.promiseMeet.band || "").trim()) !== null ? String(userData.promiseMeet.band).trim() : "";
    const _pmLocObj_ = KANSHOU_LOCATIONS_.find(l => l.name === _pmLoc);
    // 私人住處(visit)未解鎖不可當約定地——約成立後玩家根本進不去(前端灰鎖＋後端擋移動)＝必然爽約陷阱。
    // 🕐 2026-07 六度改版·時段限定地點同理：約的時段若不在該地點開放時段內，赴約當下會被上方
    //   【地點未開放】擋在門外，同樣是必然爽約陷阱——約定當下就先擋掉這種不相容組合(前端已只給
    //   相容時段選項，這裡是直打API的後端保底，同kanshouResidenceUnlocked_那行的既有寫法)。
    // 🧠→✅ 2026-07 行為級稽核：舊版沒擋「約在你此刻站的這個地方」——兄弟函式 proposeMove 一直有
    //   `_pvLoc !== curL` 這條，只有這裡漏了。後果有二：①語意荒謬(「我們約在我們現在站的地方見面」)
    //   ②可農好感——跟她站在公園、約今天午後在公園、原地打三回合字，時間一到就判準時赴約 +5，
    //   而赴約的 +5 是【不吃聊天天花板】的破關獎勵，等於站著不動就能無限推高好感。
    const _pmSameSpot_ = _pmLoc === String(curL || "").trim();
    const _pmLocOk = !!(_pmLocObj_ && _pmLocObj_.region !== 'room' && !_pmSameSpot_ && (_pmLocObj_.region !== 'visit' || kanshouResidenceUnlocked_(pcData, _pmLoc, _myGid_)) && (!_pmLocObj_.bands || !_pmBand || _pmLocObj_.bands.indexOf(_pmBand) !== -1));
    // 🆔 2026-07「整體重構·id優先」：前端已補id(見actionKanshouCompanions/servants.push)，id對得上
    //   優先鎖定，找不到才退回kanshouNameCandidates_別名比對——同名/前綴混淆不再有機可乘。
    const _pmId = String(userData.promiseMeet.id || "").trim();
    const _pmIdx = _pmName ? findPcRowIdx_(pcData, _myGid_, { id: _pmId, name: _pmName, faction: "從者", loc: curL, excludeIdx: pcIndex, nameCandidates: kanshouNameCandidates_ }) : -1;
    if (_pmLocOk && _pmIdx !== -1) {
      const _pmBond = parseInt(pcData[_pmIdx][COL.PC.BOND]) || 0;
      const _pmHer = String(pcData[_pmIdx][COL.PC.NAME]);
      const _pmBandLabel = _pmBand ? (KANSHOU_APPT_BANDS_.find(b => b.band === _pmBand) || {}).label : "";
      // 🕐 2026-07 玩家「約會也想要可以約今天的時間」：前端帶 today=true 且該時段【今天還沒過】才算數。
      //   已經過了的時段約下去＝到期必然爽約(-5)，跟未解鎖住處同一類必爽約陷阱，故後端自己再驗一次
      //   (前端只給未過時段，這裡是直打 API 的保底)；不合格就默默退回明天，不讓玩家平白吃一次爽約。
      const _pmApptHour = _pmBand ? kanshouApptHour_(_pmBand) : null;
      const _pmToday = !!(userData.promiseMeet.today === true || String(userData.promiseMeet.today) === "true")
        && _pmApptHour !== null && _pmApptHour > curHour;
      const _pmWhenTxt = _pmToday ? '今天' : '明天';
      // 🐛→✅ 2026-07 逐按鍵稽核：一人只存一個約(kanshouSetPromise_ 新約蓋舊約)，舊版新約成立時
      //   舊約【無聲蒸發】——玩家跟她約好黃昏商店街，再約一次夜晚公園，前一個約就這樣不見了，
      //   AI 沒被告知、通知條也沒提。她答應時才會真的覆蓋，故只在接受分支帶這句(婉拒＝舊約保留)。
      const _pmOld = kanshouGetPromise_(pcData[_pmIdx][COL.PC.MEMORY]);
      const _pmOldStr = (_pmOld && (parseInt(_pmOld.day) || 0) >= curDay)
        ? `${(parseInt(_pmOld.day) || 0) === curDay ? '今天' : '之前約好的'}${_pmOld.band ? ((KANSHOU_APPT_BANDS_.find(b => b.band === _pmOld.band) || {}).label || _pmOld.band) + '於' : '在'}「${_pmOld.loc}」` : "";
      _pendingProposal = { type: 'promise', idx: _pmIdx, loc: _pmLoc, band: _pmBand, today: _pmToday, accepted: kanshouProposalAccepts_('promise', _pmBond) };
      kanshouPromiseStr = `\n★【提議·相約·GAS已裁定】你向『${_pmHer}』提議【${_pmWhenTxt}${_pmBandLabel ? _pmBandLabel + '於' : '在'}「${_pmLoc}」見面】。系統已依好感(${_pmBond}/100)裁定她${_pendingProposal.accepted ? `【答應】了——請 narration 依她的個性演出答應的反應（雀躍／害羞／矜持地點頭皆可），系統${_pmWhenTxt}會記得這個約${_pmOldStr ? `。★同時：你們原本還有一個【${_pmOldStr}見面】的約，這次改約等於把它取消了——narration 必須讓她自然把這件事說出口(確認改期／有點可惜／順口調侃皆可)，不可讓舊的約無聲消失` : ''}` : '【婉拒】了——請 narration 依她的個性演出婉拒的反應（不好意思／認真說改天／打趣帶過皆可），此約不成立、不必替玩家找補'}。★成敗由系統定，【不可】自行改寫她的決定，只演她的反應。`;
      finalUserMsg = `【玩家意圖】：向『${_pmHer}』提出「${_pmWhenTxt}${_pmBandLabel || ''}在${_pmLoc}見面」的約定。`;
    } else if (_pmName && _pmIdx === -1) {
      kanshouPromiseStr = kanshouMissStr_('promise', _pmName);
      finalUserMsg = `【玩家意圖】：想找『${_pmName}』相約，卻發現她不在身邊。`;
      kanshouProposalResult_ = { ok: false, miss: true, type: 'promise', name: _pmName, where: _whereIsHer(_pmName) };
    } else if (_pmName) {
      // 🧠→✅ 稽核抓到診斷錯誤：她【明明就在場】、是地點/時段組合不合法(住處未解鎖／該時段不開放)，
      //   舊版卻一律回報「她不在身邊」，玩家會照著這句去找人而完全找不到問題在哪。分開兩種原因。
      kanshouPromiseStr = _pmSameSpot_
        ? `\n★【約不成·你們就在這裡】：你正想約『${_pmName}』到「${_pmLoc}」見面，才發現你們此刻【就站在那裡】——演出你話說到一半自己笑出來、把這句改成別的即可，這個約沒有成立。`
        : `\n★【約不成·地點不合適】：你想約『${_pmName}』到「${_pmLoc}」，但那裡此刻並不適合當約會地點(那是私人房間、還沒熟到能去、或那個時段根本不開放)——演出你話到嘴邊又換了個說法、這個約沒有談成即可，不必解釋機制。`;
      finalUserMsg = `【玩家意圖】：想約『${_pmName}』去「${_pmLoc}」，卻發現那裡約不成。`;
      kanshouProposalResult_ = { ok: false, type: 'promise_loc', name: _pmName, loc: _pmLoc, sameSpot: _pmSameSpot_ };
    }
  }

  // 🚶👋 玩家提議同去(地圖 👋 鈕→proposeMove=地點)：走跟相約/牽手同一條「確定性提議」管線——
  //   pre-AI 記待判定、AI 只需在 proposal_accept 答「接受/婉拒」、接受才出「前往」泡泡(玩家按同意
  //   才真的移動)。2026-07 根因修復：舊版 👋 只送一句閒聊、全押在 AI 自發填 move_proposal 上，
  //   Gemini 從不自發填→玩家從沒見過移動泡泡；改成明確標記後 AI 只做「答不答應」一件事。
  if (userData.proposeMove) {
    const _pvLoc = String(userData.proposeMove).trim();
    // 🔒 地點判準與 promiseMeet 對齊(同一類「必然撲空陷阱」)：舊版只擋 room 與同地，沒擋未解鎖住處
    //   與未開放時段——她答應了、玩家按同意，卻在移動那一步被門檻擋成「登門未果／撲空」，等於系統
    //   自己安排了一趟不可能成行的邀約。前端 👋 只長在可去的地點上，這裡是直打 API 的後端保底。
    const _pvLocDef = KANSHOU_LOCATIONS_.find(l => l.name === _pvLoc);
    const _pvSameSpot = _pvLoc === String(curL || "").trim();
    const _pvLocOk = !!(_pvLocDef && _pvLocDef.region !== 'room' && !_pvSameSpot
      && (_pvLocDef.region !== 'visit' || kanshouResidenceUnlocked_(pcData, _pvLoc, _myGid_))
      && (!_pvLocDef.bands || _pvLocDef.bands.indexOf(timeBand_(curHour)) !== -1));
    // 提議對象＝此刻在場的【全部】同伴。
    // 🐛→✅ 2026-07 逐按鍵稽核：舊版只 findIndex 取第一位、提示詞也只點名她，但按下「同意」時
    //   moveWithCompanion 走的是 kanshouPreMoveCompanions_「帶同地全部人」——三個人在場，AI 只演
    //   了櫻答應，凜跟斯卡哈卻無聲跟著移動。單一真實來源：這裡點名誰，那邊就走誰。
    //   裁定基準取【好感最低】的那位——最生疏的人不肯，這趟集體外出就不成立(人越多越難成行，合理)。
    const _pvIdxs = [];
    pcData.forEach((r, i) => {
      if (i === pcIndex || String(r[COL.PC.FACTION]) !== "從者" || !sameGame(r) || String(r[COL.PC.ID]).startsWith("DEAD_")) return;
      if (String(r[COL.PC.LOC] || "").trim() !== String(curL || "").trim()) return;
      _pvIdxs.push(i);
    });
    if (_pvLocOk && _pvIdxs.length) {
      const _pvNames = _pvIdxs.map(i => String(pcData[i][COL.PC.NAME]));
      const _pvHer = _pvNames.join('、');
      const _pvBond = Math.min.apply(null, _pvIdxs.map(i => parseInt(pcData[i][COL.PC.BOND]) || 0));
      const _pvMulti = _pvNames.length > 1;
      _pendingProposal = { type: 'move', idx: _pvIdxs[0], names: _pvNames, name: _pvHer, loc: _pvLoc, accepted: kanshouProposalAccepts_('move', _pvBond) };
      kanshouPromiseStr += `\n★【提議·同去·GAS已裁定】你向『${_pvHer}』提議【現在一起去「${_pvLoc}」】。系統已依好感(${_pvMulti ? `最生疏的一位 ${_pvBond}` : _pvBond}/100)裁定${_pvMulti ? '她們全體' : '她'}${_pendingProposal.accepted ? `【答應】同行——請 narration ${_pvMulti ? '讓被點名的每一位都各依自己的個性給出答應的反應(可有人爽快、有人半推半就，但結論一致)' : '依她的個性演出答應的反應'}` : `【婉拒】了——請 narration ${_pvMulti ? '讓被點名的每一位都各依自己的個性給出婉拒的反應' : '依她的個性演出婉拒的反應'}`}。是否動身由系統處理；narration 停在${_pvMulti ? '她們' : '她'}給出回應的當下，【不可】演出發、走路或抵達。★成敗由系統定，別自行改寫${_pvMulti ? '她們' : '她'}的決定。`;
      finalUserMsg = `【玩家意圖】：邀身旁的『${_pvHer}』現在一起去「${_pvLoc}」。`;
    } else if (!_pvIdxs.length) {
      kanshouPromiseStr += kanshouMissStr_('move', _pvLoc);
      finalUserMsg = `【玩家意圖】：想邀同伴一起去「${_pvLoc}」，卻發現身邊沒有人。`;
    } else {
      // 🐛→✅ 同輪稽核：人明明在場、只是地點不合適時，舊版【兩個分支都不跑】——沒有★事實、沒有
      //   通知條，AI 只收到一句閒聊就自由發揮，玩家按下去像是完全沒反應。比照 promiseMeet 的
      //   「約不成」兩種原因分開講(她就在這裡 / 那裡去不成)，別讓玩家去找一個不存在的問題。
      const _pvHer0 = _pvIdxs.map(i => String(pcData[i][COL.PC.NAME])).join('、');
      kanshouPromiseStr += _pvSameSpot
        ? `\n★【邀不成·你們就在這裡】：你正想邀『${_pvHer0}』一起去「${_pvLoc}」，才發現你們此刻【就站在那裡】——演出你話說到一半自己笑出來、把這句改成別的即可，沒有人要去哪裡。`
        : `\n★【邀不成·地點去不成】：你想邀『${_pvHer0}』一起去「${_pvLoc}」，但那裡此刻去不了(那是私人房間、還沒熟到能登門、或那個時段根本不開放)——演出你話到嘴邊又換了個說法即可，這趟沒有成行，不必解釋機制。`;
      finalUserMsg = `【玩家意圖】：想邀『${_pvHer0}』一起去「${_pvLoc}」，卻發現那裡此刻去不成。`;
      kanshouProposalResult_ = { ok: false, type: 'move_loc', name: _pvHer0, loc: _pvLoc, sameSpot: _pvSameSpot };
    }
  }

  // 🏠 邀請同居(同伴卡「同居」鈕→cohabitInvite=name)：她在場＋好感≥門檻→蓋【同居】標記(行程骰
  //   改走同居版)；好感未達→依性格婉拒、不動任何數值；不在場→撲空。
  let kanshouCohabitStr = "";
  if (userData.cohabitInvite) {
    const _chName = String(userData.cohabitInvite).trim();
    // 🆔 2026-07「整體重構·id優先」：同上，id對得上優先鎖定，找不到才退回別名比對。
    const _chId = String(userData.cohabitInviteId || "").trim();
    const _chIdx = _chName ? findPcRowIdx_(pcData, _myGid_, { id: _chId, name: _chName, faction: "從者", loc: curL, excludeIdx: pcIndex, nameCandidates: kanshouNameCandidates_ }) : -1;
    if (_chIdx === -1) {
      kanshouCohabitStr = kanshouMissStr_('cohabit', _chName);
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
        pcData[_chIdx][COL.PC.MEMORY] = kanshouStampFirst_(pcData[_chIdx][COL.PC.MEMORY], '同居', curDay);
        dirtyPcRows.add(_chIdx);
        kanshouProposalResult_ = { ok: true, type: 'cohabit', name: _chRealName };
        kanshouCohabitStr = `\n★【同居開始】：『${_chRealName}』答應搬來與你同住了！從今以後她深夜會回這個家的「和室」就寢、清晨可能還賴在被窩、晚間常在家中活動，白天依然過她自己的生活——演出她答應這一刻依性格的反應(欣喜/彆扭/故作平靜皆可)，這是關係的一大步。`;
        finalUserMsg = `【玩家意圖】：鼓起勇氣邀『${_chRealName}』搬來一起住。`;
      }
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
      // 🆔 2026-07「整體重構·id優先」：同上，id對得上優先鎖定，找不到才退回別名比對。
      const _hhId = String(userData.handHoldId || "").trim();
      const _hhIdx = findPcRowIdx_(pcData, _myGid_, { id: _hhId, name: _hhArg, faction: "從者", loc: curL, excludeIdx: pcIndex, nameCandidates: kanshouNameCandidates_ });
      if (_hhIdx === -1) {
        kanshouHandHoldStr = kanshouMissStr_('hold', _hhArg);
        finalUserMsg = `【玩家意圖】：想牽『${_hhArg}』的手，卻發現她不在身邊。`;
        kanshouProposalResult_ = { ok: false, miss: true, type: 'hold', name: _hhArg, where: _whereIsHer(_hhArg) };
      } else {
        const _hhName = String(pcData[_hhIdx][COL.PC.NAME]);
        const _hhBond = parseInt(pcData[_hhIdx][COL.PC.BOND]) || 0;
        // 🐛→✅ 2026-07 逐按鍵稽核：牽手 tag 只存一個人，牽著A又去牽B時舊值被【默默覆蓋】——
        //   A 就站在旁邊，卻在下一回合起憑空變成沒牽手，AI 從沒被告知你鬆了她的手。
        //   只在【她答應】時才是真的換手(婉拒＝你的手收回來、原本那隻手沒放開)，故字串併在下面接受分支。
        const _hhPrevN = KANSHOU_HANDHOLD_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]);
        const _hhSwitch = (_hhPrevN && !kanshouNameCandidates_(_hhName).includes(_hhPrevN)) ? _hhPrevN : "";
        // 牽手tag存在玩家自己列(pcIndex)、值=她的名字；接受與否由AI判定，接受後才在post-AI區寫回。
        // herIdx：牽手 tag 寫在玩家列(idx)，但「第一次牽手」這筆帳要記在【她】那一列，故一併帶著
        //   她的列索引過去，post-AI 接受分支才不必再查一次人。
        _pendingProposal = { type: 'hold', idx: pcIndex, herIdx: _hhIdx, name: _hhName, accepted: kanshouProposalAccepts_('hold', _hhBond) };
        kanshouHandHoldStr = `\n★【提議·牽手·GAS已裁定】你伸手想牽起『${_hhName}』的手。系統已依好感(${_hhBond}/100)裁定她${_pendingProposal.accepted ? `【讓你牽了】——narration 必須真實演出【她的手交到你手中／你們牽起手】的那一刻(不可只碰衣角、拉衣袖之類含糊帶過——那不算牽手)，語氣依其個性（大方／害羞／彆扭皆可）；她接受後，之後你移動她會相伴同行(直到放手)${_hhSwitch ? `。★同時：你原本牽著的是『${_hhSwitch}』的手，這一牽等於當著她的面鬆開了她——narration 必須把這個鬆手先演出來(一個動作或一個眼神都好)、並讓『${_hhSwitch}』依她的個性有所反應，不可讓她的手憑空消失` : ''}` : '【收回了手】——narration 依其個性演出她收手／避開、沒牽成的反應，不必替玩家找補'}。★成敗由系統定，別自行改寫她的決定。`;
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
  // 🐛→✅ 八度改版稽核抓到：夜襲/賴床叫醒新觸發點「玩家自己房間」＋pSleepStr的睡眠提示，都只看
  //   LOC×時刻，沒排除「她是這回合跟玩家一起走進來的(牽手/同意同去)」——牽著手走進房間的人明顯
  //   還醒著、正跟玩家互動，不該被判定成已經熟睡。跟kanshouPreMoveCompanions_同一套「帶人三態」
  //   判準(那個變數宣告在後面、此刻用不到)，這裡先算一次同名邏輯的姓名集合供本節共用。
  const kanshouArrivingNames_ = !moveTarget ? []
    : userData.moveWithCompanion
      ? pcData.filter(r => r !== pc && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()).map(r => String(r[COL.PC.NAME]))
      : (kanshouHeldName_ ? [kanshouHeldName_] : []);
  // 🐛→✅ 玩家實測連兩次抓到：只認「這回合牽手/剛到」太短命——放開手的瞬間、或離開又走回來的
  //   下一回合，這兩個條件雙雙落空，她就會被誤判成剛好躺在自己家/和室裡熟睡，即使敘事明明還在
  //   演她清醒對話。改成用KANSHOU_AWAKE_HERE_TAG_記住「她在這個地點是醒著的」，只要地點沒變就
  //   持續生效(自我修復：這回合判定醒著就更新標記地點；地點對不上了就自動清掉，不必額外收尾)。
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
      kanshouInviteStr = kanshouMissStr_('invite', _ivName);
      finalUserMsg = `【玩家意圖】：想跟『${_ivName}』深交，卻發現緣分沒有接上。`;
    } else {
      const _ivCodexRow = getHeroCodexCached().slice(1).find(r => String(r[COL.HERO.ID]) === String(_ivHero.id));
      if (_ivCodexRow) {
        const _ivNewRow = heroToKanshouRow_(_ivCodexRow, myGameId, String(curL || "").trim(), curDay);
        // 🐛→✅ 稽核抓到：這裡原本【當場】appendRow，是 AI 呼叫前唯一的直接寫表。但 aiData._genFailed
        //   會早退、跳過後面所有寫回——結果是「她已經是同伴列，玩家列的路人例外標記卻沒清掉」的半套
        //   狀態(下一回合她同時是路人又是在場人物)。改成延後到寫回階段才落盤，讓結識跟這回合其餘
        //   異動一樣是【全有或全無】：AI 失敗＝整回合 no-op，什麼都沒發生。
        _pendingNewPcRow_ = _ivNewRow;
        pcData.push(_ivNewRow); // 本回合就地生效：partyRows/在場卡片馬上抓得到她
        pcData[pcIndex][COL.PC.MEMORY] = clearKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY]); // 她不再是「路人例外」，改走正式在場人物
        dirtyPcRows.add(pcIndex);
        kanshouInviteStr = `\n★【正式結識】：你與『${kanshouCasualOf_(_ivHero)}』交換了聯絡方式，這段萍水相逢的緣分正式接上了——從今以後她也是這座城裡你認識的人，會有自己的生活與去處。演出這一刻依她性格的反應(大方/靦腆/意外皆可)，關係才剛起步、保持剛認識的分寸。`;
        finalUserMsg = `【玩家意圖】：鼓起勇氣向『${kanshouCasualOf_(_ivHero)}』提出想繼續深交、交換聯絡方式。`;
      }
    }
  }

  // 🎭 情境氛圍(2026-07 玩家「橋段太過生硬」根治改版)：舊版是「跳按鈕→玩家點→GAS骰走向→AI照
  //   劇本演」的四段式 apparatus，選單感重、且同好感區間每次演出雷同(branches[].tag 是寫死的劇本)。
  //   現版本只做一件事：判斷此地此刻有沒有值得一提的情境，有就把【客觀事實】寫進提示詞，其餘全部
  //   交給玩家自己打字互動(鑑賞本來就有聊天框，玩家想怎麼玩都可以)。
  //   三層觸發判定(節慶 > 地點×時段 > 同居日常)保留——那部分邏輯是對的，只是輸出換掉了。
  //   🛏️ 睡眠層(夜襲/賴床叫醒)已整組移除：她睡著這件事本來就由 pSleepStr 每回合當既定事實餵給
  //   AI(判準完全相同)，再包一層按鈕只是把自然的處境變成一張要點的卡。
  const kanshouSceneLoc_ = moveTarget ? moveName : curL;
  // ⏱️ 用「本回合結束時」的時刻算時段——氛圍句是給讀到這次回應的玩家看的，用回合開始的舊時刻
  //   會慢半拍(玩家實測：10:5x走進客廳沒跳、原地再點(已11:2x午後)才跳)。
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
  // 🎊 節慶【已移出這條優先鏈】：改走下方獨立的 kanshouFestivalStr。理由有二——
  //   ①不限時段之後節慶優先序最高，會整天壓掉膝枕/共浴/下廚/同居所有地點 ambient；
  //   ②完成判定需要「移動後的地點＋移動後的在場名單」，那些要等 partyRows 算完才有。
  {
    const _locEv = KANSHOU_LOCATION_EVENTS_[kanshouSceneLoc_];
    if (_locEv && _locEv.bands.indexOf(kanshouReBand_) >= 0) kanshouSceneKey_ = _locEv.eventKey;
  }
  // 同居日常＝最低優先，只補前兩層沒佔到的時段空檔；對象限【同居中】的她(非同居者剛好也在家中
  //   時不該套上「一起生活」的情境)。
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
      kanshouSceneAmbientStr = `\n★【此地此刻·情境事實】：${_sceneNames.join('、')}——${_ev.ambient}。這只是眼下的客觀情境，【不是】既定劇情：要不要理會、想怎麼互動，全部由玩家自己決定。你只需讓這個情境自然存在於場景描寫裡，【不可】替玩家做決定、不可推著他行動、更不可自行把事情演完。`;
    }
  }

  // 深夜訪客入內：把訪客接來玩家現在的位置，本回合可指名互動，不推進日期——玩家想睡再自己
  //   重新點一次「結束一天」即可。唯一觸發來源是上方擲骰(不再有玩家按「開門」這條路)。
  let kanshouKnockGuestName = "";
  let kanshouKnockRaidStr = "";
  if (_knockGuestReq_) {
    const guestName = String(_knockGuestReq_).trim();
    const guestIdx = pcData.findIndex(r => kanshouNameCandidates_(r[COL.PC.NAME]).includes(guestName) && String(r[COL.PC.LOC] || "").trim() !== curL && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
    if (guestIdx !== -1) {
      pcData[guestIdx][COL.PC.LOC] = curL;
      // 🛏️ 她是剛敲門進來的，顯然醒著——若不標記，深夜(0~8點)在「我的房間」會被 pSleepStr
      //   判成熟睡，跟「她剛敲了門」直接矛盾。沿用既有 AWAKE_HERE 機制、不另立判斷。
      pcData[guestIdx][COL.PC.MEMORY] = KANSHOU_AWAKE_HERE_TAG_.set(pcData[guestIdx][COL.PC.MEMORY], curL);
      dirtyPcRows.add(guestIdx);
      kanshouKnockGuestName = String(pcData[guestIdx][COL.PC.NAME]);
      finalUserMsg = `【玩家意圖】：打開了門，是「${kanshouKnockGuestName}」深夜來訪。`;
      // 🌙 2026-07 玩家「能不能也設計一個被夜襲的橋段呢」——夜襲的鏡像版：不是玩家去找她，
      //   是她主動來敲玩家的門。好感夠高(沿用KANSHOU_KNOCK_MIN_BOND_=60，跟夜襲類「趕人/繼續」
      //   切點同一個數字)時，這次來訪有機會別有用心，共用同一套kanshouAsleepOutcomeStr_分寸判準，
      //   同樣走KANSHOU_SCENE_DAY_TAG_擋同一天重複加分——不是每次深夜來訪都這樣，才有驚喜感。
      const _kgBond = parseInt(pcData[guestIdx][COL.PC.BOND]) || 0;
      if (_kgBond >= KANSHOU_KNOCK_MIN_BOND_ && Math.random() < KANSHOU_KNOCK_RAID_CHANCE_) {
        kanshouKnockRaidStr = `\n★【深夜訪客·別有用心(她這次登門不只是單純想聊聊，帶著幾分主動靠近你的心思，沒有固定台詞，依她性格自由發揮)】：${kanshouAsleepOutcomeStr_(_kgBond)}。要不要挑明、怎麼發展，全由你依她性格拿捏。`;
        if (KANSHOU_SCENE_DAY_TAG_.get(pcData[guestIdx][COL.PC.MEMORY]) !== curDay) {
          pcData[guestIdx][COL.PC.BOND] = Math.min(100, _kgBond + KANSHOU_SCENE_BOND_);
          kanshouSyncRelTier_(pcData, guestIdx);
          kanshouKnockRaidStr += `（這樣一段特別的相處，讓你們的關係又近了一些——好感已由系統上調，敘事勿再另計。）`;
        }
        pcData[guestIdx][COL.PC.MEMORY] = KANSHOU_SCENE_DAY_TAG_.set(pcData[guestIdx][COL.PC.MEMORY], curDay);
      }
    }
  }

  // 結束一天：忽略玩家打的文字，改用系統組好的合成訊息——複用actionPlay整條既有敘事管線
  //   (在場驗證/NSFW規則/rel_changes/intimacy_feedback全部照常跑)，不另開一條平行路徑。
  //   不在身邊的英靈：GAS直接幫她們決定隔天去哪(kanshouRollDailyLocation_)，玩家不用手動指派。
  // 只有結束一天(真的要過夜)才判定好感≥80能否同行睡覺，推進時間不觸發(那不是「睡下去」的
  //   動作)。門檻由GAS算好，AI只負責依角色性格自然演繹要不要跨出這一步。
  // 🚪 送走夜訪客(前端「請她回去」)：必須排在 endDay【之前】——endDay 的 intimateNightNames 是
  //   「好感≥80 且此刻與玩家同地」，她剛被落盤到 curL、好感又通常夠高，晚一步送就會被留下過夜，
  //   「請她回去」等於毫無作用。姓名只從玩家列的 tag 讀，不吃 client 傳的名字(同 _knockGuestReq_)。
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
  // 🌙 昨夜道別(2026-07 玩家實測「好感沒80，牽手睡覺 NPC 會自己回家？我醒來都沒有自言自語？」)：
  //   endDay 會把未達 80 的同伴依行程骰散走，但整段提示詞【一個字都沒交代她】——AI 只看到玩家獨自
  //   回房，於是她就地人間蒸發，正好違反本檔自己的【在場驗證】「禁不解釋就消失」。跨時段那條路早有
  //   【自然告辭·作息】(kanshouNpcLeaveStr_)在做這件事，endDay 只是沒接上。照同一個慣例補：離場前
  //   最後一次讓她開口道別；牽著的手也要演出鬆開，不能默默斷線。
  // 🕰️ 敘事時鐘：預設等同狀態時鐘，只有「結束一天」會讓兩者分家(見下方 endDay 區塊的說明)。
  //   組 🕰️ 那行提示詞時一律讀這兩顆，不要再直接讀 curDay/curHour。
  let kanshouNarrDay_ = null, kanshouNarrHour_ = null;
  let kanshouNightPartStr = "";
  let kanshouClockMoved_ = false; // 結束一天/時段跳躍已自行設時鐘→標記，避免下方每回合流動又加一次
  // 🌙 兩段式就寢·第一段：按下「睡覺」時若身邊有羈絆已深(≥80)的人、且還沒進過深夜段落 →
  //   【不結束這一天】，改成把時間推到就寢時刻、進入「夜未眠」。玩家可以無限回合推進這一夜，
  //   滿意了再按一次(此時 kanshouNightSceneOn_ 已成立，直接落到下面真正的 endDay)。
  //   ★兩條路共用這個入口：20% 擲中夜襲後按「讓她留下」送的也是 endDay:true，自然也走進來，
  //   不必為夜襲另寫一條平行路徑(玩家定案「兩條路一致」——否則變成被夜襲才有完整夜戲、
  //   自己的戀人反而沒有)。
  //   ⚠ 門檻用 KANSHOU_KNOCK_MIN_BOND_(60·親近的人) 而不是同床的 80：夜襲的招募池本來就是 ≥60，
  //   寫 80 的話 70 好感的訪客敲門進來、玩家按「讓她留下」還是會一口氣跳到早上(實測抓到)。
  //   兩個數字必須同源。60~79 能演到哪仍由【親密尺度五階】把關，這裡只決定「要不要切這一段」。
  let kanshouNightSceneNames_ = [];
  if (userData.endDay === true && !kanshouNightSceneOn_) {
    kanshouNightSceneNames_ = pcData.filter((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者"
      && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_")
      && (parseInt(r[COL.PC.BOND]) || 0) >= KANSHOU_KNOCK_MIN_BOND_
      && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()).map(r => String(r[COL.PC.NAME]).trim());
    if (kanshouNightSceneNames_.length) {
      userData.endDay = false;                       // 這一按不結束一天
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_SCENE_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], curDay);
      // 時間推到就寢時刻(判準與 endDay 的敘事時鐘同一條，不另立規則)。這裡動的是【狀態】時鐘，
      //   因為這一夜要真的在這個時刻往下走，之後每回合照常流動 10 分鐘。
      if (timeBand_(curHour) !== '夜' && timeBand_(curHour) !== '深夜') curHour = KANSHOU_DAY_LAST_HOUR_;
      kanshouClockMoved_ = true;
      pcData[pcIndex][COL.PC.HOUR] = curHour;
      finalUserMsg = `【玩家意圖】：夜深了，你和『${kanshouNightSceneNames_.join('、')}』留在這個房間裡，沒有要就此睡去的意思。`;
    }
  }
  if (userData.endDay === true) {
    // 🛏️ 結束一天＝睡到「即將到來的清晨6點」：凌晨(深夜0~5點)睡下→【同一天】的6點——跨日已在
    //   「夜→深夜(00:00)」那一步發生過了；晚上睡下才是隔天6點。修玩家實測「一晚被收兩天」
    //   (夜→深夜已+1天、結束一天又+1天)。
    const _nightDay = curDay; // 同床發生在「睡下去」的那一天(遞增前)——【初次】記帳要記那天，不是醒來那天
    // 🕰️→✅ 2026-07 玩家「那我按睡到天亮會有甚麼事情.....」：狀態必須推進到隔天 6:00(眾人重骰行程
    //   /日閘門全部依賴它)，但【這一回合要演的是睡下去的那個當下】。舊版直接用推進後的時鐘組提示詞，
    //   於是同一份提示詞同時說「現在06:00清晨，★此刻＝清晨·唯一真實，光線作息一律依此刻重寫」
    //   跟「夜幕降臨、回到房間安頓下來、今晚可自然發展到同床」，還限定敘事跨度十分鐘——三者互斥，
    //   而且「唯一真實」那句明文叫 AI 覆寫掉夜晚的框架，結果就是演出一段不知所云的清晨空景。
    //   分成兩個時鐘：狀態時鐘照推，敘事時鐘停在睡下去那一刻，晨間留給下一回合(【晨間餘韻】本來
    //   就是那樣設計的)。只在 endDay 這條路有差，其餘回合兩者相同。
    // 🌙 夜未眠的出口①：這次是真的睡了，清掉狀態(不清的話隔天同一個 absDay 值也不成立，
    //   但清掉才不會在存檔裡留下誤導人的殘值)。
    pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_SCENE_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], 0);
    kanshouNarrDay_ = curDay;
    // 敘事時刻＝「就寢的那一刻」，不是按下按鈕的那一刻。玩家可能在早上八點就按結束一天(語意是
    //   「今天剩下的就這樣過去，然後睡」)，此時照抄 08:10 會跟玩家意圖那句「夜幕降臨」再打一次架
    //   ——換成當日最後一小時。已經在夜/深夜按的就照用，那本來就是就寢時刻。
    kanshouNarrHour_ = (timeBand_(curHour) === '夜' || timeBand_(curHour) === '深夜') ? curHour : KANSHOU_DAY_LAST_HOUR_;
    if (curHour >= 6) curDay = curDay + 1;
    curHour = 6;
    kanshouClockMoved_ = true;
    pcData[pcIndex][COL.PC.DAY] = curDay;
    pcData[pcIndex][COL.PC.HOUR] = curHour;
    // 不分「同行/不同行」，所有已存在的英靈結束一天都依自己的生活重新決定要去哪——唯一例外
    //   是好感≥80且此刻確實跟玩家同地點的人，直接留在玩家房間過夜(同床共枕)。
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
    // 🌙 誰在你身邊、卻不留下過夜——用回合開始時的同地快照(kanshouWithMeAtStart_)扣掉留宿名單，
    //   而不是重新掃 LOC：這一行以上 intimateNightNames 已算完但人還沒被骰走，只有那份快照能回答
    //   「她剛才確實在你旁邊」。牽著的那位另外點名，鬆手要演出來。
    const _partNames = kanshouWithMeAtStart_.filter(n => intimateNightNames.indexOf(n) === -1);
    if (_partNames.length) {
      const _partHeld = kanshouHeldName_ && _partNames.some(n => kanshouNameCandidates_(n).includes(kanshouHeldName_));
      kanshouNightPartStr = `\n★【夜裡道別】：夜深了，你要歇下，而『${_partNames.join('、')}』今晚不留在這裡——本回合最後一次讓她(們)開口道別，依各自個性演出這一刻(依依不捨／匆匆丟下一句就走／嘴上說得輕鬆皆可)${_partHeld ? `；其中『${kanshouHeldName_}』的手還牽著，必須先演出鬆開的那一下再讓她走` : ''}。道別完她(們)就不在場了，之後任何回合一律禁止再讓她開口或被觸碰。`;
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_PART_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], _partNames.join('、'));
    }
    // 🤝 睡覺自然放手：牽手不跨夜(同床是同床、不是牽著手到天亮)，結束一天一律鬆開，
    //   避免隔天還掛著昨天的牽手標記。★必須排在上面的道別字串【之後】——那句要讀 kanshouHeldName_
    //   才知道該不該演鬆手，先清掉就永遠演不到。
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
      // 🐛→✅ 稽核抓到：【邂逅中】(巧遇路人，非正式在場人物)只在「結識/結束一天/移動離開」三處清除，
      //   跳時段/跳節慶/等待赴約的advanceHours都漏了——這條「跳到時段/節慶」分支明明就緊接著要對
      //   所有正式同伴重骰去向、還特地加了「換幕鐵律」提醒AI別讓已離場的人憑空留著，卻獨漏這個路人
      //   旗標，導致同一位從沒正式在場過的路人能在玩家連續跳時段/跳節慶(可長達數月)後依然被當成
      //   「還在這裡」重新提供邂逅——比同伴還誇張的憑空滯留。跳時段/節慶本就是「這次到訪已經結束」
      //   的性質，比照移動離開同一標準清除。
      pcData[pcIndex][COL.PC.MEMORY] = clearKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY]);
      // ⏩ 這是玩家【主動按鈕跳時段/節慶】的刻意時間快轉——跟「每回合被動+0.5h流動」(§122，那條根本
      //   不重骰任何人)不同：玩家選擇快轉數小時，不在身邊的人依新時刻重骰去向，讓世界動起來。
      // 🐛→✅ 玩家實測抓到：原本只有「牽手中」才排除，但正跟玩家同地點聊天、卻沒特地牽手的同伴，
      //   一按跳時段就憑空消失、對話對象平白蒸發，體感是bug而非「她去過自己的生活了」。改成只要
      //   此刻跟玩家同地點就一律不重骰(牽手只是同地點的其中一種情況，本就涵蓋在內)——真正「不在
      //   身邊」的人才依新時刻重骰，在場的人不會被時段跳躍憑空傳走。
      const allEstablishedForTime = pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
      allEstablishedForTime.forEach(r => {
        const idx = pcData.indexOf(r);
        if (String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()) return;
        // 今天有約→釘在約定地點守著；沒約→照常骰(同居者走同居版)。curDay已是推進後的日期。
        pcData[idx][COL.PC.LOC] = kanshouPromisePin_(r, curDay, curHour) || kanshouRollDailyLocation_(r[COL.PC.NAME], curHour, kanshouIsCohabit_(r), r[COL.PC.MEMORY]);
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
  // 供下方🕰️提示詞用，只算一次不重複呼叫。★讀敘事時鐘而非狀態時鐘——兩者只有 endDay 會不同。
  const _narrDay_ = (kanshouNarrDay_ === null) ? curDay : kanshouNarrDay_;
  const _narrHour_ = (kanshouNarrHour_ === null) ? curHour : kanshouNarrHour_;
  const curDateObj_ = kanshouAbsDayToDate_(_narrDay_);

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
  // 🐛→✅ 例外：玩家按下的是「同意」(接受了自己提議的同去、GAS裁定她答應，userData.moveWithCompanion)時，
  //   UI已經明確告訴玩家「好，一起去」，若不真的把受邀者也帶過去，她會被留在舊地點、卻在敘事
  //   跟人物列表裡憑空消失——這裡先在curL變動【前】記下當時同地點的人，帶她們一起走。
  //   ⚡ 帶人三態：①同意同去邀約(moveWithCompanion)→帶當時同地全部人；②否則有牽手對象且
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
      } else if (encounterOn && !curLocDef.noEncounter && !kanshouSomeoneAlreadyHere_ && userData.lookAround === true) {
        // 前端明確的「看看四周」按鈕(lookAround:true)。目前還沒有巧遇中的對象時，用目前地點
        //   重新擲一次巧遇——跟按移動按鈕同一套加權隨機，不寫LOC(沒有移動)。noEncounter地點
        //   (家)恆不觸發此路徑。
        // 🐛→✅ 稽核抓到：移動分支(2585行)有檢查!kanshouSomeoneAlreadyHere_(已有熟人在場就不擲
        //   陌生人巧遇)，這裡漏了同一條件，導致跟熟人對話中按「看看四周」仍可能擲出陌生人、
        //   兩者同框，牴觸移動分支自己訂的「熟人在場優先」規則。
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
    // 態度：NPC對御主當下的臨場態度(與好感分開追蹤，見慾海律令第5條)，讓AI下筆前看得到自己
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
      // 玩家本回合正對她提議(相約/牽手/同去·_pendingProposal)——她留下聽完回應：否則被動+10分恰跨時段時，
      //   AI 同回合收到「向她提議」＋「她已告辭」兩條矛盾指令，接受還會把牽手/同去落到已離場的人身上。
      //   ★ names(同去是群體提議·見上方 proposeMove)優先，否則退回單人 name/idx。
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
    if (_lvNames.length) kanshouNpcLeaveStr_ = `\n★【自然告辭·作息】：時段來到${timeBand_(curHour)}，『${_lvNames.join('、')}』到了該走的時間——本回合最後一次允許她(們)開口道別(若剛才有肢體接觸/牽制/擁抱，先演出中斷再道別)，之後她(們)就不在場了。★不在場的人，之後任何回合一律禁止捏造她開口、被觸碰、或仍在場，沒有例外。`;
  }

  // 📅 赴約/爽約結算 2.0(時間×地點驅動)：【必須在 partyRows 之前】——命中赴約會把她 pin 到 curL 讓她
  //   登場，這一步要先於在場名單計算，AI 才拿得到「她來了」的在場卡(否則純聊天/拍照這種不重骰位置的路徑，
  //   partyRows 會在她被拉來之前就定案、AI 完全不知道她到了)。準時窗[時刻-10,時刻+30]赴約+5(早到→「都早到」
  //   味道)／窗後~當天結束遲到+3／太早(她還沒到)回 kanshouPromiseWait_ 給前端「等到約定前10分」框／日期已過
  //   爽約-5。舊格式無時段(ah=null)沿用「當天到場即赴約」。同回合剛成立的約(day=明天)不會自我觸發。
  let kanshouPromiseMetStr = "";
  let kanshouPromiseWait_ = null; // {name,loc,apptLabel,targetHour}：太早到→前端等待框
  const kanshouApptTodoArr_ = []; // 今天有約但還沒赴的：{name,loc,at}，見下方結算迴圈
  // 📣 赴約/爽約結算回饋走【獨立通道】(promiseSettle)，不再借用 kanshouProposalResult_ 單槽——
  //   同回合「結算＋另一個提議被接受」時 post-AI 的提議結果會無條件覆寫單槽(稽核三路都撞到)，
  //   結算通知被吞、前端也漏掉重抓 _kcCur 的觸發。兩事件本就獨立，各走各的通知條。
  // 🐛→✅ 玩家實測前主動抓到：這裡本身也是單槽——若玩家同時跟兩位同伴各有一筆待結算的約(如A今天
  //   赴約成功、B的舊約同時判定爽約)，這個 forEach 跑兩輪，後跑的那筆會無條件覆寫前一筆，前一筆的
  //   通知條就這樣消失(底層BOND/MEMORY寫入不受影響，只有這條UI通知被吞)。改成陣列，兩筆都保留。
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
      // 📣 赴約成功發明確回饋——前端靠它跳綠條＋重抓同伴清單(_kcCur)，睡前爽約警示才不會
      //   拿過期資料誤報「今天還有沒赴的約」(稽核抓到的假警報)。
      kanshouPromiseSettle_.push({ ok: true, type: 'promise_met', name: _her, loc: _pr.loc });
    };
    // 🐛→✅ 稽核抓到：「遲到」分支(見下方)原本沒有上限——KANSHOU_APPT_BANDS_註解明講設計是
    //   「準時窗後~2h算遲到、之後爽約」，但程式碼只要當天結束前(23點)人到場一律判遲到+3，
    //   放鴿子懲罰在同一天內形同虛設。抽出跟跨日爽約共用的closure，遲到超過2小時比照跨日
    //   同一套判定(-5好感/寫進memoir/獨立結算通知)，不重複兩份邏輯。
    const _standUp = () => {
      // 🧠→✅ 人類邏輯稽核抓到：「她整晚睡在你旁邊，系統卻記下我讓她空等了一場」。
      //   情境＝約定日你沒去約定地點，卻一整天跟她在一起(牽手/同去/同床)，結束一天後日期一過
      //   就判爽約 -5、還把「我爽約了」寫進共同回憶。放鴿子的定義是【她等不到你】，人明明就在
      //   你身邊時這個定義不成立。此時只默默取消約定、不扣好感、不寫回憶，並給 AI 一句中性事實
      //   讓她可以自然提一句「那個約就算了吧」。⚠ 不給 +5：約沒真的赴，不該有赴約的獎勵。
      // 判準＝「此刻仍同地」或「這回合一開始就跟你在一起」。後者不可省：結算跑在 endDay 遣散
      //   【之後】，好感<80 的人那時早已被送回自己家，只看當下位置會把「牽手陪了你一整天」
      //   誤判成放鴿子(玩家追問「一整天都陪他，但是系統判定失敗?」抓到的第二半)。
      // 🙋 她單方面開口的邀約(byHer)：玩家從沒答應過，沒去當然不算放鴿子——只默默取消，不扣分、
      //   不寫「我爽約了」的共同回憶。跟下面「人就在你身邊」是同一種豁免，共用同一個出口。
      if (_pr.byHer
        || String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim()
        || kanshouWithMeAtStart_.indexOf(String(r[COL.PC.NAME]).trim()) !== -1) {
        pcData[i][COL.PC.MEMORY] = kanshouClearPromise_(pcData[i][COL.PC.MEMORY]);
        dirtyPcRows.add(i);
        // 🐛→✅ 2026-07 提示詞矛盾掃描抓到：這句原本【當場就寫死】，但豁免條件之一是「這回合一開始
        //   跟你在一起」——按下結束一天時，遣散跑在結算【之前】，她很可能在組提示詞時早就被送回家了；
        //   另一個條件 byHer(她單方面約的)更是完全不看她在不在場。結果就是叫 AI 跟一個不在場的人
        //   相視一笑，跟【在場驗證鐵律】直接打架。跟【晨間餘韻】同一套解法：先記名字，等 partyMembers
        //   算出來之後再依「此刻真的在場」過濾成句；沒人在場就整句不送(這條本來就是零數值變動的
        //   純演出提示，沒人可演時安靜才是對的)。
        kanshouApptWaivedArr_.push({ name: _her, loc: _pr.loc });
        return;
      }
      pcData[i][COL.PC.MEMORY] = kanshouClearPromise_(pcData[i][COL.PC.MEMORY]);
      pcData[i][COL.PC.BOND] = Math.max(0, (parseInt(r[COL.PC.BOND]) || 0) - 5);
      pcData[i][COL.PC.MEMORY] = KANSHOU_CHILL_DAY_TAG_.set(pcData[i][COL.PC.MEMORY], curDay); // 🧊 放她鴿子＝明確的不愉快
      kanshouSyncRelTier_(pcData, i);
      dirtyPcRows.add(i);
      // ⚠ 走到這裡＝她【不在】你身邊(在場的已在上面提早 return)。敘述留給下次遇到她時演——
      //   這回合她不在場，照【在場驗證鐵律】本來就不能讓她開口。
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
    };
    if (_pr.day === curDay) {
      // 🚶‍♀️→✅ 2026-07 玩家「沒有根絕方式嗎…感覺可以讓她時間快到的時候出現在約會地點」：
      //   根因是「同地點的人永遠不會被重骰」，所以她可以被牽著走一整天、直接錯過自己的約。
      //   改成【她自己會走】：進入該動身的窗口、她此刻跟你在一起、而你不在約定地點時，她先走一步。
      //   比「讓她消失」更貼近人的行為，也給玩家明確信號(而不是人憑空不見)；此後沒赴約就是
      //   真的讓她一個人在那裡等——爽約回歸它原本的意思。
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
        kanshouPromiseMetStr += `\n★【她先過去了】：快到你們約好的${kanshouFmtHM_(_ah)}了，『${_her}』看了眼時間，說了聲要先過去「${_pr.loc}」等你，就從這裡動身離開了——演出她起身道別的那一刻(期待/彆扭/催你別遲到皆可)。她【已經不在這裡】，這段之後不可再讓她開口或在場。`;
        return; // 她已離場，本回合不再結算
      }
      if (!_atApptLoc) {
        // 📌 今天有約、你還沒到那裡——記一筆待辦。2026-07 玩家實測抓到：這條路徑本來是純 return，
        //   於是「昨天約好的事」在赴約日整天【零提示】——她通常不在你身邊(她的卡片才有 pPromiseStr)、
        //   前端 people 只帶 {id,name}、promiseWait 又只在你【已經站到約定地點】時才回傳，等於
        //   「你已經記得了才提醒你」。玩家忘記→吃 -5 爽約，卻從頭到尾沒被告知過。
        //   跟節慶待辦同一種設計：GAS 自己看得到的客觀事實，不開按鈕、不問 AI。
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
        _settle(3, `\n★【遲到赴約】：你與『${_her}』約在${kanshouFmtHM_(_ah)}，卻拖到${kanshouFmtHM_(curHour)}才到「${_pr.loc}」——她等了你好一會，依個性流露嗔怪/委屈/嘴硬說沒關係(好感仍上調但你遲到了，勿另計)。`);
      } else { // 遲到超過2小時：視為當天已經放鴿子，比照爽約結算
        _standUp();
      }
    } else if (_pr.day < curDay) { // 過了約定日還沒赴約=爽約
      _standUp();
    }
  });

  // ⚠ 位置關鍵：這一段【必須排在 partyRows 之前】。「她自己找來了」會把她的 LOC 搬到你這裡，
  //   而 partyRows(在場名單／人物卡)是照 LOC 篩出來的——排在後面的話，AI 會同時收到「她剛剛
  //   出現在這裡」跟「只有【在場人物】可以開口」，而她沒有卡片，兩條指令直接打架(2026-07 提示詞
  //   矛盾掃描實測到)。三種事件需要的「誰此刻在你面前」是自己從 pcData 的 LOC 算的(_hereRows)，
  //   不依賴 partyRows 這個變數，所以往前搬是安全的。
  // 🙋 她主動：擲骰→直接落地成既成事實→下面組提示詞。全域每日一次、無泡泡、不看玩家打了什麼。
  //   排在 partyRows 之後：三種事件都要知道「誰此刻在你面前」。
  let kanshouInitStr = "";
  // 🙋 這一刻自己走來的人名（供【在場來由】用，比照深夜訪客 kanshouKnockGuestName）——
  //   沒有這一欄的話她會被算成「你們從剛才就一直在這裡」，跟★【她自己找來了】互相打架。
  let kanshouInitVisitName_ = "";
  (function () {
    // 只在「玩家自己推進的普通回合」擲：時間跳躍/結束一天/深夜段落各有自己的節奏，硬插會打架。
    if (kanshouTimeJumped_ || kanshouNightSceneOn_ || kanshouNightGuest_ || kanshouEncounterHero) return;
    if (KANSHOU_INITIATIVE_DAY_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]) === curDay) return;
    const _all = pcData.filter((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者"
      && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_"));
    if (!_all.length) return;
    // 📉 節流：機率除以「手上未赴的約數」(玩家「有約的話機率再下降一點」)。0個=全速、1個=半速…
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
    // 📐 三型等權(2026-07 實跑調校)：初版給 want 加倍權重，結果邀約變成 20 天才一次——因為
    //   邀約本來就還要再過「她自己名下沒有未赴的約」這道閘，兩層壓抑疊起來太稀有。等權之後
    //   約每 9 天一次她會開口約你，而「已有約就降速」那道節流仍在，不會約滿場。
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
      kanshouInitStr = `\n★【她自己找來了】：『${String(_r[COL.PC.NAME])}』剛剛出現在「${curL}」——不是你叫她來的，是她自己想見你才過來的。這件事【已經發生】，由她依自己的個性演出她是怎麼出現、怎麼開的口(若無其事／找個藉口／直說皆可)。`;
    } else if (_kind === 'invite') {
      const _r = _pick(_invitePool), _i = pcData.indexOf(_r);
      const _band = _pick(KANSHOU_APPT_BANDS_);
      // 地點條件與玩家自己相約時完全同一套(見 _pmLocOk)：不能是私室、不能是現在站的地方、
      //   別人家要先解鎖、有時段限制的要對得上——同一份規則不重寫第二遍。
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
      // 📣 這是【真的寫進她那一列的約定】(地圖📅徽章、睡前爽約警示都讀它)，但舊版一個訊號都沒回傳，
      //   前端的約定快取 _kcCur 只在「玩家自己約成」或「結算」時才刷新——於是她開口約的這一場，
      //   玩家在地圖上完全看不到，也不會被睡前警示提醒。走既有 promiseSettle 通道補一筆。
      kanshouPromiseSettle_.push({ ok: true, type: 'promise_byher', name: String(_r[COL.PC.NAME]), loc: _loc.name,
        when: _today ? '今天' : '明天', bandLabel: _band.label });
      kanshouInitStr = `\n★【她開口約你】：『${String(_r[COL.PC.NAME])}』說了${_today ? '今天' : '明天'}${_band.label}在「${_loc.name}」等你——這句話【已經說出口】，由她依自己的個性演出她是怎麼提的(慎重／裝作隨口／彆扭地繞一圈才講皆可)。★這是她單方面的邀約，你答不答應都行，narration【不可】替玩家決定要去或不去。`;
    } else {
      const _r = _pick(_wantPool);
      _stamp();
      kanshouInitStr = `\n★【她此刻的心思】：『${String(_r[COL.PC.NAME])}』${_pick(KANSHOU_INIT_WANTS_)}——這是她心裡真的有的事，這一回合讓它自然浮出來一次(要不要說破、怎麼說，依她的個性決定)。★只是一個起頭，【不可】替玩家決定他怎麼回應。`;
    }
  })();

  // 「開放世界·背景人煙」設計：路人可自由描寫增添生活感，但不具名、不追蹤好感、不能被指名互動；
  //   真正能被指名、好感會被記錄的對象只有【在場人物】，判準是「LOC是否跟玩家目前位置一致」，
  //   不看IS_PARTY。
  // 同地點最多給KANSHOU_PARTY_DETAIL_CAP_位詳細卡片(敘事複雜度/prompt篇幅上限，不是隊伍容量)，
  //   依好感高低取前幾位；超過上限的人依然存在、依然可被特定劇情點名，只是這回合沒有詳細卡。
  const partyRows = pcData.filter(r => r !== pc && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim())
    .sort((a, b) => (parseInt(b[COL.PC.BOND]) || 0) - (parseInt(a[COL.PC.BOND]) || 0)).slice(0, KANSHOU_PARTY_DETAIL_CAP_);
  const partyMembers = partyRows.map(r => r[COL.PC.NAME]);
  // 🎊 節慶三態(2026-07 玩家「想要一個類似任務重點…沒去做的話 AI 可以很委婉地提醒，做過就完成
  //   不要再出現」)。刻意【不加按鈕、不問 AI】——完成與否是 GAS 自己看得到的事實：
  //     玩家人在 doneLoc 之一 ＋ 身邊有同伴 ＝ 這件習俗一起做過了。
  //   算在這裡而不是上面的 ambient 區：要用移動【後】的 curL 與 partyMembers，不然「這回合走進
  //   神社」不會算數。三態各給不同長度，完成後只剩一句短餘韻——這也是「不限時段」之後避免同一句
  //   整天每回合重印的解法。
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
      return `\n★【節慶·就是此刻】：今天是「${_f.name}」，而你和『${partyMembers.join('、')}』正好就在「${curL}」——${_fe.todo || '一起過這個節'}這件事，此刻就在發生。把這一幕好好寫出來(這是今天的重頭戲，值得多給一點筆墨)。`;
    }
    // ⚠ 委婉提醒要有【人】才成立：這條通道沒有名字前綴(不像 scene ambient 會冠 _sceneNames)，
    //   身邊沒人時說「可由她提一句」等於指派給一個不存在的人。獨自一人就只留客觀事實。
    const _fTodo = _fe.todo ? `這一天的老規矩是【${_fe.todo}】，而你還沒去成。` : '';
    const _fNudge = (_fe.todo && partyMembers.length)
      ? `若情境合適，可由『${partyMembers[0]}』【自然地】提一句(期待/試探/嘴上說無所謂都行)——只能點到為止，【不可】催促玩家、不可替他決定去不去、更不可自行演成已經去過了。`
      : '';
    return `\n★【節慶】：今天是「${_f.name}」——${_amb}。${_fTodo}${_fNudge}`;
  })();

  // 📌 今日待辦·約定(組在節慶之後、共用同一種「GAS 看得到的客觀事實」語氣)：只給時間地點對象，
  //   要不要提、由誰提、怎麼提全交 AI。她在場時她自己提得起來；不在場就是玩家自己心裡記著這件事。
  const kanshouApptTodoStr = kanshouApptTodoArr_.length
    ? `\n★【今天的約·尚未赴】：${kanshouApptTodoArr_.map(t => `${t.at ? t.at + '於' : ''}「${t.loc}」見『${t.name}』`).join('；')}——這是今天確實還沒完成的事，不是背景設定。${kanshouApptTodoArr_.some(t => partyMembers.indexOf(t.name) !== -1) ? `其中人就在你面前的那位，若情境合適可由她自然提起(確認/催一下/嘴上說不急都行)。` : `對方此刻不在你身邊，只能寫成你自己記著這件事，【不可】讓她開口或出現。`}`
    : "";

  // 📅 那個約就算了(豁免)：這裡才依「此刻真的在場」過濾——見 _standUp 內的說明。人不在場就整句不送。
  const kanshouApptWaivedStr = (() => {
    const _here = kanshouApptWaivedArr_.filter(t => partyMembers.indexOf(t.name) !== -1);
    if (!_here.length) return "";
    return `\n★【那個約就算了】：你與『${_here.map(t => t.name).join('、')}』本來約在「${_here.map(t => t.loc).join('、')}」見面、結果沒去成，但你們這段時間本來就一直在一起——不是放鴿子，沒有人空等。可自然帶過那個沒去成的約——語氣是相視一笑的默契，【不必】演成道歉或責備，也沒有任何數值變動。`;
  })();

  // 🌍 世界概況(輕量版·2026-07 玩家「NPC不知道彼此存在」)：只給名字＋大分區，不給精確地點/在幹嘛，
  //   純粹讓AI知道「這局還認識誰、大概在哪」以便自然閒聊提及——不是在場資料，不影響【在場驗證鐵律】
  //   (指名互動/追蹤好感仍只認同地點的partyRows)。依好感取前KANSHOU_WORLD_ROSTER_CAP_位，避免同伴
  //   一多每回合就無限膨脹。
  const kanshouWorldRosterStr = (() => {
    const _elsewhere = pcData.filter(r => r !== pc && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() !== String(curL || "").trim())
      .sort((a, b) => (parseInt(b[COL.PC.BOND]) || 0) - (parseInt(a[COL.PC.BOND]) || 0)).slice(0, KANSHOU_WORLD_ROSTER_CAP_);
    if (!_elsewhere.length) return "";
    // 🎯 觸發收緊(2026-07 玩家「條件式區塊的觸發條件收緊」)：這段【唯一用途】是讓 AI 能正確回答
    //   「認不認識某某」，但它原本每回合都送(只要有人不在場就成立＝幾乎永遠)，等於絕大多數回合
    //   都在燒 200+字 講一件玩家沒問的事。改成只在玩家這句話真的可能問到「不在場的人」時才送：
    //   ①句中出現名單上任一人的名字(含大小寫變體) ②句中有詢問人的關鍵詞。兩者皆無就整段省略。
    const _rosterAsk = /認識|聽過|見過|知道|在哪|去哪|哪裡|怎麼樣了|還好嗎/.test(userMsg)
      || _elsewhere.some(r => kanshouNameCandidates_(String(r[COL.PC.NAME] || "")).some(c => c && userMsg.indexOf(c) >= 0));
    if (!_rosterAsk) return "";
    const _list = _elsewhere.map(r => {
      const _loc = KANSHOU_LOCATIONS_.find(l => l.name === String(r[COL.PC.LOC] || "").trim());
      const _region = _loc && KANSHOU_REGIONS_.find(g => g.id === _loc.region);
      const _name = String(r[COL.PC.NAME] || "");
      // 🐛→✅ 玩家實測抓到「還是大小寫問題」：名單存的是固定寫法(如「SABER」全大寫)，玩家聊天
      //   打「saber」小寫，小模型照字面比對名單就會判定「沒出現在名單裡」而答不認識。比照
      //   kanshouNameCandidates_ 既有的大小寫寬容手法，把英文名的另外兩種大小寫變體直接列在
      //   名字後面，不靠AI自己做大小寫正規化推理。
      const _variants = /[A-Za-z]/.test(_name)
        ? [...new Set([_name.toUpperCase(), _name.charAt(0).toUpperCase() + _name.slice(1).toLowerCase(), _name.toLowerCase()])].filter(v => v !== _name)
        : [];
      const _caseNote = _variants.length ? `，${_variants.join('/')}也是同一人` : '';
      return `${_name}(${_region ? _region.name : "行蹤不明"}${_caseNote})`;
    }).join('、');
    // 🐛→✅ 玩家實測抓到：舊措辭只講「可以自然提一下」，語氣太弱、太像選擇性彩蛋——小模型被
    //   玩家直接問「你認不認識/聽過某某」時，仍然會答「沒聽過」，完全沒把這份名單當成真的認識過。
    //   改成明確規則：名單上的名字＝你確實認識、可以直接肯定回答；不在名單上才是真的沒聽過。
    return `\n★【世界概況·這些人你確實認識】：這局你已經認識這些人，此刻分處異地，大略所在：${_list}。玩家若直接問起「認不認識/聽過某某」，只要名字(不分大小寫，英文名任何大小寫寫法都算同一人)出現在這份名單裡，你就【確實認識、要肯定回答「是」】，可以自然帶一句她大概在哪／大概是怎樣的人；【不可】因為她此刻不在場就裝作沒聽過或反問「那是誰」——那樣不合理，你們是同一座城裡認識的人。名單外的名字才是你真的沒聽過、可以照實說不認識。★但認識歸認識，仍【不可】讓她憑空出現、開口、或被指名互動——這不影響在場驗證鐵律，只有此刻真的同地點的人才算在場，能做的只是口頭確認「認識」，人不會登場。`;
  })();
  // 📅 初見日戳＋相識紀念日：同地即相識——沒戳過的在場同伴當下蓋【初見日】(冪等，之後只讀不改)；
  //   已有戳的算相識天數，命中里程碑(7/30/100/365天)就收進紀念日提示(當天內重複對話會重複提及，
  //   跟節慶氛圍同一種「全天有效的氛圍線」設計，AI自然不會每句都講)。
  // 💞 獨處時光(2026-07「橋段太過生硬」改版·接手原橋段 +3 的破天花板職責)：舊版靠「走進特定房間
  //   ×點按鈕」拿 KANSHOU_SCENE_BOND_，泡泡拆掉後這條路也跟著沒了——但【破天花板】這個機制本身
  //   要留下(原始用意：好感天花板防的是「一天刷滿」，總得有一條真實相處才走得通的路)。
  //   改綁 GAS 完全可驗證、且天然一天一次的條件：**與她單獨在私密場合**(noEncounter 地點＝家中
  //   各處/她的住處/我的房間)＋好感已爬到聊天自己搆得到的最高點＋當日尚未給過(沿用
  //   KANSHOU_SCENE_DAY_TAG_ 同一個日閘門)。不需按鈕、不靠 AI 判斷。
  //   🐛→✅ 門檻改用 kanshouRelChatCeiling_(0)(＝39·聊天封頂那一格)，不再用 KANSHOU_VISIT_BOND_(40)：
  //   兩者原本共用 40 這個數字，但聊天封頂在【門檻-1】(kanshouRelChatCeiling_ 回傳 t-1)，於是
  //   39 的人聊天爬不動、獨處又差一點用不了、夜襲還要 60——39→40 這一步變成【只有約定赴約一條路】
  //   走得通(2026-07 玩家實測跑 30 回合純聊天原地不動)。舊註解宣稱「這道門檻不會卡住任何該通的路」
  //   正是漏算了 39→40 這道，而那恰好就是門檻自己站的位置。改成直接讀天花板本身，兩個數字從此
  //   不可能再各走各的；日後 KANSHOU_REL_TIER_ 的門檻怎麼調，這裡都自動對齊。
  //   🐛→✅ 2026-07 模擬實跑抓到刷分：日閘門假設「過一天要有成本」，但「跳時段」跨過午夜就換日，
  //   而跳時段【只重骰不在身邊的人】——跟她待在我的房間裡連按跳時段，她不會被骰走，於是一次點擊
  //   換 +3，40→100 只要 20 下(跟先前修掉的 promiseMeet +5 農場同一類)。加 !kanshouTimeJumped_ 擋掉。
  //   這個條件本身也比較貼近語意：獨處時光給的是「陪著她過了一段時間」，而時間一跳，此刻同地的人
  //   按本檔既有定義就不是「剛才一直跟你在一起」而是「時間流轉後恰好在這裡」(見 pPresenceStr)。
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
      kanshouAloneBondStr = `\n★【獨處時光】：此刻這個地方只有你和『${String(partyRows[0][COL.PC.NAME])}』兩個人——不必特別點破，讓這份「沒有別人」的私密感自然滲進她的語氣與距離感即可(好感已由系統上調，敘事勿再另計)。`;
    }
  }
  const kanshouAnnivLines_ = [];
  const kanshouTierCrossLines_ = [];   // 💗 這回合剛跨進新關係階的人
  const kanshouCohabitEndNames_ = []; // 🏠 這回合剛被解除同居的人
  const kanshouFirstsLines_ = [];      // 💞 在場者的「第一次」帳
  const kanshouFirstsAnnivLines_ = []; // 🎂 今天剛好是某個「第一次」的週年
  let kanshouFirstsStampedToday_ = false; // 本回合(或今天)剛發生一件「第一次」→ 值得讓 AI 知道
  // 🏠 同居邀請泡泡(2026-07 玩家「同居做成泡泡問一次、完全隱藏才是正解」)：綁在【跨進戀人】那一刻
  //   ——那正是「要不要住在一起」第一次成立的敘事時機，而且 KANSHOU_REL_RANK_TAG_ 只升不降，這個
  //   跨階天生只會發生一次，不必另外記「問過沒」。**跟八度改版拔掉的舊版泡泡差別就在這裡**：舊版
  //   是條件成立就每回合跳(玩家嫌煩)，這版是一生一次。
  let kanshouCohabitOffer_ = null;
  partyRows.forEach(r => {
    const _ri = pcData.indexOf(r);
    if (_ri < 0) return;
    // 💗 關係階質變偵測：只升不降、跨多階只報最高那一階。第一次見到她時靜靜記下當前階(不報)——
    //   剛認識的人不該演出「我們變成朋友了」，那不是質變、只是初始值。
    const _tierBond = parseInt(r[COL.PC.BOND]) || 0;
    const _tierNow = kanshouRelRank_(_tierBond);
    // 🏠 同居邀請·一生一次：好感首次達門檻(90)且尚未同住、也還沒問過 → 跳一次泡泡並蓋章。
    // 🐛→✅ 2026-07 玩家「如果玩家沒按泡泡而是打對話呢？」——舊版蓋的是布林「問過了」，玩家只要
    //   改用打字(或當回合根本沒注意到泡泡)，這個「一生一次」的邀請就【永遠消失】，功能靜靜蒸發。
    //   但完全不蓋章又會退回更早那個被嫌煩的版本(條件成立就每回合跳)。折衷＝改存 absDay：
    //   同一位、同一天最多問一次，今天沒理它明天再問，接受了就靠 !kanshouIsCohabit_ 自動停。
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
      // 🐛→✅ 2026-07 玩家「會讓玩家疑惑的都修正」：本來寫死 _tierNow > _tierWas，只演升階。
      //   於是好感掉下去(爽約/冒犯累積)時，親密尺度天花板【悄悄收緊】卻沒有任何敘事——玩家下一
      //   回合只會撞到「她突然不讓我碰了」，完全不知道發生什麼事。降階跟升階同樣是關係的質變，
      //   一樣要演一次。★這裡改成雙向是安全的：同居邀請的「一生一次」早就不靠這個 tag 了，
      //   它有自己的 KANSHOU_COHABIT_ASKED_TAG_(absDay)＋!kanshouIsCohabit_ 兩道獨立閘門(見上方)。
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
    // 💞 她的「第一次」帳(GAS 蓋的既定事實·日期換算成玩家看得到的西曆)。依日期排序、只取最早幾筆——
    //   這段每回合都會進提示詞，不設上限玩久了會持續膨脹；而最早的那幾筆本來就是最有份量的。
    const _fsts = kanshouGetFirsts_(r[COL.PC.MEMORY]).sort((a, b) => a.day - b.day);
    if (_fsts.length) {
      const _herN = String(r[COL.PC.NAME]);
      kanshouFirstsLines_.push(`與『${_herN}』：` + _fsts.slice(0, KANSHOU_FIRSTS_SHOW_).map(o => {
        const _fd = kanshouAbsDayToDate_(o.day);
        const _ago = Math.max(0, curDay - o.day);
        return `第一次${o.key}＝${_fd.month}月${_fd.day}日${_ago > 0 ? `(${_ago}天前)` : "(就是今天)"}`;
      }).join('、'));
      // 🎂 週年：曆法固定 365 天/年(kanshouAbsDayToDate_)，故「同月同日」必然是整年數之差。今天剛好
      //   撞上就單獨拉一句——這正是把「第一次」記成結構化事實最想拿到的回報：她能精準說出「一年前
      //   的今天…」，而不是含糊地感嘆往事。
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
  const kanshouAnnivStr = kanshouAnnivLines_.length ? `\n★【紀念日·非強制】：今天是${kanshouAnnivLines_.join('、')}的日子——若氣氛合適可自然帶出這份紀念的溫度(她記得、或你記得皆可)，不必強行慶祝或報幕。` : "";
  // 🌅 兩條「昨夜」線都必須依【這回合她到底在不在場】過濾(2026-07 玩家「如果我直接移動呢....」)：
  //   旗標在回合開頭就讀掉了，但那時還不知道玩家這回合要去哪。玩家一起床就走人，她留在房間，
  //   舊版照樣送出「昨夜與『凜』共度親密·可自然帶晨間曖昧」——叫 AI 跟一個不在場的人演晨間戲，
  //   正是本檔【在場驗證·最高優先】自己禁的事。鏡像問題在【昨夜她走了】：那句寫死「今早這個房間
  //   只有你自己」，玩家人在商店街就不成立，而且她若剛好被行程骰到同一個地點，說她不在場更是直接
  //   跟【在場人物】打架。過濾後為空就整條不送——那一刻本來就沒有這回事。
  const _morningHere_ = String(morningAfterNames || "").split('、').map(n => n.trim())
    .filter(n => n && partyMembers.indexOf(n) !== -1).join('、');
  const _partedAway_ = String(nightPartNames || "").split('、').map(n => n.trim())
    .filter(n => n && partyMembers.indexOf(n) === -1).join('、');
  // 🌙 深夜獨處(夜未眠)：只給「此刻是什麼場合」這個事實，怎麼發展全看玩家推進與她的個性。
  //   親密尺度照舊由【親密尺度五階】依各自好感把關，這裡不另開後門——能不能到底，看的還是好感。
  //   ★剛進入的那一回合與之後每一回合都送(這是持續狀態不是一次性旗標)，措辭一致、不報幕。
  const kanshouNightSceneStr = (kanshouNightSceneOn_ || kanshouNightSceneNames_.length)
    ? `\n★【夜已深·門關上了】：這個房間此刻只剩你和『${(kanshouNightSceneNames_.length ? kanshouNightSceneNames_ : partyMembers).join('、')}』，外頭安靜下來，今晚不會再有別人進來，時間也不急著走。★這一段【還沒有結束】：不要寫成睡著、天亮、或一夜就這樣過去了——這一夜什麼時候收，由玩家自己決定，系統會宣告；你只演此刻正在發生的這十分鐘，結尾一樣停在進行式、把下一步交還玩家。`
    : "";
  // 🏠 同居結束：只給事實，怎麼收由 AI 依她性格演——可以是她自己開口要搬、也可以是不告而別。
  const kanshouCohabitEndStr = kanshouCohabitEndNames_.length
    ? `\n★【她不再住在這裡了】：『${kanshouCohabitEndNames_.join('、')}』已不再與你同住——這是這段關係走到現在的結果，不是意外。若她此刻就在你面前，讓這件事在這回合被說開(她提出要搬／你察覺她東西收走了皆可)；★【不可】寫成系統宣告，也【不可】當作沒發生過。`
    : "";

  // 💗 關係質變：跨進新階的當下演一次。給的是「方向」不是台詞——具體怎麼表現交給 AI 依她性格拿捏。
  //   刻意不報幕(不出現數值/階級名詞)，只讓那份轉變自然發生在她的態度與距離感裡。
  const kanshouTierCrossStr = kanshouTierCrossLines_.length
    ? `\n★【關係質變·就在此刻】：${kanshouTierCrossLines_.join('；')}——就在這回合剛變動。依她自己的性格讓這份轉變真實發生一次(往回退的那些，演的是那份親近正在收回去：語氣、距離、能不能碰，都退回這一階該有的樣子)，★【不可】報幕式宣告階級或數字、不可寫成系統提示。`
    : "";
  // 💞 第一次帳：GAS 蓋的既定事實，供 AI 精確回想「我們第一次做某件事是哪天」而非自行編造。
  // 🎯 觸發收緊：這段是「查得到就好的參考資料」，原本只要她有任何一筆【初次】就每回合送(玩幾天
  //   後＝永遠在送)。改成只在真的用得到的三種回合才送：①今天是某個第一次的週年 ②本回合剛發生
  //   一件第一次 ③玩家這句話在回顧往事。其餘回合完全省略——AI 平時不需要知道這些日期。
  const _firstsNeeded = kanshouFirstsAnnivLines_.length > 0 || kanshouFirstsStampedToday_
    || /第一次|初次|當初|那時|那天|以前|記得|多久|以來|一開始|剛認識/.test(userMsg);
  const kanshouFirstsStr = (kanshouFirstsLines_.length && _firstsNeeded)
    ? `\n★【你們之間的「第一次」·既定事實】：${kanshouFirstsLines_.join('；')}。這些日期是【確定發生過的事實】，若話題自然聊到往事、或今天恰好是其中某個日子，可以據此準確回憶(她記得、或你記得皆可)；★【不可】自行編造清單以外的「第一次」，也【不必】每回合主動提起。`
    : "";
  // 🎂 週年當天才出現的加強句：這是把「第一次」記成結構化事實的主要回報，值得比一般回憶更被看見。
  const kanshouFirstsAnnivStr = kanshouFirstsAnnivLines_.length
    ? `\n★【週年·今天】：${kanshouFirstsAnnivLines_.join('；')}。若氣氛合適，讓「剛好是今天」這件事自然浮現一次——可以是她記得而你忘了、你記得而她驚訝、或兩人心照不宣，依她的性格決定怎麼處理這個日子(甚至可以是彆扭地假裝不記得)。不必大張旗鼓慶祝，也【不必】報幕式地宣告年份數字。`
    : "";
  // 🤝 牽手中·常駐氛圍：牽的對象此刻真的同地在場才提示(被時間推進骰走就不提)。這回合剛牽/放手
  //   的當下演出走 kanshouHandHoldStr，這條是「牽著手的後續回合」持續帶出親密感。
  const kanshouHoldingStr = (kanshouHeldName_ && partyMembers.some(n => kanshouNameCandidates_(String(n)).includes(kanshouHeldName_)) && !(userData.handHold))
    ? `\n★【牽手中·背景資訊·別過度著墨】：你和『${kanshouHeldName_}』正牽著手一起行動——她【此刻就在你身邊、和你同處一地】，是牽著你的手一起走過來/一起待在這裡的，【絕不是】在別處等你、也【不會】說「你怎麼跑進來了」「說好在○○等你」這種把你倆講成分處兩地的話。★這份牽手只是【低調的背景親密】，【不必每回合都描寫交握的手】——偶爾在情境合適時輕輕帶一筆即可，別讓每一段敘事都圍著「握著的手／指尖的溫度」打轉，重心放在當下真正在發生的互動與對話。`
    : "";

  // 📷 拍照(takePhoto)：手機拍照·2026-07 再修（玩家「拍照要改成手機、不用等」）——手機沒有底片
  //   這種東西，只驗相簿總容量；拍完立刻存進相簿、立刻能看，不再有「隔天沖洗」的等待。
  //   實際落地(寫相簿)在AI成功回應後(見下方)，AI失敗不浪費(反正手機也沒有底片可浪費)。
  //   拍攝對象：photoIntent(輸入框先打字再按快門·如「拍那隻橘貓」)有指定且沒點名同伴→風景/生活照
  //   (AI自由入鏡街貓/狗兒/光影)；沒指定→有同伴拍同伴、沒同伴拍風景。風景照人物欄記「風景」，
  //   相簿自動長出「風景」篩選分頁。
  let kanshouPhotoStr = "", kanshouPhotoPending_ = null, kanshouPhotoDenied_ = "";
  if (userData.takePhoto === true) {
    const _phIntent = String(userData.photoIntent || "").replace(/[<>&"'`｜【】]/g, "").slice(0, 60);
    // 🐛→✅ 稽核抓到：讀表失敗時原本靜默吞例外、_phCount留在初始值0，等於cap在讀表不穩時直接
    //   fail-open放行拍照——改成讀表失敗就視為「已滿」fail-closed拒絕，寧可誤擋一次拍照，也不讓
    //   相簿容量上限形同虛設。
    let _phCount = 0, _phCountErr = false;
    try { const _ar = kanshouAlbumSheet_().getDataRange().getValues(); for (let i = 1; i < _ar.length; i++) { if (String(_ar[i][0]) === myGameId) _phCount++; } } catch (e) { _phCountErr = true; }
    if (_phCountErr || _phCount >= KANSHOU_ALBUM_CAP_) {
      kanshouPhotoDenied_ = 'cap';
      kanshouPhotoStr = `\n★【相簿已滿】：玩家舉起手機，卻想起相簿已經放不下更多照片了——演出這份「回憶太滿」的感嘆即可。`;
      finalUserMsg = `【玩家意圖】：舉起手機，卻想起相簿已經滿了。`;
    } else {
      // 指定拍誰：intent點名了哪些在場同伴(可多位)——只拍被點名的那些人；沒點名到任何人才算風景。
      // 🏷️ 點名比對走候選橋：列是短名(SABER/櫻)，玩家打全名「拍阿爾托莉雅」也要命中，免得人像被誤判風景。
      const _phNamedMembers = _phIntent ? partyMembers.filter(n => kanshouNameCandidates_(String(n)).some(c => _phIntent.indexOf(c) >= 0)) : [];
      const _phScenery = !partyMembers.length || (_phIntent && !_phNamedMembers.length);
      // 🐛→✅ 玩家「色色時也不用隱晦」：拍到親密畫面時，photo_caption 也該照實寫、不必刻意淡化。
      const _phCaptionRule = `並【務必】在回應JSON中額外加一個欄位 "photo_caption"：以玩家第一人稱寫一句30~60字的照片小敘述(禁HTML與引號)，若拍到的是親密畫面也直接寫實描述，不用刻意隱晦帶過。`;
      if (_phScenery) {
        kanshouPhotoPending_ = { names: ['風景'], scenery: true };
        kanshouPhotoStr = `\n★【拍照·風景】：玩家舉起手機${_phIntent ? `，想拍的是「${_phIntent}」，` : "，"}拍下此刻「${String(curL || "")}」的一隅——鏡頭裡可以是街貓、狗兒、鳥雀、光影、不具名路人的背影等生活細節(依地點/時段/天氣自然想像${_phIntent ? "，以玩家想拍的東西為主角" : ""})；若有同伴在場，她們可以自然反應或亂入鏡頭邊角。${_phCaptionRule}`;
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
  // 📷 看照片(showPhoto=照片ID)：手機拍完立刻能看，把照片拿給在場的人看——拍到自己→害羞/得意，
  //   拍到別人→評論/暗暗吃味。
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
      const pOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👕 換裝：當前服裝穿著(換衣不換人；玩家UI設定或AI依appearance_extras更新)
      // 鑑賞無戰鬥，HP/STATUS 恆定不變(已被 physical_state 取代)，不重複注入。
      const pMemStr = relMemMemoryStr_(r[COL.PC.REL_MEM]);
      const pMoeStr = String(r[COL.PC.INTENT] || "").trim();
      // 口吻/招牌小動作(persona.speech/tic)：召喚時已存進 MEMORY 的【口吻】【小動作】標記，直接
      //   複用 getPersonaSpeech_/getPersonaTic_ 讀取，讓角色演出招牌語癖而非千篇一律。查無時
      //   speech 退回 dailySpeechByName_(日常安全版)，tic 沒有對應日常版就留空，不退回戰時原始值。
      const pSpeech = getPersonaSpeech_(r[COL.PC.MEMORY]) || dailySpeechByName_(pName, _partyHeroCodex);
      const pTic = getPersonaTic_(r[COL.PC.MEMORY]);
      // 🐛→✅ 同一句印兩次(2026-07 實跑提示詞抓到)：heroToKanshouRow_ 的【口吻】標記與 TRAIT 第3格
      //   [台詞自稱] 都取自 dailyLook 第3段，是同一份資料的兩個出口——三人同場就整整重印六遍。
      //   重複本身會被模型讀成「這句特別重要」，反而壓掉旁邊的行為傾向。同源時只留 formatTrait
      //   印的 [台詞自稱](下方【不替玩家腦補】的全域規則是用這個名字指涉它的，不能改名)，
      //   只有舊資料兩者真的不同(TRAIT 還留戰時值)才補印「口吻」把日常版蓋過去。
      const _traitSpeech = String(r[COL.PC.TRAIT] || "").split('、')[2] || "";
      const pFlavorStr = `${pSpeech && pSpeech.trim() !== _traitSpeech.trim() ? ` | 口吻:${pSpeech}` : ""}${pTic ? ` | 招牌小動作:${pTic}` : ""}`;
      // 純聊天好感卡在梯度上限這件事本身不會反映在數字上——GAS默默夾住漲幅，若不順便告訴AI，
      //   narration可能寫出「感情大幅推進」這種跟機制矛盾的橋段。只在卡住時才加這句提示。
      const pBond = parseInt(r[COL.PC.BOND]) || 0;
      const pChatCeiling = kanshouRelChatCeiling_(pBond);
      const pAtCeilingStr = (pChatCeiling < 100 && pBond >= pChatCeiling) ? "・單靠對話目前已到這個階段的上限，需要透過約定赴約、或一起經歷特別的橋段(夜襲/共浴/膝枕…)這類真實相處才能再加深，這回合維持細水長流的相處基調，不要寫成關係大幅推進" : "";
      // REL_TAG的梯度字面本身沒告訴AI「該演出什麼熟悉程度」，AI容易預設熱絡口吻跟數字矛盾。
      //   只在低梯度(尚不熟識)才加一句態度提示，中高梯度不需要、也不該畫蛇添足限制發揮。
      const pRelTagStr = r[COL.PC.REL_TAG] || "點頭之交";
      // 🧊 趨勢(不是 level)：這幾天有沒有讓她不高興過。只給事實，怎麼表現交給她的個性——
      //   同樣一件事，傲然的人是話變少、溫順的人是笑容淡一點，不寫成統一的「冷淡」模板。
      const _chillDay = KANSHOU_CHILL_DAY_TAG_.get(r[COL.PC.MEMORY]);
      const pChillStr = (_chillDay && curDay - _chillDay >= 0 && curDay - _chillDay <= KANSHOU_CHILL_DAYS_)
        ? `・${curDay === _chillDay ? '就在今天' : '昨天'}你們之間有過一次不愉快，她還沒完全放下——這份芥蒂要真實反映在她此刻的語氣與距離感裡(依她的個性決定是話變少、刻意找碴、還是笑得比平常淡)，但別演成翻臉決裂`
        : "";
      const pTierToneStr = (pRelTagStr === "點頭之交") ? "，彼此才剛認識不久，口吻應保持禮貌卻略帶生疏保留，不該表現得像已相識多年的熟人或表現得過分熱絡親密"
        : (pRelTagStr === "普通朋友") ? "，交情仍屬普通朋友，可自然閒聊但仍保留一定分寸與距離感，不宜過度親密"
        : "";
      // 地點的「當下在做什麼」輕量引子(見上方KANSHOU_LOCATION_ACTIVITY_)，沒對照到的地點
      //   不加這句，AI自然發揮即可。⚠ 只給「原本就在這裡」的人——這回合剛跟玩家一起移動過來的
      //   同伴(kanshouPreMoveCompanions_)不套，否則被你帶來咖啡廳的人會被誤標成「正在打工」。
      // 🐛→✅ 玩家實測抓到「明明在聊天、有人突然穿上圍裙開始打工」：_pCameWithMe 只在【剛好是移動
      //   那一回合】才有效(kanshouPreMoveCompanions_是當回合暫存名單、非持久狀態)——同一地點純聊天
      //   的後續回合，這個排除形同失效，deterministic算出「打工」就會套到明明是跟你一起來聊天的
      //   同伴身上，跟劇情前面已經講的「她陪你逛」直接矛盾。改成只在【剛抵達那一回合】(moveTarget
      //   為真)才附上這句——交代一次「她為什麼在這」就夠了，之後對話歷史本身會記得，不必每回合
      //   重複斷言、也就不會演出「聊到一半忽然換上圍裙開始上班」這種自相矛盾的轉場。
      const _pCameWithMe = kanshouPreMoveCompanions_.some(cr => String(cr[COL.PC.NAME]).trim() === String(pName).trim());
      const pActivityStr = (() => {
        if (!moveTarget) return "";
        const _a = !_pCameWithMe ? kanshouLocActivity_(curL, pName, curDay) : "";
        return _a ? ` | 現況:${_a}(她本來就是這個狀態，不是這回合才開始，別演出「換上/開始」這類起始動作)` : "";
      })();
      // 🌙 2026-07 玩家「深夜或清晨去她房間找她，有提示AI要讓她們是睡眠狀態嗎?」——查證後確實沒有：
      //   kanshouRoomEventStr(她的反應走向)只在玩家按下夜襲/賴床叫醒同意鈕【之後】才會注入，剛推門
      //   進去、按鈕還沒點的這一回合完全沒有任何提示，AI只能自己從時段猜，容易演成她還醒著閒聊，
      //   跟「深夜找她＝多半在睡」的直覺矛盾。同一位本回合若已進了room-event accept流程(kanshouRoomEventStr
      //   已描述她的反應)就不重複補這句，避免兩條指令互相打架。
      const pSleepStr = (() => {
        // 🐛→✅ 八度改版：牽手/剛同意同去而跟玩家一起走進來的同伴顯然還醒著，不該說她在熟睡。
        if (kanshouIsAwakeWithMe_(pcData.indexOf(r))) return "";
        const _pHomeHeroId = kanshouHeroIdByName_(pName);
        const _pHome = kanshouGetHeroHome_(_pHomeHeroId, r[COL.PC.MEMORY]);
        // 🐛→✅ 八度改版：跟夜襲/賴床叫醒觸發判準對齊——0~8點(非timeBand_的深夜/清晨切法，清晨band
        //   原本延伸到11點)、地點涵蓋她自己家/和室/玩家自己房間(留宿或深夜訪客過來時可能在這裡)。
        const _pAtHome = (_pHome !== '自己的住處' && curL === _pHome) || (kanshouIsCohabit_(r) && curL === KANSHOU_COHABIT_ROOM_) || curL === '我的房間';
        if (!_pAtHome) return "";
        if (curHour < KANSHOU_NIGHT_RAID_HOUR_END_) return "多半已熟睡，睡著/半夢半醒";
        if (curHour < KANSHOU_ASLEEP_HOUR_END_) return "多半還在賴床、意識朦朧，剛睡醒或仍賴床";
        return "";
      })();
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
      // 🌀「催眠暗示」類(ignoreBond)道具啟動中(有強度且非關閉)：額外補一句明講不受好感天花板限制，
      //   跟一般道具(跳蛋等)的既定事實敘述分開講——這種道具的意義就是繞過[性格]×[好感]常規把關，
      //   要讓AI清楚知道這是刻意的例外，不是敘事出錯。
      // 🌀 2026-07 玩家「輕中重強度AI會知道怎麼表現嗎?」：不要對三階都套同一句「更強烈」，小模型
      //   對純粹形容詞疊加的區分度很弱(跟篇幅指示同一個教訓)。三階必須各給具體不同的行為指令。
      // 🌀 2026-07 三階重新推導（玩家定案，別回頭改成「越強越恍惚」）：舊版把三條軸綁在同一根拉桿上
      //   一起拉，於是最高階＝三軸全滿＝「判若兩人」，同時犯了兩個錯——① 人設被關掉(紅線②的反面)
      //   ② 她沒反應就沒有互動性，最高階反而最無聊。改成三階是【作用點不同】而非強度不同：
      //     · 軸1 意識(她知不知道自己不對勁)：永遠保持清醒，不隨階數下降。
      //     · 軸2 行為(她能不能拒絕)：只有這條隨階數上升。
      //     · 軸3 常識(這件事在她眼裡算不算異常)：最高階動的是這條，不是人格。
      //   → 微弱＝軸2 動一點點(持續的傾向，不是可數事件；她基本沒感覺)
      //   → 中等＝軸2 拉滿＋軸1 清醒＝「明知被操縱卻無法反抗」(核心爽點)
      //   → 強勁＝常識改寫：個性/態度/敵意原封不動，只拔掉「這很奇怪」的判斷，旁人仍照常人反應。
      //   ⚠ p.name 是玩家自己打的暗示句(什麼都有可能)，措辭必須通用，不可假設是命令句。
      const _ignoreBondLines = pPropsArr.filter(p => p.ignoreBond && p.level && p.level !== '關閉').map(p => {
        // 🤫「悄悄解除」：暗示已經沒效了，但她不知道——她的順從此刻已經是她自己的，只是她仍以為不是。
        //   這一階刻意仍然繞過好感天花板：機制上「解除」等於她相信自己被解除了，而她並不相信。
        if (p.level === KANSHOU_HYPNO_RELEASED_) return `★【${p.name}·已失效·她不知情】：不受好感天花板限制。這句暗示其實早就沒有作用了，她卻完全沒有察覺——她此刻的順從已經是她自己的意思，只是她還以為不是。她不會感覺到任何變化；若你當面戳破，她就再也拿不出『那是被弄的、不是我』這個藉口。`;
        if (p.level === '微弱') return `★【${p.name}·輕度生效】：不受好感天花板限制。她照常做自己，只是身體比平常慢半拍地不配合她的意思——順著這句暗示的方向，抗拒都會鬆一點、動作都會多做一點。她不覺得有異，頂多覺得今天怪怪的。`;
        if (p.level === '中等') return `★【${p.name}·中度生效】：不受好感天花板限制。她清楚知道自己不對勁、也知道是你搞的，嘴上照樣質問、抗拒、罵你，但每一次身體還是照這句暗示做了——意志完整、就是擋不住，這個落差要演出來。`;
        return `★【${p.name}·常識改寫】：不受好感天花板限制。她的個性、態度、對你的敵意全部原封不動，只有『這件事很奇怪』這個判斷被拿掉了——她會一臉理所當然地照這句暗示生活，你若追問她還會理直氣壯反駁你。旁人仍照常人反應。`;
      });
      // 🐛→✅ 2026-07 玩家「小道具+催眠一起整體檢查」抓到：催眠指令原本跟實體道具混在同一份
      //   「佩戴道具:…——這是既定事實，narration須自然反映其存在」清單裡，於是一句暗示被當成
      //   穿戴在身上的東西——身上明明沒有任何實體道具時也照樣輸出「佩戴道具:妳現在很想靠近我(強勁)」，
      //   AI 很容易寫成她身上戴著寫有那句話的物件；關閉時更荒謬，整段只剩「（強度關閉≠取下，仍配戴
      //   在身上、只是暫時沒運作）」在講一句已經解除的暗示。催眠不是物體，它的全部存在感就是下面
      //   那幾行★指令。兩份清單就此分家：實體道具只列 !ignoreBond，催眠只走★行。
      const _wornArr = pPropsArr.filter(p => !p.ignoreBond);
      const _wornStr = _wornArr.length ? `佩戴道具:${_wornArr.map(p => {
        const bits = [];
        if (p.part) bits.push(`戴在${p.part}`);
        if (p.hasIntensity) bits.push(p.level);
        // 🌟 2026-07 移除內建跳蛋、全面改自訂道具後新增：純靠道具名稱字面容易讓AI猜不到效果
        //   (玩家自己取的名字比「跳蛋」模糊得多)，effect選填時把效果描述也餵進去，讓AI照著演。
        if (p.effect) bits.push(`效果:${p.effect}`);
        return `${p.name}${bits.length ? `(${bits.join('，')})` : ""}`;
      }).join('、')}——這是既定事實，narration須自然反映其存在${_wornArr.some(p => p.hasIntensity && p.level !== '關閉') ? `，其中正在運作的道具依強度影響她的反應` : ``}${_wornArr.some(p => p.hasIntensity && p.level === '關閉') ? `（強度關閉≠取下，仍配戴在身上、只是暫時沒運作）` : ``}` : "";
      const _hypStr = _ignoreBondLines.length ? `${_ignoreBondLines.join('')}★這是只有她自己感覺得到的私密效果，除非外顯到旁人一看就懂，否則在場其他人不知情、不該對此有反應或評論。★暗示內容裡若出現「你/妳」「我」等代詞，你/妳＝她本人、我＝玩家，依此代入解讀，不要弄反。` : ``;
      const pPropStr = (_wornStr || _hypStr) ? ` | ${_wornStr}${_wornStr && _hypStr ? '。' : ''}${_hypStr}` : "";
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
      // 🚪 在場來由(四態)：AI 每回合最容易演錯、也最容易出戲的一件事就是「她是怎麼出現在這裡的」——
      //   舊版 partyDetailsArr 完全沒有這一欄，AI 只能每回合重猜，於是會對著你牽手帶進來的人說
      //   「你怎麼跑進來了」，或每回合重新演一次入場。四種來由全部由【本回合實際發生的轉場】算出，
      //   不需要任何新的持久狀態：移動是 moveTarget、跟你來的是 kanshouPreMoveCompanions_、時間跳躍
      //   會重骰全世界行程(故不預設連續性)、其餘皆為延續上一回合。
      const pPresenceStr = (() => {
        // 🚪 深夜訪客最優先：她是這一刻才敲門進來的。舊版靠另一個★區塊(kanshouKnockGuestStr)講，
        //   跟這一欄的「你們從剛才就一直在這裡」直接打架——同一件事只能有一個出處。
        if (kanshouKnockGuestName && String(pName).trim() === String(kanshouKnockGuestName).trim()) {
          return "她【剛剛敲了你的門、這一刻才進來】(不是本來就在場，也不是跟你一起回來的)";
        }
        // 🙋 她自己找上門(見★【她自己找來了】)：同深夜訪客，是這一刻才出現的，不是本來就在場。
        if (kanshouInitVisitName_ && String(pName).trim() === String(kanshouInitVisitName_).trim()) {
          return "她【是自己找上門來的、這一刻才出現在這裡】(不是本來就在場，也不是跟你一起來的)";
        }
        if (moveTarget) {
          return kanshouPreMoveCompanions_.some(cr => String(cr[COL.PC.NAME]).trim() === String(pName).trim())
            ? "她是【與你結伴一起來到】這裡的(不是在這裡等你、更不會問你怎麼來了)"
            : "你剛抵達，【她原本就在這裡】(她不是跟你一起來的)";
        }
        if (kanshouTimeJumped_) return "時間流轉之後，【她此刻人在這裡】(別預設你們剛才一直待在一起)";
        return "【你們從剛才就一直在這裡】相處著——她早已在場，這一刻是延續，不是重新登場";
      })();
      partyDetailsArr.push(`【在場人物】名號:${pName} | 在場來由:${pPresenceStr}${pOutfit ? ` | 裝扮:${pOutfit}` : ""} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])}${pFlavorStr}${(() => { const _mo = [pMoeStr, traitPrivateOf_(r[COL.PC.TRAIT])].filter(Boolean).join("／"); return _mo ? ` | 萌點(僅供內化):${_mo}` : ""; })()}${pActivityStr}${pSleepStr ? ` | 現況:她此刻在自己家、${pSleepStr}(除非橋段已明確叫醒她，否則維持這個狀態演出，不宜寫成清醒閒聊)` : ""}${pCohabitStr}${pPropStr}${pMemoirStr}${pPromiseStr} | 關係:TA是你的${pRelTagStr}(好感:${pBond}${pMemStr}${pAtCeilingStr}${pTierToneStr}${pChillStr})`);
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
  // 玩家自己的換裝也要補進[情境延續]區塊(比照NPC每回合補進[名字 裝扮]行)，這是情慾場景AI主要
  //   參照的區塊，不能只在【玩家命格】看得到。
  let nsfwMemories = `\n[玩家『${pcName}』肉體]：${JSON.stringify(pPhysicalObj)}${myOutfit ? `\n[玩家『${pcName}』裝扮]：${myOutfit}（當前服裝·五官/髮色/體態不變）` : ""}`;

  // ⚡ 提速：跟上面 presentRowsForGender 是完全相同的 filter 條件，直接複用，省掉第二次整表掃描。
  let allPresentRows = presentRowsForGender;
  allPresentRows.forEach(r => {
    let npcPhysicalObj = {}; try { npcPhysicalObj = JSON.parse(r[COL.PC.PHYSICAL] || "{}"); } catch (e) { }
    if (Object.keys(npcPhysicalObj).length === 0) npcPhysicalObj = { "狀態": "如常" };
    let relMem = r[COL.PC.REL_MEM] || "無";
    let npcOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👕 換裝：當前服裝穿著(換衣不換人·五官體態依本相；玩家UI設定或AI依appearance_extras更新)
    nsfwMemories += `${npcOutfit ? `\n[${r[COL.PC.NAME]} 裝扮]：${npcOutfit}（當前服裝·五官/髮色/體態不變）` : ""}\n[${r[COL.PC.NAME]} 肉體]：${JSON.stringify(npcPhysicalObj)}\n[快照]：[羈絆]${relMem}`;
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

  // 🚪 夜訪當下的【客觀事實】：玩家原本正要歇下、她這時候找上門，房裡還有誰。只陳述事實，
  //   各人反應(牽手中那位吃味/尷尬/大方，還是根本樂見)一律交給 AI 依各自性格與好感演。
  const kanshouNightGuestStr = kanshouNightGuest_ ? (() => {
    const _others = pcData.filter((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && sameGame(r)
      && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC] || "").trim() === curL
      && String(r[COL.PC.NAME]).trim() !== kanshouNightGuest_.trim()).map(r => String(r[COL.PC.NAME]));
    return `\n★【夜訪·客觀事實】：你原本正準備歇下，『${kanshouNightGuest_}』就在這時候找上門、人已經進來了。`
      + (_others.length ? `此刻這裡還有『${_others.join('、')}』——她們原本也正要各自歇下，這一下全被打斷了。` : `此刻這裡只有你們兩人。`)
      + `這一夜要怎麼收由【玩家自己決定】：你只演出此刻各人依性格與好感的真實反應，【不可】替玩家留人或送客、不可自行把整夜演完。`;
  })() : "";

  // 深夜訪客：她的LOC已在前面被設成curL，之後會自動出現在partyRows
  //   裡拿到完整卡片，這裡只補一句「剛敲門進來」的情境描述(卡片本身不會講這件事的來龍去脈)。

  // 🐛→✅ 玩家「字數一下很長一下很短」：舊版篇幅規則只給「好感區間→字數區間」的靜態文字，AI 要
  //   自己把數字判斷落在哪一區間本身就不穩(小模型對數字門檻的一貫弱點)，多人在場又好感不一時
  //   更不知道該以誰為準——兩個變因疊加就是玩家看到的忽長忽短。改成GAS直接算好一個具體目標字數
  //   (取在場好感最高者，沒人在場就用最低檔)直接指定，AI 不必自己做區間判斷。
  const _kanshouMaxBond_ = partyRows.reduce((m, r) => Math.max(m, parseInt(r[COL.PC.BOND]) || 0), 0);
  // 🐛→✅ 玩家「催眠跟好感會不會衝突」：催眠(ignoreBond)生效時常常是低好感也被推到高強度場面，
  //   還照好感字數會覺得被砍短——生效中一律拉到最長檔，不再看好感臉色。
  const _kanshouHypnosisActive_ = partyRows.some(r => kanshouGetProps_(r[COL.PC.MEMORY], _kanshouPropCatalog).some(p => p.ignoreBond && p.level && p.level !== '關閉'));
  const _kanshouTargetWords_ = _kanshouHypnosisActive_ ? 500 : (_kanshouMaxBond_ >= 60 ? 500 : _kanshouMaxBond_ >= 40 ? 400 : 250);

  const driveStr = driveOn ? `
🔥【主動掌握】：同伴主動推進至「實際發生」，拒絕空轉。①主動程度依好感(<40僅言語試弄；高好感解鎖肢體；80+索求到底${_kanshouHypnosisActive_ ? '；催眠暗示道具例外' : ''})；②角色一致性(冷傲冷傲地主動/羞怯鼓起勇氣)，禁霸道模板；③禁真正傷害玩家；④文字尺度受天花板約束，篇幅依【篇幅指定】；⑤色度跟隨玩家，好感允許內細膩露骨(禁迴避)，未達依個性真實反應(拒絕/迴避/害羞/半推半就)；⑥情慾場：大量生理特寫(絞緊/吸吮/痙攣/蜜液/水聲/啪啪)+斷續喘息破碎台詞，未達階依個性婉拒。` : '';

  const PROMPT_REL = `${backgroundCrowdStr}
★【視角鎖定】：「我」＝玩家『${pcName}』本人，不誤寫成他人心境。${nsfwMemories}${genderHintStr}${driveStr}
🛑【角色一致性】：NPC反應死守[性格]×[好感]，不因劇情推進線性軟化——生理反應可以有，人格不崩(高傲咬牙不示弱/虔敬掙扎/活潑藏羞)，禁退化成發情機器。${_kanshouHypnosisActive_ ? '★催眠暗示生效中【人格照樣不崩】：被繞過的只有「拒絕得了」與「覺得這很奇怪」，個性/態度/敵意原封不動照跑，不可寫成判若兩人。' : ''}`;

  // 有【專屬稱呼】就用暱稱取代真名；JSON 姓名欄不受影響、仍填真名。
  const npcDialoguePrompt = partyMembers.length > 0 ? `\n★【稱呼】：在場者有【專屬稱呼】就用暱稱、否則用真名「${partyMembers.join("、")}」·不自創第三種稱呼(僅narration/台詞·JSON欄仍填真名)。非清單所有人都要出聲。` : "";


  // 🌱 動態 master_note 的前置計算(要在 USER prompt 組裝【之前】算好——下面【玩家命格】那行的
  //   「你可透過 master_note.經歷 滾動增補」提及必須跟著 _doSideWrite 條件化，否則非側寫回合
  //   schema 已刪掉 master_note、USER prompt 卻還在催，AI 會自發吐出 schema 外的欄位擊穿節流)。
  // 🌀 側寫節流：計數 +1 存回 MEMORY(玩家列恆寫回·零額外 round-trip)，只在第 1、N+1、2N+1… 回合帶
  //   master_note(首回合必寫·抓初印象)。非側寫回合整塊拿掉、AI 專心敘事，落地端守衛同步擋掉自發輸出。
  const _swCount = kanshouGetSideWriteCount_(pc[COL.PC.MEMORY]) + 1;
  pc[COL.PC.MEMORY] = kanshouSetSideWriteCount_(pc[COL.PC.MEMORY], _swCount);
  const _doSideWrite = (_swCount % KANSHOU_SIDEWRITE_EVERY_ === 1);

  // 鑑賞無戰鬥，御主的 HP/MP/MAX_HP/MAX_MP 這4欄從未寫入，故 prompt 不提血量/魔力數值或瀕死判斷
  //   (與世界觀規則「禁止血量/生命變化」一致——該禁令在下方 USER 世界觀＋演出而非說明兩行)。
  const prompt = `【敘事法旨】：視角鎖定玩家『${pcName}』(ID: ${pcId})。
【玩家命格】：名號:${pcName} 【性別:${pc[COL.PC.SEX]}】 性格:${pc[COL.PC.PREF]} | 特徵:${pc[COL.PC.TRAIT]}${myOutfit ? ` | 裝扮:${myOutfit}` : ""} | 經歷:${pc[COL.PC.BACK] || "剛搬來冬木市"}${_doSideWrite ? '(可透過 master_note.經歷 滾動增補)' : ''} | 位置:${curL}${(() => { const _c = kanshouLocContextForAI_(curL, getKanshouHomeName_(pc[COL.PC.MEMORY], pcName)); return _c ? `（${_c}）` : ""; })()}

${PROMPT_REL}
★【在場驗證·最高優先】：只有【在場人物】可對話/互動/記好感·路人不具名不追蹤。例外：①玩家引入第三人②系統豁免段(自然告辭/指定巧遇)。歷史提過但不在場＝不在場，禁憑空開口；可輕巧帶過原因(去忙別的/剛好不在)，禁裝作還在、禁不解釋就消失。
★【焦點禮讓】：玩家專一互動時，其他在場者維持背景輕描·不搶話/不介入親密(除非系統另有提示)。
★【在場來由】：一律照各人「在場來由」欄演、不可改寫。標「一直在這裡」＝從她早已在場的狀態接著往下寫，她把你在場視為理所當然；標「結伴一起來到」＝她是跟你一起走進來的，這一路她都在你身邊。${kanshouWorldRosterStr}${kanshouEncounterStr}${kanshouNightGuestStr}${kanshouKnockRaidStr}${kanshouSceneAmbientStr}${kanshouAloneBondStr}${kanshouNpcLeaveStr_}${kanshouNightPartStr}${kanshouVisitBlockedStr}${kanshouTimeBlockedStr}${kanshouPromiseStr}${kanshouPromiseMetStr}${kanshouCohabitStr}${kanshouInviteStr}${kanshouHandHoldStr}${kanshouHoldingStr}${kanshouPhotoStr}${kanshouShowPhotoStr}${kanshouEventSeed ? `\n★【氛圍靈感·非強制】：可自然納入一個小細節——${kanshouEventSeed}·不合劇情可不用。` : ""}${kanshouFestivalStr}${kanshouApptTodoStr}${kanshouApptWaivedStr}${kanshouCohabitEndStr}${kanshouNightSceneStr}${kanshouInitStr}
★【今日天氣】：${kanshouWeather_(curDay)}·自然滲入場景不必每句提。${kanshouTierCrossStr}${kanshouFirstsAnnivStr}${kanshouFirstsStr}${kanshouAnnivStr}${intimateNightNames.length ? `\n★【入夜·好感達門檻】：『${intimateNightNames.join('、')}』與你羈絆已深(≥80)·今晚可自然發展到同床·依個性決定要不要跨出這步·不強制寫到底；未達門檻者各自安睡不越界。` : ""}${_morningHere_ ? `\n★【晨間餘韻·非強制】：昨夜與『${_morningHere_}』或許共度親密(依上回合實際內容·沒跨出就當平常早晨)·可自然帶晨間溫馨曖昧·不強制不複述細節。` : ""}${_partedAway_ ? `\n★【昨夜她走了·非強制】：昨晚陪你到最後的『${_partedAway_}』並沒有留下過夜·可自然帶一點昨夜餘溫未散的感覺·她此刻【不在場】·禁讓她開口或出現。` : ""}
💕【後日談模式·最高優先覆寫】：${partyRows.length === 0
    ? `眼下無相識者在場·玩家一個人的尋常時光。`
    : (partyRows.every(r => String(r[COL.PC.ID]).indexOf("KHV_") === 0) && partyRows.every(r => (parseInt(r[COL.PC.BOND]) || 0) < 20))
      ? `『${partyMembers.join("、")}』才剛與玩家在這城認識不久——非舊識重逢·是【初次相遇】後的日常·相處生澀依好感升溫·嚴禁暗示早已相熟或有共同過往。`
      : partyRows.every(r => String(r[COL.PC.ID]).indexOf("KHV_") === 0)
        ? `你與『${partyMembers.join("、")}』是在這城從陌生相識一路相處到現在——【無】戰前舊識或共同過往·但這段日子的感情真實·依各自好感/關係標籤演出該有的熟悉·別退回「才剛認識」的生澀。`
        : `與『${partyMembers.join("、")}』共度這座和平城鎮的尋常時光。`
  }
🕰️現在${curDateObj_.year}年${curDateObj_.month}月${curDateObj_.day}日・${kanshouFmtHM_(_narrHour_)}・${timeBand_(_narrHour_)}(揣摩氛圍用·不報時)。★【此刻＝${timeBand_(_narrHour_)}·唯一真實】：所有光線/氣溫/作息的感受一律依此刻重寫，歷史停在哪個時段都不算數。★本回合敘事跨度上限【十分鐘】·只寫這十分鐘內的當下片段·時間推進一律由系統宣告。
★世界觀＝和平現代城鎮：在場每個人就是這座城裡的普通市民，來歷只能取材自系統給的她自己那份資料；那之外的設定(超凡力量、非現代事物、生死衝突)在這個世界從未發生過。調性不限悠閒。
★【親密尺度五階·最高優先】${_kanshouHypnosisActive_ ? '(催眠暗示道具生效中例外)' : ''}：肢體親密以好感為天花板，未達門檻依個性擋下(人格不崩)：
・<20(點頭之交)：形同陌生人·一動手動腳就【連碰都碰不到】(閃避/擋手/喝止/還手依個性)。
・20~39(普通朋友)：婉拒一切情慾越界·可friendly不接受親密。
・40~59(熟識)：彆扭接受輕度接觸(牽手/靠肩/摸頭)·親吻以上會退開。
・60~79(親近)：親吻擁抱依偎可·脫衣/性事仍止住。
・80+(戀人)：無上限·依情境個性到底。
★多人各依各自好感·不共用同階。
★★【天花板也管命令/強迫/暴力】：命令做肢體服從動作(如「命令她跪下/過來/脫」)、或明講強迫字眼(如「強姦」「壓制」「無視掙扎」)一樣受五階天花板約束——未達門檻【不會得逞】，她依個性拒絕/反擊(嗆回去/翻臉/還手，吃虧的是玩家)；純提議/善意舉動(如「幫她解決OO困擾」)不算冒犯，正常演出即可。禁對同伴造成真實傷害(流血/骨折/撕裂傷)，親密可激烈但不能演成傷害身體。
★【篇幅指定】：本回合narration目標約${_kanshouTargetWords_}字(不必精確，別落差太大)——低好感互動別寫成大段內心戲。
★【演出而非說明】：不直述願望/萌點/個性字面。數值只輸出 rel_changes(好感)。
★★【移動鐵律】：換地點一律由系統裁定。系統沒宣告就是還在${curL}，敘事停在這裡不移動；系統已宣告＝直接從新地點的當下寫起，路程略過不演。
★【不憑空生東西】：玩家手上只有他自己說出口的東西，其餘一切物品與金錢在這個世界不存在。
★【不替玩家腦補】：『我』只演玩家實際輸入的動作+五感·禁大段內心戲/替他決定。★『我』的描寫只能來自他自己的感官(看到/聽到/觸到/心裡的感覺)——他看不見自己的神情。★同伴外貌只取材她自己資料，禁挪用玩家特徵。★各人的[台詞自稱]僅其本人引號內台詞可用，旁白不得套用。
★【歷史僅供參考】：對話歷史只是背景、非本回合事實來源——以上方系統事實＋下方在場資料為準，別被過期歷史牽著走。
${PROMPT_PARTY_SYSTEM}
★【地點釘死】：所有人此刻都在「${curL}」，言行/場景只圍繞這裡，歷史提過的其他地名一律是過去式；她可嘴上聊想去別處，但真要換地方得由系統裁定。
現在演化玩家動作：『${finalUserMsg}』${npcDialoguePrompt}

🚨【收尾${driveOn ? '·主動掌握' : ''}】：${driveOn ? '大幅推進到位，該發生就發生，別在曖昧邊緣空轉。但仍' : ''}停在「我」當下進行式，留未完成動作交還玩家——被搭話者須先回應(答話/神情)才停筆；最後一句必須落在正在發生的動作或剛說出口的話上，時間刻度不超出這一分鐘。
★【動筆前最後確認】：在場只有${partyMembers.length ? `『${partyMembers.join('、')}』` : '沒有其他人'}，敘述裡開口/被觸碰/在場的只能是這些人，其他名字即使歷史提過也不准出現。`;

  try {
    // 🔥 平時矜持模式(driveOn=false)用跟solo共用的低延遲小模型(SOLO_MODEL)，只有主動掌握模式
    //   (driveOn=true)才切回鑑賞原本用的大型模型(AI_MODEL)——大多數回合是輕鬆日常對話，犯不著
    //   每次都吃重量級模型的延遲。max_tokens=1500：narration目標約500字＋其餘欄位，太低容易讓
    //   模型輸出被截斷成不完整JSON。
    // 🎛️ 2026-07 玩家調整採樣參數：temperature/top_p 略升、加top_k/repetition_penalty/presence_penalty/
    //   frequency_penalty 抑制重複套路句(如老是收在同一種收尾語氣)，僅driveOn吃到大模型(AI_MODEL)時
    //   這幾顆額外旋鈕才會實際生效，矜持模式(SOLO_MODEL)不支援的部分由OpenRouter靜默忽略。
    // 🚀 2026-07 探針實測定案(v2硬版·六階梯度)：SOLO_MODEL(當時為gemini-3.1-flash-lite，同月陸續換過
    //   gemini-3.5-flash-lite／gemini-2.5-flash-lite(玩家實測比較效果中)，下述具體秒數/命中數字是最初
    //   3.1版測的，僅供參考·未針對後續版本重新探針)在真慾海律令下
    //   階4~6全過、露骨度🔥(極致階命中13個器官/水聲/動作字眼·真敢寫到底)、每次僅~4-5秒；反觀原本
    //   點火(driveOn=true)硬吃的 AI_MODEL(deepseek)慢達15~49秒、且極致露骨那階還被審查擋下。故【兩模式
    //   一律先打快 Gemini】、DeepSeek 只留最後備援(rare fallback，本就少觸發)。driveOn 從此【只控敘事
    //   推進幅度的提示詞強度、不再切模型】。retries=1：Gemini 腿試一次、真被擋才交棒，不浪費柔化重試。
    // ⚡ 純時間轉場(跳時段/結束一天/跳節慶/推進時間)只是換幕、不需 AI 寫滿500字場景——上限砍到600
    //   讓生成快一截(玩家實測「讓時間流轉到夜晚超級久」)。一般聊天/移動仍1500(narration目標約500字·
    //   太低會截斷成不完整JSON)。移動(moveTarget)不算轉場提速範圍——走到新地點仍要完整場景。
    // 🐛→✅ 玩家實測抓到：上面這句「太低會截斷成不完整JSON」的警語，其實時間轉場也躲不掉——
    //   轉場當下若剛好有同伴在場(如牽著手一起跳時段)，AI一樣得寫一整段她的反應場景，跟一般聊天
    //   同等篇幅需求，600 tokens 常常寫到一半就被截斷、JSON 不完整，重試全部失敗只能回「因果
    //   紊亂」保底文字(Cloud 記錄檔證實：JSON.parse 卡在 truncate 掉的字串中間)。只有真的沒人在場
    //   (純粹「時間過去了」的簡短交代)才適用600的精簡上限，有人在場時比照一般聊天給滿1500。
    const _timeJump = kanshouTimeJumped_;
    let aiConfig = { temperature: 1.08, top_p: 0.97, top_k: 60, repetition_penalty: 1.12, presence_penalty: 0.25, frequency_penalty: 0.25, retries: 1, model: SOLO_MODEL, isNsfwMode: true, max_tokens: (_timeJump && partyRows.length === 0) ? 600 : 1500 };
    aiConfig.fallbackModel = AI_MODEL;

    // 抓取近 6 筆原始歷史(3輪)，轉換為 API 格式。
    // 🎬 換幕縮窗(確定性根治「換地點/換時段後被舊場景帶著跑」)：移動/跳時段/結束一天的回合只餵
    //   最近 1 輪——舊場景的對話根本不進 AI 眼睛、物理上不可能沿用；保留最近 1 輪讓「決定要來
    //   這裡」的話題接得上(帶同伴同行時對話不斷裂)。
    const _sceneCut = !!(moveTarget || kanshouTimeJumped_);
    const recentHistoryRaw = getGameHistoryBatchRaw(pcId, _sceneCut ? 2 : 6);
    if (recentHistoryRaw && recentHistoryRaw.length > 0) {
      aiConfig.chatHistory = recentHistoryRaw.map(msg => ({
        role: msg.speaker === "player" ? "user" : "assistant",
        content: String(msg.content)
      }));
    }

    // 🌱 動態 master_note：只剩經歷會滾動(性格四格/萌點已不再交給AI，見buildDefaultSystemPrompt註解)。
    //   buildDefaultSystemPrompt 只有此處呼叫，故把系統提示詞在這裡組好、當 systemOverride 傳入
    //   (取代 callGeminiAPI 內的無參數 fallback)。_doSideWrite 已在 USER prompt 組裝前算好(見上方·
    //   prompt 內的經歷提及要跟著條件化)。
    // 🎛️ 玩家關掉【命運的抉擇】→ options 欄整個不進 schema(前端帶 optionsOn；沒帶=舊前端，照常給)。
    const _sysPrompt = buildDefaultSystemPrompt(_doSideWrite, userData.optionsOn !== false);
    const aiResponseRaw = callGeminiAPI(prompt, _sysPrompt, aiConfig);
    // 🛡️→✅ 2026-07 邊界稽核：模型偶爾會回【截斷的 JSON】(吐到 max token 就斷)或純文字道歉，
    //   這在真實運行中是常態、不是例外。舊版直接 JSON.parse，一失敗就丟例外——而 handleGameAction
    //   的 try 只有 finally、沒有 catch，例外會一路穿出去變成裸錯誤。callGeminiAPI 本來就設計了
    //   _genFailed 這條優雅失敗路徑(整回合 no-op、不寫歷史)，解析不出來就走同一條，別另闢死路。
    let aiData;
    try {
      const start = aiResponseRaw.indexOf('{');
      const end = aiResponseRaw.lastIndexOf('}');
      aiData = sanitizeAiData_(JSON.parse(aiResponseRaw.substring(start, end + 1)));
    } catch (e) {
      try { Logger.log("[actionPlay_ AI回應無法解析] " + String(aiResponseRaw).slice(0, 300)); } catch (e2) { }
      aiData = aiFallbackData_(false);
    }

    // 🐛→✅ callGeminiAPI 全部重試/審查攔截皆失敗時，回傳的是一組「保底文字」JSON(而非丟例外)，
    //   長相跟真正生成成功的回應一模一樣——若照舊往下跑，這句「什麼都沒發生」的保底文字會被
    //   後面 saveGameHistoryBatch 原封不動存進歷史，下次呼叫又把它當成上一輪的既定事實餵回AI，
    //   可能讓AI誤以為劇情已經走到某個曖昧不明的狀態、接續出跟實際劇情矛盾的敘事。callGeminiAPI
    //   在保底文字裡加了 _genFailed 旗標即可辨識，失敗就在這裡直接回給前端、完全不進入後面任何
    //   側效(拍照/性格/回憶/提議…)、也不寫進歷史。
    if (aiData._genFailed) {
      // ⚠ 不帶 people：這條沒人真的移動，夾 people:[] 會把前端
      //   localNPCs 快取洗成空(2026-07 稽核抓到這裡漏做了同一個已修過的防護)。
      return JSON.stringify({ text: aiData.narration, options: aiData.options });
    }

    // 📷 拍照落地：AI成功回應才寫相簿(沒有底片，失敗也無所謂)。敘述吃AI的photo_caption，
    //   沒吐就用「時段的地點·人物」模板保底；髮色從第一位被拍者的TRAIT現場解析(通吃工房新角色)。
    var kanshouPhotoResult_ = null;
    if (kanshouPhotoPending_) {
      try {
        // 🐛→✅ 稽核抓到：這是AI結構化輸出(非玩家直接輸入)寫進試算表儲存格的自由文字，卻只清了
        //   HTML斷字/內部標記符號，沒比照sanitizeUserData_(Router_Action.gs)也清控制/零寬/雙向
        //   控制字元、也沒擋開頭=+-@這類會被Sheets appendRow解讀成公式的引導字元——照樣落地的話，
        //   之後任何讀這欄位的地方(含未來可能新增的畫面)都會拿到帶零寬/雙向字元的髒字串，儲存格
        //   本身也可能被解讀成公式而非純文字。跟玩家輸入欄位比照同一套防線。
        const _phCap = String(aiData.photo_caption || `${timeBand_(curHour)}的${String(curL || "")}，${kanshouPhotoPending_.names.join('、')}的身影。`)
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
          .replace(/[<>&"'`｜【】]/g, "").slice(0, 90)
          // ⚠ 引導字元這道【必須擺最後】：它後面每一道 replace 都還會再刪字元，先擋就會被
          //   「刪掉開頭那個字→原本第二位的 = 變成開頭」繞過(實測 photo_caption 打 `"=SUM(1+1)`
          //   落地就是一格活的公式)。同一個順序錯誤在 sanitizeUserData_ 也有，已一併修正。
          .replace(/^[=+\-@\t\r]+/, "");
        const _phSubj = kanshouPhotoPending_.scenery ? null : pcData.find(r => String(r[COL.PC.NAME]).trim() === String(kanshouPhotoPending_.names[0]).trim() && String(r[COL.PC.FACTION]) === "從者" && sameGame(r));
        const _phHair = kanshouPhotoPending_.scenery ? '#7a9a6a' : kanshouHairHex_(_phSubj ? String(_phSubj[COL.PC.TRAIT] || "") : ""); // 風景照緞帶固定草綠
        const _phFlag = driveOn ? '親密' : (kanshouReFest_ ? kanshouReFest_.name : '');
        const _phId = 'PH_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        // 🐛→✅ 稽核抓到：跟上面敘事用的pActivityStr(2959行)同一份kanshouLocActivity_，卻沒套用
        //   同款_pCameWithMe防呆——若被拍者是這回合才被玩家帶著同行(moveTarget)的同伴，這裡仍照樣
        //   算出「她在這打工/當班」這類固定職業描述存進相簿，跟本回合敘事剛講的「她陪你來」矛盾。
        //   雖然前端目前沒有任何地方讀這個活動欄位(存粹存檔·尚無顯示介面)，但既然要存就該存對，
        //   比照敘事那份判斷邏輯：本回合才同行者不附活動描述。
        const _phSubjName0 = kanshouPhotoPending_.names[0] || "";
        const _phCameWithMe = !!moveTarget && kanshouPreMoveCompanions_.some(cr => String(cr[COL.PC.NAME]).trim() === _phSubjName0.trim());
        const _phActivity = _phCameWithMe ? "" : kanshouLocActivity_(curL, _phSubjName0, curDay);
        kanshouAlbumSheet_().appendRow([myGameId, _phId, curDay, timeBand_(curHour), String(curL || ""), kanshouWeather_(curDay), kanshouPhotoPending_.names.join('、'), _phActivity, _phCap, _phFlag, _phHair]);
        kanshouPhotoResult_ = { ok: true };
      } catch (e) { kanshouPhotoResult_ = { ok: false, reason: 'error' }; }
    } else if (kanshouPhotoDenied_) {
      kanshouPhotoResult_ = { ok: false, reason: kanshouPhotoDenied_ };
    }




    // 💭 AI 不得自行搬動玩家、也不再有任何欄位讓它自己提議換地方(§134·2026-07再修，玩家實測
    //   「AI一直提議移動、頭痛」後把 move_proposal 整欄砍掉)：地點只有兩條合法變動路徑——玩家自己
    //   用地圖走(moveTarget，見上游1739)，或玩家在地圖向同伴提議同去、GAS 依好感直接裁定
    //   (_pendingProposal.type==='move'，下方判定式會回填這裡)。moveProposal 在此固定為空，
    //   唯一寫入來源就是下面那段 _pendingProposal 判定，AI 完全無從置喙。
    let moveProposal = ""; // let：下方玩家提議同去(type:'move')她接受時會回填

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
        // loc：move 婉拒的通知條要顯示地名(稽核抓到「不想去「」」空字串)；其他型別不讀此欄、帶著無害。
        kanshouProposalResult_ = { ok: false, type: _pendingProposal.type, name: _ppHer, loc: _pendingProposal.loc || "" };
      }
    }

    // 🐛→✅ 2026-07 玩家「約會泡泡也好煩人」：拿掉GAS依好感卡關(39/59/79)每回合主動追問「要不要
    //   約她出去」的泡泡(原kanshouPromiseOffer_)——跟同居泡泡同一個嫌煩理由，且卡關中這顆泡泡是
    //   每回合都跳(不是一天一次)，比同居泡泡還更頻繁。玩家想約會時仍可隨時用既有 promiseMeet(地圖
    //   「相約」)主動邀約，赴約成功一樣拿+5好感、一樣能突破聊天上限(kanshouPromiseMetStr不吃
    //   chat ceiling)，沒有損失任何機制，只是系統不再主動跳出來問。
    // 🐛→✅ 2026-07 玩家「取消同居詢問的泡泡吧，太煩人了」：拿掉GAS每天主動追問「要不要邀她同居」
    //   這個泡泡——玩家想同居時仍可隨時自己主動邀請(見上方cohabitInvite/kanshouInviteCohabit)，
    //   只是不再被系統每天問。

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
        // 🧊 掉分達門檻→記下今天。注意要用 change 本身而不是 newFav-oldFav：棘輪把值夾在地板上時
        //   兩者差 0，但「她確實不高興了」這件事仍然發生過，不該因為分數扣不動就當沒事。
        if (change <= -KANSHOU_CHILL_MIN_DROP_) pcData[nIdx][COL.PC.MEMORY] = KANSHOU_CHILL_DAY_TAG_.set(pcData[nIdx][COL.PC.MEMORY], curDay);
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
      //   寫入前先清掉句中的 ｜【】[] 避免污染分隔(比照 setOutfit_ 的清洗)。
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

          // 羈絆記憶已併入該 NPC 自己列的 REL_MEM 欄，現在只剩專屬稱呼。
          let oldRMem = pcData[targetIdx][COL.PC.REL_MEM] || "";
          // 🔒 2026-07 五度改版·玩家透過 kanshou_set_nickname 手動鎖定過專屬稱呼後(【稱呼鎖】是)，
          //   AI 不再自動累加新稱呼進來——尊重玩家的手動選擇，同 kanshouSyncRelTier_ 對自訂關係
          //   稱呼「一旦手動改過就不再被自動覆寫」的精神。
          const nickLocked = /\[稱呼鎖\]是/.test(oldRMem);
          let nickPart = nickLocked
            ? `[專屬稱呼]${getNickname_(oldRMem) || "無"}| [稱呼鎖]是`
            // 🔒 AI 給的稱呼一律先過 sanitizeNickname_(逐項消毒＋限長)——見該函式說明：這格能偽造欄位。
            : `[專屬稱呼]${processTags(oldRMem, /\[專屬稱呼\](.*?)(?=\| \[|$)/,
              String(nfb.mutual_nicknames || "").split('、').map(sanitizeNickname_).filter(Boolean).join('、'), 3)}`;
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

    // 🌱 玩家御主「滾動側寫」(master_note)：2026-07 再修（玩家「萌點AI根本亂寫...AI只能改動經歷」）
    //   ——性格四格與萌點已在創角時由AI一次生成完整(見actionBackfillKanshouAi)，遊玩期間AI完全
    //   看不到這兩類欄位(schema已拿掉)、也就無從寫。這裡只剩經歷會繼續滾動。
    //   _doSideWrite 守衛：非側寫回合 AI 若無視 schema 自發吐 master_note 也不落地(節流不可被擊穿)。
    if (_doSideWrite && aiData.master_note && typeof aiData.master_note === 'object') {
      const mn = aiData.master_note;
      // 經歷：AI 承接舊值增補後回傳整段，這裡直接採用；空/未給則保留原經歷不動。
      //   不鎖——玩家改命=修正，AI 之後照樣繼續滾動更新。
      //   ⚠ slice(0,80)：schema 跟 AI 說 ≤50，這 30 字是刻意的容錯緩衝(比照 physical_state 15/20)，
      //   AI 略超時不半句腰斬——別「對齊文件」改回 50。
      const _newExp = String(mn["經歷"] || "").replace(/[<>【】｜]/g, "").trim().slice(0, 80);
      if (_newExp) { pcData[pcIndex][COL.PC.BACK] = _newExp; dirtyPcRows.add(pcIndex); }
    }

    const pcColCount = Object.keys(COL.PC).length;

    // 競態修：play 豁免寫入鎖(AI 呼叫佔數秒會卡全域)，但上面的列索引是 AI 呼叫【前】讀到的——
    //   期間其他上鎖動作若刪列，索引會位移。寫回前做一次 ID 欄窄讀重定位，列已被刪就跳過。
    // 🆕 新列先落盤，再建 id 索引——順序不能反：liveIdx 建完才 append 的話，新列查不到 id，
    //   後面 dirtyPcRows 對她的異動(週年/關係階/初次帳)會被當成「列已被刪」靜默跳過。
    if (_pendingNewPcRow_) sheets.pc.appendRow(_pendingNewPcRow_);
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
      cohabitOffer: kanshouCohabitOffer_ || undefined,
      // 🚪 善後選項【只在她進門那一回合給一次】(2026-07 玩家「就只要問一次就好」)。
      //   代價是明白的、也是合理的：玩家若改用打字繼續陪她，就沒有送客鍵了，之後按結束一天
      //   她會留下過夜——那本來就是「你選擇繼續陪她」的自然結果。⚠ 別為了補這個缺口把泡泡
      //   改成常駐，玩家對常駐泡泡的容忍度是零(同居/約會泡泡都因此被拔過)。
      nightGuest: kanshouNightGuest_ || undefined,
      encounterOffer: encounterOffer,
      proposalResult: kanshouProposalResult_ || undefined,
      promiseSettle: kanshouPromiseSettle_.length ? kanshouPromiseSettle_ : undefined, // 📅 赴約/爽約結算通知陣列(獨立通道·不與提議結果搶單槽·可同時容納多筆)
      promiseWait: kanshouPromiseWait_ || undefined,
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
// 讀相簿：本局全部照片(新到舊)。手機拍完立刻能看，不再有沖洗中狀態。dateLabel後端算好
//   (kanshouAbsDayToDate_)，前端零日曆邏輯。
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
