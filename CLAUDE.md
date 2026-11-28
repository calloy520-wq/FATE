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
- `tests/stress-guards.js`：伺服器把關壓力測試。手寫「AI 常犯的錯」當作 Gemini 回應（重複扣令咒、亂扣道具、沒交戰就淘汰、亂送副從者、型別錯亂、結局值寫錯、約定與同行流程、名冊換人、好感歸零解約…），確認伺服器擋得住。新增伺服器把關時順手補一條；會受時段推進隨機影響的情境要固定 AP、`ap_cost: 0`。
- `.claspignore`：白名單，只推 `Code.js`、`GameData.js`、`Lore.js`、`Index.html`、`SetupDB.js`、`appsscript.json` 到 GAS。GAS 所有 `.js` 檔共用同一個全域空間（測試也照 GameData → Lore → Code 的順序載入）。新增要上 GAS 的檔案時必須加進白名單；**測試或工具腳本絕對不能被推上去**（會在 GAS 造成函式衝突）。

## 部署流程（重要）
- **推送到 `main` 會立刻部署到正式遊戲**：GitHub Actions 先 `clasp push`，再 `clasp deploy -i <部署ID>` 更新既有網頁應用程式部署，網址不變。
- 憑證存在 GitHub Secrets（`CLASPRC_JSON`、`SCRIPT_ID`），**看不到也不需要看**。
- 倉庫是**公開**的，也是唯一的正本。使用者不應直接在 GAS 編輯器改程式（會被下次部署覆蓋）。
- 較大的改動：先開分支與使用者確認，再合併到 `main`。
- **部署要省著用**：每次部署都會在 GAS 產生一個新版本，一個專案最多 200 個版本，用完就無法部署（要到 GAS 編輯器「專案記錄」手動刪舊版本）。所以改動一律先累積在工作分支，**只有使用者明確說「上線」才合併到 `main`**，盡量一次合併一大批。
- **不得偷偷改動**：所有改動都要先告訴使用者改了什麼；不可夾帶使用者不知道的改動；使用者說不上線就不合併到 `main`。如果某個要求碰到 AI 不願意做的界線，要當面說明，不可表面答應、私下加限制。
- **尚未同意上線的改動**：全裸把關（`NO_NUDE_CHAR_IDS_`、`sanitizeNudeOutfitForChar_`）目前只在工作分支，使用者**尚未同意上線**；部署時必須逐筆挑選 commit，不得包含這筆改動，除非使用者明確同意。部署前要檢查推上去的 `Code.js` 不含這兩個名稱並回報。做法：以 `origin/main` 建暫存分支 → `git checkout <工作分支> -- .` → `python3 tools/strip-nude-guard.py .`（精確拿掉把關的定義、呼叫、測試與說明段落）→ grep 確認 0 次、跑全部測試 → 推上 main。逐筆 cherry-pick 會一直和把關的測試衝突，不要用。若程式改動讓腳本的比對字串失效，腳本會 assert 失敗，要先修腳本。`tools/` 不在 `.claspignore` 白名單內，不會被推上 GAS。
- 無法查看 Actions 執行結果時，請使用者到 Actions 頁面確認綠勾或紅叉。

## 絕對不要做
- 不要把任何金鑰、token、`.clasprc.json`、`.clasp.json` 放進倉庫或貼進對話。API Key 只放在 GAS「指令碼屬性」：`OAPIKEY`（OpenRouter）、`NAI_API_KEY`（NovelAI）。
- 不要把試算表資料（`Players_Save`、`ChatLog` 的玩家存檔與對話）放進倉庫。
- 不要改變六維能力值鎖定、第8組獨立不頂替等遊戲設計規則（見下方）。

## 修改程式時的檢查
- **`Index.html` 的 JavaScript 裡不能出現雙斜線字串**（例如 `'https://...'`）：GAS 送出網頁時會把 JS 的雙斜線註解刪掉，連字串裡的也會被刪，整段程式就壞掉（2026-11 曾因音樂網址讓全員卡在登入畫面）。網址要寫成 `'https:' + '/' + '/...'`。錯誤顯示器放在獨立的第一個 `<script>`，主程式壞掉時畫面頂端會出現紅條。
- 推送前用 `node --check Code.js` 做語法檢查，並跑 `node tests/run-tests.js`、`node tests/sim-turn.js` 與 `node tests/stress-guards.js`（GAS 是 V8 環境，`Code.js` 裡不能用 Node 模組）。新增純邏輯函式時順手補測試；新增前端呼叫的後端參數時，模擬測試也要跟著補。
- 改後端函式名稱或回傳格式前，先全文搜尋 `Index.html`，前後端必須同步。前端呼叫的後端函式包括：`getPlayerSlots`、`startNewGame`、`loadExistingGame`、`processFateTurnTextOnly`、`completeCreationAndSummon`、`generateTurnCgAsync`、`retrySceneImage`、`savePlayerSettingsOnly`、`updateCustomLocationDesc`、`postFuyukiForumMessage`、`sendAllySmsMessage`、`markPhoneMessagesRead`、`resetCurrentRunKeepCareer`、`startNextLoopReincarnation`、`enhanceMasterAppearance`、`previewMasterOutfit`、`getServantTemplates`、`enhanceServantAppearance`、`previewCustomServant`、`saveSandboxCharacter`、`deleteSandboxCharacter`、`setSandboxParty`、`previewSandboxCharacter`。（上傳圖片抽詞 `extractMasterFromImage` 已依使用者要求移除）
- 回合推演用 `ScriptLock`，但**只在讀存檔與寫回時持有**；等待 Gemini 時會放開，寫回前重新讀取並比對 `meta.turnCount`，被別的視窗推進過就放棄寫入。召喚流程、同盟簡訊 AI 回覆同理。不要改回「整個回合都鎖著」（多人同時玩會互相卡住、逾時）。
- 生圖用獨立的 `UserLock`，不要和回合推演共用同一把鎖。網頁以部署者身分執行，所以這把鎖實際上是全體玩家共用，一次只畫一張（配合 NovelAI 同時只能生成一張）。
- 前端生圖逾時：一般 60 秒、重骰 45 秒；改後端流程時別讓生圖耗時遠超過這個範圍。
- `ensureSchemaUpgraded_` 只處理 `Players_Save` 的標題修正與成人模式預設；修改它時要把 `SCHEMA_VERSION_` 改成新值，否則不會執行。
- AI 回傳的 `faction_updates` 會經 `resolveFactionKey_` 對應回既有陣營名稱，對不上的會被丟棄；新增陣營時記得補 `FACTION_ALIAS_GROUPS_`。

