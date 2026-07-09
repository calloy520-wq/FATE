// ==========================================
// 🎴 Router_Creation.gs — 創角／召喚（2026-07 從 Router_Action.gs 拆出）
//   御主創角(actionManualNpc)＋敘事非阻塞補生成(actionBackfillMasterAi)＋召喚從者(actionSummonServant)。
//   共用 GAS 全域作用域，與 Router_Action.gs 等其他檔互叫無礙。見 HANDBOOK.md §4.1 拆分慣例。
// ==========================================

function actionManualNpc(userData, pcId, sheets) {
  // 🎴 御主創角專用（action="create"）。手動建 NPC(manual_npc) 已移除；從者另由 actionSummonServant 處理，與此無關。
  const newId = "PC_" + Date.now();
  const { name, sex, identity, standing, wish, appearance, magic, circuits, origin, melee } = userData;
  const finalName = name;
  const finalSex = sex;

  // 🔴 姓名已在 sanitizeUserData_ 清成純中文；若為空代表含非中文字元，直接擋下不寫表
  if (!finalName) {
    return JSON.stringify({ success: false, message: "名號僅限中文字，不可使用英文、數字或符號。" });
  }

  // 🔵 御主名號＝角色名（登入身分是「帳號名」·見 Account.gs）。2026-07 修：原本全表擋撞名——多帳號
  //   共用一張表、game_id 實例化後，不同局的同名御主由 game_id＋faction 徹底分流（所有查找皆 game_id 內、
  //   玩家御主永遠靠 pcId/ID 認人），跨局撞名無害；卻害「分享出去多人玩」時常見/正典名號被別局佔走而創不了角。
  //   改為只擋【正典角色名】：避免自創御主與被種入本局的同名正典敵手變雙胞胎（同局內按名字查會歧義）；
  //   想當正典角色請走「扮演正典御主」入口。用記憶體種子常數比對·順帶省掉一次整表讀。
  const _canonHit = (typeof SEED_MASTERS !== 'undefined' && SEED_MASTERS.some(m => m && m.name === finalName))
    || (typeof SEED_SERVANTS !== 'undefined' && SEED_SERVANTS.some(s => s && s.name === finalName));
  if (_canonHit) return JSON.stringify({ success: false, message: `「${finalName}」是聖杯戰爭中已知的英靈／御主——自創御主請另取名號；若想扮演此角，請用「扮演正典御主」入口。` });

  // 🔵 實例化：御主創角 → 開一個全新 game_id 世界
  const gameId = "g_" + Date.now();

  let validMapNames = ["深山町", "新都", "言峰教會", "未遠川"];
  if (sheets.map) {
    const maps = sheets.map.getDataRange().getValues().slice(1).map(r => String(r[COL.MAP.NAME]).trim()).filter(n => n !== "" && !n.includes('-'));
    if (maps.length > 0) validMapNames = maps;
  }

  // 🚀 開局非阻塞(2026-07)：create【不叫 AI】，用玩家輸入的種子值秒寫入御主列、立刻進場；
  //   AI 生成的背景/特徵/個性/萌點由 backfill_master_ai 在「召喚從者頁」背景補上(見 actionBackfillMasterAi)。
  //   ★數值(HP/MP/game_id/MEMORY 標記)全由 GAS 決定、與 AI 無關，故無 AI 也是結構完整、可直接開打的列。
  try {
    // 🎴 御主(凡人魔術師)初始數值：HP/MP 依魔術迴路(財力/身世決定)推算——御主是凡人，遠低於英靈從者。
    const masterStats = masterMaxHpMp_(parseInt(circuits) || 30);
    // 起始落點：確定性選一個有效冬木居所(偏好新都)，不需 AI；backfill 不動落點以免與移動競寫。
    const spawnName = validMapNames.find(n => /新都/.test(n)) || validMapNames[0];

    const pcColCount = Object.keys(COL.PC).length;
    const newRow = Array(pcColCount).fill("");
    newRow[COL.PC.ID] = newId; newRow[COL.PC.NAME] = finalName; newRow[COL.PC.SEX] = finalSex;
    newRow[COL.PC.BACK] = standing || identity || "來歷不明的魔術師"; // 種子＝玩家輸入身世；backfill 會用 AI 潤成 20 字背景
    newRow[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "氣息平穩" });
    newRow[COL.PC.MEMORY] = [
      wish ? `【願望】${wish}` : "",
      magic ? `【魔術】${magic}` : "",
      circuits ? `【迴路】${circuits}` : "",
      origin ? `【出身】${origin}` : "",
      melee ? `【體術】${melee}` : "",
      "【令咒】3",
      `【模式】${userData.warMode === 'chaos' ? 'chaos' : 'canon'}`,
      userData.warMode === 'chaos' ? "" : `【戰爭】${['4th', '5th'].indexOf(String(userData.war)) >= 0 ? userData.war : '5th'}`,
      (userData.warMode !== 'chaos' && userData.playedMaster) ? `【扮演】${String(userData.playedMaster).trim()}` : ""
    ].filter(Boolean).join("｜");
    // 🎴 起始禮裝：玩家自選（2026-07 不再隨機）。驗證＝合法的【被動】禮裝 id；空／'none'／破戒(special) 一律不帶。
    try {
      const pick = String(userData.mystic || "").trim();
      if (pick && MYSTIC_CODES[pick] && MYSTIC_CODES[pick].type === 'passive') {
        newRow[COL.PC.MEMORY] = equipMysticToMemory_(newRow[COL.PC.MEMORY], pick);
      }
    } catch (e) { }
    // 種子敘事欄(4 格預設)：backfill 成功會用單格 setValue 覆蓋為 AI 版；AI 失敗則保留這些預設(優雅降級)。
    newRow[COL.PC.TRAIT] = parseTraitsHelper("", "外貌平凡、舉止從容、自稱「我」、卸下心防的私密一面");
    newRow[COL.PC.LOC] = spawnName;
    newRow[COL.PC.PREF] = parseTraitsHelper("", "溫婉謙和、內斂堅韌、明哲保身、隨波逐流");
    newRow[COL.PC.HP] = masterStats.hp; newRow[COL.PC.MP] = masterStats.mp;
    newRow[COL.PC.MAX_HP] = masterStats.hp; newRow[COL.PC.MAX_MP] = masterStats.mp;
    newRow[COL.PC.FACTION] = "無"; newRow[COL.PC.RANK] = "御主";
    newRow[COL.PC.CONTRIB] = 0; newRow[COL.PC.ALIGN] = "中立";
    newRow[COL.PC.INTENT] = "（待揭曉）";
    newRow[COL.PC.GAME_ID] = gameId;
    sheets.pc.appendRow(newRow);

    if (userData.account) { try { linkAccountToPc_(userData.account, newId); } catch (e) { } }
    return JSON.stringify({ success: true, pcId: newId, gameId: gameId, message: `【聖杯】因果已定，『${finalName}』於「${spawnName}」締結令咒，成為御主。` });
  } catch (e) { return JSON.stringify({ success: false, message: "建立失敗:" + e.message }); }
}

