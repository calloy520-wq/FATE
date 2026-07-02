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

驗證套路：跑 `bash check.sh`（自動掃全部 .gs ＋萬用比對 `gas/Script*.html`，見 `HANDBOOK.md` §4.1）。改慾海邊界務必 `git diff | grep nsfwBaseRules` 確認 0 改動。

⚠ **2026-07 檔案改版**：`Router_Action.gs`(原 3918 行)已拆成 8 檔——`Router_Action.gs`(核心dispatch)/`Router_Creation.gs`(創角召喚)/`Router_Movement.gs`(地圖移動休息)/`Router_Battle.gs`(戰鬥核心)/`Router_Bond.gs`(羈絆令咒結盟戰記)/`Router_Narrative.gs`(actionPlay敘事)/`Router_Persona.gs`(演出卡)/`Router_Economy.gs`(出力補魔)。下文各節提到「Router ~行號」的**行號已隨拆檔位移**，函數名不變、用函數名 grep 即可找到——全域作用域共用，切到哪個檔不影響行為。檔案對照表看 `HANDBOOK.md` §4。

---

## 1. 三種模式 (pc.mode)

| mode | 意義 | UI |
|---|---|---|
| **solo** | FATE 單人聖杯戰爭（本專案主體） | 純按鈕；無聊天輸入框、無慾海開關。`applyModeUI()` 隱藏所有 `data-mode="full"` 武俠日常系統 |
| **full** | 九州全模擬（停用中／待清理） | 經濟·生活·物品·門派等已全砍，剩聊天輸入框；不作為玩法軌，可隨經濟一起清理 |
| **kanshou** | 鑑賞（奪杯後後日談約會） | 有聊天輸入框＋慾海開關；無戰鬥／血量 |

`applyModeUI()`（Script.html）是模式總開關。solo 隱藏 full 專屬功能、收掉輸入框、顯示 `war-actions` 行動列。

**雙軌設計**（Index.html `scr-menu`）：玩法只有兩條軌——🎴 純淨(單人聖杯戰爭, newGameFlow/continueGame, SFW) ／ 🌹 慾海(鑑賞後日談, openGallery, NSFW)。共用一張試算表＋核心資料(管線 奪杯→鑑賞 需要)，靠 帳號＋game_id 分流，不拆表。
⚠ **2026-07 玩家定案(推翻舊方針)：兩個唯讀視窗(📜 個人聖杯戰記／🏆 排行榜)已全數砍除**——單人專注、不做跨帳號回顧比拼，`showVictoryHistory`/`actionGetVictoryHistory`/`openLeaderboard`/`actionLeaderboard` 連同「戰史」表、`incrementWin_`/`recordHistory_`/`recordWinSpeed_` 一併刪除，帳號表 WON/BEST_DAYS 欄砍除。`full`(九州全模擬)模式碼殘留、停用中，不作為前台軌（經濟已砍、可隨之清理）。
**持久層(清檔不刪)**：帳號表(2026-07 縮為 NAME/PC/CREATED 3 欄，WON/BEST_DAYS 已隨排行榜砍除)、鑑賞表(封存從者)。**會被清檔刪**：眾生(game_id)——NPC 對御主的關係(BOND/REL_TAG/IS_PARTY/MAJOR_EVENT/REL_MEM)已 2026-07 併入眾生列，隨列一起被清、不再是獨立表。

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
- **分頁**（Setup_FateWorld.gs `FATE_SHEET_DEFS`，缺頁自動補、冪等）：**2026-07 精簡為 7 頁**——坤圖(地圖)/眾生/英靈殿/御主殿/帳號/鑑賞/歷史暫存。另有動態建的「鑑賞眾生」分頁（見下）。舊分頁戰史/時鐘/因果/權柄/關係/史紀 全數移除：時鐘(CLK)/權柄(AUTH，居所)/關係(REL，好感等) 併入眾生列各欄(見下 COL schema)；因果(事件log)/戰史/史紀(命運長河) 直接刪除、無替代機制(2026-07 玩家定案，單人專注不留跨局回顧資料)。

### COL schema（索引讀取，表頭僅供人看；定義在 `Core_Settings.gs` 開頭 `const COL`）

⚠ **2026-07 單人重構**：獨立的 關係(REL)／時鐘(CLK)／權柄(AUTH) 表全部**摺進「眾生」自己這一列**——單人模式每個 game_id 世界恆只有一位御主，故「NPC 對御主的關係」= 那名 NPC 自己這一列的欄位；「日/時/AP/居所」= 御主自己那一列的欄位，天然 1:1、無需獨立 join 表。因果(LOG)／戰記／史紀(EPIC) 三個機制直接刪除（見 §3、§10）。

```
PC(眾生)【FATE 33欄·2026-07 折表後】:
  ID0 NAME1 SEX2 BACK3(身世) STATUS4(外顯) TRAIT5 LOC6 PREF7(個性)
  HP8 MP9 MAX_HP10 MAX_MP11
  MEMORY12 INTENT13(萌點) FACTION14 RANK15(職階) CONTRIB16 ALIGN17
  PHYSICAL18(肉體·NSFW) MARTIAL19(寶具) GAME_ID20 SIX21(六圍JSON) TAGS22(技能JSON) SEEN23(戰爭迷霧)
  🆕 關係欄(原 REL 表·這名 NPC 對「本世界御主」的關係。御主自己這一列這五欄留空)：
    BOND24(好感值0-100) REL_TAG25(關係標籤) IS_PARTY26(同行旗標"同行"/"") MAJOR_EVENT27(未完成重大約定) REL_MEM28(關係專屬記憶，NSFW稱呼/親密次數等，與角色自己MEMORY分開存)
  🆕 世界狀態欄(原 CLK/AUTH 表·只在【御主自己那一列】有意義，其餘角色列留空)：
    DAY29 HOUR30 AP31(1AP=1hr，每日12AP，休息每hr補2AP) HOME_LOC32(居所·工房加成判定用，原權柄表)
  🗑️已刪:財帛MONEY/裝備WEP·ARM·ACC1·ACC2/生活技能LIFESKILL/冗餘職階CLS(併RANK)/數值五圍STR·CON·AGI·INT·LUK(改吃六圍SIX)/死欄REALM(2026-07 真的移除，非棄用)。
  🗑️COL 已無 ITEM/QUEST/SHOP/MAIL/TASK/CTAG 子表(戰鬥標籤分頁仍在、以fx碼查找不需索引)。
HERO(英靈殿): ID0 CLS1 NAME2(真名) SEX3 SIX4 CLASS_SKILLS5 SKILLS6 TRAITS7 NP8 PERSONA9(JSON) ALIGN10 WARS11 SOURCE12
MASTER(御主殿): ID0 NAME1 SEX2 APPEAR3 MAGIC4 CIRCUITS5 MELEE6 MAGIC_RANK7 HOME8 WISH9 PERSONA10 WAR11 SOURCE12 BACK13(身世) MOE14(萌點)
GAL(鑑賞): ACC0 NAME1 CLS2 SEX3 SIX4 TAGS5 NP6 BACK7 PREF8 MOE9 MEMOIR10 WISH11 TIME12 MASTER13 MSEX14
ACC(帳號)【2026-07 縮為3欄，WON/BEST_DAYS隨排行榜砍除】: NAME0 PC1 CREATED2
GAL CLS="御主" = 盟友御主搭檔（凡人之軀，鑑賞重建走 master 分支）
```

---

## 3. 後端路由 `ActionRouter`（Router_Action.gs 頂部）

主進入點 `handleGameAction` → `sanitizeUserData_`(輸入清洗) → 查 `ActionRouter[action]`。AI 輸出經 `sanitizeAiData_` 夾值防幻覺。

