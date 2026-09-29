// ==========================================
// 命運停駐之夜 - 核心系統 (2026.05 雙軌防護 + JSON結構化批量I/O 極致優化版)
// 🔴【第一部分：基礎設定、ORM 映射與數值統計核心】Core_Settings.gs
// ==========================================

// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。
// 🔵 2026-07 玩家定案：只認 OPENROUTER_API_KEY 這一個指令碼屬性名稱，舊的相容別名一併砍除。
const OPENROUTER_API_KEY = (function () {
  return PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY') || '';
})();
const MODEL_URL = "https://openrouter.ai/api/v1/chat/completions";
// 🎴 solo 主力：2026-09 玩家定案「SOLO 繼續 GEMINI、補魔換 GROK、鑑賞直接 GROK」——
//    兩軌不再共用同一顆。solo 是 SFW 戰鬥敘事，Gemini 夠用也快；鑑賞與補魔走 LEWD_MODEL。
const AI_MODEL = (function () {
  return PropertiesService.getScriptProperties().getProperty('MODEL') || 'google/gemini-3.5-flash';
})();
// ⚠ 後援必須跟主力【不同顆】：Engine_Combat 的換模型條件是 fallbackName !== modelName，
//    兩邊填一樣的話整條後援路徑會靜靜失效（被審查擋下就沒有第二次機會了）。
const FALLBACK_MODEL = (function () {
  return PropertiesService.getScriptProperties().getProperty('FALLBACK_MODEL') || 'x-ai/grok-4.20';
})();
// 創角/創英靈：2026-09 玩家指定改回 flash-lite（欄位都有字數上限、格式固定，不需要更大的一顆）。
const CREATION_MODEL = (function () {
  return PropertiesService.getScriptProperties().getProperty('CREATION_MODEL') || 'google/gemini-3.5-flash-lite';
})();
// 🔞 NSFW 專用後援：預設【不設】。主力已經是敢寫的那顆，被審查擋下時退回一般後援(gemini)
//    只會再被擋一次——玩家白等一整輪重試，結果還是同一句失敗提示。真的找到第二顆敢寫的，
//    再把 LEWD_FALLBACK_MODEL 這個指令碼屬性填上即可，程式碼不必改。
const LEWD_FALLBACK_MODEL = (function () {
  return PropertiesService.getScriptProperties().getProperty('LEWD_FALLBACK_MODEL') || '';
})();
// 🌹 鑑賞【平常】用的那顆：2026-09 玩家「不然就改回平常為 Gemini 3.5 Flash Lite，我自己點火再開」。
//    日常聊天佔絕大多數回合，用便宜的那顆；要露骨時玩家自己按 🔥 切到 LEWD_MODEL。
//    ⚠ 這是拿【敘事品質】換錢：Flash Lite 寫出來的東西比 Grok 平，而且碰到露骨內容會直接被擋。
//      被擋時的提示詞要明講「按 🔥 再試一次」，別讓玩家看到一句莫名其妙的失敗訊息。
const KANSHOU_MODEL = (function () {
  return PropertiesService.getScriptProperties().getProperty('KANSHOU_MODEL') || 'google/gemini-3.5-flash-lite';
})();
// 🔞 敢寫的那顆：補魔三支（solo 僅有的露骨橋段）＋鑑賞【按了 🔥】的回合走它。
const LEWD_MODEL = (function () {
  return PropertiesService.getScriptProperties().getProperty('LEWD_MODEL') || 'x-ai/grok-4.20';
})();

