# FUNCTION_MANUAL.md — 全專案逐函式工具書

> **grep 前先查這份。** 每個函式一行：做什麼／被誰呼叫，依檔案分類。行號會漂，**以函式名為錨**。
> 新增／改簽名／刪除函式時同步改對應那一條（CLAUDE.md 紀律）。找路先看 `CODE_MAP.md`，「為什麼這樣寫」看 `CODE_NOTES.md`。
> 2026-09 末舊版 solo 整組拆除後依現有代碼重建（舊版的條目一併移除；要查歷史看 git log）。

## 檔案總覽（後端→前端）

| 檔 | 函式數 | 職責 |
|---|---|---|
| **Router_Action.gs** | 11 | 唯一入口 `handleGameAction`：消毒、歸屬驗證、寫入鎖、分派 `ActionRouter`、夾帶 `_state`；狀態頁／改命／稱呼 |
| **Account.gs** | 3 | 帳號登入（無密碼）、歸屬驗證 |
| **Setup_FateWorld.gs** | 2 | 登入時冪等建表 |
| **Core_Settings.gs** | 17 | 模型設定、`COL` 欄位表、MEMORY 標記工廠、代名詞、狀態字串 |
| **Engine_Combat.gs** | 8 | `callGeminiAPI`（AI 呼叫、繁體轉換、JSON 修復、失敗備援）、`doGet` |
| **History_Sync.gs** | 7 | 對話歷史表 |
| **Router_Persona.gs** | 3 | 人設共用零件（小動作／準則標記、補魔尺度句、性別事實句、創角提示詞長句） |
| **Seed_Codex.gs** | 3 | 種子英靈（英靈殿名冊）、御主名 |
| **Seed_Rivals.gs** | 1 | 兩場戰爭的陣容 |
| **War_Engine.gs** | 76 | ⚔️ 新聖杯戰爭純規則（不碰試算表／AI；Node 模擬器直接載入） |
| **War_Router.gs** | 16 | ⚔️ 存檔、說書、老虎道場、世界書 |
| **War_Forge.gs** | 12 | 🛠️ 英靈工房（新戰爭與鑑賞共用） |
| **Gallery.gs** | 99 | 🌹 鑑賞全部（進場、同伴、在場、時間、提示詞與 `nsfwBaseRules`、回寫、世界帳本、說書人設定、換裝） |
| **Script.html** | 47 | 共用前端：`gasRun`、`aiHtml_`、狀態頁、改命、角色分頁、換裝、設定 |
| **Script_Onboarding.html** | 6 | 登入、處理中遮罩 |
| **Script_Kanshou.html** | 57 | 🌹 鑑賞前端 |
| **Script_War.html** | 39 | ⚔️ 新聖杯戰爭與 🛠️ 工房前端 |
| **Index.html** | 0 | 骨架：依序載 Style／Script／Script_Onboarding／Script_Kanshou／Script_War |

## ActionRouter 註冊表（30 個 action）

| action | handler |
|---|---|
| `account_login` | `actionAccountLogin` |
| `enter_kanshou` | `actionEnterKanshou` |
| `kanshou_reset` | `actionKanshouReset` |
| `backfill_kanshou_ai` | `actionBackfillKanshouAi` |
| `kanshou_companions` | `actionKanshouCompanions` |
| `kanshou_memoir_op` | `actionKanshouMemoirOp` |
| `world` | `actionWorld` |
| `kanshou_summon_hero` | `actionKanshouSummonHero` |
| `kanshou_party` | `actionKanshouParty` |
| `kanshou_set_sex` | `actionKanshouSetSex` |
| `kanshou_get_style` | `actionKanshouGetStyle` |
| `kanshou_set_style` | `actionKanshouSetStyle` |
| `kanshou_set_name` | `actionKanshouSetName` |
| `get_full_status` | `actionGetFullStatus` |
| `update_fate` | `actionUpdateFate` |
| `update_rel_tag` | `actionUpdateRelTag` |
| `kanshou_set_nickname` | `actionSetNickname` |
| `get_heroes` | `actionGetHeroes` |
| `get_tags` | `actionGetTags` |
| `outfit` | `actionSetOutfit` |
| `sync` | `actionSync` |
| `play` | `actionPlay` |
| `war_load` | `actionWarLoad` |
| `war_new` | `actionWarNew` |
| `war_act` | `actionWarAct` |
| `war_narrate` | `actionWarNarrate` |
| `war_quit` | `actionWarQuit` |
| `war_dojo` | `actionWarDojo` |
| `war_forge_list` | `actionWarForgeList` |
| `war_forge_save` | `actionWarForgeSave` |
| `war_forge_ai` | `actionWarForgeAi` |

---

# 逐函式

### Router_Action.gs（11 支函式）

- `sanitizeUserData_(userData)` — 🔴 唯一可信輸入清洗線。去控制/零寬/雙向字元＋擋公式引導字元；`name`/`npcName` 強制純中文（`cleanChineseName`）、其餘 STRICT_NAME 欄去 HTML 斷字字元截 20 字、一般欄截 2000。就地改回並回傳。
- `STATE_PRE_DATA_`（`var`）— handler→dispatcher 整表陣列交棒全域，每次 dispatch 開頭重置。
- `handleGameAction(userData)` — 主進入點/dispatcher。流程：重置 `STATE_PRE_DATA_`→JSON.parse→`sanitizeUserData_`→依 `pcId` 是否 `KPC_` 決定讀「眾生」或「鑑賞眾生」表→查 `ActionRouter[action]`→**pcId 歸屬中央驗證**（2026-07新增：帶 `pcId` 且非 `OWNERSHIP_CHECK_EXEMPT_` 者過 `verifyPcOwnership_(acctName, pcId)`，失敗回「查無御主」——修補近全部 solo action 猜中/枚舉他人 pcId 即可代操作的系統性漏洞）→鑑賞封鎖檢查→取 ScriptLock（非豁免者，8s tryLock）→跑 handler→**14 日時限中央攔截**（solo `PC_` 且回應帶 `clock` 跨第 14 日→補 `defeat`/`deadline`＋時限夢 prompt）→`STATE_AFTER_ACTIONS` 者夾 `_state`（複用 `STATE_PRE_DATA_` 或 `buildClientState_`）→finally 釋鎖。
- `OWNERSHIP_CHECK_EXEMPT_`（2026-07 系統性漏洞修補新增）— 豁免中央 pcId 歸屬驗證的 action 白名單：`account_login`/`account_new_game`/`create`/`enter_kanshou`（pcId 尚不存在）、`claim_hero`/`save_hero`（走 `creator===acctName` 模型）、`get_heroes`/`get_masters`（公開名冊）、`check_name`（不涉個別玩家列）。其餘只要帶 `pcId` 一律先過 `verifyPcOwnership_`。
- `LOCK_EXEMPT_ACTIONS_` — 不取寫入鎖的 action：純讀取 ＋ 長 AI 敘事（`play`/`narrate_only`/`tiger_dojo`/`backfill_*`/`war_narrate`/`war_forge_save` 等）。
- `STATE_AFTER_ACTIONS` — 會改 solo 戰場、回應自動夾 `_state` 的 action（`fate_battle`/`use_seal`/`bond`/`update_fate`/`court_enemy`／`move`… 共 24 個）。
- `resolveCallerGameId_(pcData, pcId)`（2026-07 再稽核抓到漏洞新增；同年再一輪稽核修正回傳語意；`acctName` 參數與 `kanshouOwnedRowIdx_` 反查已隨帳號表 KPC 欄改版移除）— `actionGetFullStatus`/`actionUpdateFate`/`actionUpdateRelTag`/`actionSetNickname`共用的呼叫者身分解析：`pcId`為`KPC_`開頭(鑑賞)走`kanshouPcIdx_`純索引查找，查無回`null`(呼叫端須視同查無此人直接回絕)；solo沿用原本裸`find`行為，**查無此列一律回`null`**(2026-07再稽核修正：原本回`""`，呼叫端只擋`null`、`""`是falsy會讓下游game_id過濾條件整個失效，退化成跨全局姓名/id搜尋——可讀任意玩家狀態甚至竄改任意受害者從者敘事欄，已修正)；「找到列但其GAME_ID欄本身是空字串」(舊資料相容)才維持回傳`""`。修的漏洞：這4支handler原本都只信任裸傳入的pcId，鑑賞context下pcId可預測/枚舉且無密碼，等同完全繞過帳號歸屬驗證，可冒名竄改/讀取任一鑑賞玩家的資料。**同步修前端**：`get_full_status`/`update_fate`/`update_rel_tag`/`kanshou_set_nickname`原本都沒送`acctName`，已在`Script.html`/`Script_Kanshou.html`補上。
- `actionUpdateFate(...)`（2026-07 再稽核：`myGameId`改用`resolveCallerGameId_`取得，見上）— 🔵 逆天改命：只准改 4 敘事欄（trait/pref/back/intent），數值/寶具鎖死。接受 ID 或同行從者名，限本局 game_id；鑑賞（k_）豁免「同行」要求。長度上限 back 80/intent 30/其餘 130。交棒 `STATE_PRE_DATA_`。（2026-07 二度改版拔掉性格鎖：不再接受/處理 `prefLocks`，`kanshouSetPrefLocks_` 已刪除——AI 遊戲中本就不再側寫性格/萌點，鎖定機制失去意義）
- `actionGetTags(...)` — 薄包裝，回 `buildTagsPayload_`。
- `buildTagsPayload_(sheets, pcId, preData?)` — 🔧 左側狀態卡資料建構（get_tags 與 sync 共用）。組御主卡（HP 詞化/令咒/願望/禮裝/換裝）＋在世我方從者陣列（solo 靠「同行」、鑑賞＝本局全部住民＋`party` 旗標），逐從者附六圍/技能/出力/寶具/魔境/符文/synergy/理想鄉/多寶具/海怪/換裝/武裝/破戒奪取旗標＋**`id`**（2026-07 id 化重構新增，供前端 `myActiveServantId` 記錄、日後系統內部指令帶 id 用）。戰鬥限定欄以 `isFateCtx`（g_）結構性擋成 null。另回 economy/bondUsed/mystic/canRuleBreak/鑑賞 locationCounts/~~unlockedResidences~~（已移除）。**七度改版**：`~~unlockedResidences~~（已移除）`改用`kanshouGetHeroHome_`讀住處(原本只認`KANSHOU_HERO_HOME_`，隨機分配到泛用住處池的英靈解鎖不了)。
- `buildClientState_(sheets, pcId, preData?)` — 完整 client state blob。`markRivalsSeen_`（戰爭迷霧，鑑賞跳過）＋狀態字串＋people（鑑賞/solo 分版）＋鄰近地點＋地圖描述＋時鐘/AP＋economy＋`buildTagsPayload_`＋mapNodes，全部沿用同一次整表讀。
- `actionSync(...)` — 薄包裝，回 `buildClientState_`＋success。
- `actionUpdateRelTag(...)`（2026-07 稽核：找列邏輯改委派 `findPcRowIdx_(pcData, myGameId, {name:targetName})`，取代手刻迴圈；再稽核：`myGameId`改用`resolveCallerGameId_`取得，補上鑑賞帳號歸屬驗證，見上） — 重定義關係稱呼：改該 NPC 自己列 REL_TAG。限本局 game_id；solo 要求同行、鑑賞豁免。**2026-07 五度改版＋逐按鍵稽核**：預設標籤依同一張表的 `KANSHOU_REL_TIER_.min` 把關（沒到那一階就選不了那一階；舊版「預設永遠可設」讓好感30點一下『戀人』就繞過門檻，而 ~~`kanshouSyncRelTier_`~~（已移除） 只在 BOND 變動時才跑，純聊天回合會一路掛著），自訂文字(不等於任一預設標籤)需 bond≥~~`KANSHOU_CUSTOM_TAG_BOND_`~~（已移除）(80)——防低好感塞露骨自訂稱呼繞過親密尺度天花板(該文字會字面塞進AI提示詞當既定事實)。交棒 `STATE_PRE_DATA_`。
- `actionSetNickname(userData, pcId, sheets)`（2026-07 五度改版新增；同年稽核：找列邏輯同上改委派 `findPcRowIdx_`；再稽核：`myGameId`改用`resolveCallerGameId_`取得，補上鑑賞帳號歸屬驗證，見上）— 專屬稱呼(REL_MEM`[專屬稱呼]`)手動鎖定入口：同 bond≥80 門檻，通過後過 `sanitizeNickname_`（清 `|｜[]` ＋截20字，與 AI 寫入路徑共用同一支），寫入`[專屬稱呼]${nick}| [稱呼鎖]是`(保留既有`[態度]`段)，讓 `actionPlay_` 的 NPC 寫回邏輯尊重此鎖(偵測到`[稱呼鎖]是`就不再吃`mutual_nicknames`自動覆寫)。交棒 `STATE_PRE_DATA_`。

### Account.gs（3 支函式）

- `findAccountRow_(accSheet, name)` — 在帳號表找某帳號名的列，回 `{idx,row}` 或 null。
- `verifyPcOwnership_(acctName, pcId)`（2026-07 系統性漏洞修補新增）— solo(`PC_`)／鑑賞(`KPC_`)共用的 pcId 歸屬驗證：反查帳號表確認 `pcId` 是否等於該帳號的 `COL.ACC.PC`（`PC_`）或 `COL.ACC.KPC`（`KPC_`）。由 `handleGameAction` 在 dispatch 前對所有非 `OWNERSHIP_CHECK_EXEMPT_` 的 action 統一呼叫，取代原本近 20 個 handler 各自裸 `findIndex` 信任前端 pcId 的系統性漏洞。
- `actionAccountLogin(userData, pcId, sheets)` — 登入：找不到就建立空帳號；有存檔則回可繼續狀態；含敗北殘局防呆（御主 HP=0 或已召喚從者已不在世→purge 並回 ended，needsSummon 判斷尚未召喚）。

### Setup_FateWorld.gs（2 支函式）

