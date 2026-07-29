# 戰鬥平衡測試工具（Node，非 GAS）

不進 clasp 部署（`.clasp.json` rootDir=`gas`、`.claspignore` 只放行 `gas/` 內的 `.gs`/`.html`，
`tools/` 底下的東西 clasp 物理上碰不到），可以放心留在 repo 裡當常駐測試工具，不用每次臨時搭。

`engine.js` 直接把 `gas/Core_Settings.gs` + `gas/Engine_Fate.gs` + `gas/Seed_Codex.gs` 原始碼載進一個
Node vm sandbox 執行——**不複製/改寫任何戰鬥算式或六圍資料**，永遠吃到當下 repo 版本的真實引擎與真實種子表。
只 stub 掉載入當下會碰到的少數 GAS 全域物件（`PropertiesService`／`SpreadsheetApp`／`mcCombatFx_` 等），
詳見檔案內註解。

## 用法

```bash
node tools/battle_sim/duel.js [模擬場數，預設20000]
```

`duel.js` 是「金閃閃/恩奇都 vs 赫拉克勒斯-Berserker、有無 gob/chain 被動」的對戰模擬範例。
要測別的對戰組合／別的 fx 開關，改 `duel.js` 最下面 `main()` 抓的 servant id 跟 `stripFx` 陣列即可，
或直接 `require('./engine.js')` 自己寫新的模擬腳本（`ctx.SEED_SERVANTS`/`ctx.resolveFateBattle_`/
`ctx.hasFx_` 等都是拿到的真實引擎函式）。

**模擬範圍**：只跑「普通攻擊」反覆交鋒到一方陣亡，不解放寶具、不吃補魔/整備/禮裝加成——
這樣量到的差異才是「被動 fx 本身」的貢獻，不會被寶具解放的巨大傷害蓋過去。
十二試煉(God Hand)復活公式是逐行對照 `Router_Battle.gs` 的 `fateStrike_` 移植過來的
（那支函式本尊吃 GAS 的 `sheets`/`pcData` 陣列，不方便脫離試算表單獨呼叫）。

```bash
node tools/battle_sim/roundrobin.js [pool=4th|5th|all] [mode=basic|skill|np] [N=200]
```

`roundrobin.js` 是同戰爭池(或全體36騎)內任兩位互打 N 場的全循環賽，輸出對全池勝率排名。
三種 mode 各自獨立測(不疊加)：`basic`＝裸普攻(不含主動技/寶具)、`skill`＝開啟主動技全效、
`np`＝每次交手都解放寶具(出力強制100%，多寶具挑最強攻擊項；不模擬御主魔力經濟上限)。

```bash
node tools/battle_sim/extremes.js [N=200]   # 🏟️ 極端組合回歸測試——平衡改動後必跑(2026-07·N=200 約 3 分鐘)
```

`extremes.js` 收錄歷次平衡事件揪出的退化組合＋各極端工房原型(燕巧盾/以巧變化流/盾龜/砲台…含四技版)：
① 每組合 vs 全種子池(普攻+寶具·紅旗=破9成)　② 組合互鬥全循環(紅旗=出現「無天敵」)。
組合預算用檔內鏡射的現行價目**現算**——改價後買不起的舊斂法自動標 ❌棄測(一眼看見那刀殺了誰)；
改後端價目(parseForgeBuild_)記得同步檔頭鏡射表。發現新的退化組合就往 BUILDS 加一列＋事件註記。
⚠ 已知模擬盲點：不模擬 魔力經濟(七天盾30魔/次在此免費)、奇襲(ambush)、戰鬥續行(survive 在 fateStrike_ 層)。

**場數指引**：整體/tier 榜 N=200 已夠(對全池 7000 場·誤差±1.2pp)；要下「單一對局誰剋誰」的結論用 N=1000(±3pp)。
