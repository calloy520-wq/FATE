// ==========================================
// 🎴 Router_Creation.gs — 創角／召喚
//   御主創角(actionManualNpc)＋敘事非阻塞補生成(actionBackfillMasterAi)＋召喚從者(actionSummonServant)。
//   共用 GAS 全域作用域，與 Router_Action.gs 等其他檔互叫無礙。見 HANDBOOK.md §4.1 拆分慣例。
// ==========================================
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。

function actionManualNpc(userData, pcId, sheets) {
  // 御主創角（action="create"）；從者召喚見 actionSummonServant。
  // 🐛→✅ 稽核抓到：試算表被清空/尚未建置時 sheets.pc 是 null，這裡完全沒防呆——第122行
  //   appendRow 會拋出「Cannot read properties of null」這種對玩家毫無意義的原始JS例外訊息
  //   (雖有外層catch接住不至於整個request掛掉，但玩家看到的是天書，不知道該做什麼)。這是
  //   全新玩家第一個會呼叫的action，優先在此補上清楚指引，請他們找人跑一次check_sheets。
  if (!sheets.pc) return JSON.stringify({ success: false, message: "試算表尚未建置完成，請聯繫管理者執行「檢查／建立試算表分頁」後再試一次。" });
  // 🛡️ 帳號重入防呆：此帳號若已連結一局活著的遊戲(charId 存在且非 DEAD_)，拒絕再建一次——否則 linkAccountToPc_ 會悄悄覆寫帳號的連結指標，把舊角色＋已召喚的從者孤兒化(英靈殿範本不受影響、但這局「進行中遊戲」從帳號視角消失，下次登入變成一場空的 needsSummon，玩家會以為角色跟從者憑空消失了)。
  if (userData.account) {
    try {
      const acc = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("帳號");
      const found = acc && findAccountRow_(acc, String(userData.account).trim());
      const oldCharId = found ? String(found.row[COL.ACC.PC] || "") : "";
      if (oldCharId && sheets.pc.getDataRange().getValues().some(r => String(r[COL.PC.ID]) === oldCharId)) {
        return JSON.stringify({ success: false, message: "這個帳號已經有一場進行中的聖杯戰爭。用「繼續戰爭」接下去，或回選單開新局清掉舊的。" });
      }
    } catch (e) { } // 檢查失敗不擋創角(優雅降級)，寧可放行也不要卡死正常玩家
  }
  const newId = "PC_" + Date.now();
  let { name, sex, identity, standing, wish, appearance, magic, circuits, origin, melee, magicRank } = userData;
  let finalName = name;
  const finalSex = sex;

  // 🔴 姓名已在 sanitizeUserData_ 清成純中文；若為空代表含非中文字元，直接擋下不寫表
  if (!finalName) {
    return JSON.stringify({ success: false, message: "名號僅限中文字，不可使用英文、數字或符號。" });
  }

  // 🔵 御主名號＝角色名。
  const _canonMasterHit = typeof SEED_MASTERS !== 'undefined' && SEED_MASTERS.some(m => m && cleanChineseName(m.name) === finalName);
  const _canonServantHit = typeof SEED_SERVANTS !== 'undefined' && SEED_SERVANTS.some(s => s && cleanChineseName(s.realName) === finalName);
  // 扮演正典御主(playedMaster) 是合法路徑，須排除於撞名擋下之外；驗證 playedMaster 對應真名剛好等於finalName 才放行，避免夾帶不相干 playedMaster id 繞過保護。
  const _playingThisCanon = userData.playedMaster && typeof SEED_MASTERS !== 'undefined'
    && SEED_MASTERS.some(m => m && String(m.id) === String(userData.playedMaster) && cleanChineseName(m.name) === finalName);
  if (_canonMasterHit && !_playingThisCanon) return JSON.stringify({ success: false, message: `「${finalName}」是聖杯戰爭中已知的御主——自創御主請另取名號；若想扮演此角，請用「扮演正典御主」入口。` });
  if (_canonServantHit) return JSON.stringify({ success: false, message: `「${finalName}」是聖杯戰爭中已知的英靈真名——自創御主請另取名號。` });
  // finalName 此時仍是 cleanChineseName 洗掉標點的畸形版本——還原成 SEED_MASTERS 原始正典真名(含標點)。
  if (_playingThisCanon) {
    const _canonMaster = SEED_MASTERS.find(m => m && String(m.id) === String(userData.playedMaster));
    if (_canonMaster) finalName = _canonMaster.name;
  }
  // 🔵 實例化：御主創角 → 開一個全新 game_id 世界
  const gameId = "g_" + Date.now();

  // getMapDataCached 直接讀 FATE_MAP_SEED 常數(零 I/O、恆非空)，不必靠 sheets.map 是否存在來決定要不要退回保底地名。
  const validMapNames = getMapDataCached(sheets).slice(1).map(r => String(r[COL.MAP.NAME]).trim()).filter(n => n !== "" && !n.includes('-'));

  // 開局非阻塞：create 不叫 AI，秒寫種子值進場；AI 生成的背景/特徵/個性由 actionBackfillMasterAi 背景補上。
  try {
    // 🎴 御主(凡人魔術師)初始數值：HP/MP 依魔術迴路(財力/身世決定)推算——御主是凡人，遠低於英靈從者。
    // 🎲 玩家沒測定命運就由 GAS 擲一份（創角 UI 明說「留空＝隨機天賦」）——舊版留空會讓
    //   迴路/魔術/出身/體術整組空白，御主卡幾乎沒東西可演。
    const _fate = circuits ? null : rollMasterFate_();
    if (_fate) { circuits = _fate.circuits; magic = magic || _fate.magic; origin = origin || _fate.origin; melee = melee || _fate.melee; magicRank = magicRank || _fate.magicRank; }
    const safeCircuits = clampCircuits_(circuits);
    const masterStats = masterMaxHpMp_(safeCircuits || 30);
    // 起始落點：確定性選一個有效冬木居所(偏好新都)，不需 AI；backfill 不動落點以免與移動競寫。
    const spawnName = validMapNames.find(n => /新都/.test(n)) || validMapNames[0];

    // 🛡️ 這幾格是玩家自由填寫的文字(sanitizeUserData_只截長度、不擋｜【】——那道清洗只鎖name/npcName等嚴格姓名欄位)，MEMORY是全欄位共用｜分隔的標記格式，比照setOutfit_/setWeapon_同款清洗，避免玩家文字裡剛好帶的｜【】把後面的【模式】【戰爭】【扮演】等系統標記截斷或偽造。
    const cleanTagText_ = (s, maxLen) => { const v = String(s || "").replace(/[｜【】\n\r\t]/g, ""); return maxLen ? v.slice(0, maxLen) : v; };
    const pcColCount = Object.keys(COL.PC).length;
    const newRow = Array(pcColCount).fill("");
    newRow[COL.PC.ID] = newId; newRow[COL.PC.NAME] = finalName; newRow[COL.PC.SEX] = finalSex;
    newRow[COL.PC.BACK] = String(standing || identity || "來歷不明的魔術師").slice(0, 40); // 種子＝玩家輸入身世；backfill 會用 AI 潤成 20 字背景
    newRow[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "氣息平穩" });
    newRow[COL.PC.MEMORY] = [
      wish ? `【願望】${cleanTagText_(wish, 40)}` : "",
      magic ? `【魔術】${cleanTagText_(magic, 20)}` : "",
      safeCircuits ? `【迴路】${cleanTagText_(safeCircuits)}` : "",
      origin ? `【出身】${cleanTagText_(origin, 20)}` : "",
      melee ? `【體術】${cleanTagText_(melee, 20)}` : "",
      magicRank ? `【魔術階位】${cleanTagText_(magicRank, 20)}` : "",
      "【令咒】3",
      `【模式】${userData.warMode === 'chaos' ? 'chaos' : 'canon'}`,
      userData.warMode === 'chaos' ? "" : `【戰爭】${['4th', '5th'].indexOf(String(userData.war)) >= 0 ? userData.war : '5th'}`,
      (userData.warMode !== 'chaos' && _playingThisCanon) ? `【扮演】${cleanTagText_(userData.playedMaster)}` : ""
    ].filter(Boolean).join("｜");
    // 起始禮裝：玩家自選；驗證＝合法的【被動】禮裝 id，空／'none'／破戒(special) 一律不帶。
    try {
      const pick = String(userData.mystic || "").trim();
      if (pick && MYSTIC_CODES[pick] && MYSTIC_CODES[pick].type === 'passive') {
        newRow[COL.PC.MEMORY] = equipMysticToMemory_(newRow[COL.PC.MEMORY], pick);
      }
    } catch (e) { }
    // 種子敘事欄(4 格預設)：backfill 成功會用單格 setValue 覆蓋為 AI 版；AI 失敗則保留這些預設(優雅降級)。
    newRow[COL.PC.TRAIT] = parseTraitsHelper("", "外貌平凡、舉止從容", TRAIT_SLOTS_);
    newRow[COL.PC.LOC] = spawnName;
    newRow[COL.PC.PREF] = parseTraitsHelper("", "溫婉謙和、內斂堅韌、明哲保身、隨波逐流");
    newRow[COL.PC.HP] = masterStats.hp; newRow[COL.PC.MP] = masterStats.mp;
    newRow[COL.PC.MAX_HP] = masterStats.hp; newRow[COL.PC.MAX_MP] = masterStats.mp;
    newRow[COL.PC.FACTION] = "無"; newRow[COL.PC.RANK] = "御主";
    newRow[COL.PC.CONTRIB] = 0; newRow[COL.PC.ALIGN] = "中立";
    newRow[COL.PC.INTENT] = "";   // 萌點欄已棄用，永遠留空
    newRow[COL.PC.GAME_ID] = gameId;
    sheets.pc.appendRow(newRow);

    if (userData.account) { try { linkAccountToPc_(userData.account, newId); } catch (e) { } }
    return JSON.stringify({ success: true, pcId: newId, gameId: gameId, message: `【聖杯】因果已定，『${finalName}』於「${spawnName}」締結令咒，成為御主。` });
  } catch (e) { return JSON.stringify({ success: false, message: "建立失敗:" + e.message }); }
}