- `FATE_SHEET_DEFS` — 6 張分頁的表頭定義（坤圖/眾生/英靈殿/御主殿/帳號/歷史暫存；「鑑賞」GAL 定義已整個從物件字面量刪除，不是留著沒用而已）。眾生 33 欄，關係/時鐘/權柄/因果/史紀/戰史六表已併入列尾。
- `ensureWorldReady_(ss)` — 登入時（`actionAccountLogin`）跑：`CODEX_PERSONA_VER`＋`RESEED_VER` 跟記下的版本不同、或帳號／英靈殿表不見了，才跑一次 `ensureFateSheets_`（冪等建表＋種子更新）；平常只讀一個設定值。取代 2026-09 以前的三顆 DEV 按鈕（`check_sheets`／`dev_resync_codex`／`purge_orphans`，已移除）。
- `ensureFateSheets_(ss)` — 冪等建表主函式：缺分頁則補（含表頭）、已存在只補尾端缺少表頭欄；首建坤圖灌 FATE_MAP_SEED；末尾呼叫 seedFateCodex_＋reseedIfEmpty_。回本次新建分頁名陣列。只由 check_sheets action 手動觸發（不快取、doGet/handleGameAction 不自動呼叫）。

### Core_Settings.gs（17 支函式）

- `OPENROUTER_API_KEY` — IIFE 讀 ScriptProperty `OPENROUTER_API_KEY`（唯一認的名稱，舊別名已砍），無則空字串。
- `MODEL_URL` — OpenRouter chat/completions endpoint 常數。
- `AI_MODEL` — 兩軌共用的唯一主力模型（預設 `google/gemini-3.5-flash-lite`）；ScriptProperty `MODEL` 優先。
- `FALLBACK_MODEL` — 被審查擋下／重試全敗時的後援（預設 `x-ai/grok-4.20`）；ScriptProperty `FALLBACK_MODEL` 優先。由 `callGeminiAPI` 全域自動套用，呼叫端不必傳。
- `COL` — 眾生/英靈殿/帳號各表的**欄位位置索引 schema**（詳見 §COL；含已併入的關係/時鐘/權柄欄與 MONEY/UPKEEP_WEEK/ROOM/MEMOIR 等死欄占位）。
- `cleanChineseName(s)` — 姓名限定純中文（CJK 含擴展 A），濾除英數符號 emoji，上限 10 字；全系統唯一真線。
- `actionGetFullStatus(...)`（2026-07 再稽核：改用`resolveCallerGameId_`＋`findPcRowIdx_`取代裸find/裸findIndex，見上）— 依 `targetName`＋自己 game_id 找該角列，回 `buildPlayerStatusString`＋是否可改命（IS_PARTY==="同行"）。關係併入眾生列，直讀 REL_MEM。
- `buildLiveIdIndex_(sheet)` — 單欄窄讀 ID 欄回 {id → 當下 0-based 列索引}；供豁免寫入鎖的 play/backfill 在 AI 回來後重定位、避開期間刪列造成的錯位。
- `PERSONA_QUIRK_TAG_`／`PERSONA_LOGIC_TAG_`（`makeTextTag_('小動作')`／`('準則')`·Router_Persona.gs）— 🎭 角色演出兩格：怪癖（看得見的習慣／應付不來的領域·兩格頓號分隔）與行為準則（做選擇的方式）。`stampPersonaFlavor_(memory, quirks, logic)` 在召喚建列時蓋上，`getPersonaQuirks_`/`getPersonaLogic_` 讀回，不另寫 regex。⚠ 走 `makeTextTag_` 工廠是為了清洗：這兩個標記 2026-07 之前自己拼字串、AI 吐一個「【」就切壞整條 MEMORY。（~~`PERSONA_SPEECH_TAG_`~~（口吻）已隨 2026-09 自稱/語癖退休一併移除；儲存鍵仍沿用『小動作』是為了不動既有存檔。）
- `getOutfit_(memory)` — 讀當前服裝文字，無則空。
- `setOutfit_(memory, text)` — 寫換裝（過濾分隔字元、限 40 字，空字串＝清除）。
- `clearOutfit_(memory)` — 清換裝。
- `pron_(sex)` — 性別→代名詞（男「他」女「她」，查無一律中性「TA」，寧可中性不猜錯）。
- `pronYou_(sex)`／`PRONOUN_YOU_`（2026-09 新增，`Core_Settings.gs`）— 第二人稱的字：中文的「你／妳」也分性別，別人**當面叫玩家**用的就是這個字。跟 `pron_` 同款從資料算、不在提示詞裡寫死；查無一律回「你」（它本來就兼作通用，猜錯性別比較傷）。
- `TRAIT_SLOTS_`（常數＝**2**）— 特徵格數：外貌本相／氣質舉止。⚠ 2026-09 從 3 收成 2，第三格「卸下心防的私密一面」整組退休（理由見 `CODE_NOTES.md`『TRAIT_SLOTS_』）。舊局存的三、四格由 `traitParts_` 就地剝掉。
- `DAILY_LOOK_SLOTS_`（常數＝3）— `dailyLook` 的段數（外貌本相／氣質舉止／日常口氣）。比 `TRAIT_SLOTS_` 多一段：第三段抽進 `【口吻】` 標記，不進特徵格。
- `traitParts_(raw)` — **讀特徵格的唯一入口**：舊局存的是四格（第3格曾是「自稱與口氣」），自稱併進【口吻】後那格退休，長度 >3 就地剝掉 index 2。前端鏡射在 `Script.html` 的 `traitSegs_`，兩邊要一起改。
- `parseTraitsHelper(data, defaultStr, want?)` — 亂碼特徵粉碎器；正規化陣列/物件/字串、剝 AI 雞婆標籤與數字、句號→頓號，切成固定 `want` 格（省略＝4；TRAIT 一律傳 `TRAIT_SLOTS_`＝3）。缺格從 defaultStr 對應段補、再退「無」；defaultStr 的段數要跟 `want` 對齊，否則補出來的格會錯位。
- `looksToTraitParts_(rawLook)` — 把種子 persona.look 拆成「末段＝氣質、其餘合併為外貌」，組出**兩格**骨架餵給 `parseTraitsHelper`。⚠ 2026-09 不再補第三格「卸下心防時的柔軟一面」。
- `kanshouRestBody_(pcData, idx)` — 睡一覺回到如常：把該列 `PHYSICAL` 設回 `{"狀態":"如常"}`。唯一呼叫點＝鑑賞的【一天結束】（玩家本人＋所有正式同伴，各自 `dirtyPcRows.add`）。⚠ 肉體狀態是「此刻」的東西：AI 沒吐 `physical_state` 的回合不會覆寫它，不清就會一路跟著人走好幾天。
- `mergePhysicalStatus(oldJson, newVal)` — 合併 physical_state（現只單一「狀態」鍵）；解析失敗當空物件確保 newVal 一定套用。
- `buildPlayerStatusString(selfRow, relMem)` — 組 `§` 分隔的下傳狀態串；MEMORY/relMem 內 `|` 轉義為 `@@@`；慾海(K系id)以肉體狀態填外顯格、solo 留空；含九州廢欄占位。已移除 `getFreshStatusString`(整表重讀版)——各 handler 改直接對記憶體中的 pcData 呼叫 `buildPlayerStatusString`，省一次整表讀。
- `SEED_CACHE_SECONDS_` — 靜態種子表快取時數常數（21600＝6 小時）。
- `getHeroCodexCached()` — 英靈殿名冊；先讀 ScriptCache，未命中才讀「英靈殿」分頁並快取 6 小時（唯一仍需持久化的動態種子表，因工房可寫原創英靈）。

### Engine_Combat.gs（8 支函式）

- `callGeminiAPI` 的 payload 自 2026-09-23 起一律帶 `reasoning:{effort:"none",exclude:true}`（`config.reasoning` 可覆寫）：會思考的模型思考 token 算在 max_tokens 裡，開著就截斷。模型回 400「Reasoning is mandatory」就退到 `low` 再送一次並加回 `REASONING_ALLOWANCE_`。探針 `reason.js`。
- `toTaiwanTrad_(text)` — 簡體／舊字形→台灣正體，逐字一對一換（字表 `TRAD_MAP_SIMP_`／`TRAD_MAP_TRAD_`，只收 check_simp.py 字表裡的字：簡體＋舊字形＋日本新字體，多對一的字刻意不收）。`callGeminiAPI` 兩條出口（散文／JSON 字串）回傳前都過一次，兩軌都吃到。探針 `trad.js`。
- `repairAiJson_(raw)` — 模型回的 JSON 壞掉時的修復：①字串裡的真換行／控制字元轉義；②還是不行就用正則撈 narration／options／scene 重組。回修好的 JSON 字串，連 narration 都撈不到（或 <20 字）回 null。`callGeminiAPI` 在 `JSON.parse` 失敗時先叫它，救得回來就不必花重試／後援那一顆。探針 `jsonfix.js`。
- `logCacheUsage_(model, usage, systemContent, result)` — 把每次 AI 呼叫的快取命中寫進 Logger（零 I/O）：cached_tokens 長期為 0 就代表 system 前綴沒吃到快取。
- `cheapHash_(str)` — 一串字的短指紋（非密碼學），只為了比對兩次呼叫是不是同一份前綴。
- `aiFallbackNarration_(isBlocked)` / `aiFallbackData_(isBlocked)`（2026-07 邊界稽核抽出）— 生成失敗保底文字與 `_genFailed` 旗標的**單一真實來源**。除了 `callGeminiAPI` 自己，`actionPlay_` 解析 AI 回應失敗時也走 `aiFallbackData_`：模型吐到 max token 就斷（截斷 JSON）或回純文字道歉是常態，舊版直接 `JSON.parse` 一失敗就丟例外，而 `handleGameAction` 的 try 只有 finally、沒有 catch，例外會一路穿出去變裸錯誤。
  - `attemptWithModel_(model)`（`callGeminiAPI` 內部函式）— 單一模型的完整重試迴圈（`config.retries||5` 次，2026-07 玩家反饋審查攔截時想多試幾次·由 3 調到 5）。逐次 `UrlFetchApp.fetch(MODEL_URL)`；把 `result.error`（含 `PROHIBITED_CONTENT/SAFETY`）與 `finish_reason==content_filter/SAFETY`／空 message 統一丟 `Triggered_NSFW_Filter`；首次觸發審查改掛 `softenSuffix`（更含蓄筆法）重送、`Utilities.sleep(2000)` 退避。回成功文字或 null。
- `doGet()` — GAS Web App 進入點：回傳 `Index` HTML 模板（設標題「命運停駐之夜」＋行動裝置 viewport）。不自動建表（建表與種子更新在登入時由 `ensureWorldReady_` 處理）。

### History_Sync.gs（7 支函式）

- `trimRowsByOwner(sheet, pcId, keepCount, idColIndex0Based)` — 只保留某 pcId 最新 keepCount 列，超量刪最舊（由後往前刪）。
- `saveGameHistoryBatch(pcId, entries)`（2026-07 補短暫鎖）— 批次 append 對話列 `[時間,pcId,speaker,content]`，寫後 trimRowsByOwner 保 40 句。此函式的呼叫端（`narrate_only`/`play`）在 dispatcher 層是刻意的 `LOCK_EXEMPT_ACTIONS_`（AI 敘事耗時、鎖全域會拖累其他玩家），但本函式本身是無鎖的 read-modify-write，理論上同一 pcId 兩次幾乎同時的呼叫窗口重疊會互相覆蓋。已補：只圍著這一支快函式取 4 秒短暫 `LockService.getScriptLock()`，搶不到鎖則退回原本無鎖行為（不劣於修復前，多數情況下優於修復前）。
- `escapeHtml_(str)` — HTML 跳脫（&<>"'）；儲存型 XSS 輸出端防護。
- `readRecentPlayerRows_(pcId, limit)`（2026-07 稽核抽出）— 共用「讀最後1000列→篩該pcId→取最後limit筆原始row」（2026-09：不夠 limit 筆就只掃 ID 欄往回補，回鍋玩家不再拿到空歷史），`getGameHistory`/`getGameHistoryBatchRaw` 都改呼叫它取資料後各自做HTML渲染或物件映射，取代兩處重複的讀表+過濾邏輯。
- `getGameHistory(pcId, pcName)` — 讀最後 10 句渲染成 HTML（先跳脫再轉<br>，相容舊字面 <br>）；player/ai 兩種樣式。
- `purgeHistoryForPcIds_(pcIds)` — 結束局時清掉這批 pcId 的所有歷史列（防表無上限成長擠出讀取窗口）。
- `getGameHistoryBatchRaw(pcId, limit)` — 取最後 limit 句回 raw `{speaker,content}` 陣列（給 AI 上下文用）。

### Router_Persona.gs（3 支函式）

- `getPersonaLogic_(memory)` — 讀【準則】（做選擇的方式）。
- `stampPersonaFlavor_(memory, quirks, logic)` — 召喚建列時把種子怪癖/準則附加到 MEMORY 尾（有值才附，各截 40）。
- `QUAD_EMPTY_`（常數） — 防禦性過濾：清掉 AI 誤 echo 的 ★指令與〈演出卡〉；**刻意不清【標籤】**（fallback 文案靠它當視覺標籤）。
- `sealGenderFact_(masterSex, svSex, svName)` — 令咒補魔 NSFW 用性別配對事實（異/無按女性向處理）：女女→禁陽具插入描寫、無固定插入方；其餘→依各自實際性別合理呈現。與 kanshou Gallery.gs 邏輯類似但**完全獨立不共用**（紅線① solo/kanshou 隔離）。
- `AURA_SPEC_` — 氣質格寫法規格（五處生成提示詞共用·單一真實來源）：第一眼撞見的氛圍意象、可帶淡氣味，**禁**常態舞台指示與孤立形容詞。`check_seed.py` 第⑪條驗每個氣質格提示詞都有接上它。

### Seed_Codex.gs（3 支函式）

