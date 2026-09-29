# CODE_MAP.md — 工作台（給 Claude 自己用）

> **這份是操作手冊不是說明書。** 開工先讀這份 → 照 §1 挑任務 → 用 §2 找檔 → 跑 §0 收尾。
> 🔒 **一律用 grep 錨點定位，本檔刻意不寫行號**（行號一改就騙人；函式名／常數名才是穩定錨）。
> 細節：逐函式 `FUNCTION_MANUAL.md`｜新聖杯戰爭 `SOLO_REFERENCE.md`｜鑑賞 `KANSHOU_REFERENCE.md`｜提示詞 `AI_PROMPT_MAP.md`
> 2026-09 末舊版 solo（Router_Battle/Movement/Bond/Economy/Narrative、Engine_Fate、Mystic_Code、Time_World、Router_Creation）整組拆除，
> 遊戲只剩兩條路：⚔️ 新聖杯戰爭、🌹 鑑賞後日談（加上兩邊共用的 🛠️ 英靈工房）。

---

## §0 複製即用指令

```bash
# 這函式在哪個檔？（最常用）
grep -ln "^function 函式名" gas/*.gs

# 這東西誰在用？（改簽名前必跑）
grep -rn "\b符號名\b" gas/ | grep -v "^gas/[A-Za-z_]*\.gs:[0-9]*:function"

# 某檔的目錄（頂層符號依序列出）
grep -nE "^(function|const|var) [A-Za-z_]" gas/檔名.gs | sed -E 's/^([0-9]+):(function|const|var) ([A-Za-z0-9_]+).*/\1 \3/'

# ✅ 改完必跑（CI 不驗 .html 內嵌 JS，這是唯一防線）
bash check.sh

# nsfwBaseRules 有沒有被動到（紅線①已取消禁區：可改，但改前量現況、改後跑全套探針——這行只是提醒你「有動到就要走那套流程」，不再要求 exit 1）
git diff -- gas/Gallery.gs | grep -E "^[+-]" | grep -v "^+++\|^---" | grep -i "nsfwBaseRules"; echo "exit:$?"

```

**commit（footer 逐字照抄，別自己編）**
```bash
git add <明確檔名>            # 永遠不用 -A / .
git commit -m "$(cat <<'EOF'
type(scope): 一句話講結果

根因＋修法。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016XEdY9i7dRc5MWBkSMi9YN
EOF
)"
git push -u origin claude/traditional-chinese-chat-q8ptho
```

**上線（push ≠ 上線；玩家要看到新版才做這步）**
```
mcp__github__actions_run_trigger  method=run_workflow owner=calloy520-wq repo=fate
                                  workflow_id=deploy.yml ref=claude/traditional-chinese-chat-q8ptho
mcp__github__actions_get          method=get_workflow_run resource_id=<run_id>
→ 須 status=completed, conclusion=success, head_sha 對上本地 HEAD，才可回報「已上線」
```

---

## §1 任務 → 動作清單

### 加一個新按鍵動作
1. 後端寫 `actionXxx(userData, pcId, sheets)`，回 `JSON.stringify({ success, ... })`。
2. `Router_Action.gs` 的 `ActionRouter` 加一列；純讀取或要跑 AI 的放進 `LOCK_EXEMPT_ACTIONS_`。
3. 前端 `gasRun({ action: 'xxx', ... })`，外面包 `withProcessing_`（check_wait 會擋沒有等待畫面的）。
4. 本檔 §4 加一列、`FUNCTION_MANUAL.md` 加一條。

### 新聖杯戰爭：改規則／加技能效果
- 規則數字全在 `WAR_`（War_Engine.gs）；技能效果只加 `WAR_SKILL_` 一列，引擎透過 `warMul_`／`warAdd_`／`warFlag_` 讀。
- 敵人性格加 `WAR_TEMPER_` 一列。改完先跑 `node tools/war_sim.js` 量勝率（理由與數字記在 CODE_NOTES『WAR_』）。

### 加種子英靈
- `SEED_SERVANTS`（Seed_Codex.gs）加一筆；要出現在哪一場戰爭改 `FATE_5TH_ROSTER`／`FATE_4TH_ROSTER`（Seed_Rivals.gs）。
- 種子人設改了就升 `CODEX_PERSONA_VER`，登入時英靈殿會自動刷新。`check_seed.py` 會擋幽靈技能、死欄位、劇情弧態度。

