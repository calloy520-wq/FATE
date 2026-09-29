# CLAUDE.md — 開工前必讀（每次 session 自動載入）

《命運停駐之夜》：Fate/stay night 的 Google Apps Script 網頁遊戲，代碼在 `gas/`。
**我每次開機失憶，這檔是我的錨。** ⚠ push 只同步代碼、不會上線——見紅線③。

## 🎯 雙軌（玩家定案，別偏離）

- **⚔️ 新聖杯戰爭（solo·主體）**：`War_Engine.gs`（純規則）＋`War_Router.gs`＋`Script_War.html`。一天兩個決定、戰鬥每回合一個姿態，沒有魔力條／AP／地圖／好感。
  玩家要的：**按鈕越簡單越好、畫面簡單但要有策略感、體感快、不單調。** 改規則先跑 `node tools/war_sim.js` 量勝率（理由與數字見 CODE_NOTES『WAR_』）。
  **除補魔外 SFW**：補魔（`supply`）＝原作的魔力供給，是刻意設計的露骨橋段。多帳號可玩，資料綁帳號分流。盡量貼近原作。
- **🌹 鑑賞後日談（kanshou·NSFW）**：玩家要的：**簡單、自由、角色有記憶。** 從英靈殿直接召喚同伴。
  無戰鬥、無經濟、無地點（只剩一格 AI 每回合自己寫的背景），其餘靠 AI 即興。引擎 `actionPlay_`＋`nsfwBaseRules`（`Gallery.gs`）。
  說書人設定只開兩格給玩家：尺度、篇幅（`KANSHOU_STYLE_MODULES_`，其餘固定；預設不改＝提示詞逐字不變）。
- **🛠️ 英靈工房**：`War_Forge.gs`，一張表單寫一整列英靈殿，兩邊通用（CODE_NOTES『WAR_FORGE_』）。
- **現況鐵則（別回頭加）**：兩軌都沒有經濟／商店／背包／任務／裝備欄；沒有排行榜與跨帳號比拼。
- 舊版 solo（九州衍生的戰場、地圖、禮裝、AP）2026-09 末已整組拆除。

## 🚨 紅線（編號刻意保留，全專案在引用）

1. ~~慾海禁區~~（玩家已取消）：`nsfwBaseRules` 可以改，但它是鑑賞的演化核心——**改前先量現況、改完跑全套探針，確認原本正常的配對沒被改壞**。歷次改動記在 `KANSHOU_REFERENCE.md`。
2. **show-don't-tell**：敘事不直述角色的願望／個性字面，用神態與行動演。
3. **branch＋兩段式部署**：只在 `claude/traditional-chinese-chat-q8ptho` 開發。push → GitHub Action 只跑 `clasp push`。要玩家看到新版，須**另外手動觸發 workflow_dispatch**（`clasp deploy`），等 `completed/success`、head_sha 對上，才回報「已上線」。
4. **model id**：本模型的 exact 型號 id 不可出現在 commit／PR／程式碼／任何 push 進 repo 的東西。chat 回覆才可講。
5. **commit footer**：
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_016XEdY9i7dRc5MWBkSMi9YN
   ```

## 🛠️ 工程準則

**穩健・快速・易擴充・易維護。永遠從根源解，不做臨時應變。**

- **穩健**：邊界／空值先擋，失敗不炸整局；輸入當不可信（`sanitizeUserData_` 是唯一真線）；寫表冪等。
- **快速**：每按鍵一次 round-trip（狀態夾在回應裡）、整表只讀一次、樂觀更新；AI 能非阻塞就非阻塞。
- **易擴充**：資料驅動——能查表就別寫 if 鏈（`WAR_SKILL_`／`WAR_TEMPER_`／`KANSHOU_STYLE_MODULES_`）。加東西＝往表加一列。
- **易維護**：單一真實來源；複用引擎不加特例；**COL 是位置索引，棄用不刪欄**。
- **不臨時應變**：不疊補丁、不 hardcode 特判。舊做法錯就重構掉。

## 📌 文件（先查再 grep）

| 檔 | 用途 |
|---|---|
| `PLAYBOOK.md` | 工作手冊：節奏、部署、Git 陷阱、瀏覽器測試。**接手先讀。** |
| `CODE_MAP.md` | 東西在哪、要做 X 動哪裡、全部 action 對照。**改代碼前先查。** |
| `HANDBOOK.md` | 一頁看懂架構、分頁、每個檔。 |
| `SOLO_REFERENCE.md` | 新聖杯戰爭速查。 |
| `KANSHOU_REFERENCE.md` | 鑑賞唯一現況真相。**動鑑賞先看。** |
| `FUNCTION_MANUAL.md` | 逐函式一行（零容錯索引）。 |
| `AI_PROMPT_MAP.md` | 每個 action ↔ 送 AI 的提示詞。改提示詞前查、改完更新。 |
| `CODE_NOTES.md` | **為什麼這樣寫**：拿函式／常數名去搜。代碼裡只留一句「在做什麼」。 |
| `DESIGN.md` | 設計鐵則。 |
| `archive/` | 封存：鑑賞編年史、已砍代碼的墓碑。**不是現況**，查某一輪為什麼改才去翻。 |

## ✅ 驗證

- 改完必跑 **`bash check.sh`**，要看到 `✅ 全部通過`。CI 不驗 `.html` 的 JS，這是唯一防線。
- 掃描器（每支擋一個踩過的坑，細節見 CODE_NOTES『check.sh』與各檔開頭）：
  `check_prompt`（提示詞一律正面指示、否定句後不附例句）｜`check_pronoun`（不寫死性別代名詞，用 `pron_()`）｜`check_standing`（每回合送的提示詞沒有無條件常駐指令）｜
  `check_render`（`aiHtml_` 排版↔XSS）｜`check_ui`（前端叫得起來）｜`check_wait`（每個 `gasRun` 有等待指示）｜`check_contract`（路由兩端欄位對得上）｜
  `check_wiring`｜`check_mirror`｜`check_undef`｜`check_loadorder`｜`check_ctx`｜`check_seed`｜`check_docs`｜`check_simp`｜`check_html`｜`check_floors`（覆蓋數不得無聲下降，合理變動用 `--bless`）。
- **新寫掃描器一定要注入一次退化確認它會叫**——不會叫的掃描器比沒有更糟。
- **敘事排版**：印【說書人】一律走 `Script.html` 的 `aiHtml_(text)`（escape 全部 → 只放回 `<br>`），不要手刻。
- **台灣繁體**：repo 裡的字也要繁體（`check_simp`）。
- 探針（假試算表跑真的路由，40 支）：**`bash tools/probes/run.sh`**，上線前跑；平衡：`node tools/war_sim.js`。暫存檔放 scratchpad，不污染 repo。

## 🧭 紀律

- 改了代碼順手更新 `SOLO_REFERENCE.md`／`KANSHOU_REFERENCE.md`——筆記過期會騙下一個失憶的我。
- 解釋「為什麼」超過兩行 → 寫進 `CODE_NOTES.md` 掛在函式名下。函式改名時錨點跟著改（`check_docs` 會擋；叫了先查是不是改名，別直接砍）。
- 新增／改簽名／刪除函式 → `FUNCTION_MANUAL.md` 對應那條同步改。
- 說明寫短：寫現在是什麼，不寫歷史沿革（歷史進 CODE_NOTES）。
