# 命運停駐之夜 — 工具書（全專案地圖）

> 全代碼掃描後彙整（2026-07）。給每次失憶開機的自己：**這個專案在做什麼、代碼長怎樣、能做什麼**，一份看懂。
> 錨檔分工：**`CLAUDE.md`**（紅線＋當前焦點）／**`DESIGN.md`**（設計鐵則·為什麼）／**本檔 `HANDBOOK.md`**（架構＋每個檔案有什麼·怎麼運作）／🌹**`KANSHOU_REFERENCE.md`**（鑑賞唯一現況真相·動鑑賞先看這本）／**`SOLO_REFERENCE.md`**（solo action/函數/schema 速查）／**`AI_PROMPT_MAP.md`**（每個 action↔按鈕↔handler↔送 AI 的 prompt 全景）。常數會漂，看代碼為準。
>
> 🌹 **鑑賞現況一律以 `KANSHOU_REFERENCE.md` 為準**——本檔的鑑賞段落若與該本衝突，以該本為真（本檔部分鑑賞描述可能過時）。

---

## 0. 一句話

把一套九州武俠 GAS 遊戲，改造成 **Fate/stay night 聖杯戰爭**（純按鍵單人）。GAS 掌全部數值、AI 只說書。部署：commit→push→GitHub Action(clasp 3.3.0) 自動推上 Google Apps Script。

## 1. 理念（雙軌 + 三鐵則）

**雙軌設計（玩家定案，別偏離）**：
- **🎴 純淨 solo（主體·SFW）**：單人聖杯戰爭，只有「按鍵＋AI 敘述」。多帳號可玩、`game_id` 實例化＋帳號綁定分流。盡量貼近原作。
- **🌹 慾海 kanshou（鑑賞後日談·NSFW）**：奪杯後與封存從者約會。一張約會大地圖，只持久化 個性/特徵/關係/外顯/肉體＋歷史紀錄（「歷史暫存」逐句對話，驅動敘事連續性）；無戰鬥。共用 `actionPlay` 引擎與 `nsfwBaseRules`（🔴紅線①不可改）。⚠ 「因果」(事件log) 機制已於 2026-07 整套刪除，與此處持久化的「歷史紀錄」是不同機制。⚠ 經濟層（金錢/打工/房租/商店）＋房東房客世界觀**已於 2026-07 再度全刪**（曾短暫恢復又推翻，見 `CLAUDE.md`）——kanshou 現與 solo 一樣全程無花錢入口。⚠ 2026-07 §91「駐留制」大改版：kanshou 已無「同行」概念，改純 `LOC`(所在地點)判定「誰在場」。詳見 `KANSHOU_REFERENCE.md`。
- ⚠ **2026-07 玩家定案(推翻舊方針)**：原本的兩個唯讀視窗（📜 個人聖杯戰記／🏆 排行榜）已全數砍除——單人專注，不做跨帳號回顧比拼。連帶「戰史」表、`incrementWin_`/`recordHistory_`/`recordWinSpeed_`/`actionLeaderboard`/`actionGetVictoryHistory` 一併刪除，帳號表 WON/BEST_DAYS 欄砍除。

**三鐵則**：① GAS 掌所有數值（先算→寫表→再敘述）；② AI 只把已裁定結果說書、把玩家自由發揮摘成事實列，**永不決定勝負/寫數字**（LLM 輸出的硬數值一律被夾值/忽略）；③ show-don't-tell（禁直述 願望/個性/萌點 字面）。

**已砍**：經濟/生活層全部（money/商城/物品/任務/賭場/飛書/生活技能/裝備欄）。solo 全程無花錢入口。身世財力差異改由**起始禮裝**體現（存 MEMORY）。

## 2. 技術架構

```
GAS Web App (doGet→Index.html·HTML Service)
  └─ google.script.run.handleGameAction(json) → Router_Action.gs 分流器
       ├─ 數值引擎：Engine_Fate(戰鬥) / Time_World(時間·經濟) 全在 GAS
       ├─ Google Sheets（唯一資料庫·7 分頁，2026-07 精簡自 13 分頁）
       └─ UrlFetchApp → OpenRouter（google/gemini-*·只做敘述）  ← Engine_Combat.callGeminiAPI
```
- API key 存 GAS **Script Properties**（不進代碼）。
- 前端 `Index.html`(殼) 內嵌 `Style.html`(CSS) ＋ `Script.html`(全部前端 JS·單一 SPA)。

## 3. 資料層（試算表 7 分頁＋1 動態分頁，2026-07 精簡自 13 分頁）

`Setup_FateWorld.gs` 冪等建表（缺就補、含則略）。分頁：**坤圖**(地圖)／**眾生**(solo參戰者·一列一人)／**英靈殿**(種子從者範本，2026-07起兼職鑑賞daily欄位快取)／**御主殿**(solo專用·種子敵御主範本)／**帳號**／**歷史暫存**(逐句對話·solo/kanshou共用同一張，靠pcId前綴隔離)。另有 **鑑賞眾生** 分頁（慾海活動角色，`getKanshouPcSheet_` 動態建、schema複製自「眾生」但物理獨立，與戰爭主表完全隔離）。

⚠ **2026-07 舊分頁移除**：時鐘／權柄／關係 三表**摺進「眾生」自己這一列**（每個 game_id 世界恆只有一位御主，故 NPC 對御主的關係＝那名 NPC 自己這一列的欄位；日/時/AP/居所＝御主自己那一列的欄位，天然 1:1、無需獨立 join 表）。因果(事件log)／戰史／史紀(命運長河) 三表**直接刪除、無替代機制**（單人專注，不留跨局回顧資料，見 §11）。
⚠ **「鑑賞」(GAL) 分頁已整條移除(2026-07)**：這是舊版「奪杯封存→邀請」流程的封存表，該流程已整套被「英靈殿直接召喚」(`actionKanshouSummonHero`)取代，稽核確認全代碼庫查無任何讀寫者(是徹底的死表，非仍在使用中的活表)——`COL.GAL`(Core_Settings.gs)與`FATE_SHEET_DEFS["鑑賞"]`(Setup_FateWorld.gs)已直接刪除schema定義，`ensureFateSheets_`從此不再建這張表。若舊試算表本體仍存在這張分頁，程式碼移除不會自動刪除實體分頁，留著空分頁無害，可自行手動刪除。§8 的鑑賞管線敘述已依此更新。

