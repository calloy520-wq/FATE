# FUNCTION_MANUAL.md — 全專案逐函式工具書

> **grep 前先查這份。** 每個函式一行：做什麼／被誰呼叫，依檔案＋子領域分類。
> 行號會漂，**以函式名為錨**。改／搬／刪函式時順手回來補（比照 `SOLO_REFERENCE.md` 紀律）。

**與其他說明書的分工**：`CODE_MAP.md`＝一頁式導航（東西在哪／我要做 X 動哪裡／資料驅動表索引），**找路先看那份**；`HANDBOOK.md`＝架構總覽（理念／資料層／戰鬥管線／三軌），看「這專案在幹嘛」；`SOLO_REFERENCE.md`＝solo 軌代碼地圖（schema／ActionRouter／MEMORY 標記）；`KANSHOU_REFERENCE.md`＝鑑賞現況真相；**這份**＝地毯式逐函式清單，涵蓋 solo＋鑑賞＋共用全部 23 檔（`Style.html` 純 CSS 無函式，不列）。

## 檔案總覽（後端→前端）

| 檔 | 函式數 | 職責 |
|---|---|---|
| **Router_Action.gs** | 12（＋ActionRouter 65 action） | 後端總分流器：`sanitizeUserData_`→`ActionRouter`→`handleGameAction`；鎖／14 日時限／`_state` 夾帶 |
| **Router_Bond.gs** | 27 | 羈絆／令咒／結盟／示好交涉／破戒奪僕／主從硬連結 |
| **Router_Narrative.gs** | 10 | SOLO 輕量敘事引擎（`narrateWithState_`／虛假之夢／老虎道場） |
| **Router_Persona.gs** | 11 | 演出依據卡（`servantCard_`／`masterCard_`／`performanceNote_`…，show-don't-tell 載體） |
| **Router_Creation.gs** | 20 | 御主創角／召喚從者／工房鑄造（含 `forgeCost_` 計價＋六圍floor/cap） |
| **Router_Movement.gs** | 31 | 地圖／移動／休息／偵查／搜刮／整備／陣地／卸防突襲／撤退追擊／敵營局面／挑撥離間／趁隙偷襲 |
| **Router_Economy.gs** | 7 | 靈基出力／魔境／符文／換裝武裝／補魔／修復 |
| **Router_Battle.gs** | 33 | 出戰主流程／`fateStrike_` 裁決／御主電池／御主參戰分擔／海怪框架 |
| **Engine_Combat.gs** | 2 | 兩軌共用 LLM 調用（`callGeminiAPI`）＋`doGet` |
| **Engine_Fate.gs** | 35 | 純數值戰鬥核心（D20／六圍／fx／寶具規模矩陣） |
| **Mystic_Code.gs** | 8 | 起始禮裝被動化（`injectMysticBuff_`／`MC_COMBAT_`） |
| **Gallery.gs** | 90 | 鑑賞（慾海）全軌＋`actionPlay`＋`nsfwBaseRules`（紅線①） |
| **Core_Settings.gs** | 63 | 金鑰／模型常數／`COL` schema／數值公式／MEMORY 封裝／地理雷達 |
| **Time_World.gs** | 21 | 世界時鐘／AP／`worldTick_` NPC 模擬迴圈 |
| **Seed_Codex.gs** | 7 | 英靈殿種子＋人設回填 |
| **Seed_Rivals.gs** | 7 | 敵方陣營一次性鋪設 |
| **Setup_FateWorld.gs** | 4 | 分頁建置／種子灌入 |
| **Account.gs** | 10 | 帳號綁定／開新局／清理本局 |
| **History_Sync.gs** | 7 | 戰記寫入／軌跡摘要 |
| **Index.html** | 0 | 載入殼（依序載 Style／Script／Script_Kanshou／Script_Onboarding） |
| **Script.html** | 133 | 前端 SPA 核心（通訊／狀態面板／戰爭行動／地圖／逆天改命／撤退突圍／趁隙偷襲挑撥） |
| **Script_Kanshou.html** | 90 | 鑑賞（慾海）SPA |
| **Script_Onboarding.html** | 51 | 開局（登入／創角／召喚） |

> ActionRouter 目前註冊 **65 個 action**，全部對應真實 handler、無缺漏（見下 Router_Action.gs 段完整對照表）。

---

# 逐函式文件 — Router_Action / Router_Bond / Router_Narrative / Router_Persona

四個後端分流／敘事／演出卡檔案。所有 handler 簽名一律 `(userData, pcId, sheets)`，回傳 `JSON.stringify(...)`。
`COL.PC.*` 是眾生表欄位索引；`gameId` 前綴：`g_`＝正式聖杯戰爭、`k_`＝鑑賞、`KPC_/KHV_/KSV_`＝鑑賞 id。
`STATE_PRE_DATA_` 交棒＝handler 把最新整表陣列存全域，讓 dispatcher 夾 `_state` 時免整表重讀。

---

### Router_Action.gs

後端總分流器：唯一輸入防線 `sanitizeUserData_` → dispatch 表 `ActionRouter` → `handleGameAction`，並集中處理鎖／14 日時限攔截／`_state` 夾帶。共 **12 個函式** ＋ 4 張常數表。

#### 🔹 ActionRouter 註冊表（目前註冊 65 個 action）

`"action字串": handler` 完整對照（依原碼順序）：

| action | handler | 備註 |
|---|---|---|
| `check_name` | `actionCheckName` | 建角姓名檢查（擋正典名） |
| `check_sheets` | `actionCheckSheets` | 登入畫面手動建缺分頁（Setup_FateWorld.gs） |
| `account_login` | `actionAccountLogin` | 帳號登入 |
| `account_new_game` | `actionAccountNewGame` | 開新局 |
| `end_run` | `actionEndRun` | 清理開新局（claim_grail 奪杯封存已砍） |
| `enter_kanshou` | `actionEnterKanshou` | 進鑑賞 |
| `backfill_kanshou_ai` | `actionBackfillKanshouAi` | 開局非阻塞·背景補鑑賞御主敘事欄 |
| `dev_resync_codex` | `actionDevResyncCodex` | 開發用·重同步英靈殿 |
| `purge_orphans` | `actionPurgeOrphans` | 清孤兒列 |
| `kanshou_companions` | `actionKanshouCompanions` | 鑑賞同伴清單 |
| `kanshou_memoir_op` | `actionKanshouMemoirOp` | 共同回憶釘選/取消/刪除 |
| `kanshou_summon_hero` | `actionKanshouSummonHero` | 鑑賞同伴唯一入口·直召 |
| `kanshou_set_sex` | `actionKanshouSetSex` | 設同伴性別 |
| `kanshou_set_name` | `actionKanshouSetName` | 設同伴名 |
| `kanshou_set_home_name` | `actionKanshouSetHomeName` | 設住處名 |
| `kanshou_add_quick_phrase` | `actionKanshouAddQuickPhrase` | 新增玩家自訂快速貼圖(2026-07新增，≤12字，上限8句) |
| `kanshou_delete_quick_phrase` | `actionKanshouDeleteQuickPhrase` | 刪除玩家自訂快速貼圖 |
| `prep_meal` | `actionPrepMeal` | 準備餐點 |
| `get_full_status` | `actionGetFullStatus` | 查某角完整狀態字串 |
| `update_fate` | `actionUpdateFate` | 逆天改命（4 敘事欄） |
| `update_rel_tag` | `actionUpdateRelTag` | 重定義關係稱呼(自訂文字需bond≥80，2026-07五度改版) |
| `kanshou_set_nickname` | `actionSetNickname` | 手動鎖定專屬稱呼(bond≥80，2026-07五度改版新增) |
| `create` | `actionManualNpc` | 御主創角（非阻塞，種子值秒寫一列） |
| `backfill_master_ai` | `actionBackfillMasterAi` | 開局非阻塞·背景補御主敘事欄 |
| `summon_servant` | `actionSummonServant` | 召喚從者 |
| `get_heroes` | `actionGetHeroes` | 英靈殿清單 |
| `get_masters` | `actionGetMasters` | 御主清單 |
| `get_tags` | `actionGetTags` | 左側狀態卡 payload |
| `fate_battle` | `actionFateBattle` | 開戰 |
| `summon_horror_beast` | `actionSummonHorror` | 召喚深淵海怪 |
| `dismiss_horror_beast` | `actionDismissHorror` | 解除海怪 |
| `use_seal` | `actionUseSeal` | 令咒 |
| `mana_supply` | `actionManaSupply` | 補魔 |
| `spirit_repair` | `actionSpiritRepair` | 靈基修復（不燃令咒） |
| `set_servant_output` | `actionSetServantOutput` | 靈基出力檔位 |
| `set_mage_realm` | `actionSetMageRealm` | 魔境被動盤 |
| `set_rune_mode` | `actionSetRuneMode` | 符文運用 |
| `outfit` | `actionSetOutfit` | 換裝 |
| `weapon` | `actionSetWeapon` | 自定武裝 |
| `save_hero` | `actionSaveHero` | 工房鑄造/修改英靈 |
| `claim_hero` | `actionClaimHero` | 認領無主原創英靈 |
| `bond` | `actionBond` | 羈絆相處 |
| `rule_break_steal` | `actionRuleBreakSteal` | 破戒奪僕 |
| `propose_alliance` | `actionProposeAlliance` | 交涉結盟 |
| `break_alliance` | `actionBreakAlliance` | 撕毀盟約 |
| `ally_bond` | `actionAllyBond` | 盟友交流 |
| `court_enemy` | `actionCourtEnemy` | 🕊️ 示好／交涉：對未結盟敵御主+其硬連結從者提升好感（GAS 依性格傾向裁定，日限） |
| `set_workshop` | `actionSetWorkshop` | 設工房 |
| `scavenge` | `actionScavenge` | 搜刮 |
| `second_wind` | `actionSecondWind` | 二度呼吸 |
| `scout` | `actionScout` | 偵查 |
| `get_map_nodes` | `actionGetMapNodes` | 地圖節點 |
| `move` | `actionMove` | 移動（solo 專屬，鑑賞已改走 play+moveTarget） |
| `faction_ambush` | `actionFactionAmbush` | 🥷 趁隙偷襲：撞見敵營局面後開的反應窗，偷襲落單敵從者 |
| `incite` | `actionIncite` | 🎭 挑撥離間：撞見敵營局面後開的反應窗，煽動兩組敵人反目 |
| `sync` | `actionSync` | 全量刷新 client state |
| `rest` | `actionRest` | 休息恢復 AP |
| `play` | `actionPlay` | 共用敘事引擎主入口 |
| `narrate_only` | `actionNarrateOnly` | 輕量敘事補完 |
| `tiger_dojo` | `actionTigerDojo` | 🐯 賽後番外：敗北講評／勝利祝賀 |
| `get_album` | `actionGetAlbum` | 鑑賞相簿讀取 |
| `album_delete` | `actionAlbumDelete` | 刪照片 |

> 註：多數 handler 本體不在本檔（散在 Router_*/Gallery.gs 等）；本檔只定義 `check_name`/`get_full_status`/`update_fate`/`get_tags`/`sync`/`update_rel_tag` 六個 handler ＋兩個 payload builder。

#### 🔹 四張旗標常數表（dispatcher 行為開關）
- `OWNERSHIP_CHECK_EXEMPT_`（2026-07 系統性漏洞修補新增）— 豁免中央 pcId 歸屬驗證的 action 白名單：`account_login`/`account_new_game`/`create`/`enter_kanshou`（pcId 尚不存在）、`claim_hero`/`save_hero`（走 `creator===acctName` 模型）、`get_heroes`/`get_masters`（公開名冊）、`check_name`/`check_sheets`/`dev_resync_codex`/`purge_orphans`（不涉個別玩家列）。其餘只要帶 `pcId` 一律先過 `verifyPcOwnership_`。
- `LOCK_EXEMPT_ACTIONS_` — 不取寫入鎖的 action：純讀取 ＋ 長 AI 敘事（`play`/`narrate_only`/`tiger_dojo`/`backfill_*`/`save_hero` 等）。
- `STATE_AFTER_ACTIONS` — 會改 solo 戰場、回應自動夾 `_state` 的 action（`fate_battle`/`use_seal`/`bond`/`update_fate`/`court_enemy`… 共 21 個）。
- `KANSHOU_BLOCKED_ACTIONS_` — `KPC_` 情境下明確擋掉的 solo 專屬戰鬥/經濟/結盟 action（含 `move`）。
- `STATE_PRE_DATA_`（`var`）— handler→dispatcher 整表陣列交棒全域，每次 dispatch 開頭重置。

#### 🔹 輸入防護與主進入點
- `sanitizeUserData_(userData)` — 🔴 唯一可信輸入清洗線。去控制/零寬/雙向字元＋擋公式引導字元；`name`/`npcName` 強制純中文（`cleanChineseName`）、其餘 STRICT_NAME 欄去 HTML 斷字字元截 20 字、一般欄截 2000。就地改回並回傳。
- `handleGameAction(userData)` — 主進入點/dispatcher。流程：重置 `STATE_PRE_DATA_`→JSON.parse→`sanitizeUserData_`→依 `pcId` 是否 `KPC_` 決定讀「眾生」或「鑑賞眾生」表→查 `ActionRouter[action]`→**pcId 歸屬中央驗證**（2026-07新增：帶 `pcId` 且非 `OWNERSHIP_CHECK_EXEMPT_` 者過 `verifyPcOwnership_(acctName, pcId)`，失敗回「查無御主」——修補近全部 solo action 猜中/枚舉他人 pcId 即可代操作的系統性漏洞）→鑑賞封鎖檢查→取 ScriptLock（非豁免者，8s tryLock）→跑 handler→**14 日時限中央攔截**（solo `PC_` 且回應帶 `clock` 跨第 14 日→補 `defeat`/`deadline`＋時限夢 prompt）→`STATE_AFTER_ACTIONS` 者夾 `_state`（複用 `STATE_PRE_DATA_` 或 `buildClientState_`）→finally 釋鎖。

#### 🔹 本檔定義的 handler
- `actionCheckName(...)` — 建角姓名檢查。名清洗後為空＝含非中文→擋；比對 `SEED_MASTERS.name`/`SEED_SERVANTS.realName`（皆過 `cleanChineseName`）擋正典撞名。不擋跨局同名。
- `resolveCallerGameId_(pcData, pcId, acctName)`（2026-07 再稽核抓到漏洞新增；同年再一輪稽核修正回傳語意）— `actionGetFullStatus`/`actionUpdateFate`/`actionUpdateRelTag`/`actionSetNickname`共用的呼叫者身分解析：`pcId`為`KPC_`開頭(鑑賞)一律反查帳號表(`kanshouOwnedRowIdx_`)驗證歸屬，失敗回`null`(呼叫端須視同查無此人直接回絕)；solo沿用原本裸`find`行為，**查無此列一律回`null`**(2026-07再稽核修正：原本回`""`，呼叫端只擋`null`、`""`是falsy會讓下游game_id過濾條件整個失效，退化成跨全局姓名/id搜尋——可讀任意玩家狀態甚至竄改任意受害者從者敘事欄，已修正)；「找到列但其GAME_ID欄本身是空字串」(舊資料相容)才維持回傳`""`。修的漏洞：這4支handler原本都只信任裸傳入的pcId，鑑賞context下pcId可預測/枚舉且無密碼，等同完全繞過帳號歸屬驗證，可冒名竄改/讀取任一鑑賞玩家的資料。**同步修前端**：`get_full_status`/`update_fate`/`update_rel_tag`/`kanshou_set_nickname`原本都沒送`acctName`，已在`Script.html`/`Script_Kanshou.html`補上。
- `actionGetFullStatus(...)`（2026-07 再稽核：改用`resolveCallerGameId_`＋`findPcRowIdx_`取代裸find/裸findIndex，見上）— 依 `targetName`＋自己 game_id 找該角列，回 `buildPlayerStatusString`＋是否可改命（IS_PARTY==="同行"）。關係併入眾生列，直讀 REL_MEM。
- `actionUpdateFate(...)`（2026-07 再稽核：`myGameId`改用`resolveCallerGameId_`取得，見上）— 🔵 逆天改命：只准改 4 敘事欄（trait/pref/back/intent），數值/寶具鎖死。接受 ID 或同行從者名，限本局 game_id；鑑賞（k_）豁免「同行」要求。長度上限 back 80/intent 30/其餘 130。交棒 `STATE_PRE_DATA_`。（2026-07 二度改版拔掉性格鎖：不再接受/處理 `prefLocks`，`kanshouSetPrefLocks_` 已刪除——AI 遊戲中本就不再側寫性格/萌點，鎖定機制失去意義）
- `actionGetTags(...)` — 薄包裝，回 `buildTagsPayload_`。
- `buildTagsPayload_(sheets, pcId, preData?)` — 🔧 左側狀態卡資料建構（get_tags 與 sync 共用）。組御主卡（HP 詞化/令咒/願望/禮裝/換裝）＋在世我方從者陣列（solo 靠「同行」、鑑賞靠同地點過濾），逐從者附六圍/技能/出力/寶具/魔境/符文/synergy/理想鄉/多寶具/海怪/換裝/武裝/牽手/破戒奪取旗標＋**`id`**（2026-07 id 化重構新增，供前端 `myActiveServantId` 記錄、日後系統內部指令帶 id 用）。戰鬥限定欄以 `isFateCtx`（g_）結構性擋成 null。另回 economy/bondUsed/mystic/canRuleBreak/鑑賞 locationCounts/unlockedResidences。**七度改版**：`unlockedResidences`改用`kanshouGetHeroHome_`讀住處(原本只認`KANSHOU_HERO_HOME_`，隨機分配到泛用住處池的英靈解鎖不了)。
- `buildClientState_(sheets, pcId, preData?)` — 完整 client state blob。`markRivalsSeen_`（戰爭迷霧，鑑賞跳過）＋狀態字串＋people（鑑賞/solo 分版）＋鄰近地點＋地圖描述＋時鐘/AP＋economy＋`buildTagsPayload_`＋mapNodes，全部沿用同一次整表讀。
- `actionSync(...)` — 薄包裝，回 `buildClientState_`＋success。
- `actionUpdateRelTag(...)`（2026-07 稽核：找列邏輯改委派 `findPcRowIdx_(pcData, myGameId, {name:targetName})`，取代手刻迴圈；再稽核：`myGameId`改用`resolveCallerGameId_`取得，補上鑑賞帳號歸屬驗證，見上） — 重定義關係稱呼：改該 NPC 自己列 REL_TAG。限本局 game_id；solo 要求同行、鑑賞豁免。**2026-07 五度改版＋逐按鍵稽核**：預設標籤依同一張表的 `KANSHOU_REL_TIER_.min` 把關（沒到那一階就選不了那一階；舊版「預設永遠可設」讓好感30點一下『戀人』就繞過門檻，而 `kanshouSyncRelTier_` 只在 BOND 變動時才跑，純聊天回合會一路掛著），自訂文字(不等於任一預設標籤)需 bond≥`KANSHOU_CUSTOM_TAG_BOND_`(80)——防低好感塞露骨自訂稱呼繞過親密尺度天花板(該文字會字面塞進AI提示詞當既定事實)。交棒 `STATE_PRE_DATA_`。
- `actionSetNickname(userData, pcId, sheets)`（2026-07 五度改版新增；同年稽核：找列邏輯同上改委派 `findPcRowIdx_`；再稽核：`myGameId`改用`resolveCallerGameId_`取得，補上鑑賞帳號歸屬驗證，見上）— 專屬稱呼(REL_MEM`[專屬稱呼]`)手動鎖定入口：同 bond≥80 門檻，通過後過 `sanitizeNickname_`（清 `|｜[]` ＋截20字，與 AI 寫入路徑共用同一支），寫入`[專屬稱呼]${nick}| [稱呼鎖]是`(保留既有`[態度]`段)，讓 `actionPlay_` 的 NPC 寫回邏輯尊重此鎖(偵測到`[稱呼鎖]是`就不再吃`mutual_nicknames`自動覆寫)。交棒 `STATE_PRE_DATA_`。

---

### Router_Bond.gs

羈絆／令咒／結盟／示好交涉／破戒奪僕／主從硬連結。共 **27 個函式** ＋ 3 個模組級變數（`BOND_MILESTONES_`/`BOND_ACTS`/`ALLY_UNTIL_TAG_`）。所有 MEMORY 標記一律以**全形｜**分隔。

#### 🔗 主從硬連結／喪失從者標記（MEMORY 讀寫 helper）
- `stampLostServant_(memory, svName, cause)` — 蓋【喪失從者】標記（已有則保留第一次不覆蓋）。
- `getLostServant_(memory)` — 讀【喪失從者】名。
- `getServantMaster_(memory)` — 讀從者列的【御主】名（硬連結）。
- `getMasterServant_(memory)` — 讀御主列的【從者】名（硬連結）。
- `enemyMasterMemoryFor_(pcData, gameId, servantRow)` — 由敵從者反查其硬連結敵御主的 MEMORY（供 injectMasterMeleeSupport_/injectMasterMagicSupport_ 讀對的階位）；查無回 ""。
- `markMasterLostServant_(sheet, data, svIdx, cause)` — 敵從者死亡時，就地在其硬連結（或同落點）敵御主列蓋【喪失從者】並寫回。

#### ❖ 令咒
- `actionUseSeal(...)` — 玩家令咒固定選單（`repair`/`mana`/`escape`）。repair＝從者滿血＋御主魔力回滿；mana＝回滿御主魔力（供魔源），依好感≥`MANA_TRUST_BOND_` 分流：足→過充解鎖（`setOvercharge_`）＋順勢配合 NSFW 敘事；不足→強逼壓意志、**反噬秒殺御主**（HP=0＋走 `buildDreamPrompt_` 假夢死亡流程）；escape＝御主＋從者一同遁往 `enemyRetreatLoc_`。扣一道令咒（`setPlayerSeals_`）。注 `sealGenderFact_` 性別事實。交棒 `STATE_PRE_DATA_`。

#### 💕 羈絆互動
- `getBondUsedToday_(memory, day)` — 讀【羈絆日】當日已用互動清單（跨日重置）。
- `setBondUsedToday_(memory, day, type)` — 寫回當日已用互動。
- `getBondMilestonesFired_(memory)` — 讀【羈絆里程碑】已演出門檻陣列。
- `setBondMilestonesFired_(memory, arr)` — 寫回已演出門檻。
- `actionBond(...)` — 唯一「相處」互動（`BOND_ACTS.together`，每遊戲日一次、+10 羈絆、耗 1 AP）。AP 不足先擋→日限檢查→`raiseBond_`＋寫日限標記→`spendAp_`→取最新 BOND→算里程碑候選（30/60/90，`BOND_MILESTONES_`）→`enemyAmbushOnServant_` 卸防突襲（1.2 倍）。四種 aiPrompt 分支：陣地反擊/遭突襲/里程碑質變/尋常相處。**里程碑被奇襲打斷時故意不標記**，留待下次補演。交棒 `STATE_PRE_DATA_`。

> 禮裝已全面被動化（`injectMysticBuff_`/`MC_COMBAT_`），原 `actionUseMystic` 已移除——本檔僅留註解說明。

#### 🤝 結盟三部曲（盟約標記＝敵御主/敵從者列 MEMORY 的【盟約至】<day>）
- `isAllied_(row)` — 是否結盟中。
- `hasAllyInGame_(pcData, gameId)` — 全世界是否尚有在世盟友（供情報共享無視戰爭迷霧）。
- `allyUntil_(row)` / `setAllyMem_(memory, untilDay)` / `clearAllyMem_(memory)` — 【盟約至】整數標記讀/寫/清（`ALLY_UNTIL_TAG_ = makeIntTag_`）。
- `masterPersonaLean_(masterRow)` — 御主性格傾向分類器（`pragmatic`/`loner`），`allianceWillingness_`/`actionCourtEnemy` 共用的單一真實來源。
- `bondFavor_(row)` — 把 BOND(0~100) 換算成機率加減項 `[-0.67,+1.0]`，供結盟意願／示好交涉／（Router_Movement.gs）夜襲卸防等機率判定共用。
- `allianceWillingness_(masterRow, aliveFoes)` — 🎲 GAS 判定結盟意願（0.05~0.9）：依對方性格詞加減＋剩餘敵從者數（越少越不肯）＋`bondFavor_(masterRow)*0.3`（好感越高越肯結盟）。不靠 AI。
- `actionProposeAlliance(...)` — 對同地敵御主提議（npcId 精準→`nameLoose_` 比對；須已登場 `hasArrived_`）。`Math.random() < w` 判定；成盟＝盟主＋其同地從者一併標【盟約至】(day+3)、AI 只演談判。查無時回診斷訊息（對方在哪 vs 你在哪）。交棒。
- `actionBreakAlliance(userData, pcId, sheets)`（2026-07 補 `npcId` 精準配；同批再補硬連結同步解除）— 單方撕毀盟約：清掉匹配敵御主/敵從者的【盟約至】。`userData.npcId` 有給先 id+game_id 精準比對命中對象，比對用的名字改抓該列真名（非玩家傳入、可能過期的字串）；查無 id 才退回原本 `nameLoose_` 子字串批次撕毀。**硬連結同步**：撕毀對象若有主從硬連結（`getMasterServant_`/`getServantMaster_`），對應的另一方（撕毀敵御主→連帶其硬連結敵從者，反之亦然）一併納入 `isMatch` 比對範圍撕毀，避免舊版只解一側、另一側殘留【盟約至】卡在「已結盟」狀態。MEMORY 整欄批次寫回。交棒。
- `breakStaleAlliances_(sheets, gameId, preData?)` — ⏳ 盟約自然瓦解：效期到 或 存活敵從者≤3（強制翻臉）。整欄批次寫回，回破裂御主名單。
- `bumpBond_(sheets, pcData, npcIdx, delta)` — 該 NPC 列 BOND ±delta（0~100，起步預設 40），寫回回傳新值。
- `actionAllyBond(...)` — 與同地盟友交流（+6~11 羈絆）。AP 不足先擋→`enemyAmbushOnServant_`（1.3 倍，未結盟敵從者趁隙）→`bumpBond_`→達 90 蓋【摯交】（純敘事親疏標記，**無鑑賞入口意義**——原【鑑賞緣】戰後納入鑑賞名冊機制已砍）。四級羈絆嚴控親疏 tier；盟友御主用 `enemyMasterCard_`、盟友從者用 `servantCard_`。★真親密一律留戰後鑑賞，戰場絕不開慾海引擎。交棒。

#### 🕊️ 示好／交涉
- `actionCourtEnemy(...)` — 對同地未結盟敵御主+其硬連結從者示好（`court_enemy`）。GAS 依 `masterPersonaLean_`+`bondFavor_`裁定好感增量，日限一次；不靠 AI 判定成敗，AI 只演交涉過程。交棒。

#### 🗝️ 破戒奪僕
- `actionRuleBreakSteal(...)` — 對打殘（HP<35%）同地敵從者斬契奪為第二從者。閘門：`canRuleBreak_`（Caster 美狄亞或破戒禮裝）＋從者數<2＋令咒>0＋已登場＋非盟友＋HP<35%。轉陣營「從者」、HP 回半、清舊主殘留標記（【御主】/【寶具預告】/【盟約至】/【靈基透支】）＋蓋【破戒奪取】，扣一道令咒，`raiseBond_` +10。交棒。

---

### Router_Narrative.gs

SOLO 專用輕量敘事引擎（鑑賞的 actionPlay/buildDefaultSystemPrompt 在 Gallery.gs，兩軌不共用）。共 **10 個函式**。

#### 羈絆／願望 helper
- `raiseBond_(sheets, gameId, pcName, svName, delta, preData?)` — 提升御主×從者羈絆（該從者列 BOND，地板 0）。`gameId` 由呼叫端直接傳（不反查，避免跨局撞名綁錯局）。跨多檔共用。
- `extractWish_(memory)` — 取【願望】內容（show-don't-tell，僅供虛假之夢）。

#### 虛假之夢／勝利夢 prompt
- `buildDreamPrompt_(pcName, wish, servantName, cause?)` — 敗北安慰幻象 prompt；`cause==='timeout'`＝第 14 日時限耗盡（時鐘停格破綻），否則＝戰鬥/補魔敗死。結尾要露破綻、收在心碎。
- `buildVictoryDreamPrompt_(pcName, wish, servantName)` — 勝利真實結局 prompt（結構同上但**不露破綻**、收在如釋重負）。

#### 敘事核心與清洗
- `cleanNarrateEcho_(promptText)` — 把送 AI 的提示詞洗成玩家可見的簡短回顧（去演出卡〈〉/前綴〔〕/★指令/·素材/【標籤】，截 80 字），供歷史顯示。
- `stripLeakedScaffold_(text)` — 防禦性過濾：清掉 AI 誤 echo 的 ★指令與〈演出卡〉；**刻意不清【標籤】**（fallback 文案靠它當視覺標籤）。
- `narrateWithState_(pcId, sheets, promptText, miniSystem, opts?)` — 🟢 共用敘事核心。組 aiConfig（temp 0.85、ignoreLaw、maxTokens 預設 720、model 預設 `AI_MODEL`）＋最近 2 筆歷史＋自動附「當前狀態」（御主/在場從者 HP/共用魔力池）＋`buildTrajectoryDigest_` 軌跡骨幹（同一次整表讀）→`callGeminiAPI`→解析 `{narration}`（過 `stripLeakedScaffold_`）；解析失敗回 null。
- `actionNarrateOnly(...)` — 輕量敘事補完 handler（結算已由 GAS 完成）。`isNsfw` 純看 pcId 是否 `KPC_`（不信前端旗標）。內含完整 `miniSystem` 鐵律（第一人稱「我」、`dialogueFormatRule_`、`<br><br>` 分段、show-don't-tell、依當前狀態不臆測勝敗、服裝依卡）。`longForm` 旗標→maxTokens 2000（補魔高好感解鎖分支用，模型不變）。存歷史時存 `narrateMemoryLine_` 摘要（非整串提示詞）。

#### 🐯 老虎道場（賽後番外）
- `dojoCauseLine_(userData)` — 敗因鍵（`DOJO_CAUSE_` 五格：deadline／seal_backlash／ambush／assassination／battle）＋名字/寶具旗標 → `{fact,lesson}`；鍵不在表上回 null。
- `actionTigerDojo(userData, pcId, sheets)` — 🐯 敗北講評／勝利祝賀 handler（action `tiger_dojo`）。**刻意不走 `narrateWithState_`**：道場是賽後教室，`miniSystem` 的「第一人稱我·不用你」「語氣依血量·瀕死就是命懸一線」跟兩人對話＋輕鬆詼諧正面衝突；自帶說書人設定，不讀表、不帶歷史、不存歷史。失敗回 `{success:false}` 讓前端 `dojoFallbackHtml_` 接手。

---

### Router_Persona.gs

演出依據卡建構器：跨戰鬥/移動/召喚/羈絆/結盟全域共用的「AI 演出依據」。共 **11 個函式** ＋ 2 個 label 陣列（`PREF_LABELS_`/`TRAIT_LABELS_`）。

