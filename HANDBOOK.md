# HANDBOOK — 專案一頁看懂

> 給每次失憶開機的自己：這專案在做什麼、代碼長怎樣。細節往下查：
> 找檔／要改 X 動哪裡 `CODE_MAP.md`｜逐函式 `FUNCTION_MANUAL.md`｜新聖杯戰爭 `SOLO_REFERENCE.md`｜鑑賞 `KANSHOU_REFERENCE.md`｜提示詞 `AI_PROMPT_MAP.md`｜為什麼這樣寫 `CODE_NOTES.md`｜設計鐵則 `DESIGN.md`。

## 1. 一句話

Google Apps Script 網頁遊戲《命運停駐之夜》。兩條路：

- **⚔️ 新聖杯戰爭（solo·主體·SFW）**：一天兩個決定、戰鬥每回合一個姿態，GAS 算結果、AI 說書。
- **🌹 鑑賞後日談（kanshou·NSFW）**：從英靈殿召喚同伴，自由聊天，角色有記憶。沒有戰鬥／經濟／地點。
- 兩邊共用 **🛠️ 英靈工房**（`War_Forge.gs`）：做自己的從者，兩邊都叫得出來。

## 2. 架構

```
doGet → Index.html（殼，內嵌 Style / Script / Script_Onboarding / Script_Kanshou / Script_War）
  └─ google.script.run.handleGameAction(json)  →  Router_Action.gs 的 ActionRouter（30 條）
       ├─ 規則：War_Engine.gs（純函式）／Gallery.gs（鑑賞）
       ├─ 資料：Google Sheets
       └─ AI：Engine_Combat.gs 的 callGeminiAPI → OpenRouter（只說書）
```

- `handleGameAction`：`sanitizeUserData_` 清洗（唯一真線）→ `verifyPcOwnership_` 驗帳號 → 全域鎖（`LOCK_EXEMPT_ACTIONS_` 免鎖：讀取與跑 AI 的）→ handler。
- 鑑賞的狀態刷新夾在回應裡（`STATE_AFTER_ACTIONS` → `buildClientState_`），前端免再打一次 sync。**別把多餘 round-trip 加回來。**
- API key 在 Script Properties（`OPENROUTER_API_KEY`）；模型 `AI_MODEL`＋被擋時的 `FALLBACK_MODEL`。

## 3. 分頁（試算表）

| 分頁 | 誰用 | 內容 |
|---|---|---|
| 英靈殿 | 兩邊 | 從者範本（種子＋工房原創），`COL.HERO` |
| 帳號 | 兩邊 | 帳號 → 鑑賞御主 id（`COL.ACC`） |
| 聖杯戰局 | solo | 一局一格 JSON（`WAR_COL_`） |
| 鑑賞眾生 | 鑑賞 | 御主＋同伴各一列（`COL.PC`） |
| 歷史暫存 | 鑑賞 | 逐句對話（靠 pcId 分流） |
| 世界帳本 | 鑑賞 | AI 記下的地方／人物／事 |
| 鑑賞風格 | 鑑賞 | 說書人設定（15 段模組） |

建表：`Setup_FateWorld.gs`（冪等，缺才補）。⚠ **COL 是位置索引，棄用不刪欄**。

## 4. 檔案

| 檔 | 做什麼 |
|---|---|
| `Router_Action.gs` | 路由總表、鎖、所有權、狀態夾帶 |
| `War_Engine.gs`／`War_Router.gs`／`Script_War.html` | 新聖杯戰爭（規則／存檔＋說書／畫面） |
| `War_Forge.gs` | 英靈工房 |
| `Gallery.gs`／`Script_Kanshou.html` | 鑑賞（引擎＋提示詞／畫面） |
| `Router_Persona.gs` | 角色設定的 MEMORY 標記、代名詞、氣質規格 |
| `Seed_Codex.gs`／`Seed_Rivals.gs` | 種子從者、御主、正典陣容 |
| `Core_Settings.gs` | 模型設定、`COL`、MEMORY 標記工廠、共用小工具 |
| `Engine_Combat.gs` | `callGeminiAPI`、`doGet`、AI 失敗的保底 |
| `History_Sync.gs` | 歷史暫存讀寫 |
| `Account.gs` | 登入／帳號連結 |
| `Script.html`／`Script_Onboarding.html` | 前端共用（`gasRun`、`aiHtml_`、模式切換）／登入與選單 |

拆檔慣例：GAS 的 `.gs` 共用一個全域作用域，怎麼切都不影響執行。新 `.html` 有 JS 就命名 `Script_*.html`（`check.sh` 才驗得到），並在 `Index.html` 補 include。
⚠ 兩個 `.gs` 同名函式＝後載入的那個靜靜勝出，搬函式後確認全樹只剩一份。

## 5. 驗證與部署

- 改完必跑 `bash check.sh`（語法＋全部不變式掃描器；CI 不驗 `.html` 的 JS）。
- 平衡：`node tools/war_sim.js`。
- 部署兩段式：push → GitHub Action 只 `clasp push`；上線要另外手動觸發 workflow_dispatch（`clasp deploy`）。見 `PLAYBOOK.md`。