// 🚀 御主敘事·非阻塞補生成(2026-07)：create 已用種子值秒建御主；此處於「召喚從者頁」背景叫 AI 補
//   背景/特徵/個性/萌點，只以【單格 setValue】更新 4 個敘事欄(不整列 write-back·避免與玩家動作競寫)。
//   失敗＝保留 create 寫的種子預設(優雅降級·玩家仍可逆天改命自改)。數值欄一律不碰。
function actionBackfillMasterAi(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const row = pcData[pIdx];
  const finalName = String(row[COL.PC.NAME] || ""), finalSex = String(row[COL.PC.SEX] || "異");
  const appearance = String(userData.appearance || ""), standing = String(userData.standing || "");
  const wish = String(userData.wish || ""), magic = String(userData.magic || ""), origin = String(userData.origin || "");

  let validMapNames = ["深山町", "新都", "言峰教會", "未遠川"];
  if (sheets.map) {
    const maps = sheets.map.getDataRange().getValues().slice(1).map(r => String(r[COL.MAP.NAME]).trim()).filter(n => n !== "" && !n.includes('-'));
    if (maps.length > 0) validMapNames = maps;
  }

  const promptStr = `【御主】：名號『${finalName}』，性別『${finalSex}』\n【外貌】：${appearance || "隨機"}\n【身世／財力】：${standing || "隨機"}\n【願望】：${wish || "隨機"}\n【魔術系統】：${magic || "隨機"}\n【出身】：${origin || "隨機"}`;

  const MASTER_GEN_SYS = `你是《命運停駐之夜》聖杯戰爭的角色生成核心，為玩家建立一位「御主（Master）」——參與第五次聖杯戰爭的現代魔術師，舞台是冬木市。請依玩家提供的姓名、性別、身世／財力、願望，生成合理且具戲劇張力的設定。

★【演出而非說明】願望與身世只作為設定底層，不要在 background 裡直接複述願望字面。
★【四格】traits 與 personality 各剛好 4 短句、頓號分隔、禁數字標籤：
- traits：外貌、氣質舉止、自稱與口氣(第一人稱·如 我/俺/吾＋說話語氣，如 自稱「吾」・睥睨王者腔)、卸下心防的私密一面
- personality：日常表象、真實內裡、喜歡的事物、討厭的事物
★npc_intent：一句【簡短】萌點（可愛反差，≤18字，系統會在30字處硬性截斷、務必精簡），結合此御主身分性格，要反差、可愛、獨特。務必寫完整一句話，不可斷在句意未完處。【禁】誤用聖杯戰爭機制專有詞(令咒/寶具/魔術迴路/從者/職階等)當裝飾性魔法元素湊萌點——這些詞在本作有精確機制意義(如令咒是對從者下達絕對命令的珍貴道具，不是隨手用來做家事雜活的萬用法寶)，情節上真的合理相關才能出現；請改用生活化情境(手作/習慣/小癖好等)。
★background：限20字，呼應其身世／財力，禁出現具體物品名。
★【勿輸出數值】戰力數值、HP/MP 一律由系統裁定，prompt【不要】輸出任何數值欄位；也不要輸出地點。

★【輸出】合法 JSON、禁 Markdown：
{"background":"限20字","traits":"四格頓號字串","personality":"四格頓號字串","npc_intent":"結合御主身分的獨特可愛反差萌，一句話"}`;

  try {
    // 🔴 ignoreLaw: true，把節慶跟天氣隔絕在創建室外
    const aiBrief = JSON.parse(callGeminiAPI(promptStr, MASTER_GEN_SYS, { temperature: 0.6, ignoreLaw: true }));
    // 🔒 競態修(2026-07)：backfill 豁免寫入鎖，pIdx 是 AI 呼叫【前】的列索引——期間清殘列若刪列，
    //   索引位移會把御主敘事寫到別列。寫回前 ID 欄窄讀重定位；列已被刪→放棄寫入。
    const wIdx = buildLiveIdIndex_(sheets.pc)[String(pcId)];
    if (wIdx === undefined) return JSON.stringify({ success: false, message: "御主列已不存在（可能剛被清理）。" });
    // 單格寫回(不整列)：只覆蓋敘事欄，且僅在 AI 有給值時；數值/MEMORY/位置一律不碰。
    if (aiBrief.background) sheets.pc.getRange(wIdx + 1, COL.PC.BACK + 1).setValue(String(aiBrief.background).slice(0, 40));
    if (aiBrief.traits) sheets.pc.getRange(wIdx + 1, COL.PC.TRAIT + 1).setValue(parseTraitsHelper(aiBrief.traits, row[COL.PC.TRAIT]));
    if (aiBrief.personality) sheets.pc.getRange(wIdx + 1, COL.PC.PREF + 1).setValue(parseTraitsHelper(aiBrief.personality, row[COL.PC.PREF]));
    // 🐛→✅ 萌點欄同款腰斬修正(比照 Gallery.gs actionBackfillKanshouAi)：slice(0,18) 對一句話太緊，
    //   AI 稍微超字數就被砍在句意中間，放寬緩衝。
    if (aiBrief.npc_intent) sheets.pc.getRange(wIdx + 1, COL.PC.INTENT + 1).setValue(String(aiBrief.npc_intent).slice(0, 30));
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ success: false, message: "背景補生成失敗（已保留種子設定）" });
  }
}

// ==========================================
// 🔵 召喚從者（Servant）— 寫進御主自己的 game_id 實例，並設為同行夥伴
// ==========================================
// 🔵 六圍階級 → 內部數值（橋接）：rankVal 轉，最低 8
function svNum_(rank) { return Math.max(8, rankVal(rank)); }

// 🔵 提供前端瀏覽英靈殿：回傳 [{id,cls,name,gender,np}]
// 從御主 MEMORY 讀戰役模式（canon=正史 / chaos=混亂；舊角色預設 canon）
function getWarMode_(memory) {
  var m = String(memory || "").match(/【模式】(canon|chaos)/);
  return m ? m[1] : "canon";
}
// 鋪敵用的「戰爭」字串：混亂→chaos；正史→【戰爭】(4th/5th/fake，預設 5th)
function getWarName_(memory) {
  if (getWarMode_(memory) === "chaos") return "chaos";
  var m = String(memory || "").match(/【戰爭】(4th|5th)/);
  return m ? m[1] : "5th";
}
// 玩家扮演的正典御主 id（自創則空）
function getPlayedMaster_(memory) {
  var m = String(memory || "").match(/【扮演】([^｜|【]+)/);  // ★須排除全形分隔符 ｜(U+FF5C)，否則尾巴吃進下個標籤致比對失敗(自我分身敵)
  return m ? m[1].trim() : "";
}

function actionGetHeroes(userData, pcId, sheets) {
  try {
    const rows = getHeroCodexCached().slice(1);
    const heroes = rows.filter(r => r[COL.HERO.ID]).map(r => {
      const h = {
        id: r[COL.HERO.ID], cls: r[COL.HERO.CLS], name: r[COL.HERO.NAME],
        gender: r[COL.HERO.SEX], np: r[COL.HERO.NP],
        src: String(r[COL.HERO.SOURCE] || "") // 🌟 來源：ai_gen＝玩家原創(工房/盲盒)·前端「玩家原創」專區用
      };
      if (h.src === "ai_gen") { // ✏️ 原創英靈附 創造者＋編輯預填資料(工房修改模式用·種子不附)
        let pj = {}; try { pj = JSON.parse(r[COL.HERO.PERSONA] || "{}"); } catch (e) { }
        h.creator = String(pj.creator || "");
        let six = {}, sk = []; try { six = JSON.parse(r[COL.HERO.SIX] || "{}"); } catch (e) { } try { sk = JSON.parse(r[COL.HERO.SKILLS] || "[]"); } catch (e) { }
        h.detail = { six: six, skills: sk, align: String(r[COL.HERO.ALIGN] || "中立"),
          look: String(pj.look || ""), pref: String(pj.words || ""), moe: String(pj.moe || ""), fp: String(pj.firstP || ""),
          toMaster: String(pj.toMaster || ""), speech: String(pj.speech || ""), tic: String(pj.tic || ""), back: String(pj.back || ""), weapon: String(pj.weapon || "") };
      }
      return h;
    });
    return JSON.stringify({ success: true, heroes: heroes });
  } catch (e) {
    return JSON.stringify({ success: false, heroes: [], message: e.message });
  }
}

// 取某場戰爭的正典御主清單（供「扮演正典御主」帶入預設）
function actionGetMasters(userData, pcId, sheets) {
  const war = String(userData.war || "5th");
  const roster = (war === '4th') ? FATE_4TH_ROSTER : FATE_5TH_ROSTER;
  const mrows = getMasterCodexCached();
  if (!mrows.length) return JSON.stringify({ success: true, masters: [] });
  const out = roster.map(function (r) {
    const m = mrows.find(function (x) { return String(x[COL.MASTER.ID]) === r.master; });
    if (!m) return null;
    return {
      id: String(m[COL.MASTER.ID]), name: String(m[COL.MASTER.NAME] || ""),
      sex: String(m[COL.MASTER.SEX] || "異"), appear: String(m[COL.MASTER.APPEAR] || ""),
      magic: String(m[COL.MASTER.MAGIC] || ""), wish: String(m[COL.MASTER.WISH] || ""),
      servant: r.hero
    };
  }).filter(Boolean);
  return JSON.stringify({ success: true, masters: out });
}

