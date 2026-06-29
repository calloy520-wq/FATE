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
| **full** | 九州全模擬（停用中／待清理） | 經濟·生活·物品·門派等已全砍，剩聊天輸入框；不作為玩法軌，可隨經濟一起清理 |
| **kanshou** | 鑑賞（奪杯後後日談約會） | 有聊天輸入框＋慾海開關；無戰鬥／血量 |

`applyModeUI()`（Script.html）是模式總開關。solo 隱藏 full 專屬功能、收掉輸入框、顯示 `war-actions` 行動列。

**雙軌設計**（Index.html `scr-menu`）：玩法只有兩條軌——🎴 純淨(單人聖杯戰爭, newGameFlow/continueGame, SFW) ／ 🌹 慾海(鑑賞後日談, openGallery, NSFW)。共用一張試算表＋核心資料(管線 奪杯→鑑賞 需要)，靠 帳號＋game_id 分流，不拆表。
另有**兩個唯讀視窗**(非玩法軌)：📜 個人聖杯戰記(showVictoryHistory，自己勝敗) ／ 🏆 排行榜(openLeaderboard/actionLeaderboard，跨帳號比拼)。`full`(九州全模擬)模式碼殘留、停用中，不作為前台軌（經濟已砍、可隨之清理）。
**持久層(清檔不刪，排行榜/戰記只撈這些)**：帳號表(WON勝場/CREATED/BEST_DAYS最快奪杯日/NAME)、戰史(每場勝敗+真實時間+從者+摘要)、鑑賞表(封存從者)。**會被清檔刪**：眾生(game_id)、關係(name)。`recordWinSpeed_(acct,gameId)` 在三勝利點(斬盡敵從者/斬首/起源彈)讀當前遊戲日取 min→ACC.BEST_DAYS。

**補魔(solo)**：`actionManaSupply` 走 narrate_only(SFW)、不開慾海引擎，prompt 維持「曖昧 fade、點到為止」（玩家認可現狀，勿再收緊）。

**重開/姓名查重**：`actionAccountNewGame`(Account.gs) 清舊單人戰場＝刪同 game_id 整個世界 ＋ 御主本人(按 charId，防 game_id 空的孤兒佔名)。`actionCheckName` 只擋「game_id 非空(進行中世界)」的同名活躍御主；DEAD_ 與 game_id 空的孤兒不佔名→重開後自己舊名可重用，多帳號間活躍同名仍隔離。

**重點：solo 全程無花錢入口**。身世的財力差異改由「起始禮裝機率」(`rollMysticForMaster_`)體現。
> ⚠ **經濟/生活層已全砍(2026-06 定案，推翻舊「保留給 kanshou」方針)**：money/商城/物品/給銀兩/任務/賭場/飛書/生活技能/裝備——**兩軌都不要**，AI 需要時自己掰、不寫試算表。kanshou 是「一個更單純的世界」(無經濟·無戰鬥)。code＋分頁＋COL 已清(見 §3 末)。

---

## 2. 實例化與資料表

- **game_id**：每局一個世界。`g_`+ts = 聖杯戰爭；`k_`+ts = 鑑賞世界。所有眾生/時鐘/關係查詢都帶 game_id 過濾，杜絕跨世界外洩。
- **🌹 慾海獨立分頁＋多人(最多3)**：慾海角色住獨立「**鑑賞眾生**」分頁(`getKanshouPcSheet_`，schema 同眾生)，與戰爭主表隔離、頻繁新增/移除不污染。**dispatcher 在 `pcId` 以 `KPC_` 開頭時把 `sheets.pc` 路由到此分頁**(solo 御主 `PC_` 不受影響；全 codebase 唯一硬寫死「眾生」處＝dispatcher line ~146)。`actionEnterKanshou` 改寫此分頁＋**持久接續**(同御主×同從者已有 k_ 世界→接續不重建、肉體/親密/羈絆延續)。`kanshouServantRow_` 共用建列。同伴管理 action `kanshou_companions/add/remove`(上限3)；前端抽屜「👥 後日談同伴」(`drawer-companions`，`applyModeUI` 僅鑑賞顯示)→`openCompanions/kanshouAdd/kanshouRemove`。慾海聊天仍走 `actionPlay`(引擎未動)。**NSFW**：`enterKanshou` 自動勾 `nsfw-mode-toggle`(否則 isNsfwMode=false→intimacy 回填全跳過、肉體狀態不寫)。**DEV**：`dev_seed_gallery`(待移除)塞測試從者。(舊 `openGallery/enterGallery` 彈窗已退役)
- **FACTION 區分**（COL.PC.FACTION 字串）：`御主`(玩家)、`從者`(玩家的)、`敵御主`、`敵從者`、`盟友御主`/`盟友從者`(前端 override，見 §8)。
- ✅ **九州數值五圍(STR/CON/AGI/INT/LUK) 已移除(2026-06)**：FATE 純六圍 SIX 階級制。戰鬥(Engine_Fate)本就吃 `rankVal(six[...])`；HP/MP 改由 `maxStatsForRow_(row)`＝`fateMaxHpMp_(svNum_(SIX.耐久), svNum_(SIX.魔力))` 算；`getCharacterTotalStats` 的 STR~LUK 顯示值改由 `svNum_(SIX)` 推。`buildPlayerStatusString` 五圍 §位置保留(由 SIX 推/空字串)→前端 s[N] 不變。
- ✅ **九州境界/物品/銀兩/門派 已移除(2026-06)**：`REALMS/REALM_MODIFIERS/REALM_LIMITS`、`calculateMaxStats`(屬性上限計算器)、`getRealmConstantsJson` 全砍；新 `fateMaxHpMp_(con,mag)` 無境界倍率(`100+con*10`/`50+mag*10`)。`COL.PC.REALM` 死欄保留但一律寫 ""。物品(`RARITY_TABLE/detectItemType`)、貨幣(`CURRENCY_TABLE`)、門派(`registerFactionHelper/updateFactionPower`)helper 一併移除。`actionManualNpc` de-realm：御主固定凡人級、NPC 採 AI 建議 con/int 夾 8~25。快取鍵 `KYUSHU_MAP_DATA`→`FATE_MAP_DATA`。
- ✅ **提示詞清九州(2026-06)**：solo `sfwBaseRules`、各 NPC/玩家卡、慾海 `nsfwBaseRules`(玩家授權「只換詞·機制原封不動」：九州天道→敘事演化核心、境界/真氣/江湖/武學→中性)全清九州詞，讓 AI 完全不知九州。**例外**：`雙修技巧` 是 NSFW `[雙修技巧]` MEMORY 機制，依機制原封不動保留；`凡人`作「人類御主」描述語(非境界值)保留。
- **分頁**（Setup_FateWorld.gs `FATE_SHEET_DEFS`，缺頁自動補、冪等）：眾生/英靈殿/御主殿/戰鬥標籤/帳號/戰史/鑑賞/時鐘/關係/坤圖(地圖)/因果(log)…

