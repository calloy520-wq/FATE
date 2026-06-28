# 命運停駐之夜 — 單人(solo)模式 代碼參考筆記

> 給 Claude 的速查手冊。標函數名＋作用＋資料流。改動前先查這份。
> 專案：calloy520-wq/FATE（gas/ 內為 Apps Script，clasp 推 branch 自動部署）。
> 開發分支：`claude/fate-error-review-w8q42w`（commit→push→GitHub Action 自動 clasp deploy）。

---

## 0. 紅線（絕對不可違反）

| 規則 | 說明 |
|---|---|
| **慾海禁區** | `Engine_Combat.gs` 的 `nsfwBaseRules`（演化核心）＋整套 NSFW 機制**一律不可改**。只能改 SFW 的 gating／名冊。`isNsfwMode` 由前端 `nsfw-mode-toggle` 開關，只在 kanshou(鑑賞)模式露出。 |
| **九州 GAS 不可動** | 原始九州/GAS repo 只能複製過來，不可改。 |
| **show-don't-tell** | 敘事中**禁止**直接寫出角色的 願望／個性／萌點 字面。只能用神態動作演出。`servantCard_` 鐵則一二三 已強制。 |
| **model id** | `claude-opus-4-8` 不可出現在 commit／PR／程式碼。 |
| **branch** | 只在 `claude/fate-error-review-w8q42w` 開發。 |

驗證套路：改完 `node --check`（.gs 複製成 .js 檢查；Script.html 用 `sed '1d;$d'` 去頭尾 `<script>` 再檢查）。改慾海邊界務必 `git diff | grep nsfwBaseRules` 確認 0 改動。

---

## 1. 三種模式 (pc.mode)

| mode | 意義 | UI |
|---|---|---|
| **solo** | FATE 單人聖杯戰爭（本專案主體） | 純按鈕；無聊天輸入框、無慾海開關。`applyModeUI()` 隱藏所有 `data-mode="full"` 武俠日常系統 |
| **full** | 九州全模擬（武俠日常經營） | 全開：聊天輸入、聽風閣、商城、給銀兩、結識新人、宗門… |
| **kanshou** | 鑑賞（奪杯後後日談約會） | 有聊天輸入框＋慾海開關；無戰鬥／血量 |

`applyModeUI()`（Script.html）是模式總開關。solo 隱藏 full 專屬功能、收掉輸入框、顯示 `war-actions` 行動列。

**雙軌設計**（Index.html `scr-menu`）：玩法只有兩條軌——🎴 純淨(單人聖杯戰爭, newGameFlow/continueGame, SFW) ／ 🌹 慾海(鑑賞後日談, openGallery, NSFW)。共用一張試算表＋核心資料(管線 奪杯→鑑賞 需要)，靠 帳號＋game_id 分流，不拆表。
另有**兩個唯讀視窗**(非玩法軌)：📜 個人聖杯戰記(showVictoryHistory，自己勝敗) ／ 🏆 排行榜(openLeaderboard/actionLeaderboard，跨帳號比拼)。`full`(九州全模擬)模式碼仍在、是 kanshou 經濟底層，但不作為前台軌。
**持久層(清檔不刪，排行榜/戰記只撈這些)**：帳號表(WON勝場/CREATED/BEST_DAYS最快奪杯日/NAME)、戰史(每場勝敗+真實時間+從者+摘要)、鑑賞表(封存從者)。**會被清檔刪**：眾生(game_id)、關係(name)。`recordWinSpeed_(acct,gameId)` 在三勝利點(斬盡敵從者/斬首/起源彈)讀當前遊戲日取 min→ACC.BEST_DAYS。

**補魔(solo)**：`actionManaSupply` 走 narrate_only(SFW)、不開慾海引擎，prompt 維持「曖昧 fade、點到為止」（玩家認可現狀，勿再收緊）。

**重開/姓名查重**：`actionAccountNewGame`(Account.gs) 清舊單人戰場＝刪同 game_id 整個世界 ＋ 御主本人(按 charId，防 game_id 空的孤兒佔名)。`actionCheckName` 只擋「game_id 非空(進行中世界)」的同名活躍御主；DEAD_ 與 game_id 空的孤兒不佔名→重開後自己舊名可重用，多帳號間活躍同名仍隔離。

