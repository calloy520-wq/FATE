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

  // 🔴 創角寫入前再次擋撞名，否則會產生兩個同名 PC，後續所有靠姓名查找的功能都會抓錯人。
  const pcRows = sheets.pc.getDataRange().getValues();
  if (pcRows.find(r => r[COL.PC.NAME] === finalName && !String(r[COL.PC.ID]).startsWith("DEAD_"))) return JSON.stringify({ success: false, message: "此名號已有魔術師使用，請換一個名號。" });
  if (sheets.auth) { try { sheets.auth.appendRow([finalName, newId, "御主", "", ""]); } catch (e) { } }

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
      userData.warMode === 'chaos' ? "" : `【戰爭】${['4th', '5th', 'fake'].indexOf(String(userData.war)) >= 0 ? userData.war : '5th'}`,
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
    newRow[COL.PC.REALM] = "";  // 🎴 階級系統已移除，欄位留空
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
★npc_intent：一句【簡短】萌點（可愛反差，≤15字），結合此御主身分性格，要反差、可愛、獨特。
★background：限20字，呼應其身世／財力，禁出現具體物品名。
★【勿輸出數值】戰力數值、HP/MP 一律由系統裁定，prompt【不要】輸出任何數值欄位；也不要輸出地點。

★【輸出】合法 JSON、禁 Markdown：
{"background":"限20字","traits":"四格頓號字串","personality":"四格頓號字串","npc_intent":"結合御主身分的獨特可愛反差萌，一句話"}`;

  try {
    // 🔴 ignoreLaw: true，把節慶跟天氣隔絕在創建室外
    const aiBrief = JSON.parse(callGeminiAPI(promptStr, MASTER_GEN_SYS, { temperature: 0.6, ignoreLaw: true }));
    // 單格寫回(不整列)：只覆蓋敘事欄，且僅在 AI 有給值時；數值/MEMORY/位置一律不碰。
    if (aiBrief.background) sheets.pc.getRange(pIdx + 1, COL.PC.BACK + 1).setValue(String(aiBrief.background).slice(0, 40));
    if (aiBrief.traits) sheets.pc.getRange(pIdx + 1, COL.PC.TRAIT + 1).setValue(parseTraitsHelper(aiBrief.traits, row[COL.PC.TRAIT]));
    if (aiBrief.personality) sheets.pc.getRange(pIdx + 1, COL.PC.PREF + 1).setValue(parseTraitsHelper(aiBrief.personality, row[COL.PC.PREF]));
    if (aiBrief.npc_intent) sheets.pc.getRange(pIdx + 1, COL.PC.INTENT + 1).setValue(String(aiBrief.npc_intent).slice(0, 18));
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
  var m = String(memory || "").match(/【戰爭】(4th|5th|fake)/);
  return m ? m[1] : "5th";
}
// 玩家扮演的正典御主 id（自創則空）
function getPlayedMaster_(memory) {
  var m = String(memory || "").match(/【扮演】([^｜|【]+)/);  // ★須排除全形分隔符 ｜(U+FF5C)，否則尾巴吃進下個標籤致比對失敗(自我分身敵)
  return m ? m[1].trim() : "";
}

function actionGetHeroes(userData, pcId, sheets) {
  try {
    const hs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("英靈殿");
    if (!hs || hs.getLastRow() <= 1) return JSON.stringify({ success: true, heroes: [] });
    const rows = hs.getDataRange().getValues().slice(1);
    const heroes = rows.filter(r => r[COL.HERO.ID]).map(r => ({
      id: r[COL.HERO.ID], cls: r[COL.HERO.CLS], name: r[COL.HERO.NAME],
      gender: r[COL.HERO.SEX], np: r[COL.HERO.NP]
    }));
    return JSON.stringify({ success: true, heroes: heroes });
  } catch (e) {
    return JSON.stringify({ success: false, heroes: [], message: e.message });
  }
}

// 取某場戰爭的正典御主清單（供「扮演正典御主」帶入預設）
function actionGetMasters(userData, pcId, sheets) {
  const war = String(userData.war || "5th");
  const roster = (war === '4th') ? FATE_4TH_ROSTER : FATE_5TH_ROSTER;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const msh = ss.getSheetByName("御主殿");
  if (!msh) return JSON.stringify({ success: true, masters: [] });
  const mrows = msh.getDataRange().getValues();
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
  evade_ranged: 1, survive: 1, divine_core: 1, mad: 1, morale: 1, divine_age: 1,
  unreadable: 1, wind_strike: 1, tsubame: 1, gae_bolg: 1, god_hand: 1,
  clear_mind: 1, self_mod: 1, tactics: 1, anti_magic_lance: 1, rule_breaker: 1,
  // 🆕 2026-07 放寬(A)：施放技術/命中/防禦/對人放大——中階以下，拉高自訂從者上限、不含頂級概念寶具
  aim: 1, projection: 1, fast_cast: 1, crafting: 1, petrify: 1, shapeshift: 1,
  solo: 1, weapon_steal: 1, rho_aias: 1, territory: 1, wall_def: 1, zabaniya: 1, regen: 1
};
var FX_MENU_ = "【可用技能效果碼 fx】挑契合此英靈的，沒對應就填空字串\"\"（頂級概念寶具 乖離劍/王之財寶/無限劍製 等為種子專屬、不在此清單）：" +
  "對魔力=nullify_magic、直感=first_strike、心眼=analyze、千里眼=aim、怪力=str_up、魔力放出=burst、投影魔術=projection、" +
  "高速詠唱=fast_cast、道具作成=crafting、騎乘=ride、氣息遮斷=stealth、變化(迴避+)=shapeshift、避矢=evade_ranged、" +
  "戰鬥續行=survive、單獨行動=solo、神核=divine_core、七天盾(投影減傷)=rho_aias、陣地作成(減傷)=territory、城牆防禦(物理減傷)=wall_def、" +
  "狂化=mad、勇猛/卡里斯瑪=morale、神代魔術=divine_age、無欲(封先機)=unreadable、透化(免威壓)=clear_mind、" +
  "自我改造(命中傷害+)=self_mod、軍略(寶具+)=tactics、風王鐵鎚(傷+)=wind_strike、魔眼(石化)=petrify、必中槍=gae_bolg、" +
  "秘劍燕返(寶具強化)=tsubame、妄想心音(暗殺致命)=zabaniya、無毀湖光(對龍+)=weapon_steal、治癒(每回合回血)=regen、不死復活=god_hand、" +
  "破魔(無視神核/續行)=anti_magic_lance、破戒(斬契約救贖)=rule_breaker";

// 清洗 AI 給的技能陣列為 [{n,r,fx}]（fx 不在字典就清空，仍保留為演出用標籤）
function sanitizeSkills_(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(Boolean).slice(0, 5).map(function (s) {
    var fx = String((s && (s.fx || s.效果碼)) || "").trim();
    return {
      n: String((s && (s.n || s.名稱 || s.name)) || "技能").slice(0, 10),
      r: String((s && (s.r || s.階級 || s.rank)) || "C").slice(0, 2).toUpperCase(),
      fx: ALLOWED_FX_[fx] ? fx : ""
    };
  });
}
// 清洗六圍：6 鍵齊全、階級合法（E~EX、可帶 +/++/−）；缺或亂給則補 C。
//   2026-07 放寬：承認 A++/B−——AI 泡在 Fate 語料很常自發吐 A++，原 regex 只認單 + 會把名將靜默打成 C。
function sanitizeSix_(o) {
  var keys = ["筋力", "耐久", "敏捷", "魔力", "幸運", "寶具"], out = {};
  var ok = function (v) { return /^(E|D|C|B|A|EX)(\+{1,2}|\-)?$/.test(String(v || "").toUpperCase()); };
  keys.forEach(function (k) { var v = o && o[k] ? String(o[k]).toUpperCase().trim() : "C"; out[k] = ok(v) ? v : "C"; });
  return out;
}

// 🆕 把 AI 生成的原創從者寫回英靈殿（重名則不收；御主不適用此機制）
function recordOriginalHero_(name, cls, sex, sixJson, classSkills, skills, traits, np, personaWords, align) {
  name = String(name || "").trim();
  if (!name) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hs = ss.getSheetByName("英靈殿");
  if (!hs) return;
  var data = hs.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.HERO.NAME]).trim() === name) return; // 已有同名 → 不重複收錄
  }
  var persona = JSON.stringify({ words: String(personaWords || ""), firstP: "我", toMaster: "" });
  hs.appendRow([name + "-" + cls, cls, name, sex || "異", sixJson || "{}",
    JSON.stringify(classSkills || []), JSON.stringify(skills || []), JSON.stringify(traits || []),
    np || "", persona, align || "中立", "[]", "ai_gen"]);
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
    const hs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("英靈殿");
    if (hs && hs.getLastRow() > 1) {
      const hrows = hs.getDataRange().getValues().slice(1).filter(r => r[COL.HERO.ID]);
      if (heroId) {
        hero = hrows.find(r => String(r[COL.HERO.ID]) === heroId);
      } else if (trueName) {
        hero = hrows.find(r => String(r[COL.HERO.NAME]).includes(trueName) || trueName.includes(String(r[COL.HERO.NAME])));
      } else {
        let pool = reqCls ? hrows.filter(r => r[COL.HERO.CLS] === reqCls) : hrows;
        if (pool.length) hero = pool[Math.floor(Math.random() * pool.length)];
      }
    }
  } catch (e) { hero = null; }
  if (custDesc) hero = null; // 自訂描述 → 強制走 AI 生成原創，不抓名冊

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
      row[COL.PC.REALM] = "";
      // 🎴 特徵(4格敘事：外貌/氣質/自稱與口氣/私密)直接讀寫死的種子 persona.look，穩定一致、不叫 AI 生。
      row[COL.PC.TRAIT] = parseTraitsHelper(String(persona.look || ""), "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面");
      // 🚀 種子英靈：直接用寫死的種子 persona（萌點/口吻 v3 已補齊），不再叫 AI 重生一次——省一次 API、加速召喚。
      //    個性取 persona.words(四關鍵)、萌點取 persona.moe、生平用種子既有 back 或職階真名模板。細緻演出靠 servantCard_(codexPersona_) 注入。
      let svPref = String(persona.words || "").replace(/・/g, "、");
      let svMoe = String(persona.moe || "").slice(0, 18);
      let svBack = persona.back ? String(persona.back).slice(0, 28) : `${cls}・${realName}`;
      row[COL.PC.PREF] = parseTraitsHelper(svPref, "沉著表象、堅定內裡、珍視之物、厭惡之事");
      row[COL.PC.MEMORY] = `第一人稱「${persona.firstP || "我"}」｜對御主：${persona.toMaster || "保持距離"}`;
      row[COL.PC.SIX] = JSON.stringify(six);
      row[COL.PC.TAGS] = JSON.stringify({ skills: classSkills.concat(skills), traits: traits });
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
★np：寶具名＋一句威能簡述。★npc_intent：一句【簡短】反差萌（≤15字）。★sex 從 男／女／異 擇一。

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
      np = String(np).replace(/對界|對城|對神/g, "對軍").slice(0, 80);
      const aiSix = sanitizeSix_(aiBrief.six);
      const aiCSkills = sanitizeSkills_(aiBrief.classSkills);
      const aiSkills = sanitizeSkills_(aiBrief.skills);
      const aiTraits = Array.isArray(aiBrief.traits) ? aiBrief.traits.filter(Boolean).slice(0, 4).map(t => ({ n: String((t && (t.n || t.名稱 || t.name)) || t).slice(0, 8) })) : [];
      const svHp = 150 + svNum_(aiSix.耐久) * 6, svMp = 0; // 🔋 出力電池制：從者無自有魔力池，出力檔存 MEMORY、預設 60 巡航
      // 🎴 五圍已棄欄：戰鬥吃六圍 SIX，不再寫數值。
      row[COL.PC.HP] = svHp; row[COL.PC.MP] = svMp; row[COL.PC.MAX_HP] = svHp; row[COL.PC.MAX_MP] = svMp;
      row[COL.PC.REALM] = "";
      // 🎴 AI 即時生成的原創從者：特徵走通用敘事預設(不再用戰鬥特性污染敘事欄)，玩家可逆天改命微調。
      row[COL.PC.TRAIT] = parseTraitsHelper("", "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面");
      row[COL.PC.PREF] = parseTraitsHelper(aiBrief.personality, "沉著表象、堅定內裡、珍視之物、厭惡之事");
      row[COL.PC.INTENT] = String(aiBrief.npc_intent || "").slice(0, 18);
      row[COL.PC.MEMORY] = `第一人稱「我」｜對御主：初締約·尚在觀察`; // 與種子路徑對稱(原漏寫→servantCard_ 演出資訊變薄)
      row[COL.PC.SIX] = JSON.stringify(aiSix);
      row[COL.PC.TAGS] = JSON.stringify({ skills: aiCSkills.concat(aiSkills), traits: aiTraits });
      row[COL.PC.BACK] = aiBrief.background || `${cls} 職階的英靈`;
      // 🆕 不重名的原創從者 → 寫回英靈殿（含六圍/技能fx/特性），日後可重用（御主不收）
      try { recordOriginalHero_(realName, cls, sex, row[COL.PC.SIX], aiCSkills, aiSkills, aiTraits, np, aiBrief.personality, align); } catch (e) { }
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
    sheets.pc.appendRow(row);

    // 🔋 共用魔力池：把新從者魔力併入御主池上限(迴路×6 + 魔力×2)，締約＝魔力暢通故補到滿池
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

    if (sheets.rel) {
      try { sheets.rel.appendRow([pcName, realName, 35, "從者", "同行", "", ""]); } catch (e) { }
    }

    // 🔵 召喚完成 → 鋪敵方御主×從者進這個 game_id 世界（一次性）
    try { seedRivalsForGame_(gameId, realName, warName, playedMaster); } catch (e) { }
    // 📖 戰記開卷：開戰＋召喚
    try { logWarEvent_(gameId, `⚔️ 冬木的聖杯戰爭開幕——御主『${pcName}』以令咒召喚出 ${cls} 職階的從者「${realName}」，締結契約。`, userData.acctName); } catch (e) { }

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
