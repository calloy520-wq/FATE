// ==========================================
// 命運停駐之夜 - 核心系統 (2026.05 雙軌防護 + JSON結構化批量I/O 極致優化版)
// 🔴【第一部分：基礎設定、ORM 映射與數值統計核心】Core_Settings.gs
// ==========================================

// 🔵 2026-07 玩家定案：只認 OPENROUTER_API_KEY 這一個指令碼屬性名稱，舊的相容別名一併砍除。
const OPENROUTER_API_KEY = (function () {
  return PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY') || '';
})();
const MODEL_URL = "https://openrouter.ai/api/v1/chat/completions";
// 預設值直寫程式碼(圖方便測試不必進 Apps Script 改屬性)；MODEL 指令碼屬性仍優先生效，未設定才落回此預設值。
// 鑑賞用模型：同時是點火(driveOn=true)直接呼叫模型、與矜持模式重試失敗的 fallbackModel，兩處共用同一顆常數。
const AI_MODEL = (function () {
  var p = PropertiesService.getScriptProperties();
  return p.getProperty('MODEL') || 'deepseek/deepseek-v4-flash';
})();
// solo(narrateWithState_) 只需精簡按鍵回饋、不需鑑賞級 NSFW 生成能力，獨立用低延遲小模型換取速度，與 AI_MODEL 互不影響。
const SOLO_MODEL = (function () {
  var p = PropertiesService.getScriptProperties();
  return p.getProperty('SOLO_MODEL') || 'google/gemini-3.1-flash-lite';
})();
// 補魔/令咒解鎖分支(actionNarrateOnly 的 deepseek:true 旗標)專用模型，獨立指令碼屬性，不影響 AI_MODEL/SOLO_MODEL。
const UNLOCKED_MODEL = (function () {
  var p = PropertiesService.getScriptProperties();
  return p.getProperty('UNLOCKED_MODEL') || 'x-ai/grok-4.20';
})();

// ==========================================
// ★ 階段一：ORM 資料實體映射 (Data Mapping) 
// ==========================================
const COL = {
  // FATE 眾生 schema：關係表(REL)/時鐘表(CLK)/權柄表(AUTH)已併入本表欄位——單人模式每世界僅一位御主，
  //   NPC 對御主的關係＝那名 NPC 自己這一列的欄位；日/時/AP/居所＝御主自己這一列的欄位。
  PC: {
    ID: 0, NAME: 1, SEX: 2, BACK: 3, STATUS: 4, TRAIT: 5, LOC: 6, PREF: 7,
    HP: 8, MP: 9, MAX_HP: 10, MAX_MP: 11,
    MEMORY: 12, INTENT: 13, FACTION: 14, RANK: 15, CONTRIB: 16, ALIGN: 17,
    PHYSICAL: 18, MARTIAL: 19, GAME_ID: 20, SIX: 21, TAGS: 22, SEEN: 23,
    // 關係欄(原 REL 表)：NPC 對本世界御主的關係。BOND=好感值、REL_TAG=關係標籤、IS_PARTY=同行旗標、
    //   REL_MEM=關係專屬記憶(與角色 MEMORY 分開存)。御主自己這一列不使用(留空)。
    // MEMOIR(27)：鑑賞「共同回憶」——原 MAJOR_EVENT 死欄(讀寫端早移除、恆空)於 2026-07 復用為每個同伴
    //   一格的共同回憶敘事(AI 每回合吐 memory 一句、GAS append 去重存最近 N 條，機制同專屬稱呼)。COL 是
    //   位置索引，沿用 27 槽、不新增欄、不位移。solo 不使用(留空)。
    BOND: 24, REL_TAG: 25, IS_PARTY: 26, MEMOIR: 27, REL_MEM: 28,
    // 世界狀態欄(原 CLK/AUTH 表)：只在御主自己那一列有意義，其餘角色列留空。
    //   DAY/HOUR/AP=時鐘(1AP=1小時，每日12AP)；HOME_LOC=居所(工房加成判定用)。
    DAY: 29, HOUR: 30, AP: 31, HOME_LOC: 32,
    // MONEY/UPKEEP_WEEK/ROOM(33-35)：2026-07 鑑賞經濟層＋房東房客世界觀砍除後的死欄，恆空。
    //   COL 是位置索引不能刪(會讓後續欄位錯位)，保留占位即可，讀寫端均已移除。
    MONEY: 33, UPKEEP_WEEK: 34,
    ROOM: 35
  },
  // WAR：地圖地點按戰爭區分，避免第四次限定地點(海特飯店等)也出現在第五次局。空字串＝通用地點，'4th'/'5th' 限定該戰爭。
  MAP: { REGION: 0, NAME: 1, TYPE: 2, COORD: 3, DESC: 4, PARENT: 5, WAR: 6 },
  // 🔵 英靈殿(從者範本)、御主殿（戰鬥 fx 走 hasFx_＋SEED_SERVANTS 的 skills/traits JSON，不需 COL 索引；戰鬥標籤分頁已棄）
  // DAILY_LOOK/DAILY_WORDS：鑑賞用日常版外貌/性格，與戰時 PERSONA(look/words)分開存；懶惰快取，首次
  //   召喚進鑑賞才由AI轉換寫入(heroToKanshouRow_)，之後直接讀取不重複呼叫AI。空字串＝尚未轉換。
  //   附加尾端不動既有欄位位置(COL 是位置索引，見專案紀律)。
  // DAILY_MOE：鑑賞用日常萌點，與戰時 PERSONA.moe(常靠戰爭/創傷撐出的反差萌)分開存——鑑賞世界沒發生過
  //   戰爭，改用輕量溫馨的日常版萌點，來源同上(translateMoeToDaily_)。
  // DAILY_OUTFIT：服裝從 DAILY_LOOK 拆出獨立欄位，DAILY_LOOK 改為四段[外貌本相][氣質舉止][自稱口氣]
  //   [私密一面]，對齊 PERSONA.traits/PREF 格式。SOLO(戰時 PERSONA.look) 獨立一套不受影響。
  HERO: { ID: 0, CLS: 1, NAME: 2, SEX: 3, SIX: 4, CLASS_SKILLS: 5, SKILLS: 6, TRAITS: 7, NP: 8, PERSONA: 9, ALIGN: 10, WARS: 11, SOURCE: 12, DAILY_LOOK: 13, DAILY_WORDS: 14, DAILY_MOE: 15, DAILY_OUTFIT: 16 },
  MASTER: { ID: 0, NAME: 1, SEX: 2, APPEAR: 3, MAGIC: 4, CIRCUITS: 5, MELEE: 6, MAGIC_RANK: 7, HOME: 8, WISH: 9, PERSONA: 10, WAR: 11, SOURCE: 12, BACK: 13, MOE: 14 },
  // 帳號（存檔身分）：帳號名 → 目前御主角色ID。
  // KPC(鑑賞角色ID)：由伺服器端 linkAccountToKanshouPc_/getAccountKanshouPcId_ 專責讀寫，比照 solo
  // 「連結存在外部表、玩家端無法影響」，結構上不可繞過冒充。
  ACC: { NAME: 0, PC: 1, CREATED: 2, KPC: 3 }
};

