# CLAUDE.md — 開工前必讀（每次 session 自動載入）

《命運停駐之夜》：把九州武俠 GAS 遊戲改造成 Fate/stay night 聖杯戰爭（純按鍵單人）。
GAS 在 `gas/`。⚠ **push 只自動同步代碼、不會自動上線**——見紅線④。**我每次開機失憶，這檔是我的錨。**

## 🎯 雙軌（玩家定案，別偏離）

- **🎴 純淨 solo（主體）**：單人聖杯戰爭，只有「按鍵 ＋ AI 敘述」，**SFW**。可多帳號遊玩，**資料必須分流不污染**（game_id 實例化 ＋ 帳號綁定）。盡量貼近 Fate 原作。**全程無花錢入口**，身世財力差異走**起始禮裝**（存 MEMORY，非裝備欄）。
- **🌹 慾海 kanshou（鑑賞後日談）**：不需先打贏，直接從英靈殿召喚同伴進入。**NSFW**。持久化 個性／特徵／關係／外顯／肉體 ＋ 歷史因果。**無戰鬥、無經濟、無房東房客世界觀**，一張約會大地圖，其餘全靠 AI 即興。建在 `nsfwBaseRules`（紅線①）＋共用 `actionPlay` 引擎。

**現況鐵則（別回頭加）**：兩軌**皆無經濟/生活層**（money／商城／背包／任務／賭場／信件／生活技能／裝備欄全砍，AI 需要自己掰、不寫表）；**無戰記/排行榜唯讀視窗**（單人專注、不做跨帳號比拼）。`full`（九州全模擬）停用中。

## 🚨 紅線（違反＝不可逆災難）

1. **慾海禁區**：`gas/Engine_Combat.gs` 的 `nsfwBaseRules`（演化核心）＋整套 NSFW 機制**一律不可改**。只能改 SFW 的 gating／名冊。改鄰近處，事後 `git diff | grep nsfwBaseRules` 須 0 改動。
2. **`GAS` repo 不可動**：`calloy520-wq/GAS`（在 `/home/user/GAS`，原始九州）**一個字不碰**。FATE 內部的九州衍生碼**可放手清理改造**。判斷可否砍：kanshou/full 有用到→留；兩軌都用不到→可清（**COL 是位置索引，刪欄位移全表，寧棄用不刪欄**）。
3. **show-don't-tell**：敘事禁止直述角色 願望／個性／萌點 字面（`servantCard_` 強制）。
4. **branch＋兩段式部署**：只在 `claude/traditional-chinese-chat-q8ptho` 開發。commit→push→GitHub Action **只跑 `clasp push`**（同步代碼進 GAS 專案，不建版、不動 `/exec`）。要玩家在網頁看到新版，須**額外手動觸發 workflow_dispatch**（跑 `clasp deploy`）。`push ≠ 上線`——每次上線記得多觸發一次 workflow_dispatch、等 `completed/success`、head_sha 對上，再回報「已上線」。
5. **model id**：`claude-opus-4-8` 不可出現在 commit／PR／程式碼／任何 push 進 repo 的東西。chat 回覆才可講。
6. **commit footer**：
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_016XEdY9i7dRc5MWBkSMi9YN
   ```

## 🛠️ 工程準則（寫 code 的最高價值觀）

**四字訣：穩健・快速・易擴充・易維護。永遠從根源解，不做臨時應變（band-aid）。**

- **🧱 穩健**：邊界/空值先擋（`parseInt||0`、`try/catch`＋fallback、失敗不炸整局）；輸入當不可信（`sanitizeUserData_` 是唯一真線）；寫表冪等。
- **⚡ 快速**：守住**每按鍵 3→1 round-trip**（`_state`/`__pendingState`）＋整表只讀一次下傳＋樂觀更新。**別把多餘 round-trip 或重複整表讀回加回來。** AI 阻塞能非阻塞就非阻塞。
- **🧩 易擴充**：**資料驅動優先**——能查表就別寫 if 鏈（`MC_COMBAT_`禮裝/`NP_SCALE_MATRIX`規模/`CONCEPT_TIER`概念）。加東西＝往表加一列、既有引擎自動吃。
- **🔧 易維護**：**單一真實來源**（一個數只存一處）；**複用引擎、不加特例**（禮裝 `injectMysticBuff_` 注 fx→走既有 `resolveFateBattle_`）；helper 成套（get/set/clear/view）；改碼順手更新 `SOLO_REFERENCE.md`。
- **🚫 不臨時應變**：不疊補丁繞症狀、不 hardcode 特判、不「先這樣之後再說」。舊做法錯就重構掉（分隔符 bug 系統性修全部而非只修犯錯那處）。

## 📌 開工前先讀

- **`PLAYBOOK.md`** 🧭 — 工作手冊（怎麼把事做好：心法＋節奏 checklist＋協作模式＋部署＋Git 陷阱）。**接手第一份先讀這個。**
- **`HANDBOOK.md`** — 全專案工具書（理念＋架構＋資料層＋每檔在做什麼＋戰鬥管線）。想「這專案在幹嘛/某檔做什麼」先看這份。
- **`FUNCTION_MANUAL.md`** — 逐函式清單（每函式一行用途＋呼叫關係＋ActionRouter 對照）。**grep 前先查這份**。
- **`KANSHOU_REFERENCE.md`** 🌹 — 鑑賞唯一現況真相。**動鑑賞任何一塊先看這份。**
- **`SOLO_REFERENCE.md`** — 單人代碼地圖（函數＋schema＋ActionRouter＋MEMORY 標記）。**grep solo 前先查這份。**
- **`AI_PROMPT_MAP.md`** — 每個 action ↔ 按鈕 ↔ handler ↔ 送 AI 的 prompt 全景圖。**改提示詞前先查、改完更新。**
- `DESIGN.md` — 設計鐵則（GAS 掌數值、AI 只說書）。

## ✅ 工作流程

- **驗證**：改完必跑 `bash check.sh`（驗所有 .gs ＋ Script*.html 內嵌 JS）。CI 只檢查 .gs、不檢查 .html JS（.html 出錯會綠燈部署卻壞 runtime）。
- **三模式**：`solo`（主體）／`full`（九州全模擬·停用）／`kanshou`（鑑賞）。`applyModeUI()` 是總開關。
- **暫存檔**：放 scratchpad，不污染 repo。

## 🧭 紀律

**改了代碼就順手更新 `SOLO_REFERENCE.md`／`KANSHOU_REFERENCE.md`**——筆記過期會騙下一個失憶的我。
