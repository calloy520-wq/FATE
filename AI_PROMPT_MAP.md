# 《命運停駐之夜》ActionRouter × AI 提示詞 全景圖

> 目的：每個會叫 AI 的 action ↔ 按鈕 ↔ handler ↔ 送出去的提示詞。**改提示詞前先查、改完更新。**
> 行號會漂，以函式名／變數名為錨。2026-09 末舊版 solo 整組拆除，這份只剩兩條路：⚔️ 新聖杯戰爭、🌹 鑑賞（加工房）。
> 底層架構一句話：GAS 算數值與結果 → handler 組提示詞直接呼叫 `callGeminiAPI`（Engine_Combat.gs）→ 前端用 `aiHtml_` 印出來。

---

## 1. ⚔️ 新聖杯戰爭 `war_narrate`（War_Router.gs）

| 按鈕 | action | 說書 prompt |
|---|---|---|
| 召喚／開戰／白天三選一／夜晚／戰鬥每回合 | `war_act` → `war_narrate` | system＝`WAR_NARR_SYS_`（第二人稱、單層「」、每 2～3 句分段、【這一段發生的事】照順序寫成畫面、數字留在系統、寶具與令咒念出名字）；user＝`warNarrPrompt_`：【這場戰爭】（`WAR_ERA_[st.war]`：哪一場、哪個時代、你是原作陣容外多出來的一組）、從者卡（look／words／toMaster）、御主（令咒剩幾劃）、對手（知道真名才給外貌）、此刻（事情發生的那一天與時段——按下去那一刻記的，不是結算完的下一個早晨；召喚＝開始前的那一夜；傷勢字）、【這一段發生的事】（引擎事件的 `txt`，不含數字）、【這一段碰到的原作設定】（`warLoreStr_`：事件碰到的地點／寶具原文／令咒，沒碰到就不送）、篇幅（`WAR_LEN_`）＋召喚與開戰各自的重點（`WAR_SCENE_`） |
| 補魔 | 同上，`kind:'supply'` | 同上＋`sealGenderFact_`＋`LEWD_EXPLICIT_`，`LEWD_MODEL`、800～1000 字 |
| 終局 | 同上，`kind:'over'` | 同上＋結局指示（贏：聖杯在你面前；輸：這場戰爭怎麼結束） |
| 🐯 老虎道場（終局卡上的按鈕） | `war_dojo` | system＝`WAR_DOJO_SYS_`（藤村大河＋伊莉雅的對話、單層「」、每 2～3 句分段）；user＝`warDojoPrompt_`：【這一局】御主與從者、第幾天、勝負；戰績；輸了帶 `warDebrief_` 的「輸在」＋「下一局要改的一件事」，有亮點帶亮點；三段式結構（輸：吐槽打氣→點破並給一條建議→收尾；贏：慶祝→點名做得好的事→恭喜）。`AI_MODEL`、900 tokens；同一局回快取 |

前情：最近兩段（事實＋說書）當 chatHistory；同一個 `seq` 說過就回快取。說書不鎖按鈕：玩家連按時，還沒被接走的上一段事實會併進新的一段（`WAR_NARR_FACTS_MAX_`），所以一段【這一段發生的事】可能涵蓋好幾步。

---

## 2. 鑑賞 Kanshou — Gallery.gs

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `enter_kanshou` | 主選單「🌹 進入鑑賞」→`enterKanshou()`（Script_Kanshou.html） | `actionEnterKanshou` | 否 |
| `backfill_kanshou_ai` | `enter_kanshou` 首次建檔後前端背景呼叫 | `actionBackfillKanshouAi` | **是**（結構化 JSON，補鑑賞御主敘事欄） |
| `kanshou_companions` | 抽屜「👥 後日談同伴」→`openCompanions()` | `actionKanshouCompanions` | 否 |
| `kanshou_summon_hero` | 駐留清單「召喚」→`kanshouSummonHero(heroId)` | `actionKanshouSummonHero` | 否（2026-07「加入這個世界的感覺」定案後只能召喚一次，沒有「請走」/隊伍容量概念了） |
| `kanshou_party` | 駐留清單每張卡「＋同行／−離開」→`kanshouPartyOp(id, op)` | `actionKanshouParty` | 否（純名單增減，下一次 `play` 才體現在【在場人物】） |
| `kanshou_memoir_op` | 💞共同回憶面板「📌釘選/☆/🗑」→`kanshouMemoirOp(name,op,text)` | `actionKanshouMemoirOp` | 否（玩家手動管理回憶） |
| `kanshou_set_name` | 「✏改名」→`changeKanshouName()` | `actionKanshouSetName` | 否 |
| `kanshou_set_sex` | 「⚧切換性別」→`changeKanshouSex()` | `actionKanshouSetSex` | 否 |

