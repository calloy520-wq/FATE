# KANSHOU_REFERENCE.md — 鑑賞（慾海後日談）唯一現況真相

> **這份只寫「現在是什麼」，不寫演變過程。** 想動鑑賞任何一塊、開機失憶要重建脈絡，看這一本就夠，不必去 `SOLO_REFERENCE.md` 考古編年史。
> **行號會漂，一律以「函式名／常數名」為錨。** 每條都以現行代碼為準（2026-07 對 main `1b4d98c` 核實）。
> 🔴 動手前必讀 `CLAUDE.md` 紅線：`nsfwBaseRules`＋NSFW 機制不可改（玩家授權才碰）、`Engine_Combat.gs` 的 `callGeminiAPI` 是兩軌共用基礎設施、`GAS` repo 不碰、model id 不進 repo。

---

## 🌹 一句話定位

鑑賞＝奪杯後日談的**約會模式**（NSFW）。**一個更單純的世界**：無戰鬥、無經濟、無房東房客世界觀，一張約會大地圖，她們各自有自己的住處與作息，其餘全靠 AI 即興演出。建在 `nsfwBaseRules`＋`buildDefaultSystemPrompt` 上、與 solo 共用 `actionPlay` 引擎與 `callGeminiAPI`。

### 世界觀鐵則（都是「已砍」的反向定義，別復活）
- **無戰鬥／無經濟**：`Router_Action.gs` dispatcher 明文擋 `KANSHOU_BLOCKED_ACTIONS_`。錢/打工/房租/商店/客房/肉償/欠租/宵禁全部**已刪**，grep 查無定義。AI 需要時自己掰、不寫試算表。
- **無房東房客**：獨立作息制（independent residency），不是跟隊模型。她們有自己的家（`KANSHOU_HERO_HOME_`）、每天自己移動。
- **無奪杯封存**：`claim_grail`/`actionClaimGrail`/排行榜/戰記**已刪**。
- **全程無花錢入口**（跟 solo 一樣）。`COL.PC.MONEY/UPKEEP_WEEK/ROOM` 是恆空死欄。

---

## 📊 資料層

### 分表隔離（與 solo 完全不污染）
- 鑑賞資料寫 **「鑑賞眾生」分頁**（`getKanshouPcSheet_`，lazy 建、schema 複製主「眾生」表頭、`COL.PC` 索引一致），與 solo「眾生」表隔離。
- **KPC_ 前綴路由**：dispatcher（`handleGameAction`）見 `pcId` 以 `KPC_` 開頭 → `sheets.pc` 指向鑑賞眾生。solo 是 `PC_`。
- **引擎硬擋**：`actionPlay` 開頭 `pcId` 非 `KPC_` 直接 return。
- **歸屬驗證**：`kanshouOwnedRowIdx_` 每次查帳號表 KPC 欄（`getAccountKanshouPcId_`）比對，不憑 pcId 找列（防偽造）。
- **前綴白名單**：`KPC_`(御主 avatar)／`KSV_`(封存邀請同伴)／`KHV_`(直接召喚同伴)／`DEAD_`。
- **歷史暫存**：solo/鑑賞**共用同一張「歷史暫存」表**，靠 `pcId` 前綴（`PC_` vs `KPC_`）隔離、非物理分表——架構唯一例外，記在案。

### COL.PC 鑑賞實際用到的欄位（定義 `Core_Settings.gs`）
| 欄 | 索引 | 鑑賞用途 |
|---|---|---|
| `MEMORY` | 12 | 所有中文方括號標記共用 cell（見下表），大量讀寫 |
| `LOC` | 6 | **鑑賞「是否同地在場」的唯一判準**（取代 IS_PARTY）。行程骰每回合寫回 |
| `BOND` | 24 | 好感。橋段+3／赴約+5／爽約-5／AI rel_changes 加減（夾天花板） |
| `REL_TAG` | 25 | 五階關係標籤。GAS 自動升降（`kanshouSyncRelTier_`），**AI 無寫入權**、玩家 UI 手動改（`update_rel_tag`） |
| `REL_MEM` | 28 | 關係專屬記憶／專屬稱呼／態度。AI 寫回 |
| `MEMOIR` | 27 | **共同回憶**（見專節）。原 `MAJOR_EVENT` 死欄復用 |
| `NAME/SEX/PREF/TRAIT/BACK/FACTION/GAME_ID/ID` | — | 組敘事卡片、sameGame 過濾、前綴判定 |

