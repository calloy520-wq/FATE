# 聖杯之路

Fate 題材的卡牌冒險：從第四次、第五次聖杯戰爭的 14 位從者選一位（每位一套自己的牌與機制：投影劍、石化、毒、軍勢、使魔、架勢、連擊……），走 13 層地圖，打牌、選牌、強化、拿禮裝，最後面對赫拉克勒斯／吉爾伽美什／伊斯坎達爾其中一位。寶具量表滿了放大招，令咒整局只有 3 劃。
Google Apps Script 網頁遊戲；規則全在 `gas/Game.html`，跑在玩家的瀏覽器裡。細節見 `CLAUDE.md`。

- 測試：`bash check.sh`｜平衡：`node tools/sim.js`
- 舊版在 git 歷史：《命運停駐之夜》`3dfd6cd`、《東方航路》`a409b92`。

## 部署
push → GitHub Action 只跑 `clasp push`（不上線）；要讓線上看到新版，手動觸發 workflow_dispatch（`clasp deploy`）。
