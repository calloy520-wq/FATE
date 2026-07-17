# CLAUDE.md — 開工前必讀（每次 session 自動載入）

## 🌱 現況：白紙一張（2026-07 全砍重建）

舊專案（FATE 聖杯戰爭 ＋ 鑑賞後日談 ＋ 九州模擬）**已於 2026-07 全數退役**。
動因：舊架構把大量狀態（地理／身分／關係）壓在「逼小模型即興敘述」上，bug 打不完；
玩家定案 **全砍、原創角色、從零重建**。舊碼在 git 歷史裡（本分支砍除前的 commit）＋玩家本地備份，需要可回溯。

**唯一 salvage 的東西**：`gas/Core.gs` 的 `callGeminiAPI`——OpenRouter → LLM 呼叫核心（含審查降階重試、fallbackModel、JSON/散文兩模式）。其餘全新做。

## 🎯 創作方向：**討論中**（尚未定案·先別動手建）

玩家要先想清楚再建：**核心是什麼／怎麼玩／想表達什麼**。

### 已收斂（2026-07 討論·會再長）
- **想表達**：讓玩家和角色建立一段**有溫度、而且她始終是「她自己」**的關係；追那個「喔~對，這個人如果真的存在，就是這種感覺」的**靈光一現**。
- **設計哲學（核心）**：
  - **確定性骨架扛事實**（她在哪/誰是誰/狀態）——永不出戲、永不崩壞。
  - **LLM 只管「聲音」·鬆繩、不逼方向**——火花是【湧現】不是【命令】，越往「要感人」逼、它越變刻意演出（舊專案死因）。給它真材料＋自由，讓它偶爾發光。
  - **玩家淘金**——不追每句都中；發光的那幾刻由玩家【釘住】成關係的記憶，misses 像水流走（骨架撐著、畫面不壞）。
  - 角色的界線是**她的真實**（受過傷/守心），不是數字閘門在後面喊「快演」；閘門只管「這一幕能不能發生」（結構），不管「怎麼演」（交給她自己）。
- **平台**：留在**網頁**（手機開網址就能玩·Gemini 已接·NSFW 自由自架·全控制）。不搬 RPG Maker。
- **呈現**：VN 版面（對話框＋名牌＋逐字打字）；立繪＋**表情差分**（後端/LLM 吐情緒 tag → 前端換 `<img>`）。
- **圖路徑：C→A**——先**純文字/佔位**起步（把「聲音＋系統」跑起來、最快驗證對不對味）→之後補 **AI 生圖**差分（圖是可換的皮·引擎不在乎那張圖是什麼）。
- **原創角色**（不走任何既有 IP）。

### 仍待定
- 第一個角色是誰（火花的起點是角色，不是系統）。
- 核心遊玩 loop（一次遊玩在做什麼）。
- 基調尺度（SFW/NSFW 到哪）、幾個角色（單一深交 vs 小群）。

👉 **在上面「待定」補齊前，不要開始寫遊戲邏輯。** 這份錨會隨定案更新。

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
