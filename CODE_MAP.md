# CODE_MAP.md — 工作台（給 Claude 自己用）

> **這份是操作手冊不是說明書。** 開工先讀這份 → 照 §1 挑任務 → 用 §2 的 grep 跳到位置 → 抄 §3 樣板 → 跑 §0 收尾。
> 🔒 **一律用 grep 錨點定位，本檔刻意不寫行號**（行號一改就騙人；函式名／常數名才是穩定錨）。
> 細節：逐函式 `FUNCTION_MANUAL.md`｜機制 `SOLO_REFERENCE.md`／`KANSHOU_REFERENCE.md`｜提示詞 `AI_PROMPT_MAP.md`

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

# 🔴 紅線核對（必須 exit 1 ＝ 沒動到）
git diff -- gas/Gallery.gs | grep -E "^[+-]" | grep -v "^+++\|^---" | grep -i "nsfwBaseRules"; echo "exit:$?"

# 死碼掃描（全 403 函式，正常應只吐 removeAllTriggers）
grep -hoE "^function [A-Za-z0-9_]+" gas/*.gs | sed 's/function //' | sort -u | while read f; do
  [ "$(grep -rhoE "\b${f}\b" gas/ | wc -l)" -le 1 ] && echo "$f"; done; true   # ← true 收尾，否則末次判偽會吐 exit 1
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

> 每條格式：**跳到哪（grep）→ 改什麼 → 連帶必改 → 收尾更新哪份文件**

### 加一個新按鍵動作
1. `grep -n "ActionRouter" gas/Router_Action.gs` → 加一列 `"action名": handlerFn,`
2. 寫 handler：簽名固定 `(userData, pcId, sheets)`，回 `JSON.stringify({...})`（抄 §3.1）
3. 前端 `Script.html` 加按鈕 → `gasRun({action:'...', pcId:pc.id, ...})`（`acctName` 由 `gasRun` 自動補，別手動加）
4. **四張旗標表評估**（`grep -n "OWNERSHIP_CHECK_EXEMPT_\|LOCK_EXEMPT_ACTIONS_\|STATE_AFTER_ACTIONS\|KANSHOU_BLOCKED_ACTIONS_" gas/Router_Action.gs`）：
   - 會改 solo 戰場 → 進 `STATE_AFTER_ACTIONS`（省 round-trip）
   - 純讀取／長 AI 呼叫 → 進 `LOCK_EXEMPT_ACTIONS_`
   - 鑑賞不該用 → 進 `KANSHOU_BLOCKED_ACTIONS_`
   - 無 pcId 或不涉個別玩家列 → 進 `OWNERSHIP_CHECK_EXEMPT_`（**其餘一律不加，讓中央驗證擋**）
5. 📝 `FUNCTION_MANUAL.md`（ActionRouter 表＋函式條目）、`SOLO_REFERENCE.md` §3 或 `KANSHOU_REFERENCE.md`、本檔 §4

### 加從者技能效果（fx）
1. `grep -n "SKILL_FX_\|DEF_FX_" gas/Engine_Fate.gs` → 線性被動進 `SKILL_FX_`、減傷進 `DEF_FX_`
2. 概念級（能貫穿防禦）→ 同檔 `CONCEPT_TIER` 也要加
3. 開放給工房/AI → `grep -n "ALLOWED_FX_\|FX_MENU_" gas/Router_Creation.gs` 兩張都加
4. 前端說明 → `grep -n "FX_DESC" gas/Script.html`
5. ⚠ **別在 `resolveFateBattle_` 寫 if 特例**——查表才是慣例
6. 📝 `SOLO_REFERENCE.md` §4

### 加禮裝
`grep -n "MYSTIC_CODES\|MC_COMBAT_" gas/Mystic_Code.gs` → 兩張表各加一列 → 前端 `FX_DESC`
⚠ 走 `injectMysticBuff_` 注 fx 進既有引擎，**不新增戰鬥分支**

### 加種子英靈
`grep -n "SEED_SERVANTS" gas/Seed_Codex.gs` → 加一筆（日常版 4 格 dailyLook/Words/Moe/Outfit 要手寫）
→ `grep -n "CODEX_PERSONA_VER" gas/Seed_Codex.gs` **版本號 +1**（不改不會重刷）
→ 鑑賞要出場：`grep -n "KANSHOU_HERO_HOME_\|KANSHOU_STARTER_IDS_" gas/Gallery.gs`

### 加地點
- solo：`grep -n "FATE_MAP_SEED" gas/Setup_FateWorld.gs` **＋** `grep -n "LAYOUT" gas/Script.html`
  ⚠ **前端座標是 hardcode、不吃試算表**，只改一邊會出現「地圖上沒有但選單有」
- 鑑賞：`grep -n "KANSHOU_LOCATIONS_\|KANSHOU_REGIONS_" gas/Gallery.gs`

### 加 MEMORY 標記
`grep -n "makeIntTag_\|makeTextTag_" gas/Core_Settings.gs` → 用工廠產一套 get/set/clear（抄 §3.4）
⚠ 分隔符是**全形 ｜**；自由文字必過 `cleanTagText_(s, maxLen)`
📝 `SOLO_REFERENCE.md` §11 標記表／`KANSHOU_REFERENCE.md` 標記表

### 調戰鬥數值
`Engine_Fate.gs`（命中/傷害/`NP_SCALE_MATRIX`）｜`Router_Battle.gs`（電池/超載/海怪）
⚠ **`applyRegen_` 與 HUD `playerServantEconomy_` 必須同算式**，改一個一定要一起改（`grep -rn "applyRegen_\|playerServantEconomy_" gas/`）

### 改鑑賞好感／尺度門檻
`grep -n "KANSHOU_.*_BOND_\|KANSHOU_REL_TIER_" gas/Gallery.gs` → 前端 `Script_Kanshou.html` 鏡像常數同步
🔴 **`nsfwBaseRules` 本體不可改**，只能改天花板規則那段

### 改提示詞
演出卡 `Router_Persona.gs`｜solo 敘事 `Router_Narrative.gs`｜鑑賞 `Gallery.gs`
📝 **先查 `AI_PROMPT_MAP.md`、改完更新它**；🔴 show-don't-tell 不可破

### 改試算表欄位
`grep -n "^const COL" gas/Core_Settings.gs` **＋** `grep -n "FATE_SHEET_DEFS" gas/Setup_FateWorld.gs` 兩處同步
⚠⚠ **COL 是位置索引，只能在尾端加、寧棄用不刪欄**（刪欄位移全表 → 全部讀寫錯位且不會報錯）

---

## §2 大檔導航（符號依序，grep 錨點跳）

### `Gallery.gs`（3682 行・90 函式・最大檔）依序七區
| 區 | 起點錨（grep 這個） | 內容 |
|---|---|---|
| ① 資料層 | `sanitizeAiData_` | 帳號綁定／`kanshouPcIdx_`／鑑賞眾生表／日常版轉換 |
| ② 關係 | `KANSHOU_REL_TIER_` | 五階／好感天花板／`kanshouProposalAccepts_` |
| ③ handlers | `actionKanshouSummonHero` | 全部 `kanshou_*` action（召喚/貼圖/回憶/改名） |
| ④ 🔴禁區 | `buildDefaultSystemPrompt` | **`nsfwBaseRules` 在這裡，不可改** |
| ⑤ 常數大宗 | `KANSHOU_REGIONS_` | 地圖／橋段／住處／時間曆法／約定／道具／相簿／天氣／別名 |
| ⑥ 引擎 | `actionPlay` → `actionPlay_` | 🔥 **~1440 行巨獸**，鑑賞單回合全部意圖都在裡面 |
| ⑦ 相簿 | `actionGetAlbum` | 讀／刪（拍照本體在 ⑥） |

### `Script.html`（3195 行・133 函式）依序
`escapeHtml`（🔒唯一逃逸helper）→ `gasRun`/`beginAction`（通訊層）→ 全域狀態（`pc`/`myServants`/`myActiveServant`）→ `updateClock`/`updateEconomy`（HUD）→ `renderEncounterBubbles`/`renderWarActions`（戰爭行動列）→ `promptRetreat`/`retreatTo`/`travelTo`（移動撤退）→ `openFateEdit`（逆天改命）→ `FX_DESC`/`TRAIT_DESC`/`show*Desc`（說明 popup）→ `buildSvCard`（從者卡）→ `STANCES`/`setStance`（參戰風格）→ `refreshMapPane`/`buildMapSvg_`＋`LAYOUT`（地圖）→ `renderFateBattleReport`（戰報）→ `openNpReleasePicker`/`pickNpAndStrike`（寶具）→ `openOutfitPicker_`/`openMageRealmPicker`/`openRunePicker`（設定類）→ `openBondMenu`/`openSealMenu` → `openTigerDojo`（道場）→ `applyClientState`/`applyModeUI`（總開關）

---

## §3 必抄樣板（別重新發明）

**§3.1 handler 骨架**
```js
function actionXxx(userData, pcId, sheets) {
  var pcData = sheets.pc.getDataRange().getValues();          // 整表只讀一次
  var pIdx = pcData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
  if (pIdx === -1) return JSON.stringify({ success: false, message: "查無御主" });
  var gameId = String(pcData[pIdx][COL.PC.GAME_ID] || "");
  if (gameId.indexOf("g_") !== 0) return JSON.stringify({ success: false, message: "此刻無法行動。" });
  // …改 pcData（記憶體）…
  sheets.pc.getRange(1,1,pcData.length,pcData[0].length).setValues(pcData); // 收尾一次寫回
  STATE_PRE_DATA_ = pcData;                                   // 交棒，dispatcher 夾 _state 免重讀
  return JSON.stringify({ success: true, /* … */ });
}
```
> 歸屬驗證**不用自己寫**——dispatcher 已統一跑 `verifyPcOwnership_`。

**§3.2 扣 AP**（取代手刻門檻檢查）
```js
var apr = chargeApOrReject_(gameId, 1, pcData, sheets, "行動力不足。", { isFate: true, skipWrite: true });
if (apr.reject) return JSON.stringify(apr.reject);   // ⚠ 沒前置 guard 就一定要檢查這個
var ap = apr.ap, clock = apr.clock;
```
`skipWrite:true` ＝後面還有整表寫回時用（避免同列兩次 I/O）。

**§3.3 找我方從者／找某人**
```js
var svIdx = findPlayerServantIdx_(pcData, gameId, userData.servant, userData.servantId); // id優先·尊重玩家選的那位
var idx   = findPcRowIdx_(pcData, gameId, { id, name, faction:"從者", loc:curL, excludeIdx:pIdx });
```

**§3.4 MEMORY 標記**
```js
var XXX_TAG_ = makeIntTag_('標記名', 0);     // 或 makeTextTag_('標記名')
XXX_TAG_.get(memory) / .set(memory, val) / .strip(memory)
// 自由文字先洗：cleanTagText_(str, maxLen)  → 剝 ｜【】\n\r\t
```

**§3.5 卸防突襲**（休息/羈絆/結盟/補魔/修復都用同一支）
```js
var ambush = enemyAmbushOnServant_(sheets, pcData, pIdx, gameId, 1.3, svIdx); // ← 第6參數傳已解析的從者
var prompt = ambushDispatchPrompt_(ambush, function(a){ /*被打斷*/ }, function(){ /*正常*/ });
```

**§3.6 批次寫回**（一次動作內多次寫入時）
```js
BATTLE_DEFER_WRITE_ = true;      // worldTick_/refillMastersDaily_/breakStaleAlliances_ 改記憶體
try { /* …多個子系統… */ } finally { BATTLE_DEFER_WRITE_ = false; }
sheets.pc.getRange(...).setValues(allPcData);   // 收尾一次寫完
```

---

## §4 全 62 action → handler → 檔

| action | handler | 檔 | | action | handler | 檔 |
|---|---|---|---|---|---|---|
| check_name | actionCheckName | Router_Action | | set_servant_output | actionSetServantOutput | Router_Economy |
| check_sheets | actionCheckSheets | Setup_FateWorld | | set_mage_realm | actionSetMageRealm | Router_Economy |
| account_login | actionAccountLogin | Account | | set_rune_mode | actionSetRuneMode | Router_Economy |
| account_new_game | actionAccountNewGame | Account | | outfit | actionSetOutfit | Router_Economy |
| end_run | actionEndRun | Account | | weapon | actionSetWeapon | Router_Economy |
| purge_orphans | actionPurgeOrphans | Account | | mana_supply | actionManaSupply | Router_Economy |
| create | actionManualNpc | Router_Creation | | spirit_repair | actionSpiritRepair | Router_Economy |
| backfill_master_ai | actionBackfillMasterAi | Router_Creation | | bond | actionBond | Router_Bond |
| summon_servant | actionSummonServant | Router_Creation | | use_seal | actionUseSeal | Router_Bond |
| get_heroes | actionGetHeroes | Router_Creation | | rule_break_steal | actionRuleBreakSteal | Router_Bond |
| get_masters | actionGetMasters | Router_Creation | | propose_alliance | actionProposeAlliance | Router_Bond |
| save_hero | actionSaveHero | Router_Creation | | break_alliance | actionBreakAlliance | Router_Bond |
| claim_hero | actionClaimHero | Router_Creation | | ally_bond | actionAllyBond | Router_Bond |
| fate_battle | actionFateBattle | Router_Battle | | court_enemy | actionCourtEnemy | Router_Bond |
| summon_horror_beast | actionSummonHorror | Router_Battle | | move | actionMove | Router_Movement |
| dismiss_horror_beast | actionDismissHorror | Router_Battle | | rest | actionRest | Router_Movement |
| get_tags | actionGetTags | Router_Action | | scout | actionScout | Router_Movement |
| sync | actionSync | Router_Action | | scavenge | actionScavenge | Router_Movement |
| get_full_status | actionGetFullStatus | Router_Action | | set_workshop | actionSetWorkshop | Router_Movement |
| update_fate | actionUpdateFate | Router_Action | | prep_meal | actionPrepMeal | Router_Movement |
| update_rel_tag | actionUpdateRelTag | Router_Action | | second_wind | actionSecondWind | Router_Movement |
| kanshou_set_nickname | actionSetNickname | Router_Action | | get_map_nodes | actionGetMapNodes | Router_Movement |
| narrate_only／tiger_dojo | actionNarrateOnly／actionTigerDojo | Router_Narrative | | faction_ambush | actionFactionAmbush | Router_Movement |
| dev_resync_codex | actionDevResyncCodex | Seed_Codex | | incite | actionIncite | Router_Movement |

**🌹 全在 `Gallery.gs`**：`play`(→`actionPlay_`)｜`enter_kanshou`｜`backfill_kanshou_ai`｜`kanshou_companions`｜`kanshou_summon_hero`｜`kanshou_memoir_op`｜`kanshou_set_sex`／`_set_name`／`_set_home_name`｜`kanshou_add_quick_phrase`／`_delete_quick_phrase`｜`get_album`｜`album_delete`

---

## §5 資料驅動表（加一列＝加功能）

| 想加什麼 | grep 這個 | 在 |
|---|---|---|
| 技能效果 | `SKILL_FX_` / `DEF_FX_` / `CONCEPT_TIER` | Engine_Fate |
| 寶具規模對抗 | `NP_SCALE_MATRIX` / `DEF_SCALE_` | Engine_Fate |
| 禮裝 | `MYSTIC_CODES` / `MC_COMBAT_` | Mystic_Code |
| 種子角色 | `SEED_SERVANTS` / `SEED_MASTERS` | Seed_Codex |
| solo 地點／分頁 | `FATE_MAP_SEED` / `FATE_SHEET_DEFS` | Setup_FateWorld |
| 工房職階技能／計價／可用fx | `FORGE_CLS_SKILLS_` / `SKILL_PTS_` / `ALLOWED_FX_` | Router_Creation |
| 敵營局面選項 | `FACTION_ENCOUNTER_CHOICES_` | Router_Movement |
| 出力檔／符文／參戰風格 | `OUTPUT_TIERS_` / `RUNE_MODES_` / `STANCE_SHARE_` | Core_Settings / Router_Battle |
| 鑑賞地圖／橋段／道具／節慶／關係階 | `KANSHOU_LOCATIONS_` `KANSHOU_SCENE_EVENTS_` `KANSHOU_PROPS_` `KANSHOU_FESTIVALS_` `KANSHOU_REL_TIER_` | Gallery |
| 鑑賞橋段觸發(四層) | `KANSHOU_FESTIVAL_EVENTS_`(節慶) `KANSHOU_LOCATION_EVENTS_`(地點×時段) `KANSHOU_COHABIT_EVENTS_`(同居日常·最低優先) | Gallery |
| 鑑賞「第一次」／關係質變 | `kanshouStampFirst_`(加蓋戳點) `kanshouRelTierLabel_`(階數→階名) | Gallery |
| dispatcher 行為 | `OWNERSHIP_CHECK_EXEMPT_` `LOCK_EXEMPT_ACTIONS_` `STATE_AFTER_ACTIONS` `KANSHOU_BLOCKED_ACTIONS_` | Router_Action |

---

## §6 地雷（動手前掃一眼）

| 情境 | 坑 |
|---|---|
| 改 `Gallery.gs` 任何地方 | 🔴 事後必跑 §0 紅線指令；`nsfwBaseRules` 0 改動 |
| 刪／搬試算表欄位 | ⚠ COL 是位置索引，**寧棄用不刪**；死欄 `MONEY/UPKEEP_WEEK/ROOM` 是刻意留的佔位 |
| 動 `.html` | CI **不驗** .html 內嵌 JS → 綠燈也可能壞 runtime，**只能靠 `bash check.sh`** |
| 加自由輸入欄位 | 後端**一定要自己設長度上限**，別信前端 `maxlength`；並過 `cleanTagText_`／`｜【】` 清洗 |
| 前端拼 innerHTML | 一律 `escapeHtml()`（跨玩家可見文字尤其） |
| 名字比對 | 用 `nameLoose_`／`findPcRowIdx_`，**別用 `includes()`**（真名互為前綴會選錯人，踩過3次） |
| 加 Sheets 寫入 | 先問「這一列這次動作已經寫過了嗎」→ 用 `skipWrite`／`BATTLE_DEFER_WRITE_` 併成一次 |
| 雙從者相關 | 一律 `findPlayerServantIdx_` 拿玩家實際選的那位，**別預設取第一個** |
| god_hand/survive | severed ＝看**攻擊方**的破階 fx（不是自己的），方向搞反過3次 |
| 改共用函式簽名 | 先 §0「誰在用」掃全部呼叫端，並同步 `FUNCTION_MANUAL.md` 那一條 |

---

## §7 現況（2026-07）

- 24 檔・後端 406 函式・62 action
- **死碼 0**（僅 `removeAllTriggers` 無呼叫點＝刻意保留的編輯器手動工具）
- 62 action 全部有真實 handler 且皆可從前端到達（`set_mage_realm`/`set_rune_mode` 走 `pickSelectable(action,…)` 動態帶入）
- 連續 3 輪稽核乾淨收斂 → `SOLO_REFERENCE.md` §25
- `full`（九州全模擬）停用中；兩軌皆無經濟/生活層、無戰記/排行榜