// ==========================================
// ★ 階段一：ORM 資料實體映射 (Data Mapping) 
// ==========================================
const COL = {
  // 眾生：鑑賞的角色列（御主＋同伴）。關係欄＝那名同伴對本局御主；DAY/HOUR 只在御主那一列有意義。
  // ⚠ 位置索引，棄用的欄位留著占位（清單與理由見 check_seed.py 的 DEAD_COL_ALLOW）。
  PC: {
    ID: 0, NAME: 1, SEX: 2, BACK: 3, STATUS: 4, TRAIT: 5, LOC: 6, PREF: 7,
    HP: 8, MP: 9, MAX_HP: 10, MAX_MP: 11,
    MEMORY: 12, INTENT: 13, FACTION: 14, RANK: 15, CONTRIB: 16, ALIGN: 17,
    PHYSICAL: 18, MARTIAL: 19, GAME_ID: 20, SIX: 21, TAGS: 22, SEEN: 23,
    BOND: 24, REL_TAG: 25, IS_PARTY: 26, MEMOIR: 27, REL_MEM: 28,
    DAY: 29, HOUR: 30, AP: 31, HOME_LOC: 32,
    MONEY: 33, UPKEEP_WEEK: 34, ROOM: 35
  },
  // 英靈殿（從者範本）：DAILY_* 是鑑賞用的日常版，跟戰時 PERSONA 分開存（見 CODE_NOTES.md）。
  HERO: { ID: 0, CLS: 1, NAME: 2, SEX: 3, SIX: 4, CLASS_SKILLS: 5, SKILLS: 6, TRAITS: 7, NP: 8, PERSONA: 9, ALIGN: 10, WARS: 11, SOURCE: 12, DAILY_LOOK: 13, DAILY_WORDS: 14, DAILY_MOE: 15, DAILY_OUTFIT: 16 },
  // 帳號（存檔身分）：帳號名 → 目前御主角色ID。
  ACC: { NAME: 0, PC: 1, CREATED: 2, KPC: 3 }
};


// ==========================================
// ★ 階段二：通用輔助模組 (Helper Functions)
// ==========================================

// 🟢 姓名限定純中文：移除所有非中日韓統一表意文字(CJK 含擴展A)的字元——英數、符號、空白、emoji 全部濾除。
function cleanChineseName(s) {
  return String(s == null ? "" : s).replace(/[^㐀-䶿一-鿿]/g, "").slice(0, 10);
}


// AI 呼叫後寫回前的列重定位索引：play/backfill 因 AI 呼叫耗時被豁免寫入鎖(LOCK_EXEMPT)，用的是呼叫前讀到的列索引；期間若其他上鎖動作刪列(清殘列/登入自動清)，索引會位移錯位。
function findPcRowIdx_(pcData, gid, opts) {
  opts = opts || {};
  const excludeIdx = opts.excludeIdx;
  // 共用篩選(game_id/存活/陣營/地點)——id路徑跟名字路徑都要套，id只是「認人」這一步的捷徑，不能順便繞過「她此刻是否真的在場/仍在世」這些遊戲規則本身要求的條件(不然id快取到舊值，會讓玩家對一個其實已經不在場的人牽手/邀約成功)。
  const passesFilters = function (r, i) {
    if (i === excludeIdx) return false;
    if (gid && String(r[COL.PC.GAME_ID] || "") !== String(gid)) return false;
    if (opts.aliveOnly !== false && String(r[COL.PC.ID]).startsWith("DEAD_")) return false;
    if (opts.faction && String(r[COL.PC.FACTION]) !== opts.faction) return false;
    if (opts.loc != null && String(r[COL.PC.LOC] || "").trim() !== String(opts.loc).trim()) return false;
    return true;
  };
  if (opts.id) {
    const idx = pcData.findIndex(function (r, i) { return String(r[COL.PC.ID]) === String(opts.id) && passesFilters(r, i); });
    if (idx !== -1) return idx;
  }
  if (!opts.name) return -1;
  const norm = opts.normalize || function (s) { return String(s).trim(); };
  const cands = (opts.nameCandidates ? opts.nameCandidates(String(opts.name)) : [String(opts.name).trim()]).map(norm);
  return pcData.findIndex(function (r, i) { return passesFilters(r, i) && cands.indexOf(norm(r[COL.PC.NAME])) !== -1; });
}

