// ==========================================
// 🏆 Gallery.gs — 鑑賞（慾海後日談）整軌：召喚／進場／同行／世界帳本／說書人風格／actionPlay_ 全在這裡。
//   只跟 solo 共用 callGeminiAPI（Engine_Combat.gs）。現況見 KANSHOU_REFERENCE.md，為什麼這樣寫見 CODE_NOTES.md。
// ==========================================

// AI 回傳落盤前的結構防線：options 剝鷹架＋限 6 條、world_note 只留白名單四欄、cast 只收兩個字串陣列、narration 濾掉抄進去的 ★ 指令。
function sanitizeAiData_(aiData, gameId) {
  if (!aiData || typeof aiData !== "object" || Array.isArray(aiData)) {
    throw new Error("AI 回傳結構異常（非物件），已攔截避免污染資料。");
  }
  const clampInt = (v, lo, hi, dflt) => {
    const n = parseInt(v);
    if (isNaN(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  };
  // options 原樣變按鈕文字：剝掉編號與【分類】鷹架，那是給 AI 的，玩家不該看到。
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
  // world_note 只擋結構（類別、筆數、白名單四欄）；字元清洗在唯一寫入點 worldWrite_。
  if (aiData.world_note !== undefined) {
    aiData.world_note = (Array.isArray(aiData.world_note) ? aiData.world_note : [])
      .filter(w => w && typeof w === 'object' && worldSpec_(gameId).kinds.indexOf(String(w.kind || "").trim()) >= 0)
      .slice(0, worldSpec_(gameId).writeMax)
      .map(w => ({ kind: w.kind, name: w.name, text: w.text, sex: w.sex }));
  }
  // cast 只擋形狀；是不是這一局的人、同行者豁免、在場上限，在 actionPlay_ 裁定。
  if (aiData.cast !== undefined) {
    const _arr = v => (Array.isArray(v) ? v : []).filter(x => typeof x === 'string' && x.trim())
      .slice(0, 6).map(x => x.trim().slice(0, 20));
    aiData.cast = (aiData.cast && typeof aiData.cast === 'object' && !Array.isArray(aiData.cast))
      ? { join: _arr(aiData.cast.join), leave: _arr(aiData.cast.leave) } : { join: [], leave: [] };
  }
  // 先把換行轉成 <br> 再濾 ★ 指令：濾網掃到下一個「<」為止，沒有 <br> 會把整段吃光。
  if (typeof aiData.narration === 'string') {
    aiData.narration = stripLeakedScaffold_(aiData.narration.replace(/\n/g, "<br>"));
  }
  return aiData;
}

// 帳號 ↔ 鑑賞 avatar 的連結存「帳號」表（只有伺服器碼能寫，角色列自稱不算數）。
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

// 帳號目前連結的鑑賞 avatar pcId（查無回 ""）。
function getAccountKanshouPcId_(accountName) {
  var name = String(accountName || "").trim();
  if (!name) return "";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var acc = ss.getSheetByName("帳號");
  if (!acc) return "";
  var found = findAccountRow_(acc, name);
  return found ? String(found.row[COL.ACC.KPC] || "") : "";
}

// pcId → 列索引（查無回 -1）。歸屬驗證走帳號表，不在這裡。
function kanshouPcIdx_(data, pcId) {
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.ID]) === String(pcId)) return i;
  }
  return -1;
}

// 「正式同伴」的唯一定義：這一局、faction=從者。DEAD_ 在鑑賞永遠不會出現，這裡是唯一留著的防呆。
function kanshouIsAlly_(row, gameId) {
  if (!row) return false;
  if (String(row[COL.PC.FACTION]) !== "從者") return false;
  if (gameId && String(row[COL.PC.GAME_ID] || "") !== String(gameId)) return false;
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

// 兩支日常化轉譯（工房原創英靈用）共用的系統提示詞開場白。
const KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_ = "你是《命運停駐之夜》的角色側寫顧問。★【語言】所有輸出內容一律用中文字（JSON 欄位名本身除外）。";
// try/callGeminiAPI/catch 的共用殼：resultMapper 把 raw 轉成結果，任何一步拋錯就回 fallbackValue。
function kanshouDailyTranslateCall_(prompt, sys, apiOpts, resultMapper, fallbackValue) {
  try {
    return resultMapper(callGeminiAPI(prompt, sys, apiOpts));
  } catch (e) { return fallbackValue; }
}

// 戰時外貌 → 日常外貌＋穿搭（本相不變、戰甲換便服）。工房建檔時一次性，失敗退回原文。
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

// 英靈殿列的日常三格；沒手寫就退回戰時版（・換成、才切得成四格）。
function getDailyHeroFields_(heroRow, p) {
  var existingLook = String(heroRow[COL.HERO.DAILY_LOOK] || "").trim();
  var existingWords = String(heroRow[COL.HERO.DAILY_WORDS] || "").trim();
  var existingOutfit = String(heroRow[COL.HERO.DAILY_OUTFIT] || "").trim();
  var rawLook = String(p.look || "").replace(/・/g, "、");
  var rawWords = String(p.words || "").replace(/・/g, "、");
  return { look: existingLook || rawLook, words: existingWords || rawWords, outfit: existingOutfit };
}

// 英靈殿一列 → 鑑賞同伴一列。無戰鬥資料；關係兩格刻意留空（起始快照＝把某一刻當永久設定）。
function heroToKanshouRow_(heroRow, gameId, loc) {
  var pcColCount = Object.keys(COL.PC).length;
  var name = String(heroRow[COL.HERO.NAME] || "從者");
  var p = {}; try { p = JSON.parse(heroRow[COL.HERO.PERSONA] || "{}"); } catch (e) { }
  var sex = String(heroRow[COL.HERO.SEX] || "異") || "異";
  var sRow = Array(pcColCount).fill("");
  sRow[COL.PC.ID] = "KHV_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  sRow[COL.PC.NAME] = KANSHOU_CASUAL_NAME_[String(heroRow[COL.HERO.ID])] || name;
  sRow[COL.PC.SEX] = sex;
  sRow[COL.PC.LOC] = loc;
  sRow[COL.PC.FACTION] = "從者";
  sRow[COL.PC.RANK] = String(heroRow[COL.HERO.CLS] || "從者");
  var daily = getDailyHeroFields_(heroRow, p);
  sRow[COL.PC.PREF] = parseTraitsHelper(daily.words, "沉著表象、堅定內裡、珍視之物、厭惡之事");
  var dailyLookParts = String(daily.look || "").split('、').map(function (s) { return s.trim(); }).filter(Boolean);
  var traitSrc = dailyLookParts.length >= DAILY_LOOK_SLOTS_ ? dailyLookParts.slice(0, DAILY_LOOK_SLOTS_).join('、') : looksToTraitParts_(daily.look);
  sRow[COL.PC.TRAIT] = parseTraitsHelper(traitSrc, "外貌出眾、舉止從容", TRAIT_SLOTS_);
  // 經歷留空：種子的「在這座城裡是誰」2026-09-23 退休（玩家「都是多餘的」），這格只給玩家自己改命用。
  sRow[COL.PC.BACK] = "";
  // 只帶準則；小動作是 solo 演出卡的東西，鑑賞的在場卡從來不讀，寫進來只是死資料。
  sRow[COL.PC.MEMORY] = setOutfit_(stampPersonaFlavor_("", "", p.logic || ""), daily.outfit || "日常便服");
  // 【英靈源】＝來自哪一筆種子；撞名守門靠它，不靠顯示名。
  sRow[COL.PC.MEMORY] = KANSHOU_SRC_TAG_.set(sRow[COL.PC.MEMORY], String(heroRow[COL.HERO.ID] || ""));
  sRow[COL.PC.GAME_ID] = gameId;
  sRow[COL.PC.BOND] = 0;
  sRow[COL.PC.REL_TAG] = "";
  sRow[COL.PC.REL_MEM] = kanshouRelMemBuild_("無", {});
  return sRow;
}

// ══ 她眼中的你：在場者對玩家的認識【不是全知】。熟悉度 GAS 自己算、不經過 AI（拆法見 CODE_NOTES）══
var KANSHOU_NOTED_TAG_ = makeTextTag_('眼中的你');
const KANSHOU_NOTED_SEP_ = '／';   // 不可用 ｜ 或 【】：makeTextTag_ 會把結構字元從值裡剝掉
const KANSHOU_NOTED_CAP_ = 3;
const KANSHOU_NOTED_LEN_ = 14;
// 相處次數（同伴列）：唯一還在累積的關係軸。只答「見過幾次」，「多喜歡你」交給 AI 從歷史判斷。
var KANSHOU_MET_COUNT_TAG_ = makeIntTag_('相處', 0);
// 相處次數 → 階名（面板用）。min 單位＝同場回合（12≈2 小時、50≈8 小時）。
//   舊版每階還帶一句「物理距離」送進卡片，2026-09-23 玩家「真的不會寫就不要了」——整組拿掉，多熟交給 AI 從歷史判斷。
const KANSHOU_FAMILIAR_TIERS_ = [
  { min: 50, key: '老交情' },
  { min: 30, key: '熟稔' },
  { min: 12, key: '混熟' },
  { min: 0, key: '初識' }
];
// 相處次數 → 表上那一階；查不到退回表尾，不另寫死。
function kanshouKnownTier_(metCount, field) {
  var _t = KANSHOU_FAMILIAR_TIERS_;
  var t = _t.find(function (x) { return (parseInt(metCount) || 0) >= x.min; }) || _t[_t.length - 1];
  return t[field || 'key'];
}
// 「我在對方眼中」：對方記下的幾條。
function kanshouKnownOfYou_(memory) {
  var noted = String(KANSHOU_NOTED_TAG_.get(memory) || '').split(KANSHOU_NOTED_SEP_).map(function (x) { return x.trim(); }).filter(Boolean);
  return { noted: noted };
}

// 剝掉 永遠／總是／每次 這類副詞：會餵回提示詞的記憶帶著它們，就從觀察變成每回合的指令。
function stripStanding_(str) {
  return String(str || "").replace(/(永遠|總是|老是|一律|每次|每天|從不|不停)/g, "").trim();
}
// append→去重→上限 的唯一引擎（共同回憶與「她眼中的你」共用）。opt: { sep, cap, maxLen, pin }
function kanshouAppendUnique_(oldStr, newLine, opt) {
  const o = opt || {};
  const sep = o.sep || '｜';
  const cap = parseInt(o.cap) || 10;
  const maxLen = parseInt(o.maxLen) || 40;
  const reBad = new RegExp('[｜|【】\\[\\]★' + sep + ']', 'g');
  let arr = String(oldStr || "").split(sep).map(x => x.trim()).filter(x => x !== "" && x !== "無");
  let clean = String(newLine || "").replace(reBad, "").trim().slice(0, maxLen);
  // bigram 近義去重：同一件事換句話說會重記一條（只比最近 3 條）。
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
// REL_MEM 裡的【專屬稱呼】裸值（沒有／「無」→ ""）。組提示詞那段走 relMemMemoryStr_，同源。
function getNickname_(relMem) {
  const m = String(relMem || "").match(/\[專屬稱呼\](.*?)(?=\| \[|$)/);
  const raw = m ? m[1].trim() : "";
  return (raw && raw !== "無") ? raw : "";
}
// 專屬稱呼／關係稱呼寫入前的唯一消毒口（這兩格能偽造欄位）。
function sanitizeNickname_(s) {
  return String(s || "").trim().replace(/[|｜\[\]]/g, "").slice(0, 20);
}
// 玩家自己打過的那格就上鎖、AI 從此不碰；鎖只有玩家的 UI 動作會蓋。
const KANSHOU_LOCKS_ = { nick: '稱呼鎖', tag: '關係鎖' };
function kanshouRelLocked_(relMem, which) {
  return new RegExp('\\[' + KANSHOU_LOCKS_[which] + '\\]是').test(String(relMem || ""));
}
// REL_MEM 的唯一組裝口：稱呼本體 ＋ 還在的鎖。少接一把，下一回合就被整格洗掉。
function kanshouRelMemBuild_(nickValue, locks) {
  let out = `[專屬稱呼]${nickValue || "無"}`;
  Object.keys(KANSHOU_LOCKS_).forEach(function (k) {
    if (locks && locks[k]) out += `| [${KANSHOU_LOCKS_[k]}]是`;
  });
  return out;
}

// 從英靈殿召喚一位進這個世界；還有同行位子就直接站進來。
function actionKanshouSummonHero(userData, pcId, sheets) {
  var kpc = sheets.pc;
  var acctName = String(userData.acctName || "").trim();
  var heroId = String(userData.heroId || "").trim();
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  var me = data[meIdx];
  var gid = String(me[COL.PC.GAME_ID] || ""); var loc = String(me[COL.PC.LOC] || "我的房間");
  var heroes = getHeroCodexCached();
  var hero = heroes.find(function (r) { return String(r[COL.HERO.ID]) === heroId; });
  if (!hero) return JSON.stringify({ success: false, message: "找不到這個人。" });
  if (heroId === '衛宮士郎-Master') return JSON.stringify({ success: false, message: "這位就是你自己。" });
  if (KANSHOU_SUMMON_BLOCKED_IDS_.indexOf(heroId) !== -1) return JSON.stringify({ success: false, message: "這位現在還請不來。" });
  var _pop = data.filter(function (r) { return kanshouIsAlly_(r, gid); }).length;
  if (_pop >= KANSHOU_WORLD_MAX_) {
    return JSON.stringify({ success: false, message: "這座城裡已經住了 " + KANSHOU_WORLD_MAX_ + " 個人。要請新的人來，得先讓一位離開。" });
  }
  var heroName = KANSHOU_CASUAL_NAME_[heroId] || String(hero[COL.HERO.NAME] || "從者");
  if (String(hero[COL.HERO.SOURCE]) === "ai_gen") {
    var _hp = {}; try { _hp = JSON.parse(hero[COL.HERO.PERSONA] || "{}"); } catch (e) { }
    if (!_hp.creator || _hp.creator !== acctName) {
      return JSON.stringify({ success: false, message: "「" + heroName + "」是其他玩家的原創英靈，僅創造者本人可召喚。" });
    }
  }
  var heroSex = String(hero[COL.HERO.SEX] || "異") || "異";
  // 玩家定案：不開放男男配對
  if (String(me[COL.PC.SEX]) === "男" && heroSex === "男") {
    return JSON.stringify({ success: false, message: "「" + heroName + "」暫時無法召喚——僅支援 男女／女女 配對。" });
  }
  // 同一個人（含兩種靈基）不可同時在場
  var clash = kanshouSummonClash_(data, gid, hero, heroName);
  if (clash.name) {
    return JSON.stringify({ success: false, message: clash.same
      ? "「" + clash.name + "」已經存在於這個世界了，去找找人在哪裡吧。"
      : "這個世界裡已經有「" + clash.name + "」了——同一位英靈只能有一種姿態在場。" });
  }
  const _newRow = heroToKanshouRow_(hero, gid, loc);
  kpc.appendRow(_newRow);
  // 升格：AI 先前把同名寫成【常民】的話清掉，不然 AI 會同時看到兩份她。
  try { worldDrop_(gid, '人物', heroName); } catch (e) { }
  const _pIds = kanshouGetParty_(me[COL.PC.MEMORY]);
  if (_pIds.length < KANSHOU_PARTY_MAX_) {
    _pIds.push(String(_newRow[COL.PC.ID]));
    const _pMem = kanshouSetParty_(me[COL.PC.MEMORY], _pIds);
    data[meIdx][COL.PC.MEMORY] = _pMem;
    kpc.getRange(meIdx + 1, COL.PC.MEMORY + 1).setValue(_pMem);
  }
  return JSON.stringify({ success: true, added: heroName, message: "「" + heroName + "」來到了你們身邊。" });
}

// 依 game_id 整批清掉某張表的列；回傳被清列的 idCol 值（null＝不收）。
//   留下來的整批寫回、尾巴一次砍掉——逐列 deleteRow 在 GAS 慢到玩家以為當掉。
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

// 歸零重來：清掉這一局的眾生／歷史／帳本／風格／帳號連結；英靈殿與 solo 不動。
//   pcId 可預測，一律驗「帳號登記的就是它」才准清。
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

  const purgedIds = kanshouPurgeByGame_(kpc, COL.PC.GAME_ID, gid, COL.PC.ID);
  try { purgeHistoryForPcIds_(purgedIds); } catch (e) { }
  try { kanshouPurgeByGame_(worldSheet_(), KW_.GID, gid, null); worldBust_(gid); } catch (e) { }
  try { kanshouPurgeByGame_(kanshouStyleSheet_(), KS_.GID, gid, null); kanshouStyleBust_(gid); } catch (e) { }

  // 連結最後解：前面炸了玩家至少還回得去。
  try {
    const acc = ss.getSheetByName("帳號");
    const found = acc ? findAccountRow_(acc, acctName) : null;
    if (found) acc.getRange(found.idx + 1, COL.ACC.KPC + 1).setValue("");
  } catch (e) { }

  return JSON.stringify({ success: true, cleared: purgedIds.length, message: "後日談歸零了。" });
}

// 進入後日談：每個帳號一個常駐世界。有連結就接續；沒有就新建（開場一片空白，誰住進來由玩家召喚）。
function actionEnterKanshou(userData, pcId, sheets) {
  var acctName = String(userData.acctName || "").trim();
  if (!acctName) return JSON.stringify({ success: false, message: "還沒登入。" });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var kpc = getKanshouPcSheet_(ss);
  var data = kpc.getDataRange().getValues();

  var linkedKpcId = getAccountKanshouPcId_(acctName);
  if (linkedKpcId) {
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][COL.PC.ID]) !== linkedKpcId) continue;
      var loc = String(data[r][COL.PC.LOC] || "我的房間");
      return JSON.stringify({
        success: true,
        pcId: linkedKpcId, pcName: String(data[r][COL.PC.NAME] || acctName),
        pcSex: String(data[r][COL.PC.SEX] || "異"), loc: loc,
        homeName: getKanshouHomeName_(data[r][COL.PC.MEMORY], String(data[r][COL.PC.NAME] || acctName))
      });
    }
    // 連結指向的列不在了 → 當沒存檔，往下新建
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
        pcSex: String(data[m][COL.PC.SEX] || "異"), loc: String(data[m][COL.PC.LOC] || "我的房間"),
        homeName: getKanshouHomeName_(data[m][COL.PC.MEMORY], String(data[m][COL.PC.NAME] || acctName))
      });
    }
  }

  var mSex = String(userData.pcSex || "").trim();
  var mName = String(userData.pcName || "").trim().slice(0, 16);
  if ((mSex !== "男" && mSex !== "女") || !mName) {
    return JSON.stringify({ success: true, needSetup: true, defaultName: acctName });
  }
  var gameId = "k_" + Date.now();
  var loc2 = "冬木市，我的房間";   // 開場布景：冬木只在開場出現一次，AI 下一回合寫了新場景就換掉
  var pcColCount = Object.keys(COL.PC).length;
  var mId = "KPC_" + Date.now();
  var mRow = Array(pcColCount).fill("");
  mRow[COL.PC.ID] = mId;
  mRow[COL.PC.NAME] = mName;
  mRow[COL.PC.SEX] = mSex;
  mRow[COL.PC.LOC] = loc2;
  mRow[COL.PC.FACTION] = "御主";
  mRow[COL.PC.DAY] = 1;
  mRow[COL.PC.HOUR] = 6;
  // 【帳號】只給人看；同行寫一個空標記＝新局從空的開始
  mRow[COL.PC.MEMORY] = kanshouSetParty_(setOutfit_("【帳號】" + acctName + "｜【鑑賞後日談】這裡是平行世界的和平日常，與英靈相伴度過尋常時光。", "日常便服"), []);
  mRow[COL.PC.GAME_ID] = gameId;
  // 先用玩家填的片段秒寫；AI 潤色由 actionBackfillKanshouAi 進場後背景補
  var kAppear = String(userData.appearance || "").trim().slice(0, 60);
  var kPersona = String(userData.persona || "").trim().slice(0, 60);
  var _apPart = kAppear.replace(/、/g, "·").trim();   // 內部頓號換·，免溢到其他格
  var _psPart = kPersona.replace(/、/g, "·").trim();
  mRow[COL.PC.BACK] = "";   // 經歷留空：創角時 AI 補一句「以前」，之後由玩家改命
  mRow[COL.PC.TRAIT] = _apPart + "、、我、無";
  mRow[COL.PC.PREF] = _psPart + "、、、";
  mRow[COL.PC.INTENT] = "";   // 萌點欄已退休，恆空（位置索引，欄不刪）
  kpc.appendRow(mRow);
  linkAccountToKanshouPc_(acctName, mId);
  return JSON.stringify({
    success: true,
    pcId: mId, pcName: mName, pcSex: mSex, loc: loc2, homeName: getKanshouHomeName_(mRow[COL.PC.MEMORY], mName)
  });
}

