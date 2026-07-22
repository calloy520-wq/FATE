// ==========================================
// 🎴 Router_Creation.gs — 創角／召喚
//   御主創角(actionManualNpc)＋敘事非阻塞補生成(actionBackfillMasterAi)＋召喚從者(actionSummonServant)。
//   共用 GAS 全域作用域，與 Router_Action.gs 等其他檔互叫無礙。見 HANDBOOK.md §4.1 拆分慣例。
// ==========================================

function actionManualNpc(userData, pcId, sheets) {
  // 御主創角（action="create"）；從者召喚見 actionSummonServant。
  // 🛡️ 帳號重入防呆：此帳號若已連結一局活著的遊戲(charId 存在且非 DEAD_)，拒絕再建一次——
  //   否則 linkAccountToPc_ 會悄悄覆寫帳號的連結指標，把舊角色＋已召喚的從者孤兒化(英靈殿範本
  //   不受影響、但這局「進行中遊戲」從帳號視角消失，下次登入變成一場空的 needsSummon，玩家會以為
  //   角色跟從者憑空消失了)。合法流程(newGameFlow)本就會先呼叫 account_new_game 清連結才走到這裡，
  //   故此擋不影響正常開新局；只堵「create 被異常呼叫第二次」(連點/多分頁/重送)這個從無防護的洞。
  if (userData.account) {
    try {
      const acc = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("帳號");
      const found = acc && findAccountRow_(acc, String(userData.account).trim());
      const oldCharId = found ? String(found.row[COL.ACC.PC] || "") : "";
      if (oldCharId && sheets.pc.getDataRange().getValues().some(r => String(r[COL.PC.ID]) === oldCharId)) {
        return JSON.stringify({ success: false, message: "此帳號已有進行中的聖杯戰爭——請用「繼續遊戲」接續，或先在選單開新局清除舊檔。" });
      }
    } catch (e) { } // 檢查失敗不擋創角(優雅降級)，寧可放行也不要卡死正常玩家
  }
  const newId = "PC_" + Date.now();
  const { name, sex, identity, standing, wish, appearance, magic, circuits, origin, melee, magicRank } = userData;
  let finalName = name;
  const finalSex = sex;

  // 🔴 姓名已在 sanitizeUserData_ 清成純中文；若為空代表含非中文字元，直接擋下不寫表
  if (!finalName) {
    return JSON.stringify({ success: false, message: "名號僅限中文字，不可使用英文、數字或符號。" });
  }

  // 🔵 御主名號＝角色名。跨局撞名靠 game_id＋faction 分流無害，只需擋【正典角色名】——避免自創御主與
  //   被種入本局的同名正典敵手變雙胞胎（同局內按名字查會歧義）；想當正典角色請走「扮演正典御主」入口。
  //   兩側名字都須套 cleanChineseName 正規化再比對（canon 名可能含標點，sanitize 後的 finalName 不含）；
  //   SEED_SERVANTS 真名欄位是 `realName` 不是 `name`。
  const _canonMasterHit = typeof SEED_MASTERS !== 'undefined' && SEED_MASTERS.some(m => m && cleanChineseName(m.name) === finalName);
  const _canonServantHit = typeof SEED_SERVANTS !== 'undefined' && SEED_SERVANTS.some(s => s && cleanChineseName(s.realName) === finalName);
  // 扮演正典御主(playedMaster) 是合法路徑，須排除於撞名擋下之外；驗證 playedMaster 對應真名剛好等於
  //   finalName 才放行，避免夾帶不相干 playedMaster id 繞過保護。seedRivalsForGame_ 會排除你扮演的
  //   那位不再種成本局敵御主，故不會真的產生雙胞胎。
  const _playingThisCanon = userData.playedMaster && typeof SEED_MASTERS !== 'undefined'
    && SEED_MASTERS.some(m => m && String(m.id) === String(userData.playedMaster) && cleanChineseName(m.name) === finalName);
  if (_canonMasterHit && !_playingThisCanon) return JSON.stringify({ success: false, message: `「${finalName}」是聖杯戰爭中已知的御主——自創御主請另取名號；若想扮演此角，請用「扮演正典御主」入口。` });
  // 🐛→✅ 撞正典從者真名沒有「扮演」這條路(那個入口只列SEED_MASTERS)，訊息不該誤導去點一個
  //   死路——改成單純告知另取名號。
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

  // 開局非阻塞：create 不叫 AI，秒寫種子值進場；AI 生成的背景/特徵/個性/萌點由 actionBackfillMasterAi 背景補上。
  //   數值(HP/MP/game_id/MEMORY)全由 GAS 決定，故無 AI 也是結構完整、可直接開打的列。
  try {
    // 🎴 御主(凡人魔術師)初始數值：HP/MP 依魔術迴路(財力/身世決定)推算——御主是凡人，遠低於英靈從者。
    // 🐛→✅ masterMaxHpMp_ 本身已補上限，但這裡若直接把玩家原始輸入寫進 MEMORY【迴路】，之後
    //   masterPoolMax_ 是另外重新 parse 這個 MEMORY 字串(不會再走 masterMaxHpMp_)算共用魔力池——
    //   兩處不同步的話，上限形同虛設。改成算好同一個夾好範圍的值，兩處共用。
    const safeCircuits = circuits ? Math.max(12, Math.min(50, parseInt(circuits) || 30)) : null;
    const masterStats = masterMaxHpMp_(safeCircuits || 30);
    // 起始落點：確定性選一個有效冬木居所(偏好新都)，不需 AI；backfill 不動落點以免與移動競寫。
    const spawnName = validMapNames.find(n => /新都/.test(n)) || validMapNames[0];

    // 🛡️ 這幾格是玩家自由填寫的文字(sanitizeUserData_只截長度、不擋｜【】——那道清洗只鎖
    //   name/npcName等嚴格姓名欄位)，MEMORY是全欄位共用｜分隔的標記格式，比照setOutfit_/setWeapon_
    //   同款清洗，避免玩家文字裡剛好帶的｜【】把後面的【模式】【戰爭】【扮演】等系統標記截斷或偽造。
    // 🐛→✅ 稽核抓到：maxLen 原本沒帶，願望(wish)只靠前端#s-wish的maxlength=40擋，backend
    //   不設限——補上可選長度上限，願望套40跟前端一致，其餘(magic/origin等)是命運測定擲骰結果、
    //   非玩家自由輸入，維持不裁(避免誤傷合法roll值)。
    const cleanTagText_ = (s, maxLen) => { const v = String(s || "").replace(/[｜【】\n\r\t]/g, ""); return maxLen ? v.slice(0, maxLen) : v; };
    const pcColCount = Object.keys(COL.PC).length;
    const newRow = Array(pcColCount).fill("");
    newRow[COL.PC.ID] = newId; newRow[COL.PC.NAME] = finalName; newRow[COL.PC.SEX] = finalSex;
    // 🐛→✅ 稽核抓到(比照鑑賞actionEnterKanshou同款漏洞)：只靠前端#s-standing的maxlength=40擋，
    //   backend原本沒設長度上限——繞過前端能塞任意長度進BACK欄。補上跟前端一致的上限。
    newRow[COL.PC.BACK] = String(standing || identity || "來歷不明的魔術師").slice(0, 40); // 種子＝玩家輸入身世；backfill 會用 AI 潤成 20 字背景
    newRow[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "氣息平穩" });
    newRow[COL.PC.MEMORY] = [
      wish ? `【願望】${cleanTagText_(wish, 40)}` : "",
      magic ? `【魔術】${cleanTagText_(magic)}` : "",
      safeCircuits ? `【迴路】${cleanTagText_(safeCircuits)}` : "",
      origin ? `【出身】${cleanTagText_(origin)}` : "",
      melee ? `【體術】${cleanTagText_(melee)}` : "",
      magicRank ? `【魔術階位】${cleanTagText_(magicRank)}` : "",
      "【令咒】3",
      `【模式】${userData.warMode === 'chaos' ? 'chaos' : 'canon'}`,
      userData.warMode === 'chaos' ? "" : `【戰爭】${['4th', '5th'].indexOf(String(userData.war)) >= 0 ? userData.war : '5th'}`,
      // 🐛→✅ 舊版只看 userData.playedMaster 是否有值，沒有同步要求上面第43-44行驗證過的
      //   _playingThisCanon(playedMaster id 對應真名須等於 finalName)——玩家選了扮演正典御主、
      //   隨後把姓名欄改成任意原創名再送出，仍會殘留【扮演】標記，讓 seedRivalsForGame_ 誤將
      //   該正典御主整組從本局敵人名單移除，等於免費刪掉一組對手。改成與撞名檢查共用同一個判準。
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

// 御主敘事非阻塞補生成：create 已用種子值秒建御主；此處於「召喚從者頁」背景叫 AI 補背景/特徵/個性/萌點，
//   只用單格 setValue 更新敘事欄(不整列 write-back，避免與玩家動作競寫)；失敗則保留種子預設。數值欄一律不碰。
function actionBackfillMasterAi(userData, pcId, sheets) {
  const pcData = sheets.pc.getDataRange().getValues();
  const pIdx = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  const row = pcData[pIdx];
  const finalName = String(row[COL.PC.NAME] || ""), finalSex = String(row[COL.PC.SEX] || "異");
  // 🐛→✅ 稽核抓到(比照鑑賞actionBackfillKanshouAi同款漏洞)：這幾欄餵進AI提示詞前也從沒設過長度
  //   上限，只靠前端擋，補上跟對應輸入框maxlength一致的上限(appearance30/standing・wish40)。
  const appearance = String(userData.appearance || "").slice(0, 30), standing = String(userData.standing || "").slice(0, 40);
  const wish = String(userData.wish || "").slice(0, 40), magic = String(userData.magic || ""), origin = String(userData.origin || "");

  // getMapDataCached 直接讀 FATE_MAP_SEED 常數(零 I/O、恆非空)，不必靠 sheets.map 是否存在來決定要不要退回保底地名。
  const validMapNames = getMapDataCached(sheets).slice(1).map(r => String(r[COL.MAP.NAME]).trim()).filter(n => n !== "" && !n.includes('-'));

  const promptStr = `【御主】：名號『${finalName}』，性別『${finalSex}』\n【外貌】：${appearance || "隨機"}\n【身世／財力】：${standing || "隨機"}\n【願望】：${wish || "隨機"}\n【魔術系統】：${magic || "隨機"}\n【出身】：${origin || "隨機"}`;

  const MASTER_GEN_SYS = `你是《命運停駐之夜》聖杯戰爭的角色生成核心，為玩家建立一位「御主（Master）」——參與第五次聖杯戰爭的現代魔術師，舞台是冬木市。請依玩家提供的姓名、性別、身世／財力、願望，生成合理且具戲劇張力的設定。

★【語言】全程使用繁體中文，所有輸出內容(含技能招式名、外號、修飾詞)一律不得夾雜英文或其他語言字母；玩家描述若含英文人名/詞彙，請意譯或音譯成中文寫入，不要原樣照抄英文。
★【演出而非說明】願望與身世只作為設定底層，不要在 background 裡直接複述願望字面。
★【四格·格式鐵律】traits 與 personality 各【恰好4段】，只用頓號「、」分隔成4段，【絕對不要用句號「。」或半形句點】，每段是一個【簡短詞組】(不是完整句子)，每段內部也【不要】再用頓號列舉多項；禁數字標籤。
- traits：外貌、氣質舉止、自稱與口氣(第一人稱·如 我/俺/吾＋說話語氣，如 自稱「吾」・睥睨王者腔)、卸下心防的私密一面。${finalSex === '女' ? '外貌段務必包含身形/胸部具體描寫，但要寫成自然的敘述句(如「胸前豐盈」「身形纖瘦」)、不要用「巨乳」這類生硬孤立的分類標籤直接呈現——這句話會顯示在玩家看得到的狀態欄位；「豐滿」單獨出現不夠明確，須明確扣連到胸部，不要只寫髮色瞳色就交差。' : ''}
- personality：日常表象、真實內裡、喜歡的事物、討厭的事物
★npc_intent：一句【簡短】萌點（讓人喜歡上這位御主的特色，≤18字，系統會在30字處硬性截斷、務必精簡），結合此御主身分性格，要可愛、獨特——形式不拘，可以是反差(表面X其實Y)，也可以是單純討喜的外觀/行為/習慣特色，不強求一定要寫成反差句型。務必寫完整一句話，不可斷在句意未完處。【禁】誤用聖杯戰爭機制專有詞(令咒/寶具/魔術迴路/從者/職階等)當裝飾性魔法元素湊萌點——這些詞在本作有精確機制意義(如令咒是對從者下達絕對命令的珍貴道具，不是隨手用來做家事雜活的萬用法寶)，情節上真的合理相關才能出現；請改用生活化情境(手作/習慣/小癖好等)。
★background：限20字，呼應其身世／財力，禁出現具體物品名。
★【勿輸出數值】戰力數值、HP/MP 一律由系統裁定，prompt【不要】輸出任何數值欄位；也不要輸出地點。

★【輸出】合法 JSON、禁 Markdown：
{"background":"限20字","traits":"四格頓號字串","personality":"四格頓號字串","npc_intent":"結合御主身分的獨特可愛萌點(不限反差)，一句話"}`;

  try {
    // 🔴 ignoreLaw: true，把節慶跟天氣隔絕在創建室外
    const aiBrief = JSON.parse(callGeminiAPI(promptStr, MASTER_GEN_SYS, { temperature: 0.6, ignoreLaw: true }));
    // backfill 豁免寫入鎖，pIdx 是 AI 呼叫前的列索引——期間若清殘列刪列會位移；寫回前重新以 ID 定位，列已被刪則放棄寫入。
    const wIdx = buildLiveIdIndex_(sheets.pc)[String(pcId)];
    if (wIdx === undefined) return JSON.stringify({ success: false, message: "御主列已不存在（可能剛被清理）。" });
    // 單格寫回(不整列)：只覆蓋敘事欄，且僅在 AI 有給值時；數值/MEMORY/位置一律不碰。
    if (aiBrief.background) sheets.pc.getRange(wIdx + 1, COL.PC.BACK + 1).setValue(String(aiBrief.background).slice(0, 40));
    if (aiBrief.traits) sheets.pc.getRange(wIdx + 1, COL.PC.TRAIT + 1).setValue(parseTraitsHelper(aiBrief.traits, row[COL.PC.TRAIT]));
    if (aiBrief.personality) sheets.pc.getRange(wIdx + 1, COL.PC.PREF + 1).setValue(parseTraitsHelper(aiBrief.personality, row[COL.PC.PREF]));
    // slice(0,18) 對一句話太緊，AI 稍微超字數就被砍在句意中間；放寬緩衝(比照 Gallery.gs actionBackfillKanshouAi)。
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
        let six = {}, sk = [], tr = []; try { six = JSON.parse(r[COL.HERO.SIX] || "{}"); } catch (e) { } try { sk = JSON.parse(r[COL.HERO.SKILLS] || "[]"); } catch (e) { } try { tr = JSON.parse(r[COL.HERO.TRAITS] || "[]"); } catch (e) { }
        h.detail = { six: six, skills: sk, align: String(r[COL.HERO.ALIGN] || "中立"),
          traits: (Array.isArray(tr) ? tr : []).map(t => String((t && t.n) || t)).join("、"), // 編輯預填用：陣列→頓號字串，比照 cf-traits 輸入格式
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
  // 施放技術/命中/防禦/對人放大——中階以下，拉高自訂從者上限、不含頂級概念寶具
  aim: 1, projection: 1, fast_cast: 1, crafting: 1, petrify: 1, shapeshift: 1,
  solo: 1, weapon_steal: 1, rho_aias: 1, territory: 1, wall_def: 1, zabaniya: 1, regen: 1,
  // divine_core(神核) 已拔除工房開放——理由與 ea/王之財寶/UBW/海怪/天之鎖/黃金律 等頂級機制相同：
  //   凡人不該持有的機制，漲價解決不了(有預算照樣買得到)，故收為種子專屬。
  divine: 1, // 神性(帶階級，比 trait 名判定精準)——引擎中主要是弱點(被神殺/天之鎖剋)，濫用價值低
  agile_striker: 1, // 以巧破力：以敏捷為傷害底(敏高於筋/魔時)，敏捷輸出流唯一通道。顯示名勿用「神速」——與 first_strike(先機) 正史技能撞名
  // 三項於互鬥測試中補上以填補剋制缺口：
  sense: 1,    // 氣息感知(恩奇都同款)：階級≥對方氣息遮斷→看穿奇襲。刺客流的天然反制。
  god_slay: 1, // 神殺(斯卡哈同款)：對神性之敵×1.17~2.0(依對方神格·binary→固定25)。counter-pick 剋神核/神裔。
  lovespot: 1  // 愛之痣(迪盧木多同款)：敵命中-1(微量風味·固定5)。
};
var FX_MENU_ = "【可用技能效果碼 fx】挑契合此英靈的，沒對應就填空字串\"\"（頂級概念寶具 乖離劍/王之財寶/無限劍製/神核 等為種子專屬、不在此清單）。★左側名稱只是該 fx 的『語意參考』，不是強制顯示名——顯示名 n 你可另取【貼合這名英靈的獨特招式名】(像寶具那樣有個性)：" +
  "對魔力=nullify_magic、直感=first_strike、心眼=analyze、千里眼=aim、怪力=str_up、魔力放出=burst、投影魔術=projection、" +
  "高速詠唱=fast_cast、道具作成=crafting、騎乘=ride、氣息遮斷=stealth、變化(迴避+)=shapeshift、避矢=evade_ranged、" +
  "戰鬥續行=survive、單獨行動=solo、七天盾(對寶具展開·投影減傷·御主耗魔)=rho_aias、陣地作成(減傷)=territory、城牆防禦(物理減傷)=wall_def、" +
  "狂化=mad、勇猛/卡里斯瑪=morale、神代魔術=divine_age、無欲(封先機)=unreadable、透化(免威壓)=clear_mind、" +
  "自我改造(命中傷害+)=self_mod、軍略(寶具+)=tactics、風王鐵鎚(傷+)=wind_strike、魔眼(石化)=petrify、必中槍=gae_bolg、" +
  "秘劍燕返(每場首回合強化)=tsubame、妄想心音(暗殺致命)=zabaniya、無毀湖光(對龍+)=weapon_steal、治癒(每回合回血)=regen、不死復活(復活3次·如尼祿三度輝映)=god_hand、" +
  "破魔(無視神核/續行)=anti_magic_lance、破戒(斬契約救贖)=rule_breaker、神性(神裔·會被神殺剋)=divine、以巧破力(以敏捷為傷害底)=agile_striker、" +
  "氣息感知(看穿奇襲)=sense、神殺(剋神性之敵)=god_slay、愛之痣(魅惑·敵命中-1)=lovespot";

// 🎭 創角「來源三分類」(origin)→ 角色框定 frame ＋ 技能命名規則 skill。玩家在召喚/工房明講，不靠 AI 猜。
//   fate=Fate 正史角色(忠正史招式名)／anime=其他動漫畫遊戲知名角色(取角色招牌招式名)／original=完全原創(自取花名)。
//   空/未知＝original(維持舊行為·當原創處理)。自訂生成用 frame+skill；工房只用 frame(技能名玩家自己打)。
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
//   r 階級與 sanitizeSix_ 同一套驗證(承認 A++/B−)。maxCount 由呼叫端傳真實預算上限(classSkills 1~2/
//   skills 2~3)，不共用同一個寬鬆值，避免 AI 吐出兩倍於預算的技能數量。
function sanitizeSkills_(arr, maxCount) {
  if (!Array.isArray(arr)) return [];
  // 🐛→✅ 舊版連 EX、連帶 +/++/− 修飾符都放行，但 forgeCost_ 的計價表(SKILL_PTS_/_BIG_/_SMALL_/
  //   FLAT_FX_)只有 E/D/C/B/A 五個裸階級鍵，EX 或帶修飾符的階級一律落到 `||15` 預設分——比B階(20)/
  //   A階(25)還便宜，卻套用真正EX(60點)的戰鬥威力，形同同時放寬驗證又算價算錯。改成比照工房
  //   parseForgeBuild_ 對技能階級的精確驗證集合(只認裸 E/D/C/B/A)，不在此集合內一律退回 C。
  var okR = function (v) { return /^(E|D|C|B|A)$/.test(v); };
  return arr.filter(Boolean).slice(0, maxCount || 5).map(function (s) {
    var fx = String((s && (s.fx || s.效果碼)) || "").trim();
    var r = String((s && (s.r || s.階級 || s.rank)) || "C").toUpperCase().trim();
    return {
      // 🐛→✅ 補 HTML 斷字字元清洗，比照工房 parseForgeBuild_ 對應的技能名稱清洗規則——這是 AI 生成
      //   從者(actionSummonServant)唯一經過的技能清洗函式，產出的名稱會永久寫進英靈殿並顯示在戰鬥UI。
      n: String((s && (s.n || s.名稱 || s.name)) || "技能").replace(/[<>&"'`]/g, "").slice(0, 10) || "技能",
      r: okR(r) ? r : "C",
      // 🛡️ ALLOWED_FX_是純物件字面量，truthy查詢會被Object.prototype繼承的鍵(constructor/
      //   toString/valueOf等)污染成false positive——改用hasOwnProperty才是真的「在白名單裡」。
      fx: Object.prototype.hasOwnProperty.call(ALLOWED_FX_, fx) ? fx : ""
    };
  });
}
// 🏷️ 技能來源標記：寫入 TAGS 前把 classSkills/skills 分別打上 kind('class'/'skill')再合併——
//   四個寫入點(召喚 hero 分支/AI生成分支/種子英靈/敵方鋪陳)合併前都還是兩個分開的陣列，只是合併那刻
//   來源資訊就丟了；提早在這裡標記，前端卡片才能 100% 準確分「職階技能／固有技能」而非用 fx 代碼猜。
//   純顯示用欄位：hasFx_/fxName_ 只認 fx/r，多這個欄位不影響任何戰鬥判定。舊角色(合併時未標記)在前端
//   會退回 fx 代碼表猜測分類，見 Script.html 的 CLASS_SKILL_FX_HEUR_。
function tagSkillKind_(arr, kind) {
  return (Array.isArray(arr) ? arr : []).filter(Boolean).map(function (s) {
    return Object.assign({}, s, { kind: kind });
  });
}
// 清洗六圍：6 鍵齊全、階級合法（E~EX、可帶 +/++/−，承認 A++/B− ——AI 常自發吐 A++）；缺或亂給則補 C。
//   格式合法不代表強度合理：EX 級最多保留 2 項(比照種子最強者的分布，如吉爾伽美什寶具EX/理查一世敏捷EX)，
//   其餘超額降階為 A——否則 recordOriginalHero_ 會把全 EX 角色永久寫回英靈殿供重召，固化成長期破台角色。
function sanitizeSix_(o) {
  var keys = ["筋力", "耐久", "敏捷", "魔力", "幸運", "寶具"], out = {};
  var ok = function (v) { return /^(E|D|C|B|A|EX)(\+{1,2}|\-)?$/.test(String(v || "").toUpperCase()); };
  keys.forEach(function (k) { var v = o && o[k] ? String(o[k]).toUpperCase().trim() : "C"; out[k] = ok(v) ? v : "C"; });
  var exKeys = keys.filter(function (k) { return rankVal(out[k]) >= 60; });
  if (exKeys.length > 2) exKeys.slice(2).forEach(function (k) { out[k] = "A"; });
  return out;
}

// 把 AI 生成的原創從者寫回英靈殿（重名則不收；御主不適用此機制）。
//   選填 pExtra(工房玩家自定 look/moe/firstP/toMaster/speech/tic/back/weapon＋綁定用 creator)——不存的話重召時 persona 欄退回預設。
function recordOriginalHero_(name, cls, sex, sixJson, classSkills, skills, traits, np, personaWords, align, pExtra) {
  // 🛡️ 這是唯一寫進共用英靈殿的入口(手動工房已在parseForgeBuild_清過build.name，但AI輔助召喚
  //   path的realName可能只清過userData.trueName、AI自己回傳的aiBrief.realName未經任何清洗)——
  //   在單一真實來源補一道，兩條路徑都保證進表的名字不含HTML斷字字元。
  name = String(name || "").replace(/[<>&"'`]/g, "").trim();
  if (!name) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hs = ss.getSheetByName("英靈殿");
  if (!hs) return;
  var data = getHeroCodexCached();
  // 🐛→✅ 只查NAME不夠：部分種子英靈的id用去標點短名(如「庫丘林-Lancer」)、跟自己的realName
  //   (「庫·丘林」)不同——玩家指定的trueName若剛好是那個短名，NAME比對不會撞、但這裡組出的
  //   newId(name+"-"+cls)會跟種子id完全相同，下次CODEX_PERSONA_VER升級時upgradeCodexPersonas_
  //   會依id覆寫，把玩家原創英靈整列蓋成種子資料。補上id層級的查重。
  var newIdCandidate = name + "-" + String(cls || "").trim();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.HERO.NAME]).trim() === name) return; // 已有同名 → 不重複收錄
    if (String(data[i][COL.HERO.ID]).trim() === newIdCandidate) return; // id層級也擋(短名撞種子id)
  }
  var px = pExtra || {};
  var persona = JSON.stringify({
    words: String(personaWords || ""), firstP: String(px.firstP || "") || "我", toMaster: String(px.toMaster || ""),
    look: String(px.look || ""), moe: String(px.moe || ""), speech: String(px.speech || ""), tic: String(px.tic || ""), back: String(px.back || ""),
    // 🔑 creator＝編輯權限綁定(actionSaveHero edit 分支靠 pj.creator===acct 擋非本人)；weapon＝武裝敘述。
    //   兩者 edit 分支都會保留(line 497)、call site 也都有傳，create 當下卻漏寫→creator 恆空=沒人能改自己的角色、
    //   自訂生成的英靈也不綁製作者。補進 persona 這唯一寫入點，工房/自訂生成兩路一次到位。
    weapon: String(px.weapon || ""), creator: String(px.creator || "")
  });
  // 工房角色創造當下就順手轉好日常版(DAILY_LOOK/DAILY_WORDS)寫進英靈殿，跟種子英靈的懶惰快取
  //   (getOrComputeDailyHeroFields_)不同——之後第一次被召喚進鑑賞就直接有現成版本，不必等召喚當下才轉。
  //   萌點也同步轉換，避免 heroToKanshouRow_ 把戰時沉重萌點搬進沒打過聖杯戰爭的鑑賞世界。
  //   moe 需先算好才能當 hint 傳給 translateLookToDaily_，避免「私密一面」跟萌點撞成同一件事的兩種說法。
  var dailyMoe = translateMoeToDaily_(name, cls, String(px.moe || ""));
  // translateLookToDaily_ 一次呼叫同時產出四段式 look(外貌本相/氣質舉止/自稱與口氣/私密一面) 與獨立的 outfit(日常穿搭)。
  var dailyLookRes = translateLookToDaily_(name, cls, String(px.look || ""), String(px.firstP || ""), String(px.speech || ""), dailyMoe, sex);
  // 私密一面(dailyLook 第4段)先算好、當 hint 傳給性格生成，避免日常性格跟私密一面又講一次。
  var dailyWords = translatePersonalityToDaily_(name, cls, String(personaWords || ""), (String(dailyLookRes.look || "").split("、")[3] || ""));
  hs.appendRow([name + "-" + cls, cls, name, sex || "異", sixJson || "{}",
    JSON.stringify(classSkills || []), JSON.stringify(skills || []), JSON.stringify(traits || []),
    np || "", persona, align || "中立", "[]", "ai_gen", dailyLookRes.look, dailyWords, dailyMoe, dailyLookRes.outfit]);
  try { CacheService.getScriptCache().remove("FATE_HERO_CODEX"); } catch (e) { } // 種子表已變動→清快取，下次讀到新從者
}

// 陣營九宮格(單一真實來源)：秩序/中立/混沌 × 善/中庸/惡，"中立"(無修飾)是通用預設值。
//   工房(parseForgeBuild_)與 AI 生成從者(actionSummonServant)共用同一份白名單驗證。
var ALIGNS_ = ["秩序・善", "秩序・中庸", "秩序・惡", "中立・善", "中立", "中立・惡", "混沌・善", "混沌・中庸", "混沌・惡"];

// 💰 六圍/技能/規模 統一計價（單一真實來源：工房 parseForgeBuild_ 的預算上限檢查、AI 自訂從者的
//   下限保底 bumpSixToFloor_ 共用同一套算式，避免定價邏輯散落兩處各自為政）。skills 不含
//   classSkills——職階技能工房是白送的、不占錢包，AI 生成分支比照排除。
var SKILL_PTS_ = { E: 5, D: 10, C: 15, B: 20, A: 25 };
// 三軌計價：同組同價會讓大係數標籤嚴格支配小係數，故照引擎真實係數分軌——強效(如千里眼/高速詠唱)貴 1/3、
//   輕效(如騎乘/風王)便宜 1/3。前端鏡射 FORGE_SK_TRACK/FORGE_SK_PTS_*(Script_Onboarding.html，工房即時預算UI用)。
var SKILL_PTS_BIG_ = { E: 7, D: 13, C: 20, B: 27, A: 33 };
var SKILL_PTS_SMALL_ = { E: 3, D: 7, C: 10, B: 13, A: 17 };
var SKILL_TRACK_ = { aim: 1, petrify: 1, fast_cast: 1, divine_age: 1, territory: 1, ride: -1, wind_strike: -1, morale: -1 };
// 二元平價(引擎不讀購買階級，效果恆固定)：god_hand/survive/tsubame/zabaniya/gae_bolg/rule_breaker/
//   anti_magic_lance/agile_striker/weapon_steal/god_slay/lovespot/self_mod/tactics/projection。
var FLAT_FX_ = { god_hand: 25, survive: 25, tsubame: 60, zabaniya: 25, gae_bolg: 25, rule_breaker: 25, anti_magic_lance: 25, agile_striker: 25, weapon_steal: 25, god_slay: 25, lovespot: 5, self_mod: 15, tactics: 25, projection: 25 };
function forgeCost_(six, skills, npScale) {
  var spent = Object.keys(six).reduce(function (s, k) { return s + rankVal(six[k]); }, 0);
  var scaleCost = (npScale === "對軍") ? 20 : 0;
  var slotFee = skills.length > 3 ? 20 : 0;
  var skillCost = skills.reduce(function (s, k) { return s + (k.fx ? (FLAT_FX_[k.fx] ||
    (SKILL_TRACK_[k.fx] === 1 ? SKILL_PTS_BIG_ : SKILL_TRACK_[k.fx] === -1 ? SKILL_PTS_SMALL_ : SKILL_PTS_)[k.r] || 15) : 0); }, slotFee);
  return { spent: spent, scaleCost: scaleCost, skillCost: skillCost, total: spent + scaleCost + skillCost };
}

// 🌀 AI 自訂從者的六圍下限保底：對齊工房 FORGE_BUDGET(340)——AI 常自己抓不準力度，光靠 prompt 措辭
//   拜託「務必有強有弱」擋不住偶爾生出偏弱從者，這裡改成 GAS 硬性補強：算完低於下限就把最弱一項六圍
//   逐階往上補，直到達標或撞 EX≤2 上限(見 sanitizeSix_)為止。同樣不算職階技能(見上，工房也不算)。
var FORGE_FLOOR_ = 340;
// Berserker 職階附贈狂化C(傷+但命中/迴避−·不可關)是唯一負資產禮物，補正+30 拉平——工房與 AI
// 生成上限封頂共用同一份，不各自宣告(單一真實來源)。
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

// 🐛→✅ 舊版只擋「太弱」(bumpSixToFloor_)沒擋「太強」——工房 parseForgeBuild_ 超預算會直接
//   `return {ok:false,...}` 拒絕重填，但 AI 生成沒有「打回重填」的來回，若 AI 一開始就給出偏強
//   六圍+技能(prompt 明講「不得保守低估」很容易誘發)，完全沒有後續檢查會擋下，可無上限超出工房
//   任何職階都拿不到的預算天花板。改成比照 bumpSixToFloor_ 反向：超過上限就把最強一項六圍逐階
//   往下砍，直到達標或砍無可砍(全部已是 E)為止；上限比照 parseForgeBuild_ 的 clsBudget 概念，
//   共用 FORGE_CLS_BONUS_ 讓 Berserker 補正對稱。
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
//   規格：預算340·六圍+技能+規模同一錢包(EX≤2)＋技能≤4(前3免欄位費·第4欄+20·fx白名單·上限A·三軌計價·二元平價·燕返60)＋規模計價(對軍+20)＋
//   寶具名/描述剝高規模關鍵字＋正典名擋＋演出七欄清洗。回 {ok:false,message} 或 {ok:true,...欄位}。
function parseForgeBuild_(build, reqCls) {
  const VALID_CLS = ["Saber", "Archer", "Lancer", "Rider", "Caster", "Assassin", "Berserker"];
  const out = {};
  // 「御主」職階：鑑賞限定純敘事款(比照 Seed_Codex.gs 的3位canon御主)，不參與戰鬥——
  //   獨立於 VALID_CLS(七大從者職階)之外判斷，不吃 reqCls 的 Saber fallback。
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
  const _fClean = (v, n) => String(v || "").replace(/[｜【】\n\r\t]/g, "").trim().slice(0, n);
  out.fp = _fClean(build.fp, 4); out.toM = _fClean(build.toMaster, 20); out.speech = _fClean(build.speech, 40);
  out.tic = _fClean(build.tic, 30); out.moe = _fClean(build.moe, 18); out.back = _fClean(build.back, 28);
  out.align = ALIGNS_.includes(String(build.align)) ? String(build.align) : "中立";
  out.look = _fClean(build.look, 60); out.pref = _fClean(build.pref, 60);
  const _segs = v => v ? v.split(/[、,，]/).filter(Boolean).length : 0;
  out.lookFull = _segs(out.look) >= 3; out.prefFull = _segs(out.pref) >= 3;
  out.desc = String(build.desc || "").trim().slice(0, 120);
  // 🎭 特性(traits)：純敘事風味標籤(見 Script.html TRAIT_DESC)，不進 FORGE_BUDGET 計費、不驗白名單——
  //   玩家想捏其他作品角色(如「賽亞人」「人造人」)需要能自由發揮，比照 AI 生成分支(aiTraits)同一套
  //   清洗規則(頓號/逗號分段、上限4個、單則截8字)，讓工房手捏角色也能貼這類梗。
  // 🐛→✅ 補 HTML 斷字字元清洗——同一函式內技能名稱(out.skills)早有這道清洗，特性名稱漏了，
  //   兩者最終都會被 Script.html 的 pill()/showSkillDesc() 原樣拼進 <span> HTML 顯示。
  out.traits = String(build.traits || "").split(/[、,，]/).map(s => s.trim()).filter(Boolean).slice(0, 4).map(n => ({ n: n.replace(/[<>&"'`]/g, "").slice(0, 8) }));
  if (isMasterCls) {
    // 🌹 御主：六圍/技能/寶具/武裝全部略過驗證與計費，強制留空(鑑賞用不到、不進戰鬥引擎)。
    out.six = {}; out.skills = []; out.classSkills = [];
    out.npScale = "對人"; out.npName = ""; out.npR = ""; out.npDesc = ""; out.weapon = "";
    out.ok = true;
    return out;
  }
  // 預算 340＝種子中位數(點滿≈尼祿/美杜莎中堅)；強者種子(420~505·且握有工房買不到的概念 fx)仍明確在上。
  const FORGE_BUDGET = 340;
  // FORGE_CLS_BONUS_ 已上移為檔案級單一真實來源（與 AI 生成路徑 capSixToBudget_ 共用）：
  // Berserker 職階附贈狂化C(傷+但命中/迴避−·不可關)是唯一負資產禮物，同素體實測墊底——
  //   補正+30 拉平(+50 會反轉成最優職階，370 頂配狂戰實測後仍只是強力中堅，安全)。
  const okPlain = v => /^(E|D|C|B|A|EX)$/.test(String(v || "").toUpperCase());
  out.six = {};
  ["筋力", "耐久", "敏捷", "魔力", "幸運", "寶具"].forEach(k => { const v = String((build.six || {})[k] || "C").toUpperCase(); out.six[k] = okPlain(v) ? v : "C"; });
  const exK = Object.keys(out.six).filter(k => out.six[k] === "EX");
  if (exK.length > 2) exK.slice(2).forEach(k => out.six[k] = "A");
  out.npScale = (String(build.npScale) === "對軍") ? "對軍" : "對人";
  // 第4技能欄位費+20：預算才是真約束(逼六圍讓位)，疊加上限±8 讓多買的命中/迴避冗餘——
  //   最壞情況四技組合(83~85%)仍未超過三技頂點(93%)。
  out.skills = (Array.isArray(build.skills) ? build.skills : []).filter(Boolean).slice(0, 4).map(s => {
    // 🛡️ 同上：hasOwnProperty才是真的白名單命中，避免"constructor"這類繼承鍵讓後面的
    //   FLAT_FX_[fx]查到Object建構子函式，把skillCost污染成字串，讓total>clsBudget的
    //   超預算擋失效(number>string比較會把字串轉NaN，NaN>x恆false)。
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
  out.npName = String(build.npName || "").replace(/[<>&"'`]/g, "").replace(/【常駐寶具】|對城|對界|對神/g, "").trim().slice(0, 20) || "無名寶具";
  out.npR = out.six["寶具"]; // 顯示階＝六圍寶具階(引擎本就只吃 six.寶具)
  out.npDesc = String(build.npDesc || "").replace(/【常駐寶具】|對城|對界|對神/g, "").replace(/[｜【】\n\r\t]/g, "").trim().slice(0, 40);
  out.weapon = _fClean(build.weapon, 30);
  out.ok = true;
  return out;
}

// 工房存檔（action="save_hero"：工房＝純製造/修改，不召喚）：
//   create＝寫英靈殿新列(AI 補 persona/寶具英文名·蓋創造者印記)；edit(帶 heroId)＝僅創造者本人可改、
//   真名不可改(識別鍵)、演出欄非空覆寫/空保留、寶具英文名沿用舊值。改的是英靈殿【範本】——
//   之後召喚才生效，已在場的分身不追改(可用 DEV「套用最新平衡」同步)。
// 認領無主原創英靈（action="claim_hero"）：創造者印記功能上線前鑄的 ai_gen 英靈沒有 persona.creator，
//   「我的作品」不列、✏️ 不亮、誰都不能改——開放認領：無主者先到先得，已有主的不可搶。
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
    const oldCls = String(data[idx][COL.HERO.CLS] || "");
    const pb = parseForgeBuild_(build, oldCls);
    if (!pb.ok) return JSON.stringify({ success: false, message: pb.message });
    // 🐛→✅ 職階切成「御主」是破壞性動作(parseForgeBuild_對isMasterCls會直接清空六圍/技能/寶具，
    //   見上方註解)——原本改職階誤選到御主、直接存檔會無聲蓋掉戰鬥數值，且成功訊息完全沒提示這件事。
    //   非「御主→御主」的職階切換才需要二次確認，避免正常編輯(職階本來就沒變/本來就是御主)被多問一次。
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
    const newWords = keep(pb.pref, pj.words), newLook = keep(pb.look, pj.look), newMoe = keep(pb.moe, pj.moe);
    const newFp = keep(pb.fp, pj.firstP) || "我", newSpeech = keep(pb.speech, pj.speech);
    data[idx][COL.HERO.PERSONA] = JSON.stringify({
      words: newWords, firstP: newFp, toMaster: keep(pb.toM, pj.toMaster),
      look: newLook, moe: newMoe, speech: newSpeech,
      tic: keep(pb.tic, pj.tic), back: keep(pb.back, pj.back), weapon: keep(pb.weapon, pj.weapon), creator: pj.creator
    });
    // 外貌/性格改了，先前快取的日常版本會跟新設定對不上——重新轉一次，不留舊資料。
    //   translateLookToDaily_ 一次呼叫同時產出四段式 look 與獨立的 outfit；moe 需先算好才能當 hint 傳入，
    //   避免「私密一面」跟萌點撞成同一件事的兩種說法。
    const dailyMoeVal = translateMoeToDaily_(build.name, pb.cls, newMoe);
    const dailyLookRes = translateLookToDaily_(build.name, pb.cls, newLook, newFp, newSpeech, dailyMoeVal, pb.sex);
    data[idx][COL.HERO.DAILY_LOOK] = dailyLookRes.look;
    data[idx][COL.HERO.DAILY_OUTFIT] = dailyLookRes.outfit;
    data[idx][COL.HERO.DAILY_WORDS] = translatePersonalityToDaily_(build.name, pb.cls, newWords, (String(dailyLookRes.look || "").split("、")[3] || ""));
    data[idx][COL.HERO.DAILY_MOE] = dailyMoeVal;
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
  const _ogF = originGuide_(String(userData.origin || "").trim()); // 🎭 工房三分類→AI 補人格時的忠實度(技能名玩家自己打·此處只管演出補完)
  let flavor = null;
  try {
    flavor = JSON.parse(callGeminiAPI(
      `【真名】：${pb.name}\n【職階】：${pb.cls}\n【性別】：${pb.sex}\n【玩家描述】：${pb.desc || "無"}${pb.look ? `\n【外貌(${pb.lookFull ? "玩家已定·照抄勿改" : "玩家核心設定·擴寫成四短句·勿改本意"})】：${pb.look}` : ""}${pb.pref ? `\n【個性(${pb.prefFull ? "玩家已定·照抄勿改" : "玩家核心設定·擴寫成四短句·勿改本意"})】：${pb.pref}` : ""}${pb.fp ? `\n【自稱(玩家已定)】：${pb.fp}` : ""}${pb.speech ? `\n【口吻(玩家已定)】：${pb.speech}` : ""}${pb.moe ? `\n【萌點(玩家已定·照抄勿改)】：${pb.moe}` : ""}${pb.back ? `\n【身世(玩家已定·照抄勿改)】：${pb.back}` : ""}${pb.weapon ? `\n【武裝(以此為準·勿依職階/原典改寫)】：${pb.weapon}` : ""}${isMasterCls ? "" : `\n【技能】：${pb.skills.map(s => s.n).join("、") || "無"}\n【寶具】：${pb.npName}${pb.npDesc ? `（${pb.npDesc}）` : ""}`}`,
      `你是《命運停駐之夜》的英靈人格編織者。玩家已親手定好一名${_ogF.pnote}${isMasterCls ? "御主(鑑賞限定·不參與戰鬥)" : "從者"}的設定，你【只】負責補完演出側寫${isMasterCls ? "" : "與寶具英文真名"}，【嚴禁】輸出任何數值/階級/技能設定。★【語言】除${isMasterCls ? "" : " npEn 欄與"} JSON 欄位名本身外，所有輸出內容一律使用繁體中文，不得夾雜英文或其他語言字母。玩家標「照抄勿改」的欄位原樣沿用；標「核心設定·擴寫」的欄位以玩家給的為靈魂擴寫、【嚴禁】偏離或覆蓋其本意。★personality 與 look 皆【恰好4段·只用頓號「、」分隔·絕對不要用句號「。」或半形句點·每段是簡短詞組非完整句子·段內不再用頓號列舉】。★輸出合法 JSON、禁 Markdown：{"personality":"日常表象、真實內裡、喜歡的事物、討厭的事物（四短句頓號分隔）","look":"外貌四短句頓號分隔（五官髮色/身形/衣著印象，最後一句必須是不含服裝字眼的純氣質詞）","background":"生平一句·限20字","npc_intent":"一句萌點(不限反差)·限18字·務必寫完整一句話不可斷在句意未完處"${isMasterCls ? "" : `,"npEn":"寶具的英文真名讀法(拉丁字母·如 Excalibur 風格·限4個單字)"`}}`,
      { temperature: 0.85, ignoreLaw: true }));
  } catch (e) { flavor = null; }
  const fNpEn = String((flavor && flavor.npEn) || "").replace(/[^A-Za-z0-9 .'\-:]/g, "").trim().slice(0, 30);
  const np = isMasterCls ? "" : `${pb.npName}${fNpEn ? " " + fNpEn : ""}（${pb.npScale} ${pb.npR}）${pb.npDesc ? "·" + pb.npDesc : ""}`;
  const finalLook = pb.lookFull ? pb.look : (String((flavor && flavor.look) || "").trim() || pb.look);
  const finalPref = pb.prefFull ? pb.pref : (String((flavor && flavor.personality) || "").trim() || pb.pref);
  const moe = pb.moe || String((flavor && flavor.npc_intent) || "").slice(0, 30); // 比照 slice(0,18) 腰斬修正，放寬緩衝
  const back = pb.back || String((flavor && flavor.background) || "").slice(0, 28);
  try {
    recordOriginalHero_(pb.name, pb.cls, pb.sex, JSON.stringify(pb.six), pb.classSkills, pb.skills, pb.traits, np, finalPref || "", pb.align,
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
    // 英靈殿含「鑑賞限定」的正典御主(cls='御主')，只給鑑賞召喚用、沒有六圍/技能/寶具——若被 solo 召喚
    //   會產出殘缺從者。三條路徑(heroId 指定/真名比對/隨機)都共用這份 hrows，統一在源頭濾掉，不逐一補檢查。
    const hrows = getHeroCodexCached().slice(1).filter(r => r[COL.HERO.ID] && String(r[COL.HERO.CLS]) !== "御主");
    if (hrows.length) {
      if (heroId) {
        hero = hrows.find(r => String(r[COL.HERO.ID]) === heroId);
      } else if (trueName) {
        // 同真名可能有多職階列(如斯卡哈 Lancer/Assassin)——優先找真名比對到且職階match reqCls 的列，
        //   找不到才退回「不分職階、比對到第一個」(相容沒選職階/單職階版本的一般真名召喚)。
        const _nameMatches = hrows.filter(r => String(r[COL.HERO.NAME]).includes(trueName) || trueName.includes(String(r[COL.HERO.NAME])));
        hero = (reqCls && _nameMatches.find(r => String(r[COL.HERO.CLS]) === reqCls)) || _nameMatches[0] || null;
      } else {
        // 隨機召喚：全英靈殿(含玩家原創 ai_gen)均勻抽。
        let pool = reqCls ? hrows.filter(r => r[COL.HERO.CLS] === reqCls) : hrows;
        if (pool.length) hero = pool[Math.floor(Math.random() * pool.length)];
      }
    }
  } catch (e) { hero = null; }
  if (custDesc) hero = null; // 自訂描述 → 強制走 AI 生成原創，不抓名冊
  // 工房＝純「製造/修改」寫英靈殿(save_hero)，不再直接召喚——做好的原創英靈到召喚頁「🌟 玩家原創」
  //   專區點選召喚(走下方 hero 分支實體化)。

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
      // 特徵(4格敘事)直接讀寫死的種子 persona.look，穩定一致、不叫 AI 生——但 persona.look 是「N段外貌
      //   (含服裝)・・氣質詞」而非天然四格，用 looksToTraitParts_ 正確切分＋帶入 persona.firstP 當自稱。
      row[COL.PC.TRAIT] = parseTraitsHelper(looksToTraitParts_(persona.look, persona.firstP), "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面");
      // 種子英靈：直接用寫死的種子 persona，大部分欄位不叫 AI 重生，省 API、加速召喚(僅[喜歡]/[討厭]段數不足時
      //   才補呼叫一次)。口吻/小動作(persona.speech/tic)已由 stampPersonaFlavor_ 複製進 MEMORY，servantCard_ 直接讀列即可。
      let svPref = String(persona.words || "").replace(/・/g, "、");
      let svMoe = String(persona.moe || "").slice(0, 18);
      let svBack = persona.back ? String(persona.back).slice(0, 28) : `${cls}・${realName}`;
      // 種子 persona.words 幾乎只有2段，parseTraitsHelper 補滿4格時[喜歡]/[討厭]恆為「無」——召喚當下
      //   補一次 AI 讓從者也有真正的喜好/討厭。已經4段(罕見)則直接跳過、不多打 API。
      svPref = enrichPersonalityLikesDislikes_(realName, cls, svPref);
      row[COL.PC.PREF] = parseTraitsHelper(svPref, "沉著表象、堅定內裡、珍視之物、厭惡之事");
      row[COL.PC.MEMORY] = stampPersonaFlavor_(`第一人稱「${persona.firstP || "我"}」｜對御主：${persona.toMaster || "保持距離"}`, persona.speech, persona.tic);
      if (persona.weapon) row[COL.PC.MEMORY] = setWeapon_(row[COL.PC.MEMORY], persona.weapon); // ⚔️ 工房原創的自定武裝·重召不掉
      row[COL.PC.SIX] = JSON.stringify(six);
      row[COL.PC.TAGS] = JSON.stringify({ skills: tagSkillKind_(classSkills, 'class').concat(tagSkillKind_(skills, 'skill')), traits: traits });
      // 復活命數：god_hand 持有者優先讀技能物件自己的 lives(如尼祿 lives:3)；種子沒標時，ai_gen 給3(尼祿基準)，
      //   其餘靠 getGodHandLives_ 預設11(赫拉克勒斯十二試煉專屬)，別讓 AI 產物白拿。
      var ghSkill = classSkills.concat(skills).find(function (s) { return s && s.fx === 'god_hand'; });
      if (ghSkill) {
        var ghLives = (ghSkill.lives != null) ? ghSkill.lives : (String(hero[COL.HERO.SOURCE]) === 'ai_gen' ? 3 : null);
        if (ghLives != null) row[COL.PC.MEMORY] += '｜【試煉】' + ghLives;
      }
      row[COL.PC.INTENT] = svMoe;
      row[COL.PC.BACK] = svBack;
    } else {
      // 🌀 名冊查無 → AI 即時生成「第一級從者」：含真實六圍階級＋帶 fx 的技能（吃得到標籤）
      //   🎭 自訂描述且玩家未指定職階(reqCls空)→職階交給 AI 依描述判斷，不再死綁 Saber。
      //   舊版恆 cls=reqCls||"Saber"：沒特別選職階的自訂生成，無論描述寫什麼，職階永遠是 Saber
      //   (玩家回報「難怪我自創一堆Saber」)——描述完全無法影響職階，AI 也從未被要求挑選。
      const clsUnset = !reqCls && !!custDesc;
      cls = reqCls || (clsUnset ? "" : "Saber");
      const _og = originGuide_(origin); // 🎭 三分類→角色框定＋技能命名(僅自訂描述路徑生效)
      const sysOverride = `你是《命運停駐之夜》的英靈召喚核心。玩家御主召喚出一名「從者（Servant）」${clsUnset ? "" : `，職階為「${cls}」`}。${custDesc ? _og.frame : (trueName ? `指定真名為「${trueName}」，請忠於該英靈的傳說與性格（可跨作品：動漫／遊戲／神話／歷史皆可）。` : "請挑選一位契合此職階、知名的歷史或傳說英靈。")}

★【語言】除 JSON 欄位名本身與 cls 職階代碼(如 Saber/Archer)這類系統代碼外，所有輸出內容(真名/技能招式名/背景/性格/外貌/萌點等)一律使用繁體中文，不得夾雜英文或其他語言字母；玩家描述若含英文人名/詞彙，請意譯或音譯成中文寫入，不要原樣照抄英文。
${clsUnset ? "★【職階 cls】玩家未指定職階——請依描述判斷最契合的職階，從 Saber(劍)/Archer(弓)/Lancer(槍)/Rider(騎乘)/Caster(魔術)/Assassin(暗殺)/Berserker(狂化) 擇一填入 JSON 的 \"cls\" 欄(填英文全名)。\n" : ""}★【六圍 six】依該英靈強弱給「筋力/耐久/敏捷/魔力/幸運/寶具」各一個階級，階級用 E,D,C,B,A,EX（強處可加 + 如 A+）；務必有強有弱、貼合傳說。★英靈是被召喚上戰場、足以角逐聖杯的超凡存在——即使原型是原創或跨作品角色、非 Fate 正典人物，也【不得】因此保守低估：至少要有兩項達到 A(含)以上，寶具階通常 B 以上（除非設定本就是輔助/非戰鬥型），整體六圍不應弱於一名遠超常人的英雄。幸運可以是唯一明顯偏弱的一項(D甚至E皆屬正常)，但其餘項目別隨意壓到 C 以下。若為 Berserker 或持狂化(mad)者，六圍請直接填【狂化後】的數值（與官方參數表慣例一致；狂化的傷害加成由系統另計，勿再自行灌水）——狂化英靈的筋力／耐久理應反映狂化增幅，通常該有一項衝到 A 以上，別讓「狂化後」讀起來比普通職階還弱。
★【技能帶 fx】skills(固有技能 2~3 個)，每個含 {"n":"技能名","r":"階級","fx":"效果碼"}。職階慣例技能(如 Saber/Lancer/Archer 的對魔力、Rider 的騎乘、Caster 的陣地/道具作成、Assassin 的氣息遮斷、Berserker 的狂化)由系統依職階自動附贈，這裡【不需要你生成】、專心給這名英靈"個人"的招牌技能就好。
★【技能命名】n 是【顯示名】、fx 才是機制(兩者脫鉤)。${custDesc ? _og.skill : '★技能名忠於該角色原著既有的招式/技能名(對魔力／直感／庫夫林「蓋・波爾克」…)，直接沿用勿重編亂加花名。'}
${FX_MENU_}
★【特性 traits】1~3 個，{"n":"特性名"}（如 王/龍/人類/神性/巨人/猛獸；有神性者會被神殺剋）。
★【演出而非說明】personality 與寶具只作底層，勿直接複述字面。personality 剛好 4 短句頓號分隔：日常表象、真實內裡、喜歡的事物、討厭的事物。
★【外貌 look】剛好 4 短句頓號分隔，依序為[外貌本相(髮色/瞳色/五官/體態等，不含服裝；若判定此英靈為女性，務必包含身形/胸部具體描寫，但要寫成自然的敘述句(如「胸前豐盈」「身形纖瘦」)、不要用「巨乳」這類生硬孤立的分類標籤直接呈現——這句話會顯示在玩家看得到的狀態欄位；「豐滿」單獨出現不夠明確，須明確扣連到胸部，不要只寫髮色瞳色就交差)]、[氣質舉止]、[自稱與口氣(固定格式「自稱「X」，再接一句依其說話語氣寫成的口氣描述」)]、[卸下心防的私密一面(具體生活化的小動作，不可直述心情/動機)]。
★np：寶具名＋一句威能簡述；規模上限【對軍】——對城/對界/對神為種子英靈專屬，寫了也會被系統降為對軍，簡述請勿誇稱斬城滅界。★npc_intent：一句【簡短】萌點（讓人喜歡上這位英靈的特色，≤18字，系統會在30字處硬性截斷、務必精簡，務必寫完整一句話不可斷在句意未完處）——形式不拘，可以是反差(表面X其實Y)，也可以是單純討喜的外觀/行為/習慣特色，不強求一定要寫成反差句型。【禁】誤用令咒當裝飾性萌點元素——令咒是御主持有、對從者下達絕對命令的機制道具，並非從者自己所有或隨手就能用的萬用法寶；也不要單純重複寶具名稱湊字數，請改用生活化情境(手作/習慣/小癖好等)。★sex 從 男／女／異 擇一。

★【輸出】合法 JSON、禁 Markdown：
{"realName":"英靈真名",${clsUnset ? '"cls":"Saber",' : ""}"sex":"女","align":"中立・善","background":"限20字","npc_intent":"萌點一句(不限反差)","personality":"四格頓號","look":"四格頓號","np":"寶具名（簡述）","six":{"筋力":"B","耐久":"C","敏捷":"A","魔力":"D","幸運":"C","寶具":"B"},"skills":[{"n":"直感","r":"A","fx":"first_strike"},{"n":"怪力","r":"B","fx":"str_up"}],"traits":[{"n":"人類"}]}`;
      const aiBrief = JSON.parse(callGeminiAPI(`【職階】：${clsUnset ? "未指定(請依描述判斷)" : cls}\n【御主】：${pcName}${trueName ? `\n【指定真名】：${trueName}` : ""}${custDesc ? `\n【玩家自訂描述】：${custDesc}` : ""}`, sysOverride, { temperature: custDesc ? 0.85 : 0.6, ignoreLaw: true }));
      // callGeminiAPI 連線失敗不丟例外，而是回 fallback 敘事 JSON(narration/options)——照收會靜默生出全C
      //   六圍/零技能的殘缺從者並永久污染英靈殿。缺 realName 或 six 視為生成失敗，中止讓玩家重試。
      if (!aiBrief || !aiBrief.realName || !aiBrief.six) {
        return JSON.stringify({ success: false, message: "英靈之座的迴響中斷——召喚失敗，請稍候再試一次。" });
      }
      if (clsUnset) cls = VALID_CLS.includes(String(aiBrief.cls)) ? String(aiBrief.cls) : "Saber"; // AI 依描述判斷的職階；非法值才退回 Saber
      // 🐛→✅ 舊版沒清 HTML 斷字字元、沒封頂長度——工房路徑(parseForgeBuild_)對 out.name 有
      //   .replace(/[<>&"'`]/g,"").trim().slice(0,20)，這裡完全沒有；recordOriginalHero_ 內部雖然
      //   也會清洗，但那是函式內的區域變數副本(JS 字串傳值)，不會回寫外層 realName——導致「這局實際
      //   使用、寫進戰鬥狀態的名字」跟「寫回英靈殿供未來重召的名字」不一致，前者還完全繞過 HTML 斷字防線。
      realName = String(aiBrief.realName || trueName || (cls + "從者")).replace(/[<>&"'`]/g, "").trim().slice(0, 20) || (cls + "從者");
      // 🐛→✅ sex 舊版沒有白名單驗證(工房 parseForgeBuild_ 早有 ["男","女","異"].includes(...) 檢查)，
      //   AI 吐出的任意字串會原樣通過並永久寫進英靈殿，往後任何讀取點都得自己防禦這個不可信欄位。
      sex = ["男", "女", "異"].includes(String(aiBrief.sex)) ? String(aiBrief.sex) : "異";
      align = ALIGNS_.includes(String(aiBrief.align)) ? String(aiBrief.align) : "中立";
      np = aiBrief.np || "寶具（未顯現）";
      // npAtkScale_ 讀 np 字串關鍵字算規模——AI 自訂寶具最高「對軍」，對城/對界/對神為種子專屬(堵字串後門)。
      //   【常駐寶具】標記同理為種子專屬(B叔/玉藻)，混入會讓從者自己的💥被鎖死，故一律剝除。
      //   🐛→✅ 補上 HTML 斷字字元清洗，比照工房 out.npName/out.npDesc 的既有規則。
      np = String(np).replace(/[<>&"'`]/g, "").replace(/對界|對城|對神/g, "對軍").replace(/【常駐寶具】/g, "").slice(0, 80);
      const aiSix = sanitizeSix_(aiBrief.six);
      // 🐛→✅ 玩家實測抓到「Berserker 身上多一個像符文技能的職階技能」——舊版讓 AI 自己生 classSkills，
      //   prompt 只講「貼合職階慣例」是軟性建議、擋不住 AI 額外發明一個不屬於該職階原型的技能(如替
      //   Berserker 加一個道具作成系的「召喚騎士」)。改成比照工房：職階技能由 GAS 依 FORGE_CLS_SKILLS_
      //   直接指派、不再問 AI，徹底杜絕跑題；AI 只需專心生「這名英靈個人」的固有技能(skills)。
      const aiCSkills = FORGE_CLS_SKILLS_[cls] || [];
      const aiSkills = sanitizeSkills_(aiBrief.skills, 3);       // prompt 要求 2~3 個
      // 🌀 六圍下限保底：AI 常自己抓不準力度，光靠 prompt「務必有強有弱」擋不住——GAS 這裡硬性補強
      //   到與工房 FORGE_BUDGET(340) 對齊(不含職階技能 aiCSkills，理由見 bumpSixToFloor_ 註解)。
      bumpSixToFloor_(aiSix, aiSkills, /對軍/.test(np) ? "對軍" : "對人");
      // 🐛→✅ 只補下限沒補上限——AI 常被 prompt「不得保守低估」誘導生出偏強六圍/技能組合，比照
      //   工房 parseForgeBuild_ 的預算硬上限，改成超標就砍最強一項六圍，直到落回預算內。
      capSixToBudget_(aiSix, aiSkills, /對軍/.test(np) ? "對軍" : "對人", cls);
      // 🐛→✅ 同工房路徑，補 HTML 斷字字元清洗（原本只做長度截斷）。
      const aiTraits = Array.isArray(aiBrief.traits) ? aiBrief.traits.filter(Boolean).slice(0, 4).map(t => ({ n: String((t && (t.n || t.名稱 || t.name)) || t).replace(/[<>&"'`]/g, "").slice(0, 8) })) : [];
      const svHp = 150 + svNum_(aiSix.耐久) * 6, svMp = 0; // 🔋 出力電池制：從者無自有魔力池，出力檔存 MEMORY、預設 60 巡航
      // 🎴 五圍已棄欄：戰鬥吃六圍 SIX，不再寫數值。
      row[COL.PC.HP] = svHp; row[COL.PC.MP] = svMp; row[COL.PC.MAX_HP] = svHp; row[COL.PC.MAX_MP] = svMp;
      // 🐛→✅ 玩家反饋：這裡原本完全不生成外貌(直接套通用預設「外貌出眾、舉止從容…」)，逼玩家自己
      //   用逆天改命補——現在跟 aiBrief.look 一起生成，缺的話才退回同款通用預設。
      row[COL.PC.TRAIT] = parseTraitsHelper(aiBrief.look, "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面");
      row[COL.PC.PREF] = parseTraitsHelper(aiBrief.personality, "沉著表象、堅定內裡、珍視之物、厭惡之事");
      row[COL.PC.INTENT] = String(aiBrief.npc_intent || "").slice(0, 30); // 比照 slice(0,18) 腰斬修正，放寬緩衝
      row[COL.PC.MEMORY] = `第一人稱「我」｜對御主：初締約·尚在觀察`; // 與種子路徑對稱(原漏寫→servantCard_ 演出資訊變薄)
      row[COL.PC.SIX] = JSON.stringify(aiSix);
      row[COL.PC.TAGS] = JSON.stringify({ skills: tagSkillKind_(aiCSkills, 'class').concat(tagSkillKind_(aiSkills, 'skill')), traits: aiTraits });
      // 🕯️ 復活命數：AI 產物持 god_hand → 標【試煉】3(尼祿「三度輝映」基準)——預設 11 是赫拉克勒斯(seed)專屬。
      if (aiCSkills.concat(aiSkills).some(function (s) { return s && s.fx === 'god_hand'; })) {
        row[COL.PC.MEMORY] += '｜【試煉】3';
      }
      const svBackAi = aiBrief.background ? String(aiBrief.background).slice(0, 40) : `${cls} 職階的英靈`; // 補防呆上限，比照其他AI生成路徑
      row[COL.PC.BACK] = svBackAi;
      // 不重名的原創從者寫回英靈殿(含六圍/技能fx/特性)，日後可重用。pExtra 需帶 moe——否則永久記錄
      //   (persona.moe) 是空字串，若日後被邀進鑑賞會無從轉出日常萌點。
      // 🐛→✅ 舊版 pExtra 沒帶 back——工房路徑(actionSaveHero)完整傳了 back，這條 AI 生成路徑卻漏傳，
      //   即使這局「當下」的從者列(row[COL.PC.BACK])明明已經有值：recordOriginalHero_ 內對缺欄位的
      //   處理是空字串，這名原創英靈永久寫回英靈殿的 persona.back 因此恆為空，之後任何重新召喚都會
      //   落回泛用預設值「職階・真名」，AI 當初生成的身世徹底遺失，工房編輯清單上也永遠看到空白欄位。
      // look 一併存進 persona——之後日常版轉換(translateLookToDaily_)跟重新召喚都吃得到這次AI生成的外貌，
      //   不再永遠停留在通用預設(見上方 TRAIT 賦值處的同批修正)。
      try { recordOriginalHero_(realName, cls, sex, row[COL.PC.SIX], aiCSkills, aiSkills, aiTraits, np, aiBrief.personality, align, { moe: String(aiBrief.npc_intent || "").slice(0, 30), back: svBackAi, look: String(aiBrief.look || "").replace(/[<>&"'`]/g, "").slice(0, 80), creator: String(userData.acctName || "").trim() }); } catch (e) { }
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