function buildLiveIdIndex_(sheet) {
  var map = {};
  try {
    var last = sheet.getLastRow();
    if (last < 1) return map;
    var ids = sheet.getRange(1, COL.PC.ID + 1, last, 1).getValues();
    for (var i = 0; i < ids.length; i++) { var v = String(ids[i][0] || ""); if (v) map[v] = i; }
  } catch (e) { }
  return map;
}


// MEMORY 標記共用工廠：收斂 Router_Battle.gs/Router_Movement.gs 多組結構相同的數值型/文字型 get/set正則邏輯。
function makeIntTag_(tagName, defaultVal) {
  var reGet = new RegExp('【' + tagName + '】(\\d+)');
  var reStrip = new RegExp('｜?【' + tagName + '】\\d+', 'g');
  function strip(memory) {
    var s = String(memory || '').replace(reStrip, '');
    return s.replace(/｜｜/g, '｜').replace(/^｜|｜$/g, '');
  }
  return {
    get: function (memory) { var m = String(memory || '').match(reGet); return m ? parseInt(m[1]) : defaultVal; },
    set: function (memory, n) { var s = strip(memory); return (s ? s + '｜' : '') + '【' + tagName + '】' + n; },
    clear: function (memory) { return strip(memory); }
  };
}
// 文字型（無驗證/截長度，給已受信任的內部字串如地點名用；換裝/武裝需過濾使用者輸入，維持獨立實作）：set 沿用舊版「單次test+原地replace，找不到才附加」寫法，行為與 getWorkshop_/getScavengedLoc_ 等既有實作一致。
function makeTextTag_(tagName) {
  var reGet = new RegExp('【' + tagName + '】([^｜|【]+)');
  var reSet = new RegExp('【' + tagName + '】[^｜|【]*');   // 字元類與 reGet 對齊(舊版漏了半形 |)
  return {
    get: function (memory) { var m = String(memory || '').match(reGet); return m ? m[1].trim() : ''; },
    // 「寫過沒有」跟「值是不是空的」是兩件事：空值(【X】)仍然算寫過。
    has: function (memory) { return reSet.test(String(memory || '')); },
    set: function (memory, val) {
      var s = String(memory || '');
      // 🛡️ 寫入值一律先剝掉 MEMORY 的結構字元：｜是標記分隔符、【】是標記邊界，混進值裡會把整條MEMORY 切錯格(後面所有標記靜默失效或被誤讀)。
      var v = String(val == null ? '' : val).replace(/[｜|【】]/g, '');
      if (reSet.test(s)) return s.replace(reSet, '【' + tagName + '】' + v);
      return (s ? s + '｜' : '') + '【' + tagName + '】' + v;
    }
  };
}

