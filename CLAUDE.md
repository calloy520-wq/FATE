# FATE 第五次聖杯戰爭（第8組異常參戰者）— 專案說明

這是一個用 Google Apps Script（GAS）寫的繁體中文文字 RPG，後端 `Code.js`，前端 `Index.html`。**試算表只保留最低限度的存檔資料**（`Players_Save`、`ChatLog`），角色、陣營、世界書全部內建在 GAS 程式裡。請用**繁體中文**回覆使用者（Alsea）。

## 檔案結構
- `Code.js`：後端主程式（GAS 上叫 `Code.gs`，本機 clasp 會轉成 `.js`，推送時自動轉回）。
- `Index.html`：前端畫面與全部前端 JS，透過 `google.script.run` 呼叫後端函式。
- `GameData.js`：內建角色資料 `FATE_CHARACTERS_`（外觀、服裝、負面提示詞、可否開局召喚）。
- `Lore.js`：內建世界書 `FATE_LORE_BUILTIN_`。
- `SetupDB.js`：`initFateDatabase` 只建立缺少的 `Players_Save`、`ChatLog` 分頁並寫標題，**絕不清除或刪除既有資料**。
- `appsscript.json`：GAS 專案設定。
- `.github/workflows/deploy.yml`：自動部署流程（先跑語法檢查與 `tests/`，失敗就不部署）。
- `tests/run-tests.js`：Node 單元測試，載入 `Code.js` 測純邏輯函式。
- `tests/sim-turn.js`：用假試算表＋假 Gemini 跑完整流程（新遊戲→召喚→回合→論壇假消息→簡訊→讀檔），抓執行期錯誤。改動回合流程後一定要跑。
- `.claspignore`：白名單，只推 `Code.js`、`GameData.js`、`Lore.js`、`Index.html`、`SetupDB.js`、`appsscript.json` 到 GAS。GAS 所有 `.js` 檔共用同一個全域空間（測試也照 GameData → Lore → Code 的順序載入）。新增要上 GAS 的檔案時必須加進白名單；**測試或工具腳本絕對不能被推上去**（會在 GAS 造成函式衝突）。

## 部署流程（重要）
- **推送到 `main` 會立刻部署到正式遊戲**：GitHub Actions 先 `clasp push`，再 `clasp deploy -i <部署ID>` 更新既有網頁應用程式部署，網址不變。
- 憑證存在 GitHub Secrets（`CLASPRC_JSON`、`SCRIPT_ID`），**看不到也不需要看**。
- 倉庫是**公開**的，也是唯一的正本。使用者不應直接在 GAS 編輯器改程式（會被下次部署覆蓋）。
- 較大的改動：先開分支與使用者確認，再合併到 `main`。
- **部署要省著用**：每次部署都會在 GAS 產生一個新版本，一個專案最多 200 個版本，用完就無法部署（要到 GAS 編輯器「專案記錄」手動刪舊版本）。所以改動一律先累積在工作分支，**只有使用者明確說「上線」才合併到 `main`**，盡量一次合併一大批。
- 無法查看 Actions 執行結果時，請使用者到 Actions 頁面確認綠勾或紅叉。

## 絕對不要做
- 不要把任何金鑰、token、`.clasprc.json`、`.clasp.json` 放進倉庫或貼進對話。API Key 只放在 GAS「指令碼屬性」：`OAPIKEY`（OpenRouter）、`NAI_API_KEY`（NovelAI）。
- 不要把試算表資料（`Players_Save`、`ChatLog` 的玩家存檔與對話）放進倉庫。
- 不要改變六維能力值鎖定、第8組獨立不頂替等遊戲設計規則（見下方）。

