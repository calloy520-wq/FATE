// ==========================================
// 命運停駐之夜 - 核心系統 (2026.05 雙軌防護 + JSON結構化批量I/O 極致優化版)
// 🔴【第一部分：基礎設定、ORM 映射與數值統計核心】Core_Settings.gs
// ==========================================

// 🔵 金鑰相容：舊版原本叫 API_KEY，FATE Script 存的是 OPENROUTER_API_KEY；兩個名字都吃，免改 Script 屬性
const API_KEY = (function () {
  var p = PropertiesService.getScriptProperties();
  return p.getProperty('API_KEY')
      || p.getProperty('OPENROUTER_API_KEY')
      || p.getProperty('OPENROUTER_KEY')
      || p.getProperty('OPENROUTER')
      || '';
})();
const MODEL_URL = "https://openrouter.ai/api/v1/chat/completions";
// 🔵 玩家 2026-07 明確選擇改回程式碼內直寫預設值(權衡放棄先前「不曝光在公開 repo」的隱私考量，
//   換取不用每次測試模型都要開 Apps Script 編輯器改指令碼屬性)。指令碼屬性 MODEL 仍優先生效
//   (留著方便之後想切換測試時不必再改程式碼重新部署)，只有沒設定該屬性時才落回此預設值。
const AI_MODEL = (function () {
  var p = PropertiesService.getScriptProperties();
  return p.getProperty('MODEL') || 'google/gemini-3.1-flash-lite';
})();

// ==========================================
// ★ 階段一：ORM 資料實體映射 (Data Mapping) 
// ==========================================
const COL = {
  // 🎴 FATE 專屬眾生 schema（2026-07 單人重構·33 欄）。
  //   已移除：財帛/裝備/生活技能/冗餘職階/舊數值五圍(2026-06)、REALM(死欄)、
  //   關係表(REL)/時鐘表(CLK)/權柄表(AUTH)——2026-07 全部併入本表欄位(單人模式每世界僅一位御主，
  //   NPC 對御主的關係＝那名 NPC 自己這一列的欄位；日/時/AP/居所＝御主自己這一列的欄位)。
  PC: {
    ID: 0, NAME: 1, SEX: 2, BACK: 3, STATUS: 4, TRAIT: 5, LOC: 6, PREF: 7,
    HP: 8, MP: 9, MAX_HP: 10, MAX_MP: 11,
    MEMORY: 12, INTENT: 13, FACTION: 14, RANK: 15, CONTRIB: 16, ALIGN: 17,
    PHYSICAL: 18, MARTIAL: 19, GAME_ID: 20, SIX: 21, TAGS: 22, SEEN: 23,
    // 🆕 關係欄(原 REL 表)：這名 NPC 對「本世界御主」的關係。BOND=好感值、REL_TAG=關係標籤(漸生情愫等)、
    //   IS_PARTY=同行旗標("同行"/"")、MAJOR_EVENT=未完成重大約定、REL_MEM=關係專屬記憶(NSFW專屬稱呼/親密次數等，
    //   與角色自己的 MEMORY 用途不同、分開存)。御主自己這一列這五欄不使用(留空)。
    BOND: 24, REL_TAG: 25, IS_PARTY: 26, MAJOR_EVENT: 27, REL_MEM: 28,
    // 🆕 世界狀態欄(原 CLK/AUTH 表)：只在【御主自己那一列】有意義，其餘角色列留空。
    //   DAY/HOUR/AP=時鐘(1AP=1小時，每日12AP)；HOME_LOC=居所(工房加成判定用，原權柄表)。
    DAY: 29, HOUR: 30, AP: 31, HOME_LOC: 32
  },
  // ⚠ 2026-07 新增 WAR：地圖原本無戰爭概念、全局共用同一份地點——但第四次限定地點(海特飯店等)
  //   若在第五次局也顯示會是明確的設定錯誤。空字串＝通用地點(全戰爭皆顯示)，'4th'/'5th' 則限定該戰爭。
  MAP: { REGION: 0, NAME: 1, TYPE: 2, COORD: 3, DESC: 4, PARENT: 5, WAR: 6 },
  // 🔵 英靈殿(從者範本)、御主殿（戰鬥 fx 走 hasFx_＋SEED_SERVANTS 的 skills/traits JSON，不需 COL 索引；戰鬥標籤分頁已棄）
  // 🆕 DAILY_LOOK/DAILY_WORDS(2026-07)：鑑賞用的都市日常版外貌/性格，跟戰時 PERSONA(look/words)分開存——
  //   懶惰快取：首次被召喚進鑑賞才由AI轉換寫入(見 heroToKanshouRow_)，之後任何玩家再召喚同一位英靈直接讀
  //   這裡，不重複呼叫AI。空字串＝尚未轉換過。附加在尾端，不動既有欄位位置(COL 是位置索引，見專案紀律)。
  HERO: { ID: 0, CLS: 1, NAME: 2, SEX: 3, SIX: 4, CLASS_SKILLS: 5, SKILLS: 6, TRAITS: 7, NP: 8, PERSONA: 9, ALIGN: 10, WARS: 11, SOURCE: 12, DAILY_LOOK: 13, DAILY_WORDS: 14 },
  MASTER: { ID: 0, NAME: 1, SEX: 2, APPEAR: 3, MAGIC: 4, CIRCUITS: 5, MELEE: 6, MAGIC_RANK: 7, HOME: 8, WISH: 9, PERSONA: 10, WAR: 11, SOURCE: 12, BACK: 13, MOE: 14 },
  // 帳號（存檔身分）：帳號名 → 目前御主角色ID。2026-07：勝場/最快奪杯日(排行榜用)已隨排行榜砍除。
  // ⚠ 2026-07 修：新增 KPC(鑑賞角色ID)——原本鑑賞的帳號歸屬是角色自己 MEMORY 裡宣稱的
  // 【帳號】標記，沒有結構性防護(任何操作忘了驗證就能被冒充)；現在跟 PC 欄位同一套機制，
  // 由伺服器端的 linkAccountToKanshouPc_/getAccountKanshouPcId_ 專責讀寫，比照 solo 的
  // 「連結存在外部表、玩家端無法影響」，結構上就不可能繞過，不必靠每個呼叫端各自記得檢查。
  ACC: { NAME: 0, PC: 1, CREATED: 2, KPC: 3 },
  // 鑑賞：⚠ 2026-07 玩家定案「整個砍掉奪杯封存機制」後已停用(死符號不刪，見專案紀律)——
  // 慾海同伴改成直接從「英靈殿」召喚(見 Gallery.gs 檔頭說明)，此常數與「鑑賞」工作表本體
  // 都不再被任何現行程式碼讀寫，留著只為相容舊試算表既有資料，勿刪。
  GAL: { ACC: 0, NAME: 1, CLS: 2, SEX: 3, SIX: 4, TAGS: 5, NP: 6, BACK: 7, PREF: 8, MOE: 9, MEMOIR: 10, WISH: 11, TIME: 12, MASTER: 13, MSEX: 14, FORM: 15 }
};