### solo 會用到的 action
| action | handler | 作用 |
|---|---|---|
| check_name / account_login / account_new_game | Account 系 | 登入／建帳號／開新局 |
| create | actionManualNpc | 御主創角。**🚀 開局非阻塞(2026-07)：create【不叫 AI】**，用玩家輸入的種子值(身世→背景、4格預設特徵/個性)＋GAS 算的數值(HP/MP/game_id/迴路/令咒/模式/戰爭/扮演 MEMORY)＋起始禮裝**秒寫入**、立刻進召喚頁。落點確定性選(偏好新都)。 |
| backfill_master_ai | actionBackfillMasterAi | 🚀 御主敘事·非阻塞補生成：create 後由前端 `backfillMasterAi(seed)`(不 await·趁玩家在召喚頁挑從者空檔)呼叫，AI 補 背景/特徵/個性/萌點，**只以單格 setValue 更新 4 敘事欄**(BACK/TRAIT/PREF/INTENT)、不整列 write-back、不碰數值/位置/MEMORY。失敗＝保留種子(優雅降級)。**穩健**：與 `summon_servant` 的御主池更新已改單格寫(MP/MAX_MP)→兩者欄位互斥、無競寫。 |
| update_fate | actionUpdateFate | 逆天改命：玩家在遊戲中改自己 4 敘事欄(個性/特徵/身世/萌點)，數值/寶具不可改。 |
| summon_servant | actionSummonServant | 召喚從者（從英靈殿抓真名/六圍/技能→眾生列）。**種子英靈直接用寫死 persona(萌點/口吻)、不叫 AI**(省一次 API、加速)；只有名冊查無的自訂/未知英靈才走 AI 即時生成(else 分支)。**敘事8格**：個性(PREF)讀 `persona.words`、**特徵(TRAIT)讀 `persona.look`**(35 位種子皆手寫4格 外貌/氣質/自稱/卸下心防私密一面，召喚/鋪敵 直接用、AI原創走通用預設、不再被戰鬥特性污染)。 |
| — (AI 從者 fx 調色盤) | ALLOWED_FX_ / FX_MENU_ (Router_Creation.gs) | **AI 即時生成從者的 fx 白名單＋提示菜單**(兩者要同步)：`sanitizeSkills_` 用 `ALLOWED_FX_` 過濾(不在的 fx 清空、只留當演出標籤)，`FX_MENU_` 是餵 AI 的可選清單。**2026-07 放寬(A)**：加開 aim/projection/fast_cast/crafting/petrify/shapeshift/solo/weapon_steal/rho_aias/territory/wall_def/zabaniya(中階以下·施放/防禦/對人放大)，拉高自訂從者上限貼近種子。**刻意仍 gate**(種子專屬·防「乖離劍氾濫」)：頂級概念寶具 ea/gob/excalibur/ubw/summon_horror/chain/wealth＋需專屬UI的 mage_realm/rune。⚠ 但 `npAtkScale_` 讀 np 字串的 對城/對界 關鍵字→AI 仍可靠字串拿高規模(缺的只是 fx 放大器)，非全鎖。要頂級同人→加進 SEED_SERVANTS。 |
| get_heroes / get_masters | — | 創角選單列出可選英靈/正典御主 |
| get_tags | actionGetTags | **左側狀態面板資料**：御主HP/MP/令咒/願望、從者陣列(六圍/技能/羈絆/寶具)、供魔收支、禮裝、破戒能力。**⚡ 核心邏輯抽成 `buildTagsPayload_(sheets,pcId,preData,preRel)`**(可吃已讀好的整表免重讀)；`sync` 回應已夾帶 `tags:` 同份 payload，前端 `refreshFateTags(data.tags)` 直接用、不再單獨打 get_tags。**效能鐵則：一次按鍵原本 3 趟 round-trip(action→sync→get_tags)→現 1 趟**。機制：①`buildClientState_(sheets,pcId)`＝完整刷新 blob(statusString/people/locations/clock/ap/economy/tags，先 markRivalsSeen_ 再讀、整表+rel 只讀一次下傳共用)，`actionSync` 即回它。②dispatcher 對 `STATE_AFTER_ACTIONS` 白名單動作(fate_battle/mana_supply/move/rest/scavenge/scout/bond… 凡前端事後會整頁 syncData 者)＋ `PC_` 御主，自動把 `_state:buildClientState_()` 夾進回應。③前端 `gasRun` 暫存 `data._state`→`__pendingState`，`syncData` 優先消費它(`applyClientState`)、沒有才打真 sync(graceful fallback)。**不列入白名單**：樂觀 setter(set_servant_output/mage_realm/rune_mode/np_choice 不 syncData、只吃 res.economy)。`playerServantEconomy_(sheets,pcId,preData)`／`getFreshStatusString`(已拔冗餘 flush) 同理。改這幾支前先想清楚別把整表重讀或多餘 round-trip 加回來。 |
| fate_battle | actionFateBattle | **核心戰鬥**：D20＋寶具＋令咒＋斬首＋雙從者＋協同強襲（見 §4） |
| use_seal | actionUseSeal | 令咒固定選單：修復/補魔/緊急脫離 |
| mana_supply | actionManaSupply | 補魔(燃迴路)：硬擠迴路回滿共用池，**永久代價** maxHP−15、迴路−3(地板迴路8/HP40)+羈絆+SFW fade（耗1AP，卸防可能被突襲）。過度＝慢性自盡。**另存一次性【過充】token**(下一發規格外＋/EX寶具可全力灌魔超載·見 §10 灌魔超載)。 |
| ~~blood_supply~~ | (已移除) | 🩸燃血改【被動】：池見底時 applyRegen_ 自動燃【御主】HP續契約(缺口÷2·**2026-07 玩家定案：從者一律不扣血**，缺口期從者僅停止自我修復)。主動 action/按鈕/函數皆已刪。 |
| set_servant_output | actionSetServantOutput | 🔋設從者靈基出力檔(20/40/60/80/100，存 MEMORY【出力】)。免費即時不耗AP。決定戰力＋御主每小時維持費；100% 才能放寶具。 |
| set_mage_realm | actionSetMageRealm | 🔮魔境的智慧(斯卡哈專屬)：玩家點選 **1 個通用 A 階被動 fx**(`mageRealmPool_`：對魔力/怪力/心眼/透化/軍略/自我改造)，存 MEMORY【魔境】fx；fx 空字串＝清除。免費即時不耗AP。`rowToCombatant_` 戰鬥時注入 skills(r:'A')。只接受持 `mage_realm` 的從者。 |
| set_np_choice | actionSetNpChoice | 🌟多寶具英靈：玩家點寶具時選「解放哪個」，存 MEMORY【寶具選】N(預設0=主寶具)。`servantNpOptions_(name,cls)`(Engine_Fate 中央表：斯卡哈L/金閃/EMIYA/伊斯坎達爾…)定義每英靈的寶具清單{n,scale,fx,desc}。`npProfile_(c)`解出本次解放的{scale,fx}：多寶具讀 c.npChoice 選定項，單寶具退回字串尺度＋`firstSignatureFx_`。`resolveFateBattle_` 簽名效果(gae_bolg必中/ea執行殺/ubw/zabaniya/summon_horror/petrify/scaleMult)一律改吃 npProfile→選對寶具才生效。前端寶具鈕→`openNpReleasePicker`(>1才彈)→`pickNpAndStrike`(set_np_choice→servantStrike npPicked)。免費即時。 |
| outfit | actionSetOutfit | 👗**從者換裝**(玩家自訂當前服裝穿著)：存從者 MEMORY`【換裝】<文字>`(`getOutfit_/setOutfit_/clearOutfit_`·Core_Settings·set 內剝`｜【】`換行＋限40字)。**只換衣不換人**——五官/髮色/體態/氣質仍依種子`persona.look`。餵進敘述三處：`servantCard_`(solo 戰鬥/羈絆/移動·同時補注`外貌本相`＝先前漏掉的 look)＋actionPlay `【同行夥伴】裝扮:`(solo/full)＋kanshou `[名 裝扮]:`(Router_Narrative)。純外觀·免費即時·不耗 AP·兩軌通用·留空恢復本相。get_tags 給 `outfit`(前端預填/顯示)。前端 `changeOutfit(name)`(prompt)＋卡片 👗換裝鈕(solo 動作列＋kanshou 卡)。 |
| set_rune_mode | actionSetRuneMode | 🔯原初符文運用(持 rune 者)：玩家選 **def 減傷/dmg 增傷/regen 回血**，存 MEMORY【符文】mode(預設 def)。`runeMode_`/`setRuneMode_`(Core_Settings)。`rowToCombatant_`→c.runeMode；`resolveFateBattle_`：def loser減傷10%×階／dmg winner增傷10×階；regen 在 `actionFateBattle` 回合迴圈回血 5%×階/回合。get_tags 給 `runeMode`。免費即時。 |
| bond | actionBond | 羈絆互動(閒聊/共餐/特訓/夜談)，每種每日一次升羈絆 |
| ~~use_mystic~~ | — | **已移除**（禮裝全面被動化，戰鬥自動加持我方從者，見 §6） |
| rule_break_steal | actionRuleBreakSteal | 破戒奪僕：打殘敵從者(HP<35%)+燃令咒→奪為第二從者(上限2) |
| propose_alliance / break_alliance / ally_bond | 同盟系 | 結盟/撕毀/與盟友共處(見 §8) |
| set_workshop / scavenge | 陣地系 | 設陣地(提升供魔)／搜索物資(主情報、順手撿零星魔力 ~10%/地、同地搜過枯竭剩 3%；標記【搜刮】loc，防站樁刷魔) |
| second_wind | actionSecondWind | 0-AP 死局保命解：扣~20%上限血換+4AP，**不耗AP·可重複**(2026-06 移除每日一次限制——血才是天然煞車，HP≤cost 才擋；唯 AP 近滿時擋)。不推進時間、不燒令咒 |
| scout | actionScout | 偵查：揭露同地敵蹤(設 SEEN，**敵移位後不再清 SEEN→已偵查者持續可見**) |
| prep_meal | actionPrepMeal | 🍱 整備·進食(戰前 buff)：耗1AP，御主 MEMORY 記`【整備至】<絕對小時>`，效期內從者出擊命中 +`MEAL_BUFF_BONUS`(2)約`MEAL_BUFF_HOURS`(8)小時。solo 無道具欄/商城，食物抽象供給。`fateStrike_` 讀 `mealBuffActive_` 把 `mealBuff` 傳進 `resolveFateBattle_`(Engine_Fate.gs 加 aHit)。前端 `prepMeal()`＋戰場行動列「🍱 整備」鈕 |
| get_map_nodes / get_all_categorized_maps | 地圖 | 地圖節點＋敵蹤(吃 SEEN 迷霧；有盟友→`hasAllyInGame_`全揭露) |
| move / rest / sync | — | 移動(2AP)／休息(補AP+夢境)／資料同步 |
| narrate_only / multi_attack_narrate | actionNarrateOnly等 | **AI 純說書**(solo 不用 actionPlay；GAS 算數值、AI 只演出) |
| claim_grail / enter_kanshou / kanshou_companions·add·remove | Gallery.gs | 奪杯封存／進鑑賞後日談世界／同伴管理(見 §9)。⚠ 舊 list_gallery/enter_gallery/gallery_talk 已移除 |
| enter_kanshou | actionEnterKanshou (Gallery.gs) | **🌹 進入鑑賞主入口(新版)**：每帳號【單一常駐】後日談世界。御主 avatar(KPC_)以 MEMORY `【帳號】<acct>` 綁定、id 持久→`getGameHistory(pcId)` 跟單機一樣接續歷史。無從者預載、不重講開場；從者由 `kanshou_companions/add/remove`(👥面板) 邀請(上限3)。**御主名字＋性別首次進場由玩家定**(不掛帳號)：沒帶齊 `pcName/pcSex`又還沒建過→回 `needSetup:true`(附 `defaultName`)，前端 `askKanshouSetup()` 問一次(名字＋性別)再帶進來建。前端 `enterKanshou()`(Index.html「進入鑑賞」鈕)→ mode=kanshou、自動開 NSFW、撈歷史 |
| kanshou_set_sex / kanshou_set_name | actionKanshouSetSex／actionKanshouSetName (Gallery.gs) | ⚧/✏ 隨時改後日談御主 avatar 性別/名字(只動該欄，不影響歷史；改名一併遷當前同伴的 REL.PC 羈絆鍵)。👥面板「切換性別」「改名」鈕→`changeKanshouSex()`／`changeKanshouName()` |
| ~~get_victory_history / get_ranking~~ | (已移除) | 🗑️ 2026-07：個人聖杯戰記／排行榜兩個唯讀視窗連同「戰史」表全數砍除（單人專注，不做跨帳號回顧比拼）。 |
| ~~war_chronicle / war_history_list~~ | (已移除) | 🗑️ 2026-07：「戰記」表(里程碑回顧)整套刪除，`logWarEvent_`／`actionWarChronicle`／`actionWarHistoryList` 及 Router_Battle/Bond/Creation/Time_World 內所有呼叫點一併拔除。 |
| ~~get_epic_history~~ | (已移除) | 🗑️ 2026-07：「史紀」表(命運長河面板)整套刪除，`actionGetEpicHistory` 已拔。前端 Script.html ~2804 仍呼叫 `get_epic_history`——已知死按鈕(回「未知的動作指令」優雅錯誤、不崩)，待後續前端清理批次拔除按鈕。 |