- `SEED_SERVANTS` — 種子從者名冊，**現況 25 筆**：正職戰鬥從者 14 騎（第五次 8：阿爾托莉雅/EMIYA/庫丘林/美杜莎/美狄亞/佐佐木小次郎/赫拉克勒斯/咒腕之哈桑；第四次 6：吉爾伽美什/迪盧木多/伊斯坎達爾/吉爾德萊/百貌哈桑/蘭斯洛特）＋客串戰鬥 6 騎（恩奇都、斯卡哈-Lancer、斯卡哈-Assassin、美遊、小黑、伊莉雅）＋鑑賞專用「御主」職階 5 位（遠坂凜/伊莉雅絲菲爾/間桐櫻黑化/衛宮士郎/藤村大河，cls='御主' 只供鑑賞召喚、solo 白名單擋下、six/技能/寶具留空）。每筆含 six/classSkills/skills/traits/np/persona（含 dailyLook/dailyOutfit/dailyWords/dailyBack/dailyMoe 鑑賞日常欄）。
- `SEED_MASTERS` — 種子御主名冊，**現況 15 筆**（第五次 8：士郎/凜/慎二/臟硯/葛木/綺禮/伊莉雅絲菲爾/櫻黑化；第四次 7：切嗣/時臣/肯尼斯/韋伯/龍之介/綺禮/雁夜）。每筆含 circuits/melee/magic_rank/home/wish/persona/back/moe。
- `HERO_PERSONA_OWN_COL_`（常數）— 已有專欄、不可以再塞進 PERSONA JSON 的 persona 鍵（dailyLook/dailyWords/dailyMoe/dailyOutfit）。
- `servantToHeroRow_(s)` — 從者物件→英靈殿列（順序＝COL.HERO，含 4 個日常快取欄），source='seed'。⚠ 2026-09：PERSONA 欄寫的是**剔除過 `HERO_PERSONA_OWN_COL_` 的那份**（daily 四欄各有專欄，不再存兩份；`dailyBack` 沒有專欄所以留在 JSON 裡）。
- `CODEX_PERSONA_VER = 'v74'` — 種子人設版本，精緻化 persona 就升版觸發升級管線。逐版校對細節（v65~v69）不再堆積於此處註解、存檔於 `SOLO_REFERENCE.md` §21。
- `upgradeCodexPersonas_(ss)` — 升級既有英靈殿：整列依種子重寫（ID 對應、只刷 seed 英靈不動 ai_gen）＋補入新種子英靈＋淘汰孤兒（ID 不在 SEED_SERVANTS 且 source=='seed' 才刪，由下往上）。清 FATE_HERO_CODEX 快取。回更新筆數。
- `seedFateCodex_(ss)` — 英靈殿/御主殿為空（只有表頭）時自動灌名冊；版本升級時（codex_persona_ver≠CODEX_PERSONA_VER）跑三支升級函式並蓋版本旗標。ensureFateSheets_ 末尾呼叫。

### Seed_Rivals.gs（1 支函式）

- `safeJson_(s, dflt)` — try/catch JSON.parse，失敗回 dflt。
- `FATE_5TH_ROSTER` — 第五次正典陣容，**9 組**（含慎二+吉爾伽美什第3天延遲登場、佐佐木小次郎 master:null 孤身從者、Rider 配黑化櫻等本作偏移）。
- `FATE_4TH_ROSTER` — 第四次正典陣容，**7 組**（Fate/Zero）。

### War_Engine.gs（76 支函式）

- `WAR_BOUNTY_`／`warBountyStart_(st, ev)`／`warBountyEnd_(st, e, mine, ev)`／`warBountyOn_(st, e)` — 教會討伐令：第 `WAR_.BOUNTY_DAY` 天早上指定 Caster（原作的懸賞），公開位置；你親手打倒多一劃令咒，別人打倒就撤銷；目標不在場就整局不發。`st.bounty`＝`{id, open}`。
- `WAR_FINAL_`／`warFinal_(st)` — 最後一夜在哪（第五次柳洞寺、第四次冬木市民會館）與進場、下一位上場的句子；按鈕、事件、講評都讀這裡。
- `WAR_PACE_`／`warPace_(st)` — 每場戰爭各自的節奏：`brawl`＝敵人夜裡撞見彼此時動手的機率（乘個性的出手慾），`warTick_` 讀。
- `warClass_(cls)`／`warFoe_(st, id)`／`warArrived_(st)`／`warKnownFoes_(st)`／`warAliveCount_(st)`／`warLocName_(loc)` — 查詢。
- `WAR_TEMPER_`／`warTemper_(e)`／`warAggr_(e)` — 敵方從者的原作性格（鍵＝英靈殿 ID）蓋在職階個性上：小次郎守山門（不夜襲你、不撤退）、吉爾伽美什傲慢（出手慾低、不撤退）、庫丘林奉命偵察（先試探、打不贏就撤）、蘭斯洛特見到阿爾托莉雅就找上門、百貌哈桑找據點快兩倍；`meet` 是交手時的開場一句（不寫真名）。
- `warSkRows_(u)`／`warSkOk_(row, hook, foe)` — 這個單位的技能列／這一列在這個時機對這個對手生不生效。
- `warMul_(u, hook, foe)`／`warAdd_(u, hook, foe)`／`warFlag_(u, hook)` — 讀表三支：把技能在這個時機的數字相乘／相加／有沒有。引擎只透過這三支碰技能。`warNpCd_(u)` — 放完寶具的冷卻夜數（`NP_COOLDOWN`＋技能的 `npCd`，至少 1）。`warSkName_(u, hook)` — 提供這個時機的是哪個原作技能名（事件文字要念出來；沒有就回「技能」）。`warMul_` 另外看攻擊方的 `pierce`（神代魔術）：針對職階的減傷只剩一半效果。`warSkRows_` 在 `u.broken`（被破戒全咒打中）時回空陣列。`warSkOk_` 另認 `fromSex`（只擋這個性別的攻擊）與 `vs`（只對帶這個旗標的對手加傷）；對手帶 `nullDef`（破魔紅薔薇）時挨打方的減傷整個不算。`warLives_(u)` — 十二試煉還剩幾條命（舊存檔沒這格就照技能現算；被破戒時命數照樣在，只是加護失效）。
- `warRank_(r)` — 階級→數字（E1…A5、EX7，±0.4）。`warSpread_(v)` — 階級差距打折（`STAT_SPREAD`）。
- `warSkillsOf_(seed)` — 種子技能 → `{fx:[表上有的 fx], names:{fx: 原作技能名}, lore:[逸話技能名]}`（同一列只收一次；表上沒有的是逸話，跟寶具同名的不列）。`warTraits_(u)` — 畫面用清單：有效果的寫「技能名：效果」（十二試煉附剩幾次），逸話寫「名（逸話）」。
- `warUnit_(seed, extra)` — 種子→戰鬥單位（寶具威力看 `seed.npRank`（實際會放的那一招），沒有才看六圍的寶具；`seed.npPassive`＝常駐型寶具 → `u.noNp`，沒有寶具鈕、敵人也不會放；`sk`＝這位從者自己的技能效果；`card` 帶說書用的外貌／性格／寶具原文 `np`／喜惡條目 `book`，不進規則）。`warNpName_(np)` — 寶具名（剝掉原文與括號）。
- `warRand_(st)`／`warPick_(st, arr)`／`warClamp_(v, a, b)` — 亂數與夾值。
- `warNewGame_(o)` — 開局。`o`＝`{pool, roster, seeds, masterNames, name, sex, war, seed}`（`warSeedCtx_` 組好）；停在 `summon`。
- `warSummon_(st, o)` — 抽從者並重建敵方陣容（抽到的從陣容拿掉）；重抽也走這支。
- `warButtons_(st)` — 這一刻能按的鈕（唯一真實來源：前端照畫、`warAllowed_` 照驗）。每顆 `{t, id?, s?, label, sub, sealSub?, dis?, sealOk?}`。
- `warAllowed_(st, act)` — 按的東西不在 `warButtons_` 裡就擋；令咒另看剩幾劃；御主的血付不起 `SEAL_NP_COST` 就不能硬放寶具。
- `warAct_(st, act, o)` — 做一個決定，就地改 `st`，回 `{ok, msg, ev:[{k, txt, num}]}`；`txt` 給 AI（不含數字），`num` 給畫面。`o`＝名冊（`warSeedCtx_`），只有重新召喚要用，沒給就拒絕重抽。
- `warDoSummon_(st, act, ev, o)`（重抽走 `warSummon_(st, o)` 真的換人）／`warDoDay_(st, act, ev)`／`warDoNight_(st, act, ev)`／`warDoRound_(st, act, ev)` — 四個階段各一支。
- `warReveal_(st, e, ev)` — 看穿真名（intel→2）。 對手帶 `veil`（風王結界）時看不穿，改推一句「看不出是誰」。
- `warUnmask_(st, e, ev)` — 假死的那位露餡（`e.fake`→false）並推一句早報；`warStartBattle_` 與 `warAutoBattle_` 開打時都會叫。陣容上帶 `fakeDeath` 的那組（第四次的百貌哈桑）開局就標假死，開戰那天推原作的死訊。
- `warFinishNight_(st, ev)` — 敵人行動（`warTick_`），沒人找上門就進早晨。
- `warTick_(st, ev)` — 每位敵人一次：可能發現你的據點、夜襲你（只在你固守時、一夜一位）、找別人打、或休息；倒下的人越多、剩下的越急著找人。有人夜襲就回 true 停下來開打。
- `warMorning_(st, ev)` — 先把昨夜沒人倒下的交手（`k:'draw'`）併成一句早報，再充能減一、天數加一、登場消息、時限保險。
- `warStartBattle_(st, e, ctx, ev)` — 開打；`ctx`＝sortie／patrol／defend／final。氣息遮斷的出擊第一擊、陣地作成的魔術陣（雙向：你守家、或你闖進對方陣地）在這裡生效。
- `warSetIntent_(st, e)`／`warIntent_(st, me, foe, round)` — 敵人這回合想做什麼（先決定、存起來；看得到預兆就能應對）。
- `warFinalMelee_(st, ev)` — 決戰地的混戰：剩兩位以上的敵人先兩兩交手一輪（`warAutoBattle_`），活下來的帶著傷輪到你（寶具在混戰後重新備好）；討伐令目標死在混戰裡照樣撤銷；假死的那位在混戰裡露餡，那句照樣推給玩家。
- `warEndBattle_(st, ev)` — 戰鬥結束（雙方的 `broken` 清掉，破戒只到這場為止）；決戰接下一位。
- `warExchange_(st, A, Z, ev)` — 一回合的交手（撤退→寶具對轟→奇襲方先手→寶具→快的先打），玩家對敵與敵對敵共用。
- `warStrike_(st, X, Y, ev)`／`warApply_(st, Y, d)`／`warMasterHit_(st, n, ev)` — 出手、扣血、御主被餘波捲到。`warStrike_` 在出手方身上標 `struck`／放了寶具標 `fired`（對轟兩邊都標），`warDoRound_` 只認這兩個旗子：真的放出寶具才曝光真名、算寶具次數；真的看見對方寶具才認出真名；試探真的出了手才看穿；令咒真的用上（或撤退成功）才扣。守家倍率：自家據點 `home`＝HOME×陣地作成，被闖進自己的陣地 `lair`＝只乘陣地作成；帶氣息遮斷來夜襲的敵人一樣先手（`battle.foeAmbush`）。`warApply_` 本該倒下卻沒倒時回 `'life'`（十二試煉死而復生，餘勁會連殺數條命，`u.lastLost` 記這一擊用掉幾條）或 `'stand'`（lastStand 撐住）；呼叫端在自己那句之後補 `warStoodEv_(st, Y, ev, how)`（念出技能名）。寶具遇到對方試探會減半，帶 `npSure`（刺穿死棘之槍）的不減；正面攻擊的命中率加上 `hitUp`（燕返）。
- `warBreak_(st, X, Y, ev)` — 寶具帶 `breakFx`（破戒全咒）打中對手：對手這場戰鬥技能全失（`Y.u.broken`），推一句事件。開戰時（`warStartBattle_`／`warAutoBattle_`）兩邊的 `broken` 都清掉。
- `warAutoBattle_(st, a, b, ev)` — 敵對敵，最多三回合；有人倒下直接寫進早報，沒人倒下的交給 `warMorning_` 併句（兩位同職階都沒看穿時寫成「另一位」）。
- `warHitChance_(x, y)`／`warMult_(X, Y)`／`warNormalDmg_(st, X, Y)`／`warNpDmg_(X, Y)`／`warRetreatChance_(u, o, seal)` — 命中、倍率、傷害、撤退。`warMult_` 看穿真名或帶 `weakAlways`（王之財寶）就乘弱點；`warRetreatChance_` 遇到對手的 `lock`（天之鎖）而自己帶那個旗標（神性）時回 0（令咒除外）。
- `warHeal_(u, pct)`／`warHealMaster_(st, n)` — 回血。
- `WAR_CANON_EVENTS_`（Seed_Rivals.gs）／`warCanonEvents_(st, ev)` — 早報裡的原作事件：到了那一天、涉及的從者都還是活著登場的敵人才發生；效果只有看穿（`reveal`）與搬據點（`move`）。`warMorning_` 叫。
- `warShownCount_(st)` — 畫面上看得到的敵人數（假死的不算）；早報、畫面、決戰按鈕用它，勝負照樣看 `warAliveCount_`。`warKnownFoes_` 也排除假死的（不能突襲一個「已退場」的人）。
- `warOdds_(st, e)` — 勝算四階（勝算大／勢均力敵／勝算小／凶險）。`warOddsR_(st, e)` — 背後的比值（我撐幾下 ÷ 對方撐幾下，血量用 `warEffHp_(u)`：十二試煉的命也算進去）；夜晚出擊目標照「討伐令→這個比值」排序，前 `WAR_.SORTIE_SHOW` 位直接列，其餘帶 `more: true`。
- `warFinalNext_(st)` — 決戰下一位（血最少的先上）。
- `warFoeLabel_(e)`／`warWho_(st, S)`／`warHpWord_(u)`／`warHurtWord_(u)`／`warChanceWord_(p)` — 文字（照玩家知道多少顯示）。
- `warCheckEnd_(st, ev)`／`warOver_(st, win, cause, ev)` — 勝負；`warOver_` 把致命那一場的對手、看穿程度、出擊時血量、有沒有硬吃預兆記進 `result`。`warStat_(st, k)` — 戰績計數加一（舊存檔沒有的欄位從 0 起算）。
- `warFoeCard_(st, e)` — 一位對手在畫面上的情報：intel 1 給職階、位置、傷勢、勝算；intel 2 才加真名、御主、寶具（可不可以放）、技能。
- `WAR_DOJO_LOSS_` — 「輸在哪」表：由上往下第一條成立的（御主倒下／決戰打到天亮／致命那一場硬吃寶具預兆／沒看穿真名／帶重傷出擊／決戰夜人太多／令咒沒用／真名早曝光／一般落敗），各帶一句事實＋下一局只改的那一件事。`WAR_DOJO_GOOD_` — 亮點表（成立的全列，最多三條）。
- `warDebrief_(st)` — 賽後一整包 `{win, day, stats, good, key?, fact?, lesson?}`；畫面的終局卡與老虎道場讀同一份。`warRevealed_(st)`（看穿幾位）／`warFill_(t, o)`（`{名字}` 代換）。
- `warRules_(st)` — 畫面說明要引用的規則數字（夜數、令咒、回合、寶具回魔、補魔、令咒硬放寶具的御主代價 `sealNpCost`），前端不另寫一份；給了 `st` 再加這場戰爭的決戰地點 `finalPlace`（`war_load` 沒開局時不給 `st`）。
- `warView_(st)` — 畫面看得到的樣子：藏起玩家還不知道的真名／位置，附上 `buttons`、`result`、`rules`（`warRules_(st)`），終局再附 `debrief`（`warDebrief_`）。