// 🔵 Fate 六圍階級：E~EX 轉數值（戰鬥系統換 D20 後會用到；+ 視為 +5）
const RANK_VALUE = { "E": 10, "D": 20, "C": 30, "B": 40, "A": 50, "EX": 60 };
function rankVal(r) {
  r = String(r || "E").trim();
  let base = RANK_VALUE[r.replace(/[+\-]/g, "").toUpperCase()] || 10;
  const plus = (r.match(/\+/g) || []).length;
  const minus = (r.match(/\-/g) || []).length;
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

// 🕰️ 2026-07：真實日期/時間字串(鑑賞後日談用)——鑑賞刻意無遊戲內時鐘/AP系統(玩家定案「一個更單純的世界」)，
//   沒有時間流動感；比起另蓋一套模擬時鐘，直接把「現在真實幾點幾分星期幾」餵給 AI 更划算：零新資料/零新
//   欄位，只是 prompt 多一行，讓場景自然帶出時段氛圍(深夜的靜謐/週五夜晚的悠閒)，不必玩家自己記或猜。
function realWorldClockStr_() {
  var tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  var now = new Date();
  var mm = parseInt(Utilities.formatDate(now, tz, 'M'), 10);
  var dd = parseInt(Utilities.formatDate(now, tz, 'd'), 10);
  var hh = parseInt(Utilities.formatDate(now, tz, 'H'), 10);
  var isoWd = parseInt(Utilities.formatDate(now, tz, 'u'), 10); // 1=一...7=日
  var wdName = ['一', '二', '三', '四', '五', '六', '日'][isoWd - 1] || '一';
  var period = hh < 6 ? '凌晨' : hh < 11 ? '早上' : hh < 13 ? '中午' : hh < 18 ? '下午' : hh < 22 ? '晚上' : '深夜';
  return mm + '月' + dd + '日・星期' + wdName + '・' + period + '(' + hh + '點左右)';
}

// 🧭 2026-07：solo 軌跡骨幹——玩家反饋「歷史是散文沒有骨架」，AI 要從敘事文字裡反推現在的精確狀態
//   (好感多少/血量剩幾成/第幾天)容易猜錯；改成 GAS 直接組一小段「已確定的事實」接在 system 訊息、
//   緊接在最近1輪歷史之前，讓 AI 有精準錨點可循，不必單靠散文反推。零額外讀表：呼叫端
//   (narrateWithState_) 已經在讀一次「眾生」表組【當前狀態】，這裡直接吃同一份 pcData，不重讀。
//   刻意只用「當下快照」(不做累積事件清單)——避免重蹈已砍除的「因果/命運長河」覆轍(存太多筆、
//   AI 反而抓不到重點)；後續若要加「一天總結」，再另外評估。
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
    if (!isNaN(svHp) && svHp < svMaxHp * 0.3) parts.push('從者剛歷經惡戰、氣血未復');
  }
  parts.push('令咒餘' + seals + '道');
  if (loc) parts.push('目前位於「' + loc + '」');
  if (!parts.length) return "";
  return '【軌跡骨幹】：' + parts.join('。') + '。';
}