#### 口吻/小動作 MEMORY helper
- `getPersonaSpeech_(memory)` — 讀【口吻】。
- `getPersonaTic_(memory)` — 讀【小動作】。
- `stampPersonaFlavor_(memory, speech, tic)` — 召喚建列時把種子口吻/小動作附加到 MEMORY 尾（有值才附，截 40/30）。
- `codexPersona_(name, cls?)` — 查英靈殿人設 JSON（6h 快取）；優先「真名＋職階」吻合、找不到退回純真名比對（處理斯卡哈同真名跨職階）。供 `servantCard_` 在列上缺欄位時 fallback。

#### 四段標籤化
- `quadLabeled_(raw, labels, skipNone)` — PREF/TRAIT 的「、」分段值逐格加標籤餵 AI（格數＝`labels.length`）。值落在 `QUAD_EMPTY_` 的整格不送。
- `traitLabeled_(raw, skipNone)` — 特徵格的專用出口＝`quadLabeled_(traitParts_(raw), TRAIT_LABELS_, skipNone)`。三張角色卡（`servantCard_`／`masterCard_`／`enemyMasterCard_`）共用，別在各處各修一次。⚠ `skipNone` 現已無實際作用（兩種呼叫端都走同一份 `QUAD_EMPTY_`），保留只為相容既有呼叫。
- `QUAD_EMPTY_`（常數）— **無資訊量佔位字的唯一名單**：`parseTraitsHelper` 各 fallback 的每一格（外貌出眾/外貌平凡/舉止從容/卸下心防…/沉著表象/堅定內裡/珍視之物/厭惡之事/通曉魔術/深藏心事）。2026-09 補齊——漏收的佔位字會被當成真資料送進提示詞（實測一張敵從者卡曾同時夾帶「喜歡的事物：珍視之物」「討厭的事物：厭惡之事」「身世：Archer 職階英靈」三格純噪音）。新增 fallback 時要同步這裡。
- `PREF_LABELS_` = [日常表象, 真實內裡, 喜歡的事物, 討厭的事物]；`TRAIT_LABELS_` = [外貌本相, 氣質舉止, 自稱與口氣, 卸下心防的私密一面]。

#### 演出卡（回傳一段塞進 narration prompt 的字串；show-don't-tell 禁複述設定字面）
- `buildArrivePrompt_(a)` / `arriveStanceNotice_(stance, isSeek)`（2026-09 新增，`Router_Movement.gs`）— 🚶 **抵達敘事提示詞的單一真實來源**，從 `Script.html` 收回後端。分【抵達/此地】【剛發生】【在場】＋★怎麼演四段；篇幅查 `ARRIVE_WORDS_`（依追擊/撞見/有敵幾件事）；敵方演出卡上限 `ARRIVE_FOE_CARD_CAP_ = 4`。`actionMove` 回傳 `arrivePrompt`，前端只負責 `narrate(data.arrivePrompt)`。
- `performanceNote_(names)` — 🎭 表演總則（單一真實來源）：show-don't-tell／正典認知覆蓋／羈絆親疏，內容對「這次同框的每一位角色」皆固定不變，只需講一次。`names` 傳入這場戲實際同框的所有真名；`servantCard_`/`enemyMasterCard_` 傳 `opts.skipClose:true` 時各自省略內建收尾，改由呼叫端組完所有角色卡後呼叫本函式統一收尾一次（2026-07 提示詞瘦身：避免多角色同框時每張卡各自重複一份逐字相同的收尾句）。
- `servantCard_(row, opts?)` — 🎭 從者卡（我方/敵/盟友共用同一份）。真名/職階/對自己御主態度/四段個性/口吻（含自稱）/萌點/小動作/外貌三段（`looksToTraitParts_`）/身世/陣營/關係稱呼/換裝/武裝/寶具。⚠ 2026-09 自稱不再自成一欄：尋常的「我」沒有資訊量直接不提，有特色（吾／俺／拙者／余…）才併進【口吻】講一次；狂化者的 fp 是「（狂化·僅咆哮）」這種標記、也不提。`back` 的無資訊量過濾加收 `/職階英靈$/`（`Seed_Rivals.gs` 寫給敵從者的佔位字）。附 ★換裝、★武裝·絕對（禁依職階或原典武器習慣改寫）、★狂化·絕對（`mad` 偵測→禁台詞只咆哮）三條硬指令。`opts.skipClose:true` 時省略內建的 `performanceNote_` 收尾（多卡同框呼叫端用，見上）；不傳 opts（絕大多數單卡呼叫端）行為不變。缺欄位退回 `codexPersona_`。**CLAUDE.md 紅線②強制載體。**
- `masterCard_(row)` — 🎭 御主卡（精簡）。性別/四段個性/四段特徵/萌點/身世/出身（`getMasterOrigin_`）/魔術系統+階/體術階/願望（僅供氛圍禁直述）。★可依性格給御主台詞反應，但**不可替玩家拍板戰略抉擇**（收尾不限問句，思索/備戰姿態/屏息對峙皆可，連續回合別重複同一種收尾）。讀 `getPlayedMaster_`→若扮演正典御主則提示 AI 調用原作形象。
- `sealGenderFact_(masterSex, svSex, svName)` — 令咒補魔 NSFW 用性別配對事實（異/無按女性向處理）：女女→禁陽具插入描寫、無固定插入方；其餘→依各自實際性別合理呈現。與 kanshou Gallery.gs 邏輯類似但**完全獨立不共用**（紅線① solo/kanshou 隔離）。
- `enemyMasterCard_(row, opts?)` — 🎭 敵御主卡（精簡）。戰鬥現場敵御主在場時給反應/台詞用；四段個性/特徵/萌點/身世（取「。外貌：」前段）/陣營/魔術/體術/願望。★正典人物優先調用原作形象、禁劇透未揭露身分；★非沉默背景板但勝負傷害不可改（此句為敵御主專屬行為準則，不受 skipClose 影響、恆常保留）。`opts.skipClose:true` 時省略「正典認知優先/show don't tell」那段（與同框的 `servantCard_` 一併併入同一次 `performanceNote_`）。與 masterCard_ 不同：AI 可自決其言行（NPC）。

#### 我方從者索引
- `findPlayerServantIdx_(pcData, gameId, wantName?, wantId?)`（2026-07 id 化重構：改委派共用 `findPcRowIdx_`）— 取我方在世從者列索引；`wantId` 有給先精準比對（id 不合規則自動退回名字），否則 `wantName`（`nameLoose_` 容錯分隔符變體），皆查無則取第一個在世從者（雙從者用）。被 actionUseSeal/actionBond/actionBattle 等 13+ 處呼叫，前端統一多帶 `servantId:myActiveServantId`。
# 逐函式文件：創角／移動／經濟三檔

---

### Router_Creation.gs — 創角／召喚／工房

御主創角＋敘事非阻塞補生成＋召喚從者＋工房(製造/修改/認領原創英靈)。共用 GAS 全域作用域。

#### 御主創角

- `actionManualNpc(userData, pcId, sheets)` — 御主創角(action="create")。入口先擋帳號重入(已綁定進行中局的帳號再次呼叫直接拒絕，防孤兒角色/從者)。非阻塞：不叫 AI，用種子值秒寫一列御主進表。清洗姓名(僅中文，空即擋)、擋正典御主/從者撞名(`SEED_MASTERS.name`/`SEED_SERVANTS.realName`，經 `cleanChineseName` 正規化；扮演正典御主 `playedMaster` 例外放行並還原正典原名)。開新 `game_id`(`g_` 前綴)世界；`masterMaxHpMp_` 依迴路算 HP/MP；確定性選落點(偏好新都)；MEMORY 寫入願望/魔術/迴路/出身/體術/魔術階位/令咒3/模式(canon|chaos)/戰爭(4th|5th)/扮演，各欄過 `cleanTagText_(s, maxLen)`(2026-07新增可選長度參數)剝 `｜【】\n\r\t`；起始禮裝經 `MYSTIC_CODES` 驗證(passive)後 `equipMysticToMemory_` 帶入；種子敘事欄(TRAIT/PREF)用 `parseTraitsHelper` 預設值。`appendRow` 後 `linkAccountToPc_` 綁帳號。**副作用**：寫 PC 表新列。**🐛→✅ 稽核抓到**：`standing`(身世)/`wish`(願望)開局只靠前端`maxlength=40`擋，backend原本沒設上限——`newRow[COL.PC.BACK]`已補`.slice(0,40)`、`wish`已改走`cleanTagText_(wish,40)`。
- `actionBackfillMasterAi(userData, pcId, sheets)` — 御主敘事非阻塞補生成(召喚頁背景執行)。以 `callGeminiAPI`(`ignoreLaw:true`)生 background/traits/personality/npc_intent，只用**單格 setValue** 覆蓋敘事欄(BACK/TRAIT/PREF/INTENT)、且僅 AI 有給值時才寫；數值/MEMORY/位置一律不碰。呼叫 AI 前索引可能因清列位移，寫回前用 `buildLiveIdIndex_` 重新以 ID 定位，列被刪則放棄。失敗保留種子預設。**🐛→✅ 稽核抓到**：餵進 AI 提示詞的 `appearance`/`standing`/`wish` 原本也沒有長度上限，已補跟前端一致的上限(appearance30／standing・wish40)。

#### 召喚小工具（MEMORY 讀取器＋橋接）

- `svNum_(rank)` — 六圍階級→內部數值(`rankVal`)，最低 8。
- `getWarMode_(memory)` — 從 MEMORY 讀【模式】(canon|chaos)，預設 canon。
- `getWarName_(memory)` — 鋪敵用戰爭字串：混亂→"chaos"；正史→【戰爭】(4th|5th，預設 5th)。
- `getPlayedMaster_(memory)` — 讀【扮演】正典御主 id(自創則空)。正則須排除全形分隔符 ｜(U+FF5C)避免吃進下個標籤。

#### 英靈殿讀取（前端瀏覽）

- `actionGetHeroes(userData, pcId, sheets)` — 回傳英靈殿全員 `[{id,cls,name,gender,np,src}]` 供前端瀏覽；`src==='ai_gen'`(玩家原創)另附 creator＋工房編輯預填 detail(six/skills/align/look/pref/moe/fp/toMaster/speech/tic/back/weapon)。讀 `getHeroCodexCached`。
- `actionGetMasters(userData, pcId, sheets)` — 取某場戰爭(4th/5th)的正典御主清單，供「扮演正典御主」帶入預設。依 `FATE_4TH/5TH_ROSTER` 對照 `getMasterCodexCached`，回 {id,name,sex,appear,magic,wish,servant}。

#### 工房驗證/清洗（helper）

- `ALLOWED_FX_`（var）— 引擎實際吃得到、且**開放給工房/AI** 的 fx 白名單。刻意排除頂級概念寶具(ea/gob/excalibur/ubw/summon_horror/chain/wealth/divine_core)與需專屬 UI 的機制 fx(mage_realm/rune)——留給手工種子。
- `FX_MENU_`（var）— 餵 AI 的中文 fx 選單字串(挑契合英靈的效果碼)。
- `sanitizeSkills_(arr, maxCount)` — 清洗 AI 技能陣列為 `[{n,r,fx}]`：階級驗證(E~EX/±)、fx 用 `hasOwnProperty` 查 `ALLOWED_FX_`(防原型鏈污染)不在則清空、`maxCount` 由呼叫端傳真實預算上限。
- `sanitizeSix_(o)` — 清洗六圍(6 鍵齊全、階級合法、缺補 C)；EX 級最多留 2 項，超額降 A(防全 EX 破台角色寫回英靈殿)。
- `originGuide_(origin)` — 依創角來源選擇(`fate`/`anime`/`original`)回傳對應的 AI 敘事框架字串+技能命名規則+人設提示前綴，供 `actionSaveHero`/`actionSummonServant` 的 AI 補生成分支共用，讓自訂/AI 生成從者依其宣稱來源忠於原作而非一律當純原創處理。
- `tagSkillKind_(arr, kind)` — 幫技能陣列每項蓋上 `kind:'class'|'skill'` 標記後併入 `TAGS`，讓前端能分辨「職階技能」與「個人技能」而不必自行猜 fx 碼。
- `recordOriginalHero_(name, cls, sex, sixJson, classSkills, skills, traits, np, personaWords, align, pExtra)` — **唯一寫進共用英靈殿的入口**。名字剝 HTML 斷字字元；同名或同 id(`name-cls`)已存則不收(防短名撞種子 id 被 `upgradeCodexPersonas_` 覆寫)。當場用 `translateMoeToDaily_`/`translateLookToDaily_`/`translatePersonalityToDaily_` 產好日常版(DAILY_LOOK/OUTFIT/WORDS/MOE)寫入。**副作用**：appendRow 英靈殿＋清 `FATE_HERO_CODEX` 快取。
- `FORGE_CLS_SKILLS_`（var）— 職階技能慣例表(工房自動附贈、不占 3 槽)。
- `forgeCost_(six, skills, npScale)` — 工房單一計價函式(六圍成本+寶具規模加成+技能計價三軌`FLAT_FX_`/`SKILL_PTS_BIG_`/`SKILL_PTS_SMALL_`)，`parseForgeBuild_`(預算上限檢查)與 `bumpSixToFloor_`/`capSixToBudget_`(AI 生成六圍下限/上限修正)三處共用同一份計價邏輯。
- `bumpSixToFloor_(six, skills, npScale)` — AI 生成從者六圍常低於工房 340 預算下限(即便提示詞已要求)，把總值墊高到預算下限(EX≤2 上限仍受限)，避免AI原創從者體感偏弱。
- `capSixToBudget_(six, skills, npScale, cls)` — `bumpSixToFloor_`的反向邏輯：AI 生成六圍超出預算(含狂化職階+30 加成)時砍最強一項六圍降規費，避免 AI 隨手生出超預算破台角色(舊版只有下限保底、沒有上限，此為後續補上的對稱修正)。
- `parseForgeBuild_(build, reqCls)` — 工房 build 解析＋全套驗證(單一真實來源，`actionSaveHero` 召喚/修改分支共用)。預算 340，六圍+技能(≤4，第4欄+20)+規模同錢包(EX≤2)，呼叫 `forgeCost_` 計價，超預算直接拒絕(無 AI 式的「打回重填」來回)；剝寶具高規模關鍵字(對城/對界/對神/常駐寶具)、擋正典名、七演出欄清洗。**「御主」職階**特例：略過全部戰鬥驗證、強制清空六圍/技能/寶具。回 `{ok:false,message}` 或 `{ok:true,...欄位}`。

#### 工房存檔/認領/召喚（action 入口）

- `actionClaimHero(userData, pcId, sheets)` — 認領無主原創英靈(action="claim_hero")。僅 `ai_gen` 且無 `persona.creator` 者可認領，先到先得。**副作用**：寫 PERSONA 格＋清快取。
- `actionSaveHero(userData, pcId, sheets)` — 工房存檔(action="save_hero")。**修改模式**(帶 heroId)：僅創造者可改、真名不可改、`御主↔戰鬥職階`破壞性切換需 `confirmMasterConvert` 二次確認、演出欄非空覆寫/空保留、寶具英文名沿用舊值、重算日常快取，整列 setValues。**製造模式**：`parseForgeBuild_`＋重名擋→AI 補玩家沒填的演出欄與寶具英文名(`callGeminiAPI`，失敗不擋)→`recordOriginalHero_` 鑄入。**副作用**：改/寫英靈殿列＋清快取。
- `actionSummonServant(userData, pcId, sheets)` — 召喚從者(寫進御主自己 game_id 實例、設同行)。已有從者則擋。三條尋敵路徑：heroId 指定／trueName 比對(同名多職階優先 match reqCls)／隨機抽；`custDesc` 自訂描述強制走 AI 原創。**種子路徑**：讀寫死六圍/技能/persona，血 `150+耐久×6`、MP=0(出力電池制靠御主供魔)、god_hand 復活命數處理、`stampPersonaFlavor_` 存口吻/小動作。**AI 路徑**：`callGeminiAPI` 生完整六圍(帶 fx)＋技能，`sanitizeSix_`/`sanitizeSkills_` 清洗，np 規模剝城/界/神→對軍，缺 realName/six 視為失敗中止；不重名則 `recordOriginalHero_` 寫回英靈殿。落列後：重算御主共用魔力池(`masterPoolMax_`)並補滿(只寫 MP/MAX_MP 兩格)；`seedRivalsForGame_` 一次性鋪敵方御主×從者；回召喚登場 `summonPrompt`。**副作用**：appendRow 從者列、寫御主 MP、鋪敵、可能寫英靈殿。

---

### Router_Movement.gs — 地圖／移動／休息／偵查／搜刮／整備／工房／卸防突襲／撤退追擊／敵營局面

「在地圖上做的事」全集＋對應 MEMORY 標記存取器。共 **31 個函式**（2026-07 大幅擴充：撤退按鈕定案、敵營局面 8 種結局、挑撥/趁隙偷襲反應窗）。

#### 地圖節點

- `buildMapNodesPayload_(sheets, pcData, myGameId, myLoc)` — 建視覺地圖節點 payload(`{nodes,here,allyIntel}`)，供 `actionGetMapNodes` 與 `buildClientState_` 共用(省 round-trip)。非 solo(無 `g_` game_id)回空形狀。依【戰爭】標記過濾據點；只取頂層冬木地點(無 PARENT)；統計已偵查(SEEN)/盟友情報(`hasAllyInGame_`)揭露的敵人數，計入登場閘門(`hasArrived_`)、排除 DEAD_/盟友。讀 `getMapDataCached`(靜態常數、零 I/O)。
- `actionGetMapNodes(userData, pcId, sheets)` — 薄封裝：讀 PC 表定位自己→呼 `buildMapNodesPayload_`。

#### 移動（主流程·最複雜）

- `actionMove(userData, pcId, sheets)` — 移動到 target(耗 2 AP，鑑賞 k_ 不耗)。**2026-07 撤退機制改版·玩家定案**：追擊已【全數轉移到撤退按鈕】，不再是任意離開時的機率事件——(1) 若出發格有非盟友敵從者在場，一般移動直接擋成 `needRetreat`(除非開啟「趁隙」窗、在自家陣地、或本已是撤退中)；(2) 只有 `isRetreat===true`(玩家按撤退按鈕)才會觸發追擊，且**必定發生**(非機率)，優先「預告寶具背擊」(`getNpTelegraph_`＋`enemyCanAffordNp_`/`drainForNp_`，`resolveFateBattle_` np 級，保 1)，否則最快敵從者(敏≥我方、BOND<50、非盟友)一次真交鋒；不再有「姿態(stance)微調機率」這個機制(已隨改版整個移除)。流程：驗目的地存在於坤圖(母區/分支名，擋偽造傳送地圖外)→撤退追擊判定→抵達態度判定(`preFoesAtTarget` 先客=警惕)→**世界先 tick**(`spendAp_ skipWrite`＋`worldTick_`＋`breakStaleAlliances_`，原地改 allPcData)→玩家與同行從者落 target→套用追擊扣血(保 1、清預告旗標、補戰報 `pursuitReport`＋foeCard)→**敵營局面**(`resolveFactionEncounter_`：target 有≥2 敵御主時擲 8 種加權結局，非只有舊版單一「已鏖戰」)→**盟友告急**(`detectAllyPeril_`：worldTick 後盟友在他處遇襲→報信+一鍵馳援)→**遇敵態度**(依在場敵對者好感裁定溫和/戒備/殺氣定調，`foeMoodNote`)→**時回**(`applyRegen_` ×1，移動 2 小時自然回復)→整表 `setValues` 寫回→`markRivalsSeen_` 就地偵查→組抵達場景(mapDesc/servantCard/foeCards/perfNote/people/locations/mapNodes)。設 `STATE_PRE_DATA_` 交棒免整表重讀。**副作用**：整表寫回、tick 敵人、扣血、扣 AP、標偵查。
- `actionRest(userData, pcId, sheets)` — 休息(玩家選 1~12 小時，每小時+2 AP，回復＝時回 ×2)。**FATE 分支**：`applyRegen_` ×2、休滿重置體態、`restHours_` 推時、`worldTick_`(每 3h 一輪、`breakStaleAlliances_`)、`enemyAmbushOnServant_`(夜襲 mul 1.5，最兇險)、**從者之夢**(安睡≥3h 未遭襲 25% 機率 `raiseBond_`+3＋回想 prompt)、夢優先序(夜襲敗夢>令咒透支勝利夢>空)。**舊版非 FATE 分支**：全回滿(經濟層已移除、不收費)。設 `STATE_PRE_DATA_`。**副作用**：整表寫回、推時、tick、可能夜襲扣血/致敗。
- `actionPrepMeal(userData, pcId, sheets)` — 整備進食(耗 1 AP)。MEMORY `stampMeal_` 蓋章給 `MEAL_BUFF_HOURS` 小時的命中 +`MEAL_BUFF_BONUS`(戰前 buff)。單列寫回＋`spendAp_`＋整備演出 aiPrompt。

#### 卸防突襲（共用引擎·被四處呼叫）

- `enemyAmbushOnServant_(sheets, pcData, pIdx, gameId, baseMul, preferSvIdx?)`（2026-07 補 `preferSvIdx`）— 卸防突襲共用引擎(休息/羈絆/結盟/補魔/修復皆呼叫)。同地有清醒未結盟敵從者且我方有從者時觸發。`preferSvIdx` 有給且驗證通過(`preferOk`)則優先鎖定該從者(供 `actionBond`/`actionAllyBond`/`actionManaSupply`/`actionSpiritRepair`/`actionRest` 傳入各自已解析好的 `findPlayerServantIdx_` 結果)，查無效才退回舊行為(取第一個在世從者)——修的是雙從者對局時突襲永遠打到表上第一位、跟玩家實際操作的那位對不上的錯位。**陣地反擊**優先(`homeTerritoryRank_`)：御主付魔(20+階×0.6)維持結界則從容擊退來犯者(敵扣血保 1、我方無傷)，魔力不足才照常挨襲。無陣地時依敵從者職階/性格擲三way局面(`ambush` 62%／`observe` 20%／`probe` 18%，依 `masterPersonaLean_`+當前 BOND 加權)：狂化(無法言語)/暗殺(本色即偷襲)必定 `ambush`；其餘職階多數 ambush、有機會落「按兵不動」或「試探性接觸」(皆無戰鬥，回傳 `peaceful:true`)。`ambush` 分支：`resolveFateBattle_`(ambush+施放技術)、Assassin/stealth ×1.4、傷害取敵方端(擋下則底傷依敵筋力)、`survive`/`god_hand` 保命判定、致命則 `DEAD_` 標記＋雙從者存活檢查(全滅才 defeat＋`buildDreamPrompt_`)、附 foeCard/report 戰報卡。**副作用**：寫從者/敵 HP、可能致敗。

#### 撤退追擊／敵營局面／挑撥偷襲反應窗（MEMORY 標記＋2026-07 玩家定案的撤退機制）

- `getEnemyPact_(memory)` / `setEnemyPact_(memory, partnerName, untilDay)` — 讀/寫敵御主 MEMORY【敵盟】：`resolveFactionEncounter_` 擲中 `pact` 結局時記錄兩敵御主暫時結盟。
- `getEnemyFeud_(memory)` / `setEnemyFeud_(memory, partnerName, untilDay)` — 讀/寫敵御主 MEMORY【交惡】(與【敵盟】互斥)：`actionIncite` 挑撥成功後記錄兩敵御主反目，下次相遇更容易擲中 `frenzy`/`hunt`。
- `getWaryAbs_(memory)` / `setWary_(memory, absHour)` — 讀/寫敵從者 MEMORY【提防】絕對時刻標記：玩家對其偷襲得手(非致命)後，`WARY_HOURS_`(6h)內壓低玩家再度趁隙偷襲同一敵從者的成功率。
- `resolveFactionEncounter_(allPcData, mA, mB, svA, svB, gameId, day)` — 🎲 資料驅動的敵營局面加權骰子(frenzy/standoff/hunt/unite/pact/truce/parley/clash/allied_pair 共 9 種結局)，玩家抵達同地有≥2 組敵對敵御主時擲一次；會就地真的扣血(非只是敘事)，部分結局寫【敵盟】/【交惡】標記。取代舊版「一律判定已鏖戰、輸方扣餘傷」的單一寫死行為。
- `encounterChoices_(type)` — 查表：依 `resolveFactionEncounter_` 擲出的局面種類，回傳這場戲要開放哪些反應按鈕(偷襲/挑撥/靜觀)。
- `setEncounterWindow_(memory, loc, type, names)` / `getEncounterWindow_(memory)` / `clearEncounterWindow_(memory)` — 讀/寫/清御主 MEMORY【趁隙】`<loc>@<type>@<names>` 標記，記錄這場敵營局面實際牽涉的兩個真名，供 `actionIncite`/`playerAmbushOnEnemy_` 精準指名(而非猜陣列順序)。
- `playerAmbushOnEnemy_(sheets, pcData, pIdx, gameId, targetName)` — 「趁隙偷襲」核心：玩家從者在敵營局面開的反應窗內偷襲一名分心的敵從者，依羈絆/性格算傷害倍率，命中後蓋【提防】標記(冷卻期)。`enemyAmbushOnServant_` 的鏡像版本(反過來由玩家主動偷襲敵人)。
- `actionFactionAmbush(userData, pcId, sheets)` — 「趁隙偷襲」action 入口(耗 1 AP)：驗證反應窗仍開著→呼叫 `playerAmbushOnEnemy_`。
- `actionIncite(userData, pcId, sheets)` — 「挑撥離間」action 入口：依 `masterPersonaLean_`+羈絆算成功機率，成功→兩名敵人真的互毆扣血＋蓋【交惡】；失敗→兩邊聯手戒備玩家、玩家羈絆雙雙−4。
- `detectAllyPeril_(pcData, gameId, playerLoc, curDay)` — 掃描世界(worldTick 後)是否有已結盟盟友在他處被敵從者纏上，供 `actionMove` 的「盟友告急」報信+一鍵馳援用。

#### 強撐

- `actionSecondWind(userData, pcId, sheets)` — 強撐(扣御主 20% 上限 HP 換 +4 AP)。不耗 AP、可重複，HP 為天然煞車。AP 尚足或血太虛則擋。`grantAp_`＋強撐演出 aiPrompt。

#### 陣地／工房（MEMORY 標記＋主場結界）

- `WORKSHOP_TAG_`（var）— `makeTextTag_('陣地')` 產生的標記工廠。
- `getWorkshop_(memory)` / `setWorkshopMemory_(memory, loc)` — 讀/寫御主 MEMORY【陣地】loc。
- `homeTerritoryRank_(pcData, pIdx, gameId)` — 主場陣地判定：玩家於自設陣地(同母區)迎戰時恆回至少基礎 **D 階**防禦；隊上另有【territory】從者才再往上升到其陣地作成階。（2026-07 修正：舊版沒有陣地作成從者就回空＝毫無防禦，跟「設了陣地」的承諾不符，改成人人有基礎防禦、有專精從者再加成。）
- `injectHomeField_(c, rank)` — 把「主場·陣地結界」buff(`DEF_FX_ home_field`)注入我方從者戰鬥單位(隨階減傷)。
- `WORKSHOP_MANA_COST`（var=40）— 佈設陣地魔力成本。
- `actionSetWorkshop(userData, pcId, sheets)` — 設置陣地(耗 1 AP＋40 魔)。當前地設為工房(MEMORY【陣地】)：提升駐留供魔＋主場結界/安全港前提。扣魔＋標記單列寫回＋`spendAp_`＋佈設演出 aiPrompt(有 Caster 則其築結界)。

#### 搜刮／偵查

- `SCAVENGE_TAG_`（var）— `makeTextTag_('搜刮')` 標記工廠。
- `getScavengedLocs_(memory)` / `addScavengedLoc_(memory, loc)` — 讀/寫 MEMORY【搜刮】已枯竭地點**清單**(非單一 loc)。舊版 `getScavengedLoc_`/`setScavengedLoc_` 只記得住最近一個搜過的地點，玩家可在 A/B 兩地間來回無限白嫖枯竭懲罰；改成清單記住所有已搜過的地點、用 `indexOf` 判斷。
- `actionScavenge(userData, pcId, sheets)` — 搜索物資(耗 1 AP)。撿零星魔力(基礎 ~10% 上限，同地重搜枯竭僅 ~3%)＋35% 機率揭露一名最近未偵查敵(標 SEEN)。單列寫回＋`spendAp_`＋搜索演出 aiPrompt。
- `actionScout(userData, pcId, sheets)` — 偵查(耗 1 AP)。以 `getNearbyLocations` 定範圍(含當前)，揭露範圍內敵御主/敵從者(標 SEEN)。`spendAp_`＋偵查演出 aiPrompt(只給有無揭露、不夾座標)。

---

### Router_Economy.gs — 靈基出力／魔境／符文／換裝武裝／補魔／修復

玩家可調的從者旋鈕(樂觀更新 setter)＋補魔/修復(硬擠迴路回滿共用池)。

#### 從者旋鈕（免費·即時·不耗 AP·樂觀更新）

- `actionSetServantOutput(userData, pcId, sheets)` — 設從者靈基出力(`snapOutput_` 檔位)，存從者 MEMORY(`setServantOutput_`)。100%=可放寶具但御主耗魔最劇，≤20%=最省但無法放寶具。回 `economy`(不算前端會丟棄的 statusString)。單列寫回。
- `actionSetMageRealm(userData, pcId, sheets)` — 設魔境的智慧選定標籤(斯卡蒂專屬，選 1 個通用 A 階被動)。須從者持 `mage_realm` fx；只接受 `mageRealmPool_` 池內 fx(`mageRealmEntry_` 驗證)，空字串=清除。存 MEMORY(`setMageRealmPick_`)。
- `actionSetRuneMode(userData, pcId, sheets)` — 設原初符文運用(持 `rune` fx 者選 減傷/增傷/回血)。`RUNE_MODES_` 驗證，存 MEMORY(`setRuneMode_`)。
- `actionSetOutfit(userData, pcId, sheets)` — 從者換裝(純外觀，換衣不換人)。存 MEMORY【換裝】(`setOutfit_`，內剝分隔字元＋限 40 字)；`userData.self` 則換御主本人；空字串=恢復本相。
- `actionSetWeapon(userData, pcId, sheets)` — 設從者武裝(敘述以此為準、蓋職階慣例)。存 MEMORY【武裝】(`setWeapon_`，剝分隔＋限 30 字)；留空=清除。鏡射 `actionSetOutfit`。

#### 補魔／修復（耗 AP·卸防突襲風險）

