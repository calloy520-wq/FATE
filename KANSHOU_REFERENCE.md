# KANSHOU_REFERENCE.md — 鑑賞（慾海後日談）唯一現況真相

> **這份只寫「現在是什麼」，不寫演變過程。** 想動鑑賞任何一塊、開機失憶要重建脈絡，看這一本就夠，不必去 `SOLO_REFERENCE.md` 考古編年史。
> **行號會漂，一律以「函式名／常數名」為錨。** 每條都以現行代碼為準（2026-07 對 main `1b4d98c` 核實）。
> 🔴 動手前必讀 `CLAUDE.md` 紅線：`Gallery.gs` 的 `nsfwBaseRules`＋NSFW 機制不可改（玩家授權才碰）、`Engine_Combat.gs` 的 `callGeminiAPI` 是兩軌共用基礎設施、model id 不進 repo。（2026-07 已移除「GAS repo 不可動」一條，九州衍生碼清理判斷併入 CLAUDE.md 工程準則）

---

## 🌹 一句話定位

鑑賞＝**約會模式**後日談（NSFW）——**主選單直接進、從英靈殿直接召喚同伴，不需先打贏戰爭**（`actionEnterKanshou`＋`actionKanshouSummonHero`）。**一個更單純的世界**：無戰鬥、無經濟、無房東房客世界觀，一張約會大地圖，她們各自有自己的住處與作息，其餘全靠 AI 即興演出。建在 `nsfwBaseRules`＋`buildDefaultSystemPrompt` 上、與 solo 共用 `actionPlay` 引擎與 `callGeminiAPI`。

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
- **歸屬驗證**：`kanshouOwnedRowIdx_` 每次查帳號表 KPC 欄（`getAccountKanshouPcId_`）比對，不憑 pcId 找列（防偽造）。⚠ **2026-07 全面稽核抓到嚴重漏洞**：這句話此前只對 6 個小動作 handler(`kanshou_companions`/`memoir_op`/`set_name`/`set_sex`/`enter_kanshou`/`set_home_name`)成立——系統負擔最重、寫入面最廣的 `actionPlay`(整個聊天/移動/相約/同居/牽手引擎)與 `actionGetAlbum`/`actionAlbumDelete` 全部用裸 `pcData.findIndex(r=>r[COL.PC.ID]==pcId)`，完全沒有反查帳號表。`pcId`(`KPC_`+建檔當下毫秒時間戳)理論上可預測/枚舉，攻擊者不需密碼(帳號系統本就無密碼)、只要猜中或拿到別人的 pcId，就能對這三個 action 直打 API 讀寫對方的好感／地點／回憶／相簿——形同接管另一帳號的整份鑑賞存檔。已補上 `kanshouOwnedRowIdx_` 檢查，三處都覆蓋了。**任何新增的 kanshou action handler，只要會讀寫 pcData 或私有資料，一律要用 `kanshouOwnedRowIdx_` 換 index，不能只用 `findIndex` 裸查——這條規則現在才真的對全部 handler 成立。**
- **前綴白名單**：`KPC_`(御主 avatar)／`KHV_`(直接召喚同伴)／`DEAD_`；`KSV_` 是**舊奪杯封存邀請的遺留前綴**——封存管線已砍、不再產生新 `KSV_` 列，僅在 sync／`isKanshou` 判定保留向後相容識別（別當現行機制）。
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
| 【住所】 | `【住所】家名` | 玩家列 | `getKanshouHomeName_`（常見預設是`(玩家名)的家`；玩家連名字都沒有才退回通用「我家」）／改名 set |
| 【晨間餘韻】 | `【晨間餘韻】同伴名` | — | 同床隔天引子，讀一次即清 |
| 【初見日】 | `【初見日】absDay`（IntTag 預設0） | 同伴列 | 首次同地寫入，紀念日里程碑比對 |
| 【帳號】 | `【帳號】acctName` | — | 人工檢視辨識（非驗證，歸屬走帳號表） |
| 【側寫計數】 | `【側寫計數】N` | 玩家列 | `kanshouGetSideWriteCount_`/`SetSideWriteCount_`：AI滾動側寫玩家經歷的節流計數(每3回合才補寫一次；2026-07 二度改版後 master_note 只剩經歷一格，性格/萌點改由創角一次擴寫、AI 不再側寫，「【性格鎖】」標記已隨之整組刪除) |
| 【小道具】 | `【小道具】id1:強度1,id2:強度2,...`（逗號分隔·多件可同時裝備） | 同伴列 | `kanshouGetProps_`/`SetProps_`/`ToggleProp_`：玩家UI裝備/移除/調強度(同伴卡「🎀小道具」按鈕＋故事視窗快速抽屜)，GAS直接寫，非AI判斷。**裝備本身**(含選「關閉/戴著」起手)就卡`KANSHOU_PROP_EQUIP_BOND_`好感門檻，唯獨移除不受限 |
| 【自訂道具】 | `【自訂道具】name1:hasIntensity1:part1,...`（逗號分隔·`part`選填） | **玩家列** | `kanshouGetCustomProps_`/`SetCustomProps_`：玩家自建道具目錄(跟內建`KANSHOU_PROPS_`合併用`kanshouAllProps_`)，上限`KANSHOU_CUSTOM_PROP_CAP_=10` |
| 【換裝】【口吻】【小動作】 | — | 同伴列 | 鑑賞**讀取**（`getOutfit_`/persona），寫入屬 solo/persona 生態、非鑑賞獨有 |

---

## ⏰ 時間系統

- **每動作推進 10 分鐘**：`KANSHOU_HOUR_PER_ACTION_ = 1/6`（2026-07「問個菜色都中午了」→ 半小時太兇）。
- **五時段** `KANSHOU_TIME_BANDS_`：清晨(5)／午後(11)／黃昏(17)／夜晚(20)／深夜(0)。
- **當日不跨日上限** `KANSHOU_DAY_LAST_HOUR_ = 23`；被動聊天每回合 `+1/6` 小時流動。
- **曆法**：Day1 = 12/20（`KANSHOU_CAL_START_MONTH_/DAY_`），`KANSHOU_FESTIVALS_` 節慶表，前端顯示西曆年月日。
- **主動跳時間**：`kanshouNextStage`(下一時段·深夜則睡過夜)／`kanshouJumpBand`(跳指定時段)／`kanshouJumpFestival`(快轉節慶)／`kanshouEndDay`(結束一天)。跳時間會**全世界重骰去向**（`kanshouRollDailyLocation_`），讓在場人物重新分佈——**牽手中的她豁免重骰**（跟著玩家）。
- **`endDay` 語義＝「睡到即將到來的 6:00」**（2026-07 玩家實測跨2天根修）：`curHour >= 6` 才 `+1 day`；深夜 00:00~05:59 按結束一天＝睡到**當天** 6:00、不再多跳一天（夜→深夜本身已 +1 day，endDay 再 +1 就是雙倍扣）。前端 `_reHourAfter` 樂觀預測同步這套規則（endDay→6／jumpBand→時段起點／jumpFestival→6／advanceHours→mod24）。
- **⏰ 跨時段自然告辭**（2026-07·玩家「NPC 不會自己離開?」）：被動 +10 分鐘若跨越時段界線（`kanshouBandCrossed_`），非牽手/非跟隨(`kanshouPreMoveCompanions_`)/非約定釘住/**非本回合提議對象(`_pendingProposal`·第二輪稽核補：她被骰走＝AI 同回合收到「向她提議」＋「她已告辭」矛盾指令、接受還把牽手落到已離場者)**/**非本回合橋段對象(`kanshouRoomEventPartnerName_`·2026-07後續稽核補：賴床叫醒觸發窗剛好卡在深夜→清晨邊界，接受橋段當回合很容易同時跨過時段界線，沒排除會讓AI同回合收到「她剛回應了叫醒」+「她已到了該走的時間」兩條矛盾指令)**的在場者會被重骰去向；離場者名單餵 AI（`kanshouNpcLeaveStr_`）演「自然道別後離開」，並帶**豁免句**——告辭這一句不受「在場驗證鐵律」限制（鐵律本文也明示「系統注入段明示豁免者除外」，兩端閉環）。
- 相識紀念日里程碑 `KANSHOU_ANNIV_MILESTONES_ = [7,30,100,365]`。

---

## 🌦️ 環境氛圍（天氣／地點現況／場景種子）— 之前漏記，2026-07全面稽核補上

三個都是「給 AI 一點確定性的氛圍素材，不強制劇情」的輕量花絮機制，各自獨立、互不依賴：

- **天氣**：`KANSHOU_WEATHER_BY_SEASON_`＋`kanshouWeather_()`/`kanshouWeatherEmoji_()`——依當前日期算出的**當日固定值**(同一天問幾次都一樣，跨日才變)，注入每次提示詞的「★【今日天氣】」、時鐘 HUD 圖示、拍照時戳在照片上。
- **地點現況**：`KANSHOU_LOCATION_ACTIVITY_`＋`kanshouLocActivity_(loc,name,day)`——只給商業類地點(咖啡廳/超商/商店街等)用，依「姓名+日期+地點」雜湊出一句「她此刻在做什麼」(打工中/當顧客/路過)，同一人同一天同一地點結果穩定、換日或換地點會變。餵進 `partyDetailsArr` 的「現況」欄。剛跟玩家一起移動過來的同伴不套此欄(`kanshouPreMoveCompanions_`排除，否則會被誤標成「正在打工」)。**⚠ 2026-07 再修（玩家實測「明明在聊天、有人突然穿上圍裙開始打工」）**：`_pCameWithMe` 排除只在【剛好是移動那一回合】有效（`kanshouPreMoveCompanions_`是當回合暫存名單、非持久狀態），同一地點純聊天的後續回合排除形同失效，deterministic 算出「打工」就會套到明明是陪你來聊天的同伴身上，跟先前劇情矛盾。已改成**只在剛抵達那一回合(`moveTarget`為真)才附這句**，且加了「她本來就是這個狀態、不是這回合才開始」的措辭，避免 AI 演出「換上圍裙／開始上班」這類自相矛盾的起始動作。
- **場景種子**：`KANSHOU_EVENT_SEEDS_`＋`kanshouRollEvent_()`——抵達新地點時 20% 機率注入一句非強制的氛圍靈感種子(日常/曖昧兩池，「曖昧偏辣」池要 `driveOn` 才會抽到)，純粹給 AI 發揮參考、不是既定事實。

---

## 💕 關係五階系統

- **五階門檻** `KANSHOU_REL_TIER_`：戀人≥80／親近的人≥60／熟識的朋友≥40／普通朋友≥20／點頭之交≥-100（起始）。
- **自動分級** `kanshouSyncRelTier_`：僅當現 REL_TAG 仍等於某梯度字面時才覆寫（玩家自訂稱呼後不再自動蓋回）。
- **聊天天花板** `kanshouRelChatCeiling_(bond)`：純聊天（AI rel_changes）加好感只夾到「當前梯度上限」。**只從 40 起擋**（`filter(m >= 40)`）——bond<40 不封頂（解 19 死鎖）；bond<60→上限59；<80→79；≥80→100。**2026-07 三度改版**：卡在這道天花板（bond 剛好等於 39/59/79）本身現在會直接觸發 GAS 主動約會邀請，見下方「約定 2.0」§她也能主動邀約。
- **突破手段**（繞過聊天上限、直接寫 BOND）：
  - **約定赴約 +5**（硬編字面，`kanshouPromiseMetStr` 那段，不吃 chat ceiling）
  - **親密橋段 +3**（`KANSHOU_SCENE_BOND_ = 3`，非拒絕分支）