// 進場後背景補寫玩家卡（只填空的格、不蓋已有的；補過就蓋【設定已補】章）。
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
★background：限20字，【只寫現在這段日子開始【以前】的來歷】，呼應其身世，不出現具體物品名，語氣平和溫馨，不涉及聖杯戰爭或任何戰爭史。
★【只寫現在這段日子開始以前的來歷】：現在的工作、住處、同住的人、交往對象、養的動物、已經有的朋友，全部留給玩家在遊戲裡自己做出來（系統會逐項記錄）——這一格只寫來到冬木之前的來歷。
★outfit：一句今天的日常穿搭(限20字)，依外貌與個性方向自然搭配(如文靜者素雅、活潑者亮色休閒)，純日常便服/居家/外出風格，不含任何戰甲/武裝/戰鬥裝束字眼。
★【數值與地點由系統裁定】輸出欄位以下方 JSON 列出的為限。

★【輸出】合法 JSON（純文字，無 Markdown）：
{"background":"限20字","traits":"兩格頓號字串","personality":"四格頓號字串","logic":"做選擇的方式，限24字","outfit":"一句日常穿搭"}`;

  try {
    const aiBrief = JSON.parse(callGeminiAPI(promptStr, KANSHOU_MASTER_GEN_SYS, { temperature: 0.6, ignoreLaw: true, model: CREATION_MODEL }));
    // backfill 豁免寫入鎖，列索引要在 AI 回來後重定位
    const wIdx = buildLiveIdIndex_(sheets.pc)[String(pcId)];
    if (wIdx === undefined) return JSON.stringify({ success: false, message: "你的角色不見了，重新進來看看。" });
    const _topUp_ = !!KANSHOU_BACKFILL_DONE_TAG_.get(row[COL.PC.MEMORY]);
    const _put_ = (col, val, curRaw) => {
      if (!val) return;
      if (_topUp_ && String(curRaw || "").replace(/[、\s]/g, "")) return; // 補過了、而且這格已經有東西
      sheets.pc.getRange(wIdx + 1, col + 1).setValue(val);
    };
    _put_(COL.PC.BACK, aiBrief.background && String(aiBrief.background).slice(0, 22), row[COL.PC.BACK]);
    _put_(COL.PC.TRAIT, aiBrief.traits && parseTraitsHelper(aiBrief.traits, traitParts_(row[COL.PC.TRAIT]).join('、'), TRAIT_SLOTS_), traitParts_(row[COL.PC.TRAIT]).join(''));
    _put_(COL.PC.PREF, aiBrief.personality && parseTraitsHelper(aiBrief.personality, row[COL.PC.PREF]), row[COL.PC.PREF]);
    // MEMORY 上兩件事（衣裝／準則）同一格：讀一次寫一次
    {
      let liveMem = sheets.pc.getRange(wIdx + 1, COL.PC.MEMORY + 1).getValue();
      const before = String(liveMem);
      if (aiBrief.outfit && !(_topUp_ && getOutfit_(liveMem))) liveMem = setOutfit_(liveMem, aiBrief.outfit);
      liveMem = stampPersonaFlavor_(liveMem, "", getPersonaLogic_(liveMem) ? "" : String(aiBrief.logic || "").slice(0, 40));
      liveMem = KANSHOU_BACKFILL_DONE_TAG_.set(liveMem, 1);
      if (String(liveMem) !== before) sheets.pc.getRange(wIdx + 1, COL.PC.MEMORY + 1).setValue(liveMem);
    }
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ success: false, message: "補寫失敗，先用原本的。" });
  }
}

// 👥 同伴面板：這一局所有人，各帶 同行／臨時在場 旗標（面板分三組靠這兩個）與共同回憶。
function actionKanshouCompanions(userData, pcId, sheets) {
  var kpc = sheets.pc;
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  var me = data[meIdx];
  var gid = String(me[COL.PC.GAME_ID] || "");
  var partyIds = kanshouGetParty_(me[COL.PC.MEMORY]);
  var onstageIds = kanshouGetOnstage_(me[COL.PC.MEMORY]);
  var current = [];
  for (var i = 1; i < data.length; i++) {
    if (kanshouIsAlly_(data[i], gid)) {
      current.push({ id: String(data[i][COL.PC.ID]), srcId: KANSHOU_SRC_TAG_.get(String(data[i][COL.PC.MEMORY] || "")), name: String(data[i][COL.PC.NAME]), tag: String(data[i][COL.PC.REL_TAG] || ""), nickname: getNickname_(data[i][COL.PC.REL_MEM]), party: partyIds.indexOf(String(data[i][COL.PC.ID])) >= 0, onstage: onstageIds.indexOf(String(data[i][COL.PC.ID])) >= 0, memoir: String(data[i][COL.PC.MEMOIR] || "").split('｜').map(function (s) { return s.trim(); }).filter(Boolean) });
    }
  }
  return JSON.stringify({ success: true, current: current });
}

// 共同回憶兩個上限（鏡射到前端 KC_*，check_mirror 盯）。釘選刻意比總量少 2，釘滿新回憶才擠得進來。
const KANSHOU_MEMOIR_CAP_ = 10;
const KANSHOU_MEMOIR_PIN_CAP_ = 8;

// 💞 共同回憶面板：釘選／取消／刪除（玩家 UI 手動管理，AI 無權）。
function actionKanshouMemoirOp(userData, pcId, sheets) {
  var kpc = sheets.pc;
  var op = String(userData.op || "").trim();
  var item = String(userData.item || "").replace(/[｜【】\[\]★]/g, "").trim();
  var targetName = String(userData.targetName || "").trim();
  var targetId = String(userData.targetId || "").trim();
  if (!item || !targetName || ['pin', 'unpin', 'del'].indexOf(op) === -1) return JSON.stringify({ success: false, message: "少了東西。" });
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  var gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  // id 優先、名字備援（長名被 NAME_MAX 截掉會查無此人）
  var tIdx = findPcRowIdx_(data, gid, { id: targetId, name: targetName, faction: "從者", nameCandidates: kanshouNameCandidates_ });
  if (tIdx < 0) return JSON.stringify({ success: false, message: "找不到這位同伴。" });
  var entries = String(data[tIdx][COL.PC.MEMOIR] || "").split('｜').map(function (s) { return s.trim(); }).filter(Boolean);
  var hit = entries.findIndex(function (e) { return e.replace(/^★/, "") === item; });
  if (hit === -1) return JSON.stringify({ success: false, message: "找不到這條回憶。" });
  if (op === 'del') entries.splice(hit, 1);
  else if (op === 'pin') {
    if (entries.filter(function (e) { return e.charAt(0) === '★'; }).length >= KANSHOU_MEMOIR_PIN_CAP_) return JSON.stringify({ success: false, message: "最多釘 " + KANSHOU_MEMOIR_PIN_CAP_ + " 條，先鬆開幾個。" });
    entries[hit] = '★' + entries[hit].replace(/^★/, "");
  }
  else entries[hit] = entries[hit].replace(/^★/, "");
  var joined = entries.join('｜');
  kpc.getRange(tIdx + 1, COL.PC.MEMOIR + 1).setValue(joined);
  return JSON.stringify({ success: true, memoir: entries });
}

// 🌍 世界帳本面板：list／pin／unpin／del。
function actionWorld(userData, pcId, sheets) {
  const kpc = sheets.pc;
  const data = kpc.getDataRange().getValues();
  const meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  const gid = String(data[meIdx][COL.PC.GAME_ID] || "");
  if (!gid) return JSON.stringify({ success: false, message: "這局的資料不完整。" });

  const op = String(userData.op || "list").trim();
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

// 面板一包給齊（條目＋上限＋文案）；list 與每個 op 都回同一形狀。釘選在前、再依最後提到由新到舊。
function worldPayload_(gid) {
  const rows = worldRead_(gid)
    .map(r => ({ kind: r.kind, name: r.name, text: r.text, sex: r.sex, pin: r.pin, seen: r.seen, hits: r.hits }));
  rows.sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.seen - a.seen);
  return {
    success: true, rows: rows, caps: worldSpec_(gid).cap, panel: worldSpec_(gid).panel
  };
}

// 🫂 同行名單：op add／drop／clear／evict。回傳實際落定的名單（滿了被擋玩家要看得到）。
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
    const npcId = String(userData.npcId || "").trim();   // 只認 id，全帳號共用表名字會撞
    const tIdx = npcId ? data.findIndex((r, i) => i > 0 && i !== meIdx && String(r[COL.PC.ID]) === npcId
      && String(r[COL.PC.GAME_ID] || "") === gid && kanshouIsAlly_(r, gid)) : -1;
    if (tIdx < 0) return JSON.stringify({ success: false, message: "找不到這個人。" });
    // evict＝整列抽掉（不可逆：回憶／她眼中的你／稱呼全沒了），前端要先問過玩家。
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

// ⚧ 改御主性別（只動 SEX；已有男性同伴就不准改成男）。
function actionKanshouSetSex(userData, pcId, sheets) {
  var newSex = String(userData.pcSex || "").trim();
  if (newSex !== "男" && newSex !== "女") return JSON.stringify({ success: false, message: "性別只能選男或女。" });
  var kpc = sheets.pc;
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
  if (oldSex !== newSex) {   // 真的換了就把肉體重置回預設
    kpc.getRange(i + 1, COL.PC.PHYSICAL + 1).setValue(JSON.stringify({ "狀態": "如常" }));
  }
  return JSON.stringify({ success: true, pcSex: newSex, message: "改成「" + newSex + "」了。" });
}

// ✏ 改御主名字。
function actionKanshouSetName(userData, pcId, sheets) {
  var newName = String(userData.pcName || "").trim();
  if (!newName) return JSON.stringify({ success: false, message: "名字不能空白。" });
  if (newName.length > 16) return JSON.stringify({ success: false, message: "名字請在16字以內。" });
  var kpc = sheets.pc;
  var data = kpc.getDataRange().getValues();
  var meIdx = kanshouPcIdx_(data, pcId);
  if (meIdx < 0) return JSON.stringify({ success: false, message: "你還沒進後日談。" });
  kpc.getRange(meIdx + 1, COL.PC.NAME + 1).setValue(newName);
  return JSON.stringify({ success: true, pcName: newName, message: "御主已改名為「" + newName + "」。" });
}


// ══════════════ 鑑賞 AI 核心：系統提示詞 ══════════════

// 對話格式（只講格式，不講該寫什麼）。solo 走 miniSystem 的短版。
function dialogueFormatRule_() {
  return `對話格式：單層「」只收嘴巴發得出的聲音(話語/笑聲/嘆息/悶哼)，每句前冠說話者的名字，只用卡片開頭句號前那一個名字（性別與真名留在卡上），同一個人跨回合都用同一個；★玩家的台詞免冠名，可以擴寫成完整的一句、補上說這句話當下的動作與神態，語意跟原句一樣；擴寫的範圍就是這一句話。肢體動作與環境聲響留在引號外。`;
}

// 鑑賞的 system prompt：鐵律（風格模組）＋在場人物卡（穩定半、吃快取）＋輸出範本。
//   physical_state 只收跨回合還成立的身體事實——神色每回合都變，存了會固化成綽號。
function buildDefaultSystemPrompt(includeOptions, styles, partyStable) {
  const _physicalState = "會持續到下一刻的身體狀態(衣衫、痕跡、體液)·第三人稱·≤15字·沒有就留空";
  const _appearanceExtras = "穿著與配飾·第三人稱·≤20字·沒有就留空";
  const _physicalStateRef = "同上·這個人的";
  const _appearanceExtrasRef = "同上·這個人的";
  const finalJson = {
    "narration": "劇情",
    "options": ["6條·各≤20字·【我】這一步做得到的動作·六條分別通往六種不同的後續"],
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
        "memory": "里程碑才寫·≤30字·第一人稱「我」·沒有就留空",
        "noticed": "≤14字·會改變之後怎麼對玩家的發現·沒有就留空"
      }]
    },
    "world_note": [{ "kind": "地點|人物|設定", "name": "一句話標題", "text": "≤" + WORLD_SPEC_.kanshou.textMax + "字", "sex": "kind=人物 才填 男/女/異" }],
    "scene": "這一段演完，人最後在哪·≤12字",
    "cast": { "join": ["這一段真的走進來的人·照名單上的名字寫·沒有就空陣列"], "leave": ["這一段真的離開的人·沒有就空陣列"] },
  };
  if (includeOptions === false) { delete finalJson.options; }

  // 鐵律＝風格模組（玩家版→關閉→預設），照順序動態編號；只留格式，筆法交給 AI。
  const _st = k => kanshouStyle_(styles, k);
  const rules = [
    _st('agency'),
    _st('history'),
    _st('perform'),
    _st('gender'),
    '每 2~3 句用 <br><br> 分一段，換行一律用 <br><br>。',
    _st('dialogue'),
    _st('lewd'),
    '只輸出合法 JSON，欄位見下方範本。'
  ].filter(Boolean);
  const nsfwBaseRules = _st('voice') + '格式：\n' + rules.map((r, i) => (i + 1) + '. ' + r).join('\n');
  // partyStable（在場者是誰）放 system 吃快取：在鐵律之後、範本之前，換人只作廢後半段。範本不 pretty-print。
  return nsfwBaseRules
    + (partyStable ? "\n" + partyStable : "")
    + "\n★【輸出範本】" + JSON.stringify(finalJson);
}

// 這個名字是地方不是人（AI 偶爾把「風音的家」寫成 kind:'人物'）：住所名或地名尾巴。
const KANSHOU_PLACE_SUFFIX_ = /(的家|的店|之家|宅邸|公寓|大樓|屋|館|亭|堂|苑|園|寺|社|樓|閣|城|站|所|廳|房|室|宅|邸)$/;
function kanshouNameIsPlace_(name, homeName) {
  const nm = String(name || "").trim();
  if (!nm) return false;
  if (homeName && nm === String(homeName).trim()) return true;
  return KANSHOU_PLACE_SUFFIX_.test(nm);
}

// AI 分錯類的 world_note 就地改判（不丟掉：那個名字通常是有意義的新東西）。
//   人物→地點：名字像地方；地點→人物：名字【逐字】等於某位正式同伴（模糊比對會吃掉「凜的房間」）。
function kanshouFixWorldKinds_(entries, homeName, peopleNames) {
  if (!Array.isArray(entries)) return entries;
  var known = (peopleNames || []).map(function (n) { return String(n || "").trim(); }).filter(Boolean);
  entries.forEach(function (w) {
    if (!w) return;
    var kind = String(w.kind || "").trim();
    if (kind === '人物' && kanshouNameIsPlace_(w.name, homeName)) { w.kind = '地點'; w.sex = ""; return; }
    if (kind === '地點' && known.indexOf(String(w.name || "").trim()) >= 0) w.kind = '人物';
  });
  return entries;
}

// ══════════════ 常數 ══════════════
// 暫時擋掉召喚的英靈 id（現為空：撞名改由 kanshouSummonClash_ 擋）。
const KANSHOU_SUMMON_BLOCKED_IDS_ = [];
// 同行（玩家按的·AI 動不了）與 臨時在場（AI 拉進來的·AI 也能讓他走）是兩個擁有者不同的清單，
//   都存玩家列 MEMORY、逗號分隔 id（全帳號共用表，名字會撞）。在場＝聯集；待命＝其餘。
const KANSHOU_PARTY_MAX_ = 3;
var KANSHOU_ONSTAGE_TAG_ = makeTextTag_('在場');
function kanshouGetOnstage_(memory) {
  return String(KANSHOU_ONSTAGE_TAG_.get(memory) || "").split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}
function kanshouSetOnstage_(memory, ids) {
  return KANSHOU_ONSTAGE_TAG_.set(memory, (ids || []).slice(0, KANSHOU_ONSTAGE_MAX_).join(','));
}
// 這一幕最多站幾人（同行 ∪ 臨時在場）；人再多每張卡都要送、誰都得有反應，敘事變點名輪流。
const KANSHOU_ONSTAGE_MAX_ = 5;
// 城裡總共住幾人（起始住民取消後全是玩家邀的）。滿了靠 🚪evict 騰位子——那顆鈕砍了這裡要放寬。
const KANSHOU_WORLD_MAX_ = 8;
// 逐字對話歷史窗口（則數·4＝最近兩個來回）。2026-09 從 2 放回 4：2 太短接不上；再往前的事走
//   世界帳本／共同回憶／她眼中的你三條挑過的路。這個數字直接換敘事連貫感，調之前想清楚要換什麼。
const KANSHOU_HIST_WINDOW_ = 4;
var KANSHOU_PARTY_TAG_ = makeTextTag_('同行');
function kanshouGetParty_(memory) {
  return String(KANSHOU_PARTY_TAG_.get(memory) || "").split(',').map(function (x) { return x.trim(); }).filter(Boolean);
}
function kanshouSetParty_(memory, ids) {
  return KANSHOU_PARTY_TAG_.set(memory, (ids || []).slice(0, KANSHOU_PARTY_MAX_).join(','));
}
// ★【這座城裡還住著】最多列幾位（依相處次數）。
const KANSHOU_WORLD_ROSTER_CAP_ = 8;
// 曆法：Day1＝2005/12/20，固定 365 天不算閏年，遊戲用途夠準。
const KANSHOU_CAL_START_MONTH_ = 12, KANSHOU_CAL_START_DAY_ = 20;
const KANSHOU_CAL_START_YEAR_ = 2005;
const KANSHOU_DAYS_IN_MONTH_ = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function kanshouDoyOffset_(month, day) {
  let off = 0;
  for (let m = 0; m < month - 1; m++) off += KANSHOU_DAYS_IN_MONTH_[m];
  return off + (day - 1);
}
// absDay → {year, month, day}
// 月份→季節（給提示詞用的字，不給數字）
function kanshouSeason_(month) {
  const m = parseInt(month) || 1;
  return m >= 3 && m <= 5 ? '春天' : m >= 6 && m <= 8 ? '夏天' : m >= 9 && m <= 11 ? '秋天' : '冬天';
}
function kanshouAbsDayToDate_(absDay) {
  const startOff = kanshouDoyOffset_(KANSHOU_CAL_START_MONTH_, KANSHOU_CAL_START_DAY_);
  const totalOff = startOff + (Math.max(1, absDay) - 1);
  const year = KANSHOU_CAL_START_YEAR_ + Math.floor(totalOff / 365);
  let doy = totalOff % 365;
  let month = 0;
  while (doy >= KANSHOU_DAYS_IN_MONTH_[month]) { doy -= KANSHOU_DAYS_IN_MONTH_[month]; month++; }
  return { year: year, month: month + 1, day: doy + 1 };
}

// 五時段（跳時段＝算好差幾小時丟進 advanceHours 管線）。
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
// 每回合推進幾分鐘（固定，玩家把流速旋鈕砍了）；當日最晚幾點。
const KANSHOU_MIN_PER_TURN_ = 10;
const KANSHOU_DAY_LAST_HOUR_ = 23;
function kanshouFmtHM_(h) {
  var hh = Math.floor(h);
  var mm = Math.round((h - hh) * 60);
  if (mm >= 60) { hh += 1; mm -= 60; }
  return ("0" + hh).slice(-2) + ":" + ("0" + mm).slice(-2);
}
// 時鐘一包（前端 HUD／跳時段按鈕都吃這個，不各自拼字串）。
function kanshouClockInfo_(pcRow) {
  const day = parseInt(pcRow[COL.PC.DAY]) || 1;
  const hour = (pcRow[COL.PC.HOUR] === "" || pcRow[COL.PC.HOUR] == null) ? 8 : (parseFloat(pcRow[COL.PC.HOUR]) || 0);
  const band = timeBand_(hour);
  const d = kanshouAbsDayToDate_(day);
  return { day: day, hour: hour, band: band, month: d.month, dayOfMonth: d.day, label: d.year + "年" + d.month + "月" + d.day + "日・" + kanshouFmtHM_(hour) + "・" + band };
}

// 玩家列的三個旗標：【設定已補】backfill 只填空格；【晨間餘韻】結束一天留下、下回合讀一次即清；【夜未眠】兩段式就寢第一段（absDay）。
var KANSHOU_BACKFILL_DONE_TAG_ = makeIntTag_('設定已補', 0);
var KANSHOU_MORNING_AFTER_TAG_ = makeTextTag_('晨間餘韻');
var KANSHOU_NIGHT_SCENE_TAG_ = makeIntTag_('夜未眠', 0);

// ══════════════ 🌍 世界帳本：AI 發明的東西落盤的地方 ══════════════
// 兩軌共用一個引擎，只有規格不同（能寫哪些 kind、各存幾條、一回合寫幾條餵幾條）；加一軌＝加一列。
//   kinds 同時驅動：AI 能寫哪些、哪些會被淘汰、面板列哪些。
var WORLD_SPEC_ = {
  kanshou: {
    gate: 'mention',   // 亮法：釘選／在場人物／玩家提到才餵（玩家「不要一直提那些有的沒的」）
    sheet: '世界帳本',
    kinds: ['地點', '人物', '設定'],
    cap: { '地點': 60, '人物': 40, '設定': 50 },
    feedTitle: '這個世界已經確立的事',
    feedTail: '這些是我們一路玩出來的既定事實，需要時原樣承接。',
    panel: {   // 面板文案逐軌登記，前端只負責畫
      title: '🌍 這個世界',
      hint: '你們一路走出來的地方、認識的人、說定的事。📌 釘住的不會忘；記錯的可以刪。',
      empty: '還沒有東西。<br>玩下去就會長出來。去一個地圖上沒有的地方、認識新的人、聊出只有你們懂的事，都會記在這裡。',
      groups: [['人物', '🧑 這座城裡的人'], ['地點', '🗺️ 這座城裡的地方'], ['設定', '📖 這座城的事']]
    },
    feedMax: 6,   // 一回合最多餵回幾條——帳本會長大，這是唯一的煞車
    writeMax: 3,  // AI 一回合最多寫幾條
    textMax: 60
  },
  // solo 的人與地點種子庫早有了，AI 只記【這一局的因果】（歷史 6 筆不夠記誰殞落／誰結盟）。
  solo: {
    gate: 'recent',    // 戰記：局勢層級的事（誰殞落、誰結盟）不等玩家提，近期的照餵
    sheet: '世界帳本',
    kinds: ['因果'],
    cap: { '因果': 40 },
    feedTitle: '這一局已經發生的因果',
    feedTail: '這些是這一局真的發生過、還在影響現在的事，需要時原樣承接。',
    panel: {
      title: '📜 戰記',
      hint: '這一局真的發生過、還在影響現在的事。📌 釘住的不會忘；記錯的可以刪。',
      empty: '還沒有東西。<br>打下去就會長出來。誰殞落了、跟誰結了盟、教會開了什麼條件，都會記在這裡。',
      groups: [['因果', '📜 這一局發生過的事']]
    },
    feedMax: 5,
    writeMax: 2,
    textMax: 50
  }
};
// game_id 前綴決定哪一軌：g_ solo、k_ 鑑賞。
function worldTrack_(gameId) { return String(gameId || "").indexOf('g_') === 0 ? 'solo' : 'kanshou'; }
function worldSpec_(gameId) { return WORLD_SPEC_[worldTrack_(gameId)] || WORLD_SPEC_.kanshou; }

// ══════════════ 🎨 說書人風格 ══════════════
// 篇幅檔位：字數區間與 token 上限綁同一列。tokens 要蓋得住 narration＋JSON 開銷（約 1057 字），超出就截成壞 JSON。
//   auto＝自動表；free＝【篇幅】那行整個不送（有數字在，平淡的一幕也會被湊滿）。
var KANSHOU_LEN_TIERS_ = [
  { key: 'auto', label: '自動', words: '', tokens: 0 },
  { key: 'free', label: '隨意', words: '', tokens: 2400, free: true },
  { key: '300', label: '300 字', words: '260~340', tokens: 1800 },
  { key: '500', label: '500 字', words: '440~560', tokens: 2200 },
  { key: '700', label: '700 字', words: '620~780', tokens: 2600 },
  { key: '900', label: '900 字', words: '820~980', tokens: 3200 }
];
function kanshouLenTier_(key) {
  return KANSHOU_LEN_TIERS_.find(t => t.key === String(key || 'auto')) || KANSHOU_LEN_TIERS_[0];
}

// 風格模組：fixed＝不開放玩家調（面板不列、路由拒收）；玩家真正能動的只有【尺度】【篇幅】。
//   slot sys＝進鐵律、user＝進 USER prompt；{玩家}{代名詞}{篇幅} 組裝時代入。def 不下傳前端。
//   預設值留在 .gs 不搬試算表：掃描器只看 .gs。只下定義不給演法——無條件的演出指示會固化成每回合硬演。
var KANSHOU_STYLE_MODULES_ = [
  { key: 'voice',      fixed: true, slot: 'sys',  def: '後日談敘事核心·輕小說筆觸·台灣繁體中文·第一人稱「我」＝玩家，旁白只寫「我」看得到聽得到感覺得到的。' },
  { key: 'agency',     fixed: true, slot: 'sys',  def: '玩家這一步做什麼、說什麼，由玩家的輸入決定；那一步玩家自己已經看見了，這一段從在場的人對它的反應寫起，開頭就落在那個人的動作或第一句話上。' },
  // history 是事實陳述不是筆法：少了它模型會順著自己上一輪的調子把同一場景再寫一次。
  { key: 'history',    fixed: true, slot: 'sys',  def: '上面的對話歷史是已經結束的事，它讓你知道這一路走到哪裡了；這一回合要寫的，是玩家這一步【接下來】發生的那一段——新的動作、新的話、新的反應。' },
  { key: 'perform',    fixed: true, slot: 'sys',  def: '在場那幾張卡，開頭是這個人的名字，接著一句是性別（有的帶真名），本事那格列的是技能與寶具的名字，後面是這個人是什麼樣的人；名字後面另外接的那幾行是此刻的狀態。★卡上這些句子、還有【我自己】那張，都只給你看，在場的人並不知道自己被這樣寫著；每張卡上的事是我跟那個人之間的事，其他人手上有的，僅限於自己在場時看得到聽得到的那些。★卡上寫的是【一直以來】的底色，不是這一回合發生的事。' },
  { key: 'dialogue',   fixed: true, slot: 'sys',  def: '' },   // 預設走 dialogueFormatRule_()，見 kanshouStyleDefault_
  { key: 'lewd',       name: '尺度',     hint: '情慾場面寫多開——哪些東西要真的出現在畫面上。尺度一律跟著玩家推進到哪裡走。', slot: 'sys', def: '尺度跟著玩家走。' },
  { key: 'world',      fixed: true, slot: 'user', def: '★這個世界＝和平的現代日常，帶一點奈須味：魔術、神秘、技能、寶具都還在身上，只是拿來過日子——用法從卡上那個人的本事來，寫成那個人順手做了什麼，順著眼前的事帶出來，點到為止；有誰把場面拉出日常，就用一點小小的搞笑把它拉回來。' },
  { key: 'gender',     fixed: true, slot: 'sys',  def: '★【性別】：在場每個人的性別以卡上寫的為準，身體、稱呼、代名詞照那個寫。' },
  { key: 'lenTier',    name: '篇幅',     hint: '一回合寫多長。自動＝依這回合有沒有大事調；隨意＝不給字數，平淡的一幕就讓它平淡。', slot: 'none', kind: 'pick', def: 'auto' },
  { key: 'length',     fixed: true, slot: 'user', def: '★【篇幅】這一段寫 {篇幅} 字。' },   // ⚠ 篇幅選「隨意」時整段不送，見 actionPlay_ 的 _sty_('length')
];
var KANSHOU_STYLE_TEXT_MAX_ = 300;
var KS_ = { GID: 0, KEY: 1, TEXT: 2, ON: 3 };

function kanshouStyleModule_(key) {
  return KANSHOU_STYLE_MODULES_.find(m => m.key === key) || null;
}
// 預設值唯一出口（dialogue 的預設是函式，不能直接讀 def）。
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

// 這一局的風格覆寫 {key:{text,on}}；每回合讀，走快取，寫入點自己清。
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
      if (!_km || _km.fixed) continue;   // fixed 的舊列當不存在
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

// ⚙ 說書人設定面板：get 回可調的模組（只給提示與玩家自己的字，不給預設本體）。
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
// ⚙ 說書人設定：改一格／還原一格／全部還原。
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
    // 檔位型只收表上有的值（表外的字會存得進去、面板沒一顆亮、實際當 auto——零錯誤訊息）。
    if (mod.kind === 'pick') {
      const pick = String(userData.styleText || "").trim();
      if (!KANSHOU_LEN_TIERS_.some(t => t.key === pick)) return JSON.stringify({ success: false, message: "沒有這個檔位。" });
      kanshouStyleWrite_(gid, key, pick === KANSHOU_LEN_TIERS_[0].key ? null : { text: pick, on: true });
      return JSON.stringify({ success: true });
    }
    const text = kanshouStyleClean_(userData.styleText);
    const on = String(userData.on) !== 'false' && userData.on !== false && String(userData.on) !== '0';
    if (!text && on) kanshouStyleWrite_(gid, key, null);
    else kanshouStyleWrite_(gid, key, { text: text, on: on });
    return JSON.stringify({ success: true });
  } catch (e) { return JSON.stringify({ success: false, message: "儲存失敗，請稍後再試。" }); }
}

// 帳本欄位（位置索引，加欄一律接最後）。REGION／OWN／AT 三欄隨地點退休已停寫，留欄不刪。
var KW_ = { GID: 0, KIND: 1, NAME: 2, TEXT: 3, SEX: 4, BORN: 5, SEEN: 6, HITS: 7, PIN: 8, REGION: 9, OWN: 10, AT: 11 };

// 兩軌共用一張表，靠遊戲 ID 分流。舊名「鑑賞世界」就地改名（另開一張會讓既有世界不見）。
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

// 一列 → 一個條目（讀與寫回快取共用，欄位長相只有這裡說了算）。
function worldRow_(a, rowNum) {
  return {
    kind: String(a[KW_.KIND] || ""), name: String(a[KW_.NAME] || ""), text: String(a[KW_.TEXT] || ""),
    sex: String(a[KW_.SEX] || ""), born: parseInt(a[KW_.BORN]) || 0, seen: parseInt(a[KW_.SEEN]) || 0,
    hits: parseInt(a[KW_.HITS]) || 0, pin: String(a[KW_.PIN] || "") === '★',
    region: String(a[KW_.REGION] || ""), own: String(a[KW_.OWN] || ""),
    at: String(a[KW_.AT] || ""), row: rowNum
  };
}

// 這一局的帳本；每回合讀，走快取，寫入點自己換成新內容。
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

// bigram 近義比對。只用在【近兩天的迴聲】，不掃全表——句型相近語意不同的事實太多，掃全表會把世界合併到空。
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

// 寫入：同類同名就更新內容與最後提及日，否則新增；超量淘汰最久沒提到的。回傳真的落盤的筆數。
//   max 預設是給 AI 的煞車；GAS 自己種資料傳 entries.length。
//   world_note 不經 sanitizeUserData_，清洗在這裡：斷字／偽造標記字元、開頭的公式引導字元。
function worldWrite_(gameId, entries, curDay, max) {
  const gid = String(gameId || "");
  if (!gid || !Array.isArray(entries) || !entries.length) return 0;
  const spec = worldSpec_(gid);
  const clean = [];
  entries.slice(0, max || spec.writeMax).forEach(e => {
    if (!e) return;
    const kind = String(e.kind || "").trim();
    if (spec.kinds.indexOf(kind) < 0) return;
    const _f = v => String(v || "").replace(/[<>&"'`｜【】\[\]★\r\n\t]/g, "").replace(/^[=+\-@\t\r]+/, "").trim();
    const name = _f(e.name).slice(0, 20), text = _f(e.text).slice(0, spec.textMax);
    if (!name && !text) return;
    const sex = (['男', '女', '異'].indexOf(String(e.sex || "").trim()) >= 0) ? String(e.sex).trim() : "";
    clean.push({ kind: kind, name: name || text.slice(0, 12), text: text, sex: sex });
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
    // 名字是主鍵；內容近義只比最近兩天的（見 worldSame_）
    const hit = mine.find(i => String(d[i][KW_.KIND]) === c.kind && (
      String(d[i][KW_.NAME]).trim() === c.name ||
      ((parseInt(d[i][KW_.SEEN]) || 0) >= day - 2 && worldSame_(d[i][KW_.TEXT], c.text))
    ));
    if (hit !== undefined) {
      if (c.text) d[hit][KW_.TEXT] = c.text;
      if (c.sex && !String(d[hit][KW_.SEX] || "").trim()) d[hit][KW_.SEX] = c.sex;
      d[hit][KW_.SEEN] = day;
      d[hit][KW_.HITS] = (parseInt(d[hit][KW_.HITS]) || 0) + 1;
      wrote++; touched = true;
      return;
    }
    const row = []; row[KW_.GID] = gid; row[KW_.KIND] = c.kind; row[KW_.NAME] = c.name; row[KW_.TEXT] = c.text;
    row[KW_.SEX] = c.sex; row[KW_.BORN] = day; row[KW_.SEEN] = day; row[KW_.HITS] = 1; row[KW_.PIN] = "";
    row[KW_.REGION] = ""; row[KW_.OWN] = ""; row[KW_.AT] = "";
    added.push(row); wrote++;
  });

  // 淘汰併在這裡做（手上已有整表）：留下的整批寫回、尾巴一次砍掉。
  try {
    const dropSet = worldEvictees_(d, gid, added, day);
    const kept = [];
    for (let i = 1; i < d.length; i++) if (!dropSet['r' + i]) kept.push(d[i]);
    const cols = d[0].length;
    const tail = (d.length - 1) - kept.length;
    if (kept.length && (touched || tail > 0)) sh.getRange(2, 1, kept.length, cols).setValues(kept);
    if (tail > 0) sh.deleteRows(2 + kept.length, tail);
    const live = kept.slice();
    added.forEach((r, k) => {
      if (dropSet['a' + k]) return;
      while (r.length < cols) r.push("");
      sh.appendRow(r); live.push(r);
    });
    // 快取換成新內容（不是作廢）：作廢會逼同一次執行裡的 worldRead_ 再整表讀一次
    const mineNow = [];
    for (let j = 0; j < live.length; j++) if (String(live[j][KW_.GID]) === gid) mineNow.push(worldRow_(live[j], j + 2));
    try { CacheService.getScriptCache().put('KW_' + gid, JSON.stringify(mineNow), 120); } catch (e2) { }
  } catch (e) { worldBust_(gid); return 0; }
  return wrote;
}

