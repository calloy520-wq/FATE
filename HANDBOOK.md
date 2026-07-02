# 命運停駐之夜 — 工具書（全專案地圖）

> 全代碼掃描後彙整（2026-07）。給每次失憶開機的自己：**這個專案在做什麼、代碼長怎樣、能做什麼**，一份看懂。
> 三本錨檔分工：**`CLAUDE.md`**（紅線＋當前焦點）／**`DESIGN.md`**（設計鐵則·為什麼）／**本檔 `HANDBOOK.md`**（架構＋每個檔案有什麼·怎麼運作）／**`SOLO_REFERENCE.md`**（solo action/函數/schema 速查）。常數會漂，看代碼為準。

---

## 0. 一句話

把一套九州武俠 GAS 遊戲，改造成 **Fate/stay night 聖杯戰爭**（純按鍵單人）。GAS 掌全部數值、AI 只說書。部署：commit→push→GitHub Action(clasp 3.3.0) 自動推上 Google Apps Script。

## 1. 理念（雙軌 + 三鐵則）

**雙軌設計（玩家定案，別偏離）**：
- **🎴 純淨 solo（主體·SFW）**：單人聖杯戰爭，只有「按鍵＋AI 敘述」。多帳號可玩、`game_id` 實例化＋帳號綁定分流。盡量貼近原作。
- **🌹 慾海 kanshou（鑑賞後日談·NSFW）**：奪杯後與封存從者約會。一張約會大地圖，只持久化 個性/特徵/關係/外顯/肉體＋歷史因果；無經濟、無戰鬥。共用 `actionPlay` 引擎與 `nsfwBaseRules`（🔴紅線①不可改）。
- **兩個唯讀視窗**：📜 個人聖杯戰記／🏆 排行榜。

**三鐵則**：① GAS 掌所有數值（先算→寫表→再敘述）；② AI 只把已裁定結果說書、把玩家自由發揮摘成事實列，**永不決定勝負/寫數字**（LLM 輸出的硬數值一律被夾值/忽略）；③ show-don't-tell（禁直述 願望/個性/萌點 字面）。

**已砍**：經濟/生活層全部（money/商城/物品/任務/賭場/飛書/生活技能/裝備欄）。solo 全程無花錢入口。身世財力差異改由**起始禮裝**體現（存 MEMORY）。

## 2. 技術架構

```
GAS Web App (doGet→Index.html·HTML Service)
  └─ google.script.run.handleGameAction(json) → Router_Action.gs 分流器
       ├─ 數值引擎：Engine_Fate(戰鬥) / Time_World(時間·經濟) 全在 GAS
       ├─ Google Sheets（唯一資料庫·13 分頁）
       └─ UrlFetchApp → OpenRouter（google/gemini-*·只做敘述）  ← Engine_Combat.callGeminiAPI
```
- API key 存 GAS **Script Properties**（不進代碼）。
- 前端 `Index.html`(殼) 內嵌 `Style.html`(CSS) ＋ `Script.html`(全部前端 JS·單一 SPA)。

## 3. 資料層（試算表 13 分頁）

`Setup_FateWorld.gs` 冪等建表（缺就補、含則略）。分頁：**坤圖**(地圖)／**眾生**(參戰者·一列一人)／**英靈殿**(種子從者範本)／**御主殿**(種子御主範本)／**帳號**／**戰史**／**鑑賞**(奪杯封存)／**時鐘**／**因果**(事件log)／**權柄**(帳號↔角色↔居所)／**關係**(好感/盟約)／**史紀**／**歷史暫存**(逐句對話)。另有 **鑑賞眾生** 分頁（慾海活動角色，`getKanshouPcSheet_` 動態建，與戰爭主表隔離）。

