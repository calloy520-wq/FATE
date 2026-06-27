# 命運停駐之夜 — 引擎交接說明（給融合方案視窗）

> ⚠️ **provenance（重要）**：本檔描述的是**「GAS 後端開發視窗」自己那一版**的實作
> （單檔分層：`gas/Engine.gs` / `Config.gs` / `Game.gs` / `LLM.gs` / `SeedData.gs` / `index.html`）。
> 此版本**已被 main 上的「九州引擎 × Fate 融合版」整個重構取代**
> （main 現為 `Engine_Combat.gs` / `Engine_Fate.gs` / `Router_Action.gs` / `Script.html`… 的新架構，
> 原本的 `Engine.gs`/`Game.gs`/`index.html` 已不存在於 main）。
>
> 因此本檔的**檔名與行號對 main 已失效**，但其中的**公式、常數、設計決策、
> 以及「哪些標籤其實沒接線」這類技術債分析**仍有參考價值——
> 可用來和融合版交叉比對，確認該版有沒有把這些機制補上或改掉。
>
> 目的：讓融合視窗不必重讀本視窗的舊碼，即可掌握**戰鬥算法、素質分配、標籤(fx)處理**
> 在本視窗版本中的具體公式與不一致點。

---

## 0. 一句話架構

- **GAS（Google Apps Script）= 唯一權威**，算好所有數字（HP / 魔力 / 勝負 / 經濟）。
- **AI（OpenRouter / Gemini）只負責敘述與抽取記憶**，鐵則：不得更動任何數字或勝負。
- **Google Sheets 當資料庫**：靜態定檔（英靈殿/御主殿/地圖/戰爭/規則/道具）＋動態存檔（帳號/戰場/記憶/事件/時鐘/歷史）。
- 數值層 `Engine.gs` **不碰試算表 I/O**：輸入狀態物件 → 輸出結果物件。融合時這是最該優先複用/重寫的核心。

---

## 1. 素質分配（數值推導）

### 1.1 六維與階級數值化
六維固定為：`筋力 / 耐久 / 敏捷 / 魔力 / 幸運 / 寶具`，值為階級字串 `E D C B A (EX)`，可帶 `+`。

階級 → 數值（`Config.gs` `RANK_BASE` + `rankVal()`）：

| 階級 | E | D | C | B | A | EX |
|---|---|---|---|---|---|---|
| 基值 | 10 | 20 | 30 | 40 | 50 | 60 |

- 每一個 `+` → **+5**（例：`A+` = 55，`A++` = 60）。
- `-` / `?` / 空 → **回傳 15**（介於 E、D 之間的保底）。
- 程式：`rankVal('A+')` = `RANK_BASE['A'] + 5` = 55。

### 1.2 由六維推導的衍生值（`Engine.gs deriveServant_`）
```
HP上限   = rankVal(耐久) * HP_K(3)  + HP_BASE(50)
MP上限   = rankVal(魔力) * MP_K(2)  + MP_BASE(40)
維持費/h = round( (筋力+耐久+敏捷+魔力)/UPKEEP_DIV(10) + 寶具/UPKEEP_DIV(10) )
          ※ 若有 fx 'mad' 或技能名含「狂化」→ 維持費 × MAD_MULT(1.5)
```
舉例（Saber 阿爾托莉雅，耐久 B=40、魔力 A=50）：
- HP = 40*3+50 = **170**；MP = 50*2+40 = **140**。

舉例（Berserker 赫拉克勒斯，筋耐敏 A=50、魔力 B=40、寶具 B=40，狂化）：
- 維持 = round((50+50+50+40)/10 + 40/10) = round(19+4)=23 → ×1.5 = **約 35**。

### 1.3 AI 生成英靈的夾值（`LLM.gs sanitizeHero_` / `cleanSkill_`）
真名召喚 / 自訂英靈時，AI 產 JSON 後**強制夾值**防止破壞平衡：
- 六維上限 **A**（EX→A，去掉 `+`）；寶具上限 **A+**（EX→A+）。
- `classSkills` ≤ **3** 個、`skills` ≤ **4** 個、`traits` ≤ **3** 個。
- 技能名 ≤ 8 字、階級只留 `[EDCBAX+]`、fx 必須在白名單內否則清空。

> ⚠ 不一致點（重要）：**種子英靈用了許多白名單外的 fx**（見 §3.4），
> AI 生成的英靈卻被限制在白名單內。融合時要統一 fx 詞表。

---

## 2. 戰鬥算法

有**兩套**戰鬥，務必分清楚：

### 2.1 玩家戰鬥 `Engine.gs resolveCombat_(A, B, mode)`（完整、含標籤）