### COL schema（位置索引·刪欄會位移全表→只可棄用不可刪，定義在 `Core_Settings.gs` 開頭 `const COL`）
```
PC(眾生·33欄，2026-07 折表後·鑑賞眾生同一份schema):
                ID0 NAME1 SEX2 BACK3 STATUS4 TRAIT5 LOC6 PREF7 HP8 MP9 MAX_HP10
                MAX_MP11 MEMORY12 INTENT13 FACTION14 RANK15
                CONTRIB16(敵令咒餘量·solo專用) ALIGN17 PHYSICAL18(慾海肉體外顯) MARTIAL19(寶具字串·solo專用) GAME_ID20 SIX21(solo專用) TAGS22(solo專用) SEEN23(solo專用)
                🆕 關係欄(原 REL 表·這名 NPC 對本世界御主的關係，御主自己這列留空)：
                  BOND24(好感0-100) REL_TAG25 IS_PARTY26(solo同行旗標·鑑賞不用改判LOC) MEMOIR27(🌹鑑賞共同回憶·原MAJOR_EVENT死欄復用·AI每回合memory·cap10·★釘選) REL_MEM28(關係專屬記憶/態度/專屬稱呼)
                🆕 世界狀態欄(原 CLK/AUTH 表·只在solo御主自己那一列有意義，鑑賞恆不用)：
                  DAY29 HOUR30 AP31 HOME_LOC32(居所·工房加成)
MAP:  REGION0 NAME1 TYPE2 COORD3 DESC4 PARENT5 WAR6(4th/5th戰爭限定節點過濾用·solo專用)
HERO(英靈殿，2026-07 起17欄): ID0 CLS1 NAME2 SEX3 SIX4 CLASS_SKILLS5 SKILLS6 TRAITS7 NP8 PERSONA9(戰時persona JSON·內含dailyBack等新增鍵) ALIGN10 WARS11 SOURCE12(seed/ai_gen)
                🌹 DAILY_LOOK13/DAILY_WORDS14/DAILY_MOE15/DAILY_OUTFIT16(2026-07新增·鑑賞專用「日常化」快取，solo戰爭完全不讀這4欄，solo讀的是PERSONA JSON內的戰時look/words/moe)
MASTER(御主殿·solo專用rival codex，鑑賞companion走英靈殿不走這張): ID0 NAME1 SEX2 APPEAR3 MAGIC4 CIRCUITS5 MELEE6 MAGIC_RANK7 HOME8 WISH9 PERSONA10 WAR11 SOURCE12 BACK13 MOE14
ACC(帳號·4欄): NAME0 PC1(solo御主連結) CREATED2 KPC3(🌹2026-07新增·鑑賞御主avatar連結，與PC分開兩欄、互不覆寫)
※ GAL(鑑賞封存·舊版奪杯封存表)：2026-07 已確認全代碼庫無讀寫者並整條移除schema定義，不再是COL的一部分。
```
註：舊九州欄（MONEY/WEP/ARM/ACC1-2/LIFESKILL/CLS/五圍 STR~LUK）與 2026-07 折表前的獨立 REL/CLK/AUTH/HIST 表已**真的刪除**（非保留死欄）；`REALM` 死欄亦於 2026-07 真的移除。`buildPlayerStatusString` 的 `§` 字串仍填 6 個空位保前端定位（協議層佔位）。COL.PC 每欄「solo專用/鑑賞專用/共用」的完整逐欄標註，見 §12。

### MEMORY 標記（存 `COL.PC.MEMORY`·全形 `｜` 分隔，讀取器須排除 `｜`）
`【願望】【魔術】【迴路】N【出身】【體術】`(御主種子·2026-07起體術/魔術不再只寫不讀——`masterCard_`/`enemyMasterCard_`讀進演出卡當能力描述，體術另外經`injectMasterMeleeSupport_`給玩家側從者真實戰鬥支援傷害，見§6步驟8) ｜ `【令咒】N`(預設3) ｜ `【試煉】N`(god_hand 復活命數·無標記預設11＝赫拉克勒斯專屬；AI 產物召喚時標3·尼祿三度輝映基準) ｜ `【模式】canon/chaos`｜`【戰爭】4th/5th/fake`｜`【扮演】<御主id>`(創角設定) ｜ `【禮裝】id`(被動禮裝) ｜ `【出力】`(靈基出力檔·預設60) ｜ `【寶具選】N`(多寶具) ｜ `【符文】`(斯卡哈) ｜ `【御主】名`/`【從者】名`(敵主從硬連結) ｜ `【海怪護盾】cur|max|expiry`(青鬍子海怪肉身) ｜ `【整備至】N`(餐buff) ｜ `【陣地】地`(工房) ｜ `【搜刮】地`(枯竭) ｜ `【盟約至】day`｜`【鑑賞緣】`(盟友90+解鎖封存) ｜ `【靈基透支】N`(令咒盡死線) ｜ `【喪失從者】名`｜`【破戒奪取】`｜`【羈絆里程碑】30,60`(該NPC自己列·記錄已演出過的BOND門檻，2026-07新增)｜`【帳號】acct`(慾海御主) ｜ NSFW：`[雙修技巧][專屬稱呼]`(`[交談輪數]`2026-07隨log_summary一併移除；`[性愛時敏感部位]`/`[親密次數]`2026-07隨「窺視神髓」UI面板一併移除——那是這兩者唯一的消費者，面板拿掉後即成死欄)。

## 4. 檔案地圖（11,700 行·22 檔·2026-07 Router_Action.gs 拆成 8 檔＋前端拆出鑑賞/開局兩檔，見 §4.1）

📖 **逐函式清單見 `FUNCTION_MANUAL.md`**（2026-07 全專案 13 組並行稽核建立：每個函式一行用途＋呼叫關係，含 ActionRouter 完整對照表，grep 前先查這份省時間）。下表只列每檔重點函式，完整清單以該檔為準。

