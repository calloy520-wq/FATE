# CODE_MAP.md — 一頁式代碼地圖／動作清單

> **開工找路先看這份。** 只回答三個問題：**東西在哪／我要做 X 該動哪裡／加東西往哪張表加**。
> 逐函式細節查 `FUNCTION_MANUAL.md`；機制脈絡查 `SOLO_REFERENCE.md`／`KANSHOU_REFERENCE.md`；提示詞查 `AI_PROMPT_MAP.md`。
> 數字以 2026-07 實測為準（`wc -l` ＋ `grep -c "^function "`），**改動後順手更新這份**。

---

## 🚀 我要做 X → 動這裡（任務導向，最常用）

| 我想…… | 主要動這裡 | 同時必須改 | 別忘了 |
|---|---|---|---|
| **加一個新按鍵動作** | `Router_Action.gs` `ActionRouter` 加一列 ＋ 寫 handler | 前端 `Script.html` 加按鈕＋`gasRun({action:...})` | 若會改戰場→加進 `STATE_AFTER_ACTIONS`；純讀取/長 AI→考慮 `LOCK_EXEMPT_ACTIONS_`；鑑賞不該用→加進 `KANSHOU_BLOCKED_ACTIONS_` |
| **加一個從者技能效果(fx)** | `Engine_Fate.gs` `SKILL_FX_`（線性被動）或 `DEF_FX_`（減傷） | 開放給工房/AI 就加進 `Router_Creation.gs` `ALLOWED_FX_`＋`FX_MENU_` | 前端 `Script.html` `FX_DESC` 補說明；概念級要進 `CONCEPT_TIER` |
| **加一個起始禮裝** | `Mystic_Code.gs` `MYSTIC_CODES`＋`MC_COMBAT_` | 前端 `Script.html` 禮裝選單＋`FX_DESC` | 走 `injectMysticBuff_` 注 fx，**不要**另寫戰鬥特例 |
| **加一位種子英靈** | `Seed_Codex.gs` `SEED_SERVANTS` | 鑑賞要出場→`Gallery.gs` 住處/名冊常數 | `CODEX_PERSONA_VER` +1 才會重刷；日常版 4 格要手寫 |
| **加一個地圖地點** | solo：`Setup_FateWorld.gs` `FATE_MAP_SEED` ＋ `Script.html` `buildMapSvg_` 的 `LAYOUT` | 鑑賞：`Gallery.gs` `KANSHOU_LOCATIONS_`／`KANSHOU_REGIONS_` | solo 座標在前端 hardcode、**不吃試算表座標**，兩邊都要改 |
| **加一個 MEMORY 標記** | `Core_Settings.gs` 用 `makeIntTag_`/`makeTextTag_` 產 get/set/clear 一套 | 讀寫端 | 全形 `｜` 分隔；自由文字先過 `cleanTagText_` |
| **調戰鬥數值** | `Engine_Fate.gs`（命中/傷害/規模矩陣）、`Router_Battle.gs`（電池/超載/海怪） | — | `applyRegen_` 與 HUD `playerServantEconomy_` **必須同算式**，改一個要一起動 |
| **調鑑賞好感/尺度門檻** | `Gallery.gs` `KANSHOU_*_BOND_` 系列常數 | 前端 `Script_Kanshou.html` 鏡像常數 | 🔴 `nsfwBaseRules` 本體**不可改**，只能改天花板規則那段 |
| **加鑑賞小道具/催眠** | `Gallery.gs` `KANSHOU_PROPS_`／自訂道具目錄 | 前端 `Script_Kanshou.html` `KC_PROPS_` 鏡像 | 裝備卡 `KANSHOU_PROP_EQUIP_BOND_`；上限 `KANSHOU_PROP_EQUIP_CAP_` |
| **改提示詞** | 演出卡在 `Router_Persona.gs`；solo 敘事 `Router_Narrative.gs`；鑑賞 `Gallery.gs` | — | 先查 `AI_PROMPT_MAP.md`，改完更新它；🔴 show-don't-tell 不可破 |
| **改試算表欄位** | `Core_Settings.gs` `COL` ＋ `Setup_FateWorld.gs` `FATE_SHEET_DEFS` | 兩處**必須同步** | ⚠️ **COL 是位置索引，寧棄用不刪欄**（刪欄位移全表） |

---

## 📁 檔案地圖（24 檔・20,748 行・後端 403 函式）

### 後端 `.gs`