### War_Router.gs（16 支函式）

- `WAR_NARR_FACTS_MAX_`／`WAR_KIND_RANK_` — `actionWarAct` 發現上一段還沒被說書接走（沒講過、也沒在講）就把它的事實併進這一段（上限幾句、種類取較重的）；`actionWarNarrate` 開講前先在說書那格記 `inflight`，講完收掉；AI 沒回就回空字串、這段事實併進下一段。
- `warSheet_()` — 聖杯戰局分頁（沒有就建）：帳號／局ID／更新／戰況 JSON／說書 JSON。
- `warLoad_(acct)` — 這個帳號那一列 `{sh, row, st, narr}`。`warSave_(ref, acct, st)`／`warSaveNarr_(ref, acct, gid, narr)` — 戰況與說書分兩格寫（說書不取鎖、戰況取鎖，互不覆蓋）。說書那一格寫的當下重新找「這個帳號、這一局（gid）」在第幾列：等 AI 期間別人刪列不會寫進別人那一列，這局已放棄或重開就不寫。
- `warSeedCtx_(war)` — 引擎要的種子（從者池、陣容、名字表）。`warLogLines_(ev)` — 事件→畫面行。
- `actionWarLoad`／`actionWarNew`／`actionWarAct`／`actionWarNarrate`／`actionWarQuit`（簽名 `(userData)`）— 五條路由。`war_act` 的 `act` 只收 `t/id/s/seal` 四鍵、照白名單驗。`war_load` 沒有戰局時也回 `rules`（開局表單要用）。
- `actionWarDojo(userData)` — 🐯 老虎道場：終局才開；`warDojoPrompt_(st)` 帶戰績、輸在哪與下一局（或亮點），system＝`WAR_DOJO_SYS_`（大河＋伊莉雅的對話）；結果存在說書那一格的 `dojo`（同一局回快取，AI 沒回就不存、下次重試）。
- `WAR_WORLD_BOOK_` — 冬木地點與戰爭規矩的觸發條目。`warLoreEntries_(st)` — 世界書＋我方從者的喜惡（種子 `book`）＋場上每一位的寶具原作描述（不寫持有者）。`warLoreStr_(st)` — 這一段事件文字碰到的條目（走鑑賞的 `loreHits_`，上限 `KANSHOU_LORE_MAX_`）→ 一行，沒有就空字串。
- `warNarrPrompt_(st)` — 說書提示詞：從者卡（look／words／toMaster）、御主、對手（知道真名才給外貌）、此刻（事情發生的那一天、那個時候：`actionWarAct` 在結算前記下 `narr.day`／`narr.when`，時段查 `WAR_WHEN_`；召喚寫「開始前的那一夜」）、【這一段發生的事】、碰到的原作設定（`warLoreStr_`）、篇幅＋召喚／開戰的重點（`WAR_SCENE_`）；補魔段接 `sealGenderFact_`＋`LEWD_EXPLICIT_`。system＝`WAR_NARR_SYS_`。

### War_Forge.gs（12 支函式）

- `WAR_FORGE_`（階級、算點的四組 `COST`、預算 18、技能上限 3、字數上限、六圍名、七職階）、`WAR_FORGE_SKILLS_`（能挑的技能：每個效果列一個代表名，存檔時技能名可以自取）、`WAR_FORGE_ORIGINS_`（出處三種：Fate 角色／其他作品角色／原創，各帶 AI 的角色框定 `frame` 與技能命名規則 `skill`）。
- `warHeroSheet_()`／`warIsOriginal_(row)`（SOURCE≠seed）／`warCreatorOf_(row)`（persona.creator）。
- `warSixPts_(six)` — 點數：攻擊（筋力、魔力取高）＋耐久＋敏捷＋寶具（至少 `WAR_.NP_FLOOR`），每格價錢＝`warRank_`（E1…A5、EX7）；幸運不算。`warRankPts_()` — 每一階的價錢（給前端，前端 `warFePts_` 照同一條式子算）。
- `warForgeRank_(r)` — 舊作的階級（A+、B-）→ 工房的六階取字頭。`warForgeFx_(f)` — 種子 fx → 工房清單上同一列的代表（心眼→直感、十二試煉→戰鬥續行），新規則沒有的回空。
- `warSeedFromRow_(row)` — 英靈殿一列 → 引擎吃的種子形狀（跟 SEED_SERVANTS 一樣），新聖杯戰爭召喚原創時用。
- `warOriginalsFor_(acct)` — 這個帳號叫得到的原創：自己做的＋無主的（舊工房留下的，改了就歸你）。
- `actionWarForgeList(userData)` — 回原作名單、我的原創（六階已正規化、技能換成工房代表、`names`＝自取的技能名、`lost`＝新規則沒有效果的舊技能名）、可挑技能（名字＋效果說明）、各職階自動附的技能、出處 `origins`、規則（含 `pts`／`cost`／`npFloor`／`skillNameMax`／`descMax`）。
- `warForgeCheck_(b, editing)` — 驗表單：真名要有中文、不可撞原作名、職階（改既有的一位時這三項不驗，真名職階照表上那一列）、六圍各一階且點數 ≤ 預算、寶具名、技能 ≤3 且在表上、技能名（`names`，沒填就用代表名）；文字剝掉開頭的 `= + - @`（擋試算表公式）與反斜線。
- `actionWarForgeSave(userData)` — 新做（ID＝真名-職階）或改自己的（真名、職階鎖住）；職階技能照 `FORGE_CLS_SKILLS_` 自動附；
  外貌／性格有變就用 `translateLookToDaily_`／`translatePersonalityToDaily_` 翻出鑑賞的日常三格；清英靈殿快取。
- `actionWarForgeAi(userData)` — ✨ AI 幫我做：`{origin, cls?, desc}` → 叫 AI 照出處寫一份從者草稿（`warForgeAiSys_(og)`／`warForgeAiPrompt_(desc, cls)`），`warForgeDraft_(o, cls)` 收斂後回 `{hero}` 給前端填表；**不存檔**，存檔照常走 `war_forge_save`。
- `warForgeFit_(six)` — 六圍收進點數上限：超過就從最高那格往下降，不到就把最突出的那格往上加（到 A 為止），剛好用完為止。`warForgeDraft_(o, cls)` — AI 回覆 → 表單草稿：效果碼只收清單上的、去重、最多三個；名字照工房長度剪、剝掉公式開頭與符號。
- `FORGE_CLS_SKILLS_`（var）— 職階技能慣例表(工房自動附贈、不占 3 槽)。

### Gallery.gs（99 支函式）