## 修改程式時的檢查
- 推送前用 `node --check Code.js` 做語法檢查，並跑 `node tests/run-tests.js` 與 `node tests/sim-turn.js`（GAS 是 V8 環境，`Code.js` 裡不能用 Node 模組）。新增純邏輯函式時順手補測試；新增前端呼叫的後端參數時，模擬測試也要跟著補。
- 改後端函式名稱或回傳格式前，先全文搜尋 `Index.html`，前後端必須同步。前端呼叫的後端函式包括：`startNewGame`、`loadExistingGame`、`processFateTurnTextOnly`、`completeCreationAndSummon`、`generateTurnCgAsync`、`retrySceneImage`、`savePlayerSettingsOnly`、`updateCustomLocationDesc`、`postFuyukiForumMessage`、`sendAllySmsMessage`、`markPhoneMessagesRead`、`resetCurrentRunKeepCareer`、`startNextLoopReincarnation`、`enhanceMasterAppearance`、`extractMasterFromImage`、`previewMasterOutfit`。
- 回合推演用 `ScriptLock`，但**只在讀存檔與寫回時持有**；等待 Gemini 時會放開，寫回前重新讀取並比對 `meta.turnCount`，被別的視窗推進過就放棄寫入。召喚流程、同盟簡訊 AI 回覆同理。不要改回「整個回合都鎖著」（多人同時玩會互相卡住、逾時）。
- 生圖用獨立的 `UserLock`，不要和回合推演共用同一把鎖。網頁以部署者身分執行，所以這把鎖實際上是全體玩家共用，一次只畫一張（配合 NovelAI 同時只能生成一張）。
- 前端生圖逾時：一般 60 秒、重骰 45 秒；改後端流程時別讓生圖耗時遠超過這個範圍。
- `ensureSchemaUpgraded_` 只處理 `Players_Save` 的標題修正與成人模式預設；修改它時要把 `SCHEMA_VERSION_` 改成新值，否則不會執行。
- AI 回傳的 `faction_updates` 會經 `resolveFactionKey_` 對應回既有陣營名稱，對不上的會被丟棄；新增陣營時記得補 `FACTION_ALIAS_GROUPS_`。

## 提示詞與記憶
- 回合推演的規則是固定常數 `FATE_GM_SYSTEM_PROMPT_`（裁定原則、型月世界邏輯、本作固定設定、反饋機制、死亡勝利、格式、JSON 格式）；每回合變動的資料（玩家名、基調、能力、背包、手機、流言、路線、地標、角色 ID、狀態）全部放 `statePrompt`。不要把變動資料塞回系統提示詞（會破壞快取、讓提示詞膨脹）。
- 設計方針：**自由但合乎邏輯**——玩家可以嘗試任何行動，以型月世界邏輯與能力決定成功程度和代價；規則寫成原則，不要一條條加禁止事項。模型是輕量的 flash-lite，提示詞越短越有條理越穩。
- 每回合只送「相關角色」的服裝（御主、契約從者、最近出場者、服裝偏離預設者），角色清單只送 ID 與前兩個名稱；地標只有當前地點附完整描述。
- 長期記憶：`row[30]` 前情提要（200 字內）＋ `meta.keyEvents` 重要事件清單（最多 15 條，AI 以 `key_events_add`／`key_events_resolve` 增減），會顯示在「📊 情報」視窗。
- 簡訊：同盟陣營，或劇情中取得聯絡方式的陣營（`meta.smsContacts`，AI 以 `new_contacts` 新增；伺服器另外要求玩家輸入或劇情中出現手機／號碼／電話／名片等字眼才承認）可傳。AI 以陣營口吻回覆並判斷是否相信（`generateAllySmsReply_` 回傳 reply／believed／reaction），內容與反應寫入 `pendingSmsNote` 交給下一回合。可勾選「假情報」。
- 流言：論壇貼文與簡訊假情報記錄在 `meta.rumors`（最多 10 條），AI 以 `rumor_updates` 更新相信／識破的陣營與影響；8 回合沒人理會自然平息。手機論壇頁有「流言追蹤」。
- 活的論壇：AI 每回合可用 `forum_posts` 產生 0～2 則市民目擊貼文。
- 路線傾向：`meta.routeTendency`（fate／ubw／hf／shadow／conquest，0～100），AI 每回合以 `route_tendency_delta` 加減；最高分 ≥ 40 且領先 ≥ 12 時確立 `meta.activeRoute`，轉線需領先現路線 24 分。定義在 `ROUTE_DEFS_`，顯示在「📊 情報」。
- 每回合結算：伺服器比對回合前後狀態，在劇情尾端附上「【本回合結算】」（MP、警戒、好感、移動、傷勢、道具、陣營變化、聯絡人、流言、論壇）。AI 讀歷史時會自動去掉這類系統行。