### 🗑️ 九州經濟/生活層已全數移除（2026-06，code＋分頁＋COL 一併清）
銀兩(MONEY)/商城·店鋪(SHOP)/物品·背包(ITEM)/天命·任務(QUEST)/工房(TASK)/賭場/飛書(MAIL)/生活技能(LIFESKILL)/裝備(WEP·ARM·ACC1·ACC2)——對應 action、helper(resolveItemName/transferMoney/checkAndExpireQuests…)、actionPlay 內 items_gained/transferred/lost/used·money_transferred·quest 解析、前端背包/物品連結/飛書 UI 全拆；COL 子表與分頁定義一併刪。**保留**：魔力收支(playerServantEconomy_/工房/`economy:`欄＝FATE 戰鬥機制非錢)、關係(2026-07 併入眾生列 BOND/REL_TAG/IS_PARTY/MAJOR_EVENT/REL_MEM，非獨立表)、肉體(PHYSICAL)/外顯(STATUS)。`play`(actionPlay) 仍用於 kanshou(NSFW)，**solo 戰爭走 narrate_only 不走 play**。
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
  `aim analyze anti_magic_lance burst chain clear_mind divine_age divine_core ea evade_ranged excalibur first_strike gae_bolg gob mad morale nullify_magic petrify projection rho_aias ride self_mod stealth str_up summon_horror tactics territory tsubame ubw unreadable wind_strike zabaniya`
  - **⚔️ god_slay(神殺／斯卡哈-Lancer，2026-07)**：對具「神性」之敵最終傷害 ×1.3~1.83(依敵神格階)。觸發＝`hasFx_(winner,'god_slay')` **或** 技能/特性名含「神殺」(雙軌·資料驅動)。斯卡哈走名觸發·阿爾喀德斯復仇者走 fx。對凡人無加成。
  - **🔮 寶具預告制(2026-07·Router_Battle)**：敵寶具不再無預警秒殺——把原本決定敵寶具【當場發動】的條件(攻擊型寶具＋自身殘/我方殘＋urge骰＋付得起prana)改成先【預告蓄勢】，設 `【寶具預告】` 於敵 MEMORY(getNpTelegraph_/set/clear·Core_Settings)，下次接觸 `eTelegraphed→必發`。`npTeleHandled` 保證 rounds loop 一次決策。戰報彈「⚠️寶具預兆」。純防禦寶具(god_hand/理想鄉/rule_breaker對人)因 `eOffensiveNp` 為偽→不預告。
  - **💨 逃跑代價(2026-07·Router_Movement actionMove)**：離場格有敵人 `【寶具預告】`中→朝背影傾瀉 NP 級臨別重擊(`resolveFateBattle np:true`·85%挨到·騎乘−15%·保1)，消耗預告旗標＋補戰報進 worldRumors。優先於一般敏捷追擊。psvC 亦注入禮裝(Avalon 逃跑時也護)。
  - **🗡️ Avalon-Saber 理想鄉(2026-07·Mystic_Code injectMysticBuff_)**：御主持「全世界之鞘 Avalon」禮裝 ＋ 從者為【阿爾托莉雅】→ 注入 `avalon_saber`(**被動＝鞘之基本減傷 npDefMul 0.82**·同一般 avalon)＋`regen`(時回)。名字比對 `/阿爾托莉雅/`＋cls Saber。非阿爾托莉雅持 Avalon→僅一般 avalon。
    - **🛡️ 理想鄉·完全擋寶具(被動自動·概念 7 階·專剋 6 階究極寶具·2026-07 定案)**：**無開關**——Router_Battle 敵擊前攔截：`enemyFireNp && hasFx_(avalon_saber) && offenseTier_(enemyNow,true)>=6 && 御主純魔≥100` → **完全擋下(不跑 fateStrike·eDmg 0·戰報敘述)＋扣 100 御主 MP**。理想鄉概念 7 階(CONCEPT_TIER 註解·不入 pierce 數學·以硬擋實現＝不可被任何概念貫穿)，**只為擋 6 階究極寶具(ea/enuma·碾穿一切一發秒人)而展開**；普通寶具(<6階)靠基本鞘減傷(×0.82)＋六圍扛。★攻防取捨：留 100 魔則擋、耗魔放自己寶具則擋不住。get_tags `canIdealRealm`→卡片資訊標籤「🛡️ 理想鄉·自動護盾」(showIdealRealm 純說明)。⚠ 注意敵多寶具預設 npChoice 0：恩奇都 option0=Enuma(6階·會觸發)，吉爾 option0=王之財寶(1階·不觸發·除非選 Ea)——敵預告時要否自動選最強寶具＝可續作。
  - **🌟 insight 全知全能之星(吉爾，2026-07)**：命中+4＋看破奇襲(併入 senseNegate·階級≥敵stealth)。中等被動·非傷害。
  - **🩺 2026-07 全面體檢批修(三路稽核·engine/battle/seed/creation)**：①**令咒必中根源修**——`opts.seal` 改在 `resolveFateBattle_` 內部強制 `atkWins=true`(damage 恆屬攻方)，拔掉 fateStrike_ 事後翻旗(原 bug：擲輸時拿敵方反殺傷害打敵方)；新增 `opts.forceHit`(對轟火力取樣用·同保證傷害歸屬)。②**survive 戰鬥續行**＝致命傷(after≤0)才觸發(原 after≤5 會把殘血 2~5 倒扣到 1)·三處同修。③**十二試煉** `lossN<=lives`(最後一命可用·餘0站起)；預設11註解修正。④**對轟**：清【寶具預告】旗標(原殘旗→下場無條件再必發)、回震夾至保1(原可打死殘血從者→勝敗雙記)、pPow/ePow 取樣用 forceHit。⑤**整備餐 buff** 只給我方出擊(原敵人反擊也吃)＋盟友 noMeal。⑥**fate_battle 目標驗陣營**(只可打敵從者/敵御主)；**actionMove 目的地驗坤圖**(堵地圖外安全屋)。⑦**殘存靈基【殘存】N**(get/setSoloReserve_)：無主單獨行動者的寶具儲備確實扣減(原永不扣→E階寶具無限放)。⑧**逃跑背擊**三漏：付 prana+出力100+反手改普通交鋒結算。⑨**休息夜襲**改用 worldTick 後重讀資料(原死人可偷襲+陣地反擊復活死者)；敘事用 `ambush.svName`。⑩**破戒奪僕**清殘留標記(【御主】synergy誤觸/【寶具預告】/【盟約至】/【靈基透支】)。⑪**AI 召喚防線**：fallback JSON 偵測(缺 realName/six 中止·原靜默寫入殘缺從者永久污染英靈殿)；sanitizeSix_ 承認 A++；AI np 字串規模上限對軍(對城/界/神種子專屬)；AI 分支補 MEMORY。⑫`servantNpOptions_` 改精確比對種子真名(原 indexOf→名含「無名」即繼承 Ea 選單)＋蒼白騎兵入多寶具表。⑬actionPlay 髒列寫回：從者/敵從者跳過 maxStatsForRow_ 重算(電池制 MP 恆 0·單一真實來源)。⑭種子：阿爾喀德斯拔矛盾神性A、美杜莎神性補 E-、蘭斯洛特補人類、Avalon 錯字。⑮interceptNote 死變數清除(後端+前端)。
  - **⚔️ excalibur 接回概念5階(2026-07·v37)**：阿爾托莉雅/美遊 種子 skills 補掛 `fx:'excalibur'`(單寶具簽名 fx 掛 skills 是既定模式：庫丘林 gae_bolg/EMIYA ubw/佐佐木 tsubame)。此前全專案零產生者→誓約勝利之劍解放拿不到 CONCEPT_TIER 5、無法概念壓制(陣地/對魔力/神核)、敵寶具對轟(CLASH_OFF_FX)也漏她。**通則：新增單寶具種子時，簽名概念 fx 必須掛進 skills——只寫 np 字串＝只有規模、沒有概念位階。**順修美遊 np 字串「對城 A++」→「對城 A」(對齊 six.寶具)。
  - **🐾 sense 氣息感知(恩奇都，2026-07)**：**守方**專屬——`hasFx_(def,'sense')` 且 `rankVal(sense) ≥ rankVal(攻方 stealth)` → 攻方氣息遮斷者的奇襲**命中先機(line ~425)＋要害一擊(×1.2~·line ~504)全數失效**(`senseNegate` 旗標橫跨兩處)。貼原作「近距離廢掉同級以下的隱形」。刺客偷襲恩奇都會被一眼看穿。
  - **🏷️ 金羊毛式無數值標籤(golden_fleece／double_summon…)**：招牌傳說但戰場使不出的能力(金羊毛=Caster 駕馭不了的召龍寶具；二重召喚=雙職前提·效已分呈於各技；頭痛宿疾=弱點)——**只掛 FX_DESC 酷炫說明、引擎完全不讀**。新增此類＝Seed 掛 fx 名＋Script.html `FX_DESC` 補一句，勿接任何引擎讀取路徑。
  - **🏰 home_field 主場·陣地結界(陣地作成強化·2026-07)**：玩家於【自己 set_workshop 佈設的陣地】決戰、且隊上有【陣地作成】從者 → 全隊 DEF_FX_ home_field 額外減傷 `×(1−0.16r)`(r=陣地作成 rankMul·EX空中庭園≈−32%/A−26%/C−16%)。`homeTerritoryRank_`(Router_Movement·比對 workshop loc==battle loc＋掃隊上 territory 最高階)→`injectHomeField_` 注入我方從者(atkC/sC/defC 三注入點·同 injectMysticBuff_)→ctx.homeField 傳遞。pierceKey 'territory'(超位階概念 ea/enuma 仍碾穿)。引敵入陣地決戰的主場優勢·讓陣地作成階級終於有份量(原本 territory 走到哪都 ×0.74·與地點/階級無關)。report.homeField→前端綠框＋AI 主場敘述。
    - **🏕️ 陣地＝安全港·反擊(2026-07)**：`enemyAmbushOnServant_`(休息/補魔/刷好感/盟誼 共4呼叫者) 開頭加判定——玩家於自己陣地(homeTerritoryRank_>"") 且御主純魔 ≥ wardCost(20+階×0.6·~30~55) → 不挨突襲：扣魔＋從者反擊擊退潛入者(敵扣血·保1不斬)＋回 `{homeRepel:true, repelNote, report:{homeRepel:true}}`。呼叫端：`ambush.homeRepel ? repelNote : 原突襲prompt`＋休息仍可做夢(`!ambush||ambush.homeRepel`)。前端 renderFateBattleReport 早退分支渲染綠色反擊卡。魔力不足則結界失效·照常挨突襲。解決「睡覺/補魔/刷好感被突襲驚醒」＋陣地有戰略價值(安全港)。
  - **🛡️ rho_aias(七天盾·羅·埃亞斯／EMIYA，2026-06)**：守方減傷 ×0.6(七層花瓣硬擋)；遭超位階概念(ea 等，`pierces('rho_aias')`)貫穿則失效。
  - **🗡️ stealth 首擊奇襲(2026-06 改)**：氣息遮斷**只在 `opts.ambush`**(開場第一擊／敵突襲)生效·**吃階級**(命中 +rankVal/10·A+≈6 A-≈5)，非首擊不再享(交手即破功·貼原作)。命中**＋傷害**(普通首擊 ×~1.4 要害·吃階級)，但開場放寶具(opts.np)則走寶具爆發不疊。旗標鏈：`actionFateBattle` opening&&isActive → `fateStrike_` → `resolveFateBattle_(...,{ambush})`；敵突襲 `enemyAmbushOnServant_` probe 傳 `ambush:true`(本就 mul×1.4)。
  - **🐙 summon_horror(螺湮城教本／青鬍子)＝【變身框架】(2026-07 重構·狀態機化＋魔力供養制)**：從「本場解放才在場」變成**無期限的變身態**——單一狀態源＝MEMORY`【海怪護盾】cur|max|expiry`(**expiry 0＝無期限**·非0=舊制碼表存檔過渡)。**碼表已拔(玩家定案)：維持全走魔力經濟**。
    - **入場兩路**：①戰鬥中解放寶具(`actionFateBattle` useNp)②**戰前召喚 `summon_horror_beast`/`actionSummonHorror`**(不進戰鬥·付寶具 prana＋1AP)。**退場三路**：①肉身被打光②魔力供養不起(見下)③**玩家主動解除 `dismiss_horror_beast`/`actionDismissHorror`**(免費即時不耗AP·止住時耗·重召須再付全額 prana)。前端卡片 `s.canSummonHorror`→🐙召喚海怪鈕／`s.horror`→🌊解除海怪鈕(互斥)。
    - **在場＝變身態(四效果全綁狀態)**：①**擋傷**`fateStrike_` 先扣海怪潰散才傷本體；②**再生**每回合 `HORROR_REGEN`(+10)；③**追擊**horrorC(A/A巨獸)每回合並肩咬、抽御主 `HORROR_UPKEEP`(10·※原30)·付不出潰散；④**對城防**`npDefScale_` 吃 `c.horrorUp`(rowToCombatant_ 讀 MEMORY 現存肉身)→**只變身時**本體享對城防禦規模。
    - **⏳ 時間維持費(取代碼表)**：`HORROR_HOURLY_UPKEEP`(8)——`applyRegen_` 支出多一張嘴；**池赤字時【海怪先沉回深淵、才輪到御主燃血】**(deficit 分支先 clearHorrorShield_＋logWarEvent_ 再重算收支)。HUD 收支 `playerServantEconomy_` 同步計入(掃全隊·回 `horrorUpkeep` 欄)。
    - **狀態源＝single truth**：`horrorPresent_(mem,gid)` 判在場(expiry 0 恆真·非0舊檔查時鐘)；舊檔逾時殘影由 `clearExpiredHorror_`(戰前入口)＋regen 逾時分支＋維持費潰散 三處清乾淨。常數 `HORROR_SHIELD_HP`300/`REGEN`10/`UPKEEP`10/`HOURLY_UPKEEP`8。
    - **helper**：`getHorrorShield_/setHorrorShield_(mem,cur,max,exp)/clearHorrorShield_/horrorShieldView_(mem,gid)→{cur,max}|null`＋`horrorPresent_/summonHorror_/clearExpiredHorror_`(Router_Battle)。前端 servant payload `horror:{cur,max}`→體力條下 `🐙海怪` 藍紫血條(`horrorBar`)。
    - 青鬍子寶具模式敵方 1%→23%；普通/技能仍0%(無寶具=無海怪)。
    - ⚠ **已知後續**：`enemyAmbushOnServant_`(夜襲/卸防突襲)與撤離追擊直接扣 HP、不走海怪護盾——變身態下睡覺仍會被突襲(shield 不擋 ambush)。要補＝ambush 路徑加護盾吸收＋4 個 caller 訊息處理 −0 情況。
    - 🧩 **變身通用範本**：MEMORY 狀態旗標→`rowToCombatant_` 注入 `c.xxxUp`→引擎讀旗標調攻防；日後靈基二階段/化身切換照此複製(狀態源＋戰前 action＋in-battle 觸發＋逾時清理 四件套)。