- **AI 對關係的影響力只剩「認不認」**：寫在 `intimacy_feedback.npcs[].attitude`，**不能覆寫 REL_TAG**。
- **親密尺度分五階**（提示詞側·硬約束肢體親密程度）：<20完全碰不到／20-39婉拒／40-59輕度接觸／60-79親吻擁抱／80+無上限。門檻 20/40/60/80 借用同居(80床)/夜襲(60)等切點。
  - **🚨 2026-07 真實 bug 修復（玩家實測抓到）**：低好感(剛認識·<20)場景輸入明講「強姦她」等強迫字眼，AI 仍讓行為得逞、寫成一段完整的非合意侵犯過程(她持續哭喊/掙扎/表達厭惡憎恨、甚至咬破嘴唇流血)——天花板規則完全沒擋住。根因：`nsfwBaseRules`(紅線①·不可改)第4條「玩家自己的動作/台詞【如實發生】」跟親密尺度天花板兩條指示對輕量模型來說互相打架，模型在強勢命令句面前選擇了「如實發生」，把「這個舉動的嘗試」誤讀成「這個舉動一定成功」。已在**天花板規則本體**(不受紅線保護，可改)追加兩條：①**明講強迫/暴力字眼一樣受天花板約束**——未達門檻就是「攻勢落空」，並明文「這條凌駕【依玩家輸入確實推演】——如實發生只代表嘗試、不代表成功」正面解決跟紅線第4條的優先權衝突；②**禁對同伴造成真正傷害**（無論好感高低）——流血/骨折/撕裂傷這類真實身體傷害一律禁止，親密場景激烈歸激烈，不能寫成傷害她的身體。**⚠ 玩家再修（「呼救/逃離這感覺不用吧，狠狠教訓玩家就好！！」——玩家設計理念「裡面的女的都不好惹才對」）**：拿掉「掙脫/呼救/逃離」這幾個偏向受害者視角的選項，改成單一方向「她依個性狠狠反擊/教訓回去(吃虧受傷的是玩家、不是她)」——這個方向沒有安全疑慮(挨打的是玩家不是同伴)，且更貼合「同伴不是好惹的」的角色形象，比消極閃避更帶感。

---

## 🗓️ 約定 2.0

- **存儲**：`【約定】absDay:band:loc`（存**該同伴列**），同時只存一筆（新約蓋舊約）。舊格式 `【約定】day:loc`（無時段）**向後相容＝整天有效**。
- **時段** `KANSHOU_APPT_BANDS_`：午後(14:00)／黃昏(18:00)／夜晚(20:00)；`kanshouApptHour_(band)` 回具體小時（null＝舊格式整天有效）。
- **赴約結算**（`actionPlay` 內，**必須在 `partyRows` 組裝之前**——聊天/拍照/原地消磨三路才吃得到剛移過來的從者）：
  - **赴約**（`_pr.day === curDay` 且同地）→ 清約＋`BOND+5`（夾100）＋餵「依約相會」提示＋回 **`promiseSettle{type:'promise_met'}`** 前端亮「依約相會💕」通知條（2026-07 稽核補：原本赴約成功玩家零回饋）。
  - **爽約**（`_pr.day < curDay`）→ 清約＋`BOND-5`（夾0）＋寫一筆 memoir「我爽約了…讓她空等一場」＋回 **`promiseSettle{type:'promise_missed'}`** 通知條；在場才餵「爽約之後」提示（讓她流露被放鴿子的在意）。前端 `kanshouEndDay` 睡前若有今日之約會先跳警告。
  - 累加進 `kanshouPromiseMetStr` 餵 AI。⚠ **結算回饋走獨立通道 `promiseSettle`、不借用 `proposalResult` 單槽**（第二輪稽核三路同時撞到：post-AI 提議結果無條件覆寫單槽，同回合「爽約結算＋新提議成功」時結算通知被吞）——前端收到 `promiseSettle` 或 `proposalResult.type==='promise'` 任一都重抓 `kanshou_companions` 刷新 `_kcCur`（否則舊快取殘留已結算的約→假爽約警告）。
  - **⚠ 未解鎖私宅不可當約定地**（2026-07 第二輪稽核·必爽約陷阱）：鎖住的 visit 住處物理上進不去（地圖灰鎖＋後端擋移動）→ 約在那裡＝到期必 -5。前端 `kanshouPromiseMeet` 地點面板不列、後端 `_pmLocOk`，皆走 `kanshouResidenceUnlocked_`（2026-07 三度改版拔掉 AI 自選地點的 `promise_proposal` 後，GAS 的 `kanshouPickDate_` 選點池本就不含 visit 分區，天然不會挑到未解鎖私宅，這條驗證只剩玩家自選路徑在用）。
  - **⚠ 「必爽約陷阱」還有一個成立後才會出現的變種**（2026-07 全面稽核）：約定成立當下有解鎖檢查沒錯，但**赴約前**若好感因其他事件跌破熟識(40)，屋主私宅會重新上鎖——玩家想赴約走過去卻被登門攔截擋在門外，隔天還被系統判「爽約」倒扣好感，兩個各自正確的機制互相矛盾、且玩家全程無法得知這個已成立的約定即將必然失敗。已補 `kanshouLocHasPendingPromise_`：已成立且未過期(day≥curDay)的約定，若目的地正是該私宅，移動時豁免解鎖檢查——赴約優先於門檻。
- **前端**：`kanshouPromiseMeet(name)` 發起（選地點+時段）；`kanshouWaitForPromise(targetHour)` 撲空等待框（跳到約定前10分鐘）；地圖 `promiseByLoc` 徽章顯示哪個地點有約。
- **移動接人**：時間快轉在「給 AI 資料之前」先把該去的人拉到約定地點（順序鐵則同上）。
- **她也能主動邀約**（`kanshouPromiseOffer_`，2026-07 三度改版·玩家「AI亂寫萌點…也想要當好感卡39之類的時候GAS主動發出邀約」，順勢把這塊也從AI手上拔掉）：舊版靠 AI 自己判斷要不要開口約(`promise_proposal`欄)，玩家實測常常不開口或亂約。**改GAS依好感數值直接判定，不是機率、卡關就一定邀**：每回合掃在場同伴，`kanshouRelChatCeiling_(bond)` 剛好卡在天花板(bond===39/59/79，代表純聊天已經爬不上去了)且該同伴**沒有**尚未赴的【約定】(`kanshouGetPromise_`) → 就跳邀請泡泡；一次只邀一位(同回合跟玩家發起的「同去」互斥，避免兩個提議泡泡打架)。地點/時段由 **`kanshouPickDate_(heroName, day, bond)`** 依當前好感梯度挑（見下方「約會地點好感分級」），同一天同一人固定挑到同一個地方（hash動day+heroName，不會每回合亂跳）。落地完全沿用舊有管線：回傳 `promiseProposal` → 前端跳同意泡泡（`kanshouAcceptPromise`）→ 玩家按同意帶 `opts.promiseAccept` **直接落地【約定】**；AI 只在玩家按下同意鈕那一刻才演她開口邀約/你點頭的反應，不必每回合先自己猜要不要提。婉拒＝`kanshouDeclinePromise`（軟性婉拒、下回合條件仍成立會再跳）。與玩家發起共用同一套赴約結算。**⚖️ 玩家裁定：她約完就走也照樣成立**——約定契約只差玩家點頭，她在不在場不影響寫入；差別只在敘事（在場演她的反應／已離場演玩家記下這個約）。別把「玩家發起需對方在場」的規則錯套到這裡。

---

## 📖 共同回憶（memoir）

- **存 `COL.PC.MEMOIR`(27)**，每位同伴一份。
- **AI 每回合吐 `memory` 欄**（里程碑一句、≤30字、玩家第一人稱視角），`processMemoir_` append：**cap 10**，去重（比對忽略★前綴），**★釘選永不驅逐但釘選本身另有上限8**（`actionKanshouMemoirOp` 已釘滿8條會拒絕新釘選，留2格給未來新回憶自然淘汰）。
- **玩家 UI 管理**：`actionKanshouMemoirOp`（pin/unpin/del，帳號綁定，後端只清 `｜【】[]★` 幾個分隔符、要求傳入文字與儲存原文逐字相符）。前端 `kanshouOpenMemoir`/`kanshouMemoirOp`（`_kmBusy` 讀條保護擋連點）；同伴卡片 **💞回憶** 按鈕。⚠ **2026-07 稽核修**：前端組 onclick 參數時舊版用 `.replace(/'/g,'')` 把回憶原文的撇號整個剝掉才送出，跟後端「逐字相符」的比對規則衝突——含撇號的回憶（AI 自由生成的文字不保證不含）因此永遠釘選/刪除失敗；改成正確的 JS 字串跳脫（`\'`）而非刪字。同批也補上操作進行中點背景關閉會被 `finally` 重新打開視窗的遺漏 `_kmBusy` 判斷。
- 餵 AI 時★前綴會剝除。

---

## 🎭 橋段（scripted events）

- **資料表** `KANSHOU_SCENE_EVENTS_`（約13筆）：日常 夜襲／賴床叫醒／共浴／溫泉同浴／膝枕／下廚／觀星；節慶 初詣／情人節巧克力／七夕短冊／中秋賞月／聖誕約會／跨年倒數。走向骰 `kanshouRollSceneBranch_`。
- **offer+accept 制**：先跳邀請框（`roomEventOffer`），玩家按 `kanshouAcceptRoomEvent` 才演。非拒絕分支 `BOND+3`。⚠ offer 組裝時**現場過濾候選人 LOC＝當前地點**（2026-07 稽核修：舊版沿用回合初快取，人已離場還發邀請＝幽靈橋段），過濾後無人＝不發 offer。
- **觸發表**：`KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_ = {深夜:夜襲, 清晨:賴床叫醒}`（同居和室）／`KANSHOU_LOCATION_EVENTS_`（地點×時段）／`KANSHOU_FESTIVAL_EVENTS_`（節慶）。
- **深夜敲門**：每次「結束一天」擲 `KANSHOU_KNOCK_CHANCE_ = 0.2`，候選需好感≥`KANSHOU_KNOCK_MIN_BOND_ = 60`；跳敲門泡泡（`kanshouAnswerKnock`/`kanshouIgnoreKnock`）。
- **🎭 橋段提醒徽章（前端·2026-07·玩家「不知道去哪、幾點」）**：地圖每個地點按鈕旁標該地橋段＋時段（客廳💤午後、浴室🛁夜/深夜、屋頂花園🌌夜/深夜、廚房🍳黃昏、隱藏溫泉♨️、和室🌙深夜/清晨、她們各自私宅🌙深夜/清晨）；**當前時段命中就高亮**。⚠ 夜襲/賴床**不必同居**——她們各自的家（`KANSHOU_HERO_HOME_`：遠坂邸/藤村家/愛因茲貝倫城…·好感40解鎖登門）深夜/清晨登門即觸發；同居(90)只是「她搬來睡和室」的另一條路。徽章對齊後端所有住處值，鎖住的私宅走🔒分支不顯示徽章。前端鏡像 `KC_LOCATION_EVENTS_`＋`kcSceneBadge_`（唯一真實來源仍是後端 `KANSHOU_LOCATION_EVENTS_`／`KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_`，改後端觸發表記得同步鏡像）。⚠ 橋段 offer **無好感門檻**（好感只軟硬化她的反應·分支），徽章不標好感。

---

## 📷 拍照／相簿

**⚠ 2026-07 拍照改「手機」（玩家「拍照要改成手機、不用等」）**：原本是寶麗來設定（每日底片限量`KANSHOU_FILM_PER_DAY_=3`＋隔天沖洗才看得到），玩家覺得手機沒有底片這種東西、拍完也該立刻能看——兩個限制都拔掉了：
- **沒有每日張數上限**：只驗**相簿總容量** `KANSHOU_ALBUM_CAP_ = 100`（滿了要刪舊照才能再拍）。`kanshouFilmUsed_`/`kanshouFilmStamp_`/【底片】MEMORY tag 整組刪除。
- **拍完立刻能看**：`actionGetAlbum` 不再回傳 `developed` 欄位，相簿卡片一律顯示完整內容，不再有「🎞️沖洗中……明天就能看了」的半成品卡；`showPhoto` 也不再檢查「還沒洗好」。
- **色色時也不用隱晦**：`photo_caption` 的生成指示補一句「若拍到的是親密畫面也直接寫實描述，不用刻意隱晦帶過」。
- 措辭全面從「相機」改「手機」（`kanshouPhotoStr`/`finalUserMsg`/UI 按鈕 title 等）。

