# CLAUDE.md — 開工前必讀（每次 session 自動載入）

《東方航路》：打字玩的大航海（1560 年前後的東亞海域），女副官「葉嵐」陪船長說話。Google Apps Script 網頁遊戲。
2026-09-30 舊的《命運停駐之夜》（新聖杯戰爭＋鑑賞）整個清空，改做這個。舊版留在 git 歷史 commit `3dfd6cd`，**別自己搬回來**，要沿用哪一塊先問。

## 🎯 玩家要的（定案）

- **全靠打字玩，底下是真正的 RPG**（參考 RyzaChat:AI）。按鈕越少越好：畫面只有一個輸入框＋可展開的帳本。
- **自由選路線**（太閤立志傳、大航海時代 4 的味道），但**不要做成大型沙盒**（地圖、滿滿選單）。
- **發揮 AI 的優勢**：聽懂任何說法、角色有個性、會記得船長。
- **AI 必須記得買過的東西、價錢、船的細節** → 見鐵則。

## 🧱 鐵則：程式記帳，AI 看帳說話

每回合（`seaTurn_`，Sea_Router.gs）：
1. **翻譯**（`SEA_PARSE_SYS_`，附範例）：AI 把玩家的話翻成動作 JSON；`seaCleanActs_` 把五花八門的寫法（`{"buy":{…}}`、`"action":"買"`、`quantity`、「全部」）統一，只收認得的動作與欄位。
2. **裁判**（`seaApply_`，Sea_Engine.gs）：引擎檢查、真的改狀態、寫帳本；每個動作回一句帶數字的事實。
3. **說書**（`SEA_TALK_SYS_`）：副官依結果、帳本、各港情報（`seaPortIntel_`，只有文字）、去過港口的行情（`st.seen`）回話；`seaNumbersOk_` 檢查回話裡的數字（資料裡有的、兩個資料數字的積／和／差、10 以下），不過就重講，第三次要她不寫數字；還不行才用程式寫的結果。
- **AI 永遠不能直接改數字**。價格、帳本、船況只由引擎算。
- 畫面的狀態列與帳本面板直接顯示引擎的數字（`seaView_`）。

## 📁 檔案

| 檔 | 內容 |
|---|---|
| `gas/Sea_Data.gs` | 世界資料：港口、貨物、船型、航程、規則數字、副官人設。加東西＝往表加一列。 |
| `gas/Sea_Engine.gs` | 純規則：行情、買賣（先進先出算成本）、航行與暴風、修船、補給、雇人、換船、帳本、畫面資料。 |
| `gas/Sea_Router.gs` | 對外 `seaApi`：登入、每回合、重來；存檔讀寫；兩段提示詞；數字檢查。 |
| `gas/Ai.gs` | OpenRouter 呼叫（JSON 模式、重試、後援模型）、簡轉繁。 |
| `gas/Index.html` | 全部畫面（登入、對話、帳本面板）。 |
| `gas/Code.gs` | `doGet`。 |
| `tools/sea_test.js` | 引擎＋回合流程測試（假試算表、假 AI）。 |

- **存檔**：分頁「航海存檔」每個帳號一列（整份狀態 JSON 一格，上限五萬字，帳本留最近 200 筆）；分頁「航海日誌」每回合一列（最後一欄「翻譯結果」＝AI 把玩家的話翻成的動作，除錯先看這裡）。
- **指令碼屬性**：`OPENROUTER_API_KEY`（必填）、`SEA_MODEL`（副官，預設 `MODEL` 或 gemini-3.5-flash）、`SEA_PARSE_MODEL`（翻譯，預設 `CREATION_MODEL` 或 gemini-3.5-flash-lite）、`FALLBACK_MODEL`。

## 🚨 紅線

1. **branch＋兩段式部署**：只在 `claude/traditional-chinese-chat-q8ptho` 開發。push → GitHub Action 只跑 `clasp push`。要玩家看到新版，須**另外手動觸發 workflow_dispatch**（`clasp deploy`），等 `completed/success`、head_sha 對上，才回報「已上線」。
2. **model id**：本模型的 exact 型號 id 不可出現在 commit／PR／程式碼／任何 push 進 repo 的東西。chat 回覆才可講。
3. **commit footer**：
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_016XEdY9i7dRc5MWBkSMi9YN
   ```
4. **台灣繁體**：repo 裡的字用繁體（`check.sh` 會掃）。

## ✅ 驗證

改完必跑 **`bash check.sh`**（引擎＋流程測試、網頁 JS 語法、簡體字），要看到 `✅ 全部通過`。新測試要做一次退化確認（把功能拿掉，測試要會叫）。

## 🧭 教訓

舊版一直往「貼近原作」補劇本，玩家自己的選擇反而不重要。這一版：玩家的選擇與說法是主角，AI 負責讓世界回應，程式負責讓後果是真的。
