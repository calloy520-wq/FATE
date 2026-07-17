# CLAUDE.md — 開工前必讀（每次 session 自動載入）

## 🌱 現況：白紙一張（2026-07 全砍重建）

舊專案（FATE 聖杯戰爭 ＋ 鑑賞後日談 ＋ 九州模擬）**已於 2026-07 全數退役**。
動因：舊架構把大量狀態（地理／身分／關係）壓在「逼小模型即興敘述」上，bug 打不完；
玩家定案 **全砍、原創角色、從零重建**。舊碼在 git 歷史裡（本分支砍除前的 commit）＋玩家本地備份，需要可回溯。

**唯一 salvage 的東西**：`gas/Core.gs` 的 `callGeminiAPI`——OpenRouter → LLM 呼叫核心（含審查降階重試、fallbackModel、JSON/散文兩模式）。其餘全新做。

## 🎯 創作方向：**討論中**（尚未定案·先別動手建）

玩家要先想清楚再建：**核心是什麼／怎麼玩／想表達什麼**。
- 原創角色（不走任何既有 IP）。
- 走不走 LLM、走多少（純選項驅動 VN／LLM 即興／混合）——待定。
- 型別（約會／敘事／其他）、基調（SFW/NSFW）、平台體驗——待定。

👉 **在方向定案前，不要開始寫遊戲邏輯。** 這份錨會隨定案更新。

## 📦 現有骨架（gas/）
- `Core.gs` — `callGeminiAPI`（salvage）＋模型常數（`OPENROUTER_API_KEY`／`MODEL_URL`／`AI_MODEL`·皆讀指令碼屬性）＋ `doGet`（web app 入口·渲染 Index）。
- `Index.html` — 最小空殼頁（建置中）。
- `appsscript.json` — Apps Script 清單（webapp: ANYONE_ANONYMOUS·scopes: spreadsheets ＋ external_request）。

## 🚨 仍然有效的紅線／規矩
1. **branch**：只在 `claude/traditional-chinese-chat-q8ptho` 開發。
2. **兩段式部署**：commit→push→GitHub Action 只跑 `clasp push`（同步代碼進 GAS 專案·不建版不動 `/exec`）。要玩家真的在網頁看到新版，必須**額外手動觸發 workflow_dispatch**（跑 `clasp deploy`）。`push 成功 ≠ 上線`——每次要上線記得多觸發一次 workflow_dispatch、等 `completed/success`、head_sha 對得上，再回報「已上線」。
3. **model id**：`claude-opus-4-8` 不可出現在 commit／PR／程式碼／任何 push 進 repo 的東西。chat 回覆才可講。
4. **`/home/user/GAS`（原始九州 repo）一個字不碰**——那是另一個 repo。本專案在 `/home/user/FATE`。
5. **commit footer**：
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_016XEdY9i7dRc5MWBkSMi9YN
   ```

## ✅ 工作流程
- **驗證**：改完 `.gs`／HTML 內嵌 JS 跑 `bash check.sh`。
- **暫存檔**：放 scratchpad，不污染 repo。
- **PLAYBOOK.md** 留著——通用的部署／Git 陷阱／協作節奏工作手冊（跟舊遊戲內容無關·仍適用）。

## 🧭 紀律
方向定案後，**把定案寫回這份 CLAUDE.md**（核心／玩法／架構決策），別讓下一個失憶的我從零猜。
