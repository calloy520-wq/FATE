# FATE 第五次聖杯戰爭（第8組異常參戰者）— 專案說明

這是一個用 Google Apps Script（GAS）寫的繁體中文文字 RPG，後端 `Code.js`，前端 `Index.html`，資料庫是一份 Google 試算表。請用**繁體中文**回覆使用者（Alsea）。

## 檔案結構
- `Code.js`：後端主程式（GAS 上叫 `Code.gs`，本機 clasp 會轉成 `.js`，推送時自動轉回）。
- `Index.html`：前端畫面與全部前端 JS，透過 `google.script.run` 呼叫後端函式。
- `SetupDB.js`：建立試算表分頁的初始化腳本（`initFateDatabase`）。
- `appsscript.json`：GAS 專案設定。
- `.github/workflows/deploy.yml`：自動部署流程（先跑語法檢查與 `tests/`，失敗就不部署）。
- `tests/run-tests.js`：Node 測試，載入 `Code.js` 測純邏輯函式。執行 `node tests/run-tests.js`。
- `.claspignore`：白名單，只推 `Code.js`、`Index.html`、`SetupDB.js`、`appsscript.json` 到 GAS。新增要上 GAS 的檔案時必須加進白名單；**測試或工具腳本絕對不能被推上去**（會在 GAS 造成函式衝突）。

## 部署流程（重要）
- **推送到 `main` 會立刻部署到正式遊戲**：GitHub Actions 先 `clasp push`，再 `clasp deploy -i <部署ID>` 更新既有網頁應用程式部署，網址不變。
- 憑證存在 GitHub Secrets（`CLASPRC_JSON`、`SCRIPT_ID`），**看不到也不需要看**。
- 倉庫是**公開**的，也是唯一的正本。使用者不應直接在 GAS 編輯器改程式（會被下次部署覆蓋）。
- 較大的改動：先開分支與使用者確認，再合併到 `main`。
- 無法查看 Actions 執行結果時，請使用者到 Actions 頁面確認綠勾或紅叉。

## 絕對不要做
- 不要把任何金鑰、token、`.clasprc.json`、`.clasp.json` 放進倉庫或貼進對話。API Key 只放在 GAS「指令碼屬性」：`OAPIKEY`（OpenRouter）、`NAI_API_KEY`（NovelAI）。
- 不要把試算表資料（`Players_Save`、`ChatLog` 的玩家存檔與對話）放進倉庫。
- 不要改變六維能力值鎖定、第8組獨立不頂替等遊戲設計規則（見下方）。

## 修改程式時的檢查
- 推送前用 `node --check Code.js` 做語法檢查，並跑 `node tests/run-tests.js`（GAS 是 V8 環境，`Code.js` 裡不能用 Node 模組）。新增純邏輯函式時順手補測試。
- 改後端函式名稱或回傳格式前，先全文搜尋 `Index.html`，前後端必須同步。前端呼叫的後端函式包括：`startNewGame`、`loadExistingGame`、`processFateTurnTextOnly`、`completeCreationAndSummon`、`generateTurnCgAsync`、`retrySceneImage`、`savePlayerSettingsOnly`、`updateCustomLocationDesc`、`postFuyukiForumMessage`、`sendAllySmsMessage`、`markPhoneMessagesRead`、`resetCurrentRunKeepCareer`、`startNextLoopReincarnation`、`enhanceMasterAppearance`、`extractMasterFromImage`、`previewMasterOutfit`。
- 回合推演用 `ScriptLock`，但**只在讀存檔與寫回時持有**；等待 Gemini 時會放開，寫回前重新讀取並比對 `meta.turnCount`，被別的視窗推進過就放棄寫入。召喚流程、同盟簡訊 AI 回覆同理。不要改回「整個回合都鎖著」（多人同時玩會互相卡住、逾時）。
- 生圖用獨立的 `UserLock`，不要和回合推演共用同一把鎖。網頁以部署者身分執行，所以這把鎖實際上是全體玩家共用，一次只畫一張（配合 NovelAI 同時只能生成一張）。
- 前端生圖逾時：一般 60 秒、重骰 45 秒；改後端流程時別讓生圖耗時遠超過這個範圍。
- 新增或修改「試算表自動升級」內容（補陣營／角色／世界書）時，要把 `SCHEMA_VERSION_` 改成新值，否則不會執行。
- AI 回傳的 `faction_updates` 會經 `resolveFactionKey_` 對應回既有陣營名稱，對不上的會被丟棄；新增陣營時記得補 `FACTION_ALIAS_GROUPS_`。

## 提示詞與記憶
- 每回合只送「相關角色」的服裝（御主、契約從者、最近出場者、服裝偏離預設者），角色清單只送 ID 與前兩個名稱；地標只有當前地點附完整描述。
- 長期記憶：`row[30]` 前情提要（200 字內）＋ `meta.keyEvents` 重要事件清單（最多 15 條，AI 以 `key_events_add`／`key_events_resolve` 增減），會顯示在「📊 情報」視窗。
- 同盟簡訊由 AI 以陣營口吻回覆（`generateAllySmsReply_`），失敗時退回固定句。