- 拍照落地在 **AI 成功後**（失敗不寫入，反正沒有底片可浪費）：AI 多吐 `photo_caption`，寫 `kanshouAlbumSheet_`。髮色從被拍者 TRAIT 現場解析（`KANSHOU_HAIR_COLORS_`）。
- 前端：`kanshouTakePhoto`／`kanshouShowPhoto`(拿照片給在場者看)／`openKanshouAlbum`（`get_album`）／`kanshouDeletePhoto`（`album_delete`）。

---

## 🚶 作息／同居／拜訪

- **獨立作息**：每人有自己的家 `KANSHOU_HERO_HOME_`（`region:'visit'`）；`kanshouRollDailyLocation_` 每逢時間推進重骰全世界去向；**LOC 判在場**。
- **同伴詳情上限** `KANSHOU_PARTY_DETAIL_CAP_ = 5`（同地最多給5張詳細卡，敘事上限非隊伍容量），依 BOND 排序。
- **🌍 世界概況(輕量版)**（2026-07 玩家「NPC不知道彼此存在，很怪」）：不在場的同伴也給 AI 一份極簡名單——只有**名字＋大分區**(`KANSHOU_REGIONS_`的房間/家的共用空間/深山町/冬木市中心/山林/拜訪住處，不給精確地點/在幹嘛)，依 BOND 取前 `KANSHOU_WORLD_ROSTER_CAP_ = 8` 位，避免同伴一多每回合無限膨脹。★提示詞明講**僅供閒聊背景話題、絕不可讓對方憑空出現/開口/被指名互動**——不影響【在場驗證鐵律】，指名互動/追蹤好感仍只認同地點的 `partyRows`。純粹解決「明明認識彼此、對話裡卻連提都不能提」的違和感，不是給 NPC 即時動向。
- **同居**：好感≥`KANSHOU_COHABIT_BOND_ = 90` 可邀（`kanshouInviteCohabit`），就寢/夜襲在 `KANSHOU_COHABIT_ROOM_ = '和室'`；`【同居】1` 標記。**她也能主動邀同居**（`kanshouCohabitOffer_`，2026-07 三度改版·同一批把 `cohabit_proposal` 從AI手上拔掉，玩家「好感超過90並且沒有同居時詢問玩家她是否可以與玩家同居」）：GAS 每回合掃在場同伴，好感≥90＋未同住＋今天還沒問過(`KANSHOU_COHABIT_ASK_TAG_`【同居邀約日】標記，存 absDay) → **一定問**（不是機率），問過就記當天日期(不管答不答應)避免同一天被反覆追問，隔天若仍未同住會再問一次。回傳 `cohabitProposal` → 前端同意泡泡（`kanshouAcceptCohabit`，複用 cohabitInvite 後端、不重複跳確認框）。⚠ **2026-07 稽核修·同居會隨好感跌破90自動解除**：舊版`【同居】`只有兩處會寫成1(邀請成立/她主動提議)、全檔案沒有任何地方清回0——好感若同居後因爽約/冒犯一路跌到接近「點頭之交」，標記仍在，AI仍照樣把她骰進和室、仍觸發夜襲/賴床，敘事跟數值直接矛盾。已在`kanshouSyncRelTier_`(跟REL_TAG梯度同步同一個函式、呼叫時機也一致)裡補上：BOND低於`KANSHOU_COHABIT_BOND_`就清掉`【同居】`。
- 🎛️ **GAS 主動提議通則**（`kanshouPromiseOffer_`/`kanshouCohabitOffer_` 共用，2026-07 三度改版起皆由 GAS 依好感數值直接判定、AI 不再有決定權）：都是「意圖非結果」，落地只在玩家按泡泡同意後才發生，AI 只在那一刻演她開口/你點頭的反應；有 moveProposal(見下)就不浮 promise/cohabit，避免泡泡打架。**⚠ 2026-07 拔掉 `move_proposal`**（玩家實測「AI一直提議移動、頭痛」）：換地點不再是 AI 能決定的事——AI 完全沒有這個欄位了，只剩兩條合法路徑：玩家自己用地圖走，或玩家在地圖對同伴提議「一起去」（`proposeMove` → GAS 依好感直接裁定接不接受，AI 只演反應），accept 後才回填 `moveProposal` 觸發同一顆「前往」同意泡泡。
- **💌 約會地點好感分級**（`kanshouPickDate_`，2026-07 三度改版新增，供 `kanshouPromiseOffer_` 選點用）：`KANSHOU_LOCATIONS_` 每筆可選填 `minBond`（省略＝0），沿用 `KANSHOU_REL_TIER_` 同一份好感梯度門檻——0（日常初識，河邊小徑/咖啡廳/老道場等既有地點）／40+（熟識的朋友：摩天輪、水族館）／60+（親近的人：夜景展望台、隱藏溫泉）／80+（戀人·可以很色：情侶溫泉套房、深夜賓館）。GAS 先抓「好感梯度剛好卡在哪一階」對應的地點池，池空才退而求其次抓所有已解鎖梯度；同一(她,同一天)固定挑到同一地點/時段(hash動day+heroName)，避免同一天內邀約地點每回合亂跳。**⚠ 這個門檻只給 GAS 自動選點用，不限制玩家自己走地圖過去或帶她同去**（玩家「玩家邀約或是牽手帶去不管」）——地圖上這些地點一律可自由造訪，`promiseMeet`/`proposeMove` 的地點驗證完全不看 `minBond`。`dateOnly:true`（情侶溫泉套房／深夜賓館）＝這類明顯是約會限定的私密地點不進 `kanshouRollDailyLocation_` 的日常閒晃保底池，避免其他無關同伴平白被骰去那裡閒晃；`noEncounter:true` 一併擋掉陌生人巧遇。
  **🐛→✅ 2026-07 補漏·前端地圖清單漏同步**（玩家「怎麼沒看到新地點」）：`Script_Kanshou.html` 的 `KC_LOCATIONS_` 是純顯示用 mirror(唯一真實來源仍是後端 `KANSHOU_LOCATIONS_`)，這 6 個新地點加進後端後，前端只補了「隱藏溫泉」(它本來就存在、這次只是補門檻)，其餘 5 個全新地點(摩天輪/水族館/深夜賓館/夜景展望台/情侶溫泉套房)漏加——地圖上完全看不到，玩家自然點不到、也走不過去。已補齊 5 筆進 `KC_LOCATIONS_`(fuyuki/dojo 對應分區)。**改地點務必雙邊同步**，這是本檔已經提醒過的坑，這次還是漏踩了。