- `sanitizeAiData_(aiData)` — 寫回試算表前的 AI JSON 輸出守門：非物件/陣列直接拒絕，`rel_changes[].fav_change` 夾在 -100~100；`options` 夾成「≤6 個字串、每個 ≤60 字」（這欄原樣轉發前端、一字串一顆按鈕，舊版無上限，模型失控時會長出一整片按鈕牆）。**2026-09 再加兩件**：①`options` 剝掉鷹架——schema 用「1. [主動]…」教 AI 出四種走向，那串編號與分類標籤卻原樣變成按鈕文字、按下去又回灌成【玩家意圖】（半形全形、任一順序都剝，迴圈剝到不再變動）；②`narration` 過 `stripLeakedScaffold_`（solo 早有、鑑賞這條路徑漏了），**先把真實換行轉成 `<br>` 再濾**——濾網掃到下一個「<」為止，沒有 `<br>` 會把整段吃光。③`world_note` 擋結構（合法類別、最多 `KANSHOU_WORLD_WRITE_MAX_` 筆）——那是 AI 唯一能新增「世界內容」的管道，所以邊界擋在最外層。`actionPlay` 唯一呼叫者，solo 不用。
- `linkAccountToKanshouPc_(accountName, kpcId)` — 把鑑賞 avatar 的 kpcId 寫進「帳號」表 `COL.ACC.KPC` 欄；查無帳號列則 appendRow 新建。權威連結存伺服器端，只服務鑑賞（solo 走 `linkAccountToPc_`/`COL.ACC.PC`，互不通）。
- `getAccountKanshouPcId_(accountName)` — 查某帳號目前連結的鑑賞 avatar pcId，查無回 ""。
- `kanshouPcIdx_(data, pcId)` — 在鑑賞 pcData 裡把 pcId 換成列索引，查無回 -1。**純索引查找、不驗歸屬**：歸屬驗證已上移到 dispatcher（`handleGameAction` → `verifyPcOwnership_`），handler 進來時 pcId 已保證屬於呼叫者。（舊版每支 handler 各自呼叫的 `kanshouOwnedRowIdx_` 已刪除——那是同一趟請求裡的第二次整表讀。）
- `kanshouIsAlly_(row, gameId)` — 「正式同伴」的唯一定義：這一局（gameId）、faction＝從者、不是 DEAD_ 列。
- `getKanshouPcSheet_(ss)` — 取（無則建）鑑賞專屬分頁「鑑賞眾生」，與主「眾生」隔離、schema 同（COL.PC 位置一致）。dispatcher 見 pcId 以 KPC_ 開頭即把 sheets.pc 指到此表。
- `kanshouDailyTranslateCall_(prompt, sys, apiOpts, resultMapper, fallbackValue)` — 日常翻譯三支共用的 try/callGeminiAPI/catch 殼：resultMapper 把回應轉成結果，任何一步失敗就回 fallbackValue。
- `translateLookToDaily_(name, cls, rawLook, firstP, speech, sex)` — AI 把戰時外貌轉成日常版 `{look, outfit}`。⚠ 2026-09 簽名少一個參數（`dailyMoeHint` 隨「私密一面」一起退休）；`look` 從**四短句改成三短句**（外貌本相／氣質舉止／日常口氣），出口一律 `parseTraitsHelper(..., DAILY_LOOK_SLOTS_)`。
- `translatePersonalityToDaily_(name, cls, rawWords)` — AI 把戰場語境的性格短句轉成日常版四句。⚠ 2026-09 簽名少一個參數：`lookPrivateHint` 是用來跟「私密一面」去重的，那一格已整組退休。
- `getDailyHeroFields_(heroRow, p)` — 純讀 HERO 列的 DAILY_LOOK/WORDS/MOE/OUTFIT 快取，查無退回原始戰時 look/words/moe（「・」→「、」）；不呼叫 AI。
- `heroToKanshouRow_(heroRow, gameId, loc)` — 核心建列器：把 HERO 列轉成鑑賞 PC 列（KHV_ 前綴）。用日常稱呼當 NAME、讀日常版 look/words/moe/outfit、身世留空（種子經歷 2026-09-23 退休，那格只給玩家自己改命）、起始 BOND=10「點頭之交」、不寫戰鬥欄/IS_PARTY/PHYSICAL。被召喚/起始住民共用。**七度改版**：建列尾聲檢查`KANSHOU_HERO_HOME_[heroRow[COL.HERO.ID]]`，查無專屬豪邸就從~~~~`KANSHOU_GENERIC_HOME_POOL_`~~~~隨機抽一間、用`setKanshouHeroHome_`寫進`【住處】`記憶標記——這是新英靈唯一的建列入口，此處補一次即涵蓋召喚與起始住民兩條路徑。 ⚠ 2026-09 加蓋 `KANSHOU_SRC_TAG_`（【英靈源】＝來源種子 id），撞名守門靠它認人。
- `KANSHOU_NOTED_TAG_`／`KANSHOU_NOTED_SEP_`／`KANSHOU_NOTED_CAP_`／`KANSHOU_NOTED_LEN_`／`kanshouKnownTier_(metCount)`／`kanshouKnownOfYou_(memory)`（2026-09 新增，`gas/Gallery.gs`）— 「她眼中的你」：只剩 `noted`（2026-09-23 距離那句整組拿掉）。`kanshouKnownTier_` 查 `KANSHOU_FAMILIAR_TIERS_`（**與相處基調共用同一條軸、不另立門檻**）；`kanshouKnownOfYou_` 回 `{say, noted[]}`（2026-09 拿掉沒人讀的 `tier`），`noted` 是 `【眼中的你】` 標記以 `／` 切開的清單（**分隔符不可用 `｜`/`【】`**，`makeTextTag_` 會剝掉）。掛在 `partyDetailsArr` 每人自己那行（`pKnownStr`），格式 `你在○眼中:<熟悉段>[·<筆記>]`——**沒筆記就只印熟悉段**。⚠ **刻意沒有「各段是什麼意思」的定義表**：初識/混熟/老交情 是模型天生就懂的詞，寫三段定義去教它＝玩家說的「追加設定、增加雜音」（第一版真的寫了 225 字，被擋下來砍掉）。
- `KANSHOU_MET_COUNT_TAG_`（makeIntTag_『相處』）／`KANSHOU_FAMILIAR_TIERS_`（四階·老交情50+／熟稔30+／混熟12+／初識，單位＝同場回合）／`kanshouKnownTier_(metCount)` — 🤝 相處次數：跟你照過幾次面。2026-09 好感整組砍除後這是**唯一還在累積的關係軸**，只回答「見過幾次」這個事實，不回答「多喜歡你」（那件事交給 AI 從歷史自己判斷）。用途：「你在她眼中」的知情度分段、在場卡與世界概況的排序。每回合在 `partyRows` 迴圈 +1（跳時間的回合不加）。（~~`KANSHOU_RAPPORT_BOND_TIERS_`~~／~~`KANSHOU_RAPPORT_TONE_`~~／~~`kanshouRapportTone_`~~ 的 2D 基調表已隨好感一併移除。）
- `stripStanding_(str)` — 剝掉「永遠／總是／每次」這類副詞：會餵回提示詞的記憶帶著它們，就從觀察變成每回合的指令。
- `kanshouAppendUnique_(oldStr, newLine, opt)`（2026-09 新增，`gas/Gallery.gs`；`opt = {sep, cap, maxLen, pin}`）— append→去重→上限的**共用引擎**，共同回憶（`processMemoir_` 現已降為一層包裝：`{sep:'｜', cap, maxLen:40, pin:true}`）與「她眼中的你」（`{sep:'／', cap:6, maxLen:14}`）共用。去重含**雙字組 0.6 相似度**比對最近 3 條（防同一件事換句話說重記）；`pin:true` 時★釘選永不驅逐，否則單純留最近 cap 條。寫入值一律先剝 `｜|【】[]★` 與分隔符本身、再截 `maxLen`。
- `getNickname_(relMem)`（2026-07 五度改版新增）— 從 REL_MEM 裸取`[專屬稱呼]`值的共用小 helper（供 UI 顯示用；鏡射 `actionPlay_` 內部組提示詞用的 `relMemMemoryStr_`，但那支輸出完整格式化字串，這支只回裸值）。`actionKanshouCompanions`／servant 清單 builder 都吃這支。
- `sanitizeNickname_(s)`（2026-07 邊界稽核新增）— 專屬稱呼寫入前的**唯一消毒口**：清掉 `|｜[]` ＋截 20 字。REL_MEM 是用 `| [欄名]值` 串成的單格字串，這格有兩條寫入路徑（玩家手動 `actionSetNickname`／AI 的 `intimacy_feedback.mutual_nicknames`），舊版只有手動那條消毒——AI 回一句 `"小可愛| [稱呼鎖]是"` 就能**偽造稱呼鎖**（玩家沒設過卻從此凍結、AI 自己也再改不動），且 AI 那條完全沒長度上限。兩條路徑現在都只走這支。
- `KANSHOU_LOCKS_`（常數 `{nick:'稱呼鎖', tag:'關係鎖'}`）／`kanshouRelLocked_(relMem, which)`／`kanshouRelMemBuild_(nickValue, locks)`（2026-09 新增）— 🔒 兩把鎖：玩家自己打過【專屬稱呼】或【關係稱呼】，那一格就歸玩家，AI 從此不碰。兩把都存 REL_MEM 這一格。`kanshouRelMemBuild_` 是 **REL_MEM 的唯一組裝口**——⚠ 少接一把鎖，那把鎖下一回合就會被 AI 的寫入整格洗掉（舊版 `= nickPart` 正是這個形狀）。呼叫端：`actionPlay_` 的 `intimacy_feedback` 落地、`actionUpdateRelTag`（蓋 tag 鎖）、`actionSetNickname`（蓋 nick 鎖）。⚠ 這兩把鎖**只有玩家的 UI 動作會蓋**，AI 蓋不了自己的鎖。
- `actionKanshouSummonHero(userData, pcId, sheets)` — 從英靈庫召喚一位英靈「存在」於此後日談世界（不必先 solo 封存）。防線：擁有權驗證、士郎位置擋、`KANSHOU_SUMMON_BLOCKED_IDS_` 擋、ai_gen 僅創造者可召、不開放男男、同一位只召一次（跨名比對）。通過即 appendRow(`heroToKanshouRow_`)。 ⚠ 2026-09 查重改走 `kanshouSummonClash_`。
- `kanshouPurgeByGame_(sh, gidCol, gid, idCol)` — 依 game_id 刪掉某張表的整批列（由下往上刪避免索引位移），回傳被刪列的 id（供連帶清歷史）。三張表共用。
- `actionKanshouReset(userData, pcId, sheets)` — （action `kanshou_reset`）後日談歸零重來：清掉這一局的眾生／歷史／帳本／風格／帳號連結，英靈殿不動；先驗帳號登記的就是這個 pcId。
- `actionEnterKanshou(userData, pcId, sheets)` — （action `enter_kanshou`）進後日談：每個帳號一個常駐世界，有連結就接續，沒有就先要名字性別、再建一個空白的世界。
- `actionBackfillKanshouAi(userData, pcId, sheets)`（2026-07 再稽核抓到漏洞：找列邏輯改用`kanshouPcIdx_(pcData, pcId)`（帳號歸屬由帳號表 KPC 欄在入口把關），取代原本裸`findIndex`信任傳入pcId的漏洞——鑑賞pcId可預測/枚舉，舊版可被冒名竄改任一玩家的敘事欄；前端`backfillKanshouAi`同步補送`acctName`）— 非阻塞背景補生成御主 **6** 個敘事欄（background/traits/personality/npc_intent/**speech**/**tic**/outfit；2026-09 新增 speech＝口吻、tic＝招牌小動作，落地走召喚同伴那支 `stampPersonaFlavor_`）。比照 `actionBackfillMasterAi`「種子秒建＋AI 潤色」；競態修用 `buildLiveIdIndex_` 寫回前重定位，只單格 setValue，數值/位置不碰。**🐛→✅ 2026-09**：原本【無條件覆寫】那幾欄——對一個已經玩過/改命改過的角色再跑一次就整組洗掉，而舊角色要補新欄位一定得再跑一次。改成「第一次補完蓋 `KANSHOU_BACKFILL_DONE_TAG_`（【設定已補】）的章，之後只填還空著的格子」；MEMORY 上的三件事（衣裝/口吻/小動作）併成讀一次寫一次，沒東西可改就完全不寫。
- `actionSetOutfit(userData, pcId, sheets)` — 從者換裝(純外觀，換衣不換人)。存 MEMORY【換裝】(`setOutfit_`，內剝分隔字元＋限 40 字)；`userData.self` 則換御主本人；空字串=恢復本相。
- `actionKanshouCompanions(userData, pcId, sheets)` — （action `kanshou_companions`）同伴面板：這一局所有人，各帶同行／臨時在場旗標、共同回憶與「注意到你」。
- `actionKanshouMemoirOp(userData, pcId, sheets)`（2026-07 稽核：找目標同伴列改委派 `findPcRowIdx_`，取代手刻迴圈，行為等價）— 共同回憶面板操作（op=pin/unpin/del）：釘選加 ★ 前綴（釘選上限 8）、刪除整條移除。玩家 UI 手動管理、AI 無權；帳號綁定＋同 gid 驗證。
- `actionWorld(userData, pcId, sheets)`（action `world`）— 🌍 世界帳本面板：list/pin/unpin/del（釘選上限＝該軌 `feedMax`−1，釘超過就有幾條送不出去）（帳本原本只有 AI 寫得到，這支補上玩家的讀與管，分工比照 `actionKanshouMemoirOp`）。
- `worldPayload_(gid)` — 世界帳本面板一包給齊（條目＋上限＋文案）；list 與每個 op 都回同一形狀，釘選在前、再依最後提到由新到舊。
- `actionKanshouParty(userData, pcId, sheets)` — 鑑賞同行名單增減（`op` = `add`／`drop`／`clear`）。只認 `npcId`（鑑賞眾生是全帳號共用表，名字會撞）；`add` 會把對方 LOC 落到玩家所在場景，滿 `KANSHOU_PARTY_MAX_` 就拒絕。回傳 `{success, party:[id]}`。
- `actionKanshouSetSex(userData, pcId, sheets)` — 切換御主性別（限男/女）；切男時檢查世界內是否已有男性從者（避免男男配對）；真換時重置 PHYSICAL 為中性預設。
- `actionKanshouSetName(userData, pcId, sheets)` — 改御主名字（≤16 字）；關係併入從者自己列，改名不影響羈絆。
- `dialogueFormatRule_()` — 鑑賞軌的對話格式規則（單層「」只收嘴巴發得出的聲音、每句台詞冠說話者名、動作與非口部聲響走敘事、**台詞與人物互動佔整段 narration 七成以上**）。**2026-09 玩家定案：這裡只講格式，不講該寫什麼。****唯一呼叫點＝ `nsfwBaseRules` 第3條**。⚠ **2026-09 更正：solo 的 `miniSystem` 並【不】呼叫這支**（全樹只有 `nsfwBaseRules` 第3條一個呼叫點），文件長期寫成「兩軌共用」是錯的。而且**不該改成共用**——這支的具體例子是 NSFW 的（喘息／吸吮／舔啜／啪啪／交合處水聲），灌進鎖 SFW 的 solo 軌是污染。solo 自己那條是刻意的精簡版（冠名＋單層「」＋動作走敘事），少掉的「玩家台詞照原句寫、禁轉述」在 solo 也用不到——solo 是純按鍵、玩家根本不打字。
- `buildDefaultSystemPrompt(includeOptions, styles, partyStable)` — 鑑賞系統提示詞（`nsfwBaseRules` ＋ 輸出範本）。2026-09 `nsfwBaseRules` 改陣列組裝＋動態編號，風格段走 `kanshouStyle_(styles, key)`；`styles` 缺省＝全部預設＝與舊字串逐字相同。⚠ 2026-09 拿掉了第一個參數 `includeMasterNote`：`master_note`（經歷滾動側寫）整組移除，經歷改回固定事實（見 `KANSHOU_REFERENCE.md` §「經歷改回固定」）。`Engine_Combat.gs` 的無參數 fallback 呼叫不受影響。
  - 🔴 內含 `nsfwBaseRules`（函式內 const，非獨立函式）— 慾海演化核心紅線常數，後日談敘事鐵律 6 條；連同 `specificRules`(【慾海律令】現 7 條，**2026-07 新增第6條「options 只能建議在場人物/當下場景真能做到的動作」**修「AI選項建議移動/呼喚不在場者、玩家點了做不到」的bug；**五度改版再新增第7條「appearance_extras只在劇情真有穿脫/更衣動作才填新值、不准自行合理化改寫」**，修「玩家用👕換裝手動設定裝扮，下一回合被AI默默改回別的」——schema _note的「沒變化留空」對這個模型是弱信號，明文規則才夠強；**同批再補「appearance_extras只能寫衣物本身，禁止寫成所在環境/姿勢」**，修「泡溫泉→移動到商店街，裝扮卻卡在『在水下』」的變種bug)＋範本 JSON 一起回傳。**紅線①：一律不可改（specificRules 可改，非紅線本體）。**