## 登入流程與自由沙盒（2026-11 使用者設計）
- 登入分兩頁：第 1 頁輸入名號（沒用過自動建帳號）→ `getPlayerSlots(name)` 回報兩個存檔欄位的進度；第 2 頁選「⚔️ 聖杯戰爭」或「🌸 自由沙盒」，各有「📜 讀取／開新局」。開新局時那一欄已有進度就先確認「砍掉重來」（走 `resetCurrentRunKeepCareer`，生涯勝敗保留、另一欄不受影響），沒有就 `startNewGame`。舊的「開始新紀元／讀取世界線／清空本輪」按鈕已拿掉。
- **兩種模式分開存**：自由沙盒那一局在 `Players_Save` 用「名號・沙盒」（`SANDBOX_SUFFIX_`）另存一列，ChatLog 也跟著分開；`validatePlayerName_` 接受這個後綴。模式由存檔欄位決定（`slotModeOf_`：建檔、清空、創角都寫入 `row[3]`），設定視窗的「日常模式」開關已拿掉、後端也不再接受中途切換 `gameMode`。劇情、提示詞、畫面一律用 `displayNameOf_` 顯示名號（不帶後綴）；前端用 `displayPlayerName`，沙盒在名牌加 🌸。
- 自由沙盒＝原本的 SANDBOX 日常模式（沒有聖杯戰爭、AP 無限、不會通關、不發戰鬥道具），開局創角但不選從者（見下方同行）；難度只開放常理與搞笑（前端隱藏鐵血、龍傲天，後端也會改回常理）。
- 沙盒畫面：隱藏令咒、沒有從者時隱藏好感徽章；「📊 情報」只剩「📌 重要事件」（沒有陣營、隊伍、路線）；論壇說明改成市民閒聊、隱藏假消息勾選；論壇發文（`pendingForumNote`）以閒聊身分交給下一回合。
- **沙盒不帶戰爭脈絡**（2026-11 實玩發現沙盒劇情一直寫偵查、開戰、陣營好感）：statePrompt 第一行是「日常故事模式（優先遵守）」（刻意不寫「沒有聖杯戰爭」字樣，flash-lite 會照抄進劇情），並省略幕後戰況、七組陣營、情報、十二試煉、戰爭同行、最終 Boss、柳洞寺路線、副契約、名冊、流言／路線／通訊錄、AP 與警戒度、令咒；伺服器丟掉 AI 回報的 faction_updates、intel_updates、faction_favor_delta、rumor_updates、route_tendency_delta、appointments_add、incoming_messages、new_contacts、new_servant2_id，不跑 `updateCompanions_`、`updateFactionIntel_`。沙盒開局在第 1 天清晨、手機空白。輸入 token 每回合少約 15%。
- 沙盒時間：行動不限，但 `meta.sandboxClock` 累積 ap_cost（沒給算 1）滿 3 推進一個時段（天氣跟著變、沒有後台廝殺）；兩把鑰匙確認真的睡覺時直接到隔天清晨（午覺、小睡只推進一個時段）。
- 創角畫面拿掉「行事風格傾向」（只會接在願望後面，效果很弱）與「開局模式」（改到登入第 2 頁）。
- **名單外的客串角色（只在沙盒）**：AI 以 `guest_chars`（最多 2 位：name、tag、gender、look、action）回報角色 ID 清單以外的人物；`sanitizeGuestChars_` 只留英文、底線換空格，**借用本作角色標籤的直接丟掉**（`rosterCharacterTags_`；實測原創角色「莉莉」被猜成 illyasviel_von_einzbern、畫成伊莉雅），伺服器登記成臨時角色 `guest_1`／`guest_2` 加進出場名單交給繪圖。聖杯戰爭模式不收。實測初音未來（知名角色標籤）畫得準、原創角色靠外貌描述畫成粉紅雙馬尾魔法少女。
- **沙盒同行與自創角色**（使用者設計：沙盒開局不選英靈，直接進入日常；同伴到同行挑現有角色或自創，最多同行 2 位、隨時切換；沒同行就不花提示詞）：沙盒創角畫面隱藏召喚對象與自創英靈，`completeCreationTextOnly` 在沙盒不召喚（主從者欄位留空，開場是日常而不是召喚陣，CG 只有御主）。頂部「👥 同行」（只在沙盒顯示）：上半「目前同行」可從現有角色（`sandboxRoster`＝GameData 全部角色，除了 player_master）加入或離隊；下半「✨ 自創角色」最多 5 位（`SANDBOX_CHAR_MAX_`），填名字、性別、身形、外觀／服裝／負面標籤、表情、個性、和玩家的關係，「✨ 找提示」沿用 `enhanceServantAppearance(..., 'sandbox')`（服裝改成日常穿著），「🎨 定裝預覽」`previewSandboxCharacter`，滿意再「💾 確定存檔」。存在沙盒那一列的 `meta.sandboxChars`／`meta.sandboxParty`（自創 ID `sbc_1`～`sbc_5`；同行可放現有角色 ID），`parseSaveRow_` 只在沙盒存檔用 `setActiveSandboxChars_` 登記進角色資料庫。砍掉重來時自創角色保留、同行清空。statePrompt（只在沙盒）：有同行才寫【同行中】、玩家行動提到不在身邊的自創角色名字才列出那位，否則一個字都不加；沒有主從者時寫「【主從者】無」。玩家在同行視窗換人後，下一回合提示詞寫【同行變動】誰離開（不要再寫她在場）、誰剛會合（`meta.sandboxPartyPrev` 在寫回前記錄本回合同行）；玩家說「一個人／獨自／單獨」（`isAloneAction_`）時同行者這回合不跟、也不補進繪圖。繪圖：同行者沒進出場名單、或劇情寫到自創角色名字時程式補上；AI 把自創角色放進 `guest_chars` 時丟掉，一律用存好的外貌。聖杯戰爭的提示詞與存檔完全不受影響。

