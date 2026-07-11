# FUNCTION_MANUAL.md — 全專案逐函式工具書

2026-07 玩家要求「整理全部說明、沒用到移除、建立工具書、理解每個函數的功能」時建立。派 13 個並行 agent 逐檔案讀完全部 23 個 `.gs`/`.html` 檔（14,718 行），每個函式都：①實際讀函式本體寫一句話用途 ②全 repo grep 找呼叫點(含 `onclick="..."` 字串、ActionRouter dispatch 表登記、動態 template-literal 產生的 onclick) ③零呼叫點的才標記死碼候選。所有死碼候選我本人逐一重新讀源碼獨立驗證後才動手刪除，不盲信 agent 報告。

**與 `HANDBOOK.md`／`SOLO_REFERENCE.md` 的分工**：`HANDBOOK.md` 是架構總覽(理念/資料層/戰鬥管線/三軌)，看「這專案在幹嘛」；`SOLO_REFERENCE.md` 是 solo 軌的敘事型稽核筆記(帶日期/原因的問題排查記錄)；這份 `FUNCTION_MANUAL.md` 是**逐函式的地毯式清單**(每個函式一行：做什麼、被誰呼叫)，grep 前先查這份省時間，比對照 `SOLO_REFERENCE.md` 的 ActionRouter 段落更完整(涵蓋 kanshou/共用檔案，不限 solo)。

**維護原則**：新增/搬移/刪除函式時，比照 `SOLO_REFERENCE.md` 慣例回來補這份；行號會漂，以函式名為錨。

---

## 本輪清理的死碼（已移除，不在下方清單中）

- `Mystic_Code.gs`：`rollMysticForMaster_`／`pickByTier_` — 創角改玩家自選後零呼叫，程式碼自己註解承認「保留給未來掉落用途」，屬於為假設性未來需求寫的死碼，予以移除（`MYSTIC_CODES` 各項殘留的 `tier` 欄位保留原樣，僅改註解說明現已無消費端，不影響現存資料格式）。
- `Setup_FateWorld.gs`：`setupFateWorld`（GAS 編輯器手動執行包裝）— 零呼叫，功能與 `actionCheckSheets`（前端按鈕版）完全重疊，後者已完整取代前者。
- `Seed_Codex.gs`：`seedFateCodex()`（無底線版，GAS 編輯器手動執行包裝）— 零呼叫，其功能（灌種子）已透過 `ensureFateSheets_` → `seedFateCodex_`（有底線版）在每次開網頁/每個 action 呼叫時自動執行，手動包裝完全冗餘。
- `Gallery.gs` 回應 payload 死欄位（computed-but-never-consumed，同上一輪 `allKnownNames` 同類型）：`actionKanshouSummonHero` 的 `isNew`、`actionEnterKanshou` 的 `resumed`(3處)、`actionKanshouCompanions` 的 `available`、`actionEndRun` 的 `cls`、`actionPlay` 的 `myItemNames` — 全部 grep 確認全 repo 無任何 `.html` 消費端，予以移除。

**特意保留、未移除的零呼叫函式**：`Setup_FateWorld.gs` 的 `removeAllTriggers()` — 這是給人在 Apps Script 編輯器手動執行一次的專案觸發器清理工具，其存在意義與「被程式碼呼叫」無關（GAS 觸發器設定獨立於程式碼本身），零呼叫點是這類工具的正常型態，不是死碼。

---

## Router_Action.gs（中樞分派器）

`ActionRouter`(8) 是 action 字串→handler 函式的查找表；`handleGameAction`(124) 解析 `action` 欄位後以 `ActionRouter[action]` 分派。**任何 `actionXxx` 函式只要在這張表登記，就算「被使用」**——即使全 repo 找不到其他直接呼叫（唯一呼叫路徑就是這張表的字串分派）。已逐一驗證 51 項 action 全部對應真實存在的函式，且每個 `actionXxx` 函式都有對應表項，無缺漏。

| action 字串 | handler | 所在檔 |
|---|---|---|
| check_name | actionCheckName | Router_Action.gs |
| check_sheets | actionCheckSheets | Setup_FateWorld.gs |
| account_login | actionAccountLogin | Account.gs |
| account_new_game | actionAccountNewGame | Account.gs |
| end_run | actionEndRun | Gallery.gs |
| enter_kanshou | actionEnterKanshou | Gallery.gs |
| backfill_kanshou_ai | actionBackfillKanshouAi | Gallery.gs |
| dev_resync_codex | actionDevResyncCodex | Seed_Codex.gs |
| purge_orphans | actionPurgeOrphans | Account.gs |
| kanshou_companions | actionKanshouCompanions | Gallery.gs |
| kanshou_summon_hero | actionKanshouSummonHero | Gallery.gs |
| kanshou_remove | actionKanshouRemove | Gallery.gs |
| kanshou_set_sex | actionKanshouSetSex | Gallery.gs |
| kanshou_set_name | actionKanshouSetName | Gallery.gs |
| prep_meal | actionPrepMeal | Router_Movement.gs |
| get_full_status | actionGetFullStatus | Router_Action.gs |
| update_fate | actionUpdateFate | Router_Action.gs |
| update_rel_tag | actionUpdateRelTag | Router_Action.gs |
| create | actionManualNpc | Router_Creation.gs |
| backfill_master_ai | actionBackfillMasterAi | Router_Creation.gs |
| summon_servant | actionSummonServant | Router_Creation.gs |
| get_heroes | actionGetHeroes | Router_Creation.gs |
| get_masters | actionGetMasters | Router_Creation.gs |
| get_tags | actionGetTags | Router_Action.gs |
| fate_battle | actionFateBattle | Router_Battle.gs |
| summon_horror_beast | actionSummonHorror | Router_Battle.gs |
| dismiss_horror_beast | actionDismissHorror | Router_Battle.gs |
| use_seal | actionUseSeal | Router_Bond.gs |
| mana_supply | actionManaSupply | Router_Economy.gs |
| set_servant_output | actionSetServantOutput | Router_Economy.gs |
| set_mage_realm | actionSetMageRealm | Router_Economy.gs |
| set_rune_mode | actionSetRuneMode | Router_Economy.gs |
| outfit | actionSetOutfit | Router_Economy.gs |
| weapon | actionSetWeapon | Router_Economy.gs |
| save_hero | actionSaveHero | Router_Creation.gs |
| claim_hero | actionClaimHero | Router_Creation.gs |
| bond | actionBond | Router_Bond.gs |
| rule_break_steal | actionRuleBreakSteal | Router_Bond.gs |
| propose_alliance | actionProposeAlliance | Router_Bond.gs |
| break_alliance | actionBreakAlliance | Router_Bond.gs |
| ally_bond | actionAllyBond | Router_Bond.gs |
| set_workshop | actionSetWorkshop | Router_Movement.gs |
| scavenge | actionScavenge | Router_Movement.gs |
| second_wind | actionSecondWind | Router_Movement.gs |
| scout | actionScout | Router_Movement.gs |
| get_map_nodes | actionGetMapNodes | Router_Movement.gs |
| move | actionMove | Router_Movement.gs |
| sync | actionSync | Router_Action.gs |
| rest | actionRest | Router_Movement.gs |
| play | actionPlay | Gallery.gs |
| narrate_only | actionNarrateOnly | Router_Narrative.gs |