// 🎴 FATE HP/MP 推算（無階級倍率）：耐久→HP、魔力→MP。取代已移除的舊階級·屬性上限計算器。
function fateMaxHpMp_(con, mag) {
  return {
    hp: 100 + (parseInt(con) || 10) * 10,
    mp: 50 + (parseInt(mag) || 10) * 10
  };
}

// 🎴 御主(凡人魔術師)HP/MP：唯一核心數值＝魔術迴路(財力/身世決定)。
//   🔋 共用魔力池制(2026-06)：從者【沒有獨立魔力池】，與御主共用一個魔力池(存御主MP)。
//   池上限 = 御主迴路×10 ＋ 同隊從者魔力×2(見 masterPoolMax_)；召喚/時回時重算把從者魔力併進來。
//   masterMaxHpMp_ 只給「尚無從者」的基底(迴路×10)；血(肉身，焚血/補魔備援)由迴路×2。
function masterMaxHpMp_(circuits) {
  var c = parseInt(circuits) || 30;
  return {
    hp: 100 + c * 2,
    mp: c * 10   // 🔋 2026-07 迴路係數 ×6→×8→×10(玩家定案再加深：A階寶具付完底費仍有超載餘裕)
  };
}

// 🔋 共用魔力池上限 = 御主迴路×10 ＋ 同隊從者魔力 rankVal 總和×2。(2026-07 ×6→×8→×10·玩家定案)
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

// 🗑️ 2026-07：activeSkillOn_/setActiveSkillMode_(主動技開關·MEMORY【主動技】標記)已刪——
//   主動技改回攻擊時的「⚡主動」按鈕(fate_battle 夾帶 userData.skill，見 Router_Battle.gs)，
//   舊存檔殘留的【主動技】標記無害(無人再讀，不影響其他 MEMORY 標記的正則)。

// 🔒 AI 呼叫後寫回前的「列重定位」索引(2026-07 競態修)：play/backfill 因 AI 呼叫長達數秒被豁免
//   寫入鎖(LOCK_EXEMPT)，但它們用「AI 呼叫【前】讀到的列索引」寫表——期間其他上鎖動作若刪列
//   (清殘列/登入自動清)，列索引位移、寫入會落到錯的列上。寫回前呼此函式做一次【單欄窄讀】
//   (只讀 ID 欄，非整表)，回 {id → 當下真實列索引(0-based)}；ID 已消失(列被刪)→查無，呼叫端跳過。
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