// 拿掉一條（同類同名）；面板刪除與常民升格共用。回傳有沒有真的刪到。
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

// 淘汰政策（純函式）：每類超過上限就砍最久沒提到、提及最少的；釘選與有 AT/OWN 的舊列不驅逐。
//   回傳 {'r列索引':1,'a新列序':1}，由呼叫端一次寫回。
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
      if (String(d[i][KW_.AT] || "").trim() || String(d[i][KW_.OWN] || "").trim()) continue;   // 舊存檔的「有根」條目
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

// 餵回去：不是全餵，只挑相關的（釘選／在場者名字在內容裡／玩家這句話提到／最近 3 天提過），最多 feedMax 條。
//   跟正式同伴同名的【人物】條目不餵——那是先被 AI 掰出來、之後才召喚升格的同一個人（升格時會清，這是舊存檔的第二道）。
// ══════════════ 📖 觸發條目（規格照 SillyTavern character_book：{keys, content}） ══════════════
// 「她是誰」每回合送；「她喜歡什麼、討厭什麼」這種話題道具只在玩家這一步提到時才給，沒中整段不存在。
//   只掃玩家的訊息：AI 自己寫的字不算提到（那是自我餵養的迴圈）；要連上一段敘事一起掃就開 KANSHOU_LORE_SCAN_AI_。
var KANSHOU_LORE_SCAN_AI_ = false;
var KANSHOU_LORE_MAX_ = 6;
var KANSHOU_LORE_KEY_ALLOW1_ = ['蛇', '馬', '雪', '貓', '酒', '劍', '虎', '書', '鏡', '裙'];   // 實測「看什麼書」「全身鏡」兩字 key 都咬不到   // 允許的單字 key（其餘至少兩字，免得逢字就亮）
// 冬木的正典事實（提到才給；沒有地點系統，這只是布景的底細）
var KANSHOU_WORLD_BOOK_ = [
  { keys: ['深山町'], content: '深山町是冬木市河西的老城區，坡道多、老宅多，衛宮、遠坂、間桐三家都在這一側' },
  { keys: ['新都'], content: '新都在未遠川東岸，車站、高樓、百貨與中央公園都在那邊' },
  { keys: ['冬木大橋', '大橋'], content: '冬木大橋是橫跨未遠川的紅色鋼橋，連著深山町與新都' },
  { keys: ['商店街'], content: '深山町商店街在坡道下，衛宮家平常採買都在這裡' },
  { keys: ['穗群原', '學園', '學校'], content: '穗群原學園是冬木的私立高中，士郎、凜、櫻都念這裡，藤村大河在這裡教英文' },
  { keys: ['柳洞寺', '柳洞'], content: '柳洞寺在深山町後山，一段很長的石階上去' },
  { keys: ['衛宮邸', '衛宮家', '士郎家'], content: '衛宮邸是深山町的大和式老宅，有道場和好幾間空房' },
  { keys: ['遠坂邸', '遠坂家'], content: '遠坂邸是深山町坡道頂上的紅磚洋館，凜一個人住' },
  { keys: ['間桐邸', '間桐家'], content: '間桐邸是深山町另一棟陰暗的洋館' },
  { keys: ['教會', '言峰'], content: '冬木教會在新都郊外的山丘上，神父姓言峰' }
];
// 沒有種子條目時，從那一列的 PREF 第三、四格（喜歡／討厭）自己長出條目——原創英靈與玩家改命過的都走這條。
function loreEntriesFromPref_(pref) {
  const a = String(pref || "").split('、');
  const out = [];
  [[2, '喜歡'], [3, '討厭']].forEach(function (pair) {
    const t = String(a[pair[0]] || "").trim();
    if (!t || QUAD_EMPTY_.indexOf(t) >= 0) return;
    const keys = t.split(/[與、和及，]/).map(function (k) { return k.trim(); }).filter(function (k) { return k.length >= 2 || KANSHOU_LORE_KEY_ALLOW1_.indexOf(k) >= 0; });
    if (keys.length) out.push({ keys: keys, content: pair[1] + t });
  });
  return out;
}
// 經歷（BACK）長成一條：點名的人在場就常駐（rel），玩家提到裡面的事才亮（overlap）。
function loreEntryFromBack_(row) {
  const b = String(row[COL.PC.BACK] || "").trim();
  if (!b || QUAD_EMPTY_.indexOf(b) >= 0 || /職階英靈$/.test(b)) return [];
  return [{ keys: [], content: b, rel: true, overlap: true }];
}
// 這一列來自英靈殿哪一筆（【英靈源】→ 英靈殿列），查不到回 null。
function kanshouSeedRowOf_(row) {
  const srcId = KANSHOU_SRC_TAG_.get(row[COL.PC.MEMORY]);
  if (!srcId) return null;
  try {
    const d = getHeroCodexCached();
    for (let i = 1; i < d.length; i++) if (String(d[i][COL.HERO.ID]) === srcId) return d[i];
  } catch (e) { }
  return null;
}
// 本事（卡片用）：種子的技能與寶具只給名字不給階級，日常用法才有依據可循；御主種子沒技能就回空。為什麼：見 CODE_NOTES.md『kanshouSkillLine_』。
function kanshouSkillLine_(seedRow) {
  if (!seedRow) return "";
  const np = String(seedRow[COL.HERO.NP] || "").split('／')
    .map(function (x) { return x.replace(/\s.*$/, "").replace(/（.*$/, "").trim(); }).filter(Boolean);
  const names = [];
  [COL.HERO.CLASS_SKILLS, COL.HERO.SKILLS].forEach(function (c) {
    safeJson_(seedRow[c], []).forEach(function (s) {
      const n = String(s && s.n || "").replace(/\s.*$/, "").trim();
      if (n && names.indexOf(n) < 0 && np.indexOf(n) < 0) names.push(n);   // 種子把寶具也列在技能欄（引擎用），卡上只寫一次
    });
  });
  if (!names.length && !np.length) return "";
  return "本事：" + names.join('、') + (np.length ? (names.length ? "；" : "") + "寶具" + np.join('、') : "");
}

