# CLAUDE.md — 開工前必讀（每次 session 自動載入）

《命運停駐之夜》：把九州武俠 GAS 遊戲改造成 Fate/stay night 聖杯戰爭（純按鍵單人）。
GAS 在 `gas/`。⚠ **push 只自動同步代碼，不會自動上線**——見紅線④。**我每次開機失憶，這檔是我的錨。**

## 🎯 核心訴求（雙軌設計，玩家本人定的方向，別偏離）

玩法是**兩條軌**（雙軌），共用一張試算表＋核心資料(奪杯→鑑賞管線需要)：

- **🎴 純淨 solo（主體）**：單人聖杯戰爭，只有「按鍵 ＋ AI 敘述」，**SFW**。可多帳號遊玩，但**資料必須分流不污染**（game_id 實例化 ＋ 帳號綁定，務必守住）。盡可能貼近 Fate 原作。
- **🌹 慾海 kanshou（鑑賞後日談）**：奪杯後與封存從者的約會，**NSFW**。**一個更單純的世界**（2026-06 玩家定案，2026-07 一度追加經濟層又推翻，見下）：持久化 **個性／特徵／關係／外顯狀態／肉體 ＋ 歷史紀錄·因果**；無戰鬥、無經濟、無房東房客世界觀，一張約會大地圖，其餘全靠 AI 即興。仍建在 `nsfwBaseRules`（紅線①）＋ `buildDefaultSystemPrompt` 上、共用 `actionPlay` 引擎。

⚠ **2026-07 玩家推翻舊方針，兩個唯讀視窗已全數砍除**：原「📜 個人聖杯戰記」（`showVictoryHistory`/`get_victory_history`）／「🏆 排行榜」（`actionLeaderboard`）連同 `incrementWin_`/`recordHistory_`/`recordWinSpeed_` 一併刪除（帳號表 WON/BEST_DAYS 欄也砍），單人專注、不做跨帳號回顧比拼。詳見 `HANDBOOK.md` §1。

⚠ **經濟/生活層全砍，僅solo維持**（2026-06 玩家定案，推翻舊「保留給 kanshou」方針）：money(MONEY 欄)／商城·店鋪(SHOP)／物品·背包(ITEM)／給銀兩／天命·任務(QUEST)／工房(TASK)／**賭場**／**信件·飛書(MAIL)**／**生活技能(LIFESKILL)**／裝備(WEP/ARM/ACC1/ACC2)——**solo 不要**，AI 需要時自己掰、不寫試算表。冗餘 `CLS` 併入 `RANK`；死符號 `CTAG`(表還活著、只拿掉索引) 一併清。
⚠ `full`（九州全模擬）不再是 kanshou 經濟底層，可隨經濟一起清理。
⚠ solo 身世財力差異改由**起始禮裝**體現（禮裝存 MEMORY，非裝備欄）。
🔵 **2026-07 玩家一度讓 kanshou 恢復真經濟層、隨後又整個推翻砍除**：2026-07-13 先定案要「真的有系統記錄、會被扣款/賺取」（打工/房租/商店，見 SOLO_REFERENCE.md §76-77 的歷史記錄），但實測後玩家對一次性補扣多週房租的體驗感到崩潰(「快轉到聖誕節 我直接破產」)，進而重新檢討整個「房東房客」世界觀，最終明確定案「經濟層(錢/打工/房租/商店)—你說要砍　民宿房東房客的世界觀包裝—你說要砍」，**整套經濟層＋房東房客框架已於同月完全移除**(詳見 SOLO_REFERENCE.md §100)。夜襲/賴床叫醒等橋段改用「她自己原本就有的住處(`KANSHOU_HERO_HOME_`)」觸發，不再依賴客房系統。`COL.PC.MONEY`/`UPKEEP_WEEK`/`ROOM` 欄位索引仍保留(COL是位置索引不能刪)但恆空、讀寫端已全部拔除。**kanshou 現在跟 solo 一樣全程無花錢入口**。

## 🚨 紅線（違反＝不可逆災難，動手前再確認一次）