// 🐕 主從synergy（原作設定「御主供魔／契合度提升從者能力」）：特定主從組合回到全盛六圍。
//   目前只：恩奇都 ↔ 銀狼（獵犬御主，原作真正的御主——以銀狼為觸媒召喚、令咒落在狼身上）→ 全能力 A、寶具 A++。
//   其餘御主（含玩家自召）下恩奇都維持削弱基線。讀從者列 MEMORY【御主】名判定；在 rowToCombatant_ 套用。
//   ⚠ 2026-07 修正：原碼誤寫「巴茲狄洛特」——他其實是赫拉克勒斯(Archer)的御主，跟恩奇都無關，已改回銀狼。
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
// 🔮 敵寶具預告旗標（跨按鍵持久·存敵從者 MEMORY）：達成解放條件時先「預告」蓄勢，下次接觸必定發動——
//   給玩家一回合準備(開結界/寶具對轟/逃跑)，杜絕「無預警寶具秒殺」。get/set/clear 成套。
function getNpTelegraph_(memory) { return /【寶具預告】/.test(String(memory || "")); }
function setNpTelegraph_(memory) { var s = String(memory || ""); return getNpTelegraph_(s) ? s : (s ? s + "｜【寶具預告】1" : "【寶具預告】1"); }
function clearNpTelegraph_(memory) { return String(memory || "").replace(/｜?【寶具預告】1/g, ""); }
// 🔥 補魔過充存量（存御主 MEMORY【過充】<額度>）：補魔一儀＝除回滿池外，另存下一發「規格外寶具(＋/EX)」可無償超載灌入的
//   一池份魔力；發動大砲時優先由此支付，一次性(用完即清)。get/set/clear 成套；額度＝補魔當下的池上限。
function getOvercharge_(memory) { var m = String(memory || "").match(/【過充】(\d+)/); return m ? (parseInt(m[1]) || 0) : 0; }
function setOvercharge_(memory, amt) { var s = clearOvercharge_(String(memory || "")); amt = Math.max(0, Math.round(amt)); return s ? s + "｜【過充】" + amt : "【過充】" + amt; }
function clearOvercharge_(memory) { return String(memory || "").replace(/｜?【過充】\d+/g, ""); }
// 👗 從者換裝（存從者 MEMORY【換裝】<服裝文字>）：玩家自訂當前【服裝穿著】·疊在種子外貌本相之上餵給 AI 敘述——
//   只換衣不換人(五官/髮色/體態/氣質仍依 persona.look)。純外觀·不碰數值。get/set/clear 成套；清空＝恢復本相。
//   ｜【】換行皆為 MEMORY/提示分隔字元 → set 時剝除，限 40 字，守住寫表冪等與提示安全。
function getOutfit_(memory) { var m = String(memory || "").match(/【換裝】([^｜【】]*)/); return m ? m[1].trim() : ""; }
function setOutfit_(memory, text) { var s = clearOutfit_(String(memory || "")); text = String(text || "").replace(/[｜【】\n\r\t]/g, "").trim().slice(0, 40); if (!text) return s; return s ? s + "｜【換裝】" + text : "【換裝】" + text; }
function clearOutfit_(memory) { return String(memory || "").replace(/｜?【換裝】[^｜【】]*/g, ""); }
// ⚔️ 玩家自定武裝（2026-07·「Saber斯卡哈仍拿槍」案）：武器/戰鬥方式存 MEMORY【武裝】<文字>，
//   servantCard_ 讀後強制 AI 以此為準——蓋過職階慣例(Saber=劍/Lancer=槍…)與該真名的原典武器習慣。
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

  // 🔴 終極防呆：清除 AI 雞婆加上的標籤與數字 (例如 "1.", "表象:", "外貌:" 等)
  str = str.replace(/(表象|內裡|底線|性癖|外貌|武技|雜學|弱點|牽絆|色色弱點)[:：]/g, "")
    .replace(/\d+[\.、]/g, "");

  // 切割並過濾空字串
  let parts = str.split('、').map(s => s.trim()).filter(s => s !== "");

  // 強制補滿 4 格，如果 AI 給太少就塞「無」
  while (parts.length < 4) {
    parts.push("無");
  }

  // 保證只回傳前 4 格
  return parts.slice(0, 4).join("、");
}