- **拜訪私宅**：好感≥`KANSHOU_VISIT_BOND_ = 40`（熟識朋友切點）才解鎖登門（`kanshouResidenceUnlocked_`）。
- **巧遇**：`kanshouToggleEncounter_` 開關；女性保底池 `KANSHOU_ENCOUNTER_FEMALE_IDS_`；結識 `kanshouAcceptInvite`（`inviteResident`）。
- **牽手**：`kanshouHoldHand`/`kanshouReleaseHand`（單獨約會氛圍，`【牽手】` 存玩家列·值＝她的短名）。⚠ **2026-07 玩家「牽手太用力·每次都提·地理錯亂」重寫 `kanshouHoldingStr`**：舊版每回合強推「交握的溫度／並肩距離／別人也看得見」＝AI 每回合死抓著手講；且沒斷言「她此刻與你同處」＝AI 腦補成「她在○○等你、你跑進來」（明明牽著手寸步不離）。新版＝**背景資訊·別過度著墨**（偶爾輕帶一筆、重心放當下互動）＋明確斷言「她就在你身邊、和你同處一地、絕非在別處等你」。**生命週期不變式**（2026-07 玩家實測補齊）：① 跳時間重骰**豁免**牽手對象（不會憑空消失）；② 每回合算 `kanshouHeldName_` 時驗「她真的在場」——不同地點自動放手清標記（根治「隔空牽手/重逢自動牽手」）；③ `endDay` 睡覺一律放手；④ 對象名一律走 `kanshouNameCandidates_` 比對（別名/大小寫都認得）。
- **🎀 小道具**（2026-07 新增·根治「幫她戴貓耳朵過幾輪就忘記」的機制保證版）：`KANSHOU_PROPS_`(資料驅動·目前只有`跳蛋`)＋`KANSHOU_PROP_LEVELS_`(關閉/微弱/中等/強勁)，存該同伴列 MEMORY `【小道具】id1:強度1,id2:強度2,...`（`kanshouGetProps_`/`SetProps_`/`ToggleProps_`，**多件可同時裝備**，逗號分隔比照【性格鎖】同款寫法——2026-07 玩家「其他道具怎麼辦，一次只能一種？」後從單槽改多槽）。**玩家UI手動裝備/移除/調強度，GAS直接寫，不靠AI自己判斷該不該記**——跟`outfit_change`(現appearance_extras)那套「AI自己判斷有沒有變化」的路徑刻意分開，這條是機制保證。
  - **入口①同伴卡面板**：卡片「🎀小道具」按鈕（`Script.html`）→ `kanshouOpenProps`/`kanshouSetProp`（`Script_Kanshou.html`，鏡像後端 `KC_PROPS_`/`KC_PROP_LEVELS_`，改後端記得同步）——負責「裝備哪些道具」，會等後端確認+可增減項目。
  - **入口②故事視窗快速控制抽屜**（2026-07 玩家「想在故事視窗旁弄個隱藏抽屜快速調強度」）：畫面右側常駐小拉環(`_kcEnsureDrawer_`/`kcTogglePropDrawer`，`applyModeUI()`依模式顯隱)，展開只列**在場**且有強度道具的同伴，`kcQuickSetProp` 快速切強度——**只負責「已裝備道具即時調強度」，不能新增/移除道具**(那是面板的事)。★**樂觀更新**：按下立即用本地 `_kcCur` 快取重繪畫面，背景 `gasRun` 送出不等待、**不觸發AI敘事**——不是每轉一次旋鈕就逼AI講一輪話，AI 會在玩家下一次正常互動時自然從 `partyDetailsArr` 的既定事實讀到目前強度去演。兩個入口共用同一個後端 action。
  - 兩個入口都打同一個 `kanshou_set_prop` action（`actionKanshouSetProp`，比照 `actionKanshouMemoirOp` 同款帳號驗證+目標同伴查找，`level`空字串＝移除該項、其餘已裝備道具不受影響）。持久狀態餵進 `partyDetailsArr`(`pPropStr`，多件用「、」串接)當既定事實，narration 自然反映其存在與強度，不受親密尺度五階影響（道具本身不繞過好感天花板，只是描述現況）。**擴充新項目(項圈/眼罩/手銬之類)只要往 `KANSHOU_PROPS_` 加一筆＋前端鏡像同步一筆，不必改任何邏輯。**
  - **⚠️ 關閉≠取下**（2026-07 玩家「關閉就是還在體內」）：強度「關閉」只是暫時沒運作、道具本身仍配戴在身上，跟`level`空字串(真的移除)是兩回事。怕小模型把「關閉」字面誤讀成「已經拿掉」而漏演既定事實，`pPropStr` 在有 hasIntensity 道具目前關閉時額外補一句「強度關閉≠取下，仍配戴在身上、只是暫時沒運作」。
  - **🔒 裝備好感門檻**（2026-07 玩家「AI也不能反抗…感覺缺少鑑賞的感覺」→再修「整個小道具直接卡80吧…還沒80都鎖起來」）：一開始只卡「啟動(強度非關閉)」、裝備成關閉/戴著不設限；玩家後來覺得連裝備本身都該卡——好感不夠她根本不會讓你碰，不只是「碰了但不會動」。**現版本＝任何新增/切換到非空level的操作(裝備/改強度/含選『關閉』起手)都卡 `KANSHOU_PROP_EQUIP_BOND_ = 80`**（比照情慾場/無上限同一個切點），唯獨**移除**(level空字串)不受限、隨時能拿掉。不靠 AI 自己判斷「該不該演抵抗」(那樣容易演成「機制上開著、敘事卻在抵抗」的矛盾)，直接在 GAS 這層擋下，好感不夠就回傳失敗訊息、不寫入。維持「機制保證」精神的同時，重新對齊[性格]×[好感]的核心把關哲學。
  - **🆕 玩家自訂道具**（2026-07「不能玩家自己新增?」）：面板底部「找不到想要的？自己新增一個」表單——輸入名稱(≤10字)＋勾選「強度可調」＋**選填部位**，按「裝備」直接寫進玩家自己的道具目錄`【自訂道具】`(玩家列 MEMORY，格式`name:hasIntensity:part`，上限`KANSHOU_CUSTOM_PROP_CAP_=10`筆)並嘗試立即裝備在該同伴身上——**目錄新增不受好感門檻限制，但裝備這步一樣卡上面的`KANSHOU_PROP_EQUIP_BOND_`**：好感不夠只會成功建目錄、不會真的裝上去，回傳訊息告知。`kanshouAllProps_(playerMemory)`＝內建`KANSHOU_PROPS_`＋玩家自訂目錄合併查找，`actionKanshouCompanions`/`actionPlay_`都改吃這份合併目錄。同名跟內建道具重複會被擋。`actionKanshouAddCustomProp`/`actionKanshouDeleteCustomProp`（刪除會同步清掉所有同伴身上目前裝備的這一項，避免孤兒資料）；前端 `kanshouAddCustomProp`/`kanshouDeleteCustomProp`（`Script_Kanshou.html`）。
  - **部位(part)選填**（2026-07「選填吧，想指定就自己打，沒有就AI自己想辦法發揮」）：玩家自訂道具才有這個欄位，內建`跳蛋`沒有。有填才在 `pPropStr` 加一句「戴在○○」；沒填就完全不提部位，交給 AI 自己決定戴在哪——不強迫每件自訂道具都要講清楚部位。`kanshouSanitizeTagValue_(value, maxLen)`（原`kanshouSanitizePropPart_`→`kanshouSanitizePropTag_`→定案為通用版`kanshouSanitizeTagValue_`，稽核時發現「名稱」欄從沒淨化過、且住所名也有同款漏洞，擴大適用範圍＋改名）清掉標籤分隔字元(`,`/`:`/`｜`/`【`/`】`)＋引號/角括號/換行(防onclick屬性被破壞、對齊solo `cleanTagText_`同款處理)，`name`限10字/`part`限8字。
  - **🔢 同時裝備上限**（2026-07 玩家「設個上限5個?」）：`KANSHOU_PROP_EQUIP_CAP_ = 5`——只擋「新增裝備」(propId還沒在該同伴已裝備清單裡才算新增)，調整已裝備項目的強度/移除不占名額、不受此限。`actionKanshouSetProp`/`actionKanshouAddCustomProp`兩個裝備入口都檢查。
  - **🐛→✅ 稽核修**（2026-07 玩家「幫我檢查確認一下」全面複查抓到的問題）：①自訂道具撞內建名稱的檢查原本比對`p.id`(內建道具的內部代號如`egg_vibrator`)，玩家真打「跳蛋」反而不會被擋——改比對`p.name`(顯示名稱)。②故事視窗快速控制抽屜(`kcQuickSetProp`)原本純樂觀、從不檢查後端是否真的成功——好感門檻擴大後調整已裝備道具的強度也可能被拒，若靜默失敗會讓UI跟實際狀態悄悄兜不攏；改成失敗就把本地值還原＋alert提醒。
  - **🌀 催眠指令(ignoreBond)獨立入口(2026-07 二度改版·「催眠的和新道具要確實分開成兩種」)**：一開始把「無視好感」做成一般自訂道具表單裡的一個勾選框，玩家後來覺得混在一起不夠清楚，**改成完全獨立的按鈕/面板/action**：
    - **入口分離**：同伴卡新增「🌀 催眠指令」按鈕(跟「🎀 小道具」並排、各自獨立)。前端 `kanshouOpenHypnosis(name)` 是全新面板，跟 `kanshouOpenProps(name)`(一般道具面板)徹底分開——`kanshouOpenProps` 內部把 `allProps`/`curArr` 都 `.filter(p => !p.ignoreBond)`，一般道具面板完全看不到催眠指令；`kanshouOpenHypnosis` 反過來只顯示 `ignoreBond===true` 的項目。兩面板共用同一個 `#kp-overlay` 彈窗容器＋共用 `kanshouDeleteCustomProp` 刪除函式，用新變數 `_kpOpenMode`('props'|'hypnosis') 記錄目前開的是哪一種，刪除後才知道原地重繪回哪個面板。
    - **後端分離**：一般道具走 `actionKanshouAddCustomProp`——**現在強制 `ignoreBond:false`**，不管 `userData` 帶了什麼都無視，物理上做不出無視好感的效果。催眠指令改走全新的 `actionKanshouCastHypnosis`：玩家打一句暗示內容(`text`，非道具名稱，≤30字，比一般道具name的10字寬)，強度**必帶**(不像一般道具是選填勾選，`hasIntensity`/`ignoreBond`都強制`true`)，首次施展預設落在**微弱**起跳(不像一般道具從關閉起手——這是「施展」動作，落地就該有效果)。底層仍共用同一套`【自訂道具】`目錄與`KANSHOU_PROP_EQUIP_CAP_`裝備上限(id=text本身)，調整既有指令的強度/關閉沿用既有的`actionKanshouSetProp`(已經支援ignoreBond跳過好感檢查)。
    - **🔑 立即觸發AI(這個效果存在的核心意義)**：玩家明講「這裡需要一次呼叫AI才有催眠感覺」——前端`kanshouCastHypnosis(targetName)`在後端寫入成功後，**關閉面板並立即呼叫`send(...)`**，讓AI馬上演出催眠生效的當下，不是像一般道具那樣靜默寫入、等玩家下一輪正常對話才反映。這是這個功能跟其他小道具在使用體驗上唯一的、也是最關鍵的差異。**⚠ 2026-07 首次施展敘述改「手機催眠APP」**（玩家「第一次催眠敘述改成使用手機催眠app的寫法」，呼應拍照已改手機的世界觀）：送出的動作句從「我對OO施展了催眠暗示：「text」」改成「（拿出手機，打開一款催眠APP，對著『OO』播放了一段暗示語音：「text」）」，畫面更貼近現代設定。
    - 存進`【自訂道具】name:hasIntensity:part:ignoreBond`(4欄，第4欄向下相容舊3欄格式)。**三階強度各給不同行為指令**（2026-07 玩家「輕中重AI會知道怎麼表現嗎?」——沿用篇幅/親密尺度那條教訓：三階都套同一句「更強烈」小模型分不出差異，改成弧線式的具體指令）：微弱＝反差為主(「嘴上抗拒、身體不由自主順從小小一步」，意識清醒會皺眉懷疑)；中等＝反差減弱(開始恍惚失神、抵抗力下降，仍會虛弱地表示懷疑，但持續半推半就順從)；強勁＝反差消失、暗示本身取代常規人格反應(直接引用道具名稱字面內容當「此刻意識最高優先」，言行直接服膺，近乎執行指令，`[性格]×[好感]`常規反應暫時讓位)——強勁這階就是玩家原本想要的「玩家輸入的內容為最高優先」。啟動中(有強度且非關閉)的ignoreBond道具，`pPropStr`依這三階注入對應那一句——且**同步在USER prompt的【親密尺度五階】規則本體加註例外**(`佩戴中的『催眠暗示』類道具例外...不受此天花板限制`)，避免兩條指示互相矛盾(親密尺度五階本來就自稱「最高優先·凌駕...」，沒註明例外的話AI可能誤判優先權蓋掉這個效果)。面板顯示：等級鈕旁/道具名稱旁加`🌀無視好感`小標籤(`ignoreBondHint`)提示玩家哪些道具是這一類。**⚠ 2026-07 補「其他人不該知道」**（玩家「我對a催眠b不能知道啊，雖然ai知道但他不能敘述出來」）：提示詞把同地點所有在場者的卡片一次全塞給AI，AI技術上「看得到」A身上的催眠狀態，原本沒有東西明講「B不該對此有反應」——本來是靠已拔掉的醋意暗流機制去戳它演出來，機制拔了不代表AI不會自己聯想到。已在`_ignoreBondLines`結尾補一句：「★這是只有她自己感覺得到的私密效果，除非外顯到旁人一看就懂，否則在場其他人不知情、不該對此有反應或評論」——只在該同伴身上真的有ignoreBond效果生效時才附加，其餘回合零成本。**⚠ 2026-07 補代詞代入規則**（玩家問「我打『你現在想狠狠肏我』，AI看起來是他要肏我還是我想操她？」）：暗示內容是玩家自由輸入的文字，格式五花八門(第一/第二/第三人稱都可能出現)，提示詞原本沒明講「你/我」這類代詞該怎麼代入場景裡的角色，靠AI自己從上下文猜有風險。已在`_ignoreBondLines`結尾再加一句：「★暗示內容裡若出現「你/妳」「我」等代詞，你/妳＝她本人、我＝玩家，依此代入解讀，不要弄反」——把代換規則寫死。前端`kanshouOpenHypnosis`面板的輸入框上方同步加一行提示：「💡 用「妳」指她本人、「我」指你自己來寫...別寫反了」，讓玩家下指令時就用對的視角。**⚠ 2026-07 補「催眠太強」控速**（玩家「催眠太強，可以用GAS控制他升級嗎」）：原本4階強度按鈕隨時能直接互跳(微弱可以一鍵點成強勁)，玩家覺得升級太快太突兀。`actionKanshouSetProp`對`ignoreBond`類道具新增限制：**只能一階一階往上升**(新等級index比目前index大超過1就拒絕，回`success:false`)；**降級(含直接關閉)不受限**，隨時能一鍵退回關閉，符合「上得慢、退得快」的直覺。前端`kanshouOpenHypnosis`同步把跳太多階的按鈕標成`disabled`+半透明，玩家不用點了才被錯誤訊息打回票。刻意不做成「時間到自動升級」這種更複雜的排程機制(玩家本身也說「太複雜就算了」)，維持玩家手動按、GAS只負責擋跳階的簡單版本。
    - **⚠ 2026-07 補「催眠跟其他好感規則會不會衝突」**（玩家追問）：查出兩個真衝突＋一個較次要的：①🛑【角色一致性】原本寫死「靈魂態度仍守設定...嚴禁退化成發情機器」，完全沒有催眠例外，跟「強勁」階明講的「其餘設定(含[性格]×[好感])暫時讓位...跟平常判若兩人」字面互相矛盾；②`driveStr`①「主動程度嚴依好感分階」是獨立寫的一句，親密尺度五階的例外沒有回頭覆蓋到它，AI 得自己跨段推理優先權；③【篇幅指定】只看好感，催眠把低好感角色推向高強度場面時字數還是卡在最低檔，容易覺得被砍短。三處都補上「有ignoreBond效果生效時」的例外/覆寫，且**全部條件化**（新增`_kanshouHypnosisActive_`旗標，`partyRows`裡任一人有生效中的ignoreBond道具才為true）——沒人在玩催眠的回合，這三段提示詞完全不變、零額外字數。篇幅那條額外把目標字數在生效時直接鎖定最高檔(500字)，不再看好感臉色。

---

## 🌱 玩家御主：一次擴寫＋經歷滾動（2026-07 二度改版·拔掉留白＋性格鎖）