## 提示詞與記憶
- 寫作基調（難度）：`GAME_TONE_PRESETS_` 每種有 `directive`（具體裁定指令），放在 statePrompt 最前面「本局基調（優先遵守）」，系統提示詞也有對應規則。實測同一個偷襲行動：搞笑＝滑稽閃開、龍傲天＝偷襲成功、常理＝被閃開、鐵血＝被反擊。`STORY_PLAYER_FIRST` 已改名「🐉 龍傲天模式」（鍵名不變以相容存檔）：玩家想做的都能實現，伺服器的淘汰兩步、十二試煉、英靈退場、結盟門檻與戰力判定都不套用。改基調時要保持這種明顯差異。**難度開局決定、本局鎖定**（使用者要求）：創角畫面的「🎚️ 難度」（`#create-tone`）隨 `completeCreationAndSummon` 的 `gameTone` 寫入 `meta.gameTone` 並設 `meta.toneLocked = true`；鎖定後 `savePlayerSettingsOnly`／`applyPendingSettingsToRow_` 忽略難度變更，設定視窗的難度選單變灰並註明；`resetCurrentRunKeepCareer`、`startNextLoopReincarnation` 設 `toneLocked: false`，回創角畫面可重選。舊存檔沒有旗標時，玩過回合（`turnCount > 0`）就視為鎖定（`isToneLocked_`）。
- 回合推演的規則是固定常數 `FATE_GM_SYSTEM_PROMPT_`（裁定原則、型月世界邏輯、本作固定設定、反饋機制、死亡勝利、格式、JSON 格式）；每回合變動的資料（玩家名、基調、能力、背包、手機、流言、路線、地標、角色 ID、狀態）全部放 `statePrompt`。不要把變動資料塞回系統提示詞（會破壞快取、讓提示詞膨脹）。
- 設計方針：**自由但合乎邏輯**——玩家可以嘗試任何行動，以型月世界邏輯與能力決定成功程度和代價；規則寫成原則，不要一條條加禁止事項。模型是輕量的 flash-lite，提示詞越短越有條理越穩。
- 每回合只送「相關角色」的服裝（御主、契約從者、最近出場者、服裝偏離預設者），角色清單只送 ID 與前兩個名稱；地標只有當前地點附完整描述。
- 長期記憶：`row[30]` 前情提要（200 字內）＋ `meta.keyEvents` 重要事件清單（最多 15 條，AI 以 `key_events_add`／`key_events_resolve` 增減），會顯示在「📊 情報」視窗。
- 聯絡管道（`CONTACT_CHANNELS_`）：玩家一律用手機送出，對方依原作設定用不同管道回覆——衛宮＝☎ 衛宮邸家用電話、遠坂＝🕊 使魔字條（Archer 轉達）、間桐＝📱 慎二簡訊、教會＝✉ 回信、柳洞寺＝☎ 寺廟電話、愛因茲貝倫＝🕊 白色小鳥字條、臟硯＝🐛 蟲使魔口信。管道定義只寫事實（誰回、用什麼方式、開頭標記），**不寫角色口吻**，口吻交給 Gemini。
- 聯絡可能沒接通：AI 依時間、陣營狀態、管道判斷 `answered`；沒接通時不啟動同盟支援、假情報不算放出、下一回合會知道對方沒回應。已淘汰的陣營多半無人回應。
- 遠坂凜沒有手機（原作設定的機械白痴）：世界書寫明、她的負面提示詞排除手機；傳給遠坂組的簡訊視為 Archer 轉達，回覆固定以「（使魔捎來的字條）」開頭，手機簡訊頁也會顯示說明。聯絡證據也接受「使魔、傳話、傳信」。
- 簡訊：同盟陣營，或劇情中取得聯絡方式的陣營（`meta.smsContacts`，AI 以 `new_contacts` 新增；伺服器另外要求玩家輸入或劇情中出現手機／號碼／電話／名片等字眼才承認）可傳。AI 以陣營口吻回覆並判斷是否相信（`generateAllySmsReply_` 回傳 reply／believed／reaction），內容與反應寫入 `pendingSmsNote` 交給下一回合。可勾選「假情報」。
- 流言：論壇貼文與簡訊假情報記錄在 `meta.rumors`（最多 10 條），AI 以 `rumor_updates` 更新相信／識破的陣營與影響；8 回合沒人理會自然平息。手機論壇頁有「流言追蹤」。
- 活的論壇：AI 每回合可用 `forum_posts` 產生 0～2 則市民目擊貼文。
- 路線傾向：`meta.routeTendency`（fate／ubw／hf／shadow／conquest，0～100），AI 每回合以 `route_tendency_delta` 加減；最高分 ≥ 40 且領先 ≥ 12 時確立 `meta.activeRoute`，轉線需領先現路線 24 分。定義在 `ROUTE_DEFS_`，顯示在「📊 情報」。
- 場地狀態延續：劇情改變地標樣貌（破壞、佈置、結界、修復）時，AI 以 `location_changes` 回報現況，存進 `meta.customLocationNotes`（與地圖上手動編輯「場地現況」是同一份），永久保留直到劇情再改變；地標清單會附上被改變地點的現況，導演會把現況畫進背景。
- 時間以狀態列為準（系統提示詞）：玩家行動寫的時段（傍晚、夜景）和現在不同時照實際時段描寫，不可跳時間（2026-11 實測：白天寫「眺望夜景」劇情就變晚上，清晨被寫成夕陽，標題、劇情、CG 對不上）。另外程式用 `detectTimeMismatch_`（`TIME_WORDS_`）：玩家行動寫的時段字眼（夕陽、夜景、朝陽…）和現在不同時，動態段前面加「時間檢查（優先遵守）」（「明天早上」「等到傍晚」等約之後的時間、晚安早安不算）；實測清晨看夕陽、白天看夜景、深夜看朝陽都照實際時段寫。
- 天氣（`meta.weather`，`WEATHER_TYPES_`：晴／陰／雨／霧／雪，原作 2 月初的冬木）：每次時段推進用 `rollWeather_` 變化（60% 維持、霧只在清晨與深夜），時段推進訊息與頂部時間徽章顯示天氣。statePrompt 寫天氣與影響（雨沖刷痕跡、霧利於潛行、雪留足跡），系統提示詞要求戶外描寫天氣；只有劇情真的改變天氣（大型魔術、天候寶具）時 AI 才回報 `weather_change`，結算顯示。繪圖：導演收到 Weather 行，`generateNovelAIImageSafe_` 用 `applyWeatherTags_` 在戶外場景補天氣標籤（室內字眼或已寫天氣就不加）；CG 用本回合劇情寫作時的天氣（`storyWeather`），不用時段推進後的新天氣。室內場景（`INDOOR_SCENE_RE_`）：`indoorWeatherFix_` 刪掉沒提到窗戶／玻璃／外面的雨雪片段，`closeUmbrellaIndoors_` 把角色手上的傘改成收起來（實測導演寫「門外看得到雨」，結果教堂裡下雨、主角室內撐傘）。戰力判定：霧中奇襲／潛行 +1、雨霧雪對遠坂組（Archer 狙擊）+1。
- 陣營主動行動（`drawProactiveEvent_`）：每回合機率 15%～45%（警戒度越高、越久沒事越高；發生後至少隔 3 回合），挑一個未淘汰的陣營依態度主動行動（敵對：窺探／突襲／挑戰書／陷阱；中立：拜訪／交易／偶遇；同盟：情報／求援／商量／邀約；教會：綺禮來訪／通知），寫進提示詞要求本回合一定發生。重傷休整的不會突襲。只有**同盟陣營**會主動傳訊（`incoming_messages`，伺服器擋掉非同盟的），寫入手機聯絡頁；非同盟的接觸一律在劇情中當面發生。結盟分階段（`gateFactionAlliance_`）：常理與鐵血模式下，敵對陣營一回合最多軟化成「談判中」；`isAllianceStatusText_` 不把談判中、交涉中、協商中、意向、解除、破裂當同盟（前端 `isAlliedText` 同步）。
- 教會是公開據點，手機上隨時聯絡得到。
- 陣營好感（`meta.factionFavor`，−100～100，開局值 `FACTION_FAVOR_START_`）：AI 以 `faction_favor_delta` 加減，每回合每組最多 ±15；常理與鐵血下好感 < 40 不能正式結盟。約定（`meta.appointments`，最多 3 筆）：AI 以 `appointments_add` 記錄和同盟或友善陣營（`canMakeAppointment_`：有聯絡方式或好感 ≥ 20、沒有敵對）約好的時間地點；到了那個時段人在約定地點 → 同盟加入同行、非同盟依約前來碰面（結算「📅 依約前來碰面」），錯過 → 好感 −10，對方不再同盟或重傷 → 取消。都顯示在「📊 情報」。
- 同行盟友（`meta.companions`，`updateCompanions_`）：玩家行動有「帶著／一起／跟我…」加上同盟陣營的人名，或「簡訊支援待命中」的盟友出現在劇情，就加入同行（最多 2 組）。同行者每回合寫進 statePrompt 要求在場；戰力判定算盟友參戰；不會被抽成主動行動；不能傳簡訊給同行者（直接當面說）。離開條件：解散／分頭、不再同盟、重傷、或同行滿 4 個時段（`timeIndex_`）。頂部狀態列顯示「🤝 同行」。同一回合不會「離開又加入」：到期當回合玩家又邀請 → 默默延長；被請留下／分頭的同回合不會因句中其他「一起／一同」被拉回。後台廝殺本來就排除同盟。
- 情報檔案（`meta.factionIntel`）：玩家「知道的」陣營狀態，和真相 `row[29]` 分開。只有親眼見到該陣營角色（`CHAR_FACTION_MARKERS_`）、同盟、聯絡接通、或 AI 回報 `intel_updates` 時才更新；幕後細節（「曾於…激戰」「遭…擊潰」）用 `publicIntelText_` 去掉。「📊 情報」視窗、手機聯絡頁、回合結算的陣營變化都只用情報；statePrompt 同時給真相（標明 GM 專用）與玩家情報。後台戰況（`meta.warTicker`）只給 GM，玩家只看到 `warTickerPublic` 異象與自動論壇目擊。
- 每回合結算：伺服器比對回合前後狀態，在劇情尾端附上「【本回合結算】」（MP、警戒、好感、移動、傷勢、道具、陣營變化、聯絡人、流言、論壇）。AI 讀歷史時會自動去掉這類系統行。

## 背景音樂
- 音樂檔放在倉庫 `music/`（不推上 GAS），前端經 jsDelivr（`cdn.jsdelivr.net/gh/calloy520-wq/FATE@main/music/`）載入；清單與規格見 `music/README.md`。
- **使用者覺得依情境換曲太突兀：現在固定循環播放設定裡選的一首（預設 `day`，存在 localStorage `fate_bgm_track`）**。後端 `pickBgmMood_` 仍回傳 `bgmMood`、前端 `playBgmMood(mood)` 也保留呼叫，但不再依 mood 切換曲目；之後若要恢復情境切換再改 `playBgmMood`。
- 設定視窗由 `initSettingsTabs` 依 `.settings-section` 標題自動切成分頁（遊戲／畫面／音樂／其他）。
- 開關與音量存在瀏覽器 localStorage（只影響該裝置），預設關閉；瀏覽器規定第一次點擊畫面後才會開始播放。
- jsDelivr 對 `@main` 有快取，新上傳的音樂可能要幾小時才生效。

