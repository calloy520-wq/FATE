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
- **不得偷偷改動**：所有改動都要先告訴使用者改了什麼；不可夾帶使用者不知道的改動；使用者說不上線就不合併到 `main`。如果某個要求碰到 AI 不願意做的界線，要當面說明，不可表面答應、私下加限制。
- **尚未同意上線的改動**：全裸把關（`NO_NUDE_CHAR_IDS_`、`sanitizeNudeOutfitForChar_`）目前只在工作分支，使用者**尚未同意上線**；部署時必須逐筆挑選 commit，不得包含這筆改動，除非使用者明確同意。部署前要檢查推上去的 `Code.js` 不含這兩個名稱並回報。
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
- 寫作基調（難度）：`GAME_TONE_PRESETS_` 每種有 `directive`（具體裁定指令），放在 statePrompt 最前面「本局基調（優先遵守）」，系統提示詞也有對應規則。實測同一個偷襲行動：搞笑＝滑稽閃開、故事＝偷襲成功、常理＝被閃開、鐵血＝被反擊。改基調時要保持這種明顯差異。
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
- 陣營主動行動（`drawProactiveEvent_`）：每回合機率 25%～75%（警戒度越高、越久沒事越高；剛發生過的下一回合不會再來），挑一個未淘汰的陣營依態度主動行動（敵對：窺探／突襲／挑戰書／陷阱；中立：拜訪／交易／偶遇；同盟：情報／求援／商量／邀約；教會：綺禮來訪／通知），寫進提示詞要求本回合一定發生。重傷休整的不會突襲。其他陣營主動傳訊用 `incoming_messages`，寫入手機聯絡頁並視為取得聯絡方式。
- 教會是公開據點，手機上隨時聯絡得到。
- 情報檔案（`meta.factionIntel`）：玩家「知道的」陣營狀態，和真相 `row[29]` 分開。只有親眼見到該陣營角色（`CHAR_FACTION_MARKERS_`）、同盟、聯絡接通、或 AI 回報 `intel_updates` 時才更新；幕後細節（「曾於…激戰」「遭…擊潰」）用 `publicIntelText_` 去掉。「📊 情報」視窗、手機聯絡頁、回合結算的陣營變化都只用情報；statePrompt 同時給真相（標明 GM 專用）與玩家情報。後台戰況（`meta.warTicker`）只給 GM，玩家只看到 `warTickerPublic` 異象與自動論壇目擊。
- 每回合結算：伺服器比對回合前後狀態，在劇情尾端附上「【本回合結算】」（MP、警戒、好感、移動、傷勢、道具、陣營變化、聯絡人、流言、論壇）。AI 讀歷史時會自動去掉這類系統行。