`mode`：`false` 普通 ｜ `'np'` 寶具(耗魔) ｜ `'seal'` 令咒必中 ｜ `'sealnp'` 令咒寶具。

**(a) 開場特殊招（僅 mode 為真時）**
```
isNP = (mode==='np' || mode==='sealnp')
傷害 d = isNP ? round(rankVal(寶具)*1.6)+18
             : round(rankVal(筋力)*1.8)+25      // seal 物理必殺
B.hp -= d   // 開場先對 B 打一發；isNP 觸發 tag「寶具解放」
```

**(b) 每回合對拼 `strike(att, def)`**
```
命中 hit   = rankVal(att.敏捷) + d20()
迴避 dodge = rankVal(def.敏捷) + d20()
若 def 有 fx 'evade_ranged' → dodge += 6（tag「避矢加護」）
若 hit <= dodge → 閃避（無傷）
否則：
  傷害 dmg = max(3, rankVal(att.筋力) + rand(0..8) - floor(rankVal(def.耐久)/2))
  若 att 有 fx 'burst'                → dmg = round(dmg*1.2)（tag「魔力放出」）
  若 def.traits 含「神性」且 att 技能名含「神殺」 → dmg *= 2（tag「神殺」）
  def.hp -= dmg
```

**(c) 回合循環**
```
while A.hp>0 && B.hp>0 && round<14:
   敏捷高者先手（相等 → A 先）；先手打完若對方未死，後手反擊
```

**(d) 耗魔（mpCost）**
```
mpCost = round(mpMax * COMBAT_MP(0.12))
若 mode==='np'        → 再 + round(mpMax * NP_MP(0.35))
若 mode==='seal'/'sealnp' → mpCost = 0（令咒供能免費）
```

**(e) 勝負**
```
B.hp<=0 && A.hp>0 → 'A'
A.hp<=0 && B.hp>0 → 'B'
其餘             → 'draw'
回傳 { beats[逐拍文字], firedTags[], winner, aHp, bHp, mpCost }
```

> 設計後果：玩家點一次「攻擊」= **一次打到分出勝負（最多 14 回合）**，
> 不是單拍。配合本視窗新增的「攻擊只能打同地敵人」(§5)，避免了「沒看到人就秒殺」。
> 玩家從者 HP 歸 0 → 觸發死亡結局（不再保留 1 HP）。

### 2.2 NPC 之間的小衝突 `Game.gs npcSkirmish_(a, b)`（簡化、無標籤）
NPC 互毆用的是**另一套**低致命公式，**不讀任何 fx/寶具**：
```
hit = max(2, round( (rankVal(att.筋力) + rand(0..8) - floor(rankVal(def.耐久)/2)) * 0.7 ))
fast = att.敏捷 >= def.敏捷
跑 3 回合互毆，HP 歸 0 才死
```
- 由 `npcTick_` 觸發，**每 tick 最多一場**、開戰機率 30%、結盟 15%（目前結盟只發傳聞、無實際效果）。
- §4 已加：**同陣營不互毆**（同御主 或 正典同盟組，如美狄亞+佐佐木）。

> ⚠ 融合重點：兩套戰鬥邏輯分裂。若要讓 NPC 戰鬥也吃標籤/寶具，
> 需把 `npcSkirmish_` 併入 `resolveCombat_`（或讓它呼叫同一核心）。

---

## 3. 標籤 / fx 處理

### 3.1 資料形狀
每個技能物件：`{ n:技能名, r:階級, fx:效果碼 }`。
特性物件：`{ n:特性名, r?:階級 }`（如 `{n:'神性',r:'A'}`）。

### 3.2 查詢輔助（`Engine.gs`）
```
hasFx_(sv, fx)        // classSkills+skills 任一 s.fx === fx
hasSkillName_(sv, n)  // 任一技能名 indexOf(n) >= 0
hasTrait_(sv, t)      // traits 任一名稱 indexOf(t) >= 0
```

### 3.3 **目前真正影響數值的標籤只有 4 個**
| 效果 | 觸發條件 | 作用 | 位置 |
|---|---|---|---|
| `evade_ranged` | 防禦方擁有 | 迴避 +6 | strike() |
| `burst` | 攻擊方擁有 | 傷害 ×1.2 | strike() |
| 神性 + 神殺 | def 特性「神性」且 att 技能名含「神殺」 | 傷害 ×2 | strike() |
| `mad` / 名含「狂化」 | 擁有 | 維持費 ×1.5 | deriveServant_ |
| `solo`（單獨行動）/ 名含「單獨行動」 | 擁有 | 分離供給減免（經濟，非戰鬥） | economyNet_ via Game.playerEconomy_ |

