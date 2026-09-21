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
// 防呆：AI 輸出寫入試算表前夾住異常值(幻覺型別跑掉)，只動範圍明確的欄位：options 剝鷹架＋限筆數、world_note 只收合法類別。
function sanitizeAiData_(aiData, gameId) {
  if (!aiData || typeof aiData !== "object" || Array.isArray(aiData)) {
    throw new Error("AI 回傳結構異常（非物件），已攔截避免污染資料。");
  }
  const clampInt = (v, lo, hi, dflt) => {
    const n = parseInt(v);
    if (isNaN(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  };
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
  // 🌍 world_note 是 AI 唯一能新增「世界內容」的管道，所以邊界要擋在最外層：只收合法類別、限筆數。
  //    逐欄的字元清洗與長度在 worldWrite_ 裡做(那裡是唯一寫入點)，這裡只擋結構。
  if (aiData.world_note !== undefined) {
    // ⚠ 只留白名單那幾欄再往下送：AI 回傳的物件是整包穿過去的，不重建的話它可以塞
    //    {own:"按摩"} 自己宣告「這家店是玩家的」。own 照舊擋死——開店是玩家的動作。
    // 🗑️ 2026-09 地點整組退休：region／at 兩欄跟著地圖一起走了，白名單縮回四欄。
    aiData.world_note = (Array.isArray(aiData.world_note) ? aiData.world_note : [])
      .filter(w => w && typeof w === 'object' && worldSpec_(gameId).kinds.indexOf(String(w.kind || "").trim()) >= 0)
      .slice(0, worldSpec_(gameId).writeMax)
      .map(w => ({ kind: w.kind, name: w.name, text: w.text, sex: w.sex }));
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

// 🧑‍🤝‍🧑 鑑賞的「正式同伴」只有一個定義：這一局的、faction=從者 的列（可選再限定所在地點）。
// ⚠ 鑑賞【沒有死亡】——`DEAD_` 前綴只有 solo 的戰鬥(Router_Battle/Movement)與日結算(Time_World)會寫，
//    「鑑賞眾生」這張分頁沒有任何寫入端。這個條件曾經被抄了 34 遍、我還把它當成一道防線講出去過，
//    實際上一次都不會成立。留在這一支裡當唯一的防呆，其餘呼叫點一律走這裡（單一真實來源）。
function kanshouIsAlly_(row, gameId, loc) {
  if (!row) return false;
  if (String(row[COL.PC.FACTION]) !== "從者") return false;
  if (gameId && String(row[COL.PC.GAME_ID] || "") !== String(gameId)) return false;
  if (loc !== undefined && String(row[COL.PC.LOC] || "").trim() !== String(loc || "").trim()) return false;
  return !String(row[COL.PC.ID]).startsWith("DEAD_");
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

// 🔤 兩支日常化轉譯(look/personality)的共用系統提示詞開場白，含那條兩支都要的語言規則。
const KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_ = "你是《命運停駐之夜》的角色側寫顧問。★【語言】所有輸出內容一律用中文字（JSON 欄位名本身除外）。";
// 🔧 共用呼叫殼子：try/callGeminiAPI/catch-fallback原值三者結構相同，只有「怎麼從API原始回傳值算出最終結果」跟「失敗時的保底值」不同——resultMapper 在 try 內把 raw 轉成最終回傳值(沿用原本各自的 JSON.parse/String(...).trim() 等寫法)，任何一步拋錯都跟原本一樣落到 fallbackValue。
function kanshouDailyTranslateCall_(prompt, sys, apiOpts, resultMapper, fallbackValue) {
  try {
    return resultMapper(callGeminiAPI(prompt, sys, apiOpts));
  } catch (e) { return fallbackValue; }
}

// 把戰時外貌(如「貼身黑色戰甲勁裝」)轉譯成現代日常穿搭/外型：本相不變、戰甲換成日常打扮；呼叫端(召喚/奪杯封存)僅一次性觸發，失敗時原樣退回戰時描述。
function translateLookToDaily_(name, cls, rawLook, sex) {
  var look = String(rawLook || "").trim();
  if (!look) return { look: "", outfit: "" };
  var figureHint = (sex === "女") ? "，若角色是成年女性、務必把身形與胸部寫進自然的敘述句裡——這句話會顯示在玩家看得到的狀態欄位；形容胸部時須明確扣連到胸部" : "";
  var sys = KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_ + "玩家提供一段用「、」或「・」分隔的角色戰時外貌描述" +
    "(前面數段是外貌本相與戰時攻防裝束，最後一段是整體氣質／神情)。" +
    "這是 Fate／聖杯戰爭的平行世界日常線，想像《衛宮家今天的餐桌風景》那種基調——換上現代日常穿搭，" +
    "但一看就知道是本人。請輸出兩樣東西：\n" +
    "①look：日常版「外貌」兩短句、頓號分隔，每句精簡收束、【每句限" + TRAIT_SEG_HINT_ + "字內寫完整一句話，超過會被截斷】、避免堆疊多重子句，依序為[外貌本相(髮色/瞳色/五官/體態等，不含服裝)" + figureHint + "]、" +
    "[氣質(" + AURA_SPEC_ + "依和平日常情境自然轉化，但性格底色不變)]。\n" +
    "②outfit：一句這位角色今天的日常穿搭，保留原本服裝的色系/風格精神、換成現代日常款式，盡量貼近原味，" +
    "不要跟look的內容重複。\n" +
    "★輸出合法 JSON（純文字，無 Markdown）：{\"look\":\"兩短句頓號分隔\",\"outfit\":\"一句日常穿搭\"}";
  var prompt = "角色：" + name + "（" + cls + "）\n戰時外貌描述：" + look;
  return kanshouDailyTranslateCall_(prompt, sys, { temperature: 0.7, ignoreLaw: true }, function (raw) {
    var out = JSON.parse(raw || "{}");
    var rawOutLook = String(out.look || "").trim() || look;
    return { look: parseTraitsHelper(rawOutLook, look, DAILY_LOOK_SLOTS_), outfit: String(out.outfit || "").trim() };
  }, { look: look, outfit: "" });
}

function translatePersonalityToDaily_(name, cls, rawWords) {
  var words = String(rawWords || "").trim();
  if (!words) return words;
  var sys = KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_ + "玩家提供一位角色在聖杯戰爭(戰時)既有的性格短句" +
    "(用「、」分隔，依序對應[個性][個性][喜歡的事物][討厭的事物]，段數可能不足4段——" +
    "這是正常的，種子資料本就只服務戰鬥)。這個角色現在要進入現代都市的和平日常生活，想像" +
    "《衛宮家今天的餐桌風景》那種基調——性格核心不變，只是活在和平日常裡，請你：\n" +
    "①若既有短句偏戰場語境(如「戰意」「殺意」「勝負」「殺戮」等)，轉譯成性格本質不變、但適合" +
    "日常場景展現的等價說法；純屬個性核心(不涉戰場)的短句原樣保留、不要亂改。\n" +
    "②段數不足4段時，依既有特質延伸出貼合、具體、適合日常場景的「喜歡的事物」與「討厭的事物」" +
    "補滿4句。\n" +
    "③每句精簡收束、【每句限" + TRAIT_SEG_HINT_ + "字內寫完整一句話，超過會被截斷】、避免堆疊多重子句。\n" +
    "★只輸出最終4句、用「、」分隔，整段就是這4句。";
  var prompt = "角色：" + name + "（" + cls + "）\n戰時性格短句：" + words;
  return kanshouDailyTranslateCall_(prompt, sys, { temperature: 0.75, ignoreLaw: true, plainText: true }, function (raw) {
    var out = String(raw || "").trim();
    return out || words;
  }, words);
}

function getDailyHeroFields_(heroRow, p) {
  var existingLook = String(heroRow[COL.HERO.DAILY_LOOK] || "").trim();
  var existingWords = String(heroRow[COL.HERO.DAILY_WORDS] || "").trim();
  var existingOutfit = String(heroRow[COL.HERO.DAILY_OUTFIT] || "").trim();
  var rawLook = String(p.look || "").replace(/・/g, "、");
  var rawWords = String(p.words || "").replace(/・/g, "、");
  return { look: existingLook || rawLook, words: existingWords || rawWords, outfit: existingOutfit };
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
  var traitSrc = dailyLookParts.length >= DAILY_LOOK_SLOTS_ ? dailyLookParts.slice(0, DAILY_LOOK_SLOTS_).join('、') : looksToTraitParts_(daily.look);
  sRow[COL.PC.TRAIT] = parseTraitsHelper(traitSrc, "外貌出眾、舉止從容", TRAIT_SLOTS_);
  // 戰時 p.back 跟平行世界矛盾，優先讀 p.dailyBack。
  // ⚠ 兩者都沒有就【留空】：卡片的「經歷」欄空了就不印（pBackStr），比塞一句泛用墊底話好——
  //    那句對 25 位有名有姓的英靈零資訊量，還會擋掉 AI 自己補一段合理來歷的空間。
  sRow[COL.PC.BACK] = p.dailyBack ? String(p.dailyBack).slice(0, 28)
    : p.back ? String(p.back).slice(0, 28) : "";
  // 直接召喚無快照可帶，用該英靈自己的日常衣裝(daily.outfit)墊底，沒有才退回「日常便服」。
  sRow[COL.PC.MEMORY] = setOutfit_(stampPersonaFlavor_("", p.quirks || "", p.logic || ""), daily.outfit || "日常便服");
  // 🪞 記住她來自哪一筆種子：顯示名可能被改成日常稱呼，撞名守門要靠這個才認得出「同一個人」。
  sRow[COL.PC.MEMORY] = KANSHOU_SRC_TAG_.set(sRow[COL.PC.MEMORY], String(heroRow[COL.HERO.ID] || ""));
  // PHYSICAL 留空，跟御主本人(actionEnterKanshou)一致，直到第一次 intimacy_feedback 才寫入；
  sRow[COL.PC.GAME_ID] = gameId;
  // 🈳 關係兩格【刻意留空】：玩家「不能固定的東西，就不要在固定的資訊裡面」「我跟她不會一直
  //    初次見面，也不會一直點頭之交」。寫死一個起始快照＝把某一刻的狀態當成永久設定存下來。
  sRow[COL.PC.BOND] = 0;
  sRow[COL.PC.REL_TAG] = "";
  sRow[COL.PC.REL_MEM] = kanshouRelMemBuild_("無", {});
  return sRow;
}





// ══ 📝 她眼中的你（2026-09 玩家「跟外面 ai 不同，這裡的 ai 明確知道所有設定，第一次遇到玩家就把玩家看透了」）══
// 玩家卡上的 性格[內裡]／經歷，過去是每個在場角色【無條件全知】。那份資料其實有兩種用途被混在一起：
// ①寫玩家自己的內心與感受（★【你也是這座城裡的一個人】要用）②在場角色對玩家的認識——①該全知，②不該。
// 拆法見 CODE_NOTES.md；這裡只放資料層。熟悉度那條線【GAS 自己算、不經過 AI】，所以擋得住。
var KANSHOU_NOTED_TAG_ = makeTextTag_('眼中的你');
const KANSHOU_NOTED_SEP_ = '／';   // 不可用 ｜ 或 【】：makeTextTag_ 會把結構字元從值裡剝掉
const KANSHOU_NOTED_CAP_ = 3;
const KANSHOU_NOTED_LEN_ = 14;
// 🤝 相處次數（存該同伴列 MEMORY）：跟你照過幾次面。2026-09 好感整組砍除後，這是唯一還在累積的
//    關係軸——它只回答「你們見過幾次」這個事實，不回答「她多喜歡你」（那件事交給 AI 從歷史自己判斷）。
var KANSHOU_MET_COUNT_TAG_ = makeIntTag_('相處', 0);
// say＝真的送進提示詞的那句話。一階一句，往表加一列就多一階。
// ⚠ say 一律寫成【此刻量得出來的物理距離】，不寫關係名詞、不寫評語、不寫「遇到X就做Y」。見 CODE_NOTES。
// ⏱ min 的單位是【同場回合】，而一回合＝KANSHOU_MIN_PER_TURN_ 分鐘，所以這張表其實就是
//    「一起待了多久」：12＝2 小時、30＝5 小時、50＝8 小時出頭。跳時間/過夜的回合不計（見 +1 那處的 guard），
//    所以它量到的是真的在同一個地方相處的時間，不是日曆上過了幾天。
const KANSHOU_FAMILIAR_TIERS_ = [
  { min: 50, key: '老交情', say: '我們之間沒有留距離' },
  { min: 30, key: '熟稔', say: '我們之間近到衣袖會碰到' },
  { min: 12, key: '混熟', say: '我們之間的距離縮到半個手臂' },
  { min: 0, key: '初識', say: '我們之間留著一個手臂的距離' }
];
// 依相處次數查熟悉段（單一真實來源＝KANSHOU_FAMILIAR_TIERS_）。查不到就退回表尾那一階，
// 不在這裡另外寫死一句（同一句話存兩處，改了表沒改這裡就是兩個答案）。
function kanshouKnownTier_(metCount, field) {
  var _t = KANSHOU_FAMILIAR_TIERS_;
  var t = _t.find(function (x) { return (parseInt(metCount) || 0) >= x.min; }) || _t[_t.length - 1];
  return t[field || 'key'];
}
// 組一句「我在對方眼中」：熟悉段 ＋ 對方真的記下的那幾條（沒有就只有熟悉段）。
function kanshouKnownOfYou_(memory) {
  var noted = String(KANSHOU_NOTED_TAG_.get(memory) || '').split(KANSHOU_NOTED_SEP_).map(function (x) { return x.trim(); }).filter(Boolean);
  return { say: kanshouKnownTier_(KANSHOU_MET_COUNT_TAG_.get(memory), 'say'), noted: noted };
}

// 🧹 剝掉「常駐舞台指示」的副詞：AI 寫進記憶的東西會每回合餵回提示詞，一旦帶著
//    永遠／總是／每次，那一格就從【觀察】變成【每回合都要演一次的指令】——
//    跟種子裡退休掉的「背脊永遠打得筆直」同形，只是走資料那條路，掃描器看不到。
function stripStanding_(str) {
  return String(str || "").replace(/(永遠|總是|老是|一律|每次|每天|從不|不停)/g, "").trim();
}
// 🧵 append→去重→上限 的共用引擎：共同回憶(MEMOIR 欄)與「她眼中的你」(MEMORY 標記)本來就是同一件事，
//    差別只在 分隔符／上限／長度／要不要保護★釘選。去重那段含 bigram 相似度比對，複製出去必然走樣，
//    所以只此一份。opt: { sep, cap, maxLen, pin }
function kanshouAppendUnique_(oldStr, newLine, opt) {
  const o = opt || {};
  const sep = o.sep || '｜';
  const cap = parseInt(o.cap) || 10;
  const maxLen = parseInt(o.maxLen) || 40;
  const reBad = new RegExp('[｜|【】\\[\\]★' + sep + ']', 'g');
  let arr = String(oldStr || "").split(sep).map(x => x.trim()).filter(x => x !== "" && x !== "無");
  let clean = String(newLine || "").replace(reBad, "").trim().slice(0, maxLen);
  // 🛡️ 相似度去重(玩家實測「超級洗畫面」)：同一件事在 3 輪歷史窗裡迴盪，模型每回合換句話說重記一條。
  const _bi = s => { const t = String(s).replace(/^★/, "").replace(/[，。、！？…\s]/g, ""); const o2 = new Set(); for (let i = 0; i < t.length - 1; i++) o2.add(t.substr(i, 2)); return o2; };
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
  if (arr.length <= cap) return arr.join(sep);
  if (!o.pin) return arr.slice(-cap).join(sep);
  // 超量淘汰：★釘選的永不驅逐，只淘汰未釘選裡最舊的；輸出保持原本時序。
  const pinnedCount = arr.filter(x => x.charAt(0) === '★').length;
  let dropLeft = Math.max(0, arr.length - Math.max(cap, pinnedCount));
  return arr.filter(x => { if (x.charAt(0) === '★' || dropLeft === 0) return true; dropLeft--; return false; }).join(sep);
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
// 🔒 玩家一旦自己打過，那一格就歸玩家——AI 從此不再碰它。稱呼與關係兩格各一把鎖，同一套寫法、
//    同存 REL_MEM 這一格。⚠ 這兩把鎖【只有玩家的 UI 動作會蓋】，AI 自己蓋不了自己的鎖。
const KANSHOU_LOCKS_ = { nick: '稱呼鎖', tag: '關係鎖' };
function kanshouRelLocked_(relMem, which) {
  return new RegExp('\\[' + KANSHOU_LOCKS_[which] + '\\]是').test(String(relMem || ""));
}
// 組回 REL_MEM：專屬稱呼本體 ＋ 還在的那幾把鎖。⚠ 這是 REL_MEM 的唯一組裝口——
//    少接一把鎖，那把鎖下一回合就被 AI 的寫入整格洗掉（實測過的形狀：舊版直接 = nickPart）。
function kanshouRelMemBuild_(nickValue, locks) {
  let out = `[專屬稱呼]${nickValue || "無"}`;
  Object.keys(KANSHOU_LOCKS_).forEach(function (k) {
    if (locks && locks[k]) out += `| [${KANSHOU_LOCKS_[k]}]是`;
  });
  return out;
}
// 🗑️ 2026-09 大精簡：★【稍早做過的事】那行摘要整組砍除（kanshouRecentDigest_／KANSHOU_DIGEST_ROUNDS_／
//    KANSHOU_DIGEST_CAP_）。它把掉出 chatHistory 窗口的舊回合壓成一行「玩家做過什麼」，但那一行講的
//    正是 chatHistory 已經在講的事，而且是壓過的版本——兩個真實來源，差的那個每回合多花 168 字。

// 直接從英靈庫召喚一位英靈、讓她「存在」於這個後日談世界(不需先在 solo 封存)。
function actionKanshouSummonHero(userData, pcId, sheets) {
  var kpc = sheets.pc;
  var acctName = String(userData.acctName || "").trim();
  var heroId = String(userData.heroId || "").trim();
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  var me = data[meIdx];
  var gid = String(me[COL.PC.GAME_ID] || ""); var loc = String(me[COL.PC.LOC] || "冬木·深山町");
  var heroes = getHeroCodexCached();
  var hero = heroes.find(function (r) { return String(r[COL.HERO.ID]) === heroId; });
  if (!hero) return JSON.stringify({ success: false, message: "找不到這個人。" });
  // 衛宮士郎-Master：玩家本人就是這個位置，不開放召喚。
  if (heroId === '衛宮士郎-Master') return JSON.stringify({ success: false, message: "這位就是你自己。" });
  if (KANSHOU_SUMMON_BLOCKED_IDS_.indexOf(heroId) !== -1) return JSON.stringify({ success: false, message: "這位現在還請不來。" });
  // 🌍 世界人數上限：這座城裡住幾個人是有數的——人一多，「誰在哪」那份名單與在場卡都會失控。
  var _pop = data.filter(function (r) { return kanshouIsAlly_(r, gid); }).length;
  if (_pop >= KANSHOU_WORLD_MAX_) {
    return JSON.stringify({ success: false, message: "這座城裡已經住了 " + KANSHOU_WORLD_MAX_ + " 個人。要請新的人來，得先讓一位離開。" });
  }
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
  // 只能召喚一次，而且同一個人的兩種靈基不可以同時在場（斯卡哈 Lancer/Assassin、伊莉雅兩版）。
  var clash = kanshouSummonClash_(data, gid, hero, heroName);
  if (clash.name) {
    return JSON.stringify({ success: false, message: clash.same
      ? "「" + clash.name + "」已經存在於這個世界了，去找找人在哪裡吧。"
      : "這個世界裡已經有「" + clash.name + "」了——同一位英靈只能有一種姿態在場。" });
  }
  const _newRow = heroToKanshouRow_(hero, gid, loc, parseInt(me[COL.PC.DAY]) || 1);
  kpc.appendRow(_newRow);
  // 🫂 召喚＝把人叫到身邊，同行還有位子就直接站進去（滿了就只是來到這個世界，玩家自己換人）。
  const _pIds = kanshouGetParty_(me[COL.PC.MEMORY]);
  if (_pIds.length < KANSHOU_PARTY_MAX_) {
    _pIds.push(String(_newRow[COL.PC.ID]));
    const _pMem = kanshouSetParty_(me[COL.PC.MEMORY], _pIds);
    data[meIdx][COL.PC.MEMORY] = _pMem;
    kpc.getRange(meIdx + 1, COL.PC.MEMORY + 1).setValue(_pMem);
  }
  return JSON.stringify({ success: true, added: heroName, message: "「" + heroName + "」來到了你們身邊。" });
}

// 進入慾海·後日談：每個帳號只有【一個】常駐後日談世界，點「進入鑑賞」直接回到這個世界。
// 🧹 依 game_id 把某張表屬於這一局的列整批清掉。回傳被清掉那些列在 idCol 欄的值(供連帶清歷史)；
//    idCol 傳 null 就只清不收。
// ⚠ 刻意【不】逐列 deleteRow：在 GAS 裡那是一列一次 API 呼叫，同伴＋歷史＋帳本加起來
//    可以慢到玩家以為當掉(玩家實測「輸入名字後就消失了，不知道有沒有在執行」)。
//    改成「留下來的整批寫回、尾巴一次砍掉」——N 次呼叫變 2 次。同 actionPurgeOrphans 的寫法。
function kanshouPurgeByGame_(sh, gidCol, gid, idCol) {
  const ids = [];
  if (!sh || !gid) return ids;
  try {
    const d = sh.getDataRange().getValues();
    if (d.length <= 1) return ids;
    const kept = [];
    for (let r = 1; r < d.length; r++) {
      if (String(d[r][gidCol] || "") === String(gid)) {
        if (idCol != null) ids.push(String(d[r][idCol] || "").replace(/^DEAD_/, ""));
      } else kept.push(d[r]);
    }
    const tail = (d.length - 1) - kept.length;
    if (tail <= 0) return ids;
    if (kept.length) sh.getRange(2, 1, kept.length, d[0].length).setValues(kept);
    sh.deleteRows(2 + kept.length, tail);
  } catch (e) { }
  return ids;
}

// 🔄 鑑賞歸零重來：把這個帳號的整局後日談資料清掉，下次進鑑賞就是全新的世界。
// 【會清掉】鑑賞眾生(玩家自己那列＋所有同伴)、他們的對話歷史、世界帳本、帳號表的鑑賞連結。
// 【不會動】英靈殿(含你在工房鑄的原創英靈——那是兩軌共用的資產)、solo 那一局的任何東西。
// 🔒 授權比照 actionEndRun 那次稽核的修法：pcId 是可預測的時間戳，【不可】裸 find；
//    一律驗「這個帳號登記的鑑賞角色是不是就是它」，否則任何人都能猜 id 清掉別人的存檔。
function actionKanshouReset(userData, pcId, sheets) {
  const acctName = String(userData.acctName || "").trim();
  if (!acctName) return JSON.stringify({ success: false, message: "還沒登入。" });
  const linked = getAccountKanshouPcId_(acctName);
  if (!linked || String(linked) !== String(pcId)) {
    return JSON.stringify({ success: false, message: "找不到你的後日談，沒東西可以歸零。" });
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const kpc = getKanshouPcSheet_(ss);
  const data = kpc.getDataRange().getValues();
  const meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "找不到你的後日談，沒東西可以歸零。" });
  const gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  if (!gid) return JSON.stringify({ success: false, message: "這局的資料不完整，先不歸零。" });

  // 鑑賞眾生：玩家自己那列也在這一局的 game_id 底下，一起清掉
  const purgedIds = kanshouPurgeByGame_(kpc, COL.PC.GAME_ID, gid, COL.PC.ID);
  try { purgeHistoryForPcIds_(purgedIds); } catch (e) { }
  try { kanshouPurgeByGame_(worldSheet_(), KW_.GID, gid, null); worldBust_(gid); } catch (e) { }
  try { kanshouPurgeByGame_(kanshouStyleSheet_(), KS_.GID, gid, null); kanshouStyleBust_(gid); } catch (e) { }

  // 最後才解除帳號連結：前面任何一步炸掉，連結還在、玩家至少回得去原本的世界。
  try {
    const acc = ss.getSheetByName("帳號");
    const found = acc ? findAccountRow_(acc, acctName) : null;
    if (found) acc.getRange(found.idx + 1, COL.ACC.KPC + 1).setValue("");
  } catch (e) { }

  return JSON.stringify({ success: true, cleared: purgedIds.length, message: "後日談歸零了。" });
}

function actionEnterKanshou(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  if (!acctName) return JSON.stringify({ success: false, message: "還沒登入。" });
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
        homeName: getKanshouHomeName_(data[r][COL.PC.MEMORY], String(data[r][COL.PC.NAME] || acctName))
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
        homeName: getKanshouHomeName_(data[m][COL.PC.MEMORY], String(data[m][COL.PC.NAME] || acctName))
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
  // 🫂 新局的同行名單從【空的】開始：先寫一個空標記，第一回合才不會走「舊存檔遷移」那條路
  //    把同場的起始住民自動拉進來。玩家定案「一片空白，我召喚一個角色陪我說話」——誰在場由玩家選。
  mRow[COL.PC.MEMORY] = kanshouSetParty_(setOutfit_("【帳號】" + acctName + "｜【鑑賞後日談】這裡是平行世界的和平日常，與英靈相伴度過尋常時光。", "日常便服"), []);
  mRow[COL.PC.GAME_ID] = gameId;
  // 比照 solo 創角(actionManualNpc)：先用玩家填的種子片段(或預設)秒寫非阻塞，AI 潤色由actionBackfillKanshouAi 於進場後背景補上(見下)。
  var kAppear = String(userData.appearance || "").trim().slice(0, 60);
  var kPersona = String(userData.persona || "").trim().slice(0, 60);
  var _apPart = kAppear.replace(/、/g, "·").trim();   // 外貌塞第1格(內部頓號換·，免溢位其他格)
  var _psPart = kPersona.replace(/、/g, "·").trim();  // 個性方向塞「對外性格」第1格
  mRow[COL.PC.BACK] = "剛搬來冬木市";                  // 經歷開局(原「身世」正名；之後 AI 滾動＋玩家可改命)
  mRow[COL.PC.TRAIT] = _apPart + "、、我、無";
  mRow[COL.PC.PREF] = _psPart + "、、、";
  mRow[COL.PC.INTENT] = "";                            // 🚫 萌點欄 2026-09 起整組退休，永遠留空（COL 是位置索引，欄位不刪）
  kpc.appendRow(mRow);
  linkAccountToKanshouPc_(acctName, mId); // 🔒 權威連結寫進帳號表

  // 開場只入駐4位起始住民(2026-07玩家定案：大河/凜/櫻/SABER——「本來就住在這座城」感最強的幾位)，其餘女角不建列、不存在於世界，之後靠 🌟 召喚才入駐。
  var starterHeroes = getHeroCodexCached().slice(1).filter(function (r) {
    return KANSHOU_STARTER_IDS_.indexOf(String(r[COL.HERO.ID])) !== -1;
  });
  // 🗺️ 2026-09 玩家「全部人在客廳…我想要讓他們先分散出去」：起始住民各自落在不同的起始地點，
  //    開局就有「要去找人」這件事。不夠分時才輪回玩家開局的地方。
  var starterRows = starterHeroes.map(function (hero) {
    return heroToKanshouRow_(hero, gameId, loc2, 1);
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
  if (pIdx === -1) return JSON.stringify({ success: false, message: "找不到你的角色" });
  const row = pcData[pIdx];
  const finalName = String(row[COL.PC.NAME] || ""), finalSex = String(row[COL.PC.SEX] || "異");
  const appearance = String(userData.appearance || "").slice(0, 60), standing = String(userData.standing || "").slice(0, 60);
  const persona = String(userData.persona || "").slice(0, 60);

  const promptStr = `【主角】：名字『${finalName}』，性別『${finalSex}』\n【外貌】：${appearance || "隨機"}\n【身世】：${standing || "隨機"}\n【個性方向】：${persona || "隨機"}`;

  const KANSHOU_MASTER_GEN_SYS = `你是《命運停駐之夜》後日談(鑑賞)的角色生成核心，為玩家建立一位生活在平行世界(這裡從來沒有發生過聖杯戰爭這回事)、與身邊夥伴共度和平日常的主角本人形象。請依玩家提供的姓名、性別、外貌、身世、個性方向，生成合理且溫暖自然的設定。

★【語言】除 JSON 欄位名本身外，所有輸出內容一律用中文字；玩家描述若含英文人名/詞彙，請意譯或音譯成中文寫入。
★【設定怎麼用】以下設定是【給你內化的素材】：靠言行與神態流露，情境對了才浮現一次。
★【格式鐵律】traits 【恰好2段】、personality 【恰好4段】，只用頓號「、」分隔，每段是一個【簡短詞組】，每段內部就寫一件事；不加數字標籤。
- traits：外貌、氣質。${finalSex === '女' ? BUST_NOTE_ : ''}${AURA_SPEC_}格式範例(只示範斷句，內容一律依玩家給的性別與描述重寫)：「(外貌)、(氣質)」
- personality：個性兩句(各講一件不同的事)、喜歡的事物、討厭的事物。格式範例(只示範斷句)：「(個性)、(個性)、(喜歡的)、(討厭的)」
★logic：${pron_(finalSex)}做選擇的方式，限24字。把兩件${pron_(finalSex)}都想要的東西擺在一起，說出最後放掉的是哪一個(例：嘴上算的是得失，做的時候總是選重情義那邊)。
★background：限20字，【只寫來到冬木【以前】的來歷】，呼應其身世，不出現具體物品名，語氣平和溫馨，不涉及聖杯戰爭或任何戰爭史。
★【只寫來到冬木以前的來歷】：現在的工作、住處、同住的人、交往對象、養的動物、已經有的朋友，全部留給玩家在遊戲裡自己做出來（系統會逐項記錄）——這一格只寫來到冬木之前的來歷。
★outfit：一句今天的日常穿搭(限20字)，依外貌與個性方向自然搭配(如文靜者素雅、活潑者亮色休閒)，純日常便服/居家/外出風格，不含任何戰甲/武裝/戰鬥裝束字眼。
★【數值與地點由系統裁定】輸出欄位以下方 JSON 列出的為限。

★【輸出】合法 JSON（純文字，無 Markdown）：
{"background":"限20字","traits":"兩格頓號字串","personality":"四格頓號字串","logic":"做選擇的方式，限24字","outfit":"一句日常穿搭"}`;

  try {
    const aiBrief = JSON.parse(callGeminiAPI(promptStr, KANSHOU_MASTER_GEN_SYS, { temperature: 0.6, ignoreLaw: true, model: CREATION_MODEL }));
    // 🔒 競態修(比照 actionBackfillMasterAi)：backfill 豁免寫入鎖，pIdx 是 AI 呼叫【前】的列索引——寫回前重定位。
    const wIdx = buildLiveIdIndex_(sheets.pc)[String(pcId)];
    if (wIdx === undefined) return JSON.stringify({ success: false, message: "你的角色不見了，重新進來看看。" });
    // 🔒 只補空的、不蓋已有的：第一次補完會蓋【設定已補】章，之後再跑就只填【現在還是空的】那幾格。
    //    沒有這道閘，對一個已經玩過的角色再跑一次 backfill 會把他整組洗掉——舊角色回來補新欄位
    //    (怪癖/準則)一定會踩到。詳見 CODE_NOTES.md。
    const _topUp_ = !!KANSHOU_BACKFILL_DONE_TAG_.get(row[COL.PC.MEMORY]);
    const _put_ = (col, val, curRaw) => {
      if (!val) return;
      if (_topUp_ && String(curRaw || "").replace(/[、\s]/g, "")) return; // 補過了、而且這格已經有東西
      sheets.pc.getRange(wIdx + 1, col + 1).setValue(val);
    };
    _put_(COL.PC.BACK, aiBrief.background && String(aiBrief.background).slice(0, 22), row[COL.PC.BACK]);
    _put_(COL.PC.TRAIT, aiBrief.traits && parseTraitsHelper(aiBrief.traits, traitParts_(row[COL.PC.TRAIT]).join('、'), TRAIT_SLOTS_), traitParts_(row[COL.PC.TRAIT]).join(''));
    _put_(COL.PC.PREF, aiBrief.personality && parseTraitsHelper(aiBrief.personality, row[COL.PC.PREF]), row[COL.PC.PREF]);
    // MEMORY 上有三件事要寫(衣裝／怪癖／準則)——同一格，讀一次寫一次就好，別各寫各的。
    // 衣裝：生成失敗/沒給值時種子預設「日常便服」繼續當保底。怪癖/準則走召喚同伴那支 stampPersonaFlavor_。
    {
      let liveMem = sheets.pc.getRange(wIdx + 1, COL.PC.MEMORY + 1).getValue();
      const before = String(liveMem);
      if (aiBrief.outfit && !(_topUp_ && getOutfit_(liveMem))) liveMem = setOutfit_(liveMem, aiBrief.outfit);
      liveMem = stampPersonaFlavor_(liveMem,
        getPersonaQuirks_(liveMem) ? "" : String(aiBrief.quirks || "").slice(0, 40),
        getPersonaLogic_(liveMem) ? "" : String(aiBrief.logic || "").slice(0, 40));
      liveMem = KANSHOU_BACKFILL_DONE_TAG_.set(liveMem, 1);
      if (String(liveMem) !== before) sheets.pc.getRange(wIdx + 1, COL.PC.MEMORY + 1).setValue(liveMem);
    }
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ success: false, message: "補寫失敗，先用原本的。" });
  }
}

// 🌍 列出這個世界裡「已經存在」的所有英靈(駐留清單)，各自附上目前所在地點，供玩家決定要去找誰。
function actionKanshouCompanions(userData, pcId, sheets) {
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  var me = data[meIdx];
  var gid = String(me[COL.PC.GAME_ID] || "");
  var myLoc = String(me[COL.PC.LOC] || "");
  var myName = String(me[COL.PC.NAME] || "");
  var partyIds = kanshouGetParty_(me[COL.PC.MEMORY]);
  var current = [];
  for (var i = 1; i < data.length; i++) {
    if (kanshouIsAlly_(data[i], gid)) {
      // 🗑️ 2026-09 地點退休：loc／locLabel／isHere 三欄一起拿掉——面板不再需要「她在哪」。
      // memoir：共同回憶(27欄)原樣下傳(★前綴=玩家釘選)，供面板顯示/釘選/刪除。
      // 🆔 2026-07「整體重構·id優先」：補id讓前端能存起來隨後續action回傳，後端才有id可用、不必只靠名字(kanshouNameCandidates_別名表已處理大部分情況，但id才是真正杜絕撞名/前綴混淆的單一真實來源)。
      current.push({ id: String(data[i][COL.PC.ID]), srcId: KANSHOU_SRC_TAG_.get(String(data[i][COL.PC.MEMORY] || "")), name: String(data[i][COL.PC.NAME]), tag: String(data[i][COL.PC.REL_TAG] || ""), nickname: getNickname_(data[i][COL.PC.REL_MEM]), party: partyIds.indexOf(String(data[i][COL.PC.ID])) >= 0, memoir: String(data[i][COL.PC.MEMOIR] || "").split('｜').map(function (s) { return s.trim(); }).filter(Boolean) });
    }
  }
  return JSON.stringify({ success: true, current: current });
}


// 💞 共同回憶面板操作(釘選/取消釘選/刪除)——比照 update_rel_tag「玩家 UI 手動管理、AI 無權」精神。
// 💞 共同回憶的兩個上限。原本是寫死在三處的魔術數字（後端總量、後端釘選、前端說明文字），
// 改一個地方另外兩個不會跟著動——UI 會靜靜說謊。抽成常數並鏡射給前端，check_mirror.js 才盯得到。
// ⚠ 釘選上限刻意比總量少 2：釘滿就會讓新回憶永遠擠不進來。
const KANSHOU_MEMOIR_CAP_ = 10;
const KANSHOU_MEMOIR_PIN_CAP_ = 8;

function actionKanshouMemoirOp(userData, pcId, sheets) {
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」
  var op = String(userData.op || "").trim();
  var item = String(userData.item || "").replace(/[｜【】\[\]★]/g, "").trim();
  var targetName = String(userData.targetName || "").trim();
  var targetId = String(userData.targetId || "").trim();
  if (!item || !targetName || ['pin', 'unpin', 'del'].indexOf(op) === -1) return JSON.stringify({ success: false, message: "少了東西。" });
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  var gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  // 🐛→✅ 2026-09：id 優先、名字只當備援。當時在場的幾位全名 23~30 字，
  //   經 sanitizeUserData_ 的 NAME_MAX=20 一截就查無此人——釘選／刪除／關係／稱呼全失效。
  var tIdx = findPcRowIdx_(data, gid, { id: targetId, name: targetName, faction: "從者", nameCandidates: kanshouNameCandidates_ });
  if (tIdx < 0) return JSON.stringify({ success: false, message: "找不到這位同伴。" });
  var entries = String(data[tIdx][COL.PC.MEMOIR] || "").split('｜').map(function (s) { return s.trim(); }).filter(Boolean);
  var hit = entries.findIndex(function (e) { return e.replace(/^★/, "") === item; });
  if (hit === -1) return JSON.stringify({ success: false, message: "找不到這條回憶。" });
  if (op === 'del') entries.splice(hit, 1);
  else if (op === 'pin') {
    // 釘選上限刻意比總量少 2：釘滿會讓新回憶永遠擠不進來(理由見常數宣告處)。
    if (entries.filter(function (e) { return e.charAt(0) === '★'; }).length >= KANSHOU_MEMOIR_PIN_CAP_) return JSON.stringify({ success: false, message: "最多釘 " + KANSHOU_MEMOIR_PIN_CAP_ + " 條，先鬆開幾個。" });
    entries[hit] = '★' + entries[hit].replace(/^★/, "");
  }
  else entries[hit] = entries[hit].replace(/^★/, "");
  var joined = entries.join('｜');
  kpc.getRange(tIdx + 1, COL.PC.MEMOIR + 1).setValue(joined);
  return JSON.stringify({ success: true, memoir: entries });
}

// 🌍 世界帳本面板：列出這一局玩出來的地方/人/設定，並讓玩家釘選(永不淘汰)或刪掉不想要的。
// 帳本原本只有 AI 寫得到、玩家看不到——但淘汰政策裡的「★釘選永不驅逐」沒有任何入口能設定，
// 等於做了一半。這支把讀與管一起補上(比照 actionKanshouMemoirOp 的分工)。
function actionWorld(userData, pcId, sheets) {
  const kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」
  const data = kpc.getDataRange().getValues();
  const meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  const gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  if (!gid) return JSON.stringify({ success: false, message: "這局的資料不完整。" });

  const op = String(userData.op || "list").trim();

  // 🗑️ 2026-09 地點整組退休：大區與地點的自由增減（rg_add／rg_rename／rg_del／
  //    loc_region／loc_own／loc_rename／loc_text）整條砍除。地點現在只是世界帳本裡
  //    一條【純設定】，跟人物／設定同級——要釘、要刪走下面那組通用的 pin/unpin/del 就好。

  if (op !== 'list') {
    if (['pin', 'unpin', 'del'].indexOf(op) === -1) return JSON.stringify({ success: false, message: "少了東西。" });
    const kind = String(userData.kind || "").trim();
    const name = String(userData.entryName || "").trim();
    if (!kind || !name) return JSON.stringify({ success: false, message: "少了東西。" });
    try {
      if (op === 'del') {
        if (!worldDrop_(gid, kind, name)) return JSON.stringify({ success: false, message: "找不到這一條。" });
      } else {
        const sh = worldSheet_();
        const d = sh.getDataRange().getValues();
        let hit = -1;
        for (let r = 1; r < d.length; r++) {
          if (String(d[r][KW_.GID]) === gid && String(d[r][KW_.KIND]) === kind && String(d[r][KW_.NAME]).trim() === name) { hit = r; break; }
        }
        if (hit < 0) return JSON.stringify({ success: false, message: "找不到這一條。" });
        sh.getRange(hit + 1, KW_.PIN + 1).setValue(op === 'pin' ? '★' : '');
        worldBust_(gid);
      }
    } catch (e) { return JSON.stringify({ success: false, message: "沒成功，等一下再試。" }); }
  }

  return JSON.stringify(worldPayload_(gid));
}

// 面板要的東西一次給齊：條目＋上限。list 與每一個 op 都回這同一包(前端只要認一種形狀)。
function worldPayload_(gid) {
  const all = worldRead_(gid);
  const rows = all
    .map(r => ({ kind: r.kind, name: r.name, text: r.text, sex: r.sex, pin: r.pin, seen: r.seen, hits: r.hits }));
  // 釘選的排前面，其次照「最後被提到」由新到舊——跟提示詞的相關性排序不同，那是給 AI 的，這是給人看的。
  rows.sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.seen - a.seen);
  return {
    success: true, rows: rows, caps: worldSpec_(gid).cap, panel: worldSpec_(gid).panel
  };
}

// ⚧ 切換後日談御主 avatar 的性別（隨時可改；只動 SEX 欄，不影響從者/歷史）。
// ⏰ 設定時間流速（每回合幾分鐘，0＝暫停）。存玩家列 MEMORY，設一次就記住。

// 🫂 加入／離開同行（玩家自己指定誰在這一幕裡·上限 KANSHOU_PARTY_MAX_）。
//    op: 'add'｜'drop'｜'clear'。回傳【實際落定的名單】——滿了被擋時玩家要看得到。
function actionKanshouParty(userData, pcId, sheets) {
  const kpc = sheets.pc;
  const data = kpc.getDataRange().getValues();
  const meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  const gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  const op = String(userData.op || "").trim();
  let ids = kanshouGetParty_(data[meIdx][COL.PC.MEMORY]);
  if (op === 'clear') ids = [];
  else {
    const npcId = String(userData.npcId || "").trim();
    // 🪪 只認 id：名字在這張全帳號共用的表上會撞（見 KANSHOU_PARTY_TAG_ 的說明）。
    const tIdx = npcId ? data.findIndex((r, i) => i > 0 && i !== meIdx && String(r[COL.PC.ID]) === npcId
      && String(r[COL.PC.GAME_ID] || "") === gid && kanshouIsAlly_(r, gid)) : -1;
    if (tIdx < 0) return JSON.stringify({ success: false, message: "找不到這個人。" });
    // 🙋 叫她過來：把她移到你這一幕的地點。不動同行名單——她只是走過來了，不是從此跟著你。
    //    跟「去找她」（前端直接走既有的移動）是一對，玩家兩個方向都走得通。
    // 🗑️ 2026-09 地點整組退休：op 'bring'（🙋 叫她過來＝把她的 LOC 搬到你這裡）跟著移除——
    //    在場已經只看同行清單，搬 LOC 不再有任何效果。要她在場就 'add'。
    // 🚪 請她離開這座城：把這一列整個抽掉，世界人數就空出一格。
    //    ⚠ 這是【不可逆】的——她的共同回憶、她眼中的你、關係稱呼全部跟著沒了。
    //      前端要問過玩家才准送這個 op。對話歷史是玩家自己的、不動。
    if (op === 'evict') {
      const evName = String(data[tIdx][COL.PC.NAME] || "");
      ids = ids.filter(x => x !== npcId);
      const kept = [data[0]];
      for (let r = 1; r < data.length; r++) { if (r !== tIdx) kept.push(data[r]); }
      kpc.getRange(1, 1, data.length, data[0].length).clearContent();
      kpc.getRange(1, 1, kept.length, kept[0].length).setValues(kept);
      const mem2 = kanshouSetParty_(kept[kanshouPcIdx_(kept, pcId)][COL.PC.MEMORY], ids);
      kept[kanshouPcIdx_(kept, pcId)][COL.PC.MEMORY] = mem2;
      kpc.getRange(kanshouPcIdx_(kept, pcId) + 1, COL.PC.MEMORY + 1).setValue(mem2);
      STATE_PRE_DATA_ = kept;
      return JSON.stringify({ success: true, party: ids, evicted: evName });
    }
    // ⚠ 解散＝離開同行名單。地點退休後「她留在哪裡」不再是一件會被記住的事。
    if (op === 'drop') ids = ids.filter(x => x !== npcId);
    else if (op === 'add') {
      if (ids.indexOf(npcId) >= 0) return JSON.stringify({ success: true, party: ids });
      if (ids.length >= KANSHOU_PARTY_MAX_) {
        return JSON.stringify({ success: false, message: `同行最多 ${KANSHOU_PARTY_MAX_} 位，先讓一位離開。` });
      }
      ids.push(npcId);
    } else return JSON.stringify({ success: false, message: "沒有這個動作。" });
  }
  const mem = kanshouSetParty_(data[meIdx][COL.PC.MEMORY], ids);
  data[meIdx][COL.PC.MEMORY] = mem;
  kpc.getRange(meIdx + 1, COL.PC.MEMORY + 1).setValue(mem);
  STATE_PRE_DATA_ = data;
  return JSON.stringify({ success: true, party: ids });
}

function actionKanshouSetSex(userData, pcId, sheets) {
  var newSex = String(userData.pcSex || "").trim();
  if (newSex !== "男" && newSex !== "女") return JSON.stringify({ success: false, message: "性別只能選男或女。" });
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
  var data = kpc.getDataRange().getValues();
  var i = kanshouPcIdx_(data, pcId);
  if (i < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  if (newSex === "男") {
    var gid = String(data[i][COL.PC.GAME_ID] || "");
    var hasMaleCompanion = data.some(function (r, ri) {
      return ri !== i && kanshouIsAlly_(r, gid) && String(r[COL.PC.SEX]) === "男";
    });
    if (hasMaleCompanion) {
      return JSON.stringify({ success: false, message: "這局已經有男性同伴了，你沒辦法再改成男的。" });
    }
  }
  var oldSex = String(data[i][COL.PC.SEX] || "");
  kpc.getRange(i + 1, COL.PC.SEX + 1).setValue(newSex);
  // 真的切換性別時重置回中性預設值，跟玩家肉體懶初始化／heroToKanshouRow_ 同一套預設值看齊。
  if (oldSex !== newSex) {
    kpc.getRange(i + 1, COL.PC.PHYSICAL + 1).setValue(JSON.stringify({ "狀態": "如常" }));
  }
  return JSON.stringify({ success: true, pcSex: newSex, message: "改成「" + newSex + "」了。" });
}

// ✏ 更改後日談御主 avatar 的名字（隨時可改）。pcId＝KPC_。
function actionKanshouSetName(userData, pcId, sheets) {
  var newName = String(userData.pcName || "").trim();
  if (!newName) return JSON.stringify({ success: false, message: "名字不能空白。" });
  if (newName.length > 16) return JSON.stringify({ success: false, message: "名字請在16字以內。" });
  var kpc = sheets.pc; // dispatcher 已指到「鑑賞眾生」，見 actionKanshouSummonHero 同款註解
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
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
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  var newMemory = setKanshouHomeName_(data[meIdx][COL.PC.MEMORY], newName);
  kpc.getRange(meIdx + 1, COL.PC.MEMORY + 1).setValue(newMemory);
  return JSON.stringify({ success: true, homeName: newName, message: "住所已改名為「" + newName + "」。" });
}


// ==========================================
// 🔴【鑑賞 AI 核心】buildDefaultSystemPrompt／actionPlaysolo 是按鍵+AI說故事，鑑賞是依角色資料自然演出——兩者共用callGeminiAPI(留在 Engine_Combat.gs)這個基礎設施，但系統提示詞組裝／敘事引擎各自獨立，跟本檔其餘鑑賞 action(召喚/進場/AI深化)集中一處，好查找。
// ==========================================

// 🔠 對話格式·鑑賞【單一真實來源】：2026-09 起只剩鑑賞在用(solo 走 miniSystem 的短版)。這裡【只講格式】，不講該寫什麼。
function dialogueFormatRule_() {
  return `對話格式：單層「」只收嘴巴發得出的聲音(話語/笑聲/嘆息/悶哼)，每句前冠說話者的名字，用卡片開頭那個名字，同一個人跨回合都用同一個；★玩家的台詞免冠名，可以擴寫成完整的一句、補上說這句話當下的動作與神態，語意跟原句一樣；擴寫的範圍就是這一句話。肢體動作與環境聲響留在引號外。`;
}

// 只被鑑賞(慾海)呼叫——solo走完全獨立的 miniSystem。
// 🗑️ 2026-09 master_note(經歷滾動側寫)整個拿掉——玩家「我的經歷怪怪的.....好像是滾動式的」。
//    病在【反覆重新摘要】：每 3 回合把整段經歷壓回 50 字以內，壓過的東西再壓一次，
//    開局寫的東西幾輪後就被最近幾回合洗掉了(lossy re-summarization 的典型衰變)。
//    而且「一路上發生了什麼」現在是世界帳本的工作，它是【追加＋淘汰】、不是反覆重寫——
//    留著這條等於用一個更差的機制做同一件事。經歷從此是固定事實：創角時生成一次，
//    之後只有玩家能透過逆天改命改。這是 2026-07「性格四格/萌點不再交給 AI」那次的最後一塊。
function buildDefaultSystemPrompt(includeOptions, styles, partyStable) {
  // 🐛→✅ 2026-09 舊值是「此刻臉上的神色」——神色每一秒都在變，卻被存進 PHYSICAL 欄又原封餵回去，
  //    於是變成固定綽號（實測：SABER 每一段都是「碧眼充滿好奇」、凜「微微揚眉」、櫻「溫柔微笑」）。
  //    這一格只收【跨回合還成立】的身體事實；神色留在 narration 裡當場寫，不存不餵。
  const _physicalState = "會持續到下一刻的身體狀態(衣衫、痕跡、體液)·第三人稱·≤15字·沒有就留空";

  // appearance_extras(原 outfit_change)：角色當下實際穿著與配飾，AI 依劇情如實更新，寫回持久的【換裝】記錄。2026-09 小道具機制移除後，配飾類事實回歸由這一欄承接。
  const _appearanceExtras = "穿著與配飾·第三人稱·≤20字·沒有就留空";

  const _physicalStateRef = "同上·這個人的";
  const _appearanceExtrasRef = "同上·這個人的";

  // 🗑️ 2026-09 大精簡（玩家「我只要給 AI 當下情況就好」）：範本只留【欄位長相】，說明壓成短詞組。
  //    ⚠ inner_monologue（強制思維鏈·126 字）整欄砍掉：那是叫模型先自省再下筆的教法，不是格式，
  //    而它是整份提示詞裡最長的一條。
  const finalJson = {
    "narration": "劇情",
    "options": ["4條·各≤20字·【我】這一步做得到的動作·走向各不相同"],
    "intimacy_feedback": {
      "player": {
        "physical_state": _physicalState,
        "appearance_extras": _appearanceExtras
      },
      "npcs": [{
        "name": "照卡上的名字寫",
        "physical_state": _physicalStateRef,
        "appearance_extras": _appearanceExtrasRef,
        "mutual_nicknames": "這回合真的叫出口的暱稱·沒有就留空",
        "rel_tag": "≤8字·關係這一步真的往前走了才填·這個人此刻成了玩家的什麼·沒有就留空",
        "memory": "里程碑才寫·≤30字·第一人稱「我」·沒有就留空",
        "noticed": "≤14字·會改變之後怎麼對玩家的發現·沒有就留空"
      }]
    },
    "world_note": [{ "kind": "地點|人物|設定", "name": "一句話標題", "text": "≤" + WORLD_SPEC_.kanshou.textMax + "字", "sex": "kind=人物 才填 男/女/異" }],
  };
  if (includeOptions === false) { delete finalJson.options; }

  // 🔠 對話格式規則：2026-09 起只剩鑑賞在用——那套含喘息/吸吮的例子是 NSFW 取向，solo 是 SFW 戰鬥敘事，改用 miniSystem 內的短版。

  // 🔴 NSFW(慾海模式)：本回合聚焦當下的近身互動(情慾/調情/鋪陳皆可)，雜務(物品/金錢/陣營/任務/招募/地圖/戰鬥數值/身世)完全不追蹤、不輸出，鐵律文字大幅精簡，盡量交給AI自行判斷。
  // 風格段（筆觸／主權／演法／對話格式／尺度／世界／篇幅／收尾）由 kanshouStyle_ 供給：玩家版→關閉→預設。
  //    鐵律照陣列順序動態編號，關掉一段其餘自動補號；預設值全部一格不改時，輸出與舊版寫死的字串逐字相同。
  const _st = k => kanshouStyle_(styles, k);
  // 🗑️ 2026-09 大精簡：鐵律只留【格式】。砍掉的是筆法指導——drive(小要求誰決定)、
  //    continuity(繼承情緒)、肢體互動依性別、裝扮是既定事實、immersion(數值留在系統裡)。
  //    留下的 lewd 是玩家自己的旋鈕（☰⚙ 說書人設定），也是這一軌存在的理由。
  const rules = [
    _st('agency'),
    _st('history'),
    _st('perform'),
    '每3~4句 <br><br> 分段。',
    _st('dialogue'),
    _st('lewd'),
    '只輸出合法 JSON，欄位見下方範本。'
  ].filter(Boolean);
  const nsfwBaseRules = _st('voice') + '格式：\n' + rules.map((r, i) => (i + 1) + '. ' + r).join('\n');

const specificRules = "";

// 🧊 partyStable＝在場那幾位「是誰」（六格人設，整局不變），刻意放在 system：
//    提示詞快取是逐 token 比對前綴，只有每回合逐字相同的東西放進來才吃得到折扣。
//    ⚠ 位置在鐵律之後、輸出範本之前——換同伴時只會作廢這裡之後的那一段（含範本），
//      一回合而已，而 Grok 的快取【寫入免費】，所以重建不花錢。
// ⚠ 刻意【不】pretty-print：縮排與換行每回合都在付字，模型讀緊湊 JSON 一樣準。
return nsfwBaseRules + "\n" + specificRules
  + (partyStable ? "\n" + partyStable : "")
  + "\n★【輸出範本】" + JSON.stringify(finalJson);
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

// 🧑↔🏠 這個名字是不是【地方】而不是人？AI 偶爾會把地點寫成 kind:'人物'（實測玩家看到
//    「你認識了『風音的家』」——拿地名當成一個人）。
const KANSHOU_PLACE_SUFFIX_ = /(的家|的店|之家|宅邸|公寓|大樓|屋|館|亭|堂|苑|園|寺|社|樓|閣|城|站|所|廳|房|室|宅|邸)$/;
function kanshouNameIsPlace_(name, gameId, homeName) {
  const nm = String(name || "").trim();
  if (!nm) return false;
  if (homeName && nm === String(homeName).trim()) return true;
  // 🗑️ 2026-09 地點退休：原本還會比對地圖與大區的名單，現在沒有那份名單了，
  //    只剩住所名與地名尾巴這兩個線索。擋的仍是同一件事（「你認識了風音的家」）。
  return KANSHOU_PLACE_SUFFIX_.test(nm);
}

// 🧹 把 AI 分錯類的 world_note 就地改判：名字其實是地方的「人物」條目改成「地點」。
//    改判而不是丟掉——那個名字本身通常是有意義的新地方，丟了等於玩家白發明一次。
function kanshouFixWorldKinds_(entries, gameId, homeName, peopleNames) {
  if (!Array.isArray(entries)) return entries;
  var known = (peopleNames || []).map(function (n) { return String(n || "").trim(); }).filter(Boolean);
  entries.forEach(function (w) {
    if (!w) return;
    var kind = String(w.kind || "").trim();
    if (kind === '人物' && kanshouNameIsPlace_(w.name, gameId, homeName)) {
      w.kind = '地點';
      w.sex = "";
      return;
    }
    // 反向也會錯：把一個【正式同伴】寫成 kind:'地點'，世界上就多出一個以她為名的地方。
    // 刻意只認【逐字完全相同】的名字——「凜的房間」這種是真的地名，模糊比對會把它一起吃掉。
    if (kind === '地點' && known.indexOf(String(w.name || "").trim()) >= 0) w.kind = '人物';
    // 🗑️ 2026-09 地點退休：這裡原本還會把 AI 寫的大區名翻成區 id（kanshouRegionIdByName_），
    //    大區整個不存在了，那一段跟著移除。
  });
  return entries;
}

// 🗑️ 2026-09 地點整組退休（玩家：「只要扯到移動都會很怪」「地點就是可以一個亂掰的背景」）。
//    這裡原本住著：KANSHOU_REGIONS_／kanshouRegionsFor_／kanshouFindRegion_／kanshouFindLoc_／
//    KANSHOU_REGION_LABEL_／kanshouRegionIdByName_／kanshouLocContextForAI_／
//    KANSHOU_LOCATIONS_／KANSHOU_STARTER_PLACES_／KANSHOU_MAP_SEED_TAG_／kanshouSeedMap_／
//    kanshouSeedMapIfNew_／kanshouLocNameForAI_／kanshouRoomDisplayName_／kanshouLocationsFor_。
//    整組移除的理由見 KANSHOU_REFERENCE.md。⚠ COL.PC.LOC 欄本身【不刪】——solo 還在用它
//    一百多處，鑑賞這一軌單純不再讀寫（CLAUDE.md：COL 是位置索引，寧棄用不刪欄）。

// 暫時移出鑑賞的英靈id清單(單一來源)：召喚共用同一份。
// 2026-09 玩家「想辦法讓他們可以召喚」→ 清空。原本被擋的三位真正的問題是【撞名】
// （斯卡哈有 Lancer/Assassin 兩種靈基、伊莉雅有 Master/Caster 兩個版本），封鎖只是繞過去；
// 現在由下方 kanshouSummonClash_ 擋「同一個人同時在場」，兩種姿態各自都召喚得到，選一個。
const KANSHOU_SUMMON_BLOCKED_IDS_ = [];
// 🏘️ 開局起始住民(2026-07玩家定案)：只有這4位一開始就「活在這座城裡」，其餘靠 🌟 召喚入駐。
const KANSHOU_STARTER_IDS_ = ['藤村大河-Master', '遠坂凜-Master', '間桐櫻黑化-Master', '阿爾托莉雅-Saber'];
// 🫂 同行名單（存【玩家】列 MEMORY·逗號分隔的 id）：2026-09 玩家定案「我可以指定 AI 跟我一起，
//    他必須回應我；其他人可以出現但只是很薄的背景板」。這是「誰在這一幕裡」的【唯一】判準
//    ——2026-09 地點整組退休之後，它也是唯一還說得出「誰在場」的東西。
// ⚠ 存 id 不存名字：鑑賞眾生是全帳號共用一張表，大家都從同一座英靈殿召喚，撞名是常態不是巧合
//    （同款坑見 CODE_NOTES 的「初次·同床蓋到別人那列」）。
const KANSHOU_PARTY_MAX_ = 3;
// 🌍 這個世界裡總共住幾個人。同行上限管「幾個人跟著你走」，這個管「城裡有幾個人」。
// ⚠ 起始住民就佔了 4 位（KANSHOU_STARTER_IDS_），所以這個數字要留得下玩家自己邀的人。
//    滿了之後靠面板上的「🚪 請她離開這座城」（op:'evict'）騰位子——那顆鈕要是哪天砍了，
//    這個數字要再放寬，否則世界會在滿員的那一刻永遠鎖死。
const KANSHOU_WORLD_MAX_ = 8;
// 🗜️ 逐字對話歷史的窗口（則數，2＝最近一個來回）。2026-09 從 4 砍成 2，理由是量出來的：
//    穩定之後每回合送出去的東西裡，【玩家講的話 16 字、說書人自己上兩段寫的散文 1020 字】——
//    1 比 64。模型在問「這一回合該長什麼樣」時，context 裡聲音最大的答案就是它自己剛寫的那兩塊，
//    於是第 3 回合起開始逐字抄自己（玩家原話：「後面給太多資訊，AI 走不出來」）。
//    砍成 2 之後它自己的散文從 1020→510 字、佔比 29%→17%。
//    ⚠ 再往前的事情【不是消失】，走的是挑過的事實那三條路：世界帳本／共同回憶／她眼中的你。
//    ⚠ 這個數字直接換敘事連貫感，調它之前先想清楚要換什麼。
const KANSHOU_HIST_WINDOW_ = 4;
var KANSHOU_PARTY_TAG_ = makeTextTag_('同行');
function kanshouGetParty_(memory) {
  return String(KANSHOU_PARTY_TAG_.get(memory) || "").split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}
function kanshouSetParty_(memory, ids) {
  return KANSHOU_PARTY_TAG_.set(memory, (ids || []).slice(0, KANSHOU_PARTY_MAX_).join(','));
}
// 世界概況(輕量版)名單上限——同伴一多，每回合都列全部人+所在地會讓提示詞無限膨脹，只取好感前幾位。
const KANSHOU_WORLD_ROSTER_CAP_ = 8;
// 🪪 短名／真名 → 種子 id：短名優先(id 唯一對應，不受真名撞名影響)，再退回真名候選比對。
// 真正的西曆年/月/日(每年固定365天、不算閏年，遊戲用途夠精準)，只抓3年區間(見actionPlay的advanceHours上限)不追求無限年份。
const KANSHOU_CAL_START_MONTH_ = 12, KANSHOU_CAL_START_DAY_ = 20;
// 開局那年的西元年。原本沒有這個常數、year 直接算成「第幾年」，開局就顯示「1年12月20日」——
// 那個年份不存在於任何世界裡，玩家的時鐘與送給 AI 的日期都在講一個假年份。
const KANSHOU_CAL_START_YEAR_ = 2005;
const KANSHOU_DAYS_IN_MONTH_ = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
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

// 「跳到時段」：GAS算好差幾小時再丟進既有advanceHours管線，單一真實來源在後端。
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
// ⏰ 時間隨玩家動作自然流動：一般 AI 敘事回合每次推進 10 分鐘(讓「到處跑卻永遠停在6點」的凍結感消失)。
//    ⚠ 2026-09 玩家把這個旋鈕砍了：一個回合本來就不是一段固定的時間，交給玩家調只是把
//    「說不準」變成一個要設定的東西。想讓一天過去就按「下一階段」或「結束一天」。
const KANSHOU_MIN_PER_TURN_ = 10;
function kanshouHourPerAction_() { return KANSHOU_MIN_PER_TURN_ / 60; }
const KANSHOU_DAY_LAST_HOUR_ = 23;
// 小時(可含 .5)→「HH:MM」，支援半小時刻度。
function kanshouFmtHM_(h) {
  var hh = Math.floor(h);
  var mm = Math.round((h - hh) * 60);
  if (mm >= 60) { hh += 1; mm -= 60; }
  return ("0" + hh).slice(-2) + ":" + ("0" + mm).slice(-2);
}
// 「跳到時段」＋「時段行動」按鈕都需要前端知道現在幾點——這裡統一格式化成單一真實來源，buildClientState_/actionPlay的回應都呼叫這支，不各自重複拼字串。
function kanshouClockInfo_(pcRow) {
  const day = parseInt(pcRow[COL.PC.DAY]) || 1;
  const hour = (pcRow[COL.PC.HOUR] === "" || pcRow[COL.PC.HOUR] == null) ? 8 : (parseFloat(pcRow[COL.PC.HOUR]) || 0);
  const band = timeBand_(hour);
  const d = kanshouAbsDayToDate_(day);
  return { day: day, hour: hour, band: band, month: d.month, dayOfMonth: d.day, label: d.year + "年" + d.month + "月" + d.day + "日・" + kanshouFmtHM_(hour) + "・" + band };
}

// 好感≥80觸發同床共枕的那次結束一天，順手記一筆「今晚共度良宵的對象」，下一回合(不論玩家做什麼)讀一次就清掉(一次性旗標)，餵進提示詞當【晨間餘韻】引子。
// 🔒 創角敘事欄「已經補過了」的章：蓋了之後 backfill 只填還空著的格子，不再覆寫玩家玩出來的內容。
var KANSHOU_BACKFILL_DONE_TAG_ = makeIntTag_('設定已補', 0);
var KANSHOU_MORNING_AFTER_TAG_ = makeTextTag_('晨間餘韻');
// 🌙 同款一次性旗標的另一半：那些「昨晚陪你到最後、卻沒留下來」的人。
// 🌙 夜未眠(存玩家列·absDay)：2026-07 玩家「睡覺按鈕這裡有被夜襲判定+色色…要再切一段深夜的大戰時刻...?」。
var KANSHOU_NIGHT_SCENE_TAG_ = makeIntTag_('夜未眠', 0);

// 通用【tag】值淨化：清掉標籤分隔字元(,/:/｜/【/】)避免撐破 MEMORY 裡任何單值 tag 的格式(住所名…)，順手也清掉引號/角括號(防提示詞注入)。
function kanshouSanitizeTagValue_(value, maxLen) {
  return String(value || "").replace(/[,:｜【】"'<>\n\r\t]/g, "").trim().slice(0, maxLen || 8);
}
// ═══════════════════════════════════════════════════════════════════
// 🌍 世界帳本 —— AI 發明出來的東西，落盤的地方
// ═══════════════════════════════════════════════════════════════════
// 在這之前，鑑賞的「世界」是 22 張寫死的表，AI 只能在裡面排列組合；而它能寫回試算表的
// 全部是「已經在表上那些人」的屬性(好感/外顯/暱稱/共同回憶)——不能新增一個地方、一個人、
// 一條設定。所以玩家感覺到的是「全都有設定過」。
// 反轉：試算表從【AI 讀的選單】變成【AI 寫的帳本】。發明會出問題只是因為沒落盤；
// 落了盤，發明就不是雜訊，是在蓋世界。詳見 KANSHOU_REFERENCE.md §「世界帳本」。
// 🧭 兩軌共用同一個帳本引擎，只有【規格】不同：能寫哪些類別、各類存幾條、一回合寫幾條餵幾條。
//    加一軌＝往這張表加一列，引擎自動吃（判準是 game_id 前綴，那是實例化本來就有的東西）。
//    ⚠ kinds 同時驅動三件事：AI 能寫哪些 kind、哪些 kind 會被淘汰、面板列哪些。
var WORLD_SPEC_ = {
  kanshou: {
    sheet: '世界帳本',
    kinds: ['地點', '人物', '設定'],
    cap: { '地點': 60, '人物': 40, '設定': 50 },
    feedTitle: '這個世界已經確立的事',
    feedTail: '這些是我們一路玩出來的既定事實，需要時原樣承接。',
    // 🖥️ 面板文案也逐軌登記：前端只負責畫，不自己判斷這一局是哪一軌。
    panel: {
      title: '🌍 這個世界',
      hint: '你們一路走出來的地方、認識的人、說定的事。📌 釘住的不會忘；記錯的可以刪。',
      empty: '還沒有東西。<br>玩下去就會長出來。去一個地圖上沒有的地方、認識新的人、聊出只有你們懂的事，都會記在這裡。',
      groups: [['人物', '🧑 這座城裡的人'], ['設定', '📖 這座城的事']],
      locNote: true   // 地點歸地圖，這裡只提醒一句它們在哪一區
    },
    feedMax: 6,   // 一回合最多餵回幾條——帳本會長大，這是唯一的煞車
    atMax: 5,     // 掛在此刻這個地方(AT)的另外算，不跟上面搶名額
    writeMax: 3,  // AI 一回合最多寫幾條
    textMax: 60
  },
  // ⚔️ solo 的世界是定的（冬木、聖杯戰爭、七組御主從者），人和地點種子庫早就有了——
  //    再讓 AI 寫一次人物卡就是兩個真實來源打架。solo 真正在忘的是【這一局的因果】：
  //    歷史只有 6 筆＝最近三個按鍵，第 3 天砍斷了誰、跟誰結過盟又翻臉、教會開過什麼條件，
  //    第 10 天一個字都不剩。戰報那邊 GAS 有數字，但「那一戰之後這個世界變成什麼樣」沒有人記。
  solo: {
    sheet: '世界帳本',
    kinds: ['因果'],
    cap: { '因果': 40 },
    feedTitle: '這一局已經發生的因果',
    feedTail: '這些是這一局真的發生過、還在影響現在的事，需要時原樣承接。',
    panel: {
      title: '📜 戰記',
      hint: '這一局真的發生過、還在影響現在的事。📌 釘住的不會忘；記錯的可以刪。',
      empty: '還沒有東西。<br>打下去就會長出來。誰殞落了、跟誰結了盟、教會開了什麼條件，都會記在這裡。',
      groups: [['因果', '📜 這一局發生過的事']],
      locNote: false
    },
    feedMax: 5,
    atMax: 0,
    writeMax: 2,
    textMax: 50
  }
};
// 這一局屬於哪一軌：game_id 前綴就是答案（solo 是 g_、鑑賞是 k_）。
function worldTrack_(gameId) { return String(gameId || "").indexOf('g_') === 0 ? 'solo' : 'kanshou'; }
function worldSpec_(gameId) { return WORLD_SPEC_[worldTrack_(gameId)] || WORLD_SPEC_.kanshou; }
// 各類上限、一回合寫幾條餵幾條，全部搬進上方 WORLD_SPEC_ 逐軌登記。
// 性別只有「人物」類用得到，但升格成正式同伴時它是必要的(肢體互動依【性別】欄)，所以存在表上而非事後猜。
// ⚠ COL 是位置索引：新欄位一律【接在最後】，絕不插在中間(插了整表位移)。
//    REGION：這個地點屬於哪一區(kind=地點 才有意義；空＝走出來的地方)。
//    OWN：這個地方是不是你的、你在這裡做什麼(空＝不是你的；有值＝營業內容，如「小吃」「按摩」)。
// 🎨 風格層：說書人「怎麼寫」的那幾段交給玩家（2026-09 玩家定案「符合自由 玩家自己決定增減」）。
//    事實（GAS 裁定）、技術契約（JSON／分段／在場驗證）不交；只有筆觸／主權／推演／視角／篇幅／收尾這類
//    fixed: true＝這一段不開放玩家調，def 就是它的全部（面板看不到、路由拒收、表上的舊列一律忽略）。
//    玩家真正能動的只有【尺度】與【篇幅】兩格。
//    slot：sys＝進系統提示詞（nsfwBaseRules 那串鐵律）、user＝進 USER prompt 對應位置。
//    hint：面板上給玩家看的一句話（這一段管什麼）。⚠ def 是提示詞本體，【不下傳前端】——見 CODE_NOTES。
//    文字裡的 {玩家}／{代名詞} 在組裝時代入玩家名與代名詞(他/她/TA)；{篇幅} 代入這回合算出的字數區間。
//    ⚠ 預設值故意留在 .gs 而不搬進試算表：check_prompt／check_pronoun 這些掃描器只看 .gs。（理由見 CODE_NOTES）
// 📏 篇幅檔位（玩家可選）：字數區間與 token 上限綁同一列，改一格兩邊一起動。
//    ⚠ tokens 要蓋得住「narration ＋ JSON 固定開銷」——欄位全滿時開銷約 1057 字，narration 超出去就被截斷成壞 JSON。
//    auto＝沿用 KANSHOU_WORDS_ 那張依好感/大事的自動表（預設）。
var KANSHOU_LEN_TIERS_ = [
  { key: 'auto', label: '自動', words: '', tokens: 0 },
  // 🕊️ 隨意：【篇幅】那一行整個不送，長短由 AI 依這一幕自己決定（2026-09 玩家「能夠讓他自由決定
  //    字數嗎? 平淡就平淡?」——指定了 500 字，平淡的一幕就只能拿設定來湊滿）。
  { key: 'free', label: '隨意', words: '', tokens: 2400, free: true },
  { key: '300', label: '300 字', words: '260~340', tokens: 1800 },
  { key: '500', label: '500 字', words: '440~560', tokens: 2200 },
  { key: '700', label: '700 字', words: '620~780', tokens: 2600 },
  { key: '900', label: '900 字', words: '820~980', tokens: 3200 }
];
function kanshouLenTier_(key) {
  return KANSHOU_LEN_TIERS_.find(t => t.key === String(key || 'auto')) || KANSHOU_LEN_TIERS_[0];
}

var KANSHOU_STYLE_MODULES_ = [
  { key: 'voice',      fixed: true, slot: 'sys',  def: '後日談敘事核心·輕小說筆觸·台灣繁體中文·第一人稱「我」＝玩家，旁白只寫「我」看得到聽得到感覺得到的。' },
  // 🗑️ 2026-09 大精簡：enact／drive／continuity／immersion／pov／feel 六格整組砍除——那些是筆法指導，
  //    不是「當下情況」也不是格式。agency 收下 enact 的那半句（玩家這一步怎麼接），一格講完。
  { key: 'agency',     fixed: true, slot: 'sys',  def: '玩家這一步做什麼、說什麼，由玩家的輸入決定；narration 從這一步演起。' },
  // 📜 歷史是已經結束的事。2026-09 大精簡時隨 continuity 模組一起砍掉了（當時當成「筆法指導」），
  //    但它其實是【事實陳述】不是筆法——少了它，模型看到自己上一輪寫的 500 字就順著同一個調子
  //    把同一個場景再描述一次。玩家實測：四回合裡「米白色針織衫」出現 4 次、
  //    「如果塔上的草莓太甜…」一字不差重講一遍。solo 的 miniSystem 第 5 條一直都有這句。
  { key: 'history',    fixed: true, slot: 'sys',  def: '上面的對話歷史是已經結束的事，它讓你知道這一路走到哪裡了；這一回合要寫的，是玩家這一步【接下來】發生的那一段——新的動作、新的話、新的反應。' },
  // 🎬 卡上那幾句【分別是什麼】。卡片是自然語言、沒有欄位名，所以這一格只負責把每一句的
  //    意思講清楚，讓 AI 知道自己讀到的是哪一種事實。
  // ⚠ 2026-09 玩家兩次修正這一格的寫法，兩次都是同一個方向：
  //    ①「讓它們互相拉扯…這不用提示吧，他會一直拉扯，很怪」——無條件的演出指示會固化成每回合硬演；
  //    ②「告訴她意思、事實，不要教他該怎麼做」——所以這裡【只下定義，不給演法】。
  //    怎麼用、什麼時候用，交給模型自己判斷，這也正是這一軌「全靠 AI 即興」的前提。
  { key: 'perform',    fixed: true, slot: 'sys',  def: '在場那幾張卡，開頭是這個人的名字，括號裡是性別，後面是這個人是什麼樣的人；名字後面另外接的那幾行是此刻的狀態。★卡上這些句子、還有【我自己】那張，都只給你看，在場的人並不知道自己被這樣寫著；每張卡上的事是我跟那個人之間的事，其他人手上有的，僅限於自己在場時看得到聽得到的那些。★卡上寫的是【一直以來】的底色，不是這一回合發生的事。' },
  { key: 'dialogue',   fixed: true, slot: 'sys',  def: '' },   // 預設走 dialogueFormatRule_()，見 kanshouStyleDefault_
  { key: 'lewd',       name: '尺度',     hint: '情慾場面寫多開——哪些東西要真的出現在畫面上。尺度一律跟著玩家推進到哪裡走。', slot: 'sys', def: '尺度跟著玩家走：玩家在聊天就好好聊天、把日常寫得有滋味；玩家真的伸出手了，才順著往下走。真進到情慾場面就寫滿寫透——器官用本名，體液、聲音、氣味、溫度全部照實寫，身體的反應寫具體。' },
  { key: 'world',      fixed: true, slot: 'user', def: '★這個世界＝和平的現代冬木市，大家都是住在這裡的普通市民。' },
  { key: 'lenTier',    name: '篇幅',     hint: '一回合寫多長。自動＝依這回合有沒有大事調；隨意＝不給字數，平淡的一幕就讓它平淡。', slot: 'none', kind: 'pick', def: 'auto' },
  { key: 'length',     fixed: true, slot: 'user', def: '★【篇幅】這一段寫 {篇幅} 字。' },   // ⚠ 篇幅選「隨意」時整段不送，見 actionPlay_ 的 _sty_('length')
];
var KANSHOU_STYLE_TEXT_MAX_ = 300;
var KS_ = { GID: 0, KEY: 1, TEXT: 2, ON: 3 };

function kanshouStyleModule_(key) {
  return KANSHOU_STYLE_MODULES_.find(m => m.key === key) || null;
}
// 預設值的唯一出口：dialogue 那格的預設是一支函式，不是字串，所以不能直接讀 def。
function kanshouStyleDefault_(key) {
  if (key === 'dialogue') return dialogueFormatRule_();
  const m = kanshouStyleModule_(key);
  return m ? m.def : '';
}

function kanshouStyleSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('鑑賞風格');
  if (!sh) {
    sh = ss.insertSheet('鑑賞風格');
    sh.appendRow(['遊戲ID', '模組', '文字', '開關']);
  }
  return sh;
}

// 這一局的風格覆寫：{key: {text, on}}。每回合都要讀，走快取；唯一寫入點 kanshouStyleWrite_ 自己清快取。
function kanshouStyleRead_(gameId) {
  const gid = String(gameId || "");
  if (!gid) return {};
  const cache = CacheService.getScriptCache();
  const key = 'KS_' + gid;
  try { const c = cache.get(key); if (c) return JSON.parse(c); } catch (e) { }
  const out = {};
  try {
    const d = kanshouStyleSheet_().getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][KS_.GID]) !== gid) continue;
      const k = String(d[i][KS_.KEY] || "");
      const _km = kanshouStyleModule_(k);
      if (!_km || _km.fixed) continue;   // fixed＝已不開放調整，舊列直接當不存在
      out[k] = { text: String(d[i][KS_.TEXT] || ""), on: String(d[i][KS_.ON] || "") !== '0' };
    }
  } catch (e) { }
  try { cache.put(key, JSON.stringify(out), 120); } catch (e) { }
  return out;
}
function kanshouStyleBust_(gameId) {
  try { CacheService.getScriptCache().remove('KS_' + String(gameId || "")); } catch (e) { }
}
// 寫一格：text 空＝用預設、on=false＝整段不送。row=null 代表「刪掉這一列＝回到預設」。
function kanshouStyleWrite_(gameId, key, row) {
  const gid = String(gameId || "");
  const _wm = kanshouStyleModule_(key);
  if (!gid || !_wm || _wm.fixed) return false;
  const sh = kanshouStyleSheet_();
  const d = sh.getDataRange().getValues();
  let hit = -1;
  for (let r = 1; r < d.length; r++) {
    if (String(d[r][KS_.GID]) === gid && String(d[r][KS_.KEY]) === key) { hit = r; break; }
  }
  if (!row) {
    if (hit > 0) sh.deleteRow(hit + 1);
  } else {
    const vals = [gid, key, String(row.text || ""), row.on === false ? '0' : '1'];
    if (hit > 0) sh.getRange(hit + 1, 1, 1, vals.length).setValues([vals]);
    else sh.appendRow(vals);
  }
  kanshouStyleBust_(gid);
  return true;
}
// 組 prompt 時的唯一讀口：玩家版 → 關閉＝'' → 預設。vars 代入 {玩家}{代名詞}{篇幅} 這類佔位。
function kanshouStyle_(styles, key, vars) {
  const m = kanshouStyleModule_(key);
  if (!m) return '';
  const o = (styles || {})[key];
  let t;
  if (o && o.on === false) t = '';
  else if (o && String(o.text || "").trim()) t = String(o.text);
  else t = kanshouStyleDefault_(key);
  if (vars && t) Object.keys(vars).forEach(k => { t = t.split('{' + k + '}').join(String(vars[k] == null ? '' : vars[k])); });
  return t;
}
// 玩家給的文字：不剝 ｜【】（這不是 MEMORY，它自己一張表），只擋長度與空白。
function kanshouStyleClean_(text) {
  return String(text || "").replace(/\r/g, "").trim().slice(0, KANSHOU_STYLE_TEXT_MAX_);
}

// 🎨 ⚙ 說書人設定面板的後端：get 回整張表（只給提示與玩家自己的字，不給預設本體）、set 改一格／還原一格／全部還原。
// 💞 直接把某人的羈絆調成指定值（玩家自己拉的，不是劇情給的）。
//    2026-09 起【只服務 solo】——鑑賞的好感整組砍除，那一軌沒有這個數字了。
function actionKanshouGetStyle(userData, pcId, sheets) {
  const kpc = sheets.pc;
  const data = kpc.getDataRange().getValues();
  const meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  const gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  const styles = kanshouStyleRead_(gid);
  const modules = KANSHOU_STYLE_MODULES_.filter(m => !m.fixed).map(m => {
    const o = styles[m.key] || null;
    return { key: m.key, name: m.name, slot: m.slot, hint: m.hint || "", kind: m.kind || 'text',
      options: m.kind === 'pick' ? KANSHOU_LEN_TIERS_.map(t => ({ key: t.key, label: t.label })) : undefined,
      text: o ? o.text : "", on: o ? o.on !== false : true, custom: !!(o && String(o.text || "").trim()) };
  });
  return JSON.stringify({ success: true, modules: modules, max: KANSHOU_STYLE_TEXT_MAX_ });
}
function actionKanshouSetStyle(userData, pcId, sheets) {
  const kpc = sheets.pc;
  const data = kpc.getDataRange().getValues();
  const meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  const gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  if (!gid) return JSON.stringify({ success: false, message: "這局的資料不完整。" });
  try {
    if (userData.resetAll) {
      KANSHOU_STYLE_MODULES_.filter(m => !m.fixed).forEach(m => kanshouStyleWrite_(gid, m.key, null));
      return JSON.stringify({ success: true });
    }
    const key = String(userData.key || "").trim();
    const mod = kanshouStyleModule_(key);
    if (!mod || mod.fixed) return JSON.stringify({ success: false, message: "沒有這個模組。" });
    if (userData.reset) { kanshouStyleWrite_(gid, key, null); return JSON.stringify({ success: true }); }
    // 📏 檔位型只收表上有的那幾個值。收了表外的字會：存得進去、回 success、面板沒有一顆亮著、
    //    實際又靜靜當成 auto——零錯誤訊息的那種壞法。順便固定 on=true（檔位沒有「關閉」這個狀態）。
    if (mod.kind === 'pick') {
      const pick = String(userData.styleText || "").trim();
      if (!KANSHOU_LEN_TIERS_.some(t => t.key === pick)) return JSON.stringify({ success: false, message: "沒有這個檔位。" });
      kanshouStyleWrite_(gid, key, pick === KANSHOU_LEN_TIERS_[0].key ? null : { text: pick, on: true });
      return JSON.stringify({ success: true });
    }
    const text = kanshouStyleClean_(userData.styleText);
    const on = String(userData.on) !== 'false' && userData.on !== false && String(userData.on) !== '0';
    // 文字空又開著＝跟預設一樣，不留列（表上只放真的有改的）。
    if (!text && on) kanshouStyleWrite_(gid, key, null);
    else kanshouStyleWrite_(gid, key, { text: text, on: on });
    return JSON.stringify({ success: true });
  } catch (e) { return JSON.stringify({ success: false, message: "儲存失敗，請稍後再試。" }); }
}

// ⚠ 欄是位置索引：要加欄一律接在最後，中間插一格會讓整張表錯位。
var KW_ = { GID: 0, KIND: 1, NAME: 2, TEXT: 3, SEX: 4, BORN: 5, SEEN: 6, HITS: 7, PIN: 8, REGION: 9, OWN: 10, AT: 11 };

// 🗂️ 兩軌共用同一張帳本表（列與列之間靠遊戲ID分流，那是實例化本來就有的東西）。
// ⚠ 分頁本來叫「鑑賞世界」，solo 也開始寫之後那個名字就在說謊了。就地改名而不是另開一張：
//    另開會讓既有的鑑賞資料留在舊分頁上，等於玩家的世界整個不見。setName 是原地操作、資料不動。
const WORLD_SHEET_NAME_ = '世界帳本';
const WORLD_SHEET_LEGACY_NAME_ = '鑑賞世界';
function worldSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(WORLD_SHEET_NAME_);
  if (sh) return sh;
  const old = ss.getSheetByName(WORLD_SHEET_LEGACY_NAME_);
  if (old) { try { old.setName(WORLD_SHEET_NAME_); } catch (e) { } return old; }
  sh = ss.insertSheet(WORLD_SHEET_NAME_);
  sh.appendRow(['遊戲ID', '類別', '名稱', '內容', '性別', '建立日', '最後提及日', '提及次數', '釘選', '大區', '我的', '在哪']);
  return sh;
}

// 一列 → 一個帳本條目。讀與寫回填快取共用同一份對應，欄位長相只有這裡說了算。
function worldRow_(a, rowNum) {
  return {
    kind: String(a[KW_.KIND] || ""), name: String(a[KW_.NAME] || ""), text: String(a[KW_.TEXT] || ""),
    sex: String(a[KW_.SEX] || ""), born: parseInt(a[KW_.BORN]) || 0, seen: parseInt(a[KW_.SEEN]) || 0,
    hits: parseInt(a[KW_.HITS]) || 0, pin: String(a[KW_.PIN] || "") === '★',
    region: String(a[KW_.REGION] || ""), own: String(a[KW_.OWN] || ""),
    at: String(a[KW_.AT] || ""), row: rowNum
  };
}

// 這一局的帳本。每回合都要讀，所以走快取；唯一的寫入點 worldWrite_ 會自己把快取換成新內容。
function worldRead_(gameId) {
  const gid = String(gameId || "");
  if (!gid) return [];
  const cache = CacheService.getScriptCache();
  const key = 'KW_' + gid;
  try { const c = cache.get(key); if (c) return JSON.parse(c); } catch (e) { }
  let out = [];
  try {
    const d = worldSheet_().getDataRange().getValues();
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][KW_.GID]) !== gid) continue;
      out.push(worldRow_(d[i], i + 1));
    }
  } catch (e) { }
  try { cache.put(key, JSON.stringify(out), 120); } catch (e) { }
  return out;
}