其餘 Router_Action.gs 函式：

- `sanitizeUserData_`(67) — 全域輸入防護：清控制字元/公式注入/HTML斷字，姓名欄強制純中文
- `sanitizeAiData_`(102) — AI輸出防呆：夾好感變化值於±100內、擋非物件結構
- `STATE_PRE_DATA_`(122,全域變數) — handler→dispatcher的整表陣列交棒旗標，省一次整表重讀，核心提速機制，31處跨5檔寫入
- `LOCK_EXEMPT_ACTIONS_`(215,資料表) — 免取寫入鎖的action白名單
- `STATE_AFTER_ACTIONS`(233,資料表) — 會改動solo戰場、需夾帶_state的action白名單
- `KANSHOU_BLOCKED_ACTIONS_`(254,資料表) — 慾海(KPC_)context下明確擋下的黑名單
- `actionCheckName`(285) — 檢查建角姓名是否為空/是否撞正典角色真名
- `actionGetFullStatus`(303) — 依姓名查目標角色，回傳狀態字串/ID/性別/可否改命
- `actionUpdateFate`(321) — 逆天改命：改個性/特徵/身世/萌點四種敘事欄之一
- `actionGetTags`(357) — 左側狀態卡payload薄包裝
- `buildTagsPayload_`(362) — 組裝御主/從者狀態卡完整資料，核心共用函式
- `buildClientState_`(476) — 組裝完整前端state blob，核心共用函式
- `actionSync`(514) — 前端主動同步薄包裝
- `actionUpdateRelTag`(522) — 玩家為同行從者重新定義稱呼

軟性備註（非死碼）：Router_Action.gs:27 `"create":actionManualNpc` 旁註解提到 `actionManualNpc` 內部曾有 `!isCreate` 分支(對應已移除的手動建NPC功能)可能已成死分支——這是 Router_Creation.gs 內部函式體的死分支，未在本輪指派範圍逐行查證，若要處理需另外稽核。

---

## Core_Settings.gs（COL schema + 全站共用工具，49個函式，高度交叉引用）

- `rankVal`(90) — E~EX階級轉數值(含+/-微調)，呼叫50+
- `cleanChineseName`(108) — 姓名清洗成純中文(全系統唯一真線)
- `realWorldClockStr_`(115) — 組真實日期/星期/時段字串(鑑賞氛圍用)
- `buildTrajectoryDigest_`(133) — 組軌跡骨幹摘要供AI錨點
- `fateMaxHpMp_`(157)/`masterMaxHpMp_`(168) — 從者/御主基底HP/MP計算
- `masterPoolMax_`(178) — 共用魔力池上限(迴路×10＋從者魔力×2)
- `snapOutput_`(193) — 出力百分比吸附合法檔位(20/40/60/80/100)
- `outputTier_`(199) — 依出力檔位回傳{命中/傷害/耗魔倍率/label}
- `servantOutput_`(201)/`setServantOutput_`(206) — MEMORY【出力】get/set
- `npChoice_`(214)/`setNpChoice_`(218) — MEMORY【寶具選】get/set(多寶具英靈)
- `runeMode_`(226)/`setRuneMode_`(230) — MEMORY【符文】get/set
- `buildLiveIdIndex_`(244) — AI呼叫後寫回前的ID→列索引重定位(防競態刪列位移)
- `masterSynergySix_`(259)/`masterSynergyOn_`(266)/`masterSynergyView_`(295) — 主從synergy(恩奇都↔銀狼)判定/套用/前端視圖
- `getNpTelegraph_`(273)/`setNpTelegraph_`(274)/`clearNpTelegraph_`(275) — MEMORY【寶具預告】get/set/clear
- `getOvercharge_`(278)/`setOvercharge_`(279)/`clearOvercharge_`(280) — MEMORY【過充】get/set/clear
- `getOutfit_`(284)/`setOutfit_`(285)/`clearOutfit_`(286) — MEMORY【換裝】get/set/clear
- `getWeapon_`(290)/`setWeapon_`(291)/`clearWeapon_`(292) — MEMORY【武裝】get/set/clear
- `mageRealmPool_`(303) — 斯卡哈「魔境」可選被動池(6標籤)
- `mageRealmEntry_`(314) — 查fx是否在魔境池內、回傳詳情
- `mageRealmPick_`(320)/`setMageRealmPick_`(325) — MEMORY【魔境】get/set
- `maxStatsForRow_`(333) — 由一列的六圍推算HP/MP上限
- `parseTraitsHelper`(339) — 亂形式資料清洗成標準4格頓號字串(含AI雞婆標籤剝除)，核心helper
- `looksToTraitParts_`(379) — 種子persona.look切成[外貌]/[氣質]/[自稱]/[私密]四格
- `enrichPersonalityLikesDislikes_`(394) — 性格短句段數不足4時AI補「喜歡/討厭」
- `parseVisibleStatus`(416)/`buildVisibleStatusString`(426) — STATUS JSON解析/組顯示字串
- `mergePhysicalStatus`(438) — 合併PHYSICAL JSON狀態鍵(解析失敗容錯續寫，2026-07修過的bug)
- `buildPlayerStatusString`(449) — 組§分隔的玩家狀態字串(位置索引協議)，核心helper
- `getFreshStatusString`(477) — 整表重讀一列後組狀態字串
- `getMapDataCached`(495) — 坤圖資料(現直接讀FATE_MAP_SEED常數，非真快取)
- `getHeroCodexCached`(504) — 讀英靈殿(含CacheService 6hr快取)
- `getMasterCodexCached`(520) — 御主殿資料(現直接組SEED_MASTERS常數)
- `getLocalPeopleList`(534) — 算solo同地/同行/高好感NPC清單(含盟友情報共享)
- `getNearbyLocations`(597) — 依座標算附近5個地點(曼哈頓距離排序)

