# 命運停駐之夜 — GAS 後端

Google Apps Script 後端：自動建表 + 種子資料 + 遊戲流程（伺服器權威，所有數值由 GAS 算，AI 只敘述）。

> 本檔同時是「給 AI / 開發者的修改指南」。要新增從者、戰爭、調平衡、改技能效果，先讀這裡。

## 安裝 / 更新

1. Google 試算表 →「擴充功能」→「Apps Script」。
2. 把 `gas/` 內各 `.gs` 貼成指令碼檔；`index.html` 必須用「檔案 ➕ → HTML」新增成 HTML 檔（命名 `index`），不可貼進 `.gs`。
3. 專案設定 → 指令碼屬性 → `OPENROUTER_API_KEY` = 你的 key。
4. 執行 `setupDatabase()`（第一次要授權）。
5. **改了 `Config.gs` 的欄位或 `SeedData.gs` 的種子，要再跑一次 `setupDatabase()`**。
   - 重跑只重種「靜態分頁」並補標題列；**動態存檔（戰場/時鐘/記憶/事件/帳號）資料不清**。
   - 英靈殿重種時**會保留**玩家 AI 生成的英靈（`source='ai_gen'`）。

## 檔案地圖

| 檔 | 負責 |
|---|---|
| `Config.gs` | 分頁名、欄位 `HEADERS`、平衡常數 `TUNING`、`rankVal()`、OpenRouter 設定 |
| `SeedData.gs` | 英靈殿/御主殿/地圖/戰爭/規則/道具 種子資料 |
| `Setup.gs` | 建表＋種子（`setupDatabase`）；重種保留 ai_gen |
| `Sheets.gs` | 試算表讀寫層：`readAll_`(整表快取)、`readTail_`(窗口)、`withLock_`(寫入序列化)、`invalidate_` |
| `Engine.gs` | 純數值引擎：`resolveCombat_`、`economyNet_`、技能/標籤效果、`deriveServant_` |
| `Game.gs` | 流程：登入/開局/讀狀態/`doAction`（兩階段：鎖內結算→鎖外 LLM）、各動作 `act_*` |
| `LLM.gs` | OpenRouter 呼叫（重試＋退避＋JSON 容錯）、敘事提示詞、敘述函式 |
| `Api.gs` | Web App 進入點 `doGet`、編輯器測試函式 |
| `index.html` | 前端（單頁，三欄/手機單欄；敘述、地圖、狀態、技能/令咒選單） |

## 資料模型（靜態分頁）

**英靈殿（HEROES）** — 一列一名英靈：
`servant_id, cls, realName, wars(陣列或 "a/b"), 筋力,耐久,敏捷,魔力,幸運,寶具(階級字串),
classSkills, skills, traits(JSON 陣列), np(寶具字串), persona(JSON), source, align`
- 技能格式：`{n:"技能名", r:"階級", fx:"效果碼"}`；特性：`{n:"特性"}`
- `persona`：`{firstP:"一人稱", words:"性格關鍵詞", toMaster:"對御主態度"}`
- `align`：雙軸「秩序/中立/混沌・善/中立/惡」，Berserker 可「混沌・狂」。邏輯只取善惡軸＋狂化（`alignGood_`/`feedDisposition_`），秩序/混沌軸保留未用。
- ★ **資料慣例：Berserker 的六維是「已狂化」的成品值**（對齊原作狀態畫面，所以多為全 A）。引擎的 `mad` fx **只收維持費成本（×1.5）、不再對六維加成**——加成已烤進種子，再加會雙重計算。新增狂戰士請直接填「已狂化後」的數值，別期待引擎幫你升階。

**御主殿（MASTERS）**：`master_id, name, war, magic, circuits, melee, magic_rank, home, wish, persona`
**地圖（MAP）**：`id, name, x, y, danger, leyline(高/中/低), adj(JSON 鄰接), desc`（冬木 21 點）
**戰爭範本（WARS）**：`war_id, name, participants, partial, roster([{master, sid}])`