⚠ **`IS_PARTY`(26) 鑑賞刻意不讀不寫**（改用 LOC 判在場）；solo 仍用，兩軌並存。
⚠ **死欄`MONEY`(33)/`UPKEEP_WEEK`(34)/`ROOM`(35) 恆空**、鑑賞無讀寫端——**不可刪欄**（COL 是位置索引，刪了後面全錯位）。

### MEMORY 標記全表（工廠 `makeIntTag_`/`makeTextTag_` 在 `Core_Settings.gs`；多標記以全形 `｜` 分隔共用一 cell）
| 標記 | 完整格式 | 存哪列 | 讀寫端 |
|---|---|---|---|
| 【約定】 | `【約定】absDay:band:loc` | 該同伴列 | `kanshouGetPromise_`/`SetPromise_`/`ClearPromise_`/`PromisePin_`；赴約結算讀清 |
| 【同居】 | `【同居】1` | 同伴列 | 寫入同居落地；讀 `kanshouIsCohabit_` |
| 【牽手】 | `【牽手】對象名` | **玩家列** | 牽手 set／放手 set('')／在場氛圍讀 |
| 【邂逅】 | `【邂逅】逗號分隔姓名` | 玩家列 | 永久巧遇名單（去重） |
| 【邂逅中】 | `【邂逅中】heroId` | 玩家列 | 本次到訪暫存，換地點清 |
| 【住所】 | `【住所】家名` | 玩家列 | `getKanshouHomeName_`（查無預設「我家」）／改名 set |
| 【晨間餘韻】 | `【晨間餘韻】同伴名` | — | 同床隔天引子，讀一次即清 |
| 【初見日】 | `【初見日】absDay`（IntTag 預設0） | 同伴列 | 首次同地寫入，紀念日里程碑比對 |
| 【底片】 | `【底片】day:used` | 玩家列 | `kanshouFilmUsed_`，隔日歸零 |
| 【帳號】 | `【帳號】acctName` | — | 人工檢視辨識（非驗證，歸屬走帳號表） |
| 【換裝】【口吻】【小動作】 | — | 同伴列 | 鑑賞**讀取**（`getOutfit_`/persona），寫入屬 solo/persona 生態、非鑑賞獨有 |

---

## ⏰ 時間系統

- **每動作推進 10 分鐘**：`KANSHOU_HOUR_PER_ACTION_ = 1/6`（2026-07「問個菜色都中午了」→ 半小時太兇）。
- **五時段** `KANSHOU_TIME_BANDS_`：清晨(5)／午後(11)／黃昏(17)／夜晚(20)／深夜(0)。
- **當日不跨日上限** `KANSHOU_DAY_LAST_HOUR_ = 23`；被動聊天每回合 `+1/6` 小時流動。
- **曆法**：Day1 = 12/20（`KANSHOU_CAL_START_MONTH_/DAY_`），`KANSHOU_FESTIVALS_` 節慶表，前端顯示西曆年月日。
- **主動跳時間**：`kanshouNextStage`(下一時段·深夜則睡過夜)／`kanshouJumpBand`(跳指定時段)／`kanshouJumpFestival`(快轉節慶)／`kanshouEndDay`(結束一天)。跳時間會**全世界重骰去向**（`kanshouRollDailyLocation_`），讓在場人物重新分佈。
- 相識紀念日里程碑 `KANSHOU_ANNIV_MILESTONES_ = [7,30,100,365]`。

---

## 💕 關係五階系統

- **五階門檻** `KANSHOU_REL_TIER_`：戀人≥80／親近的人≥60／熟識的朋友≥40／普通朋友≥20／點頭之交≥-100（起始）。
- **自動分級** `kanshouSyncRelTier_`：僅當現 REL_TAG 仍等於某梯度字面時才覆寫（玩家自訂稱呼後不再自動蓋回）。
- **聊天天花板** `kanshouRelChatCeiling_(bond)`：純聊天（AI rel_changes）加好感只夾到「當前梯度上限」。**只從 40 起擋**（`filter(m >= 40)`）——bond<40 不封頂（解 19 死鎖）；bond<60→上限59；<80→79；≥80→100。
- **突破手段**（繞過聊天上限、直接寫 BOND）：
  - **約定赴約 +5**（硬編字面，`kanshouPromiseMetStr` 那段，不吃 chat ceiling）
  - **親密橋段 +3**（`KANSHOU_SCENE_BOND_ = 3`，非拒絕分支）