- `MANA_TRUST_BOND_`（var=80）— 補魔/強制補魔共用的信任門檻(單一真實來源)。
- `actionManaSupply(userData, pcId, sheets)` — 補魔(耗 1 AP)。御主硬擠迴路回滿共用池，**永久代價**：迴路−3(地板 8)、HP 上限−15(地板 40)。門檻：BOND≥80 且魔力見底(≤10% 上限)才同意，否則 AI 依性格婉拒(區分「不夠信任」/「還不到非做不可」，不動數值)。已滿/迴路已到底則擋。回滿後 `setOvercharge_` 存「下一發規格外寶具可無償超載」的一池魔力。`spendAp_`(skipWrite)＋`raiseBond_`+3＋`enemyAmbushOnServant_`(mul 1.4)。無突襲分支走 NSFW/曖昧 fade(`unlocked` 旗標切模型、`sealGenderFact_` 鎖性別、500~600 字情慾)；有突襲則演驚變。設 `STATE_PRE_DATA_`。**副作用**：燒蝕御主迴路/HP 上限、回滿 MP、升羈絆、可能夜襲致敗。
- `actionSpiritRepair(userData, pcId, sheets)` — 靈基修復(耗 1 AP)。消費共用池(40%)為從者回血(上限 35%)，不燃令咒、可重複，形成「回血 vs 留著打」取捨(與令咒版❖絕對修復區隔)。已滿/池不足則擋。寫從者 HP＋御主 MP＋`spendAp_`(skipWrite)＋`raiseBond_`+2＋`enemyAmbushOnServant_`(mul 1.3)。設 `STATE_PRE_DATA_`。**副作用**：回從者血、扣御主 MP、升羈絆、可能夜襲致敗。
- 注：檔尾註解說明「燃血補魔」是被動機制(共用池見底時 `applyRegen_` 自動燃御主 HP 續契約)，非本檔 action。
# 03 · 戰鬥核心逐函式

## 戰鬥流程總覽（心智模型）

`actionFateBattle`（出戰主流程·唯一入口。⚠ 2026-09 送 AI 的戰報改成**四段分鏡**【開場】【交鋒】【高潮】【收束】——舊版是照程式碼順序排的無序條列，時間軸會亂跳。寶具解放標進交鋒節奏的那一拍；篇幅查 `BATTLE_WORDS_`；御主參戰的站位/以身相代/體術/魔術合成 `_masterJoinLine` 一條）→ 前置閘門（AP/出力/魔力/令咒/盟友）→ 斬首分支（`fateStrike_` 外的獨立裁決）→ 寶具對轟開場 → `ROUNDS(3)` 回合迴圈（每回合我方每名從者各呼一次 `fateStrike_`、涓流回血、海怪再生＋追擊、盟友助攻、敵反擊）→ 組戰報＋ `aiPrompt`。⚠ 2026-09 `roundsBrief` 由「每回合一行明細」改成單行**交鋒節奏**（`①命中／②揮空…` ＋ 一句回擊統計）：逐行重複的人名與單次傷害對 AI 沒有資訊量（總傷害另有一行、miniSystem 又明令「不複述數字、不寫逐回合流水帳」，等於一邊禁止一邊示範），命中/揮空的先後才是攻防轉折。多名攻擊者時仍冠攻擊者名。
`fateStrike_` 是「單次出擊裁決」的通用引擎：命中→扣血→死亡/勝負/十二試煉復活/令咒脫離/海怪擋傷 全套後續。
`drainForNp_` 是「御主電池」：從者無自有魔力池，寶具/技能魔力一律由御主 MP →焚血（2HP=1MP）供應。

---

### Router_Battle.gs

#### 出戰主流程

- `actionFateBattle(userData, pcId, sheets)` — **出戰主流程（ActionRouter: fate_battle）**。解析攻擊者（`userData.servant` 指定或第一個在世從者）、目標（`npcId` 穩定列 ID 優先、`nameLoose_` 名字退路）；跑一長串前置閘門：常駐寶具擋（`【常駐寶具】` 不可解放）、同地檢查、AP≥1、盟友須先撕約、寶具須出力 100%＋御主電池付得起 prana、令咒餘量。斬首分支見下。正戰跑 `ROUNDS` 回合迴圈。副作用極多：扣 AP（`spendAp_`）、削好感 −5（`raiseBond_`）、寫回多列 pcData、設 `STATE_PRE_DATA_` 交棒省整表重讀。回傳 `{success, aiPrompt, report, victory/defeat, dreamPrompt, knockedOut, clock, ap, statusString}`。
- `actionSummonHorror(userData, pcId, sheets)` — **戰前召喚·螺湮城教本（ActionRouter: summon_horror）**。找持 `summon_horror` 的我方從者，付全額寶具 prana（`drainForNp_`）＋耗 1AP，`summonHorror_` 設肉身 300/300。不設出力 100% 閘（儀式詠唱、非臨戰）。已在場則擋。回傳 AI 演出提示。
- `actionDismissHorror(userData, pcId, sheets)` — **解除召喚·深淵海怪（ActionRouter: dismiss_horror）**。免費即時、不耗 AP，`clearHorrorShield_` 把海怪送回深淵、止住每小時維持費。重召須再付全額 prana。

#### 裁決（單次出擊）

- `fateStrike_(sheets, pcData, atkC, tgtIdx, opts, ctx)` — **單次出擊裁決核心**。`atkC` 攻擊 `pcData[tgtIdx]`；命中才扣血（撲空不自傷）。副作用密集：守方為我方從者時注入御主禮裝/體術/魔術/主場結界＋七天盾額度；守方為敵從者時注入其硬連結敵御主支援；整備餐 buff（`mealBuffActive_`）；呼 `resolveFateBattle_` 定生死；海怪護盾以身擋傷（含概念貫穿判定 `offenseTier_`/`PIERCE_GAP`）；致命傷後依序判 `survive` 戰鬥續行→`god_hand` 十二試煉復活（傷害溢出可一擊燒多命；**🐛→✅ 2026-07 再稽核**：解放寶具時的嚴重度下限計算原本用`npAtkScale_(atkC)`，只認永久技能字面、不看這次實際選了哪個寶具——多寶具英靈(如EMIYA)選較弱寶具時仍會被誤判成最強寶具規模去燒更多命，已改用`npProfile_(atkC).scale`按實際選定寶具判定，比照Engine_Fate.gs解放判定同款寫法）→令咒緊急脫離（僅敵從者·30%）→真正陣亡（改 ID 為 `DEAD_`、御主死觸發同陣敵從者靈基透支倒數）；勝負判定＋敗北/勝利夢境提示（`buildDreamPrompt_`/`buildVictoryDreamPrompt_`）。`opts:{np,seal,skill,ambush,counterMul,forceDamage,noMeal,round}`。回傳 out 大物件（hit/damage/fired/destroyed/sealEscaped/godRevived/victory/defeat/dreamPrompt/knocked…）。

#### 電池與魔力

- `drainForNp_(sheets, pcData, svIdx, masterIdx, mpCost)` — **御主電池扣費（出力電池制）**。付款序：①御主 MP →②御主 HP 焚血（`BATTERY_HP_PER_MP=2`，血底線 1 不可榨死）→③無主單獨行動者用殘存靈基（`getSoloReserve_`）。寫回試算表、回傳明細 `{cost, fromMasterMp, fromMasterHp, shortfall, usedBattery, bledMaster, masterHp/Mp…}`。`fromSv`/`svMp` 恆 0（相容舊戰報·從者無自有魔力池）。
- `enemyCanAffordNp_(pcData, svIdx, gameId, prana)` — 敵方電池（同陣敵御主 MP＋焚血，無主時加單獨行動殘存靈基）是否付得起 `prana`。回 `{afford, masterIdx}`。
- `enemyMasterIdx_(pcData, svIdx, gameId)` — 找某敵從者的「敵御主」列索引：硬連結 `getServantMaster_` 優先，退回同 game 同地敵御主；masterless 回 −1。
- `getSoloReserve_(memory)` / `setSoloReserve_(memory, n)` — 無主單獨行動者「殘存靈基（最後一口氣）」餘額存取（MEMORY【殘存】·滿額 `INDEPENDENT_ACTION_RESERVE=60`·用掉不回復）。

#### 寶具與海怪（深淵海怪·變身框架）

- `settleShieldMana_(sheets, pcData, masterIdx, c)` — 「展開扣魔」防禦（七天盾）帳單結算：只在呼叫端注入 `c._shieldMp` 且引擎記帳 `c._shieldSpent` 時，從御主純魔扣款落表。冪等（結算後清 `_shieldSpent`）。
- `horrorPresent_(memory, gameId)` — 深淵海怪是否在場（現存肉身且未逾時）。變身框架單一狀態源。
- `summonHorror_(memory, gameId)` — 召喚/刷新海怪肉身：設【海怪護盾】300|300|0（expiry 0＝無期限·靠魔力經濟維持）。寶具解放與戰前召喚共用同一入口。
- `clearExpiredHorror_(memory, gameId)` — 清逾時海怪 MEMORY 殘影（舊制碼表存檔過渡清理）。回 `{mem, cleared}`。
- `getHorrorShield_(memory, absHour)` — 讀海怪肉身。回 `{active, remaining, max, expiry}`。相容舊兩欄（cur|expiry）與新三欄（cur|max|expiry）。
- `setHorrorShield_(memory, remaining, max, expiry)` — 寫【海怪護盾】三欄（先移除舊值、清重複分隔符）。
- `clearHorrorShield_(memory)` — 移除【海怪護盾】標記。
- `horrorShieldView_(memory, gameId)` — 前端視圖：現存海怪肉身 `{cur,max}`（無/潰散→null），供 servant 卡渲染獨立血條。

#### 令咒與試煉（MEMORY 標記存取器）

- `getGodHandLives_(memory)` / `setGodHandLives_(memory, n)` — 十二試煉（God Hand）剩餘命數（MEMORY【試煉】·預設 11）。
- `getPlayerSeals_(memory)` / `setPlayerSeals_(memory, n)` — 玩家令咒餘量（御主 MEMORY【令咒】·舊角色預設 3）。
- `rowHasSolo_(row)` — 該從者列（TAGS JSON 的 skills/traits）是否帶「單獨行動」（`fx:'solo'`）。
- `stampDoom_(memory, deadAbsHour)` / `getDoom_(memory)` — 靈基透支「絕對死線」（MEMORY【靈基透支】·遊戲總時數 day*24+hour）。令咒燒盡/御主亡 且無單獨行動者掛此倒數（`SEAL_DOOM_HOURS=3`）。

#### 整備餐 buff

- `stampMeal_(memory, expiryAbsHour)` / `getMeal_(memory)` — 整備·進食 buff 到期時間（MEMORY【整備至】·絕對小時）。
- `mealBuffActive_(memory, gameId)` — 目前是否仍在整備加成效期內（比對 game clock 絕對小時）。命中時 `fateStrike_` 給我方出擊 +`MEAL_BUFF_BONUS(2)` 命中。

#### 御主參戰風格（三式：後方支援／見機行事／正大光明）

- `STANCE_SHARE_`（var）— 三種「御主參戰風格」對應的傷害分擔比例表 `{stealth:0, normal:0.05, open:0.10}`。
- `stanceShareOf_(stance)` — 查 `STANCE_SHARE_`，未知值回退 `normal`。
- `applyMasterStanceShare_(sheets, pcData, svIdx, masterIdx, dmg, share)` — 把從者這擊挨的傷害依 `share` 比例轉嫁一部分到御主身上(御主 HP 保底 1、不會被分擔致死)，回傳實際轉嫁量供戰報 `masterShared` 顯示。三處呼叫點皆補 `!knocked` 判斷，避免對已標記死亡的列重複回補血/白扣。

#### 工具

- `nameLoose_(s)` — 名字比對容錯：剝除各種間隔點（·・•‧⋅･等·U+00B7/U+30FB 混用）與空白，避免種子名點號不一致導致「查無此目標」。傳空回空。
- `pushMatching_(arr, target, regex)`（2026-07 稽核抽出）— 共用「掃 arr 找符合 regex 且不在 target 裡的字串→push 進 target」，取代 aiPrompt 組裝處對轟/我方出擊/敵反擊/敵盟協防四段幾乎一樣的 extraFired 收集迴圈。
- `buildPartyIdxs_(pcData, myGameId, atkIdx)`（2026-07 稽核抽出）— 收集所有在世我方從者列索引、出戰中的 atkIdx 排最前（寶具/令咒/斬首優先權只落他身上）。取代斬首分支 `asnParty` 與主戰鬥路徑 `partyIdxs` 兩處複製貼上。

#### 模組級常數/標記工廠（非函式，供上列引用）

`BATTERY_HP_PER_MP=2`、`INDEPENDENT_ACTION_RESERVE=60`、`SEAL_DOOM_HOURS=3`、`MEAL_BUFF_HOURS=8`/`MEAL_BUFF_BONUS=2`、`HORROR_SHIELD_HP=300`/`HORROR_REGEN=10`/`HORROR_UPKEEP=10`/`HORROR_HOURLY_UPKEEP=8`、`STANCE_SHARE_`、`OFFENSIVE_NP_ATK_FX_`（2026-07 稽核統一：原對轟`CLASH_OFF_FX`與敵反擊`ECF`兩份「攻擊型寶具」判準清單各自維護、對轟版漏了`summon_horror`兩處判定不一致——已合併成單一常數，兩處呼叫點都改讀它）；及 `makeIntTag_` 工廠產出的 `SOLO_RESERVE_TAG_`/`GOD_HAND_TAG_`/`PLAYER_SEALS_TAG_`/`DOOM_TAG_`/`MEAL_TAG_`（get/set 皆薄封裝在上列存取器內）。

---

### Engine_Combat.gs

> 定位：solo／鑑賞兩軌【共用】的 LLM 調用基礎設施，不歸屬任一軌道。鑑賞專屬的 `buildDefaultSystemPrompt`（含 `nsfwBaseRules`）在 Gallery.gs，這裡不含 NSFW 演化核心。

#### LLM 核心

- `callGeminiAPI(prompt, systemOverride=null, config={})` — **兩軌共用的 OpenRouter 呼叫核心**。組裝 system（`systemOverride` 或 `buildDefaultSystemPrompt()`＋尾端補「台灣繁體鐵律」）＋可選 `config.chatHistory` 多輪＋user prompt。採樣旋鈕：`model`（預設 `AI_MODEL`）、temperature(0.8)、top_p(0.95)、`max_tokens`（NSFW 1000／solo 2000）、及未設即略過的 top_k/repetition/presence/frequency_penalty（OpenRouter 不支援會自動忽略）。非 `plainText` 時強制 `response_format=json_object`、抽 `{…}` 並 `JSON.parse` 驗證；`plainText`（如奪杯回憶錄）原樣回傳散文。內含審查降階重試機制（見下 `attemptWithModel_`）＋整組失敗後可換 `config.fallbackModel` 再試一輪。全敗則回世界觀柔性 fallback（審查攔截／連線紊亂兩款文案，見下 `aiFallbackNarration_`/`aiFallbackData_`），失敗訊息只進 Logger 不給玩家。
- `aiFallbackNarration_(isBlocked)` / `aiFallbackData_(isBlocked)`（2026-07 邊界稽核抽出）— 生成失敗保底文字與 `_genFailed` 旗標的**單一真實來源**。除了 `callGeminiAPI` 自己，`actionPlay_` 解析 AI 回應失敗時也走 `aiFallbackData_`：模型吐到 max token 就斷（截斷 JSON）或回純文字道歉是常態，舊版直接 `JSON.parse` 一失敗就丟例外，而 `handleGameAction` 的 try 只有 finally、沒有 catch，例外會一路穿出去變裸錯誤。
  - `attemptWithModel_(model)`（`callGeminiAPI` 內部函式）— 單一模型的完整重試迴圈（`config.retries||5` 次，2026-07 玩家反饋審查攔截時想多試幾次·由 3 調到 5）。逐次 `UrlFetchApp.fetch(MODEL_URL)`；把 `result.error`（含 `PROHIBITED_CONTENT/SAFETY`）與 `finish_reason==content_filter/SAFETY`／空 message 統一丟 `Triggered_NSFW_Filter`；首次觸發審查改掛 `softenSuffix`（更含蓄筆法）重送、`Utilities.sleep(2000)` 退避。回成功文字或 null。

#### 網頁進入點

- `doGet()` — GAS Web App 進入點：回傳 `Index` HTML 模板（設標題「命運停駐之夜」＋行動裝置 viewport）。不自動建表（改由登入畫面 `check_sheets` 手動觸發）。
### Engine_Fate.gs

純數值戰鬥核心：D20 ＋ 六圍(階級) ＋ fx 標籤 ＋ 寶具。每個 fx 效果都隨技能階級縮放（`rankMul_`），故對魔力B ≠ 對魔力A。無 I/O 的純函式，可被 tools/battle_sim 單元測試。

#### 階級 / 骰子工具

- `rankMul_(r)` — 階級倍率：以 C(30) 為 1.0 基準（`rankVal(r)/30`）。E=0.33 D=0.67 C=1.0 B=1.33 A=1.67 EX=2.0。全表 fx 縮放的共用因子。
- `rollDice_(n, sides)` — 擲 n 顆 d(sides) 回總和；n<=0 回 0（D&D 風傷害骰核心）。
- `rankTier_(r)` — 階級→骰數階（E=1 D=2 C=3 B=4 A=5 EX=6）；傷害骰顆數與命中/迴避權重都吃這個階梯。
- `skillFxVal_(v, r, c)` — 若 v 是函式則以 (r,c) 求值，否則原樣回傳；SKILL_FX_/DEF_FX_ 欄位可為數字或 r=>.. 的通用取值器。

#### 骰子彈幕（常駐飽和傷害）

- `gobVolley_()` — 王之財寶(gob) 無盡兵裝彈幕：50 顆 d3、捨去 1、只計 2/3，EV≈83（吉爾伽美什常駐飽和重擊）。
- `chainVolley_()` — 天之鎖(chain) 萬鎖彈幕：18 顆 d3 捨 1，EV≈30（較王財小以平衡恩奇都頂級六圍）。

#### 概念優先權（貫穿判定）

- `CONCEPT_TIER` — 資料表：fx→概念位階數字（2~6）。真理級 ea/enuma=6、王權級 excalibur/rule_breaker/divine_age=5、固有結界/必中/超位盾 ubw/gae_bolg/rho_aias…=4、傳說武技 god_hand/tsubame/zabaniya/petrify=3、防禦技能 nullify_magic/divine_core/territory=2。Avalon(7)不入表、走 Router_Battle idealRealm 硬擋。
- `PIERCE_GAP` — 常數 2：攻方概念階高出守方防禦此值以上→概念壓制（無視該防禦）。
- `conceptTier_(fx)` — 查 CONCEPT_TIER，查無回 1。
- `offenseTier_(c, isNp)` — 取某單位「進攻概念」最高位階。解放時掃全套穿透 fx＋本次解放寶具自身 npProfile_.fx（該 fx 存 npOptions 而非 skills，hasFx_ 掃不到需額外計入）；非解放時只認常駐穿透 rule_breaker/anti_magic_lance。**🐛→✅ 2026-07 再稽核**：無條件`pierceFx`清單原本仍含`ubw`——EMIYA的『無限劍製』既是永久固有技能又是他兩個可選寶具之一，選較弱的『偽·螺旋劍』時`ubw`仍會被無條件掃到，誤判成帶概念4貫穿(跟斯卡哈`gae_bolg`同款孿生bug，修法比照：從清單移除，交給`npProfile_(c).fx`按實際選定寶具判定)。**🐛→✅ 再一輪稽核第三例(同構)**：無條件`pierceFx`清單原本還含`petrify`——美杜莎的『魔眼』永久技能fx也是petrify，同時petrify又是她兩個可選寶具之一(他者封印·鮮血神殿)，選了另一個(貝勒羅豐)時仍會被掃到誤判成帶概念3貫穿；同樣移除，交給`npProfile_(c).fx`判定(該函式外的petrify判定——迴避減益/瀕死乘隙——是她「魔眼」被動本身、不受寶具選擇影響，維持原樣不動)。

#### 寶具規模與費用

- `npPranaCost_(npRank)` — 寶具魔力費（御主全供，從者無池）：E40 D70 C110 B160 A220 EX300。EX 走字串判定不與 rankVal 混同。
- `npOverloadCap_(npRank)` — 灌魔加乘上限：無＋=1.0（定額）、A+ 一個＋=1.5、A++/EX=2.0。數 '+' 資料驅動分流，跨名冊通用。（供上游 Router_Battle actionFateBattle 用）
- `npBaseDice_(npRank)` — 寶具基礎傷害骰（d10 系）：E4→D6→C9→B13→A18→A+20→EX24 顆 d10。寶具解放主威力來源。
- `NP_SCALE_IDX` — 資料表：規模名→矩陣索引（對人0 對軍1 對城2 對界3）。
- `NP_SCALE_MATRIX` — 4×4 攻擊規模×防禦規模傷害倍率表（對城打對人×1.5、對界打對人×1.7；max×1.7 min×0.4）。
- `npAtkScale_(c)` — 推定攻擊寶具規模：由 ea/enuma→對界、excalibur/ubw/summon_horror→對城、寶具名關鍵字或 對神(特判弒神)，預設對人。
- `DEF_SCALE_` — 資料表：`[['territory','對軍']]`，fx→NP 防禦規模的優先序陣列。
- `npDefScale_(c, pierces)` — 防禦規模（對稱 npAtkScale_）：海怪變身態(c.horrorUp)→對城；否則掃 DEF_SCALE_（可被 pierces 貫穿則跳過），預設對人。

#### 資料層 / 存活查詢

- `enemyRetreatLoc_(currentLoc)` — 令咒緊急脫離落點：隨機挑一個非「約會」型且非當前地的冬木地點。用 getMapDataCached（零 I/O 常數）而非讀分頁。
- `aliveEnemyServants_(sheets, gameId, preData)` — 某 game_id 仍存活的敵從者數（DEAD_ 開頭視為已消滅）；preData 可傳入已同步陣列省一次整表重讀。
- `rowToCombatant_(row)` — 眾生列→戰鬥單位物件。解析六圍/技能/特性欄；注入 mage_realm 玩家選定被動；無六圍者依 FACTION 合成（從者 C 檔／凡人 E 檔）；套 masterSynergySix_ 主從synergy；讀 output/runeMode/npChoice/horrorUp 狀態。HP/MP 一律 `parseInt||0`（0 是合法致命傷值，勿腦補回滿）。

#### fx / 神性 / 因果 查詢

- `hasFx_(c, fx)` — 掃 skills＋traits 找某 fx，回其階級字串（預設 'C'），查無回 null。全引擎 fx 判定的基石。
- `hasCausalityNp_(c)` — 這次實際選定的寶具是否為因果律武器（`npProfile_(c).fx === 'gae_bolg'`；寶具對轟時死亡已在因果先確定）。供 Router_Battle 餵 resolveNpClash_。2026-07 修：舊版改掃永久技能列表找 `causality:true` 旗標，對雙寶具英靈(如斯卡哈：Gáe Bolg 帶因果律、Gate of Skye 不帶)會誤判——現在只看這回合實際解放的是哪把。`Seed_Codex.gs` 上殘留的 `causality:true` 技能標記已是死資料，無程式碼再讀它。
- `divineRankOf_(c)` — 目標神性階級「單一真實來源」：取 divine fx／divine_core fx／特性名含神性|神格|神靈 三者最高階，查無回 null。神殺/縛神/對神寶具/瘟疫抗性全吃這一個。
- `fxName_(c, fx, fallback)` — 該 fx 在「這名」從者身上的實際技能名（避免張冠李戴硬寫招式名）。

#### 戰鬥屬性檔

- `combatProfile_(c)` — 依職階回 {hit,dmg,eva,kind}：傷害底＝筋力/魔力取高（agile_striker 才讓敏捷入傷）；Caster 魔力轟擊、Archer/近戰敏捷命中迴避。kind 僅演出用。

#### 御主支援注入

- `injectMasterMeleeSupport_(c, masterMemory)` — 把御主【體術】階級以 master_melee fx 注入我方從者 skills（不限職階；已存在則略過；空則不注入）。
- `injectMasterMagicSupport_(c, masterMemory)` — 把御主【魔術】階級以 master_magic fx 注入——僅當 c 是 Caster 才注入（體術管近戰、魔術限 Caster，避免無腦疊加）。
- `injectMasterSupportFor_(c, pcData, myGameId, row, isEnemy)`（實際定義於 Engine_Fate.gs，Router_Battle.gs 2026-07 稽核抓到重複而抽出）— 找到硬連結御主 MEMORY 後呼叫上兩支的共用外殼，取代原本我方/敵方視角各寫3遍、共6處幾乎相同的「找御主→注兩種支援」樣板。`isEnemy=false`：`row` 本身即御主列，直接讀其 MEMORY；`isEnemy=true`：`row` 是敵從者列，走既有 `enemyMasterMemoryFor_` 查其硬連結御主 MEMORY，查無則不注入。**2026-07 再稽核補完**：`Router_Movement.gs`的`playerAmbushOnEnemy_`(趁隙偷襲)/`enemyAmbushOnServant_`(陣地反擊分支＋真突襲分支)共3處原本仍手刻雙支呼叫，已一併改用此共用函式。

#### 技能 fx 表（線性加減乘·資料驅動）

- `SKILL_FX_` — 資料表：把主動技與線性被動加成收成一張表。欄位 active/prio/mpPct/icon/descFn（主動施放）、zh（中文名）、hit/hitAdd（命中）、dmgMul/dmgAdd（傷害）、blockedByLoserFx（敗方免疫）、silent（不推 fired 標籤）。骰子彈幕/概念貫穿/時機觸發等特例不進表、保持明碼。
- `servantActiveSkill_(c)` — 掃 SKILL_FX_ 中 active 者依 prio(burst>str_up>projection) 取第一個持有的，回 {id,name,icon,mpPct,hit,dmgMul,dmgAdd,desc}；無則 null。玩家側經 `SKILL_PROC_`(Router_Battle.gs 定義，**30%**——2026-07 玩家反饋 50% 太強、幾乎每擊都吃到全效加成，降到 30%)機率骰中才餵入(被動化)；敵AI 直接餵、恆全效免費。
- `fxHitAdd_(aHit, atk, fx, fired)` — 攻方持 fx 時套用 SKILL_FX_[fx].hitAdd，回新 aHit 並推 fired 標籤（命中段一律推，self_mod 在此列一次）。
- `fxDmgApply_(base, winner, loser, fx, fired)` — 勝方持 fx 時套 dmgMul/dmgAdd；blockedByLoserFx 則免疫；silent 不推標籤。回新 base。

#### 防禦 fx 表（減傷·資料驅動）

- `DEF_FX_` — 資料表（對稱 SKILL_FX_）：敗方持有→傷害 ×mul，除非被概念貫穿/破魔/魔術穿透。欄位 mul（減傷乘子隨階級）、pierceKey（貫穿判定的防禦概念名）、zh/note、physicalOnly（僅擋物理）、npOnly（只對寶具解放·如 rho_aias 七天盾）、mana（展開費用）、alsoPiercedByFx、piercedMsg、guardPositive。含 territory/home_field/rho_aias/divine_core/wall_def。
- `fxDefApply_(base, loser, winner, fx, pierces, atkMagic, fired, npStrike)` — 套用防禦減傷。處理 physicalOnly（魔術穿透）、npOnly（僅寶具擊反應）、pierces/alsoPiercedByFx（貫穿失效）、mana 展開費用（玩家側注入 _shieldMp 才收費、記帳 _shieldSpent）、下限 clamp 防呆。回新 base。

#### 寶具設定檔（多寶具英靈）

- `servantNpOptions_(name, cls)` — 多寶具英靈的寶具選單（每項 n/scale/fx/desc/r）。精確 === 比對真名（防繞過 ALLOWED_FX_）。含斯卡哈/吉爾伽美什/恩奇都/伊斯坎達爾(征服王)/美杜莎(Rider)/無名(EMIYA)；單寶具回 null。（迦爾納/蒼白騎兵已移除——兩者從未出現在 `SEED_SERVANTS` 裡，是死的佔位選單項；美杜莎則是後補的，種子 np 字串本就掛兩個寶具名卻沒有選單、玩家永遠選不到「血腥要塞·安德洛墨達」或「貝勒羅豐」二擇一。）
- `firstSignatureFx_(c)` — 單寶具退路：依優先序取該從者最主要的寶具簽名 fx（決定寶具乘子）。
- `npProfile_(c)` — 解出本次解放的寶具設定檔 {scale,fx,name,multi,r}。多寶具讀 c.npChoice 選定項；單寶具退回字串尺度＋簽名 fx。r＝該次實際吃的階級。
- `npEffectiveRank_(c)` — 本次解放實際吃的寶具階級（`npProfile_(c).r`）；給 npBaseDice_/npPranaCost_ 的單一真實來源（Router_Battle/Router_Movement 多處呼叫）。
- `OFFENSIVE_NP_FX_` — 資料表：攻擊型寶具 fx 集合（bestNpChoice_ 篩選用）。
- `bestNpChoice_(name, cls)` — 敵 AI 用：多寶具英靈的最強攻擊寶具索引，按概念階×10＋規模排序取高；純防禦寶具不入選，無攻擊型退 0。

#### 主裁決

- `HIT_FX_CAP` — 常數 8：被動 fx 對命中/迴避的淨加成上限（各自 clamp ±8，防堆疊流「永遠打不到」）。出力/主動技/禮裝/職階相剋/幸運骰/奇襲不入此帳。
- `resolveFateBattle_(atk, def, opts)` — 主裁決·一次交手（純函式）。流程：①ea/wealth 絕境執行殺早退（血≤40%/20% 且 opts.np）②出力/職階攻防屬性→D20＋rankTier 命中迴避③整備/過充/一長串被動 fx 命中修正（直感/千里眼/王財/氣息遮斷vs感知/職階相剋/變化/魔眼/天之鎖縛神…）clamp 入帳④幸運自指變異＋必中槍閃避判定⑤定勝負（seal/forceHit 強制命中）⑥傷害＝六圍底×0.6＋武器骰＋命中分差×1.2，套出力/過充/被動傷害/禮裝/奇襲要害/彈幕/神殺/職階/寶具解放全鏈⑦守方減傷（耐久＋territory/home_field/rho_aias/divine_core/wall_def/對魔力/符文/禮裝寶具減傷）⑧暴擊多骰。回 {atkWins,winner,loser,damage,aRoll,dRoll,aHit,dEva,fired[],crit,np,seal}。內含區域常數 `KNIGHT_BEATS`（三騎士相剋 Saber→Lancer→Archer→Saber）。
- `resolveNpClash_(pPow, ePow, pHpNow, eHpNow, playerCausality, enemyCausality)` — 寶具對轟純裁決（只吃數字回決策，I/O 留呼叫端）。因果律 ×1.35；優先序：玩家因果律致死→'causality'（敵殘 8% 回擊）／敵因果律致死→'enemy'+pLethal／火力相當(≤10%)→'stalemate'／火力高者勝（敗方吃差額玩家保1、勝方吃差額15%回震）。玩家因果律外永遠保1、敵方無保命。

---

### Mystic_Code.gs

禮裝（御主裝備）系統：1 個專屬槽存於御主 MEMORY `【禮裝】id`，不佔道具欄、創角自選、無門檻、全面被動化。

#### 資料表

- `MYSTIC_CODES` — 禮裝圖鑑：id→{name,type,fx,tier,desc,flavor}。type:'passive' 持有即生效自動加持我方從者；'special'（rule_breaker 破戒奪僕）另套機制。含 avalon/jewels/black_keys/rule_breaker。
- `MC_COMBAT_` — 禮裝戰鬥效果表：fx→{hit 命中+,dmgAdd 每擊傷+,npMul 寶具傷×(攻),npDefMul 承受寶具傷×(防),label}。含 mc_blackkey/mc_jewel_minor/avalon/avalon_saber。引擎 resolveFateBattle_ 透過 mcCombatFx_ 自動讀取；新增禮裝戰力只動此表。

#### 戰鬥效果取用