// 引擎實際吃得到的 fx 字典（AI 生成新從者時從中挑選，確保新角色也能「吃到標籤」）。
//   ⚖️ 刻意【不放】頂級概念寶具 fx：ea(乖離劍·對界)／gob(王之財寶)／excalibur／ubw(無限劍製)／
//     summon_horror(海怪)／chain(天之鎖)／wealth(黃金律)——避免玩家一鍵生出「乖離劍氾濫」的破壞平衡從者；
//   也【不放】需專屬 UI/MEMORY 的機制 fx：mage_realm(斯卡蒂可選盤)／rune(符文模式)。這些留給手工種子(SEED_SERVANTS)。
//   其餘中階以下(含施放/防禦/對人放大)已開放，讓自訂/AI 從者的天花板貼近種子。
var ALLOWED_FX_ = {
  nullify_magic: 1, first_strike: 1, analyze: 1, str_up: 1, burst: 1, ride: 1, stealth: 1,
  evade_ranged: 1, survive: 1, mad: 1, morale: 1, divine_age: 1,
  unreadable: 1, wind_strike: 1, tsubame: 1, gae_bolg: 1, god_hand: 1,
  clear_mind: 1, self_mod: 1, tactics: 1, anti_magic_lance: 1, rule_breaker: 1,
  // 🆕 2026-07 放寬(A)：施放技術/命中/防禦/對人放大——中階以下，拉高自訂從者上限、不含頂級概念寶具
  aim: 1, projection: 1, fast_cast: 1, crafting: 1, petrify: 1, shapeshift: 1,
  solo: 1, weapon_steal: 1, rho_aias: 1, territory: 1, wall_def: 1, zabaniya: 1, regen: 1,
  // ⚠ 2026-07 六波拔除 divine_core(神核)：玩家點破「這是只有真正神靈軀體才有的，是不是有人拿到了」——
  //   查證種子庫 5 位持有者裡 2 位(美杜莎/伊絲塔)其實查無來源確認、已拔除，剩 3 位(斯卡蒂/阿基里斯/迦爾納)
  //   皆貨真價實神裔。工房原本零門檻任何自訂角色可買，跟 ea/王之財寶/UBW/海怪/天之鎖/黃金律 等
  //   種子專屬機制的處理邏輯矛盾——漲價解決不了「凡人不該有」的問題(有預算照樣買得到)，改比照收為種子專屬。
  divine: 1, // 🆕 2026-07：神性(帶階級·比 trait 名判定精準)——引擎中主要是弱點(被神殺/天之鎖/對神剋)，濫用價值低
  agile_striker: 1, // 💨 2026-07：以巧破力——以敏捷為傷害底(敏高於筋/魔時)。敏捷輸出流唯一通道·二元·全能稅×0.85·平價25。⚠顯示名勿用「神速」：理查/斯卡哈-Assassin 正史技能已叫神速(fx=first_strike·先機)，兩機制撞名必混淆
  // 🆕 2026-07 三波開放(玩家定案·互鬥錦標賽揪出剋制缺口後補貨架)：
  sense: 1,    // 氣息感知(恩奇都同款)：階級≥對方氣息遮斷→看穿奇襲。刺客流的天然反制。
  god_slay: 1, // 神殺(斯卡哈同款)：對神性之敵×1.17~2.0(依對方神格·binary→固定25)。counter-pick 剋神核/神裔。
  lovespot: 1  // 愛之痣(迪盧木多同款)：敵命中-1(微量風味·固定5)。
};
var FX_MENU_ = "【可用技能效果碼 fx】挑契合此英靈的，沒對應就填空字串\"\"（頂級概念寶具 乖離劍/王之財寶/無限劍製/神核 等為種子專屬、不在此清單）：" +
  "對魔力=nullify_magic、直感=first_strike、心眼=analyze、千里眼=aim、怪力=str_up、魔力放出=burst、投影魔術=projection、" +
  "高速詠唱=fast_cast、道具作成=crafting、騎乘=ride、氣息遮斷=stealth、變化(迴避+)=shapeshift、避矢=evade_ranged、" +
  "戰鬥續行=survive、單獨行動=solo、七天盾(對寶具展開·投影減傷·御主耗魔)=rho_aias、陣地作成(減傷)=territory、城牆防禦(物理減傷)=wall_def、" +
  "狂化=mad、勇猛/卡里斯瑪=morale、神代魔術=divine_age、無欲(封先機)=unreadable、透化(免威壓)=clear_mind、" +
  "自我改造(命中傷害+)=self_mod、軍略(寶具+)=tactics、風王鐵鎚(傷+)=wind_strike、魔眼(石化)=petrify、必中槍=gae_bolg、" +
  "秘劍燕返(每場首回合強化)=tsubame、妄想心音(暗殺致命)=zabaniya、無毀湖光(對龍+)=weapon_steal、治癒(每回合回血)=regen、不死復活(復活3次·如尼祿三度輝映)=god_hand、" +
  "破魔(無視神核/續行)=anti_magic_lance、破戒(斬契約救贖)=rule_breaker、神性(神裔·會被神殺剋)=divine、以巧破力(以敏捷為傷害底)=agile_striker、" +
  "氣息感知(看穿奇襲)=sense、神殺(剋神性之敵)=god_slay、愛之痣(魅惑·敵命中-1)=lovespot";

// 清洗 AI 給的技能陣列為 [{n,r,fx}]（fx 不在字典就清空，仍保留為演出用標籤）
//   r 階級與 sanitizeSix_ 同一套驗證(承認 A++/B−)——原 slice(0,2) 會把 "A++" 截成 "A+"(2026-07 修)。
//   ⚠ 2026-07 修：maxCount 預設 5，但 prompt 實際只要求 classSkills(1~2個)/skills(2~3個)——
//   原本不論呼叫端都固定 slice(0,5)，等於允許 AI 吐兩倍於預算的技能數量(每個格式都合法，
//   只是整體密度失控)。呼叫端各自傳自己的真實預算上限，不再共用同一個寬鬆值。
function sanitizeSkills_(arr, maxCount) {
  if (!Array.isArray(arr)) return [];
  var okR = function (v) { return /^(E|D|C|B|A|EX)(\+{1,2}|\-)?$/.test(v); };
  return arr.filter(Boolean).slice(0, maxCount || 5).map(function (s) {
    var fx = String((s && (s.fx || s.效果碼)) || "").trim();
    var r = String((s && (s.r || s.階級 || s.rank)) || "C").toUpperCase().trim();
    return {
      n: String((s && (s.n || s.名稱 || s.name)) || "技能").slice(0, 10),
      r: okR(r) ? r : "C",
      fx: ALLOWED_FX_[fx] ? fx : ""
    };
  });
}
// 清洗六圍：6 鍵齊全、階級合法（E~EX、可帶 +/++/−）；缺或亂給則補 C。
//   2026-07 放寬：承認 A++/B−——AI 泡在 Fate 語料很常自發吐 A++，原 regex 只認單 + 會把名將靜默打成 C。
// ⚠ 2026-07 修：格式檢查只驗證「單一階級字串合法」，沒有整體強度上限——AI 可以讓六圍全部合法
//   但全部給 EX(遠超任何種子英靈)，且 recordOriginalHero_ 會把這個角色永久寫回英靈殿供之後任何
//   玩家重召，等於一次 prompt 誘導固化成長期破台角色。比照現有種子最強者的分布(EX 級頂格通常只
//   保留給單一招牌屬性，如吉爾伽美什寶具EX、理查一世敏捷EX，即使赫拉克勒斯五圍逼近頂格也僅
//   一項真 EX)，EX 級最多保留 2 項，其餘超額者降階為 A(仍是強者、但收斂進種子庫的強度分布)。
function sanitizeSix_(o) {
  var keys = ["筋力", "耐久", "敏捷", "魔力", "幸運", "寶具"], out = {};
  var ok = function (v) { return /^(E|D|C|B|A|EX)(\+{1,2}|\-)?$/.test(String(v || "").toUpperCase()); };
  keys.forEach(function (k) { var v = o && o[k] ? String(o[k]).toUpperCase().trim() : "C"; out[k] = ok(v) ? v : "C"; });
  var exKeys = keys.filter(function (k) { return rankVal(out[k]) >= 60; });
  if (exKeys.length > 2) exKeys.slice(2).forEach(function (k) { out[k] = "A"; });
  return out;
}

// 🆕 把 AI 生成的原創從者寫回英靈殿（重名則不收；御主不適用此機制）
//   2026-07：加選填 pExtra 物件(工房玩家自定 外貌look/萌點moe/自稱firstP/態度toMaster/口吻speech/小動作tic/身世back)
//   ——hero 分支重召時讀 persona 同名欄(stampPersonaFlavor_ 等)，不存的話玩家親手寫的設定會在重召時退回預設。
//   舊呼叫端不傳＝空物件、行為不變。
function recordOriginalHero_(name, cls, sex, sixJson, classSkills, skills, traits, np, personaWords, align, pExtra) {
  name = String(name || "").trim();
  if (!name) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hs = ss.getSheetByName("英靈殿");
  if (!hs) return;
  var data = getHeroCodexCached();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.HERO.NAME]).trim() === name) return; // 已有同名 → 不重複收錄
  }
  var px = pExtra || {};
  var persona = JSON.stringify({
    words: String(personaWords || ""), firstP: String(px.firstP || "") || "我", toMaster: String(px.toMaster || ""),
    look: String(px.look || ""), moe: String(px.moe || ""), speech: String(px.speech || ""), tic: String(px.tic || ""), back: String(px.back || "")
  });
  // 🤖 2026-07 玩家定調「工房捏角當下也提前生成日常資料」：跟種子英靈懶惰快取(見
  // getOrComputeDailyHeroFields_)不同——工房角色創造當下就順手轉好，寫進英靈殿新增的
  // DAILY_LOOK/DAILY_WORDS 欄，之後第一次被召喚進鑑賞就直接有現成日常版，不必等召喚當下才轉。
  // 🌹 2026-07 玩家定案「日常衣裝獨立成欄」：translateAppearanceToDaily_ 已升級成 translateLookToDaily_，
  //   一次呼叫同時產出四段式 look(外貌本相/氣質舉止/自稱與口氣/私密一面) 與獨立的 outfit(日常穿搭)。
  var dailyLookRes = translateLookToDaily_(name, cls, String(px.look || ""), String(px.firstP || ""), String(px.speech || ""));
  var dailyWords = translatePersonalityToDaily_(name, cls, String(personaWords || ""));
  // 🌹 2026-07 玩家定案「餐桌是平行世界、沒有聖杯戰爭這回事」：萌點比照 look/words 同步轉換，
  //   避免 heroToKanshouRow_ 直接搬戰時反差萌進一個沒打過聖杯戰爭的世界。
  var dailyMoe = translateMoeToDaily_(name, cls, String(px.moe || ""));
  hs.appendRow([name + "-" + cls, cls, name, sex || "異", sixJson || "{}",
    JSON.stringify(classSkills || []), JSON.stringify(skills || []), JSON.stringify(traits || []),
    np || "", persona, align || "中立", "[]", "ai_gen", dailyLookRes.look, dailyWords, dailyMoe, dailyLookRes.outfit]);
  try { CacheService.getScriptCache().remove("FATE_HERO_CODEX"); } catch (e) { } // 種子表已變動→清快取，下次讀到新從者
}