| 檔 | 行 | 用途 | 關鍵物 |
|---|---|---|---|
| **Router_Action.gs** | ~400 | 後端總分流器·核心(2026-07 拆成 8 檔，見下) | `ActionRouter`(dispatch表)、`handleGameAction`(14天時限攔截＋`_state`夾帶)、`sanitizeUserData_`、`actionGetTags`/`buildTagsPayload_`、`buildClientState_`/`actionSync`、`actionCheckName/GetFullStatus/UpdateFate/UpdateRelTag`(小型通用action) |
| **Router_Creation.gs** | ~400 | 創角／召喚 | `actionManualNpc`(create，2026-07 非阻塞化)、`actionBackfillMasterAi`、`actionSummonServant`、`actionGetHeroes/GetMasters` |
| **Router_Movement.gs** | ~550 | 地圖／移動／休息／偵查／搜刮／整備／工房／卸防突襲 | `actionMove`(世界先動玩家後到)、`actionRest`、`actionScout`、`actionScavenge`、`actionSetWorkshop`、`actionSecondWind`、`actionPrepMeal`、`enemyAmbushOnServant_` |
| **Router_Battle.gs** | ~910 | 戰鬥核心(單檔最大，符合「單一大關注點」) | `fateStrike_`(單次出擊裁決)、`actionFateBattle`(出戰主流程)、`drainForNp_`(御主電池)、十二試煉/令咒餘量/靈基透支死線/餐buff/海怪護盾 MEMORY 存取器 |
| **Router_Bond.gs** | ~490 | 羈絆／令咒使用／結盟／破戒奪僕／主從連結 | `actionBond`、`actionUseSeal`、結盟三部曲(`actionProposeAlliance/BreakAlliance/AllyBond`)、`actionRuleBreakSteal`、`markMasterLostServant_`。⚠ 2026-07：`actionWarChronicle/WarHistoryList`(「戰記」)已整套刪除 |
| **Router_Narrative.gs** | ~910 | AI 敘事引擎(actionPlay，solo/kanshou 共用) | `actionPlay`、`narrateWithState_`/`actionNarrateOnly`、`buildDreamPrompt_`(虛假之夢)。⚠ 2026-07：`actionGetEpicHistory`(「史紀」命運長河面板)已整套刪除 |
| **Router_Persona.gs** | ~80 | 演出依據卡(跨檔共用小工具，不歸屬任何領域) | `servantCard_`/`masterCard_`/`codexPersona_`/`findPlayerServantIdx_` |
| **Router_Economy.gs** | ~165 | 靈基出力／魔境／符文／寶具選／補魔 | `actionSetServantOutput/MageRealm/RuneMode/NpChoice`(樂觀更新setter)、`actionManaSupply` |
| **Script.html** | ~2700 | 前端 SPA 核心（共用機制＋戰鬥/地圖/狀態面板，遊戲進行中用到的一切） | `gasRun`/`syncData`/`applyClientState`、`servantStrike`/`renderFateBattleReport`、`refreshFateTags`/`bar`/`horrorBar`、`renderMapPane`/`buildMapSvg_`、`applyModeUI`(兩軌切換總開關，跨onboarding/kanshou共用) |
| **Script_Onboarding.html** | ~350 | 前端 SPA·登入/創角/召喚開局流程(2026-07 拆出) | `accountLogin`/`chooseWarMode`/`chooseWar`/`chooseRole`/`loadCanonMasters`/`pickCanonMaster`、`rollFate`/`checkName`/`createPC`/`backfillMasterAi`、`loadHeroes`/`doSummon`家族、`startGame`。**只在開局跑一次**，`startGame` 之後永不再被呼叫，與戰鬥/地圖零交集(天然時間邊界，見§4.1) |
| **Script_Kanshou.html** | ~150 | 前端 SPA·鑑賞(慾海)專屬(2026-07 從 Script.html 拆出) | `enterKanshou`/`openCompanions`/`kanshouSummonHero`/`changeKanshouName`/`changeKanshouSex`/`askKanshouSex`/`askKanshouSetup`。2026-07「加入這個世界的感覺」定案後拿掉「請走」(`kanshouRemove`)，召喚沒有隊伍容量上限。與 Script.html 共享同一頁面全域作用域(見 §4.1) |
| **Engine_Fate.gs** | 564 | 純數值戰鬥核心（D20+六圍+fx+寶具） | `resolveFateBattle_`、`rowToCombatant_`、`npAtkScale_/npDefScale_`、`NP_SCALE_MATRIX`、`CONCEPT_TIER`、`servantActiveSkill_`、`servantNpOptions_` |
| **Core_Settings.gs** | 422 | 金鑰/COL schema/六圍換算/狀態封裝/地理雷達 | `COL`、`rankVal`、`fateMaxHpMp_`/`masterMaxHpMp_`/`masterPoolMax_`、`outputTier_`、`masterSynergySix_`、`getLocalPeopleList`、`buildPlayerStatusString` |
| **Gallery.gs** | 430 | 🌹慾海(鑑賞)軌資料層＋進場/召喚/AI深化（`nsfwBaseRules`＋`actionPlay` 集中於此·奪杯封存已砍） | `actionEnterKanshou`、`actionKanshouSummonHero`、`actionPlay`、`purgeGameData_`、`getKanshouPcSheet_` |
| **Time_World.gs** | 400 | 時間/AP＋御主電池經濟＋世界自走 | `getClock_`/`spendAp_`、`servantEconomy_`/`applyRegen_`、`worldTick_`、`AP_PER_DAY=12` |
| **Seed_Codex.gs** | 405 | 種子英靈(37騎)/御主(14名)名冊＋灌表/升級管線 | `SEED_SERVANTS`、`SEED_MASTERS`、`seedFateCodex_`、`upgradeCodexPersonas_`、`resyncSummonedServants_` |
| **Account.gs** | 316 | 帳號登入/存檔/清殘局 | `actionAccountLogin`、`actionAccountNewGame`、`actionPurgeOrphans`。⚠ 2026-07：排行榜/戰史相關 `actionLeaderboard`/`actionGetVictoryHistory`/`incrementWin_`/`recordHistory_`/`recordWinSpeed_` 已整套刪除（單人專注，不做跨帳號回顧） |
| **Seed_Rivals.gs** | 231 | 開局鋪敵（正典/混亂/偽聖杯陣容） | `FATE_5TH/4TH/FAKE_ROSTER`、`seedRivalsForGame_`、`heroToNpcRow_`/`masterToNpcRow_`、`markRivalsSeen_` |
| **Setup_FateWorld.gs** | 166 | 冪等建 7 分頁(2026-07 精簡自 13 分頁)＋冬木地圖種子 | `ensureFateSheets_`、`FATE_SHEET_DEFS`、`FATE_MAP_SEED`、`doGet` 觸發 |
| **Engine_Combat.gs** | 245 | 🔴 LLM 調用核心＋NSFW 演化規則 | `buildDefaultSystemPrompt`、`callGeminiAPI`、`doGet`、`nsfwBaseRules`(紅線①) |
| **Style.html** | 594 | 全站 CSS（暗色·金色主題·三欄RWD） | `:root` 變數、`.msg-*`、`.modal-*`、`fk*` 地圖動畫、`barThrob` |
| **Index.html** | 414 | HTML 進入殼＋各屏 div | `#setup`/`#game` 兩容器、創角召喚各屏 ID、雙軌入口卡片 |
| **History_Sync.gs** | 153 | 對話歷史暫存(逐句對話，驅動聊天記錄/敘事連續性) | `saveGameHistoryBatch`、`getGameHistoryBatchRaw`、`getGameHistory`。⚠ 2026-07：「因果」(事件log)機制已整套刪除——`pickRelevantLogs`/`readRecentLogRows`/`formatCausalityEntry`/`pickNsfwCausalityEvent`/`trimLogRowsByOwner`/`IMPORTANT_LOG_TAGS` 全數移除，`actionPlay` 提示詞不再組「前塵因果」段；此與仍保留的「歷史暫存」是兩套不同機制 |
| **Mystic_Code.gs** | ~100 | 禮裝系統（2026-06 全面被動化） | `MYSTIC_CODES`、`MC_COMBAT_`、`injectMysticBuff_`/`mcCombatFx_`。⚠ 2026-07：`rollMysticForMaster_`/`pickByTier_`(創角改玩家自選後零呼叫的死碼)已移除 |

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
3. **命中端 fx**：整備餐 / 直感·心眼(unreadable封先機) / 狂化 / 自我改造 / 主動技 / **禮裝命中(mcCombatFx_)** / 騎乘 / 千里眼·投影 / 避矢(vs Archer) / 氣息遮斷(僅ambush) / 王財+5 / 燕返-5(僅每場第1回合) / **三騎士相剋(Saber>Lancer>Archer>Saber ±3)** / 變化 / 愛之痣 / 石化 / 天之鎖(vs神性)。**🎚️ 被動技能 fx 淨加成 clamp ±HIT_FX_CAP(=8·2026-07)**——攻方命中fx/守方迴避fx各自加總後夾上限(出力/整備/主動技/禮裝/職階相剋/幸運骰/奇襲不入帳)，堆疊流無法把差距拉到「永遠打不到」。
4. **幸運旋鈕**（2026-07 線性化）：以 C 為零點每離 1 階 ±2% 機率——低於 C 失手-10、高於 C 福星+8（E4%/D2%/C0/B2%/A4%/EX6%）。
5. **gae_bolg 必中**：守方靠幸運(A+0.35/A0.22/B0.10)+直感+變化搏閃避（上限0.6）。
6. **勝負**：`gaebolg ? !gbEvaded : aHit>=dEva`。
7. **骰傷 base**：`rankVal(dmg屬性)*0.6 + rankTier d8 + |aHit-dEva|*1.2`。
8. **傷害端 fx**：出力乘子 / 怪力 / 魔力放出 / 勇猛(clear_mind免疫) / **禮裝(dmgAdd／np時npDefMul如Avalon×0.82減傷)** / 投影連射 / 奇襲要害×1.2 / 高速詠唱 / 王財彈幕(gobVolley 50d3 EV≈83) / 天之鎖(chainVolley 18d3) / 狂化+ / 神代 / 風王鐵鎚 / 道具作成 / **御主體術(master_melee·dmgAdd 7×rankMul_，2026-07新增，見下)** / **御主魔術(master_magic·同公式，僅出擊從者為Caster時注入)**(兩者2026-07起雙方皆生效——敵從者透過`enemyMasterMemoryFor_`反查硬連結敵御主的體術/魔術，不再只有玩家側吃得到) / 無毀湖光(vs龍×1.5) / **神殺(vs神性×≤2)** / 職階相性×1.12 / 燕返×2.3(普攻限定·**僅每場第1回合**·解放時無疊乘只留演出標籤)。
9. **寶具 NP block**(僅opts.np)：寶具骰(`npBaseDice_` E4d10→EX24d10)＋`rankVal*1.2+35`＋軍略×1.15＋神性×1.1＋簽名效果(ubw×1.25/zabaniya×1.9+70/summon_horror×1.6+骰/ea×1.7+骰)＋**規模相剋矩陣**（見下）。
10. **令咒** `opts.seal` ×1.5。
11. **概念壓制 pierce**：`offenseTier(winner) >= conceptTier(defFx)+2` → 該防禦被無視。
12. **防禦減傷**（依序·多受pierce影響）：耐久/2 → 陣地×0.74 → 七天盾(**僅對寶具解放反應**·×0.6@C·玩家側展開扣御主30魔/次·付不起張不開) → 疫病抗性 → 原初符文 → 神核×0.82(破魔無視) → 對魔力(A≥0.80·神代凌駕殘三成) → 城牆×0.82(僅物理) → **禮裝承受寶具減傷(avalon×0.82/mercury×0.88·不受pierce)**。
13. **保底 max(1)＋暴擊**(擲20多骰一輪+12)。

