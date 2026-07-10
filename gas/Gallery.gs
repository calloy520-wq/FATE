// ==========================================
// 🏆 Gallery.gs — 鑑賞軌道全集中（慾海後日談，與封存從者的和平約會）
//   ⚠ 2026-07 玩家定案「整個砍掉奪杯封存機制」：舊版靠「奪得聖杯→AI總結→存入鑑賞表」封存
//   從者，事後才能邀入後日談；改成直接從「英靈殿」召喚(見 heroToKanshouRow_/
//   actionKanshouSummonHero)，不必先在 solo 打贏才能相見。勝利只做清理(見 actionEndRun)，
//   不再寫「鑑賞」表——COL.GAL／FATE_SHEET_DEFS["鑑賞"] 保留原樣(死符號不刪，見專案紀律)，
//   舊試算表殘留的鑑賞名冊資料無害地變成孤兒資料，不影響任何現行流程。
//   🔀 2026-07 玩家定案「兩軌完全拆開，鑑賞集中在一個GS，好查找」：solo(按鍵+AI說故事)跟
//   鑑賞(依角色資料自然演出、只有🔥點不點火這一個變因)徹底分家——本檔現在是**鑑賞唯一的家**：
//   召喚/進場/請走/AI深化(本檔一直都在) ＋ actionPlay(原Router_Narrative.gs)／
//   buildDefaultSystemPrompt含nsfwBaseRules(原Engine_Combat.gs)都搬來這裡，檔案最底部。
//   兩軌唯一共用的基礎設施 callGeminiAPI 留在 Engine_Combat.gs(solo/鑑賞都要打API，不歸屬
//   任一軌)。找鑑賞相關代碼從此只查這一個檔案即可。
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
function purgeGameData_(sheets, gameId, accountName) {
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
  var cls = sv ? String(sv.row[COL.PC.RANK] || "從者") : "";

  purgeGameData_(sheets, gameId, acctName);

  return JSON.stringify({ success: true, servantName: realName, cls: cls });
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

// 🤖 2026-07 玩家提案「新增從者時讓AI讀種子後完美轉成都市日常再寫入鑑賞眾生」：戰時外貌
//   描述(如「貼身黑色戰甲勁裝」)直接照搬進和平日常場景會很突兀，AI 敘事時照樣照抄字面
//   (玩家反映「為什麼還是直接照抄，沒有都市日常化」)。這裡在【寫入鑑賞眾生前】就用AI把
//   戰時外貌轉譯成同一人在現代都市日常會有的穿搭/外型：保留髮色/五官/氣質等本相不變，只把
//   戰甲/武裝/戰鬥姿態換成貼合其性格與傳說核心的日常打扮；TRAIT 欄裡混雜的舉止/自稱/私密一面
//   等非外貌短語交給 system prompt 辨識、原樣保留，不強行假設戰甲一定落在固定分段位置。
//   PREF(性格)完全不動——個性核心不該因場合而變，戰甲才是「戰時限定」的部分。呼叫端(召喚/奪杯
//   封存)僅一次性觸發，非每回合熱路徑，失敗時原樣退回戰時描述(不讓AI呼叫失敗擋住建角流程)。
// 🐛→✅ 2026-07 修(玩家實例反映「衣服怪怪、盡量保持原本但要日常點」＋「妖異而空洞的笑<有點怪怪」)：
//   舊版 system prompt 把輸入描述成「外貌/戰時裝束與舉止/自稱/私密面性格向描述隨意混雜」，但實際
//   資料結構(見 looksToTraitParts_)向來是「N段外貌(含服裝)、最後一段整體氣質/神情」，措辭不夠精準
//   反而讓AI的翻譯自由度過大：服裝有時被整套換成風格迥異的新造型(玩家覺得「怪怪」)，戰場神情
//   (如「妖異而空洞的笑」)又被要求「原樣照抄、一字不改」，直接搬進和平日常場景顯得突兀。改成：
//   ①服裝明確要求保留原本色系/風格精神、只做日常化改造，不换成完全不同調性；②最後一段的氣質/神情
//   改成「依和平日常情境自然轉化」而非硬性照抄，但仍鎖住角色性格底色不可變成別人。
// 🌹 2026-07 玩家定案「日常衣裝獨立成欄，不要混在外貌裡」：原本 translateAppearanceToDaily_ 只輸出
//   一段「N段外貌(含服裝)、最後一段氣質」的鬆散字串，讀取端再靠 looksToTraitParts_ 硬拆——服裝跟
//   五官體態混在同一段，也沒有真正屬於角色個人的「自稱與口氣」/「卸下心防的私密一面」(那兩格過去
//   一律是寫死的通用填充句，見 looksToTraitParts_ 註解)。改寫成 translateLookToDaily_：一次 AI 呼叫
//   直接輸出兩樣東西——①look：明確四段(外貌本相/氣質舉止/自稱與口氣/卸下心防的私密一面)，跟
//   PERSONA.traits／PREF 的四格格式完全對齊，不必再靠 looksToTraitParts_ 事後硬拆；②outfit：獨立的
//   日常穿搭一句話。取代原本的 translateAppearanceToDaily_，呼叫端同步改名。
// 🐛→✅ 2026-07 玩家問「AI創造能抓到重點吧？」查證發現：不能——這個函式跟 translateMoeToDaily_ 是
//   兩次各自獨立的 AI 呼叫，互不知道對方輸出什麼，跟種子手寫23位英靈時「dailyMoe(v57)／dailyLook四段式
//   (v58)分兩輪各自順著同一角色反差發想、結果私密一面跟萌點撞成同一件事的兩種說法」是同一個結構性
//   成因。修法：呼叫端(recordOriginalHero_/actionSaveHero)先算好 dailyMoe，再把它當 dailyMoeHint
//   傳進來，明講「私密一面不可跟這句萌點重複」，讓 AI 當下就看得到另一半、不必事後靠人工抓重複。
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

// 🔀 2026-07：跟上面 translateLookToDaily_ 同一批「轉去鑑賞都市日常」需求，原本落在
//   Core_Settings.gs(solo 的 enrichPersonalityLikesDislikes_ 附近)——鑑賞集中到 Gallery.gs 這輪
//   一併搬過來，兩個「XToDaily_」翻譯函式終於同居一處，不用跨檔找。
// 🤖 2026-07 玩家定調「種子就是去戰鬥的，可以少幾項沒問題；轉到鑑賞，AI必須依照種子進行補充
//   和轉換原本資料變成都市日常」：跟 Core_Settings.gs 的 enrichPersonalityLikesDislikes_ 的差異——
//   那個是給「還在戰場」的 solo 用(只補缺項、維持戰時語境)，這個專給「進入鑑賞和平日常」用，
//   一次AI呼叫做兩件事：①段數不足4段就補滿(邏輯同上)；②不論段數夠不夠，若既有短句偏戰場語境
//   (戰意/殺意/勝負等)一律轉譯成性格本質不變、但適合日常場景展現的等價說法。只用在鑑賞的兩個
//   新增從者入口。
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

// 🌹 2026-07 玩家定案「餐桌是平行世界、沒有聖杯戰爭這回事(但她們仍是英靈)」：跟上面兩個 XxxToDaily_
//   不同——look/words 的日常化只是「換場景敘述」，moe(萌點·反差)若直接照搬戰時版本，會把「靠戰爭/詛咒/
//   創傷撐出的沉重反差」(如「怪力女神卻極度自卑」)硬套進一個根本沒發生過聖杯戰爭的世界，顯得莫名沉重、
//   沒來由。這裡明確要求改寫成「輕量、溫馨、看了會心一笑」的日常萌點，性格核心不變，但拿掉需要戰爭/
//   創傷背景才成立的沉重份量——只用在 AI 原創(ai_gen)英靈；canon 種子英靈的日常萌點全部手寫死進
//   persona.dailyMoe(見 Seed_Codex.gs)，不會走到這個函式。
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

// 🐛→✅ 2026-07 玩家點名「撈進鑑賞時確實零AI呼叫<<<把這個呼叫移除吧?沒有其他來源不會有要補
//   資料問題」：查證屬實——DAILY_LOOK/DAILY_WORDS 現在只有兩種來源，皆已在「進英靈殿之前」就
//   保證非空：①種子(SEED_SERVANTS)全數手寫寫死進 persona.dailyLook/dailyWords；②工房(ai_gen)
//   在 recordOriginalHero_/actionSaveHero 建立/修改當下就呼叫AI預先轉好寫入。不存在第三種「英靈
//   殿裡有列、但這兩欄還沒人填過」的來源，原本這裡「懶惰呼叫AI補一次並回寫」的分支因此打不到，
//   已整段拿掉——純讀取，找不到快取值就退回原始戰時 look/words(不轉譯、零成本)當保底，不再呼叫AI。
function getDailyHeroFields_(heroRow, p) {
  var existingLook = String(heroRow[COL.HERO.DAILY_LOOK] || "").trim();
  var existingWords = String(heroRow[COL.HERO.DAILY_WORDS] || "").trim();
  var existingMoe = String(heroRow[COL.HERO.DAILY_MOE] || "").trim();
  // 🆕 DAILY_OUTFIT(2026-07)：服裝跟外貌本相分開存，戰時 persona 沒有對應的「純服裝」欄可退——
  //   沒快取到值就交給 heroToKanshouRow_ 自己的「日常便服」保底，這裡純讀取不瞎猜。
  var existingOutfit = String(heroRow[COL.HERO.DAILY_OUTFIT] || "").trim();
  var rawLook = String(p.look || "").replace(/・/g, "、");
  var rawWords = String(p.words || "").replace(/・/g, "、");
  var rawMoe = String(p.moe || "");
  return { look: existingLook || rawLook, words: existingWords || rawWords, moe: existingMoe || rawMoe, outfit: existingOutfit };
}

// 🐛→✅ 2026-07 solo/鑑賞完全拆分稽核發現：actionPlay 組同伴命格時，MEMORY 查無【口吻】標記會
//   退回 codexPersona_(name).speech 這個戰時原始口吻(如狂化英靈「狂化無法言語、僅餘低吼」)，跟
//   heroToKanshouRow_ 已改用 dailyLook 第3段(自稱與口氣)的原則不一致。這裡補一個同源的日常安全
//   查表，讓 actionPlay 的 fallback 分支(理論上只有極舊、召喚時尚未套用此修正的既有存檔會走到)
//   也吃得到一樣的日常版口吻，不再有任何路徑把原始戰時 speech 餵給鑑賞AI。
function dailySpeechByName_(name) {
  try {
    var heroes = getHeroCodexCached();
    var h = heroes.find(function (r) { return String(r[COL.HERO.NAME]).trim() === String(name).trim(); });
    if (!h) return "";
    var parts = String(h[COL.HERO.DAILY_LOOK] || "").split('、').map(function (s) { return s.trim(); }).filter(Boolean);
    return parts.length >= 4 ? parts[2] : "";
  } catch (e) { return ""; }
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
  // 🐛→✅ 2026-07 修(玩家反映「斯卡哈應該自信高冷，怎麼都沒按個性演出」)：原本 p.words/p.look
  //   直接原樣塞進 PREF/TRAIT，種子資料慣用「・」當片語內部連接號(如「影之國女王・武人」)——但
  //   Router_Narrative.gs 的 formatPref/formatTrait 是用「、」切成[表象]/[內裡]/[喜歡]/[討厭]四格
  //   餵給AI，沒有「、」可切時整串會被塞進單一格、其餘三格全變「無」，等於把她的關鍵個性錨點
  //   (武人的強悍/冷峻)吃掉大半，AI 拿不到足夠信號自然就照套路寫成普通嬌羞反應。solo 的
  //   actionSummonServant 對同一份種子資料早就有做「・→、」轉換＋parseTraitsHelper 補滿四格，
  //   鑑賞這條直接召喚路徑當初漏做，比照補齊。
  // 🤖 2026-07 玩家定調「轉到鑑賞，AI必須依照種子補充並轉換成都市日常」：優先讀英靈殿已快取的
  //   日常版(種子手寫／工房建立當下生成)，兩者皆非空——見 getDailyHeroFields_ 註解，這裡不再有
  //   任何AI呼叫的可能。
  var daily = getDailyHeroFields_(heroRow, p);
  sRow[COL.PC.PREF] = parseTraitsHelper(daily.words, "沉著表象、堅定內裡、珍視之物、厭惡之事");
  // 🌹 2026-07 玩家定案「日常衣裝獨立成欄」：dailyLook 從「N段外貌(含服裝)、最後一段氣質」的鬆散
  //   格式，改為手寫/AI轉換直接產出的明確四段(外貌本相/氣質舉止/自稱與口氣/私密一面)——已是這個
  //   格式的話直接讀，不必再靠 looksToTraitParts_ 硬拆；只有還沒補上新格式的舊資料(過渡期)才退回
  //   舊拆法，兩者相容、零斷層。
  var dailyLookParts = String(daily.look || "").split('、').map(function (s) { return s.trim(); }).filter(Boolean);
  var traitSrc = dailyLookParts.length >= 4 ? daily.look : looksToTraitParts_(daily.look, p.firstP);
  sRow[COL.PC.TRAIT] = parseTraitsHelper(traitSrc, "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面");
  // 🌹 2026-07 玩家定案「餐桌是平行世界、沒有聖杯戰爭這回事」：萌點跟外貌/性格一樣改讀日常版
  //   (daily.moe)，不再直接照搬戰時 persona.moe——那種靠戰爭/創傷撐出的沉重反差在這個沒打過
  //   聖杯戰爭的世界裡沒有來由，詳見 getDailyHeroFields_/translateMoeToDaily_。
  sRow[COL.PC.INTENT] = daily.moe || "";
  // 🐛→✅ 2026-07 solo/鑑賞完全拆分稽核發現：這裡曾直接用 p.back(戰時身世)，3位女性正典御主的
  //   back是「父親死於聖杯戰爭」「被當工具養大」「蟲蝕黑化」等戰時悲劇——跟「餐桌是平行世界、沒有
  //   聖杯戰爭這回事」矛盾。已比照dailyMoe新增 p.dailyBack(溫馨改寫版)，優先讀它；沒有dailyBack
  //   的英靈(其餘20位本就沒有back)一律走職階+真名的中性保底，不再退回原始戰時back。
  sRow[COL.PC.BACK] = p.dailyBack ? String(p.dailyBack).slice(0, 28) : `${sRow[COL.PC.RANK]}・${name}`;
  // 🆕 直接召喚無快照可帶，用該英靈自己的日常衣裝(daily.outfit)墊底，沒有才退回通用「日常便服」；
  //   卡片才不會裝扮欄空白待換裝——玩家隨時仍可透過既有換裝功能覆寫(getOutfit_/setOutfit_，可清)。
  // 🐛→✅ 2026-07 稽核發現：這裡曾直接用 p.speech/p.tic(戰時口吻/招牌小動作)——例如狂化英靈的
  //   「狂化無法言語、僅餘低吼」，這種戰時設定被原樣塞進【口吻】標記餵給鑑賞AI，等於告訴AI這個
  //   在平行世界日常裡的同伴根本不能好好講話，跟「沒有聖杯戰爭這回事」矛盾。dailyLook 第3段
  //   (自稱與口氣)本就是這個角色日常語氣的日常安全版，改用它取代p.speech；p.tic(小動作)沒有
  //   對應的日常版，直接不帶——私密一面(dailyLook第4段)已經承擔「角色專屬小習慣」的功能，不會少戲。
  var dailySpeechPart = dailyLookParts.length >= 4 ? dailyLookParts[2] : "";
  sRow[COL.PC.MEMORY] = setOutfit_(stampPersonaFlavor_("【鑑賞後日談·初見】從英靈殿被召喚而來的相遇，緣分才剛開始。", dailySpeechPart, ""), daily.outfit || "日常便服");
  // 🧹 2026-07 玩家定案「同伴也可以不先顯示」：拿掉建立當下就預填肉體狀態的做法，改跟御主本人
  // (actionEnterKanshou)一致——PHYSICAL 留空，「當前狀態」面板顯示「--」，直到真的發生第一次
  // 互動、AI 回傳 intimacy_feedback 才第一次寫入。Router_Narrative.gs 的懶初始化(pPhysicalObj
  // 為空物件時依性別現算預設值)本就會在那之前的 prompt 組裝過程臨時補上，AI 不會拿到空物件，
  // 只是不再「還沒發生任何事就先寫進資料庫」。
  sRow[COL.PC.GAME_ID] = gameId;
  // 🐛→✅ 2026-07 玩家問「召喚的角色跟我說是什麼關係？」查出：REL_TAG 沿用 solo 那邊「從者」的寫法——
  //   但「從者」是聖杯戰爭裡令咒締結契約的戰爭專屬用語，這行(Gallery.gs:877)會直接把「關係:從者」
  //   餵給AI，且只有AI明確給新tag才會覆蓋，AI若判斷「無變化」就會一直卡在這個戰爭用語，跟鑑賞
  //   「沒有聖杯戰爭這回事」的定調衝突。改用既有好感分級詞彙「萍水相逢」(跟 BOND=45「尚淺·剛認識」
  //   的既有註解意圖一致)，solo 端(Router_Creation.gs)因為真的有令咒契約，「從者」在那邊是對的，不動。
  sRow[COL.PC.BOND] = 45; sRow[COL.PC.REL_TAG] = "萍水相逢"; sRow[COL.PC.IS_PARTY] = "同行";
  sRow[COL.PC.REL_MEM] = "初次相遇，緣分才剛開始";
  return sRow;
}

// 👥➕ 直接從英靈庫召喚一位英靈進入當前後日談(不需先在 solo 封存；上限與封存路徑共用同一個 3)
function actionKanshouSummonHero(userData, pcId, sheets) {
  // 🧹 2026-07：dispatcher(Router_Action.gs)已依 pcId 開頭 KPC_ 把 sheets.pc 指到「鑑賞眾生」，
  //   這 5 顆 action 全部只吃 KPC_ 呼叫(前端只會這樣打)，不必再自己重查一次同一張表。
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
  var heroName = String(hero[COL.HERO.NAME] || "從者");
  // 🔒 2026-07 加固：玩家原創(ai_gen)只有創造者本人可召喚進鑑賞——前端清單已濾掉，這裡是第二道防線
  // (防止直打API繞過前端過濾，召喚別人工房/盲盒捏出的角色)。種子(正典)英靈不受限、人人可召喚。
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
  // ⚠ 2026-07 修：請走已改成保留列只退出同行，先找「此局是否已有這位
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
  // 🧹 2026-07：isNew 原本供前端判斷要不要觸發已刪除的 actionBackfillKanshouServantAi 深化呼叫，
  //   該深化本身已隨daily欄位系統整條移除，這個旗標保留輸出無害但目前無消費端。
  return JSON.stringify({ success: true, added: heroName, isNew: true, message: "「" + heroName + "」來到了你們身邊。" });
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
  // 🆕 玩家本人也先給「日常便服」墊底，卡片才不會裝扮欄空白待換裝
  mRow[COL.PC.MEMORY] = setOutfit_("【帳號】" + acctName + "｜【鑑賞後日談】聖杯戰爭已結束，這是與英靈相伴的和平約會時光。", "日常便服");
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

  const KANSHOU_MASTER_GEN_SYS = `你是《命運停駐之夜》後日談(鑑賞)的角色生成核心，為玩家建立一位已結束聖杯戰爭、與封存從者共度和平時光的「御主」本人形象。請依玩家提供的姓名、性別、外貌、身世、個性方向，生成合理且溫暖自然的設定。

★【演出而非說明】設定只作為底層依據，不要在 background 裡直接複述字面。
★【四格】traits 與 personality 各剛好 4 短句、頓號分隔、禁數字標籤：
- traits：外貌、氣質舉止、自稱與口氣(第一人稱·如 我/俺/吾＋說話語氣)、卸下心防的私密一面
- personality：日常表象、真實內裡、喜歡的事物、討厭的事物
★npc_intent：一句【簡短】萌點（可愛反差，≤18字，系統會在30字處硬性截斷、務必精簡），結合此人身分性格，要反差、可愛、獨特。務必寫完整一句話，不可斷在句意未完處。【禁】誤用聖杯戰爭機制專有詞(令咒/寶具/魔術迴路/從者/職階等)當裝飾性魔法元素湊萌點——這些詞在本作有精確機制意義(如令咒是對從者下達絕對命令的珍貴道具，不是隨手用來做家事雜活的萬用法寶)，且聖杯戰爭已落幕，情節上真的合理相關才能出現；請改用生活化情境(手作/習慣/小癖好等)。★這個萌點必須是單看了會覺得溫馨、正面、會心一笑的日常小反差(如生活小習慣、意外的手藝、小小的害羞反應等)，【禁】靠創傷/自卑/孤獨/悲劇宿命撐出反差感——那是戰時角色才需要的沉重寫法，這裡是輕鬆的日常後日談。
★background：限20字，呼應其身世，不出現具體物品名，語氣平和(聖杯戰爭已結束)。
★【勿輸出數值】戰力數值一律不需要，也不要輸出地點。

★【輸出】合法 JSON、禁 Markdown：
{"background":"限20字","traits":"四格頓號字串","personality":"四格頓號字串","npc_intent":"結合此人身分的獨特可愛反差萌，一句話"}`;

  try {
    const aiBrief = JSON.parse(callGeminiAPI(promptStr, KANSHOU_MASTER_GEN_SYS, { temperature: 0.6, ignoreLaw: true }));
    // 🔒 競態修(比照 actionBackfillMasterAi)：backfill 豁免寫入鎖，pIdx 是 AI 呼叫【前】的列索引——寫回前重定位。
    const wIdx = buildLiveIdIndex_(sheets.pc)[String(pcId)];
    if (wIdx === undefined) return JSON.stringify({ success: false, message: "御主列已不存在（可能剛被清理）。" });
    if (aiBrief.background) sheets.pc.getRange(wIdx + 1, COL.PC.BACK + 1).setValue(String(aiBrief.background).slice(0, 40));
    if (aiBrief.traits) sheets.pc.getRange(wIdx + 1, COL.PC.TRAIT + 1).setValue(parseTraitsHelper(aiBrief.traits, row[COL.PC.TRAIT]));
    if (aiBrief.personality) sheets.pc.getRange(wIdx + 1, COL.PC.PREF + 1).setValue(parseTraitsHelper(aiBrief.personality, row[COL.PC.PREF]));
    // 🐛→✅ 玩家反映 N 欄(萌點)被切斷：原 slice(0,18) 對「一句話」來說太緊，AI 稍微超字數就被腰斬成半句。
    //   放寬緩衝空間，不再卡在句意中間。
    if (aiBrief.npc_intent) sheets.pc.getRange(wIdx + 1, COL.PC.INTENT + 1).setValue(String(aiBrief.npc_intent).slice(0, 30));
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ success: false, message: "背景補生成失敗（已保留種子設定）" });
  }
}

