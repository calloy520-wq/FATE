// ==========================================
// 📖 Router_Narrative.gs — AI 敘事引擎（2026-07 從 Router_Action.gs 拆出）
//   actionPlay(鑑賞專用自由聊天引擎——查證後全專案已無路徑讓非鑑賞角色呼叫，見函式內註解)／
//   史紀／敘事 helper(虛假之夢/輕量敘事共用核心)。
// ==========================================

// ★ 主遊戲邏輯 (PLAY) 
// ==========================================
function actionPlay(userData, pcId, sheets) {
  const userMsg = userData.message;
  // 🌹 慾海(KPC_ 御主)專用引擎：前端自由聊天輸入框只在 pc.mode==='kanshou' 才顯示(Script.html
  //   applyModeUI)，且鑑賞玩家自己的 pcId 恆為 KPC_ 前綴——查證全 gas/ 目錄已無任何路徑把
  //   pc.mode 設為 'full'(九州殘留、已停用)，故這裡不會再有 solo/SFW 呼叫路徑。早期版本曾信
  //   前端 userData.isNsfw 旗標判斷 SFW/NSFW(埋下「鑑賞切回 solo 忘記取消勾選、殘留 true 污染
  //   solo」的漏洞)，後端曾改成純看 pcId 前綴路由；2026-07 玩家定案「isNsfwMode 也不用分模式
  //   了」——既然這條路徑只可能是鑑賞，直接在入口擋下非 KPC_ 呼叫(定位錯誤好過悄悄套錯規則)，
  //   函式其餘部分不再分支，永遠當作鑑賞/NSFW 情境處理。
  if (String(pcId || "").indexOf("KPC_") !== 0) return JSON.stringify({ text: "此功能僅限鑑賞使用。", people: [] });
  // 🔥 主動掌握開關(2026-07 玩家定案·原nsfw開關重生)：現在 real runtime 上唯一還會變動的「模式」。
  const driveOn = (userData.drive === true || String(userData.drive) === "true");
  const finalUserMsg = `【玩家意圖】：${userMsg}`;

  const formatPref = (str) => {
    let arr = String(str || "").split('、');
    // 喜好與厭惡是常態情報，全面開放給 AI 參考
    return `[表象]${arr[0] || "無"} [內裡]${arr[1] || "無"} [喜歡]${arr[2] || "無"} [討厭]${arr[3] || "無"}`;
  };

  // 🐛→✅ 2026-07(玩家授權·同批修正)：[自稱] 這格內容通常已是「自稱「我」」這類完整片語——
  //   跟 servantCard_ 同一種collision(見 Router_Persona.gs 同批修正)，「我」字面緊鄰在敘事視角
  //   說明附近，flash-lite小模型容易混淆。標籤加註明確限定範圍，與 servantCard_ 的修法一致。
  const formatTrait = (str) => {
    let arr = String(str || "").split('、');
    return `[外貌]${arr[0] || "無"} [氣質舉止]${arr[1] || "無"} [台詞自稱(僅其本人引號內用，非旁白視角)]${arr[2] || "無"} [卸下心防的私密一面]${arr[3] || "無"}`;
  };


  let pcData = sheets.pc.getDataRange().getValues();

  const pcIndex = pcData.findIndex(r => r[COL.PC.ID] == pcId);
  if (pcIndex === -1) return "查無此人";
  const pc = pcData[pcIndex];
  const pcName = pc[COL.PC.NAME];
  let curL = pc[COL.PC.LOC];



  let knockedOutList = [];
  let justRevived = false;
  let fatePlayerDefeat = false, fateDreamPrompt = ""; // 🔵 FATE：御主血歸 0＝聖杯戰爭敗北（虛假之夢→老虎道場）
  let freshlyBoundNpcName = "";
  const dirtyPcRows = new Set();
  // 玩家本人一定會被處理到，先加進去
  dirtyPcRows.add(pcIndex);



  const currentAmbition = pc[COL.PC.INTENT] ? String(pc[COL.PC.INTENT]).trim() : "尚無明確目標，隨遇而安。";

  // 🔵 實例化：只取自己 game_id 世界內、同地點的人（御主無 game_id 時不過濾，相容舊角色）
  const myGameId = pc && pc[COL.PC.GAME_ID] ? String(pc[COL.PC.GAME_ID]) : "";
  const isKanshou = myGameId.indexOf("k_") === 0; // 鑑賞（後日談·約會）世界
  const sameGame = (r) => !myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId;

  // 🐛→✅ 2026-07 修：「專屬稱呼/已兌現」記憶點原本只加在 localSceneStr(同地路人清單)，但那份
  //   明確排除「同行隊伍成員」——鑑賞的同伴全部是 IS_PARTY="同行"、只會出現在下面 partyDetailsArr，
  //   等於唯一真正常互動的對象反而吃不到這兩個標籤(solo友善對話/切磋等免按鍵互動同樣受影響)。
  //   抽成共用函式，兩份清單一起補上，不重複貼一次解析邏輯。
  function relMemMemoryStr_(relMem) {
    const s = String(relMem || "");
    const nickMatch = s.match(/\[專屬稱呼\](.*?)(?=\| \[|$)/);
    const nickTrim = nickMatch ? nickMatch[1].trim() : "";
    const nickStr = (nickTrim && nickTrim !== "無") ? ` [專屬稱呼:${nickTrim}]` : "";
    const doneMatch = s.match(/\[已兌現\](.*?)(?=\| \[|$)/);
    const doneTrim = doneMatch ? doneMatch[1].trim() : "";
    const fulfilledStr = (doneTrim && doneTrim !== "無") ? ` [一起做過:${doneTrim}]` : "";
    return `${nickStr}${fulfilledStr}`;
  }

  // 🧹 2026-07 玩家定案「砍掉同地路人、這是開放大世界、沒有結界了」：舊版 allLocals/displayPeople/
  //   localSceneStr(好感階梯 resistPrompt/身分標籤)整套刪除。實務上這套機制在鑑賞幾乎是死重——鑑賞
  //   從不會平白生出「同地路人」這種被追蹤好感的固定NPC，唯一會命中的邊角情況是「已請走、還留在原地
  //   的舊同伴」被誤判成陌生路人重新演一次戒備——這比沒有這套機制更奇怪。改成單純的「開放世界背景
  //   人煙」指令(見下方【開放世界·背景人煙】)：路人可以自由描寫增添生活感，但不具名、不追蹤好感、
  //   不能被指名互動——真正能被指名、有名有姓、好感會被記錄的對象，只有【同行隊伍成員】。
  const partyRows = pcData.filter(r => r !== pc && String(r[COL.PC.IS_PARTY] || "") === "同行" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
  const partyMembers = partyRows.map(r => r[COL.PC.NAME]);
  let partyDetailsArr = [];
  partyMembers.forEach(pName => {
    // ⚠ 2026-07 修：原本純比對姓名，沒有 sameGame——若不同局/不同帳號剛好撞名(種子有限、
    //   AI原創從者皆可能撞)，會把別局同名者的 HP/身世/狀態塞進本局的敘事提示詞。
    const r = pcData.find(row => String(row[COL.PC.NAME]).trim() === String(pName).trim() && !String(row[COL.PC.ID]).startsWith("DEAD_") && sameGame(row));
    if (r) {
      const pOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👗 玩家換裝：當前服裝穿著(換衣不換人)
      // 🐛→✅ 鑑賞同伴的 氣血/狀態 是死資料(2026-07 修，同款「STATUS/HP 建角後從沒更新過」問題)：
      //   鑑賞無戰鬥，HP恆定不變、STATUS(視覺化外顯)也已被physical_state取代——每回合把這兩個
      //   永遠不變的欄位塞進提示詞純屬浪費token；solo那邊HP/STATUS是真的會隨戰鬥/休息即時變動，
      //   維持原樣。
      const pMemStr = relMemMemoryStr_(r[COL.PC.REL_MEM]);
      // 🐛→✅ 2026-07 玩家回報「鑑賞同伴的萌點沒餵到AI」：查出萌點(COL.PC.INTENT)只寫在已刪除的
      //   localSceneStr，而鑑賞同伴一律是同行隊伍成員、從不會出現在那份清單——同伴的萌點過去
      //   從未真正餵給AI過。這裡補上，跟 servantCard_/localSceneStr(已刪)看齊。
      const pMoeStr = String(r[COL.PC.INTENT] || "").trim();
      partyDetailsArr.push(isKanshou
        ? `【同行夥伴】名號:${pName} | 身世:${r[COL.PC.BACK] || "無"}${pOutfit ? ` | 裝扮:${pOutfit}(當前服裝·五官體態不變)` : ""} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])}${pMoeStr ? ` | 萌點(反差·僅供內化):${pMoeStr}` : ""} | 關係:${r[COL.PC.REL_TAG] || "結伴同行"}(好感:${parseInt(r[COL.PC.BOND]) || 0}${pMemStr})`
        : `【同行夥伴】名號:${pName} | 氣血:${r[COL.PC.HP]}/${getCharacterTotalStats(r[COL.PC.ID], sheets, pcData, []).maxHp} | 身世:${r[COL.PC.BACK] || "無"} | 狀態:${r[COL.PC.STATUS]}${pOutfit ? ` | 裝扮:${pOutfit}(當前服裝·五官體態不變)` : ""} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])}${pMoeStr ? ` | 萌點(反差·僅供內化):${pMoeStr}` : ""} | 關係:${r[COL.PC.REL_TAG] || "結伴同行"}(好感:${parseInt(r[COL.PC.BOND]) || 0}${pMemStr})`);
    }
  });
  const PROMPT_PARTY_SYSTEM = partyDetailsArr.length > 0 ? `【目前同行隊伍成員命格詳情】:\n${partyDetailsArr.join("\n")}` : "目前沒有同行夥伴，玩家是獨自行動的。";

  const backgroundCrowdStr = `★【開放世界·背景人煙】：這是有血有肉的開放世界，不是與世隔絕的私密結界——場景中可以自由描寫路過的行人、店員、其他顧客等不具名的背景人物，增添生活感與人煙氣息；但這些背景人物僅供氛圍點綴，【不具名、不可被指名互動、不追蹤好感或關係】。真正能被指名對話、持續互動、且好感/關係會被記錄延續的對象，僅限【目前同行隊伍成員】。`;

  // 🟢 性別配對提示，直接算好給 AI，不需要它自己推理。
  // 🔠 2026-07 全面重寫縮字：原本逐一 NPC 各寫一整句配對規則，3人同場(kanshou上限)時
  //   同款「女女配對：...肉棒代碼(4)不輸出、不寫「無」」的長句會逐字重複3遍——改成先分組
  //   (與玩家同性/異性)，同組共用一句規則、只在句首列名字，規則邏輯完全不變。
  let genderHintStr = "";
  const presentRowsForGender = pcData.filter((r, i) => i !== 0 && r[COL.PC.ID] != pcId && r[COL.PC.LOC] === curL && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  if (presentRowsForGender.length > 0) {
    const playerSex = pc[COL.PC.SEX] || "未知";
    // ⚠ 2026-07 修：原本非「女/女」「男/男」的組合一律落入模糊的「依雙方實際性別器官裁決」，
    // 「異/無」(如開膛手傑克「無固定實體」)這類非二元性別值完全沒被正規化。玩家定案：不開放
    // 男男配對(邀請關卡已擋)，故這裡只會遇到 女/女、男/女、女/男、或某方為異/無 這幾種——
    // 異/無 一律按女性向器官處理(對齊 heroToKanshouRow_ 的肉體起始預設，且與傑克本身
    // 「不自覺化身少女模樣」的角色設定一致)。
    // ⚠ 只有「女女」是特殊配對(男男邀請關卡已擋、理論不可達，故不比照女女套用同一段措辭，
    //   維持跟改寫前完全相同的分支條件：只有 playerSex==="女" && npcSex==="女" 才進特殊組)。
    const sameSexF = [], others = [];
    presentRowsForGender.forEach(r => {
      const npcSexRaw = r[COL.PC.SEX] || "未知";
      const npcSex = (npcSexRaw === "男" || npcSexRaw === "女") ? npcSexRaw : "女";
      (playerSex === "女" && npcSex === "女" ? sameSexF : others).push(r[COL.PC.NAME]);
    });
    // 🐛→✅ 2026-07 修：原本女女配對明講「肉棒欄位雙方皆填『無』」，等於教AI每回合主動寫入一個
    // 不適用的佔位鍵——這鍵一旦寫進physical_state就merge進去、卡片上永久顯示某女角「肉棒：無」，
    // 玩家明確要求禁止這種臨時填補寫法。改成：不適用的器官代碼【直接不輸出這個代碼】，不寫佔位詞。
    const parts = [];
    if (sameSexF.length) parts.push(`${sameSexF.join("、")}(女女配對)：純女女之愛，禁插入式陽具動作，以手指/舌頭/器物替代，肉棒代碼(4)不輸出`);
    if (others.length) parts.push(`${others.join("、")}：依各自實際性別只填對應器官代碼(男4=肉棒／女5=蜜穴)`);
    genderHintStr = `\n★【性別配對】：${parts.join("；")}——不適用的器官代碼一律不輸出，不要寫「無」佔位。`;
  }

  let pPhysicalObj = JSON.parse(pcData[pcIndex][COL.PC.PHYSICAL] || "{}");
  if (Object.keys(pPhysicalObj).length === 0) {
    // ⚠ 2026-07 修：原本不論性別統一預設女性生理結構起始值，男御主也被塞這組——改依實際性別。
    pPhysicalObj = (String(pc[COL.PC.SEX]) === "男") ? { "肉棒": "如常" } : { "蜜穴": "未開" };
  }
  let pSkills = (pcData[pcIndex][COL.PC.MEMORY] || "無").replace(/\[雙修技巧\](.*?)(?=\| \[|$)/, (m, p1) => `[雙修技巧]${p1.trim().split('、').slice(0, 5).join('、')}`);
  // 🐛→✅ 2026-07 玩家定案整合：STATUS(視覺化外顯，衣服/姿勢/負面/顏面)已退役——姿勢動作/顏面已併進
  //   physical_state(見下方[肉體])，這裡不再重複注入即將永遠凍結的舊欄位。
  let nsfwMemories = `\n[玩家『${pcName}』肉體]：${JSON.stringify(pPhysicalObj)}\n[身體記憶]：${pSkills}`;

  let allPresentRows = pcData.filter((r, i) => i !== 0 && r[COL.PC.ID] != pcId && r[COL.PC.LOC] === curL && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_"));
  allPresentRows.forEach(r => {
    let npcPhysicalObj = JSON.parse(r[COL.PC.PHYSICAL] || "{}");
    // ⚠ 2026-07 修：原本不論性別統一預設女性生理結構起始值(男同伴也被塞這組)——改依實際性別；
    // 異/無比照 heroToKanshouRow_ 的處理方式，一律按女性向。
    if (Object.keys(npcPhysicalObj).length === 0) npcPhysicalObj = (String(r[COL.PC.SEX]) === "男") ? { "肉棒": "如常" } : { "蜜穴": "未開" };
    let npcSkills = (r[COL.PC.MEMORY] || "無").replace(/\[雙修技巧\](.*?)(?=\| \[|$)/, (m, p1) => `[雙修技巧]${p1.trim().split('、').slice(0, 5).join('、')}`);
    let relMem = r[COL.PC.REL_MEM] || "無";
    let npcOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👗 玩家換裝：當前服裝穿著(換衣不換人·五官體態依本相)
    // ⚠ 2026-07 修：萌點併進上面共用的 localSceneStr(SFW/NSFW 皆讀)後，這裡不再重複附一次。
    nsfwMemories += `${npcOutfit ? `\n[${r[COL.PC.NAME]} 裝扮]：${npcOutfit}（玩家指定當前服裝·五官/髮色/體態不變）` : ""}\n[${r[COL.PC.NAME]} 肉體]：${JSON.stringify(npcPhysicalObj)}\n[快照]：[技巧]${npcSkills} | [羈絆]${relMem}`;
  });

  // 🔥 主動掌握模式(driveOn)：翻轉「誰主導節奏」——平時的矜持限制(慢熱/被動等玩家推進)換成
  //   同伴主動出擊；玩家的迴避/抽身意圖會被依個性攔下(與「意圖攔截·玩家意圖非結果」鐵律同向，
  //   不衝突)。主動的【形式】仍依好感與個性：低好感的主動是強勢試探/挑釁/戲弄的攻勢(非傾心倒貼，
  //   與慢熱鐵律不牴觸)，高好感才是不加掩飾的索求。個性一致性鐵律照常有效。
  // 🐛→✅ 2026-07 玩家強化：這開關不是「同伴可能主動一下」，而是玩家會確實被同伴依個性榨乾、
  //   沒有回頭路；同時要跟「敘事別收尾」鐵律相容(不強迫每回合都寫到終點，但每回合都要往這個
  //   方向確實前進)。
  // 🔠 2026-07 全面重寫縮字：原文用兩份幾乎相同的「依個性列出4種類型反應」清單(一份講攻勢起手、
  //   一份講榨乾方式)重複描述同一件事——合併成一份，走向確定性與招架不住的畫面感都保留。
  const driveStr = driveOn ? `
🔥【主動掌握模式·玩家已明確開啟】：本回合起，在場同伴主動掌握節奏、推進互動——依個性一步步把玩家逼向毫無招架餘地(高傲者步步進逼直到玩家求饒認輸、虔敬者以奉獻之名榨乾矜持、活潑者纏到玩家無處可躲、深情者溫柔卻讓人無所遁逃)；玩家若試圖迴避、轉移話題、抽身離開，同伴會依個性攔下、堵住退路、追上來，營造「想跑也跑不掉」的壓迫與心跳感。★這走向確定不可逆，不必每回合寫到終點，但每回合都要確實往前推進，不可退回平日矜持基準。注意：①主動的【形式】仍依好感高低——低好感是強勢試探/挑釁/戲弄的攻勢而非傾心示愛，高好感才不加掩飾索求；②【角色一致性鐵律】仍完全有效，禁千篇一律的霸道模板；③壓迫止於情境張力，嚴禁真正傷害玩家。` : '';

  // 🧹 2026-07 玩家定案「isNsfwMode 也不用分模式了，統合起來」：PROMPT_ENV/PROMPT_GEAR(舊「戰爭
  //   迷霧偵查」/「陣營情報·裝備」九州殘留框架，鑑賞從未真的用過，恆為空字串)、SFW 分支(PROMPT_GEAR
  //   曾是寶具/技藝、PROMPT_REL 曾是純背景人煙)已隨這輪整理一併刪除——這條路徑現在只可能是鑑賞，
  //   只留鑑賞真正會用到的 PROMPT_REL 版本；prompt 模板裡對應的兩個占位行也一併拿掉。
  const PROMPT_REL = `${backgroundCrowdStr}
★【視角鎖定】：以上「同行夥伴」卡片內「自稱」只限她/他自己的引號台詞——通篇敘事旁白的「我」永遠、只能是玩家『${pcName}』本人，絕不可把在場任何一位角色的心境或反應誤寫成旁白第一人稱。
★【情境延續鐵律】：請繼續往後推演！${nsfwMemories}${genderHintStr}${driveStr}
🛑【角色一致性鐵律】：NPC 的反應必須【死守】其「性格」與目前「好感度」的真實落差——好感未滿 80、或性格屬於冷酷/高傲/剛烈者，依這個設定判斷此刻合理的抗拒/抵觸程度演出，不因劇情推進就無視好感度線性軟化。即便肉體有生理反應，靈魂與對話的態度仍以角色設定為準。真正的沉溺不是放棄人格，而是【用原本的人格去承受快感】——高傲者咬牙不肯示弱、虔敬者於信仰間掙扎、活潑者笑鬧裡藏羞、深情者愈發黏膩——語癖、自稱與個性在最激烈處也不崩壞，【絕對禁止】任何角色在情慾中退化成千篇一律的發情機器。`;

  // ⚠ 2026-07 修：原句「請包含...的對話」讀起來像強制指令全員都要出聲——玩家只想找同行從者講話，
  //   卻可能被這行逼得連背景路人都插話。改成「姓名參考用」措辭：只提供正確姓名給 AI 拼字用，
  //   是否真的互動仍完全依上方【在場驗證鐵律】與各人的強制互動限制判斷。
  const npcDialoguePrompt = partyMembers.length > 0 ? `\n★【姓名參考】：若對話對象是同行夥伴，請使用真實姓名「${partyMembers.join("、")}」，不得另編新名字；是否互動仍依上方在場規則與各人強制互動限制判斷，非清單所有人都要出聲。` : "";


  // 🔴【替換開始】淨化後的 prompt 組裝
  const prompt = `【敘事法旨】：當前推演視角鎖定為玩家『${pcName}』(ID: ${pcId})。
${PROMPT_PARTY_SYSTEM}
【玩家命格】：名號:${pcName} 【性別:${pc[COL.PC.SEX]}】 性格:${pc[COL.PC.PREF]} | 特徵:${pc[COL.PC.TRAIT]} | 軟肋:【 ${currentAmbition} 】 | 身世:${pc[COL.PC.BACK] || "來歷不明"} | 位置:${curL} | 生命:${pc[COL.PC.HP]}/${pc[COL.PC.MAX_HP]} | 魔力:${pc[COL.PC.MP]}/${pc[COL.PC.MAX_MP]}${((parseInt(pc[COL.PC.HP]) || 0) <= Math.max(1, Math.round((parseInt(pc[COL.PC.MAX_HP]) || 1) * 0.15)) || (parseInt(pc[COL.PC.MP]) || 0) <= Math.round((parseInt(pc[COL.PC.MAX_MP]) || 1) * 0.1)) ? '\n★【瀕死·最高張力】御主氣力放盡、命懸一線(見上方血/魔)——敘述須透出窒迫沉重、孤注一擲的緊繃，連從者氣場都因御主將枯竭而繃緊；嚴禁輕鬆閒適的閒聊感。' : ''}

${PROMPT_REL}
★【在場驗證鐵律——最高優先級，下筆前必看】：本回合可被指名對話、持續互動、且好感/關係會被記錄延續的角色僅限【目前同行隊伍成員】；背景路人可自由描寫增添氣氛(見上方【開放世界·背景人煙】)，但一律不具名、不可被指名互動、不追蹤好感，【絕對禁止】把某個背景路人寫成有名有姓、持續登場的固定角色。唯獨玩家本回合輸入內容【明確主動】表達邀請、招呼、引入第三人等意圖時(如呼喚他人加入、開門讓人進來等)，才可讓該玩家指定或暗示的新角色登場並開始被指名互動。歷史紀錄、話題情報中提到但不在【同行隊伍成員】內的姓名，僅視為不在場的回憶，嚴禁無視此規則憑空召喚、穿越或讓其開口說話、出手！
${isKanshou ? "" : `
★【系統底層防呆·雙向裁決】：發生衝突時綜合比對雙方靈基/實力/環境/戰術公平裁決，禁止單方面秒殺玩家；傷害以相對扣血呈現，允許玩家受傷/纏鬥/撤退/奇謀逆襲(從者廝殺的按鈕裁決規則見系統提示)。
`}
${isKanshou ? `
💕【鑑賞·後日談模式·最高優先級覆寫】：${(partyRows.length > 0 && partyRows.every(r => String(r[COL.PC.ID]).indexOf("KHV_") === 0))
    ? `『${partyMembers.join("、")}』是剛從英靈殿被召喚而來——這不是並肩打過聖杯戰爭的緣分，是彼此【初次相遇】的日常時光，讓相處自然生澀、依好感漸漸升溫，嚴禁暗示雙方早已相熟或曾並肩作戰。`
    : `聖杯戰爭【早已落幕】，這是奪得聖杯後與從者『${partyMembers.length ? partyMembers.join("、") : "你的從者"}』共度的【和平日常／約會時光】。`
  }
🕰️現在是 ${realWorldClockStr_()}，僅供揣摩場景氛圍與時段感(如深夜靜謐、清晨慵懶)，不必刻意報時或提及具體數字。
★世界觀＝和平的現代都市日常：【絕對禁止】任何戰鬥、廝殺、敵人、聖杯爭奪、靈基受損、血量／生命變化、寶具對轟、死亡或威脅，世界是安全的；但節奏與親密程度依劇情、好感與玩家/同伴當下意圖自然發展，可以是散步閒聊的尋常時光，也可以是更靠近、更熱烈的相處，不強制鎖在「悠閒」基調(尤其🔥主動掌握模式開啟或情慾已自然升溫時)，讓從者貼近其官方性格自然地與御主相處互動。
★【演出而非說明】不得直述其願望／萌點／個性字面。僅可有 rel_changes(好感)，不輸出任何生命變化或戰鬥裁決。
★【換場地】地點不受地圖限制，你可自主決定何時、換去哪(不限於冬木既有地名，可自創如「一家安靜的咖啡廳」)——但【絕對禁止】無故憑空跳地點：須先在narration把移動/抵達的過程實際寫出來，location欄位才能填新地名；沒有移動就讓location原樣照抄目前地點。
` : ""}現在演化玩家動作：『${finalUserMsg}』${npcDialoguePrompt}

${driveOn ? `🚨【敘事終極警告·主動掌握模式】：同伴主導推進，本回合可以確實大幅向前推展——不必像平日矜持模式那樣每次都停在剛起步的瞬間，讓「步步進逼」的壓迫感真的往前走、玩家打少少字也能推進不少。但仍【絕對禁止】把這整段相處寫成「那一夜／自此／就這樣／從此」等總結收尾句，不可讓這回合讀起來像已經翻頁的完結篇章——停在「我」當下進行式的心境與情緒中，留一點空間給玩家插入反應、喊停或喘息，而非停在原地一動也不動。`
    : `🚨【敘事終極警告】：結果後必須停在「我」當下進行式的心境與情緒中，留一個未完成的動作、未說完的話或懸而未決的情緒把下一步交還玩家——【絕對禁止】寫出「那一刻／那一夜／自此／就這樣／從此」等總結收尾句，讓這回合讀起來像已經翻頁的完結篇章！`}`;

  try {
    let aiConfig = { temperature: 1.0, top_p: 0.95, retries: 2, model: AI_MODEL, isNsfwMode: true };
    aiConfig.backLocked = userData.backLocked || false;

    // 🔴【新增】抓取近 6 筆原始歷史(3輪)，轉換為 API 格式
    const recentHistoryRaw = getGameHistoryBatchRaw(pcId, 6);
    if (recentHistoryRaw && recentHistoryRaw.length > 0) {
      aiConfig.chatHistory = recentHistoryRaw.map(msg => ({
        role: msg.speaker === "player" ? "user" : "assistant",
        content: String(msg.content)
      }));
    }

    const aiResponseRaw = callGeminiAPI(prompt, null, aiConfig);
    const start = aiResponseRaw.indexOf('{');
    const end = aiResponseRaw.lastIndexOf('}');
    const cleanJson = aiResponseRaw.substring(start, end + 1);
    const aiData = sanitizeAiData_(JSON.parse(cleanJson));




    let memoryMapData = getMapDataCached(sheets);
    // 🧹 2026-07 清除死碼：這裡原本有一段處理 aiData.new_maps(讓AI在鑑賞自由擴張地圖節點)的邏輯，
    //   但 Engine_Combat.gs 的 finalJson schema 從來沒有要求 AI 輸出這個欄位，AI 從未真的產生過
    //   new_maps，整段是從未觸發的死碼。隨著下方「鑑賞拔地圖」一併清掉，不用先加欄位才發現沒人吃。
    //
    // 🗺️ 2026-07 玩家定案：鑑賞拔除地圖按鈕，改AI自主決定地點——每回合讀 aiData.location 直接寫回
    //   LOC，不再需要固定地圖節點清單。玩家與同行同伴(IS_PARTY="同行")的 LOC 一起同步，跟 solo
    //   actionMove 移動全隊的既有邏輯一致(該函式完全不動，這裡只是鑑賞另一條路徑)。
    const aiLoc = String(aiData.location || "").trim().slice(0, 20);
    if (aiLoc && aiLoc !== curL) {
      pcData[pcIndex][COL.PC.LOC] = aiLoc;
      dirtyPcRows.add(pcIndex);
      pcData.forEach((r, nIdx) => {
        if (nIdx === pcIndex) return;
        if (String(r[COL.PC.IS_PARTY] || "") !== "同行") return;
        if (String(r[COL.PC.ID]).startsWith("DEAD_")) return;
        if (!sameGame(r)) return;
        pcData[nIdx][COL.PC.LOC] = aiLoc;
        dirtyPcRows.add(nIdx);
      });
      curL = aiLoc;
    }

    // 🔴 血量快照：記錄所有人變化前的血量，供結尾比對真實扣血
    const hpSnapshot = {};
    pcData.forEach((row, idx) => {
      if (idx === 0) return;
      if (String(row[COL.PC.ID] || "").startsWith("DEAD_")) return;
      hpSnapshot[idx] = parseInt(row[COL.PC.HP]) || 0;
    });
    const mpBefore = parseInt(pcData[pcIndex][COL.PC.MP]) || 0;


    // 🗑️ 2026-07：stat_changes(外顯狀態刷新)套用區塊已整組移除(玩家定案)——solo 戰鬥演出卡/戰報
    //   從不讀 STATUS，卡片外顯恆顯示預設「穿戴整齊，站立，氣息平穩」＝AI寫、無人讀的死資料迴圈；
    //   SFW schema 的 stat_changes 欄位與「狀態刷新」指令已同步自 Engine_Combat.gs(SFW區) 拔除。
    //   慾海不受影響：其外顯/肉體走 intimacy_feedback(physical_state·紅線機制·見下方，2026-07 已整合
    //   姿勢/顏面進同一欄，visible_state 機制退役)，且已改由「肉體狀態」抵換外顯的顯示位。








    // 經濟層（物品/金錢/任務）已全數移除：items_gained / items_transferred / money_transferred / items_lost / items_used 不再落地。

    // 🌹 鑑賞允許 AI 在自由敘事裡直接招募人（solo 的招募只走 GAS 按鈕：召喚從者／破戒奪僕／結盟，不受這裡影響）
    let newlyRecruited = (aiData.recruited && Array.isArray(aiData.recruited)) ? aiData.recruited.map(n => String(n).trim()) : [];
    let dismissedNpc = userMsg.includes("解除了組隊同行關係") ? (userMsg.match(/與「(.*?)」解除/) || [])[1]?.trim() || "" : "";

    {
      const relChangesToProcess = aiData.rel_changes || [];
      newlyRecruited.forEach(npc => { if (!relChangesToProcess.find(r => r.npc === npc)) relChangesToProcess.push({ npc: npc }); });
      if (dismissedNpc && !relChangesToProcess.find(r => r.npc === dismissedNpc)) relChangesToProcess.push({ npc: dismissedNpc });

      relChangesToProcess.forEach(rc => {
        const tNpc = rc.target ? String(rc.target).trim() : String(rc.npc).trim();
        if (tNpc === pcName || tNpc === "自己") return;
        if (tNpc === freshlyBoundNpcName) return;

        // 羈絆已併入該 NPC 自己列（BOND/REL_TAG/IS_PARTY/MAJOR_EVENT）——找不到該人此局的列就無可寫入。
        const nIdx = pcData.findIndex(r => String(r[COL.PC.NAME]) === tNpc && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
        if (nIdx === -1) return;
        dirtyPcRows.add(nIdx);

        // 🌹 鑑賞允許 AI 依劇情推進好感（solo 的好感收歸 GAS 按鈕，走不同的 narrate_only 路徑，不受這裡影響）
        let change = parseInt(rc.fav_change) || 0;
        let isPartyStr = String(pcData[nIdx][COL.PC.IS_PARTY] || "");
        if (newlyRecruited.includes(tNpc)) isPartyStr = "同行"; if (dismissedNpc === tNpc) isPartyStr = "";

        let oldFav = parseInt(pcData[nIdx][COL.PC.BOND]) || 0; let oldTag = pcData[nIdx][COL.PC.REL_TAG] || "萍水相逢";
        let newFav = Math.max(-100, Math.min(100, oldFav + change));

        let finalTag;
        {
          let aiProvidedTag = (rc.tag && typeof rc.tag === 'string') ? rc.tag.trim() : "";
          let isValidAiTag = aiProvidedTag !== "" && aiProvidedTag !== "無" && !aiProvidedTag.includes("禁止");
          if (rc.forceTag) finalTag = rc.tag;
          else if (isValidAiTag) finalTag = aiProvidedTag;
          else finalTag = oldTag;
        }

        pcData[nIdx][COL.PC.BOND] = newFav; pcData[nIdx][COL.PC.REL_TAG] = finalTag; pcData[nIdx][COL.PC.IS_PARTY] = isPartyStr;

        if (rc.major_event && rc.major_event.trim() !== "無") {
          let oldEventsStr = String(pcData[nIdx][COL.PC.MAJOR_EVENT] || "").trim();
          let newEvent = String(rc.major_event).trim();
          let eventArray = (oldEventsStr === "無" || oldEventsStr === "") ? [] : oldEventsStr.split('、').map(e => e.trim());

          if (newEvent === "[清空]") pcData[nIdx][COL.PC.MAJOR_EVENT] = "無";
          else if (newEvent.includes("[達成]")) {
            let doneTask = newEvent.replace("[達成]", "").trim();
            if (doneTask) {
              eventArray = eventArray.filter(e => !e.includes(doneTask));
              pcData[nIdx][COL.PC.MAJOR_EVENT] = eventArray.length > 0 ? eventArray.join("、") : "無";
              // 🧪 2026-07 玩家提案「達成的約定當記憶點」：原本兌現後直接從陣列刪除、船過水無痕
              //   (跟REL_MEM專屬稱呼原本的問題同款浪費)。改成順手存一筆到REL_MEM的[已兌現]，
              //   讓角色以後還記得「一起做過」，不只是被動等下一次好感度數字判斷關係。
              let oldRMemForDone = String(pcData[nIdx][COL.PC.REL_MEM] || "");
              let doneMatch = oldRMemForDone.match(/\[已兌現\](.*?)(?=\| \[|$)/);
              let doneArr = doneMatch ? doneMatch[1].trim().split('、').map(x => x.trim()).filter(x => x && x !== "無") : [];
              if (!doneArr.includes(doneTask)) doneArr.push(doneTask);
              if (doneArr.length > 3) doneArr.shift();
              let newDoneSeg = `[已兌現]${doneArr.join('、')}`;
              pcData[nIdx][COL.PC.REL_MEM] = doneMatch
                ? oldRMemForDone.replace(/\[已兌現\](.*?)(?=\| \[|$)/, newDoneSeg)
                : (oldRMemForDone.trim() ? `${oldRMemForDone.trim()} | ${newDoneSeg}` : newDoneSeg);
            }
          } else if (!eventArray.includes(newEvent)) {
            eventArray.push(newEvent); if (eventArray.length > 3) eventArray.shift();
            pcData[nIdx][COL.PC.MAJOR_EVENT] = eventArray.join("、");
          }
        }
      });
    }



    if (aiData.intimacy_feedback) {
      // 🔴 防禦機制：過濾掉 AI 偷懶不想更新狀態時的敷衍用語
      const ignoreWords = ["維持現狀", "無變化", "不變", "維持", "同上", "保持現狀", "沒有變化"];

      // 🐛→✅ 2026-07 玩家定案整合：physical_state 從8欄(視覺姿態4+肉體反應4)砍併成單一6鍵結構——
      //   1=姿勢與動作 2=胸部 3=顏面(表情+汗水) 4=肉棒 5=蜜穴 6=服裝狀態(玩家指定服裝【本身】不變，
      //   這格只記錄它當下的凌亂/破損程度，如領口散亂/半褪至肩——AI不可换衣服，只能描述現有服裝的狀態)。
      //   衣服本身(換裝)/負面/菊穴/雙手不再追蹤。visible_state/mergeVisibleState 機制隨之整段退役。
      const sanitizePhysicalState = (rawState, isPlayer = false) => {
        if (!rawState || typeof rawState !== 'object') return {};
        let cleanState = {};
        const keyMapping = { "1": "姿勢動作", "2": "胸部", "3": "顏面", "4": "肉棒", "5": "蜜穴", "6": "服裝狀態" };
        const allowedKeys = ["姿勢動作", "胸部", "顏面", "肉棒", "蜜穴", "服裝狀態"];
        Object.keys(rawState).forEach(k => {
          let standardKey = keyMapping[k] || k;
          let val = String(rawState[k]).trim();
          if (allowedKeys.includes(standardKey) && !ignoreWords.includes(val)) {
            cleanState[standardKey] = val;
          }
        });
        return cleanState;
      };


      const processSkills = (oldMem, newSkillsStr) => {
        let skillMap = {}; let oldSkills = (oldMem.match(/\[雙修技巧\](.*?)(?=\| \[|$)/) || [])[1]?.trim() || "";
        if (oldSkills && oldSkills !== "無") oldSkills.replace(/^\.\.\./, "").split('、').forEach(p => { let m = p.match(/(.+?)\(Lv\.(\d+)\)/); if (m) skillMap[m[1].trim()] = parseInt(m[2], 10); else if (p.trim()) skillMap[p.trim()] = 1; });
        if (String(newSkillsStr || "").trim() && String(newSkillsStr || "").trim() !== "無") String(newSkillsStr || "").trim().split('、').forEach(s => { let cn = s.replace(/[\(\[]?Lv\.?\d+[\)\]]?/gi, '').trim(); if (cn) skillMap[cn] = Math.min((skillMap[cn] || 0) + 1, 10); });
        let sorted = Object.keys(skillMap).map(k => ({ n: k, lv: skillMap[k] })).sort((a, b) => b.lv - a.lv);
        return sorted.length > 0 ? sorted.slice(0, 30).map(sk => `${sk.n}(Lv.${sk.lv})`).join('、') : "無";
      };

      const processTags = (oldMem, regex, newTagStr, maxCount) => {
        // 1. 取出舊標籤，拆成單項陣列(去頭部殘留的...、濾空白)
        let oldStr = (oldMem.match(regex) || [])[1]?.trim() || "無";
        let arr = (oldStr === "無" || oldStr === "")
          ? []
          : oldStr.replace(/^\.\.\./, "").split('、').map(x => x.trim()).filter(x => x !== "");

        // 2. 把新進來的字串也拆成單項(AI 可能一次吐多個，如「唇瓣、頸部」)
        let newItems = String(newTagStr || "").trim();
        if (newItems && newItems !== "無") {
          newItems.split('、').map(x => x.trim()).filter(x => x !== "").forEach(item => {
            // 3. 逐項去重：只有陣列裡還沒有這一項，才加進去
            if (!arr.includes(item)) arr.push(item);
          });
        }

        // 4. 超過上限保留最新的 maxCount 項
        if (arr.length === 0) return "無";
        return (arr.length > maxCount ? arr.slice(-maxCount) : arr).join('、');
      };

      if (aiData.intimacy_feedback.player) {
        const pfb = aiData.intimacy_feedback.player;
        if (pfb.physical_state) pcData[pcIndex][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[pcIndex][COL.PC.PHYSICAL], sanitizePhysicalState(pfb.physical_state));

        let oldPMem = pcData[pcIndex][COL.PC.MEMORY] || "";
        pcData[pcIndex][COL.PC.MEMORY] = `[雙修技巧]${processSkills(oldPMem, pfb.dynamic_skills)} | [性愛時敏感部位]${processTags(oldPMem, /\[性愛時敏感部位\](.*?)(?=\| \[|$)/, pfb.erogenous_zones, 5)}`;
      }

      if (aiData.intimacy_feedback.npcs) {
        aiData.intimacy_feedback.npcs.forEach(nfb => {
          const tName = String(nfb.name).trim();
          const targetIdx = pcData.findIndex(r => r[COL.PC.NAME] === tName && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
          if (targetIdx === -1) return;

          dirtyPcRows.add(targetIdx);
          if (nfb.physical_state) {
            pcData[targetIdx][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[targetIdx][COL.PC.PHYSICAL], sanitizePhysicalState(nfb.physical_state));
          }
          if (nfb.dynamic_skills || nfb.erogenous_zones) {
            let oldNMem = pcData[targetIdx][COL.PC.MEMORY] || "";
            pcData[targetIdx][COL.PC.MEMORY] = `[雙修技巧]${processSkills(oldNMem, nfb.dynamic_skills)} | [性愛時敏感部位]${processTags(oldNMem, /\[性愛時敏感部位\](.*?)(?=\| \[|$)/, nfb.erogenous_zones, 5)}`;
          }

          // 羈絆記憶(專屬稱呼/親密次數/交談輪數)已併入該 NPC 自己列的 REL_MEM 欄
          let oldRMem = pcData[targetIdx][COL.PC.REL_MEM] || "";
          let count = ((oldRMem.match(/\[親密次數\](\d+)/) || [])[1] ? parseInt((oldRMem.match(/\[親密次數\](\d+)/) || [])[1]) : 0) + 1;
          let talkStr = (oldRMem.match(/\[交談輪數\](\d+)/) || [])[1] ? ` | [交談輪數]${(oldRMem.match(/\[交談輪數\](\d+)/) || [])[1]}` : "";
          // 🧪 2026-07：已兌現的約定(見上方 major_event 的[達成]處理)也存在同一欄REL_MEM——這裡整串
          //   重建時要一併帶過去，否則本回合同時觸發[達成]又剛好被寫進intimacy_feedback.npcs時，
          //   已兌現記憶會被這行蓋掉(跟交談輪數用同一招：extract 舊值、reinject 回新字串)。
          let doneStr = (oldRMem.match(/\[已兌現\](.*?)(?=\| \[|$)/) || [])[1]?.trim();
          doneStr = (doneStr && doneStr !== "無") ? ` | [已兌現]${doneStr}` : "";
          pcData[targetIdx][COL.PC.REL_MEM] = `[專屬稱呼]${processTags(oldRMem, /\[專屬稱呼\](.*?)(?=\| \[|$)/, nfb.mutual_nicknames, 3)} | [親密次數]${count}${talkStr}${doneStr}`;
        });
      }
    }

    // ⚠ 2026-07 修：原本純比對姓名就直接寫 LOC——若不同局剛好有同名角色(種子有限、AI原創從者
    //   都可能撞名)，會把玩家的新座標寫到別局那位同名角色身上，悄悄把對方傳送到隨機地點。
    partyMembers.forEach(pName => {
      const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === pName && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
      if (nIdx !== -1) {
        pcData[nIdx][COL.PC.LOC] = pcData[pcIndex][COL.PC.LOC];
        dirtyPcRows.add(nIdx); // 🔴 加進去才會寫入
      }
    });

    // 📖 交談輪數：本回合有互動意圖提及的在場人物，累計交談輪數於其自己列的 REL_MEM 欄
    const logSum = aiData.log_summary || {};
    // ⚠ 2026-07 修：因果表(舊「因果」機制)整組砍除時，這裡漏了同步——log_summary 的 schema
    // (Engine_Combat.gs)早就從舊格式的 people 改成 subject/object(主被動方向)，這裡卻還在比對
    // 已不存在的 logSum.people，String(undefined) 恆為 "undefined"，.includes(name) 幾乎不可能
    // 命中任何真實姓名——交談輪數自那次重構後就悄悄壞掉，一直沒人發現。改用現行的 subject/object。
    const logNamesStr = `${logSum.subject || ""}${logSum.object || ""}`;
    const validInteractNames = new Set(partyMembers);
    // ⚠ 2026-07 修：validInteractNames 是本局的名字集合沒錯，但下面掃「整張表」比對姓名時漏了
    //   sameGame——若別局剛好有同名角色，會被誤判為「在場」而一併累加交談輪數(跨局寫入)。
    pcData.forEach((r, nIdx) => {
      const name = r[COL.PC.NAME];
      if (!name || name === pcName) return;
      if (!sameGame(r)) return;
      if (!logNamesStr.includes(name)) return;
      if (!validInteractNames.has(name)) return;
      dirtyPcRows.add(nIdx);
      let oldMem = String(r[COL.PC.REL_MEM] || "");
      let countMatch = oldMem.match(/\[交談輪數\](\d+)/);
      pcData[nIdx][COL.PC.REL_MEM] = countMatch ? oldMem.replace(/\[交談輪數\]\d+/, `[交談輪數]${parseInt(countMatch[1]) + 1}`) : (oldMem ? oldMem + ` | [交談輪數]1` : `[交談輪數]1`);
    });

    const pcColCount = Object.keys(COL.PC).length;

    // 🔒 競態修(2026-07)：play 豁免寫入鎖(AI 呼叫佔數秒會卡全域)，但上面的列索引是 AI 呼叫【前】
    //   讀到的——期間其他上鎖動作若刪列(清殘列/登入自動清)，索引位移、寫入會落錯列。寫回前做一次
    //   ID 欄窄讀重定位，用「當下的真實列索引」寫；列已被刪→跳過，絕不寫錯人。
    const liveIdx = buildLiveIdIndex_(sheets.pc);

    // MAX_HP/MAX_MP 重算只針對有變動的行，不全表掃描
    dirtyPcRows.forEach(idx => {
      const row = pcData[idx];
      if (!row) return;
      const id = String(row[COL.PC.ID] || "");
      // 🐛→✅ 2026-07 修：漏了 KHV_(直接從英靈庫召喚的同伴，heroToKanshouRow_ 建列)——這類同伴的
      //   好感/肉體/親密記憶全部在記憶體算完卻在這關被過濾掉、永遠沒真的寫回試算表(AI敘述照樣顯示
      //   「好感度+X」，因為顯示行直接讀 aiData.rel_changes、不受這個允許清單影響，造成「有輸出但沒寫入」的假象)。
      //   含慾海角色前綴 KPC_(御主 avatar)／KSV_(封存邀請同伴)／KHV_(直接召喚同伴)，否則後日談的
      //   好感/肉體/衣服/親密狀態寫不回去。
      if (!id.startsWith("PC_") && !id.startsWith("NPC_") && !id.startsWith("DEAD_") && !id.startsWith("KPC_") && !id.startsWith("KSV_") && !id.startsWith("KHV_")) return;
      const curIdx = liveIdx[id];
      if (curIdx === undefined) return; // 列在 AI 呼叫期間被刪(競態) → 安全跳過

      while (row.length < pcColCount) row.push("");

      // ⚔️ 從者/敵從者＝出力電池制：MAX_HP 由召喚公式(150+耐久×6)定、MP 恆 0(無自有魔力池)——
      //   不可用 maxStatsForRow_(凡人公式 100+耐久×10/50+魔力×10)重算，否則 MAX 被改基準、MP 憑空生池，
      //   違反單一真實來源(2026-07 修)。凡人(御主/NPC)照舊重算。
      const _fac = String(row[COL.PC.FACTION] || "");
      if (_fac !== "從者" && _fac !== "敵從者") {
        const maxVals = maxStatsForRow_(row);
        row[COL.PC.MAX_HP] = maxVals.hp;
        row[COL.PC.MAX_MP] = maxVals.mp;
        row[COL.PC.HP] = Math.min(parseInt(row[COL.PC.HP]) || 0, maxVals.hp);
        row[COL.PC.MP] = Math.min(parseInt(row[COL.PC.MP]) || 0, maxVals.mp);
      }

      // 只寫這一行，不寫全表(用重定位後的真實列索引)
      sheets.pc.getRange(curIdx + 1, 1, 1, pcColCount).setValues([row]);
    });

    curL = pcData[pcIndex][COL.PC.LOC];

    const localPeopleList = getLocalPeopleList(sheets, pcName, pcId, curL, pcData);

    let finalResponseText = aiData.narration || "天地混沌，一片寂靜。";
    finalResponseText = finalResponseText.replace(/\n/g, "<br>");






    // 🧹 2026-07 玩家定案「拿掉吧」：好感度渲染(❤️「NPC名」好感度 +N)已整段刪除——這是「好感度
    //   不要顯示在敘述介面上」要求裡唯一還活著、每回合都會實際顯示數字的地方(先前處理的
    //   npc-card／互動選單banner後來查證幾乎不可達，真正的來源在這)。純顯示用途、不影響
    //   rel_changes 本身的好感數值寫入(那段在更上面的 relChangesToProcess.forEach，不受影響)。

    // 🔴 全員血量變化（讀系統真實結算值，AI亂寫value也不影響）
    const hpChangeMsgs = [];
    dirtyPcRows.forEach(idx => {
      const row = pcData[idx];
      if (!row) return;
      const before = hpSnapshot[idx];
      if (before === undefined) return; // 新生成的角色沒快照
      const after = parseInt(row[COL.PC.HP]) || 0;
      if (after === before) return;
      const nm = row[COL.PC.NAME];
      const maxHp = parseInt(row[COL.PC.MAX_HP]) || 100;
      const diff = after - before;
      const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
      const color = diff < 0 ? "#d9534f" : "#2e8b57";
      const isMe = (idx === pcIndex);
      hpChangeMsgs.push(`<span style="color:${color};">${isMe ? "🧍" : "⚔️"} ${nm} ${diffStr} (${after}/${maxHp})</span>`);
    });
    if (hpChangeMsgs.length > 0) {
      finalResponseText += `<br><br><span style="font-size:13px; line-height:1.8;">${hpChangeMsgs.join("<br>")}</span>`;
    }

    // 🔴 玩家魔力變化（生命已由上面清單統一顯示，這裡不重複；金錢經濟層已移除）
    const mpAfter = parseInt(pcData[pcIndex][COL.PC.MP]) || 0;
    const extraMsgs = [];
    const mpDiff = mpAfter - mpBefore;
    if (mpDiff !== 0) extraMsgs.push(`<span style="color:#4169e1;">${mpDiff < 0 ? "💨" : "🌀"} 魔力 ${mpDiff > 0 ? "+" : ""}${mpDiff}</span>`);
    if (extraMsgs.length > 0) {
      finalResponseText += `<br><span style="font-size:13px;">${extraMsgs.join('　')}</span>`;
    }








    // 下面這行不用動，保持原樣：
    // 改這行
    saveGameHistoryBatch(pcId, [
      { speaker: "player", content: userMsg },
      { speaker: "ai", content: aiData.narration || "" }  // 用原始 narration 不用 finalResponseText
    ]);


    return JSON.stringify({
      text: finalResponseText,
      statusString: buildPlayerStatusString(pcData[pcIndex]),
      people: localPeopleList,
      locations: getNearbyLocations(curL, memoryMapData),
      recruited: newlyRecruited,
      options: aiData.options,
      knockedOut: knockedOutList,
      mentionedNames: aiData.mentioned_names || [],
      // 經濟層已移除：不再回傳隨身行囊清單
      myItemNames: [],
      justRevived: justRevived,
      defeat: fatePlayerDefeat, dreamPrompt: fateDreamPrompt, // 🔵 FATE：御主殞命→前端播虛假之夢→老虎道場
      allMapNames: memoryMapData.slice(1).map(m => String(m[COL.MAP.NAME]).trim()).filter(n => n.length >= 2),
      // 🔴 新增：將全部活著的眾生名單傳給前端，用於三段式判定
      allKnownNames: pcData.filter((r, i) => i !== 0 && !String(r[COL.PC.ID]).startsWith("DEAD_")).map(r => String(r[COL.PC.NAME]).trim())
    });

  } catch (e) { return JSON.stringify({ text: "系統錯誤：" + e.message, people: [] }); }
}




// 🗑️ 2026-07：actionClearNpcMajorEvent 已刪——唯一入口「個人史紀」面板已隨回顧類功能整套砍除，
//   這個 action 因此不再有任何按鈕能觸發。COL.PC.MAJOR_EVENT 欄位本身仍在用(見 servantCard_/actionPlay)，未動。


// ==========================================
// 提升御主×從者羈絆（關係表好感）
// ⚡ 2026-07：可選 preData(呼叫端已讀好的整表陣列)——給了就在同一份陣列上【原地改+寫格】
//   (比照 worldTick_/spendAp_ 的 preData 模式)，讓呼叫端的 pcData 保持權威、可直接餵 buildClientState_
//   夾 _state(省一次整表重讀)；沒給(其他呼叫端相容)才自己整表讀一次。
function raiseBond_(sheets, pcName, svName, delta, preData) {
  try {
    const pd = preData || sheets.pc.getDataRange().getValues();
    const mIdx = pd.findIndex(r => String(r[COL.PC.NAME]) === pcName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
    const gid = mIdx !== -1 ? String(pd[mIdx][COL.PC.GAME_ID] || "") : "";
    const nIdx = pd.findIndex(r => String(r[COL.PC.NAME]) === svName && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!gid || String(r[COL.PC.GAME_ID] || "") === gid));
    if (nIdx === -1) return;
    const v = Math.max(0, Math.min(100, (parseInt(pd[nIdx][COL.PC.BOND]) || 0) + delta)); // 地板 0：負 delta(交手削好感)不破底
    pd[nIdx][COL.PC.BOND] = v; // 原地回填(preData 模式下呼叫端陣列即權威；自讀模式下無副作用)
    sheets.pc.getRange(nIdx + 1, COL.PC.BOND + 1).setValue(v);
  } catch (e) { }
}

// 從御主 MEMORY 取出【願望】內容（show-don't-tell：僅供生成虛假之夢，不直述）
function extractWish_(memory) {
  var m = String(memory || "").match(/【願望】([^｜|【\n]+)/);
  return m ? m[1].trim() : "";
}

// 建立「願望實現的虛假之夢」prompt（敗北安慰幻象，之後接老虎道場）
// 敗北虛假之夢（聖杯泥編織的願望成真幻象）。cause==='timeout'＝第14日時限耗盡(破綻改成時鐘停在第14日)；否則＝戰鬥/補魔等敗死。
function buildDreamPrompt_(pcName, wish, servantName, cause) {
  var lead = (cause === 'timeout')
    ? `【虛假之夢·時限耗盡·已裁定】聖杯戰爭的第十四日已盡，御主『${pcName}』終究未能在期限內奪得聖杯，聖杯陷入沉默、戰爭悄然落幕。意識在不甘與疲憊中，墜入聖杯泥所編織的甜美幻象。`
    : `【虛假之夢·已裁定】御主『${pcName}』在聖杯戰爭中敗北，意識墜入聖杯泥所編織的甜美幻象。`;
  var flaw = (cause === 'timeout')
    ? `結尾微露破綻（過於完美的失真，或時鐘永遠停在第十四日的詭異靜止）`
    : `結尾要微微露出破綻（過於完美的失真感）`;
  return lead + `\n` +
    `在這場夢裡，御主的最深願望彷彿已然實現——一切圓滿、溫柔而虛假。${servantName ? `從者『${servantName}』也彷彿仍並肩在側。` : ""}\n` +
    (wish ? `（願望核心參考，僅供構築夢境氛圍，嚴禁逐字複述或直接點明）：${wish}\n` : "") +
    `★以 Fate／TYPE-MOON 筆觸，第二人稱，寫一段唯美而令人心碎的虛假美夢：讓「演出」暗示願望成真的幸福感，絕不可直接說出願望內容或「這是假的」。${servantName ? `從者依其性格自然相伴。` : ""}${flaw}。\n` +
    `★【鐵律】只輸出夢境敘事，禁選項或系統字樣。`;
}

// 🏆 建立「願望終於實現」prompt（勝利·真實非虛假，之後接老虎道場的祝賀版）——與 buildDreamPrompt_ 同一套
//   結構(第二人稱/帶從者入場/引願望氛圍不直述)，但這次是真的：不露破綻，收在踏實的如釋重負而非心碎。
function buildVictoryDreamPrompt_(pcName, wish, servantName) {
  return `【聖杯降臨·已裁定】御主『${pcName}』斬盡了聖杯戰爭中所有的敵對從者，聖杯已然屬於你。\n` +
    `這一刻，最深的願望終於觸手可及——而且這次是真的。${servantName ? `從者『${servantName}』就在你身側，一同見證這一戰的終結。` : ""}\n` +
    (wish ? `（願望核心參考，僅供構築氛圍，嚴禁逐字複述或直接點明）：${wish}\n` : "") +
    `★以 Fate／TYPE-MOON 筆觸，第二人稱，寫一段真摯溫暖的勝利瞬間：讓「演出」暗示願望終於觸手可及的踏實感與如釋重負，絕不可直接說出願望內容。${servantName ? `從者依其性格自然相伴、給出這一刻該有的反應。` : ""}與敗北的虛假之夢不同，這次無需露出任何破綻——這是真實發生的結局。\n` +
    `★【鐵律】只輸出這段敘事，禁選項或系統字樣。`;
}


// ==========================================
// ⚔️ 多目標群戰裁決：解析玩家輸入中的 [攻擊XXX]敘述 標籤，依序逐一裁定
// 中途玩家陣亡則立即停止後續目標，並自動放過本次連擊中已被打昏者（不可能補刀）
// ==========================================

// ==========================================
// 🟢 輕量敘事專用路由：結算已由 GAS 完成，這裡只請 AI 補一段純文字描寫
// 不讀規矩表、不帶歷史、不解析 JSON 數值，token 砍到最低
// ==========================================
// 🧹 把「給 AI 的提示詞」洗成「給玩家看的簡短回顧」：去掉演出依據卡〈…〉、★指令行、──素材──、·條列、【系統標籤】，
//   只留行動梗概並截短。重整歷史時 getGameHistory 顯示的是這個乾淨版，而非整串幕後鷹架。
function cleanNarrateEcho_(promptText) {
  var s = String(promptText || "");
  s = s.replace(/〈[^〉]*〉[^\n]*/g, "");                       // 整段演出依據卡(到行尾)
  s = s.replace(/〔[^〕]*〕/g, "");                              // 卡片前綴標記(〔敵方出戰者〕/〔夜襲者〕·2026-07 補洗)
  s = s.split('\n').filter(function (line) {
    var t = line.trim();
    if (!t) return false;
    if (t.charAt(0) === '★' || t.charAt(0) === '·') return false; // 指令行／素材條列
    if (t.indexOf('──') === 0) return false;                    // 素材分隔
    return true;
  }).join(' ');
  s = s.replace(/【[^】]*】/g, '').replace(/\s+/g, ' ').trim();    // 去【標籤】、收斂空白
  return s.slice(0, 80) || '御主有所行動。';
}

// 🟢 共用敘事核心：帶最近2筆歷史(chatHistory 維持語氣連貫)＋當前狀態(御主/在場從者 HP/MP)，
//   呼叫輕量模型生成一段敘述。回 narrationText；JSON 解析失敗回 null(呼叫端給 fallback)。
//   stateBrief 只給 AI 看、不存歷史。actionNarrateOnly 使用(輕量敘事共用核心)。
function narrateWithState_(pcId, sheets, promptText, miniSystem, opts) {
  opts = opts || {};
  var aiConfig = {
    temperature: 0.85,
    ignoreLaw: true,            // 不疊規矩表(節慶/天時)
    max_tokens: opts.maxTokens || 720,
    model: AI_MODEL,
    isNsfwMode: !!opts.isNsfw    // NSFW 時讓 fallback 文案合理，但不啟用完整慾海規則
  };
  // 帶最近2筆歷史(miniSystem 已告知 AI：歷史是既定事實、不可重演)
  var recentHistoryRaw = getGameHistoryBatchRaw(pcId, 2);
  if (recentHistoryRaw && recentHistoryRaw.length > 0) {
    aiConfig.chatHistory = recentHistoryRaw.map(function (msg) {
      return { role: msg.speaker === "player" ? "user" : "assistant", content: String(msg.content) };
    });
  }
  // 🩸 自動附「當前狀態」(御主＋在場從者 HP/MP)，敘事才連貫(剛被爆打後該寫狼狽、非沒事人)。讀不到就略過。
  // 🧭 2026-07：順帶組「軌跡骨幹」(見 Core_Settings.gs buildTrajectoryDigest_)——沿用同一次整表讀取，
  //   零額外讀表。骨幹接在 system 訊息(miniSystem)後面，結構上永遠排在 callGeminiAPI 組出的
  //   messages 陣列最前面(system → chatHistory → 當前這輪)，精準卡在「最近1輪對話」之前。
  var stateBrief = "";
  var trajectoryDigest = "";
  try {
    var stData = sheets.pc.getDataRange().getValues();
    var stIdx = stData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
    if (stIdx >= 0) {
      var stGid = String(stData[stIdx][COL.PC.GAME_ID] || "");
      var sParts = ['御主 HP ' + (parseInt(stData[stIdx][COL.PC.HP]) || 0) + '/' + (parseInt(stData[stIdx][COL.PC.MAX_HP]) || 0) + '·魔力 ' + (parseInt(stData[stIdx][COL.PC.MP]) || 0) + '/' + (parseInt(stData[stIdx][COL.PC.MAX_MP]) || 0)];
      stData.forEach(function (r) {
        if (String(r[COL.PC.FACTION]) === '從者' && String(r[COL.PC.GAME_ID] || "") === stGid && !String(r[COL.PC.ID]).startsWith('DEAD_')) {
          sParts.push('從者「' + r[COL.PC.NAME] + '」HP ' + (parseInt(r[COL.PC.HP]) || 0) + '/' + (parseInt(r[COL.PC.MAX_HP]) || 0));
        }
      });
      stateBrief = '【當前狀態·供連貫演出，勿複述數字】' + sParts.join('；') + '。\n';
      try { trajectoryDigest = buildTrajectoryDigest_(stData, stGid, stData[stIdx]); } catch (e2) { }
    }
  } catch (e) { }
  var systemWithTrajectory = trajectoryDigest ? (miniSystem + '\n' + trajectoryDigest) : miniSystem;
  var raw = callGeminiAPI(stateBrief + promptText, systemWithTrajectory, aiConfig);
  try {
    var start = raw.indexOf('{'), end = raw.lastIndexOf('}');
    var data = JSON.parse(raw.substring(start, end + 1));
    return data.narration || "天地靜默，一片祥和。";
  } catch (e) { return null; }
}

function actionNarrateOnly(userData, pcId, sheets) {
  const { promptText } = userData;
  // ⚠ 2026-07 修：比照 actionPlay，不再信任前端 userData.isNsfw(同一顆共用 checkbox、同一個
  //   「鑑賞離場不重置」風險)——目前 narrateWithState_ 這條路徑此旗標恰好是死旗標(miniSystem/
  //   max_tokens 皆恆為真值蓋掉它)，但那是巧合安全、非設計安全，一併改成純看 pcId 路由。
  const isNsfw = String(pcId || "").indexOf("KPC_") === 0;

  const miniSystem = `你是《命運停駐之夜》的說書人。用 Fate／TYPE-MOON 筆觸、第一人稱「我」（玩家＝御主）、強制台灣繁體中文，依指令生動描寫一段劇情。【篇幅以下方指令指定的字數為準，務必節奏明快、不灌水、不堆砌華麗辭藻；無指定時預設精煉 100~160 字】。若為從者廝殺，把關鍵攻防、技能與寶具威能寫得有張力即可，不必逐回合流水帳。
【鐵律】
1. 旁白第一人稱「我」，禁用「你」與上帝視角。
2. 對話格式（與全遊戲統一）：（角色動作或神情，例如：微微一笑）角色名：「台詞，或（聲音，如低吟／輕笑）」（角色動作或神情，可省略）。同一段落【不限制】名字出現次數、也不限制括號(動作/聲音)的使用次數與位置——可依演出彈性重複、交錯多輪對話與動作。引號全文僅一層「」、禁嵌『』；純背景／環境描述(非角色動作、非聲音)【不使用括號】，直接以敘事文字呈現，且【盡量精簡】——把篇幅留給互動本身，少花筆墨鋪陳場景氛圍。
3. 強制分段：每2~3句插入 <br><br>，整段至少3個 <br><br>，禁止整坨。換行一律用 <br><br>，禁止真實換行，禁止輸出任何 HTML 標籤。
4. ★這是純敘事補完，系統底層已結算完所有數值，你只負責寫字。
5. ★對話歷史中的內容是「已經發生並結束」的既定事實，僅供掌握語氣與情緒連貫，禁止把歷史中的動作當成本回合又重演一次；本回合唯一真正發生的新事件，只有當前這句指令提供的內容。
6. ★【連貫與當下狀態】務必依【當前狀態】(血量/魔力)與最近歷史承接劇情，但語氣由「實際勝負與狀態」決定、【不可臆測勝敗】：剛大勝→昂揚或警戒餘悸；浴血慘勝→疲憊卻挺立；落敗→負傷狼狽。血魔將盡(瀕死)→命懸一線、窒迫緊繃，嚴禁輕鬆閒適的閒聊感。移動/互動皆接續前情，不可表現得若無其事；但也別把打贏寫成敗走。禁止複述數字、禁止重演歷史動作。
6b.★【服裝與外貌】角色衣著嚴格依角色卡的「外貌本相／此刻裝扮」描寫——【此刻裝扮】(玩家換裝)為最優先、寫什麼穿什麼；卡上沒寫的，【嚴禁】自行讓角色裸露或增減服裝(戰鬥可寫甲冑碎裂衣袂破損、不得自行升級成裸身)；解除結界/隱匿(如風王結界)只顯現【武器】，與衣著無關。
7. 只輸出 JSON：{"narration":"你的敘述，內含<br><br>分段"}，禁止任何其他欄位、禁止 Markdown。`;

  const narrationText = narrateWithState_(pcId, sheets, promptText, miniSystem, { isNsfw: isNsfw, maxTokens: 720 });
  if (narrationText === null) return JSON.stringify({ success: true, text: "（此處因果已定，氣息微微一閃。）" });
  saveGameHistoryBatch(pcId, [
    { speaker: "player", content: cleanNarrateEcho_(promptText) }, // 🧹 存洗淨摘要、非整串提示詞(否則重整歷史會把演出依據/★指令/素材全攤給玩家看)
    { speaker: "ai", content: narrationText }
  ]);
  return JSON.stringify({ success: true, text: narrationText });
}

// 🧹 舊九州連擊戰報路由 actionMultiAttackNarrate 已移除（前端 handleMultiAttack 鏈一併移除；
//    solo 戰鬥走 actionFateBattle＋fate_battle，敘事走 actionNarrateOnly）。

