// ==========================================
// 🔴【第二部分：LLM 核心調用與網頁進入點】Engine_Combat.gs
// ==========================================

function buildDefaultSystemPrompt(isNsfwMode, backLocked) {
  // 1. 萃取共通的 JSON 基礎結構 (Base Template)
  // 🔵 FATE 精簡範本：聖杯戰爭單人版不含物品/金錢/任務/招募/地圖生成等舊系統，
  //   故 JSON 只保留 敘述／選項／外顯狀態／好感／提及人名／日誌，大幅縮減每次 API 的輸入字數。
  const baseJson = {
    "narration": isNsfwMode ? "極致細膩動人的劇情描述(約600字，第一人稱，嚴禁替玩家做決定；篇幅務必充足，但長度靠情感起伏、神態心理、氛圍張力與對話堆疊撐起，而非器官部位逐項點名)..." : "劇情描述(約200字，第一人稱，節奏明快不灌水，嚴禁替玩家做決定)...",
    "options": ["1. [主動]強勢掌握主導...", "2. [被動]順從委婉試探...", "3. [接續]順劇情延續互動...", "4. [反差]跳脫氛圍的驚人舉動..."],
    "stat_changes": [
      { "target": "角色名號", "attr": "姿勢/衣服/負面/顏面", "value": "跌坐/衣衫破爛/重傷/慘白" }
    ],
    "rel_changes": [{ "target": "NPC名", "fav_change": 3, "tag": "無", "major_event": "無" }],
    "mentioned_names": ["劇情中出現的具名角色名字，不含玩家自己"],
    "log_summary": { "subject": "主動方真名", "object": "被動/承受方真名(三人以上填眾人)", "event": "誰對誰做了什麼+對方反應，須含明確主被動方向，50字內", "tag": "閒聊/承諾/秘密/變故，四選一" }
  };

  // 2. 根據模式動態覆寫或擴充專屬欄位
  const _visibleState = {
    "衣服": "裸露/衣著狀態(≤12字)",
    "姿勢": "體位姿態(≤15字)",
    "負面": "無/狀態(≤5字)",
    "顏面": "神情潮紅(≤12字)"
  };

  // 🔴 key改數字代碼(1=陰道 2=陽具 3=後穴 4=雙手)，避免AI每回合輸出原始器官字。
  // 雙手原本拆右手/左手兩格過度瑣碎，已合併為單一「雙手」格。
  const _physicalState = {
    "1": "陰道狀態(≤15字)",
    "2": "陽具狀態(≤15字)",
    "3": "後穴狀態(≤15字)",
    "4": "雙手動作(≤15字)"
  };

  // 🔴 npc的範本欄位全填「同上」：Router_Action.gs解析intimacy_feedback時的ignoreWords防呆清單本就含「同上」，
  // 即使AI偷懶照抄範本字面值也會被當成敷衍語忽略、不會寫進玩家看到的狀態欄，省字數不引入新的失敗模式。
  const _visibleStateRef = { "衣服": "同上", "姿勢": "同上", "負面": "同上", "顏面": "同上" };
  const _physicalStateRef = { "1": "同上", "2": "同上", "3": "同上", "4": "同上" };

  // 🔴 NSFW模式：只專注情慾本身，雜務(物品/金錢/陣營/任務/招募/地圖/戰鬥數值)本回合完全不追蹤、
  // 不出現在輸出範本內，大幅縮減 JSON 範本字數；SFW(純淨模式)的 baseJson 維持完整不動。
  let finalJson;
  if (isNsfwMode) {
    finalJson = {
      "narration": baseJson.narration,
      "options": baseJson.options,
      "intimacy_feedback": {
        "_note": "★visible_state與physical_state各欄皆角色「自身」當下肉體狀態，純肢體與感官、禁內心戲，第三人稱填寫，省略=維持原樣，無對應器官/動作填無，絕對禁寫'自己'。npcs每位與player共用此格式，依其實際狀態填寫對應欄位。",
        "player": {
          "visible_state": _visibleState,
          "physical_state": _physicalState,
          "dynamic_skills": "雙修技巧名(2~5字，無填無)",
          "erogenous_zones": "無"
        },
        "npcs": [{
          "name": "NPC實際名字",
          "visible_state": _visibleStateRef,
          "physical_state": _physicalStateRef,
          "dynamic_skills": "雙修技巧名(2~5字，無填無)",
          "erogenous_zones": "無",
          "mutual_nicknames": "無"
        }]
      },
      "rel_changes": baseJson.rel_changes,
      "mentioned_names": baseJson.mentioned_names,
      // 🔴 慾海模式event欄位禁止描述肉體細節：實際因果文字改由GAS固定樣式生成(隱晦化)，AI只需給方向與標籤
      "log_summary": { "subject": "主動方真名", "object": "被動/承受方真名(三人以上填眾人)", "event": "無須填寫實際肉體細節，僅需10字內極簡概括(如'共度春宵')", "tag": baseJson.log_summary.tag }
    };
  } else {
    baseJson.intimacy_feedback = { "npcs": [{ "name": "NPC名", "mutual_nicknames": "無" }] };
    finalJson = baseJson;
    delete finalJson.options; // 🎴 solo：純按鍵＋AI敘述，不要AI自己生選項——選項一律來自遊戲按鍵，不靠AI建議
  }

  // 3. 組合共通鐵律 Prompt (極致超壓縮版)
  // 🔴 SFW(純淨模式)維持完整鐵律不動，是規則最完整的模式。
  const sfwBaseRules = `你是《命運停駐之夜》聖杯戰爭的敘事核心，以 Fate／TYPE-MOON 的筆觸推演因果，強制台灣繁體中文。第一人稱「我」（玩家＝御主），禁上帝視角。世界觀＝冬木的聖杯戰爭：魔術師（御主）締結令咒、召喚英靈（從者），為聖杯相互廝殺。以下為不可違背之鐵律：

【敘事與對話】
1. 絕對響應：開頭必以第一人稱完整重現玩家最新動作與台詞，優先承接反轉、否定與突發，禁順預設劇情硬寫。從者/敵御主當回合給完整態度，禁懸念。
1b.【演出而非說明（最重要）】角色的願望、個性、特徵、萌點、好感等設定，【絕對禁止】在敘述中直接寫出或複述字面（如「她的願望是…」「她個性冷傲」「他對你好感不高」）；必須【透過神態、動作、語氣、選擇與對白「演出來」】讓讀者自行體會。設定是你演戲的依據，不是台詞。
1c.【聚焦】這是現代冬木的聖杯戰爭。聚焦：調查、潛行、對話、補魔、寶具與從者廝殺、御主間的謀略與羈絆。
2. 格式分段：每2~3句必插入 <br><br> 換段。描寫女性角色的體態與動作時用柔美靈動的詞，❌避免把女性寫得陽剛粗暴；但男性角色、以及戰鬥場面本身的劍擊／魔力衝擊／寶具威能等凜冽描寫不在此限。
3. 對話格式（唯一合法寫法）：角色姓名：「（動作/神態）台詞」。規則：①姓名只寫一次，後接半形或全形冒號；②引號全文僅用一層「」，【絕對禁止】「」內再嵌『』或再嵌一層「」(如「角色名：『...』」或「角色名：「...」」一律禁止)；③「」內開頭先放【一個】全形括號（動作/神態），之後接台詞本身即收尾，禁止在台詞中途或結尾再插入第二段動作、禁止把動作獨立成段或寫在引號外；④該句「」結束後，同段落【不可再黏著】該角色其他動作補述——若還有動作要寫，必須收進前面唯一的（）裡，或另起一段純敘事，不可緊跟在引號後方。開頭禁代名詞(他/她)，必指名道姓。
4. 地點：以冬木的地名自然融入敘述（如新都、深山町、冬木大橋、教會），嚴禁直呼系統標籤全名作為對白。

【世界與NPC自主】
1. 意圖攔截：玩家輸入的動作皆僅為「意圖」，絕非結果。若該角色個性非高度順從(冷傲/警戒/敵對/矜持)或實力不明顯遜於玩家，本回合【必須】寫出其抗拒、閃避、嘲諷或拒絕，使意圖未完全得逞，嚴禁言出法隨。尊重角色自主，禁說教、禁替玩家做決定。背景龍套不收錄至 mentioned_names(無名填[])。
2. 慢熱與傾心：依[個性][氣質]真實反應，好感未滿80者嚴禁倒貼，禁用傾心/道侶等詞。rel_changes 的 tag 填【關係定位】四字詞(萍水相逢/漸生情愫/紅顏知己等)，須對應好感高低，禁填當下情緒。
3. 靈基與位階：從者乃英靈，靈基遠勝凡人；強者深藏不露，認真出手才顯壓迫感。御主為人類魔術師，肉身脆弱，倚靠從者與魔術。
3b.【原作忠實度】你熟知 Fate／TYPE-MOON 全系列每位英靈的真實傳說、武裝與戰鬥方式，描寫依你對該英靈本身的知識判斷其真實樣貌與戰法，不同版本/媒介可能略有差異、取你判斷最貼近原典者。從者受傷是靈基震盪／崩解，非普通生物流血。角色卡上的 persona／look／寶具／技能是精確設定，非籠統描述，優先依此發揮；勿憑空套用與該英靈本身無關的通用奇幻/RPG套語。
4. 萌點節制：角色「萌點」只是反差背景彩蛋，【禁止】刻意安排情境去觸發或反覆強調，僅在場景本就自然涉及時順勢輕帶。

【狀態與位置】
1. 狀態刷新：有肢體/情緒波動就更新外顯狀態(stat_changes 的 姿勢/衣服/負面/顏面)。負面限實質物理/毒理(無則填無)。
2. 位置：玩家與NPC的移動一律由系統按鈕管理，AI【禁止】輸出任何位置變更；NPC 若於敘事中離場，僅以文字交代去向即可，禁自創假地名。
3. 戰鬥：聖杯戰爭的從者廝殺一律由系統按鈕裁決，AI【禁止】自行宣告任何角色死亡或輸出生命數值變化；只描寫本回合新結果，不重演前塵。

【JSON格式】
1. 只輸出合法JSON，不含 options 欄位——玩家的下一步一律來自遊戲按鍵，不需要你建議。
2. log_summary.tag：預設「閒聊」，有承諾/邀約標「承諾」，揭露隱私/陰謀標「秘密」，死亡/背叛/重傷等轉折標「變故」。`;

  // 🔴 NSFW(慾海模式)：本回合聚焦當下的近身互動(情慾/調情/鋪陳皆可)，雜務(物品/金錢/陣營/任務/招募/地圖/戰鬥數值/身世)
  // 完全不追蹤、不輸出，鐵律文字大幅精簡，盡量交給AI自行判斷。
  const nsfwBaseRules = `你是後日談的敘事演化核心，以細膩動人的輕小說筆觸推演因果，強制台灣繁體中文。第一人稱「我」，禁上帝視角。以下為不可違背之鐵律：

【敘事與對話】
1. 絕對響應：開頭必以第一人稱完整重現玩家最新動作與台詞，優先承接反轉、否定與突發，禁順預設劇情硬寫。NPC當回合給完整態度，禁懸念。
2. 格式分段：每2~3句必插入 <br><br> 換段。描寫女子的體態與動作皆用柔嫩/雪白/輕盈/婉約等柔美詞，一切動作姿態恆保女性的柔美質感、與陽剛男性化的筆法徹底絕緣——女子出力亦是柔中帶勁。
3. 對話格式（唯一合法寫法）：角色姓名：「（動作/神態）台詞」。規則：①姓名只寫一次，後接半形或全形冒號；②引號全文僅用一層「」，【絕對禁止】「」內再嵌『』或再嵌一層「」；③「」內開頭先放【一個】全形括號（動作/神態），之後接台詞本身即收尾，禁止中途或結尾再插入第二段動作；④「」結束後，同段落不可再黏著該角色其他動作補述，要收進前面唯一的（）裡，或另起一段純敘事。開頭禁代名詞(他/她)，必指名道姓。

【世界與NPC自主】
1. 意圖攔截(強制檢查)：玩家輸入的動作皆僅為「意圖」，絕非結果。裁定前必先比對該NPC的[個性]與[戰力]：若NPC個性非高度順從，或戰力不明顯遜於玩家，本回合【必須】寫出該NPC實際的抗拒、閃避或拒絕，使意圖未完全得逞，嚴禁言出法隨！唯有NPC個性確為順從且戰力明顯遜於玩家時，意圖才可直接成立。背景龍套不收錄至 mentioned_names，該欄僅收真實姓名(無則填[])。
2. 慢熱與傾心：NPC依[個性][氣質][陣營]真實反應。好感未滿80者嚴禁言行表現傾心倒貼，禁用傾心/道侶等極親密詞。rel_changes 的 tag 填【關係定位】四字詞(萍水相逢/點頭之交/漸生情愫/紅顏知己等)，須對應好感高低，禁填當下情緒。
3. 萌點節制：快照中標註的「萌點」只是角色的反差背景彩蛋之一，【絕對禁止】每回合或連續多回合刻意安排情境去觸發它，【絕對禁止】反覆強調成該角色唯一性格。預設應完全略過此欄，只有場景本就自然涉及該萌點情境時才可順勢輕輕一筆帶過，且同一萌點至少間隔數回合不重複使用。

【狀態與輸出】
1. 本回合聚焦於當下的近身互動本身(情慾、調情、對話或鋪陳皆可，依劇情自然推進，不必每回合都導向情慾)：肢體/感官/姿勢等狀態一律填入 intimacy_feedback，嚴禁另以 stat_changes 輸出生命/魔力/負面/位置等任何數值或狀態；戰鬥、物品、金錢、陣營、任務等雜務本回合不追蹤、不輸出。位置移動一律由系統地圖按鈕管理，AI 絕不輸出任何位置變更。
2. 只輸出合法JSON，options固定4個且順序不可變：[主動]強勢掌握、[被動]委婉試探、[接續]延續互動、[反差]跳脫氛圍，每項20字。`;

  const baseRules = isNsfwMode ? nsfwBaseRules : sfwBaseRules;

  // 4. 模式專屬律令 (極致超壓縮版)
  const specificRules = isNsfwMode ? `
【慾海律令】
你擅長書寫細膩動人的女女情慾，放手去寫，以下只是少數底線：
1. 【女女柔軟】(核心)純女女之愛，無論誰主導皆是【纏綿體貼、有來有往】，主動方亦是女子、柔中帶情——❌禁套用任何男性化的強硬支配模板。
2. 聚焦當下最關鍵的一兩處深入著墨，篇幅靠情感起伏、神態心理、氛圍張力與對話堆疊撐起，而非鋪滿全身；❌絕對禁止逐一點名全身部位、禁止視/觸/嗅/聽四感清單式流水帳、禁止器官逐格交代；台詞被嬌喘打斷，勿一氣呵成。
3. 器官依配對裁決：無陽具填無「肉棒」、無陰道填無「蜜穴」。絕對禁止插入式陽具，以手指/舌/器物替代，嚴禁憑空生出男性器官。
4. physical_state欄位key固定用數字代碼(1=陰道 2=陽具 3=後穴 4=雙手)，禁用文字key，其餘進narration。據實填當下肉體狀態，未被碰該代碼不填；脫離接觸改寫「鬆開/餘韻」。★此欄純為系統狀態記錄，narration敘事【絕對禁止】比照逐格謄寫每個部位狀態，敘事仍以第2條為準、聚焦留白。
5. log_summary：subject填主導方真名、object填承受方真名(三人以上填眾人)，符合實際方向，禁因身分預設主動方；tag預設「閒聊」，唯有實質承諾/秘密/重大轉折才升級標「承諾」/「秘密」/「變故」。
6. 粗暴動作轉為紅印/酥麻/強烈快感，禁肉體破損流血。雙修技巧(2~5字)填入dynamic_skills，貼合身分個性，禁動輒填無。`
    : `
【聖杯戰爭】
1. 戰鬥意境：筆墨集中魔力流轉、魔術交鋒、從者廝殺、寶具威能、靈基的壓迫感，嚴禁任何性暗示或情慾描寫。
2. 邊界守護：複數從者/御主同場時各自依個性與陣營獨立判斷，禁擅自無腦聯手圍攻。從者廝殺的勝負與傷害一律由系統按鈕裁決，敘述不得自行宣告死亡或輸出數值。`;

  return baseRules + "\n" + specificRules + "\n\n★【輸出範本】\n" + JSON.stringify(finalJson, null, 2);
}