## NovelAI 繪圖
- 主提示詞放人數標籤（`2girls, 1boy, multiple characters`）；角色欄位一律以 `girl`／`boy` 開頭，不放 `1girl`、`solo`（`normalizeCharCoreForNai_`）。
- 成人模式（`Players_Save` F 欄、設定視窗開關）：**新角色預設關閉**（2026-11 使用者要求改成 FALSE）；既有存檔維持各自的設定（當年一次性設為 TRUE 的遷移記錄在指令碼屬性 `FATE_ADULT_DEFAULT_APPLIED`，不會再執行）。只有畫面有裸露時才加 `nsfw`，普通場面不加；關閉時不加。
- 視覺導演取劇情「開頭＋結尾」摘錄，以結尾（最新畫面）為準；服裝欄不得含髮色、瞳色、體型。
- **角色位置絕對不寫死**：`use_coords: false`、所有角色中心都是 0.5，由 NovelAI 自行構圖（AI's Choice）。導演只用文字描述位置關係（前景／背景、誰在誰身後、面向誰、遠近），不給座標或左右格位。
- 第一人稱視角（設定開關，`meta.cameraMode` = `pov`／`third`；新角色召喚時寫入 `third`，舊存檔沒設定過的仍是 pov，刻意不改以免朋友們畫面突變）：繪圖時移除 `player_master`、主提示詞加 `pov, first-person view`（沒有其他角色時加 `no humans, scenery`），導演改以「離鏡頭多近、是否看向鏡頭」描述，玩家用手做事時加 `pov hands`。**視野外的角色不畫**：導演回報 `in_view`，程式另用 `isOutOfPovView_` 檢查（寫了 behind viewer／out of frame 等就算看不到，over shoulder／leaning in 仍算看得到），被排除的角色會從角色欄位與場景描述（`removeCharacterMentions_`）移除，並以 `buildCountTags_` 重算人數。不會多生圖。
- 玩家的親密動作優先（2026-11 實測：摸頭後劇情尾端插入使魔窺探，CG 變成戴頭盔警戒、摸頭沒畫到）：玩家行動是摸頭、擁抱、親吻、牽手、膝枕、掏耳朵、安慰、餵食且劇情確實發生時，導演畫那個動作；結尾只是察覺威脅、傳話、電話不取代它，只有攻擊真的打到那個場面才改畫戰鬥。光改導演規則 flash-lite 不聽，所以程式另用 `focusGestureExcerpt_`：玩家行動是親密動作且非戰鬥時，交給導演的劇情摘錄截到動作與反應為止（遇到「就在這時／突然／使魔／窺探／結界擾動」等插入就停）；實測從警戒畫面變成摸頭臉紅。導演規則 0：沒有 Weather 行就是晴天，不可自己加雨、雪、濕地、霧。
- 自己做危險的事要先看意圖（系統提示詞 FATAL_DEATH 段）：「我跳下橋」「我跳下水」沒寫想死就當作游泳、脫逃、抄捷徑，依能力與環境結算傷勢，不直接判死；只有明確求死或行為本身必死才可能死亡（使用者要求「打出來的文字有求死才可以死」）。自殺用的字詞判斷（`isSelfInflictedDeath_`）只在已經判定死亡後決定 CG 畫法，不會讓人死。
- 死亡回合：劇情寫到死亡那一刻就結束，**不再寫大聖杯編織的虛假美夢**（使用者決定：收尾交給老虎道場吐槽 `tiger_dojo_tip`，藤村大河與伊莉雅檢討死因、80 字內）。CG（只有一張）畫死亡那一刻。出場名單＝御主（倒下、瀕死）＋劇情 AI 列出的兇手（最多 2 個）＋在場的自己從者（悲痛、來不及）；一律第三人稱（第一人稱的局也照樣看得到御主）；御主不會被 3 人上限擠掉；導演收到 FATAL DEATH SCENE 規則；交給導演的摘錄用 `deathExcerpt_` 截在美夢之前（同一段裡只切掉提到夢的那句以後）。**玩家自己找死**（`isSelfInflictedDeath_`：對自己開槍、太陽穴、自殺、跳樓、割腕、服毒、抱著炸彈引爆…）時改成使用者指定的黑色幽默：主角是從者的錯愕臉，表情固定 `SELF_DEATH_SERVANT_FACE_`（冷酷、疑問、驚訝的複雜表情：瞪大眼、挑眉皺眉、嘴唇微開、手停在半空；使用者在 4 種寫法中選定，**不要可愛的張大嘴驚訝、冒汗**）。鏡頭照玩家設定（`deathCgStatus_`）：第一人稱＝她正面看著你（上半身）；第三人稱＝她在前景、御主趴在身後地上（牛仔鏡頭才拍得到地板）。跳樓、跳橋（`isJumpDeath_`）：畫面沒有御主的身體——第三人稱她獨自站在欄杆邊，第一人稱從下往上看她探出欄杆低頭看你（也跳過 `ensureMasterPresentInList_`）。自殺時不套用哭泣特寫。2026-11 實測 6 位從者 × 跳樓／炸彈／毒藥／割腕／開槍 × 兩種鏡頭都正確。舊版說明：用回合開始前的主從者判斷（御主一死契約就斷，回合後的從者是空的），導演收到 SELF-INFLICTED DEATH 規則，合併導演結果後程式再鎖定構圖（從者 foreground＋upper body、刪悲痛伸手；御主 background、small in frame）。實測導演原本把御主放大在前景、從者小小站後面。以前寫死成「御主哭著伸手＋自己的從者＋超現實夢境」，結果兇手不在畫面（只剩一隻憑空的大手，斯卡哈淡定站旁邊）、第一人稱畫成空廢墟。
- 導演只畫劇情當下明確出現的道具、武器與魔術效果，不自動加角色招牌物品。
- 畫面方向自動切換（`pickNaiSize_`）：畫面只有 1 個角色 → 直式 832×1216；2 人以上或純風景 → 橫式 1216×832（兩者像素量相同，都在免費範圍）。第一人稱濾掉視野外角色後會重新判斷。前端畫框依圖片比例切換（`.cg-viewport.portrait`，高度上限 78vh），圖片用 contain 不裁切。
- 御主沒有戰鬥服：導演收到的 battle_outfit 對御主是玩家自己設定的服裝（之前誤用 GameData 的預設黑色毛衣，開戰時克勞德被換裝）。
- 莫德雷德的全罩頭盔會把臉遮住，負面加 `helmet, full-face helmet, visor, covered face`（同黑貞德）。便服：`GameData.js` 的 `casual`（目前有斯卡哈、Saber、Rider）。本回合結束時人在據點（廢棄洋館）且沒開戰，就從戰鬥靈衣換成便服（人在據點沒開戰時不看劇情字眼，避免「警戒」「魔槍」等字誤換回戰鬥服）；離開據點或開戰換回。導演收到 `At Home Base`，只有在據點才能用便服；導演若把便服改回戰鬥服（`outfitSimilarity_` ≥ 0.5），程式會改回便服。武器只在戰鬥或解放寶具時才畫：系統提示詞要求非戰鬥時武器靈體化，非戰鬥場景的角色負面提示詞自動加入 `holding weapon, weapon, spear, polearm, sword`。
- 鏡頭規則（FRAMING，2026-11 八場景實測後加入）：臉是核心，導演選「能容下所有人的最近鏡頭」——1 人 cowboy shot／upper body（單人寶具 cowboy shot, from below），2～3 人 medium shot，wide shot 只限 4 人以上、兩方遠距離對戰或純風景；浪漫場景 upper body／close-up；鐵絲網、玻璃、人群不可擋在臉前面。實測 8 張有 4 張原本是遠景小人，改後都變成半身清楚。
- 導演文字的程式修正（`generateTurnCgAsync` 合併導演結果後）：
  - `refineFramingTags_`：medium shot 不是 Danbooru 標籤，1～2 人時換成 `cowboy shot`（實測小次郎從遠景小人變半身、戰鬥時臉也清楚）。
  - `refineGazeAction_`：「looking away from the viewer」裡的 viewer 反而讓角色看鏡頭 → 改成 `looking away, looking to the side`；視線不看鏡頭時該角色負面加 `looking at viewer`。
  - 擁抱／親吻（`isRomanticInteraction_`）：主提示詞改成 upper body 並去掉 medium／wide shot（`refineRomanceFraming_`）；`mutual#embrace` 換成 Danbooru 的 `mutual#hug`。
  - 第一人稱：畫面裡沒有對象，去掉 source#／target#／mutual# 前綴；有 `incoming kiss` 時主提示詞加 `incoming kiss, face focus`，角色加 `closed eyes, puckered lips` 並去掉微笑、半睜眼、看鏡頭。
  - 親密動作補 Danbooru 標籤（`INTIMACY_TAGS_`、`detectIntimacyTags_`，加在主提示詞）：從背後抱 `hug from behind`、親臉頰 `kissing cheek`（不用 incoming kiss，也不加嘟唇）、膝枕 `lap pillow`、摸頭 `headpat`、額頭相抵 `forehead-to-forehead`、牽手 `holding hands`、擁抱 `hug`。第一人稱另換構圖：膝枕 `LAP_POV_TAGS_`（`lap pillow, pov, lying, from below, looking down at viewer, 0.8::thighs::, face focus, ceiling, close-up`（大腿 1.0 偶爾膝蓋頂到鏡頭前，0.8 較穩）；只有膝枕沒有掏耳朵時負面加 `mimikaki, ear pick`（NovelAI 看到膝枕常自己補耳挖）；日文標籤「膝枕」「見上げる」實測沒有差別，NovelAI 只認英文 Danbooru 標籤；第三人稱膝枕用 `LAP_3RD_TAGS_`（`lap pillow, from above, close-up, upper body, face focus`，使用者在 3 種鏡頭中選了從上往下近景；兩人畫面一般不用 face focus，但膝枕這組 6 張實測都正常）；原本有 breasts，因為這組標籤會套用到所有角色（含孩童外觀角色）而拿掉，比對顯示有無差異很小；比對 12 種寫法：大腿降權到 0.6 時膝枕感消失、只像她低頭看你，upside-down 無效；同一個 seed 構圖大致固定，標籤只能微調）；摸頭 `headpat pov, from below, reaching towards viewer`；擁抱 `incoming hug`（站著迎面抱過來才用；躺著／在床上改用 `hug, lying, from above, upper body`，否則會畫出頭和身體斷開的怪圖）；親臉頰改成她從側面湊近閉眼。實測都比自然語言描述準。
  - 情緒高點（哭泣、流淚，1～2 人）：主提示詞人數標籤後面直接放 `upper body, face focus, streaming tears`（鏡頭標籤越前面權重越高）。
  - **重要發現**：角色服裝欄位加權寫了長裙、褲襪、靴子、高跟鞋時，NovelAI 會為了畫出它們把鏡頭拉成全身，導演寫上半身也沒用。`stripLowerBodyForCloseUp_`：鏡頭是 upper body／close-up／portrait／face focus 時拿掉下半身衣物標籤；cowboy shot 時只拿掉鞋類（`FOOTWEAR_RE_`）。實測櫻哭泣從全身變成淚眼特寫、Rider 不再每張都全身。
  - 兩人對打或面對面（2 人、互動含 clash／confront／duel／facing each other）：主提示詞加 `from side`、刪掉角色欄位的 foreground，避免一人站前景背對鏡頭（實測 Saber 背影 → 三次都是側面對峙、雙方臉都看得到）。導演規則也禁止無故背對鏡頭。
  - 權重檢查（2026-11）：服裝整段 1.15 權重保留（拿掉後士郎的圍裙會消失），拉成全身的問題改用特寫時刪下半身標籤解決；多人髮色 1.25、Archer／小次郎／哈桑角色名 1.2、Rider 眼睛與眼罩負面、黑 Saber 頭盔負面都是修正用，保留。
  - 接吻容錯：第一人稱只要角色欄位出現 kiss／kissing（導演常寫 kissing viewer）就補 `incoming kiss`；第三人稱接吻主提示詞人數後面放 `upper body, kiss, faces close together`，刪掉含 silhouette（剪影）的片段，並刪掉角色欄位的站位／腳部字眼（standing、tiptoes、foreground、in front of…，加權的服裝段不動）——close-up 加上站位字眼曾畫出一人特寫、一人站在遠處背景的怪圖，改後 4 個 seed 都正常。**兩人畫面不可用 face focus**（實測會畫出一張巨臉加一個小全身人）；face focus 只給單人。
  - 單人解放寶具（1 人且有 npBoost、非第一人稱）：主提示詞人數後面固定 `cowboy shot, from below, dynamic pose`，刪 wide／full body，並刪角色欄位的 feet、legs apart、center 等全身字眼（實測貞德、黑貞德原本是遠處小人）。
  - 掏耳朵：`mimikaki, holding ear pick`；第一人稱用 `MIMIKAKI_POV_TAGS_`（掏耳朵標籤＋同一組膝枕仰角）。2026-11 正式版實測 14 位女性角色膝枕＋掏耳朵都成功（伊莉雅兩版、小黑、美遊是孩童外觀，這類親密測試不做）。
  - **負面排除的東西不能出現在該角色自己的服裝與動作裡**（`stripActionTermsInUc_`，用 `removeTagsKeepWeights_` 保住權重語法）：劇情照原作寫 Rider「被眼罩覆蓋的雙眼」，導演把 blindfold 寫進加權 1.15 的服裝，比負面 1.4 還強，就畫出眼罩。現在組 payload 與導演合併時都會刪掉。也順便涵蓋日常場景的武器、別過頭時的 looking at viewer。
  - 黃昏：`addNightFillLight_` 把 orange-hued lighting 換成 warm lighting，並加 `natural skin tone, soft lighting`（避免整張連人物都變橘）。
