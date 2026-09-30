// AI 呼叫層（OpenRouter）：金鑰與模型都從「指令碼屬性」讀，換模型不必改程式。
//   OPENROUTER_API_KEY（必填）、SEA_MODEL（副官說話，預設 MODEL 或 gemini-3.5-flash）、
//   SEA_PARSE_MODEL（把玩家的話翻成動作，預設 CREATION_MODEL 或 gemini-3.5-flash-lite）、FALLBACK_MODEL（失敗時換這顆）。
var AI_URL_ = 'https://openrouter.ai/api/v1/chat/completions';
function aiProp_(k, d) { try { return PropertiesService.getScriptProperties().getProperty(k) || d; } catch (e) { return d; } }
function aiModels_() {
  return {
    talk: aiProp_('SEA_MODEL', aiProp_('MODEL', 'google/gemini-3.5-flash')),
    parse: aiProp_('SEA_PARSE_MODEL', aiProp_('CREATION_MODEL', 'google/gemini-3.5-flash-lite')),
    fallback: aiProp_('FALLBACK_MODEL', 'x-ai/grok-4.20')
  };
}

// 送一次：回解析好的 JSON 物件；失敗（連線、格式）回 null，呼叫端決定怎麼辦。
function aiJson_(system, user, opt) {
  opt = opt || {};
  var key = aiProp_('OPENROUTER_API_KEY', '');
  if (!key) return null;
  var models = [opt.model, aiModels_().fallback].filter(function (m, i, a) { return m && a.indexOf(m) === i; });
  for (var mi = 0; mi < models.length; mi++) {
    for (var i = 0; i < (opt.retries || 2); i++) {
      try {
        var res = UrlFetchApp.fetch(AI_URL_, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          headers: { Authorization: 'Bearer ' + key },
          payload: JSON.stringify({ model: models[mi], temperature: opt.temperature === undefined ? 0.7 : opt.temperature, max_tokens: opt.max_tokens || 900,
            response_format: { type: 'json_object' }, reasoning: { effort: 'none', exclude: true },
            messages: [{ role: 'system', content: system + '\n\n全程只用台灣繁體中文與台灣慣用語。' }, { role: 'user', content: user }] }) });
        var body = JSON.parse(res.getContentText());
        var text = body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
        if (!text) throw new Error((body && body.error && body.error.message) || '空回應');
        var obj = aiParseJson_(toTaiwanTrad_(text));
        if (obj) return obj;
        throw new Error('JSON 壞掉');
      } catch (e) {
        try { Logger.log('[aiJson_] ' + models[mi] + ' ' + e.message); } catch (e2) { }
        if (i < (opt.retries || 2) - 1) Utilities.sleep(800);
      }
    }
  }
  return null;
}
// 模型的 JSON 常夾雜說明文字或字串裡的真換行：取第一個 { 到最後一個 }，換行轉義後再解析。
function aiParseJson_(text) {
  var s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  s = s.substring(a, b + 1);
  try { return JSON.parse(s); } catch (e) { }
  var out = '', inStr = false, esc = false;
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; else if (c === '\n') { out += '\\n'; continue; } else if (c === '\r') continue; }
    else if (c === '"') inStr = true;
    out += c;
  }
  try { return JSON.parse(out); } catch (e) { return null; }
}

