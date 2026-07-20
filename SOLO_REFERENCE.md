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
| **九州 GAS 不可動** | 原始九州/GAS repo（`/home/user/GAS`）只能複製、不可改。FATE 內部的九州衍生碼可清理。 |
| **show-don't-tell** | 敘事禁止直接寫出角色的 願望／個性／萌點 字面。只能用神態動作演出（`servantCard_` 鐵則一二三 已強制）。 |
| **model id** | 本模型的 exact id 不可出現在 commit／PR／程式碼／任何 push 進 repo 的東西（見 CLAUDE.md 紅線⑤）。 |
| **branch** | 只在 `claude/traditional-chinese-chat-q8ptho` 開發。 |

- **兩軌完全拆開**：`actionPlay`（鑑賞自由聊天引擎）＋`buildDefaultSystemPrompt`（含 `nsfwBaseRules`）都住在 `Gallery.gs`（鑑賞軌集中地）。`callGeminiAPI`（solo/鑑賞共用的打 API 核心）留在 `Engine_Combat.gs`。solo 走完全獨立的 `narrateWithState_`（`Router_Narrative.gs`），從不呼叫 `buildDefaultSystemPrompt`。
- **solo 一律鎖 SFW**：`actionPlay` 入口守門——非 `KPC_`（鑑賞路由前綴）直接 `return`，完全不信任何前端 `isNsfw` 旗標。solo 從不用 `actionPlay`。
- **模型常數**（`Core_Settings.gs`，皆讀指令碼屬性、未設定才落回程式碼內字面預設）：
  - `OPENROUTER_API_KEY`（唯一認的金鑰屬性名，無相容別名）。
  - `AI_MODEL`（屬性 `MODEL`）：鑑賞（NSFW）用。
  - `SOLO_MODEL`（屬性 `SOLO_MODEL`，預設 `google/gemini-3.1-flash-lite`）：solo `narrateWithState_` 用，低延遲小模型。
  - `UNLOCKED_MODEL`（屬性 `UNLOCKED_MODEL`）：補魔/令咒高好感解鎖分支（`actionNarrateOnly` 的 `deepseek` 旗標）用。
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

主進入點 `handleGameAction` → `sanitizeUserData_`(輸入清洗) → 查 `ActionRouter[action]`。AI 輸出經 `sanitizeAiData_` 夾值防幻覺。未知 action 走 else 支優雅回錯誤。

- **慾海擋牆**：`KANSHOU_BLOCKED_ACTIONS_` 白名單，`isKanshouCtx` 命中就在 dispatcher 層擋下戰鬥/經濟類 action（`fate_battle`/`use_seal`/`mana_supply`/`bond`/`rule_break_steal`/結盟系/陣地系/`set_*` 等）。刻意不擋 `move`/`update_fate`/`update_rel_tag`。
- **⚡ 每按鍵 3→1 round-trip**：dispatcher 對 `STATE_AFTER_ACTIONS` 白名單動作＋`PC_` 御主，自動把 `_state:buildClientState_()` 夾進回應；前端 `gasRun` 暫存 `data._state`→`__pendingState`，`syncData` 優先消費。寫入完整性已驗證的 handler（move/rest/fate_battle）用 `STATE_PRE_DATA_` 把權威 pcData 交棒給 dispatcher，`buildClientState_(sheets,pcId,preData)` 直接複用免整表重讀。**別把多餘 round-trip 或重複整表讀回加回來。**

### solo 會用到的 action

