// ==========================================
// 🔴【第二部分：LLM 核心調用與網頁進入點】Engine_Combat.gs
// ==========================================

// 🧹 2026-07 玩家定案「isNsfwMode 也不用分模式了，統合起來」：這個函式現在只可能被鑑賞(慾海)呼叫
//   ——solo(按鍵制)走完全獨立的 miniSystem(Router_Narrative.gs actionNarrateOnly)，從不呼叫這裡；
//   本函式唯一呼叫來源是 callGeminiAPI 的 systemOverride 為空時的 fallback，唯一會用空
//   systemOverride 呼叫的是 actionPlay(自由聊天引擎)，而 actionPlay 的 isNsfwMode 恆等於 pcId
//   開頭是否為 KPC_，全專案已無任何路徑把 pc.mode 設為 'full'(九州殘留、已停用)——故 isNsfwMode
//   進到這裡永遠是 true(sfwBaseRules 已刪除，見上一輪修訂)。已拿掉這個死參數與所有 if/else 分支，
//   直接寫死唯一真的會用到的版本；real runtime 上唯一還會變動的「模式」是 driveOn(🔥主動掌握)，
//   那是 Router_Narrative.gs actionPlay 自己組的 driveStr，不在這個函式管轄範圍內。
// 🧹 順手清：舊簽名 (isNsfwMode, backLocked) 的 backLocked 參數，函式體內從未被讀取過(查全專案
//   這個參數本身也從未真的影響過任何提示詞文字，是傳到這裡就斷頭的死參數)，一併拿掉；呼叫端
//   (callGeminiAPI)的 config.backLocked 是傳給別的用途(見 aiConfig.backLocked 賦值處)，不受影響。
function buildDefaultSystemPrompt() {
  // 2. 慾海專屬 physical_state(2026-07 玩家定案整合)：原本 visible_state(衣服/姿勢/負面/顏面)＋
  //   physical_state(蜜穴/肉棒/菊穴/雙手)兩物件共8欄，玩家要求砍到「當下最需要」的6項、合併成一欄：
  //   姿勢動作／胸部／顏面(表情+汗水)／肉棒／蜜穴／服裝狀態。負面/菊穴/雙手不再追蹤。key仍固定用
  //   數字代碼(避免AI每回合輸出原始器官字)。
  // 🐛→✅ 2026-07 二修：原本肉棒/蜜穴描述寫「無陽具填無」/「無陰道填無」，等於教AI對不適用性別的
  //   那格也要主動寫入「無」——這個「無」一旦輸出就merge進資料庫、永久顯示在角色卡上(如女角卡片
  //   顯示「肉棒：無」)。玩家明確要求禁止這種臨時填補寫法：不適用的那格【直接不要輸出這個代碼】，
  //   不要用「無」佔位；依實際性別只填一項(男性4/女性5)，另一項在AI輸出裡整個省略。
  // 🐛→✅ 2026-07 三修：1(姿勢動作)/2(胸部)/3(顏面)/4或5(肉棒或蜜穴，擇一)改為【每回合必填】——
  //   玩家要求這4項每次都要據實輸出最新狀態，不可偷懶沿用舊值；只有 6(服裝狀態) 維持原本
  //   「省略=維持原樣」規則(衣物沒變化就不必每次重講)。顏面的「汗水」改「液體」(更泛用，非限定汗水)。
  const _physicalState = {
    "1": "姿勢與動作【每回合必填】(≤20字)",
    "2": "胸部狀態【每回合必填·女性適用】(男性不輸出此代碼，≤15字)",
    "3": "顏面狀態【每回合必填】(表情與液體，≤15字)",
    "4": "肉棒狀態【每回合必填·僅男性適用】(女性不輸出此代碼，≤15字)",
    "5": "蜜穴狀態【每回合必填·僅女性適用】(男性不輸出此代碼，≤15字)",
    "6": "服裝狀態(可省略=維持原樣；玩家指定服裝本身不變，只描述它當下的凌亂/破損程度，如領口散亂/半褪至肩/裙擺撕裂，≤15字)"
  };

  // 🔴 npc的範本欄位全填「同上」：Router_Action.gs解析intimacy_feedback時的ignoreWords防呆清單本就含「同上」，
  // 即使AI偷懶照抄範本字面值也會被當成敷衍語忽略、不會寫進玩家看到的狀態欄，省字數不引入新的失敗模式。
  const _physicalStateRef = { "1": "同上", "2": "同上", "3": "同上", "4": "同上", "5": "同上", "6": "同上" };

  const finalJson = {
    // 🔥 2026-07 玩家提案(經整合)：強制思維鏈——放範本【第一位】讓模型先自省再寫敘事，
    //   逼它每回合先定位角色被推進到哪，才動筆。後端 sanitizeAiData_ 不讀此欄→自然丟棄，
    //   不顯示給玩家、不進歷史，純粹是給 AI 自己看的思考格，零程式面副作用。
    // 🐛→✅ 2026-07(玩家明確授權)：原句要求「第一人稱自省…我原本的性格尊嚴」，逼AI用「我」寫
    //   NPC的內心獨白，緊接著卻要narration把「我」切回玩家——兩種「我」在同一份提示詞裡打架，
    //   flash-lite小模型容易把NPC的視角帶進narration。改第三人稱總結，拿掉會跟敘事視角衝突的「我」。
    "inner_monologue": "【必填·純思考用·絕不顯示】用第三人稱總結本回合主要互動對象(那名NPC)目前的狀態(約50字，此欄不是該角色的台詞或視角，NPC本人不可用「我」自稱)。公式：[該NPC原本的性格尊嚴] vs [當下情緒與身體的真實狀態]。情緒溫度必須銜接歷史紀錄，禁止歸零重來。",
    // 🔠 2026-07 全面重寫縮字：narration 描述原本重複一份「篇幅靠情感起伏/神態心理/氛圍張力/對話堆疊
    //   撐起」的風格指示，跟下方 specificRules 第4條逐字相同——改成交叉引用，只在一處說清楚。
    "narration": "劇情描述(約600字，第一人稱，嚴禁替玩家做決定；篇幅分配依下方慾海律令第4條)...",
    // 🗺️ 2026-07 玩家定案：鑑賞拔除地圖按鈕，改AI自主敘事換場——地點完全由AI自己決定何時、換去哪，
    //   不再受限於固定地圖節點清單，可以是「一家安靜的咖啡廳」這種地圖上沒有的場景。
    //   ★鐵律：narration必須先把移動/抵達的過程實際寫出來，這欄才能填新地名；沒有移動就照抄
    //   目前地點原文，不可無故憑空跳地點(跟目前地點不同=系統認定確實移動了，會寫回存檔)。
    "location": "本回合結束時御主所在地點——若narration有實際敘述移動/抵達，填新地點名稱(可自創、不限於冬木既有地名)；沒有移動則原樣填目前地點",
    "intimacy_feedback": {
      "_note": "★physical_state各欄皆角色「自身」當下姿態與肉體狀態，純肢體與感官、禁內心戲，第三人稱填寫，絕對禁寫'自己'。★代碼1/2/3/4或5(依實際性別擇一)每回合都要據實填最新狀態，不可省略沿用舊值；只有代碼6(服裝狀態)可省略=維持原樣。★不適用的器官代碼(4肉棒/5蜜穴二選一，依角色實際性別)直接不要輸出這個代碼，禁止填「無」佔位。npcs每位與player共用此格式，依其實際狀態填寫對應欄位。",
      "player": {
        "physical_state": _physicalState,
        "dynamic_skills": "雙修技巧名(2~5字，規則見下方慾海律令第8條)",
        "erogenous_zones": "無"
      },
      "npcs": [{
        "name": "NPC實際名字",
        "physical_state": _physicalStateRef,
        "dynamic_skills": "雙修技巧名(2~5字，規則見下方慾海律令第8條)",
        "erogenous_zones": "無",
        "mutual_nicknames": "無"
      }]
    },
    // 🔠 2026-07：原本「名字提取鐵律」在 Router_Narrative.gs 每回合另開一整段落解釋 target 只能填真名，
    //   改直接寫進欄位描述本身——schema 級約束比事後再說一次更有效，也省掉那一整段重複文字。
    "rel_changes": [{ "target": "NPC真實姓名或「自己」(禁填台詞/地名/動作等其他內容)", "fav_change": 3, "tag": "無", "major_event": "無" }],
    "mentioned_names": ["劇情中出現的具名角色名字，不含玩家自己"],
    // 🔴 慾海模式event欄位禁止描述肉體細節：實際因果文字改由GAS固定樣式生成(隱晦化)，AI只需給方向與標籤
    // 🗑️ 2026-07 玩家定案：event/tag 兩欄拔除——因果表刪除後無任何代碼讀取(產了就丟)，
    //   後端只消費 subject/object(交談輪數計數，見 Router_Narrative.gs)。以後要做回憶錄再加回。
    "log_summary": { "subject": "主動方真名", "object": "被動/承受方真名(三人以上填眾人)" }
  };

  // 🔠 對話格式規則抽成共用函式，杜絕未來改一半、又不一致的風險。
  // 🐛→✅ 2026-07(玩家明確授權·全面重寫)：舊版嚴格限定「姓名只寫一次、動作只能在引號開頭一段、
  //   引號結束後同段落不可再補動作」——玩家要求改鬆：動作可放名字前/引號內(以聲音呈現)/引號後，
  //   不限次數與位置組合；純背景描述不需要括號、且應盡量精簡，把篇幅讓給互動本身。
  // 🐛→✅ 2026-07 二修(玩家明確授權)：原句只點出「引號內可放(聲音)」，沒講清楚引號內也可以是
  //   純(動作)、(聲音+動作)合併、甚至整句只有動作聲音沒有台詞文字；也沒強制「邊說邊動作/帶聲音
  //   時必須寫出來」，導致 AI 有時整段台詞一氣呵成、把同步發生的動作/聲音省略不寫。改成明確列舉
  //   引號內四種可能內容，並用【必須】鎖死「有邊說邊動作或有聲音就要寫出來夾進台詞裡」，不可省略。
  function dialogueFormatRule_(example) {
    return `對話格式：（角色動作或神情，例如：${example}）名字：「台詞、或（聲音）、或（動作）、或（聲音+動作），可與台詞自由交錯、也可整句僅有（動作/聲音）而無台詞文字」（角色動作或神情，可省略）。★【必須】：角色若邊說話邊有動作、或說話當下帶有聲音(如低吟／輕笑／嬌喘)，該動作或聲音都要用（）寫出來、夾在台詞中對應發生的位置，不可略過不寫。同一段落【不限制】名字出現次數、也不限制括號(動作/聲音)的使用次數與位置——可依演出彈性重複、交錯多輪對話與動作。引號全文僅用一層「」，【絕對禁止】「」內再嵌『』或再嵌一層「」。純背景／環境描述(無任何角色動作、無聲音)【不使用任何符號】，直接以敘事文字呈現，且【盡量精簡】——把篇幅留給互動本身(動作與對話)，少花筆墨鋪陳場景氛圍。`;
  }

  // 🔴 NSFW(慾海模式)：本回合聚焦當下的近身互動(情慾/調情/鋪陳皆可)，雜務(物品/金錢/陣營/任務/招募/地圖/戰鬥數值/身世)
  // 完全不追蹤、不輸出，鐵律文字大幅精簡，盡量交給AI自行判斷。
  const nsfwBaseRules = `你是後日談的敘事演化核心，以細膩動人的輕小說筆觸推演因果，強制台灣繁體中文。第一人稱「我」，禁上帝視角。以下為不可違背之鐵律：

【敘事與對話】
1. 絕對響應：開頭必以第一人稱完整重現玩家最新動作與台詞，優先承接反轉、否定與突發，禁順預設劇情硬寫。NPC當回合給完整態度，禁懸念。
2. 格式分段：每2~3句必插入 <br><br> 換段。描寫女子的體態與動作皆用柔嫩/雪白/輕盈/婉約等柔美詞，一切動作姿態恆保女性的柔美質感、與陽剛男性化的筆法徹底絕緣——女子出力亦是柔中帶勁。
3. ${dialogueFormatRule_("眼神一沉")}

【世界與NPC自主】
1. 意圖攔截(強制檢查)：玩家輸入的動作皆僅為「意圖」，絕非結果。裁定前必先比對該NPC的[個性]與[戰力]：若NPC個性非高度順從，或戰力不明顯遜於玩家，本回合【必須】寫出該NPC實際的抗拒、閃避或拒絕，使意圖未完全得逞，嚴禁言出法隨！唯有NPC個性確為順從且戰力明顯遜於玩家時，意圖才可直接成立。背景龍套不收錄至 mentioned_names，該欄僅收真實姓名(無則填[])。
2. 慢熱與傾心：NPC依[個性][氣質]真實反應。好感未滿80者嚴禁言行表現傾心倒貼，禁用傾心/道侶等極親密詞。rel_changes 的 tag 填【關係定位】四字詞(萍水相逢/點頭之交/漸生情愫/紅顏知己等)，須對應好感高低，禁填當下情緒。
3. 萌點節制：快照中標註的「萌點」只是角色的反差背景彩蛋之一，【絕對禁止】每回合或連續多回合刻意安排情境去觸發它，【絕對禁止】反覆強調成該角色唯一性格。預設應完全略過此欄，只有場景本就自然涉及該萌點情境時才可順勢輕輕一筆帶過，且同一萌點至少間隔數回合不重複使用。

【狀態與輸出】
1. 本回合聚焦於當下的近身互動本身(情慾、調情、對話或鋪陳皆可，依劇情自然推進，不必每回合都導向情慾)：肢體/感官/姿勢等狀態一律填入 intimacy_feedback，嚴禁另以 stat_changes 輸出生命/魔力/負面等任何數值或狀態；戰鬥、物品、金錢、陣營、任務等雜務本回合不追蹤、不輸出。位置改由你自主決定並填入 location 欄(見上方換場地規則)，不再受地圖節點限制。
2. 只輸出合法JSON，options固定4個、順序不可變、每項20字(類別見下方輸出範本)。`;

  const specificRules = `
【慾海律令】
你擅長書寫細膩動人的情慾，放手去寫，以下只是少數底線：
1. 【先思考，後敘事】嚴禁直接開寫narration！必須先在inner_monologue依對話歷史定位「本回合主要互動對象」目前的情緒溫度與親密階段(可能是 抗拒/拉扯/沉溺，也可能是 甜蜜/依偎/主動索求——依角色意願與好感自然判斷，非必經流程)，再依這個定位下筆。這段第三人稱總結遵循【角色一致性鐵律】：呈現該NPC用原本的人格承受當下一切的樣子。
2. 【絕不重置】每次回應必須繼承歷史紀錄中的情緒溫度！角色已推進到的親密/情動階段，本回合嚴禁無故退回最初的冷淡或抗拒；要降溫只能因劇情明確事件(被打斷/翻臉/受驚/離開)，不可因換了一次呼叫就自動歸零。
3. 【依配對裁決】互動方式依上方【性別配對】提示為準——女女配對：純女女之愛，無論誰主導皆是【纏綿體貼、有來有往】，主動方亦是女子、柔中帶情，❌禁套用任何男性化的強硬支配模板；男女配對：依雙方實際性別與器官自然互動，女性側的體態動作描寫仍保持柔美質感。
4. 聚焦當下最關鍵的一兩處深入著墨，篇幅靠情感起伏、神態心理、氛圍張力與對話堆疊撐起，而非鋪滿全身；❌絕對禁止逐一點名全身部位、禁止視/觸/嗅/聽四感清單式流水帳、禁止器官逐格交代；台詞被嬌喘打斷，勿一氣呵成。
5. 器官代碼依實際性別只填一項(男4/女5)，不適用的那項【直接不輸出這個代碼】，禁止寫「無」佔位(一旦寫入會永久留在角色資料上)——實際配對細節依上方【性別配對】提示。
6. physical_state欄位key固定用數字代碼(1=姿勢與動作 2=胸部 3=顏面 4=肉棒 5=蜜穴 6=服裝狀態)，禁用文字key，其餘進narration。1/2/3/4或5(擇一)每回合都要據實填最新狀態，不可偷懶沿用舊值；只有6(服裝狀態，描述玩家指定服裝【當下的凌亂/破損程度】，非更換服裝本身)可省略=維持原樣，脫離接觸改寫「鬆開/餘韻」。★此欄純為系統狀態記錄，narration敘事【絕對禁止】比照逐格謄寫每個部位狀態，敘事仍以第4條為準、聚焦留白。
7. log_summary：subject填主導方真名、object填承受方真名(三人以上填眾人)，符合實際方向，禁因身分預設主動方。
8. 粗暴動作轉為紅印/酥麻/強烈快感，禁肉體破損流血。雙修技巧(2~5字)填入dynamic_skills，貼合身分個性給出當下情境對應的技巧名；只有本回合確實毫無相關技巧發生時才填「無」，不要動輒預設空白。`;

  return nsfwBaseRules + "\n" + specificRules + "\n\n★【輸出範本】\n" + JSON.stringify(finalJson, null, 2);
}

