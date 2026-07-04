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
    // 🔒 競態修(2026-07)：backfill 豁免寫入鎖，pIdx 是 AI 呼叫【前】的列索引——期間清殘列若刪列，
    //   索引位移會把御主敘事寫到別列。寫回前 ID 欄窄讀重定位；列已被刪→放棄寫入。
    const wIdx = buildLiveIdIndex_(sheets.pc)[String(pcId)];
    if (wIdx === undefined) return JSON.stringify({ success: false, message: "御主列已不存在（可能剛被清理）。" });
    // 單格寫回(不整列)：只覆蓋敘事欄，且僅在 AI 有給值時；數值/MEMORY/位置一律不碰。
    if (aiBrief.background) sheets.pc.getRange(wIdx + 1, COL.PC.BACK + 1).setValue(String(aiBrief.background).slice(0, 40));
    if (aiBrief.traits) sheets.pc.getRange(wIdx + 1, COL.PC.TRAIT + 1).setValue(parseTraitsHelper(aiBrief.traits, row[COL.PC.TRAIT]));
    if (aiBrief.personality) sheets.pc.getRange(wIdx + 1, COL.PC.PREF + 1).setValue(parseTraitsHelper(aiBrief.personality, row[COL.PC.PREF]));
    if (aiBrief.npc_intent) sheets.pc.getRange(wIdx + 1, COL.PC.INTENT + 1).setValue(String(aiBrief.npc_intent).slice(0, 18));
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
    const rows = getHeroCodexCached().slice(1);
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
  evade_ranged: 1, survive: 1, divine_core: 1, mad: 1, morale: 1, divine_age: 1,
  unreadable: 1, wind_strike: 1, tsubame: 1, gae_bolg: 1, god_hand: 1,
  clear_mind: 1, self_mod: 1, tactics: 1, anti_magic_lance: 1, rule_breaker: 1,
  // 🆕 2026-07 放寬(A)：施放技術/命中/防禦/對人放大——中階以下，拉高自訂從者上限、不含頂級概念寶具
  aim: 1, projection: 1, fast_cast: 1, crafting: 1, petrify: 1, shapeshift: 1,
  solo: 1, weapon_steal: 1, rho_aias: 1, territory: 1, wall_def: 1, zabaniya: 1, regen: 1,
  divine: 1 // 🆕 2026-07：神性(帶階級·比 trait 名判定精準)——引擎中主要是弱點(被神殺/天之鎖/對神剋)，濫用價值低
};
var FX_MENU_ = "【可用技能效果碼 fx】挑契合此英靈的，沒對應就填空字串\"\"（頂級概念寶具 乖離劍/王之財寶/無限劍製 等為種子專屬、不在此清單）：" +
  "對魔力=nullify_magic、直感=first_strike、心眼=analyze、千里眼=aim、怪力=str_up、魔力放出=burst、投影魔術=projection、" +
  "高速詠唱=fast_cast、道具作成=crafting、騎乘=ride、氣息遮斷=stealth、變化(迴避+)=shapeshift、避矢=evade_ranged、" +
  "戰鬥續行=survive、單獨行動=solo、神核=divine_core、七天盾(投影減傷)=rho_aias、陣地作成(減傷)=territory、城牆防禦(物理減傷)=wall_def、" +
  "狂化=mad、勇猛/卡里斯瑪=morale、神代魔術=divine_age、無欲(封先機)=unreadable、透化(免威壓)=clear_mind、" +
  "自我改造(命中傷害+)=self_mod、軍略(寶具+)=tactics、風王鐵鎚(傷+)=wind_strike、魔眼(石化)=petrify、必中槍=gae_bolg、" +
  "秘劍燕返(普攻/寶具皆強化)=tsubame、妄想心音(暗殺致命)=zabaniya、無毀湖光(對龍+)=weapon_steal、治癒(每回合回血)=regen、不死復活(復活3次·如尼祿三度輝映)=god_hand、" +
  "破魔(無視神核/續行)=anti_magic_lance、破戒(斬契約救贖)=rule_breaker、神性(神裔·會被神殺剋)=divine";

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
  hs.appendRow([name + "-" + cls, cls, name, sex || "異", sixJson || "{}",
    JSON.stringify(classSkills || []), JSON.stringify(skills || []), JSON.stringify(traits || []),
    np || "", persona, align || "中立", "[]", "ai_gen"]);
  try { CacheService.getScriptCache().remove("FATE_HERO_CODEX"); } catch (e) { } // 種子表已變動→清快取，下次讀到新從者
}

