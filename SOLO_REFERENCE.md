# 命運停駐之夜 — 單人(solo)模式 代碼參考筆記

> 給 Claude 的速查手冊：函式名＋作用＋資料流＋COL schema。改動前先查這份。
> 專案：calloy520-wq/FATE（`gas/` 內為 Apps Script，clasp 推 branch 部署）。
> 開發分支：`claude/traditional-chinese-chat-q8ptho`（commit→push→GitHub Action 只跑 clasp push；要上線須另手動觸發 workflow_dispatch 跑 clasp deploy）。
> 🌹 **鑑賞（慾海後日談）詳見 `KANSHOU_REFERENCE.md`**——本檔只記 solo 專屬＋兩軌共用基礎設施。

---

## 0. 紅線（絕對不可違反）

| 規則 | 說明 |
|---|---|
| **慾海禁區** | `nsfwBaseRules`（演化核心，定義在 `Gallery.gs`）＋整套 NSFW 機制**一律不可改**。只能改 SFW 的 gating／名冊。改鄰近處後跑 `git diff -- gas/Gallery.gs \| grep -c nsfwBaseRules` 確認常數本體 0 改動（grep 可能因 context 行出現假陽性，須逐行核對 `+`/`-` 兩側是否真的動到常數）。 |
| **show-don't-tell** | 敘事禁止直接寫出角色的 願望／個性／萌點 字面。只能用神態動作演出（`servantCard_` 鐵則一二三 已強制）。 |
| **model id** | 本模型的 exact id 不可出現在 commit／PR／程式碼／任何 push 進 repo 的東西（見 CLAUDE.md 紅線④）。 |
| **branch** | 只在 `claude/traditional-chinese-chat-q8ptho` 開發。 |

- **兩軌完全拆開**：`actionPlay`（鑑賞自由聊天引擎）＋`buildDefaultSystemPrompt`（含 `nsfwBaseRules`）都住在 `Gallery.gs`（鑑賞軌集中地）。`callGeminiAPI`（solo/鑑賞共用的打 API 核心）留在 `Engine_Combat.gs`。solo 走完全獨立的 `narrateWithState_`（`Router_Narrative.gs`），從不呼叫 `buildDefaultSystemPrompt`。
- **solo 一律鎖 SFW**：`actionPlay` 入口守門——非 `KPC_`（鑑賞路由前綴）直接 `return`，完全不信任何前端 `isNsfw` 旗標。solo 從不用 `actionPlay`。
- **模型常數**（`Core_Settings.gs`，皆讀指令碼屬性、未設定才落回程式碼內字面預設）：
  - `OPENROUTER_API_KEY`（唯一認的金鑰屬性名，無相容別名）。
  - `AI_MODEL`（屬性 `MODEL`，預設 `google/gemini-3.5-flash-lite`）：**兩軌共用的唯一主力模型**。
  - `FALLBACK_MODEL`（屬性 `FALLBACK_MODEL`，預設 `x-ai/grok-4.20`）：被審查擋下／重試全敗時的後援，由 `callGeminiAPI` 全域自動換，呼叫端不必傳。
  - ⚠ 2026-09 玩家定案「只要這兩顆」：`SOLO_MODEL`／`UNLOCKED_MODEL` 已整組移除，同名指令碼屬性從此無效。
- `callGeminiAPI` payload 帶 Gemini `safety_settings`（BLOCK_ONLY_HIGH，非 Gemini 模型靜默忽略）＋尾端附「台灣繁體中文（正體字）」語言鐵律（避免簡體滲透）。`max_tokens`：鑑賞 1000 / solo fallback 2000 / `narrateWithState_` 預設 720。連線失敗時 fallback 回貼世界觀的柔性訊息（🌫️因果紊亂），原始錯誤只進 `Logger.log`。

驗證套路：改完必跑 `bash check.sh`（驗全部 .gs ＋ `Script*.html` 內嵌 JS；CI 只檢查 .gs）。

---

## 1. 三種模式 (pc.mode)

| mode | 意義 | UI |
|---|---|---|
| **solo** | FATE 單人聖杯戰爭（本專案主體·SFW） | 純按鈕；無聊天輸入框、無慾海開關 |
| **full** | 九州全模擬（停用中·經濟/生活全砍，不作為玩法軌，可隨經濟一起清理） | 殘留死碼 |
| **kanshou** | 鑑賞（後日談約會·英靈殿召喚，不靠奪杯封存·NSFW） | 有聊天輸入框＋慾海開關；無戰鬥/血量 |

- `applyModeUI()`（Script.html）是模式總開關。solo 隱藏 full 專屬功能、收掉輸入框、顯示 `war-actions` 行動列。
- **雙軌**（Index.html `scr-menu`）：🎴 純淨（單人聖杯戰爭·SFW）／🌹 慾海（鑑賞後日談·NSFW）。共用一張試算表＋核心資料，靠 帳號＋game_id 分流，不拆表。
- **無戰記/排行榜/唯讀回顧視窗**：`showVictoryHistory`/`actionGetVictoryHistory`/`openLeaderboard`/`actionLeaderboard`/`incrementWin_`/`recordHistory_`/`recordWinSpeed_`＋「戰史」表、帳號表 WON/BEST_DAYS 欄 皆已移除。
- **持久層（清檔不刪）**：帳號表、鑑賞表（封存從者）。**會被清檔刪**：眾生（game_id）——NPC 對御主的關係已併入眾生列。
- **補魔(solo)**：`actionManaSupply` 走 narrate_only（SFW，曖昧 fade、點到為止）。
- **重開/查重**：`actionAccountNewGame`(Account.gs) 清舊單人戰場（刪同 game_id 整世界＋御主本人）。`actionCheckName` 只擋 game_id 非空的同名活躍御主；DEAD_ 與孤兒不佔名。
- **solo 全程無花錢入口**：身世財力差異走「起始禮裝」（創角自選被動禮裝，見 §6）。
- **經濟/生活層全砍**（兩軌都無）：money/商城/物品/任務/賭場/飛書/生活技能/裝備——AI 需要時自己掰、不寫試算表。code＋分頁＋COL 已清。

---

## 2. 實例化與資料表

- **game_id**：每局一個世界。`g_`+ts=聖杯戰爭；`k_`+ts=鑑賞世界。所有查詢帶 game_id 過濾，杜絕跨世界外洩。
- **🌹 鑑賞獨立分頁**：慾海角色住「鑑賞眾生」分頁（`getKanshouPcSheet_`，schema 同眾生），dispatcher 在 `pcId` 以 `KPC_` 開頭時路由到此。詳見 `KANSHOU_REFERENCE.md`。
- **FACTION**（COL.PC.FACTION 字串）：`御主`(玩家)、`從者`(玩家的)、`敵御主`、`敵從者`、`盟友御主`/`盟友從者`（前端 override，見 §8）。
- **六圍階級制**：FATE 純六圍 SIX（STR/CON/AGI/INT/LUK 五圍已移除）。HP/MP 由 `maxStatsForRow_(row)`＝`fateMaxHpMp_(svNum_(SIX.耐久), svNum_(SIX.魔力))`（`100+con*10`/`50+mag*10`，無境界倍率）。九州境界/物品/銀兩/門派 helper 全砍。
- **提示詞已全清九州詞**（例外：`雙修技巧`＝NSFW MEMORY 機制保留；`凡人`作「人類御主」描述語保留）。
- **分頁**（Setup_FateWorld.gs `FATE_SHEET_DEFS`，缺頁自動補、冪等）：坤圖(地圖)/眾生/英靈殿/御主殿/帳號/鑑賞/歷史暫存 7 頁＋動態建的「鑑賞眾生」。時鐘/權柄/關係 併入眾生列；因果(事件log)/戰史/史紀 直接刪除、無替代。

### COL schema（索引讀取；定義在 `Core_Settings.gs` 開頭 `const COL`）

> 單人每個 game_id 世界恆只有一位御主，故「NPC 對御主的關係」＝該 NPC 自己這一列的欄位；「日/時/AP/居所」＝御主自己那一列的欄位。**COL 是位置索引，棄用不刪欄**（刪欄會位移全表）。

```
PC(眾生):
  ID0 NAME1 SEX2 BACK3(身世) STATUS4(外顯) TRAIT5 LOC6 PREF7(個性)
  HP8 MP9 MAX_HP10 MAX_MP11
  MEMORY12 INTENT13(萌點) FACTION14 RANK15(職階) CONTRIB16 ALIGN17
  PHYSICAL18(肉體·NSFW) MARTIAL19(寶具) GAME_ID20 SIX21(六圍JSON) TAGS22(技能JSON) SEEN23(戰爭迷霧)
  關係欄(這名 NPC 對本世界御主。御主自己這一列留空)：
    BOND24(好感0-100) REL_TAG25(關係標籤) IS_PARTY26(同行旗標"同行"/"") MEMOIR27 REL_MEM28
    ※MEMOIR27＝鑑賞「共同回憶」(原 MAJOR_EVENT 死欄復用·solo 留空)；REL_MEM=關係專屬記憶(NSFW稱呼等)
  世界狀態欄(只在御主那一列有意義，其餘列留空)：
    DAY29 HOUR30 AP31(1AP=1hr，每日12AP) HOME_LOC32(居所·工房加成判定)
  死欄(恆空·佔位不刪)：MONEY33 UPKEEP_WEEK34 ROOM35
HERO(英靈殿): ID0 CLS1 NAME2(真名) SEX3 SIX4 CLASS_SKILLS5 SKILLS6 TRAITS7 NP8 PERSONA9(JSON) ALIGN10 WARS11 SOURCE12
              DAILY_LOOK13 DAILY_WORDS14 DAILY_MOE15 DAILY_OUTFIT16 (13-16＝鑑賞用日常版，與戰時 PERSONA 分開存)
MASTER(御主殿): ID0 NAME1 SEX2 APPEAR3 MAGIC4 CIRCUITS5 MELEE6 MAGIC_RANK7 HOME8 WISH9 PERSONA10 WAR11 SOURCE12 BACK13(身世) MOE14(萌點)
MAP(坤圖): REGION0 NAME1 TYPE2 COORD3 DESC4 PARENT5 WAR6(''=通用/'4th'/'5th' 限定該戰爭)
ACC(帳號): NAME0 PC1(solo御主ID) CREATED2 KPC3(鑑賞角色ID·由 linkAccountToKanshouPc_ 專責讀寫)
```

---

## 3. 後端路由 `ActionRouter`（Router_Action.gs 頂部）

主進入點 `handleGameAction` → `sanitizeUserData_`(輸入清洗) → 查 `ActionRouter[action]` → **pcId 歸屬中央驗證**(2026-07新增，見下)。AI 輸出經 `sanitizeAiData_` 夾值防幻覺。未知 action 走 else 支優雅回錯誤。

- **🔒 pcId 歸屬中央驗證**（2026-07 系統性漏洞修補）：稽核發現近全部 solo 戰場/移動/羈絆/經濟類 action（`get_tags`/`sync`/`fate_battle`/`mana_supply`/`bond`/`move`/`use_seal`…共20餘個）過去只用裸 `findIndex` 信任前端傳入的 `pcId`（可預測字串 `"PC_"+timestamp`），完全沒反查「帳號」表——猜中/枚舉即可代任意玩家讀取私密狀態或竄改 HP/羈絆/裝備，部分不可逆（`mana_supply` 燒蝕迴路）。修法：`handleGameAction` 在 dispatch 前對所有帶 `pcId` 且非 `OWNERSHIP_CHECK_EXEMPT_` 白名單的 action，統一呼叫 `verifyPcOwnership_(acctName, pcId)`（Account.gs，反查帳號表 `COL.ACC.PC`/`COL.ACC.KPC`）；前端 `gasRun()` 同步補上「未帶 `acctName` 就自動填 `pc.account||currentAccount`」，取代逐一補幾十個呼叫端 payload。白名單只留 `account_login`/`account_new_game`/`create`/`enter_kanshou`（pcId尚不存在）、`claim_hero`/`save_hero`（走 creator 模型）、`get_heroes`/`get_masters`（公開名冊）等不涉個別玩家列的動作。
- **慾海擋牆**：`KANSHOU_BLOCKED_ACTIONS_` 白名單，`isKanshouCtx` 命中就在 dispatcher 層擋下戰鬥/經濟類 action（`fate_battle`/`use_seal`/`mana_supply`/`bond`/`rule_break_steal`/結盟系/陣地系/`set_*` 等）。刻意不擋 `move`/`update_fate`/`update_rel_tag`。
- **⚡ 每按鍵 3→1 round-trip**：dispatcher 對 `STATE_AFTER_ACTIONS` 白名單動作＋`PC_` 御主，自動把 `_state:buildClientState_()` 夾進回應；前端 `gasRun` 暫存 `data._state`→`__pendingState`，`syncData` 優先消費。寫入完整性已驗證的 handler（move/rest/fate_battle）用 `STATE_PRE_DATA_` 把權威 pcData 交棒給 dispatcher，`buildClientState_(sheets,pcId,preData)` 直接複用免整表重讀。**別把多餘 round-trip 或重複整表讀回加回來。**

### solo 會用到的 action

| action | handler | 作用 |
|---|---|---|
| check_name / check_sheets / account_login / account_new_game | Account/Setup 系 | 登入／建帳號／開新局／手動補分頁 |
| create | actionManualNpc | 御主創角。**🚀 非阻塞：不叫 AI**——用玩家種子值＋GAS 算的數值（HP/MP/game_id/迴路/令咒/模式/戰爭/扮演 MEMORY）＋起始禮裝秒寫入。落點確定性選（偏好新都）。（手動建 NPC 的 !isCreate 分支已成死碼）。**🛡️ 帳號重入防呆**：帳號若已連結一局活著的遊戲(帳號表 `COL.ACC.PC` 存在且對應列仍在)則拒絕再建——防 `create` 異常被呼叫第二次時 `linkAccountToPc_` 覆寫連結指標、悄悄孤兒化舊角色＋已召喚的從者(英靈殿範本不受影響·僅帳號視角看不到那局進度)。合法的 `newGameFlow` 本就先呼叫 `account_new_game` 清連結才會走到這裡，不受影響。 |
| backfill_master_ai | actionBackfillMasterAi | 🚀 御主敘事非阻塞補生成：create 後前端 `backfillMasterAi(seed)`（不 await·趁挑從者空檔）呼叫，AI 補 背景/特徵/個性/萌點，只單格 setValue 更新 4 敘事欄（BACK/TRAIT/PREF/INTENT）。失敗＝保留種子。 |
| update_fate | actionUpdateFate | 逆天改命：玩家改自己 4 敘事欄（個性/特徵/身世/萌點），數值/寶具不可改。**萌點例外(2026-07)**：`fateType==='intent'` 且目標非自己(`pcData[pIdx][COL.PC.ID]!==pcId`)一律拒絕——同伴/NPC的萌點「真正內化」給AI演出參考，玩家不可查看也不可竄改(前端`intent-box`對非自己卡片整格連改命鈕都隱藏，這裡是後端防線)。 |
| summon_servant | actionSummonServant | 召喚從者（英靈殿抓真名/六圍/技能→眾生列）。種子英靈直接用寫死 persona、不叫 AI；名冊查無才走 AI 即時生成。敘事8格：個性(PREF)讀 `persona.words`、特徵(TRAIT)讀 `persona.look`（種子皆手寫4格 外貌/氣質/自稱/卸下心防私密一面）。AI 生成走 `sanitizeSix_`（EX 最多2項·超額降A）/`sanitizeSkills_`（fx 非 `ALLOWED_FX_` 白名單→清空·階級 regex·數量帽）雙重防呆；缺 realName/six 中止不寫表。**🐛→✅ 2026-07 職階技能改 GAS 直接指派**：舊版讓 AI 自己生 `classSkills`(prompt 只講「貼合職階慣例」)，玩家實測抓到一名 Berserker 除了正常的「狂化」外還多一個像符文/道具作成系的「召喚騎士」——AI 額外發明了一個不屬於該職階原型的技能，軟性建議擋不住。改為比照工房 `parseForgeBuild_`：`aiCSkills = FORGE_CLS_SKILLS_[cls] || []` 直接指派、不再問 AI，prompt 也移除 classSkills 請求(只留固有技能 skills 2~3個)，徹底杜絕跑題，AI 專心生角色個人技能即可。**🌀 2026-07 六圍下限保底 `bumpSixToFloor_`**：舊版只擋「太強」沒擋「太弱」——AI 常自己抓不準力度，玩家實測抓到「AI自訂從者也太弱」，光靠 prompt 措辭「務必有強有弱」擋不住。改為 GAS 硬性補強：算完(六圍+`aiSkills`，**不含** `aiCSkills` 職階技能，比照工房不計費)低於工房同款 `FORGE_FLOOR_`(=340，對齊 `FORGE_BUDGET`)就把最弱一項六圍逐階往上補，直到達標或撞 EX≤2 上限為止；`align` 也補上跟工房一致的 `ALIGNS_` 白名單驗證(舊版 `aiBrief.align||"中立"` 沒驗證，AI 可能吐出九宮格外的怪陣營字串)。**技能 `{n,r,fx}` 中 n(顯示名)與 fx(機制)脫鉤**：`sanitizeSkills_` 保留 AI 取的 n(截10字)、獨立驗 fx；戰報靠 `fxName_` 讀該從者自己的 n 顯示、不會張冠李戴。**🎭 三分類 `origin`**(前端 `s-origin`／`cf-origin`·helper `originGuide_(origin)`→`{frame,skill,pnote}`)：`fate`=Fate正史(技能忠原著招式名)／`anime`=其他動漫畫知名角色(技能取該角色招牌招式名，如悟空→龜派氣功)／`original`=完全原創(自取像寶具的花名·空=此)。自訂生成(summonByDesc)吃 `frame`(角色框定)+`skill`(技能命名)；工房(summonByForge/save_hero)技能名玩家自己打·只吃 `pnote`(AI 補人格忠實度)。**⚔️ 自訂生成職階獨立選擇 `s-cls`**：不吃上方瀏覽名冊用的 `selectedSummonClass`(曾誤共用→玩家點過職階分頁瀏覽後再自訂生成，職階被悄悄鎖死、跟描述無關)；不選(空字串)時 `reqCls` 亦空，`clsUnset` 成立→職階交給 AI 依描述判斷(回傳 JSON `cls` 欄，非法值才退回 Saber)，不再死綁 Saber。**🏷️ 技能來源標記 `tagSkillKind_(arr,kind)`**(Router_Creation.gs)：寫入 TAGS 前把 classSkills/skills 分別打 `kind:'class'/'skill'` 再合併——4 個寫入點(此函式 hero 分支/AI生成分支、Seed_Codex.gs 種子英靈、Seed_Rivals.gs 敵方鋪陳)皆已改用；純顯示欄位，`hasFx_`/`fxName_` 只認 fx/r 不受影響。前端 `buildSvCard`(Script.html) 據此把技能分三卡「職階技能／固有技能(依 `rankVal_` 階級高→低排序)／特殊技能(`SELECTABLE_FX` 可選效果)」，寶具維持原樣不動；`skillBucket_` 對缺 `kind` 的舊角色(合併時未標記)退回 `CLASS_SKILL_FX_HEUR_`(鏡射 `FORGE_CLS_SKILLS_`) fx 代碼猜測，猜不中一律落固有技能。**🎨 2026-07 AI 自訂生成分支補外貌生成**：舊版這條路徑完全不叫AI生成外貌，`TRAIT` 恆套通用預設「外貌出眾、舉止從容…」，得靠玩家事後逆天改命補——現在 schema 補 `look`(4格頓號同工房格式，女性角色明確要求含身形/胸圍具體描寫)，`parseTraitsHelper(aiBrief.look, 同款預設)` 寫進 TRAIT，且傳進 `recordOriginalHero_` 的 `pExtra.look` 供日後重召/日常版轉換(`translateLookToDaily_`)使用，不再永遠停在通用預設。 |
| save_hero / claim_hero | actionSaveHero / actionClaimHero | 🛠️ 工房（純製造/修改·不直接召喚）：create（AI 補 persona·蓋 `persona.creator` 印記）或 edit（帶 heroId·僅創造者·真名不可改）。驗證走 `parseForgeBuild_`（單一真實來源·六圍預算340·技能/規模計價·正典擋；計價本體已抽成共用 `forgeCost_`，與上方 `summon_servant` 的六圍下限保底 `bumpSixToFloor_` 共用同一套算式，見該列）。claim_hero＝認領無主原創英靈。召喚走玩家原創專區→hero 分支實體化。**🔑 creator 綁定**：`recordOriginalHero_` 是唯一寫入點，persona 存 `creator`(＝acctName)＋`weapon`；工房與自訂生成(summon custDesc)兩路都傳 creator，edit 分支靠 `pj.creator===acct` 擋非本人。(曾漏寫→creator 恆空使無人能改·已補) **🎭 2026-07 工房補上特性(traits)欄位**：舊版工房恆傳空陣列(玩家手捏角色永遠沒特性、只有AI生成從者才有)——玩家想比照捏「賽亞人/人造人」這類其他作品梗，現開放 `cf-traits` 自由文字欄(頓號分隔·上限4個·單則截8字)，`parseForgeBuild_` 解析成 `out.traits`，create/edit 兩分支都寫回 `COL.HERO.TRAITS`。刻意不進 `FORGE_BUDGET` 計費、不設白名單——這組標籤本來就只有「神性/神格/神靈」與「龍」兩組關鍵字被 `Engine_Fate.gs` 讀到有實際效果，其餘(含清單外任何名稱)純敘事風味，`Script.html` 的 `TRAIT_DESC` 已同步改成誠實描述。 | 
| get_heroes / get_masters | actionGetHeroes/Masters | 創角選單列出可選英靈/正典御主（正典御主資料前端可預取加速） |
| get_tags | actionGetTags | 左側狀態面板資料（御主HP/MP/令咒/願望、從者陣列、供魔收支、禮裝、破戒能力）。核心 `buildTagsPayload_(sheets,pcId,preData)`（可吃已讀好的整表免重讀）；`sync`/夾帶 `_state` 已帶 `tags:` 同份 payload。 |
| fate_battle | actionFateBattle | **核心戰鬥**：D20＋寶具＋令咒＋斬首＋雙從者＋協同強襲（見 §4）。多寶具選定、出力自動全開、令咒/主動技/超載檔位皆隨 fate_battle 夾帶（`userData` 的 servant/npChoice/skill/seal/overload 旗標），省去單獨 round-trip。 |
| use_seal | actionUseSeal | 令咒固定選單：修復/補魔/緊急脫離。（mana 分支依好感分流，見 §4 補魔）。**🐛→✅ 2026-07 修「脫離只搬一名從者」**：`escape` 分支舊版只搬 `findPlayerServantIdx_` 挑出的單一從者，破戒奪僕可讓玩家合法擁有兩名 `IS_PARTY==="同行"` 從者時，第二名完全不會被搬走(燃全局僅3道的令咒卻沒真正帶走全隊)——比照 `actionMove` 早就有的「搬所有同行成員」迴圈補上。 |
| mana_supply | actionManaSupply | 補魔（燃迴路）：回滿共用池，永久代價 maxHP−15、迴路−3（地板迴路8/HP40）＋羈絆＋SFW fade＋存一次性【過充】token。**資格門檻**：從者 `BOND<MANA_TRUST_BOND_(80)` 或御主魔力 >10% 上限 → `declined` no-op（不耗AP/不燒/不動好感·純婉拒敘述）。 |
| spirit_repair | actionSpiritRepair | 🩹 靈基修復：消費共用魔力池為從者療傷（不燃令咒·可重複）。 |
| set_servant_output | actionSetServantOutput | 🔋設從者出力檔（20/40/60/80/100，存 MEMORY【出力】）。免費即時不耗AP。決定戰力＋維持費；100% 才能放寶具。 |
| set_mage_realm | actionSetMageRealm | 🔮可選借得技能：玩家點選 1 個 `mageRealmPool_` 通用 A 階被動 fx，存 MEMORY【魔境】fx（空＝清除）。`rowToCombatant_` 戰鬥注入。只接受持 `mage_realm` 的從者。 |
| set_rune_mode | actionSetRuneMode | 🔯原初符文：玩家選 def減傷/dmg增傷/regen回血，存 MEMORY【符文】mode（預設 def）。`rowToCombatant_`→c.runeMode。 |
| outfit | actionSetOutfit | 👗從者換裝（自訂當前服裝，只換衣不換人）：存 MEMORY`【換裝】<40字>`（get/set/clearOutfit_）。餵進 `servantCard_`＋actionPlay＋kanshou。純外觀·免費·兩軌通用·留空恢復本相。 |
| weapon | actionSetWeapon | ⚔️從者武裝（自定武器/戰鬥方式）：存 MEMORY`【武裝】<30字>`（get/set/clearWeapon_）。`servantCard_` 讀後上【武裝·絕對】強制線，蓋過職階/原典武器慣例。免費·留空恢復自然。 |
| bond | actionBond | 羈絆互動「相處」：每遊戲日一次 +10、耗1AP，味道由 AI 依時段/羈絆/性格即興。**里程碑**：BOND 跨 `BOND_MILESTONES_`(30/60/90) 且未演出過→下次「相處」演一段角色專屬里程碑（回 `milestone`·前端插粉色過場提示·奇襲打斷則留待補演）。存 MEMORY【羈絆里程碑】（`get/setBondMilestonesFired_`·Router_Bond.gs）。 |
| rule_break_steal | actionRuleBreakSteal | 破戒奪僕：打殘敵從者(HP<35%)+燃令咒→奪為第二從者（上限2）。查 `isAllied_` 擋盟友。 |
| propose_alliance / break_alliance / ally_bond | 同盟系 | 結盟/撕毀/與盟友共處（見 §8） |
| set_workshop / scavenge | 陣地系 | 設陣地（提升供魔）／搜索物資（主情報＋順手撿零星魔力，標記【搜刮】防站樁刷魔） |
| second_wind | actionSecondWind | 0-AP 死局保命：扣~20%上限血換+4AP，不耗AP·可重複（HP≤cost 才擋）。不推進時間、不燒令咒。 |
| scout | actionScout | 偵查：揭露同地敵蹤（設 SEEN·敵移位後不清）。有輕量 aiPrompt。 |
| prep_meal | actionPrepMeal | 🍱整備·進食（戰前 buff）：耗1AP，御主 MEMORY 記`【整備至】<絕對小時>`，效期內從者出擊命中 +`MEAL_BUFF_BONUS`(2) 約 8 小時（`mealBuffActive_`→`resolveFateBattle_`）。有輕量 aiPrompt。 |
| get_map_nodes | actionGetMapNodes | 地圖節點＋敵蹤（吃 SEEN 迷霧；有盟友全揭露）。算法抽成 `buildMapNodesPayload_(sheets,pcData,gid,loc)`（吃已讀好 pcData·零額外讀），`buildClientState_`/`actionMove` 夾帶 `mapNodes:`。用 `COL.MAP.WAR` 過濾非本局戰爭的節點。 |
| move / rest / sync | actionMove/Rest/Sync | 移動(2AP)／休息(補AP+夢境)／資料同步 |
### 🧵 solo 的「記憶」怎麼運作（2026-09 大修，玩家：「有時候的對話還是牛頭不對馬嘴」）