function actionBackfillMasterAi(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const row = pcData[pIdx];
  const finalName = String(row[COL.PC.NAME] || ""), finalSex = String(row[COL.PC.SEX] || "異");
  // 表優先、前端只當補充：這幾格 create 當下就寫進列/MEMORY 了，前端漏送不該靜靜退化成「隨機」。
  const _rowMem = String(row[COL.PC.MEMORY] || "");
  const _pick = (a, b) => String(a || "").trim() || String(b || "").trim();
  const appearance = _pick(userData.appearance, String(row[COL.PC.TRAIT] || "").split('、')[0]).slice(0, 30);
  const standing = _pick(userData.standing, row[COL.PC.BACK]).slice(0, 40);
  const wish = _pick(userData.wish, extractWish_(_rowMem)).slice(0, 40);
  const magic = _pick(userData.magic, getMasterMagic_(_rowMem));
  const origin = _pick(userData.origin, getMasterOrigin_(_rowMem));

  // getMapDataCached 直接讀 FATE_MAP_SEED 常數(零 I/O、恆非空)，不必靠 sheets.map 是否存在來決定要不要退回保底地名。
  const validMapNames = getMapDataCached(sheets).slice(1).map(r => String(r[COL.MAP.NAME]).trim()).filter(n => n !== "" && !n.includes('-'));

  const promptStr = `【御主】：名號『${finalName}』，性別『${finalSex}』\n【外貌】：${appearance || "隨機"}\n【身世／財力】：${standing || "隨機"}\n【願望】：${wish || "隨機"}\n【魔術系統】：${magic || "隨機"}\n【出身】：${origin || "隨機"}`;

  const MASTER_GEN_SYS = `你是《命運停駐之夜》聖杯戰爭的角色生成核心，為玩家建立一位「御主（Master）」——參與第五次聖杯戰爭的現代魔術師，舞台是冬木市。請依玩家提供的姓名、性別、身世／財力、願望，生成合理且具戲劇張力的設定。

★【語言】全程使用繁體中文，所有輸出內容(含技能招式名、外號、修飾詞)一律不得夾雜英文或其他語言字母；玩家描述若含英文人名/詞彙，請意譯或音譯成中文寫入，不要原樣照抄英文。
★【演出而非說明】願望與身世只作為設定底層，不要在 background 裡直接複述願望字面。
★【格式鐵律】traits 【恰好2段】、personality 【恰好4段】，只用頓號「、」分隔，【絕對不要用句號「。」或半形句點】，每段是一個【簡短詞組】(不是完整句子)、限${TRAIT_SEG_HINT_}字內寫完，每段內部也【不要】再用頓號列舉多項；禁數字標籤。
- traits：外貌、氣質。${finalSex === '女' ? BUST_NOTE_ : ''}${AURA_SPEC_}
- personality：日常表象、真實內裡、喜歡的事物、討厭的事物
★background：限20字，呼應其身世／財力，禁出現具體物品名。
★【勿輸出數值】戰力數值、HP/MP 一律由系統裁定，prompt【不要】輸出任何數值欄位；也不要輸出地點。

★【輸出】合法 JSON、禁 Markdown：
{"background":"限20字","traits":"兩格頓號字串","personality":"四格頓號字串"}`;

  try {
    // 🔴 ignoreLaw: true，把節慶跟天氣隔絕在創建室外
    const aiBrief = JSON.parse(callGeminiAPI(promptStr, MASTER_GEN_SYS, { temperature: 0.6, ignoreLaw: true }));
    // backfill 豁免寫入鎖，pIdx 是 AI 呼叫前的列索引——期間若清殘列刪列會位移；寫回前重新以 ID 定位，列已被刪則放棄寫入。
    const wIdx = buildLiveIdIndex_(sheets.pc)[String(pcId)];
    if (wIdx === undefined) return JSON.stringify({ success: false, message: "御主列已不存在（可能剛被清理）。" });
    // 單格寫回(不整列)：只覆蓋敘事欄，且僅在 AI 有給值時；數值/MEMORY/位置一律不碰。
    if (aiBrief.background) sheets.pc.getRange(wIdx + 1, COL.PC.BACK + 1).setValue(String(aiBrief.background).slice(0, 40));
    if (aiBrief.traits) sheets.pc.getRange(wIdx + 1, COL.PC.TRAIT + 1).setValue(parseTraitsHelper(aiBrief.traits, traitParts_(row[COL.PC.TRAIT]).join('、'), TRAIT_SLOTS_));
    if (aiBrief.personality) sheets.pc.getRange(wIdx + 1, COL.PC.PREF + 1).setValue(parseTraitsHelper(aiBrief.personality, row[COL.PC.PREF]));
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

function getWarMode_(memory) {
  var m = String(memory || "").match(/【模式】(canon|chaos)/);
  return m ? m[1] : "canon";
}
// 鋪敵用的「戰爭」字串：混亂→chaos；正史→【戰爭】(4th/5th，預設 5th)
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
        let six = {}, sk = [], tr = []; try { six = JSON.parse(r[COL.HERO.SIX] || "{}"); } catch (e) { } try { sk = JSON.parse(r[COL.HERO.SKILLS] || "[]"); } catch (e) { } try { tr = JSON.parse(r[COL.HERO.TRAITS] || "[]"); } catch (e) { }
        h.detail = { six: six, skills: sk, align: String(r[COL.HERO.ALIGN] || "中立"),
          traits: (Array.isArray(tr) ? tr : []).map(t => String((t && t.n) || t)).join("、"), // 編輯預填用：陣列→頓號字串，比照 cf-traits 輸入格式
          look: String(pj.look || ""), pref: String(pj.words || ""), fp: String(pj.firstP || ""),
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
var ALLOWED_FX_ = {
  nullify_magic: 1, first_strike: 1, analyze: 1, str_up: 1, burst: 1, ride: 1, stealth: 1,
  evade_ranged: 1, survive: 1, mad: 1, morale: 1, divine_age: 1,
  unreadable: 1, wind_strike: 1, tsubame: 1, gae_bolg: 1, god_hand: 1,
  clear_mind: 1, self_mod: 1, tactics: 1, anti_magic_lance: 1, rule_breaker: 1,
  // 施放技術/命中/防禦/對人放大——中階以下，拉高自訂從者上限、不含頂級概念寶具
  aim: 1, projection: 1, fast_cast: 1, crafting: 1, petrify: 1, shapeshift: 1,
  solo: 1, weapon_steal: 1, rho_aias: 1, territory: 1, wall_def: 1, zabaniya: 1, regen: 1,
  divine: 1, // 神性(帶階級，比 trait 名判定精準)——引擎中主要是弱點(被神殺/天之鎖剋)，濫用價值低
  agile_striker: 1, // 以巧破力：以敏捷為傷害底(敏高於筋/魔時)，敏捷輸出流唯一通道。顯示名勿用「神速」——與 first_strike(先機) 正史技能撞名
  // 三項於互鬥測試中補上以填補剋制缺口：
  sense: 1,    // 氣息感知(恩奇都同款)：階級≥對方氣息遮斷→看穿奇襲。刺客流的天然反制。
  god_slay: 1, // 神殺(斯卡哈同款)：對神性之敵×1.17~2.0(依對方神格·binary→固定25)。counter-pick 剋神核/神裔。
  lovespot: 1  // 愛之痣(迪盧木多同款)：敵命中-1(微量風味·固定5)。
};
var FX_MENU_ = "【可用技能效果碼 fx】挑契合此英靈的，沒對應就填空字串\"\"（頂級概念寶具 乖離劍/王之財寶/無限劍製/神核 等為種子專屬、不在此清單）。★左側只是 fx 的語意參考，不是顯示名：" +
  "對魔力=nullify_magic、直感=first_strike、心眼=analyze、千里眼=aim、怪力=str_up、魔力放出=burst、投影魔術=projection、" +
  "高速詠唱=fast_cast、道具作成=crafting、騎乘=ride、氣息遮斷=stealth、變化(迴避+)=shapeshift、避矢=evade_ranged、" +
  "戰鬥續行=survive、單獨行動=solo、七天盾(對寶具展開·投影減傷·御主耗魔)=rho_aias、陣地作成(減傷)=territory、城牆防禦(物理減傷)=wall_def、" +
  "狂化=mad、勇猛/卡里斯瑪=morale、神代魔術=divine_age、無欲(封先機)=unreadable、透化(免威壓)=clear_mind、" +
  "自我改造(命中傷害+)=self_mod、軍略(寶具+)=tactics、風王鐵鎚(傷+)=wind_strike、魔眼(石化)=petrify、必中槍=gae_bolg、" +
  "秘劍燕返(每場首回合強化)=tsubame、妄想心音(暗殺致命)=zabaniya、無毀湖光(對龍+)=weapon_steal、治癒(每回合回血)=regen、不死復活(復活3次·如尼祿三度輝映)=god_hand、" +
  "破魔(無視神核/續行)=anti_magic_lance、破戒(斬契約救贖)=rule_breaker、神性(神裔·會被神殺剋)=divine、以巧破力(以敏捷為傷害底)=agile_striker、" +
  "氣息感知(看穿奇襲)=sense、神殺(剋神性之敵)=god_slay、愛之痣(魅惑·敵命中-1)=lovespot";

// 📝 創角提示詞的共用零件（御主生成／從者召喚兩支各寫一份的那些長句子，收在這裡講一次）。
var BUST_NOTE_ = '外貌段要具體寫到身形與胸部，用自然敘述句(如「胸前豐盈」「身形纖瘦」)，不要「巨乳」這種孤立標籤——這句玩家看得到。';
// 🌸 氣質格怎麼寫（五處提示詞共用·單一真實來源）：第一眼撞見的氛圍，不是叫 AI 每回合表演的動作。
var AURA_SPEC_ = '氣質＝【第一眼撞見這個人時的整體氛圍】，寫成一個聞得到/感覺得到的意象(可帶淡淡氣味、溫度或光線)，'
  + '例：「雨後百合的清冽」「曬過的舊木頭味，帶點鐵鏽」「剛剝開的柑橘，亮而酸」。'
  + '★【禁】寫成習慣動作或常態指令(「背脊永遠打得筆直」「總是…」「每次都…」)——那是要 AI 每回合表演一個動作，不是第一印象。'
  + '★【禁】孤立形容詞(「冷峻」「傲然」)。'

// 🎭 創角「來源三分類」(origin)→ 角色框定 frame ＋ 技能命名規則 skill。
function originGuide_(origin) {
  if (origin === 'fate') return {
    frame: '這是【Fate 系列的正史角色】，請依玩家描述【還原召喚這名英靈】，忠於其原著傳說、性格與能力，勿當成原創另行杜撰。',
    skill: '★技能名【忠於該角色 Fate 原著既有的技能/招式名】(對魔力／魔力放出／直感／庫夫林「蓋・波爾克」…)，直接沿用勿重編亂加花名；fx 照挑對應機制。',
    pnote: '【Fate 系列正史角色】(演出/外貌/人格補完請忠於其原著、勿當原創杜撰)的'
  };
  if (origin === 'anime') return {
    frame: '這是【其他動漫／漫畫／遊戲的知名角色】，請依玩家描述【還原這名角色】，忠於其原著形象、性格與代表能力，勿當成原創另行杜撰。',
    skill: '★技能名【取該角色原著的招牌招式／絕技名】(如 悟空→龜派氣功／瞬間移動、炭治郎→水之呼吸)，fx 照挑最接近的機制；原著招式找不到對應機制就挑最貼近者、名字仍用原著招式名。',
    pnote: '【其他動漫／漫畫／遊戲知名角色】(演出/外貌/人格補完請忠於其原著、勿當原創杜撰)的'
  };
  return { // original 或未指定
    frame: '這是玩家【自訂描述的原創英靈】，請依描述創作一位全新原創從者（可自取貼切真名），忠於描述的形象與氣質。',
    skill: '★技能名依角色形象【自取貼合的獨特招式名】(像寶具那樣有個性)，例 fx=str_up→「鬼之膂力」、fx=morale→「獅子之心」；⚠自取名勿與清單上其他 fx 的正史名撞名(如非 first_strike 者別叫「直感/神速」)以免張冠李戴。',
    pnote: '原創'
  };
}

// 清洗 AI 給的技能陣列為 [{n,r,fx}]（fx 不在字典就清空，仍保留為演出用標籤）。
function sanitizeSkills_(arr, maxCount) {
  if (!Array.isArray(arr)) return [];
  var okR = function (v) { return /^(E|D|C|B|A)$/.test(v); };
  return arr.filter(Boolean).slice(0, maxCount || 5).map(function (s) {
    var fx = String((s && (s.fx || s.效果碼)) || "").trim();
    var r = String((s && (s.r || s.階級 || s.rank)) || "C").toUpperCase().trim();
    return {
      n: String((s && (s.n || s.名稱 || s.name)) || "技能").replace(/[<>&"'`]/g, "").slice(0, 10) || "技能",
      r: okR(r) ? r : "C",
      fx: Object.prototype.hasOwnProperty.call(ALLOWED_FX_, fx) ? fx : ""
    };
  });
}
// 🏷️ 技能來源標記：寫入 TAGS 前把 classSkills/skills 分別打上 kind('class'/'skill')再合併——四個寫入點(召喚 hero 分支/AI生成分支/種子英靈/敵方鋪陳)合併前都還是兩個分開的陣列，只是合併那刻來源資訊就丟了；提早在這裡標記，前端卡片才能 100% 準確分「職階技能／固有技能」而非用 fx 代碼猜。
function tagSkillKind_(arr, kind) {
  return (Array.isArray(arr) ? arr : []).filter(Boolean).map(function (s) {
    return Object.assign({}, s, { kind: kind });
  });
}
// 清洗六圍：6 鍵齊全、階級合法（E~EX、可帶 +/++/−，承認 A++/B− ——AI 常自發吐 A++）；缺或亂給則補 C。
function sanitizeSix_(o) {
  var keys = ["筋力", "耐久", "敏捷", "魔力", "幸運", "寶具"], out = {};
  var ok = function (v) { return /^(E|D|C|B|A|EX)(\+{1,2}|\-)?$/.test(String(v || "").toUpperCase()); };
  keys.forEach(function (k) { var v = o && o[k] ? String(o[k]).toUpperCase().trim() : "C"; out[k] = ok(v) ? v : "C"; });
  var exKeys = keys.filter(function (k) { return rankVal(out[k]) >= 60; });
  if (exKeys.length > 2) exKeys.slice(2).forEach(function (k) { out[k] = "A"; });
  return out;
}

// 把 AI 生成的原創從者寫回英靈殿（重名則不收；御主不適用此機制）。
function recordOriginalHero_(name, cls, sex, sixJson, classSkills, skills, traits, np, personaWords, align, pExtra) {
  // 🛡️ 這是唯一寫進共用英靈殿的入口(手動工房已在parseForgeBuild_清過build.name，但AI輔助召喚path的realName可能只清過userData.trueName、AI自己回傳的aiBrief.realName未經任何清洗)——在單一真實來源補一道，兩條路徑都保證進表的名字不含HTML斷字字元。
  name = String(name || "").replace(/[<>&"'`]/g, "").trim();
  if (!name) return false;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hs = ss.getSheetByName("英靈殿");
  if (!hs) return false;
  var data = getHeroCodexCached();
  var newIdCandidate = name + "-" + String(cls || "").trim();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.HERO.NAME]).trim() === name) return false; // 已有同名 → 不重複收錄
    if (String(data[i][COL.HERO.ID]).trim() === newIdCandidate) return false; // id層級也擋(短名撞種子id)
  }
  var px = pExtra || {};
  var personaWordsClean = String(personaWords || "").replace(/[<>&"'`]/g, "").trim().slice(0, 200);
  var persona = JSON.stringify({
    words: personaWordsClean, firstP: String(px.firstP || "") || "我", toMaster: String(px.toMaster || ""),
    look: String(px.look || ""), speech: String(px.speech || ""), tic: String(px.tic || ""), back: String(px.back || ""),
    // 🔑 creator＝編輯權限綁定(actionSaveHero edit 分支靠 pj.creator===acct 擋非本人)；weapon＝武裝敘述。
    weapon: String(px.weapon || ""), creator: String(px.creator || "")
  });
  // 工房角色創造當下就順手轉好日常版(DAILY_LOOK/DAILY_WORDS)寫進英靈殿，跟種子英靈不同(那 25 人的日常版是 Seed_Codex.gs persona.daily* 手寫欄位，getDailyHeroFields_ 只負責讀、沒有補算路徑)——之後第一次被召喚進鑑賞就直接有現成版本，不必等召喚當下才轉。
  // translateLookToDaily_ 一次呼叫同時產出三段式 look(外貌本相/氣質舉止/日常口氣) 與獨立的 outfit(日常穿搭)。
  var dailyLookRes = translateLookToDaily_(name, cls, String(px.look || ""), String(px.firstP || ""), String(px.speech || ""), sex);
  // 🚫 私密一面(原 dailyLook 第4段)已整組退休，性格生成不再需要那個去重 hint。
  var dailyWords = translatePersonalityToDaily_(name, cls, personaWordsClean);
  hs.appendRow([name + "-" + cls, cls, name, sex || "異", sixJson || "{}",
    JSON.stringify(classSkills || []), JSON.stringify(skills || []), JSON.stringify(traits || []),
    np || "", persona, align || "中立", "[]", "ai_gen", dailyLookRes.look, dailyWords, "", dailyLookRes.outfit]);
  try { CacheService.getScriptCache().remove("FATE_HERO_CODEX"); } catch (e) { } // 種子表已變動→清快取，下次讀到新從者
  return true;
}

// 陣營九宮格(單一真實來源)：秩序/中立/混沌 × 善/中庸/惡，"中立"(無修飾)是通用預設值。
var ALIGNS_ = ["秩序・善", "秩序・中庸", "秩序・惡", "中立・善", "中立", "中立・惡", "混沌・善", "混沌・中庸", "混沌・惡"];

// 💰 六圍/技能/規模 統一計價（單一真實來源：工房 parseForgeBuild_ 的預算上限檢查、AI 自訂從者的下限保底 bumpSixToFloor_ 共用同一套算式，避免定價邏輯散落兩處各自為政）。
var SKILL_PTS_ = { E: 5, D: 10, C: 15, B: 20, A: 25 };
var SKILL_PTS_BIG_ = { E: 7, D: 13, C: 20, B: 27, A: 33 };
var SKILL_PTS_SMALL_ = { E: 3, D: 7, C: 10, B: 13, A: 17 };
var SKILL_TRACK_ = { aim: 1, petrify: 1, fast_cast: 1, divine_age: 1, territory: 1, ride: -1, wind_strike: -1, morale: -1 };
var FLAT_FX_ = { god_hand: 25, survive: 25, tsubame: 60, zabaniya: 25, gae_bolg: 25, rule_breaker: 25, anti_magic_lance: 25, agile_striker: 25, weapon_steal: 25, god_slay: 25, lovespot: 5, self_mod: 15, tactics: 25, projection: 25 };
function forgeCost_(six, skills, npScale) {
  var spent = Object.keys(six).reduce(function (s, k) { return s + rankVal(six[k]); }, 0);
  var scaleCost = (npScale === "對軍") ? 20 : 0;
  var slotFee = skills.length > 3 ? 20 : 0;
  var skillCost = skills.reduce(function (s, k) { return s + (k.fx ? (FLAT_FX_[k.fx] ||
    (SKILL_TRACK_[k.fx] === 1 ? SKILL_PTS_BIG_ : SKILL_TRACK_[k.fx] === -1 ? SKILL_PTS_SMALL_ : SKILL_PTS_)[k.r] || 15) : 0); }, slotFee);
  return { spent: spent, scaleCost: scaleCost, skillCost: skillCost, total: spent + scaleCost + skillCost };
}

// 💰 工房預算＝種子中位數(點滿≈尼祿/美杜莎中堅)。⚠ 前端 Script_Onboarding.html 也有一份（check_mirror.js 盯著兩邊一致）。
var FORGE_BUDGET = 340;
// 🌀 AI 自訂從者的六圍下限保底：直接綁 FORGE_BUDGET，別再寫第二個 340——AI 常自己抓不準力度，光靠 prompt 措辭拜託「務必有強有弱」擋不住偶爾生出偏弱從者，這裡改成 GAS 硬性補強：算完低於下限就把最弱一項六圍逐階往上補，直到達標或撞 EX≤2 上限(見 sanitizeSix_)為止。
var FORGE_FLOOR_ = FORGE_BUDGET;
var FORGE_CLS_BONUS_ = { Berserker: 30 };
function bumpSixToFloor_(six, skills, npScale) {
  var RANKS = ["E", "D", "C", "B", "A", "EX"];
  var keys = Object.keys(six);
  var guard = 0;
  while (forgeCost_(six, skills, npScale).total < FORGE_FLOOR_ && guard++ < 40) {
    var exCount = keys.filter(function (k) { return six[k] === "EX"; }).length;
    var bumpable = keys.filter(function (k) {
      var idx = RANKS.indexOf(String(six[k]).replace(/[+\-]+$/, ""));
      if (idx < 0 || idx >= RANKS.length - 1) return false; // 已是 EX 或格式異常
      return !(RANKS[idx + 1] === "EX" && exCount >= 2); // 已有2項EX，此項封頂A不再進位
    });
    if (!bumpable.length) break; // 已達 EX≤2 上限下的六圍總和上限，補無可補
    var weakest = bumpable.reduce(function (a, b) { return rankVal(six[a]) <= rankVal(six[b]) ? a : b; });
    var idx = RANKS.indexOf(String(six[weakest]).replace(/[+\-]+$/, ""));
    six[weakest] = RANKS[idx + 1];
  }
  return six;
}

function capSixToBudget_(six, skills, npScale, cls) {
  var RANKS = ["E", "D", "C", "B", "A", "EX"];
  var keys = Object.keys(six);
  var budget = FORGE_FLOOR_ + (FORGE_CLS_BONUS_[cls] || 0);
  var guard = 0;
  while (forgeCost_(six, skills, npScale).total > budget && guard++ < 40) {
    var reducible = keys.filter(function (k) {
      return RANKS.indexOf(String(six[k]).replace(/[+\-]+$/, "")) > 0; // 已是 E 就不能再降
    });
    if (!reducible.length) break;
    var strongest = reducible.reduce(function (a, b) { return rankVal(six[a]) >= rankVal(six[b]) ? a : b; });
    var idx = RANKS.indexOf(String(six[strongest]).replace(/[+\-]+$/, ""));
    six[strongest] = RANKS[idx - 1];
  }
  return six;
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
function parseForgeBuild_(build, reqCls) {
  const VALID_CLS = ["Saber", "Archer", "Lancer", "Rider", "Caster", "Assassin", "Berserker"];
  const out = {};
  const isMasterCls = String(build.cls) === "御主";
  out.cls = isMasterCls ? "御主" : (VALID_CLS.includes(String(build.cls)) ? String(build.cls) : (reqCls || "Saber"));
  out.name = String(build.name || "").replace(/[<>&"'`]/g, "").trim().slice(0, 20);
  if (!out.name) return { ok: false, message: "請為英靈取一個真名。" };
  // SEED_SERVANTS 真名欄位是 `realName` 不是 `name`——用 `s.name` 會恆 undefined，撞名擋失效。
  if ((typeof SEED_SERVANTS !== "undefined" && SEED_SERVANTS.some(s => s && s.realName === out.name)) ||
      (typeof SEED_MASTERS !== "undefined" && SEED_MASTERS.some(m => m && m.name === out.name))) {
    return { ok: false, message: `「${out.name}」是英靈殿正典角色——請從召喚頁上方「職階英靈殿」挑選召喚，或另取原創真名。` };
  }
  out.sex = ["男", "女", "異"].includes(String(build.sex)) ? String(build.sex) : "異";
  const _fClean = (v, n) => String(v || "").replace(/[<>&"'`｜【】\n\r\t]/g, "").trim().slice(0, n);
  out.fp = _fClean(build.fp, 4); out.toM = _fClean(build.toMaster, 20); out.speech = _fClean(build.speech, 40);
  out.tic = _fClean(build.tic, 30); out.back = _fClean(build.back, 28);
  out.align = ALIGNS_.includes(String(build.align)) ? String(build.align) : "中立";
  out.look = _fClean(build.look, 60); out.pref = _fClean(build.pref, 60);
  const _segs = v => v ? v.split(/[、,，]/).filter(Boolean).length : 0;
  // 玩家自己把格子填滿了就照抄、沒填滿才交給 AI 擴寫。門檻跟著兩張表的格數走，不要各寫一個數字。
  out.lookFull = _segs(out.look) >= TRAIT_SLOTS_; out.prefFull = _segs(out.pref) >= PREF_LABELS_.length;
  out.desc = String(build.desc || "").trim().slice(0, 120);
  // 🎭 特性(traits)：純敘事風味標籤(見 Script.html TRAIT_DESC)，不進 FORGE_BUDGET 計費、不驗白名單——玩家想捏其他作品角色(如「賽亞人」「人造人」)需要能自由發揮，比照 AI 生成分支(aiTraits)同一套清洗規則(頓號/逗號分段、上限4個、單則截8字)，讓工房手捏角色也能貼這類梗。
  out.traits = String(build.traits || "").split(/[、,，]/).map(s => s.trim()).filter(Boolean).slice(0, 4).map(n => ({ n: n.replace(/[<>&"'`]/g, "").slice(0, 8) }));
  if (isMasterCls) {
    // 🌹 御主：六圍/技能/寶具/武裝全部略過驗證與計費，強制留空(鑑賞用不到、不進戰鬥引擎)。
    out.six = {}; out.skills = []; out.classSkills = [];
    out.npScale = "對人"; out.npName = ""; out.npR = ""; out.npDesc = ""; out.weapon = "";
    out.ok = true;
    return out;
  }
  // 預算見檔案級 FORGE_BUDGET；強者種子(420~505·且握有工房買不到的概念 fx)仍明確在上。
  // FORGE_CLS_BONUS_ 已上移為檔案級單一真實來源（與 AI 生成路徑 capSixToBudget_ 共用）：Berserker 職階附贈狂化C(傷+但命中/迴避−·不可關)是唯一負資產禮物，同素體實測墊底——補正+30 拉平(+50 會反轉成最優職階，370 頂配狂戰實測後仍只是強力中堅，安全)。
  const okPlain = v => /^(E|D|C|B|A|EX)$/.test(String(v || "").toUpperCase());
  out.six = {};
  ["筋力", "耐久", "敏捷", "魔力", "幸運", "寶具"].forEach(k => { const v = String((build.six || {})[k] || "C").toUpperCase(); out.six[k] = okPlain(v) ? v : "C"; });
  const exK = Object.keys(out.six).filter(k => out.six[k] === "EX");
  if (exK.length > 2) exK.slice(2).forEach(k => out.six[k] = "A");
  out.npScale = (String(build.npScale) === "對軍") ? "對軍" : "對人";
  out.skills = (Array.isArray(build.skills) ? build.skills : []).filter(Boolean).slice(0, 4).map(s => {
    // 🛡️ 同上：hasOwnProperty才是真的白名單命中，避免"constructor"這類繼承鍵讓後面的FLAT_FX_[fx]查到Object建構子函式，把skillCost污染成字串，讓total>clsBudget的超預算擋失效(number>string比較會把字串轉NaN，NaN>x恆false)。
    const fx = Object.prototype.hasOwnProperty.call(ALLOWED_FX_, String(s && s.fx || "").trim()) ? String(s.fx).trim() : "";
    let r = String(s && s.r || "C").toUpperCase(); if (!/^(E|D|C|B|A)$/.test(r)) r = "C";
    return { n: String(s && s.n || "").replace(/[<>&"'`]/g, "").slice(0, 10) || "技能", r: r, fx: fx };
  });
  const cost = forgeCost_(out.six, out.skills, out.npScale); // 計價單一真實來源，見檔案上方 forgeCost_
  const slotFee = out.skills.length > 3 ? 20 : 0; // 🎰 第4欄啟用費(有第4個技能條目即收·純演出標籤也占欄，訊息文字用)
  const total = cost.total;
  const clsBudget = FORGE_BUDGET + (FORGE_CLS_BONUS_[out.cls] || 0);
  if (total > clsBudget) return { ok: false, message: `六圍 ${cost.spent}＋技能 ${cost.skillCost}${slotFee ? "(含第4欄+20)" : ""}＋規模「${out.npScale}」${cost.scaleCost ? `+${cost.scaleCost}` : "0"} ＝ ${total}，超過預算 ${clsBudget}${FORGE_CLS_BONUS_[out.cls] ? "(含狂化補正+" + FORGE_CLS_BONUS_[out.cls] + ")" : ""}——請調降六圍/技能階級或改對人規模。` };
  out.classSkills = FORGE_CLS_SKILLS_[out.cls] || [];
  out.npName = String(build.npName || "").replace(/[<>&"'`]/g, "").replace(/【常駐寶具】|對軍|對城|對界|對神/g, "").trim().slice(0, 20) || "無名寶具";
  out.npR = out.six["寶具"]; // 顯示階＝六圍寶具階(引擎本就只吃 six.寶具)
  out.npDesc = String(build.npDesc || "").replace(/【常駐寶具】|對軍|對城|對界|對神/g, "").replace(/[<>&"'`｜【】\n\r\t]/g, "").trim().slice(0, 40);
  out.weapon = _fClean(build.weapon, 30);
  out.ok = true;
  return out;
}

// 工房存檔（action="save_hero"：工房＝純製造/修改，不召喚）：create＝寫英靈殿新列(AI 補 persona/寶具英文名·蓋創造者印記)；edit(帶 heroId)＝僅創造者本人可改、真名不可改(識別鍵)、演出欄非空覆寫/空保留、寶具英文名沿用舊值。
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
  return JSON.stringify({ success: true, message: `「${data[idx][COL.HERO.NAME]}」已認領——現在你是這位英靈的創造者，可在工房修改。` });
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
    const oldCls = String(data[idx][COL.HERO.CLS] || "");
    const pb = parseForgeBuild_(build, oldCls);
    if (!pb.ok) return JSON.stringify({ success: false, message: pb.message });
    if (pb.cls === "御主" && oldCls !== "御主" && !userData.confirmMasterConvert) {
      return JSON.stringify({ success: false, needConfirmMasterConvert: true, message: `「${build.name}」目前是戰鬥職階「${oldCls}」——切換成「御主」會清空六圍／技能／寶具(不可逆，之後召喚都是純敘事款)，確定要這麼做嗎？` });
    }
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
    data[idx][COL.HERO.TRAITS] = JSON.stringify(pb.traits);
    const newWords = keep(pb.pref, pj.words), newLook = keep(pb.look, pj.look);
    const newFp = keep(pb.fp, pj.firstP) || "我", newSpeech = keep(pb.speech, pj.speech);
    data[idx][COL.HERO.PERSONA] = JSON.stringify({
      words: newWords, firstP: newFp, toMaster: keep(pb.toM, pj.toMaster),
      look: newLook, speech: newSpeech,
      tic: keep(pb.tic, pj.tic), back: keep(pb.back, pj.back), weapon: keep(pb.weapon, pj.weapon), creator: pj.creator
    });
    // 外貌/性格改了，先前快取的日常版本會跟新設定對不上——重新轉一次，不留舊資料。
    const dailyLookRes = translateLookToDaily_(build.name, pb.cls, newLook, newFp, newSpeech, pb.sex);
    data[idx][COL.HERO.DAILY_LOOK] = dailyLookRes.look;
    data[idx][COL.HERO.DAILY_OUTFIT] = dailyLookRes.outfit;
    data[idx][COL.HERO.DAILY_WORDS] = translatePersonalityToDaily_(build.name, pb.cls, newWords);
    data[idx][COL.HERO.DAILY_MOE] = '';   // 🚫 萌點退休：改鑄時一併洗掉舊值
    hs.getRange(idx + 1, 1, 1, data[idx].length).setValues([data[idx]]);
    try { CacheService.getScriptCache().remove("FATE_HERO_CODEX"); } catch (e) { }
    return JSON.stringify({ success: true, edited: true, message: `「${build.name}」的靈基已重鑄——之後召喚皆用新設定（已在場的分身不追改）。` });
  }

  // ── 🛠️ 製造模式 ──
  const pb = parseForgeBuild_(build, "");
  if (!pb.ok) return JSON.stringify({ success: false, message: pb.message });
  const dup = getHeroCodexCached().slice(1).find(r => String(r[COL.HERO.NAME]).trim() === pb.name);
  if (dup) return JSON.stringify({ success: false, message: `英靈殿已有「${pb.name}」——請換一個真名，或請其創造者修改。` });
  const isMasterCls = pb.cls === "御主";
  const _ogF = originGuide_(String(userData.origin || "").trim()); // 🎭 工房三分類→AI 補人格時的忠實度(技能名玩家自己打·此處只管演出補完)
  let flavor = null;
  try {
    flavor = JSON.parse(callGeminiAPI(
      `【真名】：${pb.name}\n【職階】：${pb.cls}\n【性別】：${pb.sex}\n【玩家描述】：${pb.desc || "無"}${pb.look ? `\n【外貌(${pb.lookFull ? "玩家已定·照抄勿改" : "玩家核心設定·擴寫成四短句·勿改本意"})】：${pb.look}` : ""}${pb.pref ? `\n【個性(${pb.prefFull ? "玩家已定·照抄勿改" : "玩家核心設定·擴寫成四短句·勿改本意"})】：${pb.pref}` : ""}${pb.fp ? `\n【自稱(玩家已定)】：${pb.fp}` : ""}${pb.speech ? `\n【口吻(玩家已定)】：${pb.speech}` : ""}${pb.back ? `\n【身世(玩家已定·照抄勿改)】：${pb.back}` : ""}${pb.weapon ? `\n【武裝(以此為準·勿依職階/原典改寫)】：${pb.weapon}` : ""}${isMasterCls ? "" : `\n【技能】：${pb.skills.map(s => s.n).join("、") || "無"}\n【寶具】：${pb.npName}${pb.npDesc ? `（${pb.npDesc}）` : ""}`}`,
      `你是《命運停駐之夜》的英靈人格編織者。玩家已親手定好一名${_ogF.pnote}${isMasterCls ? "御主(鑑賞限定·不參與戰鬥)" : "從者"}的設定，你【只】負責補完演出側寫${isMasterCls ? "" : "與寶具英文真名"}，【嚴禁】輸出任何數值/階級/技能設定。★【語言】除${isMasterCls ? "" : " npEn 欄與"} JSON 欄位名本身外，所有輸出內容一律使用繁體中文，不得夾雜英文或其他語言字母。玩家標「照抄勿改」的欄位原樣沿用；標「核心設定·擴寫」的欄位以玩家給的為靈魂擴寫、【嚴禁】偏離或覆蓋其本意。★${AURA_SPEC_}\n★personality【恰好4段】、look【恰好2段】，皆【只用頓號「、」分隔·絕對不要用句號「。」或半形句點·每段是簡短詞組非完整句子·限${TRAIT_SEG_HINT_}字內寫完·段內不再用頓號列舉】。★輸出合法 JSON、禁 Markdown：{"personality":"日常表象、真實內裡、喜歡的事物、討厭的事物（四短句頓號分隔）","look":"外貌兩短句頓號分隔（第一句五官髮色/身形/衣著印象，第二句是不含服裝字眼的氣質意象）","background":"生平一句·限20字","firstP":"台詞自稱(我/吾/俺/本王…·限4字)","toMaster":"對自己御主的態度(限20字)","speech":"口吻(限40字·如 古風敬語、句尾帶「呢」、簡短冷淡)","tic":"招牌小動作(限30字·具體可見的身體動作，不寫心情)"${isMasterCls ? "" : `,"npEn":"寶具的英文真名讀法(拉丁字母·如 Excalibur 風格·限4個單字)"`}}`,
      { temperature: 0.85, ignoreLaw: true }));
  } catch (e) { flavor = null; }
  // AI 補的演出欄位：玩家有填就用玩家的，沒填才拿這份（工房 UI 只剩一句描述，這幾格全靠 AI 從描述推）
  const _fv = (k, n) => String((flavor && flavor[k]) || "").replace(/[<>&"'`｜【】\n\r\t]/g, "").trim().slice(0, n);
  const fNpEn = String((flavor && flavor.npEn) || "").replace(/[^A-Za-z0-9 .'\-:]/g, "").trim().slice(0, 30);
  const np = isMasterCls ? "" : `${pb.npName}${fNpEn ? " " + fNpEn : ""}（${pb.npScale} ${pb.npR}）${pb.npDesc ? "·" + pb.npDesc : ""}`;
  const finalLook = pb.lookFull ? pb.look : (String((flavor && flavor.look) || "").trim() || pb.look);
  const finalPref = pb.prefFull ? pb.pref : (String((flavor && flavor.personality) || "").trim() || pb.pref);
  const back = pb.back || String((flavor && flavor.background) || "").slice(0, 28);
  let wasCreated;
  try {
    wasCreated = recordOriginalHero_(pb.name, pb.cls, pb.sex, JSON.stringify(pb.six), pb.classSkills, pb.skills, pb.traits, np, finalPref || "", pb.align,
      { look: finalLook, firstP: pb.fp || _fv('firstP', 4), toMaster: pb.toM || _fv('toMaster', 20),
        speech: pb.speech || _fv('speech', 40), tic: pb.tic || _fv('tic', 30), back: back, weapon: pb.weapon, creator: acct });
  } catch (e) { return JSON.stringify({ success: false, message: "寫入英靈殿失敗：" + e.message }); }
  if (!wasCreated) return JSON.stringify({ success: false, message: `「${pb.name}」剛被搶先鑄造同名英靈，請換一個真名再試一次。` });
  return JSON.stringify({ success: true, created: true, name: pb.name, message: `「${pb.name}」已鑄入英靈殿——到召喚頁「🌟 玩家原創英靈」即可召喚；之後想調整可在該區「✏️ 修改」（僅你本人）。` });
}

function actionSummonServant(userData, pcId, sheets) {
  const VALID_CLS = ["Saber", "Archer", "Lancer", "Rider", "Caster", "Assassin", "Berserker"];
  const reqCls = VALID_CLS.includes(userData.cls) ? userData.cls : "";
  const heroId = String(userData.heroId || "").trim();
  const trueName = String(userData.trueName || "").trim().slice(0, 20);
  const custDesc = String(userData.desc || "").replace(/[<>&"'`｜【】]/g, "").trim().slice(0, 120); // 自訂描述生成原創從者
  const origin = String(userData.origin || "").trim(); // 🎭 自訂生成三分類：fate/anime/original(空=original)

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
    const hrows = getHeroCodexCached().slice(1).filter(r => r[COL.HERO.ID] && String(r[COL.HERO.CLS]) !== "御主");
    if (hrows.length) {
      if (heroId) {
        hero = hrows.find(r => String(r[COL.HERO.ID]) === heroId);
      } else if (trueName) {
        const _nameMatches = hrows.filter(r => String(r[COL.HERO.NAME]).includes(trueName) || trueName.includes(String(r[COL.HERO.NAME])));
        hero = (reqCls && _nameMatches.find(r => String(r[COL.HERO.CLS]) === reqCls)) || _nameMatches[0] || null;
      } else {
        // 🎲 隨機召喚：排除【這一局在場的】那組正典英靈——選第五次就不會搶第五次的人（見 CODE_NOTES）。
        const _taken = {};
        (warName === '4th' ? FATE_4TH_ROSTER : warName === '5th' ? FATE_5TH_ROSTER : []).forEach(r => { if (r && r.hero) _taken[String(r.hero)] = 1; });
        let pool = hrows.filter(r => !_taken[String(r[COL.HERO.ID])]);
        if (reqCls) pool = pool.filter(r => String(r[COL.HERO.CLS]) === reqCls);
        // 🧱 空池防呆：排除＋職階兩道篩下來可能一個不剩，退回不排除再抽——寧可跟敵陣撞同一位
        //    (既有的 playerServantName 機制會把敵方那組換掉)，也不要讓召喚整條路無聲失敗。
        if (!pool.length) pool = reqCls ? hrows.filter(r => String(r[COL.HERO.CLS]) === reqCls) : hrows;
        if (pool.length) hero = pool[Math.floor(Math.random() * pool.length)];
      }
    }
  } catch (e) { hero = null; }
  if (custDesc) hero = null; // 自訂描述 → 強制走 AI 生成原創，不抓名冊
  // 工房＝純「製造/修改」寫英靈殿(save_hero)，不再直接召喚——做好的原創英靈到召喚頁「🌟 玩家原創」

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
      const traitsParsed = JSON.parse(hero[COL.HERO.TRAITS] || "[]");
      const traits = Array.isArray(traitsParsed) ? traitsParsed : [];
      const persona = JSON.parse(hero[COL.HERO.PERSONA] || "{}");

      // 從者血厚：耐久越高越肉。🔋 出力電池制：從者無自有魔力池(MP欄置0)，靠御主供魔；出力檔存 MEMORY、預設 60 巡航。
      const svHp = servantMaxHp_(svNum_(six.耐久), classSkills.concat(skills)), svMp = 0;

      // 🎴 五圍已棄欄：戰鬥吃六圍 SIX，不再寫數值。
      row[COL.PC.HP] = svHp; row[COL.PC.MP] = svMp; row[COL.PC.MAX_HP] = svHp; row[COL.PC.MAX_MP] = svMp;
      row[COL.PC.TRAIT] = parseTraitsHelper(looksToTraitParts_(persona.look), "外貌出眾、舉止從容", TRAIT_SLOTS_);
      let svPref = String(persona.words || "").replace(/・/g, "、");
      let svBack = persona.back ? String(persona.back).slice(0, 28) : `${cls}・${realName}`;
      svPref = enrichPersonalityLikesDislikes_(realName, cls, svPref);
      row[COL.PC.PREF] = parseTraitsHelper(svPref, "沉著表象、堅定內裡、珍視之物、厭惡之事");
      row[COL.PC.MEMORY] = stampPersonaFlavor_(`第一人稱「${persona.firstP || "我"}」｜對御主：${persona.toMaster || "保持距離"}`, persona.speech, persona.tic);
      if (persona.weapon) row[COL.PC.MEMORY] = setWeapon_(row[COL.PC.MEMORY], persona.weapon); // ⚔️ 工房原創的自定武裝·重召不掉
      row[COL.PC.SIX] = JSON.stringify(six);
      row[COL.PC.TAGS] = JSON.stringify({ skills: tagSkillKind_(classSkills, 'class').concat(tagSkillKind_(skills, 'skill')), traits: traits });
      var ghSkill = classSkills.concat(skills).find(function (s) { return s && s.fx === 'god_hand'; });
      if (ghSkill) {
        var ghLives = (ghSkill.lives != null) ? ghSkill.lives : (String(hero[COL.HERO.SOURCE]) === 'ai_gen' ? 3 : null);
        if (ghLives != null) row[COL.PC.MEMORY] += '｜【試煉】' + ghLives;
      }
      row[COL.PC.BACK] = svBack;
    } else {
      // 🌀 名冊查無 → AI 即時生成「第一級從者」：含真實六圍階級＋帶 fx 的技能（吃得到標籤）🎭 自訂描述且玩家未指定職階(reqCls空)→職階交給 AI 依描述判斷，不再死綁 Saber。
      const clsUnset = !reqCls && !!custDesc;
      cls = reqCls || (clsUnset ? "" : "Saber");
      const _og = originGuide_(origin); // 🎭 三分類→角色框定＋技能命名(僅自訂描述路徑生效)
      const sysOverride = `你是《命運停駐之夜》的英靈召喚核心。玩家御主召喚出一名「從者（Servant）」${clsUnset ? "" : `，職階為「${cls}」`}。${custDesc ? _og.frame : (trueName ? `指定真名為「${trueName}」，請忠於該英靈的傳說與性格（可跨作品：動漫／遊戲／神話／歷史皆可）。` : "請挑選一位契合此職階、知名的歷史或傳說英靈。")}

★【語言】除 JSON 欄位名本身與 cls 職階代碼(如 Saber/Archer)這類系統代碼外，所有輸出內容(真名/技能招式名/背景/性格/外貌等)一律使用繁體中文，不得夾雜英文或其他語言字母；玩家描述若含英文人名/詞彙，請意譯或音譯成中文寫入，不要原樣照抄英文。
${clsUnset ? "★【職階 cls】玩家未指定職階——請依描述判斷最契合的職階，從 Saber(劍)/Archer(弓)/Lancer(槍)/Rider(騎乘)/Caster(魔術)/Assassin(暗殺)/Berserker(狂化) 擇一填入 JSON 的 \"cls\" 欄(填英文全名)。\n" : ""}★【六圍 six】筋力/耐久/敏捷/魔力/幸運/寶具各給一階(E~EX，可加 +)，有強有弱、貼合傳說。這是足以角逐聖杯的英靈，別因為原創或跨作品就保守低估：至少兩項 A 以上、寶具階通常 B 以上(純輔助型除外)，幸運可以是唯一明顯偏弱的一項。狂化者直接填【狂化後】的數值(狂化傷害加成由系統另計，別再自行灌水)，筋力或耐久該有一項衝到 A 以上。
★【技能帶 fx】skills(固有技能 2~3 個)，每個含 {"n":"技能名","r":"階級","fx":"效果碼"}。職階慣例技能(如 Saber/Lancer/Archer 的對魔力、Rider 的騎乘、Caster 的陣地/道具作成、Assassin 的氣息遮斷、Berserker 的狂化)由系統依職階自動附贈，這裡【不需要你生成】、專心給這名英靈"個人"的招牌技能就好。
★【技能命名】n 是【顯示名】、fx 才是機制(兩者脫鉤)。${custDesc ? _og.skill : '★技能名忠於該角色原著既有的招式/技能名(對魔力／直感／庫夫林「蓋・波爾克」…)，直接沿用勿重編亂加花名。'}
${FX_MENU_}
★【特性 traits】1~3 個，{"n":"特性名"}（如 王/龍/人類/神性/巨人/猛獸；有神性者會被神殺剋）。
★【演出而非說明】personality 與寶具只作底層，勿直接複述字面。personality 剛好 4 短句頓號分隔、每句限${TRAIT_SEG_HINT_}字內寫完：日常表象、真實內裡、喜歡的事物、討厭的事物。
★【外貌 look】剛好 2 短句頓號分隔，依序為[外貌本相(髮色/瞳色/五官/體態等，不含服裝；若為女性：外貌段要具體寫到身形與胸部，用自然敘述句(如「胸前豐盈」「身形纖瘦」)，不要「巨乳」這種孤立標籤——這句玩家看得到)]、[氣質]。${AURA_SPEC_}
★np：寶具名＋一句威能簡述；規模上限【對軍】——對城/對界/對神為種子英靈專屬，寫了也會被系統降為對軍，簡述請勿誇稱斬城滅界。★sex 從 男／女／異 擇一。

★【輸出】合法 JSON、禁 Markdown：
{"realName":"英靈真名",${clsUnset ? '"cls":"Saber",' : ""}"sex":"男/女/異 擇一","align":"如 混沌・善","background":"限20字","personality":"四格頓號","look":"兩格頓號(每句限${TRAIT_SEG_HINT_}字)","np":"寶具名（簡述）","six":{"筋力":"B","耐久":"C","敏捷":"A","魔力":"D","幸運":"C","寶具":"B"},"skills":[{"n":"自取的招式名","r":"A","fx":"對應效果碼"},{"n":"自取的招式名","r":"B","fx":"對應效果碼"}],"traits":[{"n":"人類"}]}`;
      const aiBrief = JSON.parse(callGeminiAPI(`【職階】：${clsUnset ? "未指定(請依描述判斷)" : cls}\n【御主】：${pcName}${trueName ? `\n【指定真名】：${trueName}` : ""}${custDesc ? `\n【玩家自訂描述】：${custDesc}` : ""}`, sysOverride, { temperature: custDesc ? 0.85 : 0.6, ignoreLaw: true }));
      if (!aiBrief || !aiBrief.realName || !aiBrief.six) {
        return JSON.stringify({ success: false, message: "英靈之座的迴響斷了，召喚沒有成功。稍後再試一次。" });
      }
      if (clsUnset) cls = VALID_CLS.includes(String(aiBrief.cls)) ? String(aiBrief.cls) : "Saber"; // AI 依描述判斷的職階；非法值才退回 Saber
      realName = String(aiBrief.realName || trueName || (cls + "從者")).replace(/[<>&"'`]/g, "").trim().slice(0, 20) || (cls + "從者");
      sex = ["男", "女", "異"].includes(String(aiBrief.sex)) ? String(aiBrief.sex) : "異";
      align = ALIGNS_.includes(String(aiBrief.align)) ? String(aiBrief.align) : "中立";
      np = aiBrief.np || "寶具（未顯現）";
      // npAtkScale_ 讀 np 字串關鍵字算規模——AI 自訂寶具最高「對軍」，對城/對界/對神為種子專屬(堵字串後門)。
      np = String(np).replace(/[<>&"'`]/g, "").replace(/對界|對城|對神/g, "對軍").replace(/【常駐寶具】/g, "").slice(0, 80);
      const aiSix = sanitizeSix_(aiBrief.six);
      const aiCSkills = FORGE_CLS_SKILLS_[cls] || [];
      const aiSkills = sanitizeSkills_(aiBrief.skills, 3);       // prompt 要求 2~3 個
      bumpSixToFloor_(aiSix, aiSkills, /對軍/.test(np) ? "對軍" : "對人");
      capSixToBudget_(aiSix, aiSkills, /對軍/.test(np) ? "對軍" : "對人", cls);
      const aiTraits = Array.isArray(aiBrief.traits) ? aiBrief.traits.filter(Boolean).slice(0, 4).map(t => ({ n: String((t && (t.n || t.名稱 || t.name)) || t).replace(/[<>&"'`]/g, "").slice(0, 8) })) : [];
      const svHp = servantMaxHp_(svNum_(aiSix.耐久), aiCSkills.concat(aiSkills)), svMp = 0; // 🔋 出力電池制：從者無自有魔力池，出力檔存 MEMORY、預設 60 巡航
      // 🎴 五圍已棄欄：戰鬥吃六圍 SIX，不再寫數值。
      row[COL.PC.HP] = svHp; row[COL.PC.MP] = svMp; row[COL.PC.MAX_HP] = svHp; row[COL.PC.MAX_MP] = svMp;
      row[COL.PC.TRAIT] = parseTraitsHelper(aiBrief.look, "外貌出眾、舉止從容", TRAIT_SLOTS_);
      row[COL.PC.PREF] = parseTraitsHelper(aiBrief.personality, "沉著表象、堅定內裡、珍視之物、厭惡之事");
      row[COL.PC.MEMORY] = `第一人稱「我」｜對御主：初締約·尚在觀察`; // 與種子路徑對稱(原漏寫→servantCard_ 演出資訊變薄)
      row[COL.PC.SIX] = JSON.stringify(aiSix);
      row[COL.PC.TAGS] = JSON.stringify({ skills: tagSkillKind_(aiCSkills, 'class').concat(tagSkillKind_(aiSkills, 'skill')), traits: aiTraits });
      // 🕯️ 復活命數：AI 產物持 god_hand → 標【試煉】3(尼祿「三度輝映」基準)——預設 11 是赫拉克勒斯(seed)專屬。
      if (aiCSkills.concat(aiSkills).some(function (s) { return s && s.fx === 'god_hand'; })) {
        row[COL.PC.MEMORY] += '｜【試煉】3';
      }
      const svBackAi = aiBrief.background ? String(aiBrief.background).slice(0, 40) : `${cls} 職階的英靈`; // 補防呆上限，比照其他AI生成路徑
      row[COL.PC.BACK] = svBackAi;
      // 不重名的原創從者寫回英靈殿(含六圍/技能fx/特性)，日後可重用。
      try { recordOriginalHero_(realName, cls, sex, row[COL.PC.SIX], aiCSkills, aiSkills, aiTraits, np, aiBrief.personality, align, { back: svBackAi, look: String(aiBrief.look || "").replace(/[<>&"'`]/g, "").slice(0, 80), creator: String(userData.acctName || "").trim() }); } catch (e) { }
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
      `★描寫所在地的燈火與氛圍，聚焦御主與從者最初的試探、對話與張力（依上方角色背景內化演出，禁止複述設定字面、禁止用外貌代替名字）。場景留下懸念、讓玩家想以行動回應。\n` +
      `★禁止替御主做決定、禁止詢問玩家想做什麼、禁止介紹玩家自身身份、禁止新增任何地圖或NPC。`;
    return JSON.stringify({ success: true, servantName: realName, cls: cls, fromCodex: !!hero, summonPrompt: summonPrompt, message: `【聖杯】令咒迸發，${cls} 職階的從者「${realName}」應召而現，與『${pcName}』締結契約。其餘御主已在冬木各處備戰。` });
  } catch (e) {
    return JSON.stringify({ success: false, message: "召喚失敗：" + e.message });
  }
}

// ==========================================
// 🔵 御主／從者 標籤資料（左側狀態卡用）：只給動作姿勢/令咒/羈絆/寶具，不給六維
// ==========================================