// 真名（卡片抬頭用）：暱稱「凜」模型要靠雙馬尾猜她是誰，給「遠坂凜」就不必猜。跟暱稱相同就回空。
function kanshouRealName_(row) {
  const seed = kanshouSeedRowOf_(row);
  const real = seed ? String(seed[COL.HERO.NAME] || "").trim() : "";
  return real && real !== String(row[COL.PC.NAME] || "").trim() ? real : "";
}
// 這一列的條目：種子有 book 就用種子的，沒有就從 PREF／BACK 長出來。
//   種子的 book 也可能只寫了喜惡沒寫經歷：沒有 rel 條目時把 BACK 補上（玩家改命過的經歷也在這裡生效）。
function kanshouLoreBook_(row) {
  let book = null;
  const seed = kanshouSeedRowOf_(row);
  if (seed) {
    try { const p = JSON.parse(seed[COL.HERO.PERSONA] || "{}"); if (Array.isArray(p.book) && p.book.length) book = p.book.slice(); } catch (e) { }
  }
  if (!book) book = loreEntriesFromPref_(row[COL.PC.PREF]);
  if (!book.some(function (e) { return e && e.rel; })) book = book.concat(loreEntryFromBack_(row));
  return book;
}
// 裝扮句什麼時候送：①這件衣服還沒講過（第一回合、換裝、AI 的 appearance_extras 改了）②玩家提到衣物③肉體狀態不是如常。
//   其他回合歷史裡有，每回合都送模型就每回合描寫一次（「修長的雙腿裹在過膝黑襪裡」）。講過的存【裝扮已述】。
var KANSHOU_OUTFIT_TOLD_TAG_ = makeTextTag_('裝扮已述');
var KANSHOU_NOW_TOLD_TAG_ = makeTextTag_('此刻已述');   // 同一個道理：季節＋時段講過就不再送，換了時段才送
var KANSHOU_TIME_KEYS_ = ['早上', '早安', '中午', '下午', '傍晚', '晚上', '今晚', '晚餐', '午餐', '早餐', '宵夜', '明天', '今天', '幾點', '深夜', '半夜', '天黑', '天亮'];
var KANSHOU_OUTFIT_KEYS_ = ['衣', '裙', '襪', '穿', '脫', '換', '裝扮', '外套', '內衣', '胸罩', '內褲', '鞋', '制服', '睡衣', '浴衣', '泳裝', '和服', '洋裝', '領口', '袖', '扣子', '拉鍊'];
function kanshouBodyPlain_(physicalJson) {
  let o = {}; try { o = JSON.parse(physicalJson || "{}"); } catch (e) { }
  const keys = Object.keys(o);
  return keys.length === 0 || (keys.length === 1 && o["狀態"] === "如常");
}
// 回 { line, told }：line＝要送的「穿著X。」或空字串；told＝true 表示 MEMORY 的【裝扮已述】已就地更新（呼叫端要標 dirty）。
function kanshouOutfitLine_(row, playerMsg) {
  const outfit = getOutfit_(row[COL.PC.MEMORY]);
  if (!outfit) return { line: "", told: false };
  const toldBefore = KANSHOU_OUTFIT_TOLD_TAG_.get(row[COL.PC.MEMORY]);
  const msg = String(playerMsg || "");
  const send = toldBefore !== outfit
    || KANSHOU_OUTFIT_KEYS_.some(function (k) { return msg.indexOf(k) >= 0; })
    || !kanshouBodyPlain_(row[COL.PC.PHYSICAL]);
  if (!send) return { line: "", told: false };
  let told = false;
  if (toldBefore !== outfit) { row[COL.PC.MEMORY] = KANSHOU_OUTFIT_TOLD_TAG_.set(row[COL.PC.MEMORY], outfit); told = true; }
  return { line: `穿著${outfit}。`, told: told };
}
// 帳本回寫前的濾網：AI 會把這一回合亮起的底細抄成 world_note（「SABER的飲食原則：無法接受馬虎的飯菜」），
//   一寫進帳本就變成在場時常駐——加料從後門回來。①跟這回合送的底細共用兩字詞的丟掉；②kind 人物 且名字含同伴名的丟掉（同伴有自己那一列）。
function worldNoteDropEcho_(entries, loreStr, allyNames) {
  if (!Array.isArray(entries)) return [];
  const lore = String(loreStr || "").replace(/★【[^】]*】[^：]*：/, "");
  const allies = (allyNames || []).map(function (n) { return String(n || "").trim(); }).filter(Boolean);
  return entries.filter(function (w) {
    if (!w) return false;
    const nm = String(w.name || ""), tx = String(w.text || "");
    if (String(w.kind) === '人物' && allies.some(function (a) { return nm.indexOf(a) >= 0; })) return false;
    if (lore && (loreOverlap_(nm + tx, lore))) return false;
    return true;
  });
}
// 共同回憶：釘選（★）常駐，其餘玩家提到才亮。回 [常駐…, 亮起…] 的純文字。
function memoirActive_(memoirRaw, playerMsg) {
  const items = String(memoirRaw || "").split('｜').map(function (x) { return x.trim(); }).filter(Boolean);
  return items.filter(function (m) { return m.charAt(0) === '★' || loreOverlap_(m, playerMsg); })
    .map(function (m) { return m.replace(/★/g, ''); });
}
// 兩段中文有沒有共用的「兩字詞」（去掉功能字與泛用詞）：回憶／經歷／帳本這種自由文字沒有 keys，靠這個判「提到了沒」。
// 功能字表（\u5979\u4ed6＝她他，用跳脫寫是為了不讓代名詞掃描器把一張字表當成提示詞）
var LORE_STOP_CHARS_ = '的了是我你妳\u5979\u4ed6們在有和與這那就也都要去來說看一個把被給對很好嗎呢吧啊不';
var LORE_STOP_BIGRAMS_ = ['喜歡', '討厭', '我們', '一起', '那天', '今天', '之後', '時候', '開始', '最近', '可以', '自己', '還是', '因為', '所以', '沒有', '什麼', '東西', '知道', '覺得', '一下', '然後', '已經', '現在', '這裡', '那裡'];
function loreBigrams_(text) {
  const t = String(text || "").replace(/[^\u4e00-\u9fff]/g, ' ');
  const out = {};
  for (let i = 0; i + 1 < t.length; i++) {
    const bg = t.substr(i, 2);
    if (bg.indexOf(' ') >= 0) continue;
    if (LORE_STOP_CHARS_.indexOf(bg[0]) >= 0 || LORE_STOP_CHARS_.indexOf(bg[1]) >= 0) continue;
    if (LORE_STOP_BIGRAMS_.indexOf(bg) >= 0) continue;
    out[bg] = 1;
  }
  return out;
}
function loreOverlap_(a, b) {
  const x = loreBigrams_(a), y = loreBigrams_(b);
  return Object.keys(x).some(function (k) { return y[k]; });
}
// 條目亮起的三種路：①keys 子字串在玩家訊息裡；②rel 條目點名的人在場（關係事實在那個人面前是常識）；
//   ③content 與玩家訊息共用兩字詞（沒有 keys 的自由文字走這條）。opts = { presentNames, playerMsg }
function loreHits_(entries, text, opts) {
  const hay = String(text || "").toLowerCase();
  const present = (opts && opts.presentNames) || [];
  const playerMsg = (opts && opts.playerMsg !== undefined) ? String(opts.playerMsg) : hay;
  const out = [];
  (entries || []).forEach(function (e) {
    if (!e || !e.content) return;
    const keys = Array.isArray(e.keys) ? e.keys : [];
    let hit = !!hay && keys.some(function (k) { return k && hay.indexOf(String(k).toLowerCase()) >= 0; });
    if (!hit && e.rel && present.length) hit = present.some(function (n) { return n && String(e.content).indexOf(n) >= 0; });
    if (!hit && e.overlap && playerMsg) hit = loreOverlap_(e.content, playerMsg);
    if (hit) out.push(String(e.content));
  });
  return out;
}
// 這一回合亮起的條目 → 一段 ★；沒有就空字串。ctx：{ userMsg, lastNarration, pc, presentRows }
function kanshouLoreStr_(ctx) {
  let hay = String(ctx.userMsg || "");
  if (KANSHOU_LORE_SCAN_AI_ && ctx.lastNarration) hay += "\n" + String(ctx.lastNarration);
  const parts = [];
  const presentNames = (ctx.presentRows || []).map(function (r) { return String(r[COL.PC.NAME]).trim(); });
  const opts = { presentNames: presentNames, playerMsg: String(ctx.userMsg || "") };
  const mine = loreHits_(loreEntriesFromPref_(ctx.pc[COL.PC.PREF]), hay, opts);
  if (mine.length) parts.push(`我：${mine.join('；')}`);
  (ctx.presentRows || []).forEach(function (r) {
    const h = loreHits_(kanshouLoreBook_(r), hay, opts);
    if (h.length) parts.push(`${String(r[COL.PC.NAME]).trim()}：${h.join('；')}`);
  });
  const world = loreHits_(KANSHOU_WORLD_BOOK_, hay, opts);
  if (world.length) parts.push(world.join('；'));
  if (!parts.length) return "";
  return `\n★【這一步碰到的底細】(玩家這句話碰到了它們)：${parts.slice(0, KANSHOU_LORE_MAX_).join('｜')}。`;
}