- **📊 全戰鬥都有戰報卡(2026-06)**：① `renderFateBattleReport` 舊 guard `!r.rounds` 會擋掉【無回合】的斬首/突襲報(等於斬首戰報一直沒顯示)→改 `if(!r)`。② 新增**突襲戰報卡**(`r.ambush`)：`enemyAmbushOnServant_` 回 `out.report{ambush,enemyName,svName,dmg,after,svHpMax,destroyed,defeat}`，rest/mana_supply/scavenge/scout 四個 caller 都把 `report` 帶回前端並 `renderFateBattleReport`＋補 defeat 處理。
- **🎬 AI 敘述瘦身(2026-06)**：戰鬥/斬首 prompt 由「★務必演出X」一長串指令 → 改【事實素材列(·)＋單行收尾steer】，給 AI 數據讓它自己演(show-don't-tell)，不報菜名、不堆指令。海怪/對轟/令咒/電池/十二試煉/盟友皆改為事實行。
- **⚠ 突襲戰報卡別綁死攻擊手法(2026-07)**：`renderFateBattleReport` 的固定文字卡(GAS 掌數值的領域)原寫死「門戶大開時被狠狠貫穿」，暗示「刺穿」這個具體手法，但突襲者不一定用穿刺類武器(如咒腕之哈桑是異形右手／詛咒抓握，不是貫穿)——跟 AI 敘述(真的會依攻擊者實際身份演出正確手法)矛盾。改成手法中性的「遭狠狠重創」，`Router_Bond.gs`/`Router_Economy.gs` 對應的 aiPrompt 素材列「一記重擊狠狠貫入」同步改「狠狠命中」，三處都別再預設穿刺。
- **⚠ 同一類 bug 系統性複查(2026-07)**：使用者要求「提示詞務必依按鈕/當下實際情況填入」，複查後再抓到 3 處：①`Script.html` `servantStrike` 的 `useSeal` 分支寫死「必中斬向」，未像旁邊 `_plain`(一般出擊)那樣依 `myServantCls` 分 Caster/Archer/其他——改成 `_sealVerb` 同步依職階分支(轟向/鎖定/出擊)。②`Router_Battle.gs` 勝利記錄(`recordHistory_`/`logWarEvent_`)寫死「斬盡所有敵對從者」，任何職階(含 Caster/Archer)獲勝都留下「斬」的永久戰績——改「擊破所有敵對從者」(呼應同函式內個別擊殺已用的中性「擊破」)。③`Router_Battle.gs` 寶具對轟(`clash`)的 `logWarEvent_`／`aiPrompt` 寫死「光潮貫穿對手」，但對轟資格含 zabaniya(暗殺系)/petrify(石化)/chain(束縛)等非光束型寶具——改「威能壓過對手」，不再預設光束/貫穿意象。
  - **🐛→✅ 「生死由御主後續定奪」誘發AI杜撰饒恕戲(2026-07，兩輪修正)**：戰鬥未分生死時(`finalLine`＋「敗方尚有餘力」那行)，舊措辭「生死由御主後續定奪」被AI讀成「該演一場御主做決定的戲」，於是自己編出「御主下令收手／饒過對方」的橋段——玩家根本沒按過這個決定，且下一次繼續攻擊時故事還接不上(說要饒命、下一擊又補刀補死)。**第一輪修正**改成純陳述＋「不可杜撰御主下令收手/饒過對方」——但玩家馬上抓到這句本身又把「收手/饒過」兩個具體詞遞給AI了，同一個坑換位置重演。**第二輪**改成完全正面陳述：「此乃御主下令出擊、雙方仍在交鋒中，下回合是否再戰仍由御主決定」，不提任何「收手/饒過」字眼。
  - **📐 這類坑的通用判準**：本次session連續抓到 4 次同一種問題(腐臭味／赫拉克勒斯盔甲範例／職階刻板印象清單／收手饒過橋段)——**任何「禁止/不可/勿」後面接一句具體、可引用的畫面或台詞範例，都有被AI誤讀成「該演這段」的風險**；純結構性規則(如「只輸出合法JSON」)或抽象規則(如「禁替玩家做決定」，不再往下舉具體場景)則安全。日後新增/檢查提示詞，優先看有沒有踩到這條線；已知還有兩處同款疑點但風險較低、已一併修掉：`Router_Narrative.gs`「若在場人物有同行夥伴...【絕對禁止】推演為冷血路人！必須...外冷內熱/假意嗔怒/佔有慾」與「【絕對禁止】主動迎合、發情或瞬間屈服！必須...抗拒、屈辱、咬牙切齒或冷嘲熱諷」，皆改成不點名具體反應、只要求「依性格與好感度真實反應」。`nsfwBaseRules`(紅線①，Engine_Combat.gs)的兩處同款寫法(禁止陽剛形容詞清單／禁止男性模板動作清單)——**2026-07-02 玩家明示授權後已修**：改為正面陳述＋抽象禁令(「恆保女性柔美質感」「禁任何男性化強硬支配模板」)，不再遞可引用的具體詞；機制/其餘字句原封不動。紅線①對其他改動仍然有效。
  - **🗑️ 移出種子(2026-06)**：`大仲馬-Caster`(亞歷山大·仲馬)＋`漢斯-Watcher`(安徒生)——純支援·無攻擊寶具(1v1 恆敗、非戰鬥從者)，移出 SEED_SERVANTS。FATE_FAKE_ROSTER 的偽戰 Caster 由大仲馬改派`玉藻前-Caster`。種子 35→33。
  含：職階相剋三角(KNIGHT_BEATS +命中+傷害)、對魔力減魔砲、territory 防壁、divine_age 繞 MR、zabaniya 致命(×1.9+70)、gae_bolg 因果必中、petrify 石化、projection 被動加成(EMIYA) 等。
- **🎴🎯 六圍降權＝角色速寫(2026-06核心哲學)**：TYPE-MOON 官方：參數是「讓人理解這從者」的速寫，非戰力試算表(庫丘林六圍頂尖卻幸運E→運氣/故事才是裁判)。舊版命中/迴避用 `rankVal`(差距50)當主導項→差兩階就鎖死→必然極化(模擬 76% 越界)。修正：
  - **命中** `= d20 + rankTier(hitStat)×K_STAT(2.5) + rand(-3~3) + outMod`（hitStat：Caster魔力/其餘敏捷）。階差壓到~12，d20(運氣)重新主導。
  - **迴避** `= d20 + (rankTier(敏)×0.65+rankTier(耐)×0.35)×2.5 + rand(-3~3)`：拆「敏捷雙吃」＋降權。
  - **傷害 flat** `rankVal×0.8→×0.6`：避免高階一發轟死。
  - 模擬結果：普通/技能 **76%→29% 越界**(大多對局回 28~77% 健康區)；寶具 74%→52%(climactic NP 層較swingy屬正常)。
- **🍀 幸運上演逆轉(2026-06)**：自指變異(非對拼)——低運(≤D)每擊 8% 失手(-10)、高運(≥A)8% 福星(+8)。製造爆冷與劇情感(庫丘林詛咒/Saber福星)，不讓高運方持續輾壓。
- **🩸 必中之槍非全無解(2026-06·gae_bolg)**：`atkWins = gaebolg ? !gbEvaded : (aHit>=dEva)`。必中閃避機率 `gbEsc`＝幸運(A+0.35/A0.22/B0.10)＋直感或心眼(first_strike/analyze 0.15)＋變化(shapeshift 0.10)，夾上限 0.6。一般從者照樣被釘死，唯「能改寫命運/超越感知」者搏一線(貼原作)。令咒·絕對命令的必中【不受此影響】(玩家王牌仍絕對)。
- **🔧 平衡補丁(2026-06)**：①`divine_age`(神代魔術)＝**完全無視**對魔力(原只半減)，救美狄亞；②`fast_cast`(高速詠唱)+12×rankMul 傷害；③`ubw`(無限劍製)`npAtkScale_`＝**對城**級(規模階5→可多燒狂戰十二試煉命，救 EMIYA 對狂戰；非對界，避免對人一發秒)；④`npBaseDice_` 下修(A20→13d10/EX30→18d10…)；⑤`NP_SCALE_MATRIX` 壓縮(max ×3.0→1.7)避免大規模寶具秒小規模。
- **🎲 D&D 傷害骰(2026-06)**：`rollDice_(n,sides)`＋`rankTier_(r)`(E1→EX6)。
  - 武器骰(每擊)：`base = round(rankVal(主屬性)*0.5) + rankTier d8 + 命中分差*1.2 − 耐久/2`。
  - 暴擊(擲20)：多骰一輪 `rankTier d8 +12`(取代舊固定 +30)。
  - 寶具骰：`npBaseDice_(寶具階)`＝E3d10/D5d10/C8d10/B12d10/A20d10/(A+·A++)22d10/EX30d10；另加 `rankVal(寶具)*0.6+10`。
  - ⚠ **EX 嚴格判定(2026-06 修)**：`rankVal('A++')=60` 與 EX 同值，故 `npBaseDice_/npPranaCost_` 改用字串 `/EX/` 認 EX；**A++ 算 A 階**(22d10/prana500)，否則 Saber 誓約勝利之劍(A++)會被收 EX prana800 而永遠放不出。
- **🔱 概念優先權 Priority(2026-06)**：`CONCEPT_TIER{}`(**ea·enuma6** / excalibur·divine_age·rule_breaker5 / ubw·anti_magic_lance·gae_bolg·**summon_horror·rho_aias**4 / god_hand·tsubame·zabaniya·petrify3 / nullify_magic·divine_core·territory2)。`offenseTier_(c,isNp)` 取攻方最高進攻概念階；`pierces(防禦fx)`＝攻方階≥防禦階+`PIERCE_GAP`(2)→該防禦(territory/神核/對魔力)被無視(概念壓制)。把舊「破魔無視神核」系統化＋ ea 凌駕一切。
  - **🌟 2026-07 根源修**：`offenseTier_` 除了掃 skills(hasFx_)，**也把「本次解放寶具自身的概念」計入**(`conceptTier_(npProfile_(c).fx)`)——因寶具真名 fx 存在 `servantNpOptions_` 而非 skills，原本被 hasFx_ 漏掉，導致**吉爾 Ea 竟吃不到 tier-6 概念壓制**(已一併修好)。`enuma`＝恩奇都 Enuma Elish(天之楔·可匹敵乖離劍)，6 階；恩奇都改為多寶具(Enuma Elish 對界·enuma／民之睿智 Age of Babylon 對軍·gob)。
- **🏰 寶具規模相剋矩陣(2026-06)**：`npAtkScale_`(對人/對軍/對城/對界，由寶具名或 ea→對界/excalibur·ubw→對城 推)×`npDefScale_`(由 ubw/神核/god_hand/territory 推) → `NP_SCALE_MATRIX` 倍率(**已壓縮：對城打對人×1.5、對界×1.7、min×0.4**；非舊×2.5/3.0)。`ea` 寶具：×1.7+4d12+80。
  - **⚔️ 對神(弒神寶具，2026-06)**：第5種尺度 keyword，**不入矩陣**(特判)。對「神性」之敵(`loserDivine`)×2.4 單體特大(弒神)、對凡人僅×1.15。迦爾納梵天弒神之槍 Vasavi Shakti 用此(多寶具選項，見 `servantNpOptions_`)。注意引擎無「對城/對軍↔對神」矩陣交互，純看守方有無神性。
  - **🌟 多寶具英靈(`servantNpOptions_`)**：斯卡哈L／吉爾(王財·**Ea對界核爆**)／伊斯坎達爾／EMIYA(UBW對城·偽螺旋劍)／**迦爾納(Vasavi對神·Kavacha對人)**。首項=主寶具(敵方預設用)。玩家 set_np_choice 選。
  - **🦠 病死宿命(疫病克制，2026-06)**：攻方帶「疫病」trait(蒼白騎兵)＋守方帶「病死宿命」trait(恩奇都·原作病死) → **scaleMult=3.0·無視規模防禦**(概念碾壓·重演宿命之死)。優先於對神/矩陣判定。要擴充就給該從者掛 `{n:'病死宿命'}` trait。
  - **🦠 對瘟疫抗性(蒼白弱點，2026-06)**：守方持「對魔力≥B」或「神性」trait → 蒼白騎兵(疫病)傷害 **×0.5**(神之加護/魔術防護擋疾病)；**病死宿命之敵例外**(不受此減·照樣被碾)。蒼白寶具 EX→**A**(削弱·488/凡人·152/神性)，定位＝屠無防護凡人從者、被神性/魔抗剋。
- **🔋🔋 出力電池制(2026-06 大改·玩家定案)**：**從者【沒有自有魔力池】**(召喚時 MP/MAX_MP=0)，全靠御主供魔。**御主MP＝唯一且持續的魔力資源(電池)**。從者有「靈基出力檔位」(玩家旋鈕，20/40/60/80/100，存從者 MEMORY【出力】，預設60巡航)：
  - `outputTier_(pct)`(Core_Settings)→`{hit,dmgMul,drainMul,np,label}`五檔：100%(+3/×1.3/×2.0/可放寶具/全開)、80%(+1/×1.1/×1.5/高壓)、60%(0/×1.0/×1.0/巡航)、40%(-2/×0.85/×0.6/節流)、20%(-5/×0.7/×0.3/維持)。`snapOutput_`吸附、`servantOutput_(memory)`讀、`setServantOutput_(memory,pct)`寫。
  - `resolveFateBattle_`：`atk.output`(rowToCombatant_ 從 MEMORY 讀)→`outMod=outTier.hit`(命中)；勝方傷害 `base×outputTier_(winner.output).dmgMul`。
  - **寶具僅出力 100% 可解放**(`actionFateBattle` 閘：`servantOutput_<100`→擋並提示)。前端 `servantStrike(useNp)` 自動先 `set_servant_output:100`(解放寶具＝全開)。
  - **set_servant_output** action→`actionSetServantOutput`(免費即時，不耗AP)。前端從者卡「🔋靈基出力轉盤」5鈕；`get_tags` servant 物件帶 `output/outputLabel`。
- **👑 王之財寶(gob) 常駐被動(2026-06)**：吉爾伽美什不再把 gob 當主動技——`resolveFateBattle_` 內**每擊**命中+5 ＋ `gobVolley_()`(50d3 捨去1，EV≈83)無盡兵裝彈幕傷害，不論模式都壓制全場。模擬：金閃普通模式對全場 31%→**80%**(回到 top3，貼合原作「最強之一」)。其主動技槽自動落到鼓舞(morale)。
- **⚡ 從者專屬主動技(2026-07 大改·單層歸屬)**：`servantActiveSkill_(c)` 現在**只給 3 種原作真·意識施放技術**、且**每個 fx 只活在單一層**(消滅 double-dip)：
  - **⚡主動 only**(下方 `resolveFateBattle_` 被動層已【移除】其加成)：`burst 魔力放出`(傷×`1+0.45×rankMul`)／`str_up 怪力`(傷+`8×rankMul+14`)／`projection 投影`(命中+9、傷+`34+0.6×寶具rankVal`)。rank 尺度折進主動值(舊「被動＋主動」合計威力→改按下才拿、隨技能自身階級成長)。
  - **🛡被動 only**(從 `servantActiveSkill_` 候選拔除、只留 `resolveFateBattle_` 被動)：`morale 卡里斯瑪`(常駐氣場·傷+3×rankMul·敵透化免疫)／`aim 千里眼`(恆常眼力·命中+4×rankMul)／`self_mod 自我改造`(定型軀體·命中+2傷+3)。
  - **無真·施放技術者 `servantActiveSkill_` 回 `null`**(不再有通用「集中」備援)→前端 `previewActiveSkill_`/`myActiveSkill` 據此**不顯示⚡主動技鈕**；`actionFateBattle` 對 null skillBuff no-op 不扣魔。
  - **敵AI無按鈕→自動施展招牌施放技術**(免費·戰鬥本色)：`Router_Battle.gs` 敵反擊 `fateStrike_(...,{skill:servantActiveSkill_(enemyNow)})`＋`Router_Movement.gs` `enemyAmbushOnServant_` `resolveFateBattle_(...,{skill:servantActiveSkill_(enemyC)})`——精確還原「改制前這些是免費被動」的敵方戰力，避免單層歸屬悄悄削弱敵人(玩家側才改為主動付魔)。
  - **對魔力交互**：`atkMagic` 的 burst 判定改為 `opts.skill.id==='burst' && winner===atk`(實際發動魔力放出才算魔術系一擊)，非光憑持有——否則沒發動只吃對魔力減傷卻無 burst 增益。
  - **前端 UI(玩家一看即懂)**：從者卡技能膠囊——主動技(burst/str_up/projection)標**青色`#7ec8ff`＋⚡前綴**(`ACTIVE_FX_JS`)，被動技維持金色；提示行加「⚡藍標＝主動技(普攻無加成，須點⚡發動)」；`FX_DESC` 三招標「(⚡主動技)…★普攻無加成，須主動點發動、耗魔力」，被動三招標「(被動)…每擊自動生效」。⚡主動技鈕改**顯示招式名**(如「💥 魔力放出」)、僅對有真·施放技術的從者出現。
  - `actionFateBattle` 啟動耗魔 `200×mpPct`(30/24/24)→`drainForNp_` 抽御主。
  - **🎚️ 改「開關制」(2026-07 玩家定案)**：主動技不再是每次攻擊的戰場按鈕，改成**存從者 MEMORY【主動技】on/off 的持久開關**(預設 off)。`Core_Settings.gs` `activeSkillOn_`/`setActiveSkillMode_`(仿 runeMode 助手)；action `set_active_skill`→`actionSetActiveSkill`(Router_Economy.gs·免費即時·樂觀更新)。
    - **ON**＝每場戰鬥自動【全效】發動＋`drainForNp_` 扣魔【一次】(非每回合，該區塊在回合迴圈外只跑一次)。**OFF**＝`tinyActiveSkill_(full)` 微量被動(完整的 `ACTIVE_SKILL_TINY_`=0.35 倍)、**免費**。開/關二選一、永不並存→不回 double-dip。
    - `actionFateBattle`：`_fullSkill=servantActiveSkill_(atkC)`；on→`skillBuff=_fullSkill`＋`skillActivated=true`＋扣魔；off→`skillBuff=tinyActiveSkill_(_fullSkill)`。report/aiPrompt 的「主動技發動」宣告改吃 `skillActivated`(只 ON 才報)；fired 明細標籤 tiny→「(微量)」、full→「(主動技·全開)」。`atkMagic` 的 burst 判定加 `!opts.skill.tiny`(微量魔力放出不算魔術系一擊)。
    - **敵AI**：`servantActiveSkill_(enemyNow)` 恆走**全效·免費**(敵無開關·戰鬥本色)，維持改制前敵方戰力；玩家預設 off(微量)＝可自選升 on。
    - **前端**：get_tags servant 帶 `activeSkillOn`；從者卡技能膠囊——主動技 fx(`ACTIVE_FX_JS`)顯示為**開關標籤**(亮青⚡ON/暗青⚡OFF)，點開 `showActiveSkillToggle(sv,name,fx,rank,on)` popup 看說明＋切換鈕→`setActiveSkill(sv,on)`(呼 set_active_skill＋syncData)。⚡戰場攻擊按鈕已【移除】。FX_DESC 三招標「🟢開啟＝…每戰耗魔／⚪關閉＝微量免費」。
- **🗂️ 技能 fx 格式表 `SKILL_FX_`(2026-07 資料驅動重構)**：`Engine_Fate.gs` 把散落的主動技 if 鏈＋線性被動加成收成**一張表**，要加/調技能＝改一列。欄位：`active/prio/mpPct/icon/descFn`(主動施放技術)、`zh`(中文名·fired fallback)、`hit/hitAdd`(命中·攻方)、`dmgMul/dmgAdd`(傷害·勝方，皆可數字或 `r=>`/`(r,c)=>`)、`blockedByLoserFx`(敗方有此 fx 則免疫)、`silent`(傷害段不推 fired·morale靜默/self_mod避免重列)、`note`(標籤後綴)。
  - 收表者：主動 `burst/str_up/projection`(引擎 `servantActiveSkill_` 掃 active 依 prio)＋線性被動 `aim/self_mod/morale/fast_cast/mad/divine_age/wind_strike/crafting`(`resolveFateBattle_` 於**原位置**呼 `fxHitAdd_`/`fxDmgApply_`＋`skillFxVal_`)。**位置/順序/標籤/數值與重構前一致**(morale/self_mod 在 mystic·ambush 乘子【前】、其餘在【後】，故分兩處呼叫而非單一迴圈——保平衡數值不漂)。
  - **不進 SKILL_FX_(保持明碼·特例)**：骰子彈幕 `gob/chain`(gobVolley_/chainVolley_·隨機+多段)、時機/條件觸發 `stealth`(僅 ambush 首擊)/`tsubame/petrify/gae_bolg`(寶具條件·改對手迴避或必中)、`god_hand`(復活·非戰鬥數字)、`weapon_steal`(敵龍 trait 條件)、`mad` 的命中/迴避-penalty(雙向)、`divine_age` 使敵對魔力半效之交互。硬塞進表＝過度工程。
- **🛡️ 防禦 fx 格式表 `DEF_FX_`＋防禦規模表 `DEF_SCALE_`(2026-07 資料驅動·對稱攻擊側)**：`Engine_Fate.gs`。
  - **`DEF_FX_`＝平減傷 fx 表**(`rho_aias`×0.6／`territory`×0.74／`wall_def`×0.82／`divine_core`×(1-0.18r))：欄位 `mul`(數字或 r=>)｜`pierceKey`(概念貫穿判定的防禦概念名)｜`zh/note`(fired 標籤)｜`physicalOnly`(僅擋物理·魔術系穿透，wall_def)｜`alsoPiercedByFx`(此攻方 fx 亦無視，divine_core←anti_magic_lance)｜`piercedMsg`(被貫穿時推的訊息 fn，territory/divine_core 有·rho_aias/wall_def 靜默)｜`guardPositive`(base>0 才推標籤，territory)。引擎 `fxDefApply_(base,loser,winner,fx,pierces,atkMagic,fired)` 於 `resolveFateBattle_` 各 fx【原位置】呼叫(位置/順序/標籤/數值與改前一致——因夾雜其他乘子·分處呼叫不併迴圈)。
  - **`DEF_SCALE_`＝防禦規模表**(2026-07 收斂：`c.horrorUp`(🐙海怪在場·變身態)→對城、`territory→對軍`)：`npDefScale_(c)` 先查 horrorUp 再掃表，餵 `NP_SCALE_MATRIX[攻][防]`(對稱 `npAtkScale_`)。`summon_horror` fx 恆給對城已改綁狀態；`wall_def` 移出規模表(本職＝物理減傷×0.82·恆給對城會架空海怪變身＋AI 自訂掛牆砍半對人寶具)。
  - ⚠ **兩層防禦別混淆**：①`NP_SCALE_MATRIX` 規模相剋(對城攻打對人防 ×1.5…，`npAtkScale_`×`npDefScale_`)＝粗粒度；②`DEF_FX_` 平減傷(pierce-gated)＝細粒度。`territory/wall_def` 同時出現在兩層(既是規模防、又是平減傷)——刻意分層。
  - **⚡ 按下前先預覽(2026-07)**：`Script.html` `previewActiveSkill_(skills)` 鏡射後端優先序＋耗魔(30/24/24)，`servantStrike` 的 `useSkill` 分支比照 `useSeal`/`useNp` 加 `confirm()`，秒顯招式名/效果/約耗魔力再確認；回 null 則 alert「此從者無可主動施放的技術」。實際判定與扣魔仍以後端 `servantActiveSkill_`/`drainForNp_` 為準。
  - **⚠ 原作查證·哪些配主動(2026-07)**：用 8-agent workflow 查證(TYPE-MOON Wiki，**刻意排除 FGO——FGO 把每個 personal skill 都做成冷卻按鈕、不能當「主動 vs 被動」的判準**)。結論：**魔力放出/投影＝每次意識施放的技術；怪力＝限時激發**(非常駐)→三者配⚡主動。**卡里斯瑪(與生俱來統率氣場)/千里眼(附於肉體的恆常眼力)/自我改造(已定局的軀體構造)＝常駐被動特性**→只留被動、拔出主動候選。**氣息遮斷＝刺客職階被動**(擺攻擊姿態即自動驟降·不可花魔重買)→僅 `opts.ambush` 免費首擊。**七天盾(rho_aias)＝自動觸發被動防禦**，維持現況。順帶修掉「morale 主動 +8 傷繞過 clear_mind 透化免疫」隱藏 bug(morale 失去主動路徑後自動消失)。
- **🌟 乖離劍·執行殺(ea／英雄王，2026-06)**：`resolveFateBattle_` 開頭——**僅 `opts.np`(解放寶具，即出力100%)＋英雄王【自身】血量≤40% 才觸發**(傲慢→認真)。傷害 `寶具rankVal×4＋6d12＋200`、必中越防、early-return。血量足走常規寶具(×1.7)。⚠ 舊「對面血≤30%免費每擊觸發」bug 已修正。
- **🔋 御主電池付款(2026-06 出力制)**：`npPranaCost_(寶具階)`＝**E40/D70/C110/B160/(A·A+·A++)220/EX300**(對齊御主池迴路×8≈240：A階≈耗盡滿池、EX須再焚血；EX/EA 極罕見)。`drainForNp_(sheets,pcData,svIdx,masterIdx,mpCost)` 付款序 **①御主MP ②御主HP**(`BATTERY_HP_PER_MP`=2HP→1MP，血底線1；從者無池，fromSv 恆0)。寫進 report.battery＋前端血條。御主血魔皆空才擋寶具。
- **🔥 灌魔加乘·灌魔超載(2026-07·規格外寶具才有旋鈕)**：`npOverloadCap_(寶具階)`(Engine_Fate·資料驅動數 '+'／EX)→無＋=1.0(定額·不可調)、＋=1.5、＋＋/EX=2.0，對應原作「A++對城劍隨輸入魔力提高威力」，跨名冊通用(Excalibur/Enuma/Ea)非某人專利。`Router_Battle` NP 段 **auto-pour**：僅【全開100%】的＋/EX寶具，把御主餘裕魔力(MP+焚血+過充額度)超載灌入 → 達上限需額外「底費×2」的魔力·不足按比例，倍率 `atkC.npOverloadMul` 壓在 combatant 上(不改簽名·比照 output/npChoice)、`resolveFateBattle_` 寶具解放段 `wRelease` 才乘(對手反殺不吃)。戰報 `report.overload`(>1.25 前端橫幅🔥×N)。**敵方 NP 不超載**(暫·敵幾乎無餘魔·可續作)。
  - **🔥 補魔過充 token(2026-07)**：`getOvercharge_/setOvercharge_/clearOvercharge_`(Core_Settings·存御主 MEMORY`【過充】<額度>`)。`actionManaSupply` 補魔後除回滿池，另存**一池份(=補魔當下 newMpMax)可【無償】超載灌入的魔力**；發動＋/EX寶具時**只擴充「超載段」預算(masterSurplus+ocBonus)、只無償支付超載段·絕不代付底費**(底費恆由御主自付·上游閘門已保證)；真的灌到超載才消耗、**一次性(發動即清)**，沒派上用場則保留。同時掛 `atkC.overcharge`→resolveFateBattle_ 全能力微揚(命中+2·傷×1.06)。非＋寶具/未全開→token 不動。串成原作「補魔→梭哈大砲」：40迴路無過充 A++≈×1.7(梭哈榨乾)、補魔後 token 撐到 ×2.0 且御主真扣≈底費220(超載段全由 token 無償)。
- **⚖️🔋 共用魔力池(2026-06)**：從者與御主**共用一個魔力池**(存御主MP)。上限 `masterPoolMax_(迴路, 同隊從者魔力val總和)`＝**迴路×6 + 魔力×2**(迴路30+Saber魔A→280；Berserker魔B→260；Assassin魔E→200)。`masterMaxHpMp_` 只給無從者基底(HP100+迴路×2／MP迴路×6)。召喚(actionSummonServant 併入從者魔力、補滿)＋時回(applyRegen 重算)動態更新。回魔＝御主迴路供給＋從者魔力×0.15(從者少)＋靈脈/工房。Caster(魔A·低維持)幾乎自持，Berserker 吃魔。
  - **🐛→✅ 敵御主池子原本沒套這條公式(2026-07 補公正性)**：`Seed_Rivals.gs` 的 `masterToNpcRow_`/`fakeMasterRow_` 舊版 MP 只算御主自己迴路(`masterMaxHpMp_`)，**完全沒把契約英靈的魔力階算進去**——同樣迴路30配阿爾托莉雅(魔力A)，玩家隊算出280、敵隊卻只有180，明顯偏小不公正。已改兩者都吃 `heroMagicRank_(heroRow)` 讀該英靈六圍魔力階、`masterToNpcRow_` 改用 `masterPoolMax_(circuits, rankVal(魔力階))`／`fakeMasterRow_`(無迴路資料的偽聖杯匿名御主)改用 `80 + rankVal(魔力階)×2`。四處建立敵御主的呼叫點(`chaos`隨機配對／`fake`偽聖杯／`4th`/`5th`正史) 都已補上英靈魔力階參數，一次到位。
- **♻️💧🩸 回魔三態(2026-06)**：①♻️靈脈/陣地/休息＝免費自然回魔(首選)；②💧**補魔(燃迴路·主動)**＝回滿池 BUT【永久】燒蝕 血量上限−15、迴路−3(地板：迴路≥8、HP上限≥40)，過度＝慢性自盡(`actionManaSupply`)＋**存一次性【過充】token(下一發規格外寶具可全力超載·見上「灌魔超載」)**；③🩸**燃血(被動)**＝**池見底**、時消耗補不上時，`applyRegen_` 自動把缺口÷2同時扣御主HP＋從者HP(平均·各保底1)，不再強制降出力——想少流血就自己節流。`actionBloodSupply`/blood_supply/前端 bloodSupply 已全移除。
- **🏷️ 被動 fx 功能化(2026-06)**：`resolveFateBattle_` 內生效的常駐被動——神性(被神殺者×1+0.5×神性階,上限2.0)／黃金律 wealth(金閃自身HP≤20%免魔力放 EA)／天之鎖 chain(`chainVolley_` 18d3捨1,gated !gob,對神性另有縛神性 debuff)／原初符文 rune(loser 減傷10%×階)／**變化 shapeshift(守方迴避+3×階,滑開致命擊)**／**道具作成 crafting(winner傷害+8×階,備妥之器)**／**無毀的湖光 weapon_steal(蘭斯洛特·Arondight)：對具「龍/竜」trait之敵傷害×1.5(對龍解放)——龍 trait：阿爾托莉雅(龍之因子)、莫德雷德**。台灣譯名：寶具「騎士不為孤軍/騎士不死於徒手」、聖劍「無毀的湖光」(非「湖光奪兵」——那不是官方譯名)。
- **🔮✨ 可選借得技能·mage_realm(2026-06，2026-07 通用化)**：`{n:'X',fx:'mage_realm'}` 的從者，玩家在從者卡點選盤挑 **1 個** `mageRealmPool_()` 內的通用 A 階被動(對魔力/怪力/心眼/透化/軍略/自我改造——皆有階級、非寶具/簽名)。`actionSetMageRealm`→存 MEMORY【魔境】fx→`rowToCombatant_` 戰鬥時注入 skills(r:'A')。**2026-07 通用化**：不再寫死「魔境的智慧」——`pill` 用技能自己的 `sk.n`、`openMageRealmPicker(sv,curFx,title)` 吃 title 顯示各從者本名。目前持有者：**斯卡哈-Lancer「魔境的智慧」**(影之國通曉武技)、**尼祿-Saber「皇帝特權」**(EX·她覺得自己會就會了→挑一門借得)。要再給誰「可選借得技能」＝把該技能 fx 設 `mage_realm` 即可(共用同池同引擎)。**可選能力標籤一律發亮**：`pill()` 第5參 `glow`＋`.tag-selectable`(Style.html `@keyframes tagGlow`)＋'✨'。
- **⚔️ 尼祿 kit 修正(2026-07·v21)**：原本 皇帝特權＋縱使三度迎來落日 **雙掛 survive**(第二個 survive 無作用·空轉)。改：皇帝特權 EX→`mage_realm`(可選借得技能·貼原作「借得不具之技」)、縱使三度迎來落日 保留 `survive`(＝FGO 戰鬥續行，精準對應)。頭痛宿疾 fx:'' 演出用弱點(不動)。
- **⚠ petrify 標籤中性化(2026-07)**：`petrify` 被 美杜莎(魔眼石化)/斯卡蒂(冰凍暴風雪)/蒼白騎兵(感染疫病) 共用當「鎖死迴避」，但戰報原寫死「石化壓制/魔眼·石化貫穿」對冰/疫語意不符。改用 `fxName_` 顯示各技能本名＋中性後綴(`·鎖死身法`/`·乘隙重創`)；FX_DESC 也改中性「鎖死身法（魔眼石化／冰封／疫染等）」。
- **🩹 專屬治癒 fx `regen`(2026-07·v22)**：常駐每回合涓流回血(約 2.5%×階/回合·上限30)，**無需選模式**(有別於 `rune` 的 regen 模式要玩家選)。`Router_Battle.gs` 回合迴圈回血區塊統一兩來源：符文 regen 模式 OR 持 `regen` fx(後者標籤用 `fxName_` 顯示技能本名·如「金羊毛」)。美狄亞加「治癒魔藥（限定不老不死）」B·regen——**FSN 原典**：她的治癒來自道具作成系的回復魔藥(可授限定不老不死)，非「金羊毛」(金羊毛 Argon Coin 是召科爾基斯龍的第二寶具·FSN 全程未使用)、也非「甦生大釜」(希臘神話廣義·非 FSN 材料)。已進 ALLOWED_FX_/FX_MENU_(AI 從者可當治癒型)。玉藻前「狐之治癒」目前仍掛 rune(可選)，要純治癒可改 regen(未動)。
- **🔄 種子改了要傳到「已在場從者」**：召喚是**讀英靈殿 sheet**(非 SEED_SERVANTS 陣列)→ 凍進眾生列(MARTIAL/SIX/TAGS)。改 SEED 後不會自動生效！傳播鏈：①升 `CODEX_PERSONA_VER`(Seed_Codex)→ `seedFateCodex_`(每次 doGet/action 經 ensureFateSheets_ 跑、版本不符才動)→ `upgradeCodexPersonas_`(刷英靈殿) ＋ `resyncSummonedServants_`(刷已召喚從者的寶具/六圍/標籤，依真名+職階對應種子；不動 HP/MP/MEMORY/敘事/狀態)。**動了 SEED 的六圍/寶具/標籤(如新增魔境的智慧 fx)務必升版本**否則 UI/戰鬥都吃舊值。`resyncSummonedServants_` 含玩家從者＋敵從者(FACTION 從者/敵從者)。⚠ 版本閘靠部署時序＋script property，可能卡住→另備**手動強制鈕**：主選單 DEV「🔄 套用最新平衡到現有從者」→`dev_resync_codex`→`actionDevResyncCodex`(無視旗標，立刻 upgradeCodexPersonas_＋resyncSummonedServants_ 並回報筆數)。
- **⏳ 全域等待遮罩(2026-06)**：`beginAction(msg)` 進場即 `showProcessing(msg||'聖杯演算中…', true)`(quick 模式·隱藏「10～30秒」那行)，`endAction` 收場 `hideProcessing()`。所有走 beginAction 的動作(出力/補魔/強撐/魔境/休息/偵查/戰鬥…)都有即時回饋，玩家才知道按到了。召喚/締約流程仍用非 quick(顯示秒數)。
  - **🐛→✅ narrate() 補 await，別讓 AI 敘述還沒回來就解鎖按鈕(2026-07)**：`narrate(res.aiPrompt)` 原本刻意不 await(先秒顯 `renderFateBattleReport` 數字戰報、AI 敘述背景補上，見上「等待動畫」一節)，但這連帶讓外層 `try{...}finally{endAction()}` 的 `endAction()`(解鎖 `__actionBusy`)在 AI 敘述還在跑時就先執行——玩家能在敘述回來前搶按下一個動作，容易讓故事順序亂掉。修法：**數字戰報依然秒顯不受影響**(它在 narrate() 呼叫之前就已經 render 完)，只是把 `narrate(...)` 前面補上 `await`，讓 `endAction()` 等到敘述真正生成完才執行、按鈕才解鎖。`Script.html` 全部 `narrate(...)`呼叫點(servantStrike/travelTo/rest/scout/scavenge/breakAlliance/proposeAlliance/allyBond/bond/useSeal/ruleBreakSteal/secondWind等)已全數補上 await。
- **⚠️ 寶具尺度標籤是「會算進傷害的」(別當純文字)**：`npAtkScale_`/`npDefScale_` 直接 regex 讀 np 字串裡的 `對人/對軍/對城/對界`(＋部分 fx)決定 `NP_SCALE_MATRIX` 乘子(對界最高×1.7)。**亂寫高階標籤＝偷偷暴力 buff**。已修正誤標：斯卡哈-Lancer(原誤標 對界 A→實為 對人B+ 槍＋對軍A+ Gate of Skye)、斯卡蒂(原誤標 對界 A→support 對人 A)——兩者把 97%/81% 拉回 ~82%/55%。新增/改寶具文字務必對齊真實尺度。範圍(5~50)/最大捕捉(200人)是純敘事、引擎不讀。
- **🐕 主從synergy(2026-06，原作「御主供魔/契合提升從者能力」)**：`masterSynergySix_(name,six,memory)`(Core_Settings)讀從者列 MEMORY【御主】名，特定主從組合回到全盛六圍。目前只 **恩奇都↔銀狼(獵犬御主，原作真正的御主)→ 全A·寶A++**；其餘御主(含玩家自召)下恩奇都維持**削弱基線**(種子已降為 筋C/耐B/敏B/魔B/寶A)。`rowToCombatant_` 套用。擴充別組就往該表加。
  - **🐛→✅ 2026-07 修正**：原碼誤把「巴茲狄洛特」寫成恩奇都的御主(且 `FATE_FAKE_ROSTER` 也錯把恩奇都配給巴茲狄洛特)——查證 TYPE-MOON Wiki 後確認**巴茲狄洛特真正的從者是赫拉克勒斯(Archer)**，恩奇都的原作御主是**銀狼**(以銀狼為觸媒召喚、令咒落在狼身上，恩奇都便認狼為主)。已同步修正 `masterSynergySix_`／`Engine_Fate.gs`／`Seed_Codex.gs` 註解＋`FATE_FAKE_ROSTER`(見下)。
- **🗡️ 赫拉克勒斯-Avenger／阿爾喀德斯(2026-07 正名，`wars:['fake']`，`cls:'Avenger'`)**：Fate/strange Fake 原作——同一位英靈在 5th War 是 Berserker，在偽聖杯被巴茲狄洛特的令咒**「歪曲」強制扭成 Avenger**(阿爾喀德斯)，非單純 Archer。**捨棄神性與不死性換取「十二榮光」寶具群**→故【無十二試煉 god_hand 復活】(那是 Berserker 版專屬)。六圍官方 A/B/A/A/B/A++；職技 對魔力A／**復仇者A(fx `god_slay`·天生噬神：憎恨並踐踏一切神性)**／單獨行動B；保有 心眼(真)B／勇猛E(神詛拉低)／戰鬥續行A+。仍保 `神性A` trait(血肉充神氣·高神性者→自身亦被神殺剋，自我憎恨的神性體)。寶具：射殺百頭 Nine Lives(對軍A+·纏海德拉毒龍)／十二榮光 King's Order(A++·十二功業寶具具現)／天風的篡奪者(EX·篡奪敵寶具)。`FATE_FAKE_ROSTER` 配御主巴茲狄洛特(柳洞寺)。⚠ `cls:'Avenger'` 非 KNIGHT_BEATS 三角/非 VALID_CLS(僅限用戶自建)，走 `combatProfile_` 近戰預設——皆 graceful no-op·不炸(同貞德 Ruler)。
- `aliveEnemyServants_(sheets,gameId)`：在世敵從者數（勝利判定用）。
- `enemyRetreatLoc_`：令咒緊急脫離時敵退避地點。

### actionFateBattle 流程（Router_Action.gs）
1. 找出戰從者 `atkIdx`(userData.servant 指定或第一個)、目標 `nIdx`。同地檢查、AP 檢查、盟友不可打(`isAllied_`)。
2. **斬首**：目標=敵御主且有從者護衛→每名在世從者擲 D20，任一=20 斬殺御主(+護衛隨亡)→勝利判定；全失手→護衛反噬每人 1.5×。
3. **一般戰**：ROUNDS=3 回合。`partyIdxs`=所有在世從者(雙從者齊攻)。寶具/令咒只加在 atkIdx 開場第一擊。寶具魔力走 `drainForNp_`(御主電池)，前置 `maxPay` 檢查唯三者皆空才擋。
4. **協同強襲**(§8)：`allyAtkIdx`=同地盟友從者，每回合對共同敵人助攻一擊(不被反擊)。
5. 敵反擊：`enemyNpSpent` 一場限一次寶具。**🛡️ 寶具閘(2026-06)**：寶具是孤注一擲殺招、非見面招呼——敵唯有**自己被打殘**(`eHpRatio<0.5`)或**我方從者已殘可收尾**(`pHpRatio<0.45`)才解放真名；健康對健康一律普攻試探(免玩家一接觸就被無預警寶具秒殺)。觸發後再吃 `eNpUrge`(狂/暗0.22 else 0.10)+殘血加成的機率擲。
   - **🔋 敵寶具吃魔力(2026-07 對稱化)**：敵從者跟玩家從者同制——**無自有魔力池**(`heroToNpcRow_` 召喚時 mp=0)，寶具魔力全查 `enemyCanAffordNp_`(`enemyMasterIdx_` 敵御主電池 ≥ prana)才放，並 `drainForNp_` 扣魔；付不起→改普攻/不對轟。masterless(御主已死/查無連結)敵從者：一般英靈直接寶具自限(啞火)；有**單獨行動**(`fx:'solo'`)者靠靈基殘存硬撐固定小額 `INDEPENDENT_ACTION_RESERVE`(=60，不隨階級放大，通常不夠再放一次真寶具)——是「殘存的最後一口氣」非「獨立供魔」，別加大。EX/EA(prana300)幾乎沒人付得起→極罕見。
   - **🔋 敵御主每日回魔(2026-07)**：敵御主電池只被 `drainForNp_` 扣、從不隨時回自然恢復(那套只算玩家隊，見上「共用魔力池」)——若不補，長局裡放過一次寶具後就永久魔力見底、後續遭遇全部啞火，失去「寶具是孤注一擲」的張力。不用玩家那套逐時供需經濟(NPC 不必算到那麼細)，改用最簡單的**新的一天回滿**：`worldTick_`(Time_World)每次執行都呼叫 `refillMastersDaily_(sheets,gameId,day)`——MEMORY 記 `【回魔日】{day}`，見到記錄的日 < 當前日 → 該敵御主 MP 補滿並蓋新日期戳。
   - **🏷️ 技能白話字典 `FX_DESC`(Script.html `showSkillDesc`)**：玩家點技能 pill 彈出的說明，依 fx 對照公式即時算出當前階級的實際數值(對齊後端 `rankMul_`)；沒對到的 fx 落回「此技能主要為演出／劇情效果...目前無獨立數值」的通用備援。**2026-07 補完**：稽核發現多個 fx(aim/chain/crafting/divine/fast_cast/mage_realm/petrify/projection/rho_aias/rune/shapeshift/solo/territory/wall_def/weapon_steal/zabaniya/summon_horror/wealth)在 `Engine_Fate.gs::resolveFateBattle_` 裡明明有真實數值，卻沒進這張字典、被誤標成「無獨立數值」——已全部補上對應公式/描述。**要加新 fx 就同時補這裡**，否則玩家點開看到的說明會跟實際戰鬥數值脫鉤。
   - **🧹〔發動〕清單去重(2026-07)**：`fired.push(name+'·'+text)` 每筆都帶施放者全名，同一擊多個效果連發時整排重複報名(尤其長名字/多技能從者)。前端 `renderFateBattleReport` 新增 `stripOwnName(list, ownName)`：對照該行主角(`k.by`/`r.def`)剝掉剛好等於自己的重複前綴，只留效果字；別人的名字(如守方自身被動)不受影響照樣保留以區分是誰的效果。純前端渲染層修正，不動 `fired`/`aiPrompt` 等後端資料。
   - **⚠️ 種子與已在場敵從者標籤不同步的教訓(2026-07)**：查獲已召喚的敵從者(赫拉克勒斯)戰報顯示「對城防」，但 `Seed_Codex.gs` 源頭六圍/標籤查證是乾淨的(無 `wall_def`/`summon_horror`/`territory`)——判定是該場已召喚的舊列標籤未跟上種子修正(版本閘卡住的已知風險，見上一條)。處置＝升 `CODEX_PERSONA_VER` 強制全體 resync，而非改邏輯(邏輯本身是對的)。`wall_def`(城牆防禦·物理減傷18%)目前全種子庫只有吉爾德萊(青鬍子)持有，他同時也有 `summon_horror`，故防禦規模判定上兩者對他而言重疊(非 bug，只是同一人剛好兩個標籤都給對城)；`wall_def` 本身仍是獨立技能(有自己的物理減傷效果)，非純標籤重複。
   - **🛡️ 十二試煉概念燒命(2026-06)**：god_hand 致命時，`lossN=1`＋寶具概念加成(取 `offenseTier_` fx階 與 `npAtkScale_` 規模階 較高者：≥6→+2、≥5→+1)＋overkill(傷/復活線 ≥3→+2、≥2→+1)。`lossN≥餘命`→餘命一擊燒盡、不復活落入 destroyed。解決「Saber 對城 Excalibur 連一命都燒不掉」。
   - **🐛→✅ God Hand 優先序修正(2026-07)**：`fateStrike_` 原本「令咒緊急脫離」判定在 God Hand 之前，導致持 god_hand(如赫拉克勒斯十二試煉)的敵從者致命時，30%機率白白燒掉御主寶貴的令咒去逃命——牠自己就能免費復活，不該花這個資源。已對調順序：**God Hand(免費自復活)先判定，判定失敗/餘命燒盡才輪到令咒脫離**當最後手段。改一處要想「別的死法會不會也搶著判」的範例。
   - **🐛→✅ sealNote 別把「★」AI指令塞進玩家看得到的欄位(2026-07)**：`out.sealNote`(令咒脫離摘要)同時會被塞進 `rl.strikes[].note`(玩家直接看到的回合報告，不經AI)＋`aiPrompt`(AI才看)兩處。舊版把「★此撤離僅止於...與在場其他御主／從者無關」這句**AI專用鷹架指令**直接寫進 `sealNote` 字面，玩家在秒顯的數字戰報裡就會讀到裸露的「★」指令、莫名其妙。已把這句移出 `sealNote`，改在組 `aiPrompt` 時另外接上，`sealNote` 本身只留「發生了什麼」的乾淨敘述，兩個受眾各自拿到該給的版本。
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
- **Seed_Canon.gs**：📜 正典劇情插針系統 **已退役(2026-06 玩家定案·沒啥用處)**。`checkCanonPins_` 留 no-op 空殼(永遠回 {beats:[],leads:[],route:""})；actionMove/actionRest 不再呼叫、前端不再顯示 canonBeats/canonLeads；CANON_PINS 資料＋lockRoute_/spawnGilgamesh_/blackenFoe_/shadowDevourFoe_/route 讀寫 一併移除。**未動**：正史/混亂【戰爭】模式＋扮演正典御主(敵方陣營生成，在 Router_Action)。MEMORY【路線】【史】成無用遺留。

---

## 6. 禮裝 Mystic_Code.gs（2026-06 全面被動化）

- **★禮裝全部被動·持有即生效·無主動發動**（玩家定案）：戰鬥時自動加持「我方從者」，不再有按鈕／充能／迴路門檻／起源彈狙御主。
- `MYSTIC_CODES{}`：每項 `{name,type,fx,tier,desc,flavor}`。type＝`passive`(avalon/寶石劍/月靈髓液/起源彈/魔力寶石/黑鍵) 或 `special`(rule_breaker 破戒奪僕·另套機制)。fx 進 `MC_COMBAT_` 表。
- **`MC_COMBAT_{fx→{hit,dmgAdd,npMul,npDefMul,label}}`**：禮裝戰鬥效果表（單一調平衡點）。
  - mc_blackkey(命中+2)／mc_jewel_minor(命中+1,傷+10)／mc_origin(命中+3,傷+8)／mc_mercury(命中+4,承受寶具×0.88)／mc_jewel(寶石劍·解放寶具傷×1.5)／avalon(承受寶具×0.82 ＋ Time_World 時回×1.6)。
- **接線**：`masterMysticBuffSkill_(memory)`→{n,r,fx}；`injectMysticBuff_(c,masterMemory)` 把禮裝 fx 注入我方從者戰鬥單位 skills(冪等)。在 Router_Action `actionFateBattle` 三處注入：atkC(2198·含開場對轟)、每回合 sC、以及 `fateStrike_` 內 defC(我方從者作守方·吃 avalon 減傷)。引擎 `mcCombatFx_(c)` 在 `resolveFateBattle_` 三通道讀取(命中/winner攻/loser防)。注入只在戰鬥單位、不寫回 row。
- `getMystic_/setMystic_`(MEMORY【禮裝】id；**【禮充】充能已廢除**)、`masterMysticFx_`(查單一 fx，如 Time_World avalon)。
- `rollMysticForMaster_(standing,circuits)`：**身世/財力→起始禮裝機率**。富/名門/鐘塔/教會(或迴路≥45)→30%頂級；清貧/孤兒(或<20)→50%空手。`pickByTier_`、`equipMysticToMemory_`(僅寫【禮裝】id)。
- `canRuleBreak_(pcData,pIdx,gameId)`：是否具破戒力(召 Caster美狄亞 或 持破戒禮裝)。
- ⚠ 已移除：`actionUseMystic`／`applyMysticDamageToServant_`／`getMysticCharges_`/`setMysticCharges_`／前端 `mysticStrike`/`renderMysticReport`/敵卡禮裝鈕。

---

## 7. 時間/AP/供魔 Time_World.gs

- `getClock_/writeClock_`：時鐘表(game_id→day/hour/ap)。
- `getAp_/spendAp_(gid,n)/grantAp_(gid,n)`(不推時間)、`restHours_`(休息補AP)、`rollHours_`、`timeBand_`(晨/午/夜)、`clockLabel_`(顯示字串)。
- AP：每日12，移動2AP、戰鬥/偵查/補魔/禮裝/結盟/共處=1AP、休息每hr補2。
- `playerServantEconomy_`：**御主魔力**收支(左側 HUD，含 output/outputLabel)。**工房加成＝atHome‖hasTerritory‖atWorkshop**(atWorkshop 讀御主【陣地】marker，須與 applyRegen_ 對齊，否則設陣地 HUD 顯示不出 +8 時回)。`servantEconomy_`(income=迴路供給+靈脈+工房；drain=六圍/8×狂化)。**🔋 共用池 `applyRegen_`(2026-06)**：御主MP 是共用池——重算上限 `masterPoolMax_(迴路, Σ從者魔力)`；income(迴路供給＋靈脈＋工房＋Σ從者魔力×0.15)×mult − Σ(從者 drain × `outputTier_(出力).drainMul`)；從者出力檔不在時回變動；御主乾涸(連維持都湊不出)→強制全從者降【出力】20% ＋從者 HP 流血(靈基崩解 4%/hr)。御主HP/從者HP 自我修復 5%/hr×(avalon1.6)。`leylineAt_`、`masterCircuits_`(MEMORY【迴路】N 預設30)。
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
- `actionPurgeOrphans`(action `purge_orphans`，主選單 DEV「🧹 清殘列」)：清「眾生」表孤兒——刪①所有 `DEAD_` 列 ②game_id 非任一帳號當前連結(COL.ACC.PC 反推 liveGids)的世界(敗北殘局/棄局/亡靈)。**保留**：活躍戰局、game_id 空白列(創角中)、鑑賞另表。整表 rewrite(setValues+單次 deleteRows tail，非逐列)。連帶清關係表：只刪「被刪御主(PC_)名下、非存活、非鑑賞御主」的 rel(防誤刪鑑賞關係)。回 {removed,kept,relRemoved}。**用途＝縮表加速每次按鍵的整表掃描**(眾生肥大主因＝每局敵御主+敵從者整批殘留)。
- `findPlayerServant_`、`purgeGameData_`。
- ⚠ **舊 `actionListGallery/actionEnterGallery/actionGalleryTalk` 已移除**(被 enter_kanshou＋kanshou_* 取代)。

---

## 10. servantCard_ / persona 注入（show-don't-tell 核心）

- `codexPersona_(name)`：從英靈殿 PERSONA 撈細緻人設(firstP/words/toMaster/speech/moe/tic)。
- `masterCard_(row)`：御主「演出依據」卡(名/性別/性格/特徵/願望)，讓 AI portray 御主。**🗣️ 御主有聲(2026-06)**：【可】依性格給御主台詞/反應(不再啞巴主角)，但【不替御主拍板戰略抉擇】(出戰/結盟/移動/補魔由玩家按鍵)、不逼問玩家、不快轉越過決策點；從者可開口問御主怎麼辦、御主也可自問，但停在問句/思索不可自演答案。互動場景(ally_bond/bond/mana/blood)＝`masterCard_ + servantCard_`；移動抵達 `actionMove` 也回傳 `masterCard` 前置 arrivePrompt。
- **🎭 敵御主有聲(2026-07)**：`enemyMasterCard_(row)`——精簡演出卡(性格/特徵各取前3項，不塞六圍/寶具)，NPC 不受「不可替玩家決定」限制、AI 可自行決定其言行反應。只在敵御主本人**同地在場**時注入，靠 `enemyMasterIdx_` 找連結御主＋加一道位置比對(硬連結≠必然在場，可能是遠端指揮)；`actionFateBattle` 兩個 aiPrompt 分支(defeat/正常)都在 `servantCard_(pcData[atkIdx])` 後接 `enemyMasterCardStr`。解決「打從者對方御主全程沉默」的問題，且非每戰必塞——不在場則空字串。
- ⚠ **prompt 別再寫「嚴禁輸出 stat_changes/items_gained/money_transferred」**：solo 全走 `narrate_only`/`multi_attack_narrate`，後端只讀 `data.narration`、其餘欄位一律丟棄——禁令是多餘的、還把欄位名秀給 AI。已從 FATE solo prompt 全數移除(九州 actionPlay/item 路徑保留，那裡真的會吃 stat_changes)。
- `servantCard_` 含**狂化偵測**：persona.speech/firstP 含 狂化/無法言語/咆哮 → 加「禁說完整句、只咆哮」鐵律(赫拉克勒斯/蘭斯洛特命中；會說話的開膛手傑克不中)。
- `servantCard_(row)`：壓成「〈角色背景·僅供內化〉」段塞進 narration prompt。**鐵則一**=當背景揣摩；**鐵則二**=設定字眼禁直述/說嘴；**鐵則三**=依羈絆調親疏(低好感戒備→高羈絆親近，守住性格內核)。
- `enemyAmbushOnServant_`：卸防(補魔/羈絆/共處/休息)時同地未結盟敵從者趁隙重擊。
- `raiseBond_`(升既有)／`bumpBond_`(無則建)／`getBond_`。`extractWish_`(取【願望】)、`buildDreamPrompt_`(敗北虛假之夢)。
- **⏳ 14天時限(2026-06)**：聖杯戰爭上限第14日，`day>14` 未奪杯＝時限耗盡敗北。**中央攔截**：`handleGameAction`(dispatcher)在 handler 跑完後，對 PC_ solo 解析回應現成的 `clock` 字串(零額外時鐘讀)——`第N日` 的 N>14 且 success 且未 victory/defeat → 讀一次眾生取御主/從者名、補 `defeat:true+deadline:true+dreamPrompt+servantDream:""`。所有耗時動作(移動/戰鬥/補魔/偵查/休息…回應都帶 clock)統一覆蓋，不必各自判。夢用 `buildDreamPrompt_(name,wish,sv,cause)`：`cause==='timeout'`＝時限夢(破綻=時鐘停在第14日)、否則=戰鬥敗死夢(同一函數·勿再另開)。前端各動作 `data.defeat`→`handleDefeat`(travelTo 已補接·跨日略過抵達敘事直接收場)。

---

## 11. MEMORY 標記（御主/從者 記憶欄 COL.PC.MEMORY，｜分隔）

```
【願望】wish 【令咒】N 【迴路】N(預設30) 【魔術】 【出身】 【體術】
【模式】canon/chaos 【戰爭】4th/5th/fake 【扮演】正典御主id
【試煉】N(god_hand命數) 【寶具選】N(多寶具英靈解放哪個·set_np_choice) 【寶具預告】1(敵蓄勢·getNpTelegraph_) 【過充】N(補魔存的無償超載額度·一次性·getOvercharge_/set/clear) 【換裝】文字(玩家自訂從者服裝·換衣不換人·getOutfit_/set/clear)　※【路線】route／【史】firedPins 已隨正典插針退役·無用遺留
【羈絆日】D:type1,type2(跨日重置) 【強撐】D(second_wind 舊日限·已棄用·helper 留著無害)
【陣地】loc(setWorkshop 寫·駐留該地供魔工房+8·getWorkshop_/setWorkshopMemory_) 【搜刮】loc(scavenge 寫·該地散逸魔力枯竭標記·getScavengedLoc_/setScavengedLoc_) 【禮裝】id 【禮充】n 【盟約至】day 【鑑賞緣】 【破戒奪取】 【黑化Alter】
【魔境】fx(斯卡哈玩家選的通用A階被動，set_mage_realm 寫，rowToCombatant_ 注入) 【符文】def/dmg/regen(原初符文運用，set_rune_mode 寫)
⚠ 可選能力標籤(魔境的智慧/原初符文)UI＝**小膠囊·發亮，點開在說明 popup 內挑選**(前端 openMageRealmPicker/openRunePicker→pickSelectable)，選定後標籤顯示所選(如 魔境的智慧（千里眼A）/原初符文（增傷）)。已棄大選盤面板。
```

---

## 12. 前端 Script.html（solo UI）

- `applyModeUI()`：模式總開關(§1)。
- **狀態面板**：`refreshFateTags`(御主/雙從者卡、補魔/羈絆/令咒/休息/禮裝)、`setActiveServant`、`bondWord`。
- **戰爭行動列**：`renderWarActions`(**手風琴**：每目標一張可點開卡，`toggleWarTarget`/`warExpanded`，單目標自動展開；底部固定偵查/休息/移動)、`attackStyle_`(近戰/魔砲/狙擊樣式)、`localFoeServantName`。
- **行動 handler**：`servantStrike`(出戰/寶具/令咒/刺殺御主四參數)、`manaSupply`、`bond`/`openBondMenu`/`submitBond`、`rest`/`openRestMenu`/`restAndHeal`、`scout`、`mysticStrike`、`ruleBreakSteal`、`secondWind`、`setWorkshop`/`scavenge`、`proposeAlliance`/`breakAlliance`/`allyBond`。
- **戰報**：`renderFateBattleReport`(斬首多骰/strikes/雙從者血條)、`renderCombatReport`、`renderMysticReport`、`narrate`/`narrateCombatResult`、`handleDefeat`(敗北→虛假之夢→老虎道場)。
- **🐯 老虎道場 AI 講評(2026-06)**：敗北「⏭直視結局」按鈕→`runTigerDojo_(servantName,causeCtx)`：`buildTigerDojoPrompt_` 餵藤村大河＋伊莉雅依**實際敗因**(夢覆寫前擷取的 `lastAiContext`)吐槽＋給一條對症戰術建議，走 `narrate_only` 一次呼叫(只在 game-over 收場·不影響遊戲中速度)填入 `#dojo-ai-body`，失敗退回 `dojoFallbackHtml_()` 罐頭文案。
- **召喚/創角**（2026-07 整段搬到 `Script_Onboarding.html`，天然時間邊界：只在開局跑一次）：`accountLogin`/`chooseWarMode`/`chooseWar`/`chooseRole`/`loadCanonMasters`/`pickCanonMaster`、`rollFate`/`selectFateRoll`/`renderFateRolls`(魔術天賦測定)、`checkName`/`createPC`/`backfillMasterAi`、`doSummon`/`summonByHero`/`selectSummonClass`、`startGame`。與 Script.html 共享同一頁面全域作用域。
- **地圖**：`renderMapPane`(陣地/搜索物資/盟友通報橫幅)、`buildMapSvg_`、`scout`。**地圖 17 正典地點**(衛宮宅/愛因茲貝倫城/冬木森林/冬木·碼頭/深山町遠坂宅/新都穗群原…)：種子在 `Setup_FateWorld.gs` `FATE_MAP_SEED`，`reseedIfEmpty_` 為 **upsert**(按名更新 TYPE/COORD/DESC＋補缺列)；前端位置是 `buildMapSvg_` 內 **hardcoded `LAYOUT`**(short-name→[x,y]，新都西/深山町東)＋`CONN`，**非試算表座標**(座標只備查)。改地圖要同步改種子(名字)＋LAYOUT(位置)。
- **移動敘事**：`actionMove`(Router 2121)回傳 `servantCard`(玩家從者卡)，前端 `travelTo` 抵達提示前置該卡＋「從者必在場、依性格至少一句台詞」指令——修掉移動後變御主獨白、從者像不存在。前端 `foes.length` 時再加「遭遇·敵在眼前」指令(敵方開口挑釁/試探，但勝負留待御主下令)。
- **🎭 敵人人設餵入(2026-06)**：`actionMove` 另回傳 `foeCards`＝target 在場【敵從者】的 `servantCard_`(低羈絆→戒備敵意正確)，前端拼進 arrivePrompt → 敵人依性格/口吻反應(慎二色厲內荏、c媽試探)，不再 AI 即興通用反派(平淡根因)。
- **💨 撤離追擊(2026-06·一點點·可生還·雙向)**：`actionMove` 用移動【前】初始資料判定——離開「有活敵從者」的格子時，最快敵從者(敏≥我從者敏才追得上)依機率咬一記離別追擊。**選兵閘**：`isAllied_`(盟約/休兵中)、好感(REL.FAV)≥50(交情夠) 的敵從者**不追**(複用提前讀的 `relData`，零淨增讀取)。機率 `pProb=base30%·帶傷+20%·騎乘-15%`，再吃**接敵姿態**(隱蔽-10%/光明+10%)、夾 `[0,0.55]` 上限。命中則 `resolveFateBattle_(追兵,我從者)` **真·交手雙向判定**(非單方挨打)：`hitWho:'us'`(我輸·挨追擊)或 `'foe'`(我贏·回身逼退追兵)，雙方扣血**保 1 不致死**。回傳 `pursuit:{enemyName,chaserId,dmg,hitWho}`，前端依 hitWho 顯示橘/綠💨提示＋arrivePrompt 加追擊餘悸/反咬斷後 cue。
- **🎭 接敵姿態(2026-06·純敘述 flavor·零機制重疊)**：地圖面板頂端常駐三段藥丸 `🥷隱蔽潛行/🚶泰然如常/🔥正大光明`(`STANCES`/`getStance`/`setStance`/`stancePillHtml_`/`paintStancePill_`，Script.html)。**存 localStorage `fate_stance`·免 round-trip**(非 MEMORY)，搭 `travelTo` 的 move 便車送 `userData.stance` → 後端**僅** `actionMove` pProb 輕觸(隱蔽-/光明+，見上)。敘事面：**無敵蹤**→`stanceLine_()` 加一句獨行姿態定調(正常=不加)；**有敵蹤**→`stanceNotice_(isSeek)` 折進偶遇/找上門框架定調「誰先發現誰」(隱蔽=玩家先機窺探/光明=對方老遠戒備拉滿)，免姿態被講兩遍。戰爭軌限定(kanshou 無戰鬥不顯示)。
- **移動順序＝世界先動玩家後到**：`actionMove` 先跑 `worldTick_`(敵 tick 換位，移動只換位不死人)→**重讀眾生**→才把玩家落到 target→讀同地人物給 AI。避免「追到敵人所在地、敵人卻在你踏入同一刻被傳走」(撞在一起卻沒對話)。**務必重讀 allPcData 再寫回**，否則整片 setValues 會用舊位置覆蓋掉剛 tick 的敵方移動。
- **追得到人**：`worldTick_`(Time_World 234)用 `freezeLoc = playerLoc`，**玩家所在/將抵達格上的敵人禁止移動**(`oldLoc === freezeLoc` 直接 continue)，否則玩家永遠撲空。兩個呼叫點都傳玩家格(move 傳 target、rest 傳 pcLoc)。
- **遭遇態度分流**：`actionMove` 在世界 tick 前算 `preFoesAtTarget`(target 此刻已有的敵名)，回傳 `preFoes`。前端 `travelTo`：現存 foe 有人在 preFoes→「找上門」(對方據守、戒備)；否則→「偶遇」(恰巧撞上)。語氣只給「依個性與立場開口」，不寫死。
- **🧹 九州系統大清理（已移除 35 個 action ＋ 1817 行）**：修煉/突破(cultivate/breakthrough)、任務(quests/claim_quest_reward/abandon_quest)、門派(get_faction_info/get_ranking/promote_rank/create_faction)、據點收成(estate_get/estate_harvest_all)、倉庫(warehouse_*)、物品/裝備(inventory/discard_item/sell_item/craft_item/consume_item/use_item_self/use_item_on_npc/gift_item/get_available_gear/equip_gear)、給銀兩(give_money)、九州打鬥(attack_npc/multi_attack)、偷竊/情報(steal_npc_item/buy_intel)、組隊(join_party/dismiss_party)、索要(request_item_from_npc/request_discard_npc_item)、強化(empower_npc)、處決(execute_npc)——皆 0 內部呼叫、solo 隱藏、慾海不碰。**保留**：actionPlay(慾海自由聊天引擎)、narrate_only(solo)、gallery、帳號、solo 全部戰爭 action、據點 home_*(模糊未動)、inspect_npc/get_epic_history。(spare_npc 已於 2026-06 連同打掃戰場一併刪除，見 §3 末)COL 欄位**全保留**(死欄不刪)。前端九州 UI 按鈕仍在但 mode 隱藏＋未知 action 優雅回錯誤(`handleGameAction` else 支)，無害；前端清理待後續批次。孤兒 helper(transferMoney 等)留著無害。
- **令咒透支倒數（單獨行動例外）**：敵從者燃**最後一道令咒**緊急脫離(`fateStrike_` seal-escape, Router ~3914)時，若其 TAGS 無 `fx:'solo'`(單獨行動)→ `stampDoom_` 在 MEMORY 寫 `【靈基透支】{死線絕對時數}`(現在 day*24+hour ＋ `SEAL_DOOM_HOURS`=3)。`worldTick_`(Time_World 末段)每次移動/休息推進時間後掃描，`getDoom_` 到期 → 該敵從者 `DEAD_`＋風聞消滅。若這收掉最後一名敵從者(`aliveEnemyServants_<=0`)→ `worldTick_` 回傳 `victory:true`，`actionMove`/`actionRest` 帶 `victory` 給前端，`travelTo`/`rest` 呼 `handleVictory` 出奪杯。弓兵(單獨行動)＝免倒數、可續存(原作 Independent Action)。helper：`rowHasSolo_/stampDoom_/getDoom_/SEAL_DOOM_HOURS`(Router ~4326)。
- **御主戰死→從者透支倒數（與令咒燒盡同一套下場，2026-07）**：`fateStrike_` 一般陣亡路徑(非斬首·護衛在場即死那支，那支已當場一併打殘護衛)擊殺 `敵御主` 時，順帶掃一輪同 game_id 的在世 `敵從者`：`enemyMasterIdx_` 查回 -1(確實因這位御主死而失聯，非連結別的在世御主)且無 `fx:'solo'` 且尚未有倒數(`getDoom_`)→同樣 `stampDoom_` 蓋 `SEAL_DOOM_HOURS` 死線(靈基潰蝕)。單獨行動者不設倒數，改靠上方 `INDEPENDENT_ACTION_RESERVE` 的魔力自限苟活——呼應原作「Independent Action 讓從者能撐一段時間，但終究不是無限供魔」。**斬首·護衛在場**那支仍是即死(戲劇性一擊定生死，不查 solo)，此為刻意的敘事分流、非疏漏。
- **「養不起爆炸」機制已移除(2026-07)**：`worldTick_` 原本的「供魔不繼爆炸」(休息時，靠敵從者六圍/後改真查電池比例判定)，實測發現**不管怎麼調門檻，全種子庫真能撞進危險區的組合幾乎只有士郎(迴路30)配阿爾托莉雅(六圍285)**——其餘配對(伊莉雅迴路80/凜迴路45等)池子夠用、根本進不了候選。結果是「隨機世界事件」實際上總是同一個目標，跟隨機的初衷矛盾，玩家體感是「Saber每次都爆炸」。**已整段移除，不留殘骸**；masterless 有 `SEAL_DOOM_HOURS` 透支倒數、一般戰損有 `fateStrike_`，死法夠多不缺這個。同段落的「暗處廝殺」保留但2026-07改聰明：**只在休息(allowAttrition)、第 `ATTRITION_START_DAY`(=3) 日起、遠處(非玩家格)敵從者、且存活>`WORLD_FLOOR_`(=4)** 才可能發生(7%/tick)；受害者不再純隨機，改**挑「戰力(六圍階總和)最低」者先死**(同分隨機)——貼「弱者先在混戰中出局」。前 2 日世界不減員(喘息)。
- **📜 戰記（里程碑回顧＋歷史戰役）**：獨立「戰記」表(自動建)，schema `[game_id, 帳號, 日, 時, 內容]`。`logWarEvent_(gameId, text, acctName)`(Router)只記 solo 局(g_)、附遊戲內 day/hour＋帳號(帳號表只記當前局，靠戰記列的帳號歸戶過去戰役；每場召喚必帶帳號)。**上限**：>2000 列砍最舊 500。接線點：召喚開戰、玩家令咒(戰鬥絕對命令／修復/補魔/脫離)、敵令咒脫離、從者擊破(雙方)、令咒透支倒數＋暗處廝殺(worldTick_，無帳號·靠召喚列歸戶)、斬首擊殺御主、結盟/破盟、奪杯/敗北。讀取：`actionWarChronicle`(`war_chronicle`，無 gameId＝當前局/有 gameId＝回顧過去·需帳號相符防越權)、`actionWarHistoryList`(`war_history_list`，列本帳號歷來戰役＋勝敗)。前端：抽屜「📜 本場戰記」`openWarChronicle()`；主選單「📜 戰役回顧」`openWarHistory()`→點一場→`openWarChronicle(gameId,title,true)`。
- ⚠ **戰記表保存上限**：其餘表都有修剪(因果 `trimLogRowsByOwner` 每 pcId 留 60／歷史暫存 40／readRecentLogRows 只讀表尾)；戰記用「>2000 砍最舊」自管，勿移除。
- **敵御主↔敵從者硬連結（誰是誰）**：`reseedRivals_`(Seed_Rivals 末段)種子時，rows 嚴格交替(master,servant…)，互寫 `【從者】名`(御主列)／`【御主】名`(從者列)於 MEMORY。`getServantMaster_`/`getMasterServant_`(Router)讀回。`markMasterLostServant_` 配對改**硬連結優先**(按名找御主，不怕多組同地)、無連結退回同落點。`getLocalPeopleList` 對 `敵從者` 帶 `master`、`敵御主` 帶 `servant`。前端 `travelTo` 在場敵對>1 組時加「在場敵對歸屬·勿張冠李戴」配對清單，AI 才不會把 3 組同場的主從搞混。**舊局無連結→退回同落點(相容)**。
- **喪失從者的敵御主（選 A：不移除，只標記＋演出）**：敵從者任一路徑死亡時，`markMasterLostServant_`(Router ~4340)在「同地同 game_id 的敵御主」MEMORY 寫 `【喪失從者】從者名·死因`(只記第一次)。三處死亡都接：戰鬥擊破(`fateStrike_` else 支)、令咒透支倒數＋暗處廝殺(`worldTick_`)。`getLostServant_` 讀回；`getLocalPeopleList` 對 `敵御主` 帶出 `lostServant`。前端 `travelTo` 對在場的喪失從者御主加指令：演出形單影隻、無牙棋手、依個性流露失恃(孤注/惶然/不甘)，別當仍有從者隨侍。配對採同落點(一master一servant結伴移動，無顯式 FK)。helper：`stampLostServant_/getLostServant_/markMasterLostServant_`。
- **敘事連續記憶**：`lastAiContext`(模組級，最近一段 AI 文 ≤300字)。`narrate()`/`narrateCombatResult`/play 都會更新它。`travelTo` 在 `foes.length` 時把 `lastAiContext.slice(0,280)` 當「前情」塞進抵達提示，讓 AI 知道「方才發生什麼」——逃跑後敵人追上/再遇時承接劇情、不當初次見面。`narrate_only` 後端只吃 promptText，所以前情是在前端拼進去的(零後端改動)。
- **鑑賞**：`claimGrail`/`renderHeroList` 仍在 Script.html；**鑑賞(慾海)前端主體已搬到 `Script_Kanshou.html`(2026-07)**——`enterKanshou`(主入口)、👥同伴面板 `openCompanions/kanshouAdd/kanshouRemove/changeKanshouName/changeKanshouSex/askKanshouSex/askKanshouSetup`。兩檔共用同一頁面全域作用域(Index.html 依序 include)，互叫無礙；新增鑑賞前端功能請往 `Script_Kanshou.html` 加，見 `HANDBOOK.md` §4.1 拆分慣例。(舊 `openGallery/enterGallery` 已退役)
- **逆天改命**（玩家改自己御主資料）：`openFateEdit`/`saveFate`→`actionUpdateFate`。**只准改 4 種敘事欄、數值與寶具一律鎖死**(GAS掌數值)：`back`身世(限30)/`intent`萌點(限30)/`trait`特徵(4格×20)/`pref`個性(4格×20)。特徵4格=外貌/氣質舉止/自稱與口氣/卸下心防的私密一面(末格＝鑑賞慾海的親密種子，NSFW 消費在 Router 2406 `[床笫之間的反應]`)；個性4格=日常表象/真實內裡/喜歡/討厭。改別人(NPC)需好感100+已傾心，改自己免條件(solo 只碰自己)。數值編輯是九州 full 的 breakthrough/cultivate，solo 不露出。

---

## 13. 已完成的四大區塊（本專案進度）

①戰鬥職階相剋＋寶具專屬(Engine_Fate) ②~~正典劇情橋段(Seed_Canon)~~已退役 ③戰爭規則含結盟(同盟系統) ④日常與羈絆(bond/補魔/夢境/禮裝/雙從者/破戒奪僕/同盟生命週期→鑑賞)。
種子庫 36 從者＋13 御主 persona 全補完(v3)。

---

*最後更新(2026-06)：戰鬥大改(概念優先權/D&D骰/寶具規模矩陣/御主電池/寶具對轟/從者主動技/敵寶具吃魔力/十二試煉燒命/A++≠EX修正)＋solo 好感招募地圖收歸 GAS＋刪 spare_npc，並全文對照現碼校正(gallery 改 enter_kanshou、full 停用、經濟全砍)。改動前先 grep 對照，改完 node --check，慾海邊界 git diff 驗證 0 改動。*
