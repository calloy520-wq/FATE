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
  // 📊 system 那則改用 content part 陣列，把快取斷點掛在這一份逐字不變的規矩上。
  let apiMessages = [
    { role: "system", content: [{ type: "text", text: systemContent, cache_control: { type: "ephemeral" } }] }
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
    // 📊 prompt_cache_key：xAI 在 Responses API 用它當快取鍵，OpenRouter 也吃這個名字。
    if (config.sessionId) payload.prompt_cache_key = String(config.sessionId).slice(0, 256);
    if (config.top_k !== undefined) payload.top_k = config.top_k;
    if (config.repetition_penalty !== undefined) payload.repetition_penalty = config.repetition_penalty;
    if (config.presence_penalty !== undefined) payload.presence_penalty = config.presence_penalty;
    if (config.frequency_penalty !== undefined) payload.frequency_penalty = config.frequency_penalty;
    if (!plainText) payload.response_format = { type: "json_object" };
    const options = {
      method: "post", contentType: "application/json",
      headers: Object.assign({ "Authorization": "Bearer " + OPENROUTER_API_KEY },
        config.sessionId ? { "x-grok-conv-id": String(config.sessionId).slice(0, 256) } : {}),
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
          if (plainText) { logCacheUsage_(model, result.usage, systemContent, result); return toTaiwanTrad_(String(text || "").trim()); } // 散文模式：原樣回傳，不抽 {…}、不 JSON.parse
          const s = text.indexOf('{');
          const e = text.lastIndexOf('}');
          text = text.substring(s, e + 1);
          try { JSON.parse(text); }
          catch (pe) {
            // 模型的 JSON 壞了（字串裡的真換行／截斷／打錯字）：先救，救得回來就不必再花一顆模型。
            const fixed = repairAiJson_(choice.message.content);
            if (!fixed) throw pe;
            try { Logger.log("[callGeminiAPI JSON 修復] " + String(choice.message.content).slice(0, 120)); } catch (e3) { }
            text = fixed;
          }
          logCacheUsage_(model, result.usage, systemContent, result);
          return toTaiwanTrad_(text);
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
// 壞掉的模型 JSON 修復：①字串裡的真換行改成 \n；②還是不行就用正則把 narration／options／scene 撈出來重組。
//   回修好的 JSON 字串；連 narration 都撈不到才回 null（呼叫端照舊走重試／後援）。
// 簡體／舊字形→台灣正體：只收「繁體絕不會出現」的字（跟 check_simp.py 同一準則），一對一、逐字換，
//   多對一的字（后/發/乾/裡/麵/隻…）刻意不收。兩軌 AI 回覆在 callGeminiAPI 出口統一過一次。為什麼：見 CODE_NOTES.md『toTaiwanTrad_』。
var TRAD_MAP_SIMP_ = '\u4e2a\u4eec\u8fd9\u4e48\u8bf4\u8bdd\u65f6\u95ee\u73b0\u5b9e\u4e3a\u4f1a\u5b66\u4e60\u89c9\u8ba4\u8bc6\u8ba9\u8bb2\u8c08\u8bf7\u8c22\u8fb9\u8fc7\u8fd8\u8fdb\u8fdc\u8fde\u8fbe\u8fdf\u8fd0\u9009\u9002\u9012\u9057\u90bb\u95e8\u5f00\u5173\u95ed\u95fb\u95f9\u95ea\u4e1c\u8f66\u8f6e\u8f6c\u8f6f\u8f7b\u8f83\u8f86\u8f93\u8f7d\u89c1\u89c2\u89c4\u89c6\u89c8\u8d1d\u8d35\u8d39\u8d27\u8d22\u8d34\u8d2d\u8d37\u8d5b\u8d5e\u8d62\u8d4f\u8d28\u8d23\u8d24\u8d2b\u8d4b\u8d2f\u8d56\u8d76\u9a6c\u9a91\u9a7e\u9a8c\u9a97\u9a7b\u9a76\u9a82\u9a84\u60ca\u9e1f\u9e21\u9e23\u9e2d\u9e45\u9e64\u51e4\u9c7c\u9c9c\u9c81\u9c8d\u97e6\u8fdd\u56f4\u4f1f\u7eac\u957f\u5f20\u5e10\u8d26\u80c0\u6da8\u98ce\u75af\u67ab\u8bbd\u98de\u6c64\u573a\u626c\u6768\u80a0\u8361\u4e1a\u4e25\u4e1b\u4e1d\u4e22\u4e50\u836f\u4e66\u663c\u753b\u4e70\u5356\u8bfb\u7eed\u53f7\u513f\u4e61\u5199\u519b\u6325\u8f89\u519c\u6d53\u51b3\u51cf\u51c9\u51c0\u5218\u521a\u521b\u522b\u5220\u5251\u52b3\u52bf\u52a8\u52a1\u533b\u534e\u5355\u536b\u53c2\u53cc\u53d8\u53f6\u542f\u5458\u54cd\u54d1\u5524\u56e2\u56ed\u56fe\u5706\u56fd\u5792\u5757\u575a\u575b\u574f\u6267\u58f0\u5904\u5934\u5939\u593a\u594b\u5956\u5986\u5987\u5988\u5a74\u5b59\u5b81\u5ba1\u5bbd\u5bbe\u5bf9\u5bfb\u5bfc\u5c06\u5c14\u5c18\u5c1d\u5c42\u5c5e\u5c81\u5c9b\u5c82\u5e01\u5e05\u5e08\u5e2e\u5e26\u5e7f\u5e86\u5e84\u5e94\u5e93\u5f25\u5f52\u5f53\u5f55\u5f7b\u5f84\u5fc6\u5fe7\u6000\u6001\u601c\u603b\u604b\u6076\u6073\u607c\u60e7\u60e8\u60ef\u6124\u613f\u620f\u6218\u6251\u6269\u626b\u62c5\u62df\u62e2\u62e9\u6302\u6324\u635f\u6362\u636e\u63b7\u6402\u6446\u6444\u644a\u6512\u654c\u6570\u65ad\u663e\u6653\u6682\u672f\u673a\u6740\u6742\u6743\u6765\u6781\u6784\u67aa\u6807\u680f\u6811\u6837\u6865\u68c0\u697c\u6b22\u6b8b\u6bc1\u6c14\u6c49\u6d01\u6d4e\u6d45\u6d4b\u6d9b\u6da6\u6e10\u6e7e\u6e83\u6ee1\u6eda\u6ee4\u6ee8\u6ee9\u706d\u706f\u7075\u7089\u70c2\u70e6\u70e7\u70ed\u7231\u7237\u72b9\u72ec\u72ee\u730e\u732a\u732b\u732e\u73af\u7535\u7597\u76d1\u76d8\u7741\u7801\u7855\u786e\u788d\u793c\u7978\u7977\u79bb\u79cd\u79ef\u79f0\u7a33\u7a77\u7a83\u7a9c\u7a9d\u7ade\u7b0b\u7b14\u7b3c\u7b80\u7b79\u7bee\u7c7b\u7cae\u7ea0\u7ea2\u7eaa\u7eaf\u7eb3\u7eb5\u7eb7\u7eb8\u7eb9\u7ec7\u7ec8\u7ec4\u7ec6\u7ec5\u7eca\u7ecd\u7ecf\u7ed1\u7ed2\u7ed3\u7ed5\u7ed8\u7ed9\u7edd\u7edc\u7ede\u7edf\u7ee7\u7ee9\u7eea\u7ef3\u7ef4\u7ef5\u7ef7\u7efc\u7efd\u7eff\u7f13\u7f16\u7f18\u7f20\u7f29\u7f24\u7f34\u7f57\u7f5a\u7fd8\u803b\u804c\u8054\u806a\u8083\u80bf\u8109\u810f\u8111\u8138\u814a\u817b\u8230\u8231\u8270\u827a\u8282\u82a6\u82f9\u830e\u8350\u8363\u83b1\u83b2\u8427\u848b\u84dd\u8537\u864f\u8651\u866b\u8681\u86ee\u8721\u8749\u8865\u886c\u8884\u88c5\u8ba1\u8ba2\u8ba5\u8ba8\u8bad\u8bae\u8baf\u8bb0\u8bb8\u8bba\u8bbc\u8bbe\u8bbf\u8bc0\u8bc1\u8bc4\u8bc8\u8bc9\u8bca\u8bcd\u8bd1\u8bd5\u8bd7\u8bda\u8bde\u8be1\u8be2\u8be5\u8be6\u8beb\u8bed\u8bef\u8bf5\u8bf8\u8bfa\u8bfe\u8c01\u8c03\u8c05\u8c0a\u8c0b\u8c0e\u8c10\u8c13\u8c1c\u8c23\u8c26\u8c28\u8c31\u8c34\u8d8b\u8dc3\u8df5\u8f68\u8f69\u8f70\u8f9e\u529e\u8fc1\u90ae\u90d1\u915d\u949f\u94a2\u94a5\u94b1\u94bb\u94c1\u94c3\u94dc\u94fa\u94fe\u9500\u9501\u950b\u9519\u9526\u952e\u9547\u955c\u95ef\u95f7\u95f2\u9600\u9601\u9605\u9614\u961f\u9636\u9633\u9634\u9646\u9648\u9669\u9690\u96be\u96cf\u97e9\u9875\u9876\u9879\u987a\u987b\u987d\u987e\u987f\u9881\u9882\u9884\u9886\u9887\u9888\u988a\u9891\u9897\u9898\u989c\u989d\u98a4\u9965\u996d\u996e\u9970\u9971\u9976\u9986\u9aa4\u9ac5\u9ea6\u9f50\u9f7f\u9f84\u9f99\u9f9f\u4ea7\u67a2\u6984\u6ba1\u6da1\u739b\u73d1\u743c\u7f06\u8d75\u7740\u88cf\u7232\u9ebd\u8846\u7dab\u8aac\u61d2\u968f\u53a8\u629b\u811a\u51d1\u51b5\u6e29\u7523\u53f9\u6237\u5185\u5151\u9ec4\u5f93\u570f\u5358\u53ce\u51e6\u4e89\u5bdb\u5b9f\u5bfe\u5c02\u5fb3\u697d\u6c17\u6ca2\u6d99\u767a\u5fdc\u6226\u62dd\u63b2\u691c\u6b69\u6b73\u6e80\u6e08\u713c\u7363\u770c\u7e01\u7d99\u8074\u8535\u8a33\u8aad\u8cdb\u8ee2\u8efd\u8fba\u9045\u90f7\u967a\u96a3\u96d1\u970a\u9854\u99c5\u9a13\u9d8f\u9eba\u9f62\u9ed2\u9332\u4e80\u8a89\u8cce\u91a4\u9244\u92ad\u932c\u95d8\u9665\u96a0\u8987';
var TRAD_MAP_TRAD_ = '個們這麼說話時問現實為會學習覺認識讓講談請謝邊過還進遠連達遲運選適遞遺鄰門開關閉聞鬧閃東車輪轉軟輕較輛輸載見觀規視覽貝貴費貨財貼購貸賽讚贏賞質責賢貧賦貫賴趕馬騎駕驗騙駐駛罵驕驚鳥雞鳴鴨鵝鶴鳳魚鮮魯鮑韋違圍偉緯長張帳賬脹漲風瘋楓諷飛湯場揚楊腸蕩業嚴叢絲丟樂藥書晝畫買賣讀續號兒鄉寫軍揮輝農濃決減涼淨劉剛創別刪劍勞勢動務醫華單衛參雙變葉啟員響啞喚團園圖圓國壘塊堅壇壞執聲處頭夾奪奮獎妝婦媽嬰孫寧審寬賓對尋導將爾塵嘗層屬歲島豈幣帥師幫帶廣慶莊應庫彌歸當錄徹徑憶憂懷態憐總戀惡懇惱懼慘慣憤願戲戰撲擴掃擔擬攏擇掛擠損換據擲摟擺攝攤攢敵數斷顯曉暫術機殺雜權來極構槍標欄樹樣橋檢樓歡殘毀氣漢潔濟淺測濤潤漸灣潰滿滾濾濱灘滅燈靈爐爛煩燒熱愛爺猶獨獅獵豬貓獻環電療監盤睜碼碩確礙禮禍禱離種積稱穩窮竊竄窩競筍筆籠簡籌籃類糧糾紅紀純納縱紛紙紋織終組細紳絆紹經綁絨結繞繪給絕絡絞統繼績緒繩維綿繃綜綻綠緩編緣纏縮繽繳羅罰翹恥職聯聰肅腫脈髒腦臉臘膩艦艙艱藝節蘆蘋莖薦榮萊蓮蕭蔣藍薔虜慮蟲蟻蠻蠟蟬補襯襖裝計訂譏討訓議訊記許論訟設訪訣證評詐訴診詞譯試詩誠誕詭詢該詳誡語誤誦諸諾課誰調諒誼謀謊諧謂謎謠謙謹譜譴趨躍踐軌軒轟辭辦遷郵鄭醞鐘鋼鑰錢鑽鐵鈴銅鋪鏈銷鎖鋒錯錦鍵鎮鏡闖悶閒閥閣閱闊隊階陽陰陸陳險隱難雛韓頁頂項順須頑顧頓頒頌預領頗頸頰頻顆題顏額顫飢飯飲飾飽饒館驟髏麥齊齒齡龍龜產樞欖殯渦瑪瓏瓊纜趙著裡為麼眾線說懶隨廚拋腳湊況溫產嘆戶內兌黃從圈單收處爭寬實對專德樂氣澤淚發應戰拜揭檢步歲滿濟燒獸縣緣繼聽藏譯讀贊轉輕邊遲鄉險鄰雜靈顏驛驗雞麵齡黑錄龜譽賤醬鐵錢鍊鬥陷隱霸';
var TRAD_MAP_ = null;
function toTaiwanTrad_(text) {
  const s = String(text || "");
  if (!s) return s;
  if (!TRAD_MAP_) { TRAD_MAP_ = {}; for (let i = 0; i < TRAD_MAP_SIMP_.length; i++) TRAD_MAP_[TRAD_MAP_SIMP_[i]] = TRAD_MAP_TRAD_[i]; }
  let out = "", hit = false;
  for (let i = 0; i < s.length; i++) { const c = s[i], t = TRAD_MAP_[c]; if (t) { hit = true; out += t; } else out += c; }
  return hit ? out : s;
}

function repairAiJson_(raw) {
  var text = String(raw || "");
  var s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0) return null;
  text = e > s ? text.substring(s, e + 1) : text.substring(s);
  // ① 字串內的控制字元轉義（模型排版時常在 narration 裡放真換行，JSON.parse 直接炸）
  var out = "", inStr = false, esc = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inStr) {
      if (esc) { out += c; esc = false; continue; }
      if (c === '\\') { out += c; esc = true; continue; }
      if (c === '"') { inStr = false; out += c; continue; }
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\r') { continue; }
      if (c === '\t') { out += ' '; continue; }
      out += c; continue;
    }
    if (c === '"') inStr = true;
    out += c;
  }
  try { JSON.parse(out); return out; } catch (e1) { }
  // ② 逐欄撈：narration 必要，其餘有就收
  var str = function (key) {
    var m = out.match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
    if (m) return m[1];
    // 截斷：字串沒收尾，就拿到字串結尾（最後一個引號之前的內容不可信，整段當作內文）
    var t = out.match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)$'));
    return t ? t[1] : null;
  };
  var narration = str('narration');
  if (narration == null || narration.replace(/\\n/g, '').trim().length < 20) return null;
  var options = [];
  var om = out.match(/"options"\s*:\s*\[([\s\S]*?)\]/);
  if (om) { var re = /"((?:[^"\\]|\\.)*)"/g, mm; while ((mm = re.exec(om[1])) !== null) options.push(mm[1]); }
  var scene = str('scene');
  var obj = { narration: narration, options: options.slice(0, 6), scene: scene && scene.length <= 40 ? scene : "" };
  try {
    // 上面撈到的是「JSON 逃脫過的原文」，先 parse 一次還原，再交給 JSON.stringify 重新逃脫。
    obj.narration = JSON.parse('"' + obj.narration + '"');
    obj.options = obj.options.map(function (o) { try { return JSON.parse('"' + o + '"'); } catch (e) { return o; } });
    obj.scene = obj.scene ? JSON.parse('"' + obj.scene + '"') : "";
  } catch (e2) { return null; }
  return JSON.stringify(obj);
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
    ? "🌸這一段說書人寫不了——按下輸入框旁邊的 🔥 再送一次，換一位敢寫的說書人接手。"
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