// 🔵 Fate 六圍階級：E~EX 轉數值（戰鬥系統換 D20 後會用到；+ 視為 +5）
const RANK_VALUE = { "E": 10, "D": 20, "C": 30, "B": 40, "A": 50, "EX": 60 };
function rankVal(r) {
  r = String(r || "E").trim();
  let base = RANK_VALUE[r.replace(/[+\-]/g, "").toUpperCase()] || 10;
  // 🛡️ +/-修飾字元理論上只會是UI骰出的1~2個(如"A+"/"A++")，但這欄位來源包含玩家自由輸入
  // (見actionManualNpc的melee/magicRank)，沒上限的話可以打"A+++++++"無限灌傷害，封頂3個。
  const plus = Math.min((r.match(/\+/g) || []).length, 3);
  const minus = Math.min((r.match(/\-/g) || []).length, 3);
  return base + plus * 5 - minus * 3;
}


// 🟢 共用 D20 骰子：1=大失敗、20=大成功


// ==========================================
// ★ 階段二：通用輔助模組 (Helper Functions)
// ==========================================

// 🟢 姓名限定純中文：移除所有非中日韓統一表意文字(CJK 含擴展A)的字元——英數、符號、空白、emoji 全部濾除。
// 全系統唯一真實來源；前端只做提示與即時擋字，後端此函式才是最終防線。回傳清洗後字串(上限10字)。
function cleanChineseName(s) {
  return String(s == null ? "" : s).replace(/[^㐀-䶿一-鿿]/g, "").slice(0, 10);
}

// solo 軌跡骨幹：AI 從敘事散文反推精確狀態(好感/血量/天數)容易猜錯，改由 GAS 組一段「已確定事實」接在
//   歷史前當錨點。吃呼叫端(narrateWithState_)已讀的同一份 pcData，不重讀表。刻意只做當下快照、不做累積
//   事件清單，避免重蹈已砍除的「因果/命運長河」(存太多筆反而抓不到重點)。
function buildTrajectoryDigest_(pcData, gameId, pcRow) {
  if (!pcRow || !gameId) return "";
  var clk = getClock_(gameId, pcData);
  var seals = getPlayerSeals_(pcRow[COL.PC.MEMORY]);
  var loc = String(pcRow[COL.PC.LOC] || "");
  var svRow = (pcData || []).find(function (r) {
    return r && String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_");
  });
  var parts = [];
  if (clk) parts.push('聖杯戰爭第' + clk.day + '日・行動力' + clk.ap + '/' + AP_PER_DAY);
  if (svRow) {
    var bond = parseInt(svRow[COL.PC.BOND]) || 0;
    var bondWord = bond >= 80 ? '深厚信賴' : bond >= 50 ? '漸生信任' : bond >= 20 ? '仍在磨合' : '尚且生疏';
    parts.push('與從者「' + svRow[COL.PC.NAME] + '」好感' + bond + '(' + bondWord + ')');
    var svHp = parseInt(svRow[COL.PC.HP]), svMaxHp = parseInt(svRow[COL.PC.MAX_HP]) || 1;
    if (!isNaN(svHp) && svHp < svMaxHp * 0.3) parts.push('從者剛歷經惡戰、體力未復');
  }
  // 魔力池告急時明講是從者自己的存亡危機(從者無自有魔力池，全靠此池維生，見masterPoolMax_/applyRegen_)，
  //   避免AI誤演成只跟御主有關的旁支數值。
  var pMp = parseInt(pcRow[COL.PC.MP]), pMaxMp = parseInt(pcRow[COL.PC.MAX_MP]) || 1;
  if (!isNaN(pMp) && pMp < pMaxMp * 0.2) parts.push('共用魔力池告急——這是從者自己的存亡危機、並非只是御主的事');
  parts.push('令咒餘' + seals + '道');
  if (loc) parts.push('目前位於「' + loc + '」');
  if (!parts.length) return "";
  return '【軌跡骨幹】：' + parts.join('。') + '。';
}

// FATE HP/MP 推算（無階級倍率）：耐久→HP、魔力→MP。
function fateMaxHpMp_(con, mag) {
  return {
    hp: 100 + (parseInt(con) || 10) * 10,
    mp: 50 + (parseInt(mag) || 10) * 10
  };
}

// 御主(凡人魔術師)HP/MP：唯一核心數值＝魔術迴路(財力/身世決定)。共用魔力池制：從者無獨立魔力池，
//   與御主共用一池(存御主MP)，池上限＝御主迴路×10＋同隊從者魔力×2(見masterPoolMax_)。
//   masterMaxHpMp_ 只給「尚無從者」基底(迴路×10)；血由迴路×2。
function masterMaxHpMp_(circuits) {
  // 🛡️ parseInt(x)||30 只擋得住NaN/0，擋不住負數——前端骰子UI本就夾在12~50，但這裡是唯一
  //   信任邊界(直打API可繞過前端)，補上下限，避免負迴路生出0血/負魔力的御主。
  var c = Math.max(1, parseInt(circuits) || 30);
  return {
    hp: 100 + c * 2,
    mp: c * 10   // 迴路係數：A階寶具付完底費仍有超載餘裕
  };
}