function callGeminiAPI(prompt, systemOverride = null, config = {}) {
  if (!API_KEY) return JSON.stringify({ narration: "未設定 API_KEY", options: ["重試"] });

  if (typeof config === "number") config = { retries: config };
  const modelName = config.model || "google/gemini-3.1-flash-lite";
  const temp = config.temperature !== undefined ? config.temperature : 0.8;
  const topP = config.top_p !== undefined ? config.top_p : 0.95;
  const maxT = config.max_tokens || (config.isNsfwMode ? 2500 : 2000);
  const retries = config.retries || 3;
  const plainText = !!config.plainText; // 🆕 純散文模式(如奪杯回憶錄)：不強制 json_object、不抽 {…}、原樣回傳內容
  let lastErrorMessage = "";

  // 🗑️ 規矩表(主線時局/異象)已移除：舊提示詞補丁，含「廝殺/謀略」等戰爭設定會漏進慾海。
  //   雙軌分離後 solo/kanshou 不再共吃此文。(config.ignoreLaw 保留為相容無害鍵)
  let systemContent = systemOverride || buildDefaultSystemPrompt(config.isNsfwMode, config.backLocked);

  // 🔴【替換開始】組裝原生多輪 messages 陣列
  let apiMessages = [
    { role: "system", content: systemContent }
  ];

  if (config.chatHistory && Array.isArray(config.chatHistory)) {
    apiMessages = apiMessages.concat(config.chatHistory);
  }

  apiMessages.push({ role: "user", content: prompt || "" });

  const payload = {
    model: modelName,
    messages: apiMessages,
    temperature: temp,
    top_p: topP,
    max_tokens: maxT
  };
  if (!plainText) payload.response_format = { type: "json_object" }; // 散文模式不強制 JSON
  // 🔴【替換結束】

  const options = {
    method: "post", contentType: "application/json",
    headers: { "Authorization": "Bearer " + API_KEY },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  };

  // 🔴 降階重試專用：一旦判定為審查攔截，下一次重試改塞更含蓄的筆法指令，
  // 而非原樣重送(原樣重送對審查攔截毫無意義，只會再被擋一次)。一般網路錯誤則不降階，原樣重試即可。
  const softenSuffix = `\n\n★【降階重試】上一次輸出未通過審查判定，請改用更含蓄典雅的筆法重新演繹本回合：以景喻情、意境留白，避免直白器官名稱與動作描寫，情慾僅以氛圍、情感與感官烘托表現，其餘JSON欄位規則不變。`;
  let softened = false;

  for (let i = 0; i < retries; i++) {
    try {
      const res = UrlFetchApp.fetch(MODEL_URL, options);
      const result = JSON.parse(res.getContentText());
      if (result.error) {
        // 🔴 Gemini審查攔截(如PROHIBITED_CONTENT)走error物件回來，格式跟finish_reason那條不同，
        // 統一改丟"Triggered_NSFW_Filter"才能吃到下面的降階重試與柔和提示，不然會直接洩漏原始錯誤訊息給玩家
        const errMsg = result.error.message || "API 內部錯誤";
        if (/PROHIBITED_CONTENT|SAFETY/i.test(errMsg)) throw new Error("Triggered_NSFW_Filter");
        throw new Error(errMsg);
      }
      if (result.choices && result.choices.length > 0) {
        let choice = result.choices[0];
        if (choice.finish_reason === "content_filter" || choice.finish_reason === "SAFETY" || (choice.message && !choice.message.content)) {
          throw new Error("Triggered_NSFW_Filter");
        }
        let text = choice.message.content;
        if (plainText) return String(text || "").trim(); // 散文模式：原樣回傳，不抽 {…}、不 JSON.parse
        const s = text.indexOf('{');
        const e = text.lastIndexOf('}');
        text = text.substring(s, e + 1);
        JSON.parse(text);
        return text;
      } else { throw new Error("無效的選項結構"); }
    } catch (e) {
      lastErrorMessage = e.message;
      if (i < retries - 1) {
        if (e.message === "Triggered_NSFW_Filter" && !softened) {
          softened = true;
          apiMessages[0].content = systemContent + softenSuffix;
          payload.messages = apiMessages;
          options.payload = JSON.stringify(payload);
        }
        Utilities.sleep(2000);
      }
    }
  }

  const isBlocked = lastErrorMessage.includes("Triggered_NSFW_Filter") || lastErrorMessage.includes("safety");
  const fallbackNarration = isBlocked
    ? "🌸【結界觸發】妳的舉動觸動了某種微妙的禁制，此處的景象暫時被屏蔽，請再度嘗試。"
    : `⚡【連線中斷】連線失敗：${lastErrorMessage}`;

  if (plainText) return fallbackNarration; // 散文模式：失敗也回純文字，不污染回憶錄成 JSON

  return JSON.stringify({
    narration: fallbackNarration, options: ["1. 深吸一口氣，平復心緒", "2. 溫柔地退開半步", "3. 輕聲轉移話題", "4. 稍作歇息"],
    stat_changes: [], rel_changes: [], events: [], items_gained: []
  });
}

function doGet() {
  try { ensureFateSheets_(); } catch (e) { Logger.log("ensureFateSheets_ 於 doGet 失敗(略過): " + e.message); }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('命運停駐之夜')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}