### 3.4 ⚠ 「裝飾用 / 尚未接線」的 fx（重大技術債）
種子英靈帶了大量 fx，但**戰鬥/經濟程式碼根本沒讀**，目前純粹是文字：
`nullify_magic`(對魔力)、`ride`(騎乘)、`territory`(陣地)、`crafting`(道具)、
`first_strike`(直感)、`analyze`(心眼)、`divine`(神性技能)、`morale`(卡里斯瑪/勇猛)、
`survive`(戰鬥續行)、`stealth`(氣息遮斷)、`aim`(千里眼)、`projection`(投影)、
`rune`(符文)、`str_up`(怪力)、`divine_core`(神核)、`petrify`(魔眼)、`fast_cast`(高速神言)、`wealth`(黃金律)…

- 特別注意：連 **`nullify_magic`（對魔力）目前在 `resolveCombat_` 完全沒作用**——
  世界規則寫了「現代魔術無法傷害有對魔力者」，但戰鬥公式沒實作這條。
- AI 白名單（`LLM.gs FX_OK_`）只有 13 個：
  `nullify_magic, evade_ranged, stealth, ride, territory, crafting, mad, first_strike, analyze, burst, divine, morale, survive`
  → 種子用到的 `aim/projection/rune/str_up/divine_core/petrify/fast_cast/wealth` 不在白名單內。

> **融合方案最該處理的就是這塊**：定一份**單一權威 fx 詞表**，
> 明確每個 fx 在「玩家戰鬥 / NPC 戰鬥 / 經濟 / 敘述」各自的數值效果，
> 然後讓種子資料、AI 白名單、戰鬥引擎三者對齊。

---

## 4. 經濟系統（每小時 tick）

`Engine.gs economyNet_(p)`：
```
御主供給 ms = round(circuits * SUPPLY_FACTOR(0.5))
  若分離 separated → ms *= (有 solo ? SEP_SOLO(0.85) : SEP_PENALTY(0.5))
靈脈 ley = LEYLINE[該地]   // 高10 / 中5 / 低2
工房 ws  = Caster 主場 ? WORKSHOP(8) : 0
淨值 net = ms + ley + ws - upkeep
```
推進時間 `Game.gs advanceTime_`：每 AP = `HOURS_PER_AP(2)` 小時；每小時：
```
sv_mp += net（夾在 0..mpMax）
若 sv_mp<=0 → sv_hp -= 3（魔力枯竭傷血）
否則若未滿 → sv_hp += round(rankVal(耐久)*HP_REGEN_K(0.1))   // 緩回血
```
平衡參考：迴路 30 的一般御主養 Berserker（維持 35）在低靈脈會**赤字**（net 約 -18）→ 逼玩家搶靈脈/補魔/設工房。伊莉雅迴路 70 可勉強供養。

---

## 5. 戰爭迷霧 / 發現系統（本視窗新增）

- `戰場(BATTLE)` 新增欄位 `discovered`（JSON 陣列，存玩家**已發現的 slot**）。
  → **改了 schema，需重跑 `setupDatabase()` 補欄位。**
- `getState` 的 roster 對每個從者算 `known`：`是玩家 || slot in discovered || 此刻與玩家從者同地`。
  未知者只回 `cls:'？'、master:'？？？'、location:''`。
- 發現來源：移動抵達該地、NPC 上門、交戰、或用**偵查** `act_scout_`（揭露當前地+相鄰地，耗 1 AP）。
- 攻擊 `act_combat_` 只鎖定 `servant_loc === 玩家從者所在地` 的敵人；附近無敵蹤會提示先偵查/移動。

---

## 6. NPC 自律與同陣營（`Game.gs npcTick_`）

每個耗時動作後推進世界（睡覺推 3 tick）：
- NPC 30% 機率移動到相鄰地；依靈脈回 HP/MP。
- 同地碰撞：每 tick 最多一場戰鬥，30% 開戰、15% 結盟（傳聞）、其餘對峙。
- **同陣營跳過**：`npcAllied_(a,b)` = 同 `master_name` 或在 `NPC_ALLY_GROUPS_`（目前 `['美狄亞-Caster','佐佐木小次郎-Assassin']`）。
- NPC 死亡/對峙/結盟寫入 `事件(EVENTS)`，全域傳聞推給玩家。

---

## 7. 其他系統速覽

- **記憶 RAG**：`gameContext_` 撈最近 6 筆玩家可見事件 + 6 筆事實，注入每次 AI 敘述；
  `narrateAndExtract_` 單次呼叫同時產敘述＋抽取要長期記住的 facts 寫入 `記憶(MEMORY)`。