- **AI 對關係的影響力只剩「認不認」**：寫在 `intimacy_feedback.npcs[].attitude`，**不能覆寫 REL_TAG**。
- **親密尺度分五階**（提示詞側·硬約束肢體親密程度）：<20完全碰不到／20-39婉拒／40-59輕度接觸／60-79親吻擁抱／80+無上限。門檻 20/40/60/80 借用同居(80床)/夜襲(60)等切點。

---

## 🗓️ 約定 2.0

- **存儲**：`【約定】absDay:band:loc`（存**該同伴列**），同時只存一筆（新約蓋舊約）。舊格式 `【約定】day:loc`（無時段）**向後相容＝整天有效**。
- **時段** `KANSHOU_APPT_BANDS_`：午後(14:00)／黃昏(18:00)／夜晚(20:00)；`kanshouApptHour_(band)` 回具體小時（null＝舊格式整天有效）。
- **赴約結算**（`actionPlay` 內，**必須在 `partyRows` 組裝之前**——聊天/拍照/原地消磨三路才吃得到剛移過來的從者）：
  - **赴約**（`_pr.day === curDay` 且同地）→ 清約＋`BOND+5`（夾100）＋餵「依約相會」提示
  - **爽約**（`_pr.day < curDay`）→ 清約＋`BOND-5`（夾0），在場才餵「爽約之後」提示（讓她流露被放鴿子的在意）
  - 累加進 `kanshouPromiseMetStr` 餵 AI。
- **前端**：`kanshouPromiseMeet(name)` 發起（選地點+時段）；`kanshouWaitForPromise(targetHour)` 撲空等待框（跳到約定前10分鐘）；地圖 `promiseByLoc` 徽章顯示哪個地點有約。
- **移動接人**：時間快轉在「給 AI 資料之前」先把該去的人拉到約定地點（順序鐵則同上）。
- **🆕 她也能主動邀約**（`promise_proposal`）：AI 讓在場同伴開口約你改天見面 → 後端驗證（在場＋合法地點＋合法時段）→ 回傳 `promiseProposal` → 前端跳同意泡泡（`kanshouAcceptPromise`）→ 玩家按同意帶 `promiseAccept`（send 第23參數）**直接落地【約定】**（她自己提的、不走 proposal_accept 二次判定）。婉拒＝`kanshouDeclinePromise`。與玩家發起共用同一套赴約結算。

---

## 📖 共同回憶（memoir）

- **存 `COL.PC.MEMOIR`(27)**，每位同伴一份。
- **AI 每回合吐 `memory` 欄**（里程碑一句、≤30字、玩家第一人稱視角），`processMemoir_` append：**cap 10**，去重（比對忽略★前綴），**★釘選永不驅逐**。
- **玩家 UI 管理**：`actionKanshouMemoirOp`（pin/unpin/del，帳號綁定）。前端 `kanshouOpenMemoir`/`kanshouMemoirOp`（`_kmBusy` 讀條保護擋連點）；同伴卡片 **💞回憶** 按鈕。
- 餵 AI 時★前綴會剝除。

---

## 🎭 橋段（scripted events）

- **資料表** `KANSHOU_SCENE_EVENTS_`（約13筆）：日常 夜襲／賴床叫醒／共浴／溫泉同浴／膝枕／下廚／觀星；節慶 初詣／情人節巧克力／七夕短冊／中秋賞月／聖誕約會／跨年倒數。走向骰 `kanshouRollSceneBranch_`。
- **offer+accept 制**：先跳邀請框（`roomEventOffer`），玩家按 `kanshouAcceptRoomEvent` 才演。非拒絕分支 `BOND+3`。
- **觸發表**：`KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_ = {深夜:夜襲, 清晨:賴床叫醒}`（同居和室）／`KANSHOU_LOCATION_EVENTS_`（地點×時段）／`KANSHOU_FESTIVAL_EVENTS_`（節慶）。
- **深夜敲門**：每次「結束一天」擲 `KANSHOU_KNOCK_CHANCE_ = 0.2`，候選需好感≥`KANSHOU_KNOCK_MIN_BOND_ = 60`；跳敲門泡泡（`kanshouAnswerKnock`/`kanshouIgnoreKnock`）。