每顆按鈕都走同一條 `narrate_only`，AI 收到的東西固定是這個結構：

```
system : miniSystem ＋ 【軌跡骨幹】(第幾日/AP/好感/令咒/地點) ＋ 【語言鐵律】
history: 最近 6 筆 ＝ 3 個按鍵（player=事件句／ai=當時的敘事）
user   : 【當前狀態】HP/MP ＋ 這回合的角色卡＋事實＋★指令
```

**修掉的三件事**（三個都不是代碼壞掉，是餵進去的資料不對）：

1. **歷史存錯東西**——舊版存 `cleanNarrateEcho_(提示詞前 80 字)`，但戰鬥提示詞【開頭是角色卡】，
   於是存進去的是「風音｜性別：女｜性格：不服輸…」這種碎片，**戰鬥本身一個字都沒留下**。
   改用 `narrateMemoryLine_`：掃出【戰報/系統/玩家意圖/抵達場景/虛假之夢/聖杯降臨/召喚登場】
   這種事實行（再接上帶結果的續行，如「『X』靈基崩潰」「敵情：…」），截 160 字。
   *戰鬥現在存的是*「御主號令阿爾托莉雅出擊，與「美狄亞」交鋒 3 回合。我方造成 108 傷害、受創 18。「美狄亞」靈基崩潰、徹底消滅。」
2. **記憶只有 1 輪**——`getGameHistoryBatchRaw(pcId, 2)` → `6`（跟鑑賞一致）。
   solo 一次按鍵＝一輪，2 筆等於「移動→戰鬥→休息」走到第三步就忘了第一步。
3. **只有移動帶【前情】**——而那段前情的正文其實就是 chatHistory 的最後一則，貼第二遍只是稀釋。
   正文拿掉，只留它獨有的「怎麼承接」那句（`★承接上一則敘事：…`）。

⚠ `cleanNarrateEcho_` **沒有刪**，它仍是 `narrateMemoryLine_` 抓不到事實行時的保底。
兩支的分工：`narrateMemoryLine_`＝事件（AI 記憶＋玩家歷史都吃這個）、`cleanNarrateEcho_`＝保底摘要。

機器擋：`check_memory.js`（`check.sh` 第六支）——7 種按鈕情境跑真的函式，檢查記憶句不是角色卡碎片、
不以孤兒標點開頭、含得到這回合的關鍵字；另外釘死「存歷史那一行真的接 `narrateMemoryLine_`」與「歷史深度 ≥4 筆」。

| narrate_only | actionNarrateOnly | **AI 純說書**（solo 專用；GAS 算數值、AI 只演出）。`userData.longForm` 旗標→`max_tokens` 720→2000（補魔/令咒高好感解鎖分支的 500~600 字），模型不變。 |
| tiger_dojo | actionTigerDojo | 🐯 賽後番外（敗北講評／勝利祝賀）。前端只送敗因【鍵】，文案查 `DOJO_CAUSE_` 五格表；**自帶說書人設定、不套 `miniSystem`**（戰場語氣跟輕鬆詼諧打架）、不讀表不帶歷史。 |
| enter_kanshou / kanshou_* / backfill_kanshou_ai / get_album / album_delete | Gallery.gs | 進鑑賞後日談世界／同伴管理／共同回憶面板／相簿（詳見 `KANSHOU_REFERENCE.md`） |
| end_run | actionEndRun | 結束本局（單純清理，不再封存）。（claim_grail 奪杯封存已移除） |
| dev_resync_codex / purge_orphans | actionDevResyncCodex/PurgeOrphans | DEV：手動套最新平衡到現有從者／清孤兒列 |

**已移除的 action**（勿再加回）：`set_np_choice`/`set_active_skill`（併入 fate_battle 夾帶）、`blood_supply`（燃血改被動）、`use_mystic`（禮裝全被動化）、`spare_npc`/`execute_npc`（打掃戰場）、`war_chronicle`/`war_history_list`（戰記表）、`get_epic_history`（史紀表）、`get_victory_history`/`get_ranking`（排行榜）、`get_all_categorized_maps`、`manual_npc`、大批九州經濟/生活/門派 action。COL 死欄保留、機制整套刪。

---

## 4. 戰鬥引擎 Engine_Fate.gs ＋ actionFateBattle

### rank/數值
- `rankMul_(r)`：E10 D20 C30 B40 A50 EX60（+5每+,−3每−）/30 → 倍率。`rankVal(r)`：階級→數值（+/- 各封頂3個）。
- `rankBand_(r)`：rankVal+randInt(-10,5)，AGI 命中/迴避擲值。
- `combatProfile_(c)`：依職階決定命中/傷害/迴避用哪屬性。Caster→魔力、Archer→敏捷命中/筋力傷害、其餘→近戰。
- `rowToCombatant_(row)`：眾生列→戰鬥物件（含 np=MARTIAL寶具、six、fx、從 MEMORY 讀 output/npChoice/runeMode/horrorUp 等）。

### 命中/傷害核心
- **六圍降權（核心哲學）**：參數是角色速寫非戰力表。命中 `= d20 + rankTier(hitStat)×2.5 + rand(-3~3) + outMod`；迴避 `= d20 + (rankTier(敏)×0.65+rankTier(耐)×0.35)×2.5 + rand(-3~3)`；傷害 flat `rankVal×0.6`。階差壓到~12，d20 重新主導。
- **D&D 傷害骰**：`rollDice_(n,sides)`＋`rankTier_(r)`（E1→EX6）。武器骰每擊 `round(rankVal(主屬性)*0.5)+rankTier d8+命中分差*1.2−耐久/2`；暴擊(擲20)多骰 `rankTier d8+12`。
- **幸運逆轉（線性）**：以 C 為零點、每離1階 ±2%——低於 C 觸發「命運捉弄」(-10)、高於 C 觸發「福星眷顧」(+8)。E4%/D2%/C0/B2%/A4%/EX6%。
- **被動 fx 命中/迴避淨加成上限** `HIT_FX_CAP=8`：各累積器 clamp ±8（截斷推「疊加已達極限」標籤）。不入帳：出力/整備/過充/主動技/禮裝/職階相剋/幸運骰/奇襲先機。

### resolveFateBattle_（單次交手裁決）
處理的 fx：`aim analyze anti_magic_lance burst chain clear_mind divine_age divine_core ea evade_ranged excalibur first_strike gae_bolg gob mad morale nullify_magic petrify projection rho_aias ride self_mod stealth str_up summon_horror tactics territory tsubame ubw unreadable wind_strike zabaniya`。輔助函式 `hasFx_(c,'x')`／`fxName_(c,'x')`（回實際技能名防張冠李戴）／`hasTrait_`。

- **資料驅動技能表 `SKILL_FX_`**：散落的主動技 if 鏈＋線性被動加成收成一張表（加/調技能＝改一列）。欄位 `active/prio/mpPct/icon/descFn`（主動）、`zh/hit/hitAdd/dmgMul/dmgAdd/blockedByLoserFx/silent/note`。收表者：主動 `burst/str_up/projection`＋線性被動 `aim/self_mod/morale/fast_cast/mad/divine_age/wind_strike/crafting/master_melee/master_magic`。不進表（保持明碼）：`gob/chain`（骰子彈幕）、`stealth`（僅 ambush 首擊）、`petrify/gae_bolg/tsubame`（時機條件觸發）、`god_hand`（復活）、`weapon_steal`。
- **防禦 fx 表 `DEF_FX_`**：平減傷（`rho_aias`×(1-0.40r)/`territory`×(1-0.26r)/`wall_def`×(1-0.18r)/`divine_core`×(1-0.18r)，B階為基準·皆隨階級縮放）。欄位 `mul/pierceKey/zh/note/physicalOnly/alsoPiercedByFx/piercedMsg/guardPositive`。引擎 `fxDefApply_` 在各 fx 原位置呼叫。
- **防禦規模表 `DEF_SCALE_`**：`c.horrorUp`(海怪變身態)→對城、`territory`→對軍。`npDefScale_(c,pierces)` 餵 `NP_SCALE_MATRIX`。

### 概念優先權 / 寶具規模
- **`CONCEPT_TIER`**：ea·enuma6 / excalibur·divine_age·rule_breaker5 / ubw·anti_magic_lance·gae_bolg·summon_horror·rho_aias4 / god_hand·tsubame·zabaniya·petrify3 / nullify_magic·divine_core·territory2。`offenseTier_(c,isNp)` 取攻方最高進攻概念階（**含本次解放寶具自身的概念** `conceptTier_(npProfile_(c).fx)`，故 Ea 吃得到 tier-6）；`pierces(防禦fx)`＝攻方階≥防禦階+`PIERCE_GAP`(2)→該防禦被無視。
- **寶具規模矩陣**：`npAtkScale_`（對人/對軍/對城/對界，由寶具名/fx 推）×`npDefScale_` → `NP_SCALE_MATRIX`（對城打對人×1.5、對界×1.7、min×0.4）。⚠ 寶具字串裡 `對人/對軍/對城/對界` 會被 regex 讀進傷害——**亂寫高階標籤＝偷偷 buff**，新增/改寶具務必對齊真實尺度。
- **對神（弒神）**：第5種尺度、不入矩陣。對「神性」之敵 `×(1+1.4×rankMul(對方神格)`,上限3.0)、對凡人 ×1.15。
- **多寶具英靈 `servantNpOptions_`**（中央表）：斯卡哈L/吉爾(王財·Ea)/伊斯坎達爾/EMIYA/迦爾納/恩奇都/蒼白騎兵。首項＝主寶具（敵預設）。玩家選定隨 fate_battle 夾帶。`npProfile_(c)` 解出 {scale,fx,r}；`npEffectiveRank_(c)=npProfile_(c).r`（單一真實來源·各選項專屬階級）。`resolveFateBattle_` 簽名效果（gae_bolg必中/ea執行殺/ubw/zabaniya/summon_horror/petrify/scaleMult）一律吃 npProfile。
- **神性單一真實來源 `divineRankOf_(c)`**：divine fx 階級→特性(神性|神格|神靈)標的階級→'C'（有神性沒標階）→null。吃它的：god_slay（×1.17~2.0）/天之鎖縛神/對神寶具（弒神倍率）/寶具解放神性加成/對瘟疫抗性。取三者（divine/divine_core/特性）階級最高者。
- **對轟 `resolveNpClash_`**（純裁決函式·Engine_Fate）：玩家開場 useNp＋敵有寶具且付得起 prana→`clashUrge` 機率敵以寶具相迎。雙方算 pPow/ePow→高者壓過、差額貫穿、勝方回震15%；±10% band 內僵持相抵。優先序階梯：玩家因果律截斷→敵方因果律必死→僵持→高者勝。I/O 留在 Router_Battle。日後加對轟特例改這支函式。

### 出力電池制 / 御主供魔
- **從者無自有魔力池**（召喚 MP/MAX_MP=0），全靠御主供魔。**共用池 `masterPoolMax_(迴路,Σ從者魔力)`＝迴路×10+魔力×2**。
- **出力檔** `outputTier_(pct)`→{hit,dmgMul,drainMul,np,label} 五檔：100%(+3/×1.3/×2.0/可放寶具)、80%、60%(巡航)、40%、20%。`servantOutput_/setServantOutput_`。寶具僅 100% 可解放。
- **御主電池付款** `drainForNp_`：付款序 ①御主MP ②御主HP（`BATTERY_HP_PER_MP`=2HP→1MP，血底線1保底＝設計刻意防「補魔算式自殺」，非 bug）。`npPranaCost_(寶具階)`＝E40/D70/C110/B160/(A~A++)220/EX300（吃 `npEffectiveRank_`）。御主血魔皆空才擋寶具。燃血敘述＝迴路過載灼痛（非外傷流血）。
- **灌魔超載**（規格外＋/EX 寶具才有旋鈕）：`npOverloadCap_(寶具階)`→無＋=1.0/＋=1.5/＋＋·EX=2.0。定檔制 底費P/2P超載檔/3P極限檔（A階 220/440/660）；**超載段只算 MP 餘裕、不焚血**（想灌更滿→補魔拿【過充】token 無償超載，`getOvercharge_/set/clear`）。**過載反噬** `OVERLOAD_BACKLASH_`：明選檔位機率性迴路暴走（p1 30%/p2·blood 65%·扣maxHP），戰果判定後結算·同發奪勝保命1HP·否則御主昏厥→己方從者盡數 DEAD_。
- **回魔 `applyRegen_`**（共用池）：重算上限；income(迴路供給＋靈脈＋工房＋Σ從者魔力×0.15)×mult − Σ(從者 drain×outputTier drainMul)；御主/從者 HP 自我修復 5%/hr×avalon1.6。御主乾涸→強制全從者降出力20%＋從者靈基崩解流血。⚠ `applyRegen_` 與 HUD `playerServantEconomy_` 須同一套算式，改一個要一起動。
- **敵御主電池**：`masterToNpcRow_`/`fakeMasterRow_` MP 吃 `heroMagicRank_` 算契約英靈魔力階（`masterPoolMax_`/`80+rankVal×2`）。敵寶具同吃 `enemyCanAffordNp_`＋`drainForNp_`。masterless 敵：一般英靈寶具啞火；持 `fx:'solo'`（單獨行動）者靠 `INDEPENDENT_ACTION_RESERVE`(60) 硬撐。敵御主 `refillMastersDaily_`（worldTick 每次跑，新的一天回滿·MEMORY 記【回魔日】）。

### 御主體術/魔術支援傷害
- MEMORY【體術】（E~A rank）/【魔術階位】（E~A rank，限 Caster 生效）。`getMasterMelee_`/`getMasterMagicRank_`（Core_Settings）。
- 複用禮裝注入模式：`injectMasterMeleeSupport_`/`injectMasterMagicSupport_`（Engine_Fate）把 `{fx:'master_melee'/'master_magic', r}` 注入戰鬥單位 skills，走 `SKILL_FX_.master_melee/master_magic`（`dmgAdd:7*rankMul_(r)`·量級同 wind_strike/crafting·凡人不喧賓奪主）。
- 玩家側＋敵側皆接戰鬥：`fateStrike_` 守方分支對「敵從者」用 `enemyMasterMemoryFor_`(Router_Bond) 反查敵御主 MEMORY 注入。體術/魔術發動的 `fired[]` 標籤（御主體術/御主魔術）也餵進 aiPrompt。

### 主要 fx 機制（現行）
- **施放技術（被動化·2026-07）**：`servantActiveSkill_(c)` 只給 3 種原作真·施放技術 `burst 魔力放出`/`str_up 怪力`/`projection 投影`（fx 只活在此層·下修 projection 見 SKILL_FX_）。無按鈕、免耗魔——`rollSkill_`（Router_Battle）每次交鋒 50% 機率自動【全效】發動，未中則該擊無此加成；持有者兩者機率互斥不疊加。敵AI 恆走全效免費（`servantActiveSkill_` 直接餵 `resolveFateBattle_({skill:...})`，不經 50% 骰）。前端「🎲」技能膠囊點開只顯示發動方式說明（`showActiveSkillInfo`），非操作按鈕。常駐被動 `morale 卡里斯瑪`/`aim 千里眼`/`self_mod 自我改造` 不在此列。
- **令咒·蓄勢開關**：❖鈕 toggle（`sealArmed`），之後按 普攻/💥寶具 自動帶令咒（絕對必中 `atkWins=true`＋×1.5）並熄燈。後端 seal/np/skill 獨立旗標。
- **stealth 首擊奇襲**：只在 `opts.ambush` 生效·吃階級（命中+rankVal/10＋要害×~1.4）。**sense 氣息感知**（恩奇都·守方）：`rankVal(sense)≥攻方 stealth`→奇襲先機＋要害全失效。
- **gae_bolg 必中之槍**：`atkWins = gaebolg ? !gbEvaded : (aHit>=dEva)`。閃避機率 `gbEsc`＝幸運＋直感/心眼(0.15)＋變化(0.10)，夾0.6。令咒必中不受影響。
- **ea 執行殺**（吉爾）：僅 `opts.np`＋自身血≤40% 觸發（傷害 寶具rankVal×4+6d12+200·必中越防）。血足走常規×1.7。
- **first_strike/analyze 同一組判定變數**（`||`短路·不疊加）：同角色兩者都掛只算一次——勿讓同一角色兩者並掛。
- **summon_horror（變身框架·魔力供養制）**：單一狀態源 MEMORY`【海怪護盾】cur|max|expiry`（expiry 0=無期限）。入場＝戰鬥解放或戰前 `summon_horror_beast`；退場＝肉身打光/魔力供養不起/`dismiss_horror_beast`。變身態四效果：擋傷（先扣海怪·查 pierces）/再生 `HORROR_REGEN`/追擊/對城防。時間維持費 `HORROR_HOURLY_UPKEEP`(8)，池赤字時海怪先沉回深淵。helper `get/set/clearHorrorShield_`/`horrorPresent_`/`clearExpiredHorror_`。前端 🐙 藍紫血條。⚠ ambush 路徑不走護盾。
- **home_field 主場結界**：於自己陣地決戰＋隊上有【陣地作成】從者→全隊額外減傷 `×(1−0.16r)`。`homeTerritoryRank_`(Router_Movement)→`injectHomeField_`。陣地亦＝安全港：`enemyAmbushOnServant_` 開頭判定，御主純魔≥wardCost 則不挨突襲＋從者反擊擊退。
- **Avalon-Saber 理想鄉**（Mystic_Code `injectMysticBuff_`）：御主持 Avalon＋從者為阿爾托莉雅→注 `avalon_saber`（鞘減傷 npDefMul 0.82）＋`regen`。**完全擋寶具**（被動自動·概念7階）：Router_Battle 敵擊前攔截 `avalon_saber && offenseTier_(enemy)>=6 && 御主純魔≥100` → 完全擋下（eDmg 0）＋扣 100 MP。get_tags `canIdealRealm`。**🐛→✅ 2026-07 玩家「檢查solo看看有沒有問題」稽核抓到**：前次子字串誤判修正(見上方§15)改比對到錯的短名「阿爾托莉雅」——種子真名其實是「阿爾托莉雅·潘德拉貢」，`c.name` 永遠是全名，導致這個招牌機制對唯一合法持有者(正典本尊)從此再也無法觸發；`Router_Action.gs` 的 `canIdealRealm` 卡片旗標卻沒同步、仍用舊子字串比對會誤判為真，於是玩家看到「理想鄉已啟用」徽章但實戰吉爾伽美什解放Ea照樣全額砸穿。兩處已統一改成比對正確的完整真名「阿爾托莉雅·潘德拉貢」。
- **其他常駐被動**：神性/黃金律 wealth(金閃 HP≤20% 免魔放 EA)/天之鎖 chain(`chainVolley_`)/原初符文 rune/變化 shapeshift(迴避+3×階)/道具作成 crafting(傷+8×階)/無毀的湖光 weapon_steal(蘭斯洛特·對「龍/竜」trait ×1.5)/insight(吉爾·命中+4+看破奇襲)/regen(常駐涓流回血約2.5%×階)。
- **金羊毛式無數值標籤**（golden_fleece/double_summon 等）：只掛 FX_DESC 說明·引擎不讀。
- **令咒必中根源**：`opts.seal` 在 `resolveFateBattle_` 內強制 `atkWins=true`（damage 恆歸攻方）。`opts.forceHit` 同保證歸屬。`survive`（戰鬥續行）＝致命傷(after≤0)才觸發；持 `god_hand` 者 `survive` 讓位（`!hasFx_(defC,'god_hand')`）。
- **禮裝掉落標籤**：`petrify` 標籤中性化（`fxName_`＋`·鎖死身法`）供 美杜莎/斯卡蒂/蒼白 共用。

### actionFateBattle 流程（Router_Action.gs）
1. 找出戰從者 `atkIdx`、目標 `nIdx`。同地/AP 檢查、盟友不可打（`isAllied_`）。
2. **斬首**：目標=敵御主且有從者護衛→每名在世從者擲 D20，任一=20 斬殺御主（+護衛隨亡）；全失手→護衛反噬 1.5×。
3. **一般戰**：ROUNDS=3。`partyIdxs`=所有在世從者（雙從者齊攻）。寶具/令咒只加在 atkIdx 開場第一擊，走 `drainForNp_`。
   - ⚠ **回合順序＝我方固定先手**（非骰子決定誰先攻）：每回合 ①我方出擊 ②盟友協同 ③敵從者存活才反擊。骰子只決定單次交鋒誰打贏、傷害算誰的。
4. **協同強襲**（§8）：同地盟友從者每回合助攻一擊（不被反擊）。
5. **敵反擊**：`enemyNpSpent` 一場限一次寶具。**寶具閘**：敵唯有自己被打殘(`eHpRatio<0.5`)或我方從者已殘(`pHpRatio<0.45`)才解放真名；健康對健康一律普攻試探。敵多寶具用 `bestNpChoice_` 選最強。
6. `fateStrike_`：包一次我方攻擊（回 aRoll/hit/damage/destroyed/knocked/victory/sealEscaped/godRevived）。`fateStrike_` 內判定順序：**God Hand（免費復活）先於令咒脫離**；帶 `rule_breaker`/`anti_magic_lance` 攻方用 `severed` 擋復活。**🐛→✅ 2026-07 修「斬斷救贖」誤報**：舊版只要攻方帶 `severed` 技能且這擊致命就無條件顯示「契約已破」，即使守方根本沒有 `god_hand` 可破也照樣跳出——沒破到任何契約卻講得像破了什麼。改成也驗守方確實持有 `god_hand`(`severed && after<=0 && hasFx_(defC,'god_hand')`) 才顯示。**🐛→✅ 同批修「我方從者死亡沒告訴AI」**：`actionFateBattle` 的 `finalLine`／終局指令／收尾指令舊版凡 `destroyedName` 為真就無條件當成「defC(此戰鎖定的敵方目標)死了」，從未考慮 `destroyedName` 實際上可能是 `atkC`(我方出戰從者)自己的名字——雙從者機制下這場若還有其他從者存活，`defeat` 不會是 true，於是走進這段長版戰報卻把「我方死了」誤講成「敵方死了」，AI 收到自相矛盾的事實只能自行接續出「接下來怎麼辦」的續戰畫面。**⚠ 第一版修法不夠嚴謹**：只比對 `destroyedName===atkC.name`——雙從者出戰時，敵反擊/敵盟協防的目標(`ctgt`/`ctgt2`)在 atkC 已陣亡時會改打另一名在世從者(`alt`/`alt2`)，那種情況死的是「我方」但名字不是 atkC，name比對會漏判。改直接查 `destroyedName` 那一列在 `pcData` 裡的真實 `FACTION` 是否為「從者」(`destroyedRow = pcData.find(NAME且GAME_ID相符)`)，涵蓋所有我方陣亡路徑；三處講法的文字也改引用 `destroyedName` 本身而非硬寫 `atkC.name`，避免死的其實是另一名從者卻報錯名字。**已知未修的邊界**：`destroyedName` 是單一字串、每次擊殺覆寫——若同一場戰鬥我方兩名從者都陣亡(先 alt 後 atkC)，較早那位陣亡不會被提及(只留最後一位的名字)，屬於敘事「漏講一人」而非「講反」，優先度較低、這輪未動。