### COL schema（位置索引·刪欄會位移全表→只可棄用不可刪，定義在 `Core_Settings.gs:20`）
```
PC(眾生·25欄):  ID0 NAME1 SEX2 BACK3 STATUS4 TRAIT5 LOC6 PREF7 HP8 MP9 MAX_HP10
                MAX_MP11 REALM12(棄用·寫空) MEMORY13 INTENT14 FACTION15 RANK16
                CONTRIB17(敵令咒餘量) ALIGN18 PHYSICAL19 MARTIAL20(寶具字串) GAME_ID21 SIX22 TAGS23 SEEN24
REL:  PC0 NPC1 FAV2 TAG3 IS_PARTY4 MEMORY5 MAJOR_EVENT6
MAP:  REGION0 NAME1 TYPE2 COORD3 DESC4 PARENT5
AUTH(權柄): NAME0 ID1 TITLE2 HOME_LOC3 DECOR4
HERO(英靈殿): ID0 CLS1 NAME2 SEX3 SIX4 CLASS_SKILLS5 SKILLS6 TRAITS7 NP8 PERSONA9 ALIGN10 WARS11 SOURCE12
MASTER(御主殿): ID0 NAME1 SEX2 APPEAR3 MAGIC4 CIRCUITS5 MELEE6 MAGIC_RANK7 HOME8 WISH9 PERSONA10 WAR11 SOURCE12 BACK13 MOE14
ACC(帳號): NAME0 PC1 WON2 CREATED3 BEST_DAYS4
HIST(戰史): ACC0 RESULT1 SERVANT2 SUMMARY3 TIME4
GAL(鑑賞): ACC0 NAME1 CLS2 SEX3 SIX4 TAGS5 NP6 BACK7 PREF8 MOE9 MEMOIR10 WISH11 TIME12 MASTER13 MSEX14
CLK(時鐘): GAME_ID0 DAY1 HOUR2 AP3
```
註：舊九州欄（MONEY/WEP/ARM/ACC1-2/LIFESKILL/CLS/五圍 STR~LUK）已**真的刪除並重排到 25 欄**（非保留死欄）；但 `buildPlayerStatusString` 的 `§` 字串仍填 6 個空位保前端定位（協議層佔位）。

### MEMORY 標記（存 `COL.PC.MEMORY`·全形 `｜` 分隔，讀取器須排除 `｜`）
`【願望】【魔術】【迴路】N【出身】【體術】`(御主種子) ｜ `【令咒】N`(預設3) ｜ `【試煉】N`(god_hand 復活命數·無標記預設11＝赫拉克勒斯專屬；AI 產物召喚時標3·尼祿三度輝映基準) ｜ `【模式】canon/chaos`｜`【戰爭】4th/5th/fake`｜`【扮演】<御主id>`(創角設定) ｜ `【禮裝】id`(被動禮裝) ｜ `【出力】`(靈基出力檔·預設60) ｜ `【寶具選】N`(多寶具) ｜ `【符文】`(斯卡哈) ｜ `【御主】名`/`【從者】名`(敵主從硬連結) ｜ `【海怪護盾】cur|max|expiry`(青鬍子海怪肉身) ｜ `【整備至】N`(餐buff) ｜ `【陣地】地`(工房) ｜ `【搜刮】地`(枯竭) ｜ `【盟約至】day`｜`【鑑賞緣】`(盟友90+解鎖封存) ｜ `【靈基透支】N`(令咒盡死線) ｜ `【喪失從者】名`｜`【破戒奪取】`｜`【帳號】acct`(慾海御主) ｜ NSFW：`[雙修技巧][性愛時敏感部位][專屬稱呼][親密次數][交談輪數]`。

## 4. 檔案地圖（11,700 行·22 檔·2026-07 Router_Action.gs 拆成 8 檔＋前端拆出鑑賞/開局兩檔，見 §4.1）

