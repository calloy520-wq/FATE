# 背景音樂

遊戲從這個資料夾讀取背景音樂（經由 jsDelivr CDN：`https://cdn.jsdelivr.net/gh/calloy520-wq/FATE@main/music/<檔名>.mp3`）。
這個資料夾不會被推上 GAS（`.claspignore` 只推程式檔）。檔案不存在時遊戲會安靜略過或改用替代曲。

| 檔名 | 情境 | 沒有這首時改播 |
|---|---|---|
| `title.mp3` | 登入、創角 | （不播） |
| `day.mp3` | 清晨、白天 | （不播） |
| `night.mp3` | 深夜（沒有 dusk 時黃昏也播這首） | （不播） |
| `dusk.mp3` | 黃昏（可選） | night |
| `battle.mp3` | 一般戰鬥 | （不播） |
| `boss.mp3` | 強敵、決戰 | battle |
| `tension.mp3` | 高警戒、潛入 | night |
| `romance.mp3` | 親吻、擁抱、告白 | day |
| `sad.mp3` | 死亡、失去從者 | night |
| `home.mp3` | 據點休息（可選） | day |
| `ending.mp3` | 通關結局（可選，不循環） | day |

規格：純音樂、60～120 秒可無縫循環、MP3 128kbps、每首 3MB 以內、各首音量一致。倉庫是公開的，放進來的音樂任何人都能下載。