疑似重複(記錄不建議動手)：get/set/clear三件套(outfit/weapon/overcharge/npTelegraph/mageRealm等)符合CLAUDE.md「helper成套」慣例，非重複。

---

## Router_Creation.gs（創角/召喚/工房）

- `actionManualNpc`(7) — 御主創角(action="create")：正典撞名擋、寫新PC列、令咒/迴路/戰爭模式/起始禮裝MEMORY標記
- `actionBackfillMasterAi`(112) — 開局非阻塞背景補生成御主AI敘事
- `svNum_`(164) — 六圍階級→內部數值橋接
- `getWarMode_`(168)/`getWarName_`(173) — 讀戰爭模式(canon/chaos)/算鋪敵用戰爭字串
- `getPlayedMaster_`(179) — 讀MEMORY【扮演】的正典御主id
- `actionGetHeroes`(184) — 提供前端瀏覽英靈殿清單(含ai_gen原創詳細資料)
- `actionGetMasters`(210) — 取某戰爭正典御主清單
- `sanitizeSkills_`(267) — 清洗AI技能陣列為[{n,r,fx}]
- `sanitizeSix_`(287) — 清洗六圍(允許+/-後綴，給自由生成用)
- `recordOriginalHero_`(300) — 把AI/工房原創從者寫回英靈殿(含日常版懶惰轉換)
- `parseForgeBuild_`(344) — 工房build解析+全套驗證(六圍/技能/規模預算計價，僅純E~EX)
- `actionClaimHero`(431) — 認領無主原創英靈
- `actionSaveHero`(451) — 工房存檔(create新列/edit既有列，僅製造不召喚)
- `actionSummonServant`(534) — 召喚從者核心(英靈殿實體化/AI即時生成/鋪敵/登場prompt)

疑似重複(記錄不建議動手)：`sanitizeSix_` vs `parseForgeBuild_`內inline六圍驗證(385-390行) — 同一件事兩份平行實作，差異在是否允許+/-後綴(自由召喚vs工房計價)，可能是刻意設計差異，需人工確認是否值得合併成帶`allowSuffix`參數的共用函式。

---

## Router_Movement.gs（地圖/移動/休息/偵查/搜刮/整備/工房/卸防突襲）

- `buildMapNodesPayload_`(14) — 算視覺地圖節點清單(敵蹤/戰爭分流/盟友情報)，kanshou回空殼
- `actionGetMapNodes`(55) — 獨立round-trip地圖節點查詢action
- `actionMove`(68) — 移動主action：AP檢查/目的地驗證/撤離追擊/世界tick/同行隊伍/同格互毆/移動時回/偵查迷霧
- `actionRest`(397) — 休息action：FATE分支(自選時數/雙倍時回/世界tick/卸防夜襲/從者之夢/令咒透支)+非FATE舊分支
- `actionPrepMeal`(530) — 整備進食：耗1AP，蓋MEMORY戰前命中buff時效戳記
- `enemyAmbushOnServant_`(554) — 卸防突襲共用引擎：陣地反擊或裁定偷襲傷害/致死/團滅，回戰報+夢境提示
- `actionSecondWind`(635) — 「強撐」：扣HP換4AP，受HP門檻擋
- `getWorkshop_`(665)/`setWorkshopMemory_`(666) — MEMORY【陣地】get/set
- `homeTerritoryRank_`(674) — 判定主場決戰+陣地作成從者，回最高陣地階級
- `injectHomeField_`(689) — 注入主場結界buff(fx=home_field)
- `actionSetWorkshop`(698) — 設陣地：耗1AP+40魔力
- `getScavengedLoc_`(731)/`setScavengedLoc_`(732) — MEMORY【搜刮】get/set
- `actionScavenge`(737) — 搜索：耗1AP，依枯竭與否給不同回魔比例，35%揭露鄰近敵蹤
- `actionScout`(780) — 偵查：耗1AP，掃描鄰近揭露敵蹤(SEEN標記)

疑似重複(記錄不建議動手)：`getWorkshop_/setWorkshopMemory_`(陣地)與`getScavengedLoc_/setScavengedLoc_`(搜刮)結構幾乎相同(同一MEMORY get/set模式)，符合CLAUDE.md「helper成套」慣例，非誤植；未來若加第三種標記可考慮抽通用`getMemoryTag_/setMemoryTag_`。

---

## Router_Battle.gs（戰鬥核心，28個頂層函式，1295行）