// 🐛→✅ 2026-07 玩家發現「衣服寫到舉止了」：種子 persona.look 的真實結構是「N段外貌細節(髮色/瞳色/
//   體態/服裝)・・...、最後一段氣質詞」(如「金髮碧眼・甲冑藍裙的嬌小騎士、王者威儀」)，不是天然的
//   [外貌]/[氣質舉止]/[台詞自稱]/[私密面]四格——過去直接把這種字串餵給 parseTraitsHelper，會按
//   「、」出現的位置盲目分配四格，外貌段落數量因人而異(2~4段不等)時，服裝等外貌細節被錯位塞進
//   [氣質舉止]、真正的氣質詞反而被推擠到[台詞自稱]甚至[私密面]，persona.firstP(真正的自稱)也從未
//   被讀進來過。這裡把「最後一段」正確認定為氣質、其餘全部合併回單一[外貌]格，[台詞自稱]改吃真正
//   的 persona.firstP，回傳的字串再交給 parseTraitsHelper 補齊防呆與 4 格截斷。
function looksToTraitParts_(rawLook, firstP) {
  const segs = String(rawLook || "").split(/[・、]/).map(s => s.trim()).filter(s => s !== "");
  if (segs.length === 0) return "";
  const demeanor = segs.length > 1 ? segs.pop() : "從容";
  const appearance = segs.join("、");
  const selfAddr = String(firstP || "").trim() || "我";
  return `${appearance}、${demeanor}、自稱「${selfAddr}」、卸下心防時的柔軟一面`;
}

// 🤖 2026-07 玩家提案「確定會有喜好？討厭的？跟玩家的資料欄位對齊嗎」：查證屬實——種子庫
//   persona.words 幾乎全部只有2段(僅阿爾托莉雅3段)，parseTraitsHelper 補滿4格時[喜歡]/[討厭]
//   恆為「無」佔位，玩家自己建角卻是紮實填滿的4格，兩邊明顯不對齊，慢熱與傾心規則「依個性/氣質
//   真實反應」對從者這邊可用信號比玩家薄弱很多。召喚當下用AI依既有的表象/內裡短句延伸出貼合、
//   合理的喜好/討厭，而非留白；既有短句一字不改、只補缺少的部分。只在段數不足4時才呼叫，已經
//   4段(AI原創從者走的分支本就會給4段)直接跳過、不多打一次API。
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