// 👕 從者換裝（存從者 MEMORY【換裝】<服裝文字>）：玩家自訂當前【服裝穿著】·疊在種子外貌本相之上餵給 AI 敘述——只換衣不換人(五官/髮色/體態/氣質仍依 persona.look)。
function getOutfit_(memory) { var m = String(memory || "").match(/【換裝】([^｜【】]*)/); return m ? m[1].trim() : ""; }
function setOutfit_(memory, text) { var s = clearOutfit_(String(memory || "")); text = String(text || "").replace(/[｜【】\n\r\t]/g, "").replace(/[<>&"'`]/g, "").trim().slice(0, 40); if (!text) return s; return s ? s + "｜【換裝】" + text : "【換裝】" + text; }
function clearOutfit_(memory) { return String(memory || "").replace(/｜?【換裝】[^｜【】]*/g, ""); }


// 性別→代名詞。兩軌共用：solo 的御主/從者、鑑賞的同伴都從資料算，不在提示詞裡寫死。
// 查無(含「異」「無」「」)一律退回中性「TA」——寧可中性，不要猜錯性別。
var PRONOUN_ = { '男': '他', '女': '她' };
function pron_(sex) { return PRONOUN_[String(sex || '').trim()] || 'TA'; }
// 第二人稱的字：中文的「你／妳」也分性別，而別人【當面叫玩家】用的就是這個字。
// 2026-09 玩家「NPC 叫玩家的 妳/你 要確實依照性別」——一樣從資料算，不在提示詞裡寫死。
// 查無一律退回「你」：它在中文裡本來就兼作通用，猜錯性別比較傷。
var PRONOUN_YOU_ = { '女': '妳' };
function pronYou_(sex) { return PRONOUN_YOU_[String(sex || '').trim()] || '你'; }


// 短句(外貌/性格)的落地硬上限與提示詞對 AI 宣告的字數，所有生成短句的提示詞都要把 TRAIT_SEG_HINT_ 講出來。
// ⚠ 兩個數字要留一段距離：HINT 是講給 AI 聽的目標，MAX 是真的截。貼太近的話 AI 只要多寫兩個字
//    就會被【切在句子中間】，玩家看到的是半截話（2026-09 玩家「外貌會被砍字」）。
//    留 8 字的緩衝：小幅超出照樣完整，真的離譜才截。
var TRAIT_SEG_MAX_ = 22;
var TRAIT_SEG_HINT_ = 14;

// 特徵格數：外貌本相／氣質。
// ⚠ 2026-09 從 3 格收成 2：第三格「卸下心防的私密一面」整組退休，理由見 CODE_NOTES『TRAIT_SLOTS_』。
var TRAIT_SLOTS_ = 2;
// dailyLook 的段數（外貌本相／氣質／日常口氣）——比 TRAIT_SLOTS_ 多一段，那一段抽進【口吻】不進特徵格。
var DAILY_LOOK_SLOTS_ = 2;
// 個性格幾段：個性兩句、喜歡、討厭（狀態卡照這四格排，創角提示詞叫 AI 寫的段數也讀這裡）。
var PREF_SLOTS_ = 4;

// 讀特徵格的唯一入口：舊局存的是三、四格(退休的「自稱與口氣」「私密一面」)，讀到就地剝掉。
function traitParts_(raw) {
  var a = String(raw || "").split('、');
  if (a.length > TRAIT_SLOTS_) a.splice(2, a.length - TRAIT_SLOTS_);
  return a;
}

// 🟢 亂碼特徵粉碎器
function parseTraitsHelper(data, defaultStr, want) {
  let str = "";
  if (!data) str = defaultStr;
  else if (Array.isArray(data)) str = data.join("、");
  else if (typeof data === "object") str = Object.values(data).join("、");
  else str = String(data).replace(/[\[\]"{}]/g, "").trim();

  // 終極防呆：清除 AI 雞婆加上的標籤與數字 (例如 "1.", "日常表象:", "氣質舉止:" 等)。
  str = str.replace(/(卸下心防的私密一面|平常相處看得到的樣子|熟了才看得到的那一面|日常表象|真實內裡|喜歡的事物|討厭的事物|氣質舉止|卸下心防|私密一面|外貌|表象|內裡|喜歡|討厭)[:：]/g, "")
    .replace(/\d+[\.、]/g, "");

  str = str.replace(/[。\.]+/g, '、').replace(/、+/g, '、').replace(/^、|、$/g, '');

  // 切割並過濾空字串
  let parts = str.split('、').map(s => s.trim()).filter(s => s !== "");

  parts = parts.map(s => s.replace(/[<>&"'`｜【】]/g, "").slice(0, TRAIT_SEG_MAX_));

  const defParts = String(defaultStr || "").split('、').map(s => s.trim()).filter(s => s !== "");
  const n = want || 4;
  while (parts.length < n) {
    parts.push(defParts[parts.length] || "無");
  }

  // 保證只回傳前 n 格
  return parts.slice(0, n).join("、");
}

// 種子 persona.look 結構是「N段外貌細節・・...、最後一段氣質詞」(如「金髮碧眼・甲冑藍裙的嬌小騎士、王者威儀」)，段數因人而異(2~4段不等)，不能按「、」出現位置盲目分配(會把服裝等外貌細節錯位塞進[氣質舉止])。
function looksToTraitParts_(rawLook) {
  const segs = String(rawLook || "").split(/[・、]/).map(s => s.trim()).filter(s => s !== "");
  if (segs.length === 0) return "";
  const demeanor = segs.length > 1 ? segs.pop() : "從容";
  const appearance = segs.join("・");
  return `${appearance}、${demeanor}`;   // 特徵兩格：第三格「私密一面」2026-09 退休
}


// ==========================================
// ★ 階段三：狀態融合與資料封裝
// ==========================================


// physical_state 已簡化成單一「狀態」欄，不再有器官專屬鍵，單純覆寫這一鍵即可、無跨鍵合併需求。
// 🩸 睡一覺回到如常：肉體狀態是「此刻」的東西，不該跨夜跟著人走（呼叫端＝鑑賞的【一天結束】）。
function kanshouRestBody_(pcData, idx) {
  if (idx < 0 || !pcData[idx]) return;
  pcData[idx][COL.PC.PHYSICAL] = JSON.stringify({ "狀態": "如常" });
}
function mergePhysicalStatus(oldJson, newVal) {
  let oldObj;
  try { oldObj = JSON.parse(oldJson || "{}"); } catch (e) { oldObj = {}; }
  if (!oldObj || typeof oldObj !== "object") oldObj = {};
  oldObj["狀態"] = String(newVal || "").trim();
  return JSON.stringify(oldObj);
}

function buildPlayerStatusString(selfRow, relMem = "") {
  const safeMemory = String(selfRow[COL.PC.MEMORY] || "").replace(/\|/g, '@@@');
  const safeRelMem = String(relMem || "").replace(/\|/g, '@@@');
  // 外顯狀態(位置0)：solo 留空(戰鬥AI/演出卡不讀取，前端空值即隱藏該列)；慾海(K系id)以「肉體狀態」
  const _sid = String(selfRow[COL.PC.ID] || "");
  const _isKanshou = _sid.indexOf("KPC_") === 0 || _sid.indexOf("KSV_") === 0 || _sid.indexOf("KHV_") === 0;
  let visibleStatusStr = "";
  if (_isKanshou) {
    try {
      const _po = JSON.parse(selfRow[COL.PC.PHYSICAL] || "{}");
      visibleStatusStr = Object.keys(_po).map(function (k) { return k + "：" + _po[k]; }).join("　");
    } catch (e) { }
  }
  return [
    visibleStatusStr, "", selfRow[COL.PC.TRAIT], selfRow[COL.PC.LOC], selfRow[COL.PC.PREF],
    selfRow[COL.PC.HP], selfRow[COL.PC.MP], "", "", "", "", "",
    "", "", "", "", "", safeMemory, safeRelMem, selfRow[COL.PC.FACTION],
    selfRow[COL.PC.RANK], selfRow[COL.PC.ALIGN], selfRow[COL.PC.CONTRIB], selfRow[COL.PC.BACK], "",
    "", selfRow[COL.PC.MARTIAL], ""   // 第25格原為萌點，已棄用；位置索引不動，永遠送空字串
  ].join('§');
}


const SEED_CACHE_SECONDS_ = 21600; // 6 小時


// 英靈殿(種子從者名冊)讀取快取：鑑賞邀人清單、工房共用。
function getHeroCodexCached() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("FATE_HERO_CODEX");
  if (cached) return JSON.parse(cached);
  const hs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("英靈殿");
  if (!hs || hs.getLastRow() <= 1) return [];
  const fresh = hs.getDataRange().getValues();
  cache.put("FATE_HERO_CODEX", JSON.stringify(fresh), SEED_CACHE_SECONDS_);
  return fresh;
}


// ==========================================
// 🔴 狀態掃描器與地理雷達
// ==========================================




