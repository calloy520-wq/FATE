// ==========================================
// 🏆 Gallery.gs — 鑑賞軌道全集中（慾海後日談，與封存從者的和平約會）
//   從英靈殿直接召喚同伴進入後日談，不必先在 solo 打贏封存；勝利只做清理(actionEndRun)，
//   不寫「鑑賞」表(該schema已移除，全代碼庫無讀寫者，留著的空分頁無害可自行刪除)。
//   actionPlay/buildDefaultSystemPrompt(含nsfwBaseRules)也集中在本檔，鑑賞相關代碼只查
//   這一個檔案即可；callGeminiAPI 留在 Engine_Combat.gs(solo/鑑賞共用基礎設施)。
// ==========================================

// 🔒 帳號歸屬驗證：比照 solo 的 linkAccountToPc_/COL.ACC.PC 機制——「帳號」表的 KPC 欄位是
//   唯一權威來源(僅 actionEnterKanshou 寫入)。KPC_ ID 只用 Date.now()、理論上可預測，故不能只憑
//   pcId 找列就信任是本人；每次都查 acctName 連結的 KPC 是否確實等於呼叫者聲稱的 pcId。
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

// 清理某 game_id 的整局資料（眾生，關係已併入列自身欄位，刪列即刪關係），並解除帳號連結。
//   preData 可選：呼叫端若已有整表快照可傳入省一次讀取，不傳則自己讀。
function purgeGameData_(sheets, gameId, accountName, preData) {
  if (gameId) {
    var fresh = preData || sheets.pc.getDataRange().getValues();
    // 順手收集要刪的每一列 pcId，一併清掉「歷史暫存」裡屬於這些 pcId 的對話列，避免結束對局的
    //   歷史列無上限累積。
    var purgedPcIds = [];
    for (var r = fresh.length - 1; r >= 1; r--) {
      if (String(fresh[r][COL.PC.GAME_ID] || "") === gameId) {
        purgedPcIds.push(String(fresh[r][COL.PC.ID]).replace(/^DEAD_/, ""));
        sheets.pc.deleteRow(r + 1);
      }
    }
    try { purgeHistoryForPcIds_(purgedPcIds); } catch (e) { }
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

// 🏆 奪得聖杯／結束本局：不再封存(見上方檔頭說明)，只做清理，讓玩家能立刻開新局。
//   從者/盟友要在慾海重逢，改用「英靈殿直接召喚」(見 actionKanshouSummonHero)。
function actionEndRun(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  var pcData = sheets.pc.getDataRange().getValues();
  var pIdx = pcData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主。" });
  var gameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");

  var sv = findPlayerServant_(pcData, gameId);
  var realName = sv ? String(sv.row[COL.PC.NAME] || "從者") : "";

  purgeGameData_(sheets, gameId, acctName, pcData);

  return JSON.stringify({ success: true, servantName: realName });
}

// 🌹 鑑賞專屬眾生分頁：慾海角色(御主 avatar＋同伴從者)全部住這、與主「眾生」隔離，
//   後日談頻繁新增/移除角色不污染戰爭主表。schema 與「眾生」同(COL.PC 位置索引一致)。
//   dispatcher 會在 pcId 以 "KPC_" 開頭時自動把 sheets.pc 指到這張表。
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

// 🤖 在【寫入鑑賞眾生前】用 AI 把戰時外貌(如「貼身黑色戰甲勁裝」)轉譯成同一人在現代都市日常會有
//   的穿搭/外型：保留髮色/五官/氣質等本相不變，戰甲/武裝換成貼合性格的日常打扮；服裝保留原本
//   色系/風格精神只做日常化，不换成完全不同調性。PREF(性格)完全不動、只有戰甲是「戰時限定」的
//   部分。呼叫端(召喚/奪杯封存)僅一次性觸發，失敗時原樣退回戰時描述。
//   輸出兩樣東西：①look 明確四段(外貌本相/氣質舉止/自稱與口氣/卸下心防的私密一面)，跟
//   PERSONA.traits／PREF 的四格格式對齊；②outfit 獨立的日常穿搭一句話。
//   dailyMoeHint：私密一面與萌點是兩次獨立 AI 呼叫，容易各自發想撞成同一件事的兩種說法，故把
//   已算好的 dailyMoe 當提示傳入，明講「私密一面不可跟這句萌點重複」。
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

// 跟 Core_Settings.gs 的 enrichPersonalityLikesDislikes_ 的差異：那個給「還在戰場」的 solo 用
//   (只補缺項、維持戰時語境)，這個專給「進入鑑賞和平日常」用——一次AI呼叫做兩件事：①段數不足
//   4段就補滿；②戰場語境短句(戰意/殺意/勝負等)轉譯成性格本質不變、適合日常展現的等價說法。
//   只用在鑑賞的兩個新增從者入口。
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

// 這裡是平行世界，沒有聖杯戰爭這回事(但她們仍是英靈)：跟上面兩個 XxxToDaily_ 不同——moe(萌點·反差)
//   若直接照搬戰時版本，會把「靠戰爭/詛咒/創傷撐出的沉重反差」硬套進沒發生過戰爭的世界，顯得莫名
//   沉重。改寫成「輕量、溫馨、看了會心一笑」的日常萌點，性格核心不變但拿掉沉重份量——只用在 AI
//   原創(ai_gen)英靈；canon 種子英靈的日常萌點全部手寫死進 persona.dailyMoe(見 Seed_Codex.gs)。
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

// DAILY_LOOK/DAILY_WORDS 只有兩種來源，皆在「進英靈殿之前」保證非空：①種子全數手寫寫死；
//   ②工房(ai_gen)建立/修改當下就呼叫AI預先轉好寫入。不存在第三種留空來源，故此處純讀取，
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

// 🌹 慾海直接從英靈庫召喚進後日談，不必先在 solo 打贏封存。刻意【不帶任何戰鬥資料】
//   (SIX/TAGS/MARTIAL 留空)——慾海無戰鬥，養這些資料只白增加 AI 誤讀風險。
// 好感給 45(「尚淺·剛認識」)而非封存路徑的 90：剛見面就給滿好感會架空「好感未滿80/性格
//   冷酷高傲者要演出真實戒備」的一致性鐵律，讓角色自己的性格決定要花多久暖起來。
function heroToKanshouRow_(heroRow, gameId, loc, curDay) {
  var pcColCount = Object.keys(COL.PC).length;
  var name = String(heroRow[COL.HERO.NAME] || "從者");
  // 🏠 2026-07「房東房客」定案：3位同住人(KANSHOU_HOUSEMATE_ROOMS_)是入住的房客，起跑點刻意
  //   比一般英靈更生疏(房東房客不會一搬進來就掏心掏肺)，其餘英靈是更淡的泛泛之交起點。
  var isHousemate = !!KANSHOU_HOUSEMATE_ROOMS_[String(heroRow[COL.HERO.ID] || "")];
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
  // 戰時 p.back(3位女性正典御主是「父親死於聖杯戰爭」等悲劇)跟平行世界設定矛盾，優先讀
  //   p.dailyBack(溫馨改寫版)；沒有的英靈一律走職階+真名的中性保底。
  sRow[COL.PC.BACK] = p.dailyBack ? String(p.dailyBack).slice(0, 28) : `${sRow[COL.PC.RANK]}・${name}`;
  // 直接召喚無快照可帶，用該英靈自己的日常衣裝(daily.outfit)墊底，沒有才退回「日常便服」。
  // p.speech/p.tic 是戰時口吻/小動作(如狂化英靈「僅餘低吼」)，跟平行世界設定矛盾：口吻改用
  //   dailyLook 第3段(自稱與口氣)的日常安全版；tic 沒有對應日常版，直接不帶(私密一面已承擔
  //   角色專屬小習慣的功能)。
  var dailySpeechPart = dailyLookParts.length >= 4 ? dailyLookParts[2] : "";
  sRow[COL.PC.MEMORY] = setOutfit_(stampPersonaFlavor_(isHousemate
    ? "【鑑賞後日談·初見】剛搬進衛宮宅的新房客，房東與房客的關係還很生疏，緣分才剛開始。"
    : "【鑑賞後日談·初見】從英靈殿被召喚而來的相遇，緣分才剛開始。", dailySpeechPart, ""), daily.outfit || "日常便服");
  // PHYSICAL 留空，跟御主本人(actionEnterKanshou)一致，直到第一次 intimacy_feedback 才寫入；
  //   Router_Narrative.gs 的懶初始化會在 prompt 組裝時臨時補上，AI 不會拿到空物件。
  sRow[COL.PC.GAME_ID] = gameId;
  // 🏷️ 2026-07「從者標籤？！改成點頭之交」玩家定案：非房客的初始關係標籤改成「點頭之交」，貼合
  //   好感10的陌生程度，「從者」這個詞留給房客以外真的更熟識之後也不合適(且容易跟solo「主從」誤讀)。
  //   關係標籤(REL_TAG)只是這裡設的起始值，之後全程只能透過actionUpdateRelTag(玩家UI手動操作)
  //   更改——AI對這欄位完全沒有寫入權限(見下方rel_changes處理迴圈的固定行為)，GAS/玩家掌控，
  //   不會被AI敘事悄悄帶偏。
  sRow[COL.PC.BOND] = isHousemate ? 30 : 10;
  sRow[COL.PC.REL_TAG] = isHousemate ? "房客" : "點頭之交";
  // 🌍 2026-07「加入這個世界的感覺」玩家定案：召喚＝讓這位英靈存在於這個世界裡，不是「加入隊伍」，
  //   故不再寫IS_PARTY——鑑賞已全面改用「LOC是否跟玩家目前位置一致」判斷是否同地點在場，不看這欄
  //   (solo自己的隊伍系統仍讀寫IS_PARTY，兩軌互不干擾，這裡只是鑑賞這條路徑不再使用這個概念)。
  sRow[COL.PC.REL_MEM] = isHousemate ? "剛搬進來的房客，房東房客的關係還很生疏" : "初次相遇，緣分才剛開始";
  // 🏠 房客的房租結算起點對齊「召喚當下的那一週」，而非恆為0——否則召喚時機晚(如第5週才召喚)會在
  //   下次收租時被kanshouCollectTenantRent_誤判成欠繳好幾週、一次補收一大筆不合理的房租。
  sRow[COL.PC.UPKEEP_WEEK] = Math.floor(((curDay || 1) - 1) / 7);
  return sRow;
}

// 🏷️ 2026-07「需要好感gas調整！」玩家定案：非房客的關係標籤依好感自動走5階梯度，GAS算、不用
//   玩家自己按按鈕，也不讓AI插手(AI對REL_TAG本就沒有寫入權限，見actionUpdateRelTag)。門檻刻意
//   借用鑑賞既有的兩個好感節點(60=夜襲橋段「歡喜迎接」分支、80=同床共枕門檻)當切點，數字只有
//   一處來源，不會兩邊打架。「房客」這個字面不在這份清單裡，故房客的標籤永遠不會被這裡自動改掉，
//   要改只能靠玩家自己手動編輯(比照「房客就是房客，以後自己改」的定案)。
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
// 💝 2026-07「只是聊天就加好感可以推倒是不是怪怪的？應該要卡在某個地方 進行送禮突破後才可以繼續
//   增加」玩家定案：純聊天(AI rel_changes)加好感只能推到「目前所在梯度的上限」就卡住不再往上，
//   要送禮(shopItem gift分支，走完全不同的程式碼路徑、天生不吃這個上限)才能真的突破到下一梯度。
//   上限沿用KANSHOU_REL_TIER_同一份門檻(20/40/60/80)，不重複開一份新數字——傳入「目前的bond」，
//   回傳「聊天不靠送禮最多只能到幾」(已經在最高梯度80+時回傳100，代表沒有更高的梯度可卡)。
function kanshouRelChatCeiling_(bond) {
  const thresholds = KANSHOU_REL_TIER_.map(t => t.min).filter(m => m > -100).sort((a, b) => a - b);
  for (const t of thresholds) { if (bond < t) return t - 1; }
  return 100;
}

// 🌍 直接從英靈庫召喚一位英靈、讓她「存在」於這個後日談世界(不需先在 solo 封存)。2026-07「加入
//   這個世界的感覺」玩家定案：召喚是一次性的「讓她出現在這個世界」，不是「加入隊伍」——世界裡沒有
//   隊伍容量上限這回事，之後她會依kanshouRollDailyLocation_自己過自己的生活，玩家想找誰互動就
//   去她所在的地點，不必先「邀入隊伍」才能對話。同一位只能被召喚一次(已存在就不重複建列)。
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
  // 🎨 2026-07 玩家「拿掉衛宮士郎吧...也禁止召喚他？」：玩家本人就是這個位置，不開放召喚。
  if (heroId === '衛宮士郎-Master') return JSON.stringify({ success: false, message: "無法召喚——這個位置由你自己擔任。" });
  var heroName = String(hero[COL.HERO.NAME] || "從者");
  // 🎨 2026-07 玩家「男角都移除掉吧...沒啥用...可以去當背景就好也禁止被召喚吧」：全面禁止男性
  //   英靈/御主入駐鑑賞(第二道防線，前端 kcRecomputeAvailable_ 已先濾掉，這裡防直打API繞過)。
  //   種子資料本體(Seed_Codex.gs)不刪，只是全面禁止在鑑賞出場——他們仍可留在敘事/種子庫當背景角色。
  if (String(hero[COL.HERO.SEX]) === '男') return JSON.stringify({ success: false, message: "「" + heroName + "」暫時無法召喚——鑑賞僅開放女性從者/御主入駐。" });
  // 🔒 玩家原創(ai_gen)只有創造者本人可召喚進鑑賞——前端清單已濾掉，這裡是第二道防線(防直打API
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

// 🌹 進入慾海·後日談（新版單一持久主畫面）：每個帳號只有【一個】常駐後日談世界。
//   點「進入鑑賞」→ 直接回到這個世界（御主 avatar），不再先挑從者、不再每次重講開場。
//   從者由 👥 後日談同伴面板自行邀請。歷史紀錄跟單機一樣靠 pcId 從「歷史暫存」撈。
//   🔒 御主 avatar 綁定帳號比照 solo 的 linkAccountToPc_ 機制：權威連結存在「帳號」表的 KPC
//   欄位，只有伺服器碼會寫，玩家端無法影響(MEMORY 內【帳號】標記僅供人工檢視辨識)。
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
  // 🏠 2026-07「開場是不是不要在火車站了？直接在家中？」玩家定案：開場直接落在衛宮宅自己的房間，
  //   不再是空泛的「冬木·深山町」城區(那個泛用值容易被AI自由發揮成「剛下車、還在路上」等外地開場，
  //   跟「房東本來就住在這裡」的房東房客世界觀矛盾)。
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
  // ⏰ 2026-07「推進時間」玩法：借用solo既有的COL.PC.DAY/HOUR欄位存鑑賞自己的時鐘。
  // 🍳 2026-07「早上6點要開始準備早餐？！」玩家定案：開局(及之後每天「結束一天」醒來，見下方
  //   endDay分支)改成清晨6點(仍落在timeBand_的「清晨」時段，跟原本8點同一個氛圍標籤，只是更早)，
  //   貼合「房東要張羅早餐」的作息——這裡刻意不強制加一個「必須先做早餐才能行動」的機關，純粹交給
  //   時段感提示詞(🕰️現在是...清晨)讓AI自然帶出張羅早餐的晨間氛圍，不強制、不卡關。
  mRow[COL.PC.DAY] = 1;
  mRow[COL.PC.HOUR] = 6;
  // 💰 2026-07 經濟層：開局給起始金錢，維護費週數從0起算(進場當下必是第0週，第8天才會跨進第1週被扣款)。
  mRow[COL.PC.MONEY] = KANSHOU_START_MONEY_;
  mRow[COL.PC.UPKEEP_WEEK] = 0;
  // 【帳號】標記保留供人工檢視試算表時辨識(非驗證用途，真正的歸屬判斷已走帳號表 KPC 欄位)。
  // 🆕 玩家本人也先給「日常便服」墊底，卡片才不會裝扮欄空白待換裝
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

  // 🌹 2026-07 玩家「開場就放置她們，不用每次都靠隨機巧遇/手動召喚」定案：預先建好起始英靈的
  //   資料列——依玩家性別挑一組不違反「不開放男男配對」的陣容，讓她們一開局就「活在這個世界裡」，
  //   各自有自己的位置(kanshouRollDailyLocation_)，玩家走到那個地點就會自然遇到她(見partyRows/
  //   LOC===curL的統一在場判定)。整批一次用getRange().setValues()寫入(單一Sheets API呼叫)，
  //   不逐列appendRow，維持整表批次寫入的效能鐵律，不會拖慢建角速度。
  // 玩家反映「美遊/伊莉雅-Caster/小黑這三個感覺先不要」(較冷門的Illya外傳角色)，改用主線
  // 知名度較高的美狄亞/美杜莎。
  // 🎨 2026-07 玩家「男角都移除掉吧...沒啥用」：全面禁止男性英靈/御主入駐鑑賞(見下方
  //   actionKanshouSummonHero同款禁令)，起始陣容不分玩家性別統一給同一份純女性名單，
  //   EMIYA/伊斯坎達爾兩位男性同伴移出起始陣容(種子資料本體不刪，只是全面禁止在鑑賞出場)。
  var starterIds = ['阿爾托莉雅-Saber', '遠坂凜-Master', '伊莉雅絲菲爾-Master', '美狄亞-Caster', '美杜莎-Rider'];
  var starterCodex = getHeroCodexCached();
  var starterRows = starterIds.map(function (hid) {
    var hero = starterCodex.find(function (r) { return String(r[COL.HERO.ID]) === hid; });
    if (!hero) return null;
    return heroToKanshouRow_(hero, gameId, kanshouRollDailyLocation_(String(hero[COL.HERO.NAME])));
  }).filter(Boolean);
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
  var current = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.GAME_ID] || "") === gid && String(data[i][COL.PC.FACTION]) === "從者" && !String(data[i][COL.PC.ID]).startsWith("DEAD_")) {
      var loc = String(data[i][COL.PC.LOC] || "");
      // 面板需要顯示目前所在地點(玩家要精準知道去哪找她)、關係標籤＋好感(供玩家決定要不要改標籤)；
      // isHere(是否跟玩家同地點)供商店送禮清單篩選——不在場的人收不到禮物(見Gallery.gs actionPlay
      // 的giftTargetIdx判斷，兩處標準必須一致)。
      current.push({ name: String(data[i][COL.PC.NAME]), tag: String(data[i][COL.PC.REL_TAG] || "點頭之交"), bond: parseInt(data[i][COL.PC.BOND]) || 0, loc: loc, isHere: loc === myLoc });
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
    // 🌍 2026-07「隊伍」概念已拿掉，這裡不再看IS_PARTY——只要這個世界裡「存在」男性從者(多半是
    //   男角全面禁召[§83]之前留下的舊存檔)，就不開放切換成男性玩家，避免悄悄變成不合規的男男配對。
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

// 這個函式現在只可能被鑑賞(慾海)呼叫——solo(按鍵制)走完全獨立的 miniSystem，從不呼叫這裡；
//   唯一呼叫來源是 actionPlay，其 isNsfwMode 恆為 true(全專案已無 'full' 模式呼叫路徑)，故不再
//   分 SFW/NSFW 分支，直接寫死唯一真的會用到的版本。real runtime 上唯一還會變動的「模式」是
//   driveOn(🔥主動掌握)，由 actionPlay 自己組的 driveStr 處理，不在這個函式管轄範圍內。
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
    // 🚶 2026-07「AI提議換地點需玩家同意」定案：這是「提議」不是「已發生」，跟上面location欄
    //   (已經抵達)完全不同時態——填了這欄，narration必須停在邀請/提議的當下，不可先把移動或
    //   抵達寫出來，真正是否移動由玩家事後回應決定。非必填，沒有提議意圖就填空字串，不要每回合
    //   都提議。地點需為下方提供的既有地點名稱之一，避免玩家同意後對不到任何地方。
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
    // 🌍 2026-07「隊伍」概念拿掉：這個世界裡已存在的每個人都各自有自己的位置，不再靠IS_PARTY篩選——
    //   isExact(是否跟玩家同地點)才是「在場」的唯一判準。
    list.push({ id: r[COL.PC.ID], name: r[COL.PC.NAME], isExact: (String(r[COL.PC.LOC] || "") === safeCurL) });
  }
  return list;
}

