# CLAUDE.md — 開工前必讀（每次 session 自動載入）

《命運停駐之夜》：把九州武俠 GAS 遊戲改造成 Fate/stay night 聖杯戰爭（純按鍵單人）。
GAS 在 `gas/`，clasp 推 branch 自動部署。**我每次開機失憶，這檔是我的錨。**

## 🎯 核心訴求（雙軌設計，玩家本人定的方向，別偏離）

玩法是**兩條軌**（雙軌），共用一張試算表＋核心資料(奪杯→鑑賞管線需要)：

- **🎴 純淨 solo（主體）**：單人聖杯戰爭，只有「按鍵 ＋ AI 敘述」，**SFW**。可多帳號遊玩，但**資料必須分流不污染**（game_id 實例化 ＋ 帳號綁定，務必守住）。盡可能貼近 Fate 原作。
- **🌹 慾海 kanshou（鑑賞後日談）**：奪杯後與封存從者的約會，建立在**九州慾海模式**上，**NSFW**。方向是**盡量保留九州現有資料與系統**，未來可能「打工賺錢→買禮物」。

**兩個唯讀視窗（不是玩法軌，只是看）**：
- **📜 個人聖杯戰記**（`showVictoryHistory`/`get_victory_history`）：自己帳號的勝敗紀錄，只看自己。
- **🏆 排行榜**（`actionLeaderboard`）：跨帳號比拼（奪杯數/最快奪杯日/圖鑑數），撈持久層。

⚠ **錢的雙面性**：solo 全程無花錢入口（錢是死欄，身世財力差異改由起始禮裝體現）；**九州 money/聽風閣/商城/給銀兩系統要保留給 kanshou**（未來打工買禮物）——別為了「solo 用不到」就砍。
⚠ `full`（九州全模擬）模式碼仍在、是 kanshou 經濟的底層，但**不作為前台玩法軌提供**。

## 🚨 紅線（違反＝不可逆災難，動手前再確認一次）

1. **慾海禁區**：`gas/Engine_Combat.gs` 的 `nsfwBaseRules`（演化核心）＋整套 NSFW 機制**一律不可改**。只能改 SFW 的 gating／名冊。改任何鄰近處，事後 `git diff | grep nsfwBaseRules` 必須 0 改動。
2. **九州 GAS 不可動**：原始九州/GAS repo 只能複製過來，不可改。
3. **show-don't-tell**：敘事禁止直述角色 願望／個性／萌點 字面（`servantCard_` 鐵則一二三 已強制）。
4. **branch**：只在 `claude/fate-error-review-w8q42w` 開發。commit→push→GitHub Action(clasp 3.3.0)自動部署。
5. **model id**：`claude-opus-4-8` 不可出現在 commit／PR／程式碼／任何 push 進 repo 的東西。chat 回覆才可講。
6. **commit footer**：
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_016XEdY9i7dRc5MWBkSMi9YN
   ```

## 📌 開工前先讀

- **`SOLO_REFERENCE.md`** — 單人模式完整代碼地圖（函數名＋作用＋schema＋ActionRouter＋MEMORY 標記）。**先查這份再 grep**，省時間。
- `DESIGN.md` — 設計鐵則（GAS 掌數值、AI 只說書）。
- `docs/HANDOFF_ENGINE.md` — 引擎交接。

## ✅ 工作流程

- **驗證**：改完代碼必跑 `bash check.sh`（一行驗證所有 .gs ＋ Script.html 內嵌 JS）。CI 只檢查 .gs 語法、**不檢查 .html JS**（.html 出錯會綠燈部署卻壞 runtime）。
- **三模式**：`solo`(FATE 單人戰爭，主體)／`full`(九州全模擬)／`kanshou`(鑑賞約會)。`applyModeUI()` 是總開關。**solo 全程無花錢入口**，錢是死欄，別在 solo 依賴 full-only 功能。
- **squash-merge 衝突**：PR squash 進 main 後分支會分歧，下次 `git merge origin/main` 在 gas 檔衝突→`git checkout --ours`(分支是 superset)→`node --check`→`commit --no-edit`→push。註：`grep -c "^<<<<<<<"` 計數 0 時 exit 1 會斷 `&&` 鏈，語法檢查分開跑。
- **暫存檔**：放 scratchpad，不要污染 repo。

## 🧭 紀律（最重要，比筆記本身重要）

**改了代碼就順手更新 `SOLO_REFERENCE.md`**——筆記過期會騙下一個失憶的我。新增 action／函數／MEMORY 標記／schema 欄位時，回去補那份。