## fx 效果碼對照表（★ 新增從者請用這些碼，技能才會真的生效）

**被動（戰鬥自動觸發，`resolveCombat_`）**
| fx | 名稱 | 效果（數值） |
|---|---|---|
| `nullify_magic` | 對魔力 | 魔術傷害 ×(1−min(.9, 階級/55))；A≈−90% E≈−18%。不擋肉體 |
| `evade_ranged` | 避矢加護 | 閃避 +6 |
| `burst` | 魔力放出 | 普攻傷害 ×1.2 |
| `survive` | 戰鬥續行 | 每場可在致命一擊下撐住一次（HP=1） |
| `morale` | 勇猛/卡里斯瑪 | 傷害 +3 |
| `first_strike` | 直感 | 第六感：先機（單方持有時無視敏捷差、搶先出手）＋危機察知（防守時閃避 +3） |
| `analyze` | 心眼 | 閃避 +3 |
| `ride` | 騎乘 | 閃避 +3 |
| `divine_core` | 神核 | 受到傷害 ×0.82 |
| `stealth` | 氣息遮斷 | 開場首擊奇襲：命中 +6、傷害 ×1.5（一次性） |
| `tsubame` | 秘劍・燕返 | 三方位同時斬：敵閃避 −8（極難迴避）、命中則三段連斬傷害 ×2.3。無真寶具者（如佐佐木）的主力 |
| `unreadable` | 宗和的心得 | 持有者攻擊時，敵方的看破/預判閃避（`analyze`心眼・`first_strike`直感）失效 |
| `clear_mind` | 透化 | 防守時免疫攻方的精神威壓加成（`morale`勇猛/卡里斯瑪 +3 對其無效） |
| `self_mod` | 自我改造 | 命中 +2、傷害 +3（改造強化過的軀體） |
| `anti_magic_lance` | 破魔紅薔薇／必滅黃薔薇 | 攻擊時消去敵 buff、無視 `divine_core` 神核護甲；造成的傷使敵 `survive` 戰鬥續行失效（傷口不癒） |
| `divine` | 神性 | 寶具開場威力 ×1.1 |
| `tactics` | 軍略 | 寶具開場威力 ×1.15 |
| （特性`神性` + 技能名含`神殺`） | 神殺 | 傷害 ×2 |

**主動（玩家「✨ 技能」鈕發動，耗靈基魔力＋1AP，`act_skill_`）**
| fx | 名稱 | 類型 / 效果 |
|---|---|---|
| `fast_cast` | 高速神言 | 即時魔術彈：魔力×1.0+10，受對魔力減免 |
| `petrify` | 魔眼 | 即時魔術傷害＋使敵下場戰鬥 dodge −8（石化遲滯） |
| `zabaniya` | 妄想心音 | 即時心臟一擊：筋力×1.2+敏捷，無視防禦與對魔力 |
| `gob` | 王之財寶 | 即時寶具洪流：寶具×1.0+筋力×0.3，物理、不受對魔力 |
| `chain` | 天之鎖 | 即時拘束：寶具×0.4＋使敵下場 dodge −10；對「神性」傷害 ×2 |
| `wind_strike` | 風王鐵鎚 | 即時斬風：筋力×0.8+寶具×0.4＋使敵下場 dodge −5 |
| `rule_breaker` | 破戒全咒 | 即時斬斷契約：敵 seals 歸 0、清除其 buff＋魔力×0.3 小傷（令咒救不了他） |
| `summon_horror` | 螺湮城教本 | 即時召喚（神代）：魔力×1.2+寶具×0.4，半穿對魔力＋使敵下場 dodge −8 |
| `divine_age` | 神代魔術 | 被動修正：自身魔術攻擊所受的「對魔力」減免只有半效（穿透現代抗性） |
| `gae_bolg` | 刺穿死亡之棘 | 即時因果必中：寶具×1.4+筋力×0.5；高幸運目標可擾動減傷（luckEdge×8%） |
| `ubw` | 無限劍製 | 即時劍雨：寶具×0.7+敏捷×0.6，物理、不受對魔力 |