### 寶具規模相剋矩陣 `NP_SCALE_MATRIX`（列=攻·欄=防）
```
        對人防 對軍防 對城防 對界防
對人攻   1.00  0.75  0.50  0.40
對軍攻   1.25  1.00  0.75  0.50
對城攻   1.50  1.30  1.00  0.60
對界攻   1.70  1.50  1.30  1.00
```
攻擊規模由寶具名關鍵字或 `ea/excalibur/ubw/summon_horror` 推定；防禦規模：`c.horrorUp`(🐙海怪在場·變身態)=對城、`territory`=對軍，其餘對人。※2026-07：對城防由「有 summon_horror fx 恆給」改綁「海怪實際在場」；`wall_def` 一併移出規模表(本職＝物理減傷×0.82·恆給對城規模會架空海怪變身＋讓 AI 自訂掛牆砍半對人寶具)。特判：`對神`(弒神寶具·vs神性×2.4)、`疫病 vs 病死宿命`×3.0。

### 概念位階 `CONCEPT_TIER`（PIERCE_GAP=2）
`ea:6 ＞ excalibur/divine_age/rule_breaker:5 ＞ ubw/anti_magic_lance/gae_bolg:4 ＞ god_hand/tsubame/zabaniya/petrify:3 ＞ nullify_magic/divine_core/territory:2`。

