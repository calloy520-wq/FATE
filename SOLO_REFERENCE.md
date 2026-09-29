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
summon（開戰／重新召喚 1 次）
 → day   ：打聽 scout／休養 rest／補魔 supply
 → night ：突襲某位 sortie（前 3 位直接列、其餘收進「其他目標」）／巡邏 patrol／固守 hold
 → battle：正面 strike／試探 probe／寶具 np／撤退 retreat（＋令咒強化）
 → 第 14 夜：決戰地（5th 柳洞寺／4th 冬木市民會館），剩下的全員到場
 → over  ：戰績＋輸在哪＋下一局只改一件事 → 🐯 老虎道場
```

- **按鈕的唯一真實來源＝`warButtons_(st)`**：前端照畫、後端 `warAllowed_` 照驗。加按鈕只改這裡。
- `warAct_(st, act, o)` 回 `{ok, msg, ev:[{k, txt, num}]}`：`txt` 給 AI（不含數字），`num` 給畫面。
- 敵人每夜照個性（`WAR_TEMPER_`）互相吞併、會夜襲你；早報記下交手的人（`warMorning_`）。
- 寶具靠冷卻（補魔推進、令咒硬放）；真名是底牌（放寶具就曝光，知道真名＝`WAR_.WEAK` 看穿弱點）。
- 教會討伐令：第 3 天指定 Caster，親手打倒多一劃令咒（`WAR_BOUNTY_`）。
- 陣容照原作（`Seed_Rivals.gs`）：御主、據點、登場那句（`arriveHint`）、第四次百貌哈桑的開場假死（`fakeDeath`：畫面照退場顯示、不能當目標，第一次出手才露餡）。
- 令咒硬放冷卻中的寶具，御主付 `WAR_.SEAL_NP_COST`。

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

改規則先跑 `node tools/war_sim.js` 量勝率（現況：聰明玩法 5th ~63%、4th ~66%，亂按 ~4%、只固守 ~10%；逐從者 38～89%）。
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
- scratchpad 探針：`size/war.js`／`warlore.js`／`warend.js`／`warskill2.js`；平衡 `tools/war_sim.js`；畫面 `war/shotall.js`／`uiplay.js`／`fuzz.js`。