function actionSummonServant(userData, pcId, sheets) {
  const VALID_CLS = ["Saber", "Archer", "Lancer", "Rider", "Caster", "Assassin", "Berserker"];
  const reqCls = VALID_CLS.includes(userData.cls) ? userData.cls : "";
  const heroId = String(userData.heroId || "").trim();
  const trueName = String(userData.trueName || "").trim().slice(0, 20);
  const custDesc = String(userData.desc || "").trim().slice(0, 120); // 自訂描述生成原創從者
  // 🛠️ 自訂英靈工房（2026-07 玩家定案）：玩家親手定 職階/六圍/技能/寶具，GAS 全程驗證、AI 只補演出 persona。
  //   規格：六圍預算 270（EX≤2 照舊）／技能 3 槽·階級上限 A·可改名但效果吃 fx 標籤／寶具名玩家自定·階級上限 A·規模上限 對軍。
  let build = null;
  if (userData.build) { try { build = (typeof userData.build === "string") ? JSON.parse(userData.build) : userData.build; } catch (e) { build = null; } }

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
    const hrows = getHeroCodexCached().slice(1).filter(r => r[COL.HERO.ID]);
    if (hrows.length) {
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
  if (build) hero = null;    // 🛠️ 工房自建 → 數值全由玩家定，不抓名冊

  const newId = "NPC_" + Date.now();
  const pcColCount = Object.keys(COL.PC).length;
  const row = Array(pcColCount).fill("");
  let realName, cls, align, np, sex;

  try {
    if (build) {
      // 🛠️ 自訂英靈工房：玩家親手定數值、後端全程驗證（不信任前端）、AI 只補演出 persona（失敗不擋召喚）。
      cls = VALID_CLS.includes(String(build.cls)) ? String(build.cls) : (reqCls || "Saber");
      realName = String(build.name || "").replace(/[<>&"'`]/g, "").trim().slice(0, 20);
      if (!realName) return JSON.stringify({ success: false, message: "請為英靈取一個真名。" });
      // 正典名保護：與種子同名 → 請直接真名召喚，別在工房蓋同名分身
      if ((typeof SEED_SERVANTS !== "undefined" && SEED_SERVANTS.some(s => s && s.name === realName)) ||
          (typeof SEED_MASTERS !== "undefined" && SEED_MASTERS.some(m => m && m.name === realName))) {
        return JSON.stringify({ success: false, message: `「${realName}」是英靈殿正典角色——請用「✨真名召喚」直接召喚，或另取原創真名。` });
      }
      sex = ["男", "女", "異"].includes(String(build.sex)) ? String(build.sex) : "異";
      // 🎭 演出細節(2026-07 三期·全選填·純演出零數值)：自稱/口吻/對御主態度/萌點/小動作/陣營/身世——
      //   玩家給了原樣用(接種子同款管線：MEMORY 第一人稱/對御主＋stampPersonaFlavor_ 口吻/小動作)，沒給照舊 AI 補。
      const _fClean = (v, n) => String(v || "").replace(/[｜【】\n\r\t]/g, "").trim().slice(0, n);
      const bFp = _fClean(build.fp, 4), bToM = _fClean(build.toMaster, 20), bSpeech = _fClean(build.speech, 40);
      const bTic = _fClean(build.tic, 30), bMoe = _fClean(build.moe, 18), bBack = _fClean(build.back, 28);
      const ALIGNS_ = ["秩序・善", "秩序・中庸", "秩序・惡", "中立・善", "中立", "中立・惡", "混沌・善", "混沌・中庸", "混沌・惡"];
      align = ALIGNS_.includes(String(build.align)) ? String(build.align) : "中立";
      // 六圍：工房只收 E/D/C/B/A/EX 純階（不給 +/−）；EX≤2 照舊；總分驗 270 預算
      const FORGE_BUDGET = 270;
      const okPlain = v => /^(E|D|C|B|A|EX)$/.test(String(v || "").toUpperCase());
      const fSix = {};
      ["筋力", "耐久", "敏捷", "魔力", "幸運", "寶具"].forEach(k => { const v = String((build.six || {})[k] || "C").toUpperCase(); fSix[k] = okPlain(v) ? v : "C"; });
      const fExK = Object.keys(fSix).filter(k => fSix[k] === "EX");
      if (fExK.length > 2) fExK.slice(2).forEach(k => fSix[k] = "A");
      const fSpent = Object.keys(fSix).reduce((s, k) => s + rankVal(fSix[k]), 0);
      // 🌟 寶具規模定價(2026-07 玩家定案)：對軍在 NP_SCALE_MATRIX 對絕大多數對局嚴格優於對人(×1.25)，
      //   免費＝人人必選對軍。改用同一份預算買：對人=0、對軍=+20 點。
      const fNpScale = (String(build.npScale) === "對軍") ? "對軍" : "對人";
      const fScaleCost = (fNpScale === "對軍") ? 20 : 0;
      // 技能 ≤3：fx 必在 ALLOWED_FX_（空＝純演出標籤）、階級上限 A、可改名（效果吃 fx）
      const fSkills = (Array.isArray(build.skills) ? build.skills : []).filter(Boolean).slice(0, 3).map(s => {
        const fx = ALLOWED_FX_[String(s && s.fx || "").trim()] ? String(s.fx).trim() : "";
        let r = String(s && s.r || "C").toUpperCase(); if (!/^(E|D|C|B|A)$/.test(r)) r = "C";
        return { n: String(s && s.n || "").replace(/[<>&"'`]/g, "").slice(0, 10) || "技能", r: r, fx: fx };
      });
      // ⚡ 技能階級定價(2026-07 玩家定案)：fx 效果隨階級放大(引擎 rankMul_)，白拿＝免費戰力。
      //   六圍半價 E5/D10/C15/B20/A25；純演出標籤(無 fx)免費。與六圍/規模同一份預算。
      const SKILL_PTS_ = { E: 5, D: 10, C: 15, B: 20, A: 25 };
      // 🔒 二元 fx 平價(引擎不讀其階級·E階白撿同 A 效果的洞)：復活3命/致命撐1/妄想心音/必中槍/破戒/破魔 → 25(A價)。
      //   燕返＝例外重價 60(EX價)：每次普攻勝手×2.3 常駐免費，battle_sim 實測單技能貢獻 +56 個百分點
      //   (86.2%→拔掉剩30.2%·頂級概念寶具等級)；必中槍/妄想心音為寶具簽名、basic 實測 ±0、維持25。
      const FLAT_FX_ = { god_hand: 25, survive: 25, tsubame: 60, zabaniya: 25, gae_bolg: 25, rule_breaker: 25, anti_magic_lance: 25 };
      const fSkillCost = fSkills.reduce((s, k) => s + (k.fx ? (FLAT_FX_[k.fx] || SKILL_PTS_[k.r] || 15) : 0), 0);
      const fTotal = fSpent + fScaleCost + fSkillCost;
      if (fTotal > FORGE_BUDGET) return JSON.stringify({ success: false, message: `六圍 ${fSpent}＋技能 ${fSkillCost}＋規模「${fNpScale}」${fScaleCost ? `+${fScaleCost}` : "0"} ＝ ${fTotal}，超過預算 ${FORGE_BUDGET}——請調降六圍/技能階級或改對人規模。` });
      // 職階技能：依職階慣例自動附贈（不占 3 槽·與種子/AI 生成對稱）
      const FORGE_CLS_SKILLS_ = {
        Saber: [{ n: "對魔力", r: "B", fx: "nullify_magic" }], Lancer: [{ n: "對魔力", r: "C", fx: "nullify_magic" }],
        Archer: [{ n: "對魔力", r: "C", fx: "nullify_magic" }, { n: "單獨行動", r: "C", fx: "solo" }],
        Rider: [{ n: "對魔力", r: "C", fx: "nullify_magic" }, { n: "騎乘", r: "B", fx: "ride" }],
        Caster: [{ n: "陣地作成", r: "C", fx: "territory" }, { n: "道具作成", r: "C", fx: "crafting" }],
        Assassin: [{ n: "氣息遮斷", r: "B", fx: "stealth" }], Berserker: [{ n: "狂化", r: "C", fx: "mad" }]
      };
      const fClsSkills = FORGE_CLS_SKILLS_[cls] || [];
      // 寶具：玩家名稱原樣保留（AI 不插手）·剝種子專屬標記(名/描述都剝——npAtkScale_ 讀整串關鍵字)。
      //   顯示階＝六圍寶具階(單一真實來源·引擎威力/耗魔/骰本就吃 six.寶具，原「另選階級」是假旋鈕、已拆)。
      let fNpName = String(build.npName || "").replace(/[<>&"'`]/g, "").replace(/【常駐寶具】|對城|對界|對神/g, "").trim().slice(0, 20) || "無名寶具";
      const fNpR = fSix["寶具"];
      const fNpDesc = String(build.npDesc || "").replace(/【常駐寶具】|對城|對界|對神/g, "").replace(/[｜【】\n\r\t]/g, "").trim().slice(0, 40); // 威能一句(選填)
      const bDesc = String(build.desc || "").trim().slice(0, 120);
      const bWeapon = String(build.weapon || "").replace(/[｜【】\n\r\t]/g, "").trim().slice(0, 30); // ⚔️ 玩家自定武裝(選填)
      const bLook = String(build.look || "").replace(/[｜【】\n\r\t]/g, "").trim().slice(0, 60);    // 🎨 玩家自定外貌本相(選填)
      const bPref = String(build.pref || "").replace(/[｜【】\n\r\t]/g, "").trim().slice(0, 60);    // 💭 玩家自定個性四短句(選填)
      // 📏 短輸入策略(2026-07)：外貌/個性是四格頓號格式——玩家寫得夠完整(≥3段)才「照抄勿改」直接用；
      //   寫太短(如只有「傲嬌」)改當【核心設定】讓 AI 擴寫成四短句(勿改本意)，避免照抄出光禿禿的演出卡。
      const _segs = v => v ? v.split(/[、,，]/).filter(Boolean).length : 0;
      const bLookFull = _segs(bLook) >= 3, bPrefFull = _segs(bPref) >= 3;
      // 🎭 AI 只補「玩家沒填的」演出欄＋寶具英文真名讀法——失敗不擋召喚，玩家數值/設定不當 AI 人質
      let flavor = null;
      try {
        flavor = JSON.parse(callGeminiAPI(
          `【真名】：${realName}\n【職階】：${cls}\n【性別】：${sex}\n【玩家描述】：${bDesc || "無"}${bLook ? `\n【外貌(${bLookFull ? "玩家已定·照抄勿改" : "玩家核心設定·擴寫成四短句·勿改本意"})】：${bLook}` : ""}${bPref ? `\n【個性(${bPrefFull ? "玩家已定·照抄勿改" : "玩家核心設定·擴寫成四短句·勿改本意"})】：${bPref}` : ""}${bFp ? `\n【自稱(玩家已定)】：${bFp}` : ""}${bSpeech ? `\n【口吻(玩家已定)】：${bSpeech}` : ""}${bMoe ? `\n【萌點(玩家已定·照抄勿改)】：${bMoe}` : ""}${bBack ? `\n【身世(玩家已定·照抄勿改)】：${bBack}` : ""}${bWeapon ? `\n【武裝(以此為準·勿依職階/原典改寫)】：${bWeapon}` : ""}\n【技能】：${fSkills.map(s => s.n).join("、") || "無"}\n【寶具】：${fNpName}${fNpDesc ? `（${fNpDesc}）` : ""}`,
          `你是《命運停駐之夜》的英靈人格編織者。玩家已親手定好一名原創從者的數值與設定，你【只】負責補完演出側寫與寶具英文真名，【嚴禁】輸出任何數值/階級/技能設定。玩家標「照抄勿改」的欄位原樣沿用；標「核心設定·擴寫」的欄位以玩家給的為靈魂擴寫、【嚴禁】偏離或覆蓋其本意。★輸出合法 JSON、禁 Markdown：{"background":"生平一句·限20字","personality":"日常表象、真實內裡、喜歡的事物、討厭的事物（四短句頓號分隔）","look":"外貌四短句頓號分隔（五官髮色/氣質/身形/衣著印象）","npc_intent":"一句反差萌·限15字","npEn":"寶具的英文真名讀法(拉丁字母·如 Excalibur、Gate of Babylon 風格·貼合寶具名意境·限4個單字)"}`,
          { temperature: 0.85, ignoreLaw: true }));
      } catch (e) { flavor = null; }
      // 🌟 寶具字串：中文名＋AI英文真名(有才嵌)＋（規模 階級）＋玩家威能一句——格式對齊種子(如 誓約勝利之劍 Excalibur（對城 A））
      let fNpEn = String((flavor && flavor.npEn) || "").replace(/[^A-Za-z0-9 .'\-:]/g, "").trim().slice(0, 30);
      np = `${fNpName}${fNpEn ? " " + fNpEn : ""}（${fNpScale} ${fNpR}）${fNpDesc ? "·" + fNpDesc : ""}`;
      const svHp = 150 + svNum_(fSix.耐久) * 6, svMp = 0; // 🔋 出力電池制：從者無自有魔力池
      row[COL.PC.HP] = svHp; row[COL.PC.MP] = svMp; row[COL.PC.MAX_HP] = svHp; row[COL.PC.MAX_MP] = svMp;
      // 🎨💭 外貌/個性：玩家寫得完整(≥3段)→原樣；寫短→AI 以其為核心的擴寫版(flavor.look/personality)；都沒有→AI/預設。
      //   短輸入 fallback 鏈尾仍掛 bLook/bPref——AI 掛掉時玩家的核心詞至少直接入卡，不會整欄退回通用預設。
      const finalLook = bLookFull ? bLook : (String((flavor && flavor.look) || "").trim() || bLook);
      const finalPref = bPrefFull ? bPref : (String((flavor && flavor.personality) || "").trim() || bPref);
      row[COL.PC.TRAIT] = parseTraitsHelper(finalLook, "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面");
      row[COL.PC.PREF] = parseTraitsHelper(finalPref, "沉著表象、堅定內裡、珍視之物、厭惡之事");
      row[COL.PC.INTENT] = bMoe || String((flavor && flavor.npc_intent) || "").slice(0, 18); // 🎭 萌點玩家優先
      // 🎭 自稱/態度玩家優先；口吻/小動作走種子同款 stampPersonaFlavor_（servantCard_ 直接讀列）
      row[COL.PC.MEMORY] = stampPersonaFlavor_(`第一人稱「${bFp || "我"}」｜對御主：${bToM || "初締約·尚在觀察"}`, bSpeech, bTic);
      if (bWeapon) row[COL.PC.MEMORY] = setWeapon_(row[COL.PC.MEMORY], bWeapon); // ⚔️ 武裝入 MEMORY·servantCard_ 強制以此演出
      row[COL.PC.SIX] = JSON.stringify(fSix);
      row[COL.PC.TAGS] = JSON.stringify({ skills: fClsSkills.concat(fSkills), traits: [] });
      if (fClsSkills.concat(fSkills).some(s => s && s.fx === "god_hand")) row[COL.PC.MEMORY] += "｜【試煉】3"; // 復活命數＝3（尼祿基準）
      row[COL.PC.BACK] = bBack || String((flavor && flavor.background) || `${cls}・${realName}`).slice(0, 28); // 🎭 身世玩家優先
      // 收錄英靈殿（重名不收）→ 日後可真名重召（含玩家自定 個性/外貌/萌點/自稱/態度/口吻/小動作·重召不掉設定）
      try { recordOriginalHero_(realName, cls, sex, row[COL.PC.SIX], fClsSkills, fSkills, [], np, finalPref || "", align, { look: finalLook, moe: row[COL.PC.INTENT], firstP: bFp, toMaster: bToM, speech: bSpeech, tic: bTic, back: bBack }); } catch (e) { }
    } else if (hero) {
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
      row[COL.PC.TRAIT] = parseTraitsHelper(String(persona.look || ""), "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面");
      // 🚀 種子英靈：直接用寫死的種子 persona（萌點/口吻 v3 已補齊），不再叫 AI 重生一次——省一次 API、加速召喚。
      //    個性取 persona.words(四關鍵)、萌點取 persona.moe、生平用種子既有 back 或職階真名模板。
      //    口吻/小動作(persona.speech/tic)已由 stampPersonaFlavor_ 複製進 MEMORY，servantCard_ 平常直接讀列即可，不必查英靈殿。
      let svPref = String(persona.words || "").replace(/・/g, "、");
      let svMoe = String(persona.moe || "").slice(0, 18);
      let svBack = persona.back ? String(persona.back).slice(0, 28) : `${cls}・${realName}`;
      row[COL.PC.PREF] = parseTraitsHelper(svPref, "沉著表象、堅定內裡、珍視之物、厭惡之事");
      row[COL.PC.MEMORY] = stampPersonaFlavor_(`第一人稱「${persona.firstP || "我"}」｜對御主：${persona.toMaster || "保持距離"}`, persona.speech, persona.tic);
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
★np：寶具名＋一句威能簡述；規模上限【對軍】——對城/對界/對神為種子英靈專屬，寫了也會被系統降為對軍，簡述請勿誇稱斬城滅界。★npc_intent：一句【簡短】反差萌（≤15字）。★sex 從 男／女／異 擇一。

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
      row[COL.PC.INTENT] = String(aiBrief.npc_intent || "").slice(0, 18);
      row[COL.PC.MEMORY] = `第一人稱「我」｜對御主：初締約·尚在觀察`; // 與種子路徑對稱(原漏寫→servantCard_ 演出資訊變薄)
      row[COL.PC.SIX] = JSON.stringify(aiSix);
      row[COL.PC.TAGS] = JSON.stringify({ skills: aiCSkills.concat(aiSkills), traits: aiTraits });
      // 🕯️ 復活命數：AI 產物持 god_hand → 標【試煉】3(尼祿「三度輝映」基準)——預設 11 是赫拉克勒斯(seed)專屬。
      if (aiCSkills.concat(aiSkills).some(function (s) { return s && s.fx === 'god_hand'; })) {
        row[COL.PC.MEMORY] += '｜【試煉】3';
      }
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
