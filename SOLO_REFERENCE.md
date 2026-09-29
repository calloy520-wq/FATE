# SOLO_REFERENCE — ⚔️ 新聖杯戰爭（solo）速查

> 舊版 solo（Engine_Fate／Router_Battle／Movement／Bond／Economy／Narrative／Time_World／Mystic_Code／Router_Creation）2026-09 末已整組拆除。
> 本檔只記現行的新聖杯戰爭。為什麼這樣設計、玩家原話、平衡數字 → `CODE_NOTES.md`『WAR_』『WAR_FORGE_』。
> 鑑賞 → `KANSHOU_REFERENCE.md`；逐函式 → `FUNCTION_MANUAL.md`；提示詞 → `AI_PROMPT_MAP.md`。

## 1. 一句話

一天兩個決定，戰鬥每回合一個姿態。GAS 算完結果，AI 只負責演。沒有魔力／AP／地圖／好感／經濟。
玩家要的：**按鈕越簡單越好、畫面簡單但要有策略感、體感快、不單調。**

## 2. 三個檔

| 檔 | 做什麼 |
|---|---|
| `War_Engine.gs` | 純規則（不碰試算表、不碰 AI）。Node 模擬器 `tools/war_sim.js` 直接載入同一份。 |
| `War_Router.gs` | 存檔（分頁「聖杯戰局」，一局一格 JSON）、6 條路由、說書提示詞、世界書、老虎道場。 |
| `War_Forge.gs` | 🛠️ 英靈工房：一張表單寫一整列英靈殿，新聖杯戰爭與鑑賞通用。 |
| `Script_War.html` | 前端：一個畫面、幾顆大按鈕、工房表單。 |

## 3. 流程

```
開局三步：① 選戰爭（第五次／第四次／混亂隨機）② 創立御主 ③ 選英靈（隨機召喚／自選／英靈工房創立）
summon（開戰／重新召喚 1 次）
 → day   ：打聽 scout／休養 rest／補魔 supply
 → night ：突襲某位 sortie（前 3 位直接列、其餘收進「其他目標」）／巡邏 patrol／固守 hold
 → battle：正面 strike／試探 probe／寶具 np／撤退 retreat（＋令咒強化）
 → 第 14 夜：決戰地（5th 柳洞寺／4th 冬木市民會館／混亂隨機 柳洞寺），剩下的全員到場
 → over  ：戰績＋輸在哪＋下一局只改一件事 → 🐯 老虎道場
```