// 🤖 2026-07 玩家定調「種子就是去戰鬥的，可以少幾項沒問題；轉到鑑賞，AI必須依照種子進行補充
//   和轉換原本資料變成都市日常」：跟上面 enrichPersonalityLikesDislikes_ 的差異——那個是給「還在
//   戰場」的 solo 用(只補缺項、維持戰時語境)，這個專給「進入鑑賞和平日常」用，一次AI呼叫做兩件事：
//   ①段數不足4段就補滿(邏輯同上)；②不論段數夠不夠，若既有短句偏戰場語境(戰意/殺意/勝負等)一律
//   轉譯成性格本質不變、但適合日常場景展現的等價說法。只用在鑑賞的兩個新增從者入口。
function translatePersonalityToDaily_(name, cls, rawWords) {
  var words = String(rawWords || "").trim();
  if (!words) return words;
  try {
    var sys = "你是《命運停駐之夜》的角色側寫顧問。玩家提供一位角色在聖杯戰爭(戰時)既有的性格短句" +
      "(用「、」分隔，依序對應[日常表象][真實內裡][喜歡的事物][討厭的事物]，段數可能不足4段——" +
      "這是正常的，種子資料本就只服務戰鬥)。這個角色現在要進入現代都市的和平日常生活，請你：\n" +
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

// 🐛→✅ 2026-07 修：肉棒/蜜穴這兩個鍵過去只靠 sanitizePhysicalState 白名單擋鍵名，從不檢查角色實際性別——
//   AI(尤其換到不穩定的免費模型測試時)偶爾吐錯性別代碼，錯的鍵就會被 Object.assign 永久疊加進去、
//   從此跟正確的鍵並存(如男角色卻同時存在「蜜穴」)。傳入 sex 時直接刪除跟性別矛盾的鍵，根源解決、
//   且每次合併都會自我修復既有髒資料(不需額外一次性清洗腳本)。
function mergePhysicalStatus(oldJson, newObjOrStr, sex) {
  try {
    let oldObj = JSON.parse(oldJson || "{}");
    let newObj = typeof newObjOrStr === 'string' ? JSON.parse(newObjOrStr || "{}") : (newObjOrStr || {});
    let merged = Object.assign(oldObj, newObj);
    if (sex === "男") delete merged["蜜穴"];
    else if (sex === "女") delete merged["肉棒"];
    return JSON.stringify(merged);
  } catch (e) { return oldJson || "{}"; }
}

function buildPlayerStatusString(selfRow, relMem = "") {
  const safeMemory = String(selfRow[COL.PC.MEMORY] || "").replace(/\|/g, '@@@');
  const safeRelMem = String(relMem || "").replace(/\|/g, '@@@');
  // 🗑️ 2026-07 刪：maskPhysicalStatus/safePhysical(§-string第24格)——查證後確認前端從未讀取這一格
  // (updateUI 只讀其他索引)，「肉體狀態抵換外顯」改走上面 visibleStatusStr 後這格早已是死值，
  // 直接砍掉；該格保留空字串佔位以維持其餘欄位的固定索引位置不位移。
  // 🎴 2026-07 玩家定案：外顯狀態自 solo 移除(戰鬥AI/演出卡從不讀取，HUD 恆顯示預設字樣＝死資料)——
  //   位置0 solo 留空(前端空值即隱藏該列)；慾海(K 系 id)以「肉體狀態」抵換此欄位顯示。
  //   慾海的 STATUS 欄本身仍由 NSFW 機制(intimacy_feedback)維護、僅供 AI 場景連續性內化。
  const _sid = String(selfRow[COL.PC.ID] || "");
  let visibleStatusStr = "";
  if (_sid.indexOf("KPC_") === 0 || _sid.indexOf("KSV_") === 0 || _sid.indexOf("KHV_") === 0) {
    try {
      const _po = JSON.parse(selfRow[COL.PC.PHYSICAL] || "{}");
      visibleStatusStr = Object.keys(_po).map(function (k) { return k + "：" + _po[k]; }).join("　");
    } catch (e) { }
  }

  // 位置索引固定（§ 協議），s[7-16] 為廢棄的九州五圍/裝備/境界欄，填空保持前端定位不位移。
  return [
    visibleStatusStr, "", selfRow[COL.PC.TRAIT], selfRow[COL.PC.LOC], selfRow[COL.PC.PREF],
    selfRow[COL.PC.HP], selfRow[COL.PC.MP], "", "", "", "", "",
    "", "", "", "", "", safeMemory, safeRelMem, selfRow[COL.PC.FACTION],
    selfRow[COL.PC.RANK], selfRow[COL.PC.ALIGN], selfRow[COL.PC.CONTRIB], selfRow[COL.PC.BACK], "",
    selfRow[COL.PC.INTENT], selfRow[COL.PC.MARTIAL], ""
  ].join('§');
}

function getFreshStatusString(targetId, pIdx, sheets) {
  // getValues() 本身會 flush pending 寫入，無需額外 SpreadsheetApp.flush()（省一次強制 commit）。
  const freshPcData = sheets.pc.getDataRange().getValues();
  return buildPlayerStatusString(freshPcData[pIdx]);
}

// ⚡ 靜態種子表快取共用時數：坤圖/英靈殿/御主殿都幾乎不寫(只在創角/召喚/版本升級時)，
//   卻被戰鬥/移動/羈絆等熱路徑高頻讀取——6 小時內免整表重讀，寫入點各自呼叫對應 remove() 清快取。
const SEED_CACHE_SECONDS_ = 21600; // 6 小時

function getMapDataCached(sheets) {
  if (!sheets.map) return [];
  const cache = CacheService.getScriptCache();
  const cachedMap = cache.get("FATE_MAP_DATA");
  if (cachedMap) return JSON.parse(cachedMap);

  const freshData = sheets.map.getDataRange().getValues();
  cache.put("FATE_MAP_DATA", JSON.stringify(freshData), SEED_CACHE_SECONDS_);
  return freshData;
}

// 英靈殿(種子從者名冊)：codexPersona_/actionGetHeroes/actionSummonServant/seedRivalsForGame_ 共用。
//   寫入點(recordOriginalHero_/upgradeCodexPersonas_/seedFateCodex_)須各自 remove("FATE_HERO_CODEX")。
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

// 御主殿(種子正典御主名冊)：actionGetMasters/seedRivalsForGame_ 共用。
//   寫入點(upgradeMasterCodex_/seedFateCodex_)須各自 remove("FATE_MASTER_CODEX")。
function getMasterCodexCached() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("FATE_MASTER_CODEX");
  if (cached) return JSON.parse(cached);
  const msh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("御主殿");
  if (!msh || msh.getLastRow() <= 1) return [];
  const fresh = msh.getDataRange().getValues();
  cache.put("FATE_MASTER_CODEX", JSON.stringify(fresh), SEED_CACHE_SECONDS_);
  return fresh;
}

function getCharacterTotalStats(charId, sheets, cachedPcData = null, cachedItemData = null) {
  const pcData = cachedPcData || sheets.pc.getDataRange().getValues();
  const row = pcData.find(r => r[COL.PC.ID] === charId);
  if (!row) return null;

  // 🎴 FATE 六圍制：數值五圍(STR~LUK 欄)已棄用，顯示用值改由六圍 SIX 階級直接推導(svNum_)，無階級倍率。
  let six = {}; try { six = JSON.parse(row[COL.PC.SIX] || "{}"); } catch (e) { }
  const fromSix_ = (k) => svNum_(six[k] || "E");
  let baseSTR = fromSix_("筋力"), baseCON = fromSix_("耐久"), baseAGI = fromSix_("敏捷"), baseINT = fromSix_("魔力"), baseLUK = fromSix_("幸運");

  return {
    id: charId, name: row[COL.PC.NAME], hp: parseInt(row[COL.PC.HP]) || 100, maxHp: parseInt(row[COL.PC.MAX_HP]) || 100,
    STR: baseSTR, CON: baseCON, AGI: baseAGI, INT: baseINT, LUK: baseLUK
  };
}

// ==========================================
// 🔴 狀態掃描器與地理雷達
// ==========================================

// 2026-07：關係已併入眾生表自身欄位(BOND/REL_TAG/IS_PARTY)，不再需要 relData 參數／跨表查找。
function getLocalPeopleList(sheets, pcName, pcId, curL, allPcData) {
  if (!allPcData) allPcData = sheets.pc.getDataRange().getValues();
  const localPeopleList = [];
  const safeCurL = String(curL || "");

  // 🔵 實例化：只看自己 game_id 世界內的人（御主沒有 game_id 時不過濾，相容舊角色）
  const meRow = allPcData.find(r => r[COL.PC.ID] == pcId);
  const myGameId = meRow ? String(meRow[COL.PC.GAME_ID] || "") : "";

  // 🤝 情報共享（同盟背景生效）：只要當前世界尚有任一盟友（敵御主/敵從者結盟中），盟友便會通報敵情——
  //   敵從者的「職階」對玩家揭露（原作依據：遠坂凜為士郎判明敵方職階／真名）。無盟友則維持迷霧。
  // 🤝 順帶找「別人(非我)同行」的 NPC：那名 NPC 正忙著陪誰（busyWith 顯示用）
  let hasAlly = false;
  const otherPartyByNpc = {};
  for (let a = 1; a < allPcData.length; a++) {
    const ar = allPcData[a];
    if (myGameId && String(ar[COL.PC.GAME_ID] || "") !== myGameId) continue;
    const af = String(ar[COL.PC.FACTION] || "");
    if ((af === "敵御主" || af === "敵從者") && !String(ar[COL.PC.ID]).startsWith("DEAD_") && /【盟約至】\d+/.test(String(ar[COL.PC.MEMORY] || ""))) { hasAlly = true; }
    // 這名角色自己這一列標了「同行」，但同行對象不是本世界唯一御主(即另有其人陪伴)——單人模式僅一位御主，
    // 故「同行」旗標即代表陪的是御主本人，這裡只需標出「已同行中」給 busyWith 用即可，無須記對象名字。
  }

  for (let i = 1; i < allPcData.length; i++) {
    const r = allPcData[i];
    if (r[COL.PC.ID] == pcId || String(r[COL.PC.ID]).startsWith("DEAD_")) continue;
    if (myGameId && String(r[COL.PC.GAME_ID] || "") !== myGameId) continue;

    const tLoc = String(r[COL.PC.LOC] || ""); const tName = r[COL.PC.NAME];
    const rVal = parseInt(r[COL.PC.BOND]) || 0;
    const rIsParty = (String(r[COL.PC.IS_PARTY] || "") === "同行");
    // ⚠ 2026-07 修：慾海「請走」已改成保留列只退出同行(不再刪列)，若沿用 solo 那套「同地/高好感
    // 就算在場」的寬鬆判定，被請走的同伴(好感通常≥60、且 LOC 早已凍結在請走當下那格)一旦玩家
    // 剛好晃到同一格，會被誤判成「在場」而重新登場——慾海只有目前同行的人才該在場，收緊成純看 IS_PARTY。
    const isKanshouCtx = myGameId.indexOf("k_") === 0;

    if (isKanshouCtx ? rIsParty : (tLoc === safeCurL || rVal >= 60 || rIsParty)) {
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