### COL schema（索引讀取，表頭僅供人看）
```
PC(眾生)【FATE 25欄·2026-06 砍九州經濟/生活/五圍後】:
  ID0 NAME1 SEX2 BACK3(身世) STATUS4(外顯) TRAIT5 LOC6 PREF7(個性)
  HP8 MP9 MAX_HP10 MAX_MP11
  REALM12 MEMORY13 INTENT14(萌點) FACTION15 RANK16(職階) CONTRIB17 ALIGN18
  PHYSICAL19(肉體·NSFW) MARTIAL20(寶具) GAME_ID21 SIX22(六圍JSON) TAGS23(技能JSON) SEEN24(戰爭迷霧)
  🗑️已刪:財帛MONEY/裝備WEP·ARM·ACC1·ACC2/生活技能LIFESKILL/冗餘職階CLS(併RANK)/數值五圍STR·CON·AGI·INT·LUK(改吃六圍SIX)。
  🗑️COL 已無 ITEM/QUEST/SHOP/MAIL/TASK/CTAG 子表(戰鬥標籤分頁仍在、以fx碼查找不需索引)。
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
| summon_servant | actionSummonServant | 召喚從者（從英靈殿抓真名/六圍/技能→眾生列）。**種子英靈直接用寫死 persona(萌點/口吻)、不叫 AI**(省一次 API、加速)；只有名冊查無的自訂/未知英靈才走 AI 即時生成(else 分支)。**敘事8格**：個性(PREF)讀 `persona.words`、**特徵(TRAIT)讀 `persona.look`**(35 位種子皆手寫4格 外貌/氣質/自稱/卸下心防私密一面，召喚/鋪敵 直接用、AI原創走通用預設、不再被戰鬥特性污染)。 |
| get_heroes / get_masters | — | 創角選單列出可選英靈/正典御主 |
| get_tags | actionGetTags | **左側狀態面板資料**：御主HP/MP/令咒/願望、從者陣列(六圍/技能/羈絆/寶具)、供魔收支、禮裝、破戒能力 |
| fate_battle | actionFateBattle | **核心戰鬥**：D20＋寶具＋令咒＋斬首＋雙從者＋協同強襲（見 §4） |
| use_seal | actionUseSeal | 令咒固定選單：修復/補魔/緊急脫離 |
| mana_supply | actionManaSupply | 補魔(燃迴路)：硬擠迴路回滿共用池，**永久代價** maxHP−5~10、迴路−1~2(地板迴路8/HP40)+羈絆+SFW fade（耗1AP，卸防可能被突襲）。過度＝慢性自盡。 |
| ~~blood_supply~~ | (已移除) | 🩸燃血改【被動】：池見底時 applyRegen_ 自動燃御主＋從者HP續契約(缺口÷2同扣)。主動 action/按鈕/函數皆已刪。 |
| set_servant_output | actionSetServantOutput | 🔋設從者靈基出力檔(20/40/60/80/100，存 MEMORY【出力】)。免費即時不耗AP。決定戰力＋御主每小時維持費；100% 才能放寶具。 |
| set_mage_realm | actionSetMageRealm | 🔮魔境的智慧(斯卡哈專屬)：玩家點選 **1 個通用 A 階被動 fx**(`mageRealmPool_`：對魔力/怪力/心眼/透化/軍略/自我改造)，存 MEMORY【魔境】fx；fx 空字串＝清除。免費即時不耗AP。`rowToCombatant_` 戰鬥時注入 skills(r:'A')。只接受持 `mage_realm` 的從者。 |
| bond | actionBond | 羈絆互動(閒聊/共餐/特訓/夜談)，每種每日一次升羈絆 |
| use_mystic | actionUseMystic | 發動主動禮裝（吃迴路/耗魔/扣充能，對敵造魔力傷害） |
| rule_break_steal | actionRuleBreakSteal | 破戒奪僕：打殘敵從者(HP<35%)+燃令咒→奪為第二從者(上限2) |
| propose_alliance / break_alliance / ally_bond | 同盟系 | 結盟/撕毀/與盟友共處(見 §8) |
| set_workshop / scavenge | 陣地系 | 設陣地(提升供魔)／搜索物資 |
| second_wind | actionSecondWind | 0-AP 死局：扣~20%血換+4AP，每日一次(【強撐】D) |
| scout | actionScout | 偵查：揭露同地敵蹤(設 SEEN，**敵移位後不再清 SEEN→已偵查者持續可見**) |
| prep_meal | actionPrepMeal | 🍱 整備·進食(戰前 buff)：耗1AP，御主 MEMORY 記`【整備至】<絕對小時>`，效期內從者出擊命中 +`MEAL_BUFF_BONUS`(2)約`MEAL_BUFF_HOURS`(8)小時。solo 無道具欄/商城，食物抽象供給。`fateStrike_` 讀 `mealBuffActive_` 把 `mealBuff` 傳進 `resolveFateBattle_`(Engine_Fate.gs 加 aHit)。前端 `prepMeal()`＋戰場行動列「🍱 整備」鈕 |
| get_map_nodes / get_all_categorized_maps | 地圖 | 地圖節點＋敵蹤(吃 SEEN 迷霧；有盟友→`hasAllyInGame_`全揭露) |
| move / rest / sync | — | 移動(2AP)／休息(補AP+夢境)／資料同步 |
| narrate_only / multi_attack_narrate | actionNarrateOnly等 | **AI 純說書**(solo 不用 actionPlay；GAS 算數值、AI 只演出) |
| claim_grail / enter_kanshou / kanshou_companions·add·remove | Gallery.gs | 奪杯封存／進鑑賞後日談世界／同伴管理(見 §9)。⚠ 舊 list_gallery/enter_gallery/gallery_talk 已移除 |
| enter_kanshou | actionEnterKanshou (Gallery.gs) | **🌹 進入鑑賞主入口(新版)**：每帳號【單一常駐】後日談世界。御主 avatar(KPC_)以 MEMORY `【帳號】<acct>` 綁定、id 持久→`getGameHistory(pcId)` 跟單機一樣接續歷史。無從者預載、不重講開場；從者由 `kanshou_companions/add/remove`(👥面板) 邀請(上限3)。**御主名字＋性別首次進場由玩家定**(不掛帳號)：沒帶齊 `pcName/pcSex`又還沒建過→回 `needSetup:true`(附 `defaultName`)，前端 `askKanshouSetup()` 問一次(名字＋性別)再帶進來建。前端 `enterKanshou()`(Index.html「進入鑑賞」鈕)→ mode=kanshou、自動開 NSFW、撈歷史 |
| kanshou_set_sex / kanshou_set_name | actionKanshouSetSex／actionKanshouSetName (Gallery.gs) | ⚧/✏ 隨時改後日談御主 avatar 性別/名字(只動該欄，不影響歷史；改名一併遷當前同伴的 REL.PC 羈絆鍵)。👥面板「切換性別」「改名」鈕→`changeKanshouSex()`／`changeKanshouName()` |
| get_victory_history / get_ranking | — | 戰史/排行 |

### 🗑️ 九州經濟/生活層已全數移除（2026-06，code＋分頁＋COL 一併清）
銀兩(MONEY)/商城·店鋪(SHOP)/物品·背包(ITEM)/天命·任務(QUEST)/工房(TASK)/賭場/飛書(MAIL)/生活技能(LIFESKILL)/裝備(WEP·ARM·ACC1·ACC2)——對應 action、helper(resolveItemName/transferMoney/checkAndExpireQuests…)、actionPlay 內 items_gained/transferred/lost/used·money_transferred·quest 解析、前端背包/物品連結/飛書 UI 全拆；COL 子表與分頁定義一併刪。**保留**：魔力收支(playerServantEconomy_/工房/`economy:`欄＝FATE 戰鬥機制非錢)、關係(REL)、肉體(PHYSICAL)/外顯(STATUS)。`play`(actionPlay) 仍用於 kanshou(NSFW)，**solo 戰爭走 narrate_only 不走 play**。
> **🎴 actionPlay 的 AI 回寫三閘已 solo-only 關閉(2026-06，鑑賞照舊)**：`new_maps`(AI 加地點)／`recruited`(AI 招募入隊)／`rel_changes.fav_change`(AI 改好感) 三者一律 `if (isNsfwMode)` 才生效。solo 的地圖只走坤圖/移動、招募只走召喚·破戒奪僕·結盟、**好感只走羈絆/補魔/結盟等 GAS 按鈕**——AI 自由敘事改不動數值。好感渲染(顯示 ❤️±N)同樣 solo 不顯示。
> **🗑️ spare_npc(放過)＋打掃戰場(處決/放過昏迷者)已刪(2026-06)**：九州「擊昏→處決/放過」殘留，與 FATE「靈基崩潰消滅」矛盾；`execute_npc` action 早已不存在(死按鈕)。移除 `actionSpareNpc`＋router＋前端 `spareNpc`/`confirmExecute`/`renderBattlefieldCleanup` 及兩處呼叫。

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
  `aim analyze anti_magic_lance burst chain clear_mind divine_age divine_core ea evade_ranged excalibur first_strike gae_bolg gob mad morale nullify_magic petrify projection ride self_mod stealth str_up summon_horror tactics territory tsubame ubw unreadable wind_strike zabaniya`
  - **🐙 summon_horror(螺湮城教本／青鬍子，2026-06)**：`npAtkScale_`＝對城＋寶具傷 ×1.6+8d10+50。**＋常駐召喚物(actionFateBattle)**：玩家青鬍子解放寶具→召「深淵海怪」(筋A耐A巨獸 horrorC)常駐戰場，每回合與本人並肩追擊一擊、每回合扣御主MP `HORROR_UPKEEP`(30)維持；御主魔力撐不住→海怪潰散退場。海怪攻擊走 `fateStrike_(horrorC...)`、進 rl.strikes(戰報自動顯示)。青鬍子寶具模式 1%→23%；普通/技能仍0%(無寶具=無海怪，gimmick召喚師)。
- **📊 全戰鬥都有戰報卡(2026-06)**：① `renderFateBattleReport` 舊 guard `!r.rounds` 會擋掉【無回合】的斬首/突襲報(等於斬首戰報一直沒顯示)→改 `if(!r)`。② 新增**突襲戰報卡**(`r.ambush`)：`enemyAmbushOnServant_` 回 `out.report{ambush,enemyName,svName,dmg,after,svHpMax,destroyed,defeat}`，rest/mana_supply/scavenge/scout 四個 caller 都把 `report` 帶回前端並 `renderFateBattleReport`＋補 defeat 處理。
- **🎬 AI 敘述瘦身(2026-06)**：戰鬥/斬首 prompt 由「★務必演出X」一長串指令 → 改【事實素材列(·)＋單行收尾steer】，給 AI 數據讓它自己演(show-don't-tell)，不報菜名、不堆指令。海怪/對轟/令咒/電池/十二試煉/盟友皆改為事實行。
  - **🗑️ 移出種子(2026-06)**：`大仲馬-Caster`(亞歷山大·仲馬)＋`漢斯-Watcher`(安徒生)——純支援·無攻擊寶具(1v1 恆敗、非戰鬥從者)，移出 SEED_SERVANTS。FATE_FAKE_ROSTER 的偽戰 Caster 由大仲馬改派`玉藻前-Caster`。種子 35→33。
  含：職階相剋三角(KNIGHT_BEATS +命中+傷害)、對魔力減魔砲、territory 防壁、divine_age 繞 MR、zabaniya 致命(×1.9+70)、gae_bolg 因果必中、petrify 石化、projection 被動加成(EMIYA) 等。
- **🎴🎯 六圍降權＝角色速寫(2026-06核心哲學)**：TYPE-MOON 官方：參數是「讓人理解這從者」的速寫，非戰力試算表(庫丘林六圍頂尖卻幸運E→運氣/故事才是裁判)。舊版命中/迴避用 `rankVal`(差距50)當主導項→差兩階就鎖死→必然極化(模擬 76% 越界)。修正：
  - **命中** `= d20 + rankTier(hitStat)×K_STAT(2.5) + rand(-3~3) + outMod`（hitStat：Caster魔力/其餘敏捷）。階差壓到~12，d20(運氣)重新主導。
  - **迴避** `= d20 + (rankTier(敏)×0.65+rankTier(耐)×0.35)×2.5 + rand(-3~3)`：拆「敏捷雙吃」＋降權。
  - **傷害 flat** `rankVal×0.8→×0.6`：避免高階一發轟死。
  - 模擬結果：普通/技能 **76%→29% 越界**(大多對局回 28~77% 健康區)；寶具 74%→52%(climactic NP 層較swingy屬正常)。
- **🍀 幸運上演逆轉(2026-06)**：自指變異(非對拼)——低運(≤D)每擊 8% 失手(-10)、高運(≥A)8% 福星(+8)。製造爆冷與劇情感(庫丘林詛咒/Saber福星)，不讓高運方持續輾壓。
- **🔧 平衡補丁(2026-06)**：①`divine_age`(神代魔術)＝**完全無視**對魔力(原只半減)，救美狄亞；②`fast_cast`(高速詠唱)+12×rankMul 傷害；③`ubw`(無限劍製)`npAtkScale_`＝**對城**級(規模階5→可多燒狂戰十二試煉命，救 EMIYA 對狂戰；非對界，避免對人一發秒)；④`npBaseDice_` 下修(A20→13d10/EX30→18d10…)；⑤`NP_SCALE_MATRIX` 壓縮(max ×3.0→1.7)避免大規模寶具秒小規模。
- **🎲 D&D 傷害骰(2026-06)**：`rollDice_(n,sides)`＋`rankTier_(r)`(E1→EX6)。
  - 武器骰(每擊)：`base = round(rankVal(主屬性)*0.5) + rankTier d8 + 命中分差*1.2 − 耐久/2`。
  - 暴擊(擲20)：多骰一輪 `rankTier d8 +12`(取代舊固定 +30)。
  - 寶具骰：`npBaseDice_(寶具階)`＝E3d10/D5d10/C8d10/B12d10/A20d10/(A+·A++)22d10/EX30d10；另加 `rankVal(寶具)*0.6+10`。
  - ⚠ **EX 嚴格判定(2026-06 修)**：`rankVal('A++')=60` 與 EX 同值，故 `npBaseDice_/npPranaCost_` 改用字串 `/EX/` 認 EX；**A++ 算 A 階**(22d10/prana500)，否則 Saber 誓約勝利之劍(A++)會被收 EX prana800 而永遠放不出。
- **🔱 概念優先權 Priority(2026-06)**：`CONCEPT_TIER{}`(ea6 / excalibur·divine_age·rule_breaker5 / ubw·anti_magic_lance·gae_bolg4 / god_hand·tsubame·zabaniya·petrify3 / nullify_magic·divine_core·territory2)。`offenseTier_(c,isNp)` 取攻方最高進攻概念階；`pierces(防禦fx)`＝攻方階≥防禦階+`PIERCE_GAP`(2)→該防禦(territory/神核/對魔力)被無視(概念壓制)。把舊「破魔無視神核」系統化＋ ea 凌駕一切。
- **🏰 寶具規模相剋矩陣(2026-06)**：`npAtkScale_`(對人/對軍/對城/對界，由寶具名或 ea→對界/excalibur·ubw→對城 推)×`npDefScale_`(由 ubw/神核/god_hand/territory 推) → `NP_SCALE_MATRIX` 倍率(**已壓縮：對城打對人×1.5、對界×1.7、min×0.4**；非舊×2.5/3.0)。`ea` 寶具：×1.7+4d12+80。
- **🔋🔋 出力電池制(2026-06 大改·玩家定案)**：**從者【沒有自有魔力池】**(召喚時 MP/MAX_MP=0)，全靠御主供魔。**御主MP＝唯一且持續的魔力資源(電池)**。從者有「靈基出力檔位」(玩家旋鈕，20/40/60/80/100，存從者 MEMORY【出力】，預設60巡航)：
  - `outputTier_(pct)`(Core_Settings)→`{hit,dmgMul,drainMul,np,label}`五檔：100%(+3/×1.3/×2.0/可放寶具/全開)、80%(+1/×1.1/×1.5/高壓)、60%(0/×1.0/×1.0/巡航)、40%(-2/×0.85/×0.6/節流)、20%(-5/×0.7/×0.3/維持)。`snapOutput_`吸附、`servantOutput_(memory)`讀、`setServantOutput_(memory,pct)`寫。
  - `resolveFateBattle_`：`atk.output`(rowToCombatant_ 從 MEMORY 讀)→`outMod=outTier.hit`(命中)；勝方傷害 `base×outputTier_(winner.output).dmgMul`。
  - **寶具僅出力 100% 可解放**(`actionFateBattle` 閘：`servantOutput_<100`→擋並提示)。前端 `servantStrike(useNp)` 自動先 `set_servant_output:100`(解放寶具＝全開)。
  - **set_servant_output** action→`actionSetServantOutput`(免費即時，不耗AP)。前端從者卡「🔋靈基出力轉盤」5鈕；`get_tags` servant 物件帶 `output/outputLabel`。
- **👑 王之財寶(gob) 常駐被動(2026-06)**：吉爾伽美什不再把 gob 當主動技——`resolveFateBattle_` 內**每擊**命中+5 ＋ `gobVolley_()`(50d3 捨去1，EV≈83)無盡兵裝彈幕傷害，不論模式都壓制全場。模擬：金閃普通模式對全場 31%→**80%**(回到 top3，貼合原作「最強之一」)。其主動技槽自動落到鼓舞(morale)。
- **⚡ 從者專屬主動技(2026-06)**：`servantActiveSkill_(c)` 依 fx 給本戰增益(burst→傷×1.3 / stealth→命中+6傷×1.15 / str_up→傷+14 / aim·projection→命中+6傷+10 / morale→命中+3傷+8 / self_mod→命中+4傷+6 / 預設→集中命中+5)。`actionFateBattle` 啟動耗魔 `200×mpPct`(出力電池制：固定基準，非已廢的從者池)→`drainForNp_` 抽御主。前端「⚡ 主動技」鈕。
- **🌟 乖離劍·執行殺(ea／英雄王，2026-06)**：`resolveFateBattle_` 開頭——**僅 `opts.np`(解放寶具，即出力100%)＋英雄王【自身】血量≤40% 才觸發**(傲慢→認真)。傷害 `寶具rankVal×4＋6d12＋200`、必中越防、early-return。血量足走常規寶具(×1.7)。⚠ 舊「對面血≤30%免費每擊觸發」bug 已修正。
- **🔋 御主電池付款(2026-06 出力制)**：`npPranaCost_(寶具階)`＝**E40/D70/C110/B160/(A·A+·A++)220/EX300**(對齊御主池迴路×8≈240：A階≈耗盡滿池、EX須再焚血；EX/EA 極罕見)。`drainForNp_(sheets,pcData,svIdx,masterIdx,mpCost)` 付款序 **①御主MP ②御主HP**(`BATTERY_HP_PER_MP`=2HP→1MP，血底線1；從者無池，fromSv 恆0)。寫進 report.battery＋前端血條。御主血魔皆空才擋寶具。
- **⚖️🔋 共用魔力池(2026-06)**：從者與御主**共用一個魔力池**(存御主MP)。上限 `masterPoolMax_(迴路, 同隊從者魔力val總和)`＝**迴路×6 + 魔力×2**(迴路30+Saber魔A→280；Berserker魔B→260；Assassin魔E→200)。`masterMaxHpMp_` 只給無從者基底(HP100+迴路×2／MP迴路×6)。召喚(actionSummonServant 併入從者魔力、補滿)＋時回(applyRegen 重算)動態更新。回魔＝御主迴路供給＋從者魔力×0.15(從者少)＋靈脈/工房。Caster(魔A·低維持)幾乎自持，Berserker 吃魔。
- **♻️💧🩸 回魔三態(2026-06)**：①♻️靈脈/陣地/休息＝免費自然回魔(首選)；②💧**補魔(燃迴路·主動)**＝回滿池 BUT【永久】燒蝕 血量上限−5~10、迴路−1~2(地板：迴路≥8、HP上限≥40)，過度＝慢性自盡(`actionManaSupply`)；③🩸**燃血(被動)**＝**池見底**、時消耗補不上時，`applyRegen_` 自動把缺口÷2同時扣御主HP＋從者HP(平均·各保底1)，不再強制降出力——想少流血就自己節流。`actionBloodSupply`/blood_supply/前端 bloodSupply 已全移除。
- **🏷️ 被動 fx 功能化(2026-06)**：`resolveFateBattle_` 內生效的常駐被動——神性(被神殺者×1+0.5×神性階,上限2.0)／黃金律 wealth(金閃自身HP≤20%免魔力放 EA)／天之鎖 chain(`chainVolley_` 18d3捨1,gated !gob,對神性另有縛神性 debuff)／原初符文 rune(loser 減傷10%×階)／**變化 shapeshift(守方迴避+3×階,滑開致命擊)**／**道具作成 crafting(winner傷害+8×階,備妥之器)**／**無毀的湖光 weapon_steal(蘭斯洛特·Arondight)：對具「龍/竜」trait之敵傷害×1.5(對龍解放)——龍 trait：阿爾托莉雅(龍之因子)、莫德雷德**。台灣譯名：寶具「騎士不為孤軍/騎士不死於徒手」、聖劍「無毀的湖光」(非「湖光奪兵」——那不是官方譯名)。
- **🔮✨ 魔境的智慧·玩家可選被動(2026-06)**：斯卡哈-Lancer 持 `{n:'魔境的智慧',fx:'mage_realm'}`。玩家在從者卡點選盤挑 **1 個** `mageRealmPool_()` 內的通用 A 階被動(對魔力/怪力/心眼/透化/軍略/自我改造——皆有階級、非寶具/簽名、不含她本有的原初符文)。`actionSetMageRealm`→存 MEMORY【魔境】fx→`rowToCombatant_` 戰鬥時注入 skills(r:'A')。**可選能力標籤一律發亮**：前端 `pill()` 第5參 `glow`＋`.tag-selectable`(Style.html `@keyframes tagGlow` 藍光脈動)＋'✨'前綴，提醒玩家可點選。新增可選能力時沿用此 glow 框架。
- **🐕 主從synergy(2026-06，原作「御主供魔/契合提升從者能力」)**：`masterSynergySix_(name,six,memory)`(Core_Settings)讀從者列 MEMORY【御主】名，特定主從組合回到全盛六圍。目前只 **恩奇都↔巴茲狄洛特(獵犬御主)→ 全A·寶A++**；其餘御主(含玩家自召)下恩奇都維持**削弱基線**(種子已降為 筋C/耐B/敏B/魔B/寶A)。`rowToCombatant_` 套用。擴充別組就往該表加。
- `aliveEnemyServants_(sheets,gameId)`：在世敵從者數（勝利判定用）。
- `enemyRetreatLoc_`：令咒緊急脫離時敵退避地點。

### actionFateBattle 流程（Router_Action.gs）
1. 找出戰從者 `atkIdx`(userData.servant 指定或第一個)、目標 `nIdx`。同地檢查、AP 檢查、盟友不可打(`isAllied_`)。
2. **斬首**：目標=敵御主且有從者護衛→每名在世從者擲 D20，任一=20 斬殺御主(+護衛隨亡)→勝利判定；全失手→護衛反噬每人 1.5×。
3. **一般戰**：ROUNDS=3 回合。`partyIdxs`=所有在世從者(雙從者齊攻)。寶具/令咒只加在 atkIdx 開場第一擊。寶具魔力走 `drainForNp_`(御主電池)，前置 `maxPay` 檢查唯三者皆空才擋。
4. **協同強襲**(§8)：`allyAtkIdx`=同地盟友從者，每回合對共同敵人助攻一擊(不被反擊)。
5. 敵反擊：`enemyNpSpent` 一場限一次寶具，殘血越急越愛開。
   - **🔋 敵寶具吃魔力(2026-06)**：敵開寶具(回合反擊＋對轟)前 `enemyCanAffordNp_`(自身MP＋`enemyMasterIdx_` 敵御主電池 ≥ prana)才放，並 `drainForNp_` 扣魔；付不起→改普攻/不對轟。EX/EA(prana800)幾乎沒人付得起→極罕見；masterless 敵(金閃)補不了魔→寶具自限。
   - **🛡️ 十二試煉概念燒命(2026-06)**：god_hand 致命時，`lossN=1`＋寶具概念加成(取 `offenseTier_` fx階 與 `npAtkScale_` 規模階 較高者：≥6→+2、≥5→+1)＋overkill(傷/復活線 ≥3→+2、≥2→+1)。`lossN≥餘命`→餘命一擊燒盡、不復活落入 destroyed。解決「Saber 對城 Excalibur 連一命都燒不掉」。
   - **🌟 寶具對轟(2026-06)**：玩家開場 useNp＋目標敵從者且敵有寶具(且付得起prana) → `clashUrge`(0.6＋狂/暗殺0.25−殘血) 機率敵以寶具相迎。雙方算 `pPow/ePow`(resolveFateBattle np 火力，不直接扣血)→ 高者壓過、差額貫穿敗方、勝方回震15%；±10% band 內＝僵持相抵雙方小損。傷害經 `fateStrike_({forceDamage})` 套用(沿用死亡/勝負/復活/脫離)。設 `openingNp/openingSeal=false` 防回合迴圈重放。寫進 report.clash＋aiPrompt【寶具對轟】＋前端對轟卡。`fateStrike_` 新增 `opts.forceDamage`(略過 resolve 傷害、只跑後續結算)。
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
- `playerServantEconomy_`：**御主魔力**收支(左側 HUD，含 output/outputLabel)。`servantEconomy_`(income=迴路供給+靈脈+工房；drain=六圍/8×狂化)。**🔋 共用池 `applyRegen_`(2026-06)**：御主MP 是共用池——重算上限 `masterPoolMax_(迴路, Σ從者魔力)`；income(迴路供給＋靈脈＋工房＋Σ從者魔力×0.15)×mult − Σ(從者 drain × `outputTier_(出力).drainMul`)；從者出力檔不在時回變動；御主乾涸(連維持都湊不出)→強制全從者降【出力】20% ＋從者 HP 流血(靈基崩解 4%/hr)。御主HP/從者HP 自我修復 5%/hr×(avalon1.6)。`leylineAt_`、`masterCircuits_`(MEMORY【迴路】N 預設30)。
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
- `actionEnterKanshou`：每帳號【單一常駐】後日談世界(KPC_ 御主 avatar，以 MEMORY【帳號】綁定、id 持久接續歷史)。首進需 `pcName/pcSex`(否則回 `needSetup`)。對話仍走 `actionPlay`(NSFW，引擎不動)。
- `actionKanshouCompanions/Add/Remove`：後日談同伴管理(上限3，住獨立「鑑賞眾生」分頁，`kanshouServantRow_` 建列)。`actionKanshouSetSex/SetName`：改 avatar 性別/名字。
- `actionDevSeedGallery`：DEV 塞測試從者(待移除)。
- `findPlayerServant_`、`purgeGameData_`。
- ⚠ **舊 `actionListGallery/actionEnterGallery/actionGalleryTalk` 已移除**(被 enter_kanshou＋kanshou_* 取代)。

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
【魔境】fx(斯卡哈玩家選的通用A階被動，set_mage_realm 寫，rowToCombatant_ 注入)
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
- **🧹 九州系統大清理（已移除 35 個 action ＋ 1817 行）**：修煉/突破(cultivate/breakthrough)、任務(quests/claim_quest_reward/abandon_quest)、門派(get_faction_info/get_ranking/promote_rank/create_faction)、據點收成(estate_get/estate_harvest_all)、倉庫(warehouse_*)、物品/裝備(inventory/discard_item/sell_item/craft_item/consume_item/use_item_self/use_item_on_npc/gift_item/get_available_gear/equip_gear)、給銀兩(give_money)、九州打鬥(attack_npc/multi_attack)、偷竊/情報(steal_npc_item/buy_intel)、組隊(join_party/dismiss_party)、索要(request_item_from_npc/request_discard_npc_item)、強化(empower_npc)、處決(execute_npc)——皆 0 內部呼叫、solo 隱藏、慾海不碰。**保留**：actionPlay(慾海自由聊天引擎)、narrate_only(solo)、gallery、帳號、solo 全部戰爭 action、據點 home_*(模糊未動)、inspect_npc/get_epic_history。(spare_npc 已於 2026-06 連同打掃戰場一併刪除，見 §3 末)COL 欄位**全保留**(死欄不刪)。前端九州 UI 按鈕仍在但 mode 隱藏＋未知 action 優雅回錯誤(`handleGameAction` else 支)，無害；前端清理待後續批次。孤兒 helper(transferMoney 等)留著無害。
- **令咒透支倒數（單獨行動例外）**：敵從者燃**最後一道令咒**緊急脫離(`fateStrike_` seal-escape, Router ~3914)時，若其 TAGS 無 `fx:'solo'`(單獨行動)→ `stampDoom_` 在 MEMORY 寫 `【靈基透支】{死線絕對時數}`(現在 day*24+hour ＋ `SEAL_DOOM_HOURS`=3)。`worldTick_`(Time_World 末段)每次移動/休息推進時間後掃描，`getDoom_` 到期 → 該敵從者 `DEAD_`＋風聞消滅。若這收掉最後一名敵從者(`aliveEnemyServants_<=0`)→ `worldTick_` 回傳 `victory:true`，`actionMove`/`actionRest` 帶 `victory` 給前端，`travelTo`/`rest` 呼 `handleVictory` 出奪杯。弓兵(單獨行動)＝免倒數、可續存(原作 Independent Action)。helper：`rowHasSolo_/stampDoom_/getDoom_/SEAL_DOOM_HOURS`(Router ~4326)。
- **📜 戰記（里程碑回顧＋歷史戰役）**：獨立「戰記」表(自動建)，schema `[game_id, 帳號, 日, 時, 內容]`。`logWarEvent_(gameId, text, acctName)`(Router)只記 solo 局(g_)、附遊戲內 day/hour＋帳號(帳號表只記當前局，靠戰記列的帳號歸戶過去戰役；每場召喚必帶帳號)。**上限**：>2000 列砍最舊 500。接線點：召喚開戰、玩家令咒(戰鬥絕對命令／修復/補魔/脫離)、敵令咒脫離、從者擊破(雙方)、令咒透支倒數＋暗處養不起/廝殺(worldTick_，無帳號·靠召喚列歸戶)、斬首擊殺御主、結盟/破盟、奪杯/敗北。讀取：`actionWarChronicle`(`war_chronicle`，無 gameId＝當前局/有 gameId＝回顧過去·需帳號相符防越權)、`actionWarHistoryList`(`war_history_list`，列本帳號歷來戰役＋勝敗)。前端：抽屜「📜 本場戰記」`openWarChronicle()`；主選單「📜 戰役回顧」`openWarHistory()`→點一場→`openWarChronicle(gameId,title,true)`。
- ⚠ **戰記表保存上限**：其餘表都有修剪(因果 `trimLogRowsByOwner` 每 pcId 留 60／歷史暫存 40／readRecentLogRows 只讀表尾)；戰記用「>2000 砍最舊」自管，勿移除。
- **敵御主↔敵從者硬連結（誰是誰）**：`reseedRivals_`(Seed_Rivals 末段)種子時，rows 嚴格交替(master,servant…)，互寫 `【從者】名`(御主列)／`【御主】名`(從者列)於 MEMORY。`getServantMaster_`/`getMasterServant_`(Router)讀回。`markMasterLostServant_` 配對改**硬連結優先**(按名找御主，不怕多組同地)、無連結退回同落點。`getLocalPeopleList` 對 `敵從者` 帶 `master`、`敵御主` 帶 `servant`。前端 `travelTo` 在場敵對>1 組時加「在場敵對歸屬·勿張冠李戴」配對清單，AI 才不會把 3 組同場的主從搞混。**舊局無連結→退回同落點(相容)**。
- **喪失從者的敵御主（選 A：不移除，只標記＋演出）**：敵從者任一路徑死亡時，`markMasterLostServant_`(Router ~4340)在「同地同 game_id 的敵御主」MEMORY 寫 `【喪失從者】從者名·死因`(只記第一次)。三處死亡都接：戰鬥擊破(`fateStrike_` else 支)、令咒透支倒數＋暗處養不起/廝殺(`worldTick_`)。`getLostServant_` 讀回；`getLocalPeopleList` 對 `敵御主` 帶出 `lostServant`。前端 `travelTo` 對在場的喪失從者御主加指令：演出形單影隻、無牙棋手、依個性流露失恃(孤注/惶然/不甘)，別當仍有從者隨侍。配對採同落點(一master一servant結伴移動，無顯式 FK)。helper：`stampLostServant_/getLostServant_/markMasterLostServant_`。
- **敘事連續記憶**：`lastAiContext`(模組級，最近一段 AI 文 ≤300字)。`narrate()`/`narrateCombatResult`/play 都會更新它。`travelTo` 在 `foes.length` 時把 `lastAiContext.slice(0,280)` 當「前情」塞進抵達提示，讓 AI 知道「方才發生什麼」——逃跑後敵人追上/再遇時承接劇情、不當初次見面。`narrate_only` 後端只吃 promptText，所以前情是在前端拼進去的(零後端改動)。
- **鑑賞**：`enterKanshou`(主入口)/`claimGrail`/`renderHeroList`／👥同伴面板 `openCompanions/kanshouAdd/kanshouRemove`。(舊 `openGallery/enterGallery` 已退役)
- **逆天改命**（玩家改自己御主資料）：`openFateEdit`/`saveFate`→`actionUpdateFate`。**只准改 4 種敘事欄、數值與寶具一律鎖死**(GAS掌數值)：`back`身世(限30)/`intent`萌點(限30)/`trait`特徵(4格×20)/`pref`個性(4格×20)。特徵4格=外貌/氣質舉止/自稱與口氣/卸下心防的私密一面(末格＝鑑賞慾海的親密種子，NSFW 消費在 Router 2406 `[床笫之間的反應]`)；個性4格=日常表象/真實內裡/喜歡/討厭。改別人(NPC)需好感100+已傾心，改自己免條件(solo 只碰自己)。數值編輯是九州 full 的 breakthrough/cultivate，solo 不露出。

---

## 13. 已完成的四大區塊（本專案進度）

①戰鬥職階相剋＋寶具專屬(Engine_Fate) ②正典劇情橋段(Seed_Canon) ③戰爭規則含結盟(同盟系統) ④日常與羈絆(bond/補魔/夢境/禮裝/雙從者/破戒奪僕/同盟生命週期→鑑賞)。
種子庫 36 從者＋13 御主 persona 全補完(v3)。

---

*最後更新(2026-06)：戰鬥大改(概念優先權/D&D骰/寶具規模矩陣/御主電池/寶具對轟/從者主動技/敵寶具吃魔力/十二試煉燒命/A++≠EX修正)＋solo 好感招募地圖收歸 GAS＋刪 spare_npc，並全文對照現碼校正(gallery 改 enter_kanshou、full 停用、經濟全砍)。改動前先 grep 對照，改完 node --check，慾海邊界 git diff 驗證 0 改動。*
