# CLAUDE.md — 開工前必讀（每次 session 自動載入）

《聖杯之路》：Fate 題材的卡牌冒險（像《殺戮尖塔》）。選一位從者走 13 層地圖，戰鬥、選牌、強化、拿禮裝，最後打 Boss。Google Apps Script 網頁遊戲。

## 🎯 玩家要的（定案，2026-09-30）

- **按鈕跑系統，AI 只負責聊天**。前兩版（打字玩的大航海、按鈕＋AI 旁白的聖杯戰爭）都被說無聊／不如玩原作。
- **原則：把 AI 整個拿掉，只剩按鈕也要好玩。** 第一版完全沒有 AI；核心好玩之後，才加「兩場戰鬥之間跟從者聊天」。
- **不寫原作劇情**：Fate 只是舞台與角色，玩家的牌組與路線才是主角。
- Fate 獨有的系統：**寶具**（出牌累積量表，滿了放大招）、**令咒**（整局 3 劃，關鍵時刻用）。

## 📁 檔案

| 檔 | 內容 |
|---|---|
| `gas/Game.html` | 遊戲引擎＋資料（卡牌、從者、敵人、遭遇、禮裝、地圖、戰鬥規則）。全部跑在玩家瀏覽器裡。加東西＝往表加一列。 |
| `gas/Index.html` | 畫面（標題、選從者、地圖、戰鬥、戰後選牌、寶箱、休息、結局）。只顯示與把按鈕轉成 `G.*` 動作。 |
| `gas/Code.gs` | `doGet`、`include`。 |
| `tools/game.js` | 在 node 載入引擎。 |
| `tools/game_test.js` | 引擎測試。 |
| `tools/sim.js` | 自動玩家（`N=300 WHO=saber node tools/sim.js`）：看勝率、死在哪一層。 |

- **存檔**：瀏覽器 localStorage（`grail_run_v1`），整局狀態一份 JSON。之後要跨裝置再改存試算表。
- **平衡現況**（自動玩家）：Saber 約 45%、Archer 約 47%；多數死在 Boss，其次是第 8～11 層。調數字先跑 `sim.js`。

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

改完必跑 **`bash check.sh`**（引擎測試、自動玩家跑得完、網頁 JS 語法、簡體字），要看到 `✅ 全部通過`。新測試要做一次退化確認。

## 🗄️ 舊版（git 歷史，別自己搬回來）

- 《命運停駐之夜》（新聖杯戰爭＋鑑賞＋英靈工房）：commit `3dfd6cd`
- 《東方航路》（打字玩的大航海）：commit `a409b92`

## 🧭 教訓

照抄原作（Fate、大航海）做得再像也比不上原作；純跟 AI 聊天，Gemini 就做得到。這一版靠「按鈕系統本身好玩」立足，AI 之後只當調味。