// 共用魔力池上限 = 御主迴路×10 ＋ 同隊從者魔力 rankVal 總和×2。
//   魔力高的從者(Caster/Saber 魔A)擴充共用槽；魔力低者(Assassin 魔E)幾乎只靠御主迴路。
function masterPoolMax_(circuits, partyMagicVal) {
  return (parseInt(circuits) || 30) * 10 + (parseInt(partyMagicVal) || 0) * 2;
}

// 🔋 從者靈基出力檔位（玩家手動旋鈕，存從者 MEMORY【出力】）：從者無自有魔力，靠御主供魔的「出力」決定戰力與耗魔。
//   檔位→{ hit 命中加減, dmgMul 傷害乘子, drainMul 御主每小時維持費乘子, np 是否可解放寶具, label }。
//   100% 全開最強但燒御主最兇、且唯一能放寶具的檔；60% 基準無加成；20% 僅維持靈基、低出力有明顯懲罰。
var OUTPUT_TIERS_ = {
  100: { hit:  3, dmgMul: 1.30, drainMul: 2.0, np: true,  label: '全開' },
  80:  { hit:  1, dmgMul: 1.10, drainMul: 1.5, np: false, label: '高壓' },
  60:  { hit:  0, dmgMul: 1.00, drainMul: 1.0, np: false, label: '巡航' },
  40:  { hit: -2, dmgMul: 0.85, drainMul: 0.6, np: false, label: '節流' },
  20:  { hit: -5, dmgMul: 0.70, drainMul: 0.3, np: false, label: '維持' },
};
// 把任意百分比吸附到最近的合法檔位（20/40/60/80/100）。
function snapOutput_(pct) {
  var p = parseInt(pct); if (isNaN(p)) return 60;
  var tiers = [20, 40, 60, 80, 100], best = 60, bd = 999;
  for (var i = 0; i < tiers.length; i++) { var d = Math.abs(tiers[i] - p); if (d < bd) { bd = d; best = tiers[i]; } }
  return best;
}
function outputTier_(pct) { return OUTPUT_TIERS_[snapOutput_(pct)] || OUTPUT_TIERS_[60]; }
// 讀從者 MEMORY 的【出力】檔位（無則預設 60 巡航）。
function servantOutput_(memory) {
  var m = String(memory || "").match(/【出力】(\d+)/);
  return m ? snapOutput_(m[1]) : 60;
}
// 寫/改 MEMORY 的【出力】檔位，回傳新 memory 字串。
function setServantOutput_(memory, pct) {
  var p = snapOutput_(pct);
  var mem = String(memory || "");
  if (/【出力】\d+/.test(mem)) return mem.replace(/【出力】\d+/, '【出力】' + p);
  return mem ? (mem + '｜【出力】' + p) : ('【出力】' + p);
}

// 🌟 多寶具英靈：玩家選「解放哪個寶具」的索引，存從者 MEMORY【寶具選】N（預設 0＝主寶具）。
function npChoice_(memory) {
  var m = String(memory || "").match(/【寶具選】(\d+)/);
  return m ? parseInt(m[1]) : 0;
}
function setNpChoice_(memory, idx) {
  var i = Math.max(0, parseInt(idx) || 0);
  var mem = String(memory || "").replace(/｜?【寶具選】\d+/g, '');
  return mem ? (mem + '｜【寶具選】' + i) : ('【寶具選】' + i);
}

// 🔯 原初符文運用方式（玩家可選）：def 減傷(預設·受傷時生效)／dmg 增傷(出擊時生效)／regen 回血(每回合)。存從者 MEMORY【符文】。
var RUNE_MODES_ = ['def', 'dmg', 'regen'];
function runeMode_(memory) {
  var m = String(memory || "").match(/【符文】(def|dmg|regen)/);
  return m ? m[1] : 'def';
}
function setRuneMode_(memory, mode) {
  var mode2 = (RUNE_MODES_.indexOf(String(mode)) >= 0) ? String(mode) : 'def';
  var mem = String(memory || "").replace(/｜?【符文】(def|dmg|regen)/g, '');
  return mem ? (mem + '｜【符文】' + mode2) : ('【符文】' + mode2);
}

// AI 呼叫後寫回前的列重定位索引：play/backfill 因 AI 呼叫耗時被豁免寫入鎖(LOCK_EXEMPT)，用的是呼叫前
//   讀到的列索引；期間若其他上鎖動作刪列(清殘列/登入自動清)，索引會位移錯位。此函式單欄窄讀(只讀ID欄，
//   非整表)回傳 {id → 當下真實列索引(0-based)}；ID已消失(列被刪)則查無，呼叫端跳過。
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