**🐛→✅ 2026-07 五路稽核·戰鬥引擎批次修正**（同一根源：多實體同場時只查了「我方主動出擊」這一種來源，敵方回擊/敵盟協防/斬首反噬各自另一套邏輯沒同步）：
- `敵反擊(es)`/`敵盟協防(pds)`：舊版只讀 `defeat`/`hit`，完全沒檢查 `destroyed`/`knocked`/`godRevived`/`sealEscaped`——雙從者出戰時，這兩種攻擊來源打死的若不是最後一名從者(`defeat` 不成立)，`destroyedName`/`knockedOut` 完全不會被設，AI 戰報與前端都不知道這名從者剛死；若該觸發十二試煉復活或敵方令咒脫離，同樣整組漏掉(令咒脫離不標 `DEAD_`，敵人已經跑了卻仍被當作在場繼續反擊)。已補齊四個檢查，兩處皆比照 `ps`/`hs` 的既有寫法。
- `盟友協同助攻(aps)`：同款漏 `sealEscaped`/`godRevived`——盟友這擊若把敵人打到燃令咒脫離，主流程完全不知道敵人已經逃走，下方「敵反擊」段落只查 `!DEAD_`(令咒脫離不標 DEAD_)，會讓一個已經跑到別處的敵人繼續反擊，位置與敘事雙重矛盾。已補齊。
- `敵盟協防(pds)` 的 `fired` 陣列舊版從沒被 `rl.pactDef` 收集(只存 name/hit/dmg/target)，`extraFired`(餵給 AI 的「戰鬥續行/斬斷救贖」關鍵轉折收集)也只掃了我方出擊的 `pFired`，完全沒掃 `rl.eFired`(敵反擊)或 `rl.pactDef.fired`——已補上 `pactDef.fired` 欄位＋兩處 `extraFired` 掃描。
- 斬首「全部失手·護衛反噬」分支是另一段手刻的死亡結算迷你版，god_hand/survive/severed 三者的判定順序沒同步套用本 session 已在 `fateStrike_` 修好的規則：舊版 `survive` 無條件先撐 1 血、god_hand 的 `after<=0` 判斷永遠進不去(同時持有兩者的從者白嫖一次續命)，且完全沒有 `severed`(rule_breaker/anti_magic_lance)判定。已改成 god_hand 優先、`severed` 阻斷兩者，與主戰鬥路徑一致。
7. 回傳 `report`（前端 `renderFateBattleReport`）＋`aiPrompt`（`servantCard_`+敵御主卡+戰報+從者判斷建議·未分生死時）＋victory/defeat/dreamPrompt。

### 十二試煉 / 令咒 / 戰報
- **god_hand 燒命**：`getGodHandLives_` 無標記預設11（赫拉克勒斯）；種子可加 `lives:N`（尼祿3）；AI 原創持 god_hand 一律標【試煉】3。致命時 `lossN=1`＋概念加成＋overkill，`lossN≥餘命`→燒盡 destroyed。
- **令咒**：`getPlayerSeals_/setPlayerSeals_`（MEMORY【令咒】N）。預設 3 道。令咒對斬首不適用。
- **創角流程（2026-09 大改·玩家「十分混亂不夠直覺、太詳細的資料也沒有用」）**：
  畫面 `scr-warmode`(型態)→`scr-war`(場次)→`scr-role`(參戰方式)→`step-name`→`step-detail` **五屏合成兩屏**
  （`chooseWorld(mode,war)` 一次選定世界；名字/性別/選填全在 `step-name`，選填走 `toggleMasterAdv()` 收合）。
  召喚頁的「瀏覽名冊／自訂生成」分頁拆掉，三條路攤在同一屏並在標題標明深度：
  `① 從英靈殿挑一位·最快` ／ `② 一句話生一位·講個大概` ／ `▸ 🛠️ 逐格自己捏（工房）`。
- **placeholder 的寫法鐵則**（2026-09 玩家「範例看不太到」）：一個 placeholder 只寫「**欄位名：範例**」。
  共用的「選填／留空＝AI 補」提到區塊標題講一次，別每格重複——舊版把欄位名＋說明＋範例＋留空行為
  四件事塞進同一個框，手機寬度一截，最有用的範例正好是被截掉的那一半。
  實測容量：半寬(flex:1)欄位約 9 字、全寬約 18 字、textarea 可折行不受限。新增欄位時照這個上限寫。
  ⚠ 不要改用「旁邊加問號點開看說明」——那是多一次點擊＋多一個元件換來同一份資訊。
- **⚠ 工房曾被砍成 9 欄，同日回滾**（玩家澄清：「分 3 頁沒有關係，我的問題是**有些人喜歡詳細、
  有些人大概就好，我要滿足這兩種人**」）：先前把十個純敘事欄位砍掉是會錯意——那是細節派唯一的
  去處，而分頁本來就是為手機而存在。**三分頁（🎭演出／⚔️靈基／🌟寶具）與全部欄位已還原**，
  改用三件不砍功能的事壓高度：①技能槽從 2×2 四格全展開改成「只長出用到的列＋一顆＋加技能」
  （`refreshSkillRows_`/`clearSkillSlot_`）②六圍的標籤塞進 option 文字（`rankSel` 第 4 參數 `label`，
  **value 仍是純階級**，別讓顯示文字污染值）③演出頁的七個進階細節維持 `cf-drama` 收合。
  實測三頁預設高度：演出 166px／靈基 264px／寶具 176px，都在一個手機螢幕內。
- `actionSaveHero` 的 flavor 補完 2026-09 加吐 `firstP`/`toMaster`/`speech`/`tic` 四格——那四格原本
  沒有 AI fallback，留空就永遠是空的。
- **🎲 命運測定改後端擲**（`rollMasterFate_`／`roll_fate` action）：舊版整套表與公式只在前端，
  玩家不按 🎲 就整組空白；新 UI 明說「留空＝隨機」，所以 `create` 沒收到 circuits 時自己擲一份。
  前端 🎲 改成一次要三份候選讓玩家挑（省掉三次 round-trip，也不再兩邊各存一份 12/50）。
- **三段分工（2026-09 玩家釐清「我有給 AI 事實，要請他去表演出來…不是 1/100 快死還裝沒事」）**：
  ① **數字**＝GAS 算（HP 5/390）② **數字→白話狀態**＝GAS 換算（`hpStateWord_` → 「命懸一線」）
  ③ **怎麼演**＝AI 依個性決定（硬撐／逞強／失態／沉默）。
  ②不能丟給 AI——它不知道 390 是那個人的刻度，比例判斷不可靠；③不能由 GAS 決定——那才是表演。
  中間還缺一條「不准無視」：`miniSystem` 鐵律 6 現在寫「凡是標【已裁定】的事實與【當前狀態】都必須在畫面上看得出來，不准若無其事…但【怎麼】表現依個性」。
  ⚠ 鑑賞早就是這個形狀（`好感:75，事實：她喜歡你，但你們認識還太短，她不會承認。`），solo 缺的就是②。
- **GAS 給事實、情緒交給 AI**（2026-09 玩家定案）：`foeMoodNote`（抵達遇敵）與 `_situText`（戰鬥中的敵御主）舊版會直接寫「讓他們態度和緩、別演成劍拔弩張」「神態需貼合此局勢(得意/焦慮/強撐…)」——那是替 AI 決定演法。現在只報事實（誰對你什麼溫度、誰佔上風），怎麼表現由角色卡上的個性決定。`foeMoodNote` 另從「全場平均」改成逐人報（兩個立場相反的敵人原本會被抹成一個中間值）。
- **送 AI 的戰報·四段分鏡**（2026-09）：`【開場】`場面（主場陣地/夾擊/盟友/敵盟/Caster 職階）→`【交鋒】`過程（技能、御主參戰、敵御主下場、御主電池燒血、關鍵轉折）→`【高潮】`（令咒、寶具解放、對轟、超載、理想鄉、敵寶具反擊）→`【收束】`（反噬、十二試煉、遁走、敵御主目睹、終結宣告、寶具預兆、戰後反應）。舊版是照程式碼順序排的一團條列，時間軸會亂跳（「本戰已終結」之後還冒出「御主體術助拳」），小模型只能照清單流水帳寫——這是「打起來乾巴巴」的結構性原因。
- **抵達敘事**（`buildArrivePrompt_`·2026-09 從前端收回）：`【抵達】`環境敵情→`【剛發生】`（撤離追擊/撞見互毆）→`【在場】`（歸屬、找上門/偶遇、敵方態度、失恃敵御主、盟友告急、姿態）→`★怎麼演`。篇幅 `ARRIVE_WORDS_`、敵卡上限 `ARRIVE_FOE_CARD_CAP_`。
- **送 AI 的戰報**（`Router_Battle.gs` `roundsBrief`）：2026-09 起是單行「交鋒節奏：①命中／②揮空…」＋一句回擊統計，不再逐回合列明細（見 `FUNCTION_MANUAL.md` `actionFateBattle` 那條的說明）。**前端玩家看到的戰報卡不受影響**，仍是 `renderFateBattleReport` 的完整逐回合呈現。
- **戰報**：`renderFateBattleReport` 畫斬首/strikes/雙從者血條/突襲卡/追擊卡/對轟卡/反噬紅幅。`FX_DESC`（Script.html `showSkillDesc`）依 fx 即時算當前階級數值——加新 fx 就同步補這裡。AI 敘述走事實素材列＋單行 steer（show-don't-tell·不報菜名）。⚠ 戰報固定文字卡別綁死攻擊手法（用中性「重創/擊破/威能壓過」）。

---

## 5. 種子庫（英靈殿/御主殿）

- **Seed_Codex.gs**：
  - `SEED_SERVANTS`（**20騎**）：4th/5th 正典14騎（阿爾托莉雅-Saber/EMIYA-Archer/庫丘林-Lancer/美杜莎-Rider/美狄亞-Caster/佐佐木小次郎-Assassin/赫拉克勒斯-Berserker/吉爾伽美什-Archer/迪盧木多-Lancer/伊斯坎達爾-Rider/吉爾德萊-Caster/百貌哈桑-Assassin/咒腕之哈桑-Assassin/蘭斯洛特-Berserker）＋鑑賞客串6騎（斯卡哈-Lancer/斯卡哈-Assassin/恩奇都-Lancer/美遊-Saber/小黑-Archer/伊莉雅-Caster）。每筆 id/cls/realName/wars/gender/six/classSkills/skills/traits/np/align/persona（{firstP,words,toMaster,speech,moe,tic}）。
    - ⚠ **戰爭僅認 `4th`/`5th`**（`fake` 偽聖杯戰爭開局選項＋整套 `FATE_FAKE_ROSTER` 已移除）。chaos 亂鬥靠 `wars` 含 `'客串'` 排除，非硬編碼名單。
    - 單寶具種子的簽名概念 fx 必須掛進 skills（庫丘林 gae_bolg/EMIYA ubw/佐佐木 tsubame/阿爾托莉雅·美遊 excalibur）——只寫 np 字串＝只有規模、沒有概念位階。
  - `SEED_MASTERS`（15名）：id/name/sex/appearance/magic/circuits/melee/magic_rank/home/wish/persona（4段頓號=表象・內裡・喜歡・厭惡，被 masterCard_ 拆解·結構不可動，v67前全數只寫3段、喜歡欄位缺失已補齊）/back(身世)/moe(萌點)。
    - ⚠ **萌點(moe/INTENT)≠只能是反差萌**：泛指任何讓人喜歡上這角色的特色，可以是反差(表面X其實Y)，也可以是單純討喜的外觀/行為/習慣(巨乳/雙馬尾/大食/路痴等)——v67前全站(AI brief生成prompt/每回合演出卡標籤/工房UI文字)都寫死成「反差萌」，逼AI每次都硬套反差句型，已全面鬆綁措辭(見 Gallery.gs/Router_Creation.gs/Router_Persona.gs/Script.html)。
  - `servantToHeroRow_`/`masterToCodexRow_`：物件→分頁列。
  - `seedFateCodex_(ss)`：英靈殿/御主殿為空才灌（冪等）。版本 `CODEX_PERSONA_VER`（現行版號見檔頂），升版觸發 `upgradeCodexPersonas_`（英靈殿整列覆寫+孤兒清理·只刪 source==='seed'）＋`upgradeMasterCodex_`（御主殿整列重寫）。
- **傳播鏈（改 SEED 要升版否則不生效）**：召喚讀英靈殿 sheet→凍進眾生列。升 `CODEX_PERSONA_VER`→`seedFateCodex_`（版本不符才動）→`upgradeCodexPersonas_`＋`resyncSummonedServants_`（依真名+職階刷已召喚從者的寶具/六圍/標籤·不動 HP/MP/MEMORY/敘事）。換職階用遷移表 `SEED_RECLASSED_`（舊key→新key）。手動強制：DEV「🔄 套用最新平衡」→`dev_resync_codex`→`actionDevResyncCodex`。
- **主從 synergy `masterSynergySix_(name,six,memory)`**（Core_Settings）：讀從者 MEMORY【御主】名，特定組合回全盛六圍。目前只 **恩奇都↔銀狼**（原作真御主·恩奇都平時為削弱基線）。擴充往該表加。
- **Seed_Rivals.gs**（開局鋪敵）：
  - `seedRivalsForGame_`：依 war(4th/5th/chaos) 鋪敵御主+敵從者；移除玩家扮演那組。chaos hPool 含玩家原創 ai_gen（Fisher-Yates 均勻抽）。
  - `masterToNpcRow_`：御主殿列→敵御主眾生列。TRAIT←外貌(mAppear)、PREF←persona、BACK←身世、INTENT←萌點、MEMORY=【願望】|【魔術】|【體術】|【魔術階位】|【迴路】。
  - `heroToNpcRow_`：英靈殿列→敵從者眾生列（god_hand 讀 `lives` 覆寫【試煉】）。
  - `canonHeroNames_`：正史真名（禁玩家搶角）。`FATE_4TH_ROSTER`/`FATE_5TH_ROSTER` 各自 `loc` 欄決定敵出生點（非讀 COL.MASTER.HOME）。
- **正典劇情插針系統已退役**（無 Seed_Canon.gs·`checkCanonPins_`/`CANON_PINS`/`spawnGilgamesh_` 皆已刪）。MEMORY【路線】【史】成無用遺留。

---

## 6. 禮裝 Mystic_Code.gs（全面被動化）

- **禮裝全部被動·持有即生效·無主動發動**：戰鬥自動加持我方從者，無按鈕/充能/迴路門檻。
- `MYSTIC_CODES{}`：每項 `{name,type,fx,tier,desc,flavor}`。現存 3 項：avalon(全世界之鞘)/魔力儲存寶石(mc_jewel_minor)/黑鍵(mc_blackkey)。type＝`passive` 或 `special`(rule_breaker 破戒奪僕·另套機制)。
- `MC_COMBAT_{fx→{hit,dmgAdd,npMul,npDefMul,label}}`（單一調平衡點）：mc_blackkey(命中+2)/mc_jewel_minor(命中+1,傷+10)/avalon(承受寶具×0.82＋Time_World 時回×1.6)。
- **接線**：`masterMysticBuffSkill_(memory)`→{n,r,fx}；`injectMysticBuff_(c,masterMemory)` 注入我方從者戰鬥單位 skills（冪等）。`actionFateBattle` 三處注入（atkC 含開場對轟/每回合 sC/`fateStrike_` 內 defC 吃 avalon 減傷）。引擎 `mcCombatFx_(c)` 在 `resolveFateBattle_` 三通道讀取。只注戰鬥單位、不寫回 row。
- `getMystic_/setMystic_`（MEMORY【禮裝】id）、`masterMysticFx_`（查單一 fx，如 Time_World avalon）、`canRuleBreak_`（是否具破戒力：召 Caster美狄亞 或 持破戒禮裝）。
- 創角＝玩家自選 `userData.mystic`（只驗證合法被動禮裝 id·不看身世/迴路門檻）。
- 已移除：`actionUseMystic`/`rollMysticForMaster_`/`pickByTier_`/充能機制/`applyMysticDamageToServant_`/前端 `mysticStrike`/敵卡禮裝鈕。

---

## 7. 時間/AP/供魔 Time_World.gs

- `getClock_/writeClock_`：日/時/AP 存在御主自己那一列（COL.PC.DAY/HOUR/AP），非獨立時鐘表。
- `getAp_/spendAp_(gid,n)/grantAp_(gid,n)`（不推時間）、`restHours_`、`rollHours_`、`timeBand_`(晨/午/夜)、`clockLabel_`。
- AP：每日12，移動2AP、戰鬥/偵查/補魔/禮裝/結盟/共處/整備=1AP、休息每hr補2。
- `playerServantEconomy_`：御主魔力收支 HUD（含 output/outputLabel/svFeed）。工房加成＝atHome‖hasTerritory‖atWorkshop（讀御主【陣地】marker·須與 applyRegen_ 對齊）。**須與 `applyRegen_` 同一套算式。**
- `worldTick_`：跨時推進世界。含：敵移位（`freezeLoc=playerLoc` 玩家格上敵人禁移，避免撲空）、`refillMastersDaily_`、敵從者小幅自癒 `ENEMY_REGEN_RATE_`(0.06·跨輪累積旗標只寫一次)、令咒透支倒數結算、暗處廝殺（`allowAttrition` 休息·第 `ATTRITION_START_DAY`(3) 日起·遠處·存活>`WORLD_FLOOR_`(4)·7%/tick·挑戰力最低者先死）。**🐛→✅ 2026-07 五路稽核修正**：①敵御主移位時「找不到硬連結從者→抓同格任一孤身從者」的 fallback，註解一直寫「孤身」卻從沒真的檢查——只要同格未死就是第一個掃到的被拖走，即使牠其實掛在另一位(這輪未移動/稍後才輪到的)敵御主名下；改成先查該從者的【御主】tag 是否有一位活著且仍在原地的主人，有→跳過不搶。②暗處互鬥的 `offstage` 候選名單完全沒排除 `isAllied_`(已結盟)的敵從者——玩家養出的盟友只要離開玩家所在格，就有機率被系統隨機抽去和不相干的敵從者互鬥致死，跟「結盟＝可倚仗的戰友」矛盾；已排除。**🐛→✅ 2026-07 玩家「檢查solo看看有沒有問題」稽核抓到①的未修孿生**：敵御主移位隨行從者的「第一輪」配對(找 MEMORY 有【御主】=mName 的從者)一直是子字串 `indexOf` 比對——正是 `Router_Movement.gs findClashSv_` 已修過的同一種前綴撞名 bug，而且緊接在後的「第二輪」fallback 早就已經改用 `getServantMaster_` 精確比對，第一輪先撞名誤配對、`break` 就直接跳過了第二輪的正確判準。chaos/AI原創敵御主撞名前綴(如「伊莉雅」vs「伊莉雅絲菲爾-5th」)時會把 B 御主的從者誤拖去 A 御主的新位置。已改成第一輪也用 `getServantMaster_` 精確比對，兩輪判準統一。
- **「養不起爆炸」機制已移除**（總撞同一目標·與隨機初衷矛盾）。
- `leylineAt_`、`masterCircuits_`（MEMORY【迴路】N 預設30）。

---

## 8. 同盟系統

判定全在 GAS，AI 只演出。
- `isAllied_(row)`：MEMORY 是否帶【盟約至】N。`allyUntil_/setAllyMem_/clearAllyMem_`。
- `allianceWillingness_(masterRow,aliveFoes)`：結盟意願（base.42；務實+.25/孤高-.32；剩≤3騎-.45）。
- `actionProposeAlliance`：對同地敵御主提議，`Math.random()<willingness`。成→盟主+其同地從者標【盟約至】day+3。
- `actionBreakAlliance`／`breakStaleAlliances_`：撕毀／自然瓦解（效期到 或 在世敵從者≤3 強制翻臉）。`actionMove`＋`actionRest` 都呼叫。
- `actionAllyBond`：與同地盟友共處，耗1AP，`bumpBond_` 升羈絆，達90標【摯交】（純敘事高光防重複·無鑑賞入口意義）。SFW only。**🐛→✅ 2026-07 修「盟友從者說話像我的從者」**：對象是從者(非御主本人)時，`servantCard_`「對御主」語氣沒說明對象另有其主，AI會腦補成在跟玩家講真契約話語(如「既然契約還在」)——補上 `getServantMaster_` 查真正御主名字，明講「這是暫時結盟、非契約」劃清身分。
- **協同強襲**（actionFateBattle 內）：盟友從者每回合助攻一擊。
- **🆘 盟友告急**（`detectAllyPeril_`·Router_Movement）：`actionMove` 後（worldTick 已推進）若有盟友在【別處】與未結盟活敵從者同格→回 `allyPeril{ally,loc,foe}`＋傳聞，前端插「🆘 盟友告急」報信卡＋「🏃 趕去馳援」一鍵 `travelTo(loc)`（純情報·去不去玩家決定）；抵達那格打敵人時既有協同強襲自動生效。AI 抵達 steer 得知此情報（結盟情報共享）但不替玩家起身。
- **情報共享 `hasAllyInGame_`**：有盟友→地圖無視 SEEN 全揭露＋敵從者職階揭露（`intelCls`）。
- **前端 override `getLocalPeopleList`**：結盟的敵御主/敵從者 faction 改顯 `盟友御主/盟友從者`（`allied:true`），前端不列為可攻擊。

### 🔒 game_id 資料分流
「多帳號遊玩·資料分流不污染」是硬性要求。凡「純比對姓名」的讀寫都須加 game_id 過濾（種子庫有限、AI 原創可能撞名）。已加 `sameGame` 過濾的點：`actionGetFullStatus`/`actionUpdateRelTag`/`actionPlay` 查同行夥伴+寫回座標。破戒奪僕補 `isAllied_` 閘、卸防突襲補 `severed` 閘（與正規戰鬥一致擋復活）。

---

## 10. servantCard_ / persona 注入（show-don't-tell 核心）