| 檔 | 行 | 函式 | 職責 | 何時要動它 |
|---|---|---|---|---|
| **Gallery.gs** | 3682 | 90 | 🌹 鑑賞全軌＋`actionPlay`＋🔴`nsfwBaseRules` | 動鑑賞任何一塊 |
| **Router_Battle.gs** | 1639 | 33 | 出戰主流程／`fateStrike_`／御主電池／海怪 | 改戰鬥流程、超載、參戰分擔 |
| **Router_Movement.gs** | 1434 | 31 | 地圖／移動／休息／偵查／陣地／突襲／敵營局面 | 改「在地圖上做的事」 |
| **Router_Creation.gs** | 932 | 20 | 創角／召喚／工房鑄造 | 改捏角、召喚、預算計價 |
| **Engine_Fate.gs** | 910 | 35 | 純數值戰鬥核心（D20／六圍／fx／寶具矩陣） | 調戰鬥公式、加 fx |
| **Router_Bond.gs** | 790 | 27 | 羈絆／令咒／結盟／示好／破戒奪僕 | 改人際互動機制 |
| **Core_Settings.gs** | 762 | 63 | 金鑰／模型／`COL`／公式／MEMORY 工廠／地理 | 加標記、改共用公式 |
| **Time_World.gs** | 684 | 21 | 世界時鐘／AP／`worldTick_` NPC 模擬 | 改世界自走、敵人行為 |
| **Router_Action.gs** | 664 | 12 | 🚪 總分流器：清洗→`ActionRouter`→鎖→`_state` | 加 action、改防護層 |
| **Seed_Codex.gs** | 507 | 7 | 英靈殿／御主殿種子 | 加角色 |
| **Router_Economy.gs** | 285 | 7 | 出力／魔境／符文／換裝武裝／補魔／修復 | 改從者設定類動作 |
| **Account.gs** | 282 | 10 | 帳號綁定／開新局／清理／🔒`verifyPcOwnership_` | 改帳號、歸屬驗證 |
| **Router_Persona.gs** | 265 | 11 | 🎭 演出卡（`servantCard_`／`masterCard_`） | 改角色演出依據 |
| **Seed_Rivals.gs** | 260 | 7 | 敵方陣營一次性鋪設 | 改敵人生成 |
| **Setup_FateWorld.gs** | 179 | 4 | 分頁建置／地圖種子 | 改表結構、地圖 |
| **Router_Narrative.gs** | 177 | 8 | solo 輕量敘事引擎／虛假之夢 | 改 solo 敘事 |
| **Engine_Combat.gs** | 136 | 2 | 🔧 兩軌共用 `callGeminiAPI`＋`doGet` | 改 API 呼叫本身 |
| **History_Sync.gs** | 115 | 7 | 對話歷史寫入／軌跡摘要 | 改歷史保留策略 |
| **Mystic_Code.gs** | 106 | 8 | 禮裝被動化 | 加/改禮裝 |

### 前端 `.html`

| 檔 | 行 | 函式 | 職責 |
|---|---|---|---|
| **Script.html** | 3195 | 133 | solo SPA 核心（通訊／狀態面板／戰爭行動／地圖／戰報） |
| **Script_Kanshou.html** | 1758 | 90 | 🌹 鑑賞 SPA |
| **Script_Onboarding.html** | 878 | 51 | 開局（登入／創角／召喚／工房） |
| **Style.html** | 629 | — | 樣式 |
| **Index.html** | 479 | — | 載入殼＋雙軌主選單 |

---

## 🎬 全 65 個 action 對照表

> `handleGameAction` → 清洗 → 查表 → 🔒歸屬驗證 → 鑑賞擋牆 → 鎖 → handler → 14 日攔截 → 夾 `_state`

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
| narrate_only | actionNarrateOnly | Router_Narrative | | faction_ambush | actionFactionAmbush | Router_Movement |
| dev_resync_codex | actionDevResyncCodex | Seed_Codex | | incite | actionIncite | Router_Movement |

**🌹 鑑賞專屬（全在 `Gallery.gs`）**：`play`→actionPlay｜`enter_kanshou`｜`backfill_kanshou_ai`｜`kanshou_companions`｜`kanshou_summon_hero`｜`kanshou_memoir_op`｜`kanshou_set_sex`／`_set_name`／`_set_home_name`｜`kanshou_set_prop`｜`kanshou_add_custom_prop`／`_delete_custom_prop`｜`kanshou_cast_hypnosis`｜`kanshou_add_quick_phrase`／`_delete_quick_phrase`｜`get_album`｜`album_delete`