---

## 📷 拍照／相簿

- **底片** `KANSHOU_FILM_PER_DAY_ = 3`（`【底片】day:used`，隔日歸零）；**相簿上限** `KANSHOU_ALBUM_CAP_ = 100`。
- 拍照落地在 **AI 成功後**（失敗不耗底片）：AI 多吐 `photo_caption`，寫 `kanshouAlbumSheet_`。髮色從被拍者 TRAIT 現場解析（`KANSHOU_HAIR_COLORS_`）。
- 前端：`kanshouTakePhoto`／`kanshouShowPhoto`(拿照片給在場者看)／`openKanshouAlbum`（`get_album`）／`kanshouDeletePhoto`（`album_delete`）。

---

## 🚶 作息／同居／拜訪

- **獨立作息**：每人有自己的家 `KANSHOU_HERO_HOME_`（`region:'visit'`）；`kanshouRollDailyLocation_` 每逢時間推進重骰全世界去向；**LOC 判在場**。
- **同伴詳情上限** `KANSHOU_PARTY_DETAIL_CAP_ = 5`（同地最多給5張詳細卡，敘事上限非隊伍容量），依 BOND 排序。
- **同居**：好感≥`KANSHOU_COHABIT_BOND_ = 90` 可邀（`kanshouInviteCohabit`），就寢/夜襲在 `KANSHOU_COHABIT_ROOM_ = '和室'`；`【同居】1` 標記。**🆕 她也能主動邀同居**（`cohabit_proposal`，好感達門檻＋在場＋未同住時）→ 回傳 `cohabitProposal` → 前端同意泡泡（`kanshouAcceptCohabit`，複用 cohabitInvite 後端、不重複跳確認框）。
- 🎛️ **AI 主動提議通則**（move/promise/cohabit_proposal 共用）：都是「意圖非結果」，narration 停在她開口的當下、由玩家按泡泡決定；三種提議同回合互斥（有 moveProposal 就不浮 promise/cohabit，避免泡泡打架）。
- **拜訪私宅**：好感≥`KANSHOU_VISIT_BOND_ = 40`（熟識朋友切點）才解鎖登門（`kanshouResidenceUnlocked_`）。
- **巧遇**：`kanshouToggleEncounter_` 開關；女性保底池 `KANSHOU_ENCOUNTER_FEMALE_IDS_`；結識 `kanshouAcceptInvite`（`inviteResident`）。
- **牽手**：`kanshouHoldHand`/`kanshouReleaseHand`（單獨約會氛圍，`【牽手】` 存玩家列）。

---

## 🤖 AI 管線

### `actionPlay` 執行階段順序（**順序鐵則·勿亂動**）
1. 入口守門（非 `KPC_` return）＋`driveOn`/`encounterOn` 旗標＋標籤化
2. 讀表（整表只讀一次）→ 定位 pc、curL/curDay/curHour
3. UI 按鈕意圖落地（相約提議/同居/牽手/結識入駐/橋段 offer+accept）
4. 結束一天·敲門判定（命中直接回 knockEvent 不推進）
5. **跳時間/advanceHours**（重骰全世界去向、換幕鐵律）
6. **約定赴約結算（`_settle`）** ← ⚠ **必須在第7步之前**
7. **partyRows/partyMembers 組裝**（同地在場名單、詳情卡 `partyDetailsArr`）
8. 拍照（驗底片/容量 → 掛 `kanshouPhotoPending_`）
9. 提示詞組裝（USER prompt，見下）
10. `aiConfig` → 歷史餵入 → `callGeminiAPI`
11. `sanitizeAiData_` → 各欄位落地（拍照/location/move_proposal/proposal_accept/npc_exit/rel_changes/intimacy_feedback）→ 髒列窄讀重定位寫回 → `saveGameHistoryBatch`
12. 回傳前端 key：`text/statusString/people/options/tags/moveProposal/roomEventOffer/encounterOffer/photoResult/kanshouClock/clock`