- `codexPersona_(name)`：從英靈殿 PERSONA 撈細緻人設（firstP/words/toMaster/speech/moe/tic）。
- `servantCard_(row)`（Router_Persona.gs）：壓成「〈角色背景·僅供內化〉」段塞進 narration prompt。**鐵則一**＝當背景揣摩；**鐵則二**＝設定字眼禁直述/說嘴；**鐵則三**＝依羈絆調親疏。含**狂化偵測**（persona.speech/firstP 含 狂化/無法言語/**僅**咆哮/不語 → 加「禁說完整句、只咆哮」·赫拉克勒斯/蘭斯洛特命中·刻意用「僅咆哮」而非裸「咆哮」，讓「時而文雅、時而癲狂咆哮」的吉爾·德·萊斯這類會說話的角色不誤中）。自稱標籤限定範圍（「台詞內自稱，敘事旁白的『我』永遠是玩家」）防視角混淆。
- `masterCard_(row)`：御主演出依據卡（名/性別/性格/特徵/願望/萌點/體術/魔術）。**御主有聲**：可依性格給台詞，但**不替御主拍板戰略抉擇**（出戰/結盟/移動/補魔由玩家按鍵）、不逼問、不快轉。
- `enemyMasterCard_(row)`：敵御主精簡演出卡（性格取前4/特徵取前3/萌點/身世/體術/魔術，不塞六圍/寶具）。NPC 不受「不可替玩家決定」限制。只在敵御主本人同地在場時注入（`enemyMasterIdx_`＋位置比對）；`actionFateBattle` aiPrompt 加**關係錨**（「此敵御主正是 defC 的契約御主」）＋**戰局實況錨點**（用算好的 HP比例/傷害交換組白話戰況給 AI，讓敵御主反應對得上場面）。正典人物優先調用原作認知、卡片僅錨點。
- **開放世界**（無「同地路人」機制）：solo 同地角色一律純文字（無金色互動連結·整套 `openInteractMenu` 互動選單死碼已刪）。鑑賞路人＝純氛圍背景人煙（`backgroundCrowdStr`·不具名·不追蹤好感）。能被指名/記好感的只有同行隊伍成員。
- `enemyAmbushOnServant_`：卸防（補魔/羈絆/共處/休息/結盟）時同地未結盟敵從者的反應。陣地(homeRank)優先→反擊擊退。無陣地時依該敵從者職階/性格擲局面：狂化(無法言語)/暗殺(本色即偷襲)必定突襲；其餘職階多數突襲、有機會落「按兵不動」或「試探性接觸」(皆無戰鬥·`peaceful:true`，5個呼叫端與前端戰報卡共用同一支函式的回傳判斷 `homeRepel||peaceful`)。回 `report`＋`foeCard`。
- `raiseBond_`(升既有·帶 preData)／`bumpBond_`(無則建)／`getBond_`。`extractWish_`、`buildDreamPrompt_`（敗北虛假之夢·`cause==='timeout'`＝時限夢）、`buildVictoryDreamPrompt_`（勝利真夢·不露破綻）。
- **⏳ 14天時限**：`day>14` 未奪杯＝敗北。中央攔截在 `handleGameAction`——對 PC_ solo 解析回應現成 `clock` 字串，N>14 且 success 且未 victory/defeat → 補 `defeat:true+deadline:true+dreamPrompt`。前端 `data.defeat`→`handleDefeat`。
- ⚠ solo 全走 `narrate_only`，後端只讀 `data.narration`、其餘欄位丟棄——prompt 別再寫「嚴禁輸出 stat_changes/items_gained」（多餘且把欄位名秀給 AI）。外顯狀態 STATUS 在 solo 已移除（AI 寫了沒人看）。

---

## 11. MEMORY 標記（御主/從者 記憶欄 COL.PC.MEMORY，｜分隔）

```
【願望】wish 【令咒】N 【迴路】N(預設30) 【魔術】 【出身】 【體術】 【魔術階位】(限Caster生效)
【模式】canon/chaos 【戰爭】4th/5th 【扮演】正典御主id
【試煉】N(god_hand命數) 【寶具預告】1(敵蓄勢·getNpTelegraph_) 【過充】N(補魔存的無償超載額度·一次性·getOvercharge_)
【換裝】文字(從者服裝·換衣不換人·getOutfit_) 【武裝】文字(從者武器·敘述強制·getWeapon_)
【出力】pct(靈基出力檔) 【整備至】絕對小時(戰前buff) 【回魔日】day(敵御主·refillMastersDaily_)
【羈絆日】D:type1,type2(跨日重置) 【羈絆里程碑】30,60,90(已演出清單·get/setBondMilestonesFired_)
【陣地】loc(setWorkshop·供魔工房+8·getWorkshop_) 【搜刮】loc(scavenge·魔力枯竭標記) 【禮裝】id
【示好日】day(actionCourtEnemy 每敵每日一次限制·存敵人列)
【盟約至】day 【摯交】(盟友羈絆90里程碑·防重複·無鑑賞入口) 【破戒奪取】
【敵盟】對方御主名:到期day(敵敵結盟·get/setEnemyPact_·worldTick 暗鬥會跳過已締盟兩敵) 【交惡】對方御主名:到期day(挑撥得逞·get/setEnemyFeud_·撞見時狠推火併/追殺) 【提防】絕對小時(遭趁隙偷襲後戒心·get/setWary_·WARY_HOURS_6內再趁隙×0.6)
【趁隙】loc@type(撞見敵人的可反應窗口·決定抵達該格開放哪些情境選擇·get/set/clearEncounterWindow_·移動或用掉即清)
【魔境】fx(玩家選的通用A階被動·set_mage_realm·rowToCombatant_ 注入) 【符文】def/dmg/regen(set_rune_mode)
【御主】名/【從者】名(敵御主↔敵從者硬連結) 【喪失從者】名·死因 【靈基透支】絕對時數(令咒燒盡倒數·stampDoom_)
【海怪護盾】cur|max|expiry(summon_horror 變身態) 【出力】等
⚠ 無用遺留(不再讀)：【路線】【史】(正典插針退役)、【強撐】(second_wind 舊日限)、【主動技】(開關制已改按鈕制)
```
可選能力標籤（魔境/原初符文）UI＝小膠囊·發亮，點開在說明 popup 內挑選（`openMageRealmPicker`/`openRunePicker`→`pickSelectable`）。

---

## 12. 前端 Script.html（solo UI）

- `applyModeUI()`：模式總開關（§1）。
- **狀態面板**：`refreshFateTags`（御主/雙從者卡、補魔/羈絆/令咒/休息/禮裝）、`setActiveServant`、`bondWord`。從者卡「📜狀態」小鈕→`openStatus`（完整命盤）。
- **戰爭行動列**：`renderWarActions`（手風琴·每目標一張可點開卡·`toggleWarTarget`/`warExpanded`·底部固定偵查/休息/移動）、`attackStyle_`（近戰=攻擊/魔砲/狙擊）、`localFoeServantName`。
- **行動 handler**（多數走共用骨架 `runSimpleAction_`）：`servantStrike`（出戰/寶具/令咒/刺殺御主）、`manaSupply`、`spiritRepair`、`bond`/`openBondMenu`、`rest`/`openRestMenu`、`scout`、`ruleBreakSteal`、`secondWind`、`setWorkshop`/`scavenge`、`proposeAlliance`/`breakAlliance`/`allyBond`、`prepMeal`。攻擊列 `previewActiveSkill_`（⚡主動預覽·鏡射後端優先序/耗魔）、寶具旁 `🔥＋`/`🩸＋＋` 超載檔位鈕（`npTierArmed`·零 confirm·發射後歸零）、❖令咒蓄勢 toggle。
- **戰報**：`renderFateBattleReport`（斬首/strikes/雙從者血條/突襲/追擊/對轟/反噬卡·`stripOwnName` 去重）、`narrate`（**補 await**·等敘述生成完才 `endAction` 解鎖·防搶按）。**🎨 2026-07 回合細節收合**：多回合戰報(`!r.rounds` 之後那段)的逐回合骰值／命中迴避／〔發動〕技能標籤(如「武器骰5d8=25・出力100%・全開・符咒刻印」這類機制代號)舊版直接攤開印在敘事前，玩家得先解析一串開發者除錯用的代號才看得到故事(違反 Don't Make Me Think 的「別讓我思考」/掃視原則)——改用原生 `<details>/<summary>` 包住整段逐回合流水帳，預設收合、顯示「▸ 回合細節（骰值／技能發動，共N回合）」，結算摘要(總傷害/HP條)不受影響、照樣一律可見。
- **敗北/勝利收場**：`handleDefeat`→虛假之夢→🐯老虎道場 AI 講評（`runTigerDojo_`·依實際敗因·藤村大河+伊莉雅吐槽+對症建議）。`handleVictory`→願望真夢→道場祝賀版→奪杯畫面（共用殼·`openTigerDojo('victory')`）。**🐯 2026-07 道場提示詞收回後端**：前端兩支 `buildTigerDojo*Prompt_` 移除，`handleDefeat` 改從戰報挑出敗因【鍵】(`{cause:'ambush',foeName:…}`)送 `action:'tiger_dojo'`，文案由 `DOJO_CAUSE_` 五格查表組。順手解掉一個舊矛盾：道場原本走 `narrate_only`，被迫吃 `miniSystem` 的「第一人稱我·不用你」「瀕死就是命懸一線」——跟兩人對話＋搞笑教學正面打架，舊版是在提示詞尾巴硬寫「無視戰場的緊張基調」對抗它。現在自帶 264 字說書人設定，也不再附 `lastAiContext` 散文與整表 state。
- **召喚/創角**（搬到 `Script_Onboarding.html`·只開局跑一次·共享同頁全域作用域）：`accountLogin`/`chooseWarMode`/`chooseWar`/`chooseRole`/`pickCanonMaster`、`rollFate`/`selectFateRoll`/`renderFateRolls`（魔術天賦測定·擲 melee＋獨立擲 magicRank）、`checkName`/`createPC`/`backfillMasterAi`、`doSummon`/`summonByHero`/`startGame`。
- **地圖**：`renderMapPane`（陣地/搜索/盟友通報橫幅·優先吃夾帶 `mapNodes` 免 round-trip·存 `lastMapNodes` 快取）、`buildMapSvg_`（節點實色 `typeColor`＋圖例對齊）。**20 正典地點**種子在 `Setup_FateWorld.gs` `FATE_MAP_SEED`（`reseedIfEmpty_` upsert）；前端位置是 `buildMapSvg_` 內 hardcoded `LAYOUT`（非試算表座標）。改地圖同步改種子（名字）＋LAYOUT（位置）。`COL.MAP.WAR` 戰爭分流（'4th' 限定海特飯店/麥肯基宅/碼頭倉庫）。
- **移動敘事 `actionMove`**：先 `worldTick_`（敵換位）→重讀眾生→落玩家到 target→讀同地人物。回傳 `servantCard`（我方·前綴【我方從者】）＋`foeCards`（敵·前綴【敵方從者·非我方】）＋`masterCard`。**🐛→✅ 2026-07 修「多組敵人卡片混拼無標籤」**：`foeCardsMove` 舊版把同地所有敵從者/敵御主的卡片原樣串接，同地若同時有 ≥2 組敵人(各自帶從者)，AI 沒有配對依據可能把 A 組從者的台詞演成對 B 組御主講；只在同地確實偵測到 ≥2 位敵御主時，才用【御主】硬連結 tag 幫每張敵從者卡加上「〔「某御主」之從者〕」標籤(單組場面不加標籤、維持原樣)。前端 `travelTo` 抵達提示前置。無人在場禁生具名角色；遭遇分「找上門/偶遇」（讀 `preFoes`）。**御主參戰風格**（＝前身「接敵姿態」·存 localStorage `fate_stance`·免 round-trip·一鍵三段藥丸 `STANCES`）：🛡️後方支援(stealth·0%)／👁️見機行事(normal·5%)／🔥正大光明(open·10%)。一鍵定兩事——①接敵/撤退敘事基調（`stanceNotice_`/`stanceLine_` 誰先發現誰）②戰鬥中御主替從者**分擔戰損比例**（見下 §14 ①）。`fate_battle` 與 `move` payload 皆帶 `stance`。
- **🏃撤退（追擊已全數轉移到撤退鈕）**（`actionMove`·用移動前資料判定）：**有敵擋道即封鎖從容移動**——離場格有【非盟約·已登場·未友好(BOND<50)】能戰敵從者時，plain move 被擋回 `needRetreat`，須改按 **🏃撤退**（`retreat:true`）殺出重圍。**追擊唯 isRetreat 才觸發**（一般移動遇敵已被 needRetreat 擋走、遇不到敵則無人可追→**不再有機率性離場追擊**）：撤退時敵**必追**（無視敏捷門檻、燃令咒、追兵帶 ambush 先機），`resolveFateBattle_` 真·雙向判定（我輸/我贏回身逼退·保1不致死）。回 `pursuit`（含 `foeCard`·`retreat` 旗標）＋數字戰報卡。slip 窗口（敵分心）可悄悄離開、不封鎖、不追。前端 UI（玩家定案）：**有敵從者在場時，底部「🗺️移動」鈕直接變「🏃撤退突圍」**（`renderWarActions`·`foeServs.length` 判定）→ 點開 `promptRetreat` 退路選單選地點；地圖頁同時換上「⚔️此地有敵·點地點將轉撤退」提示，點任一節點被後端 `needRetreat` 擋→跳「🏃撤退突圍」卡（＝也讓玩家選地點）。不再有 foe-panel 內的獨立撤退鈕。NP 預告背擊(teleFoe)亦併入撤退路徑。
- **抵達時撞見兩方敵人**（`resolveFactionEncounter_`·Router_Movement）：≥2 位不同敵御主（皆非結盟）同格→**不再永遠「互毆→見你停手」**，改**資料驅動權重表擲一種局面**：clash(交手餘傷·停手)／frenzy(殺紅眼·沒理你繼續打)／standoff(對峙未發)／hunt(一方追殺殘方)／unite(暫時聯手戒你)／pact(敵敵結盟·設【敵盟】)／truce(各自休整)／parley(談判被打斷)／allied_pair(已締盟續演)。權重依雙方 `masterPersonaLean_`（性格投契度·與 `allianceWillingness_` 共用單一真實來源）＋從者傷勢差＋殘敵數動態調整。HP 餘傷／`setEnemyPact_` 敵盟標記等後果 GAS 落地寫 allPcData，`factionClash.note`（純場面事實）給 AI 演出。加局面＝往權重表 W 加一項＋switch 補一段 note。前端 arrivePrompt 用中性 steer（不再假設「你打斷了戰鬥」）。**敵盟／交惡回饋**：已締【敵盟】未逾期→直接演 allied_pair（不重擲）＋`worldTick_` 暗鬥跳過這對（不自相殘殺）＋**正面戰鬥協防**（`actionFateBattle`：攻其一，其敵盟夥伴的同地從者每回合替其反擊我方一記·敵版協同強襲·`rl.pactDef`）；已結【交惡】未逾期→抽掉 pact/unite/truce/parley/standoff、狠推 frenzy/hunt。
- **撞見敵人的配套「後續選擇」**（局面決定開放哪些按鈕·`FACTION_ENCOUNTER_CHOICES_` 資料表）：抵達時 `resolveFactionEncounter_` 回 `choices:{ambush,incite,slip}`，actionMove 寫【趁隙】loc@type 窗口進御主 MEMORY，`buildTagsPayload_` 回 `encounterWindow` → 前端 `renderEncounterBubbles`（複用鑑賞 `.btn-option` 泡泡·GAS 自產不靠 AI）畫進 `options-container`；抵達時 travelTo 吃 `_state.tags`、之後每次 `refreshFateTags` 依 `window._encWin` 重畫，窗口清掉即自動消失。
  - 🥷 **趁隙偷襲**（`faction_ambush`→`actionFactionAmbush`→`playerAmbushOnEnemy_`）：敵分心（frenzy/standoff/parley/pact）時搶一記奇襲，複用 `resolveFateBattle_` 的 `ambush` 先機（鏡射 `enemyAmbushOnServant_` 反向），×1.5 加乘、處理敵死亡(DEAD_/`markMasterLostServant_`/`aliveEnemyServants_` 勝利)。耗 1AP、用掉清窗口。
  - 🎭 **挑撥離間**（`incite`→`actionIncite`）：standoff/parley 時煽動兩敵。成敗由 `masterPersonaLean_` 擲（base .5＋孤狼.2−雙務實.25，夾[.1,.85]）；成功→兩敵真打(雙方扣血·保1)，失敗→兩敵合流戒你(無數值罰)。耗 1AP。
  - 💨 **悄悄離開**（slip）：frenzy/parley/pact 時，`actionMove` 讀【趁隙】窗口→跳過撤離追擊判定。
  - 兩 action 皆進 `STATE_AFTER_ACTIONS`＋`KANSHOU_BLOCKED_ACTIONS_`。
- **🫶 好感提高成功率（GAS 判定·單一真實來源 `bondFavor_(row)`）**：BOND 0-100，40＝中性（未互動過的 0/空視為 40）；回 `(b-40)/60` ∈[-0.67,+1.0]。「對方對你的好感越高→越容易成」套進四處：①`allianceWillingness_` +bondFavor×0.3（交涉結盟）②`actionIncite` prob +avg×0.25（挑撥）③`actionMove` `foeMood`（遇敵態度·依在場敵對者平均好感給 AI 定調 steer·中性留空）④`playerAmbushOnEnemy_` 奇襲加乘 `ambushMul=1.3+clamp(bondFavor×0.5,-0.25,0.5)`（趁隙）。**另有既有的 emergent 回饋**：BOND≥50 的敵從者離場時不追擊你（`actionMove` 撤離追擊條件）。
- **🕊️ 主動培養敵人好感的入口＝`actionCourtEnemy`（示好／交涉·action `court_enemy`）**：對同地【未結盟】**敵御主**（只對御主·交涉對象＝決策者·前端只在敵御主卡出鈕、後端 faction 鎖 `敵御主`；含括號名靠 npcId 比對免漏）釋出善意→GAS 依 `masterPersonaLean_` 定升幅（務實 +10~13／中性 +6~9／孤狼瘋狂 +2~5·地板 2），`bumpBond_` 升 BOND、AI 只演對方依性格×好感的反應。**⚠ 好感是「整組(御主＋硬連結從者)對你的態度」：示好任一半→連坐把另一半 BOND 一起升**（否則會踩「示好從者卻只有讀御主的結盟受惠、讀從者的偷襲/挑撥/撤離沒動」的錯位坑）。`bondFavor_` 未互動(空)＝中性40、被磨到真0＝敵意底(不再吞回中性)。每名敵人每日一次（【示好日】<day> 存對方列）、耗 1AP、無突襲風險（純口頭善意）。這是上面整套「好感提高成功率」的**主動入口**——養高了遇敵和緩／結盟易／挑撥靈／趁隙狠／撤離不被追。前端＝每張敵人卡多一顆「🕊️ 示好／交涉」鈕。進 `STATE_AFTER_ACTIONS`＋`KANSHOU_BLOCKED_ACTIONS_`。**（原養到 90 蓋【鑑賞緣】戰後納入鑑賞已砍——鑑賞角色一律鑑賞內自行召喚、不靠 solo 帶入。）**
- **趁隙／挑撥的後續配套**：趁隙偷襲沒殺死→對方蓋【提防】（`setWary_`·6 小時內再趁隙傷害 ×0.6，不能無限白嫖同一人）。挑撥離間得逞→兩敵蓋【交惡】（結樑子·影響日後遭遇局面）；被看穿→兩敵各降 4 好感（操弄未遂留芥蒂）。
- **令咒透支倒數**：敵從者燃最後令咒脫離（無 `fx:'solo'`）→`stampDoom_` 寫【靈基透支】死線（day*24+hour+`SEAL_DOOM_HOURS`=3）。`worldTick_` 到期 `DEAD_`＋風聞。收掉最後敵從者→`victory:true`。御主戰死也連坐同款倒數（masterless 敵從者）。單獨行動者免倒數。**🐛→✅ 2026-07 玩家指正「令咒脫離本主也該一起走」**：撤離時舊版只在「本主剛好與從者同地」才把御主一起搬到 `newLoc`，遠端御主完全不動——玩家指正「令咒＝命令英靈帶著御主強制拖離戰鬥」，不是從者自己逃、御主留在原地。已改成一律把硬連結本主也搬去 `newLoc`（`Router_Battle.gs` 令咒脫離分支）。**這順便補上一個連鎖問題**：敵從者在 `Time_World.gs` 的世界自走裡沒有獨立移動機會(只有敵御主會擲骰移位、順便帶走同地從者)——舊版一旦因令咒脫離被拆散，兩人就再也碰不到面；改成一律同行後，這對主從不會再因這個事件永久失散。
- **喪失從者的敵御主**：敵從者死亡時 `markMasterLostServant_` 在同地敵御主 MEMORY 寫【喪失從者】。前端演出形單影隻。
- **敘事連續記憶 `lastAiContext`**（模組級·最近 AI 文≤300字）：`narrate`/play 更新；`travelTo` 在 foe 時當「前情」塞進抵達提示（承接逃跑後再遇）。
- **逆天改命**：`openFateEdit`/`saveFate`→`actionUpdateFate`。只准改 4 敘事欄（back身世限30/intent萌點限30/trait特徵4格×20/pref個性4格×20），數值與寶具鎖死。特徵4格＝外貌/氣質舉止/自稱與口氣/卸下心防的私密一面（末格＝鑑賞親密種子）；個性4格＝日常表象/真實內裡/喜歡/討厭。`parseTraitsHelper`(Core_Settings) 切割前先把 句號→頓號 正規化（防 AI 誤用句號分隔黏預設殘料）。
- **全域等待遮罩**：`beginAction(msg)`→`showProcessing`，`endAction`→`hideProcessing`。**忙碌鎖**：`send()` 的 `if(btn.disabled) return` 涵蓋所有入口（防連點並發 lost-update）。
- **九州殘留**：前端九州 UI 按鈕仍在但 mode 隱藏＋未知 action 優雅回錯誤，無害；孤兒 helper（transferMoney 等）留著無害。系統錯誤訊息已改貼世界觀的柔性文案（非 F12/技術術語）。

---

## 13. 已完成的四大區塊

①戰鬥職階相剋＋寶具專屬（Engine_Fate） ②~~正典劇情橋段~~已退役 ③戰爭規則含結盟（同盟系統） ④日常與羈絆（bond/補魔/夢境/禮裝/雙從者/破戒奪僕/同盟生命週期→鑑賞）。種子庫 20 從者＋15 御主 persona 全補完。

*完整逐檔逐函式 track 矩陣見 `HANDBOOK.md` §12；每個 action↔按鈕↔prompt 全景見 `AI_PROMPT_MAP.md`。改碼順手更新本檔。*

---

## 14. 戰鬥改版（2026-07·御主參戰／被動技／撤退／全戰報卡）

- **① 御主參戰風格·替從者分擔戰損**（`STANCE_SHARE_`＝{stealth:0, normal:.05, open:.10}·`stanceShareOf_`／`applyMasterStanceShare_`·Router_Battle）：`actionFateBattle` 讀 `userData.stance` 得 share。每當從者挨了**非致命**一擊（主戰輪敵反擊／敵盟協防／開場對轟回震），御主「討回」`round(dmg×share)` 替扛——從者HP回補、御主HP扣（保底1·不因分擔而死；御主≤1則無力再擋），兩列即刻寫回 sheet（比照 backlash/drainForNp_ 逐事件寫）。累計 `masterShared` 進戰報 `report.masterShared`＋敘述句＋前端「🎌御主參戰：替扛 −X HP」＋御主血條（陣前）。**單一真實來源**：share 值後端為準、前端 `STANCES[k].share` 僅顯示。
- **② 主動技→被動 30%**（`rollSkill_`·Router_Battle｜移除 `tinyActiveSkill_`/drain/`⚡主動`鈕）：施放技術（burst/str_up/projection）不再手動、不扣魔、無微效保底——改**每一擊獨立擲 `SKILL_PROC_` 機率自動全效發動**（現行 0.3，2026-07 玩家回饋原 0.5 太強下修·rounds 迴圈＋開場對轟各自擲）。`skillFired` 記本戰是否至少發動一次→敘述＋戰報 `report.skill{name,icon,desc}`。前端刪 `activeSkillOfActive_`／`⚡主動` 鈕／`useSkill` 全鏈；從者卡標籤與 popup 說明改純機制敘述(不再另掛跟角色實際技能名重複的通用代稱)。
- **③ 撤退按鈕**：見 §12「撤離追擊／🏃撤退」。核心＝有敵封鎖 plain move（`needRetreat`）＋撤退必追擊（GAS 判勝負）。
- **④ 全戰鬥須有 GAS 戰報卡**（玩家鐵則：所有落血皆 GAS 算·不容 AI 亂掰數字）。`renderFateBattleReport` 新增／補全卡型：
  - 🎭 **敵營動向**（`resolveFactionEncounter_` 回 `report{factionClash,ftype,hits[]}`·frenzy/hunt/clash 才落血）→ travelTo 渲染 `data.factionClash.report`。
  - 🥷 **趁隙偷襲**（player 方向·`report.player`＋`eHpMax`）→ `factionAmbush` onSuccess 渲染·敵血條卡。
  - 🎭 **挑撥離間**（得逞·`report.incite`·雙敵落血含 loAfter/wiAfter）→ `incite` onSuccess 渲染；被看穿無傷不畫卡。
  - 🤝 **敵盟協防逐擊**（`rd.pactDef` 於 round 區塊條列「協防·X 襲 Y −Z」，不再混進總血條看不見）。
  - 例外：`worldTick_` 暗處互鬥（off-screen）刻意不洩具體數字、只出模糊風聞（AI 亦無數字可掰·非缺口）。

---

## 15. 五路稽核批次②③（2026-07・經濟創角＋種子資料防呆補強）

- **`masterMaxHpMp_`(Core_Settings) 補上限**：舊版 `Math.max(1, parseInt(circuits)||30)` 只擋下限，直打 API 送 `circuits=999999` 能生出近乎無限 HP/MP 的御主，且這個數字會永久寫進 MEMORY【迴路】——之後 `masterPoolMax_` 是另外重新 parse 這串 MEMORY 字串算共用魔力池(不會再走 `masterMaxHpMp_`)。改成 `Math.min(50,...)`(比照前端骰子 UI 上限)，`actionManualNpc` 也改用同一個算好的 `safeCircuits` 寫進 HP/MP 與 MEMORY 兩處，不再各自算一次導致上限形同虛設。
- **`actionSummonServant` AI 生成分支補齊防呆**（比照工房 `parseForgeBuild_` 既有規則，一次補齊四處）：`realName` 補 HTML 斷字字元清洗＋長度封頂 20（舊版只 `.trim()`，且 `recordOriginalHero_` 內部清洗是函式內區域變數副本，不會回寫外層——造成「這局實際用的名字」跟「寫回英靈殿的名字」不一致，前者完全繞過清洗）；`sex` 補 `["男","女","異"]` 白名單（舊版 AI 吐什麼字串就存什麼）；`np`(寶具描述) 補 HTML 斷字字元清洗；`sanitizeSkills_` 的技能名 `n` 欄同樣補上 HTML 斷字字元清洗（這是 AI 生成從者唯一經過的技能清洗函式，產出名稱會永久寫進英靈殿＋顯示戰鬥 UI）。
- **AI 生成從者 `back`(身世) 補寫回英靈殿**：舊版 `recordOriginalHero_` 呼叫的 `pExtra` 沒帶 `back`，即使當局戰鬥列(`row[COL.PC.BACK]`)明明有值，永久寫回的 `persona.back` 卻恆為空字串——之後任何重新召喚都會落回泛用預設值「職階・真名」，AI 當初生成的身世徹底遺失，工房編輯清單也永遠看到空白欄位。已比照工房 `actionSaveHero` 補傳 `back`。
- **`injectMysticBuff_`(Mystic_Code) Avalon+Saber 改精確比對**：舊版用子字串正則 `/阿爾托莉雅/.test(c.name)`，玩家自訂/AI 生成的 Saber 從者只要真名剛好包含這四個字（如刻意取名「阿爾托莉雅・奧爾塔」）就會被誤判成王之聖劍合法持有者。改成完整真名相等 `String(c.name).trim()==='阿爾托莉雅'`。
- **`SEED_RECLASSED_`(Seed_Codex) 清除懸空遷移項**：舊表 `'貞德｜Ruler':'貞德｜Archer'` 一條，新舊 key 指的「貞德」在現行 `SEED_SERVANTS` 都查無此人（regulation 換版遺留、從未清理），與本 session 稍早已清掉的迦爾納/蒼白騎兵死碼同一類——已移除，只留活的 `'吉爾·德·萊斯（青鬍子）｜Caster':'吉爾·德·萊斯｜Caster'` 改名映射。
- **3 位種子英靈補 `dailyBack`**：恩奇都-Lancer／斯卡哈-Assassin／伊莉雅-Caster 先前缺 `dailyBack`(鑑賞日常版身世一句)，已比照其他種子英靈補上。

**⚠ 五路稽核尚未處理的中低優先項**（詳見稽核報告，未來要做時直接查對應檔案）：斬首反噬機率估算未注入御主加成/主場/禮裝、斬首「大成功」雙從者同時擲20固定歸主戰從者完成斬殺(非隨機/雙重觸發)、`Gate of Skye`寶具描述稱即死判定但引擎無實作、`setEnemyPact_`/`setEnemyFeud_` 只存單一夥伴標記(3方以上關係會互相覆寫)、`actionIncite` 再掃前2敵從者未核對是否為 `resolveFactionEncounter_` 認定的同一對、NP預告攔截/趁隙偷襲的「first match wins」只從一個合格對象觸發、`MYSTIC_CODES` 與 Index.html 選項列表兩份手動同步的平行拷貝、`COL.MASTER.HOME` 定義了卻沒人讀(實際出生地來自 ROSTER 自己的loc)、"疫病"特性機制已全孤兒(無種子角色持有)、`FATE_SHEET_DEFS["眾生"]` header 少3欄對不上 COL.PC。

## 16. 五路稽核批次④（2026-07・戰鬥/移動精確比對＋前端資訊誠實化）

- **`injectMysticBuff_`(前批次已修) 之外另兩處子字串比對改精確**：`actionFateBattle`/`actionSummonHorror`(Router_Battle.gs) 的 `wantSv` 舊版 `String(name).includes(wantSv)` 挑選出戰從者，雙從者其一真名為另一人前綴時(如「阿爾托莉雅」vs「阿爾托莉雅・奧爾塔」)會選錯人出戰或誤觸發變身；`actionMove` 的 `findClashSv_`(Router_Movement.gs) 舊版 `indexOf("【御主】"+mN)` 子字串比對硬連結，同款前綴碰撞風險。三處統一改精確相等 / 改用單一真實來源 `getServantMaster_`。
- **`actionMove` 撞見敵人只處理前 2 組敵御主**：`clashMasters` 舊版固定只取 `[0]`/`[1]`，同地若有 3 組以上敵御主，第 3 組以後永遠沒有「敵營動向」演出機會。改成 ≥3 組時隨機抽一對，多組時輪流有機會登場（非受害於固定順序）。
- **`actionBreakAlliance` 空 `npcName` 全滅盟約**：舊版 `(!npcName || ...)` 條件在缺/空名字時對每個已結盟對象都成立——前端 UI 一律帶明確名字，但直打 API 漏傳會一次撕毀玩家「所有」現存盟約而非預期的「這一個」。改成缺名字直接擋下回錯誤訊息。
- **god_hand(十二試煉) 說明 popup 補真實命數**：舊版前端 `FX_DESC.god_hand` 寫死「11 次」，只對種子赫拉克勒斯正確，工房/AI生成從者實際固定3命、尼祿等敵方各自有專屬命數。`buildTagsPayload_`(Router_Action.gs) 補算 `s.ghLives`(該從者實際剩餘命數，走 `getGodHandLives_`)隨從者資料一起下傳，`pill()`/`showSkillDesc()`(Script.html) 補一個 `extra` 參數把這個真值帶進 popup 文案，不再顯示錯誤數字。
- **`TRAIT_DESC` 神性/神格/神靈描述補真實倍率區間**：舊版三則皆寫死「寶具威力+10%」，引擎實際公式(`Engine_Fate.gs` `1+0.1×rankMul_(自身神格)`)依階級介於 ×1.02(E-)~×1.2(EX)，跟已修過的同類問題(god_slay 描述)同一類但沒同步——改寫成區間描述。
- **`renderWarActions` 敵人卡改用 id 去重**：舊版 `usedSv` 以名字字串當 key，兩敵方實體恰好撞名時其中一個會被誤判「已配對」變成 ghost 佔位，即使牠仍活著有主。`localPeopleList` 每個實體本就有穩定 `id`，改用 id 當 key。
- **`servantStrike` 目標查找補陣營過濾**：舊版 `localNPCs.find(n=>n.name===npcName)` 純用名字比對、不分陣營，若同地某盟友/其他敵人恰巧與被點目標同名，會把錯誤的 id 送進 `fate_battle` payload。改成先按 `isMaster` 決定該找「敵御主」還是「敵從者」陣營再比名字。
- **「戰鬥續行」技能說明修正「可反覆」誤導**：`Script_Onboarding.html` 技能圖鑑舊版寫「可反覆」，讀起來像能連續多次自動觸發，實際機制是撐 1 血後必須先被治癒回 1 以上，下次致命傷才會再度觸發——改寫成「須先療傷才能再撐一次」。
- **`localFoeServantName()` 補多敵情況**：舊版只回第一個找到的敵從者名字，同地若有 ≥2 個未結盟敵從者，卸防警示(休息/補魔/靈基修復/羈絆/與盟友共處前置確認)只提一個名字、低估威脅——改成找全部，多於1個時在名字後補「等N名」（不變動任一呼叫端的字串組裝格式）。

## 17. 更廣範圍擴大稽核（2026-07・9維度找問題＋雙重對抗驗證，25項確認為真全數修復）

玩家對五路稽核仍不放心，要求開一輪更徹底的：9個維度(戰鬥引擎/移動世界模擬/創角召喚工房/種子資料schema/前端UI/MEMORY標記一致性/AI敘事一致性/效能round-trip/輸入驗證安全邊界)平行找問題，每個候選發現派2個獨立AI各自讀code嘗試推翻，兩個都推翻不了才算數。26個候選中25個確認為真、1個被推翻，25個全數修復：

**安全邊界**：
- `sanitizeUserData_` 的 `STRICT_NAME_FIELDS` 白名單寫的是 `newRelName`，但 `actionUpdateRelTag` 實際讀的欄位叫 `newTagText`——兩個字串對不上，這條HTML斷字字元清洗規則從沒生效過，關係稱呼欄位只吃長度截斷，前端卡片onclick屬性拼接又只濾單引號，等於留一個可注入的缺口。改成白名單放對的鍵名。
- `setOutfit_`/`setWeapon_`(Core_Settings.gs) 只濾MEMORY分隔符沒濾HTML斷字字元，換裝/武裝文字被原樣拼進innerHTML且未逃逸——比照同批已修過的realName/np補上清洗。
- 工房與AI生成兩路徑的特性(traits)名稱只做長度截斷，唯獨技能名稱有HTML斷字字元清洗——兩路徑都補齊。

**創角召喚工房**：
- AI自訂召喚只有六圍下限保底(`bumpSixToFloor_`)沒有上限——工房 `parseForgeBuild_` 超預算會直接拒絕，AI沒有「打回重填」的來回，可無上限超出預算。新增 `capSixToBudget_`(反向邏輯：超標就砍最強一項六圍)，`FORGE_CLS_BONUS_` 上移為檔案級單一真實來源給兩路徑共用。
- `sanitizeSkills_` 的技能階級驗證允許 `EX` 且帶 `+/++/-` 修飾符，但 `forgeCost_` 計價表只有裸 E/D/C/B/A 五個鍵，EX技能落到比B/A都便宜的預設分卻套用真正EX的戰鬥威力——改成只認裸E/D/C/B/A，比照工房驗證集合。
- `actionManualNpc` 寫入【扮演】標記只看 `userData.playedMaster` 是否有值，沒同步要求 `_playingThisCanon`(真名比對)——玩家選扮演正典御主又改名，仍會殘留標記讓 `seedRivalsForGame_` 誤刪一組正典敵人，免費刪對手。改成共用同一個判準。
- **🐛→✅ 2026-07 追加**（玩家「SOLO也看一下是不是有類似問題」，比對鑑賞小道具稽核抓到的同款漏洞回頭複查）：`actionManualNpc` 的 `standing`(身世)/`wish`(願望)這兩格開局自由輸入，只靠前端 `#s-standing`/`#s-wish` 的 `maxlength=40` 擋，backend 完全沒設上限——`newRow[COL.PC.BACK]`原本直接寫`standing`不裁長度，`cleanTagText_(wish)`也沒有長度參數。`actionBackfillMasterAi` 餵進 AI 提示詞的 `appearance`/`standing`/`wish` 同樣沒有任何長度上限。都已補上跟前端一致的上限(appearance 30／standing・wish 40)。§9維度稽核當時抓的是`realName`/`sex`/`np`/技能名/特性名這幾欄，`standing`/`wish`/`appearance`這三格是後來才補的「開局非阻塞創角」欄位，沒被那輪覆蓋到——**任何新增的自由輸入欄位都要重新過一次這張 checklist，不能假設「已經稽核過一次」就自動涵蓋新欄位**。

**戰鬥引擎**：
- `hasCausalityNp_`(Engine_Fate.gs) 掃整個永久技能列表找 `causality` 旗標，沒管「這次實際解放的是哪個寶具」——斯卡哈雙寶具其一是Gáe Bolg(因果律)、另一是Gate of Skye(無此機制)，選了後者仍被判定必殺。改成只看 `npProfile_(c).fx`(這次實際選定的寶具)。連帶修正 `offenseTier_` 的 `pierceFx` 清單同款問題(gae_bolg從清單移除，改完全交給既有的npProfile_判定)。
- `applyMasterStanceShare_`(御主參戰分擔) 在從者剛被打死的同一擊仍會觸發，對已標記 `DEAD_` 的列回補HP、白扣御主HP——3個呼叫點都補 `!knocked` 判斷，函式本身也加一道防禦性補查。
- 斬首戰術分支從沒套用 `BATTLE_DEFER_WRITE_` 批次寫回，雙從者斬首失敗最壞觸發5+次個別Sheets寫入——改成跟主戰鬥路徑同一套，分支結尾一次整表寫回。
- `actionFateBattle` 的 `spendAp_` 呼叫沒傳 `skipWrite`，跟斬首分支(現已批次)或主路徑的收尾整表寫回都會把AP值重複送一次——補 `skipWrite=true`。
- **`rankVal('-')` 誤算成比E還低**（玩家實測抓到，2026-07 後續補上）：佐佐木小次郎的寶具六圍官方未給階級，種子資料誠實標成 `'-'`(注解稱「rankVal()仍保底吃E運算」)。但 `rankVal()` 舊版邏輯是「先去掉+/-算基礎字母、再另外用+/-次數算加減修正」——裸 `'-'` 去掉+/-後找不到字母、退回E的10沒錯，但同一個 `'-'` 字元又被當「減號修飾」再扣一次3，變成7、比真正的E(10)還低，跟注解講的不符。傷害/魔力費用兩處門檻表剛好7跟10落同一格所以沒事，但 `Router_Battle.gs` 兩處(774/1033行)判斷「敵人有沒有寶具能放」的 `rankVal(...)>=10` 直接被跌破——佐佐木被玩家操控時放寶具正常，但他若當敵方NPC出場，會被引擎誤判成沒有寶具、永遠不會對玩家解放真名，違背「每個從者都配得到寶具」的設計初衷。改成 `rankVal()` 內：去掉+/-後若完全沒有字母(沒東西可修飾)，直接回傳E基準、不套加減。另外 `Engine_Fate.gs` 戰報「寶具骰(-)=26」這個顯示也一併順手修：沒字母時顯示改印`E`，不再吐出看起來像顯示壞掉的裸符號。

**移動/世界模擬**：
- `worldTick_`「令咒耗盡·靈基透支」死線計時器沒排除已結盟(`isAllied_`)敵從者——玩家跟某敵從者締盟後，牠先前戰鬥留下的死線不會被撤盟清除，時間到會在玩家不知情下把剛結盟的盟友判死，敘事還謊稱死因是「令咒燃盡」。補上跟「暗處互鬥」段落同款的 `isAllied_` 守衛。
- `worldTick_` 自己即時寫回LOC/HP/MEMORY/MP，`actionMove` 收尾又整表寫一次同樣的值——幾乎每次移動都會踩到(敵35%機率移位、敵御主每日回魔)。新增 `deferWrite` 參數(actionMove傳true)，讓 `worldTick_`／`refillMastersDaily_`／`markMasterLostServant_`(共用同一個 `BATTLE_DEFER_WRITE_` 全域旗標)在這個呼叫路徑下只改記憶體，交給 `actionMove` 收尾一次寫完。
- **`actionRest` 補齊同款整併**（原暫緩項，2026-07 後續補上）：`restHours_` 新增 `skipWrite` 參數(比照 `spendAp_`)；`actionRest` 在時回結果算完後不再立刻整表寫回，改開 `BATTLE_DEFER_WRITE_` 讓 `restHours_`(傳 `skipWrite=true`)／`worldTick_`(傳 `deferWrite=true`)／`breakStaleAlliances_`(新補 `!BATTLE_DEFER_WRITE_` guard，同 `worldTick_`／`markMasterLostServant_` 共用同一顆全域旗標) 三者都只改記憶體，跑完才還原旗標＋一次整表寫回——單次休息從最壞3~5次個別Sheets寫入，收斂成1次。**`enemyAmbushOnServant_`／`raiseBond_`(從者之夢)刻意不動**：這兩者發生在收尾寫回之後、且被結盟/補魔/靈基修復共4個其他呼叫端共用，牽動面較廣，維持原本各自立即寫入的行為不變。
- `resolveFactionEncounter_` 敘事隨機抽中的兩組敵御主(同地≥3組時)沒被記進撞見窗口，`actionIncite` 只是照陣列順序抓「前兩個」敵從者，可能挑撥到跟敘事完全無關的第三組。`setEncounterWindow_`/`getEncounterWindow_` 擴充存下這場敘事實際牽涉的兩個真名，`actionIncite` 優先用真名精確比對，缺真名(舊窗口)才退回陣列順序。
- `actionScavenge` 的搜刮枯竭標記只能存單一最近地點(`makeTextTag_`)，玩家在A、B兩地間來回搜刮可無限白嫖——改成存「所有已枯竭地點」清單、用 `indexOf` 判斷是否曾搜過。
- **`getNearbyLocations`(Core_Settings.gs) 漏過濾戰爭限定地點**（玩家實測抓到，2026-07後續補上）：地圖本體 `buildMapNodesPayload_`(Router_Movement.gs) 有比對玩家本局【戰爭】標記、濾掉不屬於本局戰爭的限定地點(如第四次限定的海特飯店)，但「撤退突圍」清單／偵查範圍都是另外呼叫 `getNearbyLocations` 算的，這個函式原本完全沒管戰爭標記——兩處各自兜規則，導致地圖上根本看不到、理應隱藏的第四次限定地點卻從撤退選單冒出來。改成 `getNearbyLocations` 新增 `myWar` 參數、比照同一套「`nodeWar` 有值且與 `myWar` 不同則跳過」規則過濾，3個呼叫端(`Router_Action.gs` 的 `buildClientState_`／`Router_Movement.gs` 的 `actionMove`／`actionScout`)都補上傳 `getWarName_(...)`。
- `actionPrepMeal` 是本檔唯一沒交棒 `STATE_PRE_DATA_` 的耗AP動作，補齊。

**種子資料**：
- `masterToNpcRow_`(Seed_Rivals.gs) 對高迴路種子御主(circuits>50)：HP走有上限的公式、MP卻用未夾範圍的原始值算，兩邊不自洽(伊莉雅絲菲爾-5th circuits:80、肯尼斯-4th circuits:65 尤其嚴重)。比照玩家建角流程的既有修法，同一個夾好範圍的值餵兩處＋寫進MEMORY。
- `heroToNpcRow_` 缺少 ai_gen 原創從者的 god_hand 命數後備(玩家自創時無lives標記→3命)，混亂模式把這類從者當敵人抽到會誤套赫拉克勒斯專屬11命——補齊同一條後備規則。
- 佐佐木小次郎這類「真正無御主」的孤身從者，`heroToNpcRow_` 仍無條件給CONTRIB=3(令咒逃脫額度)，令咒緊急脫離的同地點fallback邏輯會把牠誤配到剛好同駐一地的無關敵御主、強制一起傳送——真正無御主時歸零CONTRIB。

**AI敘事一致性**：
- `buildDreamPrompt_`/`buildVictoryDreamPrompt_`(Router_Narrative.gs) 要求AI用「第二人稱」寫夢境，直接違反同一套miniSystem規則1(旁白第一人稱「我」禁用「你」)——改成一致的第一人稱，連帶修正硬寫的「你身側」。
- 14日時限中央攔截(Router_Action.gs)組時限夢時傳空字串當願望，是唯一沒呼叫 `extractWish_` 的敗北分支——單純被時限拖垮的玩家夢境讀起來像通用場景。補上。
- miniSystem規則3強制「整段至少3個`<br><br>`」，跟多處60~130字的短篇幅指令矛盾(短字數本就湊不出8+句)——改成分段數量依指定字數自然而定，不強求硬性下限。
- **萌點反差沒有頻率節制，連續幾場戲反覆用同一個具體動作**（玩家實測抓到，2026-07後續補上）：`masterCard_`/`servantCard_`(Router_Persona.gs) 的萌點提示只講「不能直接講出來(show don't tell)」，沒講「不用每回合都硬塞」——這兩張卡幾乎每次AI敘述都會帶上，AI手上唯一的反差素材只有這一句，連續戰鬥回合就會反覆用同一個具體動作點出反差(如每場戰鬥都摸一次口袋布偶)，讀起來像機械公式，show don't tell反而變成另一種tell。兩處都補上「不必每回合硬塞，情境對了才自然浮現一次，避免每次都用同一個具體動作重複」。
  - **後續加碼**（玩家再度實測抓到，同批次）：純講頻率還不夠——**牽涉隨身實物的萌點天生比反應型萌點更容易被濫用**(摸一下口袋物品零成本、不需情境鋪陳；相對地「被戳到痛處才崩潰」這種反應型萌點得先有觸發情境才演得出來，天生較節制)。兩處都額外點名：若萌點牽涉隨身物品，別每次都靠「摸/看一眼該物品」這招交差，多用神情/語氣/其他行為表現反差。
- **戰鬥收尾台詞跳針成同一種「要撤退還是繼續」問句**（玩家實測抓到，2026-07後續補上）：兩處指令疊加造成——① `masterCard_` 只給「停在問句/思索」一種收尾範例；② `Router_Battle.gs` 戰報收尾指令給的角色反應範例字面就是「值得乘勝追擊還是該見好就收」。同一場戰鬥拖好幾回合，兩者疊加下模型每回合都套近乎同一句問法收尾，讀起來像跳針。兩處都補救：①收尾不限問句，沉默對峙/蓄勢待發的動作/一個眼神一樣能停在決策點前，連續回合別重複同一種收尾形式；②角色戰後反應的範例角度放寬(破綻/寶具底牌/自己傷勢與魔力/對敵手的情緒評價)，不再只框在追擊或撤退，並點名連續回合換個角度講。
- **戰局實況錨點在雙方都還接近滿血時就敢講「明顯佔上風」**（玩家實測抓到，2026-07後續補上）：`enemyMasterCardStr` 的「★【戰局實況】」錨點只看「這回合誰吃傷多1.3倍」的比例，沒管兩邊血條加起來根本沒少多少——實測案例雙方450血都還在9成以上、只交換了31/42傷害，卻已經被判定「己方從者正壓著對方打、明顯佔上風」，AI順著這句錨點就把單純的開場試探寫成「敗象已現/不對稱壓制」的決定性戰局，跟血條實況完全對不上。補一道「本回合交換總傷害需達血池上限20%」的門檻，沒到門檻一律先講「雙方仍在試探交手，尚未分出明顯優劣」，不夠格就不准講誰佔上風/被壓著打。
- **撤退追擊文案「沒能全身而退」誤導成撤退失敗**（玩家實測抓到，2026-07後續補上）：撤退必定成功抵達目的地(只是可能挨追兵一記)，舊文案讀起來卻容易誤解成撤退本身失敗、沒能脫身。改用玩家提供的版本：「你下令撤退，『X』強襲重創從者，從者忍痛掩護，帶你驚險脫離戰場。」／「你下令撤退，『X』追擊被從者回身逼退，主從二人毫髮無傷地撤離。」不再有歧義。
- **提示詞瘦身第一輪：砍掉2處確認百分之百重複的「不可替御主拍板下一步」指令**（玩家反饋提示詞太多、AI敘述不夠聚焦，2026-07後續補上）：`masterCard_`(Router_Persona.gs) 在戰鬥/移動的 aiPrompt 組裝時都固定排在最前面(`ourMasterCardStr`/`data.masterCard`)，本身已經講過「【不可】替御主拍板下一步戰略抉擇...停在問句/思索/動作即可」——但 `Router_Battle.gs` 戰報收尾指令跟 `Script.html` 的 `travelTo` 抵達敘事各自又逐字重複一次同一條規則，零新資訊、純粹佔字數稀釋注意力。兩處都砍掉重複片段，只留各自真正新增的部分(戰報收尾只留角色反應範例＋換角度提醒；抵達敘事只留「不可逼問玩家、留白讓玩家按鍵回應」這句原本沒講過的提醒)。
  - **範圍說明**：這輪只砍了「逐字比對、確認零新資訊」的高信心重複——`servantCard_` 每次呼叫都各自帶一份「show don't tell」收尾(依真名各自客製化，覆蓋的是萌點/技能/寶具名而非泛用規則)，一場戰鬥可能因多名從者同時登場(我方/敵方/盟友/敵盟協防)而重複到3~4次，但因為每次覆蓋的細節不完全相同(換了角色名/覆蓋範圍)，貿然砍會有削弱「不可直述」防線的風險，這次先不動——留給下一輪更仔細比對後再處理。
- **提示詞瘦身第二輪：`fate-solo-deep-audit`類workflow大規模覆核，32個候選全數判定不安全砍除**（玩家要求ultracode全面稽核，2026-07後續補上）：8個agent分別稽核Router_Bond/Creation/Narrative/Movement/Persona/Battle六檔的AI敘事提示詞，抓出32個「看起來重複」的候選，每個候選再各自派兩個獨立agent逐字追蹤字串組裝脈絡覆核——**結果32項全數判定不安全**，每一句雖然表面相似，實際各自防著別處沒防到的具體失手模式(例：servantCard_收尾的「正典角色優先用你自己認知演出」與「依羈絆高低調親疏」看似都是「show don't tell」的延伸，實際是完全不同的兩件事)。**這證實這批提示詞的冗長多半是真實踩過坑後補上的護欄(幾乎每條都有對應的「🐛→✅玩家實測抓到」紀錄)，不是隨手疊字——貿然大砍會讓已修好的舊bug復發**。
  - 這輪只確認並套用兩處**純措辭壓縮、內容零流失**的小改(換裝/武裝兩句guard，`servantCard_`)：拿掉解釋性贅字，保留的guard本體(換衣不換人／不套用職階慣例)完全不變。
  - servantCard_收尾那句「依真名與性格演出(show don't tell)＋正典認知優先＋羈絆親疏節奏」三合一的長句，經覆核證實三段各自不可或缺，**這輪刻意不動**——玩家原本想進一步壓縮這句，但覆核證據顯示風險偏高，故保守處理，等有更明確的個別測試結果再考慮。
- **提示詞瘦身第三輪：`performanceNote_`拆函式，把「跑時重複」跟「內容重複」分開處理**（玩家提出「可以把一定不變的組成寫成一個、用IF去做分流嗎」，2026-07後續補上）：前兩輪都在找「文字」層級的重複，這輪換個角度——`servantCard_`收尾那句其實**內容不變**(不管哪個角色，show don't tell／正典認知覆蓋／羈絆親疏都適用)，真正的浪費是**同一場戲呼叫`servantCard_`好幾次(我方/敵方/盟友/敵盟協防/追兵最多同框4張)，每次都各自帶一份逐字相同的收尾句**——這是「跑時重複」不是「代碼重複」(`servantCard_`本來就只有一份定義)，前兩輪的「找逐字重複文字」思路抓不到這種案例。改法：把這句收尾抽成`performanceNote_(names)`(Router_Persona.gs)，`servantCard_`新增`opts.skipClose`，傳true時省略內建收尾、呼叫端自行在組完「這場戲實際同框的所有真名」後呼叫一次`performanceNote_([...])`收尾；不傳opts(絕大多數只有單一角色卡的呼叫端)行為完全不變，向下相容零風險。逐一改完全部「同一prompt內≥2次`servantCard_`」的呼叫點：`Router_Battle.gs`(主戰鬥defeat/勝負兩分支、暗殺雙從者分支)、`Router_Movement.gs`(挑撥離間`actionIncite`、趁隙偷襲`playerAmbushOnEnemy_`、抵達場景`actionMove`——己方從者＋N名敵從者＋撤離追兵最複雜的3張以上同框案例，新增`perfNote`欄位隨JSON回傳，`Script.html`的`travelTo`在組`arrivePrompt`時插入一次，kanshou/solo兩分支都補，因為`data.servantCard`的skipClose是後端統一算好、兩分支共用同一顆)；逐一核對`enemyAmbushOnServant_`(休息/羈絆/結盟/補魔4個突襲呼叫端共用同一支`foeCard`)＋`Router_Bond.gs`／`Router_Economy.gs`全部呼叫點，確認皆為單一角色卡、不受影響、無需改動。淨效果：多從者同框場景砍掉2~3份逐字重複的收尾句，同時保留內容完整——跟前兩輪「怕砍錯內容」的保守結論並不衝突，因為這輪根本沒刪任何一句指南文字，只是改變它被組裝進最終字串的**次數**。
- **提示詞瘦身第四輪：`enemyMasterCard_`併入同一套`performanceNote_`機制**（第三輪上線後玩家追問「還能再合併嗎」，2026-07後續補上）：第三輪只處理了`servantCard_`本身跑時重複，但`enemyMasterCard_`(敵御主演出卡)自己內建的收尾句——「正典認知優先」＋「show don't tell」——跟`performanceNote_`內容概念重疊，而且有3處(`Router_Battle.gs`主戰鬥/暗殺分支、`Router_Movement.gs`抵達場景)是`enemyMasterCard_`跟已`skipClose`的`servantCard_`同框在同一個prompt裡，等於同一份指南被兩支不同函式各自講一次。改法：`enemyMasterCard_`新增同款`opts.skipClose`，傳true時省略「正典認知優先」整句＋「show don't tell」那段插入語，敵御主真名併入同一次`performanceNote_([...])`；**「非沉默背景板，但戰局勝負與傷害不可改」這句刻意不動、不受skipClose影響、恆常保留**——這句是敵御主專屬的行為準則(此役他人在場、不是背景板，但無法左右已裁定的勝負)，不是"show don't tell/正典認知"這種放諸各角色皆準的共用不變句，若一併砍掉會在3處都變成無依據判斷「這場戲該不該讓敵御主是啞巴」，故保留。不傳opts(`Router_Bond.gs`兩處三元表達式`allyCard`/`card`、`Router_Economy.gs`皆無同框)行為完全不變。
- **提示詞瘦身第五輪：純措辭壓縮，不刪任何一條指令**（玩家再度澄清「我的意思是再精簡一下用詞、語句，感覺你有些寫太多了，感覺是在解釋給人類看」——區別於第二輪「刪內容」跟第三/四輪「刪重複次數」，這輪是**同一條指令、同一份資訊量，換更精簡的措辭**，2026-07後續補上）：逐一檢視`performanceNote_`／`servantCard_`／`masterCard_`／`enemyMasterCard_`(Router_Persona.gs)、戰局實況錨點／御主參戰參與感／終結收尾／戰後反應收尾(Router_Battle.gs)、`travelTo`抵達提示詞(Script.html)裡明顯偏「解釋給人看」語氣的句子——常見模式是「因為...所以...」的推理橋接、「尤其...」的舉例鋪陳、「這句/這是」的自我指涉——把每句拆解成「還剩下哪些不同的具體指令點」，逐點保留、只換更短的詞面(如「不必每回合硬塞，情境對了才自然浮現一次，避免每次都用同一個具體動作重複——若牽涉隨身物品，別每次都靠「摸/看一眼該物品」交差」→「不必每回合硬塞，情境對了才浮現一次，避免重複同一動作；牽涉隨身物品時別只靠「摸/看一眼」交差」，資訊量不變、字數少三成)。**判準**：若某個子句拿掉後，AI會少知道一件事(某條件、某個「不可以」、某個例外)→保留、只換詞；若某個子句只是在解釋「為什麼要這樣做」給維護者看、AI不需要理由只需要結論→整句砍。全程沒有刪除任何一條實際指令，`bash check.sh`／`nsfwBaseRules`紅線照樣過。

**前端UI**：
- 鑑賞同伴卡片列表用寫死的「3」補畫空位佔位框，暗示「此地最多3位同伴」，但§91駐留制改版後已無此容量限制——整段移除，不留一個不存在的假規則。
- **戰報死亡橫幅誤植名字**（玩家實測抓到，2026-07 後續補上）：`Script.html` 渲染「💀 靈基崩潰・消滅」那行寫死用 `r.def`（這場一開始鎖定的敵人名字），沒管 backend `destroyedName` 實際算出來的是誰——我方從者被打死（`defeat:true`）時，血條明明掉到0，戰報卻大字印著敵人的名字「靈基崩潰・消滅」，跟緊接著的敗北夢境自相矛盾。`r.destroyed` 欄位其實已經是真正死者的名字（不只是truthy旗標），改用它＋依 `r.victory`/`r.defeat` 分流收尾文字（勝＝🏆聖杯已近／敗＝御主敗北……）。
- **地圖分頁「🔍偵查」跟底部常駐戰場行動列重複**（玩家實測抓到，2026-07後續補上）：`renderMapPane` 地圖頁頭的偵查鈕跟 `renderWarActions` 底部永遠可見那排的偵查鈕，兩邊都呼叫同一個 `scout()`，地圖分頁打開時同時存在、純屬重複——移除地圖頁頭那顆，只留底部常駐入口。
- **AP低量無提示，玩家常打到見底才發現**（玩家反饋，2026-07後續補上）：不用彈窗(每動作都跳太煩)也不讓AI提醒(機制訊息塞進AI提示詞容易被誤演成劇情、或反被劇情蓋過——跟戰局實況錨點是同一個教訓)，改在常駐時鐘HUD做純UI視覺提示：`updateClock`(Script.html) 的AP≤4時，「行動X/Y」文字＋雷電圖示變警示橙色(`#e0704a`)＋前綴⚠️，玩家瞄一眼頂部常駐區塊就會注意到，不經過AI、不打斷操作節奏。
- **`projection`(投影魔術)施放技術說明彈窗漏改、仍寫死Emiya台詞**（玩家實測抓到，2026-07後續補上）：先前已把 `str_up`/`burst` 兩則跟角色實際技能名重複的通用代稱改成純機制敘述，唯獨 `projection` 沒同步改，仍顯示「詠唱『Trace on』連續投影名劍齊射」——任何自創從者底層機制選了 `projection`(如工房捏的「四次元口袋」)都會顯示這句Emiya專屬台詞，跟角色完全對不上。比照另兩則改成純機制敘述，不綁死特定角色的招式台詞。
  - **順帶釐清**（同批次問答，非code變動）：工房捏角本來就有「寶具威能一句(選填)」欄位(`cf-np-desc`，Script_Onboarding.html)讓玩家自己寫寶具效果一句話，AI 敘事會照這句去演——寫得越具體，AI 越敢照著發揮；寫得籠統(如單純「拿出未來道具戰鬥」)，AI 就只能跟著籠統。目前這欄位只在初次捏角時能填、事後沒有像「⚔️武裝」那樣可以隨時重新編輯——如果玩家想事後把寶具說明寫得更具體生動，目前得整隻重新召喚才行。
  - **事後複查**（同批次，範圍限定戰鬥引擎/戰報顯示）：地毯式檢查 `renderFateBattleReport` 與偷襲/斬首/對轟等其餘戰報卡渲染，確認這是唯一一處「用固定label代替動態結果名字」的案例——其餘卡片(偷襲`svName`/`enemyName`、斬首`h.name`、對轟`我/敵`固定方向)都綁對了各自情境專屬欄位，沒有同類誤植。
  - **確認 `godNote`/`sealNote`(十二試煉復活/令咒脫離的完整帶真名敘述句) 現況**：已經有餵進 AI 敘事提示詞(`Router_Battle.gs` 組 `aiPrompt` 那段)，AI 本來就看得到真名；玩家端也已經有秀出來——就在每回合細節`rl.strikes[].note`裡(`Script.html` 展開的「▸ 回合細節」收合區塊)，只是不在最上面那行摘要。目前這樣就符合需求，未來若想把這句也搬到摘要行(不只收合區)，屬於增強而非修bug，另案處理。

**效能round-trip**：
- `actionBond` 在 `raiseBond_` 已原地改過 `pcData` 後，又多打一次即時Sheets讀取拿「最新羈絆值」——直接讀記憶體。

## 18. GAS掌事實／AI只說書：找出還在給AI自由判斷的候選（2026-07·玩家提出四目標後續稽核）

玩家提出「GAS處理快速＋介面簡單明瞭＋GAS嚴謹計算＋AI敘述不出戲」四目標，問solo還有沒有強化空間。逐項盤點後判斷：快速/介面兩塊已成熟或該交給實測而非代碼審查；AI不出戲這塊指出「別再摳字數，該延續本專案自己的設計鐵律『GAS掌數值、AI只說書』——找還有哪些現在丟給AI自己判斷、其實GAS早算好答案卻沒講的地方」。4個agent分組稽核Router_Battle/Movement/Bond/Economy+Persona+Narrative，找到10個候選(Router_Economy/Persona/Narrative這組正確回報「這幾檔本來就做對了、沒找到」，反過來確認了`actionManaSupply`的信任門檻/`servantCard_`等既有寫法是這個模式的正確範例)：

**Router_Battle.gs（戰鬥核心，2個，皆高信心）**：
- **敵方反擊解放寶具的真名從沒告訴AI**：`rl.eNp`只寫入(1092/1100行)從沒被讀取，`extraFired`等收集器只認「戰鬥續行/斬斷救贖」這兩種標籤、篩掉了「·寶具解放·真名」——導致敵反擊即使是寶具級的一擊也可能被AI演成普通反擊，跟同一份提示詞裡「這是Fate寶具解放的靈魂」這條規則自相矛盾。補`rl.eNpName`(比照玩家自己`npName`的拆法用`npProfile_(enemyNow)`算)，新增`enemyNpRoundNotes`收集器併入aiPrompt。
- **雙方寶具對轟(clash)開場的真名，兩邊都沒講**：`npName`(我方)只在非clash分支才被引用；`clash.enemyNp`存的是MARTIAL欄原始字串(可能含未選中的其他寶具、沒拆真名)。全場最戲劇性的NP-vs-NP交鋒，AI反而拿不到任何一方的真名依據。補`clash.enemyNpName`(用已選定的`enemyC0.npChoice`算)，clash分支的aiPrompt改為明講「我方真名【X】vs敵方真名【Y】——雙方均需在此刻高呼真名」。

**Router_Bond.gs（4個，皆高/中高信心）**：
- `actionBond`「相處」frame舊版寫「由你自行定調羈絆的深淺」——GAS明明有`bondNow`這個確切數字(且同檔`actionAllyBond`早就示範過怎麼分tier)，卻沒換算成濃淡定調餵給AI。補4級`bondTier`。
- 羈絆里程碑(30/60/90)只拿來內部判斷寫回標記，三道門檻量級差很大(30是初次鬆動、90近乎告白)，AI卻只拿到「依羈絆深淺」自己猜。補`milestoneScale`依`milestone`值分流具體量級描述。
- `actionProposeAlliance`：`allianceWillingness_`內部呼叫`masterPersonaLean_`算出這名敵御主的性格傾向、算完就丟掉——同檔案`actionCourtEnemy`早就示範過怎麼把這傾向轉成具體反應描述(628行)，這裡卻仍讓AI自己從泛用選項裡瞎挑。補`lean`變數，成功/失敗兩分支都依`lean.pragmatic`/`lean.loner`分流反應描述。
- `actionBond`遭突襲反應舊版寫「重情者強撐護主、疏離者未必」的二選一，沒講此刻`bondNow`實際落在哪邊——比照`actionAllyBond`的tier分級，直接定調。

**Router_Movement.gs（4個）**：
- 撤退追擊/歇息夜襲/趁隙偷襲三處(`actionMove`撤退分支、`actionRest`、`playerAmbushOnEnemy_`)全部無條件寫死「重創」，不管`dmg`實際佔對方HP上限的比例——GAS明明算得出`svHpMax`/`eHpMax`卻沒換算成傷勢用詞，文字可能跟血條矛盾(如只扣1點血也講「重創」)。三處統一補「重創(≥40%)／負傷(≥15%)／擦傷(其餘)」三級判斷。
- 撤離背擊寶具的反手交鋒舊版無條件寫「堪堪擋開」(千鈞一髮)，但`prT.dEva - prT.aHit`margin早就算出躲得有多輕鬆——高信心度躲開時改講「從容擋下」。
- `detectAllyPeril_`的盟友告急報信無條件寫「情勢緊繃」，沒讀盟友實際HP比例——補`hpRatio`回傳值，依血量分三級(尚占上風/戰況膠著/命懸一線)。
- `enemyAmbushOnServant_`的陣地反擊repelNote無條件寫「優雅擊退」，沒把`homeRank`(D~EX規模事實)換算成強度描述——同一句話套在陽春土壘跟EX級空中庭園結界上讀起來一樣，補`homeRankScale`依`rankVal(homeRank)`分3級。

全部10項皆為「GAS已經算出/能輕易算出這個事實，卻沒有餵給AI」的漏餵類型，不涉及刪減任何既有指令，`bash check.sh`全過、`nsfwBaseRules`紅線未觸及。

## 19. 五路稽核外傳（2026-07·玩家「檢查solo看看有沒有問題」，5個agent平行分區稽核）

戰鬥引擎/移動世界模擬同盟/創角召喚種子禮裝/羈絆人設敘事/路由分派帳號設定，5個維度平行找問題，每個候選都先比對本檔既有紀錄（本檔已記錄的既有修復一律不重複回報，只找survived所有先前稽核的新發現）。

- **Avalon-Saber 理想鄉對正典本尊從沒真正生效過**：見上方§6「Avalon-Saber 理想鄉」條目——前次子字串誤判修正比對到錯的短名，已修正。
- **`worldTick_` 敵移位隨行「第一輪」比對是未修孿生**：`Router_Movement.gs findClashSv_`已修過的前綴撞名bug，`Time_World.gs`同函式緊接在後的「第二輪」fallback也早改對，唯獨第一輪還是子字串`indexOf`——見上方§7「worldTick_」條目，已修正。
- **`Router_Battle.gs` 對轟回震(`pHit`)沒回填 `destroyedName`/`godRevived`**：`actionFateBattle`對轟區塊，`eHit`(打敵方)有完整回填 destroyedName/knocked/sealEscaped/godRevived 四項，緊接著的 `pHit`(回震打我方)只做了 knocked，跟五路稽核已修過的敵反擊/敵盟協防「死了卻沒告訴AI」是同一種 desync 在對轟路徑的未修孿生——雙從者出戰且對方持因果律寶具(如庫丘林/斯卡哈)時，回震可跳過保1真正打死我方出戰從者，`destroyedName`卻沒設，終局指令收不到這個事實。已補齊 `destroyedName`/`godRevived` 回填，跟 `eHit` 對稱。
- **`actionAllyBond` 是唯一沒補 `npcId` 精準配的盟友/羈絆 handler**：`actionProposeAlliance`/`actionCourtEnemy` 早就示範過「先 npcId 精準配、找不到才 nameLoose_ fallback」(因 `sanitizeUserData_` 的 `cleanChineseName` 會剝掉全形括號，含「哈桑·薩巴赫（咒腕）」這類正典真名純比對必漏)，唯獨 `actionAllyBond` 還在單靠 `nameLoose_`——跟這類正典盟友「與盟友共處」會一律回「此地沒有可交流的盟友」。已補 npcId 精準配，前端 `allyBond()`/按鈕 onclick 同步補傳 `a.id`。
- **`buildTagsPayload_` 錯誤路徑回傳型別跟成功路徑不一致**：查無御主時 `return JSON.stringify({success:false})`(字串)，成功路徑卻回物件——`actionGetTags` 呼叫端會再包一層 `JSON.stringify` 導致字串被雙重編碼；另兩處直接把回傳值當物件用(`tp.success`／內嵌 `tags:` 欄位)，字串會讓 `.success` 讀到 undefined、或讓 `tags` 欄位變成一段跳脫過的 JSON 字串而非巢狀物件。改回傳物件，跟成功路徑型別一致。
- 其餘4個維度(創角召喚種子禮裝／羈絆人設敘事／路由分派帳號設定)逐一驗證文件既有不變量全數成立，僅各揪出1~2處極低優先的措辭/round-trip小疵(已順手一併修正：狂化偵測文件描述用字對齊正則「僅咆哮」而非裸「咆哮」；`actionBond`的`getClock_`補傳`pcData`省一次整表重讀)，無新增具體功能性缺陷。

`bash check.sh` 全過、`nsfwBaseRules` 紅線未觸及。

## 20. id 化重構（2026-07·玩家「多人單機遊玩 你決定好就整體重構」，跨 solo＋鑑賞兩軌）

**背景**：§19 稽核抓出的一串 bug（Avalon-Saber/worldTick_/actionAllyBond 等）並非各自獨立事故，是同一個結構性根因的多次重複發作——每一列資料本來就有唯一 `ID`(`COL.PC.ID`)，但十幾個呼叫點各自手刻名字比對（子字串`.includes`/裸`indexOf`），互不知道彼此，也各自漏掉不同的邊界情況。玩家問「沒辦法給他們一個id」後拍板整體重構，此輪把**系統內部身分解析**（前端按鈕→後端目標、MEMORY 硬連結、盟約帳本——這些場合 id 本來就已經在渲染資料裡）統一收斂到一支共用 resolver；**AI 敘事文字比對**（`rel_changes[].target`／`npc_exit[]` 等，AI 只會吐名字、永遠沒有 id）維持原樣不動，兩者性質不同不可混為一談。

- **`findPcRowIdx_(pcData, gid, opts)`**（Core_Settings.gs 新增，單一真實來源）：`opts = {id, name, faction, loc, excludeIdx, aliveOnly=true, nameCandidates, normalize}`。`opts.id` 有給先在 `gid` 範圍內找 id 命中列；查無/未給才退回名字比對（`nameCandidates` 產生候選陣列＋`normalize`）。**id 路徑與名字路徑套用同一份 `passesFilters(r,i)`**（game_id/存活(`ID`未被標`DEAD_`)/faction/loc/excludeIdx）——自我複查時抓到第一版 id 路徑只查了 `id`+`game_id` 就直接回傳、完全跳過在場/存活/陣營檢查，若用了過期快取的 id 會讓玩家對「已經離開/已經死亡/陣營不對」的對象牽手/相約/邀同居，已在 commit 前修正、兩路徑統一收斂到共用 predicate。
- **`findPlayerServantIdx_`**（Router_Persona.gs，13+ 處呼叫）改委派 `findPcRowIdx_`（`normalize:nameLoose_`），新增第 4 參數 `wantId`。原本是 `.includes(want)` 子字串比對——真名字首碰巧是另一從者子字串時會誤配，已修正為精準比對＋id 優先。Router_Economy.gs(7處)/Router_Bond.gs(2處)/Router_Movement.gs(4處)/Router_Battle.gs(1處) 全部呼叫點同步補傳 `userData.servantId`；前端 `Script.html` 新增 `myActiveServantId` 全域(隨 `setActiveServant`/定期 sync 刷新)，7 處 `servant: myActiveServant` payload 同步多帶 `servantId: myActiveServantId`。
- **`actionBreakAlliance`（Router_Bond.gs）新增 `npcId` 精準配**：這是本輪重構中**新發現**（非 §19 已知）的獨立 bug——舊版純靠 `nameLoose_` 子字串批次撕毀，跟 §19 記錄過的「`actionProposeAlliance`/`actionCourtEnemy` 早有 npcId 精準配、唯獨這支沒有」是同一種遺漏模式。已補 `userData.npcId` 有給先精準命中，比對用名字改抓該列真實欄位值（不再信任玩家傳入字串），查無 id 才退回原批次子字串撕毀；前端 `breakAlliance(npcName)`→`breakAlliance(npcName, npcId)`，onclick 補傳 `a.id`。
- **`servants.push`（Router_Action.gs `buildTagsPayload_`）／`current.push`（Gallery.gs `actionKanshouCompanions`）兩份前端從者/同伴清單資料，本來就都沒有 `id` 欄位**——這是本輪重構中發現的真正根本缺口：不是「後端邏輯沒查 id」，而是「前端資料結構從頭到尾沒帶 id 出來過」。兩處都補上 `id: s[COL.PC.ID]`／`id: String(data[i][COL.PC.ID])`，才有辦法讓前端卡片 onclick 把 id 一路帶回後端。
- **鑑賞側 `actionPlay_`（Gallery.gs）`promiseMeet`/`cohabitInvite`/`handHold` 三處**改用 `findPcRowIdx_(pcData, _myGid_, {id, name, faction:"從者", loc:curL, excludeIdx:pcIndex, nameCandidates:kanshouNameCandidates_})`；前端 `kanshouPromiseMeet`/`kanshouHoldHand`/`kanshouInviteCohabit` 三支函式新增 `npcId` 第二參數，卡片渲染 onclick 同步多帶 `s.id`。**`kanshouAcceptInvite`/`inviteResident` 刻意不動**：目標是尚未召喚的「巧遇陌生人」，結構上沒有 pcData 列可帶 id。
- **驗證過的既有正確用法（未改動，避免重工）**：solo 敵方側 `actionProposeAlliance`/`actionCourtEnemy`/`actionRuleBreakSteal` 早就是 npcId 優先＋`nameLoose_` fallback，是這次重構參照的既有範本而非待修對象。
- **刻意排出本輪範圍外**（風險/時間考量，非遺漏）：`outfit`/`weapon`/`set_servant_output`/`summon_horror_beast` 這幾支跨軌共用 handler，`name` 來源分散在多種卡片渲染器、尚未逐一盤點清楚各自的資料流向，留待後續有需要再處理。

`bash check.sh` 全過、`nsfwBaseRules` 紅線未觸及。

## 21. `CODEX_PERSONA_VER` 版本歷程存檔（v65~v69，2026-07 架構重構時搬出程式碼註解）

Seed_Codex.gs 頂部 `CODEX_PERSONA_VER` 的註解只留當前版號一行簡述；逐版校對細節搬到這裡存檔，不在程式碼裡累積歷史留言：

- **v65**：`SEED_MASTERS` 補齊 `align` 陣營欄（原本從沒填過）。每次精緻化種子 persona(萌點/口吻/日常欄) 就升一版，觸發 `upgradeCodexPersonas_` 整列覆寫既有英靈殿/御主殿（已召喚過的英靈才讀得到新內容）。
- **v66**：凜/櫻/大河鑑賞日常欄補喜歡/討厭具體細節，拿掉會被覆誦的身高數字；`SEED_MASTERS` 全數14人 persona 欄從3段補齊成註解要求的4段（原本喜歡欄位缺失，解析時被厭惡內容錯位頂替）。
- **v67**：萌點欄位不再侷限「反差萌」——凜的萌點從瞎編的「私下迷糊」改成 canon「電器白痴」；大河的喜歡改成 canon「蹭飯偷吃」(大食)，不再是抽象句子。
- **v68**：女性種子角色 dailyLook 補上身形/體態描寫（阿爾托莉雅嬌小玲瓏、美杜莎/斯卡哈豐滿、美狄亞纖細、凜勻稱、大河嬌小），幼女型角色（伊莉雅絲菲爾等）刻意不加。

## 22. 全面重構掃描（2026-07·玩家「整體整理整理~還有哪裡可以重構？」）

6組平行審查掃遍全部 .gs/.html 找可合併/精簡的重複，篩出零風險～低風險項目全部落地，分 A~F 六批次（見對應 commit）：

- **A**：`Router_Action.gs` 3處手刻找列邏輯改 `findPcRowIdx_`；`Core_Settings.gs` 4個MEMORY getter改用既有 `makeTextTag_` 工廠；新增 `clampCircuits_` 取代3處硬寫的迴路夾值(12~50)魔數。
- **B**：`Router_Battle.gs`/`Engine_Fate.gs` 新增 `injectMasterSupportFor_`（合併我方/敵方共6處注入御主支援）、`pushMatching_`（合併4處extraFired收集迴圈）、`buildPartyIdxs_`（合併斬首/主戰鬥2處複製貼上）、`ourMeleeFired`等4段掃描改資料驅動。
- **C**：`Router_Movement.gs`/`Router_Economy.gs`/`Router_Bond.gs` 新增 `dmgSeverityWord_`（傷害嚴重度分級，順便修 `actionBond` 突襲提示原本沒分級的不一致）、`ambushDispatchPrompt_`（合併5處突襲結果三分支）、`chargeApOrReject_`（合併11處AP門檻+扣AP+時鐘標籤樣板）。`actionMove`(cost=2、與`worldTick_`緊密耦合)刻意不動；Bond.gs的5處npcId+nameLoose_ fallback逐一核對，全部帶有`findPcRowIdx_`無法表達的額外條件(`hasArrived_`/`isAllied_`/批次操作)，維持原樣。
- **D**：`Gallery.gs`（鑑賞層，`nsfwBaseRules`全程未觸及）4個handler改用`findPcRowIdx_`（`actionKanshouDeleteCustomProp`因是「清全部同伴身上」而非單一目標查找，非等價重構，跳過）；新增`kanshouMissStr_`合併5處提議撲空敘事；3個「戰時→日常」AI wrapper合併共用開場白+呼叫殼；`formatPref`/`formatTrait`合併成`formatFourSlot_`(⚠已於2026-07刪除·見KANSHOU_REFERENCE)；刪除已確認零讀取點的死碼欄位`minBond`。
- **E**：`Script_Kanshou.html` 新增`ensureOverlay_`合併11處overlay建立樣板、`_showOverlayLoading_`合併2個讀條函式；修`kp-overlay` id被3種功能共用的隱性耦合(`kanshouPickLocation_`改用獨立的`kloc-overlay`)。
- **F**：`Account.gs`新增`findPcRowByCharId_`；`History_Sync.gs`新增`readRecentPlayerRows_`；`Seed_Codex.gs`/`Seed_Rivals.gs`重複fallback文案抽成`DEFAULT_TRAIT_FALLBACK_`/`DEFAULT_PREF_FALLBACK_`；`CODEX_PERSONA_VER`版本註解瘦身(歷史見上方§21)。

**額外發現並修正的真實不一致(非純風格重構)**：`Router_Battle.gs` 對轟(`CLASH_OFF_FX`)與敵反擊解放(`ECF`)兩份「攻擊型寶具判準」清單，註解都明講「與對轟同準」理應是同一套標準，卻各自維護、對轟那份漏了`summon_horror`——同一隻只有深淵召喚型寶具的敵人，在對轟場景不會被判定為攻擊型、但在敵反擊場景會，兩處判定不一致。已統一成單一常數`OFFENSIVE_NP_ATK_FX_`（採較完整的敵反擊版為準），兩處呼叫點都改用它。

**刻意判斷不應合併、維持現狀的兩份清單**（審查曾建議一併看，逐一核對用途後確認語意範圍本就不同，非重複）：`Engine_Fate.gs`的`offenseTier_`內`pierceFx`——只收錄`CONCEPT_TIER`表裡真正有分級的fx(概念貫穿計算專用，收錄`gob`/`chain`等未分級的fx毫無意義，因為`conceptTier_`對未列在表裡的fx一律回傳最低的1)；`OFFENSIVE_NP_FX_`(`bestNpChoice_`用，多寶具敵人選「最強攻擊寶具」時判斷某個NP選項算不算攻擊型)——語意範圍本就比對轟/反擊判準更寬鬆，兩者職責不同，未合併。

**其餘明確判斷風險偏高、本輪不碰的項目**（供之後評估）：`fateStrike_`與斬首反噬分支的死亡結算重複合併；`actionMove`裡4處重複掃描`allPcData`找同地點敵人的邏輯合併；`upgradeCodexPersonas_`/`upgradeMasterCodex_`合併(各自有刪孤兒種子列的side effect)；kanshou側8個handler仿`runSimpleAction_`做共用wrapper；`kanshouOpenProps`/`kanshouOpenHypnosis`更深度合併。

`bash check.sh` 全過、`nsfwBaseRules` 紅線未觸及。
- **v69**：玩家指出「豐滿」太籠統（AI不一定會讀成胸部大），美杜莎/斯卡哈x2的胸部描寫改成明確的「巨乳」，AI生成prompt的範例詞同步從「高挑豐滿」改「巨乳/貧乳」對照組。

（v70 起的當前版本簡述見 Seed_Codex.gs 檔內 `CODEX_PERSONA_VER` 那一行。）

## 23. 重構後再驗證輪（2026-07·玩家「再仔細確認一次！需要更新說明書！再看看哪裡有問題 還有沒有可以繼續整理的」）

對 §22 全面重構的成果派5組agent交叉覆核：驗證重構diff正確性、覆核KANSHOU_REFERENCE.md過時內容、solo新一輪bug稽核、kanshou新一輪bug稽核、找更多整理機會。找到並修正以下真實問題：

- **🔴 高嚴重度安全漏洞：5個kanshou handler完全跳過帳號歸屬驗證**——`actionBackfillKanshouAi`(Gallery.gs)、`actionGetFullStatus`/`actionUpdateFate`/`actionUpdateRelTag`/`actionSetNickname`(Router_Action.gs，solo+鑑賞共用handler)全部只用裸`pcData.find(r=>r[COL.PC.ID]==pcId)`信任傳入的pcId，鑑賞context下pcId(`KPC_`+建檔毫秒時間戳)可預測/枚舉，且帳號本身無密碼——猜中/取得任一鑑賞玩家的pcId即可冒名竄改其御主外貌/性格/萌點、任一同伴的個性/身世/萌點/關係稱呼/專屬稱呼，或讀出完整狀態。這比先前(§早期章節)記錄過的漏洞(僅涉及`actionPlay`/相簿)更嚴重，因為連`kanshouOwnedRowIdx_`這道既有防線都被繞過。已修：Router_Action.gs新增共用`resolveCallerGameId_(pcData, pcId, acctName)`——鑑賞(`KPC_`開頭)一律反查帳號表(`kanshouOwnedRowIdx_`)驗證歸屬失敗回`null`(呼叫端視同查無此人)；solo沿用原本裸find行為(零行為變化，帳號綁定在登入時已處理、不在本次範圍)。4支handler改用它；`actionBackfillKanshouAi`直接改用`kanshouOwnedRowIdx_`。**同步修前端**：`get_full_status`/`update_fate`/`update_rel_tag`/`kanshou_set_nickname`/`backfill_kanshou_ai`這5個action原本都沒有送`acctName`(其餘鑑賞action早就都有送)，後端新驗證需要它才能通過——已在`Script.html`(2處)/`Script_Kanshou.html`(3處)補上`acctName`欄位，否則後端修完前端沒跟進送值，會讓正常玩家也被擋下。
- **🐛→✅ EMIYA的`ubw`(無限劍製)跟斯卡哈`gae_bolg`同款孿生bug**：`offenseTier_`(Engine_Fate.gs)的`pierceFx`無條件清單原本仍含`ubw`——EMIYA的『無限劍製』既是他的永久固有技能(投影魔術本體)、又是他兩個可選寶具之一，選擇較弱的『偽·螺旋劍』(fx:projection)時，`ubw`仍會被這份無條件清單掃到，誤判成帶概念4貫穿的無限劍製強度，讓Caladbolg II能不該地打穿`territory`/`divine_core`/`nullify_magic`等概念2防禦。已比照當年gae_bolg的修法，從`pierceFx`移除`ubw`，交給後段`npProfile_(c).fx`(按本次實際選定寶具判定)處理。連帶修`Router_Battle.gs`的God Hand嚴重度計算：`var ghScale = npAtkScale_(atkC)`只認永久技能字面、不看`npChoice`，改成`npProfile_(atkC).scale`(比照Engine_Fate.gs解放判定同款寫法)，避免玩家選較弱寶具時仍被判定成最強寶具規模去燒對方God Hand的命。
- **🐛→✅ 鑑賞小道具/催眠指令3個handler漏帶`loc`在場驗證**：`actionKanshouSetProp`/`actionKanshouAddCustomProp`/`actionKanshouCastHypnosis`(Gallery.gs)呼叫`findPcRowIdx_`時，跟`promiseMeet`/`cohabitInvite`/`handHold`用的是同一支resolver，唯獨這3處沒帶`loc:curL`——沒驗證目標同伴此刻是否真的在場就能裝備/施展。已補上`loc: String(data[meIdx][COL.PC.LOC]||"")`，跟其餘親密向action驗證邏輯一致(`actionKanshouMemoirOp`共同回憶本就不需要在場、`actionKanshouDeleteCustomProp`是批次清全部同伴身上的道具，兩者刻意不帶loc)。
- **補完§22兩處遺漏的批次收斂**：`Router_Movement.gs`的`playerAmbushOnEnemy_`(趁隙偷襲)、`enemyAmbushOnServant_`(陣地反擊分支＋真突襲分支)共3處仍手刻`injectMasterMeleeSupport_`+`injectMasterMagicSupport_`雙支呼叫，沒跟進`injectMasterSupportFor_`——已改用共用函式。`Router_Battle.gs`的`actionFateBattle`/`actionSummonHorror`共2處仍手刻AP門檻+扣費，沒跟進`chargeApOrReject_`——已改用共用函式(`actionSummonHorror`那處**不能**傳`skipWrite`，因為`drainForNp_`的整列寫回發生在AP扣款【之前】，DAY/HOUR/AP仍需自己的窄欄寫入，跟`actionFateBattle`「稍後還有一次整表寫回」的情境不同，誤傳skipWrite會讓AP扣款只留在記憶體、沒真的寫回試算表)。
- **文件補註**：`chargeApOrReject_`(Core_Settings.gs)的`.reject`回傳路徑目前全部14處呼叫端都沒真的檢查過(因為呼叫前都已有獨立guard擋過)，屬於「預留但目前吃不到」的死路徑——已在函式註解明講，新呼叫點若打算只靠它擋門檻(不自帶前置guard)務必自己補`.reject`檢查。

**KANSHOU_REFERENCE.md 過時內容已一併修正**（8類、約10處）：`minBond`欄位3處從「保留無讀取」訂正為「已整批物理刪除」；`KANSHOU_FILM_PER_DAY_`從常數速查表移除(拍照改手機後此常數已刪，文件原本自相矛盾)；`kanshouPickDate_`改過去式(八度改版已整支刪除)；補上`kanshouPickLocation_`改用獨立`#kloc-overlay`(解耦離`#kp-overlay`的隱性碰撞風險)；補上`findPcRowIdx_`/`kanshouMissStr_`/`formatFourSlot_`(已刪)/`kanshouDailyTranslateCall_`/`ensureOverlay_`/`_showOverlayLoading_`這幾支§22新增共用helper跟既有段落的關聯。

**評估後判斷仍應維持現狀、本輪不動的項目**（供之後評估，非遺漏）：
- `fateStrike_`(Router_Battle.gs)與斬首反噬分支的死亡結算合併——重新盤點後發現實際是**4處**(含`Router_Movement.gs`的`playerAmbushOnEnemy_`/`enemyAmbushOnServant_`各自的survive/god_hand簡化版)而非原認知的2處；`Router_Movement.gs`內部這2處可安全合併(結構最接近、無額外機制差異)，但`fateStrike_`本身承載的規則明顯更多(海怪護盾/整備餐/令咒脫離)，強行泛化風險仍偏高，暫不動。
- `actionMove`裡4~6處重複掃描`allPcData`找同地敵人——逐一核對filter組合後發現雖然「外層形狀」相似(LOC+game_id+存活+已登場)，但每處都搭配不同的次要條件(isAllied_/BOND門檻/限定陣營)，屬於「收斂演化」而非真複製，整支泛化仍不建議。
- `upgradeCodexPersonas_`/`upgradeMasterCodex_`(Seed_Codex.gs)合併——重新評估後風險從「中」降到「低-中」(可用顯式參數化避免刪除side effect誤觸)，但仍建議動手前先跑模擬測試，本輪暫不做。
- kanshou側8個handler仿`runSimpleAction_`共用wrapper——重新檢視後8支的「成功後處理」分裂成至少4種截然不同模式，真正能省下的公版骨架只有3~4行，投報比差，維持不做；但`kanshouSetProp`/`kanshouAddCustomProp`/`kanshouDeleteCustomProp`3支(共用`_kpBusy`+原地重繪同一面板)可低風險局部合併，`kanshouOpenProps`/`kanshouOpenHypnosis`的前導載入區塊也逐字重複可安全抽出——這兩項為本輪盤點出的新候選，尚未動手。
- 額外盤點出的零風險候選(尚未動手，供下一輪參考)：`STATUS` JSON四鍵樣板全庫重複20處(`Router_Battle.gs`/`Router_Movement.gs`/`Router_Creation.gs`/`Seed_Rivals.gs`/`Router_Bond.gs`/`Time_World.gs`)可抽`mkStatus_`共用函式；`BATTLE_DEFER_WRITE_`守門的單列寫入樣板全庫重複19+處可抽`writeRowIfLive_`；`Time_World.gs`的「暗處互鬥」背景死亡判定完全沒有survive/god_hand檢查(可能是刻意的背景演出簡化，也可能是規則不一致，需要跟玩家確認設計意圖而非自行判斷)。

`bash check.sh` 全過、`nsfwBaseRules` 紅線未觸及。

## 24. 再稽核輪（2026-07·玩家「繼續檢查整體代碼」）

移除內建跳蛋+新增道具效果欄/快速貼圖自訂功能上線後，玩家要求再全面檢查一輪。派5組agent分頭掃鑑賞層(Gallery.gs)／戰鬥引擎／世界模擬層／前端HTML／資料層+其餘檔案，找到並修正以下真實問題：

- **🔴 高嚴重度安全漏洞：`resolveCallerGameId_`(§23新增) solo分支查無此列時回傳`""`而非`null`**——4個呼叫端(`actionGetFullStatus`/`actionUpdateFate`/`actionUpdateRelTag`/`actionSetNickname`)都只用`myGameId===null`判斷拒絕；`""`是falsy但**不是**null，會逃過拒絕檢查，讓下游`findPcRowIdx_`/handler自己手寫的`if(myGameId && ...)`過濾條件整個失效(gid為空字串視同不限定game_id)，退化成跨全局姓名/id搜尋——捏造任意不存在的pcId＋猜中目標角色名，即可讀出任何玩家的完整狀態，甚至竄改任意受害者從者的性格/身世/關係稱呼。已修：查無此列一律回`null`強制拒絕；「找到列但其GAME_ID欄本身是空字串」(舊資料相容)才維持回傳`""`。
- **🔴 高嚴重度：`actionEndRun`(Account.gs，結束本局/棄局)完全沒驗證acctName是否真的擁有傳入的pcId**——純用可預測格式(`"PC_"+Date.now()`)的裸find，任何人皆可猜/枚舉pcId替別人結束並清空整局存檔(純破壞性、非讀寫竊取)。已修：改比對帳號表`COL.ACC.PC`實際連結的charId，不符直接拒絕。
- **🐛→✅ `actionAccountNewGame`(開新局)自行重寫一份刪除迴圈，沒像`purgeGameData_`一樣同步清「歷史暫存」表**——開新局是最常見的棄局路徑，一直漏清導致歷史表持續累積孤兒列。已改共用`purgeGameData_`；gid為空的孤兒charId(無對應game_id世界)情況另外補一次`purgeHistoryForPcIds_`。
- **🐛→✅ 自訂道具／催眠指令同名互相覆寫**：`actionKanshouAddCustomProp`與`actionKanshouCastHypnosis`(Gallery.gs)共用同一份【自訂道具】清單、都直接拿玩家輸入字串當id——一般道具同名撞進已存在的催眠指令會靜默解除`ignoreBond`(無視好感門檻)且清空原本part/effect；反過來催眠指令同名撞進一般道具會靜默關閉該道具的無視好感效果。已改成偵測到同名但屬於另一命名空間時直接拒絕並提示換名，不再靜默覆寫。
- **🐛→✅ 美杜莎`petrify`跟斯卡哈`gae_bolg`/EMIYA`ubw`(§23)同款孿生bug第三例**：`offenseTier_`的`pierceFx`無條件清單原本仍含`petrify`——美杜莎的『魔眼』永久技能fx也是petrify，同時petrify又是她兩個可選寶具之一(他者封印·鮮血神殿)，選了另一個(貝勒羅豐)時仍會被無條件清單掃到誤判成帶概念3貫穿。已移除，交給`npProfile_(c).fx`按實際選定寶具判定；`offenseTier_`外的petrify判定(迴避減益/瀕死乘隙加成)是她「魔眼」被動本身、不受寶具選擇影響，維持`hasFx_`原樣不動。
- **🐛→✅ `actionEnterKanshou`(Gallery.gs)分支②(舊版MEMORY【帳號】標記一次性遷移)漏回傳`quickPhrases`**：跟分支①不一致，走這條遷移路徑的老玩家當次登入會看不到已存的自訂快速貼圖(資料沒真的遺失，下次一般登入走分支①即恢復正常)。已補齊。
- **⚡ 效能：12處`getAp_(gameId)`呼叫端手上明明已有剛讀好的pcData卻沒傳第二參數**——`Router_Bond.gs`(4處)/`Router_Movement.gs`(6處)/`Router_Economy.gs`(2處)，導致`getClock_`又整表重讀一次「眾生」表，違反CLAUDE.md「整表只讀一次下傳」準則。已全數補上`pcData`第二參數。
- **⚡ 效能：`Router_Movement.gs`5處`chargeApOrReject_`呼叫沒傳`skipWrite`，跟同函式內另一次pcData[pIdx]整列寫回疊加成同一列兩次Sheets I/O**(`actionPrepMeal`/`actionFactionAmbush`即`playerAmbushOnEnemy_`呼叫端/`actionIncite`/`actionSetWorkshop`/`actionScavenge`)。已補`skipWrite:true`，讓單次整列寫回一次到位(`actionPrepMeal`/`actionSetWorkshop`/`actionScavenge`原本是「先整列寫回(帶舊AP)、chargeApOrReject_才扣AP」的順序，順手一併重排成「先扣AP、最終狀態再整列寫回」)。

**驗證後判斷無問題、維持現狀的範圍**：鑑賞層`kanshouOwnedRowIdx_`已覆蓋全部handler無遺漏；快速貼圖sanitize/cap與前端一致；`Router_Economy.gs`/`Router_Movement.gs`已無房東房客/經濟殘留死碼；`Mystic_Code.gs`除以零/NaN邊界皆有擋；前後端XSS(escapeHtml)/acctName傳輸/UI一致性核對後皆正常；資料層(Seed_Codex/Seed_Rivals/History_Sync/Setup_FateWorld/Router_Persona/Router_Creation)既有🐛→✅修補註記皆核對一致，無新發現。

`bash check.sh` 全過、`nsfwBaseRules` 紅線未觸及。

## 25. 連續稽核輪（2026-07・「繼續檢查只要有問題修正完成後就繼續查…直到連續3次沒有找到問題」，跑到連續3輪乾淨為止）

**🔴 系統性漏洞：pcId 未驗證歸屬**——見 §3「pcId 歸屬中央驗證」，本輪最大修復，已寫在該節不重複。

**雙從者身分張冠李戴**：
- `enemyAmbushOnServant_` 新增 `preferSvIdx` 參數（見 §「卸防突襲」function manual 對照），`actionBond`/`actionAllyBond`/`actionManaSupply`/`actionSpiritRepair`/`actionRest` 都改傳各自已解析好的 `findPlayerServantIdx_` 結果，不再永遠突襲表上第一位從者；前端 `move`/`rest`/`ally_bond` payload 同步補上 `servant`/`servantId`。

**主從硬連結**：
- `actionBreakAlliance` 撕毀盟約時新增硬連結對象同步解除——撕毀敵御主連帶清掉其硬連結敵從者的【盟約至】，反之亦然，修掉舊版「一側撕了、另一側仍卡在已結盟狀態」的殘留。

**worldTick_ 暗處互鬥 severed 判定方向顛倒**：
- 背景勢力互鬥模擬（`Time_World.gs`）的 god_hand/survive 復活判定，`severed`（是否遭破階效果封鎖復活）原本讀的是「自己」的破階 fx，跟 `fateStrike_`/ambush 既定的「severed＝看攻擊方破階 fx」慣例方向剛好相反——已改 `severedByA`/`severedByB`，對應到真正的攻擊方。

**遭遇窗口（【趁隙】）身分比對缺漏擴大修復**：
- §17 已修過 `actionIncite` 的 win.names 精確比對；本輪追加：`actionMove` 的悄悄離開（`_slipAway`）原本只鎖窗口 loc+type，沒比對 `win.names`——三方以上混戰時，離場只該豁免窗口點名的那兩位，同地若還有其他未被點名的能戰敵從者，仍應強制走撤退，已補 `_slipNames` 過濾。`actionFactionAmbush`（趁隙偷襲）同款漏洞：`targetName` 原本沒驗證是否為窗口點名對象，同地第三方未分心的敵人也能被指名白吃偷襲加乘，已補 `win.names` 檢查。`actionIncite` 再追加一處：win.names 存在但查無匹配時（點名雙方已死亡/離場），舊版仍會退回陣列順序瞎猜，現在直接拒絕不再退回——只有「窗口本身沒有 names」（相容舊窗口）才維持陣列順序 fallback。

**其他修復**：
- `saveGameHistoryBatch`（History_Sync.gs）補短暫（4秒）`LockService` 鎖，堵無鎖 read-modify-write 競態；呼叫端 `narrate_only`/`play` 維持 dispatcher 層全域鎖豁免不變，只鎖這一支快函式本身。
- `reseedIfEmpty_`（Setup_FateWorld.gs）的坤圖 upsert 補孤兒列清除，比照 `Seed_Codex.gs` 既有慣例。
- `rowToCombatant_`（Engine_Fate.gs）讀 `TAGS.skills`/`traits` 原本只擋 falsy，沒擋「合法 JSON 但型別不對」——補 `Array.isArray` 檢查；`Router_Creation.gs`(`actionSummonServant`)/`Seed_Rivals.gs`(`heroToNpcRow_`) 兩個寫入端同步補齊。
- 前端（Script.html）多處連線逾時/中斷的 `catch` 分支原本只 `console.error`、不刷新畫面，補上 `syncData(true)`（比照原本就有的顯式失敗 `else` 分支），避免請求丟失時畫面卡在過期的樂觀更新狀態；`travelTo` 的 catch 額外補上玩家可見的 `alert()`。
- `actionSummonServant`（Router_Creation.gs）的 `custDesc`（自訂召喚描述）原本只 trim+截長，補上 `｜【】` 及 `<>&"'` 等 HTML 斷字字元清洗，防玩家自訂描述被拿來偽造 MEMORY 標記或破壞前端 innerHTML 拼接。

**鑑賞（kanshou）側**（詳見 `KANSHOU_REFERENCE.md`）：`message`/`photo_caption` 補齊 `｜【】`＋控制字元/公式注入清洗；`actionKanshouAddCustomProp` 改為單次 `setValues`（原本多列分次寫入非原子）；`advanceHours`/`jumpBand`/`jumpFestival` 補上 `clearKanshouActiveEncounter_`（原本只在移動/結識/結束一天清，路人巧遇旗標可無限期滯留）。

`bash check.sh` 全過、`nsfwBaseRules` 紅線未觸及。連續3輪（XSS/innerHTML 渲染、COL 欄位索引一致性、武器名稱與戰鬥加成交互、超載/令咒消耗正確性、種子資料完整性、快取失效）皆確認乾淨無新發現，本輪稽核到此收斂。

## 26. 提示詞瘦身（2026-07・玩家「去整理整理SOLO吧」）
先量再動，全部有模擬器數字（`scratchpad/sim/card2.js`／`card3.js` 直接組卡量欄位長度）。
⚠ **第一次量錯過一次**：探針用鑑賞的 `heroToKanshouRow_` 建列，量到的「此刻裝扮／關係稱呼」
是**鑑賞欄位污染**、不是 solo 真況。改用純 row + `codexPersona_` 才是 solo 的真實卡。**量之前先確認資料來源。**

### `miniSystem`（Router_Narrative.gs·每回合固定成本）882 → 586 字
- 🐛 **鐵律3 是「補丁的補丁」**：159 字裡有 100 字在解釋**一條已經不存在的舊規則**的例外
  （「不必為了湊數硬性做到『至少3個』」——舊版寫過「至少3個 `<br><br>`」，AI 為了湊數灌水，
  於是補了一段道歉，但規則本身沒改）。正解是把規則寫對，例外就不必存在：
  「每2~3句用 `<br><br>` 分段（字數少時 1 個就夠）」。159→57。
- 🐛 **鐵律6 藏著演法模板**：「剛大勝→昂揚或警戒餘悸；浴血慘勝→疲憊卻挺立；落敗→負傷狼狽」
  ——三種戰果各配一個寫死情緒詞，跟鑑賞那批砍掉的微動作模板同一類（士郎贏跟吉爾伽美什贏會是同一句）。
  同條裡「不可臆測勝敗」與「別把打贏寫成敗走」還講了兩次。173→57。
- 去重：第一人稱「我」講兩次、「不灌水」講兩次、「禁重演歷史」講兩次；「禁複述數字」搬回鐵律4
  （「你只負責寫字」才是它的家）。⚠ `dialogueFormatRule_()` 兩軌共用，一個字未動。

### `servantCard_`（每張角色卡）平均 322 → 249 字
- 🐛 **萌點欄：51 字的標籤包一個 8 字的值**（「不必每回合硬塞…別只靠摸/看一眼交差」）。
  那 51 字每張卡重複一次，一場仗最多 5 張＝255 字的重複使用說明。標籤壓成「(情境對了才浮現一次)」。
- 🐛 **空欄仍然輸出**：「喜歡的事物：無｜討厭的事物：無」。舊版 `quadLabeled_(…, false)` 的理由是
  「不靜默漏項」——那是**為了開發者除錯，代價由每張卡的提示詞付**。要查漏欄請看試算表。
- 🐛 **fallback 預設值被當成真資料**：「卸下心防的私密一面：**卸下心防時的柔軟一面**」標籤與值同義反覆
  （跟既有的 `back === cls+name` 過濾同一種形狀）。新增 `QUAD_EMPTY_` 清單一起濾掉。
- 🗡️ **`servantCard_(row, {foe:true})`**：敵方卡不送 萌點／小動作（「熟了才看得到的一面」，
  戰場上的對手本來就不該有）。呼叫端＝Router_Battle 的〔敵方出戰者〕〔敵御主之護衛從者〕〔敵方盟友從者〕
  三處；我方／盟友／羈絆場景維持完整卡。敵方卡每張再省 36 字。

### 🔌 配套不變式：每個按鈕都要「意圖 → GAS 結果」（`check_wiring.py` ⑥）
玩家定的鐵則：**按鈕保證玩家目的、GAS 結算是絕對事實、AI 只負責寫字**。
要讓這條成立，每一段送給 AI 的敘事提示詞都必須同時帶兩樣：①誰做了什麼（意圖）②GAS 算出的結果（事實）。
少了①，AI 不知道在演誰的動作；少了②，**AI 會自己決定成敗**——那正是本專案一路在拔掉的東西。
- 現況：**solo 側 29 處敘事提示詞，全部都有配套**（本輪稽核結果）。
- 掃描器只認【真的在組字串】的賦值（RHS 含反引號）；回傳物件裡的欄位轉手 `aiPrompt: aiPrompt` 不算。
  helper 組的（`buildDreamPrompt_`／`buildVictoryDreamPrompt_`／`ambushDispatchPrompt_`）會連 helper 本體一起看。
- 🐛 **我自己寫這支時踩的坑**：第一版沒擋「物件欄位轉手」，跳出 **41 個警報、全是誤報**；
  第二版 regex 又太窄（「你三言兩語點燃了」判成沒有意圖、「【召喚登場】」判成沒有結果）。
  🧭 **教訓：檢查器誤報比沒有檢查器更糟**——它會訓練你忽略警報。放寬到「只抓完全沒交代的」才有用。
- 新增按鈕時：提示詞裡要有 `【系統·XXX·已裁定】` 這類 GAS 事實標頭；用了新講法就把它加進 `VERDICT`
  ——那一步逼你有意識地確認「這段到底有沒有把結果講死」。


### 🔢 字數上限：說 N、砍 N＋緩衝（2026-09 全面稽核第十一輪）
所有「GAS 硬砍字串」的地方，提示詞都必須把那個數字講給 AI 聽。硬砍本身是靜默的——
AI 不知道上限就會寫滿，然後被砍在句意未完處，綠燈、零錯誤、玩家看到半句話。
- **萌點（`COL.PC.INTENT`）**：提示詞宣告 18 字、落地 `clampMoe_` 砍 30（`MOE_STORE_MAX_`）。
  七個寫入點原本各自手寫 slice 數字，其中兩處是 18（英靈殿重召 `actionSummonServant`、
  `Seed_Rivals.gs` 複製敵從者），而 `recordOriginalHero_` 是用 30 存的——**存 30、讀 18**，
  AI 原創英靈的萌點在重召或被當敵從者時靜默腰斬。全部收進 `clampMoe_`。
- **四格短句（外貌 TRAIT／性格 PREF）**：`parseTraitsHelper` 每格砍 `TRAIT_SEG_MAX_`(30)，
  但稽核前**沒有一支提示詞提過這個數字**。新增 `TRAIT_SEG_HINT_`(14)，六處生成四格的提示詞全部帶上。
  14 是量出來的：`Seed_Codex.gs` 25 位種子從者手寫 dailyLook 四格實測 4~16 字（平均 9.2/6.2/12.2/10.2）。
  最容易爆的是鑑賞日常外貌第三格（「自稱「X」，」先吃 6 字）與第四格（要求 show-don't-tell 的具體小動作）。
- 加新的 AI 生成欄位時：**先看落地端砍幾個字，再決定提示詞宣告幾個字**，兩個數字不要各寫各的。

### ⚧ 御主不一定是男的（2026-09 全域稽核）
`Router_Persona` 的 `masterCard_`／`enemyMasterCard_`、`servantCard_` 的狂化句、`Router_Battle` 的敵御主卡與寶具解放、
`Router_Bond` 的盟誼身分釐清、`Router_Economy` 的婉拒句——泛指角色時一律寫死「他」（御主）或「她」（從者）。

但兩邊都是資料：**種子御主 15 人裡 3 位女性**（凜／伊莉雅／櫻），玩家自己的御主性別是創角時選的；
從者更是 25 人裡 12 男。鑑賞那邊是鏡像的同一個錯（詳見 `KANSHOU_REFERENCE.md`）。

修法：`pron_(sex)` 收進 `Core_Settings.gs` 兩軌共用；row 在手上就 `pron_(row[COL.PC.SEX])`，泛指改中性寫法。
`check_pronoun.py`（check.sh 第七支）擋住不准再長回來，已知性別的分支寫進 `ALLOW` 附理由。

- 🐛 **`check.sh` 只驗語法，抓不到未定義變數**：批次替換時我寫了 `${pron_(sv[COL.PC.SEX])}`，
  但 `Router_Bond` 那個作用域裡根本沒有 `sv`（該叫 `pcData[aIdx]`）——語法完全合法，綠燈照過，
  真的跑到那條路徑才會炸。**批次改完一定要用探針把改到的路徑真的跑起來**，不能只看 check.sh 綠燈。

### ⚔️ 2026-09 戰報＋戰鬥機制稽核

**戰鬥機制本身是健康的**（400 次單擊判定 ×5 組實測）：完全對等 52% 勝、全A vs 全E 90%／傷害中位 63 vs 30、
全E vs 全A 只能刮痧（傷害中位 1，`Math.max(1,…)` 地板）、力大慢 vs 敏捷 17% 命中但打中就痛（玻璃大砲讀得出來）、
寶具約 6 倍（184 vs 30）、令咒 100% 命中。**數值設計沒問題，問題全在「數值轉成文字」那一層。**

- 🐛 **「對面御主也親自下場」會認錯人**（影響最大的一個）：旗標格式是 `${誰}·${效果}`，但反擊回合的 `eFired`
  把攻守兩邊的效果**混在同一個陣列**，而判定只做子字串比對：
  ```js
  const foeMeleeFired = _fxHit_(_foeFiredAll_, '御主體術');   // 不管是誰的
  ```
  結果**我方御主的體術被讀成「敵御主下場助拳」**——敵御主根本不在場（連卡片都沒有）也照樣寫。
  改成連名字一起比（`_fxHitBy_(arr, defC.name, '御主體術')`）。
  ⚠ 我一開始誤判成「地點沒擋」，加了 LOC 判定卻沒修好——**探針說「還是有」時不要信自己的推論，把旗標印出來看**。
  （LOC 判定仍保留：`enemyMasterMemoryFor_` 原本只比名字＋game_id，人在別區的敵御主照樣遠端加傷，那也是錯的。）
- 🐛 **兩支數值轉文字的 helper 戰報都沒用上**：`hpStateWord_` 只有 `Router_Narrative` 在用、`dmgSeverityWord_` 只有
  Bond/Movement 在用。所以戰報裡：
  - 敵方 HP 46/330（14%＝命懸一線）卻寫「敗方**尚有餘力**」，而同一份提示詞的敵御主卡又依比例寫「命懸一線」——**自己跟自己打架**。
    現在 `finalLine` 與【收束】共用同一個 `_hpRatioNow`，不再各講各的。
  - 御主以身相代扛 **1 點傷**，卻要求「撲上以身卸力、流血受創」的悲壯特寫。現在依 `dmgSeverityWord_` 分流，
    擦傷就輕描（側身一擋、踉蹌），重創才給特寫。
- ✂️ **贅述**：`交鋒節奏：①命中／②命中／③命中` 每拍都一樣時收成「全 3 回合都是命中」；
  卡片抬頭的「勿複述字面／僅內化、禁複述」×3 與分鏡的「勿複述標籤名」全部拿掉——
  `miniSystem` 鐵律 4（不複述數字）與 8（性格技能只演出來、不由旁白點破）已經講過，
  而且 solo 只有一個 `narrateWithState_` 呼叫端，那份 miniSystem 必然生效。

### 🔢 數值轉文字：只給白話，不給數字

原本 `【當前狀態】` 是「**數字＋白話＋『勿複述數字』**」三件一起送：

> 【當前狀態·供連貫演出，**勿複述數字**】御主 HP 180/180·共用魔力池(…) 500/500；從者「阿爾托莉雅」HP 364/390·掛了點彩。

一邊把數字攤在 AI 面前、一邊叫它別看——而數字能給的判斷，白話已經給了。改成純白話後那條禁令自然消失：

> 【當前狀態·供連貫演出】御主毫髮無傷；共用魔力池(…)充盈；從者「阿爾托莉雅」掛了點彩。

- 新增 `MP_STATE_`／`mpStateWord_`（`Core_Settings.gs`，比照 `HP_STATE_`）：枯竭／所剩無幾／吃緊／尚可支應／（滿了回空字串）。
  **魔力 0/500 是戲劇性極強的狀態，之前只是一個叫 AI 別提的數字。**
- 戰報的 `我方造成 285 傷害、受創 22` → `_exchangeWord_` 轉成交換比白話（壓著打／佔上風但也挨了幾記／你來我往／落於下風／只有挨的份）。
  絕對數字 AI 用不上：敵方傷勢有 `hpStateWord_`、我方有【當前狀態】。

⚠ **不是所有數字都要轉**：全 solo 按鍵掃過，留下的只有兩種，兩種都該留——
**字數指示**（`【220~290 字】`，那是對 AI 的輸出規格）與**令咒餘額**（`敵餘令咒 2`——令咒是可數的實體、不是量級，
「還剩兩道」本身就是故事事實）。判準是：**量級要轉成白話，可數的東西保留數字。**

### 🗺️💞 2026-09 移動＋羈絆稽核

- 🐛 **羈絆·突襲分支漏給我方從者的卡**：正常分支本來就有 `masterCard_ + servantCard_`，
  只有突襲分支只給 `a.foeCard`——卻在 `performanceNote_` 點名我方從者要「依真名與性格演出」。
  **性格從沒送進來過。** 這是「點名了、卻沒給資料」的形狀，比缺漏更糟，因為提示詞看起來很完整。
- 🐛 **裸傷害數字還有三處**：羈絆突襲 `（−79）`（`bondSev` 明明已經算出「負傷」了，數字是多餘的第二份）、
  移動撞見兩方敵人的 `frenzy`／`hunt` 各一處（`chip()` 回傳點數直接進提示詞）。
  新增 `chipWord()` 包住 `chip()` 回傳白話，三處都改掉。
- 📏 **抵達篇幅不隨人數變**：`ARRIVE_WORDS_` 最高只到 `240~310`，但現場可能有 4 張敵方卡＋我方從者＋御主＝6 人，
  每人只剩 50 字，AI 只能點名交差。加第四階 `330~420`，`foes.length >= 3` 再升一階。
  （跟戰報 `BATTLE_WORDS_` 依大事件數分四階是同一個道理，移動這邊之前漏了。）

⚠ **這輪的通用教訓**：`performanceNote_` 點名誰、就必須有誰的卡。點名是承諾，沒有卡就是叫 AI 憑空捏造性格——
而它捏出來的東西會被玩家當成角色設定。

### 🔍 2026-09 全按鍵稽核（創角／令咒／結盟／其餘）

用 `scratchpad/size/audit_all.js` 跑遍所有敘事按鍵，自動驗兩件事：**①點名了卻沒給卡 ②裸數字**。

- 🐛 **「交鋒 0 回合」「本戰於第 0 回合終結」**：回合迴圈第 781 行 `if (sealEscaped || destroyedName || defeat || victory) break;`
  在**第一圈開頭**就中斷，所以開場對轟／寶具一擊定生死時 `rounds` 是空的。
  正常遊玩就會遇到。改用 `_roundsPhrase`／`_endRoundPhrase`：0 回合時說「在開場的那一擊之間便分了勝負」。
- 🐛 **令咒·治療／脫離連角色卡都沒有**：強制補魔分支本來就有御主卡＋從者卡，只有這兩支漏了——
  燃燒令咒是最戲劇性的動作之一（三道是御主僅有的底牌），AI 卻不知道御主是誰、從者什麼性格，
  只能寫泛泛的「手背灼亮」。補上兩張卡＋140~200 字的篇幅。
- 🔢 **裸數字又清掉十處**：強撐 `HP −36`、備餐 `命中 +2`（遊戲修正值，AI 根本用不上）、
  佈設陣地 `40 點魔力`、卸防時刻 `好感 43/100`（改用同檔的 `favorWord_`）、
  撤離追擊／歇息夜襲／趁隙偷襲／盟誼突襲／補魔突襲／靈基修復 的 `（−${dmg}）`。
  **留下來的都是可數的**：回合數、日期、行動點、令咒道數——那些本來就該是數字。

### 🎭 `check_cards.py`（check.sh 第八支）
「`performanceNote_` 點名了誰，就必須有誰的卡」做成機器擋。

⚠ **第一版是壞的**：用「往前 6 行」的視窗判斷，但 ternary 的兩個分支緊鄰，
視窗會抓到隔壁分支的卡 → 注入退化測試**完全不會叫**。
改成從呼叫點往回掃到「本分支起點」（`?` / `:` / 指派 / `return` / 函式開頭）為止才正確。

🧭 **教訓：掃描器寫完一定要注入一次退化，確認它真的會叫。** 不會叫的掃描器比沒有更糟——
它會給你一個「已經有防線」的錯覺。

### 🔋 出力電池制：三檔＋自動回落（2026-09 玩家定案）

玩家問「魔力全開這設定會不會太複雜多餘」。先量再答——**它不是裝飾，是承重的**：

| 迴路40／池400 | 淨值/時 | 池子撐多久 |
|---|---|---|
| 💥 全開 | −54 | **7.4 小時** |
| 一般 | −17 | 23 小時 |
| 省著走 | **+9** | 回充 |

一個遊戲日約 18 小時，所以連「一般」都會在一天內把池子抽乾。旋鈕是真的資源決策。

**但「太細」的直覺也對，兩個具體的點都修了：**

- **五檔收成三檔**：20 與 40 都是「省電」（差 11 點/時，玩家不會為這個精算）；
  80 只給 +1 命中／×1.10 卻**不能放寶具**——要打就全開，80 是尷尬的中間值。
  真正有語意的只有 **省著走／一般／全開**。舊存檔經 `snapOutput_` 遷移：40→20、80→60（都往下，不會偷偷解鎖寶具級耗魔）。
- 🐛 **自動升、不自動降**：`setServantOutput_` 全檔只在 `actionFateBattle` 開頭被呼叫一次。
  按「解放寶具」前端自動送 100，**打完不會降回來**——每小時 −54，7.4 小時抽乾，而玩家毫無所覺。
  那不是決策，是**忘記關燈的懲罰**。現在戰後自動還原成玩家原本的檔位（`_outputRestored`，下傳前端同步按鈕，
  並在【收束】加一句「靈基出力自行回落」讓 AI 帶一筆餘韻）。
  ⚠ 只還原「為了放寶具而被推上去」的那次——玩家自己在面板調到全開然後普通出擊，不動他的選擇。
- 🐛 **同一個病的另一面**：出力／寶具選定原本寫在 `actionFateBattle` **最前面**就落盤，
  目標驗證在**九行之後**——於是「按解放寶具→敵人剛好走了→被拒絕」也會把你留在全開。
  **打不成就不該改任何狀態**，寫入已搬到驗證之後。

驗收五種情境：一般→放寶具→回落60；省著走→放寶具→回落20；自選全開→普通出擊→保持100；
一般→普通出擊→保持60；省著走→放寶具但敵人走了→維持20（沒被動到）。

### 💨 敏捷減重（2026-09 玩家：「不然根本打不到」）

敏捷本來**三吃**：攻方命中獨佔、守方迴避佔 0.65、傷害還吃「命中分差×1.2」的技巧通道。
實測命中率矩陣（其餘六圍相同）：

```
改前                          改後
      守敏 A    C    E             守敏 A    C    E
攻敏A     59%  71%  84%      攻敏A     57%  63%  76%
攻敏E     20%  29%  43%      攻敏E     25%  30%  44%
擺幅 64（17%~81%）            擺幅 51（24%~75%）
```

改法（四種量過，這組最平衡，見 `scratchpad/size/agi_opt.js`）：
- 攻方命中：`主屬×1.0` → `主屬×0.8 + 筋力×0.2`
- 守方迴避：`敏×0.65 + 耐×0.35` → `敏×0.5 + 耐×0.5`

整體影響：**力大慢 vs 敏捷 17% → 30% 勝出**（力量型終於打得動敏捷型）；
完全對等仍 52%、全A vs 全E 88%、寶具與令咒不受影響。

### 🌟 真名解放·獨立一拍＋應對選單（2026-09 玩家定案）

玩家：「現在是玩家開啟的話是 100% 碰撞，應該有更多其他選項才對……這應該也不要做到 3 回合中，應該要獨立才對……
對方也是，如果他準備要開，要給玩家選項才對。」

**查證後跟印象略有出入**：對轟本來就不是 100%，是 `clashUrge = 0.6 + (狂化/咒腕 ? .25 : 0) − (1−敵血比)×.3` 的機率。
但玩家真正說對的是——**當敵方決定迎擊，唯一的結果就是對轟**，而且**玩家自己完全沒得選**；
敵方預告寶具時前端只彈一句「留魔開理想鄉／寶具對衝／速速脫離！」，那三件事都要玩家自己跑去別的地方按。

#### `NP_RESPONSE_`（資料驅動，往表加一列就多一個選項）

| 選項 | 長出來的條件 | 結果 |
|---|---|---|
| 🔮 展開結界 | 御主持 Avalon 禮裝＋魔力 ≥100 | 全免傷，扣 100 魔 |
| 🛡️ 硬接 | 一律可用 | 減傷 `min(0.72, 0.35 + 耐久tier×0.06)` |
| 💨 閃避 | 一律可用 | 成功率 `min(0.62, 0.18 + 敏捷tier×0.07)`；成功 0 傷、失敗 ×1.1 |
| ⚔️ 寶具對衝 | 自身有攻擊型寶具＋付得起 prana | ×0.35 並反擊 |
| ❖ 令咒脫離 | **尚有令咒** | 燃 1 道令咒·空間轉移：毫髮無傷、玩家＋從者＋同行者一起遁走，但**真名仍在弦上** |

⚠ **脫離的代價改了兩次，第二版是玩家定的**：
第一版「0 傷、0 代價」，玩家一句「無損脫離……大家一定選這個吧？需要一點代價」點破——
**零傷又零代價的選項不是選擇，是正確答案**。
我改成「追擊擦傷（7~13 傷）＋真名仍在弦上」，玩家再回一句「硬接 閃避 對衝 **令咒脫離** 這樣呢？」——**這個更好**：
- 令咒是**全戰爭只有三道**的底牌，代價的份量對得上「躲掉一發真名」
- 「干涉空間、強行抽離」本來就是原作裡令咒的正統用法，比「被咬一口」自然得多
- 燃得起就**乾淨脫身**（毫髮無傷才配得上這個代價），燃不起就**沒有退路**，只能自己接下這一擊
- 落地直接複用 `use_seal` 的 `escape` 那套搬人邏輯（玩家＋出戰從者＋同行者一起走），不另寫一份

保留的是「**他的真名並沒有放出去**」→ `clearNpTelegraph_` 不執行，仍蓄在弦上。
你只是逃掉這次碰面，不是解除危機。敘事明講「★別寫成危機解除」。
另外整個真名這一拍耗 1 AP（原本完全不耗，等於白賺一回合）。

實測五種應對的代價對比（阿爾托莉雅 390 HP 面對 EMIYA 的真名）：

| 應對 | 結果 | 什麼時候該選 |
|---|---|---|
| 🛡️ 硬接 | −157（40%） | 血夠厚，穩穩吃下 |
| 💨 閃避 | 0 或 **−393（直接死）** | 硬接也會死的時候，賭 46% |
| ⚔️ 對衝 | −138，反擊 257 | 想交換、逼對方一起掉血 |
| 🏃 脫離 | −13、耗 1 AP、真名仍在弦上 | 撐不住，但問題沒解決 |

⏳ AP 刻意「扣得到就扣、扣不到也放行」（`spendAp_` 包在 try 裡、不 reject）——
這是被迫應對的事件，**沒行動力就卡死在敵方真名前面是死路，不是難度**。

- **敵方預告 → 玩家選**：`actionFateBattle` 偵測到 `getNpTelegraph_` 就回 `needNpResponse`＋選項，
  前端沿用既有的 `resolveBlockCard_` 卡片模式畫按鈕，玩家點了才走新的 `np_respond` action。
  **這一拍獨立結算、不跑三回合交鋒**，有自己的 200~280 字敘事。
- **我方寶具 → 敵方也用同一張表**：`npAiResponse_` 依能力挑（結界 > 敏捷tier≥5 時 45% 閃避 > 硬接），
  經 `fateStrike_` 既有的 `opts.forceDamage` 落地，不另開特例。
  以前沒對轟就是傻站著吃滿，玩家只看得到「對轟」與「照單全收」兩種結果。

實測分佈：EMIYA（敏捷 C·tier3）只會硬接；庫·丘林／小次郎（tier5）才會閃——快的閃、慢的擋，符合直覺。

- 🐛 **我在這輪自己踩的兩個探針坑**（都不是 code 的錯，但都差點讓我誤判）：
  ① 正規表達式用 `(.)` 抓 emoji——emoji 是兩個 UTF-16 單位，只抓到一半，害我以為機制沒觸發。
  ② 連打 40 場時 39 場「失敗」，一看訊息才發現那是**新機制正確攔截**（敵方蓄勢待發，每場都先問玩家）。
  **探針說「沒作用」時，先確認是不是探針自己的問題。**

### 🔮 蓄勢的真名撐幾天：敵人自己決定（玩家定案）

玩家問「下次見面會直接被丟寶具嗎？」——追完三條路：

| 路徑 | 結果 |
|---|---|
| 主動出擊他 | **又跳應對選單**，不是直接被丟 |
| 徒步撤退（不燒令咒） | **60% 被真名轟中背影**（既有的背擊機制，沒有選單） |
| 令咒脫離 | 乾淨脫身，但真名仍在弦上 |

這組對照不是設計出來的，是「脫離改成燒令咒」之後**自己浮現的**：
**免費的退路有風險（徒步撤退吃背擊），安全的退路要付底牌（一道令咒）。**

#### `reconsiderNpHoldDaily_`（`Time_World.gs`，掛在 `worldTick_` 的每日處理）

原本 `【寶具預告】` **永不過期**——那個敵人會一直上膛。玩家定案「讓敵人自己決定放不放」，
所以每天重骰一次，依性格（資料驅動，往 `NP_HOLD_` 加一列就多一種性格）：

```
NP_HOLD_BASE_       0.55   基礎續抱
NP_HOLD_DESPERATE_  0.30   ×血量缺口（快死了更非放不可）
NP_HOLD_  mad +0.40 ／ zabaniya +0.25 ／ gob +0.20
```

| 情境 | 單日續抱 | 撐 3 天 | 撐 7 天 |
|---|---|---|---|
| 一般敵從者·健康 | 55% | 17% | 1% |
| 一般敵從者·剩三成血 | 76% | 45% | 16% |
| **狂化（赫拉克勒斯）** | **95%** | **86%** | **70%** |
| 咒腕之哈桑 | 80% | 50% | 21% |

**拖得掉一般敵人，拖不掉狂化的**——實跑三次，第 7 天還抓著不放的兩次都是赫拉克勒斯。
放棄時會傳出風聲（`〔風聲〕「X」高漲的靈基壓力悄然平復下來……`），**不是靜靜消失**，
玩家要知道壓力解除了。

### 🌟 寶具分類：兩個維度（2026-09 玩家定案）

玩家：「有些寶具是被動的，能好好的做出區別嗎？」→「是不是要增加寶具的分類？」→「那召喚/變身類呢」

**原本沒有這一層**——「能不能對轟」是從**副作用推論**出來的：看技能裡有沒有攻擊 fx、看 `npAtkScale_` 夠不夠大。
猜對是湊巧，猜錯很難看（實測）：

| 從者 | 寶具 | 舊判定 | 真相 |
|---|---|---|---|
| 斯卡哈（Assassin） | 蹴穿死翔之槍（對人 B+·穿刺） | 🚫 不能對轟 | **誤判**——只是技能沒掛 `gae_bolg` fx |
| 伊莉雅（Caster install） | 全彈發射・魔力炮 | 🚫 不能對轟 | **誤判**——純火力寶具 |
| 伊斯坎達爾 | 王之軍勢 | ✅ 可以 | 對，但**湊巧**——靠 scale=對軍 矇到 |

#### 兩個維度，刻意分開

**召喚類同時是攻擊**（螺湮城教本 對城規模、會造成傷害，還留下海怪），一個互斥欄位表達不了，
所以拆成互斥的 `kind` ＋ 獨立的 `lingers`：

| `kind`（互斥） | 可解放 | 可對轟 | 例 |
|---|---|---|---|
| `attack` ⚔️ 攻擊 | ✅ | ✅ | Excalibur、魔力炮、穿刺槍 |
| `barrier` 🔮 結界 | ✅ | ✅ | 無限劍製、鮮血神殿、王之軍勢、魔境之門 |
| `utility` 🧩 非攻擊 | ✅ | 🚫 | Rule Breaker（破壞契約，接不住一發對城光炮） |
| `passive` 🛡️ 常駐 | 🚫 | 🚫 | 十二試煉 |

`lingers`（獨立旗標）＝解放完戰場上會不會多一個持續存在的東西：
螺湮城教本（海怪）、王之軍勢（萬軍）、鮮血神殿、無限劍製、妄想幻像（八十體）、騎士不死於徒手（變身態）。
**這個維度代碼裡本來就有**（`horrorUp`／`【海怪護盾】`／每小時維持費／解除召喚按鈕），只是沒有名字、只為海怪寫了一套。

#### 來源優先序（`npKindOf_` / `npLingers_`，`Engine_Fate.gs`）

1. **多寶具選單的 `kind`／`lingers` 欄**（`servantNpOptions_`）——分類必須**跟著每一個寶具走**，
   阿爾托莉雅的 Excalibur 與 Avalon 不同類，掛在從者身上會錯
2. **寶具字串裡的標記**：`【常駐寶具】`／`【結界寶具】`／`【非攻擊寶具】`／`【留存】`
   （沿用既有慣例——`【常駐寶具】` 本來就在用，不另開 COL 欄位，位置索引動不得）
3. **預設 `attack`**——絕大多數寶具就是拿來打的，**而且舊存檔不必改**。
   斯卡哈與伊莉雅那兩個誤判就是這樣自動修好的：它們沒有標記，所以是攻擊寶具。

衍生判定：`npReleasable_`（非 passive）／`npCanClash_`（attack 或 barrier）。
四處推論全部換成查它：擋解放、對轟資格、敵方預告資格、應對選單的「⚔️寶具對衝」。

驗收：赫拉克勒斯（常駐）🚫 擋下解放；美狄亞（非攻擊）✅ 可解放但 🚫 不可對轟；伊莉雅 ✅ 兩者皆可。
種子人設版本升到 `v73`，既有存檔的英靈殿會跟著更新。