### 🔋 出力電池制（御主＝唯一魔力池）
從者**無自有魔力池**，與御主共用一池（存御主MP，上限 `masterPoolMax_`=迴路×10＋從者魔力×2）。從者有「靈基出力檔位」旋鈕(20~100%·`OUTPUT_TIERS_`)，持續抽御主MP維持；放寶具須100%全開＋付 `npPranaCost_`(E40→EX300，`drainForNp_`：MP不足焚御主血2:1)。池見底→**被動燃血**(`applyRegen_`：缺口÷2 全額扣【御主】HP·從者不扣血·2026-07 玩家定案)。回魔三態：♻️自然(靈脈/休息·`applyRegen_`)／💧補魔(`mana_supply`·永久燒迴路·血上限↓)／🩸燃血(被動)。

## 7. 禮裝（`Mystic_Code.gs`·2026-06 全面被動化）

持有即戰鬥自動加持我方從者，**無主動發動/充能/迴路門檻**。`injectMysticBuff_` 在 `actionFateBattle` 三處把 `{n,r,fx}` 注入我方從者(atkC開場對轟／每回合sC／fateStrike_ defC守方)，引擎 `mcCombatFx_` 讀 `MC_COMBAT_` 三通道套用。**創角玩家自選**(2026-07)，不看財力/迴路——`rollMysticForMaster_`(財力機率版)現無呼叫者，保留給未來「戰中掉落」用途。**2026-07 玩家定案砍3項**：起源彈/月靈髓液/寶石劍已移除。

| id | fx | 效果(MC_COMBAT_) |
|---|---|---|
| 黑鍵 | mc_blackkey | 命中+2 |
| 魔力儲存寶石 | mc_jewel_minor | 命中+1·傷+10 |
| 全世界之鞘 Avalon | avalon | 承受寶具×0.82＋時回×1.6 |
| 破戒全咒 | rule_break | special·斬契奪僕(不在MC_COMBAT_) |

## 8. 三軌模式 + 鑑賞管線

`applyModeUI()` 總開關：**solo**(FATE單人戰爭·主體)／**full**(九州全模擬·停用)／**kanshou**(鑑賞約會)。
- **創角→召喚→開戰**：登入→新局(清舊檔)→正史/混亂→戰爭(4th/5th/fake)→扮正典御主/自創→取名→締約(命運測定3骰前端擲)→`create`(AI生御主一次寫入)→`summon_servant`(英靈殿實體化 或 AI原創·`seedRivalsForGame_`鋪敵)。
- **敵方陣容**：`FATE_5TH/4TH_ROSTER`(正典7組)或`FATE_FAKE_ROSTER`(偽聖杯)或chaos洗牌；扮演的御主那組/奪取的從者那組移除；主從硬連結`【御主】/【從者】`。
- **世界自走 `worldTick_`**：每次推進時間，敵御主35%移位、暗處從者供魔崩潰/廝殺殞落(保底WORLD_FLOOR_=4)、令咒透支到期崩解；玩家僅以「傳聞」(戰爭迷霧SEEN)得知。
- **結局**：全滅→假夢(依願望)→老虎道場→寫史→清局(`actionEndRun`，僅清資料·不再寫任何鑑賞相關表)。

**⚠ 鑑賞管線已於 2026-07 整個換掉，不再是「奪杯封存→邀請」流程**——舊版 `actionClaimGrail`/「鑑賞」(GAL)封存表/`KSV_`封存從者邀請三者皆已死(GAL表查無讀寫者，見 §3)。**現行管線**：
- `enter_kanshou`(`actionEnterKanshou`)：每帳號唯一常駐後日談世界，首次進入才建立`KPC_`御主avatar(帳號表`COL.ACC.KPC`欄結構性連結，`kanshouOwnedRowIdx_`每次操作前驗證所有權)，之後永遠直接接續，不重講開場。
- `kanshou_summon_hero`(`actionKanshouSummonHero`)：**不需先在solo打贏一場戰爭**，直接從「英靈殿」codex挑一位召喚，`heroToKanshouRow_`建列(`KHV_`前綴)——刻意不帶任何戰鬥資料(SIX/TAGS/MARTIAL留空)，改讀該英靈的「日常」快取欄位(`DAILY_LOOK/DAILY_WORDS/DAILY_MOE/DAILY_OUTFIT`，見§3)組出TRAIT/PREF/INTENT。**2026-07 房東房客世界觀定案**：初始好感非固定值——`KANSHOU_HOUSEMATE_ROOMS_`登記的3位房客給30(REL_TAG「房客」)，其餘給10(REL_TAG「點頭之交」，之後依`KANSHOU_REL_TIER_`5階好感自動升級稱謂)。召喚無容量上限，只能召喚一次(已存在則拒絕)。
- **2026-07 §91「駐留制」大改版(取代舊「同行」隊伍系統)**：kanshou 已完全不用`IS_PARTY`欄位——「在場」純看`LOC===當前地點`，按鍵移動不再強拉任何人同步(每個人獨立行動)，只有AI敘事內明講「一起移動」時才會同步當時已在場的人。AI prompt 詳細人物卡(`partyDetailsArr`)按好感排序取前3人，是**prompt 篇幅上限**、不是玩法容量上限——同地點第4人仍然存在、仍可被特定劇情(橋段/欠租/敲門)點名，只是不會出現在那回合的詳細卡。人物清單(`actionKanshouCompanions`/`getKanshouPeopleList_`)一律列出所有已存在角色，無此截斷。
- **橋段(劇本化場景)骨架 `KANSHOU_SCENE_EVENTS_`**：夜襲／賴床叫醒／肉償三個橋段皆走「GAS判斷可觸發時機→前端顯示按鈕→玩家按下才詢問→GAS依好感roll分支→AI只在該分支內敘事」的offer+accept模式，玩家永遍不會被劇情硬拖走、也不會靠自己打字硬凹出想要的演出。
- **平行世界設定(2026-06 玩家定案·核心原則)**：鑑賞世界「從未發生過聖杯戰爭」——角色仍是原本的英靈，但不背負戰爭/創傷造成的沉重反差，`persona.moe/look/words`(戰時版，solo專用)一律要先過daily轉換管線(`translateMoeToDaily_`/`translateLookToDaily_`/`translatePersonalityToDaily_`，AI原創英靈適用；種子英靈由人工手寫`dailyMoe`等4欄)才能進鑑賞，禁止任何戰時原始欄位不經轉換直接餵給鑑賞AI——這條原則歷經多輪稽核抓出的洩漏(`persona.back`身世／`persona.speech`+`tic`口吻小動作)已於2026-07修正，完整清單與逐函式track歸屬見 §12。
- `actionPlay`(Gallery.gs)是鑑賞唯一的敘事引擎，入口即擋非`KPC_`呼叫；`buildDefaultSystemPrompt`/`nsfwBaseRules`(紅線①)只服務這個函式。