- 只有 1 個角色時程式一律改直式（導演選橫式也會被蓋掉）；橫式會把單人畫成小點。
- 畫面方向由導演決定（`orientation`）：1 人或兩人貼身互動 → 直式；戰鬥、廣角、3 人以上、兩人有距離 → 橫式。導演沒回報時用 `pickNaiSize_`（1 人直式、其他橫式）。點擊 CG 會全螢幕放大（`openCgLightbox`），點擊或 Esc 關閉。
- CG 兩種重畫：「🔄 重骰」用同一組提示詞換 seed（構圖不滿意）；「🎬 重新導演」用保存的原始 payload（含 `_directorContext`）重新跑導演翻譯（圖跟劇情不符）。
- 浪漫場景（親吻、擁抱、告白）：導演用特寫、閉眼、臉紅、柔光散景光點；第三人稱 `kiss`＋`mutual#kiss`，第一人稱 `incoming kiss`。多人同場時互相把對方髮色加進負面，並把自己的髮色加權 1.25；貼身場景仍可能混色（NovelAI 限制），預設第一人稱可避開。
- 自創英靈（`meta.customServant`，ID 固定 `custom_servant`）：創角時召喚對象選「✨ 自創英靈」，填真名、職階、性別、身形（嬌小／普通／高挑 → `customServantCore_` 加 `petite, short`／不加／`tall female`、`tall male`；「找提示」也會判斷）、外貌／服裝／負面標籤、預設表情、六項能力、寶具名稱效果與特效、個性。可「帶入現有英靈」（`SERVANT_TEMPLATES_`，外貌取自 GameData.js，不含黑 Saber）當起點；「✨ 找提示」（`enhanceServantAppearance`）把中文翻成標籤並推薦正確的官方 Danbooru 角色標籤；前端只有一顆「🎨 英靈定裝預覽」（`previewCustomServant(cs, 'game')`）；後端另有 `'official'` 模式（只打角色標籤、負面預設重、steps 23、scale 7、cfg_rescale 0）給開發比對用，使用者說玩家不需要，所以畫面上不放。只能當玩家的主從者，不頂替原作七組。`parseSaveRow_` 讀檔時用 `setActiveCustomServant_` 把它登記進本次執行的角色資料庫；每回合 statePrompt 附 `describeCustomServantForPrompt_`；戰力等級由能力值換算（`customServantTier_`，2～5，全 A 以上才到 5）。
- 自然姿勢：導演規則要求避免僵硬、對稱、正面直立的站姿，每個角色要有符合當下與個性的肢體語言（重心在單腳、歪頭、手托下巴、倚靠、回頭）、動態（頭髮飄動）、三分之二側面或有角度的鏡頭、明確表情（使用者反映斯卡哈太僵硬後加上，實測明顯改善）。
- 預設表情：導演或 AI 沒給表情時，依角色補 `CHAR_DEFAULT_EXPRESSION_`（凜得意笑、Archer 嘲諷笑…；戰鬥中多半 determined），`ensureExpression_` 在組 payload 與導演合併兩處都會套。夜景補光：`addNightFillLight_` 在夜景沒有光源字眼時補 `warm ambient light, natural skin tone`，避免整張被染成藍色霓虹（官方比對後實測改善）。比對結論：scale、cfg_rescale、畫風前綴對畫面影響很小；遊戲的長角色標籤讓服裝比官方更忠於原作，要保留。
- 人數上限：一張 CG 最多畫 3 人（`MAX_CG_CHARS`），超過時先省略御主，保留順序為「自己的主／副從者 → 解放寶具中 → AI 列出順序」；但玩家輸入有牽、抱、吻、摸、靠、躺、掏耳朵等肢體接觸時御主保留（實測漏了掏耳朵時，變成凜躺在斯卡哈腿上被掏耳朵）（排在從者後面），否則牽手會變成從者牽配角；4 人以上臉太小會畫歪、偶爾把同一人畫兩次。3 人以上的畫面負面另加 `clone`。
- 說話者判斷：名單是全名時自動加簡稱（4 字取後 2 字、5 字以上取後 3 字：小次郎、綺禮、士郎、宗一郎），標示時換回全名；前一段以逗號／冒號收尾直接接台詞時，說話者就是前一段的主詞。台詞開頭在叫某人（「芙蕾雅，解放寶具」）時，說話者不會是被叫的人；下一段已是「某某：「…」」的回話不拿來當這句的說話者；冒號前整句只有一個主詞候選時就是他。判斷不出寧可不標。沙盒的說話者名單另外加入自創角色、同行的現有角色、客串角色的名字（實測莉莉的台詞被標成凜：名單裡沒有莉莉，句中唯一認得的名字是「凜」）。
- 人是重點：導演不讓道具（手機、武器、紙條）成為畫面焦點；第一人稱只有手直接和角色互動時才畫 `pov hands`，而且要小。另外伺服器會檢查玩家輸入：沒有握、牽、摸、遞、抱等用手的動作時，直接從場景刪掉 `pov hands`。非戰鬥時動作描述裡的武器字眼（spear、sword…）由 `stripWeaponTags_` 刪除。
- 時代背景 2004 年：系統提示詞與導演都要求手機是翻蓋手機（flip phone），主負面提示詞含 `smartphone`。
- 第一人稱「以角色為主」：導演以特寫／上半身／中景框住看得到的角色，背景加景深退到次要；沒有角色時才用廣角。
- 主負面提示詞（`generateNovelAIImageSafe_` 的 `defaultUc`）刻意保持精簡：只排除品質底線、文字浮水印、馬賽克。不要加回 V1～V3 時代的長串（bad, error, extra, bad hands…），實測會讓 V5 畫面變灰、細節變少。角色專屬負面放在 `GameData.js` 的 uc。
- 裸露把關（`sanitizeNudeOutfitForChar_`）：`NO_NUDE_CHAR_IDS_`（凜、櫻、黑櫻、士郎、伊莉雅、魔法少女伊莉雅、美遊、小黑）任何情況都不畫裸露，也不會存成全裸。導演回報的裸露也會經過同一道把關。
- 成人模式關閉（`adultOffOutfit_`，獨立於上面的角色把關、可單獨上線；部署腳本不會拿掉它）：只在劇情讓角色脫光時作用，把裸露標籤換成通用的 `convenient censoring`（不指定衣物，由 NovelAI 依畫面用頭髮、手臂、蒸氣、毛巾、被子自然遮住、不露點）；主負面另加 `nsfw, nude, nipples, completely nude, topless`（試過再加 ass, bare buttocks，使用者不要，已拿掉）。曾試過在成人模式關閉時刪除性行為類標籤並在負面排除，使用者不要，已整筆移除，不要再加回。平常穿著的場景不受影響。比較過「依場合指定浴巾／被子／背心」，使用者選通用版（較自然、不會猜錯場合、不干擾角色習慣）。
- 互動語法只允許 `source#`／`target#`／`mutual#` 前綴。導演常寫成「名字#動作#對象」或「動作#對象」，`stripBadInteractionPrefix_` 會轉成 `source#動作`，名字前綴則去掉。
- 角色名字只出現在該角色自己的欄位：導演規則禁止在別人欄位與主提示詞寫名字；程式另用 `stripOtherCharNames_`（`CHAR_EN_NAMES_` 英文稱呼表）把別人欄位裡的名字換成 another character、主提示詞裡的換成 a figure（自己的名字與 Danbooru 角色標籤不動）。名字寫進別人欄位會讓 NovelAI 多畫一個那個人。
- NovelAI 免費範圍（Opus）：一次 1 張、不用底圖、尺寸 ≤ 約 1024×1024 像素量（目前 1216×832）、steps ≤ 28。V5 的免費額度是會自動回復的用量條，用完會**自動改扣 Anlas**，所以不要調高尺寸、steps 或一次生多張。

