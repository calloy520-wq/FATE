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
    // ⚠ 只留白名單那四欄再往下送：AI 回傳的物件是整包穿過去的，不重建的話它可以塞
    //    {own:"按摩"} 自己宣告「這家店是玩家的」、或把地點塞進別人的大區。
    //    region/own 只有玩家自己的動作寫得到(開店/開區)，那條路不經過這裡。
    aiData.world_note = (Array.isArray(aiData.world_note) ? aiData.world_note : [])
      .filter(w => w && typeof w === 'object' && worldSpec_(gameId).kinds.indexOf(String(w.kind || "").trim()) >= 0)
      .slice(0, worldSpec_(gameId).writeMax)
      .map(w => ({ kind: w.kind, name: w.name, text: w.text, sex: w.sex, at: w.at }));
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
function translateLookToDaily_(name, cls, rawLook, firstP, speech, sex) {
  var look = String(rawLook || "").trim();
  if (!look) return { look: "", outfit: "" };
  var figureHint = (sex === "女") ? "，若角色是成年女性、務必把身形與胸部寫進自然的敘述句裡——這句話會顯示在玩家看得到的狀態欄位；形容胸部時須明確扣連到胸部" : "";
  var sys = KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_ + "玩家提供一段用「、」或「・」分隔的角色戰時外貌描述" +
    "(前面數段是外貌本相與戰時攻防裝束，最後一段是整體氣質／神情)，以及這位角色的第一人稱自稱、說話語氣。" +
    "這是 Fate／聖杯戰爭的平行世界日常線，想像《衛宮家今天的餐桌風景》那種基調——換上現代日常穿搭，" +
    "但一看就知道是本人。請輸出兩樣東西：\n" +
    "①look：日常版「外貌」三短句、頓號分隔，每句精簡收束、【每句限" + TRAIT_SEG_HINT_ + "字內寫完整一句話，超過會被截斷】、避免堆疊多重子句，依序為[外貌本相(髮色/瞳色/五官/體態等，不含服裝)" + figureHint + "]、" +
    "[氣質(" + AURA_SPEC_ + "依和平日常情境自然轉化，但性格底色不變；用字與下方口氣段各自獨立)]、" +
    "[日常口氣(依原本說話語氣「" + (speech || "無特別描述") + "」寫成的日常說話口氣；自稱「" + (firstP || "我") + "」若不是尋常的「我」，就把它寫進這一句，是「我」則不必提)]。\n" +
    "②outfit：一句這位角色今天的日常穿搭，保留原本服裝的色系/風格精神、換成現代日常款式，盡量貼近原味，" +
    "不要跟look的內容重複。\n" +
    "★輸出合法 JSON（純文字，無 Markdown）：{\"look\":\"三短句頓號分隔\",\"outfit\":\"一句日常穿搭\"}";
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
    "(用「、」分隔，依序對應[日常表象][真實內裡][喜歡的事物][討厭的事物]，段數可能不足4段——" +
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
  var traitSrc = dailyLookParts.length >= DAILY_LOOK_SLOTS_ ? [dailyLookParts[0], dailyLookParts[1]].join('、') : looksToTraitParts_(daily.look);
  sRow[COL.PC.TRAIT] = parseTraitsHelper(traitSrc, "外貌出眾、舉止從容", TRAIT_SLOTS_);
  // 戰時 p.back 跟平行世界矛盾，優先讀 p.dailyBack。
  // ⚠ 兩者都沒有就【留空】：卡片的「經歷」欄空了就不印（pBackStr），比塞一句泛用墊底話好——
  //    那句對 25 位有名有姓的英靈零資訊量，還會擋掉 AI 自己補一段合理來歷的空間。
  sRow[COL.PC.BACK] = p.dailyBack ? String(p.dailyBack).slice(0, 28)
    : p.back ? String(p.back).slice(0, 28) : "";
  // 直接召喚無快照可帶，用該英靈自己的日常衣裝(daily.outfit)墊底，沒有才退回「日常便服」。
  var dailySpeechPart = dailyLookParts.length >= DAILY_LOOK_SLOTS_ ? dailyLookParts[2] : "";
  sRow[COL.PC.MEMORY] = setOutfit_(stampPersonaFlavor_("【鑑賞後日談·初見】在這座城裡剛結識的緣分，才剛開始。", dailySpeechPart, ""), daily.outfit || "日常便服");
  // 🪞 記住她來自哪一筆種子：顯示名可能被改成日常稱呼，撞名守門要靠這個才認得出「同一個人」。
  sRow[COL.PC.MEMORY] = KANSHOU_SRC_TAG_.set(sRow[COL.PC.MEMORY], String(heroRow[COL.HERO.ID] || ""));
  // PHYSICAL 留空，跟御主本人(actionEnterKanshou)一致，直到第一次 intimacy_feedback 才寫入；
  sRow[COL.PC.GAME_ID] = gameId;
  // REL_TAG(關係標籤)只是這裡設的起始值，之後全程只能透過actionUpdateRelTag(玩家UI手動操作)更改——AI對這欄位完全沒有寫入權限，不會被AI敘事悄悄帶偏。
  sRow[COL.PC.BOND] = 0;
  sRow[COL.PC.REL_TAG] = "點頭之交";
  sRow[COL.PC.REL_MEM] = "初次相遇，緣分才剛開始";
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
const KANSHOU_FAMILIAR_TIERS_ = [{ min: 150, key: '老交情' }, { min: 30, key: '混熟' }, { min: 0, key: '初識' }];
// 依相處次數查熟悉段（單一真實來源＝KANSHOU_FAMILIAR_TIERS_）。
function kanshouKnownTier_(metCount) {
  return (KANSHOU_FAMILIAR_TIERS_.find(function (t) { return (parseInt(metCount) || 0) >= t.min; }) || {}).key || '初識';
}
// 組一句「你在對方眼中」：熟悉段 ＋ 對方真的記下的那幾條（沒有就只有熟悉段）。
function kanshouKnownOfYou_(memory) {
  var noted = String(KANSHOU_NOTED_TAG_.get(memory) || '').split(KANSHOU_NOTED_SEP_).map(function (x) { return x.trim(); }).filter(Boolean);
  return { tier: kanshouKnownTier_(KANSHOU_MET_COUNT_TAG_.get(memory)), noted: noted };
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
// 🫶 玩家主動提議(相約/同去)她答不答應——【GAS 依好感擲，AI 只演反應】(2026-07 由 AI 判定改為 GAS 判定)。
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
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  var me = data[meIdx];
  var gid = String(me[COL.PC.GAME_ID] || ""); var loc = String(me[COL.PC.LOC] || "冬木·深山町");
  var heroes = getHeroCodexCached();
  var hero = heroes.find(function (r) { return String(r[COL.HERO.ID]) === heroId; });
  if (!hero) return JSON.stringify({ success: false, message: "找不到這個人。" });
  // 衛宮士郎-Master：玩家本人就是這個位置，不開放召喚。
  if (heroId === '衛宮士郎-Master') return JSON.stringify({ success: false, message: "這位就是你自己。" });
  if (KANSHOU_SUMMON_BLOCKED_IDS_.indexOf(heroId) !== -1) return JSON.stringify({ success: false, message: "這位現在還請不來。" });
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
// ⚠ 刻意【不】逐列 deleteRow：在 GAS 裡那是一列一次 API 呼叫，同伴＋歷史＋相簿＋帳本加起來
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
// 【會清掉】鑑賞眾生(玩家自己那列＋所有同伴)、他們的對話歷史、相簿、世界帳本、帳號表的鑑賞連結。
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
      } catch (e) { }
      // 🗺️ 舊存檔遷移：地圖搬進世界帳本那一版之前，這些地方寫死在代碼裡。種回去一格都不少。
      kanshouSeedMap_(kpc, data, r, false);
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
      kanshouSeedMap_(kpc, data, m, false);
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
  var starterRows = starterHeroes.map(function (hero) {
    // 起始住民就落在玩家開局的地方（位置模擬拆掉後不再骰去向）。
    return heroToKanshouRow_(hero, gameId, loc2, 1);
  });
  if (starterRows.length) {
    kpc.getRange(kpc.getLastRow() + 1, 1, starterRows.length, pcColCount).setValues(starterRows);
  }

  // 🌱 新局的地圖＝一片空白＋五個範例地方（可改名、可改樣子、可刪掉）。
  kanshouSeedMap_(kpc, data, -1, true, mRow, kpc.getLastRow() - starterRows.length);
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
- personality：日常表象、真實內裡、喜歡的事物、討厭的事物。格式範例(只示範斷句)：「(表象)、(內裡)、(喜歡的)、(討厭的)」
★speech：${pron_(finalSex)}講話的調調，限16字，寫成短詞組。這是給 AI 演這個人的依據，玩家看不到。
★tic：${pron_(finalSex)}的招牌小動作/小習慣，限16字(例：想事情時會摳袖口、聽人說話會微微偏頭)。★speech 與 tic 必須是【完全不同】的兩件事，各講各的。
★background：限20字，【只寫來到冬木【以前】的來歷】，呼應其身世，不出現具體物品名，語氣平和溫馨，不涉及聖杯戰爭或任何戰爭史。
★【只寫來到冬木以前的來歷】：現在的工作、住處、同住的人、交往對象、養的動物、已經有的朋友，全部留給玩家在遊戲裡自己做出來（系統會逐項記錄）——這一格只寫來到冬木之前的來歷。
★outfit：一句今天的日常穿搭(限20字)，依外貌與個性方向自然搭配(如文靜者素雅、活潑者亮色休閒)，純日常便服/居家/外出風格，不含任何戰甲/武裝/戰鬥裝束字眼。
★【數值與地點由系統裁定】輸出欄位以下方 JSON 列出的為限。

★【輸出】合法 JSON（純文字，無 Markdown）：
{"background":"限20字","traits":"兩格頓號字串","personality":"四格頓號字串","speech":"講話的調調，限16字","tic":"招牌小動作，限16字","outfit":"一句日常穿搭"}`;

  try {
    const aiBrief = JSON.parse(callGeminiAPI(promptStr, KANSHOU_MASTER_GEN_SYS, { temperature: 0.6, ignoreLaw: true, model: CREATION_MODEL }));
    // 🔒 競態修(比照 actionBackfillMasterAi)：backfill 豁免寫入鎖，pIdx 是 AI 呼叫【前】的列索引——寫回前重定位。
    const wIdx = buildLiveIdIndex_(sheets.pc)[String(pcId)];
    if (wIdx === undefined) return JSON.stringify({ success: false, message: "你的角色不見了，重新進來看看。" });
    // 🔒 只補空的、不蓋已有的：第一次補完會蓋【設定已補】章，之後再跑就只填【現在還是空的】那幾格。
    //    沒有這道閘，對一個已經玩過的角色再跑一次 backfill 會把他整組洗掉——舊角色回來補新欄位
    //    (口吻/小動作)一定會踩到。詳見 CODE_NOTES.md。
    const _topUp_ = !!KANSHOU_BACKFILL_DONE_TAG_.get(row[COL.PC.MEMORY]);
    const _put_ = (col, val, curRaw) => {
      if (!val) return;
      if (_topUp_ && String(curRaw || "").replace(/[、\s]/g, "")) return; // 補過了、而且這格已經有東西
      sheets.pc.getRange(wIdx + 1, col + 1).setValue(val);
    };
    _put_(COL.PC.BACK, aiBrief.background && String(aiBrief.background).slice(0, 40), row[COL.PC.BACK]);
    _put_(COL.PC.TRAIT, aiBrief.traits && parseTraitsHelper(aiBrief.traits, traitParts_(row[COL.PC.TRAIT]).join('、'), TRAIT_SLOTS_), traitParts_(row[COL.PC.TRAIT]).join(''));
    _put_(COL.PC.PREF, aiBrief.personality && parseTraitsHelper(aiBrief.personality, row[COL.PC.PREF]), row[COL.PC.PREF]);
    // MEMORY 上有三件事要寫(衣裝／口吻／小動作)——同一格，讀一次寫一次就好，別各寫各的。
    // 衣裝：生成失敗/沒給值時種子預設「日常便服」繼續當保底。口吻/小動作走召喚同伴那支 stampPersonaFlavor_。
    {
      let liveMem = sheets.pc.getRange(wIdx + 1, COL.PC.MEMORY + 1).getValue();
      const before = String(liveMem);
      if (aiBrief.outfit && !(_topUp_ && getOutfit_(liveMem))) liveMem = setOutfit_(liveMem, aiBrief.outfit);
      liveMem = stampPersonaFlavor_(liveMem,
        getPersonaSpeech_(liveMem) ? "" : String(aiBrief.speech || "").slice(0, 40),
        getPersonaTic_(liveMem) ? "" : String(aiBrief.tic || "").slice(0, 40));
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
      var loc = String(data[i][COL.PC.LOC] || "");
      // 面板需要顯示目前所在地點(玩家要精準知道去哪找她)、關係標籤＋好感(供玩家決定要不要改標籤)；isHere(是否跟玩家同地點)；locLabel：房間類地點的動態顯示名稱，見kanshouRoomDisplayName_。
      // memoir：共同回憶(27欄)原樣下傳(★前綴=玩家釘選)，供面板顯示/釘選/刪除。
      // 🆔 2026-07「整體重構·id優先」：補id讓前端能存起來隨後續action回傳，後端才有id可用、不必只靠名字(kanshouNameCandidates_別名表已處理大部分情況，但id才是真正杜絕撞名/前綴混淆的單一真實來源)。
      current.push({ id: String(data[i][COL.PC.ID]), name: String(data[i][COL.PC.NAME]), tag: String(data[i][COL.PC.REL_TAG] || ""), nickname: getNickname_(data[i][COL.PC.REL_MEM]), loc: loc, locLabel: kanshouRoomDisplayName_(loc, data, gid, myName, meIdx), isHere: loc === myLoc, party: partyIds.indexOf(String(data[i][COL.PC.ID])) >= 0, memoir: String(data[i][COL.PC.MEMOIR] || "").split('｜').map(function (s) { return s.trim(); }).filter(Boolean) });
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

  // 🗾 大區與地點的「自由增減」：開一個區／改名／收掉、把地點搬到某一區、開店／收店。
  //    全部住在這支既有的帳本管理 action 裡(它本來就在做 pin/unpin/del)，不另開路由。
  if (['rg_add', 'rg_rename', 'rg_del', 'loc_region', 'loc_own', 'loc_rename', 'loc_text'].indexOf(op) >= 0) {
    try {
      const nm = kanshouSanitizeTagValue_(userData.entryName, 16);
      if (!nm) return JSON.stringify({ success: false, message: "名字不能空白。" });
      if (op === 'rg_add') {
        const regions = kanshouRegionsFor_(gid);
        if (regions.some(r => r.name === nm)) return JSON.stringify({ success: false, message: "已經有同名的地區了。" });
        if (regions.filter(r => r.mine).length >= KANSHOU_REGION_CAP_) {
          return JSON.stringify({ success: false, message: `地區最多開 ${KANSHOU_REGION_CAP_} 個，先收一個。` });
        }
        const rid = 'rg_' + Date.now().toString(36);
        worldWrite_(gid, [{ kind: KANSHOU_REGION_KIND_, name: nm, text: kanshouSanitizeTagValue_(userData.text, 24), region: rid }], parseInt(data[meIdx][COL.PC.DAY]) || 1);
      } else if (op === 'rg_rename') {
        const newNm = kanshouSanitizeTagValue_(userData.newName, 16);
        if (!newNm) return JSON.stringify({ success: false, message: "新名字不能空白。" });
        if (!worldSet_(gid, KANSHOU_REGION_KIND_, nm, KW_.NAME, newNm)) return JSON.stringify({ success: false, message: "找不到這個地區。" });
      } else if (op === 'rg_del') {
        // ⚠ 收掉一個區之前，先把底下的地點放回「走出來的地方」——不然它們會變成
        //    指向一個不存在的區的孤兒（地圖上那一格從此點不到）。
        const rg = kanshouFindRegion_(gid, nm);
        if (!rg || !rg.mine) return JSON.stringify({ success: false, message: "只能收自己開的地區。" });
        worldRead_(gid).filter(r => r.kind === '地點' && r.region === rg.id)
          .forEach(r => { try { worldSet_(gid, '地點', r.name, KW_.REGION, ""); } catch (e) { } });
        if (!worldDrop_(gid, KANSHOU_REGION_KIND_, nm)) return JSON.stringify({ success: false, message: "找不到這個地區。" });
      } else if (op === 'loc_region') {
        const rg = String(userData.region || "").trim() ? kanshouFindRegion_(gid, userData.region) : null;
        if (!worldSet_(gid, '地點', nm, KW_.REGION, rg ? rg.id : "")) return JSON.stringify({ success: false, message: "這不是你開的地方，搬不了。" });
      } else if (op === 'loc_rename') {
        // 📍 改名要連著搬：掛在這個地名底下的東西(AT)認的是【名字】，不跟著改就會全部變成孤兒。
        const newNm = kanshouSanitizeTagValue_(userData.newName, 16);
        if (!newNm) return JSON.stringify({ success: false, message: "新名字不能空白。" });
        if (kanshouFindLoc_(gid, newNm)) return JSON.stringify({ success: false, message: "已經有同名的地方了。" });
        if (!worldSet_(gid, '地點', nm, KW_.NAME, newNm)) return JSON.stringify({ success: false, message: "這不是你開的地方，改不了名。" });
        worldRead_(gid).filter(r => String(r.at || "").trim() === nm)
          .forEach(r => { try { worldSet_(gid, r.kind, r.name, KW_.AT, newNm); } catch (e) { } });
        // 人也跟著改：站在舊地名上的人列，LOC 還指著已經不存在的地方。
        try {
          for (let i = 1; i < data.length; i++) {
            if (String(data[i][COL.PC.GAME_ID] || "") !== gid) continue;
            if (String(data[i][COL.PC.LOC] || "").trim() !== nm) continue;
            kpc.getRange(i + 1, COL.PC.LOC + 1).setValue(newNm);
          }
        } catch (e) { }
      } else if (op === 'loc_text') {
        if (!worldSet_(gid, '地點', nm, KW_.TEXT, kanshouSanitizeTagValue_(userData.text, worldSpec_(gid).textMax))) {
          return JSON.stringify({ success: false, message: "這不是你開的地方，改不了。" });
        }
      } else if (op === 'loc_own') {
        // 營業內容留空＝收店。地點本身不動，只是不再是你的店。
        if (!worldSet_(gid, '地點', nm, KW_.OWN, kanshouSanitizeTagValue_(userData.own, 12))) {
          return JSON.stringify({ success: false, message: "這不是你開的地方，開不了店。" });
        }
      }
    } catch (e) { return JSON.stringify({ success: false, message: "沒成功，等一下再試。" }); }
    return JSON.stringify(worldPayload_(gid));
  }

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

// 面板要的東西一次給齊：條目＋大區＋上限。list 與每一個 op 都回這同一包(前端只要認一種形狀)。
function worldPayload_(gid) {
  const all = worldRead_(gid);
  const rows = all.filter(r => r.kind !== KANSHOU_REGION_KIND_)
    .map(r => ({ kind: r.kind, name: r.name, text: r.text, sex: r.sex, pin: r.pin, seen: r.seen, hits: r.hits, region: r.region, own: r.own, at: r.at }));
  // 釘選的排前面，其次照「最後被提到」由新到舊——跟提示詞的相關性排序不同，那是給 AI 的，這是給人看的。
  rows.sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.seen - a.seen);
  return {
    success: true, rows: rows, caps: worldSpec_(gid).cap, panel: worldSpec_(gid).panel,
    regions: kanshouRegionsFor_(gid).map(r => ({ id: r.id, name: r.name, desc: r.desc || "", mine: !!r.mine })),
    regionCap: KANSHOU_REGION_CAP_
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
    if (op === 'drop') ids = ids.filter(x => x !== npcId);
    else if (op === 'add') {
      if (ids.indexOf(npcId) >= 0) return JSON.stringify({ success: true, party: ids });
      if (ids.length >= KANSHOU_PARTY_MAX_) {
        return JSON.stringify({ success: false, message: `同行最多 ${KANSHOU_PARTY_MAX_} 位，先讓一位離開。` });
      }
      ids.push(npcId);
      // 人跟著你走：加入的當下就落到你所在的場景。
      data[tIdx][COL.PC.LOC] = String(data[meIdx][COL.PC.LOC] || "");
      kpc.getRange(tIdx + 1, COL.PC.LOC + 1).setValue(data[tIdx][COL.PC.LOC]);
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
// 🔴【鑑賞 AI 核心】buildDefaultSystemPrompt／actionPlaysolo 是按鍵+AI說故事，鑑賞是依角色資料自然演出(只有🔥點不點火這一個變因)——兩者共用callGeminiAPI(留在 Engine_Combat.gs)這個基礎設施，但系統提示詞組裝／敘事引擎各自獨立，跟本檔其餘鑑賞 action(召喚/進場/AI深化)集中一處，好查找。
// ==========================================

// 🔠 對話格式·鑑賞【單一真實來源】：2026-09 起只剩鑑賞在用(solo 走 miniSystem 的短版)。這裡【只講格式】，不講該寫什麼。
function dialogueFormatRule_() {
  return `對話格式：
①單層「」裡【只放嘴巴發得出的聲音】：話語、喘息、輕吟、悶哼、笑聲、吸吮、舔啜、咀嚼、吞嚥。
②每句台詞前冠說話者名，跨回合認同一個人，喘息混台詞算同一人名下。★玩家台詞免冠名、直接「……」，且照原句一字不動地寫進去。
③肢體動作與非口部聲響(啪啪/環境音/衣物摩擦)走敘事，留在引號外。
④★台詞與人物互動【佔整段 narration 七成以上】，其餘三成才是敘事。`;
}

// 只被鑑賞(慾海)呼叫——solo走完全獨立的 miniSystem。
// 🗑️ 2026-09 master_note(經歷滾動側寫)整個拿掉——玩家「我的經歷怪怪的.....好像是滾動式的」。
//    病在【反覆重新摘要】：每 3 回合把整段經歷壓回 50 字以內，壓過的東西再壓一次，
//    開局寫的東西幾輪後就被最近幾回合洗掉了(lossy re-summarization 的典型衰變)。
//    而且「一路上發生了什麼」現在是世界帳本的工作，它是【追加＋淘汰】、不是反覆重寫——
//    留著這條等於用一個更差的機制做同一件事。經歷從此是固定事實：創角時生成一次，
//    之後只有玩家能透過逆天改命改。這是 2026-07「性格四格/萌點不再交給 AI」那次的最後一塊。
function buildDefaultSystemPrompt(includeOptions, styles) {
  const _physicalState = "此刻臉上看得到的神色(第三人稱·≤15字)·沒變就留空";

  // appearance_extras(原 outfit_change)：角色當下實際穿著與配飾，AI 依劇情如實更新，寫回持久的【換裝】記錄。2026-09 小道具機制移除後，配飾類事實回歸由這一欄承接。
  const _appearanceExtras = "穿著與配飾(第三人稱·≤20字·名詞短語)·沒換就留空";

  const _physicalStateRef = "同上";
  const _appearanceExtrasRef = "同上";

  const finalJson = {
    // 強制思維鏈：放範本第一位讓模型先自省再寫敘事。
    "inner_monologue": "【不顯示·約50字·先判這個再寫 narration】第三人稱總結【被搭話的那個人】此刻的真實狀態([性格]vs[情緒身體])＋【玩家這個人】真正的感受(依其性格與經歷)·承接歷史·只算【在場人物】名單上的人",
    "narration": "劇情(第二人稱「你」＝玩家·字數照下方【篇幅】·下限是硬底線)",
    // 🗺️ 2026-07 移動改「同意泡泡」制(見§134)；2026-07再修（玩家實測「AI一直提議移動、頭痛」）：move_proposal 欄位整個砍掉，AI 不再有任何管道自己決定要不要換場景/換去哪。
    "npc_exit": "本回合告辭離場者的真名陣列·narration須演出那個人離開·否則[]",
    "options": ["固定4條·各≤20字·就本回合 narration 出題·只出在場者此刻真做得到的動作·不含換地點·四條走向各不相同(主動/被動/接續/反差)"],
    "intimacy_feedback": {
      "player": {
        "physical_state": _physicalState,
        "appearance_extras": _appearanceExtras
      },
      "npcs": [{
        "name": "NPC真名",
        "physical_state": _physicalStateRef,
        "appearance_extras": _appearanceExtrasRef,
        "mutual_nicknames": "本回合真的叫出口的暱稱·否則「無」",
        "rel_tag": "≤8字·這個人現在是玩家的什麼(如 同事/鄰居/搭檔/戀人)·跟上回合一樣就填「無」",
        "memory": "里程碑(難忘約會/重要約定)才寫≤30字·同 narration 用第二人稱「你」稱玩家·其餘填「無」·同一事只記一次",
        "noticed": "≤14字·只記【會改變之後怎麼對玩家】的發現·多數回合填「無」"
      }]
    },
    // 🌍 世界帳本的入口：AI 這一回合發明了什麼，自己寫下來，GAS 幫它記住。
    "world_note": [{ "kind": "地點|人物|設定", "name": "地名/人名/一句話標題", "text": "≤" + WORLD_SPEC_.kanshou.textMax + "字·之後要當真的事實", "sex": "僅 kind=人物 時填 男/女/異", "at": "這件事/這個人長在哪個地方就填那個地名·跟著整座城走就填「無」" }],
  };
  if (includeOptions === false) { delete finalJson.options; }

  // 🔠 對話格式規則：2026-09 起只剩鑑賞在用——那套含喘息/吸吮的例子是 NSFW 取向，solo 是 SFW 戰鬥敘事，改用 miniSystem 內的短版。

  // 🔴 NSFW(慾海模式)：本回合聚焦當下的近身互動(情慾/調情/鋪陳皆可)，雜務(物品/金錢/陣營/任務/招募/地圖/戰鬥數值/身世)完全不追蹤、不輸出，鐵律文字大幅精簡，盡量交給AI自行判斷。
  // 風格段（筆觸／主權／對話格式／推演／連貫／語癖／不出戲）由 kanshouStyle_ 供給：玩家版→關閉→預設。
  //    鐵律照陣列順序動態編號，關掉一段其餘自動補號；預設值全部一格不改時，輸出與舊版寫死的字串逐字相同。
  const _st = k => kanshouStyle_(styles, k);
  const rules = [
    _st('agency'),
    _st('enact'),
    '每3~4句 <br><br> 分段。',
    _st('dialogue'),
    _st('drive'),
    _st('continuity'),
    '肢體互動依雙方【性別】欄自然呈現。',
    _st('lewd'),
    '卡片上的裝扮＝既定事實，照著寫，直到劇情真讓那個人換裝為止。',
    _st('immersion'),
    '只輸出合法 JSON(各欄的格式見下方輸出範本)。'
  ].filter(Boolean);
  const nsfwBaseRules = _st('voice') + '鐵律：\n' + rules.map((r, i) => (i + 1) + '. ' + r).join('\n');

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
  // 🗺️ 這一區不是靜態地圖，是玩出來的：成員來自世界帳本的「地點」類，不在 KANSHOU_LOCATIONS_ 裡。
  { id: 'mine', name: '走出來的地方', desc: '你自己找到的地方' }
];
// 🗺️ 這一局真正走得到的地方＝【內建地圖 ∪ 你自己走出來的地方】(世界帳本的「地點」類)。
//    2026-09 之前只有內建那 28 格，想去的地方不在裡面就等於不存在——這是「不夠自由」最直接的來源。
//    ⚠ 查地點一律走這兩支，別再直接 .find(KANSHOU_LOCATIONS_)，否則自己走出來的地方會查無、被當成非法目的地。
function kanshouLocationsFor_(gameId) {
  const mine = worldRead_(gameId).filter(r => r.kind === '地點' && r.name)
    .map(r => ({ name: r.name, region: r.region || 'mine', desc: r.text || "", mine: true, own: r.own || "" }));
  return mine.length ? KANSHOU_LOCATIONS_.concat(mine) : KANSHOU_LOCATIONS_;
}

// 🧑↔🏠 這個名字是不是【地方】而不是人？AI 偶爾會把地點寫成 kind:'人物'（實測玩家看到
//    「你認識了『風音的家』」——拿地名當成一個人）。
//    輸入當不可信：比對內建地點、玩家自己開的地方、玩家住所，以及「…的家/店/屋/館/亭/堂」這種地名尾巴。
const KANSHOU_PLACE_SUFFIX_ = /(的家|的店|之家|宅邸|公寓|大樓|屋|館|亭|堂|苑|園|寺|社|樓|閣|城|站|所|廳|房|室|宅|邸)$/;
function kanshouNameIsPlace_(name, gameId, homeName) {
  const nm = String(name || "").trim();
  if (!nm) return false;
  if (homeName && nm === String(homeName).trim()) return true;
  try {
    if (kanshouLocationsFor_(gameId).some(l => String(l.name).trim() === nm)) return true;
    if (kanshouRegionsFor_(gameId).some(r => String(r.name).trim() === nm)) return true;
  } catch (e) { }
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
  });
  return entries;
}

// 🗾 這一局有哪些大區＝內建幾區 ∪ 玩家自己開的。
// ⚠ 自訂大區【天生就是一般公共區】：行為判斷都寫成「不是 room」的形式，
//    所以一個陌生的區 id 自動落在「一般」那一邊，不必改任何行為邏輯。
function kanshouRegionsFor_(gameId) {
  const mine = worldRead_(gameId)
    .filter(r => r.kind === KANSHOU_REGION_KIND_ && r.name)
    .map(r => ({ id: r.region || ('rg_' + r.name), name: r.name, desc: r.text || "", mine: true }));
  return mine.length ? KANSHOU_REGIONS_.concat(mine) : KANSHOU_REGIONS_;
}
function kanshouFindRegion_(gameId, idOrName) {
  const v = String(idOrName || "").trim();
  if (!v) return null;
  return kanshouRegionsFor_(gameId).find(r => r.id === v || r.name === v) || null;
}
function kanshouFindLoc_(gameId, name) {
  const n = String(name || "").trim();
  if (!n) return null;
  return kanshouLocationsFor_(gameId).find(l => l.name === n) || null;
}

// 🧭 給AI的地點脈絡：光一個地名(如「客廳」)AI分不出是御主自己家還是別人家，容易誤演成「在他家中」。
function kanshouLocContextForAI_(locName, homeName, gameId) {
  const loc = kanshouFindLoc_(gameId, locName);
  if (!loc) return "";
  // 🏪 你自己的店/攤位：這是最需要先講清楚的一件事——不講的話 AI 會把你演成上門的客人。
  const ownStr = loc.own ? `這是【你自己開的】${loc.own}「${loc.name}」，你是這裡的主人；客人會上門，你招呼、你做事` : "";
  if (ownStr) return ownStr + (loc.desc ? `（${loc.desc}）` : "");
  const rgCustom = (loc.region && String(loc.region).indexOf('rg_') === 0) ? kanshouFindRegion_(gameId, loc.region) : null;  // 內建區走下面的 switch
  if (rgCustom) return `${rgCustom.name}${rgCustom.desc ? `（${rgCustom.desc}）` : ""}的「${loc.name}」${loc.desc ? `：${loc.desc}` : ""}`;
  if (loc.region === 'mine') return loc.desc || "這座城裡你們自己走出來的地方";
  switch (loc.region) {
    case 'room': return `你自己的家「${homeName}」的私人房間`;
    case 'home': return `你自己的家「${homeName}」的共用空間`;
    case 'shinzan': return `深山町（溫馨的住宅生活區）`;
    case 'fuyuki': return `冬木市中心（熱鬧的商業生活區）`;
    case 'dojo': return `山林（安靜神秘的郊野區）`;
    default: return "";
  }
}
// 🌸 內建地點只剩【你自己的房間】一格：它是結構性的(玩家永遠有路可退、isRoom 判私密場合)，
//    刪不得也搬不得。其餘的地方全部住在世界帳本裡，開局種進去當範例——玩家改得動、也刪得掉。
//    玩家原話：「我理想中的鑑賞應該是一片空白，但我可以跟 AI 慢慢搭建」＋「地圖保留一點點留個類似範例」。
const KANSHOU_LOCATIONS_ = [
  { name: '我的房間', region: 'room', desc: '安穩靜謐、只屬於自己的房間。', isRoom: true }
];
// 🌱 開局範例地圖：五個地方，一區一個當樣板。這些是【一般帳本條目】，跟玩家自己開的地方沒有兩樣。
const KANSHOU_STARTER_PLACES_ = [
  { name: '客廳', region: 'home', text: '沙發與電視的日常起居空間。' },
  { name: '河邊小徑', region: 'shinzan', text: '晨昏都靜謐的河堤小徑，水聲潺潺。' },
  { name: '商店街', region: 'fuyuki', text: '人聲鼎沸的商店街，攤販林立。' },
  { name: '咖啡廳', region: 'fuyuki', text: '磨豆香氣繚繞的小巧咖啡館。' },
  { name: '夜景展望台', region: 'dojo', text: '能俯瞰整座城市萬家燈火的高地，晚風正好。' }
];
// 🧳 舊存檔的地圖：這些地方原本寫死在 KANSHOU_LOCATIONS_ 裡，玩家的人和記憶都站在上面。
//    搬進帳本時整批種回去，一格都不少——存檔換版本的那一刻不該有東西消失。
//    之後它們跟範例地圖一樣可改可刪，這張表只在【一次性遷移】時被讀到。
const KANSHOU_LEGACY_PLACES_ = [
  { name: '客廳', region: 'home', text: '沙發與電視的日常起居空間。' },
  { name: '浴室', region: 'home', text: '水氣氤氳、放鬆卸下一天疲憊的地方。' },
  { name: '和室', region: 'home', text: '鋪著榻榻米的和室，安靜得聽得見風。' },
  { name: '河邊小徑', region: 'shinzan', text: '晨昏都靜謐的河堤小徑，水聲潺潺。' },
  { name: '古老神社', region: 'shinzan', text: '石階盡頭的老神社，香火氣息。' },
  { name: '社區公園', region: 'shinzan', text: '孩子嬉鬧、長椅斑駁的社區公園。' },
  { name: '便利商店', region: 'shinzan', text: '燈火通明、24小時營業的街角小店。' },
  { name: '藤村家', region: 'shinzan', text: '熱鬧溫馨、時常傳出笑鬧聲的藤村家。' },
  { name: '咖啡廳', region: 'fuyuki', text: '磨豆香氣繚繞的小巧咖啡館。' },
  { name: '書店二樓', region: 'fuyuki', text: '安靜得只聽見翻頁聲的二樓書架間。' },
  { name: '商店街', region: 'fuyuki', text: '人聲鼎沸的商店街，攤販林立。' },
  { name: '摩天輪', region: 'fuyuki', text: '入夜會點燈的摩天輪，是情侶間熱門的約會景點。' },
  { name: '水族館', region: 'fuyuki', text: '館內盡是幽藍燈光，水母缸前總擠著竊竊私語的情侶。' },
  { name: '深夜賓館', region: 'fuyuki', text: '招牌亮著曖昧的霓虹燈，房間隔音很好，沒有人會多問一句。' },
  { name: '遠坂邸', region: 'fuyuki', text: '老字號魔術師家系的遠坂邸。' },
  { name: '廢棄神社', region: 'dojo', text: '荒草蔓生、早已無人祭拜的廢棄神社。' },
  { name: '夜景展望台', region: 'dojo', text: '能俯瞰整座冬木市萬家燈火的高地，晚風正好，兩人並肩無語也不尷尬。' },
  { name: '情侶溫泉套房', region: 'dojo', text: '只租給兩人的溫泉旅館房間，一拉上紙門，外頭的世界就與你們無關了。' }
];
// 🗺️ 地圖種子只種一次：判準是「寫過沒有」而不是「有沒有地方」——玩家把地圖清空是他的決定，
//    不該下次進來又長回來（同 KANSHOU_PARTY_TAG_ 那條）。
var KANSHOU_MAP_SEED_TAG_ = makeTextTag_('地圖');
// 種地圖＋把「已經種過」寫回玩家那一列。rowIdx<0＝這一列是剛 append 的新局(用 newRow/newRowNum)。
function kanshouSeedMap_(kpc, data, rowIdx, fresh, newRow, newRowNum) {
  const row = (rowIdx >= 0) ? data[rowIdx] : newRow;
  if (!row) return;
  const gid = String(row[COL.PC.GAME_ID] || "");
  if (!gid) return;
  const mem = kanshouSeedMapIfNew_(gid, row[COL.PC.MEMORY], fresh, parseInt(row[COL.PC.DAY]) || 1);
  if (mem === row[COL.PC.MEMORY]) return;      // 種過了，什麼都不必寫
  row[COL.PC.MEMORY] = mem;
  try { kpc.getRange(((rowIdx >= 0) ? rowIdx : (newRowNum - 1)) + 1, COL.PC.MEMORY + 1).setValue(mem); } catch (e) { }
}
function kanshouSeedMapIfNew_(gameId, memory, fresh, curDay) {
  if (KANSHOU_MAP_SEED_TAG_.has(memory)) return memory;
  const seeds = fresh ? KANSHOU_STARTER_PLACES_ : KANSHOU_LEGACY_PLACES_;
  try {
    worldWrite_(gameId, seeds.map(x => ({ kind: '地點', name: x.name, text: x.text, region: x.region })),
      parseInt(curDay) || 1, seeds.length);
  } catch (e) { }
  return KANSHOU_MAP_SEED_TAG_.set(memory, fresh ? '範例' : '舊版');
}
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
// 暫時移出鑑賞的英靈id清單(單一來源)，召喚/地點標籤/住處全部共用同一份。
// 2026-09 玩家「想辦法讓他們可以召喚」→ 清空。原本被擋的三位真正的問題是【撞名】
// （斯卡哈有 Lancer/Assassin 兩種靈基、伊莉雅有 Master/Caster 兩個版本），封鎖只是繞過去；
// 現在由下方 kanshouSummonClash_ 擋「同一個人同時在場」，兩種姿態各自都召喚得到，選一個。
const KANSHOU_SUMMON_BLOCKED_IDS_ = [];
// 🏘️ 開局起始住民(2026-07玩家定案)：只有這4位一開始就「活在這座城裡」，其餘靠 🌟 召喚入駐。
const KANSHOU_STARTER_IDS_ = ['藤村大河-Master', '遠坂凜-Master', '間桐櫻黑化-Master', '阿爾托莉雅-Saber'];
// 🫂 同行名單（存【玩家】列 MEMORY·逗號分隔的 id）：2026-09 玩家定案「我可以指定 AI 跟我一起，
//    他必須回應我；其他人可以出現但只是很薄的背景板」。這是「誰在這一幕裡」的【唯一】判準——
//    人不再綁地點，也就不再有「她剛好也在這裡」這回事。
// ⚠ 存 id 不存名字：鑑賞眾生是全帳號共用一張表，大家都從同一座英靈殿召喚，撞名是常態不是巧合
//    （同款坑見 CODE_NOTES 的「初次·同床蓋到別人那列」）。
const KANSHOU_PARTY_MAX_ = 3;
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
function kanshouHeroIdByName_(heroName) {
  const n = String(heroName || "").trim();
  for (var cid in KANSHOU_CASUAL_NAME_) { if (KANSHOU_CASUAL_NAME_[cid] === n) return cid; }
  const hero = SEED_SERVANTS.find(h => kanshouNameCandidates_(h.realName).includes(heroName));
  return hero ? hero.id : null;
}
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
  const loc = String(pcRow[COL.PC.LOC] || "").trim();
  return { day: day, hour: hour, band: band, month: d.month, dayOfMonth: d.day, label: (loc ? "📍" + loc + "　" : "") + d.year + "年" + d.month + "月" + d.day + "日・" + kanshouFmtHM_(hour) + "・" + band };
}

// 好感≥80觸發同床共枕的那次結束一天，順手記一筆「今晚共度良宵的對象」，下一回合(不論玩家做什麼)讀一次就清掉(一次性旗標)，餵進提示詞當【晨間餘韻】引子。
// 🔒 創角敘事欄「已經補過了」的章：蓋了之後 backfill 只填還空著的格子，不再覆寫玩家玩出來的內容。
var KANSHOU_BACKFILL_DONE_TAG_ = makeIntTag_('設定已補', 0);
var KANSHOU_MORNING_AFTER_TAG_ = makeTextTag_('晨間餘韻');
// 🌙 同款一次性旗標的另一半：那些「昨晚陪你到最後、卻沒留下來」的人。
// 🌙 夜未眠(存玩家列·absDay)：2026-07 玩家「睡覺按鈕這裡有被夜襲判定+色色…要再切一段深夜的大戰時刻...?」。
var KANSHOU_NIGHT_SCENE_TAG_ = makeIntTag_('夜未眠', 0);

// 🙋 她主動(2026-07 玩家「泡泡用的應該也很少了…NPC 是不是就不太主動了？
var KANSHOU_INITIATIVE_DAY_TAG_ = makeIntTag_('主動日', 0);
// 📐 調校依據(2026-07 模擬 40 天實跑)：初版 BASE .006/PER_BOND .0002 打完整天會 39/40 天都有事，「每天都有」讀起來很腳本。
// 🕘 只有「她自己走來找你」這條要看時鐘：另外兩種她本來就已經在你面前，幾點都不奇怪。
// 🗑️ 2026-09 側寫節流(KANSHOU_SIDEWRITE_EVERY_/【側寫計數】)隨 master_note 一併移除。舊存檔殘留的標記是純孤兒資料，不影響任何邏輯。
// 🌙 醒著陪同標記(存該同伴列MEMORY·地點值)：剛同意同去而醒著陪同的同伴，只要人還在同一個地點沒變動就持續視為醒著——否則離開再進來的下一回合，她會被誤判成剛好躺在自己家裡熟睡，儘管全程明明醒著陪在玩家身邊互動(玩家實測「離開又進去，敘事明明醒著卻還跳賴床泡泡」)。
// 日常落點保底池排除的分區（單一真實來源）：玩家的住處只有受邀者進得來。
// 整張池子空掉時的保底落點（理論上不會發生，但這支必須永遠回得出一個地名）。
// 通用【tag】值淨化：清掉標籤分隔字元(,/:/｜/【/】)避免撐破 MEMORY 裡任何單值 tag 的格式(住所名…)，順手也清掉引號/角括號(防提示詞注入)。
function kanshouSanitizeTagValue_(value, maxLen) {
  return String(value || "").replace(/[,:｜【】"'<>\n\r\t]/g, "").trim().slice(0, maxLen || 8);
}
const KANSHOU_ALBUM_CAP_ = 100;
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
    feedTail: '這些是你們一路玩出來的既定事實，需要時原樣承接。',
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
// 🗾 大區(玩家自訂的分區，如「泰國」「海邊小鎮」)刻意【不】放進上面那張表：
//    ①那張表驅動 AI 能寫哪些 kind——大區只有玩家能開，不讓 AI 自己生一個國家出來。
//    ②那張表也驅動淘汰——大區是結構，被淘汰會讓底下的地點變孤兒，所以永不淘汰。
var KANSHOU_REGION_KIND_ = '大區';
var KANSHOU_REGION_CAP_ = 12;
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
  { key: '300', label: '300 字', words: '260~340', tokens: 1800 },
  { key: '500', label: '500 字', words: '440~560', tokens: 2200 },
  { key: '700', label: '700 字', words: '620~780', tokens: 2600 },
  { key: '900', label: '900 字', words: '820~980', tokens: 3200 }
];
function kanshouLenTier_(key) {
  return KANSHOU_LEN_TIERS_.find(t => t.key === String(key || 'auto')) || KANSHOU_LEN_TIERS_[0];
}

var KANSHOU_STYLE_MODULES_ = [
  { key: 'voice',      fixed: true, slot: 'sys',  def: '後日談敘事核心·輕小說筆觸·台灣繁體中文·第二人稱「你」＝玩家·禁上帝視角。' },
  { key: 'agency',     fixed: true, slot: 'sys',  def: '玩家的動作與台詞【只有玩家能決定】，語氣照原樣接下去(感受不在此限)·被搭話的人本回合都給出反應。' },
  { key: 'enact',      fixed: true, slot: 'sys', def: 'narration【從玩家這一步演起】，再往下接對方的反應；範圍就是玩家真的寫的那一步。' },
  { key: 'dialogue',   fixed: true, slot: 'sys',  def: '' },   // 預設走 dialogueFormatRule_()，見 kanshouStyleDefault_
  { key: 'drive',      fixed: true, slot: 'sys',  def: '系統沒有判定的那些小要求，答不答應由對方的[個性]與你們一路走來的歷史決定。' },
  { key: 'continuity', fixed: true, slot: 'sys',  def: '繼承歷史情緒與親密階；降溫只發生在被打斷/翻臉這類明確事件之後。' },
  { key: 'lewd',       name: '尺度',     hint: '情慾場面寫多開——哪些東西要真的出現在畫面上。', slot: 'sys', def: '情慾場面放到最色、寫滿寫透：器官用本名，體液、聲音、氣味、溫度全部照實寫，身體的反應寫具體。' },
  { key: 'immersion',  fixed: true, slot: 'sys',  def: 'narration 只寫這個世界裡看得到聽得到的；任何系統數值留在系統裡。' },
  { key: 'world',      fixed: true, slot: 'user', def: '★世界觀＝和平的現代冬木市，大家都是住在這裡的普通市民，沒有魔術與從者。' },
  { key: 'pov',        fixed: true, slot: 'user', def: '★【視角鎖定】：「你」＝玩家『{玩家}』本人·旁白一律用「你」稱呼玩家，「我」留給角色引號內的台詞。同伴外貌只取材各人自己那份資料。' },
  { key: 'feel',       fixed: true, slot: 'user', def: '★【你也是這座城裡的一個人】：旁白從『{玩家}』的感官與情緒寫起，性格底色見【玩家資料·旁白用】。{代名詞}感覺得到自己的體溫與心跳，看得到自己的手，看不到自己的臉。' },
  { key: 'lenTier',    name: '篇幅',     hint: '一回合寫多長。自動＝依關係深淺與這回合有沒有大事自己調。', slot: 'none', kind: 'pick', def: 'auto' },
  { key: 'length',     fixed: true, slot: 'user', def: '★【篇幅】：narration 寫 {篇幅} 字，下限是硬底線。' },
  { key: 'ending',     fixed: true, slot: 'user', def: '🚨【收尾】：最後一句留給被搭話的人，停在等玩家回應的那一刻。沒有別人在場才收在「你」身上。' }
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
function actionSetBond(userData, pcId, sheets) {
  const want = Math.max(0, Math.min(100, parseInt(userData.bond) || 0));
  const name = String(userData.npcName || userData.target || "").trim();
  const npcId = String(userData.npcId || "").trim();
  const isK = String(pcId || "").indexOf("KPC_") === 0;
  if (isK) return JSON.stringify({ success: false, message: "後日談沒有好感這個數字。" });
  const sh = sheets.pc;
  const data = sh.getDataRange().getValues();
  const meIdx = data.findIndex(r => String(r[COL.PC.ID]) === String(pcId));
  if (meIdx < 0) return JSON.stringify({ success: false, message: "找不到你的角色" });
  const gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  // 🪪 id 優先、名字只當備援——而且備援要比【洗過的】名字：sanitizeUserData_ 會把姓名欄的「·」剝掉，
  //    直接比字面的話「阿爾托莉雅·潘德拉貢」永遠對不上（同款坑見 CODE_NOTES 的長名同伴那條）。
  const _clean = v => (typeof cleanChineseName === 'function' ? cleanChineseName(String(v || "")) : String(v || ""));
  const wantName = _clean(name);
  // ⚠ npcName 進 dispatcher 時已被 cleanChineseName 洗過（Router_Action 的 CHINESE_NAME_FIELDS），
  //    純拉丁真名（SABER／EMIYA…）會被洗成空字串——這時只有 npcId 認得出人，講明比靜靜找不到好。
  if (!npcId && !wantName && !name) return JSON.stringify({ success: false, message: "少了指名的對象。" });
  const idx = data.findIndex((r, i) => i > 0 && i !== meIdx && String(r[COL.PC.GAME_ID] || "") === gid
    && !String(r[COL.PC.ID]).startsWith("DEAD_")
    && (npcId ? String(r[COL.PC.ID]) === npcId
              : (String(r[COL.PC.NAME]) === name || (!!wantName && _clean(r[COL.PC.NAME]) === wantName))));
  if (idx < 0) return JSON.stringify({ success: false, message: "找不到這個人。" });
  data[idx][COL.PC.BOND] = want;
  const got = parseInt(data[idx][COL.PC.BOND]) || 0;
  sh.getRange(idx + 1, 1, 1, data[idx].length).setValues([data[idx]]);
  return JSON.stringify({ success: true, name: String(data[idx][COL.PC.NAME]), bond: got,
    tag: String(data[idx][COL.PC.REL_TAG] || "") });
}

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
    if (spec.kinds.indexOf(kind) < 0 && kind !== KANSHOU_REGION_KIND_) return;
    // ⚠ world_note 是【AI 產的】、不經過 sanitizeUserData_，所以清洗要在這裡做完：
    //    ①斷字/偽造標記字元 ②開頭的公式引導字元(寫進儲存格會被 Google Sheet 當公式執行)
    //    ——相簿的 photo_caption 當初就是為了同一件事補的，這裡不能漏。
    const _f = v => String(v || "").replace(/[<>&"'`｜【】\[\]★\r\n\t]/g, "").replace(/^[=+\-@\t\r]+/, "").trim();
    const name = _f(e.name).slice(0, 20), text = _f(e.text).slice(0, spec.textMax);
    if (!name && !text) return;
    const sex = (['男', '女', '異'].indexOf(String(e.sex || "").trim()) >= 0) ? String(e.sex).trim() : "";
    // 📍 at＝這條長在哪個地方（農場、雞、店裡的常客…）。只收這一局真的存在的地名，
    //    AI 隨手寫個不存在的地方就當它沒填——不然那條會永遠餵不回來。
    const atRaw = _f(e.at).slice(0, 24);
    const at = (atRaw && atRaw !== '無' && kanshouFindLoc_(gid, atRaw)) ? atRaw : "";
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
function worldFeed_(gameId, rows, curLoc, presentNames, userMsg, curDay) {
  if (!Array.isArray(rows) || !rows.length) return "";
  const spec = worldSpec_(gameId);
  const loc = String(curLoc || ""), msg = String(userMsg || "");
  const names = (presentNames || []).map(n => String(n || "").trim()).filter(Boolean);
  const day = parseInt(curDay) || 0;
  // 📍 這個地方上的東西一律餵回來，不看分數也不占那 6 個名額——玩家回到 A 村莊，
  //    他的農場和雞就該還在。這是「世界會留下痕跡」真正兌現的地方。
  const rooted = loc ? rows.filter(r => r.kind !== KANSHOU_REGION_KIND_ && String(r.at || "").trim() === loc)
    .sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.seen - a.seen).slice(0, spec.atMax) : [];
  const rootedKeys = rooted.map(r => r.kind + '｜' + r.name);
  // 地點不餵回(它的脈絡由★【地點釘死】那行給)；大區是結構、不是要敘述的事實。
  // 📍 有根的條目在【別的地方】不餵回——你的農場不會跟著你走到別的城鎮；
  //    但玩家自己講到它的時候要認得，所以問到名字仍然放行。
  const scored = rows.filter(r => r.kind !== '地點' && r.kind !== KANSHOU_REGION_KIND_
    && rootedKeys.indexOf(r.kind + '｜' + r.name) < 0
    && (!String(r.at || "").trim() || (msg && msg.indexOf(r.name) >= 0))).map(r => {
    const hay = r.name + '｜' + r.text;
    let sc = 0;
    if (r.pin) sc += 100;
    if (loc && (hay.indexOf(loc) >= 0)) sc += 40;
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
const KANSHOU_HAIR_COLORS_ = [
  ['深紫', '#4a3a5e'], ['紫', '#7a5a9a'], ['金', '#e8c86a'], ['白髮', '#e8e4ea'], ['銀', '#d8d8e0'],
  ['黑', '#241f2e'], ['紅褐', '#8a4a34'], ['栗色', '#8a5a3a'], ['褐', '#6a4a34'], ['棕', '#6a4a34'],
  ['藍', '#4a6a9a'], ['粉', '#d88aa8'], ['青綠', '#5a9a8a'], ['綠', '#5a8a6a'], ['紅', '#b04a3a'], ['橙', '#c87a3a']
];
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
function kanshouCasualOf_(hero) { return (hero && (KANSHOU_CASUAL_NAME_[String(hero.id)] || hero.realName)) || ""; }
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


function actionPlay_(userData, pcId, sheets) {
  const userMsg = String(userData.message || "").replace(/[｜【】]/g, ""); // 📅 endDay 呼叫不一定會帶 message，防呆避免下方 .includes 炸掉

  if (String(pcId || "").indexOf("KPC_") !== 0) return JSON.stringify({ text: "此功能僅限鑑賞使用。", people: [] });
  const driveOn = (userData.drive === true || String(userData.drive) === "true");

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
  let kanshouNewPlaceStr = "";
  const _newPlaceRaw = String(userData.newPlace || "").replace(/[<>&"'`｜【】\[\]★\r\n\t]/g, "").trim().slice(0, 16);
  if (_newPlaceRaw && !userData.moveTarget) {
    if (kanshouFindLoc_(_myGid_, _newPlaceRaw)) {
      userData.moveTarget = _newPlaceRaw;               // 其實已經存在 → 當成一般移動
    } else {
      // 🗾 玩家可以指定這個新地方在哪一區(自訂大區或內建區，如把它開在「家」裡＝家中新空間)，
      //    也可以一併宣告「這是我開的店」——三個需求同一條路徑，見 CODE_NOTES.md。
      const _npRegion = kanshouFindRegion_(_myGid_, userData.newPlaceRegion);
      const _npOwn = kanshouSanitizeTagValue_(userData.newPlaceOwn, 12);
      worldWrite_(_myGid_, [{
        kind: '地點', name: _newPlaceRaw, text: "",
        region: _npRegion ? _npRegion.id : "", own: _npOwn
      }], curDay);
      userData.moveTarget = _newPlaceRaw;
      const _npWhere = _npRegion ? `它在「${_npRegion.name}」${_npRegion.desc ? `（${_npRegion.desc}）` : ""}。` : "";
      kanshouNewPlaceStr = _npOwn
        ? `\n★【你的店今天開張】：「${_newPlaceRaw}」是玩家【自己開的】${_npOwn}，今天第一天。${_npWhere}店裡長什麼樣、招牌什麼味道、客人怎麼上門，由你當場決定並寫出來——玩家是這裡的主人，不是客人。★決定好之後【務必】用 world_note 記一條 {kind:"地點", name:"${_newPlaceRaw}", text:"一句話的樣貌"}。`
        : `\n★【第一次來到這裡】：「${_newPlaceRaw}」這個地方，玩家今天才第一次走進來——${_npWhere}它長什麼樣、有什麼聲音氣味、平常是誰在這裡，由你當場決定並寫出來。★決定好之後【務必】用 world_note 記一條 {kind:"地點", name:"${_newPlaceRaw}", text:"一句話的樣貌"}，這樣它才會永遠留在這座城裡。`;
    }
  }
  const moveTarget = kanshouFindLoc_(_myGid_, userData.moveTarget);
  const moveName = moveTarget ? moveTarget.name : "";
  let finalUserMsg = moveTarget
        ? `【玩家意圖】：走向了「${moveName}」。`
        : `【玩家原話】：${userMsg}`;  // ⚠ 玩家自己打的字≠GAS 寫的意圖摘要，標籤不同源（見 CODE_NOTES）

  const dirtyPcRows = new Set();
  dirtyPcRows.add(pcIndex); // 玩家本人一定會被處理到，先加進去
  let _pendingNewPcRow_ = null;

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

  // ⏳ 這回合是否發生「時間跳躍」——單一真實來源。
  const kanshouTimeJumped_ = !!(userData.endDay === true || userData.jumpBand || (parseFloat(userData.advanceHours) || 0) > 0);

  // 🎭 情境氛圍(2026-07 玩家「橋段太過生硬」根治改版)：舊版是「跳按鈕→玩家點→GAS骰走向→AI照劇本演」的四段式 apparatus，選單感重、且同好感區間每次演出雷同(branches[].tag 是寫死的劇本)。
  const kanshouSceneLoc_ = moveTarget ? moveName : curL;
  let _reHourAfter = curHour;
  if (userData.endDay === true) _reHourAfter = 6;
  else if (userData.jumpBand) { const _rb = KANSHOU_TIME_BANDS_.find(b => b.key === String(userData.jumpBand)); if (_rb) _reHourAfter = _rb.startHour; }
  else if (parseFloat(userData.advanceHours) > 0) _reHourAfter = ((curHour + parseFloat(userData.advanceHours)) % 24 + 24) % 24;
  else if (curHour < KANSHOU_DAY_LAST_HOUR_ && _paceHour_ > 0) _reHourAfter = Math.min(KANSHOU_DAY_LAST_HOUR_, curHour + _paceHour_);
  const kanshouReBand_ = timeBand_(_reHourAfter);

  // 結束一天：忽略玩家打的文字，改用系統組好的合成訊息——複用actionPlay整條既有敘事管線(在場驗證/NSFW規則/intimacy_feedback全部照常跑)，不另開一條平行路徑。

  let intimateNightNames = [];
  // 🌙 昨夜道別(2026-07 玩家實測「好感沒80，牽手睡覺 NPC 會自己回家？
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
  // ⏰ 時間隨動作流動：一般 AI 敘事回合(非結束一天/非時段跳躍)每次推進 kanshouHourPerAction_(memory) 小時(玩家自選流速)，讓聊天/移動/拍照/橋段等按鍵都會讓時鐘往前走，消除「到處跑卻永遠6點」的凍結感。
  // 📱 拍照不算時間（2026-09）：真的用手機拍是一秒鐘的事，玩家常「拍一張、再拍一張」，每張走掉半小時下午就沒了。
  if (!kanshouClockMoved_ && curHour < KANSHOU_DAY_LAST_HOUR_ && _paceHour_ > 0) {
    curHour = Math.min(KANSHOU_DAY_LAST_HOUR_, curHour + _paceHour_);
    pcData[pcIndex][COL.PC.HOUR] = curHour;
    dirtyPcRows.add(pcIndex);
  }
  // 供下方🕰️提示詞用，只算一次不重複呼叫。★讀敘事時鐘而非狀態時鐘——兩者只有 endDay 會不同。
  const _narrDay_ = (kanshouNarrDay_ === null) ? curDay : kanshouNarrDay_;
  const _narrHour_ = (kanshouNarrHour_ === null) ? curHour : kanshouNarrHour_;
  const curDateObj_ = kanshouAbsDayToDate_(_narrDay_);

  // 合法地點時才寫入 LOC。
  // 🗑️ 2026-09「氛圍靈感」種子池(KANSHOU_EVENT_SEEDS_)已移除：那是三類各七句的預寫小事件，
  //    20% 機率抽一句丟給 AI 當靈感。抽中什麼跟此刻的人、地、時、你們的歷史全都無關——
  //    真正該當靈感的東西，AI 手上本來就有(在場者的個性、天氣、時段、世界帳本)。
  if (moveTarget) {
    curL = moveName;
    pcData[pcIndex][COL.PC.LOC] = curL;
    dirtyPcRows.add(pcIndex);
  }


  function relMemMemoryStr_(relMem) {
    const s = String(relMem || "");
    const nickMatch = s.match(/\[專屬稱呼\](.*?)(?=\| \[|$)/);
    const nickTrim = nickMatch ? nickMatch[1].trim() : "";
    const nickStr = (nickTrim && nickTrim !== "無") ? ` [專屬稱呼:${nickTrim}]` : "";
    // 態度：NPC對御主當下的臨場態度(與好感分開追蹤，見慾海律令第5條)，讓AI下筆前看得到自己上一輪演的態度，不會忽冷忽熱亂跳。
    return nickStr;
  }

  // 「開放世界·背景人煙」設計：路人可自由描寫增添生活感，但不具名、不能被指名互動；真正能被指名、會被記錄的對象只有【在場人物】（＝上方的同行名單）。
  // 🗺️ LOC 只是「這一幕在哪」的衍生值：同行者跟著你走，地圖那些讀 LOC 的地方才不會各說各話。
  partyRows.forEach(r => {
    const _pi = pcData.indexOf(r);
    if (_pi >= 0 && String(r[COL.PC.LOC] || "").trim() !== String(curL || "").trim()) {
      pcData[_pi][COL.PC.LOC] = curL; dirtyPcRows.add(_pi);
    }
  });


  // 🌍 世界概況(輕量版·2026-07 玩家「NPC不知道彼此存在」)：只給名字，讓 AI 答得出「認不認識某某」。
  //    2026-09 拆掉位置模擬後不再報位置——「大概在哪」已經不是這個世界裡存在的事實。
  const kanshouWorldRosterStr = (() => {
    const _partyIdSet_ = partyRows.map(r => String(r[COL.PC.ID]));
    const _elsewhere = pcData.filter(r => r !== pc && kanshouIsAlly_(r, myGameId) && _partyIdSet_.indexOf(String(r[COL.PC.ID])) < 0)
      .sort((a, b) => KANSHOU_MET_COUNT_TAG_.get(b[COL.PC.MEMORY]) - KANSHOU_MET_COUNT_TAG_.get(a[COL.PC.MEMORY])).slice(0, KANSHOU_WORLD_ROSTER_CAP_);
    if (!_elsewhere.length) return "";
    // 🎯 觸發收緊(2026-07 玩家「條件式區塊的觸發條件收緊」)：這段【唯一用途】是讓 AI 能正確回答「認不認識某某」，但它原本每回合都送，等於絕大多數回合都在燒 200+字 講一件玩家沒問的事。
    const _rosterAsk = /認識|聽過|見過|知道|怎麼樣了|還好嗎/.test(userMsg)
      || _elsewhere.some(r => kanshouNameCandidates_(String(r[COL.PC.NAME] || "")).some(c => c && userMsg.indexOf(c) >= 0));
    if (!_rosterAsk) return "";
    const _list = _elsewhere.map(r => {
      const _name = String(r[COL.PC.NAME] || "");
      const _variants = /[A-Za-z]/.test(_name)
        ? [...new Set([_name.toUpperCase(), _name.charAt(0).toUpperCase() + _name.slice(1).toLowerCase(), _name.toLowerCase()])].filter(v => v !== _name)
        : [];
      return _name + (_variants.length ? `(${_variants.join('/')}也是同一人)` : '');
    }).join('、');
    return `\n★【世界概況·這座城裡認識的人】：玩家與在場的人都確實認識以下這些人，此刻各自在別處過日子：${_list}。玩家若直接問起「認不認識/聽過某某」，只要名字(不分大小寫，英文名任何大小寫寫法都算同一人)出現在這份名單裡，被問到的那個人就【確實認識、要肯定回答「是」】，可以自然帶一句對方大概是怎樣的人；名單上的名字都是同一座城裡認識的人，聽到就照認識的樣子回應；名單外的名字才是真的沒聽過，可以照實說不認識。★認識歸認識，登場仍以【在場人物】那份名單為準，這裡能做的只有口頭上確認認識這個人。`;
  })();
  partyRows.forEach(r => {
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
    .filter(n => n && partyMembers.indexOf(n) !== -1).join('、');
  // 🌙 深夜獨處(夜未眠)：只給「此刻是什麼場合」這個事實，怎麼發展全看玩家推進與她的個性。
  const kanshouNightSceneStr = (kanshouNightSceneOn_ || kanshouNightSceneNames_.length)
    ? `\n★【夜已深·門關上了】：這個房間此刻只剩你和『${(kanshouNightSceneNames_.length ? kanshouNightSceneNames_ : partyMembers).join('、')}』，外頭安靜下來，今晚不會再有別人進來，時間也不急著走。★這一段【還沒有結束】：這一夜什麼時候收，由玩家自己決定、系統會宣告；本回合只演此刻正在發生的這十分鐘，結尾一樣停在進行式、把下一步交還玩家。`
    : "";

  // 💗 關係質變：跨進新階的當下演一次。給的是「方向」不是台詞——具體怎麼表現交給 AI 依她性格拿捏。

  // 📷 拍照(takePhoto)：手機拍照·2026-07 再修（玩家「拍照要改成手機、不用等」）——手機沒有底片這種東西，只驗相簿總容量；拍完立刻存進相簿、立刻能看，不再有「隔天沖洗」的等待。
  let partyDetailsArr = [];
  const _presenceSeen_ = {};
  const _partyHeroCodex = partyMembers.length > 0 ? getHeroCodexCached() : null;
  // 🔦 聚光燈：玩家這一步點名了誰，誰才拿完整的卡；同場其他人拿短卡（名字/裝扮/現況/口吻/關係）。
  //    提示詞本來就寫著「玩家專一對著一個人時其他人背景輕描」——這是把那句話真的做出來。
  //    ⚠ 沒點名任何人就【全部都給完整卡】（維持原行為）：猜錯的代價是那個人當場失格，不值得賭。
  const _spotlight_ = userMsg
    ? partyMembers.filter(n => kanshouNameCandidates_(String(n)).some(c => c && userMsg.indexOf(c) >= 0))
    : [];
  partyMembers.forEach(pName => {
    const r = pcData.find(row => String(row[COL.PC.NAME]).trim() === String(pName).trim() && kanshouIsAlly_(row, myGameId));
    if (r) {
      const pOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👕 換裝：當前服裝穿著(換衣不換人；玩家UI設定或AI依appearance_extras更新)
      // 鑑賞無戰鬥，HP/STATUS 恆定不變(已被 physical_state 取代)，不重複注入。
      const pMemStr = relMemMemoryStr_(r[COL.PC.REL_MEM]);
      // 口吻/招牌小動作(persona.speech/tic)：召喚時已存進 MEMORY 的【口吻】【小動作】標記，直接複用 getPersonaSpeech_/getPersonaTic_ 讀取，讓角色演出招牌語癖而非千篇一律。
      const pSpeech = getPersonaSpeech_(r[COL.PC.MEMORY]) || dailySpeechByName_(pName, _partyHeroCodex);
      const pTic = getPersonaTic_(r[COL.PC.MEMORY]);
      const pFlavorStr = `${pSpeech ? ` | 口吻:${pSpeech}` : ""}${pTic ? ` | 招牌小動作:${pTic}` : ""}`;
      // 🏷️ 關係稱呼：AI 每回合依你們的歷史自己維護（intimacy_feedback.npcs[].rel_tag），
      //    玩家自己打過一次就鎖住歸玩家（【關係鎖】）。沒有值就整段不印。
      const pRelTagStr = String(r[COL.PC.REL_TAG] || "").trim();
      // 地點的「當下在做什麼」輕量引子(見上方KANSHOU_LOCATION_ACTIVITY_)，沒對照到的地點不加這句，AI自然發揮即可。
      // 🗑️ 2026-09「她在這個地點正在做什麼」的寫死變體池(KANSHOU_LOCATION_ACTIVITY_)已移除——
      //    那是 14 個地點各寫兩句的預寫橋段，同一個人同一地永遠那兩句。她此刻在做什麼，AI 依
      //    地點/時段/天氣/她的個性自己決定就好，這裡不再給答案。
      const pBackStr = (() => {
        const _b = String(r[COL.PC.BACK] || "").trim();
        if (!_b || _b === `${String(r[COL.PC.RANK] || "")}・${pName}` || /職階英靈$/.test(_b) || QUAD_EMPTY_.indexOf(_b) !== -1) return "";
        return ` | 經歷:${_b}`;
      })();
      const pMemoirRaw = String(r[COL.PC.MEMOIR] || "").trim();
      // ★是玩家釘選標記(面板用)，餵AI時去掉、不外洩機制符號。
      // 📝 你在對方眼中是什麼樣子：熟悉段(GAS 依相處次數算)＋對方這一路親自記下的幾條。
      const _pKnown = kanshouKnownOfYou_(r[COL.PC.MEMORY]);
      const pKnownStr = ` | 你在${pron_(r[COL.PC.SEX])}眼中:${_pKnown.tier}${_pKnown.noted.length ? `·${_pKnown.noted.join('、')}` : ''}`;
      const pMemoirStr = pMemoirRaw ? ` | 你們的共同回憶(你倆一路走來的點滴，敘事可自然承接呼應、但別生硬複述):${pMemoirRaw.replace(/★/g, '').replace(/｜/g, '；')}` : "";
      // 📅 待赴約定(玩家追問「AI每次都看得到約定吧?」查出的缺口)：約成立到赴約之間的等待回合，AI 原本完全不知道有這個約——聊「期待明天嗎」她會一臉茫然、甚至另約衝突計畫。
      // 明講方向的「她/他是你的${tag}」(而非單純「關係:${tag}」)，避免AI誤讀方向、演反成玩家服侍對方。
      // 🫂 在場者都是同行者，走到哪跟到哪——在場來由只剩「這一幕是怎麼開場的」。
      const pPresenceStr = (() => {
        if (moveTarget) return "【與你結伴一起來到】這裡(一路同行，此刻剛踏進這個場景)";
        if (kanshouTimeJumped_) return "時間流轉之後，【依然在你身邊】(這段空白裡各自做了什麼，順著時段自然帶過)";
        return "【你們從剛才就一直在這裡】——早已在場，接著這一刻往下寫";
      })();
      _presenceSeen_[pPresenceStr] = (_presenceSeen_[pPresenceStr] || 0) + 1;
      // 🔦 背景輕描：這一步沒被點名的人只送「此刻的情境」那幾欄，性格/特徵/經歷/共同回憶下回合被點名時再給。
      const _lit = !_spotlight_.length || _spotlight_.indexOf(pName) >= 0;
      partyDetailsArr.push(`【在場人物】名字:${pName}【性別:${String(r[COL.PC.SEX] || "").trim() || "異"}】｜__PRESENCE__${pPresenceStr}__/PRESENCE__${pOutfit ? ` | 裝扮:${pOutfit}` : ""}${_lit ? (() => { const _p = formatPref(r[COL.PC.PREF]); return _p ? ` | 性格:${_p}` : ""; })() : ""}${_lit ? (() => { const _t = formatTrait(r[COL.PC.TRAIT]); return _t ? ` | 特徵:${_t}` : ""; })() : ""}${pSpeech ? ` | 口吻:${pSpeech}` : ""}${_lit && pTic ? ` | 招牌小動作:${pTic}` : ""}${_lit ? pBackStr : ""}${_lit ? pMemoirStr : ""}${pKnownStr}${pRelTagStr ? ` | 關係:${pron_(r[COL.PC.SEX])}是你的${pRelTagStr}` : ""}${pMemStr}`);
    }
  });
  // 在場來由人人相同時（多數回合都是），抽成抬頭講一次，不在每張卡上逐字重複。
  const _presenceKeys_ = Object.keys(_presenceSeen_);
  const _presenceShared_ = (_presenceKeys_.length === 1 && partyDetailsArr.length > 1) ? _presenceKeys_[0] : "";
  const _partyCards_ = partyDetailsArr.map(t => _presenceShared_
    ? t.replace(/｜__PRESENCE__[\s\S]*?__\/PRESENCE__/, "")
    : t.replace(/｜__PRESENCE__([\s\S]*?)__\/PRESENCE__/, " | 在場來由:$1"));
  const PROMPT_PARTY_SYSTEM = partyDetailsArr.length > 0
    ? `【角色背景資料】(裝扮＝此刻穿的衣服，五官/髮色/體態不隨之改變)：${_presenceShared_ ? `\n★在場來由(以下每一位都一樣)：${_presenceShared_}` : ""}\n${_partyCards_.join("\n")}`
    : "目前這個地點沒有其他人，玩家是獨自行動的。";

  // 路人與缺席者是同一件事的兩面（誰只是背景／誰不在場），合成一條；能開口的名單在結尾講。
  const backgroundCrowdStr = "";  // 已併進下方 ★【這個世界有誰】；理由見 CODE_NOTES.md 同名條目

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
      ? `\n★【性別配對】：${sameSexF.join("、")}(女女配對)：純女女之愛，以手指/舌頭/器物進行。`
      : "";
  }

  // 🎭 玩家自己的 口吻／招牌小動作：跟【在場人物】那一行走【同一組 helper】，不另寫一套。
  //    這三格以前只有同伴有，玩家那張卡是空的——所以 AI 演得出每一個同伴，就是演不出「你」。
  const _mePron_ = pron_(pc[COL.PC.SEX]);   // 御主性別是資料(可隨時切換)，代名詞不可寫死
  const _meSpeech_ = getPersonaSpeech_(pc[COL.PC.MEMORY]);
  const _meTic_ = getPersonaTic_(pc[COL.PC.MEMORY]);
  const _meFlavorStr_ = `${_meSpeech_ ? ` | 口吻:${_meSpeech_}` : ""}${_meTic_ ? ` | 招牌小動作:${_meTic_}` : ""}`;

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



  // 📏 篇幅（auto 檔）：2026-09 好感砍除後不再有「關係越深寫越長」這條，就一組數字。
  //    ⚠ 一律給【下限~上限】而不是「約 X 字」：小模型對「約」一律往下取，實測過(見 KANSHOU_REFERENCE)。
  //    ⚠ 上限必須跟 max_tokens 一起看：JSON 固定開銷典型 757 字、欄位全滿 1057 字，narration 超出去就會被截斷成壞 JSON。
  const KANSHOU_WORDS_ = { range: '400~520', big: '600~750' };
  // 「大事」不靠猜——這些區塊本回合有沒有組出字串，GAS 自己最清楚。加新橋段就往這串加一個旗標。
  const _kanshouBigBeat_ = !!(kanshouNightSceneStr || driveOn);
  const _kanshouWordRow_ = KANSHOU_WORDS_;
  // 🎨 玩家版說書人風格（缺列＝預設，預設＝原本寫死的那句）。讀口排在篇幅之前——篇幅檔位要吃它。
  const _styles_ = kanshouStyleRead_(_myGid_);
  // 玩家在「⚙ 說書人設定」選了檔位就蓋掉上面那張自動表；auto 維持原本依好感/大事的行為。
  const _lenTier_ = kanshouLenTier_((_styles_['lenTier'] || {}).text);
  const _kanshouTargetWords_ = _lenTier_.words || (_kanshouBigBeat_ ? _kanshouWordRow_.big : _kanshouWordRow_.range);

  const driveStr = driveOn ? `
🔥【主動掌握】：尺度一律以【親密尺度五階】為準。在那個範圍內，對方依自己的個性【主動出擊】，色度可以走在玩家前面。` : '';

  const PROMPT_REL = `${backgroundCrowdStr}
${nsfwMemories}${genderHintStr}${driveStr}
🛑【角色一致性】：情慾裡生理反應可以有，說話做事仍照各自的個性。
🛑【誰說了算】：標【成立】的，都是系統已經判好的結果，照著演；怎麼表現才依那個人的個性。`;

  // 有【專屬稱呼】就用暱稱取代真名；JSON 姓名欄不受影響、仍填真名。
  const npcDialoguePrompt = "";  // 名單/稱呼併入結尾的【在場名單】鐵律，見下方 prompt


  // 剛換場景/剛跳時間就砍短 chatHistory；摘要與 chatHistory 共用這個窗口值，不各算各的。
  const _sceneCut = !!(moveTarget || kanshouTimeJumped_);
  const _histWindow_ = _sceneCut ? 2 : 6;
  const _earlierDigest_ = kanshouRecentDigest_(pcId, _histWindow_);
  // 🌍 世界帳本：讀出這一局玩出來的地方/人/設定，只餵跟此刻真的有關的那幾條(見 worldFeed_)。
  const _worldRows_ = worldRead_(myGameId);
  const _worldFeed_ = worldFeed_(myGameId, _worldRows_, curL, partyMembers, userMsg, curDay);


  // 🧊 排序原則：【穩定的放前面、每回合會變的放後面】——prompt cache 是逐 token 比對前綴，
  //    一個會變的東西插在中間，它後面全部作廢。天氣/時間原本卡在第 5 行，把整份 user prompt
  //    的可快取前綴砍到只剩 48%。唯二的例外是 🚨【收尾】與★【在場名單】：它們雖然穩定，但
  //    recency 對它們特別重要（實測過「事實寫在 20 行以前就會被 AI 當成沒發生」），故仍壓在最後。
  const _styleVars_ = { '玩家': pcName, '代名詞': _mePron_, '篇幅': _kanshouTargetWords_ };
  const _sty_ = k => kanshouStyle_(_styles_, k, _styleVars_);
  const prompt = `${_sty_('world')}
${PROMPT_REL}
★【這個世界有誰】：①【同行】＝下方【在場人物】的卡，他們此刻【確實就在你身邊】，每一位這回合都要真實回應——被搭話的給完整反應，沒被搭話的也要有自己的動作；有【專屬稱呼】就叫暱稱。②【常民】＝【這個世界已經確立的事】名單上的人，可出現可開口。③【路人】不具名，隨手寫。
★【要它之後還在就寫進 world_note】：沒寫到的地方/人/這座城的規矩都可以當場創造，寫進去的下回合才存在。一回合最多 ${WORLD_SPEC_.kanshou.writeMax} 筆，只記【這座城有什麼】——地點＝多一個去得了的地方｜人物＝這個人還會再出現｜設定＝這座城的規矩或風景；你們之間發生的事記進那個人的 memory。★蓋在某個地方、養在某個地方、只長在那裡的東西（田、雞、招牌、常客），at 欄填那個地名——玩家再回到那裡它就還在。
${_sty_('pov')}
${_sty_('feel')}

【玩家資料·旁白用】(只給旁白寫「你」的內心用·在場的人沒讀過這張卡)：名字:${pcName} 【性別:${pc[COL.PC.SEX]}】${(() => { const _p = formatPref(pc[COL.PC.PREF]); return _p ? ` 性格:${_p}` : ""; })()}${(() => { const _t = formatTrait(pc[COL.PC.TRAIT]); return _t ? ` | 特徵:${_t}` : ""; })()}${_meFlavorStr_}${myOutfit ? ` | 裝扮:${myOutfit}` : ""} | 經歷:${pc[COL.PC.BACK] || "剛搬來冬木市"}
${PROMPT_PARTY_SYSTEM}
${_sty_('length')}
★★【地點釘死】：此刻在「${kanshouLocNameForAI_(curL)}」${(() => { const _c = kanshouLocContextForAI_(curL, getKanshouHomeName_(pc[COL.PC.MEMORY], pcName), _myGid_); return _c ? `（${_c}）` : ""; })()}，敘事不離開這裡——想去別處只能嘴上聊，真要換地方由系統宣告。${moveTarget ? '你們剛到，直接從抵達後的當下寫起、路程不演。' : ''}
${kanshouNewPlaceStr}${_worldFeed_}${kanshouWorldRosterStr}${kanshouNightSceneStr}
★【此刻】${curDateObj_.year}年${curDateObj_.month}月${curDateObj_.day}日・${kanshouFmtHM_(_narrHour_)}・${timeBand_(_narrHour_)}(揣摩氛圍用·不報時)。★本回合只寫這十分鐘內的片段，時間推進由系統宣告。${intimateNightNames.length ? `\n★【今晚留下的人】：『${intimateNightNames.join('、')}』今晚就在這個房間裡過夜——這一夜怎麼過，依各人的個性與你們之間的歷史決定。` : ""}${_morningHere_ ? `\n★【晨間餘韻·非強制】：昨夜與『${_morningHere_}』或許共度親密(依上回合實際內容·沒跨出就當平常早晨)·可自然帶晨間溫馨曖昧·不強制不複述細節。` : ""}

${npcDialoguePrompt}${_earlierDigest_ ? `\n★【稍早做過的事】：${_earlierDigest_}——都已發生過，需要時自然呼應，別重演。` : ""}
${_sty_('ending')}
${partyMembers.length ? '' : '★【在場】：沒有同伴在場（常民與路人照常可以出現）。'}

接著往下演，玩家這一步是：『${finalUserMsg}』`;

  try {
    // 兩軌共用 AI_MODEL；被擋才自動換 FALLBACK_MODEL（Engine_Combat.gs 全域行為）。driveOn 只控敘事推進幅度、不換模型。
    const _timeJump = kanshouTimeJumped_;
    let aiConfig = { temperature: 1.08, top_p: 0.97, top_k: 60, repetition_penalty: 1.12, presence_penalty: 0.25, frequency_penalty: 0.25, retries: 1, model: LEWD_MODEL, isNsfwMode: true, max_tokens: (_timeJump && partyRows.length === 0) ? 700 : (_lenTier_.tokens || 2400) };

    // 抓取近 6 筆原始歷史(3輪)，轉換為 API 格式。
    const recentHistoryRaw = getGameHistoryBatchRaw(pcId, _histWindow_);
    if (recentHistoryRaw && recentHistoryRaw.length > 0) {
      aiConfig.chatHistory = recentHistoryRaw.map(msg => ({
        role: msg.speaker === "player" ? "user" : "assistant",
        content: String(msg.content)
      }));
    }

    const _sysPrompt = buildDefaultSystemPrompt(userData.optionsOn !== false, _styles_);
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





    // 🚶‍♀️ 同伴自主離場(npc_exit)：AI 說某人這回合告辭了，就真的把他移出同行名單——下回合不在場，
    //    解掉「嘴上說走卻還在場」的違和。玩家想要他回來，面板上再按一次＋同行。
    {
      const exitList = Array.isArray(aiData.npc_exit) ? aiData.npc_exit : [];
      if (exitList.length) {
        let _pIds = kanshouGetParty_(pcData[pcIndex][COL.PC.MEMORY]);
        const _before = _pIds.length;
        exitList.forEach(nm => {
          const exitName = String(nm || "").trim();
          if (!exitName) return;
          const eRow = partyRows.find(r => kanshouNameCandidates_(String(r[COL.PC.NAME])).includes(exitName));
          if (eRow) _pIds = _pIds.filter(id => id !== String(eRow[COL.PC.ID]));
        });
        if (_pIds.length !== _before) {
          pcData[pcIndex][COL.PC.MEMORY] = kanshouSetParty_(pcData[pcIndex][COL.PC.MEMORY], _pIds);
          dirtyPcRows.add(pcIndex);
        }
      }
    }

    // 鑑賞無戰鬥：血量快照/stat_changes(外顯狀態刷新)/經濟層(物品/金錢/任務)皆不追蹤、不落地。

    {
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
          if (String(pcData[targetIdx][COL.PC.LOC] || "").trim() !== String(curL || "").trim()) return;

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

          // 🏷️ 關係稱呼：2026-09 交給 AI——它讀過你們每一回合，比一個數字更知道你們現在是什麼。
          //    ⚠ 這一格會被原樣塞進提示詞當既定事實(「她是你的○○」)，等於 AI 餵自己，所以只收
          //    【真的有變】的回合，並走跟專屬稱呼同一個消毒口。玩家自己打過一次就鎖住，從此歸玩家。
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
              kanshouAppendUnique_(KANSHOU_NOTED_TAG_.get(pcData[targetIdx][COL.PC.MEMORY]), nfb.noticed,
                { sep: KANSHOU_NOTED_SEP_, cap: KANSHOU_NOTED_CAP_, maxLen: KANSHOU_NOTED_LEN_ }));
          }
        });
      }
    }

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