> ★ **AI 生成英靈**：`generateServant_` 透過 `FX_OK_` 白名單管控可用 fx。**新增引擎 fx 時，務必同步把碼加進 `FX_OK_` 並更新生成器提示**，否則 AI 做的角色會被 `cleanSkill_` 清掉該技能。
| `rune` / `shapeshift` | 符文 / 變生 | 即時回復 HP（耐久×2+10±） |
| `str_up` / `projection` / `weapon_steal` | 怪力 / 投影 / 武裝掠奪 | 下一場戰鬥傷害 +（筋力×0.4+5） |
| `aim` / `narrative` | 千里眼 / 故事創作 | 下一場戰鬥命中 +8 |

**經濟 / 其他**
| fx | 效果 |
|---|---|
| `mad` 狂化 | 維持費 ×2（`deriveServant_`）。力量已烤進數值，成本即平衡點。※ 模擬顯示「攻+守-」型戰鬥代價反而強化高血量狂戰，故不採用 |
| （六維）`幸運` | 命中與閃避的運氣修正：以 C 為基準（EX+3 / A+2 / B+1 / C0 / D−1 / E−2），`luckEdge_` |
| `solo` 單獨行動 | ①分離時供給衰減減免（`SEP_SOLO`）②**御主消亡後憑此獨自維持現界**：時數依階級 `TUNING.SOLO_HOURS`（C 24h／B 48h／A 96h，每 `+` ×1.25），存於 BATTLE `solo_hours` 欄逐時倒數，歸零→消滅。無此技→御主一死即 death |
| `territory` 陣地作成 | Caster 在主場工房 +`WORKSHOP` 全額供能；無此技的 Caster 只有半額 |
| `crafting` 道具作成 | 每小時 +`CRAFT_SUPPLY` 免費供給（自製魔力道具）|
| `wealth` 黃金律 | 御主魔力回復 ×1.4（`economyNet_`） |
| `rule_breaker` 等 | 其餘為敘述向／主動技，無被動數值（前端說明會標示） |
| 寶具 np 含「十二試煉 / God Hand」 | 賦予 `GOD_HAND_LIVES` 條命，被擊倒會復活，須擊倒這麼多次才真死 |

> 前端 `index.html` 的 `App.FX_DESC` 是這張表的玩家版說明，**改機制時記得同步**。

## 平衡常數（`Config.gs` 的 `TUNING`）

- 數值：`HP_K/HP_BASE`(從者HP)、`MP_K/MP_BASE`(從者靈基魔力)、`MASTER_MP_K`(御主迴路魔力上限)、`UPKEEP_DIV`、`MAD_MULT`
- 經濟：`MASTER_REGEN_K`(迴路每小時回復)、`SV_NATURAL_CAP`(靈基自然上限 0.8)、`SV_TOPUP`、`LEYLINE`、`WORKSHOP`、`SEP_PENALTY/SEP_SOLO`
- 戰鬥：`FLEE_HP`(撤退門檻 0.5)、`COMBAT_MP/NP_MP`、`KILL_MP`(擊殺回魔)、`GOD_HAND_LIVES`
- 獵魔/好感：`HUNT_MP_*`、`HUNT_BOND_*`
- 時間/補魔：`AP_PER_DAY/HOURS_PER_AP`、`MANA_TURNS/MANA_AP_COST/MANA_BOND`

## 平衡驗證方法論（改數值前先模擬）

調任何戰鬥/數值前，務必先離線模擬，別直接上線（歷史教訓：狂化「攻+守−」未模擬就改，反而強化高血量狂戰，已回退）。

把 `SEED_SERVANTS` 的純函式（`rankVal`、`hasFx`、`strike`、`resolveCombat` 邏輯）移植成 Node 腳本，全 18 騎循環對戰（每組合數百場）統計**擊殺率**與**僵持率**。用「兩種模擬」交叉看，因為各自代表不同情境：