| action | handler | 作用 |
|---|---|---|
| check_name / check_sheets / account_login / account_new_game | Account/Setup 系 | 登入／建帳號／開新局／手動補分頁 |
| create | actionManualNpc | 御主創角。**🚀 非阻塞：不叫 AI**——用玩家種子值＋GAS 算的數值（HP/MP/game_id/迴路/令咒/模式/戰爭/扮演 MEMORY）＋起始禮裝秒寫入。落點確定性選（偏好新都）。（手動建 NPC 的 !isCreate 分支已成死碼）。**🛡️ 帳號重入防呆**：帳號若已連結一局活著的遊戲(帳號表 `COL.ACC.PC` 存在且對應列仍在)則拒絕再建——防 `create` 異常被呼叫第二次時 `linkAccountToPc_` 覆寫連結指標、悄悄孤兒化舊角色＋已召喚的從者(英靈殿範本不受影響·僅帳號視角看不到那局進度)。合法的 `newGameFlow` 本就先呼叫 `account_new_game` 清連結才會走到這裡，不受影響。 |
| backfill_master_ai | actionBackfillMasterAi | 🚀 御主敘事非阻塞補生成：create 後前端 `backfillMasterAi(seed)`（不 await·趁挑從者空檔）呼叫，AI 補 背景/特徵/個性/萌點，只單格 setValue 更新 4 敘事欄（BACK/TRAIT/PREF/INTENT）。失敗＝保留種子。 |
| update_fate | actionUpdateFate | 逆天改命：玩家改自己 4 敘事欄（個性/特徵/身世/萌點），數值/寶具不可改。 |
| summon_servant | actionSummonServant | 召喚從者（英靈殿抓真名/六圍/技能→眾生列）。種子英靈直接用寫死 persona、不叫 AI；名冊查無才走 AI 即時生成。敘事8格：個性(PREF)讀 `persona.words`、特徵(TRAIT)讀 `persona.look`（種子皆手寫4格 外貌/氣質/自稱/卸下心防私密一面）。AI 生成走 `sanitizeSix_`（EX 最多2項·超額降A）/`sanitizeSkills_`（fx 非 `ALLOWED_FX_` 白名單→清空·階級 regex·數量帽）雙重防呆；缺 realName/six 中止不寫表。**🐛→✅ 2026-07 職階技能改 GAS 直接指派**：舊版讓 AI 自己生 `classSkills`(prompt 只講「貼合職階慣例」)，玩家實測抓到一名 Berserker 除了正常的「狂化」外還多一個像符文/道具作成系的「召喚騎士」——AI 額外發明了一個不屬於該職階原型的技能，軟性建議擋不住。改為比照工房 `parseForgeBuild_`：`aiCSkills = FORGE_CLS_SKILLS_[cls] || []` 直接指派、不再問 AI，prompt 也移除 classSkills 請求(只留固有技能 skills 2~3個)，徹底杜絕跑題，AI 專心生角色個人技能即可。**🌀 2026-07 六圍下限保底 `bumpSixToFloor_`**：舊版只擋「太強」沒擋「太弱」——AI 常自己抓不準力度，玩家實測抓到「AI自訂從者也太弱」，光靠 prompt 措辭「務必有強有弱」擋不住。改為 GAS 硬性補強：算完(六圍+`aiSkills`，**不含** `aiCSkills` 職階技能，比照工房不計費)低於工房同款 `FORGE_FLOOR_`(=340，對齊 `FORGE_BUDGET`)就把最弱一項六圍逐階往上補，直到達標或撞 EX≤2 上限為止；`align` 也補上跟工房一致的 `ALIGNS_` 白名單驗證(舊版 `aiBrief.align||"中立"` 沒驗證，AI 可能吐出九宮格外的怪陣營字串)。**技能 `{n,r,fx}` 中 n(顯示名)與 fx(機制)脫鉤**：`sanitizeSkills_` 保留 AI 取的 n(截10字)、獨立驗 fx；戰報靠 `fxName_` 讀該從者自己的 n 顯示、不會張冠李戴。**🎭 三分類 `origin`**(前端 `s-origin`／`cf-origin`·helper `originGuide_(origin)`→`{frame,skill,pnote}`)：`fate`=Fate正史(技能忠原著招式名)／`anime`=其他動漫畫知名角色(技能取該角色招牌招式名，如悟空→龜派氣功)／`original`=完全原創(自取像寶具的花名·空=此)。自訂生成(summonByDesc)吃 `frame`(角色框定)+`skill`(技能命名)；工房(summonByForge/save_hero)技能名玩家自己打·只吃 `pnote`(AI 補人格忠實度)。**⚔️ 自訂生成職階獨立選擇 `s-cls`**：不吃上方瀏覽名冊用的 `selectedSummonClass`(曾誤共用→玩家點過職階分頁瀏覽後再自訂生成，職階被悄悄鎖死、跟描述無關)；不選(空字串)時 `reqCls` 亦空，`clsUnset` 成立→職階交給 AI 依描述判斷(回傳 JSON `cls` 欄，非法值才退回 Saber)，不再死綁 Saber。**🏷️ 技能來源標記 `tagSkillKind_(arr,kind)`**(Router_Creation.gs)：寫入 TAGS 前把 classSkills/skills 分別打 `kind:'class'/'skill'` 再合併——4 個寫入點(此函式 hero 分支/AI生成分支、Seed_Codex.gs 種子英靈、Seed_Rivals.gs 敵方鋪陳)皆已改用；純顯示欄位，`hasFx_`/`fxName_` 只認 fx/r 不受影響。前端 `buildSvCard`(Script.html) 據此把技能分三卡「職階技能／固有技能(依 `rankVal_` 階級高→低排序)／特殊技能(`SELECTABLE_FX` 可選效果)」，寶具維持原樣不動；`skillBucket_` 對缺 `kind` 的舊角色(合併時未標記)退回 `CLASS_SKILL_FX_HEUR_`(鏡射 `FORGE_CLS_SKILLS_`) fx 代碼猜測，猜不中一律落固有技能。 |
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
| narrate_only | actionNarrateOnly | **AI 純說書**（solo 專用；GAS 算數值、AI 只演出）。`userData.deepseek` 旗標→改用 `UNLOCKED_MODEL`（補魔/令咒高好感解鎖分支）。 |
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
- **Avalon-Saber 理想鄉**（Mystic_Code `injectMysticBuff_`）：御主持 Avalon＋從者為阿爾托莉雅→注 `avalon_saber`（鞘減傷 npDefMul 0.82）＋`regen`。**完全擋寶具**（被動自動·概念7階）：Router_Battle 敵擊前攔截 `avalon_saber && offenseTier_(enemy)>=6 && 御主純魔≥100` → 完全擋下（eDmg 0）＋扣 100 MP。get_tags `canIdealRealm`。
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
- **戰報**：`renderFateBattleReport` 畫斬首/strikes/雙從者血條/突襲卡/追擊卡/對轟卡/反噬紅幅。`FX_DESC`（Script.html `showSkillDesc`）依 fx 即時算當前階級數值——加新 fx 就同步補這裡。AI 敘述走事實素材列＋單行 steer（show-don't-tell·不報菜名）。⚠ 戰報固定文字卡別綁死攻擊手法（用中性「重創/擊破/威能壓過」）。