## 9. 紅線 · 部署 · 工作流程

**🚨 紅線**：① `Engine_Combat.gs` 的 `nsfwBaseRules`＋整套 NSFW 一律不可改（改鄰近處事後 `git diff | grep nsfwBaseRules` 須0）；② `calloy520-wq/GAS`(原始九州) 一字不碰，但 FATE 內九州衍生碼可清可改；③ show-don't-tell；④ 只在 `claude/fate-error-review-w8q42w` 開發；⑤ model id 不進 repo；⑥ commit footer 固定。

**驗證**：改完必跑 `bash check.sh`（驗所有 .gs ＋ Script.html 內嵌 JS·CI 不檢查 .html JS）。
**部署**：push 該分支 → GitHub Action(clasp 3.3.0·`clasp push -f`) 自動覆蓋上 GAS。
**紀律**：改代碼順手更新 `SOLO_REFERENCE.md`／本檔（新增 action/函數/MEMORY標記/schema 欄位時回補）。

**🛠️ 工程準則（最高價值觀·詳見 `CLAUDE.md`）**：**穩健・快速・易擴充・易維護，永遠從根源解、不做臨時應變方案。** 資料驅動優先（查表勝 if 鏈）、單一真實來源、複用引擎機制不加特例、守 3→1 round-trip、發現舊做法錯就重構掉（別疊補丁）。

## 10. 已知遺產/待辦（掃描發現）

- ~~`COL.PC.REALM`：階級系統移除後恆寫空字串，但 COL 位置索引不可刪，維持棄用。~~ 2026-07：隨整體 COL.PC 折表重排，`REALM` 已真的移除（非棄用死欄），見 §3 COL schema。
- `actionGetMasters` 對 `fake`/`chaos` 戰爭回傳 5th 名冊；`seedRivalsForGame_` fake 分支不理 `【扮演】`——目前前端觸發不到（latent），未來若開放 fake 扮演須補。
- `dev_seed_gallery`(Gallery·自標【DEV·待移除】)／`dev_resync_codex`(套最新平衡·可留)：DEV 工具，確認慾海穩定後可清前者。
- `RESEED_VER`/`CODEX_PERSONA_VER`：一次性遷移旗標，旗標守門下無效能損失，保留無害。

## 11. 平衡測試工具（`tools/battle_sim/`·Node·不進 clasp）

`tools/` 不被 clasp 部署（`.clasp.json` rootDir=`gas`、`.claspignore` 只放行 `gas/`），可常駐 repo。`engine.js` 把真實 `Core_Settings.gs`＋`Engine_Fate.gs`＋`Seed_Codex.gs` 原始碼載進 Node vm sandbox——**不複製任何算式/六圍**，永遠吃當下 repo 的真引擎＋真種子（只 stub 少數 GAS 全域：`PropertiesService`/`SpreadsheetApp`/`mcCombatFx_`）。是改平衡後的迴歸測試利器。

- `node tools/battle_sim/duel.js [場數=20000]`：兩騎對打模擬（範例＝金閃/恩奇都 vs B叔·比較有無招牌被動）。改 `main()` 的 servant id 與 `stripFx` 陣列測別組，或 `require('./engine.js')` 自寫腳本（`ctx.SEED_SERVANTS`/`ctx.resolveFateBattle_`/`ctx.hasFx_` 都是真引擎）。
- `node tools/battle_sim/roundrobin.js [pool=4th|5th|all] [mode=basic|skill|np] [N=200]`：戰爭池(或全36騎)內全循環賽·輸出對全池勝率排名。三 mode 各自獨立：`basic`＝裸普攻／`skill`＝開主動技全效／`np`＝每手解放寶具(出力強制100%·多寶具挑最強攻擊項·不模擬御主魔力上限)。
- **`node tools/battle_sim/extremes.js [N=200]`：🏟️ 極端組合回歸測試——平衡改動後必跑**(2026-07·約3分鐘)。收錄歷次退化組合(燕巧盾/以巧變化流…含四技版)＋事件註記：①每組合 vs 全種子池(紅旗=破9成) ②互鬥全循環(紅旗=無天敵)。預算按檔內鏡射價目現算·改價後買不起的自動❌棄測；改 parseForgeBuild_ 價目記得同步鏡射表、新退化組合往 BUILDS 加。場數：tier 榜 N=200 夠(±1.2pp)、單對局結論用 N=1000。
- **模擬範圍**：預設只跑普攻交鋒至一方陣亡（不解放寶具/補魔/整備/禮裝），量的是「被動 fx 本身」的貢獻、不被寶具巨傷蓋過。God Hand 十二試煉復活公式逐行對照 `Router_Battle.gs` 的 `fateStrike_` 移植。
- **用途**：改六圍/fx/寶具 NP 尺度後跑一輪，看有沒有把某騎調爆或調廢。改完平衡順手更新 `duel.js` 的範例對戰組合。

## 12. Solo／鑑賞完全拆分稽核總表（2026-07·6組平行審查全代碼庫逐函式定案）