function worldBust_(gameId) {
  try { CacheService.getScriptCache().remove('KW_' + String(gameId || "")); } catch (e) { }
}

// 近義去重：同一件事 AI 換句話說會記成好幾條(memoir 實測過「超級洗畫面」)，同款 bigram 比對。
// ⚠ 這道網【只用在近期迴聲】(見 worldWrite_)，不掃全表：句型相近但語意不同的事實太常見
//    （「她喜歡在便利商店買關東煮」vs「…買茶葉蛋」bigram 重疊極高），拿去掃全表會把世界愈合併愈空。
function worldSame_(a, b) {
  const norm = t => String(t || "").replace(/[，。、！？…「」『』\s]/g, "");
  const A = norm(a), B = norm(b);
  if (!A || !B) return false;
  if (A === B) return true;
  const bi = t => { const o = {}; for (let i = 0; i < t.length - 1; i++) o[t.substr(i, 2)] = 1; return o; };
  const ba = bi(A), bb = bi(B);
  const ka = Object.keys(ba), kb = Object.keys(bb);
  if (ka.length < 3 || kb.length < 3) return false;
  let hit = 0; ka.forEach(g => { if (bb[g]) hit++; });
  return hit / Math.min(ka.length, kb.length) >= 0.7;
}

// 寫入：已存在(同類同名)就更新內容與「最後提及日」，否則新增；超量就淘汰最久沒被提到的。
// entries = [{kind, name, text}]，回傳真的落盤的筆數。
// ⚠ max 預設是【給 AI 的煞車】(一回合最多幾筆)。GAS 自己種資料時傳 entries.length——
//    那不是 AI 亂寫，分批送只會為了同一件事把整張表讀寫好幾趟。
function worldWrite_(gameId, entries, curDay, max) {
  const gid = String(gameId || "");
  if (!gid || !Array.isArray(entries) || !entries.length) return 0;
  const spec = worldSpec_(gid);
  const clean = [];
  entries.slice(0, max || spec.writeMax).forEach(e => {
    if (!e) return;
    const kind = String(e.kind || "").trim();
    // 大區也走這支寫入(同一套清洗/去重/快取)，但它【不在】WORLD_SPEC_ 的 kinds 裡——
    // 那張表管的是「AI 能寫哪些 kind」與「哪些 kind 會被淘汰」，大區兩者皆非。
    // AI 走不到這裡：sanitizeAiData_ 在上游就只放行那三種 kind。
    if (spec.kinds.indexOf(kind) < 0) return;
    // ⚠ world_note 是【AI 產的】、不經過 sanitizeUserData_，所以清洗要在這裡做完：
    //    ①斷字/偽造標記字元 ②開頭的公式引導字元(寫進儲存格會被 Google Sheet 當公式執行)
    const _f = v => String(v || "").replace(/[<>&"'`｜【】\[\]★\r\n\t]/g, "").replace(/^[=+\-@\t\r]+/, "").trim();
    const name = _f(e.name).slice(0, 20), text = _f(e.text).slice(0, spec.textMax);
    if (!name && !text) return;
    const sex = (['男', '女', '異'].indexOf(String(e.sex || "").trim()) >= 0) ? String(e.sex).trim() : "";
    // 📍 at＝這條長在哪個地方（農場、雞、店裡的常客…）。只收這一局真的存在的地名，
    //    AI 隨手寫個不存在的地方就當它沒填——不然那條會永遠餵不回來。
    // 🗑️ 2026-09 地點退休：at（這條長在哪個地方）沒有「此刻在哪」可以比對了，整格停用。
    //    ⚠ 試算表的 AT 欄保留不刪（同 COL 的規矩），只是不再讀寫。
    const at = "";
    clean.push({
      kind: kind, name: name || text.slice(0, 12), text: text, sex: sex,
      region: _f(e.region).slice(0, 24), own: _f(e.own).slice(0, 12), at: at
    });
  });
  if (!clean.length) return 0;

  let sh, d;
  try { sh = worldSheet_(); d = sh.getDataRange().getValues(); } catch (e) { return 0; }
  const day = parseInt(curDay) || 0;
  const mine = [];
  for (let i = 1; i < d.length; i++) if (String(d[i][KW_.GID]) === gid) mine.push(i);
  let wrote = 0, touched = false;
  const added = [];

  clean.forEach(c => {
    // 同類同名＝同一個東西（名字是主鍵）；內容近義只當【近期迴聲】的防線，且只比對最近兩天寫的，
    // 不掃全表——理由見 worldSame_ 上方。
    const hit = mine.find(i => String(d[i][KW_.KIND]) === c.kind && (
      String(d[i][KW_.NAME]).trim() === c.name ||
      ((parseInt(d[i][KW_.SEEN]) || 0) >= day - 2 && worldSame_(d[i][KW_.TEXT], c.text))
    ));
    if (hit !== undefined) {
      if (c.text) d[hit][KW_.TEXT] = c.text;
      if (c.sex && !String(d[hit][KW_.SEX] || "").trim()) d[hit][KW_.SEX] = c.sex;
      if (c.region && !String(d[hit][KW_.REGION] || "").trim()) d[hit][KW_.REGION] = c.region;
      if (c.own && !String(d[hit][KW_.OWN] || "").trim()) d[hit][KW_.OWN] = c.own;
      if (c.at) d[hit][KW_.AT] = c.at;
      d[hit][KW_.SEEN] = day;
      d[hit][KW_.HITS] = (parseInt(d[hit][KW_.HITS]) || 0) + 1;
      wrote++; touched = true;
      return;
    }
    const row = []; row[KW_.GID] = gid; row[KW_.KIND] = c.kind; row[KW_.NAME] = c.name; row[KW_.TEXT] = c.text;
    row[KW_.SEX] = c.sex; row[KW_.BORN] = day; row[KW_.SEEN] = day; row[KW_.HITS] = 1; row[KW_.PIN] = "";
    row[KW_.REGION] = c.region; row[KW_.OWN] = c.own; row[KW_.AT] = c.at;
    added.push(row); wrote++;
  });

  // 落盤：淘汰【併在這裡一起做】——手上已經有整張表了，不再為了淘汰多讀一次整表。
  //   留下來的整批寫回、尾巴一次砍掉（同 kanshouPurgeByGame_ 的樣式，不逐列 deleteRow）。
  try {
    const dropSet = worldEvictees_(d, gid, added, day);
    const kept = [];
    for (let i = 1; i < d.length; i++) if (!dropSet['r' + i]) kept.push(d[i]);
    const cols = d[0].length;
    const tail = (d.length - 1) - kept.length;
    // 沒有就地更新、也沒有淘汰時就別整表寫回（純新增的回合只要 appendRow）。
    if (kept.length && (touched || tail > 0)) sh.getRange(2, 1, kept.length, cols).setValues(kept);
    if (tail > 0) sh.deleteRows(2 + kept.length, tail);
    const live = kept.slice();
    added.forEach((r, k) => {
      if (dropSet['a' + k]) return;
      while (r.length < cols) r.push("");
      sh.appendRow(r); live.push(r);
    });
    // 快取【換成新內容】而不是作廢：剛寫完的人最清楚表上現在長怎樣，作廢只會逼同一次執行裡
    //   後面那支 worldRead_ 再整表讀一次（每按鍵 round-trip 是紅線）。
    //   列號是算得出來的：留下來的依序接在表頭後面，新增的排在最尾。
    const mineNow = [];
    for (let j = 0; j < live.length; j++) if (String(live[j][KW_.GID]) === gid) mineNow.push(worldRow_(live[j], j + 2));
    try { CacheService.getScriptCache().put('KW_' + gid, JSON.stringify(mineNow), 120); } catch (e2) { }
  } catch (e) { worldBust_(gid); return 0; }
  return wrote;
}

// 改帳本某一列的某一欄（改名／搬區／開店收店共用）。回傳有沒有改到。
function worldSet_(gameId, kind, name, col, val) {
  const gid = String(gameId || ""), k = String(kind || "").trim(), n = String(name || "").trim();
  if (!gid || !k || !n) return false;
  try {
    const sh = worldSheet_();
    const d = sh.getDataRange().getValues();
    for (let r = 1; r < d.length; r++) {
      if (String(d[r][KW_.GID]) !== gid || String(d[r][KW_.KIND]) !== k) continue;
      if (String(d[r][KW_.NAME]).trim() !== n) continue;
      sh.getRange(r + 1, col + 1).setValue(val);
      worldBust_(gid);
      return true;
    }
  } catch (e) { }
  return false;
}

// 從帳本拿掉一條（同類同名）。面板的「刪掉」與「常民升格成正式同伴」共用這一支。
// 回傳有沒有真的刪到。
function worldDrop_(gameId, kind, name) {
  const gid = String(gameId || ""), k = String(kind || "").trim(), n = String(name || "").trim();
  if (!gid || !k || !n) return false;
  try {
    const sh = worldSheet_();
    const d = sh.getDataRange().getValues();
    for (let r = 1; r < d.length; r++) {
      if (String(d[r][KW_.GID]) !== gid || String(d[r][KW_.KIND]) !== k) continue;
      if (String(d[r][KW_.NAME]).trim() !== n) continue;
      sh.deleteRow(r + 1);
      worldBust_(gid);
      return true;
    }
  } catch (e) { }
  return false;
}

// 淘汰政策（純函式，不碰試算表）：每一類超過上限就砍掉「最久沒被提到、提及次數也最少」的，
// 釘選的永不驅逐。d＝整張表(含表頭)，added＝這次還沒落盤的新列；回傳 {'r列索引':1,'a新列序':1}。
// ⚠ 只回答「該砍哪幾列」，由呼叫端一次寫回——別在這裡自己讀表，那就是多一次整表 round-trip。
function worldEvictees_(d, gid, added, curDay) {
  const drop = {};
  const day = parseInt(curDay) || 0;
  const news = Array.isArray(added) ? added : [];
  const _spec = worldSpec_(gid);
  _spec.kinds.forEach(kind => {
    const cap = _spec.cap[kind] || 30;
    const rows = [];
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][KW_.GID]) !== gid || String(d[i][KW_.KIND]) !== kind) continue;
      if (String(d[i][KW_.PIN] || "") === '★') continue;
      // 📍 有根的東西不會被忘掉：掛在某個地方(AT)或是玩家自己開的店(OWN)，
      //    就算很久沒去，回去的時候它也得還在——玩家原話「我的農場、我的雞都應該要在」。
      if (String(d[i][KW_.AT] || "").trim() || String(d[i][KW_.OWN] || "").trim()) continue;
      rows.push({ key: 'r' + i, seen: parseInt(d[i][KW_.SEEN]) || 0, hits: parseInt(d[i][KW_.HITS]) || 0 });
    }
    news.forEach((r, k) => {
      if (String(r[KW_.KIND]) !== kind) return;
      if (String(r[KW_.AT] || "").trim() || String(r[KW_.OWN] || "").trim()) return;
      rows.push({ key: 'a' + k, seen: parseInt(r[KW_.SEEN]) || day, hits: parseInt(r[KW_.HITS]) || 1 });
    });
    if (rows.length <= cap) return;
    rows.sort((a, b) => (a.seen - b.seen) || (a.hits - b.hits));
    rows.slice(0, rows.length - cap).forEach(r => { drop[r.key] = 1; });
  });
  return drop;
}