**重點：solo 全程無花錢入口**——聽風閣/商城/給銀兩/休養都是 full 專屬。錢在 solo 是死的，身世的財力差異改由「起始禮裝機率」(`rollMysticForMaster_`)體現。
> ⚠ **但九州經濟系統別砍**：錢/聽風閣/商城/給銀兩在 **kanshou(鑑賞約會)／full** 是活的——玩家規劃鑑賞未來可能「打工賺錢→買禮物」。solo 用不到 ≠ 可刪除；保留給其他兩模式。

---

## 2. 實例化與資料表

- **game_id**：每局一個世界。`g_`+ts = 聖杯戰爭；`k_`+ts = 鑑賞世界。所有眾生/時鐘/關係查詢都帶 game_id 過濾，杜絕跨世界外洩。
- **FACTION 區分**（COL.PC.FACTION 字串）：`御主`(玩家)、`從者`(玩家的)、`敵御主`、`敵從者`、`盟友御主`/`盟友從者`(前端 override，見 §8)。
- ⚠ **五圍(STR/CON/AGI/INT/LUK)＋境界(REALM) 是承重牆，勿從根本移除**：`calculateMaxStats(REALM,CON,INT)` 算 HP/MP、從者六圍→svNum_→五圍→戰鬥傷害都靠它。FATE 全員 REALM="凡人"。只能「UI 隱藏＋不叫 AI 生成」，不能砍欄位。已做：UI 五圍排/境界 標 `data-mode="full"`(solo/鑑賞隱藏)；MASTER_GEN_SYS 不再輸出 realm/str/con/...(GAS 本就覆寫成 凡人+隨機 10-15)。
- **分頁**（Setup_FateWorld.gs `FATE_SHEET_DEFS`，缺頁自動補、冪等）：眾生/英靈殿/御主殿/戰鬥標籤/帳號/戰史/鑑賞/時鐘/關係/坤圖(地圖)/因果(log)…

### COL schema（索引讀取，表頭僅供人看）
```
PC(眾生): ID0 NAME1 SEX2 BACK3(身世) STATUS4 MONEY5 TRAIT6 LOC7 PREF8(喜好/個性)
  HP9 MP10 STR11 CON12 AGI13 INT14 LUK15 MAX_HP16 MAX_MP17 WEP18 ARM19 ACC1_20 ACC2_21
  REALM22 MEMORY23 INTENT24(萌點) FACTION25 RANK26(職階) CONTRIB27 ALIGN28 PHYSICAL29
  MARTIAL30(寶具) LIFESKILL31 GAME_ID32 CLS33 SIX34(六圍JSON) TAGS35(技能JSON) SEEN36(戰爭迷霧)
HERO(英靈殿): ID0 CLS1 NAME2(真名) SEX3 SIX4 CLASS_SKILLS5 SKILLS6 TRAITS7 NP8 PERSONA9(JSON) ALIGN10 WARS11 SOURCE12
MASTER(御主殿): ID0 NAME1 SEX2 APPEAR3 MAGIC4 CIRCUITS5 MELEE6 MAGIC_RANK7 HOME8 WISH9 PERSONA10 WAR11 SOURCE12 BACK13(身世) MOE14(萌點)
REL(關係): PC0 NPC1 FAV2(好感/羈絆) TAG3 IS_PARTY4 MEMORY5 MAJOR_EVENT6
GAL(鑑賞): ACC0 NAME1 CLS2 SEX3 SIX4 TAGS5 NP6 BACK7 PREF8 MOE9 MEMOIR10 WISH11 TIME12 MASTER13 MSEX14
CLK(時鐘): GAME_ID0 DAY1 HOUR2 AP3   (1AP=1hr，每日12AP，休息每hr補2AP)
ACC(帳號): NAME0 PC1 WON2 CREATED3 BEST_DAYS4(最快奪杯日)
GAL CLS="御主" = 盟友御主搭檔（凡人之軀，鑑賞重建走 master 分支）
```

---

## 3. 後端路由 `ActionRouter`（Router_Action.gs 頂部）

主進入點 `handleGameAction` → `sanitizeUserData_`(輸入清洗) → 查 `ActionRouter[action]`。AI 輸出經 `sanitizeAiData_` 夾值防幻覺。