### 工房
- 可選技能 `WAR_FORGE_SKILLS_`、職階自帶技能 `FORGE_CLS_SKILLS_`、點數 `WAR_FORGE_`（都在 War_Forge.gs）。可選技能必須是 `WAR_SKILL_` 裡有的。

### 鑑賞
- 動任何一塊先讀 `KANSHOU_REFERENCE.md`。提示詞本體在 `actionPlay_`／`nsfwBaseRules`（紅線①流程）；說書人 15 段在 `KANSHOU_STYLE_MODULES_`。

### 改試算表欄位
- ⚠ COL 是位置索引，**寧棄用不刪**；棄用的登記進 `check_seed.py` 的 `DEAD_COL_ALLOW` 並寫明理由。

---

## §2 檔案地圖

| 檔 | 做什麼 |
|---|---|
| `Router_Action.gs` | 唯一入口 `handleGameAction`：消毒、歸屬驗證、寫入鎖、分派 `ActionRouter`、夾帶 `_state`；還有狀態頁／改命／稱呼那幾支 |
| `Account.gs` | 帳號登入（無密碼）、歸屬驗證 `verifyPcOwnership_` |
| `Setup_FateWorld.gs` | 登入時冪等建表 `ensureWorldReady_` |
| `Core_Settings.gs` | 模型設定、`COL` 欄位表、MEMORY 標記工廠、代名詞、狀態字串 |
| `Engine_Combat.gs` | `callGeminiAPI`（AI 呼叫、繁體轉換、JSON 修復、失敗備援）、`doGet` |
| `History_Sync.gs` | 對話歷史表（鑑賞） |
| `Router_Persona.gs` | 人設共用零件（小動作／準則標記、補魔尺度句、性別事實句、創角提示詞長句） |
| `Seed_Codex.gs`／`Seed_Rivals.gs` | 種子英靈、御主名、兩場戰爭的陣容 |
| `War_Engine.gs` | ⚔️ 新聖杯戰爭純規則（不碰試算表／AI，Node 模擬器直接載入） |
| `War_Router.gs` | ⚔️ 存檔、說書、老虎道場、世界書 |
| `War_Forge.gs` | 🛠️ 英靈工房（新戰爭與鑑賞共用） |
| `Gallery.gs` | 🌹 鑑賞全部（進場、同伴、在場、時間、提示詞、回寫、世界帳本、說書人設定、換裝） |
| `Index.html` | 登入／選單／後日談主畫面的骨架 |
| `Script.html` | 共用前端：`gasRun`、`aiHtml_`、狀態頁、改命、角色分頁、換裝、設定 |
| `Script_Onboarding.html` | 登入、處理中遮罩 |
| `Script_Kanshou.html` | 鑑賞前端 |
| `Script_War.html` | 新聖杯戰爭與工房前端 |
| `Style.html` | 全部 CSS |

---

## §3 必抄樣板（別重新發明）

- MEMORY 標記：`makeTextTag_('名字')`／`makeIntTag_` 拿 get/set（已清洗、冪等），別自己拼【】。
- 找人：`findPcRowIdx_(pcData, gid, { id, name, faction, nameCandidates: kanshouNameCandidates_ })`，id 優先、名字退路；別用 `includes()`。
- 敘事印到畫面：一律 `aiHtml_(text)`（escape 全部→只放回 `<br>`）。
- 等待：`withProcessing_('…中…', () => gasRun(...))`。

---

## §4 全 30 action → handler → 檔