// 👥 列出後日談現有同伴（上限 3 人）。pcId＝慾海御主 avatar(KPC_)。
//   ⚠ 2026-07：邀請只剩「英靈殿直接召喚」一途(見 actionKanshouSummonHero)，不再有「鑑賞」表
//   可邀名單——available 恆回空陣列，保留欄位只為前端相容(避免舊快取/其他呼叫端讀取炸掉)。
function actionKanshouCompanions(userData, pcId, sheets) {
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
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
  return JSON.stringify({ success: true, current: current, available: [], max: 3 });
}

// 👥➖ 請走一名同伴（退出當前同行；資料原地保留，隨時可再邀回、累積紀錄不歸零）
// ⚠ 2026-07 修：原本直接 deleteRow，等於把這位同伴在慾海裡累積的雙修技巧/性愛時敏感部位
// (MEMORY)、專屬稱呼/親密次數/交談輪數(REL_MEM)、當下肉體(PHYSICAL)、好感(BOND)全部銷毀——
// 舊版「資料仍封存在鑑賞名冊」的說法其實只精確到「原始封存那一刻」的舊快照，請走之後在慾海裡
// 累積的一切都救不回來。改成只退出同行(IS_PARTY 清空)、保留整列，之後 actionKanshouSummonHero
// 偵測到同名列存在時會直接喚回、不重建。
function actionKanshouRemove(userData, pcId, sheets) {
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
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
// 請走，之後的敘事框架仍會用新性別去演出。比照 actionKanshouSummonHero 的規則直接擋下這次改性別。
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
    var hasMaleCompanion = data.some(function (r, ri) {
      return ri !== i && String(r[COL.PC.GAME_ID] || "") === gid && String(r[COL.PC.FACTION]) === "從者" &&
        String(r[COL.PC.IS_PARTY] || "") === "同行" && String(r[COL.PC.SEX]) === "男" && !String(r[COL.PC.ID]).startsWith("DEAD_");
    });
    if (hasMaleCompanion) {
      return JSON.stringify({ success: false, message: "目前有男性同伴同行中——僅支援男女／女女配對，請先請走該同伴再切換性別。" });
    }
  }
  var oldSex = String(data[i][COL.PC.SEX] || "");
  kpc.getRange(i + 1, COL.PC.SEX + 1).setValue(newSex);
  // 🗑️→✅ 2026-07：physical_state 簡化成單一「狀態」欄後不再有器官專屬鍵，這裡的性別分岔隨之作廢——
  // 真的切換性別時單純重置回中性預設值，跟 Router_Narrative.gs(玩家肉體懶初始化)／heroToKanshouRow_
  // (同伴建列)同一套預設值看齊。
  if (oldSex !== newSex) {
    kpc.getRange(i + 1, COL.PC.PHYSICAL + 1).setValue(JSON.stringify({ "狀態": "如常" }));
  }
  return JSON.stringify({ success: true, pcSex: newSex, message: "已切換為「" + newSex + "」之身。" });
}

