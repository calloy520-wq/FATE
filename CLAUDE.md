# CLAUDE.md — 開工前必讀（每次 session 自動載入）

這個 repo 目前是**空殼**（2026-09-30 玩家決定全部清除）。`gas/` 只有 `Code.gs`（線上顯示「重新製作中」）與 `appsscript.json`。

舊東西都在 git 歷史，**別自己搬回來**，玩家要用哪一塊會自己說：
- 《命運停駐之夜》（新聖杯戰爭＋鑑賞後日談＋英靈工房）：commit `3dfd6cd`
- 《東方航路》（打字玩的大航海，副官葉嵐）：commit `a409b92`

## 🚨 紅線

1. **branch＋兩段式部署**：只在 `claude/traditional-chinese-chat-q8ptho` 開發。push → GitHub Action 只跑 `clasp push`。要玩家看到新版，須**另外手動觸發 workflow_dispatch**（`clasp deploy`），等 `completed/success`、head_sha 對上，才回報「已上線」。
2. **model id**：本模型的 exact 型號 id 不可出現在 commit／PR／程式碼／任何 push 進 repo 的東西。chat 回覆才可講。
3. **commit footer**：
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_016XEdY9i7dRc5MWBkSMi9YN
   ```
4. **台灣繁體**：repo 裡的字用繁體。

## 🧭 教訓（兩次都被說「不如直接玩原作」）

- 照著現成的遊戲做（Fate、大航海），做得再像也比不上原作。
- 玩家也覺得「不如直接跟 Gemini 玩」：單純跟 AI 聊天說故事，通用聊天機器人就做得到。
- 要再做，先回答「這個能給什麼是原作和直接跟 AI 聊天都給不了的」，答不出來就別動手。