// 餵回去：帳本會長大，所以【不是全餵】——只挑跟此刻真的有關的，其餘留在表上等被叫到。
// 相關＝①釘選 ②此刻地點提到它 ③在場者名字出現在內容裡 ④玩家這句話提到它 ⑤最近 3 天剛提過。
function worldFeed_(gameId, rows, presentNames, userMsg, curDay) {
  if (!Array.isArray(rows) || !rows.length) return "";
  const spec = worldSpec_(gameId);
  const msg = String(userMsg || "");
  const names = (presentNames || []).map(n => String(n || "").trim()).filter(Boolean);
  const day = parseInt(curDay) || 0;
  // 🗑️ 2026-09 地點退休：①「有根的條目」(at＝長在某地，如農場、雞)整段移除——沒有「此刻在哪」
  //    就沒有「回到那裡」這件事；②【地點】不再被排除在餵回之外。它以前被排掉的理由是
  //    「脈絡由 ★【地點】那行給」，而那行已經不存在了——地點現在就是一條普通的世界設定，
  //    跟人物／設定同級，玩家講到它、它最近被提過，它就回來。
  const rooted = [];
  const scored = rows.map(r => {
    const hay = r.name + '｜' + r.text;
    let sc = 0;
    if (r.pin) sc += 100;
    if (names.some(n => hay.indexOf(n) >= 0)) sc += 30;
    if (msg && (msg.indexOf(r.name) >= 0 || (r.name.length > 1 && hay.indexOf(msg.slice(0, 6)) >= 0))) sc += 50;
    if (day && r.seen >= day - 3) sc += 20;
    sc += Math.min(r.hits, 5);
    return { r: r, sc: sc };
  }).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, spec.feedMax);
  const all = rooted.map(r => ({ r: r })).concat(scored);
  if (!all.length) return "";
  // 名字不在內容裡就補上：「我的農場」這種條目的名字本身就是玩家會叫出口的東西，
  //   只餵內容的話 AI 看到的是「村口那塊地被你圈起來種菜」，講不出那是什麼。
  const line = all.map(x => x.r.kind === '人物'
    ? `${x.r.name}${x.r.sex ? '【性別:' + x.r.sex + '】' : ''}(${x.r.text})`
    : (x.r.name && x.r.text.indexOf(x.r.name) < 0 ? `${x.r.name}(${x.r.text})` : x.r.text)).join('；');
  const folk = all.some(x => x.r.kind === '人物')
    ? '其中標了【性別】的是這座城的常民——他們出現在合理的場合、開口、被寫進場景都可以，只是不追蹤好感與關係。'
    : '';
  return `\n★【${spec.feedTitle}】：${line}。${spec.feedTail}${folk}`;
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
// 英靈殿的 realName 是正式真名，長到 AI 敘事只會挑一段來稱呼 TA，但 world_note 等欄位的比對要求逐字完全相符——會悄悄比對失敗、整條被跳過。所以鑑賞一律用這張日常稱呼表。
// （2026-09 已把真名裡的元資料括號清掉：「（Caster install）」「（征服王）」這種是版本註記/別名，不是名字的一部分。）
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
// 🪞 同一個人不可以同時在場：斯卡哈有 Lancer/Assassin 兩種靈基、伊莉雅有 Master/Caster 兩個版本，
//    顯示名看起來不一樣、真名（或來源種子）卻是同一個人。回 {name, same}：name＝已在場那位的顯示名
//    （空字串＝沒衝突），same=true 代表就是同一筆種子（「已經召喚過了」），false 代表同一個人的另一種姿態。
var KANSHOU_SRC_TAG_ = makeTextTag_('英靈源');
function kanshouSummonClash_(data, gid, hero, heroName) {
  var srcId = String(hero[COL.HERO.ID] || ""), real = String(hero[COL.HERO.NAME] || "").trim();
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[COL.PC.GAME_ID] || "") !== gid || !kanshouIsAlly_(r)) continue;
    var rowName = String(r[COL.PC.NAME] || "");
    var rowSrc = KANSHOU_SRC_TAG_.get(String(r[COL.PC.MEMORY] || ""));
    if (rowSrc && rowSrc === srcId) return { name: rowName, same: true };
    if (rowSrc && real) {
      var other = SEED_SERVANTS.find(function (h) { return h && h.id === rowSrc; });
      if (other && String(other.realName).trim() === real) return { name: rowName, same: false };
    }
    // 🏷️ 舊列沒有【英靈源】戳記，退回跨名比對（候選集含別名橋，兩個方向都查）。
    if (kanshouNameCandidates_(rowName).includes(heroName) || kanshouNameCandidates_(heroName).includes(rowName)) return { name: rowName, same: true };
  }
  return { name: "", same: false };
}
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