| 檔 | 行 | 用途 | 關鍵物 |
|---|---|---|---|
| **Router_Action.gs** | ~400 | 後端總分流器·核心(2026-07 拆成 8 檔，見下) | `ActionRouter`(dispatch表)、`handleGameAction`(14天時限攔截＋`_state`夾帶)、`sanitizeUserData_`、`actionGetTags`/`buildTagsPayload_`、`buildClientState_`/`actionSync`、`actionCheckName/GetFullStatus/UpdateFate/UpdateRelTag`(小型通用action) |
| **Router_Creation.gs** | ~400 | 創角／召喚 | `actionManualNpc`(create，2026-07 非阻塞化)、`actionBackfillMasterAi`、`actionSummonServant`、`actionGetHeroes/GetMasters` |
| **Router_Movement.gs** | ~550 | 地圖／移動／休息／偵查／搜刮／整備／工房／卸防突襲 | `actionMove`(世界先動玩家後到)、`actionRest`、`actionScout`、`actionScavenge`、`actionSetWorkshop`、`actionSecondWind`、`actionPrepMeal`、`enemyAmbushOnServant_` |
| **Router_Battle.gs** | ~910 | 戰鬥核心(單檔最大，符合「單一大關注點」) | `fateStrike_`(單次出擊裁決)、`actionFateBattle`(出戰主流程)、`drainForNp_`(御主電池)、十二試煉/令咒餘量/靈基透支死線/餐buff/海怪護盾 MEMORY 存取器 |
| **Router_Bond.gs** | ~490 | 羈絆／令咒使用／結盟／破戒奪僕／戰記／主從連結 | `actionBond`、`actionUseSeal`、結盟三部曲(`actionProposeAlliance/BreakAlliance/AllyBond`)、`actionRuleBreakSteal`、`actionWarChronicle/WarHistoryList`、`markMasterLostServant_` |
| **Router_Narrative.gs** | ~910 | AI 敘事引擎(actionPlay，solo/kanshou 共用) | `actionPlay`、`narrateWithState_`/`actionNarrateOnly`、`buildDreamPrompt_`(虛假之夢)、`actionGetEpicHistory` |
| **Router_Persona.gs** | ~80 | 演出依據卡(跨檔共用小工具，不歸屬任何領域) | `servantCard_`/`masterCard_`/`codexPersona_`/`findPlayerServantIdx_` |
| **Router_Economy.gs** | ~165 | 靈基出力／魔境／符文／寶具選／補魔 | `actionSetServantOutput/MageRealm/RuneMode/NpChoice`(樂觀更新setter)、`actionManaSupply` |
| **Script.html** | ~2700 | 前端 SPA 核心（共用機制＋戰鬥/地圖/狀態面板，遊戲進行中用到的一切） | `gasRun`/`syncData`/`applyClientState`、`servantStrike`/`renderFateBattleReport`、`refreshFateTags`/`bar`/`horrorBar`、`renderMapPane`/`buildMapSvg_`、`applyModeUI`(兩軌切換總開關，跨onboarding/kanshou共用) |
| **Script_Onboarding.html** | ~350 | 前端 SPA·登入/創角/召喚開局流程(2026-07 拆出) | `accountLogin`/`chooseWarMode`/`chooseWar`/`chooseRole`/`loadCanonMasters`/`pickCanonMaster`、`rollFate`/`checkName`/`createPC`/`backfillMasterAi`、`loadHeroes`/`doSummon`家族、`startGame`。**只在開局跑一次**，`startGame` 之後永不再被呼叫，與戰鬥/地圖零交集(天然時間邊界，見§4.1) |
| **Script_Kanshou.html** | ~150 | 前端 SPA·鑑賞(慾海)專屬(2026-07 從 Script.html 拆出) | `enterKanshou`/`openCompanions`/`kanshouAdd`/`kanshouRemove`/`changeKanshouName`/`changeKanshouSex`/`askKanshouSex`/`askKanshouSetup`。與 Script.html 共享同一頁面全域作用域(見 §4.1) |
| **Engine_Fate.gs** | 564 | 純數值戰鬥核心（D20+六圍+fx+寶具） | `resolveFateBattle_`、`rowToCombatant_`、`npAtkScale_/npDefScale_`、`NP_SCALE_MATRIX`、`CONCEPT_TIER`、`servantActiveSkill_`、`servantNpOptions_` |
| **Core_Settings.gs** | 422 | 金鑰/COL schema/六圍換算/狀態封裝/地理雷達 | `COL`、`rankVal`、`fateMaxHpMp_`/`masterMaxHpMp_`/`masterPoolMax_`、`outputTier_`、`masterSynergySix_`、`getLocalPeopleList`、`buildPlayerStatusString` |
| **Gallery.gs** | 430 | 奪杯→封存→慾海管線（NSFW軌資料層） | `actionClaimGrail`、`actionEnterKanshou`、`actionKanshou*`、`purgeGameData_`、`getKanshouPcSheet_` |
| **Time_World.gs** | 400 | 時間/AP＋御主電池經濟＋世界自走 | `getClock_`/`spendAp_`、`servantEconomy_`/`applyRegen_`、`worldTick_`、`AP_PER_DAY=12` |
| **Seed_Codex.gs** | 405 | 種子英靈(37騎)/御主(14名)名冊＋灌表/升級管線 | `SEED_SERVANTS`、`SEED_MASTERS`、`seedFateCodex_`、`upgradeCodexPersonas_`、`resyncSummonedServants_` |
| **Account.gs** | 316 | 帳號登入/存檔/清殘局/排行榜/戰史 | `actionAccountLogin`、`actionAccountNewGame`、`actionPurgeOrphans`、`actionLeaderboard`、`incrementWin_`/`recordHistory_` |
| **Seed_Rivals.gs** | 231 | 開局鋪敵（正典/混亂/偽聖杯陣容） | `FATE_5TH/4TH/FAKE_ROSTER`、`seedRivalsForGame_`、`heroToNpcRow_`/`masterToNpcRow_`、`markRivalsSeen_` |
| **Setup_FateWorld.gs** | 166 | 冪等建 13 分頁＋冬木地圖種子 | `ensureFateSheets_`、`FATE_SHEET_DEFS`、`FATE_MAP_SEED`、`doGet` 觸發 |
| **Engine_Combat.gs** | 245 | 🔴 LLM 調用核心＋NSFW 演化規則 | `buildDefaultSystemPrompt`、`callGeminiAPI`、`doGet`、`nsfwBaseRules`(紅線①) |
| **Style.html** | 594 | 全站 CSS（暗色·金色主題·三欄RWD） | `:root` 變數、`.msg-*`、`.modal-*`、`fk*` 地圖動畫、`barThrob` |
| **Index.html** | 414 | HTML 進入殼＋各屏 div | `#setup`/`#game` 兩容器、創角召喚各屏 ID、雙軌入口卡片 |
| **History_Sync.gs** | 153 | 對話歷史暫存＋因果分級保留 | `saveGameHistoryBatch`、`getGameHistory`、`pickRelevantLogs`、`IMPORTANT_LOG_TAGS` |
| **Mystic_Code.gs** | 130 | 禮裝系統（2026-06 全面被動化） | `MYSTIC_CODES`、`MC_COMBAT_`、`injectMysticBuff_`/`mcCombatFx_`、`rollMysticForMaster_` |

