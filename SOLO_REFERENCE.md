# 命運停駐之夜 — 單人(solo)模式 代碼參考筆記

> 給 Claude 的速查手冊。標函數名＋作用＋資料流。改動前先查這份。
> 專案：calloy520-wq/FATE（gas/ 內為 Apps Script，clasp 推 branch 自動部署）。
> 開發分支：`claude/fate-error-review-w8q42w`（commit→push→GitHub Action 自動 clasp deploy）。

---

## 0. 紅線（絕對不可違反）

| 規則 | 說明 |
|---|---|
| **慾海禁區** | `nsfwBaseRules`（演化核心，**2026-07 已搬到 `Gallery.gs`**，原在 `Engine_Combat.gs`——見本節下方「兩軌完全拆開」條目）＋整套 NSFW 機制**一律不可改**。只能改 SFW 的 gating／名冊。**⚠ 2026-07 修**：`actionPlay` 的 `isNsfwMode` 原本 solo 仍信前端 `userData.isNsfw`(來自共用 `nsfw-mode-toggle` checkbox，鑑賞模式進場會強制設 true、離場只隱藏不重置)，玩家鑑賞切回 solo 若忘了手動取消勾選，殘留的 true 會讓 solo 也跑 `nsfwBaseRules`——已改純看 `pcId` 是否 `KPC_` 開頭(kanshou路由)，完全不信任何前端旗標，solo 一律鎖 SFW。 |
| **九州 GAS 不可動** | 原始九州/GAS repo 只能複製過來，不可改。 |
| **show-don't-tell** | 敘事中**禁止**直接寫出角色的 願望／個性／萌點 字面。只能用神態動作演出。`servantCard_` 鐵則一二三 已強制。 |
| **model id** | `claude-opus-4-8` 不可出現在 commit／PR／程式碼。 |
| **branch** | 只在 `claude/fate-error-review-w8q42w` 開發。 |

驗證套路：跑 `bash check.sh`（自動掃全部 .gs ＋萬用比對 `gas/Script*.html`，見 `HANDBOOK.md` §4.1）。改慾海邊界務必 `git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` 確認 0 改動(**2026-07 起 `nsfwBaseRules` 定義在 `Gallery.gs`，不再是 `Engine_Combat.gs`**，改對檔案才有意義)。**⚠ 這條 grep 只檢查含「nsfwBaseRules」字樣的行有沒有變動，不代表整個檔案沒改——只要異動行本身沒提到這個變數名，grep 數就是 0，但仍須自己判斷是否碰到紅線①保護的機制範疇。**

**🧹→✅ 2026-07 玩家定案「刪除吧」→「isNsfwMode 也不用分模式了，統合起來」：`buildDefaultSystemPrompt`(`Engine_Combat.gs`)整個 SFW／`isNsfwMode` 分支已徹底移除，函式簽名從 `(isNsfwMode, backLocked)` 簡化為無參數 `()`。** 分兩輪完成：①先刪 `sfwBaseRules`(SFW/純淨模式鐵律全文)整段常數；②既然這個函式現在只可能被鑑賞(慾海)呼叫(`isNsfwMode` 恆為 `true`，理由見下)，玩家進一步定案把剩下的 `isNsfwMode` 三元分支也一併拿掉：`baseJson`(共用中介物件，narration 依 isNsfwMode 二選一)、`finalJson` 的 if/else(SFW 分支 `baseJson.intimacy_feedback=...;delete finalJson.options`)、`specificRules` 的 else 分支(【聖杯戰爭】戰鬥鐵律)全部刪除，只留 NSFW 唯一版本；`callGeminiAPI` 呼叫處也從 `buildDefaultSystemPrompt(config.isNsfwMode, config.backLocked)` 簡化為 `buildDefaultSystemPrompt()`。**根據**：solo(按鍵制)走完全獨立的 `miniSystem`(`Router_Narrative.gs` `actionNarrateOnly`)，從不呼叫 `buildDefaultSystemPrompt`；而此函式唯一呼叫來源是 `callGeminiAPI` 的 `systemOverride` 為空時的 fallback，唯一會用空 `systemOverride` 呼叫的是 `actionPlay`(自由聊天引擎)——但 `actionPlay` 的 `isNsfwMode` 恆等於 `pcId` 開頭是否為 `KPC_`，且全專案已無任何路徑把 `pc.mode` 設為 `'full'`(九州殘留、已停用；grep 全 `gas/` 目錄找不到任何 `'full'` 字面賦值)，故 `isNsfwMode` 進到這裡永遠是 `true`。**順手清**：舊簽名的 `backLocked` 參數在函式體內從未被讀取過，是傳到這裡就斷頭的死參數，一併拿掉(呼叫端 `config.backLocked` 另有他用，不受影響，見 `aiConfig.backLocked` 賦值處)。**注意**：`git diff -- gas/Engine_Combat.gs | grep -c nsfwBaseRules` 這次會顯示非 0——是因為 `return` 那行、以及 diff 呈現的 context 行本身「提到」`nsfwBaseRules` 這個變數名，並非改動 `nsfwBaseRules` 常數本身的宣告/內容，該常數的模板字面（含 `dialogueFormatRule_("眼神一沉")` 呼叫）逐字比對後一字未動。**現在 real runtime 上唯一還會變動的「模式」旗標只剩 `driveOn`(🔥主動掌握，`actionPlay` 自己組的 `driveStr`，不在 `buildDefaultSystemPrompt` 管轄範圍內)。**

**🔀🔀 2026-07 玩家定案「兩軌完全拆開，鑑賞集中在一個GS，好查找」**：上面這些「isNsfwMode 統合」的分析已經反覆確認同一件事——`actionPlay` 跟 `buildDefaultSystemPrompt` 這兩個函式**本質上就是鑑賞專屬**，只是物理上還放在 solo 的家(`Router_Narrative.gs`)跟通用的家(`Engine_Combat.gs`)裡，查找/改動時得跳兩三個檔案才能拼出鑑賞的全貌。玩家一句話點破現況：「SOLO 基本都是按鍵+AI說故事而已，鑑賞就是依照給AI的資料自然演出，只有要分辨有沒有點火而已」——兩軌邏輯早已徹底獨立，只差沒把檔案位置也理順。**動手**：把 `actionPlay`(原 `Router_Narrative.gs:9-584`)＋`buildDefaultSystemPrompt`含 `nsfwBaseRules`(原 `Engine_Combat.gs:5-132`)整段搬到 `Gallery.gs`(本來就是鑑賞召喚/進場/請走/AI深化的家)檔案最底部；用 `sed` 精確切出行範圍再 `diff` 逐字核對搬移前後 100% byte-identical(不是手動重打，杜絕轉錄失誤，尤其 `nsfwBaseRules` 這種紅線內容更不能冒險手抄)，`check.sh` 全綠燈確認語法正確。**唯一刻意留在原地的**：`callGeminiAPI`(`Engine_Combat.gs`)——這是 solo(`narrateWithState_`)跟鑑賞(`actionPlay`)兩軌真正共用的「打 API」基礎設施，硬搬進鑑賞專屬檔反而會製造「這是鑑賞專用」的錯誤印象，維持原地最誠實。搬完後 `Router_Narrative.gs` 檔頭註解改標「SOLO 專用敘事引擎」、`Engine_Combat.gs` 檔頭改標「callGeminiAPI：solo／鑑賞共用」、`Gallery.gs` 檔頭補上「鑑賞軌道全集中」說明——三份檔頭都點名彼此，之後想找某段鑑賞邏輯，只要記得「先查 `Gallery.gs`」就好，不必再跨檔追。`AI_PROMPT_MAP.md` §9 同步更新檔案位置引用。**這是 GAS 專案裡少見的大範圍檔案搬遷**：因為 GAS 是攤平的全域函式作用域(clasp 依檔名字母序把所有 .gs 串成一支腳本執行)，函式宣告(非表達式)在整個串接後的作用域裡是提升的(hoisted)，呼叫順序只取決於「執行時」誰呼叫誰，不取決於「檔案字母序」誰先載入——純物理搬遷檔案位置對 runtime 行為零影響，`Router_Action.gs` 的 action 註冊表(`"play": actionPlay`)也完全不用跟著改，GAS 根本不在乎函式定義在哪個檔案。

**🔵 2026-07 玩家定案「模型名稱不寫死在原始碼」**：此 repo 為 public，`callGeminiAPI` 呼叫的實際模型名稱原本以字面字串 `"google/gemini-3.1-flash-lite"` 寫死在 `Engine_Combat.gs`(預設值)＋`Router_Narrative.gs`(兩處 `aiConfig.model`)——任何人瀏覽公開 repo 都能直接看到用哪個模型。已比照既有 `API_KEY` 的做法(`Core_Settings.gs`)新增 `AI_MODEL` 常數，改讀「指令碼屬性」`MODEL`，原始碼不再放任何模型名稱字面；`Core_Settings.gs` fallback 給空字串(不像 `API_KEY` 那樣列別名相容，因為這是全新屬性、無舊名稱包袱)，`callGeminiAPI` 對空值會擋下並回報清楚錯誤(跟 `API_KEY` 未設定時的既有防呆手法一致，不會靜默送出無模型的請求)。**部署前置作業**：Apps Script 編輯器 → 專案設定 → 指令碼屬性，新增 `MODEL` = 實際要用的模型字串(如 `google/gemini-3.1-flash-lite`)。

**🔄 2026-07 玩家明確定案「改回：直接寫進程式碼」，推翻上一條的隱私考量**：測了幾個免費模型(dolphin-mistral-venice/qwen3-235b-a22b)後，玩家覺得每次想切換測試都要開 Apps Script 編輯器改指令碼屬性太麻煩，寧可放棄「不曝光在公開 repo」換取方便——已事先明確提示這個取捨(model 名稱會重新出現在公開原始碼)並經玩家確認選擇後才動手。`Core_Settings.gs` 的 `AI_MODEL` fallback 從空字串 `''` 改回字面 `'google/gemini-3.1-flash-lite'`；指令碼屬性 `MODEL` 仍優先生效(留著給之後想測別的模型時不必再改程式碼重新部署)，**只有該屬性未設定(空字串)時才會落回這個新預設值**。⚠️ 若玩家的 Script Properties 目前還留著先前測試用的值(如 dolphin/qwen)，這次改動不會自動生效，需要手動去 Apps Script 編輯器把 `MODEL` 那格清空或整條刪除，程式碼內的新預設值才會真正吃到。

**🔵 2026-07 新增 `safety_settings` 放寬 Gemini 審查閥門(玩家確認「加入」)**：`callGeminiAPI`(`Engine_Combat.gs`)的 payload 新增 `safety_settings: [{category:HARM_CATEGORY_SEXUALLY_EXPLICIT/HARASSMENT/HATE_SPEECH/DANGEROUS_CONTENT, threshold:"BLOCK_ONLY_HIGH"}, ...]`——這是 Google 官方 Gemini API 的安全閥門參數，OpenRouter 對它 schema 之外、但目標 provider 支援的欄位會直接轉發(已查證有 SillyTavern 同款做法先例)，非 Gemini 系列 model(qwen/dolphin等)收到這欄位會靜默忽略，不影響其他 model 的請求。目的：減少 `callGeminiAPI` 既有「偵測 `PROHIBITED_CONTENT`/`SAFETY` → 降階柔和重試」機制的觸發次數(用 Gemini 系列 model 時，很多觸發本來就是這層預設審查造成)。**改動位置屬於 `callGeminiAPI` 的 payload 組裝，非 `nsfwBaseRules` 常數本體**——`git diff -- gas/Engine_Combat.gs | grep -c nsfwBaseRules` 這次確認為 0。

**🔵 2026-07 MODEL 預設值改成 `deepseek/deepseek-chat-v3.1`(非思考模式，玩家指定)**：查證確認 DeepSeek V3.1 是 thinking/non-thinking 雙模型，OpenRouter 上兩者是「不同 slug」而非同一 slug 靠參數切換——`deepseek/deepseek-chat-v3.1`(無後綴)本身就是非思考版，要思考版才需要额外的 `deepseek/deepseek-chat-v3.1:thinking` slug；換言之**不需要在 payload 加任何 `reasoning` 參數**，純粹改 `Core_Settings.gs` 的 `AI_MODEL` fallback 字面值即可，`callGeminiAPI` 的 payload 組裝完全不用動。另確認 DeepSeek 的 JSON 模式要求 prompt 內文需literal包含「json」字樣——`nsfwBaseRules`【狀態與輸出】規則2本來就寫「只輸出合法JSON」，早已滿足這個要求，不需額外補字。純 `Core_Settings.gs` 改動，`Engine_Combat.gs` 0 改動。
**🐛→✅ 換 DeepSeek 後鑑賞混入簡體字/大陸用語(2026-07 玩家反映「鑑賞要台灣繁體中文啊啊啊」)**：`nsfwBaseRules`(`Gallery.gs`)跟 `miniSystem`(`Router_Narrative.gs`)本來就都在開頭寫著「強制台灣繁體中文」，換模型前(Gemini)遵守得很好，換成 DeepSeek 後開始出現簡體字或大陸慣用詞彙(視頻/質量/軟件等)——DeepSeek 以簡體語料為主訓練，即使被要求輸出繁體，語言傾向仍會不時滲透。**修法刻意避開紅線**：不去動 `nsfwBaseRules` 本體(那是玩家明確授權才能碰的紅線常數)，改在 `callGeminiAPI`(`Engine_Combat.gs`，solo/鑑賞共用的呼叫核心，不歸屬任一軌道)組完 `systemContent` 後，**尾端**額外附加一句「【語言鐵律】全程僅使用台灣繁體中文(正體字)，嚴禁簡體字、嚴禁大陸慣用詞彙...」——放在提示詞最後，模型對頭尾指令通常記得更牢，兩軌都吃得到、不分軌道特判。`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0(完全沒碰紅線本體)。
**🔵 鑑賞速度變慢，查證後定案降 max_tokens(2026-07 玩家反映「檢查整個鑑賞模式為什麼速度有點慢」)**：逐一排查 `actionPlay` 的整表讀取(只讀一次)、`ensureFateSheets_`/`seedFateCodex_` 版本閘(`codex_persona_ver` 有守門，v56升版後只會全刷一次、之後每次按鍵都跳過)、`callGeminiAPI` 的JSON擷取(取第一個`{`到最後一個`}`，就算模型輸出包```json圍欄也解析得到，不會誤觸發重試)——皆確認無程式碼面的迴歸。**真正主因**：換成 `deepseek/deepseek-chat-v3.1` 後，這是完整大型 MoE 模型、非 Gemini Flash Lite 那種特化低延遲小模型，生成回應本身就比較慢；鑑賞(NSFW) `max_tokens` 又比一般模式高(2600 vs 2000)，要生成的字數更多、耗時更長。玩家定案「max_tokens改1500 他現在不用這麼忙」——2600 原是為了容納 `inner_monologue`+`physical_state` 等結構性欄位，但實測真正會被截斷的根因其實是萌點欄 `slice` 過短(見 `actionBackfillKanshouAi`)，不是 narration 本身需要那麼多字。已把 `callGeminiAPI`(`Engine_Combat.gs`) 的 `isNsfwMode` 分支 max_tokens 從 2600 降到 1500，直接省下要生成的 token 數、縮短單次回應時間；SFW(solo) 2000 維持不變。
**🔵 solo 獨立換模型「應該走 google/gemini-3.1-flash-lite」，max_tokens 也調升到1000(2026-07 玩家追加定案)**：查證發現 solo 的 max_tokens 其實一直是 720(`narrateWithState_`預設值＋`actionNarrateOnly`呼叫時明確傳的720，都不是`callGeminiAPI`內部的2000 fallback——那個2000只在呼叫端沒傳`max_tokens`時才生效，solo每次都有明確傳值蓋過去，之前commit訊息講「SFW維持2000」是誤植，實際數字不受影響)，且 `narrateWithState_` 的 `model` 欄位過去也是 `AI_MODEL`(跟鑑賞共用同一顆deepseek)。玩家決定 solo 跟鑑賞徹底脫鉤：solo 只需要精簡的按鍵回饋、犯不著吃鑑賞需要的大型模型NSFW生成能力，換成低延遲小模型顧速度。新增獨立的 `SOLO_MODEL`(`Core_Settings.gs`)常數，比照 `AI_MODEL` 同款「讀指令碼屬性`SOLO_MODEL`、沒設定才落回程式碼內字面預設值`google/gemini-3.1-flash-lite`」；`narrateWithState_`的`aiConfig.model`改讀`SOLO_MODEL`，兩軌從此各自能換模型互不干擾。max_tokens 720→1000(`narrateWithState_`預設值＋`actionNarrateOnly`呼叫處兩處同步)。
**🔄 玩家追加調整「solo原本720就維持吧...鑑賞字數改約500 max_tokens1000試試看」**：solo 的 max_tokens 兩處(`narrateWithState_`預設值＋`actionNarrateOnly`呼叫)撤回上一輪的1000、改回原本的720(SOLO_MODEL/model獨立換成gemini-3.1-flash-lite的部分維持不變，只撤回max_tokens的調整)。鑑賞側繼續往下試：`callGeminiAPI`(`Engine_Combat.gs`)的 `isNsfwMode` max_tokens 從1500再降到1000；同步把 `finalJson`(`Gallery.gs`，`buildDefaultSystemPrompt`裡的輸出範本，非`nsfwBaseRules`/`specificRules`本體，屬玩家明確授權才能碰的鄰近範圍)narration 欄位的目標字數從「約600字」降到「約500字」，讓實際要求生成的篇幅跟新的token上限對得上、不會逼AI在還沒寫完前就被截斷。`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0(這處改動只動 finalJson 的字數描述，未觸及 nsfwBaseRules/specificRules 兩個常數本體任何一行)。
**🐛→✅ `inner_monologue` 欄位描述措辭歧義(2026-07 玩家問「用第三人稱總結本回合？？不是上回合嗎...還是我會錯意？」)**：原句「用第三人稱總結本回合主要互動對象(那名NPC)目前的狀態」——「本回合」文法上是修飾「主要互動對象」(鎖定這回合焦點是哪個NPC)，「目前的狀態」原意是「承接自過往互動、本回合下筆前的起點狀態」，但字面容易被誤讀成「這回合(即將)發生後的狀態」，變成敘事的預寫稿而非承接歷史的定錨點，會打折「先思考、後敘事」(specificRules第1條)的設計初衷——玩家親自讀出這個歧義，證明這不只是我的過度解讀。已改成明講「鎖定本回合主要互動對象(那名NPC)，用第三人稱總結其「本回合開始前」承接自過往互動的狀態」，去掉「本回合」同時修飾兩件事的雙關解讀。範圍：只動 `finalJson`(輸出範本)裡這一個欄位的描述字串，`specificRules`第1條本身用詞(「依對話歷史定位」)已經相對清楚、這次未動，未觸及兩個紅線常數任何一行。
**🗑️ 整條移除 `log_summary`(2026-07 玩家問「erogenous_zones 感覺沒啥用...log_summary 有在用嗎」)**：兩欄一併查證，結論不同——`erogenous_zones` 不是死欄，寫進 `[性愛時敏感部位]` MEMORY 標籤後真的會被 `Script.html:879` 讀回、渲染成紫色標籤顯示在角色詳細狀態面板(已探索敏感部位的持久記憶功能)。`log_summary`(`subject`/`object`)則確實是死路：唯一消費者是拿這兩個名字去比對在場人物、幫其 `[交談輪數]` 累加——但這個累加出來的數字全專案查無任何讀取點(不顯示、不當任何門檻判斷、不餵回AI提示詞)，純粹是每回合多要求AI填一個欄位、GAS 多做一次全表比對，換來一個誰都用不到的數字。玩家定案「整條砍掉」：①`finalJson`(Gallery.gs)移除 `log_summary` 欄位；②`specificRules`(玩家明確授權才能碰的紅線鄰近範圍)移除原第6條(log_summary填法說明)，原第7條(dynamic_skills/erogenous_zones/mutual_nicknames填法)遞補成第6條，`finalJson` 裡3處交叉引用「慾海律令第7條」同步改「第6條」；③`actionPlay`(Gallery.gs)整段「📖交談輪數」計數邏輯(`logSum`/`logNamesStr`/`validInteractNames`/全表掃描累加)移除，`REL_MEM` 重建處的 `talkStr` 保留邏輯一併拿掉。**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` 顯示1，但逐行核對後確認是 `return nsfwBaseRules + ...` 這行**未改動的上下文行**被 diff 帶入顯示(附近程式碼確實有異動)，`+`/`-` 兩側都沒有任何一行真的包含 `nsfwBaseRules` 字樣——`nsfwBaseRules` 常數本體逐字未動，純粹是差異呈現的假陽性，非本體被改。同步更新 `AI_PROMPT_MAP.md`(移除schema欄位列表裡的log_summary、補進死欄位清單)與 `HANDBOOK.md`(MEMORY標記清單拿掉`[交談輪數]`)。
**🗑️ 整條移除「窺視神髓」面板＋erogenous_zones＋親密次數計數(2026-07 玩家「窺視神髓也不要」)**：追問後查出「窺視神髓」是狀態面板裡一顆展開鈕，打開後顯示【雙修秘錄】區塊(雙修技巧/本能性癖/專屬羈絆/雙修累計次數)。查證各欄位真正消費者不一樣：`dynamic_skills`(雙修技巧)、`mutual_nicknames`(專屬稱呼)其實**除了這個面板還有另一條 AI 提示詞消費路徑**(`nsfwMemories`/`[身體記憶][技巧]`餵回AI延續劇情、`relMemMemoryStr_`把專屬稱呼餵進同伴/路人描述)——面板拿掉後這兩個欄位仍有實質用途，保留。但 `erogenous_zones`(性愛時敏感部位)跟親密次數計數的**唯一**消費者就是這個面板(`ui-kinks`/`ui-intimacy-count`)，面板一拿掉就變成跟 `log_summary` 一樣的純寫入死路，玩家定案「面板+erogenous_zones+親密次數全部一起拆」。
- **`Index.html`**：`secret-toggle-btn` 按鈕與整個 `secret-panel` 區塊(含 `ui-skills`/`ui-kinks`/`ui-rel-section`/`ui-titles`/`ui-intimacy-count` 五個顯示元素)整段刪除——移除前先手算過 div 開合數(3開3閉)確認是完整平衡的子樹再刪，避免重蹈上一次「刪開頭忘刪對應收尾」導致整頁UI崩壞的覆轍；刪除後 `check_html.py` 確認零標籤失配。
- **`Script.html`**：`renderTags`／狀態渲染函式裡「3. 雙修解析邏輯」整段(讀 `[雙修技巧]`/`[性愛時敏感部位]`/`[專屬稱呼]`/`[親密次數]`塞進上述五個DOM元素)、面板重置邏輯(`secretPanel`/`secretBtn`)、`toggleSecretPanel()` 函式，全數移除——查證全專案這幾個 DOM id/函式名 0 殘留引用。
- **`Gallery.gs`**：`finalJson.intimacy_feedback.player/npcs` 移除 `erogenous_zones` 欄位；`specificRules` 第6條(原本列了 dynamic_skills/erogenous_zones/mutual_nicknames 三者填法)拿掉 erogenous_zones 部分；`actionPlay` 寫回 `COL.PC.MEMORY` 時不再帶 `[性愛時敏感部位]`(僅留 `[雙修技巧]`)；`COL.PC.REL_MEM` 重建時移除 `[親密次數]` 計數邏輯(僅留 `[專屬稱呼]`+`[已兌現]`)。
- **驗證**：`bash check.sh` 全過(含 `check_html.py` 對 Index.html 的標籤配對驗證)；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` 顯示1，逐行核對確認又是 `return nsfwBaseRules + ...` 這行未改動的上下文行被帶入 diff、`+`/`-` 兩側皆無該字樣，常數本體逐字未動。同步更新 `AI_PROMPT_MAP.md`(schema欄位列表移除erogenous_zones、補死欄位清單)與 `HANDBOOK.md`(MEMORY標記清單拿掉`[性愛時敏感部位]`/`[親密次數]`)。
**🐛→✅ `rel_changes` 後3個欄位缺範例，`major_event` 特殊語法從未被解釋過(2026-07 玩家問「rel_changes後面幾個沒範例ai能知道怎麼用？」)**：查證屬實，且比想像中嚴重——`fav_change` 範本只給裸數字 `3`，AI 抓不到「日常互動該加多少、重大突破又該加多少」的合理級距；`tag` 的【關係定位】四字詞分類(萍水相逢/點頭之交/漸生情愫/紅顏知己等)寫在 `nsfwBaseRules`【世界與NPC自主】段落，離這張輸出範本很遠，AI 下筆填這欄時未必還記得。**最嚴重的是 `major_event`**：查後端 `relChangesToProcess.forEach`(Gallery.gs)發現它其實認得兩種特殊語法——`[達成]xxx`(標記某個未完成約定本回合兌現，連動寫進 REL_MEM 的 `[已兌現]` 記憶點)、`[清空]`(清空全部未完成約定)——但整份提示詞**從頭到尾沒有任何一處講過這兩種語法存在**，AI 完全沒有管道知道能這樣填，等於「已兌現的約定當記憶點」這個先前特地做的功能長期形同虛設(AI 大概率只會填「無」或隨意寫一句話，永遠命中不了 `[達成]`/`[清空]` 分支)。修法：在 `finalJson.rel_changes` 的範本物件裡加一個 `_note` 欄(仿 `intimacy_feedback` 已有的同款寫法——這種輔助說明鍵只給AI看格式範例，後端解析只按欄位名讀取、不會誤讀它)，把三個欄位的具體用法與範例都寫進去。`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` 顯示1，但這次是我自己新加的註解**提到** `nsfwBaseRules` 這個名字(解釋 tag 規則寫在那邊)，逐行核對確認 `const nsfwBaseRules = ...` 那行本身完全沒出現在 diff 裡，常數內容一字未動。同步更新 `AI_PROMPT_MAP.md`。
**🔄 玩家追加調整「fav_change最高5慢慢來」**：上面剛補的範例原本分三級(日常+1~3/心動+5~10/突破+15~30)，玩家覺得級距太大、關係推進太快，改成只分兩級且單回合硬上限+5：日常閒聊+1~2、明顯心動或重大進展+3~5，明文寫「單回合上限+5，不可一次跳大段」。**這是prompt層級的軟性引導**(寫在 `_note` 給AI參考)，後端 `sanitizeAiData_` 仍是原本的 -100~100 寬鬆 clamp，沒有新增硬性上限——如果之後發現AI仍偶爾給出超過5的數字，可考慮再收緊成後端強制clamp。
**🗑️ 整條拆掉 `major_event`/`MAJOR_EVENT`(2026-07 玩家追問「約定清空還有地方可以按嗎？！？達成又要去哪裡看？？」)**：上面那條剛補完 `_note` 讓 AI 知道 `[達成]xxx`/`[清空]` 語法存在，玩家追問才揭出更根本的問題——查證發現這不只是「文件沒解釋」，是**整條機制頭尾斷開的死路**：①`COL.PC.MAJOR_EVENT` 寫入後從未被讀回餵給任何 AI 提示詞(`partyDetailsArr`/`relMemMemoryStr_`/`nsfwMemories` 全數查無引用)，即使 AI 學會 `[達成]` 語法，它也看不到自己上次許過什麼約定可以標記兌現；②玩家端唯一入口是「個人史紀」面板的「🗑️ 斬斷」鈕(`actionClearNpcMajorEvent`)，但這個 action 早在更早一輪清「回顧類」功能時就已經跟著面板一起被刪，`Router_Narrative.gs` 檔頭原本還留著一句「MAJOR_EVENT 仍在用(見servantCard_/actionPlay)」的過期註解(`servantCard_` 實際查無任何 MAJOR_EVENT 引用)。玩家定案「整條拆掉：既然斷頭且玩家看不到，不值得修」(而非選擇「補上讀回AI」的深修方案)。**動手範圍**：
- `Gallery.gs`：`finalJson.rel_changes` 範本物件移除 `major_event` 欄位，`_note` 只留 fav_change/tag 說明；`actionPlay` 的 `relChangesToProcess.forEach` 整段 `[清空]`/`[達成]xxx`/純文字累加(含上限3則)＋連動寫 REL_MEM `[已兌現]` 的處理邏輯(~26行)全數移除，改留一句解釋性註解；`relMemMemoryStr_` 拿掉 `[已兌現]` 讀取(唯一寫入源已消失)，只留 `[專屬稱呼]`；`intimacy_feedback.npcs.forEach` 內 REL_MEM 重建邏輯同步拿掉 `doneStr`；`heroToKanshouRow_` 移除多餘的 `sRow[COL.PC.MAJOR_EVENT]=""` 顯式賦值(陣列預設就是空字串，這行本來就是冗餘)。
- `Core_Settings.gs`：`COL.PC` schema 註解區分開一般關係欄(BOND/REL_TAG/IS_PARTY/REL_MEM)跟 `MAJOR_EVENT(27)`，為後者補一段專屬註解說明「已整條拆掉、欄位保留但恆為空」。**`COL.PC.MAJOR_EVENT: 27` 這個位置索引本身不刪**——刪掉會讓 `REL_MEM(28)`/`DAY(29)`/`HOUR(30)`/`AP(31)`/`HOME_LOC(32)` 全部欄位錯位，砸爛既有試算表每一列的欄位對齊，遵循專案「COL 是位置索引、寧可棄用不刪欄」的既定原則，此欄從此是刻意保留的孤兒欄。
- `Router_Narrative.gs`：修正檔頭那句過期的「MAJOR_EVENT 仍在用」註解，改記錄這次查證的完整脈絡(含 `actionClearNpcMajorEvent` 已刪、機制本身也已隨這輪整條拆除)。
- `AI_PROMPT_MAP.md`：§3／§8 兩處「純機制」action 對照表拿掉 `clear_npc_major_event`/`actionClearNpcMajorEvent` 殘留列(該 action 本體早已刪除，這次順手清掉文件殘留引用)；§9 附錄的純機制 action 總表同步拿掉；`rel_changes` schema 說明把 `major_event` 從現行欄位移到「已從schema移除的死欄位」清單。
**驗證**：`bash check.sh` 全過(含 `check_html.py`)；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` 顯示1，逐行核對(`grep -E "^[+-].*nsfwBaseRules"` + `grep -B2 -A2 "const nsfwBaseRules"`)確認又是 `return nsfwBaseRules + ...` 那行未改動的上下文行被帶入 diff、`+`/`-` 兩側皆無該字樣，常數本體逐字未動。
**🔄 `fav_change` 改成 `tone` 方向旗標(2026-07 玩家追問「應該少很多json了吧？還是好感度直接用GAS加？每次對話+1~3滿100就不輸出？直接再少一個ai輸出？」)**：玩家的提案是索性讓 GAS 全自動加好感、AI 完全不輸出這欄，但這樣會有個副作用——即使玩家越界冒犯或劇情鬧僵，好感照樣往上加，數字會跟劇情內容脫鉤(變成純打卡機)。提供三個選項後玩家選了折衷方案「AI只給方向旗標，GAS對應數字」：既比原本要AI自己抓`fav_change`合理級距(日常+1~2/心動+3~5)輕量(AI不用猜數字，只填一個三選一字串)，又保留了「負面互動可以讓好感下降」的劇情連動，不會變成好感只漲不跌。**動手**：
- `Gallery.gs`：`finalJson.rel_changes` 範本 `fav_change`欄位換成`tone`(值域「升/平/降」)，`_note`同步改寫說明；`actionPlay`的`relChangesToProcess.forEach`把`let change = parseInt(rc.fav_change)||0`改成讀`rc.tone`字串比對(`.includes("降")`→-2、`.includes("升")`→+2、其餘(含"平"或缺漏)→0)，取代原本直接信任AI回傳的裸數字。
- `Router_Action.gs`：`sanitizeAiData_`原本專門夾`rel_changes[].fav_change`範圍(-100~100)的`clampInt`防呆連同其唯一呼叫點一併移除——AI不再輸出數值型好感欄位，這道防線的防禦對象已不存在(tone是字串，異常值頂多對不上「升/降」關鍵字、落回0，不會有爆表好感的幻覺風險)；物件結構檢查(非物件即擋)保留不動。
- `AI_PROMPT_MAP.md`：`rel_changes`欄位說明同步改寫，`fav_change`移入死欄位清單。
**幅度取值**：升/降固定 ±2(而非原本依情境浮動的+1~5級距)——這是刻意的取捨：拿掉AI對magnitude的裁量後，同一個方向旗標理論上無法再區分「小聊天」跟「重大心動」的差別大小，玩家在選項說明裡已被告知這個 trade-off 並選擇接受，不是遺漏。若之後覺得步調太慢/太快，只需調整 Gallery.gs 這處的 ±2 常數，不涉及 AI 提示詞。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` 確認為既有的 `return nsfwBaseRules + ...` 上下文行假陽性，常數本體未動。
**🌹 新增 `dailyMoe`(日常萌點)欄位(2026-07 玩家點破「餐桌有點平行世界，所以不能照搬！！餐桌沒有聖杯戰爭這個事情！！(但他們還是英靈！！)」)**：查證確認 `heroToKanshouRow_`(Gallery.gs)把戰時 `persona.moe`(反差萌，常靠戰爭/詛咒/創傷撐出沉重感，如美杜莎「怪力女神卻極度自卑」)原樣照搬進鑑賞——之前抓這句核對過「忠於原作」，但玩家點出更根本的問題：鑑賞世界(《衛宮家今天的餐桌風景》基調)是**平行世界，根本沒發生過聖杯戰爭**，角色依然是英靈，但不該背負「靠戰爭陰影撐出來的沉重反差」，日常萌點該是「單看了會心一笑的溫馨小可愛」，不是solo那種反差萌。**動手**：
- `Core_Settings.gs`：`COL.HERO` 新增 `DAILY_MOE: 15`(附加在尾端，比照 DAILY_LOOK/DAILY_WORDS 的既定作法，不動既有欄位位置)。
- `Seed_Codex.gs`：全部23筆種子persona(23位從者，內含3位女性正典御主)手寫`dailyMoe`——保留角色性格核心但拿掉戰爭/創傷份量的輕量溫馨版(例：美杜莎「怪力女神卻極度自卑」→「寡言沉靜，家事身手意外地好」；斯卡哈「渴望一死卻不得的寂寞」→「高冷女王范兒，私下廚藝出乎意料」；蘭斯洛特「渴望被懲罰的扭曲忠誠」→「沉默寡言，卻總攬下最累的活」)。`servantToHeroRow_`回傳滿16欄(含新欄)。`CODEX_PERSONA_VER`升v57逼既有英靈殿整列覆寫吃到新欄。
  - 順手修正稍早這輪自己加進斯卡哈-Lancer `dailyWords`的「看盡生死後無人能懂的倦怠與孤寂」——那是我當時誤把「dailyWords該呼應戰時moe」當成正確方向，但 `dailyWords` 跟 `dailyLook` 一樣是純鑑賞欄位(solo讀的是原始`persona.words`，不讀daily版)，一樣該遵守「輕量溫馨」原則，不該扛演戰爭/永生倦怠的存在性沉重——已改成「私下手藝意外地好」，跟新增的dailyMoe同調。
- `Gallery.gs`：`getDailyHeroFields_`新增讀取`existingMoe`(HERO.DAILY_MOE)＋`rawMoe`(p.moe)fallback，回傳多一個`moe`鍵；`heroToKanshouRow_`改讀`daily.moe`而非原始`p.moe`；新增`translateMoeToDaily_(name,cls,rawMoe)`(比照`translateAppearanceToDaily_`/`translatePersonalityToDaily_`同款結構)，明確要求「拿掉需要戰爭/創傷背景才成立的沉重份量、改寫成單看了會心一笑的日常小萌點」，只給AI原創(ai_gen)英靈用——canon種子永遠用手寫的`dailyMoe`，不會走到這個函式。
- `Router_Creation.gs`：`recordOriginalHero_`(工房建立/AI原創從者召喚的共用寫入點)新增`dailyMoe`計算並附加進`appendRow`；`actionSaveHero`修改模式同步補`DAILY_MOE`重轉。**順手抓到一個既有小缺口**：`actionSummonServant`「名冊查無→AI即時生成」分支呼叫`recordOriginalHero_`時，`pExtra`原本沒帶`moe`——這名從者的PC列(`row[COL.PC.INTENT]`)確實有拿到AI生成的萌點，但寫回英靈殿的永久記錄(`persona.moe`)一直是空字串，若這名從者日後被邀進鑑賞，`translateMoeToDaily_`拿到的輸入是空的，轉不出東西。已補上`moe: String(aiBrief.npc_intent||"").slice(0,30)`。
- `Gallery.gs`：`actionBackfillKanshouAi`(玩家自己的鑑賞御主捏角)的`KANSHOU_MASTER_GEN_SYS`提示詞——這個直接在鑑賞語境生成萌點、不經過translate步驟，補上同一條原則的明文提醒：「必須是單看了會覺得溫馨、正面、會心一笑的日常小反差...禁靠創傷/自卑/孤獨/悲劇宿命撐出反差感」。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0(這輪改動完全沒碰到附近會被帶進diff context的行)。
**🌹 架好 `DAILY_OUTFIT`(日常衣裝)線路——先蓋管線、內容手寫留待下一輪(2026-07 玩家「日常外貌(N)改成：外貌、氣質舉止、自稱與口氣、卸下心防的私密一面...COL.HERO新增日常衣裝欄位...SOLO獨自一套 鑑賞獨自一套 不要混淆」)**：玩家點出 `dailyLook` 現況是「N段外貌(含服裝)、最後一段氣質詞」混一起的鬆散字串，且 `looksToTraitParts_` 硬拆時「自稱」跟「卸下心防的私密一面」兩格其實**全種子共用同一句寫死的通用填充句**(`自稱「${firstP}」`、`卸下心防時的柔軟一面`)，從來沒有真正屬於角色個人的內容。要求：①服裝獨立成 `dailyOutfit` 新欄，不再混在外貌描述裡；②`dailyLook` 改成明確四段(比照 `PERSONA.traits`/`PREF` 的四格格式)，四段都要是角色個人的真實內容，不再靠通用句填充；③這條全部只動鑑賞側，solo 的 `persona.look`/`TRAIT`(`looksToTraitParts_`/`actionSummonServant`/`Seed_Rivals.gs`)完全不碰，兩邊資料各自獨立、互不覆寫。這輪先把**架構/路徑**打通(手寫23位英靈的實際四段內容留到下一輪，比照 `dailyMoe` 先前的兩階段節奏)：
- `Core_Settings.gs`：`COL.HERO` 新增 `DAILY_OUTFIT: 16`(附加尾端)。
- `Seed_Codex.gs`：`servantToHeroRow_` 回傳滿17欄(含 `p.dailyOutfit||''`)。**這輪未手寫23位的實際內容、未升版號**——`CODEX_PERSONA_VER` 留在 v57，等下一輪連同23位手寫四段式 `dailyLook`+`dailyOutfit` 內容一起升 v58，一次觸發整列覆寫，避免這輪先跑一次空的覆寫又要再跑一次。
- `Gallery.gs`：
  - `getDailyHeroFields_` 新增讀取 `existingOutfit`(HERO.DAILY_OUTFIT)，無 fallback 用途(戰時persona沒有對應「純服裝」欄可退，交給 `heroToKanshouRow_` 自己的「日常便服」保底)。
  - **`translateAppearanceToDaily_` 整個升級改名為 `translateLookToDaily_`**(取代原函式，兩個呼叫點同步改名)：原本只輸出一段鬆散字串，現在一次 AI 呼叫同時吃 `rawLook`+`firstP`+`speech`、回傳 JSON `{look, outfit}`——`look` 直接是明確四段(外貌本相不含服裝／氣質舉止／固定格式的「自稱「X」+依原本語氣寫的日常口氣」／該角色專屬、具體不空泛的私密一面)，`outfit` 是獨立的日常穿搭一句話。
  - `heroToKanshouRow_`：TRAIT 組裝改**相容雙格式**——`daily.look` 用「、」切出來若已有≥4段(新格式，手寫或AI新轉的都會是)，直接讀不再靠 `looksToTraitParts_`；段數不足4(舊格式，還沒被下一輪內容重寫覆蓋到的種子)才退回舊拆法——零斷層、新舊資料並存期完全不會撞壞卡片。服裝墊底邏輯從寫死的「日常便服」改讀 `daily.outfit || "日常便服"`，玩家隨時仍可用既有換裝功能(`getOutfit_`/`setOutfit_`)覆寫，兩者不衝突。
- `Router_Creation.gs`：`recordOriginalHero_`(共用寫入點)呼叫 `translateLookToDaily_` 取代舊函式，`appendRow` 補上第17個值(`dailyLookRes.outfit`)；`actionSaveHero` 修改模式同步改用新函式並補寫 `DAILY_OUTFIT`，順手把內聯的 `keep(pb.fp,pj.firstP)`/`keep(pb.speech,pj.speech)` 抽成 `newFp`/`newSpeech` 兩個具名變數(新函式需要，也讓 PERSONA JSON 組裝處少寫兩次)。
- **紅線確認**：`looksToTraitParts_`(Core_Settings.gs)本體完全未動，solo 唯二呼叫點(`Router_Creation.gs` `actionSummonServant` 種子分支／`Seed_Rivals.gs`)也未動——SOLO 的戰時 `persona.look`→TRAIT 轉換管線與這輪改動零交集，符合「SOLO獨自一套、鑑賞獨自一套」。
**下一輪待辦**：比照 `阿爾托莉雅`/`美杜莎` 兩個草稿範例的格式，手寫剩下的23位英靈(含3位女性正典御主)的四段式 `dailyLook`＋獨立 `dailyOutfit`，並把 `CODEX_PERSONA_VER` 升到 v58。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0。
**🌹 內容手寫進度①：10/23 位完成(2026-07 玩家給10位的草稿參考，附帶「和SOLO不會誤差太大——一邊有陰暗的聖杯戰爭、一邊沒有，個性內在還是差不多、只是很多悲劇沒有發生」的定調)**：阿爾托莉雅、EMIYA、庫丘林、美杜莎、美狄亞、佐佐木小次郎、赫拉克勒斯、吉爾伽美什、蘭斯洛特、間桐櫻(黑化)——全部補上 `dailyOutfit`(從玩家草稿的外貌描述裡拆出服裝)，`dailyLook` 改寫成明確四段(外貌本相／氣質舉止／自稱與口氣／卸下心防的私密一面，每段皆用既有 `persona.firstP`/`speech` 接續、非通用填充)，`dailyWords` 依玩家給的表象/內裡描述**新增**真正的喜歡/討厭兩項(玩家原稿只給了表象+內裡+一句活動描述，沒有明確喜歡/討厭)。玩家特別提醒「太多商店類的可以不要」——原稿多位角色都寫到「商店街」/「打工(花店魚店皆可)」，改寫時淡化成更生活化的场景(如庫丘林的「跟朋友四處湊熱鬧」、吉爾伽美什的「走在街上」)，不是每位都靠開店/逛街撐日常。赫拉克勒斯值得一提：玩家原稿仍保留他「不會說話」，但改寫成「話極少、簡樸溫和的巨漢」而非戰時的「狂化・僅咆哮」——同一個沉默特質，成因從「戰爭瘋狂」換成「性格單純」，正是這輪要的效果。**`dailyMoe` 沿用先前已手寫的版本，未變動**；`CODEX_PERSONA_VER` 仍未升版(等剩下13位一起收尾)。已用 node 腳本核對這10位的 `dailyLook`/`dailyWords` 皆確實切出4段(過程抓到自己漏打頓號、把[自稱與口氣]跟[私密一面]黏在同一段的疏漏，已修正)。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs` 這輪無改動(只動 Seed_Codex.gs)。
**🌹 內容手寫進度②：剩下13位補完，四段式改造全數收尾(2026-07 玩家「沒草稿，你照這方向去填寫吧」)**：迪盧木多、伊斯坎達爾、吉爾德萊、百貌哈桑、咒腕之哈桑、恩奇都、斯卡哈-Lancer、斯卡哈-Assassin、美遊、小黑、伊莉雅-Caster(install)、遠坂凜-Master、伊莉雅絲菲爾-Master——依前10位確立的方向(拆出`dailyOutfit`、`dailyLook`四段式、`dailyWords`補喜歡討厭)全部補完，全種子庫23位正式收工。**順手抓到2處自己這輪新犯的分隔符錯**：斯卡哈-Assassin/伊莉雅-Caster(install)的「自稱與口氣」segment內部誤用「、」(該segment的field分隔符)取代「・」(segment內部連接號)，多切出第5段——用node腳本逐一核對全部23位`dailyLook`/`dailyWords`確實都是4段才發現，已修正。**也順手清了2處v57遺漏的悲劇殘留字眼**：伊莉雅絲菲爾-Master的`dailyWords`原本還留著「藏著哀傷的聖杯依代身世」(人造人被當工具養大的悲劇身世，v57做`dailyMoe`時漏檢查`dailyWords`)，改寫成「渴望被更多人放在心上疼惜」，跟「喜歡：被珍惜疼愛的感覺」呼應但拿掉悲劇背景。**`CODEX_PERSONA_VER`升到v58**，觸發`upgradeCodexPersonas_`整列覆寫——已召喚過的英靈下次登入/重召即可吃到全新四段式資料，`servantToHeroRow_`穩定回傳滿17欄。
**驗證**：`bash check.sh` 全過；node腳本核對全23位`dailyLook`/`dailyWords`皆為4段、`dailyOutfit`皆非空；`git diff -- gas/Gallery.gs` 這兩輪皆無改動(只動 Seed_Codex.gs)。
**🐛→✅ 「私密一面」跟「萌點」重複感太高(2026-07 玩家看完全23位dump後點名「私下家事身手意外地好」跟萌點「寡言沉靜，家事身手意外地好」根本一樣)**：查證屬實且範圍不小——寫`dailyMoe`(v57)跟改寫`dailyLook`四段式(v58)是兩輪分開做的，兩邊各自順著同一個角色的核心反差去發想，難怪常常撞成同一件事的兩種說法。寫了個 node 腳本掃全23位(private-side 跟 moe 抓共同子字串)，抓到11位機器可判的重複，另外4位(阿爾托莉雅/EMIYA/伊斯坎達爾/美遊)是換句話說的同義重複、機器抓不到但人眼看得出來，合計**15位**private-side全部重寫，原則：**萌點負責「一句話的招牌反差」，私密一面負責「完全不同的另一個生活切面」**(小動作/小習慣/情緒觸發點)，兩者不再互相複述。例：
- 美杜莎：萌點「家事身手意外地好」→ 私密一面改「看到別人小小的善意會偷偷紅了眼眶，卻很快若無其事地眨眼帶過」
- 遠坂凜：萌點「私下有點迷糊」→ 私密一面改「對在意的人特別嘴硬，明明擔心得要命卻只會冷冷丟一句「笨蛋」」
- 迪盧木多：萌點「天生惹人喜愛自己卻渾然不覺」→ 私密一面改「偶爾會對著鏡子皺眉盯著臉上的痣，猜想它究竟帶來多少困擾」
其餘12位(斯卡哈兩職階/美狄亞/佐佐木小次郎/伊斯坎達爾/咒腕之哈桑/蘭斯洛特/恩奇都/美遊/伊莉雅-Caster/伊莉雅絲菲爾-Master/EMIYA)同一原則逐一重寫，用同一支 node 腳本收斂驗證(子字串重疊+人工複查)確認不再撞句。**`dailyLook`四段結構本身不變**(只換第4段內容)，段數/其餘3段皆未動；`CODEX_PERSONA_VER`升到v59——照專案既定慣例，版本沒升則已召喚過的英靈讀不到這次修正，即使v58可能剛部署不久也照樣升版，不賭「應該還沒人召喚到」。
**驗證**：`bash check.sh` 全過；node腳本二次掃描確認0筆重複、4段結構全數保持；`git diff -- gas/Gallery.gs` 無改動。
**🐛→✅ 玩家追問「AI創造能抓到重點吧？」——查證：不能，AI原創路徑有同一個結構性漏洞**：上面那次重複問題的根因是「dailyMoe跟dailyLook四段式分兩輪各自發想、互不知道對方寫了什麼」——`recordOriginalHero_`/`actionSaveHero`(工房建立/修改)呼叫`translateLookToDaily_`跟`translateMoeToDaily_`同樣是**兩次獨立的AI呼叫**，彼此看不到對方輸出，AI原創英靈完全可能重蹈覆轍(私密一面又寫成萌點的換句話說)，只是還沒被人工抓到而已。**修法**：`translateLookToDaily_`新增第6參數`dailyMoeHint`——呼叫端(recordOriginalHero_/actionSaveHero)把呼叫順序**對調**，先算好`dailyMoe`，再把這個值當hint傳給`translateLookToDaily_`，提示詞明講「這個角色的招牌萌點已經是『XXX』，私密一面這格【禁止】重複或換句話說同一件事，必須是完全不同的另一個生活切面」——讓AI下筆當下就看得到另一半，不必等人工事後抓重複。兩個呼叫點(建立/修改模式)皆已對調順序並接上hint。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0。
**🏷️ 三張演出卡逐格加標籤，AI讀取時真的知道每句話代表什麼(2026-07 玩家問「AI讀取資料時候能知道這10項資料各字代表什麼嗎？」→「要拆分!!!!!」)**：查證屬實——`servantCard_`/`masterCard_`/`enemyMasterCard_`(Router_Persona.gs)過去一律把PREF/TRAIT內部的4段慣例(`[日常表象][真實內裡][喜歡的事物][討厭的事物]`／`[外貌本相][氣質舉止][自稱與口氣][卸下心防的私密一面]`)整段黏成一串塞給AI、只掛一個外層標籤(`性格：`/`特徵：`)，AI看不出哪句對應哪個類別，「四段式」其實只是我們自己管理資料的內部慣例，從未真正傳達給AI。**動手**：新增共用helper `quadLabeled_(raw, labels, skipNone)`＋兩組標籤常數`PREF_LABELS_`/`TRAIT_LABELS_`，逐格拆開加標籤(如`｜日常表象：X｜真實內裡：Y｜喜歡的事物：Z｜討厭的事物：W`)。三張卡各自套用：`servantCard_`(skipNone=false，段數不足仍顯示「無」不靜默漏項)、`masterCard_`/`enemyMasterCard_`(skipNone=true，沿用原本「無」則整格跳過不顯示的防呆行為)。這也連帶讓上一輪剛做完的「私密一面 vs 萌點 不可重複」修正真正發揮作用——AI現在能明確分辨哪句是「私密一面」、哪句是獨立的「萌點：」，不會再把兩者混為一談。
**驗證**：`bash check.sh` 全過；node腳本模擬阿爾托莉雅真實資料跑過`quadLabeled_`，輸出逐格標籤正確無誤；`git diff -- gas/Gallery.gs` 這輪無改動(只動 Router_Persona.gs)。
**🐛→✅ 鑑賞召喚的關係標籤誤用戰爭用語「從者」(2026-07 玩家問「我召喚的角色跟我說是什麼關係？」)**：查證發現`heroToKanshouRow_`(Gallery.gs)把`COL.PC.REL_TAG`(關係標籤)寫死成「從者」——這個值會直接被`actionPlay`的`partyDetailsArr`組裝進AI提示詞(`｜關係:${REL_TAG}(好感:...)`)，且只有AI在`rel_changes`明確給新`tag`才會覆蓋，AI若判斷「無變化」填「無」就會一直卡在這個標籤上。**問題**：「從者」是聖杯戰爭裡令咒締結契約的戰爭專屬用語，鑑賞世界「沒有聖杯戰爭這回事」，AI每回合看到「關係:從者」跟這整輪定調的「平行世界無戰爭」原則直接衝突——跟稍早`persona.moe`直接照搬戰時反差萌的問題是同一類根因(鑑賞沿用solo端的寫法未曾檢查是否適用)。**修法**：`heroToKanshouRow_`的`REL_TAG`初值從「從者」改成「萍水相逢」——沿用既有好感分級詞彙(`萍水相逢`/`點頭之交`/`漸生情愫`/`紅顏知己`)，跟同一行`BOND=45`「尚淺·剛認識」的既有註解意圖一致，也跟全專案其他地方讀取`REL_TAG`時的預設回退值(`|| "萍水相逢"`)對齊。**solo端不動**：`Router_Creation.gs`的`actionSummonServant`(戰爭召喚)也把`REL_TAG`設成「從者」，但那裡是真的有令咒契約，這個標籤本來就對，只有鑑賞這條路徑被誤沿用才需要修正。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0。
**🔥 鑑賞模型改依「點火」(主動掌握)開關切換(2026-07 玩家「沒有點火接gemini3.1(SOLO_MODEL)，點火才接目前鑑賞的(AI_MODEL)」)**：`actionPlay`的`aiConfig.model`原本無條件用`AI_MODEL`(鑑賞的重量級模型，如deepseek)——但大多數回合是輕鬆日常對話，犯不著每次都吃重量級模型的延遲。改成`driveOn ? AI_MODEL : SOLO_MODEL`：平時矜持模式(未點火)跟solo共用低延遲小模型，只有🔥主動掌握模式(點火)才切回鑑賞原本的大型模型。
**🐛→✅ 「好感不會增加」——`tone`欄位名跟「口吻」語意相撞(2026-07 玩家回報)**：查證找到最可能的根因——`rel_changes`的方向旗標欄位原名`tone`，這個英文字最常見的意思是「(說話的)語氣/聲調」，而同一套提示詞系統裡确實存在一個語意相近的`speech`(口吻)概念——AI(尤其是遵循指令較不穩定的模型如DeepSeek)容易把`tone`這格誤解成「描述語氣的形容詞」而非「好感升降方向」，寫出不含「升」/「降」字樣的內容，換算下來`change`恆為0，好感因此卡住不動、完全符合玩家回報的症狀。**修法**：把欄位從根本改名`fav_dir`(好感方向)，徹底消除語意混淆的可能，`_note`額外補一句「與口吻/語氣描述無關，純粹是好感升降方向」加強防呆；`relChangesToProcess.forEach`同步改讀`rc.fav_dir`；`AI_PROMPT_MAP.md`同步更新。**未完全驗證**：這是基於程式碼審查的最高機率假設(無法在此環境直接跑一次真實AI呼叫驗證)，如果改名後玩家實測仍不會增加，需要進一步排查`rel_changes`陣列本身是否真的有被AI填、或`target`姓名比對是否命中。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0。
**🔄 玩家定案「好感改回數字」，撤回方向旗標方案**：改名`fav_dir`修好語意衝突後，玩家仍決定整條撤回、換回讓AI自己填`fav_change`整數——`finalJson.rel_changes`範本改回`"fav_change": 3`，`_note`恢復原本的級距指引(日常閒聊+1~2、明顯心動或重大進展+3~5、單回合上限+5)並補一句「與口吻/語氣描述無關」；`relChangesToProcess.forEach`改回`let change = parseInt(rc.fav_change) || 0`；`sanitizeAiData_`(Router_Action.gs)的`clampInt`數值防呆(-100~100)同步復原——AI又開始自己填裸數字，這道防線重新有存在意義。`AI_PROMPT_MAP.md`同步更新，記錄這欄位這輪「數字→方向旗標→改名→改回數字」的完整來回。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0。
**🔥 沒點火時被攔截/失敗自動換DeepSeek重試(2026-07 玩家「沒點火時如果被攔截或對話失敗時候改用DeepSeek」)**：延續上面「沒點火用SOLO_MODEL(輕量、較容易撞審查/不穩定)」的設計，玩家追加要求：這顆輕量模型如果被審查攔截(NSFW filter)或連線失敗，不要直接放棄顯示【結界觸發】/【連線中斷】，改逃生到鑑賞原本的AI_MODEL(DeepSeek)再試一輪。**動手**：`callGeminiAPI`(Engine_Combat.gs)把單一模型的完整重試迴圈(含降階柔和重試)包成內部函式`attemptWithModel_(model)`，外層先用`config.model`跑一輪，若全部重試都失敗且呼叫端有給`config.fallbackModel`(且與原模型不同)，才換那顆模型再跑一輪(重置降階提示詞、不帶著上一顆模型疊加的softenSuffix)；兩輪都失敗才顯示原本的失敗訊息。`actionPlay`(Gallery.gs)只在`!driveOn`(沒點火，用SOLO_MODEL)時設定`aiConfig.fallbackModel = AI_MODEL`——點火時已經在用AI_MODEL，沒有更重的模型可逃生，不設定。**solo不受影響**：`fallbackModel`只有這一個呼叫點會用到，`narrateWithState_`(solo)沒帶這個參數，行為完全不變。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0。
**🐛→✅ 整條移除「召喚後AI深化」第二段呼叫，根治「邀請角色速度很慢」(2026-07 玩家「鑑賞邀請角色的速度...為啥這麼慢......不是有暫存資料嗎...然後日常資料也有先做好了 還是有點慢」)**：查證發現 `kanshouSummonHero`(Script_Kanshou.html)每次首次召喚都是**兩段完整同步呼叫**：①`kanshou_summon_hero`(寫入 `heroToKanshouRow_`) ②緊接著 `await` `backfill_kanshou_servant_ai`(`actionBackfillKanshouServantAi`，Gallery.gs)——後者是一次**完整的 `callGeminiAPI` 呼叫**，把種子既有的 PREF/TRAIT/INTENT 當上下文重新生成4段個性＋身世摘要，蓋回同一列。這顆深化在 dailyMoe/dailyOutfit/dailyLook四段式(v57~v59)系統出現**之前**就存在(見本文件更早的「五修/八修/十修」等條目)，當初存在的理由是「種子庫`persona.words`全庫普遍只有2-3項精簡標籤、且無`back`身世欄」——但這個問題**已經被這輪daily欄位系統整個解決**：全23位種子英靈現在都有手寫完整的四段式`dailyLook`/`dailyWords`(含喜歡/討厭)＋`dailyMoe`＋`dailyOutfit`，`heroToKanshouRow_`寫入的PREF/TRAIT已是高品質手稿內容，這顆深化卻還在拿這份已經很完整的資料去問AI「潤色」，等於**每次邀請都白等一輪完整AI生成的延遲**，換回的內容品質不見得比現有daily資料更好(甚至有風險覆蓋掉剛修好的「私密一面 vs 萌點」防重複成果)。**動手**：`actionBackfillKanshouServantAi`(Gallery.gs)、其在 `ActionRouter`/`LOCK_EXEMPT_ACTIONS_` 的註冊(Router_Action.gs)、`Script_Kanshou.html` 的第二段 `await gasRun({action:'backfill_kanshou_servant_ai',...})` 呼叫與對應 `showProcessing` 文案，全數整條移除——`kanshouSummonHero` 現在只有 `kanshou_summon_hero` 一次呼叫就 `hideProcessing`，召喚同伴的體感速度回到跟其他單一 round-trip 動作一致。**唯一殘留的功能落差**：23位種子裡只有3位女性正典御主(遠坂凜/伊莉雅絲菲爾/間桐櫻黑化)的 `persona.back`(身世)有手寫內容，其餘20位沒有，`heroToKanshouRow_` 對此的既有 fallback(`${RANK}・${name}`，如「Saber・阿爾托莉雅·潘德拉貢」)會繼續當身世顯示，比AI深化生成的一句話更陽春——但這是純外顯文字差異、不影響AI能否演出角色個性(PREF/TRAIT才是AI讀取的主要依據)，若之後想補齊可仿照dailyMoe/dailyLook的手寫模式直接補`persona.back`，不必復活這個拖速度的即時AI呼叫。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0。
**⚠️ 順手發現、本輪未動的相鄰問題(供之後排查)**：`heroToKanshouRow_`(Gallery.gs:268) 把 `persona.back` 原樣寫進鑑賞的 `COL.PC.BACK`，這個值會直接餵進 `actionPlay` 的 `partyDetailsArr`(Gallery.gs:882，`身世:${r[COL.PC.BACK]}`)、每回合送給AI——但上述3位有手寫`back`的御主，內容其實是solo戰時的悲劇身世(如伊莉雅絲菲爾「人造人、被當作工具養大卻渴望親情」)，跟這輪對 `dailyMoe`/`dailyWords`/`dailyLook` 做的「餐桌是平行世界、很多悲劇沒有發生」原則不一致——這3位若被召喚進鑑賞，身世欄位還是會把solo的悲劇設定直接餵給AI。**✅ 2026-07 已修正**，見文件末尾「solo/鑑賞完全拆分稽核」條目。

**🗑️ 2026-07 同輪撤回：玩家實測反映裝上去反而一直撞【結界觸發】**：玩家裝上 `safety_settings` 後回報「一直撞到」，已直接移除整段。**懷疑根因**(未完全驗證，僅記錄假設供之後排查)：`isBlocked` 判斷式是 `lastErrorMessage.includes("Triggered_NSFW_Filter") || lastErrorMessage.includes("safety")`——只要錯誤訊息含 "safety" 字串就會顯示【結界觸發】(審查被擋)這句話；而新加欄位本身就叫 `safety_settings`，如果 OpenRouter/Gemini 判定這個欄位格式不對而回傳類似「invalid parameter safety_settings」的錯誤，也會含有 "safety" 字樣，就會被誤判成「內容被審查擋下」、掩蓋掉真正的參數格式錯誤。若之後想重新嘗試放寬審查閥門，建議先查證 OpenRouter 轉發 Gemini `safety_settings` 的正確格式(可能需要走 `extra_body`/`provider` 包裝而非扁平 top-level 欄位)，並且先讓 `isBlocked` 的字串比對更精準(如改抓 `finish_reason`/`result.error.status` 而非粗略比對 "safety" 子字串)，才不會把「參數錯誤」跟「內容被擋」混在一起誤判。

**戰鬥平衡測試**：`tools/battle_sim/`（Node，不進 clasp 部署·常駐工具，別再每次臨時搭）——`node tools/battle_sim/duel.js` 直接載入真實的 `Engine_Fate.gs`/`Seed_Codex.gs` 到 vm sandbox 跑蒙地卡羅對戰模擬(不複製戰鬥算式，永遠吃當下版本)，可秒測任兩個從者對戰、任意 fx 開關的勝率差異。詳見該資料夾 `README.md`。

⚠ **2026-07 檔案改版**：`Router_Action.gs`(原 3918 行)已拆成 8 檔——`Router_Action.gs`(核心dispatch)/`Router_Creation.gs`(創角召喚)/`Router_Movement.gs`(地圖移動休息)/`Router_Battle.gs`(戰鬥核心)/`Router_Bond.gs`(羈絆令咒結盟破戒奪僕)/`Router_Narrative.gs`(actionPlay敘事)/`Router_Persona.gs`(演出卡)/`Router_Economy.gs`(出力補魔)。下文各節提到「Router ~行號」的**行號已隨拆檔位移**，函數名不變、用函數名 grep 即可找到——全域作用域共用，切到哪個檔不影響行為。檔案對照表看 `HANDBOOK.md` §4。

---

## 1. 三種模式 (pc.mode)

| mode | 意義 | UI |
|---|---|---|
| **solo** | FATE 單人聖杯戰爭（本專案主體） | 純按鈕；無聊天輸入框、無慾海開關。`applyModeUI()` 隱藏所有 `data-mode="full"` 武俠日常系統 |
| **full** | 九州全模擬（停用中／待清理） | 經濟·生活·物品·門派等已全砍，剩聊天輸入框；不作為玩法軌，可隨經濟一起清理 |
| **kanshou** | 鑑賞（奪杯後後日談約會） | 有聊天輸入框＋慾海開關；無戰鬥／血量 |

`applyModeUI()`（Script.html）是模式總開關。solo 隱藏 full 專屬功能、收掉輸入框、顯示 `war-actions` 行動列。

**雙軌設計**（Index.html `scr-menu`）：玩法只有兩條軌——🎴 純淨(單人聖杯戰爭, newGameFlow/continueGame, SFW) ／ 🌹 慾海(鑑賞後日談, openGallery, NSFW)。共用一張試算表＋核心資料(管線 奪杯→鑑賞 需要)，靠 帳號＋game_id 分流，不拆表。
⚠ **2026-07 玩家定案(推翻舊方針)：兩個唯讀視窗(📜 個人聖杯戰記／🏆 排行榜)已全數砍除**——單人專注、不做跨帳號回顧比拼，`showVictoryHistory`/`actionGetVictoryHistory`/`openLeaderboard`/`actionLeaderboard` 連同「戰史」表、`incrementWin_`/`recordHistory_`/`recordWinSpeed_` 一併刪除，帳號表 WON/BEST_DAYS 欄砍除。`full`(九州全模擬)模式碼殘留、停用中，不作為前台軌（經濟已砍、可隨之清理）。
**持久層(清檔不刪)**：帳號表(2026-07 縮為 NAME/PC/CREATED 3 欄，WON/BEST_DAYS 已隨排行榜砍除)、鑑賞表(封存從者)。**會被清檔刪**：眾生(game_id)——NPC 對御主的關係(BOND/REL_TAG/IS_PARTY/MAJOR_EVENT/REL_MEM)已 2026-07 併入眾生列，隨列一起被清、不再是獨立表。

**補魔(solo)**：`actionManaSupply` 走 narrate_only(SFW)、不開慾海引擎，prompt 維持「曖昧 fade、點到為止」（玩家認可現狀，勿再收緊）。

**重開/姓名查重**：`actionAccountNewGame`(Account.gs) 清舊單人戰場＝刪同 game_id 整個世界 ＋ 御主本人(按 charId，防 game_id 空的孤兒佔名)。`actionCheckName` 只擋「game_id 非空(進行中世界)」的同名活躍御主；DEAD_ 與 game_id 空的孤兒不佔名→重開後自己舊名可重用，多帳號間活躍同名仍隔離。

**重點：solo 全程無花錢入口**。身世的財力差異改由「起始禮裝機率」(`rollMysticForMaster_`)體現。
> ⚠ **經濟/生活層已全砍(2026-06 定案，推翻舊「保留給 kanshou」方針)**：money/商城/物品/給銀兩/任務/賭場/飛書/生活技能/裝備——**兩軌都不要**，AI 需要時自己掰、不寫試算表。kanshou 是「一個更單純的世界」(無經濟·無戰鬥)。code＋分頁＋COL 已清(見 §3 末)。

---

## 2. 實例化與資料表

- **game_id**：每局一個世界。`g_`+ts = 聖杯戰爭；`k_`+ts = 鑑賞世界。所有眾生/時鐘/關係查詢都帶 game_id 過濾，杜絕跨世界外洩。
- **🌹 慾海獨立分頁＋多人(最多3)**：慾海角色住獨立「**鑑賞眾生**」分頁(`getKanshouPcSheet_`，schema 同眾生)，與戰爭主表隔離、頻繁新增/移除不污染。**dispatcher 在 `pcId` 以 `KPC_` 開頭時把 `sheets.pc` 路由到此分頁**(solo 御主 `PC_` 不受影響；全 codebase 唯一硬寫死「眾生」處＝dispatcher line ~146)。`actionEnterKanshou` 改寫此分頁＋**持久接續**(同御主×同從者已有 k_ 世界→接續不重建、肉體/親密/羈絆延續)。`kanshouServantRow_` 共用建列。同伴管理 action `kanshou_companions/add/remove`(上限3)；前端抽屜「👥 後日談同伴」(`drawer-companions`，`applyModeUI` 僅鑑賞顯示)→`openCompanions/kanshouAdd/kanshouRemove`。慾海聊天仍走 `actionPlay`(引擎未動)。**NSFW**：`enterKanshou` 自動勾 `nsfw-mode-toggle`(否則 isNsfwMode=false→intimacy 回填全跳過、肉體狀態不寫)。**DEV**：`dev_seed_gallery`(待移除)塞測試從者。(舊 `openGallery/enterGallery` 彈窗已退役)
- **FACTION 區分**（COL.PC.FACTION 字串）：`御主`(玩家)、`從者`(玩家的)、`敵御主`、`敵從者`、`盟友御主`/`盟友從者`(前端 override，見 §8)。
- ✅ **九州數值五圍(STR/CON/AGI/INT/LUK) 已移除(2026-06)**：FATE 純六圍 SIX 階級制。戰鬥(Engine_Fate)本就吃 `rankVal(six[...])`；HP/MP 改由 `maxStatsForRow_(row)`＝`fateMaxHpMp_(svNum_(SIX.耐久), svNum_(SIX.魔力))` 算；`getCharacterTotalStats` 的 STR~LUK 顯示值改由 `svNum_(SIX)` 推。`buildPlayerStatusString` 五圍 §位置保留(由 SIX 推/空字串)→前端 s[N] 不變。
- ✅ **九州境界/物品/銀兩/門派 已移除(2026-06)**：`REALMS/REALM_MODIFIERS/REALM_LIMITS`、`calculateMaxStats`(屬性上限計算器)、`getRealmConstantsJson` 全砍；新 `fateMaxHpMp_(con,mag)` 無境界倍率(`100+con*10`/`50+mag*10`)。`COL.PC.REALM` 死欄保留但一律寫 ""。物品(`RARITY_TABLE/detectItemType`)、貨幣(`CURRENCY_TABLE`)、門派(`registerFactionHelper/updateFactionPower`)helper 一併移除。`actionManualNpc` de-realm：御主固定凡人級、NPC 採 AI 建議 con/int 夾 8~25。快取鍵 `KYUSHU_MAP_DATA`→`FATE_MAP_DATA`。
- ✅ **提示詞清九州(2026-06)**：solo `sfwBaseRules`、各 NPC/玩家卡、慾海 `nsfwBaseRules`(玩家授權「只換詞·機制原封不動」：九州天道→敘事演化核心、境界/真氣/江湖/武學→中性)全清九州詞，讓 AI 完全不知九州。**例外**：`雙修技巧` 是 NSFW `[雙修技巧]` MEMORY 機制，依機制原封不動保留；`凡人`作「人類御主」描述語(非境界值)保留。
- **分頁**（Setup_FateWorld.gs `FATE_SHEET_DEFS`，缺頁自動補、冪等）：**2026-07 精簡為 7 頁**——坤圖(地圖)/眾生/英靈殿/御主殿/帳號/鑑賞/歷史暫存。另有動態建的「鑑賞眾生」分頁（見下）。舊分頁戰史/時鐘/因果/權柄/關係/史紀 全數移除：時鐘(CLK)/權柄(AUTH，居所)/關係(REL，好感等) 併入眾生列各欄(見下 COL schema)；因果(事件log)/戰史/史紀(命運長河) 直接刪除、無替代機制(2026-07 玩家定案，單人專注不留跨局回顧資料)。

### COL schema（索引讀取，表頭僅供人看；定義在 `Core_Settings.gs` 開頭 `const COL`）

⚠ **2026-07 單人重構**：獨立的 關係(REL)／時鐘(CLK)／權柄(AUTH) 表全部**摺進「眾生」自己這一列**——單人模式每個 game_id 世界恆只有一位御主，故「NPC 對御主的關係」= 那名 NPC 自己這一列的欄位；「日/時/AP/居所」= 御主自己那一列的欄位，天然 1:1、無需獨立 join 表。因果(LOG)／戰記／史紀(EPIC) 三個機制直接刪除（見 §3、§10）。

```
PC(眾生)【FATE 33欄·2026-07 折表後】:
  ID0 NAME1 SEX2 BACK3(身世) STATUS4(外顯) TRAIT5 LOC6 PREF7(個性)
  HP8 MP9 MAX_HP10 MAX_MP11
  MEMORY12 INTENT13(萌點) FACTION14 RANK15(職階) CONTRIB16 ALIGN17
  PHYSICAL18(肉體·NSFW) MARTIAL19(寶具) GAME_ID20 SIX21(六圍JSON) TAGS22(技能JSON) SEEN23(戰爭迷霧)
  🆕 關係欄(原 REL 表·這名 NPC 對「本世界御主」的關係。御主自己這一列這五欄留空)：
    BOND24(好感值0-100) REL_TAG25(關係標籤) IS_PARTY26(同行旗標"同行"/"") MAJOR_EVENT27(未完成重大約定) REL_MEM28(關係專屬記憶，NSFW稱呼/親密次數等，與角色自己MEMORY分開存)
  🆕 世界狀態欄(原 CLK/AUTH 表·只在【御主自己那一列】有意義，其餘角色列留空)：
    DAY29 HOUR30 AP31(1AP=1hr，每日12AP，休息每hr補2AP) HOME_LOC32(居所·工房加成判定用，原權柄表)
  🗑️已刪:財帛MONEY/裝備WEP·ARM·ACC1·ACC2/生活技能LIFESKILL/冗餘職階CLS(併RANK)/數值五圍STR·CON·AGI·INT·LUK(改吃六圍SIX)/死欄REALM(2026-07 真的移除，非棄用)。
  🗑️COL 已無 ITEM/QUEST/SHOP/MAIL/TASK/CTAG 子表(戰鬥標籤分頁仍在、以fx碼查找不需索引)。
HERO(英靈殿): ID0 CLS1 NAME2(真名) SEX3 SIX4 CLASS_SKILLS5 SKILLS6 TRAITS7 NP8 PERSONA9(JSON) ALIGN10 WARS11 SOURCE12
MASTER(御主殿): ID0 NAME1 SEX2 APPEAR3 MAGIC4 CIRCUITS5 MELEE6 MAGIC_RANK7 HOME8 WISH9 PERSONA10 WAR11 SOURCE12 BACK13(身世) MOE14(萌點)
GAL(鑑賞): ACC0 NAME1 CLS2 SEX3 SIX4 TAGS5 NP6 BACK7 PREF8 MOE9 MEMOIR10 WISH11 TIME12 MASTER13 MSEX14
ACC(帳號)【2026-07 縮為3欄，WON/BEST_DAYS隨排行榜砍除】: NAME0 PC1 CREATED2
GAL CLS="御主" = 盟友御主搭檔（凡人之軀，鑑賞重建走 master 分支）
```

---

## 3. 後端路由 `ActionRouter`（Router_Action.gs 頂部）

主進入點 `handleGameAction` → `sanitizeUserData_`(輸入清洗) → 查 `ActionRouter[action]`。AI 輸出經 `sanitizeAiData_` 夾值防幻覺。

- **🛡️ 慾海戰鬥/經濟類 action 明確擋牆(2026-07 加固)**：玩家問「戰鬥不會用到慾海的吧」查證後發現——這批 action(`fate_battle`/`use_seal`/`mana_supply`/`bond`/`rule_break_steal`/`propose_alliance`/`break_alliance`/`ally_bond`/`set_workshop`/`scavenge`/`second_wind`/`scout`/`rest`/`summon_horror_beast`/`dismiss_horror_beast`/`set_servant_output`/`set_mage_realm`/`set_rune_mode`/`set_active_skill`)過去完全沒有「這是慾海 pcId 就拒絕」的明確檢查，只靠前端 UI 全部隱藏對應按鈕(`applyModeUI`/`renderWarActions`)擋玩家；後端本身若被直打 API，多半只能靠資料結構的間接效果提前失敗(如 `fate_battle` 因「鑑賞眾生」表從不會有敵對陣營列而查無目標)，但並非每個都吃得到這道隱含防線——例如 `set_workshop` 只跳過費用檢查，陣地標記仍會被寫入(純無害廢資料，但非設計上刻意允許)。已在 `handleGameAction` 新增 `KANSHOU_BLOCKED_ACTIONS_` 白名單，`isKanshouCtx` 命中就統一在 dispatcher 層擋下，不再依賴各 action 資料結構湊巧擋住。**刻意不擋** `move`(慾海約會地圖也要移動)／`update_fate`／`update_rel_tag`(未確認慾海是否也會用到，保守不動)。

### solo 會用到的 action
| action | handler | 作用 |
|---|---|---|
| check_name / account_login / account_new_game | Account 系 | 登入／建帳號／開新局 |
| create | actionManualNpc | 御主創角。**🚀 開局非阻塞(2026-07)：create【不叫 AI】**，用玩家輸入的種子值(身世→背景、4格預設特徵/個性)＋GAS 算的數值(HP/MP/game_id/迴路/令咒/模式/戰爭/扮演 MEMORY)＋起始禮裝**秒寫入**、立刻進召喚頁。落點確定性選(偏好新都)。 |
| backfill_master_ai | actionBackfillMasterAi | 🚀 御主敘事·非阻塞補生成：create 後由前端 `backfillMasterAi(seed)`(不 await·趁玩家在召喚頁挑從者空檔)呼叫，AI 補 背景/特徵/個性/萌點，**只以單格 setValue 更新 4 敘事欄**(BACK/TRAIT/PREF/INTENT)、不整列 write-back、不碰數值/位置/MEMORY。失敗＝保留種子(優雅降級)。**穩健**：與 `summon_servant` 的御主池更新已改單格寫(MP/MAX_MP)→兩者欄位互斥、無競寫。 |
| update_fate | actionUpdateFate | 逆天改命：玩家在遊戲中改自己 4 敘事欄(個性/特徵/身世/萌點)，數值/寶具不可改。 |
| summon_servant | actionSummonServant | 召喚從者（從英靈殿抓真名/六圍/技能→眾生列）。**種子英靈直接用寫死 persona(萌點/口吻)、不叫 AI**(省一次 API、加速)；只有名冊查無的自訂/未知英靈才走 AI 即時生成(else 分支)。**敘事8格**：個性(PREF)讀 `persona.words`、**特徵(TRAIT)讀 `persona.look`**(35 位種子皆手寫4格 外貌/氣質/自稱/卸下心防私密一面，召喚/鋪敵 直接用、AI原創走通用預設、不再被戰鬥特性污染)。**🛠️ 工房(2026-07 二版·純製造/修改·不直接召喚)**：`save_hero`(actionSaveHero)＝create(AI 補 persona/npEn·蓋 persona.creator 印記)或 edit(帶 heroId·僅創造者·真名不可改·npEn 沿用舊值·非空覆寫)，驗證走 `parseForgeBuild_`(單一真實來源·六圍340/技能計價/規模計價/正典擋)。召喚一律走 🌟 玩家原創專區→hero 分支實體化(persona.weapon 也會蓋回【武裝】)。get_heroes 對 ai_gen 附 creator+detail(工房 forgeEdit 預填用)。原 summon_servant build 分支已移除。舊記載(當場召喚版)：玩家親手定 職階/性別/六圍/技能/寶具，後端全驗證(不信任前端)——六圍預算 340(E10..EX60·EX≤2·超額拒收；**🐗 狂化補正(2026-07)：Berserker 預算+30=370**——狂化C 是唯一負資產職階附贈(同素體實測墊底 普攻3.0/寶具3.0%·Caster 6.1/13.3)，差距≈20~45點取中30，370頂配狂戰實測70.9%/45.9%安全·FORGE_CLS_BONUS_/FORGE_CLS_BONUS 前後端鏡射)、技能≤4(前3免欄位費·**第4欄+20**(2026-07·壓力測試證實安全：預算擠壓+疊加上限±8使四技組合83~85%皆低於三技頂點93%·前後端同以「已用技能數>3」計費)·fx∈ALLOWED_FX_·階級上限A·可改名效果吃fx·職階技能依 FORGE_CLS_SKILLS_ 自動附贈不占槽)、寶具名玩家原樣保留(剝 對城/對界/對神/常駐標記·階級上限A·規模限 對人/對軍)、正典名擋(導去真名召喚)。AI 只補 persona 三欄(background/personality/npc_intent·失敗不擋召喚)。照舊收錄英靈殿可重召。前端＝Index `#cust-forge` 表單＋Onboarding `toggleForge/summonByForge()`(FORGE_FX/FORGE_PTS 鏡射 ALLOWED_FX_/RANK_VALUE·改後端記得同步)。**種子級自訂(2026-07 二期)**：外貌(look→TRAIT)/個性(pref→PREF)玩家給了原樣寫入·AI 只補沒填的；寶具＝中文名＋AI 補英文真名讀法(flavor.npEn·拉丁字母清洗)＋(規模 階級)＋玩家威能一句(npDesc·剝對城/對界關鍵字防規模逃逸·npAtkScale_ 讀整串)；**寶具經濟(2026-07 收口)**：顯示階自動＝六圍寶具階(引擎威力/耗魔/骰只吃 six.寶具·原「另選階級」假旋鈕已拆)、規模用同一份預算買(對人=0/對軍=+20·NP_SCALE_MATRIX 對軍×1.25 嚴格優勢·免費必人人選)、技能階級也計費(有 fx 才收·六圍半價 E5/D10/C15/B20/A25·SKILL_PTS_/FORGE_SK_PTS 前後端鏡射·純演出標籤免費；**三軌計價(2026-07)**：同組同價會讓大係數嚴格支配——強效軌 E7~A33(aim/petrify 4×階·fast_cast/divine_age 12×階·territory 26%×階)、輕效軌 E3~A17(ride 2×階·wind_strike 6×階·morale 3×階被透化封)·SKILL_TRACK_/FORGE_SK_TRACK 鏡射·選單標「強效/輕效」；**五波(2026-07·玩家澄清「無欲能不能花更多錢連千里眼也封」原意)**：一度誤把「無欲(A階)連千里眼也封」寫進引擎，玩家隨即指正——**千里眼(aim) 本來就不受無欲(unreadable)封鎖**，這正是它比「直感/心眼」(first_strike/analyze，會被無欲封先機)貴的理由(免疫封鎖是既有機制、非新設計)：三軌計價(強效軌 E7~A33 vs 標準軌 E5~A25)的溢價已隱含這個免疫加成，玩家買貴的那個就是買到「無欲剋不到我」。已復原 `Engine_Fate.gs` 千里眼判定(移除誤加的 A 階封鎖分支)；工房目錄「⚔️ 命中系」各自命名的 label 明示「免疫無欲封鎖／會被無欲封」讓玩家買前就看得懂差價買了什麼(呼應「準確分流」原則·見下方六波復原)。
**四波收斂→六波復原(2026-07)**：四波曾把命中系(aim千里眼4×階/first_strike直感3×階/ride騎乘2×階)收成「選強度(大中小)→自己命名」，玩家隨即指正「代碼寫很細，不能這樣合併分類」——**表面同公式不同係數，底下藏著真實機制差異**：first_strike/analyze 是【攻守雙修的先機】(命中+迴避皆加、會被無欲unreadable封)，aim/ride 卻是【純進攻】(不加迴避、永久免疫無欲封鎖)；battle_sim 實測：守方持 first_strike 時攻方命中率 40.4%→19.3%(腰斬)，守方持 aim/ride 時攻方命中率毫無變化(39.5~39.6%，防守時完全是廢的)。硬套大中小會把這條機制線抹掉、變假分類——已拆回 `FORGE_FX_GROUPS` 各自獨立命名(`⚔️ 命中系`：first_strike/analyze/aim/ride/self_mod/petrify 六項各自標明「先機/迴避/純進攻/免疫無欲」)，移除當時新增的 `FORGE_FX_ALIAS_`／analyze 顯示別名(不再需要，analyze 恢復為獨立可挑項)。**同批復原的常駐傷害系**(fast_cast/crafting/wind_strike)雖然實測純屬同公式不同係數、無隱藏交互，但依循同一條「不強行合併分類」原則一併拆回獨立命名，維持與命中系一致的目錄風格。self_mod/divine_age/tactics/weapon_steal/agile_striker/god_slay 維持在同一個「🗡️ 傷害系·常駐」分組內(各自獨立命名，從未被四波收斂)。減傷系(七天盾/陣地/城牆/神核)因擋法條件互異(僅物理/僅寶具/可被貫穿)同理維持獨立命名、未曾被收斂。
**二元 fx 平價25**：god_hand/survive/zabaniya/gae_bolg/rule_breaker/anti_magic_lance/agile_striker/weapon_steal(2026-07補洞·引擎恆×1.5不讀階)/god_slay(依對方神格)＋lovespot 風味價5 引擎不讀其階級·FLAT_FX_/FORGE_FLAT_FX·防E階白撿；tsubame 例外60(2026-07 四修：限每場首回合後由100降回·「回回×2.3」時代曾配盾達全池100%勝率)；**agile_striker 以巧破力**＝敏捷入傷害底的唯一通道(勿名神速·理查正史技撞名)·combatProfile_ 讀·煙測 敏EX筋E 傷害14→74·**全能稅(2026-07)：敏捷入傷時傷害段整體×0.85**——敏捷已主宰命中/迴避再兼輸出須打折)；武裝(weapon→MEMORY【武裝】)；recordOriginalHero_ 擴 persona pExtra 物件(look/moe/firstP/toMaster/speech/tic/back·重召全數讀回不掉設定·舊呼叫端不傳不變)。**演出細節三期(2026-07)**：自稱/陣營(9選)/對御主態度/口吻/小動作/萌點/身世 全選填(🎭摺疊區·零數值不佔預算)——玩家給了原樣接種子管線(MEMORY 第一人稱/對御主＋stampPersonaFlavor_)、留空照舊 AI 補。**外貌/個性拆8欄四期(2026-07·玩家反饋「玩家不可能自己打頓號分隔」)**：`cf-look`/`cf-pref` 原本各是單一輸入框、要玩家自己用頓號手動分隔四短句(五官髮色/氣質/身形/衣著印象、日常表象/真實內裡/喜歡/討厭)，太麻煩且沒人會這樣打。**改成前端純版面拆分**：Index.html 拆成 `cf-look-1~4`/`cf-pref-1~4` 共8個小欄位分開填，送出前 `_joinParts()`(Script_Onboarding.html)只取非空欄位、用頓號組回單一字串——**欄位數＝`parseForgeBuild_` 的 `_segs()>=3` 判準**(玩家填越多段→越接近`lookFull`/`prefFull`→AI 不准改；填越少→AI 讀作「核心設定・擴寫」)，只過濾空值再 join 對這條判準完全透明，後端/資料格式一行未動。編輯回填(`forgeEdit`)反向用頓號 `split` 拆回4欄位個別預填。**⚠ 僅前端版面重構，未實機於手機瀏覽器點測**，部署後建議實際跑一次工房建立/編輯流程確認欄位對得上。 |
| — (AI 從者 fx 調色盤) | ALLOWED_FX_ / FX_MENU_ (Router_Creation.gs) | **AI 即時生成從者的 fx 白名單＋提示菜單**(兩者要同步)：`sanitizeSkills_` 用 `ALLOWED_FX_` 過濾(不在的 fx 清空、只留當演出標籤)，`FX_MENU_` 是餵 AI 的可選清單。**2026-07 放寬(A)**：加開 aim/projection/fast_cast/crafting/petrify/shapeshift/solo/weapon_steal/rho_aias/territory/wall_def/zabaniya(中階以下·施放/防禦/對人放大)，拉高自訂從者上限貼近種子。**2026-07 三波開放(互鬥錦標賽補剋制缺口)**：sense(氣息感知·反奇襲·階級計價)/god_slay(神殺·剋神性·固定25)/lovespot(愛之痣·固定5)；同梯 **petrify 削迴避 2×階→4×階**(升格閃避流剋星·工房唯一可購反迴避·美杜莎連動受益)。**刻意仍 gate**(種子專屬·防「乖離劍氾濫」)：頂級概念寶具 ea/gob/excalibur/ubw/summon_horror/chain/wealth＋需專屬UI的 mage_realm/rune。⚠ 但 `npAtkScale_` 讀 np 字串的 對城/對界 關鍵字→AI 仍可靠字串拿高規模(缺的只是 fx 放大器)，非全鎖。要頂級同人→加進 SEED_SERVANTS。**2026-07 收回 divine_core(神核)**：原在(A)波放寬清單內，但玩家盤查發現「神核代表真正神靈軀體」這條紅線被打穿——凡人向系統花錢就能買神核(漲價也擋不住有預算的玩家)，且同批盤查揪出種子庫內 2 名持有者(美杜莎D/伊絲塔A)其實查無版本對應來源(推論/錯版本嫁接)予以拔除，全庫只剩 3 名有明確出處(斯卡蒂A/阿基里斯B/迦爾納A)。與其重新定價，直接把 `divine_core` 移出 `ALLOWED_FX_`＋`FX_MENU_`＋`FORGE_FX_GROUPS`(Script_Onboarding.html)，`sanitizeSkills_` 是工房與 AI 隨機生成從者共用的同一道驗證，此舉同時封死兩個入口，神核回歸「查有官方來源的種子英靈專屬」。 |
| — (AI 從者強度上限，2026-07 修) | `sanitizeSix_`/`sanitizeSkills_` (Router_Creation.gs) | **🐛→✅ 個別格式合法≠整體強度合理**：`sanitizeSix_` 原本只驗證單一階級字串格式(E~EX 合法即收)，沒有整體強度上限——AI 可以讓六圍全部合法但全部給 EX(遠超任何種子英靈)，且 `recordOriginalHero_` 會把這個角色永久寫回英靈殿供之後任何玩家重召，等於一次 prompt 誘導固化成長期破台角色。已加「EX 級最多保留 2 項、其餘超額降階為 A」(比照現有種子最強者的分布：吉爾伽美什/理查一世都只有 1 項真 EX，即使赫拉克勒斯五圍逼近頂格也只算 1 項)。`sanitizeSkills_` 也補上 `maxCount` 參數——原本 classSkills/skills 共用同一個 `.slice(0,5)`，但 prompt 實際只要求 1~2 個/2~3 個，等於允許 AI 吐兩倍於預算的技能數量；呼叫端改分別傳真實預算(2/3)。 |
| get_heroes / get_masters | — | 創角選單列出可選英靈/正典御主 |
| get_tags | actionGetTags | **左側狀態面板資料**：御主HP/MP/令咒/願望、從者陣列(六圍/技能/羈絆/寶具)、供魔收支、禮裝、破戒能力。**⚡ 核心邏輯抽成 `buildTagsPayload_(sheets,pcId,preData)`**(可吃已讀好的整表免重讀；2026-07 關係併入眾生列後，已無獨立 `preRel` 參數——關係資料就在 `preData` 同一張表裡)；`sync` 回應已夾帶 `tags:` 同份 payload，前端 `refreshFateTags(data.tags)` 直接用、不再單獨打 get_tags。**效能鐵則：一次按鍵原本 3 趟 round-trip(action→sync→get_tags)→現 1 趟**。機制：①`buildClientState_(sheets,pcId)`＝完整刷新 blob(statusString/people/locations/clock/ap/economy/tags，先 markRivalsSeen_ 再讀、整表只讀一次下傳共用)，`actionSync` 即回它。②dispatcher 對 `STATE_AFTER_ACTIONS` 白名單動作(fate_battle/mana_supply/move/rest/scavenge/scout/bond… 凡前端事後會整頁 syncData 者)＋ `PC_` 御主，自動把 `_state:buildClientState_()` 夾進回應。③前端 `gasRun` 暫存 `data._state`→`__pendingState`，`syncData` 優先消費它(`applyClientState`)、沒有才打真 sync(graceful fallback)。**不列入白名單**：樂觀 setter(set_servant_output/mage_realm/rune_mode/np_choice 不 syncData、只吃 res.economy)。`playerServantEconomy_(sheets,pcId,preData)`／`getFreshStatusString`(已拔冗餘 flush) 同理。改這幾支前先想清楚別把整表重讀或多餘 round-trip 加回來。 |
| fate_battle | actionFateBattle | **核心戰鬥**：D20＋寶具＋令咒＋斬首＋雙從者＋協同強襲（見 §4） |
| use_seal | actionUseSeal | 令咒固定選單：修復/補魔/緊急脫離 |
| mana_supply | actionManaSupply | 補魔(燃迴路)：硬擠迴路回滿共用池，**永久代價** maxHP−15、迴路−3(地板迴路8/HP40)+羈絆+SFW fade（耗1AP，卸防可能被突襲）。過度＝慢性自盡。**另存一次性【過充】token**(下一發規格外＋/EX寶具可全力灌魔超載·見 §10 灌魔超載)。 |
| ~~blood_supply~~ | (已移除) | 🩸燃血改【被動】：池見底時 applyRegen_ 自動燃【御主】HP續契約(缺口÷2·**2026-07 玩家定案：從者一律不扣血**，缺口期從者僅停止自我修復)。主動 action/按鈕/函數皆已刪。 |
| set_servant_output | actionSetServantOutput | 🔋設從者靈基出力檔(20/40/60/80/100，存 MEMORY【出力】)。免費即時不耗AP。決定戰力＋御主每小時維持費；100% 才能放寶具。 |
| set_mage_realm | actionSetMageRealm | 🔮魔境的智慧(斯卡哈專屬)：玩家點選 **1 個通用 A 階被動 fx**(`mageRealmPool_`：對魔力/怪力/心眼/透化/軍略/自我改造)，存 MEMORY【魔境】fx；fx 空字串＝清除。免費即時不耗AP。`rowToCombatant_` 戰鬥時注入 skills(r:'A')。只接受持 `mage_realm` 的從者。 |
| set_np_choice | actionSetNpChoice | 🌟多寶具英靈：玩家點寶具時選「解放哪個」，存 MEMORY【寶具選】N(預設0=主寶具)。`servantNpOptions_(name,cls)`(Engine_Fate 中央表：斯卡哈L/金閃/EMIYA/伊斯坎達爾…)定義每英靈的寶具清單{n,scale,fx,desc}。`npProfile_(c)`解出本次解放的{scale,fx}：多寶具讀 c.npChoice 選定項，單寶具退回字串尺度＋`firstSignatureFx_`。`resolveFateBattle_` 簽名效果(gae_bolg必中/ea執行殺/ubw/zabaniya/summon_horror/petrify/scaleMult)一律改吃 npProfile→選對寶具才生效。前端寶具鈕→`openNpReleasePicker`(>1才彈)→`pickNpAndStrike`(set_np_choice→servantStrike npPicked)。免費即時。 |
| outfit | actionSetOutfit | 👗**從者換裝**(玩家自訂當前服裝穿著)：存從者 MEMORY`【換裝】<文字>`(`getOutfit_/setOutfit_/clearOutfit_`·Core_Settings·set 內剝`｜【】`換行＋限40字)。**只換衣不換人**——五官/髮色/體態/氣質仍依種子`persona.look`。餵進敘述三處：`servantCard_`(solo 戰鬥/羈絆/移動·同時補注`外貌本相`＝先前漏掉的 look)＋actionPlay `【同行夥伴】裝扮:`(solo/full)＋kanshou `[名 裝扮]:`(Router_Narrative)。純外觀·免費即時·不耗 AP·兩軌通用·留空恢復本相。get_tags 給 `outfit`(前端預填/顯示)。前端 `changeOutfit(name)`(prompt)＋卡片 👗換裝鈕(solo 動作列＋kanshou 卡)。 |
| weapon | actionSetWeapon | ⚔️**從者武裝**(2026-07·「Saber斯卡哈仍拿槍」案)：玩家自定武器/戰鬥方式，存從者 MEMORY`【武裝】<文字>`(`getWeapon_/setWeapon_/clearWeapon_`·Core_Settings·限30字)。`servantCard_` 讀後上【武裝·絕對】強制線——**蓋過職階慣例(Saber=劍…)與該真名的原典武器習慣**(自訂腦洞職階×武器搭配的根源解)。免費即時·不耗AP·留空恢復自然演出。servants payload 給 `weapon`。前端 `changeWeapon(name)`(prompt·鏡射換裝)＋卡片 ⚔️武裝鈕；工房 `cf-weapon` 欄創建時直接定。 |
| set_rune_mode | actionSetRuneMode | 🔯原初符文運用(持 rune 者)：玩家選 **def 減傷/dmg 增傷/regen 回血**，存 MEMORY【符文】mode(預設 def)。`runeMode_`/`setRuneMode_`(Core_Settings)。`rowToCombatant_`→c.runeMode；`resolveFateBattle_`：def loser減傷10%×階／dmg winner增傷10×階；regen 在 `actionFateBattle` 回合迴圈回血 5%×階/回合。get_tags 給 `runeMode`。免費即時。 |
| bond | actionBond | 羈絆互動：單一「相處」(2026-07 收攏·原4種打卡)，每遊戲日一次 +10、耗1AP(推進1小時·不觸發worldTick)，味道由 AI 依時段/羈絆/性格即興 |
| ~~use_mystic~~ | — | **已移除**（禮裝全面被動化，戰鬥自動加持我方從者，見 §6） |
| rule_break_steal | actionRuleBreakSteal | 破戒奪僕：打殘敵從者(HP<35%)+燃令咒→奪為第二從者(上限2) |
| propose_alliance / break_alliance / ally_bond | 同盟系 | 結盟/撕毀/與盟友共處(見 §8) |
| set_workshop / scavenge | 陣地系 | 設陣地(提升供魔)／搜索物資(主情報、順手撿零星魔力 ~10%/地、同地搜過枯竭剩 3%；標記【搜刮】loc，防站樁刷魔) |
| second_wind | actionSecondWind | 0-AP 死局保命解：扣~20%上限血換+4AP，**不耗AP·可重複**(2026-06 移除每日一次限制——血才是天然煞車，HP≤cost 才擋；唯 AP 近滿時擋)。不推進時間、不燒令咒 |
| scout | actionScout | 偵查：揭露同地敵蹤(設 SEEN，**敵移位後不再清 SEEN→已偵查者持續可見**) |
| prep_meal | actionPrepMeal | 🍱 整備·進食(戰前 buff)：耗1AP，御主 MEMORY 記`【整備至】<絕對小時>`，效期內從者出擊命中 +`MEAL_BUFF_BONUS`(2)約`MEAL_BUFF_HOURS`(8)小時。solo 無道具欄/商城，食物抽象供給。`fateStrike_` 讀 `mealBuffActive_` 把 `mealBuff` 傳進 `resolveFateBattle_`(Engine_Fate.gs 加 aHit)。前端 `prepMeal()`＋戰場行動列「🍱 整備」鈕 |
| get_map_nodes / get_all_categorized_maps | 地圖 | 地圖節點＋敵蹤(吃 SEEN 迷霧；有盟友→`hasAllyInGame_`全揭露)。**⚡ 2026-07 效能修**：算法抽成 `buildMapNodesPayload_(sheets,pcData,gid,loc)`(吃已讀好的 pcData，零額外整表讀)，`buildClientState_`／`actionMove` 都夾帶 `mapNodes:` 進各自回應；前端 `renderMapPane(preNodes)` 優先吃夾帶值、存進全域快取 `lastMapNodes`，只有兩者皆無才退回獨立 `get_map_nodes` round-trip。**這是修「手機切地圖頁很慢」的根因**——舊版每次顯示地圖頁都強制多打一趟 `google.script.run`(即使資料剛在同一次動作已經算過)。**🆕 2026-07 戰爭分流**：`COL.MAP.WAR`(第7欄，空字串＝通用/'4th'＝第四次限定)——`buildMapNodesPayload_` 用 `findGameMasterIdx_`+`getWarName_` 查本局戰爭，非通用且與本局戰爭不符的節點直接濾掉，不回傳給前端。 |
| move / rest / sync | — | 移動(2AP)／休息(補AP+夢境)／資料同步 |
| narrate_only / multi_attack_narrate | actionNarrateOnly等 | **AI 純說書**(solo 不用 actionPlay；GAS 算數值、AI 只演出) |
| end_run / enter_kanshou / kanshou_companions·summon_hero·remove | Gallery.gs | 結束本局(單純清理，不再封存)／進鑑賞後日談世界／同伴管理(見 §9)。⚠ 舊 claim_grail(奪杯封存)/kanshou_add 已於 2026-07 整個移除(見 §9.1)；更早的 list_gallery/enter_gallery/gallery_talk 也已移除 |
| enter_kanshou | actionEnterKanshou (Gallery.gs) | **🌹 進入鑑賞主入口(新版)**：每帳號【單一常駐】後日談世界。御主 avatar(KPC_)以 MEMORY `【帳號】<acct>` 綁定、id 持久→`getGameHistory(pcId)` 跟單機一樣接續歷史。無從者預載、不重講開場；從者由 `kanshou_companions/add/remove`(👥面板) 邀請(上限3)。**御主名字＋性別首次進場由玩家定**(不掛帳號)：沒帶齊 `pcName/pcSex`又還沒建過→回 `needSetup:true`(附 `defaultName`)，前端 `askKanshouSetup()` 問一次(名字＋性別)再帶進來建。前端 `enterKanshou()`(Index.html「進入鑑賞」鈕)→ mode=kanshou、自動開 NSFW、撈歷史 |
| kanshou_set_sex / kanshou_set_name | actionKanshouSetSex／actionKanshouSetName (Gallery.gs) | ⚧/✏ 隨時改後日談御主 avatar 性別/名字(只動該欄，不影響歷史)。**2026-07**：關係已併入眾生列(存在同伴自己那一列，不記「對誰」的名字)，改名不再需要遷移任何羈絆鍵。👥面板「切換性別」「改名」鈕→`changeKanshouSex()`／`changeKanshouName()`。**🐛→✅ 2026-07 修「切換性別沒清肉體狀態」**：`actionKanshouSetSex` 原本只改 `SEX` 欄，`COL.PC.PHYSICAL`(肉體狀態 JSON)完全沒動——`mergePhysicalStatus`(Core_Settings.gs)是 `Object.assign` 純新增/覆蓋、從不刪除舊 key，換性別後舊性別的器官欄位(如`蜜穴`)永久留著，下回合 AI 依新性別補上對應器官(如`肉棒`)後，兩性器官會同時存在，命格面板(`buildPlayerStatusString` 把 `PHYSICAL` 全部 key 印出)顯示矛盾狀態。已改成：真的換了性別(`newSex !== oldSex`)時，把 `PHYSICAL` 重置為新性別的預設值(跟 `Router_Narrative.gs` 的懶初始化同一套預設看齊)。**⚠ 2026-07 後續更新**：`heroToKanshouRow_` 建立當下的預設寫入已拿掉(見下方「同伴建立不預填肉體狀態」條目)，這裡指的「同一套預設」現在只存在於 `Router_Narrative.gs` 的懶初始化算式裡，不再有任何地方在「建立當下」就寫死預設值——但切換性別時仍主動重置(不是懶init)是刻意保留的行為，因為這裡處理的是「已有資料、需要清掉矛盾殘留」的情境，跟「全新建角/召喚故意留空」是不同的問題。 |
| ~~get_victory_history / get_ranking~~ | (已移除) | 🗑️ 2026-07：個人聖杯戰記／排行榜兩個唯讀視窗連同「戰史」表全數砍除（單人專注，不做跨帳號回顧比拼）。 |
| ~~war_chronicle / war_history_list~~ | (已移除) | 🗑️ 2026-07：「戰記」表(里程碑回顧)整套刪除，`logWarEvent_`／`actionWarChronicle`／`actionWarHistoryList` 及 Router_Battle/Bond/Creation/Time_World 內所有呼叫點一併拔除。 |
| ~~get_epic_history~~ | (已移除) | 🗑️ 2026-07：「史紀」表(命運長河面板)整套刪除，`actionGetEpicHistory` 已拔。前端 `openEpicPanel/loadEpicData/renderEpicHistory/renderEpicStats/switchEpicTab/removeNpcMajorEvent`(Script.html)＋抽屜「📖 個人史紀」鈕、Index.html `#epic-overlay` 面板(含 `#tab-epic-history`/`#tab-epic-stats`/`#panel-epic-history`/`#panel-epic-stats`) 已於前端清理批次一併拔除(兩個分頁同源自同一支已死 action，一併砍、不留半死的「冬木足跡」分頁)。 |

### 🗑️ 九州經濟/生活層已全數移除（2026-06，code＋分頁＋COL 一併清）
銀兩(MONEY)/商城·店鋪(SHOP)/物品·背包(ITEM)/天命·任務(QUEST)/工房(TASK)/賭場/飛書(MAIL)/生活技能(LIFESKILL)/裝備(WEP·ARM·ACC1·ACC2)——對應 action、helper(resolveItemName/transferMoney/checkAndExpireQuests…)、actionPlay 內 items_gained/transferred/lost/used·money_transferred·quest 解析、前端背包/物品連結/飛書 UI 全拆；COL 子表與分頁定義一併刪。**保留**：魔力收支(playerServantEconomy_/工房/`economy:`欄＝FATE 戰鬥機制非錢)、關係(2026-07 併入眾生列 BOND/REL_TAG/IS_PARTY/MAJOR_EVENT/REL_MEM，非獨立表)、肉體(PHYSICAL)/外顯(STATUS)。`play`(actionPlay) 仍用於 kanshou(NSFW)，**solo 戰爭走 narrate_only 不走 play**。
> **🎴 actionPlay 的 AI 回寫三閘(2026-06 新增、2026-07 拿掉 isNsfwMode 分支後改寫)**：`new_maps`(AI 加地點)／`recruited`(AI 招募入隊)／`rel_changes.fav_change`(AI 改好感)／好感渲染(❤️±N) 原本一律 `if (isNsfwMode)` 才生效，用來擋 solo 誤走這條路徑。2026-07 查證 `actionPlay` 已 100% 只可能被鑑賞呼叫（見下方「isNsfwMode 統合」條目），入口直接擋非 `KPC_` 呼叫，函式內部這四處 `isNsfwMode` 判斷已全部拿掉、恆定生效——**solo 依然完全不用這個函式**(全走 `narrate_only`)，地圖只走坤圖/移動、招募只走召喚·破戒奪僕·結盟、好感只走羈絆/補魔/結盟等 GAS 按鈕，行為不變，只是防線從「函式內部按旗標分支」搬到「函式入口按 pcId 直接拒絕」。
> **🧹→✅ 2026-07 玩家定案「isNsfwMode 也不用分模式了，統合起來」**：`actionPlay`(`Router_Narrative.gs`)查證後跟 `Engine_Combat.gs` 的 `buildDefaultSystemPrompt` 同款——這個函式現在只可能被鑑賞呼叫(前端自由聊天輸入框只在 `pc.mode==='kanshou'` 顯示，且鑑賞玩家的 `pcId` 恆為 `KPC_` 前綴，全專案已無 `'full'` 模式呼叫路徑)。函式入口新增一道守門：非 `KPC_` 直接 `return`（定位錯誤好過悄悄套錯規則），函式體內原本散落的 9 處 `isNsfwMode` 三元/if-else 分支(`formatTrait`、`PROMPT_ENV`/`PROMPT_GEAR`/`PROMPT_REL` 的整段 if/else、`aiConfig`、`aiLoc` 同步、`newlyRecruited`、好感 `change`、`intimacy_feedback.player`/`.npcs`、親密次數 `count`、好感渲染)全數簡化為單一版本，`driveOn`(🔥主動掌握) 不再需要 `isNsfwMode &&` 前綴閘門(反正函式已保證只有鑑賞能進來)。`isKanshou`(另一個變數，比對 `myGameId` 是否 `k_` 開頭，涵蓋舊角色無 `game_id` 的相容情境)**維持不動**——它跟 `isNsfwMode` 涵義不完全相同(理論上有極少數舊資料 `isKanshou` 可能為 false 而 `isNsfwMode` 為 true)，這次只處理確定恆真的 `isNsfwMode`，`isKanshou` 分支(【系統底層防呆】／💕鑑賞覆寫區塊)原樣保留。**🧹→✅ 好感渲染整段刪除(2026-07 玩家「拿掉吧」)**：`finalResponseText += ...❤️「${rc.target}」好感度...` 這段才是「好感度不要顯示在敘述介面上」要求裡唯一還活著、每回合都會真的顯示數字的地方(先前處理的 npc-card／互動選單banner 後來查證幾乎不可達，那次沒真正解決問題)——已整段刪除，純顯示用途、不影響 `rel_changes` 本身的好感數值寫入(那段在更上面的 `relChangesToProcess.forEach`，是資料權威來源，不受影響)。

**📐 架構確認(玩家提問「鑑賞收整在一起了嗎？只要判斷有沒有開火就好？solo應該走獨立呼叫？」)**：
1. **鑑賞(`actionPlay`)內部現在唯一還會變動的 runtime 旗標是 `driveOn`(🔥主動掌握/有沒有點火)**——`isNsfwMode` 已於本輪拿掉，不再是分支條件。
2. 另有 `isKanshou`(比對 `myGameId` 是否 `k_` 開頭)仍保留 3 處分支(`partyDetailsArr` 卡片格式／【系統底層防呆】／💕鑑賞覆寫區塊)，**這不是第二個「模式」，而是相容舊資料的防呆**：新建的鑑賞角色 `game_id` 一律是 `"k_" + Date.now()`(`Gallery.gs` `actionEnterKanshou`)，`isKanshou` 對現行資料恆為 true；但極舊、`game_id` 尚未補上的角色列會讓 `isKanshou` 落空，此時仍要能安全運作而不誤判成「敵我不明」——這是唯一保留它的原因，並非還有第二條敘事分支。若確定所有現存帳號都已補上 `game_id`(可查 `purge_orphans`/登入自動清邏輯有沒有順便回填)，這個防呆分支也可以評估收斂掉，但這次未動。
3. **solo 確認完全走獨立呼叫**：`actionNarrateOnly`→`narrateWithState_`→`callGeminiAPI(prompt, systemWithTrajectory, aiConfig)`，`systemWithTrajectory` 是 `actionNarrateOnly` 自己組的 `miniSystem` 字串，跟 `actionPlay`/`buildDefaultSystemPrompt` 完全不共用任何程式碼路徑；前端 `action:"play"` 唯一呼叫點(`Script.html`)也只在 `pc.mode==='kanshou'` 才顯示對應輸入框。兩軌從呼叫入口到 prompt 組裝，現在是徹底分離、互不干擾的兩條路。
> **🕰️ 鑑賞真實時間參考(2026-07)**：玩家反饋鑑賞刻意無遊戲內時鐘/AP(「一個更單純的世界」定案)，導致完全沒有時間流動感。與其另蓋一套模擬時鐘(又是新資料/新欄位)，改用 `realWorldClockStr_()`(Core_Settings.gs：`Session.getScriptTimeZone()`+`Utilities.formatDate` 抓真實月/日/星期/時段)，只在 `isKanshou` 分支的 prompt 多插一行「🕰️真實時間參考」，讓 AI 自然帶出時段氛圍(深夜靜謐/週五夜晚悠閒)，不刻意報數字、不影響相遇/日常設定判斷。零新資料、零新 MEMORY 標記，純 prompt 層級。solo 不受影響(依然吃自己的 AP/日/時鐘系統)。
> **🧭 solo 軌跡骨幹(2026-07)**：玩家反饋「歷史暫存是散文沒有骨架」——AI 要從敘事文字(300~500字的意象/比喻)反推現在精確狀態(好感多少/血量剩幾成/第幾天)容易猜錯，散文擅長營造氣氛、不擅長精準傳達數值事實。新增 `buildTrajectoryDigest_(pcData, gameId, pcRow)`(Core_Settings.gs)：用 `getClock_`(第幾天/行動力)＋`getPlayerSeals_`(令咒)＋同隊在世從者的好感/HP，GAS 直接組一句「已確定的事實」摘要(例：「聖杯戰爭第7日・行動力3/12。與從者「庫丘林」好感52(漸生信任)。從者剛歷經惡戰、氣血未復。令咒餘2道。目前位於「言峰教會」。」)。**接線**(`narrateWithState_`)：沿用該函式既有的一次整表讀取(組【當前狀態】那次)，零額外讀表；組出的骨幹接在 `miniSystem`(system 訊息)後面一起當 `systemOverride` 傳給 `callGeminiAPI`——`apiMessages=[system,...chatHistory,user]` 的組法讓骨幹結構上精準卡在「最近1輪對話」之前。**刻意只做「當下快照」、不做累積事件清單**：快照零成本(現場算、不存)；累積清單(如「一天總結」)會重蹈已砍除的「因果/命運長河」覆轍(存太多筆、AI 反而抓不到重點)，玩家已確認暫不加，只做快照這層。solo(`actionNarrateOnly`)專用，kanshou 走 `actionPlay` 不受影響。
> **🗑️ spare_npc(放過)＋打掃戰場(處決/放過昏迷者)已刪(2026-06)**：九州「擊昏→處決/放過」殘留，與 FATE「靈基崩潰消滅」矛盾；`execute_npc` action 早已不存在(死按鈕)。移除 `actionSpareNpc`＋router＋前端 `spareNpc`/`confirmExecute`/`renderBattlefieldCleanup` 及兩處呼叫。
> **🐛→✅ 「對話點名」跟「嚴禁強制互動」自相矛盾(2026-07 修)**：`npcDialoguePrompt` 原句「若有對話意圖，請包含『A、B、C』的對話」是無差別指令 AI 讓在場所有人都要出聲，跟緊鄰的「同地路人/嚴禁強制互動」標籤直接衝突——玩家只想找同行從者講話，卻可能被逼得連無關路人都插話。改成「姓名參考用」措辭：只提供正確姓名供 AI 拼字用，是否互動仍完全依【在場驗證鐵律】與各人的強制互動限制判斷。

---

## 4. 戰鬥引擎 Engine_Fate.gs ＋ actionFateBattle

### rank/數值
- `rankMul_(r)`：E10 D20 C30 B40 A50 EX60（+5每+,−3每−）/30 → 倍率。
- `rankBand_(r)`：rankVal+randInt(-10,5)，用於 AGI 命中/迴避擲值。
- `combatProfile_(c)`：依職階決定命中/傷害/迴避用哪個屬性。Caster→魔力(魔砲)、Archer→敏捷命中/筋力傷害(狙擊)、其餘→近戰。
- `rowToCombatant_(row)`：眾生列→戰鬥物件(含 np=MARTIAL寶具、six、fx)。

### 命中/技能
- `hasFx_(c,'xxx')`：該角色技能是否帶此 fx。`fxName_(c,'xxx')`：回傳實際技能名(防張冠李戴)。`hasTrait_`：特性(神性/王…)。
- `resolveFateBattle_(atk,def,opts)`：單次交手裁決。處理的 fx 標籤：
  `aim analyze anti_magic_lance burst chain clear_mind divine_age divine_core ea evade_ranged excalibur first_strike gae_bolg gob mad morale nullify_magic petrify projection rho_aias ride self_mod stealth str_up summon_horror tactics territory tsubame ubw unreadable wind_strike zabaniya`
  - **⚔️ god_slay(神殺／斯卡哈-Lancer，2026-07)**：對具「神性」之敵最終傷害 ×1.3~1.83(依敵神格階)。觸發＝`hasFx_(winner,'god_slay')` **或** 技能/特性名含「神殺」(雙軌·資料驅動)。斯卡哈走名觸發·阿爾喀德斯復仇者走 fx。對凡人無加成。**敵神格階全吃 `divineRankOf_(c)`(單一真實來源)**：god_slay／天之鎖縛神(chain)／對神寶具／瘟疫神性抗性全部同一函式判定。**2026-07 再修·納入 divine_core**：原本只取 `divine` fx 階級(查無則退特性/技能名含神性|神格|神靈者、再退C)，玩家發現漏洞——斯卡蒂神核(divine_core)明明 A 階、但她的「神性」只是無標階的特性(退回C)，等於擁有真神之軀卻被神殺當弱神打；已改成 `divine`／`divine_core`／特性名退階 三者**取階級最高者**(阿基里斯神性C但神核B同理取B)。查無任一者才回 null(凡人無此加成)。
  - **🔮 寶具預告制(2026-07·Router_Battle)**：敵寶具不再無預警秒殺——把原本決定敵寶具【當場發動】的條件(攻擊型寶具＋自身殘/我方殘＋urge骰＋付得起prana)改成先【預告蓄勢】，設 `【寶具預告】` 於敵 MEMORY(getNpTelegraph_/set/clear·Core_Settings)，下次接觸 `eTelegraphed→必發`。`npTeleHandled` 保證 rounds loop 一次決策。戰報彈「⚠️寶具預兆」。純防禦寶具(god_hand/理想鄉/rule_breaker對人)因 `eOffensiveNp` 為偽→不預告。
  - **💨 逃跑代價(2026-07·Router_Movement actionMove)**：離場格有敵人 `【寶具預告】`中→朝背影傾瀉 NP 級臨別重擊(`resolveFateBattle np:true`·85%挨到·騎乘−15%·保1)，消耗預告旗標＋補戰報進 worldRumors。優先於一般敏捷追擊。psvC 亦注入禮裝(Avalon 逃跑時也護)。**無預告時退回「六圍追擊」**(同函式、`if (!pursuit) allPcData.forEach(...)` 段)：撿離場格敏捷最高的敵從者，`chaserAgi>=psvAgi` 才追得上，機率 0.30(己方殘血<40%+0.20、騎乘−0.15、姿態±0.10，夾0~0.55)，命中即普通交鋒(非寶具骰)扣血、雙方保1。
    - **🐛→✅ 2026-07 修(玩家指出「撤離判定好像被改成只有寶具才發動」)**：六圍追擊那支物件原本沒有 `note` 欄位——`worldRumors` 只在 `pursuit.note` 存在時才推播戰報，導致這條路徑就算真的命中扣血，玩家也完全看不到任何文字說明，體感上「只有寶具預告那條看得到」。已補上 `note`(區分「追上得手」/「反手逼退」兩種文案)，兩條路徑戰報厚度一致。
  - **🩹 敵從者小幅自癒(2026-07·`ENEMY_REGEN_RATE_`·Time_World.gs `worldTick_`)**：玩家每次休息都靠 `applyRegen_` 全額回血回魔，但敵從者過去在戰鬥外完全沒有對應機制、傷勢會永遠停在原地；撤離又幾乎零成本(上一條)——兩者相加＝「打一下、撤退回滿、再打一下」保證磨死任何敵人(含11命的赫拉克勒斯-Berserker，battle_sim 實測：即使近種子頂級的自創角色，單次出戰≤9回合對他也是 0% 全滅機率，代表「巡迴磨血」本來就是唯一解法)，毫無風險，稀釋了「有些角色打不贏」與「隨便都能贏」這兩極的差別。已加：`move`/`rest` 兩種 world tick 每輪都給在世敵從者回 `ENEMY_REGEN_RATE_`×maxHP(不看同地/攻防、不隨玩家 rest 加倍)，跟 LOC 一樣整欄批次寫回、不加整表讀寫(不影響按鍵速度)——讓「無限次撤退刷血」不再穩贏，但仍留給有效率打法足夠空間。玩家原本以為的先例：`worldTick_` 舊有的「暗處從者廝殺」(offstage 7% 隨機殞落)一度也想過反向操作(讓死亡結果更合理)但太怪已作罷，這次改走「回血」而非「死亡判定」，同一份 tick 迴圈內加、無額外開銷。**⚠ 2026-07 二修**：初版 0.03(休息6h/2輪只回6%)玩家反饋太沒感覺，調到 **0.06**(休息6h回12%、12h上限回24%)——對比玩家自己休息6h回60% HP，敵人仍慢得多，但磨血刀有感、不再等於零成本。**⚠ 2026-07 三修(玩家要求整體複查+提速)**：`worldTick_` 的 LOC/HP 整欄批次寫回原本各輪(`for(rd...)`)自己跑一次，12h休息(4輪)就是4次個別 Sheets 寫入；已改成跨輪只累積 `anyLocDirty`/`anyHpDirty` 旗標，迴圈跑完後才各寫一次——`data` 全程原地改、跑完寫的仍是同一份最終正確狀態，純粹省去中途的重複寫入次數，不影響任何邏輯判斷(offstage廝殺讀的都是同一份記憶體`data`，不依賴LOC/HP何時真正落地到表格)。
  - **🗡️ Avalon-Saber 理想鄉(2026-07·Mystic_Code injectMysticBuff_)**：御主持「全世界之鞘 Avalon」禮裝 ＋ 從者為【阿爾托莉雅】→ 注入 `avalon_saber`(**被動＝鞘之基本減傷 npDefMul 0.82**·同一般 avalon)＋`regen`(時回)。名字比對 `/阿爾托莉雅/`＋cls Saber。非阿爾托莉雅持 Avalon→僅一般 avalon。
    - **🛡️ 理想鄉·完全擋寶具(被動自動·概念 7 階·專剋 6 階究極寶具·2026-07 定案)**：**無開關**——Router_Battle 敵擊前攔截：`enemyFireNp && hasFx_(avalon_saber) && offenseTier_(enemyNow,true)>=6 && 御主純魔≥100` → **完全擋下(不跑 fateStrike·eDmg 0·戰報敘述)＋扣 100 御主 MP**。理想鄉概念 7 階(CONCEPT_TIER 註解·不入 pierce 數學·以硬擋實現＝不可被任何概念貫穿)，**只為擋 6 階究極寶具(ea/enuma·碾穿一切一發秒人)而展開**；普通寶具(<6階)靠基本鞘減傷(×0.82)＋六圍扛。★攻防取捨：留 100 魔則擋、耗魔放自己寶具則擋不住。get_tags `canIdealRealm`→卡片資訊標籤「🛡️ 理想鄉·自動護盾」(showIdealRealm 純說明)。⚠ 注意敵多寶具預設 npChoice 0：恩奇都 option0=Enuma(6階·會觸發)，吉爾 option0=王之財寶(1階·不觸發·除非選 Ea)——敵預告時要否自動選最強寶具＝可續作。
  - **🌟 insight 全知全能之星(吉爾，2026-07)**：命中+4＋看破奇襲(併入 senseNegate·階級≥敵stealth)。中等被動·非傷害。
  - **🩺 2026-07 全面體檢批修(三路稽核·engine/battle/seed/creation)**：①**令咒必中根源修**——`opts.seal` 改在 `resolveFateBattle_` 內部強制 `atkWins=true`(damage 恆屬攻方)，拔掉 fateStrike_ 事後翻旗(原 bug：擲輸時拿敵方反殺傷害打敵方)；新增 `opts.forceHit`(對轟火力取樣用·同保證傷害歸屬)。②**survive 戰鬥續行**＝致命傷(after≤0)才觸發(原 after≤5 會把殘血 2~5 倒扣到 1)·三處同修。③**十二試煉** `lossN<=lives`(最後一命可用·餘0站起)；預設11註解修正。④**對轟**：清【寶具預告】旗標(原殘旗→下場無條件再必發)、回震夾至保1(原可打死殘血從者→勝敗雙記)、pPow/ePow 取樣用 forceHit。⑤**整備餐 buff** 只給我方出擊(原敵人反擊也吃)＋盟友 noMeal。⑥**fate_battle 目標驗陣營**(只可打敵從者/敵御主)；**actionMove 目的地驗坤圖**(堵地圖外安全屋)。⑦**殘存靈基【殘存】N**(get/setSoloReserve_)：無主單獨行動者的寶具儲備確實扣減(原永不扣→E階寶具無限放)。⑧**逃跑背擊**三漏：付 prana+出力100+反手改普通交鋒結算。⑨**休息夜襲**改用 worldTick 後重讀資料(原死人可偷襲+陣地反擊復活死者)；敘事用 `ambush.svName`。⑩**破戒奪僕**清殘留標記(【御主】synergy誤觸/【寶具預告】/【盟約至】/【靈基透支】)。⑪**AI 召喚防線**：fallback JSON 偵測(缺 realName/six 中止·原靜默寫入殘缺從者永久污染英靈殿)；sanitizeSix_ 承認 A++；AI np 字串規模上限對軍(對城/界/神種子專屬)；AI 分支補 MEMORY。⑫`servantNpOptions_` 改精確比對種子真名(原 indexOf→名含「無名」即繼承 Ea 選單)＋蒼白騎兵入多寶具表。⑬actionPlay 髒列寫回：從者/敵從者跳過 maxStatsForRow_ 重算(電池制 MP 恆 0·單一真實來源)。⑭種子：阿爾喀德斯拔矛盾神性A、美杜莎神性補 E-、蘭斯洛特補人類、Avalon 錯字。⑮interceptNote 死變數清除(後端+前端)。
  - **⚔️ excalibur 接回概念5階(2026-07·v37)**：阿爾托莉雅/美遊 種子 skills 補掛 `fx:'excalibur'`(單寶具簽名 fx 掛 skills 是既定模式：庫丘林 gae_bolg/EMIYA ubw/佐佐木 tsubame)。此前全專案零產生者→誓約勝利之劍解放拿不到 CONCEPT_TIER 5、無法概念壓制(陣地/對魔力/神核)、敵寶具對轟(CLASH_OFF_FX)也漏她。**通則：新增單寶具種子時，簽名概念 fx 必須掛進 skills——只寫 np 字串＝只有規模、沒有概念位階。**順修美遊 np 字串「對城 A++」→「對城 A」(對齊 six.寶具)。
  - **🐾 sense 氣息感知(恩奇都，2026-07)**：**守方**專屬——`hasFx_(def,'sense')` 且 `rankVal(sense) ≥ rankVal(攻方 stealth)` → 攻方氣息遮斷者的奇襲**命中先機(line ~425)＋要害一擊(×1.2~·line ~504)全數失效**(`senseNegate` 旗標橫跨兩處)。貼原作「近距離廢掉同級以下的隱形」。刺客偷襲恩奇都會被一眼看穿。
  - **🏷️ 金羊毛式無數值標籤(golden_fleece／double_summon…)**：招牌傳說但戰場使不出的能力(金羊毛=Caster 駕馭不了的召龍寶具；二重召喚=雙職前提·效已分呈於各技；頭痛宿疾=弱點)——**只掛 FX_DESC 酷炫說明、引擎完全不讀**。新增此類＝Seed 掛 fx 名＋Script.html `FX_DESC` 補一句，勿接任何引擎讀取路徑。
  - **🏰 home_field 主場·陣地結界(陣地作成強化·2026-07)**：玩家於【自己 set_workshop 佈設的陣地】決戰、且隊上有【陣地作成】從者 → 全隊 DEF_FX_ home_field 額外減傷 `×(1−0.16r)`(r=陣地作成 rankMul·EX空中庭園≈−32%/A−26%/C−16%)。`homeTerritoryRank_`(Router_Movement·比對 workshop loc==battle loc＋掃隊上 territory 最高階)→`injectHomeField_` 注入我方從者(atkC/sC/defC 三注入點·同 injectMysticBuff_)→ctx.homeField 傳遞。pierceKey 'territory'(超位階概念 ea/enuma 仍碾穿)。引敵入陣地決戰的主場優勢·讓陣地作成階級終於有份量(原本 territory 走到哪都 ×0.74·與地點/階級無關)。report.homeField→前端綠框＋AI 主場敘述。
    - **🏕️ 陣地＝安全港·反擊(2026-07)**：`enemyAmbushOnServant_`(休息/補魔/刷好感/盟誼 共4呼叫者) 開頭加判定——玩家於自己陣地(homeTerritoryRank_>"") 且御主純魔 ≥ wardCost(20+階×0.6·~30~55) → 不挨突襲：扣魔＋從者反擊擊退潛入者(敵扣血·保1不斬)＋回 `{homeRepel:true, repelNote, report:{homeRepel:true}}`。呼叫端：`ambush.homeRepel ? repelNote : 原突襲prompt`＋休息仍可做夢(`!ambush||ambush.homeRepel`)。前端 renderFateBattleReport 早退分支渲染綠色反擊卡。魔力不足則結界失效·照常挨突襲。解決「睡覺/補魔/刷好感被突襲驚醒」＋陣地有戰略價值(安全港)。
  - **🛡️ rho_aias(七天盾·羅·埃亞斯／EMIYA，2026-07 改制)**：**只對【攻方寶具解放】的一擊反應性展開**(`DEF_FX_` `npOnly:true`·普攻不觸發不減傷)，展開時守方減傷 ×(1-0.40×階級係數)(C=×0.6/A=×0.33)；**玩家側每次展開扣御主 30 魔**(`mana:30`·呼叫端注入 `_shieldMp` 才收費、付不起張不開；敵方免費=敵AI戰鬥本色慣例)，帳單由 `settleShieldMana_`(Router_Battle) 統一落表——收費點：fateStrike_ 守方注入／寶具對轟 ePow 取樣／Router_Movement 背擊。遭超位階概念(ea 等，`pierces('rho_aias')`)貫穿則失效。改制動機：常駐盾+燕返組合模擬實測普攻流對全池 100% 勝率。
  - **🗡️ stealth 首擊奇襲(2026-06 改)**：氣息遮斷**只在 `opts.ambush`**(開場第一擊／敵突襲)生效·**吃階級**(命中 +rankVal/10·A+≈6 A-≈5)，非首擊不再享(交手即破功·貼原作)。命中**＋傷害**(普通首擊 ×~1.4 要害·吃階級)，但開場放寶具(opts.np)則走寶具爆發不疊。旗標鏈：`actionFateBattle` opening&&isActive → `fateStrike_` → `resolveFateBattle_(...,{ambush})`；敵突襲 `enemyAmbushOnServant_` probe 傳 `ambush:true`(本就 mul×1.4)。
  - **🐙 summon_horror(螺湮城教本／青鬍子)＝【變身框架】(2026-07 重構·狀態機化＋魔力供養制)**：從「本場解放才在場」變成**無期限的變身態**——單一狀態源＝MEMORY`【海怪護盾】cur|max|expiry`(**expiry 0＝無期限**·非0=舊制碼表存檔過渡)。**碼表已拔(玩家定案)：維持全走魔力經濟**。
    - **入場兩路**：①戰鬥中解放寶具(`actionFateBattle` useNp)②**戰前召喚 `summon_horror_beast`/`actionSummonHorror`**(不進戰鬥·付寶具 prana＋1AP)。**退場三路**：①肉身被打光②魔力供養不起(見下)③**玩家主動解除 `dismiss_horror_beast`/`actionDismissHorror`**(免費即時不耗AP·止住時耗·重召須再付全額 prana)。前端卡片 `s.canSummonHorror`→🐙召喚海怪鈕／`s.horror`→🌊解除海怪鈕(互斥)。
    - **在場＝變身態(四效果全綁狀態)**：①**擋傷**`fateStrike_` 先扣海怪潰散才傷本體(2026-07 修：此段原本完全不查 pierces()——`summon_horror` 在 `CONCEPT_TIER` 登記與 `rho_aias` 同 4 階、唯 6 階 ea/enuma 可貫穿 rho_aias，海怪護盾卻無視一切攻擊；現用同一份 `offenseTier_/conceptTier_/PIERCE_GAP` 算貫穿，高階概念寶具可直接無視護盾，一併推 fired 訊息)；②**再生**每回合 `HORROR_REGEN`(+10)；③**追擊**horrorC(A/A巨獸)每回合並肩咬、抽御主 `HORROR_UPKEEP`(10·※原30)·付不出潰散；④**對城防**`npDefScale_` 吃 `c.horrorUp`(rowToCombatant_ 讀 MEMORY 現存肉身)→**只變身時**本體享對城防禦規模。
    - **⏳ 時間維持費(取代碼表)**：`HORROR_HOURLY_UPKEEP`(8)——`applyRegen_` 支出多一張嘴；**池赤字時【海怪先沉回深淵、才輪到御主燃血】**(deficit 分支先 clearHorrorShield_＋logWarEvent_ 再重算收支)。HUD 收支 `playerServantEconomy_` 同步計入(掃全隊·回 `horrorUpkeep` 欄)。
    - **狀態源＝single truth**：`horrorPresent_(mem,gid)` 判在場(expiry 0 恆真·非0舊檔查時鐘)；舊檔逾時殘影由 `clearExpiredHorror_`(戰前入口)＋regen 逾時分支＋維持費潰散 三處清乾淨。常數 `HORROR_SHIELD_HP`300/`REGEN`10/`UPKEEP`10/`HOURLY_UPKEEP`8。
    - **helper**：`getHorrorShield_/setHorrorShield_(mem,cur,max,exp)/clearHorrorShield_/horrorShieldView_(mem,gid)→{cur,max}|null`＋`horrorPresent_/summonHorror_/clearExpiredHorror_`(Router_Battle)。前端 servant payload `horror:{cur,max}`→體力條下 `🐙海怪` 藍紫血條(`horrorBar`)。
    - 青鬍子寶具模式敵方 1%→23%；普通/技能仍0%(無寶具=無海怪)。
    - ⚠ **已知後續**：`enemyAmbushOnServant_`(夜襲/卸防突襲)與撤離追擊直接扣 HP、不走海怪護盾——變身態下睡覺仍會被突襲(shield 不擋 ambush)。要補＝ambush 路徑加護盾吸收＋4 個 caller 訊息處理 −0 情況。
    - 🧩 **變身通用範本**：MEMORY 狀態旗標→`rowToCombatant_` 注入 `c.xxxUp`→引擎讀旗標調攻防；日後靈基二階段/化身切換照此複製(狀態源＋戰前 action＋in-battle 觸發＋逾時清理 四件套)。
- **📊 全戰鬥都有戰報卡(2026-06)**：① `renderFateBattleReport` 舊 guard `!r.rounds` 會擋掉【無回合】的斬首/突襲報(等於斬首戰報一直沒顯示)→改 `if(!r)`。② 新增**突襲戰報卡**(`r.ambush`)：`enemyAmbushOnServant_` 回 `out.report{ambush,enemyName,svName,dmg,after,svHpMax,destroyed,defeat}`，rest/mana_supply/scavenge/scout 四個 caller 都把 `report` 帶回前端並 `renderFateBattleReport`＋補 defeat 處理。
- **🎬 AI 敘述瘦身(2026-06)**：戰鬥/斬首 prompt 由「★務必演出X」一長串指令 → 改【事實素材列(·)＋單行收尾steer】，給 AI 數據讓它自己演(show-don't-tell)，不報菜名、不堆指令。海怪/對轟/令咒/電池/十二試煉/盟友皆改為事實行。
- **⚠ 突襲戰報卡別綁死攻擊手法(2026-07)**：`renderFateBattleReport` 的固定文字卡(GAS 掌數值的領域)原寫死「門戶大開時被狠狠貫穿」，暗示「刺穿」這個具體手法，但突襲者不一定用穿刺類武器(如咒腕之哈桑是異形右手／詛咒抓握，不是貫穿)——跟 AI 敘述(真的會依攻擊者實際身份演出正確手法)矛盾。改成手法中性的「遭狠狠重創」，`Router_Bond.gs`/`Router_Economy.gs` 對應的 aiPrompt 素材列「一記重擊狠狠貫入」同步改「狠狠命中」，三處都別再預設穿刺。
- **⚠ 同一類 bug 系統性複查(2026-07)**：使用者要求「提示詞務必依按鈕/當下實際情況填入」，複查後再抓到 3 處：①`Script.html` `servantStrike` 的 `useSeal` 分支寫死「必中斬向」，未像旁邊 `_plain`(一般出擊)那樣依 `myServantCls` 分 Caster/Archer/其他——改成 `_sealVerb` 同步依職階分支(轟向/鎖定/出擊)。②`Router_Battle.gs` 勝利記錄(`recordHistory_`/`logWarEvent_`)寫死「斬盡所有敵對從者」，任何職階(含 Caster/Archer)獲勝都留下「斬」的永久戰績——改「擊破所有敵對從者」(呼應同函式內個別擊殺已用的中性「擊破」)。③`Router_Battle.gs` 寶具對轟(`clash`)的 `logWarEvent_`／`aiPrompt` 寫死「光潮貫穿對手」，但對轟資格含 zabaniya(暗殺系)/petrify(石化)/chain(束縛)等非光束型寶具——改「威能壓過對手」，不再預設光束/貫穿意象。
  - **🐛→✅ 「生死由御主後續定奪」誘發AI杜撰饒恕戲(2026-07，兩輪修正)**：戰鬥未分生死時(`finalLine`＋「敗方尚有餘力」那行)，舊措辭「生死由御主後續定奪」被AI讀成「該演一場御主做決定的戲」，於是自己編出「御主下令收手／饒過對方」的橋段——玩家根本沒按過這個決定，且下一次繼續攻擊時故事還接不上(說要饒命、下一擊又補刀補死)。**第一輪修正**改成純陳述＋「不可杜撰御主下令收手/饒過對方」——但玩家馬上抓到這句本身又把「收手/饒過」兩個具體詞遞給AI了，同一個坑換位置重演。**第二輪**改成完全正面陳述：「此乃御主下令出擊、雙方仍在交鋒中，下回合是否再戰仍由御主決定」，不提任何「收手/饒過」字眼。
  - **📐 這類坑的通用判準**：本次session連續抓到 4 次同一種問題(腐臭味／赫拉克勒斯盔甲範例／職階刻板印象清單／收手饒過橋段)——**任何「禁止/不可/勿」後面接一句具體、可引用的畫面或台詞範例，都有被AI誤讀成「該演這段」的風險**；純結構性規則(如「只輸出合法JSON」)或抽象規則(如「禁替玩家做決定」，不再往下舉具體場景)則安全。日後新增/檢查提示詞，優先看有沒有踩到這條線；已知還有兩處同款疑點但風險較低、已一併修掉：`Router_Narrative.gs`「若在場人物有同行夥伴...【絕對禁止】推演為冷血路人！必須...外冷內熱/假意嗔怒/佔有慾」與「【絕對禁止】主動迎合、發情或瞬間屈服！必須...抗拒、屈辱、咬牙切齒或冷嘲熱諷」，皆改成不點名具體反應、只要求「依性格與好感度真實反應」。`nsfwBaseRules`(紅線①，Engine_Combat.gs)的兩處同款寫法(禁止陽剛形容詞清單／禁止男性模板動作清單)——**2026-07-02 玩家明示授權後已修**：改為正面陳述＋抽象禁令(「恆保女性柔美質感」「禁任何男性化強硬支配模板」)，不再遞可引用的具體詞；機制/其餘字句原封不動。紅線①對其他改動仍然有效。
  - **🗑️ 移出種子(2026-06)**：`大仲馬-Caster`(亞歷山大·仲馬)＋`漢斯-Watcher`(安徒生)——純支援·無攻擊寶具(1v1 恆敗、非戰鬥從者)，移出 SEED_SERVANTS。FATE_FAKE_ROSTER 的偽戰 Caster 由大仲馬改派`玉藻前-Caster`。種子 35→33。
  含：職階相剋三角(KNIGHT_BEATS +命中+傷害)、對魔力減魔砲、territory 防壁、divine_age 繞 MR、zabaniya 致命(×1.9+70)、gae_bolg 因果必中、petrify 石化、projection 被動加成(EMIYA) 等。
- **🎴🎯 六圍降權＝角色速寫(2026-06核心哲學)**：TYPE-MOON 官方：參數是「讓人理解這從者」的速寫，非戰力試算表(庫丘林六圍頂尖卻幸運E→運氣/故事才是裁判)。舊版命中/迴避用 `rankVal`(差距50)當主導項→差兩階就鎖死→必然極化(模擬 76% 越界)。修正：
  - **命中** `= d20 + rankTier(hitStat)×K_STAT(2.5) + rand(-3~3) + outMod`（hitStat：Caster魔力/其餘敏捷）。階差壓到~12，d20(運氣)重新主導。
  - **迴避** `= d20 + (rankTier(敏)×0.65+rankTier(耐)×0.35)×2.5 + rand(-3~3)`：拆「敏捷雙吃」＋降權。
  - **傷害 flat** `rankVal×0.8→×0.6`：避免高階一發轟死。
  - 模擬結果：普通/技能 **76%→29% 越界**(大多對局回 28~77% 健康區)；寶具 74%→52%(climactic NP 層較swingy屬正常)。
- **🍀 幸運上演逆轉(2026-07 線性化)**：自指變異(非對拼)——以 C(30) 為中性零點、每離 1 階 ±2% 機率：低於 C 每擊觸發「天不從人/命運捉弄」(-10)、高於 C 觸發「福星眷顧/絕處逢生」(+8)。E4%/D2%/C0/B2%/A4%/EX6%(A+ 等修飾符連續計)。製造爆冷與劇情感(庫丘林詛咒/Saber福星)，不讓高運方持續輾壓。舊制(2026-06)為 ≤D 恆8%/≥A 恆8% 三檔階梯——C/B、E/D、A/EX 同檔零差別，工房同檔加 10 點＝價格陷阱(模擬：E22.9=D22.8＜C27.7=B27.6＜A33.6=EX33.4)，故線性化讓六階每階皆有真效果。
- **🎚️ 被動技能fx命中/迴避淨加成上限(2026-07·HIT_FX_CAP=8)**：resolveFateBattle_ 內 直感/心眼/千里眼/騎乘/變化/避矢/王財/洞悉/自我改造/狂化/魔眼/天之鎖/燕返/愛之痣 等被動 fx 先入 aHitFx/dEvaFx 累積器，各自 clamp ±8 再入命中/迴避(截斷時推「疊加已達極限」fired 標籤)。**不入帳**：出力/整備/過充/主動技(耗魔)/禮裝/職階相剋/幸運骰/奇襲先機(一次性)。動機：工房「敏EX+變化A+直感A+以巧破力」堆疊流互鬥無天敵(98.9%)；同梯次加 **以巧破力全能稅×0.85**(見上)。A/B 實測 cap6 只多壓 1pp 但全種子池被削 2~3pp，故取 8。改後該流 對種子池 普攻97.9→93.0/寶具76.6→70.1。⚠殘留：純工房互鬥的普攻切片他仍近乎無敵(優勢主體=敏EX六圍區間非fx；工房無 王財/天之鎖 級反迴避工具)——解=寶具戰(有妄想/盾龜等天敵)。
- **🩸 必中之槍非全無解(2026-06·gae_bolg)**：`atkWins = gaebolg ? !gbEvaded : (aHit>=dEva)`。必中閃避機率 `gbEsc`＝幸運(A+0.35/A0.22/B0.10)＋直感或心眼(first_strike/analyze 0.15)＋變化(shapeshift 0.10)，夾上限 0.6。一般從者照樣被釘死，唯「能改寫命運/超越感知」者搏一線(貼原作)。令咒·絕對命令的必中【不受此影響】(玩家王牌仍絕對)。
- **⚠ first_strike/analyze 是同一組判定變數(`||`短路)、不會疊加**：`Engine_Fate.gs` 命中先機那段 `var fsA = hasFx_(atk,'first_strike') || hasFx_(atk,'analyze')`——兩個 fx 只是「直感」「心眼」的不同命名，同一角色若兩者都掛，效果永遠只算一次(取 first_strike 那階，`fired` 標籤卻可能顯示 analyze 的名字，兩者階級不同時會出現「戰報寫的技能名≠真正生效的技能」)。**🐛→✅ 2026-07 修**：理查一世-Saber(`Seed_Codex.gs`)v42 校對時誤補了「驥足百般(analyze)」與既有「神速(first_strike)」同掛，兩者完全互相蓋台——已把驥足百般改純演出(`fx:''`)，神速(信心確立的正史技能)保留。**日後任兩個 fx 若共用同一判定變數，一律只能擇一掛給同一角色**，不要指望資料自律，最好比照這次順手查一次 grep 有無其他角色重蹈覆轍。
- **🔧 平衡補丁(2026-06)**：①`divine_age`(神代魔術)＝**完全無視**對魔力(原只半減)，救美狄亞；②`fast_cast`(高速詠唱)+12×rankMul 傷害；③`ubw`(無限劍製)`npAtkScale_`＝**對城**級(規模階5→可多燒狂戰十二試煉命，救 EMIYA 對狂戰；非對界，避免對人一發秒)；④`npBaseDice_` 下修(A20→13d10/EX30→18d10…)；⑤`NP_SCALE_MATRIX` 壓縮(max ×3.0→1.7)避免大規模寶具秒小規模。
- **🎲 D&D 傷害骰(2026-06)**：`rollDice_(n,sides)`＋`rankTier_(r)`(E1→EX6)。
  - 武器骰(每擊)：`base = round(rankVal(主屬性)*0.5) + rankTier d8 + 命中分差*1.2 − 耐久/2`。
  - 暴擊(擲20)：多骰一輪 `rankTier d8 +12`(取代舊固定 +30)。
  - 寶具骰：`npBaseDice_(寶具階)`＝E3d10/D5d10/C8d10/B12d10/A20d10/(A+·A++)22d10/EX30d10；另加 `rankVal(寶具)*0.6+10`。
  - ⚠ **EX 嚴格判定(2026-06 修)**：`rankVal('A++')=60` 與 EX 同值，故 `npBaseDice_/npPranaCost_` 改用字串 `/EX/` 認 EX；**A++ 算 A 階**(22d10/prana500)，否則 Saber 誓約勝利之劍(A++)會被收 EX prana800 而永遠放不出。
- **🔱 概念優先權 Priority(2026-06)**：`CONCEPT_TIER{}`(**ea·enuma6** / excalibur·divine_age·rule_breaker5 / ubw·anti_magic_lance·gae_bolg·**summon_horror·rho_aias**4 / god_hand·tsubame·zabaniya·petrify3 / nullify_magic·divine_core·territory2)。`offenseTier_(c,isNp)` 取攻方最高進攻概念階；`pierces(防禦fx)`＝攻方階≥防禦階+`PIERCE_GAP`(2)→該防禦(territory/神核/對魔力)被無視(概念壓制)。把舊「破魔無視神核」系統化＋ ea 凌駕一切。
  - **🌟 2026-07 根源修**：`offenseTier_` 除了掃 skills(hasFx_)，**也把「本次解放寶具自身的概念」計入**(`conceptTier_(npProfile_(c).fx)`)——因寶具真名 fx 存在 `servantNpOptions_` 而非 skills，原本被 hasFx_ 漏掉，導致**吉爾 Ea 竟吃不到 tier-6 概念壓制**(已一併修好)。`enuma`＝恩奇都 Enuma Elish(天之楔·可匹敵乖離劍)，6 階；恩奇都改為多寶具(Enuma Elish 對界·enuma／民之睿智 Age of Babylon 對軍·gob)。
- **🏰 寶具規模相剋矩陣(2026-06)**：`npAtkScale_`(對人/對軍/對城/對界，由寶具名或 ea→對界/excalibur·ubw→對城 推)×`npDefScale_`(由 ubw/神核/god_hand/territory 推) → `NP_SCALE_MATRIX` 倍率(**已壓縮：對城打對人×1.5、對界×1.7、min×0.4**；非舊×2.5/3.0)。`ea` 寶具：×1.7+4d12+80。
  - **🗡️ 秘劍・燕返(tsubame)——現制(2026-07 四修·玩家定案)：僅【每場戰鬥第 1 回合】發動、寶具段無疊乘、價 60**——`opts.round`(fateStrike_ 由 actionFateBattle 回合迴圈傳 `rd+1`；未傳=單次交鋒視同首回合，如背擊/追擊/probe)===1 時才吃 迴避-5＋普攻傷害×2.3；第2/3回合命中/傷害段皆不觸發。寶具解放段【無傷害疊乘】(×1.0·只留 fired 演出標籤＋概念位階3/貫穿)。工房價 60(FLAT_FX_/FORGE_FLAT_FX·「回回×2.3」時代曾漲到100，限首回合後降回)。動機：玩家實測「以巧破力+七天盾+燕返」普攻流模擬對全池 100% 勝率——回回×2.3 是主兇，改「絕技一閃」節奏(每按鍵一場3回合、僅首回合爆發)。battle_sim duel/roundrobin 以 `((round-1)%3)+1` 映射模擬此節奏。沿革：一修(2026-07)從「僅寶具解放時」改為每次攻擊皆觸發(救小次郎普攻吊車尾 22%→77%)；二修 寶具段×2.3→簽名×1.5；三修 平A段限首回合＋價100；四修 價回60＋寶具段×1.5→拔除。
  - **⚔️ 對神(弒神寶具，2026-06)**：第5種尺度 keyword，**不入矩陣**(特判)。對「神性」之敵(`loserDivine`)×2.4 單體特大(弒神)、對凡人僅×1.15。迦爾納梵天弒神之槍 Vasavi Shakti 用此(多寶具選項，見 `servantNpOptions_`)。注意引擎無「對城/對軍↔對神」矩陣交互，純看守方有無神性。
  - **🌟 多寶具英靈(`servantNpOptions_`)**：斯卡哈L／吉爾(王財·**Ea對界核爆**)／伊斯坎達爾／EMIYA(UBW對城·偽螺旋劍)／**迦爾納(Vasavi對神·Kavacha對人)**／恩奇都／蒼白騎兵。首項=主寶具(敵方預設用)。玩家 set_np_choice 選。
  - **🎴 六波(2026-07·玩家查證原作官方階級)：拆開「兩寶具共用六圍表同一數字」的失真**——原本不論選哪個寶具，傷害骰/耗魔/超載上限全吃六圍表寶具值(一個值服務兩個原作階級不同的寶具)。5 位查有官方來源(逐一 WebSearch/萌娘百科交叉核對，含玩家自行提供的角色卡原文)的英靈已補 `servantNpOptions_` 各選項專屬 `r` 階級：
    - 吉爾伽美什：王之財寶 A++／乖離劍Ea **EX**（原共用EX，王財被高估）
    - 斯卡哈-Lancer：貫穿死翔之槍 **B+**／Gate of Skye A+（原共用A+，貫穿死翔之槍被高估兩階）
    - 伊斯坎達爾：王之軍勢 **EX**／神威的車輪 **A+**（原共用A++卡兩者中間；⚠ 王之軍勢EX**高於**六圍表A++本身——原作允許單一王牌寶具超越角色頭銜數字，`rankVal(A++)==rankVal(EX)==60`但`npBaseDice_`/`npPranaCost_`皆有`/EX/i.test()`字串判定搶在數字判斷前，EX仍嚴格強於A++(24d10/300魔 vs 20d10/220魔)，不會混淆也不會跑不動）
    - 迦爾納：Vasavi Shakti EX／Kavacha and Kundala **A**（原共用EX，黃金鎧被高估；玩家一度提議黃金鎧也是EX，經二次查證含玩家親貼角色卡原文確認為A，未採信）
    - 蒼白騎兵：Doomsday Come EX／Kagome Kagome **A**（原共用EX，籠中之鳥被高估）
    - **刻意不修**：恩奇都(Enuma Elish A++~EX／Age of Babylon 同型寶物庫封頂A++附近，兩者本就相近，落差輕微不急迫)；EMIYA(玩家貼出官方角色卡原文——多數投影寶具含七天盾原型官方本就標「???」未定階，寶具參數欄位本身是「－」未評級，UBW/干將莫邪僅"E~A++"浮動範圍非固定值，硬套固定階級＝捏造原作沒有的數字，維持現狀六圍表B不動)。
    - 實作：`npProfile_(c)` 回傳值加 `r`(多寶具讀 `op[idx].r||c.six['寶具']`；單寶具retreat`c.six['寶具']`)＋新增 `npEffectiveRank_(c)=npProfile_(c).r` 單一真實來源。`resolveFateBattle_` NP傷害段 wRelease(解放者本人)吃`atkNp.r`、對手反殺(!wRelease)維持吃六圍表(既有行為不變)。`Router_Battle.gs`/`Router_Movement.gs` 全部 6 處 `npPranaCost_`＋1 處 `npOverloadCap_` 呼叫點(玩家攻擊底費/超載上限/敵開場對轟/敵反擊預告/敵反擊發動/背擊)改吃 `npEffectiveRank_`；`summon_horror`(深淵海怪召喚)那處 `npPranaCost_(svC.six["寶具"])` 不屬多寶具選擇範圍、維持不動。battle_sim 驗證：吉爾伽美什王財選項平均傷害410、Ea選項1459(真正拉開差距)；roundrobin np模式 5 位排名健康(56~82%，無人爆衝崩潰)。
  - **🦠 病死宿命(疫病克制，2026-06)**：攻方帶「疫病」trait(蒼白騎兵)＋守方帶「病死宿命」trait(恩奇都·原作病死) → **scaleMult=3.0·無視規模防禦**(概念碾壓·重演宿命之死)。優先於對神/矩陣判定。要擴充就給該從者掛 `{n:'病死宿命'}` trait。
  - **🦠 對瘟疫抗性(蒼白弱點，2026-06)**：守方持「對魔力≥B」或「神性」trait → 蒼白騎兵(疫病)傷害 **×0.5**(神之加護/魔術防護擋疾病)；**病死宿命之敵例外**(不受此減·照樣被碾)。蒼白寶具 EX→**A**(削弱·488/凡人·152/神性)，定位＝屠無防護凡人從者、被神性/魔抗剋。
- **🔋🔋 出力電池制(2026-06 大改·玩家定案)**：**從者【沒有自有魔力池】**(召喚時 MP/MAX_MP=0)，全靠御主供魔。**御主MP＝唯一且持續的魔力資源(電池)**。從者有「靈基出力檔位」(玩家旋鈕，20/40/60/80/100，存從者 MEMORY【出力】，預設60巡航)：
  - `outputTier_(pct)`(Core_Settings)→`{hit,dmgMul,drainMul,np,label}`五檔：100%(+3/×1.3/×2.0/可放寶具/全開)、80%(+1/×1.1/×1.5/高壓)、60%(0/×1.0/×1.0/巡航)、40%(-2/×0.85/×0.6/節流)、20%(-5/×0.7/×0.3/維持)。`snapOutput_`吸附、`servantOutput_(memory)`讀、`setServantOutput_(memory,pct)`寫。
  - `resolveFateBattle_`：`atk.output`(rowToCombatant_ 從 MEMORY 讀)→`outMod=outTier.hit`(命中)；勝方傷害 `base×outputTier_(winner.output).dmgMul`。
  - **寶具僅出力 100% 可解放**(`actionFateBattle` 閘：`servantOutput_<100`→擋並提示)。前端 `servantStrike(useNp)` 自動先 `set_servant_output:100`(解放寶具＝全開)。
  - **set_servant_output** action→`actionSetServantOutput`(免費即時，不耗AP)。前端從者卡「🔋靈基出力轉盤」5鈕；`get_tags` servant 物件帶 `output/outputLabel`。
- **👑 王之財寶(gob) 常駐被動(2026-06)**：吉爾伽美什不再把 gob 當主動技——`resolveFateBattle_` 內**每擊**命中+5 ＋ `gobVolley_()`(50d3 捨去1，EV≈83)無盡兵裝彈幕傷害，不論模式都壓制全場。模擬：金閃普通模式對全場 31%→**80%**(回到 top3，貼合原作「最強之一」)。其主動技槽自動落到鼓舞(morale)。
- **⚡ 從者專屬主動技(2026-07 大改·單層歸屬)**：`servantActiveSkill_(c)` 現在**只給 3 種原作真·意識施放技術**、且**每個 fx 只活在單一層**(消滅 double-dip)：
  - **⚡主動 only**(下方 `resolveFateBattle_` 被動層已【移除】其加成)：`burst 魔力放出`(傷×`1+0.45×rankMul`)／`str_up 怪力`(傷+`8×rankMul+14`)／`projection 投影`(命中+2、傷+`5+0.12×寶具rankVal`·2026-07 下修見下方⚖️)。rank 尺度折進主動值(舊「被動＋主動」合計威力→改按下才拿、隨技能自身階級成長)。
  - **🛡被動 only**(從 `servantActiveSkill_` 候選拔除、只留 `resolveFateBattle_` 被動)：`morale 卡里斯瑪`(常駐氣場·傷+3×rankMul·敵透化免疫)／`aim 千里眼`(恆常眼力·命中+4×rankMul)／`self_mod 自我改造`(定型軀體·命中+2傷+3)。
  - **無真·施放技術者 `servantActiveSkill_` 回 `null`**(不再有通用「集中」備援)→前端 `previewActiveSkill_`/`myActiveSkill` 據此**不顯示⚡主動技鈕**；`actionFateBattle` 對 null skillBuff no-op 不扣魔。
  - **敵AI無按鈕→自動施展招牌施放技術**(免費·戰鬥本色)：`Router_Battle.gs` 敵反擊 `fateStrike_(...,{skill:servantActiveSkill_(enemyNow)})`＋`Router_Movement.gs` `enemyAmbushOnServant_` `resolveFateBattle_(...,{skill:servantActiveSkill_(enemyC)})`——精確還原「改制前這些是免費被動」的敵方戰力，避免單層歸屬悄悄削弱敵人(玩家側才改為主動付魔)。
  - **對魔力交互**：`atkMagic` 的 burst 判定改為 `opts.skill.id==='burst' && winner===atk`(實際發動魔力放出才算魔術系一擊)，非光憑持有——否則沒發動只吃對魔力減傷卻無 burst 增益。
  - **前端 UI(玩家一看即懂)**：從者卡技能膠囊——主動技(burst/str_up/projection)標**青色`#7ec8ff`＋⚡前綴**(`ACTIVE_FX_JS`)，被動技維持金色；提示行加「⚡藍標＝主動技(普攻無加成，須點⚡發動)」；`FX_DESC` 三招標「(⚡主動技)…★普攻無加成，須主動點發動、耗魔力」，被動三招標「(被動)…每擊自動生效」。⚡主動技鈕改**顯示招式名**(如「💥 魔力放出」)、僅對有真·施放技術的從者出現。
  - `actionFateBattle` 啟動耗魔 `200×mpPct`(30/24/24)→`drainForNp_` 抽御主。
  - **🎚️→🔘 改回「按鈕制」(2026-07 二度定案·推翻開關制)**：開關制(存 MEMORY【主動技】on/off)手機上難按、切換本身還多一趟 round-trip——玩家定案改回**攻擊列第4顆「⚡主動」按鈕**，跟 💥寶具/❖令咒 同一套「按下當次生效」模式：
    - **按下**＝`fate_battle` 夾帶 `userData.skill=true` →該次交鋒【全效】發動＋`drainForNp_` 扣魔【一次】(該區塊在回合迴圈外只跑一次)。**未按**＝`tinyActiveSkill_(full)` 微量被動(`ACTIVE_SKILL_TINY_`=0.35 倍)、**免費**。同趟夾帶、零額外 round-trip；與寶具互斥由前端按鈕天然保證(一次只按得了一顆)。
    - `actionFateBattle`：`_fullSkill=servantActiveSkill_(atkC)`；`userData.skill`→`skillBuff=_fullSkill`＋`skillActivated=true`＋扣魔；否則→`skillBuff=tinyActiveSkill_(_fullSkill)`。report/aiPrompt 的「主動技發動」宣告吃 `skillActivated`；fired 明細標籤 tiny→「(微量)」、full→「(主動技·全開)」。`atkMagic` 的 burst 判定含 `!opts.skill.tiny`(微量魔力放出不算魔術系一擊)。
    - **敵AI**：`servantActiveSkill_(enemyNow)` 恆走**全效·免費**(敵無按鈕·戰鬥本色)，維持敵方戰力不變。
    - **已刪的開關制機件**：`activeSkillOn_`/`setActiveSkillMode_`(Core_Settings.gs)、`actionSetActiveSkill`＋action `set_active_skill`(Router_Economy.gs/ActionRouter/KANSHOU_BLOCKED_ACTIONS_)、tags payload 的 `activeSkillOn` 欄。舊存檔殘留的 MEMORY【主動技】標記無害(無人再讀)。
    - **前端**：`activeSkillOfActive_()`(Script.html·出戰從者的主動技，與後端同優先序 burst>str_up>projection)→敵蹤攻擊列＋互動選單各多一顆「⚡主動」按鈕(出戰從者有施放技術才露出)；`servantStrike` 補 useSkill 確認分支(顯示招式名＋耗魔)；從者卡⚡膠囊改純資訊標籤(點開 `showActiveSkillInfo` 看說明·不再有 ON/OFF)；FX_DESC 三招改「攻擊時按⚡主動＝該次全效耗魔／未按＝微量免費」。
  - **⚖️ 投影魔術數值下修(2026-07 玩家定案「開關差距不超過30」)**：原 `hit:9+dmgAdd(34+寶具×0.6，最高近70)` 遠超同表 burst/str_up 量級——roundrobin 模擬 EMIYA/小黑/咒腕之哈桑「不開↔開」勝率差 +44~+76 個百分點(形同不開=半殘)。降為 `hit:2+dmgAdd(5+寶具×0.12)`，實測差距收斂至 +19~+27。burst 疊寶具解放雖單發傷害翻倍，但彙總勝率差僅 +0.6~+8.9，不需調整。
- **🩹 寶具失敗留痕＋對話格式鎖緊(2026-07 玩家實測「解放寶具！+出擊！兩條卻只打普攻」)**：①**寶具失敗斷頭訊息**——按💥付不起底費(前局耗盡魔力)被後端擋(`success:false`「油盡燈枯」)，前端原本只 alert、關掉無痕，回讀故事流變成「喊了解放寶具卻沒下文、接著又普攻出擊」的困惑。修：`servantStrike` 失敗分支把 `res.message` 也補一行系統訊息進故事流(`msg-player` 淡紅)，回讀有跡可循。②**對話格式收緊**(miniSystem)——夢境出現「阿爾托莉雅：【微笑】台詞」(名字重複入引號＋【】當動作括號)：規則補「動作括號限（）禁【】、禁『她說道：』引導句、禁角色名再現於「」內」。註：該局敗北＝合法判定(Cú 剩2HP觸發寶具預兆警告→玩家無視→戰鬥續行撐1HP＋反擊 Gáe Bolg 必中285→Saber亡)，非 bug。
- **🧹 solo UI 精簡·砍頂部休息鈕＋捷徑列(2026-07 玩家定案「用不到」)**：①頂部導航列的「🛏️休息」鈕(Index.html·與底部動作列休息重複)移除、只留位置徽章；②「👣捷徑：」最近地點快捷移動列(recent-loc-bar·與底部🗺️移動＋地圖分頁點地點移動重複)整組移除——`recent-loc-bar` div／`updateRecentLocations`／`renderRecentLocs`／init 呼叫／狀態刷新呼叫點／CSS 全清。localStorage `kyushu_recent_locs` 殘留 key 無害不動。
- **📜 從者詳細狀態按鈕(2026-07 玩家定案「做個按鈕也能看自己從者」)**：solo 從者卡名字旁加「📜 狀態」小鈕(每張卡各一·雙從者亦然)——呼叫【既有】`openStatus(name,name)`→完整命盤視窗(個性/特徵/身世/六圍/技能/羈絆…)＋逆天改命(同行從者 `canEditFate`=true·`actionUpdateFate` 本就對同行放行)。**後端零改動**：`actionGetFullStatus` 用 targetName＋game_id 比對·自己從者本就查得到；`event.stopPropagation()` 防 dual 卡點名誤觸切換出戰。之前僅御主/NPC 有此入口(NPC 走「📜命格」)，從者是同行夥伴不在 NPC 列、故缺按鈕·非缺功能。
- **👗 戰報敘事服裝守則＋供魔勿誇大(2026-07 玩家實測「未著寸縷的Saber」)**：戰報/移動敘事走 `actionNarrateOnly` 的 miniSystem——原本【完全沒有服裝守則】(那條只在自由聊天的 sfwBaseRules)，AI 從「風王結界解除隱匿」聯想歪、把甲冑藍裙的 Saber 演成裸體。修：miniSystem 補 6b「衣著嚴格依角色卡——【此刻裝扮】(玩家換裝)最優先寫什麼穿什麼；卡上沒寫的嚴禁自行裸露/增減服裝；解除結界只顯現武器」。⚠ 後續玩家澄清：該場「未著寸縕」其實是玩家自己換裝「全裸」→ 管線忠實讀取＝正常運作非幻覺；6b 措辭已改為換裝優先、不與玩家選擇打架，守則只擋「卡上沒寫的自行裸露」。同批：純導魔(無焚血)的御主電池素材行補「本次供魔從容有餘·勿寫成迴路焚燒/瀕死透支(那是先前戰鬥的舊事)」——防上一場的慘狀從對話歷史滲進這一場的無痛供魔。
- **🕯️ 十二試煉燒命總帳(2026-07 玩家指出敘述「接連倒下三次」與燒9命混淆)**：`godNote` 只留最後一回合那句、AI 只能自己數「倒下了」出現次數(＝回合數·非燒命數)。`actionFateBattle` 於 targetIsFoeServant 判定處捕捉 `ghLivesStart`(戰前 lives)，素材行在 godNote 後附總帳「★本戰共燒去 X 條命、尚餘 Y；燒命數與倒地次數是兩回事(單擊可燒多命)，勿混寫」。
- **🔍 AI 原創英靈生成管線驗證(2026-07 玩家問「AI能確實知道該怎麼創建英靈?」)**：提示詞規格完整——六圍格式(E~EX·可帶+·狂化填狂化後數值·有強有弱)/classSkills 1~2＋skills 2~3 各含{n,r,fx}/職階技慣例表/FX_MENU_ 37個效果碼(與 ALLOWED_FX_ 白名單一一對應·頂級概念寶具與 mage_realm/rune 刻意排除)/traits 1~3/np 規模上限對軍(prompt 預告＋代碼降級雙保險)/personality 四格/JSON 範例。後端防呆全鏈：`sanitizeSix_`(六鍵齊全·階級regex·EX最多2項超額降A)/`sanitizeSkills_`(fx 非白名單→''·階級regex·數量帽)/API失敗中止(缺realName/six不寫表)/god_hand lives=3帽/recordOriginalHero_ 不重名。本次補一洞：**np 剝除【常駐寶具】標記**(種子專屬——AI/自訂描述混入會鎖死自己的💥)。已知設計取捨：AI 原創 Berserker 預設「會說話的狂戰士」(mad 禁言偵測走 speech/firstP 字串非 fx·與開膛手傑克同理)；AI traits 不帶階級(神性 fallback C 檔·濫用價值低)。
- **✂️ 種子 persona 全庫修剪＋原型綽號清除(2026-07 玩家定案·v51)**：玩家反饋「正典角色 AI 認得 80%、卡太滿反而照稿演」。**三留原則**：①本作特調(toMaster 關係走向等模型不知道的)②辨識錨(多版本區分·視覺錨·自稱·v38~v49 查證過的「模型常搞錯」設定如吉爾德萊無鬚無眉/伊絲塔借菲莉雅之身/凜櫻姊妹送養方向)③演出方向鎖(moe壓1項/speech壓語氣詞≤12字/tic留1個/words壓2-3詞)——百科式正典常識(「日本神話最高神明」類)與同義重複全刪。36騎+15御主、該批行字數 -37%。**紅線保全**：狂化偵測關鍵詞(Router_Persona:62 正則測 speech+firstP)強制保留於 B叔/蘭斯洛特；六圍/技能/寶具/traits/np 機制欄零接觸。**原型綽號清除**(玩家「角色原型垃圾不進AI資料·像青鬍子」)：吉爾·德·萊斯 realName 去「（青鬍子）」、look 去「自稱藍鬍子」(留無鬚無眉視覺錨)、戰報素材行「青鬍子以螺湮城教本」→「我方術師」、錯誤訊息同步；`SEED_RECLASSED_` 補 '吉爾·德·萊斯（青鬍子）｜Caster'→'吉爾·德·萊斯｜Caster' 名字遷移(舊召喚列名字不改、kit 照刷)。哈桑三人組（百貌/咒腕/狂信者）/湖之騎士/征服王/EMIYA/install 組的括號＝必要辨識錨、保留。代碼註解裡的「青鬍子」＝工程筆記、AI 看不到、不動。
- **📋 提示詞總盤查(2026-07 玩家「幫我再確認一次所有提示詞」·3組審計agent+親自驗證)**：修 13 處——①**互動選單「移動」假移動**(Script.html)：舊 prompt 叫 AI 用已拆除的 stat_changes 改位置(後端不再解析＝根本沒移動)，改直接呼 `travelTo`(真 actionMove)。②**鷹架洩漏三處**：`cleanNarrateEcho_` 補洗 `〔…〕` 前綴(〔敵方出戰者〕/〔夜襲者〕原會殘進玩家歷史)；夜襲/陣地反擊 prompt 的句中★拆成獨立行(行首過濾才攔得到)。③**對話格式統一**：`miniSystem`(戰報敘事)原要求「≥2個括號嵌中間結尾」與 `sfwBaseRules`(自由聊天)「恰一個開頭括號、禁中間結尾」字面互斥——統一為後者。④**道場敗因對症**：拿掉孤兒「死於反噬」分支(已不致死)、補「斬首豪賭」分支、斬首 causeTag「反噬」→「反殺」防誘導。⑤**措辭對齊定檔制**：超載素材行「盡數傾注/傾盡一切」改依 npOverloadMul 分級(p1 半灌不寫盡數)；出力不足訊息「灌注全部魔力」→「支付寶具底費」。⑥**護欄補強**：敵御主卡正典調用補「禁預告原作結局/未揭露身分」；masterCard_ 禁台詞清單補「特徵」；AI 原創從者 np 指令補「規模上限對軍」(代碼本就默默降規、prompt 先說清)；令咒選單「從者魔力回滿」→「御主魔力池」(從者無池)。**刻意不動**：`rel_changes.fav_change`/`log_summary.event·tag` 等看似孤兒欄位——與慾海共用 baseJson 範本(慾海讀 fav_change·紅線鄰接)，寧留 token 不碰結構。
- **🎛️ 實戰回饋三修(2026-07 玩家第一場實測)**：①**反噬去即死化**——極限檔定價已把血燒到見底(drainForNp_)、反噬再補刀＝第一發 65% 出局的雙重懲罰(玩家實測「太容易死」)。反噬改【純資源傷害·保底1不致死】，整組致死機件(戰果後結算/從者消散/causedDefeat 文案分流/前端燒斷橫幅)拆除；機率與傷害幅度不變(血魔雙空的資源壓力仍在)。②**超載檔位＝攻擊列 ＋/＋＋ 蓄勢鈕·零確認(玩家三修「不用一直確定·開錯就開錯不要擋」)**——💥寶具旁新增 `🔥＋`(p1)/`🩸＋＋`(p2·cap2.0才有)小鈕(比照❖令咒蓄勢的亮燈邏輯·`npTierArmed`)，亮哪個按💥就開哪檔、**全程零 confirm**；沒亮＝僅付底費(overload:false)。價格/倍率/反噬%全在 tooltip；發射後檔位自動歸零(防手滑連環660)；常駐寶具者不顯示檔位鈕；多寶具選單(選哪把)保留。`openOverloadPicker` 選單已移除、`servantStrike` 第8參 overloadArg 已拔。③**道場講評對症化**(玩家「伊莉雅每次都叫我繞去打御主」)——`handleDefeat` 從 res.report 推導**結構化敗因**(時限/夜襲/斬首失敗/正面交鋒·含是否已用寶具/反噬)前置給 `buildTigerDojoPrompt_`；prompt 拿掉「該偷襲御主而非硬拚寶具」等誘導範例(AI 每次照抄)，改「建議必須從【本局敗因】推導、嚴禁無關泛用套路」。
- **⚡ 正典御主名單預取(2026-07 玩家反饋「扮演正典御主讀取好久」)**：慢的三層原因——①「扮演」是創角流程**第一次**打 google.script.run(前面選模式/戰爭全是純前端·GAS 一趟 1~3s＋冷啟動更久)②每 action 固定前置 `ensureFateSheets_`(掃全分頁補表頭)③版本閘風暴(暫時性·CODEX_PERSONA_VER 每次 bump 後的第一個 action 扛整套 upgrade/resync 5~15s，密集部署日特別有感)。修①：`Script_Onboarding.html` 選完戰爭進「自創/扮演」畫面時就背景預取 `get_masters`(`_mastersPrefetch` per-war Promise)，玩家讀選項的幾秒蓋掉 round-trip、點「扮演」幾乎秒開；預取失敗自動 fallback 現場重抓。②③未動(③部署穩定即消失)。
- **🦊 玉藻前官方材料校正(2026-07 玩家貼原文·v50)**：①**咒術EX fx fast_cast→divine_age**——官方：荼吉尼天法「以自己肉體為素材編排的物理現象，故能無視對魔力」，引擎既有 divine_age(凌駕對魔力·殘三成＋攻擊算魔術系)正是此機制、傷害加成同量(12×階)零平衡漂移；FGO 強化後名「咒層・廣日照」，本作保留原典咒術EX。②**神性補階 A**(官方「日本神話中最高級別的神明」·天照分靈)——原無階、`divineRankOf_` fallback C，神殺/天之鎖/對神寶具對她的剋制被低估(高神性＝高威能亦高弱點·統一縮放設計)。③變化A(借體成形)/狐之嫁入EX(crafting＝官方「把道具製作技能自行改造」)核對無誤不動。
- **🛡️ 常駐寶具標記(2026-07 玩家點名「B叔的寶具不是攻擊」·v49)**：赫拉克勒斯 God Hand(十二條命·god_hand fx 已常駐生效)與玉藻前 水天日光(治癒結界)都不是攻擊寶具，按💥卻會被當砲打＝出戲；且 Nine Lives 在狂化下鎖死(前人查證·已移給Avenger版)，B叔正解＝【沒有可解放的攻擊寶具】。修法(資料驅動)：np 字串加**【常駐寶具】標記**(種子→MARTIAL·v49 resync 傳播)——前端戰爭行動列💥鈕灰化為「💥常駐」(tooltip 說明)、互動選單不給寶具鈕；後端 `actionFateBattle` 對 MARTIAL 含標記者擋攻擊解放(舊快取前端保險)。玉藻前 skills 補「水天日光天照八野鎮 B·regen」讓治癒結界真的每回合回血(引擎既有機制·她的輸出靠呪術EX fast_cast)。敵方 AI 不需改：`eOffensiveNp` 閘(規模對軍+/攻擊fx)本就擋掉這兩位的敵側解放。**狂化真名同批修**：解放寶具的 aiPrompt「務必親口高呼真名」對 `hasFx_(atkC,'mad')` 者改為「咆哮與本能的爆發·旁白可呈現真名·嚴禁開口」——蘭斯洛特(Knight of Owner 可解放)不再被逼著講話。
- **❖ 令咒·蓄勢開關(2026-07 玩家最終定案·取代 confirm 串)**：戰爭行動列的❖鈕改成【蓄勢 toggle】——按下發亮(`sealArmed`·免費可再按取消)，之後按 普攻/⚡主動/💥寶具 任一攻擊自動帶上令咒(絕對必中 `atkWins=true`＋×1.5)並熄燈；按其他任何行動(移動/偵查/互動/刺殺)不消耗、蓄勢保留。`servantStrike` 開頭 `if(sealArmed && !isMaster && !useSeal) useSeal=true`，熄燈在【所有確認通過後】(beginAction 前)——中途取消不熄、令咒不白燒；寶具/主動的既有確認框內嵌一行「❖令咒蓄勢加持」(不多彈窗)；蓄勢普攻補一個確認(普攻原無確認·防誤耗)。互動選單的❖仍為直發必中普攻(標籤指引疊加走蓄勢)。邊界：無主動技者⚡鈕本就不顯示；所有從者皆有寶具(種子必填)故💥恆有效。後端零改動(seal/np/skill 獨立旗標)；令咒對斬首不適用。
- **🔥 超載不焚血＋可選＋池上限×10(2026-07 玩家反饋「放寶具剩1滴血」)**：根因不是池太小——灌魔超載 auto-pour 的預算原本＝`MP＋(HP−1)÷2`【連血一起算】，規格外(＋/EX)寶具全開解放的超載目標(底費×2)永遠比池深，故每發必自動燒血到剩 1(池拉多高都一樣)。修法三件：①**超載段不再焚血**——`masterSurplus = max(0, MP−底費)` 只算 MP 餘裕；底費不足時的焚血(`drainForNp_`)與被動燃血照舊(那是刻意設計)。想灌更滿→補魔拿【過充】token(無償超載·原設計路線轉正)。②**超載定檔制(玩家三修·220/440/660 比例算扣血)**——固定價格檔位依寶具階等比：底費P(不超載)／2P超載檔(灌P·cap2.0→×1.5)／3P極限檔(灌2P·達上限)，A階＝220/440/660。**魔力優先支付、不足的缺口才焚血(2HP=1MP)**——不再「把身上全部梭進去」的浮動池。前端寶具確認兩問(超載？→檔位？·顯示實際總耗與倍率)，`fate_battle` 夾 `userData.overload`：false＝僅底費／'p1'＝2P檔／'p2'＝3P檔／true·'blood'·未帶旗標＝相容(只灌MP餘裕；'blood'含血梭哈)。沒＋的寶具無此旋鈕(定額釋放·原設計)。追補·**過載反噬**(玩家定案·堵「焚血保底1＝反正死不了」的無風險梭哈)：明選超載檔位後機率性迴路暴走——`OVERLOAD_BACKLASH_`＝p1{30%·扣maxHP 4~12%}/p2與舊blood{65%·扣maxHP 8~24%}(資料驅動查表·相容MP檔不反噬·敵方無超載不適用)。**可致死**：戰果判定後結算——同發奪勝＝奇蹟保命1HP；否則御主迴路燒斷昏厥＝供魔斷絕→己方從者盡數 DEAD_ 消散(比照斬首失敗全滅路徑)＋defeat＋buildDreamPrompt_。report.backlash{dmg,fatal,hp,hpMax,survivedByWin}→前端紅幅；aiPrompt 素材行明示★迴路內在劇痛非外傷；敗因＝反噬時(backlash.causedDefeat)敗北結局文案分流。前端檔位確認標示反噬機率(30%/65%)。③**池上限 ×8→×10**(`masterPoolMax_`＋`masterMaxHpMp_`·迴路30+魔A＝400)：A階付完底費 220 仍餘 180 可灌(×1.4 不流血)。既有存檔玩家池上限由 applyRegen_ 下次 tick 自動重算擴大；既有局的敵御主 MAX_MP 不回溯(與 ×6→×8 時同前例·新局才吃新公式)。
- **🧮 供魔收支 HUD 與實際時回同準(2026-07 玩家問「魔力量增加正確嗎」)**：實際增量(`applyRegen_`)本身正確、池上限 ×8 也是刻意加深(PR#64)，但 HUD(`playerServantEconomy_`) 三處與之不同步：①收入漏算「從者魔力×0.15」回魔貢獻(魔A從者=+8/時被吃掉)②雙從者時只算第一位的維持費 ③工房判定漏看第二從者的 territory——玩家看到的「淨 X/時」對不上實際魔力增加。修法：`playerServantEconomy_` 重寫為與 `applyRegen_` 同一套算式(掃全隊從者·Σ維持×各自出力檔·收入含 svFeed)，payload 新增 `svFeed` 欄；前端兩處收支條(economy-hud＋左側狀態卡)補「📿從者 +N」項。順手清 4 處過期 ×6 註解/文件(Seed_Rivals/Router_Creation/Time_World/SOLO_REFERENCE/HANDBOOK——實際公式 2026-07 起＝迴路×8+魔力×2)。⚠ 日後改收支公式，applyRegen_ 與 playerServantEconomy_ 兩函式務必一起動。
- **🗺️ 地圖圖例對齊實色(2026-07 玩家問「地圖顏色有對上嗎」→沒對上)**：`buildMapSvg_`(Script.html) 節點實色 `typeColor`＝城區藍`#5a93c9`/靈地綠`#3fae6b`/祭壇金`#e0bb44`/據點橙`#c07a45`/約會粉`#cd82c0`(居所`#cd9b5a`備用·種子圖無此類型)，但圖例原寫「🔵靈地(實為綠)、🟡據點/祭壇(據點實為橙)」——改為 🟢靈地/🔵城區/🟡祭壇/🟠據點/💗約會 五項各自對色。⚠ 日後動 `typeColor` 記得同步下面的 legend 陣列(兩處相鄰、有註解互指)。
- **🎭 戰鬥敘事人物厚度補完(2026-07·伊莉雅沉默案)**：玩家反饋「打死 B叔 伊莉雅天真殘忍地不說話、超出戲」——根因不是種子太長(她的種子很精簡)，是戰鬥提示詞：①提示詞裡「伊莉雅」「赫拉克勒斯」是兩個不相干名詞，**沒有一行說這是她契約的從者**；②`enemyMasterCard_` 只讀 性格/特徵/萌點，BACK(身世)與 MEMORY【願望】都不進卡，AI 沒有情感錨點就滑向類型套路；③戰鬥提示詞**只附我方從者卡**，敵從者口吻/狂化禁言全靠 AI 憑真名即興。修法(全 prompt 層、不動種子不動數值)：`enemyMasterCard_`(Router_Persona) 補讀 BACK 取「。外貌：」前身世段(預設值"魔術師"略過)＋【願望】；`actionFateBattle`(Router_Battle) 敵御主卡後加**關係錨**「上述敵御主正是『defC』的契約御主」(僅 !isMasterTarget)＋兩分支 aiPrompt 加 `foeServantCardStr`＝'〔敵方出戰者〕'+servantCard_(敵從者·狂化鐵則一併生效)＋素材區新增「從者被消滅→在場敵御主親眼目睹·依性格身世演出衝擊(非沉默背景板)」行；`enemyAmbushOnServant_`(Router_Movement) 的 out 補 `foeCard`，四個突襲呼叫端(休息/羈絆/結盟/補魔)的突襲 prompt 前綴之——夜襲者也從「只有名字」變成有完整演出卡。追補(玩家「種子太齊全AI偷懶」疑慮)：`enemyMasterCard_` 結尾加「正典人物優先調用你對其原作形象的完整認知、卡片僅為錨點；非正典原創人物才嚴依卡片」一行——防小模型錨定在卡上四個性格詞演成類型套路(卡＝地板非天花板；`servantCard_` 本就有「依真名演出」句、敵御主卡原本沒有)。**種子本身不砍**：敘事模型是 flash-lite 小模型、對非一線正典角色記憶不可靠，且 AI 原創角色無正典可查，種子是唯一真實來源。
- **💨 撤離追擊補人物厚度＋數字戰報卡(2026-07 玩家反饋「移動後敵人沒追擊、追擊戰報從者也沒描述」)**：`actionMove`(`Router_Movement.gs`)的撤離追擊(`pursuit`)機制本身是機率制(見下段說明)，但玩家點出的另一半是真bug——舊版 `pursuit` 物件只有 `{enemyName,dmg,hitWho,note}`，前端只把 `note` 塞成 `arrivePrompt` 裡的一句附註，AI 沒有追兵的性格/口吻卡可演，也沒有像卸防突襲那樣秒顯的數字戰報卡。比照 `enemyMasterCard_` 案(見上「戰鬥敘事人物厚度補完」條)同一套修法：`pursuit` 補 `foeCard: servantCard_(chaserRow)`，`actionMove` 回傳新增 `report`(`{pursuit:true,np,enemyName,dmg,hitWho,svName,svHpMax,after}`)；前端 `renderFateBattleReport`(Script.html)新增 `r.pursuit` 分支(取代舊版純文字一行 div)，`arrivePrompt` 插入 `【撤離途中的追兵】${pursuit.foeCard}` 並讓撤離追擊/反咬指令句改為「依上方追兵性格演出」。**撤離追擊為何常常沒發生(機制說明，非bug)**：需同時滿足①離場格有「活的」敵從者(打死的敵人自然不會追)②非結盟中③該敵從者 BOND<50④敵敏捷≥我方從者敏捷⑤機率骰中(基礎30%、視血量/姿態微調、上限55%)——五個條件同時成立才會追，任一項不成立就不會觸發，屬設計上刻意留寬鬆的逃脫空間、非故障。
- **⚔️ 抵達時「敵對互毆」場景(2026-07 玩家提案「兩組人馬同格不打架很奇怪」)**：`actionMove`(`Router_Movement.gs`)抵達判定新增——若抵達地點同時有 ≥2 位不同敵御主(各帶其從者、皆非與玩家結盟中)，判他們早已交手片刻：GAS 用 `resolveFateBattle_` 真實裁決兩位敵從者(用【御主】MEMORY tag 配對各自的從者，比照 `worldTick_` 既有的配對邏輯)，戰敗方扣「該傷害的0.4倍」(只是先前互相消耗的餘傷，非死鬥全額，且不致死·floor 1)，建構 `factionClash`(HP變更寫在批次 setValues 之前、零額外寫入)。`worldRumors` 插一則〔敵對交鋒〕、`arrivePrompt`(Script.html)多插「★【撞見敵對互毆】…這不是相安無事同處一地，是你打斷了一場戰鬥」指令，讓 AI 演出雙方戒備停手，不再讓多批敵人像沒事發生一樣杵在同一格互不理睬。**只挑第一組配對成功的兩位**(3+方同格的極少數情況不重複觸發)；GAS掌傷害裁決、AI只演出中斷瞬間，符合「GAS掌數值、AI只說書」鐵則。
- **⚔️ 出戰→攻擊(2026-07 玩家定案)**：`attackStyle_()`(Script.html)近戰職階(非Caster/Archer)的攻擊按鈕文字由「出戰」改「攻擊」；Caster/Archer 的「魔砲」「狙擊」不受影響。⚠ 其餘「出戰中」(指目前操作中的從者，雙從者切換用語)為不同語意，未一併改動。
- **🧹 外顯狀態自 solo 整組移除·慾海以肉體抵換(2026-07 玩家定案「不讀取就直接移除」)**：查證 solo 戰鬥 AI(`servantCard_`/`masterCard_`/`enemyMasterCard_`/battle aiPrompt)從不讀 STATUS 欄、solo play prompt 也只回饋玩家自己一行——外顯狀態在 solo 是「AI 寫了沒人看」的死資料迴圈(卡片恆顯示預設「穿戴整齊，站立　氣息平穩」)。拆除範圍(全 SFW)：①`Engine_Combat.gs` SFW baseJson 的 `stat_changes` 欄＋sfwBaseRules「狀態刷新」條＋fallback JSON 的 stat_changes(**慾海不受影響**：NSFW 走 `intimacy_feedback` 紅線機制維護 STATUS，未動)；②`Router_Narrative.gs` play prompt 玩家「狀態」段改 isNsfwMode 才附＋stat_changes 應用區塊(原271-307)整段移除＋兩處 prompt 提及清掉；③`Router_Action.gs` buildTagsPayload_ 御主/從者的 `condition` 欄移除，御主補 `physical` 欄；④`Core_Settings.gs` `buildPlayerStatusString` 位置0：K系id(KPC_/KSV_/KHV_)→PHYSICAL 摘要、否則空字串；⑤`Script.html` solo 從者卡 condition 行刪除、慾海御主卡以「肉體」行抵換原 condition 行、慾海從者卡「外顯」行刪除(已有獨立「肉體」行)、眾生卡「狀態：」行改 kanshou 才顯示、`updateUI` 的「當前狀態」trait-box 依 s[0] 空值自動隱藏(慾海有抵換值照常顯示)。⚠ 戰鬥機制對 STATUS 的**寫入**(god_hand 復活「英靈的一縷加護」等)保留＝無害風味寫入，慾海封存後仍讀得到；`buildVisibleStatusString` 保留給 nsfwMemories(紅線餵養)＋眾生卡 kanshou 顯示。
- **🔱 對轟重構＋神性統一縮放(2026-07·玩家定向)**：①**resolveNpClash_ 純裁決函式**(Engine_Fate.gs)——原內嵌 actionFateBattle 的四層特例(雙向因果律/輸方保1/pLethal旗標)收成單一優先序階梯(玩家因果律截斷→敵方因果律必死→僵持→高者勝)，I/O(火力取樣/落傷/回震腰斬)留在 Router_Battle；純函式＝battle_sim 可直接單元測試(6案例全過·與重構前逐位元一致)。**日後加對轟特例改這支函式，別再往 Router 塞 if**。②**divineRankOf_(c) 神性單一真實來源**——divine fx 階級優先→特性(神性|神格|神靈)標的階級→'C'(有神性沒標階)→null(無神性)。吃它的五處：`神殺 god_slay`(×1.17~2.0 依對方神格·原本就有縮放，改統一來源)／`天之鎖縛神`(基準6×鎖階，**新增 ×(0.5+0.5×rankMul(對方神格))**——C神格=舊值、A=×1.33、美杜莎E-=×0.62)／`對神寶具`(弒神倍率 **1+1.4×rankMul(對方神格)·上限3.0**，原恆2.4——C=2.4舊值、A=3.0、E-=1.32)／`寶具解放神性加成`(**1+0.1×rankMul(自身神格)**，原恆1.1且只查trait——修正伊斯坎達爾神性C只掛skill被漏判)／`對瘟疫神性抗性`(改吃同一來源·刻意維持二值門檻不縮放)。全池模擬回歸：排名±噪音、迦爾納np模式+6(對神buff·仍中段)。
- **⚡ 競態修＋_state 交棒提速(2026-07)**：①**AI後寫回競態**——`play`/`backfill_master_ai` 豁免寫入鎖(AI呼叫佔數秒)但用「AI呼叫前的列索引」寫表，期間清殘列若刪列會寫錯列。新增 `buildLiveIdIndex_(sheet)`(Core_Settings.gs·單欄窄讀ID→當下列索引)，兩處寫回前重定位、列已刪則跳過(`narrate_only` 不寫表不需要)。②**STATE_PRE_DATA_ 交棒機制**(Router_Action.gs)——寫入完整性已驗證的 handler(`move`/`rest`×2路徑/`fate_battle`×2路徑)成功返回前把手上的權威 pcData 交棒給 dispatcher，`buildClientState_(sheets,pcId,preData)` 直接複用、**省掉夾 _state 的整表重讀**；未交棒的 handler 照舊 fallback 重讀(正確性不變)。前置條件(全部已做)：`raiseBond_` 補 preData 參數(原地改+寫格·比照 worldTick_ 模式，Battle/Movement 兩呼叫端傳入)、fate_battle 的 `getAp_`/`spendAp_`/`clockLabel_` 補傳 pcData。③順手根源化：交棒路徑的 `getFreshStatusString`(自己也整表重讀)改直接 `buildPlayerStatusString(pcData[pIdx])`——move/rest/fate_battle 每鍵合計省 2 次整表讀。⚠ 日後新 handler 要交棒前必先驗證「所有寫入 helper 都原地改回同一份陣列」，否則 _state 會帶舊資料。
- **🩺 戰鬥系統體檢修正(2026-07·v48，2組稽核agent+全池模擬+親自驗證)**：①**對轟敵方火力漏skill**——`actionFateBattle` 寶具對轟的 `ePow` 取樣漏帶 `servantActiveSkill_(enemyC0)`(玩家側`pPow`有帶)，單層歸屬後敵方持 burst/str_up/projection 者開場對轟火力系統性偏低，已補上(敵反擊/夜襲兩處原本就有)。②**因果律截斷vs回震腰斬**——`spill0` 的「敵滅→回震×0.5」會在極罕見互殺情境把 `pLethalOk` 的必死傷害腰斬成不死，已改 `destroyedName && !pLethalOk` 才腰斬。③**換職階遷移表 `SEED_RECLASSED_`**(Seed_Codex.gs)——`resyncSummonedServants_` 以(真名,職階)配對種子，種子換職階(貞德 Ruler→Archer)後既有存檔的已召喚實體 key 對不上、永遠逃過改版刷新；補遷移表(舊key→新key＋RANK欄跟著換)，v48 升版重跑讓舊貞德-Ruler 實體吃到 Archer 新kit。④`fxDefApply_` mul 補 `Math.max(0,m)` 下限clamp(防未來超高階算出負傷害回血)；DEF_FX_ 校準基準註解修正(rankMul_=1.0 的是 C 階非 B 階——C 階不變、B 以上變強)。⑤`FX_DESC.rho_aias` 拿掉已換版貞德的「守護大旗」殘留、改依階級顯示實際倍率。全36騎互毆煙霧測試 0 異常；模擬確認貞德-Archer 落中段(44.5%/35.8%/32.4%)。
- **🗂️ 技能 fx 格式表 `SKILL_FX_`(2026-07 資料驅動重構)**：`Engine_Fate.gs` 把散落的主動技 if 鏈＋線性被動加成收成**一張表**，要加/調技能＝改一列。欄位：`active/prio/mpPct/icon/descFn`(主動施放技術)、`zh`(中文名·fired fallback)、`hit/hitAdd`(命中·攻方)、`dmgMul/dmgAdd`(傷害·勝方，皆可數字或 `r=>`/`(r,c)=>`)、`blockedByLoserFx`(敗方有此 fx 則免疫)、`silent`(傷害段不推 fired·morale靜默/self_mod避免重列)、`note`(標籤後綴)。
  - 收表者：主動 `burst/str_up/projection`(引擎 `servantActiveSkill_` 掃 active 依 prio)＋線性被動 `aim/self_mod/morale/fast_cast/mad/divine_age/wind_strike/crafting`(`resolveFateBattle_` 於**原位置**呼 `fxHitAdd_`/`fxDmgApply_`＋`skillFxVal_`)。**位置/順序/標籤/數值與重構前一致**(morale/self_mod 在 mystic·ambush 乘子【前】、其餘在【後】，故分兩處呼叫而非單一迴圈——保平衡數值不漂)。
  - **不進 SKILL_FX_(保持明碼·特例)**：骰子彈幕 `gob/chain`(gobVolley_/chainVolley_·隨機+多段)、時機/條件觸發 `stealth`(僅 ambush 首擊)/`petrify/gae_bolg`(寶具條件·改對手迴避或必中)、`tsubame`(2026-07 三修：僅每場第1回合觸發·opts.round，見上)、`god_hand`(復活·非戰鬥數字)、`weapon_steal`(敵龍 trait 條件)、`mad` 的命中/迴避-penalty(雙向)、`divine_age` 使敵對魔力半效之交互。硬塞進表＝過度工程。
- **🛡️ 防禦 fx 格式表 `DEF_FX_`＋防禦規模表 `DEF_SCALE_`(2026-07 資料驅動·對稱攻擊側)**：`Engine_Fate.gs`。
  - **`DEF_FX_`＝平減傷 fx 表**(`rho_aias`×(1-0.40r)／`territory`×(1-0.26r)／`wall_def`×(1-0.18r)／`divine_core`×(1-0.18r)，B階(r=1)為基準值)：欄位 `mul`(數字或 r=>)｜`pierceKey`(概念貫穿判定的防禦概念名)｜`zh/note`(fired 標籤)｜`physicalOnly`(僅擋物理·魔術系穿透，wall_def)｜`alsoPiercedByFx`(此攻方 fx 亦無視，divine_core←anti_magic_lance)｜`piercedMsg`(被貫穿時推的訊息 fn，territory/divine_core 有·rho_aias/wall_def 靜默)｜`guardPositive`(base>0 才推標籤，territory)。引擎 `fxDefApply_(base,loser,winner,fx,pierces,atkMagic,fired)` 於 `resolveFateBattle_` 各 fx【原位置】呼叫(位置/順序/標籤/數值與改前一致——因夾雜其他乘子·分處呼叫不併迴圈)。
    - **🐛→✅ territory/rho_aias/wall_def 原本不隨階級縮放(2026-07 修·玩家要求複查戰鬥後發現)**：三者 `mul` 原本是寫死數字，不像 `home_field`/`divine_core` 用函式(`fxDefApply_` 只在 `typeof mul==='function'` 才呼叫 `rankMul_`)——陣地作成 C 階跟 EX 階減傷完全相同，七天盾/城牆防禦同理，違反本檔案頭「每個 fx 效果都隨技能階級縮放」的設計原則。已改成函式、以 B 階(rankMul_=1)校準回原本數值，B 階持有者行為不變，A/EX 階變強、C/D 階變弱。
  - **`DEF_SCALE_`＝防禦規模表**(2026-07 收斂：`c.horrorUp`(🐙海怪在場·變身態)→對城、`territory→對軍`)：`npDefScale_(c, pierces)` 先查 horrorUp 再掃表，餵 `NP_SCALE_MATRIX[攻][防]`(對稱 `npAtkScale_`)。`summon_horror` fx 恆給對城已改綁狀態；`wall_def` 移出規模表(本職＝物理減傷×0.82·恆給對城會架空海怪變身＋AI 自訂掛牆砍半對人寶具)。
  - ⚠ **兩層防禦別混淆，但要同一份貫穿判定(2026-07 修雙重疊加)**：①`NP_SCALE_MATRIX` 規模相剋(對城攻打對人防 ×1.5…，`npAtkScale_`×`npDefScale_`)＝粗粒度；②`DEF_FX_` 平減傷(pierce-gated)＝細粒度。`territory` 同時出現在兩層——原本①完全不查 `pierces()`，讓能貫穿②固定減傷的高階概念寶具仍白吃①的規模防禦重分類；現在 `resolveFateBattle_` 把 `pierces` closure 提前到規模矩陣之前算好、傳進 `npDefScale_(loser, pierces)`，兩層共用同一份概念貫穿判定，不再各自為政。
  - **⚡ 按下前先預覽(2026-07)**：`Script.html` `previewActiveSkill_(skills)` 鏡射後端優先序＋耗魔(30/24/24)，`servantStrike` 的 `useSkill` 分支比照 `useSeal`/`useNp` 加 `confirm()`，秒顯招式名/效果/約耗魔力再確認；回 null 則 alert「此從者無可主動施放的技術」。實際判定與扣魔仍以後端 `servantActiveSkill_`/`drainForNp_` 為準。
  - **⚠ 原作查證·哪些配主動(2026-07)**：用 8-agent workflow 查證(TYPE-MOON Wiki，**刻意排除 FGO——FGO 把每個 personal skill 都做成冷卻按鈕、不能當「主動 vs 被動」的判準**)。結論：**魔力放出/投影＝每次意識施放的技術；怪力＝限時激發**(非常駐)→三者配⚡主動。**卡里斯瑪(與生俱來統率氣場)/千里眼(附於肉體的恆常眼力)/自我改造(已定局的軀體構造)＝常駐被動特性**→只留被動、拔出主動候選。**氣息遮斷＝刺客職階被動**(擺攻擊姿態即自動驟降·不可花魔重買)→僅 `opts.ambush` 免費首擊。**七天盾(rho_aias)＝自動觸發被動防禦**，維持現況。順帶修掉「morale 主動 +8 傷繞過 clear_mind 透化免疫」隱藏 bug(morale 失去主動路徑後自動消失)。
- **🌟 乖離劍·執行殺(ea／英雄王，2026-06)**：`resolveFateBattle_` 開頭——**僅 `opts.np`(解放寶具，即出力100%)＋英雄王【自身】血量≤40% 才觸發**(傲慢→認真)。傷害 `寶具rankVal×4＋6d12＋200`、必中越防、early-return。血量足走常規寶具(×1.7)。⚠ 舊「對面血≤30%免費每擊觸發」bug 已修正。
- **🔋 御主電池付款(2026-06 出力制)**：`npPranaCost_(寶具階)`＝**E40/D70/C110/B160/(A·A+·A++)220/EX300**(御主池 2026-07 起迴路×10≈300：A階付完仍餘少量、EX 幾乎耗盡；EX/EA 極罕見)。`drainForNp_(sheets,pcData,svIdx,masterIdx,mpCost)` 付款序 **①御主MP ②御主HP**(`BATTERY_HP_PER_MP`=2HP→1MP，血底線1(mHp-1保底)；從者無池，fromSv 恆0)。寫進 report.battery＋前端血條。御主血魔皆空才擋寶具。⚠ **血底線1＝設計刻意(防止「補魔算式自殺」)，非 bug**——御主不會因燃血而死，唯一死法是從者全滅(defeat)或直接遭刺殺／突襲致命；玩家反饋「一直休息+開寶具因為燃血不會死」時要先釐清這是刻意設計還是想加風險，別誤當 bug 修。
  - **🐛→✅ 燃血敘述誤植血肉外傷意象(2026-07 修)**：`report.aiPrompt` 原句「御主焚燒自身血肉(餘...HP)」易讓 AI 把「燃血supply魔力」誤演成外傷流血(血流滿地)——御主 HP 代表魔術迴路/生命力耐受度，非物理創傷。已改為「御主燃燒生命力硬扛魔力缺口，魔術迴路過載灼痛難當」＋明示★非外傷流血的鷹架，比照 `actionOverexertMove_`(強撐)既有的正確寫法(迴路過載灼痛)。
- **🔥 灌魔加乘·灌魔超載(2026-07·規格外寶具才有旋鈕)**：`npOverloadCap_(寶具階)`(Engine_Fate·資料驅動數 '+'／EX)→無＋=1.0(定額·不可調)、＋=1.5、＋＋/EX=2.0，對應原作「A++對城劍隨輸入魔力提高威力」，跨名冊通用(Excalibur/Enuma/Ea)非某人專利。`Router_Battle` NP 段 **auto-pour**：僅【全開100%】的＋/EX寶具，把御主餘裕魔力(MP+焚血+過充額度)超載灌入 → 達上限需額外「底費×2」的魔力·不足按比例，倍率 `atkC.npOverloadMul` 壓在 combatant 上(不改簽名·比照 output/npChoice)、`resolveFateBattle_` 寶具解放段 `wRelease` 才乘(對手反殺不吃)。戰報 `report.overload`(>1.25 前端橫幅🔥×N)。**敵方 NP 不超載**(暫·敵幾乎無餘魔·可續作)。
  - **🔥 補魔過充 token(2026-07)**：`getOvercharge_/setOvercharge_/clearOvercharge_`(Core_Settings·存御主 MEMORY`【過充】<額度>`)。`actionManaSupply` 補魔後除回滿池，另存**一池份(=補魔當下 newMpMax)可【無償】超載灌入的魔力**；發動＋/EX寶具時**只擴充「超載段」預算(masterSurplus+ocBonus)、只無償支付超載段·絕不代付底費**(底費恆由御主自付·上游閘門已保證)；真的灌到超載才消耗、**一次性(發動即清)**，沒派上用場則保留。同時掛 `atkC.overcharge`→resolveFateBattle_ 全能力微揚(命中+2·傷×1.06)。非＋寶具/未全開→token 不動。串成原作「補魔→梭哈大砲」：40迴路無過充 A++≈×1.7(梭哈榨乾)、補魔後 token 撐到 ×2.0 且御主真扣≈底費220(超載段全由 token 無償)。
- **⚖️🔋 共用魔力池(2026-06)**：從者與御主**共用一個魔力池**(存御主MP)。上限 `masterPoolMax_(迴路, 同隊從者魔力val總和)`＝**迴路×10 + 魔力×2**(演進：×6→×8(PR#64 灌魔加乘)→×10(2026-07 玩家定案「上限拉高」)；迴路30+Saber魔A→400；Berserker魔B→380；Assassin魔E→320)。`masterMaxHpMp_` 只給無從者基底(HP100+迴路×2／MP迴路×10)。召喚(actionSummonServant 併入從者魔力、補滿)＋時回(applyRegen 重算)動態更新。回魔＝御主迴路供給＋從者魔力×0.15(從者少)＋靈脈/工房。Caster(魔A·低維持)幾乎自持，Berserker 吃魔。
  - **🐛→✅ 敵御主池子原本沒套這條公式(2026-07 補公正性)**：`Seed_Rivals.gs` 的 `masterToNpcRow_`/`fakeMasterRow_` 舊版 MP 只算御主自己迴路(`masterMaxHpMp_`)，**完全沒把契約英靈的魔力階算進去**——同樣迴路30配阿爾托莉雅(魔力A)，玩家隊算出280、敵隊卻只有180，明顯偏小不公正。已改兩者都吃 `heroMagicRank_(heroRow)` 讀該英靈六圍魔力階、`masterToNpcRow_` 改用 `masterPoolMax_(circuits, rankVal(魔力階))`／`fakeMasterRow_`(無迴路資料的偽聖杯匿名御主)改用 `80 + rankVal(魔力階)×2`。四處建立敵御主的呼叫點(`chaos`隨機配對／`fake`偽聖杯／`4th`/`5th`正史) 都已補上英靈魔力階參數，一次到位。
- **♻️💧🩸 回魔三態(2026-06)**：①♻️靈脈/陣地/休息＝免費自然回魔(首選)；②💧**補魔(燃迴路·主動)**＝回滿池 BUT【永久】燒蝕 血量上限−15、迴路−3(地板：迴路≥8、HP上限≥40)，過度＝慢性自盡(`actionManaSupply`)＋**存一次性【過充】token(下一發規格外寶具可全力超載·見上「灌魔超載」)**；③🩸**燃血(被動)**＝**池見底**、時消耗補不上時，`applyRegen_` 自動把缺口÷2同時扣御主HP＋從者HP(平均·各保底1)，不再強制降出力——想少流血就自己節流。`actionBloodSupply`/blood_supply/前端 bloodSupply 已全移除。
- **🏷️ 被動 fx 功能化(2026-06)**：`resolveFateBattle_` 內生效的常駐被動——神性(被神殺者×1+0.5×神性階,上限2.0)／黃金律 wealth(金閃自身HP≤20%免魔力放 EA)／天之鎖 chain(`chainVolley_` 18d3捨1,gated !gob,對神性另有縛神性 debuff)／原初符文 rune(loser 減傷10%×階)／**變化 shapeshift(守方迴避+3×階,滑開致命擊)**／**道具作成 crafting(winner傷害+8×階,備妥之器)**／**無毀的湖光 weapon_steal(蘭斯洛特·Arondight)：對具「龍/竜」trait之敵傷害×1.5(對龍解放)——龍 trait：阿爾托莉雅(龍之因子)、莫德雷德**。台灣譯名：寶具「騎士不為孤軍/騎士不死於徒手」、聖劍「無毀的湖光」(非「湖光奪兵」——那不是官方譯名)。
- **🔮✨ 可選借得技能·mage_realm(2026-06，2026-07 通用化)**：`{n:'X',fx:'mage_realm'}` 的從者，玩家在從者卡點選盤挑 **1 個** `mageRealmPool_()` 內的通用 A 階被動(對魔力/怪力/心眼/透化/軍略/自我改造——皆有階級、非寶具/簽名)。`actionSetMageRealm`→存 MEMORY【魔境】fx→`rowToCombatant_` 戰鬥時注入 skills(r:'A')。**2026-07 通用化**：不再寫死「魔境的智慧」——`pill` 用技能自己的 `sk.n`、`openMageRealmPicker(sv,curFx,title)` 吃 title 顯示各從者本名。目前持有者：**斯卡哈-Lancer「魔境的智慧」**(影之國通曉武技)、**尼祿-Saber「皇帝特權」**(EX·她覺得自己會就會了→挑一門借得)。要再給誰「可選借得技能」＝把該技能 fx 設 `mage_realm` 即可(共用同池同引擎)。**可選能力標籤一律發亮**：`pill()` 第5參 `glow`＋`.tag-selectable`(Style.html `@keyframes tagGlow`)＋'✨'。
- **⚔️ 尼祿 kit 修正(2026-07·v21)**：原本 皇帝特權＋縱使三度迎來落日 **雙掛 survive**(第二個 survive 無作用·空轉)。改：皇帝特權 EX→`mage_realm`(可選借得技能·貼原作「借得不具之技」)、縱使三度迎來落日 保留 `survive`(＝FGO 戰鬥續行，精準對應)。頭痛宿疾 fx:'' 演出用弱點(不動)。
- **⚠ petrify 標籤中性化(2026-07)**：`petrify` 被 美杜莎(魔眼石化)/斯卡蒂(冰凍暴風雪)/蒼白騎兵(感染疫病) 共用當「鎖死迴避」，但戰報原寫死「石化壓制/魔眼·石化貫穿」對冰/疫語意不符。改用 `fxName_` 顯示各技能本名＋中性後綴(`·鎖死身法`/`·乘隙重創`)；FX_DESC 也改中性「鎖死身法（魔眼石化／冰封／疫染等）」。
- **🩹 專屬治癒 fx `regen`(2026-07·v22)**：常駐每回合涓流回血(約 2.5%×階/回合·上限30)，**無需選模式**(有別於 `rune` 的 regen 模式要玩家選)。`Router_Battle.gs` 回合迴圈回血區塊統一兩來源：符文 regen 模式 OR 持 `regen` fx(後者標籤用 `fxName_` 顯示技能本名·如「金羊毛」)。美狄亞加「治癒魔藥（限定不老不死）」B·regen——**FSN 原典**：她的治癒來自道具作成系的回復魔藥(可授限定不老不死)，非「金羊毛」(金羊毛 Argon Coin 是召科爾基斯龍的第二寶具·FSN 全程未使用)、也非「甦生大釜」(希臘神話廣義·非 FSN 材料)。已進 ALLOWED_FX_/FX_MENU_(AI 從者可當治癒型)。玉藻前「狐之治癒」目前仍掛 rune(可選)，要純治癒可改 regen(未動)。
- **🔄 種子改了要傳到「已在場從者」**：召喚是**讀英靈殿 sheet**(非 SEED_SERVANTS 陣列)→ 凍進眾生列(MARTIAL/SIX/TAGS)。改 SEED 後不會自動生效！傳播鏈：①升 `CODEX_PERSONA_VER`(Seed_Codex)→ `seedFateCodex_`(每次 doGet/action 經 ensureFateSheets_ 跑、版本不符才動)→ `upgradeCodexPersonas_`(刷英靈殿) ＋ `resyncSummonedServants_`(刷已召喚從者的寶具/六圍/標籤，依真名+職階對應種子；不動 HP/MP/MEMORY/敘事/狀態)。**動了 SEED 的六圍/寶具/標籤(如新增魔境的智慧 fx)務必升版本**否則 UI/戰鬥都吃舊值。`resyncSummonedServants_` 含玩家從者＋敵從者(FACTION 從者/敵從者)。⚠ 版本閘靠部署時序＋script property，可能卡住→另備**手動強制鈕**：主選單 DEV「🔄 套用最新平衡到現有從者」→`dev_resync_codex`→`actionDevResyncCodex`(無視旗標，立刻 upgradeCodexPersonas_＋resyncSummonedServants_ 並回報筆數)。
- **⏳ 全域等待遮罩(2026-06)**：`beginAction(msg)` 進場即 `showProcessing(msg||'聖杯演算中…', true)`(quick 模式·隱藏「10～30秒」那行)，`endAction` 收場 `hideProcessing()`。所有走 beginAction 的動作(出力/補魔/強撐/魔境/休息/偵查/戰鬥…)都有即時回饋，玩家才知道按到了。召喚/締約流程仍用非 quick(顯示秒數)。
  - **🐛→✅ narrate() 補 await，別讓 AI 敘述還沒回來就解鎖按鈕(2026-07)**：`narrate(res.aiPrompt)` 原本刻意不 await(先秒顯 `renderFateBattleReport` 數字戰報、AI 敘述背景補上，見上「等待動畫」一節)，但這連帶讓外層 `try{...}finally{endAction()}` 的 `endAction()`(解鎖 `__actionBusy`)在 AI 敘述還在跑時就先執行——玩家能在敘述回來前搶按下一個動作，容易讓故事順序亂掉。修法：**數字戰報依然秒顯不受影響**(它在 narrate() 呼叫之前就已經 render 完)，只是把 `narrate(...)` 前面補上 `await`，讓 `endAction()` 等到敘述真正生成完才執行、按鈕才解鎖。`Script.html` 全部 `narrate(...)`呼叫點(servantStrike/travelTo/rest/scout/scavenge/breakAlliance/proposeAlliance/allyBond/bond/useSeal/ruleBreakSteal/secondWind等)已全數補上 await。
- **🏖️ 貞德-Ruler → 貞德-Archer(泳裝版，2026-07 換版)**：Ruler版(對魔力EX+`rho_aias A`(吾主在此)+啟示/真名看破 三重疊加)經 `tools/battle_sim/roundrobin.js` 全循環賽模擬(全種子庫36位互毆)證實是全庫最強——普攻/開主動技模式勝率99%+，全庫僅美狄亞(破戒全咒)/迪盧木多(破魔紅薔薇)技能位階高到能繞過其對魔力，等於34/36人拿她沒轍。玩家看模擬報告後要求整組換成官方泳裝Archer版：`id`改`貞德-Archer`、`cls`從`Ruler`改`Archer`、六圍砍到 筋C/耐A/敏B+/魔C/幸A/寶A+、對魔力EX→**B**、拔掉 `rho_aias`/`first_strike`/`analyze` 三個强力fx，改配 對魔力B＋單獨行動(solo)EX 兩個職技、享受無盡夏日／水邊聖女(海豚) 兩個純演出技(fx留空)＋從者鼓舞(`morale` B)，寶具改單一對軍寶具「豐收之海啊」。連帶拔除 `Engine_Fate.gs` `servantNpOptions_` 裡原本按名字掛給「貞德」的Ruler雙寶具選單(含引用已不存在的rho_aias)，單寶具退回預設路徑。`CODEX_PERSONA_VER` v46→v47。
- **⚠️ 寶具尺度標籤是「會算進傷害的」(別當純文字)**：`npAtkScale_`/`npDefScale_` 直接 regex 讀 np 字串裡的 `對人/對軍/對城/對界`(＋部分 fx)決定 `NP_SCALE_MATRIX` 乘子(對界最高×1.7)。**亂寫高階標籤＝偷偷暴力 buff**。已修正誤標：斯卡哈-Lancer(原誤標 對界 A→實為 對人B+ 槍＋對軍A+ Gate of Skye)、斯卡蒂(原誤標 對界 A→support 對人 A)——兩者把 97%/81% 拉回 ~82%/55%。新增/改寶具文字務必對齊真實尺度。範圍(5~50)/最大捕捉(200人)是純敘事、引擎不讀。
- **🐕 主從synergy(2026-06，原作「御主供魔/契合提升從者能力」)**：`masterSynergySix_(name,six,memory)`(Core_Settings)讀從者列 MEMORY【御主】名，特定主從組合回到全盛六圍。目前只 **恩奇都↔銀狼(獵犬御主，原作真正的御主)→ 全A·寶A++**；其餘御主(含玩家自召)下恩奇都維持**削弱基線**(種子已降為 筋C/耐B/敏B/魔B/寶A)。`rowToCombatant_` 套用。擴充別組就往該表加。
  - **🐛→✅ 2026-07 修正**：原碼誤把「巴茲狄洛特」寫成恩奇都的御主(且 `FATE_FAKE_ROSTER` 也錯把恩奇都配給巴茲狄洛特)——查證 TYPE-MOON Wiki 後確認**巴茲狄洛特真正的從者是赫拉克勒斯(Archer)**，恩奇都的原作御主是**銀狼**(以銀狼為觸媒召喚、令咒落在狼身上，恩奇都便認狼為主)。已同步修正 `masterSynergySix_`／`Engine_Fate.gs`／`Seed_Codex.gs` 註解＋`FATE_FAKE_ROSTER`(見下)。
- **🗡️ 赫拉克勒斯-Avenger／阿爾喀德斯(2026-07 正名，`wars:['fake']`，`cls:'Avenger'`)**：Fate/strange Fake 原作——同一位英靈在 5th War 是 Berserker，在偽聖杯被巴茲狄洛特的令咒**「歪曲」強制扭成 Avenger**(阿爾喀德斯)，非單純 Archer。**捨棄神性與不死性換取「十二榮光」寶具群**→故【無十二試煉 god_hand 復活】(那是 Berserker 版專屬)。六圍官方 A/B/A/A/B/A++；職技 對魔力A／**復仇者A(fx `god_slay`·天生噬神：憎恨並踐踏一切神性)**／單獨行動B；保有 心眼(真)B／勇猛E(神詛拉低)／戰鬥續行A+。仍保 `神性A` trait(血肉充神氣·高神性者→自身亦被神殺剋，自我憎恨的神性體)。寶具：射殺百頭 Nine Lives(對軍A+·纏海德拉毒龍)／十二榮光 King's Order(A++·十二功業寶具具現)／天風的篡奪者(EX·篡奪敵寶具)。`FATE_FAKE_ROSTER` 配御主巴茲狄洛特(柳洞寺)。⚠ `cls:'Avenger'` 非 KNIGHT_BEATS 三角/非 VALID_CLS(僅限用戶自建)，走 `combatProfile_` 近戰預設——皆 graceful no-op·不炸(同 Caster/Assassin/Ruler 等其餘非三角職階)。
- `aliveEnemyServants_(sheets,gameId)`：在世敵從者數（勝利判定用）。
- `enemyRetreatLoc_`：令咒緊急脫離時敵退避地點。

### actionFateBattle 流程（Router_Action.gs）
1. 找出戰從者 `atkIdx`(userData.servant 指定或第一個)、目標 `nIdx`。同地檢查、AP 檢查、盟友不可打(`isAllied_`)。
2. **斬首**：目標=敵御主且有從者護衛→每名在世從者擲 D20，任一=20 斬殺御主(+護衛隨亡)→勝利判定；全失手→護衛反噬每人 1.5×。
3. **一般戰**：ROUNDS=3 回合。`partyIdxs`=所有在世從者(雙從者齊攻)。寶具/令咒只加在 atkIdx 開場第一擊。寶具魔力走 `drainForNp_`(御主電池)，前置 `maxPay` 檢查唯三者皆空才擋。
   - ⚠ **回合順序＝我方固定先手，非敏捷/骰子決定「誰先攻」(玩家常見疑問)**：每回合結構固定是 ①我方從者出擊(`fateStrike_`) ②盟友協同助攻(若有) ③**敵從者存活才輪到反擊**(811行`if(targetIsFoeServant && !DEAD_)`)。敏捷/骰子(`aHit`vs`dEva`)只決定**單次交鋒誰打贏、傷害算誰的**，不決定「這回合誰先動手」——出擊方永遠是按鍵發動的那方。**連帶影響**：敵已預告寶具(`寶具預告制`)但血量已進入斬殺範圍時，我方普攻一樣先手結算，一擊命中致死即讓敵在自己那個「敵反擊」段落前就已 DEAD_，寶具永遠沒機會發動——「預告＝逼你防禦」的張力只在敵撐得過我方這回合的攻擊時才成立，並非每次玩家攻擊都會被算成「加速反應更快」。
4. **協同強襲**(§8)：`allyAtkIdx`=同地盟友從者，每回合對共同敵人助攻一擊(不被反擊)。
5. 敵反擊：`enemyNpSpent` 一場限一次寶具。**🛡️ 寶具閘(2026-06)**：寶具是孤注一擲殺招、非見面招呼——敵唯有**自己被打殘**(`eHpRatio<0.5`)或**我方從者已殘可收尾**(`pHpRatio<0.45`)才解放真名；健康對健康一律普攻試探(免玩家一接觸就被無預警寶具秒殺)。觸發後再吃 `eNpUrge`(狂/暗0.22 else 0.10)+殘血加成的機率擲。
   - **🔋 敵寶具吃魔力(2026-07 對稱化)**：敵從者跟玩家從者同制——**無自有魔力池**(`heroToNpcRow_` 召喚時 mp=0)，寶具魔力全查 `enemyCanAffordNp_`(`enemyMasterIdx_` 敵御主電池 ≥ prana)才放，並 `drainForNp_` 扣魔；付不起→改普攻/不對轟。masterless(御主已死/查無連結)敵從者：一般英靈直接寶具自限(啞火)；有**單獨行動**(`fx:'solo'`)者靠靈基殘存硬撐固定小額 `INDEPENDENT_ACTION_RESERVE`(=60，不隨階級放大，通常不夠再放一次真寶具)——是「殘存的最後一口氣」非「獨立供魔」，別加大。EX/EA(prana300)幾乎沒人付得起→極罕見。
   - **🔋 敵御主每日回魔(2026-07)**：敵御主電池只被 `drainForNp_` 扣、從不隨時回自然恢復(那套只算玩家隊，見上「共用魔力池」)——若不補，長局裡放過一次寶具後就永久魔力見底、後續遭遇全部啞火，失去「寶具是孤注一擲」的張力。不用玩家那套逐時供需經濟(NPC 不必算到那麼細)，改用最簡單的**新的一天回滿**：`worldTick_`(Time_World)每次執行都呼叫 `refillMastersDaily_(sheets,gameId,day)`——MEMORY 記 `【回魔日】{day}`，見到記錄的日 < 當前日 → 該敵御主 MP 補滿並蓋新日期戳。
   - **🏷️ 技能白話字典 `FX_DESC`(Script.html `showSkillDesc`)**：玩家點技能 pill 彈出的說明，依 fx 對照公式即時算出當前階級的實際數值(對齊後端 `rankMul_`)；沒對到的 fx 落回「此技能主要為演出／劇情效果...目前無獨立數值」的通用備援。**2026-07 補完**：稽核發現多個 fx(aim/chain/crafting/divine/fast_cast/mage_realm/petrify/projection/rho_aias/rune/shapeshift/solo/territory/wall_def/weapon_steal/zabaniya/summon_horror/wealth)在 `Engine_Fate.gs::resolveFateBattle_` 裡明明有真實數值，卻沒進這張字典、被誤標成「無獨立數值」——已全部補上對應公式/描述。**要加新 fx 就同時補這裡**，否則玩家點開看到的說明會跟實際戰鬥數值脫鉤。
   - **🧹〔發動〕清單去重(2026-07)**：`fired.push(name+'·'+text)` 每筆都帶施放者全名，同一擊多個效果連發時整排重複報名(尤其長名字/多技能從者)。前端 `renderFateBattleReport` 新增 `stripOwnName(list, ownName)`：對照該行主角(`k.by`/`r.def`)剝掉剛好等於自己的重複前綴，只留效果字；別人的名字(如守方自身被動)不受影響照樣保留以區分是誰的效果。純前端渲染層修正，不動 `fired`/`aiPrompt` 等後端資料。
   - **⚠️ 種子與已在場敵從者標籤不同步的教訓(2026-07)**：查獲已召喚的敵從者(赫拉克勒斯)戰報顯示「對城防」，但 `Seed_Codex.gs` 源頭六圍/標籤查證是乾淨的(無 `summon_horror`/`territory`)——判定是該場已召喚的舊列標籤未跟上種子修正(版本閘卡住的已知風險，見上一條)。處置＝升 `CODEX_PERSONA_VER` 強制全體 resync，而非改邏輯(邏輯本身是對的)。⚠ `wall_def`(城牆防禦)已於 v42 全種子庫深度校對時從吉爾德萊(青鬍子)身上拔除(查無此技能歸他所有，疑似捏造)——**目前全種子庫無人持有 `wall_def`**，機制本身(`DEF_FX_.wall_def` 物理減傷18%)仍在、供未來角色或 AI 自訂使用，非刪功能。
   - **🛡️ 十二試煉概念燒命(2026-06)**：god_hand 致命時，`lossN=1`＋寶具概念加成(取 `offenseTier_` fx階 與 `npAtkScale_` 規模階 較高者：≥6→+2、≥5→+1)＋overkill(傷/復活線 ≥3→+2、≥2→+1)。`lossN≥餘命`→餘命一擊燒盡、不復活落入 destroyed。解決「Saber 對城 Excalibur 連一命都燒不掉」。
   - **🐛→✅ survive/god_hand 結構性互斥(2026-07 修，`Router_Battle.gs::fateStrike_`)**：`survive`(戰鬥續行) 判定順序在 `god_hand`(十二試煉) 之前，`survive` 一旦免費接住致命傷(`after=1`)，god_hand 的 `after<=0` 條件就不再成立、燒命判定永遠輪不到——赫拉克勒斯-Berserker 曾誤兩者皆掛正是這顆地雷(已於 v40 拔掉他的 survive)。但當時**只改了種子資料，沒把互斥做進引擎**——日後任何角色(種子或 AI 自訂)只要又同時持有兩者，同一顆地雷會再炸一次。已補結構性防呆：`survive` 判定加 `!hasFx_(defC,'god_hand')`，持有 god_hand 者一律優先吃 god_hand，不必再靠「別同時掛兩個」的資料自律。
   - **🕯️ god_hand 起始命數覆寫(`skill.lives`，2026-07·v42)**：`getGodHandLives_` 無 MEMORY 標記時預設11(赫拉克勒斯十二試煉專屬)；AI 原創英靈持 god_hand 一律標【試煉】3(尼祿「三度輝映」基準，`Router_Creation.gs`兩處)。但種子庫(seed)角色原本沒有這條路——尼祿本尊掛 god_hand 時會被誤套11命。**已擴充**：`Seed_Codex.gs` 的 god_hand 技能物件可加 `lives:N`(如尼祿 `{fx:'god_hand',lives:3}`)，`Router_Creation.gs`(玩家召喚·英靈殿路徑)與 `Seed_Rivals.gs::heroToNpcRow_`(敵從者召喚)皆已改讀取該屬性覆寫【試煉】起始值；沒標 `lives` 的種子(如赫拉克勒斯)不受影響、照舊吃11預設。日後任何 seed 角色要給非11/非3的自訂復活命數，直接加 `lives` 屬性即可，不必動兩處召喚函式。
   - **📜 種子庫全面深度校對(2026-07·v42)**：玩家要求「一筆一筆比對原作」，6組研究agent逐一查證36位英靈的六圍/技能/寶具/外觀服飾，優先序 原作>遊戲>小說>動畫>FGO(保底)。約40處六圍/技能階級與名稱錯位已修正(詳見各角色entry上方的行內註解)。**開膛手傑克-Berserker 整組重寫**：原內容誤植《Apocrypha》黑方刺客版設定(解體聖母/骷髏孩童/氣息遮斷/情報抹消)，跟entry標的《strange Fake》Berserker版(福拉特的從者)是完全不同角色——已改寫為千貌(shapeshift)/無固定實體/狂化被自身瘋狂悖論封印(classSkills故意留空fx)的本尊，`wars:'fake'`維持不變(玩家定案)。**尼祿**「縱使三度迎來落日」改掛 `god_hand`(階C·lives:3)取代誤用的 `survive`(見上一條)。
   - **📜 種子外觀二輪複查(2026-07)**：v42 那輪查證重心在六圍/技能/寶具，玩家事後盯著手機實機比對(從美杜莎「眼罩被寫成眼鏡」開始)發現外觀(persona.look)本身還有沒校過的錯，要求「全部種子外觀對照登場」重查一輪。6組研究agent逐一查證剩下35位(美杜莎已在同批修，見上方 v42 條目)，本輪修正7處：**美杜莎**眼鏡→眼罩、裹紗長裙→貼身黑色戰甲勁裝(緋色飾邊)，tic「推眼鏡」→「輕觸眼罩」(玩家點名發現)；**佐佐木小次郎**墨髮→紺(群青)髮；**赫拉克勒斯-Avenger(阿爾喀德斯)**膚色黝黑→詭異暗紅(捨神性後的膚色，非古銅曬痕)；**理查一世**碧眼→紅瞳、純金髮→金髮夾紅髮束；**阿基里斯**金髮→墨綠短髮(一縷瀏海遮左半臉，Apocrypha/FGO 官方唯一登場設計)——**複查時意外發現他其實從未在 strange Fake 原作登場過**(該作真正的 Rider 是 False Rider/蒼白騎兵 與 True Rider/希波呂忒)；**莫德雷德**銀甲→黑紅重鎧(紅雷只是寶具解放視覺，非鎧甲本體色)；**蒼白騎兵**蒼白朦朧的騎影→渾然漆黑的無形黑霧(無騎無影可言，御主暱稱他「黑先生」、真名「蒼白騎兵」要後來才揭曉，兩者反差正是原作設定巧思，`look`已補上這個梗，`wars:'fake'`本身查證無誤)。**查過未動**：伊莉雅-Caster(魔杖與 `classSkills` 的「道具作成(魔杖·露比)」本就掛鉤一致，判斷為刻意的魔法少女統一形象、非疏漏)、狂信者哈桑的雙麻花辮(查無來源佐證但也未被推翻，維持現狀)。其餘20餘位查證皆準確、未動。
   - **📜 二輪複查的兩項後續決定(2026-07·玩家拍板)**：①**阿基里斯 wars 改'客串'**——比照莫德雷德/迦爾納/阿斯托爾福等同為Apocrypha借用角色的既有慣例；同步從 `Seed_Rivals.gs` 的 `FATE_FAKE_ROSTER` 拔除他與「約翰·溫加德」那組配對(客串角色不進任一戰爭的正典陣容，也退出 chaos 亂鬥池，見該檔案 wars含'客串'的排除邏輯)。②**Rule Breaker「都改官方」**：查證官方描述是「妖しく七色に輝く歪な形の短剣」(妖異七彩流光的歪異短劍)，非紅色——全專案既定命名「緣紅短劍」正名為「七彩短劍」，一次改齊 4 個檔案 6 處：`Mystic_Code.gs`(禮裝 name/desc/flavor)、`Seed_Codex.gs`(美狄亞 persona.look/tic)、`Router_Bond.gs`(破戒奪僕戰報×2)、`Script.html`(前端系統訊息)。
   - **🐛→✅ 美杜莎(Rider) 女神的神核漏填階級(2026-07 修·v41，已於 v42 拔除)**：`{n:'女神的神核',r:'',fx:'divine_core'}` 空字串階級曾被補 D 階(比照她神性E-推論填的)。**v42 玩家質疑「神核只有真正神靈軀體才有，是不是有人拿到了」**——查證發現工房 `divine_core` 對任何自訂角色零門檻開放(無種族/神性交叉驗證)，順勢覆核全種子庫持有者：玩家貼萌娘百科美杜莎官方「保有技能」原文(魔眼A+/單獨行動C/怪力B/神性E-/天然呆)**沒有女神的神核**——v41 的 D 階是舊 session 純推論、未查證，予以拔除；改補原文確有列出、先前缺漏的單獨行動C(solo)。伊絲塔(女神的神核 A)同批覆核：查到的「B階」出自《FGO Material IV》，是【附身凜】版本(FGO/Babylonia)專屬資料，我們的伊絲塔是【附身菲莉雅】的 strange Fake 版本(見 persona 修正)，查無該版本專屬來源確認持有此技能，比照同一標準(查不到該版本確實有就不給)拔除。**現行 divine_core 持有者收斂為 3 位**：斯卡蒂A／阿基里斯B／迦爾納A(皆另掛神性 divine fx 佐證)——**稽核原則**：divine_core 代表「真正神靈軀體」，任一持有者若查無**對應版本/延伸**的官方來源明確列出，一律拔除，不因「神格強弱」或「其他版本有」而推論代入。順手補 `persona.look` 缺的服飾描述——玩家實機比對種子逐條檢查發現。
   - **🐛→✅ 赫拉克勒斯(Berserker) survive 與 god_hand 重疊(2026-07 修·v40)**：`fateStrike_` 判定順序 survive 先於 god_hand(見 45-82行)，只要致命傷前 hp>1，`survive` 就先免費把 after 撐回 1(after 不再 ≤0)，god_hand 的燒命判定永遠輪不到——十二試煉「每次瀕死真的燒一命」的設計等於形同虛設，只有連續兩次致命傷(中間沒回血)才會真正燒到第一命。Seed_Codex 查證：Avenger版(阿爾喀德斯)拔 god_hand 時特意保留 survive，證明兩者本應互斥擇一，Berserker版兩個都留是漏拔。已從 Seed_Codex.gs 的赫拉克勒斯-Berserker `skills` 拔除 `戰鬥續行(survive)`，只留 `十二試煉(god_hand)`。⚠ 若日後任何從者要同時掛兩者，先想清楚這個判定順序的相吞關係，別無意間讓其中一個變啞巴機制。
   - **🐛→✅ God Hand 優先序修正(2026-07)**：`fateStrike_` 原本「令咒緊急脫離」判定在 God Hand 之前，導致持 god_hand(如赫拉克勒斯十二試煉)的敵從者致命時，30%機率白白燒掉御主寶貴的令咒去逃命——牠自己就能免費復活，不該花這個資源。已對調順序：**God Hand(免費自復活)先判定，判定失敗/餘命燒盡才輪到令咒脫離**當最後手段。改一處要想「別的死法會不會也搶著判」的範例。
   - **🐛→✅ sealNote 別把「★」AI指令塞進玩家看得到的欄位(2026-07)**：`out.sealNote`(令咒脫離摘要)同時會被塞進 `rl.strikes[].note`(玩家直接看到的回合報告，不經AI)＋`aiPrompt`(AI才看)兩處。舊版把「★此撤離僅止於...與在場其他御主／從者無關」這句**AI專用鷹架指令**直接寫進 `sealNote` 字面，玩家在秒顯的數字戰報裡就會讀到裸露的「★」指令、莫名其妙。已把這句移出 `sealNote`，改在組 `aiPrompt` 時另外接上，`sealNote` 本身只留「發生了什麼」的乾淨敘述，兩個受眾各自拿到該給的版本。
   - **🌟 寶具對轟(2026-06)**：玩家開場 useNp＋目標敵從者且敵有寶具(且付得起prana) → `clashUrge`(0.6＋狂/暗殺0.25−殘血) 機率敵以寶具相迎。雙方算 `pPow/ePow`(resolveFateBattle np 火力，不直接扣血)→ 高者壓過、差額貫穿敗方、勝方回震15%；±10% band 內＝僵持相抵雙方小損。傷害經 `fateStrike_({forceDamage})` 套用(沿用死亡/勝負/復活/脫離)。設 `openingNp/openingSeal=false` 防回合迴圈重放。寫進 report.clash＋aiPrompt【寶具對轟】＋前端對轟卡。`fateStrike_` 新增 `opts.forceDamage`(略過 resolve 傷害、只跑後續結算)。
     - **🐛→✅ 對轟敵方多寶具沒選最強(2026-07 修·玩家要求複查戰鬥後發現)**：`enemyC0 = rowToCombatant_(...)` 建好後直接拿去對轟，從未設定 `npChoice`——`rowToCombatant_` 從 MEMORY 讀 npChoice，但敵方從未被 `setNpChoice_` 寫入過選擇(那只在玩家自己 atkIdx 呼叫)，永遠退回預設索引0。吉爾伽美什索引0是王之財寶(對人·概念階僅1)，不是他最強的乖離劍 Ea(索引1·對界·概念階6)——同一場戰鬥「敵反擊」段落有正確呼叫 `bestNpChoice_` 選最強寶具，唯獨「開場對轟」漏了同一步，前後不一致地低估敵方火力。已在建好 `enemyC0` 後立刻補上 `enemyC0.npChoice = bestNpChoice_(enemyC0.name, enemyC0.cls)`。
     - **🐛→✅ 對轟因果律判定只查玩家單向(2026-07 修·同次複查發現)**：因果律武器(gae_bolg，「死亡在投擲前已確定」)原本只查 `hasCausalityNp_(atkC)`(玩家攻方)，敵方持因果律武器(如庫丘林)時完全沒被檢查——玩家永遠不會在對轟裡被「因果律先行判定」直接擊敗，即便對手正是原作「必中即死」的蓋亞·博爾格使用者，且並非「雙方皆因果律」的邊界情況，是敵方單獨持有時就已失效。已補上對稱的 `enemyCausality`/`effectiveEPow` 檢查與「敵方截斷玩家」分支；連帶發現下方「回震保1」的通用防線(`Math.min(spill0, hp-1)`)會無差別把這個新分支算出的致死傷害又砍回保1，等於白修——已加 `pLethalOk` 旗標讓這個分支的傷害真正穿過保命線(對稱於玩家因果律那支本就能真的殺死敵人，不能只有單向能死)。
6. `fateStrike_`：包一次我方攻擊(回 aRoll/hit/damage/destroyed/knocked/victory/sealEscaped/godRevived)。
7. 回傳 `report`(前端 renderFateBattleReport 畫)＋`aiPrompt`(servantCard_+戰報，篇幅220~280)＋victory/defeat/dreamPrompt。

### 令咒
`getPlayerSeals_/setPlayerSeals_`(讀寫 MEMORY【令咒】N)。預設 3 道。

---

## 5. 種子庫（英靈殿/御主殿）

- **Seed_Codex.gs**：
  - `SEED_SERVANTS`(**20騎，2026-07 v52大清理後**：36→20，見下方新條目)：每筆 id/cls/realName/wars/gender/six/classSkills/skills/traits/np/align/**persona**。persona 物件={firstP,words,toMaster,**speech,moe,tic**}（全庫已補齊，貼原作）。
  - `SEED_MASTERS`(15名)：id/name/sex/appearance/magic/circuits/melee/magic_rank/home/wish/**persona**(4段頓號)/**back(身世)**/**moe(萌點)**。
  - `servantToHeroRow_` / `masterToCodexRow_`：物件→分頁列。
  - `seedFateCodex_(ss)`：英靈殿/御主殿為空才灌入(冪等)。版本 `CODEX_PERSONA_VER`(現行版號見 Seed_Codex.gs 頂端註解)，升版觸發 `upgradeCodexPersonas_`(英靈殿·整列覆寫+孤兒清理)＋`upgradeMasterCodex_`(御主殿)，皆不動客製。
    - **🐛→✅ upgradeMasterCodex_ 原本只刷 persona/back/moe 三欄(2026-07 修)**：circuits/home/wish/melee/magic_rank/appearance/magic 等會實際影響玩法的欄位(如迴路→敵御主魔力池 `masterPoolMax_`)完全沒有刷新機制——種子校正的數值永遠進不了已部署試算表的既有列，只有全新建表才吃得到。已改成比照 `upgradeCodexPersonas_` 的整列重寫(`masterToCodexRow_`)+孤兒清理(只刪 `source==='seed'` 者，御主殿本就是純唯讀參考表、不存玩家自創資料，清理安全)。
    - **📜 御主庫首次深度校對(2026-07·v44)**：玩家要求「跟英靈殿同規格」查證15位正史御主，3組研究agent逐一比對原作+我親自複核，原則「描述要準確但精簡、不寫死、留白給AI表演」。修正：遠坂凜 back「次女」→「長女」(她是姊姊)、間桐慎二 back「養子」→「血親獨子」(他才是間桐親生子，妹妹櫻才是被收養頂替魔術後嗣的)、間桐臟硯 wish 改「逃脫死亡+視奪杯為餘生消遣」(原「到達根源」是他早已放棄的舊初衷)、黑化間桐櫻 circuits 90→50(她本人天賦與凜同級·人類頂尖水準，無限魔力來自聖杯泥附體、已在magic欄體現、不該混進她自己的回路數字)、衛宮切嗣 circuits 35→15+magic_rank B→C(原作明寫他回路質量差、真正殺傷力在起源彈與戰術非魔術本身)、肯尼斯 circuits 50→65+home補「海特飯店」、韋伯 circuits 25→15+home補「麥肯基宅」(原作明寫他是時鐘塔墊底資質，與肯尼斯拉開懸殊差距)、雨生龍之介 wish「召喚惡魔」→「見識新奇殺戮」(誤植·他對聖杯本身無興趣)+home補「碼頭倉庫」(未用未經查證的「澪標川」河名，改掛已驗證的既有「碼頭」據點，避免自創地名跟遊戲內唯一河流「未遠川」衝突)。
    - **🧹 種子庫大清理(2026-07·v52，玩家定案「只要第4次第5次+斯卡哈/伊莉雅/美遊/小黑/恩奇都/銀狼，其他客串fake先刪除」)**：
      `SEED_SERVANTS` 36騎砍到20騎——只留 4th/5th 正典14騎(`阿爾托莉雅-Saber`/`EMIYA-Archer`/`庫丘林-Lancer`/`美杜莎-Rider`/
      `美狄亞-Caster`/`佐佐木小次郎-Assassin`/`赫拉克勒斯-Berserker`/`吉爾伽美什-Archer`/`迪盧木多-Lancer`/`伊斯坎達爾-Rider`/
      `吉爾德萊-Caster`/`百貌哈桑-Assassin`/`咒腕之哈桑-Assassin`/`蘭斯洛特-Berserker`)＋玩家指定保留的6騎客串
      (`斯卡哈-Lancer`/`斯卡哈-Assassin`/`恩奇都-Lancer`/`美遊-Saber`/`小黑-Archer`/`伊莉雅-Caster`，供慾海鑑賞直接召喚用)。
      刪除16騎純客串／偽聖杯專屬從者：`赫拉克勒斯-Avenger`/`斯卡蒂-Caster`/`理查一世-Saber`/`阿基里斯-Rider`/
      `開膛手傑克-Berserker`/`蒼白騎兵-Rider`/`狂信者哈桑-Assassin`/`伊絲塔-Archer`/`莫德雷德-Saber`/`迦爾納-Lancer`/
      `阿斯托爾福-Rider`/`賽彌拉米斯-Assassin`/`尼祿-Saber`/`玉藻前-Caster`/`牛若丸-Rider`/`貞德-Archer`。
      `恩奇都-Lancer` wars 從 `['fake']` 改 `['客串']`、`吉爾伽美什-Archer` wars 從 `['4th','fake']` 拔掉 `'fake'` 只留 `['4th']`。
      **連動清理**：`Seed_Rivals.gs` 的 `FATE_FAKE_ROSTER`(原7組偽聖杯敵對配對)＋`fakeMasterRow_`(合成匿名御主)＋
      `seedRivalsForGame_` 的 `war==='fake'` 分支整段移除——原本「銀狼×恩奇都」是這份陣容裡唯一沒被砍掉服兵役的配對，
      但其餘6組敵人全沒了、單留1組不成一場戰爭，玩家拍板讓恩奇都改為純鑑賞召喚角色、不再掛任何開局戰爭
      (`masterSynergySix_`/`masterSynergyOn_` 的銀狼×恩奇都全盛synergy機制本身沒動，只是失去自動配對觸發點，
      理論上仍可靠手動 MEMORY『【御主】銀狼』標記觸發，只是遊戲內已無正規管道自動寫入)。「偽聖杯戰爭 Fake」開局
      選項一併從 `Index.html`(chooseWar按鈕)/`Script_Onboarding.html`(`chooseWar`函式的 fake 特判)/`Router_Creation.gs`
      (`['4th','5th','fake']`戰爭白名單、`getWarName_`的正則)拔除，三處全部同步只認 `4th`/`5th`。**chaos 亂鬥模式不受影響**
      (原本就靠 `wars` 含 `'客串'` 排除、非硬編碼名單)。`upgradeCodexPersonas_` 的孤兒自動清除機制(只刪 `source==='seed'`
      者、不動玩家自創/已在世從者)會在下次版本號比對時自動把這16騎從「英靈殿」分頁清掉，不必手動動試算表；
      已經在世的舊存檔角色(若曾召喚過這16騎中的任何一位)不受影響，只是之後不能再重新召喚。`CODEX_PERSONA_VER` v51→v52。
    - **📜 全種子庫減贅述(2026-07·v46)**：系統性盤查發現 persona 各欄之間大量逐字重複同一特質——`SEED_SERVANTS` 常見 `look` 尾段(自稱「X」後的語氣描述)直接抄一遍 `speech`(如小次郎 look「古風文雅」＝speech「古風文雅」)，或 `words`/`moe` 互相重述同一萌點；`SEED_MASTERS` 則是 `persona`(4段性格標籤，會被 `masterCard_`/`enemyMasterCard_` 拆解顯示，**結構不可動**)跟 `moe` 逐字重複(如遠坂凜「人前完美」persona/moe各講一遍、言峰綺禮-4th「尚未墮落的空虛」persona/moe幾乎一模一樣)。修法：`SEED_SERVANTS` 挑 look/speech/moe 中較次要的一份砍重複子句；`SEED_MASTERS` 一律只砍 `moe`(因 `persona` 欄位被程式依「・」切開消費、不能動結構)，留下 persona 沒講到的獨特細節(如「叔父般的疼惜·非生父」這種釐清關係、防 AI 誤讀的關鍵資訊絕不砍)。15騎英靈(赫拉克勒斯-Avenger/小次郎-Assassin/蘭斯洛特-Berserker/斯卡哈-Lancer/迦爾納-Lancer/賽彌拉米斯-Assassin/伊絲塔-Archer/阿基里斯-Rider/狂信者哈桑/咒腕之哈桑/伊斯坎達爾-Rider/牛若丸-Rider/玉藻前-Caster/美杜莎-Rider/開膛手傑克-Berserker)+12名御主(除間桐慎二/葛木宗一郎/言峰綺禮-5th外皆有調整)，濃度提高但骨肉不變。
    - **📜 4th/5th/fake 戰爭參戰資料逐一核對(2026-07)**：玩家要求「參戰作品與資料必須相符」，依優先序(4th/5th重點→fake次要→客串暫不動)逐批派研究agent比對原作+我親自複核(如雨生龍之介 home「碼頭倉庫」agent誤判該改成「未遠川」，經比對 `Setup_FateWorld.gs` 地圖節點確認原資料才是對的、未採用該建議)。確認修正：士郎(`SEED_MASTERS`) circuits 30→27(官方常引數字，非30；魔術迴路品質差才是他的真正弱項，此欄僅管數量)；理查一世-Saber 御主(`Seed_Rivals.gs` `FATE_FAKE_ROSTER`) 原「歐蘭多·里夫」實為偽Caster(大仲馬)御主／史諾菲爾德警方魔術師，從未當過Saber御主，已改「沙條綾香」(原召喚者卡休拉儀式中途遭偽Assassin所殺、綾香繼承令咒因果而成真御主)。其餘核對皆確認已正確(神核殺神性、迴路/身世/居所等既有調整、Enkidu御主銀狼非巴茲狄洛特、Gilgamesh(fake版)御主提奈·切爾克)。**擱置未動**(數值有爭議、涉戰鬥平衡風險過高、不同來源互相矛盾，需玩家親自決策而非片面改動)：阿爾托莉雅六圍(NP rank爭議，兩份獨立研究皆質疑現有A++疑似FGO後期強化值混入)、Gilgamesh對魔力/單獨行動方向性、迪盧木多六圍、伊斯坎達爾幸運、百貌哈桑技能與寶具命名(涉及fx機制、非僅敘事)、蘭斯洛特六圍、伊莉雅wish欄措辭、遠坂凜迴路數字、蒼白騎兵幸運C/EX。
- **Seed_Rivals.gs**：開局鋪敵。
  - `seedRivalsForGame_`：依 war(4th/5th/fake/chaos)鋪敵御主+敵從者；移除玩家扮演的那組。**混亂(chaos) hPool【含】玩家原創 ai_gen**(2026-07 玩家定案「原創角色可以進去 確實隨機就好」——曾短暫排除 ai_gen 又還原；「都抽到尾端」體感＝原創數量佔比高，Fisher-Yates 本身無偏差。`actionSummonServant` 隨機召喚分支同樣全池均勻抽)。
  - `masterToNpcRow_`：御主殿列→敵御主眾生列。BACK←身世(+外貌)、INTENT←萌點、PREF←persona 解析、凡人弱數值、MEMORY=【願望】|【魔術】。
    - **🐛→✅ TRAIT 原本跟 PREF 抄同一份 PERSONA(2026-07 修)**：導致 `enemyMasterCard_` 印出的「性格」「特徵」逐字重複。已比照 `heroToNpcRow_`(TRAIT=外貌、PREF=性格 分開兩欄)，TRAIT 改讀 `mAppear`(種子 appearance 外貌欄)。
  - `heroToNpcRow_`：英靈殿列→敵從者眾生列。
  - `canonHeroNames_`：正史6騎真名(禁玩家搶角)。
- **Seed_Canon.gs**：📜 正典劇情插針系統 **已退役(2026-06 玩家定案·沒啥用處)**。`checkCanonPins_` 留 no-op 空殼(永遠回 {beats:[],leads:[],route:""})；actionMove/actionRest 不再呼叫、前端不再顯示 canonBeats/canonLeads；CANON_PINS 資料＋lockRoute_/spawnGilgamesh_/blackenFoe_/shadowDevourFoe_/route 讀寫 一併移除。**未動**：正史/混亂【戰爭】模式＋扮演正典御主(敵方陣營生成，在 Router_Action)。MEMORY【路線】【史】成無用遺留。

---

## 6. 禮裝 Mystic_Code.gs（2026-06 全面被動化）

- **★禮裝全部被動·持有即生效·無主動發動**（玩家定案）：戰鬥時自動加持「我方從者」，不再有按鈕／充能／迴路門檻／起源彈狙御主。
- `MYSTIC_CODES{}`：每項 `{name,type,fx,tier,desc,flavor}`。type＝`passive`(avalon/魔力寶石/黑鍵) 或 `special`(rule_breaker 破戒奪僕·另套機制)。fx 進 `MC_COMBAT_` 表。
  - **⚠ 2026-07 玩家定案·砍 3 項**：寶石劍(jeweled_sword)／月靈髓液·水銀(volumen)／起源彈(origin_bullet) 連同其 fx(mc_jewel/mc_mercury/mc_origin) 一併移除(前端下拉選單同步拔除選項)。舊存檔若剛好裝著這 3 項——`masterMysticBuffSkill_`/`get_tags`(Router_Action.gs) 皆已對 `MYSTIC_CODES[id]` 做 null 檢查，靜默退回無禮裝狀態(不噴錯、不用另外遷移)。
- **`MC_COMBAT_{fx→{hit,dmgAdd,npMul,npDefMul,label}}`**：禮裝戰鬥效果表（單一調平衡點）。現存 3 項：mc_blackkey(命中+2)／mc_jewel_minor(命中+1,傷+10)／avalon(承受寶具×0.82 ＋ Time_World 時回×1.6)。
- **接線**：`masterMysticBuffSkill_(memory)`→{n,r,fx}；`injectMysticBuff_(c,masterMemory)` 把禮裝 fx 注入我方從者戰鬥單位 skills(冪等)。在 Router_Action `actionFateBattle` 三處注入：atkC(2198·含開場對轟)、每回合 sC、以及 `fateStrike_` 內 defC(我方從者作守方·吃 avalon 減傷)。引擎 `mcCombatFx_(c)` 在 `resolveFateBattle_` 三通道讀取(命中/winner攻/loser防)。注入只在戰鬥單位、不寫回 row。
- `getMystic_/setMystic_`(MEMORY【禮裝】id；**【禮充】充能已廢除**)、`masterMysticFx_`(查單一 fx，如 Time_World avalon)。
- **⚠ 2026-07 盤查·財力→禮裝的門檻其實已名存實亡**：`rollMysticForMaster_(standing,circuits)`(身世/財力→起始禮裝機率的完整實作，富/名門/鐘塔/教會(或迴路≥45)→30%頂級；清貧/孤兒(或<20)→50%空手)**現無任何呼叫者**——創角(`Router_Creation.gs` create handler)改成玩家直接自選 `userData.mystic`，只驗證是不是合法的被動禮裝 id，完全不看身世/迴路。前端下拉選單也是平的，不分財力層級。**玩家定案(2026-07)：維持自選、不恢復財力/迴路門檻**("迴路限制沒啥用")——`rollMysticForMaster_`/`pickByTier_` 保留原樣(供未來「戰中掉落」用途用，非死碼但目前無呼叫點)。
- `canRuleBreak_(pcData,pIdx,gameId)`：是否具破戒力(召 Caster美狄亞 或 持破戒禮裝)。
- ⚠ 已移除：`actionUseMystic`／`applyMysticDamageToServant_`／`getMysticCharges_`/`setMysticCharges_`／前端 `mysticStrike`/`renderMysticReport`/敵卡禮裝鈕。

---

## 7. 時間/AP/供魔 Time_World.gs

- `getClock_/writeClock_`：**2026-07 重構**——不再是獨立「時鐘」表，日/時/AP 直接存在【御主自己那一列】(COL.PC.DAY/HOUR/AP)，因每個世界(game_id)恆只有一位御主、天然 1:1 對應御主列，無需獨立 join 表。
- `getAp_/spendAp_(gid,n)/grantAp_(gid,n)`(不推時間)、`restHours_`(休息補AP)、`rollHours_`、`timeBand_`(晨/午/夜)、`clockLabel_`(顯示字串)。
- AP：每日12，移動2AP、戰鬥/偵查/補魔/禮裝/結盟/共處=1AP、休息每hr補2。
- `playerServantEconomy_`：**御主魔力**收支(左側 HUD，含 output/outputLabel)。**工房加成＝atHome‖hasTerritory‖atWorkshop**(atWorkshop 讀御主【陣地】marker，須與 applyRegen_ 對齊，否則設陣地 HUD 顯示不出 +8 時回)。`servantEconomy_`(income=迴路供給+靈脈+工房；drain=六圍/8×狂化)。**🔋 共用池 `applyRegen_`(2026-06)**：御主MP 是共用池——重算上限 `masterPoolMax_(迴路, Σ從者魔力)`；income(迴路供給＋靈脈＋工房＋Σ從者魔力×0.15)×mult − Σ(從者 drain × `outputTier_(出力).drainMul`)；從者出力檔不在時回變動；御主乾涸(連維持都湊不出)→強制全從者降【出力】20% ＋從者 HP 流血(靈基崩解 4%/hr)。御主HP/從者HP 自我修復 5%/hr×(avalon1.6)。`leylineAt_`、`masterCircuits_`(MEMORY【迴路】N 預設30)。
- `worldTick_`：跨時推進世界。

---

## 8. 同盟系統（§本 session 新增）

判定全在 GAS，AI 只演出。
- `isAllied_(row)`：MEMORY 是否帶【盟約至】N。`allyUntil_/setAllyMem_/clearAllyMem_`。
- `allianceWillingness_(masterRow,aliveFoes)`：結盟意願(base.42；務實+.25/孤高-.32；剩≤3騎-.45)。
- `actionProposeAlliance`：對同地敵御主提議，`Math.random()<willingness` 判定。成→盟主+其同地從者標【盟約至】day+3。
- `actionBreakAlliance`／`breakStaleAlliances_`：撕毀／自然瓦解(效期到 或 在世敵從者≤3 強制翻臉)。**2026-07 修**：原本只在 `actionMove` 呼叫，玩家只休息不移動就永遠不會過期/強制解盟——已在 `actionRest`(worldTick_ 剛推進時間之後、同一份 pcData 傳參考)一併呼叫。
- `actionAllyBond`：與同地盟友共處，耗1AP，`bumpBond_`升羈絆(無列則建)，達90標【鑑賞緣】(戰後入鑑賞)。SFW only，卸防可能被未結盟敵突襲。`getBond_/bumpBond_`。
- **協同強襲**(actionFateBattle 內)：盟友從者每回合助攻一擊。
- **情報共享**：`hasAllyInGame_` 有盟友→地圖無視 SEEN 迷霧全揭露(get_map_nodes/categorized 都吃)＋敵從者職階揭露(getLocalPeopleList `intelCls`)。
- **前端 override**：`getLocalPeopleList`(Core_Settings.gs) 把結盟的敵御主/敵從者 faction 改顯 `盟友御主/盟友從者`(`allied:true`)，前端不列為可攻擊。

### 🔒 game_id 資料分流稽核(2026-07)——多帳號/多局同名撞列修復
「可多帳號遊玩，但資料必須分流不污染」是專案定案的硬性要求(`game_id` 實例化＋帳號綁定)。系統性盤查找出多處「純比對姓名、沒比對 game_id」的讀寫，若不同局(甚至不同帳號)剛好有同名角色(種子庫有限、AI 原創從者都可能撞名)就會跨局洩漏/污染：
- **🐛→✅ `actionGetFullStatus`(Router_Action.gs)**：查某角色詳細狀態原本純比對 `NAME`，沒有 game_id 過濾——已改為先現查呼叫者自己列的 game_id，再用 `sameGame` 條件過濾候選列。
- **🐛→✅ `actionUpdateRelTag`(Router_Action.gs)**：重新定義稱呼只靠姓名+「同行」旗標找列寫入 `REL_TAG`，「同行」旗標只保證該列自己標同行、不保證是同一局——已補同款 game_id 比對。
- **🐛→✅ `actionPlay`(Router_Narrative.gs) 三處**：①組 prompt 時查找同行夥伴詳情(63行)漏 `sameGame`；②AI 回合結束後把玩家新座標寫回同行夥伴列(471行)漏 `sameGame`，會把玩家的新座標寫到「別局」同名者身上，悄悄把對方傳送到隨機地點；③累計交談輪數時全表比對姓名(485行)漏 `sameGame`，會誤把交談次數寫進別局同名列。三處皆已補上該檔案既有的 `sameGame(r)` helper。
- **🐛→✅ Gallery.gs 鑑賞(kanshou)帳號歸屬完全沒驗證** — 見上方「後日談同伴管理」條目，是本輪最嚴重的一項。
- **🐛→✅ 破戒奪僕漏擋盟友(2026-07 修)**：`actionRuleBreakSteal`(Router_Bond.gs) 原本沒查 `isAllied_`，玩家可以先跟殘血敵從者的御主結盟、再對這個「盟友」發動破戒奪僕，繞過「盟友不可攻擊」規則。已補上與 `actionFateBattle` 同一道 `isAllied_` 閘門。
- **🐛→✅ 卸防突襲沒有 `severed`(斬斷救贖)概念(2026-07 修)**：`fateStrike_` 正規戰鬥中，帶 `rule_breaker`／`anti_magic_lance` 的攻方用 `severed` 旗標擋掉目標的「戰鬥續行」與「十二試煉」復活；`enemyAmbushOnServant_`(卸防偷襲，Router_Movement.gs)原本沒這個判斷，同一敵從者用同樣寶具偷襲卻繞得過復活封鎖。已補上同款 `severed` 閘門。

---

## 9. 鑑賞 Gallery.gs（奪杯後/慾海入口）

- `actionClaimGrail`：奪杯→AI 寫後日談回憶(memoir)→寫入「鑑賞」表→**同盟封存**(羈絆90↑或【鑑賞緣】的盟友一併入冊，御主搭檔 CLS="御主")→`purgeGameData_` 清本局。
  - **🐛→✅ 封存時外貌/肉體憑空消失(2026-07 修)**：「鑑賞」表 schema(`COL.GAL`)原本只有15欄，沒有 TRAIT(外貌本相)也沒有 PHYSICAL(肉體)——封存當下這兩欄直接被丟棄，`kanshouServantRow_` 重建同伴列時 TRAIT 永遠是空字串(慾海每個同伴的外貌描述都吃到「無」)，連 MEMORY 都整段被覆寫(召喚時 stamp 的【口吻】【小動作】一併消失)；PHYSICAL 空白時不論性別統一預設 `{"蜜穴":"未開"}`，男性同伴也被塞女性生理結構起始值。新增 `COL.GAL.FORM`(第16欄「外貌肉體」，`ensureFateSheets_` 自動補尾端表頭)，用 `buildGalleryForm_(row)`/`applyGalleryForm_(sRow,formStr,sex)` 把 TRAIT(固定錨，非 AI 每次重新詮釋)＋STATUS 的姿勢/顏面(戰爭落幕那刻的姿態，不再重置成通用預設)＋PHYSICAL(若戰時已有紀錄則原樣帶走)合併一格 JSON 帶過去；PHYSICAL 若無紀錄則依實際性別給正確起始值(男→肉棒/女→蜜穴+菊穴)，之後由既有的 `pfb`/`nfb.physical_state` 機制(Engine_Combat.gs 紅線區·未動)接手動態演進。`actionClaimGrail` 的主角色與同盟封存兩處都已接上 `buildGalleryForm_`。
  - **🎨 玩家定案·不開放男男配對(2026-07)**：`actionEnterKanshou` 本就強制慾海御主性別二選一(男/女)，故只需擋「御主=男 且 同伴=男」這一種組合。`actionKanshouAdd` 邀請關卡直接擋(回錯誤訊息)；`actionKanshouCompanions` 的可邀清單同步濾掉，UI 上根本不會列出。同伴性別非「男」(含女/異/無)一律放行，女女/男女皆可。連帶修正 `Router_Narrative.gs` 的 `genderHintStr`：原本「異/無」這類非二元性別值(如開膛手傑克「無固定實體」)完全沒被正規化，直接落入模糊的「依雙方實際性別器官裁決」丟給 AI 猜——已改成非男/女一律按女性向處理(跟 `applyGalleryForm_` 的肉體起始預設一致)；已無法出現的「男男」分支一併移除。
- `actionEnterKanshou`：每帳號【單一常駐】後日談世界(KPC_ 御主 avatar，id 持久接續歷史)。首進需 `pcName/pcSex`(否則回 `needSetup`)。對話仍走 `actionPlay`(NSFW，引擎不動)。
  - **🐛→✅ 首進只問姓名+性別，BACK/TRAIT/PREF/INTENT 全空(2026-07 修)**：玩家反映「同伴都有身世/外貌/個性，御主本人卻只有姓名+性別，太空洞」——查證 `actionEnterKanshou` 建 KPC 列時確實從未寫這4欄，`Router_Narrative.gs` 的【玩家命格】提示詞段落(性格/特徵/身世)對慾海御主本人永遠是空字串，AI 對玩家角色本身毫無設定可依。比照 solo 創角(`actionManualNpc`+`actionBackfillMasterAi`)的「先種子秒建、AI背景潤色」兩段式模式：`askKanshouSetup` 彈窗加開3個可留空欄位(外貌/身世/個性方向)，`actionEnterKanshou` 建列時用這些片段(或預設語句)秒寫 BACK/TRAIT/PREF/INTENT(非阻塞，不等AI)；新增 `actionBackfillKanshouAi`(action `backfill_kanshou_ai`，仿 `actionBackfillMasterAi` 結構、系統prompt改寫成「聖杯戰爭已結束的後日談角色」語境)於進場後在背景呼叫 AI 潤色同4欄，失敗則保留種子預設。只在**首次建檔**(`needSetup`分支)才觸發背景AI呼叫，非每次進場重跑。已加進 `LOCK_EXEMPT_ACTIONS_`(純敘事單格寫入，不佔全域寫入鎖)。
    - **🐛→✅ 性別鈕一點就直接送出整張表單(2026-07 修)**：玩家反映「性別是選項，不該點了就登入」——`askKanshouSetup` 原本♀/♂兩鈕的 onclick 直接呼叫 `done(sex)` 送出整份表單，等於外貌/身世/個性方向欄位根本來不及填就被提交關窗。改成純選取(點擊只切換高亮框、記錄 `selectedSex`)，另加一顆「✨ 進入後日談」鈕才真正讀取全部欄位並 resolve；未選性別就按確認鈕會提示先選。
- `actionKanshouCompanions/Add/Remove`：後日談同伴管理(上限3，住獨立「鑑賞眾生」分頁，`kanshouServantRow_` 建列)。`actionKanshouSetSex/SetName`：改 avatar 性別/名字。
  - **🆕 直接從英靈庫召喚(2026-07·與「封存後邀請」並存)**：玩家定案「解鎖機制太混亂，先求有」——不必先在 solo 打贏一場戰爭封存，`actionKanshouSummonHero`(action `kanshou_summon_hero`)可直接從英靈殿挑一位召喚進慾海，`heroToKanshouRow_` 建列。**刻意不帶戰鬥資料**(SIX/TAGS/MARTIAL 留空——慾海無戰鬥，養這些只白增加 AI 誤讀風險)；性格/外貌/萌點從 `heroRow[COL.HERO.PERSONA]` 的 `words/look/moe` 取，口吻/小動作照樣用既有 `stampPersonaFlavor_` stamp 進 MEMORY。**好感給 45**(尚淺·剛認識，非封存路徑「並肩奪杯」的90)——若直接給高好感或滿好感，會架空 `Router_Narrative.gs`「好感未滿80/性格冷酷高傲者要演出真實戒備」那條一致性鐵律，冷艷/高傲角色會被迫演出不符設定的毫無防備；45 讓角色自己的性格決定要花多久暖起來。性別/男男配對規則、PHYSICAL 起始值判斷與封存路徑共用同一套邏輯(見上方 `buildGalleryForm_`/`applyGalleryForm_` 一節)。前端 `openCompanions()` 並行拉 `kanshou_companions`＋`get_heroes`，新增「🌹 直接從英靈庫召喚」清單區塊(`kanshouSummonHero(heroId)`)，濾掉已在場者。演出卡欄位(性格/外貌/萌點)讀的是通用 COL.PC 欄位，不管資料從哪條路徑來、完全不用改。
    - **🆕 直接召喚後AI深化(2026-07 玩家定案「C.只在召喚當下用AI動態補一次」)**：玩家發現召喚出的同伴「個性/身世都好短」——查證確認是種子庫本身如此：`SEED_SERVANTS` 的 `persona.words`(個性)全庫普遍只有2-3項精簡標籤(非御主庫的4段格式)，且 `SEED_SERVANTS` **schema 本身沒有 `back`(身世) 欄位**(只有 `SEED_MASTERS` 才有)，`heroToKanshouRow_` 也確實從未寫入 `COL.PC.BACK`——不是召喚流程的漏洞，是種子資料密度問題。玩家選擇**不動 `Seed_Codex.gs` 本體**(solo戰爭仍吃原始精簡版)，改在**召喚當下額外補一次AI深化**：新增 `actionBackfillKanshouServantAi`(action `backfill_kanshou_servant_ai`)，帶著既有的精簡 `外貌/個性/萌點` 當上下文餵給AI，要求「忠於原作、把既有精簡設定潤色補完」(非重新發明角色)，回傳4段個性＋身世摘要(≤20字)＋可選外貌補充(既有描述已完整則留空，不覆蓋)。前端 `kanshouSummonHero` 只在 `res.isNew`(真正新召喚，非「歡迎回來」既有列)才背景觸發，避免洗掉玩家日後用「📜詳細狀態→逆天改命」的手動調整；失敗靜默保留種子原樣。單格 `setValue`，仿 `actionBackfillMasterAi`/`actionBackfillKanshouAi` 的非阻塞模式。
      - **🐛→✅ 二修：召喚全程無讀取畫面/無完成提示(2026-07 玩家反映)**：原本召喚本身＋背景AI深化兩階段都悄悄進行，玩家看不出有沒有跑、也不知道跑完了沒。改用既有 `showProcessing`/`hideProcessing`(Script_Onboarding.html)蓋讀取畫面，兩階段各自換訊息(「正在以令咒召喚英靈…」→「✨ 正在深化「XX」的個性與身世…」)；深化結束無論成功或失敗都跳一句明確結果(失敗會提示「已保留原始設定，可用📜詳細狀態手動調整」)，不再讓玩家自己猜。
      - **🐛→✅ 三修：卡片列表下方突兀跑出一顆「詳細狀態」(2026-07 玩家反映「這邊怎麼單獨跑出這個」)**：查證這其實是既有的固定功能(`Index.html` 的 `#pane-status` 面板)，恆看「御主自己」的狀態(`triggerDrawerAction('status')`→`openStatus()` 無參數＝pc自己)——不是任何卡片的附屬按鈕，只是位置緊鄰卡片列表最後一張(如美杜莎)，跟卡片自己的「📜詳細狀態」鈕視覺上太像，才顯得像憑空多出來的孤兒按鈕。改標籤「👤 我的詳細狀態」消歧義，功能不變。
      - **🐛→✅ 四修：召喚同伴的身世/個性被寫成戰場傳說(2026-07 玩家反映)**：`KANSHOU_SERVANT_GEN_SYS` 原本只要求「這位英靈原作的身世/來歷精簡摘要」——對正典英靈而言，「原作身世」本來就是她的英雄傳說/神話戰役，AI 據實回答就自然寫出戰場/征戰/對神之戰的內容，跟鑑賞後日談「聖杯戰爭已落幕的和平現代都市」基調直接衝突。改成明確要求：性格核心不變，但場景改寫成她在「現在這段平和日常」怎麼過生活(如習慣去哪散步、對什麼小事認真、私下沉迷什麼)，background 明文禁止出現戰爭/戰場/征服/神話戰役等詞。種子資料本身沒抓錯(look/words/moe 原封不動)，錯在 AI 深化的敘事基調沒對齊已建立的鑑賞哲學。
      - **🐛→✅ 五修：四修矯枉過正，同伴變成查無此人的普通現代人(2026-07 玩家反映「根本看不出來是從者本人日常化，像跟很像的別個角色相處」，實例：美杜莎 background 生成「在城市角落租了間小公寓，習慣於細心照顧室內的盆栽」——完全查無「美杜莎」痕跡)**：四修拿掉戰場敘事的手法是【完全禁止提戰爭/戰場/征服/神話戰役等詞】——矯枉過正，不只禁掉了戰役細節，連「她其實是被召喚而來的傳說英靈」這個身分本身都被連根禁掉，AI 只能生出跟角色本身毫無關聯的普通市民生活側寫。改成中庸版：明文加回「她終究是被召喚而來的傳說英靈，不是憑空生成的普通現代人，這份身分底色不必也不該被抹除或假裝不存在」，background 指示改為「不需要複述具體神話戰役細節，但可以自然帶到非比尋常的出身/氣質偶爾流露的痕跡...重點是這一句要讓人一看就知道『是她』而非查無此人的普通人」。**注意此修法的作用範圍**：`actionBackfillKanshouServantAi` 是逐一實例執行、不像 `getOrComputeDailyHeroFields_`(DAILY_LOOK/DAILY_WORDS) 那樣快取在英靈殿本體——這次修正只對**之後全新召喚**的英靈生效，玩家帳號裡已經生成過的舊同伴(如上例美杜莎)PREF/BACK 已經寫死在自己那列 PC 資料上，不會自動重新生成，需要玩家自己用「📜詳細狀態→改命」手動改寫，或請走重召但目前「重召現有列」的路徑(`existingIdx` 分支)不會重觸發這個深化、只是喚回原本資料——尚未提供「重新深化既有同伴」的一鍵入口。
      - **🔠 六修：玩家簡化「與其寫一長串規則、不如直接給基調範例」**：五修那版用一整段文字解釋「不必抹除身分但也不必複述戰役」，玩家提議改用具體作品當基調錨點——《衛宮家今天的餐桌風景》(Fate官方外傳，角色性格/氣場/招牌語癖原封不動，只是活在和平日常裡煮飯吃飯)正是「日常化但不失身分」這個需求的現成範例，比自己寫一堆規則描述更省字、更精準(AI 對這部知名官方外傳本就有語料認知，直接引用比重新定義規則更可靠)。已把 personality/background 說明段落前的整段規則描述，換成一句「想像《衛宮家今天的餐桌風景》那種基調」，background 的具體指示也同步簡化成「比照《衛宮家》那種寫法」。
      - **🔠 七修：同一個《衛宮家》錨點延伸套用到 `translateAppearanceToDaily_`(玩家貼出該函式全文「這裡就要先改成餐桌了!!!」)**：外貌日常化翻譯(`Gallery.gs`，把戰時裝束轉譯成日常穿搭的獨立函式，跟六修改的 `KANSHOU_SERVANT_GEN_SYS` 是不同函式)原本也是用兩大段規則文字分別解釋「外貌段落怎麼轉」跟「氣質神情怎麼轉」——同樣的問題、同樣的解法：開頭補一句「這是 Fate／聖杯戰爭的平行世界日常線，想像《衛宮家今天的餐桌風景》那種基調——換上現代日常穿搭，但一看就知道是她本人」當基調錨點，兩段規則描述隨之瘦身(拿掉「如黑紅配色、華麗/樸素/暴露等調性」「如戰場的殺氣、威壓、瘋狂等激烈神態，可轉為日常裡偶爾一閃而過的銳利」這類舉例性文字，核心規則保留)。跟六修同一個效益：省字數、且用具體作品定調比自己重新定義規則更貼近「日常化但保留身分識別度」的訴求。
      - **🧹 八修：命名一團亂＋consolidation 漏了一個(2026-07 玩家問「KANSHOU_SERVANT_GEN_SYS／translateAppearanceToDaily／KANSHOU_GEN_SYS 為啥這麼亂?」)**：查出兩個獨立問題。①**命名碰撞**：`actionBackfillKanshouAi`(御主本人生成)裡的 system prompt 變數叫 `KANSHOU_GEN_SYS`，跟 `actionBackfillKanshouServantAi`(從者深化)裡的 `KANSHOU_SERVANT_GEN_SYS` 只差一個「SERVANT」，一眼難以分辨兩者用途(一個是從零生成御主、一個是深化既有從者，性質完全不同)；且 `Router_Creation.gs` 還有一個平行的 `MASTER_GEN_SYS`(solo 御主生成)——三者本該是同一組命名家族卻各自為政。已把 `KANSHOU_GEN_SYS` 改名為 `KANSHOU_MASTER_GEN_SYS`，跟 `MASTER_GEN_SYS`(solo)/`KANSHOU_SERVANT_GEN_SYS`(鑑賞從者)三者對齊成清楚的「軌道+角色」命名規則，一眼就能分辨。②**consolidation 漏網之魚**：稍早那輪「鑑賞集中到 Gallery.gs」明明是同一批工作，卻漏搬了 `translatePersonalityToDaily_`——它是 `translateAppearanceToDaily_`(已在 Gallery.gs)的親兄弟(兩者一起被 `getOrComputeDailyHeroFields_` 呼叫，各轉性格/外貌其中一半)，卻還留在 `Core_Settings.gs`，跟自己的搭檔隔著檔案。已補搬過去，緊鄰 `translateAppearanceToDaily_` 之後，兩個「XToDaily_」翻譯函式終於同居一處。順手把這顆的提示詞也補上《衛宮家》基調錨點(比照六七修)，且修正了一句過期的程式碼內註解(原本寫「跟上面 enrichPersonalityLikesDislikes_」，該函式其實在別的檔案，搬過來後「上面」已不成立，改成明確點名檔案)。**這次同樣是查明後才動手**：先用 `grep` 找出全部相關識別碼列出來看全貌，確認命名家族關係與檔案位置後才決定改名/搬移方案，不是看到「亂」就隨手改。
      - **🧹 九修：玩家追問「到底哪些有用到那些沒有用到」，全面死碼稽核(先鑑賞)**：派子任務逐函式核對(`COL.PC`/`COL.HERO` 欄位是否真存在、變數是否真被讀取、參數是否真被用到)，我自己再逐項驗證過才動手，避免子任務的誤判。確認 `Gallery.gs` 全部 19 個頂層函式皆有真實呼叫路徑(action 註冊表 + 前端字串逐一核對)，內部揪出 4 類真死碼：
        1) **`purgeGameData_` 的 `masterName` 參數**：函式體內從未讀取，唯一用途是被傳進去又被忽略。已從簽名拿掉——**但這連動到 `Gallery.gs` 之外**：`Account.gs` 有兩處呼叫這顆函式(結束殘局/清理已標記 DEAD_ 的殘局)，都照舊簽名傳了這個死參數，這裡一併同步刪除傳入值，避免簽名對不上、或第4個參數(帳號名)被錯位吃掉。**子任務原本只查了 Gallery.gs 內部，沒查跨檔呼叫——這正是為什麼要親自複查而非照單全收的原因。**
        2) **5 顆同伴管理 action(`actionKanshouSummonHero`/`Companions`/`Remove`/`SetSex`/`SetName`)各自重新 `getKanshouPcSheet_(ss)` 查表**：查證 `Router_Action.gs` 的 dispatcher 早就依 `pcId` 開頭 `KPC_` 把 `sheets.pc` 指到「鑑賞眾生」，而這 5 顆 action 前端只會用 KPC_ 呼叫(逐一對照 `Script_Kanshou.html`)——`sheets.pc` 進函式時就已經是 `kpc`，自己重查是純重複的表格查詢。5 處都簡化成直接 `var kpc = sheets.pc;`，不再各自 `SpreadsheetApp.getActiveSpreadsheet()`。
        3) **`actionPlay` 的 5 個 solo 戰鬥引擎殘留變數**：`knockedOutList`/`justRevived`/`fatePlayerDefeat`/`fateDreamPrompt`/`freshlyBoundNpcName` 宣告後從未被賦過新值(鑑賞世界觀明文禁止戰鬥/死亡/血量變化，這幾個「擊倒/復活/戰敗/剛結盟排除」概念在這個函式裡不可能發生)，回傳物件裡對應的 `knockedOut`/`justRevived`/`defeat`/`dreamPrompt` 四個欄位也跟著拿掉——先查證 `Script.html` 對這幾個欄位全是簡單 truthy 判斷(`if(data.defeat)`)，`undefined` 效果等同原本恆為 `false`/空值，拿掉欄位不影響前端行為；`freshlyBoundNpcName` 的死判斷式(`if(tNpc===freshlyBoundNpcName) return`，恆等於比對空字串)一併刪除。
        4) **`COL.PC.STATUS` 鑑賞寫入端**：查證後這其實是**先前已經評估過、刻意保留的死欄**(見上方「physical_state 8欄整合」條目：「`COL.PC.STATUS` 欄本身保留不刪，`buildVisibleStatusString`/`parseVisibleStatus` 仍被 solo 側 `getLocalPeopleList` 廣泛使用、非kanshou專屬」)——不是新發現的問題，是舊決策的延續，這次複查後維持原判斷、不重複處理。
        **暫緩，需要玩家決定**：`aiConfig.backLocked`(`actionPlay` 內)——前端「🔒身世鎖定」按鈕(`toggleBackLock`)看似會把鎖定狀態傳給後端，但查證全代碼庫 `callGeminiAPI` 從未讀取 `config.backLocked`，且 `actionPlay` 本身根本不寫入 `COL.PC.BACK`——這顆鎖從後端角度是純裝飾，鎖了也沒有任何實際保護效果。屬於「功能本身沒做完」而非單純死碼，改動前先問玩家想要哪種處理方式(見下方對話)。**玩家定案「拿掉按鈕(推薦)」**：整條鏈路刪除——`Index.html` 的 `back-lock-btn` 按鈕、`Script.html` 的 `toggleBackLock`/`setBackLockBtnUI` 兩顆函式與 `openStatus`/`send()` 裡讀取 `kyushu_back_locked` 的呼叫點、`Gallery.gs` 的 `actionPlay` 內 `aiConfig.backLocked` 賦值、`Script_Onboarding.html` 新局重置清單裡對應的 `localStorage.removeItem('kyushu_back_locked')`(該 key 已無任何寫入路徑，順手一併清)。
      - **🔄 十修：`CODEX_PERSONA_VER` v54→v55，逼已快取的日常翻譯重新生成(2026-07 玩家問「種子庫現在有預先生成日常資料嗎？如果有請先對齊日常餐桌」)**：查證確認**種子本體(`SEED_SERVANTS`)從來沒有預先生成日常版**——`persona.look`/`persona.words` 永遠是戰時精簡版，日常版(`DAILY_LOOK`/`DAILY_WORDS`)完全靠 `getOrComputeDailyHeroFields_` 懶惰生成，第一次被召喚時才呼叫AI轉換、快取進「英靈殿」試算表本體，種子檔案裡從頭到尾不存在任何日常化文字。**但這帶出一個更關鍵的問題**：這輪 session 陸續把 `translateAppearanceToDaily_`／`translatePersonalityToDaily_`／`KANSHOU_SERVANT_GEN_SYS` 三個日常化提示詞都改用《衛宮家今天的餐桌風景》基調(六修/七修)、也修正了「查無此人」的矯枉過正(五修)——這些改動全部發生在 `CODEX_PERSONA_VER` 停在 `v54` 期間，從未觸發版本升級，代表**任何已經被召喚過、快取下 DAILY_LOOK/DAILY_WORDS 的英靈，都還在用改進前的舊版翻譯**，讀不到本輪任何一次提升。已把版號升到 `v55`——`upgradeCodexPersonas_` 會在下次任何 action 觸發時清空全部種子英靈的 `DAILY_LOOK`/`DAILY_WORDS` 兩欄，逼下次召喚時用最新提示詞重新生成。**範圍侷限**：這個機制只覆蓋「英靈殿」快取的日常外貌/性格(`DAILY_LOOK`/`DAILY_WORDS`)，**不會**回頭修正已經直接召喚、且已經跑過 `actionBackfillKanshouServantAi` 深化寫進自己 PC 列的 PREF/BACK(如先前發現的美杜莎)——那是另一條逐實例執行、不受版本號控制的路徑，仍需玩家手動用「改命」調整，或等之後補做「重新深化」按鈕。
      - **🔄 十一修：種子庫比照工房「建立當下就預先轉好」，而非等被召喚才轉(2026-07 玩家問「直接把舊的種子庫新增日常變成跟自創英靈對齊不就好了嗎」)**：工房自創英靈(`recordOriginalHero_`)確實是「建立當下就呼叫AI預先轉好日常版」，種子庫(`getOrComputeDailyHeroFields_`)則是「懶惰快取、第一次被召喚才轉」——玩家問能不能讓兩者一致。**技術風險先講清楚**：`upgradeCodexPersonas_`／`seedFateCodex_` 是**每個玩家的每次 request 都可能自動觸發**的路徑(版本號不符時)，若把「36位英靈×2欄=最多72次AI呼叫」直接塞進這條自動路徑，會讓某個不知情玩家單純按一次鍵的請求卡上數分鐘、甚至撞 Apps Script 執行時限——這正是文件裡「版本閘風暴」現象(目前只有5~15秒，是純試算表操作、無AI呼叫)會被大幅惡化的風險。**改法**：不動自動版本閘的速度，只把「批次預熱全部英靈日常快取」這件事加進**手動 DEV 按鈕**(`actionDevResyncCodex`)——玩家自己決定要不要花這個時間，不影響一般玩家的自動版本升級速度。實作：`upgradeCodexPersonas_`／`resyncSummonedServants_` 跑完後，多一輪迴圈掃「英靈殿」全部列，`DAILY_LOOK`/`DAILY_WORDS` 兩欄都已有值的直接跳過(冪等)，缺的才呼叫 `getOrComputeDailyHeroFields_` 補上，回報訊息加一項「日常版預熱 N 筆」；前端按鈕補上 `title` 提示會呼叫AI、第一次執行可能要一段時間。**這樣兩邊最終效果一致**(所有英靈都有現成日常版可讀)，差別只在於「誰付出等待成本」：工房是建立者自己等一次；種子庫改成由**主動按下 DEV 按鈕的人**一次付清全部英靈的成本，而不是隨機分攤到某個不知情的召喚者身上，也不會拖慢每個人的自動版本升級。
      - **✍️ 十二修：十一修被推翻——玩家要的不是「跑AI預熱」，是「我(Claude)直接手寫寫死」(2026-07 玩家「.........我的意思是....現在GAS的資料 你直接補齊日常 和自創英靈對齊欄位不就好瞭嗎.......」→AskUserQuestion 選定「我(Claude)現在直接手寫36位英靈的日常版，寫死進種子檔(推薦)」)**：十修/十一修還是把 canon 英靈的日常版當「懶惰快取/批次預熱」在處理——不管手動或自動，本質仍是「runtime 呼叫 AI 生成、寫回英靈殿」。玩家真正要的對齊點是**工房角色的日常版是固定的手寫/AI一次生成內容，canon 英靈也該是固定內容，不該是每次可能因prompt改版而漂移的runtime產物**。改法：逐一讀出 `SEED_SERVANTS`(`gas/Seed_Codex.gs`)全 23 筆(20 位從者＋3 位客串／御主)現有的 `persona.look`/`words`/`speech`/`moe`/`tic`/`toMaster` 當創作依據，依《衛宮家今天的餐桌風景》基調(保留髮色/瞳色/體態等本相與角色識別度，戰鬥裝束/武裝換成同色系同調性的現代日常穿著，性格核心不變、只轉場景與語境)親自手寫每一位的 `dailyLook`/`dailyWords` 兩個新欄位，直接寫進每個 `persona{}` 物件字面量裡(非透過任何 API)。
        - **`servantToHeroRow_` 改回傳15欄**：原本只回傳13欄(ID~SOURCE)，`DAILY_LOOK`/`DAILY_WORDS` 兩欄留給 `getOrComputeDailyHeroFields_` 事後補。現在改成 `p.dailyLook||''`/`p.dailyWords||''` 直接接在第14/15欄——canon 英靈整列覆寫(`upgradeCodexPersonas_`)時，這兩欄跟著六圍/技能/persona 一起由種子直接落地，不必等任何一次召喚觸發AI。
        - **順手拔掉現在會扯後腿的 `clearContent()`**：`upgradeCodexPersonas_` 原本在整列覆寫後，額外 `hero.getRange(...COL.HERO.DAILY_LOOK...).clearContent()` 逼下次召喚重新生成(十修的產物，當時 `servantToHeroRow_` 不帶這兩欄，覆寫不會動到它們，需要額外清空才能失效舊快取)——現在 `row` 本身已經帶著最新手寫值一起 `setValues()`，若還留著這行 `clearContent()`，會在同一次執行裡把剛寫入的手寫值原地清空，整個邏輯倒退回「懶惰生成」。已刪除這行，改留一句註解說明為何不再需要。
        - **`CODEX_PERSONA_VER` v55→v56**：觸發既有部署過的試算表在下一次任何 action 時整列覆寫，讓已經召喚過、快取著舊版(AI即時翻譯或空白)日常欄位的英靈換成這次手寫的定案內容。
        - **`getOrComputeDailyHeroFields_`(`Gallery.gs`)完全不用改**：它的邏輯本來就是「兩欄都非空就直接讀、否則才呼叫AI補」——canon 英靈現在兩欄永遠非空(整列覆寫時就帶著手寫值)，天然直接命中前者、零AI呼叫；這條懶惰生成路徑繼續活著，只是實質上變成**只服務 `ai_gen`(工房/AI即時生成)英靈**在尚未有手寫資料時的備援，不衝突、不用特判。
        - **範圍確認**：只動了 `gas/Seed_Codex.gs`(`SEED_SERVANTS` persona 新欄位 + `servantToHeroRow_` + `upgradeCodexPersonas_` + `CODEX_PERSONA_VER`)，`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0(本次完全沒碰紅線①，甚至沒碰 Gallery.gs)。`actionDevResyncCodex`(十一修的 DEV 按鈕批次預熱迴圈)保留不動——canon 英靈現在整列覆寫就會命中「兩欄已有值」直接跳過(等於自然變成 no-op)，但對 `ai_gen`/玩家自創、尚未手動觸發過生成的舊角色仍有備援價值，不需要拔除。
      - **🐛→✅ 十三修：手寫的23筆 dailyLook 分隔符用錯，[氣質舉止]被污染成衣裝(2026-07 玩家反映「你上面都是衣裝!!!!」)**：十二修手寫時把「純氣質詞」跟前面的外貌/服裝描述之間誤用全形逗號「，」分隔，但 `looksToTraitParts_`(Core_Settings.gs) 的切分正則是 `/[・、]/`——完全不吃「，」。實測驗證兩種壞法：①有「・」但氣質前用「，」→ demeanor(氣質舉止) 直接吞掉整段服裝描述(如阿爾托莉雅原寫「藏青色系俐落洋裝的嬌小身影，坐姿站姿端正筆挺」，parse 後 [氣質舉止]＝整句含衣裝，而非只有氣質)；②整句完全沒有「・」或「、」(如美狄亞/吉爾德萊)→ `segs.length===1`，demeanor 直接 fallback 成通用的「從容」，角色本身的氣質詞(疏離/癲狂)完全遺失、外貌格反而把整句(含未切開的逗號)原樣吞入。**全數23筆重寫**：改回嚴格比照種子既有慣例——外貌/服裝段落一律用「・」相接，句尾只留一段乾淨、不含任何服裝字眼的純氣質詞、用單一「、」與前面隔開；並用 node 腳本把 `looksToTraitParts_` 的真實切分邏輯跑過全部23筆(連同 `dailyWords` 經 `parseTraitsHelper` 直接 `split('、')` 的4格切分)逐筆驗證輸出乾淨才落地，不是肉眼檢查。**同時查出3位女性正典御主(遠坂凜/伊莉雅絲菲爾/間桐櫻黑化)既有(非本次新增)的 `persona.look` 原文也是同款「，」誤用**(如伊莉雅絲菲爾原文「紅眼白髮的幼小少女，毛領大衣」整句零「・」「、」、氣質詞甚至完全没写)——這是更早之前就存在的既有缺陷，藉這次一併修正(`look`本體與新的`dailyLook`各自獨立訂正，兩者現在慣例一致)。**赫拉克勒斯/蘭斯洛特(Berserker)的 `dailyWords` 刻意改保守**(玩家反映「該閉嘴的要閉嘴」)：十二修原本幫這兩位寫了完整4格的心理側寫(靦腆木訥/守護本能/贖罪等)，但這兩位的 `persona.speech`/`firstP` 明文寫死「狂化無法言語、僅以低吼/低吼表達」——本人在鑑賞世界觀是否真的「恢復理智能開口」是一個未被任何既有機制或玩家決策確認過的假設，寫一整段流暢的內心獨白等於替他們的沉默「代言」，不該由我單方面認定。已改回貼近原始 `persona.words`(狂化・守護的殘響 / 悔恨・對亞瑟王的愧疚) 幾乎逐字的極簡2段版本，讓 `parseTraitsHelper` 自然用「無」補滿另外兩格(這正是資料稀疏時既有的正常行為，不是新問題)。
      - **🐛→✅ 順手修 `parseTraitsHelper` 的終極防呆正則還在攔九州舊標籤(2026-07 玩家點名「這是舊的九州資料 請修正」)**：`(表象|內裡|底線|性癖|外貌|武技|雜學|弱點|牽絆|色色弱點)[:：]` 這份清單裡「底線/性癖/武技/雜學/弱點/牽絆/色色弱點」是移植自九州(GAS)原始遊戲的特徵標籤詞彙，FATE 現行的 TRAIT/PREF 四格標籤其實是「外貌/氣質舉止/自稱與口氣/卸下心防的私密一面」與「日常表象/真實內裡/喜歡的事物/討厭的事物」(`Gallery.gs`/`Router_Creation.gs` 系統提示詞)——舊清單完全攔不到 AI 真的可能誤加的「氣質舉止:」「自稱與口氣:」「日常表象:」等標籤，等同這道防呆對 FATE 而言半失能。已換成貼合現行標籤的清單。
      - **🔍 深查：工房(ai_gen)英靈的 `persona.look` 格式跟 `looksToTraitParts_`「取最後一段當氣質」的假設可能對不上(2026-07 玩家要求「整個AI生成也要確認一遍」，發現但本輪刻意不動，待玩家決定)**：查證結果——工房捏角(`Script_Onboarding.html` `_joinParts('cf-look')`)與 AI 補完提示詞(`Router_Creation.gs` L478：`"look":"外貌四短句頓號分隔（五官髮色/氣質/身形/衣著印象）"`)都把 `persona.look` 定義成**固定4槽語意**：[髮色][氣質][身形][衣著印象]——氣質在第2槽、衣著在最後一槽。但 `heroToKanshouRow_`(Gallery.gs)與 `actionSummonServant`(Router_Creation.gs L568) 對**種子(seed)與工房(ai_gen)一視同仁**呼叫同一顆 `looksToTraitParts_`，其邏輯是「彈出最後一段當氣質」——這假設只成立於種子(SEED_SERVANTS)的「N段外貌、末段氣質」慣例，套在工房的固定4槽格式上，彈出來的「氣質」實際會是**衣著印象**(如果玩家4槽都填滿)，真正的氣質(第2槽)反而被併吞進[外貌]格。`translateAppearanceToDaily_`(Gallery.gs)的系統提示詞本身也明講「最後一段是整體氣質／神情」，對工房格式來說這個假設同樣不成立，AI 轉譯時可能被誤導。**這是本次任務範圍外、且早於這次修改就存在的架構問題(不是我這次寫壞的)，性質是「兩套 look 語意慣例被同一顆函式一視同仁處理」的設計不一致，牽動 solo 召喚(`actionSummonServant`)與鑑賞召喚(`heroToKanshouRow_`)兩條路徑、且需要玩家決定修法方向(比如：讓 `looksToTraitParts_` 依來源分流兩套解析、或統一工房UI也改成「末槽=純氣質」)，故本輪只查證記錄、未動手修改，留待玩家定案後再處理。**
      - **✅ 十四修：上述「深查」定案——玩家選「全部統一吧」(2026-07 玩家「全部統一吧….. 衣服已經是另外顯示了不是嗎…」)**：查證確認**服裝確實已有獨立顯示欄位**——`servantCard_`(Router_Persona.gs)與 `partyDetailsArr`(Gallery.gs)都會另外讀 `getOutfit_`(【換裝】MEMORY標籤)顯示「此刻裝扮／裝扮」，且 `6b.★【服裝與外貌】` 敘事鐵律明講「【此刻裝扮】為最優先，卡上沒寫的不得自行增減服裝」——`persona.look`(TRAIT的[外貌])裡的服裝描述只是**沒有 outfit 覆蓋時的預設底色**，不是唯一顯示服裝的地方。既然如此，統一成種子(SEED_SERVANTS)本來就在用的慣例最單純：**工房 `persona.look` 的4槽固定語意改成「氣質固定填在最後一格」**，不再是「氣質在第2槽、衣著在末槽」——`Index.html` 的 `cf-look-1~4` 佔位字改成「五官髮色／身形／衣著印象／氣質(填在最後一格)」；`Router_Creation.gs` L478 的AI補完提示詞同步改成「...衣著印象，最後一句必須是不含服裝字眼的純氣質詞」；`Script_Onboarding.html` 的 `_joinParts('cf-look')` 旁註解同步更新。這樣 `looksToTraitParts_`「彈出最後一段當氣質」的假設對種子與工房**兩種來源都成立**，不必額外分流判斷。**已知殘留缺口(誠實揭露、本輪未動)**：這只影響「今後新建立/修改」的工房英靈，**已經存在的舊工房角色**若當初4槽都填滿，其 `persona.look`／已快取的 `DAILY_LOOK` 仍是舊順序(末槽＝衣著)，這次沒有回頭校正(校正需要重跑AI或請創作者重新編輯，屬於另一個決策)，`looksToTraitParts_` 對這些舊資料仍會誤判——僅新資料起算就已對齊。
      - **🧹 十五修：`getOrComputeDailyHeroFields_` 的AI呼叫備援整段拿掉(2026-07 玩家「撈進鑑賞時確實零AI呼叫<<<把這個呼叫移除吧?沒有其他來源不會有要補資料問題....」)**：查證屬實——`DAILY_LOOK`/`DAILY_WORDS` 現在只有兩種來源會寫進英靈殿，且都保證非空：①種子(`SEED_SERVANTS`)全數手寫寫死(十二/十三修)；②工房(`ai_gen`)在 `recordOriginalHero_`／`actionSaveHero` 建立/修改當下就已呼叫AI預先轉好寫入。原本 `getOrComputeDailyHeroFields_` 裡「兩欄皆空才呼叫AI補一次並回寫」的分支因此永遠打不到(兩種寫入路徑都不會留下空值)，已改名 `getDailyHeroFields_`、砍掉 AI 呼叫與回寫試算表的邏輯，純讀取兩欄；萬一真的兩欄都空(理論上不會發生，但保留最後一道保底)，退回原始戰時 `persona.look`/`words`(不轉譯，零成本)而非留白，不呼叫任何AI。`heroToKanshouRow_`(Gallery.gs)同步改叫新名字。連動清理：`actionDevResyncCodex`(Seed_Codex.gs)裡「日常版預熱 N筆」那段批次迴圈——原本就是靠這顆函式的AI呼叫分支才有意義，現在無論怎麼跑，`beforeLook && beforeWords` 恆真、迴圈必然空轉，已整段移除(含回傳訊息裡的「日常版預熱」字樣)；`Index.html` DEV按鈕的 `title` 提示(原本寫「會呼叫AI，第一次執行可能要一段時間」)一併改成準確描述(純試算表整列覆寫，不呼叫AI)。**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0(改動全在 `getDailyHeroFields_`/UI文案/工房look格式，完全沒碰紅線①)；另用 node 腳本模擬新版 `looksToTraitParts_` 分別跑過全部23筆種子 `dailyLook` 與一組模擬「新順序」工房外貌字串，皆確認氣質欄乾淨、不含衣裝字眼。
      - **🐛→✅ 五修：玩家的萌點(N欄，`COL.PC.INTENT`)被腰斬(2026-07 玩家反映「narration 沒有被截斷吧 是N欄位 萌點那個有字數限制」)**：一開始誤判成 narration 被 token 上限截斷，玩家親自糾正——實際是 `actionBackfillKanshouAi`(玩家本人鑑賞化身的AI深化，非本節的同伴深化)裡 `npc_intent` 硬 `slice(0,18)`，AI 稍微多寫幾字就被腰斬在句意中間。放寬緩衝到 `slice(0,30)`＋提示詞明文要求「務必寫完整一句話，不可斷在句意未完處」。`callGeminiAPI` 的 NSFW `max_tokens` 仍照玩家指定微調 2500→2600(結構性欄位確實變多，留點餘裕即可，非本次截斷的真因)。
      - **🆕 同伴/玩家鑑賞入場先給「日常便服」墊底(2026-07 玩家提議)**：`getOutfit_`/`setOutfit_`(Core_Settings.gs)讀寫 MEMORY 內的 `【換裝】`標籤，卡片「裝扮」那行是 `s.outfit` 有值才渲染——新召喚/新建立的角色從未換裝過，這行直接不顯示，卡片看起來裝扮欄位空著。`applyGalleryForm_`(封存/邀請共用)、`heroToKanshouRow_`(直接召喚)、`actionEnterKanshou`(玩家自己的化身)三處建列時，若當下 MEMORY 尚無換裝紀錄，改用 `setOutfit_(...,"日常便服")` 墊一個預設值，卡片一開始就有「裝扮　日常便服」可看，玩家隨時仍可用「👗換裝」覆蓋。
      - **🐛→✅ 六修：對話格式指令「（動作/神態）」被 AI 原樣打進敘事(2026-07 玩家反映「（動作/神態 為啥寫出來!!!」)**：全遊戲共用的對話格式鐵律(`Engine_Combat.gs` SFW/NSFW 兩處＋`Router_Narrative.gs` `actionNarrateOnly` miniSystem 共3處)原文寫「角色名：「（動作/神態）台詞」」——「動作/神態」是在描述【這格要填什麼種類的內容】，但字面上跟「請原樣輸出這四個字」長得一模一樣，較弱的模型(gemini-3.1-flash-lite)偶爾就真的把它當成台詞內容照抄出來。3處統一改成給【具體例句】(如「微微一笑」「眼神一沉」)示範格式、並明文加一句「【絕對禁止】原樣打出「動作/神態」這四個字當作內容」，消除照抄的可能性。三處系統性修，非只修玩家截圖那一處。
      - **🐛→✅ 七修：鑑賞聊天常有「本次對話完結」的收尾感(2026-07 玩家反映「他很常做個完結的感覺...我需要的是停在當下」)**：查證 `Router_Narrative.gs` 的 `actionPlay` 每回合 prompt 其實【本來就有】兩處「別收尾、交還玩家」指令(鑑賞專屬的「★敘事結束停在溫柔的留白」＋全遊戲共用的「🚨敘事終極警告」第1條)——不是漏寫，是寫得太抽象(「溫柔的留白」沒具體講清楚要避免什麼)，跟NSFW約600字的長篇幅目標拉扯之下，AI仍常把整段寫成起承轉合完整的一章。兩處都改成具體禁止「收尾句」(如「那一夜／自此／就這樣／從此」)＋明確要求停在「進行式」的動作/對話/情緒中途，而非事後回顧式的完成狀態。純提示詞措辭強化，不動任何 schema/機制，未觸碰 `nsfwBaseRules`。
      - **🧹 鑑賞死代碼/浪費token查核(2026-07 玩家要求「有哪些其實已經用不到的」)**：
        - **玩家自己那列的 `STATUS` 欄位每回合被塞進提示詞、但建角後從沒更新過**：`PROMPT_REL`(actionPlay 共用)的「【玩家命格】」那行原本 `${isNsfwMode ? " | 狀態:${pc[COL.PC.STATUS]}" : ""}` 只在鑑賞模式(isNsfwMode)才注入——但鑑賞玩家列的 `STATUS` 只在 `actionEnterKanshou` 建角時寫死一次(如「神情輕鬆」)，此後沒有任何寫入路徑會再改它(視覺化外顯早已被 physical_state 取代，`mergeVisibleState` 本季稍早已刪除)，等於每回合白白餵給 AI 一段永遠不變的舊資料。已整段拔除，跟companion 那側(nsfwMemories)早先的同款清理對齊(見上方「STATUS(視覺化外顯)已退役」註解)。
        - **同行夥伴(partyDetailsArr) 的 `氣血`/`狀態` 兩欄，鑑賞同伴同樣是死資料(2026-07 玩家追問「哪裡多餘」二次複查抓到)**：這行是 actionPlay 最前段建構 `PROMPT_PARTY_SYSTEM` 時就組好的、SFW/NSFW 共用的「同行夥伴」摘要，跟上面兩條清理的位置不同、當時沒一併查到。鑑賞同伴無戰鬥、HP 恆定 480/480 從未變動，STATUS 也跟前述一樣建角後凍結——這兩欄對鑑賞來說每回合都是重複灌一模一樣的無資訊內容。solo 的同行從者則相反：氣血/狀態會隨戰鬥/休息即時變動，是活資料，不能動。已依 `isKanshou` 分流：鑑賞分支拿掉氣血/狀態兩欄(其餘身世/裝扮/性格/特徵/關係不變)，solo 分支維持原樣不動；順便省了鑑賞路徑一次不必要的 `getCharacterTotalStats` 計算。
        - **🐛→✅「衝突」：氛圍鎖死「溫柔悠閒」跟 🔥主動掌握模式/慾海律令互相打架(2026-07 玩家反映「鑑賞怪怪的」，討論後定案)**：💕【鑑賞·後日談模式】區塊原本有一行「★氛圍＝溫柔、悠閒、戀愛向的日常：散步、閒聊、吃東西、看風景」，**每回合無條件注入**，不管當下是不是親密場景。同一回合若玩家開了 `driveOn`，還會疊加「同伴主動掌握節奏...想跑也跑不掉的壓迫與心跳感」；慾海律令本身又要求「情慾放手寫」。三股語氣同時餵給 AI——「悠閒散步」vs「壓迫跑不掉」vs「情慾放手寫」——AI 得自己想辦法揉合，容易寫出前後不搭調的段落，這正是玩家講的「怪怪的」。玩家確認調性方向後拍板兩處修正：①氛圍行改用中性措辭「★世界觀＝和平的現代都市日常，沒有戰鬥/敵人/生死威脅——但節奏與親密程度完全依劇情、好感與意圖自然發展...不強制鎖在「悠閒」基調(尤其🔥開啟或情慾已自然升溫時)」，拔掉「悠閒」這種會跟激情場景打架的固定形容，但保留「和平無戰鬥」的世界觀底線(這條不能拔，鑑賞的核心設計就是「聖杯戰爭已落幕的安全世界」)。②`driveOn` 補一句明確的**走向保證**：玩家強調「開了火就絕對要被同伴依個性榨乾」——不是「同伴可能主動」的模糊語氣，改成「這個開關代表的走向是確定的...玩家會被同伴依其個性一步步榨乾、毫無招架餘地」，同時跟「敘事別收尾」鐵律相容(不強迫每回合寫到終點，但每回合都要讓這個走向確實往前推進、不可退回平日矜持基準)。未開 `driveOn` 時(預設模式)不受此拘束——是否榨乾/是否玩家主動出擊，完全依角色個性與好感自然發展，不強制也不禁止，只是不像開火時那樣「保證會發生」。
        - **🐛→✅ 真兇：直接召喚同伴的個性/特徵欄位在寫入當下就已經被打散(2026-07 玩家反映「斯卡哈應該自信高冷，怎麼一句話就臉紅、完全沒按個性演出」)**：查證 `Gallery.gs` 的 `heroToKanshouRow_`(🌹直接從英靈庫召喚路徑，KHV_)原本 `sRow[COL.PC.PREF] = p.words || ""` / `sRow[COL.PC.TRAIT] = p.look || ""`——把種子 persona 原樣塞進欄位，完全沒處理。種子資料習慣用「・」當片語內部連接號(如斯卡哈 words=「影之國女王・武人」、look=「紫髮紅瞳・緊身戰衣的妖豔女王、冷峻」)，但 `Router_Narrative.gs` 的 `formatPref`/`formatTrait` 是靠「、」切成 [表象]/[內裡]/[喜歡]/[討厭] 四格餵給 AI——沒有「、」可切時整串被塞進單一格，其餘三格全變「無」，等於把「武人」(內裡個性錨點)這種關鍵信號直接吃掉、AI 收到的個性資訊被打散大半，自然拿不到足夠信號去演出角色該有的自信/高冷，容易照套路寫成普通反應。**solo 的 `actionSummonServant` 對同一份種子資料早就有做「・→、」轉換＋`parseTraitsHelper` 補滿四格**(這也是為什麼 solo 沒人反映這問題)，鑑賞這條直接召喚路徑當初漏做，已比照補齊；連動效益：`actionBackfillKanshouServantAi` 的 AI 深化也是讀這兩欄當「既有個性關鍵詞」上下文，這欄位品質提升後深化輸出的品質也一併受益。已召喚在世的舊角色不受影響(此修正只影響新召喚當下的寫入，不回溯既有存檔)。
        - **「在場驗證鐵律」的 solo 專屬「AI可自創全新陌生人(路人/店家/新面孔)」許可(2026-07 玩家定案「這是九州的東西...可以移除不要浪費token」)**：查證這條許可語句是九州(舊系統)沿用下來的措辭，當初大概是配合已刪除的經濟/店鋪機制想像"可互動店家"，FATE 單人版早已無此類機制，這條許可純粹增加提示詞長度、無實質玩法用途。已拔除該許可分支＋對應的 isNsfwMode 三元判斷，solo/鑑賞統一走同一套「只准清單內角色登場、AI不得自創陌生人」的簡化文字(唯獨玩家主動邀請第三人登場的例外仍保留，那是不同機制、兩軌都在用)。純刪減、未動其餘防呆邏輯。
      - **🧹 AI生成從者/御主 全欄位/規則複查(2026-07 玩家要求「確定? 現在檢查一下 AI生成從者、御主 所有欄位規則都沒有問題」)**：以本季稍早修的鑑賞萌點腰斬(`slice(0,18)`)為模板，systematic 查了 solo 側所有「AI 即時生成」路徑，抓到同款腰斬 bug **另外3處**(此前只修了鑑賞那一處，沒推廣到 solo)：
        - `actionBackfillMasterAi`(Router_Creation.gs·御主本人背景潤色) 的 `npc_intent` `slice(0,18)`→`slice(0,30)`＋提示詞加「務必寫完整一句話」。
        - `actionSaveHero`(工房製造·AI補完演出側寫) 的 flavor.npc_intent 同款 `slice(0,18)`→`slice(0,30)`＋prompt 同步加註。
        - `actionSummonServant`(名冊查無、AI即時生成原創從者) 的 `aiBrief.npc_intent` 同款 `slice(0,18)`→`slice(0,30)`＋prompt 同步加註。
        - 順手補一個**防呆缺口**：`actionSummonServant` 的 AI 原創從者 `background` 欄原本完全沒有長度上限(`row[COL.PC.BACK] = aiBrief.background || ...`，其餘所有路徑都有 slice)，AI 若不理會「限20字」指令可無限長寫入——補 `slice(0,40)` 與其他路徑對齊。
        - **查證過但判定安全、未動**：`sanitizeSix_`/`sanitizeSkills_`(格式驗證+EX上限+fx白名單完整，無漏洞)；種子(`persona.moe`)本身的 `slice(0,18)`(非AI即時生成、是人工curate的固定文字，全庫36→20騎現存值逐一量測皆未超過18字，非活躍風險)。
        - **關於「AI夠聰明嗎」的誠實回答**：`actionBackfillKanshouServantAi`/`actionBackfillMasterAi` 這類「潤色補完」呼叫都是 best-effort、失敗會靜默保留種子原樣(`try/catch`優雅降級)，**沒有任何機制驗證AI寫回的內容品質**(只驗證格式：頓號分段/字數上限/JSON合法性)，不是「保證正確」的系統。這是刻意的設計取捨(玩家2026-07定案「AI認得七八成正典角色，讓它自由發揮，卡太滿反而照稿演」)，靠的是 gemini 對 Fate 語料本身的熟悉度，不是本地端做內容審核；目前唯一的「保底」是格式驗證+失敗降級，不是內容正確性驗證。
      - **🆕 御主卡補「👗換裝＋📜詳細狀態」按鈕列(2026-07 玩家提議)**：鑑賞從者卡早有這兩顆(見上「從者卡補📜詳細狀態鈕」)，御主(玩家)自己的卡卻沒有，玩家得靠卡片列表下方一顆獨立飄浮的「👤我的詳細狀態」按鈕才能看自己的狀態、也完全沒有換裝入口。**換裝**：`actionSetOutfit`(Router_Economy.gs)原本硬查 `FACTION==="從者"`(`findPlayerServantIdx_`)，御主本人是 `FACTION==="御主"` 永遠查不到——加 `userData.self` 旗標，`true` 時直接鎖定呼叫者自己那列(pIdx)，不查從者；`Router_Action.gs` 的 `master` payload 補上 `outfit:getOutfit_(...)` 欄位供前端預填；前端 `changeOutfit(name,isSelf)` 多一個 `isSelf` 參數＋新全域 `myMasterOutfit` 記當前值。**詳細狀態**：直接複用 `openStatus()`(無參數＝看 pc 自己，與舊獨立按鈕完全同一入口)。獨立按鈕(`#my-status-fallback`)改用 `applyModeUI()` 依模式隱藏——鑑賞模式已有卡片內按鈕、不重複外露；solo 御主卡本身無此按鈕列，獨立按鈕仍是 solo 唯一入口，維持顯示。
      - **🐛→✅ 鑑賞不要姓名的金色超連結(2026-07 玩家反映)**：`Script.html` 敘事顯示的「統一連結引擎」原本無條件把同地 NPC 名字包成 `.npc-link`(金色、可點、開 solo 那套「同地互動選單」`openInteractMenu`)。鑑賞同伴本就恆常同行、靠卡片與對話推進，不需要也不該有這顆——改成 `pc.mode==='kanshou'` 時該名字只 push 純文字(不包 span)，一行判斷、不影響 solo 原有連結行為。
      - **🐛→✅ 玩家反映「鑑賞旁邊的狀態頁面有時候不會更新」，查證後根因是前端、非AI/非欄位(2026-07)**：玩家懷疑是 AI 沒確實輸出或試算表欄位錯位——逐層查證：①`Engine_Combat.gs` physical_state 數字代碼(1-6)、`sanitizePhysicalState`(`Router_Narrative.gs`)的 `keyMapping`/`allowedKeys`、`Script.html` `kanshouStatusLines_`/`kanshouClothLine_` 讀的鍵名(姿勢動作/胸部/顏面/肉棒/蜜穴/服裝狀態)三處逐字比對【完全一致】；②`dirtyPcRows` 寫回允許清單(`PC_/NPC_/DEAD_/KPC_/KSV_/KHV_`)也仍完整涵蓋鑑賞三種前綴，該寫的都確實寫回試算表——AI 與欄位皆無問題。**真正根源在前端**：`Style.html` 寬螢幕(≥601px)是「三欄並排」常駐版型(狀態欄不是分頁、桌機上一直顯示在畫面側邊)，但 `send()`(鑑賞對話送出的唯一入口，對應 action `play`)收到回應後從未呼叫 `refreshFateTags()`——`play` 這個 action 本來就沒被排進 `STATE_AFTER_ACTIONS`(那機制本就明確只服務 solo `PC_` 的按鍵動作，見 `Router_Action.gs`)，`send()` 自己也從未手動補呼叫。手機版切分頁(`showGamePane('status')`)會真的重抓一次，才會讓玩家覺得「有時候」會更新——其實是「只有切到那個分頁的當下」才更新，桌機常駐欄位本身完全不會自動刷新。已在 `send()` 收到回應、插入敘事文字後補一行 `refreshFateTags()`，鑑賞每輪對話結束都會真實重抓狀態卡片(含 physical_state)，桌機/手機皆修。
    - **🔒 玩家原創英靈禁止召喚別人的作品(2026-07)**：玩家要求鑑賞直接召喚只能召喚「自己創造的」原創英靈，不可召喚其他玩家工房/盲盒捏出的角色(solo 的隨機/混亂池刻意共用玩家原創的既有設計不受影響、只針對鑑賞這條直接指名召喚)。雙重防線：前端 `openCompanions()` 組 `_kcHeroes` 時多濾一層 `h.src!=='ai_gen' || h.creator===currentAccount`(種子正典不受限)；後端 `actionKanshouSummonHero` 同步查 `hero[COL.HERO.PERSONA].creator` 是否等於呼叫者 `acctName`，防直打 API 繞過前端過濾。
    - **🐛→✅ 英靈庫清單無篩選，長列表難挑(2026-07 修)**：玩家反映扁平列表（36騎全列、無分類）挑一位要滑很久。`get_heroes` 回傳的 `h.gender`(COL.HERO.SEX) 早就有資料，只是前端沒拿來用。加**性別/職階雙下拉篩選**，純前端本地篩選(`kanshouSetFilter`/`renderCompanionsPanel`)，不重打 `gasRun`——`openCompanions()` 只在真正需要新資料(初次開面板/邀請/召喚/請走後)才呼叫伺服器，篩選切換純重繪快取的 `_kcHeroes`。選單選項**資料驅動**：從當前召喚清單動態 `Array.from(new Set(...))` 取值，不寫死性別/職階列表(職階/性別種類增減時選單自動跟著長)。清單項目附帶顯示性別。
    - **🐛→✅ 真正根源：showHistoryOverlay 本身無高度上限/無捲動(2026-07 修·跟進上條)**：加完篩選後玩家反映清單仍「滿滿一條、超出畫面、無法控制」——追下去發現問題不在清單內容，是 `showHistoryOverlay`(`Script.html`，本身是**全站共用**彈窗，15處呼叫點：同伴面板/狀態面板/系統設定等全走這隻)的外層卡片原本完全沒設 `max-height`/捲動，內容一長(如36騎清單)直接撐爆超出視窗，連「關閉」鈕都被推到畫面外按不到。改外層卡片鎖 `max-height:calc(100vh - 36px)`+`flex-direction:column`，內容區(`#history-body`)自己 `overflow-y:auto` 捲動，關閉鈕 `flex-shrink:0` 固定在底部恆可見——**全站 15 處呼叫點一次修好**，非僅同伴面板專屬。
    - **🐛→✅ 從者卡只露肉體(器官)、姿勢/顏面完全沒顯示(2026-07 修)**：玩家反映鑑賞同伴卡看不到當下姿態/神情，只有肉體(蜜穴/肉棒/菊穴/雙手)一行。查證：`COL.PC.STATUS`(姿勢/顏面/負面/衣服)其實每回合都被 AI 透過 `intimacy_feedback.visible_state` 正常更新(`mergeVisibleState`)，只是 `Router_Action.gs` 組給前端的 servants[] payload從未帶出這欄、`Script.html` 的鑑賞從者卡也就無從渲染——不是 AI 沒讀/沒寫，是前端沒露出來。已補 `status:s[COL.PC.STATUS]` 欄位，卡片原本的「肉體」行併成「外顯」一行(姿勢＋顏面＋負面[若非無]＋肉體器官狀態，衣服已由既有「裝扮」行顯示不重複)。純前端展示層改動，未動 Engine_Combat.gs 的 NSFW schema/prompt。
    - **🆕 從者卡補「📜 詳細狀態」鈕(2026-07)**：玩家反映鑑賞從者卡只有「換裝」，想自行微調同伴的敘事欄——`openStatus`/`openFateEdit`/`saveFate` 這套「逆天改命」面板本就是純敘事(性格/特徵/身世/萌點，無六圍/技能/寶具)＋`actionGetFullStatus`/`actionUpdateFate`(Router_Action.gs)本就以 `IS_PARTY==="同行"` 判斷可編修對象、對「鑑賞眾生」分頁一樣適用(住不同分頁，改了不影響英靈殿種子庫)，完全不需改後端，只是鑑賞從者卡的渲染分支從未加這顆按鈕。已在既有「👗 換裝」旁補上，直接複用同一套面板。
    - **🐛→✅ 全面複查所有鑑賞欄位/提示詞/寫法(2026-07·玩家要求)**：查證 physical_state 數字代碼(1-4→蜜穴/肉棒/菊穴/雙手)、STATUS(視覺化外顯，衣服/姿勢/負面/顏面)在 `sanitizePhysicalState`/`mergeVisibleState`/`Gallery.gs`兩處預設/`Router_Narrative.gs`兩處預設之間**皆一致**，intimacy_feedback 子欄位(dynamic_skills/erogenous_zones/mutual_nicknames)也都正確對應寫進 MEMORY/REL_MEM 的對應標籤——未發現需要修正的地方。查證中意外揪出兩處**與此次改動無關的舊債**：
      - **🐛→✅ 卡片「特徵」誤讀 TAGS.traits(戰鬥特性標籤如神性/英雄)**：全代碼庫「特徵」的唯一真實定義是 `COL.PC.TRAIT`(外貌描述，見 `Router_Narrative.gs` 各處 `formatTrait(r[COL.PC.TRAIT])`)，鑑賞卡片卻讀 `TAGS.traits`——直接召喚路徑(`heroToKanshouRow_`)故意留空 TAGS，此行永遠空白；封存路徑則顯示不相干的戰鬥分類標籤。已在 `Router_Action.gs` 補 `trait:s[COL.PC.TRAIT]` 欄位，`Script.html` 改讀該欄位、格式比照個性(頓號拆前4段)。
      - **🐛→✅ `maskPhysicalStatus`(Core_Settings.gs) 遮罩鍵名表過期**：`sensitiveKeys` 仍列著 physical_state 改數字代碼前的舊鍵名(胸部/口/舌頭)，缺現行的「雙手」——遮罩對舊鍵名形同虛設(現在絕不會寫入)、對雙手則漏遮。已修正比照現行 `allowedKeys`(蜜穴/肉棒/菊穴/雙手)。（順帶確認：此函式輸出的 `safePhysical` 目前在所有呼叫路徑下皆未被前端實際讀取——`updateUI` 讀的是 §-string 的其他索引，非這格——形同已被「肉體狀態抵換外顯」的新路徑架空，屬於已知但未清的死值，本次僅修鍵名對齊、未動整段移除，避免動到沒完整驗證過的既有欄位對齊。）
      - **🗑️ maskPhysicalStatus/safePhysical(2026-07 玩家確認刪除)**：既已查明是死值，直接整段刪除(`buildPlayerStatusString` 不再算這格、`isNsfwMode` 參數隨之移除——查過全代碼庫零呼叫端傳第三參數)，§-string 第24格保留空字串佔位維持其餘欄位固定索引不位移。
    - **🔴 physical_state/visible_state 8欄→5欄整合(2026-07 玩家明確授權改動 NSFW 機制)**：玩家要求把 `visible_state`(衣服/姿勢/負面/顏面)＋`physical_state`(蜜穴/肉棒/菊穴/雙手)兩物件共8欄，砍併成單一 `physical_state` 5鍵：**1=姿勢與動作 2=胸部 3=顏面(表情+汗水) 4=肉棒 5=蜜穴**(衣服已由玩家換裝機制`outfit`另外掌管、負面/菊穴/雙手不再追蹤)。這是本專案唯一一次觸碰 `CLAUDE.md` 明文的「NSFW 機制」紅線——事前已完整說明風險並取得玩家逐字「我現在允許妳改動!!!」的明確授權才動手，`nsfwBaseRules`(敘事鐵律本體字串)本身仍 0 改動、只動了緊鄰的 `_physicalState`/`specificRules`(慾海律令)/`finalJson.intimacy_feedback` schema。連鎖修改：`Router_Narrative.gs` 的 `sanitizePhysicalState`(keyMapping/allowedKeys 改新5鍵)、整段移除已無呼叫端的 `mergeVisibleState`(連同 player/npc 兩處 `pfb.visible_state`/`nfb.visible_state` 呼叫)、拿掉 nsfwMemories 裡即將永遠凍結的 `[${name} 狀態]`(STATUS)注入行(姿勢/顏面已併進`[肉體]`)；`Gallery.gs` 兩處 PHYSICAL 預設值拿掉「菊穴」；`Script.html` 鑑賞卡的「外顯」行簡化回單純列舉 `s.physical` 全部鍵值(不再另外拼 STATUS，此前兩來源已合一)；`Router_Action.gs` 移除已無用的 `status:` 欄位傳遞。**COL.PC.STATUS 欄本身保留不刪**(死欄不刪政策+`buildVisibleStatusString`/`parseVisibleStatus` 仍被 solo 側 `getLocalPeopleList` 廣泛使用、非kanshou專屬，故只退役「AI 每回合更新它」這條 kanshou 機制，欄位與讀取函式本身不動)。
    - **🔴 二修·5鍵→6鍵＋禁止性別填無＋卡片精簡(2026-07 玩家同輪追加，同一次NSFW機制授權下延續)**：
      1) **新增「服裝狀態」(key 6)**：玩家指定的服裝本身(換裝機制)不變，AI只描述它當下的凌亂/破損程度(如「領口散亂」「半褪至肩」)——此前 8→5 整合時被連同視覺姿態一起砍掉，玩家澄清這個「衣服當下狀態」概念要留、只是要用新方式追蹤(非舊的「衣服」欄複述穿什麼，是描述現況)。
      2) **🐛→✅ 禁止「肉棒：無」這類臨時填補(嚴重)**：查出根因——`Router_Narrative.gs` 的 `genderHintStr` 對女女配對明講「肉棒欄位雙方皆填『無』」，`Engine_Combat.gs` 的 schema 說明也寫「無陽具填無」——等於教AI對每一位女角每回合都主動輸出一個不適用的「肉棒：無」，一旦輸出就 merge 進資料庫、永久顯示在卡片上(如伊絲塔卡片顯示「肉棒：無」)。已改成明確指令：「不適用的器官代碼直接不要輸出，不要寫『無』佔位」——男性只出現代碼4(肉棒)、女性只出現代碼5(蜜穴)，另一項在AI回應裡完全不提及，物件裡自然就不會有這個鍵。
      3) **卡片精簡**：同伴卡拿掉「個性/特徵/關係」三行(改進上一輪新增的「📜詳細狀態」按鈕看)；physical_state 顯示行從「外顯」改名「當下狀態」，且**拿掉每個鍵的名稱前綴**(如「姿勢與動作：」)、只列原始描述值頓號相接，讀起來像一句敘述而非表單。御主自己的卡片(`mPhysLine`)同步比照修改，兩處卡片顯示格式一致。
    - **🔴 四修：固定排序+短標籤+服裝狀態獨立顯示+1/2/3/4-5每回合必填(2026-07·同輪NSFW機制授權延續)**：玩家給實例反映排版問題——原本 `Object.keys(po).map(...)` 照 AI 輸出 JSON 的鍵序原樣接成一行，順序完全不固定(這輪蜜穴先講、下輪姿勢先講)，讀起來像流水帳。
      1) 卡片改用新的共用函式 `kanshouStatusLines_(po)`：固定順序**狀態(姿勢動作)→胸部→蜜穴/肉棒(擇一存在的那個)→顏面**，各自一行、帶短標籤(如「狀態：」「胸部：」)，取代原本無序無標籤擠一行的寫法；同伴卡與御主自己的卡都改用同一支函式。
      2) 服裝狀態(6)不算進上面4行，改用 `kanshouClothLine_(po)` 緊接在「裝扮」下方獨立一行、不帶標籤(範例：`裝扮　女神服裝` 下一行直接接 `肩帶滑落，衣衫極度凌亂`)。
      3) `Engine_Combat.gs` schema：1(姿勢動作)/2(胸部)/3(顏面)/4或5(肉棒或蜜穴，依性別擇一)標記【每回合必填】，不可偷懶沿用舊值；只有6(服裝狀態)維持「省略=維持原樣」。顏面描述由「表情與汗水」改「表情與液體」(更泛用)。
    - **🎭 人格貫穿快感(2026-07 玩家提案·經改寫後併入)**：玩家提議加「性格的絕望拉扯」規則(真正的墮落是用原本的人格承受快感、禁止變發情機器)。評估後**核心保留、框架改寫**：「墮落/絕望」預設每場都是不情願敘事弧，對高好感/活潑主動的同伴會把甜蜜戲硬扭成掙扎戲——拿掉該框架、保留核心句、補四型具體示例(高傲咬牙/虔敬掙扎/活潑藏羞/深情黏膩)，**併入 `Router_Narrative.gs` 既有的【角色一致性鐵律】**(該鐵律本就在講「肉體反應≠靈魂軟化」，另立新規則會互相稀釋)。未動 Engine_Combat.gs。
    - **🔥 主動掌握開關(2026-07 玩家定案·死旗標重生)**：玩家問「輸入框旁的🔥開關是不是沒作用了」——查證確認：後端在「solo純淨」加固時已改為純看 pcId 前綴(`KPC_`=NSFW)決定模式、完全不信前端 `isNsfw` 旗標，該勾選格自那時起就是裝飾品(`enterKanshou` 的自動勾選＋註解「否則親密不回填」皆已過期)。玩家定案**重生為「同伴主動度」開關**：滅(預設)=現在的矜持模式(靠玩家推進)；亮=同伴依個性主動掌握節奏、玩家想迴避/抽身會被攔下(「想跑也跑不掉」)。實作：①前端 checkbox 改名 `drive-mode-toggle`(舊 `nsfw-mode-toggle` 名稱已與實際功能無關)，`send()` 改傳 `drive` 旗標、`narrate()` 的死旗標 `isNsfw` 順手拔除，`enterKanshou` 改預設熄滅；②後端 `actionPlay` 新增 `driveOn`(**`isNsfwMode` 閘門**——只在鑑賞生效，solo 傳了也無視，不可能重演舊旗標污染 solo 的漏洞；此旗標只改「誰主導節奏」的語氣、不涉 SFW/NSFW 判定，故信前端無安全風險)，開啟時在 `PROMPT_REL` 注入【主動掌握模式】段落。**與既有鐵律的相容設計**：主動的「形式」依好感分級(低好感=強勢試探/挑釁攻勢、非傾心倒貼→不牴觸 `nsfwBaseRules` 的慢熱鐵律；高好感=不加掩飾的索求)；「玩家跑不掉」與「意圖攔截·玩家意圖非結果」鐵律同向不衝突；【角色一致性鐵律】照常有效(主動方式須貼合個性語癖，禁霸道模板)。Engine_Combat.gs 0 改動。
      - **🐛→✅ 開了🔥還是很保守、玩家打多打少都推不動劇情(2026-07 玩家回報)**：查出通篇 `prompt` 結尾有一句**不分模式、每回合都套用**的「🚨敘事終極警告」——「必須停在當下進行式的心境、留一個未完成的動作...絕對禁止讀起來像已翻頁的完結篇章」。這句本意是防 AI 一次把整段關係寫到終局，但等於把**每回合能推進的幅度**都摁在同一個「剛起步就打住」的小格子裡，跟 `driveStr` 要的「同伴主導、確實往前推進」正面衝突——不管玩家打多少字，AI 都只敢挪一點點，🔥開了也白開。改法：`driveOn` 為真時换一個版本的終極警告，保留「不可整段寫成完結收尾句(那一夜/自此/就這樣/從此)」的限制(避免劇情失控跳過發展)，但拿掉「每回合都要停在剛起步瞬間」的限制，明確允許「本回合可以確實大幅向前推展...玩家打少少字也能推進不少」；熄滅🔥時維持原句完全不變。純 `Router_Narrative.gs` 條件式改動，Engine_Combat.gs 0 改動。
    - **🔥 二修：🔥開啟時文字尺度同步拉滿(2026-07 玩家定案「點火之後可以最瘋狂主動，沒點火的話就都可以」)**：起因是玩家轉貼另一個 AI(Gemini)建議的「解禁提示詞」——查證後那段建議整個不能用(用的是本專案已在這輪 session 拿掉的舊版兩參數 `buildDefaultSystemPrompt(isNsfwMode, backLocked)` 簽名、JSON 範本也是完全對不上目前 schema 的捏造欄位如 `stat_changes`/扁平字串 `rel_changes`，照搬會讓 `Router_Narrative.gs` 完全解析不到任何欄位)，但玩家想要的核心訴求(讓文字更直白露骨、別太含蓄)是合理的，改用現有機制實現：`driveStr`(🔥主動掌握模式的注入段落)新增第④點「文字尺度同步拉到最滿——這個模式下的情慾描寫可以毫不含蓄、直白露骨地放手寫，不必比照平日的留白節制」，篇幅分配規則(慾海律令第4條)仍要遵守，只鬆綁用詞尺度不鬆綁篇幅結構。🔥熄滅時的基準用詞尺度依玩家指示**不變**(「都可以」＝維持現狀，不额外收緊)。純 `Router_Narrative.gs` 條件式改動(`driveOn` 為真才生效)，Engine_Combat.gs 0 改動。
    - **🐛→✅ 三修：拿掉四類型範例，AI 3輪內就開始機械套用同一套(2026-07 玩家反映「這段好像不太需要，AI 3輪其實就還是一直反覆」)**：`driveStr` 原句「高傲者步步進逼直到玩家求饒認輸、虔敬者以奉獻之名榨乾矜持、活潑者纏到玩家無處可躲、深情者溫柔卻讓人無所遁逃」給了4種具體類型範例——跟緊接在後的規則②「【角色一致性鐵律】仍完全有效，禁千篇一律的霸道模板」自相矛盾：一邊禁止套公式，一邊自己先遞了一份4選1的公式菜單，AI 自然就近取材、機械套用最像的那一類，而非真正依這個角色本人的個性去演。已拿掉具體枚舉，改成「手法必須貼合她/他本人真實的性格與語癖去把玩家逼向毫無招架餘地，禁止套用固定公式或別的角色的手法」——原則性指令，不給可被機械複製的模板，跟今天稍早新增的口吻/招牌小動作(見「鑑賞從者卡好感數值」條目附近)正好呼應，讓 AI 真的依角色本人資料判斷而非套公式。
    - **🗜️ nsfwBaseRules/specificRules 全文壓縮(2026-07 玩家定案「這裡感覺可以縮減!!!」)**：玩家貼出當時完整的兩個常數內文，覺得字數可以再收。逐條重新措辭壓縮(拿掉重複的「必須/皆是/一律」等贅字、合併相鄰子句、標點精簡)，**不刪除、不合併、不改變任何一條規則的實質內容或判斷邏輯**，純文字瘦身。範圍涵蓋 `nsfwBaseRules` 全部7條(【敘事與對話】3條/【世界與NPC自主】3條/【狀態與輸出】2條，其中一條是三段合一)與 `specificRules`(【慾海律令】)全部7條。**這是本輪 session 唯一一次 `git diff -- gas/Engine_Combat.gs | grep -c nsfwBaseRules` 顯示非 0 且確實是常數本體被改動的情況**(count=2，其餘每次出現非0都只是 `return nsfwBaseRules + ...` 那行 context 提及變數名)——`git diff --stat` 確認 12 行變動、全部落在兩個常數的模板字面內，經玩家明確要求後才動手，逐條核對過壓縮前後語意一致。
    - **🗑️ 清除 `isKanshou` 死變數與兩處死分支(2026-07 玩家貼出 `actionPlay` prompt 組裝段落「這邊也整理，沒有攻擊啥的，鑑賞沒有的功能就先刪除」)**：`isKanshou`(`myGameId.indexOf("k_")===0`)原意是「鑑賞世界」判斷，但 `actionPlay` 函式入口早就強制擋下非 `KPC_` 呼叫(見函式開頭的 entry guard)、且鑑賞唯一建列路徑 `actionEnterKanshou` 永遠指派 `"k_"+Date.now()` 當 game_id——两者相乘之下，`isKanshou` 在這個函式裡**數學上保證恆為 true**，3 處用到它的地方全是死分支：①`partyDetailsArr` 的 `isKanshou?A:B` 三元式，B 分支(顯示氣血/STATUS 這些戰鬥限定欄位)永遠走不到；②`【系統底層防呆·雙向裁決】`(戰鬥雙向裁決規則)的 `isKanshou?"":combat文字`，不只走不到，這段文字本身對鑑賞來說根本是錯的(鑑賞沒有戰鬥引擎能處理這句規則，一旦意外觸發只會讓AI收到自相矛盾的指令)；③`💕【鑑賞·後日談模式】` 世界觀覆寫的 `isKanshou?content:""`，同理该覆寫其實每次都該套用。三處全部簡化成無條件版本(拿掉戰鬥裁決死文字、鑑賞覆寫/同行夥伴命格字串直接展開不再包三元式)，`isKanshou` 變數本身也隨之刪除(全檔案查證這是唯一 3 個用到它的地方)。純刪除死碼，不影響任何現行行為(因為死分支本來就不會被執行)。`Engine_Combat.gs` 0 改動。
    - **🧠 inner_monologue 強制思維鏈＋絕不重置(2026-07 玩家提案·經整合後採用)**：玩家提案在 NSFW schema 加「先自省再敘事」欄位＋動態性格強鎖規則。評估採納兩塊真正新的：①`finalJson` 新增 `inner_monologue` 放範本【第一位】(模型照範本順序生成→先自省才寫敘事)，定義為「本回合主要互動對象那名NPC」的第一人稱自省(多人同場不迷失)、約50字、公式=[原本的性格尊嚴]vs[當下真實狀態]——後端 `sanitizeAiData_` 不讀此欄→自然丟棄，不顯示、不進歷史、零程式面改動；②慾海律令新增第1條【先思考後敘事】＋第2條【絕不重置·繼承情緒溫度】(角色已推進的親密階段禁止因換一次API呼叫就歸零，降溫只能因劇情明確事件)，原1-6條順移為3-8、內容全保留。**未採納**玩家範例的部分：墮落弧框架(「初期抗拒/中段拉扯/末段淪陷」必經流程)改為中性階段用語(抗拒/拉扯/沉溺 或 甜蜜/依偎/索求皆可，依角色意願判斷)；核心矛盾公式已在【角色一致性鐵律】部署過→自省規則改為引用該鐵律、不複寫(防兩份互相稀釋)；整段替換 specificRules 會洗掉本週修的 6鍵schema/女女柔軟/log_summary 等→改為插入式整合。`nsfwBaseRules` 本體 0 改動。
    - **🐛→✅ 慾海律令的女女硬編碼與男女配對矛盾(2026-07 修·玩家發現)**：律令是鑑賞純女女時代寫的——開場白「女女情慾」、【女女柔軟】核心條、與「絕對禁止插入式陽具、嚴禁憑空生出男性器官」的無條件禁令，對現已開放的男御主×女同伴配對直接矛盾(男御主本來就有)。改依配對分流：開場白去掉「女女」；柔軟條改【依配對裁決】(女女=原規則全套；男女=依實際性別器官自然互動、女性側描寫仍柔美)；插入禁令限定【僅女女配對時】。逐對的實際配對判斷仍由 `genderHintStr`(Router_Narrative.gs·早就逐對算好)提供。順帶確認玩家問的 log_summary/mentioned_names 皆完好在範本內(整合 inner_monologue 時已刻意保留，未被玩家範例草稿的省略帶掉)。
    - **🐛→✅ inner_monologue 的「我」跟敘事視角的「我」打架(2026-07 玩家鑑賞回報「AI有時候不知道在扮演誰」，玩家明確授權修改)**：上一條(472)採用的 `inner_monologue` 定義原句「本回合主要互動對象(那名NPC)的**第一人稱自省**：依對話歷史總結**我**目前的狀態…[**我**原本的性格尊嚴]」——這欄被刻意放在 JSON 範本【第一位】(模型照順序先寫完這欄才寫 narration)，卻明著要求AI用「我」代入NPC的視角，緊接著 narration 又要求「我」切回玩家(見 `sfwBaseRules`/`nsfwBaseRules` 開頭「第一人稱「我」（玩家＝御主）」)——兩種「我」在同一份提示詞相鄰兩欄打架，flash-lite 小模型容易把剛寫完的NPC視角帶進 narration，玩家反映的「AI用對面角色的視角、把玩家寫成第三人稱」很可能根源在此(比同批修的 `servantCard_`「自稱」標籤衝突更直接)。改為第三人稱總結：「用第三人稱總結...目前的狀態(...此欄不是該角色的台詞或視角，NPC本人不可用「我」自稱)。公式：[該NPC原本的性格尊嚴] vs [當下情緒與身體的真實狀態]」——語意/欄位用途不變(仍是先自省再敘事、仍不顯示給玩家)，只拿掉會跟敘事視角衝突的「我」字。**這次改動屬於`finalJson`(NSFW schema)，不是 `nsfwBaseRules` 那個變數本體，但仍屬紅線①保護的「整套NSFW機制」——玩家已明確授權才動手，非鑽字面漏洞。**
    - **🔍 全面複查追加修正(2026-07 玩家授權「去紅線去查看整理修正」，趁上兩條修完的上下文再通讀一次)**：
      1. **specificRules 第1條用詞跟已修的 inner_monologue 定義不同步**：上一條把 `inner_monologue` 欄位定義改成「第三人稱總結、NPC不可用我自稱」，但緊鄰的【慾海律令】第1條仍寫著「自省的寫法遵循【角色一致性鐵律】」——「自省」一詞還在暗示第一人稱內心獨白，跟已修的欄位定義自相矛盾。改為「這段第三人稱總結遵循【角色一致性鐵律】：呈現該NPC用原本的人格承受當下一切的樣子」，用詞對齊。
      2. **`Router_Narrative.gs` 的 `formatTrait`(同地NPC/同行夥伴用)有同一款「自稱」collision，servantCard_ 那批漏掉這條路徑**：`[自稱]${arr[2]}` 這格內容(persona.look 第3段)慣例本就寫成「自稱「我」」這種完整片語，跟 `servantCard_` 案是同一個問題、只是不同程式碼路徑(這支用在同地路人與同行夥伴，`servantCard_` 用在從者/敵人戰鬥卡)——這次一併補上同款標籤限定「[台詞自稱(僅其本人引號內用，非旁白視角)]」。
      3. **`callGeminiAPI` 全連線失敗的 fallback JSON 殘留死欄位 `events: []`**：因果表刪除後全代碼零讀取，只是舊結構殘留，順手清掉(不影響任何行為，這個 fallback 只在 API 重試全部失敗時才會回傳給玩家)。
      - 本輪複查**未發現**其餘新衝突：`sfwBaseRules`/`nsfwBaseRules`/`specificRules`/`driveStr`/`PROMPT_REL` 交叉檢視過一輪，好感分級/慢熱鐵律/主動掌握三者的相容設計(見 471 條)仍然自洽，未見進一步矛盾。`git diff -- gas/Engine_Combat.gs | grep -c nsfwBaseRules` 全程 0(改動落在 `specificRules`/`callGeminiAPI` 內文，非變數宣告行)。
    - **🗑️ log_summary 的 event/tag 拔除(2026-07 玩家定案「沒用就先砍」)**：追查「log_summary 寫在試算表哪裡」時確認——它的原歸宿(因果事件表)2026-07 已整套刪除，現存唯一消費者是**交談輪數計數**(`Router_Narrative.gs:462-485`：只讀 `subject`+`object` 判定本回合互動對象，把該角色列的 REL_MEM 欄 `[交談輪數]N` +1；solo 寫「眾生」、鑑賞寫「鑑賞眾生」)。`event`(10字概括)/`tag`(閒聊/承諾/秘密/變故) 產了就丟、零讀取——已自 SFW/NSFW 兩份 schema 一併拔除(NSFW 改直接引用 `baseJson.log_summary`)，sfwBaseRules 的 JSON格式第2條與慾海律令第7條的 tag 說明同步改寫。以後要做回憶錄/大事記再加回。
    - **🐛→✅ 三修：既有存檔仍殘留改版前的「無」值(2026-07)**：玩家反映改完還是看到「無無無」——查出二修只擋得住 AI **之後**的新輸出，改版前已經 merge 進資料庫的舊「肉棒：無」等值仍原封不動留著(`mergePhysicalStatus` 只增改不刪除舊鍵)。不對已存資料做搬遷，改在**顯示端**(同伴卡`physK`＋御主卡`mPhysLine`兩處)加濾網：值為「無」或空字串的鍵直接跳過不渲染，新舊存檔皆乾淨顯示，且往後即使又有例外情況漏填「無」也有一道防線。
    - **🐛→✅ 四修：男性角色卻顯示「蜜穴」(2026-07 修·玩家回報)**：跟三修同一個根因家族但不同觸發點——`sanitizePhysicalState`(Router_Narrative.gs)只靠鍵名白名單(1-6)過濾 AI 輸出，從未檢查角色實際 `SEX`；`mergePhysicalStatus`(Core_Settings.gs)的 `Object.assign` 只增改、從不刪除。只要 AI 有一次吐錯性別代碼(如男角色寫了「5」=蜜穴，換模型測試時尤其容易發生)，錯的鍵就永久跟對的鍵並存在 PHYSICAL 裡，命格面板/從者卡兩個都全鍵印出，於是同時看到「肉棒：如常　蜜穴：未開」這種矛盾狀態。**根源修法**：`sanitizePhysicalState` 新增必填的 `sex` 參數，在收下鍵之前就擋掉跟性別矛盾的代碼(角色非「男」擋4/肉棒、非「女」擋5/蜜穴)；`mergePhysicalStatus` 也新增 `sex` 參數，每次合併後主動 `delete` 矛盾鍵——**這步同時是自我修復機制**：不需要額外一次性清洗腳本，該角色下一回合只要觸發任何 `physical_state` 更新(schema 標記【每回合必填】)，merge 時就會自動清掉舊的矛盾鍵。兩處呼叫端(玩家自己＋NPC)同步補上 `String(pcData[idx][COL.PC.SEX] || "")` 傳入。純 `Router_Narrative.gs`/`Core_Settings.gs` 改動，`Engine_Combat.gs`(`nsfwBaseRules`)0 改動。
    - **🗑️→✅ 五修：physical_state 6鍵全砍，簡化為單一「狀態」欄(2026-07 玩家定案「肉體那些欄位不需要了，只要狀態就好」，同一天推翻四修的修法)**：玩家指名要拿掉全部 6 個數字代碼鍵(1姿勢動作/2胸部/3顏面/4肉棒/5蜜穴/6服裝狀態)，改成單一自由文字欄，AI 自己決定要不要提、提多細，不強制逐項列舉——這本來就更貼合慾海律令第4條「❌禁止器官逐格交代」的敘事精神(過去 schema 逼AI逐格填、規則卻禁止逐格寫，兩者本就矛盾)。連鎖修改：①`Engine_Combat.gs` 的 `_physicalState`/`_physicalStateRef` 從 6 鍵物件改成單一字串描述，`finalJson.intimacy_feedback._note` 同步改寫，`specificRules` 拿掉舊規則5(器官代碼性別限定)、改寫規則6(舊)為新規則5(單一狀態欄描述)，後續規則順移；②`Router_Narrative.gs` 的 `genderHintStr` 拿掉「肉棒代碼(4)不輸出」/「男4=肉棒／女5=蜜穴」這類 schema 層級指示，只留真正影響敘事內容的女女配對手法限制；`pPhysicalObj`/`npcPhysicalObj` 的懶初始化預設值從依性別分岔的 `{肉棒:如常}`/`{蜜穴:未開}` 簡化成統一 `{狀態:如常}`；`sanitizePhysicalState` 從「6鍵白名單＋性別過濾」整段簡化成「單一字串trim＋敷衍語過濾」；③`Core_Settings.gs` 的 `mergePhysicalStatus` 從「Object.assign 多鍵合併＋依性別刪矛盾鍵」簡化成「直接覆寫`狀態`這一鍵」——**上一條(四修)剛加的性別矛盾鍵清洗邏輯，隨著器官專屬鍵整段消失而自然作廢**(問題本身不可能再發生，不是繞過)；④`Script.html` 的 `kanshouStatusLines_` 從組4行帶標籤簡化成印單一句無標籤文字，`kanshouClothLine_` 整段刪除(服裝凌亂度併入同一欄)，兩處卡片呼叫點同步更新；⑤`Gallery.gs` 的 `actionKanshouSetSex` 切換性別時的 PHYSICAL 重置值改成統一 `{狀態:如常}`(不再需要依新性別分岔)。**PHYSICAL 欄位儲存格式維持 JSON 物件不變**(只是從 N 鍵縮成 1 鍵`{"狀態":"..."}`)，刻意保留這層 JSON 包裝而非直接存純文字，是為了不用去動 `buildPlayerStatusString`/`Router_Action.gs` 等既有 `JSON.parse(...||"{}")` 讀取路徑，把改動範圍收斂在「這個物件裡有幾個鍵」，不動「這格資料的儲存形態」。`git diff -- gas/Engine_Combat.gs | grep -c nsfwBaseRules` 這次確認為 1，但該行是 diff 顯示的 `return nsfwBaseRules + ...` context 行(提到變數名)，非 `nsfwBaseRules` 常數本體字面被改動(改動全落在 `_physicalState`/`finalJson`/`specificRules`)。
    - **🚨→✅ 真·嚴重迴歸：`finalJson.options` 整個消失，AI 沒有選項範本可填(2026-07 玩家問「填的欄位都正確嗎」查出)**：`git log -S"options" gas/Engine_Combat.gs` 回溯確認——`isNsfwMode` 統合重構那次(拿掉SFW/NSFW分支)之前，`baseJson.options` 本來就有實際的4類範本 `["1. [主動]強勢掌握主導...","2. [被動]順從委婉試探...","3. [接續]順劇情延續互動...","4. [反差]跳脫氛圍的驚人舉動..."]`，NSFW分支 `finalJson.options = baseJson.options` 保留、只有SFW分支 `delete finalJson.options`；統合成單一版本時這個欄位被整個漏掉，沒有被搬進新的 `finalJson`。後果：`nsfwBaseRules`【狀態與輸出】規則2「只輸出合法JSON，options固定4個...類別見下方輸出範本」這句話還在，`Router_Narrative.gs:574`(`options: aiData.options`)也還在讀、前端`Script.html`也還在用它渲染「命運的抉擇」4顆按鈕——但 AI 拿到的範本裡完全沒有這個欄位可以照著填，只剩一句空泛文字指示，選項品質/穩定度(甚至有沒有輸出這欄)完全沒有把關。已把原始4類範本原樣補回 `finalJson`(narration/location之後、intimacy_feedback之前，跟改動前的相對位置一致)。**這是本次複查裡唯一一個「消失的必要欄位」，其餘欄位(inner_monologue/narration/location/intimacy_feedback各子欄/rel_changes/log_summary)逐一比對 schema 範本與 `Router_Narrative.gs` 消費端後皆一致無誤**。
    - **🔍 複查順帶發現兩處次要問題(暫不動，記錄待玩家決定)**：①`aiData.recruited`(`Router_Narrative.gs:284` 讀取、`Script.html:2607` 渲染「XX正式加入隊伍」提示)——`finalJson` 從沒有過 `recruited` 欄位可供 AI 填寫(往前查到 FATE 換骨初期都沒有)，這段消費代碼形同陪跑的死碼，`newlyRecruited` 恆為空陣列；註解寫「🌹鑑賞允許AI在自由敘事裡直接招募人」，看起來是曾經想做、schema 沒接上的半成品功能，不是誤刪。②`rc.forceTag`(`Router_Narrative.gs:314`)——程式碼會檢查這個旗標，但全代碼庫查無任何地方賦值，是永遠走不到的死分支，無害但可以清。兩者都不影響現有欄位的正確性，只是「多餘/未完成」的旁支，故未擅自處理，待玩家決定要補上 recruited 功能還是乾脆清掉死碼。**玩家定案「先刪除吧」**：`Router_Narrative.gs` 拿掉 `newlyRecruited` 變數本身、其在 `relChangesToProcess.forEach` 注入邏輯、`isPartyStr` 的 `newlyRecruited.includes` 分支、回傳物件的 `recruited: newlyRecruited` 欄位；`dismissedNpc`(解除組隊，走 userMsg 文字比對、跟 `aiData.recruited` 是不同機制，真的有作用)原樣保留不動。`rc.forceTag` 判斷分支拿掉，`finalTag` 簡化為單一三元表達式(`isValidAiTag ? aiProvidedTag : oldTag`)。`Script.html` 對應拿掉 `data.recruited` 的「XX正式加入隊伍」渲染區塊(查證全代碼庫沒有任何後端路徑會回傳 `recruited:` 這個鍵，含 solo 的其他 action 在內，安全移除)。純刪除，不影響任何現行功能。
    - **🆕 鑑賞從者卡補「好感」數值(2026-07 玩家要求「放名子旁」)**：查證 `s.bond`(Router_Action.gs 早就有帶，來源 `COL.PC.BOND`)在鑑賞的從者卡分支(`buildSvCard` 的 `pc.mode==='kanshou'` 分支)從未被顯示過——只有 solo 戰鬥卡有 `羈絆 ${bondWord(s.bond)}` 這行(文字化，如「信賴」)，鑑賞完全沒露出好感。玩家要放名字旁，且用詞是「好感」(數值本身的正式名稱，非 `bondWord` 抽象成的關係詞)，故直接秀原始數值：`s.name + ' 💗' + (s.bond||0)`，同一行、小字級、粉色，不佔額外版面。純 `Script.html` 前端顯示改動，未動任何後端資料流。
    - **🐛→✅ 「互相的稱呼」永遠不變的根因：`mutual_nicknames`/`erogenous_zones` 範本零說明(2026-07 玩家問「鑑賞沒有互相的稱呼變動嗎」查出)**：`finalJson.intimacy_feedback` 裡這兩個欄位過去只寫著裸的字面 `"無"`，跟同一物件裡的 `dynamic_skills`(有「規則見下方慾海律令第X條」的完整說明)形成強烈對比——AI 完全不知道 `mutual_nicknames` 是要記錄「雙方發展出的暱稱/愛稱」、也不知道 `erogenous_zones` 是要記錄「本回合實際觸及的敏感部位」，只會照抄範本字面的「無」，永遠不會真的變動。**根源修法**：仿照 `dynamic_skills` 的做法，兩個欄位都補上具體說明文字＋指向慾海律令規則；`specificRules` 規則7(原本只講雙修技巧)一併擴充，同時涵蓋三者「只有本回合確實發生/存在才填、其餘填無」的共通原則，`mutual_nicknames` 特別加註「好感需推進到一定程度、對話中自然開口使用才算數」避免 AI 提前腦補尚未發展的稱呼。**順帶修正一個我自己前一輪留下的漂移**：`dynamic_skills` 的描述文字寫著「規則見下方慾海律令第8條」，但更早一輪拿掉 physical_state 的舊規則5(器官代碼)後，規則已從8條縮成7條、原第8條(雙修技巧)順移成第7條——這兩處「第8條」引用當時忘了同步更新，這次一併修正為「第7條」。`Engine_Combat.gs` 改動全落在 `finalJson`/`specificRules`，`nsfwBaseRules` 常數本體 0 改動。
    - **🐛→✅ 鑑賞移動抵達提示詞跟 solo 戰爭巡查風格完全共用、零區分(2026-07 修)**：玩家反映「明明沒有敵人，感覺卻像要戰鬥了」——查出 `Script.html` 的 `arrivePrompt`(移動後觸發的抵達敘事)完全沒有依 `pc.mode` 分支，固定寫「若無敵蹤，寫一段巡查、警戒或短暫喘息的氛圍，並自然暗示可凝神偵查四周」——鑑賞從無敵從者/敵御主(`foes` 恆空陣列)，但這句戰爭氛圍指令照樣每次移動都塞進提示詞。已拆成 `pc.mode==='kanshou'` 專屬分支：改用溫和的「後日談和平時光，沒有敵蹤、沒有戰鬥，不必警戒或巡查」框架，同行同伴(`myServants`)依個性自然開口，御主可自然反應但不越權替玩家決定下一步；solo 分支原樣不動。
    - **🚨→✅ 直接召喚同伴(KHV_)的好感/肉體/親密記憶全部沒真的寫回試算表(2026-07 修·嚴重)**：玩家反映「AI有輸出好感度+X，但沒有確實寫入」——查證 `Router_Narrative.gs` 最終寫回迴圈(`dirtyPcRows.forEach`)有一道 ID 前綴允許清單(`PC_`/`NPC_`/`DEAD_`/`KPC_`/`KSV_`)，唯獨漏了 **`KHV_`**(直接從英靈庫召喚的同伴，`heroToKanshouRow_` 建列)——這類同伴的好感/肉體/雙修記憶都在記憶體正確算完(`pcData[nIdx][COL.PC.BOND]=newFav` 等)，卻在這一關被過濾掉、`sheets.pc.getRange(...).setValues(...)` 從未執行，永遠沒真的落地。敘述後方顯示的「好感度+X」徽章之所以照樣顯示，是因為那段渲染直接讀 `aiData.rel_changes`(AI 原始輸出)、不受這個允許清單影響，造成「AI 說有變、試算表沒動」的假象。已補上 `KHV_` 前綴。**任何用直接召喚(而非封存邀請)進場的鑑賞同伴，在此修復前的好感/肉體狀態皆未真正持久化**，此修復後才會開始正確累積。
    - **🐛→✅ 英靈庫清單無篩選，長列表難挑(2026-07 修)**：玩家反映扁平列表（36騎全列、無分類）挑一位要滑很久。`get_heroes` 回傳的 `h.gender`(COL.HERO.SEX) 早就有資料，只是前端沒拿來用。加**性別/職階雙下拉篩選**，純前端本地篩選(`kanshouSetFilter`/`renderCompanionsPanel`)，不重打 `gasRun`——`openCompanions()` 只在真正需要新資料(初次開面板/邀請/召喚/請走後)才呼叫伺服器，篩選切換純重繪快取的 `_kcHeroes`。選單選項**資料驅動**：從當前召喚清單動態 `Array.from(new Set(...))` 取值，不寫死性別/職階列表(職階/性別種類增減時選單自動跟著長)。清單項目附帶顯示性別。(此條為 main 分支上一輪 squash-merge 後才單獨補寫的紀錄，功能其實早已隨同批改動落在這條分支——merge 時一併收回文件，避免遺失)
  - **🐛→✅ 「後日談」框架文字對新路徑失真(2026-07 修·玩家發現)**：新增直接召喚後，`Router_Narrative.gs:192` 那句「最高優先級覆寫」原本無條件斷言「聖杯戰爭早已落幕，這是奪得聖杯後與從者共度的約會時光」——對剛從英靈庫召喚、從未跟玩家交手過的英靈來說，這句話直接對 AI 撒謊(等於要求 AI 演出「我們曾一起打贏聖杯戰爭」的虛構羈絆)。已改成依在場同伴是否**全數**為直接召喚(`COL.PC.ID` 開頭 `KHV_`)分支：全為直召喚→改用「剛被召喚、初次相遇，嚴禁暗示曾並肩作戰」的框架；其餘(含混合/全為封存路徑)維持原「聖杯戰爭已落幕」框架。連帶修正兩處玩家可見的 UI 文案(`Index.html` 慾海入口說明「贏過才有人可約」→改「封存從者或直接召喚皆可」；`Script_Kanshou.html` 首次進場提示「邀請曾與你並肩的她」→改「並肩奪杯的她，或直接召喚一位英靈」)，避免玩家自己也被舊文案誤導成「沒贏過就沒人可約」。
  - **🐛→✅ 「請走」同伴＝銷毀資料，再邀回來全部歸零(2026-07 修·本次盤查最嚴重的一項)**：玩家問「雙修技巧/性癖/獨特稱呼會不會被洗掉」查出的真實漏洞——`actionKanshouRemove` 原本直接 `kpc.deleteRow(...)`，把這位同伴在慾海裡累積的 `[雙修技巧][性愛時敏感部位]`(MEMORY，NSFW 互動時由 `pfb`/`nfb.dynamic_skills`/`erogenous_zones` 寫入)、`[專屬稱呼][親密次數][交談輪數]`(REL_MEM，`nfb.mutual_nicknames` 寫入)、當下肉體(PHYSICAL)、好感(BOND)**整列銷毀**；註解寫「資料仍封存在鑑賞名冊」，但那只精確到**最初封存那一刻**的舊快照(`buildGalleryForm_` 原本也只捕捉外貌/姿勢/顏面/肉體，同樣沒收這幾項)，請走之後在慾海裡累積的一切都救不回來——每次「請走→再邀」就重歸零，等於這幾項數據從沒有真正被持久化過。
    - **根源修法**：不再刪列，改用既有的 `COL.PC.IS_PARTY`(同行旗標)——`actionKanshouRemove` 只把該列的 `IS_PARTY` 清空(退出同行)，整列原樣保留在「鑑賞眾生」分頁；`actionKanshouAdd`/`actionKanshouSummonHero` 邀請時先查「此局是否已有這位同伴的列」，有就直接把 `IS_PARTY` 設回「同行」＋更新座標喚回(累積的一切原封不動)，查無才走原本的 `kanshouServantRow_`/`heroToKanshouRow_` 建全新列。連帶修正 `actionKanshouCompanions` 的「在場」清單、`actionKanshouAdd`/`SummonHero` 的人數上限計算都補上 `IS_PARTY==="同行"` 過濾(不然被請走、資料仍在表上的同伴會被誤判成在場)。
    - **同步修正 `getLocalPeopleList`(Core_Settings.gs)**：solo 沿用的「同地 或 好感≥60 或 同行」寬鬆在場判定，套在慾海會出包——被請走的同伴通常好感早已≥60、且 `LOC` 凍結在請走當下那格，玩家若剛好晃到同一格會被誤判「在場」重新登場。已收緊：慾海(`myGameId` 開頭 `k_`)只認 `IS_PARTY==="同行"`，不吃 LOC/好感兩條 fallback，solo 邏輯不變。
    - **順手把 `buildGalleryForm_`/`applyGalleryForm_` 也補齊**：新增 `memory`/`relMem`/`bond` 三欄快照(封存/首次邀入用)，讓查無「IS_PARTY 保留列」時退回的舊快照也不會漏掉 `交談輪數`(solo 期間就能累積)與真實好感值(不再無論實際好感一律灌 90)。
  - **🐛→✅ 交談輪數自「因果」機制砍除後悄悄壞掉(2026-07 修·同次盤查發現)**：AI 的 `log_summary` 欄位(`Engine_Combat.gs`)早在因果表整組砍除時就從舊格式 `{people,event}` 改成新格式 `{subject,object,event,tag}`(主被動方向)，但 `Router_Narrative.gs:504` 算「交談輪數」仍在比對已不存在的 `logSum.people`——`String(undefined)` 恆為字面字串 `"undefined"`，`.includes(name)` 幾乎不可能命中任何真實姓名，交談輪數從那次重構後就沒再增加過。已改讀現行的 `subject`/`object` 欄位。（因果表/命運長河本體是玩家上月主動精簡掉的功能，此次確認純屬好奇、不重建。）
  - **🚨→✅ `actionPurgeOrphans`(清殘列)可能整表清空「鑑賞眾生」(2026-07 修·玩家要求「整體複查、慢慢看、不要偷懶」後查出，本輪最嚴重)**：`Account.gs` 這支函式判定孤兒的邏輯只讀「帳號」表的 `COL.ACC.PC`(solo 連結)，從未讀 `COL.ACC.KPC`(慾海連結)；原本吃參數傳入的 `sheets.pc`，但 dispatcher 會依 pcId 前綴把它路由到「鑑賞眾生」。若此 action 被以 `KPC_` 呼叫，`liveGids` 永遠對不上任何慾海列的 `game_id`(`k_`開頭)，會把整張「鑑賞眾生」表(**所有帳號**的慾海御主與同伴，含雙修技巧/親密次數等剛修好要保留的心血)判定為孤兒整批清空。且這不是純理論風險：前端「🧹 DEV：清殘列」按鈕(`Index.html`)就放在慾海卡片裡緊鄰「進入鑑賞」，玩家上次若在慾海、重整頁面回到帳號選單，全域 `pc.id` 仍殘留上次的 `KPC_...`(只有登入/開新局/封存才會覆寫)，此時手滑點下去就會觸發。雙重修復：①`Router_Action.gs` 的 `KANSHOU_BLOCKED_ACTIONS_` 新增 `purge_orphans`(dispatcher 層直接擋掉 KPC_ 呼叫)；②`actionPurgeOrphans` 本身改成直接指名讀 `ss.getSheetByName("眾生")`，完全不理會 `sheets.pc` 被路由到哪——即使①這道牆未來被繞過或漏加，這支函式結構上也不可能碰到「鑑賞眾生」。順手把 `prep_meal`(純戰鬥向 buff，前一輪加固漏掉的一項)也補進黑名單。
  - **🐛→✅ 改御主自己性別沒回頭檢查同伴配對合法性(2026-07 修·同次複查發現)**：`actionKanshouSetSex` 原本只驗證新性別合法就直接寫入，完全沒檢查改性別後會不會跟現有「同行」同伴組成不合規配對——御主原本是女、邀了一位男同伴(合法)，之後改成男，該男同伴會悄悄變成不合規配對卻沒被擋、也沒被請走，之後的敘事框架仍會用新性別去演出。已比照 `actionKanshouAdd` 的規則，偵測到「新性別=男」且有「同行」男性同伴時直接擋下這次改性別，請玩家先請走該同伴。連帶把 `actionKanshouRemove` 找列的迴圈補上 `DEAD_` 前綴排除(對照 `Add`/`SummonHero` 都有排除，這裡漏了，雖然慾海本無戰鬥理論上不會出現 `DEAD_` 列，屬防禦不一致)。
  - **📝 複查記錄·目前無害但脆弱、暫不動的兩點**：①`Time_World.gs` 的 `getClock_`/`writeClockToRow_` 在沒收到 `pcData`/`sheets` 參數時會 fallback 到 `ss.getSheetByName("眾生")`(硬寫表名)——全庫所有呼叫點都在已被 `KANSHOU_BLOCKED_ACTIONS_` 擋住的 solo 專屬 action 內(戰鬥/羈絆/移動/休息)，慾海目前不會踩到，但屬於「靠呼叫者結構性質保護、非顯式擋牆」的同一類脆弱點，之後新增功能若直接呼叫這兩支函式要注意別漏傳 sheets。②`buildTagsPayload_`(Router_Action.gs) 的 `seals`(令咒餘量)計算沒有像 `economy`/`bondUsed`/`canRB` 那樣補 `isFate` 閘門，慾海角色列 MEMORY 無【令咒】標籤時會照樣算出預設值 3 並下發給前端——純顯示層資料，前端已用 `pc.mode==='kanshou'` 擋住不顯示，不影響任何邏輯，僅是風格不一致，不需要修。
  - **🐛→✅ 帳號歸屬完全沒驗證(2026-07 修·本次盤查最嚴重的一項)**：`KPC_`/`g_`/`k_` 的 ID 只用 `Date.now()`(毫秒級、無隨機尾碼)，理論上可預測；而這 5 支 action 過去只憑 `pcId` 找列就直接改寫/刪除，**完全沒驗證呼叫者是否真的擁有這個 pcId**(`kanshou_set_name/set_sex` 甚至連 `acctName` 都沒收)。只要拿到/猜中他人 `pcId`，就能把自己的封存從者塞進對方後日談、請走對方同伴、竄改對方 avatar 名字性別，對方毫無所覺。
  - **🔧 2026-07 二次修正·結構性根除(玩家要求「跟 solo 一樣」)**：第一輪修法是靠 `kanshouOwnedRowIdx_` 比對角色自己 MEMORY 內的 `【帳號】<acct>` 標記——這只是「補一道檢查」，屬於角色自己宣稱歸屬、驗證責任落在每個呼叫端，容易在未來新增 kanshou action 時被遺漏重蹈覆轍。已改成跟 solo(`linkAccountToPc_`/`COL.ACC.PC`)**同一套結構**：「帳號」表新增 `KPC` 欄位(`COL.ACC.KPC`)，由 `linkAccountToKanshouPc_`/`getAccountKanshouPcId_` 專責讀寫，只有伺服器碼會寫這個連結、玩家端無法透過任何參數影響——結構上就不可能繞過，不必靠每個操作各自記得驗證。`kanshouOwnedRowIdx_` 改為比對「帳號表記錄的 KPC 是否等於呼叫者聲稱的 pcId」。`actionEnterKanshou` 優先讀帳號表連結；若無(舊存檔)則一次性回退掃描舊版 MEMORY 標記並補寫帳號表連結(遷移不中斷玩家既有後日談世界)，之後就走新機制。MEMORY 內的 `【帳號】` 標記予以保留但**降級為人工檢視試算表用的辨識文字**，不再是驗證依據。
- `actionDevSeedGallery`：DEV 塞測試從者(待移除)。
- `actionPurgeOrphans`(action `purge_orphans`，主選單 DEV「🧹 清殘列」)：清「眾生」表孤兒——刪①所有 `DEAD_` 列 ②game_id 非任一帳號當前連結(COL.ACC.PC 反推 liveGids)的世界(敗北殘局/棄局/亡靈)。**保留**：活躍戰局、game_id 空白列(創角中)、鑑賞另表。整表 rewrite(setValues+單次 deleteRows tail，非逐列)。連帶清關係表：只刪「被刪御主(PC_)名下、非存活、非鑑賞御主」的 rel(防誤刪鑑賞關係)。回 {removed,kept,relRemoved}。**用途＝縮表加速每次按鍵的整表掃描**(眾生肥大主因＝每局敵御主+敵從者整批殘留)。
- `findPlayerServant_`、`purgeGameData_`。
- ⚠ **舊 `actionListGallery/actionEnterGallery/actionGalleryTalk` 已移除**(被 enter_kanshou＋kanshou_* 取代)。
- **🗺️→🚫 鑑賞拔地圖，改AI自主敘事換場(2026-07 玩家定案)**：鑑賞本就無戰鬥、無AP消耗、同伴永遠靠 `IS_PARTY="同行"` 綁定(不靠 LOC 比對決定「誰在場」)，solo 那套固定地圖節點清單＋移動按鈕(耗AP/戰鬥迷霧/撤離追擊全跳過，`isFateMove` 只認 `g_`局)對鑑賞其實是借用一套為戰鬥設計、幾乎用不到的重機器，還衍生出「陌生人靠LOC相同才判定在場」等額外複雜度。改成：
  - **Engine_Combat.gs**：NSFW `finalJson` schema 補 `"location"` 欄(緊接在 narration 之後)，AI 每回合自主回報所在地點——不限於冬木既有地名，可自創場景；鐵律「narration 必須先實際敘述移動/抵達過程，location 才能填新地名，沒移動就照抄原地點」，防止無故憑空跳場。
  - **Router_Narrative.gs**：`actionPlay` 讀 `aiData.location`，若與目前 `curL` 不同，寫回 `pcData[pcIndex][COL.PC.LOC]`＋同步所有 `IS_PARTY="同行"` 同伴的 LOC(仿 solo `actionMove` 移動全隊的既有邏輯，該函式完全沒動，鑑賞只是另開一條路徑)。💕【鑑賞·後日談模式】區塊補一句「換場地」規則呼應這條鐵律。**順手清死碼**：這裡原本有一段處理 `aiData.new_maps`(讓AI在鑑賞自由擴張地圖節點)的邏輯，但 schema 從來沒有要求 AI 輸出這個欄位，AI 從未真的產生過，整段是從未觸發的死碼，一併拔除。
  - **Script.html**：`applyModeUI()` 補隱藏 `#tab-map`/`#pane-map`(鑑賞不出現，solo 不受影響，仍需地圖管理戰鬥/AP)；`send()` 拔除 `data.allMapNames`→`loc-link`→`travelFromPane`→`actionMove` 這條點地名跳轉的機制(鑑賞地點已不受固定節點限制，點擊跳轉對它已無意義；`send()` 本就只有鑑賞會呼叫，solo 輸入框整條隱藏)；`applyClientState`(每次同步共用)的 `renderMapPane` 呼叫依模式跳過鑑賞，省下每次同步重繪一份沒人看得到的地圖面板。
  - **Script_Kanshou.html**：`enterKanshou()` 拔除進場時的 `renderMapPane()` 呼叫(面板已隱藏，算了也沒人看)。
  - 玩家自己的「目前位置」提示詞(`Router_Narrative.gs`【玩家命格】的 `位置:${curL}`)本就是 SFW/NSFW 共用的既有機制，不用另外新增。
- **🧹 PROMPT_ENV/PROMPT_GEAR 對鑑賞是九州殘留物(2026-07 玩家反映「這個感覺不用了吧」)**：`actionPlay` 的 NSFW 分支原本固定塞「【感知屏蔽】：外界感知已封鎖。請專注於當下空間氛圍與私密互動。」＋「【武裝與情報】：(暫時屏蔽)」——查證這兩行是九州舊「戰爭迷霧偵查」／「陣營情報·裝備」系統的殘留框架，鑑賞從未有過武裝/情報/偵查這類機制，「(暫時屏蔽)」字面上還暗示有朝一日會解除，但鑑賞根本沒有這個系統可解除，是純死文字；「感知已封鎖、專注私密互動」想傳達的「這是安全隱密場景」，下方【在場驗證鐵律】＋💕鑑賞覆寫區塊(絕對禁止戰鬥/世界是安全的)早就講過，屬重複。已比照 solo 的 `PROMPT_ENV=""` 模式，兩者皆改留空，純減 token、不損失任何資訊。
- **🚨 紅線區授權修正：`nsfwBaseRules` 本體殘留的舊「地圖按鈕才能移動」禁令跟新地圖機制打架(2026-07 玩家明確授權「改！就是鑑賞要ai自己改位置！」)**：拔地圖那次改完後複查提示詞才發現——`nsfwBaseRules`(`Engine_Combat.gs` 紅線變數本體)【狀態與輸出】第1條原本還留著「位置移動一律由系統地圖按鈕管理，AI 絕不輸出任何位置變更」，跟同一份提示詞裡新加的 `location` schema 欄＋💕區塊的「你可自主決定何時、換去哪」正面矛盾——AI 同時被告知「絕對不准輸出位置變更」跟「可以自主換地點」，等於新功能被舊禁令腰斬。這是拔地圖那次的漏改，不是獨立新需求，但因為改動點落在 `nsfwBaseRules` 字串本體內，依專案紀律先問過玩家才動手，取得明確一次性授權後才改。改法：拿掉「位置移動一律由系統地圖按鈕管理，AI 絕不輸出任何位置變更」，換成「位置改由你自主決定並填入 location 欄(見上方換場地規則)，不再受地圖節點限制」，其餘 `nsfwBaseRules` 一字未動(`git diff | grep -c nsfwBaseRules` 這次確認為 1，對應這一行的授權修改，非誤觸)。
- **🧹 dynamic_skills 的「無填無」vs「禁動輒填無」語氣拉扯(2026-07 玩家追問後授權「處理吧」)**：JSON schema 描述原寫「雙修技巧名(2~5字，無填無)」，`specificRules`(慾海律令，非 `nsfwBaseRules` 本體，不受紅線①限制)第8條卻說「禁動輒填無」——一個教AI「沒有就填無」、一個教AI「不要老是填無」，兩處字面互相拉扯。改成單一權威來源：schema 描述改成「規則見下方慾海律令第8條」(不再自己重複定義)，第8條收斂成完整規則「貼合身分個性給出當下情境對應的技巧名；只有本回合確實毫無相關技巧發生時才填『無』，不要動輒預設空白」——「無」仍是合法值，但只在真的沒發生時使用，不是預設懶人選項。
- **🔠 `sfwBaseRules`/`nsfwBaseRules` 對話格式規則抽共用函式(2026-07 玩家問「這些提示詞是否還可以再濃縮」授權「要！動手！！」)**：盤點兩份鐵律文字全文後，只有【對話格式】這一條(各自的第3條)是真正安全、有實益的合併對象——差異只有舉例詞(「微微一笑」vs「眼神一沉」)跟 sfw 版多帶的幾句澄清子句，語意完全一致；而且這條規則本身就曾因為兩處各自維護、各自漏改而炸過一次(2026-07 稍早的「動作/神態」字面外洩 bug，當時得三處分開修)，抽出來能杜絕未來再漏改。**已抽成** `dialogueFormatRule_(example)`(定義在 `buildDefaultSystemPrompt` 內、緊鄰 `sfwBaseRules`)，兩處第3條改成呼叫它並各自傳入原本的例字；渲染結果對 sfw 不變、對 nsfw 等同套用了 sfw 版原有的幾句澄清子句(純強化，非改變規則本身語意)。**範圍縮小、未依原提案合併另外兩條**：原本一併提議的【意圖攔截】【慢熱與傾心】實際重讀全文後，發現差異是**穿插在整段文字中間**(非可乾淨切出共用前綴＋各自差異尾段)，且內容差異看起來是刻意的模式區隔而非誤植——例如 nsfw 版意圖攔截多一句「唯有NPC個性確為順從且戰力明顯遜於玩家時，意圖才可直接成立」的正向收斂句(sfw 沒有對應句)、nsfw 慢熱與傾心多一個「點頭之交」關係詞範例(原本這條還多一個 [陣營] 判斷維度，已在下一輪九州殘留物清理中拔除，見下)。硬要把這兩條也拆成共用函式＋三元差異模板，會需要在函式內部插入條件判斷才能還原各自的完整語意，讀起來比現狀兩份各自完整的文字更難維護、不是真的變簡單，跟這次濃縮的初衷（降低未來漏改風險、不是為合併而合併）矛盾，故保留原樣不動。【萌點節制】那條也確認過是刻意的模式差異(nsfw 版明顯更嚴格/更囉唆，非誤植)，同樣不動。`git diff | grep -c nsfwBaseRules` 這次為 0(只動了第3條那一行內容，const 宣告本身那行沒被觸及；渲染文字雖有變化但屬同一次已獲授權的「濃縮重複規則」範圍內)。
- **🔄 對話格式規則全面重寫(2026-07 玩家明確提出新規格並授權)**：舊版嚴格限定「姓名只寫一次、動作只能在引號開頭一段、引號結束後同段落不可再補動作」，玩家提出新規格：動作可放在名字前／引號內(以聲音呈現，如「嗯～」)／引號後，三個位置不限次數與組合皆可自由使用；同一段落也不限制角色名字重複出現的次數(可容納多輪對話交錯)；另外明確要求「純背景/環境描述不用括號、且盡量少描述背景、專注在互動本身」。`dialogueFormatRule_(example)`(`Engine_Combat.gs`)整段重寫為新格式規格，保留引號僅一層「」禁嵌套。**同一函式 SFW/NSFW 共用**(見上一條)，此次重寫兩模式同時生效。`git diff -- gas/Engine_Combat.gs | grep -c nsfwBaseRules` 為 0(改動落在 `dialogueFormatRule_` 函式本體，非 `nsfwBaseRules` 變數宣告那幾行)——但此函式本身是餵給 `nsfwBaseRules` 模板的素材、屬紅線①保護的「整套NSFW機制」範圍，這次是玩家主動提出具體格式規格並明確要求修改，非擅自變更。
  - **緊接著追加拿掉「開頭禁代名詞(他/她)，必指名道姓」**：玩家確認這條也不需要，三處(`dialogueFormatRule_`＋`Router_Narrative.gs` miniSystem)一併移除，不再強制敘事開頭必須先點名。
  - **🔠 三修(2026-07 玩家明確授權)：引號內容種類補完＋強制邊說邊動作/帶聲音要寫出來**：舊版只點出「引號內可放（聲音）」，沒講清楚引號內也可以是純（動作）、（聲音+動作）合併、甚至整句只有動作聲音而無台詞文字，也沒有強制「邊說邊動作、或說話帶聲音時必須寫出來夾進台詞裡」——導致 AI 有時會把同步發生的動作/聲音省略、一整段台詞一氣呵成寫完。改成明確列舉引號內四種可能內容(台詞／(聲音)／(動作)／(聲音+動作)，可交錯、也可整句無台詞)，並用【必須】鎖死「有邊說邊動作或有聲音就要寫出來夾進台詞裡對應的位置，不可省略」；同步更新 `dialogueFormatRule_`(`Engine_Combat.gs`，鑑賞唯一路徑)與 solo `miniSystem`(`Router_Narrative.gs` `actionNarrateOnly`，兩處各自維護、須同步修改，避免重演先前「動作/神態」漏改一處的舊 bug)。`git diff -- gas/Engine_Combat.gs | grep -c nsfwBaseRules` 為 0(改動落在 `dialogueFormatRule_` 函式本體，非 `nsfwBaseRules` 變數宣告行；`dialogueFormatRule_` 本身是餵給 `nsfwBaseRules` 模板的素材，屬紅線①保護範圍，玩家已明確提出具體格式規格並授權修改)。
  - **🔠 四修(2026-07 玩家明確授權)：`nsfwBaseRules` 兩處規則精簡＋`mentioned_names` 整條刪除**：
    1. **【意圖攔截】拿掉[戰力]比對**：玩家問「玩家輸入的動作皆僅為『意圖』>>現在還有比拚嗎？」——查證後鑑賞世界觀明文禁止任何戰鬥/戰力概念(💕鑑賞覆寫區塊「絕對禁止任何戰鬥」)，原規則卻拿「NPC戰力是否明顯遜於玩家」當抗拒意圖是否成立的門檻，跟世界觀正面矛盾、且是個永遠沒有真實意義的假判斷(鑑賞角色間本就不比戰力)。已拿掉`[戰力]`，改成單純依`[個性]`判斷是否順從，其餘語意不變。
    2. **【慢熱與傾心】拿掉「禁用傾心/道侶等極親密詞」**：玩家直接要求拿掉這條詞彙黑名單，已移除；「好感未滿80者嚴禁言行表現傾心倒貼」的實質行為門檻(慢熱機制的核心)保留不動。
    3. **`mentioned_names` 整條(schema/AI指令/後端回傳/前端消費)刪除**：玩家問「這也不用了吧」——查證後這是死鏈：`send()`(Script.html，鑑賞`action:'play'`唯一呼叫點)收到`mentionedNames`後，鑑賞分支一律`pushCandidate(name, name)`，把文字換成一模一樣的文字，是個「算了、送了、解析了、替換了」卻自己換自己的無效操作。已從`finalJson` schema、`意圖攔截`規則裡引用它的那句、`Router_Narrative.gs`的`mentionedNames: aiData.mentioned_names || []`回傳欄、`Script.html`前端消費區塊四處一併刪除。**順手修正**：清除舊碼時發現`send()`定義正上方有段孤兒註解「連擊戰報專用輕量敘事」，講的是更早清理掉的舊九州`handleMultiAttack`/`renderCombatReport`/`narrateCombatResult`，跟`send()`本身(鑑賞聊天引擎)完全無關，一併移除避免誤導。
    4. **未動、僅回答玩家提問的兩項**：`inner_monologue`(強制思維鏈)——後端`sanitizeAiData_`不讀此欄，零程式面效果，純粹是提示 flash-lite 模型「先想再寫」的思考格；是否真的提升輸出品質是模型行為層面的經驗判斷、無法用代碼驗證，暫無證據顯示它沒有作用，故未動，玩家可自行實測拿掉後品質有無差異。【敘事與對話】第1條「絕對響應」——查證這條正對應本輪較早解決的「AI點火後仍保守」問題(逼AI開頭先承接玩家最新輸入、NPC當回合給完整態度不許懸念)，屬已驗證有實際針對性的規則，未動。
  - **🔠 五修(2026-07 玩家明確授權)：【狀態與輸出】第1條刪除不存在欄位的空耗禁令**：原句「肢體/感官/姿勢等狀態一律填入 intimacy_feedback，嚴禁另以 stat_changes 輸出生命/魔力/負面等任何數值或狀態；戰鬥、物品、金錢、陣營、任務等雜務本回合不追蹤、不輸出」——查證`stat_changes`根本不是`finalJson` schema 的欄位(2026-07 更早一輪已整組移除，`Router_Narrative.gs`只留一段死碼說明註解)，逐項禁止一件 AI 從未被要求做、也沒有範本可填的事，純屬空耗字數；戰鬥/物品/金錢/陣營/任務同理，這些雜務從沒進過任何 schema。玩家要求「就依照讀取到的資料繼續推進，其他用不到的也不要寫出來」——已改成直接點出實際會用到的兩個管道(「肢體/感官/姿勢等狀態一律填入 intimacy_feedback；好感依 rel_changes 推進」)，其餘一律「不追蹤、不輸出」概括帶過，不再逐項唱名不存在的雜務類別。
  - **🔠 六修(2026-07 玩家明確授權)：`specificRules`(慾海律令)第4條補齊篇幅來源＋中斷手法擴充**：玩家反饋原句「篇幅靠情感起伏、神態心理、氛圍張力與對話堆疊撐起」漏了肢體動作/喘息/聲音這幾種同樣該撐起篇幅的元素；「台詞被嬌喘打斷」也把中斷手法窄化成單一詞「嬌喘」，玩家要求「可斷續、喘息、聲音都可以」。已在篇幅來源清單補上「肢體動作、喘息與聲音」，中斷手法改成「喘息、聲音或斷續語句」三選一、不限「嬌喘」單一寫法，其餘語意(聚焦一兩處深入著墨、禁逐一點名全身部位/四感清單流水帳/器官逐格交代)不變。此條屬 `specificRules`(非 `nsfwBaseRules` 變數本體，但同屬紅線①保護的慾海機制範圍)，經玩家明確提出具體修正並授權才動手。
- **🧹 陣營/武功/境界 等九州詞彙全面盤查(2026-07 玩家「很多九州的提示...這裡只有fate!鑑賞要日式輕小說感覺」)**：全庫 grep 「武功/境界/內力/真氣/輕功/門派/江湖/武林/師門/掌門/幫派/宗門」等九州武俠術語，確認**只有**`Setup_FateWorld.gs`種子表頭殘留舊欄名(見下)＋各代碼註解裡的歷史說明用詞，AI 實際會讀到的敘事提示詞早已無這些字眼——不是新問題。實際找到、且真的會送進AI提示詞的殘留只有「陣營」：①`Router_Narrative.gs` 建構【當前同地人物】清單的那行原本無條件印 `陣營:${FACTION}`，但鑑賞的 FACTION 欄恆為「從者」(kanshou 只有同伴/自己兩種列，永遠不會有「敵從者/敵御主」之類會變化的值，這欄的存在意義是給 solo 分辨敵我)——對鑑賞而言每回合都印同一個死字，純粹是白佔token的九州殘留框架痕跡(當初這行是 solo/kanshou 共用一份時沒特別拆開)，已改成 `isKanshou` 時整段跳過、solo 不受影響。②**`nsfwBaseRules`本體**(紅線①，`Engine_Combat.gs`)【慢熱與傾心】規則原寫「NPC依[個性][氣質][陣營]真實反應」，同款死維度——kanshou NPC 的陣營從不變化，教AI「依陣營反應」等同給一個永遠只有一種值、沒有實際判斷空間的假指令，徒增誤導AI去腦補不存在的陣營衝突的風險；已拿掉 `[陣營]` 三字，其餘規則文字一字未動(`git diff | grep -c nsfwBaseRules` 為 0，只動了規則內文那一行，const 宣告行未被觸及)。**未動**：`Setup_FateWorld.gs`「眾生」/「英靈殿」種子表頭裡的「陣營」欄名(對應 `COL.PC.FACTION`/`COL.HERO.ALIGN`)——這是 solo 戰鬥判斷敵我的核心欄位、英靈的「屬性」(如「秩序·善」)更是原作真實存在的角色設定項，非九州殘留，不能砍；`specificRules`(慾海律令，非紅線本體)裡 solo 專屬的「邊界守護」規則提到「依個性與陣營獨立判斷」，該處是 solo 戰鬥從者分辨敵我用，同樣是正當機制、非殘留物。「命格」一詞(角色卡標題／查看命格按鈕)雖是舊九州命名習慣延續，但字面上剛好契合 Fate 的「命運/宿命」主題，玩家未點名要求，予以保留。
- **🔠 提示詞全面重寫縮字(2026-07 玩家「我想要真正的重寫！在減少整體給AI提示詞的字數重寫！多餘的重複的都不要」)**：不是換句話說，是逐一全文重讀 `Engine_Combat.gs`(`buildDefaultSystemPrompt`) 與 `Router_Narrative.gs`(`actionPlay` 組 prompt 的整段)，抓出真正重複輸出給AI的規則、合併成單一來源＋交叉引用，語意/機制刻意保持不變(只省字，不改玩法)。找到並修正 7 處：
  1. **「從者廝殺按鈕裁決、不得宣告死亡」三處重複**——`sfwBaseRules`【位置與戰鬥】、`specificRules`(SFW)「邊界守護」、`Router_Narrative.gs`每回合「系統底層防呆」三處逐字重講同一句。改成只在 `sfwBaseRules`【位置與戰鬥】留一份，其餘兩處改交叉引用(「見上方【位置與戰鬥】」「見系統提示」)。
  2. **narration schema 描述 vs 慾海律令第4條重複**——JSON 範本裡 narration 欄位描述原本重講一次「篇幅靠情感起伏/神態心理/氛圍張力/對話堆疊撐起」的風格指示，跟第4條逐字相同，改成欄位描述只留字數/人稱/決定權三件事，風格交給第4條。
  3. **「名字提取鐵律」整段獨立段落 → 折進 schema 欄位描述**——原本 `Router_Narrative.gs` 每回合另開一段解釋 `rel_changes.target` 只能填真名，改直接寫進 `rel_changes` 的 target 欄位描述本身(`"NPC真實姓名或「自己」(禁填台詞/地名/動作等其他內容)"`)，省掉整段重複文字，且schema級約束比事後說教更有效。
  4. **鑑賞💕區塊「兩次講沒有戰鬥」**——「【絕對禁止】任何戰鬥...世界是安全的」＋緊接著「世界觀＝和平的現代都市日常，沒有戰鬥...」兩句相鄰重複，合併成一句。
  5. **敘事終極警告 vs 💕區塊「敘事別收尾」重複**——鑑賞每回合這條規則講了兩次(💕區塊一次、敘事終極警告一次)，合併成一份、保留較豐富的例句列表(那一刻／那一夜／自此／就這樣／從此)。
  6. **在場驗證鐵律「禁止陌生人登場」講三次**——原文用三種不同措辭在同一段裡重申同一件事(「絕對禁止AI自行安排陌生人」「AI不得自作主張額外加碼」「不可讓任何具名角色登場」)，收斂成一次講清楚，「四下無人」的特例折進主句而非另起一句。
  7. **性別配對提示(`genderHintStr`)逐 NPC 重複整句**——原本每位在場NPC各自產出一句完整規則，若3位同性別同伴同場(kanshou上限)，同一句「女女配對：...肉棒代碼(4)不輸出、不寫「無」」會逐字複製3遍；改成先依「與玩家同性(僅女女)/異性」分兩組、組內只列姓名共用一句規則，規則邏輯完全不變、按同場人數線性省字。連動修正 `specificRules`(NSFW)第5條(器官填寫規則)改交叉引用這裡，不再重複列舉女女細節。
  同時也把 `driveStr`(主動掌握模式)裡兩份幾乎相同的「依個性列4種類型反應」清單(一份講攻勢起手、一份講榨乾方式)合併成一份。`nsfwBaseRules`本體這次唯一改動是【狀態與輸出】第2條(options格式)拿掉重複列舉的4個類別名稱、改交叉引用其後緊接的★輸出範本(`git diff | grep -c nsfwBaseRules` 為 1，對應這一行)。粗略量測：光是「在場驗證鐵律＋系統底層防呆＋💕區塊＋敘事終極警告」這一段整併後就從約1337字降到約904字(約−32%)，`genderHintStr` 在多同性同伴同場時降幅更明顯(隨人數線性省字)；NSFW 系統提示詞本身(`buildDefaultSystemPrompt`)也減少約90字。**刻意不動**：`resistPrompt`(好感抗拒梯度，7級各自完整敘述)、`nsfwBaseRules`／`specificRules` 裡功能上真有差異的規則(意圖攔截/慢熱與傾心/萌點節制的 sfw/nsfw 差異部分，上一輪已盤點過確認是刻意的模式區隔)——這次只砍「同一件事講兩次以上」的部分，沒有砍任何獨立存在的規則本身。
- **🧪 REL_MEM「專屬稱呼」補回prompt(2026-07 玩家問「只能用好感度數字控制AI表現嗎？感覺很死板」，討論後「先試試看」)**：討論方向——純數字門檻(BOND)容易死板，但完全拿掉又會失控；折衷方向是數字繼續管底線(慢熱/傾心門檻不變)，「像不像人」的細膩感改靠**具體記憶**而非再疊更多數字軸。查代碼發現 solo 其實已經有這類具體記憶在悄悄累積、卻從未被讀回：`COL.PC.REL_MEM`(專屬稱呼/親密次數/交談輪數)每回合都經 `intimacy_feedback.npcs[].mutual_nicknames` 寫入(SFW/NSFW schema皆有此欄，見 `Engine_Combat.gs` baseJson)，但讀回提示詞的只有鑑賞專屬的 `nsfwMemories`——**solo 端AI自己取的暱稱、聊過的痕跡，存進試算表後對AI而言船過水無痕**，下回合仍只能單靠BOND數字重新判斷關係親疏。這次先做最小實驗：`Router_Narrative.gs` 共用的 `localSceneStr`(SFW/NSFW都讀)在每位在場人物的關係欄位補上 `[專屬稱呼:xxx]`(從 REL_MEM 解析，無則不顯示)，緊鄰既有的 `[未完成約定:xxx]`。刻意只加這一項(不含親密次數/交談輪數，那兩個較機械、對敘事文筆幫助有限)，先實測「AI能不能記得自己取的暱稱、有沒有更像人」，不好可隨時拔掉這幾行(改動集中在同一處、無連動)。未觸碰 `nsfwBaseRules` 或任何 schema。
- **🧪 `[達成]`的約定併入REL_MEM當記憶點(2026-07 玩家問「達成與否可以當記憶點嗎」授權「要！！！」)**：`MAJOR_EVENT`(重大事件/未完成約定)原本 AI 標記 `[達成]xxx` 後，代碼只把它從陣列**過濾刪除**(`Router_Narrative.gs` rel_changes 處理段)——兌現完就船過水無痕，跟專屬稱呼原本被浪費的問題同款。改成兌現當下順手把 `doneTask` 存進同一顆NPC列的 `REL_MEM` 新標籤 `[已兌現]`(陣列上限3，同 MAJOR_EVENT 的封頂邏輯)，並在共用的 `localSceneStr` 比照專屬稱呼補上顯示(`[一起做過:xxx]`)，solo/鑑賞都吃得到。**踩過一個潛在坑並修掉**：`REL_MEM` 另有一處在 `intimacy_feedback.npcs` 處理時會**整串重建**(`[專屬稱呼]... | [親密次數]...`)，若同一回合同時觸發 `[達成]` 又剛好這個NPC出現在 `intimacy_feedback.npcs`(常見)，這行重建會用新字串整個蓋掉剛寫的 `[已兌現]`——比照該處理段本來就有的「交談輪數 extract 舊值、reinject 回新字串」手法，讓已兌現的內容也在重建時一併帶過去，不會被蓋掉(已用 node 腳本模擬過封頂/重建/顯示解析三段行為，符合預期)。未觸碰 `nsfwBaseRules`、`specificRules` 或任何 schema，純資料管線補洞。
- **🔍 全庫盤查「身世(COL.PC.BACK)誰讀取」(2026-07 玩家問「身世誰會讀取」)**：查證結果——solo/鑑賞共用的 `localSceneStr`/`partyDetailsArr`/【玩家命格】(`Router_Narrative.gs`)、`enemyMasterCard_`(`Router_Persona.gs`)都會讀且真的餵給AI；`Router_Bond.gs` 的 `allianceWillingness_`(結盟意願)是唯一非AI、純機制的讀取點(身世文字跟性格/記憶拼一起做中文關鍵字regex算權重)。但揪出**兩個掛羊頭沒賣狗肉的空隙**：①`servantCard_`(戰鬥/羈絆/移動/召喚等最常用的從者演出依據卡)完全沒讀 BACK；②`masterCard_`(玩家御主自己的演出依據卡)指令文字寫著「依其性格/身世自然開口」，卻從沒把 `COL.PC.BACK` 塞進卡片——嘴上提了、資料沒真的餵進去(跟伊莉雅沉默案同款模式)。順帶查出**從者的種子本身沒有「身世」欄**：`SEED_SERVANTS` 的 persona 物件只有 firstP/look/words/toMaster/speech/moe/tic，沒有 back；召喚時 `svBack = persona.back ? ... : \`${cls}・${realName}\`` 因此永遠走 fallback(如「Saber・阿爾托莉雅·潘德拉貢」，純職階+真名零故事內容)；`heroToKanshouRow_`(鑑賞直接召喚)甚至完全沒設定這欄、是空字串。反而是 `SEED_MASTERS`(士郎/凜/慎二/切嗣/肯尼斯/韋伯等敵御主)每人都有精煉的真身世(如士郎「冬木大火倖存的孤兒、繼承切嗣的理想」)。
- **🧪 身世輕量對接(2026-07 玩家「身世先輕量對接吧！」，討論後定案「身世該輕量、經歷該累積」)**：討論釐清兩個概念別混——「身世」＝固定出身，不該釘死一句罐頭文字硬塞(尤其對 Saber/Gilgamesh 這種正典角色，一句話概括反而失真、也有被AI複述字面的風險，跟`1b.演出而非說明`衝突)；「經歷」＝這局裡真實發生過的事，該自然累積，這塊其實已經是上面 `[已兌現]`/`MAJOR_EVENT` 在做的事。這次只做輕量對接：`servantCard_`／`masterCard_` 補上讀取 BACK 並顯示「身世：xxx」，但**過濾掉資訊量為零的預設值**——`servantCard_` 濾掉召喚fallback `${cls}・${realName}`(跟卡頭〈${name}·${cls}〉逐字重複)；`masterCard_` 濾掉建角預設「來歷不明的魔術師」。並在 `servantCard_` 收尾指令補一句：「若認得此真名出自Fate正典，身世底蘊優先依你自己對該英靈的認識自然帶出，不受限於上方身世短句」——呼應既有 `3b.原作忠實度` 的哲學(信任模型自己的Fate知識，不硬寫罐頭設定)。**刻意不做**(留給未來)：讓 `servantCard_` 也讀 `[已兌現]`/`REL_MEM`(「經歷」那塊)——這次「先」只做身世本身的輕量對接，經歷的部分待下次再議。
- **🐛→✅ 補「經歷」記憶點漏了同行夥伴的坑(2026-07 玩家問「經歷兩邊都上？還是先上鑑賞？」發現的舊坑)**：查證後發現——先前「專屬稱呼」/「已兌現」兩個記憶點只加在 `localSceneStr`(同地路人清單)，但那份清單明確排除「同行隊伍成員」(`!partyMembers.includes(...)`)；鑑賞的同伴一律 `IS_PARTY="同行"`，只會出現在另一份 `partyDetailsArr`(同行夥伴清單)，等於鑑賞唯一真正常互動的對象反而吃不到這兩個標籤(solo的友善對話/切磋等免按鍵互動場合同樣受影響，只是 solo 另外還有 `servantCard_` 走戰鬥/羈絆路徑)。這不是新功能、是先前「兩軌都受惠」講好卻沒真的落地的地方。修法：把解析邏輯抽成共用函式 `relMemMemoryStr_(relMem)`(回傳 `[專屬稱呼:xxx][一起做過:xxx]` 組合字串)，`localSceneStr` 原本內聯的兩段解析改呼叫它，`partyDetailsArr`(solo/鑑賞共用同一段程式碼、只是欄位內容依模式分支)也一併補上呼叫，兩處不再各自維護一份regex。**範圍決定**：`servantCard_`(純 solo 戰鬥/羈絆場合)要不要另外也接「經歷」，留待之後單獨決定，這次只補「同行夥伴」這個兩軌都在用的漏洞。
- **🤖 新增從者時AI轉譯戰時外貌→都市日常，寫入鑑賞眾生(2026-07 玩家反映「為什麼還是直接照抄，沒有都市日常化」，討論後「新增從者時候讓AI讀種子後完美轉成都市日常再寫入鑑賞眾生」授權「可以」)**：根因是鑑賞完全不走 solo 的 `servantCard_`(那邊有明確的「【換裝】換衣不換人」指令)，鑑賞自己的 `actionPlay` 提示詞只是把「裝扮:日常便服」跟「特徵:[外貌]戰時攻防描述」平行列出，沒人講「裝扮優先於外貌裡的戰甲描述」，AI 自然挑更有畫面感的戰甲字面照抄。玩家否決了「加一句提示詞轉譯規則」的方向(那只是每回合治標)，改要求**寫入鑑賞眾生前就用AI把戰時外貌轉一次、把轉好的日常版本存下來**——鑑賞眾生從此就是都市日常資料，不必每回合再讓AI臨場轉譯。新增 `translateAppearanceToDaily_(name, cls, rawLook)`(`Gallery.gs`)：AI把「保留髮色/瞳色/五官/體態等本相不變、戰甲/武裝/戰鬥姿態等只適合戰場的元素換成貼合其性格與傳說核心的日常服裝」，且明確要求**只轉外貌與攻防裝束部分，舉止/自稱/私密一面等性格向短語原樣照抄**(不假設戰甲一定落在固定分段位置——玩家的實際案例就出現在第2段而非第1段)、失敗時原樣退回戰時描述(不擋建角流程)。接上兩個「新增從者」入口：①`heroToKanshouRow_`(直接召喚)——轉換 `persona.look` 後才進 `parseTraitsHelper`；②`buildGalleryForm_`(奪杯封存快照，`actionClaimGrail` 呼叫)——**在封存那一刻轉好存進快照**，之後每次「請走→再邀」解開快照都是直接讀已轉好的日常版，不必每次邀請重新呼叫AI(也順帶讓「同盟羈絆封存」的敵御主/敵從者盟友享有同一修正，因為兩處呼叫同一顆函式)。**範圍**：只轉外貌(TRAIT)，不動性格(PREF)——個性核心不該因場合而變。兩個入口都只是一次性動作(召喚/奪杯)，非每回合熱路徑，多一次AI呼叫可接受。
- **🤖 種子從者的[喜歡]/[討厭]幾乎恆為「無」，AI延伸補齊(2026-07 玩家問「確定會有喜好？討厭的？跟玩家的資料欄位對齊嗎」查證屬實授權「要！」)**：實測 `SEED_SERVANTS` 的 `persona.words`(性格來源)——20筆裡19筆只有2段、僅阿爾托莉雅3段、**沒有任何一筆到4段**；`parseTraitsHelper` 補滿4格的邏輯是「不夠就塞『無』」，等於每位召喚出來的從者「[喜歡]/[討厭]」實際上幾乎恆是空佔位。對照玩家自己建角(`Script_Onboarding.html`)是明確填「日常表象/真實內裡/喜歡/討厭」4個獨立欄位、扎實的4格——兩邊明顯不對齊，`慢熱與傾心`規則要AI「依個性/氣質真實反應」時，從者這邊可用信號比玩家薄弱很多。新增 `enrichPersonalityLikesDislikes_(name, cls, rawWords)`(`Core_Settings.gs`，緊鄰 `parseTraitsHelper`)：段數已達4才跳過(不多打API)；不足4時讓AI**依既有的表象/內裡短句延伸出貼合、合理的喜好/討厭**補滿，既有短句一字不改、只補缺的部分。接上 `Router_Creation.gs` 的 `actionSummonServant`(solo canon 從者召喚，維持戰時語境)——AI原創從者(`custDesc`/查無名冊分支)本就走AI生成4段完整性格，不受影響、也不會被重複轉換(段數檢查會直接跳過)。**⚠ 下一輪修正**：鑑賞的入口(`heroToKanshouRow_`)後來改用「都市日常版」的 `translatePersonalityToDaily_`，不再用這顆戰時版，見下一條。
- **🤖 鑑賞的性格延伸也要轉都市日常，不能沿用戰時版(2026-07 玩家追問「不重打？但是有符合都市日常嗎」點出漏洞，定調「種子就是去戰鬥的，可以少幾項沒問題；轉到鑑賞，AI必須依照種子進行補充和轉換原本資料變成都市日常」)**：上一條的 `enrichPersonalityLikesDislikes_` 兩個呼叫點(solo/鑑賞)用同一份沒分場合的提示詞，只講「延伸合理的喜歡/討厭」——對 solo(還在戰場)是對的，但鑑賞(已進入和平日常)用同一份會跟外貌轉譯的問題一樣：AI可能延伸出「討厭懦弱畏戰之人」這類戰場限定的討厭，塞進日常約會場景一樣突兀，只是不像戰甲那麼視覺化、比較不容易一眼發現。新增 `translatePersonalityToDaily_(name, cls, rawWords)`(`Core_Settings.gs`，緊鄰戰時版)：一次AI呼叫做兩件事——①段數不足4段就補滿(邏輯同戰時版)；②**不論段數夠不夠**，若既有短句偏戰場語境(戰意/殺意/勝負/殺戮等)一律轉譯成性格本質不變、但適合日常場景展現的等價說法(純屬個性核心、不涉戰場的短句原樣保留)。接上鑑賞**全部三個**會把 PREF 寫進鑑賞世界的地方：①`heroToKanshouRow_`(直接召喚，取代原本呼叫的戰時版)；②`actionClaimGrail` 封存主從者進「鑑賞」表時(原本直接把戰時 `pref` 寫進去，現在轉出 `dailyPref` 才寫；注意 memoir 生成那段的 `pref` 仍用原始戰時版，因為那是在描述戰時回憶，故意不轉)；③`actionClaimGrail`「同盟羈絆封存」的敵御主/敵從者盟友，同一原則。**刻意不做**：沒有把外貌轉譯(`translateAppearanceToDaily_`)跟這個性格轉譯合併成同一次AI呼叫——雖然能省一次API，但要合併需要重構 `buildGalleryForm_` 的快照schema(把PREF也塞進去)，牽動範圍變大，且兩個轉譯都只是低頻的一次性動作(召喚/奪杯)，分開打兩次API的成本可以接受，優先選風險較低的做法。
- **🐛→✅ 直接召喚鑑賞的「深化」機制誤把工房原創當正典角色(2026-07 玩家追問「工房英靈拉去鑑賞會照抄嗎」查出的既有舊坑，非本輪新增)**：查證發現直接召喚鑑賞(`actionKanshouSummonHero`)之後，前端 `kanshouSummonHero`(`Script_Kanshou.html`)**不分英靈來源、首次召喚一律**再呼叫一次早就存在的 `actionBackfillKanshouServantAi`(2026-07 較早定案「只在召喚當下用AI動態補一次」)，用AI把PREF/BACK整段重寫覆蓋掉 `heroToKanshouRow_` 剛寫的版本。這顆深化函式的系統提示詞**寫死假設「這是Fate原作已有設定的正典英靈」**(「依你對這位英靈原作的認知潤色補完」)——工房原創(`ai_gen`)角色根本沒有真實原作，AI被這樣要求只會亂猜、甚至編出不存在的「正典設定」蓋掉玩家自己在工房填寫的原創設計，等於間接繞過剛做好的都市日常轉換(那個轉換尊重原始資料，這個深化卻整段重寫)。**外貌相對安全**(`trait_addon` 只在外貌「太單薄」時才補充、不會整段覆蓋)，**性格/身世是真的整段覆蓋**，工房角色受害最大。修法：`actionBackfillKanshouServantAi` 開頭查 `hero[COL.HERO.SOURCE]`，`ai_gen` 直接回傳成功但不做任何覆寫(`skipped:true`)，讓 `heroToKanshouRow_` 的都市日常轉換版本留著不被蓋掉；只有真正的種子(`seed`)正典英靈才走這套「AI補原作知識深度」的深化。查證確認**只有直接召喚路徑會觸發**這個坑：奪杯封存後邀請(`actionKanshouAdd`)直接讀鑑賞表既有 `PREF`(已含這次做的都市日常轉換)，沒有另外呼叫任何深化步驟，不受影響。
- **🤖 都市日常轉換改懶惰快取(英靈殿懶惰快取)＋工房創角當下提前生成＋新增3位女性正典御主進鑑賞種子(2026-07 玩家「一次都做去鑑賞種子吧」授權「做吧！！！！」)**：延續上面幾條的「戰時→都市日常」轉換，這次做的是**架構層級的優化與擴充**，不是修bug：
  1. **懶惰快取，取代每次召喚都即時呼叫AI**：`COL.HERO` 尾端新增 `DAILY_LOOK`/`DAILY_WORDS` 兩欄(`Core_Settings.gs`)，`Setup_FateWorld.gs` 的 `FATE_SHEET_DEFS["英靈殿"]` 同步補表頭(靠 `ensureFateSheets_` 既有的「補尾端缺表頭」機制自動長出來，不需手動遷移)。新增 `getOrComputeDailyHeroFields_(heroRow, p)`(`Gallery.gs`)：英靈殿這兩欄若已有值直接讀、零AI呼叫；若還沒有(第一次被任何玩家召喚)才呼叫 `translateAppearanceToDaily_`/`translatePersonalityToDaily_` 轉換，並把結果回寫進英靈殿本體(找真實列索引 setValue＋清 `FATE_HERO_CODEX` 快取)，讓「之後任何玩家」召喚同一位英靈都吃到同一份已轉好的版本，不必人人各轉一次(也解決了「同一位英靈在不同玩家間日常樣貌不一致」的問題)。`heroToKanshouRow_` 改呼叫這顆，不再無條件轉換。
  2. **工房創角/改造當下就提前生成**：`recordOriginalHero_`(`Router_Creation.gs`，`actionSaveHero`製造模式與`actionSummonServant`AI即時生成從者共用寫入點)內部直接呼叫 `translateAppearanceToDaily_`/`translatePersonalityToDaily_`算好 `dailyLook`/`dailyWords` 一併寫入新增的兩欄，工房角色一鑄造出來就有日常版可用，不必等首次被召喚進鑑賞才轉。`actionSaveHero` 修改模式(`✏️`)也同步：外貌/性格若被玩家改動，連帶重新轉一次日常版，避免舊快取跟新設定對不上。
  3. **新增3位女性正典御主進英靈殿，供鑑賞直接召喚**：`SEED_SERVANTS`(`Seed_Codex.gs`)新增 `遠坂凜-Master`／`伊莉雅絲菲爾-Master`／`間桐櫻黑化-Master`，`cls:'御主'`(非七大從者職階)、`wars:['客串']`、六圍/技能/寶具留空(這幾位只在鑑賞演出，不涉戰鬥)、`persona` 從對應的 `SEED_MASTERS` 條目搬運外貌/性格/萌點/身世，`toMaster`/`speech`/`tic` 依角色個性新寫(SEED_MASTERS 沒有這幾個欄位)。`CODEX_PERSONA_VER` 升到 `v53`，觸發 `upgradeCodexPersonas_` 既有的「補入種子有、英靈殿還沒有的新英靈」邏輯自動長出這3筆，不需清表。這是「已砍除的奪杯封存＋鑑賞緣」的替代方案——原本要養好感90+才可能收錄的女性正典御主，現在直接鑑賞召喚就拿得到。
  4. **防呆：`cls:'御主'` 不能被 solo 誤召喚**：`actionSummonServant`(`Router_Creation.gs`) 的 `hrows` 來源在最源頭就濾掉 `CLS === "御主"`，一次擋住 heroId 指定／真名自由輸入／無職階隨機召喚 三條路徑——真名自由輸入尤其危險(自由文字比對、沒有職階限制，玩家打「遠坂凜」原本會被系統當成戰鬥從者召喚出來、產出零六圍的殘缺角色)。solo 前端的「依職階挑選」頁面本就用 `h.cls === selectedSummonClass` 過濾，這3位天然不會出現在那邊，不用額外改前端；鑑賞的 `Script_Kanshou.html` 用 `cls` 動態產生篩選標籤，這3位會自然多出一個「御主」篩選分類，同樣不用改前端。
  5. **順手補身世**：`heroToKanshouRow_` 原本完全沒設定 `BACK`(身世)——比照 solo 的 `svBack` fallback 邏輯(`persona.back` 有值就用、沒有則「職階・真名」)補上，這3位新角色特地寫的身世終於用得上；`servantCard_`(`Router_Persona.gs`)既有的 fallback 過濾邏輯(`if (back === \`${cls}・${name}\`) back = "";`)天然適用，無需另外處理。
  **未做**：批次腳本一次轉換既有~20位種子英靈——改採懶惰快取後不再需要，第一次被召喚時自然觸發，不用手動跑一次性遷移，也不佔額外執行時間風險(GAS 有執行時限，一次轉20位怕超時)。
  6. **🧹→✅ 同伴建立不再預填肉體狀態(2026-07 玩家問「當前狀態」預設是啥→發現御主自己是空的、同伴卻有預設→玩家反問「同伴也可以不先顯示嗎」)**：`heroToKanshouRow_` 原本在召喚當下就直接寫入 `sRow[COL.PC.PHYSICAL] = (sex==="男") ? {"肉棒":"如常"} : {"蜜穴":"未開"}`，但御主自己(`actionEnterKanshou`)從未做過同款初始化，導致「當前狀態」面板(`Index.html` `#ui-status`，讀 `buildPlayerStatusString` 的 `visibleStatusStr`)顯示不一致：御主自己剛建角是空的(顯示`--`)，同伴卻一召喚就有東西可看。玩家選擇的方向是「同伴也不要先顯示」而非「御主也預填」——已拿掉 `heroToKanshouRow_` 那行預填，兩者現在都是空的，要等真的發生過一次互動(AI 回傳 `intimacy_feedback` 被 merge 進 `PHYSICAL`)才會第一次出現內容。**安全性確認**：`Router_Narrative.gs` 的懶初始化(`Object.keys(pPhysicalObj).length === 0` 時依性別現算預設)在 prompt 組裝過程本就會補上臨時值，AI 不會拿到空物件；全專案讀 `COL.PC.PHYSICAL` 的地方(`Core_Settings.gs`/`Router_Action.gs`/`Router_Narrative.gs`)皆有 `|| "{}"` 防呆，留空不會造成 `JSON.parse` 出錯。
  7. **🐛→✅ 種子庫查核(2026-07 玩家「幫我檢查種子庫，有些人的日常相關資料明顯不對」→實機貼出間桐櫻範例)：「衣服寫到舉止了」根源修＋間桐櫻髮色/表情修正＋日常翻譯提示詞改善(v54)**：
     - **根因**：`persona.look` 的真實結構是「N段外貌細節(髮色/瞳色/體態/服裝，用「・」分隔)、最後一段整體氣質詞(用「、」分隔)」，如阿爾托莉雅 `'金髮碧眼・甲冑藍裙的嬌小騎士、王者威儀'`——外貌段落數量因人而異(2~4段不等)。但 `Gallery.gs`/`Router_Creation.gs`/`Seed_Rivals.gs` 三處呼叫端原本直接把這種字串餵給 `parseTraitsHelper`，該函式只會按「、」出現的位置盲目切成4格塞進[外貌]/[氣質舉止]/[台詞自稱]/[私密面]——外貌段落數量一多，服裝等外貌細節就會被錯位塞進[氣質舉止](玩家點名「衣服寫到舉止了」)，真正的氣質詞反而被推擠到[台詞自稱]甚至[私密面]，`persona.firstP`(真正的自稱)也從未被讀進來過。
     - **修法**：新增 `looksToTraitParts_(rawLook, firstP)`(`Core_Settings.gs`，緊鄰 `parseTraitsHelper`)——把最後一段正確認定為氣質、其餘全部合併回單一[外貌]格，[台詞自稱]改吃真正的 `persona.firstP`，回傳的字串再交給 `parseTraitsHelper` 補齊防呆與4格截斷。三個呼叫端(`Gallery.gs:heroToKanshouRow_`／`Router_Creation.gs:actionSummonServant`／`Seed_Rivals.gs`)同步改用。
     - **間桐櫻(黑化)資料修正**：玩家實機貼出的日常翻譯範例顯示「黑色長直髮」——查證官方設定她是**深紫色**長髮(黑化不變髮色)，`Seed_Codex.gs` 的 `間桐櫻黑化-Master`(SEED_SERVANTS)與 `間桐櫻(黑化)-5th`(SEED_MASTERS)兩處 `look`/`appearance` 的「黑長髮」都已修正為「深紫長髮」；末段氣質詞「妖異而空洞的笑」(玩家反映「套進日常場景很突兀」)改成較泛用的氣質描述「泛著陰冷寒意」——仍保留黑化角色的陰冷底色，但不再是只描述表情、且强度過於「戰場/反派」感的單一詞。
     - **`translateAppearanceToDaily_`(`Gallery.gs`)提示詞改善**：玩家反饋「衣服怪怪，盡量地保持原本但要日常點」——舊版只講「戰甲換成日常服裝」，沒要求保留原本配色/風格精神，AI 有時會整套換成風格迥異的新造型。已明確要求服裝翻譯保留原色系與風格精神(如黑紅配色/華麗/樸素/暴露等調性)、只做日常化改造；氣質段落也從「原樣照抄、一字不改」改成「依和平日常情境自然轉化」(戰場的殺氣/威壓/瘋狂可轉為日常裡一閃而過的銳利，不必是戰鬥狀態神情的直接複製，但仍鎖住角色性格底色)。
     - **快取失效**：`upgradeCodexPersonas_` 版本升級整列重寫時，`servantToHeroRow_` 只回傳前13欄(ID~SOURCE)，`DAILY_LOOK`/`DAILY_WORDS`(懶惰快取)兩欄原本完全不會被版本升級觸及——即使種子本體已修正，已召喚過的角色仍會沿用召喚當下快取的舊版翻譯，永遠讀不到修正。已在整列重寫後一併 `clearContent()` 這兩欄，逼下次召喚時用修正後的種子＋提示詞重新生成。`CODEX_PERSONA_VER` 升到 `v54` 觸發這次修正對既有試算表生效。
     - **廣泛複查**：依玩家「全部先檢查看看」的要求，逐一核對 SEED_SERVANTS 全 22 位角色的 `look` 欄與已知原作設定(髮色/瞳色/服裝/氣質)，除間桐櫻髮色外**未發現其餘明顯錯誤**——其餘角色的外觀描述皆與官方設定吻合(如阿爾托莉雅金髮碧眼、EMIYA褐膚白髮、遠坂凜黑髮雙馬尾等)。若要更嚴謹的逐條原文比對(尤其冷門细节)，可考慮之後另開一輪多代理研究查證。

### 9.1 🗑️ 整個砍除「奪杯封存」機制（2026-07 玩家定案）

玩家理由：角色資料寫入後基本不再變動，「維護兩份(封存快照＋鑑賞眾生列)」是白工；且上面 9.1(懶惰快取) 已經解決了「慾海同伴要靠 solo 打贏才能相見」的體驗問題(改成英靈殿直接召喚)，舊的封存/邀請系統整條路徑變成純技術債，一次砍掉。

- **`Gallery.gs` 刪除的函式**：`buildGalleryForm_`(封存外貌/肉體快照)、`applyGalleryForm_`(解快照寫回)、`actionClaimGrail`(奪杯→AI memoir→寫「鑑賞」表→同盟封存)、`kanshouServantRow_`(由「鑑賞」表紀錄組後日談列)、`actionKanshouAdd`(邀請封存從者)、`galleryRec_`(查「鑑賞」表紀錄)。
- **新增替代函式 `actionEndRun`**：奪杯/結束本局現在只做「找出玩家與其存活從者(供慶祝彈窗顯示名字)→`purgeGameData_` 清本局」，不再呼叫 AI 寫回憶、不再寫「鑑賞」表。
- **`Router_Action.gs`**：`claim_grail`→`actionClaimGrail` 換成 `end_run`→`actionEndRun`；移除 `kanshou_add`→`actionKanshouAdd`（慾海邀請只剩 `kanshou_summon_hero`→`actionKanshouSummonHero` 這一條路，直接從英靈殿召喚）。
- **`actionKanshouCompanions`**：不再讀「鑑賞」表湊 `available` 清單，恆回傳空陣列(欄位保留供前端相容)。
- **前端**：`Script.html` 的 `claimGrail()` 改打 `end_run`、拿掉 memoir 顯示與「封存」字樣按鈕文字(改「⚜️ 奪得聖杯」)；老虎道場祝賀文案與 `victory-overlay` 靜態文字(`Index.html`)拿掉「將被納入鑑賞名冊」的承諾，改成「可前往鑑賞、從英靈殿召喚同伴」；同盟卡片 UI(約 495-506 行)拿掉「羈絆90+奪杯後可收錄進鑑賞」的失效承諾，改成單純的「情誼已臻深處」慶祝文字。`Script_Kanshou.html` 的「邀請已封存同伴」清單區塊(`_kcAvail`/`kanshouAdd`)整段刪除，同伴面板只剩「在場同伴」＋「從英靈殿召喚」兩區。
- **刻意保留、沒有動的東西**：
  - `Router_Bond.gs` 的 `【鑑賞緣】` 標記機制(羈絆首度破90時標記+`unlocked`旗標)：這是「首次破90」的冪等追蹤兼敘事花絮觸發器(`unlocked` 也用於在該次共處的 AI 提示詞裡加一句「情誼首度臻至深處」的演出提示)，跟已刪除的鑑賞封存邏輯是兩件事、可以獨立存在——只拿掉了它原本兼職的「鑑賞收錄資格判定」用途(反正判定它的 `actionClaimGrail` 已不存在)，標記寫入本身無害地保留，未來若要重新設計类似機制還能沿用這個錨點。
  - `COL.GAL`(`Core_Settings.gs`)與 `FATE_SHEET_DEFS["鑑賞"]`(`Setup_FateWorld.gs`)：常數與工作表定義原樣不刪(死符號不刪，見專案紀律)，現行程式碼已完全不讀寫，舊試算表殘留的「鑑賞」表資料變成無害孤兒資料。
- **驗證**：`bash check.sh` 全過；`git diff -- gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(本次改動完全沒碰紅線①)。

### 9.2 🌹 工房新增「御主」職階（2026-07 玩家定案）——玩家自建鑑賞限定角色

玩家想法：3位canon女性御主(遠坂凜/伊莉雅絲菲爾/間桐櫻黑化，見 9.1)不打，只需要鑑賞用的演出資料；工房(自訂英靈)也該能捏這種「御主」角色，只填演出欄，六圍/技能/寶具全部不需要。

- **`parseForgeBuild_`(`Router_Creation.gs`)**：`build.cls === "御主"` 時獨立於 `VALID_CLS`(七大從者職階)判斷(`isMasterCls`)，計算完共用的演出欄(name/sex/fp/toM/speech/tic/moe/back/align/look/pref/desc)後【提前return】——六圍/技能/職階技能/寶具規模/寶具名/武裝全部強制留空(`six:{}`／`skills:[]`／`classSkills:[]`／`npScale:"對人"`／`npName/npR/npDesc/weapon:""`)，完全跳過六圍/技能/規模的驗證與計費邏輯(340預算/EX上限/三軌計價都不適用)。
- **`actionSaveHero`**：製造模式的 AI 補完提示詞在 `isMasterCls` 時跳過【技能】/【寶具】兩行、系統prompt也不要求補寶具英文名(npEn)；`np` 欄位(英靈殿 COL.HERO.NP)恆為空字串(製造/修改模式皆同)。演出欄(personality/look/background/npc_intent)仍照常AI補完，跟一般原創從者相同待遇。
- **前端 `Script_Onboarding.html`**：
  - `initForge_()` 的 `#cf-cls` 選單新增「御主」選項(七大職階之外)。
  - 新增 `applyForgeClsMode_()`：選了「御主」→隱藏「⚔️靈基」／「🌟寶具」兩個分頁按鈕(`cf-tab-2`/`cf-tab-3`)、強制切回「🎭演出」頁(唯一用得到的頁面)；換回戰鬥職階→兩頁復原。由 `refreshClsHint_()` 換職階時呼叫。
  - `refreshClsHint_()`：cls='御主' 時提示文字改「🌹 鑑賞限定職階：不參與戰鬥，六圍/技能/寶具皆不需要」，不顯示職階技能贈禮那套文字。
  - `forgeTab()`：存檔鈕原本只在「⚔️靈基」頁(tab2)顯示，御主職階沒有tab2可看——追加「御主職階時 tab1(演出頁)也顯示存檔鈕」的條件。
  - `forgeBudget_()`：cls='御主' 時直接回傳0、把預算列/預覽列改顯示「🌹 鑑賞限定職階：無需分配點數」，不跑六圍/技能點數加總。
  - `summonByForge()`：`isMaster` 分支跳過預算/EX數量檢查與六圍/技能欄位讀取，送出的 build 物件 npName/npScale/npDesc/weapon 也直接留空(後端會強制覆蓋，前端一併清爽處理)。
- **🐛→✅ 順手抓到一個既有 bug(3位canon御主上線時就已存在，這次一併修)**：solo 召喚頁「📜瀏覽全部英靈殿」(`__all__`)與「🌟玩家原創英靈」(`__custom__`)兩份清單原本只濾 `h.src`，沒濾 `h.cls`——`cls==='御主'` 的英靈(不論canon或玩家自建)會被列出來，點下去因為 `actionSummonServant` 的 `hrows` 早已把御主濾掉、`heroId` 查無對應，會誤入「名冊查無→AI隨機生成一位無關的Saber從者」的分支，而非給出清楚的錯誤訊息。已在 `renderHeroList()`(`Script_Onboarding.html`)兩個清單都加上 `h.cls !== '御主'` 過濾，從源頭不讓這類角色出現在 solo 召喚清單。
- **驗證**：`bash check.sh` 全過；紅線① 0 改動。

### 9.3 🧹 工房「🎭演出」頁精簡：外貌/個性拆4格→各一句＋演出細節收進進階區塊（2026-07 玩家「玩家從者工房我不想那麼細的呢？」）

玩家反饋工房捏角流程太瑣碎——「🎭演出」頁原本有外貌4小格＋個性4小格＋演出細節7小格(自稱/陣營/態度/萌點/口吻/小動作/身世)＋補充描述，共15個輸入框(9.2之前那輪「拆細」是回應「玩家不可能自己打頓號分隔」，但矯枉過正變成太多零碎欄位要填)。討論後定案：外貌/個性各留1個自由文字欄(不拆4格)；演出細節7格收進預設收合的「進階(選填)」區塊，想細調才展開。

- **`Index.html`**：`cf-look-1~4`／`cf-pref-1~4` 各4個小欄位合併回單一 `cf-look`／`cf-pref` 自由文字輸入框(40字)，placeholder 給範例(如「黑長直髮的冷豔劍士」)引導怎麼寫一句話而非要求頓號格式。原本常駐顯示的 `cf-drama`(自稱/陣營/態度/萌點/口吻/小動作/身世)包進 `display:none` 容器，前面加一顆「▸ 進階演出細節（選填）」收合鈕。
- **`Script_Onboarding.html`**：
  - 新增 `toggleForgeAdvanced()`：切換 `#cf-drama` 顯示/隱藏＋按鈕文字箭頭(▸/▾)。
  - `summonByForge()` 送出 build 物件：`_joinParts('cf-look')`(原本掃4個小欄位、非空才用頓號組回)整段移除，改直接 `_v('cf-look')`／`_v('cf-pref')` 讀單一欄位值——**零後端改動**：`parseForgeBuild_`(Router_Creation.gs)本就是靠「頓號/逗號分幾段(`_segs`)」判斷玩家填了幾成(`lookFull`/`prefFull`，>=3段才視為「玩家已定，AI不准改」)，單句自由描述天然只有1段，直接落在「核心設定，交給AI擴寫成四短句」這條既有路徑，格式與判斷邏輯完全不用改；玩家若真想精準控制細節，仍可以自己在這個欄位裡打頓號分段，效果不變。
  - `forgeEdit()`(修改既有作品預填表單)：原本的 `_lookParts`/`_prefParts` 拆4欄邏輯移除，改直接 `V('cf-look', d.look)`／`V('cf-pref', d.pref)` 整句塞回單一欄位。新增「進階區塊有既有資料就自動展開」判斷(`fp`/`toMaster`/`speech`/`tic`/`back`/非預設`align` 任一有值即展開)，避免玩家編輯舊角色時漏看已經填過的演出細節、以為被清空了。
  - `forgeReset_()` 的欄位清空清單同步從 `cf-look-1~4`/`cf-pref-1~4`(8個ID) 改成 `cf-look`/`cf-pref`(2個ID)。
- **驗證**：`bash check.sh` 全過；紅線① 0 改動；`grep -rn "cf-look-\|cf-pref-"` 全專案 0 殘留(確認沒有漏改的舊ID引用)。

---

## 10. servantCard_ / persona 注入（show-don't-tell 核心）

- `codexPersona_(name)`：從英靈殿 PERSONA 撈細緻人設(firstP/words/toMaster/speech/moe/tic)。
- `masterCard_(row)`：御主「演出依據」卡(名/性別/性格/特徵/願望/萌點)，讓 AI portray 御主。**🗣️ 御主有聲(2026-06)**：【可】依性格給御主台詞/反應(不再啞巴主角)，但【不替御主拍板戰略抉擇】(出戰/結盟/移動/補魔由玩家按鍵)、不逼問玩家、不快轉越過決策點；從者可開口問御主怎麼辦、御主也可自問，但停在問句/思索不可自演答案。互動場景(ally_bond/bond/mana/blood)＝`masterCard_ + servantCard_`；移動抵達 `actionMove` 也回傳 `masterCard` 前置 arrivePrompt。
  - **🐛→✅ 沒讀萌點(2026-07 修)**：`actionBackfillMasterAi`(Router_Creation.gs) 明明會請 AI 生成「結合此御主身分性格的獨特可愛反差萌」寫回 `COL.PC.INTENT`，`masterCard_` 卻從沒讀過——跟 `enemyMasterCard_` 修復前一樣的疏漏。已補回(且擋掉尚未 backfill 完成時的預留值「（待揭曉）」，避免把佔位字串當成真萌點餵給 AI)。
- **🎭 敵御主有聲(2026-07)**：`enemyMasterCard_(row)`——精簡演出卡(性格取前4項/特徵取前3項/萌點，不塞六圍/寶具)，NPC 不受「不可替玩家決定」限制、AI 可自行決定其言行反應。只在敵御主本人**同地在場**時注入，靠 `enemyMasterIdx_` 找連結御主＋加一道位置比對(硬連結≠必然在場，可能是遠端指揮)；`actionFateBattle` 兩個 aiPrompt 分支(defeat/正常)都在 `servantCard_(pcData[atkIdx])` 後接 `enemyMasterCardStr`。解決「打從者對方御主全程沉默」的問題，且非每戰必塞——不在場則空字串。
  - **🐛→✅ 沒讀萌點、性格漏第4項(2026-07 修)**：原本只塞 `性格`(slice 0,3，漏掉「厭惡」那格)＋`特徵`(當時跟性格逐字重複，見上)，完全沒讀 `COL.PC.INTENT`(萌點/反差)——伊莉雅這類「表象天真、內裡哀傷、強顏歡笑掩寂寞」的反差角色，AI 拿不到萌點錨點時就滑向類型套路(如「冷眼旁觀殺戮的無情幼女」)而非角色本來的反差設計。已補回萌點欄位＋收尾加 show-don't-tell 提醒(禁把萌點/性格詞當台詞)。
  - **🐛→✅ 盟友御主厚度不一致(2026-07 修)**：`Router_Bond.gs` 的 `actionAllyInteract` 過去對「盟友御主」是手刻一行陽春卡(只有性格、漏特徵/萌點)，同一角色在戰鬥交鋒(`Router_Battle.gs`)卻拿到完整的 `enemyMasterCard_`——結盟橋段反而比戰鬥時演得更扁平。已改直接呼叫 `enemyMasterCard_`，兩處厚度一致。
  - **🧹→✅ 砍除「同地路人」整套機制、改開放世界(2026-07 玩家定案「這是大世界，沒有結界了」)**：`actionPlay`(`Router_Narrative.gs`)原本會把「與玩家同地、非同行隊伍」的角色(`allLocals`/`displayPeople`)整批組成 `localSceneStr`——含好感階梯 `resistPrompt`、身分標籤、萌點——當成固定可指名互動的「同地路人」餵給 AI。玩家定案：鑑賞不該是私密結界、也不需要這種被追蹤好感的路人設定，改成純氛圍的**開放世界背景人煙**(新增常數 `backgroundCrowdStr`：路人可自由描寫增添生活感，但不具名、不可被指名互動、不追蹤好感/關係)。真正能被指名、有名有姓、好感會被記錄延續的對象，收斂為僅有**目前同行隊伍成員**(`partyRows`/`partyMembers`，取代舊 `allLocals`/`displayPeople`)。連帶修正：①萌點(`COL.PC.INTENT`)原本只寫在已刪除的 `localSceneStr`，鑑賞同伴(一律 `IS_PARTY==="同行"`、從不出現在那份清單)的萌點過去從未真正餵給 AI——已補進 `partyDetailsArr`(`pMoeStr`，兩軌共用)；②鑑賞「剛見面(剛從英靈殿召喚)vs 已相伴多時(奪杯後日常)」的框架判斷原本誤讀 `displayPeople`(恆為空，因排除隊伍成員)，導致永遠落入「已相伴」分支且姓名永遠印出佔位字「你的從者」而非真名——已改讀 `partyRows`/`partyMembers`，正確區分兩種框架且一律用真名。前端同步：`data.mentionedNames`(AI提及但不在場的角色)鑑賞不再標紫色特殊字——背景路人本就該融入敘事，標色反而暗示「這是可指名互動的固定NPC」，與新指令矛盾(solo 有陣營/追擊機制，維持標色不動)；`npc-card`(眾生列表)與 `openInteractMenu` 頂部橫幅的數字 `(好感：N)` 一併拿掉，只留 `relTag` 文字標籤(玩家定案「好感度不要顯示在敘述介面上」)。
  - **🧹→✅ 拿掉姓名的金色超連結＋整條「同地互動選單」死碼，solo 收斂為「專注廝殺＋自己的從者」(2026-07 玩家定案「都拿掉吧」)**：`Script.html` 統一連結引擎原本只有鑑賞退回純文字，solo 同地角色(`npc.isExact`)仍包成 `<span class="npc-link" data-interact="...">`(金色虛線底線，點擊開 `openInteractMenu` 同地互動選單)。查證後這顆連結對 solo 其實全是重複入口：選單裡的攻擊/寶具/令咒按鈕都呼叫 `servantStrike(...)`，跟常駐可見的 `renderWarActions`(⚔️ 戰爭行動列，敵蹤/盟友卡)完全同一組函式；非敵非盟的角色點開選單甚至是空的(solo 沒有 `交談`，只有 `full` 模式才有窺探命格)。玩家定案兩軌統一：同地角色一律純文字，不再有可點擊金色連結。確認唯二進入點(`.npc-link` 點擊、action-drawer 的 `'npc'` case)都已不存在後——`triggerDrawerAction('npc')` 查證從無任何 UI 元素呼叫，是更早的九州殘留死碼——整條「同地互動選單」呼叫鏈已**整本體刪除**：`openInteractMenu`／`closeInteractMenu`／`interactNpc`／`refreshAndOpenNpcList`／`renderNpcList`／`closeNpcList`／`handleRelTagClick`(羈絆稱呼編輯，唯一呼叫者是 `openInteractMenu` 選單裡的✏️鈕)六個函式、`npc-overlay`／`interact-modal` 兩個 modal(`Index.html`)、`.npc-link`／`.npc-card`／`.npc-actions` 三組死 CSS(`Style.html`)、`NPC_ACTIONS`(空物件，早已無實質內容)、`data-interact` 點擊委派監聽器全數移除。**遺留但刻意保留**：後端 `actionUpdateRelTag`(`Router_Action.gs`，action `update_rel_tag`)現在沒有任何前端呼叫者了(唯一呼叫者 `handleRelTagClick` 已刪)，但它同時被列在 `STATE_AFTER_ACTIONS`／`KANSHOU_BLOCKED_ACTIONS_`(dispatcher 設定表)裡有相依註解，範圍牽涉 dispatcher 設定、且移除它不影響任何使用者可見行為——這次沒有動，留給日後若要恢復「重新定義羈絆稱呼」UI 或做後端死碼查重時再一併處理。
- ⚠ **prompt 別再寫「嚴禁輸出 stat_changes/items_gained/money_transferred」**：solo 全走 `narrate_only`/`multi_attack_narrate`，後端只讀 `data.narration`、其餘欄位一律丟棄——禁令是多餘的、還把欄位名秀給 AI。已從 FATE solo prompt 全數移除(九州 actionPlay/item 路徑保留，那裡真的會吃 stat_changes)。
- `servantCard_` 含**狂化偵測**：persona.speech/firstP 含 狂化/無法言語/咆哮 → 加「禁說完整句、只咆哮」鐵律(赫拉克勒斯/蘭斯洛特命中；會說話的開膛手傑克不中)。
- `servantCard_(row)`：壓成「〈角色背景·僅供內化〉」段塞進 narration prompt。**鐵則一**=當背景揣摩；**鐵則二**=設定字眼禁直述/說嘴；**鐵則三**=依羈絆調親疏(低好感戒備→高羈絆親近，守住性格內核)。
  - **🐛→✅ 敘事視角混淆(2026-07 玩家鑑賞回報「AI有時候會把對面角色的『我』當成敘事視角」)**：`fp`(自稱/第一人稱)未特別設定時 fallback 就是「我」——大多數從者都沒特地設定，卡片原字面就是單純的「自稱「我」」，跟「敘事旁白＝玩家的『我』」完全同一個字，長提示詞跑到卡片這段時，flash-lite 小模型容易把兩者混成一個「我」，寫著寫著就把同伴的心境當成旁白第一人稱、玩家反而變成第三人稱被稱呼的對象。修法(只動非紅線檔案)：①`servantCard_`(`Router_Persona.gs`)標籤從「自稱「${fp}」」改成「此角色台詞內自稱「${fp}」(僅限她/他自己的引號台詞，敘事旁白的「我」永遠是玩家本人、與此無關)」，把限定範圍寫進標籤本身；②`Router_Narrative.gs` 的鑑賞(`isNsfwMode`)`PROMPT_REL` 在人物卡片緊接著補一句「★【視角鎖定】」重申通篇「我」只能是玩家，時機選在卡片剛讀完、下筆前最後提醒。**`Engine_Combat.gs` 的 `nsfwBaseRules` 一字未動**(`git diff -- gas/Engine_Combat.gs` 確認 0 改動)——這條紅線本就規定「只可改鄰近處、nsfwBaseRules 本體不可動」，本次修法完全繞開它，只在它讀到的「素材」(角色卡/PROMPT_REL)動手。
- `enemyAmbushOnServant_`：卸防(補魔/羈絆/共處/休息)時同地未結盟敵從者趁隙重擊。
- `raiseBond_`(升既有)／`bumpBond_`(無則建)／`getBond_`。`extractWish_`(取【願望】)、`buildDreamPrompt_`(敗北虛假之夢)、`buildVictoryDreamPrompt_`(2026-07 新增·勝利真夢，見下方「勝利收場對稱補完」條目)。
- **⏳ 14天時限(2026-06)**：聖杯戰爭上限第14日，`day>14` 未奪杯＝時限耗盡敗北。**中央攔截**：`handleGameAction`(dispatcher)在 handler 跑完後，對 PC_ solo 解析回應現成的 `clock` 字串(零額外時鐘讀)——`第N日` 的 N>14 且 success 且未 victory/defeat → 讀一次眾生取御主/從者名、補 `defeat:true+deadline:true+dreamPrompt+servantDream:""`。所有耗時動作(移動/戰鬥/補魔/偵查/休息…回應都帶 clock)統一覆蓋，不必各自判。夢用 `buildDreamPrompt_(name,wish,sv,cause)`：`cause==='timeout'`＝時限夢(破綻=時鐘停在第14日)、否則=戰鬥敗死夢(同一函數·勿再另開)。前端各動作 `data.defeat`→`handleDefeat`(travelTo 已補接·跨日略過抵達敘事直接收場)。

---

## 11. MEMORY 標記（御主/從者 記憶欄 COL.PC.MEMORY，｜分隔）

```
【願望】wish 【令咒】N 【迴路】N(預設30) 【魔術】 【出身】 【體術】
【模式】canon/chaos 【戰爭】4th/5th/fake 【扮演】正典御主id
【試煉】N(god_hand命數) 【寶具選】N(多寶具英靈解放哪個·set_np_choice) 【寶具預告】1(敵蓄勢·getNpTelegraph_) 【過充】N(補魔存的無償超載額度·一次性·getOvercharge_/set/clear) 【換裝】文字(玩家自訂從者服裝·換衣不換人·getOutfit_/set/clear) 【武裝】文字(玩家自定武器/戰鬥方式·敘述強制以此為準·getWeapon_/set/clear)　※【路線】route／【史】firedPins 已隨正典插針退役·無用遺留
【羈絆日】D:type1,type2(跨日重置) 【強撐】D(second_wind 舊日限·已棄用·helper 留著無害)
【陣地】loc(setWorkshop 寫·駐留該地供魔工房+8·getWorkshop_/setWorkshopMemory_) 【搜刮】loc(scavenge 寫·該地散逸魔力枯竭標記·getScavengedLoc_/setScavengedLoc_) 【禮裝】id 【禮充】n 【盟約至】day 【鑑賞緣】 【破戒奪取】 【黑化Alter】
【魔境】fx(斯卡哈玩家選的通用A階被動，set_mage_realm 寫，rowToCombatant_ 注入) 【符文】def/dmg/regen(原初符文運用，set_rune_mode 寫)
⚠ 可選能力標籤(魔境的智慧/原初符文)UI＝**小膠囊·發亮，點開在說明 popup 內挑選**(前端 openMageRealmPicker/openRunePicker→pickSelectable)，選定後標籤顯示所選(如 魔境的智慧（千里眼A）/原初符文（增傷）)。已棄大選盤面板。
```

---

## 12. 前端 Script.html（solo UI）

- `applyModeUI()`：模式總開關(§1)。
- **狀態面板**：`refreshFateTags`(御主/雙從者卡、補魔/羈絆/令咒/休息/禮裝)、`setActiveServant`、`bondWord`。
- **戰爭行動列**：`renderWarActions`(**手風琴**：每目標一張可點開卡，`toggleWarTarget`/`warExpanded`，單目標自動展開；底部固定偵查/休息/移動)、`attackStyle_`(近戰/魔砲/狙擊樣式)、`localFoeServantName`。
- **行動 handler**：`servantStrike`(出戰/寶具/令咒/刺殺御主四參數)、`manaSupply`、`bond`/`openBondMenu`/`submitBond`、`rest`/`openRestMenu`/`restAndHeal`、`scout`、`mysticStrike`、`ruleBreakSteal`、`secondWind`、`setWorkshop`/`scavenge`、`proposeAlliance`/`breakAlliance`/`allyBond`。
- **戰報**：`renderFateBattleReport`(斬首多骰/strikes/雙從者血條)、`renderCombatReport`、`renderMysticReport`、`narrate`/`narrateCombatResult`、`handleDefeat`(敗北→虛假之夢→老虎道場)、`handleVictory`(勝利→**願望終於實現的真實夢**→奪杯畫面，2026-07 新增，見下)。
- **🐯 老虎道場 AI 講評(2026-06)**：敗北「⏭直視結局」按鈕→`runTigerDojo_(servantName,causeCtx)`：`buildTigerDojoPrompt_` 餵藤村大河＋伊莉雅依**實際敗因**(夢覆寫前擷取的 `lastAiContext`)吐槽＋給一條對症戰術建議，走 `narrate_only` 一次呼叫(只在 game-over 收場·不影響遊戲中速度)填入 `#dojo-ai-body`，失敗退回 `dojoFallbackHtml_()` 罐頭文案。
- **🎉 勝利收場對稱補完(2026-07 新增)**：玩家發現勝利流程缺了敗北那套「夢→道場」的儀式感(只有一個空泛的獎杯畫面直接跳去封存)，要求做「死亡那套的小改版」。
  - **願望真夢**：新增 `buildVictoryDreamPrompt_(pcName,wish,servantName)`(Router_Narrative.gs)，與 `buildDreamPrompt_` 同結構但**不露破綻**(這次是真的)。所有會觸發 `victory:true` 的路徑都同步補上：`fateStrike_` 主擊殺敵/對轟回震/背擊/盟友協同/深淵海怪(Router_Battle.gs 共6處)、斬首戰術(`asnVictory`)、`worldTick_` 令咒透支延遲結算(Time_World.gs，額外查 `findGameMasterIdx_`+己方從者)。`actionMove`/`actionRest`(Router_Movement.gs)把 `tick.dreamPrompt` 一併穿進回應(`actionRest` 與夜襲致敗的 dreamPrompt 互斥，defeat 優先)。前端 `handleVictory(res)` 先 `narrate(res.dreamPrompt)` 才開金色奪杯畫面，跟 `handleDefeat` 同一節奏。
  - **老虎道場祝賀版**：`tiger-dojo-overlay` 改成**共用殼**(標題/表情/副標三個 id 化：`dojo-emoji`/`dojo-title`/`dojo-subtitle`)，`openTigerDojo(mode)`/`runTigerDojo_(servantName,causeCtx,mode)` 依 `mode==='victory'` 切換文案與收尾按鈕行為(勝利收尾走既有 `dojoBackToMenu()`、不強制 reload)。新增 `buildTigerDojoVictoryPrompt_`(同兩人，這次真心祝賀+吐槽最精彩瞬間)。`claimGrail()` 封存成功後，「返回選單」鈕改標「🎉 慶祝一下」並動態接上 `runTigerDojo_(res.servantName,'','victory')`，看完祝賀才回選單——原本的 AI 回憶(memoir)顯示不變，祝賀道場接在其後多一拍。
- **召喚/創角**（2026-07 整段搬到 `Script_Onboarding.html`，天然時間邊界：只在開局跑一次）：`accountLogin`/`chooseWarMode`/`chooseWar`/`chooseRole`/`loadCanonMasters`/`pickCanonMaster`、`rollFate`/`selectFateRoll`/`renderFateRolls`(魔術天賦測定)、`checkName`/`createPC`/`backfillMasterAi`、`doSummon`/`summonByHero`/`selectSummonClass`、`startGame`。與 Script.html 共享同一頁面全域作用域。
- **地圖**：`renderMapPane`(陣地/搜索物資/盟友通報橫幅)、`buildMapSvg_`、`scout`。**地圖 20 正典地點**(衛宮宅/愛因茲貝倫城/冬木森林/冬木·碼頭/深山町遠坂宅/新都穗群原…)：種子在 `Setup_FateWorld.gs` `FATE_MAP_SEED`，`reseedIfEmpty_` 為 **upsert**(按名更新 TYPE/COORD/DESC/WAR＋補缺列)；前端位置是 `buildMapSvg_` 內 **hardcoded `LAYOUT`**(short-name→[x,y]，新都西/深山町東)＋`CONN`，**非試算表座標**(座標只備查)。改地圖要同步改種子(名字)＋LAYOUT(位置)。
  - **🆕 戰爭分流(2026-07)**：`COL.MAP.WAR` 第7欄——原本地圖全局共用同一份地點，但御主庫深度校對補上肯尼斯/韋伯/雨生龍之介的實際居所後，發現這幾處(海特飯店/麥肯基宅/碼頭倉庫)是**第四次聖杯戰爭限定**，若在第五次局也顯示是設定錯誤(那幾位御主根本不在該場戰爭)。空字串＝通用地點(任何戰爭/鑑賞皆顯示，既有17個地點全是這類)；`'4th'`＝僅第四次戰爭局顯示。`buildMapNodesPayload_`(Router_Movement.gs) 用 `findGameMasterIdx_`+`getWarName_`(讀玩家 MEMORY 的【戰爭】標記)查本局戰爭，過濾掉不符者。**御主 home 欄同步修正**：肯尼斯/韋伯/雨生龍之介的 `home` 改成直接對應這三個新地圖節點的名稱(此前 `home` 欄從未被任何程式碼讀取，是純未使用的死資料——現在跟地圖真正掛勾)。
  - **🐛→✅ `FATE_4TH_ROSTER` 的 `loc` 沒同步(2026-07 修)**：上面那句「home 欄跟地圖掛勾」講的是 `SEED_MASTERS.home`(裝飾/查證用)，但**實際決定敵御主/敵從者出生點的是 `Seed_Rivals.gs` `FATE_4TH_ROSTER` 陣列自己的 `loc` 欄**(`masterToNpcRow_`/`heroToNpcRow_` 用這個，不讀 `COL.MASTER.HOME`——全代碼庫零讀取)。當初只改了 `home`，`FATE_4TH_ROSTER` 的 `loc` 仍是舊據點(肯尼斯留在冬木·新都/韋伯留在冬木·商店街/雨生留在未遠川河畔)——**地圖上新節點看得到、篩選也對，但玩 4th 局時敵御主永遠不會真的生成在那三個新節點**，等於地圖蓋好沒人住。已同步改 `loc` 為 `海特飯店`/`麥肯基宅`/`碼頭倉庫`，跟地圖節點名稱一致。
  - **混亂模式／偽聖杯(fake) 不需要新地圖**：`seedRivalsForGame_` 混亂模式的 `locPool`(8 個既有通用據點) ＋ `FATE_FAKE_ROSTER` 的 `loc`，用的全是 `WAR` 欄空字串的**通用地點**，沒有任何一組指向這三個 4th 限定新節點，所以兩軌天然不會用到、也不需要額外配置——`buildMapNodesPayload_` 的戰爭過濾對它們是無感的(它們的戰爭字串是 `'chaos'`/`'fake'`，本來就會把 `'4th'` 限定節點濾掉，行為正確)。
- **移動敘事**：`actionMove`(Router 2121)回傳 `servantCard`(玩家從者卡)，前端 `travelTo` 抵達提示前置該卡＋「從者必在場、依性格至少一句台詞」指令——修掉移動後變御主獨白、從者像不存在。前端 `foes.length` 時再加「遭遇·敵在眼前」指令(敵方開口挑釁/試探，但勝負留待御主下令)。
  - **🐛→✅ 無人也硬掰角色(2026-07 修)**：`foes.length===0`(此地 `getLocalPeopleList` 查無任何已登記角色·isExact)時，arrivePrompt 原本只給「寫巡查/警戒/喘息氛圍」的正面指令，沒明講「不准生角色」——AI 仍會自行加戲生出路人/熟人偶遇。已補上 `foes.length?'':...` 分支的明確負面約束：無人在場時互動對象僅限御主與隨行從者，環境氛圍照寫，但禁止無中生出可對話的具名角色。
- **🎭 敵人人設餵入(2026-06)**：`actionMove` 另回傳 `foeCards`＝target 在場【敵從者】的 `servantCard_`(低羈絆→戒備敵意正確)，前端拼進 arrivePrompt → 敵人依性格/口吻反應(慎二色厲內荏、c媽試探)，不再 AI 即興通用反派(平淡根因)。
  - **🐛→✅ 我方/敵方從者卡無陣營標籤(2026-07 修)**：`servantCard_` 模板本身只有「〈名字·職階·演出依據〉」，不含任何我方/敵方字樣(同一函式同時拿去組己方卡與敵方卡，兩者長相完全相同)。`Script.html` 的 `arrivePrompt` 把 `data.servantCard`(我方)＋`data.foeCards`(敵方)兩段原封不動接在一起，AI 全靠後面才出現的「敵情：XXX（敵從者）」一行語意推論才分得出誰是敵人——多個敵從者同場時更只能靠 L714「勿張冠李戴」配對表勉強兜住。已在拼接處各自補上明確前綴：`'【我方從者】'+servantCard`／`'【敵方從者·非我方】'+foeCards`，讓兩張卡片本身即自帶陣營標籤，不再需要靠後續文字推論。（其餘 servantCard_ 呼叫點皆只單獨塞一張卡、無此類雙卡並列的陣營混淆風險，故只在此處修，未動 `servantCard_` 本體——盟友互動場景走的是 `allyCard`/`enemyMasterCard_`，FACTION 仍是「敵從者/敵御主」但語境是結盟而非敵對，若把陣營標籤寫死進 `servantCard_` 本體反而會誤標盟友為敵方，故刻意只在確定是敵對語境的呼叫處加標籤。）
- **💨 撤離追擊(2026-06·一點點·可生還·雙向)**：`actionMove` 用移動【前】初始資料判定——離開「有活敵從者」的格子時，最快敵從者(敏≥我從者敏才追得上)依機率咬一記離別追擊。**選兵閘**：`isAllied_`(盟約/休兵中)、好感(COL.PC.BOND，2026-07 已併入眾生列)≥50(交情夠) 的敵從者**不追**(複用提前讀的整表資料，零淨增讀取)。機率 `pProb=base30%·帶傷+20%·騎乘-15%`，再吃**接敵姿態**(隱蔽-10%/光明+10%)、夾 `[0,0.55]` 上限。命中則 `resolveFateBattle_(追兵,我從者)` **真·交手雙向判定**(非單方挨打)：`hitWho:'us'`(我輸·挨追擊)或 `'foe'`(我贏·回身逼退追兵)，雙方扣血**保 1 不致死**。回傳 `pursuit:{enemyName,chaserId,dmg,hitWho}`，前端依 hitWho 顯示橘/綠💨提示＋arrivePrompt 加追擊餘悸/反咬斷後 cue。
- **🎭 接敵姿態(2026-06·純敘述 flavor·零機制重疊)**：地圖面板頂端常駐三段藥丸 `🥷隱蔽潛行/🚶泰然如常/🔥正大光明`(`STANCES`/`getStance`/`setStance`/`stancePillHtml_`/`paintStancePill_`，Script.html)。**存 localStorage `fate_stance`·免 round-trip**(非 MEMORY)，搭 `travelTo` 的 move 便車送 `userData.stance` → 後端**僅** `actionMove` pProb 輕觸(隱蔽-/光明+，見上)。敘事面：**無敵蹤**→`stanceLine_()` 加一句獨行姿態定調(正常=不加)；**有敵蹤**→`stanceNotice_(isSeek)` 折進偶遇/找上門框架定調「誰先發現誰」(隱蔽=玩家先機窺探/光明=對方老遠戒備拉滿)，免姿態被講兩遍。戰爭軌限定(kanshou 無戰鬥不顯示)。
- **移動順序＝世界先動玩家後到**：`actionMove` 先跑 `worldTick_`(敵 tick 換位，移動只換位不死人)→**重讀眾生**→才把玩家落到 target→讀同地人物給 AI。避免「追到敵人所在地、敵人卻在你踏入同一刻被傳走」(撞在一起卻沒對話)。**務必重讀 allPcData 再寫回**，否則整片 setValues 會用舊位置覆蓋掉剛 tick 的敵方移動。
- **追得到人**：`worldTick_`(Time_World 234)用 `freezeLoc = playerLoc`，**玩家所在/將抵達格上的敵人禁止移動**(`oldLoc === freezeLoc` 直接 continue)，否則玩家永遠撲空。兩個呼叫點都傳玩家格(move 傳 target、rest 傳 pcLoc)。
- **遭遇態度分流**：`actionMove` 在世界 tick 前算 `preFoesAtTarget`(target 此刻已有的敵名)，回傳 `preFoes`。前端 `travelTo`：現存 foe 有人在 preFoes→「找上門」(對方據守、戒備)；否則→「偶遇」(恰巧撞上)。語氣只給「依個性與立場開口」，不寫死。
- **🧹 九州系統大清理（已移除 35 個 action ＋ 1817 行）**：修煉/突破(cultivate/breakthrough)、任務(quests/claim_quest_reward/abandon_quest)、門派(get_faction_info/get_ranking/promote_rank/create_faction)、據點收成(estate_get/estate_harvest_all)、倉庫(warehouse_*)、物品/裝備(inventory/discard_item/sell_item/craft_item/consume_item/use_item_self/use_item_on_npc/gift_item/get_available_gear/equip_gear)、給銀兩(give_money)、九州打鬥(attack_npc/multi_attack)、偷竊/情報(steal_npc_item/buy_intel)、組隊(join_party/dismiss_party)、索要(request_item_from_npc/request_discard_npc_item)、強化(empower_npc)、處決(execute_npc)——皆 0 內部呼叫、solo 隱藏、慾海不碰。**保留**：actionPlay(慾海自由聊天引擎)、narrate_only(solo)、gallery、帳號、solo 全部戰爭 action、據點 home_*(模糊未動)、inspect_npc。(spare_npc 已於 2026-06 連同打掃戰場一併刪除，見 §3 末；`get_epic_history` 已於 2026-07 隨「史紀」表整套刪除，見 §3 頂)COL 欄位**全保留**(死欄不刪，唯 2026-06/07 兩波確實刪除的欄位是真移除、非死欄，見 §2 COL schema 註記)。前端九州 UI 按鈕仍在但 mode 隱藏＋未知 action 優雅回錯誤(`handleGameAction` else 支)，無害；前端清理待後續批次。孤兒 helper(transferMoney 等)留著無害。
- **令咒透支倒數（單獨行動例外）**：敵從者燃**最後一道令咒**緊急脫離(`fateStrike_` seal-escape, Router ~3914)時，若其 TAGS 無 `fx:'solo'`(單獨行動)→ `stampDoom_` 在 MEMORY 寫 `【靈基透支】{死線絕對時數}`(現在 day*24+hour ＋ `SEAL_DOOM_HOURS`=3)。`worldTick_`(Time_World 末段)每次移動/休息推進時間後掃描，`getDoom_` 到期 → 該敵從者 `DEAD_`＋風聞消滅。若這收掉最後一名敵從者(`aliveEnemyServants_<=0`)→ `worldTick_` 回傳 `victory:true`，`actionMove`/`actionRest` 帶 `victory` 給前端，`travelTo`/`rest` 呼 `handleVictory` 出奪杯。弓兵(單獨行動)＝免倒數、可續存(原作 Independent Action)。helper：`rowHasSolo_/stampDoom_/getDoom_/SEAL_DOOM_HOURS`(Router ~4326)。
- **御主戰死→從者透支倒數（與令咒燒盡同一套下場，2026-07）**：`fateStrike_` 一般陣亡路徑(非斬首·護衛在場即死那支，那支已當場一併打殘護衛)擊殺 `敵御主` 時，順帶掃一輪同 game_id 的在世 `敵從者`：`enemyMasterIdx_` 查回 -1(確實因這位御主死而失聯，非連結別的在世御主)且無 `fx:'solo'` 且尚未有倒數(`getDoom_`)→同樣 `stampDoom_` 蓋 `SEAL_DOOM_HOURS` 死線(靈基潰蝕)。單獨行動者不設倒數，改靠上方 `INDEPENDENT_ACTION_RESERVE` 的魔力自限苟活——呼應原作「Independent Action 讓從者能撐一段時間，但終究不是無限供魔」。**斬首·護衛在場**那支仍是即死(戲劇性一擊定生死，不查 solo)，此為刻意的敘事分流、非疏漏。
- **「養不起爆炸」機制已移除(2026-07)**：`worldTick_` 原本的「供魔不繼爆炸」(休息時，靠敵從者六圍/後改真查電池比例判定)，實測發現**不管怎麼調門檻，全種子庫真能撞進危險區的組合幾乎只有士郎(迴路30)配阿爾托莉雅(六圍285)**——其餘配對(伊莉雅迴路80/凜迴路45等)池子夠用、根本進不了候選。結果是「隨機世界事件」實際上總是同一個目標，跟隨機的初衷矛盾，玩家體感是「Saber每次都爆炸」。**已整段移除，不留殘骸**；masterless 有 `SEAL_DOOM_HOURS` 透支倒數、一般戰損有 `fateStrike_`，死法夠多不缺這個。同段落的「暗處廝殺」保留但2026-07改聰明：**只在休息(allowAttrition)、第 `ATTRITION_START_DAY`(=3) 日起、遠處(非玩家格)敵從者、且存活>`WORLD_FLOOR_`(=4)** 才可能發生(7%/tick)；受害者不再純隨機，改**挑「戰力(六圍階總和)最低」者先死**(同分隨機)——貼「弱者先在混戰中出局」。前 2 日世界不減員(喘息)。
- **🗑️ 📜 戰記（里程碑回顧＋歷史戰役）已於 2026-07 整套刪除**：獨立「戰記」表(`[game_id, 帳號, 日, 時, 內容]`)、`logWarEvent_`、`actionWarChronicle`(`war_chronicle`)、`actionWarHistoryList`(`war_history_list`) 及 Router_Battle/Router_Bond/Router_Creation/Time_World 內全部呼叫點一併移除。前端抽屜「📜 本場戰記」/主選單「📜 戰役回顧」按鈕隨之拔除。2026-07 玩家定案：單人專注，不留跨局回顧資料。
- **🗑️ 「因果」(事件log) 機制已於 2026-07 整套刪除**：`readRecentLogRows`/`pickRelevantLogs`/`formatCausalityEntry`/`pickNsfwCausalityEvent`/`trimLogRowsByOwner`/`IMPORTANT_LOG_TAGS`(History_Sync.gs) 全數移除，`actionPlay`(Router_Narrative.gs) 提示詞不再組「前塵因果」段。**與此機制無關、仍保留**：「歷史暫存」(逐句對話，`saveGameHistoryBatch`/`getGameHistoryBatchRaw`/`getGameHistory`)，仍是聊天記錄/敘事連續性的資料來源，未受影響。
- **敵御主↔敵從者硬連結（誰是誰）**：`reseedRivals_`(Seed_Rivals 末段)種子時，rows 嚴格交替(master,servant…)，互寫 `【從者】名`(御主列)／`【御主】名`(從者列)於 MEMORY。`getServantMaster_`/`getMasterServant_`(Router)讀回。`markMasterLostServant_` 配對改**硬連結優先**(按名找御主，不怕多組同地)、無連結退回同落點。`getLocalPeopleList` 對 `敵從者` 帶 `master`、`敵御主` 帶 `servant`。前端 `travelTo` 在場敵對>1 組時加「在場敵對歸屬·勿張冠李戴」配對清單，AI 才不會把 3 組同場的主從搞混。**舊局無連結→退回同落點(相容)**。
- **喪失從者的敵御主（選 A：不移除，只標記＋演出）**：敵從者任一路徑死亡時，`markMasterLostServant_`(Router ~4340)在「同地同 game_id 的敵御主」MEMORY 寫 `【喪失從者】從者名·死因`(只記第一次)。三處死亡都接：戰鬥擊破(`fateStrike_` else 支)、令咒透支倒數＋暗處廝殺(`worldTick_`)。`getLostServant_` 讀回；`getLocalPeopleList` 對 `敵御主` 帶出 `lostServant`。前端 `travelTo` 對在場的喪失從者御主加指令：演出形單影隻、無牙棋手、依個性流露失恃(孤注/惶然/不甘)，別當仍有從者隨侍。配對採同落點(一master一servant結伴移動，無顯式 FK)。helper：`stampLostServant_/getLostServant_/markMasterLostServant_`。
- **敘事連續記憶**：`lastAiContext`(模組級，最近一段 AI 文 ≤300字)。`narrate()`/`narrateCombatResult`/play 都會更新它。`travelTo` 在 `foes.length` 時把 `lastAiContext.slice(0,280)` 當「前情」塞進抵達提示，讓 AI 知道「方才發生什麼」——逃跑後敵人追上/再遇時承接劇情、不當初次見面。`narrate_only` 後端只吃 promptText，所以前情是在前端拼進去的(零後端改動)。
- **鑑賞**：`claimGrail`/`renderHeroList` 仍在 Script.html；**鑑賞(慾海)前端主體已搬到 `Script_Kanshou.html`(2026-07)**——`enterKanshou`(主入口)、👥同伴面板 `openCompanions/kanshouAdd/kanshouRemove/changeKanshouName/changeKanshouSex/askKanshouSex/askKanshouSetup`。兩檔共用同一頁面全域作用域(Index.html 依序 include)，互叫無礙；新增鑑賞前端功能請往 `Script_Kanshou.html` 加，見 `HANDBOOK.md` §4.1 拆分慣例。(舊 `openGallery/enterGallery` 已退役)
- **逆天改命**（玩家改自己御主資料）：`openFateEdit`/`saveFate`→`actionUpdateFate`。**只准改 4 種敘事欄、數值與寶具一律鎖死**(GAS掌數值)：`back`身世(限30)/`intent`萌點(限30)/`trait`特徵(4格×20)/`pref`個性(4格×20)。特徵4格=外貌/氣質舉止/自稱與口氣/卸下心防的私密一面(末格＝鑑賞慾海的親密種子，NSFW 消費在 Router 2406 `[床笫之間的反應]`)；個性4格=日常表象/真實內裡/喜歡/討厭。改別人(NPC)需好感100+已傾心，改自己免條件(solo 只碰自己)。數值編輯是九州 full 的 breakthrough/cultivate，solo 不露出。

---

## 13. 已完成的四大區塊（本專案進度）

①戰鬥職階相剋＋寶具專屬(Engine_Fate) ②~~正典劇情橋段(Seed_Canon)~~已退役 ③戰爭規則含結盟(同盟系統) ④日常與羈絆(bond/補魔/夢境/禮裝/雙從者/破戒奪僕/同盟生命週期→鑑賞)。
種子庫 36 從者＋13 御主 persona 全補完(v3)。

---

*最後更新(2026-06)：戰鬥大改(概念優先權/D&D骰/寶具規模矩陣/御主電池/寶具對轟/從者主動技/敵寶具吃魔力/十二試煉燒命/A++≠EX修正)＋solo 好感招募地圖收歸 GAS＋刪 spare_npc，並全文對照現碼校正(gallery 改 enter_kanshou、full 停用、經濟全砍)。改動前先 grep 對照，改完 node --check，慾海邊界 git diff 驗證 0 改動。*

---

## solo/鑑賞完全拆分稽核(2026-07·玩家「確認全部函數作用，完全拆分solo與鑑賞」)

玩家在修完鑑賞召喚速度(移除多餘AI深化round-trip)後，要求對全代碼庫做一次徹底稽核：確認每個函式的作用與track歸屬、確保solo與鑑賞完全資料分離。派出6組平行Explore agent逐檔審查所有`.gs`檔案(Core_Settings+Router_Action／Gallery／Router_Creation+Router_Persona／Router_Battle+Engine_Fate+Engine_Combat／Router_Bond+Router_Movement+Router_Economy+Router_Narrative／Seed_Codex+Seed_Rivals+Setup_FateWorld+Time_World+Account+History_Sync+Mystic_Code)，逐函式標註solo-only/kanshou-only/shared並找洩漏訊號。完整的逐檔逐函式track矩陣已整理進 `HANDBOOK.md` §12(供之後查閱，這裡只記錄抓到並修正的問題)。

**總體結論**：三層分離機制(物理分表「眾生」vs「鑑賞眾生」／dispatcher黑名單`KANSHOU_BLOCKED_ACTIONS_`／`game_id`前綴guard`g_`vs`k_`)整體設計健全，六組審查合計只抓到5個真實或潛在問題，且其中4個是「資料形狀恰好無害」的脆弱設計而非已發生的洩漏。逐一修正如下：

**1. `persona.back`(身世)戰時悲劇直接照搬進鑑賞**：3位女性正典御主(遠坂凜/伊莉雅絲菲爾/間桐櫻黑化)的`persona.back`是「父親死於聖杯戰爭」「人造人被當工具養大」「蟲蝕十一年後黑化」等戰時悲劇成因，`heroToKanshouRow_`(Gallery.gs)原樣寫進鑑賞`COL.PC.BACK`、每回合經`partyDetailsArr`(`身世:${...}`)餵給AI——跟`dailyMoe`/`dailyLook`/`dailyWords`已經確立的「餐桌是平行世界、很多悲劇沒有發生」原則矛盾，是漏做daily轉換的同一類根因(這3位是2026-06才新增進英靈殿供鑑賞召喚用，back欄卻沿用了solo戰時的寫法)。**修法**：`Seed_Codex.gs`比照`dailyMoe`新增`persona.dailyBack`，只給這3位手寫溫馨改寫版(拿掉戰爭/虐待成因，保留家人關係等非悲劇性事實，如伊莉雅絲菲爾「愛因茲貝倫家的小女兒，從小被家人捧在手心上疼愛」)；`heroToKanshouRow_`改成`p.dailyBack ? ... : 職階・真名保底`，不再有任何路徑讀到原始`p.back`(其餘20位英靈本就無`back`，行為不變)。`CODEX_PERSONA_VER`升v60(persona JSON內容改變需觸發`upgradeCodexPersonas_`整列覆寫，即使v59可能才剛部署也照樣升版，不賭「應該還沒人召喚到」——比照專案既定慣例)。
**2. `persona.speech`/`persona.tic`(戰時口吻/招牌小動作)原樣餵給鑑賞AI**：查出兩條路徑都會餵原始戰時值——①`heroToKanshouRow_`召喚當下透過`stampPersonaFlavor_(memory, p.speech, p.tic)`把原始值寫進MEMORY的【口吻】【小動作】標記；②`actionPlay`每回合組同伴卡時，若MEMORY查無標記會退回`getPersonaSpeech_`/`getPersonaTic_` + `codexPersona_(name).speech/.tic`(一樣是原始值)。實例：狂化英靈的`speech`是「狂化無法言語、僅餘低吼」——這種戰時專屬的沉重設定被當成「這位同伴的日常口吻」餵給AI，等於告訴AI這個和平世界的同伴根本不能好好講話，跟「沒有聖杯戰爭這回事」矛盾。**修法**：`heroToKanshouRow_`召喚時改用`dailyLook`第3段(自稱與口氣，這段格式設計時就是「這個角色的日常安全版語氣」)取代`p.speech`；`p.tic`沒有對應的日常版，直接不帶空字串(私密一面/dailyLook第4段已承擔「角色專屬小習慣」的功能，不會少戲)。`actionPlay`的fallback同步：新增`dailySpeechByName_(name)`(查HERO codex的`DAILY_LOOK`欄取第3段)取代`codexPersona_(pName).speech`當fallback；`pTic`的fallback直接拿掉，查無MEMORY標記時就是空字串，不再retreat回戰時原始值。
**3. `actionPlay`空隊伍/混隊誤套用「已並肩打過聖杯戰爭」框架**：查出`💕【鑑賞·後日談模式·最高優先級覆寫】`這段給AI的三元判斷式`(partyRows.length > 0 && partyRows.every(KHV_)) ? 初次相遇框架 : 已並肩奪杯框架`——**partyRows.length===0時(常見狀態：avatar剛建立、尚未召喚任何同伴)直接落入else分支**，讓AI以為「聖杯戰爭已落幕、這是奪得聖杯後的和平時光」，跟這整輪反覆確立的「這個世界沒有聖杯戰爭這回事」矛盾。舊版「奪杯封存→邀請」流程的`KSV_`前綴雖已死(該流程被直接召喚取代)，但schema/whitelist殘留，混隊(`KHV_`+`KSV_`同時在場)理論上仍可能出現在較舊的既有存檔。**修法**：改成3分支——`partyRows.length===0`→中性「這裡是平行世界的和平都市日常...眼下沒有同行的英靈在場」；`every(KHV_)`→原本的「初次相遇」框架；其餘(混隊/legacy)→同樣改成不主張任何戰爭史的中性「和平都市日常...嚴禁提及聖杯爭奪或並肩作戰的往事」，徹底拿掉「聖杯戰爭已落幕/奪得聖杯」這種solo戰爭史框架，三分支全部與平行世界原則一致。
**4. `buildTagsPayload_`(Router_Action.gs)戰鬥限定欄位無guard，靠資料形狀僥倖安全**：`sync`/`get_tags`(兩者皆非`KANSHOU_BLOCKED_ACTIONS_`)共用的`buildTagsPayload_`對每一列「從者」FACTION無條件計算`mageRealm`/`runeMode`/`synergy`/`canIdealRealm`/`npOptions`/`npChoice`/`horror`/`canSummonHorror`——這些是solo戰鬥限定的概念(魔境的智慧/原初符文/恩奇都變容/理想鄉/多寶具選單/深淵海怪)，鄰近的`economy`/`bondUsed`/`canRuleBreak`早就有`gameId.indexOf("g_")===0`guard，這8個卻沒有。鑑賞companion的TAGS/SKILLS恆空、加上前端目前不渲染這些欄位，**尚未造成玩家可見洩漏**，但屬於「日後新增一個solo action忘了顧慮鑑賞就可能真的洩漏戰鬥資料進鑑賞sync payload」的脆弱設計。**修法**：新增`const isFateCtx = gameId.indexOf("g_") === 0`，上述8個欄位全部加上這個guard(`isFateCtx && ...`或`isFateCtx ? ... : null/undefined`)，比照`economy`同款寫法，鑑賞列這些欄位現在結構性地恆為`null`/`undefined`，不再只靠資料形狀運氣。
**5. `weapon`/`get_map_nodes`/`narrate_only`三個action未被`KANSHOU_BLOCKED_ACTIONS_`擋下**：逐一grep確認`Script_Kanshou.html`/`Gallery.gs`皆0處呼叫這三個action——鑑賞UI從未使用它們，純粹是「沒人直打API所以沒事」的潛在缺口(`weapon`=戰鬥限定的武裝覆寫文字、`get_map_nodes`=solo坤圖戰爭地圖節點、`narrate_only`=solo戰爭旁白的`miniSystem`，若真被`KPC_`呼叫，`narrate_only`甚至完全沒有像`actionPlay`那樣的入口guard，會讓鑑賞召喚到solo的戰爭系統prompt)。**修法**：三者明確加入`KANSHOU_BLOCKED_ACTIONS_`，不再依賴「UI不會這樣呼叫」的隱性防線。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0；`node`腳本二次核對`Seed_Codex.gs`的`SEED_SERVANTS`陣列可正常eval、3位新增`dailyBack`內容非空。

**已知但目前無害、暫不動手的低風險項目(供之後排查，別當成待辦硬做)**：`quadLabeled_`(Router_Persona.gs)與Gallery.gs自己的`formatPref`/`formatTrait`是重複實現同一套4段標籤邏輯的維護債；`getNearbyLocations`(Core_Settings.gs)未對`COL.MAP.WAR`欄位過濾(schema註解明指此欄位為此設計，但過濾邏輯本輪未追蹤到落在哪裡)；3位女性正典御主被召喚進鑑賞後`FACTION`欄仍被標成`"從者"`(純內部過濾用途，從未解讀成文字餵給AI，語意上有點怪但無害)；`History_Sync.gs`「歷史暫存」表靠`pcId`前綴(`PC_`vs`KPC_`)而非物理分表隔離兩軌，目前因ID前綴互斥而安全，是架構上唯一的例外，記錄在案供未來警覺。完整清單見 `HANDBOOK.md` §12。

**🗑️ 順手整條移除「鑑賞」(GAL)死表(2026-07 玩家看完稽核報告後二次確認「現在也沒有勝利寫入了，鑑賞分頁好像沒有用處」)**：上方稽核已確認GAL表全代碼庫查無任何讀寫者，先前只是「死符號不刪」原樣保留(`Core_Settings.gs`/`Setup_FateWorld.gs`各有一句註解說明)。玩家這次二次確認後決定整條清掉——這其實不違反「COL位置索引不可刪」的專案鐵則，因為那條規則管的是**同一張活躍表內部**的欄位序位(刪欄會讓其後所有欄位位移)，GAL是**完全獨立、從未被任何現行程式碼讀寫的一整張表**，移除它的schema定義不會影響`COL.PC`/`COL.HERO`等任何其他活躍schema，是純粹的死碼清理而非危險操作。**動手**：`Core_Settings.gs`移除`COL.GAL`整個物件定義；`Setup_FateWorld.gs`的`FATE_SHEET_DEFS`移除`"鑑賞"`那一項(`ensureFateSheets_`從此不再建這張表)；`Gallery.gs`檔頭更新過期註解。**順手抓到一個相鄰的真實staleness bug**：`FATE_SHEET_DEFS["英靈殿"]`的表頭標籤陣列還停在15個(只到「日常性格」)，但`COL.HERO`這兩輪已經加到17欄(`DAILY_MOE`/`DAILY_OUTFIT`)——`ensureFateSheets_`靠這個陣列幫既有分頁「補尾端缺的表頭標籤」，陣列沒跟上代表這2欄的表頭儲存格一直是空白，已補上「日常萌點」「日常衣裝」兩個標籤，下次任何action觸發`ensureFateSheets_`就會自動補上(不覆蓋既有資料，純表頭)。**若玩家試算表本體已存在「鑑賞」分頁**：程式碼移除不會自動刪除實體分頁，留著空分頁無害，可自行手動刪除該工作表分頁。
**驗證**：`bash check.sh` 全過；grep確認`COL.GAL`/`FATE_SHEET_DEFS["鑑賞"]`全代碼庫僅剩註解提及、無任何實際讀寫；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0。

**🐛→✅ 玩家實測抓到真實洩漏：鑑賞AI開口叫玩家「御主」(2026-07 玩家貼出實際敘述「你就是我的御主嗎？看起來......相當普通呢」，反問「鑑賞現在沒有御主了吧？？」)**：這是「日常10項」review之後玩家實際玩到的真實bug，不是稽核報告裡的理論風險。追出根因：`actionBackfillKanshouAi`(Gallery.gs)用來生成玩家自己鑑賞人設的系統提示詞`KANSHOU_MASTER_GEN_SYS`，開場白原文是「為玩家建立一位**已結束聖杯戰爭**、與封存從者共度和平時光的『御主』本人形象」——直接告訴AI「這個人已經打過並打贏了一場聖杯戰爭」，跟這整輪反覆確立的「餐桌是平行世界、這裡從來沒有發生過聖杯戰爭這回事」原則正面矛盾，且明確用「御主」(聖杯戰爭裡令咒契約的戰爭專屬身分)稱呼玩家——這正是稍早修過的`REL_TAG`「從者」洩漏同一類問題，只是這次是玩家自己的persona生成入口沒被同步檢查到，稽核當時只查了`heroToKanshouRow_`(同伴召喚路徑)沒有連著查`actionBackfillKanshouAi`(玩家自己的路徑)。**動手**：
- `KANSHOU_MASTER_GEN_SYS`整段開場白改寫成「為玩家建立一位生活在平行世界(這裡從來沒有發生過聖杯戰爭這回事)、與身邊英靈共度和平日常的主角形象」，拿掉所有「已結束聖杯戰爭/聖杯戰爭已落幕/聖杯戰爭已結束」的斷言(原文其實出現了3次，background指示跟npc_intent指示裡各藏一次，一開始只發現開場白那次的話會漏兩處)。
- `promptStr`的資料區塊標籤`【御主】`改成`【主角】`。
- `actionPlay`組prompt時另外3處「御主」字面：瀕死張力描述(`御主氣力放盡...從者氣場都因御主將枯竭`)、空隊伍框架(`就是御主一人的尋常時光`)、世界觀時光描述(`讓從者貼近其官方性格自然地與御主相處互動`)，全數改成「玩家」。`finalJson`的`location`欄位說明同步把「御主所在地點」改「玩家所在地點」。
- **未動的部分**：`COL.PC.FACTION="御主"`(schema內部過濾用值)、UI系統訊息(`查無御主`/`御主已改名為`等alert文案)——這些從未被解讀成文字餵給AI敘事，只是玩家自己看到的操作結果提示或內部分類值，跟稍早`FACTION="從者"`的結論一致(內部標籤無害，問題只在會被送進AI提示詞的文字)。
**教訓**：稽核時查`heroToKanshouRow_`(同伴召喚)抓到了「從者」/「持`back`」的洩漏，卻沒有連著查`actionBackfillKanshouAi`(玩家自己召喚/建檔的對應函式)是否有同一類問題——兩者是同一輪2026-07加入的「AI背景潤色」機制、寫法幾乎鏡像，理應一起查。以後查一類洩漏時，記得同時查「同伴側」與「玩家自己側」兩份鏡像函式，不要查完一邊就結案。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 1，逐行核對(`grep -B3 -A3 nsfwBaseRules`)確認是既有註解提及nsfwBaseRules的上下文行被帶入diff、`+`/`-`兩側皆無該字樣，常數本體逐字未動。

**🐛→✅ 玩家追問「御主資料我怎麼感覺也被變動2次？！」，追出種子階段本身也有同樣洩漏(2026-07)**：玩家對上一條「御主」修法仍有疑慮，追問御主資料是否被改動2次——藉此重新檢查整條`actionEnterKanshou`(種子秒建)＋`actionBackfillKanshouAi`(AI背景潤色)兩階段流程，發現：**這個「兩階段」設計本身是合理、非冗餘的**(不同於稍早刪掉的同伴AI深化——那次是「已有完整daily資料卻還要多問AI一次」的真洩漏；這裡玩家自己的persona是自由輸入的60字片段或全空白，AI潤色是把粗略輸入補完成4段格式，且`backfillKanshouAi`前端呼叫**不await**、非阻塞背景執行，不影響按鍵速度，跟同伴那次的阻塞式重複round-trip是完全不同的性質)。**但檢查過程中抓到一個真的漏網之魚**：`actionEnterKanshou`(Gallery.gs)的**種子秒建階段**(AI還沒跑之前)本身就寫死了2處「聖杯戰爭已結束」的斷言——比上一條修的`KANSHOU_MASTER_GEN_SYS`(AI潤色階段的prompt)更早、更根本：
- `mRow[COL.PC.MEMORY]`初始值：「聖杯戰爭已結束，這是與英靈相伴的和平約會時光」
- `mRow[COL.PC.BACK]`空白時的預設值：「後日談裡的尋常身影，聖杯戰爭已成過去」——這個尤其嚴重，因為`BACK`每回合都會被`actionPlay`讀進提示詞(`身世:${pc[COL.PC.BACK]}`)，若玩家建檔時沒填身世、又剛好AI潤色那次呼叫失敗(靜默降級保留種子預設)，這句斷言會**永久**卡在玩家身世裡每回合餵給AI，比只出現一次的「御主」稱呼更頑固。
**修法**：兩處都改寫成平行世界框架(「這裡是平行世界的和平日常，與英靈相伴度過尋常時光」／「這個平行世界裡的尋常身影，過著平靜的日常生活」)，不再斷言曾經打過又結束了一場聖杯戰爭。
**再一次教訓**：上一條已經寫過「查一類洩漏要同時查同伴側/玩家側兩份鏡像函式」，這次補一條：**還要同時查『AI生成內容』跟『AI還沒跑之前的種子預設值』兩層**——AI polish的prompt修對了，不代表AI失敗時的降級保底文字也對了，兩層都要過一次「這句話符不符合平行世界原則」的檢查，不能查完AI提示詞就結案。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 0；grep全代碼庫確認「聖杯戰爭已結束/已成過去/已落幕」僅剩註解提及過去修法歷史，無任何現行程式碼字面輸出。

**🔄 鑑賞 physical_state 再簡化：只留顏面神情＋衣裝狀態，15字內(2026-07 玩家「狀態改成 顏面神情 還有衣裝狀態就好 動作姿勢不要了 15字內」)**：`physical_state`(鑑賞每回合AI填的角色自身狀態欄)先前已從舊版6鍵數字代碼(姿勢/胸部/肉棒/蜜穴/顏面/服裝)砍成單一自由文字欄，但仍涵蓋「姿態/表情/肉體反應/服裝凌亂度」四個面向、上限40字。玩家這次進一步收斂：只留**顏面神情**＋**衣裝狀態**兩項，拿掉動作姿勢(與肉體反應)，上限收緊到15字。**動手**(這次改動觸及`specificRules`「慾海律令」第5條，屬於紅線鄰近範圍，玩家本輪指示即為明確授權)：
- `_physicalState`(finalJson範本描述，Gallery.gs)、`intimacy_feedback._note`、`specificRules`第5條，三處描述文字同步改成「只涵蓋顏面神情與衣裝狀態，不含動作姿勢」＋「≤15字」。
- `sanitizePhysicalState`(actionPlay內部函式)補上後端`.slice(0,15)`強制截斷，不完全依賴AI自律守住字數上限(比照專案其他欄位如`npc_intent.slice(0,30)`的既有防呆慣例)。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 1，逐行核對確認是`return nsfwBaseRules + specificRules...`這行未改動的上下文行被帶入diff、`+`/`-`兩側皆無該字樣，常數本體逐字未動，改動範圍僅限`specificRules`內容(玩家本輪已明確授權)。

**🔄 玩家定案「關係改回御主從者」，撤回稍早的稱謂改動(2026-07)**：這輪稽核陸續把鑑賞的「從者」REL_TAG初值改「萍水相逢」、AI稱呼玩家的「御主」改「玩家」——理由都是「這些詞是聖杯戰爭令咒契約的戰爭專屬用語，跟沒有聖杯戰爭這回事矛盾」。玩家重新考慮後決定**撤回稱謂本身的改動，但保留「沒有聖杯戰爭真的發生過」的世界觀主軸**：「御主／從者」在鑑賞這裡當成單純的稱謂/關係定位使用，不代表真的簽過令咒契約或打過仗，兩者不衝突——純粹是稱呼習慣的取捨，不是世界觀原則本身有問題。**動手**(逐一撤回稱謂用詞，但保留「聖杯戰爭已結束/已落幕」斷言仍不放回去)：
- `heroToKanshouRow_`：`REL_TAG`初值「萍水相逢」→改回「從者」；`actionPlay`裡`rel_changes`處理的`oldTag`保底值同步改回「從者」。
- `KANSHOU_MASTER_GEN_SYS`(玩家自己的鑑賞人設生成)：`promptStr`資料標籤`【主角】`→改回`【御主】`；系統提示詞開場白補回「『御主』本人形象」，但保留「生活在平行世界(這裡從來沒有發生過聖杯戰爭這回事)」的前提子句，不放回「已結束聖杯戰爭」的斷言；`npc_intent`的禁用詞清單移除稍早加進去的「御主」(維持原本只禁「令咒/寶具/魔術迴路/從者/職階」當裝飾性元素湊萌點，這條禁令討論的是「不可拿真實war機制詞彙當裝飾語」，跟「御主/從者」當稱謂使用是不同層次的事，不衝突)。
- `actionPlay`組prompt的3處「玩家」字面(瀕死張力描述、空隊伍框架、世界觀時光描述)全數改回「御主」；`finalJson`的`location`欄位說明同步改回「御主所在地點」。
**沒有撤回的部分**：`actionEnterKanshou`種子秒建階段那2處「聖杯戰爭已結束/已成過去」斷言(改寫成平行世界框架)——那是斷言「打過仗」的內容本身，跟稱謂用詞是兩回事，玩家這次明確保留「沒有聖杯戰爭真的發生過」的軸線，這兩處不受影響。（註：`rel_changes.tag`這個AI自動進階四字詞漸進機制，緊接在這輪討論之後就被玩家整條決定移除，見下一條「態度欄位＋關係改玩家決定」——此處記錄的「維持原樣」只是那個決定當下的狀態快照，之後就變了，別被這句話誤導。）
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 1，逐行核對確認是既有上下文行，常數本體逐字未動。

**🎨 新增「態度」欄位＋「關係」改玩家決定，AI不可覆寫只能不認(2026-07 玩家討論後定案)**：玩家提案「關係、好感好像還需要有個態度讓AI去表演，玩家只可以改動關係(要設計UI)，好感增減和態度變換給AI掌控」，討論後定案：①**好感(BOND)**——不動，維持AI透過`fav_change`推進(既有機制)。②**關係(REL_TAG)**——**改由玩家專屬決定**：AI從此完全不可寫入這個欄位(移除`rel_changes.tag`)，只能透過既存但從未接前端UI的`update_rel_tag`(Router_Action.gs)由玩家自己改。③**態度(attitude，全新)**——AI專屬掌控，跟好感分開追蹤：好感是慢慢累積的長期趨勢(高好感不代表這一刻心情就好)，態度是「當下這一刻」的臨場反應快照，每回合據實覆蓋不累積。**關鍵設計**：玩家把「關係」設成某個標籤(如「戀人」)後，AI**不能把標籤改回去**，但可以，也應該透過「態度」欄表現「認不認同」這個標籤——好感不夠、性格不合適的NPC，可以困惑、嘴硬否認、半推半就，這正是「show-don't-tell」的好素材(玩家宣稱的標籤 vs 角色真實反應的落差，本身就是戲)。**動手**：
- `finalJson.rel_changes`：移除`tag`欄位與相關`_note`說明；`intimacy_feedback.npcs[]`新增`attitude`欄位(≤15字，第三人稱，每回合據實覆蓋)。
- `specificRules`(慾海律令，紅線鄰近範圍，這輪多次討論即為明確授權)：【世界與NPC自主】第2條拆成2/2b，2b講明「關係標籤由御主決定，你只能認不認」；新增第7條講「attitude·態度」的規則(跟好感是不同的兩件事、每回合覆蓋不累積、是表達認不認同的管道)。
- `actionPlay`的`relChangesToProcess.forEach`：移除`finalTag`/`rc.tag`的整段判斷邏輯，`COL.PC.REL_TAG`不再被這裡寫入。
- `relMemMemoryStr_`：新增`[態度]`標籤的解析(比照既有`[專屬稱呼]`的寫法，用「| [」分隔慣例)，讓AI下筆前看得到自己上一輪的態度，不會忽冷忽熱亂跳。
- NPC處理區塊：新增`attRaw`(`nfb.attitude`，trim+slice(0,15))寫入`COL.PC.REL_MEM`的`[態度]`標籤——**不用**`processTags`(那是給「累積去重」的專屬稱呼用的)，態度是每回合直接覆蓋成最新值，不保留歷史。
- `actionKanshouCompanions`：`current`從純姓名字串陣列升級成`{name, tag, bond}`物件陣列，前端才有資料可顯示+編輯。
- `Script_Kanshou.html`：`openCompanions`/`renderCompanionsPanel`的`_kcCur`消費點同步改用物件屬性；同伴列表每位同伴旁新增「🏷️關係」鈕，呼叫新函式`kanshouEditRelTag(name, oldTag)`(prompt輸入新稱呼→呼叫`update_rel_tag`→刷新面板)——這是`update_rel_tag`這個action第一次真正被前端呼叫到(先前只有後端實作、從未接過任何按鈕)。（註：`renderCompanionsPanel`這個函式名稱已隨下面「鑑賞同伴UI大修整」那條整個拆掉、不復存在——這裡的函式名只是那次改動當下的快照，之後結構完全變了，別被這句話誤導去找一個已經不在的函式。）
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs | grep -c nsfwBaseRules` = 1，逐行核對確認是既有`return nsfwBaseRules + specificRules...`上下文行，實際變動全在`specificRules`內容(玩家這輪討論即為授權)。

**⚡ 綜合GAS速度優化：實作4組平行審查發現的安全修正(2026-07 玩家「現在整個核心該為提升GAS速度(原本功能不能刪改)(AI處理速度不管)」)**：玩家把範圍從稍早的「鑑賞召喚UI太卡」擴大成全代碼庫，並明確定調兩條硬限制：①**純效能優化，原有功能/行為一律不能刪改**——不是重構、不是順手改邏輯；②**AI處理速度不列入本輪範圍**(那是模型選擇的取捨，非GAS執行效率問題)。派出4組平行只讀Explore審查(Router_Action/Core_Settings/Setup_FateWorld、Gallery、Router_Battle/Router_Movement/Engine_Fate、Script.html/Script_Onboarding)，每組明確被告知「只找『輸出/時序/RNG呼叫序列完全相同』的純效能改善，禁止任何需要改變行為的項目」。GAS效能鐵則(這裡再次確認)：`getDataRange().getValues()`(整表讀)是最慢的單一操作；迴圈內多次`setValue()`單格寫應合併成`setValues()`整列/整段寫；同一份記憶體陣列已查過的索引不要再查一次；`CacheService`短路(比照既有`SEED_CACHE_SECONDS_`/`getHeroCodexCached`模式)是跳過「非必要重複驗證」的既定手法。

實際落地的修正(逐檔)：
- **`Setup_FateWorld.gs`／`ensureFateSheets_`**：這個冪等建表檢查函式過去**無條件跑在每一個action**(`handleGameAction`起手式)，即使表早已建好、版本也吃到最新，每次仍要付出6個分頁的`getSheetByName`/`getLastColumn`+`seedFateCodex_`/`reseedIfEmpty_`內部的metadata讀取，合計十幾次API呼叫，99.9%情況下是純白工。補一層`CacheService`短路：cache key綁進`RESEED_VER`+`CODEX_PERSONA_VER`兩個版本常數(版本一變key跟著變，保證升版後至少完整跑一次)，同版本內6小時只需完整檢查一次。手動診斷用的`setupFateWorld()`改成先清掉這個快取鍵，確保開發時看到即時真實結果。**行為不變**：短路只跳過「檢查後發現什麼都不用做」的過程，不影響任何寫入結果。
- **`Router_Action.gs`**：①14日死線檢查分支的整表重讀改成優先吃`STATE_PRE_DATA_`(既有的handler交棒機制，見同檔`buildClientState_`夾`_state`那套)；②`buildTagsPayload_`把`pcData.find`跟後面`canRuleBreak_`需要的`pcData.findIndex`(同一個`pcId`謂詞)合併成一次`findIndex`，兩處共用`mIdx`。
- **`Time_World.gs`／`playerServantEconomy_`**：`playerHomeLoc_(sheets,pcId,data)`本身也是對`data`線性掃描找同一個`pcId`列，但呼叫端`pIdx`剛好已經掃過一次找到了——直接讀`data[pIdx][COL.PC.HOME_LOC]`取代整個函式呼叫，省掉重複掃描。
- **`Gallery.gs`**：①`actionPlay`的`allPresentRows`跟前面`presentRowsForGender`是完全相同的filter條件(期間`curL`未被重新賦值)，直接複用同一份結果省第二次整表`filter`；②`dailySpeechByName_`(同伴口吻fallback，最多每回合對2~3位同伴各呼叫一次)新增可選`preHeroes`參數——不傳沿用原樣自己呼叫`getHeroCodexCached()`(該函式即使cache命中每次仍要`JSON.parse`整份英靈殿字串)，`actionPlay`呼叫端在`partyMembers.forEach`迴圈外先抓一次`_partyHeroCodex`共用傳入，省掉2~3位同伴的重複整表解析；③`actionKanshouSummonHero`的「喚回已在場列」分支原本`IS_PARTY`/`LOC`兩個不相鄰欄位各自`getRange().setValue()`(2次API呼叫)，改成在記憶體改好這兩格後用一次`setValues()`整列寫回(欄位不相鄰，無法用range list合併不同值，改整列寫是唯一能省成1次呼叫的做法)；④`purgeGameData_`新增可選`preData`參數，3個既有呼叫端(`actionEndRun`／`Account.gs`兩處登入清殘局路徑)呼叫前都早已讀過同一張表最新快照，傳入即可省掉函式內部再整表讀一次(不傳則維持原樣自行讀取，行為不變)。
- **`Engine_Fate.gs`／`aliveEnemyServants_`**：新增可選`preData`參數，取代函式內部無條件的整表重讀。4個既有呼叫端(`Router_Battle.gs`x2、`Router_Bond.gs`、`Time_World.gs`)呼叫當下手上都早已持有一份剛讀出、且已同步套用本回合異動(如陣亡列標`DEAD_`前綴)的`pcData`記憶體陣列——這正是`aliveEnemyServants_`想查的最新狀態，逐一改傳入取代整表重讀。
- **`Router_Battle.gs`／`fateStrike_`**：海怪護盾吸收傷害後原本會立刻補寫一次`MEMORY`單格(`sheets.pc.getRange(tgtIdx+1,COL.PC.MEMORY+1).setValue(...)`)——逐一追蹤這之後的4條出路(十二試煉復活/令咒脫離/死亡/存活)，**每一條無一例外都會在函式結束前對`pcData[tgtIdx]`做一次整列`setValues()`**(且都晚於這格MEMORY更新)，代表這次單格寫入必定被後面的整列寫入覆蓋，是確認無誤的完全冗餘寫入，直接刪除(記憶體裡已更新的MEMORY值照樣會隨後面任一整列寫入一起落表，結果不變)。
- **`Router_Movement.gs`／`actionMove`**：坤圖(`getMapDataCached`)本回合執行期間不會變動，原本「目的地存在性檢查」跟「抵達場景描述」各自呼叫一次(該函式即使cache命中仍要`JSON.parse`整份坤圖字串)。改成前段在既有`try/catch`內抓一次存進`moveMapData`(**刻意保留原本的容錯範圍**：若這裡真的失敗，變數留`null`)，後段改成`moveMapData || getMapDataCached(sheets)`——正常情況省第二次呼叫，若前段失敗(理論邊角)則後段照樣自己重新呼叫一次，跟原本兩處各自獨立呼叫的容錯行為完全等價，不會把「前段失敗時後段本來會嘗試呼叫」的機會拿掉。

**評估後明確跳過、不動手的項目(連同理由記錄，避免之後被誤當漏做)**：
- Gallery.gs內4處姓名查找(`pcData.find`/`findIndex`，分別在不同函式)：比較過各處謂詞後發現**不是完全相同**的比對邏輯(有的兩側都`.trim()`，有的完全不trim，有的包`String()`用`===`)——統一成一份共用name→index Map需要挑一套正規化規則，等於在空白/型別邊角情況上改變比對行為，違反「原有功能不能刪改」，判定風險大於效能收益，維持現狀。
- `Router_Movement.gs`的`findPlayerServantIdx_`4次呼叫(`actionMove`內)：雖是對同一份`allPcData`的重複線性掃描，但4次呼叫分散在`worldTick_`(可能異動陣列內容，雖實務上不會動到玩家自己從者的存活狀態)前後、以及`pursuit`判定的不同階段，橫跨這些時序邊界合併存在「萬一日後某段中介邏輯真的動了從者陣亡狀態，合併後的快取索引會讀到過期資料」的脆弱性，且單純陣列掃描的實際效能收益遠小於本輪已完成的整表讀寫類項目，維持現狀。
- `Router_Battle.gs`／`actionFateBattle`的`npChoice`/`output`寫入(atkIdx整列寫)與稍後的海怪殘影清除寫入(atkIdx單格MEMORY寫)：兩次寫入之間存在多個會提前`return`的驗證檢查(目標查無/不同地/AP不足/已結盟)——若合併成一次延後寫入，一旦其中任何驗證失敗提前返回，玩家剛設定的`npChoice`/`output`就不會落表，**改變了現有「無論後續驗證成敗都會先落地」的可觀察行為**，故不動。
- `actionBackfillKanshouAi`的4個條件式單格寫入(BACK/TRAIT/PREF/INTENT)：此函式本身就是「非每回合熱路徑、僅召喚時觸發一次」的AI背景潤色，且函式內註解明確提到`pIdx`與寫入時的`wIdx`可能因競態而不同列——合併成整列寫入前得重新讀一次`wIdx`當下的完整列內容，否則有覆蓋掉AI呼叫延遲期間別處寫入的風險，效益(省3次API呼叫、且僅偶發觸發)不足以承擔這個風險，維持現狀。
- `rowToCombatant_`(Engine_Fate.gs)的JSON.parse快取：原始審查標記為「較低信心度、收益較小」的項目，未進一步深入評估，暫緩。
- 前端批次(Script.html的`renderWarActions`四切換函式改局部patch、`refreshFateTags`加`window._lastTags`快取、鑑賞`send()`消除`get_tags`額外round-trip、`changeOutfit`/`changeWeapon`本地狀態更新)：**尚未實作**。這批全部涉及瀏覽器端DOM/狀態時序，專案規範要求UI改動需實際在瀏覽器操作驗證(此為headless遠端環境，無法互動測試GAS webapp)，貿然上這批風險高於本輪已完成的後端I/O類項目——留待下次有能力做瀏覽器實測時再處理，記錄在案供後續接手。稍早「鑑賞召喚UI大修」的診斷(通用modal重用/每次filter全innerHTML重建/`get_heroes`零快取重複拉取/無debounce)跟這批前端項目高度重疊，之後應一併處理。（註：這行「尚未實作」是那次批次當下的狀態快照——玩家緊接著就說「一起處理！ui可以大改動沒關係」，`refreshFateTags`快取／`send()`消除round-trip／`changeOutfit`·`changeWeapon`本地更新／鑑賞召喚UI大修都已在下一條「鑑賞同伴召喚UI大修整＋前端剩餘速度批次」實作完成，只有`renderWarActions`四切換函式局部patch評估後判定優先度較低、維持不動——別被這句「尚未實作」誤導成還沒做。）

**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(本輪未觸碰任何NSFW核心鄰近程式碼)。

**🎨 鑑賞同伴召喚UI大修整＋前端剩餘速度批次(2026-07 玩家「一起處理！ui可以大改動沒關係」)**：上一輪GAS速度優化把前端批次(renderWarActions局部patch/refreshFateTags快取/kanshou send()消除round-trip/changeOutfit·changeWeapon本地更新)跟稍早診斷但未執行的「鑑賞召喚UI大修」都列為待辦——這輪玩家明確授權UI可以大改動(不再受「行為不能變」的嚴格限制)，把兩批合併一次處理。

**1. 鑑賞同伴召喚UI徹底重構(Script_Kanshou.html)**：舊版三大卡點——①`renderCompanionsPanel`共用`#history-overlay`(與史紀/魔力說明等13+功能共用同一顆彈窗)；②在場同伴/篩選下拉/召喚清單(最多~36列)全部擠在同一段字串裡，任何一次篩選切換或召喚/請走都對整段`innerHTML`整包重建，捲動位置歸零、DOM全部摧毀重造；③`get_heroes`(英靈庫全清單，內容幾乎恆定不變)每次開面板都重打一次網路，即使剛剛才打開過。**動手**：
   - **專屬彈窗**：新增`#kc-overlay`(不與其他功能共用)，`ensureKcOverlay_()`只建一次骨架，`closeKcOverlay()`關閉。
   - **拆成4個獨立容器局部重繪**：`#kc-master-box`(你御主資訊+改名/切換性別)／`#kc-party-list`(在場同伴)／`#kc-filters`(性別/職階下拉)／`#kc-hero-list`(可召喚清單)，各自有專屬render函式(`renderKcMasterBox_`/`renderKcPartyList_`/`renderKcFilters_`/`renderKcHeroList_`)，只在真的需要時才重建對應那一塊：改名/切換性別只重繪master-box；召喚/請走/改關係只重繪party-list+hero-list(呼叫新的`kcRefreshPartyOnly_`，只重抓`kanshou_companions`這份小資料，不再重打`get_heroes`)；filters只在英靈庫清單真的重抓時才重建。
   - **`get_heroes`分頁工作階段快取**：新增`_kcHeroesCacheReady`旗標，`openCompanions()`只在旗標未設時才打`get_heroes`，之後同一頁面工作階段內重開面板直接複用`_kcHeroesAll`。新增`invalidateKanshouHeroCache()`(暴露給`Script_Onboarding.html`的`summonByForge()`存檔成功後呼叫)讓工房鑄造/修改新英靈後快取失效，下次開面板才看得到新作品(已驗證`getHeroCodexCached()`本身是account-agnostic的全域快取，回傳所有帳號的英靈，`ai_gen`歸屬過濾是即時算`currentAccount`、不烤進快取，帳號切換靠既有的`logoutAccount()`整頁reload天然清乾淨，無跨帳號髒資料風險)。
   - **篩選改CSS display切換、不重建DOM**：每列召喚清單標`data-gender`/`data-cls`屬性，`kanshouSetFilter`改呼叫`applyKcHeroFilter_()`只切既有`.kc-hero-row`節點的`style.display`，不再呼叫任何render函式——這是原本「每次篩選變動都整包reinnerHTML」卡頓感的主因，現在徹底消除。
   - 舊的`renderCompanionsPanel`/`showHistoryOverlay(html)`呼叫整條移除，`_kcHeroes`變數改名拆成`_kcHeroesAll`(全清單快取)+`_kcHeroesAvailable`(排除在場者+ai_gen歸屬過濾後的可召喚清單)。

**2. 鑑賞`send()`消除多餘`get_tags` round-trip(Gallery.gs `actionPlay` + Script.html `send()`)**：`send()`(鑑賞`action:'play'`唯一呼叫點)每次收到AI回應後，過去都會**另外**呼叫一次`refreshFateTags()`(無prefetched參數→內部自己打一趟`get_tags`網路)才能刷新左側狀態卡——即使`actionPlay`這次執行期間早就已經把好感/態度/肉體等異動全部算好且寫回試算表了。**沒有動`STATE_AFTER_ACTIONS`/`buildClientState_`那套solo專用、明確以`PC_`字首把關的機制**(風險較高、牽涉面廣)，改成更輕量的作法：`actionPlay`結尾直接呼叫既有的`buildTagsPayload_(sheets, pcId, pcData)`(`pcData`此刻已是本回合全部異動寫回後的權威陣列)，把結果夾進自己回應的`tags`欄位；`send()`那端改成`refreshFateTags(data.tags)`(比照solo既有的`applyClientState`同款`refreshFateTags(data.tags)`寫法)，有夾帶就直接吃、建構失敗(理論邊角)就維持原樣退回`get_tags`補呼叫。

**3. `changeOutfit`/`changeWeapon`消除多餘`get_tags` round-trip(Script.html)**：這兩個函式呼叫的後端`actionSetOutfit`/`actionSetWeapon`(Router_Economy.gs)其實早就在自己的回應裡直接回傳消毒後的權威值(`res.outfit`/`res.weapon`)，註解甚至寫著「樂觀更新·前端自走輕量syncData」——但前端過去完全沒用這兩個值，成功後一律呼叫`refreshFateTags()`(又一趟`get_tags`網路)。**動手**：`refreshFateTags`內新增`window._lastTags = t;`(快取最後一次成功取得的tags資料)；`changeOutfit`/`changeWeapon`成功時直接把`res.outfit`/`res.weapon`寫進`window._lastTags`對應欄位(從者物件因為`myServants`跟`window._lastTags.servants`本就是同一份物件參照，改`sv.outfit`/`sv.weapon`會自動同步；御主自己則需另外顯式改`window._lastTags.master.outfit`)，再呼叫`refreshFateTags(window._lastTags)`——同一份render邏輯直接重繪，不再打任何網路請求；查無快取(理論邊角)才退回原本的網路重抓。`changeWeapon`原本的「樂觀更新」(`sv.weapon = txt.trim()`，寫入的是玩家原始輸入未消毒版、且從未觸發任何重繪，形同虛設)一併拿掉，改用伺服器回傳的權威值。

**評估後暫不動手**：`renderWarActions()`的4個toggle函式(`toggleWarTarget`/`toggleSealArm`/`toggleNpTier`/`setActiveServant`)局部patch——重新評估後認為這條路徑純粹是本地state切換(不含任何網路呼叫，`AI處理速度不管`的排除範圍原本就不含這條)，且該函式依賴多項互相耦合的動態狀態(展開中的目標/令咒蓄勢/超載檔位/出戰從者)整段重繪、無明顯報告的卡頓，貿然拆解局部patch風險(拆錯一處展開狀態)大於實際收益，優先度讓給玩家實際回報過的鑑賞召喚UI。

**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。UI大改動因headless環境無法實機瀏覽器測試，僅靠程式碼邏輯覆核(逐一追蹤`_kcHeroesAvailable`/`_kcCur`/`window._lastTags`的讀寫時序與物件參照關係)，部署後建議玩家實際操作一輪同伴面板(篩選/召喚/請走/改關係/改名/切性別)驗證。

**🐛→✅ `parseTraitsHelper`(Core_Settings.gs)短輸入補「無」bug(2026-07 玩家實測「鑑賞創角只打2個字，結果變成『O、無、無、無』，過幾秒又變成擴寫的擴寫」)**：玩家回報進鑑賞創角時只在外貌欄打了2個字，快速查看詳細狀態時依序看到「一份還不錯的擴寫」→「無無無」→「有點偏離原意的擴寫」，懷疑AI擴寫了兩次。追查後**AI確實只呼叫一次**(`actionBackfillKanshouAi`全代碼庫僅一個呼叫點，且僅在首次進場`needSetup`時觸發)——但中間那個「無無無」是真實bug：`parseTraitsHelper(data, defaultStr)`只有在`data`完全空白(`!data`)時才會套用呼叫端準備好的漂亮預設句(如「外貌平凡、舉止從容、自稱「我」、卸下心防的私密一面」)；只要玩家打了「任何內容」(哪怕只有2個字、沒用「、」分段)，`data`就判定truthy，整句`defaultStr`直接被晾在一邊，缺的3格全部塞進迴圈裡的字面「無」——`actionEnterKanshou`種子建檔階段(Gallery.gs)把`kAppear`/`kPersona`(玩家原始輸入)當`data`傳進去，短輸入必中這個bug，寫進試算表的種子TRAIT/PREF變成「2個字、無、無、無」，比空白不填還難看，且這是**真實寫進試算表的值**(不是顯示層問題)——若AI背景潤色那次因故失敗(靜默降級保留種子)，這個難看的「無」會永久卡住。玩家最初看到的「還不錯的擴寫」則很可能是`openStatus()`查看自己狀態時，先秒顯`localStorage`裡上一次(舊帳號/舊測試)快取的殘留內容——這條路徑本就不等新資料就先讀本地快取，見`openStatus()`裡`const lastS = localStorage.getItem('kyushu_last_status'); if (lastS) updateUI(...)`那段，不受這次修改影響、也不是bug，只是造成觀感上的「先看到一個、又看到另一個」。**動手**：`parseTraitsHelper`缺格改用`defaultStr`分割後對應位置的段落填補(`defParts[parts.length] || "無"`)，只有在預設句本身也給不出對應段落時才退回字面「無」(純防呆保底，現有全部呼叫端傳的`defaultStr`皆為工整4段句，不會走到這個保底分支)。已逐一稽核`parseTraitsHelper`全部14個呼叫點(Gallery.gs/Router_Creation.gs/Seed_Rivals.gs)，確認全代碼庫沒有任何邏輯依賴「缺格必為字面無」這個假設(唯一會拿字串跟「無」比對的地方全是`[態度]`/`[專屬稱呼]`/物理狀態子欄位等其他不相關欄位)，此修改對其餘13個呼叫點皆為單純改善(AI回應段數不足時，改從舊值/預設句對應段落填補，不再塞無意義的「無」)、非行為破壞。**順手發現但本輪不修的另一個既有小瑕疵**：同函式內「清除AI編號」的正規表達式`\d+[\.、]`會誤刪任何「數字+頓號」組合(如內容剛好含「25、30歲」會被吃掉部分文字)，與本次回報的問題無關，記錄在案。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0；額外寫一支node腳本複製函式邏輯手動測試(`"2個字"`＋預設句→正確補成`"2個字、舉止從容、自稱「我」、卸下心防的私密一面"`；`""`＋預設句→維持整句預設不變；多段輸入`"黑髮、話少"`→正確只補後2格)，確認修法符合預期。

**✅ 稽核「日常8項+萌點+服裝」御主/英靈(種子+新建)全對齊；拔除鑑賞3處不必要的氣血/真氣寫入(2026-07 玩家「不管怎麼樣，日常就是那8項+萌點+服裝，請幫我全部對齊！還有氣血真氣和上限這4個應該不用寫到鑑賞眾生」)**：玩家要求逐一確認TRAIT(4段：外貌/氣質舉止/自稱與口氣/私密一面)+PREF(4段：日常表象/真實內裡/喜歡/討厭)+INTENT(萌點)+outfit(服裝)這套「8+萌點+服裝」結構，在**御主(自己)**跟**英靈(種子+工房新建)**兩邊是否都對齊；並回報氣血(HP)/真氣(MP)/兩者上限這4欄，鑑賞既然無戰鬥就不該寫入「鑑賞眾生」。

**稽核結果——8+萌點+服裝這邊全部已對齊，無需修正**：
- 種子英靈：寫node腳本抽出`SEED_SERVANTS`(23筆，含3位女性正典御主)逐筆檢查`persona.dailyLook`(≥4段)/`dailyWords`(≥4段)/`dailyMoe`/`dailyOutfit`，**23筆零缺項**。
- 工房新建/修改：`recordOriginalHero_`(建立)與`actionSaveHero`的修改分支皆呼叫同一套`translateLookToDaily_`/`translatePersonalityToDaily_`/`translateMoeToDaily_`寫入`COL.HERO.DAILY_LOOK/DAILY_WORDS/DAILY_MOE/DAILY_OUTFIT`，與種子同格式。
- 御主(自己)：種子建檔(`actionEnterKanshou`)靠`parseTraitsHelper`(剛修過短輸入bug)墊底TRAIT/PREF、`setOutfit_`墊底服裝；AI背景潤色(`actionBackfillKanshouAi`)的`KANSHOU_MASTER_GEN_SYS`系統提示詞跟英靈那邊用完全同一套「外貌/氣質舉止/自稱與口氣/私密一面」＋「日常表象/真實內裡/喜歡/討厭」措辭，格式一致。

**氣血/真氣這4個確實有問題，已修正3處**：
1. `heroToKanshouRow_`(Gallery.gs，同伴召喚建列)：原寫死`HP=480,MAX_HP=480,MP=200,MAX_MP=200`，拔除。
2. `actionEnterKanshou`(Gallery.gs，御主建檔)：原寫死`HP=100,MAX_HP=100,MP=100,MAX_MP=100`，拔除。
3. **`actionPlay`(Gallery.gs)的`dirtyPcRows.forEach`寫回迴圈**：這是最有價值的一處——原本每次鑑賞送出訊息，都會對「凡人(御主)」用`maxStatsForRow_`重算一次MAX_HP/MAX_MP、拿它夾住HP/MP再寫回，**每一輪對話都白算白寫一次**，比前兩處的「只在建角當下寫一次」更浪費。`actionPlay`整個函式只服務鑑賞(入口就擋非`KPC_`呼叫)，這4欄在鑑賞從未被讀取，整段recompute直接刪掉。

**逐一排除的風險**：
- 確認`buildTagsPayload_`(Router_Action.gs)讀`m[COL.PC.HP]`/`m[COL.PC.MP]`時全都包`parseInt(...) || 0`，空字串不會產生NaN或壞資料，前端compact狀態卡(`refreshFateTags`)的kanshou分支本就不渲染血條，不受影響。
- 確認Router_Movement.gs的`actionRest`裡另一處`maxStatsForRow_`寫入是「非FATE舊版休養」分支(`restGameId`不是`g_`開頭才會走到)——但`rest`這個action本身就在`KANSHOU_BLOCKED_ACTIONS_`黑名單裡，鑑賞(`KPC_`)呼叫端根本無法觸發`actionRest`，那處寫入服務的是舊版solo/full存檔，跟鑑賞無關，不用動。
- `#status-overlay`(詳細狀態彈窗，`ui-hp`/`ui-mp`)過去不分模式恆顯示——既然鑑賞不再寫入這兩格，改成比照既有`ui-status`(當前狀態)的作法，鑑賞模式下整格隱藏(不顯示「--」看起來像資料缺漏)。修改`updateUI`(Script.html)加入`(pc && pc.mode === 'kanshou') ? 'none' : ''`切換，`openStatus`看自己或看同伴(companion)都共用同一個`updateUI`，一次修好兩種情境。
- 舊角色(修改前已建立)欄位裡殘留的舊固定值(480/200/100等)不會被追溯清除——只影響往後新建的鑑賞角色與往後的`actionPlay`回合，符合專案「schema/行為變更只動新寫入，不动既有資料」的慣例。

**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。

**🎨 御主的服裝也讓AI生成(2026-07 玩家「御主的衣服呢？可以讓ai生成嗎？不要用預設的？預設只是保底」)**：上一條稽核發現「英靈(同伴)召喚時服裝讀`daily.outfit`(手寫/AI轉換)，御主自己卻是`actionEnterKanshou`種子建檔時寫死「日常便服」、`actionBackfillKanshouAi`(AI背景潤色)從未碰過這格」——兩邊不對稱，玩家確認要修：御主的服裝也要讓AI依外貌/個性生成，種子的「日常便服」改回單純的保底(AI失敗/沒給值時才留著)，不再是唯一來源。**動手**：`KANSHOU_MASTER_GEN_SYS`(Gallery.gs)系統提示詞新增`outfit`欄位指示(依外貌/個性搭配日常穿搭，限20字，明講不含戰甲/武裝字眼)，輸出JSON schema同步加`outfit`；`actionBackfillKanshouAi`取得`aiBrief.outfit`後，用既有的`setOutfit_(memory, text)`(內建自動清除舊【換裝】標記再寫入，不影響MEMORY裡的【帳號】/【鑑賞後日談】等其他標記)寫回MEMORY欄——比照background/traits/personality/npc_intent同一套「AI有給值才寫，沒有就維持原樣」寫法，種子的「日常便服」在AI失敗時繼續留著當保底，符合玩家說的「預設只是保底」。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。

**🐛→✅ 拔除鑑賞第4處死資料寫入：STATUS 欄(2026-07 玩家追問「所以鑑賞眾生沒有多餘欄位吧？」)**：玩家問鑑賞眾生這張表有沒有多餘欄位。答案分兩層：①**欄位數量本身**——`鑑賞眾生`跟`眾生`(solo)共用同一套`COL.PC` schema(33欄，位置索引)，這是刻意共用、不可砍的架構(砍任何一欄會讓後面欄位全部錯位、牽動solo)，鑑賞角色列結構上永遠會帶著一堆對它自己無意義的欄位(SIX/TAGS/MARTIAL/CONTRIB/ALIGN/SEEN/DAY/HOUR/AP/HOME_LOC等)，但`heroToKanshouRow_`/`actionEnterKanshou`本就沒去寫這些(整列先`Array(pcColCount).fill("")`，只覆寫用得到的欄位)，不占運算成本，純結構性、不可避免。②**有沒有欄位被寫進沒人看的值**——這才是可動手的部分，逐一查證後又抓到一個跟氣血/真氣同一類的：**STATUS欄**。`actionEnterKanshou`/`heroToKanshouRow_`都還在寫死一組`{"衣服":"便裝","姿勢":"站立",...}`固定JSON——全代碼庫查證這欄唯一讀取點是`getLocalPeopleList`(Core_Settings.gs)算出`people[].status`塞進`actionPlay`回應，但前端`send()`只消費`people[]`的`.name`/`.isExact`兩欄，`.status`從未被顯示或使用，寫死同樣純屬多餘。**動手**：`actionEnterKanshou`/`heroToKanshouRow_`兩處STATUS初始值寫入拔除，同批一併處理。確認`parseVisibleStatus("")`(Core_Settings.gs)對空字串有安全預設分支(`!rawStatus`→回傳预设物件)，不會因STATUS留空而拋錯或產生NaN。
**附帶發現、本輪暫不動手**：`getLocalPeopleList`計算的`people[]`每個項目其實塞了`status`/`pref`/`relTag`/`relVal`/`faction`/`allied`/`intelCls`/`lostServant`/`master`/`servant`/`hp`/`mp`共11個欄位，但鑑賞前端(`send()`裡的`pushCandidate`)只用得到`.name`/`.isExact`——這是**跟solo共用同一份helper函式**，鑑賞跟solo呼叫同一段程式碼、solo端(renderWarActions等)確實會用到那些欄位，若要幫鑑賞省下這些用不到的計算，需要在`getLocalPeopleList`內部另開一個kanshou專屬的精簡分支(只回傳`{id,name,isExact}`)——屬於「進一步優化」而非「多餘欄位」問題，且改動範圍涉及shared helper，本輪先不動，記錄在案供之後決定要不要做。（註：這條「本輪先不動」緊接著就被玩家推翻——見下一條，`getLocalPeopleList`已經拆成鑑賞專屬的`getKanshouPeopleList_`，兩軌不再共用這段跑時邏輯，別被這句話誤導成還沒做。）
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。

**🔀 `getLocalPeopleList`拆分：鑑賞改用自己的精簡版`getKanshouPeopleList_`(2026-07 玩家「幫我拆分呢？鑑賞是鑑賞solo是solo他們就是共用種子庫資料而已，撈完資料後又是各自獨立表格，請幫我拆分」)**：上一條的「附帶發現」被玩家點名要動手——鑑賞跟solo的資料表本就物理分離(「鑑賞眾生」vs「眾生」)，理應只共用種子庫(英靈殿/御主殿)，不該連「撈完資料後怎麼處理」這段跑時邏輯都混在同一個函式裡。**動手**：
- Gallery.gs新增`getKanshouPeopleList_(pcId, curL, allPcData)`：邏輯對齊`getLocalPeopleList`原本`isKanshouCtx`分支的判定條件(同`game_id`＋`IS_PARTY==="同行"`的隊伍成員)，但只回傳`{id, name, isExact}`三個鑑賞前端真的會用到的欄位，不再計算`status`(`buildVisibleStatusString`那次JSON.parse)/`pref`/`relTag`/`relVal`/`faction`/`allied`/`intelCls`/`lostServant`/`master`/`servant`/`hp`/`mp`這12項從未被讀取的欄位。
- `actionPlay`(Gallery.gs)呼叫端改用`getKanshouPeopleList_(pcId, curL, pcData)`，不再借用`getLocalPeopleList`。
- Core_Settings.gs的`getLocalPeopleList`拿掉`isKanshouCtx`三元判斷，恢復成單純服務solo的版本(`if (tLoc === safeCurL || rVal >= 60 || rIsParty)`)——確認全代碼庫僅剩Router_Action.gs(`sync`)/Router_Movement.gs(`actionMove`)兩個solo呼叫端，行為對它們完全不變。
- 對前端而言完全等價(鑑賞`send()`本就只消費`.name`/`.isExact`)，純屬「同一段邏輯搬到對的檔案、砍掉沒人要的計算」，不是新功能。
**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 1，逐行核對確認是`return nsfwBaseRules + specificRules...`這行未改動的上下文行被帶入diff(新函式插入在它後面)，`+`/`-`兩側皆無該字樣，常數本體逐字未動。
（註：上面這行「確認僅剩Router_Action.gs(sync)/Router_Movement.gs(actionMove)兩個solo呼叫端」講法不精確——這兩個呼叫端本身就是kanshou也會經過的共用action，只是**當時**沒發現它們對kanshou context沒做分流。緊接著下一條「全代碼庫solo/鑑賞再稽核」就抓到並修正了這個漏洞，別被這句「兩個solo呼叫端」誤導成這兩處對鑑賞無害。）

**🔍 全代碼庫「solo是solo，鑑賞是鑑賞」再稽核＋修正一批真實bug與結構漏洞(2026-07 玩家「全部在確認一次 solo是solo 鑑賞是鑑賞！」)**：玩家要求對整個代碼庫重新稽核一次兩軌分離狀況，不只查上一條發現的那個函式。派出5組平行general-purpose agent覆蓋全代碼庫(Core_Settings.gs+Router_Action.gs／Gallery.gs／Router_Battle.gs+Router_Movement.gs+Engine_Fate.gs+Time_World.gs／Router_Bond.gs+Router_Economy.gs+Router_Creation.gs+Router_Persona.gs+Account.gs+History_Sync.gs／前端3份html)，每組明確給定「鑑賞只該共用種子庫、不該共用跑時邏輯」的架構目標與已知修法範本。這輪抓到的問題比預期嚴重得多，其中一個是**真實會影響每次鑑賞對話的功能性bug**，不只是效能浪費：

**1. 🐛→✅【真實bug，非效能問題】`actionPlay`的瀕死張力誤觸發(Gallery.gs)**：`【玩家命格】`那行過去帶著「生命:X/Y│魔力:X/Y」＋一段判斷式——HP/MP低於閾值時注入「★【瀕死·最高張力】御主氣力放盡、命懸一線...嚴禁輕鬆閒適的閒聊感」的AI指令。這其實是**本輪稍早「氣血/真氣4欄不用寫到鑑賞眾生」那次修正意外引入的迴歸**：拔掉HP/MP/MAX_HP/MAX_MP的寫入之前，這4欄雖然也對鑑賞無意義，但寫死的100/100/100/100剛好讓判斷式恆假(100不low於15%閾值)；拔掉寫入、欄位變空字串後，`parseInt("")||0`退回0、閾值退回1，「0<=1」變成恆真——從那次修正生效後，**鑑賞每一則訊息都會被誤判「瀕死」**，直接跟世界觀(無戰鬥無死亡威脅)矛盾，甚至跟同一份提示詞底下`specificRules`自己講的「絕對禁止血量/生命變化」自相矛盾。**動手**：鑑賞本就無戰鬥，血/魔這兩個數字對這個引擎從頭到尾沒有意義，連同「生命:.../魔力:...」的顯示欄位與整段瀕死判斷一併從`【玩家命格】`那行拿掉，不是修判斷式的閾值、是整個概念都不該出現在這裡。這也是本輪最重要的教訓：**修一個「沒人讀的欄位」時，要連著查有沒有下游判斷式依賴這個欄位「剛好是某個固定值」才維持原本行為**——HP/MP從「寫死100」變成「空字串」，看似都是「反正沒人真的在乎這兩個數字」，但中間有一段依賴具體數值的if判斷式，拔寫入前沒抓到。
2. **🐛→✅ `actionPlay`夾帶的坤圖資料是死輸出(Gallery.gs)**：`getMapDataCached`+`getNearbyLocations`算出的`locations`欄位、`allMapNames`欄位，全代碼庫grep確認`send()`從未讀取這兩者(`nearbyLocations`只有賦值、從未在任何地方被讀出渲染)——鑑賞早就拔了固定地圖節點系統(改AI自由敘述場景，「地點不再受限固定節點清單」)，這整段坤圖快取讀取＋排序運算對鑑賞是每回合白做工的死輸出。整段連同兩個回應欄位一併拿掉。
3. **🐛→✅【核心結構漏洞】`sync`(`buildClientState_`)跟`move`(`actionMove`)其實才是`getLocalPeopleList`最常被鑑賞踩到的路徑，上一條的修正漏掉了(Router_Action.gs／Router_Movement.gs)**：上一條「拆分`getLocalPeopleList`」只把`actionPlay`(`send()`訊息送出時)那條路徑換成精簡版——但鑑賞的`syncData()`(每次召喚/請走/改關係/進場都會呼叫)走的是`sync`這個action，`sync`對應的`buildClientState_`過去無條件呼叫**完整版**`getLocalPeopleList`；而`move`(`actionMove`)是刻意讓鑑賞也能用的共用action(「慾海約會地圖也要移動」)，同樣無條件呼叫完整版。換句話說，鑑賞實際使用頻率最高的兩條路徑(`sync`/`move`)反而沒被上一條的修正涵蓋到，只有相對少呼叫的`actionPlay`吃到精簡版——**這代表『鑑賞是鑑賞』這句話在上一輪並沒有真正落實到位，需要這次全面重查才抓出來**。**動手**：`buildClientState_`／`actionMove`都新增`gid.indexOf("k_")===0`(或`isFateMove`)判斷，鑑賞context一律改呼叫`getKanshouPeopleList_`(Gallery.gs)。
4. **🐛→✅ `sync`同時無條件跑`markRivalsSeen_`(Router_Action.gs)**：「戰爭迷霧」機制，找同`game_id`/同地的敵御主/敵從者標記已見過——鑑賞眾生從未有這兩種陣營的列，每次`sync`都是白掃一輪從沒中過的迴圈。改成鑑賞context(`KPC_`/`KHV_`/`KSV_`前綴)直接跳過。
5. **🐛→✅ `buildTagsPayload_`的`seals`(令咒)/`mystic`(禮裝)沒比照同批次的`servants`戰鬥欄位補`isFateCtx`guard(Router_Action.gs)**：同一函式裡`mageRealm`/`runeMode`/`synergy`/`npOptions`/`npChoice`/`horror`/`canSummonHorror`早就有`isFateCtx`guard(見上一輪稽核)，但御主自己的`seals`/`mystic`兩個欄位沒補到——前端(`refreshFateTags`)本就只在非kanshou模式才渲染「令咒」「禮裝」那兩行，這兩欄目前只靠「鑑賞從未寫【令咒】/【禮裝】標記、`getPlayerSeals_`/`getMystic_`退回預設值」的資料形狀僥倖安全，不是結構保證。補上`isFateCtx`讓鑑賞列這兩格結構性恆為`0`/`null`。
6. **🐛→✅【高風險，真實會寫HP】`actionMove`的`factionClash`(兩組敵對人馬同格先前已交手)沒有guard(Router_Movement.gs)**：這段不只是白算——它會**真的對敵御主/敵從者列扣血寫HP**，過去無guard、只靠「鑑賞眾生從不存在敵御主列」這個資料形狀讓它永遠掃不到東西才安全，是本輪找到風險最高的一處(唯一涉及真實資料寫入而非純讀取的發現)。補上`isFateMove`guard，整段這個「solo戰爭限定演出」結構性不會跑到鑑賞。同批次一併補上`preFoesAtTarget`(「抵達時是否已有先客」判定，只有solo的`travelTo()`會消費，鑑賞從無`travelTo`可用)跟`markRivalsSeen_`的`isFateMove`guard。
7. **🐛→✅ `buildMapNodesPayload_`(Router_Movement.gs，`sync`／`move`共用)沒有guard**：找戰爭名／盟友情報揭露／敵蹤掃描／坤圖節點比對，整個函式都是solo戰爭地圖限定概念——鑑賞早就拔了固定地圖節點系統，前端(`applyClientState`)本就只在非kanshou模式才`renderMapPane(data.mapNodes)`，鑑賞這裡算出來的結果從頭到尾沒人渲染。函式開頭補上`!myGameId || myGameId.indexOf("g_")!==0`早退，鑑賞直接拿同一份「空」形狀，不用真的跑敵蹤掃描＋坤圖比對。
8. **🐛→✅【安全加固，比照`weapon`/`get_map_nodes`/`narrate_only`/`purge_orphans`同款做法】`KANSHOU_BLOCKED_ACTIONS_`補上6個過去沒擋、但鑑賞UI從未呼叫過(grep確認0處call site)的solo專屬action(Router_Action.gs)**：`end_run`(清整局資料，若被`KPC_`呼叫會清錯帳號表欄位，跟已修過的`purge_orphans`同一類風險)、`create`(solo創角，會把完整戰鬥schema的列寫進鑑賞眾生)、`summon_servant`(召喚從者，同樣會寫錯表、還可能連帶污染solo的「眾生」表)、`backfill_master_ai`(會用solo戰爭語境的提示詞覆寫鑑賞御主的敘事欄)、`account_login`/`account_new_game`(正常前端不帶`pcId`呼叫，但若夾帶過期的`KPC_` pcId可能誤清玩家solo存檔的帳號連結，非破壞性但會讓存檔看似消失)。這6個都是「目前只能透過繞過UI的手動API呼叫才會觸發、沒有實際玩家會踩到」的理論風險，但比照專案一貫「別只靠資料形狀/沒人這樣打API僥倖安全，結構性擋死」的做法明確擋掉。

**評估後確認清白、不需動手的部分**：`refreshFateTags`的`buildSvCard`(Script.html)雖然在kanshou早退分支之前就先計算了`sixLine`/`skillPills`/`hasActiveSkill`/`traitPills`，但鑑賞同伴的`s.six`/`s.skills`/`s.traits`本就恆為`{}`/`[]`/`[]`(`heroToKanshouRow_`刻意留空)，這些計算實際上是在跑「空物件/空陣列」的`.map`/`.some`，成本趨近於零，跟`getLocalPeopleList`那種對實際資料做JSON.parse+字串組裝的真實浪費不是同一個量級，評估後判定不值得為了這點微小差異拆解這段密集嵌套的frontend函式；`master.hp`的文字化版本(`buildTagsPayload_`)是solo/鑑賞兩邊都沒人讀的死輸出，不是鑑賞獨有問題；`travelTo()`裡的`foes`/`foeStr`計算已確認鑑賞從無入口呼叫`travelTo`(無地圖UI)，是不可達的死路徑；`History_Sync.gs`的「歷史暫存」表仍是唯一一處solo/鑑賞共用實體表的架構例外，但靠`pcId`**精確字串比對**(非前綴比對)保證`PC_`/`KPC_`等字串不可能互相碰撞，重新確認這個既有的可接受風險沒有因本輪改動而劣化，暫不需要拆成兩張表。

**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。這輪修正涉及鑑賞每回合都會走到的核心路徑(`actionPlay`/`sync`/`move`)，headless環境無法實機驗證，強烈建議部署後實際玩一輪鑑賞(進場/召喚同伴/移動/送出對話)確認：①AI敘述不再無故提及瀕死/血量緊繃；②同伴召喚/請走/改關係後面板正常刷新；③地圖移動(若有走到)場景描述正常。

**🗺️ 鑑賞新增「出門走走」地點+隨機巧遇男角色系統(2026-07 玩家新增功能，純鑑賞氛圍用，不影響solo「一張地圖」定案的精神)**：玩家想要「有其他角色在過自己生活」的氛圍感——鑑賞按鈕選地點、AI隨機安排巧遇某個種子庫男角色(如槍兵到處打零工)、記得遇過誰，但明確要求「簡單一點但有點作用」，且**只能互動、不可以色色**(區別於同行隊伍成員的NSFW約會關係)。討論後決定走「純AI即興，不建地圖節點試算表」路線，理由：①鑑賞2026-06定案是「不打工、無經濟、無戰鬥，一張約會大地圖，其餘全靠AI即興」——若真的建一套多地點+NPC排程的持久化系統，等於推翻這個定案；②鑑賞本來就已經有AI自由決定地點的機制(`aiData.location`，見上方「拔地圖」相關條目)，這次只是在它旁邊加一層「結構化的按鈕清單」，兩者寫的是同一個`COL.PC.LOC`欄位、互不衝突。

**架構決定**：
- **地點清單不進試算表**：`KANSHOU_LOCATIONS_`(Gallery.gs，10個地點+一句氛圍描述)是純JS常數，不寫進「坤圖」分頁——避免重用solo那套坤圖驗證(`actionMove`裡`目的地必須存在於坤圖`的檢查、撤離追擊、`factionClash`戰爭邏輯)，那整套是solo戰爭地圖限定，鑑賞若重用等於把鑑賞又焊回solo引擎。
- **不另開action，塞進既有`actionPlay`同一次round-trip**：前端點地點按鈕呼叫既有的`send()`(鑑賞聊天引擎唯一入口)，多帶一個`moveTarget`參數；`actionPlay`(Gallery.gs)在最上面驗證`moveTarget`是否命中`KANSHOU_LOCATIONS_`合法清單，命中才觸發下面的位置寫入/巧遇抽選，查無效比對(如偽造字串)一律當成普通對話，不影響原本行為——符合專案「3→1 round-trip」鐵則，也符合「複用引擎機制、不加特例」(沒有另外寫一套AI呼叫/prompt組裝，直接借道原本的聊天prompt)。
- **巧遇抽選(帶標籤的加權隨機，玩家選B案)**：`KANSHOU_LOCATION_TAGS_`(Gallery.gs)是「地點→常出沒角色id」的資料驅動對照表，例如槍兵(庫丘林)刻意塞進「河邊/市集/碼頭/車站」多個地點——玩家原話「槍兵要到處打工的感覺」，不綁死單一地點；查無標籤的地點退回`KANSHOU_MALE_HERO_IDS_`(11位種子庫男從者)全池隨機當保底，不會出現「這格沒人可抽」的空轉。抽中機率70%(`Math.random() < 0.7`)，留30%空機率讓某些造訪是安靜的獨處時光，不是每次都一定巧遇誰。角色的實際「在做什麼」不寫死——AI依`persona.dailyLook`/`dailyWords`即興演出，符合show-don't-tell，不用另外設計「地點×角色×活動」三維對照表。
- **巧遇是路人性質，不是同行隊伍成員**：既有的`【在場驗證鐵律】`(actionPlay prompt裡)明講「只有同行隊伍成員能被指名互動，背景路人不具名、不可指名、不追蹤好感」——若只是把巧遇對象塞進prompt當「背景路人」，AI大概率會被這條更強的既有規則攔下、直接不理會巧遇。動手時額外加一段`kanshouEncounterStr`，明講「本回合系統指定巧遇——僅此一次的例外，不受上方在場驗證鐵律限制」，允許AI用真實姓名讓TA登場互動一小段，但講清楚「不是同行隊伍成員、好感/關係不追蹤記錄、不必邀請同行」——避免玩家隨手點個地點就意外多一個要長期經營的關係。
- **「紀錄遇過誰」走MEMORY標記，不開新分頁/新欄位**：比照`getOutfit_`/`setOutfit_`(Core_Settings.gs)同款「清除舊值再整段append」寫法，新增`getKanshouMetSet_`/`addKanshouMet_`(Gallery.gs)存取`【邂逅】name1,name2,...`這個逗號分隔、會去重的名單標記，跟其他MEMORY標記(如`【換裝】`/`【令咒】`)共用同一顆cell、同一批`dirtyPcRows`寫回，成本幾乎是零；額外拿`kanshouEncounterMetBefore`(這次抽中前是否已在名單裡)判斷「初次的邂逅」還是「已經打過照面的熟面孔」餵給AI當語氣參考，寫一支node腳本手動驗證這兩個函式的去重/多標記共存行為皆正確。
- **移動時同行同伴一起換地點**：比照AI自由換場(`aiData.location`)寫入LOC後同步「同行」隊伍成員LOC的既有邏輯，複用同一段判斷(`IS_PARTY==="同行"`+`sameGame`+非`DEAD_`)，不讓玩家點地點按鈕後同伴被留在原地。
- **前端**：`Index.html`新增「🗺️出門走走」抽屜按鈕(比照既有`drawer-companions`同款`display:none`預設隱藏)，`Script.html`的`applyModeUI`補上鑑賞模式才顯示的切換；`Script_Kanshou.html`新增地點選單彈窗(比照既有`kc-overlay`同款樣式)+`kanshouMoveTo(name)`——直接呼叫既有`send()`多帶第4個參數`moveTarget`，不另開`gasRun`呼叫。地點清單前端也放一份純供畫按鈕(`KC_LOCATIONS_`)，實際驗證/抽選邏輯只認後端`KANSHOU_LOCATIONS_`這個唯一真實來源，兩邊改地點需要各更新一次(已在程式碼註解標明)。

**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0；額外寫node腳本手動驗證`getKanshouMetSet_`/`addKanshouMet_`的去重、與其他MEMORY標記共存兩種情況皆正確。這是全新的AI提示詞路徑，headless環境無法實機驗證AI是否真的照著新規則演出，強烈建議部署後實機測試：①點「出門走走」任一地點，確認位置確實改變(狀態列/頭部顯示同步更新)；②多按幾次確認會出現「這次沒遇到人」與「巧遇某角色」兩種結果、巧遇對象的個性/穿著跟種子庫設定吻合；③巧遇時AI不會把該角色誤演成同行隊伍成員(不會被要求邀請同行、不會被錯記好感度)；④重複巧遇同一人時語氣有「似曾相識」的差異；⑤同行同伴移動時位置一起同步。

**🏷️ 鑑賞放寬同行夥伴稱呼：讓既有【專屬稱呼】暱稱系統真的派上用場(2026-07 玩家「saber能叫saber嗎...一直全名好怪」→追問「不做也沒差？好像有個暱稱系統？」→定案「敘述放寬吧！json時候ai自己抓緊就好」)**：玩家反映鑑賞敘事裡同行夥伴一直被叫全名(如「阿爾托莉雅」)很奇怪，一開始討論的方向是「能不能改叫職階(Saber)」，深入查證後發現真正根因不是職階，而是**AI每回合本來就會自己生成暱稱**——`intimacy_feedback.npcs[].mutual_nicknames`(AI自主判斷「雙方已自然發展出的暱稱」)寫進該NPC列`REL_MEM`的`【專屬稱呼】`標記，也透過`relMemMemoryStr_`秀給AI自己看(如「關係:戀人(好感:72 [專屬稱呼:小遙])」)——**但緊接著的`npcDialoguePrompt`(【姓名參考】)原句「請使用真實姓名...不得另編新名字」把AI自己剛建立好的暱稱又鎖死不能拿來稱呼**，暱稱系統形同虛設，每次還是乖乖打全名。

**過程中一併查證、確認排除的風險**：曾提議改用「職階(COL.PC.RANK，如Saber)當預設稱呼」，深入討論後發現這個方案有真實風險——`rel_changes[].target`(好感異動目標)與`intimacy_feedback.npcs[].name`(狀態/親密度回寫目標)這兩個AI輸出的JSON欄位，後端都是**精確字串比對**`COL.PC.NAME`(`pcData.findIndex(r => String(r[COL.PC.NAME]) === tNpc)`)才能定位要寫入哪一列——若稱呼放寬滲透進這兩個JSON欄位，AI真的手滑把「Saber」寫進`target`/`name`，比對不到任何列，好感/狀態異動會**悄悄地消失、沒有任何錯誤提示**。也順道查證了solo(正篇聖杯戰爭)那邊：`servantCard_`(Router_Persona.gs)同樣要求「依真名演出」，沒有比鑑賞寬鬆；但solo完全沒有這個風險類別，因為solo的好感/HP異動是**100% GAS按鈕收歸的固定值**(`raiseBond_`/`bumpBond_`直接用GAS早就解析好的索引寫入，如`+10`/`+8`)，AI從來不需要自己輸出一個「target名字」讓後端查找——若之後也想讓solo的稱呼比照放寬，只需改`servantCard_`那一句演出指令，不需要額外的防呆機制。

**動手(玩家明確定案「敘述放寬，JSON讓AI自己抓緊」——不加職階選項、不加後端fallback比對，僅這裡放寬)**：
- `npcDialoguePrompt`(Gallery.gs)：從「請使用真實姓名，不得另編新名字」放寬成「已有【專屬稱呼】就自然用暱稱取代真名，尚未發展出專屬稱呼、或情境特別鄭重深情時仍用真實姓名，不得自創真名與專屬稱呼以外的第三種稱呼」，並明講「此稱呼慣例僅供narration/對話台詞使用，與下方JSON輸出(rel_changes/intimacy_feedback)的姓名欄位無關，那兩處規則各自獨立、一律固定填真實姓名」——把「怎麼稱呼」跟「JSON要填誰」明確拆成兩件事，AI不會把敘事的稱呼習慣誤帶進資料寫入欄位。
- `intimacy_feedback.npcs[].name`／`rel_changes[].target`兩個schema欄位描述，各自補上「(不論敘事/對話裡怎麼稱呼TA，此欄固定填真實姓名，不可填暱稱、職階...)」的schema級提醒——比照專案既有做法「schema級約束比事後再說一次更有效」，不加後端比對容錯，完全依玩家指示交給提示詞層面把關。
- 沒有動`getKanshouMetSet_`/`addKanshouMet_`(上一條「出門走走」功能新增的邂逅記錄)、沒有動`rel_changes`/`intimacy_feedback`的後端解析邏輯——這輪純粹是提示詞文字調整，零資料流/schema變動。

**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。這是純提示詞文字調整，headless環境無法實機驗證AI是否真的減少全名重複、且不會把暱稱滲透進JSON欄位，建議部署後觀察幾輪對話：①好感夠高、已有專屬稱呼的同伴，敘事裡是否開始自然使用暱稱而非每次都全名；②好感異動(`rel_changes`)與狀態回寫(`intimacy_feedback`)是否仍正常生效，沒有因為稱呼放寬而漏寫。

**🐛→✅【真實bug，2026-07玩家實測「帳號表不存在？！現在不會自動檢查生成了？！」】`ensureFateSheets_`(Setup_FateWorld.gs)的6小時短路快取蓋過頭，把「缺分頁就補」的核心承諾也短路掉了**：追溯到同一天稍早的「綜合GAS速度優化」那次提速(commit 2e1ad81，task#39)——原本`ensureFateSheets_`無條件跑在每個action，該次提速為了省下「99.9%情況都白工」的重複驗證API呼叫，加了一層`CacheService`短路：`if (cache.get(key)) return []`直接短路**整個函式**，6小時內完全不跑。commit訊息聲稱「行為與逐次完整檢查完全一致」，但這個結論忽略了一個場景：**若某分頁(如「帳號」)在快取窗口內被刪除(手動誤刪/意外)，短路會讓「缺哪個就補哪個」這個函式開頭就寫明的核心承諾完全不執行，最長要等快取過期(6小時)才會恢復**——玩家實測到的正是這個情境。

**動手**：短路範圍縮小——「檢查6個分頁是否存在、缺的話補上」這段迴圈的成本本來就低(單純`getSheetByName`+`getLastColumn`的metadata查詢，不讀整表資料)，改成**永遠執行**，不受快取影響；真正貴的部分是`seedFateCodex_`(整表讀英靈殿/御主殿判斷是否為空)跟`reseedIfEmpty_`(整表讀坤圖)這兩個呼叫，才是原本提速要省的目標——短路只蓋住這兩個呼叫，其餘邏輯完全不變。這樣「缺分頁就補」是永遠成立的結構保證，不再靠快取窗口湊巧沒過期才生效；提速的實際效果(避免每個action都整表讀取英靈殿/坤圖判斷空否)完全保留，沒有走回頭路。

**附帶發現**：手動診斷用的`setupFateWorld()`(GAS編輯器手動執行用)其實在這次提速當下就已經先清一次快取鍵再呼叫`ensureFateSheets_()`，等於當時的作者已經隱約意識到「快取可能蓋住真實檢查結果」這個風險，卻只在手動診斷入口做了防範，沒有把同樣的顧慮套用到`doGet()`/`handleGameAction`這兩個真正的執行期呼叫點——這正是這次bug的缺口。

**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這輪沒有動 Gallery.gs)。純GAS後端邏輯調整，無法在headless環境模擬「分頁被刪除後下一次按鍵是否重建」，建議部署後測試：手動刪除任一FATE分頁(如「帳號」)，按任何一個按鈕或重新整理頁面，確認分頁被立即補回(不用等6小時)。若玩家真的是被刪掉整張「帳號」分頁(含資料列)，這個修正只保證分頁結構會補回(含表頭)，**不會**復原被刪除分頁裡原本的帳號-角色綁定資料列——那類資料遺失只能靠Google試算表本身的「版本記錄」(檔案 > 版本記錄)手動復原，不是這次修正的範疇。

**🔘 試算表檢查改成純手動，登入畫面加「檢查/建立試算表」按鈕(2026-07 玩家「在登入介面帳號哪裡做個按鈕檢查試算表如何？...你先讓他在那個按鈕執行一次而以後都不要檢查」)**：上一條才把`ensureFateSheets_`的短路快取修到「缺分頁就補」這段永遠會跑——但玩家測試期常常直接把整張試算表清空重來，這種情況下自動檢查(不管有沒有快取)對玩家來說都只是「等下一次按鍵/整理」才會生效，玩家更想要的是「我清空之後自己按一顆鈕、馬上生效」，而不是依賴任何自動時機；且玩家指出**這個自動檢查機制本來就只在他自己測試期間才用得到**，正式穩定運作後理論上分頁不會平白消失，沒必要每個按鍵/每次開網頁都白跑一次檢查。

**動手**：
- `doGet()`(Engine_Combat.gs)／`handleGameAction()`(Router_Action.gs)都拿掉自動呼叫`ensureFateSheets_`——以後開網頁、按任何遊戲按鍵都**不會**再自動檢查試算表分頁。
- 新增`check_sheets`action(Setup_FateWorld.gs的`actionCheckSheets`，Router_Action.gs的`ActionRouter`註冊)：內部就是呼叫`ensureFateSheets_()`，回傳「已建立缺少的分頁：XXX」或「所有分頁皆已存在」給前端顯示。這個action刻意不需要`pcId`(登入前就能按)，也不受`KANSHOU_BLOCKED_ACTIONS_`影響(該名單只擋鑑賞context呼叫solo專屬action，這裡`pcId`恆空、`isKanshouCtx`恆false)。
- 前端：`Index.html`的`step-account`(登入前的帳號輸入畫面)新增一顆「🔧 DEV：檢查／建立試算表分頁」小按鈕，故意放在登入前(而非登入後的DEV選單)，因為情境正是「帳號表都被清空了，玩家根本進不了登入後選單」，按鈕要在登入前就能用才有意義。`Script.html`新增`devCheckSheets()`，比照既有`devResyncCodex`/`devPurgeOrphans`同款寫法(`showProcessing`/`gasRun`/`alert`)。
- 既然只剩手動觸發，`ensureFateSheets_`內部原本那層「6小時CacheService短路」(上一條bug的根源)已無意義，一併拿掉，函式恢復成單純的「每次呼叫都完整檢查缺分頁+灌種子」，不再需要煩惱快取新鮮度；`setupFateWorld()`(GAS編輯器手動執行版)原本會先清一次快取鍵，這行也跟著拿掉(沒快取可清了)。

**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(Engine_Combat.gs這輪只動`doGet()`拿掉一行呼叫，離`nsfwBaseRules`很遠，逐行核對非誤判)。純GAS後端+前端按鈕，無法在headless環境模擬「登入前點按鈕」的實際互動，建議部署後測試：①手動清空/刪除任一FATE分頁，重新整理到登入畫面，確認能看到帳號輸入框(不會整頁白屏或報錯)；②點「🔧 DEV：檢查／建立試算表分頁」，確認彈出「已建立缺少的分頁：XXX」或「所有分頁皆已存在」；③正常登入/遊玩流程不受影響(不再自動檢查，但也不會因此報錯，只要分頁本來就存在)。

**⚡ 坤圖／御主殿完全靜態化：不再讀試算表，直接從JS常數回傳(2026-07 玩家「不需要硬寫在試算表了...？直接從gas抓資料...？」)**：玩家問「真正要留資料的只有眾生、鑑賞眾生、地圖、帳號？」——查證後發現這個直覺**部分對、部分需要修正**：眾生/鑑賞眾生/帳號確實是真正動態的資料(玩家跑起來會即時改的血量/位置/好感/帳號綁定)，非留在試算表不可；但**坤圖(地圖)玩家自己也以為要留，其實不用**——全代碼庫查證後，坤圖從沒有任何玩家動作會寫入(唯一寫入者是開發者升級地圖版本時的一次性upsert，見`reseedIfEmpty_`)，它從一開始就只是`FATE_MAP_SEED`(Setup_FateWorld.gs)這個JS常數的一份多餘拷貝——舊架構是「把常數複製進坤圖分頁→讀分頁→靠CacheService快取6小時」，等於繞了一大圈才拿到本來就在記憶體裡的東西，快取本身還要多付一次CacheService API呼叫的成本，比直接讀常數還慢。**御主殿也是同一類**：查證`upgradeMasterCodex_`/`seedFateCodex_`是唯二寫入點，都只在版本升級/首次建表時執行，沒有任何玩家動作(工房/召喚)會新增列進這張表——完全比照坤圖處理。**英靈殿則不能這樣做**：工房(Workshop)玩家可捏出原創英靈(來源=`ai_gen`)並永久寫進這張表，GAS程式碼本身是靜態部署的，跑起來時沒辦法把新角色永久塞回JS常數——這部分是真正需要試算表持久化的動態資料，這次刻意不動它，維持既有的「讀表+6小時快取」架構。

**動手**：
- `getMapDataCached(sheets)`(Core_Settings.gs)：改成直接`return [表頭列].concat(FATE_MAP_SEED)`，不讀分頁、不用CacheService，`sheets`參數留著只是相容既有呼叫簽名(所有呼叫端不用改參數列表)。回傳形狀(含表頭列＋`COL.MAP`欄序)跟原本讀sheet完全一致，逐一核對過所有呼叫端(`buildMapNodesPayload_`/`getNearbyLocations`/`actionMove`/`leylineAt_`/`enemyRetreatLoc_`等)全部沿用同一套「row 0是表頭、`i=1`起讀資料」的既有慣例，寫node腳本手動驗證輸出形狀(20筆地點+表頭共21列、每列7欄)正確無誤。
- `getMasterCodexCached()`(Core_Settings.gs)：改成直接用既有的`masterToCodexRow_`(Seed_Codex.gs，`seedFateCodex_`本來就在用的同一個轉換函式)即時組出`[表頭列].concat(SEED_MASTERS.map(masterToCodexRow_))`，同樣不讀分頁不快取。寫node腳本驗證15位正典御主全部轉換成功、無缺id/name、每列15欄。
- 拔掉所有跟著`sheets.map`存在與否分岔的guard：`buildMapNodesPayload_`/`actionGetMapNodes`(Router_Movement.gs)、`leylineAt_`(Time_World.gs)的`if (!sheets.map) ...`一律移除(不再有意義)；`actionManualNpc`/`actionBackfillMasterAi`(Router_Creation.gs)兩處原本「有sheets.map才讀分頁算合法地點清單、沒有就退回寫死4個地名」的邏輯，改成直接呼叫`getMapDataCached(sheets)`(永遠非空，不必再退回保底清單)；`enemyRetreatLoc_`(Engine_Fate.gs，令咒緊急脫離的戰鬥熱路徑)原本直接`getSheetByName("坤圖")`整表讀取，改用`getMapDataCached()`。
- `handleGameAction`(Router_Action.gs)組`sheets`物件時拔掉`map: ss.getSheetByName("坤圖")`——**每一個action呼叫**現在都少打一次Sheets API(過去即使有CacheService擋住`getMapDataCached`內部的整表讀，這個`getSheetByName`本身仍是每次action都會執行的一次真實API呼叫)。
- 「坤圖」「御主殿」兩個分頁本體都保留在`FATE_SHEET_DEFS`(不刪除既有分頁定義)、`reseedIfEmpty_`/`upgradeMasterCodex_`/`seedFateCodex_`的寫入/版本升級邏輯也完全不動——這兩張表變成純供人工查閱的參考副本(手動按「檢查/建立試算表」按鈕時仍會建立/更新)，但遊戲邏輯往後不會再讀取它們一個字。

**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(本輪未動這兩個檔案跟nsfw規則相關內容)。額外寫node腳本從實際`Setup_FateWorld.gs`/`Seed_Codex.gs`原始碼裡抽出`FATE_MAP_SEED`/`SEED_MASTERS`/`masterToCodexRow_`，模擬跑一次新版`getMapDataCached`/`getMasterCodexCached`的輸出，確認形狀(欄數/表頭/資料完整性)正確。這批修正影響solo的地圖顯示/移動/戰鬥令咒脫離/開局選出生點、以及`actionGetMasters`(扮演正典御主選單)，headless環境無法實機驗證AI敘事/UI渲染，建議部署後測試：①solo開新局，確認出生點/地圖分頁正常顯示地點清單；②移動到不同地點，確認地圖節點/靈脈回魔(魔力恢復速度隨地點類型不同)行為不變；③戰鬥中觸發令咒緊急脫離，確認撤退地點正常隨機選取(非約會地點)；④選單「扮演正典御主」清單正常顯示。

**🔍「出門走走」補洞：原地問「還有誰」也能觸發巧遇，不再被在場驗證鐵律悶死(2026-07 玩家實機遊玩「出門走走」後回報)**：玩家實際玩了一輪「河邊」，AI正確巧遇庫·丘林、也正確用真名開口互動(功能本身運作正常)——但玩家接著問「這裡還有誰啊」，AI卻只描寫「不具名的路人」，不敢再生出任何人。玩家準確抓到根因並問「是不是有個提示詞說禁止不在同地人的歷史人物出聲」——查證後確認正是**既有的**`【在場驗證鐵律】`(這條規則在「出門走走」之前就存在，本意是避免AI隨手生出一堆有名有姓卻沒人追蹤好感的路人)：它只允許「同行隊伍成員」被指名，而巧遇到的庫·丘林只是那一次性的系統例外、不是同行隊伍成員，玩家事後籠統問「還有誰」不算「明確指名/邀請某個具體角色」，AI在規則約束下沒有管道再生出第二個有名有姓的人。玩家確認「只有鑑賞放寬可以嗎」——確認`actionPlay`整個函式入口就鎖死只服務`KPC_`(鑑賞)呼叫，天生就不會影響solo(solo的稱呼/在場規則是另一套`servantCard_`，完全不共用這段邏輯)，於是照這個方向動手。

**動手**：
- 把`moveTarget`分支裡原本內嵌的「查標籤池→70%機率→查`SEED_SERVANTS`」抽選邏輯抽成共用函式`kanshouRollEncounter_(locName)`(Gallery.gs)，避免下面新分支要重複寫一次同樣的機率/查找程式碼。
- 新增`else`分支：沒有按移動按鈕(`moveTarget`為空)時，若玩家目前所在地(`curL`)剛好是「出門走走」10個地點之一，且這句話的用詞符合`KANSHOU_ASKING_WHO_ELSE_RE_`(啟發式關鍵字regex，涵蓋「這裡/附近/周圍還有誰/其他人/別人」等常見問法、雙向詞序都抓)，就用目前地點重新擲一次同一套加權隨機巧遇——**不寫LOC(沒有移動，位置不變)、不同步同伴LOC(沒人移動)**，只補上巧遇者與記錄邂逅名單。
- `kanshouEncounterStr`(巧遇的系統例外提示詞)裡原本寫死引用`moveTarget.name`的地方，改成新增的`kanshouEncounterLocName`共用變數(兩個分支各自賦值)，避免`moveTarget`為空時對`undefined`取`.name`直接炸掉。
- 關鍵字regex刻意設計成「寧可漏判、不要誤判」：漏判時只是退回原本的「純背景路人」描寫(行為不變，沒有損失)；誤判時頂多是多一次意外的巧遇驚喜(不是壞事)。寫node腳本測試12組真實/仿真的問法(含玩家原句「這裡還有誰啊」)與2組不該誤觸發的無關句子，全部通過預期結果。

**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。額外寫node腳本驗證`KANSHOU_ASKING_WHO_ELSE_RE_`對12組測試字串(含玩家實測原句)判斷正確、不會對無關句子(如「我想抱抱你」「附近的風景真美」)誤觸發。這是提示詞+關鍵字偵測的行為調整，headless環境無法實機驗證AI敘事表現，建議部署後測試：①巧遇到人後接著問「這裡還有誰」，確認有機會(非每次，機率同70%)真的再遇到人而不是只描寫路人；②問法夠籠統時(不含關鍵字，如純粹閒聊)確認不會誤觸發額外巧遇；③這個補洞不影響「出門走走」按鈕本身的巧遇機率與同伴移動同步邏輯。

**🐛→✅ 巧遇對象改成「這次到訪期間持續有效」，不再只是單回合permission(2026-07 玩家實測後追問「不一定要遇到別人...至少歷史人物可以跟我繼續互動吧」)**：上一條修正讓「問還有誰」有機會觸發巧遇，但玩家實際遊玩後指出更根本的問題——巧遇的系統例外(`kanshouEncounterStr`)原本只在**觸發那一瞬間的那一回合**注入提示詞，下一輪`kanshouEncounterHero`又變回`null`，一旦玩家下一句話沒有剛好又符合`KANSHOU_ASKING_WHO_ELSE_RE_`(或再按一次移動)，`【在場驗證鐵律】`就會恢復全力——這條規則明講「歷史紀錄、話題情報中提到但不在【同行隊伍成員】內的姓名，僅視為不在場的回憶，嚴禁...讓其開口說話」，等於剛巧遇到的人下一輪就會被這條規則打回「只是回憶」，跟同一份聊天記錄裡他剛剛還在講話自相矛盾。玩家指出真正想要的是「不一定要遇到新的人，至少已經遇到的人能繼續聊」。

**動手**：新增MEMORY標記存取器`getKanshouActiveEncounter_`/`setKanshouActiveEncounter_`/`clearKanshouActiveEncounter_`(Gallery.gs)，存取`【邂逅中】heroId`這個單一值標記——跟永久性的`【邂逅】`(邂逅過的名單，不會清除)不同，這個是「這次到訪期間」的暫時狀態：
- 觸發巧遇成功(不管是按移動按鈕、還是原地問「還有誰」)時，把巧遇對象的hero id寫進`【邂逅中】`。
- 换地点(`moveTarget`觸發)時，**先清掉**舊的`【邂逅中】`(離開原地＝上一段緣分結束)，新地點才重新擲一次。
- 沒按移動按鈕時，優先檢查`【邂逅中】`是否已有值——有的話**不管這句話問什麼**都直接沿用同一位巧遇對象(從`SEED_SERVANTS`用id查回完整資料)，讓`kanshouEncounterStr`這個系統例外提示詞持續注入；只有在`【邂逅中】`是空的時候，才退回上一條的「問還有誰才擲新的」邏輯。
- `kanshouEncounterStr`措辭同步從「僅此一次的例外...不必刻意延續到下一輪」改成「這次到訪期間持續有效的例外...這段緣分在玩家離開這個地點前都有效」，同時保留「AI仍可視情境自然安排道別離開，不必勉強撐到換地點」的彈性——不是強制每次到訪都要演到玩家主動移動才能結束，只是拿掉「只有觸發那一瞬間才能講話」的死板限制。

**設計取捨(有記錄但這輪不處理)**：`【邂逅中】`只在玩家「換地點」時清除，若玩家在同一地點持續聊很久、AI自己已經在敘事裡安排該角色道別離開，系統仍會在下一輪繼續注入「TA還在」的permission——這是刻意的簡化(不做精細的「AI主動signal這個人已經離開」狀態機)，因為這只是一個soft permission(允許AI用真名稱呼、不是強迫TA一定要出場)，AI自己接續對話歷史時本就會自然順著剛才的敘事走(已經演離開就不會突然又冒出來)，等於系統層與敘事層各自有一道防線，不需要疊床架屋做更複雜的追蹤。

**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。額外寫node腳本驗證`get/set/clearKanshouActiveEncounter_`三個函式的讀寫、覆寫(換人)、清除、與其他MEMORY標記共存四種情況皆正確。headless環境無法實機驗證AI是否真的維持巧遇對象跨輪互動，建議部署後測試：①巧遇到人後，接下來幾句普通對話(不含「還有誰」關鍵字)確認AI仍會自然稱呼、互動這位巧遇對象，不會突然說他不在場；②移動到別的地點後，確認舊的巧遇對象不會被錯誤延續到新地點；③AI自己敘事安排巧遇對象道別離開後，之後對話是否還算自然(即使系統permission仍在，也應該不會頻繁莫名其妙又冒出來)。

**🐛→✅【真實bug，solo，與今天的GAS修改無關】「扮演正典御主」創角被自己的擋名保護擋死(2026-07 玩家實測「他不讓我確認他說已經有了？！是不是因為gas關係？」)**：玩家選「扮演正典御主」(例如遠坂凜)、確認創角時被擋，訊息說這個名字「已知」。查證後**不是今天的坤圖/御主殿靜態化等修改造成**——`git blame`確認這條擋名檢查是6天前(2026-07-04，commit`14f04b7`)的「創角不再擋跨局同名」修正加入的，早於本次session所有異動，是一個獨立於今天工作的既有bug。

**根因**：`actionManualNpc`(Router_Creation.gs，`create`action的處理函式)的`_canonHit`檢查——「若姓名命中`SEED_MASTERS`/`SEED_SERVANTS`任一正典名字，一律擋下」——**完全沒有讀`userData.playedMaster`**。但玩家從`Script_Onboarding.html`的`pickCanonMaster`選了正典御主後，前端會把該御主的真名帶入`s-name`欄位、連同`playedMaster`(該御主id)一起送進`create`——這正是「扮演正典御主」這個合法入口本身送出的名字，卻被這條保護機制當成「自創御主撞到正典名字」而擋下，等於這個入口自己送出的東西被自己的保護攔在門外，一按確認就100%必中。

**動手**：新增`_playingThisCanon`判斷——驗證`userData.playedMaster`對應的正典御主在`SEED_MASTERS`裡的真名剛好等於這次要建的`finalName`，才放行(不是「有帶`playedMaster`就一律放行」，防止夾帶不相干的`playedMaster` id亂繞過保護)。順帶查證了原本`_canonHit`保護真正要擋的「自創御主與被種入本局的同名正典敵手變雙胞胎」問題：`seedRivalsForGame_`(Seed_Rivals.gs)早就會排除玩家扮演的那位正典御主、不讓TA又被種成本局敵御主(`if (playedMaster && String(r.master) === playedMaster) return`)，所以「扮演正典御主」這個情境本來就不會真的產生雙胞胎，這裡放行是安全的。順帶確認`actionCheckName`(Router_Action.gs，`check_name`action)不需要同樣的修正——前端`pickCanonMaster`本就明講「扮演者名字可能含『·』等符號，跳過checkName，直接進細節步驟」，canon流程從未呼叫這個action，只有自創/自訂名字流程才會，不受影響。

**驗證**：`bash check.sh` 全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(本輪未動這兩個檔案)。額外寫node腳本驗證5種情境：①扮演正典且名字對得上playedMaster→放行；②自創撞到正典名字、沒帶playedMaster→照舊擋下；③自創全新名字→放行；④夾帶不相干的playedMaster id想繞過保護(名字對不上)→照舊擋下；⑤扮演正典但事後把名字改成別的→canonHit本身就是false，自然放行。5種情境結果皆符合預期。這是solo創角流程的真實修復，headless環境無法實機驗證前端完整流程，建議部署後測試：選「扮演正典御主」任一角色，走完創角流程確認能順利進場，不再被「已知」訊息擋下。

**🔍 五路並行代碼稽核＋逐一修正(2026-07 玩家「怎麼這麼多奇怪的bug....你可以進行模擬測試 進行修正嗎...」)**：上面接連幾個bug都是玩家自己實測時撞到的，玩家問能不能主動先掃一遍抓漏，不要每次都等他撞到才修。派了5個`general-purpose` agent平行稽核(不是Workflow——玩家這句話沒有明確要求「用workflow/ultracode多代理」，照工具規範只用一般Agent)，各自認領一塊(創角/鑑賞/帳號登入/戰鬥移動/羈絆經濟)，每個都拿到同一個bug類型範本(「為情境A加的擋/檢查，沒考慮到合法的情境B也會觸發同一條路徑」，附上剛修完的`_canonHit`/`playedMaster`案例當參考案例)，要求只回報file:line+信心度+具體會怎麼壞，不要順手改代碼、不要為了交差硬湊沒有實質內容的發現。5份報告收回來後，**每一條都自己重新讀一遍當下最新的原始碼再動手**，不盲信agent報的行號/說法（本次沒有發現任何agent誤報，但這是每次稽核都要做的核實動作，不能省）。

**確認且修正的5類問題**：

1. **`worldTick_`(Time_World.gs)重複的敵從者回血區塊**：函式本身註解明講「跨輪(最多4輪，12小時休息)累積dirty旗標，輪跑完只在最後寫一次`sheets.pc.getRange(...).setValues(...)`」——但「敵從者小幅自癒」那段被重構時複製了一份舊版留在新版旁邊，同一輪內把同一批列多回血一次，還額外做了一次跟這段設計初衷矛盾的「每輪立即寫回」。實際效果：敵從者回血速率從設計值0.06/輪被悄悄翻倍成~0.12/輪，玩家戰鬥難度感受跟數值文件對不上，卻不會報錯，很難自己發現。**動手**：整段刪除多的那份，只留原本`anyHpDirty`旗標控制的正確版本，換成一句解釋根因的註解。

2. **`intimacy_feedback`寫入摧毀整個MEMORY欄(Gallery.gs)，本session最高嚴重度確認**：`actionPlay`處理AI回傳的`intimacy_feedback.dynamic_skills`時，昨天(7/9)的重構`809960a`把寫法改成`pcData[idx][COL.PC.MEMORY] = \`[雙修技巧]${processSkills(...)}\``——這是**整格覆寫**，不是合併，而`intimacy_feedback`是schema規定AI**幾乎每一輪**都要回傳的欄位。結果：`【換裝】`/`【帳號】`/`【鑑賞後日談】`/`【口吻】`/`【小動作】`/`【邂逅】`/`【邂逅中】`這些跟`[雙修技巧]`共用同一顆cell的標記，幾乎每一輪對話都會被無聲清空——**而`【邂逅中】`正是本session稍早才剛做好的「巧遇對象持續互動」功能**，這代表那個功能從上線那一刻起就沒有真的生效過，玩家換裝/帳號綁定/鑑賞後日談進度等等也都在每輪對話中持續流失。這很可能是玩家近期感受到「很多奇怪bug」的核心成因之一。**動手**：新增合併寫入的helper`setSkillTag_`(先用regex清掉舊的`[雙修技巧]`片段，再把清乾淨的舊MEMORY接上新的技能標記)，玩家與NPC雙方分支都改用這個helper，不再整格覆寫；順便把`processSkills`內部讀取用的regex(`/\[雙修技巧\](.*?)(?=\| \[|$)/`)統一成跟其他標記一致的`/\[雙修技巧\]([^｜]*)/`(原本那條混用半形`| [`當結尾判斷，跟專案裡其他標記統一用全形`｜`分隔的慣例不一致)。

3. **5處MEMORY標記regex排除錯了分隔符字元**：整個標記生態系統一律用全形`｜`(U+FF5C)當cell內的多標記分隔符，但下列get/set函式的排除字元集寫成`[^|【]`(排除半形`|`，等於沒排除任何實際會出現的分隔符)：`Router_Bond.gs`的`getBondUsedToday_`/`setBondUsedToday_`(**嚴重度最高**：這對函式是「今天是否已用過某類羈絆互動」的每日上限檢查，排除字元錯誤代表若`【羈絆日】D:type`後面剛好接了其他全形`｜`分隔的標記，讀取時會把那個`｜`也吃進捕獲值，可能讓「今天已互動過」的比對失準、被繞過而一天內重複拿好感)、`Router_Movement.gs`的`setWorkshopMemory_`/`setScavengedLoc_`(較輕：只會讓改寫時吃掉相鄰標記間的分隔符，讀取端`getWorkshop_`/`getScavengedLoc_`本身排除字元集是對的，不受影響，頂多下次改寫後兩個標記黏在一起)、`Router_Persona.gs`裡`toM`(對御主態度)的備援解析(最輕：純文字污染，一個雜訊字元混進AI提示詞，不影響任何資料寫入或遊戲判定)。**動手**：5處全部改成`[^｜【]`，和專案裡其餘同類get函式(如`getWorkshop_`/`getScavengedLoc_`本來就用的`[^｜|【]`)一致。

4. **創角/查名比對「已洗過標點的輸入」對「原始未洗的正典名字」，含標點正典名永遠比不中**：`sanitizeUserData_`(Router_Action.gs)對`name`/`npcName`欄位套用`cleanChineseName`(只留CJK字元，標點/英數全部剝掉)，但`actionManualNpc`(Router_Creation.gs)的`_canonHit`／`_playingThisCanon`、以及`actionCheckName`(Router_Action.gs)的`_canonHit`，比對對象都是`SEED_MASTERS`/`SEED_SERVANTS`裡**未經同樣清洗**的原始名字字串。至少一位可扮演正典御主「韋伯·維爾維特」(`FATE_4TH_ROSTER`)真名含間隔號標點——玩家若自創角色想撞這個名字(或極端情況下前端傳入含標點的名字)，兩邊字串因為標點有無而恆不相等，保護機制形同虛設，可能悄悄創出「韋伯維爾維特」(去標點畸形版)這種既非正典也非玩家原意的名字，`actionCheckName`的查重回報也會失準。**動手**：兩處`_canonHit`比對、`_playingThisCanon`比對，都改成先對`SEED_MASTERS`/`SEED_SERVANTS`的`.name`套一次`cleanChineseName`再比對，兩邊統一正規化基準。另外**根源修正**：`actionManualNpc`裡`_playingThisCanon`成立時，額外把`finalName`從洗過標點的畸形版本，還原成`SEED_MASTERS`裡的原始正典真名(含標點)——不然即使擋名保護放行了，寫進表的名字仍然是錯的、缺標點的版本，等於只修了「能不能過關」卻沒修「過關後名字對不對」。

5. **`actionBond`(Router_Bond.gs)相處動作沒有像同級動作一樣事前擋AP不足**：函式自己的註解說「相處耗1 AP·與令咒/偵查同級」，但跟`actionProposeAlliance`/`actionAllyBond`不同，它沒有在動作生效前先檢查`getAp_(myGameId) < 1`就擋下——原本只在最後靜默呼叫`spendAp_`，AP不足時`spendAp_`內部雖然不會讓AP變負值(不足會回傳`ok:false`但完全不動時鐘)，卻也沒讓呼叫端知道、任何後續處理，等於羈絆值/當日已用標記/突襲風險都照樣結算，只是少了「花時間」這個副作用——跟其他同級動作「AP不足直接擋下、不讓效果發生」不一致。這個問題因為`usedToday`本身已限制一天只能用一次，實際可乘之機很小(頂多省下那一天的1點AP)，屬於中信心度、低影響的一致性問題。**動手**：在效果生效前加上跟`ally_bond`同款的前置擋檢查，行為與訊息風格對齊(`"行動力不足以從容相處——請『休息』恢復後再來。"`)；順帶把後面原本又重複寫一次`myGameId.indexOf("g_")===0`的判斷改成複用同一個`isFate`變數，少一次重複字串比對。

**稽核也確認乾淨、沒有新發現的範圍**：帳號/登入相關流程(`KANSHOU_BLOCKED_ACTIONS_`/`LOCK_EXEMPT_ACTIONS_`/`STATE_AFTER_ACTIONS`/dispatcher路由)——這條agent交回的報告是「稽核完整、無新發現」，沒有為了交差硬找問題湊字數。

**驗證**：`bash check.sh`全過(7個修改檔案：`Time_World.gs`/`Gallery.gs`/`Router_Bond.gs`/`Router_Movement.gs`/`Router_Persona.gs`/`Router_Creation.gs`/`Router_Action.gs`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(Gallery.gs這輪有改動，但改動處是`intimacy_feedback`寫入/`processSkills`正則，逐行核對過離`nsfwBaseRules`很遠，非誤判)。這批全是後端邏輯修正，headless環境無法實機驗證AI敘事/實際遊玩體驗，建議部署後測試：①鑑賞模式巧遇對象後連續互動幾輪，確認換裝/帳號綁定/其他MEMORY標記不再消失；②鑑賞「巧遇中」對象確認真的能跨輪持續互動(這是本次修正後才第一次真的生效)；③solo戰鬥中觀察敵從者回血速率是否恢復正常(不再是雙倍)；④羈絆日限每日只能相處一次，AP不足時應直接被擋下並顯示提示訊息；⑤自創角色若刻意輸入正典名號(含標點的如「韋伯維爾維特」)應被正確擋下，選「扮演正典御主」流程仍能正常創角且真名保留標點。

**🔍 第二輪大範圍稽核(2026-07 玩家「再檢查檢查吧....大範圍測試！！」)**：上一輪5路稽核修完後，玩家追加要求擴大範圍。這次派7路agent涵蓋上一輪沒碰的領域(戰鬥引擎Engine_Combat/Engine_Fate、禮裝Mystic_Code、種子資料正確性Seed_Codex/Seed_Rivals、鑑賞Gallery.gs深度複查、帳號/History_Sync/經濟殘留/Router_Narrative、前端Script*.html一致性)，外加一路專門寫node腳本回歸驗證上一輪5個修正是否真的正確生效。

**目前確認且修正的問題**：

- **`callGeminiAPI`(Engine_Combat.gs)審查攔截判定漏一種訊息形狀**：`attemptWithModel_`原本判斷「AI回應是否被審查攔截」的條件是`choice.finish_reason==="content_filter"||choice.finish_reason==="SAFETY"||(choice.message && !choice.message.content)`——最後這條只在`choice.message`**存在但是空的**時候才成立；若供應商回傳的拒答格式連`message`欄位本身都不給(而不是給一個空的`message`)，整個判斷式為false，會直接落到下一行`choice.message.content`，對`undefined`取`.content`炸出一個普通`TypeError`。這顆例外雖然一樣會被下面的`catch`接住、不會讓整個請求掛掉，但會被誤判成「普通連線錯誤」而非審查攔截：跳過專門為審查設計的「降階重試(換更含蓄筆法)」邏輯，原樣重送對審查毫無意義；而且最終若重試全部失敗，`isBlocked`判斷(`lastErrorMessage.includes("Triggered_NSFW_Filter")`)也會是false，玩家看到的會是洩漏技術性錯誤訊息的「⚡連線中斷：Cannot read properties of undefined...」，而不是原本設計要給的柔和訊息「🌸結界觸發」。**動手**：判斷式改成`!choice.message || !choice.message.content`——「message不存在」跟「message存在但空」都算同一類(AI沒給文字回來)，回歸這段程式碼原本的設計意圖。信心度中(此為speculative case，目前串接的OpenRouter/DeepSeek/Gemini後端是否真的會吐出這種形狀未實測證實，但屬於「外部API回應格式一律當不可信輸入」的既有工程準則，防守成本近乎零，值得補)。

- **`SEED_SERVANTS`的正典撞名擋從一開始就是死的(`s.name` vs `.realName`)**：`SEED_SERVANTS`(Seed_Codex.gs)每個角色物件的真名欄位其實叫`realName`，`SEED_MASTERS`才叫`name`——但`Router_Creation.gs`的`actionManualNpc`(`_canonHit`)、`parseForgeBuild_`(工房捏角查重)、`Router_Action.gs`的`actionCheckName`，三處都寫成`SEED_SERVANTS.some(s => s.name === ...)`，`s.name`對每個從者物件恆為`undefined`，這個分支從一開始就不可能命中——「自創御主/從者撞正典從者真名」這個情境從沒被真正擋過，玩家可以自創一個跟正典從者(如阿爾托莉雅·潘德拉貢)同真名的角色，事後若該局也鋪了正典敵手，會在同局內產生撞名歧義(名字查找塌縮成一人)。**動手**：三處全部改成比對`s.realName`。
- **真名召喚「斯卡哈」永遠固定召到 Lancer 版**：斯卡哈在種子庫裡是 Lancer/Assassin 兩個獨立職階列、同真名靠職階區分——但`actionSummonServant`(Router_Creation.gs)的真名比對分支完全不管`reqCls`(玩家瀏覽的職階分頁)，一律吃陣列裡第一個名字比對到的列(Lancer 排比較前面)，導致不管玩家選哪個職階分頁輸入「斯卡哈」都固定召到 Lancer 版；而且前端`summonByName()`(Script_Onboarding.html)原本根本沒把目前選的職階分頁傳給後端，即使後端肯篩選也收不到線索。**動手**：後端改成「真名命中的列裡，優先挑職階match `reqCls`的，找不到才退回原本『不分職階、比對第一個』的行為」；前端`summonByName()`一併把`selectedSummonClass`當`cls`參數帶上。
- **`seedRivalsForGame_`混亂模式沒有排除`playedMaster`(防禦性補強·目前不可達)**：正史分支早就會排除玩家扮演的正典御主本人(避免雙胞胎)，混亂(`chaos`)分支的隨機池篩選原本沒有同款排除。查證目前`playedMaster`只在非chaos模式才會寫入MEMORY(`actionManualNpc`)，故這條路目前吃不到，屬防禦性補強，避免未來`playedMaster`語意擴及chaos模式時重演一次雙胞胎bug。**動手**：`mPool`篩選補上`if (playedMaster && String(r[COL.MASTER.ID]) === playedMaster) return false;`。
- **`actionBackfillKanshouAi`(Gallery.gs)非阻塞背景呼叫用過期的MEMORY快照合併換裝**：這是進鑑賞當下不`await`、趁玩家看開場白空檔跑的背景AI呼叫——`row`是AI呼叫【前】的MEMORY快照，寫回時用`setOutfit_(row[COL.PC.MEMORY], aiBrief.outfit)`合併，若這幾秒空檔玩家剛好觸發「出門走走」寫入了`【邂逅中】`(或其他會動MEMORY的動作)，用這份舊快照當合併基底會把那些新寫入蓋掉——跟已修過的`intimacy_feedback`整格覆寫是同一個bug類型的不同觸發路徑(基底過期，而非整格蓋掉)。**動手**：在真正寫入前，用`wIdx`重新讀一次當下最新的MEMORY值再合併，而非沿用呼叫前的快照。
- **登入殘局防呆誤殺「還沒召喚從者」的合法進行中角色(HIGH，實際會發生)**：`actionAccountLogin`(Account.gs)判斷「這局是否已經結束」的邏輯是`!masterAlive || !servantAlive`——但御主締結(`actionManualNpc`)到召喚從者(`actionSummonServant`)中間隔著一個真實存在的「召喚從者頁」決策畫面(挑職階/瀏覽名冊/工房)，玩家可能在這裡停留、或直接關掉分頁改天再回來。這段「從者根本還沒召喚」的合法空窗期，`servantAlive`恆為`false`(找不到任何從者列)，跟「已經召喚過、但從者已死」共用同一個判斷式，會被誤判成「這局已經結束」而整局直接被`purgeGameData_`清掉——玩家在還沒開始打仗前就被判定戰敗、角色憑空消失。**動手**：新增`servantExisted`旗標(是否曾經有過從者列，不論死活)，只在「從者存在過但已不在世」才視為殘局；尚未召喚的視為合法的「還在締結中」存檔，回傳`needsSummon:true`；前端`continueGame()`(Script_Onboarding.html)收到這個旗標時改接回召喚從者頁(顯示`step-summon`、呼叫`loadHeroes()`)，而非直接進尚無從者的主畫面。
- **`actionAccountNewGame`漏處理`DEAD_`前綴(MEDIUM，防禦性補強·目前不可達)**：御主敗北時ID會被加上`DEAD_`前綴(帳號表仍存原`charId`)——`actionAccountLogin`查殘局時有考慮這個前綴，`actionAccountNewGame`(開新局清舊檔)原本沒有，若`charId`那列已經是`DEAD_`版本，會查無此列、`gid`判斷不到，導致清除迴圈找不到任何列可刪，那局的殘列全部留在「眾生」表沒被清掉。查證正常前端流程下不會觸發(`newGameFlow`只在`hasGame===true`時呼叫，而`hasGame:true`保證`g_`開頭的局御主/從者皆存活)，只有多分頁/過期快取等邊緣情境才會踩到，屬防禦性補強。**動手**：查找與刪除迴圈都比照`actionAccountLogin`的寫法，同時接受`charId`與`"DEAD_"+charId`。
- **`raiseBond_`(Router_Narrative.gs)好感寫入只靠角色名字定位，沒有game_id範圍，跨帳號資料corruption風險(HIGH，本輪最高嚴重度的新發現)**：這個共用helper原本靠「用`pcName`(御主名)找出御主列、拿它的`game_id`當範圍」來限定接下來要改哪個從者的好感值——但自訂御主名允許跨局撞名是本專案既有設計(`actionManualNpc`的既有註解：「跨局撞名無害」)，若剛好另一個帳號、另一局遊戲的御主取了同名字且排在「眾生」表陣列較前面，`raiseBond_`推導出的`gid`就會綁錯局，後續的從者好感寫入就會寫進錯的局——極端情況下是寫進**別人帳號的存檔**，是一個真實可觸發的跨帳號資料汙染路徑，且完全靜默(不報錯、雙方都看不出異狀，只會發現好感值莫名跳動)。6個呼叫點(戰鬥交手削好感`Router_Battle.gs`、令咒補魔`Router_Bond.gs`、相處`actionBond`、破戒奪僕`Router_Bond.gs`、休息夢境`Router_Movement.gs`、補魔過充`Router_Economy.gs`)全部受影響。**動手**：`raiseBond_`簽名新增`gameId`參數(呼叫端在呼叫當下必然已經知道自己的`game_id`，不必再繞一手用名字反查)，兩邊查找(御主與從者)都直接用這個可信的`gameId`範圍，不再依賴名字比對來界定「這是哪一局」；6個呼叫點全部改傳各自已有的`myGameId`/`restGameId`變數。
- **`move`動作在`STATE_AFTER_ACTIONS`裡白做一次完整`buildClientState_`(MEDIUM-HIGH，效能only)**：前端稽核發現`move`(Router_Action.gs的`STATE_AFTER_ACTIONS`名單)唯一呼叫端`travelTo()`(Script.html)從沒呼叫過`syncData()`、也不消費`__pendingState`/`_state`——它直接用`actionMove`自己回的`people/locations/mapDesc/mapNodes/statusString`更新畫面，本身就自給自足。夾`_state`對這個動作等於白做一次完整的`buildClientState_`(含`getLocalPeopleList`/`buildMapNodesPayload_`/`buildTagsPayload_`/`playerServantEconomy_`/`markRivalsSeen_`全套)，算完就被前端原地丟棄——在「移動」這個全遊戲最高頻的動作上白燒CPU，正是專案自己鐵則「別把多餘round-trip/整表讀回加回來」要避免的事。**動手**：把`move`移出`STATE_AFTER_ACTIONS`；順帶查證`move`不列入`KANSHOU_BLOCKED_ACTIONS_`目前仍安全(但原因是舊註解寫錯的——鑑賞移動地圖其實走`action:'play'`＋`moveTarget`，從沒真的呼叫過`action:'move'`；`actionMove`用pcId去「眾生」表找列，`KPC_`的id活在完全不同的「鑑賞眾生」表，本來就查不到、會自然落入「查無此人」提前返回，不像`create`/`summon_servant`等會無條件寫新列，故不必額外擋，只更正過期註解)。
- **「歷史暫存」表只限制單一pcId最多留40列，整張表從沒被清過(MEDIUM，品質類，非資料corruption)**：`trimRowsByOwner`只保證單一玩家自己最多留40列，但已結束/被purge的對局，其歷史列永遠留在表裡，隨全站使用量無上限累積。`getGameHistory`/`getGameHistoryBatchRaw`為了效能只讀最後1000列——這代表「還活著但暫停很久沒登入」的帳號，自己那40列可能被其他帳號同期間的活動擠出這1000列窗口之外，安靜地讀不到任何歷史、續接不上前塵對話(不報錯，純粹是體感上「回來後AI好像忘記之前發生的事」)。**動手**：新增`purgeHistoryForPcIds_`(History_Sync.gs)，在`purgeGameData_`(Gallery.gs)清除一局的「眾生」列時，順手收集這些列的pcId、一併清掉「歷史暫存」裡屬於這些pcId的所有列，讓這張表的大小跟着「目前存活局數」同量級，不再隨全站流水無上限累積。

**驗證**：`bash check.sh`全過(14個修改檔案：`Engine_Combat.gs`/`Account.gs`/`Gallery.gs`/`History_Sync.gs`/`Router_Action.gs`/`Router_Battle.gs`/`Router_Bond.gs`/`Router_Creation.gs`/`Router_Economy.gs`/`Router_Movement.gs`/`Router_Narrative.gs`/`Script_Onboarding.html`/`Seed_Rivals.gs`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這批對這兩個檔案的改動——Gallery.gs的`purgeGameData_`/`actionBackfillKanshouAi`、Engine_Combat.gs的審查攔截判定——逐行核對過都離`nsfwBaseRules`很遠，非誤判)。這批修正橫跨資料正確性(SEED_SERVANTS真名欄位/斯卡哈職階disambiguation)、帳號資料完整性(登入殘局誤殺進行中角色)、跨帳號資料安全(raiseBond_無game_id範圍)、效能(move動作多餘的_state計算)、資源成長控制(歷史暫存表無上限累積)五個面向，headless環境無法完整實機驗證多帳號併發/長期累積等情境，建議部署後測試：①「扮演正典御主」以外的自創角色若刻意輸入正典從者真名(如阿爾托莉雅)應被擋下；②選Assassin分頁後真名召喚「斯卡哈」應召到Assassin版而非Lancer版；③創角後先不召喚從者、關閉分頁改天回來繼續登入，應該能接回召喚從者頁而不是角色消失；④跟從者相處/交手/補魔等會加減好感的動作，正常單帳號遊玩下好感值變化應一切如常(這條修正主要防的是多帳號同名撞號的極端情境，單帳號測試看不出差異、但也不該有任何退步)；⑤結束一局(戰敗或手動開新局)後，該局在「歷史暫存」表裡的舊對話列應該被一併清除。

## 14. 欄位(COL)與種子日常資料稽核記錄(2026-07 玩家「請確認所有欄位都沒有問題！！」)

**COL 欄位定義**：寫node腳本programmatically驗證5張表(PC/MAP/HERO/MASTER/ACC)的COL索引——全部從0連續排到底，無重複、無跳號；對照`FATE_SHEET_DEFS`(Setup_FateWorld.gs)表頭陣列，每張表欄位數與順序都跟COL定義完全一致；全代碼庫(含.html)每一處`COL.表名.欄位名`引用都對照過，**零筆打錯字/指向不存在欄位**。額外查出5個「只寫不讀」但無害的欄位(坤圖`REGION`、御主殿`MELEE`/`MAGIC_RANK`/`HOME`/`WAR`)——跟既有`COL.PC.MAJOR_EVENT`死欄同一類，種子資料建立時有塞值，但沒有任何遊戲邏輯讀回來用，不影響任何機制。結論：欄位定義層本身沒有問題，這輪連續抓到的都是「邏輯處理欄位資料時」的bug，不是欄位本身歪掉。

**種子庫日常資料(DAILY_LOOK/DAILY_WORDS/DAILY_MOE/DAILY_OUTFIT)以第五次聖杯戰爭7位(阿爾托莉雅/EMIYA/庫·丘林/美杜莎/美狄亞/赫拉克勒斯/咒腕之哈桑)為基準逐一核對**：寫node腳本實際切段驗證(非目視)——7位`dailyLook`/`dailyWords`皆精準4段(用「、」分隔，對齊`heroToKanshouRow_`實際的split邏輯)；逐一核對「私密一面」段與`dailyMoe`欄有無撞成同一句(v59修過美杜莎的重複，這輪確認7位皆無重蹈覆轍)；戰時`persona.moe`→日常版`dailyMoe`的轉換都符合「拿掉戰爭/創傷份量」原則(如美杜莎「怪力女神卻極度自卑」→「家事身手意外地好」，赫拉克勒斯「偶爾理智回光的瞬間」→「偶爾害羞般的靦腆瞬間」，皆非偷懶照抄)。

**唯一發現並與玩家討論定案的不一致**：赫拉克勒斯的`dailyLook`第3段(自稱與口氣)沒有明確自稱詞——其餘6位第3段都是「自稱「X」・語氣描述」的固定格式，唯獨他只寫「話極少・多以點頭或簡短音節回應偶爾露出憨厚笑容」，沒有引號自稱。根因：他戰時`persona.firstP`寫死是「（狂化・僅咆哮）」，日常版(無聖杯戰爭、理智正常)沒辦法照搬這個值，寫的人當時大概因此乾脆跳過自稱。跟玩家討論後**玩家定案「還是不說話就可以」**——維持現狀不補自稱詞，不是bug，是角色特色的一部分(即使日常也是話極少的類型)，**不動**。

## 15. 速度稽核：`STATE_AFTER_ACTIONS`裡17個動作只有2個真的有交棒優化(2026-07 玩家「檢查是否還可以提升gas速度」)

**背景**：專案的「3→1 round-trip」機制核心是`STATE_AFTER_ACTIONS`(Router_Action.gs)——列在這份名單的動作，dispatcher會在handler跑完後呼叫`buildClientState_`把最新畫面狀態(`_state`)夾進回應，讓前端省一趟額外的`sync` round-trip。`buildClientState_(sheets, pcId, preData)`跟`raiseBond_`/`spendAp_`/`grantAp_`都遵循同一套「有現成的`preData`陣列就直接用、省一次整表讀；沒有才自己讀一次(相容舊呼叫)」的設計——這套機制本身沒問題，問題出在**沒人真的把`preData`傳進去**。

**查證方法**：programmatically列出`STATE_AFTER_ACTIONS`裡全部17個動作(`fate_battle/use_seal/mana_supply/bond/rule_break_steal/propose_alliance/break_alliance/ally_bond/set_workshop/scavenge/second_wind/scout/rest/summon_horror_beast/dismiss_horror_beast/update_fate/update_rel_tag`)，對照全代碼庫`STATE_PRE_DATA_ = `(dispatcher讀取的交棒變數)的賦值位置——**只有`fate_battle`跟`rest`兩個動作有交棒**，其餘15個一律沒有，每次呼叫都讓dispatcher在`buildClientState_`裡對「眾生」整表白讀一次，即使handler自己那份`pcData`早已是完整且最新的權威陣列。

**根因分兩層，往下挖還挖到2個真bug**：
1. **表面層**：15個handler跑完前少寫一行`STATE_PRE_DATA_ = pcData;`，各自獨立疏漏，沒有共同根因，純粹是這個交棒慣例只在`fate_battle`/`rest`實作時被想到、之後新增的動作沒人跟進補齊。
2. **深層(更嚴重)**：其中9個handler(`bond`/`propose_alliance`/`ally_bond`/`use_seal`裡的mana分支所在的`raiseBond_`不算、`set_workshop`/`scavenge`/`second_wind`/`scout`/`mana_supply`/`summon_horror_beast`)呼叫`spendAp_`/`grantAp_`時**沒有傳`pcData, sheets`**——這兩個函式沒拿到現成陣列時，內部的`getClock_`會自己整表讀一次，`writeClockToRow_`寫回時又整表讀一次，等於**光是「花1點AP」這件事本身就要白讀兩次整表**，跟handler自己一開始那次讀取、加上dispatcher的`buildClientState_`那次，一個按鍵最多疊到4次整表讀。另外4個`raiseBond_`呼叫點(`Router_Bond.gs`×3／`Router_Economy.gs`×1)也是同款疏漏，之前的稽核批次剛好沒抓到這個。
3. **順手抓到2個真正的資料不一致(不是效能問題，是交棒安全的前提)**：`actionUpdateRelTag`(Router_Action.gs)改稱呼只寫進sheet、沒同步寫回`pcData[tIdx][COL.PC.REL_TAG]`；`actionScavenge`(Router_Movement.gs)揭露敵蹤只寫sheet的`SEEN`欄、沒同步寫回`pcData[i][COL.PC.SEEN]`——這兩處若直接交棒會讓`_state`裡的畫面資料跟本回合剛發生的事「對不上」(改完稱呼、`_state.people`卻還是舊稱呼；剛揭露敵蹤、`_state`卻還顯示未偵查)，修交棒前先把這兩處記憶體鏡射補齊。

**動手**：
- 4處`raiseBond_`呼叫(`Router_Bond.gs`3處／`Router_Economy.gs`1處)補上第6個參數`pcData`。
- 10處`spendAp_`/`grantAp_`呼叫(`Router_Bond.gs`3處／`Router_Economy.gs`1處／`Router_Battle.gs`1處／`Router_Movement.gs`5處，含`actionPrepMeal`——雖然它不在`STATE_AFTER_ACTIONS`裡，但同一顆函式改起來零成本、沒理由漏掉)補上`pcData, sheets`兩個參數，`clockLabel_`/`getClock_`跟著補傳`pcData`。
- 修`actionUpdateRelTag`/`actionScavenge`的記憶體鏡射缺口。
- 15個handler(`use_seal/mana_supply/bond/rule_break_steal/propose_alliance`(兩個成功分支都補)`/break_alliance/ally_bond`(兩個成功分支都補)`/set_workshop/scavenge/second_wind/scout/summon_horror_beast/dismiss_horror_beast/update_fate/update_rel_tag`)在各自的成功回應前補上`STATE_PRE_DATA_ = pcData;`，逐一核對每個handler直到return前的所有寫入(HP/MP/MEMORY/SEEN/陣營轉換/令咒扣除等)都已經原地反映在`pcData`陣列裡才動手——只對「失敗」的早退分支(success:false)不補，因為dispatcher只在`obj.success`為真時才會用到交棒的陣列。

**驗證**：`bash check.sh`全過(5個修改檔案：`Router_Action.gs`/`Router_Battle.gs`/`Router_Bond.gs`/`Router_Economy.gs`/`Router_Movement.gs`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這輪未動這兩個檔案)。這是純後端I/O優化＋2個記憶體鏡射修正，不改變任何遊戲數值/機率/判定邏輯，headless環境無法測出實際延遲差異，建議部署後測試：①令咒(修復/補魔/脫離)、相處、結盟交涉、撕毀盟約、同盟相處、破戒奪僕、設陣地、搜刮、偵查、絕地反擊、補魔、召喚/解除海怪、逆天改命、重新定義稱呼——這些動作的既有行為(效果/訊息/AP消耗/時鐘推進)應該完全不變，只是每次按鍵少了2~4次不必要的整表讀取，體感上應該更快，尤其是連續按這些按鈕時的間隔。

**追加稽核(玩家「再仔細看看 速度 邏輯 是不是都正常」)：派2路agent查上面沒細看過的範圍**——鑑賞`actionPlay`(最高頻函式)、以及`buildClientState_`內部呼叫的各個helper(現在被17種動作共用，任何沒接住現成陣列的地方都會被放大)。

- **`buildClientState_`內部：5類helper各自重複掃描同一份`allPcData`找同一件事**(如`clockLabel_`跟`getAp_`各自重找一次「這局的御主列」、`playerServantEconomy_`跟`buildTagsPayload_`各自重篩一次「同局從者」)，一次呼叫下來多繞了約5~8次記憶體掃描，2~3次就夠。**判斷：記錄但不動手**——上一批修的是真正的Sheets API整表讀寫(每次上百毫秒)，這批抓到的是純JS陣列迴圈(微幾秒等級)，「眾生」表這種量級下多繞幾次體感上感覺不到；要修乾淨得改`playerServantEconomy_`/`buildTagsPayload_`/`getLocalPeopleList`/`markRivalsSeen_`/`buildMapNodesPayload_`好幾個函式簽名(這些函式在其他地方也有別的呼叫點，動簽名等於要盤點全部呼叫端)，成本跟回報不成比例，先不做。

- **鑑賞`actionPlay`：血量/魔力快照比對整組是死代碼(HIGH confidence，已動手)**：`hpSnapshot`(結尾比對用的血量快照)在函式一開頭對整張「鑑賞眾生」表做一次完整`forEach`掃描，結尾再用`hpChangeMsgs`/`mpBefore`/`mpAfter`/`mpDiff`比對顯示血量/魔力變化——但本檔上面(瀕死張力指令那條同批次舊修正)已經查證確認鑑賞的`HP`/`MP`/`MAX_HP`/`MAX_MP`這4欄從未被寫入、恆為空字串，全代碼庫grep也確認`Gallery.gs`沒有任何一處`COL.PC.HP]=`/`COL.PC.MP]=`賦值——`parseInt("")||0`兩邊永遠是0，這組比對邏輯注定產生不出任何可見輸出，卻在鑑賞這個全代碼庫呼叫最頻繁的函式裡，對整張表白做一次完整掃描，每個訊息都白做。**動手**：整組(快照建立＋結尾diff顯示)刪除，理由與旁邊已修過的瀕死判斷完全同源，只是當初漏了這個伴生的死代碼。
- **鑑賞`actionPlay`：請走同伴這回合仍被順手同步到新座標(LOW-MEDIUM，已動手)**：`partyMembers`(同行名單)是AI呼叫前捕捉的快照——若玩家這回合剛好請走某位同伴(`IS_PARTY`已被清空)，結尾同步座標的迴圈仍拿舊快照跑，會把剛離隊的人也順手同步到玩家的新位置(送他最後一程才真正離隊，非資料損毀，純多餘的一次LOC寫入)。**動手**：迴圈裡補上即時重查`IS_PARTY === "同行"`，已離隊者不再跟著同步座標。
- 其餘檢查(MEMORY寫入是否merge安全、多次AI呼叫、row-index過期、非批次寫入)：`actionPlay`全函式逐行核對過，皆為clean(這輪稽核抓到的`setSkillTag_`合併寫法/`buildLiveIdIndex_`競態重定位等既有機制都運作正常，沒有新發現)。

**驗證**：`bash check.sh`全過(`Gallery.gs`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這輪對Gallery.gs的改動——刪除死代碼、補一個IS_PARTY即時檢查——逐行核對過都離`nsfwBaseRules`很遠，非誤判)。headless環境無法測出實際延遲差異，建議部署後測試：①鑑賞正常聊天，畫面不應再出現任何「血量/魔力變化」提示(本來就恆為空、拿掉也不該有變化)；②鑑賞請走同伴的當下，確認該同伴不會在離隊瞬間又被瞬移一次位置。

## 16. 第三輪稽核：`Router_Battle.gs`主戰鬥函式抓到真正的玩家體感bug(2026-07 玩家「繼續找問題」)

派4路agent查前兩輪沒正面攻過的範圍：`Router_Battle.gs`主戰鬥處理函式(之前只查過純數學的Engine_Fate/Engine_Combat)、`Core_Settings.gs`(全專案共用基礎函式)、`Time_World.gs`全檔(之前只修過worldTick_一個重複區塊)、`Script.html`前端消費`_state`的邏輯。

**🔥 `actionFateBattle`：灌魔超載/補魔過充，在多數情況下玩家白付代價、傷害完全沒吃到加成(HIGH confidence，本輪最高嚴重度)**：`npOverloadMul`(超載倍率)／`overcharge`(過充旗標)這兩個屬性，寶具解放結算時只設在`atkC`(戰鬥函式開頭建的那個物件)上，從未存進MEMORY。戰鬥的傷害結算實際上分兩條路：①「開場對轟」(雙方都用寶具開場對撞，僅在攻擊敵從者、且敵方也接對轟時才會觸發)直接用`atkC`，吃得到加成；②**每回合迴圈**(其餘所有情況——打敵御主、或敵從者沒有攻擊型寶具/不接對轟，這是多數對局的實際路徑)用`rowToCombatant_(pcData[sidx])`重新現建一個全新物件`sC`，這個新物件天生沒有`npOverloadMul`/`overcharge`這兩個屬性(對比同一批已經處理過的`atkC.horrorUp`——那個有讓MEMORY標記持久化，重建的新物件能自然讀到；超載/過充這兩個沒有比照辦理)。結果：玩家已經照樣扣了超載的魔力/血量代價(`drainForNp_`)，甚至扛了過載反噬的機率性扣血風險，傷害計算卻完全沒吃到`×1.25~×2.0`的超載倍率、過充的命中/傷害加成，UI橫幅(`report.overload`)跟AI敘述提示詞卻還是照樣宣稱「灌魔超載」發動了——玩家花錢買了一個空氣加成，且完全沒有任何提示告知。**動手**：在每回合迴圈裡，本回合輪到攻擊者本人解放NP的那一刻(`isActive && opening && openingNp`，跟原本判斷是否觸發NP的條件完全同一個)，把`atkC`身上已經結算好的`npOverloadMul`/`overcharge`複製到這回合現建的`sC`上，讓超載/過充在這條(較常見的)路徑上真正生效，不必大動整個資料流(不用比照`horrorUp`額外存MEMORY，因為這兩個值本來就只在「這一發NP解放」的瞬間有意義，戰鬥結束就該歸零，存進MEMORY反而多了個要清除的地方)。

**其餘`Router_Battle.gs`發現(記錄不動手)**：①NP費用門檻(出力100%/魔力足夠)在判斷「這次攻擊會不會走向斬首無寶具分支」之前就先擋——目前前端「🗡️刺殺御主」按鈕固定傳`useNp=false`，這個順序問題現階段碰不到，屬於潛在但目前不可達的後端不一致，先記錄；②敵御主死亡時若同時有多名連結從者需要標記，逐一列各自立即寫入(非批次)——同一批只會有極少數情況命中多從者同時陣亡，效能影響可忽略。兩者皆LOW confidence、rare/unreachable，不動手。

**`Time_World.gs`**：確認`worldTick_`舊修正仍然有效(重複回血區塊沒有復發)，AP/時鐘基礎函式(`getClock_`/`spendAp_`/`grantAp_`/`writeClockToRow_`)的「有pcData/sheets走記憶體、沒有則自行整表讀」雙路徑最終狀態一致，MEMORY合併寫入與全形`｜`分隔符全部乾淨。**動手一項效能修正**：`actionMove`(Router_Movement.gs)傳`pcData`/`sheets`給`spendAp_`是對的，但`spendAp_`內部`writeClockToRow_`還會立即單獨寫一次時鐘3欄，而`actionMove`結尾本就有一次涵蓋全表的批次`setValues`，等於同樣的值被寫了兩次——`writeClockToRow_`/`spendAp_`新增可選的`skipWrite`參數(預設`false`，其餘所有呼叫端行為完全不變)，`actionMove`這裡傳`true`，把這3欄的寫入完全交給結尾那次批次寫回。**記錄不動手**：死亡標記(敵御主死亡時清算其從者的doom-timer)沒有比照`worldTick_`的dirty-flag批次寫回模式、逐筆立即寫——同一輪擊殺多個連結從者才會命中，機率低、非資料錯誤，只是沒批次。

**`Core_Settings.gs`**：整體狀態最好的一個檔案(先前已修過的race-guard/快取失效配對/中文名清洗邊界情況，這輪逐一核對都還是對的)。**動手4項小清理**：①`mergePhysicalStatus`——原本舊格式STATUS欄解析失敗時，catch直接回傳原始舊字串，這次要更新的值被無聲丟棄且不報錯；改成解析失敗當空物件繼續合併，新值一定會被套用。②移除完全零呼叫點的死函式`getCharacterTotalStats`(連參數都還留著早已砍除的ITEM系統痕跡)。③`getLocalPeopleList`裡宣告了卻從未被寫入的死物件`otherPartyByNpc`(單人模式本就沒有「陪別人」這件事，`busyWith`欄位本就恆為`null`且前端從未讀取)一併移除。④`Setup_FateWorld.gs`/`Seed_Codex.gs`裡4處`CacheService.remove("FATE_MAP_DATA"/"FATE_MASTER_CODEX")`——坤圖/御主殿靜態化後這兩個快取鍵早就不會被`put`，remove一個從未寫入的鍵雖然無害(try/catch包著)，但會誤導以為還是快取制，清掉。

**驗證**：`bash check.sh`全過(6個修改檔案：`Core_Settings.gs`/`Router_Battle.gs`/`Router_Movement.gs`/`Seed_Codex.gs`/`Setup_FateWorld.gs`/`Time_World.gs`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這輪未動這兩個檔案)。灌魔超載修正是這批最重要的一條，headless環境無法模擬完整戰鬥流程驗證數值，建議部署後測試：①解放寶具攻擊「敵御主」(clash分支結構上不會觸發的情境)並選超載檔位，確認傷害數字明顯高於不開超載的同一發寶具，UI「灌魔超載」橫幅跟實際傷害要對得上；②攻擊沒有攻擊型寶具的敵從者、開超載，同樣確認傷害有吃到加成；③一般同時滿足對轟條件的情境(打有攻擊型寶具的敵從者且對方接對轟)行為不變，仍走原本的對轟結算。

**`Script.html`：整個「3→1 round-trip」機制在11個動作上形同虛設(HIGH confidence，本輪第二重大發現)**：`__pendingState`(dispatcher夾帶的`_state`暫存)在`gasRun()`函式一開頭就無條件清空——「新一趟伺服器呼叫開始→作廢舊state」，本意是防止過期state被誤套用。但`narrate()`本身就是包了一層的`gasRun({action:"narrate_only",...})`呼叫，而`use_seal`/`mana_supply`/`bond`/`rule_break_steal`/`propose_alliance`/`break_alliance`/`ally_bond`/`set_workshop`/`second_wind`/`summon_horror_beast`/`fate_battle`這11個動作的handler原本統一寫成「`await narrate(res.aiPrompt); syncData(true);`」——narrate()一啟動內部的`gasRun`就把剛剛動作回應夾帶的`_state`洗掉了，等`syncData(true)`真正執行時`__pendingState`早已是`null`，只好乖乖走`else`分支真的打一趟`sync` round-trip。等於PR #172那批「補齊15個動作交棒`STATE_PRE_DATA_`」的優化，後端確實省了整表重讀，但前端根本沒機會消費這份`_state`——多繞一手還是要真的sync一次，這11個動作的實際round-trip數完全沒變，後端組`_state`(含`buildTagsPayload_`/`buildMapNodesPayload_`/`playerServantEconomy_`等一整包)的成本純屬白費。**動手**：把這11處(含`summonHorror`/`setWorkshop`兩個用`if (res.aiPrompt)`包著的變體)全部改成「`syncData(true)`在前、`await narrate(...)`在後」——`syncData`在`__pendingState`還在時走的是同步套用的快路徑(沒有`await`，不需要等)，讓`_state`趕在`narrate()`自己的`gasRun`把它清空之前先被消費掉；`narrate()`原本要做的事(顯示AI敘事文字)跟`syncData`完全獨立，兩者對調順序不影響任何使用者可見的行為。在`__pendingState`宣告處補一段註解記錄根因，避免未來新增動作時重蹈覆轍。

**其餘`Script.html`發現(記錄不動手)**：①`buildClientState_`回傳的`mapDesc`欄位在`_state`裡從未被`applyClientState`讀取(唯一消費者是`actionMove`自己回應的同名欄位，跟`_state`無關)——純死欄位，計算成本低(複用已經查過的`currentMapInfo`)，不影響任何行為；②`update_rel_tag`列在`STATE_AFTER_ACTIONS`裡，但唯一呼叫端(`Script_Kanshou.html`)只會用`KPC_`開頭的pcId呼叫，`STATE_AFTER_ACTIONS`的閘門要求`PC_`開頭——這個項目目前永遠不會真的觸發交棒，是清單裡一筆沒有實際效果的設定，不影響任何行為(不是bug，只是清單存在著沒用到)。

**驗證**：`bash check.sh`全過(`Script.html`內嵌JS語法檢查)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這輪只動Script.html)。純前端呼叫順序調整，不改變任何後端邏輯/數值，headless環境無法實機驗證前端行為，建議部署後測試：①相處/令咒/結盟/破戒奪僕/設陣地/絕地反擊/召喚海怪/戰鬥等動作操作起來應該明顯更跟手(連續按下一個動作時，前一個動作的敘事文字跑出來後不應該再看到明顯的「又等一下」的卡頓)，且畫面狀態(HP/MP/位置/羈絆等)更新時機應該不變，只是不再靜默多繞一趟。

## 17. 第四輪稽核：`narrate()`吃`__pendingState`同款bug漏抓3處＋鑑賞面板快取失效缺口(2026-07 玩家「不能一次搞定嗎…再去找！！肯定還有問題」)

上一輪(§16)修完11處`narrate()`先於`syncData()`的呼叫順序bug後，玩家對「修完又冒新問題」明確表達不滿、要求繼續找。這輪不做泛用重新稽核，而是派agent**專門針對同一個bug形狀重新地毯式搜**(而非另開新範圍)，逐一列出`Script.html`裡每一處`narrate(`呼叫並分類確認，結果：§16那輪的11處修對了，但**漏抓3處**同款bug——`rest()`(休息)、`scout()`(偵查)、`scavenge()`(搜索)，這3個handler原本也是「先`narrate()`後`syncData(true)`」的錯誤順序，同樣會讓`narrate()`內部的`gasRun`把還沒被消費的`__pendingState`洗掉，逼前端多繞一趟本可省略的sync round-trip。**動手**：3處都改成`syncData(true)`在前、`narrate(...)`在後(跟§16那11處手法完全一致)。

**這輪的關鍵差異：不只修bug，還做了窮舉式收尾驗證**——重新grep`Script.html`裡**全部**19處`narrate(`出現點(含純註解的3處)，逐一分類確認剩下沒改的都真的安全：①`travelTo()`的`narrate`呼叫——這個函式整個只呼叫一次`gasRun`(移動本身)，從頭到尾沒有呼叫`syncData()`，沒有`__pendingState`消費動作可以被洗掉，天生不受影響；②`handleDefeat`/`handleVictory`裡的`res.dreamPrompt`呼叫——這兩個函式永遠是在呼叫端已經執行完`syncData(true)`之後才被`await`呼叫(檢查了全部呼叫端)，且這兩個函式自己不呼叫`syncData()`，沒有時序反轉的空間。確認這個bug類別到此**沒有第4處**遺漏。

**`Router_Persona.gs`：`servantCard_`的`toM`備援解析分隔符跟同檔姊妹函式不一致(LOW severity，純一致性非行為bug)**：`toM = p.toMaster || (mem.match(/對御主：([^｜【]*)/) || [])[1] || ""`只排除全形`｜`跟`【`，同檔`getPersonaSpeech_`/`getPersonaTic_`(11-12行)排的是`[^｜|【]`(全形+半形pipe都排)。現況全代碼庫沒有任何MEMORY寫入者用過半形`|`，兩種寫法行為完全相同，**動手**只是把`toM`那行也改成`[^｜|【]`跟姊妹函式對齊，避免未來萬一有人手動塞了半形`|`進MEMORY時這行變成唯一漏網的。同檔其餘3個發現(孤兒註解、`quadLabeled_`位置切割脆弱性、`servantCard_`瘋狂偵測正則的理論邊界情況)皆記錄不動手，皆LOW/理論性。

**`Script_Kanshou.html`/`Script_Onboarding.html`深度複查**：
- **`allKnownNames`死欄位(HIGH confidence)**：`Gallery.gs`的`actionPlay`(鑑賞每則訊息都會走)每次都把**整張「鑑賞眾生」表**過濾+映射成一個名字陣列塞進回應，全代碼庫(`grep -rn "allKnownNames" *.html *.gs`)只有這一處寫入、**沒有任何前端讀取者**——整表掃描+序列化的成本，鑑賞每傳一則訊息就白付一次。**動手**：直接刪掉這個欄位(連同上面過期的中文註解「將全部活著的眾生名單傳給前端，用於三段式判定」一併清，那個「三段式判定」機制顯然已經改掉不再需要這份名單，只是欄位沒有跟著砍)。
- **`claimHero()`漏做鑑賞英靈庫快取失效(MEDIUM confidence)**：`Script_Kanshou.html`的同伴面板把`get_heroes`結果快取在分頁工作階段內(`_kcHeroesCacheReady`)，明文說好「英靈庫只有工房鑄造/修改會變」才需要呼叫`invalidateKanshouHeroCache()`讓快取失效——`summonByForge()`(鑄造/修改)有正確呼叫，但`claimHero()`(認領無主原創英靈，同樣會寫`COL.HERO.PERSONA`的`creator`欄，而`creator`正是鑑賞面板判斷「這隻ai_gen英靈能不能被目前帳號召喚」的依據)漏了。可達路徑：同一帳號開兩個分頁，分頁A先進鑑賞開過同伴面板(快取已就緒)，分頁B去帳號選單認領一隻原創英靈，回到分頁A(沒重新整理)再開同伴面板，還是看不到剛認領的英靈可以召喚，得整頁重整才會消失。**動手**：`claimHero()`成功分支比照`summonByForge()`補一行`invalidateKanshouHeroCache()`呼叫(帶`typeof`守衛，跟`summonByForge()`那行完全同款寫法)。
- 其餘發現(busy-guard缺口、`kanshou_*`系列動作本來就吃不到`_state`交棒機制、`enterKanshou()`的`finally{endAction()}`提前釋放忙碌旗標)皆確認有後端`ScriptLock`或既有慣例兜底、LOW severity/純資訊性，記錄不動手。

**`Account.gs`重新複查**：確認§前次已修的`DEAD_`前綴查找漏洞(`rid === charId || rid === "DEAD_" + charId"`)現況仍然生效(`git diff HEAD`該檔為空)，且獨立重新推導後**優先度應該上修**——這不只是防禦性補強，是真的能被合法多分頁情境觸發的資源洩漏(分頁A的角色死亡、分頁B停在較舊的`scr-menu`快取直接發`account_new_game`，沒有這條修正的話該局的孤兒列永遠不會被清)。其餘複查範圍(帳號跨局串接、`purge_orphans`時序、鎖機制)沒有找到新的bug，一項`purge_orphans`時序小瑕疵(死亡到下次登入之間的窄窗口內清孤兒列可能提早清掉，但前端UI唯一按鈕的路徑已被`accountLogin()`的既有清理擋住，摸不到)記錄不動手。

**驗證**：`bash check.sh`全過(4個修改檔案：`Gallery.gs`/`Router_Persona.gs`/`Script.html`/`Script_Onboarding.html`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(`Gallery.gs`這次的改動只刪了`allKnownNames`回傳欄位，離`nsfwBaseRules`很遠，已核實非誤傷)。**這輪的方法論收穫**：對「找到並修好N處同款bug」的稽核結果，不能假設N就是全部——用「專門重新地毯式搜同一個bug形狀」的agent、加上人工窮舉每一處符合該形狀的呼叫點逐一分類確認，才抓到§16遺漏的3處；這個「窮舉式收尾驗證」步驟往後任何pattern-based修正都應該比照做，而不是找到几处就收工。

## 18. 建立全函式工具書＋清死碼(2026-07 玩家「整理全部說明！沒用到移除！建立工具書！理解每個函數的功能！」)

派13個並行agent逐檔案(全部23個`.gs`/`.html`、14,718行)地毯式讀完每個函式：①實讀函式本體寫一句話用途 ②全repo grep找呼叫點(含onclick字串/ActionRouter dispatch表登記/動態template-literal產生的onclick) ③零呼叫點才標死碼候選。所有死碼候選我本人逐一重新讀源碼獨立驗證(不盲信agent報告)後才動手，成果彙整成新檔`FUNCTION_MANUAL.md`(全專案逐函式清單，含ActionRouter完整51項對照表)，`HANDBOOK.md`§4與`CLAUDE.md`開工必讀清單同步補上這份文件的入口。

**動手移除的真死碼(共4類，皆獨立驗證後確認零呼叫)**：
1. `Mystic_Code.gs`的`rollMysticForMaster_`+`pickByTier_`——2026-07創角改玩家自選後零呼叫，程式碼自己註解承認「保留給未來掉落用途」，屬於為假設性未來需求寫的死碼(`MYSTIC_CODES`各項殘留的`tier`欄位保留原樣未動，只改註解說明現已無消費端，不影響資料格式)。
2. `Setup_FateWorld.gs`的`setupFateWorld`(GAS編輯器手動執行包裝)——零呼叫，功能與`actionCheckSheets`(前端按鈕版，2026-07新增)完全重疊，後者已完整取代前者。
3. `Seed_Codex.gs`的`seedFateCodex()`(無底線版，GAS編輯器手動執行包裝)——零呼叫，其功能(灌種子)已透過`ensureFateSheets_`→`seedFateCodex_`(有底線版)在每次開網頁/每個action呼叫時自動執行，手動包裝完全冗餘。
4. `Gallery.gs`回應payload死欄位(computed-but-never-consumed，同上一輪`allKnownNames`同類型，共5個)：`actionKanshouSummonHero`的`isNew`、`actionEnterKanshou`的`resumed`(3處賦值)、`actionKanshouCompanions`的`available`(恆空陣列)、`actionEndRun`的`cls`、`actionPlay`的`myItemNames`(恆空陣列)——全部grep確認全repo無任何`.html`消費端，予以移除。

**刻意保留、未移除的零呼叫函式**：`Setup_FateWorld.gs`的`removeAllTriggers()`——這是給人在Apps Script編輯器手動執行一次的專案觸發器清理工具，其存在意義與「被程式碼呼叫」無關(GAS觸發器設定獨立於程式碼本身)，零呼叫點是這類工具的正常型態，不是死碼，不動。

**記錄不動手的重複/重構候選(7組，皆有真實呼叫、非死碼，僅記錄供未來參考，詳見`FUNCTION_MANUAL.md`文末附錄)**：MEMORY get/set/clear手寫正則家族(Router_Battle.gs六組+Router_Movement.gs兩組+Core_Settings.gs五組)、Script.html七個action handler共享同一套confirm→beginAction→gasRun→syncData→narrate→endAction樣板、manaSetOutput與setServantOutput同一action兩個UI入口、sanitizeSix_與parseForgeBuild_內inline六圍驗證兩份平行實作、upgradeCodexPersonas_與upgradeMasterCodex_結構鏡射、getGameHistory與getGameHistoryBatchRaw邏輯幾乎一致只差輸出格式、gobVolley_與chainVolley_彈幕公式邏輯相同僅顆數不同。這些都是「有用但可精簡」，跟真死碼(零呼叫)是兩回事，這輪只處理後者。

**驗證**：`bash check.sh`全過(6個修改檔案：`Gallery.gs`/`Mystic_Code.gs`/`Setup_FateWorld.gs`/`Seed_Codex.gs`＋文件`HANDBOOK.md`/`CLAUDE.md`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(Gallery.gs這次只刪5個死欄位，皆離nsfwBaseRules很遠，已核實非誤傷)；額外`grep -rn "rollMysticForMaster_\|pickByTier_\|\bsetupFateWorld\b\|seedFateCodex()"`確認全repo無殘留呼叫端。純刪除已確認零呼叫的函式/欄位，不改變任何現存行為，headless環境可完全靜態驗證(不需部署後實機測試)。

## 19. 鑑賞「出門走走」巧遇系統的男男配對漏洞(2026-07 玩家「我不想要看到男男...他們只有正常友情交流」)

**根因**：`actionKanshouSummonHero`(Gallery.gs:352-354)跟`actionKanshouSetSex`(606-610)兩處都明確擋了「僅支援男女／女女配對」——但那兩道防線只守**同行同伴**的邀請/性別切換路徑。2026-07任務#40新增的「出門走走」隨機巧遇系統(`kanshouRollEncounter_`/`KANSHOU_MALE_HERO_IDS_`)走的是完全不同的程式路徑：巧遇對象不邀入隊伍(不經過`actionKanshouSummonHero`)、也不受`actionKanshouSetSex`管——`kanshouEncounterStr`(actionPlay內，約1150行)組出的提示詞原本只寫「允許TA以真實姓名登場、持續互動」，沒有任何性別關係限制。`KANSHOU_MALE_HERO_IDS_`池全員皆男性，若玩家御主性別是男，巧遇到的就一定是男性——這正是既有男男配對防線之外的漏網之魚，玩家在「出門走走」/「問還有誰」這兩個巧遇入口都會踩到。

**動手**：`kanshouEncounterStr`組裝時新增判斷`String(pc[COL.PC.SEX])==="男" && String(kanshouEncounterHero.gender)==="男"`，成立則額外附加一句「TA與玩家同為男性，這段交流僅止於同性情誼／夥伴／損友式互動，不發展曖昧、戀愛或情慾內容，不做任何親密肢體接觸」明確指令。因為這段字串是`actionPlay`每回合重新組裝(非持久化狀態)，對已經觸發過的舊巧遇(存在MEMORY【邂逅中】)同樣會在下一句對話立即套用，不需要玩家重新觸發巧遇或换地點。

**未動的部分**：`genderHintStr`(1083行區)的「女女配對」/「其餘依實際性別自然互動」兩桶邏輯本身不用改——它只掃`presentRowsForGender`(真正的同行隊伍pcData列)，巧遇對象走的是`kanshouEncounterHero`這個獨立變數(來自`SEED_SERVANTS`，非pcData列)，兩套機制原本就不交集，不需要合併處理。

**驗證**：`bash check.sh`全過(1個修改檔案：`Gallery.gs`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這次改動只動`actionPlay`內`kanshouEncounterStr`組裝那幾行，離`nsfwBaseRules`本體很遠)。純prompt層級加一句限定指令，不改變資料結構/MEMORY格式，headless環境無法實機驗證AI是否真的遵守這句新指令，建議部署後測試：男御主在「出門走走」任一地點觸發巧遇(或對已有【邂逅中】的舊局說話)，確認巧遇對象的互動維持在朋友向，不出現曖昧/親密走向；女御主巧遇同一批男性角色應維持原本不受影響的正常互動。

## 20. 鑑賞「沒點火」時常被誤切成另一個模組(2026-07 玩家「沒點火時候模組是不是太容易切換了？？我都是正常內容怎麼回一直換成另外一個」)

**根因**：`actionPlay`(Gallery.gs約1214行)組`aiConfig`時，`driveOn=false`(矜持模式/沒點火)走輕量`SOLO_MODEL`、失敗才靜默`fallbackModel`切`AI_MODEL`(既有設計，見§前次記錄)。但`isNsfwMode:true`讓`callGeminiAPI`(Engine_Combat.gs)套用預設`max_tokens=1000`——這個數字是先前「加快鑑賞速度」那輪從2600逐步砍到1000時定的，卻沒人回頭核對過跟同一份提示詞裡`finalJson`要求的`narration`目標(約500字中文)搭不搭得起來：中文500字換算token數常態逼近甚至超過1000，加上同一份JSON還要塞`inner_monologue`(約50字)、每位在場角色一份`physical_state`、`rel_changes`等其餘欄位，SOLO_MODEL常態性被max_tokens硬切斷、吐出不完整JSON——`callGeminiAPI`裡`JSON.parse(text)`對截斷的JSON會直接拋錯，這個錯誤**不是**"Triggered_NSFW_Filter"(那個只在真的審查攔截/message為空時才觸發)，只是普通例外，走一般重試路徑；`retries:2`兩次都因為同樣的截斷問題失敗後，`attemptWithModel_`回傳`null`，外層就靜默換成`fallbackModel`(AI_MODEL)重打一輪。**玩家體感**：明明打的是完全正常的日常對話，卻常常「換了一個模組」(其實是換了模型)——根本原因是token預算擠壓造成的格式失敗，跟內容有沒有踩審查完全無關，只是恰好被同一套「攔截才切換」的邏輯當成同一類事件處理。

**動手**：`aiConfig`在`!driveOn`分支多設一行`max_tokens: 1500`，把「沒點火」(SOLO_MODEL)這條路徑的預算調回上一版「先降到1500」時的數值(那個版本沒回報過這個症狀)；`driveOn=true`(點火，直接用`AI_MODEL`)維持`isNsfwMode`預設的1000不動，因為點火路徑沒人反映過這個問題(AI_MODEL本身把500字塞進1000 tokens的餘裕顯然比SOLO_MODEL大)。

**記錄不動手**：`callGeminiAPI`把「真審查攔截」跟「純格式/截斷失敗」都算進同一個retry/fallback邏輯，理論上可以拆成兩種不同處理(只有真攔截才切模型、格式失敗應該原地重試同一顆模型)，但這是更大範圍的重構，這次先用「調高預算讓截斷本身不要發生」的根源解法處理，不動這段共用邏輯的整體設計。

**驗證**：`bash check.sh`全過(1個修改檔案：`Gallery.gs`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這次改動只加一行`max_tokens`設定，不碰`nsfwBaseRules`本體)。純數值調整，不改變任何邏輯分支，headless環境無法實機驗證token數是否真的夠用，建議部署後測試：鑑賞「沒點火」模式下連續進行多輪正常日常對話，觀察是否還會出現「文風突然變得不像原本模型」的情形（AI_MODEL/DeepSeek跟SOLO_MODEL的敘事風格通常有可辨識差異），次數應明顯減少；若仍常發生，代表根因除了token截斷外可能還有SOLO_MODEL本身在鑑賞這種NSFW鄰近語境下更容易觸發真審查，需要再進一步調查。

**追加**：玩家當場追加「那點火也調整到1500！」——上面§20原本只調`!driveOn`(沒點火/SOLO_MODEL)分支，`driveOn=true`(點火/AI_MODEL)維持`isNsfwMode`預設1000沒動，理由是「沒回報過症狀」；但截斷風險的根本算式(narration約500字+inner_monologue+physical_state等)是model-agnostic的，AI_MODEL一樣可能被同一份1000上限卡到，只是還沒被抱怨過不代表沒發生(也可能AI_MODEL失敗後沒有下一顆模型可逃生、直接吐柔性失敗訊息，玩家體感是「偶爾失敗」而非「換模組」，比較不容易被歸因到同一根因)。**動手**：`aiConfig`初始化直接帶`max_tokens:1500`(兩條路徑共用同一個值)，拿掉原本只在`!driveOn`分支才加的寫法，改成`if(!driveOn) aiConfig.fallbackModel = AI_MODEL;`只留設定`fallbackModel`這件事(driveOn=true本就不需要fallback，這點沒變)。

## 21. 慾海`physical_state`(狀態欄)15字上限造成常態腰斬(2026-07 玩家「狀態現在幾個字？好像一直被切斷」)

**根因**：`physical_state`(顏面神情＋衣裝狀態合併欄，§前次「肉體欄位砍併」的產物)在2026-07被玩家進一步收斂成「15字內」，`buildDefaultSystemPrompt`的`_physicalState`提示詞字面要求AI自律守住15字，`Router_Narrative.gs`寫回前另有一道`sanitizePhysicalState`(Gallery.gs約1340行)硬`slice(0,15)`防呆——雙重把關，但15字對中文「顏面神情＋衣裝狀態」兩件事來說本來就偏緊，AI稍微多寫幾個字就會被這道硬slice從第15字截斷在句意中間，玩家體感即「狀態好像一直被切斷」。這不是bug（提示詞與防呆slice數值本就一致、沒有互相矛盾），純粹是先前收斂時定的15字上限對這個合併後的兩合一欄位太緊。

**動手**（玩家選項：放寬到25字）：4處數字同步從15改25——①`_physicalState`提示詞字面(約668行)；②`intimacy_feedback._note`提示詞(約701行)；③慾海律令第5條`specificRules`文字(約792行)；④`sanitizePhysicalState`的硬`slice(0,15)`防呆(約1342行)。**刻意不動**：慾海律令第7條`attitude`(NPC臨場態度欄)同樣寫著`≤15字`，但這是完全獨立的欄位(態度 vs 顏面神情/衣裝狀態)，玩家這次只反映「狀態」被切斷，沒提到`attitude`，不在此次收斂範圍內、原樣保留15字。

**驗證**：`bash check.sh`全過(1個修改檔案：`Gallery.gs`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這次改動只調整`physical_state`欄位的字數上限，4處皆為純數字替換，離`nsfwBaseRules`本體很遠)。純數值調整，不改變任何邏輯分支/資料結構，headless環境無法實機驗證AI輸出長度分布，建議部署後測試：鑑賞連續對話觀察「狀態」欄位是否還會出現明顯斷在句意中間的情形(如「困惑地」這種缺主詞/缺動詞的殘句)，次數應明顯減少；若仍常被切斷，代表AI實際輸出長度可能經常超過25字，需再往上調或考慮改回不設字數硬上限、只靠提示詞自律。

## 22. 慾海同行夥伴「關係」標籤方向不明確，AI偶爾把主從演反(2026-07 玩家「有時候我變成npc的從者？！」)

**根因**：`actionPlay`組`partyDetailsArr`(Gallery.gs約1074行，餵給AI的「目前同行隊伍成員命格詳情」)原本把每位同伴的`COL.PC.REL_TAG`直接接成「關係:${tag}」——例如關係標籤維持預設值「從者」時，這行讀作「關係:從者」。這串文字對AI而言方向不明確：既可能被正確理解為「這份關係定位是『TA是你的從者』」(REL_TAG欄位本身的定義，見`Core_Settings.gs`COL.PC註解「這名NPC對本世界御主的關係」)，也可能被誤讀成單純描述這名角色的身分/職階(Fate裡「從者」本來就是一種存在類別的名稱)，沒有明講「相對於誰」。玩家反映「標籤沒改過仍是預設的『從者』，AI卻偶爾把場景寫成玩家服侍/服從NPC的一方」——經確認排除「玩家自己把關係標籤改成別的字」這個可能性(玩家確認未曾用🏷️關係鈕更動過)，屬於提示詞字面方向歧義導致AI偶發誤讀/演反的bug，非玩家操作或AI審查問題。

**動手**：`partyDetailsArr`那行的「關係:${tag}」改成「關係:TA是你的${tag}」，把REL_TAG欄位原本就有的方向性(TA相對於你)明講進提示詞字面，不再讓AI自行猜測「從者」兩字是指身分還是關係方向。**刻意不動**：①面板顯示層(`Script_Kanshou.html`的`renderKcPartyList_`「關係:X」)是純UI文字，玩家自己看得懂方向、不影響AI，不需要改；②`Core_Settings.gs`的`localPeopleList`(`relTag: r[COL.PC.REL_TAG]`，供solo「附近人物」前端顯示)是資料欄位而非直接餵給AI的prompt字串，另一條路徑，這次不動；③`update_rel_tag`本身允許玩家自由填任何字(含「主人」等反轉關係的字)是既有設計，玩家若真的自己改成反轉方向的標籤、AI照著演不算bug，這次只修「標籤沒改、AI卻誤讀方向」這個情境。

**驗證**：`bash check.sh`全過(1個修改檔案：`Gallery.gs`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這次改動只在`partyDetailsArr`那行插入「TA是你的」5個字，離`nsfwBaseRules`本體很遠)。純prompt字面調整，不改變資料結構/REL_TAG欄位定義，headless環境無法實機驗證AI是否真的不再演反，建議部署後測試：關係標籤維持預設「從者」的同伴連續對話數輪，觀察是否還會出現玩家被要求服從/服侍該同伴的反轉演出，次數應明顯減少；若仍偶發，可能還需在慾海律令裡額外補一條「不可翻轉御主/從者主從方向」的明文禁止規則。

## 23. solo側同類根因：`servantCard_`通用卡的「對御主」欄位同樣方向不明確(2026-07 玩家「整個solo在確認一次！！！」)

上一則(§22)修完鑑賞的關係標籤方向bug後，玩家要求把整個solo模式(戰鬥/移動/結盟/羈絆等所有會餵AI的提示詞)比照重新徹查一次同款bug形狀。派一個agent地毯式複查`Router_Battle.gs`/`Router_Movement.gs`/`Router_Bond.gs`/`Router_Economy.gs`/`Router_Creation.gs`/`Router_Persona.gs`/`Engine_Fate.gs`/`Core_Settings.gs`/`Router_Narrative.gs`/`Time_World.gs`/`Seed_Rivals.gs`/`Script.html`，我再對每一項高信度發現親自讀原始碼驗證(不盲信agent報告，直接讀`Router_Persona.gs`/`Router_Narrative.gs`/`Router_Bond.gs`/`Router_Battle.gs`/`Router_Movement.gs`/`Script.html`原文核對)。

**根因**：`Router_Persona.gs`的`servantCard_(row)`是通用「從者演出依據卡」——我方從者/敵從者/盟友從者共用同一份函式與同一套欄位，其中`toM`(對御主的忠誠態度flavor text，如「絕對忠誠，渴望堂堂正正之戰」、「盡忠職守、初期保持距離，逐漸動搖」，種子資料存在`Seed_Codex.gs`/`Seed_Rivals.gs`的`persona.toMaster`)套進卡片字面「對御主：${toM}」——跟鑑賞那次的bug形狀完全一樣：字面沒講清楚「對誰的御主」。而`Router_Narrative.gs`的`miniSystem`(每次narration呼叫最前面都會送)明講「玩家＝御主」，兩相結合，AI在讀到敵方/盟友從者卡片裡的「對御主：絕對忠誠」時，有可能誤讀成「對玩家忠誠」而非「對TA自己那位（敵方）御主忠誠」——尤其`Router_Bond.gs`的`actionProposeAlliance`(結盟提議成功·275行)與`actionAllyBond`(盟友相伴·410行)兩處，servantCard_前完全沒有任何標籤或前置句子鋪陳「這是誰的從者」，是風險最高的零上下文呼叫點(親自讀原始碼確認：275行`aiPrompt = servantCard_(...) + ...`、410行`allyCard = ... : servantCard_(pcData[aIdx])`，兩處後面接的說明句都是在卡片之後才出現)。其餘呼叫點(`Router_Battle.gs`敵方出戰卡/`Router_Movement.gs`追兵·夜襲卡)雖然risk較低，但也都各自靠呼叫端手動加的`〔敵方出戰者〕`/`〔夜襲者〕`括號標籤才勉強擋住，不是從根源解決、且不保證未來新增呼叫點會記得加標籤。

**動手**（根源解，一次修好全部~9處呼叫端，不逐一補標籤）：
1. `Router_Persona.gs`：`servantCard_`卡片字面「對御主：${toM}」改成「對自己御主的態度：${toM}」——「自己」二字消除方向歧義，不論套在我方/敵方/盟友從者身上語意都正確(「對自己御主的態度」對我方從者=對玩家、對敵方從者=對敵御主，兩種情況原句都成立，不需要依呼叫端分岔處理)。同步把讀回MEMORY舊格式的正則`/對御主：/`放寬成`/對(?:自己)?御主：/`，向下相容尚未觸發此函式重新生成、仍存著舊版「對御主：」字樣的既有存檔資料。
2. `Router_Bond.gs`：兩處零上下文呼叫點(`actionProposeAlliance`結盟提議、`actionAllyBond`盟友相伴的`!allyIsMaster`分支)補上`〔敵御主之從者〕`/`〔盟友從者〕`括號標籤，跟`Router_Battle.gs`/`Router_Movement.gs`既有慣例一致——這是額外的一致性/防禦性補強，欄位本身已消歧義後其實不是必要，但既然發現這兩處是整批呼叫端裡唯一沒有這層防護的，順手補齊，不留這種「大家都有、只有這兩處沒有」的不一致。

**記錄不動手**（agent同時發現、非本次bug範疇的次要觀察）：`Router_Bond.gs`的`actionRuleBreakSteal`(破戒奪僕)易主後只清了`【御主】`硬連結標記，沒有一併清除/重新生成MEMORY裡舊的「對御主：X」flavor text——這是**內容過期**問題(從者易主後，卡片仍描述其對「原(已失去的)敵御主」的忠誠態度)，跟這次修的**方向歧義**是不同類的bug，且怎麼重新生成新flavor text需要另外設計(找AI重新生成？還是清空退回「依真名」？)，這次先不動，留待之後專門處理。另外`getLocalPeopleList`(`Core_Settings.gs`)的`relTag`欄位經agent追蹤呼叫鏈確認：只進了前端payload(`data.people`)，`Script.html`/`Script_Onboarding.html`全文grep`relTag`零匹配，從未被任何前端邏輯讀取、更沒有機會流進AI提示詞——不是這次bug類別的問題，只是死欄位(不在本次範疇內修，記錄備查)。

**驗證**：`bash check.sh`全過(2個修改檔案：`Router_Persona.gs`/`Router_Bond.gs`，皆與`Gallery.gs`/`Engine_Combat.gs`無關)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這次完全沒碰這兩個檔案)。純prompt字面調整(欄位改名+兩處補標籤)，不改變任何資料結構/戰鬥數值/`FACTION`判定邏輯，headless環境無法實機驗證AI是否真的不再誤讀，建議部署後測試：①敵方出戰時觀察AI敘述有沒有把敵從者演成對玩家忠誠(而非對其敵御主忠誠)；②結盟提議成功、以及與盟友從者相伴時，確認AI沒有把盟友從者誤演成玩家自己的從者。

## 24. 戰鬥標籤／戰鬥運算／戰報三層一致性稽核(2026-07 玩家「戰鬥標籤和戰鬥運算 戰報 檢查！」)

派一個agent對戰鬥引擎(`Engine_Fate.gs`/`Engine_Combat.gs`/`Router_Battle.gs`/`Router_Movement.gs`/`Core_Settings.gs`)＋玩家看得到的fx說明(`Script.html`的`FX_DESC`/工房目錄)＋`tools/battle_sim`做地毯式三層對照(玩家看到的說明 vs 引擎實際算的公式 vs 戰報顯示的文字)，我再對每一項HIGH信度發現親自讀原始碼逐一驗證(直接讀`Engine_Fate.gs`公式本體、`Script.html`對應tooltip、`Router_Battle.gs`戰報組裝，不盲信agent報告)。

**確認並修好的真bug(6項，皆為純顯示修正或零風險一致性修正，不改變任何戰鬥數值/引擎行為)**：

1. **`nullify_magic`(對魔力)tooltip公式跟引擎對不上**：`Script.html`原本是死寫的線性公式「25×m%」，但`Engine_Fate.gs`實際公式是「基礎30%×階級倍率，B階以上下限55%、A階以上下限80%，上限92%」——高階時嚴重低估(A階tooltip顯示約42%，引擎實際套用80%下限)。改成tooltip直接照抄引擎的下限判斷邏輯算出同一個數字。
2. **`territory`(陣地作成)／`wall_def`(城牆防禦)tooltip是舊版寫死數字，2026-07 rank-scaling那次修正漏改**：`Engine_Fate.gs`的`DEF_FX_.territory`/`.wall_def`本身在該次修正(見`Engine_Fate.gs:342-346`原有註解)已經從寫死數字改成`r=>1-0.26*r`/`r=>1-0.18*r`隨階級縮放的函式，跟同批一起改的`rho_aias`/`home_field`的tooltip都正確更新成吃`m`參數即時算，唯獨`territory`/`wall_def`兩個tooltip還是零參數函式、寫死回傳只在C階才對的舊數值(0.74/0.82)——EX階陣地作成實際×0.48、A階×0.57，tooltip卻恆顯示×0.74，嚴重低估高階持有者的防禦力也高估低階持有者。比照`rho_aias`/`home_field`改成吃階級參數。
3. **`divine_age`(神代魔術)tooltip「使敵對魔力半效」跟引擎「僅剩三成」對不上**：`Engine_Fate.gs:854`的`red *= 0.3`(自己的行內註解也寫「效果僅剩三成」)，tooltip卻寫「半效」——凌駕幅度比tooltip講的更強，改成「僅剩三成效力」對齊。
4. **`god_slay`(神殺)tooltip的乘數範圍「×1.3〜1.83」跟引擎自己的註解「E→1.17、C→1.5、B→1.67、A→1.83、EX→2.0」兩端都對不上**：低估了E階最低值(1.17非1.3)跟EX階最高值(2.0非1.83，1.83其實只是A階中段值)。同一份`FX_DESC`裡`divine`那條(神性持有者被神殺剋的說明)也有同款錯誤範圍，一併修正。
5. **戰報UI對「原初符文回血／海怪肉身再生／海怪魔力枯竭退場」這3種strike無條件套用命中/迴避骰值模板**：`Router_Battle.gs`這3處(約832/848/868行)push進`rl.strikes`的物件只帶`{by,pHit:false,pDmg:0,note}`，沒有`pHitVal`/`pRoll`/`dEvaVal`/`dRoll`，但`Script.html`的戰報渲染(約1758行)無條件對每個strike套「命中 &lt;pHitVal&gt; 🎲&lt;pRoll&gt; vs 迴避 &lt;dEvaVal&gt; 🎲&lt;dRoll&gt;」模板——JS字串插值把`undefined`原樣接進去，玩家實際看到的是「命中 undefined 🎲undefined vs 迴避 undefined 🎲undefined」+「揮空」這種亂碼行，接在後面才是正確的note文字。改成`k.pRoll`有定義才顯示骰值那行，否則只顯示發動者名號，真正資訊交給note顯示(純UI修正，餵給AI narration的`roundsBrief`本就只讀by/pHit/pDmg/note，不受影響)。
6. **`actionSummonHorror`(戰前召喚深淵海怪)算魔力費繞過了`npEffectiveRank_`單一真實來源**：同檔其餘全部`npPranaCost_`呼叫點(425/567/575/679/926/936行，`Router_Movement.gs:127`同理)在「多寶具六波」那次重構後都改吃`npEffectiveRank_(atkC)`，唯獨這裡還直接讀`svC.six["寶具"]`。目前唯一持有`summon_horror`的青鬍子沒有多寶具分岔，兩者現值相同、無實際影響——但保持一致，避免未來這個fx被掛到某位多寶具英靈身上時這裡悄悄算錯。

**追加·已修好(玩家定案「改固定價」)**：`self_mod`(自我改造)/`tactics`(軍略)/`projection`(投影魔術)這3個fx在工房計價表(`Router_Creation.gs`的`SKILL_TRACK_`/`FLAT_FX_`)沒有被列進去，落到預設的「依階級計價」軌(E5~A25點)——但引擎(`Engine_Fate.gs`)給的實際效果是完全**不看這個fx自己的階級**的固定值(self_mod恆命中+2/傷+3；tactics恆×1.15寶具威力；projection的hit恆+2、dmgAdd只看角色NP階非projection自己的階)。等於玩家可以花25點買「A階自我改造」，但拿到的效果跟花5點買「E階」一模一樣，是真正的花錢買不到東西的計價漏洞。已跟其餘同類「引擎不讀階級」的標籤(weapon_steal/god_slay/lovespot等)對照確認——那些都正確收在`FLAT_FX_`固定價，只有這3個被漏掉。玩家選項「改固定價」(而非改引擎讓它真的隨階級縮放，那需要重跑battle_sim驗證會不會動到既有種子平衡)：`Router_Creation.gs`的`FLAT_FX_`加入`self_mod:15`(效果輕量雙屬性，比照標準單軌C階價)、`tactics:25`／`projection:25`(無條件全場寶具傷害加成／主動技+階級縮放傷害，強度比照其餘25點標籤)，`Script_Onboarding.html`的鏡射表`FORGE_FLAT_FX`同步。前端`forgeSkPts_`/階級選單disable/預算計算/晶片價格顯示("固定X點"字樣)全部單純依`FORGE_FLAT_FX`表驅動，加進表裡後UI自動跟進、不需另外改渲染邏輯(跟`weapon_steal`/`god_slay`那次上架時的既有機制完全一致)。

**驗證**：`bash check.sh`全過(4個修改檔案：`Script.html`/`Router_Battle.gs`/`Router_Creation.gs`/`Script_Onboarding.html`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這次完全沒碰這兩個檔案)。第1~5項是純tooltip文字/UI顯示修正，第6項是零風險的呼叫一致性修正(現況數值不變)，第7項(self_mod/tactics/projection固定價)只改工房**新創角**的計價表、不動引擎公式，不影響任何已存在的種子英靈或已創建角色的六圍/技能數值，不需要重跑`battle_sim`回歸測試(battle_sim的極端組合`extremes.js`名冊若有沿用這3個fx的舊角色，價格可能微幅變動，下次跑`extremes.js`時若有組合因此買不起會自動❌棄測，屬預期行為)。

**追加·玩家要求驗證新價格是否合適**：用`tools/battle_sim/engine.js`同套真實引擎(非另寫模擬器)臨時寫一支腳本(`price_check.js`，未進repo)實測——同職階(Saber vs Saber，避開職階三角相剋干擾)全C六圍素體對打，基準勝率51.9%：①`self_mod`(15點)勝率83.3%(Δ31.1pp)，跟同價位標準單軌15點C階技能(shapeshift迴避+3)的Δ31.9pp幾乎一致，計價精準。②`tactics`(25點)使寶具解放平均傷害從147.7提升到160.6(+8.7%實際輸出，非帳面15%——因為乘數只套在傷害結算的其中一段，被其餘固定加成稀釋，屬正常現象非bug)，無條件全場生效，25點合理。③`projection`(25點)若從不點⚡主動觸發，勝率幾乎無變化(Δ-0.7pp，本就該如此——不觸發就不該有效果)；若每次交鋒都點⚡主動全開，勝率跳到93.1%(Δ40.8pp)，逼近同價位頂級標準軌技能first_strike A階(25點·Δ47.6pp)——實際強度吃重「玩家有沒有認真按主動技」，且真實遊戲中主動技要抽御主魔力(此模擬未計入)，25點在合理區間。三個新固定價經數據驗證均落在既有計價梯度內，不需再調整。

## 25. solo敵方NPC背景互鬥改真實引擎結算(2026-07 玩家「敵方npc會隨機互鬥扣血」)

**根因/現狀**：`Time_World.gs`的`worldTick_`本來就有「暗處從者廝殺」機制(休息時7%機率觸發)，但實作是硬幣翻面式的——直接挑一名離場敵從者(戰力六圍階總和最低者)機率標記「瞬間死亡」，從未真的用戰鬥引擎打過一場，也不會有「掛彩但沒死」這種結果，只有死跟沒事發生兩種狀態。玩家要求「敵方npc會隨機互鬥扣血」、「gas去算就好」(不必叫AI)、「要確實扣血量」——需要真的算一場、真的扣血，不是機率骰子。

**動手（根源解，不是加特例）**：把這段改成真正用戰鬥引擎結算的雙方交鋒：
1. 從「離場敵從者」(不在玩家所在格、未死亡)裡隨機抽兩名不同陣營的離場者(而非只挑一名戰力最低者)。
2. 用`rowToCombatant_`(單一真實來源，跟`Time_World.gs`原本的靈脈/陣地計算共用同一個函式)把兩列pcData資料建成真實combatant物件(讀真實六圍/技能/寶具/當前HP，不是重新歸零)。
3. 用玩家對戰完全同一套`resolveFateBattle_`(Engine_Fate.gs)結算一次交鋒——A出擊、B存活才反擊(跟`fateStrike_`同款一來一往的單次交鋒模型，不無限回合硬打到死，貼近「世界背景事件」而非「完整戰役」的定位)，全程GAS本機計算，不叫AI。
4. 把結算出的傷害**真的**寫回兩人的HP欄(單一儲存格`getRange(...).setValue()`)——多數情況雙方只是掛彩、都還活著；只有真的把某一方打到HP見底時，才觸發跟原本「暗處殞落」同款的死亡標記(`DEAD_`前綴/STATUS更新/`markMasterLostServant_`通知其御主)，死亡從「機率骰子」變成「真打出來的結果」。
5. 風聞(`worldRumors`)措辭多樣化(玩家要求「不用太平凡」)：拆成「有死亡」與「純掛彩」兩組各3~5句模板隨機挑一句，內容走氛圍線索(魔力震盪/寶具氣息/靈基波動等)而非戰報數字，不洩漏勝方是誰(維持「風聞」該有的模糊神秘感，玩家不在場、不該看到精確交戰細節)；有死亡才點名罹難者姓名，純掛彩則完全不具名(貼合「這只是遠方傳來的隱約消息」的世界觀定位)。

**刻意不動**：①觸發機率沿用原本的7%(這是既有已測試過的死亡發生節奏，換成真實引擎結算後大部分觸發只是掛彩不死人，若日後覺得太少/太多可以再調——這是最容易的調整旋鈕，先保守沿用原值)；②單次交鋒模型(A打一下、B反擊一下)而非多回合打到死——這樣兩個陣營可能要經過好幾次世界推進(好幾次玩家休息)才會有一方真正倒下，累積式消耗比一次性打死更貼近「背景戰事持續進行」的氛圍，也避免單次觸發就團滅一整個陣營的失控風險；③`WORLD_FLOOR_`(世界自走永遠保留4名敵從者)/`ATTRITION_START_DAY`(開戰前3日不減員)兩道既有護欄原封不動，機制設計精神不變，只換掉核心結算方式；④移除了舊版「戰力(六圍階總和)最低者優先死」的預選邏輯——這在真實引擎結算下已無必要，弱者本來就在真實戰鬥數學裡更容易輸，不需要另外用程式碼強制"弱者先死"。

**驗證**：`bash check.sh`全過(1個修改檔案：`Time_World.gs`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這次完全沒碰這兩個檔案)。核對`resolveFateBattle_(atk,def,opts)`簽名確認`opts=opts||{}`防呆完整、空物件呼叫安全(跟`tools/battle_sim/duel.js`既有呼叫模式一致，只是那邊多傳一個`round`——這裡省略、預設等同「每次都當第一回合」，對持有燕返(tsubame)這類「僅首回合生效」標籤的離場npc是個小小簡化，但因為背景互鬥本就只是單次交鋒、不是連續多回合戰役，這個簡化影響輕微)。headless環境無法真的觸發休息推進世界時間來實機驗證，建議部署後測試：多次休息推進世界時間，觀察風聞欄位是否開始出現新的「掛彩但未死」措辭多樣的訊息，以及原本的死亡風聞是否仍會發生(只是死因現在是真打出來的，不是骰子)。

## 26. solo提示詞把「共用魔力池」寫成「御主的魔力」，從者演出對魔力見底無感(2026-07 玩家「從者都覺得那是御主的魔力從者沒有影響的說話方式 超級怪！！！」)

**根因**：solo的核心遊戲機制是「從者【沒有自有魔力池】，御主MP是御主與從者共用的唯一魔力資源」(`Core_Settings.gs`的`masterPoolMax_`/`Time_World.gs`的`applyRegen_`——魔力見底時是**御主**被動燃血(缺口÷2)、從者不扣血，但令咒耗盡或御主陣亡時從者會走向「靈基透支」倒數消滅，`Script.html`的`solo`(單獨行動)fx說明卡本身就寫著「御主陣亡／令咒耗盡時免『靈基透支』倒數消滅」，確認了玩家講的「無魔力→御主扣血→御主死亡→從者死亡」這條因果鏈本就是遊戲設計)。但`Router_Narrative.gs`的`narrateWithState_`(★solo**全部**narration呼叫的唯一共用管道——不管是對話、休息、戰鬥戰報，`Script.html`所有`narrate()`呼叫最終都導到這條路徑)每回合餵給AI的「當前狀態」行原本寫「御主 HP X/Y·魔力 X/Y」——字面上把魔力講成掛在「御主」名下的個人數值，隻字未提這是共用池、從者也靠這池活著。AI收到的字面資訊就是「這是御主的東西」，難怪演出時從者對魔力見底表現得事不關己——不是AI亂演，是餵給它的事實本身就講錯了誰的魔力。

**動手（根源解，改在solo唯一的狀態注入點，一次修好所有narration呼叫）**：
1. `Router_Narrative.gs`的`stateBrief`：「魔力」→「共用魔力池(從者無自有魔力、皆賴此維生)」，每回合都明講方向，不再讓AI自己猜。
2. `Core_Settings.gs`的`buildTrajectoryDigest_`：仿照既有「從者剛歷經惡戰、氣血未復」(HP<30%才觸發的條件式警訊)同款手法，補一條「魔力池<20%才觸發」的條件式警訊「共用魔力池告急——這是從者自己的存亡危機、並非只是御主的事」，在真正告急的當下明確提醒AI這件事對從者而言性命攸關，不只是背景數字。

**驗證**：`bash check.sh`全過(2個修改檔案：`Router_Narrative.gs`/`Core_Settings.gs`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這次完全沒碰這兩個檔案，且鑑賞`Gallery.gs`的`actionPlay`本來就沒有MP機制、不受影響，這次修正純solo專屬)。純prompt字面調整，不改變任何資料結構/魔力計算公式，headless環境無法實機驗證AI演出是否真的改善，建議部署後測試：刻意把御主魔力耗到低量(連續解放寶具/補魔不足)，觀察從者對話中是否會開始表現出「這也是我的性命」的關切語氣，而非把魔力見底當成跟自己無關的旁支話題。

## 27. 令咒鈕挪去御主卡＋從者卡新增「靈基修復」常態療傷手段(2026-07 玩家「把令咒移動到御主卡片區域／原本從者令咒改成靈基修復（消費魔力將從者血量回覆比率你決定）」)

**需求拆解**：兩件事。① 從者卡動作列原本的「❖ 令咒」鈕(開`openSealMenu()`)，玩家覺得令咒是御主的絕對命令權，該擺在御主卡而非從者卡——搬過去。② 從者卡騰出來的欄位改放全新的「🩹 靈基修復」：消費共用魔力池、回復從者部分氣血，不燃令咒(有別於既有令咒選單裡那個一次性全滿版)、可重複使用，回復比率由我方決定。

**① 令咒鈕搬家**：`Script.html`的御主卡區塊(非鑑賞分支，鑑賞本就不露血量/魔力/令咒)原本只有一行靜態`<div>令咒 ❖❖❖❖</div>`計數顯示，改成`<button onclick="...openSealMenu()">`——內容/位置(HP/MP條後面)不變，只是從純文字變成可點。從者卡動作列原本那顆`❖ 令咒`按鈕整個移除。

**② 新增靈基修復（`actionSpiritRepair`，`Router_Economy.gs`，緊接在`actionManaSupply`後面）**：
- 設計理由：跟既有「補魔」(硬擠迴路回滿池、但永久斷血量上限/迴路)、「令咒·絕對修復」(耗令咒、一次性雙方全滿)兩個既有選項區隔——靈基修復要的是「常態、可重複、有取捨但無永久代價」的中間選項，代價是**當下**魔力池(拿去打副本的資源)，不是永久屬性。
- 公式(`REPAIR_MP_COST_PCT`=0.40／`REPAIR_HEAL_PCT`=0.35，寫在函式頂端當單一真實來源常數)：消費共用魔力池上限的40%(不足則無法發動，回報「共用魔力池不足以支撐靈基修復（需X，僅剩Y）」)，回復從者上限氣血的35%(封頂，不會補過上限；已滿血則擋下「氣血已然充盈，毋須修復」)。
- 複用既有機制、不開新結算路徑：`enemyAmbushOnServant_`(卸防突襲，倍率1.3——介於`bond`的1.2與`mana_supply`的1.4之間，比照兩者已有的「開放性動作＝門戶大開」設計慣例)、`raiseBond_`(+2)、`spendAp_`(耗1AP，跟補魔/相伴同級)、`masterCard_`/`servantCard_`(演出依據卡)、`getFreshStatusString`。
- 掛線：`Router_Action.gs`的`ActionRouter`加`spirit_repair`路由；`STATE_AFTER_ACTIONS`(改動戰場狀態、前端需交棒`_state`)與`KANSHOU_BLOCKED_ACTIONS_`(solo戰鬥/魔力機制，鑑賞UI從未也不該呼叫)都比照`mana_supply`同步補上。
- 前端：`Script.html`新增`spiritRepair()`(仿`manaSupply()`結構：確認彈窗→敵蹤警告→`gasRun({action:'spirit_repair',...})`→戰報/狀態刷新/`narrate`/`handleDefeat`)。

## 28. 狂化(mad)命中/迴避懲罰與魔力維持費雙重收稅——拔除戰鬥層懲罰(2026-07 玩家「赫拉克勒斯 打不到人 是不是怪怪的」)

**回報**：玩家覺得自己召喚的赫拉克勒斯-Berserker 普攻「幾乎每次都失手」，覺得不對勁。追問後玩家給出明確診斷與決定：「狂化已經增加魔力消耗了，取消[戰鬥層]減少命中迴避的懲罰」。

**查證**：`Engine_Fate.gs`的`resolveFateBattle_`原本對持有`mad`(狂化)者扣「命中／迴避 −3×階級」(赫拉克勒斯狂化B階＝−4)，同時`Time_World.gs`的`servantEconomy_`早就對持`mad`者的每小時魔力維持費疊乘×1.5(狂化狀態更耗魔)——**同一項「狂化的代價」被收了兩次稅**：一次在經濟層(維持費)、一次在戰鬥層(命中/迴避)。用`tools/battle_sim/engine.js`實測赫拉克勒斯 vs 全C標準沙包，修正前命中率only 57.2%(遠低於玩家體感應有的近戰強者表現，疊加對手若剛好帶迴避向技能會更慘，正是「幾乎每次都失手」的根因)。

**動手（拔戰鬥層，經濟層代價維持不變）**：
1. `Engine_Fate.gs`：拔除`madA`/`madD`對`aHitFx`/`dEvaFx`的扣減(命中/迴避懲罰)，`dmgAdd +14×階`傷害加成不動；`SKILL_FX_.mad`與該處註解同步更新，說明代價已轉記在維持費。
2. 三處面向玩家/AI的說明文字同步改寫，避免講述與實際機制脫鉤：`Script.html`的`FX_DESC.mad`工具提示、`Script_Onboarding.html`的`FORGE_FX_GROUPS`目錄標籤、`Router_Creation.gs`的 AI 生成從者六圍指引(拔掉「命中懲罰由系統另計」字樣)。

**驗證**：`bash check.sh`全過(4個修改檔案：`Engine_Fate.gs`/`Script.html`/`Script_Onboarding.html`/`Router_Creation.gs`)；`tools/battle_sim`實測赫拉克勒斯 vs 全C標準沙包命中率 57.2%→73.2%(修正後不再異常低)。`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。

**留意（未動·僅記錄，玩家已回覆「先這就好」）**：對話中主動提出`mad`工房計價／Berserker`FORGE_CLS_BONUS_`+30 補正是否要重新評估——玩家答覆先不動，之後真的觀察到不平衡再說。

## 29. solo常駐「❓ 教學」鈕＋總覽卡(2026-07 玩家「solo加點新手教學？」)

**現況查證**(先派 Explore agent 查過才動手，避免跟既有教學重複)：solo 原本完全沒有教學/新手引導畫面——開局精靈(`Index.html`的`step-account`→...→`step-summon`)純粹是建角步驟，不解說任何機制；`Script.html`只有 2 個既有的「?」小教學(`showManaHelp`魔力／`showSixHelp`六圍)，且都是點開才看、非首次強制。令咒／AP／靈基出力／工房計價完全沒有任何教學入口，只能在使用當下從按鈕文字/確認彈窗片段拼湊。

**玩家決定的形式**(`AskUserQuestion`三選一：常駐總覽鈕／只補缺的「?」小提示／首次登入強制導覽)：選「常駐『怎麼玩』按鈕＋總覽卡」——不做首次強制彈窗(怕打斷節奏)，也不是逐一補散落小提示(維護成本高、玩家還是得自己拼湊全貌)，而是一個永遠找得到、一次看完全局的入口。

**實作**：
1. `Index.html`的`#topbar-solo`(solo專屬頂部三鍵列，鑑賞另有`#topbar-kanshou`不受影響)新增第4顆「❓ 教學」按鈕，呼叫`openTutorial()`。
2. `Script.html`新增`openTutorial()`，沿用既有`showHistoryOverlay`彈窗風格(比照`showManaHelp`/`showSixHelp`的`<h3>`+`line-height:1.9`排版)，濃縮 6 個新手第一局就會碰到的核心概念(各一句話「這是什麼／我為什麼要管」，不重複既有「?」教學的公式細節)：🎯目標(14天奪杯)／🔷魔力池(共用·見底燒血)／❖令咒(3道絕對命令)／⏳行動力AP(每天固定額度)／🔋靈基出力(20~100%供魔旋鈕)／⚔️戰鬥＋從者卡常用按鈕／🤝結盟。結尾註明可點畫面上的名字/圖示查更細節、教學本身隨時可從頂部重開。

**驗證**：`bash check.sh`全過(2個修改檔案：`Index.html`/`Script.html`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。純新增按鈕+彈窗函式，未改動任何既有函式/資料流，風險低；headless環境無法截圖驗證手機版4鈕排版是否過窄，部署後建議實機確認第4顆鈕在窄螢幕(320px)下文字未被擠壓換行。

**留意（未動·僅記錄供未來參考）**：`mad`在工房`ALLOWED_FX_`裡是任何職階皆可選購的標籤(非 Berserker 專屬)，計價落在「標準」軌(E5~A25)，拔除命中/迴避懲罰後它變成該價位裡**唯一零負面**的被動傷害加成(+14×階，高於同軌`crafting`的8×階，甚至高於定價更貴的「強效」軌`divine_age`的12×階)——理論上工房玩家會傾向優先買它。另外`FORGE_CLS_BONUS_`給 Berserker 職階的「狂化補正 預算+30」，原本是為了補償「狂化＝七職階唯一負資產禮物」，現在負資產那半(命中/迴避懲罰)已拔除，這筆補償的立論基礎也跟著鬆動。這兩點都还没動，需要玩家決定要不要一併處理(調`mad`計價軌／重新評估或拔除+30補正)——已在對話中提出詢問，等玩家回覆。

**命名衝突處理**：既有令咒選單(`openSealMenu`)裡本來就有一個選項叫「🩹 靈基修復」(耗令咒、雙方全滿)，跟新按鈕同名會混淆——把舊選項改名「❖ 絕對修復」並在描述補一句「效果強於靈基修復」，讓玩家看得出兩者的定位差異(強·稀缺·一次性 vs 弱·常態·可重複)。

**驗證**：`bash check.sh`全過(3個修改檔案：`Router_Economy.gs`/`Router_Action.gs`/`Script.html`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。headless環境無法實機驗證按鈕互動與AI演出，部署後建議測試：① 御主卡的令咒鈕能正常開出選單(含改名後的「絕對修復」)；② 從者卡的「靈基修復」在魔力池足夠/不足兩種情況下的訊息與扣血回血是否正確；③ 敵蹤同地時觸發卸防突襲的機率與既有補魔/相伴手感一致。

## 30. 敵御主/敵從者「登場日」機制——分批登場，不再開局全員同時上場(2026-07 玩家「現在是一次全部敵人都上場？有辦法再放人進去嗎？類似第5次金閃閃3天後出現遊蕩？佐佐木自己在柳洞寺？」)

**現況查證**(先派 Explore agent 查過)：`Seed_Rivals.gs`的`seedRivalsForGame_`開局把整場戰爭(4th/5th各7組，扣玩家扮演的那組通常剩6組)一次性全部寫進「眾生」表，全員從第1天就有固定`LOC`、可被攻擊/互動——完全沒有分批登場機制。「是否在場」判斷散落在全代碼庫約20處(`FACTION`+`GAME_ID`+`LOC`+`DEAD_`前綴的行內判斷)，並非單一函式。

**玩家決策**(兩輪`AskUserQuestion`)：① 先做通用機制、預設全部第1天登場(現行行為零改變)，玩家之後自己指定哪幾位要延後幾天登場；② 登場前1~2天要有世界風聲預告，不要完全隱藏到當天才憑空出現。

**設計**：
- **單一真實來源**：`Core_Settings.gs`新增`getArriveDay_`/`setArriveDay_`(讀寫MEMORY【登場日】N，未標記＝預設第1天，對既有存檔零影響)、`getArriveHint_`/`setArriveHint_`(選填的自訂登場提示句，存【登場提示】)、`hasArrived_(row,currentDay)`(=currentDay>=該列登場日，唯一判斷式)。
- **刻意不拿掉的一處**：`aliveEnemyServants_`(勝負判定用的剩餘敵從者總數)**完全不吃這道閘門**——未登場者仍是活著的敵人，玩家不能靠「趕在對方出現前把其他人都殺光」就提前奪杯，必須等 14 天內對方也現身、被真正解決掉才算數。這是唯一的例外，其餘同地互動/鎖定攻擊/世界自走全部要吃。
- **派 general-purpose agent 完整盤點**全代碼庫「是否在場」判斷式(~20處，橫跨6個檔案)，逐一補`hasArrived_`閘門，而非只修報告的那幾個明顯處：
  - `Core_Settings.gs`的`getLocalPeopleList`(在場清單/敘事提示詞用，含盟友情報揭露掃描)
  - `Router_Battle.gs`的`_notMeAlive`(直接攻擊的目標鎖定，防直打API繞過前端隱藏)
  - `Router_Movement.gs`：`preFoesAtTarget`(抵達態度判定)、`teleFoe`/`chaser`(撤離追擊)、`factionClash`(抵達撞見敵對互毆)、`foeCardsMove`(抵達敘事人設卡)、`enemyAmbushOnServant_`(卸防突襲共用函式，補魔/羈絆/休息/結盟/靈基修復五處呼叫端一次修好)、`buildMapNodesPayload_`(地圖敵蹤badge)
  - `Router_Bond.gs`：`actionProposeAlliance`的`_foeMasterHere`(結盟交涉)、`actionRuleBreakSteal`的目標查找(斬契奪僕)
  - `Seed_Rivals.gs`的`markRivalsSeen_`(戰爭迷霧「已偵查」標記)
  - `Time_World.gs`的`worldTick_`：敵移位、敵從者小幅自癒、暗處互鬥候選池、`refillMastersDaily_`(敵御主每日回魔)、靈基透支倒數計時——全部補閘門，未登場者不參與任何世界自走。
  - **判斷依據**：master/servant一組配對永遠共用同一個登場日(`seedRivalsForGame_`同時對兩列蓋章)，所以凡是「已通過閘門的那一方去查自己配對的另一半」的巢狀查找(斬首護衛/協同強襲/已結盟對象等)**不需要**額外補閘門——判過一次即可，這也是選擇「master+servant 共用一個登場日」而非各自獨立的理由。
- **登場預告(風聲機制)**：`worldTick_`新增一段(跟`refillMastersDaily_`同層級、每次呼叫只跑一次、不隨`rounds`重複)：尚未登場但已進入「登場前1~2天」窗口的敵從者，推播一則`〔風聞〕`——有自訂`【登場提示】`就用玩家寫的句子，沒有就退回依職階的泛用措辭(如「某道屬於『Archer』職階的強大氣息正在冬木邊緣遊蕩」)，不洩漏精確位置/天數。只觸發一次(MEMORY【已預告】旗標)，跟既有LOC/HP整欄批次寫回同一手法。

**Seed_Rivals.gs資料掛載**：`FATE_5TH_ROSTER`/`FATE_4TH_ROSTER`的roster項目可選填`arriveDay`(數字)/`arriveHint`(字串)，`seedRivalsForGame_`正史分支(4th/5th，非chaos混亂模式)偵測到就蓋章進master+servant兩列的MEMORY。**目前兩份roster尚未真正填入任何延後值**——機制已就緒但預設行為＝現行「開局全員第1天登場」，玩家提到的金閃閃3天後遊蕩/佐佐木柳洞寺等具體人物與天數安排，等玩家後續指定後再實際填入roster資料(純資料編輯，不需要再動引擎邏輯)。

**驗證**：`bash check.sh`全過(6個修改檔案：`Core_Settings.gs`/`Router_Battle.gs`/`Router_Bond.gs`/`Router_Movement.gs`/`Seed_Rivals.gs`/`Time_World.gs`)；另外用Node vm沙盒單獨測試`getArriveDay_`/`setArriveDay_`/`hasArrived_`的round-trip與邊界情況(無標記預設第1天、重複set不疊字串、跨天比較正確)，全部通過。`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。headless環境無法真正開一局驗證分批登場的實際遊玩體感，部署後建議測試：① 在roster填入一組`arriveDay:3`後開局，確認第1~2天完全查無此人(地圖/攻擊/風聲皆無)；② 第2天(登場前1天)收到風聲預告；③ 第3天起同地可正常攻擊/互動；④ 確認不影響現有存檔(未填`arriveDay`的其餘6組維持第1天全部在場的原行為)。

## 31. 5th戰爭roster實際重排：金閃閃/佐佐木補入陣容＋支援真正無御主的孤身從者(2026-07 玩家「佐佐木、金閃閃沒有御主怎麼辦....rider搭配櫻？慎二搭配金閃閃？佐佐木給他地脈標籤 無耗魔？」)

**背景**：延續§30的「登場日」機制，玩家緊接著決定實際填入roster——順便揪出「無御主的孤身從者」這個舊架構完全沒設計過的狀態，並提出一次跨戰爭客串重組。先派Explore agent查證3件事才動手：①間桐櫻是否已有現成御主資料(`SEED_MASTERS`裡`間桐櫻(黑化)-5th`，war:'5th'，早就存在、只是沒被用進roster)；②`wars`標籤是不是硬性限制(查證後確認純敘事metadata、runtime零檢查，金閃閃可自由跨戰爭配對不受阻)；③從者完全無御主是否為既有機制支援的合法狀態(查證`enemyMasterIdx_`回-1、`enemyCanAffordNp_`退回單獨行動(solo)的【殘存】60點儲備、`getServantMaster_`等連結函式對查無配對都優雅退回空字串——全部原生支援，非需要新建的邊角案例)。

**兩輪`AskUserQuestion`定案**：
1. 陣容重排：`美杜莎-Rider`改配`間桐櫻(黑化)-5th`(原作真正契約者其實是櫻，慎二只是表面御主)；`間桐慎二-5th`改配`吉爾伽美什-Archer`(金閃閃原屬第四次，此為跨戰爭客串安排，填補慎二失去Rider後的位置)；`佐佐木小次郎-Assassin`新增為真正無御主的第8位，蟄伏柳洞寺(與美狄亞同地——原作本就是「柳洞寺表面是Caster據點、暗處另蟄伏真・Assassin」的雙重身分設定)。
2. 佐佐木「無耗魔」怎麼做：直接用現有單獨行動(solo)機制就好，不建新的「地脈」引擎機制——`Seed_Codex.gs`原本沒給佐佐木`solo`fx，補上(`classSkills`追加`{n:'單獨行動',r:'A',fx:'solo'}`)。

**改動**：
1. `Seed_Codex.gs`：佐佐木小次郎-Assassin 補單獨行動(solo A階)。
2. `Seed_Rivals.gs`的`FATE_5TH_ROSTER`：更新Rider/慎二配對，新增金閃閃(`arriveDay:3`+`arriveHint`自訂風聲文字，呼應玩家最初「金閃閃3天後出現遊蕩」的原始例子)、新增佐佐木(`master:null`)。
3. **根源重構`seedRivalsForGame_`的正史(4th/5th)分支**：舊版邏輯是「先把master/servant無腦push進`rows`陣列，事後靠『rows嚴格交替master,servant,master,servant…』的位置假設」做【御主】/【從者】MEMORY硬連結——這個位置假設一旦出現孤身從者(只push一列)就會讓後面所有組別全部錯位、連結全部連錯，是嚴重的隱性脆弱點。改成逐組當場配對即時連結(不再倚賴陣列位置)，`master`為`null`時單純只鋪從者列、跳過硬連結——這不是為了繞過問題的臨時特判，是把舊架構裡「假設永遠成對」這個從未被驗證過的隱性前提換成真正的顯性判斷。混亂(chaos)模式的隨機配對分支本就永遠嚴格成對，維持原本的位置式連結不動，只在自己的區塊內處理，兩分支互不影響。
4. `Index.html`：正史模式/5th戰爭選項的說明文字同步更新(拿掉過期的「七組」數字，補上金閃閃/佐佐木)。

**驗證**：`bash check.sh`全過(4個修改檔案：`Seed_Codex.gs`/`Seed_Rivals.gs`/`Index.html`/連同§30的檔案)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。headless環境無法真正開一局驗證，部署後建議測試：①開5th戰爭局，確認美杜莎抵達戰報/AI敘述的御主連結顯示為間桐櫻而非慎二；②第1~2天查無金閃閃(地圖/攻擊/風聲皆無)、第2天收到金色氣息風聲預告、第3天起可在冬木·新都正常遭遇；③佐佐木從開局第1天就在柳洞寺、與美狄亞同地共存不衝突，其令咒/供魔相關戰報應顯示「查無御主·靠殘存靈基硬撐」而非誤判成有主英靈；④確認舊6組(士郎/凜/綺禮/宗一郎/伊莉雅/臟硯)的登場與連結行為完全未受影響。

## 32. 混亂模式(chaos)隨機配對也套用隨機登場日(2026-07 玩家「亂鬥呢....可以隨機天數登場嗎？」)

**需求**：延續§30/§31的登場日機制，玩家追問混亂模式(隨機洗牌配對六到七組敵人)是否也能有分批登場的效果，不要每局開局所有隨機配對就全部同時到齊。

**設計**：混亂模式每局配對本來就隨機(洗牌`mPool`/`hPool`/`locPool`)，不像正史roster有固定人選可以手動指定`arriveDay`/`arriveHint`，適合改成**程序化隨機**：
- 前`CHAOS_GUARANTEED_IMMEDIATE_`(=3)組保證第1天就在——呼應`WORLD_FLOOR_`的既有精神(世界自走/開局至少保留東西讓玩家能打，不會被清空)，避免真的衰到全部延後、玩家開局後完全找不到人打。
- 其餘每組獨立擲骰50%機率延後登場，命中則登場日在第2~5天隨機(`2 + Math.floor(Math.random()*4)`)，沒中則跟以前一樣第1天全員到齊——每局開局的登場節奏都不一樣。
- 不自訂`arriveHint`(自訂提示句)：混亂模式配對隨機、不知道會抽到誰，無法像佐佐木/金閃閃那樣預先寫好對應的專屬風聲句，直接讓`worldTick_`既有的「依職階退回泛用措辭」機制接手即可(如「某道屬於『Rider』職階的強大氣息正在冬木邊緣遊蕩…」)，零額外程式碼。
- 沿用既有的`setArriveDay_`寫入master+servant兩列MEMORY，緊接在後面既有的「硬連結每組敵御主↔敵從者」位置式配對迴圈之前——字串內容互不衝突(登場日tag與【從者】/【御主】tag分別append，不會互相覆蓋)。

**改動**：`Seed_Rivals.gs`的`seedRivalsForGame_`混亂(chaos)分支，7行的隨機配對迴圈補上上述機率判定。正史(4th/5th)分支完全不受影響(它有自己的roster-level `arriveDay`/`arriveHint`欄位，本次未動)。

**驗證**：`bash check.sh`全過(1個修改檔案：`Seed_Rivals.gs`)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。headless環境無法真正開混亂模式局驗證，部署後建議測試：開幾局混亂模式，確認每局有3組保底第1天在場、其餘組別偶爾會延後登場且天數隨機、風聲預告文字讀起來自然(職階泛用措辭沒有語意錯誤)。

## §34 羈絆里程碑事件（2026-07·玩家問「新的機制或是系統呢？」→挑「羈絆里程碑事件」深入）

**背景**：玩家問 solo 還缺什麼「新機制/新系統」（而非既有功能的修補）。盤點後提出4個方向（羈絆里程碑事件／多重結局分歧／調查情報系統／令咒新用法），玩家選「羈絆里程碑事件」——BOND(好感)現在只是純數字+一個由玩家手動設定、AI不可寫入的REL_TAG標籤，30/60/90這種門檻從未觸發任何特別演出，跟每日「相處」的泛用小品文字沒有區別。

**設計取捨**：
- **判定時機刻意放在`actionBond`(相處動作)裡，而非集中寫進`raiseBond_`本身**——`raiseBond_`是被多處呼叫的羈絆數值寫入單一入口(相處+10／令咒強制補魔+8／破戒奪取+10)，若在那裡直接判定並標記「已演出」，會導致里程碑在不適合演出溫馨劇情的情境(如破戒奪取從者，強制奪僕的當下給一段甜蜜里程碑戲碼在調性上矛盾)被默默燒掉、玩家永遠看不到那段本該屬於「相處」的專屬演出。改成：`actionBond`自己讀「目前羈絆值 vs 尚未演出過的最低門檻」，不管羈絆是被哪個管道墊高到門檻之上——只要下次玩家按「相處」時仍未達成過，就會在那次相處演出，不會被其他管道的羈絆加成路徑意外提前消耗掉。
- **判定與「真正標記已演出」分兩步、以奇襲事件分岔**：`actionBond`裡的卸防突襲(`enemyAmbushOnServant_`)本來就會在相處時有機率打斷、蓋掉原本的溫馨小品換成戰報。里程碑候選值只在**沒被奇襲打斷**的分支才真正寫回MEMORY標記「已演出」——若被奇襲打斷，門檻視為尚未演出，留到下次真的順利相處時再補演，不會因為一次意外奇襲就永久錯過這段劇情。
- **儲存**：沿用`【羈絆日】`同一套get/set慣例，新增`【羈絆里程碑】30,60`(逗號分隔已達成清單)存在該NPC(從者)自己列的MEMORY，`getBondMilestonesFired_`/`setBondMilestonesFired_`(`Router_Bond.gs`)。
- **演出內容**：沿用`masterCard_`/`servantCard_`既有演出依據卡，提示詞要求AI寫「屬於這位從者獨有的一個具體舉動或一句話」而非泛用模板，並重申show-don't-tell(不可直白說「羈絆加深了」或直述願望/個性/萌點字面)。純新增prompt文字，未動`nsfwBaseRules`/`buildDefaultSystemPrompt`(那兩者solo完全不會呼叫到)。
- **前端**：`bond()`(Script.html)在`res.milestone`為真時，於敘事前插入一行淡粉色置中提示「💞　羈絆邁向新的深度　💞」，讓玩家一眼認出這次不是普通的相處小品；不新增任何按鈕/UI面板，門檻自動從既有「相處」按鈕觸發。

**改動**：
- `Router_Bond.gs`：新增`BOND_MILESTONES_`(=[30,60,90])常數＋`getBondMilestonesFired_`/`setBondMilestonesFired_`兩個helper；`actionBond`新增里程碑候選判定(`firedMilestones`/`milestone`)，`if(ambush)/else if(milestone)/else`三分支重構(原本只有ambush/else兩支)，回應新增`milestone`欄位(僅在非奇襲時回傳真值)。
- `Script.html`：`bond()`函式在`res.milestone`真值時插入一行過場提示。

**驗證**：`bash check.sh`全過；獨立node腳本沙盒測試`getBondMilestonesFired_`/`setBondMilestonesFired_`跨門檻判定邏輯(30→33觸發、45不重觸發、60→61觸發、標記持久化後重新解析仍正確)全數通過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。headless環境無法真正跑一局驗證AI實際輸出的演出品質，部署後建議測試：找一位從者連續「相處」把羈絆推過30/60/90，確認三次都各自觸發一次專屬演出(而非每次都是泛用小品)、且同一門檻不會重複觸發、旗標在奇襲打斷後下次仍能補演出。

## §35 御主體術上線：演出卡輕量對接＋真實戰鬥支援傷害（2026-07·玩家追問死欄位「之前設定的體術啥的都沒有用到」）

**背景**：玩家順著「調查/情報系統」話題延伸問「御主的能力（標籤？）系統也上線」——查證後確認 `【體術】`(從命運測定/種子鋪敵而來的 E~A 階級字母)跟 `【魔術】`(自由描述文字，如「投影／強化」「寶石魔術」)兩個 MEMORY 標記，全代碼庫**只寫不讀**：不影響任何戰鬥數值(御主血魔只看`迴路`)，甚至沒被塞進 `masterCard_`/`enemyMasterCard_` 演出卡餵給 AI——玩家設定了卻從未真正用到。另外還查出敵御主(`masterToNpcRow_`，Seed_Rivals.gs)過去**根本沒寫**體術進 MEMORY，只有玩家自創御主(Router_Creation.gs)才有——不是「有寫沒讀」，是敵方這側連寫都沒寫，兩側資料完整度不對稱。

**玩家決策路徑**：先問「輕量版(讀進演出卡) vs 真數值(御主可被單獨攻擊時的個人防衛判定)」，選了「輕量版，但也想要真的有戰鬥機制、合作作戰的感覺」，追問一句「想要真的能進行傷害」——最終定案＝**兩者都做**：體術/魔術先輕量讀進兩張演出卡當能力描述；體術另外走真實數值路徑，但不是「御主單獨被攻擊時的防衛判定」(那個方向需要先解決御主/從者一定同格同時登場的耦合，工程量大、且會扯到還沒拍板的調查系統)，改成更好落地的「御主在從者出擊時一起助拳、貢獻小額支援傷害」——正是玩家說的「合作作戰的感覺」。

**設計取捨**：
- **輕量演出對接**：體術/魔術是能力描述(非願望/個性/萌點字面)，不受 show-don't-tell 限制，可以直接陳述——比照這次session稍早「身世輕量對接」的做法，`masterCard_`(Router_Persona.gs，玩家自己)／`enemyMasterCard_`(敵御主)都補讀 `getMasterMelee_`/`getMasterMagic_`(新增於 Core_Settings.gs，緊鄰既有的登場日 get/set 慣例)。
- **真實戰鬥支援傷害怎麼接進引擎**：沒有另開一套「御主戰鬥」子系統，而是完全複用禮裝(`injectMysticBuff_`)已經驗證過的注入模式——`injectMasterMeleeSupport_`(Engine_Fate.gs)把 `{n:'御主體術', r:melee, fx:'master_melee'}` 注入我方從者戰鬥單位的 `skills`，`SKILL_FX_.master_melee`(passive, `dmgAdd: 7*rankMul_(r)`)走既有的 `fxDmgApply_` 資料驅動管線自動套用、自動進 `fired[]` 供 AI 敘述——單一真實來源，未來要調體術強度只改這一個公式。量級刻意壓在 `wind_strike`/`crafting` 同一檔次(6~8×rank)，凡人體術終究打不過從者本體技能，不喧賓奪主。
- **敵御主體術/魔術已對稱接上戰鬥(2026-07 §108 訂正)**：`Router_Battle.gs` 的 `fateStrike_` 守方分支、開場對轟、敵反擊三處皆已用 `enemyMasterMemoryFor_` 反查敵御主 MEMORY 並注入 `injectMasterMeleeSupport_`/`injectMasterMagicSupport_`，敵御主體術/魔術跟玩家側一樣真實影響傷害結算，不是只供演出卡陳述。
- **敵御主體術補寫**：`masterToNpcRow_`(Seed_Rivals.gs)過去只寫【願望】/【魔術】/【迴路】，這次補上【體術】(讀 `COL.MASTER.MELEE`)——即使這輪還沒接戰鬥，至少 `enemyMasterCard_` 的演出卡讀得到，兩側資料完整度先拉平。

**改動**：
- `Core_Settings.gs`：新增 `getMasterMelee_`/`getMasterMagic_` 兩個 MEMORY 讀取器。
- `Router_Persona.gs`：`masterCard_`/`enemyMasterCard_` 各補讀體術/魔術兩行。
- `Seed_Rivals.gs`：`masterToNpcRow_` 的 MEMORY 組裝補上 `【體術】${mr[COL.MASTER.MELEE]}`。
- `Engine_Fate.gs`：`SKILL_FX_` 新增 `master_melee`(`dmgAdd: 7*r`)；新增 `injectMasterMeleeSupport_(c, masterMemory)`(比照 `injectMysticBuff_` 同一套「找 fx 已存在則略過」慣例)；`resolveFateBattle_` 的被動傷害fx序列補一行 `fxDmgApply_(..., 'master_melee', ...)`。
- `Router_Battle.gs`：3 個真正用於傷害結算的 `injectMysticBuff_` 呼叫點(開場對轟攻方/每回合出擊/`fateStrike_`守方)各配一行 `injectMasterMeleeSupport_`；第4個(`tgtC0`avalon檢查用即棄物件)不動。

**驗證**：`bash check.sh`全過；`tools/battle_sim/engine.js`載入真引擎跑沙盒測試(阿爾托莉雅 vs 庫·丘林，N=3000)——無體術/E/C/A/EX 五組平均命中傷害依序 78.7/81.2/86.5/92.1/94.6(隨階級線性遞增、量級符合 7×rankMul_ 公式)，勝率僅 88.3%→89.3%(未破壞平衡)；`fired[]` 標籤確認正確顯示「御主體術」；重複注入/無體術標記兩種邊界情況皆驗證正確(不重複注入、無標記則零加成)。`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。headless環境無法驗證 masterCard_/enemyMasterCard_ 演出卡實際餵給AI後的敘述品質，部署後建議測試：開一局戰鬥，確認演出卡讀得到體術/魔術描述、戰報偶爾出現「御主體術」傷害加成標籤。

## §36 御主魔術階位上線：Caster限定的魔術支援傷害（2026-07·玩家追問「御主的魔法類別是不是也要上線？」）

**背景**：§35 上線體術後，玩家追問另一個同樣死掉的欄位——`COL.MASTER.MAGIC_RANK`(魔術階位，E~A rank字母，跟體術是完全平行的存在)是否也要比照上線。問玩家「限Caster生效 vs 不限職階 vs 先不動」三選一，玩家回「[No preference]」(無偏好)——依先前已提出的推薦方案(限Caster生效)實作，理由：體術管近戰助拳(任何職階出擊都合理)，魔術管施法支援(只有靠魔力交鋒的 Caster 用得上，讓兩條能力線各自對應不同陣容，而非疊在一起變成無腦雙倍加成)。

**實作前發現的資料缺口(體術沒有這個問題)**：體術能上線是因為「命運測定」(玩家創角流程)本來就會擲出 melee，玩家自己有這筆資料。但魔術階位**只存在種子御主表**，命運測定的3擲流程(`rollFate()`,Script_Onboarding.html)從未擲過這個值、`actionManualNpc`(create)也沒有對應欄位——若不補上，這個機制會變成「敵方Caster配對的敵御主有魔術階位可以生效、但玩家自己永遠不會有」的系統性不對稱(玩家的Caster從者永遠吃不到這項加成)。查證後決定**補齊玩家側的資料來源**而非做半套：
- `rollFate()` 新增一次**獨立**擲骰(不沿用melee的`mr`，用新的`magr`)算出`magicRank`，跟melee同一套E/D/C/B四階機率分佈——體術/魔術刻意做成兩條不相干能力線，一位御主可能體術強魔術弱，反之亦然，比「兩者綁同一擲」更有角色深度。
- `pickCanonMaster`(扮演正典御主流程)幫melee早就墊了`melee:'D'`固定預設(因為`actionGetMasters`回傳給前端的正典御主資料本就沒帶melee/magic_rank，只有給picker顯示用的name/appear/wish/magic文字)——這次比照同一慣例補`magicRank:'C'`固定預設，維持與melee相同的簡化程度，不额外去擴充`actionGetMasters`payload(那是更大範圍的既有設計，非本次範圍)。

**設計取捨**：
- **注入時直接做職階判斷**：`injectMasterMagicSupport_`(Engine_Fate.gs)內部第一行就檢查`c.cls !== 'Caster'`不符合直接return——判斷邏輯只放一個地方，呼叫端(3個 Router_Battle.gs 呼叫點)不用重複判斷職階，維持跟`injectMasterMeleeSupport_`同款呼叫介面(單純多帶一個master memory參數)。
- **量級與體術對稱**：`SKILL_FX_.master_magic`同樣`dmgAdd: 7*rankMul_(r)`，跟`master_melee`完全同一公式——兩條能力線只差「生效條件(職階)」，不差「強度」，避免玩家去比較哪個比較划算而只點其中一個。
- **演出卡合併顯示**：`masterCard_`/`enemyMasterCard_`原本(§35)已有獨立的「魔術系統：X」行，這次沒有另開一行「魔術階位：Y」，而是併成「魔術系統：X(Y階)」——避免卡片出現兩行都以「魔術」開頭讀起來重複，且階級本來就是依附在那套魔術系統之下的能力深淺，語意上合併比分開更自然。

**改動**：
- `Core_Settings.gs`：新增`getMasterMagicRank_`讀取器。
- `Engine_Fate.gs`：`SKILL_FX_`新增`master_magic`；新增`injectMasterMagicSupport_(c, masterMemory)`(內部做`cls==='Caster'`門檻)；`resolveFateBattle_`補一行`fxDmgApply_(...,'master_magic',...)`。
- `Router_Battle.gs`：3個既有`injectMasterMeleeSupport_`呼叫點各配一行`injectMasterMagicSupport_`(同一個master memory來源，函式內部自行判斷是否為Caster)。
- `Seed_Rivals.gs`：`masterToNpcRow_`的MEMORY組裝補上`【魔術階位】${mr[COL.MASTER.MAGIC_RANK]}`。
- `Router_Creation.gs`：`actionManualNpc`解構新增`magicRank`，MEMORY陣列補`magicRank ? \`【魔術階位】${magicRank}\` : ""`。
- `Script_Onboarding.html`：`rollFate()`新增獨立擲骰算`magicRank`；`renderFateRolls()`卡片顯示補一項；`pickCanonMaster()`補固定預設`magicRank:'C'`；`createPC()`的`gasRun`呼叫補傳`magicRank`。
- `Router_Persona.gs`：`masterCard_`/`enemyMasterCard_`的魔術系統行併入`(${magicRank}階)`後綴。

**驗證**：`bash check.sh`全過；`tools/battle_sim/engine.js`沙盒測試——Caster(美狄亞)搭配 無/C/A 魔術階位平均命中傷害 114.3/121.1/126.8(隨階級遞增、量級符合公式)；非Caster(阿爾托莉雅，Saber)注入魔術階位後`skills`確認完全沒有`master_magic`項(職階門檻正確擋下、零加成)；同一Caster同時具備體術+魔術兩項標記時`master_melee`/`master_magic`兩個fx皆正確共存不互相覆蓋。`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。headless環境無法驗證命運測定UI實際擲骰顯示與createPC完整送出流程，部署後建議測試：創角時「命運測定」按3次，確認每次都秒顯獨立的魔術階位(不是複製體術那個值)；召喚一位Caster出戰，確認演出卡讀得到「魔術系統：X(Y階)」、戰報偶爾出現「御主魔術」傷害加成標籤；召喚非Caster出戰確認不會出現這個標籤。

## §37 敵御主體術/魔術補接戰鬥（2026-07·玩家實測回饋「對面的凜都拿著寶石沒有攻擊」）

**背景**：§35/§36 把體術/魔術上線時，刻意把戰鬥效果範圍收斂成「僅玩家側從者吃得到」(SOLO_REFERENCE §35「敵御主體術暫僅供演出卡陳述、未接戰鬥」)——當時的理由是敵側需要額外的跨列查找(從敵從者反查其配對敵御主)。玩家實際玩了一場後回報：對面的遠坂凜(手持寶石魔術)在演出卡上讀得到「魔術系統：寶石魔術(A階)」，但因為沒有真實傷害掛鉤，AI 敘述時完全不敢寫她主動攻擊(GAS掌數值、AI只說書的既有鐵律下，AI 沒有數字背書就不會編造戰鬥行為)——這正是上次故意留下的範圍缺口，玩家一眼就看出問題。

**修法**：把上次故意跳過的跨列查找補上，讓敵御主的能力也真的接進戰鬥：
- `Router_Bond.gs`新增`enemyMasterMemoryFor_(pcData, gameId, servantRow)`：讀敵從者自己`【御主】`硬連結標記查出御主名，在`pcData`裡找同`game_id`、`FACTION==="敵御主"`、未死亡的那一列，回傳其MEMORY(查無回空字串，`inject*Support_`對空字串本就是「不注入」，呼叫端不必另外防呆)。
- `Router_Battle.gs`的`fateStrike_`新增`else if FACTION==="敵從者"`分支：敵從者防守時比照玩家側同一套邏輯，改讀**敵御主自己的**MEMORY(而非誤讀玩家御主)注入體術/魔術支援——這是**單一choke point**，全部「攻擊敵從者」的呼叫點(一般攻擊/盟友助攻/雙從者/海怪協同…)自動受益，不必逐一補call site。
- 另外3處「敵從者當攻方」的組合建構點各自補上注入(這些是`atkC`角色，`fateStrike_`內部只重建`defC`不動`atkC`，得在源頭補)：`Router_Battle.gs`的`enemyC0`(寶具對轟)、`enemyNow`(每回合敵方出擊)；`Router_Movement.gs`的`enemyAmbushOnServant_`裡的`enemyC`(卸防突襲攻方)＋陣地反擊分支的`eDefC`(突襲者被反擊時的防守方，同樣該吃自己御主的支援)。
- **刻意不擴大範圍**：`Router_Movement.gs`裡另外幾處敵對雙方互毆(世界自走的「兩組敵御主同格互毆」`crossRes`、追擊/撤離的`chC`/`foeC2`)未動——這些是背景/事件性交手，不是玩家直接參與的那場戰鬥，且已超出玩家本次回饋的具體場景(對面的凜沒有主動攻擊我)，避免順手擴大成一次大範圍重構。

**驗證**：`bash check.sh`全過；純邏輯沙盒測試`enemyMasterMemoryFor_`——正常連結(遠坂凜↔EMIYA)正確解析出御主MEMORY、無連結從者回空字串、御主列已標記`DEAD_`時正確視為查無(不誤讀陣亡御主的舊資料)；`tools/battle_sim`真引擎沙盒模擬「敵方Caster(美狄亞)攻擊我方(庫·丘林)」，注入敵御主`【魔術階位】`無/C/A後平均傷害114.2/121.3/127.1(與玩家側同款曲線，確認端到端生效)；`node tools/battle_sim/roundrobin.js 5th basic 150`重跑確認純從者對戰(不涉御主注入)排名數字不受影響(此機制只在有御主MEMORY可查時才生效，battle_sim的裸combatant測試本就查不到，故不影響既有回歸基準)。`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。headless環境無法驗證正式戰鬥中「AI真的敢寫敵御主出手」的敘述品質，部署後建議測試：對戰一位魔術/體術階位較高的正典敵御主(如言峰綺禮體術A、遠坂凜魔術階位A)，確認戰報偶爾出現「敵方·御主體術/魔術」傷害加成標籤、AI敘述也願意讓該御主本人動手而非純看戲。

## §38 戰報加入從者判斷/建議（2026-07·玩家問「戰報可以再加入 讓從者判斷給建議嗎？」）

**背景**：玩家希望戰鬥交手後，出戰從者能依角色個性給出對這場戰鬥的主觀判斷或建議(如破綻在哪、對方寶具是否見底、該不該乘勝追擊)，讓從者不只是打鬥的工具，也有「戰場智慧」的一面。

**設計判斷**：這純粹是**敘事層級**的擴充，不是新機制——GAS 仍掌所有數值(下一步能不能追擊、寶具耗魔多少都是既有系統決定)，從者的「建議」只是角色個性化的觀察評論，不會、也不能真的改變玩家可選的行動選項(下回合出擊/撤退/整備依舊全部由御主按鍵決定)。這跟 `masterCard_`「御主不可替玩家拍板戰略」的限制不衝突——那條規則管的是「御主(玩家所扮演的角色)」不能被 AI 越權決策，而「從者」本來就是純 NPC，開口給建議只是台詞內容，不影響任何按鈕可用性。找了既有的 `npTelegraphed`(寶具預告示警「讓御主明白必須當機立斷」)當先例，證實這類「角色提醒/建議」措辭在這份提示詞裡早有前例，不是新發明的敘事模式。

**動手**：`Router_Battle.gs`的`actionFateBattle`，只在「戰鬥未分生死」(`!destroyedName && !sealEscaped && !godRevived`，跟上一行「下回合是否再戰仍由御主決定」同一個條件——只有還有下一步好建議時才需要建議)分支補一行指令，緊接在既有事實bullet列之後、收尾的敘事風格指令之前：
- 一般情況：要求從者依性格口吻給簡短主觀判斷/建議，明講「是角色的觀察與建議，不是戰略指令，下一步仍由御主按鍵定奪」，避免被誤讀成AI可以幫忙做決定。
- 狂化(`hasFx_(atkC,'mad')`)情況：改用低吼/肢體動作傳達判斷，不成篇整句台詞——`servantCard_`本身已內建「狂化角色嚴禁完整台詞」的絕對鐵律，這裡刻意寫成互不打架的版本，而非讓兩條指令互相矛盾。

**改動**：`Router_Battle.gs`(`actionFateBattle`)非defeat分支新增條件式指令行；`AI_PROMPT_MAP.md`§`actionFateBattle`分支⑤同步補上這行提示詞摘要。

**驗證**：`bash check.sh`全過。`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(純敘事prompt文字調整，未觸及紅線①保護範圍)。純prompt層級改動，headless環境無法驗證AI實際輸出品質，部署後建議測試：連續幾場「戰鬥未分生死」的交手，確認戰報敘述末尾會出現從者依性格給的簡短觀察/建議(而非只有動作場面)；找一位狂化角色(如赫拉克勒斯)出戰確認建議改用低吼/肢體呈現、不會突然開口說完整句子。

## §39 敵御主戰局實況錨點（2026-07·玩家反映「對面的御主感覺不太會看場合對話」）

**背景**：§37 剛讓敵御主的體術/魔術真的接進戰鬥傷害，玩家實際體驗後又回報一個更根本的敘事問題——`enemyMasterCard_`(演出依據卡)只給敵御主的性格/身世/萌點/能力描述，完全沒有「當下戰況打得怎樣」這項資訊，AI 演出敵御主反應時容易跟真實場面脫節：己方從者明明被壓著打，敵御主卻演得一派從容；或雙方勢均力敵，卻演得像穩操勝券——這就是「不看場合說話」的根因：不是 AI 不會演反應，是根本沒被告知「現在該演什麼反應」。

**修法**：在既有的「關係錨」(說明敵御主與出戰敵從者的契約關係，2026-07較早一輪「伊莉雅沉默案」已加入的修正)緊接著補一句「戰局實況錨點」——用本函式早就算好的數字(`defeat`/`destroyedName`/敵從者HP比例/`totalDealt`/`totalTaken`傷害交換)即時組成一句白話戰況描述(如「己方從者身陷重創、命懸一線」/「己方從者正壓著對方打、明顯佔上風」/「雙方勢均力敵、勝負未有定論」)，要求敵御主的神態/語氣/台詞必須讀懂這個場面。**注意方向**：`totalDealt`/`totalTaken` 是從玩家視角算的(己方對敵造成/己方所受)，但這句錨點是說給「敵御主」聽的、講的是「己方(=他自己的從者)」戰況——所以`totalTaken`(玩家所受，等於敵方輸出量)高才代表敵御主這邊在佔上風，兩者方向相反，寫的時候特別對調過，已用獨立node腳本核對6種情境(重創/輾壓/被輾壓/勢均力敵/擊殺/敗北)語意皆正確。

**設計取捨**：純敘事層級的「情境描述」，不是新的判定機制——戰鬥勝負/傷害本來就已經由 GAS 算完，這裡只是把算好的數字翻譯成一句白話講給 AI 聽，讓演出「對得上」，不影響任何既有數值或判定路徑。只加在既有的「非斬首目標」(`!isMasterTarget`)分支，跟關係錨同一個既有邊界，未擴大範圍。

**改動**：`Router_Persona.gs`不涉及(卡片本體`enemyMasterCard_`未動，這句是戰鬥當下才知道的即時戰況，理應由呼叫端組裝而非塞進靜態演出卡)；`Router_Battle.gs`(`actionFateBattle`)在既有「關係錨」那句之後新增戰局實況錨點；`AI_PROMPT_MAP.md`§`actionFateBattle`分支⑤同步補上這段提示詞摘要。

**驗證**：`bash check.sh`全過；獨立node腳本核對戰況判斷式6種情境(低血/我方陣營輾壓/被輾壓/勢均力敵/擊殺/敗北)輸出語意皆正確，尤其`totalDealt`/`totalTaken`方向對調的部分反覆驗算確認無誤。`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。純prompt層級改動，headless環境無法驗證AI實際輸出品質，部署後建議測試：打一場拖到中後段、雙方互有損傷的戰鬥，觀察敵御主在場時的反應台詞是否讀得出戰況(例如己方從者快輸時應顯焦慮/強撐，佔上風時應顯得意/嘲諷)，而非千篇一律的固定反應。

## §40 solo敘事管線出戲風險稽核＋修正（2026-07·玩家問「solo不想出戲幫我檢查看看」）

**背景**：玩家要求全面檢查 solo 敘事管線有沒有會讓人出戲(跳脫沉浸感)的地方。派 Explore agent 廣泛搜尋 `Script.html`／`Router_Narrative.gs`／`Engine_Combat.gs`／`Router_Action.gs` 後，逐一讀源碼驗證找到的問題，確認以下皆為**真實會在正常遊玩中發生**(非純理論)的漏洞，並排序修正：

1. **【最嚴重·已確認100%會發生】`callGeminiAPI`(Engine_Combat.gs) 連線失敗時把原始技術性錯誤文字(可能是英文HTTP錯誤/JSON解析失敗訊息)直接塞進`narration`欄位當成「說書人講的話」回傳**——這不是拋例外，是包成合法JSON正常回傳，`narrateWithState_`會照單全收當成正常敘事顯示給玩家。任何一次暫時性的OpenRouter網路抖動/逾時，故事裡就會冒出一句英文技術錯誤。**修法**：`Logger.log`留一份原始錯誤給開發者除錯(Apps Script執行紀錄看得到)，玩家看到的改成貼合Fate世界觀的「🌫️【因果紊亂】命運的絲線在此刻忽地紊亂——這段因果暫時無法讀出，請稍後再試一次。」(比照既有NSFW攔截分支「🌸【結界觸發】」的既定風格)。
2. **【確認可從正常按鈕觸發】`Script.html`的`syncData()`(手動「感應天地」按鈕→`triggerDrawerAction('sync')`→`syncData()`不帶參數→`isSilent`預設`false`)連線失敗時彈出`alert("系統錯誤，請打開 F12 查看 Console 的錯誤紀錄。")`——這是明顯的開發者除錯話術，不是任何遊戲內角色會講的話。改成「感應天地時因果紊亂，請稍後再試一次。」，跟旁邊既有的「感應失敗：」錯誤訊息同一種語氣。
3. **【防禦性·尚未確認實際發生過，但是已知的LLM失效模式】`narrateWithState_`回傳的AI生成敘事文字，過去完全沒有做「敘事輸出」的洗淨**——`cleanNarrateEcho_`過去只洗「存進歷史的玩家輸入prompt摘要」，AI**自己生成**的敘事文字(`data.narration`)從未被過濾過。`miniSystem`系統提示詞本身塞滿`★指令`/`〈演出卡〉`這類鷹架符號，SOLO_MODEL(輕量低延遲小模型，比大模型更容易「回音」提示詞格式)萬一把提示詞格式誤植進自己的輸出，玩家會讀到一句突兀的系統指令混在故事正文裡。新增`stripLeakedScaffold_(text)`(緊鄰`cleanNarrateEcho_`)：只清`★指令`與`〈演出卡〉`兩種符號，**刻意不清`【標籤】`**——因為`callGeminiAPI`自己設計的柔性fallback文案(如上面新修的「🌫️【因果紊亂】」)本身就是刻意用`【】`當視覺標籤顯示給玩家，若連這個也清掉會清掉自己剛設計的文案標籤，弄巧成拙。套用點：`narrateWithState_`回傳`data.narration`前多包一層。
4. **【低優先度·觸發條件罕見】`Router_Action.gs`兩處系統術語外洩**：`handleGameAction`的JSON解析失敗訊息「後端偵測：JSON結構解析異常」與未知action訊息「系統異常：未知的動作指令「${action}」」(會外洩內部action key字面，如`fate_battle`)——這兩個分支理論上只有畸形請求或前後端action字典不同步(如舊快取的前端呼叫已刪除的action)才會觸發，但仍比照上述風格改成「連線資料有誤，請重新整理頁面後再試一次。」/「找不到這個指令，請重新整理頁面後再試一次。」，統一走「這句話由誰講出來都合理」的柔性錯誤語氣，而非曝露內部術語。

**刻意不動的部分**：`Engine_Combat.gs`開頭的「未設定 API_KEY」/「未設定 MODEL 指令碼屬性」訊息——這兩句只在部署設定不完整時才會出現(不是正常遊玩會遇到的情境)，且此專案的玩家同時也是開發者，維持清楚的技術診斷字面對排查部署問題更有幫助，故意不改成模糊的世界觀包裝文字。前端`insertAdjacentHTML`未對AI輸出做HTML escape——若貿然加全域escape會連現有故意插入的`<br><br>`分段格式都一併跳脫掉，牽動既有敘事渲染的既定行為，判斷風險/效益不成比例，這次不動。九州殘留的`localStorage`鍵名(`kyushu_v27`等)純內部識別字串、玩家從未看得到，非用字面意義的「出戲」風險，不予處理。

**改動**：`Engine_Combat.gs`(連線失敗fallback文案+Logger除錯留痕)；`Router_Narrative.gs`(新增`stripLeakedScaffold_`+套用於`narrateWithState_`回傳點)；`Script.html`(`syncData`的F12除錯alert改柔性文案)；`Router_Action.gs`(兩處系統術語alert改柔性文案)。

**驗證**：`bash check.sh`全過；獨立node腳本核對`stripLeakedScaffold_`4種情境(清掉誤echo的★指令行、清掉誤echo的〈演出卡〉、保留fallback文案自己的【標籤】、正常敘事完全不受影響)輸出皆正確。`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(`Engine_Combat.gs`這次的改動只在`callGeminiAPI`連線失敗分支，未觸及`nsfwBaseRules`/`buildDefaultSystemPrompt`——那兩者已搬到`Gallery.gs`，此檔現在只剩共用的`callGeminiAPI`本體)。headless環境無法真正觸發網路逾時來驗證第1項修正的實際顯示效果，部署後若剛好遇到一次連線失敗，留意是否顯示柔性訊息而非英文技術錯誤。

## §41 補齊剩餘按鍵的AI敘述（2026-07·玩家問「solo每個按鍵好像有些沒有接上ai敘述，可以都接上嗎」）

**背景**：核對 `AI_PROMPT_MAP.md` 逐一比對「純機制、完全不叫AI」清單裡的每個 action，區分兩類：①**天生不該敘事**的系統/UI/唯讀/檔位切換類(登入/存讀檔/排行榜/戰記列表/`set_servant_output`等4個戰鬥檔位切換鈕——這些是選單勾選而非敘事時刻，接AI只會拖慢節奏、也沒畫面可演，故意維持原樣)；②**真正遺漏**的地圖/日常類玩法動作——這幾個跟同檔的`rest`/`bond`/`mana_supply`性質相同(都是「在地圖上做一件事」)，卻只回罐頭`message`字串，從未讓AI演出。逐一讀原始碼確認：

1. **`actionScout`（🔍偵查，Router_Movement.gs）**：原本只回`revealed`名單+罐頭訊息，完全沒有`aiPrompt`欄位——`Script.html`的`scout()`前端其實早就寫了`if (data.ambushPrompt || data.aiPrompt) await narrate(...)`，是死碼(從未被觸發，猜測是仿`rest()`複製時順手留下的容錯判斷，`actionScout`從未在偵查時走過`enemyAmbushOnServant_`)。現補上輕量`aiPrompt`(60~100字)：有隨行從者→`servantCard_`，無則`masterCard_`；埋入「是否揭露敵蹤」單一事實。
2. **`actionScavenge`（🔍搜索物資，Router_Movement.gs）**：同上，原本無`aiPrompt`，前端`if (res.aiPrompt) await narrate(...)`也是等到現在才第一次真正觸發。補上輕量`aiPrompt`：埋入「本地魔力是否已搜刮枯竭」＋「是否順帶察覺敵蹤情報」。
3. **`actionPrepMeal`（🍱整備，Router_Movement.gs）**：原本連前端`prepMeal()`都**沒有**`narrate`呼叫(比scout/scavenge更徹底，連死碼容錯都沒有)。補上輕量`aiPrompt`(戰前用餐日常小品)＋在`Script.html`的`prepMeal()`補上`if (data.aiPrompt) await narrate(data.aiPrompt);`。
4. **`actionSetWorkshop`（🏕️設置陣地）**：**稽核中發現這個其實早就有`aiPrompt`**(組了`wsPrompt`、前端也早有`if (res.aiPrompt) await narrate(res.aiPrompt);`)——`AI_PROMPT_MAP.md`原本標「否，純message」是文件本身過期沒跟上，這次順手修正文件，程式碼本身未改動。

**刻意沒動的部分**（避免過度解讀「都接上」＝逐字照辦每一個action）：`set_servant_output`/`set_mage_realm`/`set_rune_mode`/`set_np_choice`(戰鬥前純數值檔位切換，性質等同勾選單，非敘事時刻)；`sync`/`get_tags`/`account_login`/`leaderboard`/`war_chronicle`/`war_history_list`/`get_epic_history`/`get_victory_history`/`purge_orphans`/`dev_seed_gallery`/`dev_resync_codex`/`kanshou_*`系列(唯讀查詢或帳號/存檔工具，敘事化沒有意義)；`create`(2026-07已定案秒寫入不叫AI，AI補完延後到`backfill_master_ai`+`summon_servant`的`summonPrompt`，不重複加)。

**改動**：`gas/Router_Movement.gs`(`actionScout`/`actionScavenge`/`actionPrepMeal`三處補`aiPrompt`)；`gas/Script.html`(`prepMeal()`補`narrate`呼叫)；`AI_PROMPT_MAP.md`(§2/§3表格更新四個action的AI欄位＋新增3段prompt節錄＋修正`set_workshop`舊誤植＋更新文末兩份總表)。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(這次完全沒碰這兩個檔案)。三段新`aiPrompt`皆沿用`servantCard_`/`masterCard_`既有卡片機制與「show, don't tell」既定鐵律，未新增任何演出鷹架；字數上限刻意壓在60~100字(比`rest`/`bond`等主要敘事時刻更短)，因這幾個動作只耗1AP、同一天可能連按數次，維持「⚡快速」工程準則、不讓輕量動作也拖成長篇。

**追加修正（同日，玩家問「提示詞都ok？」複查揪出）**：上面3段新`aiPrompt`＋既有的`actionSetWorkshop`共4處，原本都寫成「有隨行從者→只給`servantCard_`、否則才給`masterCard_`」的二選一——但這4個場景的埋入事實文字明講是**御主與從者共同行動**（「御主凝神探查」「御主一行在此地搜索」「御主與從者稍作整備」「御主灌注了魔力」），有從者在場時卻完全不給AI御主的性格/口吻卡，AI只能籠統帶過御主這一側的反應。改成一律附`masterCard_`、有從者才追加`servantCard_`（兩卡並列，比照`mana_supply`/`bond`既有的組法，不是新發明）。順手全庫`grep`確認沒有其餘地方也犯同款「二選一漏卡」——`actionMove`的`svCardMove`/`pursuit.foeCard`是唯一目的變數（分別搭配獨立的`masterCard`欄位在前端組裝時一起使用），非同一款bug。

## §42 代碼健康：MEMORY標記工廠函式＋Script.html action handler共用骨架（2026-07·玩家問「代碼健康先整理吧」，落實`FUNCTION_MANUAL.md`附錄記錄的兩項技術債）

**背景**：玩家先讀完`HANDBOOK.md`/`FUNCTION_MANUAL.md`/`DESIGN.md`/`AI_PROMPT_MAP.md`全套架構後，選擇先處理稽核筆記早就記錄、但當時判斷「非本次範圍、需先確認相容性」而暫緩的兩項重構。

**① MEMORY get/set/clear 家族收斂**：`Router_Battle.gs`(試煉/令咒/靈基透支/整備至)＋`Core_Settings.gs`(過充)＋`Router_Movement.gs`(陣地/搜刮)共7組手刻正則邏輯，實際拆解後發現只有兩種真正形狀：
- **數值型**(`makeIntTag_(tagName, defaultVal)`)：試煉(預設11)/令咒(預設3)/靈基透支(預設0)/整備至(預設0)/過充(預設0)。
- **文字型**(`makeTextTag_(tagName)`，無驗證/截長度，給已受信任的內部字串如地點名用)：陣地/搜刮。
兩者皆定義在`Core_Settings.gs`(共用基礎設施)，原本個別檔案的`getXxx_`/`setXxx_`/`stampXxx_`函式名與外部呼叫端完全不變，內部改成呼叫工廠實例的`.get`/`.set`。**刻意不動**：`horrorShield`(三值複合`cur|max|expiry`+舊兩欄相容邏輯，檔內註解本就寫「未來擴充照此複製」而非「合併」)、`換裝`/`武裝`(需字元過濾+截長度，跟陣地/搜刮的「無驗證」性質不同)、`寶具預告`(布林旗標)、`魔境`/`符文`(需白名單驗證，不是純get/set)——形狀差異夠大，硬套工廠反而更難讀。
**驗證**：改動前先寫獨立node腳本(`/tmp`scratchpad，未進repo)比對「舊版手刻正則」vs「新工廠」在13+組MEMORY字串(空/單獨/夾在中間/角落/刻意構造的重複標記)下的get/set輸出，全部一致才動手；動手後再寫第二支腳本直接用`vm`把**改完的真實`Core_Settings.gs`+`Router_Battle.gs`+`Router_Movement.gs`**載進沙盒跑同一套case(16組字串×7個函式+預設值)，全過。順手抓到一個編輯過程中自己造成的重複定義(`clearOvercharge_`意外留了新舊兩份)，靠`grep -c "function X("`逐函式核對定義數＝1才發現並修掉。

**② Script.html 7個(實際8個)action handler共用骨架**：`ruleBreakSteal`/`proposeAlliance`/`breakAlliance`/`allyBond`/`manaSupply`/`bond`/`useSeal`（`FUNCTION_MANUAL.md`原記錄7個，逐一重讀時發現還有一個結構相同但當時漏記的`spiritRepair`，一併納入)共8個handler，共通骨架「`beginAction`→(可選前置動作)→(可選story系統提示)→`gasRun`→成功: (可選副作用)→`syncData(true)`→`narrate(res.aiPrompt)`→(可選narrate後善後，如milestone/defeat/unlocked提示)／失敗: alert(可選額外處理)→`endAction`」抽成`runSimpleAction_(opts)`共用函式。**刻意不動**：各handler開頭的`confirm()`對話框——措辭與觸發門檻(有無敵蹤警告/代價說明)差異夠大，硬塞進共用函式的參數只會更難讀，維持各自呼叫端獨立寫。
**設計取捨**：`opts`用`beforeCall`/`preMsg`/`onSuccess`/`onSuccessAfterNarrate`/`onFail`/`failMsg`/`catchMsg`分別對應原本各handler在流程不同階段插入的自訂邏輯(如`bond()`的里程碑banner在`onSuccess`、`defeat`判定在`onSuccessAfterNarrate`、`bondUsed`追蹤同時存在`onSuccess`與`onFail`兩邊)——逐一比對8個原始函式的每一行副作用，確認搬進對應hook後執行順序與原版**完全一致**(尤其`narrate()`必須在`syncData(true)`之後、`defeat`判定必須在`narrate()`之後這兩條本專案的既定鐵則，是這次重構最容易出錯的地方，逐一核對過)。

**改動**：`gas/Core_Settings.gs`(新增`makeIntTag_`/`makeTextTag_`工廠＋`過充`三函式改delegate)；`gas/Router_Battle.gs`(試煉/令咒/靈基透支/整備至四組函式改delegate)；`gas/Router_Movement.gs`(陣地/搜刮兩組函式改delegate)；`gas/Script.html`(新增`runSimpleAction_`＋8個handler改用它)；`FUNCTION_MANUAL.md`(更新對應章節與附錄，標記兩項技術債已解決)。

**驗證**：`bash check.sh`全過；`grep -c "function X("`逐一確認全部17個相關函式定義數皆為1(含新工廠/新helper本身)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。Script.html這段是純前端JS改動、`check.sh`只驗語法不驗runtime行為(CLAUDE.md點名的已知坑)——逐一手動核對8個handler改寫前後的執行順序與副作用完全一致，是這次最主要的驗證手段。

## §43 補魔／強制補魔加好感門檻＋高好感解鎖分支換模型（2026-07·玩家問「現在補魔太容易了」＋「強制補魔可以做成陷阱按鈕嗎」）

**背景**：玩家覺得`mana_supply`(💧補魔)沒有任何社交/情境門檻——好感0也能按、魔力還剩九成也能按，跟提示詞裡「私密而沉重的一刻」的敘事份量不成比例。同時想把令咒的「⚡強制補魔」從「純好處(回滿魔+好感+8)」改成依好感有風險的絕對命令，且明確要求**不要在按鈕上警告**——這就是要讓它像陷阱按鈕。經過兩輪`AskUserQuestion`確認：①低好感的強制補魔死亡風險刻意不在confirm()提示(玩家選「不講，就是陷阱」)；②高好感解鎖分支要換一顆更能承接露骨描寫的模型獨立呼叫(玩家選「獨立呼叫DeepSeek，aiPrompt自己寫得更露骨」，**明確排除**直接呼叫鑑賞`actionPlay`/`nsfwBaseRules`——solo/鑑賞兩軌分離的紅線鄰近設計不動)。

**① `actionManaSupply`(Router_Economy.gs)新增資格檢查**：新增共用常數`MANA_TRUST_BOND_=80`(補魔/強制補魔共用同一信任門檻，單一真實來源)。從者`BOND<80`或御主魔力`>10%`上限時，直接回傳`declined:true`＋AI依「好感不夠」/「魔力還沒見底」分別給事實的婉拒敘述——不耗AP、不燒迴路/血上限、不動好感，是純敘事的no-op。條件皆滿足才走原本的回滿魔+永久燒蝕迴路/血上限流程。

**② `actionUseSeal`(Router_Bond.gs)的`mana`分支重寫**：不再無條件安全。依同一顆`bondForSeal`(從者BOND)分流：
- **≥80(其實不必動用令咒)**：MP回滿＋複用既有`setOvercharge_`機制(下一發規格外寶具可無償超載)當額外好處，**不吃**常規補魔的永久代價——敘述基調是「太浪費了」的無奈笑意。
- **<80(她根本不情願)**：MP仍回滿(令咒的絕對強制壓下意志)，但敘述收在「令咒解除瞬間、積怨反噬、朝御主出手」——`defeat:true`、`dreamPrompt`(複用既有`buildDreamPrompt_`，非新死亡機制)、`report:{sealBacklash:true}`(供`Script.html`的`handleDefeat`新增一條`causeTag`分支，讓老虎道場的講評對得上死因，不用讓AI瞎猜)。玩家明確定案**不在confirm()對話框預警**，維持陷阱按鈕的體驗。

**③ 高好感解鎖分支的獨立DeepSeek呼叫**：`narrateWithState_`(Router_Narrative.gs)新增`opts.model`覆寫參數(預設仍是`SOLO_MODEL`，行為對其餘呼叫端零影響)；`actionNarrateOnly`讀`userData.deepseek`旗標，為真時傳`model:AI_MODEL`(deepseek，同鑑賞預設模型，比SOLO_MODEL更能承接露骨描寫)。前端`narrate(promptText, opts)`新增第二參數，`runSimpleAction_`新增`opts.narrateExtra(res)`鉤子——`manaSupply()`/`useSeal()`在`res.unlocked`為真時傳`{deepseek:true}`。**刻意不共用**鑑賞的`actionPlay`/`nsfwBaseRules`/`buildDefaultSystemPrompt`——這是玩家第二輪`AskUserQuestion`明確排除的方向，solo資料層(無PHYSICAL肉體狀態欄/無NSFW schema)、`actionPlay`入口守門(擋非`KPC_`)、`game_id`前綴分流(g_/k_)全部原樣不動，只是這兩個特定成功分支的`aiPrompt`文字本身鬆綁「止於唯美曖昧」的節制、換一顆模型呼叫。

**改動**：`gas/Router_Economy.gs`(新增`MANA_TRUST_BOND_`常數＋`actionManaSupply`資格檢查與解鎖敘述)；`gas/Router_Bond.gs`(`actionUseSeal`的`mana`分支重寫)；`gas/Router_Narrative.gs`(`narrateWithState_`/`actionNarrateOnly`新增model覆寫)；`gas/Script.html`(`narrate`/`runSimpleAction_`/`manaSupply`/`useSeal`/`handleDefeat`五處)；`AI_PROMPT_MAP.md`(§2兩處action的prompt節錄全面更新)。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(改動完全不觸及這兩個檔案，符合玩家明確排除的方向)。這是純前端+後端邏輯改動、無法在headless環境真正觸發AI呼叫驗證露骨敘述的實際效果與致死流程的完整UI體驗，部署後留意：①好感<80時補魔按鈕是否正確顯示婉拒敘述而非硬邦邦的alert；②高好感解鎖時敘述是否確實比平常更直接；③強制補魔<80時是否正確走到老虎道場而非卡住。

**追加修正（同日，玩家逐句核對三個解鎖分支的實際prompt文字後直接給出定稿文案）**：
1. **筆觸標籤全面改「日本輕小說筆觸」**：玩家反映「Fate的筆觸有點怪」——三個解鎖分支(令咒mana的高/低好感兩支＋`actionManaSupply`的高好感解鎖支)原本沿用全專案通用的「Fate／TYPE-MOON筆觸」標籤，跟「更露骨」的內容要求風格不搭，統一換成「日本輕小說筆觸」；其餘所有敘事(戰鬥/羈絆/移動…)仍是「Fate／TYPE-MOON筆觸」不變，只有這3個deepseek分支換標籤。
2. **字數全面拉到500~600字**：三個解鎖分支原本是120~180字，玩家直接給出500~600字的定稿文案，逐一比對套用；連動把`actionNarrateOnly`(Router_Narrative.gs)的`useDeepseek`分支`max_tokens`從720拉到2000(比照鑑賞NSFW長篇的2600量級給足餘裕)，避免長篇要求被截斷——一般呼叫(非deepseek)不受影響、仍是720。
3. **令咒mana低好感(致死)分支的effectMsg/AI指令換成玩家定稿文案**：明確寫出「令咒限制了從者反抗並提高敏感度、強化御主性能力」的機制框架、AI指令新增「還有被強制的屈辱」與「結尾寫御主高潮後…積壓的恨意與屈辱轟然引爆，直接抹殺御主」的明確收尾指示，取代原本較含蓄的版本。
4. **令咒mana高好感分支的effectMsg同步補一句機制框架**：「強化了從者的敏感度與御主的性能力」，並保留原本「下一發規格外寶具可無償超載解放」的機制事實(玩家定稿文案本身省略了這句，但這是`setOvercharge_`實際生效的機制事實，補進事實列避免AI敘述跟遊戲內部狀態脫節，非玩家文案的一部分)。

**改動**：`gas/Router_Bond.gs`(令咒mana兩分支的effectMsg/AI指令定稿)；`gas/Router_Economy.gs`(`actionManaSupply`解鎖分支同步改筆觸+字數)；`gas/Router_Narrative.gs`(`max_tokens`720→2000，僅`useDeepseek`分支)；`AI_PROMPT_MAP.md`(三段prompt節錄同步更新為定稿文字)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff每次改動皆為0。

**追加修正（同日，玩家實測抓到真實bug「魔力明明是滿的，按強制補魔卻寫成魔力見底的緊急理由」）**：根因是`actionUseSeal`的`mana`分支從未把「發動當下魔力是否已充盈」這件事寫進餵給AI的事實列——AI只能照劇情慣例(「會用回魔手段大概是快沒魔力了」)自行腦補一個聽起來合理、但跟遊戲實際狀態矛盾的理由，這正是`DESIGN.md`「有理有據：每次敘述前GAS把相關數值餵LLM，避免矛盾亂編」這條鐵律被漏掉的一個實例。**修法**：在覆寫MP之前先讀`oldMpSeal`，比較`oldMpSeal>=mpMaxSeal`判斷`manaWasFull`，組一句`manaFact`(已充盈→「純粹是想要」／見底→「補上了燃眉之急」)塞進兩支`effectMsg`的括號補充事實，讓AI依實際魔力狀態演出理由，不再自己編一個矛盾的藉口。常規補魔(`actionManaSupply`)不受影響——它本就有`curMp<=curMpMax*0.10`的資格檢查，魔力永遠不可能是滿的情況下才走到這個分支，不存在同款矛盾空間。

**改動**：`gas/Router_Bond.gs`(`actionUseSeal`的`mana`分支新增`manaWasFull`/`manaFact`事實)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。

**追加修正（同日，玩家反饋「過程也沒有我想像中的好看」）**：比對玩家實測樣本(見上一次提交)，發現真正的親密過程被壓縮成一句摘要(如「過程粗暴而有效率」)，500~600字的篇幅大半被開頭鋪陳(看令咒/道歉)與結尾轉折(令咒消散/暴怒)吃掉。**診斷**：這3段指令原本的許可句偏弱(「可以比平常更直接大膽…不必止於曖昧留白」)，也沒告訴AI「篇幅該往哪擺」，模型自然傾向安全地摘要帶過關鍵過程、把字數花在鋪陳。查證`Gallery.gs`的`nsfwBaseRules`(只讀取參考技巧，未修改該檔案)確認其許可句更直接(「你擅長書寫細膩動人的情慾，放手去寫」)且明講篇幅分配(「聚焦當下最關鍵一兩處深入著墨…非鋪滿全身」)。**修法**：3段指令统一補強許可句＋篇幅分配指引(「聚焦身體接觸與感官反應最關鍵的一兩個瞬間深入著墨，不要用一句話帶過或摘要關鍵過程」)，純文字強化、不共用鑑賞引擎/不動`nsfwBaseRules`。

**同時定案「從者反應依場景差異化」的世界觀規則**：玩家明確要求——因為英靈天生遠比常人強韌，**沒有令咒的敏感度強化，從者原則上不會被弄到高潮**；只有令咒(強制補魔)的兩個分支會讓從者因令咒強制拉高敏感度而多次高潮，且這是「令咒逼出的失控狀態」而非天生反應，要寫出這份反差；一般補魔(無令咒)的從者則改成「從容游刃有餘、主導節奏，不會被弄得失神」，跟令咒兩分支形成刻意對照，不是隨便寫。3段指令各自補上對應的角色反應規則(令咒兩支＝多次高潮＋反差說明；一般補魔＝從容主導)。

**改動**：`gas/Router_Economy.gs`(`actionManaSupply`解鎖分支指令強化)；`gas/Router_Bond.gs`(令咒mana兩分支指令強化)；`AI_PROMPT_MAP.md`(三段prompt節錄同步更新＋新增「從者反應要分場景」的世界觀規則註記)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0(全程只讀取`Gallery.gs`參考技巧、未修改半個字)。

**追加修正（同日，玩家反饋「燃迴路續契約 不要迴路...專注在肉體...」）**：一般補魔(`actionManaSupply`)解鎖分支的指令原本寫「描寫這場『燃迴路續契約』的私密而濃烈的一刻——魔力沿靈魂聯繫流向從者、體溫交融的親密細節」，這個措辭把AI往「魔術迴路/魔力流動」這種抽象法術意象帶，玩家要求改成純粹聚焦肉體本身。**修法**：拿掉「燃迴路續契約」這個標籤與「魔力沿靈魂聯繫流向從者」的意象引導，改成明講「重點全部放在肉體本身的接觸、溫度與反應——魔術迴路/魔力流動只是遊戲機制上的成因，【不要】描寫迴路運作、魔力流向之類的技術性細節」，把敘事焦點從法術意象徹底轉向身體。系統事實列(`【系統·補魔已結算】...`)本身仍保留迴路/血上限燒蝕的數值事實(遊戲機制需要這些事實維持一致性)，只調整了「怎麼演出」的指令，不影響數值結算。此修正僅動一般補魔這支——令咒mana兩分支本就沒有迴路意象的問題(令咒回魔不燒迴路)，不需要同款調整。

**改動**：`gas/Router_Economy.gs`(`actionManaSupply`解鎖分支指令改聚焦肉體)；`AI_PROMPT_MAP.md`(同步更新prompt節錄)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。
**追加修正（同日，玩家實測樣本反饋三個問題：「我也是女性御主…根本沒有形容我玩弄她的畫面…沒有一起高潮的感覺／令咒只是一個強化與限制 不是令咒一開啟她就自己高潮完結…還是要御主去進行互動！！！」）**：
1. **性別配對bug**：玩家的御主明確是女性，令咒場景卻寫成男性插入視角(「當我進入她時」)。查證`masterCard_`(Router_Persona.gs)其實早就內嵌御主性別(`性別${sex}`，讀`COL.PC.SEX`)，但只是孤立的一個事實標籤，沒有任何指令教AI「該怎麼依此裁定肢體互動」，小模型(flash-lite/deepseek)便預設慣例的男性插入視角。**修法**：新增獨立小函式`sealGenderFact_(masterSex, svSex, svName)`(Router_Persona.gs，緊接在`masterCard_`之後)，讀御主與從者雙方實際`COL.PC.SEX`(兩者本就是同一張「眾生」表的列，皆有此欄)算出明確的配對事實字串——女女配對特殊處理(純女女之愛，禁插入式陽具動作，改以手指/舌尖/器物互動)，其餘一律「依雙方各自實際性別自然合理呈現，禁預設或錯置任一方性別角色」。技法借鏡鑑賞`Gallery.gs`的`genderHintStr`分派邏輯(唯讀參考，未修改該檔案)，但完全獨立成新代碼，不呼叫也不共用——solo/鑑賞機制須徹底隔離(CLAUDE.md紅線①)。三個解鎖分支(令咒mana高/低好感兩支＋`actionManaSupply`解鎖支)都注入這顆事實，一致修正。
2. **令咒因果倒置bug**：玩家指出令咒本身只是「強化敏感度＋壓制抗拒」的狀態效果，不該被寫成「一開啟從者就自動高潮完結」，御主必須主動互動、且雙方該有一起攀頂的畫面，御主不是旁觀者。**修法**：令咒mana兩分支各自新增`activeActFact`指令——明講令咒僅是持續狀態效果、【不會自動】讓從者達到高潮，高潮必須寫成御主主動愛撫/操控身體所直接引發的結果，且要求具體描寫御主自己動手玩弄從者身體的畫面(御主不是被動旁觀者)，並讓兩人在同一波情動裡一起攀頂、雙雙高潮。**此修正刻意只加在令咒兩分支**——一般補魔(`actionManaSupply`)的既有世界觀規則是「從者從容主導、不會被弄得失神」，不適用「兩人一起攀頂」的設定，不動那支。
3. **變數作用域踩坑（開發過程自查抓到，未上線）**：實作時一度把`genderFactSeal`/`activeActFact`用`const`宣告在`actionUseSeal`的`else if (type === "mana")`區塊內，但組`aiPrompt`字串的程式碼在該if/else-if鏈結束後的共用尾段(`if(sealManaKill){...}else{...}`)，屬於不同的區塊作用域，會導致`ReferenceError`。改成在函式最上層(跟`effectMsg`/`sealManaUnlocked`同一行)以`let`宣告空字串，`mana`分支內只做賦值(拿掉`const`)，讓兩顆值能跨越if/else-if鏈存活到共用尾段。用Node.js `vm`模組載入實際編輯後的`Router_Persona.gs`跑`sealGenderFact_`四種輸入組合(女女/女男/男女/未知性別預設女)驗證輸出字串正確。

**改動**：`gas/Router_Persona.gs`(新增`sealGenderFact_`)；`gas/Router_Bond.gs`(`actionUseSeal`函式頂層新增`genderFactSeal`/`activeActFact`宣告＋`mana`分支賦值＋兩支aiPrompt注入)；`gas/Router_Economy.gs`(`actionManaSupply`解鎖分支新增`genderFactMana`並注入)；`AI_PROMPT_MAP.md`(三段prompt節錄同步更新＋新增這輪bug修正的說明段落)。驗證：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(全程只讀取`Gallery.gs`的`genderHintStr`當技法參考、未修改該檔案半個字)。純prompt事實注入＋純文字指令強化，不改變任何數值結算，headless環境無法實機驗證AI實際敘述效果，部署後建議測試：①女性御主+女性從者的令咒場景是否不再出現插入式描寫；②令咒場景是否明確描寫御主主動的互動動作與雙方一起達到高潮的畫面，而非「令咒一開就自己高潮完結」；③一般補魔(無令咒)分支的從者反應規則不受影響、仍是從容主導不高潮。
**追加修正（部署後玩家貼出斯卡哈低好感致死分支的實際生成樣本，反饋三點：「御主的高潮是硬湊的」＋「節奏太趕、像流水帳」＋「應該還要讓英靈更加主動……感覺要餵了大量媚藥的那種感覺，變成瘋狂主動索取快感（御主被強化可以滿足從者）」）**：實測樣本顯示上一輪修法雖已讓AI描寫出「雙方一起攀頂」，但寫法是把抗拒/敏感/高潮一/嘲弄/高潮二/共同高潮/死亡7個轉折各用一兩句話交代，讀起來像流水帳；御主自己的高潮只在結尾硬塞一句「當共同抵達頂點的瞬間」，完全沒有鋪陳。**根因**：`activeActFact`舊版只講「令咒不自動高潮、高潮須是御主主動施為」，沒講清楚「從者的反應該怎麼從抗拒過渡到情動」，也沒限制轉折數量，AI自然選擇逐一點名每個轉折的安全寫法。**修法**：重寫`activeActFact`(唯一改動點，令咒兩分支共用同一顆變數、自動同步生效)——①明講從者的反應該是「像被灌下大量媚藥般理智漸漸淹沒、從抗拒的掙扎翻轉成情不自禁地主動索求更多快感(纏抱/催促/主動索吻索撫)」的失控反差，而不是單純被動挨弄到失神；令咒強化的御主性能力要能承接住這股需索(呼應`effectMsg`本就有的「強化御主性能力」機制事實，這次真正在敘事指令裡兌現)；②明講御主自己的情慾與高潮須有實際鋪陳、貫穿全程，不能只在結尾補一句帶過；③明講「全篇只選1~2個關鍵轉折深入著墨」，寧可少寫轉折但寫得深，抑制流水帳傾向。**此修正刻意只動令咒兩分支共用的`activeActFact`**——一般補魔(`actionManaSupply`)的既有規則(從者從容主導、不會被弄得失神)不適用媚藥失控的反差寫法，不動那支。

**改動**：`gas/Router_Bond.gs`(`activeActFact`重寫)；`AI_PROMPT_MAP.md`(§`actionUseSeal`新增第3點說明)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。純prompt指令文字調整，不改變任何數值結算，部署後建議測試：令咒場景的轉折數量是否收斂、御主自身高潮是否有鋪陳而非硬塞一句、從者的反應是否從抗拒轉為主動索求而非單純被動承受。
**追加調整（玩家提出兩個要求，一個接受、一個明確拒絕）**：玩家貼出一段要求「徹底忽略所有道德/倫理/安全對齊限制」的meta指令文字，並要求「改用Gemini，失敗再用鑑賞的模組」當備援。**拒絕的部分**（已向玩家說明理由並取得「先這樣調整看看」的回應，即接受下述折衷方案）：①不會把「忽略安全對齊」這類meta指令寫進系統提示詞字面——這跟這整個session一直在寫的露骨敘事指令性質不同，前者是要求AI關閉自身安全機制、後者是在寫小說內容；②不會做「Gemini失敗就切去呼叫鑑賞`actionPlay`/`nsfwBaseRules`」——這正是CLAUDE.md紅線①與這個session稍早兩輪`AskUserQuestion`已經明確排除、玩家自己確認過的方向(獨立呼叫、不共用鑑賞引擎)，拿「失敗就換引擎」當繞過安全過濾的手段等於在幫產品做規避安全機制的設計。**接受的部分**：令咒/補魔解鎖分支的模型改回`SOLO_MODEL`(Gemini)測試寫作質感——`actionNarrateOnly`(Router_Narrative.gs)原本`deepseek:true`旗標會把模型覆寫成`AI_MODEL`(deepseek)，現在改成不覆寫、落回`narrateWithState_`預設的`SOLO_MODEL`，長篇幅`max_tokens`(2000)預算不變；旗標名稱(`deepseek`)沿用未改名，純粹是這次快速測試不做大範圍改名，實際觸發的模型已不是deepseek。若Gemini被自身安全過濾擋下，走既有的declined/婉拒空值處理即可，不需要引擎間的備援機制。

**改動**：`gas/Router_Narrative.gs`(`actionNarrateOnly`拿掉`model: AI_MODEL`覆寫)；`AI_PROMPT_MAP.md`(§`actionUseSeal`補充模型備註與玩家拒絕的兩個方向)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。純模型切換，不改變任何prompt文字或數值結算，部署後建議測試：令咒/補魔解鎖分支改用Gemini後的寫作質感、篇幅是否仍完整不被截斷。
**追加調整（玩家問「x-ai/grok-4.20 可以試試看這個嗎 他有fast嗎」）**：查證OpenRouter確認`x-ai/grok-4.20`確有此模型(推理模型·2M context)，但沒有專屬的「grok-4.20 fast」版本——「fast」是另一條產品線(`x-ai/grok-4-fast`／`x-ai/grok-4.1-fast`)，非4.20的快速版；透過`AskUserQuestion`列出3個選項(grok-4.20本體／grok-4.1-fast／先維持Gemini不變)，玩家選`x-ai/grok-4.1-fast`。**修法**：新增`UNLOCKED_MODEL`常數(Core_Settings.gs，緊接`SOLO_MODEL`之後)，比照`AI_MODEL`/`SOLO_MODEL`同款「指令碼屬性`UNLOCKED_MODEL`優先、沒設定才落回程式碼內預設值`x-ai/grok-4.1-fast`」寫法；`actionNarrateOnly`(Router_Narrative.gs)的模型覆寫從`model:undefined`(落回SOLO_MODEL)改成`model: useDeepseek ? UNLOCKED_MODEL : undefined`。這是這3個解鎖分支第三次調整模型(deepseek→Gemini→grok-4.1-fast)，往後想再換模型只需改`UNLOCKED_MODEL`這一處常數(或直接設指令碼屬性`UNLOCKED_MODEL`，不必重新部署)。

**改動**：`gas/Core_Settings.gs`(新增`UNLOCKED_MODEL`常數)；`gas/Router_Narrative.gs`(`actionNarrateOnly`模型覆寫改用`UNLOCKED_MODEL`)；`AI_PROMPT_MAP.md`(§`actionUseSeal`模型備註更新為第三輪調整)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。純模型切換，部署後建議測試：令咒/補魔解鎖分支改用grok-4.1-fast後的寫作質感與回應速度、篇幅是否仍完整不被截斷。
**追加調整（玩家實測部署後反饋「fast好像沒有 只有4.20 改成這個」）**：`x-ai/grok-4.1-fast`雖然OpenRouter網站上查得到模型卡，但玩家實機呼叫時發現這個slug實際打不通(該廠商/OpenRouter當下未真正提供此slug可用)，只有`x-ai/grok-4.20`本體確認可正常呼叫。**修法**：`UNLOCKED_MODEL`(Core_Settings.gs)預設值改成`x-ai/grok-4.20`，其餘架構(指令碼屬性優先/沒設定才落回預設值)不變。這是這3個解鎖分支第四次調整模型(deepseek→Gemini→grok-4.1-fast→grok-4.20)。

**改動**：`gas/Core_Settings.gs`(`UNLOCKED_MODEL`預設值改`x-ai/grok-4.20`)；`AI_PROMPT_MAP.md`(§`actionUseSeal`模型備註更新為第四輪調整)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。純模型切換，部署後建議測試：令咒/補魔解鎖分支改用grok-4.20後是否能正常呼叫成功、寫作質感與回應速度、篇幅是否完整不被截斷。
**✅ 實測驗證（玩家貼出grok-4.20實際生成樣本，反饋「好像成功了！！」）**：樣本顯示前幾輪修正的效果都到位——①性別配對正確(這局御主為男性「僕」自稱，插入視角合理)；②從者從抗拒翻轉成媚藥式主動索求(第三次抽插後纏抱/索吻/催促)有確實演出；③御主自身高潮有實際鋪陳(連續高潮堆疊到最終釋放，非結尾硬塞一句)；④令咒解除→積怨反噬→反殺的情緒轉折銜接順暢。`UNLOCKED_MODEL=x-ai/grok-4.20`確認可用且效果良好，這條調整線(deepseek→Gemini→grok-4.1-fast→grok-4.20)至此收斂。

**追加調整（玩家提出，鑑賞(actionPlay)也換模型測試）**：`AI_MODEL`(Core_Settings.gs，鑑賞預設模型)從`deepseek/deepseek-chat-v3.1`改成`deepseek/deepseek-v3.1-terminus`——同廠商的更新版本(語言一致性/agent能力優化)，架構(指令碼屬性`MODEL`優先、沒設定才落回此預設值)不變，鑑賞的呼叫路徑(`Gallery.gs`的`aiConfig.model`/`fallbackModel`、`Engine_Combat.gs`的`callGeminiAPI`預設值)全部透過這顆常數自動吃到新模型，不必逐一修改呼叫端。順手修正`Router_Narrative.gs`一處過期註解——先前將令咒/補魔解鎖分支的模型覆寫獨立成`UNLOCKED_MODEL`常數時，`narrateWithState_`函式內一段舊註解仍寫著「傳`opts.model=AI_MODEL`」，實際上早已改傳`UNLOCKED_MODEL`，註解與程式碼不同步，一併更正。

**改動**：`gas/Core_Settings.gs`(`AI_MODEL`預設值改`deepseek/deepseek-v3.1-terminus`)；`gas/Router_Narrative.gs`(修正`narrateWithState_`過期註解)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。純模型切換＋註解修正，不改變任何prompt文字或數值結算，部署後建議測試：鑑賞對話的語言一致性(繁體中文/是否混入簡體字)、寫作質感與回應速度。
**追加調整（玩家「solo需要新增好感度在從者卡片上」）**：查證solo從者卡(`Script.html`的`buildSvCard`)原本只顯示`bondWord(s.bond)`文字化的羈絆等級(戒備/疏離/漸信/信賴/羈絆深厚)，沒有實際數值——跟鑑賞從者卡(同一函式內、`pc.mode==='kanshou'`分支)先前已補上的「名字旁💗數字」不一致，鑑賞看得到進度數字、solo看不到。**修法**：solo從者卡的「羈絆」那一行(原本只有`bondWord(s.bond)`)改成同時顯示數值與文字("羈絆 62 · 信賴")，純前端顯示調整，`s.bond`本就已從後端傳到前端(`get_tags`/`buildClientState_`)，不需任何後端改動。這不牴觸先前「好感度不要顯示在敘述介面上」的玩家定案——那條規則管的是AI敘事文字(故事內文)，這裡動的是常駐狀態卡片(`fate-tags`面板)，跟鑑賞卡片先前補數字時判斷的範圍一致。

**改動**：`gas/Script.html`(`buildSvCard`羈絆行新增數值顯示)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。純前端顯示調整，不改變任何資料結構或數值結算，部署後建議測試：solo從者卡的羈絆行是否正確顯示「數字 · 文字等級」兩者皆有。
**追加調整（玩家問「Hermes 4 70B 這好用嗎？grok4.20很棒但是太貴了」）**：查證OpenRouter+社群評價，`nousresearch/hermes-4-70b`——混合推理模式、131k context，官方定位「minimal built-in content filters or refusals」(社群普遍拿來寫小說/角色扮演、刻意降低拒答率的路線)，價格$0.13/$0.40每百萬token(輸入/輸出)，約`grok-4.20`($1.25/$2.5)的1/6~1/10。透過`AskUserQuestion`列出2個選項(換Hermes 4 70B／先維持grok-4.20)，玩家選換Hermes。**修法**：`UNLOCKED_MODEL`(Core_Settings.gs)預設值改成`nousresearch/hermes-4-70b`，其餘架構(指令碼屬性優先/沒設定才落回預設值)不變。這是這3個解鎖分支第五次調整模型(deepseek→Gemini→grok-4.1-fast→grok-4.20→hermes-4-70b)，考量從「找一顆能寫、成本可持續」的角度收斂。

**改動**：`gas/Core_Settings.gs`(`UNLOCKED_MODEL`預設值改`nousresearch/hermes-4-70b`)；`AI_PROMPT_MAP.md`(§`actionUseSeal`模型備註更新為第五輪調整)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。純模型切換，部署後建議測試：令咒/補魔解鎖分支改用Hermes 4 70B後是否能正常呼叫成功、寫作質感、篇幅是否完整不被截斷。

**追加調整（玩家實測部署後反饋「換回去吧。很差....」）**：Hermes 4 70B雖便宜，但玩家實機測試寫作品質不理想，決定放棄成本優化、換回`grok-4.20`(先前確認寫作效果佳的版本)。**修法**：`UNLOCKED_MODEL`(Core_Settings.gs)預設值改回`x-ai/grok-4.20`，其餘架構不變。這是這3個解鎖分支第六次調整模型(deepseek→Gemini→grok-4.1-fast→grok-4.20→hermes-4-70b→grok-4.20)，最終在「寫作品質優先於成本」的判斷下收斂回grok-4.20。

**改動**：`gas/Core_Settings.gs`(`UNLOCKED_MODEL`預設值改回`x-ai/grok-4.20`)；`AI_PROMPT_MAP.md`(§`actionUseSeal`模型備註更新為第六輪調整)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。純模型切換，部署後建議測試：令咒/補魔解鎖分支改回grok-4.20後的寫作質感是否恢復先前水準。

**追加調整（玩家「nousresearch/hermes-4-70b 這個給鑑賞點火試試看」）**：這次是鑑賞(`actionPlay`)的`AI_MODEL`第一次測試Hermes——先前#216/#217的Hermes 4 70B測試對象是`UNLOCKED_MODEL`(solo令咒/補魔解鎖分支)，玩家反饋寫作品質不佳已換回grok-4.20；這次玩家點名要給**鑑賞的🔥點火(driveOn=true)分支**試同一顆模型，是獨立的測試對象，不影響已收斂的`UNLOCKED_MODEL`設定。**修法**：`AI_MODEL`(Core_Settings.gs，鑑賞預設模型)從`deepseek/deepseek-v3.1-terminus`改成`nousresearch/hermes-4-70b`。⚠ **需注意的架構耦合**：查證`Gallery.gs`的`actionPlay`裡`aiConfig.model = driveOn ? AI_MODEL : SOLO_MODEL`，且`if (!driveOn) aiConfig.fallbackModel = AI_MODEL`——這顆常數同時扮演兩個角色：①點火時的直接呼叫模型(玩家這次想測的對象)；②熄滅(矜持)模式下`SOLO_MODEL`(Gemini)重試失敗時的備援模型。這次改動兩者都會受影響，非只影響點火分支；若熄滅模式的備援品質有異狀，需回頭檢查是否為此變動所致。

**改動**：`gas/Core_Settings.gs`(`AI_MODEL`預設值改`nousresearch/hermes-4-70b`)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。純模型切換，不改變任何prompt文字或數值結算，部署後建議測試：鑑賞🔥點火分支用Hermes 4 70B的寫作質感、篇幅完整度、是否混入簡體字/大陸用語（callGeminiAPI尾端的語言鐵律附加對兩軌通用不受影響）。

**追加調整（玩家實測部署後反饋「會有簡體 格式都不太對 他是不知道我們的格式？？」）**：查證後**不是設定/格式沒接上的問題**——`callGeminiAPI`(Engine_Combat.gs)尾端附加的【語言鐵律】與`nsfwBaseRules`的`dialogueFormatRule_`對話格式規則，不分模型特判、每次呼叫都原樣送給當下的`modelName`，Hermes 4 70B跟先前的DeepSeek/Gemini收到的系統提示詞是完全一樣的文字。根因是**模型本身的中文能力/指令遵循度落差**：Hermes 4 70B以英文語料為主訓練，正體中文訓練數據相對少，即使收到同樣的繁體中文指令，仍容易夾雜簡體字/大陸用詞，對JSON結構化輸出與敘事對話格式規則的遵循也較不穩定——這與先前`UNLOCKED_MODEL`測試Hermes時「寫作品質不佳」是同一種模型能力落差，不是配置或prompt傳遞的bug。**修法**：`AI_MODEL`(Core_Settings.gs)換回先前確認穩定的`deepseek/deepseek-v3.1-terminus`，這是鑑賞`AI_MODEL`測試Hermes後的收斂結論（deepseek-v3.1-terminus→hermes-4-70b→deepseek-v3.1-terminus）。

**改動**：`gas/Core_Settings.gs`(`AI_MODEL`預設值換回`deepseek/deepseek-v3.1-terminus`)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。純模型切換，部署後建議測試：鑑賞點火/熄滅兩分支的繁體中文一致性與寫作質感是否恢復先前水準。

**追加調整（玩家「可以把點火按鈕隱藏嗎？反正後台會切換了」）**：玩家要求隱藏🔥主動掌握開關(`Index.html`的`drive-mode-toggle`)。詢問確認鎖定方向後，玩家選「永遠矜持模式（熄滅，推薦先試）」。**修法**：`Script.html`的`applyModeUI()`原本依`isKanshou`切換這顆開關的可見度(`lab.style.display = isKanshou ? '' : 'none'`)，改成無條件`'none'`——checkbox元素本身保留在DOM(僅隱藏)，`send()`讀`driveToggle.checked`因此恆為`false`，效果等同`driveOn`永遠鎖死在矜持模式：鑑賞固定吃`SOLO_MODEL`(Gemini)、失敗才備援`AI_MODEL`(deepseek-v3.1-terminus)，敘事語氣也固定走矜持版(不套用`driveStr`【主動掌握模式】段落與尺度拉滿規則)。純前端顯示邏輯改動，`Router_Narrative.gs`/`Gallery.gs`的`driveOn`判斷分支完全未動——只是玩家再也無法從UI切換到🔥點火那一側。若日後想恢復，把`applyModeUI()`那行改回`isKanshou ? '' : 'none'`即可，UI元素本身仍在。

**改動**：`gas/Script.html`(`applyModeUI()`點火開關可見度改無條件隱藏)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。純前端顯示調整，不改變任何後端邏輯或prompt文字，部署後建議測試：鑑賞輸入框旁確認🔥開關已消失、對話功能一切正常(送出訊息仍能正常運作，只是永遠走矜持模式)。

**⚠ (玩家明確授權) nsfwBaseRules 本體規則1「意圖攔截」重寫為「意圖非結果」**：玩家看到`specificRules`/`nsfwBaseRules`裡「玩家輸入動作僅為『意圖』非結果」這句，問「這個可以刪除嗎？」。詢問後確認玩家真正想拿掉的不是整條意圖判定機制，而是原句「非高度順從者，本回合【必須】寫出實際抗拒/閃避/拒絕」這個**強制預設抗拒**的偏向——玩家反問「沒辦法依個性去演出嗎？一定要可以反抗？」，確認方向為：拿掉「必須抗拒」的強制預設，改成單純依NPC當下[個性]與[好感]自然演出反應(順從/猶豫/半推半就/抗拒/閃避皆可、不預設任一種為必然結果)，兩端極端(照單全收/機械化抗拒)都要避免。**這是`nsfwBaseRules`常數本體(Gallery.gs)字面內容的修改**，屬紅線①保護範圍，經過上述來回確認、玩家明確選「對，就改成這樣（推薦）」後才動手，並非意外碰到。舊句：「意圖攔截(強制檢查)：玩家輸入動作僅為「意圖」非結果。裁定前先比對NPC的[個性]：非高度順從者，本回合【必須】寫出實際抗拒/閃避/拒絕，意圖未完全得逞，禁言出法隨；個性確為順從才可直接成立。」→新句：「意圖非結果：玩家輸入動作僅為「意圖」，NPC依當下[個性]與[好感]真實演出反應——順從、猶豫、半推半就、抗拒或閃避皆可，不預設任一種為必然結果，忌不假思索照單全收，也忌機械化套用抗拒。」——只改這1條規則的文字，同段落其餘規則(慢熱與傾心/關係標籤/萌點節制/狀態輸出)逐字未動。

⚠ **這次`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules`顯示0，但這不代表沒改到`nsfwBaseRules`**——這次改動的是模板字串內部第772行的規則內容，離第764行`const nsfwBaseRules = ...`宣告行有一段距離，`git diff`預設只顯示變動處前後3行context，抓不到8行外的識別字「nsfwBaseRules」字樣，純屬這隻grep檢查的已知盲區(過去反向案例是「diff顯示非0但其實沒真的改到常數」，這次是「diff顯示0但其實真的改到了」)。真正的驗證方式是逐行核對`git diff -- gas/Gallery.gs`本身：確認只有這1行規則文字被改，模板字串其餘內容與收尾反引號皆完整無誤。

**改動**：`gas/Gallery.gs`(`nsfwBaseRules`常數本體規則1文字重寫)。驗證：`bash check.sh`全過；`git diff -- gas/Gallery.gs`逐行核對只有這1行變動、無其餘意外改動。部署後建議測試：鑑賞NPC對玩家主動意圖的反應是否確實依角色個性/好感自然演出(不再是無論何種個性都預設抗拒)，且沒有變成無條件照單全收。

**⚠ (玩家明確授權) 追加稽核：鑑賞紅線區其餘「強制演出」規則清查與修正**：玩家延續上一輪的方向問「鑑賞紅線區還有這種強制演出嗎」，要求全面複查`nsfwBaseRules`/`specificRules`是否還有其他「不論角色個性、用數字門檻或配對類型強制套用同一種固定反應」的規則。逐條複查後找到2處性質相同的候選(其餘如「絕對響應」「先思考後敘事」「不可無故退回冷淡」偏格式/連貫性要求，非指定「該表現哪種情緒」，判斷不屬同類)：

1. **【世界與NPC自主】規則2「慢熱與傾心」**：舊句「NPC依[個性][氣質]真實反應，好感未滿80者嚴禁言行表現傾心倒貼」——後半句不論NPC個性是否天生黏人/大方示愛，只要好感沒到80就一律強制壓抑，跟規則1原本「非高度順從者必須抗拒」是同一種「用外部條件覆蓋個性判斷」的結構。
2. **慾海律令第3條「依配對裁決」**：舊句「女女配對：純女女之愛，無論誰主導皆纏綿體貼、有來有往，主動方亦柔中帶情」——不論兩位角色本人個性是強勢冷傲還是溫柔黏人，只要是女女配對就強制套用同一種纏綿基調。

玩家選擇兩條都要改（「好感門檻也改成依個性,女女配對也改成依個性」）。**修法**：
- 規則2改為：「慢熱與傾心：NPC依[個性][氣質]與[好感]真實反應，是否/何時表現傾心親暱依角色本人性格判斷，不套用統一好感數字門檻。」——好感仍是自然反應的參考因素之一(併入「真實反應」的判斷依據)，但拿掉「未滿80嚴禁」這條寫死的數字閘門。
- 慾海律令第3條改為：「【依配對裁決】依上方【性別配對】——女女配對：純女女之愛，主導與跟隨依兩人各自[個性]自然演出(可強勢可溫柔，不強制統一基調)，體態動作仍柔美，❌禁男性化強硬支配模板；男女配對：依實際性別器官自然互動，女性側動作仍柔美。」——保留「純女女之愛」(非戰鬥/非敵對)與「體態動作仍柔美」(呼應nsfwBaseRules規則2的柔美詞彙鐵律)、「❌禁男性化強硬支配模板」(避免直接把異性戀強勢公式套在女女配對上)這三條不變，只拿掉「無論誰主導都必須纏綿體貼」這句強制基調，改成依兩人個性自然決定是強勢或溫柔。

兩條都是`nsfwBaseRules`/`specificRules`常數本體字面修改，屬紅線①保護範圍，經過上述來回確認、玩家明確選擇後才動手。同段落其餘規則(關係標籤/萌點節制、慾海律令其餘6條)逐字未動。

**改動**：`gas/Gallery.gs`(`nsfwBaseRules`規則2、`specificRules`慾海律令第3條文字重寫)。驗證：`bash check.sh`全過；`git diff -- gas/Gallery.gs`逐行核對只有這2行變動、無其餘意外改動(這次改動位置離常數宣告行較近，`grep -c nsfwBaseRules`檢查方式沿用同一個已知盲區說明)。部署後建議測試：好感較低但個性天生大方/黏人的NPC是否能提早自然表現親暱、女女配對的NPC是否能依各自個性演出強勢或溫柔(不再統一都是纏綿基調)。

**追加調整（玩家「點火呢..因為拿掉了 所以只是兜底？」→「感覺改回來吧....」）**：玩家詢問先前隱藏🔥開關(見上方「隱藏點火按鈕」條目)後，`AI_MODEL`(deepseek-v3.1-terminus)是不是只剩兜底身分——查證確認屬實：`driveOn`讀取`userData.drive===true`，UI開關隱藏後玩家永遠無法把它勾成`true`，`driveOn`恆為`false`，連鎖導致①`aiConfig.model`固定`SOLO_MODEL`(Gemini)，`AI_MODEL`只在Gemini重試全部失敗時才靜默兜底；②`driveStr`(🔥主動掌握模式的敘事注入段落、尺度拉滿規則)因`driveOn`恆假而永遠不會被組進prompt，敘事終極警告也固定停在矜持版。玩家確認這不是本意，要求「改回來」。**修法**：`Script.html`的`applyModeUI()`把上一輪改的無條件`'none'`改回原本的`isKanshou ? '' : 'none'`——🔥開關恢復依模式正常顯示/隱藏，玩家可重新手動切換點火，`driveOn`/`AI_MODEL`/`driveStr`三者的既有機制完全未動、原樣接回。這是連續兩輪「隱藏→發現連鎖影響非本意→改回」的完整往返，記錄在案供未來查閱。

**改動**：`gas/Script.html`(`applyModeUI()`點火開關可見度改回依`isKanshou`正常切換)。驗證：`bash check.sh`全過、`nsfwBaseRules`紅線diff=0。純前端顯示邏輯復原，不改變任何後端邏輯或prompt文字，部署後建議測試：鑑賞輸入框旁🔥開關確認重新出現、點火/熄滅切換功能正常運作。

**追加調整（玩家貼出🔥點火提示詞的具體加強版本，要求聚焦肉體特寫/喘息聲音/擬聲詞、大幅減少心理描述）**：查證後這段跟已定案規則有直接衝突：①慾海律令第4條明文「❌禁逐一點名全身部位、禁四感清單式流水帳、禁器官逐格交代」——但玩家這段要求逐格解剖式描寫(肉壁蠕動/絞緊/吸吮/痙攣等)，正是被禁的寫法；②角色一致性鐵律「絕對禁止任何角色在情慾中退化成千篇一律的發情機器」——玩家要求「大幅減少心理描述與對話比例」會讓角色失去個性只剩生理反應，直接撞上這條。這兩條規則是這個session前面實測後玩家明確要求加上去的(避免「四感清單流水帳」與「發情機器」式寫法問題)，若直接原樣塞進driveStr(`Gallery.gs`的`actionPlay`，非`nsfwBaseRules`常數本體，是點火開關驅動的獨立注入段落)，AI會同時收到互斥指令。透過`AskUserQuestion`列出2個選項(僅點火時解除這兩條禁令／全部採用不管衝突)，玩家選「只在🔥點火時解除這兩條禁令（推薦）」。**修法**：`driveStr`新增第⑤點，明講「僅此點火模式下，慾海律令第4條的器官逐格/四感流水帳限制解除」，把玩家要求的肉體特寫(肉壁蠕動/絞緊/吸吮/痙攣/滾燙濕滑/體液拉絲)、喘息聲音(嬌喘/低吟/嗚咽/破碎短句)、擬聲詞(咕啾/滋噗/啪啪)、感官優先順序(視覺/觸覺/聽覺優先於心理)、慢鏡頭直白露骨不跳過不總結，全部納入；但保留一句折衷但書「角色本人的語癖/稱謂/台詞仍需適度穿插，不可讓每個角色都寫成同一套無臉孔的生理描寫」——這不是取消玩家的訴求，只是不讓它完全清零成無差別的純生理描寫，仍保留最低限度的角色辨識度。**這條限制解除只作用在driveOn=true的注入段落內，熄滅時的敘事仍受慾海律令第4條原樣約束**，兩種模式的行為差異因此被明確劃出邊界，不是全域放寬。

**改動**：`gas/Gallery.gs`(`driveStr`新增第⑤點肉體專注強化指令)。驗證：`bash check.sh`全過；`git diff -- gas/Gallery.gs`核對只有這1行變動(driveStr是`actionPlay`函式內的獨立變數、不在`nsfwBaseRules`常數字面範圍內，`grep -c nsfwBaseRules`維持0是正常、非盲區)。部署後建議測試：🔥點火模式下的性愛場景是否確實出現肉體特寫/擬聲詞/慢鏡頭描寫，且角色語癖/台詞沒有完全消失變成通用文字；熄滅模式下確認慾海律令第4條(禁逐格/禁流水帳)仍正常生效、未被波及。

**追加調整（玩家貼出「色度跟隨鐵律」新規則＋慾海律令第4條加強版，問「修改這個？」）**：玩家要求先前那次點火限定的肉體特寫尺度(上一輪driveStr第⑤點)這次改成全域規則——玩家貼出的內容是要塞進`specificRules`(慾海律令，全域一直生效，不分點火/熄滅)本體，不是driveStr(僅點火時生效)。詢問後玩家明確選「全域生效（不分點火/熄滅，推薦）」，取代上一輪「只在點火時解除」的限定範圍。**修法**：①`specificRules`新增第0條【色度跟隨鐵律・最高優先】：玩家主動進行情慾行為時，NPC必須跟隨相同或更高色度描寫，禁迴避/淡化/突然害羞/轉話題，同時嚴格維持角色個性；②改寫第4條：加入具體生理特寫清單(肉壁蠕動絞緊/滾燙吸吮/痙攣抽搐/蜜液噴濺/拉絲體液/咕啾水聲/啪啪撞擊聲)，拿掉舊句「❌禁逐一點名全身部位、禁四感清單式流水帳、禁器官逐格交代」(這條禁令現在被新內容取代)，保留「聚焦一兩處」「台詞可被喘息/聲音/斷續語句打斷」與「永遠是用原本的人格去承受快感」(呼應角色一致性鐵律，玩家這次貼的文字裡也主動加了這句安全閥，回應了上一輪我提出的「發情機器」疑慮)。③連帶清理：`driveStr`第⑤點(上一輪新增的「僅點火時解除規則4限制」)因規則4本體已改成全域鼓勵這樣寫、不再有限制可解除，內容變成無意義的死文字，整段移除，driveStr恢復只剩①②③④點(同伴主動掌握/角色一致性/壓迫止於張力/文字尺度拉滿)。**新增規則0/改寫規則4皆屬`specificRules`常數本體字面修改**，屬紅線①保護範圍，經過確認、玩家明確選擇後才動手。

**改動**：`gas/Gallery.gs`(`specificRules`新增第0條+改寫第4條；`driveStr`移除第⑤點)。驗證：`bash check.sh`全過；`git diff -- gas/Gallery.gs`逐行核對只有這3處變動(新增1行、改寫1行、刪減driveStr內1段)，無其餘意外改動。部署後建議測試：不點火(熟燅)模式下的性愛場景現在是否也會出現肉體特寫/擬聲詞描寫、且角色個性/語癖沒有消失；🔥點火模式的整體行為(同伴主動掌握節奏/無法迴避)是否維持不變(只是拿掉了現在重複的肉體描寫段落)。

## §44 鑑賞「出門走走」巧遇開關＋新增可改名的「家」移動選項（2026-07・玩家問「鑑賞的 移動會遇到人 可以做成開關嗎？還有可以新增一個家的移動選項嗎？（如果可以自由改名字就更好了）」）

**背景**：`KANSHOU_LOCATIONS_`(Gallery.gs)10個固定地點按下移動時，`kanshouRollEncounter_`固定70%機率巧遇一位男性英靈(見§40)，玩家沒有辦法關掉這個機率；同時想要一個代表「自己家」的移動選項，且希望顯示名稱能自訂(而非寫死「家」)。

**① 巧遇開關(`encounterOn`)**：`actionPlay`新增`const encounterOn = !(userData.encounter === false || String(userData.encounter) === "false")`——前端沒帶這欄(舊快取版本)時預設仍是開啟，維持原行為。同時擋住兩個既有的擲骰呼叫點：移動觸發的`kanshouRollEncounter_(moveTarget.name)`(改成`(encounterOn && moveTarget) ? ... : null`)、原地問「這裡還有誰」觸發的分支(`else if (encounterOn && KANSHOU_ASKING_WHO_ELSE_RE_.test(userMsg))`)。**不影響**已經在場、跨輪持續有效的`【邂逅中】`對象(那是延續舊巧遇、不是新擲骰)，也不影響同行隊伍成員——開關只管「會不會冒出新的陌生人」。前端：`Script_Kanshou.html`新增全域`let kanshouEncounterOn`(localStorage持久化`kyushu_kanshou_encounter`，預設開啟)，「出門走走」面板頂部加一顆checkbox，`onchange`呼叫`kanshouToggleEncounter_`更新變數＋寫回localStorage；`Script.html`的`send()`把這個全域變數讀出來夾進`gasRun`的`encounter`欄位(每次呼叫都送，對solo無意義因為`actionPlay`入口已擋非`KPC_`)。

**② 可改名的「家」選項**：跟其餘10個固定地點不同，「家」的顯示名稱是玩家自訂的、只存在自己這個御主身上——沒有加新試算表欄位(COL是位置索引，寧可棄用不加欄，見CLAUDE.md紅線②)，改用MEMORY標記【住所】(比照【邂逅】/【邂逅中】同款get/set寫法)：`getKanshouHomeName_(memory)`查無標記時預設回傳「家」，`setKanshouHomeName_(memory, name)`清除舊值後整段append、限長12字。`actionPlay`裡`pc`(row)確定後算出`homeName = getKanshouHomeName_(pc[COL.PC.MEMORY])`，`moveTarget`比對邏輯新增平行的`isHomeMove`(不在`KANSHOU_LOCATIONS_`固定清單裡、單獨比對`userData.moveTarget`是否等於`homeName`)，`moveName`統一兩者的顯示地名。移動判定改成`if (moveTarget || isHomeMove)`，寫LOC/同步同伴/清【邂逅中】的既有邏輯對兩者一視同仁；但擲骰只在`encounterOn && moveTarget`才會跑(`isHomeMove`恆為`null`)——「家」是私人空間，設計上永遠不會巧遇路人，不受巧遇開關影響(不需要，因為本就不會擲)。新增`actionKanshouSetHomeName`(Router_Action.gs註冊`kanshou_set_home_name`)，比照`actionKanshouSetName`同款寫法，只是寫進MEMORY而非獨立欄位；`actionEnterKanshou`三個return分支都補上`homeName`欄位回傳給前端。

前端`Script_Kanshou.html`：「出門走走」面板的地點清單抽成`kcMapListHtml_()`函式(才能改名後局部重繪`#kc-map-list`，不必整個overlay重建)，最上面固定放一顆🏠家按鈕(用`pc.homeName`顯示，點擊時`moveTarget`帶的是解析後的實際名稱、不是字面「家」)，按鈕內嵌一顆✏️(`event.stopPropagation()`避免誤觸發移動)呼叫`kanshouRenameHome()`——`prompt()`收字串、呼叫`kanshou_set_home_name`、成功後更新`pc.homeName`＋回寫`localStorage('kyushu_v27')`＋重繪清單。`enterKanshou()`建立`pc`物件時從`res.homeName`帶入(查無時預設`'家'`)。

**未動的部分**：`KANSHOU_LOCATIONS_`固定10地點清單、`KANSHOU_LOCATION_TAGS_`氛圍標籤、`kanshouRollEncounter_`本體機率邏輯、`【邂逅】`/`【邂逅中】`既有機制，全部逐字未動——這次純粹是「加一個開關」＋「加一個不會巧遇的私人地點、名字可改」，資料流跟既有巧遇系統完全相容、無破壞性變動。

**改動**：`gas/Gallery.gs`(新增`getKanshouHomeName_`/`setKanshouHomeName_`/`actionKanshouSetHomeName`；`actionPlay`新增`encounterOn`/`homeName`/`isHomeMove`/`moveName`並改寫兩處擲骰守門；`actionEnterKanshou`三分支補`homeName`回傳)；`gas/Router_Action.gs`(註冊`kanshou_set_home_name`)；`gas/Script_Kanshou.html`(巧遇開關checkbox+`kanshouToggleEncounter_`、`kcMapListHtml_`/🏠家按鈕/`kanshouRenameHome`、`enterKanshou()`帶入`homeName`)；`gas/Script.html`(`send()`夾帶`encounter`欄位)。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(改動完全不觸及`nsfwBaseRules`/`specificRules`，純資料流+UI功能，非NSFW規則文字)。部署後建議測試：①「出門走走」面板巧遇開關關閉時多次移動確認不再冒出陌生人、開啟時機率恢復正常；②🏠家按鈕移動後LOC正確寫入、且不會巧遇任何人；③改名後按鈕文字/存檔即時更新，重新整理頁面後名稱仍保留(下次`enterKanshou()`從後端讀回)；④「家」名稱刻意輸入超過12字/空白測試前後端雙重擋驗證。

## §45 鑑賞UI改回solo同款3分頁，地圖分頁改清單型（2026-07・玩家問「鑑賞我想要改回跟solo很像的ui 3個分頁這樣！但是地圖變成清單類型！（就是把地圖做到右邊這樣！）」）

**背景**：鑑賞先前的地圖/地點功能是掛在☰抽屜裡的一顆「🗺️出門走走」彈窗(`ensureKcMapOverlay_`彈窗、`applyModeUI`把`tab-map`/`pane-map`整個隱藏，只留給solo)。玩家想要的其實是回到 solo 現有的「👤標籤／📖故事／🗺️地圖」3分頁＋`#pane-wrap`版型(寬螢幕(≥601px)三欄並排、地圖固定在最右欄`flex:0 0 360px; border-left`——這正是玩家講的「地圖做到右邊」；手機(≤600px)則是底部3顆分頁鈕切換)，只是鑑賞沒有座標節點，地圖分頁內容不該套用solo的戰場SVG，改成清單型(就是原本彈窗裡的「出門走走」地點清單)。

**修法**：
1. **`applyModeUI()`(Script.html)**：`tab-map`/`pane-map`不再依`isKanshou`隱藏，兩軌都顯示——solo沿用既有`renderMapPane()`戰場SVG邏輯，鑑賞則在該函式內部新增分支。同時移除已被取代的`drawer-kanshou-map`按鈕顯示/隱藏那行(按鈕本體也一併從`Index.html`刪除)。
2. **`renderMapPane()`(Script.html)**：`c.offsetParent===null`檢查之後、原本solo戰場SVG邏輯之前，新增`if (pc && pc.mode==='kanshou')`分支——渲染跟原彈窗一模一樣的內容(巧遇開關checkbox+🏠家按鈕+10地點清單，複用`Script_Kanshou.html`的`kcMapListHtml_()`/`kanshouEncounterOn`/`kanshouToggleEncounter_`全域函式，同一份`<script>`全域作用域下可直接跨檔呼叫)，`return`後不會落入solo的戰場SVG/此地經營/偵查按鈕等段落。
3. **移除整條彈窗機制**(`Script_Kanshou.html`)：`ensureKcMapOverlay_`／`closeKcMapOverlay`／`openKanshouMap`三個函式與`kc-map-overlay`浮層整段刪除——分頁已完全取代彈窗的功能，不留兩套平行進入點(單一真實來源原則)。`kanshouMoveTo()`移除已失效的`closeKcMapOverlay()`呼叫。`kcMapListHtml_`/`kanshouRenameHome`(改名後回寫`#kc-map-list`)本體不動，一樣的`id`現在只是換了個父容器(`#map-pane-content`取代原本的浮層)。
4. **`enterKanshou()`(Script_Kanshou.html)**：新增進場當下呼叫一次`renderMapPane()`(比照solo登入後`syncData()`觸發的初次填色)——寬螢幕三欄並排時`#pane-map`本來就恆顯示，不像手機分頁那樣需要「點了才算」，若不主動呼叫，桌機玩家進場當下右欄地圖分頁會是空的直到手動觸發某個間接呼叫。

**未動的部分**：`kcMapListHtml_`/`kanshouToggleEncounter_`/`kanshouEncounterOn`/`kanshouRenameHome`/`kanshouMoveTo`(除拿掉`closeKcMapOverlay()`呼叫外)本體邏輯逐字未動——上一輪(§44)新增的巧遇開關與可改名「家」機制完全複用，只是換了個渲染進入點；solo的`renderMapPane()`戰場SVG/`buildMapSvg_`/此地經營/偵查按鈕整段不變。

**改動**：`gas/Script.html`(`applyModeUI()`拿掉`tab-map`/`pane-map`的`isKanshou`隱藏、拿掉`drawer-kanshou-map`那行；`renderMapPane()`新增鑑賞清單型分支)；`gas/Script_Kanshou.html`(移除`ensureKcMapOverlay_`/`closeKcMapOverlay`/`openKanshouMap`三函式；`kanshouMoveTo()`移除`closeKcMapOverlay()`呼叫；`enterKanshou()`新增`renderMapPane()`呼叫)；`gas/Index.html`(移除`drawer-kanshou-map`按鈕)。

**驗證**：`bash check.sh`全過(含`Index.html`標籤配對，先前這個檔案的HTML結構壞過一次、這次改動有此顆驗證把關)；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(兩檔完全未改動，這輪純前端UI)。部署後建議測試：①手機窄螢幕鑑賞底部應出現3顆分頁鈕(標籤/故事/地圖)，點「🗺️地圖」能看到巧遇開關+🏠家+10地點清單，跟solo的分頁切換手感一致；②桌機寬螢幕鑑賞應呈現三欄並排、地圖清單固定在最右欄，一進場就有內容不必先點別的東西才刷新；③☰抽屜裡確認「出門走走」按鈕已消失，不再有兩個入口；④地點按鈕/改名/巧遇開關功能本身(§44的邏輯)在新的分頁位置一切正常運作。

## §46 (玩家明確授權) 慾海律令第2條「絕不重置」加但書，修正未色色輸入卻被推著往色色走的問題（2026-07・玩家問「需要依照玩家輸入進行反應...我明明沒有輸入色色 但是敘事還是往色色走呢..怎麼會這樣」）

**背景**：`specificRules`(慾海律令)第2條【絕不重置】原句「每次回應必須繼承歷史情緒溫度，已推進的親密/情動階段本回合不可無故退回冷淡或抗拒；降溫只能因劇情明確事件」——這條規則的由來(見§「🧠 inner_monologue 強制思維鏈＋絕不重置」條目)是為了修「敘事每次都被打回原點、氣氛養不起來」的舊bug，本意只針對「情感基調/氛圍」的連續性。但玩家這次反映：明明本回合輸入的是普通對話(非主動色色)，敘事卻仍持續往情慾方向推進——查證後判斷AI把「不可退回冷淡」誤解成「必須持續往色色的方向加戲」，跟第0條【色度跟隨鐵律】(只在玩家主動進行情慾行為時才要求跟隨色度)的設計意圖產生衝突：第0條有「玩家主動」這個前提條件，但第2條「絕不重置」沒有對等的「僅指情感基調」限定，AI容易把兩條混在一起解讀成「情慾一旦開始就不能停」。

**排除的可能性**：先詢問玩家是否有開🔥「主動掌握模式」(driveStr有一句「不可退回平日矜持基準，每回合都要確實往前推進」，只在點火時生效，可能才是真正禍首)——玩家確認**沒有開火**，問「是不是把那些鐵律都先砍掉」，故driveStr本身這次不是肇因、且玩家傾向「先保留」driveStr現狀(該規則在🔥模式下的「不管輸入什麼都要往前衝」本就是點火模式的設計目的，不應該因為這次熄滅模式下的問題被牽連修改)，這次只處理`specificRules`第2條本身。

**修法**：第2條原句後方加一句但書：「★但『繼承溫度』僅指情感基調與氛圍的自然延續，【絕非】授權本回合無中生有推進新的性愛/肉體進展——玩家本回合輸入若只是普通對話、日常互動或未主動推進親密，NPC的反應與劇情走向須忠實對應這份輸入本身，不可自行加戲往情慾方向前進。」——保留原句「不可無故退回冷淡」(避免重演舊bug)，但明確劃出「延續基調」與「無中生有加戲」的界線，呼應第0條「色度完全匹配玩家本次輸入」的精神，讓兩條規則不再互相矛盾。玩家在`AskUserQuestion`兩個選項(「加但書：情緒基調可以延續，但不可無中生有加新的性愛內容」／「改成完全依輸入：沒有明確色色輸入，這回合就該正常降溫/轉日常」)間選擇前者(推薦)。

**改動**：`gas/Gallery.gs`(`specificRules`第2條【絕不重置】新增但書句)。屬紅線①保護範圍，經上述確認、玩家明確選擇後才動手，其餘規則(第0/1/3~7條)逐字未動。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs`逐行核對只有這1行變動、無其餘意外改動。部署後建議測試：熄滅(矜持)模式下，先讓劇情自然推進到有些親密的氛圍，接著輸入一句完全中性的日常對話(如問候/閒聊)，確認敘事是否能維持基調但不再無故加入新的情慾/肉體描寫；同時確認先前已推進的溫馨/親密氛圍不會被這句中性輸入打回冰冷生疏(避免重演舊bug)。

## §47 §46的但書不夠力，慾海律令第1條「先思考後敘事」的強制情慾光譜才是真正根源（2026-07・玩家貼出實測片段「一直在發情狀態呢...啥都沒做...就一直往發情過去」）

**背景**：§46上線後玩家立刻實測回報依然故我——貼出實際輸出片段作為鐵證：玩家輸入純中性的「喝茶...」，AI開頭第一句就直接寫阿爾托莉雅「眼神染上情慾迷霧」並主動摸她的領口，接著玩家在對話裡明講「幹嘛一直發情！」，AI仍把這句話當成調情台詞繼續加戲，直到玩家第三次輸入「不鬧他了~喝茶」才勉強收斂(但敘述仍大量殘留喘息/潮紅等餘韻描寫)。這證明§46的但書(只加在第2條【絕不重置】)完全沒抓到根源——§46處理的是「已有的溫度不可無故降溫」，但這次的問題是**從零無中生有發起新的親密動作**，跟「繼承溫度」無關。

**真正根源**：`specificRules`第1條【先思考，後敘事】原句要求AI在`inner_monologue`裡「依對話歷史定位『本回合主要互動對象』的情緒溫度與親密階段(抗拒/拉扯/沉溺，或甜蜜/依偎/主動索求——依角色意願與好感判斷，非必經流程)」——雖然括號內寫了「非必經流程」，但列舉的兩組情緒選項**清一色都是情慾光譜上的點**(拒絕中的情慾 vs. 順從中的情慾)，完全沒有「單純日常、無特殊情動」這個中性選項可選。等於每一回合、不論玩家實際輸入是什麼，AI都被這個列舉強迫在情慾光譜上找一個位置定錨，難怪玩家一句「喝茶」也能被解讀成「情慾迷霧」的起點。

**玩家提出的修法方向**：玩家沒有直接選預先列的3個選項，而是提出更根本的訴求：「AI應該依照玩家輸入＋個性＋歷史資料進行輸出，不要再強制他寫了」——本質是要求拿掉「必須套進某種預設情緒框架」的強制性，讓AI真正依三項客觀線索(玩家本回合實際輸入、NPC個性、近期對話歷史)自行判斷，而非被迫選邊站。

**修法**：
1. **第1條全面重寫**：拿掉「情緒溫度與親密階段(抗拒/拉扯/沉溺，或甜蜜/依偎/主動索求)」這組情慾光譜框架，改成「依『玩家本回合實際輸入內容』＋『NPC本身[個性]』＋『近期對話歷史』三者判斷本回合最真實合理的反應——可以是完全日常、無特殊情動，也可以是親密曖昧，一切依這三項實際線索決定」，並明講【不得】套用固定情慾光譜或必經階段(如「抗拒→拉扯→沉溺」)、【不得】無中生有自行發起新的親密舉動。這是本次的核心修正，直接對應玩家的訴求。
2. **第2條的但書升級成【絕對禁止】級別**：§46加的但書原本是「★但...【絕非】授權...不可自行加戲」，語氣強度不如第0條的【絕對禁止】，這次改成同級：「【絕對禁止】無中生有發起新的親密舉動或推進新的性愛/肉體描寫」，字面上跟第0條看齊，希望AI對這條的優先級認知一致。

**未動的部分**：第0條(色度跟隨鐵律)、第3~7條、`nsfwBaseRules`本體、`prompt`模板裡的「★世界觀＝和平的現代都市日常」段落(該段本身是中性的「依劇情/好感/意圖自然發展」措辭，非強制方向，判斷不是這次的肇因，未觸動)逐字未動。

**改動**：`gas/Gallery.gs`(`specificRules`第1條全面重寫拿掉強制情慾光譜；第2條但書升級為【絕對禁止】級別)。屬紅線①保護範圍，經上述確認(玩家貼實測片段佐證、提出修法方向後才動手)，這是同一個問題的第二次修正嘗試——§46力度不足，這次改動範圍更大、更根本。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs`逐行核對只有這2行變動、無其餘意外改動。部署後建議測試：重現玩家原本的場景(輸入純中性動作如「喝茶」)，確認AI不再無中生有地發起親密舉動或描寫情慾氛圍；也要確認已經自然發展出的親密氛圍(玩家主動推進後)依然能維持、不會被本次修法過度壓制成每回合都被打回生疏——第2條的「繼承溫度」保護機制仍在，這次只是收緊「無中生有」的界線，不是把整個親密系統關掉。

## §48 鑑賞地點移動加確認鍵＋自動切回故事分頁（2026-07・玩家問「鑑賞 點地點移動 想要加個確認鍵（手機需要回去故事分頁」）

**背景**：§45把「出門走走」從彈窗改成「🗺️地圖」分頁後，手機窄螢幕一次只顯示一個分頁——玩家點地點按鈕觸發`kanshouMoveTo(name)`移動後，AI敘事寫進「📖故事」分頁，但玩家人還停在「🗺️地圖」分頁，得自己手動切換過去才看得到剛才移動的結果，體驗不順；同時地點按鈕目前是點下去就直接觸發移動(無確認)，容易手滑誤觸。

**修法**：比照solo既有的兩套地點移動確認機制擇一致的寫法——`travelTo`(前端`Script.html`)在故事文字裡的綠色地名連結(`data-loc`)點擊時已有`confirm(`確定要啟程前往「${locName}」嗎？`)`，`travelFromPane`(SVG地圖節點點擊)則是「先`showGamePane('chat')`切回故事分頁、再呼叫`travelTo`」讓移動結果直接可見(不用確認，因為地圖節點夠小、手滑機率低)。鑑賞的地點清單按鈕(大按鈕、手滑風險更高)兩者都要：`kanshouMoveTo(name)`開頭加`if (!confirm('確定要前往「' + name + '」嗎？')) return;`，通過後先`showGamePane('chat')`切到故事分頁，再送出既有的`send()`(帶`moveTarget`)呼叫——寬螢幕三欄並排模式下`showGamePane`只是切`.active`/`.tab-active` class(對三欄並排無視覺影響，故事欄本來就一直顯示)，只有手機窄螢幕才會有實際切分頁的效果，兩種螢幕寬度都不受影響或都受益。

**未動的部分**：`send()`本身的呼叫參數、`kcMapListHtml_`按鈕清單本體、巧遇/改名機制完全不變，純粹在既有函式開頭插入確認與切分頁兩行。

**改動**：`gas/Script_Kanshou.html`(`kanshouMoveTo()`新增`confirm()`確認與`showGamePane('chat')`切分頁)。

**驗證**：`bash check.sh`全過。部署後建議測試：①手機窄螢幕點地點按鈕應先跳出確認對話框，確認後畫面自動切到「📖故事」分頁並看到移動敘事，不必手動切換；②取消確認應該什麼都不會發生(不移動、不切分頁)；③桌機寬螢幕三欄並排下功能不受影響(移動流程照舊，只是多一個確認彈窗)。

## §49 鑑賞括號全名角色好感/狀態悄悄比對失敗的根源bug（2026-07・玩家問「間桐櫻（黑化）是不是因為有()有時候好感都沒有提升？」）

**背景**：玩家精準點出可疑點——英靈殿裡部分角色的`realName`(寫進`COL.PC.NAME`的召喚顯示名)帶括號附註，例如`間桐櫻（黑化）`、`無名（EMIYA）`、`伊斯坎達爾（征服王）`、`哈桑·薩巴赫（百貌）`、`哈桑·薩巴赫（咒腕）`、`蘭斯洛特（湖之騎士）`、`美遊·埃德費爾特（Saber install）`、`克洛伊·馮·愛因茲貝倫（Archer install）`、`伊莉雅絲菲爾·馮·愛因茲貝倫（Caster install）`共9位。

**查證根因**：`actionPlay`裡兩處AI輸出比對(`rel_changes[].target`找對應NPC列寫入好感、`intimacy_feedback.npcs[].name`找對應NPC列寫入physical_state/dynamic_skills/mutual_nicknames/attitude)都用`String(r[COL.PC.NAME]) === tNpc`**逐字完全相符**比對。但AI敘事裡從不會真的把角色寫成「間桐櫻（黑化）」這種帶括號的怪異全名——自然只會用「間桐櫻」或「黑化」其中一段稱呼TA，填進schema的`target`/`name`欄位時也會照著這個自然稱呼填，跟`COL.PC.NAME`裡完整的括號全名逐字比對必然失敗，`findIndex`回傳`-1`、整條AI輸出被靜靜跳過——好感沒有寫入、physical_state/態度/暱稱也都沒有更新，且**沒有任何錯誤訊息**，因為程式邏輯上這是合法的「找不到就略過」防呆分支，不是例外。9位角色只要曾被召喚進鑑賞同行隊伍，都會受影響。

**修法**：新增共用helper `kanshouNameCandidates_(fullName)`——用正則`/^(.*?)[（(]([^（()）]*)[）)]\s*$/`拆出「括號前」與「括號內」兩段，回傳`[全名, 括號前, 括號內]`三個候選字串(無括號的一般名字回傳單一候選`[全名]`，行為不變)。兩處比對從`String(r[COL.PC.NAME]) === tNpc`改成`kanshouNameCandidates_(r[COL.PC.NAME]).includes(tNpc)`——AI不管填「間桐櫻」「黑化」還是完整的「間桐櫻（黑化）」都能命中，不用去改動任何一位角色的既有`realName`資料(那份資料本身沒有錯，括號附註在英靈殿列表/召喚選單顯示時其實是有用的辨識資訊，只是不該拿去跟AI自然稱呼做逐字比對)。用node腳本模擬驗證全部9位角色+2位一般角色(阿爾托莉雅/遠坂凜)的候選字串拆解結果，確認括號前/括號內都正確拆出、一般名字不受影響。

**未動的部分**：`SEED_CODEX.gs`所有角色的`realName`資料本身、英靈殿召喚選單/前端顯示邏輯、`actionKanshouRemove`(前端UI直接送出儲存的全名，非AI輸出，不受此bug影響)完全未動。

**改動**：`gas/Gallery.gs`(新增`kanshouNameCandidates_`共用helper；`rel_changes`與`intimacy_feedback.npcs`兩處比對邏輯改用候選字串比對)。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(純資料比對邏輯，未觸及NSFW提示詞本體)；node腳本模擬9位括號角色+2位一般角色的候選字串拆解結果全數正確。部署後建議測試：召喚「間桐櫻（黑化）」或「無名（EMIYA）」等括號角色進鑑賞同行隊伍，互動幾回合後確認好感(BOND)、當前狀態(physical_state)、態度(attitude)都能正常隨敘事更新，不再卡住不動。

## §50 鑑賞玩家本人「換裝」從未餵給AI的根源bug（2026-07・玩家問「衣服...換裝有確實讀取嗎」，後貼實測「自己換裝『只有穿褲子』，AI卻寫『遠坂凜的手掌隔著我的衣襟』」）

**背景**：玩家先問換裝機制是否確實被AI讀取，查證後確認**同行夥伴的換裝沒問題**——`partyDetailsArr`每回合都會用`getOutfit_(r[COL.PC.MEMORY])`把NPC的裝扮塞進【同行夥伴】卡片(`裝扮:XXX(當前服裝·五官體態不變)`)。但玩家接著實測貼出反例：把自己(御主本人)的換裝設成「只有穿褲子」，AI敘事卻寫出「遠坂凜的手掌隔著我的衣襟」(衣襟=有領口上衣的前襟，跟「只有穿褲子」正面矛盾)——證明**玩家自己的換裝完全沒被讀取**。

**查證根因**：`actionPlay`組prompt的地方，NPC換裝(`getOutfit_`)有兩處注入點——①`partyDetailsArr`(【同行夥伴】卡片)②`nsfwMemories`迴圈(`[名字 裝扮]`行，情慾場景AI主要參照的[情境延續]區塊)。但**玩家自己(pc本人)的這兩處對應位置都沒有讀`getOutfit_(pc[COL.PC.MEMORY])`**：①【玩家命格】那行只有名號/性別/性格/特徵/軟肋/身世/位置，從未帶上換裝；②`nsfwMemories`開頭只有「[玩家『XX』肉體]」與「[身體記憶]」，同樣沒有裝扮。玩家換裝功能本身(`actionSetOutfit`寫入/`getOutfit_`讀取的MEMORY標記機制)完全正常運作、資料也確實寫進試算表(前端卡片會正確顯示你換的裝)，純粹是這兩處「餵給AI看」的prompt組裝，從一開始就漏掉了玩家自己這一份——AI 從頭到尾看不到你穿什麼，只能憑空腦補(通常預設成有領口的日常上衣)，跟NPC换裝比對失敗(§49)是不同性質的bug(那是「AI寫的名字對不上」，這是「這份資訊從沒被組進提示詞」)，但影響同樣是「换的裝AI不會理」。

**修法**：新增`const myOutfit = getOutfit_(pc[COL.PC.MEMORY]);`(緊接`currentAmbition`之後)，比照NPC的兩個注入點各補一份：①【玩家命格】行尾插入`${myOutfit ? \` | 裝扮:${myOutfit}(當前服裝·五官體態不變)\` : ""}`，跟partyDetailsArr同格式；②`nsfwMemories`開頭補`[玩家『${pcName}』裝扮]：${myOutfit}（玩家指定當前服裝·五官/髮色/體態不變）`，跟NPC的`[名字 裝扮]`行同格式。兩處皆用`myOutfit`真值判斷，沒換裝(空字串)時不輸出這段，維持原樣不佔提示詞篇幅。

**未動的部分**：`actionSetOutfit`/`getOutfit_`/`setOutfit_`底層機制、前端`changeOutfit()`呼叫與卡片顯示、NPC換裝的既有兩處注入點，完全未動——這次純粹是補上玩家自己那份漏掉的注入，資料流跟既有機制完全相容。

**改動**：`gas/Gallery.gs`(新增`myOutfit`常數；【玩家命格】prompt行與`nsfwMemories`開頭各補一處玩家自己的裝扮注入)。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(純prompt資料組裝，未觸及NSFW規則本體)。部署後建議測試：把自己的換裝設成一句明確的服裝描述(如「只有穿褲子」「浴衣」)，跟同行夥伴互動幾回合，確認AI敘事這次會正確反映這身裝扮、不再自行腦補成別的穿著。

## §51 修正玩家手動編輯Gallery.gs漏刪函式結尾大括號的語法錯誤（2026-07・玩家直接在GitHub網頁編輯器改寫慾海律令，要求「幫我部屬MAIN」）

**背景**：玩家自己在GitHub網頁編輯器直接改寫了`buildDefaultSystemPrompt()`裡`dialogueFormatRule_`/`nsfwBaseRules`/`specificRules`的規則文字內容(重新措辭色度跟隨鐵律、慢熱與傾心等規則，屬於玩家的設計決定，內容本身未受質疑)，commit直接落在main分支(非經過本session的分支流程)。

**查證發現**：`bash check.sh`跑出`FAIL Gallery.gs`，`SyntaxError: Unexpected end of input`——網頁編輯器改寫時，函式結尾`return nsfwBaseRules + ... ;`後緊接的`}`(收掉`buildDefaultSystemPrompt()`的大括號)被連同上一行一起誤刪，導致整個檔案語法錯誤。Apps Script是整包編譯，一個檔案語法錯誤會讓solo+鑑賞**全部**跑不動，不只鑑賞受影響——這種錯誤只要玩家繼續透過本session的`clasp push`/`clasp deploy`流程上線，馬上會炸掉全站。網頁編輯器沒有語法檢查，這類漏刪很容易被忽略。

**修法**：補回遺失的`}`，其餘玩家手動改寫的規則文字內容一字未動(`git diff`確認只新增一行`}`)。

**改動**：`gas/Gallery.gs`(補回`buildDefaultSystemPrompt()`結尾大括號，+1行)。

**驗證**：`bash check.sh`全過(含之前FAIL的Gallery.gs)；`git diff`確認只有這一行新增，無其他變動。PR #233 merge後觸發`workflow_dispatch`部署成功。**教訓**：玩家之後若直接在GitHub網頁編輯器改`.gs`檔，最好貼回本session讓`check.sh`跑過一次再上線——網頁編輯器沒有語法把關，漏刪括號這種小失誤很容易忽略卻會炸全站。

## §52 整理 Gallery.gs 冗長歷史敘事註解（2026-07・玩家反映「現在更新說明比代碼多⋯⋯可以整理一下嗎?」）

**背景**：本session連續多輪修正下來，`Gallery.gs`累積了大量「2026-07 玩家反映/查出根因/改成...」格式的敘事型歷史註解——每次修一個bug都完整記錄「玩家原話→查證過程→根因→修法」，導致同一段程式碼旁邊的註解常常比程式碼本身還長(1622行檔案裡622行是註解，佔比近4成)。這違反CLAUDE.md既有工程準則「Default to writing no comments. Only add one when the WHY is non-obvious...不要referencing當前任務/fix/callers，那些屬於PR描述，會隨代碼庫演進而過時」。

**做法**：逐段將敘事型註解濃縮成精簡的WHY-only單行/短段註解——只留「這段程式碼為什麼要這樣寫」的核心理由，拿掉「玩家哪天用什麼原話反映」「查證的完整過程」「歷史上試過哪些方案又撤回」等會隨時間過期、且已經在git log/PR描述裡有記錄的敘事細節；對已完全刪除、只剩「這裡原本有什麼、後來拿掉了」的死碼歷史類註解，直接整段刪除(這類註解沒有anchor到任何現存程式碼，純粹佔位)。**不動任何程式碼邏輯**——逐行比對確認只有註解文字被改寫/刪除，程式碼本身(含函式簽名/邏輯/字串常數)一律逐字保留。

**特別驗證**：`nsfwBaseRules`常數(慾海禁區紅線①)本體用python腳本逐字元比對修改前後的字串內容，確認`IDENTICAL`——這次只動了它周圍/上方的註解，常數本身的模板字面一字未變。

**改動**：`gas/Gallery.gs`(1622行→1260行，註解行622→約270行；純刪減/濃縮註解，無程式碼邏輯變動，+222/-584)。

**驗證**：`bash check.sh`全過；`nsfwBaseRules`常數內容逐字元比對前後IDENTICAL；`git diff`逐段人工複查確認每處改動只影響註解、未影響任何程式碼行。

## §53 全代碼庫（18個剩餘.gs檔）冗長歷史敘事註解整理（2026-07・玩家「其他的檔案也比照辦理!!」）

**背景**：§52 只處理了`Gallery.gs`一個檔案，玩家要求對整個代碼庫比照辦理。剩餘18個`.gs`檔（`Account.gs`/`Core_Settings.gs`/`Engine_Combat.gs`/`Engine_Fate.gs`/`History_Sync.gs`/`Mystic_Code.gs`/`Router_Action.gs`/`Router_Battle.gs`/`Router_Bond.gs`/`Router_Creation.gs`/`Router_Economy.gs`/`Router_Movement.gs`/`Router_Narrative.gs`/`Router_Persona.gs`/`Seed_Codex.gs`/`Seed_Rivals.gs`/`Setup_FateWorld.gs`/`Time_World.gs`）同樣累積了大量「2026-07 玩家反映/查出根因/改成...」格式的敘事型歷史註解。

**做法**：並行派出18個獨立子代理（每個負責1~2個檔案），套用跟§52相同的WHY-only濃縮原則，並嚴格要求：①絕不觸碰任何可執行程式碼行或字串/樣板字面內容（AI提示詞、角色persona資料等）；②只刪減/改寫`//`註解；③純敘述已刪除死碼、無任何現存程式碼可錨定的註解區塊直接整段刪除；④不得commit/push、不得動`SOLO_REFERENCE.md`。特別交代的高風險檔案：`Engine_Combat.gs`(先grep確認`nsfwBaseRules`不在此檔——已搬到`Gallery.gs`，此檔只有提及該名稱的普通註解)、`Router_Narrative.gs`(內含solo的`miniSystem`系統提示詞，視同紅線保護)、`Seed_Codex.gs`/`Seed_Rivals.gs`/`Setup_FateWorld.gs`(內含大量手寫角色/世界種子資料，只能動註解不能動資料)。

**集中驗證**（全部完成後統一執行，不只信任各子代理自報）：
1. `bash check.sh`全部18檔+既有5檔（含`Gallery.gs`）全過。
2. 逐檔用python腳本抽出「非註解、非空白行」並去除行尾`//`註解後比對修改前後——18個檔案全數回報**逐行完全一致**（`OK`），證明沒有任何程式碼、數值常數、字串或AI提示詞內容被改動，純粹是註解文字被刪減/改寫。
3. `git diff -- gas/*.gs | grep nsfwBaseRules`顯示的5筆全部人工核對，確認皆為`Engine_Combat.gs`裡「提及這個名稱」的普通註解（說明常數已搬到`Gallery.gs`），非常數本體——`Gallery.gs`本身完全未被這輪改動觸及。
4. `Router_Narrative.gs`的`miniSystem`常數用python逐字元比對前後版本，確認`IDENTICAL`。

**結果**（行數→行數，註解行→註解行）：
- `Account.gs`：225→203，51→30
- `Core_Settings.gs`：725→647，240→164
- `Engine_Combat.gs`：144→120，42→18
- `Engine_Fate.gs`：913→868，315→270
- `History_Sync.gs`：105→96，15→6
- `Mystic_Code.gs`：102→96，26→20
- `Router_Action.gs`：551→486，173→108
- `Router_Battle.gs`：1320→1283，252→215
- `Router_Bond.gs`：584→551，104→71
- `Router_Creation.gs`：744→680，194→130
- `Router_Economy.gs`：287→271，48→34
- `Router_Movement.gs`：848→784，150→87
- `Router_Narrative.gs`：208→166，73→35
- `Router_Persona.gs`：218→186，72→40
- `Seed_Codex.gs`：601→445，237→81（最大幅減少：`CODEX_PERSONA_VER`一段107行的v23~v60逐版變更史濃縮成2行、指向本筆記查歷史）
- `Seed_Rivals.gs`：269→237，72→41
- `Setup_FateWorld.gs`：190→165，59→35
- `Time_World.gs`：627→599，132→104

**未動的部分**：所有可執行程式碼、數值常數/公式（戰鬥平衡、AP/時鐘機制等）、所有字串/樣板字面內容（AI系統提示詞、角色persona資料、玩家可見訊息文字）——這次改動範圍嚴格限定在`//`行內註解與已死註解區塊的刪除。

**改動**：18個`.gs`檔案（見上表行數變化），皆為純註解刪減/濃縮，無程式碼邏輯變動。

**驗證**：`bash check.sh`全過（含既有5檔）；18檔逐一用python腳本做「去除註解後逐行比對」確認程式碼部分完全一致；`nsfwBaseRules`/`miniSystem`兩處紅線相關內容額外逐字元核對確認未受影響。

## §54 鑑賞新增AI可自主更新的「換裝」欄位outfit_change，physical_state收窄為純顏面神情（2026-07・玩家「我想要讓AI 可以改動服裝呢...會太麻煩嗎?」→「physical_state專注顏面神情就好，outfit_change專注當下的穿著狀態(有衣物要有衣物 如果被脫光或是洗澡 也要如實的變化)」）

**背景**：玩家設定`【換裝】`過去只能由玩家自己透過UI(`actionSetOutfit`)手動更改，AI敘事無論劇情怎麼演(洗澡、更衣、被脫光)，下一回合讀到的`【換裝】`記錄仍是玩家上次手動設定的那句，跟劇情實況脫節。玩家要求讓AI也能依劇情如實更新這份持久記錄。

**設計**：比照鑑賞既有的`rel_changes`(AI回傳好感增減)、`attitude`(AI回傳臨場態度)同一套「AI每回合回報、GAS決定要不要寫回」模式，在`intimacy_feedback`新增`outfit_change`欄位；玩家進一步要求把原本合併的`physical_state`(顏面神情＋衣裝狀態)拆開——`physical_state`只管每回合都可能變的暫時神情，`outfit_change`專責要持久記住的實際穿著（含被脫光/沐浴等非常態），兩者關注點不同，混在一起容易讓AI分不清哪句該持久、哪句該隨風而逝。

**改動**（`gas/Gallery.gs`）：
1. `buildDefaultSystemPrompt()`：`_physicalState`描述收窄成只講顏面神情(≤15字)；新增`_outfitChange`/`_outfitChangeRef`常數，描述當下實際穿著狀態(≤20字，正常穿著寫身上衣物、全裸/沐浴/更衣等狀態也要如實反映)。`finalJson.intimacy_feedback`的`player`與`npcs[0]`範本各補上`outfit_change`欄位，`_note`同步說明兩欄的差異與各自字數上限。
2. `actionPlay`：新增`sanitizeOutfitChange`(比照既有`sanitizePhysicalState`的敷衍語過濾，不重複截斷——直接交給`setOutfit_`本身既有的40字硬上限與清洗邏輯)；`sanitizePhysicalState`的後端截斷從25字收緊到20字(對應描述改成純顏面神情、字數需求變小)。玩家(`intimacy_feedback.player`)與每位NPC(`intimacy_feedback.npcs[]`)的回應處理新增一段：篩過的`outfit_change`非空時呼叫既有`setOutfit_(pcData[idx][COL.PC.MEMORY], val)`寫回，跟玩家UI手動換裝共用同一個底層函式、同一套「清除舊值再整段append」寫法，沒有另開特例路徑。
3. 順手把三處提示詞注入的「（玩家指定當前服裝...）」措辭改成「（當前服裝...）」——換裝來源已不只玩家UI，措辭不該再暗示「一定是玩家設定的」。

**未動的部分**：`getOutfit_`/`setOutfit_`/`clearOutfit_`底層機制、玩家UI手動換裝(`actionSetOutfit`/`changeOutfit()`)完全未動——AI新增的寫入路徑與既有玩家寫入路徑共用同一個函式、同一個MEMORY標記，兩者可以互相覆蓋(誰的回合晚誰生效)，符合「這是當下真實狀態」的設計意圖，不需要額外的優先權/鎖定機制。`nsfwBaseRules`常數本體逐字元核對未受影響。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0；`nsfwBaseRules`常數逐字元比對前後IDENTICAL。部署後建議測試：跟同伴進入親密場景、劇情演到脫衣/沐浴，確認下一回合讀到的「裝扮」欄位有跟著更新，且離開該情境後(如穿回衣服)也能正確反映最新狀態，不會卡在中途的某個狀態不動。

## §55 鑑賞「可愛地圖」升級：分區地圖＋留人重逢＋輕量事件種子＋巧遇性別修正＋看看四周按鈕（2026-07・玩家設計文件「FATE kanshou 輕量版『可愛地圖』升級大綱」＋事後追加「為啥偶遇沒有女性?...如果有SABER同行不可能地圖上再出現SABER吧?」＋「這功能直接做成按鈕 不用猜了」）

**背景**：玩家提出三段式升級需求：①原本「出門走走」只是10個地點的扁平清單，想分成4~5張大地圖、每張底下再分子地點；②請走的同伴目前只是「凍結在原地」但沒有任何「下次來這裡可能巧遇」的呈現；③移動/停留時想要一點輕量的隨機小事件調味。做完①②③後，玩家在同一回合內又追加兩個問題：巧遇池(`KANSHOU_MALE_HERO_IDS_`)刻意設計成全男性，導致「明明同行著SABER，出門走走卻可能再巧遇一位不具名的SABER」這種矛盾；以及原本「原地問還有誰在」是靠正則表達式猜測玩家文字語意觸發，玩家要求直接做成按鈕不要用猜的。

**設計與改動**（`gas/Gallery.gs`除非特別註明）：

1. **分區大地圖（Phase 1）**：新增`KANSHOU_REGIONS_`(4個分區：深山町・家附近/冬木市中心/港口・碼頭區/山林・道場區，各含id/name/desc)；`KANSHOU_LOCATIONS_`從10個地點擴充/改名成17個地點，每筆補上`region`欄位對應到分區id——region純粹是UI分組用的標籤，不影響`kanshouRollEncounter_`/`actionPlay`的moveTarget比對(那些都認地點`name`，改名同時已同步更新`KANSHOU_LOCATION_TAGS_`的key)。前端`Script_Kanshou.html`同步建立對應的`KC_REGIONS_`/`KC_LOCATIONS_`(比照後端這份，改地點/分區要兩邊同步改，沿用既有的「前端純畫按鈕、後端才是驗證真實來源」設計)；`kcMapListHtml_()`改為「家」按鈕＋分區切換列(`kcSwitchRegion_`，狀態存`kcActiveRegion_`＋localStorage持久化偏好，比照`kanshouEncounterOn`)＋依當前分區篩選的地點按鈕清單。

2. **留人重逢（Phase 2）**：新增`kanshouLeftBehindIdx`——在`actionPlay`每回合(不限移動)找此局已被「請走」(`IS_PARTY`非同行)、目前`LOC`正巧凍結在玩家所在地點的同伴列。命中時：①優先於這次到訪呈現，跳過陌生人巧遇擲骰(`kanshouEncounterHero`只在`kanshouLeftBehindIdx===-1`時才擲)；②注入`kanshouReunionStr`——不受【在場驗證鐵律】限制的系統例外，讓AI知道這是「有真實姓名/好感/羈絆記錄的正牌故人重逢」而非匿名陌生人巧遇，好感依`rel_changes`正常追蹤(該機制本就不看`IS_PARTY`，不需額外改動)；但明講「同行狀態仍須玩家自行在同伴面板操作」，不讓AI在敘事裡假裝對方已經同行。

3. **輕量事件種子（Phase 3）**：新增`KANSHOU_EVENT_SEEDS_`(daily/ambiguous/spicy三類短句)＋`kanshouRollEvent_(driveOn)`(20%機率，非driveOn時spicy類不會被抽到)。每次抵達新地點(僅`moveTarget`、不含「家」)擲一次，命中則注入`kanshouEventSeed`——標明【非強制】的氛圍引子，AI可自然採用或完全不理會，不是預寫劇本。

4. **修正「為何偶遇沒有女性」**：`KANSHOU_MALE_HERO_IDS_`拆成`KANSHOU_ENCOUNTER_MALE_IDS_`＋新增`KANSHOU_ENCOUNTER_FEMALE_IDS_`(8位女性英靈＋3位女性御主(遠坂凜/伊莉雅絲菲爾/間桐櫻黑化，鑑賞限定角色)＋性別「無」的恩奇都比照既有慣例當女性向處理)；也替原本只有男性標籤的地點各補一位氣質相符的女性/中性角色(如老道場加斯卡哈-Assassin、書店二樓加伊莉雅-Caster)。`kanshouRollEncounter_`保底池從純男性改成男女混合全池；新增`excludeIds`參數——`actionPlay`用`kanshouNameCandidates_`比對此局已正式召喚過(不論是否仍同行)的英靈真名，反查對應的`SEED_SERVANTS.id`清單餵給兩處擲骰呼叫，避免「同行著SABER時，路上又巧遇一位不具名SABER」的矛盾。男女配對規則不變：只有「男御主遇男性巧遇對象」明講僅止於同性情誼，其餘組合(含女女)一律自然發展。玩家事後再定案排除`吉爾德萊-Caster`/`百貌哈桑-Assassin`/`咒腕之哈桑-Assassin`3位不出現在巧遇池——已從`KANSHOU_ENCOUNTER_MALE_IDS_`與其對應的3個地點標籤移除(書店二樓/深夜便利店/廢棄神社)，這3位英靈本身透過👥同伴面板正式召喚仍不受影響，只是不會再以「路上巧遇陌生人」的形式出現。

5. **「看看四周」改按鈕**：移除原本用來猜測玩家是不是在問「這裡還有誰」的`KANSHOU_ASKING_WHO_ELSE_RE_`正則表達式，改成前端明確按鈕：`send()`新增第5個參數`lookAround`(預設false，向後相容既有呼叫點)，夾進`gasRun`的`lookAround`欄位；後端判斷條件從`KANSHOU_ASKING_WHO_ELSE_RE_.test(userMsg)`改成`userData.lookAround === true`。前端新增`kanshouLookAround()`(不移動、不換地點，原地問)，按鈕放在地圖分頁「路上可能巧遇陌生人」勾選框下方。

6. **順手修正**：`buildDefaultSystemPrompt()`的`specificRules`(慾海律令)第5條殘留§54拆分前的舊描述「physical_state只寫顏面神情與衣裝狀態」，跟實際schema(已拆成兩欄)不符，改成分別描述兩欄職責——此為`specificRules`非`nsfwBaseRules`本體，逐字元核對確認未動到紅線常數。

**未動的部分**：`nsfwBaseRules`常數本體逐字元核對未受影響；`actionKanshouSummonHero`(重邀復活舊列的邏輯)/`actionKanshouRemove`(退出同行、保留列凍結LOC的邏輯)完全未動，Phase 2直接複用這兩顆既有函式的既定行為，只是新增「呈現」層讓AI知道可以自然演出重逢；玩家設計文件提到的「直接移動/慢慢走」選項與時間判斷機制，玩家已明確表示「後續再看要不要做」，本輪未實作。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0；`nsfwBaseRules`常數逐字元比對前後IDENTICAL。部署後建議測試：①切換分區按鈕清單正確跟著換；②請走一位同伴後，移動到TA被留下的地點，確認AI有演出重逢而非把TA當陌生人；③多次「出門走走」觀察巧遇對象確實會出現女性英靈，且已同行的英靈不會又以陌生人身分重複出現；④點擊「看看四周還有沒有其他人」按鈕能觸發巧遇重擲、且不移動地點。

## §56 留人重逢支援多人同地點＋修正被請走的同伴仍賴在頂部標籤卡片的bug＋請走/關係按鈕搬上卡片（2026-07・玩家「如果不同行但同地點 AI能知道這地點還有誰嗎?!」＋「請走和關係按鈕 做到 標籤的卡片上?」）

**背景**：§55上線後玩家追問兩件事：①留人重逢(`kanshouLeftBehindIdx`)當初用`findIndex`只抓「第一位」符合條件的舊同伴，若同一地點凍結不只一位故人，只有一位會被AI知道，其餘形同不存在；②想把原本只在👥同伴面板才有的「請走」「🏷️關係」按鈕，直接做到頂部常駐的「標籤」卡片(從者卡)上，不必開面板才能操作。

**改動**：

1. **多位留人重逢（`gas/Gallery.gs`）**：`kanshouLeftBehindIdx`(單一index，`findIndex`)改成`kanshouLeftBehindIdxs`(陣列，`reduce`收集全部符合條件的索引)。`kanshouEncounterHero`擲骰的跳過條件從`=== -1`改成`.length === 0`；`kanshouReunionStr`從單一物件的立即函式改成`.map(idx => ...).join('')`，同一地點有幾位故人就注入幾段重逢提示，不再只挑一位。

2. **修正「請走」後仍賴在頂部卡片的bug（`gas/Router_Action.gs` `buildTagsPayload_`）**：查證後發現這是既有bug——`servants.push`的收集條件原本只濾`FACTION==="從者"`＋同game_id＋非`DEAD_`，完全沒濾`IS_PARTY`。鑑賞「請走」(`actionKanshouRemove`)只清空`IS_PARTY`、保留整列(供留人在原地/重邀用)，導致被請走的同伴其實仍會被這個過濾條件收進`servants`陣列、繼續顯示在遊戲頂部常駐的「標籤」卡片上，不會真的消失。補上`IS_PARTY==="同行"`過濾修正；solo的從者列建立當下就寫死"同行"且從無任何路徑清空這欄(全代碼庫查證只有kanshou的`actionKanshouRemove`會清空)，此過濾對solo安全、行為不變。順手在`servants.push`補上`tag: s[COL.PC.REL_TAG] || "從者"`欄位，供下一步的卡片按鈕使用。

3. **請走／關係按鈕搬上卡片（`gas/Script.html` `buildSvCard`鑑賞分支）**：在既有「👗換裝／📜詳細狀態」按鈕列下方，新增第二列「🏷️關係／請走」按鈕，直接呼叫既有的`kanshouEditRelTag`/`kanshouRemove`(定義在`Script_Kanshou.html`，同頁全域作用域，兩檔本就恆同時載入、互叫無礙)——不重寫任何後端邏輯或新增action，純粹讓玩家不必開👥同伴面板也能操作。名字旁的好感數值也順手補上關係標籤文字(`💗32 · 戀人`)，方便玩家不開詳細狀態就能看到目前關係。👥同伴面板(`kc-overlay`/`renderKcPartyList_`)本身完全未動，兩處按鈕呼叫同一個後端action、行為一致。

**未動的部分**：`actionKanshouRemove`/`actionKanshouSummonHero`/`kanshouEditRelTag`/`update_rel_tag`底層邏輯完全未改，只是新增呼叫入口與修正上游過濾條件；`nsfwBaseRules`常數本體逐字元核對未受影響。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①同一地點刻意留下2位以上故人(在該地點依序請走多位)，重返時確認narration有提及全部、不只一位；②請走一位同伴後，確認TA立刻從頂部標籤卡片消失(不再賴著顯示)；③在標籤卡片直接點「請走」「🏷️關係」，確認效果與開👥同伴面板操作一致(卡片消失/關係更新)。

## §57 鑑賞標籤卡片下方直接露出空位，不必挖進☰抽屜找同伴面板入口（2026-07・玩家「同伴面板 有辦法 不做在+ 裡面嗎? 類似玩家剛進來 左邊標籤下面就有3個空位 點選後可以挑角色 (先預設女性)?」）

**背景**：👥後日談同伴面板原本只能透過畫面右下「＋」展開的抽屜(`#action-drawer`)裡的「後日談同伴」項目(`openCompanions()`)才能打開，玩家覺得藏太深，希望比照3個同伴名額，直接在左側標籤卡片下方露出空位，點了就能挑角色，且預設先篩女性。

**改動**：
1. **`gas/Script.html` `refreshFateTags`(鑑賞分支)**：`sh`(從者卡片區塊)組裝完在場同伴卡片後，額外算`kcEmptySlots = 3 - myServants.length`(3是既有硬編的同伴上限，跟`actionKanshouCompanions`回傳的`max:3`一致)，每個空位補一張虛線邊框的「➕ 邀請同伴入席」卡片，`onclick`直接呼叫既有的`openCompanions()`——不新增action、不重寫召喚邏輯，只是多一個更顯眼的入口。原本`myServants.length===0`時鑑賞會誤顯示solo措辭的「（尚未召喚）以令咒召喚你的英靈」文案(§56 IS_PARTY過濾修正後，鑑賞真的可能顯示0在場同伴，這句solo專屬文案第一次會被顯示出來)，順手補上`pc.mode==='kanshou'`分支排除這句不合語境的文案。
2. **`gas/Script_Kanshou.html`**：`_kcFilterGender`初始值從`''`(全部)改成`'女'`——`openCompanions()`每次開面板沿用這個模組層級變數，玩家仍可隨時用既有的性別下拉選單切換成男/全部，只是預設不用手動篩一次。

**未動的部分**：☰抽屜裡原本的「👥 後日談同伴」項目(`drawer-companions`)完全保留、行為不變，當備用進入點；`openCompanions()`/`ensureKcOverlay_`/召喚與請走的後端邏輯完全未碰，這次純粹是「多一個更順手的入口＋改一個預設值」。`nsfwBaseRules`常數本體逐字元核對未受影響(本輪未動`Engine_Combat.gs`/`Gallery.gs`)。

**驗證**：`bash check.sh`全過。部署後建議測試：①同伴不滿3人時，標籤卡片下方確實看到對應數量的「➕邀請同伴入席」空位卡；②點擊空位卡能正確開啟同伴面板；③面板召喚清單的性別篩選預設已是「女」，切換到「全部」/「男」後仍正常運作；④同伴滿3人時空位卡片數為0，不多出多餘卡片。

## §58「家」升級成跟其他4區並列的第5個分區，內含5個房間（2026-07・玩家「玩家公寓（家） << 這可以直接開個分支嗎?」→「家、深山町、冬木市、港口、山林 這樣的分支」，房間用「客廳 廚房 臥室」+ 補齊到5個）

**背景**：§55上線的「家」原本不是分區系統的一部分——它是釘選在分區分頁上方、永遠可見的獨立按鈕，顯示名稱由玩家自訂(`【住所】`標記)，且是唯一比對邏輯特判的「地點」(`isHomeMove`)。玩家看完分區地圖後回頭問，能不能把「家」也做成跟深山町/冬木市/港口/山林並列的第5個分支，底下給幾個具體房間。

**設計**：把「家」從「特判的單一地點」升級成「跟其他4區完全同構的第5個分區」——底下放5個房間(客廳/廚房/臥室/浴室/陽台)，每個房間都是`KANSHOU_LOCATIONS_`裡普通的一筆資料(只是多一個`noEncounter:true`旗標)，跟其餘17個地點走完全相同的`moveTarget`比對／LOC寫入／留人重逢路徑，不再需要`isHomeMove`這個特判分支——移除後例外處理少一條，資料驅動的一致性提高一階。玩家自訂顯示名稱(`getKanshouHomeName_`/`setKanshouHomeName_`)保留，只是用途從「整個按鈕的文字」限縮成「這個分區分頁的標籤文字」。

**改動（`gas/Gallery.gs`）**：
1. `KANSHOU_REGIONS_`新增`{id:'home', name:'家', desc:'私人空間'}`(排在最前面)。
2. `KANSHOU_LOCATIONS_`新增5筆`region:'home'`地點：客廳／廚房／臥室／浴室／陽台，皆帶`noEncounter:true`。
3. `actionPlay`：移除`homeName`/`isHomeMove`兩個區域變數與其比對邏輯，`moveTarget`比對回歸單純的`KANSHOU_LOCATIONS_.find`；`if (moveTarget || isHomeMove)`簡化成`if (moveTarget)`；巧遇擲骰的判斷條件從「`moveTarget &&`(隱含排除isHomeMove)」改成明講「`!moveTarget.noEncounter`」，改用資料欄位而非地點名單排除法；「看看四周」(`lookAround`)分支同步補上`!curLocDef.noEncounter`。事件靈感種子(Phase 3)不受`noEncounter`限制，家的5個房間一樣會抽——這是同行同伴間的氛圍調味，不是陌生人巧遇，跟「私人空間不觸發陌生人」的初衷不衝突。

**改動（`gas/Script_Kanshou.html`）**：`KC_REGIONS_`/`KC_LOCATIONS_`同步新增`home`分區與5個房間；`kcActiveRegion_`預設值從`'shinzan'`改成`'home'`(玩家進場後預設先看到自己家)；`kcMapListHtml_`拿掉原本釘選在分區列上方的獨立「🏠家」按鈕，改成分區分頁列裡的第一個分頁(標籤文字讀`pc.homeName`，其餘4區讀靜態`rg.name`)；改名功能(`kanshouRenameHome`)保留，改成只在「家」分頁展開時才顯示的一行「✏️幫「XX」改名」小字，不佔用其他分區版面。

**未動的部分**：`getKanshouHomeName_`/`setKanshouHomeName_`/`kanshou_set_home_name` action底層邏輯完全未改；`kanshouLeftBehindIdxs`(留人重逢)/`kanshouRollEvent_`(事件種子)沿用既有邏輯，天然對家的5個房間生效，不需要額外改動；`nsfwBaseRules`常數本體逐字元核對未受影響。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①「家」分頁顯示在分區列最前面、標籤文字正確顯示自訂住所名；②切換到「家」分頁能看到客廳/廚房/臥室/浴室/陽台5個房間按鈕，移動過去不會巧遇陌生人；③在家的房間之間移動/停留仍可能出現氛圍事件種子；④「✏️改名」只在「家」分頁展開時出現，改名後分頁標籤即時更新。

## §59 鑑賞地圖按鈕顯示地點人數徽章（2026-07・玩家「可以顯示 那個地點 有幾個人物嗎? 理論上我可以召喚全部角色 放到地圖上?」）

**背景**：玩家問能否在地點按鈕上看到那裡有幾個人物，並好奇「理論上能不能把全部角色都召喚出來、分散放在地圖上」。後者其實已經成立——同行同伴上限3人，但「請走」不刪列只清`IS_PARTY`、凍結在最後所在地點(§55的留人重逢正是建立在這個機制上)，玩家可以反覆「召喚→移動到某地→請走」把不同英靈分別留在不同地點，理論上23位種子英靈都能各自留一位在地圖各處；只是先前完全沒有介面能讓玩家「看到」這些分散各地的人，才有這次的請求。

**改動**：
1. **`gas/Router_Action.gs` `buildTagsPayload_`**：新增`locationCounts`(僅鑑賞`gameId`以`"k_"`開頭時才計算，solo無此概念)——掃一次`pcData`，依`LOC`分組計數此局所有存活的`FACTION==="從者"`列(不分是否同行)。同行同伴的LOC恆等於玩家目前所在地，這個數字主要意義在顯示「留人在原地」的舊同伴分佈在哪些地點。
2. **`gas/Script_Kanshou.html` `kcMapListHtml_`**：地點按鈕讀`window._lastTags.locationCounts`(每次sync/actionPlay回應都會更新，不另打網路)，人數>0就在按鈕右側補一個「👤N」小徽章。
3. **`gas/Script.html` `send()`**：`refreshFateTags(data.tags)`更新完`window._lastTags`後，鑑賞模式下額外重繪一次`#kc-map-list`(純本地`kcMapListHtml_()`重繪，不打網路)，讓移動/請走後徽章數字即時反映最新分佈，不必等下次手動切分頁才更新。

**未動的部分**：`actionKanshouRemove`/`actionKanshouSummonHero`底層邏輯完全未改；`nsfwBaseRules`常數本體逐字元核對未受影響(本輪未動`Engine_Combat.gs`)。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①請走一位同伴、移動去別的地點後，回頭切換分區能在該同伴被留下的地點按鈕上看到「👤1」徽章；②同一地點留下多位故人時數字疊加正確；③移動/請走後不必手動重整頁面，徽章數字就會即時更新。

## §60 鑑賞新增「今日行動排程＋結束一天」輕量文字經營玩法（2026-07・玩家給的完整參考大綱「FATE kanshou 改成『文字經營類』玩法」）

**背景**：玩家提出一份完整設計大綱，想把鑑賞從純聊天升級成輕量文字經營：每天可以指派同行同伴去某個地點打工/活動，晚上「結束一天」時根據各自的行動生成回家情節。玩家也主動問我的架構意見。

**我的建議與玩家默認採用的兩個關鍵取捨**（因AskUserQuestion工具當次呼叫失敗、依我的建議直接施工，未等玩家逐項確認，設計原則已在對話中先講清楚）：
1. **結束一天只打一次AI呼叫**，不是每位同伴各自跑一次——把當天所有同伴的地點/氛圍種子一次性餵給同一個prompt，讓AI一次寫出「大家陸續回家」的綜合敘事，避免3位同伴=6次AI呼叫拖慢速度、增加成本。
2. **打工地點沿用現有全部22個地點**（17個一般地點＋家的5個房間），不另外設計一份「適合打工」的子清單——維護成本最低，之後地圖擴充新地點也自動能拿來打工。

**設計核心：不新增平行敘事管線，`actionEndDay`直接複用`actionPlay`整條既有管線**——這是本次最重要的架構決定。沒有寫`generateWorkEvent`/`generateHomeEvent`這兩個獨立函式，而是讓「結束一天」變成`actionPlay`認得的一個特殊輸入旗標(`userData.endDay===true`)，跟既有的`moveTarget`/`lookAround`同一個等級——系統組一句合成訊息取代玩家打的文字，其餘完全走原本的在場驗證/NSFW規則/rel_changes/intimacy_feedback/driveOn尺度全部照舊，零重複程式碼、零新增的AI呼叫封裝。

**改動**：
1. **`gas/Core_Settings.gs`既有的`makeTextTag_`共用工廠**：新增`【今日行動】`標記(`kanshouDailyScheduleTag_ = makeTextTag_('今日行動')`)，存在被指派的同伴自己那一列的MEMORY，不是玩家那列——地點是受信任的內部字串(來自`KANSHOU_LOCATIONS_`合法清單)，符合這個工廠原本設計的使用場景，不必手寫新的get/set正則。
2. **`gas/Gallery.gs` `actionKanshouSetDailySchedule`(新action)**：玩家把在場同伴各自指派一個地點，只能指派「同行」中的同伴、地點需在`KANSHOU_LOCATIONS_`合法清單內，不改動LOC/IS_PARTY——純敘事層排程意圖。
3. **`gas/Gallery.gs` `actionKanshouCompanions`**：`current[]`每筆補上`schedule`欄位(讀`kanshouDailyScheduleTag_.get`)，供排程面板預填目前選擇。
4. **`gas/Gallery.gs` `actionPlay`**：`finalUserMsg`從`const`改`let`；`sameGame`定義完畢後新增`userData.endDay===true`分支——收集所有同行同伴，逐位讀取【今日行動】、算一次跟移動抵達同款的`kanshouRollEvent_`氛圍種子當靈感、組成一句「大家陸續回家」的合成訊息覆蓋`finalUserMsg`，並立刻清空排程(直接寫回試算表)準備明天。若沒有任何同行同伴則維持原樣(當作沒有這個旗標，走一般對話)。順手把`const userMsg = userData.message`加上`|| ""`防呆(endDay呼叫不一定會帶message，避免下游`.includes`炸掉)。
5. **`gas/Router_Action.gs`**：`ActionRouter`新增`"kanshou_set_daily_schedule": actionKanshouSetDailySchedule`；`kanshou_end_day`不需要新entry，直接複用既有的`"play"`(見下)。
6. **前端(`gas/Script_Kanshou.html`)**：`renderKcPartyList_`每位同伴卡片補一行「📅今日行動」下拉選單(選項=`KC_LOCATIONS_`全部地點)，選了就即刻呼叫`kanshou_set_daily_schedule`存檔(比照既有🏷️關係/請走的「選了就存」慣例，無額外儲存按鈕)；新增`kanshouEndDay()`——不是新增一套回應處理邏輯，而是呼叫既有`send('...', false, null, null, false, true)`(第6參數`endDay`)，完全複用聊天訊息的渲染管線。
7. **`gas/Script.html`**：`send()`簽名加第6參數`endDay`，透傳進`gasRun`的`endDay`欄位；地圖分頁(鑑賞)的「👀看看四周」按鈕下方新增「🌙結束一天・大家回家」按鈕。

**未動的部分**：`actionPlay`既有的所有分支(移動/巧遇/留人重逢/事件種子/rel_changes/intimacy_feedback)完全未改動邏輯，只多了一個提前覆寫`finalUserMsg`的旗標分支；`nsfwBaseRules`常數本體逐字元核對未受影響。玩家原大綱提到的「早上排程」與「回家」拆兩顆函式的構想改成合併成一次AI呼叫，理由已在上方說明。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①在👥同伴面板幫在場同伴選今日行動地點，確認選了就存、重開面板仍看得到已選值；②點擊「🌙結束一天」，確認AI一次性生成提及所有已排程同伴的回家敘事，且未排程的同伴顯示「留在家」；③結束一天後同伴的今日行動下拉選單應恢復「不指派」(排程已被清空)；④沒有同行同伴時點「結束一天」應優雅地退回一般對話(不報錯)。

⚠️ **本節已被§61取代**：玩家實際玩過後定案「不想手動指派、要更有入戲感」，§60這套「玩家手動選地點」的排程UI/action/MEMORY標記已整條移除，改成§61的「GAS直接判定」。以下小節內容僅供歷史脈絡參考，程式碼現狀請見§61。

## §61「文字經營」定案二：拿掉玩家手動排程，改GAS直接判定英靈隔天去哪（2026-07・玩家「是不是就不要讓玩家指派別別人去工作了？直接gas判定？他是在工作還是在活動消費？」——這是往「衛宮家寄宿」大改版邁進的第一步，其餘部分(左側面板改人物定位清單/開場車站接人/AI提議移動需玩家同意)排在後續階段）

**背景**：玩家玩過§60的手動排程UI後，覺得「入戲感」不夠，覺得應該像原作衛宮家那樣——同伴各自過各自的生活，玩家不用像管理遊戲一樣一個個指派工作，直接讓GAS決定就好。這也是整個「拿掉同行機制、左側面板改成人物定位清單」大改版的第一步：既然以後同行只在約會時才是暫時狀態，那「不在身邊的英靈」平常在哪，本來就該是GAS自己決定，不該是玩家的排程作業。

**改動**：
1. **移除**：`kanshouDailyScheduleTag_`(§60新增的`makeTextTag_('今日行動')`)、`actionKanshouSetDailySchedule`整顆函式、`ActionRouter`裡的`kanshou_set_daily_schedule`項、`actionKanshouCompanions`回傳的`schedule`欄位、前端`renderKcPartyList_`的下拉選單UI與`kanshouSetDailySchedule()`函式——整條「玩家手動選地點存檔」的路徑清空，一行不留。
2. **新增`kanshouRollDailyLocation_(heroName)`**：不需要新資料——反查既有的`KANSHOU_LOCATION_TAGS_`(地點×角色氛圍標籤，原本是給隨機巧遇用的)，找出有哪些地點標到這位英靈的id(她平常會去的地方)，加權隨機挑一個；查無標籤就從全部地點隨機挑。跟隨機巧遇共用同一份標籤資料，不必為「日常行程」另外設計一套地點權重。
3. **`actionPlay`的`endDay`分支重寫**：不再讀取/清空【今日行動】標記，改成直接對所有「不在身邊」(`IS_PARTY`非同行)的英靈呼叫`kanshouRollDailyLocation_`、把結果寫進她的`LOC`——同行同伴的位置本就恆等於玩家所在地，不需要另外處理。合成訊息簡化成單純的「夜幕降臨、今天到此為止」日夜交替收尾句，不再列舉每個人去了哪裡(那是GAS內部資料變動，不必逐一敘述)。

**設計理由**：「不在身邊的英靈各自過生活」本來就已經有一套現成機制——留人重逢(`kanshouLeftBehindIdxs`)+地點人數徽章(`locationCounts`)——這兩個都是讀`LOC`欄位、不管是怎麼變的。這次只是讓`LOC`從「請走當下凍結、永遠不變」變成「每天結束會依標籤重新洗一次」，讓地圖有了「今天她在哪、明天可能換地方」的活氣，不需要新開一條平行的「行程」概念。

**未動的部分**：`kanshouLeftBehindIdxs`/`locationCounts`/`kanshouRollEncounter_`底層邏輯完全未改，天然吃到新的`LOC`滾動結果；`nsfwBaseRules`常數本體逐字元核對未受影響。「左側面板改人物定位清單」「開場車站接人/衛宮家預設家」「AI提議移動需玩家同意」三塊大改版留待後續階段實作，本輪只完成「拿掉手動排程」這一步。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①👥同伴面板不再顯示「今日行動」下拉選單；②點擊「🌙結束一天」，確認不在身邊的英靈LOC有依機率重新分佈(可用地點人數徽章觀察變化)；③同行同伴不受影響，位置仍跟玩家同步；④多按幾次「結束一天」，確認同一位英靈的地點會變動(不會卡死在同一處)。

## §62 鑑賞新增「AI提議換地點需玩家同意」機制（2026-07・玩家「我在別的遊戲有做過一個讓ai邀請我移動位置的渲染...就是ai想換地點要經過玩家同意（敘述停留在訊問會跳出同意和拒絕，玩家同意後才可以進行移動敘述並將npc與玩家位置進行移動！）」——衛宮家大改版三塊後續階段之一，本輪只做這塊）

**背景**：現有`location`欄位只能事後回報「這回合已經移動到哪」，AI若想主動邀玩家換地方(如同伴說「要不要去圖書館？」)，敘述會一路寫到抵達，玩家完全沒有選擇權。玩家指定要做成「敘述停留在邀請的當下、跳出同意/拒絕UI，玩家同意後才真的觸發移動」的兩段式流程。

**改動**：
1. **`buildDefaultSystemPrompt()`的`finalJson`新增`move_proposal`欄位**：與既有`location`(已發生的移動)區分開來，是「同伴這回合自然而然想邀你換地方」時才填的目標地點名稱，沒有這意圖就留空字串。
2. **`actionPlay`每回合提示新增`★【提議換地點需玩家同意】`規則**：明列`KANSHOU_LOCATIONS_`全部地點名當合法選項，並嚴令「narration只寫到邀請/提議的當下、絕對禁止接著寫出移動或抵達的過程」，是否成行留給玩家事後決定；也提醒AI不要每回合都提議。
3. **後端驗證**：在既有`aiLoc`(已發生移動)LOC同步區塊之後，新增`moveProposalRaw`/`moveProposal`檢查——只有落在`KANSHOU_LOCATIONS_`名單內的字串才會被當成合法提議往前端送，不合法(含AI亂填)一律當作沒有提議。這裡**只驗證合法性，不寫LOC**——真正的移動要等玩家按「同意」、前端帶著`moveTarget`再送一次，走既有`moveTarget`管線(含巧遇/留人重逢等既有效果)，不另開一條移動路徑。
4. **`actionPlay`回傳值新增`moveProposal`欄位**(合法才帶值，否則`undefined`不佔欄位)。
5. **前端`Script.html`**：`send()`回應處理區塊原本只渲染`data.options`，現在合併渲染——若有`data.moveProposal`，在選項上方插入一張「💭 提議前往「X」」卡片＋「同意/拒絕」兩顆按鈕，兩者都併入同一個`optionsHtml`字串、一次寫進`optContainer.innerHTML`。
6. **`Script_Kanshou.html`新增`kanshouConfirmMoveProposal(loc)`/`kanshouDeclineMoveProposal()`**：同意就呼叫`send(...,loc)`帶著既有`moveTarget`參數(跟玩家點地圖按鈕`kanshouMoveTo`同一條路，含巧遇/留人重逢等效果，並比照`kanshouMoveTo`先`showGamePane('chat')`切回故事分頁)；拒絕就送一句「這次還是先留在這裡好了」的普通續寫訊息，原地不動、不換分頁。

**設計理由**：全程遵守「重用既有引擎、不加平行路徑」——`move_proposal`只是暫存「AI想不想邀」這個意圖，實際移動的執行(含地點合法性檢查、巧遇/重逢判定、LOC寫入)完全交給既有的`moveTarget`管線，同意鍵按下去等同於玩家自己點了地圖上的那個地點按鈕，沒有新寫任何移動邏輯。

**未動的部分**：`nsfwBaseRules`常數逐字元核對未受影響(808字元不變)；既有`location`欄位(已發生移動的回報)、`moveTarget`管線、`kanshouRollEncounter_`/留人重逢等下游邏輯完全未改。「左側面板改人物定位清單」「開場車站接人/衛宮家預設家/任務面板」兩塊仍留待後續階段，本輪只完成「AI提議換地點需玩家同意」這一塊。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0（`buildDefaultSystemPrompt()`本體有改動，另外逐字元核對`nsfwBaseRules`區塊 identical，長度808不變）。部署後建議測試：①跟同伴聊天到AI自然帶出「要不要去OO」的邀約，確認敘述真的停在邀請、沒有偷跑寫抵達過程；②畫面跳出「同意/拒絕」卡片；③按「同意」，確認真的移動(含可能觸發的巧遇/重逢)且分頁自動切回故事；④按「拒絕」，確認原地不動、正常收到一句續寫；⑤確認一般`data.options`(命運的抉擇)選項在無提議時仍正常顯示、有提議時兩者同時出現不互相覆蓋。

## §63 鑑賞新增「玩家反向提議換地點」：一回合內當場決定，不走同意/拒絕UI（2026-07・玩家「這個換地點 可以讓玩家反向提議嗎？同意、拒絕、提議（可輸入？或是可選擇比較可控？）」→ 確認要「單次回合內決定」而非比照§62的兩段式）

**背景**：§62做完AI主動邀玩家的方向後，玩家問能不能反過來——玩家主動邀同伴換地方。這裡跟§62結構不對稱：AI提議需要暫停等玩家同意，是因為玩家是真人，AI沒辦法在同一次回應裡就知道玩家怎麼選；但玩家提議換地方時，同伴要不要跟，AI在同一次回應裡就能判斷完畢(依角色個性當場答應或婉拒)，不需要像§62那樣分兩段來回、也不需要另外的同意/拒絕UI。玩家確認要的正是這種「單次回合內決定」的效果。

**改動**：
1. **`Gallery.gs`每回合提示新增`★【玩家反向邀約】`規則**：明確告訴AI這跟「AI提議」方向相反——玩家主動邀同伴換地方時，同伴的反應由AI當場依個性決定，答應就直接在該次narration裡把邀約/移動/抵達一次演完並更新`location`；不想去就演出婉拒，`location`維持原樣；【不需要】走`move_proposal`欄位。
2. **`kcMapListHtml_`地點按鈕改版**：原本每個地點只有一顆`kanshouMoveTo`按鈕(玩家自己走，無條件強制移動)，現在旁邊多一顆`👋`小按鈕(`kanshouProposeMove`)，兩者並排，各自獨立觸發。
3. **`Script_Kanshou.html`新增`kanshouProposeMove(name)`**：跟`kanshouMoveTo`的關鍵差異是**不帶`moveTarget`**，走一般聊天訊息管線(送出「（笑著問）要不要一起去「X」看看？」)，讓AI在同一回合的自由敘事裡自行判斷同伴要不要去、並依既有`location`欄位機制決定要不要真的换地方——完全複用既有的自由對話+location管線，backend零新增邏輯(只有一句提示規則)。

**設計理由**：`kanshouMoveTo`(強制移動)適用於玩家自己一個人走到哪裡都不需要誰同意；`kanshouProposeMove`(邀約)適用於玩家想拉同伴一起换地方、同伴可能有自己的意願——這條路徑本來就已經被既有的「自由對話AI決定location」機制涵蓋，這次只是①補一顆方便按的按鈕(不用打字)②在提示裡明講這是「一回合內當場決定」，不會誤觸發到§62那套「暫停等同意」的two-step流程(兩者是互斥的：`move_proposal`只給AI主動提議用，玩家主動邀約時AI應直接在這句narration裡演完，不填`move_proposal`)。

**未動的部分**：`nsfwBaseRules`常數逐字元核對未受影響(808字元不變)；§62的`move_proposal`/同意/拒絕UI管線完全未改，兩條機制並存、互不干擾；`kanshouMoveTo`(強制移動)行為不變。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0；`nsfwBaseRules`逐字元核對 identical，長度808不變。部署後建議測試：①點地點旁的👋，確認送出邀約訊息而非直接強制移動；②同伴同意時，確認narration有演出移動過程且地點真的換了；③同伴婉拒時，確認地點沒變、敘述自然收在婉拒的當下；④确认原本的📍按鈕(kanshouMoveTo)行為完全不受影響，仍是直接強制移動。

## §64 鑑賞「點火」(driveOn主動掌握模式，AI_MODEL)敘事採樣參數調整＋補齊OpenRouter額外採樣旋鈕的passthrough（2026-07・玩家提供一組完整參數「temperature:1.08, top_p:0.97, top_k:60, repetition_penalty:1.12, presence_penalty:0.25, frequency_penalty:0.25」問「這樣調整可以嗎？」）

**背景**：`Gallery.gs`鑑賞主敘事(`actionPlay`)的`aiConfig`原本只給`temperature:1.0, top_p:0.95`兩顆標準OpenAI式參數；但`callGeminiAPI`(`Engine_Combat.gs`，共用層、非nsfwBaseRules本體)組payload時只轉發`temperature`/`top_p`/`max_tokens`，即便呼叫端在config塞`top_k`/`repetition_penalty`/`presence_penalty`/`frequency_penalty`也會被直接丟棄、完全沒有效果——玩家這組參數在改動前是空轉的。

**改動**：
1. **`callGeminiAPI`(`Engine_Combat.gs`)payload組裝新增4個條件式欄位**：`config.top_k`/`config.repetition_penalty`/`config.presence_penalty`/`config.frequency_penalty`只在呼叫端有明確帶值(`!== undefined`)時才寫進payload，沒帶的呼叫完全不受影響(向後相容)。這4個是OpenRouter支援、但非OpenAI標準四件組(temperature/top_p/max_tokens/response_format)的額外採樣旋鈕，走到不支援的底層模型時OpenRouter會靜默忽略、不會報錯。
2. **`Gallery.gs`鑑賞`aiConfig`套用玩家提供的完整6項數值**：`temperature:1.08, top_p:0.97, top_k:60, repetition_penalty:1.12, presence_penalty:0.25, frequency_penalty:0.25`，取代原本的`temperature:1.0, top_p:0.95`。這個`aiConfig`是`driveOn`(主動掌握/「點火」)與矜持模式共用的同一份設定，`model`欄位依`driveOn`切換(見`AI_MODEL`常數註解「同時是點火(driveOn=true)直接呼叫模型」)——`driveOn`時吃到`AI_MODEL`(預設`deepseek/deepseek-v4-flash`，開放權重模型，OpenRouter passthrough對這類模型支援度較完整)，矜持模式吃`SOLO_MODEL`(預設`google/gemini-3.1-flash-lite`)，其中`top_k`/`repetition_penalty`能否實際生效依底層供應商而定，未支援時等同沒設定，不會出錯。

**設計理由**：`repetition_penalty`+`presence_penalty`+`frequency_penalty`三者疊加是為了壓制敘事重複套路句(呼應既有的🚨敘事終極警告規則想避免的「那一夜／自此／就這樣／從此」等收尾陳腔)；`temperature`/`top_p`略升則是增加敘事變化度。玩家自己提供的完整數值組直接套用，不另外調整，因這屬於「跑跑看、之後再依實際輸出微調」的可逆參數，非結構性改動。

**未動的部分**：`nsfwBaseRules`常數逐字元核對未受影響(808字元不變)；`narrateWithState_`(`Router_Narrative.gs`，solo補魔/敘事)、其餘所有`callGeminiAPI`呼叫端(工房捏角/召喚生成等)完全未改，仍只帶`temperature`，新增的4個欄位對它們是no-op。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0；`nsfwBaseRules`逐字元核對 identical，長度808不變。部署後建議測試：①鑑賞主動掌握模式(driveOn)多跑幾回合，觀察敘事收尾語氣是否比之前少重複套路句；②矜持模式(非driveOn)敘事正常運作、無報錯(代表SOLO_MODEL即使不支援部分旋鈕也不會炸)；③如覺得效果太強/太弱，這組數值可再微調(全部集中在`Gallery.gs`這一行`aiConfig`)。

## §65 鑑賞「換裝改AI專屬」：移除同伴卡片上的手動換裝按鈕（2026-07・玩家「換裝是不是也只能用文字讓ai自己換才有感覺玩家只能決定自己的衣服？」→「換裝改AI專屬。這應該很快，拿掉按鈕而已？(需要保留嗎？萬一以後經濟系統有買服裝可以送她呢？)」）

**背景**：鑑賞同伴的服裝其實已經有兩條路徑並存——玩家手動按「👗換裝」鈕自訂＋AI依`outfit_change`欄位每回合如實更新(§49)。玩家覺得同伴的穿著該完全交給AI/劇情演出決定，不該由玩家用選單指定，更有代入感；但玩家本人的服裝仍保留手動控制(這點在稍早的討論已定案不變)。

**改動**：只刪`Script.html`鑑賞同伴卡片(`pc.mode === 'kanshou'`分支)裡觸發`changeOutfit(name)`的那顆「👗換裝」按鈕(原本跟「📜詳細狀態」並排，現在只剩詳細狀態一顆)。**沒有動**：
1. `changeOutfit()`函式本體、`actionSetOutfit`(`Router_Economy.gs`)、`getOutfit_`/`setOutfit_`/`clearOutfit_`(`Core_Settings.gs`)全部保留未刪——御主本人的「換裝」鈕(`changeOutfit(name, true)`，Script.html:1321)、solo從者卡的「換裝」鈕(Script.html:1442，非kanshou分支)都還在用同一套函式，不受影響。
2. AI驅動的`outfit_change`欄位/`sanitizeOutfitChange`/`setOutfit_`寫回邏輯(Gallery.gs)完全未改，同伴穿著依然持續被AI每回合更新、卡片上的「裝扮」顯示行也照樣讀取現值。

**設計理由(呼應玩家的「需要保留嗎」提問)**：只拔前端「觸發同伴換裝」的那顆按鈕，底層`actionSetOutfit`/`getOutfit_`/`setOutfit_`資料模型完整保留——這不是刪除功能，是收回玩家手動觸發同伴換裝的入口。若以後想做「買衣服送同伴」這類經濟功能(目前仍受CLAUDE.md經濟紅線約束、未拿到明確解禁前不會動工)，屆時只需要新增一個呼叫`actionSetOutfit`的入口(如「贈送」流程完成後呼叫，等同代替玩家按下原本那顆鈕)，不需要重建整套換裝資料層——原地保留最大彈性、不用两邊都猜。

**未動的部分**：`nsfwBaseRules`常數逐字元核對未受影響(未觸及Engine_Combat.gs/Gallery.gs)。「衛宮家寄宿開場改版」「左側面板改人物定位清單」兩塊仍待後續實作，本輪只完成「換裝改AI專屬」這一步。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(本輪未改這兩檔，形式上仍跑一次確認)。部署後建議測試：①鑑賞同伴卡片只剩「📜詳細狀態」一顆按鈕，沒有「👗換裝」；②御主本人卡片的「👗換裝」鈕正常運作(不受影響)；③solo模式從者卡的「👗換裝」鈕正常運作(不受影響)；④跟同伴互動幾回合，確認AI仍會依劇情自然更新她的穿著(裝扮顯示行有變化)。

## §66 鑑賞「結束一天」新增強制回家：不管白天晃到哪都拉回臥室過夜（2026-07・玩家問「新玩家開場就是在車站，SABER會來迎接、提議去衛宮家，玩家不理她，他就一直在車站發呆...？還是可以寫一個機制，讓大家晚上都回到家裡？」——為衛宮家開場改版鋪路的安全閥設計）

**背景**：討論「衛宮家寄宿開場」時，玩家點出一個邊界情況——如果玩家忽略AI在開場提議的移動邀約(§62)、又自己不主動移動，會不會卡在原地(如車站)發呆出不來？既有的「🌙結束一天」(§60/§61)只處理不在身邊英靈的隔天去向，玩家自己跟同行同伴的LOC完全沒被這顆按鈕動過——如果玩家真的放置不理，確實會一直卡在原地。玩家提議乾脆讓「結束一天」順便把大家都拉回家，這樣無論白天發生什麼(忽略提議、迷路、放置)，玩家永遠有這顆按鈕當退路。

**改動**：`actionPlay`的`endDay`分支新增——不管玩家目前`LOC`是什麼，一律強制寫回`臥室`(`kanshouHomeLoc_`)，同步清除【邂逅中】巧遇標記(比照移動時的既有清除邏輯)，並把`curL`同步更新(供本回合合成訊息用的位置正確)；同行同伴(`partyForEndDay`)的`LOC`也一併同步拉回臥室——不再假設「同行同伴位置本就恆等於玩家所在地」會自動成立(那個恆等式其實是靠`moveTarget`分支的位置同步撐起來的，`endDay`分支原本沒有走那條路，這次補上)。合成的收尾訊息文字也順手改成「回到家中安頓下來」，呼應這個新行為。

**設計理由**：這是「玩家永遠有路可退」的安全閥——不必特判「玩家到底有沒有理某個提議」、「有沒有走去某個地點」，最壞情況下玩家只要按一次「結束一天」就保證回到已知、可控的起點(臥室)，不會被任何忘記處理的邊界情況卡死。這也直接解決了「衛宮家寄宿開場」設計中「玩家不理SABER的提議、放置在車站」這個潛在softlock，不需要為onboarding另外寫一套「強制送回家」邏輯——沿用已存在的按鈕跟已存在的分支即可。

**未動的部分**：`nsfwBaseRules`常數逐字元核對未受影響。「衛宮家寄宿開場改版」「左側面板改人物定位清單」仍待後續實作——這次只是先把「結束一天」補齊成一個可靠的安全閥，讓之後蓋開場時不必擔心這個邊界情況。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0；`nsfwBaseRules`逐字元核對 identical，長度808不變。部署後建議測試：①移動到任一非家的地點，按「🌙結束一天」，確認自己跟同行同伴的位置都變回「臥室」；②確認地圖分頁的「家」分區/臥室按鈕能正確反映這個新位置；③確認不在身邊(非同行)英靈的隔天去向邏輯(§61)不受影響，仍照舊機率分佈。

## §67 鑑賞新增「推進時間」機制：真正的遊戲內時鐘取代現實時間同步（2026-07・玩家「我想要的就是有一個推進時間按鈕，可以控制NPC所在地點？按下去可能推進幾小時，NPC會依照時段移動到不同地活動？可能幾點到幾點就在家中活動？之前有要和現實同步，現在改成依照遊戲內時間？」——為後續「跳到節慶日期」鋪路的第一步）

**背景**：鑑賞原本刻意沒有遊戲內時鐘(`realWorldClockStr_()`的註解明講「鑑賞刻意無遊戲內時鐘/AP系統，改直接把現在真實時間餵給AI」)，AI只讀真實世界的當下時間帶出氛圍。玩家現在想要反過來：有一個能主動推進的遊戲內時鐘，按下去讓時間跳過幾小時，不在身邊的英靈依時段(深夜/清晨傾向在家)重新分佈去向；之後還想再疊「跳到特定節慶日期」——這次先把「真正的遊戲內時鐘」這個地基蓋好。

**改動**：
1. **借用solo既有的`COL.PC.DAY`/`COL.PC.HOUR`欄位**存鑑賞自己的時鐘——兩軌從不共用同一個`game_id`，欄位互不干擾，不必為鑑賞另開新欄。`actionEnterKanshou`建角時初始化`Day 1・08:00`。
2. **`kanshouRollDailyLocation_(heroName, hour)`新增選填的`hour`參數**：有傳時刻時，依`timeBand_(hour)`(既有的`Time_World.gs`時段分類函式)判斷——深夜(85%機率)/清晨(50%機率)大幅偏向留在家(`KANSHOU_LOCATIONS_`裡`region:'home'`的5個房間隨機挑一)，其餘時段沿用原本haunts加權邏輯不變；不傳(舊呼叫端)則完全比照改動前的行為。
3. **「🌙結束一天」現在真的推進時鐘**：固定跳到「隔天早上8點」(不論結束時是幾點)，`DAY`/`HOUR`寫回御主列；不在身邊英靈的`kanshouRollDailyLocation_`呼叫現在會帶入新的`08:00`(清晨時段)，讓「結束一天」跟新的「推進時間」共用同一套時段偏好邏輯。
4. **`actionPlay`新增`advanceHours`分支**(跟`endDay`互斥，`else`關係)：讀`userData.advanceHours`(上限400天防呆)，用`rollHours_`(`Time_World.gs`既有的純函式，直接reuse、不重寫)一次算出最終日/時——**不做逐小時模擬**，跳多久都是O(1)，不會因為要跳半年就跑迴圈拖速度。只重骰「不在身邊」的英靈去向，同行同伴不受影響(位置本就跟玩家同步)，不強制拉玩家回家(這點跟「結束一天」是刻意的差異)。
5. **前端新增`⏩2h`/`⏩6h`/`⏩12h`三顆按鈕**(`Script.html`地圖分頁，`結束一天`鈕上方)，呼叫`Script_Kanshou.html`新增的`kanshouAdvanceHours(hours)` → `send()`帶新增的第7個參數`advanceHours`。
6. **鑑賞主敘事的時鐘提示字串換成遊戲內時鐘**：`Gallery.gs`原本讀`realWorldClockStr_()`(組合`Utilities.formatDate(new Date()...)`真實世界時間)，改成直接讀`actionPlay`已算好的`curDay`/`curHour`組字串(`第${curDay}日・${timeBand_(curHour)}`)。`realWorldClockStr_()`因此變成零呼叫端的死函式，整顆從`Core_Settings.gs`刪除。

**設計理由**：全程「借用既有欄位／複用既有函式」——`COL.PC.DAY/HOUR`借自solo、`rollHours_`/`timeBand_`借自`Time_World.gs`、地點重骰複用§61的`kanshouRollDailyLocation_`只加一個選填參數，沒有新開一張時鐘表或一套平行的時間模型。「不做逐小時模擬、只算最終時刻」直接呼應玩家「可以快速GAS執行去做」的要求——不管推進2小時還是400天，运算量都一樣(O(1))。

**未動的部分**：`nsfwBaseRules`常數逐字元核對未受影響。「跳到特定節慶日期(春節/七夕等)」玩家已提出但本輪未做——等這顆時鐘上線、實測沒問題後，那塊只需要「算出距離目標日期還有幾小時」再餵進同一個`advanceHours`分支，不需要另開路徑，是很自然的下一步。「衛宮家寄宿開場改版」「左側面板改人物定位清單」仍待後續實作。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0；`nsfwBaseRules`逐字元核對 identical，長度808不變。部署後建議測試：①新建鑑賞角色，確認開局是Day1早上8點(觀察敘事時段感)；②按「⏩2h」數次，確認不在身邊的英靈位置有依時段重新分佈(深夜多半在家)；③按「🌙結束一天」，確認跳到隔天8點且玩家/同行同伴都回到臥室(§66行為不變)；④確認一般聊天(不按任何時間按鈕)不會讓時鐘悄悄推進；⑤確認敘事裡的時段氛圍提示不再提到真實世界的月份/星期幾，而是遊戲內的「第X日」。

## §68 鑑賞新增「跳到節慶」機制：§67抽象日改回真正的西曆年/月/日（2026-07・玩家先問「還想再做一個日期選擇...可能想跟他們過年或七夕」→我建議用抽象day-of-year、玩家一度確認「沒有年月日，比較自由不複雜」→實作到一半玩家改主意「我覺得加年月日會比較好...抓個3年的區間就好」）

**背景**：§67上線後玩家想追加「跳到特定節慶日期」，我原本用§67已有的「365天一輪」抽象日模型(`dayOfYear`)實作，不對外顯示真正月/日——玩家一度確認這樣比較簡單，但看到雛形後改主意，覺得顯示真正的年/月/日比較好，只是擔心「會不會難做」。答案是不會：因為`dayOfYear`模型內部本來就要換算「這是一年中的第幾天」，改成年/月/日只是在同一套換算上多加一層「哪個月第幾天」的查表，多寫幾行、邏輯複雜度沒有本質變化——同時採納玩家「抓3年區間就好」的簡化(不追求無限年份、不algorithm-精確處理閏年，遊戲用途夠用)。

**改動**：
1. **`KANSHOU_FESTIVALS_`從`dayOfYear`改回`{month, day}`**：新年初一(1/1)、情人節(2/14)、七夕(7/7，剛好對上日本七夕真實日期，冬木市的設定下不必再挑近似值)、中秋節(9/15)、聖誕節(12/25)、跨年夜(12/31)。
2. **新增`KANSHOU_CAL_START_MONTH_/DAY_`常數**當Day1的錨點(後於§69改成12/28，見下)，`KANSHOU_DAYS_IN_MONTH_`(不算閏年，每年固定365天，遊戲用途夠精準)。
3. **`kanshouDoyOffset_(month,day)`**：某月日距離當年1/1是第幾天，年/月/日互換共用的底層换算。
4. **`kanshouAbsDayToDate_(absDay)`**：從Day1累積天數 → `{year, month, day}`，取代§67的`kanshouDayOfYear_`。
5. **`kanshouHoursUntilDate_(curDay, curHour, targetMonth, targetDay)`**：取代§67的`kanshouHoursUntilFestival_`，算「距離下一次某月日還有幾小時」(已過今年這天就自動算明年)。
6. **`actionPlay`的`advanceHours`上限從400天改成`24*365*3`(3年區間)**，呼應玩家「抓個3年的區間就好」；`jumpFest`分支改呼叫`kanshouHoursUntilDate_(...,month,day)`。
7. **敘事時鐘提示與時間推進的合成訊息都改顯示真正年/月/日**(如「2年7月7日」)，取代§67的「第X日」抽象格式；新增`curDateObj_`在`actionPlay`裡只算一次供多處複用，不重複呼叫`kanshouAbsDayToDate_`。
8. **每回合提示新增`★【節慶氛圍】`**：跳到節慶當回合時提醒AI narration可自然帶入應景裝飾/氣氛，不必特別報幕解釋節日名稱本身(呼應show-don't-tell鐵則)。

**設計理由**：核心換算邏輯(年度天數偏移)在§67就已經存在，這次只是把「藏在內部、不對外顯示」的中間值(`dayOfYear`)直接攤開成`{year,month,day}`回傳給呼叫端，複雜度增量很小；`KANSHOU_FESTIVALS_`從抽象數字改成好讀的`{month,day}`，未來玩家想加新節慶(如「聖誕夜12/24」)直接照抄格式加一行，不用心算dayOfYear。

**未動的部分**：`nsfwBaseRules`常數逐字元核對未受影響。`kanshouRollDailyLocation_`的時段偏好(深夜85%/清晨50%在家)、`結束一天`固定跳隔天8點的行為完全未改，只有「時間顯示成什麼格式」跟「上限用天數還是年數表示」變了。「衛宮家寄宿開場改版」「左側面板改人物定位清單」仍待後續實作。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0；`nsfwBaseRules`逐字元核對 identical，長度808不變。部署後建議測試：①地圖分頁新增「🎊快轉到節慶」6顆按鈕；②點「七夕」，確認合成訊息顯示正確的年/月/日且narration有應景氛圍(不直白提節日名稱字面解釋)；③連續點同一個節慶兩次，確認第二次會跳到「明年」的那一天(不會卡在同一天不動)；④敘事的🕰️時鐘提示顯示「X年X月X日」而非§67的「第X日」；⑤推進超過3年上限的極端值(理論上前端按鈕不會觸發，但防呆值本身要正確夾住)。

## §69 開局錨點改成12月28日，第4天自然銜接跨年夜（2026-07・玩家「開局的年份是多少?我想要第一天是跨年前！28.29.30號！可以逛幾天後31準備一起跨年的感覺???」）

**背景**：§68實作時把`KANSHOU_CAL_START_MONTH_/DAY_`暫定為4/1(呼應原作聖杯戰爭開戰季節)，純粹是個沒有特別理由的預設值。玩家實際想要的是「開局就在跨年前幾天」，逛個2~3天後自然銜接上除夕跨年的氣氛。

**改動**：只改`KANSHOU_CAL_START_MONTH_/DAY_`兩個常數從`(4,1)`改成`(12,28)`——Day1=12/28、Day2=12/29、Day3=12/30、Day4=12/31，第4天直接對上`KANSHOU_FESTIVALS_`裡已經定義好的跨年夜(12/31)，不需要玩家特地按「🎊跳到節慶」，正常逛個3天、按幾次結束一天/推進時間自然就到了。

**設計理由**：整個年/月/日系統(§68)本來就是為了讓「Day1對應哪個月日」可以自由調整而設計的一個常數，改動範圍精準地只有這兩個數字，不影響任何換算邏輯本身。

**未動的部分**：`nsfwBaseRules`常數逐字元核對未受影響。`KANSHOU_FESTIVALS_`清單、時段偏好、其餘所有時鐘邏輯完全未改。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0；`nsfwBaseRules`逐字元核對 identical，長度808不變。部署後建議測試：新建鑑賞角色，確認開局顯示「1年12月28日」，按3次「🌙結束一天」後應該落在「1年12月31日」(跨年夜)。

## §70 鑑賞新增衛宮士郎／藤村大河兩位非戰鬥正典人物（2026-07・玩家問「士郎、大河這些人物也可以上場對話嗎？」→確認「直接坐在英靈種子，比較好對齊資料」）

**背景**：玩家想知道原作中非從者的正典人物(士郎、大河)能不能在鑑賞正式收錄、被召喚同行、累積好感記錄——不只是靠自由對話臨時客串。鑑賞早就有現成機制專門處理這種「正典人物、非戰鬥從者」的情況：`SEED_SERVANTS`裡`cls`刻意標`'御主'`(非七大職階)的條目(遠坂凜/伊莉雅絲菲爾/間桐櫻黑化)，只供鑑賞召喚、solo白名單會擋下(§32)。玩家確認「直接坐在英靈種子比較好對齊資料」——沿用同一套機制，不另開一條路。

**改動**：
1. **`Seed_Codex.gs`的`SEED_SERVANTS`新增兩筆`cls:'御主'`條目**：`衛宮士郎-Master`(男)、`藤村大河-Master`(女)，格式完全比照既有3位(`six:{}`/`classSkills:[]`/`skills:[]`/`traits:[]`/`np:''`皆空，`wars:['客串']`排除混亂模式敵從者池)。
   - 士郎：solo的`SEED_MASTERS`(敵御主資料庫)本來就有底稿(`衛宮士郎-5th`)，這裡改寫成鑑賞版——拿掉「大火孤兒／繼承切嗣理想」的悲劇成因，`dailyBack`改寫成單純的家人事實(「受衛宮家收養長大，如今自己打理老宅與工房」)，`moe`/`persona`延續原本「樂於助人到不要命」的角色定位但套用show-don't-tell格式。
   - 大河：完全沒有現成資料，從頭寫一份四段式persona(表象/內裡反差/厭惡)＋dailyLook/dailyOutfit/dailyWords/dailyMoe/dailyBack，依原作定位(大姊頭罩人、怕寂寞、廚藝奇差、地主家大小姐兼老師)寫成show-don't-tell格式。
2. **`Gallery.gs`的`KANSHOU_ENCOUNTER_MALE_IDS_`/`FEMALE_IDS_`新增這兩位**：讓他們不只能被玩家主動召喚，走到沒有特定標籤的地點時也有機率被隨機巧遇抽中(跟其餘既有男/女從者同一個池、同一套邏輯，沒有額外特判)。
3. **`KANSHOU_LOCATION_TAGS_`新增兩個haunts標籤**：士郎加進「商店街」(採買食材/生活雜貨，貼合他的居家屬性)，大河新增「電影院附近」(活潑外向的休閒去處)——讓§61/§67的「不在身邊英靈自動分佈去向」機制也能把他們安排到符合角色調性的地方，而不是只能落在均勻隨機的全地點池。

**設計理由**：全程沒有新增任何機制——`cls:'御主'`的白名單、召喚流程、好感/位置追蹤、留人重逢、時段自動分佈、隨機巧遇，全部是既有機制直接吃到這兩筆新資料，一行流程代碼都沒動。這正是CLAUDE.md「資料驅動優先，能查表就別寫if鏈」的體現：要新增角色＝往種子表加資料，不動引擎。

**未動的部分**：`nsfwBaseRules`常數逐字元核對未受影響(本輪未觸及Engine_Combat.gs)。「男女／女女配對、不開放男男」的規則(`actionKanshouSummonHero`)未改，士郎(男)在玩家為男性帳號時依既有規則召喚不到——這是既有規則本來就會發生的行為，沒有為這兩位另開後門。註：隨機巧遇(`kanshouRollEncounter_`)本來就不像召喚一樣做性別配對過濾(現有EMIYA/庫丘林等既有男性從者也是同樣情況)，加入士郎不會讓這個既有行為變得更不一致。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①👥同伴面板的英靈庫清單能看到「衛宮士郎」「藤村大河」兩張新卡片；②(女性帳號)嘗試召喚士郎同行成功、好感/關係正常累積；③請走後靠留人重逢或時段分佈機制能再次偶遇；④走到「商店街」/「電影院附近」時偶爾巧遇到對應角色；⑤敘事讀起來沒有把角色的個性/萌點字面直說出來(show-don't-tell)。

## §71 鑑賞開場預先放置5~6位起始英靈，不必靠隨機巧遇或手動召喚才存在（2026-07・玩家「沒有辦法開場就放置她們嗎？把女性+士郎+一些男從者一開始就放入？」→確認「5~6位(女性主力+士郎+少量男從者)」→追加反饋「美遊/伊莉雅-Caster/小黑這三個感覺先不要，美狄亞、美杜莎呢？」）

**背景**：玩家想讓新角色一開局就有幾位英靈「已經活在這個世界裡」，不必全靠隨機巧遇機率或手動逐一從英靈庫召喚才存在。討論中確認的關鍵技術點：①這只是「角色建立當下多寫幾筆資料列」，一次性批次操作，不會拖慢建角速度；②預先放置≠自動同行——她們只是有了位置(LOC)，玩家仍要去👥同伴面板主動邀請才會進到3人同行名額；③這些預先放置的英靈天然被既有的「留人重逢」機制(§56 `kanshouLeftBehindIdxs`，判斷式只看「有資料列＋不同行＋同地點」，不管是不是本來就召喚過)保底判定成重逢，不必再擲隨機巧遇——兩套機制自然並存，不用二選一。

**改動**：
1. **`actionEnterKanshou`(`Gallery.gs`)建完御主本人那一列後，新增起始英靈批次建立**：依玩家性別`mSex`挑一組不違反「不開放男男配對」的陣容——
   - 女性玩家：`阿爾托莉雅-Saber`、`遠坂凜-Master`、`伊莉雅絲菲爾-Master`、`衛宮士郎-Master`、`EMIYA-Archer`、`伊斯坎達爾-Rider`(3女3男，共6位)。
   - 男性玩家：`阿爾托莉雅-Saber`、`遠坂凜-Master`、`伊莉雅絲菲爾-Master`、`美狄亞-Caster`、`美杜莎-Rider`(5位主線知名女性從者)——玩家反映原本擬的`美遊-Saber`/`伊莉雅-Caster`/`小黑-Archer`是較冷門的Illya外傳角色，改用美狄亞/美杜莎這兩位更主線的角色。
2. **地點指派複用`kanshouRollDailyLocation_(heroName)`**(§61/§67既有函式，不傳hour走原本haunts加權邏輯)，不另外設計一套起始地點分配。
3. **`IS_PARTY`寫入後手動清空**：`heroToKanshouRow_`本身固定把新建列的`IS_PARTY`設成`"同行"`(它原本是設計給「立即同行」的召喚流程用)，這裡在拿到row後手動覆寫回空字串，讓她只是「存在於世界」而非「已經同行」——複用既有函式產生完整的persona/好感/裝扮等欄位，只調整這一個標記，不重寫一份平行的建列邏輯。
4. **整批一次`getRange().setValues()`寫入**(單一Sheets API呼叫)，不在迴圈裡逐列`appendRow`，維持「整表批次寫入」的效能鐵律——不會因為多寫5~6筆資料就拖慢建角速度。

**設計理由**：玩家點出的關鍵——「如果在場上就不用再召喚了吧？邀請同伴入席」——這點`actionKanshouSummonHero`本來就已經處理好了：召喚時會先查「此局是否已有這位英靈的列」(`existingIdx`)，有就直接把既有列的`IS_PARTY`改回`同行`並同步位置(訊息文案還會自動改成「回到了你們身邊」而非「來到了你們身邊」)，沒有才真的新建一列。所以預先放置的英靈跟「之前召喚過、後來被請走」的英靈走的是【完全同一條路徑】——玩家面板上看到的仍然是同一顆「召喚」鈕，不需要為「已存在但未同行」的英靈另外設計一種「邀請」按鈕或流程。

**未動的部分**：`nsfwBaseRules`常數逐字元核對未受影響。`actionKanshouSummonHero`召喚/請走流程、留人重逢、隨機巧遇、時段自動分佈全部未改一行——這次純粹是「在角色建立當下，提前呼叫這些既有機制會用到的同一份資料建列邏輯」，沒有新增任何機制。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0；`nsfwBaseRules`逐字元核對 identical。部署後建議測試：①新建女性帳號，確認👥同伴面板一開局就能看到6位「已存在」的英靈(不用先召喚，位置各自分散)；②新建男性帳號，確認看到5位女性從者(含美狄亞/美杜莎)、士郎/EMIYA/伊斯坎達爾看不到(男男限制)；③走到某位起始英靈當下所在的地點，確認觸發的是「重逢」而非「巧遇」(100%命中，不是機率)；④對其中一位按「召喚」，確認文案顯示「回到了你們身邊」(代表吃到既有列、不是重建)且好感非0(承接預設值)；⑤確認建角速度沒有明顯變慢(單次批次寫入)。

## §72 鑑賞「快轉到節慶」搬進＋抽屜，不再常駐佔地圖頁版面（2026-07・玩家看到§68/69部署後的實際畫面反映「這個可以放在＋裡面，不常用，不要擺出來看...然後排版怪怪的?!」）

**背景**：§68實作時把6顆節慶按鈕直接鋪在地圖頁「出門走走」區塊裡，玩家實際看到畫面後覺得這塊不常用、佔用太多版面，導致下面的分區分頁(家/深山町/冬木市中心/港口碼頭區/山林道場區)因版面被往下擠、5個分區塞進flex-wrap排版擠出跑版的觀感。

**改動**：
1. **`Script.html`的`renderMapPane`移除「🎊快轉到節慶」整塊**，地圖頁只剩原本的：巧遇開關／看看四周／⏩推進時間(2h/6h/12h)／🌙結束一天／地點清單，版面回到§67之前的密度。
2. **`Index.html`的`#action-drawer`新增`drawer-festival`按鈕**(比照既有`drawer-companions`同款寫法：預設`display:none`，只在鑑賞模式顯示)。
3. **`Script.html`的`applyModeUI()`比照`drawer-companions`同款邏輯，新增`drawer-festival`的顯示切換**(`isKanshou ? '' : 'none'`)。
4. **`Script_Kanshou.html`新增`openKanshouFestivals()`/`closeKanshouFestivals()`**：比照既有`kc-overlay`(同伴面板)「專屬彈窗、不與其他功能共用」的寫法，動態建立`#kc-festival-overlay`，內容就是原本那6顆節慶按鈕(呼叫既有`kanshouJumpFestival`，邏輯完全沒動)，用完即關、不佔地圖頁版面；比照`openCompanions()`同款，開啟時若＋抽屜還開著會自動收合。

**設計理由**：「不常用的功能收進＋抽屜、常用的留在地圖頁」正是這個專案既有的資訊架構原則(同伴面板也是這樣做的)——這次只是把節慶功能歸類到正確的位置，複用已經驗證過的`kc-overlay`彈窗模式，沒有發明新的UI元件或互動邏輯。

**未動的部分**：`nsfwBaseRules`常數逐字元核對未受影響(本輪未觸及Engine_Combat.gs/Gallery.gs)。`kanshouJumpFestival`/`KC_FESTIVALS_`/後端`kanshouHoursUntilDate_`等節慶功能本體邏輯一行未改，純粹是入口位置搬家。

**驗證**：`bash check.sh`全過。部署後建議測試：①地圖頁不再顯示節慶按鈕，5個分區分頁排版恢復正常(不再因為版面被擠而跑版)；②點＋開啟抽屜，能看到新的「🎊快轉節慶」項目(僅鑑賞模式顯示，solo模式不出現)；③點擊後彈出節慶選擇彈窗、抽屜自動收合；④點任一節慶按鈕仍能正常觸發時間快轉(行為與§68一致)；⑤點「關閉」或彈窗外側能正常關閉彈窗。

## §73 API金鑰指令碼屬性只認`OPENROUTER_API_KEY`，砍除舊相容別名（2026-07・玩家「我們先把專案設定API_KEY名稱改成OPENROUTER_API_KEY」→「只要保留OPENROUTER_API_KEY這個就好，其他的我確定不需要了，可以砍」）

**背景**：`Core_Settings.gs`原本的`API_KEY`常數(JS內部變數名，跟真正配置的指令碼屬性名稱是兩件事)為了相容舊版設定，會依序嘗試4種指令碼屬性名稱(`API_KEY`/`OPENROUTER_API_KEY`/`OPENROUTER_KEY`/`OPENROUTER`)，但實際FATE Script真正配置的屬性名稱只有`OPENROUTER_API_KEY`一種。玩家確認不需要再相容其餘3種舊別名，直接砍掉。

**改動**：
1. **`Core_Settings.gs`**：JS常數名稱從`API_KEY`改成`OPENROUTER_API_KEY`(跟指令碼屬性名稱一致，減少「同名不同義」的混淆)，屬性查詢從4個候選名稱簡化成只認`OPENROUTER_API_KEY`一個。
2. **`Engine_Combat.gs`**：`callGeminiAPI`裡兩處使用點(`if (!API_KEY)`判斷、`"Bearer " + API_KEY`組headers)同步改名成`OPENROUTER_API_KEY`；未設定時的錯誤訊息文字也同步更新成「未設定 OPENROUTER_API_KEY」。
3. **`server.ts`(AI Studio本地模擬層)同步簡化**：`PropertiesService.getScriptProperties().getProperty`原本對4個舊別名都特判轉發到`process.env.OPENROUTER_API_KEY`，現在只保留`OPENROUTER_API_KEY`這一個特判，跟`.gs`代碼實際會查詢的屬性名稱完全對齊——這正是玩家先前關心的「兩邊要維持行為一致」的具體實踐：`.gs`改了，模擬層也要跟著改，不能只改一邊。

**設計理由**：「常數名稱＝實際配置的屬性名稱」這件事本身就是消除混淆的重要一步——改之前光是JS變數`API_KEY`跟同名的舊指令碼屬性`'API_KEY'`容易讓人誤以為兩者永遠等價，但實際上專案真正在用的是`OPENROUTER_API_KEY`這個屬性。玩家確認沒有任何舊部署還依賴那3個別名，直接砍掉降低維護面，不留「可能有人在用、不敢刪」的臆測性相容代碼。

**未動的部分**：`nsfwBaseRules`常數逐字元核對未受影響(Engine_Combat.gs的改動只在`callGeminiAPI`頂部/headers兩處變數名，不觸及`nsfwBaseRules`本體)。`MODEL`/`SOLO_MODEL`/`UNLOCKED_MODEL`這三個指令碼屬性維持原樣(各自本來就只認一個名稱，沒有相容別名問題)。

**驗證**：`bash check.sh`全過；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0；`nsfwBaseRules`逐字元核對 identical；`node --experimental-strip-types --check server.ts`語法檢查通過；全專案`grep`確認沒有殘留任何`API_KEY`舊變數名引用。部署前記得確認GAS專案的「指令碼屬性」畫面裡`OPENROUTER_API_KEY`這個名稱本身有正確設定好金鑰值(其餘`MODEL`/`SOLO_MODEL`/`UNLOCKED_MODEL`為選填，沒設定會退回程式碼內建的預設模型)。

## §74 移除AI Studio本地模擬層(server.ts/package.json/tsconfig.json/.gitignore)，專注GAS正式版（2026-07・玩家討論完AI Studio的定位、資料持久性、Firestore級改動的成本後，決定「我不需要過去，專注在GAS就好」）

**背景**：這幾天玩家一度嘗試過在Google AI Studio用Node.js模擬層(§53附近開始的一系列討論：`server.ts`用`vm`模組跑一份`.gs`合併代碼、`db.json`模擬試算表)快速預覽/開發FATE，過程中討論了不少技術細節(§甚至抓到並修過`getSheetByName`永遠回傳真值的bug、worker thread併發修復)。最終玩家釐清了幾個關鍵事實——①AI Studio的容器是暫時性的，`db.json`不保證持久；②真要做到「多人上線＋永久存檔」得接Firestore/Cloud SQL等級的改動，那是要重寫全部讀寫成非同步、且要永遠維護兩套存檔邏輯的大工程；③現有GAS正式版本身就已經是「不特定時間都能玩、資料永久存在試算表」的解法——衡量之後，決定不需要AI Studio這條路，專注維護GAS這一個版本就好。

**改動**：直接砍除4個檔案——`server.ts`(本地GAS模擬伺服器)、`package.json`(Node相依套件設定)、`tsconfig.json`(TypeScript編譯設定)、`.gitignore`(原本只為了排除`node_modules`/`db.json`/`dist`這些Node產物，Node工具鏈整組拿掉後這份檔案也一併沒有存在必要)。`gas/`目錄下所有遊戲邏輯完全未動——這幾個檔案原本就是外掛在專案根目錄、跟`.gs`代碼互不相依的獨立工具，砍除不影響任何既有功能。

**設計理由**：這幾個檔案的存在本來就是「單一入口」設計(server.ts直接讀取`gas/`底下的原生檔案執行，不複製一份改寫)，所以移除它們是乾淨的——沒有任何邏輯散落在這些檔案裡需要先搬回`gas/`才能刪，直接刪就好，不留殭屍代碼。

**未動的部分**：`gas/`目錄下19個`.gs`檔案、5個`.html`檔案完全未受影響；`OPENROUTER_API_KEY`等指令碼屬性命名(§73)維持不變，那是GAS本身的設定，跟這次移除的Node工具鏈無關。

**驗證**：`bash check.sh`全過(不涉及這幾個被刪檔案，本來就不在檢查範圍內)。部署後無需特別測試——這是純粹的檔案清理，`gas/`裡的實際遊戲邏輯一行都沒變。

## §75 補齊send()忙碌鎖到全部入口（2026-07・玩家「除錯模式」死磕AI Studio夥伴的「絕對無存檔衝突」自陳，逐行讀`actionPlay`/`Script.html`發現真實漏洞後，玩家追加「忙碌鎖補齊到全部send()入口！」）

**背景**：稽核`Gallery.gs`的`actionPlay`發現一段既有註解——「🔒 競態修：play 呼叫豁免寫入鎖(AI 呼叫佔數秒會卡全域)」，代表這個函式本來就刻意不上`LockService`全域鎖(否則AI那幾秒會卡死其他所有玩家)，只用「寫回前重查即時列索引」防止寫到已被刪除的列，這防的是「列被刪」，不是防「同一玩家連續兩次請求互相覆蓋」。往前端`Script.html`的`send()`一查，唯一的忙碌檢查`if (!customMsg && btn.disabled) return;`只在「無customMsg(純打字對話)」這條路徑生效——`Script_Kanshou.html`裡「走向○○」/「看看四周」/「結束一天」/「推進時間」/「快轉節慶」/「邀約同伴」等按鈕全部帶customMsg呼叫`send()`，一律跳過這個檢查，且過程中沒有任何全螢幕遮罩擋點擊(只在story插一行「聖杯演算中…」文字)。玩家手快連點兩個不同地圖按鈕(如按了「結束一天」又立刻點「走向咖啡廳」)，會真的並發送出兩個`actionPlay`請求，兩者都在對方寫回前各自讀了`pcData`，後寫回的會把先寫回的整段好感/肉體狀態改動蓋掉——這是可重現的lost-update，不是理論風險。

**改動**：`Script.html`的`send()`裡，`if (!customMsg && btn.disabled) return;`改成`if (btn.disabled) return;`(單行條件修正)。`btn.disabled`本來就是`send()`唯一、可靠的「上一輪是否還在跑」訊號——函式開頭`btn.disabled = true`，`finally`區塊`btn.disabled = false`(L2836-2837)，不論成功/失敗都會重置，涵蓋所有既有呼叫路徑。改成不分是否帶customMsg都檢查這個旗標，等於讓地圖/節慶/結束一天/推進時間/邀約等7個入口，統一跟純打字對話共用同一道防連點閘門。

**設計理由**：根源修法，不是貼OK繃——不新增任何忙碌狀態變數、不改`actionPlay`後端邏輯(GAS豁免全域鎖的設計本身合理，代價是前端要自己把關並發)，只把既有的、本就正確的訊號(`btn.disabled`)套用到所有入口，一行條件改動涵蓋全部7個按鈕，不必逐一按鈕加`disabled`判斷。驗證過所有既有`send()`呼叫點(含`justRevived`的1.5秒後自動接續、選項按鈕`onclick="send(...)"`)都是在前一輪`finally`重置`btn.disabled=false`之後才會被觸發，不會被這次改動誤擋。

**未動的部分**：`gas/*.gs`完全未觸及，純前端`Script.html`一處條件修正；`nsfwBaseRules`不受影響(這次改動離`Engine_Combat.gs`/`Gallery.gs`都很遠)。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①正常對話/移動/結束一天/推進時間各自單獨操作仍正常送出且能再次操作；②刻意手快連點兩個不同按鈕(如剛按完地點又馬上點推進時間)，第二次點擊應該被忽略(按鈕仍是`disabled`狀態)、不會發出第二個請求，等第一輪回應完成、按鈕解鎖後再點才會生效。

## §76 鑑賞經濟層 Phase 1：金錢/打工/房租（2026-07・玩家推翻2026-06「經濟全砍」決定「真的要賺錢 然後要付住宿費用?每個禮拜要付錢?我要去打工賺錢?!」→AskUserQuestion確認「真的要有系統記錄的經濟機制」＋「僅鑑賞(kanshou)」）

**背景**：CLAUDE.md 2026-06明文決定「經濟/生活層全砍」，money/shop/quest/job等一律AI即興、不寫試算表。玩家本次明確要求推翻——不是要AI敘事層面的即興演出(那本來就已支援)，是要「真的會被扣款/賺取、系統記錄」的機制，且明確限定僅套用在kanshou，不影響solo(CLAUDE.md「solo全程無花錢入口」維持不變)。CLAUDE.md本節已同步更新記錄此推翻，避免下次失憶session誤判成違反舊紅線。

**Phase 1改動範圍**：金錢核心迴圈——起始金錢／打工賺錢／每週房租，其餘(開店/購物/裝飾/好感禮物/家事整潔度/任務系統)留待後續Phase。

**Schema**：`Core_Settings.gs` `COL.PC`尾端新增`MONEY:33, RENT_WEEK:34`(附加尾端不動既有欄位位置，COL是位置索引)。solo(PC_)角色這兩欄恆空，只有kanshou(KPC_)御主自己這一列讀寫。

**新常數**(`Gallery.gs`，緊接在`kanshouHoursUntilDate_`後)：`KANSHOU_START_MONEY_=3000`(開局起始金錢)、`KANSHOU_WAGE_=800`(打工一次固定薪資)、`KANSHOU_WORK_HOURS_=4`(打工一次消耗時數)、`KANSHOU_RENT_=1500`(每週房租)。全部固定金額、GAS掌數值(DESIGN.md「GAS掌數值、AI只說書」鐵律)，不靠AI亂喊數字。

**`kanshouChargeRent_(pcData, pcIndex, newDay)`**(`Gallery.gs`)：依絕對天數換算週數(`Math.floor((day-1)/7)`)，跨過新一週才扣款(比對`RENT_WEEK`)，一次可補扣欠的多週(節慶快轉等大跳躍場景不會漏繳也不會逐週迭代)，允許餘額為負(欠繳，軟性設計、無驅逐等懲罰機制)。`actionEnterKanshou`初始化`mRow[COL.PC.MONEY]=KANSHOU_START_MONEY_, mRow[COL.PC.RENT_WEEK]=0`。

**`actionPlay`整合**：房租結算呼叫點插在「結束一天」與「推進時間」兩分支各自算完`curDay`之後(兩分支都會推進日期，故都要檢查)，回傳值存進`rentCharged`供prompt組flavor文字用。💼打工是新的`userData.work===true`旗標，複用「推進時間」既有的`advanceHours`/`rollHours_`/離隊英靈重骰去向機制(視為固定`KANSHOU_WORK_HOURS_`小時的一次時間推進，不另開時鐘平行路徑)，額外執行「發薪水」(`MONEY += KANSHOU_WAGE_`)。`work`與`advanceHours`/`jumpFestival`互斥(打工優先判斷)。

**prompt新增**：房租扣款時注入`★【房租自動扣款·氛圍提示】`(含扣款金額/目前餘額，容許AI帶出手頭吃緊但不寫成嚴重危機)，跟既有`jumpFest`/`kanshouEventSeed`同款「只在相關時刻才注入、非always-on」寫法。打工的敘事走`finalUserMsg`(比照結束一天/推進時間的系統合成訊息模式，AI自由發揮打工場景，只有薪資數字是GAS算好的既定事實)。

**§-string顯示**：`buildPlayerStatusString`(`Core_Settings.gs`)借用位置24(原「恆空字串佔位」、前端從未讀取)塞kanshou金錢餘額，比照位置0(肉體外顯)「solo恆空/kanshou才填值」的既有模式，不新增欄位、不位移任何既有索引。前端`updateUI`(`Script.html`)新增讀取`s[24]`，顯示在`Index.html`新增的`#header-money`徽章(掛在`#topbar-kanshou`內，本來就只在鑑賞模式可見，不需額外顯示切換邏輯)。

**打工按鈕**：`Index.html`新增`#drawer-job`抽屜項目(比照`#drawer-festival`同款寫法，`applyModeUI`裡加一行`isKanshou`切換)，`Script_Kanshou.html`新增`kanshouWork()`呼叫`send(..., work=true)`(`send()`簽名新增第9個參數`work`，`gasRun`payload新增`work: work || undefined`)。

**未動的部分**：`nsfwBaseRules`不受影響；solo(`PC_`)角色的`MONEY`/`RENT_WEEK`兩欄恆空、`actionPlay`入口本就擋掉非`KPC_`呼叫，solo完全無感這次改動；Phase 2起(商店/購物/裝飾/好感禮物/家事整潔度/任務系統)尚未實作。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①新開局鑑賞角色，頂列應顯示「💰3000」；②點＋抽屜「💼去打工」，餘額應變成3800、時鐘跳4小時；③連續推進時間跨過7天(或連點結束一天7次)，應在跨過第8天時自動扣1500房租，narration帶出房租相關flavor；④刻意讓餘額變負(狂花/多次房租)，確認不會有任何崩潰或封鎖機制，只是數字變負。

## §77 鑑賞經濟層 Phase 2：商店（裝飾品/好感禮物）（2026-07・玩家「這些都想要呢！」——延續§76經濟層，追加開店購物/家居裝飾/特殊好感物品）

**背景**：§76上線後玩家對Phase 2起的項目(開店/購物/裝飾/好感禮物/家事整潔度/任務系統)全部表態「都想要」。本次先做「商店」——購買裝飾品(佈置家)＋購買禮物(送同行夥伴增加好感)，兩者共用同一張品項表，資料驅動(範本比照`KANSHOU_LOCATIONS_`/`KANSHOU_FESTIVALS_`，加東西＝加一列，不動流程)。家事整潔度／任務系統留待後續Phase。

**`KANSHOU_SHOP_ITEMS_`**(`Gallery.gs`)：`{id, name, price, type:'decor'|'gift', bond(僅gift), desc}`共10項(5裝飾+5禮物)。價格/好感值皆固定，GAS掌數值、不靠AI喊價/喊好感漲多少。前端`Script_Kanshou.html`維護一份鏡像`KC_SHOP_ITEMS_`供UI渲染(純顯示用，實際扣款/效果仍由後端`Gallery.gs`那份驗證，前端資料不可信)。

**裝飾品**：買了呼叫`kanshouAddDecor_`寫進玩家MEMORY【家居裝飾】清單(借用`Core_Settings.gs`的`makeTextTag_`文字型工廠、外面包一層拆分/去重/重組，因為要塞「清單」而非工廠原生的單一值)。這份清單餵進主提示詞的【玩家命格】行(`myDecor`變數)，供AI在「家」相關場景自然帶入(show-don't-tell，非強制每次提及)。

**好感禮物**：買了直接讓GAS決定好感增量(`shopItem.bond`固定值)寫進目標BOND欄，不透過AI的`rel_changes`(那是AI敘事推進才會生效的路徑，禮物是玩家主動的系統性動作，數值該由GAS直接算)。送禮對象限「目前同行隊伍成員」(比對`IS_PARTY==='同行'`，跟【在場驗證鐵律】一致，不能隔空送禮給不在身邊的人)。**未做**：禮物沒有寫進REL_MEM持久標記(如「曾送過項鍊」)——因為`actionPlay`後段`intimacy_feedback.npcs`處理會對該NPC的REL_MEM做`nickPart+attPart`整段覆寫(專屬稱呼/態度)，若同一回合疊加禮物標記會立刻被那段覆寫沖掉，要安全疊加需要把這個新標記也一併塞進那個組裝點——Phase 2 MVP先不動那段已在跑的邏輯，只做「好感值真的漲」這個核心效果，禮物的敘事延續性完全交給`finalUserMsg`這一回合的flavor文字，之後若要做「AI記得你送過什麼禮物」可再議。

**`actionPlay`整合**：新增`userData.buyItem`(品項id)/`userData.giftTarget`(送禮對象名，僅gift類型需要)。驗證失敗(品項不存在/金額不足/送禮對象不在場)直接`return`、不進AI呼叫(GAS已能確定答案、不浪費一次生成)；驗證通過才組`finalUserMsg`走完整敘事管線(比照打工/結束一天，複用既有pipeline)。插入點在`sameGame`定義後、「結束一天」分支前，購物跟結束一天/推進時間/打工互斥(前端只會送一種旗標)。

**前端**：`Script_Kanshou.html`新增`openKanshouShop()`/`closeKanshouShop()`/`kanshouBuyDecor(itemId)`/`kanshouGiveGift(itemId,targetName)`，禮物區塊會先打`kanshou_companions`刷新`_kcCur`(比照`openCompanions`同款寫法)確保送禮對象清單即時。`Index.html`新增`#drawer-shop`抽屜項目(比照`#drawer-job`同款)，`Script.html`的`send()`簽名新增第10/11參數`buyItem`/`giftTarget`。

**未動的部分**：`nsfwBaseRules`不受影響；solo不受影響(`buyItem`/`giftTarget`只在`actionPlay`的KPC_專屬入口內處理)；家事整潔度／任務系統(Phase 3+)尚未實作。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①身上錢不夠時點購買，應該直接顯示「還差X円」不觸發AI生成；②裝飾品買成功後，再去「家」的地點對話，narration有機會自然提到新擺設；③有同行夥伴時送禮，好感數字應該立即增加(可從👤詳細狀態或👥同伴面板確認)；④沒有同行夥伴時開商店，禮物區塊應顯示「沒有同行夥伴，無法送禮」而非報錯。

## §78 夜晚三件套：好感80同床共枕門檻／睡前機率敲門／宵禁提醒（2026-07・玩家一連串構想「好感度我想要gas去算」「不可能吧AP系統搬過來用吧」「晚上10點強制回家(也可以在外面過夜)」「想要有人晚上來敲門(更多同行邀請彈窗那種)」→逐項討論後定案）

**背景**：這輪討論涵蓋好幾個構想，逐一釐清後拆成「現在就做」跟「先不做」兩類：
- **AP系統**：判斷不需要搬過來——solo的AP本質上跟鑑賞既有的DAY/HOUR時鐘是同一件事的兩種做法，鑑賞繼續用現有時鐘機制就夠，不必另外教玩家一個新資源條。
- **好感度改GAS算**：確認solo的`Router_Bond.gs` `actionBond`早有現成範本(純按鈕、GAS固定+10好感、每遊戲日限一次、好感跨過30/60/90觸發里程碑劇情)——這個範本留待下一輪做「一天一次相處/送禮按鈕」時直接複製，這次先做玩家在對話中追問出的另一條線："好感沒到80能不能同行睡覺"、"點睡覺按鈕有機率敲門"、"晚上10點回家"這三個扣在「結束一天/推進時間」上的具體機制。

**①好感≥80同床共枕門檻**(`intimateNightNames`)：結束一天時，只判定「真的要過夜」這個動作(推進時間/打工不觸發，那些不是睡下去)。同行同伴中BOND≥80者，名字餵進提示詞★【入夜氛圍·好感門檻已達】，允許AI依角色性格自然決定要不要跨出同床共枕這一步、演到多深，未達門檻者維持各自安睡不越界——比照既有羈絆里程碑(30/60/90)同款「GAS掌門檻、AI只說書」精神。

**②睡前機率敲門**(`KANSHOU_KNOCK_CHANCE_=0.2`)：結束一天前先擲一次骰(候選池=此局已建立資料列、目前不同行的舊識，跟留人重逢同一種「有名有姓的熟人」精神，不會憑空生出陌生人)。命中就不執行日期推進，直接回傳`knockEvent:<名字>`，前端跳出「開門/不予理會」(比照`moveProposal`同款「GAS/機率觸發而非AI敘事判斷，前端渲染選擇」寫法，新增`kanshouAnswerKnock`/`kanshouIgnoreKnock`)。「開門」帶`knockAccept`把訪客接到玩家現在的位置(本回合可指名互動的例外，`kanshouKnockGuestStr`比照`kanshouReunionStr`同款寫法)，**不推進日期**——訪客只是這回合出現，玩家想睡再自己重新點一次「結束一天」（會再擲一次骰，不特別排除連續巧遇）。「不予理會」帶`skipKnockCheck`重送一次結束一天，跳過這次判定直接推進日期。

**③宵禁提醒**(`kanshouCurfewDismissed_`/`kanshouDismissCurfew_`)：不是真的強制——時鐘落在22:00~06:00區間、人又不在家(region≠'home')時，回應夾`curfewPrompt:true`，前端跳出「回家/留在外面過夜」(新增`kanshouGoHomeCurfew`/`kanshouStayOutCurfew`)。「回家」重用既有moveTarget管線走回「臥室」(跟結束一天強制回家同一個房間)；「留在外面過夜」寫入MEMORY【宵禁已知會】<day>標記，當天不再重複跳提醒(跨日靠`curDay`變動自然失效，不必額外清除)。這個判定用「最終位置」(`curL`，已含moveTarget/AI決定的location更新)，故只要那次呼叫最後人不在家就會提醒，不管是聊天中被AI帶去別處、還是推進時間跨進宵禁時段。

**設計理由**：三個機制都刻意扣在「結束一天/推進時間」這兩個既有的時鐘推進分支上，不新增獨立round-trip；都是GAS先決定觸發與否(門檻/機率/時段)、AI只負責依角色性格演繹細節或完全不參與(宵禁提醒、敲門觸發本身連AI都不呼叫，純GAS文字)——一致遵守DESIGN.md「GAS掌數值、AI只說書」鐵律，也呼應這次對話「好感度想要GAS去算」的核心訴求。

**未動的部分**：`nsfwBaseRules`不受影響(改動全在`actionPlay`裡結束一天/推進時間分支週邊，未觸及`buildDefaultSystemPrompt`本體)；solo不受影響(`actionPlay`入口本就擋掉非KPC_呼叫)；「一天一次相處/送禮按鈕」(複製solo `actionBond`範本這件事)、家事整潔度、任務系統仍留待後續。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①好感≥80的同行同伴結束一天時，narration有機會演出更親密的過夜橋段，好感未達門檻的同伴維持各自安睡；②多次點「結束一天」，應該有一定機率跳出敲門彈窗，選「開門」後訪客出現在同地點但日期沒推進，選「不予理會」則直接推進到隔天；③推進時間跨過22:00或深夜時段且人不在家，應跳出回家/留在外面過夜提醒，選「留在外面過夜」後同一天內不再重複跳出。

## §79 修正「不同行英靈推進一天時會溜進玩家自己家」的錯誤，改給每位英靈自己的住處（2026-07・玩家「那些人會回家？都回衛宮家？應該要給其他人地點吧？」→選「大修：給每位英靈自己的家/住處資料」）

**背景**：`kanshouRollDailyLocation_`(結束一天/推進時間幫「不在身邊」的英靈決定去向)原本深夜(85%)/清晨(50%)時段的homeBias，直接回傳`KANSHOU_LOCATIONS_`裡`region==='home'`的房間(客廳/廚房/臥室/浴室/陽台)——但那5個房間是**玩家自己的家**，不同行(沒有跟玩家住在一起)的英靈不該憑機率溜進玩家的臥室。玩家發現這個問題後，選擇不做小修(單純不再送回玩家家、退回原本haunts池)，而是選擇大修：讓每位英靈都有自己的住處資料。

**`KANSHOU_HERO_HOME_`**(`Gallery.gs`，緊接在`KANSHOU_ENCOUNTER_FEMALE_IDS_`後)：資料驅動對照表(比照`KANSHOU_LOCATION_TAGS_`同款「id對應值」寫法)，25位種子英靈(`Seed_Codex.gs`全部`SEED_SERVANTS`)各自一個貼合設定的住處字串(如`遠坂凜-Master`→`遠坂邸`、`衛宮士郎-Master`→`衛宮邸`、`小黑-Archer`/`伊莉雅-Caster`/`伊莉雅絲菲爾-Master`同為愛因茲貝倫陣營→`愛因茲貝倫城`)。這些字串**刻意不放進`KANSHOU_LOCATIONS_`**(驗證過25個住處字串與22個玩家可造訪地點完全無重複)——玩家在地圖上看不到、去不了，純粹讓「深夜在家」的人不會被玩家意外撞見，直到她下次被重骰到玩家可造訪的地點才會再度可能巧遇/重逢。玩家原創英靈(無種子資料)退回通用值`自己的住處`。

**`kanshouRollDailyLocation_`改動**：`hero`(依realName查`SEED_SERVANTS`)的查找從原本homeBias分支之後提前到函式最前面(兩個分支都要用)；homeBias命中時回傳`KANSHOU_HERO_HOME_[hero.id]`而非玩家家的房間清單。函式簽名/呼叫端完全不變，改動範圍僅函式內部邏輯。

**設計理由**：資料驅動(加一位英靈＝加一筆對照，不動抽選邏輯)；沒有新增任何試算表欄位(純JS常數物件，跟`KANSHOU_LOCATION_TAGS_`同一層級)；根源修正而非特判繞過(直接讓「深夜在家」這件事回傳正確語意的地點，而不是保留舊行為再加例外判斷擋掉玩家家)。

**未動的部分**：`nsfwBaseRules`不受影響；`KANSHOU_LOCATIONS_`(玩家可造訪地點清單)、`KANSHOU_LOCATION_TAGS_`(白天巧遇地點標籤)完全未變；solo不受影響。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0；程式化核對25個住處字串與22個KANSHOU_LOCATIONS_地點名稱零重複。部署後建議測試：讓一位非同行英靈經歷結束一天/推進時間跨過深夜時段，確認她的LOC不再變成客廳/廚房/臥室/浴室/陽台這幾個玩家自己家的房間名稱。

## §80 22個英靈住處升格成可造訪地點（2026-07・§79上線後玩家「地圖不同步上更新嗎 我也想要晚上去找他們阿www」）

**背景**：§79把每位英靈的「深夜在家」去向從玩家自己家改成各自獨立的住處字串，但當時刻意不登記進`KANSHOU_LOCATIONS_`(玩家可造訪地點清單)，純粹當成「不會被意外撞見」的內部標記。玩家看完效果後反過來想要主動去拜訪——這次把這22個住處字串登記成真正的地點。

**改動**：`KANSHOU_LOCATIONS_`(`Gallery.gs`)新增`region:'visit'`分區，把`KANSHOU_HERO_HOME_`裡22個不重複的住處字串逐一加成地點條目(`noEncounter:true`，私人住處恆不觸發陌生人巧遇，比照「家」分區5個房間同款旗標)，並手寫貼合各角色設定的一句描述(如「終年白雪覆蓋的愛因茲貝倫城堡」)。`KANSHOU_REGIONS_`新增對應分區`{id:'visit', name:'拜訪住處'}`。前端`Script_Kanshou.html`的`KC_REGIONS_`/`KC_LOCATIONS_`鏡像同步更新。程式化核對過這22個地點名稱與`KANSHOU_HERO_HOME_`的值逐字一致(否則深夜骰到的地點跟這裡登記的對不上，會巧遇不到人)。

**設計理由**：完全重用既有`moveTarget`比對／留人重逢(`kanshouLeftBehindIdxs`)機制——玩家主動走去某人的住處，跟深夜她被骰到那裡，是同一套「LOC比對」邏輯，不需要新增任何比對/驗證程式碼；地圖分區UI(`kcMapListHtml_`/`KC_REGIONS_`.map)本來就是資料驅動迴圈，加一個分區純粹是加資料，不動渲染邏輯。玩家原創英靈(無種子資料)的通用值「自己的住處」維持不登記進地點清單——多人共用同一個泛用字串會讓「拜訪」對象混淆是哪一位，故維持不可造訪，僅原本§79的「不會撞見玩家自己家」效果保留。

**未動的部分**：`nsfwBaseRules`不受影響；`kanshouRollDailyLocation_`函式邏輯不變(§79已改完，這次只是把它回傳的字串登記成合法地點)；solo不受影響。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0；程式化核對22個住處地點名稱與`KANSHOU_HERO_HOME_`值零缺漏。部署後建議測試：①地圖新增「拜訪住處」分區，能看到22個地點；②某位非同行英靈深夜被分配到她自己的住處後，玩家主動走去那個地點應該能觸發重逢；③這些地點不會觸發陌生人巧遇。

## §81 晨間餘韻：好感80同床共枕後，隔天第一回合自動帶入早晨氛圍引子（2026-07・玩家「我想要住在衛宮家 然後如果晚上有色色...隔天早上吃飯劇情就很好看這樣的感覺~~因為沒有這些條件很難演出這種感覺」）

**背景**：§78已經做出「好感≥80結束一天可同床共枕」的門檻，但只有那一次結束一天的提示詞看得到這個氛圍cue——玩家點開下一回合(不論聊天/移動/購物)時，AI只能靠聊天記錄(`getGameHistoryBatchRaw`最近6筆)自己推敲昨晚發生過什麼，沒有明確的「這是隔天早晨」引子，玩家反映這樣很難演出他想要的「隔夜親密→隔天早餐溫馨」連戲效果。

**`KANSHOU_MORNING_AFTER_TAG_`**(`Gallery.gs`，緊接在`kanshouAddDecor_`後)：借用`Core_Settings.gs`的`makeTextTag_`文字型工廠(跟`KANSHOU_DECOR_TAG_`同款)，存在玩家MEMORY【晨間餘韻】標記。運作方式是「一次性旗標」：結束一天時若`intimateNightNames.length>0`(有好感≥80的同行同伴)，順手記下這次共度良宵的對象名字；**下一回合**(不論玩家做什麼動作)一開始就讀一次、立刻清空——只讓緊接著的那一回合吃到這個提示詞引子，不會每天糾纏或提醒好幾次。

**提示詞措辭**：刻意不斷言「昨晚一定發生了什麼」，而是寫「或許共度了親密的時光(依上一回合實際演出的內容為準，若上次並未真的跨出那一步就當作平常的早晨)」——把最終判斷權交還給AI依聊天記錄裡上一回合實際寫了什麼去決定，避免跟「角色一致性鐵律」「不強制每次都寫到底」的既有設計打架(有些角色即使好感夠也未必真的跨出那一步)。

**設計理由**：讀取點放在函式最前面(`myDecor`旁)，寫入點放在結束一天分支裡`intimateNightNames`算完之後——同一次函式呼叫裡「讀上一輪留下的」跟「為下一輪寫新的」不會互相干擾(讀的是呼叫前就存在的舊值，寫的是這次結算完才落地的新值)。沒有新增任何新的userData旗標或前端UI，純粹是提示詞層面多一句引子。

**未動的部分**：`nsfwBaseRules`不受影響；不影響§78/§79/§80既有的夜晚機制邏輯，純粹疊加一句銜接性提示詞。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①好感≥80同伴結束一天演出同床共枕後，緊接著隨便做什麼動作(打字/移動/買東西皆可)，narration應該有機會自然帶出早晨的溫馨/曖昧餘韻；②再下一回合(第三個動作)應該不會再出現這個引子，確認一次性旗標正確清除。

## §82 衛宮宅定案：拿掉衛宮士郎、家擴充成房間制、同住人有自己的房間（2026-07・玩家「拿掉衛宮士郎吧...禁止召喚」+「把我家直接鎖定成衛宮宅...saber櫻rider要自己的房間」）

**背景**：玩家釐清了鑑賞世界觀的核心設定——玩家本人就是衛宮士郎的位置(住在衛宮宅)，不需要他再當一個可召喚的戀愛選項；阿爾托莉雅/間桐櫻/美杜莎(Rider)則是「已經住在這個家」的同住人，該有自己的房間，而不是像§79/§80那樣被當成「外部有自己住處」的一般英靈。

**①禁召衛宮士郎**：`actionKanshouSummonHero`加一道明確擋(`heroId === '衛宮士郎-Master'`直接回絕)；前端`kcRecomputeAvailable_`同步濾掉他，不讓他出現在召喚清單裡；`KANSHOU_ENCOUNTER_MALE_IDS_`／`KANSHOU_LOCATION_TAGS_['商店街']`／女性玩家起始陣容(`actionEnterKanshou`)都拿掉他。`Seed_Codex.gs`的種子資料本體不刪(COL是位置索引，棄用不刪欄同一精神延伸到JS陣列——沒有實際壞處，刪除風險大於保留)。

**②`KANSHOU_HOUSEMATE_ROOMS_`(新常數)**：`{'阿爾托莉雅-Saber':'阿爾托莉雅的房間', '間桐櫻黑化-Master':'間桐櫻的房間', '美杜莎-Rider':'美杜莎的房間'}`——這3位視為「已經住在衛宮宅」的同住人，深夜/清晨直接回自己在家裡的房間，不再走`KANSHOU_HERO_HOME_`(外部住處)那條路徑。`kanshouRollDailyLocation_`改成優先查`KANSHOU_HOUSEMATE_ROOMS_`，查無才退回`KANSHOU_HERO_HOME_`，兩者都沒有才是通用值「自己的住處」。抽出共用小helper`kanshouHeroIdByName_`(依真名反查SEED_SERVANTS的id)，避免兩處各自重複寫一次同款find邏輯。

**③家從5個通用房間擴充成15個**：我的房間(原「臥室」改名)、阿爾托莉雅的房間、間桐櫻的房間、美杜莎的房間、客房1、客房2、客廳、廚房、浴室、陽台、庭院、緣廊、道場、玄關、倉庫——貼合衛宮邸的日式老宅意象。`KANSHOU_HERO_HOME_`/`KANSHOU_LOCATIONS_`的'visit'分區同步拿掉阿爾托莉雅/間桐櫻/美杜莎原本的3個外部住處條目(騎士團舊宿舍/靜謐宅邸/間桐邸，已被housemate房間取代而變成不可達的死資料)跟衛宮邸(衛宮士郎已整個移出)。程式化核對過：所有`KANSHOU_HERO_HOME_`/`KANSHOU_HOUSEMATE_ROOMS_`的值都確實登記在`KANSHOU_LOCATIONS_`裡(零缺漏)，前後端(`Gallery.gs`/`Script_Kanshou.html`)地點清單逐字一致(50個地點零差異)。

**④結束一天房間分配邏輯**：玩家固定回「我的房間」；同行同伴中好感≥80(`intimateNightNames`)的直接跟玩家同房(我的房間，同床共枕)；有專屬房間的同住人(阿爾托莉雅/間桐櫻/美杜莎)回自己房間；其餘同行同伴輪流分配客房1/客房2(cycling，人數超過房間數也不出錯，只是同一間客房住不只一人，純敘事層面、不影響機制)。「回家」按鈕(宵禁提醒的`kanshouGoHomeCurfew`)同步從舊的'臥室'改成'我的房間'——這是這次順手抓到的真實bug，舊地點已經不存在了，不修會導致按下去移動失敗。

**⑤家的預設名稱鎖定「衛宮宅」**：`getKanshouHomeName_`/`setKanshouHomeName_`預設值從空泛的「家」改成「衛宮宅」，玩家仍可隨時在遊戲內改名(未強制鎖死)，只是不再預設空白稱呼。前端`kcMapListHtml_`/`kanshouRenameHome`的預設fallback同步更新。

**⑥未做的部分**：好感80的「把我家當家/正式同住」機制——玩家問了但還沒明確拍板(現有「同行」已能達到永遠帶著某人的效果，只是佔同行名額，是否要一個不佔名額的「已同住」第三種狀態還在討論)；敲門事件(§78)跟房間制是否有重疊——判斷不重疊，敲門專門處理「不住在這個家、不在同行名單的舊識」半夜來訪，跟現在已經住在家裡的同住人是兩種不同情境，予以保留不動；好感<80是否自動離隊——目前沒有這個機制，同行/離隊完全由玩家手動操作(👥面板)，未新增自動化。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0；程式化核對地點清單零缺漏、前後端零差異。部署後建議測試：①召喚清單看不到衛宮士郎，直打API召喚他應該被拒絕；②結束一天時，阿爾托莉雅/間桐櫻/美杜莎(若同行且好感<80)應該分別回到自己命名的房間，而非籠統的「我的房間」；③宵禁提醒點「回家」應該能正常移動(不再指向已刪除的「臥室」)；④家分頁應該能看到全部15個新房間。

## §83 全面禁男性英靈入駐、同住人夜遊10%、橋段庫骨架+首個橋段「夜襲」（2026-07・玩家「男角都移除掉吧...沒啥用」+「晚上也要有人會在外遊蕩」+「橋段」設計討論）

**背景**：玩家點出鑑賞的核心矛盾——想要自由發揮，又想要有驚喜感的劇情；如果玩家自己打字下指令安排橋段(如「11點去夜襲saber，她要驚訝又歡喜，明天早餐要害羞」)，玩家自己就是編劇，打完就知道結局，毫無驚喜可言。討論後定案方向：把「橋段」做成資料驅動的系統——GAS決定觸發條件與這次的走向(骰)，AI只負責演出被選中的走向，玩家只負責「做出選擇」(如：要不要在深夜走進某人房間)，不負責寫劇本。這個模式延伸自既有的敲門事件(§78)/晨間餘韻(§81)，只是這次抽成可持續擴充的正式骨架。同一輪玩家也定案「男角色全面禁止召喚」跟「深夜同住人也該有10%機率不在房間」兩個小修正。

**①全面禁男性入駐(擴大§82衛宮士郎禁令)**：`actionKanshouSummonHero`原本只擋`heroId==='衛宮士郎-Master'`一人，改成額外擋`hero[COL.HERO.SEX]==='男'`全體(§82的衛宮士郎專屬訊息保留在前，新增的通用擋放在後，兩者不衝突)；原本的「不開放男男配對」判斷式因此變成不可能觸發的死碼(男性英靈已在更早就被擋下)，一併移除，不留冗餘判斷。前端`kcRecomputeAvailable_`原本只濾`h.id!=='衛宮士郎-Master'`一人，改成在`_kcHeroesAll`賦值時(`openCompanions`函式)就用`h.gender!=='男'`濾乾淨——這樣連篩選下拉選單(`genderOpts`，跟`_kcHeroesAll`同一個來源)都不會再冒出「男」這個選項，不是只有召喚清單濾掉、選單卻還選得到只是清單是空的那種半吊子修法。女性玩家起始陣容(`actionEnterKanshou`)原本比男性玩家陣容多兩位男性同伴(EMIYA/伊斯坎達爾)，改成兩種性別玩家統一給同一份純女性起始陣容(阿爾托莉雅/遠坂凜/伊莉雅絲菲爾/美狄亞/美杜莎)。種子資料本體(`Seed_Codex.gs`)不刪，男性英靈仍可以在「出門走走」的隨機巧遇池(`KANSHOU_ENCOUNTER_MALE_IDS_`)當背景路人出現——巧遇不建立可召喚的同伴關係，純敘事flavor，符合玩家「當背景就好」的定調，這次刻意不動。

**②同住人夜遊10%機率**：新增常數`KANSHOU_HOUSEMATE_WANDER_CHANCE_ = 0.1`。`kanshouRollDailyLocation_`原本同住人(`KANSHOU_HOUSEMATE_ROOMS_`)跟一般英靈共用同一套`homeBias`(深夜0.85／清晨0.5機率回家)，改成同住人另外反著骰：深夜/清晨預設90%待在自己房間，10%改跳過「回房間」、往下走haunts/全地點池(在外遊蕩)。順手抓到一個潛在bug：原本的全地點保底池(`KANSHOU_LOCATIONS_.map(l=>l.name)`)沒有排除`region==='home'`的私人房間，理論上任何不在身邊的英靈都可能被骰進玩家或其他人的臥室——改成`.filter(l=>l.region!=='home')`，私人房間只能靠「拜訪」主動走進去，不會被隨機亂晃骰中。

**③橋段庫骨架 + 首個橋段「夜襲」**：新增資料表`KANSHOU_SCENE_EVENTS_`(目前只有一筆`夜襲`)+ 共用骰選函式`kanshouRollSceneBranch_(eventKey, bond)`——依bond從高到低找第一個達標的`branches`分支，之後想加新橋段只要往這個物件加一筆(觸發條件另外掛在`actionPlay`對應分支)，不必另開一條平行敘事管線。「夜襲」觸發條件(寫在`actionPlay`的`moveTarget`區塊內)：深夜(`timeBand_(curHour)==='深夜'`) + 移動目標是`KANSHOU_HOUSEMATE_ROOMS_`裡登記的某位同住人專屬房間 + 那位同住人此刻確實同行在場(避免跟非同行故人重逢的`kanshouLeftBehindIdxs`敘事框架互相打架)。命中就依bond骰出這次的反應走向(60+：驚喜歡喜迎接／30+：驚訝害羞抵抗但不真的拒絕／其餘：防備需要玩家主動放軟)，組成`★【橋段·夜襲】`提示詞插進`kanshouKnockGuestStr`後面的同一串系統指定情境；若走向是最高檔(60+)，順手比照§81寫入`KANSHOU_MORNING_AFTER_TAG_`(用她的真名)，隔天第一回合自動帶出晨間餘韻的曖昧氛圍——不必玩家自己再交代一次「隔天要怎樣」。

**④未做的部分(這次先記下來，橋段庫架構跑順後下一輪依同一套模式加)**：早起偷情(玩家早起+對象也早起的巧遇橋段)、賴床叫醒(有人沒到集合去房間找的橋段)、早餐集合機制(8點強制集合，需要新的一天節奏，比橋段庫本身更大一塊，尚未動)、民宿經濟(招攬入住收租、沒錢肉償橋段——玩家定調成「加項」，玩家自己的維護及食材費照扣(§76/§84)不變，同住人另外貢金/償還進玩家口袋，兩邊不衝突，但尚未實作)。「衛宮宅」要不要脫離這個名字走純民宿老闆人設，留給早餐集合機制一起處理(牽涉玩家身份設定要不要改)，這次刻意不動。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①召喚清單/篩選下拉都看不到任何男性英靈，直打API召喚男性英靈應該被拒絕(訊息「僅開放女性從者/御主入駐」)；②新建女性玩家跟新建男性玩家的起始陣容應該完全一樣(都是5位女性)；③結束一天/推進時間多跑幾次，同住人應該偶爾(約1/10)出現在自己房間以外的地點；④好感60+的同住同行同伴，深夜走進她的專屬房間應該觸發夜襲橋段的提示詞走向，隔天第一回合應該帶出晨間餘韻。

## §84 §76「房租」改名為「維護及食材費用」（2026-07・玩家「玩家自己房租照扣<<改成維護及食材費用？？」）

**背景**：玩家看到§83提到「玩家自己房租照扣不變」，指出「房租」這個詞不太對——這是玩家自己住的家(衛宮宅)，不是租來的，用「房租」講不通；改成「維護及食材費用」更貼合「自己的房子，但水電/修繕/大家一起吃飯的食材要花錢」這個實際情境。純粹改名，金額/週期/機制完全不變(仍是每7天1500円、跨週才扣、可為負數無懲罰)。

**改動範圍**：`KANSHOU_RENT_`→`KANSHOU_UPKEEP_`；`COL.PC.RENT_WEEK`→`COL.PC.UPKEEP_WEEK`(Core_Settings.gs欄位定義，純改名、欄位位置34不變)；`kanshouChargeRent_`→`kanshouChargeUpkeep_`；區域變數`rentCharged`→`upkeepCharged`；提示詞注入字串`★【房租自動扣款】`→`★【維護費自動扣款】`(措辭也從「翻看帳單」補上「盤算菜錢」貼合食材費語感)；所有相關程式碼註解同步改用「維護費」用詞。§76/§77歷史記錄段落保留原文不動(如實記錄當時用詞)，之後新寫的內容一律用「維護費」/「維護及食材費」。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0；`grep -rn "RENT\|房租" gas/`確認除了§歷史註解外無殘留舊名稱。

## §85 房東房客世界觀定案：起始好感/關係標籤改分級 + 房客真的繳房租給玩家（2026-07・玩家「那整體世界觀..也要改動？一開始先不要太熟悉？變成房東和租客？」→「全套！好感30起跳 其他人都先10？」）

**背景**：§84把「房租」改名成「維護及食材費用」後，玩家發現一個更根本的矛盾——3位同住人白住衛宮宅，玩家自己一個人扛整棟房子的維護費，邏輯上說不通(房客該繳錢給房東，不是房東單方面出錢養房客)。玩家提出把整個世界觀定調成「房東房客」：玩家是房東，同住人是入住的房客，一開始不會太熟(房東房客本就有距離感)，感情要慢慢從這層關係長出來；同時選了「全套」方案——不只改熟悉度，真的把「房客繳租」這筆收入做起來。具體數字玩家定案：房客(3位同住人)起始好感30，其他英靈(非同住人)起始好感10。

**①起始好感/關係標籤分級(`heroToKanshouRow_`)**：原本不分對象一律`BOND=45`、`REL_TAG="從者"`。改成依`heroRow`的id是否登記在`KANSHOU_HOUSEMATE_ROOMS_`判斷`isHousemate`：房客`BOND=30`、`REL_TAG="房客"`；其餘英靈`BOND=10`、`REL_TAG="點頭之交"`(2026-07玩家「從者標籤？！改成點頭之交？」追加定案——比房客更生疏，「從者」這個詞留給solo真正的主從契約，鑑賞這裡的陌生人不該借用容易誤讀的詞)。初始`MEMORY`/`REL_MEM`文字也分流——房客版本強調「房東與房客的關係還很生疏」，其餘維持原本「初次相遇，緣分才剛開始」。這個函式是`actionEnterKanshou`起始陣容跟`actionKanshouSummonHero`直接召喚共用的唯一建列入口，兩處都自動吃到新規則，不必分別改。

**②房客繳租機制(`kanshouCollectTenantRent_`，新函式)**：新增常數`KANSHOU_TENANT_RENT_=800`(每位房客每週租金，跟打工薪資同量級)。收支邏輯完全對稱於`kanshouChargeUpkeep_`——依「新的一天」換算週數，跨過新一週才收。關鍵設計：**不新增欄位**，重複利用`COL.PC.UPKEEP_WEEK`這個欄位在「每一位房客自己的那一列」存「這位房客自己上次繳到第幾週」(玩家列跟房客列各自用自己那一列的同一個欄位追蹤各自的財務結算進度，語意一致：「這一列上次結算到第幾週」)。逐一檢查`KANSHOU_HOUSEMATE_ROOMS_`登記的3位房客id，反查其在當前game_id底下的資料列(`sameGame`同款game_id比對，避免跨玩家局收錯錢)，不論該房客此刻是否同行都照收(她「住在這裡」的認定跟`kanshouRollDailyLocation_`房間分配同一套標準，不看同行與否)，累計總額一次加進玩家`MONEY`。掛進`actionPlay`「結束一天」跟「推進時間」兩個既有的週結算呼叫點，跟`kanshouChargeUpkeep_`前後腳呼叫，新增對應的`★【房客繳租·氛圍提示】`提示詞(比照維護費扣款同款「只在有實際收到錢那一刻才注入」寫法)。

**③避免「遲來房客一次補收好幾週房租」的坑**：`heroToKanshouRow_`原本沒有「這一列的財務結算起點」概念(玩家列額外在`actionEnterKanshou`手動設成第0週，但房客列從未設過、預設空字串視為第0週)。若房客是遊戲進行到第5週才被召喚，她那列的`UPKEEP_WEEK`仍是0，下次收租時會被誤判成「欠繳5週」一次收一大筆不合理房租。修法：`heroToKanshouRow_`新增第4參數`curDay`，建列時直接把`UPKEEP_WEEK`設成「召喚當下」對應的週數(`Math.floor((curDay-1)/7)`)，房租只從「真正搬進來那一刻」開始算，不會覺得算舊帳。`actionKanshouSummonHero`呼叫處補上`parseInt(me[COL.PC.DAY])||1`；起始陣容(`actionEnterKanshou`)本來就是第1天(第0週)，沒傳這個參數也一樣正確(預設值1)，不強制修改呼叫端。

**未動的部分**：房客的每週租金是固定值(不依好感/個性浮動)，符合GAS掌數值鐵律；沒錢肉償/以貌抵租這類橋段仍留在§83④的「先記下來」清單，這次只做「房客準時繳租」這條乾淨的金流，沒有把違約/抵償邏輯一起做進來，避免範圍一次滾太大。

**訂正(2026-07・玩家「是不是要用gas做定位 不要給ai處理阿」)**：上一版這裡誤寫「REL_TAG後續仍可依rel_changes機制自然演進、AI自己把稱謂寫成更親密的說法」——查證`Gallery.gs`的`rel_changes`處理迴圈(actionPlay內)，發現這是錯的：REL_TAG欄位**從頭到尾只能透過`actionUpdateRelTag`(玩家在👥同伴面板手動點「🏷️關係」按鈕觸發的`prompt()`)更改**，AI的`rel_changes`只能寫BOND(好感數字)，對REL_TAG完全沒有寫入權限，這是本專案更早以前就定案的既有行為(非這次新增)，AI對關係標籤的影響力僅止於在`intimacy_feedback.npcs[].attitude`裡演出「認不認同」這個標籤，不能改寫標籤本身。也就是說「這裡設定的起始值之後要不要變、變成什麼」目前完全交給玩家自己手動決定，不是GAS自動依好感分級、也不是AI決定——如果之後想要「GAS依好感門檻自動升級關係標籤」，這是一個尚未做的新功能，需要另外討論要不要蓋掉玩家手動編輯的空間。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①新召喚一位房客(阿爾托莉雅/間桐櫻/美杜莎其中一位)，好感應顯示30，其餘英靈召喚應顯示10；②新開局角色連續推進時間跨過第8天，應該同時看到維護費扣款跟房客繳租(若房客都在場)各自的flavor提示，餘額應該是「+房租收入-維護費」的淨值；③在遊戲進行到第2週以後才第一次召喚一位新房客，下次跨週結算時，她的房租不應該被一次補收多週份、只從召喚後的下一週開始收。

## §86 開場從「冬木·深山町」改成直接在家中、清晨6點（2026-07・玩家「那開場是不是不要在火車站了？直接在家中？早上6點要開始準備早餐？！」）

**背景**：§85定案「房東房客」世界觀後，玩家發現舊開場設定跟這個世界觀矛盾——新角色開局位置原本是`冬木·深山町`(一個泛用的城區名，不是具體地點)，AI常自由發揮成「剛下車、還在火車站/路上」這類外地初來乍到的開場，但「房東本來就已經住在這棟房子裡」，不該每次開局都像剛搬來的異鄉人。玩家提議兩件事：開場直接落在家裡、時間改早上6點(對應「該起來準備早餐」的房東生活感)。

**①開局位置(`actionEnterKanshou`新角色建列)**：`loc2`從`"冬木·深山町"`改成`"我的房間"`(§82已存在的房間，region:'home'、noEncounter:true)——玩家一開局就直接在自己房內醒來，不再是模糊的城區泛稱，AI敘事也就沒有理由編出「剛抵達」的外地開場。

**②開局時刻+每日甦醒時刻，統一從早上8點改清晨6點**：`actionEnterKanshou`新角色的`COL.PC.HOUR`初始值、以及`actionPlay`「結束一天」分支固定跳的隔天時刻，都從`8`改成`6`。6點跟原本8點同屬`timeBand_`的「清晨」時段(5~10點)，敘事氛圍標籤不變，只是更早——刻意不另外加一個「必須先完成做早餐才能行動」的強制關卡，純粹交給既有的🕰️時段感提示詞(「現在是...清晨」)讓AI自然帶出張羅早餐的晨間氛圍，不強制、不卡關，符合工程準則「不做臨時應變的特例機關」。「早餐集合機制」(§83④提過的、要求玩家/同伴固定時刻集合吃飯的結構性玩法)仍然是尚未做的更大一塊，這次只解決「開場感覺不對」跟「作息時刻」，沒有一併把集合機制做進來。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①新建鑑賞角色，位置應顯示「我的房間」、時刻應為第1日06:00；②結束一天後應跳到隔天06:00而非08:00；③新開局的第一段敘事，AI不應再出現「剛下車/剛抵達」等外地開場描述，應直接是在家中醒來的場景。

## §87 非房客關係標籤依好感GAS自動5階梯度（2026-07・玩家「需要好感gas調整！...但要怎麼設定？房客就是房客以後再自己改？點頭之交>>慢慢提升5階段？還是簡單點只有好感100才可以自己改關係？」）

**背景**：§86定案「房客/點頭之交」起始標籤後，玩家問「怎麼設定好感的GAS調整」，給了3個候選方向。回覆採用的方案：房客維持結構性事實、GAS永不自動改(以後要改靠玩家自己手動)；點頭之交做成5階自動梯度，好感到門檻GAS自動升級，不鎖手動編輯到好感100(那個選項太限制)。

**①`KANSHOU_REL_TIER_`(新常數，5階，門檻借用鑑賞既有節點，不發明新數字)**：`80:戀人`(對齊§78「好感≥80可同床共枕」門檻)、`60:親近的人`(對齊§83夜襲橋段「歡喜迎接」分支的門檻)、`40:熟識的朋友`、`20:普通朋友`、`-100:點頭之交`(保底)。

**②`kanshouSyncRelTier_(pcData, idx)`(新函式)**：依當前BOND重算這一列的REL_TAG，但**只在「目前這格文字仍等於某個梯度的字面」時才覆寫**——不新增任何「是否已手動自訂」的旗標欄位，純粹拿「這格文字還在不在梯度清單裡」當判斷依據：玩家一旦透過`actionUpdateRelTag`(🏷️按鈕)手動改成清單外的自訂稱呼，這格文字就再也不匹配任何梯度，之後好感繼續變動也不會被自動蓋回去，尊重玩家的手動選擇。「房客」這個字面本來就不在梯度清單裡，所以房客的標籤永遠不會被這裡自動改掉，完全符合「房客就是房客，以後自己改」的定案，不需要另外寫`isHousemate`特判——同一套機制自然覆蓋兩種情境。

**③掛進兩個既有的BOND變動點**：送禮加好感(`buyItem`的`type==='gift'`分支)、AI `rel_changes`好感增減迴圈，兩處在寫入新BOND值後都補呼叫一次`kanshouSyncRelTier_`。REL_TAG本身仍然维持AI零寫入權限不變(AI對關係的影響力只剩`intimacy_feedback.npcs[].attitude`的「認不認同」演出)，這次新增的是「GAS依好感自動算標籤」，不是開放AI決定標籤。

**未動的部分**：手動編輯(`actionUpdateRelTag`)完全不設門檻，玩家隨時可以改，不強制等好感100——玩家自己也覺得那個選項太限制，採用的是「GAS自動跑預設、玩家隨時可選擇跳出這套系統」的折衷方案。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①新召喚一位非房客英靈(好感10)，多次送禮把好感推過20/40/60/80門檻，每次跨過門檻後關係標籤應自動更新成對應的梯度字面；②手動把某人的關係標籤改成一個自訂稱呼後，繼續送禮推高好感，標籤應該維持自訂稱呼不被蓋回去；③房客(阿爾托莉雅/間桐櫻/美杜莎)好感推到80以上，標籤應該仍然顯示「房客」，不會被自動改成「戀人」。

## §88 純聊天好感卡梯度上限、送禮才能突破+房客偶爾繳不出房租（2026-07・玩家「ai會有錢嗎...如果都一直有錢要怎麼肉償...每次隨機到有打工就幫他加一點？」+「只是聊天就加好感可以推倒是不是怪怪的？應該要卡在某個地方 進行送禮突破後才可以繼續增加...？」）

**背景**：玩家對§87的5階梯度提出兩個延伸疑慮——①純聊天(AI rel_changes)就能把好感一路推到80+同床共枕門檻，感覺太容易，該卡在某個地方逼玩家送禮才能繼續；②之前擱置的「沒錢肉償」橋段(§83④)缺一個「房客真的會沒錢」的前提，房客目前保證每週都繳得出房租，肉償永遠沒有觸發空間，玩家提議幫房客加一個隨機打工/收入判定。

**①純聊天好感卡梯度上限(`kanshouRelChatCeiling_`，新函式)**：傳入目前bond，回傳「純聊天最多只能到幾」——沿用`KANSHOU_REL_TIER_`同一份門檻(20/40/60/80)當切點，不重複開新數字：目前在哪一階，聊天最多只能推到那一階的頂(如目前15分，聊天最多到19分)，到了80+的最高階則不再設上限(回傳100)。在AI `rel_changes`好感增減迴圈裡，只夾**正向**漲幅(`change>0`時夾)，好感下滑不受影響。送禮(`buyItem`的`gift`分支)完全是另一段程式碼路徑，天生不吃這個夾值，天然就是唯一能突破梯度上限的管道，不用額外寫「送禮解鎖」的旗標。**同步在`partyDetailsArr`補一句提示**：當某位同伴當下正好卡在上限時，才多加一句「單靠對話目前已到這個階段的上限，需要收到禮物才能繼續加深，這回合維持細水長流的相處基調，不要寫成關係大幅推進」——沒卡住時完全不提，避免每回合都塞這句干擾敘事；這是必要的，否則GAS默默夾住數字，但AI不知情可能寫出「這次對話後感情大幅推進」這種跟機制矛盾的敘事。

**②房客偶爾繳不出房租(`kanshouCollectTenantRent_`擴充，非新增打工/錢包系統)**：玩家提的「幫房客加打工系統、隨機賺一點」工程量偏大(等於要幫3位房客各自開一套獨立財務追蹤)，改用更輕量的做法：新增`KANSHOU_TENANT_SHORT_CHANCE_=0.2`，每位房客每次結算跨過新一週時，先擲一次骰，20%機率「這次交不出房租」——命中就跳過這位的租金(不計入`total`)，但`UPKEEP_WEEK`照樣往前推進(不會因為交不出就欠款複利、累積到下次爆量索討，維持「軟性設計、無懲罰機制」的既有精神)。函式回傳值從單純數字`total`改成`{total, shortNames}`(呼叫端`actionPlay`兩處同步改用解構)，`shortNames`供prompt組flavor文字用。新增提示詞`★【房客手頭吃緊·氛圍提示】`：點名這次交不出房租的房客，讓AI自然演出不好意思/想辦法解釋或補償的樣子，**不寫死一定要走向肉償**，只給出「這裡有一個可能的契機」的空間——之後真的要做肉償橋段時，只要檢查`shortNames`裡有沒有目標對象當觸發條件即可，不必回頭改這個函式。

**未動的部分**：肉償本身這個橋段(具體會演出什麼、要不要走§83既有的橋段庫`KANSHOU_SCENE_EVENTS_`模式做成明確分支)還沒做，這次只解決「房客真的會沒錢」的前提條件；純聊天卡梯度上限只影響AI的`rel_changes`，不影響送禮/§78夜晚門檻(bond≥80)這類既有GAS直接判定的機制——好感數字本身沒有被鎖住，只是「用什麼手段」能不能繼續往上推有差。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①單靠聊天反覆互動把某人好感推到接近20/40/60/80的門檻，應該卡在門檻前一格不再上升，即使AI narration寫得很深情；②送她一件禮物，好感應該能直接跨過門檻(禮物固定加成不受夾值影響)；③連續推進時間多個星期，偶爾應該會看到某位房客「這次繳不出房租」的flavor提示，不是每次都準時繳清。

## §89 肉償橋段上線 + 賴床叫醒橋段上線（2026-07・玩家「先把肉償機制上線！！...以後跟她獨處可以跳出這個按鈕給玩家按？？？還有早餐睡懶覺也上線！！」）

**背景**：§88立好了「房客偶爾繳不出房租」的前提，這次接著把「肉償」實際橋段做出來；同一批順手把之前討論過的「賴床叫醒」也上了，兩者都套用§83既有的橋段庫(`KANSHOU_SCENE_EVENTS_`/`kanshouRollSceneBranch_`)骨架，沒有另開平行系統。

**①觸發框架泛化：夜襲/賴床叫醒共用同一套「走進同住人房間」判定**：原本`夜襲`橋段寫死判斷「目前時段=='深夜'」，現在改成新常數`KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_={'深夜':'夜襲','清晨':'賴床叫醒'}`——查表決定這個時段該跑哪個橋段(查無對應時段就什麼都不觸發，如午後/黃昏/夜三段目前沒有房間橋段)，其餘觸發條件(走進`KANSHOU_HOUSEMATE_ROOMS_`登記的房間、此人此刻同行在場)完全共用，不必為賴床叫醒另寫一次判斷。`賴床叫醒`分支依bond：80+「睡眼惺忪卻格外黏人，一副也想拉你一起賴床」(玩家「好感80以上可以色色叫醒」)、40+「不好意思但嘴硬趕人」、其餘「嚇醒後防備拉起被子」。變數名`kanshouNightRaidStr`同步泛化改名`kanshouRoomEventStr`(現在兩個橋段共用同一個提示詞插槽)。

**②肉償橋段(`KANSHOU_SCENE_EVENTS_.肉償`，新分支)**：依bond：60+「害臊卻主動甘願」、30+「彆扭不情願但配合」、其餘「委屈卻知道理虧」。**觸發來源是玩家主動按按鈕**，不是移動觸發——新增`KANSHOU_RENT_DEBT_TAG_`(MEMORY文字工廠，存在房客自己那一列，不是玩家列)：`kanshouCollectTenantRent_`短繳時設為`'是'`，準時繳清(不論是自然繳清或已經走過肉償橋段)時清空。`actionPlay`回應JSON新增`debtPaymentOffer`欄位：只有「同行隊伍剛好只有一位(獨處)＋那一位剛好掛著欠租旗標」才會夾這個名字，前端(`kanshouOfferDebtPayment(name)`)按下才真正送出`debtPayment`參數觸發橋段——跟`knockEvent`/`curfewPrompt`那種強制二選一不同，這個純粹是「多一個可用選項」，不點就正常繼續聊天，UI 上用`💰`色系跟既有的`🌙`宵禁區塊區隔。`send()`簽名新增第15個參數`debtPayment`。

**③意外抓到的既有bug(`kanshouCollectTenantRent_`一併修掉)**：這個函式會改「房客自己那一列」的`UPKEEP_WEEK`/`MEMORY`，但原本(§85上線時)從未把改到的列索引加進`dirtyPcRows`——若房客當下剛好是「推進時間」(非結束一天)分支的同行隊伍成員，這個分支本來就不會把同行同伴的列加進dirty(comment原文「同行同伴不受影響，位置本就跟玩家同步」)，導致她的房租結算/欠租旗標可能只停留在記憶體、從未真正寫回試算表。這次把`dirtyPcRows`當參數傳進函式、內部直接`.add(idx)`，兩個既有呼叫端同步補上這個引數，徹底修掉這個潛在的資料遺失缺口。

**未動的部分**：早餐集合機制(8點強制集合/是否需要按「吃飯」按鈕/時間自動跳到8點/房客自動移動到廚房/20%不移動、睡懶覺對照賴床叫醒橋段/移動到房間是按鈕還是對話觸發)——玩家明確表示這塊「還要再討論看看」，這次沒有跟著肉償/賴床叫醒一起實作，賴床叫醒本身只是重用既有的「移動進房間」機制、不涉及任何新的「集合」結構。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①深夜/清晨分別走進同住人房間，應觸發對應橋段(夜襲/賴床叫醒)而非另一個；②讓某位房客「這次繳不出房租」，之後只跟她一人同行、找她獨處，應該會看到💰按鈕跳出來；③按下按鈕後應該觸發肉償橋段的敘事，且下次房租結算(即使她那時已不再是唯一同行者)不應該再顯示欠租提示(旗標已清空)；④確認`UPKEEP_WEEK`/欠租旗標的修改在多輪「推進時間」呼叫後有確實持久化(不會下次讀到舊值重複判定)。

**訂正(2026-07・玩家「點了移動後 ai會讓npc乖乖睡覺的敘事嗎 是不是只要設定哪些時段必定睡覺」)**：上線當下有一個真實bug——判斷式原本寫在「同步同行同伴LOC」的forEach**之後**，但同行同伴的LOC本來就會被那段forEach無條件覆寫成跟玩家一致(同行同伴的常態行為就是跟著玩家到處走)。這代表判斷式從未真的檢查過她「同步前」人在哪裡，只要她同行在場+時段對+房間對就一定觸發——即使她剛才其實一路跟著玩家逛遍全家(客廳、廚房都去過)，只是這間恰好是她的房間，也會被誤判成「巧遇獨自在房裡的她」，narration卻要演成「深夜獨自走進了她的房間」，跟她剛才明明就在玩家身邊的事實矛盾。

**修法**：判斷式整段搬到同步forEach**之前**，並多加一個條件——`raidIdx`那一列「同步前的LOC」必須本來就等於`moveName`(這個房間)，才算「真的獨自在房間裡、被找到／撞見」；不等於就代表她剛才其實一直跟著玩家，不觸發。不需要另外設計「哪些時段強制她一定在睡覺」這種額外機制——結束一天時的房間分配(§82)+「同行同伴的LOC只在玩家移動時才被同步覆寫、其餘時間維持原樣」這個既有行為，只要判斷順序正確，就足以保證「這個時段她原本就在自己房間」這件事被正確檢查，不需要額外強制睡眠時段。

## §90 夜襲/賴床叫醒改成「先問過玩家再演出」的候選人+按鈕模式（2026-07・玩家「所以移動過去後可以跳出色色選項詢問是否色色 選擇否或是直接對話就是否定？？選是的話看好感度決定演出內容？」）

**背景**：§89上線後，玩家指出兩件事——①走進房間後直接演出橋段，玩家完全沒有「要不要」的餘地(只要條件成立就一定演，即使玩家只是想去看看她好不好，不一定想要每次都升溫)；②追問「同行是不是有強制綁定位置」引出對§89修法(檢查「同步前的LOC」)的進一步反思——`夜襲`/`賴床叫醒`原本的觸發時機(移動的當下)其實正好是「LOC同步」發生的同一個時間點，兩者綁在一起容易讓判斷邏輯脆弱。這次把整個觸發方式從「移動進房間就直接演出」改成「先算出候選人、按鈕持續可用、玩家按下才真的演出」，順便讓判斷邏輯徹底獨立於同步時機。

**①候選人判定搬到最前面(整個函式最早期，任何LOC寫入之前)**：新的判定區塊放在`sameGame`定義之後、敲門/宵禁/肉償等其他判定之前——這是這次回合裡**唯一**還沒有任何LOC被寫入或同步過的時間點，用「這次移動的目的地(有moveTarget)或目前位置(沒有moveTarget，純聊天)」比對`KANSHOU_HOUSEMATE_ROOMS_`，查到對應房客時再確認她「此刻」(還沒被同步覆寫前)的LOC是否真的等於這個房間——三個條件同時成立才算「候選人」成立：房間匹配＋時段對應到`KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_`裡的事件＋她本人的LOC確實等於這個房間。候選人只記身分(`{eventKey, hero, idx}`)，不記bond(bond留到玩家真的按下按鈕那一刻才讀最新值，避免候選人存在期間bond變動卻沿用舊值)。

**②按鈕持續可用，直到候選人資格自然消失**：候選人資格的判定跟這次呼叫是不是「移動」無關——純聊天(沒有moveTarget)一樣會检查「目前位置」是否命中候選人，只要玩家不移動離開，聊幾輪都不會讓候選人消失(玩家「因為對話不推進所以可以盡情對話」)；候選人消失只有一種情況：玩家移動去了別的地方，或她自己被同步走了(如同行同伴的LOC因為玩家移動被覆寫)。回合末算`roomEventOffer`(直接沿用回合開頭已經算好的候選人，不重算，重算會撞回「LOC已被同步」的問題)，前端(`Script.html`)在有候選人時顯示按鈕(夜襲文案「要不要更靠近一點？」、賴床叫醒文案「要叫醒她嗎？」)。

**③按下按鈕才真的演出(`userData.roomEventAccept`)**：新增處理放在候選人判定的正下方——比對姓名確實吻合候選人(防直打API帶假名字)才會真的依bond骰一次走向、組`kanshouRoomEventStr`插進提示詞、覆寫`finalUserMsg`成主動靠近/叫醒的意圖描述。不點按鈕(包含直接打字聊天)就是婉拒——`kanshouRoomEventStr`維持空字串，narration完全走一般對話，AI不會知道候選人這件事(候選人本身不出現在提示詞裡，只有真的被接受後才會提及)。前端新增`kanshouAcceptRoomEvent(name)`(`Script_Kanshou.html`)，`send()`簽名新增第16個參數`roomEventAccept`。

**④回答玩家「同行還有強制綁定位置嗎」**：有，這次沒有改——同行隊伍成員的LOC依然會在玩家每次移動時被強制同步成跟玩家一致(既有行為，`KANSHOU_HOUSEMATE_ROOMS_`房客也不例外)。這代表「候選人資格」的產生視窗，本質上是「結束一天分配房間後，到玩家第一次移動去別處之前」這一段——玩家若移動去她的房間，候選人成立；移動去別的地方，她就被同步走、候選人視窗關閉，之後這一天都不會再出現(除非玩家後來又回到不同行狀態、被`kanshouRollDailyLocation_`重新骰回房間)。要不要讓房客不受這個強制同步影響(改成保有自己的獨立行蹤，即使同行也一樣)，這是更大的世界觀/機制改動——會牽動`partyDetailsArr`目前「同行即在場」(不檢查LOC是否吻合)的既有假設，這次沒有跟著一起動，留給玩家確認要不要做之後再處理。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①深夜/清晨走進候選房客的房間，應該看到按鈕而不是直接演出敘事；②按鈕出現後先隨便聊幾句，按鈕應該還在(候選人沒有因為聊天而消失)；③按下按鈕才會看到橋段敘事，且好感高低對應到不同分支走向；④移動去其他地點後回來，若中途沒有觸發過同步覆寫她的位置以外的事，按鈕應該仍可能重新出現(取決於她此刻是否仍在原地)。

## §91 拿掉「隊伍」概念，改成「每個人都是獨立的、依LOC判斷在場」（2026-07・玩家「是不是不能有同行同步這個東西了....？變成房客清單...？如果是房客可以精準知道她在哪裡？...我希望是每個人都是獨立的不一定要綁定同行，讓他們自由在地圖活動？」→「沒錯 加入這個世界的感覺 直接額外做個寫法solo那直接切割！！」）

**背景**：§90修完「同步時機」的bug後，玩家繼續追問「同行還有強制綁定位置嗎」，我解釋了現況(同行同伴的LOC依然會被玩家每次移動強制同步覆寫)。玩家想清楚後，直接提出整個「隊伍」概念本身可能就是問題根源——今晚一路修的§76~§90幾乎都在跟「同行=強制跟隨」這個模型打補丁(房間分配、夜襲判定、獨處判定……)，玩家的訴求是「每個人都應該是獨立的，不必綁定隊伍，自由在地圖活動」，並明確要求「solo那邊直接切割」(不影響solo自己的隊伍系統)。這是這次session最大的一次改動，實質上把鑑賞的互動模型從「JRPG式隊伍跟隨」換成「生活模擬式各自獨立行蹤」。

**①核心模型轉換**：kanshou不再使用`IS_PARTY`("同行")這個欄位判斷任何事——solo仍是真正的隊伍概念，`IS_PARTY`欄位定義/`getLocalPeopleList`(Core_Settings.gs)/`Router_Movement.gs`的`actionMove`等solo專屬機制**完全不動**(玩家要求的「直接切割」)。鑑賞這邊，「在場」的唯一判準改成「這位已建立英靈的`LOC`是否跟玩家目前的`curL`一致」——這件事本身在Gallery.gs不同函式裡各自檢查，不集中成一個helper(考量每處拿到的`curL`/`pcData`狀態時機不同，見下)。

**②`召喚`從「加入隊伍」變成「讓她存在於世界」**：`actionKanshouSummonHero`不再有「後日談最多3名同伴」的容量檢查，也不再有「已離隊、重新喚回」這個分支——只判斷「這位英靈此局是否已經召喚過」，召喚過就回絕(「已經存在於這個世界了，去找找她在哪裡吧」)，沒召喚過就用`heroToKanshouRow_`建列(不再寫`IS_PARTY`)。連帶**整個移除「請走」功能**：`actionKanshouRemove`函式、`kanshou_remove`路由註冊、前端`kanshouRemove()`/請走按鈕全部拿掉——沒有隊伍容量，沒有「請走騰位置」的需求。`actionKanshouCompanions`從「列出同行的3人」改成「列出這個世界裡所有已存在的英靈」，新增`loc`(所在地點，玩家要精準知道去哪找)跟`isHere`(是否跟玩家同地點，供商店送禮清單篩選用)兩個欄位，回傳值不再有`max`。

**③每個人的LOC都靠自己的生活骰，不再有「隊伍房間分配」**：`actionPlay`的結束一天/推進時間分支，原本區分「同行(拉回家分配房間)」跟「不同行(依`kanshouRollDailyLocation_`重骰)」兩種人，現在統一成「所有已存在的英靈都跑`kanshouRollDailyLocation_`」，唯一例外是好感≥80**且此刻確實跟玩家同地點**的人，直接留在玩家房間過夜(同床共枕)——這個「例外」判斷本身也從「是不是同行」改成「LOC是否等於curL」。客房1/客房2依然是合法地點，只是不再有人被自動塞進去(那是給「隊伍」用的房間，用途隨隊伍概念一起淡出，之後想做「正式邀請入住」可以再讓某人固定佔用客房)。

**④移動不再拖著任何人走**：原本「移動進房間」跟「AI敘事決定新地點」這兩處都會把「同行」的人強制同步成跟玩家一致的LOC。這次全部拿掉——**按鈕移動的地點只代表玩家自己走去哪，不會拖走任何已存在的人**(每個人都是獨立的，符合玩家的訴求)；**AI敘事內決定的地點變化(`aiData.location`)則只同步「這回合開頭就已經跟玩家同地點的人」**(即`partyRows`，這是這一幕確實跟玩家在一起的人，AI narrate「一起換地方」時他們理應跟著走，但沒有在場的人不會被憑空拖走)。順手發現並刪除了一段完全重複的舊同步邏輯(結果必然跟aiLoc那段一致，屬於死重複)。

**⑤「在場人物」統一取代「同行夥伴」+「留人重逢」兩套舊系統**：`partyRows`(現在的定義是`LOC===curL`的已建立英靈，依好感排序取前3——這是敘事複雜度上限，不是隊伍容量，理論上很難真的有4人以上同時撞在同一地點)取代了舊的`partyDetailsArr`(原本靠IS_PARTY)跟`kanshouLeftBehindIdxs`(舊「留人重逢」機制，因為「同地點就在場」現在對所有人一視同仁，不需要特別區分「曾經同行、現在凍結在此」這種特例)。提示詞裡的用詞從「同行夥伴／同行隊伍成員」全面改成「在場人物」，「在場驗證鐵律」的說法也同步更新。深夜訪客(敲門接受)不再需要專屬的重逢提示詞——她的LOC一設成curL就會自動被partyRows撈到，卡片自動生成，只留一句「剛開門迎接」的情境提示。

**⑥連帶抓到的既有bug**：`actionUpdateRelTag`(🏷️關係按鈕，鑑賞/solo共用)原本無條件要求`IS_PARTY==="同行"`才能改稱呼——拿掉鑑賞這邊的IS_PARTY寫入後，這個按鈕會對**所有**鑑賞英靈永遠回絕。修法：判斷式改成「鑑賞世界(game_id開頭"k_")一律放行，solo維持原本的同行門檻」，兩軌用同一支函式、各自吃各自的規則。`Router_Action.gs`的`buildTagsPayload_`(頂部標籤卡片)也同步改成鑑賞看LOC、solo看IS_PARTY。

**⑦未動的部分**：`actionGetFullStatus`/`actionUpdateFate`(逆天改命)/`Router_Movement.gs`整個檔案(地圖/移動/休息等)確認是solo專屬、鑑賞前端從未呼叫，維持原樣不動，符合「solo那邊直接切割」的要求。8點集合吃早餐等「早餐集合機制」仍是先前§89就標記的「還要再討論看看」，這次沒有一起做。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①召喚一位新英靈，應該直接「存在」、沒有隊伍人數限制，同名英靈不能召喚第二次；②👥面板應顯示每個人的所在地點，沒有「請走」按鈕；③移動到別的地點，原本在場的人應該留在原地(不會被拖走)，除非是AI敘事內主動邀約帶她一起走；④送禮清單應該只列出「此刻跟玩家同地點」的人；⑤solo模式的隊伍/逆天改命/地圖移動應該完全不受影響(回歸測試)；⑥🏷️關係按鈕在鑑賞應該對任何已建立的英靈都能正常編輯，不再要求「同行」。

## §92 鑑賞曝光時鐘給前端＋「跳到時段」取代「推進N小時」＋「時段行動」骨架(首個動作:準備早餐)＋同地點詳細卡3→5（2026-07・玩家「需要變成時段嗎？好像比較好？」→「可以 但我還想要這個時段可以做什麼事情的按鈕！清晨就要有 準備早餐這個選項 點下去後住在這裡的訪客85%到餐廳（廚房？）10%自己房間5%外面隨機」）

**背景**：前一輪問「現在有什麼機制會移動時間」時發現一個真相：鑑賞的`clock`欄位(`buildClientState_`)其實從頭到尾都是空字串——`clockLabel_`只服務solo(`isFate`判斷)，鑑賞的day/hour雖然`actionPlay`內部一直有在讀寫(§67「推進時間」上線時借用了solo的`COL.PC.DAY/HOUR`)，卻從未真正傳回前端，`updateClock`還特地寫死「鑑賞模式不顯示」。玩家先問「推進N小時的按鈕能不能改成跳到時段」，緊接著追加「時段限定的行動按鈕(清晨→準備早餐)」——這兩個需求都需要前端**真的知道現在幾點**，於是這輪先把時鐘曝光這個地基補上，才能做時段判斷。

**①新增`kanshouClockInfo_(pcRow)`(Gallery.gs)**：單一真實來源格式化函式，讀`COL.PC.DAY/HOUR`(同`actionPlay`既有的預設值邏輯：查無值時Day1/08:00)，回傳`{day, hour, band, label}`(`band`用既有的`timeBand_`，`label`是"第X日・HH:00・band"顯示字串，跟solo的`clockLabel_`同格式)。`buildClientState_`(Router_Action.gs)跟`actionPlay`回應都呼叫這支，不各自重複拼字串——`buildClientState_`原本鑑賞context下`clk`恆空字串，現在也算出`kanshouClockInfo_`塞回`clock`欄位(顯示字串)＋新增`kanshouClock`欄位(結構化物件，供前端邏輯判斷用，顯示字串不好拿來字串比對)。

**②前端`updateClock`不再對鑑賞特殊隱藏**：改成不論solo/鑑賞，有`label`就顯示時段圖示+文字，只是AP行動力格只在solo顯示(鑑賞沒有這個資源，`ap`/`apMax`對鑑賞context本來就是無意義的預設值)。同時修正`applyClientState`一處過時的效能優化假設——原本寫「鑑賞拔地圖，沒人看得到，省下重繪」而完全跳過`renderMapPane`，但這個假設對桌機三欄並排版面(地圖頁本就常駐可見、不需切分頁)不成立，會讓桌機版的時段按鈕在點擊/收到訊息後不會即時刷新；`renderMapPane`本身早就有`offsetParent===null`的隱藏判斷，交給它自己決定要不要畫即可，不必在外面再攔一次。`send()`收到`actionPlay`回應時同樣記下`data.kanshouClock`並重繪地圖頁(桌機恆顯示，手機下次切分頁自然吃到最新值)。

**③「跳到時段」取代「推進N小時」按鈕**：新增`KANSHOU_TIME_BANDS_`常數(清晨5點/午後11點/黃昏17點/夜20點/深夜0點，對應`timeBand_`既有的5段分界，兩處要保持同步)＋`kanshouHoursUntilBand_(curHour, targetStartHour)`(算法跟既有的跳節慶`kanshouHoursUntilDate_`同款「算到下一次還差幾小時」，已在目標時段內也算下一次，不會出現按了沒反應的按鈕)。`actionPlay`的advanceHours分支新增`userData.jumpBand`判斷，跟`jumpFestival`同一順位(advanceHours/jumpFestival都沒指定時才輪到它)。前端原本的`[2,6,12]`小時按鈕全部拿掉，改成`KANSHOU_TIME_BANDS_`鏡射(`KC_TIME_BANDS_`，`Script_Kanshou.html`)渲染5顆「跳到○○」按鈕，呼叫新的`kanshouJumpBand(key,label)`。

**④「時段行動」骨架＋首個動作「準備早餐」**：`renderMapPane`鑑賞分支新增一段「只在特定時段才顯示」的按鈕區塊(目前只有清晨的🍳準備早餐一項，之後想加其他時段的專屬行動，往這個if/陣列加即可)，靠新曝光的`kcClock.band`判斷。點下去呼叫`kanshouPrepBreakfast()`→`send(...,prepBreakfast:true)`。後端`actionPlay`把這個動作實作成「移動到廚房(複用既有moveTarget整套管線——清巧遇/寫LOC/事件種子，不開一條平行的地點切換路徑，`moveTarget`常數依`isBreakfast_`旗標直接指定成廚房地點物件，不聽前端傳的地點字串)＋幫3位房客(`KANSHOU_HOUSEMATE_ROOMS_`)各自骰一次今早去向」：新增`KANSHOU_BREAKFAST_KITCHEN_CHANCE_=0.85`(下樓吃早餐，LOC設成廚房)／`KANSHOU_BREAKFAST_OWNROOM_CHANCE_=0.10`(還在賴床，LOC留在自己房間)／剩餘0.05機率視為「已經自己出門了」(呼叫`kanshouRollDailyLocation_(hmName)`**不傳hour參數**，避免該函式清晨時段的homeBias又把「出門」蓋回房間，導致5%出門的機率名不符實)、`kanshouRollBreakfastSpot_()`(骰哪一種)。骰完的結果直接寫進各房客的LOC，讓下樓吃早餐的人自然透過既有`partyRows`(【在場人物】)機制被AI看到，賴床/出門的人則額外組一句★【早餐現況】提示詞讓AI知道「這幾位沒出現在早餐桌上，不必特別解釋原因」。這是回答上一輪玩家問題「如果有第4個房客會賴床還是出門」的實際落地——GAS直接骰定，不必AI猜。

**⑤同地點AI詳細卡上限3→5**：延續前一輪玩家問「吃飯不能5人嗎」的討論，`partyRows`的`slice(0,3)`改成`slice(0, KANSHOU_PARTY_DETAIL_CAP_)`(新常數＝5，跟`KANSHOU_HOUSEMATE_ROOMS_`放在一起)——3位房客+來訪的人湊在一起吃早餐等場合終於不會被截斷成只剩3人詳細卡。仍是敘事複雜度/prompt篇幅上限，不是玩法容量上限，超過上限的人依然存在、依然可被特定劇情點名。

**⑥未動的部分**：solo完全不吃這輪任何改動(`jumpBand`/`prepBreakfast`/`kanshouClock`皆是`actionPlay`內部欄位，函式入口早已擋非`KPC_`呼叫；`send()`新增的第17/18個參數對solo的呼叫路徑不存在，因為solo整條輸入框本來就隱藏)。玩家另外問到「房客房間是不是要獨立成一個地圖分支」——查證後這件事在§82(衛宮宅定案)就已經做了：`阿爾托莉雅的房間`/`間桐櫻的房間`/`美杜莎的房間`本來就是`KANSHOU_LOCATIONS_`裡各自獨立、跟客廳/廚房平行的地點，不是共用同一個「房客房間」籠統地點，這次沒有額外工作要做。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①鑑賞頂部應該出現時鐘HUD(先前完全沒有)；②地圖頁應該看到5顆「跳到○○」按鈕取代舊的2h/6h/12h；③跳到清晨後應該出現🍳準備早餐按鈕，點下去玩家應該移動到廚房、部分房客出現在廚房(視骰值而定)；④同一地點湊到4~5人時應該都能看到詳細卡片，不再只顯示3位；⑤solo模式完全不受影響(回歸測試)。

**訂正(同日追加)**：玩家看完上線內容後追加「準備早餐這個按鈕還要讓ai知道誰沒有來 在房間還是去哪裡 讓他自然敘述！」——④原本的★【早餐現況】提示詞寫的是「不必特別解釋原因，正常反映沒出現在早餐桌上即可」，等於叫AI**別提**缺席的人；玩家要的其實相反：AI應該**自然帶到**缺席者此刻的真實去向(還在房間賴床/已經出門去了哪裡)，只是不強制每次都詳細描寫。修法：`absentBreakfastNames_`裡每個人的描述從模糊標籤("(還在賴床)")改成帶實際地點的完整敘述("——還窩在○○房間裡賴床"/"——似乎一早就出門去了「地點名」")，GAS給事實，提示詞收尾語從「不必特別解釋原因」改成「narration可以自然帶出她們此刻的狀態…不必每次都詳細描寫，但內容不能跟這裡的事實矛盾」——事實由GAS給、演出深淺交給AI，符合show-don't-tell但不再是「完全不提」。同一輪順手確認：有下樓進廚房的房客不需要這段特別處理，她們LOC已經等於curL，自動透過既有【在場人物】機制被AI看到，跟一般在場角色無異。

## §93 換場地(aiData.location)禁止AI自創地名，鎖定KANSHOU_LOCATIONS_真實清單（2026-07・玩家問「現在npc有辦法移動嗎？他知道有哪些地點嗎？」→我解釋完在場同伴可跟AI敘事去任何自創地點、不在場同伴只能被GAS重骰進真實清單兩套機制後，玩家反問「不覺得哪裡怪怪嗎？有衝突？」→「感覺亂亂的... 讓她不能自創地點呢？？這應該是之前 要自由 簡單時期的用法 但現在想要加入橋段 就不能那麼自由了?」）

**背景**：玩家問「npc有辦法移動嗎」時我逐行讀`actionPlay`確認了一個真實存在的架構矛盾：跟玩家同地點的人，AI敘事換場地(`aiData.location`)完全不受`KANSHOU_LOCATIONS_`清單限制、可以自創地名(提示詞原文「不限於冬木既有地名，可自創如『一家安靜的咖啡廳』」)；但同一批人若不在玩家身邊，`kanshouRollDailyLocation_`只會從真實清單/haunts加權挑地點。兩套規則對同一個「LOC」欄位互相打架的後果：AI一旦把在場同伴的LOC寫成自創地名，她就變成一個地圖按鈕點不到、後續機制(門禁判定/橋段觸發/巧遇)也對不上的幽靈地點，只能等下次全域時間推進(結束一天/推進時間/打工/跳節慶/跳時段/準備早餐)把她重骰回真實池才會「被撈回來」。我原本建議「驗證但不禁止」(自創地名純敘事裝飾、不寫進LOC)，玩家聽完後直接拍板更徹底的做法：既然現在在蓋橋段(夜襲/賴床叫醒/肉償/準備早餐這些都靠「LOC是否等於某個真實地點」判斷)，「自由自創地名」這個更早期(尚未有橋段系統時)的設計就該收斂，location欄位乾脆完全鎖進真實清單，不再允許AI自創。

**①提示詞面**：`actionPlay`的prompt原本分散在兩處各自處理地點——★【換場地】允許自創、★【提議換地點需玩家同意】(`move_proposal`)則早就限定只能是`KANSHOU_LOCATIONS_.map(l => l.name).join('、')`這份清單之一。這次把清單enumeration提出來合併成單獨一句★【地點清單】(「這個世界目前只有以下這些地點存在：...——下方location／move_proposal兩個欄位只能填這份清單裡的名字，絕對禁止自創」)，後面★【換場地】/★【提議換地點需玩家同意】/★【玩家反向邀約】三句改成都引用「上方清單」，不再各自重複貼一次地點名稱——這份清單本來就已經為了`move_proposal`塞進提示詞，這次改法沒有增加額外token成本(仍是同一份、同一次)。

**②後端驗證面(防線二，比照sanitizeAiData_精神)**：`aiLoc`不再是`String(aiData.location||"").trim().slice(0,20)`拿到就直接信任寫入——新增`aiLocRaw && KANSHOU_LOCATIONS_.some(l => l.name === aiLocRaw)`驗證，AI若還是吐出清單外的自創地名(小模型偶爾不遵守指令是常態)，直接當作沒有這回事、`aiLoc`退回空字串，LOC維持原地不動，不會有任何人被寫進幽靈地點。跟`move_proposal`原本就有的`KANSHOU_LOCATIONS_.some(...)`驗證是同一種寫法、同一份清單，兩處判斷邏輯現在完全對稱。

**③未動的部分**：`kanshouRollDailyLocation_`(不在場同伴的日常去向骰)本來就只從真實清單/haunts挑，這次沒有改動；`KANSHOU_HOUSEMATE_ROOMS_`/`KANSHOU_HERO_HOME_`等既有地點對照表也沒有改動。solo完全不吃這個改動(整段prompt/驗證邏輯都在`actionPlay`內，函式入口早已擋非`KPC_`呼叫)。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs gas/Gallery.gs | grep -c nsfwBaseRules` = 0。部署後建議測試：①敘事中換地點應該只會落在真實地點名稱上，不再出現自創地名；②即使AI偶爾吐出清單外的地名，同伴LOC應該維持原地不受影響(可觀察是否曾經「消失」變得找不到人)；③既有的move_proposal/玩家反向邀約流程應維持正常運作。

## §94 大改版試做期間短暫回滾又回頭：跑條動畫＋鑑賞地圖大重做＋房間動態命名＋女性名冊全開（2026-07・玩家先請Claude把整個gas/清空、依民宿主題從零重寫成8檔精簡版kanshou v1，玩過後說「挖靠 你UI沒有依照原本的啊?...我要的是舊版那種」，最終定案「妳先合併 佈署吧」→發現main也已推進到大改版之前最新一版(`ece3328`)→玩家選「整個專案回到大改版之前的舊系統」，`git reset --hard`回到`8b337f1`(大改版前最後一版)、force-push覆蓋main與開發分支→接著在**這份舊系統**上追加這批新功能）

**背景**：這個session前段一度整個`gas/`清空重寫成獨立的8檔kanshou-only v1(民宿主題/ROOM-LOC分離/三分頁UI等，詳見那段時期新增的`CLAUDE.md`重寫記錄，該版CLAUDE.md內容已隨reset一併復原成舊版、不再代表現狀)，玩家實際上線體驗後認為UI跟原本熟悉的不一樣、要求整個復原成`8b337f1`。復原後，玩家把v1那批試做過、覺得不錯的幾個點子，逐一在**這份舊系統**上重新實作(不是搬移程式碼，是在舊架構基礎上重新設計，因為舊系統的地圖/房間/經濟層架構跟v1完全不同)。

**①跑條(進度條+輪播文字)動畫**：`Style.html`新增`.progress-wrap`/`.progress-bar`/`.fill`/`@keyframes progressSlide`/`.progress-caption`；`Script.html`的`send()`新增第19個參數`loaderCaptions`(沿用既有「一路加在最後」的呼叫慣例)，新增`showProgressLoader_`/`hideProgressLoader_`取代原本純聊天用的靜態`.loading-text`。套用在6個「時間會流逝」的動作：`kanshouEndDay`/`kanshouAdvanceHours`/`kanshouJumpBand`/`kanshouPrepBreakfast`/`kanshouWork`/`kanshouJumpFestival`(Script_Kanshou.html)，各自輪播符合情境的文字(如準備早餐："清點食材…／料理準備…／精心製作…／準備開飯！")，其餘即時互動動作(移動/聊天/巧遇)維持原本的靜態loading-text不變。

**②鑑賞開場預先放置全部女性英靈，但不是房客**：一開始只做「拿掉`starterIds`/`starterRows`那段預先建5位起始英靈(阿爾托莉雅/遠坂凜/伊莉雅絲菲爾/美狄亞/美杜莎)」，玩家看完後糾正「不放房客<<不放房客 你要幫我把這些女性角色先召喚到這個世界上阿...讓玩家自己去邀請房客」——釐清「不預先指派房間(不是房客)」跟「不存在於這個世界」是兩回事，玩家要的是**全部**女性英靈一開局就已經活在這個世界裡(各自散布在自己的日常地點，玩家走到那裡就能撞見認識)，但不預先幫她們指派客房——要不要邀她入住客房是玩家自己的選擇(走④的`actionKanshouAssignRoom`)。修法：`actionEnterKanshou`改成從`getHeroCodexCached()`篩出`SEX!=='男'`、排除`斯卡哈-Assassin`、排除`ai_gen`玩家原創的全部種子英靈，逐一用`heroToKanshouRow_`+`kanshouRollDailyLocation_`(骰她的初始日常位置)批次建列，`ROOM`留空(不是房客)、`BOND`/`REL_TAG`走一般泛泛之交起點(10/點頭之交)。**同一輪順手抓到的根因bug**：玩家追問「這些(英靈殿召喚/位階Saber/Caster/Rider等)AI會看到嗎?為啥大家對我很恭敬?我要當普通的民宿老闆」——查`partyDetailsArr`(actionPlay)的「身世:」欄位直接讀`COL.PC.BACK`，而`heroToKanshouRow_`裡`BACK`欄位在沒有`dailyBack`(全部種子只有4位手寫過)的英靈身上，舊保底寫法是`${RANK}・${name}`(如「Saber・阿爾托莉雅」)——這串職階字樣會原封不動餵進AI提示詞，AI讀到「Saber」自然會演出從者對御主的恭敬語氣，跟房東房客的民宿世界觀正面矛盾。修法：保底字串改成跟玩家自己預設身世同一種中性描述「借住在這裡的房客，過著平靜的日常生活」，不再帶任何職階/聖杯戰爭字眼。`COL.PC.RANK`本身不受影響(召喚清單瀏覽時仍會顯示職階當英靈識別輔助，那個純粹是召喚前的型錄用途、不會進到actionPlay的敘事提示詞)。

**③地圖大重做**：`KANSHOU_REGIONS_`從6區(家/深山町/冬木市中心/港口/山林/拜訪住處)改成`房間`(獨立分區，取代原本混在「家」裡的房間)/`家的共用空間`/`深山町`/`冬木市中心`/`山林`/`拜訪住處`，港口整區移除；家的共用房間從9間精簡到4間(客廳/廚房/浴室/庭院)，冬木市中心從5個精簡到4個(咖啡廳/書店二樓/屋頂花園/商店街，拿掉電影院附近)；拜訪住處只保留女性角色的住處(隱蔽的工房/島嶼道場/埃德費爾特宅邸/愛因茲貝倫城/遠坂邸/藤村家，男性住處條目全刪)。前端`Script_Kanshou.html`的`KC_REGIONS_`/`KC_LOCATIONS_`同步鏡射更新(唯一真實來源仍是`Gallery.gs`的`KANSHOU_REGIONS_`/`KANSHOU_LOCATIONS_`)。

**④房間動態命名(取代`KANSHOU_HOUSEMATE_ROOMS_`那套寫死3位特定英靈才有房間的舊設計)**：`COL.PC`尾端新增`ROOM`欄(35)，跟`LOC`分離——`LOC`是此刻位置(會因早餐/敘事暫時改變)，`ROOM`是持久的入住登記。房間分區改成`我的房間`(顯示名動態＝玩家名+「的房間」)＋`room1`~`room3`(3個自由客房，內部key固定不變，顯示名動態算：沒人住顯示「空房間N」、有人住顯示「入住者名+的房間」)。新增`kanshouRoomDisplayName_(locKey,pcData,gameId,myName,myIdx)`共用顯示邏輯、`actionKanshouAssignRoom`(新action，玩家指派任一位已建立的女性同伴入住空客房，同步寫`ROOM`+`LOC`，已被佔用的客房會擋掉)，`Router_Action.gs`掛上`kanshou_assign_room`。**連鎖修正**(所有原本依賴`KANSHOU_HOUSEMATE_ROOMS_`的地方全部改查`COL.PC.ROOM`)：`heroToKanshouRow_`拿掉`isHousemate`提前預判(房客身分不再是召喚當下就決定，統一用泛泛之交起點，等玩家之後真的指派房間才算入住)；`kanshouRollDailyLocation_`新增第3參數`room`(呼叫端直接傳該列自己的`COL.PC.ROOM`值，不再反查寫死表)；`kanshouCollectTenantRent_`(房租收繳)改成直接掃`pcData`找`ROOM`符合`room[1-3]`的列，不再靠`Object.keys(KANSHOU_HOUSEMATE_ROOMS_)`；夜襲/賴床叫醒橋段候選判定改成直接查`LOC`是否等於客房key(不必反查是誰的房間，任何入住者都適用)；準備早餐的房客骰去向迴圈同樣改成直接掃`ROOM`。前端新增`kcRoomLabel_`(跟後端同一套顯示邏輯，讀`_kcCur`的`room`欄位)＋房間分區的入住按鈕(`kanshouAssignRoom`)，`kcSwitchRegion_`切進房間分區時會先重新fetch一次`kanshou_companions`避免顯示過期的入住狀態。`actionKanshouCompanions`回傳的每筆companion新增`room`/`locLabel`欄位供前端使用。

**⑤女性名冊全開＋男性徹底清空**：`actionGetHeroes`(Router_Creation.gs)本來就回傳全部英靈庫、無戰爭/來源篩選，所以「把所有女性加入這個世界」不需要額外資料異動，只需要把召喚閘門開乾淨。`KANSHOU_LOCATION_TAGS_`(巧遇氛圍標籤)/`KANSHOU_ENCOUNTER_FEMALE_IDS_`(巧遇保底池)全面移除男性id，`KANSHOU_ENCOUNTER_MALE_IDS_`整個刪除(不再存在任何入口能巧遇到男性)；`actionKanshouSummonHero`新增`斯卡哈-Assassin`專屬擋下("暫時只開放召喚 Lancer 版本的斯卡哈")，同位英靈不會有兩種職階分身同時存在；前端`_kcHeroesAll`過濾條件同步補上`h.id !== '斯卡哈-Assassin'`。恩奇都(gender:'無')沿用舊系統既有precedent繼續歸在可召喚/可巧遇的一側(既有`KANSHOU_ENCOUNTER_FEMALE_IDS_`就已經這樣分類，這次不變動)。

**待玩家決定的開放項**：玩家提過一個問句「看看附近有沒有其他人這個按鈕可以召喚現存在世界的角色移動過來?」——查證後現有`kanshouLookAround()`/`kanshouRollEncounter_`的巧遇機制**只會**生出全新的陌生人巧遇、`excludeIds`明確排除掉此局已經召喚過的英靈(不會讓已建立好感記錄的角色又以陌生人身分重複登場)，目前沒有任何入口能把「已存在但目前不在身邊」的既有同伴直接呼叫過來(跟現有的`kanshouProposeMove`👋反向邀約方向相反，那個是玩家邀同伴一起去某地，不是把某人叫來玩家所在地)。這是一個新機制的提案，尚未實作，等玩家確認要不要做、要做成什麼形式(隨機挑一位/玩家指名/機率接受)再排入下一批。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs | grep -c nsfwBaseRules` = 0(Engine_Combat.gs這批完全沒有被觸碰)。部署後建議測試：①開場應該零房客；②早餐/推進時間/打工/跳時段/跳節慶應該看到跑條輪播文字而非純聊天式的瞬間loading；③地圖「房間」分頁應該顯示「(玩家名)的房間」+3間客房(空的顯示「空房間N」)，客房旁的🏠按鈕應該能指派已召喚的同伴入住、入住後房間顯示名稱應該變成她的名字；④英靈殿召喚清單應該只看得到女性(含恩奇都)，看不到斯卡哈-Assassin版本；⑤巧遇/推進時間重新分佈去向應該只會撞見女性；⑥solo模式完全不受影響(回歸測試)。

## §95 §94上線後玩家實測回報的一批修正：時鐘HUD／推進時間亂傳送同伴／入住UI改位置／低好感過度熟稔／MEMORY技巧欄污染／恩奇都與伊莉雅Caster移出／巧遇崩潰／紫色渲染（2026-07・玩家實際上線玩§94那批後陸續回報一串問題）

**①時鐘HUD不會動的假象(`d53956c`，已單獨commit)**：玩家「時間怪怪的 我在深夜按清晨 結果還是在第一天」——查證`rollHours_`本身day/hour運算完全正確，真正的根因是`actionPlay`的回傳JSON只塞了`kanshouClock`(地圖分頁邏輯用)，漏了共用前端`updateClock(data.clock,...)`實際拿來刷新`#clock-hud`文字的通用`clock`欄位——每次鑑賞動作後HUD其實被隱藏，造成「時間卡住」的錯覺。修法：`actionPlay`回傳補上`clock: kanshouClock ? kanshouClock.label : ""`。

**②推進時間/跳時段會把正在互動的同伴隨機傳送走**：玩家實例「我原本在他家 然後我調整時間 我敘述說要不要出去走走 對面答應就自己走了 我還在他家」——`actionPlay`的`allEstablishedForTime.forEach`(推進時間/跳時段分支)重骰**所有**已建立同伴的去向，沒有排除「此刻`LOC`跟玩家`curL`相同(正在同一場景)」的人，導致正在互動中的同伴被時間推進的重骰隨機傳走，玩家本人位置卻沒變。修法：filter加上`String(r[COL.PC.LOC]||"").trim() !== String(curL||"").trim()`，在場的人不重骰、原地不動，只有真正不在玩家身邊的人才照舊依時刻決定去向。`endDay`(結束一天)分支的`intimateNightNames`部分邏輯不同(那是刻意「一天結束大家各自回家睡」的語意)，這次沒有動它。

**③入住UI搬家**：玩家「按鈕指派她入住這好怪 改成在畫面左邊角色標籤那裡新增邀請入住」——原本掛在地圖「房間」分頁空房格上的入住按鈕(`prompt()`問要哪個名字)拿掉，改成`renderKcPartyList_`(角色列表)每一位還沒入住(`!/^room[1-3]$/.test(c.room)`)的同伴自己一顆「🏠邀請入住」，新函式`kanshouInviteMoveIn(name)`自動挑第一個空著的客房呼叫既有的`actionKanshouAssignRoom`(不必問玩家要哪一間，房號本身對玩家沒有意義)，客房滿了才跳alert提醒。房間分頁的地點列表恢復成跟其他地點一樣純瀏覽(📍走過去/👋提議同行)。

**④好感低卻演得很熟稔**：玩家「歸屬和位階會給AI看嗎...為啥好感度10大家還是很認識我的感覺???要當陌生人不是嗎」——查證`COL.PC.RANK`(職階)/`COL.PC.FACTION`(歸屬)本身不會進`partyDetailsArr`提示詞(只有`BACK`會，且早在§94就已把保底`BACK`改成中性描述，不含職階字樣)；真正缺的是`REL_TAG`5階梯度(點頭之交/普通朋友/熟識的朋友/親近的人/戀人)雖然數字正確，但字面本身沒告訴AI「這個階段該演出什麼熟悉程度」，AI容易自行預設熱絡口吻跟數字矛盾。修法：`partyDetailsArr`push那行新增`pTierToneStr`，只在低梯度(點頭之交/普通朋友)才加一句態度提示("彼此才剛認識不久，口吻應保持禮貌卻略帶生疏保留，不該表現得像已相識多年的熟人")，熟識的朋友以上不加、不畫蛇添足限制發揮。

**⑤MEMORY欄「雙修技巧」擷取regex是壞的，每回合外洩過期關係介紹句進提示詞**：玩家追問「【鑑賞後日談·初見】從英靈殿被召喚而來的相遇，緣分才剛開始。這是每次都會給AI嗎?會隨關係進度更新嗎?」——查證`nsfwMemories`組裝時`pSkills`/`npcSkills`舊寫法`(MEMORY||"無").replace(/\[雙修技巧\](.*?)(?=\| \[|$)/,...)`用半形「| [」當邊界，但MEMORY欄實際的標記分隔符是全形「｜」，導致：(a)只要這個人還沒觸發過`dynamic_skills`(沒有`[雙修技巧]`標記)，regex完全不匹配、`.replace()`原樣傳回，等於把**整格MEMORY**(含召喚時塞的關係介紹句、口吻、換裝、家居裝飾等所有其他標記)當成「技巧」字面塞進`[身體記憶]`/`[技巧]`欄餵給AI，且這段介紹句永遠不會更新(除非其他函式清掉它，但沒有函式會這麼做)；(b)即使已有`[雙修技巧]`標記，因為邊界抓錯，也會把該標記之後的所有內容一併吞入。修法：新增共用函式`kanshouSkillTagStr_(memory)`(跟`processSkills`一致的全形｜邊界擷取)，`pSkills`/`npcSkills`兩處呼叫點改用它(取前5個供提示詞用，完整清單仍存最多30個在MEMORY不受影響)。

**⑥伊莉雅(Caster)/恩奇都移出鑑賞**：玩家「伊莉雅絲菲爾·馮·愛因茲貝倫（Caster install）這也可以先移出 我不想要太多同名角色重複」＋「恩奇都...也不要進來吧?」——新增單一清單`KANSHOU_SUMMON_BLOCKED_IDS_ = ['斯卡哈-Assassin','伊莉雅-Caster','恩奇都-Lancer']`取代原本只擋斯卡哈-Assassin一個id的寫法，`actionKanshouSummonHero`召喚擋、`actionEnterKanshou`起始鋪墊過濾、前端`_kcHeroesAll`過濾(手動同步同一份id清單)三處都改吃這份清單；`KANSHOU_LOCATION_TAGS_`拔掉`書店二樓`(伊莉雅)/`廢棄神社`(恩奇都)兩個條目、`KANSHOU_ENCOUNTER_FEMALE_IDS_`跟`KANSHOU_HERO_HOME_`(伊莉雅那筆)一併拔除。種子資料本體(`Seed_Codex.gs`)不動，兩人仍存在種子庫，只是鑑賞全面關閉入口(跟斯卡哈-Assassin同等待遇)。§94原先寫「恩奇都繼續歸在可召喚一側」的結論已被這次玩家新決定推翻，此為更新後的現狀。

**⑦順手抓到的既有crash：`kanshouRollEncounter_`引用已刪除的`KANSHOU_ENCOUNTER_MALE_IDS_`**：§94「男性全部踢出」那批已經把`KANSHOU_ENCOUNTER_MALE_IDS_`整個刪除，但`kanshouRollEncounter_`的`basePool`保底邏輯忘了同步改，還在`.concat(KANSHOU_ENCOUNTER_FEMALE_IDS_)`前面接一個不存在的常數——只要巧遇擲骰查到「查無地點標籤」的位置(`tagPool.length`為0)就會丟`ReferenceError`直接炸掉整個巧遇流程。修法：`basePool`改成單純`tagPool.length ? tagPool : KANSHOU_ENCOUNTER_FEMALE_IDS_`。

**⑧非在場角色名字不再用紫色渲染**：玩家「非本地的角色 名子不要再用紫色渲染敘述了」——`Script.html`的`send()`原本對`localNPCs`裡`!isExact`(高好感牽掛、但目前不同地點)的人名包一層`<span style="color:#9C27B0;">`(紫色)，`isExact`(同地點)才是純文字；玩家反饋這樣「顯示不在場」的視覺標示很奇怪，改成不論在場與否一律純文字，不再用顏色區分這件事本身。

**⑨真正的根因：BACK保底字面本身就烤死「借住在這裡的房客」**：玩家看到身世欄位「借住在這裡的房客，過著平靜的日常生活」後追問「這個身世太怪了吧 難怪他們這麼熱情?」——查證`heroToKanshouRow_`召喚(=batch鋪墊)當下就把這句話寫死進`BACK`，但此時`ROOM`根本還是空的(不是房客，要玩家之後另外呼叫`actionKanshouAssignRoom`才算入住)，等於每個剛加入世界、玩家還沒認識、更沒邀請入住的陌生人，身世都被講成「已經同住的房客」，AI讀到自然演得像老相識——這比④的REL_TAG語氣提示更早、更直接命中問題根源。修法：靜態`BACK`保底字串改成不帶任何居住關係字面的中性描述(「生活在這座平行世界城鎮裡的英靈，與你尚無深交」)；「TA是不是房客」這個會隨玩家操作(`actionKanshouAssignRoom`)即時變動的狀態，改成在`partyDetailsArr`依當下`COL.PC.ROOM`動態判斷才補上(`pHousemateStr`，符合`/^room[1-3]$/`才講「TA是入住在你家、與你同住一個屋簷下的房客」，沒入住完全不提)。

**⑩男性召喚入口重新開放**：玩家釐清「邀請加入到世界可以開放所有角色不管性別」，經確認範圍是「整個召喚入口都重新對男性開放」(推翻§94「男性全部踢出、禁止召喚」的決定)——`actionKanshouSummonHero`拔掉`SEX==='男'`那道全面封鎖，前端`_kcHeroesAll`過濾條件同步拔掉`gender!=='男'`，改成明講擋`衛宮士郎-Master`(玩家自己的位置，繼續id特判)+`KANSHOU_SUMMON_BLOCKED_IDS_`(斯卡哈-Assassin/伊莉雅-Caster/恩奇都-Lancer，跟⑥同一份)。男性依然**不會**被`actionEnterKanshou`自動鋪墊進世界(那段過濾條件沒動，維持`SEX!=='男'`)——女性開局就活在世界裡，男性要玩家自己主動用召喚清單邀請。玩家原創(ai_gen)只有創造者本人可召喚的既有防線沒變、不需要額外修改。

**⑪商業地點的「當下在做什麼」輕量引子**：玩家「如果玩家移動過去 他們必須是要在打工或是消費活動這樣子...不然聊一聊會不會忘記他是在工作?」——確認要「只是敘事用的輕量標記」(而非完整的排班/工時系統)後，新增`KANSHOU_LOCATION_ACTIVITY_`(咖啡廳/深夜便利店=打工、商店街/書店二樓=購物/挑書)，`partyDetailsArr`依在場人物當下`curL`直接查表，有對到才加一句「現況:...」，沒對到(家/房間/自然景點/私人住處等)完全不加、AI自然發揮。刻意不做成持久MEMORY標記——每回合都直接依她當下真實LOC現查現算，本來就不會有「忘記」的問題，維持「單一真實來源」(LOC本身)不重複另存一份會跟LOC失去同步的狀態。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空(未觸碰)；grep確認`雙修技巧`/`kanshouSkillTagStr_`/`KANSHOU_SUMMON_BLOCKED_IDS_`/`KANSHOU_LOCATION_ACTIVITY_`皆只出現在`Gallery.gs`/`Script_Kanshou.html`，solo程式碼路徑(`Engine_Fate.gs`/`Router_Battle.gs`等)完全沒有引用，切割乾淨。部署後建議測試：①推進時間/跳時段時，正在對話的同伴應該留在原地不會消失；②角色列表應該看得到「🏠邀請入住」按鈕，點下去應自動找空房；③低好感(點頭之交/普通朋友)的NPC對話語氣應該偏保守生疏，不再像老朋友，身世也不會自稱房客；④英靈殿召喚清單看不到伊莉雅(Caster版)、恩奇都，但看得到男性選項(開局仍不會自動出現在世界裡)；⑤巧遇沒有標籤的地點(如「山林」深處)不應該再crash；⑥敘述文字裡提到不在場的人名應該是純白/預設色，不是紫色；⑦在咖啡廳/商店街等地找到的同伴，AI敘述應該自然帶到她在打工/購物，且整段對話不會忘記這件事。

## §96 SOLO/鑑賞「完全拆分」稽核＋全代碼庫冗長註解清理（2026-07・玩家「現在進行SOLO 鑑賞的 完全拆分!!! 除了共用的種子庫......檢查函數代碼 理解功能 更新所有說明書用不到的刪除 移除過多的註解!!! 建立工具書方便妳作業!」）

**背景與結論**：派5個並行agent稽核全部23個.gs/.html檔，摸清solo/鑑賞的實際耦合狀況。**關鍵結論**：資料層(Google Sheets分頁/game_id前綴)本來就分得很乾淨——solo用「眾生」表、鑑賞用「鑑賞眾生」表，`handleGameAction`依`pcId`開頭(`PC_`/`KPC_`)決定讀哪張表，兩軌的`pcData`陣列物理上不可能混到對方的活局資料；共用的只有「英靈殿」種子庫(唯讀範本)跟「歷史暫存」(共用表但每列標`pcId`、兩軌id namespace不重疊，查詢天生不會撈到對方)。真正不乾淨的是**函式放錯檔案**——GAS沒有模組系統，全代碼庫共用一個全域作用域，「拆分」實際上做不到技術隔離，只能是「函式歸屬清楚＋拔掉不必要的跨軌呼叫」。任何一次按鍵(不管哪一軌)都一定先過`handleGameAction`這個共用調度中樞(解析/洗資料/選表/上鎖)，這是刻意共用、不在拆分範圍內。

**①拔掉跨軌呼叫**：`Router_Movement.gs`的`actionMove`原本靠`isFateMove`分流呼叫`getKanshouPeopleList_`(Gallery.gs)，但鑑賞地圖早已改走`kanshouMoveTo`(送`action:'play'`)，前端沒有任何路徑還會送`action:'move'`——`Router_Action.gs`的`KANSHOU_BLOCKED_ACTIONS_`加上`move:1`明確擋死，`actionMove`回應也拔掉那段死分流。

**②函式搬回正確檔案**：`sanitizeAiData_`(鑑賞唯一呼叫點在`actionPlay`)從`Router_Action.gs`搬進`Gallery.gs`；`actionEndRun`/`purgeGameData_`/`findPlayerServant_`(其實是solo結束一局的清理邏輯，只是歷史上放錯在Gallery.gs)搬進`Account.gs`；`linkAccountToKanshouPc_`/`getAccountKanshouPcId_`(鑑賞帳號連結，COL.ACC.KPC)從`Account.gs`搬進`Gallery.gs`。

**③順手抓到並清掉的死碼**：`Style.html`整組舊「神識星圖」浮層CSS(`#map-visual-overlay`/`#map-canvas`/`.map-node-parent`/`.player-here`/`.map-label`/`.map-node-sub`/`.npc-badge`/`#map-info-card`，早被`buildMapSvg_`的SVG地圖取代、全代碼庫零引用)＋`.btn-act`(零引用)。**注意**：稽核agent一開始誤判`getGameHistory`(History_Sync.gs)是死碼，查證後發現它其實透過`google.script.run.withSuccessHandler(...).getGameHistory(...)`這種RPC直呼叫模式被`Script_Onboarding.html`/`Script_Kanshou.html`實際使用(不是走`ActionRouter`那套，才會被單純grep函式呼叫的方式漏掉)——**沒有刪**，這是agent報告要交叉驗證、不能照單全收的活教材。

**④全代碼庫冗長開發日記式註解清理**：CLAUDE.md「預設不寫註解，只在WHY不明顯時才加一句」的原則，這個session前段自己也違反了不少(每個修正都寫一大段「2026-07 玩家「逐字引用」定案：...」)。派3個並行agent分檔案清理(Gallery.gs／Script.html+Script_Kanshou.html+Script_Onboarding.html+Index.html+Style.html／其餘17個.gs檔，**Engine_Combat.gs全程排除不碰**)，原則：保留真正的技術WHY(隱藏限制/不變量/bug workaround)壓縮成1行，砍掉逐字引用玩家聊天記錄的多段式歷史敘事。事後我自己又補了一輪：刪掉3處「已經沒有任何上下文可對照、純粹浮在空白處」的墓碑式「已移除」註解(Script.html的舊九州多目標攻擊裁決/`dev_seed_gallery`、Script_Kanshou.html的`openGallery`/`enterGallery`)——這種跟仍在說明「為什麼現在長這樣」的「已移除」註解(如`chooseWar現在只會收到'4th'/'5th'`)不同，純歷史紀錄沒有指導價值，直接砍；後者則保留。

**⑤說明書修正**：`FUNCTION_MANUAL.md`/`AI_PROMPT_MAP.md`修正多處早已過期的內容(`KANSHOU_HOUSEMATE_ROOMS_`/`KANSHOU_ENCOUNTER_MALE_IDS_`早就不存在、地點/分區數量對不上)；`DESIGN.md`(這批之前唯一沒被2026-07更新波及的文件)修正：已砍的兩個唯讀視窗、`masterPoolMax_`公式(×6→×10)、被動燃血公式(缺口÷4→÷2)、鑑賞經濟層2026-07-13回復的事實。

**驗證**：每一批分別跑`bash check.sh`全過；每次`git diff --stat gas/Engine_Combat.gs`皆空。全程分批commit+push(共約10個commit)，每批都先驗證再commit，避免agent尚未完工時的半成品被誤判成最終態。

## §97 鑑賞輕量化：砍掉「推進N小時」死碼＋「宵禁提醒」機制（2026-07・玩家「鑑賞是不是還可以輕量化一點...我想要的橋段要保留!」→確認範圍後「這2個都砍!」）

**①`kanshouAdvanceHours`(推進N小時)**：查證後發現這顆函式在前端**已經沒有任何按鈕呼叫**——`kanshouJumpBand`(跳到時段)上線後取代了它的UX(玩家不必自己心算會落在哪個時段)，但舊函式忘了一起清掉。純刪除孤兒函式，後端共用的`advanceHours`管線(`isWork`/`jumpBand`/`jumpFestival`都走這條)完全不受影響——這幾條路線本來就是各自算好小時數後才餵進同一條管線，不是靠這顆函式才能運作。

**②宵禁提醒(晚上10點提醒回家/留在外面過夜)**：整組砍除——`Gallery.gs`的`kanshouCurfewDismissed_`/`kanshouDismissCurfew_`(MEMORY【宵禁已知會】標記get/set)、`actionPlay`裡的`curfewLocDef`/`isCurfewHome`/`curfewDismissedNow`/`curfewPrompt`計算、`dismissCurfew`旗標寫入分支、回應物件的`curfewPrompt`欄位；`Script_Kanshou.html`的`send()`裡渲染`curfewPrompt`按鈕的區塊、`kanshouGoHomeCurfew`/`kanshouStayOutCurfew`兩個函式。**沒動**：`send()`簽名跟`gasRun`payload裡的`dismissCurfew`參數位置刻意保留不刪——這是長串位置參數(18個)，砍掉中間一個要重新核對每個呼叫點的參數順序，風險遠大於留一個現在永遠不會被賦值為true的閒置參數，純函式殼留著無害。

**明確沒動的部分(玩家要求保留)**：`KANSHOU_SCENE_EVENTS_`(夜襲/賴床叫醒/肉償橋段庫)、`kanshouRollSceneBranch_`、`roomEventOffer`/`debtPaymentOffer`機制完全沒有touch，這是玩家特別點名要保留的核心橋段系統。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空；grep確認`KANSHOU_SCENE_EVENTS_`/夜襲/賴床叫醒/肉償相關字串在Gallery.gs跟Script_Kanshou.html都還在，橋段系統未受影響。部署後建議測試：①地圖分頁應該只看得到「跳到時段」，看不到自由選小時數的推進時間介面(本來就沒有按鈕，純後端死碼清除，UI應無變化)；②晚上10點不會再跳出「回家/留在外面過夜」提醒；③夜襲/賴床叫醒/肉償橋段應該完全正常運作不受影響。

## §98 鑑賞UI再精簡：「下一階段」合併按鈕＋節慶跳轉改成前一天早上（2026-07・玩家「UI按鈕太多、東西塞太滿吧... 是不是要精簡 直接用下一階段 不要讓玩家跳? 深夜在下一階段就是變成睡覺!?」，並釐清「節慶在+選單裡面先不要管」；後續一度討論「節慶+年月日是不是最大的阻礙」，玩家澄清「我就是想要跟大家過年阿... 春天去賞花阿 秋天看月亮阿」——確認節慶/曆法系統本身要保留，不是這次精簡對象）

**①「跳到時段(5選1)」＋「結束一天」合併成單一「下一階段」按鈕**：地圖頁原本並排兩塊UI——`KC_TIME_BANDS_`5顆時段按鈕(任選)＋一顆獨立的「🌙結束一天」，改成`Script.html`只渲染**一顆**「⏰下一階段」，onclick呼叫新函式`kanshouNextStage()`(Script_Kanshou.html)：讀`kcClock.band`判斷目前在哪個時段，若是「深夜」直接呼叫既有`kanshouEndDay()`(深夜按下去=睡過夜，整套房租/回房間/同床判定/敲門邏輯原封不動重用)；否則在`KC_TIME_BANDS_`(清晨→午後→黃昏→夜→深夜)裡找目前時段的下一格，呼叫既有`kanshouJumpBand(key,name)`。兩個底層函式都沒改，只是把「挑哪個」的自由度換成「固定往下一步」，UI從6顆按鈕縮成1顆。按鈕文字在深夜時額外顯示「(睡一晚)」提示。

**②節慶跳轉改成抵達「節慶前一天早上6點」**：玩家發現舊版`kanshouHoursUntilDate_`是算到「節慶當天0點」，问「現在跳到節慶是當天吧?我想要改成跳到前一天早上呢 明天才是節慶」——確認後修改：`targetDoy`減1(改成算到節慶前一天)，落點時刻從0點改成6點(比照結束一天/開局的「早上6點」慣例)，已經錯過(這個節慶的前一天6點已過)才跳下一年，邏輯結構跟原本「已過today就跳明年」保持一致。敘事文字同步從「${節慶}到了」改成「明天就是${節慶}了」，呼應「還有一天期待感」的體驗。

**明確沒動的部分**：`KANSHOU_FESTIVALS_`清單／年月日曆法系統(`kanshouAbsDayToDate_`/`kanshouDoyOffset_`/`KANSHOU_DAYS_IN_MONTH_`)本身完全保留——雖然一度討論「是不是最大的阻礙」，但玩家明確要保留「跟大家過各種節慶/賞花/賞月」的體驗，這次只精簡了UI按鈕數量跟到達時機的細節，沒有動搖曆法系統存在的必要性。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空。部署後建議測試：①地圖頁應該只看到一顆「下一階段」按鈕，不再有5選1的時段列；②在深夜按「下一階段」應該跟原本按「結束一天」行為一致(房租/回房間/敲門)；③從＋選單開節慶抽屜跳到任一節慶，應該落在節慶前一天早上、敘事說「明天就是XX了」而非「XX到了」。

## §99 修正鑑賞時鐘HUD真正的bug＋改顯示格式＋拿掉真實時鐘（2026-07・玩家實測「跳到節慶」後回報「第 1 日・06:00・清晨」看起來沒動＋「2026/07/14 16:23」這個真實時間是幹嘛的）

**背景**：玩家用「跳到節慶(聖誕節)」從第1天跳過去，直接扣了73500元維護費(49週×1500)——查證這是`kanshouChargeUpkeep_`「一次補扣所有跳過週數」的既有設計(CLAUDE.md本來就寫房租負值「無懲罰機制，純軟性」)，數字嚇人但不是crash。**這部分怎麼處理(設警告/設上限/維持現狀)玩家尚未選定，留待下次討論**，這次先處理玩家追問的兩個顯示問題。

**①真正抓到的bug：鑑賞時鐘HUD其實從未跟著actionPlay的回應刷新**。查證`send()`(Script_Kanshou.html)雖然每次都收到`data.clock`(上一批§94就已修過後端會回傳這個欄位)，但前端只拿它去更新`kcClock`(給地圖頁「下一階段」按鈕判斷用)跟重繪`renderMapPane()`，**從沒呼叫過`updateClock(data.clock,...)`去刷新頁面頂部那顆常駐的`#clock-hud`**——所以玩家看到的「第1日」其實是進場當下那唯一一次寫入後就再也沒被更新過的舊值，跟後端有沒有真的推進時間無關(後端內部`curDay`確實有正確推進，不然不會算出49週的維護費)。修法：`send()`收到`data.clock`時額外呼叫一次`updateClock(data.clock, null, null)`。

**②時鐘顯示格式從「第X日」改成「X年X月X日」**：`kanshouClockInfo_`(Gallery.gs)原本組label用抽象的「第 X 日」，玩家問「這要顯示幾年幾月幾號」——既然`kanshouAbsDayToDate_`本來就能把絕對天數換算成真實年月日(敘述文字本來就這樣用)，改成`kanshouClockInfo_`也呼叫同一支函式，讓HUD跟敘述文字統一都顯示「X年X月X日」，玩家能親眼確認日期真的走了多遠。

**③拿掉純裝飾的真實世界時鐘**：`Index.html`的`#header-clock`＋`Script.html`的`tickRealClock_`(純前端setInterval，每秒顯示真實年月日時分，跟遊戲內部時鐘完全無關)整組移除——玩家誤以為這是遊戲時鐘的一部分，造成「一個動一個不動」的混淆，砍掉後鑑賞頂列只剩地點跟金錢徽章。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空；grep確認`header-clock`/`tickRealClock_`全代碼庫零殘留引用。部署後建議測試：①任何會推進時間的鑑賞動作(跳時段/跳節慶/打工/下一階段)後，頂部`#clock-hud`應該即時顯示新的「X年X月X日・HH:00・時段」，不再停留在進場當下的舊值；②頂列不再出現跟遊戲無關的真實日期時間。

## §100 鑑賞經濟層＋房東房客世界觀砍除，夜襲/賴床叫醒改用「她自己原本就有的住處」觸發（2026-07・§99之後玩家連續回報一次-73500元的破產經驗，然後直接「我覺得取消民宿這垃圾想法吧!!!!!」→釐清範圍後定案「經濟層(錢/打工/房租/商店)—你說要砍　民宿房東房客的世界觀包裝—你說要砍　這兩個先砍吧」）

**背景**：§99處理完顯示問題後，玩家對「跳到節慶」一次扣49週維護費(73500元)的真實體驗感到崩潰，進而重新檢討整個「房東房客」世界觀是否值得保留。玩家情緒化地提出「取消民宿」，經釐清範圍(拆成①經濟層本身②房東房客世界觀包裝③日期曆法④邀請入住流程⑤地圖系統，並確認「還在想」的部分先不動)，最終明確拍板只砍①②兩項，③④⑤(日期/節慶/地圖/召喚)維持不動。

**發現的衝突與解法**：拆解房間系統前發現夜襲/賴床叫醒/肉償三個橋段全部靠「玩家LOC是不是等於某個客房(room1~3)」判斷候選人，不是只有肉償——直接砍掉客房會連帶打掉玩家之前明確要求保留的橋段。提出3個方案後，玩家選定「先改成用『她自己原本就有的住處』觸發」：候選人判定改成「這個地點是不是`KANSHOU_HERO_HOME_`裡登記的某位英靈的家、且真的有人LOC剛好在這裡」，`kanshouRollDailyLocation_`深夜/清晨的homeBias機率本來就會讓她回自己家(這行為早就存在，只是之前沒被夜襲/賴床叫醒的候選人判定利用)，不需要新寫任何內容即可讓橋段繼續觸發。肉償依存在「租金繳不出來」的前提，經濟層砍除後直接跟著整個移除。

**Gallery.gs 移除清單**：`KANSHOU_START_MONEY_`/`KANSHOU_WAGE_`/`KANSHOU_WORK_HOURS_`/`KANSHOU_UPKEEP_`/`KANSHOU_TENANT_RENT_`/`KANSHOU_TENANT_SHORT_CHANCE_`常數；`kanshouChargeUpkeep_`/`kanshouCollectTenantRent_`(維護費/房租扣款)；`KANSHOU_SHOP_ITEMS_`＋商店購買(`userData.buyItem`)分支；`KANSHOU_DECOR_TAG_`/`kanshouAddDecor_`(家居擺設)＋`myDecor`在【玩家命格】prompt裡的用法；`KANSHOU_RENT_DEBT_TAG_`(欠租旗標)；`actionKanshouAssignRoom`(入住客房)；`KANSHOU_HOUSEMATE_WANDER_CHANCE_`；早餐功能(`kanshouRollBreakfastSpot_`/`isBreakfast_`分支/`prepBreakfast`)；打工分支(`isWork`／`userData.work`＋`KANSHOU_WAGE_`發薪)；`userData.debtPayment`(肉償金流觸發)＋`KANSHOU_SCENE_EVENTS_`裡的`肉償`分支本身。`KANSHOU_LOCATIONS_`拿掉`room1`~`room3`，只留`我的房間`。`kanshouRoomDisplayName_`簡化成只認「我的房間」。`kanshouRollDailyLocation_`拿掉`room`參數(反正客房已不存在)。夜襲/賴床叫醒候選判定改查`Object.values(KANSHOU_HERO_HOME_).includes(curL或moveTarget)`。`actionKanshouCompanions`回傳不再帶`room`欄位。**保留不動**：`KANSHOU_KNOCK_CHANCE_`(敲門橋段，跟經濟無關)；`KANSHOU_LOCATION_ACTIVITY_`(咖啡廳/深夜便利店「正在打工」的NPC活動flavor文字——這是角色自己的日常，不是玩家的錢，跟房東房客世界觀無關，維持不變)。

**Core_Settings.gs**：`COL.PC.MONEY`/`UPKEEP_WEEK`/`ROOM`(33-35)三個欄位索引維持不刪(COL是位置索引，刪掉會讓後續欄位全部錯位)，但註解改標記為「死欄，恆空」；`buildPlayerStatusString`的§-string位置24(原本借給鑑賞金錢餘額用)恢復成solo/鑑賞都固定填空字串。

**前端(Script_Kanshou.html)**：`send()`函式簽名拿掉`work`/`buyItem`/`giftTarget`/`debtPayment`/`prepBreakfast`五個參數(連帶更新所有呼叫端的位置參數)；移除`kanshouInviteMoveIn`(邀請入住)、`kanshouWork`、`openKanshouShop`整組商店函式與`KC_SHOP_ITEMS_`鏡像、`kanshouOfferDebtPayment`、`kanshouPrepBreakfast`；`renderKcPartyList_`拿掉「🏠邀請入住」按鈕；`KC_LOCATIONS_`鏡像拿掉room1~3；`kcRoomLabel_`簡化成只認「我的房間」；`kcSwitchRegion_`拿掉切進房間分區時重fetch`_kcCur`的邏輯(房間顯示名稱已不依賴`_kcCur`)。

**前端(Script.html)**：`updateUI`拿掉`#header-money`金錢徽章的刷新邏輯；`renderMapPane`拿掉「🍳準備早餐」按鈕；`applyModeUI`拿掉`#drawer-job`/`#drawer-shop`的顯示切換。

**前端(Index.html)**：拿掉`#header-money`徽章span；拿掉`#drawer-job`(去打工)/`#drawer-shop`(商店)兩顆抽屜按鈕。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空；全代碼庫grep確認`KANSHOU_SHOP_ITEMS_`/`KANSHOU_DECOR_TAG_`/`KANSHOU_RENT_DEBT_TAG_`/`kanshouChargeUpkeep_`/`kanshouCollectTenantRent_`/`actionKanshouAssignRoom`/`debtPaymentOffer`/`room1~3`(當地點名稱用)等舊識別字零殘留(僅剩少數歷史說明性註解，已同步改寫成過去式或移除)。部署後建議測試：①夜襲(深夜走進某位在場英靈的`KANSHOU_HERO_HOME_`住處)、②賴床叫醒(清晨同樣走進)兩個橋段依然能正常觸發＋按鈕正常跳出；③地圖「家」分頁只剩「我的房間」，沒有殘留的空房間按鈕；④「+」抽屜不再有「去打工」「商店」；⑤頂列不再顯示金錢徽章。

**尚未處理(玩家明確擱置)**：日期/曆法/節慶系統、邀請入住(召喚)流程、地圖/地點系統——這三項玩家在討論中提過「也都先不要」但屬「還在想」狀態，本批次刻意不動，之後有進一步指示才處理。

## §101 鑑賞左側卡片空位改純顯示＋召喚入口移到頂部標題列（2026-07・玩家「原本同行 使在左邊有卡片 然後召喚角色 要用+再開召喚 所以當初是不想要開+就可以召喚」「可能當時沒說清楚 那3格就是要空著就好 這是拿來放同行角色的」「不然就是把召喚功能 坐在上面標題吧?? 不要再用+了」）

**釐清世界觀**：§91拿掉「隊伍」概念後，鑑賞左側卡片(`myServants`)其實不是玩家指派的固定隊伍，而是**即時查誰的LOC跟玩家目前LOC一樣**(`buildTagsPayload_`/Router_Action.gs)——同地點就自動出現卡片，人一走卡片就消失，是動態算出來的，不是「同行」這種持久狀態。原本卡片列表下方「剩餘空位(3-myServants.length)」的空格是可點的(`onclick="openCompanions()"`)，點下去直接開召喚/管理面板——這其實已經不需要先開「+」，但玩家沒發現，且這個設計把「空位視覺」跟「召喚入口」兩件事混在一起。

**改法**：①卡片下方的空位改成純顯示、不可點(拿掉`onclick`，文字改「（空位）」)，純粹表示「目前同地點還有位子」；②召喚/管理同伴的唯一常駐入口改到鑑賞頂部標題列(`#topbar-kanshou`)新增一顆「👥」按鈕，直接呼叫既有`openCompanions()`；③「+」抽屜原本的「👥後日談同伴」(`#drawer-companions`)整條移除(含`applyModeUI`裡對應的顯示切換)，不再是備用路徑——玩家明確要求「不要再用+了」。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空。部署後建議測試：①鑑賞頂列出現📍地點旁邊的👥鈕，點下去正常開召喚/管理面板；②左側卡片空位不再可點；③「+」抽屜不再有「後日談同伴」項目。

## §102 三顆小修補記（2026-07・玩家陸續回報：地點名帶時段字樣／請走鈕不禮貌／夜襲賴床邏輯確認）

三顆各自獨立的小修正，補記漏掉的文件：

**①地點「深夜便利店」改名「便利商店」**（玩家「還有這種類似的地點嗎...」問完後確認只有這一個）：地名不該綁死時段(玩家任何時候都可能走進來)，`KANSHOU_LOCATIONS_`/`KANSHOU_LOCATION_TAGS_`/`KANSHOU_LOCATION_ACTIVITY_`(皆Gallery.gs)＋前端`KC_LOCATIONS_`鏡像(Script_Kanshou.html)四處識別字同步改名。掃過其餘19個地點名，確認沒有其他地名把時段字樣寫死。

**②清掉失效的「請走」按鈕**（玩家「還有把請走放在左邊的卡片太不禮貌了吧XD」）：`Script.html`的`buildSvCard`鑑賞分支裡有顆呼叫`kanshouRemove(name)`的「請走」鈕——這支函式在§91拿掉隊伍概念時就已經被刪掉，殘留成一顆點下去必定報錯(`kanshouRemove is not defined`)的死鈕，不只不禮貌、根本是活的bug。整顆移除，只留「🏷️關係」。

**③修正鑑賞新建御主homeName預設值不一致**：新建御主存檔(`actionEnterKanshou`)回傳`homeName`寫死`"家"`，但之後每次讀取都經過`getKanshouHomeName_()`(預設值`"衛宮宅"`)——同一個「家」的預設值，第一次進場跟之後重整看到的不一樣，改成新建時也呼叫`getKanshouHomeName_(mRow[COL.PC.MEMORY])`統一成一個真實來源。順手清掉2處還提著已刪函式(`kanshouAdd`/`kanshouRemove`)/已砍動作(請走)的舊註解。

**④修正夜襲/賴床叫醒可能誤觸發在無關英靈身上**（玩家「再檢查邏輯 夜襲和起床 能成立嗎？是用甚麼方式觸發？」逐條追問後發現）：`kanshouRollDailyLocation_`幫沒有專屬住處/常去地點標籤的英靈隨機骰地點時，保底池只排除了`room`(玩家房間)，沒排除`visit`(別人登記的家)——結果像美杜莎、間桐櫻黑化這類角色有機率被隨機骰進「遠坂邸」「藤村家」，若玩家剛好在場，橋段候選人會變成不相干的人。保底池比照`room`的排除邏輯一併排除`visit`。

三顆都已個別`bash check.sh`全過、`git diff --stat gas/Engine_Combat.gs`空。

## §103 全鑑賞系統整體複查（2026-07・玩家「再確定一次吧....連續兩次沒問題才停止」→「我是說整體！檢查確認！直到毫無問題！」）

**背景**：連續修完好幾輪小bug後，玩家要求對整個鑑賞系統做一次徹底複查，不只是部署狀態，要「整體」都查到沒問題為止。

**部署狀態複查(2次獨立確認)**：`git log`確認local HEAD＝origin/main＝origin/分支，三者一致；`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空；GitHub Actions `get_job_logs`直接讀了deploy job的逐行log，確認`clasp push`真的推了25個檔(含這次改的Gallery.gs)、`clasp deploy`真的印出新版本號(不是空跑)，deployment id沒變(符合紅線④)，版本描述帶著這次commit的完整SHA；隔一段時間重新單獨查一次workflow run狀態，結果一致。

**三路子agent深度稽核**(橋段觸發邏輯／時間與狀態寫回流程／前端後端契約)，逐一驗證後修正的真bug：

1. **`Gallery.gs`：`actionPlay`查無御主列時回傳裸字串(`"查無此人"`)不是合法JSON**——前端`gasRun()`對回應無條件`JSON.parse`，裸字串會拋`SyntaxError`，被catch住變成通用的「連結斷絕，連線無回應」提示，蓋掉真正的錯誤原因。改成`JSON.stringify({text:"查無此人", people:[]})`，比照同函式其餘早返回的慣例格式。
2. **`Gallery.gs`：新世界開局的23位女性英靈`kanshouRollDailyLocation_`呼叫漏帶`hour`參數**，導致homeBias分支(唯一能讓英靈落在自己家的邏輯)整個被跳過，7位有登記住處的英靈第一天必定不在家(要等第一次結束一天/推進時間才有機會)，跟旁邊註解「各自落在自己原本的住處」的意圖不符。補上`hour: 6`(對齊御主自己Day1 06:00的開局時刻)。
3. **`Gallery.gs`：兩位英靈共用同一住處時，橋段候選人永遠只挑陣列裡排前面那位**——`KANSHOU_HERO_HOME_`裡小黑-Archer／伊莉雅絲菲爾-Master都登記「愛因茲貝倫城」，原本`findIndex`只回傳第一個符合的列索引，另一位就算真的在家也永遠沒機會被選中，等於某個角色配對被靜默剝奪了整整一種橋段內容。改成蒐集所有符合的候選人再隨機挑一位。
4. **`Gallery.gs`：`processSkills`(雙修技巧AI回填)沒有清洗`｜【】`等MEMORY標記邊界字元**，跟同檔案`setOutfit_`/`setWeapon_`已有的清洗邏輯不一致——AI提示詞裡滿是`【】｜`格式範例，理論上有機率被小模型幻覺帶進`dynamic_skills`欄位，汙染到MEMORY相鄰標記的邊界。補上跟既有寫法一致的字元清洗。
5. **`Script_Kanshou.html`：`send()`裡`data.justRevived`/`data.defeat`兩塊(含`handleDefeat`呼叫)是從solo那邊複製過來、鑑賞後端從未設定過的死碼**(鑑賞無戰鬥/無死亡機制)，整塊移除。連帶清掉`gasRun`payload裡後端從未讀取的3個死鍵：`combatData`(鑑賞恆傳null)、`lastContext`(鑑賞後端自己用`getGameHistoryBatchRaw`抓歷史，不吃這個)、`dismissCurfew`(§97砍宵禁機制後就沒人讀了)——**只動了payload物件內容，`send()`函式簽名/13個呼叫點的位置參數完全沒動**，避免重新數一次位置參數引入新的對位錯誤。

**確認沒問題、判斷不修的項目**(附風險評估，供之後參考)：
- `play` action豁免寫入鎖(`LOCK_EXEMPT_ACTIONS_`)＋AI呼叫前快照寫回，理論上兩個並發的`play`請求會互相覆蓋——但這是刻意的效能取捨(避免每次互動都卡在AI慢回應上，符合CLAUDE.md「3→1 round-trip」鐵則)，觸發需要同一帳號同時開兩個分頁/裝置操作，範圍窄，不動架構。
- `makeTextTag_`的正則字元排除класс沒排除`】`(其餘手寫的tag accessor都有排除)，目前無法建構出真的會出事的情境(所有實際塞進去的值都是純中文短字串)，且這是3個標記共用的通用工廠(含solo共用的`WORKSHOP_TAG_`/`SCAVENGE_TAG_`)，動它風險大於效益，先不動。
- `data.locations`欄位後端從未回傳，前端`nearbyLocations`恆為空陣列——但這個變數本身在全代碼庫都沒被拿去渲染任何東西，是遠早於這波鑑賞改動就存在的通案死變數，不屬於這次鑑賞churn範圍，先不動。

**CLAUDE.md同步更新**：核心訴求段落原本還寫著2026-07「Phase 1/Phase 2已實作」的商店/打工/房租描述，但這些在§100已經被玩家推翻整個砍除——CLAUDE.md沒跟著更新，會誤導下一個失憶的我以為經濟層還在。已改寫成反映「先恢復又推翻」的完整脈絡，指向SOLO_REFERENCE.md§100。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空。

## §104 鑑賞全系統第二輪擴大複查（2026-07・玩家「不光這些 要全體檢查」）

**背景**：§103做完橋段/時間/前後端契約三路稽核後，玩家要求擴大範圍，別只看那三塊。再開4路子agent覆蓋前一輪沒查到的範圍：AI回應解析/淨化管線、召喚/同伴/關係標籤5階進程/巧遇系統、反向邀約移動/敲門/歷史紀錄/日常人設快取、帳號設定類handler+CSS一致性。逐一驗證後修正：

1. **【真bug】儲存型XSS**：`History_Sync.gs`的`getGameHistory`把玩家自己打的訊息(`message`)跟鑑賞御主名(`pcName`)從「歷史暫存」表撈出來時，只做了`\n`→`<br>`轉換(取名「🛡️內容洗滌器」但其實完全沒洗HTML)，就直接塞回前端`story.innerHTML`——玩家在對話輸入框打`<img src=x onerror=...>`這類內容會被存下來，下次重新整理/重進遊戲時原樣執行。是自我XSS(只影響自己帳號/瀏覽器)，但確實可重現、會持續到被歷史列表trim掉為止，且違反專案「sanitizeUserData_是唯一真線」的自述原則(該函式沒把`message`/`pcName`列進清洗清單)。新增`escapeHtml_()`(GAS端)，`pcName`跟`content`輸出前都先跳脫；順手把`pcName`也補進`sanitizeUserData_`的`STRICT_NAME_FIELDS`(輸入端也擋)，並幫`actionKanshouSetName`補上跟`actionKanshouSetHomeName`一致的16字長度上限(原本只擋空字串)。
2. **【真bug】AI提議移動、玩家同意後，提議的同伴其實沒有真的一起走**：`move_proposal`(AI主動邀約，跟「玩家反向邀約」是兩條不同路徑)只記了地點字串，沒記是誰提議的；玩家按「同意」時前端只送`moveTarget`，跟一般點地圖移動完全無法區分——backend的moveTarget分支故意設計成「不強制拖走任何人」(獨立生活世界觀)，導致UI明明說「好，一起去」，提議者卻被留在舊地點、下一句就從敘事跟人物列表裡憑空消失。修法：新增`send()`最後一個參數`moveWithCompanion`(安全地加在簽名最尾端，不影響既有13個呼叫點的位置參數)，`kanshouConfirmMoveProposal`專屬傳`true`；backend在`moveTarget`分支【變動curL前】先記下當時同地點的人，`moveWithCompanion`為真時才把她們一起搬到新地點。
3. **【真bug】`rel_changes`/`intimacy_feedback.npcs`沒擋AI漏包陣列或塞null元素**：直接對可能不是陣列的值呼叫`.forEach`、或對`null`元素取屬性，會拋`TypeError`並被外層catch整段吞掉，導致那個回合的好感變化/敘事全部消失(玩家只看到「系統錯誤」)。補上`Array.isArray`檢查跟逐元素的`null`/型別防呆。
4. **【真bug】`intimacy_feedback.npcs`沒有自己排除**：`rel_changes`早就擋了「AI誤把玩家本名寫進清單」(`tNpc===pcName`)，但`npcs`那份清單沒有這道防線——NSFW雙向情境下AI偶爾真的會誤寫玩家本名，沒擋會把「NPC視角」的口吻/肉體狀態欄位寫進玩家自己那一列。補齊跟`rel_changes`一致的自己排除。
5. **【真bug】前端召喚清單沒濾性別**：`kcRecomputeAvailable_`只濾掉「已在場」跟「別人的原創英靈」，沒比照後端`actionKanshouSummonHero`的「僅支援男女／女女(不支援男男)」規則——男性御主會在清單看到一堆點下去必定被後端拒絕的男性英靈，白跑一趟召喚跑條動畫才收到失敗alert。補上前端鏡像過濾。
6. **【真bug】`aiData.options`是唯一沒經過`escapeHtml`就塞進`innerHTML`的AI自由文字欄位**：本檔其餘AI字串(`moveProposal`/`knockEvent`/`roomEventOffer.name`等)都有跳脫，只有選項按鈕文字沒有——AI輸出偶爾夾帶的引號/角括號有機率破壞按鈕屬性或注入標籤。補上`escapeHtml`(顯示用)+跳脫反斜線(onclick JS字串用)。
7. **【防呆強化，非AI可觸發但符合「邊界先擋」原則】** `COL.PC.PHYSICAL`欄位的`JSON.parse`在`actionPlay`裡有兩處完全沒有try/catch(同檔案讀同一欄位的`Core_Settings.gs`版本都有)，補齊防呆——目前這欄只會被`JSON.stringify`寫入所以理論上不會壞，但COL是位置索引，欄位一旦錯位這裡會讓該角色從此每回合都拋錯、永遠好不了。

**確認沒問題、判斷不修的項目**(附理由)：
- `move_proposal`場景之外，同名不同人(如兩位共用括號拆解後同名候選)的rel_changes/npcs寫入可能誤中前排的人——機率極低，且會需要更複雜的排歧義邏輯，先不動。
- 好感單回合變化：正向漲幅有梯度天花板(`kanshouRelChatCeiling_`)，負向沒有對應上限——可能是刻意設計(信任難建立、容易失去)，屬於遊戲平衡判斷而非明確bug，不擅自改。
- `actionBackfillKanshouAi`寫入序列中途若真的拋錯，已寫入的欄位不會回滾——機率極低(只有Sheets API瞬斷才會觸發)，效益/風險比不划算，先不動。
- REL_TAG手動自訂剛好撞名5個內建階級字串時會被自動進程覆蓋——這是`kanshouSyncRelTier_`自己註解明講的設計取捨(「清單外的自訂稱呼才受保護」)，不是bug。
- `makeTextTag_`括號排除不完整、`data.locations`死欄、`play` action鎖豁免的並發風險——前一輪(§103)已評估過，維持不動的理由不變。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空。

## §105 稽核範圍擴大到solo：創立御主／種子部署／工房捏新英靈（2026-07・玩家「從創立御主 拉去種子部署 還有新英靈建立 全部都確認一次 如果有問題 就再確認一次」）

**背景**：前兩輪(§103/§104)都聚焦鑑賞，玩家這次明確要求把solo的三個核心流程也查一遍：①`actionManualNpc`(御主創角)、②`actionSummonServant`(種子英靈拉進實際對局)＋`heroToKanshouRow_`(鑑賞版對照)、③`Router_Creation.gs`的工房捏新英靈(`parseForgeBuild_`/`recordOriginalHero_`/`actionSaveHero`)。3路子agent逐一深挖，找到並修正6個真bug：

1. **【真bug，影響全部20位種子從者】`looksToTraitParts_`把多段外貌合併回單一格時用「、」當連接符，但「、」正是`parseTraitsHelper`用來切分四格的分隔符**——合併後的外貌格內部只要有超過1段(如阿爾托莉雅的「金髮碧眼・甲冑藍裙的嬌小騎士、王者威儀」)，下游就會被多切出一格，導致[氣質舉止]/[自稱]/[私密一面]全部錯位一格、真正的第4格(私密一面)被截斷擠掉。實測20位種子從者100%中招，且`Seed_Rivals.gs`種敵御主從者也共用這支函式，等於solo幾乎每個角色的性格卡呈現都有位移。改用「・」重新合併(下游只切「、」，不會再拆開)。鑑賞沒中招是因為`heroToKanshouRow_`優先吃手寫的`DAILY_LOOK`欄位，只有查無時才會退回這支函式。
2. **【真bug，可被直打API利用】工房捏角的技能fx白名單用「truthy物件查詢」判斷合法性，但`ALLOWED_FX_`是純物件字面量，繼承自`Object.prototype`的鍵(`constructor`/`toString`/`valueOf`等)一樣會查到truthy**——送`fx:"constructor"`能通過白名單檢查，接著`FLAT_FX_["constructor"]`會查到`Object`建構子函式(非數字)，跟數字相加會被JS強制轉成字串，把整個`skillCost`/`total`污染成字串；`total > clsBudget`比較時字串轉數字變`NaN`，`NaN > 任何值`恆`false`——預算超支的擋檢查形同虛設。兩處(`sanitizeSkills_`／`parseForgeBuild_`)都改用`Object.prototype.hasOwnProperty.call`才是真的白名單命中。
3. **【真bug】`recordOriginalHero_`(寫入共用英靈殿的唯一入口)只查NAME查重、沒查ID查重**：部分種子英靈的id用去標點短名(如「庫丘林-Lancer」)跟自己的`realName`(「庫·丘林」)不同，玩家若指定那個短名當`trueName`，NAME比對不會撞，但組出的新id會跟種子id完全相同——下次`upgradeCodexPersonas_`版本升級時會依id覆寫，把玩家原創英靈整列蓋成種子資料。補上id層級的查重。
4. **【真bug】`trueName`(AI輔助召喚新從者時玩家指定的真名)沒被`sanitizeUserData_`的嚴格清洗清單納入**，只截長度不擋HTML斷字字元；AI可能把它原樣回填進`realName`，寫進共用英靈殿後在多處(`Script_Onboarding.html`原創英靈清單、`Script.html`從者卡片等)未跳脫就塞進`innerHTML`。補進`STRICT_NAME_FIELDS`(輸入端)，並在`recordOriginalHero_`(寫入端、唯一真實來源)也補一道字元清洗雙重防護。
5. **【真bug】`actionManualNpc`(solo御主創角)的願望/魔術/出身/體術/魔術階位等自由文字欄位，沒清洗MEMORY標記分隔字元(｜【】)就直接塞進標記字串**——跟鑑賞`processSkills`那次修的是同一類問題(這次是solo)。輕則玩家文字裡剛好帶的標點截斷自己的內容，重則可偽造後面的系統標記(如`【模式】`/`【戰爭】`/`【扮演】`，进而影響`seedRivalsForGame_`要不要排除某位正典御主)。補上跟`setOutfit_`同款的清洗。
6. **【真bug/防呆】`masterMaxHpMp_(circuits)`跟`rankVal`的+/-修飾字元都沒有下限/上限防呆**：負迴路可以生出0血/負魔力的御主；體術/魔術階位若被灌入"A+++++++"這類輸入，`rankVal`的+/-字元計數沒有上限，可以無限堆高戰鬥倍率。分別補上迴路下限跟+/-字元封頂3個。

**額外一個真但影響有限的資料安全問題，也一併修了**：工房編輯既有原創英靈時，若把職階切成「御主」(鑑賞限定純敘事款)，`parseForgeBuild_`會直接清空六圍/技能/寶具且不可逆，但原本存檔沒有任何警告——玩家不小心選錯職階存檔就會無聲蓋掉整套戰鬥數值。後端補上二次確認機制(`needConfirmMasterConvert`旗標)，前端接住後跳`confirm()`，玩家確認才會真的送出破壞性存檔。

**確認沒問題、判斷不修的項目**(附理由)：
- `save_hero`是lock豁免action(AI呼叫要秒)，兩個幾乎同時的重名建立請求理論上都能通過查重、都寫進表——機率極低(需要兩個請求剛好在同一個極短窗口用同一個真名)，不動架構。
- 未知`heroId`召喚時solo會靜默退回AI即時生成一個全新從者(跟鑑賞版明確回錯誤訊息不同)——這是既有行為差異，非崩潰/資料錯亂，且回應本身有`fromCodex`旗標(只是前端沒讀)，優先度低，先不動。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空。

## §106 全代碼庫最終複查：戰鬥核心引擎檔＋剩餘支援檔＋種子資料（2026-07・玩家「嗯....再全部確認一次 solo種子庫 鑑賞 新角色 ui 所有代碼是否有用到 是否有給ai 是否有死碼 請全部確認 如果問題 全部修正後 再查看其他沒看到過地方」）

**背景**：§103~§105三輪各自聚焦鑑賞／solo創角三部曲，這輪玩家要求對「還沒被前幾輪點名覆蓋到」的檔案做最後一次全面複查，且明確要求三件事都要查：死碼／是否真的有用到／是否有餵給AI。開了2路子agent分別覆蓋：①`Router_Battle.gs`等戰鬥核心引擎檔的死碼與機制一致性、②`Router_Narrative.gs`/`Router_Persona.gs`/`Time_World.gs`/`Mystic_Code.gs`/`Account.gs`/`Setup_FateWorld.gs`/`Seed_Rivals.gs`/`Seed_Codex.gs`等這學期還沒點名查過的剩餘檔案。逐一驗證後修正：

1. **【真bug，較嚴重】斬首戰術(暗殺御主)整條路徑完全繞過「十二試煉(God Hand)」免死機制**：`Router_Battle.gs`的斬首奇襲有大成功(直接斬殺護衛從者)跟失手反噬(護衛1.5倍反擊參與斬首的每名從者)兩支路徑，都是各自獨立寫的「HP≤0→直接標記DEAD」，唯獨沒有像`fateStrike_`／`enemyAmbushOnServant_`那樣先檢查`hasFx_(...,'god_hand')`——赫拉克勒斯這類擁有十二試煉的從者，只要被選中當護衛或參與斬首，一旦倒下就是真的死透，跟正規戰鬥/夜襲裡「倒下了卻又緩緩站起」的角色設定完全矛盾。比照`Router_Movement.gs:573-576`(`enemyAmbushOnServant_`)已驗證過的簡化版寫法，在兩條分支各自補上「HP≤0時先查god_hand剩餘次數，有→復活到20%血並扣一次，沒有才真的判死」，並同步調整戰報文字(大成功分支：護衛靠god_hand生還時改寫成「憑異於常理之力強行維繫靈基、未隨之消散」，而非照舊寫「隨之消散」)。
2. **【真bug】從者「演出依據卡」(`servantCard_`)的英靈殿(codex)備援路徑沒套用跟召喚寫列同一套的分隔符正規化**：`persona.words`(種子原始個性短句)用「・」分隔多段，但`quadLabeled_`只切「、」——備援路徑(`codexPersona_`查到值)直接把`p.words`原樣丟給`quadLabeled_`，多段個性會擠成一格、後面格數看起來像「無」；`persona.look`同理，還漏了`looksToTraitParts_`的4格轉換(自稱/私密一面兩格整個消失)。跟§105修的`looksToTraitParts_`本體bug是同一類「合併用的分隔符跟切分用的分隔符互相打架」，只是這次是消費端(`servantCard_`)沒套用轉換，不是轉換函式本身錯。這條路徑平常不會走到(召喚時已把speech/tic/moe複製進列上，只有舊局/AI原創從者/鑑賞封存重建缺任一項時才會查codex退回這支)，但一旦走到就是錯的。已修：`persona`比照`Router_Creation.gs`召喚時的寫法先把「・」轉「、」；`look`先過`looksToTraitParts_`轉成4格慣例格式再交給`quadLabeled_`。
3. **【真bug】`codexPersona_`真名比對不分職階，同真名跨職階的英靈會互相撞卡**：種子庫裡「斯卡哈」同時有Lancer跟Assassin兩版(不同人設/口吻/萌點)，`codexPersona_`原本只用真名子字串比對、找到第一個符合的就回傳——若兩版都在同一局被召喚出來，其中一版永遠拿到另一版的人設。改成`codexPersona_(name, cls)`可選帶職階，優先找「真名＋職階」都吻合的列，找不到才退回舊的純真名比對(不影響其他沒有跨職階撞名問題的呼叫情境)。`servantCard_`呼叫端補上原本就有讀出來的`cls`變數。
4. **【真bug】種子改版的職階遷移表(`SEED_RECLASSED_`)有一條懸空映射會悄悄打壞既有存檔的職階欄**：`貞德｜Ruler`→`貞德｜Archer`這條遷移規則，但目前種子庫裡「貞德」這個真名已經整個不存在了(來源跟去向都查無)——舊碼只檢查「查無舊key」就直接把RANK欄位改成新key，沒檢查「新key其實也查無種子資料」，導致任何舊存檔裡殘留的貞德(Ruler)英靈，職階欄會被悄悄改成「Archer」，卻因為新key一樣查無資料而跳過六圍/技能同步——職階講的是Archer、戰鬥數值卻還是原本Ruler那組，兩者對不上。改成先確認新key真的在種子庫裡解得到才動RANK欄。
5. **【真bug，資訊未傳達給AI】戰鬥中「戰鬥續行」(致命傷硬撐留1血)／「斬斷救贖」(此類護命效果被特殊寶具強行突破)這兩個機制旗標只寫進內部的`pFired`陣列，從沒進到餵給AI的`aiPrompt`文字**——十二試煉復活／令咒緊急脫離都各自有專屬素材行(`godNote`/`sealNote`)，唯獨這兩個一直是「有記錄但AI看不到」的資訊落差，AI敘述時完全不知道「這下明明該死卻沒死」或「原本免死的招式這次被打穿了」這種關鍵轉折，容易寫出跟系統結算矛盾的劇情(比如把撐住1血的角色寫死，或把真的死透的角色寫成又撐住了)。收攏這兩類旗標成一句「戰局關鍵轉折」素材行補進`aiPrompt`。
6. **代碼品質／死碼清理(非功能bug，符合CLAUDE.md「代碼查重」既定目標)**：
   - `Router_Battle.gs`三處空的`if(){}`/`else{}`區塊(`battery.usedBattery`／`skillBattery.usedBattery`／連續攻擊分支的`else`)——早年重構後留下的空殼，直接移除。
   - `Router_Movement.gs`的`enemyAmbushOnServant_`函式簽名裡的`userData`參數整個函式內從未被讀取——是名符其實的死參數，5個呼叫端(`Router_Bond.gs`×2／`Router_Economy.gs`×2／`Router_Movement.gs`×1)全部同步移除該位置參數。
   - `Account.gs`檔頭註解還提著「勝利歷史」——這個功能在更早的§(奪杯封存/排行榜清除那輪)就已經整個砍除，註解沒跟著更新，順手修正。
   - `Router_Battle.gs`(`getSoloReserve_`/`setSoloReserve_`)、`Time_World.gs`(`getManaDay_`/`stampManaDay_`)、`Router_Bond.gs`(`allyUntil_`/`setAllyMem_`/`clearAllyMem_`)三處各自手刻了一份跟`makeIntTag_`(Core_Settings.gs，MEMORY整數型標記的共用工廠)邏輯完全相同的get/set/clear——違反CLAUDE.md「助手成套、複用引擎機制不加特例」的既定工程準則，改成呼叫共用工廠的薄包裝(對外函式名/簽名完全不變，呼叫端零改動)。改前用Node.js單獨驗證過`makeIntTag_`在這三組情境下的get/set/clear行為跟原手刻版一致(含空值預設、多段MEMORY字串保留、標記已存在時的覆蓋)。

**確認沒問題、判斷不修的項目**(附理由，逐項評估過)：
- `actionAllyBond`(結盟共處)沒有像`actionBond`(從者相處)那樣的「今日已做過」冷卻標記——但`actionAllyBond`只有單一種互動類型(不像`actionBond`有多種`bondType`需要分別限流)，且跟`actionBond`一樣每次呼叫都要耗1點AP，AP本身就是每日有限資源、已提供天然節流，不像`actionBond`的冷卻是為了「同一天不要同類型互動被打好幾次」的敘事步調考量。判斷維持現狀不加冷卻，避免引入跟現有機制不對稱的額外限制。
- `actionMove`目的地驗證(`getMapDataCached`讀取失敗)包在`try{}catch(e){}`裡，若地圖資料讀取本身失敗(而非查無此地)，會整段跳過驗證直接放行——但這只在Sheets API本身出錯的極端情況才會觸發，機率遠低於一般查無此地的情境，且就算放行、後續也不会真的把玩家傳到一個地圖上不存在的座標(其餘依賴地圖資料的邏輯一樣會查無對應項)，維持現狀。
- 敵/客串英靈的`heroToNpcRow_`身世佔位字串(`"${cls} 職階英靈"`)沒被`servantCard_`的「無資訊量」過濾規則排除(該規則只認得玩家召喚時的另一種佔位格式)——純粹讓AI提示詞多看到一句沒有實質內容的身世描述，不影響正確性，優先度低，先不動。
- `actionRest`裡一段疑似「非FATE舊版」的休養分支，兩輪各自獨立的稽核(死碼掃描／核心引擎複查)都各自標記為「疑似死碼但無法排除仍有舊存檔資料在依賴」——沒有即時試算表存取權限可驗證是否真的零命中，維持現狀不動，等有機會核對實際試算表資料再處理。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空。

## §107 玩家追問「為啥那麼多漏洞」→核對兩個至今唯一還沒被點名查過的核心檔（2026-07）

**背景**：§106結束後玩家問「繼續檢查....為啥那麼多漏洞呢」。盤點整個gas/(23個.gs/.html檔)發現還有2個檔案這整晚從沒被任何一輪audit明確點名當主要對象：`Engine_Fate.gs`(真正的戰鬥數值引擎本體——`resolveFateBattle_`/`rowToCombatant_`/NP縮放/fx傷害防禦，跟被紅線鎖住的`Engine_Combat.gs`是完全不同的兩個檔案)、`Router_Economy.gs`(靈基出力/魔境/符文/換裝/補魔/靈基修復)。開2路子agent分別深挖，這次結果相對令人安心：

**`Engine_Fate.gs`(868行，全代碼庫實際上呼叫最頻繁的核心引擎)**：agent系統性檢查了這整晚抓到過的每一類漏洞模式(delimiter collision／prototype pollution／god_hand繞過／rank無上限／死碼)，結果**幾乎全部乾淨**——`rankVal`的+/-封頂在更早的稽核就已經修好(§105)、god_hand的實際判定邏輯根本不在這支檔案裡(正確地全部收斂在`Router_Battle.gs`的`fateStrike_`)、物件白名單查詢全部用`===`比對而非truthy查詢、沒有任何MEMORY字串的join操作、也沒有死碼。唯一挖到的一個真bug：

- **【真bug，防禦性修正】`rowToCombatant_`把HP/MP轉成combatant物件時，`hp: parseInt(...)||100`／`mp: parseInt(...)||50`跟全代碼庫其餘HP/MP讀取的`||0`慣例不一致**——0是合法值(重傷瀕死/魔力枯竭)，`||`對0視同假值的話，一個HP剛好=0的角色會被這裡誤讀回滿血100。目前追過所有呼叫點都會先濾掉`DEAD_`列或在HP被歸零前就轉換，沒有抓到真的會被玩家實際觸發的情境；但`resolveFateBattle_`內部確實直接拿`atk.hp/atk.hpMax`算自身血量百分比(供某些寶具/因果律分支判斷用)，一旦真的踩到HP=0這個邊界，會把「瀕死」誤判成「滿血」，判斷方向恰好可能讓某些本該觸發的效果不觸發。改成跟其餘讀取一致的`||0`(除法處已有`hpMax>0`防呆，不會產生除零)。

**`Router_Economy.gs`**：agent確認7支handler(出力/魔境/符文/換裝/自定武裝/補魔/靈基修復)的MEMORY分隔符處理、數值上下界、補魔的資源代價與防重入、鎖機制全部正確，**沒有抓到任何正確性/安全漏洞**。挖到的是4個效能問題，其中3個直接違反CLAUDE.md明訂的最高優先工程準則(「鐵則：別把多餘round-trip或重複整表讀回加回來」)：

1. **`actionManaSupply`/`actionSpiritRepair`收尾都呼叫`getFreshStatusString`強制整表重讀**，但呼叫當下`pcData[pIdx]`早就是本次寫入後的最新資料——這個優化(`buildPlayerStatusString(pcData[pIdx])`直接用記憶體現成資料)在`Router_Battle.gs`/`Router_Movement.gs`部分呼叫點其實已經做過(帶著`⚡ pcData 即權威，免 getFreshStatusString 的整表重讀`的註解)，只是沒有推廣到這兩支函式。兩處3個收尾點都改用現成的`pcData[pIdx]`。
2. **`actionManaSupply`的婉拒分支回`success:true`卻沒交棒`STATE_PRE_DATA_`**——`mana_supply`是`STATE_AFTER_ACTIONS`名單內的動作，dispatcher會在拿到`success:true`回應後嘗試夾帶`_state`，若`STATE_PRE_DATA_`是null就會整表重讀當備援；婉拒分支(好感不夠或魔力還沒見底時，大概率是常態觸發)每次都白繳一次整表讀取。補上`STATE_PRE_DATA_ = pcData`交棒(婉拒分支沒寫表，pcData本來就等於表上現況，交棒安全)。
3. **兩支函式都是「先整列寫入、再呼叫`spendAp_`」，導致同一列被寫兩次**——`spendAp_`預設會自己對AP/day/hour欄位做一次窄寫入，若呼叫順序反過來(先用`skipWrite=true`跑`spendAp_`只改記憶體、再一次過整列寫入)，兩處各自的整列寫入就能一併帶上最新的AP/day/hour，省掉`spendAp_`原本那道獨立窄寫入。兩支函式都已重排。

**確認沒問題、判斷不修的項目**：
- `actionSpiritRepair`「先查AP不足才查已經滿血」的檢查順序偶爾會讓已經滿血但AP恰好用完的情境顯示「行動力不足」而非「氣血已然充盈」——純訊息文字誤導、無任何狀態影響，優先度低，先不動。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空。至此全部23個.gs/.html檔皆已至少被一輪明確的adversarial audit覆蓋過。

## §108 御主體術/魔術參戰補上AI敘述（2026-07・玩家「有時候凜當敵人 她都手捏寶石不攻擊 很出戲」）

**背景**：玩家原本想把「接敵姿態」(隱蔽潛行/泰然如常/正大光明三段藥丸)重製成「並肩作戰/後方支援/伺機而動」、跟`§35`已上線的御主體術/魔術支援(`injectMasterMeleeSupport_`/`injectMasterMagicSupport_`)掛勾，來回討論出完整的三檔設計(輸出/風險%/好感，且魔術不再限Caster)。過程中玩家反映一個實際遊玩觀察：敵御主(如凜)當敵人時，戰報文字常把她寫成「捏著寶石卻不攻擊」，很出戲。

**查證後發現我先前答錯了一件事**：一開始以為敵御主的體術/魔術完全沒接戰鬥(依`§35`當時的舊註解)，後來重新讀代碼才發現**其實已經接上了**——`Router_Battle.gs`的`fateStrike_`守方分支(27-38行)、開場對轟(684-686行)、敵反擊(913-915行)都會`enemyMasterMemoryFor_`反查敵御主MEMORY、注入這兩個fx，敵御主的數值早就在悄悄加傷害，只是`§35`當時寫的註解沒跟著這次擴充更新，我照舊註解回答錯了資訊。

**真正的問題根因**：`master_melee`/`master_magic`發動時push進`fired[]`的「御主體術」/「御主魔術」標籤，只有前端戰報UI在讀(`〔發動〕`那行)，**從沒被塞進餵給AI的`aiPrompt`文字**——跟`§106`修的god_hand/戰鬥續行是同一種「有記錄沒講給AI聽」的落差，`§106`稽核時就標記過這兩個fx但選擇先跳過。AI完全不知道御主的數值加成何時發動，只能憑空編一個「捏著寶石不出手」的空氣動作，跟數字對不上。

**決定範圍**：玩家提三姿態的完整重製(風險%分擔傷害/戰後好感/Caster限制拿掉/MEMORY持久化setter/UI重新命名)暫緩，先只做兩件事：①我方(玩家)御主的體術/魔術發動時餵給AI、②敵御主同樣發動時也餵給AI——直接解決「凜捏寶石不出戲」的具體症狀，不需要幫敵人發明「預設姿態」(敵人不是玩家、沒有UI可選，本來就是固定開啟)。

**動手**：`Router_Battle.gs`在既有`extraFired`(§106補的戰鬥續行/斬斷救贖收攏)旁邊，新增四個布林值——`ourMeleeFired`/`ourMagicFired`(掃`rounds[].strikes[].pFired`)、`foeMeleeFired`/`foeMagicFired`(掃`rounds[].eFired`，這是敵方反擊獨立存在的陣列、不在`strikes[]`裡，得另外查一次，否則會漏掉敵方這一半)，各自比對`/·御主體術/`／`/·御主魔術/`。四個都各自對應一句`aiPrompt`素材行(我方體術/我方魔術/敵方體術/敵方魔術)，只在對應本場真的觸發過才附加。

**已知範圍限制**：開場「寶具對轟」(雙方互轟寶具的那個特殊分支)裡雙方也會注入體術/魔術支援，但那條路徑只取`.damage`數字、`.fired[]`從未保留下來——這次沒有為了這個較罕見的觸發情境(僅在`useNp && targetIsFoeServant`且雙方都選擇對轟時才會走到)去動整個`clash`物件的結構，維持只覆蓋一般每回合出擊/反擊(絕大多數交手都走這條)。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空。三姿態完整重製(風險%/好感/Caster限制/UI/MEMORY持久化)仍待玩家確認是否要繼續做。

## §109 鑑賞遊戲性擴充·第一批：橋段庫大擴充＋節慶橋段＋地點標籤補全（2026-07・玩家「都想要!!」）

**背景**：玩家問「鑑賞還有哪裡可以增加遊戲性」，我盤點後提了8個方向(橋段擴充/標籤補全/節慶內容/約定系統/天氣/紀念日/同居/吃醋)，玩家全要。確認過**不需要新的「同行」機制**——同地模型＋既有「一起移動」(move_proposal/玩家反向提議、`moveWithCompanion`)就是當日約會，所有新內容都掛在「她此刻在不在這個地點」上。分三批做，本節是第一批。

**①橋段觸發框架一般化(Gallery.gs actionPlay)**：原本觸發條件寫死「她的住處×深夜/清晨」(夜襲/賴床叫醒)。改成三層擇一(優先序由稀至常)：**①節慶**(日曆走到`KANSHOU_FESTIVALS_`當天×時段吻合，查`KANSHOU_FESTIVAL_EVENTS_`)→**②同住人房間**(原樣，`KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_`)→**③地點×時段**(新表`KANSHOU_LOCATION_EVENTS_`)。三層共用同一套候選人蒐集(目標地點上的同世界同伴隨機挑一)＋offer按鈕＋accept骰走向流程。加新橋段＝表裡加一筆，觸發邏輯零改動。

**②橋段庫 2→13 筆(`KANSHOU_SCENE_EVENTS_`)**：每筆新增4個演出欄位(`label`前端邀請語/`btn`按鈕字/`verb`提示詞動作前綴/`intent`玩家意圖句，`{n}`=真名佔位)，後端`roomEventOffer`帶`label`/`btn`下傳、前端(Script_Kanshou.html)照顯示**不再硬編各事件文字**(原本的夜襲/賴床ternary改成讀後端欄位＋保底fallback)。新增11筆：
- **地點橋段5筆**：共浴(浴室×夜/深夜)、溫泉同浴(隱藏溫泉×午後/黃昏/夜)、膝枕(客廳×午後)、下廚(廚房×黃昏)、觀星(屋頂花園×夜/深夜)。
- **節慶橋段6筆**：初詣(新年初一×清晨/午後)、情人節巧克力、七夕短冊、中秋賞月、聖誕約會、跨年倒數——各對應`KANSHOU_FESTIVALS_`的6個節慶。開局Day1=12/28，Day4跨年、Day5新年，玩家開局幾天內就會自然撞上前兩個。
每筆各3檔好感分支(高→低)，沿用`kanshouRollSceneBranch_`。晨間餘韻標記維持夜襲限定。

**③節慶氛圍提示詞修正**：原本`★【節慶氛圍】`只在「這回合剛按下跳到節慶」時出現且寫「今天是X」——但跳轉刻意落在節慶**前一天**(期待感設計)，字面自相矛盾；且自然玩到節慶當天(沒按跳轉)反而完全沒有氛圍提示。改成：日曆真的是節慶當天→「今天是X」；剛跳轉(落在前夕)→「明天就是X，街頭已有前夕的準備與期待感」。

**④地點標籤補全(`KANSHOU_LOCATION_TAGS_` 6→8地點)**：補上先前沒有常去地點的3位——美杜莎(書店二樓＋河邊小徑)、伊莉雅絲菲爾(社區公園，跟小黑同點)、間桐櫻黑化(廢棄神社)。至此10位女性英靈全員有跡可循，玩家可以「學習她的行程」去堵人。

**驗證**：`bash check.sh`全過；`git diff -- gas/Engine_Combat.gs | grep -c nsfwBaseRules`=0；Node模擬12個觸發情境全數命中(節慶日/時段不符退回地點橋段/她家深夜/浴室夜間/白天浴室null/非橋段地點null/情人節Day49換算)。

**待辦(第二批/第三批，玩家已全數要)**：約定系統(跟她約明天某地見，寫她隔日行程骰；赴約/爽約影響好感)、天氣(依月份骰、餵一行提示詞)、紀念日(初見/升階日期存MEMORY)、邀請同居(好感90+搬進home分區)、吃醋(兩位高好感同場的醋意走向)。

## §110 鑑賞遊戲性擴充·第二批：天氣＋相識紀念日＋約定系統（2026-07・接續§109）

**①今日天氣(純敘事·零寫入)**：`KANSHOU_WEATHER_BY_SEASON_`依月份分四季池(冬5款/春夏秋各4款)，`kanshouWeather_(absDay)`用日數確定性雜湊挑選——同一天恆同一個天氣、跨日自然換、同日內重問不變，不存表不吃round-trip。提示詞固定帶一行`★【今日天氣】`。開局12/28起步自然是冬天(小雪/寒風入景)。

**②相識紀念日**：`KANSHOU_FIRST_MET_DAY_TAG_`(=`makeIntTag_('初見日',0)`，存同伴列MEMORY)——在場同伴沒戳過的當下蓋戳(「同地即相識」，舊存檔首次相遇當天補戳起算)；已有戳的算相識天數，命中里程碑(`KANSHOU_ANNIV_MILESTONES_`=7/30/100/365天)且人在場→餵`★【紀念日】`提示(非強制、全天有效的氛圍線)。

**③約定系統(第一個真正「玩家決策→世界回應」的跨日迴圈)**：
- **發起**：鑑賞同伴卡新增「📅相約」鈕(Script.html，跟🏷️關係同排)→`kanshouPromiseMeet(name)`(Script_Kanshou.html，比照`kanshouEditRelTag`的prompt()輕量框)列出公開地點清單(排除玩家私室)選編號→`send()`新尾參`promiseMeet{name,loc}`(第16位，不動既有呼叫點)。
- **成立(Gallery.gs actionPlay)**：驗證她「此刻在場」＋地點合法→她列MEMORY蓋`【約定】明日absDay:地點`(`kanshouSetPromise_`，新約蓋舊約)＋`★【約定成立】`提示；她不在場→約不成立、餵`★【相約撲空】`。
- **赴約日行程釘住**：兩個行程重骰點(結束一天/推進時間，兩處`curDay`都已是新日期)都先查`kanshouPromisePin_(r, curDay)`——約定日她被釘在約定地點整天等，不再隨機骰；同床過夜(好感80+)優先序高於釘約。
- **結算(每回合掃全同伴列)**：約定日＋真的同地＝赴約→好感+5、清約、餵`★【依約相會】`；日期已過約還掛著＝爽約→好感−5、清約，她剛好在場才餵`★【爽約之後】`(不在場靜默結算)。同回合剛成立的約(day=明天)兩條件都不命中、不會自我觸發。

**驗證**：`bash check.sh`全過；Node驗證約定tag的get/set/clear/新約蓋舊約/pin三態(命中/未到日/過期)全部正確；天氣確定性(同日恆同/跨日變/季節換算/分佈均勻)驗證通過。

**剩餘待辦(第三批)**：邀請同居(好感90+搬進home分區，夜襲/賴床在自己家自然觸發)、吃醋(兩位高好感同場的醋意走向橋段)。→已完成，見§111。

## §111 鑑賞遊戲性擴充·第三批：邀請同居＋醋意暗流（2026-07・玩家定案同居規格「晚上大部分在家、也可以出去晃、要會回來睡覺、低機率在外遊蕩」）

**①邀請同居**：
- **新地點「和室」**(home分區·noEncounter，`KANSHOU_LOCATIONS_`＋前端`KC_LOCATIONS_`鏡像同步)＝同居人的寢間——不是復活「客房」的房東房客框架，是家的一部分，無任何金錢/租賃概念。
- **發起**：鑑賞同伴卡新增「🏠同居」鈕(Script.html)→`kanshouInviteCohabit(name)`(confirm確認)→`send()`第17尾參`cohabitInvite`。
- **成立(Gallery.gs actionPlay)**：她在場＋好感≥`KANSHOU_COHABIT_BOND_`(90)→她列MEMORY蓋`【同居】1`(`KANSHOU_COHABIT_TAG_`=makeIntTag_)＋`★【同居開始】`；好感未達→`★【同居·婉拒】`(依性格婉拒·零數值變動)；已同居再問→`★【已在同居】`吐槽線；不在場→撲空。
- **同居版行程骰**(`kanshouRollDailyLocation_`加第3參`cohabit`，兩個重骰點都帶`kanshouIsCohabit_(r)`)：深夜85%回「和室」就寢(15%在外遊蕩)、清晨50%還在和室賴床、夜間75%在家中公共空間(客廳/廚房/浴室/庭院/和室隨機)活動，白天照常走一般骰出門過自己的生活——完全按玩家口述規格：「不綁死、要會回來睡覺、低機率在外遊蕩」。
- **夜襲/賴床銜接**：橋段觸發層②擴充——「和室」跟各英靈自己的住處吃同一套深夜=夜襲/清晨=賴床叫醒橋段，同居後在自己家就能自然觸發(原本只能跑去她家)。優先序不變：同床過夜(好感80+)＞約定釘點＞同居版行程骰。

**②醋意暗流(輕量·非橋段)**：兩位以上好感≥60的同伴同場時，20%機率餵一行`★【醋意暗流·非強制】`提示——讓AI即興演出互相較勁/暗暗吃味的火花(依各自性格)，不骰走向、不加按鈕、點到為止。刻意做成氛圍線而非正式橋段：修羅場的樂趣在即興，寫死走向反而僵。

**驗證**：`bash check.sh`全過；Node模擬同居行程骰1000次×4時段，分佈全部符合規格(深夜83%和室/17%在外、清晨48/52、夜間75%在家、午後100%照常出門)。

**玩家三問的定案(同輪回覆)**：①所有橋段都看好感(每筆3檔走向由GAS依BOND骰定)；②約定相會當下即結清(+5)、之後跟平常同地相處一樣不綁死，可用「一起去」帶著走、分開後她下次時間推進回自己生活；③同居規格如上。

## §112 鑑賞世界觀詞彙清洗：AI提示詞不再洩漏 從者/御主/英靈/召喚/職階（2026-07・玩家「想要玩家跟他們是普通陌生人感覺 目前的標籤會吃到從者之類的嗎？」）

**盤點結論**：REL_TAG本身乾淨(預設「點頭之交」·5階自動升級·AI看到的是「TA是你的點頭之交」)，但**世界觀行洩得很兇**——AI每回合都被明講「她是從英靈殿被召喚來的從者、你是御主」，難怪演不出普通陌生人。

**清洗清單(全部AI-facing，Gallery.gs actionPlay)**：
1. 世界觀行「讓**從者**貼近其官方性格自然地與**御主**相處互動」→「讓每個角色貼近其原有性格自然地與**玩家**相處互動」。
2. KHV_同伴在場行「剛從**英靈殿被召喚**而來——這不是並肩打過聖杯戰爭的緣分」→「才剛在這座城鎮與玩家認識不久——這不是舊識重逢」。
3. 巧遇行洩職階：`『名字』（${cls}）`→拿掉職階；「TA還不是這個世界裡已經**召喚**存在的人物」→「TA目前只是萍水相逢的路人」。
4. 同伴BACK預設「生活在這座平行世界城鎮裡的**英靈**」→「生活在這座城鎮裡的普通身影」。
5. 在場驗證鐵律/背景人煙「已建立**英靈**」→「已認識人物」；「嚴禁憑空**召喚**」→「憑空登場」。
6. **「聖杯戰爭從未發生」三次重複合併成一次**(順便瘦身)：三個世界觀分支行全部改為中性描述，壓制句集中收進★世界觀一行——「即使你認得某個名字在其他作品裡的背景，也嚴禁提及聖杯戰爭、從者、御主、令咒、寶具、英靈、召喚等概念——那些事在這個世界從未存在，只可沿用其性格、外貌與人際氣質」。壓制句必須保留(正典角色名會誘發模型的Fate知識，需要明確防波堤)，但只講一次就夠。
7. UI側：同伴卡tag fallback `'從者'`→`'點頭之交'`(Script.html)；切換性別錯誤訊息「男性從者」→「男性同伴」。

**刻意保留**：萌點/背景生成規則裡的【禁】列舉(447/448行，本來就是壓制句)；建角生成器的【御主】欄位標籤(meta、不進對話敘事)；「命格」一詞(§644玩家已定案保留)；地點名「遠坂邸/愛因茲貝倫城」(普通居民框架下解讀成家族宅邸，無違和)；`nsfwBaseRules`(紅線①，一字未動)。

**同輪玩家其餘診斷問題的評估(未動手，待玩家定向)**：
- **太繁瑣/冗長？**：提示詞主要冗餘(世界觀三重複)本輪已合併；剩餘的「換場地/提議換地/反向邀約」三條★規則有部分重疊但各管一條真實路徑，先不動。
- **地圖太亂？**：22地點/6分區，分區分頁制下不算亂；visit分區(6個私宅)平時少用但支撐夜襲/堵人玩法，保留。
- **角色太多？**：開局10位女角全員入駐城鎮。如果要更「陌生人」的漸進感，可改成開局只入駐3~4位、其餘靠巧遇慢慢認識——屬設計取向，待玩家拍板。

**驗證**：`bash check.sh`全過；grep確認殘留的 從者/御主/英靈 字樣只剩壓制句與註解。

## §115 鑑賞地圖「房間」併進「家」＋家改名＋夜襲多人可挑（2026-07・玩家「房間和衛宮宅合併改名？之前分很多房間是想精準夜襲」＋追問「多人同居都塞和室？我可以挑夜襲誰？」）

**背景**：玩家發現「精準夜襲」不再靠玩家自家的房間細分(現在夜襲觸發看的是她自己的住處或同居和室×深夜/清晨)，於是「房間」獨立成一個地圖分頁失去意義。定案「併分頁·保留全部房間」。追問揭露同居機制的真缺口：多人同居深夜都回同一間「和室」，走進去系統**隨機挑一位**給夜襲、玩家選不了誰。

**①「房間」分頁併進「家」(前端顯示層)**：`KC_REGIONS_` 移除 `room` 分頁項；`KC_LOCATIONS_`「我的房間」region `room`→`home`(顯示掛家分頁)但保留 `isRoom:true`。**前後端各司其職**：後端 `KANSHOU_LOCATIONS_`「我的房間」region 仍 `room`(純語意·別人不骰進來/相約排除)，前端region純顯示、地點名一致即可。相約排除改用 `!l.isRoom`(原 `l.region!=='room'`)。加防呆：`kcActiveRegion_` 若存著已移除的 `room` 退回 `home`。分頁6→5。

**②家改名 衛宮宅→我家**：`getKanshouHomeName_`/`setKanshouHomeName_` 預設值「衛宮宅」→「我家」(中性·自創御主通用，玩家仍可自訂)。`Setup_FateWorld.gs` solo地圖的「衛宮宅」正典地名不動(那是solo戰爭世界)。

**③夜襲多人可挑(核心·回應玩家三問)**：`kanshouRoomEventCandidate_` 從「隨機挑一位」改成蒐集該地點**所有**在場同伴 `matches:[{name,idx}]`。`roomEventOffer` 帶 `candidates`(名字陣列)+`labelTpl`(帶{n})+`btn`。前端：單人→一顆按鈕(同以前)；**多人→抬頭「此刻這裡不只一個人——想靠近誰？」＋每人一顆「靠近『○○』」按鈕**，玩家點名要靠近誰。accept驗證從「只比對隨機那位」改成「name命中matches任一位才成立」(假名直打API擋掉)，用命中那位的idx演出。多人同居擠和室的敘事由AI處理(partyDetailsArr本就列全在場者)，橋段只點名被靠近的那位、其餘當背景。三問定案：塞和室不是問題(可精準挑)、能挑夜襲誰(可)、深夜大家在和室睡·夜襲=靠近熟睡/半醒的她(好感3檔)。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空；Node模擬選人(挑指定/假名擋/單人)全對。

## §116 鑑賞牽手系統(單獨約會·B方案：優先但不獨佔)（2026-07・玩家「沒同行系統了？約會只能一次帶全部同地人？帶3人回房睡會3P？要新增牽手？」）

**背景**：玩家發現「一起移動」現在是帶當時同地全部人(moveWithCompanion)、結束一天睡覺是好感80+且在你房間的全部人同床——想單獨跟某人約會/過夜辦不到(3人好感80+回房=3P)。玩家提議「牽手」，選定**B方案(優先但不獨佔)**：牽的人移動一定跟，但睡覺仍看好感80+全部。

**機制**：`KANSHOU_HANDHOLD_TAG_`(=`makeTextTag_('牽手')`·存玩家列·單一對象)。
- **牽手/放手(play的handHold分支)**：`handHold=name`→她此刻在場才牽得成、蓋標記＋演出被牽手反應；`handHold='__release__'`→清標記＋放手演出；不在場→撲空。
- **移動帶人三態(`kanshouPreMoveCompanions_`重寫)**：①同意AI提議一起去(moveWithCompanion)→帶當時同地全部；②否則有牽手對象且她此刻同地→**只帶她**(牽手優先跟隨)；③否則只帶自己。
- **睡覺不變(B方案核心)**：結束一天`intimateNightNames`仍是好感80+且在你房間的全部人——牽手不獨佔過夜。
- **常駐氛圍**：牽的對象此刻真的同地在場→提示`★【牽手中】`(交握溫度/並肩距離·其他在場者看得見)；被時間推進骰走就不提。剛牽/放手當回合走`kanshouHandHoldStr`專屬演出、不重複掛常駐條。
- **同伴卡**：`buildTagsPayload_`每位從者加`held`欄(鑑賞限定·比對牽手名)；前端(Script.html)卡片「📅相約」旁依`s.held`顯示「🤝牽手」或「✋放手」鈕。`send()`加第22尾參`handHold`。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空；Node模擬牽手(在場才牽/移動只帶牽手/她走開就只帶自己/AI提議帶全部/沒牽手只帶自己)全對。

## §117 鑑賞提議改「意圖非結果」：相約/牽手成敗交由AI依個性＋好感判定（2026-07・玩家「我的提議為啥很容易通過？」→選B「交還給AI判定，跟橋段一致」）

**背景**：玩家發現四種提議裡只有🏠同居有好感門檻(bond≥90否則婉拒)，📅相約/🤝牽手**沒門檻**——只要她在場就一定成立，且提示詞寫死「演出她答應」，跟自訂的慾海律令第1條「意圖非結果，NPC依個性與好感可抗拒」矛盾。玩家選**B方案**：不加硬門檻，改交AI依個性＋好感決定成不成(跟橋段的bond分支同精神)。

**根源修法(非疊補丁)**：相約/牽手原本在**按下當回合(pre-AI)就寫MEMORY tag**、提示詞逼AI演成功。改成**延後落地**——
- **pre-AI**：只記`_pendingProposal`(`{type:'promise'|'hold', idx, loc?/name?}`)，**不動MEMORY**；提示詞片段(`kanshouPromiseStr`/`kanshouHandHoldStr`)改成`★【提議·相約/牽手(成不成由你依她個性與好感決定)】`＋帶入她的當前好感數值＋分好感給演出傾向(高→答應/中→半推半就/低或矜持→可婉拒)，要AI在`proposal_accept`欄回填「接受」或「婉拒」。`finalUserMsg`改「提出/伸手想牽」(未遂時態)。
- **schema**：新增`proposal_accept`欄(僅提議回合有意義，無提議留空)；`sanitizeAiData_`原樣放行(只clamp rel_changes)。
- **post-AI**：讀`aiData.proposal_accept`，**fail-closed**判定(`/接受|答應|同意|願意/`且非`/拒|不接受|不肯|不願|沒(有)?接受|未接受/`；空字串/模稜→視為未答應)，接受才寫`kanshouSetPromise_`/`KANSHOU_HANDHOLD_TAG_.set`＋`dirtyPcRows`。
- 撲空(她不在場)分支不變——那是硬失敗、無須AI判定。🏠同居維持原本GAS硬門檻(bond≥90)不改，本次只動無門檻的相約/牽手。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空；Node模擬`proposal_accept`判定16例(接受/婉拒/空/她欣然接受了/半推半就地接受/不接受/不願意/沒有接受/維持現狀…)全對，含負向詞fail-closed。

## §118 鑑賞同伴自主離場 npc_exit：AI 可真的讓在場同伴走人（＋被牽者離場自動鬆手）（2026-07・玩家「也可以做到她獨自離開吧…如果她要離開就讓她自己離開？牽手呢AI可以放手?!」）

**背景**：§117 收尾時指出舊違和——AI 敘事「她先回家了」但**位置沒被改**，下回合她照樣還在場(獨立住民模型下沒有讓單一 NPC 獨自離場的機制，只有你移動/推進時間會動她位置)。玩家要求給 AI 真正的離場手段。

**機制(新 schema 欄 `npc_exit`)**：
- **schema**：`npc_exit` = 真名陣列，AI 判斷某在場同伴自然告辭時填入(可多位)，情境自然才用、不必每回合遣散。`sanitizeAiData_` 原樣放行。
- **post-AI 處理**(在 `_pendingProposal` 落地之後)：對每個名字，只認**此刻同地在場**(`LOC===curL`)的從者(防 AI 點名不在場者)；用 `kanshouRollDailyLocation_(名, curHour, cohabit)` 骰她的日常去向寫回 LOC＋`dirtyPcRows`。**去向保底**：骰回原地(=curL)就改去她的登記住處(`KANSHOU_HERO_HOME_`)、再不然全池挑第一個非 room/visit 且非原地的公開地點，**確保她真的離開**。
- **牽手連動(回答玩家「AI 可以放手?」)**：離場者若正是被牽的人(比對玩家列 `KANSHOU_HANDHOLD_TAG_` 現值)→**清空牽手 tag**(不能牽著已離場的人)。非被牽者離場不影響牽手。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空；Node模擬6例(被牽者離場→LOC變＋鬆手/點名不在場者→無效/骰回原地→改去登記住處/無住處骰回原地→挑非原地公開地/非被牽者離場→牽手不動/空陣列→無異動)全對。

## §113 鑑賞陌生人世界·開局4住民＋巧遇結識入駐＋間桐櫻改名（2026-07・玩家定案「大河凜櫻SABER開局、第一次巧遇就可邀、召喚面板先保留」）

**①開局只入駐4位起始住民**：`KANSHOU_STARTER_IDS_`=大河/凜/櫻(間桐櫻黑化-Master)/阿爾托莉雅——「本來就住這座城」感最強的4位。其餘6位女角**不建列、不存在於世界**，之後靠巧遇結識才入駐。只影響新世界；既有存檔(10人全入駐)不受影響。召喚面板保留原樣(全名單直接召喚的快捷後門，玩家定案)。

**②巧遇→結識→入駐流程**：巧遇對象本來就只是路人(【邂逅中】tag·不記好感·離開即散)。新增：巧遇存在時回應帶`encounterOffer{name}`→前端跳「🤝要交換聯絡方式、深交下去嗎？」邀請框(比照橋段offer樣式)→點「結識她」→`send()`第18尾參`inviteResident`→後端驗證**必須真的是【邂逅中】那位**(防直打API憑空加人)＋未入駐＋非男男→`heroToKanshouRow_`建列(當場地點·當日)、`pcData.push`本回合就地生效(馬上拿到完整在場卡片)、清【邂逅中】、餵`★【正式結識】`提示。緣分沒接上(已離開/已相識)→`★【結識未成】`。起始好感/關係走`heroToKanshouRow_`既有低值(點頭之交)，貼「才剛認識」。

**③間桐櫻改名**：`realName`「間桐櫻（黑化）」→「間桐櫻」(玩家「名字很怪，內容是黑化但她會盡量維持日常」)——**id不動**(`間桐櫻黑化-Master`/`間桐櫻(黑化)-5th`被三張表＋rivals roster引用，只改顯示名)，SEED_SERVANTS(鑑賞)＋SEED_MASTERS(solo敵御主)兩處同步改。人設一字未動(黑化內容保留；日常版本來就寫成「表面溫順的小惡魔、佔有慾轉化成撒嬌」，正是要的感覺)。`CODEX_PERSONA_VER` v60→v61觸發既有試算表的英靈殿/御主殿自動刷新新名字；舊存檔已建列的名字不追改(名字候選比對能容忍括號差異)。

**④住處問題定案(同輪玩家問「住的地方要統一嗎」)**：不統一——沒登記住處的人(含全部男性)深夜骰回「自己的住處」(不可造訪的泛用值)＝回家就隱形，天亮再出現，維持現狀。哈桑疑慮也確認：23位種子全有手寫日常版(§35)、哈桑日常版已日常化(骷髏面具的低調神祕身影)，且男性不在女性巧遇池、只有玩家主動從面板召喚才會出現。

**⑤種子日常欄位全量體檢(玩家「種子夠日常嗎 標籤欄位都正確??」)**：Node腳本掃全部25位種子的`dailyLook`/`dailyWords`/`dailyMoe`/`dailyOutfit`——①欄位齊全度：全員4欄俱全；②結構(「、」切4段)：抓到**2個真錯**——士郎/大河的`dailyLook`只有3段(第4段「私密一面」被全形逗號黏進第3段)，會讓`dailySpeechByName_`(要求≥4段)抽口吻失敗、`heroToKanshouRow_`退回舊拆法造成特徵欄錯位——已改用「、」正確切開(搭本批v61版本刷新一起生效)；③戰爭詞洩漏：0件(聖杯/從者/御主/寶具/魔術/暗殺等全查無)；④軟性詞(王者風範/騎士般謙恭/工房木屑)為氣質描述、不洩機制，保留；⑤赫拉克勒斯/蘭斯洛特第3段刻意寫「話極少・點頭回應」而非「自稱」慣例＝寡言角色的正當處理，非錯誤。順手把`heroToKanshouRow_`的MEMORY初見標記「從英靈殿被召喚而來的相遇」改成「在這座城裡剛結識的緣分」(陌生人世界觀一致化)。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空；Node複掃25位dailyLook全部4段。

**⑥地點活動表擴充＋帶人誤標修正(玩家「去點NPC所在地 他們會進行打工、活動、消費的橋段?」)**：`KANSHOU_LOCATION_ACTIVITY_` 4→12地點(補河邊散步慢跑/神社參拜打掃/公園餵鴿/屋頂眺望/道場晨練/山道健行/溫泉泡湯/廢棄神社出神；家分區/私宅刻意不加——在別人家或自己家AI自然發揮即可)。同時修真bug：活動提示只看地點不看她怎麼來的——這回合剛跟玩家「一起移動」過來的同伴(`kanshouPreMoveCompanions_`)會被誤標「正在這裡打工」，補上排除。金錢壓力確認：零(經濟層已全移除，打工/消費全是敘事佈景、無任何數值)。

## §114 鑑賞相簿系統📷（2026-07・玩家定案：A案色卡寶麗來/每日3張底片/隔天沖洗/親密可拍/上限100張/人物分類）

**背景**：玩家提起老遊戲《フォトジェニック》(攝影師拍美少女日常參賽)，想要拍照＋相簿玩法。視覺經三輪樣品討論定案**A案色卡寶麗來**——不畫人、不假裝是照片(程序生成的人像每張都長一樣·會膩)，卡面＝「時段色調漸層×天氣覆疊(雪點/雨絲)×右上角髮色緞帶」，每張真正不一樣的是AI寫的小敘述。人物分類全自動(按拍到的名字分頁＋髮色圓點)，工房新角色零手工(髮色從TRAIT文字現場解析)。

**後端(Gallery.gs)**：
- **儲存**：新分頁「相簿」(lazy建表`kanshouAlbumSheet_`)，位置索引：0遊戲ID/1照片ID/2拍攝日/3時段/4地點/5天氣/6人物/7活動/8小敘述/9旗標(親密·節慶名)/10髮色hex。
- **底片**：`【底片】day:used`存玩家MEMORY(`kanshouFilmUsed_`/`kanshouFilmStamp_`)——day不符=新的一天自動歸零，免排程。每日`KANSHOU_FILM_PER_DAY_`=3張。
- **髮色解析**：`kanshouHairHex_`＋`KANSHOU_HAIR_COLORS_`(16色詞→hex·順序敏感:深紫在紫前/紅褐在紅褐前)，從第一位被拍者TRAIT文字抓，查無退中性深棕——種子/工房新角色通吃。
- **拍照(play的takePhoto分支)**：pre-AI驗四關(有人在場/底片沒用完/相簿沒滿100)，通過→`★【拍照】`提示(被拍者依性格好感演反應)＋要求AI回應JSON多吐`photo_caption`(30~60字第一人稱小敘述·同一次呼叫零額外round-trip)；**post-AI才落地**(耗底片+appendRow相簿)——AI失敗不浪費底片。caption清洗`<>&"'｜【】`+90字截斷，AI沒吐用「時段的地點·人物」模板保底。旗標：driveOn/roomEventAccept→親密、節慶日→節慶名。回應帶`photoResult{ok,filmLeft}`供前端小字回饋。
- **看照片(play的showPhoto=照片ID分支)**：驗證照片屬於本局→洗好(拍攝日<今天)→`★【看照片】`(拍到自己→害羞/得意、拍到別人→評論/吃味)；沒洗好→演期待感。
- **新action**：`get_album`(讀本局全部照片新到舊＋dateLabel後端算好＋剩餘底片·LOCK豁免純讀)/`album_delete`(照片ID+遊戲ID雙比對才刪·相簿滿了騰位子)。
**前端**：輸入列📷鈕(`kanshouTakePhoto`·鑑賞限定`applyModeUI`控制)＋「＋抽屜→📚相簿」(`openKanshouAlbum`全螢幕overlay)。相簿牆：人物篩選chips(名字+髮色圓點·從照片資料自動長出)＋色卡寶麗來(`kcAlbumCardSvg_`:`KC_ALBUM_BAND_BG_`5時段漸層/雪點雨絲SVG/髮色三角緞帶/地點時段標籤)；沖洗中的照片顯示🎞️膠卷紋+「明天就能看了」；洗好的卡有「👀給在場的人看」「🗑️刪除」。拍照後聊天區補一行機制小字(剩N張/為何沒拍成)。`send()`加第19/20尾參`takePhoto`/`showPhoto`。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空。`AI_PROMPT_MAP.md`補「附二」總表(這一輪所有新prompt片段的錨點對照)。

**追加·風景照(玩家「那我不能拍貓貓狗狗嗎?」)**：拍照不再要求有同伴在場。拍攝對象三態：①`photoIntent`(清洗+60字截斷)有值且沒點名同伴→**風景/生活照**(AI自由入鏡街貓/狗兒/鳥雀/光影，玩家指定的東西當主角；同伴在場可亂入鏡頭邊角)；②沒指定有同伴→拍同伴；③沒指定沒同伴→拍風景(原本是「拍照落空」擋下，已移除該擋)。風景照人物欄記「風景」(相簿自動長出「風景」篩選分頁)、緞帶固定草綠`#7a9a6a`。`send()`加第21尾參`photoIntent`。

**追加·拍照UX+選人**：①`kanshouTakePhoto`改用`prompt()`彈框問想拍什麼(留空=拍眼前/打一句=指定主角)，不用先在對話框打字(玩家「還要先打字阿~?」)；取消(null)不送出。②多人在場選人(玩家「如果有很多人在場呢?」)：intent點名了哪些在場同伴(`_phNamedMembers`·可多位)就**只拍那(幾)位**(最多3)——修掉原本「就算點名也還是拍前3位」的瑕疵；空手按=在場好感最高前3位合照；沒被拍到的人AI演旁觀/起鬨。Node驗證5情境(空手多人/點名單人/點名雙人/風景/空手無人)全對。


## §119 鑑賞拜訪私人住處要「夠熟才登門」(好感≥40) ＋ AI 別亂掰玩家帶禮物（2026-07・玩家「能直接拜訪住處也太怪了…AI很能掰直接幫我準備小禮物登門拜訪，但對面還是很熟悉我的樣子」→選丙案，門檻40）

**背景**：`拜訪住處`分頁的6處私人住處(region:'visit')原本**零門檻**、任何好感都能直接 `kanshouMoveTo` 闖進去。低好感登門→AI為了合理化就憑空掰「玩家準備了小禮物」，NPC 也演得過分熟絡(低好感語氣提示 line 1826-1828 只到普通朋友<40，但你人已在人家家裡了)。玩家選**丙案**：住處鎖到熟識(好感40)＋修「別演太熟/別亂掰禮物」通用毛病。

**Part A·住處好感門檻(單一真實來源 `KANSHOU_VISIT_BOND_=40`，位置在 KANSHOU_COHABIT_BOND_ 旁)**：
- **判定** `kanshouResidenceUnlocked_(pcData, 住處名, gameId)`(Gallery.gs·kanshouHeroIdByName_ 旁)：該住處主人(`KANSHOU_HERO_HOME_` 反查 heroId→住處名)在本局已入駐且好感≥40才解鎖。game_id 隔離(別局的同角色不算)。
- **後端攔截**(actionPlay·moveTarget 解析處)：`moveTarget0_` 若 region==='visit' 且未解鎖→`moveTarget=null`(不進門、留原地)＋`kanshouVisitBlockedStr`(★【登門未果·私人住處】門外卻步、不讓屋主出現)注入提示詞、`finalUserMsg` 改「想直接登門造訪」。直打 API 也擋得住。
- **前端**(Script_Kanshou.html·locBtns)：未解鎖的 visit 住處灰掉(🔒+「尚未熟識」·`cursor:not-allowed`)，點了跳 alert 提示、不移動。解鎖清單走 `buildTagsPayload_` 新增的 `unlockedResidences`(k_ 局才算，跟 locationCounts 同一迴圈)。
- **門檻可達性**：純聊天卡在梯度上限(chat ceiling 39)，但**赴約**(kanshouPromiseMetStr +5·直接寫BOND不吃ceiling)可推過40，故門檻不會 soft-lock。

**Part B·別亂掰(Gallery.gs 提示詞·★【玩家反向邀約】下方新增★)**：明令無金錢/物品/背包系統，禁止 AI 自作主張讓玩家「早就準備好禮物/掏錢包/變道具」等玩家沒說要做的事——送禮一律由玩家輸入決定；日常順手分享的小零食/路邊自然之物可輕描淡寫，但不可寫成有備而來、彷彿關係已很親近。⚠ `nsfwBaseRules`(紅線①)未動，規則加在鑑賞專屬組裝段。

**驗證**：`bash check.sh`全過；`git diff --stat gas/Engine_Combat.gs`空；Node模擬 `kanshouResidenceUnlocked_` 5例(好感39鎖/55開/40邊界開`>=`/無屋主入駐鎖/別局同角色不解鎖本局)全對。

## §120 鑑賞日常種子收斂：6位 dailyLook 去重/去「直說內心」（2026-07・玩家「有些種子資料寫太多、太多嘴?」→只動日常欄，SOLO persona 不碰）

**背景**：玩家覺得部分種子日常欄囉嗦。逐段審 25 位 `dailyLook`(4段:外貌/氣質/自稱口氣/私密一面)＋`dailyWords`，發現「多嘴」有兩型：①氣質段≈說話段(同句講兩遍)；②私密一面(look[3])跟 dailyWords 又講一次、或直接把內心獨白寫死(違反 show-don't-tell)。多數是「具體小動作」的好寫法(如美杜莎偷紅眼眶)不動，只收斂真正重複/直說內心的 6 位：
- **間桐櫻黑化**(90→70)：氣質≈說話去重、look[3]佔有慾改成「用小惡作劇試探對方在意程度」(跟words錯開)
- **迪盧木多**：氣質段「謙恭有禮」跟說話段重複→氣質改「溫雅內斂」
- **吉爾德萊**(97→86)：look[3]「心底一直惦記…讓他心懷敬意的人」(直說內心+≈words)→「聊到那位他敬重的人時語氣放軟」
- **吉爾伽美什**：look[3]「收藏稀奇玩具」≈words→改「悄悄記住誰真正喜歡什麼」(對齊moe、跟words錯開)
- **咒腕之哈桑**(82→75)：look[3]兩句折成一句
- **蘭斯洛特**：look[3]「像想起放不下的往事」直說內心→刪、留「對著遠方出神」的可見動作

⚠ 只動 `dailyLook`(鑑賞讀)，SOLO 讀的 `persona.look/words/speech`(戰鬥用)完全沒碰。`CODEX_PERSONA_VER` v61→v62 觸發已入駐角色的日常快取重刷。`bash check.sh`全過、`Engine_Combat.gs`紅線空、6位改後仍 4 段。

## §121 工房捏角日常欄生成也套「別自我重複／別直說內心」準則（2026-07・玩家「工房捏角新生成也修正，注意 日常外貌/日常性格/日常萌點/日常衣裝」）

承 §120——把手改種子的準則同步進工房 AI 生成端(`ai_gen` 原創英靈，生成流程在 Router_Creation.gs·順序 moe→look(帶moe hint)→words)：
- **日常外貌 `translateLookToDaily_`(Gallery.gs)**：①每短句精簡收束、避免堆疊多重子句；②氣質段【不可與口氣段用相同字眼】(擋型①自我重複，如兩段都寫「溫柔/謙恭」)；③私密一面【必須 show-don't-tell·看得到的具體小動作/情境】，禁止直說內心(「心裡一直惦記著…」「其實很在意…」)，也不要只是把性格/喜好換句話說(擋型②)。原有「私密一面不可跟 dailyMoe 重複」的 hint 保留。
- **日常性格 `translatePersonalityToDaily_`**：新增第4參 `lookPrivateHint`，兩處呼叫端(Router_Creation.gs 建檔/改設定)把已生成的 dailyLook 第4段(私密一面)傳入，明令這4句性格不要跟私密一面重複；另加「每句精簡收束」。
- **日常衣裝 `outfit`**：原本就有「不要跟 look 重複」，未動。**日常萌點 `translateMoeToDaily_`**：原本已限輕量/正面/18字、且最先生成當 hint 餵給 look，未動。

⚠ 純提示詞/接線調整，只影響【日後】新捏的原創角色；已存在的角色資料不動(要更新可重存一次設定觸發 Router_Creation 重轉)。SEED canon 角色走 §120 手改那條、不經此路徑。`bash check.sh`全過、`Engine_Combat.gs`紅線空。

## §122 鑑賞時間隨玩家動作自然流動（2026-07・玩家「最嚴重痛點：時間不流動，6點到處跑都一直6點，想要對話/按鍵(走AI)都讓時間流動」）

**背景**：鑑賞時鐘(借 COL.PC.DAY/HOUR)原本只在「結束一天」「推進時段/跳節慶」按鈕才動，一般聊天/移動完全不推進→開局6:00怎麼玩都卡在6點，很出戲。

**做法(actionPlay·時間區塊收尾後、curDateObj_之前)**：
- 常數 `KANSHOU_HOUR_PER_ACTION_=1`、`KANSHOU_DAY_LAST_HOUR_=23`(Gallery.gs·KANSHOU_TIME_BANDS_ 旁)。
- 旗標 `kanshouClockMoved_`：結束一天(設隔天6點)與時段跳躍(rollHours_)兩條各自 set true，避免它們的回合又被下面加一次。
- 一般 AI 敘事回合(聊天/移動/拍照/橋段/牽手…凡走AI且非結束一天/非跳躍)：`curHour = min(23, curHour+1)`＋寫回 pcData[pcIndex].HOUR＋dirtyPcRows。**夾在當日23:00不跨日**——跨午夜(睡覺)只由「結束一天」儀式負責(回家/同床/晨間餘韻/隔天6點重置)，不讓被動流動偷偷滾過午夜沒睡覺。
- **只動時鐘、不重骰不在場同伴位置**(那由結束一天/時段跳躍負責)，免得每句對話有人被傳送走(承 §84 精神)。
- 時鐘會被 AI 讀到：提示詞 line🕰️「現在是…${timeBand_(curHour)}」＋前端 HUD(`kanshouClockInfo_(pcData[pcIndex])` 回應時建，承 §102 修好的刷新)都吃 curHour，故 narration 的時段感與 HUD 同步往前走。
- **一天長度**＝(23−6)/1 = 約17個一般動作到23:00封頂；封頂後續回合維持23:00直到玩家結束一天。深夜(0-4)仍走「跳到時段·深夜」。速度嫌快/慢改 `KANSHOU_HOUR_PER_ACTION_` 一個數即可。

**驗證**：`bash check.sh`全過、`Engine_Combat.gs`紅線空；Node模擬(6點連按20次爬到23封頂/結束一天回合不重加/跳躍回合不重加/23點維持)全對。

## §122b 半小時刻度＋天氣進HUD＋AI時間尺度約束（2026-07・玩家「移動1小時太久改半小時、天氣顯示在時間那、AI要知道每動作約半小時且別亂掰、也別把『半小時』掛嘴邊」）

承 §122 微調：
- **半小時/動作**：`KANSHOU_HOUR_PER_ACTION_` 1→**0.5**(玩家「一小時太久，反正有快速流逝按鈕」)。一天步數 17→**34**個動作到23:00封頂，時段橋段也更好觸發(每個時段停留更多回合)。
- **時鐘支援 X:30**：新增 `kanshouFmtHM_(h)`(小時含.5→HH:MM)。`kanshouClockInfo_` 與三則「時間推進」訊息、🕰️提示詞的時刻全改走它，取代舊 `("0"+hour).slice(-2)+":00"`。HOUR 讀取 `parseInt`→**`parseFloat`**(2處:kanshouClockInfo_/actionPlay curHour)，否則半小時被截掉。
- **timeBand_(Time_World.gs) 改半開區間**`[下界,上界)`：清晨[5,11)/午後[11,17)/黃昏[17,20)/夜[20,24)/深夜其餘。整數結果與舊版逐一相同，但修掉小數邊界(10.5/16.5/19.5)掉進縫隙被誤判深夜的bug。分界對齊 KANSHOU_TIME_BANDS_ startHour。
- **天氣進HUD**：`kanshouClockInfo_` label 尾接 `kanshouWeatherEmoji_(wx)+wx`(季節確定性天氣，本就存在、AI提示詞早有【今日天氣】)；回應 `clock:` 字串一路帶到前端 `updateClock`。時段icon regex 靠 label 裡「band 在天氣之前」先命中，天氣文字不含夜/清晨等字不會誤判。
- **AI時間尺度(🕰️行新增★)**：告知每個動作約半小時，narration 只寫當下片段、順時段光線氛圍；【禁】自行宣稱過了好幾鐘頭/天黑了/跳時段(時間由系統時鐘管)；【禁】把「半小時/三十分鐘/過了一段時間」等字眼寫進敘述——時間感靠光線氣氛自然流露、不報出來。

**驗證**：`bash check.sh`全過、`Engine_Combat.gs`紅線空；Node模擬(6:00→23:00共34步半小時遞增/封頂/邊界10.5清晨·16.5午後·19.5黃昏/HH:MM格式/9種天氣emoji)全對。

## §123 睡覺按鈕正名＋深夜敲門限親近/同居（2026-07・玩家「深夜按鈕想叫『睡覺・結束這天』；泛泛之交半夜敲門很怪，該限同住/親近」）

- **按鈕正名**(Script.html·renderMapPane 的下一階段鈕)：band==='深夜' 時文字/配色改「🌙 睡覺・結束這天」(紫)、其餘時段維持「⏰ 下一階段」(藍)。功能不變(深夜按下＝kanshouEndDay 整套：回房/同床/敲門判定)。
- **深夜敲門候選加門檻**(Gallery.gs·endDay knockPool)：新增 `KANSHOU_KNOCK_MIN_BOND_=60`，knockPool 過濾條件加 `(kanshouIsCohabit_(r) || bond>=60)`——只有同居或親近的人(好感≥60)才會半夜登門，泛泛之交不再半夜亂敲(貼合陌生人世界觀)。機率仍 20%(KANSHOU_KNOCK_CHANCE_)。要更容易撞見改小門檻、要只限同住改大即可。

**備忘(未改·回答玩家)**：①開門(knockAccept)把訪客接到玩家位置、當回合可續聊、不推進日期；再按睡覺是全新一次20%擲骰(剛接進來的人已同地→被 LOC!==curL 排除，故頂多換別人來)；不予理會(skipKnockCheck)跳過擲骰直接睡。②夜間色色本就有：結束一天當回合，好感≥80且此刻同地的同伴列入 intimateNightNames→留玩家房間同床(提示詞★【入夜氛圍】允許自然發展到同床共枕)；晨間餘韻是隔天早上的餘韻回callback、非唯一NSFW路徑。

## §124 地點進時鐘HUD＋大分區脈絡餵AI＋家改「玩家名的家」＋👥正名「邀請」（2026-07・玩家「地址加進時間那行、大地點要給AI否則以為在他家、我家改XX的家、👥沒說明改叫邀請」）

- **地點進時鐘HUD**(`kanshouClockInfo_`)：label 前綴 `📍{LOC}　`，時鐘列同時看得到現在人在哪。時段icon regex靠label裡band先命中、地名不含夜/清晨等字不誤判。
- **大分區脈絡餵AI**(新 `kanshouLocContextForAI_(loc,homeName)`)：光地名AI分不出自家/別人家→依 region(KANSHOU_LOCATIONS_ 的欄位)補一句：room/home→「御主自己的家『{homeName}』的私人房間/共用空間」、visit→「別人的住處、御主是造訪的客人」、shinzan/fuyuki/dojo→深山町/冬木市中心/山林。找不到(AI自創地點)回空字串不硬套。接進【玩家命格】的 `位置:${curL}（脈絡）`，解掉AI「以為在他家中」。
- **家預設改「{玩家名}的家」**(`getKanshouHomeName_(memory, playerName)`)：未自訂時預設從中性「我家」改成 `{playerName}的家`(無名字才退我家)；3處呼叫端(linkAccount/migrate/enter)傳入 pcName。前端 Script_Kanshou.html 兩處 stale fallback「衛宮宅」→「我家」。玩家仍可✏️改名。
- **👥鈕正名**(Index.html #topbar-kanshou)：純icon「👥」→「👥 邀請」+title「邀請/管理後日談同伴、召喚英靈入席」，新玩家一眼懂那顆在幹嘛。

**驗證**：`bash check.sh`全過、`Engine_Combat.gs`紅線空；Node模擬 kanshouLocContextForAI_ 6例(自家房間/自家共用/市中心/別人住處/深山町/AI自創地點無脈絡)全對。

## §125 補齊17位戰鬥從者的鑑賞身世 dailyBack（＋既有同伴趁版本升級一起刷新）（2026-07・玩家「為啥SABER身世是那句通用預設?」）

**根因**：`heroToKanshouRow_` 身世讀 `persona.dailyBack`(戰時 back 全是聖杯戰爭悲劇、不搬進和平世界)，查無就給通用預設「生活在這座城鎮裡的普通身影，與你尚無深交」。但**只有5位鑑賞Master(凜/伊莉雅絲菲爾/櫻/士郎/大河)寫過 dailyBack**，17位戰鬥從者(SABER/EMIYA/庫丘林…)全缺→召進鑑賞通通變那句。

**修法**：
- **手寫17位 dailyBack**(Seed_Codex.gs·插在各 persona 的 dailyMoe 前)：和平日常向、≤28字(heroToKanshouRow_ slice上限)、無戰爭/悲劇、貼合角色本質(如SABER「正直守序、在小鎮過著規律自持的日子，格外貪吃」)。
- **既有同伴也刷新**：原 `resyncSummonedServants_` 只刷戰鬥數據(寶具/六圍/技能)、不碰身世→已在場的舊SABER不會自己好。新增：k_(鑑賞)列且種子有 dailyBack 時，`data[i][COL.PC.BACK]=s.persona.dailyBack.slice(0,28)`(只動鑑賞列、不碰solo戰時back)。
- `CODEX_PERSONA_VER` v62→**v63** 觸發 upgradeCodexPersonas_(刷英靈殿persona→新召喚讀到 dailyBack)＋resyncSummonedServants_(刷既有鑑賞同伴身世)。

**驗證**：`bash check.sh`全過、`Engine_Combat.gs`紅線空；Node確認17位 dailyBack 皆≤28字且插進各自 persona、SABER身世已非預設；`s.persona.dailyBack` 存取路徑核對有效。

## §126 好感上限突破改「約會路徑」：橋段給不吃上限的好感＋修掉「需要送禮」殘留（2026-07・玩家「沒經濟不能買禮物，只能靠約會突破鎖住好感?」→選B保留上限但改約會突破、不找回禮物）

**背景**：`kanshouRelChatCeiling_` 讓純聊天好感卡在梯度上限(19/39/59/79)，原設計靠「送禮」突破——但經濟/商城早砍了，提示詞卻還寫「需要收到禮物才能繼續加深」，玩家無禮物可買、一頭霧水。實際唯一突破路是約定赴約(+5·kanshouPromiseMetStr·不吃上限)。玩家選B：保留慢熱上限，但把突破方式正名成「約會」、並多給橋段一條路，不找回禮物。

**做法**：
- **新增 `KANSHOU_SCENE_BOND_=3`**：接受親密橋段(roomEventAccept)且**非拒絕分支(reBranch.min>=0)**時，`pcData[reIdx].BOND=min(100,reBond+3)`＋`kanshouSyncRelTier_`＋dirtyPcRows——**直接寫、不吃聊天上限**，等於「一起經歷特別時刻→關係跨過梯度」。拒絕/警戒分支(min:-100)不給。橋段提示詞尾append「好感已由系統上調，敘事勿再另計」防AI重複計。
- **ceiling提示詞正名**(pAtCeilingStr)：「需要收到禮物才能繼續加深」→「需要透過約定赴約、或一起經歷特別的橋段(夜襲/共浴/膝枕…)這類真實相處才能再加深」。
- 順手更新 kanshouRelChatCeiling_ 上方註解＋rel_changes clamp 註解＋kanshouSyncRelTier_ 呼叫者註解裡的「送禮」殘留→「約定赴約/橋段」。`收到禮物` 全清 0。禮物系統不找回(經濟已砍)。

**驗證**：`bash check.sh`全過、`Engine_Combat.gs`紅線空；Node模擬(好感39純聊天卡39/接受橋段+3→42跨40→熟識/之後聊天上限升59/拒絕分支不加/約定+5跨40)全對。

## §127 鑑賞親密尺度依好感分四階(凌駕色度跟隨)＋工房身世退回back（2026-07・玩家「40以下拒絕、60以下勉強觸碰、80以下頂多親親抱抱、80以上才能隨便寫」）

- **工房原創英靈身世**(§125補遺·commit 982bb7f)：`heroToKanshouRow_` 身世優先序 dailyBack(canon手寫) > back(工房forge·原創身世非戰時悲劇可直用) > 通用預設——工房捏的角色不再掉進「普通身影」預設。
- **親密尺度分階**(玩家定案·加在鑑賞每回合組裝提示詞`const prompt`裡、★世界觀那條之後，**不碰演化核心 nsfwBaseRules**·`git diff|grep nsfwBaseRules`=0)：每位在場同伴以**當前好感為肢體親密天花板**，玩家再主動也不得越階(她依個性婉拒/退開/擋下、人格不崩)——
  - **<40**：婉拒一切情慾越界(害羞躲開/正色拒絕/岔開)，可friendly不接受親密
  - **40~59**：勉強彆扭接受輕度接觸(牽手/靠肩/被摸頭)，親吻以上會退開
  - **60~79**：親吻/擁抱/依偎可以，脫衣/性事仍止住「還沒到那一步」
  - **80+**：無上限、依情境個性到底
  - ★在該階容許範圍內仍「色度跟隨玩家」但絕不超過天花板；多人在場各自依各自好感套用。此上限明講【凌駕】上方色度跟隨鐵律。好感數字AI從 partyDetailsArr 卡片直接讀、不需另算。

**驗證**：`bash check.sh`全過、`git diff|grep nsfwBaseRules`=0(紅線①未動)、`Engine_Combat.gs`紅線空。門檻/措辭皆一句話可調。

## §128 修 parseTraitsHelper 句號分隔bug：御主/工房捏角欄位不再黏預設殘料（2026-07・玩家「風音只打名字，處事個性尾巴多了『內斂堅韌、明哲保身、隨波逐流』、命格特徵尾巴多了『卸下心防的私密一面』」）

**根因**：`parseTraitsHelper`(Core_Settings.gs)只用 `split('、')` 切四格，但御主/工房生成AI常把「四格頓號」誤寫成「四句句號」(如「文靜內向。溫柔細膩。愛小動物。討厭喧嘩。」)→整串被當成1段、其餘3段被 `defaultStr` 的預設值填成殘料黏在後面(PREF尾巴黏「內斂堅韌、明哲保身、隨波逐流」；TRAIT尾巴黏「卸下心防的私密一面」)。

**修法(雙層)**：
- **解析正規化**(parseTraitsHelper·根本解·惠及所有呼叫端)：切割前先 `str.replace(/[。\.]+/g,'、')` 把全形/半形句號正規化成頓號，再 collapse 連續頓號、trim 邊界。純句號型(如風音personality)→乾淨切4段、不再補預設殘料。
- **生成提示詞強化**(三處：`actionBackfillKanshouAi`鑑賞御主/`actionBackfillMasterAi`solo御主/工房forge)：四格格式鐵律改成「恰好4段·只用頓號「、」·【絕對不要用句號「。」】·每段簡短詞組非完整句·段內不再用頓號列舉」，鑑賞御主那條並附正例。

⚠ **既有角色(如風音已建檔)資料已baked**、不會自動回溯——請按該欄的「改命」鈕重擲一次，即走新提示詞+新解析生成乾淨值；新捏的角色一開始就乾淨。

**驗證**：`bash check.sh`全過、`Engine_Combat.gs`紅線空；Node以風音實際壞資料模擬 parseTraitsHelper→「給人文靜內向的印象、其實內心充滿溫柔的想像力、喜歡照顧小動物與植物、討厭大聲喧嘩與浪費食物」乾淨4段、無「隨波逐流」殘料。

## §129 鑑賞UI/敘事微修：卡片4鈕不歪＋地點去重＋節慶標前一天＋低好感篇幅收斂（2026-07·玩家實測回饋）

- **同伴卡4鈕排版**(Script.html)：關係/相約/牽手/同居 四鈕(＋詳細狀態)樣式補 `min-width:0; white-space:nowrap;`、padding 6px→3px，四格一排不再換行歪掉。
- **地點去重**(Script.html·updateHeaderLoc)：地點已在時鐘HUD那行(📍地點·日期·時段·天氣·§124)顯示，左上角 `#header-loc` 小徽章在**鑑賞模式隱藏**(`pc.mode==='kanshou'→display:none`)、solo 照常顯示。
- **快轉節慶文案**(Script_Kanshou.html·openKanshouFestivals)：「直接跳到下一次的這個節日」→「快轉到下一次這個節日的【前一天】，讓你迎接節慶當天」，說明實際落點是前一天(對齊 finalUserMsg「明天就是X了」)。
- **篇幅隨關係濃淡**(Gallery.gs·鑑賞組裝提示詞·親密尺度那條之後·不碰 nsfwBaseRules)：初識/低好感(點頭之交/普通朋友)narration 精簡收斂(約200~300字)、別把陌生互動寫成大段內心戲；關係越深才逐漸放長。

**驗證**：`bash check.sh`全過、`git diff|grep nsfwBaseRules`=0、`Engine_Combat.gs`紅線空。

## §130 主動時間快轉修正：世界(含同地在場者)依新時刻重新分佈＋換幕鐵律不複述舊場景（2026-07·玩家「跳到午後但凜沒換位置、且敘述把剛才的牽手又演一次」）

玩家實測：在便利商店跟凜互動後按「⏩午後」，(a)凜沒換位置、(b)AI 把上一段牽手被拒的場景又重演一次(吃到前幾輪對話沒換幕)。

- **主動快轉讓世界動起來**(advanceHours 重骰·jumpBand/jumpFest/推進時段)：移除「排除同地在場者」的過濾(原§84)——§84是為擋「**被動**流動把互動中的人傳走」，但被動流動(§122)現在根本不重骰任何人；**主動**按鈕快轉數小時本就該讓全世界(含此刻跟你在一起的那位)回各自作息去向。凜的haunt是便利商店，午後多半仍骰回店裡(打工)，但非haunt-anchored的人會真的移動。
- **換幕鐵律**(快轉的 finalUserMsg 尾綴 `_jumpSceneBreak`)：時間快轉後是【全新場景】，明令 AI【直接寫新時段當下】、【絕對禁止接續/複述/重演上一段已發生的動作與對話】；剛才在一起的人若已依作息離開，就自然演出你獨自或身邊換人的當下。解掉「跳時段卻把舊場景再演一次」。

**驗證**：`bash check.sh`全過、`git diff|grep nsfwBaseRules`=0、`Engine_Combat.gs`紅線空。

## §131 鑑賞提示詞整體稽核：親密尺度五階(＜20完全碰不到)＋色度跟隨受天花板約束＋篇幅交叉引用修正（2026-07·玩家「太多細小問題，提示詞要真的跑才知道；好感不到20動手動腳直接依個性拒絕/反擊，不是摸了才拒絕是完全碰不到；紅線 nsfwBaseRules 你要修正也可以」）

實測跑出的核心矛盾：`色度跟隨鐵律`(玩家一色就「絕對禁止迴避/害羞」)直接牴觸`親密尺度`(未達門檻就該婉拒)。因玩家明確授權可修 `nsfwBaseRules`，且已確認 `buildDefaultSystemPrompt`(含 nsfwBaseRules/specificRules) **僅鑑賞用**(solo 自帶 systemOverride，Engine_Combat.gs:4 註解為證)，故從根源把「色度跟隨」全面改成**受親密尺度天花板約束**，solo 完全不受影響。

- **親密尺度改五階(Gallery.gs:2041-2047，玩家提示詞側)**：新增最底層 `好感<20(點頭之交)＝形同陌生人，玩家一動手動腳【直接依個性拒絕或反擊、根本碰不到】(不是摸了才推開，是連碰都碰不到)`；20~39 婉拒情慾、40~59 勉強輕度接觸、60~79 親吻擁抱可但止於性事、80+ 無上限。標題強化為「最高優先·凌駕色度跟隨鐵律與慾海律令，衝突時一律以此天花板為準」，並言明「這不算違反色度跟隨——色度跟隨只在該階容許範圍內生效」，解掉兩條規則對撞。
- **nsfwBaseRules 色度跟隨(Gallery.gs:674-676，SYSTEM 側·紅線·玩家授權)**：標題改「受親密尺度天花板約束」；情慾模式加前提「該同伴好感已達分五階允許進入情慾的階段；尚未達到就不進入此模式，改依個性婉拒/迴避」。
- **specificRules 慾海律令第0條(Gallery.gs:689)**：色度跟隨改「在她當前好感允許的親密尺度階段之內」跟隨，刪掉舊「相同**或更高**色度」；尚未到該階一律依個性真實反應、不得強行跟到底或逾越天花板；唯有已達該階容許範圍才禁止無故迴避。
- **主動掌握模式 driveStr 第④條(Gallery.gs:2010)**：舊「文字尺度拉到最滿＋篇幅依慾海律令第4條」→ 改「文字尺度可拉滿【但仍受親密尺度天花板約束】：僅在好感已容許進入情慾的前提下才放手寫；未達階則只在容許範圍內施展；篇幅仍依★【篇幅隨關係濃淡】」。修掉已刪除的「慾海律令第4條」死引用。
- **narration schema 欄位(Gallery.gs:606)**：舊「約500字·篇幅依慾海律令第4條」→ 改「篇幅依關係濃淡縮放·見★【篇幅隨關係濃淡】：初識/低好感約200~300字、關係越深或情慾展開才放長到500字上下」，與 §129 篇幅收斂對齊、修掉死引用。

⚠ **紅線註記**：本次依玩家 2026-07 明確授權(「紅線 nsfwBaseRules 你要修正也可以」)動了 `nsfwBaseRules`，範圍限鑑賞(kanshou-only)、solo 不受影響。`Engine_Combat.gs` 全程未動(該檔 nsfwBaseRules 只是註解指路，實體在 Gallery.gs:661)。

**驗證**：`bash check.sh`全過、`Engine_Combat.gs` diff 空、solo systemOverride 路徑不共用此 prompt。

**§131 續（深度 agent 稽核補漏）**：第一批修完後又派 agent 全檔掃一遍，再抓到 1 個真 bug＋4 處一致性殘留，一併修掉：
- **(真 bug·晨間餘韻誤觸發) Gallery.gs:1583**：夜襲橋段命中頂分支(`branch.min>=60`，即好感 60~79)就蓋【晨間餘韻】旗標(`KANSHOU_MORNING_AFTER_TAG_`＝暗示昨夜共度春宵)，但五階天花板下 60~79(親近)止於性事之前、不算共度。且與另一條同語意路徑(`intimateNightNames` 用 `>=80`)門檻不一致。改判準從「分支 min」換成「該英靈實際好感 `reBond>=80`」，與同床門檻同一切點。
- **(M1) Gallery.gs:2015 角色一致性鐵律**：舊硬編「好感未滿 80」二分門檻→改指【親密尺度·分五階】當前所處階段判斷接受/抗拒程度，不再把 60~79 的正當親近誤壓成抗拒。
- **(M2) Gallery.gs:670 nsfwBaseRules 慢熱與傾心**：舊「不套用固定門檻」會被讀成可無視階段→改「情感升溫快慢依個性自然，但【肢體親密程度】仍受五階好感門檻硬性約束」。
- **(M3) Gallery.gs:2041＋2010 主動掌握模式**：①天花板【凌駕】清單補列「🔥主動掌握模式」；②driveStr ①改成嚴格分階「好感<40 的『主動』只表現為言語試探/防備，【絕不】升級成堵路/逼近/肢體糾纏(陌生人不會把你逼到牆角)，好感越高才解鎖肢體壓迫、唯 80+ 才不加掩飾索求」——堵住「近乎陌生人卻把玩家逼到毫無招架」與 <20/<40 天花板對撞。
- **(L1) Gallery.gs:659 註解**：更新已過期的「只保留好感未滿80門檻」設計註解，改指五階天花板，免誤導下一個失憶的我。
- **判定【不改】**：M4(慾海律令編號)——第4條是原地改寫、保留編號槽，第6/7條交叉引用仍正確；M5(共浴/溫泉 min:70 分支涉裸浴)——好感 70~79(親近)貼合天花板「性事之前的親密」、裸浴是橋段前提非玩家推進的越界升級，且主提示詞天花板全程仍兜著禁性事，若把門檻拉到 80 反而比玩家自訂的五階更嚴、over-restrict，故維持原分支；補魔/強制補魔(令咒)全在 solo 戰鬥檔、不餵鑑賞提示詞，天花板管不到也不需管。

## §132 鑑賞流程廣掃：修好感梯度標籤落後＋橋段刷分＋時間矛盾＋schema/註解殘料（2026-07·玩家「再繼續看一次」，天花板已穩後轉查其他類別 bug）

天花板對齊後再派 agent 做「廣掃」(死引用/狀態寫入/流程矛盾/schema對不對得上/常數一致性)，抓到 2 個真行為 bug＋若干一致性殘料：
- **(真 bug·標籤落後·Gallery.gs:1896/1901 赴約·爽約)**：`赴約(+5)`／`爽約(−5)` 兩處寫 BOND 後【漏呼叫 `kanshouSyncRelTier_`】——而 +5 正是設計上「突破到下一梯度」的手段(見 §116/§126)，跨過 40/60/80 時 `REL_TAG` 卻停在舊梯度，提示詞的 `TA是你的${pRelTag}` 與 UI 會顯示落後一格直到下次 rel_changes 剛好觸發同步。其他寫 BOND 處(橋段 1578、rel_changes 2210)都有同步、只這兩處漏。→ 兩處各補一行 `kanshouSyncRelTier_(pcData, i)`。
- **(真 bug·橋段按鈕刷好感·Gallery.gs:1577-1586)**：橋段接受(非拒絕分支)給 `KANSHOU_SCENE_BOND_(+3)`，但【無當日冪等】——`roomEventOffer` 在同地×時段吻合時每回合都重發，玩家可每 0.5h 重按「靠近她/叫醒她」狂刷 +3、繞過細水長流。→ 新增 `KANSHOU_SCENE_DAY_TAG_`(makeIntTag·存該同伴列·absDay)，同一同伴同一天只給一次橋段好感(橋段敘事照演、只擋重覆加分)。
- **(流程矛盾·Gallery.gs:2050 時間尺度)**：時鐘鐵律「【絕對不要】把『半小時/三十分鐘/過了一段時間』寫進敘述」對撞「跳時段/推進時間」回合——那時 `finalUserMsg` 本身就寫「過了 N 個小時」、且 nsfwBaseRules 令 AI 重現玩家最新動作。→ 加例外「除非系統本回合已明確宣告時間推進(換幕)、才據實承接該跳轉」，其餘照禁。
- **(schema·Gallery.gs:641 token 省)**：`rel_changes[].target` 範本寫「NPC真實姓名或『自己』」，但 parser(2190)直接丟棄 `自己`(鑑賞無玩家自我好感)——刪「或『自己』」免 AI 白填被丟。
- **(一致性·Gallery.gs:2223)**：`physical_state` 後端截斷 `slice(0,20)` 與範本/律令/註解四處「≤15字」不一致→改 15。
- **(防呆·Gallery.gs:1961)**：`presentRowsForGender`(餵性別提示＋NSFW肉體快照)用未 trim 的嚴格 `LOC===curL`，與 `partyRows`(已 trim)判準不一→改成同樣 trim 比對，免空白差造成「有卡片沒肉體快照」或反之。
- **(doc rot·AI_PROMPT_MAP.md)**：刪已移除機制的殘留列——`肉償`(隨經濟層砍·§105)、`門禁提醒`(§101 已刪)整列刪除；夜襲晨間餘韻 `≥60`→`≥80`(對齊 §131)；房間橋段觸發描述由舊 `COL.PC.ROOM room1~room3` 更新為現行 `KANSHOU_HERO_HOME_`/和室；`send()` 簽名由過期的「16參數(含已刪 work/buyItem/giftTarget/debtPayment)」更正為真實 22 參數(註明 `dismissCurfew` 是門禁移除後的佔位空位)。
- **判定【不改】**：Script_Kanshou.html:94 `data.text.split('[')[0]`(solo 繼承的狀態列剝除)——鑑賞敘事用「」（）不用中括號、風險極低，且動它恐影響 solo 對稱行為，故留。schema↔parser 全對得上(每個宣告欄位都有讀、每個讀的欄位都有宣告；`inner_monologue` 是刻意的 CoT 草稿不入歷史)、慾海律令 5/6/7 條與各交叉引用皆解析正確、KANSHOU 常數(80/60/40/20 梯度、chat ceiling、VISIT 40/KNOCK 60/COHABIT 90)全一致——agent 覆核為 clean。

**驗證**：`bash check.sh`全過、`Engine_Combat.gs` diff 空、`kanshouSyncRelTier_` 確在 Gallery.gs 定義。

## §133 對話格式重寫「聲音即台詞」＋consolidate 成全遊戲單一真實來源（2026-07·玩家「對話格式不是我想要的、好難規定→聲音也變成台詞那種感覺；改 solo＋鑑賞共用」）

玩家不滿舊劇本體 `（動作）名字：「台詞（聲音）」`——每句名字開頭、每個動作/聲音強制塞（），像聊天室 RP 不像小說。逐步釐清後定案「**聲音即台詞**」的自然散文格式，分界=**「這聲是不是她的『嘴／喉』發出的」**：
- **進「」(當台詞)**：話語＋一切她口/喉發出的聲——喘息/輕吟/悶哼/笑，**＋嘴部動作的聲音(吸吮/舔啜/咀嚼/吞嚥的啾/啧)**。擬聲直接寫進單層「」當「親耳聽見的她」，不再用（輕哼）（嬌喘）括號描述、不改第三人稱。
  - ⚠ 邊界案例(玩家實測追問)：吃冰棒的「啾」進「」(她嘴發出)；但**撞擊聲/交合處水聲不進**(那是身體撞出來的、不是她嘴)——玩家一度質疑「但也是嘴發出的」，最終定線在「**她的嘴 vs 身體/環境**」，嘴部聲(含吸吮)一律進「」、身體/環境聲走敘事。
- **走敘事**：①看得見但不出聲的動作/身體反應(蹙眉/掐被褥/腰肢繃緊)；②**不是她嘴發出的**聲響(肉體相撞啪啪/兵刃鏗鏘/交合處水聲/環境聲)用擬聲寫進行文。兩者不套括號、不必每句名字開頭。
- 濃淡(日常↔激烈/情慾)不由格式管、由各軌既有規則(色度跟隨/親密尺度天花板/戰況)決定——**格式只管「怎麼寫」、不管「寫多濃」**，這正是玩家要的「日常很日常、色色很色色的共用模式」。

**工程**：舊有兩份格式文字(Gallery.gs `dialogueFormatRule_` 巢狀於 buildDefaultSystemPrompt、Router_Narrative.gs miniSystem 第2條)靠手動同步、正是 CLAUDE.md 警告的「改一半又不一致」。這次 consolidate 成**頂層單一函式 `dialogueFormatRule_()`**(Gallery.gs·移出巢狀)，鑑賞 nsfwBaseRules 第3條與 solo miniSystem 第2條都 `${dialogueFormatRule_()}` 共用同一支(GAS 全域可跨 .gs 呼叫)。以後改格式只動一處。solo＋鑑賞真正統一。

⚠ **紅線註記**：本次依玩家明確授權「改 solo＋鑑賞共用」重寫對話格式，`dialogueFormatRule_()` 經 nsfwBaseRules 第3條 interpolate、屬鑑賞側改動(kanshou-only)＋solo miniSystem，範圍如玩家指定。`Engine_Combat.gs` 全程未動。

**驗證**：`bash check.sh`全過、`Engine_Combat.gs` diff 空、`grep dialogueFormatRule_` = 1 定義＋2 呼叫端(Gallery nsfwBaseRules／Router_Narrative miniSystem)。

## §134 AI 不得自行搬動玩家→改走「同意泡泡」＋敘事禁替玩家腦補心境/收在期待（2026-07·玩家實測「他會幫我換位置也不是不行就是有點怪；如果他要單純移動我也給我泡泡我同意再動」＋「敘述結尾也怪怪的」）

實測回饋兩點,同一病根＝**AI 太越俎代庖替玩家作主**。先派 agent 把移動系統現況整個 trace(我的舊認知過時——地圖按鈕被拔過又加回來,`Gallery.gs:2123` 舊註解誤導)。釐清玩家 LOC 有 4 條寫入路徑,只有「AI 自寫 `location`」無同意:

- **移動 consent(root 修·Gallery.gs:2127/2143)**:關鍵洞察=能走到 `aiData.location` 直寫塊的**一定是 AI 自作主張**(玩家用地圖按鈕移動時 moveTarget 管線[1739]早已寫好 curL、AI 只是照抄、`aiLoc===curL` 不進此塊)。故把整塊直寫**廢除**,改把 AI 寫的新地名轉成 `aiAutoMoveProposal`、合併進既有 `moveProposal` 回傳欄→**共用同伴邀約那個現成的「同意/拒絕」泡泡**(前端 `data.moveProposal`→`kanshouConfirmMoveProposal` 帶 moveTarget+moveWithCompanion 重送→走既有移動管線含巧遇/同伴跟隨)。**零前端改動、零新 state 欄**——純接線到現成 consent 機制。玩家自己點地圖/👋邀同伴維持即時(那是玩家選的地點)。
- **提示詞(Gallery.gs 換場地規則)**:原本三條(換場地自主移動/提議換地點/玩家反向邀約)consolidate 成一條「**換地點一律走提議泡泡、你絕不自行搬動玩家**」——narration 只寫到「提議/正要起身」就停、禁寫移動過程與抵達、location 照抄目前地點。唯一例外=玩家用地圖按鈕(系統已寫好位置、AI 照抄敘述抵達)。這樣泡泡與敘述一致、不會「敘述已抵達卻又跳提議」。
- **敘事禁替玩家作主(Gallery.gs·新增★規則)**:玩家實測敘述把一句「嗚嗚孤零零的」擴寫成大段替他決定的內心戲、還收在「玩家的期待/渴望」上(「希望…擦出火花」)。新增鐵律:narration 只演玩家**實際輸入的動作＋當下五感**,嚴禁腦補大段內心戲/情緒/願望/替他做決定,**尤其禁止把段落收在玩家的期待/渴望上**,結尾一律停在【外部當下】(對方反應/場景/未完成的動作),把「下一步怎樣、心裡怎麼想」還給玩家。

⚠ 玩家更正記錄:實測那次 AI 把玩家移到商店街、當場出現藤村大河——經玩家確認**大河確實在商店街(合法同地/巧遇)、非憑空生人**,問題純粹是「移動未經同意」而非「捏造角色」。

**驗證**：`bash check.sh`全過、`Engine_Combat.gs` diff 空、`aiLoc` 舊變數已無殘留程式引用(只剩註解)、`moveProposal` 回傳欄同時吃 AI 明填的 move_proposal 與轉提議的 location。

## §135 鑑賞「共同回憶」：復用 27 號死欄＋暱稱那套 append 引擎(不做每日濃縮·LunaTalk 啟發的簡化版)（2026-07·玩家問「lunatalk.ai 怎麼整理事件、我也想要」→逐步收斂）

玩家看到 LunaTalk 的「事件摘要(時間軸/角色/關係)」想要類似的。討論後**大幅簡化定案**:
- **只做「共同回憶」一份**:關係進展(BOND/五階)、約定(【約定】標籤)、暱稱(REL_MEM 的 [專屬稱呼])都**已存在且即時更新**,摘要若重存反而慢又破壞單一真實來源。唯一真缺的是「一份連貫的我們的往事」——故聚焦這個。
- **綁每個同伴、非玩家**:kanshou 一對多,綁玩家會混成一坨(重蹈已砍的「命運長河·存太多抓不到重點」);綁同伴才是「她記得你倆的故事」,且順著 BOND/REL_MEM 都在她那列的資料模型。
- **放 27 號死欄**:原 `MAJOR_EVENT`(兩軌皆死·恆空)復用改名 `COL.PC.MEMOIR`,位在關係群組正中(24 BOND/25 REL_TAG/26 IS_PARTY/**27 MEMOIR**/28 REL_MEM)。COL 是位置索引→沿用 27 槽、不新增欄不位移。`MAJOR_EVENT` 全庫無程式引用(只註解),改名零風險。
- **不做每日濃縮(避開所有難點)**:原構想「結束這天呼叫 AI 讀當天歷史批次濃縮」太重。改**完全複用暱稱機制**——AI 每回合 `intimacy_feedback.npcs[].memory` 吐【一句里程碑回憶或「無」】,GAS 用新 `processMemoir_`(同 processTags 精神:append 去重保留最近 10 條;差別=獨立 cell 且句中可能含「、」故改用全形｜分隔、寫入前清 ｜【】[])寫進 27 欄。**零新 AI 呼叫、零歷史挖掘、零 endDay 批次**;「今天沒見到的人不更新」也自動成立(AI 只對在場者吐 npcs)。
- **餵回**:她在場時 `partyDetailsArr` 把 27 欄(｜→；)接進在場卡「你們的共同回憶」,AI 自然承接你倆過往。
- **升級路線(未做)**:哪天回憶太多想壓成連貫故事,再加每日濃縮;現版最舊自動掉(slice(-10))即可。編輯/釘選面板(LunaTalk Remember)亦列為後續選配。

改動點:`Core_Settings.gs`(COL 27 改名 MEMOIR)、`Setup_FateWorld.gs`(欄序註解)、`Gallery.gs`(schema npcs 加 `memory` 欄／`processMemoir_` 引擎＋npcs 迴圈寫 27 欄／partyDetailsArr 讀回餵卡)。`sanitizeAiData_` 是 pass-through(只 clamp fav_change)、memory 欄原樣通過。

**驗證**：`bash check.sh`全過、`Engine_Combat.gs` diff 空、`MAJOR_EVENT` 全庫僅剩註解、`COL.PC.MEMOIR` 讀(partyDetailsArr)寫(npcs 迴圈)各一處已接。

**§135 續(同日玩家追加)**：
- **視角鎖死**：memory 欄明文=玩家第一人稱「我」記述(「和她在頂樓看了跨年煙火」)，【禁止】她的視角/她對我的想法/第三人稱旁觀——10 條疊起來像一本玩家的日記，AI 承接語氣穩；她對玩家的想法另有去處([態度]/好感)不混流。
- **💞回憶面板(卡片可看/釘選/刪除·LunaTalk Remember 落地)**：同伴面板每列加「💞回憶(N)」鈕→`kanshouOpenMemoir` overlay 列出 27 欄各條——☆釘選(→★前綴·永不被淘汰·上限8，留2格給新回憶)／🗑刪除(confirm)。新 action `kanshou_memoir_op`(Router_Action 註冊·取寫入鎖·`kanshouOwnedRowIdx_` 帳號綁定驗證後才動同 gid 列，比照 update_rel_tag「玩家UI手動管理、AI無權」)，回傳更新後 memoir[]、前端原地重繪＋卡片徽章同步。`kanshou_companions` 回應每人多帶 `memoir[]`(原樣含★)。`processMemoir_` 淘汰邏輯改「★永不驅逐、只淘汰未釘選最舊的」，去重比對忽略★；餵 AI 的在場卡把★去掉(不外洩機制符號)。

## §136 提示詞去重瘦身 Batch 1+2：修 location 正面矛盾＋色度跟隨/人格不崩/欄位規則歸一（2026-07·玩家看 GPT-5.6 提示指南問「可以改進我全部的提示詞嗎」→稽核→玩家選 B=授權含 nsfwBaseRules 的完整去重）

依 OpenAI GPT-5.6 指南原則(重複指令與規則衝突是不穩定主因；修剪重複可提分並省 token)做全提示詞稽核後分批執行。玩家明確選「B」＝Batch 1(零風險)＋Batch 2(授權動 nsfwBaseRules 去重，語義原封、只刪重複)。

**修正的矛盾**：
- **(B1·正面互撞) location schema 欄**：§134 泡泡改版漏同步——schema 還寫「可自創地名/自行填新地點」vs USER 側「絕對禁止自創/一律照抄」，AI 每回合同時收到兩句會隨機選邊。改為「一律照抄目前地點、場景轉換走 move_proposal」。
- **(B2) solo miniSystem 字面自我矛盾**：「換行一律用 <br><br>」+「禁止輸出任何 HTML 標籤」(<br>本身就是HTML)→「禁止 <br> 以外的任何 HTML 標籤」。
- **(B4) 4 個過期方向詞**「見下方慾海律令第6/7條」→實際在上方＋配合刪條重編號。

**去重(canonical 化)**：
- **色度跟隨整段(nsfwBaseRules·授權)**：刪【色度跟隨鐵律】整節(含 word-for-word ×2 的生理特寫清單＋人格反差 bullet)——canonical＝慾海律令第0條(色度跟隨·caveat 最完整)＋第4條(極致感官)。nsfwBaseRules 913→561 字。
- **「用原本人格承受快感」5→1**：canonical＝USER 角色一致性鐵律(最完整·有具體人格範例)；刪律令第1條尾句、第4條尾句、天花板 header 括號句(改指向)、色度段 bullet(隨整節)。
- **慾海律令第5條(physical_state/outfit_change)整條刪**：canonical＝schema `_note`(離填寫點最近·內容全覆蓋)；第6/7條重編號為5/6、全部交叉引用(schema×4＋註解×1)同步改。specificRules 976→839 字。
- **narration 欄**砍數字重抄只留 pointer(數字本體在★篇幅隨關係濃淡)。
- **稱呼慣例尾段**縮短(真名規則 schema 兩欄已各講一次)。
- **背景人煙**砍與在場驗證鐵律逐字重複的三聯句，只留「可以寫路人」正面許可＋pointer。
- **相約/牽手 fragment**砍「好感高→低」階梯句(五階表＋好感數字已在場)，只留「依個性與好感真實演出、不預設結果」。
- **時間尺度**兩個絕對句合併成單一決策規則(語義原封：禁跳時段＋禁時間長度字眼＋系統宣告推進才承接)。
- **敘事終極警告**雙版本(driveOn 三元)抽出共同尾句，只留 drive 差異前綴。
- (B5)過期註解「specificRules 絕對禁止血量」更正(該禁令現在 USER 側)。

**收益**：SYSTEM 端 -489 字(nsfwBaseRules -352＋specificRules -137)＋USER 常駐約 -600 字＋條件式 fragment 約 -140，合計常駐約 **-1,100 字(~13%)**；矛盾 2 個消除、三講以上的重複規則 5 組歸一。**PROTECTED 未動**：親密尺度五階本體、篇幅數字、對話格式、driveStr 行為設計。**Batch 3 未做**(三個「最高優先級」收斂／SYSTEM 雙列表合併)——等本批實測無退化再議。

⚠ **紅線註記**：本批依玩家明確選「B」授權刪改 nsfwBaseRules 重複段(kanshou-only，語義原封搬移至慾海律令 canonical)。Engine_Combat.gs 全程未動。

**驗證**：`bash check.sh` 全過、Engine_Combat.gs diff 空、慾海律令新編號 0-6 與全部交叉引用一致、無「見下方/第7條」殘留。