// ⏰ 這一回合時鐘怎麼走：結束一天／兩段式就寢／時段跳躍／每回合自然流動，四條路都在這裡。
//    刻意收成一支：它們共用同一組「誰在場、幾點、哪一天、要演哪一句」，散在主流程裡時
//    每一條都要自己防著另外三條已經動過時鐘（kanshouClockMoved_ 就是為此存在的）。
//    ⚠ 會就地改 pcData 那一列與 userData.endDay（兩段式就寢會把這一按改成「不結束」），
//      其餘異動一律從回傳值出去，呼叫端自己接。
function kanshouAdvanceClock_(ctx) {
  const userData = ctx.userData, pcData = ctx.pcData, pcIndex = ctx.pcIndex;
  const myGameId = ctx.myGameId, sameGame = ctx.sameGame, partyMembers = ctx.partyMembers;
  const dirtyPcRows = ctx.dirtyPcRows, _paceHour_ = ctx.paceHour;
  const kanshouNightSceneOn_ = ctx.nightSceneOn;
  let curDay = ctx.curDay, curHour = ctx.curHour, curL = ctx.curL, finalUserMsg = ctx.finalUserMsg;
  const kanshouTimeJumped_ = !!(userData.endDay === true || userData.jumpBand || (parseFloat(userData.advanceHours) || 0) > 0);

  // 結束一天／時段跳躍：忽略玩家打的文字，改用系統組好的合成訊息——複用整條既有敘事管線
  //（在場驗證／規則／intimacy_feedback 全部照常跑），不另開一條平行路徑。
  let intimateNightNames = [];
  let kanshouNarrDay_ = null, kanshouNarrHour_ = null;
  let kanshouClockMoved_ = false; // 結束一天/時段跳躍已自行設時鐘→標記，避免下方每回合流動又加一次
  // 🌙 兩段式就寢·第一段：按下「睡覺」時身邊【有人在】、且還沒進過深夜段落 →【不結束這一天】，
  //    改成把時間推到就寢時刻、進入「夜未眠」。2026-09 好感砍除後判準只剩「人在不在」這個事實。
  let kanshouNightSceneNames_ = [];
  if (userData.endDay === true && !kanshouNightSceneOn_) {
    kanshouNightSceneNames_ = partyMembers.slice();
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
    const allEstablished = pcData.filter((r, idx) => idx !== pcIndex && kanshouIsAlly_(r, myGameId));
    // 🌙 誰留下過夜＝同行的人。那一夜怎麼過是 AI 的事。
    intimateNightNames = partyMembers.slice();
    if (intimateNightNames.length) {
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], intimateNightNames.join('、'));
      // 💞 第一次同床：記在她那一列。
      // 🐛→✅ 2026-09 跨帳號污染：intimateNightNames 是【名字字串】，回頭掃 pcData 時只比名字。
      //    但鑑賞眾生是【全帳號共用一張表】，而大家都從同一座英靈殿召喚——撞名是常態不是巧合。
      //    實測兩個帳號各召一個 SABER，甲按睡覺會把「初次·同床」蓋到乙那一列上（見 crossgame.js）。
      //    上游的 allEstablished 有 sameGame 過濾，但名字一旦離開那個陣列就不帶 game_id 了。
      pcData.forEach((r, idx) => {
        if (idx !== pcIndex && sameGame(r) && intimateNightNames.indexOf(r[COL.PC.NAME]) !== -1) {
          dirtyPcRows.add(idx);
        }
      });
    }
    // 玩家自己不管白天晃到哪，結束一天一律強制拉回自己房間——「玩家永遠有路可退」的安全閥。
    const kanshouMyRoomLoc_ = '我的房間';
    pcData[pcIndex][COL.PC.LOC] = kanshouMyRoomLoc_;
    dirtyPcRows.add(pcIndex);
    // 🩸 肉體狀態也不跨夜：那一欄寫的是【此刻】的身體(腿還在發軟、指尖還在抖)，睡一覺就該回到如常。
    //    AI 沒吐 physical_state 的回合不會覆寫它，不清就會一路跟著人走好幾天。
    kanshouRestBody_(pcData, pcIndex);
    allEstablished.forEach(r => { const _bi = pcData.indexOf(r); kanshouRestBody_(pcData, _bi); if (_bi >= 0) dirtyPcRows.add(_bi); });
    curL = kanshouMyRoomLoc_;
    finalUserMsg = `【一天結束】夜幕降臨，${intimateNightNames.length ? `跟『${intimateNightNames.join('、')}』一起` : ""}回到房間安頓下來，今天到此為止，明天又是新的一天。`;
  } else {
    let advanceHours = Math.max(0, Math.min(parseFloat(userData.advanceHours) || 0, 24 * 365 * 3)); // parseFloat：支援「跳到約定前10分」的小數時數
    // ⏰「跳到下一個時段」：advanceHours 沒指定時才輪到它。
    let jumpBand = null;
    if (!advanceHours && userData.jumpBand) {
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
      const newDate = kanshouAbsDayToDate_(curDay);
      const _jumpSceneBreak = `（★這是時間快轉後的【全新場景·換幕】：直接寫此刻新時段的當下光景，整段從這個新時段的第一秒寫起，上一段的動作與對話都已經過去了。）`;
      finalUserMsg = (jumpBand
          ? `【時間推進】時間悄悄流轉到了${jumpBand.label}，此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${kanshouFmtHM_(curHour)}・${timeBand_(curHour)}。`
          : `【時間推進】${advanceHours}個小時悄悄過去，此刻是${newDate.year}年${newDate.month}月${newDate.day}日・${kanshouFmtHM_(curHour)}・${timeBand_(curHour)}。`) + _jumpSceneBreak;
    }
  }
  // ⏰ 時間隨動作流動：一般 AI 敘事回合(非結束一天/非時段跳躍)每次推進 kanshouHourPerAction_(memory) 小時(玩家自選流速)，讓聊天/移動等按鍵都會讓時鐘往前走，消除「到處跑卻永遠6點」的凍結感。
  if (!kanshouClockMoved_ && curHour < KANSHOU_DAY_LAST_HOUR_ && _paceHour_ > 0) {
    curHour = Math.min(KANSHOU_DAY_LAST_HOUR_, curHour + _paceHour_);
    pcData[pcIndex][COL.PC.HOUR] = curHour;
    dirtyPcRows.add(pcIndex);
  }
  return {
    curDay: curDay, curHour: curHour, curL: curL, finalUserMsg: finalUserMsg,
    timeJumped: kanshouTimeJumped_, clockMoved: kanshouClockMoved_,
    narrDay: kanshouNarrDay_, narrHour: kanshouNarrHour_,
    intimateNightNames: intimateNightNames, nightSceneNames: kanshouNightSceneNames_
  };
}