### 4.1 檔案拆分慣例（2026-07 定案·未來新增檔案照這個模式，別重新發明）

**為什麼能拆**：GAS 的 `.gs` 檔全部共用一個全域作用域（沒有 import/module，任何檔案的函數/變數對其他檔案都是全域可見）；`.html` 檔則靠 `doGet()` 的 `HtmlService.createTemplateFromFile('Index').evaluate()` 模板引擎，用 `<?!= HtmlService.createHtmlOutputFromFile('X').getContent(); ?>` 把多個檔案的內容**依序拼接進同一個網頁**——多個 `<script>` 區塊在同一頁面仍共享同一個 `window` 全域作用域。**結論：怎麼切檔案都不影響執行期行為，純粹是給人看的組織方式**，可以放手拆、不必擔心「切錯會不會執行不到」。

**命名慣例**：`<領域>_<子概念>.gs` / `Script_<子概念>.html`（如 `Seed_Codex.gs`、`Engine_Fate.gs`、`Script_Kanshou.html`）。**拆分準則**：
- 兩軌（solo/kanshou）分岔的功能——各自一個檔，別混在共用檔裡（範例：`Gallery.gs` 本就是鑑賞後端專屬；`Script_Kanshou.html` 是鑑賞前端專屬）。
- **有天然時間邊界**的一段流程（只在某階段跑一次，之後永不再被呼叫）——獨立成檔（範例：`Script_Onboarding.html` 只在開局跑，`startGame()` 之後與戰鬥/地圖/狀態面板零交集）。
- 一個檔案裝不下的「單一大關注點」（戰鬥引擎、種子資料、時間經濟）各自一個檔，不要塞進總路由。
- **共用機制留在核心檔**（`gasRun`/`syncData`/`applyModeUI` 等兩軌都要用、或跨階段都要用的東西），別跟著業務邏輯搬走。
- **值得停手的訊號**：如果剩下的內容彼此高度耦合（共用同一批模組層變數、互相呼叫頻繁），繼續切只是搬家、不會降低複雜度——這時就該停，不要為了切而切。