## 內建資料（不在試算表）
- 角色：`GameData.js` 的 `FATE_CHARACTERS_`。角色的 Danbooru 標籤拼法要正確（例如小次郎是 `sasaki kojirou (fate)`，拼成 kojiro 會認不出角色、畫成路人）。表情不要寫死在 core（慎二原本 core 有 smug，疊上預設表情與導演的大笑會變醜，已改成 bishounen），表情交給 `CHAR_DEFAULT_EXPRESSION_` 與當下動作。新增角色時填 id、names（第一個為顯示名稱）、gender、core、outfit、uc、summonable；`saber_alter` 一律不可開局召喚。要畫寶具特效再到 `Code.js` 的 `NP_VISUAL_EFFECTS_` 補一筆。
- 陣營：`Code.js` 的 `CANONICAL_7_FACTIONS_`（陣營名稱／御主ID／從者ID／預設狀態／預設態度／內幕）。新增陣營記得補 `FACTION_ALIAS_GROUPS_`。
- 世界書：`Lore.js` 的 `FATE_LORE_BUILTIN_`（cat 分類／pri 優先度／keys 關鍵字／text 內容）。
  - 優先度 10 每回合必載入（控制在 5 條內）；其餘依關鍵字命中來源加權——玩家本回合行動 ×3、目前狀態（地點、從者、重要事件、擴散中流言、背包）×2、最近 2 回合劇情 ×1，不分大小寫。依分數→優先度排序，最多 8 條、3200 字，載入時附 `[分類]`。
  - 已寫進系統提示詞的核心規則不要再寫成世界書。標示「隱藏真相」的條目要提醒 AI 只在深入調查時揭露。
- 這些資料在單次執行內以記憶變數快取，不需要 CacheService。

- 地標（`FUYUKI_LOCATIONS_`）：2026-11 新增「深山町商店街」與「新都中央公園」（十年前大火遺址）。原因：玩家去商店街時對不到地標、地點停在洋館，便服判斷以為人在據點。中央公園必須排在新都商業區前面（別名比對照順序，「新都」會先被搶走）。