// 🗾 鑑賞大地圖分區(2026-07 玩家「可愛地圖」升級)：純資料驅動的分區清單，只供UI分組/顯示用，
//   region只是KANSHOU_LOCATIONS_每筆的一個標籤欄位，不影響任何既有比對/抽選邏輯(那些都認
//   location的name，見kanshouRollEncounter_/actionPlay moveTarget比對)。
const KANSHOU_REGIONS_ = [
  { id: 'home', name: '家', desc: '私人空間' },
  { id: 'shinzan', name: '深山町・家附近', desc: '溫馨日常區' },
  { id: 'fuyuki', name: '冬木市中心', desc: '熱鬧生活區' },
  { id: 'harbor', name: '港口・碼頭區', desc: '微涼浪漫區' },
  { id: 'dojo', name: '山林・道場區', desc: '安靜神秘區' },
  { id: 'visit', name: '拜訪住處', desc: '同伴們各自的家' }
];
// 🌸 鑑賞地點清單：純資料驅動的小陣列，不進 MAP 試算表(不跟solo共用坤圖)——之後要加/改地點只動
//   這裡。前端 Script_Kanshou.html 另有一份同名清單純供畫按鈕(改地點時兩邊都要更新)，實際驗證/
//   邏輯只認這裡這份。region對應KANSHOU_REGIONS_的id，純UI分組用。noEncounter:true代表私人
//   空間，恆不觸發陌生人巧遇(見kanshouRollEncounter_呼叫端)，目前「家」分區全部房間皆有此旗標。
//   🏠 2026-07 玩家「衛宮宅」定案：家從5個通用房間擴充成「我的房間＋同住人各自的房間＋客房＋
//   日式庭院空間」，貼合衛宮邸的意象；同住人房間對照見下方KANSHOU_HOUSEMATE_ROOMS_。
const KANSHOU_LOCATIONS_ = [
  { name: '我的房間', region: 'home', desc: '安穩靜謐、只屬於自己的房間。', noEncounter: true },
  { name: '阿爾托莉雅的房間', region: 'home', desc: '整潔到近乎樸素的房間，一絲不苟。', noEncounter: true },
  { name: '間桐櫻的房間', region: 'home', desc: '柔和溫馨、帶著一點靦腆氣息的房間。', noEncounter: true },
  { name: '美杜莎的房間', region: 'home', desc: '安靜低調、鮮少被打擾的房間。', noEncounter: true },
  { name: '客房1', region: 'home', desc: '收拾整齊、隨時能招待客人的空房。', noEncounter: true },
  { name: '客房2', region: 'home', desc: '另一間素雅的空房，堆著幾箱雜物。', noEncounter: true },
  { name: '客廳', region: 'home', desc: '沙發與電視的日常起居空間。', noEncounter: true },
  { name: '廚房', region: 'home', desc: '飄著飯菜香、鍋碗交錯的小廚房。', noEncounter: true },
  { name: '浴室', region: 'home', desc: '水氣氤氳、放鬆卸下一天疲憊的地方。', noEncounter: true },
  { name: '陽台', region: 'home', desc: '能曬到太陽、吹到風的小陽台。', noEncounter: true },
  { name: '庭院', region: 'home', desc: '老日式庭院，草木扶疏、四季各有風景。', noEncounter: true },
  { name: '緣廊', region: 'home', desc: '面向庭院的木質緣廊，適合曬太陽發呆。', noEncounter: true },
  { name: '道場', region: 'home', desc: '鋪著木地板的小道場，牆邊靠著竹刀。', noEncounter: true },
  { name: '玄關', region: 'home', desc: '進出家門的玄關，鞋櫃總是擺得整整齊齊。', noEncounter: true },
  { name: '倉庫', region: 'home', desc: '堆滿雜物與工具的老倉庫，光線昏暗。', noEncounter: true },

  { name: '河邊小徑', region: 'shinzan', desc: '晨昏都靜謐的河堤小徑，水聲潺潺。' },
  { name: '古老神社', region: 'shinzan', desc: '石階盡頭的老神社，香火氣息。' },
  { name: '社區公園', region: 'shinzan', desc: '孩子嬉鬧、長椅斑駁的社區公園。' },
  { name: '深夜便利店', region: 'shinzan', desc: '徹夜燈火通明，深夜歸途的小小驛站。' },

  { name: '咖啡廳', region: 'fuyuki', desc: '磨豆香氣繚繞的小巧咖啡館。' },
  { name: '書店二樓', region: 'fuyuki', desc: '安靜得只聽見翻頁聲的二樓書架間。' },
  { name: '屋頂花園', region: 'fuyuki', desc: '高樓頂上的一方綠意，能望見整座城市。' },
  { name: '商店街', region: 'fuyuki', desc: '人聲鼎沸的商店街，攤販林立。' },
  { name: '電影院附近', region: 'fuyuki', desc: '散場人潮與霓虹招牌交錯的街角。' },

  { name: '海邊步道', region: 'harbor', desc: '海風輕拂，沿岸而行的靜謐步道。' },
  { name: '燈塔下', region: 'harbor', desc: '孤立海岬上的白色燈塔，浪聲不絕。' },
  { name: '港口倉庫區', region: 'harbor', desc: '夜晚燈光昏暗、貨櫃林立的倉庫區。' },
  { name: '小型漁港', region: 'harbor', desc: '漁船進出、鹹濕海風撲面的小漁港。' },

  { name: '老道場', region: 'dojo', desc: '木地板與竹刀氣味的老道場。' },
  { name: '山間小徑', region: 'dojo', desc: '林蔭遮天、只聞鳥鳴的山間小路。' },
  { name: '隱藏溫泉', region: 'dojo', desc: '深藏山林間、鮮少人知的一方溫泉。' },
  { name: '廢棄神社', region: 'dojo', desc: '荒草蔓生、早已無人祭拜的廢棄神社。' },

  // 🚪 2026-07 玩家「我也想要晚上去找他們阿」：把KANSHOU_HERO_HOME_(見下方)裡的獨立住處升格成
  //   真正可造訪的地點——noEncounter:true(私人住處，恆不觸發陌生人巧遇，比照「家」分區)，完全
  //   重用既有moveTarget/留人重逢機制，不新增任何比對邏輯；name務必與KANSHOU_HERO_HOME_的值
  //   逐字一致，否則kanshouRollDailyLocation_骰到的地點對不上這裡就巧遇不到人。阿爾托莉雅/間桐櫻
  //   /美杜莎3位已改用KANSHOU_HOUSEMATE_ROOMS_(住在「我的房間」所在的家)，故這裡不再登記她們
  //   原本的外部住處(騎士團舊宿舍/靜謐宅邸/間桐邸)，衛宮士郎(衛宮邸)已整個移出可召喚名單。
  { name: '老舊公寓', region: 'visit', desc: '巷弄深處的老舊公寓，燈光總是很晚才熄。', noEncounter: true },
  { name: '荒野小屋', region: 'visit', desc: '荒野邊緣的簡樸小屋，煙囪偶爾冒著炊煙。', noEncounter: true },
  { name: '隱蔽的工房', region: 'visit', desc: '隱藏在巷尾、飄著藥草氣味的工房。', noEncounter: true },
  { name: '河畔道場', region: 'visit', desc: '臨河而建的道場，劍聲與水聲交織。', noEncounter: true },
  { name: '荒地帳篷', region: 'visit', desc: '荒地上搭起的一頂帳篷，篝火終夜未熄。', noEncounter: true },
  { name: '高級公寓頂樓', region: 'visit', desc: '俯瞰整座城市的高級公寓頂樓。', noEncounter: true },
  { name: '森林小屋', region: 'visit', desc: '林間深處的木造小屋，掛著獵具與弓箭。', noEncounter: true },
  { name: '軍帳', region: 'visit', desc: '隨性搭起的軍帳，篝火旁總有笑聲。', noEncounter: true },
  { name: '陰暗地下室', region: 'visit', desc: '終年不見天日的陰暗地下室。', noEncounter: true },
  { name: '廢棄倉庫', region: 'visit', desc: '堆滿雜物、鮮少有人涉足的廢棄倉庫。', noEncounter: true },
  { name: '隱密巷弄', region: 'visit', desc: '曲折難尋的隱密巷弄深處。', noEncounter: true },
  { name: '森林深處', region: 'visit', desc: '終年幽暗、人跡罕至的森林深處。', noEncounter: true },
  { name: '城牆邊', region: 'visit', desc: '古老城牆邊的一方空地。', noEncounter: true },
  { name: '島嶼道場', region: 'visit', desc: '孤懸海上、只有濤聲相伴的道場。', noEncounter: true },
  { name: '埃德費爾特宅邸', region: 'visit', desc: '歐風古典的埃德費爾特家宅邸。', noEncounter: true },
  { name: '愛因茲貝倫城', region: 'visit', desc: '終年白雪覆蓋的愛因茲貝倫城堡。', noEncounter: true },
  { name: '遠坂邸', region: 'visit', desc: '老字號魔術師家系的遠坂邸。', noEncounter: true },
  { name: '藤村家', region: 'visit', desc: '熱鬧溫馨、時常傳出笑鬧聲的藤村家。', noEncounter: true }
];
// 🎭 地點×角色 氛圍標籤(資料驅動，往陣列塞一筆 SEED_SERVANTS 的 id 就能加，不動抽選邏輯)：
//   槍兵(庫丘林)刻意塞多個地點——「到處打零工」的浮動人設；其餘角色先各給1~2個貼合形象的地點。
//   2026-07「為何偶遇沒有女性」玩家反映：每個地點額外補一位女性/中性角色，不再是清一色男性。
//   2026-07 玩家再定案：吉爾德萊/百貌哈桑/咒腕之哈桑 3位不用出現在巧遇池(標籤與保底池皆移除)。
//   查無標籤或抽不中標籤池時，退回 KANSHOU_ENCOUNTER_MALE_IDS_+KANSHOU_ENCOUNTER_FEMALE_IDS_
//   全池隨機當保底(隱藏溫泉/屋頂花園等6個地點刻意不建標籤，全靠保底池)。
const KANSHOU_LOCATION_TAGS_ = {
  '河邊小徑': ['庫丘林-Lancer', '斯卡哈-Lancer'],
  '商店街': ['庫丘林-Lancer', '迪盧木多-Lancer', '美遊-Saber'],
  '老道場': ['佐佐木小次郎-Assassin', '斯卡哈-Assassin'],
  '書店二樓': ['伊莉雅-Caster'],
  '古老神社': ['伊斯坎達爾-Rider', '美狄亞-Caster'],
  '社區公園': ['迪盧木多-Lancer', '小黑-Archer'],
  '港口倉庫區': ['庫丘林-Lancer', '蘭斯洛特-Berserker', '美杜莎-Rider'],
  '咖啡廳': ['吉爾伽美什-Archer', '阿爾托莉雅-Saber'],
  '廢棄神社': ['赫拉克勒斯-Berserker', '恩奇都-Lancer'],
  '深夜便利店': ['庫丘林-Lancer', '遠坂凜-Master'],
  '電影院附近': ['藤村大河-Master']
};
// 🎨 2026-07 玩家「拿掉衛宮士郎吧...也禁止召喚他？就當成玩家直接取代他吧？」：衛宮士郎-Master
//   整個移出巧遇/召喚相關名單(KANSHOU_LOCATION_TAGS_/這裡/summon驗證，見actionKanshouSummonHero)，
//   種子資料本體(Seed_Codex.gs)不刪，只是全面禁止在鑑賞出場——玩家本人就是這個位置。
const KANSHOU_ENCOUNTER_MALE_IDS_ = ['EMIYA-Archer', '庫丘林-Lancer', '佐佐木小次郎-Assassin', '赫拉克勒斯-Berserker', '吉爾伽美什-Archer', '迪盧木多-Lancer', '伊斯坎達爾-Rider', '蘭斯洛特-Berserker'];
const KANSHOU_ENCOUNTER_FEMALE_IDS_ = ['阿爾托莉雅-Saber', '美杜莎-Rider', '美狄亞-Caster', '斯卡哈-Lancer', '斯卡哈-Assassin', '美遊-Saber', '小黑-Archer', '伊莉雅-Caster', '恩奇都-Lancer', '遠坂凜-Master', '伊莉雅絲菲爾-Master', '間桐櫻黑化-Master', '藤村大河-Master'];
// 🏠 2026-07 玩家「衛宮宅」定案：阿爾托莉雅/間桐櫻/美杜莎(Rider)3位視為「已經住在這個家」的
//   同住人，深夜/清晨直接回自己在家裡的房間(見上方KANSHOU_LOCATIONS_的'我的房間'/'○○的房間')，
//   不再走這份「外部住處」名單——對照見下方KANSHOU_HOUSEMATE_ROOMS_，兩份表彼此互斥(kanshouRoll
//   DailyLocation_優先查housemate、查無才退回這裡)。
const KANSHOU_HOUSEMATE_ROOMS_ = {
  '阿爾托莉雅-Saber': '阿爾托莉雅的房間',
  '間桐櫻黑化-Master': '間桐櫻的房間',
  '美杜莎-Rider': '美杜莎的房間'
};
// 🌍 同地點AI詳細卡片上限(見actionPlay的partyRows)——3位房客+來訪的人湊在一起時5人夠用，
//   2026-07玩家「吃飯不能5人嗎」定案從3調到5。
const KANSHOU_PARTY_DETAIL_CAP_ = 5;
// 🎭 橋段庫(2026-07新增，玩家「打完自己都知道會怎麼演了根本不好玩」)：跟前面幾個系統指定情境
//   (kanshouKnockGuestStr等)同一種精神——GAS先決定「觸發條件」與「這次走向」，AI只負責照著
//   選中的走向去演出具體細節，玩家不必自己打字下劇本、也不會提前知道結局。之後想加新橋段，
//   往這裡加一筆(觸發條件另外寫在actionPlay對應的動作分支，找不到共通掛點時)即可，不必另開
//   一條平行的敘事管線。branches依bond由高到低排列，取第一個bond達標的當作這次走向。
const KANSHOU_SCENE_EVENTS_ = {
  夜襲: {
    branches: [
      { min: 60, tag: '先是一驚，隨即化為驚喜，帶著歡喜迎接這個不速之客' },
      { min: 30, tag: '嚇了一跳、又驚又羞，嘴上抵抗、卻沒有真的推拒或喊人' },
      { min: -100, tag: '被嚇得繃緊神經、下意識帶著防備，需要玩家主動放軟才能卸下戒心' }
    ]
  },
  // 🌅 2026-07「早餐睡懶覺也上線！！...好感80以上可以色色叫醒」玩家定案：跟夜襲同一套「走進
  //   同住人房間」觸發框架，只是時段換成清晨——她此刻還在賴床，好感夠高才會演成黏人不想起床。
  賴床叫醒: {
    branches: [
      { min: 80, tag: '睡眼惺忪卻格外黏人，緊抓著不放，一副也想拉你一起賴床、捨不得起身的樣子' },
      { min: 40, tag: '被看見還沒睡醒的樣子有些不好意思，睡意未消卻嘴硬要趕人起床' },
      { min: -100, tag: '被突然喚醒嚇了一跳，睡意瞬間清醒、有點防備地拉起被子撐住距離' }
    ]
  },
  // 💰 2026-07「先把肉償機制上線！！」玩家定案：跟房客欠租(KANSHOU_RENT_DEBT_TAG_)配對——玩家
  //   主動提議以此抵租，依bond決定她這次接受的心情走向，不強制往任何具體方向發展。
  肉償: {
    branches: [
      { min: 60, tag: '雖然害臊，卻帶著幾分主動與甘願，用這種方式扛下這筆帳' },
      { min: 30, tag: '滿臉通紅、彆扭又不情願，勉強讓自己配合，嘴上還嫌你壞心眼' },
      { min: -100, tag: '既尷尬又委屈，帶著被逼到牆角的不甘願，卻也知道自己理虧說不出反駁' }
    ]
  }
};
// 🌙🌅 2026-07「同住人房間橋段」依時段對應不同事件(資料驅動，之後想加新時段的房間橋段，往這裡
//   加一組band:eventKey即可，不必再另開一套觸發判斷)：深夜=夜襲、清晨=賴床叫醒。
const KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_ = { '深夜': '夜襲', '清晨': '賴床叫醒' };
// 依bond從KANSHOU_SCENE_EVENTS_挑出這次橋段該走的分支(資料驅動，橋段本身不寫死走向)。
function kanshouRollSceneBranch_(eventKey, bond) {
  const ev = KANSHOU_SCENE_EVENTS_[eventKey];
  if (!ev) return null;
  return ev.branches.find(b => bond >= b.min) || ev.branches[ev.branches.length - 1];
}
// 🏠 2026-07 玩家發現「不同行的人推進一天時會溜到玩家自己家裡」的錯誤（kanshouRollDailyLocation_
//   原本深夜/清晨的homeBias直接回傳KANSHOU_LOCATIONS_裡region==='home'的房間——那是玩家自己的家，
//   不同行的人不該在那裡出現）：改成每位英靈自己的住處(資料驅動，比照KANSHOU_LOCATION_TAGS_同款
//   「往物件加一筆id對應值」寫法)。這些獨立住處字串已同步登記進KANSHOU_LOCATIONS_(region:'visit'，
//   見上方)成為玩家可造訪的真實地點(玩家「我也想要晚上去找他們阿」)，深夜巧遇/主動拜訪共用同一套
//   moveTarget/留人重逢機制；查無資料(如玩家原創英靈)退回通用值「自己的住處」(這個值刻意不登記
//   進KANSHOU_LOCATIONS_，多位角色共用同一個泛用字串會混淆是哪一位，故維持不可造訪)。阿爾托莉雅/
//   間桐櫻/美杜莎已改用KANSHOU_HOUSEMATE_ROOMS_，衛宮士郎已整個移出可召喚名單，故這裡皆不再登記。
const KANSHOU_HERO_HOME_ = {
  'EMIYA-Archer': '老舊公寓',
  '庫丘林-Lancer': '荒野小屋', '美狄亞-Caster': '隱蔽的工房',
  '佐佐木小次郎-Assassin': '河畔道場', '赫拉克勒斯-Berserker': '荒地帳篷',
  '吉爾伽美什-Archer': '高級公寓頂樓', '迪盧木多-Lancer': '森林小屋', '伊斯坎達爾-Rider': '軍帳',
  '吉爾德萊-Caster': '陰暗地下室', '百貌哈桑-Assassin': '廢棄倉庫', '咒腕之哈桑-Assassin': '隱密巷弄',
  '蘭斯洛特-Berserker': '森林深處', '恩奇都-Lancer': '城牆邊', '斯卡哈-Lancer': '島嶼道場',
  '斯卡哈-Assassin': '島嶼道場', '美遊-Saber': '埃德費爾特宅邸', '小黑-Archer': '愛因茲貝倫城',
  '伊莉雅-Caster': '愛因茲貝倫城', '遠坂凜-Master': '遠坂邸', '伊莉雅絲菲爾-Master': '愛因茲貝倫城',
  '藤村大河-Master': '藤村家'
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
// 🎲 巧遇抽選共用邏輯(70%機率)：「出門走走」按鈕跟下面「原地問還有誰」共用同一套加權隨機，
//   不重複寫兩次同一段機率/查找程式碼。查無標籤地點退回男女混合全池保底。excludeIds(hero.id
//   清單)：此局已經正式召喚過(不論是否仍同行)的英靈——已有真實好感/羈絆記錄，不該又以「陌生人」
//   身分重複出現(如：SABER已同行時，路上不該再巧遇一位不具名的SABER)，故排除在骰池外。
function kanshouRollEncounter_(locName, excludeIds) {
  const excl = excludeIds || [];
  const tagPool = KANSHOU_LOCATION_TAGS_[locName] || [];
  const basePool = tagPool.length ? tagPool : KANSHOU_ENCOUNTER_MALE_IDS_.concat(KANSHOU_ENCOUNTER_FEMALE_IDS_);
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
// 🌙 2026-07 玩家「晚上也要有人會在外遊蕩（即使是住在家裡的？大概10%？)」：同住人(KANSHOU_
//   HOUSEMATE_ROOMS_)深夜/清晨睡不著出門走走的機率，獨立於一般英靈的homeBias，資料只存一處。
const KANSHOU_HOUSEMATE_WANDER_CHANCE_ = 0.1;
// 🎲 結束一天/推進時間(2026-07「不讓玩家指派，直接GAS判定」定案，hour參數為後續「推進時間」補充)：
//   幫「不在身邊」的英靈決定當下要去哪——反查KANSHOU_LOCATION_TAGS_裡有沒有哪些地點標到這位
//   英靈的id(她平常會去的地方)，有就加權隨機挑一個；沒被任何地點標到就從全部地點隨機挑。
//   hour(選填)：有傳時刻時，深夜/清晨時段大機率改留在「自己房間」——2026-07玩家定案「Saber/櫻/
//   Rider是住在衛宮宅的同住人，該有自己的房間」：先查KANSHOU_HOUSEMATE_ROOMS_(住在這個家、有
//   專屬房間的人)，沒有才退回KANSHOU_HERO_HOME_(還沒搬進來、在外面有自己住處的人)，兩者都沒有
//   才是通用值；其餘時段沿用原本haunts邏輯不變；不傳(舊呼叫端)則完全比照改動前的行為。
//   🌙 同住人另外反著骰：預設KANSHOU_HOUSEMATE_WANDER_CHANCE_機率跳過「回房間」、改走下面
//   haunts/全地點池(在外遊蕩)，讓「晚上敲門找不到人」也可能發生在自家人身上。
function kanshouRollDailyLocation_(heroName, hour) {
  const heroId = kanshouHeroIdByName_(heroName);
  const housemateRoom = heroId && KANSHOU_HOUSEMATE_ROOMS_[heroId];
  if (hour !== undefined && hour !== null) {
    const band = timeBand_(hour);
    const homeBias = band === '深夜' ? 0.85 : (band === '清晨' ? 0.5 : 0);
    if (homeBias > 0) {
      if (housemateRoom) {
        if (Math.random() >= KANSHOU_HOUSEMATE_WANDER_CHANCE_) return housemateRoom;
      } else if (Math.random() < homeBias) {
        return (heroId && KANSHOU_HERO_HOME_[heroId]) || '自己的住處';
      }
    }
  }
  const haunts = heroId ? Object.keys(KANSHOU_LOCATION_TAGS_).filter(loc => KANSHOU_LOCATION_TAGS_[loc].includes(heroId)) : [];
  // 🌙 全地點保底池排除'home'分區(玩家自宅私人房間)——不同行的英靈(含在外遊蕩的同住人)不該
  //   隨機骰進玩家或其他人的臥室，那些只能靠「拜訪」主動走進去，不是隨機亂晃能撞到的地方。
  const pool = haunts.length ? haunts : KANSHOU_LOCATIONS_.filter(l => l.region !== 'home').map(l => l.name);
  return pool[Math.floor(Math.random() * pool.length)];
}
// 🍳 2026-07「時段行動」骨架的第一個動作：清晨限定的「準備早餐」，幫3位房客各自骰一次今早
//   去向——GAS掌機率(DESIGN.md鐵律)，AI只依骰出的結果演出，不自己決定誰起床誰賴床。跟一般
//   kanshouRollDailyLocation_不同：這裡「出門」是確定結果(不套用該函式的清晨homeBias，否則
//   5%出門會被homeBias蓋回房間，機率名不符實)。
const KANSHOU_BREAKFAST_KITCHEN_CHANCE_ = 0.85; // 下樓吃早餐
const KANSHOU_BREAKFAST_OWNROOM_CHANCE_ = 0.10; // 還在賴床(剩餘0.05＝已經自己出門了)
function kanshouRollBreakfastSpot_() {
  const r = Math.random();
  if (r < KANSHOU_BREAKFAST_KITCHEN_CHANCE_) return 'kitchen';
  if (r < KANSHOU_BREAKFAST_KITCHEN_CHANCE_ + KANSHOU_BREAKFAST_OWNROOM_CHANCE_) return 'ownRoom';
  return 'out';
}
// 🎊 2026-07「跳到節慶」玩法(玩家「還想再做一個日期選擇，想體驗什麼時段的劇情就可以去調整，可能
//   想跟他們過年或七夕」→再考慮後「我覺得加年月日會比較好...抓個3年的區間就好」)：真正的西曆
//   年/月/日(每年固定365天、不算閏年，遊戲用途夠精準)，只抓3年區間(見actionPlay的advanceHours
//   上限)不追求無限年份。Day1固定對應12月28日(玩家「開局是跨年前！可以逛幾天後31準備一起跨年」
//   ——28/29/30三天日常後，第4天自然就是KANSHOU_FESTIVALS_裡的跨年夜12/31，不必特地跳)。
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
// 算「從現在」到「下一次」某月日的小時數——已經錯過今年這天就自動算成明年(deltaDays<=0時+365)。
function kanshouHoursUntilDate_(curDay, curHour, targetMonth, targetDay) {
  const startOff = kanshouDoyOffset_(KANSHOU_CAL_START_MONTH_, KANSHOU_CAL_START_DAY_);
  const curDoy = (startOff + (curDay - 1)) % 365;
  const targetDoy = kanshouDoyOffset_(targetMonth, targetDay);
  let deltaDays = targetDoy - curDoy;
  if (deltaDays <= 0) deltaDays += 365;
  return deltaDays * 24 - curHour;
}

// ⏰ 2026-07「跳到時段感覺比較好」玩家定案：比起「推進N小時」(玩家得自己心算會落在哪個時段)，
//   改成直接選「跳到清晨/午後/黃昏/夜/深夜」，GAS算好差幾小時再丟進既有advanceHours管線——跟
//   跳到節慶(kanshouHoursUntilDate_)同一種「單一真實來源在後端」寫法。已在目標時段時一律跳「下
//   一次」(比照節慶邏輯，不會出現按了沒反應的按鈕)。startHour對應timeBand_(Time_World.gs)的
//   5段分界，兩處改動要保持同步。
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
// 🕰️ 2026-07「跳到時段」＋「時段行動」按鈕都需要前端知道現在幾點——鑑賞借用solo既有的COL.PC.
//   DAY/HOUR欄位存自己的時鐘(見actionPlay同款預設值)，這裡統一格式化成單一真實來源，buildClientState_
//   /actionPlay的回應都呼叫這支，不各自重複拼字串。
function kanshouClockInfo_(pcRow) {
  const day = parseInt(pcRow[COL.PC.DAY]) || 1;
  const hour = (pcRow[COL.PC.HOUR] === "" || pcRow[COL.PC.HOUR] == null) ? 8 : (parseInt(pcRow[COL.PC.HOUR]) || 0);
  const band = timeBand_(hour);
  return { day: day, hour: hour, band: band, label: "第 " + day + " 日・" + ("0" + hour).slice(-2) + ":00・" + band };
}

// 💰 2026-07「真的要賺錢、要付住宿費」玩家定案：推翻2026-06經濟全砍決定，僅鑑賞(kanshou)恢復一套
//   GAS掌數值(DESIGN.md鐵律：GAS掌數值、AI只說書)的極簡經濟層——固定金額，不靠AI亂喊數字。
const KANSHOU_START_MONEY_ = 3000; // 開局起始金錢
const KANSHOU_WAGE_ = 800;         // 打工一次的固定薪資
const KANSHOU_WORK_HOURS_ = 4;     // 打工一次消耗的時數(比照advanceHours機制推進時鐘，非同行英靈依新時刻重骰去向)
const KANSHOU_UPKEEP_ = 1500;      // 每週維護及食材費(每7天扣一次，2026-07玩家「這改成維護及食材費用」從房租改名)
const KANSHOU_TENANT_RENT_ = 800;  // 2026-07「房東房客」定案：每位入住房客每週繳的房租(每7天收一次)
// 2026-07「如果都一直有錢要怎麼肉償」玩家提案：房客每次結算有機率這週繳不出房租(GAS骰、非玩家
//   能操控)，先只做「這次交不出」的判定跟氛圍提示，不寫死後續一定要走「肉償」——之後真的要做
//   肉償橋段時，直接檢查這次的shortNames清單當觸發條件即可，不必回頭改這裡。
const KANSHOU_TENANT_SHORT_CHANCE_ = 0.2;
// 🚪 2026-07「睡覺時機率有人來敲門」玩家定案：結束一天(準備就寢)時的機率事件，命中就先不推進
//   日期、改讓前端跳出開門/不予理會，跟維護費/薪資一樣是GAS決定觸發與否，不靠AI敘事判斷。
const KANSHOU_KNOCK_CHANCE_ = 0.2;  // 每次「結束一天」的敲門機率

// 維護費結算：依「新的一天」的絕對天數換算週數，跨過新一週才扣款；一次可補扣欠的多週(節慶快轉等大跳躍
//   場景)，不逐週迭代。回傳這次實際扣了多少錢(0＝這次沒跨週、不扣)，供上層組提示詞用的flavor文字。
function kanshouChargeUpkeep_(pcData, pcIndex, newDay) {
  const newWeek = Math.floor((newDay - 1) / 7);
  const oldWeek = parseInt(pcData[pcIndex][COL.PC.UPKEEP_WEEK]) || 0;
  if (newWeek <= oldWeek) return 0;
  const amount = (newWeek - oldWeek) * KANSHOU_UPKEEP_;
  pcData[pcIndex][COL.PC.MONEY] = (parseInt(pcData[pcIndex][COL.PC.MONEY]) || 0) - amount;
  pcData[pcIndex][COL.PC.UPKEEP_WEEK] = newWeek;
  return amount;
}

// 🏠 2026-07「房東房客」定案(玩家「全套！好感30起跳 其他人都先10？」)：房客(KANSHOU_HOUSEMATE_
//   ROOMS_登記的3位)每週繳房租給玩家，收支邏輯對稱於kanshouChargeUpkeep_——玩家自己的維護費
//   扣款存在玩家列的COL.PC.UPKEEP_WEEK，這裡則重複利用「每一位房客自己那一列」的同一個欄位存
//   「這位房客自己上次繳到第幾週」，不新增欄位(COL是位置索引，能重複利用同一格語意就別加新格)。
//   房客不論此刻是否同行都算「住在這裡」(跟kanshouRollDailyLocation_房間分配同一套認定)，只要
//   此局曾經建立過她的資料列就持續收租；只掃同一個game_id(gameId空字串時比照sameGame同款寬鬆
//   比對，相容沒有game_id的舊角色)，避免收到別的玩家局裡的房客租金。回傳這次實際收到多少錢
//   (0＝這次沒有任何房客跨過新一週)＋這次交不出房租的房客姓名清單，供上層組提示詞用的flavor文字。
//   dirtyPcRows(呼叫端的Set)：這裡會改到「房客自己那一列」的UPKEEP_WEEK/MEMORY，該列若剛好是
//   同行同伴、又剛好是走「推進時間」(不像結束一天/離隊重骰兩處那樣本來就會把同行同伴的列加進
//   dirty)，就不會有任何其他地方順手加過——必須自己補，否則這裡的修改只停在記憶體、從未真正
//   寫回試算表(2026-07新增肉償欠租旗標時發現這個既有缺口一併修掉)。
function kanshouCollectTenantRent_(pcData, pcIndex, newDay, gameId, dirtyPcRows) {
  const newWeek = Math.floor((newDay - 1) / 7);
  let total = 0;
  const shortNames = [];
  Object.keys(KANSHOU_HOUSEMATE_ROOMS_).forEach(heroId => {
    const hero = SEED_SERVANTS.find(h => h.id === heroId);
    if (!hero) return;
    const idx = pcData.findIndex((r, i) => i !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!gameId || String(r[COL.PC.GAME_ID] || "") === gameId) && kanshouNameCandidates_(hero.realName).includes(String(r[COL.PC.NAME])));
    if (idx === -1) return;
    const oldWeek = parseInt(pcData[idx][COL.PC.UPKEEP_WEEK]) || 0;
    if (newWeek <= oldWeek) return;
    pcData[idx][COL.PC.UPKEEP_WEEK] = newWeek; // 不論繳不繳得出，這次結算都算過關，不累積欠款複利
    dirtyPcRows.add(idx);
    if (Math.random() < KANSHOU_TENANT_SHORT_CHANCE_) {
      shortNames.push(String(pcData[idx][COL.PC.NAME]));
      pcData[idx][COL.PC.MEMORY] = KANSHOU_RENT_DEBT_TAG_.set(pcData[idx][COL.PC.MEMORY], '是');
      return;
    }
    total += (newWeek - oldWeek) * KANSHOU_TENANT_RENT_;
    // 💰 這次準時繳清了，清掉可能殘留的舊欠租旗標(不論是自然繳清、還是玩家先前已用肉償橋段抵過)。
    if (KANSHOU_RENT_DEBT_TAG_.get(pcData[idx][COL.PC.MEMORY])) pcData[idx][COL.PC.MEMORY] = KANSHOU_RENT_DEBT_TAG_.set(pcData[idx][COL.PC.MEMORY], '');
  });
  if (total > 0) pcData[pcIndex][COL.PC.MONEY] = (parseInt(pcData[pcIndex][COL.PC.MONEY]) || 0) + total;
  return { total, shortNames };
}

// 🌙 2026-07「晚上10點強制回家/也可以在外面過夜」玩家定案：不真的強制，改成到了宵禁時段(22:00~
//   06:00)、人又不在家時，回應夾curfewPrompt讓前端跳出「回家/留在外面過夜」提醒(比照knockEvent
//   同款「GAS決定觸發，前端渲染選擇」，不是AI敘事判斷)。選「留在外面過夜」當天不再重複提醒
//   (存這遊戲日已知會過，跨日靠curDay變動自然重置，不必額外清除邏輯)。
function kanshouCurfewDismissed_(memory, day) {
  const m = String(memory || "").match(/【宵禁已知會】(\d+)/);
  return !!(m && parseInt(m[1]) === day);
}
function kanshouDismissCurfew_(memory, day) {
  const s = String(memory || "").replace(/｜?【宵禁已知會】\d+/, "");
  return (s ? s + "｜" : "") + "【宵禁已知會】" + day;
}

// 🛍️ 2026-07 商店 Phase 2(玩家「都想要呢！」追加開店購物/好感禮物)：資料驅動品項表(範本比照
//   KANSHOU_LOCATIONS_/KANSHOU_FESTIVALS_，加東西＝加一列，不動流程)。type:'decor'買了持久佈置
//   在家(存玩家MEMORY【家居裝飾】清單)；type:'gift'買了直接送給指定同行夥伴，好感依bond固定值
//   增加(GAS掌數值，不靠AI喊好感漲多少)。價格/好感值皆為玩家可事後調整的平衡數字，非AI決定。
const KANSHOU_SHOP_ITEMS_ = [
  { id: 'sofa', name: '舒適沙發', price: 1200, type: 'decor', desc: '一張柔軟舒適的沙發' },
  { id: 'painting', name: '風景畫', price: 800, type: 'decor', desc: '一幅寧靜的風景掛畫' },
  { id: 'plant', name: '盆栽', price: 400, type: 'decor', desc: '一盆翠綠的小盆栽' },
  { id: 'lamp', name: '暖光檯燈', price: 600, type: 'decor', desc: '溫暖柔和的檯燈' },
  { id: 'rug', name: '地毯', price: 900, type: 'decor', desc: '柔軟厚實的地毯' },
  { id: 'flowers', name: '花束', price: 300, type: 'gift', bond: 3, desc: '一束新鮮的花束' },
  { id: 'sweets', name: '手工點心', price: 500, type: 'gift', bond: 4, desc: '一盒精緻的手工點心' },
  { id: 'book', name: '珍藏書籍', price: 700, type: 'gift', bond: 5, desc: '一本值得珍藏的書籍' },
  { id: 'accessory', name: '髮飾', price: 1000, type: 'gift', bond: 6, desc: '一款雅緻的髮飾' },
  { id: 'necklace', name: '項鍊', price: 1500, type: 'gift', bond: 8, desc: '一條精緻的項鍊' }
];
// 家居裝飾借用Core_Settings.gs的makeTextTag_文字型工廠(MEMORY【】｜慣例)，但要塞「清單」而非
//   單一值，故外面包一層拆分/去重/重組，set本身仍是工廠既有的整段覆寫，不需另開新工廠形狀。
var KANSHOU_DECOR_TAG_ = makeTextTag_('家居裝飾');
function kanshouAddDecor_(memory, itemName) {
  const cur = KANSHOU_DECOR_TAG_.get(memory);
  const arr = cur ? cur.split('、').map(s => s.trim()).filter(Boolean) : [];
  if (arr.indexOf(itemName) === -1) arr.push(itemName);
  return KANSHOU_DECOR_TAG_.set(memory, arr.join('、'));
}
// 🌅 2026-07「隔天早上吃飯劇情就很好看」玩家定案：好感≥80觸發同床共枕的那次結束一天，順手記一筆
//   「今晚共度良宵的對象」，下一回合(不論玩家做什麼)讀一次就清掉(一次性旗標，比照makeTextTag_
//   .set('')清空)，餵進提示詞當★【晨間餘韻】引子——只在「緊接著的下一回合」出現，不會每天糾纏。
//   刻意不斷言「一定發生了」，交給AI依上一回合實際演出內容判斷要不要接續，避免跟角色一致性/
//   慾海律令(不強制每次都寫到底)打架。
var KANSHOU_MORNING_AFTER_TAG_ = makeTextTag_('晨間餘韻');
// 💰 2026-07「先把肉償機制上線！！」玩家定案：存在房客自己那一列的MEMORY(不是玩家列)，標記「這位
//   房客目前欠著這期房租」——由kanshouCollectTenantRent_短繳時設值，下次她準時繳清或玩家發起
//   肉償橋段後清空(見actionPlay的debtPayment處理)。純粹是/否旗標，不記金額(欠多少已經不重要，
//   房租本就不逐週累積複利，見§88)。
var KANSHOU_RENT_DEBT_TAG_ = makeTextTag_('欠租');
// 🎲 Phase3 輕量小事件(2026-07「可愛地圖」升級)：抵達新地點時20%機率抽一顆短句靈感種子注入
//   提示詞，純粹給AI參考的引子(非預寫劇本、非強制發生)，AI可完全不理會，也可自然融入敘事。
//   分三類：日常可愛/曖昧小互動 恆定開放，色氣類僅driveOn(主動掌握模式)開啟時才會抽到。
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
// 🏷️ MEMORY標記存取器【住所】：玩家自訂的「家」顯示名稱。查無標記時預設「衛宮宅」(2026-07
//   玩家「我想要住在衛宮家」定案，鎖定世界觀預設值；玩家仍可隨時改名，只是不再預設空泛的「家」)，
//   比照 getOutfit_/setOutfit_ 同款「清除舊值再整段append」寫法。
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

  // 🌹 慾海(KPC_ 御主)專用引擎：前端自由聊天輸入框只在 pc.mode==='kanshou' 才顯示，鑑賞玩家
  //   pcId 恆為 KPC_ 前綴，全專案已無路徑把 pc.mode 設為 'full'——這裡不會再有 solo 呼叫路徑，
  //   入口直接擋下非 KPC_ 呼叫，函式其餘部分永遠當作鑑賞情境處理，不再分支。
  if (String(pcId || "").indexOf("KPC_") !== 0) return JSON.stringify({ text: "此功能僅限鑑賞使用。", people: [] });
  // 🔥 主動掌握開關：real runtime 上唯一還會變動的「模式」。
  const driveOn = (userData.drive === true || String(userData.drive) === "true");
  // 🚪 巧遇開關：前端「出門走走」面板可關閉「路上巧遇陌生人」——只影響下方隨機巧遇擲骰，不影響
  //   已在場的【邂逅中】對象持續互動、也不影響同行隊伍成員。前端沒帶這欄時預設仍是開啟。
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

  // 🌸 鑑賞地點移動：前端點選地點按鈕時帶 moveTarget，跟一般對話同一次 round-trip 解決——比對
  //   KANSHOU_LOCATIONS_ 合法地點清單，查無效比對一律當成普通對話。
  // 🏠 2026-07「家」升級成跟其他分區並列的一個分區(region:'home')：我的房間/同住人房間/客房/
  //   客廳/廚房/浴室/陽台/庭院等都是KANSHOU_LOCATIONS_裡的普通地點(noEncounter:true代表私人
  //   空間、不觸發陌生人巧遇)，走一般moveTarget比對即可，不再需要獨立特判。getKanshouHomeName_/
  //   setKanshouHomeName_只供前端「家」分區分頁標籤的自訂顯示名稱使用，不影響這裡的地點驗證。
  // 🍳「準備早餐」＝移動到廚房，複用moveTarget整套既有管線(清巧遇/寫LOC/事件種子)，不另開一條
  //   平行的地點切換路徑——只是這次的目的地由GAS直接指定，不聽前端傳的userData.moveTarget。
  const isBreakfast_ = userData.prepBreakfast === true;
  const moveTarget = isBreakfast_ ? KANSHOU_LOCATIONS_.find(l => l.name === '廚房') : KANSHOU_LOCATIONS_.find(l => l.name === String(userData.moveTarget || "").trim());
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
  // 🛋️ 2026-07 商店買的家居裝飾清單，給AI在「家」相關場景自然帶入(show-don't-tell，僅供參考、
  //   非強制每次都提及)，跟myOutfit同一種「餵事實、不代寫敘事」的做法。
  const myDecor = KANSHOU_DECOR_TAG_.get(pc[COL.PC.MEMORY]);
  // 🌅 晨間餘韻：讀一次(上一回合結束一天留下的旗標，若有)就立刻清掉，只讓「緊接著的下一回合」
  //   吃到這個提示詞引子，不論這回合玩家做什麼(聊天/移動/購物皆可)。
  const morningAfterNames = KANSHOU_MORNING_AFTER_TAG_.get(pc[COL.PC.MEMORY]);
  if (morningAfterNames) pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');

  // 🔵 實例化：只取自己 game_id 世界內、同地點的人（御主無 game_id 時不過濾，相容舊角色）
  const myGameId = pc && pc[COL.PC.GAME_ID] ? String(pc[COL.PC.GAME_ID]) : "";
  const sameGame = (r) => !myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId;

  // 🎭 橋段·夜襲/賴床叫醒(2026-07「跳出色色選項詢問是否色色」玩家定案，從「移動進房間就直接演出」
  //   改成「先問過玩家再演出」)：候選人只認「這位房客的LOC是否真的等於這次要去的地點」，不看
  //   任何「隊伍」狀態(2026-07「加入這個世界的感覺」定案後，每個人的LOC都是獨立的，不會被玩家
  //   移動強制拖走，故這裡不必再擔心LOC被悄悄同步過的問題)。按鈕(roomEventOffer，見回合末)在
  //   候選人存在期間持續可用，玩家點下去(userData.roomEventAccept)才真正骰一次走向，不點就只是
  //   繼續聊天——聊幾句不影響candidate資格，直到她的LOC真的變動(自己的生活骰到別處/玩家移動
  //   去別的地方)才會消失。
  const kanshouRoomEventTargetLoc_ = moveTarget ? moveName : curL;
  const kanshouRoomEventKey_ = KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_[timeBand_(curHour)];
  let kanshouRoomEventCandidate_ = null;
  if (kanshouRoomEventKey_) {
    const _reHeroId = Object.keys(KANSHOU_HOUSEMATE_ROOMS_).find(hid => KANSHOU_HOUSEMATE_ROOMS_[hid] === kanshouRoomEventTargetLoc_);
    const _reHero = _reHeroId ? SEED_SERVANTS.find(h => h.id === _reHeroId) : null;
    const _reIdx = _reHero ? pcData.findIndex((r, i) => i !== pcIndex && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.LOC] || "").trim() === kanshouRoomEventTargetLoc_ && kanshouNameCandidates_(_reHero.realName).includes(String(r[COL.PC.NAME]))) : -1;
    if (_reIdx !== -1) kanshouRoomEventCandidate_ = { eventKey: kanshouRoomEventKey_, hero: _reHero, idx: _reIdx };
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

  // 🚪 2026-07「睡覺時機率有人來敲門」：結束一天(準備就寢)前先擲一次骰，命中就不執行日期推進，
  //   直接回傳knockEvent讓前端跳出「開門/不予理會」——玩家選「不予理會」會帶skipKnockCheck重送
  //   一次結束一天(跳過這次判定，直接推進日期)；選「開門」則帶knockAccept把訪客接來(見下)。
  //   候選池限「此局已建立資料列、此刻不在玩家所在地」的舊識，跟留人重逢共用同一種「有名有姓的
  //   熟人」精神，不會憑空生出一個從未召喚過的陌生人半夜敲門。
  if (userData.endDay === true && !userData.skipKnockCheck) {
    const knockPool = pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.LOC] || "").trim() !== curL && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
    if (knockPool.length && Math.random() < KANSHOU_KNOCK_CHANCE_) {
      const visitor = knockPool[Math.floor(Math.random() * knockPool.length)];
      return JSON.stringify({ text: "正準備歇下的時候，忽然聽見一陣輕輕的敲門聲……", knockEvent: String(visitor[COL.PC.NAME]), people: [] });
    }
  }

  // 🚪 開門迎接深夜訪客(knockEvent選擇「開門」)：把訪客接來玩家現在的位置，本回合可指名互動
  //   (例外，比照下方kanshouReunionStr同款寫法)，不推進日期——訪客只是這回合出現，玩家想睡
  //   再自己重新點一次「結束一天」即可(會再擲一次骰，是否又敲門純機率、不特別排除)。
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

  // 🛍️ 2026-07 商店：買裝飾品/送禮物給同行夥伴。金額不足/品項不存在/送禮對象不在場——這些是
  //   GAS已經能確定答案的驗證失敗，直接回傳、不浪費一次AI呼叫；成功則組finalUserMsg照樣走完整
  //   敘事管線(比照打工/結束一天，複用既有pipeline，不另開一條平行路徑)。
  if (userData.buyItem) {
    const shopItem = KANSHOU_SHOP_ITEMS_.find(it => it.id === String(userData.buyItem));
    if (!shopItem) return JSON.stringify({ text: "這裡沒有這件商品。", people: [] });
    const curMoney = parseInt(pc[COL.PC.MONEY]) || 0;
    if (curMoney < shopItem.price) return JSON.stringify({ text: `身上的錢不太夠呢……還差${shopItem.price - curMoney}円才買得起「${shopItem.name}」。`, people: [] });
    if (shopItem.type === 'gift') {
      const giftTargetName = String(userData.giftTarget || "").trim();
      const giftTargetIdx = pcData.findIndex(r => kanshouNameCandidates_(r[COL.PC.NAME]).includes(giftTargetName) && String(r[COL.PC.LOC] || "").trim() === curL && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
      if (giftTargetIdx === -1) return JSON.stringify({ text: "對方現在不在身邊，沒辦法把禮物送出去。", people: [] });
      pcData[pcIndex][COL.PC.MONEY] = curMoney - shopItem.price;
      const oldBond = parseInt(pcData[giftTargetIdx][COL.PC.BOND]) || 0;
      pcData[giftTargetIdx][COL.PC.BOND] = Math.max(-100, Math.min(100, oldBond + shopItem.bond));
      kanshouSyncRelTier_(pcData, giftTargetIdx);
      dirtyPcRows.add(giftTargetIdx);
      finalUserMsg = `【玩家意圖】：花費${shopItem.price}円買了「${shopItem.name}」，送給了「${giftTargetName}」。`;
    } else {
      pcData[pcIndex][COL.PC.MONEY] = curMoney - shopItem.price;
      pcData[pcIndex][COL.PC.MEMORY] = kanshouAddDecor_(pcData[pcIndex][COL.PC.MEMORY], shopItem.name);
      finalUserMsg = `【玩家意圖】：花費${shopItem.price}円買了「${shopItem.name}」，帶回家佈置。`;
    }
  }

  // 📅 結束一天(userData.endDay===true，2026-07「文字經營」玩法定案「不讓玩家指派，直接GAS判定」)：
  //   忽略玩家打的文字，改用系統組好的合成訊息——複用actionPlay整條既有敘事管線(在場驗證/NSFW
  //   規則/rel_changes/intimacy_feedback全部照常跑)，不另開一條平行路徑。
  //   ①不在身邊的英靈(非同行)：GAS直接幫她們決定隔天去哪(kanshouRollDailyLocation_，依既有的
  //   地點×角色氛圍標籤加權挑常去的地方，查無標籤才隨機)，玩家不用手動指派——她們各自過各自
  //   的生活，下次玩家去哪個地點就可能巧遇當天在那裡的人(見留人重逢/巧遇邏輯)。
  //   ②同行同伴：跟玩家一起被強制拉回家過夜(見下)。
  // 💰 2026-07 經濟層：這次呼叫若跨過維護費結算週，這裡記下實際扣款金額，供下方提示詞組flavor文字；
  //   兩個分支(結束一天/推進時間)都會推進curDay，故upkeepCharged在if/else外先宣告、各自賦值。
  let upkeepCharged = 0;
  // 🏠 2026-07「房東房客」定案：房客繳租跟玩家繳維護費同一套週結算節奏，故一併在if/else外先宣告。
  let tenantRentCollected = 0;
  let tenantShortNames = [];
  // 💕 2026-07「好感沒到80不能同行睡覺」玩家定案：只有結束一天(真的要過夜)才判定，推進時間/打工
  //   不觸發(那些不是「睡下去」的動作)。比照既有羈絆里程碑(30/60/90)同款「GAS掌門檻、AI只說書」
  //   精神——門檻由GAS算好，AI只負責依角色性格自然演繹要不要跨出這一步、演到多深。
  let intimateNightNames = [];
  if (userData.endDay === true) {
    // ⏰ 2026-07：結束一天固定跳到「隔天清晨6點」(不論此刻幾點，2026-07玩家「早上6點要開始準備
    //   早餐」定案從8點提早)，時鐘跟著寫回，往後「推進時間」(見下)、鑑賞主敘事的時段感提示才有
    //   真實的日/時可讀，不再只是純敘事、沒有實際時鐘的空話。
    curDay = curDay + 1;
    curHour = 6;
    pcData[pcIndex][COL.PC.DAY] = curDay;
    pcData[pcIndex][COL.PC.HOUR] = curHour;
    upkeepCharged = kanshouChargeUpkeep_(pcData, pcIndex, curDay);
    { const tr_ = kanshouCollectTenantRent_(pcData, pcIndex, curDay, myGameId, dirtyPcRows); tenantRentCollected = tr_.total; tenantShortNames = tr_.shortNames; }
    // 🌍 2026-07「加入這個世界的感覺」玩家定案：不再分「同行/不同行」，這個世界裡所有已存在的
    //   英靈結束一天都一律依自己的生活重新決定要去哪(kanshouRollDailyLocation_，住人回自己房間／
    //   外人回自己家)——唯一例外是好感≥80且此刻確實跟玩家同地點的人，直接留在玩家房間過夜(同床
    //   共枕)。不再有「玩家帶著誰過夜、誰輪流分配客房」這種隊伍式的房間分配，客房1/客房2仍是
    //   合法地點，只是不再靠這裡自動塞人進去。
    const allEstablished = pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
    intimateNightNames = allEstablished.filter(r => (parseInt(r[COL.PC.BOND]) || 0) >= 80 && String(r[COL.PC.LOC] || "").trim() === curL).map(r => r[COL.PC.NAME]);
    if (intimateNightNames.length) pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], intimateNightNames.join('、'));
    // 🏠 玩家自己不管白天晃到哪(含忽略AI提議、放置不理原地發呆)，結束一天一律強制拉回自己房間——
    //   這是「玩家永遠有路可退」的安全閥，不必特判「玩家到底有沒有理某個提議」。
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
    // ⏰ 2026-07「推進時間」玩法(玩家「有一個推進時間按鈕，可以控制NPC所在地點？按下去可能推進
    //   幾小時，NPC會依照時段移動到不同地活動」)：跟結束一天不同——不強制拉玩家回家，只是單純
    //   讓時鐘往前跳N小時；不在身邊的英靈依新時刻重骰去向(深夜/清晨時段kanshouRollDailyLocation_
    //   會偏向在家，見下)，同行同伴不受影響(位置本就跟玩家同步)。上限抓3年區間防呆，不做逐小時
    //   模擬(跳多久都是O(1)：直接算最終時刻，不必一小時一小時迭代)。
    // 💼 2026-07「打工賺錢」玩法：跟結束一天/推進時間共用同一套時鐘推進機制(work視為固定4小時的
    //   一次時間推進，非同行英靈依新時刻重骰去向)，只是額外多做「發薪水」這一步，不另開一條時鐘
    //   平行路徑；work旗標與advanceHours/jumpFestival互斥(打工優先，同一次呼叫不會疊加判斷)。
    const isWork = userData.work === true;
    let advanceHours = isWork ? KANSHOU_WORK_HOURS_ : Math.max(0, Math.min(parseInt(userData.advanceHours) || 0, 24 * 365 * 3));
    // 🎊「跳到節慶」：advanceHours未指定時，改由jumpFestival算出「到下一次該節慶還有幾小時」，
    //   算好就丟進同一套邏輯，不重複寫一次時鐘推進/地點重骰。
    if (!isWork && !advanceHours && userData.jumpFestival) {
      jumpFest = KANSHOU_FESTIVALS_.find(f => f.key === String(userData.jumpFestival)) || null;
      if (jumpFest) advanceHours = kanshouHoursUntilDate_(curDay, curHour, jumpFest.month, jumpFest.day);
    }
    // ⏰「跳到時段」：跟跳到節慶互斥判斷同一順位，advanceHours/jumpFestival都沒指定時才輪到它。
    let jumpBand = null;
    if (!isWork && !advanceHours && !jumpFest && userData.jumpBand) {
      jumpBand = KANSHOU_TIME_BANDS_.find(b => b.key === String(userData.jumpBand)) || null;
      if (jumpBand) advanceHours = kanshouHoursUntilBand_(curHour, jumpBand.startHour);
    }
    if (advanceHours > 0) {
      const clk = { day: curDay, hour: curHour };
      rollHours_(clk, advanceHours);
      curDay = clk.day; curHour = clk.hour;
      pcData[pcIndex][COL.PC.DAY] = curDay;
      pcData[pcIndex][COL.PC.HOUR] = curHour;
      upkeepCharged = kanshouChargeUpkeep_(pcData, pcIndex, curDay);
      { const tr_ = kanshouCollectTenantRent_(pcData, pcIndex, curDay, myGameId, dirtyPcRows); tenantRentCollected = tr_.total; tenantShortNames = tr_.shortNames; }
      // 🌍 2026-07「加入這個世界的感覺」：推進時間一樣不分「同行/不同行」，世界裡所有已存在的
      //   英靈都依新時刻重骰去向(深夜/清晨時段kanshouRollDailyLocation_會偏向在家)。
      const allEstablishedForTime = pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
      allEstablishedForTime.forEach(r => {
        const idx = pcData.indexOf(r);
        pcData[idx][COL.PC.LOC] = kanshouRollDailyLocation_(r[COL.PC.NAME], curHour);
        dirtyPcRows.add(idx);
      });
      const newDate = kanshouAbsDayToDate_(curDay);
      if (isWork) {
        // 薪水固定金額入帳(GAS掌數值)，narration由AI依角色/地點自由發揮打工場景(AI只說書)。
        pcData[pcIndex][COL.PC.MONEY] = (parseInt(pcData[pcIndex][COL.PC.MONEY]) || 0) + KANSHOU_WAGE_;
        finalUserMsg = `【玩家意圖】：去打工賺錢，忙碌了${KANSHOU_WORK_HOURS_}個小時，領到了${KANSHOU_WAGE_}円的薪水，此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${("0" + curHour).slice(-2)}:00・${timeBand_(curHour)}。`;
      } else {
        finalUserMsg = jumpFest
          ? `【時間推進】時間一路快轉，${jumpFest.name}到了——此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${("0" + curHour).slice(-2)}:00・${timeBand_(curHour)}。`
          : jumpBand
            ? `【時間推進】時間悄悄流轉到了${jumpBand.label}，此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${("0" + curHour).slice(-2)}:00・${timeBand_(curHour)}。`
            : `【時間推進】${advanceHours}個小時悄悄過去，此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${("0" + curHour).slice(-2)}:00・${timeBand_(curHour)}。`;
      }
    }
  }
  const curDateObj_ = kanshouAbsDayToDate_(curDay); // 供下方🕰️提示詞用，只算一次不重複呼叫

  // 🌙 宵禁提醒「留在外面過夜」：純GAS旗標寫入，不需要等AI回應，這裡先處理掉，跟AI narration無關。
  if (userData.dismissCurfew === true) {
    pcData[pcIndex][COL.PC.MEMORY] = kanshouDismissCurfew_(pcData[pcIndex][COL.PC.MEMORY], curDay);
  }

  // 💰 2026-07「先把肉償機制上線！！」玩家定案：橋段觸發來源是玩家主動點下方的debtPaymentOffer
  //   按鈕(見回傳值計算處)，不是移動進房間——目標必須此刻確實同行在場、且確實掛著欠租旗標(第二道
  //   防線，防直打API繞過前端按鈕判斷)，命中就依bond骰一次「肉償」走向、清掉欠租旗標，跟夜襲/
  //   賴床叫醒共用同一套kanshouRollSceneBranch_骰法，不另開一條平行的橋段判定邏輯。
  let kanshouDebtPaymentStr = "";
  if (userData.debtPayment) {
    const debtName = String(userData.debtPayment).trim();
    const debtIdx = pcData.findIndex(r => kanshouNameCandidates_(r[COL.PC.NAME]).includes(debtName) && String(r[COL.PC.LOC] || "").trim() === curL && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
    if (debtIdx !== -1 && KANSHOU_RENT_DEBT_TAG_.get(pcData[debtIdx][COL.PC.MEMORY])) {
      const debtBond = parseInt(pcData[debtIdx][COL.PC.BOND]) || 0;
      const branch = kanshouRollSceneBranch_('肉償', debtBond);
      if (branch) {
        const debtRealName = String(pcData[debtIdx][COL.PC.NAME]);
        pcData[debtIdx][COL.PC.MEMORY] = KANSHOU_RENT_DEBT_TAG_.set(pcData[debtIdx][COL.PC.MEMORY], '');
        dirtyPcRows.add(debtIdx);
        finalUserMsg = `【玩家意圖】：向「${debtRealName}」提議，這期繳不出的房租就用身體來抵。`;
        kanshouDebtPaymentStr = `\n★【橋段·肉償(GAS已骰定這次走向，AI只需依此演出，不必徵詢玩家、也不必逐字照抄下方措辭)】：她此刻的反應走向是——${branch.tag}。依她的既有性格詮釋這個走向具體要怎麼表現、講什麼話，細節全由你發揮，但情緒基調不要偏離這個走向。`;
      }
    }
  }

  // 🎨 2026-07「為何偶遇沒有女性」玩家反映：此局已經正式召喚過的英靈(不論是否仍同行)不該又以
  //   「陌生人」身分重複出現(如SABER已同行時，路上不該再巧遇一位不具名的SABER)。用真名候選比對
  //   (kanshouNameCandidates_，容忍括號附註差異)反查對應的SEED_SERVANTS id 清單餵給抽選函式排除。
  const kanshouEstablishedNames_ = new Set(pcData.filter((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r)).map(r => String(r[COL.PC.NAME]).trim()));
  const kanshouExcludeIds_ = SEED_SERVANTS.filter(h => kanshouNameCandidates_(h.realName).some(c => kanshouEstablishedNames_.has(c))).map(h => h.id);

  // 🌍 2026-07「加入這個世界的感覺」定案：拿掉「留人重逢」這個獨立機制——它跟「同地點就在場」
  //   現在是同一件事，已併入下方partyRows/partyDetailsArr(在場人物卡片)統一處理，不再需要另外
  //   算一份「凍結故人」清單。這裡只留原本的用意：移動時若目的地已經有established的人在，就不再
  //   另外擲一次陌生人巧遇(優先呈現熟人在場，而不是又冒出一個不相干的陌生人)。
  const kanshouSomeoneAlreadyHere_ = pcData.some((r, idx) => idx !== pcIndex && String(r[COL.PC.FACTION]) === "從者" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r) && String(r[COL.PC.LOC] || "").trim() === String(moveName || curL || "").trim());

  // 合法地點時才寫入LOC＋抽選巧遇＋記錄邂逅名單。抽選只在「按下移動按鈕」這個瞬間跑一次，不會
  //   每句對話重算。2026-07「加入這個世界的感覺」定案：移動不再強制拖走任何已存在的英靈(每個人
  //   都是獨立的，玩家移動只代表玩家自己走去哪，不代表帶著誰一起走)——想帶誰同行，交給AI敘事
  //   自然演出(比照下方「玩家反向邀約」規則)，機制上不再靠這裡的forEach同步。
  let kanshouEncounterHero = null, kanshouEncounterMetBefore = false, kanshouEncounterLocName = "";
  let kanshouEventSeed = null;
  if (moveTarget) {
    curL = moveName;
    pcData[pcIndex][COL.PC.LOC] = curL;
    dirtyPcRows.add(pcIndex);
    // 離開原地(換地點)＝上一段巧遇緣分結束，先清掉舊的【邂逅中】，這個新地點才重新擲一次巧遇。
    pcData[pcIndex][COL.PC.MEMORY] = clearKanshouActiveEncounter_(pcData[pcIndex][COL.PC.MEMORY]);
    kanshouEncounterLocName = moveName;
    // 🚪 巧遇開關 + 🏠 noEncounter地點(家的5個房間)是私人空間 + 此地已有established的人在場：
    //   三者皆需通過才擲陌生人骰。
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
        // 🔘 2026-07「這功能直接做成按鈕」玩家定案：原本用關鍵字猜測「是不是在問這裡還有誰」已
        //   改成前端明確的「看看四周」按鈕(lookAround:true)，不再猜文字語意。目前還沒有巧遇中的
        //   對象時，用目前地點重新擲一次巧遇——跟按移動按鈕同一套加權隨機，不寫LOC(沒有移動)、
        //   不同步同伴(沒人移動)。noEncounter地點(家)恆不觸發此路徑。
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

  // 🍳「準備早餐」：moveTarget已把玩家帶去廚房(見上)，這裡幫3位房客各自骰一次今早去向。放在
  //   partyRows計算之前，讓骰進廚房的房客能正常透過既有【在場人物】機制被AI看到，不必另開一條
  //   平行的「早餐在場名單」。
  let kanshouBreakfastStr = "";
  if (isBreakfast_) {
    const absentBreakfastNames_ = [];
    Object.keys(KANSHOU_HOUSEMATE_ROOMS_).forEach(hid => {
      const hero = SEED_SERVANTS.find(h => h.id === hid);
      if (!hero) return;
      const hmIdx = pcData.findIndex((r, i) => i !== pcIndex && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_") && kanshouNameCandidates_(hero.realName).includes(String(r[COL.PC.NAME])));
      if (hmIdx === -1) return; // 尚未召喚，不參與這次早餐
      const spot = kanshouRollBreakfastSpot_();
      const hmName = pcData[hmIdx][COL.PC.NAME];
      if (spot === 'kitchen') {
        pcData[hmIdx][COL.PC.LOC] = '廚房';
      } else if (spot === 'ownRoom') {
        pcData[hmIdx][COL.PC.LOC] = KANSHOU_HOUSEMATE_ROOMS_[hid];
        absentBreakfastNames_.push(`${hmName}——還窩在${KANSHOU_HOUSEMATE_ROOMS_[hid]}裡賴床`);
      } else {
        const outLoc = kanshouRollDailyLocation_(hmName); // 不傳hour，避免清晨homeBias把「出門」蓋回房間
        pcData[hmIdx][COL.PC.LOC] = outLoc;
        absentBreakfastNames_.push(`${hmName}——似乎一早就出門去了「${outLoc}」`);
      }
      dirtyPcRows.add(hmIdx);
    });
    finalUserMsg = `【玩家意圖】：走進廚房，開始張羅今天的早餐。`;
    // 🍳 2026-07玩家「還要讓ai知道誰沒有來 在房間還是去哪裡 讓他自然敘述！」定案：GAS給的是
    //   實際去向事實(房間名/地點名)，AI依此自然帶一筆(路過房門聽見動靜、提一句人不見了等)，程度
    //   自行拿捏——不是照抄這裡的措辭，也不是完全不提(show-don't-tell：給事實，AI決定怎麼演)。
    if (absentBreakfastNames_.length) kanshouBreakfastStr = `\n★【早餐現況(GAS已骰定，供敘事參考)】：這次沒出現在餐桌上的人——${absentBreakfastNames_.join('；')}。narration可以自然帶出她們此刻的狀態(依角色性格決定要不要特地去看一眼、喊一聲、還是隨口提及)，不必每次都詳細描寫，但內容不能跟這裡的事實矛盾。`;
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
  //   真正能被指名、有名有姓、好感會被記錄的對象，只有【在場人物】——2026-07「加入這個世界的
  //   感覺」定案：拿掉「隊伍」概念，這個世界裡所有已存在的英靈各自過各自的生活，判準改成「LOC是
  //   否跟玩家目前位置(curL)一致」，不再看IS_PARTY。
  // 🌍 同地點最多給KANSHOU_PARTY_DETAIL_CAP_位詳細卡片(敘事複雜度/prompt篇幅上限，不是隊伍
  //   容量)——3位房客+來訪的人湊在一起吃早餐等場合會摸到這個上限，依好感高低取前幾位，避免單
  //   回合塞太多人卡片讓提示詞爆量；超過上限的人依然存在、依然可被特定劇情點名，只是這回合沒有
  //   詳細卡(2026-07玩家「吃飯不能5人嗎」定案，3→5)。
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
      // 💝 純聊天好感卡在梯度上限(kanshouRelChatCeiling_)這件事本身不會反映在數字上——GAS會默默
      //   夾住漲幅，若不順便告訴AI，narration可能寫出「這次對話後感情大幅推進」這種跟機制矛盾的
      //   橋段(數字其實卡住沒動)。在卡住的當下才加這句提示，沒卡住時完全不提，不干擾平常敘事。
      const pBond = parseInt(r[COL.PC.BOND]) || 0;
      const pChatCeiling = kanshouRelChatCeiling_(pBond);
      const pAtCeilingStr = (pChatCeiling < 100 && pBond >= pChatCeiling) ? "・單靠對話目前已到這個階段的上限，需要收到禮物才能繼續加深，這回合維持細水長流的相處基調，不要寫成關係大幅推進" : "";
      // 明講方向的「TA是你的${tag}」(而非單純「關係:${tag}」)，避免AI誤讀方向、演反成玩家服侍TA。
      partyDetailsArr.push(`【在場人物】名號:${pName} | 身世:${r[COL.PC.BACK] || "無"}${pOutfit ? ` | 裝扮:${pOutfit}(當前服裝·五官體態不變)` : ""} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])}${pFlavorStr}${pMoeStr ? ` | 萌點(反差·僅供內化):${pMoeStr}` : ""} | 關係:TA是你的${r[COL.PC.REL_TAG] || "點頭之交"}(好感:${pBond}${pMemStr}${pAtCeilingStr})`);
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
  let pSkills = (pcData[pcIndex][COL.PC.MEMORY] || "無").replace(/\[雙修技巧\](.*?)(?=\| \[|$)/, (m, p1) => `[雙修技巧]${p1.trim().split('、').slice(0, 5).join('、')}`);
  // 玩家自己的換裝也要補進[情境延續]區塊(比照NPC每回合補進[名字 裝扮]行)，這是情慾場景AI主要
  //   參照的區塊，不能只在【玩家命格】看得到。
  let nsfwMemories = `\n[玩家『${pcName}』肉體]：${JSON.stringify(pPhysicalObj)}\n[身體記憶]：${pSkills}${myOutfit ? `\n[玩家『${pcName}』裝扮]：${myOutfit}（當前服裝·五官/髮色/體態不變）` : ""}`;

  // ⚡ 提速：跟上面 presentRowsForGender 是完全相同的 filter 條件，直接複用，省掉第二次整表掃描。
  let allPresentRows = presentRowsForGender;
  allPresentRows.forEach(r => {
    let npcPhysicalObj = JSON.parse(r[COL.PC.PHYSICAL] || "{}");
    if (Object.keys(npcPhysicalObj).length === 0) npcPhysicalObj = { "狀態": "如常" };
    let npcSkills = (r[COL.PC.MEMORY] || "無").replace(/\[雙修技巧\](.*?)(?=\| \[|$)/, (m, p1) => `[雙修技巧]${p1.trim().split('、').slice(0, 5).join('、')}`);
    let relMem = r[COL.PC.REL_MEM] || "無";
    let npcOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👗 換裝：當前服裝穿著(換衣不換人·五官體態依本相；玩家UI設定或AI依outfit_change更新)
    nsfwMemories += `${npcOutfit ? `\n[${r[COL.PC.NAME]} 裝扮]：${npcOutfit}（當前服裝·五官/髮色/體態不變）` : ""}\n[${r[COL.PC.NAME]} 肉體]：${JSON.stringify(npcPhysicalObj)}\n[快照]：[技巧]${npcSkills} | [羈絆]${relMem}`;
  });

  // 🔥 主動掌握模式(driveOn)：翻轉「誰主導節奏」——平時的矜持限制換成同伴主動出擊；玩家的迴避/
  //   抽身意圖會被依個性攔下。主動的【形式】仍依好感與個性：低好感是強勢試探/挑釁/戲弄的攻勢
  //   (非傾心倒貼)，高好感才是不加掩飾的索求。個性一致性鐵律照常有效，這走向不可逆但不強迫
  //   每回合寫到終點。
  // 🌸 巧遇者是還沒被召喚、沒有資料列的陌生人，明講「這次到訪期間的系統例外」，避免跟下方
  //   【在場驗證鐵律】(只有在場人物能被指名互動)打架，同時允許同一次到訪期間持續互動、直到
  //   玩家換地點離開。
  // 🎨 巧遇池男女皆有(2026-07新增女性)，走的是跟 actionKanshouSummonHero(僅支援男女／女女配對)
  //   完全不同的路徑，不經過那兩處守門——僅「男御主遇男性巧遇對象」這組明講僅止於同性情誼，
  //   其餘組合(含女女)一律自然發展，不特別限制。
  const kanshouEncounterStr = kanshouEncounterHero ? (() => {
    const p = kanshouEncounterHero.persona || {};
    const look = p.dailyLook || p.look || "";
    const words = p.dailyWords || p.words || "";
    const isMaleMale = String(pc[COL.PC.SEX]) === "男" && String(kanshouEncounterHero.gender) === "男";
    const friendshipOnly = isMaleMale ? "★TA與玩家同為男性，這段交流僅止於同性情誼／夥伴／損友式互動，不發展曖昧、戀愛或情慾內容，不做任何親密肢體接觸。" : "";
    return `\n★【本回合系統指定巧遇——這次到訪期間持續有效的例外，不受下方在場驗證鐵律限制】：『${kanshouEncounterHero.realName}』（${kanshouEncounterHero.cls}）此刻恰好也在「${kanshouEncounterLocName}」，${kanshouEncounterMetBefore ? "是已經打過照面的熟面孔" : "是初次的邂逅"}——外貌氣質:${look}／日常個性:${words}。允許TA以真實姓名登場、持續互動，這段緣分在玩家離開這個地點前都有效，TA還不是這個世界裡已經召喚存在的人物：好感/關係不追蹤記錄；若情境合適，TA也可以自然道別離開，不必勉強撐到玩家換地點。${friendshipOnly}`;
  })() : "";

  // 🌍 2026-07「加入這個世界的感覺」定案：拿掉「留人重逢」——它跟partyRows/partyDetailsArr(在場
  //   人物卡片，依LOC===curL判斷)現在是同一件事，重逢的人一樣會自動出現在那份卡片裡，不需要另外
  //   組一段重複的提示詞。

  // 🚪 深夜訪客(knockAccept選擇「開門」)：她的LOC已在前面被設成curL，之後會自動出現在partyRows
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

  // 這裡只提供正確姓名給 AI 拼字用(「姓名參考用」措辭)，是否真的互動仍完全依上方【在場驗證鐵律】
  //   判斷，不強制清單所有人都要出聲。已有【專屬稱呼】(AI每回合自己生成、寫進REL_MEM)就自然用
  //   暱稱取代真名，避免暱稱系統形同虛設；不影響下方 rel_changes/intimacy_feedback 仍固定要求真名。
  const npcDialoguePrompt = partyMembers.length > 0 ? `\n★【稱呼慣例】：對話/敘事中稱呼在場人物時，若該人已有【專屬稱呼】(見上方在場人物卡片)，可自然使用該暱稱取代真名，不必每次都字正腔圓喊全名；尚未發展出專屬稱呼、或情境特別鄭重深情時，仍使用真實姓名「${partyMembers.join("、")}」，不得自創真名與專屬稱呼以外的第三種稱呼。★此稱呼慣例僅供narration/對話台詞使用，與下方JSON輸出(rel_changes/intimacy_feedback)的姓名欄位無關，那兩處規則各自獨立、一律固定填真實姓名；是否互動仍依上方在場規則與各人強制互動限制判斷，非清單所有人都要出聲。` : "";


  // 鑑賞無戰鬥，御主的 HP/MP/MAX_HP/MAX_MP 這4欄從未寫入，故 prompt 不提血量/魔力數值或瀕死判斷
  //   (與世界觀、specificRules「絕對禁止血量/生命變化」皆一致)。
  const prompt = `【敘事法旨】：當前推演視角鎖定為玩家『${pcName}』(ID: ${pcId})。
${PROMPT_PARTY_SYSTEM}
【玩家命格】：名號:${pcName} 【性別:${pc[COL.PC.SEX]}】 性格:${pc[COL.PC.PREF]} | 特徵:${pc[COL.PC.TRAIT]}${myOutfit ? ` | 裝扮:${myOutfit}(當前服裝·五官體態不變)` : ""} | 軟肋:【 ${currentAmbition} 】 | 身世:${pc[COL.PC.BACK] || "來歷不明"} | 位置:${curL}${myDecor ? ` | 家中已有的擺設(僅供「家」相關場景參考，非強制每次提及):${myDecor}` : ""}

${PROMPT_REL}
★【在場驗證鐵律——最高優先級，下筆前必看】：本回合可被指名對話、持續互動、且好感/關係會被記錄延續的角色僅限【目前在場人物】(與玩家同地點的已建立英靈)；背景路人可自由描寫增添氣氛(見上方【開放世界·背景人煙】)，但一律不具名、不可被指名互動、不追蹤好感，【絕對禁止】把某個背景路人寫成有名有姓、持續登場的固定角色。唯獨玩家本回合輸入內容【明確主動】表達邀請、招呼、引入第三人等意圖時(如呼喚他人加入、開門讓人進來等)，才可讓該玩家指定或暗示的新角色登場並開始被指名互動。歷史紀錄、話題情報中提到但不在【目前在場人物】內的姓名，僅視為不在場的回憶，嚴禁無視此規則憑空召喚、穿越或讓其開口說話、出手！${kanshouEncounterStr}${kanshouKnockGuestStr}${kanshouRoomEventStr}${kanshouDebtPaymentStr}${kanshouBreakfastStr}${kanshouEventSeed ? `\n★【氛圍靈感·非強制】：可自然納入本回合場景的一個小細節——${kanshouEventSeed}。這只是引子，若跟劇情不合可完全不採用，不必刻意提及或解釋。` : ""}${jumpFest ? `\n★【節慶氛圍】：今天是「${jumpFest.name}」，narration可自然帶入應景的裝飾/活動/氣氛，不必特別報幕或解釋這個詞彙本身。` : ""}${upkeepCharged > 0 ? `\n★【維護費自動扣款·氛圍提示】：這次時間推進跨過了衛宮宅的維護及食材費結算日，已自動扣款${upkeepCharged}円，目前餘額${parseInt(pcData[pcIndex][COL.PC.MONEY]) || 0}円，narration可自然帶一句(如整理帳單、盤算菜錢、嘆氣)，不必大肆渲染；若餘額為負可自然帶出手頭吃緊的窘迫感，但不必寫成嚴重危機或懲罰劇情。` : ""}${tenantRentCollected > 0 ? `\n★【房客繳租·氛圍提示】：這次時間推進跨過了收租日，已收到房客繳來的${tenantRentCollected}円房租，目前餘額${parseInt(pcData[pcIndex][COL.PC.MONEY]) || 0}円，narration可自然帶一句房東視角的小細節(如收到房租信封、心裡盤算著這筆錢)，不必大肆渲染。` : ""}${tenantShortNames.length ? `\n★【房客手頭吃緊·氛圍提示】：『${tenantShortNames.join('、')}』這次繳不出房租，narration可以自然帶出TA不好意思、想辦法解釋或提議如何補償的樣子(依角色個性詮釋，可以是道歉、幫忙做家事、或其他你覺得貼合她個性的方式)，不必大肆渲染成嚴重危機，也不強制一定要往哪個方向發展——這只是提供一個可能的互動契機，非強制。` : ""}${intimateNightNames.length ? `\n★【入夜氛圍·好感門檻已達】：『${intimateNightNames.join('、')}』與你的羈絆已深(好感≥80)，今晚可以自然發展到同床共枕，依其性格自然決定要不要跨出這一步、氛圍濃烈到什麼程度，不強制每次都寫到底；好感未達此門檻的同伴，一律維持各自安睡、不越界。` : ""}${morningAfterNames ? `\n★【晨間餘韻·非強制】：昨夜與『${morningAfterNames}』或許共度了親密的時光(依上一回合實際演出的內容為準，若上次並未真的跨出那一步就當作平常的早晨)，這是新的一天第一個場景，若情境合適可以自然帶出晨間的溫馨/曖昧餘韻(如一起吃早餐、彼此害羞或黏膩的互動)，不強制一定要提及、也不需要複述昨夜細節，一切依角色個性自然發展。` : ""}
💕【鑑賞·後日談模式·最高優先級覆寫】：${partyRows.length === 0
    ? `這裡是平行世界的和平都市日常——聖杯戰爭這回事從未在這個世界發生過，眼下沒有同行的英靈在場，就是御主一人的尋常時光。`
    : partyRows.every(r => String(r[COL.PC.ID]).indexOf("KHV_") === 0)
      ? `『${partyMembers.join("、")}』是剛從英靈殿被召喚而來——這不是並肩打過聖杯戰爭的緣分，是彼此【初次相遇】的日常時光，讓相處自然生澀、依好感漸漸升溫，嚴禁暗示雙方早已相熟或曾並肩作戰。`
      : `這裡是平行世界的和平都市日常，聖杯戰爭這回事從未真正發生過，與『${partyMembers.join("、")}』共度的是尋常相處的時光，嚴禁提及聖杯爭奪或並肩作戰的往事。`
  }
🕰️現在是${curDateObj_.year}年${curDateObj_.month}月${curDateObj_.day}日・${timeBand_(curHour)}，僅供揣摩場景氛圍與時段感(如深夜靜謐、清晨慵懶、應景節氣)，不必刻意報時或提及具體數字。
★世界觀＝和平的現代都市日常：【絕對禁止】任何戰鬥、廝殺、敵人、聖杯爭奪、靈基受損、血量／生命變化、寶具對轟、死亡或威脅，世界是安全的；但節奏與親密程度依劇情、好感與玩家/同伴當下意圖自然發展，可以是散步閒聊的尋常時光，也可以是更靠近、更熱烈的相處，不強制鎖在「悠閒」基調(尤其🔥主動掌握模式開啟或情慾已自然升溫時)，讓從者貼近其官方性格自然地與御主相處互動。
★【演出而非說明】不得直述其願望／萌點／個性字面。僅可有 rel_changes(好感)，不輸出任何生命變化或戰鬥裁決。
★【換場地】地點不受地圖限制，你可自主決定何時、換去哪(不限於冬木既有地名，可自創如「一家安靜的咖啡廳」)——但【絕對禁止】無故憑空跳地點：須先在narration把移動/抵達的過程實際寫出來，location欄位才能填新地名；沒有移動就讓location原樣照抄目前地點。
★【提議換地點需玩家同意】：若這回合你判斷同伴自然而然想邀玩家換個地方，填move_proposal(地點需為以下清單之一：${KANSHOU_LOCATIONS_.map(l => l.name).join('、')})，narration只寫到「邀請/提議」的當下、【絕對禁止】接著寫出移動或抵達的過程，是否成行交由玩家事後決定；沒有這類意圖時move_proposal留空，不要每回合都提議。
★【玩家反向邀約】：這跟上面「AI提議」方向相反——若這回合是玩家本人主動邀同伴一起換地方，同伴的反應由你當場依其個性決定，答應就直接在這句narration裡把邀約、移動、抵達的過程一次演完並更新location；不想去就自然演出委婉推辭或提出想法，location維持原樣。這種情況【不需要】走move_proposal欄位，一回合內就地判斷完畢，不必分兩段等玩家再次確認。
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




    // 🗺️ 鑑賞拔除地圖按鈕，改AI自主決定地點——每回合讀 aiData.location 直接寫回 LOC，不再需要固定
    //   地圖節點清單。2026-07「加入這個世界的感覺」定案：不再靠IS_PARTY同步任何人——只有這回合
    //   一開始就跟玩家「同地點在場」的人(partyRows，這是這一幕真的跟玩家在一起的人)，才會跟著
    //   AI敘事移動到新地點；不在場的人各自過各自的生活，不會憑空被拖著走。
    const aiLoc = String(aiData.location || "").trim().slice(0, 20);
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

    // 🚶 2026-07「AI提議換地點需玩家同意」：只轉發給前端顯示同意/拒絕UI，不在這裡寫LOC——
    //   真正的移動要等玩家按下「同意」、前端帶著moveTarget再送一次，走既有moveTarget管線
    //   (含巧遇/留人重逢等既有效果)，這裡只驗證地點合法，不合法就當作沒有提議。
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

        // 🌹 鑑賞允許好感依劇情推進（solo 的好感收歸 GAS 按鈕，走不同的 narrate_only 路徑，不受這裡影響）
        let change = parseInt(rc.fav_change) || 0;

        let oldFav = parseInt(pcData[nIdx][COL.PC.BOND]) || 0;
        let newFav = Math.max(-100, Math.min(100, oldFav + change));
        // 💝 純聊天加好感卡在目前梯度上限，送禮才能突破(見kanshouRelChatCeiling_)——只夾正向漲幅，
        //   好感下滑(change<0)不受影響，該掉就掉。
        if (change > 0) newFav = Math.min(newFav, kanshouRelChatCeiling_(oldFav));

        // REL_TAG 本身仍不允許AI直接指定文字寫入，但好感變動後GAS會依kanshouSyncRelTier_自動
        //   依門檻升降級(玩家沒手動自訂過的話)；AI對標籤的影響力只剩「認不認同」，演在
        //   intimacy_feedback.npcs[].attitude 裡。
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

    // 🌍 2026-07「加入這個世界的感覺」定案：這裡原本還有一段「把partyMembers再同步一次LOC」的
    //   邏輯，跟前面aiLoc那段其實是重複的兩套同步(算出來的結果必然一致)——拿掉IS_PARTY後這段變成
    //   純粹的死重複，直接刪掉，同步只留aiLoc那唯一一處。

    const pcColCount = Object.keys(COL.PC).length;

    // 🔒 競態修：play 豁免寫入鎖(AI 呼叫佔數秒會卡全域)，但上面的列索引是 AI 呼叫【前】讀到的——
    //   期間其他上鎖動作若刪列，索引會位移。寫回前做一次 ID 欄窄讀重定位，用「當下的真實列索引」
    //   寫；列已被刪→跳過，絕不寫錯人。
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

    // 🌙 宵禁提醒：用最終位置(可能已被moveTarget/AI決定的location更新過)判斷，人在家(region==='home')
    //   或今天已經知會過(留在外面過夜)就不再跳提醒。
    const curfewLocDef = KANSHOU_LOCATIONS_.find(l => l.name === curL);
    const isCurfewHome = !!(curfewLocDef && curfewLocDef.region === 'home');
    const curfewDismissedNow = kanshouCurfewDismissed_(pcData[pcIndex][COL.PC.MEMORY], curDay);
    const curfewPrompt = (!isCurfewHome && !curfewDismissedNow && (curHour >= 22 || curHour < 6)) ? true : undefined;

    // 💰 2026-07「以後跟她獨處可以跳出這個按鈕」玩家定案：只有這個地點剛好只有一位在場(獨處，
    //   直接沿用上面已經算好的partyRows，不重算)、且那位剛好掛著欠租旗標時，才給前端一個「提議
    //   肉償」的按鈕；不像knockEvent那樣擋下整回合強制二選一，只是額外夾一個可用的選項，玩家不
    //   理會也能正常繼續聊天。
    const debtPaymentOffer = (partyRows.length === 1 && KANSHOU_RENT_DEBT_TAG_.get(partyRows[0][COL.PC.MEMORY])) ? String(partyRows[0][COL.PC.NAME]) : undefined;

    // 🎭 橋段·夜襲/賴床叫醒的按鈕：candidate在回合開頭(任何LOC寫入之前)就算好了，這裡直接沿用，
    //   不必也不應該重算——重算的話就會撞回「同行同伴LOC已被同步」的舊bug。candidate只認人員
    //   身分(不含bond)，bond留到玩家真的按下接受時才讀最新值。
    const roomEventOffer = kanshouRoomEventCandidate_ ? { name: kanshouRoomEventCandidate_.hero.realName, eventKey: kanshouRoomEventCandidate_.eventKey } : undefined;

    const localPeopleList = getKanshouPeopleList_(pcId, curL, pcData);

    let finalResponseText = aiData.narration || "天地混沌，一片寂靜。";
    finalResponseText = finalResponseText.replace(/\n/g, "<br>");






    // 好感度渲染／血量變化顯示區塊皆不輸出：好感度不顯示在敘述介面上，鑑賞無戰鬥不顯示血量變化。






    saveGameHistoryBatch(pcId, [
      { speaker: "player", content: userMsg },
      { speaker: "ai", content: aiData.narration || "" }  // 用原始 narration 不用 finalResponseText
    ]);

    // ⚡ 提速：pcData 這裡已是本回合全部異動(好感/態度/肉體等)寫回後的權威陣列，直接複用它建一份
    //   跟 get_tags 同格式的 payload 夾帶回去，省掉前端另打一趟 get_tags 的 round-trip；建構失敗
    //   就不夾帶，前端會自動退回原本的 get_tags 補呼叫。
    let tagsPayload = null;
    try { const tp = buildTagsPayload_(sheets, pcId, pcData); if (tp && tp.success) tagsPayload = tp; } catch (e) { }

    // 🕰️ 時段按鈕/時段行動需要每回合都拿到最新時鐘(結束一天/推進時間/打工/跳節慶/跳時段都可能
    //   改動curDay/curHour)，跟buildClientState_同一份kanshouClockInfo_，不重複拼字串。
    let kanshouClock = null;
    try { kanshouClock = kanshouClockInfo_(pcData[pcIndex]); } catch (e) { }

    return JSON.stringify({
      text: finalResponseText,
      statusString: buildPlayerStatusString(pcData[pcIndex]),
      people: localPeopleList,
      options: aiData.options,
      tags: tagsPayload,
      moveProposal: moveProposal || undefined,
      curfewPrompt: curfewPrompt,
      debtPaymentOffer: debtPaymentOffer,
      roomEventOffer: roomEventOffer,
      kanshouClock: kanshouClock
    });

  } catch (e) { return JSON.stringify({ text: "系統錯誤：" + e.message, people: [] }); }
}