### solo 會用到的 action
| action | handler | 作用 |
|---|---|---|
| check_name / account_login / account_new_game | Account 系 | 登入／建帳號／開新局 |
| update_fate | actionUpdateFate | 創角生成御主（身世/願望/魔術→屬性/禮裝/MEMORY） |
| summon_servant | actionSummonServant | 召喚從者（從英靈殿抓真名/六圍/技能→眾生列）。**種子英靈直接用寫死 persona(萌點/口吻)、不叫 AI**(省一次 API、加速)；只有名冊查無的自訂/未知英靈才走 AI 即時生成(else 分支)。 |
| get_heroes / get_masters | — | 創角選單列出可選英靈/正典御主 |
| get_tags | actionGetTags | **左側狀態面板資料**：御主HP/MP/令咒/願望、從者陣列(六圍/技能/羈絆/寶具)、供魔收支、禮裝、破戒能力 |
| fate_battle | actionFateBattle | **核心戰鬥**：D20＋寶具＋令咒＋斬首＋雙從者＋協同強襲（見 §4） |
| use_seal | actionUseSeal | 令咒固定選單：修復/補魔/緊急脫離 |
| mana_supply | actionManaSupply | 補魔：御主→從者回魔+羈絆+SFW fade（耗1AP，卸防可能被突襲） |
| blood_supply | actionBloodSupply | 🩸燃血補魔(血→魔)：御主扣 HP(~18%maxHP，留 15% 安全線)→從者大量回魔(~70%maxMP)+羈絆+5。御主 HP 休息回復(applyRegen ~5%/hr)。耗1AP、卸防可能被突襲。SFW 悲壯非情慾。 |
| bond | actionBond | 羈絆互動(閒聊/共餐/特訓/夜談)，每種每日一次升羈絆 |
| use_mystic | actionUseMystic | 發動主動禮裝（吃迴路/耗魔/扣充能，對敵造魔力傷害） |
| rule_break_steal | actionRuleBreakSteal | 破戒奪僕：打殘敵從者(HP<35%)+燃令咒→奪為第二從者(上限2) |
| propose_alliance / break_alliance / ally_bond | 同盟系 | 結盟/撕毀/與盟友共處(見 §8) |
| set_workshop / scavenge | 陣地系 | 設陣地(提升供魔)／搜索物資 |
| second_wind | actionSecondWind | 0-AP 死局：扣~20%血換+4AP，每日一次(【強撐】D) |
| scout | actionScout | 偵查：揭露同地敵蹤(設 SEEN) |
| get_map_nodes / get_all_categorized_maps | 地圖 | 地圖節點＋敵蹤(吃 SEEN 迷霧；有盟友→`hasAllyInGame_`全揭露) |
| move / rest / sync | — | 移動(2AP)／休息(補AP+夢境)／資料同步 |
| narrate_only / multi_attack_narrate | actionNarrateOnly等 | **AI 純說書**(solo 不用 actionPlay；GAS 算數值、AI 只演出) |
| claim_grail / list_gallery / enter_gallery / gallery_talk | Gallery.gs | 奪杯封存/鑑賞名冊/進鑑賞/後日談對話(見 §9) |
| get_victory_history / get_ranking | — | 戰史/排行 |

### full-only 遺留（solo 不露出，勿在 solo 邏輯依賴）
give_money, buy_intel, craft_item, gift_item, steal_npc_item, attack_npc, multi_attack, execute_npc, spare_npc, home_*, estate_*, warehouse_*, quests, claim_quest_reward, promote_rank, create_faction, breakthrough, empower_npc, cultivate, join/dismiss_party, get_faction_info, get_rumors, equip_gear, shop 系。`play`(actionPlay=天道自由演化) 用於 full/kanshou，**solo 戰爭不走 play**。

---

## 4. 戰鬥引擎 Engine_Fate.gs ＋ actionFateBattle

### rank/數值
- `rankMul_(r)`：E10 D20 C30 B40 A50 EX60（+5每+,−3每−）/30 → 倍率。
- `rankBand_(r)`：rankVal+randInt(-10,5)，用於 AGI 命中/迴避擲值。
- `combatProfile_(c)`：依職階決定命中/傷害/迴避用哪個屬性。Caster→魔力(魔砲)、Archer→敏捷命中/筋力傷害(狙擊)、其餘→近戰。
- `rowToCombatant_(row)`：眾生列→戰鬥物件(含 np=MARTIAL寶具、six、fx)。

### 命中/技能
- `hasFx_(c,'xxx')`：該角色技能是否帶此 fx。`fxName_(c,'xxx')`：回傳實際技能名(防張冠李戴)。`hasTrait_`：特性(神性/王…)。
- `resolveFateBattle_(atk,def,opts)`：單次交手裁決。處理的 fx 標籤：
  `aim analyze anti_magic_lance burst chain clear_mind divine_age divine_core evade_ranged first_strike gae_bolg gob mad morale nullify_magic petrify projection ride self_mod stealth str_up tactics territory tsubame ubw unreadable wind_strike zabaniya`
  含：職階相剋三角(KNIGHT_BEATS +命中+傷害)、對魔力減魔砲、territory 防壁、divine_age 繞 MR、zabaniya 致命(×1.9+70)、gae_bolg 因果必中、petrify 石化、projection 被動加成(EMIYA) 等。