| action | handler | 檔 | | action | handler | 檔 |
|---|---|---|---|---|---|---|
| account_login | actionAccountLogin | Account | | update_rel_tag | actionUpdateRelTag | Router_Action |
| enter_kanshou | actionEnterKanshou | Gallery | | kanshou_set_nickname | actionSetNickname | Router_Action |
| kanshou_reset | actionKanshouReset | Gallery | | get_heroes | actionGetHeroes | Gallery |
| backfill_kanshou_ai | actionBackfillKanshouAi | Gallery | | get_tags | actionGetTags | Router_Action |
| kanshou_companions | actionKanshouCompanions | Gallery | | outfit | actionSetOutfit | Gallery |
| kanshou_memoir_op | actionKanshouMemoirOp | Gallery | | sync | actionSync | Router_Action |
| world | actionWorld | Gallery | | play | actionPlay | Gallery |
| kanshou_summon_hero | actionKanshouSummonHero | Gallery | | war_load | actionWarLoad | War_Router |
| kanshou_party | actionKanshouParty | Gallery | | war_new | actionWarNew | War_Router |
| kanshou_set_sex | actionKanshouSetSex | Gallery | | war_act | actionWarAct | War_Router |
| kanshou_get_style | actionKanshouGetStyle | Gallery | | war_narrate | actionWarNarrate | War_Router |
| kanshou_set_style | actionKanshouSetStyle | Gallery | | war_quit | actionWarQuit | War_Router |
| kanshou_set_name | actionKanshouSetName | Gallery | | war_dojo | actionWarDojo | War_Router |
| get_full_status | actionGetFullStatus | Router_Action | | war_forge_list | actionWarForgeList | War_Forge |
| update_fate | actionUpdateFate | Router_Action | | war_forge_save | actionWarForgeSave | War_Forge |

---

## §5 資料驅動表（加一列＝加功能）

| 想加什麼 | grep 這個 | 在 |
|---|---|---|
| 戰爭規則數字 | `WAR_` | War_Engine |
| 技能效果 | `WAR_SKILL_`（讀表三支 `warMul_`／`warAdd_`／`warFlag_`） | War_Engine |
| 敵人性格 | `WAR_TEMPER_` | War_Engine |
| 教會討伐令／決戰地點 | `WAR_BOUNTY_`／`WAR_FINAL_` | War_Engine |
| 種子角色 | `SEED_SERVANTS`／`SEED_MASTERS` | Seed_Codex |
| 兩場戰爭的陣容 | `FATE_5TH_ROSTER`／`FATE_4TH_ROSTER` | Seed_Rivals |
| 工房 | `WAR_FORGE_`／`WAR_FORGE_SKILLS_`／`FORGE_CLS_SKILLS_` | War_Forge |
| 分頁表頭 | `FATE_SHEET_DEFS` | Setup_FateWorld |
| 說書人提示詞 15 段（玩家可改的只有尺度＋篇幅） | `KANSHOU_STYLE_MODULES_`（`def` 是提示詞本體、不下傳前端） | Gallery |
| 鑑賞在場／同行上限 | `KANSHOU_PARTY_TAG_`／`KANSHOU_ONSTAGE_TAG_`／`KANSHOU_ONSTAGE_MAX_` | Gallery |
| 世界帳本 | `WORLD_SPEC_` | Gallery |
| dispatcher 行為 | `OWNERSHIP_CHECK_EXEMPT_`／`LOCK_EXEMPT_ACTIONS_`／`STATE_AFTER_ACTIONS` | Router_Action |

---

## §6 地雷（動手前掃一眼）

| 情境 | 坑 |
|---|---|
| 改 `Gallery.gs` 任何地方 | 動到 `nsfwBaseRules` 就走紅線①流程：先量現況、改完跑全套探針、確認原本正常的配對沒被改壞 |
| 刪／搬試算表欄位 | ⚠ COL 是位置索引，**寧棄用不刪** |
| 動 `.html` | CI **不驗** .html 內嵌 JS → 綠燈也可能壞 runtime，**只能靠 `bash check.sh`**；排版問題連它也看不到，要截圖看（見 PLAYBOOK『用瀏覽器真的看畫面』） |
| 加自由輸入欄位 | 後端**一定要自己設長度上限**，別信前端 `maxlength` |
| 前端拼 innerHTML | 一律 `escapeHtml()` |
| 同名函式 | GAS 把所有 .gs 串成一個檔，**後載入的同名函式會靜靜蓋掉前面的**——搬函式時舊的那份一定要刪 |
| 改共用函式簽名 | 先 §0「誰在用」掃全部呼叫端，並同步 `FUNCTION_MANUAL.md` 那一條 |
