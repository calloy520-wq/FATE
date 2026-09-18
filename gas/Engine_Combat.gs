// ==========================================
// 🔴【第二部分：LLM 核心調用】Engine_Combat.gs
//   callGeminiAPI：solo／鑑賞共用的 OpenRouter 呼叫核心，不歸屬任何單一軌道。
//   鑑賞專屬的 buildDefaultSystemPrompt(含 nsfwBaseRules)在 Gallery.gs，這裡只留兩軌共用的基礎設施。
// ==========================================
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。

function callGeminiAPI(prompt, systemOverride = null, config = {}) {
  if (!OPENROUTER_API_KEY) return JSON.stringify({ narration: "未設定 OPENROUTER_API_KEY", options: ["重試"] });

  if (typeof config === "number") config = { retries: config };
  const modelName = config.model || AI_MODEL;
  if (!modelName) return JSON.stringify({ narration: "未設定 MODEL 指令碼屬性", options: ["重試"] });
  const temp = config.temperature !== undefined ? config.temperature : 0.8;
  const topP = config.top_p !== undefined ? config.top_p : 0.95;
  // OpenRouter 額外採樣旋鈕(非OpenAI標準四件組)：不同底層模型支援程度不一，未設定的呼叫端完全不受影響，有帶的模型會吃到、不支援的模型OpenRouter會直接忽略(不會報錯)，故用undefined判斷、不給預設值。
  const maxT = config.max_tokens !== undefined ? config.max_tokens : (config.isNsfwMode ? 1000 : 2000);
  const retries = config.retries !== undefined ? config.retries : 5; // 🐛→✅ 玩家反饋審查攔截時想多試幾次，預設3→5次(單顆模型內)
  const plainText = !!config.plainText; // 🆕 純散文模式(如奪杯回憶錄)：不強制 json_object、不抽 {…}、原樣回傳內容
  let lastErrorMessage = "";

  // 規矩表(戰爭向提示詞)已移除，避免漏進慾海；config.ignoreLaw 保留只是相容鍵，已無實際作用。
  let systemContent = systemOverride || buildDefaultSystemPrompt();
  // 模型多半簡體語料偏多，光靠系統提示詞前段要求繁體仍會夾帶大陸用詞；在共用層尾端補強一句，兩軌都吃得到。
  systemContent += "\n\n【語言鐵律】全程僅使用台灣繁體中文（正體字），一律使用台灣在地慣用語與正體中文字形。";

  // 組裝原生多輪 messages 陣列
  let apiMessages = [
    { role: "system", content: systemContent }
  ];

  if (config.chatHistory && Array.isArray(config.chatHistory)) {
    apiMessages = apiMessages.concat(config.chatHistory);
  }

  apiMessages.push({ role: "user", content: prompt || "" });
  // payload/options 的組裝在下方 attemptWithModel_，因每次重試/換模型都要用實際模型重建

  // 單一模型的完整重試迴圈包成內部函式，讓外層能在整組重試失敗後換模型再試一輪；
  function attemptWithModel_(model) {
    // 📊 usage.include：把 prompt_tokens_details（cached_tokens／cache_write_tokens）帶回來。
    //    session_id：OpenRouter 的黏著路由靠它把同一局的連續請求釘在同一個端點——
    //    沒有它的話「要等偵測到快取命中才啟動」，每局開頭那幾回合都在賭。
    const payload = { model: model, messages: apiMessages, temperature: temp, top_p: topP, max_tokens: maxT, usage: { include: true } };
    if (config.sessionId) payload.session_id = String(config.sessionId).slice(0, 256);
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
    for (let i = 0; i < retries; i++) {
      try {
        const res = UrlFetchApp.fetch(MODEL_URL, options);
        const result = JSON.parse(res.getContentText());
        if (result.error) {
          // Gemini 審查攔截走 error 物件、格式跟 finish_reason 那條不同，統一丟同一個錯誤才能共用降階重試與柔和提示
          const errMsg = result.error.message || "API 內部錯誤";
          if (/PROHIBITED_CONTENT|SAFETY/i.test(errMsg)) throw new Error("Triggered_NSFW_Filter");
          throw new Error(errMsg);
        }
        if (result.choices && result.choices.length > 0) {
          let choice = result.choices[0];
          // message 欄位「不存在」與「存在但空」都要判定為審查攔截，否則前者會漏判成普通連線錯誤
          if (choice.finish_reason === "content_filter" || choice.finish_reason === "SAFETY" || !choice.message || !choice.message.content) {
            throw new Error("Triggered_NSFW_Filter");
          }
          let text = choice.message.content;
          if (plainText) { logCacheUsage_(model, result.usage, systemContent, result); return String(text || "").trim(); } // 散文模式：原樣回傳，不抽 {…}、不 JSON.parse
          const s = text.indexOf('{');
          const e = text.lastIndexOf('}');
          text = text.substring(s, e + 1);
          JSON.parse(text);
          logCacheUsage_(model, result.usage, systemContent, result);
          return text;
        } else { throw new Error("無效的選項結構"); }
      } catch (e) {
        lastErrorMessage = e.message;
        // 🚪 被審查擋下就不要原地重試：同一份輸入重送對攔截沒有意義（舊版還要空等 5×2 秒才換模型），
        //    直接讓這顆模型收工、交給後援那一顆。一般連線錯誤才退避重試。
        if (e.message === "Triggered_NSFW_Filter") break;
        if (i < retries - 1) {
          Utilities.sleep(2000);
        }
      }
    }
    return null; // 這顆模型全部重試都失敗
  }

  let apiResult = attemptWithModel_(modelName);
  // 後援是全域行為、不是某個呼叫端的特例——呼叫端不傳也一律有，才不會有哪條路徑被擋死就沒救。
  // ⚠ 唯一例外：NSFW 軌【被審查擋下】時走 LEWD_FALLBACK_MODEL（預設空＝不打第二輪）。
  //    主力已經是敢寫的那顆，退回一般後援只會再被擋一次，玩家白等一整輪。
  //    連線錯誤(非攔截)仍照舊走一般後援，那是真的可能換一顆就成功。
  const _blockedOnce = lastErrorMessage.indexOf("Triggered_NSFW_Filter") >= 0;
  const fallbackName = config.fallbackModel
    || ((config.isNsfwMode && _blockedOnce) ? LEWD_FALLBACK_MODEL : FALLBACK_MODEL);
  if (apiResult === null && fallbackName && fallbackName !== modelName) {
    apiResult = attemptWithModel_(fallbackName);
  }
  if (apiResult !== null) return apiResult;

  const isBlocked = lastErrorMessage.includes("Triggered_NSFW_Filter");
  // 技術性錯誤訊息只留 Logger 給開發者除錯，玩家一律只看到貼合世界觀的柔性重試提示，避免出戲。
  if (!isBlocked) { try { Logger.log("[callGeminiAPI 連線失敗] " + lastErrorMessage); } catch (e) { } }
  const fallbackNarration = aiFallbackNarration_(isBlocked);

  if (plainText) return fallbackNarration; // 散文模式：失敗也回純文字，不污染回憶錄成 JSON

  return JSON.stringify(aiFallbackData_(isBlocked));
}
// 📊 提示詞快取命中率：GAS 這端唯一看得到的數字。system 那一塊每回合逐字相同(探針驗過)，
//    命中時 cached_tokens 會接近它的長度；長期都是 0 就代表快取根本沒生效，別再往 system 搬東西。
//    ⚠ 只寫 Logger（零 I/O）：真正好看的報表在 OpenRouter 的 Activity／Logs（用 session_id 分組）。
function logCacheUsage_(model, usage, systemContent, result) {
  try {
    var d = (usage && usage.prompt_tokens_details) || {};
    var hit = parseInt(d.cached_tokens) || 0, wrote = parseInt(d.cache_write_tokens) || 0;
    var pt = (usage && parseInt(usage.prompt_tokens)) || 0;
    var sys = String(systemContent || '');
    // 🔀 provider：OpenRouter 可能把同一顆模型分給不同上游，每換一家快取就是冷的。
    //    黏著路由（session_id）要是沒生效，這一欄每次都會不一樣——那就是命中率上不去的根因。
    var prov = (result && (result.provider || (result.usage && result.usage.provider))) || '?';
    var disc = (usage && usage.cache_discount !== undefined) ? (' disc=' + usage.cache_discount) : '';
    Logger.log('[cache] ' + model + '@' + prov + ' prompt=' + pt + ' cached=' + hit + ' write=' + wrote
      + (pt ? ' hit=' + Math.round(100 * hit / pt) + '%' : '') + disc
      + ' sys=' + sys.length + '字/' + cheapHash_(sys));
  } catch (e) { }
}
// 🔢 一串字的短指紋（非密碼學用途，只為了肉眼比對兩次呼叫是不是同一份前綴）。
function cheapHash_(str) {
  var s = String(str || ''), h = 5381;
  for (var i = 0; i < s.length; i++) { h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8);
}