// 主從synergy（原作設定「御主供魔／契合度提升從者能力」）：特定主從組合回到全盛六圍。
//   目前只：恩奇都 ↔ 銀狼（獵犬御主，原作真正的御主——以銀狼為觸媒召喚、令咒落在狼身上）→ 全能力 A、寶具 A++。
//   其餘御主（含玩家自召）下恩奇都維持削弱基線。讀從者列 MEMORY【御主】名判定；在 rowToCombatant_ 套用。
function masterSynergySix_(name, six, memory) {
  if (masterSynergyOn_(name, memory)) {
    return { 筋力: 'A', 耐久: 'A', 敏捷: 'A', 魔力: 'A', 幸運: six['幸運'] || '-', 寶具: 'A++' };
  }
  return six;
}
// 主從synergy 是否觸發（單一真實來源·masterSynergySix_ 與 前端變容標籤 共用）：讀 MEMORY【御主】名比對。
function masterSynergyOn_(name, memory) {
  var mm = String(memory || "").match(/【御主】([^｜]+)/);
  var mName = mm ? mm[1] : "";
  return /恩奇都/.test(String(name)) && /銀狼/.test(mName);
}
// MEMORY 標記共用工廠：收斂 Router_Battle.gs/Router_Movement.gs 多組結構相同的數值型/文字型 get/set
//   正則邏輯。海怪護盾(三值複合)/魔境·符文(需白名單驗證)/換裝·武裝(需字元過濾+截長度)形狀差異大，
//   刻意不硬套，維持獨立實作(見 FUNCTION_MANUAL.md)。
// 數值型：get 回 parseInt 或預設值；set 移除舊標記(含意外重複)並清理殘留的｜｜或前後｜再附加新值，
//   較舊版單次test+原地replace更能處理「MEMORY 字串意外重複標記」的邊界狀況。
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
// 文字型（無驗證/截長度，給已受信任的內部字串如地點名用；換裝/武裝需過濾使用者輸入，維持獨立實作）：
//   set 沿用舊版「單次test+原地replace，找不到才附加」寫法，行為與 getWorkshop_/getScavengedLoc_ 等
//   既有實作一致。
function makeTextTag_(tagName) {
  var reGet = new RegExp('【' + tagName + '】([^｜|【]+)');
  var reSet = new RegExp('【' + tagName + '】[^｜【]*');
  return {
    get: function (memory) { var m = String(memory || '').match(reGet); return m ? m[1].trim() : ''; },
    set: function (memory, val) {
      var s = String(memory || '');
      if (reSet.test(s)) return s.replace(reSet, '【' + tagName + '】' + val);
      return (s ? s + '｜' : '') + '【' + tagName + '】' + val;
    }
  };
}

// 🔮 敵寶具預告旗標（跨按鍵持久·存敵從者 MEMORY）：達成解放條件時先「預告」蓄勢，下次接觸必定發動——
//   給玩家一回合準備(開結界/寶具對轟/逃跑)，杜絕「無預警寶具秒殺」。get/set/clear 成套。
function getNpTelegraph_(memory) { return /【寶具預告】/.test(String(memory || "")); }
function setNpTelegraph_(memory) { var s = String(memory || ""); return getNpTelegraph_(s) ? s : (s ? s + "｜【寶具預告】1" : "【寶具預告】1"); }
function clearNpTelegraph_(memory) { return String(memory || "").replace(/｜?【寶具預告】1/g, ""); }
// 🔥 補魔過充存量（存御主 MEMORY【過充】<額度>）：補魔一儀＝除回滿池外，另存下一發「規格外寶具(＋/EX)」可無償超載灌入的
//   一池份魔力；發動大砲時優先由此支付，一次性(用完即清)。get/set/clear 成套；額度＝補魔當下的池上限。
var OVERCHARGE_TAG_ = makeIntTag_('過充', 0);
function getOvercharge_(memory) { return OVERCHARGE_TAG_.get(memory); }
function setOvercharge_(memory, amt) { return OVERCHARGE_TAG_.set(memory, Math.max(0, Math.round(amt))); }
function clearOvercharge_(memory) { return OVERCHARGE_TAG_.clear(memory); }
// 👗 從者換裝（存從者 MEMORY【換裝】<服裝文字>）：玩家自訂當前【服裝穿著】·疊在種子外貌本相之上餵給 AI 敘述——
//   只換衣不換人(五官/髮色/體態/氣質仍依 persona.look)。純外觀·不碰數值。get/set/clear 成套；清空＝恢復本相。
//   ｜【】換行皆為 MEMORY/提示分隔字元 → set 時剝除，限 40 字，守住寫表冪等與提示安全。
function getOutfit_(memory) { var m = String(memory || "").match(/【換裝】([^｜【】]*)/); return m ? m[1].trim() : ""; }
function setOutfit_(memory, text) { var s = clearOutfit_(String(memory || "")); text = String(text || "").replace(/[｜【】\n\r\t]/g, "").trim().slice(0, 40); if (!text) return s; return s ? s + "｜【換裝】" + text : "【換裝】" + text; }
function clearOutfit_(memory) { return String(memory || "").replace(/｜?【換裝】[^｜【】]*/g, ""); }
// 玩家自定武裝：武器/戰鬥方式存 MEMORY【武裝】<文字>，servantCard_ 讀後強制 AI 以此為準——蓋過職階
//   慣例(Saber=劍/Lancer=槍…)與該真名的原典武器習慣(如「Saber斯卡哈仍拿槍」)。
//   get/set/clear 成套(鏡射換裝)；清空＝恢復依職階/原典自然演出。限 30 字。
function getWeapon_(memory) { var m = String(memory || "").match(/【武裝】([^｜【】]*)/); return m ? m[1].trim() : ""; }
function setWeapon_(memory, text) { var s = clearWeapon_(String(memory || "")); text = String(text || "").replace(/[｜【】\n\r\t]/g, "").trim().slice(0, 30); if (!text) return s; return s ? s + "｜【武裝】" + text : "【武裝】" + text; }
function clearWeapon_(memory) { return String(memory || "").replace(/｜?【武裝】[^｜【】]*/g, ""); }
// 前端「變容」標籤用的 synergy 視圖：非 synergy 從者回 null；恩奇都回 {has,on,master,peak}。
//   on＝當前御主觸發全盛(亮)；否則暗(提醒需該御主)。玩家不可控——由御主決定。
function masterSynergyView_(name, memory) {
  if (!/恩奇都/.test(String(name))) return null;
  return { has: true, on: masterSynergyOn_(name, memory), master: '銀狼', peak: '全能 A・寶具 A++' };
}

