// ==========================================
// 📖 Router_Narrative.gs — AI 敘事引擎（2026-07 從 Router_Action.gs 拆出）
//   actionPlay(solo/kanshou 共用自由聊天引擎)／史紀／敘事 helper(虛假之夢/輕量敘事共用核心)。
// ==========================================

// ★ 主遊戲邏輯 (PLAY) 
// ==========================================
function actionPlay(userData, pcId, sheets) {
  const userMsg = userData.message;
  // 🌹 慾海(KPC_ 御主)＝NSFW 後日談軌，一律當 NSFW：否則 intimacy/肉體/衣服狀態整段不回填。
  // ⚠ 2026-07 修：原本 solo 仍信 userData.isNsfw——但前端 nsfw-mode-toggle 是整頁共用同一個
  //   checkbox(Script_Kanshou.html 進鑑賞時強制 .checked=true)，applyModeUI() 離開鑑賞時只隱藏它、
  //   從不重置回 false，玩家從鑑賞切回 solo 後只要該勾選格還沒被使用者手動點掉，就會把 isNsfw:true
  //   一路帶進 solo 的 actionPlay，讓「純淨 solo 一律 SFW」這條紅線被一顆殘留的前端旗標繞過——
  //   後端才是唯一可信防線(sanitizeUserData_ 同一哲學)，改成純看 pcId 路由，完全不信任何前端旗標：
  //   非 KPC_(kanshou) 一律鎖 SFW，userData.isNsfw 對 solo 不再有任何作用。
  const isNsfwMode = String(pcId || "").indexOf("KPC_") === 0;
  const finalUserMsg = `【玩家意圖】：${userMsg}`;

  const formatPref = (str) => {
    let arr = String(str || "").split('、');
    // 喜好與厭惡是常態情報，全面開放給 AI 參考
    return `[表象]${arr[0] || "無"} [內裡]${arr[1] || "無"} [喜歡]${arr[2] || "無"} [討厭]${arr[3] || "無"}`;
  };

  const formatTrait = (str) => {
    let arr = String(str || "").split('、');
    let base = `[外貌]${arr[0] || "無"} [氣質舉止]${arr[1] || "無"} [自稱]${arr[2] || "無"}`;
    return isNsfwMode ? `${base} [卸下心防的私密一面]${arr[3] || "無"}` : base;
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

  const partyMembers = pcData.filter(r => r !== pc && String(r[COL.PC.IS_PARTY] || "") === "同行" && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r)).map(r => r[COL.PC.NAME]);
  let partyDetailsArr = [];
  partyMembers.forEach(pName => {
    const r = pcData.find(row => String(row[COL.PC.NAME]).trim() === String(pName).trim() && !String(row[COL.PC.ID]).startsWith("DEAD_"));
    if (r) {
      const nTotal = getCharacterTotalStats(r[COL.PC.ID], sheets, pcData, []);
      const pOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👗 玩家換裝：當前服裝穿著(換衣不換人)
      partyDetailsArr.push(`【同行夥伴】名號:${pName} | 氣血:${r[COL.PC.HP]}/${nTotal.maxHp} | 身世:${r[COL.PC.BACK] || "無"} | 狀態:${r[COL.PC.STATUS]}${pOutfit ? ` | 裝扮:${pOutfit}(當前服裝·五官體態不變)` : ""} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])} | 關係:${r[COL.PC.REL_TAG] || "結伴同行"}(好感:${parseInt(r[COL.PC.BOND]) || 0})`);
    }
  });
  const PROMPT_PARTY_SYSTEM = partyDetailsArr.length > 0 ? `【目前同行隊伍成員命格詳情】:\n${partyDetailsArr.join("\n")}` : "目前沒有同行夥伴，玩家是獨自行動的。";

  const allLocals = pcData.filter((r, i) => i !== 0 && r[COL.PC.ID] != pcId && (r[COL.PC.LOC] === curL) && sameGame(r) && !partyMembers.includes(r[COL.PC.NAME]));
  let displayPeople = allLocals.length > 6 ? allLocals.sort((a, b) => (b[COL.PC.PREF].includes(pcName) ? 1 : 0) - (a[COL.PC.PREF].includes(pcName) ? 1 : 0)).slice(0, 6) : allLocals;

  let PROMPT_ENV = "", PROMPT_GEAR = "", PROMPT_REL = "";

  // 🔴 統一建構 localSceneStr，SFW/NSFW 共用同一份好感抗拒邏輯（羈絆存於該 NPC 自己列的 BOND/REL_TAG/MAJOR_EVENT 欄）
  const localSceneStr = displayPeople.length > 0 ? displayPeople.map(r => {
    let currentFav = parseInt(r[COL.PC.BOND]) || 0;

    let resistPrompt = "";
    if (currentFav <= -50) {
      resistPrompt = "【死仇】恨之入骨，見面即強烈敵意，玩家稍有挑釁便主動出手、下手狠辣。但須符合其身分性格，勝負由雙方實力裁決，非無條件秒殺。";
    } else if (currentFav <= -30) {
      resistPrompt = "【仇視】充滿敵意，會威脅、冷硬驅趕；唯有玩家正面挑釁、動手或羞辱時才反擊，平時不主動攻擊。";
    } else if (currentFav < 0) {
      resistPrompt = "【厭惡戒備】反感、防備、話少。不主動動手，僅在玩家嚴重冒犯或暴力相向時才警告、推開或自衛。";
    } else if (currentFav < 30) {
      resistPrompt = "【陌生】萍水相逢的路人，禮貌而疏離，正常應對，無敵意也不親近。";
    } else if (currentFav < 50) {
      resistPrompt = "【相識】已有基本好感，態度和善，願意閒聊與小忙。";
    } else if (currentFav < 80) {
      resistPrompt = "【友好】信得過的朋友，親近願助，但個性與底線仍在。";
    } else {
      resistPrompt = "【摯友／傾心】允許依賴與配合，但個性語癖與底線永久保留，禁止人格崩壞！";
    }

    let identityTag = String(r[COL.PC.ID]).startsWith("PC_") ? "【另一位玩家】" : "【NPC】";
    if (!String(r[COL.PC.ID]).startsWith("PC_")) {
      identityTag += partyMembers.includes(r[COL.PC.NAME]) ? "【同行伴侶】" : "【同地路人/嚴禁強制互動】";
    }

    const majorEventStr = (r[COL.PC.MAJOR_EVENT] && r[COL.PC.MAJOR_EVENT] !== "無")
      ? ` [未完成約定:${r[COL.PC.MAJOR_EVENT]}]` : "";
    // ⚠ 2026-07 修：原本 SFW/NSFW 共用的這行完全沒讀 COL.PC.INTENT(萌點)——只有 NSFW 分支的
    //   nsfwMemories 另外補了一次，導致遊戲主體(SFW solo)的日常對話反而拿不到萌點反差錨點
    //   (伊莉雅冷漠案同一類根因)。改成這裡統一補上，NSFW 那份重複的移除，單一真實來源。
    const moeStr = String(r[COL.PC.INTENT] || "").trim();

    return `${identityTag}名號:${r[COL.PC.NAME]} 【性別:${r[COL.PC.SEX]}】 陣營:${r[COL.PC.FACTION] || "無"} | 性格:${formatPref(r[COL.PC.PREF])} | 特徵:${formatTrait(r[COL.PC.TRAIT])}${moeStr ? ` | 萌點(反差·僅供內化):${moeStr}` : ""} | 身世:${String(r[COL.PC.BACK] || "來歷不詳")}(僅供內化演出·show-don't-tell·禁直述、禁預告其原作後續結局) | 關係:${r[COL.PC.REL_TAG] || "萍水相逢"}(好感:${currentFav}${majorEventStr} -> 行為準則:${resistPrompt})`;
  }).join("\n") : "此地四下無人。";

  if (isNsfwMode) {
    PROMPT_ENV = `【感知屏蔽】：外界感知已封鎖。請專注於當下空間氛圍與私密互動。`;
    PROMPT_GEAR = `【武裝與情報】：(暫時屏蔽)`;

    // 🟢 新增：性別配對提示，直接算好給 AI，不需要它自己推理
    let genderHintStr = "";
    const presentRowsForGender = pcData.filter((r, i) => i !== 0 && r[COL.PC.ID] != pcId && r[COL.PC.LOC] === curL && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_"));
    if (presentRowsForGender.length > 0) {
      const playerSex = pc[COL.PC.SEX] || "未知";
      const pairHints = presentRowsForGender.map(r => {
        const npcSex = r[COL.PC.SEX] || "未知";
        let combo = "";
        if (playerSex === "女" && npcSex === "女") combo = "女女配對：禁止插入式陽具動作，肉棒欄位雙方皆填「無」，以手指/舌頭/器物替代器官接觸";
        else if (playerSex === "男" && npcSex === "男") combo = "男男配對：依雙方實際器官裁決動作邏輯";
        else combo = `${playerSex}(${pcName}) × ${npcSex}(${r[COL.PC.NAME]})配對：依雙方實際性別器官裁決`;
        return `${r[COL.PC.NAME]}：${combo}`;
      });
      genderHintStr = `\n★【性別配對核對】：${pairHints.join("；")}`;
    }

    let pPhysicalObj = JSON.parse(pcData[pcIndex][COL.PC.PHYSICAL] || "{}");
    if (Object.keys(pPhysicalObj).length === 0) {
      pPhysicalObj = { "蜜穴": "未開", "菊穴": "緊閉" };
    }
    let pSkills = (pcData[pcIndex][COL.PC.MEMORY] || "無").replace(/\[雙修技巧\](.*?)(?=\| \[|$)/, (m, p1) => `[雙修技巧]${p1.trim().split('、').slice(0, 5).join('、')}`);
    let nsfwMemories = `\n[玩家『${pcName}』狀態]：${pcData[pcIndex][COL.PC.STATUS]}\n[玩家『${pcName}』肉體]：${JSON.stringify(pPhysicalObj)}\n[身體記憶]：${pSkills}`;

    let allPresentRows = pcData.filter((r, i) => i !== 0 && r[COL.PC.ID] != pcId && r[COL.PC.LOC] === curL && sameGame(r) && !String(r[COL.PC.ID]).startsWith("DEAD_"));
    allPresentRows.forEach(r => {
      let npcPhysicalObj = JSON.parse(r[COL.PC.PHYSICAL] || "{}");
      if (Object.keys(npcPhysicalObj).length === 0) npcPhysicalObj = { "蜜穴": "未開" };
      let npcSkills = (r[COL.PC.MEMORY] || "無").replace(/\[雙修技巧\](.*?)(?=\| \[|$)/, (m, p1) => `[雙修技巧]${p1.trim().split('、').slice(0, 5).join('、')}`);
      let relMem = r[COL.PC.REL_MEM] || "無";
      let npcOutfit = getOutfit_(r[COL.PC.MEMORY]); // 👗 玩家換裝：當前服裝穿著(換衣不換人·五官體態依本相)
      // ⚠ 2026-07 修：萌點併進上面共用的 localSceneStr(SFW/NSFW 皆讀)後，這裡不再重複附一次。
      nsfwMemories += `\n[${r[COL.PC.NAME]} 狀態]：${buildVisibleStatusString(r[COL.PC.STATUS])}${npcOutfit ? `\n[${r[COL.PC.NAME]} 裝扮]：${npcOutfit}（玩家指定當前服裝·五官/髮色/體態不變）` : ""}\n[${r[COL.PC.NAME]} 肉體]：${JSON.stringify(npcPhysicalObj)}\n[快照]：[技巧]${npcSkills} | [羈絆]${relMem}`;
    });

    PROMPT_REL = `【當前同地人物】\n${localSceneStr}\n★【情境延續鐵律】：請繼續往後推演！${nsfwMemories}${genderHintStr}
🛑【角色一致性鐵律】：NPC 的反應必須【死守】其「性格」與目前「好感度」的真實落差——好感未滿 80、或性格屬於冷酷/高傲/剛烈者，依這個設定判斷此刻合理的抗拒/抵觸程度演出，不因劇情推進就無視好感度線性軟化。即便肉體有生理反應，靈魂與對話的態度仍以角色設定為準。`;

  } else {
    // 🎴 solo(SFW)：舊版情報/勢力/我的家系統已移除，環境欄留空，只給寶具與在場人物。
    PROMPT_ENV = "";
    PROMPT_GEAR = `【寶具／技藝】：${pcData[pcIndex][COL.PC.MARTIAL] || "尚無"}`;
    PROMPT_REL = `【當前同地人物】\n${localSceneStr}`;
  }

  // ⚠ 2026-07 修：原句「請包含...的對話」讀起來像強制指令全員都要出聲，跟緊鄰的
  //   「同地路人/嚴禁強制互動」標籤互相矛盾——玩家只想找同行從者講話，卻可能被這行逼得
  //   連路人 B、C 都插話。改成「姓名參考用」措辭：只提供正確姓名給 AI 拼字用，
  //   是否真的互動仍完全依上方【在場驗證鐵律】與各人的強制互動限制判斷。
  const npcDialoguePrompt = displayPeople.length > 0 ? `\n★【姓名參考】：若對話對象在此清單內，請使用真實姓名「${displayPeople.map(r => r[COL.PC.NAME]).join("、")}」，不得另編新名字；是否互動仍依上方在場規則與各人強制互動限制判斷，非清單所有人都要出聲。` : "";


  // 🔴【替換開始】淨化後的 prompt 組裝
  const prompt = `【敘事法旨】：當前推演視角鎖定為玩家『${pcName}』(ID: ${pcId})。
${PROMPT_PARTY_SYSTEM}
【玩家命格】：名號:${pcName} 【性別:${pc[COL.PC.SEX]}】 性格:${pc[COL.PC.PREF]} | 特徵:${pc[COL.PC.TRAIT]} | 軟肋:【 ${currentAmbition} 】 | 身世:${pc[COL.PC.BACK] || "來歷不明"} | 位置:${curL} | 狀態:${pc[COL.PC.STATUS] || "氣息平穩"} | 生命:${pc[COL.PC.HP]}/${pc[COL.PC.MAX_HP]} | 魔力:${pc[COL.PC.MP]}/${pc[COL.PC.MAX_MP]}${((parseInt(pc[COL.PC.HP]) || 0) <= Math.max(1, Math.round((parseInt(pc[COL.PC.MAX_HP]) || 1) * 0.15)) || (parseInt(pc[COL.PC.MP]) || 0) <= Math.round((parseInt(pc[COL.PC.MAX_MP]) || 1) * 0.1)) ? '\n★【瀕死·最高張力】御主氣力放盡、命懸一線(見上方血/魔)——敘述須透出窒迫沉重、孤注一擲的緊繃，連從者氣場都因御主將枯竭而繃緊；嚴禁輕鬆閒適的閒聊感。' : ''}

${PROMPT_ENV}
${PROMPT_GEAR}

${PROMPT_REL}
★【在場驗證鐵律——最高優先級，下筆前必看】：本回合可登場、說話、互動的角色，僅限【目前同行隊伍成員】、緊鄰上方【當前同地人物】清單列出之人，${isNsfwMode ? "本回合為慾海模式(私密場景已隔絕外界)，【絕對禁止】由AI自行安排任何全新陌生人登場打斷或闖入；唯獨玩家本回合輸入內容【明確主動】表達邀請、招呼、引入第三人等意圖時(如呼喚他人加入、開門讓人進來等)，才可讓該玩家指定或暗示的新角色登場，AI不得自作主張額外加碼安排其他陌生人" : "以及AI當下【全新初次原創】、從未出現於歷史紀錄/話題情報中的陌生角色(如路人、店家、新面孔，可正常開口說話、給予姓名)"}！歷史紀錄、話題情報中提到的「已知但不在此清單內」之姓名，才視為不在場的回憶，嚴禁無視「同地」設定憑空召喚、穿越或讓其開口說話、出手！若【當前同地人物】顯示「此地四下無人」，本回合除玩家、同行夥伴${isNsfwMode ? "、以及玩家本回合主動引入之人" : "、與全新原創的陌生人"}外，不可讓任何${isNsfwMode ? "" : "「歷史已知」"}具名角色登場！
${isKanshou ? "" : `
★【系統底層防呆·戰鬥雙向裁決】：發生衝突時綜合比對雙方靈基/實力/環境/戰術公平裁決，禁止單方面秒殺玩家；傷害以相對扣血呈現，允許玩家受傷/纏鬥/撤退/奇謀逆襲；惟聖杯戰爭的從者廝殺一律由系統按鈕裁決，敘述不得自行宣告死亡或輸出生命數值變化。
`}
${isKanshou ? `
💕【鑑賞·後日談模式·最高優先級覆寫】：聖杯戰爭【早已落幕】，這是奪得聖杯後與從者『${displayPeople.length ? displayPeople.map(r => r[COL.PC.NAME]).join("、") : "你的從者"}』共度的【和平日常／約會時光】。
★【絕對禁止】任何戰鬥、廝殺、敵人、敵御主、敵從者、聖杯爭奪、靈基受損、血量／生命變化、寶具對轟、死亡或威脅。世界是安全的。
★氛圍＝溫柔、悠閒、戀愛向的日常：散步、閒聊、吃東西、看風景、逛冬木街景。讓從者貼近其官方性格自然地與御主相處互動。
★【演出而非說明】不得直述其願望／萌點／個性字面。嚴禁輸出任何 stat_changes 生命變化、戰鬥裁決。可有 rel_changes(好感)。
★敘事結束停在溫柔的留白，把下一步交還御主。
` : ""}現在演化玩家動作：『${finalUserMsg}』${npcDialoguePrompt}

🚨【敘事終極警告】：
1. 敘事必須在給出結果後，停在「我」的心境，將下一步交還玩家選擇！
2.【名字提取鐵律】：在輸出 stat_changes 或 rel_changes 等任何 JSON 數據時，'target' 或 'npc' 欄位【絕對只能】填寫角色的「真實姓名」（例如：「遠坂凜」）或「自己」。❌嚴禁填入台詞、對話、地名、動作描述或任何標點符號！若名字抓取錯誤將導致解析錯亂！`;

  try {
    let aiConfig = isNsfwMode ? { temperature: 1.0, top_p: 0.95, retries: 2, model: "google/gemini-3.1-flash-lite", isNsfwMode: true } : {};
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
    // 🎴 solo：地圖只走 GAS 坤圖／玩家移動，不讓 AI 在自由敘事裡新增地點（鑑賞約會大地圖才允許 AI 即興擴張）
    if (isNsfwMode && aiData.new_maps && Array.isArray(aiData.new_maps) && sheets.map) {
      let mapsToAppend = [];
      aiData.new_maps.forEach(m => {
        let fullName = String(m.name || "").trim();
        if (fullName && !memoryMapData.some(r => String(r[COL.MAP.NAME] || "").trim() === fullName)) {
          let parentName = fullName.includes('-') ? fullName.split('-')[0].trim() : "";
          let parentNode = memoryMapData.find(r => String(r[COL.MAP.NAME] || "").trim() === parentName);
          let mapType = parentNode ? parentNode[COL.MAP.TYPE] : (m.type || "險地");
          let coordStrObj = parentNode && parentNode[COL.MAP.COORD] ? String(parentNode[COL.MAP.COORD]) : "0,0";
          let coordStr, attempts = 0;
          let baseX = parseInt(coordStrObj.split(',')[0]) || 0;
          let baseY = parseInt(coordStrObj.split(',')[1]) || 0;
          do {
            // 🔴 修正：隨嘗試次數擴大搜尋半徑，避免子節點擠在父座標周圍 9 格而耗盡、導致座標重複堆疊
            let spread = parentNode ? (1 + Math.floor(attempts / 8)) : 60;
            let offsetX = Math.floor(Math.random() * (spread * 2 + 1)) - spread;
            let offsetY = Math.floor(Math.random() * (spread * 2 + 1)) - spread;
            coordStr = `${baseX + offsetX},${baseY + offsetY}`;
            attempts++; // 🔴 修正：原本漏了遞增，導致 attempts<200 防呆煞車永遠失效、可能無限迴圈逾時
          } while (memoryMapData.some(r => String(r[COL.MAP.COORD] || "").trim() === coordStr) && attempts < 200);

          const newMapRow = ["冬木", fullName, mapType, coordStr, m.desc || "未知地界。", parentName];
          mapsToAppend.push(newMapRow); memoryMapData.push(newMapRow);
        }
      });
      if (mapsToAppend.length > 0) {
        sheets.map.getRange(sheets.map.getLastRow() + 1, 1, mapsToAppend.length, 6).setValues(mapsToAppend);
        CacheService.getScriptCache().remove("FATE_MAP_DATA");
      }
    }

    // 🔴 血量快照：記錄所有人變化前的血量，供結尾比對真實扣血
    const hpSnapshot = {};
    pcData.forEach((row, idx) => {
      if (idx === 0) return;
      if (String(row[COL.PC.ID] || "").startsWith("DEAD_")) return;
      hpSnapshot[idx] = parseInt(row[COL.PC.HP]) || 0;
    });
    const mpBefore = parseInt(pcData[pcIndex][COL.PC.MP]) || 0;


    if (aiData.stat_changes && Array.isArray(aiData.stat_changes)) {
      Logger.log("stat_changes: " + JSON.stringify(aiData.stat_changes));


      // 🎴 FATE：AI 的 stat_changes 只准更新「外顯狀態」(衣服/姿勢/負面/顏面)；
      //   位置/生命/魔力/陣營/貢獻/身世 一律由 GAS(按鈕/戰鬥)裁定，AI 寫了也忽略。
      const visibleStateKeys = ["衣服", "姿勢", "負面", "顏面"];

      aiData.stat_changes.forEach(sc => {
        const tName = String(sc.target).trim(); const attrKey = String(sc.attr).trim(); const valStr = String(sc.value).trim();
        let targetIdx = (tName === "自己" || tName === String(pcName).trim()) ? pcIndex : pcData.findIndex(r => (String(r[COL.PC.NAME]).trim() === tName || String(r[COL.PC.ID]).trim() === tName) && (!myGameId || String(r[COL.PC.GAME_ID] || "") === myGameId));

        if (targetIdx !== -1) {
          dirtyPcRows.add(targetIdx);

          // 🔴 支援 AI 合併輸出，例如 attr:"姿勢/衣服/負面/顏面"
          if (attrKey.includes('/') && valStr.includes('/')) {
            const attrParts = attrKey.split('/').map(a => a.trim());
            const valParts = valStr.split('/').map(v => v.trim());
            attrParts.forEach((a, i) => {
              if (visibleStateKeys.includes(a)) {
                let currentVs = parseVisibleStatus(pcData[targetIdx][COL.PC.STATUS]);
                currentVs[a] = valParts[i] || "無";
                pcData[targetIdx][COL.PC.STATUS] = JSON.stringify(currentVs);
              }
            });
            return;
          }
          if (visibleStateKeys.includes(attrKey)) {
            let currentVs = parseVisibleStatus(pcData[targetIdx][COL.PC.STATUS]);
            currentVs[attrKey] = valStr; pcData[targetIdx][COL.PC.STATUS] = JSON.stringify(currentVs); return;
          }

          // 其餘 attr(位置/生命/魔力/陣營/貢獻/身世)一律忽略——GAS 掌數值、戰鬥裁定生死，AI 不寫。
        }
      });
    }








    // 經濟層（物品/金錢/任務）已全數移除：items_gained / items_transferred / money_transferred / items_lost / items_used 不再落地。

    // 🎴 solo：招募(新角色入隊)只走 GAS（召喚從者／破戒奪僕／結盟），不讓 AI 在自由敘事裡招募人；鑑賞才允許
    let newlyRecruited = (isNsfwMode && aiData.recruited && Array.isArray(aiData.recruited)) ? aiData.recruited.map(n => String(n).trim()) : [];
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

        // 🎴 solo：好感收歸 GAS——只有羈絆/補魔/結盟等按鈕能動好感，AI 自由敘事不得改好感數值（鑑賞才允許 AI 推進好感）
        let change = isNsfwMode ? (parseInt(rc.fav_change) || 0) : 0;
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

      const sanitizePhysicalState = (rawState, isPlayer = false) => {
        if (!rawState || typeof rawState !== 'object') return {};
        let cleanState = {};
        // 🔴 AI現在以數字代碼輸出(1~5)，此處解碼回內部真實詞；保留舊文字key作防呆相容
        // 🔴 雙手已由右手/左手兩格合併為單一「雙手」；舊代碼5與舊文字key右手/左手一律映射回雙手相容
        const keyMapping = { "陰道": "蜜穴", "陰莖": "肉棒", "屁眼": "菊穴", "1": "蜜穴", "2": "肉棒", "3": "菊穴", "4": "雙手", "5": "雙手", "右手": "雙手", "左手": "雙手" };
        const allowedKeys = ["蜜穴", "肉棒", "菊穴", "雙手"];
        Object.keys(rawState).forEach(k => {
          let standardKey = keyMapping[k] || k;
          let val = String(rawState[k]).trim();
          if (allowedKeys.includes(standardKey) && !ignoreWords.includes(val)) {
            cleanState[standardKey] = val;
          }
        });
        return cleanState;
      };

      const mergeVisibleState = (oldStatusStr, newVsObj) => {
        let currentVs = parseVisibleStatus(oldStatusStr);
        if (newVsObj && typeof newVsObj === 'object') {
          for (let k in newVsObj) {
            let val = String(newVsObj[k]).trim();
            // 只有當 AI 給出具體狀態，且不是敷衍用語時才更新
            if (val && val !== "無" && !ignoreWords.includes(val)) {
              currentVs[k] = val;
            }
          }
        }
        return JSON.stringify(currentVs);
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

      if (isNsfwMode && aiData.intimacy_feedback.player) {
        const pfb = aiData.intimacy_feedback.player;
        if (pfb.visible_state) pcData[pcIndex][COL.PC.STATUS] = mergeVisibleState(pcData[pcIndex][COL.PC.STATUS], pfb.visible_state);
        if (pfb.physical_state) pcData[pcIndex][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[pcIndex][COL.PC.PHYSICAL], sanitizePhysicalState(pfb.physical_state));

        let oldPMem = pcData[pcIndex][COL.PC.MEMORY] || "";
        pcData[pcIndex][COL.PC.MEMORY] = `[雙修技巧]${processSkills(oldPMem, pfb.dynamic_skills)} | [性愛時敏感部位]${processTags(oldPMem, /\[性愛時敏感部位\](.*?)(?=\| \[|$)/, pfb.erogenous_zones, 5)}`;
      }

      if (aiData.intimacy_feedback.npcs) {
        aiData.intimacy_feedback.npcs.forEach(nfb => {
          const tName = String(nfb.name).trim();
          const targetIdx = pcData.findIndex(r => r[COL.PC.NAME] === tName && !String(r[COL.PC.ID]).startsWith("DEAD_") && sameGame(r));
          if (targetIdx === -1) return;

          if (isNsfwMode) {
            dirtyPcRows.add(targetIdx); // 🔴 新增
            if (nfb.visible_state) {
              pcData[targetIdx][COL.PC.STATUS] = mergeVisibleState(pcData[targetIdx][COL.PC.STATUS], nfb.visible_state);
            }
            if (nfb.physical_state) {
              pcData[targetIdx][COL.PC.PHYSICAL] = mergePhysicalStatus(pcData[targetIdx][COL.PC.PHYSICAL], sanitizePhysicalState(nfb.physical_state));
            }
            if (nfb.dynamic_skills || nfb.erogenous_zones) {
              let oldNMem = pcData[targetIdx][COL.PC.MEMORY] || "";
              pcData[targetIdx][COL.PC.MEMORY] = `[雙修技巧]${processSkills(oldNMem, nfb.dynamic_skills)} | [性愛時敏感部位]${processTags(oldNMem, /\[性愛時敏感部位\](.*?)(?=\| \[|$)/, nfb.erogenous_zones, 5)}`;
            }
          }

          // 羈絆記憶(專屬稱呼/親密次數/交談輪數)已併入該 NPC 自己列的 REL_MEM 欄
          dirtyPcRows.add(targetIdx);
          let oldRMem = pcData[targetIdx][COL.PC.REL_MEM] || "";
          let count = (oldRMem.match(/\[親密次數\](\d+)/) || [])[1] ? parseInt((oldRMem.match(/\[親密次數\](\d+)/) || [])[1]) : 0;
          if (isNsfwMode) count += 1;
          let talkStr = (oldRMem.match(/\[交談輪數\](\d+)/) || [])[1] ? ` | [交談輪數]${(oldRMem.match(/\[交談輪數\](\d+)/) || [])[1]}` : "";
          pcData[targetIdx][COL.PC.REL_MEM] = `[專屬稱呼]${processTags(oldRMem, /\[專屬稱呼\](.*?)(?=\| \[|$)/, nfb.mutual_nicknames, 3)} | [親密次數]${count}${talkStr}`;
        });
      }
    }

    partyMembers.forEach(pName => {
      const nIdx = pcData.findIndex(r => r[COL.PC.NAME] === pName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
      if (nIdx !== -1) {
        pcData[nIdx][COL.PC.LOC] = pcData[pcIndex][COL.PC.LOC];
        dirtyPcRows.add(nIdx); // 🔴 加進去才會寫入
      }
    });

    // 📖 交談輪數：本回合有互動意圖提及的在場人物，累計交談輪數於其自己列的 REL_MEM 欄
    const logSum = aiData.log_summary || {};
    const validInteractNames = new Set([
      ...displayPeople.map(r => r[COL.PC.NAME]),
      ...partyMembers
    ]);
    pcData.forEach((r, nIdx) => {
      const name = r[COL.PC.NAME];
      if (!name || name === pcName) return;
      if (!String(logSum.people).includes(name)) return;
      if (!validInteractNames.has(name)) return;
      dirtyPcRows.add(nIdx);
      let oldMem = String(r[COL.PC.REL_MEM] || "");
      let countMatch = oldMem.match(/\[交談輪數\](\d+)/);
      pcData[nIdx][COL.PC.REL_MEM] = countMatch ? oldMem.replace(/\[交談輪數\]\d+/, `[交談輪數]${parseInt(countMatch[1]) + 1}`) : (oldMem ? oldMem + ` | [交談輪數]1` : `[交談輪數]1`);
    });

    const pcColCount = Object.keys(COL.PC).length;

    // MAX_HP/MAX_MP 重算只針對有變動的行，不全表掃描
    dirtyPcRows.forEach(idx => {
      const row = pcData[idx];
      if (!row) return;
      const id = String(row[COL.PC.ID] || "");
      // 🌹 含慾海角色前綴 KPC_(御主 avatar)／KSV_(同伴從者)，否則後日談的肉體/衣服/親密狀態寫不回去
      if (!id.startsWith("PC_") && !id.startsWith("NPC_") && !id.startsWith("DEAD_") && !id.startsWith("KPC_") && !id.startsWith("KSV_")) return;

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

      // 只寫這一行，不寫全表
      sheets.pc.getRange(idx + 1, 1, 1, pcColCount).setValues([row]);
    });

    curL = pcData[pcIndex][COL.PC.LOC];

    const localPeopleList = getLocalPeopleList(sheets, pcName, pcId, curL, pcData);

    let finalResponseText = aiData.narration || "天地混沌，一片寂靜。";
    finalResponseText = finalResponseText.replace(/\n/g, "<br>");






    // 🔴 好感度渲染（經濟層物品/金錢渲染已移除）。🎴 solo 好感已收歸 GAS、AI 不動好感 → 不渲染 AI 的好感數字（鑑賞才顯示）
    if (isNsfwMode && aiData.rel_changes && Array.isArray(aiData.rel_changes)) {
      aiData.rel_changes.forEach(rc => {
        const change = parseInt(rc.fav_change) || 0;
        if (change === 0) return; // 沒變動就跳過

        const icon = change > 0 ? "❤️" : "💔";
        const color = change > 0 ? "#e91e63" : "#555";
        const sign = change > 0 ? "+" : "";

        finalResponseText += `<br><br><span style="color:${color}; font-size:13px; font-weight:bold;">${icon} 「${rc.target}」好感度 ${sign}${change}</span>`;
      });
    }

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
function raiseBond_(sheets, pcName, svName, delta) {
  try {
    const pd = sheets.pc.getDataRange().getValues();
    const mIdx = pd.findIndex(r => String(r[COL.PC.NAME]) === pcName && !String(r[COL.PC.ID]).startsWith("DEAD_"));
    const gid = mIdx !== -1 ? String(pd[mIdx][COL.PC.GAME_ID] || "") : "";
    const nIdx = pd.findIndex(r => String(r[COL.PC.NAME]) === svName && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!gid || String(r[COL.PC.GAME_ID] || "") === gid));
    if (nIdx === -1) return;
    const v = Math.max(0, Math.min(100, (parseInt(pd[nIdx][COL.PC.BOND]) || 0) + delta)); // 地板 0：負 delta(交手削好感)不破底
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
    model: "google/gemini-3.1-flash-lite",
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
  var stateBrief = "";
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
    }
  } catch (e) { }
  var raw = callGeminiAPI(stateBrief + promptText, miniSystem, aiConfig);
  try {
    var start = raw.indexOf('{'), end = raw.lastIndexOf('}');
    var data = JSON.parse(raw.substring(start, end + 1));
    return data.narration || "天地靜默，一片祥和。";
  } catch (e) { return null; }
}

function actionNarrateOnly(userData, pcId, sheets) {
  const { promptText, isNsfw } = userData;

  const miniSystem = `你是《命運停駐之夜》的說書人。用 Fate／TYPE-MOON 筆觸、第一人稱「我」（玩家＝御主）、強制台灣繁體中文，依指令生動描寫一段劇情。【篇幅以下方指令指定的字數為準，務必節奏明快、不灌水、不堆砌華麗辭藻；無指定時預設精煉 100~160 字】。若為從者廝殺，把關鍵攻防、技能與寶具威能寫得有張力即可，不必逐回合流水帳。
【鐵律】
1. 旁白第一人稱「我」，禁用「你」與上帝視角。
2. 對話格式：角色名：「（動作/神態/眼神/微表情）台詞……（動作/神態/眼神/微表情）台詞（動作/神態/眼神/微表情）」。動作神態【絕對禁止】獨立成段或寫在引號外，一律用全形括號「（）」嵌入台詞開頭/中間/結尾，至少穿插2次以上。
3. 強制分段：每2~3句插入 <br><br>，整段至少3個 <br><br>，禁止整坨。換行一律用 <br><br>，禁止真實換行，禁止輸出任何 HTML 標籤。
4. ★這是純敘事補完，系統底層已結算完所有數值，你只負責寫字。
5. ★對話歷史中的內容是「已經發生並結束」的既定事實，僅供掌握語氣與情緒連貫，禁止把歷史中的動作當成本回合又重演一次；本回合唯一真正發生的新事件，只有當前這句指令提供的內容。
6. ★【連貫與當下狀態】務必依【當前狀態】(血量/魔力)與最近歷史承接劇情，但語氣由「實際勝負與狀態」決定、【不可臆測勝敗】：剛大勝→昂揚或警戒餘悸；浴血慘勝→疲憊卻挺立；落敗→負傷狼狽。血魔將盡(瀕死)→命懸一線、窒迫緊繃，嚴禁輕鬆閒適的閒聊感。移動/互動皆接續前情，不可表現得若無其事；但也別把打贏寫成敗走。禁止複述數字、禁止重演歷史動作。
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