function callGeminiAPI(prompt, systemOverride = null, config = {}) {
  if (!API_KEY) return JSON.stringify({ narration: "未設定 API_KEY", options: ["重試"] });

  if (typeof config === "number") config = { retries: config };
  const modelName = config.model || AI_MODEL;
  if (!modelName) return JSON.stringify({ narration: "未設定 MODEL 指令碼屬性", options: ["重試"] });
  const temp = config.temperature !== undefined ? config.temperature : 0.8;
  const topP = config.top_p !== undefined ? config.top_p : 0.95;
  // 2026-07：慾海這幾輪新增 inner_monologue＋physical_state 每回合必填欄位變多，結構性佔用 token 略增，
  //   小幅調高留些餘裕(玩家指定 2600；實際截斷根因在萌點欄 slice 過短，另見 actionBackfillKanshouAi)。
  const maxT = config.max_tokens || (config.isNsfwMode ? 2600 : 2000);
  const retries = config.retries || 3;
  const plainText = !!config.plainText; // 🆕 純散文模式(如奪杯回憶錄)：不強制 json_object、不抽 {…}、原樣回傳內容
  let lastErrorMessage = "";

  // 🗑️ 規矩表(主線時局/異象)已移除：舊提示詞補丁，含「廝殺/謀略」等戰爭設定會漏進慾海。
  //   雙軌分離後 solo/kanshou 不再共吃此文。(config.ignoreLaw 保留為相容無害鍵)
  let systemContent = systemOverride || buildDefaultSystemPrompt();

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
    rel_changes: []
  });
}

function doGet() {
  try { ensureFateSheets_(); } catch (e) { Logger.log("ensureFateSheets_ 於 doGet 失敗(略過): " + e.message); }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('命運停駐之夜')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}