// 🔮 魔境的智慧（斯卡哈專屬·玩家可選被動）：影之國女王通曉常見武技，玩家點選【1 個】通用 A 階被動標籤套用。
//   只給「有階級的常見被動」——不含原初符文(她本有)、不含無階級特性、不含寶具/簽名級招式。存從者 MEMORY【魔境】fx。
//   注入點：rowToCombatant_（戰鬥讀取時把選定標籤加進 skills，r 固定 A）。前端只對有 mage_realm 的從者露出選盤。
function mageRealmPool_() {
  return [
    { fx: 'nullify_magic', n: '對魔力',   r: 'A', icon: '🛡️', desc: '受魔力系傷害大幅衰減（對魔法的抗性）。' },
    { fx: 'str_up',        n: '怪力',     r: 'A', icon: '💪', desc: '瞬間強化肌力，近身傷害顯著提升。' },
    { fx: 'analyze',       n: '心眼（真）', r: 'A', icon: '👁️', desc: '經驗累積的洞察，先機與命中俱增。' },
    { fx: 'clear_mind',    n: '透化',     r: 'A', icon: '🧘', desc: '心如明鏡，不受鼓舞威壓等精神干擾。' },
    { fx: 'tactics',       n: '軍略',     r: 'A', icon: '📐', desc: '對軍寶具的運用更精準，寶具威力加成。' },
    { fx: 'self_mod',      n: '自我改造', r: 'A', icon: '🔧', desc: '改造己身，命中與傷害小幅穩定提升。' },
  ];
}
// 查某 fx 是否在魔境可選池內，回傳該池項目（含 n/icon/desc）或 null。
function mageRealmEntry_(fx) {
  var pool = mageRealmPool_();
  for (var i = 0; i < pool.length; i++) { if (pool[i].fx === String(fx)) return pool[i]; }
  return null;
}
// 讀從者 MEMORY 的【魔境】選定 fx（無則 ''）。
function mageRealmPick_(memory) {
  var m = String(memory || "").match(/【魔境】([a-z_]+)/);
  return (m && mageRealmEntry_(m[1])) ? m[1] : '';
}
// 寫/改 MEMORY 的【魔境】選定 fx，回傳新 memory 字串（fx 空字串＝清除選擇）。
function setMageRealmPick_(memory, fx) {
  var mem = String(memory || "");
  var clean = mem.replace(/｜?【魔境】[a-z_]+/g, '');
  if (!fx) return clean;
  return clean ? (clean + '｜【魔境】' + fx) : ('【魔境】' + fx);
}

// 🎴 從一列的六圍 SIX 推 HP/MP（耐久→con、魔力→mag）。
function maxStatsForRow_(row) {
  var six = {}; try { six = JSON.parse(row[COL.PC.SIX] || "{}"); } catch (e) { }
  return fateMaxHpMp_(svNum_(six["耐久"] || "E"), svNum_(six["魔力"] || "E"));
}