**驗證鐵則**：
1. `.gs` 新檔／搬移函數後跑 `bash check.sh`——它會**自動掃描 `gas/*.gs` 全部檔案**，新增檔案零額外設定。
2. `.html` 新檔若含 `<script>`，**檔名開頭要接在 `Script` 之後**（如 `Script_XXX.html`）——`check.sh` 用萬用比對 `gas/Script*.html`，自動抓到並用「去頭尾 `<script>`/`</script>` 剩下純 JS」的方式驗證。**不是這個命名規則就不會被驗到**，等於埋一顆只有部署後才炸的地雷（CLAUDE.md 點名的坑：CI 不查 .html JS，這裡是唯一防線）。
3. 搬移函數後用 `grep -rc "function 函數名"` 確認**新舊位置合計恰好 1 次**（零遺留、零重複定義）。
4. `.html` 拆檔別忘了在 `Index.html` 補一行 `<?!= HtmlService.createHtmlOutputFromFile('新檔名').getContent(); ?>`——不加這行，檔案存在但**永遠不會被送到瀏覽器**，是最隱蔽的失敗模式（deploy 綠燈、功能卻整個消失，且不報錯）。

## 5. 一次按鍵的生命週期（效能核心：3→1 round-trip）

1. 前端 `gasRun({action,...})` → `google.script.run.handleGameAction`。
2. `handleGameAction`：`sanitizeUserData_` 清洗 → `KPC_` 前綴御主改讀「鑑賞眾生」分頁 → **14 天時限中央攔截**（跨第14日補 defeat）→ 執行 handler。
3. handler 若在 `STATE_AFTER_ACTIONS` 白名單（fate_battle/move/rest/mana_supply/bond… 凡前端事後會整頁刷新者）→ 回應**自動夾帶 `_state = buildClientState_()`**（完整刷新 blob：statusString/people/locations/clock/ap/economy/tags，整表＋關係表各只讀一次）。
4. 前端 `gasRun` 把 `_state` 存進 `__pendingState`；handler 照常渲染戰報/敘事，呼 `syncData(true)` → **偵測 `__pendingState` 存在便直接 `applyClientState`，免再打 sync**（2→1）。`tags` 也夾在裡面 → 免再打 `get_tags`（3→1）。
5. 純 UI 微調（出力轉盤 `setServantOutput`、姿態、字體）走**樂觀更新**：先改 DOM 再背景存，或純 localStorage 零 round-trip。
> 🧭 鐵則：別把多餘 round-trip 或重複整表讀回加回來。

## 6. 戰鬥引擎 `resolveFateBattle_(atk,def,opts)`（Engine_Fate·嚴格順序管線）

一次交手回 `{atkWins,winner,loser,damage,aRoll,dRoll,aHit,dEva,fired[],crit}`。`fired[]` 是本回合**實際觸發**的標籤名，只有它餵給 AI 說書。