- `aliveEnemyServants_(sheets,gameId)`：在世敵從者數（勝利判定用）。
- `enemyRetreatLoc_`：令咒緊急脫離時敵退避地點。

### actionFateBattle 流程（Router_Action.gs）
1. 找出戰從者 `atkIdx`(userData.servant 指定或第一個)、目標 `nIdx`。同地檢查、AP 檢查、盟友不可打(`isAllied_`)。
2. **斬首**：目標=敵御主且有從者護衛→每名在世從者擲 D20，任一=20 斬殺御主(+護衛隨亡)→勝利判定；全失手→護衛反噬每人 1.5×。
3. **一般戰**：ROUNDS=3 回合。`partyIdxs`=所有在世從者(雙從者齊攻)。寶具/令咒只加在 atkIdx 開場第一擊。
4. **協同強襲**(§8)：`allyAtkIdx`=同地盟友從者，每回合對共同敵人助攻一擊(不被反擊)。
5. 敵反擊：`enemyNpSpent` 一場限一次寶具，殘血越急越愛開。
6. `fateStrike_`：包一次我方攻擊(回 aRoll/hit/damage/destroyed/knocked/victory/sealEscaped/godRevived)。
7. 回傳 `report`(前端 renderFateBattleReport 畫)＋`aiPrompt`(servantCard_+戰報，篇幅220~280)＋victory/defeat/dreamPrompt。

### 令咒
`getPlayerSeals_/setPlayerSeals_`(讀寫 MEMORY【令咒】N)。預設 3 道。

---

## 5. 種子庫（英靈殿/御主殿）

- **Seed_Codex.gs**：
  - `SEED_SERVANTS`(36騎)：每筆 id/cls/realName/wars/gender/six/classSkills/skills/traits/np/align/**persona**。persona 物件={firstP,words,toMaster,**speech,moe,tic**}（全 36 騎已補齊，貼原作）。
  - `SEED_MASTERS`(13名)：id/name/sex/appearance/magic/circuits/melee/magic_rank/home/wish/**persona**(4段頓號)/**back(身世)**/**moe(萌點)**。
  - `servantToHeroRow_` / `masterToCodexRow_`：物件→分頁列。
  - `seedFateCodex_(ss)`：英靈殿/御主殿為空才灌入(冪等)。版本 `CODEX_PERSONA_VER='v3'`，升版觸發 `upgradeCodexPersonas_`(覆寫英靈 persona)＋`upgradeMasterCodex_`(覆寫御主 persona/身世/萌點＋補欄)，皆不動客製。
- **Seed_Rivals.gs**：開局鋪敵。
  - `seedRivalsForGame_`：依 war(4th/5th/fake/chaos)鋪敵御主+敵從者；移除玩家扮演的那組。
  - `masterToNpcRow_`：御主殿列→敵御主眾生列。BACK←身世(+外貌)、INTENT←萌點、TRAIT/PREF←persona 解析、凡人弱數值、MEMORY=【願望】|【魔術】。
  - `heroToNpcRow_`：英靈殿列→敵從者眾生列。
  - `canonHeroNames_`：正史6騎真名(禁玩家搶角)。
- **Seed_Canon.gs**：正典劇情橋段。
  - `checkCanonPins_`：回 {beats,leads,route}，劇情釘(開場/巴傑特/Lancer誘敵/教會/神殿/Excalibur/影/黑化/櫻/吉爾late…)。
  - `lockRoute_`(ROUTE_PIVOT_DAY=4 依 wish/bond/kills 鎖路線)、`spawnGilgamesh_`(後期遊蕩金閃)、`blackenFoe_`(黑化)、`shadowDevourFoe_`(影吞)。
  - `getRoute_/setRoute_/getFiredPins_/addFiredPin_`：MEMORY【路線】【史】讀寫。

---

## 6. 禮裝 Mystic_Code.gs