1. **慾海禁區**：`gas/Engine_Combat.gs` 的 `nsfwBaseRules`（演化核心）＋整套 NSFW 機制**一律不可改**。只能改 SFW 的 gating／名冊。改任何鄰近處，事後 `git diff | grep nsfwBaseRules` 必須 0 改動。
2. **`GAS` repo 不可動，但 FATE 內部可隨意改**：`calloy520-wq/GAS`（在 `/home/user/GAS`，原始九州專案）**一個字都不碰**——FATE 是從它複製出來改的。**但 FATE repo 內部的九州衍生碼【可以放手清理／改造，做成 FATE 專屬】**，別過度保守當神主牌。FATE 內改造的唯一兩條限制：① 別碰 `GAS` repo ② 別弄壞 kanshou/慾海（那軌建在 FATE 內的九州系統上，含紅線①的 `nsfwBaseRules`）。判斷某段 FATE 內九州碼能不能砍：kanshou/full 有用到→留；兩軌都用不到→可清（注意 COL 是位置索引，刪欄會位移全表，寧可棄用不刪欄）。
3. **show-don't-tell**：敘事禁止直述角色 願望／個性／萌點 字面（`servantCard_` 鐵則一二三 已強制）。
4. **branch**：只在 `claude/fate-error-review-w8q42w` 開發。commit→push→GitHub Action(clasp 3.3.0)自動跑，但**只有 `clasp push`**(同步代碼進 GAS 專案，不建版本、不動 `/exec` 正式網址)——`.github/workflows/deploy.yml` 刻意設計成兩段式，避免每次 commit 都建版把 GAS 的 200 版本上限燒光。**玩家要真的在網頁上看到新版，必須額外手動觸發 workflow_dispatch**(GitHub Actions 頁面手動 Run workflow，或叫我用 `mcp__github__actions_run_trigger` 觸發)才會跑 `clasp deploy`、真正更新 `/exec`。⚠ **`push 成功`／`clasp push 完成` ≠ 玩家看得到**——每次要讓玩家真的玩到新版，記得額外觸發一次 workflow_dispatch 並等它 `completed/success`，且 head_sha 要對得上這次要上線的 commit，再跟玩家回報「已上線」。
5. **model id**：`claude-opus-4-8` 不可出現在 commit／PR／程式碼／任何 push 進 repo 的東西。chat 回覆才可講。
6. **commit footer**：
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_016XEdY9i7dRc5MWBkSMi9YN
   ```

## 🛠️ 工程準則（玩家定案·寫 code 的最高價值觀，違反＝重做）

**四字訣：穩健・快速・易擴充・易維護。永遠從根源解，不做臨時應變方案（band-aid）。**

- **🧱 穩健**：邊界/空值先擋（`parseInt||0`、`try/catch`＋fallback、失敗不炸整局）；輸入當不可信（`sanitizeUserData_` 是唯一真線）；寫表冪等（重跑不重複）；改一處先想「別的路徑會不會也走這」。
- **⚡ 快速**：守住**每按鍵 3→1 round-trip**（`_state`/`__pendingState`）＋整表只讀一次下傳共用＋樂觀更新。**鐵則：別把多餘 round-trip 或重複整表讀回加回來。** AI 阻塞能非阻塞就非阻塞（先秒顯數字、prose 後補）。
- **🧩 易擴充**：**資料驅動優先**——能查表就別寫 if 鏈（範本：`MC_COMBAT_`禮裝/`NP_SCALE_MATRIX`規模/`CONCEPT_TIER`概念/`OUTPUT_TIERS_`出力）。要加東西＝往表加一列＋既有引擎自動吃，不動流程。
- **🔧 易維護**：**單一真實來源**（一個數只存一處，如海怪肉身＝`【海怪護盾】`一個池）；**複用引擎機制、不加特例**（範本：禮裝 `injectMysticBuff_` 注入 fx→走既有 `resolveFateBattle_`，不另開結算路徑）；helper 成套（get/set/clear/view）；改代碼**順手更新 `SOLO_REFERENCE.md`／`HANDBOOK.md`**。
- **🚫 不要臨時應變**：不疊補丁繞過症狀、不 hardcode 特判塞需求、不「先這樣之後再說」。發現舊做法錯就**重構掉**（範本：海怪從「+300 baked HP」根源化成獨立護盾模型；分隔符 bug **系統性修 7 處**而非只修犯錯那一處）。臨時方案＝債，這裡不欠。

## 🎯 現在焦點（2026-06 玩家定向，依序）

1. **加快整體速度**：GAS 慢的主因＝每次按鍵的 google.script.run round-trip ＋ 共用「眾生」整表掃描。**已做**：按鍵 round-trip 3→1（`buildClientState_` 統一刷新 blob＋dispatcher 對 `STATE_AFTER_ACTIONS` 夾 `_state`＋前端 `__pendingState` 優先消費）；整表/關係表單次讀取下傳共用；拔冗餘 `flush()`；「眾生」表縮列（`purge_orphans`＋登入死局自動清）。**鐵則：別把多餘 round-trip 或重複整表讀回加回來。**
2. **AI 敘述及格式**：提示詞給結果不指定過程、show-don't-tell、不外洩鷹架到歷史、JSON 解析有 try/catch＋`sanitizeAiData_`、基調統一（`miniSystem`）。
3. **代碼查重**：fork 自九州，殘留死碼／重複函數／重複 inline pattern，逐步清（注意 COL 是位置索引、onclick 字串內的呼叫不算死碼）。

⚠ **原第2項「種子庫資料正確性」已完成並移除**（2026-07 玩家確認：`Seed_Codex.gs` 六圍／寶具NP尺度／神性／龍trait／persona 格式已對照原作校正完畢，詳見 `SOLO_REFERENCE.md` §5 種子庫查核紀錄）。

## 📌 開工前先讀

- **`HANDBOOK.md`** — 全專案工具書（理念＋架構＋資料層＋每個檔案在做什麼＋戰鬥引擎管線＋三軌）。**想「這專案在幹嘛/某檔做什麼」先看這份。**
- **`FUNCTION_MANUAL.md`** — 全專案逐函式清單（2026-07 建立：23 個 .gs/.html 檔每個函式一行用途＋呼叫關係＋ActionRouter 完整對照表）。**要 grep 前先查這份**，比 SOLO_REFERENCE.md 更完整(涵蓋 kanshou/共用檔案)。新增/搬移/刪除函式時記得回來補。
- **`SOLO_REFERENCE.md`** — 單人模式完整代碼地圖（函數名＋作用＋schema＋ActionRouter＋MEMORY 標記，帶日期的稽核筆記）。**要 grep 前先查這份**，省時間。
- **`AI_PROMPT_MAP.md`** — 每個 action ↔ 觸發按鈕 ↔ handler ↔ 送 AI 的 prompt 全景圖（含 `miniSystem`／各卡片逐字引文）。**改提示詞／動 narrate 管線前先查這份、改完順手更新**（行號會漂·以函數名為錨）。
- `DESIGN.md` — 設計鐵則（GAS 掌數值、AI 只說書）。

## ✅ 工作流程

- **驗證**：改完代碼必跑 `bash check.sh`（一行驗證所有 .gs ＋ Script.html 內嵌 JS）。CI 只檢查 .gs 語法、**不檢查 .html JS**（.html 出錯會綠燈部署卻壞 runtime）。
- **三模式**：`solo`(FATE 單人戰爭，主體)／`full`(九州全模擬)／`kanshou`(鑑賞約會)。`applyModeUI()` 是總開關。**solo 全程無花錢入口**，錢是死欄，別在 solo 依賴 full-only 功能。
- **squash-merge 衝突**：PR squash 進 main 後分支會分歧，下次 `git merge origin/main` 在 gas 檔衝突→`git checkout --ours`(分支是 superset)→`node --check`→`commit --no-edit`→push。註：`grep -c "^<<<<<<<"` 計數 0 時 exit 1 會斷 `&&` 鏈，語法檢查分開跑。
- **暫存檔**：放 scratchpad，不要污染 repo。

## 🧭 紀律（最重要，比筆記本身重要）

**改了代碼就順手更新 `SOLO_REFERENCE.md`**——筆記過期會騙下一個失憶的我。新增 action／函數／MEMORY 標記／schema 欄位時，回去補那份。