**管線順序（改順序＝改平衡）**：
1. **執行殺早退**：`ea`(認真·自身血≤40%) / `wealth`(黃金律·≤20%) → `rankVal(寶具)*4 + 骰 + 200` 直接必勝（上游 `actionFateBattle` 補魔閘把關）。
2. **命中 `aHit` vs 迴避 `dEva`**：各 `D20 + rankTier(屬性)*2.5 + 隨機 + 出力修正`。攻方屬性看職階(`combatProfile_`：Caster魔力/Archer敏捷/近戰敏捷)；守方 = 敏捷0.65+耐久0.35。
3. **命中端 fx**：整備餐 / 直感·心眼(unreadable封先機) / 狂化 / 自我改造 / 主動技 / **禮裝命中(mcCombatFx_)** / 騎乘 / 千里眼·投影 / 避矢(vs Archer) / 氣息遮斷(僅ambush) / 王財+5 / 燕返-5 / **三騎士相剋(Saber>Lancer>Archer>Saber ±3)** / 變化 / 愛之痣 / 石化 / 天之鎖(vs神性)。
4. **幸運旋鈕**：幸運≤D 8%失手-10、≥A 8%福星+8。
5. **gae_bolg 必中**：守方靠幸運(A+0.35/A0.22/B0.10)+直感+變化搏閃避（上限0.6）。
6. **勝負**：`gaebolg ? !gbEvaded : aHit>=dEva`。
7. **骰傷 base**：`rankVal(dmg屬性)*0.6 + rankTier d8 + |aHit-dEva|*1.2`。
8. **傷害端 fx**：出力乘子 / 怪力 / 魔力放出 / 勇猛(clear_mind免疫) / **禮裝(dmgAdd＋np時npMul如寶石劍×1.5)** / 投影連射 / 奇襲要害×1.2 / 高速詠唱 / 王財彈幕(gobVolley 50d3 EV≈83) / 天之鎖(chainVolley 18d3) / 狂化+ / 神代 / 風王鐵鎚 / 道具作成 / 無毀湖光(vs龍×1.5) / **神殺(vs神性×≤2)** / 職階相性×1.12 / 燕返×2.3。
9. **寶具 NP block**(僅opts.np)：寶具骰(`npBaseDice_` E4d10→EX24d10)＋`rankVal*1.2+35`＋軍略×1.15＋神性×1.1＋簽名效果(ubw×1.25/zabaniya×1.9+70/summon_horror×1.6+骰/ea×1.7+骰)＋**規模相剋矩陣**（見下）。
10. **令咒** `opts.seal` ×1.5。
11. **概念壓制 pierce**：`offenseTier(winner) >= conceptTier(defFx)+2` → 該防禦被無視。
12. **防禦減傷**（依序·多受pierce影響）：耐久/2 → 陣地×0.74 → 七天盾×0.6 → 疫病抗性 → 原初符文 → 神核×0.82(破魔無視) → 對魔力(A≥0.80·神代凌駕殘三成) → 城牆×0.82(僅物理) → **禮裝承受寶具減傷(avalon×0.82/mercury×0.88·不受pierce)**。
13. **保底 max(1)＋暴擊**(擲20多骰一輪+12)。

### 寶具規模相剋矩陣 `NP_SCALE_MATRIX`（列=攻·欄=防）
```
        對人防 對軍防 對城防 對界防
對人攻   1.00  0.75  0.50  0.40
對軍攻   1.25  1.00  0.75  0.50
對城攻   1.50  1.30  1.00  0.60
對界攻   1.70  1.50  1.30  1.00
```
攻擊規模由寶具名關鍵字或 `ea/excalibur/ubw/summon_horror` 推定；防禦規模：`c.horrorUp`(🐙海怪在場·變身態)或 `wall_def`=對城、`territory`=對軍，其餘對人。※2026-07：對城防由「有 summon_horror fx 恆給」改綁「海怪實際在場」(見 §變身框架)。特判：`對神`(弒神寶具·vs神性×2.4)、`疫病 vs 病死宿命`×3.0。

### 概念位階 `CONCEPT_TIER`（PIERCE_GAP=2）
`ea:6 ＞ excalibur/divine_age/rule_breaker:5 ＞ ubw/anti_magic_lance/gae_bolg:4 ＞ god_hand/tsubame/zabaniya/petrify:3 ＞ nullify_magic/divine_core/territory:2`。

### 🔋 出力電池制（御主＝唯一魔力池）
從者**無自有魔力池**，與御主共用一池（存御主MP，上限 `masterPoolMax_`=迴路×6＋從者魔力×2）。從者有「靈基出力檔位」旋鈕(20~100%·`OUTPUT_TIERS_`)，持續抽御主MP維持；放寶具須100%全開＋付 `npPranaCost_`(E40→EX300，`drainForNp_`：MP不足焚御主血2:1)。池見底→**被動燃血**(`applyRegen_`：缺口÷2 全額扣【御主】HP·從者不扣血·2026-07 玩家定案)。回魔三態：♻️自然(靈脈/休息·`applyRegen_`)／💧補魔(`mana_supply`·永久燒迴路·血上限↓)／🩸燃血(被動)。

## 7. 禮裝（`Mystic_Code.gs`·2026-06 全面被動化）

持有即戰鬥自動加持我方從者，**無主動發動/充能/迴路門檻**。`injectMysticBuff_` 在 `actionFateBattle` 三處把 `{n,r,fx}` 注入我方從者(atkC開場對轟／每回合sC／fateStrike_ defC守方)，引擎 `mcCombatFx_` 讀 `MC_COMBAT_` 三通道套用。創角依財力機率給(`rollMysticForMaster_`)。