- `MYSTIC_CODES{}`：avalon(被動回血×1.6)、jeweled_sword(寶石劍 req45)、volumen(肯尼斯水銀 req50)、origin_bullet(起源彈,target:master)、jewels、black_keys、rule_breaker(破戒,fx:rule_break)…各有 type(active/passive)/req(迴路)/charges/target/desc。
- `getMystic_/setMystic_`(MEMORY【禮裝】id)、`getMysticCharges_/setMysticCharges_`(【禮充】n)。
- `rollMysticForMaster_(standing,circuits)`：**身世/財力→起始禮裝機率**。富/名門/鐘塔/教會(或迴路≥45)→30%頂級；清貧/孤兒(或<20)→50%空手。`pickByTier_`、`equipMysticToMemory_`。
- `canRuleBreak_(pcData,pIdx,gameId)`：是否具破戒力(召 Caster美狄亞 或 持破戒禮裝)。
- `masterMysticFx_`、`applyMysticDamageToServant_`：發動效果/結算傷害。

---

## 7. 時間/AP/供魔 Time_World.gs

- `getClock_/writeClock_`：時鐘表(game_id→day/hour/ap)。
- `getAp_/spendAp_(gid,n)/grantAp_(gid,n)`(不推時間)、`restHours_`(休息補AP)、`rollHours_`、`timeBand_`(晨/午/夜)、`clockLabel_`(顯示字串)。
- AP：每日12，移動2AP、戰鬥/偵查/補魔/禮裝/結盟/共處=1AP、休息每hr補2。
- `playerServantEconomy_`：供魔收支(左側 HUD)。`servantEconomy_`、`leylineAt_`(靈脈)、`applyRegen_`(avalon×1.6/陣地加成)、`masterCircuits_`(MEMORY【迴路】N 預設30)。
- `worldTick_`：跨時推進世界。

---

## 8. 同盟系統（§本 session 新增）

判定全在 GAS，AI 只演出。
- `isAllied_(row)`：MEMORY 是否帶【盟約至】N。`allyUntil_/setAllyMem_/clearAllyMem_`。
- `allianceWillingness_(masterRow,aliveFoes)`：結盟意願(base.42；務實+.25/孤高-.32；剩≤3騎-.45)。
- `actionProposeAlliance`：對同地敵御主提議，`Math.random()<willingness` 判定。成→盟主+其同地從者標【盟約至】day+3。
- `actionBreakAlliance`／`breakStaleAlliances_`：撕毀／自然瓦解(效期到 或 在世敵從者≤3 強制翻臉)。
- `actionAllyBond`：與同地盟友共處，耗1AP，`bumpBond_`升羈絆(無列則建)，達90標【鑑賞緣】(戰後入鑑賞)。SFW only，卸防可能被未結盟敵突襲。`getBond_/bumpBond_`。
- **協同強襲**(actionFateBattle 內)：盟友從者每回合助攻一擊。
- **情報共享**：`hasAllyInGame_` 有盟友→地圖無視 SEEN 迷霧全揭露(get_map_nodes/categorized 都吃)＋敵從者職階揭露(getLocalPeopleList `intelCls`)。
- **前端 override**：`getLocalPeopleList`(Core_Settings.gs) 把結盟的敵御主/敵從者 faction 改顯 `盟友御主/盟友從者`(`allied:true`)，前端不列為可攻擊。

---

## 9. 鑑賞 Gallery.gs（奪杯後/慾海入口）

- `actionClaimGrail`：奪杯→AI 寫後日談回憶(memoir)→寫入「鑑賞」表→**同盟封存**(羈絆90↑或【鑑賞緣】的盟友一併入冊，御主搭檔 CLS="御主")→`purgeGameData_` 清本局。
- `actionListGallery`：列帳號已封存。
- `actionEnterGallery`：在 `k_` 世界重建御主+搭檔(從者480HP／御主搭檔凡人100HP 走 `partnerIsMaster` 分支)，無敵無戰鬥。
- `actionGalleryTalk`：後日談對話(純 AI，CLS="御主"時敘述為盟友御主)。**慾海**在此模式由前端 toggle 開(只改名冊 gating，引擎不動)。
- `findPlayerServant_`、`purgeGameData_`。

---

## 10. servantCard_ / persona 注入（show-don't-tell 核心）