function worldFeed_(gameId, rows, presentNames, userMsg, curDay, allyNames) {
  if (!Array.isArray(rows) || !rows.length) return "";
  const spec = worldSpec_(gameId);
  const msg = String(userMsg || "");
  const _allies = (allyNames || []).map(n => String(n || "").trim()).filter(Boolean);
  if (_allies.length) rows = rows.filter(r => !(r.kind === '人物' && _allies.indexOf(String(r.name || "").trim()) >= 0));
  const names = (presentNames || []).map(n => String(n || "").trim()).filter(Boolean);
  const day = parseInt(curDay) || 0;
  // 亮起的三種路跟觸發條目同一套：釘選／在場人物／玩家這一步提到（名字或共用兩字詞）。近期與命中次數只管排序。
  const all = rows.map(r => {
    const hay = r.name + '｜' + r.text;
    let sc = 0;
    if (r.pin) sc += 100;
    if (names.some(n => hay.indexOf(n) >= 0)) sc += 30;
    if (msg && (msg.indexOf(r.name) >= 0 || loreOverlap_(hay, msg))) sc += 50;
    if (spec.gate === 'mention' && sc === 0) return null;
    if (day && r.seen >= day - 3) sc += 20;
    sc += Math.min(r.hits, 5);
    return sc > 0 ? { r: r, sc: sc } : null;
  }).filter(Boolean).sort((a, b) => b.sc - a.sc).slice(0, spec.feedMax);
  if (!all.length) return "";
  // 名字不在內容裡就補上（只餵內容 AI 講不出那是什麼）
  const line = all.map(x => x.r.kind === '人物'
    ? `${x.r.name}${x.r.sex ? '【性別:' + x.r.sex + '】' : ''}(${x.r.text})`
    : (x.r.name && x.r.text.indexOf(x.r.name) < 0 ? `${x.r.name}(${x.r.text})` : x.r.text)).join('；');
  const folk = all.some(x => x.r.kind === '人物')
    ? '其中標了【性別】的是這座城的常民——他們出現在合理的場合、開口、被寫進場景都可以，只是不追蹤好感與關係。'
    : '';
  return `\n★【${spec.feedTitle}】：${line}。${spec.feedTail}${folk}`;
}
// 家名：【住所】標記，沒設就「(玩家名)的家」。
function getKanshouHomeName_(memory, playerName) {
  const m = String(memory || "").match(/【住所】([^｜【】]*)/);
  const nm = m ? m[1].trim() : "";
  const dflt = String(playerName || "").trim() ? String(playerName).trim() + "的家" : "我家";
  return nm || dflt;
}
// 鑑賞顯示用的日常短名（真名太長，AI 只會挑一段叫，逐字比對會失敗）。
const KANSHOU_CASUAL_NAME_ = {
  '阿爾托莉雅-Saber': 'SABER',
  '美杜莎-Rider': 'RIDER',
  '庫丘林-Lancer': 'LANCER',
  'EMIYA-Archer': 'ARCHER',
  '伊莉雅絲菲爾-Master': '伊莉雅',
  '間桐櫻黑化-Master': '櫻',
  '遠坂凜-Master': '凜',
  '藤村大河-Master': '大河',
  '衛宮士郎-Master': '士郎'
};
// 全名↔短名雙向別名：不論寫哪一種都對得上人。
const KANSHOU_NAME_ALIAS_ = {
  '阿爾托莉雅·潘德拉貢': ['SABER'], 'SABER': ['阿爾托莉雅·潘德拉貢'],
  '美杜莎': ['RIDER'], 'RIDER': ['美杜莎'],
  '伊莉雅絲菲爾': ['伊莉雅'], '伊莉雅': ['伊莉雅絲菲爾'],
  '間桐櫻': ['櫻'], '櫻': ['間桐櫻'],
  '遠坂凜': ['凜'], '凜': ['遠坂凜'],
  '藤村大河': ['大河'], '大河': ['藤村大河'],
  '衛宮士郎': ['士郎'], '士郎': ['衛宮士郎']
};
// 同一個人（含兩種靈基）不可同時在場。回 {name, same}：name＝已在場那位（空＝沒衝突），same＝同一筆種子。
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
    // 舊列沒【英靈源】就退回跨名比對
    if (kanshouNameCandidates_(rowName).includes(heroName) || kanshouNameCandidates_(heroName).includes(rowName)) return { name: rowName, same: true };
  }
  return { name: "", same: false };
}
// 名字比對候選集：全名／括號前後段／短名別名／拉丁大小寫三態。整檔跨名比對的地基。
function kanshouNameCandidates_(fullName) {
  const s = String(fullName || "").trim();
  const m = s.match(/^(.*?)[（(]([^（()）]*)[）)]\s*$/);
  const base = m ? [s, m[1].trim(), m[2].trim()].filter(Boolean) : [s];
  const out = base.slice();
  base.forEach(n => (KANSHOU_NAME_ALIAS_[n] || []).forEach(a => { if (out.indexOf(a) === -1) out.push(a); }));
  out.slice().forEach(n => {
    if (/[A-Za-z]/.test(n)) {
      [n.toUpperCase(), n.toLowerCase(), n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()].forEach(v => { if (out.indexOf(v) === -1) out.push(v); });
    }
  });
  return out;
}