> ⚠ **2026-07 已砍**：舊版奪杯封存流程 `actionClaimGrail`（action `claim_grail`·寫「鑑賞」GAL 表的回憶散文）已整套刪除——ActionRouter 無此註冊、`gas/` 查無 handler，鑑賞改由「英靈殿直接召喚」(`enter_kanshou`＋`kanshou_summon_hero`)進入，不再需要先打贏戰爭奪杯封存。

### 其餘 Gallery.gs handler

---

---

## 3. 自由聊天引擎 `actionPlay`（action `play`）— Gallery.gs

**🔀 2026-07 玩家定案「兩軌完全拆開，鑑賞集中在一個GS」**：`actionPlay` 與 `buildDefaultSystemPrompt`（含 `nsfwBaseRules`）已從 `Router_Narrative.gs`／`Engine_Combat.gs` 搬到 `Gallery.gs`（鑑賞的家，跟召喚/進場/請走/AI深化等其餘鑑賞 action 集中一處），純檔案搬遷、函式內容逐字未動。`Router_Narrative.gs` 從此只剩 solo 的敘事 helper（`actionNarrateOnly`／`narrateWithState_`）；`Engine_Combat.gs` 只剩 solo／鑑賞共用的 `callGeminiAPI` 基礎設施。

**用途**：kanshou（慾海後日談，NSFW）自由文字聊天輸入框，走前端 `send()`（Script.html, `action:"play"`）。**solo 聖杯戰爭主軌完全不用這個**——solo 全走按鈕→`narrate_only`。`actionPlay` 100% 只被鑑賞(`KPC_`)呼叫（函式入口強制擋非 `KPC_` 呼叫）；九州 `full` 模式呼叫路徑已不存在。

與 `narrate_only` 的關鍵差異：`actionPlay` **自己從零組完整 prompt**（不假手 caller），且**直接呼叫 `callGeminiAPI(prompt, buildDefaultSystemPrompt(userData.optionsOn !== false), aiConfig)`**——第二參數是鑑賞專屬系統提示詞（`nsfwBaseRules`＋★【輸出範本】finalJson），指令分「系統」「user」兩層，結構與 `narrate_only` 相同。