// 💬 專屬稱呼 → 卡片上那一小段（沒有稱呼就整段不印）。2026-09 從 actionPlay_ 內部提到檔案層，
//    因為在場人物卡拆成 kanshouPartyCards_ 之後它變成跨函式共用。
function relMemMemoryStr_(relMem) {
  const nickMatch = String(relMem || "").match(/\[專屬稱呼\](.*?)(?=\| \[|$)/);
  const nickTrim = nickMatch ? nickMatch[1].trim() : "";
  return (nickTrim && nickTrim !== "無") ? ` [專屬稱呼:${nickTrim}]` : "";
}
// 🪪 在場人物卡：把同行的每一位壓成一句自然語言（沒有欄位名——卡片是 AI 拿來變成那個人的依據，
//    遞一張資料庫欄位過去，回來的就是資料庫腔調）。聚光燈、在場來由抽抬頭、六格人設都在這裡。
//    回 { text, spotlight }：text 直接進提示詞，spotlight 供呼叫端判斷這一步點名了誰。
function kanshouPartyCards_(ctx) {
  const pcData = ctx.pcData, pcId = ctx.pcId, myGameId = ctx.myGameId, userMsg = ctx.userMsg;
  const partyMembers = ctx.partyMembers;
  const kanshouTimeJumped_ = ctx.timeJumped, formatPref = ctx.formatPref, formatTrait = ctx.formatTrait;
  let stableArr = [], liveArr = [];
  const _presenceSeen_ = {};
  // 🗑️ 2026-09 聚光燈（沒被點名的人只送精簡卡）退休：六格人設搬進 system 吃快取之後，
  //    system 必須每回合【逐字相同】，沒辦法再依這一步點名了誰逐回合修剪。
  //    而且它反而更便宜——全給是 0.25 倍計費，修剪過的短卡是 1.0 倍。
  partyMembers.forEach(pName => {
    const r = pcData.find(row => String(row[COL.PC.NAME]).trim() === String(pName).trim() && kanshouIsAlly_(row, myGameId));
    if (r) {
      const pOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👕 換裝：當前服裝穿著(換衣不換人；玩家UI設定或AI依appearance_extras更新)
      // 鑑賞無戰鬥，HP/STATUS 恆定不變(已被 physical_state 取代)，不重複注入。
      const pMemStr = relMemMemoryStr_(r[COL.PC.REL_MEM]);
      // 怪癖/行為準則：召喚時已存進 MEMORY 的【小動作】【準則】標記，直接讀列。
      const pLogic = getPersonaLogic_(r[COL.PC.MEMORY]);
      // 🏷️ 關係稱呼：只有【玩家自己設過】的才送給 AI（＝上了【關係鎖】那格）。
      //    AI 自己寫的仍然存著給面板顯示，但送回去就變成它讀自己上回合寫的字、然後決定要不要改
      //    自己寫的字——自我鎖死的形容詞標籤，2026-07 的「態度」欄就是為此砍掉的。沒有值就整段不印。
      const pRelTagStr = kanshouRelLocked_(r[COL.PC.REL_MEM], 'tag') ? String(r[COL.PC.REL_TAG] || "").trim() : "";
      // 地點的「當下在做什麼」輕量引子(見上方KANSHOU_LOCATION_ACTIVITY_)，沒對照到的地點不加這句，AI自然發揮即可。
      // 🗑️ 2026-09「她在這個地點正在做什麼」的寫死變體池(KANSHOU_LOCATION_ACTIVITY_)已移除——
      //    那是 14 個地點各寫兩句的預寫橋段，同一個人同一地永遠那兩句。她此刻在做什麼，AI 依
      //    地點/時段/天氣/她的個性自己決定就好，這裡不再給答案。
      const pBackStr = (() => {
        const _b = String(r[COL.PC.BACK] || "").trim();
        if (!_b || _b === `${String(r[COL.PC.RANK] || "")}・${pName}` || /職階英靈$/.test(_b) || QUAD_EMPTY_.indexOf(_b) !== -1) return "";
        return `${_b}。`;
      })();
      const pMemoirRaw = String(r[COL.PC.MEMOIR] || "").trim();
      // ★是玩家釘選標記(面板用)，餵AI時去掉、不外洩機制符號。
      // 📝 你在對方眼中是什麼樣子：熟悉段(GAS 依相處次數算)＋對方這一路親自記下的幾條。
      const _pKnown = kanshouKnownOfYou_(r[COL.PC.MEMORY]);
      const pKnownStr = `${_pKnown.say}${_pKnown.noted.length ? `，${pron_(r[COL.PC.SEX])}注意到我${_pKnown.noted.join('、')}` : ''}。`;
      const pMemoirStr = pMemoirRaw ? `我們一起走過：${pMemoirRaw.replace(/★/g, '').replace(/｜/g, '；')}。` : "";
      // 明講方向的「她/他是你的${tag}」(而非單純「關係:${tag}」)，避免AI誤讀方向、演反成玩家服侍對方。
      // 🫂 在場來由只剩【時間跳過之後】這一種——地點退休後「剛走到」不再是一件會發生的事。
      //    一般回合不講在場來由（玩家「你們從剛才就一直在這裡<< 這不用了吧?」）：
      //    上一輪的敘事就在 chatHistory 裡、人也還在卡上，那句話沒有新資訊。
      const pPresenceStr = kanshouTimeJumped_
        ? "時間流轉之後，【依然在你身邊】(這段空白裡各自做了什麼，順著時段自然帶過)" : "";
      _presenceSeen_[pPresenceStr] = (_presenceSeen_[pPresenceStr] || 0) + 1;
      // 🧊 這個人【是誰】——整局不會變，所以它進 system 吃提示詞快取。
      const _pPref = formatPref(r[COL.PC.PREF]), _pTrait = formatTrait(r[COL.PC.TRAIT]);
      stableArr.push(`【在場人物】${pName}（${String(r[COL.PC.SEX] || "").trim() || "異"}）。${_pPref ? `${_pPref}。` : ""}${_pTrait ? `${_pTrait}。` : ""}${pLogic ? `${pLogic}。` : ""}${pBackStr}`);
      // 🔀 這個人【此刻】的樣子——每回合都可能動，留在 user。
      const _live = `__PRESENCE__${pPresenceStr}__/PRESENCE__${pOutfit ? `穿著${pOutfit}。` : ""}${pMemoirStr}${pKnownStr}${pRelTagStr ? `${pron_(r[COL.PC.SEX])}是我的「${pRelTagStr}」。` : ""}${pMemStr}`;
      liveArr.push(`${pName}：${_live}`);
    }
  });
  // 🧊 不變那半：進 system。順序＝同行名單的順序（加人是 append 到尾巴，所以加人不會動到
  //    前面幾張卡的前綴，快取照樣命中；只有移除中間某位才會從那個點斷掉）。
  const PROMPT_PARTY_STABLE = stableArr.length > 0
    ? `【在我身邊的人】(以下是他們是誰)：\n${stableArr.join("\n")}`
    : "";
  // 在場來由人人相同時（多數回合都是），抽成抬頭講一次，不在每張卡上逐字重複。
  const _presenceKeys_ = Object.keys(_presenceSeen_);
  const _presenceShared_ = (_presenceKeys_.length === 1 && liveArr.length > 1) ? _presenceKeys_[0] : "";
  const _liveCards_ = liveArr.map(t => _presenceShared_
    ? t.replace(/__PRESENCE__[\s\S]*?__\/PRESENCE__/, "")
    : t.replace(/__PRESENCE__([\s\S]*?)__\/PRESENCE__/, "$1"));
  // 🗑️ 2026-09 地點退休後「同行中 vs 本來就在這裡」這個區分整個消失了——在場就是同行，
  //    那兩句話（原本是為了回答玩家「現在沒有同行人／目前地點有誰誰誰」）現在只是把
  //    同一份名單用兩種講法再講一次。卡片本身就帶著名字，不必另起一行點名。
  const PROMPT_PARTY_LIVE = liveArr.length > 0
    ? `【他們此刻】：${_presenceShared_ ? `\n${_presenceShared_}` : ""}\n${_liveCards_.join("\n")}`
    : "現在沒有人跟你同行，你是一個人。";

  return { stable: PROMPT_PARTY_STABLE, live: PROMPT_PARTY_LIVE };
}

// 📝 AI 回報的當下狀態落盤：玩家與每位在場者的 神色／穿著配飾／專屬稱呼／關係稱呼／
//    共同回憶／她眼中的你。全部就地改 pcData 並把動到的列記進 dirtyPcRows，不自己寫表。
//    ⚠ 這裡是 AI 唯一能改「人的狀態」的管道，所以敷衍用語過濾與長度裁切都擋在這一層。
function kanshouApplyIntimacyFeedback_(ctx) {
  const aiData = ctx.aiData, pcData = ctx.pcData, pcIndex = ctx.pcIndex;
  const myGameId = ctx.myGameId, dirtyPcRows = ctx.dirtyPcRows;
  const presentIds = ctx.presentIds || [], pcName = ctx.pcName;
  if (!aiData.intimacy_feedback) return;

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

    // 💞 共同回憶 與 📝 她眼中的你 共用同一支 append/去重/上限引擎（見 kanshouAppendUnique_）。
    const processMemoir_ = (oldMemoir, newLine, maxCount) =>
      kanshouAppendUnique_(oldMemoir, newLine, { sep: '｜', cap: maxCount, maxLen: 40, pin: true });

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
        const targetIdx = pcData.findIndex(r => kanshouNameCandidates_(r[COL.PC.NAME]).includes(tName) && kanshouIsAlly_(r, myGameId));
        if (targetIdx === -1) return;
        // 🔒 只寫得進【這一幕真的在場】的人。地點退休前這裡比的是 LOC，現在比在場名單——
        //    擋的是同一件事：AI 提到一個不在場的人，不該把她的狀態/回憶一起改掉。
        if (presentIds.indexOf(String(pcData[targetIdx][COL.PC.ID])) < 0) return;

        dirtyPcRows.add(targetIdx);
        const nCleanState = sanitizePhysicalState(nfb.physical_state);
        if (nCleanState) pcData[targetIdx][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[targetIdx][COL.PC.PHYSICAL], nCleanState);
        const nAppearanceExtras = sanitizeAppearanceExtras(nfb.appearance_extras);
        if (nAppearanceExtras) pcData[targetIdx][COL.PC.MEMORY] = setOutfit_(pcData[targetIdx][COL.PC.MEMORY], nAppearanceExtras);

        // 羈絆記憶已併入該 NPC 自己列的 REL_MEM 欄，現在放專屬稱呼與兩把鎖。
        let oldRMem = pcData[targetIdx][COL.PC.REL_MEM] || "";
        const _locks = { nick: kanshouRelLocked_(oldRMem, 'nick'), tag: kanshouRelLocked_(oldRMem, 'tag') };
        // 🔒 AI 給的稱呼一律先過 sanitizeNickname_(逐項消毒＋限長)——見該函式說明：這格能偽造欄位。
        const _nickValue = _locks.nick
          ? (getNickname_(oldRMem) || "無")
          : processTags(oldRMem, /\[專屬稱呼\](.*?)(?=\| \[|$)/,
            String(nfb.mutual_nicknames || "").split('、').map(sanitizeNickname_).filter(Boolean).join('、'), 3);
        // 🗑 2026-07 態度不再落地（見 relMemMemoryStr_ 的說明：它是會自我鎖死的形容詞標籤）。
        pcData[targetIdx][COL.PC.REL_MEM] = kanshouRelMemBuild_(_nickValue, _locks);

        // 🏷️ 關係稱呼：AI 讀過你們每一回合，比一個數字更知道你們現在是什麼，所以由它寫。
        //    ⚠ 寫進來的值【只給面板看、不送回提示詞】(見 kanshouPartyCards_ 的 pRelTagStr)——
        //    送回去它就變成 AI 讀自己上回合寫的字，那是自我鎖死的形狀。玩家自己打過一次就鎖住，
        //    從此歸玩家，而玩家設的那格【會】送給 AI(玩家的意志是輸入，AI 的輸出不該變成自己的輸入)。
        if (!_locks.tag) {
          const _aiTag = sanitizeNickname_(nfb.rel_tag);
          if (_aiTag && _aiTag !== "無") pcData[targetIdx][COL.PC.REL_TAG] = _aiTag;
        }

        // 💞 共同回憶：AI 這回合若吐了里程碑 memory，append 進她自己列的 27 欄(最近 10 條、去重)。
        if (nfb.memory && String(nfb.memory).trim() && String(nfb.memory).trim() !== "無") {
          pcData[targetIdx][COL.PC.MEMOIR] = processMemoir_(pcData[targetIdx][COL.PC.MEMOIR], nfb.memory, KANSHOU_MEMOIR_CAP_);
        }

        // 📝 她眼中的你：AI 這回合若真的從玩家身上看出一件事，記進【她自己那列】的【眼中的你】。
        //    存在她列上(不是玩家列)是關鍵——每個人各記各的，所以同一個玩家在不同人眼中確實會不一樣。
        if (nfb.noticed && String(nfb.noticed).trim() && String(nfb.noticed).trim() !== "無") {
          pcData[targetIdx][COL.PC.MEMORY] = KANSHOU_NOTED_TAG_.set(
            pcData[targetIdx][COL.PC.MEMORY],
            kanshouAppendUnique_(KANSHOU_NOTED_TAG_.get(pcData[targetIdx][COL.PC.MEMORY]), stripStanding_(nfb.noticed),
              { sep: KANSHOU_NOTED_SEP_, cap: KANSHOU_NOTED_CAP_, maxLen: KANSHOU_NOTED_LEN_ }));
        }
      });
    }
    }

