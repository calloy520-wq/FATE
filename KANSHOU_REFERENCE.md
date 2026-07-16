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
- **主動跳時間**：`kanshouNextStage`(下一時段·深夜則睡過夜)／`kanshouJumpBand`(跳指定時段)／`kanshouJumpFestival`(快轉節慶)／`kanshouEndDay`(結束一天)。跳時間會**全世界重骰去向**（`kanshouRollDailyLocation_`），讓在場人物重新分佈——**牽手中的她豁免重骰**（跟著玩家）。
- **`endDay` 語義＝「睡到即將到來的 6:00」**（2026-07 玩家實測跨2天根修）：`curHour >= 6` 才 `+1 day`；深夜 00:00~05:59 按結束一天＝睡到**當天** 6:00、不再多跳一天（夜→深夜本身已 +1 day，endDay 再 +1 就是雙倍扣）。前端 `_reHourAfter` 樂觀預測同步這套規則（endDay→6／jumpBand→時段起點／jumpFestival→6／advanceHours→mod24）。
- **⏰ 跨時段自然告辭**（2026-07·玩家「NPC 不會自己離開?」）：被動 +10 分鐘若跨越時段界線（`kanshouBandCrossed_`），非牽手/非跟隨(`kanshouPreMoveCompanions_`)/非約定釘住/**非本回合提議對象(`_pendingProposal`·第二輪稽核補：她被骰走＝AI 同回合收到「向她提議」＋「她已告辭」矛盾指令、接受還把牽手落到已離場者)**的在場者會被重骰去向；離場者名單餵 AI（`kanshouNpcLeaveStr_`）演「自然道別後離開」，並帶**豁免句**——告辭這一句不受「在場驗證鐵律」限制（鐵律本文也明示「系統注入段明示豁免者除外」，兩端閉環）。
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
  - **赴約**（`_pr.day === curDay` 且同地）→ 清約＋`BOND+5`（夾100）＋餵「依約相會」提示＋回 **`promiseSettle{type:'promise_met'}`** 前端亮「依約相會💕」通知條（2026-07 稽核補：原本赴約成功玩家零回饋）。
  - **爽約**（`_pr.day < curDay`）→ 清約＋`BOND-5`（夾0）＋寫一筆 memoir「我爽約了…讓她空等一場」＋回 **`promiseSettle{type:'promise_missed'}`** 通知條；在場才餵「爽約之後」提示（讓她流露被放鴿子的在意）。前端 `kanshouEndDay` 睡前若有今日之約會先跳警告。
  - 累加進 `kanshouPromiseMetStr` 餵 AI。⚠ **結算回饋走獨立通道 `promiseSettle`、不借用 `proposalResult` 單槽**（第二輪稽核三路同時撞到：post-AI 提議結果無條件覆寫單槽，同回合「爽約結算＋新提議成功」時結算通知被吞）——前端收到 `promiseSettle` 或 `proposalResult.type==='promise'` 任一都重抓 `kanshou_companions` 刷新 `_kcCur`（否則舊快取殘留已結算的約→假爽約警告）。
  - **⚠ 未解鎖私宅不可當約定地**（2026-07 第二輪稽核·必爽約陷阱）：鎖住的 visit 住處物理上進不去（地圖灰鎖＋後端擋移動）→ 約在那裡＝到期必 -5。三層擋：前端 `kanshouPromiseMeet` 地點面板不列、後端 `_pmLocOk`、AI `promise_proposal` 驗證，皆走 `kanshouResidenceUnlocked_`。
- **前端**：`kanshouPromiseMeet(name)` 發起（選地點+時段）；`kanshouWaitForPromise(targetHour)` 撲空等待框（跳到約定前10分鐘）；地圖 `promiseByLoc` 徽章顯示哪個地點有約。
- **移動接人**：時間快轉在「給 AI 資料之前」先把該去的人拉到約定地點（順序鐵則同上）。
- **🆕 她也能主動邀約**（`promise_proposal`）：AI 讓在場同伴開口約你改天見面 → 後端驗證（在場＋合法地點＋合法時段）→ 回傳 `promiseProposal` → 前端跳同意泡泡（`kanshouAcceptPromise`）→ 玩家按同意帶 `opts.promiseAccept` **直接落地【約定】**（她自己提的、不走 proposal_accept 二次判定）。婉拒＝`kanshouDeclinePromise`。與玩家發起共用同一套赴約結算。**⚖️ 玩家裁定：她約完就走也照樣成立**——約是她提的、契約只差玩家點頭，她在不在場不影響寫入；差別只在敘事（在場演她的反應／已離場演玩家記下這個約）。別把「玩家發起需對方在場」的規則錯套到這裡。

---

## 📖 共同回憶（memoir）

- **存 `COL.PC.MEMOIR`(27)**，每位同伴一份。
- **AI 每回合吐 `memory` 欄**（里程碑一句、≤30字、玩家第一人稱視角），`processMemoir_` append：**cap 10**，去重（比對忽略★前綴），**★釘選永不驅逐**。
- **玩家 UI 管理**：`actionKanshouMemoirOp`（pin/unpin/del，帳號綁定）。前端 `kanshouOpenMemoir`/`kanshouMemoirOp`（`_kmBusy` 讀條保護擋連點）；同伴卡片 **💞回憶** 按鈕。
- 餵 AI 時★前綴會剝除。

---

## 🎭 橋段（scripted events）

- **資料表** `KANSHOU_SCENE_EVENTS_`（約13筆）：日常 夜襲／賴床叫醒／共浴／溫泉同浴／膝枕／下廚／觀星；節慶 初詣／情人節巧克力／七夕短冊／中秋賞月／聖誕約會／跨年倒數。走向骰 `kanshouRollSceneBranch_`。
- **offer+accept 制**：先跳邀請框（`roomEventOffer`），玩家按 `kanshouAcceptRoomEvent` 才演。非拒絕分支 `BOND+3`。⚠ offer 組裝時**現場過濾候選人 LOC＝當前地點**（2026-07 稽核修：舊版沿用回合初快取，人已離場還發邀請＝幽靈橋段），過濾後無人＝不發 offer。
- **觸發表**：`KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_ = {深夜:夜襲, 清晨:賴床叫醒}`（同居和室）／`KANSHOU_LOCATION_EVENTS_`（地點×時段）／`KANSHOU_FESTIVAL_EVENTS_`（節慶）。
- **深夜敲門**：每次「結束一天」擲 `KANSHOU_KNOCK_CHANCE_ = 0.2`，候選需好感≥`KANSHOU_KNOCK_MIN_BOND_ = 60`；跳敲門泡泡（`kanshouAnswerKnock`/`kanshouIgnoreKnock`）。
- **🎭 橋段提醒徽章（前端·2026-07·玩家「不知道去哪、幾點」）**：地圖每個地點按鈕旁標該地橋段＋時段（客廳💤午後、浴室🛁夜/深夜、屋頂花園🌌夜/深夜、廚房🍳黃昏、隱藏溫泉♨️、和室🌙深夜/清晨·需同居）；**當前時段命中就高亮**。前端鏡像 `KC_LOCATION_EVENTS_`＋`kcSceneBadge_`（唯一真實來源仍是後端 `KANSHOU_LOCATION_EVENTS_`／`KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_`，改後端觸發表記得同步鏡像）。⚠ 橋段 offer **無好感門檻**（好感只軟硬化她的反應·分支），徽章不標好感。

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
- **牽手**：`kanshouHoldHand`/`kanshouReleaseHand`（單獨約會氛圍，`【牽手】` 存玩家列·值＝她的短名）。**生命週期不變式**（2026-07 玩家實測補齊）：① 跳時間重骰**豁免**牽手對象（不會憑空消失）；② 每回合算 `kanshouHeldName_` 時驗「她真的在場」——不同地點自動放手清標記（根治「隔空牽手/重逢自動牽手」）；③ `endDay` 睡覺一律放手；④ 對象名一律走 `kanshouNameCandidates_` 比對（別名/大小寫都認得）。

---

## 🌱 玩家御主：留白＋滾動側寫（2026-07）

- **兩種創角**（`askKanshouSetup`）：**超簡易**（`aiExpand:true`→`backfill_kanshou_ai` 一次 AI 擴寫，原配方）／**詳細**（留白，之後改命自己填＋AI 側寫慢慢補）。
- **開局欄位**（`actionEnterKanshou` 秒寫）：TRAIT＝外貌(玩家填)、氣質空、自稱「我」、私密「無」；PREF＝對外性格(玩家填「個性方向」)、獨處/喜歡/討厭全空；**經歷(BACK)＝「剛搬來冬木市」**；萌點(INTENT)空。
- **經歷（原「身世」正名）**：AI 每回合經 `master_note.經歷` **滾動更新**（承接舊值增補新遭遇、≤80字·bounded overwrite），玩家可經**改命**自己改（back 型·mode 判斷 kanshou 才叫「經歷」、cap 80）。卡面標題 `#ui-back-title` 也依模式正名：**鑑賞看自己卡＝「經歷」**、從者卡/solo＝「身分背景」（updateUI 切換·從者的 BACK 是真背景不是滾動經歷）。
- **空性格欄 AI 側寫回填**：`master_note.{對外性格/獨處性格/喜歡/討厭}` **只回填仍空的格**——玩家改命填過的＝鎖（判準：該 PREF slot 非空），AI 絕不覆寫。像對話 AI 慢慢認識使用者。
- **萌點(INTENT) AI 盲寫**：`master_note.萌點`——⚠ 萌點是紅線③ show-don't-tell、**絕不餵給 AI**，故 AI 看不到現值只能「盲寫」(依這回合言行暗中觀察一個反差/可愛弱點)。因盲寫不能 refine(會 churn)，落地採**「只補第一個發現、之後不覆寫」**：`COL.PC.INTENT` 空才寫、非空(AI 補過 or 玩家改命填過)＝鎖死不動(Gallery.gs post-processing)。跟性格不同款(性格餵給 AI 可持續 refine·萌點盲寫只補一次)——差異源於能不能餵給 AI。玩家改命隨時可覆蓋。
- **🔒 性格鎖（玩家 UI 控制·預設不鎖）**：改命-個性視窗每格一個 🔒 開關 → 寫 `【性格鎖】`（`kanshouGetPrefLocks_`/`SetPrefLocks_`）。**鎖了 = AI 連那欄都看不到**（`actionPlay` 依鎖狀態算「沒鎖的格」→ `buildDefaultSystemPrompt(unlockedKeys)` **動態組 master_note、鎖的格不出現在 schema**）＋GAS 落地再過濾一次（雙保底）。沒鎖 = AI 可持續 refine（不是一次寫死）。鎖狀態經 play 回應 `prefLocks` 快取到前端 `window._kcPrefLocks`（改命視窗顯示開關）——**`enter_kanshou` 兩條路徑也回傳 `prefLocks` 播種**＋後端 `update_fate` 只在 `Array.isArray(userData.prefLocks)` 時才寫鎖（undefined＝保留現鎖），2026-07 稽核修「重登→未按過 play 就改命存檔＝鎖被清空」。鎖開關只在**看自己卡片**時顯示（`_isKSelf`·從者卡看得到鎖圖示但無開關）。經歷不鎖（改命=修正、AI 續滾）。⚠ `buildDefaultSystemPrompt(masterNoteUnlocked)` 只有 `actionPlay` 一個呼叫者，故在 actionPlay 組好當 systemOverride 傳入。
- **🪪 角色卡分行顯示（前端 `renderSegField_`·Script.html）**：鑑賞卡把「處事個性(對外/獨處/喜歡/討厭)」「命格特徵(外貌/氣質/自稱/私密)」從一串頓號拆成帶標籤小行，空格提示分欄位：處事個性→「（AI 待補）」(AI 會側寫)、命格特徵→「（待你改命填寫）」(AI 不寫 TRAIT)；從者卡一律「—」。鎖住的處事個性格右側掛 🔒（只看自己卡片時·`currentStatusTargetId===pc.id`）。原始頓號字串存 `dataset.raw`，改命視窗改讀它（分行 HTML 的 innerText 會亂）。solo 維持原樣純文字。
- **⚠ 拆格 bug 根治**：`fateSegSplit_`(顯示與改命共用)只做 `。→、` 正規化＋`split('、')` 補滿4格，**不再壓縮連續頓號**——舊版 `.replace(/、+/g,'、')` 會把「、、我、無」壓成「我、無」導致值位移(我被推到第1格)，改命預填/存回全錯，現已修正。
- **🌀 側寫節流（每 N 回合才問·`KANSHOU_SIDEWRITE_EVERY_`=3）**：master_note 每回合都問會分散 AI 對敘事的注意力，改成計數節流——`【側寫計數】` 標記存玩家列 MEMORY（`kanshouGet/SetSideWriteCount_`，該列恆寫回·零額外 round-trip），`actionPlay` 每回合 +1，只在第 1、N+1、2N+1… 回合（`_swCount % N === 1`·首回合必寫抓初印象）把 `includeMasterNote=true` 傳給 `buildDefaultSystemPrompt`；非側寫回合整塊 master_note 從 schema `delete` 掉、AI 連這欄都看不到。落地端 `if(aiData.master_note)` 守衛自動跳過缺席回合、經歷/性格/萌點保留舊值不動。N=3 剛好貼齊 6筆/3輪 歷史窗。要調頻率＝改常數。
- **🏷️ 日常稱呼系統（2026-07 玩家定案「姓氏太多餘、名字太正式」）**：鑑賞世界一律短名——`KANSHOU_CASUAL_NAME_`（keyed by SEED id）：SABER／RIDER／伊莉雅／櫻／凜／大河／士郎。`KANSHOU_NAME_ALIAS_` 全名↔短名雙向別名疊進 `kanshouNameCandidates_`（舊存檔/歷史/AI 寫哪種都對得上人）＋**拉丁字母大小寫變體**（AI 寫 Saber/saber 也對得上 SABER——2026-07 稽核修，否則 rel_changes/npc_exit 大小寫不合＝靜默失效）；`kanshouHeroIdByName_` 短名優先查 id。建列（`heroToKanshouRow_`）、巧遇/結識顯示、召喚訊息全用短名；召喚查重跨名比對。`actionEnterKanshou` 路①含**一次性遷移**（既有列全名→短名·冪等，含玩家 MEMORY 牽手標記值；**只改 `FACTION==='從者'` 列**——2026-07 稽核修，無過濾會把玩家分身列也改名）。⚠ 種子庫只有一位櫻（id `間桐櫻黑化-Master`·真名間桐櫻）→ 就叫「櫻」，無黑櫻。英靈殿/solo 名字不動。「見過面」名單（`addKanshouMet_`）仍存全名（向後相容，比對不經它）。
- **★焦點禮讓**（玩家實測「我親櫻乾伊莉雅啥事」）：玩家明確只對一位互動時其他在場者保持背景存在感、不可搶話批評介入親密舉動；交情淺的旁觀者頂多尷尬移開視線。醋意暗流（`kanshouJealousStr`·兩位 ≥60 同場 20%）另有系統提示不受此限。
- ⚠ `master_note` 是 KANSHOU-only（buildDefaultSystemPrompt）；solo BACK 仍是固定身世（改命 UI 依 `pc.mode` 分標籤/字數）。

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
- **finalJson 欄位**：`inner_monologue`(純思考不顯示)／`narration`(約500字第一人稱)／`move_proposal`(**雙向**換地共識·她邀你 or 你邀她而她答應皆填·意圖非結果——2026-07 修：原只寫「她邀你」，玩家開口邀她答應了 AI 沒授權可填→沒泡泡、移動永遠落不了地。⚠ 但別依賴 Gemini 自發填此欄——實測它從不填，見下)。**🚶👋 玩家提議同去已改確定性管線（2026-07 根因修復）**：地圖 👋 鈕舊版只送一句閒聊、全押在 AI 自發填 move_proposal 上→Gemini 從不填→玩家從沒見過移動泡泡。現改 `proposeMove` 機制標記：pre-AI 記 `_pendingProposal{type:'move'}`＋注入★【提議·同去】鐵律 → AI 只需在 `proposal_accept` 答「接受/婉拒」（跟相約/牽手同一條路）→ 接受＝post-AI 回填 `moveProposal` 出既有「前往」泡泡＋`proposalResult` 通知條，玩家按同意才真的移動（moveWithCompanion 帶同地眾人）。多人在場＝一起邀（以第一位個性判定）。／`promise_proposal`(她提議約定{name,loc,band})／`cohabit_proposal`(她提議同居·真名)／`proposal_accept`(僅有【提議·相約/牽手/同去】標記時填接受/婉拒——⚠ schema 描述須列全三種，2026-07 稽核修：漏列「同去」＝AI 看到同去鐵律卻以為此欄不歸它填。⚠ 判定 regex 否定組須蓋「不/沒/未＋肯定詞」全型：「不同意」「不答應」含肯定字眼、漏列＝fail-open 被判成接受·第二輪稽核修。⚠ 同去婉拒時 post-AI 會**清掉 moveProposal**——AI 偶爾順手把 move_proposal 也填了，不清＝「她婉拒了」通知＋「前往」泡泡同框自打臉；同去鐵律亦明講「不要另填 move_proposal」)／`npc_exit`(自然告辭離場真名陣列)／`options`(固定4)／`intimacy_feedback`{player,npcs[]:physical_state≤15/outfit_change≤20/dynamic_skills/mutual_nicknames/attitude≤15/memory}／`rel_changes`[]{target真名,fav_change整數±·單回合上限+5}。⚠ **刻意無 `location` 欄**（玩家所在地一律 GAS 掌握、AI 抄它無意義；後端仍留 `aiData.location` 攔截層當保險→硬吐也轉 move_proposal）。**移動規則三條版**（2026-07 稽核重寫，原4條有死引用+互相重複）：★【地點清單】(只提 move_proposal)／★★【移動鐵律——你絕不自行搬動玩家】(合併版·含地圖移動例外與換幕一致)／★【此地是唯一真實】(註明自然告辭豁免)。
- **對話格式** `dialogueFormatRule_()`：**頂層函式·單一真實來源**，`nsfwBaseRules` 第3條與 solo `miniSystem` 第2條**共用**。規則＝話語/喘息/吸吮進「」，動作/撞擊/水聲走敘事。

### 🧠 記憶全景（AI 每回合看得到什麼·寫回什麼·多久一次）— 2026-07 整理
**AI 每回合看得到（組進 prompt）**：
- **近期對話**：`getGameHistoryBatchRaw(pcId, 6)` 滑動窗（6筆＝3輪，更早的靠下面的持久欄接力）。
- **玩家**：性格(PREF)／特徵(TRAIT)／裝扮／**經歷(BACK·滾動≤80字)**／位置＋地點活動 context（`kanshouLocContextForAI_`）／肉體(PHYSICAL)／身體記憶(技巧前5)。⚠ **玩家萌點(INTENT)絕不餵**（紅線③）——AI 只能盲寫。
- **每位在場 NPC**（`partyDetailsArr` 一行一人）：身世(BACK)／裝扮／性格／特徵／日常風味／**萌點(有餵·標「僅供內化」，與玩家不同)**／當前活動／共同回憶(MEMOIR)／與玩家的約定／關係 tag＋好感＋相處記憶＋聊天天花板＋階調；NSFW 區另帶 肉體＋技巧前5＋羈絆(REL_MEM：專屬稱呼＋態度)。

**AI 寫回（GAS 落地）**：
- **每回合**：`physical_state`/`outfit_change`→PHYSICAL·【換裝】；`dynamic_skills`→MEMORY 技巧；`mutual_nicknames`+`attitude`→REL_MEM；`memory` 里程碑→MEMOIR(cap10·★釘選不驅逐)；`rel_changes`→BOND；proposals→前端泡泡(意圖非結果)；`npc_exit`→LOC。
- **每 3 回合**（側寫節流·【側寫計數】）：`master_note`→經歷滾動／沒鎖的性格格／萌點(僅 INTENT 空時補首個發現)。⚠ **節流三件套缺一不可**（第二輪稽核抓到擊穿）：① schema delete（非側寫回合）② USER prompt 的「你可透過 master_note.經歷 滾動增補」提及跟著 `_doSideWrite` 條件化（`_doSideWrite` 為此**提前到 prompt 組裝前計算**）③ 落地端 `if (_doSideWrite && aiData.master_note…)` 守衛（AI 無視 schema 自發吐也不落地）。

**🩺 AI 負擔瘦身（2026-07 玩家診斷「滾動式+衣服外觀神情太要他老命」·小模型注意力有限，能省則省）**：
- **狀態差分**：`physical_state`/`outfit_change`/`attitude` 沒實質變化留空＝系統沿用舊值（GAS 空值本就跳過寫入；attitude 配套修掉「空值洗白態度」舊 bug——空→從 oldRMem 撈回舊態度；**「無/同上/不變/沿用/維持原樣/如前」等敷衍值也視同空**，否則差分模式下 AI 真的會把「同上」二字寫進態度欄）。有變化（脫/穿/沐浴/情事/神情轉變）必須更新，NSFW 場景照記。
- **options 連動開關**：前端帶 `optionsOn`（玩家關【命運的抉擇】＝false）→ `buildDefaultSystemPrompt` 第3參數 `includeOptions=false` 把 options 欄整個 delete——沒人看的東西不叫 AI 生。連 Gallery 版 `nsfwBaseRules` 第2條的「options固定4個」字樣也隨開關拿掉（schema 刪了、規則文字還催繳＝AI 精神分裂）。
- **🎬 換幕縮窗**：移動/跳時段/跳節慶/推進時間/結束一天的回合，歷史窗 6筆→2筆（1輪）——舊場景對話物理上不進 AI 眼睛，根治「換地點/時段被舊場景帶著跑」（「此地是唯一真實」「此刻時段是唯一真實」兩條鐵律是文字輔助線，縮窗才是確定性主力）。
- 原則：**AI 只管演戲，記帳全給 GAS**——別再往每回合 schema 加欄位，要加先想「能不能差分/節流/事件驅動」。

**⚠「今日情景」查證結論（2026-07·勿重複造輪）**：曾考慮加「今日情景」滾動摘要接住 3 輪窗外的當日細節——查證後**不做**：**經歷(BACK) 的滾動摘要實質已涵蓋今日進展**（實測會寫入「正在逛街、計畫一同前往咖啡廳」等當日動態），另設欄位＝跟經歷重複。若長場景實測出現「忘記前段」，優先調經歷的提示詞（讓它多保留今日細節）而非加新欄。舊 `log_summary` 是因果表的主/被動方向記錄、非情景摘要，已隨因果表一起砍除。

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

- **唯一引擎入口 `send(customMsg, isSilent, opts)`＝`action:'play'`**（2026-07 重構：原 22+ 位置參數收進單一 opts 物件，payload 不變零速度影響）。移動/相約/拍照/牽手/同居/敲門/橋段**沒有各自的 action**，全靠 opts 夾旗標：`moveTarget`/`moveWithCompanion`/`promiseMeet`/`promiseAccept`/`takePhoto`+`photoIntent`/`showPhoto`/`handHold`/`cohabitInvite`/`roomEventAccept`/`knockAccept`/`skipKnockCheck`/`lookAround`/`inviteResident`/`endDay`/`advanceHours`/`jumpBand`/`jumpFestival`/`loaderCaptions`。
- **回饋條 `proposalResult`** 涵蓋 相約/牽手/同去/同居 四型＋**撲空含「她似乎在○○」位置提示**；**`promiseSettle`（獨立通道）** 涵蓋 赴約成功/爽約過期 結算通知（與提議結果並發時各自顯示·見教訓區「單一回饋槽」）；底片用完/相簿滿的 `photoResult` 附直達鈕（🌙睡到明天/📚開相簿）——「撲空/婉拒/卡住」一律要有下一步，別讓玩家對著空氣猜。
- **改命同伴卡**（2026-07 第二輪稽核修）：`update_fate` 名字比對原硬性要求 `IS_PARTY==='同行'`，但鑑賞列從不寫該欄→同伴卡改命鈕恆「查無此人」；現比照 `update_rel_tag` 給 `k_` 世界豁免（同世界名字直配），改同伴的 個性/特徵/身世/萌點 是合法自訂。玩家自己卡的性格鎖快取 `_kcPrefLocks` 只在 `res.success` 才更新（失敗也寫＝前端假象）。
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
- **泡泡(必點UI)別跟可關閉的東西同住一個容器**：「AI選項開關」曾整個 `options-container` display:none，所有泡泡(前往/邀約/同居/敲門/橋段/結識)陪葬——關掉選項的玩家**從沒見過任何泡泡**。現制：【命運的抉擇】包在 `#ai-options-grid` 小盒、開關只藏它；容器本身恆 flex(載入時強制恢復)。新泡泡一律放容器直下、別放進 grid。
- **別依賴小模型「自發」填選填欄位**：Gemini-lite 從不自發填 move_proposal——玩家發起的機制動作一律走「明確 payload → pre-AI 記提議 → AI 只答 proposal_accept」的確定性管線(👋proposeMove/相約/牽手同款)，提示詞授權只當補網。
- **通用錯誤文案是查案毒藥**：send()/saveFate 的 catch 已帶出 e.message(【原因】行)；後端 success:false 的 message 會演進故事流。別再寫吞掉真因的 alert。
- **獨立事件別共用單一回饋槽**：赴約/爽約「結算」與相約/牽手/同去「提議結果」是兩條獨立事件流，舊版共用 `proposalResult` 單槽＝並發時後寫的吞掉先寫的(爽約通知無聲消失2.0)。現制：結算走 `promiseSettle`、提議走 `proposalResult`，前端各自出通知條。新回饋事件進來時先問「跟既有槽是同一條事件流嗎」，不是就開新欄位。
- **後端早退回應別夾空集合**：敲門早退曾夾 `people: []` 把前端 `localNPCs` 快取洗空(泡泡期間拍照面板變無人)。早退＝沒人移動＝不帶 people；前端也只在 `Array.isArray(data.people)` 才更新快取(雙保險)。
- **「下方/上方」方位詞會過期**：prompt 注入段引用其他規則時**用【規則名】不用方位**——注入點會搬家，方位詞跟著說謊(告辭/巧遇豁免句曾指「下方」而鐵律實在上方)。

---

## 📎 主要常數速查（都在 `gas/Gallery.gs`）
`KANSHOU_REL_TIER_`(五階) · `KANSHOU_SCENE_BOND_`(3) · `KANSHOU_APPT_BANDS_`(午後14/黃昏18/夜20) · `KANSHOU_HOUR_PER_ACTION_`(1/6) · `KANSHOU_TIME_BANDS_`(5時段) · `KANSHOU_LOCATIONS_`(合法地點白名單·AI location/move 驗證) · `KANSHOU_HERO_HOME_`(各人住處) · `KANSHOU_SCENE_EVENTS_`(橋段庫) · `KANSHOU_FILM_PER_DAY_`(3)/`KANSHOU_ALBUM_CAP_`(100) · `KANSHOU_KNOCK_CHANCE_`(0.2)/`KANSHOU_KNOCK_MIN_BOND_`(60) · `KANSHOU_COHABIT_BOND_`(90)/`KANSHOU_VISIT_BOND_`(40) · `KANSHOU_PARTY_DETAIL_CAP_`(5) · `KANSHOU_STARTER_IDS_`(開局起手池) · `KANSHOU_SUMMON_BLOCKED_IDS_`(暫不開放召喚)。