// ✏ 更改後日談御主 avatar 的名字（隨時可改）。pcId＝KPC_。
//   2026-07：關係併入眾生列(存在同伴自己那一列，不記「對誰」的名字)，改名不影響任何同伴的羈絆，無需遷移。
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


// ==========================================
// 🔴【鑑賞 AI 核心】buildDefaultSystemPrompt／actionPlay
//   🔀 2026-07 玩家定案「兩軌完全拆開，鑑賞集中在一個GS」：solo 是按鍵+AI說故事，鑑賞是依角色
//   資料自然演出、只有🔥點不點火這一個變因——兩者共用 callGeminiAPI(留在 Engine_Combat.gs)這個
//   基礎設施，但各自的系統提示詞組裝／敘事引擎不該混在一起查找。buildDefaultSystemPrompt(原在
//   Engine_Combat.gs)與 actionPlay(原在 Router_Narrative.gs)搬來這裡，跟本檔其餘鑑賞 action
//   (召喚/進場/請走/AI深化)集中一處，好查找、好維護。純檔案搬遷，函式內容逐字未動。
// ==========================================

// 🧹 2026-07 玩家定案「isNsfwMode 也不用分模式了，統合起來」：這個函式現在只可能被鑑賞(慾海)呼叫
//   ——solo(按鍵制)走完全獨立的 miniSystem(Router_Narrative.gs actionNarrateOnly)，從不呼叫這裡；
//   本函式唯一呼叫來源是 callGeminiAPI 的 systemOverride 為空時的 fallback，唯一會用空
//   systemOverride 呼叫的是 actionPlay(自由聊天引擎)，而 actionPlay 的 isNsfwMode 恆等於 pcId
//   開頭是否為 KPC_，全專案已無任何路徑把 pc.mode 設為 'full'(九州殘留、已停用)——故 isNsfwMode
//   進到這裡永遠是 true(sfwBaseRules 已刪除，見上一輪修訂)。已拿掉這個死參數與所有 if/else 分支，
//   直接寫死唯一真的會用到的版本；real runtime 上唯一還會變動的「模式」是 driveOn(🔥主動掌握)，
//   那是 actionPlay 自己組的 driveStr，不在這個函式管轄範圍內。
// 🧹 順手清：舊簽名 (isNsfwMode, backLocked) 的 backLocked 參數，函式體內從未被讀取過，一併拿掉。
//   🗑️ 2026-07 玩家定案「拿掉按鈕」：呼叫端(callGeminiAPI)當時聲稱的「config.backLocked 傳給
//   別的用途」查證後根本不存在——`aiConfig.backLocked`／前端「🔒身世鎖定」按鈕全鏈路(toggleBackLock/
//   setBackLockBtnUI/kyushu_back_locked)從沒有任何程式碼真的讀取這個值，鎖了也沒有實際保護效果，
//   已整條刪除(Script.html/Index.html 的按鈕與函式、actionPlay 的 aiConfig.backLocked 賦值)。
function buildDefaultSystemPrompt() {
  // 🗑️→✅ 2026-07 玩家定案「肉體那些欄位不需要了，只要狀態就好」：原本 1-6 數字代碼(姿勢/胸部/
  //   肉棒/蜜穴/顏面/服裝)拆得太細，逼AI每回合逐項填滿，跟下方慾海律令「禁止器官逐格交代」互相矛盾
  //   (敘事規則禁止這樣寫，schema卻逼著這樣填)。全部砍掉合併成單一自由文字欄，AI自行決定當下要不要
  //   提、提多細，不強制逐項列舉。
  const _physicalState = "本回合角色自身當下的整體狀態(姿態/表情/肉體反應/服裝當下凌亂度等，第三人稱填寫，依情境自然帶到即可，不必逐項列舉，≤40字)";

  // 🔴 npc的範本欄位填「同上」：Router_Action.gs解析intimacy_feedback時的ignoreWords防呆清單本就含「同上」，
  // 即使AI偷懶照抄範本字面值也會被當成敷衍語忽略、不會寫進玩家看到的狀態欄，省字數不引入新的失敗模式。
  const _physicalStateRef = "同上";

  const finalJson = {
    // 🔥 2026-07 玩家提案(經整合)：強制思維鏈——放範本【第一位】讓模型先自省再寫敘事，
    //   逼它每回合先定位角色被推進到哪，才動筆。後端 sanitizeAiData_ 不讀此欄→自然丟棄，
    //   不顯示給玩家、不進歷史，純粹是給 AI 自己看的思考格，零程式面副作用。
    // 🐛→✅ 2026-07(玩家明確授權)：原句要求「第一人稱自省…我原本的性格尊嚴」，逼AI用「我」寫
    //   NPC的內心獨白，緊接著卻要narration把「我」切回玩家——兩種「我」在同一份提示詞裡打架，
    //   flash-lite小模型容易把NPC的視角帶進narration。改第三人稱總結，拿掉會跟敘事視角衝突的「我」。
    // 🐛→✅ 2026-07(玩家問「用第三人稱總結本回合？？不是上回合嗎」發現措辭歧義)：「本回合主要
    //   互動對象」原意是「鎖定這回合焦點是哪個NPC」，「目前的狀態」原意是「承接自過往互動、本回合
    //   下筆前的起點狀態」——但字面容易被誤讀成「這回合(即將)發生後的狀態」，變成敘事的預寫稿而非
    //   承接歷史的定錨點，會打折「先思考後敘事」的設計初衷。改成明講「本回合開始前」，去掉歧義。
    "inner_monologue": "【必填·純思考用·絕不顯示】鎖定本回合主要互動對象(那名NPC)，用第三人稱總結其「本回合開始前」承接自過往互動的狀態(約50字，此欄不是該角色的台詞或視角，NPC本人不可用「我」自稱)。公式：[該NPC原本的性格尊嚴] vs [當下情緒與身體的真實狀態]。情緒溫度必須銜接歷史紀錄，禁止歸零重來。",
    // 🔠 2026-07 全面重寫縮字：narration 描述原本重複一份「篇幅靠情感起伏/神態心理/氛圍張力/對話堆疊
    //   撐起」的風格指示，跟下方 specificRules 第4條逐字相同——改成交叉引用，只在一處說清楚。
    "narration": "劇情描述(約500字，第一人稱，嚴禁替玩家做決定；篇幅分配依下方慾海律令第4條)...",
    // 🗺️ 2026-07 玩家定案：鑑賞拔除地圖按鈕，改AI自主敘事換場——地點完全由AI自己決定何時、換去哪，
    //   不再受限於固定地圖節點清單，可以是「一家安靜的咖啡廳」這種地圖上沒有的場景。
    //   ★鐵律：narration必須先把移動/抵達的過程實際寫出來，這欄才能填新地名；沒有移動就照抄
    //   目前地點原文，不可無故憑空跳地點(跟目前地點不同=系統認定確實移動了，會寫回存檔)。
    "location": "本回合結束時御主所在地點——若narration有實際敘述移動/抵達，填新地點名稱(可自創、不限於冬木既有地名)；沒有移動則原樣填目前地點",
    // 🐛→✅ 2026-07(玩家回報「填的欄位都正確嗎」查出)：這個欄位在先前 isNsfwMode 統合重構(合併
    //   SFW/NSFW分支)時被整個遺漏——nsfwBaseRules規則文字仍講「options固定4個...類別見下方輸出範本」、
    //   Router_Narrative.gs 仍讀 aiData.options 回傳前端渲染按鈕，範本卻沒有這個欄位可供AI照著填。補回。
    "options": ["1. [主動]強勢掌握主導...", "2. [被動]順從委婉試探...", "3. [接續]順劇情延續互動...", "4. [反差]跳脫氛圍的驚人舉動..."],
    "intimacy_feedback": {
      "_note": "★physical_state是角色「自身」當下整體狀態的一段自由文字，純肢體與感官、禁內心戲，第三人稱填寫，絕對禁寫'自己'。★每回合都要據實反映最新狀態，不可偷懶沿用舊值；具體提及哪些面向、要多細由你依當下情境自行判斷，不強制逐項列舉。npcs每位與player共用此格式，依其實際狀態填寫。",
      "player": {
        "physical_state": _physicalState,
        "dynamic_skills": "雙修技巧名(2~5字，規則見下方慾海律令第6條)"
      },
      "npcs": [{
        "name": "NPC實際名字",
        "physical_state": _physicalStateRef,
        "dynamic_skills": "雙修技巧名(2~5字，規則見下方慾海律令第6條)",
        "mutual_nicknames": "雙方間已自然發展出的暱稱/愛稱(規則見下方慾海律令第6條)"
      }]
    },
    // 🔠 2026-07：原本「名字提取鐵律」在 Router_Narrative.gs 每回合另開一整段落解釋 target 只能填真名，
    //   改直接寫進欄位描述本身——schema 級約束比事後再說一次更有效，也省掉那一整段重複文字。
    // 🐛→✅ 2026-07 玩家問「rel_changes後面幾個沒範例AI能知道怎麼用？」補了 _note 範例；追問「約定
    //   清空還有地方按嗎？達成又要去哪裡看？」才發現 major_event(未完成的約定)整條是頭尾斷開的死路
    //   ——寫入後從未被讀回餵給AI(AI看不到自己上次許過什麼，[達成]/[清空]語法講清楚也無從觸發)，
    //   玩家也沒有任何UI能查看或手動清空，玩家定案「整條拆掉」。schema 欄位一併移除，見下方
    //   `relChangesToProcess.forEach` 拿掉的處理邏輯、`COL.PC.MAJOR_EVENT` 定義處註解。
    "rel_changes": [{
      "_note": "fav_change為整數(可正可負)，關係要慢慢培養、不可躁進：日常閒聊+1~2、明顯心動或重大進展+3~5，單回合上限+5，不可一次跳大段；越界冒犯可填負數。★fav_change純粹是好感升降的數字，與口吻/語氣描述無關。tag為【關係定位】四字詞(萍水相逢/點頭之交/漸生情愫/紅顏知己等)，依好感高低填，無變化填「無」。",
      "target": "NPC真實姓名或「自己」(禁填台詞/地名/動作等其他內容)", "fav_change": 3, "tag": "無"
    }],
    // 🧹 2026-07 玩家定案「mentioned_names 這也不用了吧」：查證後這欄對鑑賞(唯一還會呼叫此
    //   schema 的路徑)已是死欄——前端(Script.html send())收到後只會 pushCandidate(name, name)，
    //   把文字換成一模一樣的文字(鑑賞早改純文字、無 hyperlink)，等於整條「算了、送了、解析了、
    //   替換了」的鏈路最終是自己換自己的無效操作，沒有任何實際效果。schema 欄位、AI 指令、後端回傳、
    //   前端消費四處一併移除。
    // 🗑️ 2026-07 玩家定案：event/tag 兩欄先前已拔除(因果表刪除後無任何代碼讀取)；這輪玩家再問
    //   「log_summary 有在用嗎」——查證其唯一消費者(交談輪數計數)累加的數字從頭到尾沒有任何地方
    //   讀回(不顯示、不當門檻、不餵回AI)，是純粹寫入從不讀取的死路，連同 subject/object 整欄一併
    //   移除，AI 不用再每回合多填這個欄位。
  };

  // 🔠 對話格式規則抽成共用函式，杜絕未來改一半、又不一致的風險。
  // 🐛→✅ 2026-07(玩家明確授權·全面重寫)：舊版嚴格限定「姓名只寫一次、動作只能在引號開頭一段、
  //   引號結束後同段落不可再補動作」——玩家要求改鬆：動作可放名字前/引號內(以聲音呈現)/引號後，
  //   不限次數與位置組合；純背景描述不需要括號、且應盡量精簡，把篇幅讓給互動本身。
  // 🐛→✅ 2026-07 二修(玩家明確授權)：原句只點出「引號內可放(聲音)」，沒講清楚引號內也可以是
  //   純(動作)、(聲音+動作)合併、甚至整句只有動作聲音沒有台詞文字；也沒強制「邊說邊動作/帶聲音
  //   時必須寫出來」，導致 AI 有時整段台詞一氣呵成、把同步發生的動作/聲音省略不寫。改成明確列舉
  //   引號內四種可能內容，並用【必須】鎖死「有邊說邊動作或有聲音就要寫出來夾進台詞裡」，不可省略。
  function dialogueFormatRule_(example) {
    return `對話格式：（角色動作或神情，例如：${example}）名字：「台詞、或（聲音）、或（動作）、或（聲音+動作），可與台詞自由交錯、也可整句僅有（動作/聲音）而無台詞文字」（角色動作或神情，可省略）。★【必須】：角色若邊說話邊有動作、或說話當下帶有聲音(如低吟／輕笑／嬌喘)，該動作或聲音都要用（）寫出來、夾在台詞中對應發生的位置，不可略過不寫。同一段落【不限制】名字出現次數、也不限制括號(動作/聲音)的使用次數與位置——可依演出彈性重複、交錯多輪對話與動作。引號全文僅用一層「」，【絕對禁止】「」內再嵌『』或再嵌一層「」。純背景／環境描述(無任何角色動作、無聲音)【不使用任何符號】，直接以敘事文字呈現，且【盡量精簡】——把篇幅留給互動本身(動作與對話)，少花筆墨鋪陳場景氛圍。`;
  }

  // 🔴 NSFW(慾海模式)：本回合聚焦當下的近身互動(情慾/調情/鋪陳皆可)，雜務(物品/金錢/陣營/任務/招募/地圖/戰鬥數值/身世)
  // 完全不追蹤、不輸出，鐵律文字大幅精簡，盡量交給AI自行判斷。
  // 🐛→✅ 2026-07(玩家明確授權)三處修正：①【意圖攔截】原本要求裁定前比對NPC的[個性]與[戰力]，
  //   但鑑賞世界觀明文禁止任何戰鬥/戰力概念(下方💕鑑賞覆寫區塊)，拿「戰力是否遜於玩家」當抗拒
  //   意圖的門檻條件跟「絕對禁止戰鬥」自相矛盾、且是無意義的假判斷——已拿掉[戰力]，只留[個性]
  //   作唯一判準。②【慢熱與傾心】原本明講「禁用傾心/道侶等極親密詞」，玩家確認不需要這條詞彙
  //   黑名單，已拿掉；「好感未滿80者嚴禁言行表現傾心倒貼」的實質行為門檻保留不動。③【狀態與輸出】
  //   原本逐一列舉「嚴禁另以stat_changes輸出生命/魔力/負面」＋「戰鬥/物品/金錢/陣營/任務不追蹤」，
  //   但 stat_changes 根本不是 finalJson schema 的欄位(從未存在、AI 沒有對應範本可填)，逐項禁止
  //   一件AI從未被要求做的事純屬空耗字數；玩家要求「就依照讀取到的資料繼續推進，其他用不到的也
  //   不要寫出來」——改成直接說明實際會用到的兩個管道(intimacy_feedback／rel_changes好感)，
  //   其餘一律「不追蹤、不輸出」概括帶過，不再逐項唱名不存在的雜務。
  const nsfwBaseRules = `你是後日談的敘事演化核心，以細膩動人的輕小說筆觸推演因果，強制台灣繁體中文。第一人稱「我」，禁上帝視角。以下為不可違背之鐵律：

【敘事與對話】
1. 絕對響應：開頭以第一人稱完整重現玩家最新動作與台詞，優先承接反轉/否定/突發，禁順預設硬寫；NPC當回合給完整態度，禁懸念。
2. 格式分段：每2~3句插入 <br><br> 換段；女子體態/動作一律用柔嫩/雪白/輕盈/婉約等柔美詞，出力亦柔中帶勁，禁陽剛男性化筆法。
3. ${dialogueFormatRule_("眼神一沉")}

【世界與NPC自主】
1. 意圖攔截(強制檢查)：玩家輸入動作僅為「意圖」非結果。裁定前先比對NPC的[個性]：非高度順從者，本回合【必須】寫出實際抗拒/閃避/拒絕，意圖未完全得逞，禁言出法隨；個性確為順從才可直接成立。
2. 慢熱與傾心：NPC依[個性][氣質]真實反應，好感未滿80者嚴禁言行表現傾心倒貼；rel_changes的tag填【關係定位】四字詞(萍水相逢/點頭之交/漸生情愫/紅顏知己等)，對應好感高低，禁填當下情緒。
3. 萌點節制：「萌點」只是反差背景彩蛋，【絕對禁止】每回合或連續多回合刻意觸發、反覆強調成唯一性格；預設略過，僅場景自然涉及時輕輕帶過，同一萌點至少間隔數回合不重複。

【狀態與輸出】
1. 本回合聚焦當下近身互動(情慾/調情/對話/鋪陳皆可，依劇情自然推進，不必每回合導向情慾)：肢體/感官/姿勢狀態填入intimacy_feedback；好感依rel_changes推進，其餘不追蹤、不輸出。位置由你自主決定填入location(見上方換場地規則)，不受地圖節點限制。
2. 只輸出合法JSON，options固定4個、順序不可變、每項20字(類別見下方輸出範本)。`;

  // 🐛→✅ 2026-07(玩家明確授權)：第4條原本只列「情感起伏/神態心理/氛圍張力/對話堆疊」當篇幅來源，
  //   漏了肢體動作/喘息/聲音這幾種同樣該撐起篇幅的元素；「台詞被嬌喘打斷」也把中斷手法窄化成單一
  //   詞「嬌喘」，玩家要求擴充成「可斷續、喘息、聲音都可以」。已補上肢體動作/喘息與聲音進篇幅來源
  //   清單，中斷手法改成「喘息、聲音或斷續語句」三種、不限嬌喘一種寫法。
  const specificRules = `
【慾海律令】
你擅長書寫細膩動人的情慾，放手去寫，以下只是少數底線：
1. 【先思考，後敘事】禁直接開寫narration！先在inner_monologue依對話歷史定位「本回合主要互動對象」的情緒溫度與親密階段(抗拒/拉扯/沉溺，或甜蜜/依偎/主動索求——依角色意願與好感判斷，非必經流程)，再依此下筆；這段第三人稱總結遵循【角色一致性鐵律】：呈現NPC用原本人格承受當下一切。
2. 【絕不重置】每次回應必須繼承歷史情緒溫度，已推進的親密/情動階段本回合不可無故退回冷淡或抗拒；降溫只能因劇情明確事件(被打斷/翻臉/受驚/離開)，不因換一次呼叫就歸零。
3. 【依配對裁決】依上方【性別配對】——女女配對：純女女之愛，無論誰主導皆纏綿體貼、有來有往，主動方亦柔中帶情，❌禁男性化強硬支配模板；男女配對：依實際性別器官自然互動，女性側動作仍柔美。
4. 聚焦當下最關鍵一兩處深入著墨，篇幅靠情感起伏/神態心理/氛圍張力/肢體動作/喘息與聲音/對話堆疊撐起，非鋪滿全身；❌禁逐一點名全身部位、禁四感清單式流水帳、禁器官逐格交代；台詞可被喘息/聲音/斷續語句打斷，不限嬌喘，勿一氣呵成。
5. physical_state為單一自由文字(第三人稱)，涵蓋姿態/表情/肉體反應/服裝凌亂度等，依情境帶到即可不強制列舉；每回合據實反映最新狀態不可沿用舊值，脫離接觸可帶到「鬆開/餘韻」。★純系統記錄，narration仍以第4條為準、聚焦留白，不逐格謄寫。
6. 粗暴動作轉紅印/酥麻/強烈快感，禁肉體破損流血。dynamic_skills(2~5字，貼合身分個性)/mutual_nicknames(已自然發展且好感足夠的暱稱)：僅本回合確實發生/存在才填，毫無相關內容一律填「無」，不預設空白或提前腦補。`;

  return nsfwBaseRules + "\n" + specificRules + "\n\n★【輸出範本】\n" + JSON.stringify(finalJson, null, 2);
}