### 系統提示詞 `buildDefaultSystemPrompt()`（**鑑賞專屬**，solo 走 `miniSystem`）
`nsfwBaseRules`（🔴紅線）＋`specificRules`(慾海律令 第0~7條)＋`★【輸出範本】`(finalJson)。
- **finalJson 欄位**：`inner_monologue`(純思考不顯示)／`narration`(約500字第一人稱)／`move_proposal`(她提議換地·意圖非結果)／`promise_proposal`(她提議約定{name,loc,band})／`cohabit_proposal`(她提議同居·真名)／`proposal_accept`(僅有【提議·相約/牽手】標記時填接受/婉拒)／`npc_exit`(自然告辭離場真名陣列)／`options`(固定4)／`intimacy_feedback`{player,npcs[]:physical_state≤15/outfit_change≤20/dynamic_skills/mutual_nicknames/attitude≤15/memory}／`rel_changes`[]{target真名,fav_change整數±·單回合上限+5}。⚠ **刻意無 `location` 欄**（玩家所在地一律 GAS 掌握、AI 抄它無意義；後端仍留 `aiData.location` 攔截層當保險→硬吐也轉 move_proposal）。
- **對話格式** `dialogueFormatRule_()`：**頂層函式·單一真實來源**，`nsfwBaseRules` 第3條與 solo `miniSystem` 第2條**共用**。規則＝話語/喘息/吸吮進「」，動作/撞擊/水聲走敘事。

### 模型配置（`Core_Settings.gs` + `actionPlay` aiConfig）— 🚀2026-07定案
```
AI_MODEL     = deepseek/deepseek-v4-flash    (屬性 MODEL)        ← 只當備援
SOLO_MODEL   = google/gemini-3.1-flash-lite  (屬性 SOLO_MODEL)   ← 主力(快4倍·真敢寫)
UNLOCKED_MODEL = x-ai/grok-4.20              (屬性 UNLOCKED_MODEL)
```
- **兩模式一律先打 `SOLO_MODEL`、`fallbackModel = AI_MODEL`、`retries = 1`**（探針實測 Gemini 六階全過真露骨~4-5秒；DeepSeek 極致被擋還卡49秒）。
- **`driveOn`(點火/主動掌握) 只控敘事推進幅度的 `driveStr`、不再切模型**。
- 採樣：`temperature 1.08, top_p 0.97, top_k 60, repetition_penalty 1.12, presence/frequency_penalty 0.25, max_tokens 1500`。⚠ 後四顆旋鈕 gemini-lite 被 OpenRouter 靜默忽略（原壓重複用）——若 Gemini 跳針/套路化，需另想防重複提示詞手段。
- 歷史：`getGameHistoryBatchRaw(pcId, 6)`（6筆＝3輪）。

### `callGeminiAPI` 失敗行為（`Engine_Combat.gs`·兩軌共用·只讀不改）
被 NSFW 擋（`PROHIBITED_CONTENT/SAFETY`/空 content）→ 同模型內首次觸發加 `softenSuffix` 降階柔化重試 → 整組失敗且有 `fallbackModel` 才換模型再跑一輪 → 最終被擋回「🌸結界觸發」、一般錯誤回「🌫️因果紊亂」。

---

## 🖥️ 前端地圖（`gas/Script_Kanshou.html` 為主）