- `codexPersona_(name)`：從英靈殿 PERSONA 撈細緻人設(firstP/words/toMaster/speech/moe/tic)。
- `masterCard_(row)`：御主「演出依據」卡(名/性別/性格/特徵/願望)，讓 AI 知道玩家是誰來 portray 互動；禁替御主做決定。互動場景(ally_bond/bond/mana/blood)＝`masterCard_ + servantCard_`。
- ⚠ **prompt 別再寫「嚴禁輸出 stat_changes/items_gained/money_transferred」**：solo 全走 `narrate_only`/`multi_attack_narrate`，後端只讀 `data.narration`、其餘欄位一律丟棄——禁令是多餘的、還把欄位名秀給 AI。已從 FATE solo prompt 全數移除(九州 actionPlay/item 路徑保留，那裡真的會吃 stat_changes)。
- `servantCard_` 含**狂化偵測**：persona.speech/firstP 含 狂化/無法言語/咆哮 → 加「禁說完整句、只咆哮」鐵律(赫拉克勒斯/蘭斯洛特命中；會說話的開膛手傑克不中)。
- `servantCard_(row)`：壓成「〈角色背景·僅供內化〉」段塞進 narration prompt。**鐵則一**=當背景揣摩；**鐵則二**=設定字眼禁直述/說嘴；**鐵則三**=依羈絆調親疏(低好感戒備→高羈絆親近，守住性格內核)。
- `enemyAmbushOnServant_`：卸防(補魔/羈絆/共處/休息)時同地未結盟敵從者趁隙重擊。
- `raiseBond_`(升既有)／`bumpBond_`(無則建)／`getBond_`。`extractWish_`(取【願望】)、`buildDreamPrompt_`(敗北虛假之夢)。

---

## 11. MEMORY 標記（御主/從者 記憶欄 COL.PC.MEMORY，｜分隔）

```
【願望】wish 【令咒】N 【迴路】N(預設30) 【魔術】 【出身】 【體術】
【模式】canon/chaos 【戰爭】4th/5th/fake 【扮演】正典御主id
【路線】route 【史】firedPins 【試煉】N(god_hand命數)
【羈絆日】D:type1,type2(跨日重置) 【強撐】D(second_wind日限)
【陣地】loc 【禮裝】id 【禮充】n 【盟約至】day 【鑑賞緣】 【破戒奪取】 【黑化Alter】
```

---

## 12. 前端 Script.html（solo UI）

