# 命運停駐之夜 — GAS 後端

Google Apps Script 後端。第一塊：**自動建表 + 種子資料**。

## 安裝步驟

1. 開一個新的 **Google 試算表** → 上方選單「擴充功能」→「Apps Script」。
2. 把本資料夾的 `.gs` 檔全部貼進專案（檔名隨意，內容對應即可）：
   - `Config.gs`：分頁名稱、欄位、平衡常數、OpenRouter 設定
   - `SeedData.gs`：英靈殿/地圖/戰爭/規則/道具 種子資料
   - `Setup.gs`：建表與種子主程式
3. 左側「專案設定」→「指令碼屬性」→ 新增：
   - `OPENROUTER_API_KEY` = 你的 OpenRouter API key
4. 回編輯器，選函式 `setupDatabase` → 執行（第一次會要求授權）。
5. 回試算表，會看到 10 張分頁建好、英靈殿與地圖已填入樣本。
   （試算表選單也會多一個「聖杯戰爭 → 建立／重建資料庫」。）

## 建出來的分頁

**靜態定檔（會種子）**
| 分頁 | 內容 |
|------|------|
| 英靈殿 | 第四次/第五次七騎 + FAKE 樣本（15 筆） |
| 地圖 | 冬木市 13 定點 |
| 戰爭範本 | 4th / 5th / FAKE |
| 世界規則 | 餵 AI 的底線規則 |
| 道具圖鑑 | 輕量消耗品/催媒 |

**動態存檔（只建表，不動資料）**
| 分頁 | 內容 |
|------|------|
| 帳號 | ms_id 主鍵 / 玩家名 / current_game / 道具 / 設定 |
| 戰場 | 每列一位參戰者（御主+從者合併），8 列/場 |
| 記憶 | EAV 事實表（捕捉玩家自由發揮） |
| 事件 | EventLog（多人相容，actor/target 多型） |
| 時鐘 | 日/時/AP/補魔倒數 |

## 平衡控制

所有平衡集中在 `Config.gs` 的 `TUNING`：HP/MP 係數、維持費除數、狂化倍率、供給係數、靈脈表、戰鬥耗魔、AP/補魔。改這裡＝整個經濟平移。

## 重跑安全

`setupDatabase()` 可重複執行：靜態分頁會重新種子，**動態分頁不會被清空**。

## 下一步（尚未做）

- `Api.gs`：`doGet`(載入 Web App) / `doPost`(動作路由)
- `Engine.gs`：戰鬥/經濟/移動/補魔/令咒 數值引擎（移植原型算式）
- `LLM.gs`：`callLLM()` 包 OpenRouter（UrlFetchApp + JSON 結構化輸出）
- `WebApp.html`：把 `prototype/index.html` 的 `SERVER` 換成 `google.script.run`