// 簡體／舊字形 → 台灣正體：只收繁體絕不會出現的字，一對一逐字換。
var TRAD_MAP_SIMP_ = '\u4e2a\u4eec\u8fd9\u4e48\u8bf4\u8bdd\u65f6\u95ee\u73b0\u5b9e\u4e3a\u4f1a\u5b66\u4e60\u89c9\u8ba4\u8bc6\u8ba9\u8bb2\u8c08\u8bf7\u8c22\u8fb9\u8fc7\u8fd8\u8fdb\u8fdc\u8fde\u8fbe\u8fdf\u8fd0\u9009\u9002\u9012\u9057\u90bb\u95e8\u5f00\u5173\u95ed\u95fb\u95f9\u95ea\u4e1c\u8f66\u8f6e\u8f6c\u8f6f\u8f7b\u8f83\u8f86\u8f93\u8f7d\u89c1\u89c2\u89c4\u89c6\u89c8\u8d1d\u8d35\u8d39\u8d27\u8d22\u8d34\u8d2d\u8d37\u8d5b\u8d5e\u8d62\u8d4f\u8d28\u8d23\u8d24\u8d2b\u8d4b\u8d2f\u8d56\u8d76\u9a6c\u9a91\u9a7e\u9a8c\u9a97\u9a7b\u9a76\u9a82\u9a84\u60ca\u9e1f\u9e21\u9e23\u9e2d\u9e45\u9e64\u51e4\u9c7c\u9c9c\u9c81\u9c8d\u97e6\u8fdd\u56f4\u4f1f\u7eac\u957f\u5f20\u5e10\u8d26\u80c0\u6da8\u98ce\u75af\u67ab\u8bbd\u98de\u6c64\u573a\u626c\u6768\u80a0\u8361\u4e1a\u4e25\u4e1b\u4e1d\u4e22\u4e50\u836f\u4e66\u663c\u753b\u4e70\u5356\u8bfb\u7eed\u53f7\u513f\u4e61\u5199\u519b\u6325\u8f89\u519c\u6d53\u51b3\u51cf\u51c9\u51c0\u5218\u521a\u521b\u522b\u5220\u5251\u52b3\u52bf\u52a8\u52a1\u533b\u534e\u5355\u536b\u53c2\u53cc\u53d8\u53f6\u542f\u5458\u54cd\u54d1\u5524\u56e2\u56ed\u56fe\u5706\u56fd\u5792\u5757\u575a\u575b\u574f\u6267\u58f0\u5904\u5934\u5939\u593a\u594b\u5956\u5986\u5987\u5988\u5a74\u5b59\u5b81\u5ba1\u5bbd\u5bbe\u5bf9\u5bfb\u5bfc\u5c06\u5c14\u5c18\u5c1d\u5c42\u5c5e\u5c81\u5c9b\u5c82\u5e01\u5e05\u5e08\u5e2e\u5e26\u5e7f\u5e86\u5e84\u5e94\u5e93\u5f25\u5f52\u5f53\u5f55\u5f7b\u5f84\u5fc6\u5fe7\u6000\u6001\u601c\u603b\u604b\u6076\u6073\u607c\u60e7\u60e8\u60ef\u6124\u613f\u620f\u6218\u6251\u6269\u626b\u62c5\u62df\u62e2\u62e9\u6302\u6324\u635f\u6362\u636e\u63b7\u6402\u6446\u6444\u644a\u6512\u654c\u6570\u65ad\u663e\u6653\u6682\u672f\u673a\u6740\u6742\u6743\u6765\u6781\u6784\u67aa\u6807\u680f\u6811\u6837\u6865\u68c0\u697c\u6b22\u6b8b\u6bc1\u6c14\u6c49\u6d01\u6d4e\u6d45\u6d4b\u6d9b\u6da6\u6e10\u6e7e\u6e83\u6ee1\u6eda\u6ee4\u6ee8\u6ee9\u706d\u706f\u7075\u7089\u70c2\u70e6\u70e7\u70ed\u7231\u7237\u72b9\u72ec\u72ee\u730e\u732a\u732b\u732e\u73af\u7535\u7597\u76d1\u76d8\u7741\u7801\u7855\u786e\u788d\u793c\u7978\u7977\u79bb\u79cd\u79ef\u79f0\u7a33\u7a77\u7a83\u7a9c\u7a9d\u7ade\u7b0b\u7b14\u7b3c\u7b80\u7b79\u7bee\u7c7b\u7cae\u7ea0\u7ea2\u7eaa\u7eaf\u7eb3\u7eb5\u7eb7\u7eb8\u7eb9\u7ec7\u7ec8\u7ec4\u7ec6\u7ec5\u7eca\u7ecd\u7ecf\u7ed1\u7ed2\u7ed3\u7ed5\u7ed8\u7ed9\u7edd\u7edc\u7ede\u7edf\u7ee7\u7ee9\u7eea\u7ef3\u7ef4\u7ef5\u7ef7\u7efc\u7efd\u7eff\u7f13\u7f16\u7f18\u7f20\u7f29\u7f24\u7f34\u7f57\u7f5a\u7fd8\u803b\u804c\u8054\u806a\u8083\u80bf\u8109\u810f\u8111\u8138\u814a\u817b\u8230\u8231\u8270\u827a\u8282\u82a6\u82f9\u830e\u8350\u8363\u83b1\u83b2\u8427\u848b\u84dd\u8537\u864f\u8651\u866b\u8681\u86ee\u8721\u8749\u8865\u886c\u8884\u88c5\u8ba1\u8ba2\u8ba5\u8ba8\u8bad\u8bae\u8baf\u8bb0\u8bb8\u8bba\u8bbc\u8bbe\u8bbf\u8bc0\u8bc1\u8bc4\u8bc8\u8bc9\u8bca\u8bcd\u8bd1\u8bd5\u8bd7\u8bda\u8bde\u8be1\u8be2\u8be5\u8be6\u8beb\u8bed\u8bef\u8bf5\u8bf8\u8bfa\u8bfe\u8c01\u8c03\u8c05\u8c0a\u8c0b\u8c0e\u8c10\u8c13\u8c1c\u8c23\u8c26\u8c28\u8c31\u8c34\u8d8b\u8dc3\u8df5\u8f68\u8f69\u8f70\u8f9e\u529e\u8fc1\u90ae\u90d1\u915d\u949f\u94a2\u94a5\u94b1\u94bb\u94c1\u94c3\u94dc\u94fa\u94fe\u9500\u9501\u950b\u9519\u9526\u952e\u9547\u955c\u95ef\u95f7\u95f2\u9600\u9601\u9605\u9614\u961f\u9636\u9633\u9634\u9646\u9648\u9669\u9690\u96be\u96cf\u97e9\u9875\u9876\u9879\u987a\u987b\u987d\u987e\u987f\u9881\u9882\u9884\u9886\u9887\u9888\u988a\u9891\u9897\u9898\u989c\u989d\u98a4\u9965\u996d\u996e\u9970\u9971\u9976\u9986\u9aa4\u9ac5\u9ea6\u9f50\u9f7f\u9f84\u9f99\u9f9f\u4ea7\u67a2\u6984\u6ba1\u6da1\u739b\u73d1\u743c\u7f06\u8d75\u7740\u88cf\u7232\u9ebd\u8846\u7dab\u8aac\u61d2\u968f\u53a8\u629b\u811a\u51d1\u51b5\u6e29\u7523\u53f9\u6237\u5185\u5151\u9ec4\u5f93\u570f\u5358\u53ce\u51e6\u4e89\u5bdb\u5b9f\u5bfe\u5c02\u5fb3\u697d\u6c17\u6ca2\u6d99\u767a\u5fdc\u6226\u62dd\u63b2\u691c\u6b69\u6b73\u6e80\u6e08\u713c\u7363\u770c\u7e01\u7d99\u8074\u8535\u8a33\u8aad\u8cdb\u8ee2\u8efd\u8fba\u9045\u90f7\u967a\u96a3\u96d1\u970a\u9854\u99c5\u9a13\u9d8f\u9eba\u9f62\u9ed2\u9332\u4e80\u8a89\u8cce\u91a4\u9244\u92ad\u932c\u95d8\u9665\u96a0\u8987';
var TRAD_MAP_TRAD_ = '個們這麼說話時問現實為會學習覺認識讓講談請謝邊過還進遠連達遲運選適遞遺鄰門開關閉聞鬧閃東車輪轉軟輕較輛輸載見觀規視覽貝貴費貨財貼購貸賽讚贏賞質責賢貧賦貫賴趕馬騎駕驗騙駐駛罵驕驚鳥雞鳴鴨鵝鶴鳳魚鮮魯鮑韋違圍偉緯長張帳賬脹漲風瘋楓諷飛湯場揚楊腸蕩業嚴叢絲丟樂藥書晝畫買賣讀續號兒鄉寫軍揮輝農濃決減涼淨劉剛創別刪劍勞勢動務醫華單衛參雙變葉啟員響啞喚團園圖圓國壘塊堅壇壞執聲處頭夾奪奮獎妝婦媽嬰孫寧審寬賓對尋導將爾塵嘗層屬歲島豈幣帥師幫帶廣慶莊應庫彌歸當錄徹徑憶憂懷態憐總戀惡懇惱懼慘慣憤願戲戰撲擴掃擔擬攏擇掛擠損換據擲摟擺攝攤攢敵數斷顯曉暫術機殺雜權來極構槍標欄樹樣橋檢樓歡殘毀氣漢潔濟淺測濤潤漸灣潰滿滾濾濱灘滅燈靈爐爛煩燒熱愛爺猶獨獅獵豬貓獻環電療監盤睜碼碩確礙禮禍禱離種積稱穩窮竊竄窩競筍筆籠簡籌籃類糧糾紅紀純納縱紛紙紋織終組細紳絆紹經綁絨結繞繪給絕絡絞統繼績緒繩維綿繃綜綻綠緩編緣纏縮繽繳羅罰翹恥職聯聰肅腫脈髒腦臉臘膩艦艙艱藝節蘆蘋莖薦榮萊蓮蕭蔣藍薔虜慮蟲蟻蠻蠟蟬補襯襖裝計訂譏討訓議訊記許論訟設訪訣證評詐訴診詞譯試詩誠誕詭詢該詳誡語誤誦諸諾課誰調諒誼謀謊諧謂謎謠謙謹譜譴趨躍踐軌軒轟辭辦遷郵鄭醞鐘鋼鑰錢鑽鐵鈴銅鋪鏈銷鎖鋒錯錦鍵鎮鏡闖悶閒閥閣閱闊隊階陽陰陸陳險隱難雛韓頁頂項順須頑顧頓頒頌預領頗頸頰頻顆題顏額顫飢飯飲飾飽饒館驟髏麥齊齒齡龍龜產樞欖殯渦瑪瓏瓊纜趙著裡為麼眾線說懶隨廚拋腳湊況溫產嘆戶內兌黃從圈單收處爭寬實對專德樂氣澤淚發應戰拜揭檢步歲滿濟燒獸縣緣繼聽藏譯讀贊轉輕邊遲鄉險鄰雜靈顏驛驗雞麵齡黑錄龜譽賤醬鐵錢鍊鬥陷隱霸';
var TRAD_MAP_ = null;
function toTaiwanTrad_(text) {
  var s = String(text || '');
  if (!TRAD_MAP_) { TRAD_MAP_ = {}; for (var i = 0; i < TRAD_MAP_SIMP_.length; i++) TRAD_MAP_[TRAD_MAP_SIMP_[i]] = TRAD_MAP_TRAD_[i]; }
  var out = '';
  for (var j = 0; j < s.length; j++) out += TRAD_MAP_[s[j]] || s[j];
  return out;
}
