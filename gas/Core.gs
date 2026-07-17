// ==========================================
// 新專案 · 原創角色（白紙一張，2026-07 全砍重建）
// 唯一從舊專案 salvage 的東西：OpenRouter → LLM 呼叫核心 callGeminiAPI。
// 其餘（戰鬥/FATE 種子/鑑賞/九州）全部退役。創作方向待討論後再建。
// ==========================================

// --- LLM 呼叫設定（指令碼屬性優先，未設定落回預設）---
const OPENROUTER_API_KEY = (function () {
  return PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY') || '';
})();
const MODEL_URL = "https://openrouter.ai/api/v1/chat/completions";
const AI_MODEL = (function () {
  return PropertiesService.getScriptProperties().getProperty('MODEL') || 'google/gemini-3.1-flash-lite';
})();

// --- OpenRouter 呼叫核心（salvage 自舊 Engine_Combat.gs·已去除對戰鬥/鑑賞提示詞的依賴）---
// prompt：USER 訊息。systemOverride：SYSTEM 提示詞（不給＝空）。config：{model,temperature,top_p,
//   top_k,repetition_penalty,presence_penalty,frequency_penalty,max_tokens,retries,fallbackModel,
//   chatHistory[],plainText,isNsfwMode}。plainText=true 回原樣散文；否則回抽出的 {…} JSON 字串。
function callGeminiAPI(prompt, systemOverride = null, config = {}) {
  if (!OPENROUTER_API_KEY) return JSON.stringify({ text: "未設定 OPENROUTER_API_KEY" });

  if (typeof config === "number") config = { retries: config };
  const modelName = config.model || AI_MODEL;
  if (!modelName) return JSON.stringify({ text: "未設定 MODEL 指令碼屬性" });
  const temp = config.temperature !== undefined ? config.temperature : 0.8;
  const topP = config.top_p !== undefined ? config.top_p : 0.95;
  const maxT = config.max_tokens || (config.isNsfwMode ? 1000 : 2000);
  const retries = config.retries || 3;
  const plainText = !!config.plainText;
  let lastErrorMessage = "";

  let systemContent = systemOverride || "";
  // 底層模型（尤其 deepseek 系）簡體語料多，尾端補強一句台灣繁體鐵律（頭尾指令模型記得較牢）。
  systemContent += "\n\n【語言鐵律】全程僅使用台灣繁體中文（正體字），嚴禁簡體字與大陸慣用詞彙（視頻/質量/軟件/信息/內存/屏幕等），一律台灣在地慣用語與正體字形。";

  let apiMessages = [{ role: "system", content: systemContent }];
  if (config.chatHistory && Array.isArray(config.chatHistory)) apiMessages = apiMessages.concat(config.chatHistory);
  apiMessages.push({ role: "user", content: prompt || "" });

  // 審查攔截時下一次重試改用更含蓄筆法（原樣重送對攔截無意義）。
  const softenSuffix = `\n\n★【降階重試】上一次輸出未通過審查，請改用更含蓄典雅的筆法重演本回合：以景喻情、意境留白，避免直白器官名稱與動作描寫，情慾僅以氛圍與感官烘托，其餘輸出格式規則不變。`;

  function attemptWithModel_(model) {
    const payload = { model: model, messages: apiMessages, temperature: temp, top_p: topP, max_tokens: maxT };
    if (config.top_k !== undefined) payload.top_k = config.top_k;
    if (config.repetition_penalty !== undefined) payload.repetition_penalty = config.repetition_penalty;
    if (config.presence_penalty !== undefined) payload.presence_penalty = config.presence_penalty;
    if (config.frequency_penalty !== undefined) payload.frequency_penalty = config.frequency_penalty;
    if (!plainText) payload.response_format = { type: "json_object" };
    const options = {
      method: "post", contentType: "application/json",
      headers: { "Authorization": "Bearer " + OPENROUTER_API_KEY },
      payload: JSON.stringify(payload), muteHttpExceptions: true
    };
    let softened = false;
    for (let i = 0; i < retries; i++) {
      try {
        const res = UrlFetchApp.fetch(MODEL_URL, options);
        const result = JSON.parse(res.getContentText());
        if (result.error) {
          const errMsg = result.error.message || "API 內部錯誤";
          if (/PROHIBITED_CONTENT|SAFETY/i.test(errMsg)) throw new Error("Triggered_NSFW_Filter");
          throw new Error(errMsg);
        }
        if (result.choices && result.choices.length > 0) {
          let choice = result.choices[0];
          if (choice.finish_reason === "content_filter" || choice.finish_reason === "SAFETY" || !choice.message || !choice.message.content) {
            throw new Error("Triggered_NSFW_Filter");
          }
          let text = choice.message.content;
          if (plainText) return String(text || "").trim();
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
    return null;
  }

  let apiResult = attemptWithModel_(modelName);
  if (apiResult === null && config.fallbackModel && config.fallbackModel !== modelName) {
    apiMessages[0].content = systemContent; // 換模型前重置降階提示詞
    apiResult = attemptWithModel_(config.fallbackModel);
  }
  if (apiResult !== null) return apiResult;

  const isBlocked = lastErrorMessage.includes("Triggered_NSFW_Filter") || lastErrorMessage.includes("safety");
  if (!isBlocked) { try { Logger.log("[callGeminiAPI 連線失敗] " + lastErrorMessage); } catch (e) { } }
  const fallback = isBlocked ? "🌸【結界觸發】此處的景象暫時被屏蔽，請再試一次。" : "🌫️【因果紊亂】這段暫時無法讀出，請稍後再試。";
  if (plainText) return fallback;
  return JSON.stringify({ text: fallback });
}

// --- Web App 入口 ---
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('新專案')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}