- `mcCombatFx_(c)` — 取某戰鬥單位身上第一個命中 MC_COMBAT_ 的 fx 效果物件；無回 null。resolveFateBattle_ 命中段/傷害段/寶具減傷段皆呼叫。
- `masterMysticBuffSkill_(memory)` — 御主持有禮裝→給我方從者注入的被動加持技能 {n,r:'A',fx}；無戰鬥效果（如破戒）回 null。

#### 注入 / 特例

- `injectMysticBuff_(c, masterMemory)` — 把御主禮裝被動注入我方從者 c 的 skills（已注入則略過）。特例：持 Avalon 的阿爾托莉雅(Saber) 額外標 avalon_saber＋regen（供 Router_Battle 理想鄉攔截）；非阿爾托莉雅持 Avalon 走一般被動（僅減傷）。
- `canRuleBreak_(pcData, pIdx, gameId)` — 是否具破戒全咒之力：御主持破戒禮裝(masterMysticFx_) 或 我方從者帶 rule_breaker(Caster)。

#### MEMORY 存取（get/set/query/equip 成套）

- `getMystic_(memory)` — 讀 MEMORY 中 `【禮裝】id`，回 id 字串（無回 ""）。
- `setMystic_(memory, id)` — 寫入/替換 `【禮裝】id` 標記，回新 memory。
- `masterMysticFx_(memory, fx)` — 持有的禮裝是否帶某 fx（如 avalon/rule_break）；是回 id、否回 ""。
- `equipMysticToMemory_(memory, id)` — 給御主 MEMORY 裝上禮裝（驗 id 存在於 MYSTIC_CODES），回新 memory。
### Gallery.gs

鑑賞（慾海後日談）軌全集中：資料層 ＋ 進場/召喚/AI 深化 ＋ 回合結算。`actionPlay`／`buildDefaultSystemPrompt`（含 `nsfwBaseRules` 紅線常數）也住這。`callGeminiAPI` 留在 Engine_Combat.gs；solo 結束一局清理住 Account.gs。

---

#### 輸入驗證／提案裁定／技能標記讀取（`actionPlay` 用的小工具，各自單一職責）

- `sanitizeAiData_(aiData)` — 寫回試算表前的 AI JSON 輸出守門：非物件/陣列直接拒絕，`rel_changes[].fav_change` 夾在 -100~100；`options` 夾成「≤6 個字串、每個 ≤60 字」（這欄原樣轉發前端、一字串一顆按鈕，舊版無上限，模型失控時會長出一整片按鈕牆）。`actionPlay` 唯一呼叫者，solo 不用。
- `kanshouProposalAccepts_(type, bond)` — 🎲 GAS 依 BOND 擲一個機率(`move`/`promise`/`hold` 三種提案各自不同基礎值/斜率)，決定玩家主動提案(相約同去/約明日見/牽手)是否被接受。玩家發起的提案由 GAS 在呼叫 AI 前先擲骰定成敗、把結果直接寫進提示詞告訴 AI(「★成敗由系統定」)，`proposal_accept` schema 欄已整個刪除（NPC 主動發起約會/同居邀約的對應機制皆已於八度改版移除，約會/同居現只剩玩家自己主動發起一條路）。

#### 帳號綁定與擁有權驗證（資料存取·權威來源）

- `linkAccountToKanshouPc_(accountName, kpcId)` — 把鑑賞 avatar 的 kpcId 寫進「帳號」表 `COL.ACC.KPC` 欄；查無帳號列則 appendRow 新建。權威連結存伺服器端，只服務鑑賞（solo 走 `linkAccountToPc_`/`COL.ACC.PC`，互不通）。
- `getAccountKanshouPcId_(accountName)` — 查某帳號目前連結的鑑賞 avatar pcId，查無回 ""。
- `kanshouOwnedRowIdx_(data, pcId, acctName)` — 帳號歸屬驗證：先查帳號表 KPC 欄是否確等於呼叫者聲稱的 pcId（KPC_ id 用 Date.now() 可預測，不能只憑找列就信任），再回該 pcId 在 pcData 的列索引；不符回 -1。所有 5 顆 KPC action 的第一道守門。
- `getKanshouPcSheet_(ss)` — 取（無則建）鑑賞專屬分頁「鑑賞眾生」，與主「眾生」隔離、schema 同（COL.PC 位置一致）。dispatcher 見 pcId 以 KPC_ 開頭即把 sheets.pc 指到此表。

#### 戰時→日常轉譯（AI·codex 建檔期一次性；本檔內無呼叫者）

2026-07 稽核：三支開場白完全相同的 system prompt 已抽成共用常數 `KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_`，try/callGeminiAPI/catch-fallback 殼子抽成共用 `kanshouDailyTranslateCall_(prompt, sys, apiOpts, resultMapper, fallbackValue)`，三支各自只保留自己的規則段落與 fallback；prompt 文字逐字不變。

- `translateLookToDaily_(name, cls, rawLook, firstP, speech, dailyMoeHint)` — AI 把戰時外貌轉成現代日常穿搭/外型（四短句 look＋一句 outfit），本相不變、戰甲換日常。失敗原樣退回。dailyMoeHint 傳入避免「私密一面」跟萌點撞。
- `translatePersonalityToDaily_(name, cls, rawWords, lookPrivateHint)` — AI 把戰場語境性格短句（戰意/殺意）轉成日常等價說法、補滿四格；純個性核心原樣保留。失敗退回原值。
- `translateMoeToDaily_(name, cls, rawMoe)` — AI 把靠戰爭/創傷撐出的沉重反差萌改寫成輕量日常萌點（限 18/硬截 30 字）。只用於 ai_gen 英靈（canon 手寫死進 persona.dailyMoe）。
- ✅ 這三個 translate* 皆呼叫 `callGeminiAPI`，本檔內無呼叫點但**確為活碼**：呼叫端在 `Router_Creation.gs` 的 `recordOriginalHero_`（工房鑄入）與 `actionSaveHero`（修改分支）——工房存檔時一次算好日常欄寫入 DAILY_*，鑑賞撈取（`getDailyHeroFields_`/`heroToKanshouRow_`）改純讀快取、不再呼叫 AI。

#### 從英靈殿建列（進鑑賞世界）

- `getDailyHeroFields_(heroRow, p)` — 純讀 HERO 列的 DAILY_LOOK/WORDS/MOE/OUTFIT 快取，查無退回原始戰時 look/words/moe（「・」→「、」）；不呼叫 AI。
- `dailySpeechByName_(name, preHeroes)` — 由名字（經 `kanshouNameCandidates_` 別名橋比對）反查英靈殿 DAILY_LOOK 第 3 段（自稱與口氣）當日常安全版口吻，避免戰時口吻餵進鑑賞 AI。preHeroes 可傳入省重複整表解析。
- `heroToKanshouRow_(heroRow, gameId, loc, curDay)` — 核心建列器：把 HERO 列轉成鑑賞 PC 列（KHV_ 前綴）。用日常稱呼當 NAME、讀日常版 look/words/moe/outfit、身世走 dailyBack→back→通用預設、起始 BOND=10「點頭之交」、不寫戰鬥欄/IS_PARTY/PHYSICAL。被召喚/起始住民/結識共用。**七度改版**：建列尾聲檢查`KANSHOU_HERO_HOME_[heroRow[COL.HERO.ID]]`，查無專屬豪邸就從`KANSHOU_GENERIC_HOME_POOL_`隨機抽一間、用`setKanshouHeroHome_`寫進`【住處】`記憶標記——這是新英靈唯一的建列入口，此處補一次即涵蓋召喚/起始住民/結識三條路徑。

#### 關係梯度·好感天花板（資料驅動）

- `KANSHOU_REL_TIER_`（常數）— 好感→關係標籤 5 階梯度（80 戀人/60 親近/40 熟識/20 普通朋友/-100 點頭之交）；門檻借鑑賞既有 60/80 節點，單一來源。**2026-09 每階加 `ceiling` 欄**（這一階的肢體親密天花板）——原本提示詞裡另外硬寫一份五行對照表，同一組門檻存兩處。`check_wiring.py` 的 `TIER_TABLES` 盯著每階都要有相異的 `ceiling`。
- `kanshouIntimacyLines_(bonds)`（2026-09 新增）— 依在場者的好感陣列，只吐出**實際用得到的那幾階**親密尺度（全表五行對小模型是四行雜訊）；沒人在場回空字串、整塊規則不送。
- `kanshouSyncRelTier_(pcData, idx)` — BOND 變動後的下游同步總管，順序固定為 **⓪告白牆（含舊存檔補齊）** ①好感棘輪夾地板 ②REL_TAG 重算 ③同居門檻檢查。⓪ 2026-07 新增：未 `kanshouIsLover_` 者好感一律夾在 `KANSHOU_REL_TIER_[0].min - 1`（79）——這裡是所有好感變動的唯一漏斗，夾一次等於全路徑都夾到（80/90 之上的戀人標籤・自訂稱呼・同居・最高階親密度因此一起關在告白之後，不必逐項開門檻）；夾之前先補齊舊存檔（已同居／REL_TAG 已是「戀人」／`【好感底線】`≥80 任一成立就補蓋 `KANSHOU_LOVER_TAG_`，**刻意不拿「此刻 bond≥80」當證據**，那會讓 AI 的 +5 自己把牆拆了）。①必須最先：②③都讀 bond，讀到未夾的值會做出跟棘輪矛盾的降階。②只在現值仍等於某梯度字面時才覆寫（玩家手動改自訂稱呼後不再自動蓋回）。③跌破 `KANSHOU_COHABIT_BOND_` 時清【同居】並蓋【同居解除】一次性旗標（棘輪上線後只剩舊存檔會走到）。冪等。任何動 BOND 處之後補呼叫（目前 5 處全數有呼叫）。
- `kanshouBondFloorOf_(bond)`（2026-07 新增）— 好感棘輪的地板：回傳 bond 已跨過的最高門檻（門檻＝`KANSHOU_REL_TIER_` 的 min>0 ＋ `KANSHOU_COHABIT_BOND_`，即 20/40/60/80/90，由表推導不另寫數字）。**刻意寫成函式而非模組層常數**——`KANSHOU_COHABIT_BOND_` 宣告在本檔後面，const 有 TDZ，模組層直接引用會炸。
- `KANSHOU_CUSTOM_TAG_BOND_`（常數=80，2026-07 五度改版新增）— 自訂關係稱呼／專屬稱呼的解鎖門檻，跟親密尺度五階「80+無上限」同一個切點。`actionUpdateRelTag`/`actionSetNickname`(Router_Action.gs) 共用此常數。
- `getNickname_(relMem)`（2026-07 五度改版新增）— 從 REL_MEM 裸取`[專屬稱呼]`值的共用小 helper（供 UI 顯示用；鏡射 `actionPlay_` 內部組提示詞用的 `relMemMemoryStr_`，但那支輸出完整格式化字串，這支只回裸值）。`actionKanshouCompanions`／servant 清單 builder 都吃這支。
- `sanitizeNickname_(s)`（2026-07 邊界稽核新增）— 專屬稱呼寫入前的**唯一消毒口**：清掉 `|｜[]` ＋截 20 字。REL_MEM 是用 `| [欄名]值` 串成的單格字串，這格有兩條寫入路徑（玩家手動 `actionSetNickname`／AI 的 `intimacy_feedback.mutual_nicknames`），舊版只有手動那條消毒——AI 回一句 `"小可愛| [稱呼鎖]是"` 就能**偽造稱呼鎖**（玩家沒設過卻從此凍結、AI 自己也再改不動），且 AI 那條完全沒長度上限。兩條路徑現在都只走這支。
- `KANSHOU_SCENE_BOND_`（常數=3）— 接受親密橋段給的好感，直接寫、不吃聊天上限。
- `kanshouRelChatCeiling_(bond)` — 純聊天加好感的封頂：只從 40 門檻起算（<40 可自由聊到 39），40/60/80 三道親密門檻要靠約定赴約/橋段才能突破（slow burn）。

#### 5 顆 KPC action（進場/召喚/面板/設定）