> **這節的用途**：改任何一個檔案前，先來這裡查這個檔案/函式是「solo專用」還是「鑑賞專用」還是「共用」——共用的部分要格外小心，改動前想清楚兩軌是否都吃得到、吃到後行為是否都正確。這是目前為止對全專案最完整的一次逐函式盤點，之後新增函式時比照這裡的分類法補登記。

### 分離機制總覽（三層防護，由結構到約定）
1. **物理分表**：solo 用「眾生」，鑑賞用「鑑賞眾生」(`getKanshouPcSheet_` 動態建、schema複製但物理獨立)——`handleGameAction`依`pcId`是否`KPC_`開頭決定`sheets.pc`指向哪張表。**這是最強的防護，兩張表的列從不互相讀寫**。
2. **Dispatcher 黑名單**：`KANSHOU_BLOCKED_ACTIONS_`(Router_Action.gs)明確擋掉所有戰鬥/經濟/結盟/工房類action——`KPC_`呼叫這些action直接被拒，不執行handler。2026-07稽核追加`weapon`/`get_map_nodes`/`narrate_only`三者(過去未擋，只是資料形狀恰好無害，見下方洩漏清單)。
3. **`game_id`前綴guard**：solo世界`game_id`恆為`"g_"+timestamp`，鑑賞恆為`"k_"+timestamp`——`isFateMove`/`isFateRest`/`isFateCtx`等一律用`indexOf("g_")===0`判斷，這是`move`(兩軌唯一共用的地圖類action)內部所有戰鬥/世界自走邏輯的實際防線。

### COL.PC 逐欄 track 標註
solo專用：`CONTRIB`(敵令咒餘量)／`MARTIAL`(寶具字串)／`SIX`／`TAGS`／`SEEN`／`MAJOR_EVENT`(死欄)／`DAY`/`HOUR`/`AP`/`HOME_LOC`(鑑賞恆不用)。鑑賞專用：`PHYSICAL`(肉體外顯，solo恆"{}"不顯示)。共用：`ID`/`NAME`/`SEX`/`BACK`/`STATUS`(鑑賞已用PHYSICAL取代，STATUS對鑑賞是廢寫但無害)/`TRAIT`/`LOC`/`PREF`/`HP`/`MP`/`MAX_HP`/`MAX_MP`/`MEMORY`/`INTENT`/`FACTION`/`RANK`/`ALIGN`/`GAME_ID`/`BOND`/`REL_TAG`/`IS_PARTY`/`REL_MEM`。

### 各檔案 track 歸屬（函式數量·一句話定性，逐函式細節見對應 .gs 檔內註解）

| 檔案 | 定性 | 備註 |
|---|---|---|
| `Core_Settings.gs` | 共用基礎設施 | COL schema／六圍換算／狀態字串／地理雷達皆共用；戰鬥限定helper(`rankVal`/`masterMaxHpMp_`/`OUTPUT_TIERS_`/`RUNE_MODES_`/`mageRealm*`/`masterSynergy*`)僅solo call site觸發，函式本身無track guard(靠呼叫端保護) |
| `Router_Action.gs` | 分流總樞紐 | `handleGameAction`/`KANSHOU_BLOCKED_ACTIONS_`/`buildClientState_`/`buildTagsPayload_`(2026-07新增`isFateCtx`guard，見下)是兩軌分流的實際执行點 |
| `Gallery.gs` | 鑑賞核心引擎 | `actionPlay`/`heroToKanshouRow_`/`actionEnterKanshou`/`actionKanshouSummonHero`/`translate*ToDaily_`/`nsfwBaseRules`(紅線①)全部鑑賞專用；`findPlayerServant_`/`purgeGameData_`/`actionEndRun`是solo專用(檔案位置歷史因素放在這裡) |
| `Router_Creation.gs` | 創角/召喚(兩軌共用寫入點) | `actionSummonServant`solo專用；`recordOriginalHero_`/`actionSaveHero`/`actionGetHeroes`/`parseForgeBuild_`是兩軌共用的英靈殿寫入/讀取路徑，`parseForgeBuild_`靠`cls==='御主'`分支正確拆開鑑賞companion(無六圍/技能/NP)與solo戰鬥從者 |
| `Router_Persona.gs` | 演出卡組裝 | `servantCard_`/`masterCard_`/`enemyMasterCard_`/`quadLabeled_`皆solo專用(鑑賞在Gallery.gs自己另有`formatPref`/`formatTrait`，兩者邏輯相近但物理重複，非bug但是維護債) |
| `Router_Battle.gs`／`Engine_Fate.gs` | 純solo戰鬥核心 | 全部函式solo專用，經`KANSHOU_BLOCKED_ACTIONS_`(`fate_battle`/`summon_horror_beast`等)+資料結構雙重確認鑑賞不可達；`servantNpOptions_`(Engine_Fate.gs)是唯一一個被`buildTagsPayload_`共用路徑無guard呼叫過的戰鬥函式(已於2026-07修正，見下) |
| `Engine_Combat.gs` | 兩軌共用AI呼叫核心 | `callGeminiAPI`/`doGet`是唯二函式，`nsfwBaseRules`/`buildDefaultSystemPrompt`已於更早的重構移到Gallery.gs，此檔現在完全不含紅線常數本體 |
| `Router_Bond.gs`／`Router_Movement.gs`／`Router_Economy.gs` | solo專用系統 | 羈絆/令咒/結盟/破戒奪僕/地圖移動/靈基出力/魔境/符文/補魔——全部經`KANSHOU_BLOCKED_ACTIONS_`擋下；`move`/`get_map_nodes`是例外(見下方「共用但單向」) |
| `Router_Narrative.gs` | solo敘事引擎 | `narrateWithState_`/`actionNarrateOnly`是solo的`miniSystem`戰爭旁白核心，2026-07前未被dispatcher明確擋鑑賞(已補，見下) |
| `Seed_Codex.gs`／`Seed_Rivals.gs` | 種子資料 | `SEED_SERVANTS`(英靈殿範本)兩軌共讀；`SEED_MASTERS`/`seedRivalsForGame_`/`heroToNpcRow_`/`masterToNpcRow_`solo專用(鋪敵) |
| `Setup_FateWorld.gs`／`Time_World.gs` | 冪等建表／solo時間經濟 | 建表對兩軌都跑但只管schema非玩家資料；Time_World全部函式solo專用，call site皆在`isFateMove`/`isFateRest`保護傘內 |
| `Account.gs` | 帳號連結層 | `COL.ACC.PC`(solo)/`COL.ACC.KPC`(鑑賞)兩欄分開寫死，`kanshouOwnedRowIdx_`(Gallery.gs)每次操作前驗證鑑賞所有權——這條分離線完整且經稽核確認未鬆動 |
| `History_Sync.gs` | 兩軌共用單一表 | 「歷史暫存」是全代碼庫唯一一個**不靠物理分表、只靠pcId字串前綴(`PC_`vs`KPC_`)隔離**的共用資料層——目前因ID前綴互斥而安全，但是架構上的例外，未來若曾出現一個不帶標準前綴的ID生成路徑，這裡會是唯一的破口 |
| `Mystic_Code.gs` | solo專用 | 全部函式solo專用，鑑賞UI/資料結構皆無法觸達(companion的MEMORY不可能含`【禮裝】`) |