// 🛠️ 職階技能慣例表（工房自動附贈·不占 3 槽·與種子/AI 生成對稱）
var FORGE_CLS_SKILLS_ = {
  Saber: [{ n: "對魔力", r: "B", fx: "nullify_magic" }], Lancer: [{ n: "對魔力", r: "C", fx: "nullify_magic" }],
  Archer: [{ n: "對魔力", r: "C", fx: "nullify_magic" }, { n: "單獨行動", r: "C", fx: "solo" }],
  Rider: [{ n: "對魔力", r: "C", fx: "nullify_magic" }, { n: "騎乘", r: "B", fx: "ride" }],
  Caster: [{ n: "陣地作成", r: "C", fx: "territory" }, { n: "道具作成", r: "C", fx: "crafting" }],
  Assassin: [{ n: "氣息遮斷", r: "B", fx: "stealth" }], Berserker: [{ n: "狂化", r: "C", fx: "mad" }]
};
// 🛠️ 工房 build 解析＋全套驗證（單一真實來源：召喚 actionSummonServant build 分支 與 修改 actionUpdateHero 共用）。
//   規格：預算340·六圍+技能+規模同一錢包(EX≤2)＋技能≤4(前3免欄位費·第4欄+20·fx白名單·上限A·三軌計價·二元平價·燕返60)＋規模計價(對軍+20)＋
//   寶具名/描述剝高規模關鍵字＋正典名擋＋演出七欄清洗。回 {ok:false,message} 或 {ok:true,...欄位}。
function parseForgeBuild_(build, reqCls) {
  const VALID_CLS = ["Saber", "Archer", "Lancer", "Rider", "Caster", "Assassin", "Berserker"];
  const out = {};
  // 🌹 2026-07「御主」職階：鑑賞限定純敘事款(比照 Seed_Codex.gs 的3位canon御主)，不參與戰鬥——
  //   獨立於 VALID_CLS(七大從者職階)之外判斷，不吃 reqCls 的 Saber fallback。
  const isMasterCls = String(build.cls) === "御主";
  out.cls = isMasterCls ? "御主" : (VALID_CLS.includes(String(build.cls)) ? String(build.cls) : (reqCls || "Saber"));
  out.name = String(build.name || "").replace(/[<>&"'`]/g, "").trim().slice(0, 20);
  if (!out.name) return { ok: false, message: "請為英靈取一個真名。" };
  if ((typeof SEED_SERVANTS !== "undefined" && SEED_SERVANTS.some(s => s && s.name === out.name)) ||
      (typeof SEED_MASTERS !== "undefined" && SEED_MASTERS.some(m => m && m.name === out.name))) {
    return { ok: false, message: `「${out.name}」是英靈殿正典角色——請用「✨真名召喚」直接召喚，或另取原創真名。` };
  }
  out.sex = ["男", "女", "異"].includes(String(build.sex)) ? String(build.sex) : "異";
  const _fClean = (v, n) => String(v || "").replace(/[｜【】\n\r\t]/g, "").trim().slice(0, n);
  out.fp = _fClean(build.fp, 4); out.toM = _fClean(build.toMaster, 20); out.speech = _fClean(build.speech, 40);
  out.tic = _fClean(build.tic, 30); out.moe = _fClean(build.moe, 18); out.back = _fClean(build.back, 28);
  const ALIGNS_ = ["秩序・善", "秩序・中庸", "秩序・惡", "中立・善", "中立", "中立・惡", "混沌・善", "混沌・中庸", "混沌・惡"];
  out.align = ALIGNS_.includes(String(build.align)) ? String(build.align) : "中立";
  out.look = _fClean(build.look, 60); out.pref = _fClean(build.pref, 60);
  const _segs = v => v ? v.split(/[、,，]/).filter(Boolean).length : 0;
  out.lookFull = _segs(out.look) >= 3; out.prefFull = _segs(out.pref) >= 3;
  out.desc = String(build.desc || "").trim().slice(0, 120);
  if (isMasterCls) {
    // 🌹 御主：六圍/技能/寶具/武裝全部略過驗證與計費，強制留空(鑑賞用不到、不進戰鬥引擎)。
    out.six = {}; out.skills = []; out.classSkills = [];
    out.npScale = "對人"; out.npName = ""; out.npR = ""; out.npDesc = ""; out.weapon = "";
    out.ok = true;
    return out;
  }
  // 💰 2026-07 調升 270→340：技能計價/規模計價後來併入同一錢包，270(原純六圍的 A−設定)實測按
  //   工房價格計價全種子＝排 32/36(咒腕級墊底)。340＝種子中位數——點滿≈尼祿/美杜莎中堅，
  //   強者種子(420~505·且握有 Excalibur/王財等工房買不到的概念 fx)仍明確在上。
  const FORGE_BUDGET = 340;
  // 🐗 狂化補正(2026-07 玩家定案+30)：Berserker 職階附贈=狂化C(傷+但命中/迴避−·不可關)是七職階唯一
  //   「負資產禮物」——同素體實測墊底(普攻3.0%/寶具3.0%·Caster 6.1/13.3)。差距換算 20~45 點(幸運階梯
  //   匯率 10點≈1.2pp)，取中 30；+50 會反轉成最優職階。370 頂配狂戰實測 70.9%/45.9%=強力中堅·安全。
  const FORGE_CLS_BONUS_ = { Berserker: 30 };
  const okPlain = v => /^(E|D|C|B|A|EX)$/.test(String(v || "").toUpperCase());
  out.six = {};
  ["筋力", "耐久", "敏捷", "魔力", "幸運", "寶具"].forEach(k => { const v = String((build.six || {})[k] || "C").toUpperCase(); out.six[k] = okPlain(v) ? v : "C"; });
  const exK = Object.keys(out.six).filter(k => out.six[k] === "EX");
  if (exK.length > 2) exK.slice(2).forEach(k => out.six[k] = "A");
  const spent = Object.keys(out.six).reduce((s, k) => s + rankVal(out.six[k]), 0);
  out.npScale = (String(build.npScale) === "對軍") ? "對軍" : "對人";
  const scaleCost = (out.npScale === "對軍") ? 20 : 0;
  // 🎰 第4技能欄(2026-07 玩家定案·欄位費+20)：壓力測試證實安全——預算才是真約束(第4技+20費逼六圍讓位)，
  //   疊加上限±8 讓多買的命中/迴避冗餘；最壞情況四技組合(83~85%)皆未超過三技頂點(93%)。
  out.skills = (Array.isArray(build.skills) ? build.skills : []).filter(Boolean).slice(0, 4).map(s => {
    const fx = ALLOWED_FX_[String(s && s.fx || "").trim()] ? String(s.fx).trim() : "";
    let r = String(s && s.r || "C").toUpperCase(); if (!/^(E|D|C|B|A)$/.test(r)) r = "C";
    return { n: String(s && s.n || "").replace(/[<>&"'`]/g, "").slice(0, 10) || "技能", r: r, fx: fx };
  });
  const SKILL_PTS_ = { E: 5, D: 10, C: 15, B: 20, A: 25 };
  // 🎚️ 三軌計價(2026-07 玩家定案「效果不同價錢不能一樣」)：同組同價會讓大係數標籤嚴格支配小係數——
  //   照引擎真實係數分軌：強效(千里眼/魔眼4×階·高速詠唱/神代12×階＋剋對魔力·陣地26%×階)貴 1/3、
  //   輕效(騎乘2×階·風王6×階·勇猛3×階且被透化封)便宜 1/3。鏡射前端 FORGE_SK_TRACK/FORGE_SK_PTS_*。
  const SKILL_PTS_BIG_ = { E: 7, D: 13, C: 20, B: 27, A: 33 };
  const SKILL_PTS_SMALL_ = { E: 3, D: 7, C: 10, B: 13, A: 17 };
  const SKILL_TRACK_ = { aim: 1, petrify: 1, fast_cast: 1, divine_age: 1, territory: 1, ride: -1, wind_strike: -1, morale: -1 }; // 1=強效 -1=輕效 其餘標準
  // 二元平價(引擎不讀階級)：weapon_steal 對龍恆×1.5(2026-07 補洞：原階級計價可 E5 白撿)、god_slay 依【對方】神格縮放、lovespot 恆-1(風味價5)
  const FLAT_FX_ = { god_hand: 25, survive: 25, tsubame: 60, zabaniya: 25, gae_bolg: 25, rule_breaker: 25, anti_magic_lance: 25, agile_striker: 25, weapon_steal: 25, god_slay: 25, lovespot: 5 };
  const slotFee = out.skills.length > 3 ? 20 : 0; // 🎰 第4欄啟用費(有第4個技能條目即收·純演出標籤也占欄)
  const skillCost = out.skills.reduce((s, k) => s + (k.fx ? (FLAT_FX_[k.fx] ||
    (SKILL_TRACK_[k.fx] === 1 ? SKILL_PTS_BIG_ : SKILL_TRACK_[k.fx] === -1 ? SKILL_PTS_SMALL_ : SKILL_PTS_)[k.r] || 15) : 0), slotFee);
  const total = spent + scaleCost + skillCost;
  const clsBudget = FORGE_BUDGET + (FORGE_CLS_BONUS_[out.cls] || 0);
  if (total > clsBudget) return { ok: false, message: `六圍 ${spent}＋技能 ${skillCost}${slotFee ? "(含第4欄+20)" : ""}＋規模「${out.npScale}」${scaleCost ? `+${scaleCost}` : "0"} ＝ ${total}，超過預算 ${clsBudget}${FORGE_CLS_BONUS_[out.cls] ? "(含狂化補正+" + FORGE_CLS_BONUS_[out.cls] + ")" : ""}——請調降六圍/技能階級或改對人規模。` };
  out.classSkills = FORGE_CLS_SKILLS_[out.cls] || [];
  out.npName = String(build.npName || "").replace(/[<>&"'`]/g, "").replace(/【常駐寶具】|對城|對界|對神/g, "").trim().slice(0, 20) || "無名寶具";
  out.npR = out.six["寶具"]; // 顯示階＝六圍寶具階(引擎本就只吃 six.寶具)
  out.npDesc = String(build.npDesc || "").replace(/【常駐寶具】|對城|對界|對神/g, "").replace(/[｜【】\n\r\t]/g, "").trim().slice(0, 40);
  out.weapon = _fClean(build.weapon, 30);
  out.ok = true;
  return out;
}

// 💾 工房存檔（action="save_hero"·2026-07 玩家定案二版：工房＝純製造/修改，不召喚）：
//   create＝寫英靈殿新列(AI 補 persona/寶具英文名·蓋創造者印記)；edit(帶 heroId)＝僅創造者本人可改、
//   真名不可改(識別鍵)、演出欄非空覆寫/空保留、寶具英文名沿用舊值。改的是英靈殿【範本】——
//   之後召喚才生效，已在場的分身不追改(可用 DEV「套用最新平衡」同步)。
// 🖐 認領無主原創英靈（action="claim_hero"·2026-07）：創造者印記功能上線【前】鑄的 ai_gen 英靈
//   沒有 persona.creator——「我的作品」不列、✏️ 不亮、誰都不能改。開放認領：無主者先到先得，
//   認領後即為創造者(可修改)。已有主的不可搶(拒絕)。
function actionClaimHero(userData, pcId, sheets) {
  const acct = String(userData.acctName || "").trim();
  const heroId = String(userData.heroId || "").trim();
  if (!acct || !heroId) return JSON.stringify({ success: false, message: "缺少帳號或英靈識別。" });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hs = ss.getSheetByName("英靈殿");
  if (!hs) return JSON.stringify({ success: false, message: "英靈殿不存在。" });
  const data = hs.getDataRange().getValues();
  const idx = data.findIndex((r, i) => i > 0 && String(r[COL.HERO.ID]) === heroId);
  if (idx < 0) return JSON.stringify({ success: false, message: "查無此英靈。" });
  if (String(data[idx][COL.HERO.SOURCE]) !== "ai_gen") return JSON.stringify({ success: false, message: "正典種子英靈不可認領。" });
  let pj = {}; try { pj = JSON.parse(data[idx][COL.HERO.PERSONA] || "{}"); } catch (e) { }
  if (pj.creator) return JSON.stringify({ success: false, message: `「${data[idx][COL.HERO.NAME]}」已有創造者（${pj.creator}），不可認領。` });
  pj.creator = acct;
  data[idx][COL.HERO.PERSONA] = JSON.stringify(pj);
  hs.getRange(idx + 1, COL.HERO.PERSONA + 1).setValue(data[idx][COL.HERO.PERSONA]);
  try { CacheService.getScriptCache().remove("FATE_HERO_CODEX"); } catch (e) { }
  return JSON.stringify({ success: true, message: `「${data[idx][COL.HERO.NAME]}」已認領——現在你是她的創造者，可在工房修改。` });
}

function actionSaveHero(userData, pcId, sheets) {
  const acct = String(userData.acctName || "").trim();
  if (!acct) return JSON.stringify({ success: false, message: "缺少帳號身分，請重新登入。" });
  let build = null;
  try { build = (typeof userData.build === "string") ? JSON.parse(userData.build) : userData.build; } catch (e) { }
  if (!build) return JSON.stringify({ success: false, message: "工房資料格式錯誤。" });
  const heroId = String(userData.heroId || "").trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hs = ss.getSheetByName("英靈殿");
  if (!hs) return JSON.stringify({ success: false, message: "英靈殿不存在。" });

  if (heroId) {
    // ── ✏️ 修改模式 ──
    const data = hs.getDataRange().getValues();
    const idx = data.findIndex((r, i) => i > 0 && String(r[COL.HERO.ID]) === heroId);
    if (idx < 0) return JSON.stringify({ success: false, message: "查無此英靈。" });
    if (String(data[idx][COL.HERO.SOURCE]) !== "ai_gen") return JSON.stringify({ success: false, message: "正典種子英靈不可修改。" });
    let pj = {}; try { pj = JSON.parse(data[idx][COL.HERO.PERSONA] || "{}"); } catch (e) { }
    if (!pj.creator || pj.creator !== acct) return JSON.stringify({ success: false, message: "僅創造者本人可修改這名英靈。" });
    build.name = String(data[idx][COL.HERO.NAME]); // 真名＝識別鍵，不可改
    const pb = parseForgeBuild_(build, String(data[idx][COL.HERO.CLS] || ""));
    if (!pb.ok) return JSON.stringify({ success: false, message: pb.message });
    // 寶具英文名沿用舊值（修改不重叫 AI）；御主職階無寶具，np 恆空字串。
    const oldNp = String(data[idx][COL.HERO.NP] || "");
    const enM = oldNp.match(/\s([A-Za-z][A-Za-z0-9 .'\-:]{2,29})（/);
    const np = (pb.cls === "御主") ? "" : `${pb.npName}${enM ? " " + enM[1] : ""}（${pb.npScale} ${pb.npR}）${pb.npDesc ? "·" + pb.npDesc : ""}`;
    const keep = (nv, ov) => nv ? nv : String(ov || "");
    data[idx][COL.HERO.CLS] = pb.cls; data[idx][COL.HERO.SEX] = pb.sex;
    data[idx][COL.HERO.SIX] = JSON.stringify(pb.six);
    data[idx][COL.HERO.CLASS_SKILLS] = JSON.stringify(pb.classSkills);
    data[idx][COL.HERO.SKILLS] = JSON.stringify(pb.skills);
    data[idx][COL.HERO.NP] = np; data[idx][COL.HERO.ALIGN] = pb.align;
    const newWords = keep(pb.pref, pj.words), newLook = keep(pb.look, pj.look), newMoe = keep(pb.moe, pj.moe);
    const newFp = keep(pb.fp, pj.firstP) || "我", newSpeech = keep(pb.speech, pj.speech);
    data[idx][COL.HERO.PERSONA] = JSON.stringify({
      words: newWords, firstP: newFp, toMaster: keep(pb.toM, pj.toMaster),
      look: newLook, moe: newMoe, speech: newSpeech,
      tic: keep(pb.tic, pj.tic), back: keep(pb.back, pj.back), weapon: keep(pb.weapon, pj.weapon), creator: pj.creator
    });
    // 🤖 2026-07：外貌/性格改了，先前快取的日常版本會跟新設定對不上——重新轉一次，不留舊資料。
    // 🌹 2026-07 玩家定案「日常衣裝獨立成欄」：translateLookToDaily_ 一次呼叫同時產出四段式 look 與
    //   獨立的 outfit，取代原本的 translateAppearanceToDaily_。
    const dailyLookRes = translateLookToDaily_(build.name, pb.cls, newLook, newFp, newSpeech);
    data[idx][COL.HERO.DAILY_LOOK] = dailyLookRes.look;
    data[idx][COL.HERO.DAILY_OUTFIT] = dailyLookRes.outfit;
    data[idx][COL.HERO.DAILY_WORDS] = translatePersonalityToDaily_(build.name, pb.cls, newWords);
    data[idx][COL.HERO.DAILY_MOE] = translateMoeToDaily_(build.name, pb.cls, newMoe);
    hs.getRange(idx + 1, 1, 1, data[idx].length).setValues([data[idx]]);
    try { CacheService.getScriptCache().remove("FATE_HERO_CODEX"); } catch (e) { }
    return JSON.stringify({ success: true, edited: true, message: `「${build.name}」的靈基已重鑄——之後召喚皆用新設定（已在場的分身不追改）。` });
  }

  // ── 🛠️ 製造模式 ──
  const pb = parseForgeBuild_(build, "");
  if (!pb.ok) return JSON.stringify({ success: false, message: pb.message });
  const dup = getHeroCodexCached().slice(1).find(r => String(r[COL.HERO.NAME]).trim() === pb.name);
  if (dup) return JSON.stringify({ success: false, message: `英靈殿已有「${pb.name}」——請換一個真名，或請其創造者修改。` });
  // 🎭 AI 只補「玩家沒填的」演出欄＋寶具英文真名——失敗不擋鑄造
  // 🌹 御主職階無寶具/技能，提示詞跳過那兩行、系統prompt也不要求 npEn(反正不會被讀)。
  const isMasterCls = pb.cls === "御主";
  let flavor = null;
  try {
    flavor = JSON.parse(callGeminiAPI(
      `【真名】：${pb.name}\n【職階】：${pb.cls}\n【性別】：${pb.sex}\n【玩家描述】：${pb.desc || "無"}${pb.look ? `\n【外貌(${pb.lookFull ? "玩家已定·照抄勿改" : "玩家核心設定·擴寫成四短句·勿改本意"})】：${pb.look}` : ""}${pb.pref ? `\n【個性(${pb.prefFull ? "玩家已定·照抄勿改" : "玩家核心設定·擴寫成四短句·勿改本意"})】：${pb.pref}` : ""}${pb.fp ? `\n【自稱(玩家已定)】：${pb.fp}` : ""}${pb.speech ? `\n【口吻(玩家已定)】：${pb.speech}` : ""}${pb.moe ? `\n【萌點(玩家已定·照抄勿改)】：${pb.moe}` : ""}${pb.back ? `\n【身世(玩家已定·照抄勿改)】：${pb.back}` : ""}${pb.weapon ? `\n【武裝(以此為準·勿依職階/原典改寫)】：${pb.weapon}` : ""}${isMasterCls ? "" : `\n【技能】：${pb.skills.map(s => s.n).join("、") || "無"}\n【寶具】：${pb.npName}${pb.npDesc ? `（${pb.npDesc}）` : ""}`}`,
      `你是《命運停駐之夜》的英靈人格編織者。玩家已親手定好一名原創${isMasterCls ? "御主(鑑賞限定·不參與戰鬥)" : "從者"}的設定，你【只】負責補完演出側寫${isMasterCls ? "" : "與寶具英文真名"}，【嚴禁】輸出任何數值/階級/技能設定。玩家標「照抄勿改」的欄位原樣沿用；標「核心設定·擴寫」的欄位以玩家給的為靈魂擴寫、【嚴禁】偏離或覆蓋其本意。★輸出合法 JSON、禁 Markdown：{"personality":"日常表象、真實內裡、喜歡的事物、討厭的事物（四短句頓號分隔）","look":"外貌四短句頓號分隔（五官髮色/身形/衣著印象，最後一句必須是不含服裝字眼的純氣質詞）","background":"生平一句·限20字","npc_intent":"一句反差萌·限18字·務必寫完整一句話不可斷在句意未完處"${isMasterCls ? "" : `,"npEn":"寶具的英文真名讀法(拉丁字母·如 Excalibur 風格·限4個單字)"`}}`,
      { temperature: 0.85, ignoreLaw: true }));
  } catch (e) { flavor = null; }
  const fNpEn = String((flavor && flavor.npEn) || "").replace(/[^A-Za-z0-9 .'\-:]/g, "").trim().slice(0, 30);
  const np = isMasterCls ? "" : `${pb.npName}${fNpEn ? " " + fNpEn : ""}（${pb.npScale} ${pb.npR}）${pb.npDesc ? "·" + pb.npDesc : ""}`;
  const finalLook = pb.lookFull ? pb.look : (String((flavor && flavor.look) || "").trim() || pb.look);
  const finalPref = pb.prefFull ? pb.pref : (String((flavor && flavor.personality) || "").trim() || pb.pref);
  const moe = pb.moe || String((flavor && flavor.npc_intent) || "").slice(0, 30); // 比照 slice(0,18) 腰斬修正，放寬緩衝
  const back = pb.back || String((flavor && flavor.background) || "").slice(0, 28);
  try {
    recordOriginalHero_(pb.name, pb.cls, pb.sex, JSON.stringify(pb.six), pb.classSkills, pb.skills, [], np, finalPref || "", pb.align,
      { look: finalLook, moe: moe, firstP: pb.fp, toMaster: pb.toM, speech: pb.speech, tic: pb.tic, back: back, weapon: pb.weapon, creator: acct });
  } catch (e) { return JSON.stringify({ success: false, message: "寫入英靈殿失敗：" + e.message }); }
  return JSON.stringify({ success: true, created: true, name: pb.name, message: `「${pb.name}」已鑄入英靈殿——到召喚頁「🌟 玩家原創英靈」即可召喚；之後想調整可在該區「✏️ 修改」（僅你本人）。` });
}

function actionSummonServant(userData, pcId, sheets) {
  const VALID_CLS = ["Saber", "Archer", "Lancer", "Rider", "Caster", "Assassin", "Berserker"];
  const reqCls = VALID_CLS.includes(userData.cls) ? userData.cls : "";
  const heroId = String(userData.heroId || "").trim();
  const trueName = String(userData.trueName || "").trim().slice(0, 20);
  const custDesc = String(userData.desc || "").trim().slice(0, 120); // 自訂描述生成原創從者

  const pcData = sheets.pc.getDataRange().getValues();
  const masterRow = pcData.find(r => r[COL.PC.ID] == pcId);
  if (!masterRow) return JSON.stringify({ success: false, message: "找不到御主，請重新登入。" });
  const pcName = masterRow[COL.PC.NAME];
  const pcLoc = masterRow[COL.PC.LOC] || "冬木·新都";
  const gameId = String(masterRow[COL.PC.GAME_ID] || "");

  const already = pcData.find(r =>
    String(r[COL.PC.FACTION]) === "從者" &&
    String(r[COL.PC.GAME_ID] || "") === gameId &&
    !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (already) return JSON.stringify({ success: false, message: `你已締約從者「${already[COL.PC.NAME]}」，無法再召喚。` });

  // 戰役資訊（正史可自由奪取正典從者，被奪的那組會從對手名單移除）
  const warName = getWarName_(masterRow[COL.PC.MEMORY]);
  const playedMaster = getPlayedMaster_(masterRow[COL.PC.MEMORY]);

  // ── 從英靈殿尋找對應英靈（heroId 指定 / 真名比對 / 隨機）──
  let hero = null;
  try {
    // 🛡️ 2026-07 修：英靈殿新增了「鑑賞限定」的正典御主(cls='御主'，如遠坂凜/伊莉雅絲菲爾)，
    //   只給鑑賞直接召喚用、沒有六圍/技能/寶具——若被 solo 召喚會產出殘缺從者。三條路徑
    //   (heroId 指定/真名比對/隨機)都共用這份 hrows，統一在源頭濾掉，不逐一補檢查。
    const hrows = getHeroCodexCached().slice(1).filter(r => r[COL.HERO.ID] && String(r[COL.HERO.CLS]) !== "御主");
    if (hrows.length) {
      if (heroId) {
        hero = hrows.find(r => String(r[COL.HERO.ID]) === heroId);
      } else if (trueName) {
        hero = hrows.find(r => String(r[COL.HERO.NAME]).includes(trueName) || trueName.includes(String(r[COL.HERO.NAME])));
      } else {
        // 🎲 隨機召喚：全英靈殿(含玩家原創 ai_gen)均勻抽(2026-07 玩家定案「原創角色可以進去 確實隨機就好」)
        let pool = reqCls ? hrows.filter(r => r[COL.HERO.CLS] === reqCls) : hrows;
        if (pool.length) hero = pool[Math.floor(Math.random() * pool.length)];
      }
    }
  } catch (e) { hero = null; }
  if (custDesc) hero = null; // 自訂描述 → 強制走 AI 生成原創，不抓名冊
  // 🛠️ 工房(2026-07 玩家定案二版)：工房＝純「製造/修改」寫英靈殿(save_hero)，不再直接召喚——
  //   做好的原創英靈到召喚頁「🌟 玩家原創」專區點選召喚(走下方 hero 分支實體化)。

  const newId = "NPC_" + Date.now();
  const pcColCount = Object.keys(COL.PC).length;
  const row = Array(pcColCount).fill("");
  let realName, cls, align, np, sex;

  try {
    if (hero) {
      // ✅ 從英靈殿實體化：用真實六圍/技能/寶具/人格
      cls = hero[COL.HERO.CLS];
      realName = hero[COL.HERO.NAME];
      sex = (hero[COL.HERO.SEX] === "無" ? "異" : (hero[COL.HERO.SEX] || "異"));
      align = hero[COL.HERO.ALIGN] || "中立";
      np = hero[COL.HERO.NP] || "寶具（未顯現）";
      const six = JSON.parse(hero[COL.HERO.SIX] || "{}");
      const classSkills = JSON.parse(hero[COL.HERO.CLASS_SKILLS] || "[]");
      const skills = JSON.parse(hero[COL.HERO.SKILLS] || "[]");
      const traits = JSON.parse(hero[COL.HERO.TRAITS] || "[]");
      const persona = JSON.parse(hero[COL.HERO.PERSONA] || "{}");

      // 從者血厚：耐久越高越肉。🔋 出力電池制：從者無自有魔力池(MP欄置0)，靠御主供魔；出力檔存 MEMORY、預設 60 巡航。
      const svHp = 150 + svNum_(six.耐久) * 6, svMp = 0;

      // 🎴 五圍已棄欄：戰鬥吃六圍 SIX，不再寫數值。
      row[COL.PC.HP] = svHp; row[COL.PC.MP] = svMp; row[COL.PC.MAX_HP] = svHp; row[COL.PC.MAX_MP] = svMp;
      // 🎴 特徵(4格敘事：外貌/氣質/自稱與口氣/私密)直接讀寫死的種子 persona.look，穩定一致、不叫 AI 生。
      // 🐛→✅ 2026-07 修「衣服寫到舉止了」：persona.look 是「N段外貌(含服裝)・・...、氣質詞」，
      //   不是天然四格，改用 looksToTraitParts_ 正確切分＋帶入真正的 persona.firstP 當自稱。
      row[COL.PC.TRAIT] = parseTraitsHelper(looksToTraitParts_(persona.look, persona.firstP), "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面");
      // 🚀 種子英靈：直接用寫死的種子 persona（萌點/口吻 v3 已補齊），大部分欄位不叫 AI 重生——
      //    省下多數欄位的 API、加速召喚(僅[喜歡]/[討厭]段數不足時才補呼叫一次，見下)。
      //    個性取 persona.words(四關鍵)、萌點取 persona.moe、生平用種子既有 back 或職階真名模板。
      //    口吻/小動作(persona.speech/tic)已由 stampPersonaFlavor_ 複製進 MEMORY，servantCard_ 平常直接讀列即可，不必查英靈殿。
      let svPref = String(persona.words || "").replace(/・/g, "、");
      let svMoe = String(persona.moe || "").slice(0, 18);
      let svBack = persona.back ? String(persona.back).slice(0, 28) : `${cls}・${realName}`;
      // 🤖 2026-07：種子 persona.words 幾乎只有2段(見 enrichPersonalityLikesDislikes_ 註解)，
      //   parseTraitsHelper 補滿4格時[喜歡]/[討厭]恆為「無」——這裡召喚當下補一次AI，讓從者也有
      //   真正的喜好/討厭可用，不只是玩家自己建角才有。已經4段(罕見)則直接跳過、不多打API。
      svPref = enrichPersonalityLikesDislikes_(realName, cls, svPref);
      row[COL.PC.PREF] = parseTraitsHelper(svPref, "沉著表象、堅定內裡、珍視之物、厭惡之事");
      row[COL.PC.MEMORY] = stampPersonaFlavor_(`第一人稱「${persona.firstP || "我"}」｜對御主：${persona.toMaster || "保持距離"}`, persona.speech, persona.tic);
      if (persona.weapon) row[COL.PC.MEMORY] = setWeapon_(row[COL.PC.MEMORY], persona.weapon); // ⚔️ 工房原創的自定武裝·重召不掉
      row[COL.PC.SIX] = JSON.stringify(six);
      row[COL.PC.TAGS] = JSON.stringify({ skills: classSkills.concat(skills), traits: traits });
      // 🕯️ 復活命數：god_hand 持有者的起始命數——優先讀該技能物件自己的 lives 屬性(如尼祿 lives:3)，
      //   種子沒標 lives 時(如赫拉克勒斯)才照舊規則：ai_gen 給3(尼祿「三度輝映」基準)，其餘無標記、
      //   靠 getGodHandLives_ 預設11(赫拉克勒斯十二試煉專屬)，別讓 AI 產物白拿。
      var ghSkill = classSkills.concat(skills).find(function (s) { return s && s.fx === 'god_hand'; });
      if (ghSkill) {
        var ghLives = (ghSkill.lives != null) ? ghSkill.lives : (String(hero[COL.HERO.SOURCE]) === 'ai_gen' ? 3 : null);
        if (ghLives != null) row[COL.PC.MEMORY] += '｜【試煉】' + ghLives;
      }
      row[COL.PC.INTENT] = svMoe;
      row[COL.PC.BACK] = svBack;
    } else {
      // 🌀 名冊查無 → AI 即時生成「第一級從者」：含真實六圍階級＋帶 fx 的技能（吃得到標籤）
      cls = reqCls || "Saber";
      const sysOverride = `你是《命運停駐之夜》的英靈召喚核心。玩家御主召喚出一名「從者（Servant）」，職階為「${cls}」。${custDesc ? `這是玩家【自訂描述的原創英靈】，請依描述創作一位全新原創從者（可自取貼切真名），忠於描述的形象與氣質。` : (trueName ? `指定真名為「${trueName}」，請忠於該英靈的傳說與性格（可跨作品：動漫／遊戲／神話／歷史皆可）。` : "請挑選一位契合此職階、知名的歷史或傳說英靈。")}

★【六圍 six】依該英靈強弱給「筋力/耐久/敏捷/魔力/幸運/寶具」各一個階級，階級用 E,D,C,B,A,EX（強處可加 + 如 A+）；務必有強有弱、貼合傳說。若為 Berserker 或持狂化(mad)者，六圍請直接填【狂化後】的數值（與官方參數表慣例一致；狂化的傷害加成與命中懲罰由系統另計，勿再自行灌水）。
★【技能帶 fx】classSkills(職階技能 1~2 個)＋skills(固有技能 2~3 個)，每個含 {"n":"技能名","r":"階級","fx":"效果碼"}。職階技能貼合職階慣例：Saber/Lancer/Archer＝對魔力(Archer 另有單獨行動)、Rider＝對魔力＋騎乘、Caster＝陣地作成＋道具作成、Assassin＝氣息遮斷、Berserker＝狂化(mad)。
${FX_MENU_}
★【特性 traits】1~3 個，{"n":"特性名"}（如 王/龍/人類/神性/巨人/猛獸；有神性者會被神殺剋）。
★【演出而非說明】personality 與寶具只作底層，勿直接複述字面。personality 剛好 4 短句頓號分隔：日常表象、真實內裡、喜歡的事物、討厭的事物。
★np：寶具名＋一句威能簡述；規模上限【對軍】——對城/對界/對神為種子英靈專屬，寫了也會被系統降為對軍，簡述請勿誇稱斬城滅界。★npc_intent：一句【簡短】反差萌（≤18字，系統會在30字處硬性截斷、務必精簡，務必寫完整一句話不可斷在句意未完處）。【禁】誤用令咒當裝飾性萌點元素——令咒是御主持有、對從者下達絕對命令的機制道具，並非從者自己所有或隨手就能用的萬用法寶；也不要單純重複寶具名稱湊字數，請改用生活化情境(手作/習慣/小癖好等)。★sex 從 男／女／異 擇一。

★【輸出】合法 JSON、禁 Markdown：
{"realName":"英靈真名","sex":"女","align":"中立・善","background":"限20字","npc_intent":"反差萌一句","personality":"四格頓號","np":"寶具名（簡述）","six":{"筋力":"B","耐久":"C","敏捷":"A","魔力":"D","幸運":"C","寶具":"B"},"classSkills":[{"n":"對魔力","r":"B","fx":"nullify_magic"}],"skills":[{"n":"直感","r":"A","fx":"first_strike"},{"n":"怪力","r":"B","fx":"str_up"}],"traits":[{"n":"人類"}]}`;
      const aiBrief = JSON.parse(callGeminiAPI(`【職階】：${cls}\n【御主】：${pcName}${trueName ? `\n【指定真名】：${trueName}` : ""}${custDesc ? `\n【玩家自訂描述】：${custDesc}` : ""}`, sysOverride, { temperature: custDesc ? 0.85 : 0.6, ignoreLaw: true }));
      // 🛡️ API 失敗防線(2026-07 修)：callGeminiAPI 連線失敗不丟例外、而是回「fallback 敘事 JSON」(narration/options)
      //   ——照收會靜默生出全C六圍/零技能的殘缺從者、寫入眾生＋recordOriginalHero_ 永久污染英靈殿，
      //   且 already 閘讓該局無法重召。缺 realName 或 six ＝ 生成失敗，中止讓玩家重試。
      if (!aiBrief || !aiBrief.realName || !aiBrief.six) {
        return JSON.stringify({ success: false, message: "英靈之座的迴響中斷——召喚失敗，請稍候再試一次。" });
      }
      realName = String(aiBrief.realName || trueName || (cls + "從者")).trim() || (cls + "從者");
      sex = aiBrief.sex || "異"; align = aiBrief.align || "中立"; np = aiBrief.np || "寶具（未顯現）";
      // ⚖️ 寶具規模上限(2026-07 修)：npAtkScale_ 讀 np 字串關鍵字算規模——AI 自訂寶具最高「對軍」，
      //   對城/對界/對神為種子專屬(與 ALLOWED_FX_ 排除頂級概念 fx 同一精神，堵字串後門)。
      //   同精神再堵一手：【常駐寶具】標記為種子專屬(B叔/玉藻)——AI/玩家自訂描述若混入這五個字，
      //   生出的從者自己的💥會被鎖死(前端灰化＋後端擋攻擊解放)，故一律剝除。
      np = String(np).replace(/對界|對城|對神/g, "對軍").replace(/【常駐寶具】/g, "").slice(0, 80);
      const aiSix = sanitizeSix_(aiBrief.six);
      const aiCSkills = sanitizeSkills_(aiBrief.classSkills, 2); // prompt 要求 1~2 個
      const aiSkills = sanitizeSkills_(aiBrief.skills, 3);       // prompt 要求 2~3 個
      const aiTraits = Array.isArray(aiBrief.traits) ? aiBrief.traits.filter(Boolean).slice(0, 4).map(t => ({ n: String((t && (t.n || t.名稱 || t.name)) || t).slice(0, 8) })) : [];
      const svHp = 150 + svNum_(aiSix.耐久) * 6, svMp = 0; // 🔋 出力電池制：從者無自有魔力池，出力檔存 MEMORY、預設 60 巡航
      // 🎴 五圍已棄欄：戰鬥吃六圍 SIX，不再寫數值。
      row[COL.PC.HP] = svHp; row[COL.PC.MP] = svMp; row[COL.PC.MAX_HP] = svHp; row[COL.PC.MAX_MP] = svMp;
      // 🎴 AI 即時生成的原創從者：特徵走通用敘事預設(不再用戰鬥特性污染敘事欄)，玩家可逆天改命微調。
      row[COL.PC.TRAIT] = parseTraitsHelper("", "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面");
      row[COL.PC.PREF] = parseTraitsHelper(aiBrief.personality, "沉著表象、堅定內裡、珍視之物、厭惡之事");
      row[COL.PC.INTENT] = String(aiBrief.npc_intent || "").slice(0, 30); // 比照 slice(0,18) 腰斬修正，放寬緩衝
      row[COL.PC.MEMORY] = `第一人稱「我」｜對御主：初締約·尚在觀察`; // 與種子路徑對稱(原漏寫→servantCard_ 演出資訊變薄)
      row[COL.PC.SIX] = JSON.stringify(aiSix);
      row[COL.PC.TAGS] = JSON.stringify({ skills: aiCSkills.concat(aiSkills), traits: aiTraits });
      // 🕯️ 復活命數：AI 產物持 god_hand → 標【試煉】3(尼祿「三度輝映」基準)——預設 11 是赫拉克勒斯(seed)專屬。
      if (aiCSkills.concat(aiSkills).some(function (s) { return s && s.fx === 'god_hand'; })) {
        row[COL.PC.MEMORY] += '｜【試煉】3';
      }
      row[COL.PC.BACK] = aiBrief.background ? String(aiBrief.background).slice(0, 40) : `${cls} 職階的英靈`; // 補防呆上限，比照其他AI生成路徑
      // 🆕 不重名的原創從者 → 寫回英靈殿（含六圍/技能fx/特性），日後可重用（御主不收）
      // 🐛→✅ 2026-07 修：pExtra 原本沒帶 moe——這名從者當下的 row[COL.PC.INTENT] 確實有拿到
      //   aiBrief.npc_intent(見上)，但英靈殿的永久記錄(persona.moe)一直是空字串，導致這名從者
      //   若日後被邀進鑑賞，heroToKanshouRow_/translateMoeToDaily_ 拿到的是空白、無從轉出日常萌點。
      try { recordOriginalHero_(realName, cls, sex, row[COL.PC.SIX], aiCSkills, aiSkills, aiTraits, np, aiBrief.personality, align, { moe: String(aiBrief.npc_intent || "").slice(0, 30), creator: String(userData.acctName || "").trim() }); } catch (e) { }
    }

    row[COL.PC.ID] = newId;
    row[COL.PC.NAME] = realName;
    row[COL.PC.SEX] = sex;
    row[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "氣息平穩" });
    row[COL.PC.LOC] = pcLoc;
    row[COL.PC.FACTION] = "從者"; row[COL.PC.RANK] = cls;
    row[COL.PC.CONTRIB] = 0; row[COL.PC.ALIGN] = align;
    row[COL.PC.MARTIAL] = np;
    row[COL.PC.GAME_ID] = gameId;
    row[COL.PC.BOND] = 35; row[COL.PC.REL_TAG] = "從者"; row[COL.PC.IS_PARTY] = "同行";
    sheets.pc.appendRow(row);

    // 🔋 共用魔力池：把新從者魔力併入御主池上限(迴路×10 + 魔力×2)，締約＝魔力暢通故補到滿池
    try {
      var _circ = masterCircuits_(masterRow);
      var _svMag = 0; try { _svMag = rankVal(JSON.parse(row[COL.PC.SIX] || '{}')['魔力'] || 'E'); } catch (e) { }
      var _newMax = masterPoolMax_(_circ, _svMag);
      var _mIdx = pcData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
      if (_mIdx >= 0) {
        masterRow[COL.PC.MAX_MP] = _newMax; masterRow[COL.PC.MP] = _newMax;
        // 🚀 只寫 MP/MAX_MP 兩格(非整列)：與開局非阻塞 backfill_master_ai 的敘事欄單格寫互不覆蓋(無競寫)。
        sheets.pc.getRange(_mIdx + 1, COL.PC.MP + 1).setValue(_newMax);
        sheets.pc.getRange(_mIdx + 1, COL.PC.MAX_MP + 1).setValue(_newMax);
      }
    } catch (e) { }

    // 🔵 召喚完成 → 鋪敵方御主×從者進這個 game_id 世界（一次性）
    try { seedRivalsForGame_(gameId, realName, warName, playedMaster); } catch (e) { }

    // 🎬 召喚登場場景（精簡敘事用，含角色卡；前端純按鈕模式直接 narrate，不走 options 那套）
    const summonPrompt = servantCard_(row) +
      `【召喚登場】御主『${pcName}』剛以令咒召喚出從者「${realName}」（${cls}），兩人初次同處於冬木的夜。\n` +
      `★以 Fate／TYPE-MOON 筆觸描寫所在地的燈火與氛圍，聚焦御主與從者最初的試探、對話與張力（依上方角色背景內化演出，禁止複述設定字面、禁止用外貌代替名字）。場景留下懸念、讓玩家想以行動回應。\n` +
      `★禁止替御主做決定、禁止詢問玩家想做什麼、禁止介紹玩家自身身份、禁止新增任何地圖或NPC。`;
    return JSON.stringify({ success: true, servantName: realName, cls: cls, fromCodex: !!hero, summonPrompt: summonPrompt, message: `【聖杯】令咒迸發，${cls} 職階的從者「${realName}」應召而現，與『${pcName}』締結契約。其餘御主已在冬木各處備戰。` });
  } catch (e) {
    return JSON.stringify({ success: false, message: "召喚失敗：" + e.message });
  }
}

// ==========================================
// 🔵 御主／從者 標籤資料（左側狀態卡用）：只給動作姿勢/令咒/羈絆/寶具，不給六維
// ==========================================