- **唯一引擎入口 `send()`＝`action:'play'`**。移動/相約/拍照/牽手/同居/敲門/橋段**沒有各自的 action**，全靠 `send()` 夾旗標欄位：`moveTarget`/`moveWithCompanion`/`promiseMeet`/`takePhoto`+`photoIntent`/`showPhoto`/`handHold`/`cohabitInvite`/`roomEventAccept`/`knockAccept`/`skipKnockCheck`/`lookAround`/`inviteResident`。
- **獨立 action**：`kanshou_companions`／`get_heroes`／`kanshou_summon_hero`／`get_album`／`album_delete`／`update_rel_tag`／`kanshou_memoir_op`／`kanshou_set_home_name`／`kanshou_set_name`／`kanshou_set_sex`／`enter_kanshou`／`backfill_kanshou_ai`。
- **函式分組**：地圖移動(`kcMapListHtml_`/`kanshouMoveTo`/`kanshouProposeMove`/`kanshouLookAround`)、同伴面板(`openCompanions`/`renderKcHeroList_`/`kanshouEditRelTag`)、召喚(`kanshouSummonHero`)、回憶(`kanshouOpenMemoir`/`kanshouMemoirOp`)、約定(`kanshouPromiseMeet`/`kanshouWaitForPromise`)、拍照相簿(`kanshouTakePhoto`/`openKanshouAlbum`)、時鐘(`kanshouEndDay`/`kanshouNextStage`/`kanshouJumpBand`/`kanshouJumpFestival`)。
- **泡泡 UI**（`send()` 內依回傳欄位組）：移動同意(`moveProposal`)、敲門(`knockEvent`)、橋段邀請(`roomEventOffer`)、巧遇(`encounterOffer`)、拍照結果(`photoResult`)、地圖人數徽章(`_lastTags.locationCounts`)。
- **前端鏡像常數**（後端為真實來源）：`KC_REGIONS_`/`KC_FESTIVALS_`/`KC_TIME_BANDS_`/`KC_LOCATIONS_`/`KC_APPT_BANDS_`。時鐘全域 `kcClock`（`Script.html`）。
- **`Script.html`/`Index.html` 的鑑賞殘留**：`applyModeUI()` 總開關（依 isKanshou 切 topbar/輸入框/drive開關/photo-btn/相簿抽屜/節慶抽屜）；同伴卡鑑賞按鈕列(🏷️關係/📅相約/✋放手/🤝牽手/🏠同居/💞回憶)；`enterKanshou()` 入口。⚠ `Index.html` 的 `#victory-memoir`＋💞里程碑是**戰爭軌奪杯回憶錄 UI，不屬鑑賞**（別混淆）。

---

## ⚠️ 教訓區（防回歸警語·只留警告不留故事）

- **COL 是位置索引**：`MEMOIR`(27)/`MONEY`(33)/`UPKEEP_WEEK`(34)/`ROOM`(35) 就算恆空也**不刪欄**——刪掉後面全部欄位錯位、砸爛既有試算表每列對齊。要棄用就標「死欄」，不刪。
- **`grep -c nsfwBaseRules` 假陽性**：顯示非0常是 `return nsfwBaseRules + ...` 那行被帶進 diff context，`+`/`-` 兩側都沒該字樣＝本體未動。仍須自己判斷是否碰到紅線①保護的機制範疇。
- **`physical_state` slice(0,20)** 是刻意的容錯緩衝，**別對齊文件改回15**（會半句截斷「臉頰帶著因尷尬而生的」）。
- **敘事終極警告**：被玩家搭話的 NPC **必須先給出她此刻的回應**才停筆，別只寫完玩家動作就收尾（「她不理我」的根因）。
- **好感突破改「約會路徑」**：送禮突破已廢；橋段/約定提示詞尾會 append「好感已由系統上調·敘事勿再另計」防 AI 重複計。
- **查洩漏查兩份鏡像**：同伴側 vs 玩家自己側、AI生成內容 vs AI失敗的降級保底值，兩層都要查。
- **平行世界原則**：`persona.back/speech/tic` 的**戰時值別照搬進鑑賞**（後日談無聖杯戰爭）。
- **onclick 字串內的呼叫不算死碼**；`removeAllTriggers()` 零呼叫是 GAS 工具正常型態、非死碼。
- **HTML 刪除先手算 div 開合平衡**再刪，避免刪頭忘刪尾崩整頁。

---

## 📎 主要常數速查（都在 `gas/Gallery.gs`）
`KANSHOU_REL_TIER_`(五階) · `KANSHOU_SCENE_BOND_`(3) · `KANSHOU_APPT_BANDS_`(午後14/黃昏18/夜20) · `KANSHOU_HOUR_PER_ACTION_`(1/6) · `KANSHOU_TIME_BANDS_`(5時段) · `KANSHOU_LOCATIONS_`(合法地點白名單·AI location/move 驗證) · `KANSHOU_HERO_HOME_`(各人住處) · `KANSHOU_SCENE_EVENTS_`(橋段庫) · `KANSHOU_FILM_PER_DAY_`(3)/`KANSHOU_ALBUM_CAP_`(100) · `KANSHOU_KNOCK_CHANCE_`(0.2)/`KANSHOU_KNOCK_MIN_BOND_`(60) · `KANSHOU_COHABIT_BOND_`(90)/`KANSHOU_VISIT_BOND_`(40) · `KANSHOU_PARTY_DETAIL_CAP_`(5) · `KANSHOU_STARTER_IDS_`(開局起手池) · `KANSHOU_SUMMON_BLOCKED_IDS_`(暫不開放召喚)。