- `actionKanshouSummonHero(userData, pcId, sheets)` — 從英靈庫召喚一位英靈「存在」於此後日談世界（不必先 solo 封存）。防線：擁有權驗證、士郎位置擋、`KANSHOU_SUMMON_BLOCKED_IDS_` 擋、ai_gen 僅創造者可召、不開放男男、同一位只召一次（跨名比對）。通過即 appendRow(`heroToKanshouRow_`)。
- `actionEnterKanshou(userData, pcId, sheets)`（2026-07新增：分支①②回應皆附`quickPhrases`欄，供前端渲染玩家自訂快速貼圖——🐛→✅ 再稽核抓到②原本漏帶，跟①不一致已補齊）— 進入常駐後日談世界（每帳號一個）。三分支：①帳號表已連結→接續（含全名→短名一次性遷移）②MEMORY【帳號】標記舊角色→補寫帳號表連結遷移③無存檔→需 needSetup 問名字/性別後新建御主列（KPC_ 前綴，開場「我的房間」Day1 06:00）＋入駐 `KANSHOU_STARTER_IDS_` 4 位起始住民。**🐛→✅ 稽核抓到**：pcName/appearance/persona 這條首建路徑原本完全沒設 backend 長度上限(只靠前端 maxlength 擋)，已補 pcName≤16／appearance・persona≤60，跟後續改名/改命路徑口徑一致。（2026-07 二度改版：兩個成功回應物件都拿掉 `prefLocks` 欄位，性格鎖系統整組刪除）
- `actionBackfillKanshouAi(userData, pcId, sheets)`（2026-07 再稽核抓到漏洞：找列邏輯改用`kanshouOwnedRowIdx_`驗證帳號歸屬，取代原本裸`findIndex`信任傳入pcId的漏洞——鑑賞pcId可預測/枚舉，舊版可被冒名竄改任一玩家的敘事欄；前端`backfillKanshouAi`同步補送`acctName`）— 非阻塞背景補生成御主 4 個敘事欄（background/traits/personality/npc_intent/outfit）。比照 `actionBackfillMasterAi`「種子秒建＋AI 潤色」；競態修用 `buildLiveIdIndex_` 寫回前重定位，只單格 setValue，數值/位置不碰。
- `actionKanshouCompanions(userData, pcId, sheets)` — 列出本世界已存在的所有從者＋各自地點/關係標籤/**專屬稱呼(2026-07新增，`getNickname_`裸值)**/好感/是否同地/待赴約定/共同回憶/**`id`(2026-07 id 化重構新增)**，供玩家決定去找誰。無隊伍/人數上限。回傳另附**`quickPhrases`(2026-07新增，見`kanshouGetQuickPhrases_`)**供前端合併渲染玩家自訂快速貼圖。
- `actionKanshouMemoirOp(userData, pcId, sheets)`（2026-07 稽核：找目標同伴列改委派 `findPcRowIdx_`，取代手刻迴圈，行為等價）— 共同回憶面板操作（op=pin/unpin/del）：釘選加 ★ 前綴（釘選上限 8）、刪除整條移除。玩家 UI 手動管理、AI 無權；帳號綁定＋同 gid 驗證。

#### 御主 avatar 設定（隨時可改）

- `actionKanshouSetSex(userData, pcId, sheets)` — 切換御主性別（限男/女）；切男時檢查世界內是否已有男性從者（避免男男配對）；真換時重置 PHYSICAL 為中性預設。
- `actionKanshouSetName(userData, pcId, sheets)` — 改御主名字（≤16 字）；關係併入從者自己列，改名不影響羈絆。
- `actionKanshouSetHomeName(userData, pcId, sheets)` — 改「家」顯示名（≤12 字），寫進 MEMORY【住所】標記（`setKanshouHomeName_`）。

#### AI 提示詞組裝（🔴 鑑賞 AI 核心）

- `dialogueFormatRule_()` — 全遊戲【單一真實來源】對話與敘事格式規則（口/喉發聲進「」台詞、每句台詞冠說話者名、看得見動作走敘事、只用單層「」）。solo miniSystem 與此檔 nsfwBaseRules 共用。
- `buildDefaultSystemPrompt(includeMasterNote, includeOptions)` — 組鑑賞系統提示詞（唯一呼叫者 actionPlay_）。動態組 JSON 輸出範本（inner_monologue/narration/npc_exit/options/intimacy_feedback/rel_changes/master_note）。**2026-07 拔掉 move_proposal／promise_proposal／cohabit_proposal／proposal_accept**：AI 不再有任何欄位能自己提議換地點/邀約/邀同居，這些全改由 GAS 依好感數值直接判定觸發。**2026-07 拔掉 dynamic_skills**：無 UI 也無使用規則的孤兒欄位，見 KANSHOU_REFERENCE.md。**2026-07 二度改版·簽名從 3 參數瘦身成 2 參數**（拔掉 `masterNoteUnlocked`）：`master_note` schema 現在只剩「經歷」一格，性格四段/萌點創角時 `actionBackfillKanshouAi` 一次生成、遊戲中 AI 不再側寫，故不需要「只放沒鎖的性格欄」這層動態鎖過濾。剩兩個開關：includeMasterNote=false 整塊拿掉（側寫節流）、includeOptions=false 拿掉 options。
  - 🔴 內含 `nsfwBaseRules`（函式內 const，非獨立函式）— 慾海演化核心紅線常數，後日談敘事鐵律 6 條；連同 `specificRules`(【慾海律令】現 7 條，**2026-07 新增第6條「options 只能建議在場人物/當下場景真能做到的動作」**修「AI選項建議移動/呼喚不在場者、玩家點了做不到」的bug；**五度改版再新增第7條「appearance_extras只在劇情真有穿脫/更衣動作才填新值、不准自行合理化改寫」**，修「玩家用👕換裝手動設定裝扮，下一回合被AI默默改回別的」——schema _note的「沒變化留空」對這個模型是弱信號，明文規則才夠強；**同批再補「appearance_extras只能寫衣物本身，禁止寫成所在環境/姿勢」**，修「泡溫泉→移動到商店街，裝扮卻卡在『在水下』」的變種bug)＋範本 JSON 一起回傳。**紅線①：一律不可改（specificRules 可改，非紅線本體）。**
- `getKanshouPeopleList_(pcId, curL, allPcData)` — 鑑賞自算精簡「同地人物」清單（只 id/name/isExact），不借 solo 的 getLocalPeopleList（那多算 12 欄）。

#### 大地圖·地點（資料驅動）

- `KANSHOU_REGIONS_`（常數）— 大地圖分區清單（room/home/shinzan/fuyuki/dojo/visit），純 UI 分組。
- `kanshouLocContextForAI_(locName, homeName)` — 依 region 補一句給 AI 的場域脈絡（自己房間/共用空間/別人住處/深山町…），AI 自創地點回空字串。
- `KANSHOU_LOCATIONS_`（常數）— 全地點清單（name/region/desc/noEncounter/isRoom/dateOnly/bands），驗證/邏輯的唯一真相（前端另有一份純畫按鈕）。**2026-07 稽核刪除死碼欄位`minBond`**（原供已於八度改版移除的`kanshouPickDate_`選約會地點分級用，確認全檔零讀取點後整批移除，非試算表欄位不受COL規則約束）。`dateOnly`（情侶溫泉套房/深夜賓館這類約會限定私密地點，不進`kanshouRollDailyLocation_`日常閒晃保底池，這個用途仍在使用中）。**六度改版新增 `bands`**（省略＝全天候開放；`timeBand_`5段子集，管「現在幾點能不能去」）——目前書店二樓/水族館/摩天輪/深夜賓館/夜景展望台/情侶溫泉套房設限，其餘地點不設限。
- `kanshouRoomDisplayName_(locKey, pcData, gameId, myName, myIdx)` — 房間顯示名：「我的房間」→「(玩家名)的房間」，其餘原樣。（pcData/gameId/myIdx 現未使用。）
- `KANSHOU_SUMMON_BLOCKED_IDS_`（常數）— 暫移出鑑賞的英靈 id（召喚/巧遇/住處共用單一來源）。
- `KANSHOU_STARTER_IDS_`（常數）— 開局 4 位起始住民（大河/凜/櫻/SABER）。
- `KANSHOU_LOCATION_TAGS_`（常數）— 地點×角色氛圍標籤，巧遇/行程骰加權用。
- `KANSHOU_LOCATION_ACTIVITY_`（常數）— 商業地點「當下在做什麼」活動變體（店員/客人側）。
- `kanshouLocActivity_(loc, name, day)` — hash(名字+日+地點)%變體數 決定性挑活動，零持久化、同回合冪等。
- `KANSHOU_ENCOUNTER_FEMALE_IDS_`（常數）— 巧遇保底純女性池。
- `KANSHOU_PARTY_DETAIL_CAP_`（常數=5）— 同地 AI 詳細卡片上限。

#### 橋段庫（夜襲/共浴/節慶…資料驅動）

- `KANSHOU_SCENE_EVENTS_`（常數）— 橋段庫（夜襲/賴床叫醒/共浴/溫泉同浴/膝枕/下廚/觀星＋6 節慶橋段）；每筆 label/btn/verb/intent。共浴/膝枕等仍帶 branches（依 bond 由高到低選走向）；**2026-07 八度改版**：夜襲/賴床叫醒拔掉 branches，改走 `kanshouAsleepOutcomeStr_` 自由發揮。
- `KANSHOU_NIGHT_RAID_HOUR_END_`(=5)、`KANSHOU_ASLEEP_HOUR_END_`(=8)（常數，2026-07 八度改版新增，取代 `KANSHOU_HOUSEMATE_ROOM_EVENTS_BY_BAND_`）— 同住人房間橋段改直接比對時刻：0~5點→夜襲、5~8點→賴床叫醒（不再依附 timeBand_ 的深夜/清晨切法，清晨band原本一路延伸到11點）；有效地點含她自己的家/`KANSHOU_COHABIT_ROOM_`(和室)/`'我的房間'`(玩家自己房間)。
- `KANSHOU_LOCATION_EVENTS_`（常數）— 地點×時段橋段觸發表（浴室/隱藏溫泉/客廳/廚房/屋頂花園）。
- `KANSHOU_FESTIVAL_EVENTS_`（常數）— 節慶橋段觸發表（key 對齊 FESTIVALS）。
- `kanshouAsleepOutcomeStr_(bond)`（2026-07 八度改版新增）— 夜襲類橋段(玩家主動夜襲/叫醒賴床、以及深夜訪客「被夜襲」鏡像版)共用的分寸判準：60以下＝趕人、60~79＝卡在親吻擁抱、80+＝無上限，不寫死台詞，具體演出交AI依角色性格發揮。切點沿用親密尺度五階既有的60/80。
- `KANSHOU_HERO_HOME_`（常數）— 手寫專屬豪邸，僅7位種子英靈（region:'visit' 可造訪地點）。
- `KANSHOU_GENERIC_HOME_POOL_`（常數，2026-07 七度改版新增）— 8間泛用住處(河畔小公寓/巷弄老屋/高塔套房/郊區透天/老街閣樓/街角公寓/靜巷租屋/河堤畔宅)，宣告時即用`.forEach(push)`動態併入`KANSHOU_LOCATIONS_`(region:'visit', generic:true)。供查無`KANSHOU_HERO_HOME_`專屬豪邸的英靈隨機分配用（玩家「新增的英靈會有住處嗎？種子庫直接隨機就好」）。
- `kanshouGetHeroHome_(heroId, memory)`（2026-07 七度改版新增）— 住處統一讀取入口：`KANSHOU_HERO_HOME_`手寫豪邸優先，查無就讀該英靈自己列MEMORY的`【住處】`標記，兩者皆無才退回不可造訪的「自己的住處」。取代所有直接查`KANSHOU_HERO_HOME_[heroId]`的呼叫點。
- `setKanshouHeroHome_(memory, homeName)`（2026-07 七度改版新增）— 寫入`【住處】`標記，比照`setOutfit_`同款「清除舊值再整段append」寫法。

#### 巧遇·邂逅（MEMORY 標記 ＋ 抽選）

- `getKanshouMetSet_(memory)` / `addKanshouMet_(memory, name)` — MEMORY【邂逅】逗號分隔巧遇過姓名清單（去重·僅氛圍參考）的讀/增。
- `kanshouRollEncounter_(locName, excludeIds)` — 70% 機率加權抽巧遇對象（標籤池優先、退全女保底、排除已召喚者）；回 SEED_SERVANTS hero 或 null。
- `kanshouHeroIdByName_(heroName)` — 由真名/短名反查 SEED id（短名優先、再 `kanshouNameCandidates_` 候選比對）。
- `kanshouResidenceUnlocked_(pcData, residenceName, gameId)` — 拜訪私宅門檻：屋主本局已入駐且好感≥`KANSHOU_VISIT_BOND_`(40) 才解鎖。前後端共用單一真相。**七度改版**：改用`kanshouGetHeroHome_`讀住處(手寫豪邸+隨機分配住處皆吃得到，原本只認`KANSHOU_HERO_HOME_`)。
- `kanshouLocHasPendingPromise_(pcData, loc, curDay, gameId)`（2026-07 新增）— 該地點是否有任一同伴的未過期(`day>=curDay`)約定指向這裡；`actionPlay_` 移動攔截用它豁免已成立約定的私宅解鎖檢查（防「好感賽跑後跌破門檻＝必爽約」的死亡螺旋）。
- `kanshouRollDailyLocation_(heroName, hour, cohabit, memory)` — 幫不在身邊的英靈骰當下去哪：同居版（深夜回和室/清晨賴床/夜間家中公共空間）vs 一般版（深夜/清晨大機率回登記住處）；保底池排除 room/visit 分區。**七度改版新增第4參數`memory`(選填)**：深夜/清晨homeBias分支改呼叫`kanshouGetHeroHome_(heroId, memory)`，讓隨機分配住處的英靈也回得了家；省略`memory`時只吃`KANSHOU_HERO_HOME_`手寫豪邸(向後相容)。

#### 日曆·時鐘·天氣（純算·多為確定性）

- `KANSHOU_CAL_START_MONTH_/DAY_`、`KANSHOU_DAYS_IN_MONTH_`、`KANSHOU_FESTIVALS_`（常數）— 曆法起點（Day1=12/20）、每月天數、6 個節慶定義。
- `kanshouDoyOffset_(month, day)` — 某月日距當年 1/1 的天數（0-based）。
- `kanshouAbsDayToDate_(absDay)` — absDay→{year,month,day}（固定 365 天/年）。
- `kanshouHoursUntilDate_(curDay, curHour, targetMonth, targetDay)` — 算到「節慶前一天早 6 點」的小時數（錯過自動算明年）。
- `KANSHOU_TIME_BANDS_`（常數）— 5 時段跳躍分界（清晨5/午後11/黃昏17/夜20/深夜0）。
- `kanshouHoursUntilBand_(curHour, targetStartHour)` — 算到目標時段起點的小時數（已在該時段跳下一次）。
- `KANSHOU_HOUR_PER_ACTION_`(=1/6，每動作 10 分)、`KANSHOU_DAY_LAST_HOUR_`(=23)（常數）。
- `kanshouFmtHM_(h)` — 小時（可含 .5）→「HH:MM」。
- `kanshouWeatherEmoji_(w)` — 天氣文字→小圖示（降水優先）。
- `kanshouClockInfo_(pcRow)` — 組時鐘資訊物件（day/hour/band/weather/month/dayOfMonth/label 實際年月日）；HUD/actionPlay 共用。
- `KANSHOU_WEATHER_BY_SEASON_`（常數）+ `kanshouWeather_(absDay)` — 依月份查季節池、依日數確定性雜湊挑天氣（純敘事·不存表·冪等）。

#### MEMORY 標記存取器（多標記共擠一格·全形｜分隔）

- `KANSHOU_KNOCK_CHANCE_`(=0.2)、`KANSHOU_KNOCK_MIN_BOND_`(=60)（常數）— 結束一天敲門機率與候選門檻。
- `KANSHOU_KNOCK_RAID_CHANCE_`(=0.5)（常數，2026-07 八度改版新增，玩家「能不能也設計一個被夜襲的橋段」）— 深夜訪客進門(擲骰命中·見 `KANSHOU_KNOCK_CHANCE_`)且訪客好感≥`KANSHOU_KNOCK_MIN_BOND_`時，這次來訪「別有用心」(夜襲鏡像版，共用`kanshouAsleepOutcomeStr_`)的機率。
- `KANSHOU_BOND_FLOOR_TAG_`（makeIntTag_ 好感底線·2026-07 新增）— 好感棘輪的高水位，只升不降（那正是「鎖住」本身）；見 `kanshouBondFloorOf_`。
- `KANSHOU_CHILL_DAY_TAG_`／`KANSHOU_CHILL_MIN_DROP_`(3)／`KANSHOU_CHILL_DAYS_`(1)（2026-07 新增）— 🧊 好感【趨勢】。提示詞原本只給純量好感值，剛爬到 90 跟從 98 摔到 90 完全相同，冷落她毫無效果。只記「最近一次讓她不高興是哪一天」(absDay)，靠日期自然衰減。蓋戳兩處：爽約 -5、AI `rel_changes` 掉幅 ≥ MIN_DROP（**用 `change` 本身判定而非 `newFav-oldFav`**——棘輪把值夾在地板時兩者差 0，但她確實不高興過）。呈現在她自己的卡片（`pChillStr`，接在好感數字後）而非全域旁白，避免代名詞懸空。
- `KANSHOU_COHABIT_END_TAG_`（makeIntTag_ 同居解除·2026-07 新增）— 跨函式傳事實用：`kanshouSyncRelTier_` 是共用 helper、看不到提示詞變數，蓋一次性旗標讓 `actionPlay_` 組 `kanshouCohabitEndStr` 時讀一次就清。
- `KANSHOU_NIGHT_PART_TAG_`（makeTextTag_ 昨夜道別·2026-07 新增）— 與【晨間餘韻】同構的另一半：昨晚陪你到最後、卻沒留下的人（未達 80）。兩者互斥。
- `KANSHOU_KNOCK_DAY_TAG_`／`KANSHOU_NIGHT_GUEST_TAG_`／`KANSHOU_FESTIVAL_DONE_TAG_`（2026-07）— 深夜訪客日戳／夜訪客姓名／今日節慶習俗已完成（absDay）。
- `KANSHOU_MORNING_AFTER_TAG_`（makeTextTag_ 晨間餘韻）、`KANSHOU_SCENE_DAY_TAG_`（makeIntTag_ 橋段日·防同日重刷）、`KANSHOU_FIRST_MET_DAY_TAG_`（makeIntTag_ 初見日·紀念日）、`KANSHOU_APPT_BANDS_`（約定時段 午後14/黃昏18/夜20）。
- `KANSHOU_SIDEWRITE_EVERY_`(=3)（常數）+ `kanshouGetSideWriteCount_`/`kanshouSetSideWriteCount_(memory[,n])` — 側寫節流計數（存玩家列，第 1、N+1… 回合才帶 master_note；2026-07 二度改版後 master_note 只剩經歷一格，`kanshouGetPrefLocks_`/`SetPrefLocks_`＋【性格鎖】標記已整組刪除）。
- `kanshouApptHour_(band)` — 約定時段→時刻（null=舊格式無時段）。
- `kanshouGetPromise_` / `kanshouClearPromise_` / `kanshouSetPromise_(memory, absDay, loc, band)` — MEMORY【約定】absDay:band:loc 讀/清/寫（新約蓋舊、舊格式相容）。
- `kanshouPromisePin_(row, absDay, curHour)` — 約定日把她 pin 到約定地：有時段=時刻前 10 分~+2h 內回地點、否則整天釘（相容）。
- `KANSHOU_COHABIT_TAG_`（makeIntTag_ 同居）、`KANSHOU_HANDHOLD_TAG_`（makeTextTag_ 牽手·存玩家列單一對象）、`KANSHOU_AWAKE_HERE_TAG_`（makeTextTag_ 醒著陪同·2026-07新增·存該同伴列MEMORY·值＝她被判定醒著時所在的LOC）、`KANSHOU_COHABIT_BOND_`(90)、`KANSHOU_VISIT_BOND_`(40)、`KANSHOU_COHABIT_ROOM_`(和室)（常數）。
- `kanshouIsCohabit_(row)` — 該從者是否同居中。
- `KANSHOU_FIRSTS_TAG_`／`kanshouGetFirsts_(memory)`／`kanshouStampFirst_(memory, key, absDay)`（2026-07 新增）— 💞 結構化「第一次」帳（存該同伴列 MEMORY`【初次】事件:absDay,…`）。`kanshouStampFirst_` 冪等：同 key 只記最早那次、滿 `KANSHOU_FIRSTS_CAP_`(20) 就不再收（既有的永不驅逐）；鍵名寫入前濾掉 `,:｜|【】`。蓋戳呼叫端：`actionPlay_` 的 cohabitInvite／post-AI 牽手接受分支／endDay 同床／`_settle` 赴約／roomEventAccept 非拒絕分支。讀取端：`actionPlay_` 的 `partyRows` 迴圈（取最早 `KANSHOU_FIRSTS_SHOW_`(5) 筆餵提示詞＋同月同日的週年偵測）。**加一種新的「第一次」＝呼叫端多一行 `kanshouStampFirst_`，helper 不必動。**
- `KANSHOU_KNOCK_DAY_TAG_`（`makeIntTag_('夜訪日')`·存**玩家**列·absDay）／`KANSHOU_NIGHT_GUEST_TAG_`（`makeTextTag_('夜訪客')`·存**玩家**列·姓名）— 🚪 深夜訪客。前者一天只讓她登門一次（落盤化後「結束一天」可能被按很多次）；後者是「請她回去」(`dismissGuest`)的**唯一姓名來源**，刻意不吃 client 傳的名字。任一種收場（留下過夜／送她回去／單純結束一天）都會清掉後者。
- `KANSHOU_COHABIT_ASKED_TAG_`（`makeIntTag_('同居問過')`·存該同伴列·**absDay 不是布林**）— 🏠 同居邀請泡泡的當日鎖。布林版玩家一旦改用打字，這個「一生一次」的邀請就永遠消失；完全不記又會退回被嫌煩的「每回合都跳」。舊存檔殘留的值 `1` 自然不等於當前 absDay，下次自動恢復詢問，不需遷移。
- `PERSONA_SPEECH_TAG_`／`PERSONA_TIC_TAG_`（`makeTextTag_('口吻')`／`('小動作')`·Router_Persona.gs）— 🗣️ 2026-07 稽核：這兩個標記原本由 `stampPersonaFlavor_` 自己拼字串、**完全沒清洗**（speech 來源含工房 AI 生成的 dailyLook 第3段，AI 吐一個「【」就切壞整條 MEMORY）。改走工廠後一次拿到清洗＋replace-or-append；`getPersonaSpeech_`/`getPersonaTic_` 與 Router_Bond/Seed_Codex 的三處重複 regex 全部委派過來，全專案 4 份實作收斂成 1。
- `KANSHOU_REL_RANK_TAG_`／`kanshouRelRank_(bond)`／`kanshouRelTierLabel_(rank)`（2026-07 新增）— 💗 關係階質變。`kanshouRelRank_` 把 BOND 換算成 1(點頭之交)~5(戀人) 的階數（反轉 `KANSHOU_REL_TIER_` 的高→低排序）；`【關係階】` 記當前階，**2026-07 改為雙向**（原本只升不降，於是降階時親密尺度悄悄收緊卻零敘事，玩家下一回合直接撞到「她突然不讓我碰了」；同居邀請的「一生一次」早就不靠這個 tag，有自己的 `KANSHOU_COHABIT_ASKED_TAG_`(absDay)＋`!kanshouIsCohabit_` 兩道獨立閘門，故改雙向是安全的）；`kanshouRelTierLabel_` 把階數換回階名（索引反轉，`KANSHOU_REL_TIER_` 仍是唯一真實來源）。跨階時只餵【事實】「某某從『A階』跨進『B階』」，不給寫好的文案。偵測在 `actionPlay_` 的 `partyRows` 迴圈（與紀念日同一趟）：首次見到靜靜記下當前階不報，之後升階才注入質變提示。**刻意看 BOND 不看 REL_TAG**——玩家自訂關係稱呼後 REL_TAG 不再等於梯度字面，跨階演出不該因此消失。
- `KANSHOU_COHABIT_EVENTS_`（2026-07 新增·常數）— 🏠 同居日常橋段觸發表（時段→事件名，五時段各一）。觸發是橋段的**第四層·最低優先**（節慶→住處睡眠→地點→同居日常），舞台限 `kanshouPlayerHomeLocs_`（`region:'home'`＋我的房間），候選經 `_reIsCohabitTrigger_` 限同居中的她。加時段＝這裡加一列＋`KANSHOU_SCENE_EVENTS_` 加對應事件，觸發邏輯不動。
- `kanshouIsAwakeWithMe_(idx)`（`actionPlay_`內部函式，2026-07 改吃`pcData`索引，原吃姓名字串）— 判定該同伴此刻是否醒著陪同(供夜襲/賴床叫醒的候選過濾＋`pSleepStr`熟睡提示排除用)：牽手中／這回合剛與玩家一起移動抵達＝true；否則讀`KANSHOU_AWAKE_HERE_TAG_`，若上次判定醒著時記的LOC仍等於她目前LOC也算true。判定為醒著就把她目前LOC寫回tag，否則清空——地點一變(離開/被重骰走)tag自動失效，不必額外收尾。**🐛→✅**：原本只認「這回合牽手/剛到」，一放手或下一回合就失效，會把明明還醒著互動的同伴誤判成熟睡，改成這個持久tag解決。
- `KANSHOU_MET_COUNT_TAG_`／`KANSHOU_FAMILIAR_TIERS_`／`KANSHOU_RAPPORT_BOND_TIERS_`／`KANSHOU_RAPPORT_TONE_`／`kanshouRapportTone_(bond, metCount, isLover)`（2026-07 新增，`gas/Gallery.gs`；**同月加第三參數 `isLover`**）— 相處基調 2D 表。`【相處】N` 每個對話回合對每位在場者 +1（`kanshouTimeJumped_` 時不加）；查 好感4段 × 熟悉度3段 → **一句既定事實**（開頭一律「事實：」），查無回空字串（刻意留白＝那一格不給指令，15 格只填 11 格）。`isLover` 為真時直接走第五排 `'交往中'`、不再看好感段（上面四排全是「還沒在一起」的溫度，尤其「等你先開口」交往後再演就變成她失憶）。掛在 `partyDetailsArr` 每人自己那行，取代舊的 1D `pTierToneStr`。⚠ **只寫事實、不寫演技**：不得出現未指涉代詞（「這件事」）或替角色決定的微動作（「愣一下」「打呵欠」）——前者小模型解不開會自己編，後者讓所有角色套同一套表情。交棒句（怎麼表現依她個性）寫在 `PROMPT_REL` 的【角色一致性】★ 一次。兩者已由 `check_wiring.py` ⑤ 機器擋（`check_prompt.py` 只掃 ★ 行、看不到資料表）。
- `KANSHOU_LOVER_TAG_`／`KANSHOU_CONFESS_DAY_TAG_`／`KANSHOU_CONFESS_BOND_`(60)／`KANSHOU_CONFESS_COOLDOWN_`(3)／`KANSHOU_CONFESS_SLOPE_`(0.028)／`KANSHOU_CONFESS_FAMILIAR_MULT_`／`kanshouIsLover_(row)`／`kanshouConfessWait_(row, curDay)`／`kanshouConfessAccepts_(bond, metCount)`（2026-07 新增，`gas/Gallery.gs`）— 💗 告白。`kanshouIsLover_` 是「是不是戀人」的唯一判準（前後端與提示詞全走它）；`kanshouConfessAccepts_` 依 `(bond-60)×SLOPE×熟悉度係數` 擲定成敗（夾 2%~95%，GAS 擲、AI 只演）；`kanshouConfessWait_` 回傳被拒後還剩幾天說不出口（後端擋與前端鎖按鈕的單一真實來源）。落地在 `actionPlay_` 的 `userData.confess`／`confessId` 分支（四態＋撲空共五條 ★），入口是前端關係中樞的「向她告白」。
- `KANSHOU_CUSTOM_PROP_CAP_ = 10`（2026-07 新增·常數）— 玩家自訂道具目錄上限筆數。
- `kanshouGetQuickPhrases_(memory)` / `kanshouSetQuickPhrases_(memory, arr)`（2026-07「表情包文字也想自訂」新增）— 玩家列 MEMORY【快速貼圖】text1,text2,... 讀/整批寫，純文字清單(不像自訂道具需要子欄位)。跟前端寫死的4個內建貼圖(害羞/小聲/苦笑/臉紅，2026-07同月再縮減)分開存，`actionKanshouCompanions`/`actionEnterKanshou`(兩條有效回傳路徑：①帳號表已連結、②舊版MEMORY標記一次性遷移——**🐛→✅ 再稽核抓到②原本漏帶**，跟①不一致已補齊)回傳時一併附上供前端合併渲染。
- `actionKanshouAddQuickPhrase(userData, pcId, sheets)` / `actionKanshouDeleteQuickPhrase(userData, pcId, sheets)`（2026-07 新增，action名`kanshou_add_quick_phrase`/`kanshou_delete_quick_phrase`）— 新增/刪除玩家自訂快速貼圖，`kanshouOwnedRowIdx_`驗證歸屬；新增檢查重複＋上限`KANSHOU_QUICK_PHRASE_CAP_=8`句，`text`用`kanshouSanitizeTagValue_(userData.text,12)`清洗；刪除按文字完全比對移除。皆回傳`quickPhrases`最新清單。

#### 相簿（拍照·手機·2026-07 再修）

- `KANSHOU_ALBUM_CAP_`(100)（常數，唯一容量限制）。**2026-07 拍照改手機**：`KANSHOU_FILM_PER_DAY_`常數＋`kanshouFilmUsed_`/`kanshouFilmStamp_`函式已整組刪除——手機沒有底片這種東西，拍照不再有每日張數上限。
- `kanshouAlbumSheet_()` — 取（無則建）「相簿」分頁（11 欄位置索引）。
- `KANSHOU_HAIR_COLORS_`（常數·順序敏感）+ `kanshouHairHex_(lookText)` — 從 TRAIT 外貌文字抓髮色詞→hex（相簿色卡用），查無退中性深棕。
- `KANSHOU_ANNIV_MILESTONES_`（常數 [7,30,100,365]）— 相識紀念日里程碑。

#### 輕量小事件·邂逅中·住所（MEMORY 標記）

- `KANSHOU_EVENT_SEEDS_`（常數 daily/ambiguous/spicy）+ `kanshouRollEvent_(driveOn)` — 抵達新地點 20% 抽一顆靈感種子注入提示詞（spicy 僅 driveOn）。
- `getKanshouActiveEncounter_` / `setKanshouActiveEncounter_` / `clearKanshouActiveEncounter_(memory[,heroId])` — MEMORY【邂逅中】（這次到訪暫時巧遇對象·存 hero id·換地點清除）讀/寫/清。
- `getKanshouHomeName_(memory, playerName)` / `setKanshouHomeName_(memory, name)` — MEMORY【住所】家顯示名，未自訂預設「(玩家名)的家」/「我家」。**🐛→✅ 稽核抓到**：`setKanshouHomeName_`原本只裁長度、沒清標籤分隔字元，玩家取名帶`｜`會撐壞這行MEMORY格式；已改用`kanshouSanitizeTagValue_`(見上方小道具章節同款)。
- `kanshouSanitizeTagValue_(value, maxLen)`（通用版：住所名等任何單值 tag 共用）— 清掉 MEMORY 單值 tag 共用的分隔字元(`,`/`:`/`｜`/`【`/`】`)＋引號/角括號，`maxLen`不帶預設8。任何要塞進單一`【tag】值`格式的自由輸入都該過這道，不要各自複製一份正則。

#### 稱呼別名橋（短名↔全名比對）

- `KANSHOU_CASUAL_NAME_`（常數）— SEED id→日常短名/職階（SABER/RIDER/伊莉雅/櫻/凜/大河/士郎）。
- `KANSHOU_NAME_ALIAS_`（常數）— 全名↔短名雙向別名表。
- `kanshouCasualOf_(hero)` — 顯示用短名（有登記用短名、否則 realName）。
- `kanshouNameCandidates_(fullName)` — 產生比對候選集：全名/括號前後段＋日常別名＋拉丁大小寫三態。rel_changes/intimacy_feedback/npc_exit/名字比對全靠它容錯，是整檔跨名比對的地基。

#### 🔴 核心敘事引擎

- `actionPlay(userData, pcId, sheets)`（2026-07 稽核後改為薄包裝，~15 行）— 用 `CacheService` 對同一 `pcId` 做軟性互斥（偵測到同 pcId 仍有一次在跑就直接回「請稍候」拒絕本次），再委派給 `actionPlay_`。修的是：本函式故意豁免 `LOCK_EXEMPT_ACTIONS_` 全域鎖(AI呼叫數秒~49秒，鎖全域會拖累其他玩家)，但寫回是「整表快照→記憶體全改→結尾整列覆寫」，同pcId兩次呼叫窗口重疊時後flush者會整列蓋掉先flush者的全部改動——這裡不加全域鎖(仍會拖累其他玩家)，只鎖「同一pcId」。
- `actionPlay_(userData, pcId, sheets)`（~1440 行，原 `actionPlay` 更名而來，呼叫關係／ActionRouter 對照不變，仍是 `"play"` 唯一實際邏輯）— 鑑賞唯一敘事引擎（入口擋非 KPC_；帳號歸屬驗證**已上移到 dispatcher**——`handleGameAction` 統一呼叫 `verifyPcOwnership_`，本函式內部只需 `kanshouPcIdx_(data, pcId)` 純索引查找，不必再自己反查帳號表；舊版 `kanshouOwnedRowIdx_` 已刪除）。玩家主對話 `message` 欄位嵌入提示詞前已補 `｜【】` 分隔符清洗（防偽造 MEMORY 標記／偽造系統指令段）。單回合處理全部意圖：地點移動＋私宅門檻＋**六度改版新增時段門檻**（`moveTarget.bands`跟`timeBand_(curHour)`不合就擋在移動前，比照私宅門檻同款「當作沒真的進去」寫法，有pending約定豁免）／**玩家發起的相約·牽手·同去提議**（`kanshouProposalAccepts_` 在呼叫 AI **前**先依 BOND 擲骰定成敗，結果直接寫進提示詞告訴 AI「成敗已由系統定」，AI 只演反應，`proposal_accept` schema 欄已整個刪除；2026-07 id 化重構：`promiseMeet`/`cohabitInvite`/`handHold` 三處對象解析改走 `findPcRowIdx_({id, name, nameCandidates:kanshouNameCandidates_})`，前端有帶 id 就精準命中、查無才退回原本名字模糊比對，同時仍套用同地點/在世/faction 過濾；2026-07 稽核：`promiseMeet`/`proposeMove`/`cohabitInvite`/`handHold`/`inviteResident` 五處撲空的敘事字串+回饋物件改呼叫共用 `kanshouMissStr_(type, name)`（查 `KANSHOU_MISS_COPY_` 表取措辭），取代各自手拼字串)／結識入駐（inviteResident）（NPC 主動邀約/邀同居的 GAS 判定觸發機制`kanshouPromiseOffer_`/`kanshouCohabitOffer_`皆已於八度改版移除，約會/同居現只剩玩家自己主動發起——`promiseMeet`/`kanshouInviteCohabit`一條路）／情境橋段注入（三層：節慶>地點×時段>同居日常，只注入 `ambient` 事實、不再有邀請泡泡）／深夜訪客（endDay 擲骰命中→直接落盤讓她進門＋回傳 `nightGuest` 善後選項）／結束一天（睡眠·同床≥80·晨間餘韻·強制回房·放手·眾人重骰行程）／推進時間·跳時段·跳節慶（rollHours_）／被動時間流動（每動作 +10 分·跨時段觸發 NPC 自然告辭）／赴約·爽約結算（時間×地點驅動·準時窗+5/遲到+3/爽約-5·寫共同回憶）／巧遇擲骰／拍照·看照片。組 system prompt（`buildDefaultSystemPrompt`）＋巨型 USER prompt（在場卡片/親密五階/移動鐵律/時段/世界觀）→ `callGeminiAPI`（`AI_MODEL`，被擋才自動換 `FALLBACK_MODEL`；時間轉場砍 max_tokens）。落地 AI 回傳：rel_changes（夾聊天上限·kanshouSyncRelTier_）/intimacy_feedback（physical_state/appearance_extras(原outfit_change)/mutual_nicknames/attitude/memory 共同回憶）/npc_exit/master_note 滾動側寫（現只剩經歷一格，性格四格/萌點創角時一次生成、遊玩期間AI不再碰）。**2026-07 四度改版拔掉`dynamic_skills`(雙修技巧)**：無UI無使用規則的孤兒欄位，連同`kanshouSkillTagStr_`/`processSkills`/`setSkillTag_`三個輔助函式一併刪除。回傳前經 `sanitizeAiData_` 守門。競態修 `buildLiveIdIndex_` 重定位後單列寫回。回傳 text/people/options/tags/各種泡泡與通知條/時鐘。
  - 內嵌 helper：`_qv`（值落在 `QUAD_EMPTY_` 就回空，2026-09 新增）／`formatPref`/`formatTrait`（送 AI 前的性格·特徵格式化，空格與佔位字整格不送、不再輸出「無」。⚠ 2026-07 送出時砍格後兩者呈現方式已不同——`formatPref` 只送 [表象][內裡]、`formatTrait` 合併 [外貌氣質]＋[台詞自稱]，共用的 `formatFourSlot_` 因此失去意義已刪除；第4格由 `traitPrivateOf_` 併進萌點）、`relMemMemoryStr_`（REL_MEM 專屬稱呼＋態度）、`_whereIsHer`（撲空提示找她位置）、`_settle`（赴約結算閉包）、`sanitizePhysicalState`/`sanitizeAppearanceExtras`（原`sanitizeOutfitChange`，篩敷衍語·容錯截斷）、`processTags`（專屬稱呼 append 去重）、`processMemoir_`（共同回憶 append·雙字組 0.6 相似去重·★釘選不驅逐）。（`processSkills`/`setSkillTag_` 已隨雙修技巧機制整組刪除）

#### 相簿 actions（讀/刪·拍照本體在 actionPlay）

- `actionGetAlbum(userData, pcId, sheets)` — 讀本局全部照片（新到舊·dateLabel 後端算好）。**2026-07 拍照改手機**：不再回傳 `developed`/`filmLeft`/`filmPerDay`，手機拍完立刻能看，只剩 `cap` 這個相簿總容量。帳號歸屬驗證已上移到 dispatcher（`verifyPcOwnership_`），本函式只用 `kanshouPcIdx_` 純索引查找。`photo_caption` 寫入相簿表前已補控制/零寬/雙向字元清洗＋公式引導字元阻擋（比照 `sanitizeUserData_` 的保護等級，防 AI 輸出被利用來注入相簿列）。
- `actionAlbumDelete(userData, pcId, sheets)` — 刪照片（照片 ID＋遊戲 ID 雙比對·只能刪自己這局）。帳號歸屬驗證已上移到 dispatcher，本函式只用 `kanshouPcIdx_`。

---

**清點**：約 70 個函式（含 `actionPlay` 內嵌 helper）＋ 約 33 個模組級常數/資料表/標記器。

**備註（已查證·非死碼）**：
1. `translateLookToDaily_`／`translatePersonalityToDaily_`／`translateMoeToDaily_` 三支戰時→日常 AI 轉譯函式本檔內無呼叫點，但確為活碼：呼叫端在 `Router_Creation.gs`（`recordOriginalHero_` 工房鑄入＋`actionSaveHero` 修改分支），工房存檔時算好寫入 DAILY_* 欄；鑑賞撈取純讀快取、不呼叫 AI。
2. 檔頭註解自陳：「鑑賞」schema 已移除、全庫無讀寫者，留著的空分頁無害可自行刪（已知殘留·非 bug）。
3. `kanshouRoomDisplayName_(locKey, pcData, gameId, myName, myIdx)` 只用到 locKey/myName，pcData/gameId/myIdx 三個參數現未使用（房客世界觀砍除後的殘留簽名·無害）。
### Core_Settings.gs

第一部分：基礎設定、ORM 映射與數值統計核心。金鑰/模型常數、`COL` schema、六圍換算、HP/MP/魔力池公式、MEMORY 標記封裝、狀態字串封裝、靜態種子快取、地理雷達與在場清單。

#### 常數 / schema（非函式）

- `OPENROUTER_API_KEY` — IIFE 讀 ScriptProperty `OPENROUTER_API_KEY`（唯一認的名稱，舊別名已砍），無則空字串。
- `MODEL_URL` — OpenRouter chat/completions endpoint 常數。
- `AI_MODEL` — 兩軌共用的唯一主力模型（預設 `google/gemini-3.5-flash-lite`）；ScriptProperty `MODEL` 優先。
- `FALLBACK_MODEL` — 被審查擋下／重試全敗時的後援（預設 `x-ai/grok-4.20`）；ScriptProperty `FALLBACK_MODEL` 優先。由 `callGeminiAPI` 全域自動套用，呼叫端不必傳。
- `rollMasterFate_()`（2026-09 新增，`Core_Settings.gs`）— 🎲 御主天賦（迴路/魔術系統/出身/體術/魔術階）的**唯一真實來源**，從 `Script_Onboarding.html` 搬進後端。`actionRollFate`（action `roll_fate`）一次回三份候選給前端挑；`actionManualNpc` 在玩家沒測定時自己擲一份。
- `FATE_MAGICS_` / `FATE_ORIGINS_`（常數）— 魔術系統／出身名冊，供 `rollMasterFate_` 抽。前端已無副本。
- `COL` — 眾生/地圖/英靈殿/御主殿/帳號各表的**欄位位置索引 schema**（詳見 §COL；含已併入的關係/時鐘/權柄欄與 MONEY/UPKEEP_WEEK/ROOM/MEMOIR 等死欄占位）。
- `RANK_VALUE` — Fate 六圍階級 E~EX → 數值對照表（10/20/30/40/50/60）。
- `OUTPUT_TIERS_` — 從者出力檔位表 100/80/60/40/20 → {hit, dmgMul, drainMul, np, label}。
- `RUNE_MODES_` — 原初符文模式白名單 `['def','dmg','regen']`。
- `OVERCHARGE_TAG_` — 由 `makeIntTag_('過充',0)` 生的過充標記 get/set/clear 物件。
- `SEED_CACHE_SECONDS_` — 靜態種子表快取時數常數（21600＝6 小時）。

#### 六圍與階級換算

- `rankVal(r)` — 階級字母（含 +/- 修飾，各封頂 3 個）→ 數值；base + plus×5 − minus×3；含玩家自由輸入防灌傷上限。**邊界特例**：去掉 +/- 後若完全沒有字母（如種子資料用裸 `"-"` 佔位、代表官方未給階級），直接回傳 E 基準(10)、不套加減修正——2026-07 修：舊版會把這個裸 `"-"` 字元也當「減號修飾」再扣一次 3，變成 7、比真正的 E(10) 還低，跌破多處 `rankVal(...)>=10`「有無寶具」的判斷門檻。

#### HP / MP / 魔力池公式

- `clampCircuits_(n)`（2026-07 稽核抽出）— 迴路骰子範圍夾值(12~50)共用函式，取代 `Router_Creation.gs`/`Seed_Rivals.gs` 兩處各自硬寫的 `Math.max(12,Math.min(50,...))`；`Script_Onboarding.html` 前端骰子UI跨執行環境不共用此函式，同款數字改動時需手動同步（已於該處補註解互相標記）。
- `fateMaxHpMp_(con, mag)` — 由耐久/魔力數值算從者 HP(100+con×10)/MP(50+mag×10)，無階級倍率。
- `masterMaxHpMp_(circuits)` — 御主（凡人魔術師）HP(100+迴路×2)/MP(迴路×10)，迴路夾下限 1。
- `masterPoolMax_(circuits, partyMagicVal)` — 共用魔力池上限＝迴路×10 ＋ 同隊從者魔力 rankVal 總和×2。
- `maxStatsForRow_(row)` — 解析列的 SIX JSON，取耐久/魔力交給 `fateMaxHpMp_` 算 HP/MP。
- `dmgSeverityWord_(dmg, hpMax)`（2026-07 稽核抽出）— 傷害嚴重度中文詞分級（重創≥0.4／負傷≥0.15／擦傷），取代 `Router_Movement.gs` 三處(撤退追擊/休息突襲/陣營突襲)重複的同一條 ternary；`Router_Bond.gs` 的 `actionBond` 突襲提示原本沒有分級(硬寫死「重創」)，順手改用此函式補齊一致性。
- `ambushDispatchPrompt_(ambush, interruptedFn, normalFn)`（2026-07 稽核抽出）— 共用「突襲結果三分支」派工：`ambush.homeRepel`/`peaceful` 為真→用 `ambush.repelNote`；有 `ambush` 但非上述→呼叫 `interruptedFn(ambush)`；否則呼叫 `normalFn()`。取代 `Router_Economy.gs`(補魔/修復)、`Router_Bond.gs`(羈絆/盟友共處)、`Router_Movement.gs`(休息) 共5處幾乎相同的三分支判斷樣板，各呼叫端只帶自己的敘事文案。
- `chargeApOrReject_(gameId, cost, pcData, sheets, rejectMsg, opts)`（2026-07 稽核抽出）— 合併「AP門檻檢查(不足回`{success:false,needRest:true,message:rejectMsg}`)＋`spendAp_`扣AP＋`clockLabel_`算時鐘標籤」三件套，取代 Movement/Economy/Bond 三檔共11處幾乎逐字重複的樣板；`opts.skipWrite`透傳給`spendAp_`。`actionMove`(cost固定2、與`worldTick_`緊密耦合)刻意不套用，維持原樣。**2026-07 再稽核補完**：`Router_Battle.gs`的`actionFateBattle`(傳`skipWrite:true`，因後段還有一次整表`setValues`會覆蓋同一批欄位)/`actionSummonHorror`(**不傳**`skipWrite`，因`drainForNp_`的整列寫回發生在AP扣款前、DAY/HOUR/AP仍需這裡自己補窄欄寫入，兩者情境不同不能套同一種傳法)共2處原本仍手刻AP門檻+扣費，已一併改用此共用函式。**⚠ `.reject`回傳路徑目前全部呼叫端都沒真的檢查過**(呼叫前皆已有獨立guard擋過)，是預留但吃不到的死路徑，新呼叫點若打算只靠這支擋門檻(不自帶前置guard)務必自己補`.reject`檢查，否則門檻不足會讓`{ap,clock}`兩key靜默消失混進成功回應。

#### 從者出力檔位（MEMORY【出力】）

- `snapOutput_(pct)` — 任意百分比吸附到最近合法檔位（20/40/60/80/100），NaN→60。
- `outputTier_(pct)` — snap 後回 `OUTPUT_TIERS_` 對應檔位物件（fallback 60）。
- `servantOutput_(memory)` — 讀 MEMORY【出力】檔位，無則 60。
- `setServantOutput_(memory, pct)` — 寫/改 MEMORY【出力】，回新 memory。

#### 多寶具選擇（MEMORY【寶具選】）

- `npChoice_(memory)` — 讀解放寶具索引，無則 0。
- `setNpChoice_(memory, idx)` — 寫寶具選索引（先清舊標記再附加）。

#### 原初符文模式（MEMORY【符文】）

- `runeMode_(memory)` — 讀符文模式 def/dmg/regen，無則 def。
- `setRuneMode_(memory, mode)` — 寫符文模式（白名單驗證，非法→def）。

#### MEMORY 標記共用工廠

- `makeIntTag_(tagName, defaultVal)` — 產數值型標記的 {get, set, clear}；set 先剝除舊標記與殘留分隔符再附加（處理意外重複）。
- `makeTextTag_(tagName)` — 產文字型標記的 {get, set}（無驗證/截長，給受信任內部字串；沿用單次 test+replace 寫法）。

#### 敵寶具預告旗標（MEMORY【寶具預告】）

- `getNpTelegraph_(memory)` — 是否已預告（布林）。
- `setNpTelegraph_(memory)` — 蓋上預告旗標（冪等）。
- `clearNpTelegraph_(memory)` — 移除預告旗標。

#### 補魔過充（MEMORY【過充】，委派 OVERCHARGE_TAG_）

- `getOvercharge_(memory)` — 讀過充存量，無則 0。
- `setOvercharge_(memory, amt)` — 寫過充存量（夾下限 0、四捨五入）。
- `clearOvercharge_(memory)` — 清過充存量。

#### 從者換裝 / 武裝（純外觀，MEMORY【換裝】/【武裝】）

- `getOutfit_(memory)` — 讀當前服裝文字，無則空。
- `setOutfit_(memory, text)` — 寫換裝（過濾分隔字元、限 40 字，空字串＝清除）。
- `clearOutfit_(memory)` — 清換裝。
- `getWeapon_(memory)` — 讀玩家自訂武裝文字，無則空。
- `setWeapon_(memory, text)` — 寫武裝（過濾、限 30 字，空＝清除）。
- `clearWeapon_(memory)` — 清武裝。

#### 主從 synergy（恩奇都 ↔ 銀狼）

- `masterSynergySix_(name, six, memory)` — synergy 觸發時把六圍拉回全盛（全 A・寶具 A++），否則原樣回傳。
- `masterSynergyOn_(name, memory)` — 單一真實來源；讀 MEMORY【御主】名判定是否為恩奇都×銀狼。
- `masterSynergyView_(name, memory)` — 前端「變容」標籤視圖；非 synergy 從者回 null，恩奇都回 {has, on, master, peak}。

#### 魔境的智慧（斯卡哈專屬，MEMORY【魔境】）

- `mageRealmPool_()` — 回傳 6 個可選 A 階通用被動的資料表（fx/n/r/icon/desc）。
- `mageRealmEntry_(fx)` — 查某 fx 是否在池內，回該項目或 null。
- `mageRealmPick_(memory)` — 讀 MEMORY【魔境】選定 fx（需通過池驗證），無則空。
- `setMageRealmPick_(memory, fx)` — 寫/改魔境選定 fx（空字串＝清除）。

#### 特徵 / 性格字串清洗

- `cleanChineseName(s)` — 姓名限定純中文（CJK 含擴展 A），濾除英數符號 emoji，上限 10 字；全系統唯一真線。
- `parseTraitsHelper(data, defaultStr, want?)` — 亂碼特徵粉碎器；正規化陣列/物件/字串、剝 AI 雞婆標籤與數字、句號→頓號，切成固定 `want` 格（省略＝4；TRAIT 一律傳 `TRAIT_SLOTS_`＝3）。缺格從 defaultStr 對應段補、再退「無」；defaultStr 的段數要跟 `want` 對齊，否則補出來的格會錯位。
- `looksToTraitParts_(rawLook)` — 把種子 persona.look 拆成「末段＝氣質、其餘合併為外貌」，組出三格骨架（外貌／氣質／私密面佔位）餵給 `parseTraitsHelper`。2026-09 拿掉 firstP 參數：自稱已從特徵格退休、併進【口吻】。
- `TRAIT_SLOTS_`（常數＝3）— 特徵格數：外貌本相／氣質舉止／卸下心防的私密一面。個性（PREF）仍是 4 格。
- `traitParts_(raw)` — **讀特徵格的唯一入口**：舊局存的是四格（第3格曾是「自稱與口氣」），自稱併進【口吻】後那格退休，長度 >3 就地剝掉 index 2。前端鏡射在 `Script.html` 的 `traitSegs_`，兩邊要一起改。
- `enrichPersonalityLikesDislikes_(name, cls, rawWords)` — 種子 words 不足 4 段時呼叫 AI 延伸喜歡/討厭補滿（既有短句不改），已滿 4 段直接跳過。

#### 軌跡骨幹（solo 事實錨點）

- `buildTrajectoryDigest_(pcData, gameId, pcRow)` — 由已讀的 pcData 組「已確定事實」快照句（日/AP、與從者好感、傷勢、魔力池危機、令咒數、位置）當敘事前錨；只做當下快照不累積。

#### 狀態字串封裝

- `parseVisibleStatus(rawStatus)` — 解析外顯狀態 JSON → {衣服/姿勢/負面/顏面}，失敗則把原字串當顏面。
- `buildVisibleStatusString(rawStatus)` — 組人眼可讀的外顯狀態串（濾掉「無」與健康類詞），空則回「氣息平穩」。
- `mergePhysicalStatus(oldJson, newVal)` — 合併 physical_state（現只單一「狀態」鍵）；解析失敗當空物件確保 newVal 一定套用。
- `buildPlayerStatusString(selfRow, relMem)` — 組 `§` 分隔的下傳狀態串；MEMORY/relMem 內 `|` 轉義為 `@@@`；慾海(K系id)以肉體狀態填外顯格、solo 留空；含九州廢欄占位。已移除 `getFreshStatusString`(整表重讀版)——各 handler 改直接對記憶體中的 pcData 呼叫 `buildPlayerStatusString`，省一次整表讀。

#### 靜態種子表快取

- `getMapDataCached(sheets)` — 直接回 `FATE_MAP_SEED` 包表頭（坤圖已靜態化，不讀表；sheets 參數僅相容留存、不使用）。
- `getHeroCodexCached()` — 英靈殿名冊；先讀 ScriptCache，未命中才讀「英靈殿」分頁並快取 6 小時（唯一仍需持久化的動態種子表，因工房可寫原創英靈）。
- `getMasterCodexCached()` — 御主殿；即時用 `masterToCodexRow_` 把 `SEED_MASTERS` 組出包表頭，不讀表不快取（已靜態化）。

#### 登場日閘門（MEMORY【登場日】/【登場提示】）

- `getArriveDay_(memory)` — 讀敵人登場日，無則 1。
- `setArriveDay_(memory, day)` — 寫登場日（夾下限 1；=1 不佔字串）。
- `getArriveHint_(memory)` — 讀登場前風聲提示句，無則空。
- `setArriveHint_(memory, hint)` — 寫登場提示句（空＝清除）。
- `hasArrived_(row, currentDay)` — 該敵人現在算不算在世界裡（currentDay ≥ 登場日）；同地互動/鎖定/世界自走的單一真線。

#### 御主自身能力標記（MEMORY【體術】/【魔術】/【魔術階位】/【出身】）

2026-07 稽核：以下4個 getter 內部改委派 `makeTextTag_('體術'|'魔術'|'魔術階位'|'出身').get`（既有工廠，取代各自手寫的正則），簽名/行為不變。

- `getMasterMelee_(memory)` — 讀御主體術 rank 字母/描述。
- `getMasterMagic_(memory)` — 讀御主魔術系統自由描述。
- `getMasterMagicRank_(memory)` — 讀御主魔術階位 rank 字母（僅己方 Caster 出戰時生效）。
- `getMasterOrigin_(memory)` — 讀御主 MEMORY【出身】(創角時玩家選的身世來歷，如「教會代行者出身」)。供 `masterCard_` 併入演出依據卡（2026-07 修：舊版創角時只寫入未曾讀取，玩家選的出身從此再也影響不到任何敘事，補上這條讀取線）。

#### 地理雷達 / 在場清單

- `buildLiveIdIndex_(sheet)` — 單欄窄讀 ID 欄回 {id → 當下 0-based 列索引}；供豁免寫入鎖的 play/backfill 在 AI 回來後重定位、避開期間刪列造成的錯位。
- `findPcRowIdx_(pcData, gid, opts)`（2026-07 新增，id 化重構單一真實來源）— 系統內部身分解析共用 resolver（別跟 AI 敘事文字比對混：那類仍走各自的 `nameCandidates` 名字比對，見下）。`opts = {id, name, gid(透過參數帶入)/faction/loc/excludeIdx/aliveOnly=true/nameCandidates/normalize}`。`opts.id` 有給先在 `gid` 範圍內找 id 命中列；查無或未給才退回名字比對（`nameCandidates` 產生候選陣列＋`normalize` 正規化，預設純 trim）。**id 路徑與名字路徑套用同一份 `passesFilters(r,i)`**（game_id/`aliveOnly`＝ID 未被標記`DEAD_`/faction/loc/excludeIdx 全部一致套用，避免 id 路徑抄捷徑跳過在場/存活/陣營檢查）。查無回 -1。solo 由 `findPlayerServantIdx_` 委派（`normalize:nameLoose_`）；鑑賞由 `actionPlay_` 的 promiseMeet/cohabitInvite/handHold 三處委派（`nameCandidates:kanshouNameCandidates_`）。
- `getLocalPeopleList(sheets, pcName, pcId, curL, allPcData)` — solo 專用在場清單；依 game_id 實例化＋登場日閘門過濾，收同地點/高好感/同行者，處理結盟顯示（盟友*）、情報共享揭露職階、失去從者標記、敵對主從硬連結。
- `getNearbyLocations(currentLoc, mapData, myWar)` — 由當前地點根名的座標算曼哈頓距離，回最近 5 個非本地地點（name/type/desc/dist）。**`myWar`**(2026-07 新增)：過濾掉戰爭限定地點(`COL.MAP.WAR` 有值且與 `myWar` 不同者跳過)，比照 `buildMapNodesPayload_` 既有的同款規則——修「撤退突圍/偵查」清單曾漏濾、讓地圖上根本看不到的限定地點(如僅第四次限定的海特飯店)冒出來的 bug。3 個呼叫端(`Router_Action.gs`的`buildClientState_`／`Router_Movement.gs`的`actionMove`／`actionScout`)皆已補傳。

---

#### 統計 / 死碼可疑處

- **函式數：58**（另常數/schema 區約 11 個非函式常數，含 IIFE 模型金鑰、COL、RANK_VALUE、OUTPUT_TIERS_、RUNE_MODES_、OVERCHARGE_TAG_、SEED_CACHE_SECONDS_）。
- 未用參數（保留相容/簽名對齊）：`getMapDataCached(sheets)` 完全不用 sheets（註解已載明坤圖靜態化）；`getLocalPeopleList(…, pcName, …)` 的 pcName 未用。
- COL 死欄占位（讀寫端已移除、恆空，僅保位置索引不刪）：`PC.MONEY/UPKEEP_WEEK/ROOM(33-35)`、`PC.MEMOIR(27)` 標為鑑賞復用但 solo 不用。`ACC.CREATED/KPC`、`HERO.DAILY_*` 屬鑑賞欄，solo 側於此檔未觸及。
- 外部相依（此檔未定義、依賴他檔）：`AP_PER_DAY`、`getClock_`、`getPlayerSeals_`、`svNum_`、`callGeminiAPI`、`FATE_MAP_SEED`、`SEED_MASTERS`、`masterToCodexRow_`、`getLostServant_`/`getServantMaster_`/`getMasterServant_`——註解齊全，非死碼。
- 註解遺留提示：`getMasterCodexCached`/`getMapDataCached` 皆已改為即時組表不讀對應分頁，分頁本身「僅供人工查閱」——若之後有人以為遊戲仍讀表可能誤判，屬文件而非程式問題。
# 逐函式文件 — 世界／種子／帳號層

涵蓋七檔：Time_World.gs、Seed_Codex.gs、Seed_Rivals.gs、Setup_FateWorld.gs、Account.gs、History_Sync.gs、Index.html。

---

### Time_World.gs

輕量時間流動（1 AP = 1 小時）＋御主電池魔力經濟＋世界自走。時鐘不用獨立表，日/時/AP 直接存在御主自己那一列。

常數：`AP_PER_DAY = 12`（體力池上限）。`LEYLINE_LABEL_`（靈脈點數→文字：12 靈脈匯聚／6 魔力尚可／2 魔力稀薄）。`MANA_DAY_TAG_`（makeIntTag_ 建的「回魔日」MEMORY 標籤 get/set 器）。`WORLD_FLOOR_ = 4`（世界自走永遠保留的敵從者數）。`ATTRITION_START_DAY = 3`（此日前世界不減員）。`ENEMY_REGEN_RATE_ = 0.06`（敵從者每輪自癒率）。

#### 時鐘讀寫（御主列 1:1）
- `findGameMasterIdx_(pcData, gameId)` — 在已載入的 pcData 中找某 game_id 的御主列索引（排除 DEAD_／從者／敵從者／敵御主陣營），查無回 -1。
- `clockFromRow_(pcData, idx)` — 從御主列讀出時鐘 `{day,hour,ap}`；idx<0 回預設滿血時鐘（day1/hour20/ap12）。
- `getClock_(gameId, pcData, sheets)` — 取得（或初始化）某 game_id 的時鐘；無 pcData 時自行整表讀一次（fallback）。回傳含 `gameId`、`masterIdx`。
- `rollHours_(clk, hours)` — 內部推進小時，跨 24 進位 day。
- `writeClockToRow_(clk, pcData, sheets, skipWrite)` — 把時鐘（day/hour/ap）寫回御主列＋表；masterIdx 無效則不動；skipWrite=true 時省掉單列立即寫入（呼叫端隨後有批次整表寫回）。

#### AP／休息
- `getAp_(gameId, pcData)` — 取目前 AP，無時鐘回滿。
- `spendAp_(gameId, cost, pcData, sheets, skipWrite)` — 消耗 AP（1 AP=1 小時）：足夠則扣 cost、推進 cost 小時、回 `{ok,ap,day,hour}`；不足回 `{ok:false,ap}`；無御主列不擋（相容）。
- `grantAp_(gameId, n, pcData, sheets)` — 不推進時間、直接補 n 點 AP（上限 12，second wind 燃血強撐用）。
- `restHours_(gameId, hours, pcData, sheets, skipWrite?)` — 休息 N 小時（夾 1~12）：推進 N 小時、補 2×N AP（上限 12）。回傳更新後時鐘。`skipWrite`(比照`spendAp_`同款參數)：true 時只改記憶體不落表，交由呼叫端(`actionRest`)收尾一次整表寫回，省去重複 Sheets 寫入。

#### 時段／標籤
- `timeBand_(hour)` — 依小時回時段名（清晨/午後/黃昏/夜/深夜）；用半開區間相容鑑賞半小時刻度。
- `clockLabel_(gameId, pcData)` — 時鐘文字標籤「第 N 日・HH:00・時段」。

#### 靈脈與從者魔力經濟
- `leylineAt_(sheets, loc)` — 依坤圖地點「類型」給每小時回魔基值：靈地 12／祭壇·據點 6／其餘 2。查坤圖用 getMapDataCached（已靜態化零 I/O）。
- `servantEconomy_(circuits, six, isMad, leyline, hasWorkshop)` — 從者每小時魔力收支：收入=御主供給(迴路×0.5)+靈脈+工房(+8)，支出=維持費(六圍總和/8，狂化×1.5)。回 `{supply,ley,workshop,income,drain,net}`。時回與前端 HUD 共用。
- `playerHomeLoc_(sheets, pcId, pcData)` — 取玩家居所所在地（讀 COL.PC.HOME_LOC），無則 ""。
- `playerServantEconomy_(sheets, pcId, preData)` — 供前端 HUD 顯示：玩家從者當前魔力收支與靈脈；聚合全隊從者魔力貢獻/維持費/territory/出力檔 drainMul/海怪維持費，須與 applyRegen_ 同算式。無存活從者回 null。
- `applyRegen_(data, gameId, playerName, partyNames, circuits, hours, mult, sheets, loc, homeLoc)` — 對御主＋同行從者施 hours 小時時回；核心「出力電池制」：從者無自有魔力池，御主 MP 是唯一資源被按出力檔抽取；魔力補不上→御主被動燃血（缺口/2 扣血、保底1，從者不扣血）；海怪先於御主血沉沒止耗；重算共用池上限；HP 自我修復（Avalon×1.6）。只改記憶體 data，回傳是否有變動。
- `masterCircuits_(masterRow)` — 從御主列 MEMORY 取【迴路】N，無則 30。

#### 敵御主每日回魔＋世界自走
- `getManaDay_(memory)` / `stampManaDay_(memory, day)` — MANA_DAY_TAG_ 的讀/寫（最後回魔的絕對日）。
- `refillMastersDaily_(sheets, gameId, day, preData)` — 敵御主每日回滿魔力（NPC 不算逐時經濟，改「新的一天回滿」）：見到記錄日<當前日則補滿 MP＋蓋日期戳；未登場者跳過；多名同天回魔時 MP/MEMORY 各整欄一次批寫。
- `worldTick_(sheets, gameId, playerLoc, rounds, allowAttrition, preData, deferWrite?)` — 世界自走一輪（移動/休息時觸發）。全函式整表只讀一次、局部批次寫回。內容：① 敵御主每日回魔；② 登場預告風聲（登場前1~2天，【已預告】旗標防重播）；③ 敵御主帶從者 35% 隨機移位（玩家格上凍結、已偵查者移位後保持可見、MEMORY【御主】配對隨行）；④ 敵從者每輪小幅自癒；⑤ 休息時暗處從者互鬥（第 ATTRITION_START_DAY 日後、保底 WORLD_FLOOR_ 名、7% 觸發、走 resolveFateBattle_ 真結算、風聞措辭多樣化；**2026-07 稽核修**：god_hand/survive 復活判定原本讀「自己」的破階 fx 當 severed 條件，跟 `fateStrike_`/ambush 既定的「severed＝看攻擊方破階 fx」慣例方向顛倒——已改 `severedByA`/`severedByB` 對應正確攻擊方，修正前復活判定被錯誤放行/攔阻的問題）；⑥ 令咒耗盡·靈基透支延遲結算（可觸發勝利＋願望夢 buildVictoryDreamPrompt_）。回 `{rumors,moved,victory,dreamPrompt}`。`deferWrite`：true 時本函式與其連帶呼叫的 `refillMastersDaily_` 皆只改記憶體(靠共用全域旗標 `BATTLE_DEFER_WRITE_`)，交由呼叫端(`actionMove`/`actionRest`)收尾一次整表寫完，避免同一次移動/休息內多次個別 Sheets 寫入。

**函式數：21**

---

### Seed_Codex.gs

英靈殿（從者範本）＋御主殿名冊種子，含灌表/升級管線。

常數：
- `SEED_SERVANTS` — 種子從者名冊，**現況 25 筆**：正職戰鬥從者 14 騎（第五次 8：阿爾托莉雅/EMIYA/庫丘林/美杜莎/美狄亞/佐佐木小次郎/赫拉克勒斯/咒腕之哈桑；第四次 6：吉爾伽美什/迪盧木多/伊斯坎達爾/吉爾德萊/百貌哈桑/蘭斯洛特）＋客串戰鬥 6 騎（恩奇都、斯卡哈-Lancer、斯卡哈-Assassin、美遊、小黑、伊莉雅）＋鑑賞專用「御主」職階 5 位（遠坂凜/伊莉雅絲菲爾/間桐櫻黑化/衛宮士郎/藤村大河，cls='御主' 只供鑑賞召喚、solo 白名單擋下、six/技能/寶具留空）。每筆含 six/classSkills/skills/traits/np/persona（含 dailyLook/dailyOutfit/dailyWords/dailyBack/dailyMoe 鑑賞日常欄）。
- `SEED_MASTERS` — 種子御主名冊，**現況 15 筆**（第五次 8：士郎/凜/慎二/臟硯/葛木/綺禮/伊莉雅絲菲爾/櫻黑化；第四次 7：切嗣/時臣/肯尼斯/韋伯/龍之介/綺禮/雁夜）。每筆含 circuits/melee/magic_rank/home/wish/persona/back/moe。
- `CODEX_PERSONA_VER = 'v70'` — 種子人設版本，精緻化 persona 就升版觸發升級管線。逐版校對細節（v65~v69）不再堆積於此處註解、存檔於 `SOLO_REFERENCE.md` §21。
- `DEFAULT_TRAIT_FALLBACK_`／`DEFAULT_PREF_FALLBACK_`（2026-07 稽核抽出）— 種子列敘事欄缺值時的共用 fallback 文案常數，取代 `Seed_Codex.gs`/`Seed_Rivals.gs` 兩檔三處各自硬寫同一句字面。
- `SEED_RECLASSED_` — 換職階遷移表（舊 key→新 key，如吉爾·德·萊斯青鬍子綽號列→正名列）。**2026-07 已清除懸空的 `貞德｜Ruler→貞德｜Archer` 死映射**（新舊 key 皆查無此人，regulation 遺留），現僅剩 1 條活映射，見下方死碼註記已同步更新。

#### 物件→列轉換
- `servantToHeroRow_(s)` — 從者物件→英靈殿列（順序＝COL.HERO，含 4 個日常快取欄），source='seed'。
- `masterToCodexRow_(m)` — 御主物件→御主殿列（順序＝COL.MASTER，末兩欄身世/萌點為本版新增）。

#### 升級/重刷管線
- `upgradeCodexPersonas_(ss)` — 升級既有英靈殿：整列依種子重寫（ID 對應、只刷 seed 英靈不動 ai_gen）＋補入新種子英靈＋淘汰孤兒（ID 不在 SEED_SERVANTS 且 source=='seed' 才刪，由下往上）。清 FATE_HERO_CODEX 快取。回更新筆數。
- `upgradeMasterCodex_(ss)` — 升級既有御主殿：依種子整列重寫（含 circuits/home/wish 等影響玩法欄）＋補新＋淘汰 seed 孤兒。
- `resyncSummonedServants_(ss)` — 重刷「已召喚實體化」從者的戰鬥數據（寶具/六圍/標籤 fx）為最新種子值；依(真名,職階)對應、經 SEED_RECLASSED_ 遷移；不動 HP/MP/MEMORY/敘事欄；k_ 鑑賞列另補 dailyBack。另掃「鑑賞眾生」分頁補刷 BACK/TRAIT/MEMORY【口吻】（修 §125 死分支——原掃「眾生」永遠掃不到住「鑑賞眾生」的鑑賞同伴）。
- `actionDevResyncCodex(userData, pcId, sheets)` — 前端 DEV 按鈕：無視版本旗標強制跑 upgradeCodexPersonas_＋resyncSummonedServants_，回報筆數。
- `seedFateCodex_(ss)` — 英靈殿/御主殿為空（只有表頭）時自動灌名冊；版本升級時（codex_persona_ver≠CODEX_PERSONA_VER）跑三支升級函式並蓋版本旗標。ensureFateSheets_ 末尾呼叫。

**函式數：7**

---

### Seed_Rivals.gs

開局把敵方御主×從者鋪進玩家的 game_id 世界（敵御主 FACTION='敵御主'、敵從者='敵從者'）。

常數：
- `FATE_5TH_ROSTER` — 第五次正典陣容，**9 組**（含慎二+吉爾伽美什第3天延遲登場、佐佐木小次郎 master:null 孤身從者、Rider 配黑化櫻等本作偏移）。
- `FATE_4TH_ROSTER` — 第四次正典陣容，**7 組**（Fate/Zero）。

#### 工具
- `safeJson_(s, dflt)` — try/catch JSON.parse，失敗回 dflt。
- `heroMagicRank_(heroRow)` — 讀英靈殿列六圍【魔力】階（給共用魔力池公式用），無則 C。
- `shuffle_(a)` — Fisher-Yates 洗牌（GAS 端 Math.random）。

#### 戰爭迷霧
- `markRivalsSeen_(sheets, pcId, preData)` — 玩家所在格若有未偵查、已登場的敵御主/敵從者，標記 SEEN=1（地圖點亮）；preData 就地標記＋SEEN 整欄一次寫回。

#### 列建構
- `heroToNpcRow_(hero, gameId, loc, faction)` — 英靈殿列→眾生 NPC 列：HP=150+耐久×6、MP=0（電池制無自有池）；TRAIT/PREF/INTENT 由 persona 切分；MEMORY 塞第一人稱/對御主/口吻/小動作/god_hand 命數；敵從者 CONTRIB=3（令咒餘量）。
- `masterToNpcRow_(mr, gameId, loc, faction, heroMagicRank)` — 御主殿列→眾生 NPC 列（凡人弱）：HP 看迴路(masterMaxHpMp_)、MP 走共用池(masterPoolMax_=迴路×10+從者魔力×2)；MEMORY 塞【願望】【魔術】【迴路】【體術】【魔術階位】。

#### 開局鋪敵
- `seedRivalsForGame_(gameId, playerServantName, war, playedMaster)` — 開局鋪敵主函式；war∈'4th'|'5th'|'chaos'。同實例已鋪過則跳過。chaos：洗牌隨機配對（排除 Ruler/客串/玩家從者、依真名去重、前 3 組保證第1天登場其餘 50% 延後第2~5天）＋位置式硬連結御主↔從者。正史：正典組為敵、移除玩家扮演組與奪取組、逐對即時連結、master:null 只鋪從者列、支援 arriveDay/arriveHint。

**函式數：7**

---

### Setup_FateWorld.gs

冪等建試算表分頁＋冬木世界初始化。

常數：
- `FATE_SHEET_DEFS` — 6 張分頁的表頭定義（坤圖/眾生/英靈殿/御主殿/帳號/歷史暫存；「鑑賞」GAL 定義已整個從物件字面量刪除，不是留著沒用而已）。眾生 33 欄，關係/時鐘/權柄/因果/史紀/戰史六表已併入列尾。
- `FATE_MAP_SEED` — 冬木地圖種子（**20 個地點**：新都/深山町/靈地/據點/祭壇＋3 個第四次限定據點[海特飯店/麥肯基宅/碼頭倉庫]＋3 個約會景點）。
- `RESEED_VER = 'r2'` — 一次性遷移版本旗標（坤圖升級＋赫拉克勒斯補丁）。

- `removeAllTriggers()` — 一鍵清除專案所有觸發器（舊經濟/飛書機制殘留；FATE 靠按鍵 worldTick_ 不需觸發器）。編輯器手動執行。
- `ensureFateSheets_(ss)` — 冪等建表主函式：缺分頁則補（含表頭）、已存在只補尾端缺少表頭欄；首建坤圖灌 FATE_MAP_SEED；末尾呼叫 seedFateCodex_＋reseedIfEmpty_。回本次新建分頁名陣列。只由 check_sheets action 手動觸發（不快取、doGet/handleGameAction 不自動呼叫）。
- `reseedIfEmpty_(ss)` — 修復：種子表為空補；坤圖舊 PARENT「冬木」改頂層；依種子 upsert 坤圖地點（類型/座標/描述/WAR）＋補缺；**2026-07 補孤兒列清除**（比照 `Seed_Codex.gs` 既有的 `upgradeCodexPersonas_`/`upgradeMasterCodex_` 慣例）：upsert 後刪掉名字不在當前 `FATE_MAP_SEED` 內的殘留列，避免地圖種子改名/移除後舊列繼續留在表上；赫拉克勒斯「十二試煉」補 fx:god_hand。RESEED_VER 旗標守門避免每按鍵重跑。
- `actionCheckSheets(userData, pcId, sheets)` — 登入畫面「檢查/建立試算表」按鈕的前端 action 包裝（呼叫 ensureFateSheets_，登入前 pcId 恆空、不受鑑賞封鎖名單影響）。

**函式數：4**

---

### Account.gs

FATE 帳號層（存檔身分）：帳號名無密碼登入→掛一個御主＋game_id；繼續/新局清舊檔/清殘局。

- `findAccountRow_(accSheet, name)` — 在帳號表找某帳號名的列，回 `{idx,row}` 或 null。
- `verifyPcOwnership_(acctName, pcId)`（2026-07 系統性漏洞修補新增）— solo(`PC_`)／鑑賞(`KPC_`)共用的 pcId 歸屬驗證：反查帳號表確認 `pcId` 是否等於該帳號的 `COL.ACC.PC`（`PC_`）或 `COL.ACC.KPC`（`KPC_`）。由 `handleGameAction` 在 dispatch 前對所有非 `OWNERSHIP_CHECK_EXEMPT_` 的 action 統一呼叫，取代原本近 20 個 handler 各自裸 `findIndex` 信任前端 pcId 的系統性漏洞。
- `findPcRowByCharId_(pcData, charId)`（2026-07 稽核抽出）— 找 ID 或 `"DEAD_"+ID` 匹配的列索引，取代 `actionAccountLogin`/`actionAccountNewGame` 兩處完全重複的同款 lambda。
- `findPlayerServant_(pcData, gameId)` — 找玩家某 game_id 仍存活的從者列（排除 DEAD_），回 `{idx,row}` 或 null。
- `purgeGameData_(sheets, gameId, accountName, preData)` — 清某 game_id 整局眾生列（關係已併入列，刪列即刪）＋清這些 pcId 的歷史暫存列＋解除帳號連結。
- `actionEndRun(userData, pcId, sheets)`（2026-07再稽核補歸屬驗證：比對帳號表`COL.ACC.PC`實際連結的charId是否等於傳入pcId，不符拒絕——原本純裸find可預測pcId、任何人可猜測替別人結束並清空整局存檔）— 奪杯/結束本局：只清理不封存（重逢改走鑑賞召喚），回從者真名。
- `actionAccountLogin(userData, pcId, sheets)` — 登入：找不到就建立空帳號；有存檔則回可繼續狀態；含敗北殘局防呆（御主 HP=0 或已召喚從者已不在世→purge 並回 ended，needsSummon 判斷尚未召喚）。
- `actionAccountNewGame(userData, pcId, sheets)`（2026-07再稽核：gid存在時改共用`purgeGameData_`——原本自行重寫一份刪除迴圈沒同步清「歷史暫存」表，開新局是最常見棄局路徑、一直漏清會累積孤兒歷史列；gid為空的孤兒charId情況維持單獨刪列+補一次`purgeHistoryForPcIds_`）— 開新局前清舊存檔（刪 game_id 整世界＋御主本人，charId 與 DEAD_charId 都查）＋解除連結。
- `actionPurgeOrphans(userData, pcId, sheets)` — 清殘列：清無帳號連結的 game_id 世界＋DEAD_列（保守保留 game_id 空白列）；一次性整表 rewrite＋單次 deleteRows tail；結構性防線直接指名讀「眾生」表（防 KPC_ 誤清鑑賞表）。回 removed/kept。
- `linkAccountToPc_(accountName, pcCharId)` — 創角後把新御主 charId 連結到帳號（有列則寫、無則 appendRow）。

**函式數：9**

---

### History_Sync.gs

歷史暫存分頁的逐句對話存取（每 pcId 保留最近若干句）。

- `trimRowsByOwner(sheet, pcId, keepCount, idColIndex0Based)` — 只保留某 pcId 最新 keepCount 列，超量刪最舊（由後往前刪）。
- `saveGameHistoryBatch(pcId, entries)`（2026-07 補短暫鎖）— 批次 append 對話列 `[時間,pcId,speaker,content]`，寫後 trimRowsByOwner 保 40 句。此函式的呼叫端（`narrate_only`/`play`）在 dispatcher 層是刻意的 `LOCK_EXEMPT_ACTIONS_`（AI 敘事耗時、鎖全域會拖累其他玩家），但本函式本身是無鎖的 read-modify-write，理論上同一 pcId 兩次幾乎同時的呼叫窗口重疊會互相覆蓋。已補：只圍著這一支快函式取 4 秒短暫 `LockService.getScriptLock()`，搶不到鎖則退回原本無鎖行為（不劣於修復前，多數情況下優於修復前）。
- `escapeHtml_(str)` — HTML 跳脫（&<>"'）；儲存型 XSS 輸出端防護。
- `readRecentPlayerRows_(pcId, limit)`（2026-07 稽核抽出）— 共用「讀最後1000列→篩該pcId→取最後limit筆原始row」，`getGameHistory`/`getGameHistoryBatchRaw` 都改呼叫它取資料後各自做HTML渲染或物件映射，取代兩處重複的讀表+過濾邏輯。
- `getGameHistory(pcId, pcName)` — 讀最後 10 句渲染成 HTML（先跳脫再轉<br>，相容舊字面 <br>）；player/ai 兩種樣式。
- `purgeHistoryForPcIds_(pcIds)` — 結束局時清掉這批 pcId 的所有歷史列（防表無上限成長擠出讀取窗口）。
- `getGameHistoryBatchRaw(pcId, limit)` — 取最後 limit 句回 raw `{speaker,content}` 陣列（給 AI 上下文用）。

**函式數：7**

---

### Index.html

前端殼·純版面。`<head>` 內嵌 Style，`<body>` 底部以 GAS scriptlet 引入 Script.html／Script_Onboarding.html／Script_Kanshou.html。

版面涵蓋：登入/選單（雙軌入口：純淨 solo／慾海鑑賞＋3 顆 DEV 鈕）、戰爭型態/場次/角色/正典御主選擇、創角（禮裝/命運測定）、召喚從者（七職階/瀏覽/原創/隨機/真名/描述）、自訂英靈工房（三分頁表單＋作品）、遊戲主畫面（頂欄三鍵/故事·標籤·地圖分頁/抽屜/輸入列）、各 modal（系統設定/離開確認/角色狀態卡/逆天改命/老虎道場/勝利奪杯）。

**JS 函式：無 JS 函式·純版面殼**（所有 onclick 處理器如 accountLogin/newGameFlow/summonByForge/openManaPanel/claimGrail 等皆定義於外部 Script*.html include，本檔不含 `<script>` 內嵌函式定義）。

---

## 死碼／可疑處

- ~~Seed_Codex.gs `SEED_RECLASSED_` 貞德映射懸空~~ **2026-07 已清除**：原 `'貞德｜Ruler'→'貞德｜Archer'` 新舊 key 皆查無此人，純死映射，已從表中移除。現僅剩 `'吉爾·德·萊斯（青鬍子）｜Caster'→'吉爾·德·萊斯｜Caster'` 一條，這條「新 key」解得到種子（有效，處理舊「青鬍子」綽號列），非死碼。
- **Setup_FateWorld.gs FATE_SHEET_DEFS「鑑賞」定義已移除但註解自承**：舊試算表若已建實體分頁不會自動刪（留著無害，需手動刪）。屬已知殘留、非 bug。
- **Time_World.gs `playerHomeLoc_` 疑似被繞過**：playerServantEconomy_ 內註解明說「pIdx 剛掃過整表…直接讀 HOME_LOC 省掉再呼叫 playerHomeLoc_」，故 playerHomeLoc_ 在本檔內未被 playerServantEconomy_ 使用；是否有其他檔呼叫需跨檔確認（本七檔範圍內無其他呼叫點）。
- **worldTick_ 暗處互鬥的 HP 寫回為逐列 setValue**（infoA/infoB 各一次、死亡列整列 setValues），與同函式其他階段「整欄批次寫回」慣例不一致；因觸發率低（7%）影響小，非錯誤但可統一。
- Index.html 註解提及 `nsfw-mode-toggle` 已成死旗標、重生為 `drive-mode-toggle`；「偽聖杯戰爭 Fake」選項已移除——皆為前端已清理殘跡，記錄以備對照。
### Script.html

前端 SPA 核心（單一 `<script>`，約 2689 行）：共用通訊/state、狀態面板、戰爭行動列、戰報渲染、地圖、逆天改命、勝敗/道場、模式切換。與 `Script_Kanshou.html` 共享同一頁面全域作用域（Index.html 先載本檔），故可互相呼叫（`kanshou*`／`accountLogin`／`showProcessing`／`hideProcessing` 等定義在別檔，本檔只呼叫）。

#### 通訊 / state 同步層
- `escapeHtml(str)` — XSS 轉義（跨玩家可見文字渲染進 innerHTML 前的第二層保險）；null/undefined→空字串。
- `aiHtml_(text)` — AI 敘事→安全 HTML（`narrate`／鑑賞 `send`／老虎道場三處共用）：先整段 `escapeHtml`，再**只把 `<br>` 放回來**，最後轉真換行。提示詞明寫「換行一律用 `<br><br>` 分段」，整段 escape 會讓標籤變成畫面上看得見的字（2026-07-24 補 self-XSS 的副作用，兩軌同時中招，2026-07-28 修）。放行清單只有 `<br>`——`<br onload=…>` 這類帶屬性的不放行。
- `showToast_(msg)` — 輕量成功提示：浮在畫面上方、1.8秒自動淡出、不擋操作。只給「單純告知已完成」的訊息用（如改命成功），需要玩家看清原因的失敗訊息仍用 `alert()`。
- `customConfirm_(message)` — **2026-07 新增**：自畫確認對話框，取代瀏覽器原生 `confirm()`（原生版在 Apps Script 沙盒 iframe 裡會把 `script.googleusercontent.com` 這串陌生網址秀在最上面，讀起來像可疑警告）。回傳 `Promise<boolean>`（原生 confirm 是同步阻塞，這裡改非同步），共用 `.modal-overlay`/`.modal-scroll` 底座、z-index `100000`(蓋過全代碼庫其餘彈窗，含 askKanshouSetup 的 99999)。呼叫端一律 `if (!await customConfirm_(msg)) return;`（呼叫端函式需為 `async`）——**全代碼庫原生 confirm() 已於同批次全數替換**。
- `customPrompt_(message, defaultValue, maxLen)` — **2026-07 新增**：自畫輸入對話框，取代瀏覽器原生 `prompt()`(同一批「沙盒網址嚇人」問題)。回傳 `Promise<string|null>`(null＝取消，跟原生 prompt() 語意一致)，共用 `customConfirm_` 的 modal 底座＋`.std-in` 輸入框，`maxLen` 選填(設 `input.maxLength`)。呼叫端 `const txt = await customPrompt_(msg, cur); if (txt === null) return;`——**全代碼庫原生 prompt() 已全數替換**(換裝/武裝/改名/御主改名等)。
- `gasRun(payload)` — 把 `google.script.run.handleGameAction` 封成 Promise；**2026-07 新增**：呼叫端未帶 `acctName` 時自動補上 `pc.account||currentAccount`（配合後端新增的 `verifyPcOwnership_` 中央驗證，單一入口統一補，免逐一補幾十個呼叫端）；每趟呼叫先清空 `__pendingState`，回應若含 `_state` 就暫存供 `syncData` 直接消費（3→1 round-trip 核心）。
- `beginAction(msg)` — 全域動作鎖：`__actionBusy` 已忙則回 false 擋連點；上進度遮罩＋progress 游標。
- `endAction()` — 解鎖 `__actionBusy`、撤遮罩、還原游標。
- `syncData(isSilent)` — 同步狀態入口：優先吃夾帶的 `__pendingState`（免 round-trip），否則打 `action:"sync"`；成功→`applyClientState`。
- `applyClientState(data, isSilent)` — 把一份 client state 套進 UI（狀態列/NPC/時鐘/經濟/tags/地圖/戰爭列）；`sync` 與動作夾帶 `_state` 共用此路徑。
- `narrate(promptText, opts)` — 輕量敘事：打 `action:"narrate_only"`，把 AI 回文渲染成說書人氣泡、存 `kyushu_story`、更新 `lastAiContext`；`opts.longForm` 加大 max_tokens（高好感解鎖分支）。
- `runSimpleAction_(opts)` — 共用小動作執行器：收斂 8 個 handler（ruleBreakSteal/proposeAlliance/breakAlliance/allyBond/manaSupply/spiritRepair/bond/useSeal）的「beginAction→gasRun→成功副作用→syncData→narrate→善後／失敗 alert→endAction」骨架；confirm 留呼叫端。

#### 生命週期 / 導航 / 抽屜
- `window.onload` — 套故事字級、掛撤離攔截、預填帳號、掛抽屜外點關閉、掛故事區綠色地名點擊（confirm→travelTo）。
- `setupHistoryPrevention()` — pushState＋掛 popstate（`historyPushed` 旗標防重複註冊），頁面載入即掛以防主選單手滑上一頁丟創角進度。
- `handlePopState(e)` — 上一頁時彈「離開確認」遮罩並重新 pushState 卡住返回。
- `cancelExit()` / `confirmExit()` — 取消／確認離開（後者解除 popstate 監聽後 history.back）。
- `toggleFullScreen()` — 進/出全螢幕。
- `toggleActionDrawer()` — 開關「＋」動作抽屜（grid/none＋trigger active）。
- `triggerDrawerAction(actionType)` — 抽屜項路由：sync→syncData／status→openStatus／settings→openSettingsMenu，並收起抽屜。

#### 系統設定
- `openSettingsMenu()` — 開設定遮罩、同步 AI 選項開關與字級高亮。
- `setStoryFontScale(scale)` — 套用並記憶對話字級縮放（CSS var `--story-scale`＋localStorage）。
- `highlightFontScaleBtn(scale)` — 高亮當前字級按鈕。
- `toggleAiOptions(el)` — 記憶並顯/隱【命運的抉擇】`#ai-options-grid`；⚠只藏該小格、`options-container` 永遠保持可見（修舊 bug）。
- `document.addEventListener('DOMContentLoaded', …)` — 保險：容器恢復可見、依偏好顯/隱選項小格。
- `closeSystemModal(modalId)` — 通用關閉指定 modal（display:none）。

#### 狀態面板（御主/從者命盤）
- `openStatus(targetId, targetName)` — 統一狀態讀取入口：自己→吃 `kyushu_last_status`；從者→優先吃 `myServants` 預取的 statusString 秒顯，無則後端 `get_full_status` fallback。
- `closeStatus()` — 關命盤、把背景 UI 切回玩家。
- `updateClock(label, ap, apMax)` — 時鐘 HUD：時段圖示＋文字，solo 額外顯示 ⚡AP/12，鑑賞不顯 AP。**AP≤4 時**(2026-07 新增)「行動 X/Y」文字＋雷電圖示切警示橙色(`#e0704a`)並加⚠️前綴——玩家反饋常打到見底才發現，不用彈窗(太煩)也不靠AI提醒(易被誤演成劇情)，改走純UI視覺提示。**2026-07 六度改版**（玩家「手機很長，切到地圖分頁點下一階段太麻煩」）：鑑賞模式下 `#clock-hud` 改成一整排 flex——`👥邀請`(原topbar-kanshou)＋時鐘文字＋`⏰下一階段`/`🌙睡覺`(原renderMapPane，含深夜變色邏輯)三者並列，常駐、不必切分頁。solo 模式不受影響、行為不變。
- `updateEconomy(eco)` — 存最新供魔收支到 `window._lastEco`；常駐 HUD 已停用（恆隱藏），明細移到「🔮魔力」彈窗。
- `closeHistoryOverlay()` — 關 `history-overlay`（通用彈窗）。
- `openViewMenu()` — 「👁查看」誰的狀態：單角色直開、多角色列選單。
- `openManaPanel()` — 「🔮魔力」彈窗：供魔收支明細＋各從者出力調整（20~100%）＋💧補魔捷徑。
- `manaSetOutput(name, o)` — 魔力面板內調出力：樂觀更新 myServants→背景 `set_servant_output`→回來刷經濟並重繪面板。
- `updateUI(s)` — 把 `§` 分段狀態字串 s[] 灌進命盤欄位；solo 隱藏外顯/HP/MP 等空欄，鑑賞用分行標籤（processance/trait）＋地點徽章隱藏。
- `fateSegSplit_(raw, want?)` — 頓號字串拆成陣列（補滿 `want` 格、省略＝4、不壓縮連續頓號保位）；顯示與改命共用。
- `traitSegs_(raw)` — 特徵專用：剝掉舊局的自稱格後補滿 3 格。**鏡射 `Core_Settings.gs` 的 `traitParts_`**。
- `renderSegField_(id, raw, labels, lockKeys, activeLocks, isSelf, emptyLabel)` — 鑑賞：把個性/特徵四格渲染成帶標籤小行（空格待補、鎖住格掛🔒），原始值存 `dataset.raw` 供改命讀回。
- `bondWord(b)` — 羈絆數值→文字（戒備/疏離/漸信/信賴/羈絆深厚）。
- `kanshouStatusLines_(po)` — 鑑賞肉體狀態單一自由文字欄渲染（合併自舊 6 鍵）。
- `rankVal_(r)` — 階級（E~EX，含 +）→數值，對齊後端 rankVal/rankMul（C=30 基準）。
- `pillRankCls_(r)` — 階級→技能膠囊流光 class 後綴（ex/a/b/de；C 與無階級=''）。
- `showSkillDesc(name, fx, rank, extra)` — 技能/特性 pill 點開說明：查 `FX_DESC`（依實際階級算數值，`extra` 目前只供 god_hand 帶實際剩餘命數）或 `TRAIT_DESC`。
- `showActiveSkillInfo(name, fx, rank)` — 🎲 施放技術說明彈窗（純資訊：被動化·每次交鋒 30% 機率自動全效發動，免耗魔、無按鈕；單一真實來源見 `Router_Battle.gs` `SKILL_PROC_`）。
- `skillBucket_(sk)` — 依 `SELECTABLE_FX`/`CLASS_SKILL_FX_HEUR_` 把一個技能物件分類成 `special`/`class`/`skill` 三桶之一，供 pill 渲染時決定樣式分組。
- `showIdealRealm()` — 理想鄉 Avalon 無敵結界說明（被動自動、6 階究極寶具來襲＋御主魔力≥100 展開）。
- `showSynergyInfo(on, master, peak)` — 恩奇都「變容·主從契合」說明（六圍隨御主浮動、與特定御主結契全盛）。
- `showSixHelp(line)` — 六圍教學彈窗（筋/耐/敏/魔/運/寶說明＋該從者實際值）。
- `npPillsHtml(s)` — 拼寶具 pill HTML（多寶具吃 `npOptions`，單寶具解析 `np` 字串）；點 pill→showNpDesc。
- `showNpDesc(n, desc)` — 寶具 pill 點開說明彈窗。
- `openTutorial()` — solo 頂部「❓教學」總覽卡（目標/魔力池/令咒/AP/出力/戰鬥/結盟）。
- `showManaHelp()` — 魔力條旁「?」教學彈窗（共用池/補魔代價/見底燒血）。
- `refreshFateTags(prefetched)` — 重繪左側御主+從者標籤卡（HP/MP 條、令咒、羈絆、出力轉盤、技能/特性/寶具 pill、供魔收支）；有 `prefetched`（sync 夾帶或已知值）就免打 `get_tags`；內含 `buildSvCard`（solo/鑑賞兩版）、`bar`/`horrorBar`（血/魔/海怪條）、`pill`/`selPill`（膠囊）等閉包。

#### 戰爭行動列（solo 戰鬥入口）
- `toggleSealArm()` — ❖令咒蓄勢開關（免費·可取消，下一擊自動帶必中×1.5）；令咒用盡則擋。
- `toggleNpTier(t)` — 🔥寶具超載檔位蓄勢（p1/p2 互斥，再按取消）。
- `setActiveServant(name)` — 切出戰從者，更新 `myServantCls`、重繪 tags/戰爭列。
- `attackStyle_()` — 依職階回傳基礎攻擊類別樣式（Caster 魔砲/Archer 狙擊/其餘近戰）。
- `toggleWarTarget(key)` — 戰爭行動列手風琴：展開/收合某目標卡。
- `renderWarActions()` — 渲染底部戰爭行動列：盟友卡（共處/撕盟）、敵御主↔從者成對卡（普攻/寶具/超載/令咒/刺殺/結盟/破戒奪僕/示好交涉，施放技術已被動化免按鈕）＋底部偵查/整備/休息/移動或撤退突圍(交戰中互斥切換，見 `_mustBreakout_`)；鑑賞隱藏。內含 `chip`/`card`/`foeChip`/`foeGhost`/`foePanel`/`_tierBtn` 等閉包。
- `showRumors(rumors)` — 把世界自走風聞推進故事流（居中紫框氣泡）。
- `localFoeServantName()` — 同地是否有清醒敵從者（卸防行動突襲警示用），回名字或空。
- `_engagedFoeHere_()` — 同地是否有非盟友(`relVal<50`)敵從者在場，`_mustBreakout_`/地圖邏輯共用的單一真實來源判斷。
- `_mustBreakout_()` — 判斷離開當前地點是否須走「撤退突圍」（而非一般移動）：綜合 `_engagedFoeHere_()`＋是否在自家陣地(安全港)＋「趁隙」窗開啟時的例外。
- `renderEncounterBubbles()` — 依 `window._encWin`(敵營局面開的反應窗)在 `options-container` 渲染「趁隙可乘」按鈕（🥷偷襲/🎭挑撥）；由 `refreshFateTags` 呼叫。
- `factionAmbush(npcName)` — 🥷趁隙偷襲：反應窗開啟時才能按，偷襲落單敵從者（`faction_ambush`），耗 1AP。
- `incite()` — 🎭挑撥離間：同地≥2 名敵從者時才能按，煽動兩組敵人反目（`incite`）。

#### 行動 handler（solo）
- `openRestMenu()` — 休息選單（1/3/6 小時＋🩸強撐）。
- `secondWind()` — 🩸燃燒生命強撐：扣血換 +4AP（`second_wind`，不推進時間）。
- `rest(hours)` — 休息 N 小時：補 2×N AP、回血回魔、世界自走（`rest`）；處理夜襲戰報/夢/勝敗。
- `scout()` — 偵查揭露附近敵人（`scout`），耗 1AP，可能遭突襲。
- `prepMeal()` — 整備進食戰前 buff（`prep_meal`，命中+2）。
- `summonHorror(name)` — 戰前召喚深淵海怪·變身態（`summon_horror_beast`，付寶具魔力＋1AP·魔力供養制）。
- `dismissHorror()` — 解除海怪召喚（`dismiss_horror_beast`，止維持費）。
- `setWorkshop()` — 設置陣地工房提升駐留供魔（`set_workshop`）。
- `scavenge()` — 搜索物資回御主魔力（`scavenge`），可能遭突襲。
- `travelTo(targetName, distance, retreat?)` — 移動（`move`）：更新狀態/NPC/地圖/撤離追擊戰報，依 solo/鑑賞組不同抵達 AI 提示詞（含敵情/前情/偶遇找上門，兩分支皆插入後端算好的 `data.perfNote` 收尾一次）。`retreat`(2026-07 撤退按鈕定案新增)：true＝殺出重圍(必觸發追擊)，由 `retreatTo()`/需撤退時的故事卡按鈕帶入；後端回 `needRetreat` 時前端不彈 alert，改故事流插入一張撤退提示卡。處理勝敗。

#### 逆天改命
- `openFateEdit(type)` — 開改命 modal（pref/trait/back/intent）：讀 `dataset.raw` 預填、依模式（solo/鑑賞）給不同標籤/字數。（2026-07 二度改版拔掉性格鎖：鑑賞個性欄不再有🔒鎖定勾選框）
- `saveFate()` — 存改命（`update_fate`）：四格拼接或單值；成功才更新 UI。（2026-07 二度改版：不再收集/送出 `prefLocks`，鎖快取機制已刪除）

#### 地圖
- `showGamePane(name)` — 手機三分頁切換（status/chat/map）；切 map→renderMapPane、切 status→refreshFateTags。
- `getStance()` / `setStance(s)` — 接敵姿態（stealth/normal/open）讀寫 localStorage；set 後重繪藥丸。
- `paintStancePill_()` — 依當前姿態上色三段藥丸。
- `stancePillHtml_()` — 產出姿態藥丸 HTML（地圖頁·戰爭軌限定）。
- `stanceLine_()` — 無敵蹤時抵達/撤離敘事的姿態定調句（normal 不加）。
- `stanceNotice_(isSeek)` — 遭遇「誰先發現誰」定調句（折進偶遇/找上門框架）。
- `renderMapPane(preNodes)` — 渲染地圖分頁：優先吃夾帶/快取節點免 round-trip；鑑賞→「出門走走」地點清單（複用 kcMapListHtml_），solo→戰場 SVG＋盟友通報＋此地經營（設陣地/搜索）。用 `offsetParent===null` 判實際可見。**2026-07 六度改版**：原本常駐在此的「⏰下一階段」鈕已搬進 `updateClock` 的 `#clock-hud`(不必切分頁才點得到)，此處不再重複放。
- `refreshMapPane()` — 重整地圖（走 syncData(true)）。
- `buildMapSvg_(nodes)` — 產出冬木戰場 SVG（固定 LAYOUT 座標/CONN 連線/未遠川/星塵/節點·敵蹤·所在環·可點移動）＋圖例。
- `travelFromPane(name)` — 從地圖點擊移動→travelTo＋切回故事頁。
- `promptRetreat()` — 開「退往何處」遮罩，列出鄰近地點供選作撤退目的地。
- `retreatTo(name)` — 關遮罩並呼叫 `travelTo(name, 0, true)`（必觸發追擊的撤退移動）。

#### 戰報渲染
- `renderFateBattleReport(r)` — 多形態戰報卡渲染：撤離追擊/反咬、卸防突襲、陣地反擊、斬首（D20）、多回合交鋒（寶具真名橫幅、對轟、逐回合骰子/命中/傷害、御主電池血條、理想鄉、寶具預兆）。內含 `hpbar`/`critTxt`/`stripOwnName` 閉包。

#### 從者攻擊 / 出力 / 換裝
- `openNpReleasePicker(npcName, sv, useSeal, isMaster)` — 多寶具英靈「解放哪個寶具」選單。
- `pickNpAndStrike(idx, npcName, svName, useSeal)` — 選定寶具→關選單→帶 idx 進 servantStrike。
- `servantStrike(npcName, useNp, useSeal, isMaster, npPicked, npChoiceArg)` — 核心攻擊：處理令咒蓄勢消費、多寶具選單、斬首/寶具超載/令咒各自 confirm(施放技術已被動化·不再是攻擊時的手動分支)，打 `fate_battle`（帶目標 ID·output·overload）；成功先渲戰報撤遮罩再 narrate，處理勝敗。
- `setServantOutput(btn, npcName, output)` — 從者卡出力旋鈕：樂觀更新轉盤外觀＋背景 `set_servant_output`，失敗 syncData 校正。
- `changeOutfit(name, isSelf)` — 換裝（`outfit`，只換衣）：`isSelf`(玩家自己)改跳`openOutfitPicker_`快選面板(2026-07新增)，非isSelf走`customPrompt_`(2026-07取代原生`prompt()`)。實際送出走共用`submitOutfit_(name, isSelf, txt)`，吃後端消毒值原地重繪（免 get_tags）。
- `openOutfitPicker_(name, cur)` / `closeOutfitPicker_()`（2026-07新增）— 換裝快選面板：動態建DOM+closure綁事件(不拼onclick字串)，`KANSHOU_OUTFIT_PRESETS_`(4套通用預設)按鈕＋「✏️自訂輸入」退回`prompt()`。只給玩家自己用，同伴外觀仍交給AI依`appearance_extras`自動更新。
- `submitOutfit_(name, isSelf, txt)`（2026-07新增，從changeOutfit抽出）— 換裝的實際送出邏輯：打`outfit` action、成功後原地更新`myMasterOutfit`/`myServants`快取＋`refreshFateTags`。
- `changeWeapon(name)` — 自訂武裝（`weapon`，蓋過職階/原典習慣）；鏡射 changeOutfit。
- `openMageRealmPicker(svName, curFx, title)` — 魔境的智慧/皇帝特權：挑 1 門通用 A 階被動（含清除）。
- `openRunePicker(svName, curMode)` — 原初符文：選 減傷/增傷/回血。
- `pickSelectable(action, svName, payload)` — 共用：選後關 popup、背景存檔、syncData 讓標籤更新。

#### 破戒 / 結盟 / 羈絆 / 令咒（皆走 runSimpleAction_）
- `ruleBreakSteal(npcName, npcId)` — ⛓破戒奪僕：打殘敵從者斬契奪為第二從者（燃令咒·`rule_break_steal`）。`npcId` 隨 payload 傳給後端做穩定列 ID 比對。
- `proposeAlliance(npcName, npcId)` — 🤝交涉結盟（`propose_alliance`，系統判成敗）。
- `breakAlliance(npcName)` — 💔撕毀盟約（`break_alliance`）。
- `allyBond(npcName)` — 🤝與盟友共處增進羈絆（`ally_bond`，養至 90 解鎖）。
- `manaSupply()` — 💧補魔硬擠迴路回滿·永久代價（`mana_supply`）；高好感解鎖換模型。
- `spiritRepair()` — 🩹靈基修復消魔療傷·不燃令咒（`spirit_repair`）。
- `openBondMenu()` — 💕羈絆選單（每日限一次·跨日重置）。
- `bond(type)` — 與從者相處增進羈絆（`bond`），處理里程碑/突襲/勝敗。
- `openSealMenu()` — ❖令咒選單（絕對修復/強制補魔/緊急脫離）。
- `useSeal(type)` — 施放令咒（`use_seal`）；強制補魔高/低好感兩分支換模型、可致死。
- `resolveBlockCard_(res)` — 把後端擋下的動作(`needRest`/`needMana`/`needBreakAlliance`)轉成故事流內嵌卡片＋對應一鍵解決按鈕(secondWind/openRestMenu/forceSealNp_/manaSupply/breakAlliance)，取代舊版生硬的 `alert`。
- `forceSealNp_()` — 燃令咒強制解放寶具(魔力不足也能放，必中×1.5)，重新呼叫 `servantStrike`。

#### 勝敗 / 老虎道場 / 結算
- `handleDefeat(res)` — 敗北：結構化推導敗因、播虛假之夢、鎖輸入/行動列、清本機快取、出「直視結局」按鈕→老虎道場。
- `handleVictory(res)` — 勝利：播真實美夢、開奪杯遮罩。
- `claimGrail()` — 奪杯結算（`end_run`）：清本局＋本機快取，改按鈕為「慶祝一下」→勝利版道場。
- `openTigerDojo(mode)` — 開道場遮罩並依 defeat/victory 換標題文案。
- `dojoFallbackHtml_(mode)` — AI 失敗時的罐頭文案。
- `runTigerDojo_(servantName, causeCtx, mode)` — 掀道場→`tiger_dojo` 生講評/祝賀填卡，完成後按鈕：敗北→reload、勝利→dojoBackToMenu。`causeCtx` 是 `handleDefeat` 從戰報挑出的敗因物件（`{cause,foeName,useNp,backlash}`），非提示詞——文案在後端查表組（2026-07 前端兩支 `buildTigerDojo*Prompt_` 已移除）。
- `closeTigerDojo()` / `closeVictory()` — 關對應遮罩。
- `dojoBackToMenu()` — 返回帳號選單（保留帳號、重登刷新 hasGame）。

#### DEV 工具
- `devCheckSheets()` — 檢查/建立缺少的試算表分頁（`check_sheets`）。
- `devResyncCodex()` — 強制把最新種子平衡套到英靈殿＋在場從者（`dev_resync_codex`）。
- `devPurgeOrphans()` — 清孤兒戰局/亡靈殘列（`purge_orphans`）。

#### 模式切換 / 通用工具
- `logoutAccount()` — localStorage.clear＋reload。登入畫面的「登出」鈕直接呼叫這支(無進行中狀態可丟，不必確認)。
- `logoutWithConfirm_()` — **2026-07 新增**：`customConfirm_` 確認後才呼叫 `logoutAccount()`；遊戲中「離開冬木」鈕用這支(會丟棄未存的當下羈絆狀態，多一道確認)。
- `showHistoryOverlay(html)` — 通用彈窗（懶建 `history-overlay`，內容區可捲、關閉鈕恆可見）；全檔各 popup 共用。
- `applyModeUI()` — 模式總開關：solo 隱藏輸入框/傳送/NSFW 開關/拍照/相簿/節慶、顯戰爭列；鑑賞相反。**2026-07 六度改版新增**：`#top-navbar`(新增id) 鑑賞模式整條隱藏——`👥邀請`/`⏰下一階段`兩顆鈕都搬進 `#clock-hud`(見`updateClock`)後，`#topbar-kanshou`不再有可見內容，連外層一起藏免留空白窄條。
- `withButtonLock(btnEl, asyncFn)` — 通用按鈕防連點鎖（執行期 disable+變灰，finally 解鎖）。
- `lockBtn(event, asyncFn)` — onclick 語法糖，包 withButtonLock。

#### 資料表 / 常數（資料驅動，非函式）
`OUT_LABEL_JS`／`OUTPUT_FX_JS`（出力檔位標籤/戰力鏡射）、`FX_DESC`（技能白話字典·依階級算數值）、`TRAIT_DESC`（特性字典）、`ACTIVE_FX_JS`（主動技 fx 集合）、`SELECTABLE_FX`（✨可選能力註冊表·資料驅動）、`MAGE_POOL_JS`／`RUNE_MODES_JS`（可選項）、`STANCES`（接敵姿態）、`BOND_MENU`（羈絆項）。全域旗標：`pc`／`__pendingState`／`__actionBusy`／`localNPCs`／`lastMapNodes`／`kcClock`／`myServants`／`myActiveServant`／`myServantCls`／`myMasterSeals`／`sealArmed`／`npTierArmed`／`myMystic`／`myBondUsed`／`myCanRB`／`warExpanded`／`lastAiContext`／`selectedMode`／`currentAccount` 等。

---

#### 函式數
126 個具名頂層函式（`grep '^\s*(async\s+)?function'` 實測數，已含撤退突圍/趁隙偷襲挑撥等 2026-07 新增項；不含 `runSimpleAction_`、`renderFateBattleReport`、`refreshFateTags`、`renderWarActions` 內部的多個命名閉包 helper）。另有 10 個資料表常數與約 20 個全域狀態變數。

#### 死碼 / 可疑處（精簡）
- `withButtonLock` / `lockBtn`：通用防連點鎖，本檔內無呼叫點，但**已確認非死碼**——`gas/Index.html` 與 `gas/Script_Onboarding.html` 大量以 `onclick="lockBtn(event,…)"` 呼叫（跨檔確認完畢，舊版此處標「需跨檔確認」的疑問已解決）。
- `updateEconomy(eco)`：常駐 economy-hud 已停用，函式現在幾乎只做「存 `window._lastEco`＋恆隱藏 HUD」，渲染職責已移到 `openManaPanel`／`refreshFateTags` 的 ecoStrip；屬半退化但刻意保留（單一真實來源存放點）。
- `FX_DESC` 的 `ea`/`enuma`/`home_field`/`avalon_saber` 四鍵：作者註明不會出現在技能 pill（fx 只在 npOptions/戰時注入、不進 TAGS），刻意保留作系統文檔＋防未來掛進 TAGS 時缺說明——非疏漏死碼。
- `closeSystemModal`／`triggerDrawerAction` 的部分分支、`refreshMapPane`：皆薄包裝，靠 HTML onclick 觸發，本檔內少/無直接呼叫（正常，非 bug）。
- 大量 `kanshou*`／`accountLogin`／`showProcessing`／`hideProcessing`／`openCompanions`／`kcMapListHtml_` 等被呼叫但未在本檔定義——定義在 `Script_Kanshou.html`／`Index.html` 等共享作用域檔，非未定義引用。
- 註解記錄多處已移除的舊呼叫鏈（renderNpcList/interactNpc/openInteractMenu、recent-loc-bar、send()/跑條、封存到鑑賞機制）——已清乾淨，僅留說明，無殘留死函式。
# 前端逐函式文件 — 鑑賞(慾海) SPA ＋ 開局(登入/創角/召喚)

> 兩檔皆為 `<script>` 前端，與 `Script.html` 共用同一頁面全域作用域（`gasRun`/`syncData`/`escapeHtml`/`applyModeUI`/`beginAction`/`endAction`/`updateUI`/`updateClock`/`showGamePane`/`renderMapPane`/`refreshFateTags`/`narrate` 等定義在 `Script.html`，此二檔可直接呼叫、不需 import）。全域變數 `pc`/`currentAccount`/`localNPCs`/`nearbyLocations`/`kcClock`/`currentOptions`/`lastAiContext`/`window._lastTags` 亦跨檔共享。後端對應：鑑賞→`Gallery.gs`／`Router_Action.gs`；開局→`Router_Creation.gs` 等。

---

### Script_Kanshou.html
慾海 kanshou 模式前端（2026-07 從 Script.html 拆出）。只放「進鑑賞後才用到」的函數。**70 個函式。**

模組級狀態：`progressTimer`、`_kcCur`(在場同伴)、`_kcHeroesAll`/`_kcHeroesAvailable`(英靈庫)、`_kcFilterGender='女'`/`_kcFilterCls`、`_kcHeroesCacheReady`、`_kmBusy`(回憶讀條鎖)、`kcActiveRegion_`(localStorage 記住)、`kanshouEncounterOn`(巧遇開關·localStorage)、`_kbCb`/`_kpCb`(時段/地點選單回呼)、`kcAlbumData_`/`kcAlbumFilter_`。資料鏡射表：`KC_REGIONS_`/`KC_FESTIVALS_`/`KC_TIME_BANDS_`/`KC_LOCATIONS_`/`KC_LOCATION_EVENTS_`/`KC_BAND_SHORT_`/`KC_APPT_BANDS_`/`KC_ALBUM_BAND_BG_`（皆純顯示用鏡像，唯一真實來源在後端 Gallery.gs，改記得同步）。

#### 聊天引擎與 loading
- `showProgressLoader_(loadId, captions)` — 插入「跑條」loading（推進時間類動作用），文字每 1.1s 輪播直到 AI 回應；設 `progressTimer`。
- `hideProgressLoader_(loadId)` — 清 `progressTimer` 並移除跑條 DOM。
- `kcInsertPhrase(text)`（2026-07 新增）— 快速輸入貼圖列(`#kc-quick-phrases`，鑑賞限定)的 onclick 目標：把文字插入 `#u-in` 游標處並聚焦，不呼叫 `send()`，純粹幫玩家把括號註記(害羞/小聲等)打進輸入框，仍要玩家自己按傳送。
- `KC_QUICK_PHRASES_BUILTIN_`（4個固定內建貼圖：害羞/小聲/苦笑/臉紅，2026-07同月再縮減，原本8個）／`KC_QUICK_PHRASE_CAP_ = 8`（鏡像後端`KANSHOU_QUICK_PHRASE_CAP_`，此為玩家自訂上限，跟內建顆數無關）／`_kcQuickPhrases`（玩家自訂部分，`enterKanshou()`成功時載入）（2026-07「表情包文字也想自訂」新增）— `renderKcQuickPhrases_()` 把內建4個＋`_kcQuickPhrases`合併渲染進 `#kc-quick-phrases`(原本Index.html寫死8顆按鈕，改成JS動態渲染)，末尾附一顆「⚙️自訂」開管理面板。`kanshouOpenQuickPhraseManager()`（`ensureOverlay_('kqp-overlay',...)`）列出玩家自訂貼圖＋刪除鈕＋新增輸入框(≤12字)；`kanshouAddQuickPhrase()`/`kanshouDeleteQuickPhrase(text)` 打對應action、更新`_kcQuickPhrases`後重繪列與面板。
- `send(customMsg, isSilent=false, opts={})` — **鑑賞聊天引擎，唯一 `action:'play'` 呼叫點**；本檔/Script.html 所有互動最終都經此送出。2026-07 重構：23 位置參數→單一 `opts` 物件（`moveTarget`/`lookAround`/`endDay`/`advanceHours`/`jumpFestival`/`jumpBand`/`skipKnockCheck`/`dismissGuest`/`moveWithCompanion`/`promiseMeet`/`cohabitInvite`/`cohabitInviteId`/`handHoldId`/`inviteResident`/`proposeMove`/`takePhoto`/`showPhoto`/`photoIntent`/`handHold`/`loaderCaptions` 等；`cohabitAccept`/`promiseAccept` 已隨GAS主動邀同居/邀約機制於八度改版一併移除）；前兩位置參數保留（選項鈕 `send(text,true)`）。忙碌鎖用 `btn.disabled`；數字 1–4 映射 `currentOptions`。呼叫 `gasRun`，消費回應：更新 `localNPCs`/`nearbyLocations`/`kcClock`(→`renderMapPane`)/`clock`(→`updateClock`)/`statusString`(→`updateUI`)；渲染各式「必點泡泡」（`moveProposal`/`promiseWait`/`nightGuest`/`cohabitOffer`/`photoResult`/`encounterOffer`/`options`【命運的抉擇】），有泡泡自動 `scrollIntoView`；插入說書人敘事＋`proposalResult`/`promiseSettle` 系統通知條；約定變動時背景重抓 `kanshou_companions` 刷 `_kcCur`；末尾 `refreshFateTags(data.tags)`＋重繪地圖人數徽章。失敗不炸整局（`success:false` 走灰字提示）。

- `ensureOverlay_(id, opts)`（2026-07 稽核抽出，全檔共用）— 共用「取得或建立全螢幕遮罩容器」殼：`getElementById`沒有就`createElement('div')`設`id`+`style.cssText`(position:fixed/inset:0/背景遮罩/置中)+背景點擊關閉+`appendChild(document.body)`，取代多個彈窗函式(`kanshouOpenMemoir`/`kanshouPickBand_`/`kanshouTakePhoto`/`kanshouOpenRelTag`/`openKanshouFestivals`/`kanshouPickLocation_`等)各自手寫的同款8~11行骨架。`opts:{zIndex,dim,extraStyle,onBgClick}`——`onBgClick`只在需要擋「忙碌中不可關」的面板才傳。
- `_showOverlayLoading_(overlayId, ensureOpts, boxOpts)`（2026-07 稽核抽出，建於`ensureOverlay_`之上）— 合併原本`_kmShowLoading_`/`_kpShowLoading_`兩支幾乎逐行相同的「ensure overlay→塞讀條HTML→display:flex」，兩處呼叫改帶各自的id/title。

#### 同伴面板（駐留清單 / 召喚）
- `invalidateKanshouHeroCache()` — 令英靈庫快取 `_kcHeroesCacheReady=false`（工房鑄造/修改成功後由 Onboarding 呼叫，下次開面板重抓）。
- `kcRecomputeAvailable_()` — 算可召喚清單：濾掉已在場、濾掉他人原創(`src==='ai_gen'` 非本帳號)、濾掉男玩家×男英靈（鏡射後端配對規則）。
- `ensureKcOverlay_()` — 惰性建 `#kc-overlay`（master-box/party-list/filters/hero-list 四獨立容器；2026-07 稽核：內部改呼叫共用 `ensureOverlay_` 建殼）。
- `closeKcOverlay()` — 隱藏 `#kc-overlay`。
- `renderKcMasterBox_()` — 重繪御主資訊框（名/性別＋改名/切性別鈕 → `changeKanshouName`/`changeKanshouSex`）。
- `renderKcPartyList_()` — 重繪駐留清單每列（名/關係 tag/好感/所在地/約定徽章＋💞回憶鈕→`kanshouOpenMemoir`、🏷️關係鈕→`kanshouOpenRelTag`）；更新 `#kc-count`。
- `openCompanions()` — 開同伴面板總入口：`Promise.all` 併抓 `kanshou_companions`＋(需要時)`get_heroes`；套用 `KC_SUMMON_BLOCKED_IDS_`（手動同步後端）；呼各 render 子函式並顯示 overlay。
- `renderKcFilters_()` — 建性別/職階篩選下拉（只在英靈庫重抓時重建）。
- `renderKcHeroList_()` — 建可召喚英靈列（每列標 `data-gender`/`data-cls`，召喚鈕→`kanshouSummonHero`）；管 `#kc-hero-empty`。
- `kanshouSetFilter(kind, val)` — 設篩選值→`applyKcHeroFilter_`。
- `applyKcHeroFilter_()` — 純本地切既有列 `display`（不重讀伺服器/不重建 DOM）；無中則顯示空訊息。
- `kcRefreshPartyOnly_()` — 局部刷新：只重抓 `kanshou_companions`＋重繪 party/hero 兩塊（召喚後/改關係後用）。
- `kanshouSummonHero(heroId)` — 從英靈庫召喚一人入駐（`kanshou_summon_hero`）；成功→`syncData`＋`kcRefreshPartyOnly_`。

#### 共同回憶
- `kmSpinner_(msg)` — 回傳讀條 spinner HTML 片段。
- `kanshouOpenMemoir(name)` — 開/重繪「與某人的共同回憶」彈窗 `#km-overlay`；`_kcCur` 沒載到會自抓一次；每列有 📌釘選(pin/unpin)＋🗑刪除鈕→`kanshouMemoirOp`。
- `_kmShowLoading_(name)` — 把 `#km-overlay` 內容換成讀條（不存在則先建）。
- `kanshouMemoirOp(name, op, item)` — 釘選/取消/刪除回憶（`kanshou_memoir_op`）；`_kmBusy` 擋連點；完成後原地重繪並同步卡片數量徽章。

#### 時間推進 / 節慶
- `kanshouEndDay()` — 結束一天（`endDay:true` 走 `send`）；睡前先掃 `_kcCur` 今天未赴的約做爽約警示確認框。
- `kanshouJumpBand(key, label)` — 跳到指定時段（`jumpBand`，後端算差幾小時）。
- `kanshouNextStage()` — 「下一階段」單鈕：依 `KC_TIME_BANDS_` 順推；深夜→轉呼 `kanshouEndDay`。
- `kanshouJumpFestival(key, name)` — 快轉到節慶（`jumpFestival`，後端算天數）；帶確認框。
- `openKanshouFestivals()` — 惰性建/開節慶快轉彈窗 `#kc-festival-overlay`（`KC_FESTIVALS_` 生成鈕）。
- `closeKanshouFestivals()` — 隱藏節慶彈窗。

#### 地圖 / 分區 / 移動
- `kcSceneBadge_(locName, curBand)` — 依 `KC_LOCATION_EVENTS_` 產單一地點的橋段時段徽章（當前時段命中高亮）。
- `kcSwitchRegion_(id)` — 切分區分頁（存 localStorage）＋重繪 `#kc-map-list`。
- `kanshouToggleEncounter_(checked)` — 巧遇開關切換（存 localStorage，`send` 每次讀進 `encounter`）。
- `kcRoomLabel_(key)` — 「我的房間」→「<御主名>的房間」動態顯示名（鏡射後端 `kanshouRoomDisplayName_`）。
- `kcMapListHtml_()` — **產整個地圖分頁 HTML**：分區切換列＋家改名鈕＋各地點鈕（人數徽章 `window._lastTags.locationCounts`、橋段徽章、約定徽章、鎖住的私人住處走🔒、**六度改版新增：時段未到的`bands`限定地點同樣走🔒**（比對`l.bands`跟`_curBand`）、移動鈕→`kanshouMoveTo`、邀同去👋→`kanshouProposeMove`）。由 Script.html `renderMapPane()` 塞進 `#map-pane-content`。
- `kanshouRenameHome()` — 改「家」名（`kanshou_set_home_name`，寫後端 MEMORY【住所】）；成功更新 `pc.homeName`＋重繪。
- `kanshouMoveTo(name)` — 自己移動到某地（確認框→切 chat 分頁→`send({moveTarget})`）。
- `kanshouProposeMove(name)` — 邀同伴一起去（`proposeMove`，走確定性提議管線）；身邊無人(濾 `isExact`)前端先擋。
- `kanshouLookAround()` — 明確「四處張望看還有沒有人」（`lookAround:true`，不移動不換分頁）。

#### 提議泡泡回應（同意/拒絕）
- `kanshouConfirmMoveProposal(loc)` — 同意 AI 的移動提議（`moveTarget`＋`moveWithCompanion:true` 帶提議者同行）。
- `kanshouDeclineMoveProposal()` — 拒絕移動提議（送普通續寫，原地不動）。
- `kanshouSleepWithGuest()` — 深夜訪客善後「🛏 讓她留下」（`endDay:true`＋`skipKnockCheck`）：純結束一天，`intimateNightNames`（好感≥80 且此刻同地）本來就會把在場每一位都留下過夜。
- `kanshouSendGuestHome()` — 深夜訪客善後「🚪 請她回去」（`endDay:true`＋`skipKnockCheck`＋**`dismissGuest:true`**）。⚠ 一定要帶 `dismissGuest`：她好感通常≥80 又已落盤在玩家所在地，不明講送客會被 `intimateNightNames` 直接留下過夜，這顆鍵會變成毫無作用。
  - ⚠ 取代已刪除的 `kanshouAnswerKnock`/`kanshouIgnoreKnock`：舊版是「開門/不予理會」的**待決泡泡**（後端純早退零落盤），玩家改用打字時整個「結束一天」的意圖會蒸發。現在是先落盤（她直接進門）再給善後選項。

#### 相約 / 等待 / 選單
- `kanshouPromiseMeet(name, npcId)`（2026-07 補 `npcId` 第二參數）— 相約流程：先 `kanshouPickLocation_` 選地點（排除私室/未解鎖住處）→**六度改版**：選定地點若有`bands`限制，算出跟`KC_APPT_BANDS_`相容的子集(`_bandOptions`)→再 `kanshouPickBand_` 選時段(傳入`_bandOptions`，沒限制就照舊給全部3個)→`send({promiseMeet:{name, id:npcId||""}})`。卡片渲染 onclick 已同步多帶 `s.id`，後端 `actionPlay_` 用 `findPcRowIdx_` id 優先比對（查無才退回 `kanshouNameCandidates_` 名字比對）。
- `kanshouPickBand_(title, name, cb, bandOptions)` — 開時段選擇彈窗 `#kb-overlay`（`bandOptions`選填的子集，省略＝`KC_APPT_BANDS_`全部3顆鈕），回呼存 `_kbCb`。
- `kanshouPickBand2_(band)` — 時段鈕點擊：關彈窗→執行 `_kbCb(band)`。
- `kanshouWaitForPromise(targetHour)` — 「等到約定前 10 分」：算 `advanceHours=目標−現在` 走時間推進。
- `kanshouPickLocation_(title, hint, pool, cb)` — **共用地點點選面板** `#kloc-overlay`（獨立 id，不與其他面板共用 overlay）（按 `KC_REGIONS_` 分區列地點鈕），取代 prompt() 編號；回呼存 `_kpCb`。
- `kanshouPickLoc_(name)` — 地點鈕點擊：關彈窗→執行 `_kpCb(name)`。

#### 拍照 / 相簿
- `kanshouTakePhoto()` — 開拍照面板 `#kf-overlay`：在場同伴逐人「拍她」＋(≥2人)合照＋風景＋自由輸入。
- `kanshouShoot_(intent)` — 送出拍照（`takePhoto:true`＋`photoIntent`）。
- `kanshouShowPhoto(photoId)` — 拿照片給在場的人看（`showPhoto`）。
- `kanshouDeletePhoto(photoId)` — 撕掉照片（`album_delete`，確認框）；成功重開相簿。
- `kcAlbumCardSvg_(p)` — 產寶麗來卡片 SVG（時段漸層底×天氣覆疊×髮色緞帶）。
- `kcAlbumCardHtml_(p)` — 產單張相簿卡 HTML（已沖洗→圖＋caption＋給人看/刪鈕；沖洗中→佔位）。
- `kcAlbumRender_()` — 渲染相簿牆（底片/容量統計＋人物篩選 chip＋卡片格）。
- `kcAlbumSetFilter_(n)` — 設人物篩選→重繪。
- `kanshouCloseAlbum_()` — 移除相簿 overlay。
- `openKanshouAlbum()` — 開相簿（建 `#kc-album-overlay`＋`get_album`→`kcAlbumRender_`）。

#### 牽手 / 結識 / 同居 / 關係
- `kanshouHoldHand(name, npcId)`（2026-07 補 `npcId` 第二參數）— 牽起某人的手（`handHold:name, handHoldId:npcId||""`，移動帶她同行）；後端 `findPcRowIdx_` id 優先比對。
- `kanshouReleaseHand()` — 放手（`handHold:'__release__'`）。
- `kanshouAcceptInvite(name)` — 結識巧遇對象使其入駐（`inviteResident`）。
- `kanshouInviteCohabit(name, npcId)`（2026-07 補 `npcId` 第二參數）— 玩家發起邀同居（`cohabitInvite:name, cohabitInviteId:npcId||""`，需她在場，確認框）；後端 `findPcRowIdx_` id 優先比對。**`kanshouAcceptInvite`/`inviteResident` 未同步補 id**：目標是尚未召喚過的「巧遇陌生人」，結構上沒有 pcData 列可帶 id，維持純名字比對。
- `kanshouConfess(name, npcId)`（2026-07 新增，`gas/Script_Kanshou.html`）— 💗 玩家發起告白（確認框 → `send(..., {confess:name, confessId:npcId})`）。前端不預測成敗、只送意圖，成敗由後端 `kanshouConfessAccepts_` 擲。入口在 `kanshouOpenBondHub` 第三列，四態各自渲染（好感未達 `KC_CONFESS_BOND_` 鎖／冷卻中顯示還要幾天／可告白按鈕／交往中狀態列），不留「按了才被拒」的洞。
- `kanshouOpenBondHub(name, curTag, bond, curNickname, npcId, cohabit, lover, confessWait)`（2026-07 加後兩參數）— 💞 關係中樞分派面板：關係稱呼／共同回憶／**告白**／同居。`lover`／`confessWait` 是逐人狀態，由 `actionKanshouCompanions` 下傳（門檻數字則走 `KC_*` 鏡射）。
- `kanshouOpenRelTag(name, curTag, bond, curNickname)`（2026-07 新增，原`kanshouEditRelTag`用native prompt()，玩家「那個關係也不要用彈窗吧」改成專屬面板；**五度改版新增`bond`/`curNickname`參數**）— 開`#kr-overlay`彈窗：`KC_REL_TIERS_`(鏡像Gallery.gs `KANSHOU_REL_TIER_`)5階預設稱呼各一顆按鈕(呼叫`kanshouSetRelTag`，永遠可選)＋自訂區塊。**bond<`KC_CUSTOM_TAG_BOND_`(80)時自訂區塊整個換成鎖定說明文字**；bond≥80才顯示「自訂關係稱呼」輸入框(`#kr-custom`，呼叫`kanshouSetRelTagCustom`)＋「專屬稱呼」輸入框(`#kr-nickname`，呼叫`kanshouSetNicknameCustom`)，並附「這格是填空的名詞，不要打完整句子」引導文案。選預設會讓文字重新匹配某梯度標籤(之後`kanshouSyncRelTier_`繼續自動跟好感升降)；打自訂稱呼會固定下來不再自動改動(既有行為，只換UI容器)。呼叫端傳入`bond`/`nickname`：Script.html卡片鈕用`s.bond`/`s.nickname`、Script_Kanshou.html同伴清單用`c.bond`/`c.nickname`。
- `kanshouSetRelTag(name, tag)`（2026-07 新增）— 打`update_rel_tag`，成功→`syncData`＋`kcRefreshPartyOnly_`＋關閉`#kr-overlay`；`_krBusy`擋連點。
- `kanshouSetRelTagCustom(name)`（2026-07 新增）— 讀`#kr-custom`輸入框(空值擋)，呼叫`kanshouSetRelTag`。
- `kanshouSetNicknameCustom(name)`（2026-07 五度改版新增）— 讀`#kr-nickname`輸入框(空值擋)，打新action`kanshou_set_nickname`(`actionSetNickname`)；成功→`syncData`＋`kcRefreshPartyOnly_`＋關閉`#kr-overlay`；共用`_krBusy`擋連點。

#### 改御主名 / 性別
- `changeKanshouName()` — 改御主名（`kanshou_set_name`，`customPrompt_`）；更新 `pc.name`/`#ui-name`/重繪 master-box。**🐛→✅ 稽核抓到**：原本沒做前端長度檢查(`kanshouRenameHome`有、這裡漏了)，超長會白跑一趟round-trip才被後端擋，已補同款≤16字檢查。
- `changeKanshouSex()` — 切御主性別（`askKanshouSex`→`kanshou_set_sex`）；更新 `pc.sex`/`#ui-sex`/重繪。

#### 進場 / 首次創角
- `askKanshouSex()` — Promise 版性別選擇彈窗（回 '女'/'男'）。
- `askKanshouSetup(defaultName)` — Promise 版首次進場設定彈窗（名/性別/外貌/個性）；回 `{name,sex,appearance,standing,persona}`。性別鈕改純選取（修「一點就送出」bug）。**2026-07 二度改版**：拔掉「留白、遊戲中讓AI慢慢認識我」分流，只剩一顆「✨讓AI依你填的一次擴寫完整」按鈕（回傳物件不再帶 `aiExpand` 旗標，因為只有一條路徑）。
- `backfillKanshouAi(seed)` — 非阻塞背景補生成御主敘事欄（`backfill_kanshou_ai`）；成功→`syncData`；失敗靜默保留種子。
- `enterKanshou()` — **鑑賞總入口**：`enter_kanshou`；`needSetup`→`askKanshouSetup` 二次建檔；建 `pc(mode='kanshou')`；顯示 game／`applyModeUI`／`refreshFateTags`／`renderMapPane`；**2026-07 二度改版**：`firstTimeSeed` 存在就一律 `backfillKanshouAi`（不再判斷 `aiExpand`，也不再播種 `_kcPrefLocks`——性格鎖系統已刪除）；用 `getGameHistory(pcId)` 撈前塵對話承接後日談。

---

### Script_Onboarding.html
登入／創角／召喚 開局流程（2026-07 從 Script.html 拆出）。**51 個函式**。註：`showProcessing`/`hideProcessing` 是例外——雖定義在本檔，但 `Script.html` 的全域 `beginAction()`/`endAction()`(幾乎每個遊戲內動作都會經過)實際上呼叫這兩者，並非「開局跑一次、`startGame` 後不再用」，見下方死碼註記 #1 更正。

流程：帳號登入→新局/續玩→戰爭模式(正史/混亂)→戰爭(4th/5th)→扮演方式(自創/正典)→命運測定→締約創角→召喚從者→進主畫面。模組級狀態：`warMode='canon'`/`currentWar='5th'`/`playedMaster`/`_mastersPrefetch`(正典御主預取)、`masterRolls`/`masterRoll`(命運測定)、`heroesData`/`selectedSummonClass`(召喚名冊)、工房 `_forgeInit`/`_forgeEditId`/`_forgeFrom`/`_skPickSlot`/`_skPickGroup`。常數：`FATE_MAGICS_`/`FATE_ORIGINS_`(擲命池)、工房計價表 `FORGE_PTS`/`FORGE_BUDGET=340`/`FORGE_CLS_BONUS`/`FORGE_SK_PTS(_BIG/_SMALL)`/`FORGE_SK_TRACK`/`FORGE_FLAT_FX`/`FORGE_FX_GROUPS`/`FORGE_FX`/`FORGE_CLS_HINT`（皆鏡射後端·改後端記得同步）。

#### 登入 / 選單
- `accountLogin()` — 帳號登入（`account_login`）；存 `currentAccount`/`accountLoginRes`/localStorage；切到主選單，依 `hasGame` 顯示續玩鈕。
- `continueGame()` — 續玩：組 `pc`（`mode:'solo'`）；`needsSummon`→回召喚頁`loadHeroes`；否則 `startGame(true)`。
- `newGameFlow()` — 開新局：有存檔先確認清檔（`account_new_game`）→進戰爭模式選擇屏。

#### 選戰爭模式 / 戰爭 / 扮演方式
- `showOnly_(id)` — 開局分屏切換器（warmode/war/role/master/name/detail 只顯示一個）。
- `chooseWarMode(m)` — 選正史(canon)/混亂(chaos)；chaos→直接 step-name，canon→選戰爭屏。
- `chooseWar(w)` — 選 4th/5th；背景預取正典御主名單（`_mastersPrefetch`）→扮演方式屏。
- `chooseRole(r)` — 自創(original)→step-name；扮演正典→`loadCanonMasters`。
- `loadCanonMasters()` — 取正典御主名單（用預取 Promise，失敗重抓）；渲染 `#master-pick-list`（鈕→`pickCanonMaster`）。
- `pickCanonMaster(i)` — 選定正典御主：帶入名/性別/外貌/願望預設＋給 `masterRolls` 合理魔術預設；直進 step-detail（跳過 checkName）。

#### 命運測定（擲命）
- `rollFate()` — 擲一次御主天賦（迴路/魔術/起源/體術/魔術階位，最多 3 次）；push `masterRolls`。
- `selectFateRoll(i)` — 選中某次測定結果為 `masterRoll`。
- `renderFateRolls()` — 渲染 `#fate-roll-box` 測定卡片（點選高亮）。
- `checkName(event)` — 驗御主名：純中文檢查＋後端 `check_name`（重名/違規擋下）；通過→step-detail。

#### 全螢幕遮罩
- `showProcessing(msg, quick)` — 惰性建/顯示「處理中」全螢幕遮罩（`quick` 隱藏「10~30秒」提示）。
- `hideProcessing()` — 隱藏該遮罩。

#### 締約創角
- `createPC(event)` — 締結御主契約（`create`，收名/性別/外貌/身世/願望/禮裝＋擲命結果）；成功清舊 localStorage、組 `pc`、非阻塞 `backfillMasterAi`、進召喚頁 `loadHeroes`。
- `backfillMasterAi(seed)` — 非阻塞背景補生成御主敘事（`backfill_master_ai`）；已進遊戲則刷御主卡；失敗靜默。

#### 召喚從者
- `loadHeroes()` — 抓英靈殿名冊（`get_heroes`）存 `heroesData`。
- `selectSummonClass(cls)` — 選召喚職階分頁（含 `__all__`/`__custom__`）＋高亮＋`renderHeroList`。
- `renderHeroList()` — 渲染英靈列表（依職階/全部/玩家原創過濾，濾掉鑑賞限定 `cls==='御主'`）；召喚鈕→`summonByHero`，原創本人✏️→`forgeEdit`，無主🖐→`claimHero`。
- `doSummon(payload)` — **召喚共用底層**（`summon_servant`）；成功存 `pc.servant`/`window._summonScene`→`startGame(false)`。
- `summonByHero(id)` — 點名英靈召喚 → `doSummon({heroId})`。
- `summonRandom()` — 隨機召喚 → `doSummon({cls})`。
- `summonTab(m)` — 切換召喚頁分頁（「瀏覽名冊」/「自訂生成」）；`loadHeroes()` 每次開召喚頁也會呼叫它重置回名冊分頁。
- `summonByDesc()` — 描述召喚原創從者 → `doSummon({desc, origin, cls})`（`origin` 讀自 `toggleSummonAdvanced()` 展開的來源選項，非只有 desc/cls 兩欄）。
- `toggleSummonAdvanced()` — 展開/收合自訂召喚表單的「進階選項（指定職階／角色來源）」區塊，鏡射 `toggleForgeAdvanced`。

#### 自訂英靈工房
- `forgeClsBudget_()` — 依職階算預算（Berserker +30）。
- `forgeSkPts_(fx)` — 依 `FORGE_SK_TRACK` 回技能計價表（強效/輕效/一般）。
- `openForge(from)` — 開工房屏 `#step-forge`（記起點 `_forgeFrom`／首次 `initForge_`／預設靈基頁＋創造模式；名冊未載補載）。
- `forgeTab(n)` — 工房三分頁切換（🎭演出/⚔️靈基/🌟寶具）＋控存檔鈕顯示位置。
- `toggleForgeAdvanced()` — 展開/收合進階演出細節區塊。
- `forgeReset_()` — 工房表單全歸零（存檔成功/改點創造時清）。
- `forgeModeCreate()` — 玩家點「創造」鈕：編輯中先 `forgeReset_` 再 `forgeMode('create')`。
- `forgeMode(m)` — 切「創造表單」vs「作品」頁；作品頁→`renderForgeWorks_`。
- `renderForgeWorks_()` — 渲染「我的作品」（✏️修改）＋無主原創認領區（🖐）。
- `forgeEdit(id)` — 修改原創英靈：`openForge`＋預填該英靈全設定（六圍/技能/寶具反解/演出）；名真名鎖定；有進階資料自動展開。
- `claimHero(id)` — 認領無主原創英靈（`claim_hero`）；成功重載名冊＋失效鑑賞快取。
- `closeForge()` — 關工房屏，還原大標題，回起點（menu/summon）。
- `refreshClsHint_()` — 更新職階附贈技能提示（含御主職階特殊文案）＋`applyForgeClsMode_`＋重算預算。
- `applyForgeClsMode_()` — 御主職階→藏靈基/寶具頁強制留演出頁；戰鬥職階復原。
- `initForge_()` — 首次建工房表單 DOM（職階下拉/六圍一行/技能 2×2 卡/效果目錄浮層）。
- `skillBtnLabel_(i)` — 回技能槽鈕標籤文字（依已選 fx）。
- `refreshSkillBtn_(i)` — 刷技能槽鈕外觀＋二元固定價 fx 鎖階級選單。
- `openSkillPick(i)` — 開效果目錄浮層（自動展開當前 fx 所在組）。
- `closeSkillPick()` — 收效果目錄浮層。
- `toggleSkillGroup(gi)` — 手風琴展開/收合某效果組。
- `renderSkillPick_()` — 渲染效果目錄浮層（無效果晶片＋七組手風琴，每晶片標定價）。
- `pickSkillFx(fx)` — 選定效果→寫值/刷鈕/重算預算/收浮層。
- `forgeBudget_()` — **核心計價**：加總六圍＋技能階＋第4欄費＋對軍規模；顯示預算條/超支色/階級染色/即時靈基預覽(HP/傷害底/寶具耗魔)；回總點數。御主職階跳過。
- `summonByForge()` — （名稱保留）**存英靈殿 `save_hero`（不召喚）**：驗預算/EX≤2、組 `build`；御主職階轉換需二次確認（`needConfirmMasterConvert`）；成功歸零表單/重載名冊/失效鑑賞快取。

#### 進入遊戲
- `startGame(isRet)` — 開局收尾：顯示 game／`applyModeUI`／`refreshFateTags`／`renderMapPane`；續玩(`isRet`)→還原屬性面板＋`getGameHistory` 撈前塵；新局→`narrate(_summonScene)` 演召喚登場。

---

## 死碼 / 可疑處（精簡）

1. **`showProcessing`/`hideProcessing`（Onboarding）已確認非「僅開局用」**：不是與 Script.html 重複定義撞名，而是唯一定義在本檔、卻被 `Script.html` 全域 `beginAction()`/`endAction()`(幾乎每個遊戲內動作都會經過，遠在 `startGame` 之後)實際呼叫——本檔「只在開局跑一次」的框架敘述本身不準確，這兩個函式其實貫穿整個遊戲迴圈。（原本的「疑似重複定義」問題已釐清：全專案只有一份定義，沒有撞名。）
2. **大量 onclick handler 由 Script.html/Index.html 觸發，本二檔內無呼叫點**（如鑑賞的 `kanshouPromiseMeet`/`kanshouHoldHand`/`kanshouReleaseHand`/`kanshouLookAround`/`kanshouNextStage`/`openCompanions`/`openKanshouAlbum`/`kanshouTakePhoto`，開局的 `summonRandom`/`summonByDesc`/`toggleForgeAdvanced` 等）——**已跨檔確認全部確實被 `Script.html`/`Index.html` 呼叫，非死碼**，此前「無法確認」的疑問已解決。
3. **鏡射表手動同步風險**：`KC_LOCATIONS_`/`KC_LOCATION_EVENTS_`/`KC_FESTIVALS_`/`KC_APPT_BANDS_`/`KC_SUMMON_BLOCKED_IDS_`（Kanshou）與 `FORGE_*` 全套計價（Onboarding）皆為後端鏡像，程式碼註解多處自陳「改後端記得同步這裡」。屬設計上的雙寫，非 bug，但為易漂移點。
4. **`kanshouEndDay` 爽約警示依賴 `_kcCur`/`kcClock` 已載**：若玩家未曾開過同伴面板、`_kcCur` 為空，警示會靜默略過（程式已註明「盡力而為，後端結算通知條保底」）——非錯誤，但屬已知的「盡力而為」降級。
5. **`plainTextContext`/`lastAiContext`（send 內）**：組出後只賦值給全域 `lastAiContext`，本檔未再消費；推測由 Script.html 其他功能（如選項/歷史）讀取，屬跨檔耦合。
6. **註解自陳的已刪碼**：Kanshou 多處註明「舊彈窗 `ensureKcMapOverlay_`/`openKanshouMap`、`actionBackfillKanshouServantAi`、`get_tags` 額外 round-trip」已移除——確認現存檔內無殘留呼叫，清理乾淨。