function actionPlay(userData, pcId, sheets) {
  const userMsg = userData.message;
  // 🌹 慾海(KPC_ 御主)專用引擎：前端自由聊天輸入框只在 pc.mode==='kanshou' 才顯示(Script.html
  //   applyModeUI)，且鑑賞玩家自己的 pcId 恆為 KPC_ 前綴——查證全 gas/ 目錄已無任何路徑把
  //   pc.mode 設為 'full'(九州殘留、已停用)，故這裡不會再有 solo/SFW 呼叫路徑。早期版本曾信
  //   前端 userData.isNsfw 旗標判斷 SFW/NSFW(埋下「鑑賞切回 solo 忘記取消勾選、殘留 true 污染
  //   solo」的漏洞)，後端曾改成純看 pcId 前綴路由；2026-07 玩家定案「isNsfwMode 也不用分模式
  //   了」——既然這條路徑只可能是鑑賞，直接在入口擋下非 KPC_ 呼叫(定位錯誤好過悄悄套錯規則)，
  //   函式其餘部分不再分支，永遠當作鑑賞/NSFW 情境處理。
  if (String(pcId || "").indexOf("KPC_") !== 0) return JSON.stringify({ text: "此功能僅限鑑賞使用。", people: [] });
  // 🔥 主動掌握開關(2026-07 玩家定案·原nsfw開關重生)：現在 real runtime 上唯一還會變動的「模式」。
  const driveOn = (userData.drive === true || String(userData.drive) === "true");
  const finalUserMsg = `【玩家意圖】：${userMsg}`;

  const formatPref = (str) => {
    let arr = String(str || "").split('、');
    // 喜好與厭惡是常態情報，全面開放給 AI 參考
    return `[表象]${arr[0] || "無"} [內裡]${arr[1] || "無"} [喜歡]${arr[2] || "無"} [討厭]${arr[3] || "無"}`;
  };

  // 🐛→✅ 2026-07(玩家授權·同批修正)：[自稱] 這格內容通常已是「自稱「我」」這類完整片語——
  //   跟 servantCard_ 同一種collision(見 Router_Persona.gs 同批修正)，「我」字面緊鄰在敘事視角
  //   說明附近，flash-lite小模型容易混淆。標籤加註明確限定範圍，與 servantCard_ 的修法一致。
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



  // 🧹 2026-07：knockedOutList/justRevived/fatePlayerDefeat/fateDreamPrompt/freshlyBoundNpcName
  //   清掉——這幾個是 solo 戰鬥引擎的殘留概念(擊倒/復活/戰敗虛假之夢/剛結盟NPC排除)，鑑賞世界觀
  //   明文禁止任何戰鬥/血量變化/死亡威脅，這幾格在這個函式裡從頭到尾只會是初始值，從未被賦過值，
  //   下方回傳物件對應欄位跟著一起拿掉。
  const dirtyPcRows = new Set();
  // 玩家本人一定會被處理到，先加進去
  dirtyPcRows.add(pcIndex);



  const currentAmbition = pc[COL.PC.INTENT] ? String(pc[COL.PC.INTENT]).trim() : "尚無明確目標，隨遇而安。";

  // 🔵 實例化：只取自己 game_id 世界內、同地點的人（御主無 game_id 時不過濾，相容舊角色）
  const myGameId = pc && pc[COL.PC.GAME_ID] ? String(pc[COL.PC.GAME_ID]) : "";
  const sameGame = (r) => !myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId;

  // 🐛→✅ 2026-07 修：「專屬稱呼」記憶點原本只加在 localSceneStr(同地路人清單)，但那份
  //   明確排除「同行隊伍成員」——鑑賞的同伴全部是 IS_PARTY="同行"、只會出現在下面 partyDetailsArr，
  //   等於唯一真正常互動的對象反而吃不到這個標籤(solo友善對話/切磋等免按鍵互動同樣受影響)。
  //   抽成共用函式，兩份清單一起補上，不重複貼一次解析邏輯。
  // 🗑️ 2026-07 玩家定案「未完成的約定整條拆掉」：原本這裡也讀 [已兌現] 餵「一起做過」記憶點，
  //   但它唯一的寫入來源(major_event的[達成]處理)已整段移除，往後不會再有新的[已兌現]資料——
  //   拿掉這段讀取，只留專屬稱呼。
  function relMemMemoryStr_(relMem) {
    const s = String(relMem || "");
    const nickMatch = s.match(/\[專屬稱呼\](.*?)(?=\| \[|$)/);
    const nickTrim = nickMatch ? nickMatch[1].trim() : "";
    const nickStr = (nickTrim && nickTrim !== "無") ? ` [專屬稱呼:${nickTrim}]` : "";
    return nickStr;
  }

  // 🧹 2026-07 玩家定案「砍掉同地路人、這是開放大世界、沒有結界了」：舊版 allLocals/displayPeople/
  //   localSceneStr(好感階梯 resistPrompt/身分標籤)整套刪除。實務上這套機制在鑑賞幾乎是死重——鑑賞
  //   從不會平白生出「同地路人」這種被追蹤好感的固定NPC，唯一會命中的邊角情況是「已請走、還留在原地
  //   的舊同伴」被誤判成陌生路人重新演一次戒備——這比沒有這套機制更奇怪。改成單純的「開放世界背景
  //   人煙」指令(見下方【開放世界·背景人煙】)：路人可以自由描寫增添生活感，但不具名、不追蹤好感、
  //   不能被指名互動——真正能被指名、有名有姓、好感會被記錄的對象，只有【同行隊伍成員】。
  const partyRows = pcData.filter(r => r !== pc && String(r[COL.PC.IS_PARTY] || "") === "同行" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
  const partyMembers = partyRows.map(r => r[COL.PC.NAME]);
  let partyDetailsArr = [];
  partyMembers.forEach(pName => {
    // ⚠ 2026-07 修：原本純比對姓名，沒有 sameGame——若不同局/不同帳號剛好撞名(種子有限、
    //   AI原創從者皆可能撞)，會把別局同名者的 HP/身世/狀態塞進本局的敘事提示詞。
    const r = pcData.find(row => String(row[COL.PC.NAME]).trim() === String(pName).trim() && !String(row[COL.PC.ID]).startsWith("DEAD_") && sameGame(row));
    if (r) {
      const pOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👗 玩家換裝：當前服裝穿著(換衣不換人)
      // 🐛→✅ 鑑賞同伴的 氣血/狀態 是死資料(2026-07 修，同款「STATUS/HP 建角後從沒更新過」問題)：
      //   鑑賞無戰鬥，HP恆定不變、STATUS(視覺化外顯)也已被physical_state取代——每回合把這兩個
      //   永遠不變的欄位塞進提示詞純屬浪費token；solo那邊HP/STATUS是真的會隨戰鬥/休息即時變動，
      //   維持原樣。
      const pMemStr = relMemMemoryStr_(r[COL.PC.REL_MEM]);
      // 🐛→✅ 2026-07 玩家回報「鑑賞同伴的萌點沒餵到AI」：查出萌點(COL.PC.INTENT)只寫在已刪除的
      //   localSceneStr，而鑑賞同伴一律是同行隊伍成員、從不會出現在那份清單——同伴的萌點過去
      //   從未真正餵給AI過。這裡補上，跟 servantCard_/localSceneStr(已刪)看齊。
      const pMoeStr = String(r[COL.PC.INTENT] || "").trim();
      // 🐛→✅ 2026-07 玩家反映「鑑賞敘述看不出來是從者本人，像在跟很像的別個角色相處」：查出根因——
      //   種子人設裡最能定義「這人講話就是這個味道」的兩項(persona.speech口吻／persona.tic招牌小動作，
      //   如「毒舌吐槽、嘴硬心軟」／「握劍時氣場驟冷」)，召喚時早就透過 stampPersonaFlavor_ 存進
      //   MEMORY 的【口吻】【小動作】標記——但 servantCard_(solo戰鬥/羈絆/移動等多處都會讀這兩項)
      //   從未被 actionPlay 呼叫過，這裡是自己另組一套精簡版命格字串，從頭到尾沒把這兩項餵給AI，
      //   只剩日常化翻譯過的性格(可能已偏淡)＋外貌——AI 自然演不出這個角色的招牌語癖與小動作。
      //   getPersonaSpeech_/getPersonaTic_(Router_Persona.gs)已是現成 helper，直接複用讀 MEMORY。
      // 🐛→✅ 2026-07 稽核修正：查無時原本退回 codexPersona_ 的戰時原始 speech/tic(如「狂化無法
      //   言語、僅餘低吼」)，跟「沒有聖杯戰爭這回事」矛盾。speech改退回 dailySpeechByName_(取
      //   dailyLook第3段的日常安全版)；tic(招牌小動作)沒有對應日常版，查無MEMORY標記時直接留空，
      //   不再退回戰時原始值——私密一面(dailyLook第4段)已承擔「角色專屬小習慣」的功能。
      const pSpeech = getPersonaSpeech_(r[COL.PC.MEMORY]) || dailySpeechByName_(pName);
      const pTic = getPersonaTic_(r[COL.PC.MEMORY]);
      const pFlavorStr = `${pSpeech ? ` | 口吻:${pSpeech}` : ""}${pTic ? ` | 招牌小動作:${pTic}` : ""}`;
      partyDetailsArr.push(`【同行夥伴】名號:${pName} | 身世:${r[COL.PC.BACK] || "無"}${pOutfit ? ` | 裝扮:${pOutfit}(當前服裝·五官體態不變)` : ""} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])}${pFlavorStr}${pMoeStr ? ` | 萌點(反差·僅供內化):${pMoeStr}` : ""} | 關係:${r[COL.PC.REL_TAG] || "結伴同行"}(好感:${parseInt(r[COL.PC.BOND]) || 0}${pMemStr})`);
    }
  });
  const PROMPT_PARTY_SYSTEM = partyDetailsArr.length > 0 ? `【目前同行隊伍成員命格詳情】:\n${partyDetailsArr.join("\n")}` : "目前沒有同行夥伴，玩家是獨自行動的。";

  const backgroundCrowdStr = `★【開放世界·背景人煙】：這是有血有肉的開放世界，不是與世隔絕的私密結界——場景中可以自由描寫路過的行人、店員、其他顧客等不具名的背景人物，增添生活感與人煙氣息；但這些背景人物僅供氛圍點綴，【不具名、不可被指名互動、不追蹤好感或關係】。真正能被指名對話、持續互動、且好感/關係會被記錄延續的對象，僅限【目前同行隊伍成員】。`;

  // 🟢 性別配對提示，直接算好給 AI，不需要它自己推理。
  // 🔠 2026-07 全面重寫縮字：原本逐一 NPC 各寫一整句配對規則，3人同場(kanshou上限)時
  //   同款「女女配對：...肉棒代碼(4)不輸出、不寫「無」」的長句會逐字重複3遍——改成先分組
  //   (與玩家同性/異性)，同組共用一句規則、只在句首列名字，規則邏輯完全不變。
  let genderHintStr = "";
  const presentRowsForGender = pcData.filter((r, i) => i !== 0 && r[COL.PC.ID] != pcId && r[COL.PC.LOC] === curL && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (presentRowsForGender.length > 0) {
    const playerSex = pc[COL.PC.SEX] || "未知";
    // ⚠ 2026-07 修：原本非「女/女」「男/男」的組合一律落入模糊的「依雙方實際性別器官裁決」，
    // 「異/無」(如開膛手傑克「無固定實體」)這類非二元性別值完全沒被正規化。玩家定案：不開放
    // 男男配對(邀請關卡已擋)，故這裡只會遇到 女/女、男/女、女/男、或某方為異/無 這幾種——
    // 異/無 一律按女性向器官處理(對齊 heroToKanshouRow_ 的肉體起始預設，且與傑克本身
    // 「不自覺化身少女模樣」的角色設定一致)。
    // ⚠ 只有「女女」是特殊配對(男男邀請關卡已擋、理論不可達，故不比照女女套用同一段措辭，
    //   維持跟改寫前完全相同的分支條件：只有 playerSex==="女" && npcSex==="女" 才進特殊組)。
    const sameSexF = [], others = [];
    presentRowsForGender.forEach(r => {
      const npcSexRaw = r[COL.PC.SEX] || "未知";
      const npcSex = (npcSexRaw === "男" || npcSexRaw === "女") ? npcSexRaw : "女";
      (playerSex === "女" && npcSex === "女" ? sameSexF : others).push(r[COL.PC.NAME]);
    });
    // 🗑️→✅ 2026-07 玩家定案「肉體欄位不需要了、只要狀態就好」：physical_state 已從器官數字代碼
    // 簡化成單一自由文字欄，這裡不再需要提「肉棒代碼(4)」/「男4=肉棒／女5=蜜穴」這類 schema 層級
    // 的指示，只留下真正影響敘事內容本身的配對規則(女女之愛的手法限制)。
    const parts = [];
    if (sameSexF.length) parts.push(`${sameSexF.join("、")}(女女配對)：純女女之愛，禁插入式陽具動作，以手指/舌頭/器物替代`);
    if (others.length) parts.push(`${others.join("、")}：依各自實際性別自然互動`);
    genderHintStr = parts.length ? `\n★【性別配對】：${parts.join("；")}。` : "";
  }

  let pPhysicalObj = JSON.parse(pcData[pcIndex][COL.PC.PHYSICAL] || "{}");
  // 🗑️→✅ 2026-07：physical_state 簡化成單一「狀態」欄後，預設值不再需要依性別分岔(器官專屬鍵已不存在)。
  if (Object.keys(pPhysicalObj).length === 0) pPhysicalObj = { "狀態": "如常" };
  let pSkills = (pcData[pcIndex][COL.PC.MEMORY] || "無").replace(/\[雙修技巧\](.*?)(?=\| \[|$)/, (m, p1) => `[雙修技巧]${p1.trim().split('、').slice(0, 5).join('、')}`);
  // 🐛→✅ 2026-07 玩家定案整合：STATUS(視覺化外顯，衣服/姿勢/負面/顏面)已退役——姿勢動作/顏面已併進
  //   physical_state(見下方[肉體])，這裡不再重複注入即將永遠凍結的舊欄位。
  let nsfwMemories = `\n[玩家『${pcName}』肉體]：${JSON.stringify(pPhysicalObj)}\n[身體記憶]：${pSkills}`;

  let allPresentRows = pcData.filter((r, i) => i !== 0 && r[COL.PC.ID] != pcId && r[COL.PC.LOC] === curL && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  allPresentRows.forEach(r => {
    let npcPhysicalObj = JSON.parse(r[COL.PC.PHYSICAL] || "{}");
    if (Object.keys(npcPhysicalObj).length === 0) npcPhysicalObj = { "狀態": "如常" };
    let npcSkills = (r[COL.PC.MEMORY] || "無").replace(/\[雙修技巧\](.*?)(?=\| \[|$)/, (m, p1) => `[雙修技巧]${p1.trim().split('、').slice(0, 5).join('、')}`);
    let relMem = r[COL.PC.REL_MEM] || "無";
    let npcOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👗 玩家換裝：當前服裝穿著(換衣不換人·五官體態依本相)
    // ⚠ 2026-07 修：萌點併進上面共用的 localSceneStr(SFW/NSFW 皆讀)後，這裡不再重複附一次。
    nsfwMemories += `${npcOutfit ? `\n[${r[COL.PC.NAME]} 裝扮]：${npcOutfit}（玩家指定當前服裝·五官/髮色/體態不變）` : ""}\n[${r[COL.PC.NAME]} 肉體]：${JSON.stringify(npcPhysicalObj)}\n[快照]：[技巧]${npcSkills} | [羈絆]${relMem}`;
  });

  // 🔥 主動掌握模式(driveOn)：翻轉「誰主導節奏」——平時的矜持限制(慢熱/被動等玩家推進)換成
  //   同伴主動出擊；玩家的迴避/抽身意圖會被依個性攔下(與「意圖攔截·玩家意圖非結果」鐵律同向，
  //   不衝突)。主動的【形式】仍依好感與個性：低好感的主動是強勢試探/挑釁/戲弄的攻勢(非傾心倒貼，
  //   與慢熱鐵律不牴觸)，高好感才是不加掩飾的索求。個性一致性鐵律照常有效。
  // 🐛→✅ 2026-07 玩家強化：這開關不是「同伴可能主動一下」，而是玩家會確實被同伴依個性榨乾、
  //   沒有回頭路；同時要跟「敘事別收尾」鐵律相容(不強迫每回合都寫到終點，但每回合都要往這個
  //   方向確實前進)。
  // 🔠 2026-07 全面重寫縮字：原文用兩份幾乎相同的「依個性列出4種類型反應」清單(一份講攻勢起手、
  //   一份講榨乾方式)重複描述同一件事——合併成一份，走向確定性與招架不住的畫面感都保留。
  const driveStr = driveOn ? `
🔥【主動掌握模式·玩家已明確開啟】：本回合起，在場同伴主動掌握節奏、推進互動——手法必須貼合她/他本人真實的性格與語癖去把玩家逼向毫無招架餘地，禁止套用固定公式或別的角色的手法；玩家若試圖迴避、轉移話題、抽身離開，同伴會依個性攔下、堵住退路、追上來，營造「想跑也跑不掉」的壓迫與心跳感。★這走向確定不可逆，不必每回合寫到終點，但每回合都要確實往前推進，不可退回平日矜持基準。注意：①主動的【形式】仍依好感高低——低好感是強勢試探/挑釁/戲弄的攻勢而非傾心示愛，高好感才不加掩飾索求；②【角色一致性鐵律】仍完全有效，禁千篇一律的霸道模板；③壓迫止於情境張力，嚴禁真正傷害玩家；④★文字尺度同步拉到最滿——這個模式下的情慾描寫可以毫不含蓄、直白露骨地放手寫，不必比照平日的留白節制，篇幅分配規則(慾海律令第4條)仍要遵守，但用詞與畫面感不必收斂。` : '';

  // 🧹 2026-07 玩家定案「isNsfwMode 也不用分模式了，統合起來」：PROMPT_ENV/PROMPT_GEAR(舊「戰爭
  //   迷霧偵查」/「陣營情報·裝備」九州殘留框架，鑑賞從未真的用過，恆為空字串)、SFW 分支(PROMPT_GEAR
  //   曾是寶具/技藝、PROMPT_REL 曾是純背景人煙)已隨這輪整理一併刪除——這條路徑現在只可能是鑑賞，
  //   只留鑑賞真正會用到的 PROMPT_REL 版本；prompt 模板裡對應的兩個占位行也一併拿掉。
  const PROMPT_REL = `${backgroundCrowdStr}
★【視角鎖定】：以上「同行夥伴」卡片內「自稱」只限她/他自己的引號台詞——通篇敘事旁白的「我」永遠、只能是玩家『${pcName}』本人，絕不可把在場任何一位角色的心境或反應誤寫成旁白第一人稱。
★【情境延續鐵律】：請繼續往後推演！${nsfwMemories}${genderHintStr}${driveStr}
🛑【角色一致性鐵律】：NPC 的反應必須【死守】其「性格」與目前「好感度」的真實落差——好感未滿 80、或性格屬於冷酷/高傲/剛烈者，依這個設定判斷此刻合理的抗拒/抵觸程度演出，不因劇情推進就無視好感度線性軟化。即便肉體有生理反應，靈魂與對話的態度仍以角色設定為準。真正的沉溺不是放棄人格，而是【用原本的人格去承受快感】——高傲者咬牙不肯示弱、虔敬者於信仰間掙扎、活潑者笑鬧裡藏羞、深情者愈發黏膩——語癖、自稱與個性在最激烈處也不崩壞，【絕對禁止】任何角色在情慾中退化成千篇一律的發情機器。`;

  // ⚠ 2026-07 修：原句「請包含...的對話」讀起來像強制指令全員都要出聲——玩家只想找同行從者講話，
  //   卻可能被這行逼得連背景路人都插話。改成「姓名參考用」措辭：只提供正確姓名給 AI 拼字用，
  //   是否真的互動仍完全依上方【在場驗證鐵律】與各人的強制互動限制判斷。
  const npcDialoguePrompt = partyMembers.length > 0 ? `\n★【姓名參考】：若對話對象是同行夥伴，請使用真實姓名「${partyMembers.join("、")}」，不得另編新名字；是否互動仍依上方在場規則與各人強制互動限制判斷，非清單所有人都要出聲。` : "";


  // 🔴【替換開始】淨化後的 prompt 組裝
  const prompt = `【敘事法旨】：當前推演視角鎖定為玩家『${pcName}』(ID: ${pcId})。
${PROMPT_PARTY_SYSTEM}
【玩家命格】：名號:${pcName} 【性別:${pc[COL.PC.SEX]}】 性格:${pc[COL.PC.PREF]} | 特徵:${pc[COL.PC.TRAIT]} | 軟肋:【 ${currentAmbition} 】 | 身世:${pc[COL.PC.BACK] || "來歷不明"} | 位置:${curL} | 生命:${pc[COL.PC.HP]}/${pc[COL.PC.MAX_HP]} | 魔力:${pc[COL.PC.MP]}/${pc[COL.PC.MAX_MP]}${((parseInt(pc[COL.PC.HP]) || 0) <= Math.max(1, Math.round((parseInt(pc[COL.PC.MAX_HP]) || 1) * 0.15)) || (parseInt(pc[COL.PC.MP]) || 0) <= Math.round((parseInt(pc[COL.PC.MAX_MP]) || 1) * 0.1)) ? '\n★【瀕死·最高張力】御主氣力放盡、命懸一線(見上方血/魔)——敘述須透出窒迫沉重、孤注一擲的緊繃，連從者氣場都因御主將枯竭而繃緊；嚴禁輕鬆閒適的閒聊感。' : ''}

${PROMPT_REL}
★【在場驗證鐵律——最高優先級，下筆前必看】：本回合可被指名對話、持續互動、且好感/關係會被記錄延續的角色僅限【目前同行隊伍成員】；背景路人可自由描寫增添氣氛(見上方【開放世界·背景人煙】)，但一律不具名、不可被指名互動、不追蹤好感，【絕對禁止】把某個背景路人寫成有名有姓、持續登場的固定角色。唯獨玩家本回合輸入內容【明確主動】表達邀請、招呼、引入第三人等意圖時(如呼喚他人加入、開門讓人進來等)，才可讓該玩家指定或暗示的新角色登場並開始被指名互動。歷史紀錄、話題情報中提到但不在【同行隊伍成員】內的姓名，僅視為不在場的回憶，嚴禁無視此規則憑空召喚、穿越或讓其開口說話、出手！
💕【鑑賞·後日談模式·最高優先級覆寫】：${partyRows.length === 0
    ? `這裡是平行世界的和平都市日常——聖杯戰爭這回事從未在這個世界發生過，眼下沒有同行的英靈在場，就是御主一人的尋常時光。`
    : partyRows.every(r => String(r[COL.PC.ID]).indexOf("KHV_") === 0)
      ? `『${partyMembers.join("、")}』是剛從英靈殿被召喚而來——這不是並肩打過聖杯戰爭的緣分，是彼此【初次相遇】的日常時光，讓相處自然生澀、依好感漸漸升溫，嚴禁暗示雙方早已相熟或曾並肩作戰。`
      : `這裡是平行世界的和平都市日常，聖杯戰爭這回事從未真正發生過，與『${partyMembers.join("、")}』共度的是尋常相處的時光，嚴禁提及聖杯爭奪或並肩作戰的往事。`
  }
🕰️現在是 ${realWorldClockStr_()}，僅供揣摩場景氛圍與時段感(如深夜靜謐、清晨慵懶)，不必刻意報時或提及具體數字。
★世界觀＝和平的現代都市日常：【絕對禁止】任何戰鬥、廝殺、敵人、聖杯爭奪、靈基受損、血量／生命變化、寶具對轟、死亡或威脅，世界是安全的；但節奏與親密程度依劇情、好感與玩家/同伴當下意圖自然發展，可以是散步閒聊的尋常時光，也可以是更靠近、更熱烈的相處，不強制鎖在「悠閒」基調(尤其🔥主動掌握模式開啟或情慾已自然升溫時)，讓從者貼近其官方性格自然地與御主相處互動。
★【演出而非說明】不得直述其願望／萌點／個性字面。僅可有 rel_changes(好感)，不輸出任何生命變化或戰鬥裁決。
★【換場地】地點不受地圖限制，你可自主決定何時、換去哪(不限於冬木既有地名，可自創如「一家安靜的咖啡廳」)——但【絕對禁止】無故憑空跳地點：須先在narration把移動/抵達的過程實際寫出來，location欄位才能填新地名；沒有移動就讓location原樣照抄目前地點。
現在演化玩家動作：『${finalUserMsg}』${npcDialoguePrompt}

${driveOn ? `🚨【敘事終極警告·主動掌握模式】：同伴主導推進，本回合可以確實大幅向前推展——不必像平日矜持模式那樣每次都停在剛起步的瞬間，讓「步步進逼」的壓迫感真的往前走、玩家打少少字也能推進不少。但仍【絕對禁止】把這整段相處寫成「那一夜／自此／就這樣／從此」等總結收尾句，不可讓這回合讀起來像已經翻頁的完結篇章——停在「我」當下進行式的心境與情緒中，留一點空間給玩家插入反應、喊停或喘息，而非停在原地一動也不動。`
    : `🚨【敘事終極警告】：結果後必須停在「我」當下進行式的心境與情緒中，留一個未完成的動作、未說完的話或懸而未決的情緒把下一步交還玩家——【絕對禁止】寫出「那一刻／那一夜／自此／就這樣／從此」等總結收尾句，讓這回合讀起來像已經翻頁的完結篇章！`}`;

  try {
    // 🔥 2026-07 玩家定案「沒有點火接gemini3.1(SOLO_MODEL)，點火才接目前鑑賞的(AI_MODEL)」：平時
    //   矜持模式(driveOn=false)換成跟solo共用的低延遲小模型，只有主動掌握模式(driveOn=true)才切回
    //   鑑賞原本用的大型模型——大多數回合是輕鬆日常對話，犯不著每次都吃重量級模型的延遲。
    let aiConfig = { temperature: 1.0, top_p: 0.95, retries: 2, model: driveOn ? AI_MODEL : SOLO_MODEL, isNsfwMode: true };
    // 🔥 2026-07 玩家追加定案「沒點火時如果被攔截或對話失敗改用DeepSeek」：SOLO_MODEL(輕量模型)全部
    //   重試失敗後，callGeminiAPI(Engine_Combat.gs)會自動換成 AI_MODEL 再試一輪——點火時已經在用
    //   AI_MODEL，沒有更重的模型可逃生，不設定 fallbackModel。
    if (!driveOn) aiConfig.fallbackModel = AI_MODEL;

    // 🔴【新增】抓取近 6 筆原始歷史(3輪)，轉換為 API 格式
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




    let memoryMapData = getMapDataCached(sheets);
    // 🧹 2026-07 清除死碼：這裡原本有一段處理 aiData.new_maps(讓AI在鑑賞自由擴張地圖節點)的邏輯，
    //   但 Engine_Combat.gs 的 finalJson schema 從來沒有要求 AI 輸出這個欄位，AI 從未真的產生過
    //   new_maps，整段是從未觸發的死碼。隨著下方「鑑賞拔地圖」一併清掉，不用先加欄位才發現沒人吃。
    //
    // 🗺️ 2026-07 玩家定案：鑑賞拔除地圖按鈕，改AI自主決定地點——每回合讀 aiData.location 直接寫回
    //   LOC，不再需要固定地圖節點清單。玩家與同行同伴(IS_PARTY="同行")的 LOC 一起同步，跟 solo
    //   actionMove 移動全隊的既有邏輯一致(該函式完全不動，這裡只是鑑賞另一條路徑)。
    const aiLoc = String(aiData.location || "").trim().slice(0, 20);
    if (aiLoc && aiLoc !== curL) {
      pcData[pcIndex][COL.PC.LOC] = aiLoc;
      dirtyPcRows.add(pcIndex);
      pcData.forEach((r, nIdx) => {
        if (nIdx === pcIndex) return;
        if (String(r[COL.PC.IS_PARTY] || "") !== "同行") return;
        if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
        if (!sameGame(r)) return;
        pcData[nIdx][COL.PC.LOC] = aiLoc;
        dirtyPcRows.add(nIdx);
      });
      curL = aiLoc;
    }

    // 🔴 血量快照：記錄所有人變化前的血量，供結尾比對真實扣血
    const hpSnapshot = {};
    pcData.forEach((row, idx) => {
      if (idx === 0) return;
      if (String(row[COL.PC.ID] || "").startsWith("DEAD_")) return;
      hpSnapshot[idx] = parseInt(row[COL.PC.HP]) || 0;
    });
    const mpBefore = parseInt(pcData[pcIndex][COL.PC.MP]) || 0;


    // 🗑️ 2026-07：stat_changes(外顯狀態刷新)套用區塊已整組移除(玩家定案)——solo 戰鬥演出卡/戰報
    //   從不讀 STATUS，卡片外顯恆顯示預設「穿戴整齊，站立，氣息平穩」＝AI寫、無人讀的死資料迴圈；
    //   SFW schema 的 stat_changes 欄位與「狀態刷新」指令已同步自 Engine_Combat.gs(SFW區) 拔除。
    //   慾海不受影響：其外顯/肉體走 intimacy_feedback(physical_state·紅線機制·見下方，2026-07 已整合
    //   姿勢/顏面進同一欄，visible_state 機制退役)，且已改由「肉體狀態」抵換外顯的顯示位。








    // 經濟層（物品/金錢/任務）已全數移除：items_gained / items_transferred / money_transferred / items_lost / items_used 不再落地。

    let dismissedNpc = userMsg.includes("解除了組隊同行關係") ? (userMsg.match(/與「(.*?)」解除/) || [])[1]?.trim() || "" : "";

    {
      const relChangesToProcess = aiData.rel_changes || [];
      if (dismissedNpc && !relChangesToProcess.find(r => r.npc === dismissedNpc)) relChangesToProcess.push({ npc: dismissedNpc });

      relChangesToProcess.forEach(rc => {
        const tNpc = rc.target ? String(rc.target).trim() : String(rc.npc).trim();
        if (tNpc === pcName || tNpc === "自己") return;

        // 羈絆已併入該 NPC 自己列（BOND/REL_TAG/IS_PARTY/MAJOR_EVENT）——找不到該人此局的列就無可寫入。
        const nIdx = pcData.findIndex(r => String(r[COL.PC.NAME]) === tNpc && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
        if (nIdx === -1) return;
        dirtyPcRows.add(nIdx);

        // 🌹 鑑賞允許好感依劇情推進（solo 的好感收歸 GAS 按鈕，走不同的 narrate_only 路徑，不受這裡影響）
        // 🔄 2026-07 玩家定案「好感改回數字」：先前試過「AI只給方向旗標(tone/fav_dir)、GAS對應固定
        //   ±2」，但改名成fav_dir修好「好感不會增加」的語意衝突bug後，玩家仍決定改回讓AI直接填數字——
        //   換回 fav_change(整數)，實際增減幅度依 _note 的級距指引由AI自行判斷(日常+1~2/心動+3~5，
        //   單回合上限+5)，不再由GAS對應固定值。sanitizeAiData_ 的數值防呆同步復原(見該函式)。
        let change = parseInt(rc.fav_change) || 0;
        let isPartyStr = String(pcData[nIdx][COL.PC.IS_PARTY] || "");
        if (dismissedNpc === tNpc) isPartyStr = "";

        let oldFav = parseInt(pcData[nIdx][COL.PC.BOND]) || 0; let oldTag = pcData[nIdx][COL.PC.REL_TAG] || "萍水相逢";
        let newFav = Math.max(-100, Math.min(100, oldFav + change));

        let finalTag;
        {
          let aiProvidedTag = (rc.tag && typeof rc.tag === 'string') ? rc.tag.trim() : "";
          let isValidAiTag = aiProvidedTag !== "" && aiProvidedTag !== "無" && !aiProvidedTag.includes("禁止");
          finalTag = isValidAiTag ? aiProvidedTag : oldTag;
        }

        pcData[nIdx][COL.PC.BOND] = newFav; pcData[nIdx][COL.PC.REL_TAG] = finalTag; pcData[nIdx][COL.PC.IS_PARTY] = isPartyStr;
        // 🗑️ 2026-07 玩家定案「整條拆掉」：major_event(未完成的約定)整段處理邏輯移除——查證發現
        // MAJOR_EVENT 這欄寫入後從未被讀回餵給AI(partyDetailsArr/relMemMemoryStr_都不讀這欄)，
        // AI 每回合看不到自己上次許過什麼，[達成]/[清空]語法即使講清楚也無從合理觸發；玩家也完全
        // 沒有UI能查看或手動清空——整條是頭尾斷開的死路，見 COL.PC.MAJOR_EVENT 定義處註解。
      });
    }



    if (aiData.intimacy_feedback) {
      // 🔴 防禦機制：過濾掉 AI 偷懶不想更新狀態時的敷衍用語
      const ignoreWords = ["維持現狀", "無變化", "不變", "維持", "同上", "保持現狀", "沒有變化"];

      // 🗑️→✅ 2026-07 玩家定案「肉體那些欄位不需要了、只要狀態就好」：physical_state 從6鍵數字代碼
      //   (姿勢/胸部/肉棒/蜜穴/顏面/服裝)全部砍掉，合併成單一自由文字欄——連帶讓上一輪才修的「依性別
      //   擋掉矛盾器官鍵」邏輯整段作廢(沒有器官專屬鍵了，性別矛盾這個問題不可能再發生)。
      const sanitizePhysicalState = (rawState) => {
        if (typeof rawState !== 'string') return "";
        const val = rawState.trim();
        return (!val || ignoreWords.includes(val)) ? "" : val;
      };


      const processSkills = (oldMem, newSkillsStr) => {
        let skillMap = {}; let oldSkills = (oldMem.match(/\[雙修技巧\](.*?)(?=\| \[|$)/) || [])[1]?.trim() || "";
        if (oldSkills && oldSkills !== "無") oldSkills.replace(/^\.\.\./, "").split('、').forEach(p => { let m = p.match(/(.+?)\(Lv\.(\d+)\)/); if (m) skillMap[m[1].trim()] = parseInt(m[2], 10); else if (p.trim()) skillMap[p.trim()] = 1; });
        if (String(newSkillsStr || "").trim() && String(newSkillsStr || "").trim() !== "無") String(newSkillsStr || "").trim().split('、').forEach(s => { let cn = s.replace(/[\(\[]?Lv\.?\d+[\)\]]?/gi, '').trim(); if (cn) skillMap[cn] = Math.min((skillMap[cn] || 0) + 1, 10); });
        let sorted = Object.keys(skillMap).map(k => ({ n: k, lv: skillMap[k] })).sort((a, b) => b.lv - a.lv);
        return sorted.length > 0 ? sorted.slice(0, 30).map(sk => `${sk.n}(Lv.${sk.lv})`).join('、') : "無";
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

        let oldPMem = pcData[pcIndex][COL.PC.MEMORY] || "";
        pcData[pcIndex][COL.PC.MEMORY] = `[雙修技巧]${processSkills(oldPMem, pfb.dynamic_skills)}`;
      }

      if (aiData.intimacy_feedback.npcs) {
        aiData.intimacy_feedback.npcs.forEach(nfb => {
          const tName = String(nfb.name).trim();
          const targetIdx = pcData.findIndex(r => r[COL.PC.NAME] === tName && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
          if (targetIdx === -1) return;

          dirtyPcRows.add(targetIdx);
          const nCleanState = sanitizePhysicalState(nfb.physical_state);
          if (nCleanState) pcData[targetIdx][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[targetIdx][COL.PC.PHYSICAL], nCleanState);
          if (nfb.dynamic_skills) {
            let oldNMem = pcData[targetIdx][COL.PC.MEMORY] || "";
            pcData[targetIdx][COL.PC.MEMORY] = `[雙修技巧]${processSkills(oldNMem, nfb.dynamic_skills)}`;
          }

          // 羈絆記憶(專屬稱呼)已併入該 NPC 自己列的 REL_MEM 欄(交談輪數已隨log_summary移除、
          //   親密次數已隨「窺視神髓」面板一併移除、已兌現約定已隨「未完成的約定」機制一併移除——
          //   三者原本唯一的消費者(面板顯示/major_event寫入)都已拆除，這欄現在只剩專屬稱呼)
          let oldRMem = pcData[targetIdx][COL.PC.REL_MEM] || "";
          pcData[targetIdx][COL.PC.REL_MEM] = `[專屬稱呼]${processTags(oldRMem, /\[專屬稱呼\](.*?)(?=\| \[|$)/, nfb.mutual_nicknames, 3)}`;
        });
      }
    }

    // ⚠ 2026-07 修：原本純比對姓名就直接寫 LOC——若不同局剛好有同名角色(種子有限、AI原創從者
    //   都可能撞名)，會把玩家的新座標寫到別局那位同名角色身上，悄悄把對方傳送到隨機地點。
    partyMembers.forEach(pName => {
      const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === pName && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
      if (nIdx !== -1) {
        pcData[nIdx][COL.PC.LOC] = pcData[pcIndex][COL.PC.LOC];
        dirtyPcRows.add(nIdx); // 🔴 加進去才會寫入
      }
    });

    // 🗑️ 2026-07 玩家定案「log_summary整條砍掉」：交談輪數計數整段移除——查證其累加出的數字
    //   從頭到尾沒有任何地方讀回(不顯示、不當門檻、不餵回AI)，純粹寫入從不讀取的死路，見 finalJson
    //   移除 log_summary 欄位處的說明。

    const pcColCount = Object.keys(COL.PC).length;

    // 🔒 競態修(2026-07)：play 豁免寫入鎖(AI 呼叫佔數秒會卡全域)，但上面的列索引是 AI 呼叫【前】
    //   讀到的——期間其他上鎖動作若刪列(清殘列/登入自動清)，索引位移、寫入會落錯列。寫回前做一次
    //   ID 欄窄讀重定位，用「當下的真實列索引」寫；列已被刪→跳過，絕不寫錯人。
    const liveIdx = buildLiveIdIndex_(sheets.pc);

    // MAX_HP/MAX_MP 重算只針對有變動的行，不全表掃描
    dirtyPcRows.forEach(idx => {
      const row = pcData[idx];
      if (!row) return;
      const id = String(row[COL.PC.ID] || "");
      // 🐛→✅ 2026-07 修：漏了 KHV_(直接從英靈庫召喚的同伴，heroToKanshouRow_ 建列)——這類同伴的
      //   好感/肉體/親密記憶全部在記憶體算完卻在這關被過濾掉、永遠沒真的寫回試算表(AI敘述照樣顯示
      //   「好感度+X」，因為顯示行直接讀 aiData.rel_changes、不受這個允許清單影響，造成「有輸出但沒寫入」的假象)。
      //   含慾海角色前綴 KPC_(御主 avatar)／KSV_(封存邀請同伴)／KHV_(直接召喚同伴)，否則後日談的
      //   好感/肉體/衣服/親密狀態寫不回去。
      if (!id.startsWith("PC_") && !id.startsWith("NPC_") && !id.startsWith("DEAD_") && !id.startsWith("KPC_") && !id.startsWith("KSV_") && !id.startsWith("KHV_")) return;
      const curIdx = liveIdx[id];
      if (curIdx === undefined) return; // 列在 AI 呼叫期間被刪(競態) → 安全跳過

      while (row.length < pcColCount) row.push("");

      // ⚔️ 從者/敵從者＝出力電池制：MAX_HP 由召喚公式(150+耐久×6)定、MP 恆 0(無自有魔力池)——
      //   不可用 maxStatsForRow_(凡人公式 100+耐久×10/50+魔力×10)重算，否則 MAX 被改基準、MP 憑空生池，
      //   違反單一真實來源(2026-07 修)。凡人(御主/NPC)照舊重算。
      const _fac = String(row[COL.PC.FACTION] || "");
      if (_fac !== "從者" && _fac !== "敵從者") {
        const maxVals = maxStatsForRow_(row);
        row[COL.PC.MAX_HP] = maxVals.hp;
        row[COL.PC.MAX_MP] = maxVals.mp;
        row[COL.PC.HP] = Math.min(parseInt(row[COL.PC.HP]) || 0, maxVals.hp);
        row[COL.PC.MP] = Math.min(parseInt(row[COL.PC.MP]) || 0, maxVals.mp);
      }

      // 只寫這一行，不寫全表(用重定位後的真實列索引)
      sheets.pc.getRange(curIdx + 1, 1, 1, pcColCount).setValues([row]);
    });

    curL = pcData[pcIndex][COL.PC.LOC];

    const localPeopleList = getLocalPeopleList(sheets, pcName, pcId, curL, pcData);

    let finalResponseText = aiData.narration || "天地混沌，一片寂靜。";
    finalResponseText = finalResponseText.replace(/\n/g, "<br>");






    // 🧹 2026-07 玩家定案「拿掉吧」：好感度渲染(❤️「NPC名」好感度 +N)已整段刪除——這是「好感度
    //   不要顯示在敘述介面上」要求裡唯一還活著、每回合都會實際顯示數字的地方(先前處理的
    //   npc-card／互動選單banner後來查證幾乎不可達，真正的來源在這)。純顯示用途、不影響
    //   rel_changes 本身的好感數值寫入(那段在更上面的 relChangesToProcess.forEach，不受影響)。

    // 🔴 全員血量變化（讀系統真實結算值，AI亂寫value也不影響）
    const hpChangeMsgs = [];
    dirtyPcRows.forEach(idx => {
      const row = pcData[idx];
      if (!row) return;
      const before = hpSnapshot[idx];
      if (before === undefined) return; // 新生成的角色沒快照
      const after = parseInt(row[COL.PC.HP]) || 0;
      if (after === before) return;
      const nm = row[COL.PC.NAME];
      const maxHp = parseInt(row[COL.PC.MAX_HP]) || 100;
      const diff = after - before;
      const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
      const color = diff < 0 ? "#d9534f" : "#2e8b57";
      const isMe = (idx === pcIndex);
      hpChangeMsgs.push(`<span style="color:${color};">${isMe ? "🧍" : "⚔️"} ${nm} ${diffStr} (${after}/${maxHp})</span>`);
    });
    if (hpChangeMsgs.length > 0) {
      finalResponseText += `<br><br><span style="font-size:13px; line-height:1.8;">${hpChangeMsgs.join("<br>")}</span>`;
    }

    // 🔴 玩家魔力變化（生命已由上面清單統一顯示，這裡不重複；金錢經濟層已移除）
    const mpAfter = parseInt(pcData[pcIndex][COL.PC.MP]) || 0;
    const extraMsgs = [];
    const mpDiff = mpAfter - mpBefore;
    if (mpDiff !== 0) extraMsgs.push(`<span style="color:#4169e1;">${mpDiff < 0 ? "💨" : "🌀"} 魔力 ${mpDiff > 0 ? "+" : ""}${mpDiff}</span>`);
    if (extraMsgs.length > 0) {
      finalResponseText += `<br><span style="font-size:13px;">${extraMsgs.join('　')}</span>`;
    }








    // 下面這行不用動，保持原樣：
    // 改這行
    saveGameHistoryBatch(pcId, [
      { speaker: "player", content: userMsg },
      { speaker: "ai", content: aiData.narration || "" }  // 用原始 narration 不用 finalResponseText
    ]);


    return JSON.stringify({
      text: finalResponseText,
      statusString: buildPlayerStatusString(pcData[pcIndex]),
      people: localPeopleList,
      locations: getNearbyLocations(curL, memoryMapData),
      options: aiData.options,
      // 經濟層已移除：不再回傳隨身行囊清單
      myItemNames: [],
      allMapNames: memoryMapData.slice(1).map(m => String(m[COL.MAP.NAME]).trim()).filter(n => n.length >= 2),
      // 🔴 新增：將全部活著的眾生名單傳給前端，用於三段式判定
      allKnownNames: pcData.filter((r, i) => i !== 0 && !String(r[COL.PC.ID]).startsWith("DEAD_")).map(r => String(r[COL.PC.NAME]).trim())
    });

  } catch (e) { return JSON.stringify({ text: "系統錯誤：" + e.message, people: [] }); }
}