- `applyModeUI()`：模式總開關(§1)。
- **狀態面板**：`refreshFateTags`(御主/雙從者卡、補魔/羈絆/令咒/休息/禮裝)、`setActiveServant`、`bondWord`。
- **戰爭行動列**：`renderWarActions`(**手風琴**：每目標一張可點開卡，`toggleWarTarget`/`warExpanded`，單目標自動展開；底部固定偵查/休息/移動)、`attackStyle_`(近戰/魔砲/狙擊樣式)、`localFoeServantName`。
- **行動 handler**：`servantStrike`(出戰/寶具/令咒/刺殺御主四參數)、`manaSupply`、`bond`/`openBondMenu`/`submitBond`、`rest`/`openRestMenu`/`restAndHeal`、`scout`、`mysticStrike`、`ruleBreakSteal`、`secondWind`、`setWorkshop`/`scavenge`、`proposeAlliance`/`breakAlliance`/`allyBond`。
- **戰報**：`renderFateBattleReport`(斬首多骰/strikes/雙從者血條)、`renderCombatReport`、`renderMysticReport`、`narrate`/`narrateCombatResult`、`handleDefeat`(敗北→虛假之夢→老虎道場)。
- **召喚/創角**：`rollFate`/`selectFateRoll`/`renderFateRolls`(魔術天賦測定)、`doSummon`/`summonByHero`/`selectSummonClass`、`chooseWarMode`/`chooseWar`。
- **地圖**：`renderMapPane`(陣地/搜索物資/盟友通報橫幅)、`buildMapSvg_`、`scout`。**地圖 17 正典地點**(衛宮宅/愛因茲貝倫城/冬木森林/冬木·碼頭/深山町遠坂宅/新都穗群原…)：種子在 `Setup_FateWorld.gs` `FATE_MAP_SEED`，`reseedIfEmpty_` 為 **upsert**(按名更新 TYPE/COORD/DESC＋補缺列)；前端位置是 `buildMapSvg_` 內 **hardcoded `LAYOUT`**(short-name→[x,y]，新都西/深山町東)＋`CONN`，**非試算表座標**(座標只備查)。改地圖要同步改種子(名字)＋LAYOUT(位置)。
- **移動敘事**：`actionMove`(Router 2121)回傳 `servantCard`(玩家從者卡)，前端 `travelTo` 抵達提示前置該卡＋「從者必在場、依性格至少一句台詞」指令——修掉移動後變御主獨白、從者像不存在。前端 `foes.length` 時再加「遭遇·敵在眼前」指令(敵方開口挑釁/試探，但勝負留待御主下令)。
- **移動順序＝世界先動玩家後到**：`actionMove` 先跑 `worldTick_`(敵 tick 換位，移動只換位不死人)→**重讀眾生**→才把玩家落到 target→讀同地人物給 AI。避免「追到敵人所在地、敵人卻在你踏入同一刻被傳走」(撞在一起卻沒對話)。**務必重讀 allPcData 再寫回**，否則整片 setValues 會用舊位置覆蓋掉剛 tick 的敵方移動。
- **追得到人**：`worldTick_`(Time_World 234)用 `freezeLoc = playerLoc`，**玩家所在/將抵達格上的敵人禁止移動**(`oldLoc === freezeLoc` 直接 continue)，否則玩家永遠撲空。兩個呼叫點都傳玩家格(move 傳 target、rest 傳 pcLoc)。
- **遭遇態度分流**：`actionMove` 在世界 tick 前算 `preFoesAtTarget`(target 此刻已有的敵名)，回傳 `preFoes`。前端 `travelTo`：現存 foe 有人在 preFoes→「找上門」(對方據守、戒備)；否則→「偶遇」(恰巧撞上)。語氣只給「依個性與立場開口」，不寫死。
- **🧹 九州系統大清理（已移除 35 個 action ＋ 1817 行）**：修煉/突破(cultivate/breakthrough)、任務(quests/claim_quest_reward/abandon_quest)、門派(get_faction_info/get_ranking/promote_rank/create_faction)、據點收成(estate_get/estate_harvest_all)、倉庫(warehouse_*)、物品/裝備(inventory/discard_item/sell_item/craft_item/consume_item/use_item_self/use_item_on_npc/gift_item/get_available_gear/equip_gear)、給銀兩(give_money)、九州打鬥(attack_npc/multi_attack)、偷竊/情報(steal_npc_item/buy_intel)、組隊(join_party/dismiss_party)、索要(request_item_from_npc/request_discard_npc_item)、強化(empower_npc)、處決(execute_npc)——皆 0 內部呼叫、solo 隱藏、慾海不碰。**保留**：actionPlay(慾海自由聊天引擎)、narrate_only(solo)、gallery、帳號、solo 全部戰爭 action、據點 home_*(模糊未動)、spare_npc/inspect_npc/get_epic_history。COL 欄位**全保留**(死欄不刪)。前端九州 UI 按鈕仍在但 mode 隱藏＋未知 action 優雅回錯誤(`handleGameAction` else 支)，無害；前端清理待後續批次。孤兒 helper(transferMoney 等)留著無害。
- **令咒透支倒數（單獨行動例外）**：敵從者燃**最後一道令咒**緊急脫離(`fateStrike_` seal-escape, Router ~3914)時，若其 TAGS 無 `fx:'solo'`(單獨行動)→ `stampDoom_` 在 MEMORY 寫 `【靈基透支】{死線絕對時數}`(現在 day*24+hour ＋ `SEAL_DOOM_HOURS`=3)。`worldTick_`(Time_World 末段)每次移動/休息推進時間後掃描，`getDoom_` 到期 → 該敵從者 `DEAD_`＋風聞消滅。若這收掉最後一名敵從者(`aliveEnemyServants_<=0`)→ `worldTick_` 回傳 `victory:true`，`actionMove`/`actionRest` 帶 `victory` 給前端，`travelTo`/`rest` 呼 `handleVictory` 出奪杯。弓兵(單獨行動)＝免倒數、可續存(原作 Independent Action)。helper：`rowHasSolo_/stampDoom_/getDoom_/SEAL_DOOM_HOURS`(Router ~4326)。
- **📜 戰記（里程碑回顧＋歷史戰役）**：獨立「戰記」表(自動建)，schema `[game_id, 帳號, 日, 時, 內容]`。`logWarEvent_(gameId, text, acctName)`(Router)只記 solo 局(g_)、附遊戲內 day/hour＋帳號(帳號表只記當前局，靠戰記列的帳號歸戶過去戰役；每場召喚必帶帳號)。**上限**：>2000 列砍最舊 500。接線點：召喚開戰、玩家令咒(戰鬥絕對命令／修復/補魔/脫離)、敵令咒脫離、從者擊破(雙方)、令咒透支倒數＋暗處養不起/廝殺(worldTick_，無帳號·靠召喚列歸戶)、斬首擊殺御主、結盟/破盟、奪杯/敗北。讀取：`actionWarChronicle`(`war_chronicle`，無 gameId＝當前局/有 gameId＝回顧過去·需帳號相符防越權)、`actionWarHistoryList`(`war_history_list`，列本帳號歷來戰役＋勝敗)。前端：抽屜「📜 本場戰記」`openWarChronicle()`；主選單「📜 戰役回顧」`openWarHistory()`→點一場→`openWarChronicle(gameId,title,true)`。
- ⚠ **戰記表保存上限**：其餘表都有修剪(因果 `trimLogRowsByOwner` 每 pcId 留 60／歷史暫存 40／readRecentLogRows 只讀表尾)；戰記用「>2000 砍最舊」自管，勿移除。
- **敵御主↔敵從者硬連結（誰是誰）**：`reseedRivals_`(Seed_Rivals 末段)種子時，rows 嚴格交替(master,servant…)，互寫 `【從者】名`(御主列)／`【御主】名`(從者列)於 MEMORY。`getServantMaster_`/`getMasterServant_`(Router)讀回。`markMasterLostServant_` 配對改**硬連結優先**(按名找御主，不怕多組同地)、無連結退回同落點。`getLocalPeopleList` 對 `敵從者` 帶 `master`、`敵御主` 帶 `servant`。前端 `travelTo` 在場敵對>1 組時加「在場敵對歸屬·勿張冠李戴」配對清單，AI 才不會把 3 組同場的主從搞混。**舊局無連結→退回同落點(相容)**。
- **喪失從者的敵御主（選 A：不移除，只標記＋演出）**：敵從者任一路徑死亡時，`markMasterLostServant_`(Router ~4340)在「同地同 game_id 的敵御主」MEMORY 寫 `【喪失從者】從者名·死因`(只記第一次)。三處死亡都接：戰鬥擊破(`fateStrike_` else 支)、令咒透支倒數＋暗處養不起/廝殺(`worldTick_`)。`getLostServant_` 讀回；`getLocalPeopleList` 對 `敵御主` 帶出 `lostServant`。前端 `travelTo` 對在場的喪失從者御主加指令：演出形單影隻、無牙棋手、依個性流露失恃(孤注/惶然/不甘)，別當仍有從者隨侍。配對採同落點(一master一servant結伴移動，無顯式 FK)。helper：`stampLostServant_/getLostServant_/markMasterLostServant_`。
- **敘事連續記憶**：`lastAiContext`(模組級，最近一段 AI 文 ≤300字)。`narrate()`/`narrateCombatResult`/play 都會更新它。`travelTo` 在 `foes.length` 時把 `lastAiContext.slice(0,280)` 當「前情」塞進抵達提示，讓 AI 知道「方才發生什麼」——逃跑後敵人追上/再遇時承接劇情、不當初次見面。`narrate_only` 後端只吃 promptText，所以前情是在前端拼進去的(零後端改動)。
- **鑑賞**：`openGallery`/`enterGallery`/`claimGrail`/`renderHeroList`。
- **逆天改命**（玩家改自己御主資料）：`openFateEdit`/`saveFate`→`actionUpdateFate`。**只准改 4 種敘事欄、數值與寶具一律鎖死**(GAS掌數值)：`back`身世(限30)/`intent`萌點(限30)/`trait`特徵(4格×20)/`pref`個性(4格×20)。特徵4格=外貌/氣質舉止/魔術師的癖性/卸下心防的私密一面(末格＝鑑賞慾海的親密種子，NSFW 消費在 Router 2406 `[床笫之間的反應]`)；個性4格=日常表象/真實內裡/喜歡/討厭。改別人(NPC)需好感100+已傾心，改自己免條件(solo 只碰自己)。數值編輯是九州 full 的 breakthrough/cultivate，solo 不露出。

---

## 13. 已完成的四大區塊（本專案進度）

①戰鬥職階相剋＋寶具專屬(Engine_Fate) ②正典劇情橋段(Seed_Canon) ③戰爭規則含結盟(同盟系統) ④日常與羈絆(bond/補魔/夢境/禮裝/雙從者/破戒奪僕/同盟生命週期→鑑賞)。
種子庫 36 從者＋13 御主 persona 全補完(v3)。

---

*最後更新：同盟生命週期＋種子補完＋行動列手風琴後。改動前先 grep 對照，改完 node --check，慾海邊界 git diff 驗證 0 改動。*