⚠ **2026-07 拔掉「留白創角」＋AI 側寫性格/萌點**（玩家「玩家萌點 AI 根本亂寫…鑑賞玩家要輸入姓名性別外貌個性，其他丟給 AI 去寫，遊戲中也不要讓 AI 可以改動，AI 只能改動經歷」）：舊版有兩條創角路徑，其中「留白、遊戲中讓 AI 慢慢認識我」全靠遊玩中零碎片段盲猜性格/萌點，餵給 AI 的上下文遠比創角當下單薄，猜出來的東西經常語意亂飄。改成**只保留一條路**：創角只問姓名/性別/外貌/個性四樣，**一律**呼叫 `actionBackfillKanshouAi` 一次性擴寫剩下欄位（背景/性格四段/萌點/裝扮）；進入遊戲後 AI **完全不能再碰**性格四段與萌點——這兩類欄位變成「創角時 AI 寫一次、之後只有玩家自己用改命能動」的靜態欄，滾動側寫只剩經歷一項。連帶著「性格鎖」整套鎖定機制（原本用來擋 AI 側寫覆寫玩家自訂值）也失去存在意義，一併刪除（玩家「之前那些鎖定也可以拿掉，不用 AI 負責改」）。
- **創角**（`askKanshouSetup`）：**只剩一顆按鈕**——填姓名/性別/外貌/個性（外貌個性可留空）→ 確定即呼叫 `backfill_kanshou_ai`（`actionBackfillKanshouAi`）一次擴寫出背景/性格四段/萌點/裝扮全部欄位。想自己填？創角當下先留空，事後隨時進「改命」自己補/改。
- **開局欄位**（`actionEnterKanshou` 秒寫）：TRAIT＝外貌(玩家填)、氣質空、自稱「我」、私密「無」；PREF＝對外性格(玩家填「個性方向」)、獨處/喜歡/討厭全空；**經歷(BACK)＝「剛搬來冬木市」**；萌點(INTENT)空——這些都只是等 `actionBackfillKanshouAi` 進場前的秒建種子值，backfill 完成後會被覆蓋成 AI 擴寫的完整版本。
- **經歷（原「身世」正名）**：AI 每回合經 `master_note.經歷` **滾動更新**（承接舊值增補新遭遇、≤80字·bounded overwrite），玩家可經**改命**自己改（back 型·mode 判斷 kanshou 才叫「經歷」、cap 80）。卡面標題 `#ui-back-title` 也依模式正名：**鑑賞看自己卡＝「經歷」**、從者卡/solo＝「身分背景」（updateUI 切換·從者的 BACK 是真背景不是滾動經歷）。**master_note 現在只有這一格**——是玩家開放讓 AI 持續觀察改寫的唯一欄位。
- **性格四段／萌點：創角一次寫定，遊戲中 AI 不再碰**：`對外性格/獨處性格/喜歡/討厭`(PREF) 與 `萌點`(INTENT) 全由 `actionBackfillKanshouAi` 在創角當下一次生成，`buildDefaultSystemPrompt` 的 `master_note` schema 已不含這幾欄，AI 回合輸出裡即使自己吐了這些 key 也不會落地（GAS 落地端只認 `master_note.經歷`）。想改？只能玩家自己用「改命」手動編輯，AI 不會再幫忙補、也不會覆寫。
- **⚠ 拆格 bug 根治**：`fateSegSplit_`(顯示與改命共用)只做 `。→、` 正規化＋`split('、')` 補滿4格，**不再壓縮連續頓號**——舊版 `.replace(/、+/g,'、')` 會把「、、我、無」壓成「我、無」導致值位移(我被推到第1格)，改命預填/存回全錯，現已修正。
- **🌀 側寫節流（每 N 回合才問·`KANSHOU_SIDEWRITE_EVERY_`=3）**：master_note(現只剩經歷一格)每回合都問會分散 AI 對敘事的注意力，改成計數節流——`【側寫計數】` 標記存玩家列 MEMORY（`kanshouGet/SetSideWriteCount_`，該列恆寫回·零額外 round-trip），`actionPlay` 每回合 +1，只在第 1、N+1、2N+1… 回合（`_swCount % N === 1`·首回合必寫抓初印象）把 `includeMasterNote=true` 傳給 `buildDefaultSystemPrompt`；非側寫回合整塊 master_note 從 schema `delete` 掉、AI 連經歷這欄都看不到。落地端 `if(aiData.master_note)` 守衛自動跳過缺席回合、經歷保留舊值不動。N=3 剛好貼齊 6筆/3輪 歷史窗。要調頻率＝改常數。
- **🏷️ 日常稱呼系統（2026-07 玩家定案「姓氏太多餘、名字太正式」）**：鑑賞世界一律短名——`KANSHOU_CASUAL_NAME_`（keyed by SEED id）：SABER／RIDER／伊莉雅／櫻／凜／大河／士郎。`KANSHOU_NAME_ALIAS_` 全名↔短名雙向別名疊進 `kanshouNameCandidates_`（舊存檔/歷史/AI 寫哪種都對得上人）＋**拉丁字母大小寫變體**（AI 寫 Saber/saber 也對得上 SABER——2026-07 稽核修，否則 rel_changes/npc_exit 大小寫不合＝靜默失效）；`kanshouHeroIdByName_` 短名優先查 id。建列（`heroToKanshouRow_`）、巧遇/結識顯示、召喚訊息全用短名；召喚查重跨名比對。`actionEnterKanshou` 路①含**一次性遷移**（既有列全名→短名·冪等，含玩家 MEMORY 牽手標記值；**只改 `FACTION==='從者'` 列**——2026-07 稽核修，無過濾會把玩家分身列也改名）。⚠ 種子庫只有一位櫻（id `間桐櫻黑化-Master`·真名間桐櫻）→ 就叫「櫻」，無黑櫻。英靈殿/solo 名字不動。「見過面」名單（`addKanshouMet_`）仍存全名（向後相容，比對不經它）。
- **★焦點禮讓**（玩家實測「我親櫻乾伊莉雅啥事」）：玩家明確只對一位互動時其他在場者保持背景存在感、不可搶話批評介入親密舉動；交情淺的旁觀者頂多尷尬移開視線。**⚠ 2026-07 拔掉醋意暗流**（玩家「感覺可以不要....沒啥用的感覺」，實測觸發時讀起來像在指責玩家「太超過/適可而止」，體感不佳且沒實質作用）：`kanshouJealousStr`／`_jealousPool`（兩位 ≥60 同場 20%機率）整段刪除，焦點禮讓不再有例外，其他在場者一律維持背景。
- ⚠ `master_note` 是 KANSHOU-only（buildDefaultSystemPrompt）；solo BACK 仍是固定身世（改命 UI 依 `pc.mode` 分標籤/字數）。

## 🤖 AI 管線

### `actionPlay` 執行階段順序（**順序鐵則·勿亂動**）
0. **`actionPlay` 現在是一層薄包裝**（2026-07 稽核補）：真正的引擎邏輯搬進 `actionPlay_`（下面1~12步都在這支裡）。外層 `actionPlay` 只做「同 pcId 併發軟鎖」——見下方教訓區「play 故意豁免全域鎖」。
1. 入口守門（非 `KPC_` return）＋`driveOn`/`encounterOn` 旗標＋標籤化
2. 讀表（整表只讀一次）→ 定位 pc、curL/curDay/curHour
3. UI 按鈕意圖落地（相約提議/同居/牽手/結識入駐/橋段 offer+accept）
4. 結束一天·敲門判定（命中直接回 knockEvent 不推進）
5. **跳時間/advanceHours**（重骰全世界去向、換幕鐵律）
6. **約定赴約結算（`_settle`）** ← ⚠ **必須在第7步之前**
7. **partyRows/partyMembers 組裝**（同地在場名單、詳情卡 `partyDetailsArr`）
8. 拍照（驗相簿容量 → 掛 `kanshouPhotoPending_`）
9. 提示詞組裝（USER prompt，見下）
10. `aiConfig` → 歷史餵入 → `callGeminiAPI`
11. `sanitizeAiData_` → 各欄位落地（拍照/npc_exit/rel_changes/intimacy_feedback）→ 髒列窄讀重定位寫回 → `saveGameHistoryBatch`
12. 回傳前端 key：`text/statusString/people/options/tags/moveProposal/roomEventOffer/encounterOffer/photoResult/kanshouClock/clock`