function actionPlay_(userData, pcId, sheets) {
  const userMsg = String(userData.message || "").replace(/[｜【】]/g, ""); // 📅 endDay 呼叫不一定會帶 message，防呆避免下方 .includes 炸掉

  if (String(pcId || "").indexOf("KPC_") !== 0) return JSON.stringify({ text: "此功能僅限鑑賞使用。", people: [] });
  // 🔥 點火：這一回合用哪一顆模型（平常便宜的那顆／按了就換敢寫的那顆）。
  const driveOn = (userData.drive === true || String(userData.drive) === "true");

  // 🎯 2026-09 喜歡/討厭回到卡上：2026-07 砍掉是因為那兩格只是被列出來、AI 不知道要拿它們幹嘛。
  //    ⚠ 2026-09：當年替它們平反的那條鐵律（「喜歡與討厭是這個人的開關，話題碰到就給出明顯的情緒」）
  //      已經在演法指令大砍那一批裡一起砍掉了，全樹只剩這行註解提過它。留著這兩格的理由改成：
  //      卡上現在是「喜歡X，討厭Y」一句完整的話（2026-07 被砍時是四個裸詞組），模型不需要人教它
  //      「喜歡」是什麼意思。哪天又覺得這兩格沒在做事，先看這裡、別再翻找那條不存在的鐵律。
  const _qv = (v) => { const t = String(v || "").trim(); return QUAD_EMPTY_.indexOf(t) < 0 ? t : ""; };
  // 🗣️ 2026-09 玩家「有需要這麼生硬嗎？」：[表象]/[內裡]/[外貌氣質] 那幾個方括號是【我們自己的分欄符號】，
  //    不是資料。模型讀「表面…骨子裡…」一樣懂，而卡片是它用來【變成那個人】的依據——
  //    遞一張資料庫欄位過去，回來的就是資料庫腔調。字數幾乎沒變，只換講法。
  const formatPref = (str) => {
    const a = String(str || "").split('、');
    // ⚠ 別在這裡加「表面／骨子裡」「社交面具／內在核心」那種標籤：①「表面/面具」語意是【裝出來的】，
    //    但 SABER 是真的一絲不苟，那個詞會把她演成在演戲；②第二格自己就帶著轉折；
    //    ③套上去會壞掉——「個性完美的優等生」「表面大姊頭般罩著大家」都不成話。
    //    喜歡/討厭則反過來：那兩個詞是中文本來就有的講法，不是欄位名，貼上去讀起來仍是一句話。
    const like = _qv(a[2]).replace(QUAD_REDUNDANT_['喜歡'], "").trim();
    const hate = _qv(a[3]).replace(QUAD_REDUNDANT_['討厭'], "").trim();
    const core = [_qv(a[0]), _qv(a[1])].filter(Boolean).join('，');
    const sw = [like ? `喜歡${like}` : "", hate ? `討厭${hate}` : ""].filter(Boolean).join('，');
    return [core, sw].filter(Boolean).join('。');
  };

  const formatTrait = (str) => {
    const a = traitParts_(str);
    return [_qv(a[0]), _qv(a[1])].filter(Boolean).join('，');
  };


  let pcData = sheets.pc.getDataRange().getValues();

  const pcIndex = kanshouPcIdx_(pcData, pcId);
  if (pcIndex === -1) return JSON.stringify({ text: "查無此人", people: [] });
  const pc = pcData[pcIndex];
  const pcName = pc[COL.PC.NAME];
  let curL = pc[COL.PC.LOC];
  let curDay = parseInt(pc[COL.PC.DAY]) || 1;
  let curHour = (pc[COL.PC.HOUR] === "" || pc[COL.PC.HOUR] == null) ? 8 : (parseFloat(pc[COL.PC.HOUR]) || 0);

  const _myGid_ = pc && pc[COL.PC.GAME_ID] ? String(pc[COL.PC.GAME_ID]) : "";
  const _paceHour_ = kanshouHourPerAction_(); // ⏰ 每回合推進幾小時
  // 🆕 玩家自己指定一個新地方(前端「去別的地方…」自由輸入)：查不到就當場把它加進這一局的世界，
  //    走過去，並讓 AI 第一次描述它是什麼樣的地方。世界從此多一格，之後可以再回來、可以約在那裡。
  // 🗑️ 2026-09 地點整組退休，移動這件事不再存在，所以只剩玩家自己打的那句話。
  let finalUserMsg = `【玩家原話】：${userMsg}`;

  const dirtyPcRows = new Set();
  dirtyPcRows.add(pcIndex); // 玩家本人一定會被處理到，先加進去
  let _pendingNewPcRow_ = null;

  // 玩家自己的換裝(玩家UI設定或AI依appearance_extras更新)，比照【同行夥伴】卡片(partyDetailsArr)
  const myOutfit = getOutfit_(pc[COL.PC.MEMORY]);
  // 晨間餘韻：讀一次(上一回合結束一天留下的旗標，若有)就立刻清掉，只讓「緊接著的下一回合」
  const morningAfterNames = KANSHOU_MORNING_AFTER_TAG_.get(pc[COL.PC.MEMORY]);
  if (morningAfterNames) pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');
  // 🗑️ 夜未眠的出口②（玩家走出這個房間）隨地點一起退休——沒有移動這回事了。
  //    ①再按一次🌙（真的睡、清標記）與 ③換日自然失效 兩條出口照舊。
  // 🌙 夜未眠：這一刻是否已在「深夜獨處」段落中(見 KANSHOU_NIGHT_SCENE_TAG_)。
  const kanshouNightSceneOn_ = KANSHOU_NIGHT_SCENE_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]) === curDay;

  // 實例化：只取自己 game_id 世界內、同地點的人（御主無 game_id 時不過濾，相容舊角色）
  const myGameId = pc && pc[COL.PC.GAME_ID] ? String(pc[COL.PC.GAME_ID]) : "";
  const sameGame = (r) => !myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId;

  // 🫂 同行名單＝這一回合「誰在你身邊」的唯一真實來源：時間推進、在場卡、過夜全都讀它。
  //    第一次沒有標記時把此刻同場的人收進來（上限內），同行制上線那一刻人不會憑空消失。
  //    判準是「寫過沒有」而不是「值空不空」——玩家自己按清空是空值，不會被重新種回去。
  if (!KANSHOU_PARTY_TAG_.has(pc[COL.PC.MEMORY])) {
    const _seedIds = pcData.filter(r => r !== pc && kanshouIsAlly_(r, myGameId)
      && String(r[COL.PC.LOC] || "").trim() === String(curL || "").trim())
      .slice(0, KANSHOU_PARTY_MAX_).map(r => String(r[COL.PC.ID]));
    pcData[pcIndex][COL.PC.MEMORY] = kanshouSetParty_(pc[COL.PC.MEMORY], _seedIds);
    dirtyPcRows.add(pcIndex);
  }
  const partyRows = kanshouGetParty_(pc[COL.PC.MEMORY])
    .map(id => pcData.find(r => r !== pc && kanshouIsAlly_(r, myGameId) && String(r[COL.PC.ID]) === id))
    .filter(Boolean).slice(0, KANSHOU_PARTY_MAX_);
  const partyMembers = partyRows.map(r => String(r[COL.PC.NAME]));

  // ⏰ 時鐘：結束一天／兩段式就寢／時段跳躍／每回合流動四條路，全在 kanshouAdvanceClock_ 裡。
  const _clk_ = kanshouAdvanceClock_({
    userData: userData, pcData: pcData, pcIndex: pcIndex, myGameId: myGameId, sameGame: sameGame,
    partyMembers: partyMembers, dirtyPcRows: dirtyPcRows, paceHour: _paceHour_,
    nightSceneOn: kanshouNightSceneOn_, curDay: curDay, curHour: curHour, curL: curL, finalUserMsg: finalUserMsg
  });
  curDay = _clk_.curDay; curHour = _clk_.curHour; curL = _clk_.curL; finalUserMsg = _clk_.finalUserMsg;
  const kanshouTimeJumped_ = _clk_.timeJumped;
  const intimateNightNames = _clk_.intimateNightNames;
  const kanshouNightSceneNames_ = _clk_.nightSceneNames;

  // 供下方🕰️提示詞用，只算一次不重複呼叫。★讀敘事時鐘而非狀態時鐘——兩者只有 endDay 會不同。
  const _narrDay_ = (_clk_.narrDay === null) ? curDay : _clk_.narrDay;
  const _narrHour_ = (_clk_.narrHour === null) ? curHour : _clk_.narrHour;
  const curDateObj_ = kanshouAbsDayToDate_(_narrDay_);

  // 🗑️ 2026-09 地點整組退休：這裡原本負責寫 LOC、把泡泡點名的人搬過去、再把同行者的 LOC
  //    同步成玩家的。玩家原話：「只要扯到移動都會很怪」「地點就是可以一個亂掰的背景」。
  //    ⚠ COL.PC.LOC 欄【不刪】——solo 還在用它一百多處，鑑賞這一軌單純不再讀寫（CLAUDE.md：
  //    COL 是位置索引，寧棄用不刪欄）。

  // 🫂 在場＝【同行的人】。2026-09 地點整組退休（玩家：「只要扯到移動都會很怪」「地點就是
  //    可以一個亂掰的背景」），於是「誰在這一幕」就只剩同行清單說得出來——你帶著誰，誰就在。
  //    ⚠ 這是 2026-09 稍早那一刀（在場改成同地點）的回退，但前提換了：那次是為了解決
  //    「全部人在客廳但只有大河跟我說話」，而那個錯亂的來源正是【系統在記位置】這件事本身。
  //    ⚠ 沒有另設在場上限：同行上限（KANSHOU_PARTY_MAX_）就是上限，少一個要維護的數字。
  //    路人可自由描寫增添生活感，但不具名、不能被指名互動；能被指名、會被記錄的只有這份名單。
  const presentRows = partyRows;
  const presentMembers = presentRows.map(r => String(r[COL.PC.NAME]));


  // 🗑️ 2026-09 地點整組退休：★【這座城裡有哪些地方】（地圖）與 ★【這座城裡還有誰】（誰在哪）
  //    兩段一起砍。後者本來就是地點系統的補丁——它要回答的「她此刻在哪」，在沒有位置
  //    這個概念之後不存在了。
  presentRows.forEach(r => {
    const _ri = pcData.indexOf(r);
    if (_ri < 0) return;
    // 🤝 相處計數 +1：這裡本來就是「對每位在場者逐一處理」的迴圈，每回合只跑一次，天然冪等，不必另外記日戳。
    if (!kanshouTimeJumped_) {
      pcData[_ri][COL.PC.MEMORY] = KANSHOU_MET_COUNT_TAG_.set(
        pcData[_ri][COL.PC.MEMORY], KANSHOU_MET_COUNT_TAG_.get(r[COL.PC.MEMORY]) + 1);
      dirtyPcRows.add(_ri);
    }
  });
  // 🌅 兩條「昨夜」線都必須依【這回合她到底在不在場】過濾(2026-07 玩家「如果我直接移動呢....」)：旗標在回合開頭就讀掉了，但那時還不知道玩家這回合要去哪。
  const _morningHere_ = String(morningAfterNames || "").split('、').map(n => n.trim())
    .filter(n => n && presentMembers.indexOf(n) !== -1).join('、');
  // 🌙 深夜獨處(夜未眠)：只給「此刻是什麼場合」這個事實，怎麼發展全看玩家推進與她的個性。
  const kanshouNightSceneStr = (kanshouNightSceneOn_ || kanshouNightSceneNames_.length)
    ? `\n★【夜已深·門關上了】：這個房間此刻只剩你和『${(kanshouNightSceneNames_.length ? kanshouNightSceneNames_ : presentMembers).join('、')}』，外頭安靜下來，今晚不會再有別人進來，時間也不急著走。★這一段【還沒有結束】：這一夜什麼時候收，由玩家自己決定、系統會宣告；本回合只演此刻正在發生的這 ${KANSHOU_MIN_PER_TURN_} 分鐘，結尾一樣停在進行式、把下一步交還玩家。`
    : "";

  // 🪪 在場人物卡（聚光燈／在場來由／六格人設）：見 kanshouPartyCards_。
  const _cards_ = kanshouPartyCards_({
    pcData: pcData, pcId: pcId, myGameId: myGameId, userMsg: userMsg, partyMembers: presentMembers,
    timeJumped: kanshouTimeJumped_, formatPref: formatPref, formatTrait: formatTrait
  });
  const PROMPT_PARTY_LIVE = _cards_.live;   // 此刻的樣子留在 user；「他們是誰」進 system 吃快取

  // 路人與缺席者是同一件事的兩面（誰只是背景／誰不在場），合成一條；能開口的名單在結尾講。

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
    // 🚻 講【身體本身】、兩邊一樣。舊寫法「做得到的是手指、舌頭與器物」讀起來像建議清單，
    //    模型照樣自己長出一根來（玩家：「但是我也是女的欸！！！我拿什麼頂她阿」）。
    //    ⚠ 中間版本寫過「兩腿之間沒有陰莖」，玩家當場擋下：「說不定他看到陰莖又只記得這個詞了」。
    //      那個寫法鑽過了 check_prompt 的黑名單（「沒有」不在表上），卻違反它的精神——
    //      CLAUDE.md 玩家原話「說越多它會越想歪」。點名不要的東西＝把它塞進模型腦裡。
    genderHintStr = sameSexF.length
      ? `\n★【身體】：我跟${sameSexF.join("、")}都是女性的身體，彼此一樣。要進入對方，靠的是手指、舌頭，或找得到的器物。`
      : "";
  }

  const _mePron_ = pron_(pc[COL.PC.SEX]);   // 御主性別是資料(可隨時切換)，代名詞不可寫死
  // 🗑️ 2026-09 玩家卡的 怪癖／行為準則整組不再送（玩家實測：「髮尾戳臉頰」四段都演、
  //    logic 整句被逐字唸了三次）。那兩格是【第二人稱時代】加的——當時 AI 演得出同伴、
  //    演不出「你」；現在旁白是第一人稱、玩家自己打字決定做什麼，這兩格已經沒有工作了。

  // 🛡️ 比照Core_Settings.gs讀同一欄位(mergePhysicalStatus/parseVisibleStatus)的try/catch防呆——PHYSICAL理論上只會被JSON.stringify寫入，但COL是位置索引，欄位一旦錯位/被手動改壞，這裡若沒擋，該角色從此每回合都會拋錯、永遠好不了(見CLAUDE.md「邊界先擋」)。
  let pPhysicalObj = {}; try { pPhysicalObj = JSON.parse(pcData[pcIndex][COL.PC.PHYSICAL] || "{}"); } catch (e) { }
  if (Object.keys(pPhysicalObj).length === 0) pPhysicalObj = { "狀態": "如常" };
  const _isPlainBody_ = o => Object.keys(o).length === 1 && o["狀態"] === "如常"; // 預設值＝沒事，不必送
  // 🧵 餵回去的是【一句話】不是 JSON——原樣遞一個物件過去，回來的就是資料庫腔調。
  const _bodyLine_ = o => Object.keys(o).map(k => String(o[k])).filter(Boolean).join('、');
  let nsfwMemories = `${_isPlainBody_(pPhysicalObj) ? "" : `\n我此刻身上：${_bodyLine_(pPhysicalObj)}。`}`;

  // ⚡ 提速：跟上面 presentRowsForGender 是完全相同的 filter 條件，直接複用，省掉第二次整表掃描。
  let allPresentRows = presentRowsForGender;
  allPresentRows.forEach(r => {
    let npcPhysicalObj = {}; try { npcPhysicalObj = JSON.parse(r[COL.PC.PHYSICAL] || "{}"); } catch (e) { }
    if (Object.keys(npcPhysicalObj).length === 0) npcPhysicalObj = { "狀態": "如常" };
    // 👕 裝扮已由【在場人物】那一行帶（同一個值不送兩次）；REL_MEM 的【專屬稱呼】同理走 pMemStr。
    if (!_isPlainBody_(npcPhysicalObj)) nsfwMemories += `\n${r[COL.PC.NAME]}此刻身上：${_bodyLine_(npcPhysicalObj)}。`;
  });



  // 📏 篇幅（auto 檔）：2026-09 好感砍除後不再有「關係越深寫越長」這條，就一組數字。
  //    ⚠ 一律給【下限~上限】而不是「約 X 字」：小模型對「約」一律往下取，實測過(見 KANSHOU_REFERENCE)。
  //    ⚠ 上限必須跟 max_tokens 一起看：JSON 固定開銷典型 757 字、欄位全滿 1057 字，narration 超出去就會被截斷成壞 JSON。
  const KANSHOU_WORDS_ = { range: '400~520', big: '600~750' };
  // 「大事」不靠猜——這些區塊本回合有沒有組出字串，GAS 自己最清楚。加新橋段就往這串加一個旗標。
  const _kanshouBigBeat_ = !!kanshouNightSceneStr;
  const _kanshouWordRow_ = KANSHOU_WORDS_;
  // 🎨 玩家版說書人風格（缺列＝預設，預設＝原本寫死的那句）。讀口排在篇幅之前——篇幅檔位要吃它。
  const _styles_ = kanshouStyleRead_(_myGid_);
  // 玩家在「⚙ 說書人設定」選了檔位就蓋掉上面那張自動表；auto 維持原本依好感/大事的行為。
  const _lenTier_ = kanshouLenTier_((_styles_['lenTier'] || {}).text);
  const _kanshouTargetWords_ = _lenTier_.words || (_kanshouBigBeat_ ? _kanshouWordRow_.big : _kanshouWordRow_.range);
  // 🕊️ 「隨意」＝這一行整個不送：有數字在那裡，平淡的一幕也會被湊到那個數字。
  const _lenLine_ = _lenTier_.free ? '' : null;

  // 🧊 身體這兩塊【刻意壓在最後面】：★【身體】原本在 user 第 5 行、離結尾 18 行，
  //    正好落在上面排序原則量出來的死角（事實寫在 20 行以前會被當成沒發生），
  //    實測後果是玩家明明是女性身體，敘事照樣讓她「挺腰撞進去」。
  //    身體狀態(nsfwMemories)同理——它每回合都在變，照排序原則本來就該在後面。
  const PROMPT_BODY = `${nsfwMemories}${genderHintStr}`;

  // 有【專屬稱呼】就用暱稱取代真名；JSON 姓名欄不受影響、仍填真名。


  const _histWindow_ = KANSHOU_HIST_WINDOW_;
  // 🌍 世界帳本：讀出這一局玩出來的地方/人/設定，只餵跟此刻真的有關的那幾條(見 worldFeed_)。
  const _worldRows_ = worldRead_(myGameId);
  const _worldFeed_ = worldFeed_(myGameId, _worldRows_, presentMembers, userMsg, curDay);


  // 🧊 排序原則：【穩定的放前面、每回合會變的放後面】——prompt cache 是逐 token 比對前綴，
  //    一個會變的東西插在中間，它後面全部作廢。天氣/時間原本卡在第 5 行，把整份 user prompt
  //    的可快取前綴砍到只剩 48%。唯二的例外是 🚨【收尾】與★【在場名單】：它們雖然穩定，但
  //    recency 對它們特別重要（實測過「事實寫在 20 行以前就會被 AI 當成沒發生」），故仍壓在最後。
  const _styleVars_ = { '玩家': pcName, '代名詞': _mePron_, '篇幅': _kanshouTargetWords_ };
  const _sty_ = k => kanshouStyle_(_styles_, k, _styleVars_);
  const prompt = `${_sty_('world')}
★【誰在場】：有【專屬稱呼】就叫暱稱。其餘路人不具名。
★【world_note】：這一步新出現的地方/人/規矩寫進去才會留下，最多 ${WORLD_SPEC_.kanshou.writeMax} 筆。

【我自己】(只給旁白寫「我」的內心用，在場的人沒讀過這張)：${pcName}，${pc[COL.PC.SEX]}，在場的人當面叫我是「${pronYou_(pc[COL.PC.SEX])}」。${(() => { const _p = formatPref(pc[COL.PC.PREF]); return _p ? `${_p}。` : ""; })()}${(() => { const _t = formatTrait(pc[COL.PC.TRAIT]); return _t ? `${_t}。` : ""; })()}${myOutfit ? `穿著${myOutfit}。` : ""}${pc[COL.PC.BACK] || "剛搬來冬木市"}。
${PROMPT_PARTY_LIVE}
${_lenLine_ === '' ? '' : _sty_('length')}
${_worldFeed_}${kanshouNightSceneStr}
★【此刻】${curDateObj_.year}年${curDateObj_.month}月${curDateObj_.day}日・${kanshouFmtHM_(_narrHour_)}・${timeBand_(_narrHour_)}（這幾個數字是給你判斷光線、氣溫與街上的人在做什麼用的）。這一幕就寫這 ${KANSHOU_MIN_PER_TURN_} 分鐘。${intimateNightNames.length ? `\n★【今晚留下的人】：『${intimateNightNames.join('、')}』今晚跟我一起過夜——這一夜怎麼過，依各人的個性與你們之間的歷史決定。` : ""}${_morningHere_ ? `\n★【晨間餘韻·非強制】：昨夜與『${_morningHere_}』或許共度親密(依上回合實際內容·沒跨出就當平常早晨)·可自然帶晨間溫馨曖昧·不強制不複述細節。` : ""}

${presentMembers.length ? '' : '★【在場】：這個地方只有我一個人（常民與路人照常可以出現）。'}

${PROMPT_BODY}

接著往下演，玩家這一步是：『${finalUserMsg}』`.replace(/\n{3,}/g, '\n\n');

  try {
    // 🔥 點火＝模型開關（2026-09 玩家定案）：平常走便宜的 KANSHOU_MODEL，按了才換敢寫的那顆。
    //    ⚠ 這顆 🔥 跟 2026-09 稍早砍掉的那顆【不是同一件事】：那顆是尺度/推進幅度的開關，
    //      它最後只剩一句指向已經不存在的機制；這顆只管用哪個模型，尺度一律「跟著玩家走」。
    const _timeJump = kanshouTimeJumped_;
    let aiConfig = { temperature: 1.08, top_p: 0.97, top_k: 60, repetition_penalty: 1.12, presence_penalty: 0.25, frequency_penalty: 0.25, retries: 1, model: driveOn ? LEWD_MODEL : KANSHOU_MODEL, isNsfwMode: driveOn, sessionId: 'k_' + myGameId, max_tokens: (_timeJump && presentRows.length === 0) ? 700 : (_lenTier_.tokens || 2400) };

    // 抓取近 6 筆原始歷史(3輪)，轉換為 API 格式。
    const recentHistoryRaw = getGameHistoryBatchRaw(pcId, _histWindow_);
    if (recentHistoryRaw && recentHistoryRaw.length > 0) {
      aiConfig.chatHistory = recentHistoryRaw.map(msg => ({
        role: msg.speaker === "player" ? "user" : "assistant",
        content: String(msg.content)
      }));
    }

    const _sysPrompt = buildDefaultSystemPrompt(userData.optionsOn !== false, _styles_, _cards_.stable);
    const aiResponseRaw = callGeminiAPI(prompt, _sysPrompt, aiConfig);
    // 🛡️→✅ 2026-07 邊界稽核：模型偶爾會回【截斷的 JSON】(吐到 max token 就斷)或純文字道歉，這在真實運行中是常態、不是例外。
    let aiData;
    try {
      const start = aiResponseRaw.indexOf('{');
      const end = aiResponseRaw.lastIndexOf('}');
      aiData = sanitizeAiData_(JSON.parse(aiResponseRaw.substring(start, end + 1)), myGameId);
    } catch (e) {
      try { Logger.log("[actionPlay_ AI回應無法解析] " + String(aiResponseRaw).slice(0, 300)); } catch (e2) { }
      aiData = aiFallbackData_(false);
    }

    if (aiData._genFailed) {
      return JSON.stringify({ text: aiData.narration, options: aiData.options });
    }





    // 🗑️ 2026-09 同伴自主離場(npc_exit)整組砍除（玩家定案）：它讓 AI 可以【不問玩家】就把人
    //    移出同行名單、還把她送去別的地點。而誰跟著我走、誰留在哪裡，是玩家用面板那幾顆鈕決定的事
    //    （玩家原話：「我需要這個角色可以跟我同行到 A，我 A 解散他，他會一直在 A」）——
    //    兩把鑰匙開同一道門，其中一把還在 AI 手上。要她離開，敘事照樣寫得出來，只是位置不會被動。
    // 鑑賞無戰鬥：血量快照/stat_changes(外顯狀態刷新)/經濟層(物品/金錢/任務)皆不追蹤、不落地。

    // 📝 神色／穿著／稱呼／回憶／她眼中的你 → 見 kanshouApplyIntimacyFeedback_。
    kanshouApplyIntimacyFeedback_({
      aiData: aiData, pcData: pcData, pcIndex: pcIndex, myGameId: myGameId,
      dirtyPcRows: dirtyPcRows, presentIds: presentRows.map(r => String(r[COL.PC.ID])), pcName: pcName
    });

    // 🌍 AI 這一回合發明的東西落盤——這是「自由」能成立的唯一原因：發明有人記，就不是雜訊。
    //    寫入點只有這一處(worldWrite_ 自己做去重/上限/淘汰)，別在別處各寫一份。
    // 🐛→✅ 2026-09：分錯類的改判(kanshouFixWorldKinds_)原本排在【落盤之後】，
    //    它是就地改 aiData.world_note 的，改完已經沒有人會再讀——整道防線等於沒接上。
    //    必須先改判、再落盤。
    if (Array.isArray(aiData.world_note) && aiData.world_note.length) {
      try {
        kanshouFixWorldKinds_(aiData.world_note, myGameId, getKanshouHomeName_(pcData[pcIndex][COL.PC.MEMORY], pcName),
          pcData.filter(function (r) { return String(r[COL.PC.FACTION]) === '從者' && sameGame(r) && !String(r[COL.PC.ID]).startsWith('DEAD_'); })
            .map(function (r) { return r[COL.PC.NAME]; }));
      } catch (e) { }
      try { worldWrite_(myGameId, aiData.world_note, curDay); } catch (e) { }
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

    // 橋段邀請按鈕(夜襲/賴床/地點共用)：candidate在回合開頭(任何LOC寫入之前)就算好了，這裡直接沿用，不應該重算——重算會撞回「同行同伴LOC已被同步」的舊bug。
    // 🚫 2026-09 砍掉「AI 新造的人 → 要不要深交」那顆泡泡（玩家：「照這個砍 巧遇留吧」）：
    //    AI 隨手發明的店員/鄰居本來就會留在【常民】名單裡、之後還會出現，只是不追蹤好感——
    //    升格這件事玩家沒有要求過，卻每次都被問一次，而且問錯過（拿地名問「要不要認識這個人」）。
    //    新同伴一律由玩家自己加：🌟 召喚（英靈殿）。
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
      kanshouClock: kanshouClock,
      // 修過的bug：#clock-hud讀共用的updateClock(data.clock,...)，但data.clock在鑑賞這條路徑上從來沒被設過，導致HUD一直被當成「沒有clock」隱藏。
      clock: kanshouClock ? kanshouClock.label : ""
    });

  } catch (e) {
    return JSON.stringify({ success: false, message: "出錯了。" });
  }
}