| id | fx | 效果(MC_COMBAT_) |
|---|---|---|
| 黑鍵 | mc_blackkey | 命中+2 |
| 魔力儲存寶石 | mc_jewel_minor | 命中+1·傷+10 |
| 起源彈 | mc_origin | 命中+3·傷+8 |
| 月靈髓液 | mc_mercury | 命中+4·承受寶具×0.88 |
| 寶石劍 Zelretch | mc_jewel | 解放寶具傷×1.5 |
| 全世界之鞘 Avalon | avalon | 承受寶具×0.82＋時回×1.6 |
| 破戒全咒 | rule_break | special·斬契奪僕(不在MC_COMBAT_) |

## 8. 三軌模式 + 鑑賞管線

`applyModeUI()` 總開關：**solo**(FATE單人戰爭·主體)／**full**(九州全模擬·停用)／**kanshou**(鑑賞約會)。
- **創角→召喚→開戰**：登入→新局(清舊檔)→正史/混亂→戰爭(4th/5th/fake)→扮正典御主/自創→取名→締約(命運測定3骰前端擲)→`create`(AI生御主一次寫入)→`summon_servant`(英靈殿實體化 或 AI原創·`seedRivalsForGame_`鋪敵)。
- **敵方陣容**：`FATE_5TH/4TH_ROSTER`(正典7組)或`FATE_FAKE_ROSTER`(偽聖杯)或chaos洗牌；扮演的御主那組/奪取的從者那組移除；主從硬連結`【御主】/【從者】`。
- **世界自走 `worldTick_`**：每次推進時間，敵御主35%移位、暗處從者供魔崩潰/廝殺殞落(保底WORLD_FLOOR_=4)、令咒透支到期崩解；玩家僅以「傳聞」(戰爭迷霧SEEN)得知。
- **結局**：全滅→假夢(依願望)→老虎道場→寫史→清局；奪杯→`actionClaimGrail`(AI生後日談→寫「鑑賞」表→`purgeGameData_`清局)→進慾海(`actionEnterKanshou`·`KPC_`御主avatar邀`KSV_`封存從者約會)。

## 9. 紅線 · 部署 · 工作流程

**🚨 紅線**：① `Engine_Combat.gs` 的 `nsfwBaseRules`＋整套 NSFW 一律不可改（改鄰近處事後 `git diff | grep nsfwBaseRules` 須0）；② `calloy520-wq/GAS`(原始九州) 一字不碰，但 FATE 內九州衍生碼可清可改；③ show-don't-tell；④ 只在 `claude/fate-error-review-w8q42w` 開發；⑤ model id 不進 repo；⑥ commit footer 固定。

**驗證**：改完必跑 `bash check.sh`（驗所有 .gs ＋ Script.html 內嵌 JS·CI 不檢查 .html JS）。
**部署**：push 該分支 → GitHub Action(clasp 3.3.0·`clasp push -f`) 自動覆蓋上 GAS。
**紀律**：改代碼順手更新 `SOLO_REFERENCE.md`／本檔（新增 action/函數/MEMORY標記/schema 欄位時回補）。

**🛠️ 工程準則（最高價值觀·詳見 `CLAUDE.md`）**：**穩健・快速・易擴充・易維護，永遠從根源解、不做臨時應變方案。** 資料驅動優先（查表勝 if 鏈）、單一真實來源、複用引擎機制不加特例、守 3→1 round-trip、發現舊做法錯就重構掉（別疊補丁）。

## 10. 已知遺產/待辦（掃描發現）

- `COL.PC.REALM`：階級系統移除後恆寫空字串，但 COL 位置索引不可刪，維持棄用。
- `actionGetMasters` 對 `fake`/`chaos` 戰爭回傳 5th 名冊；`seedRivalsForGame_` fake 分支不理 `【扮演】`——目前前端觸發不到（latent），未來若開放 fake 扮演須補。
- `dev_seed_gallery`(Gallery·自標【DEV·待移除】)／`dev_resync_codex`(套最新平衡·可留)：DEV 工具，確認慾海穩定後可清前者。
- `RESEED_VER`/`CODEX_PERSONA_VER`：一次性遷移旗標，旗標守門下無效能損失，保留無害。