---

## 📊 資料驅動表索引（加東西＝往表加一列，引擎自動吃）

| 表 | 位置 | 加一列＝ |
|---|---|---|
| `SKILL_FX_` | Engine_Fate:274 | 新增線性被動/主動技能效果 |
| `DEF_FX_` | Engine_Fate:374 | 新增減傷類防禦效果 |
| `DEF_SCALE_` / `NP_SCALE_MATRIX` | Engine_Fate:134 / 115 | 寶具規模對抗關係 |
| `CONCEPT_TIER` | Engine_Fate:30 | 概念階級（決定貫穿判定） |
| `MYSTIC_CODES` / `MC_COMBAT_` | Mystic_Code:8 / 34 | 新禮裝 |
| `SEED_SERVANTS` / `SEED_MASTERS` | Seed_Codex:12 / 275 | 新種子角色 |
| `FATE_MAP_SEED` | Setup_FateWorld:33 | 新 solo 地點 |
| `FATE_SHEET_DEFS` | Setup_FateWorld:10 | 新分頁/欄位 |
| `FORGE_CLS_SKILLS_` | Router_Creation:486 | 職階自動附贈技能 |
| `ALLOWED_FX_` / `FX_MENU_` | Router_Creation:260 / 277 | 開放給工房的 fx |
| `SKILL_PTS_` 系列 / `FLAT_FX_` | Router_Creation:418~426 | 工房計價 |
| `FACTION_ENCOUNTER_CHOICES_` | Router_Movement:812 | 敵營局面開放的選項 |
| `OUTPUT_TIERS_` / `RUNE_MODES_` | Core_Settings:173 / 213 | 出力檔位／符文模式 |
| `STANCE_SHARE_` | Router_Battle:371 | 御主參戰風格 |
| `KANSHOU_LOCATIONS_` / `_REGIONS_` | Gallery:1169 / 1122 | 鑑賞地圖 |
| `KANSHOU_SCENE_EVENTS_` 等橋段表 | Gallery:1273 / 1396 / 1405 | 鑑賞橋段 |
| `KANSHOU_PROPS_` / `_PROP_LEVELS_` | Gallery:1779 / 1780 | 鑑賞小道具 |
| `KANSHOU_FESTIVALS_` / `_TIME_BANDS_` | Gallery:1576 / 1617 | 節慶／時段 |
| `KANSHOU_REL_TIER_` | Gallery:285 | 關係五階門檻 |

**四張 dispatcher 旗標表**（`Router_Action.gs`）：`OWNERSHIP_CHECK_EXEMPT_`(245)／`LOCK_EXEMPT_ACTIONS_`(250)／`STATE_AFTER_ACTIONS`(264)／`KANSHOU_BLOCKED_ACTIONS_`(280)

---

## ⚠️ 動手前 checklist

1. 🔴 **`Gallery.gs` 的 `nsfwBaseRules` 不可改** — 改鄰近處後 `git diff -- gas/Gallery.gs | grep nsfwBaseRules` 須逐行核對 0 改動
2. 🔴 **show-don't-tell** — 敘事禁直述 願望／個性／萌點 字面
3. 🔴 **只在 `claude/traditional-chinese-chat-q8ptho` 開發**；push ≠ 上線，要玩家看到須另觸發 workflow_dispatch
4. 🔴 **model id 不進 repo**
5. ✅ 改完必跑 `bash check.sh`（CI 不驗 .html 內嵌 JS，**這是唯一防線**）
6. ⚡ 守住每按鍵 3→1 round-trip：`_state` 夾帶／整表只讀一次下傳／`preData` 交棒
7. 🧩 能查表就別寫 if 鏈；能複用引擎就別加特例
8. 📝 改完順手更新 `SOLO_REFERENCE.md`／`KANSHOU_REFERENCE.md`／`FUNCTION_MANUAL.md`／**這份**

---

## 🧹 現況體檢（2026-07）

- **死碼**：全 403 個後端函式掃過，**只有 `removeAllTriggers` 無呼叫點**（刻意保留的編輯器手動工具，非死碼）。
- **action 覆蓋**：65 個註冊 action **全部**有真實 handler、且全部可從前端到達（`set_mage_realm`／`set_rune_mode` 走 `pickSelectable(action,...)` 動態帶入）。
- **連續 3 輪稽核乾淨**收斂（XSS 渲染／COL 索引一致性／武器關鍵字／超載令咒／種子完整性／快取失效），詳見 `SOLO_REFERENCE.md` §25。