// ══════════════ actionPlay：每回合的主流程 ══════════════
// 自己一把 90 秒的鎖（豁免全域鎖：AI 呼叫最壞 49 秒，鎖全域會卡住別人；理由見 CODE_NOTES）。
function actionPlay(userData, pcId, sheets) {
  const _lockKey = "kplay_" + String(pcId || "");
  const _cache = CacheService.getScriptCache();
  if (_cache.get(_lockKey)) return JSON.stringify({ success: false, message: "上一步還在處理中，請稍候片刻再送出。" });
  _cache.put(_lockKey, "1", 90);
  try {
    return actionPlay_(userData, pcId, sheets);
  } finally {
    _cache.remove(_lockKey);
  }
}


// ⏰ 這回合時鐘怎麼走：結束一天／兩段式就寢／跳時段／每回合流動，四條路收在一支（各自防著別條已動過時鐘）。
//   就地改 pcData 玩家列與 userData.endDay，其餘從回傳值出去。
function kanshouAdvanceClock_(ctx) {
  const userData = ctx.userData, pcData = ctx.pcData, pcIndex = ctx.pcIndex;
  const myGameId = ctx.myGameId, sameGame = ctx.sameGame, partyMembers = ctx.partyMembers;
  const dirtyPcRows = ctx.dirtyPcRows, _paceHour_ = ctx.paceHour;
  const kanshouNightSceneOn_ = ctx.nightSceneOn;
  let curDay = ctx.curDay, curHour = ctx.curHour, finalUserMsg = ctx.finalUserMsg;
  const kanshouTimeJumped_ = !!(userData.endDay === true || userData.jumpBand || (parseFloat(userData.advanceHours) || 0) > 0);

  // 結束一天／跳時段：用系統合成的訊息走同一條敘事管線，不另開路徑。
  let intimateNightNames = [];
  let kanshouNarrDay_ = null, kanshouNarrHour_ = null;
  let kanshouClockMoved_ = false;
  // 兩段式就寢第一段：按睡覺時身邊有人、還沒進過深夜 → 不結束這一天，推到就寢時刻、進「夜未眠」。
  let kanshouNightSceneNames_ = [];
  if (userData.endDay === true && !kanshouNightSceneOn_) {
    kanshouNightSceneNames_ = partyMembers.slice();
    if (kanshouNightSceneNames_.length) {
      userData.endDay = false;
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_SCENE_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], curDay);
      if (timeBand_(curHour) !== '夜' && timeBand_(curHour) !== '深夜') curHour = KANSHOU_DAY_LAST_HOUR_;
      kanshouClockMoved_ = true;
      pcData[pcIndex][COL.PC.HOUR] = curHour;
      finalUserMsg = `【玩家意圖】：夜深了，你和『${kanshouNightSceneNames_.join('、')}』留在這個房間裡，沒有要就此睡去的意思。`;
    }
  }
  if (userData.endDay === true) {
    // 結束一天＝睡到即將到來的 6:00（凌晨睡下＝同一天 6 點）。狀態時鐘推到隔天，敘事時鐘留在就寢那一刻。
    pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NIGHT_SCENE_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], 0);
    kanshouNarrDay_ = curDay;
    kanshouNarrHour_ = (timeBand_(curHour) === '夜' || timeBand_(curHour) === '深夜') ? curHour : KANSHOU_DAY_LAST_HOUR_;
    if (curHour >= 6) curDay = curDay + 1;
    curHour = 6;
    kanshouClockMoved_ = true;
    pcData[pcIndex][COL.PC.DAY] = curDay;
    pcData[pcIndex][COL.PC.HOUR] = curHour;
    // 留下過夜的＝同行的人；蓋【晨間餘韻】。名字回頭掃列一定要配 sameGame（全帳號共用表，撞名是常態）。
    intimateNightNames = partyMembers.slice();
    if (intimateNightNames.length) {
      pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], intimateNightNames.join('、'));
      pcData.forEach((r, idx) => {
        if (idx !== pcIndex && sameGame(r) && intimateNightNames.indexOf(r[COL.PC.NAME]) !== -1) dirtyPcRows.add(idx);
      });
    }
    // 睡一覺：場景回房間（布景不是位置）、所有人的肉體狀態回如常（那欄寫的是此刻，不清會跟著走好幾天）。
    pcData[pcIndex][COL.PC.LOC] = '我的房間';
    dirtyPcRows.add(pcIndex);
    kanshouRestBody_(pcData, pcIndex);
    ctx.allies.forEach(r => { const _bi = pcData.indexOf(r); kanshouRestBody_(pcData, _bi); if (_bi >= 0) dirtyPcRows.add(_bi); });
    finalUserMsg = `【一天結束】夜幕降臨，${intimateNightNames.length ? `跟『${intimateNightNames.join('、')}』一起` : ""}回到房間安頓下來，今天到此為止，明天又是新的一天。`;
  } else {
    let advanceHours = Math.max(0, Math.min(parseFloat(userData.advanceHours) || 0, 24 * 365 * 3));
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
  // 一般回合每次推進 KANSHOU_MIN_PER_TURN_ 分鐘
  if (!kanshouClockMoved_ && curHour < KANSHOU_DAY_LAST_HOUR_ && _paceHour_ > 0) {
    curHour = Math.min(KANSHOU_DAY_LAST_HOUR_, curHour + _paceHour_);
    pcData[pcIndex][COL.PC.HOUR] = curHour;
    dirtyPcRows.add(pcIndex);
  }
  return {
    curDay: curDay, curHour: curHour, finalUserMsg: finalUserMsg,
    timeJumped: kanshouTimeJumped_, clockMoved: kanshouClockMoved_,
    narrDay: kanshouNarrDay_, narrHour: kanshouNarrHour_,
    intimateNightNames: intimateNightNames, nightSceneNames: kanshouNightSceneNames_
  };
}

// 專屬稱呼 → 卡片那一小段（沒有就整段不印）。
function relMemMemoryStr_(relMem) {
  const nick = getNickname_(relMem);
  return nick ? ` [專屬稱呼:${nick}]` : "";
}
// 在場人物卡：每位壓成一句自然語言（給欄位名回來就是資料庫腔）。回 { stable, live }：
//   stable＝這個人是誰（整局不變，進 system 吃快取）；live＝此刻的樣子（每回合會動，進 user）。
function kanshouPartyCards_(ctx) {
  const pcData = ctx.pcData, myGameId = ctx.myGameId;
  const partyMembers = ctx.partyMembers, partyIdSet = ctx.partyIdSet || [];
  const kanshouTimeJumped_ = ctx.timeJumped, formatPref = ctx.formatPref, formatTrait = ctx.formatTrait;
  let stableArr = [], liveArr = [];
  const _presenceSeen_ = {};
  partyMembers.forEach(pName => {
    const r = pcData.find(row => String(row[COL.PC.NAME]).trim() === String(pName).trim() && kanshouIsAlly_(row, myGameId));
    if (r) {
      const _outfitR = kanshouOutfitLine_(r, ctx.userMsg);
      if (_outfitR.told && ctx.dirtyPcRows) ctx.dirtyPcRows.add(pcData.indexOf(r));
      const pRealName = kanshouRealName_(r);
      const pSkill = kanshouSkillLine_(kanshouSeedRowOf_(r));
      const pMemStr = relMemMemoryStr_(r[COL.PC.REL_MEM]);
      const pLogic = getPersonaLogic_(r[COL.PC.MEMORY]);
      // 關係稱呼只送【玩家自己設過】的（上了關係鎖）；AI 寫的只給面板看，送回去會變成讀自己上回合的字。
      const pRelTagStr = kanshouRelLocked_(r[COL.PC.REL_MEM], 'tag') ? String(r[COL.PC.REL_TAG] || "").trim() : "";
      // 經歷（BACK）不再常駐：走觸發條目（點名的人在場／玩家提到才亮，見 loreEntryFromBack_）。
      const pMemoirRaw = String(r[COL.PC.MEMOIR] || "").trim();
      const _pKnown = kanshouKnownOfYou_(r[COL.PC.MEMORY]);
      const pKnownStr = _pKnown.noted.length ? `${pron_(r[COL.PC.SEX])}注意到我${_pKnown.noted.join('、')}。` : "";
      // 共同回憶：釘選的常駐，其餘玩家這一步提到才亮（★是釘選標記，不外洩）。
      const _memActive = memoirActive_(pMemoirRaw, ctx.userMsg);
      const pMemoirStr = _memActive.length ? `我們一起走過：${_memActive.join('；')}。` : "";
      // 在場來由只剩「時間跳過之後」；一般回合不講（上一輪敘事就在歷史裡，沒有新資訊）
      const pPresenceStr = kanshouTimeJumped_
        ? "時間流轉之後，【依然在你身邊】(這段空白裡各自做了什麼，順著時段自然帶過)" : "";
      _presenceSeen_[pPresenceStr] = (_presenceSeen_[pPresenceStr] || 0) + 1;
      const _pPref = formatPref(r[COL.PC.PREF]), _pTrait = formatTrait(r[COL.PC.TRAIT]);
      stableArr.push(`【在場人物】${pName}。${String(r[COL.PC.SEX] || "").trim() || "異"}${pRealName ? '，真名' + pRealName : ''}。${pSkill ? `${pSkill}。` : ""}${_pPref ? `${_pPref}。` : ""}${_pTrait ? `${_pTrait}。` : ""}${pLogic ? `${pLogic}。` : ""}`);
      const _live = `__PRESENCE__${pPresenceStr}__/PRESENCE__${_outfitR.line}${pMemoirStr}${pKnownStr}${pRelTagStr ? `${pron_(r[COL.PC.SEX])}是我的「${pRelTagStr}」。` : ""}${pMemStr}`;
      liveArr.push(`${pName}：${_live}`);
    }
  });
  // 順序＝同行名單順序：加人是 append，快取前綴不動；移除中間某位才從那點斷。
  const PROMPT_PARTY_STABLE = stableArr.length > 0
    ? `【在我身邊的人】(以下是他們是誰)：\n${stableArr.join("\n")}`
    : "";
  // 在場來由人人相同時抽成抬頭講一次
  const _presenceKeys_ = Object.keys(_presenceSeen_);
  const _presenceShared_ = (_presenceKeys_.length === 1 && liveArr.length > 1) ? _presenceKeys_[0] : "";
  const _liveCards_ = liveArr.map(t => _presenceShared_
    ? t.replace(/__PRESENCE__[\s\S]*?__\/PRESENCE__/, "")
    : t.replace(/__PRESENCE__([\s\S]*?)__\/PRESENCE__/, "$1"));
  // 臨時在場的那幾位（沒跟我同行）：這段演完若該走，AI 讓他走得掉。沒有就整句不送。
  const _loose_ = partyMembers.filter(n => {
    const r = pcData.find(x => String(x[COL.PC.NAME]).trim() === String(n).trim());
    return r && partyIdSet.indexOf(String(r[COL.PC.ID])) < 0;
  });
  const _looseStr_ = _loose_.length
    ? `\n★【誰走得掉】：${_loose_.join('、')}沒有跟我同行——這一段演完若該告辭，就讓那個人離開，並在 cast.leave 填名字。` : "";
  const PROMPT_PARTY_LIVE = liveArr.length > 0
    ? `【他們此刻】：${_presenceShared_ ? `\n${_presenceShared_}` : ""}\n${_liveCards_.join("\n")}${_looseStr_}`
    : "現在沒有人跟你同行，你是一個人。";

  return { stable: PROMPT_PARTY_STABLE, live: PROMPT_PARTY_LIVE };
}