---

## 5. 種子庫（英靈殿/御主殿）

- **Seed_Codex.gs**：
  - `SEED_SERVANTS`（**20騎**）：4th/5th 正典14騎（阿爾托莉雅-Saber/EMIYA-Archer/庫丘林-Lancer/美杜莎-Rider/美狄亞-Caster/佐佐木小次郎-Assassin/赫拉克勒斯-Berserker/吉爾伽美什-Archer/迪盧木多-Lancer/伊斯坎達爾-Rider/吉爾德萊-Caster/百貌哈桑-Assassin/咒腕之哈桑-Assassin/蘭斯洛特-Berserker）＋鑑賞客串6騎（斯卡哈-Lancer/斯卡哈-Assassin/恩奇都-Lancer/美遊-Saber/小黑-Archer/伊莉雅-Caster）。每筆 id/cls/realName/wars/gender/six/classSkills/skills/traits/np/align/persona（{firstP,words,toMaster,speech,moe,tic}）。
    - ⚠ **戰爭僅認 `4th`/`5th`**（`fake` 偽聖杯戰爭開局選項＋整套 `FATE_FAKE_ROSTER` 已移除）。chaos 亂鬥靠 `wars` 含 `'客串'` 排除，非硬編碼名單。
    - 單寶具種子的簽名概念 fx 必須掛進 skills（庫丘林 gae_bolg/EMIYA ubw/佐佐木 tsubame/阿爾托莉雅·美遊 excalibur）——只寫 np 字串＝只有規模、沒有概念位階。
  - `SEED_MASTERS`（15名）：id/name/sex/appearance/magic/circuits/melee/magic_rank/home/wish/persona（4段頓號·被 masterCard_ 拆解·結構不可動）/back(身世)/moe(萌點)。
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
- `worldTick_`：跨時推進世界。含：敵移位（`freezeLoc=playerLoc` 玩家格上敵人禁移，避免撲空）、`refillMastersDaily_`、敵從者小幅自癒 `ENEMY_REGEN_RATE_`(0.06·跨輪累積旗標只寫一次)、令咒透支倒數結算、暗處廝殺（`allowAttrition` 休息·第 `ATTRITION_START_DAY`(3) 日起·遠處·存活>`WORLD_FLOOR_`(4)·7%/tick·挑戰力最低者先死）。**🐛→✅ 2026-07 五路稽核修正**：①敵御主移位時「找不到硬連結從者→抓同格任一孤身從者」的 fallback，註解一直寫「孤身」卻從沒真的檢查——只要同格未死就是第一個掃到的被拖走，即使牠其實掛在另一位(這輪未移動/稍後才輪到的)敵御主名下；改成先查該從者的【御主】tag 是否有一位活著且仍在原地的主人，有→跳過不搶。②暗處互鬥的 `offstage` 候選名單完全沒排除 `isAllied_`(已結盟)的敵從者——玩家養出的盟友只要離開玩家所在格，就有機率被系統隨機抽去和不相干的敵從者互鬥致死，跟「結盟＝可倚仗的戰友」矛盾；已排除。
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
- `servantCard_(row)`（Router_Persona.gs）：壓成「〈角色背景·僅供內化〉」段塞進 narration prompt。**鐵則一**＝當背景揣摩；**鐵則二**＝設定字眼禁直述/說嘴；**鐵則三**＝依羈絆調親疏。含**狂化偵測**（persona.speech/firstP 含 狂化/無法言語/咆哮 → 加「禁說完整句、只咆哮」·赫拉克勒斯/蘭斯洛特命中·會說話的開膛手傑克不中）。自稱標籤限定範圍（「台詞內自稱，敘事旁白的『我』永遠是玩家」）防視角混淆。
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
- **敗北/勝利收場**：`handleDefeat`→虛假之夢→🐯老虎道場 AI 講評（`runTigerDojo_`·依實際敗因·藤村大河+伊莉雅吐槽+對症建議）。`handleVictory`→願望真夢→道場祝賀版→奪杯畫面（共用殼·`openTigerDojo('victory')`）。
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