- `settleShieldMana_`(14) — 結算七天盾展開扣魔的御主純魔帳單
- `fateStrike_`(22) — 單次出擊裁決：命中扣血/海怪護盾吸收/十二試煉復活/令咒脫離/死亡勝敗判定全套
- `nameLoose_`(252) — 去除名字間隔點號/空白容錯比對
- `drainForNp_`(258) — 御主電池扣費：MP優先→HP焚血→無主單獨行動者用殘存靈基
- `enemyMasterIdx_`(296) — 依硬連結/同地同陣營找敵從者對應敵御主
- `getSoloReserve_`(313)/`setSoloReserve_`(314) — 單獨行動從者殘存靈基MEMORY get/set
- `enemyCanAffordNp_`(317) — 判斷敵方付得起寶具魔力
- `actionFateBattle`(326) — Fate戰鬥主流程：目標解析/AP扣費/斬首戰術/寶具超載灌魔/寶具對轟/多回合互攻
- `actionSummonHorror`(1107) — 戰前召喚深淵海怪
- `actionDismissHorror`(1160) — 解除海怪召喚
- `getGodHandLives_`(1185)/`setGodHandLives_`(1189) — 十二試煉復活命數MEMORY get/set
- `getPlayerSeals_`(1196)/`setPlayerSeals_`(1201) — 令咒餘量MEMORY get/set
- `rowHasSolo_`(1210) — 檢查是否帶「單獨行動」fx
- `stampDoom_`(1215)/`getDoom_`(1220) — 靈基透支死線MEMORY set/get
- `horrorPresent_`(1240) — 判斷海怪是否在場
- `summonHorror_`(1245) — 召喚/刷新海怪肉身滿血
- `clearExpiredHorror_`(1249) — 清除舊制逾時海怪護盾殘影
- `stampMeal_`(1255)/`getMeal_`(1260) — 整備進食buff到期MEMORY set/get
- `mealBuffActive_`(1265) — 判斷整備加成是否仍在效期
- `getHorrorShield_`(1272)/`setHorrorShield_`(1281)/`clearHorrorShield_`(1286) — 海怪護盾狀態get/set/clear
- `horrorShieldView_`(1290) — 供前端渲染海怪血條視圖

疑似重複(記錄不建議動手)：六組MEMORY標記get/set家族(godHand/seals/soloReserve/doom/meal/horrorShield)結構高度相似，可考慮做成通用`makeMemoryTag_(tagName,default)`工廠函式，但非本次死碼清理範圍，需先確認不影響既有存檔字串相容性。

---

## Router_Bond.gs（羈絆/令咒/結盟/破戒奪僕）

- `stampLostServant_`(7)/`getLostServant_`(12) — MEMORY【喪失從者】set/get
- `getServantMaster_`(17)/`getMasterServant_`(18) — MEMORY敵從者↔敵御主硬連結讀取(方向相反，非重複)
- `markMasterLostServant_`(22) — 敵從者陣亡時標記其御主喪失從者
- `actionUseSeal`(44) — 令咒三效果(repair修復靈基/mana回充魔力/escape空間脫離)
- `getBondUsedToday_`(104)/`setBondUsedToday_`(109) — 當日已用相處類型MEMORY get/set
- `BOND_ACTS`(121,資料表) — 相處互動設定
- `actionBond`(124) — 羈絆互動主流程
- `isAllied_`(203) — 判斷是否帶【盟約至】標記，呼叫9處高頻共用
- `hasAllyInGame_`(205) — 掃該局是否有在世盟友
- `allyUntil_`(213)/`setAllyMem_`(214)/`clearAllyMem_`(219) — 【盟約至】get/set/clear
- `allianceWillingness_`(222) — 算結盟意願機率(依對方性格關鍵字＋存活敵人數)
- `actionProposeAlliance`(232) — 交涉結盟主流程
- `actionBreakAlliance`(291) — 主動撕毀盟約
- `breakStaleAlliances_`(319) — 盟約到期/終局逼近強制瓦解
- `bumpBond_`(347) — NPC列BOND欄加減delta
- `actionAllyBond`(357) — 與盟友交流增進羈絆
- `actionRuleBreakSteal`(416) — 破戒奪僕：對打殘敵從者燃令咒斬契奪為第二從者

備註：Router_Bond.gs:464-465有段「卸防突襲」說明註解但函式本體不在本檔——`enemyAmbushOnServant_`實際定義在`Router_Movement.gs:554`，文件掛錯檔案(非死碼)。

---

## Router_Economy.gs（玩家旋鈕設定，2026-07從Router_Action.gs拆出，非舊經濟系統殘留）

- `actionSetServantOutput`(6) — 設定從者靈基出力%
- `actionSetMageRealm`(27) — 斯卡哈「魔境的智慧」：設定自選A階被動fx
- `actionSetRuneMode`(52) — 「原初符文」持有者設定運用方式(減傷/增傷/回血)
- `actionSetOutfit`(85) — 從者(或御主本人)自訂換裝，不耗AP
- `actionSetWeapon`(105) — 從者自訂武裝，不耗AP，鏡射actionSetOutfit
- `actionManaSupply`(123) — 補魔：御主擠迴路回滿共用魔力池，永久代價(迴路-3/HP上限-15)

疑似重複(記錄不建議動手)：actionSetOutfit vs actionSetWeapon(鏡射設計，非誤植)；5個action(除actionManaSupply外)共享幾乎相同的「找pIdx→找svIdx→驗證→setter→寫回」樣板骨架，可能有共用前置查找函式的重構空間。

---

## Engine_Fate.gs（純數值戰鬥引擎，34個頂層函式，877行）

