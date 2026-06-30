# CLAUDE.md — 開工前必讀（每次 session 自動載入）

《命運停駐之夜》：把九州武俠 GAS 遊戲改造成 Fate/stay night 聖杯戰爭（純按鍵單人）。
GAS 在 `gas/`，clasp 推 branch 自動部署。**我每次開機失憶，這檔是我的錨。**

## 🎯 核心訴求（雙軌設計，玩家本人定的方向，別偏離）

玩法是**兩條軌**（雙軌），共用一張試算表＋核心資料(奪杯→鑑賞管線需要)：

- **🎴 純淨 solo（主體）**：單人聖杯戰爭，只有「按鍵 ＋ AI 敘述」，**SFW**。可多帳號遊玩，但**資料必須分流不污染**（game_id 實例化 ＋ 帳號綁定，務必守住）。盡可能貼近 Fate 原作。
- **🌹 慾海 kanshou（鑑賞後日談）**：奪杯後與封存從者的約會，**NSFW**。**一個更單純的世界**（2026-06 玩家定案）：只持久化 **個性／特徵／關係／外顯狀態／肉體 ＋ 歷史紀錄·因果**；**不打工、無經濟、無戰鬥**，一張約會大地圖，其餘全靠 AI 即興。仍建在 `nsfwBaseRules`（紅線①）＋ `buildDefaultSystemPrompt` 上、共用 `actionPlay` 引擎。

**兩個唯讀視窗（不是玩法軌，只是看）**：
- **📜 個人聖杯戰記**（`showVictoryHistory`/`get_victory_history`）：自己帳號的勝敗紀錄，只看自己。
- **🏆 排行榜**（`actionLeaderboard`）：跨帳號比拼（奪杯數/最快奪杯日/圖鑑數），撈持久層。

⚠ **經濟/生活層全砍**（2026-06 玩家定案，推翻舊「保留給 kanshou」方針）：money(MONEY 欄)／商城·店鋪(SHOP)／物品·背包(ITEM)／給銀兩／天命·任務(QUEST)／工房(TASK)／**賭場**／**信件·飛書(MAIL)**／**生活技能(LIFESKILL)**／裝備(WEP/ARM/ACC1/ACC2)——**兩軌都不要**，AI 需要時自己掰、不寫試算表。冗餘 `CLS` 併入 `RANK`；死符號 `CTAG`(表還活著、只拿掉索引) 一併清。
⚠ `full`（九州全模擬）不再是 kanshou 經濟底層，可隨經濟一起清理。
⚠ solo 身世財力差異改由**起始禮裝**體現（禮裝存 MEMORY，非裝備欄）。

## 🚨 紅線（違反＝不可逆災難，動手前再確認一次）

1. **慾海禁區**：`gas/Engine_Combat.gs` 的 `nsfwBaseRules`（演化核心）＋整套 NSFW 機制**一律不可改**。只能改 SFW 的 gating／名冊。改任何鄰近處，事後 `git diff | grep nsfwBaseRules` 必須 0 改動。
2. **`GAS` repo 不可動，但 FATE 內部可隨意改**：`calloy520-wq/GAS`（在 `/home/user/GAS`，原始九州專案）**一個字都不碰**——FATE 是從它複製出來改的。**但 FATE repo 內部的九州衍生碼【可以放手清理／改造，做成 FATE 專屬】**，別過度保守當神主牌。FATE 內改造的唯一兩條限制：① 別碰 `GAS` repo ② 別弄壞 kanshou/慾海（那軌建在 FATE 內的九州系統上，含紅線①的 `nsfwBaseRules`）。判斷某段 FATE 內九州碼能不能砍：kanshou/full 有用到→留；兩軌都用不到→可清（注意 COL 是位置索引，刪欄會位移全表，寧可棄用不刪欄）。
3. **show-don't-tell**：敘事禁止直述角色 願望／個性／萌點 字面（`servantCard_` 鐵則一二三 已強制）。
4. **branch**：只在 `claude/fate-error-review-w8q42w` 開發。commit→push→GitHub Action(clasp 3.3.0)自動部署。
5. **model id**：`claude-opus-4-8` 不可出現在 commit／PR／程式碼／任何 push 進 repo 的東西。chat 回覆才可講。
6. **commit footer**：
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_016XEdY9i7dRc5MWBkSMi9YN
   ```

## 🎯 現在焦點（2026-06 玩家定向，依序）

1. **加快整體速度**：GAS 慢的主因＝每次按鍵的 google.script.run round-trip ＋ 共用「眾生」整表掃描。**已做**：按鍵 round-trip 3→1（`buildClientState_` 統一刷新 blob＋dispatcher 對 `STATE_AFTER_ACTIONS` 夾 `_state`＋前端 `__pendingState` 優先消費）；整表/關係表單次讀取下傳共用；拔冗餘 `flush()`；「眾生」表縮列（`purge_orphans`＋登入死局自動清）。**鐵則：別把多餘 round-trip 或重複整表讀回加回來。**
2. **種子庫資料正確性**：`Seed_Codex.gs` 六圍／寶具 NP 尺度關鍵字(對人/對軍/對城/對界，引擎讀字串算傷害·誤標＝偷改平衡)／神性／龍 trait／英文寶具名／persona 格式，要對照原作校正。
3. **AI 敘述及格式**：提示詞給結果不指定過程、show-don't-tell、不外洩鷹架到歷史、JSON 解析有 try/catch＋`sanitizeAiData_`、基調統一（`miniSystem`）。
4. **代碼查重**：fork 自九州，殘留死碼／重複函數／重複 inline pattern，逐步清（注意 COL 是位置索引、onclick 字串內的呼叫不算死碼）。

## 📌 開工前先讀

- **`SOLO_REFERENCE.md`** — 單人模式完整代碼地圖（函數名＋作用＋schema＋ActionRouter＋MEMORY 標記）。**先查這份再 grep**，省時間。
- `DESIGN.md` — 設計鐵則（GAS 掌數值、AI 只說書）。

## ✅ 工作流程

- **驗證**：改完代碼必跑 `bash check.sh`（一行驗證所有 .gs ＋ Script.html 內嵌 JS）。CI 只檢查 .gs 語法、**不檢查 .html JS**（.html 出錯會綠燈部署卻壞 runtime）。
- **三模式**：`solo`(FATE 單人戰爭，主體)／`full`(九州全模擬)／`kanshou`(鑑賞約會)。`applyModeUI()` 是總開關。**solo 全程無花錢入口**，錢是死欄，別在 solo 依賴 full-only 功能。
- **squash-merge 衝突**：PR squash 進 main 後分支會分歧，下次 `git merge origin/main` 在 gas 檔衝突→`git checkout --ours`(分支是 superset)→`node --check`→`commit --no-edit`→push。註：`grep -c "^<<<<<<<"` 計數 0 時 exit 1 會斷 `&&` 鏈，語法檢查分開跑。
- **暫存檔**：放 scratchpad，不要污染 repo。

## 🧭 紀律（最重要，比筆記本身重要）

**改了代碼就順手更新 `SOLO_REFERENCE.md`**——筆記過期會騙下一個失憶的我。新增 action／函數／MEMORY 標記／schema 欄位時，回去補那份。