- `kanshouNameIsPlace_(name, homeName)` — 這個名字是地方不是人：等於住所名，或帶地名尾巴（的家／店／館…）。
- `kanshouFixWorldKinds_(entries, homeName, peopleNames)` — AI 分錯類的 world_note 就地改判：人物→地點（名字像地方）、地點→人物（名字逐字等於某位同伴）。
- `KANSHOU_SUMMON_BLOCKED_IDS_`（常數）— 暫移出鑑賞的英靈 id（召喚池的單一來源；現為空陣列）。
- `KANSHOU_PARTY_MAX_`（常數=3）— 同行人數上限（前端鏡射 `KC_PARTY_MAX_`）。
- `kanshouGetOnstage_(memory)` — 讀玩家列【在場】標記：AI 用 cast.join／leave 維護的臨時在場 id 陣列。
- `kanshouSetOnstage_(memory, ids)` — 寫回【在場】標記（去重、去空）。
- `KANSHOU_PARTY_TAG_`（常數）— 同行名單標記，存【玩家】列 MEMORY、逗號分隔 id。
- `kanshouGetParty_(memory)` / `kanshouSetParty_(memory, ids)` — 同行名單的讀寫成對 helper（存玩家列 MEMORY，`set` 會截到 `KANSHOU_PARTY_MAX_`）。
- `KANSHOU_CAL_START_MONTH_/DAY_`、`KANSHOU_DAYS_IN_MONTH_`（常數）— 曆法起點（Day1=12/20）、每月天數。（~~`KANSHOU_FESTIVALS_`~~ 2026-09 已隨節慶整組移除。）
- `KANSHOU_CAL_START_YEAR_`（常數＝2005）— 鑑賞曆法的起算西元年。2026-09 前沒有這個常數、`year` 直接算成「第幾年」，開局顯示「1年12月20日」。週年是用 absDay 差算的、不吃 `.year`，改它只動顯示字串。
- `kanshouDoyOffset_(month, day)` — 某月日距當年 1/1 的天數（0-based）。
- `kanshouSeason_(month)` — 月份→春天／夏天／秋天／冬天（★【此刻】只給季節與時段的字，且只在時段換了才送，講過的存 `KANSHOU_NOW_TOLD_TAG_`【此刻已述】；玩家訊息含 `KANSHOU_TIME_KEYS_` 時再錨一次「仍是…」）。
- `kanshouAbsDayToDate_(absDay)` — absDay→{year,month,day}（固定 365 天/年）。
- `KANSHOU_TIME_BANDS_`（常數）— 5 時段跳躍分界（清晨5/午後11/黃昏17/夜20/深夜0）。
- `kanshouHoursUntilBand_(curHour, targetStartHour)` — 算到目標時段起點的小時數（已在該時段跳下一次）。
- `KANSHOU_DAY_LAST_HOUR_`(=23)（常數）。~~`KANSHOU_HOUR_PER_ACTION_`~~ 已移除，2026-09 連 ~~`kanshouHourPerAction_`~~ 也內聯了：每回合固定推進 `KANSHOU_MIN_PER_TURN_`/60 小時，直接在 `actionPlay_` 裡算。
- `kanshouFmtHM_(h)` — 小時（可含 .5）→「HH:MM」。
- `kanshouClockInfo_(pcRow)` — 組時鐘資訊物件（day/hour/band/weather/month/dayOfMonth/label 實際年月日）；HUD/actionPlay 共用。
- `KANSHOU_BACKFILL_DONE_TAG_`（makeIntTag_『設定已補』）— 創角敘事欄已經補過的章。蓋了之後 `actionBackfillKanshouAi` 只填還空著的格子，不再覆寫玩家玩出來/改命改過的內容。
- `KANSHOU_MORNING_AFTER_TAG_`（makeTextTag_ 晨間餘韻）、（~~`KANSHOU_SCENE_DAY_TAG_`~~ 已隨 2026-09 砍掉獨處加好感一併移除。）（~~`KANSHOU_APPT_BANDS_`~~ 已隨 2026-09 砍掉約定一併移除。）
- `WORLD_SPEC_`（常數）— 帳本引擎的**逐軌規格表**（`kanshou`／`solo`）：`sheet`／`kinds`／`cap`／`feedMax`／`atMax`／`writeMax`／`textMax`。加一軌＝往表加一列。
- `worldTrack_(gameId)` / `worldSpec_(gameId)` — 由 game_id 前綴決定這一局屬於哪一軌（`g_`＝solo）並取出規格。
- `KANSHOU_LEN_TIERS_`（常數·2026-09）— 📏 篇幅檔位（自動/300/500/700/900），字數區間與 `max_tokens` 綁同一列。
- `kanshouLenTier_(key)` — 篇幅檔位 key → { words, tokens }；查無就回自動檔。
- `KANSHOU_STYLE_MODULES_`（常數·2026-09）— 🎨 說書人提示詞 15 段模組表 `{key,slot,def}`（sys 8 段進 nsfwBaseRules、user 5 段進 USER prompt）；`def` 就是原本寫死的那句。其中 13 段標 `fixed: true`＝不開放玩家調（面板看不到、`kanshouStyleWrite_`／`actionKanshouSetStyle` 拒收、`kanshouStyleRead_` 連表上的舊列都忽略），玩家真正能動的只有 `lewd`（尺度）與 `lenTier`（篇幅檔位）。`KANSHOU_STYLE_TEXT_MAX_`(300)／`KS_`（分頁欄位 GID/KEY/TEXT/ON）。
- `kanshouStyleModule_(key)` / `kanshouStyleDefault_(key)` — 查模組／取預設（`dialogue` 的預設是 `dialogueFormatRule_()`，所以預設要從這支拿、不能直接讀 `def`）。
- `kanshouStyleSheet_()` — 取/建「鑑賞風格」分頁。
- `kanshouStyleRead_(gameId)` / `kanshouStyleBust_(gameId)` / `kanshouStyleWrite_(gameId, key, row)` — 這一局的風格覆寫 `{key:{text,on}}` 讀（快取 `KS_<gid>` 120 秒）／清快取／寫一格（`row=null`＝刪列＝回預設）。
- `kanshouStyle_(styles, key, vars)` — 組 prompt 的唯一讀口：玩家版 → 關閉＝'' → 預設，代入 `{玩家}{代名詞}{篇幅}{主動掌握}{推進}`。
- `kanshouStyleClean_(text)` — 玩家文字清洗：只擋長度與空白，**不剝 ｜【】**。
- `actionKanshouGetStyle(userData, pcId, sheets)`（action `kanshou_get_style`）— 回 `modules[]{key,name,slot,def,text,on,custom}`＋`max`。
- `actionKanshouSetStyle(userData, pcId, sheets)`（action `kanshou_set_style`）— `{key,styleText,on}` 改一格／`{key,reset}` 還原一格／`{resetAll}` 全部還原；空文字＋開啟＝刪列。
- `worldSheet_()` — 世界帳本分頁（沒有就建，含舊名遷移）。
- `worldRow_(a, rowNum)` — 一列 → 一個條目物件（讀與寫回快取共用，欄位長相只有這裡說了算）。
- `worldRead_(gameId)` — 讀這一局的帳本條目（CacheService 快取）。
- `worldBust_(gameId)` — 清掉這一局帳本的快取。
- `worldSame_(a, b)` — 兩條帳本條目是不是同一件事（bigram 近義比對，只用在近兩天的迴聲）。
- `worldWrite_(gameId, entries, curDay, max)` — AI 發明的東西落盤：清洗、同名合併、每類上限淘汰；max 是給 AI 的煞車。
- `worldDrop_(gameId, kind, name)` — 拿掉一條（同類同名）；面板刪除用。回傳有沒有真的刪到。
- `worldEvictees_(d, gid, added, curDay)` — 淘汰政策（純函式）：每類超過上限就砍最久沒提到、提及最少的；釘選的不驅逐。
- `loreEntriesFromPref_(pref)` — 📖 從一列的 PREF 第三、四格（喜歡／討厭）長出觸發條目 `[{keys, content}]`：key 用「與、和及，」切、至少兩字（`KANSHOU_LORE_KEY_ALLOW1_` 例外）；空／「無」不長。原創英靈與玩家改命過的走這條。
- `loreEntryFromBack_(row)` — 📖 那一列的經歷（`COL.PC.BACK`，只有玩家自己改命才會有值）長成一條 `{rel, overlap}` 條目。
- `kanshouSeedRowOf_(row)` — 這一列來自英靈殿哪一筆（【英靈源】→ 英靈殿列），查不到回 null。`kanshouRealName_`／`kanshouLoreBook_` 共用。
- `kanshouSkillNames_(seedRow)` — 種子的技能／寶具名字：從 CLASS_SKILLS／SKILLS／NP 讀，只留名字（原文、階級、括號說明剝掉），回 `{skills:[{n,fx,np}], np:[]}`；寶具在技能欄也有一份時 `np:true`。
- `loreEntriesFromSkills_(seedRow)` — 本事變觸發條目（不上卡）：每個技能一條 `{keys:[名字＋LORE_FX_KEYS_[fx]], content:'本事「X」'}`，寶具一條 `{keys:[名字,'寶具'＋LORE_NP_KEYS_[名]], content:'寶具「X」'}`。`kanshouLoreBook_` 在種子列存在時併進去。探針 `skillline.js`。
- `kanshouRealName_(row)` — 真名（卡片抬頭「凜（遠坂凜・女）」）；跟暱稱相同（原創英靈）回空。
- `kanshouLoreBook_(row)` — 📖 這一列的觸發條目：【英靈源】→英靈殿 PERSONA JSON 的 `book`；沒有就退回 `loreEntriesFromPref_`；沒有 `rel` 條目時再接上 `loreEntryFromBack_`（玩家改命寫的經歷）。
- `kanshouBodyPlain_(physicalJson)` — 肉體狀態是不是「如常」。
- `kanshouOutfitLine_(row, playerMsg)` — 👕 裝扮句什麼時候送：①這件衣服還沒講過（【裝扮已述】≠目前【換裝】：第一回合、玩家換裝、AI 的 appearance_extras 改了）②玩家訊息有衣物詞（`KANSHOU_OUTFIT_KEYS_`）③肉體狀態不是如常。回 `{line, told}`，told＝已就地更新【裝扮已述】、呼叫端要標 dirty。御主自己與每位在場者同一套。
- `worldNoteDropEcho_(entries, loreStr, allyNames)` — 🌍 帳本回寫前的濾網：①兩字詞有 `WORLD_ECHO_RATIO_`（五成）以上出現在這回合送的 ★底細 裡的 world_note 丟掉（只共用一個地名的新事實留下）（AI 會把亮起的底細抄回帳本，一寫進去就變在場時常駐）；②kind 人物 且名字含同伴名的丟掉。回過濾後的陣列。
- `memoirActive_(memoirRaw, playerMsg)` — 📖 共同回憶：釘選（★）常駐，其餘與玩家訊息共用兩字詞才亮，玩家在回想（`KANSHOU_RECALL_KEYS_`）卻沒點到哪件事，就給最近幾條；亮起的最多 `KANSHOU_MEMOIR_SEND_MAX_` 條，照原本時序；回純文字陣列（★ 已剝）。
- `loreBigrams_(text)` ／ `loreOverlap_(a, b)` — 📖 兩段中文有沒有共用的「兩字詞」（去掉 `LORE_STOP_CHARS_` 功能字與 `LORE_STOP_BIGRAMS_` 泛用詞）。回憶／經歷／帳本這種沒有 keys 的自由文字靠它判「提到了沒」。
- `loreContain_(a, b)` — a 的兩字詞有幾成出現在 b 裡（0～1）。帳本回寫濾網判「照抄」用比例，不用「共用任一個」。
- `loreHits_(entries, text, opts?)` — 📖 條目亮起的三種路：①`keys` 子字串在 `text`；②`rel` 條目點名的人在 `opts.presentNames`；③`overlap` 條目與 `opts.playerMsg` 共用兩字詞。回亮起的 `content[]`。
- `kanshouLoreStr_(ctx)` — 📖 這一回合亮起的條目 → `★【這一步碰到的底細】`（我／每位在場者／`KANSHOU_WORLD_BOOK_`，最多 `KANSHOU_LORE_MAX_` 段）；沒中回空字串。只掃 `ctx.userMsg`，`KANSHOU_LORE_SCAN_AI_` 開了才把 `ctx.lastNarration` 一起掃。`ctx = {userMsg, lastNarration, pc, presentRows}`。探針 `lore.js`。
- `worldFeed_(gameId, rows, presentNames, userMsg, curDay, allyNames)` — 這一回合送給 AI 的帳本條目：釘選／在場人物名字在內容裡／玩家提到的；近期與命中次數只管排序，最多 feedMax 條。
- `getKanshouHomeName_(memory, playerName)` — 家名：玩家列【住所】標記，沒設就「(玩家名)的家」。
- `KANSHOU_CASUAL_NAME_`（常數）— SEED id→日常短名/職階（SABER/RIDER/伊莉雅/櫻/凜/大河/士郎）。
- `kanshouNameAlias_()` — 全名↔短名雙向別名表，從 `KANSHOU_CASUAL_NAME_`＋種子真名＋id 前段**用到才建**（種子住別檔，頂層建會踩載入順序）。（~~`KANSHOU_NAME_ALIAS_`~~ 手寫表已於 2026-09 移除：漏了 LANCER↔庫·丘林、ARCHER↔無銘。）
- `kanshouSummonClash_(data, gid, hero, heroName)` / `KANSHOU_SRC_TAG_`（常數）— 撞名守門：回 `{name, same}`，`name` 空＝沒衝突；`same:true`＝同一筆種子（已召喚過），`false`＝同一個人的另一種靈基（斯卡哈 Lancer/Assassin、伊莉雅 Master/Caster）。比對順序：【英靈源】id → 同真名 → 舊列退回跨名比對。
- `kanshouNameCandidates_(fullName)` — 產生比對候選集：全名/括號前後段＋日常別名＋去間隔號（庫·丘林→庫丘林）＋拉丁大小寫三態。`intimacy_feedback.npcs[].name`／`cast.join`／`cast.leave`／世界帳本同名過濾全靠它容錯，是整檔跨名比對的地基（~~rel_changes~~／~~npc_exit~~ 已隨好感與 cast 改版移除）。
- `actionPlay(userData, pcId, sheets)`（2026-07 稽核後改為薄包裝，~15 行）— 用 `CacheService` 對同一 `pcId` 做軟性互斥（偵測到同 pcId 仍有一次在跑就直接回「請稍候」拒絕本次），再委派給 `actionPlay_`。修的是：本函式故意豁免 `LOCK_EXEMPT_ACTIONS_` 全域鎖(AI呼叫數秒~49秒，鎖全域會拖累其他玩家)，但寫回是「整表快照→記憶體全改→結尾整列覆寫」，同pcId兩次呼叫窗口重疊時後flush者會整列蓋掉先flush者的全部改動——這裡不加全域鎖(仍會拖累其他玩家)，只鎖「同一pcId」。
  - 內嵌 helper：`_qv`（值落在 `QUAD_EMPTY_` 就回空，2026-09 新增）／`formatPref`/`formatTrait`（送 AI 前的性格·特徵格式化，空格與佔位字整格不送、不再輸出「無」。⚠ 2026-07 送出時砍格後兩者呈現方式已不同——`formatPref` 只送 [表象][內裡]、`formatTrait` 合併 [外貌氣質]＋[台詞自稱]，共用的 `formatFourSlot_` 因此失去意義已刪除；第4格由 `traitPrivateOf_` 併進萌點）、`relMemMemoryStr_`（REL_MEM 專屬稱呼＋態度）、`_whereIsHer`（撲空提示找她位置）、`sanitizePhysicalState`/`sanitizeAppearanceExtras`（原`sanitizeOutfitChange`，篩敷衍語·容錯截斷）、`processTags`（專屬稱呼 append 去重）、`processMemoir_`（共同回憶 append·**2026-09 起只是 `kanshouAppendUnique_` 的一層包裝**，本體已抽成頂層與「她眼中的你」共用）。（`processSkills`/`setSkillTag_` 已隨雙修技巧機制整組刪除）
- `kanshouAdvanceClock_(ctx)` — ⏰ 這一回合時鐘怎麼走：結束一天／兩段式就寢／時段跳躍／每回合自然流動，四條路都在這裡。`ctx = {userData, pcData, pcIndex, myGameId, sameGame, partyMembers, dirtyPcRows, paceHour, nightSceneOn, curDay, curHour, curL, finalUserMsg}`；回 `{curDay, curHour, curL, finalUserMsg, timeJumped, clockMoved, narrDay, narrHour, intimateNightNames, nightSceneNames}`。⚠ 會就地改 `pcData` 那一列與 `userData.endDay`（兩段式就寢把這一按改成「不結束」）。
- `relMemMemoryStr_(relMem)` — 💬 專屬稱呼 → 卡片上那一小段（沒有稱呼就整段不印）。2026-09 從 `actionPlay_` 內部提到檔案層，因為在場人物卡拆出去之後變成跨函式共用。
- `kanshouWhoCard_(r, pName, formatPref, formatTrait)` — 人物卡的「這個人是誰」：名字、性別、真名、喜惡、特徵、行事邏輯。
- `kanshouBondCard_(r, userMsg)` — 人物卡的「我們之間」：共同回憶（釘選＋提到才亮）、注意到我的事、玩家設過的關係稱呼、這個人記得的事。
- `kanshouPartyCards_(ctx)` — 🪪 在場人物卡，**一分為二**：`stable`＝這個人是誰（六格人設·整局不變·進 system 吃提示詞快取）、`live`＝此刻的樣子（穿著／在場來由／共同回憶／她眼中的你／關係稱呼·留 user）。`ctx = {pcData, pcId, userMsg(共同回憶的觸發用), myGameId, userMsg, partyMembers, moveTarget, timeJumped, formatPref, formatTrait}`；回 `{stable, live}`。每張卡由 `kanshouWhoCard_`（是誰）＋`kanshouBondCard_`（我們之間）拼成，待命者被點名時 ★【這座城裡還住著】也用這兩支附卡。⚠ 順序＝同行名單的插入順序，加人是 append，所以加人不會動到前面幾張卡的快取前綴。（~~聚光燈 `_spotlight_`~~ 已退休，見 CODE_NOTES。）
- `kanshouApplyIntimacyFeedback_(ctx)` — 📝 AI 回報的當下狀態落盤：玩家與每位在場者的 神色／穿著配飾／專屬稱呼／共同回憶／她眼中的你（關係稱呼 2026-09-23 起只有玩家能填，AI 回傳一律不收）。`ctx = {aiData, pcData, pcIndex, myGameId, dirtyPcRows, curL, pcName}`；就地改 `pcData` 並把動到的列記進 `dirtyPcRows`，不自己寫表。⚠ 這是 AI 唯一能改「人的狀態」的管道，敷衍用語過濾與長度裁切都擋在這一層。
- `stripLeakedScaffold_(text)` — AI 偶爾把提示詞的 ★ 指令或〈演出卡〉原樣吐回來：剝掉，並把多出來的空白斷行收斂成一次分段。
- `rollHours_(clk, hours)` — 內部推進小時，跨 24 進位 day。
- `timeBand_(hour)` — 依小時回時段名（清晨/午後/黃昏/夜/深夜）；用半開區間相容鑑賞半小時刻度。
- `actionGetHeroes(userData, pcId, sheets)` — 回傳英靈殿全員 `[{id,cls,name,gender,np,src}]` 供前端瀏覽；`src==='ai_gen'`(玩家原創)另附 creator＋工房編輯預填 detail(six/skills/align/look/pref/moe/fp/toMaster/speech/tic/back/weapon)。讀 `getHeroCodexCached`。