- **按鈕的唯一真實來源＝`warButtons_(st)`**：前端照畫、後端 `warAllowed_` 照驗。加按鈕只改這裡。
- `warAct_(st, act, o)` 回 `{ok, msg, ev:[{k, txt, num}]}`：`txt` 給 AI（不含數字），`num` 給畫面。
- 敵人每夜照個性（`WAR_TEMPER_`）互相吞併、會夜襲你；早報記下交手的人（`warMorning_`）。
- 寶具靠冷卻（補魔推進、令咒硬放）；真名是底牌（放寶具就曝光，知道真名＝`WAR_.WEAK` 看穿弱點）。
- 教會討伐令：第 3 天指定 Caster，親手打倒多一劃令咒（`WAR_BOUNTY_`）。
- **玩家是額外加入的一組**（`warSetup_`）：第五次／第四次的原作主從全員到齊，召喚池只剩沒參戰的從者（隨機與自選都抽不到原作參戰者，路由也擋）；混亂隨機＝兩場名冊＋其餘從者洗牌抽 `WAR_CHAOS_.size` 組，誰都能選。
- 陣容照原作（`Seed_Rivals.gs`）：御主、據點、登場那句（`arriveHint`）、第四次百貌哈桑的開場假死（`fakeDeath`：畫面照退場顯示、不能當目標，第一次出手才露餡）。
- 令咒硬放冷卻中的寶具，御主付 `WAR_.SEAL_NP_COST`。
- 種子的寶具照原作：`npPassive`＝常駐型寶具（赫拉克勒斯的十二試煉、蘭斯洛特的騎士不死於徒手）沒有可以解放的一擊；`npRank`＝實際會放的那一招的階級（吉爾伽美什平常只開王之財寶 A+，乖離劍 EX 不出鞘）。
- 原作事件表 `WAR_CANON_EVENTS_`（Seed_Rivals）：第五次坡道上的伊莉雅、操場上的弓兵與槍兵、學園的結界、柳洞寺山門的武士（Caster 抽魔力的怪事由第 3 天的討伐令講）；第四次倉庫街（征服王自報真名）、黑騎士擲回金色英靈的寶具、海特飯店被炸（迪盧木多搬家）、Caster 帶孩子到城外喊話＋肯尼斯被起源彈廢掉迴路、征服王的戰車碾進下水道工房、聖杯問答（騎士王的真名從此人人皆知；假死的百貌哈桑現身、被王之軍勢踏平）、時臣被自己送的短劍刺死（吉爾伽美什改由綺禮當御主）、未遠川的海魔與光之劍（槍兵折斷黃槍）、迪盧木多被令咒逼死、地下停車場的湖之騎士、冬木大橋上的征服王；愛麗絲菲爾（小聖杯）隨倒下的從者變虛弱、移到深山町的日式老宅、最後被擄往市民會館（`fallen` 觸發）。第四次的從者多半死在名場面，所以 `WAR_PACE_` 的互打機率低（0.2）。加一場＝往表加一列。
- **混亂隨機的宿緣**（`war:'chaos'` 的事件）：兩位有原作淵源的都在場才演——蘭斯洛特追著 Saber、吉爾伽美什與恩奇都在大橋上對望、斯卡哈追打庫丘林、兩位王對飲、紅衣弓兵遠望 Saber。只揭職階與據點。
- **第五次的三條路線**（`WAR_ROUTES_`，Seed_Rivals）：開局暗中抽 Fate／UBW／HF，不多一顆鈕；早報照那條線的原作事件走，結局卡與老虎道場才揭曉。
  - 共通：第 2 天早報＝原作第一夜（操場上的弓兵與槍兵、衛宮邸的紅槍）、第 3 天＝第二夜（坡道上的伊莉雅）。
  - Fate：天馬與誓約勝利之劍（Rider 倒下、Saber 真名曝光）、教會前金色的英靈斬倒魔女、勝利誓約之劍連殺巨人七次、山門的最後一戰。
  - UBW：Rider 在學園樹林被葛木徒手殺死、魔女在佔據的教會以萬符必應破戒奪走 Saber、吉爾伽美什（此時御主已是慎二）在森林殺光十二試煉、紅衣弓兵獨守森林射殺巨人六次（`lives` −6、弓兵重傷）、紅衣弓兵斬 Caster 後 Saber 改與凜結約、火場裡的槍兵、兩個無限劍製（弓兵放下劍）。
  - HF：小次郎被撕開→真 Assassin 登場、槍兵在柳洞寺壓制暗殺者時被影子吞下、魔女被黑影吞下、Rider 換櫻當御主並變強（沒被污染）、Saber 黑化成〔Alter〕、慎二再也沒有回家、紅衣弓兵以熾天覆七重圓環擋下黑色聖劍失去一臂、射殺百頭打倒黑化狂戰士、山道上騎兵撞倒黑色的騎士王（第 13 天）、赫拉克勒斯被吞成黑化狂戰士、吉爾伽美什被黑泥吞下；決戰在大空洞；敵人互打較少（`pace`）。
  - 劇本不收最後一位（那一位留給你）；`after` 讓接續的幕只在前一幕真的發生過才出現。
  - 事件的新效果：`kill`（照原作倒下，不播餘波）、`awaken`（叫醒預備役）、`master`、`alter`（`WAR_ALTER_`）。涉及的從者先被打倒就演不成，記進「你改寫了原作」（第四次也列）。
  - 真 Assassin 是預備役（名冊 `reserve:true`，不算敵數），只有小次郎倒下（任何一條線、任何原因）才被叫醒。
- 第一次撞見的那一句（`WAR_TEMPER_.meet`）：每位種子從者都有（`warcanon.js` 擋缺漏）；黑化後換 `WAR_ALTER_.meet`，而且像第一次見面一樣重播。原作的舊識（`WAR_TEMPER_.know`）：你的從者是對方認得的那一位時換一句——征服王遇上吉爾伽美什、恩奇都遇上吉爾伽美什、斯卡哈遇上庫丘林、吉爾德萊把 Saber 錯認成貞德…決戰夜進場那句照原作聖杯降臨的樣子（第五次寺院上方的輪廓、UBW 池上成形的黑色聖杯、HF 大空洞、第四次會館與泛紅的天空）。
- 原作從者提前倒下的彩蛋 `WAR_FALL_`（Seed_Rivals）：每位原作從者一句倒下後的餘波（衛宮邸的少年握著鐵管上夜路、韋伯哭完照樣陪老夫婦吃早餐…），說書照這句演、其餘即興。小次郎倒下＝ HF 的真 Assassin 從山門的影子爬出來（預備役被叫醒，隔天登場）。

## 4. 規則數字住在哪（查表，不寫 if 鏈）