## NovelAI 繪圖
- 主提示詞放人數標籤（`2girls, 1boy, multiple characters`）；角色欄位一律以 `girl`／`boy` 開頭，不放 `1girl`、`solo`（`normalizeCharCoreForNai_`）。
- 成人模式（`Players_Save` F 欄、設定視窗開關）**預設開啟**（新角色預設 TRUE；既有存檔已一次性設為 TRUE，記錄在指令碼屬性 `FATE_ADULT_DEFAULT_APPLIED`，不會再覆蓋玩家之後的選擇）。只有畫面有裸露時才加 `nsfw`，普通場面不加；關閉時不加。
- 視覺導演取劇情「開頭＋結尾」摘錄，以結尾（最新畫面）為準；服裝欄不得含髮色、瞳色、體型。
- **角色位置絕對不寫死**：`use_coords: false`、所有角色中心都是 0.5，由 NovelAI 自行構圖（AI's Choice）。導演只用文字描述位置關係（前景／背景、誰在誰身後、面向誰、遠近），不給座標或左右格位。
- 第一人稱視角（設定開關，`meta.cameraMode` = `pov`／`third`，預設 third）：繪圖時移除 `player_master`、主提示詞加 `pov, first-person view`（沒有其他角色時加 `no humans, scenery`），導演改以「離鏡頭多近、是否看向鏡頭」描述，玩家用手做事時加 `pov hands`。**視野外的角色不畫**：導演回報 `in_view`，程式另用 `isOutOfPovView_` 檢查（寫了 behind viewer／out of frame 等就算看不到，over shoulder／leaning in 仍算看得到），被排除的角色會從角色欄位與場景描述（`removeCharacterMentions_`）移除，並以 `buildCountTags_` 重算人數。不會多生圖。
- 導演只畫劇情當下明確出現的道具、武器與魔術效果，不自動加角色招牌物品。
- 畫面方向自動切換（`pickNaiSize_`）：畫面只有 1 個角色 → 直式 832×1216；2 人以上或純風景 → 橫式 1216×832（兩者像素量相同，都在免費範圍）。第一人稱濾掉視野外角色後會重新判斷。前端畫框依圖片比例切換（`.cg-viewport.portrait`，高度上限 78vh），圖片用 contain 不裁切。
- 便服：`GameData.js` 的 `casual`（目前有斯卡哈、Saber、Rider）。本回合結束時人在據點（廢棄洋館）且沒開戰，就從戰鬥靈衣換成便服；離開據點或開戰換回。導演收到 `At Home Base`，只有在據點才能用便服；導演若把便服改回戰鬥服（`outfitSimilarity_` ≥ 0.5），程式會改回便服。武器只在戰鬥或解放寶具時才畫：系統提示詞要求非戰鬥時武器靈體化，非戰鬥場景的角色負面提示詞自動加入 `holding weapon, weapon, spear, polearm, sword`。
- 畫面方向由導演決定（`orientation`）：1 人或兩人貼身互動 → 直式；戰鬥、廣角、3 人以上、兩人有距離 → 橫式。導演沒回報時用 `pickNaiSize_`（1 人直式、其他橫式）。點擊 CG 會全螢幕放大（`openCgLightbox`），點擊或 Esc 關閉。
- CG 兩種重畫：「🔄 重骰」用同一組提示詞換 seed（構圖不滿意）；「🎬 重新導演」用保存的原始 payload（含 `_directorContext`）重新跑導演翻譯（圖跟劇情不符）。
- 浪漫場景（親吻、擁抱、告白）：導演用特寫、閉眼、臉紅、柔光散景光點；第三人稱 `kiss`＋`mutual#kiss`，第一人稱 `incoming kiss`。多人同場時互相把對方髮色加進負面，並把自己的髮色加權 1.25；貼身場景仍可能混色（NovelAI 限制），預設第一人稱可避開。
- 人是重點：導演不讓道具（手機、武器、紙條）成為畫面焦點；第一人稱只有手直接和角色互動時才畫 `pov hands`，而且要小。
- 時代背景 2004 年：系統提示詞與導演都要求手機是翻蓋手機（flip phone），主負面提示詞含 `smartphone`。
- 第一人稱「以角色為主」：導演以特寫／上半身／中景框住看得到的角色，背景加景深退到次要；沒有角色時才用廣角。
- 主負面提示詞（`generateNovelAIImageSafe_` 的 `defaultUc`）刻意保持精簡：只排除品質底線、文字浮水印、馬賽克。不要加回 V1～V3 時代的長串（bad, error, extra, bad hands…），實測會讓 V5 畫面變灰、細節變少。角色專屬負面放在 `GameData.js` 的 uc。
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
- 服裝以劇情為準：洗澡自動脫衣、開打自動換戰鬥裝，全裸後主動穿衣才還原。例外：從者全裸時一旦開戰或離開據點，會自動具現回戰鬥裝；御主的全裸一律由玩家決定。
- 黑櫻、黑 Saber 出現時，同場不得再出現原版櫻或 Saber。
- 真Assassin 路線：`meta.routeFlags` 個別記錄美狄亞（`caster`）與小次郎（`assassin`）是否退場；任一退場且間桐陣營仍在時，自動新增「臟硯組 (真Assassin陣營)」並由咒腕哈桑（`hassan`）接替山門。收服柳洞寺其中一騎時不會整組改為歸屬第8組。
- 道具固定效果由伺服器結算：`mana_gem_s` +35 MP、`mana_gem_m` +65 MP、`smoke_bomb` 警戒度 −15（`ITEM_EFFECTS_`）；保命符的 id 必須是 `aegis_charm`。
- 道具防越權：玩家本回合輸入沒有「取得／製作」意圖（撿、拿、買、煉成…）時不收 `gained_items`；沒有「使用」意圖（用、捏碎、投擲…）時不扣道具（除非輸入直接提到該道具名稱）。
- 後台陣營廝殺在第 3 天以前不會淘汰任何陣營。
- 狀態資料會告訴 AI 御主性別（她／他）。
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