### 系統提示詞 `buildDefaultSystemPrompt()`（**鑑賞專屬**，solo 走 `miniSystem`）
`nsfwBaseRules`（⚠ **Gallery 函式內自己那份·非 Engine_Combat.gs 紅線·可改**）＋`specificRules`(慾海律令·**2026-07 實驗後改 5 條**：色度跟隨/情慾場已搬去 driveStr，見下；**同月再加第 6 條**：`options` 只能建議在場人物/當下場景真能做到的動作，見下方「options 建議越界」條)＋`★【輸出範本】`(finalJson)。
⚠ **2026-07 玩家「在場人物放最後面·歷史只是歷史」USER prompt 結構調整**：`PROMPT_PARTY_SYSTEM`(【目前在場人物命格詳情】·partyDetailsArr組裝)原本緊接在最開頭【敘事法旨】之後，改搬到整段USER prompt的**最尾端**(緊接在「現在演化玩家動作」之前)，並在它前後各補一句：前面「★【歷史僅供參考·專注本回合】：對話歷史只是脈絡背景…別被歷史裡已經過期的設定/情緒/場景牽著走」、後面「★【現場僅此名單】：以上就是此刻在場的全部人物…沒被列出的名字即使歷史提過，此刻也不在這裡」——用「放在提示詞最後面」利用模型對鄰近生成點內容的權重(recency)，讓最關鍵的「現在到底誰在場/該依據什麼」在AI真正下筆前最後被讀到。中段既有的「★【在場驗證·最高優先】」行為規則沒動，這次調整的是**資料**(誰在場的實際名單)擺放位置，規則跟資料現在分離在提示詞前後兩端，彼此不衝突。
⚠ **2026-07 玩家「提示詞太大量」全面壓縮**（核心訴求「AI 只依資料扮演」）：System＋USER＋driveStr＋schema 逐欄全部壓成最短句，冗字/重複/客套/最高級通膨砍到見骨——**但機械護欄（在場驗證/親密尺度五階/移動鐵律/冠名格式/角色一致性/世界觀）一條不刪、只縮字**。實際送 AI 文字砍約 35~45%。加規則前先想「這是機械護欄還是冗字」，冗字不進提示詞。
⚠ **2026-07 後續二輪·玩家拿 Gemini 改寫再壓縮回精簡風格**：`nsfwBaseRules`(規則1)/`driveStr`/`🛑角色一致性`/`dialogueFormatRule_`①②③ 這幾段文字重新順過措辭，同步拿掉幾個「具體例子/原因說明」（如規則1的「？？不可演成從容挑釁」範例、driveStr的「該親就親/該進一步/該索求」具體推進動詞、角色一致性的「冷酷」型例子、對話格式②冠名規則的「為何要冠名(櫻認錯自己台詞)」解釋、③的錯例/正例對照）——**這些多半是「示範用具體例子」而非機械護欄本體，砍了會讓提示詞更省字，但也可能讓模型在對應的邊角情況下少一點依循，若之後實測某個對應行為(如認錯自己台詞/停在曖昧不推進)又回歸，優先考慮把對應的具體例子/原因說明補回去，而不是整句重寫**。**曾考慮把 driveStr(僅driveOn=true才出現的USER prompt動態片段)直接合併進恆常存在的System prompt(nsfwBaseRules/慾海律令)裡——玩家決定不做**：driveStr關掉時是0字(GAS動態組裝不塞這段)，合併進恆常規則反而讓「開關關掉」的多數回合每回合都要多付這段字數，且拿掉了「矜持/主動掌握」兩種節奏可切換的實際功能，省字帳算下來不划算。
⚠ **2026-07「色色部分搬去給點火」實驗（進行中·結果待玩家實測回報）**：慾海律令原 0(色度跟隨)＋4(情慾場生理特寫)兩條**整段搬進 `driveStr`**（新編號⑤⑥，只有 `driveOn=true` 才組進提示詞），慾海律令本體剩 5 條(重新編號1~5)。**這兩條原本是「怎麼寫得好」的常駐風格指導、不是「准不准寫」的開關**——准不准寫全程由【親密尺度五階】的好感天花板決定、跟 driveOn 無關，天花板不變。搬走後的實際影響：矜持模式(driveOn=false)不再拿到這兩條的具體露骨寫作指引，即使好感已達戀人階(80+，天花板本身仍允許無上限)，措辭可能反而變保守含糊；主動掌握模式因為同時吃到 driveStr 的「推進到真的發生」指令＋這兩條的露骨寫作指引，兩者疊加可能更猛。**若實測發現矜持模式下的高好感場景意外變乾癟/含糊，這就是根因，把這兩條原樣搬回 specificRules 即可還原。**
- **finalJson 欄位**：`inner_monologue`(純思考不顯示)／`narration`(約500字第一人稱)／`npc_exit`(自然告辭離場真名陣列)／`options`(固定4)／`intimacy_feedback`{player,npcs[]:physical_state≤15/appearance_extras(原outfit_change)≤20/mutual_nicknames/attitude≤15/memory}／`rel_changes`[]{target真名,fav_change整數±·單回合上限+5}／`master_note`(現只剩經歷一格，側寫節流回合才出現)。
  **⚠ 2026-07 四度改版·`dynamic_skills`(雙修技巧)整個拔掉**（玩家「雙修技巧還有在用？UI拿掉玩家也看不到了」）：稽核發現這欄早就沒有任何玩家UI顯示，也沒有任何規則告訴AI該怎麼運用讀回的技巧清單(純粹讀進去擺著)，形同每回合白吃AI注意力換不到實質效果——連帶`kanshouSkillTagStr_`/`processSkills`/`setSkillTag_`三個輔助函式與`【身體記憶】`/`【快照】[技巧]`兩段USER prompt注入全數刪除，`[雙修技巧]`MEMORY標記不再讀寫(舊存檔殘留值不影響任何邏輯，純孤兒資料)。順手修正一個連帶發現的off-by-one：`mutual_nicknames`/`attitude`schema文字原本寫「見律令5」「見律令6」，實際慾海律令只有5條，拔掉dynamic_skills後律令4=mutual_nicknames、律令5=attitude，schema引用已同步改對。
  **⚠ 2026-07 三度改版·`promise_proposal`／`cohabit_proposal`／`proposal_accept` 三欄全部拔掉**（玩家「proposal_accept可以拿掉…promise_proposal也可以拿掉，讓GAS好感超過90…詢問玩家她是否可以與玩家同居…想要當好感卡39之類的時候GAS主動發出邀約」）：AI 不再有任何欄位能自己決定「要不要開口約/邀同居」，這兩件事改由 GAS 依好感數值直接判定觸發（見上方「約會地點好感分級」與「她也能主動邀約/邀同居」段落），`proposal_accept` 本就早已停用、一併真正刪除不再保留相容佔位。
  **⚠ 2026-07 拔掉 `move_proposal`＋`location` 欄（玩家實測「AI一直提議移動、頭痛」）**：舊版讓 AI 自己決定要不要提議換地方、換去哪，結果反覆出現「同地點原地邀約」「跟歷史地點串戲」等 bug，且體感一直被打斷。現在 AI **完全沒有任何欄位能提議或宣告換地點**，換地方只剩兩條 GAS 決定的路：①玩家自己用地圖走(`moveTarget`)；②玩家在地圖對在場同伴提議「一起去」（`proposeMove` 機制標記，見下），GAS 依好感直接裁定接不接受，AI 只演她答應/婉拒的反應。因為①②都不讀 AI 輸出，也就不需要「攔截 AI 硬吐 location」這層保險了，直接整段刪除。
  **🐛→✅ 2026-07「options 建議越界」修法**（玩家「4個選項…有時候會出現移動、或是呼喚/尋找人物，但這些都做不到、點了AI直接當機」）：`options`(命運的抉擇)schema/rule 原本只約束格式(4條·每條≤20字·分類標籤)，完全沒有內容約束——AI 會生出「去咖啡廳走走」「找Saber聊聊」這類選項，但選項一旦被點擊會**原樣當成玩家輸入送回**(`Script_Kanshou.html` `send()` 的 `currentOptions[optIndex]`)，而移動/呼喚不在場者本來就不是 AI 演得出來的事(受【移動鐵律】/【在場驗證】約束)，AI 被迫在明知不可行的前提下硬掰，容易生出前後矛盾/離題的敘事，玩家觀感上讀成「當機」。**修法**：`specificRules`(慾海律令，可改)補第6條——「options 只能是玩家對『此刻在場人物』在『當下這個場景』真能做到的動作，禁止建議移動地點、呼喚/尋找不在場角色」，從產生選項的源頭擋掉，不必等到玩家點下去才在敘事端硬圓。
  **🐛→✅ 同日再抓一種「options 越界」**（玩家實測：場景明明是凜在便利商店對著一款冷飲的成分皺眉，選項卻冒出「3. 注意到她對家電的困擾，提點兩句」——查 `Seed_Codex.gs` 凜的 `dailyMoe`「操作家電永遠一竅不通，出糗次數多到數不清」，證實 AI 是把她的**萌點設定表**字面掏出來塞進選項，跟本回合場景(冷飲)完全無關，玩家角色也不可能知道這件事）：跟上面「建議做不到的動作」是不同失敗模式——那次是動作辦不到，這次是**選項另外調用了角色設定表**，等於繞過 narration 直接把不該說出口的萌點字面端上桌，同時違反 show-don't-tell(紅線②)與「只能演本回合」。同一條第6條規則追加後半句：「只能基於『這回合 narration 實際寫出的內容』出題……禁止另外調用她的萌點/個性/背景設定表字面塞進選項……那是玩家當下不可能知道、也跟眼前這回合無關的設定資料」。
  **🚶👋 玩家提議同去（唯一存活的換地點提議路徑）**：地圖 👋 鈕帶 `proposeMove` 機制標記 → pre-AI 記 `_pendingProposal{type:'move'}`＋依好感用 `kanshouProposalAccepts_` 直接裁定成不成，注入★【提議·同去·GAS已裁定】鐵律讓 AI 只演反應 → 接受＝post-AI 回填 `moveProposal` 出既有「前往」泡泡＋`proposalResult` 通知條，玩家按同意才真的移動（moveWithCompanion 帶同地眾人）。多人在場＝一起邀（以第一位個性判定）。
  **移動規則二條版**（2026-07 三度改版拔掉 `promise_proposal` 後，★【地點清單】整條刪除——那條規則存在的唯一理由就是替 AI 的 `promise_proposal.loc` 圈合法地名，AI 現在連這個欄位都沒有了，自然也不再需要看完整地點清單）：★★【移動鐵律——換場景完全不是你能決定的事】(合併版·含地圖移動例外與換幕一致)／★【地點釘死·此刻只有這裡】(想去別地方頂多嘴上聊聊、不會真的發生，註明自然告辭豁免)。
- **對話格式** `dialogueFormatRule_()`：**頂層函式·單一真實來源**，Gallery 版 `nsfwBaseRules` 第3條與 solo `miniSystem` 第2條**共用**（⚠ 非 Engine_Combat.gs 紅線那支·紅線不呼叫它·改它安全）。規則四條：①話語/喘息/吸吮進「」　②**每句角色台詞在「」前冠說話者名字（硬格式·2026-07 玩家「櫻不知道是自己說過的話」→ 台詞浮在敘述裡沒名牌·輕量模型跨回合認錯人）**，例 `櫻「…」`/`凜「…」`；玩家本人第一人稱「我」台詞例外不冠名　③動作/撞擊/水聲走敘事　④單層「」禁巢狀。兩軌都套。**⚠ 2026-07 再修（玩家實測：打「Saber啊你們不知道？」，AI 卻寫成「於是我又追問了一句」——台詞被轉述掉、沒有真的說出口）**：在②的「玩家本人不冠名」例外句後面補一句——玩家輸入若本身是台詞（疑問/吐槽/驚嘆等），必須語氣照原樣寫成「……」引號直接呈現，禁止改寫成「於是我問了一句」這類轉述句代替，只有純動作、沒有台詞內容的輸入才用敘事帶過。想合併進 `nsfwBaseRules` 第1條「承接玩家最新動作與台詞【語氣照原樣】」文意上更順，但那是紅線①保護的常數本體、一律不可改，改在這裡（solo/kanshou 共用、且被 nsfwBaseRules 第3條原樣引用）效果相同、範圍更廣。

### 🧠 記憶全景（AI 每回合看得到什麼·寫回什麼·多久一次）— 2026-07 整理
**AI 每回合看得到（組進 prompt）**：
- **近期對話**：`getGameHistoryBatchRaw(pcId, 6)` 滑動窗（6筆＝3輪，更早的靠下面的持久欄接力）。
- **玩家**：性格(PREF)／特徵(TRAIT)／裝扮／**經歷(BACK·滾動≤80字)**／位置＋地點活動 context（`kanshouLocContextForAI_`）／肉體(PHYSICAL)。⚠ **玩家萌點(INTENT)絕不餵**（紅線②）——2026-07 二度改版後 AI 連「盲寫」都不准了，性格/萌點創角時 `actionBackfillKanshouAi` 寫一次定案，遊戲中只有玩家自己改命能動，AI 完全不碰。**2026-07 四度改版拔掉雙修技巧(身體記憶)**：沒UI也沒使用規則的孤兒欄位，見上方finalJson欄位說明。
- **每位在場 NPC**（`partyDetailsArr` 一行一人）：身世(BACK)／裝扮／性格／特徵／日常風味／**萌點(有餵·標「僅供內化」，與玩家不同)**／當前活動／**同居狀態**(`kanshouIsCohabit_`判定·2026-07 稽核補：已同居者額外標註「她現在與你同住一處」，讓AI語氣能自然帶同居的日常親近感、不是每次都當作客處理)／共同回憶(MEMOIR)／與玩家的約定／關係 tag＋好感＋相處記憶＋聊天天花板＋階調；NSFW 區另帶 肉體＋羈絆(REL_MEM：專屬稱呼＋態度)。

**AI 寫回（GAS 落地）**：
- **每回合**：`physical_state`/`appearance_extras`(原outfit_change)→PHYSICAL·【換裝】；`mutual_nicknames`+`attitude`→REL_MEM；`memory` 里程碑→MEMOIR(cap10·★釘選不驅逐)；`rel_changes`→BOND；proposals→前端泡泡(意圖非結果)；`npc_exit`→LOC。
- **每 3 回合**（側寫節流·【側寫計數】）：`master_note`→**只剩經歷滾動一項**（2026-07 二度改版拔掉性格/萌點側寫，見上方「一次擴寫＋經歷滾動」節）。⚠ **節流三件套缺一不可**（第二輪稽核抓到擊穿）：① schema delete（非側寫回合）② USER prompt 的「你可透過 master_note.經歷 滾動增補」提及跟著 `_doSideWrite` 條件化（`_doSideWrite` 為此**提前到 prompt 組裝前計算**）③ 落地端 `if (_doSideWrite && aiData.master_note…)` 守衛（AI 無視 schema 自發吐也不落地）。

**🩺 AI 負擔瘦身（2026-07 玩家診斷「滾動式+衣服外觀神情太要他老命」·小模型注意力有限，能省則省）**：
- **狀態差分**：`physical_state`/`appearance_extras`(原outfit_change)/`attitude` 沒實質變化留空＝系統沿用舊值（GAS 空值本就跳過寫入；attitude 配套修掉「空值洗白態度」舊 bug——空→從 oldRMem 撈回舊態度；**「無/同上/不變/沿用/維持原樣/如前」等敷衍值也視同空**，否則差分模式下 AI 真的會把「同上」二字寫進態度欄）。有變化（脫/穿/沐浴/情事/神情轉變）必須更新，NSFW 場景照記。
- **options 連動開關**：前端帶 `optionsOn`（玩家關【命運的抉擇】＝false）→ `buildDefaultSystemPrompt` 第3參數 `includeOptions=false` 把 options 欄整個 delete——沒人看的東西不叫 AI 生。連 Gallery 版 `nsfwBaseRules` 第2條的「options固定4個」字樣也隨開關拿掉（schema 刪了、規則文字還催繳＝AI 精神分裂）。
- **🎬 換幕縮窗**：移動/跳時段/跳節慶/推進時間/結束一天的回合，歷史窗 6筆→2筆（1輪）——舊場景對話物理上不進 AI 眼睛，根治「換地點/時段被舊場景帶著跑」（「此地是唯一真實」「此刻時段是唯一真實」兩條鐵律是文字輔助線，縮窗才是確定性主力）。
- 原則：**AI 只管演戲，記帳全給 GAS**——別再往每回合 schema 加欄位，要加先想「能不能差分/節流/事件驅動」。

