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
  MAP: { REGION: 0, NAME: 1, TYPE: 2, COORD: 3, DESC: 4, PARENT: 5 },
  // 🔵 英靈殿(從者範本)、御主殿（戰鬥 fx 走 hasFx_＋SEED_SERVANTS 的 skills/traits JSON，不需 COL 索引；戰鬥標籤分頁已棄）
  HERO: { ID: 0, CLS: 1, NAME: 2, SEX: 3, SIX: 4, CLASS_SKILLS: 5, SKILLS: 6, TRAITS: 7, NP: 8, PERSONA: 9, ALIGN: 10, WARS: 11, SOURCE: 12 },
  MASTER: { ID: 0, NAME: 1, SEX: 2, APPEAR: 3, MAGIC: 4, CIRCUITS: 5, MELEE: 6, MAGIC_RANK: 7, HOME: 8, WISH: 9, PERSONA: 10, WAR: 11, SOURCE: 12, BACK: 13, MOE: 14 },
  // 帳號（存檔身分）：帳號名 → 目前御主角色ID。2026-07：勝場/最快奪杯日(排行榜用)已隨排行榜砍除。
  ACC: { NAME: 0, PC: 1, CREATED: 2 },
  // 鑑賞：奪杯後封存的從者（可於鑑賞模式呼出）
  GAL: { ACC: 0, NAME: 1, CLS: 2, SEX: 3, SIX: 4, TAGS: 5, NP: 6, BACK: 7, PREF: 8, MOE: 9, MEMOIR: 10, WISH: 11, TIME: 12, MASTER: 13, MSEX: 14 }
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

// 🎴 FATE HP/MP 推算（無階級倍率）：耐久→HP、魔力→MP。取代已移除的舊階級·屬性上限計算器。
function fateMaxHpMp_(con, mag) {
  return {
    hp: 100 + (parseInt(con) || 10) * 10,
    mp: 50 + (parseInt(mag) || 10) * 10
  };
}

// 🎴 御主(凡人魔術師)HP/MP：唯一核心數值＝魔術迴路(財力/身世決定)。
//   🔋 共用魔力池制(2026-06)：從者【沒有獨立魔力池】，與御主共用一個魔力池(存御主MP)。
//   池上限 = 御主迴路×8 ＋ 同隊從者魔力×2(見 masterPoolMax_)；召喚/時回時重算把從者魔力併進來。
//   masterMaxHpMp_ 只給「尚無從者」的基底(迴路×8)；血(肉身，焚血/補魔備援)由迴路×2。
function masterMaxHpMp_(circuits) {
  var c = parseInt(circuits) || 30;
  return {
    hp: 100 + c * 2,
    mp: c * 8   // 🔋 2026-07 迴路係數 ×6→×8(魔力池提高·NP/理想鄉較吃得起)
  };
}

// 🔋 共用魔力池上限 = 御主迴路×8 ＋ 同隊從者魔力 rankVal 總和×2。(2026-07 迴路 ×6→×8·魔力池提高)
//   魔力高的從者(Caster/Saber 魔A)擴充共用槽；魔力低者(Assassin 魔E)幾乎只靠御主迴路。
function masterPoolMax_(circuits, partyMagicVal) {
  return (parseInt(circuits) || 30) * 8 + (parseInt(partyMagicVal) || 0) * 2;
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

// ⚡ 主動技開關（玩家可切，存從者 MEMORY【主動技】）：on＝每戰自動全效發動(耗魔)／off＝微量被動(免費)。
//   預設 off（省魔安全，要爆發再自己開）。開/關二選一，永不並存，故不會回到 double-dip。
function activeSkillOn_(memory) {
  return /【主動技】on/.test(String(memory || ""));
}
function setActiveSkillMode_(memory, on) {
  var mem = String(memory || "").replace(/｜?【主動技】(on|off)/g, '');
  var v = on ? 'on' : 'off';
  return mem ? (mem + '｜【主動技】' + v) : ('【主動技】' + v);
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

function mergePhysicalStatus(oldJson, newObjOrStr) {
  try {
    let oldObj = JSON.parse(oldJson || "{}");
    let newObj = typeof newObjOrStr === 'string' ? JSON.parse(newObjOrStr || "{}") : (newObjOrStr || {});
    return JSON.stringify(Object.assign(oldObj, newObj));
  } catch (e) { return oldJson || "{}"; }
}

function maskPhysicalStatus(jsonStr, isNsfwMode) {
  if (isNsfwMode) return jsonStr;
  try {
    let obj = JSON.parse(jsonStr || "{}");
    const sensitiveKeys = ["胸部", "蜜穴", "肉棒", "口", "舌頭", "菊穴"];
    sensitiveKeys.forEach(k => { if (obj[k] && obj[k] !== "無") obj[k] = "???"; });
    return JSON.stringify(obj);
  } catch (e) { return "{}"; }
}

function buildPlayerStatusString(selfRow, relMem = "", isNsfwMode = false) {
  const safeMemory = String(selfRow[COL.PC.MEMORY] || "").replace(/\|/g, '@@@');
  const safeRelMem = String(relMem || "").replace(/\|/g, '@@@');
  const maskedPhysical = maskPhysicalStatus(selfRow[COL.PC.PHYSICAL] || "{}", isNsfwMode);
  const safePhysical = String(maskedPhysical).replace(/§/g, '###');
  const visibleStatusStr = buildVisibleStatusString(selfRow[COL.PC.STATUS]);

  // 位置索引固定（§ 協議），s[7-16] 為廢棄的九州五圍/裝備/境界欄，填空保持前端定位不位移。
  return [
    visibleStatusStr, "", selfRow[COL.PC.TRAIT], selfRow[COL.PC.LOC], selfRow[COL.PC.PREF],
    selfRow[COL.PC.HP], selfRow[COL.PC.MP], "", "", "", "", "",
    "", "", "", "", "", safeMemory, safeRelMem, selfRow[COL.PC.FACTION],
    selfRow[COL.PC.RANK], selfRow[COL.PC.ALIGN], selfRow[COL.PC.CONTRIB], selfRow[COL.PC.BACK], safePhysical,
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