- **補魔**：密封時段，10 次對話倒數，期間時間/NPC 凍結，結算回滿魔力 + 好感 +8；令咒可強制跳過。
  鐵則：好感 ≠ 服從，從者抗拒無禮/猥褻，親密一律 fade-to-black（系統提示 `narratorSystem_` 鎖死）。
- **令咒**：靈基修復 / 絕對命令 / 寶具強制 / 緊急脫離 / 強制補魔；違背意志(好感<60)會扣好感。
- **結局**：玩家從者或御主 HP 歸 0 → 死亡假夢；敵方全滅 → 奪杯。皆接老虎道場 → 寫 `歷史(HISTORY)` → `clearGame_` 清該場（多人安全，只刪該 game_id）。
- **存檔接續**：登入回傳 `current_game`；`resumeGame(msId)` 讀回；開新局先 `clearGame_` 舊場。

---

## 8. 資料表 schema（融合時對接用）

定義在 `Config.gs HEADERS`：
- `英靈殿`: servant_id, cls, realName, wars, 筋力,耐久,敏捷,魔力,幸運,寶具, classSkills, skills, traits, np, persona, source
- `御主殿`: master_id, name, war, magic, circuits, melee, magic_rank, home, wish, persona, source
- `地圖`: id, name, x, y, danger, leyline, adj, desc
- `戰場`: game_id, slot, is_player, master_name, magic, circuits, master_hp(_max), master_mp(_max), seals, melee, magic_rank, location, servant_id, sv_hp(_max), sv_mp(_max), upkeep, bond, true_name_known, status, alive, base_loc, barrier(_max), base_tier, servant_loc, separated, **discovered**
- `記憶`: event_id, game_id, turn, entity, fact_type, content, importance, write_ts
- `事件`: event_id, write_ts, game_id, day_count, time_hour, location_id, event_type, actor_id, target_id, log_text, is_global, importance
- `時鐘`: game_id, day, hour, ap, ap_max, mana_countdown, mana_locked
- `帳號`: ms_id, name, created, current_game, inventory, settings
- `歷史`: ts, ms_id, name, result, war, servant_cls, day, summary

> 複雜欄位（classSkills/skills/traits/persona/adj/roster/discovered…）在表內存 **JSON 字串**，
> `Sheets.gs parseMaybe_` 讀回時自動 `JSON.parse`。
> ⚠ 例外：種子的 `wars` 存成 `"5th/fake"` 斜線字串，AI 生成的存成陣列 →
> `getStatic` 已做正規化成陣列，融合時注意這個歷史不一致。

---

## 9. 平衡常數速查（`Config.gs TUNING`）

| 常數 | 值 | 用途 |
|---|---|---|
| HP_K / HP_BASE | 3 / 50 | HP = 耐久×3+50 |
| MP_K / MP_BASE | 2 / 40 | MP = 魔力×2+40 |
| UPKEEP_DIV | 10 | 維持費除數 |
| MAD_MULT | 1.5 | 狂化維持倍率 |
| SUPPLY_FACTOR | 0.5 | 御主供給 = 迴路×0.5 |
| LEYLINE | 高10/中5/低2 | 靈脈回魔 |
| WORKSHOP | 8 | Caster 主場工房 |
| SEP_PENALTY / SEP_SOLO | 0.5 / 0.85 | 分離供給衰減 / 單獨行動減免 |
| HP_REGEN_K | 0.1 | 每小時緩回血 = 耐久×0.1 |
| COMBAT_MP / NP_MP | 0.12 / 0.35 | 普通/寶具耗魔比例 |
| AP_PER_DAY / HOURS_PER_AP | 12 / 2 | 行動點 / 每點時數 |
| MANA_TURNS / MANA_AP_COST / MANA_BOND | 10 / 2 / 8 | 補魔回合/耗AP/加好感 |

---

## 10. 給融合方案的優先建議（本視窗觀點）

1. **統一 fx 詞表並接線**：這是最大缺口。目前 16+ 個 fx 是裝飾，連「對魔力」都沒生效。
   建議定義「fx → {戰鬥效果, 經濟效果, 敘述提示}」的單一來源，三方（種子/AI白名單/引擎）對齊。
2. **合併兩套戰鬥**：`npcSkirmish_` 應呼叫 `resolveCombat_` 同核心，否則 NPC 永遠吃不到標籤/寶具。
3. **對魔力 vs 御主魔術**：規則寫了但沒實作；融合時補上「現代魔術對有 nullify_magic 者無效」的判定。
4. **NPC 結盟落地**：目前只發傳聞，可做成真正的暫時停戰狀態（記在 BATTLE 或新表）。
5. **schema 演進**：已加 `discovered`；若再加欄位，記得 `setupDatabase()` 會重建標題列（動態表不清資料）。