- **純近戰模擬**：只跑普攻 + 撤退門檻 + 寶具收尾，**不點主動技**。≈ NPC 敵人實際打法（NPC 不會主動放技能）。
- **含技能模擬**：雙方開場放最強傷害主動（gae_bolg/zabaniya/gob/bolt…，70% 封頂）、套強化技、再近戰。= 高端對拼天花板。
- **玩家操作實戰** 介於兩者、偏強：玩家會點主動技，但 NPC 多半不會。

健康基準（目前）：僵持 ~35–42%、頂端（蘭斯洛特）≤ ~73%、無人「一招無解」、強者由維持費經濟 gate（見上「40 迴路只養得起非狂化」）。某騎在**兩種模擬都**落在預期帶 = 安全。只在單一模擬異常才是真問題。

## 核心機制摘要

- **魔力供給鏈（每小時）**：環境(靈脈/工房)免費 → 御主迴路 → 從者靈基 → **御主生命（破格召喚反噬）**。從者靈基自然只回 80%，更高需 供給/補魔/獵魔。
- **戰鬥**：屬性+D20 對抗；任一方降到 50% HP 即撤退（不纏鬥至死）；令咒（seal/sealnp）為決死全力、可分生死。
- **撤退/令咒 AI**：敵從者重傷→敵御主可能燃令咒瞬移脫離/治療；玩家重傷→敵御主可能燃令咒追擊。
- **瀕死令咒救援**：從者或御主將死且有令咒→彈窗抉擇（靈基修復 / 接受命運）。
- **無御主（單獨行動）**：令咒用盡 + 御主死亡，從者尚存時——有 `solo`→進入現界倒數（`solo_hours`），須在溶解前奪杯/尋得新魔力源；無 `solo`→當場消滅。御主若被令咒救回則清除倒數。
- **獵魔/好感**：依 `align` 善惡分流（善拒絕、中立不情願扣好感、惡/狂化樂意）。
- **御主遇襲**：從者分離/倒下、不在身邊時，敵從者(尤其 Assassin)會襲擊御主；武鬥/魔術階級減傷。

## 如何新增

**新增一名從者**（在 `SeedData.gs` 的 `SEED_SERVANTS` 加物件，跑 `setupDatabase`）：
```js
{ id:'真名-職階', cls:'Lancer', realName:'真名', wars:['客串'],
  six:{筋力:'B',耐久:'A',敏捷:'A',魔力:'B',幸運:'E',寶具:'B'},
  classSkills:[{n:'對魔力',r:'C',fx:'nullify_magic'}],
  skills:[{n:'神速',r:'A',fx:'first_strike'},{n:'符文',r:'A',fx:'rune'}],
  traits:[{n:'人類'}], np:'寶具名（簡述）',
  align:'中立・中庸', persona:{firstP:'我',words:'性格關鍵詞',toMaster:'對御主態度'} }
```
※ 想讓技能「有效果」，`fx` 一定要用上表中的碼；沒有對應碼就只是敘述向。

**新增一場戰爭**（`SEED_WARS`）：
```js
{ war_id:'唯一代號', name:'顯示名', participants:7, partial:true, roster:[
  {master:'御主名', sid:'對應的 servant_id'}, ... ] }
```
※ roster 的 `sid` 必須是英靈殿存在的 `servant_id`；`master` 不在御主殿時，用預設值（迴路 25、夾值上限 50）。

**改某標籤的效果**：改 `Engine.gs`（戰鬥）或 `Game.gs`（動作/經濟），並同步 `index.html` 的 `App.FX_DESC` 玩家說明。

## 內建戰爭

`4th`(第四次)、`5th`(第五次)、`fake`(Fate/strange Fake 樣本)、`dream`(夢幻演武・客串亂入，含斯卡哈三職階)。