### 稽核發現並已修正的洩漏（本輪，2026-07）
1. **`persona.back`(身世)戰時悲劇直接照搬進鑑賞** — 3位女性正典御主(遠坂凜/伊莉雅絲菲爾/間桐櫻黑化)的`back`帶著「父親死於聖杯戰爭」「被當工具養大」「蟲蝕黑化」等戰時悲劇成因，`heroToKanshouRow_`原樣寫進鑑賞BACK欄、每回合餵給AI。**修法**：新增`persona.dailyBack`(比照dailyMoe手寫的溫馨改寫版，僅這3位需要)，`heroToKanshouRow_`優先讀`dailyBack`，其餘20位無back的英靈維持中性`職階・真名`保底，不再有任何路徑讀到原始`p.back`。`CODEX_PERSONA_VER`升v60。
2. **`persona.speech`/`persona.tic`(戰時口吻/招牌小動作)原樣餵給鑑賞AI** — 例如狂化英靈「狂化無法言語、僅餘低吼」，透過`stampPersonaFlavor_`(召喚時)與`getPersonaSpeech_`/`getPersonaTic_`+`codexPersona_`(actionPlay每回合fallback)兩條路徑原樣進入AI提示詞。**修法**：`heroToKanshouRow_`改用`dailyLook`第3段(自稱與口氣，本就是日常安全版)取代`p.speech`；`p.tic`無日常對應版本，直接不帶(私密一面/dailyLook第4段已承擔「角色專屬小習慣」的功能)。`actionPlay`的fallback同步改用新增的`dailySpeechByName_`查表，不再退回`codexPersona_`的戰時原始值。
3. **`actionPlay`空隊伍/混隊誤套用「已並肩打過聖杯戰爭」框架** — 三元判斷式`partyRows.length>0 && partyRows.every(KHV_)`在隊伍為空(常見狀態，avatar剛建立、尚未召喚任何同伴)時直接落入else分支，讓AI以為「聖杯戰爭已落幕、這是奪得聖杯後的和平時光」——與「這個世界沒有聖杯戰爭這回事」矛盾。舊版「封存邀請」(`KSV_`)已死但schema殘留，理論上仍可能撞見混隊。**修法**：改成三分支，空隊伍與混隊皆改用不主張任何戰爭史的中性平行世界措辭，只有全員`KHV_`才用「初次相遇」框架。
4. **`buildTagsPayload_`戰鬥限定欄位無guard，靠資料形狀僥倖安全** — `mageRealm`/`runeMode`/`synergy`/`canIdealRealm`/`npOptions`/`npChoice`/`horror`/`canSummonHorror`過去對每一列「從者」FACTION無條件計算，沒有比照`economy`/`canRuleBreak`做`g_`前綴guard——鑑賞companion的TAGS/SKILLS恆空，加上前端目前不渲染這些欄位，尚未造成玩家可見洩漏，但屬於「新增一個忘記顧慮鑑賞的solo action就可能真的洩漏」的脆弱設計。**修法**：新增`isFateCtx`(=`gameId.indexOf("g_")===0`)，上述8個欄位全部加上這個guard，鑑賞列這些欄位現在結構性地恆為`null`/`undefined`。
5. **`weapon`/`get_map_nodes`/`narrate_only`三個action未被`KANSHOU_BLOCKED_ACTIONS_`擋下** — 皆是「鑑賞UI從未呼叫、只靠沒人直打API才沒事」的潛在缺口(逐一grep確認`Script_Kanshou.html`/`Gallery.gs`皆0處呼叫)。已明確加入黑名單，不再只靠僥倖安全。

### 已知但目前無害、暫不動手的低風險項目（供之後排查，別當成待辦硬做）
- `getWeapon_`讀取的「武裝」欄位定位模糊(戰鬥概念但曾一度未被擋)：已隨上方第5點一併擋下，此處僅記錄結論。
- `quadLabeled_`(Router_Persona.gs)與Gallery.gs自己的`formatPref`/`formatTrait`是重複實現同一套4段標籤邏輯——非bug，但兩處未來各自修改時容易走鐘不同步，值得找機會合併成一份共用helper。
- `getNearbyLocations`(Core_Settings.gs)未對`COL.MAP.WAR`欄位做過濾，儘管該欄位schema註解明確是為此設計——過濾邏輯若存在應在別處，本輪未追蹤到，不影響鑑賞(鑑賞用不到這個function)。
- `FACTION="從者"`欄位值在3位女性正典御主(`cls:'御主'`)被召喚進鑑賞後也一併被標成`"從者"`——純內部過濾用途、從未被解讀成文字餵給AI(AI看的是`REL_TAG`)，語意上有點怪但無害。
- `History_Sync.gs`「歷史暫存」表靠pcId前綴而非物理分表隔離兩軌(見上方檔案總覽)——目前安全，架構脆弱點已記錄。
- `getMapDataCached`等坤圖快取、`Router_Movement.gs`的`actionMove`/`buildMapNodesPayload_`鑑賞UI已不使用(鑑賞改AI自訂地點，不走固定地圖節點)，`SOLO_REFERENCE.md`舊註解說「move故意兩軌共用」已是過時說法，現狀是「dispatcher層級沒擋，但UI層級鑑賞根本不呼叫」，未來若鑑賞真的需要地圖節點功能，需重新設計而非直接複用solo的固定節點清單。