### Script.html（47 支函式）

- `escapeHtml(str)` — XSS 轉義（跨玩家可見文字渲染進 innerHTML 前的第二層保險）；null/undefined→空字串。
- `aiHtml_(text)` — AI 敘事→安全 HTML（`narrate`／鑑賞 `send`／老虎道場三處共用）：先整段 `escapeHtml`，再**只把 `<br>` 放回來**，最後轉真換行。提示詞明寫「換行一律用 `<br><br>` 分段」，整段 escape 會讓標籤變成畫面上看得見的字（2026-07-24 補 self-XSS 的副作用，兩軌同時中招，2026-07-28 修）。放行清單只有 `<br>`——`<br onload=…>` 這類帶屬性的不放行。
- `saveStoryLocal_(storyEl)` — 把故事區最後 KYUSHU_STORY_KEEP_ 則存進 localStorage（存不進去就算了，絕不冒成連線錯誤）。
- `showToast_(msg)` — 輕量成功提示：浮在畫面上方、1.8秒自動淡出、不擋操作。只給「單純告知已完成」的訊息用（如改命成功），需要玩家看清原因的失敗訊息仍用 `alert()`。
- `customConfirm_(message)` — **2026-07 新增**：自畫確認對話框，取代瀏覽器原生 `confirm()`（原生版在 Apps Script 沙盒 iframe 裡會把 `script.googleusercontent.com` 這串陌生網址秀在最上面，讀起來像可疑警告）。回傳 `Promise<boolean>`（原生 confirm 是同步阻塞，這裡改非同步），共用 `.modal-overlay`/`.modal-scroll` 底座、z-index `100000`(蓋過全代碼庫其餘彈窗，含 askKanshouSetup 的 99999)。呼叫端一律 `if (!await customConfirm_(msg)) return;`（呼叫端函式需為 `async`）——**全代碼庫原生 confirm() 已於同批次全數替換**。
- `customPrompt_(message, defaultValue, maxLen)` — **2026-07 新增**：自畫輸入對話框，取代瀏覽器原生 `prompt()`(同一批「沙盒網址嚇人」問題)。回傳 `Promise<string|null>`(null＝取消，跟原生 prompt() 語意一致)，共用 `customConfirm_` 的 modal 底座＋`.std-in` 輸入框，`maxLen` 選填(設 `input.maxLength`)。呼叫端 `const txt = await customPrompt_(msg, cur); if (txt === null) return;`——**全代碼庫原生 prompt() 已全數替換**(換裝/武裝/改名/御主改名等)。
- `gasRun(payload)` — 把 `google.script.run.handleGameAction` 封成 Promise；**2026-07 新增**：呼叫端未帶 `acctName` 時自動補上 `pc.account||currentAccount`（配合後端新增的 `verifyPcOwnership_` 中央驗證，單一入口統一補，免逐一補幾十個呼叫端）；每趟呼叫先清空 `__pendingState`，回應若含 `_state` 就暫存供 `syncData` 直接消費（3→1 round-trip 核心）。
- `beginAction(msg)` — 全域動作鎖：`__actionBusy` 已忙則回 false 擋連點；上進度遮罩＋progress 游標。
- `endAction()` — 解鎖 `__actionBusy`、撤遮罩、還原游標。
- `enterKanshou()` — **鑑賞總入口**：`enter_kanshou`；`needSetup`→`askKanshouSetup` 二次建檔；建 `pc(mode='kanshou')`；顯示 game／`applyModeUI`／`refreshFateTags`／`renderMapPane`；**2026-07 二度改版**：`firstTimeSeed` 存在就一律 `backfillKanshouAi`（不再判斷 `aiExpand`，也不再播種 `_kcPrefLocks`——性格鎖系統已刪除）；用 `getGameHistory(pcId)` 撈前塵對話承接後日談。
- `setupHistoryPrevention()` — pushState＋掛 popstate（`historyPushed` 旗標防重複註冊），頁面載入即掛以防主選單手滑上一頁丟創角進度。
- `handlePopState(e)` — 上一頁時彈「離開確認」遮罩並重新 pushState 卡住返回。
- `cancelExit()` / `confirmExit()` — 取消／確認離開（後者解除 popstate 監聽後 history.back）。
- `toggleFullScreen()` — 進/出全螢幕。
- `closeActionDrawer_()` — 收起抽屜、＋鈕回原狀。從抽屜打開別的面板（👥 有誰／🖋️ 說書人設定／🌍 這個世界）一律走這支——以前那兩個面板用 `classList.remove('open')`，而抽屜其實是切 `style.display`，關掉面板後抽屜還開著。
- `toggleActionDrawer()` — 開關「＋」動作抽屜（grid/none＋trigger active）。
- `triggerDrawerAction(actionType)` — 抽屜項路由：sync→syncData／status→openStatus／settings→openSettingsMenu，並收起抽屜。
- `openSettingsMenu()` — 開設定遮罩、同步 AI 選項開關與字級高亮。
- `kanshouResetCore_(kpcId, acct, reloadAfter)` — 歸零重來的共用核心（主選單與遊戲內設定兩個入口）：打字確認名字 → kanshou_reset；reloadAfter 為真時清完整頁重載。
- `kanshouResetWithConfirm_()` — 遊戲內設定那顆歸零鈕：pc 指著即將刪掉的列，清完必須整頁重載。
- `setStoryFontScale(scale)` — 套用並記憶對話字級縮放（CSS var `--story-scale`＋localStorage）。
- `highlightFontScaleBtn(scale)` — 高亮當前字級按鈕。
- `toggleAiOptions(el)` — 記憶並顯/隱【命運的抉擇】`#ai-options-grid`；⚠只藏該小格、`options-container` 永遠保持可見（修舊 bug）。
- `closeSystemModal(modalId)` — 通用關閉指定 modal（display:none）。
- `openStatus(targetId, targetName)` — 統一狀態讀取入口：自己→吃 `kyushu_last_status`；從者→優先吃 `myServants` 預取的 statusString 秒顯，無則後端 `get_full_status` fallback。
- `closeStatus()` — 關命盤、把背景 UI 切回玩家。
- `updateClock(label, ap, apMax)` — 時鐘 HUD：時段圖示＋文字，solo 額外顯示 ⚡AP/12，鑑賞不顯 AP。**AP≤4 時**(2026-07 新增)「行動 X/Y」文字＋雷電圖示切警示橙色(`#e0704a`)並加⚠️前綴——玩家反饋常打到見底才發現，不用彈窗(太煩)也不靠AI提醒(易被誤演成劇情)，改走純UI視覺提示。**2026-07 六度改版**（玩家「手機很長，切到地圖分頁點下一階段太麻煩」）：鑑賞模式下 `#clock-hud` 改成一整排 flex——`👥邀請`(原topbar-kanshou)＋時鐘文字＋`⏰下一階段`/`🌙睡覺`(原renderMapPane，含深夜變色邏輯)三者並列，常駐、不必切分頁。solo 模式不受影響、行為不變。
- `fateSegSplit_(raw, want?)` — 頓號字串拆成陣列（補滿 `want` 格、省略＝4、不壓縮連續頓號保位）；顯示與改命共用。
- `traitSegs_(raw)` — 特徵專用：剝掉舊局的自稱格後補滿 3 格。**鏡射 `Core_Settings.gs` 的 `traitParts_`**。
- `renderSegField_(id, raw, labels, lockKeys, activeLocks, isSelf, emptyLabel)` — 鑑賞：把個性/特徵四格渲染成帶標籤小行（空格待補、鎖住格掛🔒），原始值存 `dataset.raw` 供改命讀回。
- `updateUI(s)` — 把 `§` 分段狀態字串 s[] 灌進命盤欄位；solo 隱藏外顯/HP/MP 等空欄，鑑賞用分行標籤（processance/trait）＋地點徽章隱藏。
- `openFateEdit(type)` — 開改命 modal（pref/trait/back/intent）：讀 `dataset.raw` 預填、依模式（solo/鑑賞）給不同標籤/字數。（2026-07 二度改版拔掉性格鎖：鑑賞個性欄不再有🔒鎖定勾選框）
- `saveFate()` — 存改命（`update_fate`）：四格拼接或單值；成功才更新 UI。（2026-07 二度改版：不再收集/送出 `prefLocks`，鎖快取機制已刪除）
- `kanshouStatusLines_(po)` — 鑑賞肉體狀態單一自由文字欄渲染（合併自舊 6 鍵）。
- `refreshFateTags(prefetched)` — 重繪左側御主+從者標籤卡（HP/MP 條、令咒、羈絆、出力轉盤、技能/特性/寶具 pill、供魔收支）；有 `prefetched`（sync 夾帶或已知值）就免打 `get_tags`；內含 `buildSvCard`（solo/鑑賞兩版）、`bar`/`horrorBar`（血/魔/海怪條）、`pill`/`selPill`（膠囊）等閉包。
- `showGamePane(name)` — 手機三分頁切換（status/chat/map）；切 map→renderMapPane、切 status→refreshFateTags。
- `changeOutfit(name, isSelf)` — 換裝（`outfit`，只換衣）：`isSelf`(玩家自己)改跳`openOutfitPicker_`快選面板(2026-07新增)，非isSelf走`customPrompt_`(2026-07取代原生`prompt()`)。實際送出走共用`submitOutfit_(name, isSelf, txt)`，吃後端消毒值原地重繪（免 get_tags）。
- `openOutfitPicker_(name, cur)` / `closeOutfitPicker_()`（2026-07新增）— 換裝快選面板：動態建DOM+closure綁事件(不拼onclick字串)，`KANSHOU_OUTFIT_PRESETS_`(4套通用預設)按鈕＋「✏️自訂輸入」退回`prompt()`。只給玩家自己用，同伴外觀仍交給AI依`appearance_extras`自動更新。
- `submitOutfit_(name, isSelf, txt)`（2026-07新增，從changeOutfit抽出）— 換裝的實際送出邏輯：打`outfit` action、成功後原地更新`myMasterOutfit`/`myServants`快取＋`refreshFateTags`。
- `applyClientState(data, isSilent)` — 把一份 client state 套進 UI（狀態列/NPC/時鐘/經濟/tags/地圖/戰爭列）；`sync` 與動作夾帶 `_state` 共用此路徑。
- `syncData(isSilent)` — 同步狀態入口：優先吃夾帶的 `__pendingState`（免 round-trip），否則打 `action:"sync"`；成功→`applyClientState`。
- `logoutAccount()` — localStorage.clear＋reload。登入畫面的「登出」鈕直接呼叫這支(無進行中狀態可丟，不必確認)。
- `logoutWithConfirm_()` — **2026-07 新增**：`customConfirm_` 確認後才呼叫 `logoutAccount()`；遊戲中「離開冬木」鈕用這支(會丟棄未存的當下羈絆狀態，多一道確認)。
- `applyModeUI()` — 進後日談時擺好畫面：輸入列、說書人開關、抽屜的「這個世界／說書人設定」露出，頂列整條藏掉。
- `withButtonLock(btnEl, asyncFn)` — 通用按鈕防連點鎖（執行期 disable+變灰，finally 解鎖）。
- `lockBtn(event, asyncFn)` — onclick 語法糖，包 withButtonLock。

### Script_Onboarding.html（6 支函式）

- `accountLogin()` — 帳號登入（`account_login`）；存 `currentAccount`/`accountLoginRes`/localStorage；切到主選單，依 `hasGame` 顯示續玩鈕。
- `menuKanshouReset()` — 主選單的「後日談歸零重來」：走 kanshouResetCore_，清完收掉那顆鈕、不必重載。
- `__procOn`（全域旗標）— 遮罩現在有沒有人在顯示。**單一真實來源**，只由上面兩支維護；`withProcessing_` 讀它決定要不要接手。
- `showProcessing(msg, quick)` — 惰性建/顯示「處理中」全螢幕遮罩（`quick` 隱藏「10~30秒」提示）；同時把 `__procOn` 設為 true。
- `hideProcessing()` — 隱藏該遮罩；同時把 `__procOn` 設為 false。
- `withProcessing_(msg, fn, slow)` — **等待畫面的共用出口**：沒人在顯示遮罩就開一張、跑傳進來的 `fn`、不論成功/失敗/例外都收掉，結果原樣回傳、例外原樣拋出；已經有人在顯示就整支不碰（由最外層那個收）。`slow` 為真才顯示「10~30 秒」那行。玩家按下去要等的每一件事都走它。
- `bgHint_(msg)` — 非阻塞的「還在跑」小提示條（`pointer-events:none`），用在玩家**不必等、但也不該以為沒事發生**的背景工作（`backfillMasterAi`／`backfillKanshouAi`）。回傳一支**冪等**的收工函式，務必放進 `finally`；同時有多支背景工作時計數，全部收工才消失。

### Script_Kanshou.html（57 支函式）