組裝的事實類別：
- **在場人物完整卡**（身世/狀態/性格/特徵/關係與好感，`PROMPT_PARTY_SYSTEM`；solo 另帶六圍/氣血，鑑賞不帶）——⚠ **2026-07 §91「駐留制」改版**：`partyRows`/`partyMembers`已不是「同行隊伍」而是**當前地點的所有已存在角色**（`LOC===curL`，按好感排序取前3張詳細卡，超過3人的第4位以後只是不進這回合的詳細卡，人不會消失也不影響劇情觸發判定），卡片標籤字面已從「同行夥伴」改為「在場人物」（`partyDetailsArr`/`PROMPT_PARTY_SYSTEM`），玩家按鍵移動不再強拉任何人同步；只有AI敘事內容講「一起移動」時才會同步當時已在場的人。
- 玩家自身卡、近期歷史（最近 6 筆原始訊息／3輪，`getGameHistoryBatchRaw`，走 `aiConfig.chatHistory` 而非塞進 prompt 字面）
- **🧹 2026-07 玩家定案「砍掉同地路人、開放世界無結界」**：舊版「同地路人」清單（`allLocals`/`displayPeople`）＋其好感階梯行為指令（`resistPrompt`，死仇→摯友七級）＋場景第三方交叉羈絆整套刪除。改走 `★【這個世界有誰】`（正式同伴／常民（世界帳本升格）／路人三分，路人可描寫但不具名不追蹤）；`backgroundCrowdStr` 現為**空字串**（內容已併入該區塊，變數只留形狀）。
- **🚪🏠 2026-07 新增「巧遇開關」＋可改名的「家」移動選項**：`kanshouEncounterStr`(巧遇系統例外提示詞注入)現受`encounterOn`(讀`userData.encounter`，前端「出門走走」面板一顆checkbox、localStorage持久化)閘門，關閉時移動/原地問「還有誰」兩個擲骰點都不會觸發，但不影響已在場的`【邂逅中】`對象持續互動。`KANSHOU_LOCATIONS_`（2026-07已擴充到**50個地點**、非10個，見 `FUNCTION_MANUAL.md`）外新增一個不在清單內、顯示名稱可由玩家自訂(MEMORY`【住所】`標記，預設「家」)的私人地點——`isHomeMove`比對成立時恆不擲骰(私人空間永不巧遇陌生人)，其餘寫LOC/清`【邂逅中】`的邏輯與一般地點一致。詳見 `SOLO_REFERENCE.md` §44。
- **僅 NSFW/kanshou 模式**：同地性別配對提示、肉體狀態 JSON（2026-07 玩家定案「肉體那些欄位不需要了，只要狀態就好」：physical_state 從 6 鍵數字代碼（姿勢與動作/胸部/顏面/肉棒/蜜穴/服裝狀態）全部砍掉，簡化為單一自由文字欄，AI 自行決定每回合要不要提、提多細，不強制逐項列舉，每回合仍需據實反映最新狀態）、每位在場同伴的「身體記憶」技能標籤(`dynamic_skills`)、愛稱(`mutual_nicknames`)。（~~🔥點火 `driveOn`／`driveStr`~~ 已於 2026-09 整組移除：它最後只剩一句「尺度一律以【親密尺度五階】為準」，而親密尺度五階早就隨好感一起砍掉了——等於每次點火都在叫 AI 以一個不存在的東西為準。露骨程度現在由玩家自己的 `lewd` 旋鈕管。鑑賞現況一律以 `KANSHOU_REFERENCE.md` 為準）

🎨 **風格層（2026-09）**：★世界觀／★【視角鎖定】／★【你也是這座城裡的一個人】／★【篇幅】／🚨【收尾】五段，以及 nsfwBaseRules 的 筆觸／鐵律 1·2·4·5·6·8·10 八段，現在由 `kanshouStyle_(styles, key, vars)` 供給——玩家在「⚙ 說書人設定」改過就用玩家的、關掉就整段不送、否則用 `KANSHOU_STYLE_MODULES_` 的預設（＝下面列的那句）。事實與契約段不在此列。