## NovelAI 繪圖
- 主提示詞放人數標籤（`2girls, 1boy, multiple characters`）；角色欄位一律以 `girl`／`boy` 開頭，不放 `1girl`、`solo`（`normalizeCharCoreForNai_`）。
- 成人模式（`Players_Save` F 欄、設定視窗開關）**預設開啟**（新角色預設 TRUE；既有存檔已一次性設為 TRUE，記錄在指令碼屬性 `FATE_ADULT_DEFAULT_APPLIED`，不會再覆蓋玩家之後的選擇）。只有畫面有裸露時才加 `nsfw`，普通場面不加；關閉時不加。
- 視覺導演取劇情「開頭＋結尾」摘錄，以結尾（最新畫面）為準；服裝欄不得含髮色、瞳色、體型。
- **角色位置絕對不寫死**：`use_coords: false`、所有角色中心都是 0.5，由 NovelAI 自行構圖（AI's Choice）。導演只用文字描述位置關係（前景／背景、誰在誰身後、面向誰、遠近），不給座標或左右格位。
- 第一人稱視角（設定開關，`meta.cameraMode` = `pov`／`third`，預設 third）：繪圖時移除 `player_master`、主提示詞加 `pov, first-person view`（沒有其他角色時加 `no humans, scenery`），導演改以「離鏡頭多近、是否看向鏡頭」描述，玩家用手做事時加 `pov hands`。不會多生圖。
- 互動語法只允許 `source#`／`target#`／`mutual#` 前綴，其他「xxx#」前綴會被 `stripBadInteractionPrefix_` 去掉。
- NovelAI 免費範圍（Opus）：一次 1 張、不用底圖、尺寸 ≤ 約 1024×1024 像素量（目前 1216×832）、steps ≤ 28。V5 的免費額度是會自動回復的用量條，用完會**自動改扣 Anlas**，所以不要調高尺寸、steps 或一次生多張。

## 內建資料（不在試算表）
- 角色：`GameData.js` 的 `FATE_CHARACTERS_`。新增角色時填 id、names（第一個為顯示名稱）、gender、core、outfit、uc、summonable；`saber_alter` 一律不可開局召喚。要畫寶具特效再到 `Code.js` 的 `NP_VISUAL_EFFECTS_` 補一筆。
- 陣營：`Code.js` 的 `CANONICAL_7_FACTIONS_`（陣營名稱／御主ID／從者ID／預設狀態／預設態度／內幕）。新增陣營記得補 `FACTION_ALIAS_GROUPS_`。
- 世界書：`Lore.js` 的 `FATE_LORE_BUILTIN_`（cat 分類／pri 優先度／keys 關鍵字／text 內容）。
  - 優先度 10 每回合必載入（控制在 5 條內）；其餘依關鍵字命中來源加權——玩家本回合行動 ×3、目前狀態（地點、從者、重要事件、擴散中流言、背包）×2、最近 2 回合劇情 ×1，不分大小寫。依分數→優先度排序，最多 8 條、3200 字，載入時附 `[分類]`。
  - 已寫進系統提示詞的核心規則不要再寫成世界書。標示「隱藏真相」的條目要提醒 AI 只在深入調查時揭露。
- 這些資料在單次執行內以記憶變數快取，不需要 CacheService。

## 讀取與寫入（試算表）
- `Players_Save` 找玩家只讀 A 欄；`ChatLog` 先讀 A 欄定位，再只讀需要的列。不要改回 `getDataRange()` 讀整張表。
- `ChatLog` 的 H 欄（繪圖 payload）每位玩家只保留最近 6 回合（`CHATLOG_PAYLOAD_KEEP`），更舊的會清空；劇情文字保留。

## 使用的服務
- 劇情：OpenRouter，模型 `google/gemini-3.1-flash-lite`。
- 繪圖：NovelAI V5（`nai-diffusion-5-full`），由「視覺導演」先把中文劇情翻成英文 Danbooru 標籤再繪圖。

## 試算表分頁（只有兩個，欄位順序不可更動）
- `Players_Save`：32 欄（程式用 0 起算索引）。`row[5]` 成人模式、`row[21]` 好感度、`row[28]` 服裝 JSON、`row[29]` 陣營狀態 JSON、`row[31]` meta JSON（回合數、背包、手機簡訊與論壇、傷勢、路線旗標、重要事件、流言、聯絡人等）。HP／副從者 NP 欄位未使用但保留，**不可刪欄**（會讓後面所有索引錯位）。
- `ChatLog`：A 玩家／B 回合／C 時間／D 時間地點／E 玩家行動／F AI劇情／G 出場角色／H 繪圖 payload／I seed。
- 舊的 `Char_Appearance`、`Factions_Relations`、`Lorebook` 分頁已不再使用，程式不會讀取。

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
