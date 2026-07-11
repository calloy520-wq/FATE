// ==========================================
// 🔴【第二部分：LLM 核心調用】Engine_Combat.gs
//   callGeminiAPI：solo／鑑賞共用的 OpenRouter 呼叫核心，不歸屬任何單一軌道。
//   🔀 2026-07 玩家定案「兩軌完全拆開」：鑑賞專屬的 buildDefaultSystemPrompt(含 nsfwBaseRules)
//   已搬去 Gallery.gs(鑑賞的家)——這裡只留兩軌都會呼叫的共用基礎設施。
// ==========================================

function callGeminiAPI(prompt, systemOverride = null, config = {}) {
  if (!API_KEY) return JSON.stringify({ narration: "未設定 API_KEY", options: ["重試"] });

  if (typeof config === "number") config = { retries: config };
  const modelName = config.model || AI_MODEL;
  if (!modelName) return JSON.stringify({ narration: "未設定 MODEL 指令碼屬性", options: ["重試"] });
  const temp = config.temperature !== undefined ? config.temperature : 0.8;
  const topP = config.top_p !== undefined ? config.top_p : 0.95;
  // 🔵 2026-07 玩家反映「鑑賞速度有點慢」，查證換 DeepSeek 後主因是模型生成時間本身(大模型 vs 原本
  //   的低延遲小模型)，max_tokens 是唯一能直接省生成時間的旋鈕——玩家定案「max_tokens改1500 他現在
  //   不用這麼忙」：2600 這個高值原是為了容納 inner_monologue+physical_state 等結構性欄位，但實測
  //   截斷的根因其實是萌點欄 slice 過短(見 actionBackfillKanshouAi)，不是 narration 本身需要那麼多字；
  //   降到1500後玩家再試一輪，配合 narration 目標字數(finalJson，Gallery.gs)同步從約600字降到約500字，
  //   繼續降到1000試看看，SFW(solo)維持2000不變。
  const maxT = config.max_tokens || (config.isNsfwMode ? 1000 : 2000);
  const retries = config.retries || 3;
  const plainText = !!config.plainText; // 🆕 純散文模式(如奪杯回憶錄)：不強制 json_object、不抽 {…}、原樣回傳內容
  let lastErrorMessage = "";

  // 🗑️ 規矩表(主線時局/異象)已移除：舊提示詞補丁，含「廝殺/謀略」等戰爭設定會漏進慾海。
  //   雙軌分離後 solo/kanshou 不再共吃此文。(config.ignoreLaw 保留為相容無害鍵)
  let systemContent = systemOverride || buildDefaultSystemPrompt();
  // 🎯 2026-07 玩家反映「鑑賞要台灣繁體中文」：各系統提示詞(nsfwBaseRules/miniSystem等)本身早就寫著
  //   「強制台灣繁體中文」，但模型換成 deepseek(非 Gemini 系)後，這類以簡體語料為主訓練的模型仍容易
  //   夾帶大陸慣用詞彙(視頻/質量/軟件/信息等)甚至簡體字，即使被要求輸出繁體也不夠可靠。在這裡(共用
  //   的 callGeminiAPI 基礎設施，不是 nsfwBaseRules 本體)於提示詞尾端額外補強一句——放在最後，模型
  //   對提示詞頭尾的指令通常記得更牢；solo/鑑賞兩軌都吃得到，不分軌道特判。
  systemContent += "\n\n【語言鐵律】全程僅使用台灣繁體中文（正體字），嚴禁簡體字、嚴禁大陸慣用詞彙（如視頻/質量/軟件/信息/內存/屏幕等），一律使用台灣在地慣用語與正體字形。";

  // 🔴【替換開始】組裝原生多輪 messages 陣列
  let apiMessages = [
    { role: "system", content: systemContent }
  ];

  if (config.chatHistory && Array.isArray(config.chatHistory)) {
    apiMessages = apiMessages.concat(config.chatHistory);
  }

  apiMessages.push({ role: "user", content: prompt || "" });
  // 🔴【替換結束】(payload/options 的組裝已移進下方 attemptWithModel_，隨每次嘗試的實際模型重建)

  // 🔴 降階重試專用：一旦判定為審查攔截，下一次重試改塞更含蓄的筆法指令，
  // 而非原樣重送(原樣重送對審查攔截毫無意義，只會再被擋一次)。一般網路錯誤則不降階，原樣重試即可。
  const softenSuffix = `\n\n★【降階重試】上一次輸出未通過審查判定，請改用更含蓄典雅的筆法重新演繹本回合：以景喻情、意境留白，避免直白器官名稱與動作描寫，情慾僅以氛圍、情感與感官烘托表現，其餘JSON欄位規則不變。`;

  // 🔥 2026-07 玩家定案「沒點火時如果被攔截或對話失敗，改用DeepSeek」：把單一模型的完整重試迴圈包成
  //   內部函式，讓外層可以「這顆模型全部重試失敗後，換一顆模型再試一輪」。只有呼叫端明確給了
  //   config.fallbackModel 才會發生第二輪——目前只有鑑賞「沒點火」用 SOLO_MODEL(輕量模型，較容易撞
  //   審查/不穩定)時會帶這個參數、逃生門是換回鑑賞原本的 AI_MODEL(DeepSeek)；solo 與鑑賞「點火」都
  //   沒帶這個參數，行為完全不變。回傳成功文字或 null(全部重試失敗)。
  function attemptWithModel_(model) {
    const payload = { model: model, messages: apiMessages, temperature: temp, top_p: topP, max_tokens: maxT };
    if (!plainText) payload.response_format = { type: "json_object" };
    const options = {
      method: "post", contentType: "application/json",
      headers: { "Authorization": "Bearer " + API_KEY },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    };
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
          // 🐛→✅ 2026-07 稽核抓到：原本 (choice.message && !choice.message.content) 只在 message 物件
          //   「存在但空」時才判定為審查攔截——若供應商回傳的拒答格式連 message 欄位本身都不給(不是
          //   給空 message)，這個判斷式整體為 false，會直接落到下一行 choice.message.content 炸出
          //   TypeError，被下面 catch 當成普通連線錯誤，跳過「降階重試(換更含蓄筆法)」的專屬處理，
          //   最後還會把技術性錯誤訊息原樣洩漏給玩家(而非「結界觸發」的柔和訊息)。改成「message 不存在
          //   或存在但空」都算審查攔截同一類，行為更貼近這段程式碼本來的意圖。
          if (choice.finish_reason === "content_filter" || choice.finish_reason === "SAFETY" || !choice.message || !choice.message.content) {
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
    return null; // 這顆模型全部重試都失敗
  }

  let apiResult = attemptWithModel_(modelName);
  if (apiResult === null && config.fallbackModel && config.fallbackModel !== modelName) {
    apiMessages[0].content = systemContent; // 換模型前重置降階提示詞，不帶著上一顆模型加的 softenSuffix
    apiResult = attemptWithModel_(config.fallbackModel);
  }
  if (apiResult !== null) return apiResult;

  const isBlocked = lastErrorMessage.includes("Triggered_NSFW_Filter") || lastErrorMessage.includes("safety");
  // 🎭 2026-07 玩家反映「solo不想出戲」查出：這裡過去直接把 lastErrorMessage(原始連線異常/HTTP錯誤/
  //   JSON解析失敗等技術性文字，常是英文或包含函式內部術語)嵌進 narration 欄位，當成「說書人講的話」
  //   原樣顯示給玩家——任何一次暫時性的網路/供應商異常，就會讓故事裡冒出一句英文錯誤訊息。改成：
  //   只在 Apps Script 執行紀錄(Logger)留一份給開發者除錯，玩家只看到貼合 Fate 世界觀的柔性重試提示。
  if (!isBlocked) { try { Logger.log("[callGeminiAPI 連線失敗] " + lastErrorMessage); } catch (e) { } }
  const fallbackNarration = isBlocked
    ? "🌸【結界觸發】妳的舉動觸動了某種微妙的禁制，此處的景象暫時被屏蔽，請再度嘗試。"
    : "🌫️【因果紊亂】命運的絲線在此刻忽地紊亂——這段因果暫時無法讀出，請稍後再試一次。";

  if (plainText) return fallbackNarration; // 散文模式：失敗也回純文字，不污染回憶錄成 JSON

  return JSON.stringify({
    narration: fallbackNarration, options: ["1. 深吸一口氣，平復心緒", "2. 溫柔地退開半步", "3. 輕聲轉移話題", "4. 稍作歇息"],
    rel_changes: []
  });
}

function doGet() {
  // 🔄 2026-07 玩家定案「試算表檢查改成純手動」：doGet 不再自動呼叫 ensureFateSheets_——改成登入
  //   畫面一顆「檢查/建立試算表」按鈕(check_sheets action)手動觸發，見 Setup_FateWorld.gs。
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('命運停駐之夜')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}