USER prompt 骨架（2026-09 現況·**變數名即錨點**，以 `Gallery.gs` 為準；舊版的【敘事法旨】／★【在場驗證鐵律】／💕【鑑賞·後日談模式覆寫】／🚨【敘事終極警告】四個區塊都已不存在）：
> ★這個世界＝和平的現代日常，帶一點奈須味：魔術、神秘、技能、寶具都還在身上，只是拿來過日子——用法從那個人真正的本事來（碰到了才會列在底細裡），寫成那個人順手做了什麼，順著眼前的事帶出來，點到為止；有誰把場面拉出日常，就用一點小小的搞笑把它拉回來（`world` 模組·玩家 2026-09-23 二稿：奈須味＋日常＋微搞笑）／★【性別】：在場每個人的性別以卡上寫的為準（取代舊的女×女 ★【身體】說明）
> `${PROMPT_REL}`（🛑【角色一致性】等）
> ★【身體】（`_bodyLine_`：玩家自己的身體狀態）
> ★【在場名單】（這一局有誰·`presentMembers`）／★【誰在場】（有【專屬稱呼】就叫暱稱；卡片與帳本都沒提到的路人不具名）
> ★【這座城裡還住著】（`kanshouWorldRosterStr`：待命者的名字·玩家問起才由 AI 依時段掰他在做什麼）
> ★【world_note】（世界帳本寫回：地點/人物/設定·挑之後還會再遇到、再提起的寫·最多 3 筆）
> `${PROMPT_PARTY_STABLE}`（在場人物卡·整局不變·住在 **system** 吃提示詞快取）
> `${PROMPT_PARTY_LIVE}`（這一刻的樣子·每回合可能動·住在 user；共同回憶只帶釘選的＋這一步提到的）
> `${_worldFeed_}`（世界帳本餵回·最多 6 條）／`${_loreStr_}`（★【這一步碰到的底細】·觸發條目·玩家這句話碰到的喜歡／討厭與冬木正典事實·沒中整段不存在）／`${_lenLine_}`（★【篇幅】·查 `KANSHOU_LEN_TIERS_`）
> ★【現在地點】：X（讀 `COL.PC.LOC` 玩家列·開場「冬木市，我的房間」·之後 AI 用 `scene` 欄寫回）
> ★【此刻】（「季節的時段」兩個詞**只在時段換了才送**，講過的存【此刻已述】；玩家這句話提到時間（`KANSHOU_TIME_KEYS_`：下午／晚餐／今晚…）就再錨一次「仍是冬天的清晨」；節奏那句每回合都在。2026-09-23：數字會被整串念進敘事，改成字之後五步有四步拿「冬天的清晨」當開頭，於是講過就不再送）＋★【今晚留下的人】／★【晨間餘韻·非強制】（都依「這回合她在不在場」過濾）
> ★【在場】＋`${finalUserMsg}`（玩家這回合的動作：自己打的字標 `【玩家原話】：`、按鍵路徑標 `【玩家意圖】：`；2026-09-23 抬頭改「玩家這一步（已在畫面上）：」且拿掉『』，agency 鐵律＝「那一步玩家自己已經看見了，這一段從在場的人對它的反應寫起」——「化成台詞融進去」那版讓 Flash Lite 原句照抄還學了『』）

⚠ 這一段隨時會走鐘。**真值以 `Gallery.gs` 的 `actionPlay_` 為準**，`check_wiring.py` 只數 ★ 區塊總數（`MIN_STAR_BLOCKS`），不比對這份文件。


回應解析欄位（現行 schema，見 `buildDefaultSystemPrompt` 的 finalJson）：`narration`／`options`（**6 條**·各≤20字·「六條分別通往六種不同的後續」〔2026-09 4→6〕·`optionsOn=false` 整欄刪）／`intimacy_feedback{player:{physical_state,appearance_extras}, npcs[]:{name,physical_state,appearance_extras,mutual_nicknames,**~~rel_tag~~（2026-09-23 拿掉，關係稱呼只有玩家能填）**,memory,**noticed**}}`／`world_note[]`／`scene`（這一段演完人在哪·≤12字·存 `COL.PC.LOC` 玩家列·下回合當 ★【場景】餵回）／`cast{join[],leave[]}`（AI 動【臨時在場】那一層·只認 `kanshouNameCandidates_` 查得到 id 的名字·同行者豁免）。**`noticed`〔2026-09·她眼中的你〕**：這回合真的從玩家言行看出來的一件事（≤14字、只記會改變之後怎麼對玩家的發現、多數回合「無」），`kanshouAppendUnique_` append 進她自己那列 MEMORY【眼中的你】。**`rel_tag`〔2026-09·關係稱呼交給 AI〕**：這個人現在是玩家的什麼（≤8字、跟上回合一樣就「無」），玩家自己打過就蓋【關係鎖】、AI 從此不碰。~~`inner_monologue`／`npc_exit`／`location`／`move_proposal`／`attitude`／`dynamic_skills`／`master_note`／`rel_changes`~~ 都已不存在（`npc_exit` 2026-09 換成 `cast`：它讓 AI 不問玩家就把人移出同行名單，現在 AI 只動得了臨時在場）；`physical_state` 是單一自由文字欄。

（`nsfwBaseRules`／`buildDefaultSystemPrompt` 定義在 `Gallery.gs`——紅線①保護區塊，本文不重複貼出，只標註 `actionPlay` 有引用其機制。函式簽名 `buildDefaultSystemPrompt(includeOptions, styles)`（2026-09 加 `styles`：玩家的說書人風格覆寫，`nsfwBaseRules` 改陣列組裝＋動態編號；缺省＝與舊字串逐字相同），永遠回傳慾海版本，因為查證後這個函式現在只可能被鑑賞呼叫。詳見 `SOLO_REFERENCE.md` §0。）