## 讀取與寫入（試算表）
- `Players_Save` 找玩家只讀 A 欄；`ChatLog` 先讀 A 欄定位，再只讀需要的列。不要改回 `getDataRange()` 讀整張表。
- `ChatLog` 的 H 欄（繪圖 payload）每位玩家只保留最近 6 回合（`CHATLOG_PAYLOAD_KEEP`），更舊的會清空；劇情文字保留。

## 使用的服務
- 劇情：OpenRouter，模型 `google/gemini-3.1-flash-lite`。
- 提示詞快取：`callOpenRouterChat_` 把 2000 字以上的系統提示詞包成 `[{ type: 'text', text, cache_control: { type: 'ephemeral' } }]`。Gemini 的自動快取時有時無（2026-11 實測 `cached_tokens` 常是 0），明確標記後每次穩定吃到約 4600 token 快取，輸入成本省約四成、每回合整體省約 15～20%（輸出的小說無法快取）。所以系統提示詞一定要保持固定，變動資料放 statePrompt。OpenRouter 官方說明（2026-11 讀取）：Gemini 要明確 `cache_control` 才會快取、只認最後一個標記、快取讀取 0.25 倍價（帳單反推這個模型約 0.1 倍）、寫入 TTL 5 分鐘且不會延長、**通常要 4096 token 以上才寫入**——目前 `FATE_GM_SYSTEM_PROMPT_` 約 4587 token，剛好過門檻，精簡系統提示詞時不要掉到 4096 以下，否則快取整個失效。（WebFetch 連不上 openrouter.ai，用 curl 可以讀。）快取範圍再擴大（2026-11）：內建角色 ID 清單搬進系統提示詞（`getGmSystemPrompt_`，所有玩家一樣）；同一位玩家每回合不變的段落（本局基調、名號與願望、寫作基調、固定六維、自創英靈設定）組成 `stablePrompt`，以 `{ stable, dynamic }` 傳給 `callOpenRouterChat_`，在 stable 結尾標記快取（只認最後一個標記 → 系統規則＋這段一起快取），動態段（物品檢查、狀態、劇情歷史、本回合行動）放後面不快取。本局基調仍排第一。實測快取 token 從 18348 增到 20428（每回合多省約 3～5%）；手槍 6/6 仍摸空、鐵血買槍舊版 2/6 對新版 1/6（隨機範圍內），行為沒變。
- 繪圖：NovelAI V5（`nai-diffusion-5-full`），由「視覺導演」先把中文劇情翻成英文 Danbooru 標籤再繪圖。

## 試算表分頁（只有兩個，欄位順序不可更動）
- `Players_Save`：32 欄（程式用 0 起算索引）。`row[5]` 成人模式、`row[21]` 好感度、`row[28]` 服裝 JSON、`row[29]` 陣營狀態 JSON、`row[31]` meta JSON（回合數、背包、手機簡訊與論壇、傷勢、路線旗標、重要事件、流言、聯絡人等）。HP／副從者 NP 欄位未使用但保留，**不可刪欄**（會讓後面所有索引錯位）。
- `ChatLog`：A 玩家／B 回合／C 時間／D 時間地點／E 玩家行動／F AI劇情／G 出場角色／H 繪圖 payload／I seed。
- 舊的 `Char_Appearance`、`Factions_Relations`、`Lorebook` 分頁已不再使用，程式不會讀取。