**⚠「今日情景」查證結論（2026-07·勿重複造輪）**：曾考慮加「今日情景」滾動摘要接住 3 輪窗外的當日細節——查證後**不做**：**經歷(BACK) 的滾動摘要實質已涵蓋今日進展**（實測會寫入「正在逛街、計畫一同前往咖啡廳」等當日動態），另設欄位＝跟經歷重複。若長場景實測出現「忘記前段」，優先調經歷的提示詞（讓它多保留今日細節）而非加新欄。舊 `log_summary` 是因果表的主/被動方向記錄、非情景摘要，已隨因果表一起砍除。

### 模型配置（`Core_Settings.gs` + `actionPlay` aiConfig）— 🚀2026-07定案
```
AI_MODEL     = deepseek/deepseek-v4-flash    (屬性 MODEL)        ← 只當備援
SOLO_MODEL   = google/gemini-3.5-flash-lite  (屬性 SOLO_MODEL)   ← 主力(快4倍·真敢寫)
```
- **`actionPlay` 只用這兩顆**：`aiConfig` 固定 `model: SOLO_MODEL`＋`fallbackModel: AI_MODEL`，兩模式一律先打 `SOLO_MODEL`、`retries = 1`（探針實測 Gemini 六階全過真露骨~4-5秒；DeepSeek 極致被擋還卡49秒——⚠ 此數字是 3.1-flash-lite 時代測的，2026-07 升級 3.5-flash-lite 後未重新探針，僅供參考）。
- ⚠ **`UNLOCKED_MODEL`(x-ai/grok-4.20) 不屬於鑑賞**：這是 solo 專用的高好感解鎖模型(`Router_Narrative.gs` 的 `actionManaSupply`/`actionUseSeal` 分支專用)，Gallery.gs 完全沒有引用它——先前這裡誤把它列進鑑賞模型配置，稽核已修正刪除。
- **`driveOn`(點火/主動掌握) 只控敘事推進幅度的 `driveStr`、不再切模型**。⚠ **2026-07 玩家「一直步步逼近都不做」重寫**：`driveStr`＋敘事終極警告的點火分支原本框架是「把玩家逼向毫無招架餘地／堵退路／想跑也跑不掉」＋「不必每回合寫到終點」——這等於授權 AI 永遠停在「快要、就差一步」空轉。改成**「主動且明確地推進到真的發生」**取向（該親就親、該進一步就進一步、嚴禁在曖昧邊緣反覆空轉），保留全部好感天花板/角色一致性/不真正傷害護欄，只把「逼近但不做」的空轉框架換掉。點火≠壓迫鋪陳，點火＝她主導、實際往前推到位。
- 採樣：`temperature 1.08, top_p 0.97, top_k 60, repetition_penalty 1.12, presence/frequency_penalty 0.25, max_tokens 1500`。⚠ 後四顆旋鈕 gemini-lite 被 OpenRouter 靜默忽略（原壓重複用）——若 Gemini 跳針/套路化，需另想防重複提示詞手段。
- 歷史：`getGameHistoryBatchRaw(pcId, 6)`（6筆＝3輪）。

### `callGeminiAPI` 失敗行為（`Engine_Combat.gs`·兩軌共用·只讀不改）
被 NSFW 擋（`PROHIBITED_CONTENT/SAFETY`/空 content）→ 同模型內首次觸發加 `softenSuffix` 降階柔化重試 → 整組失敗且有 `fallbackModel` 才換模型再跑一輪 → 最終被擋回「🌸結界觸發」、一般錯誤回「🌫️因果紊亂」。

---

## 🖥️ 前端地圖（`gas/Script_Kanshou.html` 為主）

- **唯一引擎入口 `send(customMsg, isSilent, opts)`＝`action:'play'`**（2026-07 重構：原 22+ 位置參數收進單一 opts 物件，payload 不變零速度影響）。移動/相約/拍照/牽手/同居/敲門/橋段**沒有各自的 action**，全靠 opts 夾旗標：`moveTarget`/`moveWithCompanion`/`promiseMeet`/`promiseAccept`/`takePhoto`+`photoIntent`/`showPhoto`/`handHold`/`cohabitInvite`/`roomEventAccept`/`knockAccept`/`skipKnockCheck`/`lookAround`/`inviteResident`/`endDay`/`advanceHours`/`jumpBand`/`jumpFestival`/`loaderCaptions`。
- **回饋條 `proposalResult`** 涵蓋 相約/牽手/同去/同居 四型＋**撲空含「她似乎在○○」位置提示**；**`promiseSettle`（獨立通道）** 涵蓋 赴約成功/爽約過期 結算通知（與提議結果並發時各自顯示·見教訓區「單一回饋槽」）；相簿滿的 `photoResult` 附直達鈕（📚開相簿）——「撲空/婉拒/卡住」一律要有下一步，別讓玩家對著空氣猜。
- **改命同伴卡**（2026-07 第二輪稽核修）：`update_fate` 名字比對原硬性要求 `IS_PARTY==='同行'`，但鑑賞列從不寫該欄→同伴卡改命鈕恆「查無此人」；現比照 `update_rel_tag` 給 `k_` 世界豁免（同世界名字直配），改同伴的 個性/特徵/身世 是合法自訂。**萌點例外(2026-07 再修)**：同伴/NPC的萌點改成「真正內化」——`intent-box`(Index.html)在非自己卡片整格連改命鈕都隱藏，`actionUpdateFate` 也擋掉 `fateType==='intent'` 且目標非自己的請求，玩家從此看不到也改不了同伴萌點，只留給AI演出參考。（2026-07 二度改版：玩家自己卡的性格鎖快取 `_kcPrefLocks` 已隨性格鎖系統整組刪除）
- **獨立 action**：`kanshou_companions`／`get_heroes`／`kanshou_summon_hero`／`get_album`／`album_delete`／`update_rel_tag`／`kanshou_memoir_op`／`kanshou_set_home_name`／`kanshou_set_name`／`kanshou_set_sex`／`enter_kanshou`／`backfill_kanshou_ai`。
- **函式分組**：地圖移動(`kcMapListHtml_`/`kanshouMoveTo`/`kanshouProposeMove`/`kanshouLookAround`)、同伴面板(`openCompanions`/`renderKcHeroList_`/`kanshouEditRelTag`)、召喚(`kanshouSummonHero`)、回憶(`kanshouOpenMemoir`/`kanshouMemoirOp`)、約定(`kanshouPromiseMeet`/`kanshouWaitForPromise`)、拍照相簿(`kanshouTakePhoto`/`openKanshouAlbum`)、時鐘(`kanshouEndDay`/`kanshouNextStage`/`kanshouJumpBand`/`kanshouJumpFestival`)。
- **泡泡 UI**（`send()` 內依回傳欄位組）：移動同意(`moveProposal`)、敲門(`knockEvent`)、橋段邀請(`roomEventOffer`)、巧遇(`encounterOffer`)、拍照結果(`photoResult`)、地圖人數徽章(`_lastTags.locationCounts`)。
- **前端鏡像常數**（後端為真實來源）：`KC_REGIONS_`/`KC_FESTIVALS_`/`KC_TIME_BANDS_`/`KC_LOCATIONS_`/`KC_APPT_BANDS_`。時鐘全域 `kcClock`（`Script.html`）。
- **`Script.html`/`Index.html` 的鑑賞殘留**：`applyModeUI()` 總開關（依 isKanshou 切 topbar/輸入框/drive開關/photo-btn/相簿抽屜/節慶抽屜）；同伴卡鑑賞按鈕列(🏷️關係/📅相約/✋放手/🤝牽手/🏠同居/💞回憶)；`enterKanshou()` 入口。⚠ `Index.html` 的 `#victory-memoir` div 是**戰爭軌殘留**：奪杯回憶錄機制已砍，該 div 現只被清空/隱藏、不再填充（非鑑賞，別誤接鑑賞邏輯）。

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
- **別依賴小模型「自發」填選填欄位**：Gemini-lite 從不自發填自由選填欄位(舊 move_proposal 就是活教訓，2026-07 乾脆整欄砍掉)——玩家發起的機制動作一律走「明確 payload → pre-AI 記提議 → 確定性管線」(👋proposeMove/相約/牽手同款)，別再指望 AI 自己決定「要不要」。
- **🫶 玩家提議（相約/牽手/同去）她答不答應＝GAS 依好感擲、AI 只演**（2026-07 由 AI 判定改 GAS 判定）：pre-AI 用 `kanshouProposalAccepts_(type, bond)` 依好感擲定 `_pendingProposal.accepted`（曲線：move base .45/slope .006、promise .30/.007、hold .10/.010，夾[.03,.97]——牽手最看好感、同去最隨和），★提議鐵律直接告訴 AI「她【答應/婉拒】了，只演她的反應、不可改寫決定」；post-AI 落地讀 `_pendingProposal.accepted`。**2026-07 三度改版**：`proposal_accept` schema 欄已整個刪除(不再保留相容佔位)。她主動提議約會(`kanshouPromiseOffer_`)＋同居(`kanshouCohabitOffer_`≥90)也已改成同一批 GAS 直接判定觸發，不再等 AI 自己開口。**紅線①核對過：nsfwBaseRules／慾海律令／driveStr／五階演化 0 改動。**
- **通用錯誤文案是查案毒藥**：send()/saveFate 的 catch 已帶出 e.message(【原因】行)；後端 success:false 的 message 會演進故事流。別再寫吞掉真因的 alert。
- **獨立事件別共用單一回饋槽**：赴約/爽約「結算」與相約/牽手/同去「提議結果」是兩條獨立事件流，舊版共用 `proposalResult` 單槽＝並發時後寫的吞掉先寫的(爽約通知無聲消失2.0)。現制：結算走 `promiseSettle`、提議走 `proposalResult`，前端各自出通知條。新回饋事件進來時先問「跟既有槽是同一條事件流嗎」，不是就開新欄位。
- **後端早退回應別夾空集合**：敲門早退曾夾 `people: []` 把前端 `localNPCs` 快取洗空(泡泡期間拍照面板變無人)。早退＝沒人移動＝不帶 people；前端也只在 `Array.isArray(data.people)` 才更新快取(雙保險)。
- **「下方/上方」方位詞會過期**：prompt 注入段引用其他規則時**用【規則名】不用方位**——注入點會搬家，方位詞跟著說謊(告辭/巧遇豁免句曾指「下方」而鐵律實在上方)。
- **小模型會沿用剛出現的視覺詞、用到失去邏輯**（2026-07 玩家實測抓到）：某回合合理寫了「手機螢幕的光亮映照在她臉龐」(拍照後·螢幕當光源照在對方臉上，合理)，接下來幾回合卻沿用「螢幕」這個詞寫成「螢幕上顯現出我的驚呼/不解的表情」——變成用「螢幕」描寫**玩家自己**的表情，但第一人稱『我』根本看不到自己的臉，這個畫面邏輯上不成立。已在★【不替玩家腦補】結尾補一句：「『我』看不到自己的臉，禁止寫成『螢幕/鏡子顯現出我的表情』這類從外部看見自己臉的描述——我的反應只能透過動作/感受/台詞呈現」。這類「沿用剛用過的顯眼詞彙、用到脫離語境」的失誤模式值得留意，不只螢幕這一個詞可能發生。
  - **⚠ 同類 bug 第二例（2026-07 玩家實測「紫水晶眼眸是我的ㄟ，AI又拿去用」）**：玩家御主卡「氣質」特徵是「紫水晶眼眸」，跟美狄亞聊天時 AI 卻把「紫水晶般的眼眸」直接套在美狄亞身上——查證美狄亞自己的種子資料只有「紫色長髮」，從沒設定過紫水晶眼睛。跟螢幕那個 bug 同一種病根：【玩家命格】跟【在場人物】兩段的「特徵」在提示詞裡位置相近，小模型把剛讀到的玩家外貌詞彙錯誤沿用到同伴身上。同一句★【不替玩家腦補】結尾再加一句處理：「同伴的外貌只能取材自她自己的資料，禁止把玩家自己命格的外貌/氣質特徵挪用套在同伴身上」。