### 3.1 泡泡／旗標（2026-09 地點退休後的現況）

**鑑賞現在一顆泡泡都沒有。**

`roomEventOffer`／`roomEventAccept`／`knockEvent`／`knockAccept`／`moveProposal`／`encounterOffer`／`inviteResident` 全部不存在。

⚠ **砍掉泡泡的根因值得記著**：`moveProposal` 死在「兩個作者」——AI 已經把劇情演到咖啡廳了，
系統才跳出泡泡問玩家「要不要去咖啡廳」，按下去又把移動【再跑一次】。玩家原話
「劇情已經走到咖啡廳了。下面泡泡問我要不要去咖啡廳，我點了，原本跟我在同地的凜又進去跟櫻在一起了」。
**一件事只能有一個作者。** 之後要加任何「先問玩家再發生」的東西，先確認 AI 不會在問之前就把它演掉。

玩家現在的輸入只有兩種：**自己打字**，或**按【命運的抉擇】六顆選項之一**（按下去＝把那句話填進輸入框送出，
等同自己打的，不新增作者）。打數字 1～6 是同一顆的捷徑（上限讀 `currentOptions.length`，不寫死）。

---

## 4. 其他會叫 AI 的 action

| Action | Handler（檔） | AI |
|---|---|---|
| `war_forge_save` | `actionWarForgeSave`（War_Forge.gs） | **是**（只在外貌／性格有變時）：`translateLookToDaily_`＋`translatePersonalityToDaily_` 翻出鑑賞的日常三格，失敗留空不擋 |
| `war_forge_ai` | `actionWarForgeAi`（War_Forge.gs） | **是**：系統提示 `warForgeAiSys_(og)`（出處的角色框定＋技能命名規則、六圍計點與上限、可挑效果清單、JSON 格式），本段 `warForgeAiPrompt_`＝玩家的一句描述（＋指定職階）。回覆經 `warForgeDraft_` 收斂後只填表單 |
| `backfill_kanshou_ai` | `actionBackfillKanshouAi`（Gallery.gs） | **是**：進後日談首次建檔後在背景補御主的敘事欄（結構化 JSON） |

不叫 AI 的：`account_login`、`get_full_status`、`update_fate`、`update_rel_tag`、`kanshou_set_nickname`、`get_heroes`、`get_tags`、`outfit`、`sync`、`war_load`、`war_new`、`war_act`、`war_quit`、`war_forge_list`，以及鑑賞面板的 `kanshou_*`／`world`（純讀寫表）。

---

## 附：鑑賞 actionPlay 的條件式片段

`actionPlay`(Gallery.gs) 的條件式片段（**變數名即錨點**·2026-09 對照代碼修正；各自只在對應機制觸發時出現）：

| 片段變數 | 觸發 | 內容 |
|---|---|---|
| `kanshouNightSceneStr` | 夜未眠（兩段式就寢第一段） | ★【夜已深·門關上了】 |
| `_morningHere_` | 昨夜同床、且**這回合她在場** | ★【晨間餘韻·非強制】（人不在就整條不送） |
| `intimateNightNames` | 今晚留下過夜的人 | ★【今晚留下的人】 |
| `_worldFeed_` | 世界帳本挑出的相關條目（最多 6 條） | 這一局長出來的地方／人／設定 |
| `kanshouWorldRosterStr` | 有召喚過、此刻不在場的人 | ★【這座城裡還住著】（只給名字） |
| `_sc`（`COL.PC.LOC` 玩家列） | 上一回合 AI 寫回 `scene` | ★【場景】 |
| `_lenLine_` | 一律 | ★【篇幅】（查 `KANSHOU_LEN_TIERS_`） |
| `genderHintStr` | 玩家性別 | 旁白對「你」的用詞 |

~~`kanshouRoomEventStr`（橋段 13 筆）／`kanshouJealousStr`（醋意 20%）／`pActivityStr`（地點活動）／★【節慶氛圍】／★【今日天氣】~~ 都已不存在。