// 🛡️ 生成失敗時的統一保底：措辭與 _genFailed 旗標的【單一真實來源】。
function aiFallbackNarration_(isBlocked) {
  return isBlocked
    ? "🌸交纏的氣息還未散去，肌膚滾燙如火——下一幕卻被濃郁的水氣徹底吞沒，什麼都看不清了，請再嘗試一次。"
    : "🌫️【因果紊亂】命運的絲線忽地紊亂，這段因果暫時讀不出來。";
}
// _genFailed 旗標：這組是失敗保底文字、不是真正生成的敘事，讓呼叫端(narrateWithState_/actionPlay_)能辨識出來、不要把它當成既定劇情事實存進歷史——否則下次呼叫會把「什麼都沒發生」的保底措辭誤當上一輪的真實進展餵回AI，可能接續出跟實際劇情矛盾的敘事。
function aiFallbackData_(isBlocked) {
  return {
    narration: aiFallbackNarration_(isBlocked),
    options: ["1. 深吸一口氣，平復心緒", "2. 溫柔地退開半步", "3. 輕聲轉移話題", "4. 稍作歇息"],
    rel_changes: [], _genFailed: true
  };
}

function doGet() {
  // 不自動呼叫 ensureFateSheets_，改由登入畫面「檢查/建立試算表」按鈕(check_sheets action)手動觸發，見 Setup_FateWorld.gs。
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('命運停駐之夜')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}