- `showProgressLoader_(loadId, captions)` — 插入「跑條」loading（推進時間類動作用），文字每 1.1s 輪播直到 AI 回應；設 `progressTimer`。
- `hideProgressLoader_(loadId)` — 清 `progressTimer` 並移除跑條 DOM。
- `send(customMsg, isSilent = false, opts = {})` — 送出玩家這一步（打字或點選項）→ play → 印出【說書人】、選項、時鐘與角色分頁。
- `invalidateKanshouHeroCache()` — 令英靈庫快取 `_kcHeroesCacheReady=false`（工房鑄造/修改成功後由 Onboarding 呼叫，下次開面板重抓）。
- `kcRecomputeAvailable_()` — 算可召喚清單：濾掉已在場、濾掉他人原創(`src==='ai_gen'` 非本帳號)、濾掉男玩家×男英靈（鏡射後端配對規則）。
- `ensureOverlay_(id, opts)`（2026-07 稽核抽出，全檔共用）
- `_showOverlayLoading_(overlayId, ensureOpts, boxOpts)`（2026-07 稽核抽出，建於`ensureOverlay_`之上）— 合併原本`_kmShowLoading_`/`_kpShowLoading_`兩支幾乎逐行相同的「ensure overlay→塞讀條HTML→display:flex」，兩處呼叫改帶各自的id/title。
- `ensureKcOverlay_()` — 惰性建 `#kc-overlay`（master-box/party-list/filters/hero-list 四獨立容器；2026-07 稽核：內部改呼叫共用 `ensureOverlay_` 建殼）。
- `closeKcOverlay()` — 隱藏 `#kc-overlay`。
- `renderKcMasterBox_()` — 重繪御主資訊框（名/性別＋改名/切性別鈕 → `changeKanshouName`/`changeKanshouSex`）。
- `renderKcPartyList_()` — 重繪駐留清單每列（名/關係 tag/好感/所在地＋💞回憶鈕→`kanshouOpenMemoir`、🏷️關係鈕→`kanshouOpenRelTag`）；更新 `#kc-count`。
- `kanshouPartyOp(id, op)` — ＋同行／−同行（kanshou_party add/drop），成功後原地重畫同伴面板與角色分頁。
- `kanshouEvict(id, name)` — 🚪 請同伴離開這座城：問兩次、第二次要打名字，才送 kanshou_party evict。
- `kmSpinner_(msg)` — 回傳讀條 spinner HTML 片段。
- `kanshouOpenMemoir(name)` — 開/重繪「與某人的共同回憶」彈窗 `#km-overlay`；`_kcCur` 沒載到會自抓一次；每列有 📌釘選(pin/unpin)＋🗑刪除鈕→`kanshouMemoirOp`。
- `kmNoticedHtml_(name, noticed)` — 共同回憶面板底下唯讀列出「這個人注意到你」（`kanshou_companions` 下傳的 `noticed`，最多三條）；沒有就回空字串。
- `_kmShowLoading_(name)` — 把 `#km-overlay` 內容換成讀條（不存在則先建）。
- `kanshouMemoirOp(name, op, item, id)`（2026-09 加第 4 參數 id，送 `targetId`） — 釘選/取消/刪除回憶（`kanshou_memoir_op`）；`_kmBusy` 擋連點；完成後原地重繪並同步卡片數量徽章。
- `kanshouEndDay()` — 結束一天（`endDay:true` 走 `send`）；夜未眠中按下去＝睡到天亮。
- `kanshouJumpBand(key, label)` — 跳到指定時段（`jumpBand`，後端算差幾小時）。
- `kanshouNextStage()` — 「下一階段」單鈕：依 `KC_TIME_BANDS_` 順推；深夜→轉呼 `kanshouEndDay`。
- `renderKcFilters_()` — 建性別/職階篩選下拉（只在英靈庫重抓時重建）。
- `renderKcHeroList_()` — 建可召喚英靈列（每列標 `data-gender`/`data-cls`，召喚鈕→`kanshouSummonHero`）；管 `#kc-hero-empty`。
- `kanshouSetFilter(kind, val)` — 設篩選值→`applyKcHeroFilter_`。
- `applyKcHeroFilter_()` — 純本地切既有列 `display`（不重讀伺服器/不重建 DOM）；無中則顯示空訊息。
- `openCompanions()` — 開同伴面板總入口：`Promise.all` 併抓 `kanshou_companions`＋(需要時)`get_heroes`；套用 `KC_SUMMON_BLOCKED_IDS_`（手動同步後端）；呼各 render 子函式並顯示 overlay。
- `kcRefreshPartyOnly_()` — 局部刷新：只重抓 `kanshou_companions`＋重繪 party/hero 兩塊（召喚後/改關係後用）。
- `kanshouSummonHero(heroId)` — 從英靈庫召喚一人入駐（`kanshou_summon_hero`）；成功→`syncData`＋`kcRefreshPartyOnly_`。
- `kanshouCloseStyle_()` — 關掉說書人設定面板。
- `openKanshouStyle()` — 🖋️ 說書人設定面板：開全螢幕面板、讀 kanshou_get_style。
- `ksLoad_()` — 讀說書人設定（kanshou_get_style）→ 存進 _ksMods_ → ksRender_。
- `ksRender_()` — 畫說書人設定：每段名稱／狀態／一句說明，預設｜自訂｜關閉 三顆鈕；篇幅那段畫檔位鈕。預設句本體不上畫面。
- `ksTier_(key, val)` — 篇幅檔位鈕：送 kanshou_set_style（key、styleText＝檔位）。
- `ksMode(m)` — 一段的三態唯一判讀口（正在編輯＝自訂；關掉＝off；有自訂字＝own；其餘 def）。
- `ksBtn_(m, mode, want, label)` — 畫一顆三態鈕（亮的那顆就是目前狀態）。
- `ksPick_(key, want)` — 按三態鈕：自訂＝本地長出輸入框；預設／關閉＝直接送出。
- `ksCount_(key)` — 自訂框的字數計。
- `ksSend_(payload)` — 說書人設定的唯一送出口（kanshou_set_style），成功後重讀重畫。
- `ksSave_(key)` — 存自訂那一段的文字（留白＝回到預設）。
- `ksReset_(key)` — 這一段回到預設。
- `ksResetAll_()` — 全部還原（確認後送 resetAll）。
- `closeWorldPanel_()` — 關掉世界帳本面板。
- `openWorldPanel()` — 🌍 這個世界面板：開全螢幕面板、kwLoad_ 讀清單。
- `kwLoad_(op, kind, name)` — 世界帳本的讀與操作共用一支（world list／pin／unpin／del）；按鈕被拒時清單留著、跳提示。
- `kwRender_(caps)` — 照面板文案分組畫帳本條目，每條有 📌 與 🗑。
- `kwOp_(op, kind, name)` — 帳本條目的釘選／取消／刪除（刪除先確認）。
- `kanshouOpenBondHub(name, curTag, curNickname, npcId)`（`confessWait`／`cohabit`／`lover` 三個殘參已隨各自的功能移除）— 💞 關係中樞分派面板：關係稱呼／共同回憶／調整好感。門檻數字走 `KC_*` 鏡射。
- `kanshouOpenRelTag(name, curTag, curNickname, npcId)`（2026-09 加第 5 參數：面板記住 `_krTargetId`，送出時帶 `targetId`——長名同伴靠名字會被 NAME_MAX 截斷）（2026-07 新增，原`kanshouEditRelTag`用native prompt()，玩家「那個關係也不要用彈窗吧」改成專屬面板；**五度改版新增`bond`/`curNickname`參數**）— 開`#kr-overlay`彈窗：`KC_REL_TIERS_`(鏡像Gallery.gs `KANSHOU_REL_TIER_`)5階預設稱呼各一顆按鈕(呼叫`kanshouSetRelTag`，永遠可選)＋自訂區塊。**bond<`KC_CUSTOM_TAG_BOND_`(80)時自訂區塊整個換成鎖定說明文字**；bond≥80才顯示「自訂關係稱呼」輸入框(`#kr-custom`，呼叫`kanshouSetRelTagCustom`)＋「專屬稱呼」輸入框(`#kr-nickname`，呼叫`kanshouSetNicknameCustom`)，並附「這格是填空的名詞，不要打完整句子」引導文案。選預設會讓文字重新匹配某梯度標籤(之後~~`kanshouSyncRelTier_`~~（已移除）繼續自動跟好感升降)；打自訂稱呼會固定下來不再自動改動(既有行為，只換UI容器)。呼叫端傳入`bond`/`nickname`：Script.html卡片鈕用`s.bond`/`s.nickname`、Script_Kanshou.html同伴清單用`c.bond`/`c.nickname`。
- `kanshouSetRelTag(name, tag)`（2026-07 新增）— 打`update_rel_tag`，成功→`syncData`＋`kcRefreshPartyOnly_`＋關閉`#kr-overlay`；`_krBusy`擋連點。
- `kanshouSetRelTagCustom(name)`（2026-07 新增）— 讀`#kr-custom`輸入框(空值擋)，呼叫`kanshouSetRelTag`。
- `kanshouSetNicknameCustom(name)`（2026-07 五度改版新增）— 讀`#kr-nickname`輸入框(空值擋)，打新action`kanshou_set_nickname`(`actionSetNickname`)；成功→`syncData`＋`kcRefreshPartyOnly_`＋關閉`#kr-overlay`；共用`_krBusy`擋連點。
- `changeKanshouName()` — 改御主名（`kanshou_set_name`，`customPrompt_`）；更新 `pc.name`/`#ui-name`/重繪 master-box。**🐛→✅ 稽核抓到**：原本沒做前端長度檢查(`kanshouRenameHome`有、這裡漏了)，超長會白跑一趟round-trip才被後端擋，已補同款≤16字檢查。
- `changeKanshouSex()` — 切御主性別（`askKanshouSex`→`kanshou_set_sex`）；更新 `pc.sex`/`#ui-sex`/重繪。
- `askKanshouSex()` — Promise 版性別選擇彈窗（回 '女'/'男'）。
- `askKanshouSetup(defaultName)` — Promise 版首次進場設定彈窗（名/性別/外貌/個性）；回 `{name,sex,appearance,standing,persona}`。性別鈕改純選取（修「一點就送出」bug）。**2026-07 二度改版**：拔掉「留白、遊戲中讓AI慢慢認識我」分流，只剩一顆「✨讓AI依你填的一次擴寫完整」按鈕（回傳物件不再帶 `aiExpand` 旗標，因為只有一條路徑）。
- `backfillKanshouAi(seed)` — 非阻塞背景補生成御主敘事欄（`backfill_kanshou_ai`）；成功→`syncData`；失敗靜默保留種子。

### Script_War.html（39 支函式）

- `warStory_(who, text)`／`warLog_(lines)`／`warEl_(id)` — 小工具；說書走 `aiHtml_`。
- `warOpen()` — 從選單進來：讀戰局，沒有就畫開局表單（姓名、性別、願望、第幾次戰爭、召喚對象）。`warBackMenu()` — 回選單。畫面狀態存在 `warCur_`（後端 `warView_(st)` 給的那一份）。
- `warRenderForm_()`／`warFormPick_(k, v)`／`warStart()` — 開局表單（姓名、性別、願望、第幾次戰爭）→ 召喚。填過的都存在 `warForm_`（切選項、再來一局都還在）。
- `warForgeValid_(res)` — 只收形狀對的工房資料（清單缺了就當空的），壞掉的回應回 null。
- `warHeroOptions_()`／`warForgeLoad_()` — 召喚對象選單（命運決定／你的原創／原作），資料來自 `war_forge_list`。
- `warHelpHtml_()`／`warHelp()`／`warHelpClose()` — 「規則」卡：第一次開局自動跳出（localStorage 記住），之後從頂欄「？」叫出；數字照後端 `rules`。
- `warDo(i)` — 按第 i 顆鈕（令咒開著就一起送）→ `war_act` → 重畫 → 說書。`warToggleSeal()` — 令咒開關（戰鬥中才有；開著時用不上令咒的鈕會鎖住）。`warToggleMore()` — 夜晚「其他目標（N）」展開／收起（帶 `more` 的出擊鈕；每按一步就收回去）。
- `warResync_()` — 按了被拒絕或斷線時跟後端重新 `war_load` 一次，畫面不會卡在過期的狀態。
- `warForgeOpen(fromMenu)`／`warForgeBack()`／`warForgeList_()` — 工房：清單頁（我的原創＋新增）；從主選單進來就回主選單。
- `warForgeEdit(id)`／`warForgeRender_()`／`warFeSet(k, v)`／`warFeSync_()`／`warFePts_()` — 編輯頁：真名、職階、性別、六圍（即時點數）、寶具名、技能、外貌、性格。
- `warForgeSave()` — 存進英靈殿（`war_forge_save`），順手讓鑑賞的同伴清單重抓。
- `warNarrate_(block)`／`warNarrOnce_(block)` — 說書同時只寫一段：佔位插在故事的當下位置、寫好換成本文，後面按的幾步照樣接在它後面；寫的時候玩家又按了就在寫完後補一段（後端會把沒講到的併進去）。`block`＝補魔與結局這種整場戲，按鈕等它寫完；其餘不鎖按鈕。`warQuit()` — 放棄這一局。
- `warBar_(v, max, cls, key)`／`warBarsSlide_()` — 血條：記住每條上一次畫到哪（`warBarPrev_`），先畫在舊位置、下一格滑到新值，掉血的那條閃一下。
- `warRender_(next)` — 狀態列、敵人名單、戰鬥框（對手情報＋預兆）、召喚卡、終局卡；骨架只建一次，故事區保留。戰鬥與終局時收起技能表與名單（手機上讓位置給戰鬥框與按鈕）。
- `warOverHtml_(v)`／`warDojo()` — 終局卡（勝負、六格戰績、輸在哪與下一局／亮點）／叫 `war_dojo`，講評接在故事區；看過一次這一局就不再出現那顆鈕（`warDojoDone_`，講評是同一篇）。`warRenderButtons_()` — 照 `buttons` 畫大按鈕（令咒開著換成 `sealSub`、`sealOk` 的鈕變得按得下去）。
- `warFoeDetail_(f, inBattle)`／`warFoePeek(id)` — 對手情報（戰鬥框裡「看穿真名」改成標題上的 ◆弱點）（只知道職階時提示怎麼看穿；看穿後御主、寶具可不可以放、技能）／點名單上的對手展開情報。
- `warToggleTraits()` — 點從者卡展開／收起自己的技能表（召喚時一律攤開）。