## NovelAI 繪圖
- 主提示詞放人數標籤（`2girls, 1boy, multiple characters`）；角色欄位一律以 `girl`／`boy` 開頭，不放 `1girl`、`solo`（`normalizeCharCoreForNai_`）。
- 成人模式（`Players_Save` F 欄、設定視窗開關）**預設開啟**（新角色預設 TRUE；既有存檔已一次性設為 TRUE，記錄在指令碼屬性 `FATE_ADULT_DEFAULT_APPLIED`，不會再覆蓋玩家之後的選擇）。只有畫面有裸露時才加 `nsfw`，普通場面不加；關閉時不加。
- 視覺導演取劇情「開頭＋結尾」摘錄，以結尾（最新畫面）為準；服裝欄不得含髮色、瞳色、體型。

## 讀取與快取
- `Char_Appearance`、`Lorebook`、`Factions_Relations` 是設定資料，讀一次後放進 CacheService（6 小時）＋單次執行內的記憶變數。
- 在試算表手動編輯這三個分頁時，`onEdit` 簡易觸發器會自動清快取；若沒生效，到 GAS 編輯器執行 `clearFateConfigCache()`。
- 試算表升級（`ensureSchemaUpgraded_`）只在 `SCHEMA_VERSION_` 變動時跑一次，版本記在指令碼屬性 `FATE_SCHEMA_VERSION`。
- `Players_Save` 找玩家只讀 A 欄；`ChatLog` 先讀 A 欄定位，再只讀需要的列。不要改回 `getDataRange()` 讀整張表。
- `ChatLog` 的 H 欄（繪圖 payload）每位玩家只保留最近 6 回合（`CHATLOG_PAYLOAD_KEEP`），更舊的會清空；劇情文字保留。

## 使用的服務
- 劇情：OpenRouter，模型 `google/gemini-3.1-flash-lite`。
- 繪圖：NovelAI V5（`nai-diffusion-5-full`），由「視覺導演」先把中文劇情翻成英文 Danbooru 標籤再繪圖。

## 試算表分頁（欄位順序不可隨意更動）
- `Char_Appearance`：A 角色ID／B 觸發名稱／C 性別／D 核心體貌／E 預設服裝／F 負面UC／G 可召喚（TRUE/FALSE）。`saber_alter` 永遠不可開局召喚。
- `Factions_Relations`：A 陣營名稱／B 御主ID／C 從者ID／D 預設狀態／E 預設態度／F 原作主從關係與人際內幕。共 6 組陣營，另有玩家獨立的第 8 組；真Assassin 路線觸發後，存檔裡會多出「臟硯組 (真Assassin陣營)」（不寫進這個分頁）。
- `Lorebook`：A 關鍵字／B 類別／C 優先度（≥10 每回合必載入）／D 內容。
- `Players_Save`：32 欄（程式用 0 起算索引）。`row[5]` 成人模式、`row[21]` 好感度、`row[28]` 服裝 JSON、`row[29]` 陣營狀態 JSON、`row[31]` meta JSON（回合數、背包、手機簡訊與論壇、傷勢、路線旗標、重要事件等）。HP／副從者 NP 欄位未使用但保留，**不可刪欄**（會讓後面所有索引錯位）。
- `ChatLog`：A 玩家／B 回合／C 時間／D 時間地點／E 玩家行動／F AI劇情／G 出場角色／H 繪圖 payload／I seed。

## 核心遊戲規則（不要破壞）
- 玩家是正規陣營之外獨立參戰的第 8 組，不頂替任何陣營；只有真正收服副從者時，原陣營才改為「已歸屬第8組」。
- 御主六維與從者參數創角後固定鎖定，不因鍛鍊改變。
- 同盟陣營彼此照應、不內鬥；後台陣營廝殺要慢，不可輕易把七組打光。
- `TRUE_VICTORY` 由伺服器驗證：仍有未化解的敵對陣營，或在日常模式，一律降回 `CONTINUE`。
- 服裝以劇情為準：洗澡自動脫衣、開打自動換戰鬥裝，全裸後主動穿衣才還原。
- 黑櫻、黑 Saber 出現時，同場不得再出現原版櫻或 Saber。
- 真Assassin 路線：`meta.routeFlags` 個別記錄美狄亞（`caster`）與小次郎（`assassin`）是否退場；任一退場且間桐陣營仍在時，自動新增「臟硯組 (真Assassin陣營)」並由咒腕哈桑（`hassan`）接替山門。收服柳洞寺其中一騎時不會整組改為歸屬第8組。
- 道具固定效果由伺服器結算：`mana_gem_s` +35 MP、`mana_gem_m` +65 MP、`smoke_bomb` 警戒度 −15（`ITEM_EFFECTS_`）；保命符的 id 必須是 `aegis_charm`。
- AI 回傳不認得的地名時維持原地；副從者靈基「消滅」會清空副從者欄位；御主狀態寫「已死亡」視同死亡結局（保命符仍可擋下）。

## 已修正的問題（不要改回去）
- `servant2_condition` 欄位名稱拼寫已修正。
- 同職階敵對陣營不會每回合被誤判為歸屬第8組。
- Gemini JSON 回傳有容錯解析與一次重試；主回合 `max_tokens` 為 3000。
- 簡訊每串上限 30 則，meta JSON 過長會自動裁切，避免超出儲存格上限。
- 導演翻譯後的繪圖 payload 會回寫 ChatLog，重新讀檔後重骰 CG 仍保留裸體與戰鬥裝。
- 回合數存在 `meta.turnCount`，不要每回合掃描整張 ChatLog。

## 已知限制
- 登入刻意不設密碼：遊戲只給 5 人以內的朋友圈遊玩，御主名號只用來區分各自的存檔。不需要再提議加密碼。
- 主從者（第一位從者）靈基「消滅」時目前不會自動解約或遞補，交由劇情處理。