// AI 回報的當下狀態落盤（玩家與每位在場者的 身體／穿著／專屬稱呼／關係稱呼／共同回憶／她眼中的你）。
//   就地改 pcData、動到的列記進 dirtyPcRows。這是 AI 唯一能改「人的狀態」的管道，敷衍語過濾與裁切都擋在這層。
function kanshouApplyIntimacyFeedback_(ctx) {
  const aiData = ctx.aiData, pcData = ctx.pcData, pcIndex = ctx.pcIndex;
  const myGameId = ctx.myGameId, dirtyPcRows = ctx.dirtyPcRows;
  const presentIds = ctx.presentIds || [], pcName = ctx.pcName;
  if (!aiData.intimacy_feedback) return;

  const ignoreWords = ["維持現狀", "無變化", "不變", "維持", "同上", "保持現狀", "沒有變化"];   // AI 偷懶的敷衍語
  // 超過 20 字就在預算內最後一個標點處收尾（沒有標點才硬剪）
  const sanitizePhysicalState = (rawState) => {
    if (typeof rawState !== 'string') return "";
    let val = rawState.trim();
    if (!val || ignoreWords.includes(val)) return "";
    if (val.length > 20) {
      const cut = val.slice(0, 20);
      const m = cut.match(/^[\s\S]*[，、。；！？]/);
      val = m ? m[0].replace(/[，、；]$/, "") : cut;
    }
    return ignoreWords.includes(val) ? "" : val;
  };
  const sanitizeAppearanceExtras = (rawOutfit) => {
    if (typeof rawOutfit !== 'string') return "";
    const val = rawOutfit.trim()
      .replace(/^(剛?(換|穿|披|套|繫|著)上了?|換回了?|改穿了?)\s*/, "")
      .replace(/^(一件|一身|一套|一襲)\s*/, "")
      .replace(/[。！!，,]+$/, "").trim();
    return (!val || ignoreWords.includes(val)) ? "" : val;
  };
  // 頓號串的 append→去重→留最新 maxCount 項（專屬稱呼用）
  const processTags = (oldMem, regex, newTagStr, maxCount) => {
    let oldStr = (oldMem.match(regex) || [])[1]?.trim() || "無";
    let arr = (oldStr === "無" || oldStr === "") ? [] : oldStr.replace(/^\.\.\./, "").split('、').map(x => x.trim()).filter(x => x !== "");
    let newItems = String(newTagStr || "").trim();
    if (newItems && newItems !== "無") {
      newItems.split('、').map(x => x.trim()).filter(x => x !== "").forEach(item => { if (!arr.includes(item)) arr.push(item); });
    }
    if (arr.length === 0) return "無";
    return (arr.length > maxCount ? arr.slice(-maxCount) : arr).join('、');
  };
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
      const targetIdx = pcData.findIndex(r => kanshouNameCandidates_(r[COL.PC.NAME]).includes(tName) && kanshouIsAlly_(r, myGameId));
      if (targetIdx === -1) return;
      if (presentIds.indexOf(String(pcData[targetIdx][COL.PC.ID])) < 0) return;   // 只寫得進這一幕真的在場的人

      dirtyPcRows.add(targetIdx);
      const nCleanState = sanitizePhysicalState(nfb.physical_state);
      if (nCleanState) pcData[targetIdx][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[targetIdx][COL.PC.PHYSICAL], nCleanState);
      const nAppearanceExtras = sanitizeAppearanceExtras(nfb.appearance_extras);
      if (nAppearanceExtras) pcData[targetIdx][COL.PC.MEMORY] = setOutfit_(pcData[targetIdx][COL.PC.MEMORY], nAppearanceExtras);

      // 專屬稱呼與兩把鎖住 REL_MEM；上了鎖的格 AI 碰不到
      let oldRMem = pcData[targetIdx][COL.PC.REL_MEM] || "";
      const _locks = { nick: kanshouRelLocked_(oldRMem, 'nick'), tag: kanshouRelLocked_(oldRMem, 'tag') };
      const _nickValue = _locks.nick
        ? (getNickname_(oldRMem) || "無")
        : processTags(oldRMem, /\[專屬稱呼\](.*?)(?=\| \[|$)/,
          String(nfb.mutual_nicknames || "").split('、').map(sanitizeNickname_).filter(Boolean).join('、'), 3);
      pcData[targetIdx][COL.PC.REL_MEM] = kanshouRelMemBuild_(_nickValue, _locks);

      // 關係稱呼只有玩家能填（2026-09-23：AI 每回合換一個「嚴格的餐桌守護者」，schema 已拿掉 rel_tag；舊模型仍回傳也一律不收）。
      if (nfb.memory && String(nfb.memory).trim() && String(nfb.memory).trim() !== "無") {
        pcData[targetIdx][COL.PC.MEMOIR] = processMemoir_(pcData[targetIdx][COL.PC.MEMOIR], nfb.memory, KANSHOU_MEMOIR_CAP_);
      }
      // 她眼中的你：存在【她列上】，每個人各記各的，同一個玩家在不同人眼中才會不一樣
      if (nfb.noticed && String(nfb.noticed).trim() && String(nfb.noticed).trim() !== "無") {
        pcData[targetIdx][COL.PC.MEMORY] = KANSHOU_NOTED_TAG_.set(
          pcData[targetIdx][COL.PC.MEMORY],
          kanshouAppendUnique_(KANSHOU_NOTED_TAG_.get(pcData[targetIdx][COL.PC.MEMORY]), stripStanding_(nfb.noticed),
            { sep: KANSHOU_NOTED_SEP_, cap: KANSHOU_NOTED_CAP_, maxLen: KANSHOU_NOTED_LEN_ }));
      }
    });
  }
}