- `rankMul_`(7) — 階級字串→連續倍率，呼叫21
- `rollDice_`(14) — 擲n顆d(sides)骰求和，呼叫13
- `rankTier_`(21) — 階級字串→離散骰數階(1-6)
- `gobVolley_`(24)/`chainVolley_`(26) — 王之財寶/天之鎖彈幕公式(邏輯相同,顆數不同50/18)
- `conceptTier_`(47) — 查CONCEPT_TIER取fx概念位階
- `offenseTier_`(49) — 取戰鬥單位進攻概念最高位階
- `npPranaCost_`(63) — 依寶具階算解放魔力
- `npOverloadCap_`(76) — 依寶具+號算超載倍率上限
- `npBaseDice_`(87) — 依寶具階算基礎傷害骰
- `npAtkScale_`(113)/`npDefScale_`(128) — 由寶具名/fx推定攻防規模
- `enemyRetreatLoc_`(144) — 令咒脫離隨機挑地點
- `aliveEnemyServants_`(164) — 算存活敵從者數
- `hasFx_`(177) — 查戰鬥單位是否持有fx，呼叫82，全檔核心查詢函式
- `hasCausalityNp_`(185) — 判斷是否持因果律寶具
- `divineRankOf_`(196) — 取神性階級單一真實來源(divine/divine_core/trait名取最高)
- `resolveNpClash_`(214) — 寶具對轟裁決
- `fxName_`(234) — 取fx實際技能顯示名，呼叫35
- `combatProfile_`(244) — 依職階/六圍決定命中/傷害/迴避屬性
- `skillFxVal_`(286) — 通用取值輔助
- `servantActiveSkill_`(290)/`tinyActiveSkill_`(305) — 主動技/關閉時微量被動版
- `fxHitAdd_`(317)/`fxDmgApply_`(326)/`fxDefApply_`(359) — SKILL_FX_命中/傷害/DEF_FX_減傷三段管線(刻意設計非重複)
- `rowToCombatant_`(385) — 眾生列→戰鬥單位物件，呼叫29
- `servantNpOptions_`(422) — 多寶具選單表
- `firstSignatureFx_`(466) — 單寶具從者取寶具簽名fx
- `npProfile_`(474) — 解本次寶具解放設定檔
- `npEffectiveRank_`(483) — 本次解放實際寶具階級(單一真實來源)
- `bestNpChoice_`(487) — 敵AI選最強攻擊寶具
- `resolveFateBattle_`(507) — 主裁決函式：一次交手完整結算，呼叫10，全檔核心出入口

疑似重複(記錄不建議動手)：gobVolley_ vs chainVolley_ — 邏輯完全相同的彈幕公式，可重構成單一volleyDice_(n)，但兩者各自有平衡註解解釋不同顆數，動手前建議確認是否要保留獨立具名函式。

---

## Gallery.gs（慾海鑑賞後日談引擎，1523行）

### 帳號歸屬/資料存取helper
- `kanshouOwnedRowIdx_`(26) — 驗證pcId是否為該帳號KPC欄連結的權威列
- `findPlayerServant_`(36) — 找該game_id存活從者列
- `purgeGameData_`(51) — 依game_id刪整局眾生列+清歷史+清帳號連結欄
- `getKanshouPcSheet_`(97) — 取得/建立「鑑賞眾生」分頁

### 戰時→日常AI轉譯三兄弟
- `translateLookToDaily_`(140)/`translatePersonalityToDaily_`(171)/`translateMoeToDaily_`(196) — 外貌/性格/萌點各自獨立AI呼叫轉日常版(職責分工非重複)

### 英靈殿→鑑賞眾生轉列
- `getDailyHeroFields_`(223) — 純讀取快取日常化欄位，查無退回原始值
- `dailySpeechByName_`(241) — 查英靈殿快取取dailyLook第3段當口吻fallback
- `heroToKanshouRow_`(260) — 英靈殿列→鑑賞眾生同伴列(初始好感45)

### action Handler(皆ActionRouter註冊)
- `actionEndRun`(78) — 結束本局，purgeGameData_，不再封存
- `actionKanshouSummonHero`(329) — 從英靈殿召喚英靈進後日談(上限3人)
- `actionEnterKanshou`(389) — 進入/接續後日談世界
- `actionBackfillKanshouAi`(482) — 背景AI潤色御主敘事欄
- `actionKanshouCompanions`(547) — 列出同行同伴
- `actionKanshouRemove`(574) — 請走同伴(僅清IS_PARTY)
- `actionKanshouSetSex`(598) — 切換御主性別(擋男性同伴同行)
- `actionKanshouSetName`(629) — 改御主名字
- `actionPlay`(900) — 鑑賞唯一自由聊天引擎主函式

### 鑑賞AI核心組裝
- `buildDefaultSystemPrompt`(664) — 組系統提示詞(nsfwBaseRules+specificRules+finalJson)
- `dialogueFormatRule_`(內部函式) — 對話括號格式規則文字

### 鑑賞地點與巧遇系統
- `KANSHOU_LOCATIONS_`(827,常數) — 10個出門走走地點清單
- `KANSHOU_LOCATION_TAGS_`/`KANSHOU_MALE_HERO_IDS_`(常數) — 地點→巧遇對照表/保底池
- `getKanshouMetSet_`/`addKanshouMet_` — MEMORY【邂逅】已巧遇清單get/add
- `kanshouRollEncounter_` — 70%機率加權抽選巧遇英靈
- `KANSHOU_ASKING_WHO_ELSE_RE_`(常數regex) — 偵測「這裡還有誰」
- `getKanshouActiveEncounter_`/`setKanshouActiveEncounter_`/`clearKanshouActiveEncounter_` — MEMORY【邂逅中】get/set/clear

### 提示詞組裝
- `getKanshouPeopleList_`(808) — 鑑賞專用精簡版同地人物清單

### actionPlay內部local helper(區域函式,非死碼)
`relMemMemoryStr_`/`sanitizePhysicalState`/`processSkills`/`setSkillTag_`/`processTags` — 各司其職

---

## Router_Persona.gs（AI演出依據卡建構器，solo專用）

- `getPersonaSpeech_`(11)/`getPersonaTic_`(12) — MEMORY【口吻】【小動作】get，跨軌共用(鑑賞也讀)
- `stampPersonaFlavor_`(14) — 把種子人設口吻/小動作附加到MEMORY尾端，solo召喚+鑑賞初見皆用
- `codexPersona_`(21) — 依真名查英靈殿種子persona JSON(6h快取)，僅solo
- `quadLabeled_`(45) — 四段式字串逐格加標籤組字串
- `servantCard_`(58) — 建構從者演出依據卡，呼叫15，僅solo
- `masterCard_`(123) — 建構御主演出依據卡，僅solo
- `enemyMasterCard_`(151) — 建構敵御主演出依據卡，僅solo
- `findPlayerServantIdx_`(174) — 依gameId(+可選名稱)找我方在世從者列索引，呼叫12，僅solo

檔尾備註：Router_Persona.gs:183-184孤兒註解描述「設定從者靈基出力檔位」但無對應函式本體——該函式(actionSetServantOutput)實際在Router_Economy.gs:6，非死碼只是註解錯放。