- **假容量上限別憑空捏造**：2026-07 稽核抓到 `Script.html` 同伴卡片列表曾用寫死的「3」補畫「（空位）」佔位框，暗示「此地最多3位同伴」——但 §91 駐留制改版後同地點召喚無數量上限(`buildTagsPayload_` 只按 LOC 篩選)，這個「3」是介面上憑空捏造、跟後端規則脫鉤的假限制，已整段移除。加任何「剩餘X個」「上限N」這類顯示前，先確認後端真的有對應的數量約束，沒有就別顯示。
- **審查攔截保底文字別讓它悄悄變成歷史**：`callGeminiAPI`(Engine_Combat.gs) 全部重試/審查攔截皆失敗時，回傳的是一組跟真正生成成功長相一模一樣的「保底文字」JSON——2026-07 抓到 `actionPlay`(Gallery.gs)/`narrateWithState_`(Router_Narrative.gs)舊版都會把這句「什麼都沒發生」的保底措辭原封不動存進 `saveGameHistoryBatch`，下次呼叫又把它當成上一輪的既定事實餵回AI，可能接續出跟實際劇情矛盾的敘事。已加 `_genFailed` 旗標讓兩處呼叫端辨識、失敗時完全跳過寫歷史。**任何新的敘事呼叫端要接 `callGeminiAPI` 並自己存歷史，記得先檢查這個旗標。**
- **提示詞講的規則，代碼要真的照做**（2026-07 全面稽核抓到）：`rel_changes`/`intimacy_feedback.npcs[]` 寫入好感/外顯前，提示詞明講「只有【目前在場人物】才准變動」，但兩處寫入邏輯從沒真的檢查 `pcData[idx][COL.PC.LOC]` 是否等於 `curL`——AI 若因對話歷史殘留或幻覺提到不在場的人名，好感值一樣被悄悄寫入。同批也發現 `rel_changes` 的「單回合漲跌上限±5」只寫在提示詞裡，代碼只有 `sanitizeAiData_` 的 `[-100,100]` 粗夾，從沒真的把±5夾進去。兩處都已補上對應的程式碼檢查/夾值。**提示詞裡承諾的每一條護欄，都要回頭確認代碼是不是真的照做了，不能只靠告訴AI「請遵守」。**
- **回饋通道只開一槽，同回合兩筆就吞一筆**（2026-07 稽核抓到）：`kanshouPromiseSettle_` 沿用了 `proposalResult` 那次改版學到的「獨立通道」教訓，卻自己還是單槽——玩家若同時有兩位同伴的約定在同一回合結算(如A赴約成功+B同時爽約)，`forEach` 跑兩輪，後跑的無條件覆寫前一筆，前一筆的通知條就消失(底層BOND/MEMORY寫入正常，只有UI通知被吞)。改成陣列，前端逐筆渲染。**同一件事「可能同時發生不只一次」時，回饋通道要用陣列，不要嫌麻煩用單一物件卡死自己。**
- **「防偽造」helper 存在，不代表每個呼叫點都真的用了它**（2026-07 全面稽核·本輪最嚴重發現）：`kanshouOwnedRowIdx_` 明明就是為了防 `pcId` 被猜中/偽造而寫的，但 `actionPlay`／`actionGetAlbum`／`actionAlbumDelete` 三個高頻/高權限 handler 一路用裸 `pcData.findIndex` 繞過它，等於整套防禦形同虛設——而且是系統負擔最重、寫入面最廣的那個函式漏掉。**新增任何會讀寫 pcData 或私有資料的 handler，一律要主動去比對現有的歸屬驗證 helper 是否真的被呼叫，不能假設「這套機制存在＝全部路徑都受保護」。**
- **`play` 故意豁免全域鎖，但「豁免鎖」不等於「不用防併發」**（2026-07 全面稽核·兩組獨立agent各自收斂到同一根因）：`actionPlay`(現為`actionPlay_`)的寫回機制是「整表快照→本回合全部改動只在記憶體→結尾整列覆寫」，若同一 pcId 的兩次呼叫執行窗口重疊(同帳號兩分頁/兩裝置同時操作、或聊天等AI回應時另開改命視窗存檔)，後flush的請求會用自己那份舊快照整列覆寫掉先flush者的所有改動。已用 `CacheService` 做「同一pcId」的軟性互斥(外層薄包裝 `actionPlay`，見上方執行階段順序第0步)：偵測到同pcId仍有一次在跑就直接拒絕待玩家稍候，不佔全域鎖、不影響其他玩家。**⚠ 已解除的相關限制（2026-07 拍照改手機後自然消失）**：舊版拍照的「寫相簿(立即/不可逆的`appendRow`)」與「扣底片(記憶體→回合尾端才flush)」曾是分離提交，中途有未接住的例外時可能出現免費照片+其他當回合狀態改動一併消失的風險；拔掉底片機制後這條路徑只剩單一的`appendRow`寫入，這個併發疑慮已經不存在，不需要再另外根治。
- **字串前綴比對記得連 `indexOf` 的意義都要核對，不要只挑「有沒有寫」**（2026-07 稽核抓到）：`Router_Action.gs` 的 `_state` 隨動作回應夾帶機制原本只判斷 `String(pcId||"").indexOf("PC_")===0`——但 `"KPC_xxx".indexOf("PC_")` 結果是 `1` 不是 `0`，鑑賞被整個排除在外，即使 `update_fate`/`update_rel_tag` 兩個handler明明就是特地做給鑑賞共用、也確實有交棒`STATE_PRE_DATA_`，改命/改稱呼存檔後鑑賞玩家還是得白跑一趟整表`sync`。已補上 `isKanshouCtx` 條件放行(這兩個action是`isKanshouCtx`為真時唯一能走到這個判斷點的，其餘solo專屬action都在更早被`KANSHOU_BLOCKED_ACTIONS_`擋掉，改動安全)。
- **給小模型的篇幅指示，沒數字的那端會被無視**（2026-07 玩家實測「好感高了字數還是100~200」）：`★【篇幅隨關係濃淡】`原本只有低好感端給了具體數字(200~300字)，高好感端只寫「越深越濃才放長寫細」這種沒有錨點的模糊話——`SOLO_MODEL`(gemini-3.5-flash-lite)這類小模型對沒有具體數字的指示執行力很弱，結果好感再高篇幅也沒跟著拉長。已補上熟識(350~450字)/親近以上(450~600字)的具體區間。**任何要求「隨程度增減」的提示詞，每一端都要給具體數字，不能一端有數字一端純形容詞。**
  **⚠ 2026-07 再修（玩家「字數一下很長一下很短」）**：即使兩端都給了數字區間，還是留了兩個變因給 AI 自己判斷：①要把好感數字bucket進哪個區間本身對小模型就不穩、②多人在場、各自好感不同時不知道該以誰為準——兩者疊加就是忽長忽短的根因。改成 GAS 直接算好一個**具體目標字數**（`_kanshouTargetWords_`，取在場好感最高者、沒人在場用最低檔：<40→250字／40~59→400字／60+→500字）直接指定，規則名也從`★【篇幅隨關係濃淡】`改成`★【篇幅指定】`（`driveStr`/schema 的`narration`欄描述同步改引用新名字）。AI 不必再自己做「好感→區間」的判斷，只需要照給定的數字寫，同名多人不同好感也有唯一答案。
- **持久欄位的「欄名」跟「範例」都會窄化 AI 的理解，兩處都要顧**（2026-07 玩家實測「幫她戴貓耳朵，過幾輪就忘記」）：`appearance_extras`(原名`outfit_change`)本身是每回合都重新餵回的持久欄位(存`【換裝】`)，理論上不該被對話歷史的6則滑動視窗限制住——但舊欄名字面就是「換裝」、範例又只給「絲綢襯衫」這種正經換裝，AI 容易把玩家臨時加的配飾/道具(貓耳朵之類)當成那句台詞的趣味描述、覺得不算「持久狀態」而不寫進來；沒寫進持久欄，這個設定就只活在對話歷史裡，滑出視窗後就真的看不到了。已改名`appearance_extras`(外觀附加物，不再暗示只認衣服)＋範例加「貓耳頭飾」，兩處一起下手。**排查「AI 忘記某個設定」時，先確認有沒有對應的持久欄位在接住這類事實——通常有，缺的只是欄名/範例沒涵蓋到這種情境、AI 沒把它跟該欄位對上號，不是機制本身漏接。**
  - **🔄 2026-07 後續修正**（玩家「小道具已經有專門機制了，外觀服裝也幫我專注在外觀服裝吧」）：既然持久小道具系統(含玩家自訂)上線後已經是配飾/道具類事實的機制保證正解，`appearance_extras`範例拿掉「貓耳頭飾」、改回**只專注服裝本身**——避免兩套機制搶著記同一件事。這條教訓本身依然成立(欄名/範例會窄化理解)，只是配飾類换了個更適合的專屬管道去接住，不必再靠這欄硬撐兼管。
- **前端 maxlength/長度檢查不能取代 backend 上限**（2026-07 玩家「全面防呆、限制輸入的字號前後端都要」全面複查抓到）：一次性稽核揪出好幾個「只有前端擋、backend 從沒設上限」的欄位——`actionEnterKanshou`首次建檔的 pcName(只靠前端`maxlength=16`)/appearance・persona(只靠前端`maxlength=60`)、`actionBackfillKanshouAi`餵進 AI 提示詞的同三欄。也抓到反向缺口：`changeKanshouName()`前端連檢查都沒做(對照組`kanshouRenameHome()`有做)，白白多一趟round-trip才被backend擋下。**兩條都要顧，且順序是backend優先**：backend 的上限才是真正擋得住的那一道(前端能被繞過)，前端檢查只是省一趟round-trip、體驗更好，兩者不能只做一邊。另抓到`setKanshouHomeName_`只裁長度、沒清`｜`等標籤分隔字元(小道具的`name`欄之前也犯過同款錯)——凡是要塞進 MEMORY 單值`【tag】`格式的自由輸入，一律要過`kanshouSanitizeTagValue_`，不能只信賴呼叫端自己記得清。**新增任何吃自由輸入的欄位，checklist：①backend 長度上限(不是只靠前端) ②若寫入的是 MEMORY tag，字元淨化不能省 ③前端也做同款檢查省一趟round-trip，但不能只做前端。**

---

## 📎 主要常數速查（都在 `gas/Gallery.gs`）
`KANSHOU_REL_TIER_`(五階) · `KANSHOU_SCENE_BOND_`(3) · `KANSHOU_APPT_BANDS_`(午後14/黃昏18/夜20) · `KANSHOU_HOUR_PER_ACTION_`(1/6) · `KANSHOU_TIME_BANDS_`(5時段) · `KANSHOU_LOCATIONS_`(合法地點白名單·AI location/move 驗證) · `KANSHOU_HERO_HOME_`(各人住處) · `KANSHOU_SCENE_EVENTS_`(橋段庫) · `KANSHOU_FILM_PER_DAY_`(3)/`KANSHOU_ALBUM_CAP_`(100) · `KANSHOU_KNOCK_CHANCE_`(0.2)/`KANSHOU_KNOCK_MIN_BOND_`(60) · `KANSHOU_COHABIT_BOND_`(90)/`KANSHOU_VISIT_BOND_`(40) · `KANSHOU_PARTY_DETAIL_CAP_`(5) · `KANSHOU_STARTER_IDS_`(開局起手池) · `KANSHOU_SUMMON_BLOCKED_IDS_`(暫不開放召喚)。