// 🟢 亂碼特徵粉碎器
function parseTraitsHelper(data, defaultStr) {
  let str = "";
  if (!data) str = defaultStr;
  else if (Array.isArray(data)) str = data.join("、");
  else if (typeof data === "object") str = Object.values(data).join("、");
  else str = String(data).replace(/[\[\]"{}]/g, "").trim();

  // 終極防呆：清除 AI 雞婆加上的標籤與數字 (例如 "1.", "日常表象:", "氣質舉止:" 等)。標籤清單需對齊
  // FATE 現行 TRAIT/PREF 四格（[外貌]/[氣質舉止]/[自稱與口氣]/[私密一面]、[日常表象]/[真實內裡]/
  // [喜歡的事物]/[討厭的事物]，見 Gallery.gs/Router_Creation.gs 系統提示詞）——舊九州詞彙攔不到
  // AI 實際會誤加的標籤字。
  str = str.replace(/(自稱與口氣|卸下心防的私密一面|日常表象|真實內裡|喜歡的事物|討厭的事物|氣質舉止|卸下心防|私密一面|外貌|自稱|表象|內裡|喜歡|討厭)[:：]/g, "")
    .replace(/\d+[\.、]/g, "");

  // 🩹 AI 常把「四格頓號」誤寫成「四句句號」(如「文靜內向。溫柔細膩。愛小動物。討厭喧嘩。」)——先把句號
  //   正規化成頓號，split('、') 才切得出 4 段；否則整串被當成 1 段、其餘 3 段被 defaultStr 的預設值填成
  //   「內斂堅韌／明哲保身」「卸下心防的私密一面」等殘料黏在後面(見風音案例)。半形句號一併處理。
  str = str.replace(/[。\.]+/g, '、').replace(/、+/g, '、').replace(/^、|、$/g, '');

  // 切割並過濾空字串
  let parts = str.split('、').map(s => s.trim()).filter(s => s !== "");

  // 缺的格數改從 defaultStr 對應分段取值、補不到才退回「無」——避免玩家只打幾個字未達4段時，整句
  // 寫好的 defaultStr(如 actionEnterKanshou 準備的預設句)被晾在一邊，其餘格數變成生硬的「無、無、無」。
  const defParts = String(defaultStr || "").split('、').map(s => s.trim()).filter(s => s !== "");
  while (parts.length < 4) {
    parts.push(defParts[parts.length] || "無");
  }

  // 保證只回傳前 4 格
  return parts.slice(0, 4).join("、");
}

// 種子 persona.look 結構是「N段外貌細節・・...、最後一段氣質詞」(如「金髮碧眼・甲冑藍裙的嬌小騎士、
//   王者威儀」)，段數因人而異(2~4段不等)，不能按「、」出現位置盲目分配四格(會把服裝等外貌細節錯位塞進
//   [氣質舉止]、真正氣質詞被推擠到[台詞自稱]甚至[私密面])。這裡把「最後一段」認定為氣質、其餘合併回
//   單一[外貌]格，[台詞自稱]改吃真正的 persona.firstP，再交給 parseTraitsHelper 補齊防呆與 4 格截斷。
function looksToTraitParts_(rawLook, firstP) {
  const segs = String(rawLook || "").split(/[・、]/).map(s => s.trim()).filter(s => s !== "");
  if (segs.length === 0) return "";
  const demeanor = segs.length > 1 ? segs.pop() : "從容";
  // 🐛→✅ 這裡曾經用「、」把多段外貌合併回單一[外貌]格，但「、」正是parseTraitsHelper切分四格
  //   的分隔符——合併回去的外貌格內部一有「、」，下面parseTraitsHelper就會把它當成多出來的頂層
  //   格數，導致[氣質舉止]/[自稱]/[私密一面]全部錯位、第4格(私密一面)被截斷擠掉。改用「・」合併
  //   (parseTraitsHelper只切「、」，不會再把這段拆開)，20位種子從者實測全數命中(見SOLO_REFERENCE.md)。
  const appearance = segs.join("・");
  const selfAddr = String(firstP || "").trim() || "我";
  return `${appearance}、${demeanor}、自稱「${selfAddr}」、卸下心防時的柔軟一面`;
}

// 種子庫 persona.words 幾乎全部只有2段，parseTraitsHelper 補滿4格時[喜歡]/[討厭]恆為「無」佔位，
//   比玩家自建角色的紮實4格薄弱很多。召喚當下用AI依既有的表象/內裡短句延伸出貼合、合理的喜好/討厭
//   補滿，既有短句一字不改；已滿4段(AI原創從者)直接跳過、不多打一次API。
function enrichPersonalityLikesDislikes_(name, cls, rawWords) {
  var words = String(rawWords || "").trim();
  if (!words) return words;
  var segCount = words.split('、').map(function (s) { return s.trim(); }).filter(function (s) { return s !== ""; }).length;
  if (segCount >= 4) return words;
  try {
    var sys = "你是《命運停駐之夜》的角色側寫顧問。玩家提供一位角色既有的性格短句(用「、」分隔，" +
      "依序對應[日常表象][真實內裡][喜歡的事物][討厭的事物]，但段數不足4段)，請延伸出貼合這些既有" +
      "特質、合理且具體的「喜歡的事物」與「討厭的事物」，補滿到4句。既有的短句必須一字不改、" +
      "原樣保留在原本的位置，只需要補上缺少的部分。\n" +
      "★只輸出最終4句、用「、」分隔，不要輸出任何說明、標籤、引號、前後綴。";
    var prompt = "角色：" + name + "（" + cls + "）\n既有性格短句：" + words;
    var out = String(callGeminiAPI(prompt, sys, { temperature: 0.8, ignoreLaw: true, plainText: true }) || "").trim();
    return out || words;
  } catch (e) { return words; }
}


// ==========================================
// ★ 階段三：狀態融合與資料封裝
// ==========================================

function parseVisibleStatus(rawStatus) {
  if (!rawStatus) return { "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "平靜" };
  try {
    let obj = JSON.parse(rawStatus);
    return { "衣服": obj["衣服"] || "穿戴整齊", "姿勢": obj["姿勢"] || "站立", "負面": obj["負面"] || "無", "顏面": obj["顏面"] || "平靜" };
  } catch (e) {
    return { "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": String(rawStatus).trim() };
  }
}

function buildVisibleStatusString(rawStatus) {
  const vs = parseVisibleStatus(rawStatus);
  let parts = [];
  if (vs["衣服"] && vs["衣服"] !== "無") parts.push(vs["衣服"]);
  if (vs["姿勢"] && vs["姿勢"] !== "無") parts.push(vs["姿勢"]);
  if (vs["負面"] && !["無", "氣息平穩", "平穩", "正常", "健康"].includes(vs["負面"])) parts.push(vs["負面"]);
  if (vs["顏面"] && vs["顏面"] !== "無") parts.push(vs["顏面"]);
  return parts.length > 0 ? parts.join("，") : "氣息平穩";
}

// physical_state 已簡化成單一「狀態」欄，不再有器官專屬鍵，單純覆寫這一鍵即可、無跨鍵合併需求。
function mergePhysicalStatus(oldJson, newVal) {
  // 解析失敗(舊格式殘留/非JSON字串)時當作空物件繼續合併，確保 newVal 一定被套用——不能直接回傳原始
  //   oldJson，否則呼叫端以為狀態已更新，實際上被無聲丟棄且不報錯。
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
  //   抵換顯示。慾海 STATUS 欄仍由 NSFW 機制(intimacy_feedback)維護，供AI場景連續性內化。
  const _sid = String(selfRow[COL.PC.ID] || "");
  const _isKanshou = _sid.indexOf("KPC_") === 0 || _sid.indexOf("KSV_") === 0 || _sid.indexOf("KHV_") === 0;
  let visibleStatusStr = "";
  if (_isKanshou) {
    try {
      const _po = JSON.parse(selfRow[COL.PC.PHYSICAL] || "{}");
      visibleStatusStr = Object.keys(_po).map(function (k) { return k + "：" + _po[k]; }).join("　");
    } catch (e) { }
  }
  // 位置索引固定（§ 協議），s[7-16] 為廢棄的九州五圍/裝備/境界欄，位置24(原鑑賞金錢餘額，
  //   2026-07 經濟層砍除後恆空)一併填空保持前端定位不位移。
  return [
    visibleStatusStr, "", selfRow[COL.PC.TRAIT], selfRow[COL.PC.LOC], selfRow[COL.PC.PREF],
    selfRow[COL.PC.HP], selfRow[COL.PC.MP], "", "", "", "", "",
    "", "", "", "", "", safeMemory, safeRelMem, selfRow[COL.PC.FACTION],
    selfRow[COL.PC.RANK], selfRow[COL.PC.ALIGN], selfRow[COL.PC.CONTRIB], selfRow[COL.PC.BACK], "",
    selfRow[COL.PC.INTENT], selfRow[COL.PC.MARTIAL], ""
  ].join('§');
}

// 🗑️ getFreshStatusString 已移除：所有呼叫端本就手握權威 pcData(STATE_PRE_DATA_ 交棒)，
//   一律改 buildPlayerStatusString(pcData[pIdx])，省掉每個非戰鬥動作各一次的整表重讀。

// ⚡ 靜態種子表快取共用時數：英靈殿(客製從者部分)幾乎不寫(只在召喚/版本升級時)，
//   卻被戰鬥/移動/羈絆等熱路徑高頻讀取——6 小時內免整表重讀，寫入點各自呼叫對應 remove() 清快取。
const SEED_CACHE_SECONDS_ = 21600; // 6 小時

// 坤圖分頁從無玩家動作寫入(唯一寫入者是版本升級時的一次性upsert，見reseedIfEmpty_)，內容與
//   FATE_MAP_SEED(Setup_FateWorld.gs) JS常數同一份資料——改直接回傳 FATE_MAP_SEED 包表頭列，比讀表+
//   CacheService快取更快，形狀(含表頭列＋COL.MAP欄序)與原本讀sheet完全一致，呼叫端不用改。「坤圖」
//   分頁仍保留(FATE_SHEET_DEFS/reseedIfEmpty_不變)供人工查閱；sheets.map 參數留著只是相容既有呼叫
//   簽名，已不使用。
function getMapDataCached(sheets) {
  return [["地域", "地名", "類型", "座標", "描述", "上級", "戰爭"]].concat(FATE_MAP_SEED);
}

// 英靈殿(種子從者名冊)：codexPersona_/actionGetHeroes/actionSummonServant/seedRivalsForGame_ 共用。
//   寫入點(recordOriginalHero_/upgradeCodexPersonas_/seedFateCodex_)須各自 remove("FATE_HERO_CODEX")。
// 英靈殿跟坤圖/御主殿不同、未靜態化：工房(Workshop)玩家可捏出原創英靈(來源=ai_gen)永久寫進這張表，
//   GAS程式碼靜態部署、跑起來時沒辦法把新角色塞回JS常數——是真正需要試算表持久化的動態資料，
//   維持「讀表+6小時快取」架構。
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

// 御主殿比照坤圖靜態化：唯二寫入點(upgradeMasterCodex_/seedFateCodex_)只在版本升級/首次建表時執行，
//   無玩家動作(如工房)會新增列，試算表只是 SEED_MASTERS(Seed_Codex.gs) 的多餘拷貝。改用既有的
//   masterToCodexRow_(seedFateCodex_本來就在用的同一個轉換函式)即時組出結果，不必讀表也不必快取。
//   「御主殿」分頁仍保留供人工查閱，遊戲邏輯不再讀它。
function getMasterCodexCached() {
  return [["御主ID", "姓名", "性別", "外貌", "魔術系統", "魔術迴路", "體術", "魔術階位", "居所", "願望", "人格", "戰爭", "來源", "身世", "萌點"]]
    .concat(SEED_MASTERS.map(masterToCodexRow_));
}

// ==========================================
// 🔴 狀態掃描器與地理雷達
// ==========================================

// 登場日：部分敵御主/敵從者可延後登場，不必開局就全員同時上場。資料驅動：Seed_Rivals.gs 的 roster
//   項目可選填 arriveDay(第N天才登場)／arriveHint(登場前風聲用的自訂提示句)，未填＝第1天(對既有
//   存檔/種子零影響)。hasArrived_(row,currentDay) 是「這名敵人現在算不算真的在世界裡」的單一真實
//   來源，凡是同地互動／鎖定攻擊／世界自走／地圖敵蹤標示等皆應吃這道閘門——唯獨「剩餘敵從者總數」
//   (aliveEnemyServants_，勝負判定用)刻意不吃，避免玩家靠「趕在對方出現前把其他人殺光」提前奪杯。
function getArriveDay_(memory) {
  var m = String(memory || "").match(/【登場日】(\d+)/);
  return m ? parseInt(m[1]) : 1;
}
function setArriveDay_(memory, day) {
  var d = Math.max(1, parseInt(day) || 1);
  var mem = String(memory || "").replace(/｜?【登場日】\d+/g, "");
  return d <= 1 ? mem : (mem ? (mem + "｜【登場日】" + d) : ("【登場日】" + d)); // 第1天＝預設值，不必佔字串長度
}
// 登場前風聲用的自訂提示句(如「遠方隱約可見金色的威壓身影」)；未填則由呼叫端退回泛用措辭。
function getArriveHint_(memory) {
  var m = String(memory || "").match(/【登場提示】([^｜]*)/);
  return m ? m[1] : "";
}
function setArriveHint_(memory, hint) {
  var h = String(hint || "").trim();
  var mem = String(memory || "").replace(/｜?【登場提示】[^｜]*/g, "");
  return h ? (mem ? (mem + "｜【登場提示】" + h) : ("【登場提示】" + h)) : mem;
}
function hasArrived_(row, currentDay) {
  return (parseInt(currentDay) || 1) >= getArriveDay_(row && row[COL.PC.MEMORY]);
}

// 御主自身能力標記：【體術】(rank字母，命運測定/種子皆保證合法)／【魔術】(自由描述文字)，創角/鋪敵時
//   寫進御主自己的 MEMORY。體術兩用途：① masterCard_/enemyMasterCard_ 讀出當演出依據(能力描述，
//   不受show-don't-tell限制)；②Engine_Fate.gs 的 injectMasterMeleeSupport_ 讀 rank 字母算真實戰鬥加成。
function getMasterMelee_(memory) {
  var m = String(memory || "").match(/【體術】([^｜]+)/);
  return m ? m[1].trim() : "";
}
function getMasterMagic_(memory) {
  var m = String(memory || "").match(/【魔術】([^｜]+)/);
  return m ? m[1].trim() : "";
}
// 御主魔術階位（rank字母）：跟體術同款「凡人自身能力」，只在己方出戰從者為 Caster(魔砲型)時才生效
//   (injectMasterMagicSupport_ 內部判斷)——體術管近戰助拳、魔術階位管施法支援，避免疊在一起變成
//   無腦雙倍加成。
function getMasterMagicRank_(memory) {
  var m = String(memory || "").match(/【魔術階位】([^｜]+)/);
  return m ? m[1].trim() : "";
}

// 關係已併入眾生表自身欄位(BOND/REL_TAG/IS_PARTY)，不再需要 relData 參數／跨表查找。
function getLocalPeopleList(sheets, pcName, pcId, curL, allPcData) {
  if (!allPcData) allPcData = sheets.pc.getDataRange().getValues();
  const localPeopleList = [];
  const safeCurL = String(curL || "");

  // 🔵 實例化：只看自己 game_id 世界內的人（御主沒有 game_id 時不過濾，相容舊角色）
  const meRow = allPcData.find(r => r[COL.PC.ID] == pcId);
  const myGameId = meRow ? String(meRow[COL.PC.GAME_ID] || "") : "";
  const myDay = meRow ? (parseInt(meRow[COL.PC.DAY]) || 1) : 1; // 🕰️ 登場日閘門用：尚未到來的敵人對玩家完全不存在

  // 🤝 情報共享（同盟背景生效）：只要當前世界尚有任一盟友（敵御主/敵從者結盟中），盟友便會通報敵情——
  //   敵從者的「職階」對玩家揭露（原作依據：遠坂凜為士郎判明敵方職階／真名）。無盟友則維持迷霧。
  // busyWith 恆為 null：單人模式只有一位御主，「同行」旗標即代表陪的是御主本人，沒有第三方可陪，
  //   此欄位前端也從未讀取。
  let hasAlly = false;
  for (let a = 1; a < allPcData.length; a++) {
    const ar = allPcData[a];
    if (myGameId && String(ar[COL.PC.GAME_ID] || "") !== myGameId) continue;
    const af = String(ar[COL.PC.FACTION] || "");
    if ((af === "敵御主" || af === "敵從者") && !String(ar[COL.PC.ID]).startsWith("DEAD_") && hasArrived_(ar, myDay) && /【盟約至】\d+/.test(String(ar[COL.PC.MEMORY] || ""))) { hasAlly = true; }
  }

  for (let i = 1; i < allPcData.length; i++) {
    const r = allPcData[i];
    if (r[COL.PC.ID] == pcId || String(r[COL.PC.ID]).startsWith("DEAD_")) continue;
    if (myGameId && String(r[COL.PC.GAME_ID] || "") !== myGameId) continue;
    // 🕰️ 登場日閘門：尚未登場的敵御主/敵從者對玩家完全不存在(不進在場清單、不可被指名互動)
    const rFac0 = String(r[COL.PC.FACTION] || "");
    if ((rFac0 === "敵御主" || rFac0 === "敵從者") && !hasArrived_(r, myDay)) continue;

    const tLoc = String(r[COL.PC.LOC] || ""); const tName = r[COL.PC.NAME];
    const rVal = parseInt(r[COL.PC.BOND]) || 0;
    const rIsParty = (String(r[COL.PC.IS_PARTY] || "") === "同行");

    // 此函式只服務 solo(呼叫端見 Router_Action.gs/Router_Movement.gs)；鑑賞(actionPlay)已改用自己的
    //   精簡版 getKanshouPeopleList_(Gallery.gs)，兩軌只共用種子庫資料。
    if (tLoc === safeCurL || rVal >= 60 || rIsParty) {
      let finalDisplayStatus = buildVisibleStatusString(r[COL.PC.STATUS]);
      // 🤝 結盟中的敵御主/敵從者 → 對前端顯示為「盟友*」，即不再列為可攻擊敵蹤
      let fac = String(r[COL.PC.FACTION] || "");
      const rawFac = fac;
      const allied = (fac === "敵御主" || fac === "敵從者") && /【盟約至】\d+/.test(String(r[COL.PC.MEMORY] || ""));
      if (allied) fac = (fac === "敵御主") ? "盟友御主" : "盟友從者";
      // 🤝 情報共享：有盟友在世時，揭露敵從者／盟友從者的職階（盟友通報的敵情）
      const isServantKind = (rawFac === "敵從者" || rawFac === "從者");
      const revealCls = (hasAlly && isServantKind) ? String(r[COL.PC.RANK] || "") : "";
      // 🕯️ 喪失從者的敵御主：標記如何痛失從者，供 AI 演出形單影隻、無牙的御主
      const lostSv = (rawFac === "敵御主") ? getLostServant_(r[COL.PC.MEMORY]) : "";
      // 🔗 敵對歸屬硬連結：御主→其從者、從者→其御主，讓多組同場時 AI 不張冠李戴
      const pairMaster = (rawFac === "敵從者") ? getServantMaster_(r[COL.PC.MEMORY]) : "";
      const pairServant = (rawFac === "敵御主") ? getMasterServant_(r[COL.PC.MEMORY]) : "";
      localPeopleList.push({
        id: r[COL.PC.ID], isPC: String(r[COL.PC.ID]).startsWith("PC_"), name: tName, status: finalDisplayStatus,
        pref: r[COL.PC.PREF] || "神祕莫測", relTag: r[COL.PC.REL_TAG] || "萍水相逢", relVal: rVal,
        loc: tLoc, isExact: (tLoc === safeCurL), isHighRel: (rVal >= 60), isParty: rIsParty,
        faction: fac, allied: allied, intelCls: revealCls, lostServant: lostSv,
        master: pairMaster, servant: pairServant,
        busyWith: null, hp: r[COL.PC.HP], mp: r[COL.PC.MP]
      });
    }
  }
  return localPeopleList;
}

function getNearbyLocations(currentLoc, mapData) {
  if (!currentLoc) return [];
  const rootLoc = String(currentLoc).split('-')[0].trim();
  const parentInfo = mapData.find(m => String(m[COL.MAP.NAME]).trim() === rootLoc);
  let pCoord = parentInfo && parentInfo[COL.MAP.COORD] ? String(parentInfo[COL.MAP.COORD]).split(',').map(Number) : [0, 0];
  if (isNaN(pCoord[0]) || isNaN(pCoord[1])) pCoord = [0, 0];

  let nearbyLocs = [];
  for (let i = 1; i < mapData.length; i++) {
    const mName = String(mapData[i][COL.MAP.NAME]).trim();
    if (!mName || mName === rootLoc || mName.startsWith(rootLoc + "-")) continue;
    let coords = mapData[i][COL.MAP.COORD] ? String(mapData[i][COL.MAP.COORD]).split(',').map(Number) : [0, 0];
    if (isNaN(coords[0]) || isNaN(coords[1])) coords = [0, 0];
    nearbyLocs.push({ name: mName, type: mapData[i][COL.MAP.TYPE] || "荒野", desc: mapData[i][COL.MAP.DESC] || "一處未知的地帶。", dist: Math.abs(coords[0] - pCoord[0]) + Math.abs(coords[1] - pCoord[1]) });
  }
  return nearbyLocs.sort((a, b) => a.dist - b.dist).slice(0, 5);
}