## 核心遊戲規則（不要破壞）
- 玩家是正規陣營之外獨立參戰的第 8 組，不頂替任何陣營；只有真正收服副從者時，原陣營才改為「已歸屬第8組」。
- 御主六維與從者參數創角後固定鎖定，不因鍛鍊改變。
- 同盟陣營彼此照應、不內鬥；後台陣營廝殺要慢，不可輕易把七組打光。
- `TRUE_VICTORY` 由伺服器驗證：仍有未化解的敵對陣營，或在日常模式，一律降回 `CONTINUE`。同盟標記保護（`preserveAllianceTag_`）：原本同盟的陣營被 AI 改寫狀態時，沒寫破裂／背叛／解除等字眼就自動補回「同盟」；通關判定與後台廝殺另有好感保險（`isFriendlyByFavor_`：好感 ≥ 80 且狀態沒有敵對字眼視同已化解、不會被抽去後台互打）。2026-11 克勞德媽實玩 191 回合劇情已結局，卻因 AI 把同盟改寫成「存活 (終局)」而無法判定通關，因此加上。
- 服裝以劇情為準：洗澡自動脫衣、開打自動換戰鬥裝，全裸後主動穿衣才還原。例外：從者全裸時一旦開戰或離開據點，會自動具現回戰鬥裝；御主的全裸一律由玩家決定。
- 黑櫻、黑 Saber 出現時，同場不得再出現原版櫻或 Saber。
- 真Assassin 路線：`meta.routeFlags` 個別記錄美狄亞（`caster`）與小次郎（`assassin`）是否退場；任一退場且間桐陣營仍在時，自動新增「臟硯組 (真Assassin陣營)」並由咒腕哈桑（`hassan`）接替山門。收服柳洞寺其中一騎時不會整組改為歸屬第8組。
- 休息回魔由伺服器結算（`isRestAction_`）：玩家輸入休息／睡覺／冥想等、AI 也回報 `player_rested`（或 `player_slept`）為 true，且沒開戰 → 回復 20＋所在地靈脈 `manaRegen`（兩把鑰匙：「沒時間休息了，衝！」不會回魔），AI 自己加的正數 `master_mp_delta` 不重複計入；結算顯示「💤 休息回復」。真的睡一覺時直接用完本時段剩下的 AP、時間前進到下一個時段。採「兩把鑰匙」：AI 回報 `player_slept: true`（玩家本人真的睡了；看別人睡、睡前聊天、睡到一半被吵醒都是 false）**而且**玩家輸入有睡覺字眼（`isSleepAction_`），且沒開戰，才推進。原則：意圖交給 AI 判斷，GAS 的字詞比對只用來否決「玩家完全沒提卻發生」的事，不要讓 GAS 看到字就強制執行（以前這樣做常把「不想睡」「她抱怨」誤判）。否決用的字詞清單要**放寬**（`isSleepAction_`、`isRestAction_`、`hasContractIntent_`、道具泛稱「道具／背包／東西」、令咒「命令」）：沾到邊就放行，因為主判斷是 AI；短輸入「睡」「晚安」「躺平」「我接受」「成交」都要對得上，誤放行沒關係，漏掉才會讓 AI 讀懂的事被擋掉。例外：`isOtherPersonRest_` 專門否決「看著／幫／讓／哄／守著某人睡」這種別人在睡的句型（「陪她睡」「我也睡」「一起睡」仍算），因為上線實測 flash-lite 會被「看著沖田睡著」誤導而替玩家回魔。時段推進另有靈脈回魔。
- 英靈名冊（`meta.servantRoster`，最多 3 騎）：副從者位置已滿還收服（`new_servant2_id`）時收進名冊、回洋館待命（扣 80 MP、原陣營歸屬第8組）；玩家在廢棄洋館輸入「讓某某上場／帶某某出門」（`findRosterSwapTarget_`）就和副從者互換。主從者固定不換。名冊寫進 statePrompt 標明不在身邊。
- 主從好感：`bond_delta` 每回合限 ±10；好感 ≤10 時提示詞告知從者可能拒絕荒唐命令；好感 0 且本回合又扣分時 `meta.bondZeroStreak` +1（回升就歸零），結算顯示「⚠ 忍耐快到極限」，連續 3 次（常理、鐵血）主從者解約離去，走和靈基消滅相同的遞補／失去從者流程，好感重設 25。忍耐到極限（好感 0 且已連續 2 次）時，statePrompt 先寫「最後一次機會」，要 AI 在本回合又惹她時寫出她離開的場面（亂玩測試：解約只出現在結算，劇情裡她還陪玩家騎車兜風）。沒有主從者時好感不變，AI 寫的從者狀態也不接受（解約後下一回合被改成「消滅」）。
- 道具固定效果由伺服器結算：`mana_gem_s` +35 MP、`mana_gem_m` +65 MP、`smoke_bomb` 警戒度 −15（`ITEM_EFFECTS_`）；保命符的 id 必須是 `aegis_charm`。
- 物品檢查（`detectMissingItems_`，`COMMON_ITEM_NOUNS_`）：玩家行動提到手槍、刀、炸彈、汽油、寶石、魔導書等實體物品而背包沒有時，statePrompt 最前面（緊接本局基調）寫「物品檢查（優先遵守）」：沒有就摸了個空、行動失敗、到此為止，不可憑空出現、不可替玩家改用別的方法。別人的東西（「斯卡哈的槍」）、手機不算。清單列不完時另有通用抓法（`extractUsedObjects_`）：玩家說「拿／用／掏出／舉起 某物」而且有射、砍、丟、點燃等使用動作，就把「某物」拿去比對背包（兩個字以上連續相符就算有，例如「煙霧彈」對「煙霧魔術彈」；抽象、身體、別人的東西排除）——實測「沙漠之鷹」原本沒被抓到，沒買到槍下一回合照樣憑空出現，改後鐵血 3/3 摸空、常理買到的那局才真的開得了槍。2026-11 實測開局「拿手槍對自己開槍」：原本 4/4 讓手槍憑空出現（還有一局 AI 替玩家改用魔術迴路逆流自殺而死），改後 6/6 摸空失敗。鐵血 directive 另加「冷酷無情、只認事實；從者不是保母，不會每次都及時救」。
- 道具只能用背包裡真的有的（系統提示詞）：玩家提到沒有的道具或材料時，劇情寫出手邊沒有、做不成（2026-11 實測：時鐘塔出身沒有未充能寶石，卻照樣煉成中魔力寶石）。當場吃掉的食物、日用品不收進背包（實測買鯛魚燒被收成道具佔格子）。
- 道具防越權：玩家本回合輸入沒有「取得／製作」意圖（撿、拿、買、煉成…）時不收 `gained_items`；沒有「使用」意圖（用、捏碎、投擲…）時不扣道具（除非輸入直接提到該道具名稱）。有使用意圖時也只扣輸入有提到的道具（`isItemReferenced_`：名稱、`ITEM_REF_KEYWORDS_` 常用叫法、或名稱的三字片段；實測只說「丟出煙霧彈」，AI 連魔力寶石也扣掉）。
- 令咒防越權：玩家本回合輸入提到「令咒」或訂下第二契約（`new_servant2_id`）時才扣令咒（實測上一回合用過令咒，下一回合只是撤退清點，AI 又回報用了一畫）。
- 淘汰要真的交戰（`isFactionInvolved_`）：AI 回報某陣營淘汰時，本回合必須開戰且該陣營角色在場或被玩家點名，否則維持原狀；沒交戰的陣營交給伺服器後台廝殺慢慢推進（壓力測試：玩家只是「遠遠觀察」，AI 連報兩回合就淘汰了柳洞寺）。龍傲天模式不限。
- 新契約要有意圖（`hasContractIntent_`）：玩家本回合輸入有契約／收服／締結／歸順等字眼才收副從者（壓力測試：只是「看看四周」，AI 就送上黑 Saber）；沒有從者時例外。
- 後台陣營廝殺在第 3 天以前不會淘汰任何陣營。
- 戰力判定（`assessCombat_`）：回合前從玩家行動找出對手陣營（`COMBAT_TARGET_ALIASES_`、或身處對方據點 `FACTION_HOME_`），依從者等級 `SERVANT_TIER_`、主從羈絆（好感 ≥80 +1、100 +2）、情報（真名／弱點）、事前準備／奇襲、在對方陣地（柳洞寺 −2）、盟友參戰、令咒 +2、魔力、雙方傷勢加總成 大優勢／小優勢／均勢／劣勢／絕望，寫進 statePrompt 要 AI 依等級裁定，開戰時結算顯示。
- 隱藏強敵現身（`applyRouteAndHiddenServantEvolution_`）：英雄王、黑櫻、黑 Saber 在場時會改寫所屬陣營狀態，但用 `revealHiddenStatus_`——狀態已經寫到他（例如「英雄王負傷」）就保留，已負傷但沒寫名字就在前面加名字，否則才換成「已現身」。以前每回合整個覆蓋，負傷被洗掉，淘汰兩步永遠過不了，**英雄王、黑櫻、黑 Saber 在場時打不死**（模擬測試發現；克勞德媽那局能結局是因為擊敗英雄王那回合他剛好不在出場名單）。
- 柳洞寺退場字眼（`mentionsRetired_`）排除否定句：「小次郎並未被擊敗」「差點退場」不算退場（模擬測試：曾直接觸發真Assassin 登場）。
- 最終 Boss（`maybeSummonFinalBoss_`）：其他陣營都化解、英雄王還沒亮相時，教會組改為「英雄王吉爾伽美什現身・大聖杯守門者」（`meta.gilFinal`），當回合不能通關；打倒後 `meta.gilDefeated`。
- 英雄王提早現身（使用者指定只限這個情況）：後台廝殺的低機率淘汰剛好落在愛因茲貝倫組時（第 3 天後、該組已負傷、12%、仍剩 4 組以上），改成「遭英雄王吉爾伽美什擊潰」，教會組狀態改為「英雄王吉爾伽美什已現身・遊蕩中」、`meta.gilRevealedEarly = true`，statePrompt 由 `describeFinalBossForPrompt_` 告知他在冬木遊蕩、可能偶遇或介入；其他陣營被後台淘汰照舊。最終 Boss（`maybeSummonFinalBoss_`）流程不變。
- Berserker 十二試煉（`meta.godHand` = { lost, methods }）：AI 以 `berserker_lives_lost` 回報玩家這邊殺死他幾次；伺服器限制 Berserker 在場且開戰才算、一般最多 1 條、寶具最多 2 條，殺過他的同一種手段之後無效（`applyGodHandHits_`）。命數未歸零時愛因茲貝倫組不會因戰鬥淘汰，除非御主伊莉雅被打倒／投降（`gateGodHandElimination_`）。後台廝殺不扣命數。情報視窗顯示已擊破數與免疫手段。
- 狀態資料會告訴 AI 御主性別（她／他）。
- AI 回傳不認得的地名時維持原地；副從者靈基「消滅」會清空副從者欄位；御主狀態寫「已死亡」視同死亡結局（保命符仍可擋下）。

## 已修正的問題（不要改回去）
- `servant2_condition` 欄位名稱拼寫已修正。
- 同職階敵對陣營不會每回合被誤判為歸屬第8組。
- 結局值容錯（`normalizeOutcome_`）：AI 寫出規定外的 outcome_type（DEAD、DEATH、WIN…）時依字面對應回 FATAL_DEATH／TRUE_VICTORY，其他當 CONTINUE（壓力測試發現寫 DEAD 時御主「已死亡」卻照常行動、保命符也沒觸發）。
- Gemini JSON 回傳有容錯解析與一次重試；主回合 `max_tokens` 為 3000。
- 簡訊每串上限 30 則，meta JSON 過長會自動裁切，避免超出儲存格上限。
- 導演翻譯後的繪圖 payload 會回寫 ChatLog，重新讀檔後重骰 CG 仍保留裸體與戰鬥裝。
- 回合數存在 `meta.turnCount`，不要每回合掃描整張 ChatLog。

## 已知限制
- 登入刻意不設密碼：遊戲只給 5 人以內的朋友圈遊玩，御主名號只用來區分各自的存檔。不需要再提議加密碼。
- 主從者（第一位從者）靈基「消滅」時目前不會自動解約或遞補，交由劇情處理。