疑似重複(記錄不建議動手)：servantCard_/masterCard_/enemyMasterCard_結構高度相似，判斷為刻意的三個變體非誤植重複。

---

## Router_Narrative.gs（SOLO專用敘事引擎）

- `raiseBond_`(25) — 提升御主x從者羈絆值，支援preData省整表重讀，僅solo
- `extractWish_`(40) — 從MEMORY抓【願望】(供虛假之夢，show-don't-tell)，僅solo
- `buildDreamPrompt_`(47) — 組敗北虛假之夢AI prompt，僅solo
- `buildVictoryDreamPrompt_`(63) — 組願望實現AI prompt(勝利版)，僅solo
- `cleanNarrateEcho_`(83) — 把AI完整提示詞洗成玩家看的簡短回顧
- `narrateWithState_`(101) — 共用敘事核心：帶歷史+HP/MP+軌跡骨幹呼叫輕量模型
- `actionNarrateOnly`(147) — 自由扮演/切磋輕量敘事入口

---

## Engine_Combat.gs（LLM呼叫核心，solo/鑑賞共用；nsfwBaseRules紅線內容不在此展開）

- `callGeminiAPI`(8) — 組messages呼叫OpenRouter API，含審查降階重試/模型fallback/語言鐵律，呼叫10，solo+鑑賞共用
- `attemptWithModel_`(58) — callGeminiAPI內部閉包，單一模型完整重試迴圈
- `doGet`(133) — GAS Web App入口，回傳Index頁面模板(平台自動呼叫)

---

## Time_World.gs（AP/時鐘/世界自走）

- `findGameMasterIdx_`(17) — 在pcData線性找某game_id御主列索引
- `clockFromRow_`(28) — 從御主列讀{day,hour,ap}(私有,僅getClock_用)
- `getClock_`(37) — 取得/初始化時鐘；雙路徑(傳pcData/sheets走記憶體,否則整表讀)
- `rollHours_`(53) — 推進小時+跨日進位
- `writeClockToRow_`(62) — 寫回時鐘；雙路徑+skipWrite跳過單列立即寫入
- `getAp_`(77) — 取AP(無時鐘回滿)
- `spendAp_`(85) — 消耗AP；雙路徑+skipWrite
- `grantAp_`(96) — 不推時間直接補AP(second wind用)
- `restHours_`(105) — 休息N小時：推進時間+補2×N AP(上限12)
- `timeBand_`(116) — 依小時回傳時段名
- `clockLabel_`(125) — 組時鐘文字標籤
- `leylineAt_`(137) — 依地圖節點TYPE回傳每小時回魔基值
- `servantEconomy_`(158) — 算從者每小時魔力收支
- `playerHomeLoc_`(169) — 取玩家居所地點
- `playerServantEconomy_`(181) — 供HUD顯示從者魔力收支
- `applyRegen_`(242) — 對御主+同行從者施加時回
- `masterCircuits_`(345) — 解析MEMORY【迴路】N
- `getManaDay_`(354)/`stampManaDay_`(355) — 【回魔日】get/set(私有,僅refillMastersDaily_用)
- `refillMastersDaily_`(360) — 敵御主每日回滿魔力
- `worldTick_`(395) — 世界自走：敵移位/敵從者自癒/暗處廝殺減員/令咒透支延遲勝利判定；雙路徑(preData原地改)

雙路徑函式備註：`getClock_`/`writeClockToRow_`(含skipWrite)/`spendAp_`(含skipWrite)/`getAp_`/`playerHomeLoc_`/`worldTick_`(preData)/`refillMastersDaily_`(preData) 皆為2026-07提速重構新增的「有pcData/sheets走記憶體，否則整表讀」雙路徑設計，未來擴充需保留此語意。

---

## Seed_Codex.gs（英靈殿/御主殿種子）

- `SEED_SERVANTS`(6)/`SEED_MASTERS`(283) — 資料常數，非函式(英靈殿/御主殿種子名冊，23騎現存)
- `servantToHeroRow_`(318)/`masterToCodexRow_`(326) — 種子物件→試算表列轉換
- `upgradeCodexPersonas_`(441)/`upgradeMasterCodex_`(484) — 升級既有英靈殿/御主殿(整列覆寫+補新+淘汰孤兒)
- `resyncSummonedServants_`(524) — 重刷已召喚從者戰鬥數據為最新種子值
- `actionDevResyncCodex`(559) — DEV按鈕手動觸發重刷
- `seedFateCodex_(ss)`(574) — 種子表為空時自動灌種子(帶底線版，`ensureFateSheets_`自動呼叫)

疑似重複(記錄不建議動手)：`upgradeCodexPersonas_` vs `upgradeMasterCodex_` — 結構幾乎鏡射，可考慮抽共用helper但非緊急。

---

## Setup_FateWorld.gs（建表+冬木世界初始化）

- `removeAllTriggers`(30) — 清除專案所有時間觸發器(GAS編輯器手動執行工具，非死碼，見上方說明)
- `ensureFateSheets_`(81) — 冪等建表主函式：依FATE_SHEET_DEFS建表/補欄，首建灌坤圖種子
- `reseedIfEmpty_`(118) — 坤圖種子灌入+一次性遷移
- `actionCheckSheets`(189) — 包裝ensureFateSheets_()成前端action(登入畫面按鈕)

---

## Account.gs（帳號登入/存檔/清殘局）

- `findAccountRow_`(7) — 依帳號名查找列
- `actionAccountLogin`(16) — 登入：建帳號/檢查殘局自動清理/回傳是否需召喚
- `actionAccountNewGame`(85) — 開新局清舊存檔(含DEAD_前綴防呆)
- `actionPurgeOrphans`(131) — 清孤兒戰局殘列
- `linkAccountToPc_`(180) — 寫solo御主pcId進帳號連結欄
- `linkAccountToKanshouPc_`(196) — 寫kanshou avatar kpcId進帳號連結欄(多一個appendRow分支)
- `getAccountKanshouPcId_`(213) — 查帳號連結的鑑賞avatar pcId

---

## Seed_Rivals.gs（開局鋪敵）

- `safeJson_`(7) — 安全JSON.parse+預設值
- `heroMagicRank_`(10) — 讀英靈殿某列魔力字串
- `markRivalsSeen_`(15) — 戰爭迷霧：標記當前地未偵查敵蹤為已偵查
- `heroToNpcRow_`(71) — 英靈殿列→眾生NPC列(敵從者)
- `masterToNpcRow_`(114) — 御主殿列→眾生NPC列(敵御主)
- `shuffle_`(143) — Fisher-Yates洗牌
- `seedRivalsForGame_`(150) — 開局鋪敵主函式，依war鋪6-7組敵御主x敵從者

---

## History_Sync.gs（歷史暫存表CRUD，solo/鑑賞共用）

- `trimRowsByOwner`(3) — 裁某pcId的歷史列到只留最後keepCount筆
- `saveGameHistoryBatch`(19) — append一批對話entries，裁到40筆
- `getGameHistory`(29) — 讀最後10筆組HTML供前端「重整歷史」面板
- `purgeHistoryForPcIds_`(71) — 局結束/purge時整批刪除指定pcId集合的歷史列
- `getGameHistoryBatchRaw`(84) — 與getGameHistory邏輯相同但回結構化{speaker,content}供AI chatHistory

疑似重複(記錄不建議動手)：`getGameHistory` vs `getGameHistoryBatchRaw` — 幾乎一致的讀取/篩選/裁切邏輯，只差輸出格式，可考慮抽共用helper。

---

## Mystic_Code.gs（禮裝系統）

- `mcCombatFx_`(48) — 從戰鬥單位找MC_COMBAT_表fx效果
- `masterMysticBuffSkill_`(54) — 依御主禮裝id組被動加持技能物件
- `injectMysticBuff_`(60) — 把禮裝被動效果注入從者戰鬥單位skills(含Avalon特例)
- `canRuleBreak_`(77) — 判斷是否具「破戒全咒」之力
- `getMystic_`(88)/`setMystic_`(89) — MEMORY【禮裝】get/set
- `masterMysticFx_`(96) — 查御主禮裝是否帶指定fx
- `equipMysticToMemory_`(129) — 寫入選定禮裝id進MEMORY(創角自選最終落點)

（`rollMysticForMaster_`/`pickByTier_` 已於本輪移除，見文首「本輪清理的死碼」）

---

## Script.html（前端SPA核心，2742行）

### 核心通訊/機制(lines 1-1400附近)
- `escapeHtml(str)` — 前端XSS防護
- `gasRun(payload)` — 核心通訊層：封裝google.script.run.handleGameAction成Promise，把data._state存進__pendingState(3→1 round-trip機制的產出端；每次呼叫先清空舊__pendingState)
- `beginAction`/`endAction` — 全域動作鎖
- `setupHistoryPrevention`/`handlePopState`/`cancelExit`/`confirmExit` — 離場確認流程
- `toggleActionDrawer`/`triggerDrawerAction` — 底部動作抽屜
- `openSettingsMenu`/`setStoryFontScale`/`toggleAiOptions` — 設定選單
- `openStatus`/`closeStatus` — 統一狀態讀取入口
- `updateClock`/`updateEconomy` — HUD更新
- `openViewMenu`/`openManaPanel`/`manaSetOutput` — 查看選單/魔力面板(🟡manaSetOutput與後段setServantOutput高度重疊，同一action兩個UI入口)
- `renderWarActions()` — 戰爭行動列主渲染，核心UI函式
- `openRestMenu`/`secondWind`/`rest(hours)` — 休息系統(narrate順序已修正)
- `scout`/`prepMeal`/`summonHorror`/`dismissHorror`/`setWorkshop`/`scavenge` — 地圖行動(narrate順序已修正)
- `travelTo(targetName, distance)` — 移動主邏輯
- `updateUI(s)` — 渲染御主/NPC狀態面板
- `openFateEdit`/`saveFate` — 逆天改命
- `refreshFateTags(prefetched)` — 御主+從者標籤卡總渲染，觸發renderWarActions()，核心渲染函式

### 戰鬥/地圖/後段handler(lines 1400-2742附近)
- `renderMapPane`/`buildMapSvg_` — 地圖分頁渲染
- `renderFateBattleReport` — 戰報總渲染器
- `servantStrike` — 從者出擊/寶具解放核心handler
- `setServantOutput` — 從者靈基出力檔位(🟡見上方manaSetOutput重疊)
- `changeOutfit`/`changeWeapon` — 換裝/自訂武裝
- `openMageRealmPicker`/`openRunePicker`/`pickSelectable` — 魔境/符文選擇popup(資料驅動SELECTABLE_FX表)
- `ruleBreakSteal`/`proposeAlliance`/`breakAlliance`/`allyBond`/`manaSupply`/`bond`/`useSeal` — 羈絆/結盟/令咒action handler(🟡7個共享幾乎逐字重複的confirm→beginAction→gasRun→syncData→narrate→endAction樣板，可考慮抽runSimpleAction_共用helper)
- `handleDefeat`/`handleVictory` — 敗北/勝利流程
- `claimGrail` — 奪得聖杯結算
- `devCheckSheets`/`devResyncCodex`/`devPurgeOrphans` — DEV工具按鈕
- `openTigerDojo`/`buildTigerDojoPrompt_`/`buildTigerDojoVictoryPrompt_`/`runTigerDojo_` — 老虎道場(藤村大河+伊莉雅講評)
- `applyClientState`(2402) — 套用client state blob到UI
- `syncData`(2424) — 統一同步入口(優先消費__pendingState)，呼叫27+
- `showHistoryOverlay`(2454) — 通用彈窗殼，呼叫16+
- `applyModeUI`(2474) — solo/kanshou模式總開關
- `narrate`(2509) — 輕量敘事(narrate_only)，呼叫27+
- `send`(2538) — 鑑賞自由對話引擎唯一呼叫點，呼叫21+
- `lockBtn`(2738) — onclick語法糖：async函式按鈕鎖包裝

**時序bug檢查結果**：本檔全部19處narrate(呼叫點已窮舉核對，`syncData(true)`皆先於`narrate()`執行，符合正確順序(2026-07 PR #175+#176修正)。`travelTo()`不呼叫syncData故不受影響；`handleDefeat`/`handleVictory`的dreamPrompt呼叫皆在呼叫端已執行syncData之後才被觸發，同樣不受影響。

---

## Script_Onboarding.html（登入/創角/召喚/工房，50個頂層函數，855行）

- `accountLogin`/`continueGame`/`newGameFlow` — 帳號登入/繼續/開新局
- `chooseWarMode`/`chooseWar`/`chooseRole`/`loadCanonMasters`/`pickCanonMaster` — 戰爭模式/正典御主選擇
- `rollFate`/`selectFateRoll`/`renderFateRolls` — 命運測定(六圍/迴路/屬性)
- `checkName`/`createPC`/`backfillMasterAi` — 建角/背景補生成
- `loadHeroes`/`selectSummonClass`/`renderHeroList` — 英靈殿瀏覽
- `doSummon`/`summonByHero`/`summonByName`/`summonRandom`/`summonByDesc` — 四種召喚入口(doSummon薄包裝，刻意設計非重複)
- `openForge`/`forgeTab`/`toggleForgeAdvanced`/`forgeReset_`/`forgeModeCreate`/`forgeMode` — 工房UI流程
- `renderForgeWorks_`/`forgeEdit`/`claimHero`/`closeForge` — 工房作品清單/修改/認領
- `refreshClsHint_`/`applyForgeClsMode_`/`initForge_` — 工房職階/初始化
- `skillBtnLabel_`/`refreshSkillBtn_`/`openSkillPick`/`closeSkillPick`/`toggleSkillGroup`/`renderSkillPick_`/`pickSkillFx` — 工房技能效果選擇
- `forgeClsBudget_`/`forgeSkPts_`/`forgeBudget_` — 工房預算計算
- `summonByForge` — 工房存檔(save_hero)
- `startGame` — 進入遊戲主畫面

---

## Script_Kanshou.html（鑑賞前端JS模組，25個頂層函數，409行）

- `invalidateKanshouHeroCache` — 清英靈庫快取旗標(工房鑄造/修改成功後呼叫)
- `kcRecomputeAvailable_` — 從英靈庫全清單濾出可召喚清單
- `ensureKcOverlay_`/`closeKcOverlay`/`renderKcMasterBox_`/`renderKcPartyList_`/`renderKcFilters_`/`renderKcHeroList_` — 同伴面板渲染
- `kanshouSetFilter`/`applyKcHeroFilter_` — 性別/職階篩選
- `openCompanions` — 「後日談同伴」面板入口
- `ensureKcMapOverlay_`/`closeKcMapOverlay`/`openKanshouMap`/`kanshouMoveTo` — 「出門走走」地圖彈窗
- `kcRefreshPartyOnly_` — 局部刷新(不重打get_heroes)
- `kanshouSummonHero`/`kanshouRemove`/`kanshouEditRelTag` — 召喚/請走/改關係標籤
- `changeKanshouName`/`changeKanshouSex`/`askKanshouSex` — 改名/切換性別
- `askKanshouSetup` — 首次進場設定彈窗
- `backfillKanshouAi` — 背景AI潤色御主敘事
- `enterKanshou` — 進入鑑賞主流程總入口

檔尾備註：`openGallery()`/`enterGallery()` 舊彈窗函數已刪除退役(註解)，grep全庫確認查無定義，非活函數。

---

## Index.html（純標記檔，未定義任何JS function）

只有 onclick/onchange 呼叫字串，函數定義在 Script.html/Script_Onboarding.html/Script_Kanshou.html。全站按鈕的最終落地頁面。

## Style.html（純CSS樣式表，無函式）

涵蓋頂部導覽/setup&game容器/卡片輸入按鈕/地圖面板/戰報卡/故事文字排版。

---

## 附錄：本輪發現但記錄不建議動手的重複/重構候選（跨檔彙總）

這些都是「功能正常、有真實呼叫、但存在可精簡空間」的觀察，不是死碼，列出供未來重構參考：

1. **MEMORY get/set/clear 家族的手寫正則模式**（Router_Battle.gs的godHand/seals/soloReserve/doom/meal/horrorShield、Router_Movement.gs的陣地/搜刮、Core_Settings.gs的outfit/weapon/overcharge/npTelegraph/mageRealm）——每組各自手刻幾乎相同的字串處理邏輯，可考慮抽出通用`makeMemoryTag_(tagName, defaultVal)`工廠函式，但改動涉及多個標記格式，需先確認不影響既有存檔字串相容性。
2. **Script.html的7個action handler樣板重複**（ruleBreakSteal/proposeAlliance/breakAlliance/allyBond/manaSupply/bond/useSeal）——幾乎逐字重複confirm→beginAction→gasRun→syncData→narrate→endAction流程，可考慮抽`runSimpleAction_`共用helper。
3. **manaSetOutput vs setServantOutput**（Script.html）——同一後端action`set_servant_output`兩個UI入口(魔力面板/從者卡轉盤)，可考慮合併。
4. **sanitizeSix_ vs parseForgeBuild_內inline六圍驗證**（Router_Creation.gs）——同一驗證邏輯兩份平行實作，差異在是否允許+/-後綴。
5. **upgradeCodexPersonas_ vs upgradeMasterCodex_**（Seed_Codex.gs）——英靈殿/御主殿升級邏輯結構鏡射。
6. **getGameHistory vs getGameHistoryBatchRaw**（History_Sync.gs）——讀取/篩選/裁切邏輯幾乎一致，只差輸出格式(HTML vs 結構化物件)。
7. **gobVolley_ vs chainVolley_**（Engine_Fate.gs）——彈幕公式邏輯完全相同，僅顆數不同(50 vs 18)，各自有平衡註解說明。

若之後要動手做這類重構，優先順序建議：①先確認每組「刻意設計差異」vs「純粹複製貼上」②改動前找齊所有呼叫端③改完務必`bash check.sh`＋`git diff | grep -c nsfwBaseRules`（若碰到 Router_Battle.gs/Engine_Combat.gs 附近）。