| 表 | 內容 |
|---|---|
| `WAR_` | 全域數字：夜數、血量、命中、傷害、撤退、遭遇率… |
| `WAR_CLASS_` | 職階差異 |
| `WAR_TEMPER_` | 敵方個性（攻擊性／不撤退／偵查型） |
| `WAR_SKILL_` | **技能 → 效果**（一行一個）。種子技能的 fx 名查這張；查不到＝逸話（畫面列「名（逸話）」，不影響戰鬥，例：金羊毛、黃金律）。hook 由 `warMul_`／`warAdd_`／`warFlag_` 讀；時機一覽在表上方註解。招牌照原作：十二試煉＝整場 11 條命（重擊連殺數次）、刺穿死棘之槍不怕試探、王之財寶不必真名就打弱點、天之鎖讓神性對手逃不掉。 |
| `WAR_FINAL_`／`WAR_BOUNTY_` | 決戰地、討伐令。決戰：剩兩位以上先在決戰地混戰一輪（`warFinalMelee_`），活下來的帶著傷輪到你 |
| `WAR_PACE_` | 每場戰爭各自的節奏（`brawl`＝敵人撞見彼此時動手的機率） |
| `WAR_DOJO_LOSS_`／`WAR_DOJO_GOOD_` | 結局講評（輸在哪、亮點） |
| `WAR_FORGE_`／`WAR_FORGE_SKILLS_`／`FORGE_CLS_SKILLS_` | 工房點數、可選技能、職階技能 |

改規則先跑 `node tools/war_sim.js` 量勝率（現況：聰明玩法 5th ~62～68%（Fate 65／UBW 67／HF 65，`ROUTE=` 指定路線量；每條線有自己的 `pace`）、4th ~64%、混亂 ~63%，亂按 3～10%、只固守 5th ~10%／4th ~23%；逐從者 5th 50～81%、4th 38～93%）。
`smart` 策略會在決戰用令咒硬放寶具——模擬器的玩家要跟真人一樣會用令咒，量出來的數字才算數。每場戰爭各自的節奏在 `WAR_PACE_`（敵人互打的機率）。

## 5. 路由（`ActionRouter`）

| action | handler | 說明 |
|---|---|---|
| `war_load` | `actionWarLoad` | 讀本帳號的局（無鎖） |
| `war_new` | `actionWarNew` | 開新局（`warSeedCtx_` 組名冊） |
| `war_act` | `actionWarAct` | 做一個決定，回 view＋事實 |
| `war_narrate` | `actionWarNarrate` | 說書（不鎖按鈕；補魔、結局除外）。連按沒講到的事實併進下一段（`WAR_NARR_FACTS_MAX_`） |
| `war_quit` | `actionWarQuit` | 放棄這局 |
| `war_dojo` | `actionWarDojo` | 🐯 老虎道場（AI 只演 `warDebrief_` 那一份） |
| `war_forge_list`／`war_forge_save` | `actionWarForgeList`／`actionWarForgeSave` | 工房 |
| `war_forge_ai` | `actionWarForgeAi` | ✨ 工房 AI 幫我做：選出處（Fate 角色／其他作品角色／原創）＋一句描述 → 草稿填進表單（技能名照出處取，六圍收進上限），不存檔 |

## 6. 說書

- 系統提示 `WAR_NARR_SYS_`、本段 `warNarrPrompt_(st)`：長度照 `WAR_LEN_`，開場兩幕照 `WAR_SCENE_`。
- 世界書 `WAR_WORLD_BOOK_`：事件文字碰到地點／寶具／令咒才遞原作設定（`warLoreStr_`）。
- 對手情報照看穿程度攤開（`warFoeCard_`）；規則卡的數字照 `warRules_`。
- 補魔（`supply`）是 solo 唯一的露骨橋段（原作的魔力供給），其餘 SFW。

## 7. 資料

- 存檔：分頁「聖杯戰局」，欄 `WAR_COL_ = {ACCT, GID, UPDATED, STATE(JSON), NARR}`。帳號綁定，一帳號一局。
- 從者種子：`Seed_Codex.gs` 的 `SEED_SERVANTS`＋英靈殿裡工房做的原創從者（`warSeedFromRow_`）。
- 英靈殿 `COL.HERO`：`ID CLS NAME SEX SIX CLASS_SKILLS SKILLS TRAITS NP PERSONA ALIGN WARS SOURCE DAILY_LOOK DAILY_WORDS DAILY_MOE(棄用) DAILY_OUTFIT`。
- ⚠ COL 是位置索引，棄用不刪欄（清單見 `check_seed.py` 的 `DEAD_COL_ALLOW`）。

## 8. 驗證

- `bash check.sh`（必跑）。
- 探針：`bash tools/probes/run.sh`（war／warlore／warend／warskill2／warcanon／warzero／warroute／forgeai…）；平衡 `tools/war_sim.js`；畫面截圖做法見 PLAYBOOK「用瀏覽器真的看畫面」。