// 每回合主流程：讀卡 → 時鐘 → 在場 → 組提示詞 → 叫 AI → cast／scene／回寫／帳本 → 只寫動到的列。
function actionPlay_(userData, pcId, sheets) {
  const userMsg = String(userData.message || "").replace(/[｜【】]/g, "");   // endDay 不一定帶 message
  if (String(pcId || "").indexOf("KPC_") !== 0) return JSON.stringify({ text: "此功能僅限鑑賞使用。" });
  const driveOn = (userData.drive === true || String(userData.drive) === "true");   // 🔥 換敢寫的那顆模型

  // 卡片前兩格→一句人話（別加「表面／骨子裡」標籤：「表面」語意是裝出來的）。
  //   喜歡／討厭是話題道具，走觸發條目（kanshouLoreStr_），玩家提到才給。
  const _qv = (v) => { const t = String(v || "").trim(); return QUAD_EMPTY_.indexOf(t) < 0 ? t : ""; };
  const formatPref = (str) => {
    const a = String(str || "").split('、');
    return [_qv(a[0]), _qv(a[1])].filter(Boolean).join('，');
  };

  const formatTrait = (str) => {
    const a = traitParts_(str);
    return [_qv(a[0]), _qv(a[1])].filter(Boolean).join('，');
  };

  let pcData = sheets.pc.getDataRange().getValues();
  const pcIndex = kanshouPcIdx_(pcData, pcId);
  if (pcIndex === -1) return JSON.stringify({ text: "查無此人" });
  const pc = pcData[pcIndex];
  const pcName = pc[COL.PC.NAME];
  let curDay = parseInt(pc[COL.PC.DAY]) || 1;
  let curHour = (pc[COL.PC.HOUR] === "" || pc[COL.PC.HOUR] == null) ? 8 : (parseFloat(pc[COL.PC.HOUR]) || 0);
  const myGameId = pc[COL.PC.GAME_ID] ? String(pc[COL.PC.GAME_ID]) : "";
  const sameGame = (r) => !myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId;
  // 這一局的正式同伴：算一次，下面全程複用（原本同一個 filter 跑六遍）。
  const allies = pcData.filter(r => r !== pc && kanshouIsAlly_(r, myGameId));
  const _paceHour_ = KANSHOU_MIN_PER_TURN_ / 60;
  let finalUserMsg = `【玩家原話】：${userMsg}`;
  const dirtyPcRows = new Set([pcIndex]);

  const _myOutfitR = kanshouOutfitLine_(pc, userMsg);
  if (_myOutfitR.told) dirtyPcRows.add(pcIndex);
  // 晨間餘韻讀一次就清，只給緊接著的下一回合
  const morningAfterNames = KANSHOU_MORNING_AFTER_TAG_.get(pc[COL.PC.MEMORY]);
  if (morningAfterNames) pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_MORNING_AFTER_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], '');
  const kanshouNightSceneOn_ = KANSHOU_NIGHT_SCENE_TAG_.get(pcData[pcIndex][COL.PC.MEMORY]) === curDay;

  // 同行名單：判準是「寫過沒有」不是「值空不空」（玩家按清空是空值，不會被重新種回去）。
  if (!KANSHOU_PARTY_TAG_.has(pc[COL.PC.MEMORY])) {
    pcData[pcIndex][COL.PC.MEMORY] = kanshouSetParty_(pc[COL.PC.MEMORY], []);
    dirtyPcRows.add(pcIndex);
  }
  const partyRows = kanshouGetParty_(pc[COL.PC.MEMORY])
    .map(id => allies.find(r => String(r[COL.PC.ID]) === id))
    .filter(Boolean).slice(0, KANSHOU_PARTY_MAX_);
  const partyMembers = partyRows.map(r => String(r[COL.PC.NAME]));

  const _clk_ = kanshouAdvanceClock_({
    userData: userData, pcData: pcData, pcIndex: pcIndex, myGameId: myGameId, sameGame: sameGame, allies: allies,
    partyMembers: partyMembers, dirtyPcRows: dirtyPcRows, paceHour: _paceHour_,
    nightSceneOn: kanshouNightSceneOn_, curDay: curDay, curHour: curHour, finalUserMsg: finalUserMsg
  });
  curDay = _clk_.curDay; curHour = _clk_.curHour; finalUserMsg = _clk_.finalUserMsg;
  const kanshouTimeJumped_ = _clk_.timeJumped;
  const intimateNightNames = _clk_.intimateNightNames;
  const kanshouNightSceneNames_ = _clk_.nightSceneNames;
  // 提示詞讀敘事時鐘（只有 endDay 會跟狀態時鐘不同）
  const _narrDay_ = (_clk_.narrDay === null) ? curDay : _clk_.narrDay;
  const _narrHour_ = (_clk_.narrHour === null) ? curHour : _clk_.narrHour;
  const curDateObj_ = kanshouAbsDayToDate_(_narrDay_);   // 只給季節與時段的字，數字留在 HUD：給了年月日時分，模型會整串念進敘事
  // 「冬天的清晨」只在時段換了才送：每回合都送，模型每回合都拿它當開頭（「冬天的清晨帶著幾分薄霧…」×5）。講過的存【此刻已述】。
  //   例外：玩家這句話提到時間（下午／晚餐／今晚…）就再錨一次「仍是冬天的清晨」——不錨，模型會順著「下午去新都」直接把天寫黑。
  const _nowNow_ = `${kanshouSeason_(curDateObj_.month)}的${timeBand_(_narrHour_)}`;
  const _nowTold_ = KANSHOU_NOW_TOLD_TAG_.get(pc[COL.PC.MEMORY]) === _nowNow_;
  const _nowAsked_ = KANSHOU_TIME_KEYS_.some(function (k) { return userMsg.indexOf(k) >= 0; });
  const _nowWords_ = !_nowTold_ ? _nowNow_ : (_nowAsked_ ? `仍是${_nowNow_}` : "");
  if (!_nowTold_) { pcData[pcIndex][COL.PC.MEMORY] = KANSHOU_NOW_TOLD_TAG_.set(pcData[pcIndex][COL.PC.MEMORY], _nowNow_); dirtyPcRows.add(pcIndex); }

  // 在場＝同行（玩家的）∪ 臨時在場（AI 的）。同行永遠排前面、永遠進得去；臨時在場填到上限為止。
  const presentRows = (() => {
    const _seen = {}, _out = [];
    partyRows.forEach(r => { _seen[String(r[COL.PC.ID])] = 1; _out.push(r); });
    kanshouGetOnstage_(pc[COL.PC.MEMORY]).forEach(id => {
      if (_seen[id] || _out.length >= KANSHOU_ONSTAGE_MAX_) return;
      const r = allies.find(x => String(x[COL.PC.ID]) === id);
      if (r) { _seen[id] = 1; _out.push(r); }
    });
    return _out;
  })();
  const presentMembers = presentRows.map(r => String(r[COL.PC.NAME]));

  // ★【這座城裡還住著】：待命者只給名字（沒有地點、沒有近況——近況刻意不存，存了就固化）。
  const kanshouWorldRosterStr = (() => {
    const _hereIds = presentRows.map(r => String(r[COL.PC.ID]));
    const _elsewhere = allies.filter(r => _hereIds.indexOf(String(r[COL.PC.ID])) < 0)
      .sort((a, b) => KANSHOU_MET_COUNT_TAG_.get(b[COL.PC.MEMORY]) - KANSHOU_MET_COUNT_TAG_.get(a[COL.PC.MEMORY]))
      .slice(0, KANSHOU_WORLD_ROSTER_CAP_);
    if (!_elsewhere.length) return "";
    const _list = _elsewhere.map(r => String(r[COL.PC.NAME] || "")).filter(Boolean).join('、');
    return `\n★【這座城裡還住著】：${_list}。我們都認識他們，他們此刻不在這一幕裡；我問起誰，就依此刻的時段說說那個人這時候大概在做什麼；我去找誰、或誰該出現在這一幕了，就把那個人寫進來並在 cast.join 填名字。`;
  })();
  // 相處計數 +1（跳時間／過夜的回合不計）
  presentRows.forEach(r => {
    const _ri = pcData.indexOf(r);
    if (_ri < 0) return;
    if (!kanshouTimeJumped_) {
      pcData[_ri][COL.PC.MEMORY] = KANSHOU_MET_COUNT_TAG_.set(
        pcData[_ri][COL.PC.MEMORY], KANSHOU_MET_COUNT_TAG_.get(r[COL.PC.MEMORY]) + 1);
      dirtyPcRows.add(_ri);
    }
  });
  // 昨夜線依「這回合她在不在場」過濾（旗標回合開頭就讀掉了）
  const _morningHere_ = String(morningAfterNames || "").split('、').map(n => n.trim())
    .filter(n => n && presentMembers.indexOf(n) !== -1).join('、');
  const kanshouNightSceneStr = (kanshouNightSceneOn_ || kanshouNightSceneNames_.length)
    ? `\n★【夜已深·門關上了】：這個房間此刻只剩你和『${(kanshouNightSceneNames_.length ? kanshouNightSceneNames_ : presentMembers).join('、')}』，外頭安靜下來，今晚不會再有別人進來，時間也不急著走。★這一段【還沒有結束】：這一夜什麼時候收，由玩家自己決定、系統會宣告；本回合只演此刻正在發生的這 ${KANSHOU_MIN_PER_TURN_} 分鐘，結尾一樣停在進行式、把下一步交還玩家。`
    : "";

  const _cards_ = kanshouPartyCards_({
    pcData: pcData, myGameId: myGameId, partyMembers: presentMembers,
    partyIdSet: partyRows.map(r => String(r[COL.PC.ID])),
    timeJumped: kanshouTimeJumped_, formatPref: formatPref, formatTrait: formatTrait, userMsg: userMsg, dirtyPcRows: dirtyPcRows
  });
  const PROMPT_PARTY_LIVE = _cards_.live;

  // 女×女的【身體】說明 2026-09-23 整段拿掉（玩家「只要告訴 AI 要確實分辨性別」）：改成固定模組 gender 那一句。

  const _mePron_ = pron_(pc[COL.PC.SEX]);   // 御主性別是資料，代名詞不寫死

  // 身體狀態：PHYSICAL 欄 JSON→一句話（預設「如常」不送）。try/catch：位置索引錯位時別讓這個人每回合都拋錯。
  let pPhysicalObj = {}; try { pPhysicalObj = JSON.parse(pcData[pcIndex][COL.PC.PHYSICAL] || "{}"); } catch (e) { }
  if (Object.keys(pPhysicalObj).length === 0) pPhysicalObj = { "狀態": "如常" };
  const _isPlainBody_ = o => Object.keys(o).length === 1 && o["狀態"] === "如常";
  const _bodyLine_ = o => Object.keys(o).map(k => String(o[k])).filter(Boolean).join('、');
  let nsfwMemories = `${_isPlainBody_(pPhysicalObj) ? "" : `\n我此刻身上：${_bodyLine_(pPhysicalObj)}。`}`;
  presentRows.forEach(r => {
    let npcPhysicalObj = {}; try { npcPhysicalObj = JSON.parse(r[COL.PC.PHYSICAL] || "{}"); } catch (e) { }
    if (Object.keys(npcPhysicalObj).length === 0) npcPhysicalObj = { "狀態": "如常" };
    if (!_isPlainBody_(npcPhysicalObj)) nsfwMemories += `\n${r[COL.PC.NAME]}此刻身上：${_bodyLine_(npcPhysicalObj)}。`;
  });

  // 篇幅：一律給下限~上限（小模型對「約 X 字」往下取）；上限要跟 max_tokens 一起看，JSON 開銷約 1057 字。
  const KANSHOU_WORDS_ = { range: '400~520', big: '600~750' };
  const _kanshouBigBeat_ = !!kanshouNightSceneStr;   // 大事＝這回合真的組出了那段，不靠猜
  const _styles_ = kanshouStyleRead_(myGameId);
  const _lenTier_ = kanshouLenTier_((_styles_['lenTier'] || {}).text);
  const _kanshouTargetWords_ = _lenTier_.words || (_kanshouBigBeat_ ? KANSHOU_WORDS_.big : KANSHOU_WORDS_.range);

  // 身體兩塊壓在最後：事實寫在 20 行以前會被當成沒發生（實測女性身體照樣「挺腰撞進去」）。
  const PROMPT_BODY = `${nsfwMemories}`;

  const _worldFeed_ = worldFeed_(myGameId, worldRead_(myGameId), presentMembers, userMsg, curDay,
    allies.map(r => String(r[COL.PC.NAME])));
  const _loreStr_ = kanshouLoreStr_({
    userMsg: userMsg, pc: pc, presentRows: presentRows,
    lastNarration: KANSHOU_LORE_SCAN_AI_ ? ((getGameHistoryBatchRaw(pcId, 2).filter(m => m.speaker === 'ai').pop() || {}).content || "") : ""
  });

  // 排序原則：穩定的放前面、每回合會變的放後面（prompt cache 逐 token 比前綴，中間一變後面全作廢）。
  //   例外是在場名單那類 recency 特別重要的，仍壓在最後。
  const _styleVars_ = { '玩家': pcName, '代名詞': _mePron_, '篇幅': _kanshouTargetWords_ };
  const _sty_ = k => kanshouStyle_(_styles_, k, _styleVars_);
  const prompt = `${_sty_('world')}
★【誰在場】：有【專屬稱呼】就叫暱稱。卡片與帳本都沒提到的路人不具名。
★【world_note】：這一步新出現的地方/人/規矩，寫進去才會留下；挑之後還會再遇到、再提起的寫，最多 ${WORLD_SPEC_.kanshou.writeMax} 筆。

【我自己】(只給旁白寫「我」的內心用，在場的人沒讀過這張)：${pcName}，${pc[COL.PC.SEX]}，在場的人當面叫我是「${pronYou_(pc[COL.PC.SEX])}」。${(() => { const _p = formatPref(pc[COL.PC.PREF]); return _p ? `${_p}。` : ""; })()}${(() => { const _t = formatTrait(pc[COL.PC.TRAIT]); return _t ? `${_t}。` : ""; })()}${_myOutfitR.line}${pc[COL.PC.BACK] || ""}。
${PROMPT_PARTY_LIVE}
${_lenTier_.free ? '' : _sty_('length')}
${kanshouWorldRosterStr}${_worldFeed_}${_loreStr_}${kanshouNightSceneStr}
${(() => { const _sc = String(pc[COL.PC.LOC] || "").trim(); return _sc ? `★【現在地點】：${_sc}。\n` : ""; })()}★【此刻】${_nowWords_ ? _nowWords_ + '。' : ''}這一幕就寫這 ${KANSHOU_MIN_PER_TURN_} 分鐘。${intimateNightNames.length ? `\n★【今晚留下的人】：『${intimateNightNames.join('、')}』今晚跟我一起過夜——這一夜怎麼過，依各人的個性與你們之間的歷史決定。` : ""}${_morningHere_ ? `\n★【晨間餘韻·非強制】：昨夜與『${_morningHere_}』或許共度親密(依上回合實際內容·沒跨出就當平常早晨)·可自然帶晨間溫馨曖昧·不強制不複述細節。` : ""}

${presentMembers.length ? '' : '★【在場】：這個地方只有我一個人（常民與路人照常可以出現）。'}

${PROMPT_BODY}

接著往下演。玩家這一步（已在畫面上）：${finalUserMsg}`.replace(/\n{3,}/g, '\n\n');

  try {
    // 🔥 只管用哪顆模型（平常便宜的，按了換敢寫的）；尺度一律跟著玩家走。
    let aiConfig = { temperature: 1.08, top_p: 0.97, top_k: 60, repetition_penalty: 1.12, presence_penalty: 0.25, frequency_penalty: 0.25, retries: 1, model: driveOn ? LEWD_MODEL : KANSHOU_MODEL, isNsfwMode: driveOn, sessionId: 'k_' + myGameId, max_tokens: (kanshouTimeJumped_ && presentRows.length === 0) ? 700 : (_lenTier_.tokens || 2400) };

    // 逐字對話歷史（KANSHOU_HIST_WINDOW_ 則）轉 API 格式
    const recentHistoryRaw = getGameHistoryBatchRaw(pcId, KANSHOU_HIST_WINDOW_);
    if (recentHistoryRaw && recentHistoryRaw.length > 0) {
      aiConfig.chatHistory = recentHistoryRaw.map(msg => ({
        role: msg.speaker === "player" ? "user" : "assistant",
        content: String(msg.content)
      }));
    }

    const _sysPrompt = buildDefaultSystemPrompt(userData.optionsOn !== false, _styles_, _cards_.stable);
    const aiResponseRaw = callGeminiAPI(prompt, _sysPrompt, aiConfig);
    // 截斷的 JSON／純文字道歉是常態不是例外
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

    // 🎭 誰進誰出：AI 只動得了【臨時在場】——①同行者 leave 無效 ②只認這一局查得到 id 的名字 ③總數封頂。
    if (aiData.cast) {
      const _partyIds = kanshouGetParty_(pcData[pcIndex][COL.PC.MEMORY]);
      let _on = kanshouGetOnstage_(pcData[pcIndex][COL.PC.MEMORY]);
      const _idOf = nm => {
        const r = allies.find(x => kanshouNameCandidates_(x[COL.PC.NAME]).includes(String(nm).trim()));
        return r ? String(r[COL.PC.ID]) : "";
      };
      (aiData.cast.leave || []).forEach(nm => {
        const id = _idOf(nm);
        if (!id || _partyIds.indexOf(id) >= 0) return;   // 同行者走不了
        _on = _on.filter(x => x !== id);
      });
      (aiData.cast.join || []).forEach(nm => {
        const id = _idOf(nm);
        if (!id || _partyIds.indexOf(id) >= 0 || _on.indexOf(id) >= 0) return;
        if (_partyIds.length + _on.length >= KANSHOU_ONSTAGE_MAX_) return;
        _on.push(id);
      });
      const _next = kanshouSetOnstage_(pcData[pcIndex][COL.PC.MEMORY], _on);
      if (_next !== pcData[pcIndex][COL.PC.MEMORY]) {
        pcData[pcIndex][COL.PC.MEMORY] = _next;
        dirtyPcRows.add(pcIndex);
      }
    }

    // 🎬 背景場景（不是地點系統，就一句話的布景）借玩家列的 COL.PC.LOC 存；solo 的 LOC 仍是真地點。
    {
      const _sc = String(aiData.scene || "").replace(/[<>&"'`｜【】\[\]★\r\n\t]/g, "").trim().slice(0, 12);
      if (_sc && _sc !== String(pcData[pcIndex][COL.PC.LOC] || "").trim()) {
        pcData[pcIndex][COL.PC.LOC] = _sc;
        dirtyPcRows.add(pcIndex);
      }
    }

    kanshouApplyIntimacyFeedback_({
      aiData: aiData, pcData: pcData, pcIndex: pcIndex, myGameId: myGameId,
      dirtyPcRows: dirtyPcRows, presentIds: presentRows.map(r => String(r[COL.PC.ID])), pcName: pcName
    });

    // 🌍 AI 發明的東西落盤（唯一寫入點）。先改判分錯的類，再落盤——順序反了防線等於沒接上。
    if (Array.isArray(aiData.world_note) && aiData.world_note.length) {
      try { kanshouFixWorldKinds_(aiData.world_note, getKanshouHomeName_(pcData[pcIndex][COL.PC.MEMORY], pcName), allies.map(r => r[COL.PC.NAME])); } catch (e) { }
      try { aiData.world_note = worldNoteDropEcho_(aiData.world_note, _loreStr_, allies.map(r => r[COL.PC.NAME])); } catch (e) { }
      try { if (aiData.world_note.length) worldWrite_(myGameId, aiData.world_note, curDay); } catch (e) { }
    }

    const pcColCount = Object.keys(COL.PC).length;
    // 列索引是 AI 呼叫【前】讀的，期間別的動作可能刪列——寫回前重定位，只寫動到的列。
    const liveIdx = buildLiveIdIndex_(sheets.pc);
    dirtyPcRows.forEach(idx => {
      const row = pcData[idx];
      if (!row) return;
      const id = String(row[COL.PC.ID] || "");
      if (!id.startsWith("PC_") && !id.startsWith("NPC_") && !id.startsWith("DEAD_") && !id.startsWith("KPC_") && !id.startsWith("KSV_") && !id.startsWith("KHV_")) return;
      const curIdx = liveIdx[id];
      if (curIdx === undefined) return;
      while (row.length < pcColCount) row.push("");
      sheets.pc.getRange(curIdx + 1, 1, 1, pcColCount).setValues([row]);
    });

    const finalResponseText = (aiData.narration || "天地混沌，一片寂靜。").replace(/\n/g, "<br>");

    saveGameHistoryBatch(pcId, [
      { speaker: "player", content: userMsg },
      { speaker: "ai", content: String(aiData.narration || "").replace(/<br\s*\/?>/gi, "\n") }
    ]);

    // pcData 已是寫回後的權威陣列，順便夾一份 get_tags 同格式的 payload，前端省一趟 round-trip
    let tagsPayload = null;
    try { const tp = buildTagsPayload_(sheets, pcId, pcData); if (tp && tp.success) tagsPayload = tp; } catch (e) { }

    let kanshouClock = null;
    try { kanshouClock = kanshouClockInfo_(pcData[pcIndex]); } catch (e) { }

    return JSON.stringify({
      text: finalResponseText,
      statusString: buildPlayerStatusString(pcData[pcIndex]),
      options: aiData.options,
      tags: tagsPayload,
      kanshouClock: kanshouClock,
      clock: kanshouClock ? kanshouClock.label : ""   // 共用 HUD 讀的是 data.clock
    });

  } catch (e) {
    return JSON.stringify({ success: false, message: "出錯了。" });
  }
}


