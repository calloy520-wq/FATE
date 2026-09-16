# CODE_NOTES.md — 代碼備註總冊（**為什麼**這樣寫）

> 玩家原話：「只有妳會看這些註解，請整理到一起，我不會去看那些註解。」
> 所以 `gas/*.gs` 裡的**故事**全部收在這裡；程式碼那邊只留**一句話**說它在做什麼。
>
> 搬進來的是：踩過的坑（`🐛→✅`）、稽核抓到的漏洞、玩家的原話、每次改版的理由。
> 這些刪掉就再也長不回來——**是這個專案最貴的部分**，只是不該擠在程式碼中間。

## 怎麼用

- **查**：每則掛在一個**錨點**（最近的函式／常數／action 名）底下。在 `gas/` 看到某個函式、
  想知道它為什麼長這樣，就用**同一個名字**在這份檔案裡搜。代碼裡若看到 `（全文見 CODE_NOTES.md）`，
  代表那行是被截短的摘要，全文在這。
- **寫**：以後在代碼裡要解釋「為什麼」超過一兩句時 → 寫進這裡、掛在函式名下。
- **搬家**：函式改名時這裡的錨點要跟著改（跟 `FUNCTION_MANUAL.md` 同一個紀律）。

## 整理紀錄

| 輪次 | 搬走的東西 |
|---|---|
| 2026-09 第一輪 | `gas/*.gs` 裡**≥3 行**的註解區塊，565 則 |
| 2026-09 第二輪 | 剩下的 **1~2 行純歷史**註解（`🐛→✅`／稽核抓到／玩家「…開頭），81 則 |

驗證方式（兩輪都跑過）：**程式碼零改動**——把新舊兩版的註解全部剝掉後，19 個 `.gs` 檔逐位元相同；
**零遺失**——每一行被刪的註解，其文字都能在本檔中找到。

## 目錄

- `gas/Account.gs` — 9 則
- `gas/Core_Settings.gs` — 38 則
- `gas/Engine_Combat.gs` — 5 則
- `gas/Engine_Fate.gs` — 36 則
- `gas/Gallery.gs` — 258 則
- `gas/History_Sync.gs` — 3 則
- `gas/Mystic_Code.gs` — 3 則
- `gas/Router_Action.gs` — 32 則
- `gas/Router_Battle.gs` — 63 則
- `gas/Router_Bond.gs` — 32 則
- `gas/Router_Creation.gs` — 45 則
- `gas/Router_Economy.gs` — 4 則
- `gas/Router_Movement.gs` — 53 則
- `gas/Router_Narrative.gs` — 7 則
- `gas/Router_Persona.gs` — 15 則
- `gas/Seed_Codex.gs` — 9 則
- `gas/Seed_Rivals.gs` — 8 則
- `gas/Setup_FateWorld.gs` — 3 則
- `gas/Time_World.gs` — 23 則

---

## `gas/Account.gs`

### `verifyPcOwnership_`　<sub>Account.gs:15</sub>

🔒 單一真實來源：solo(PC_)／鑑賞(KPC_) 共用的「這個 pcId 真的屬於這個帳號嗎」驗證。比照 actionEndRun 原本各自手寫的反查「帳號」表寫法抽出，讓 handleGameAction 能在dispatch 前統一擋下「猜中/枚舉他人 pcId 即可代操作」這整類漏洞，不必每個 handler 各自補。

### `findPcRowByCharId_`　<sub>Account.gs:32</sub>

依 charId 找「眾生」列，含已標記 DEAD_ 的殘局列：帳號表存的是原始 charId，御主死亡時ID 會被加上 "DEAD_" 前綴但帳號連結不會跟著改，故兩者都要查。actionAccountLogin／actionAccountNewGame 皆靠這條反查殘局的 game_id 以便整局清除。

### `purgeGameData_`　<sub>Account.gs:51</sub>

清理某 game_id 的整局資料（眾生，關係已併入列自身欄位，刪列即刪關係），並解除帳號連結。preData 可選：呼叫端若已有整表快照可傳入省一次讀取，不傳則自己讀。accIdx 可選：呼叫端若已查過帳號表拿到列索引(findAccountRow_的結果)可傳入省一次帳號表整表重讀，不傳則自己用 accountName 查一次(相容舊呼叫)。

### `actionEndRun`　<sub>Account.gs:86</sub>

🔒 稽核抓到：原本純用pcId(格式"PC_"+時間戳，可預測)裸find，完全沒驗證acctName是否真的擁有這個pcId——等同任何人皆可猜/枚舉pcId替別人結束並清空整局存檔。改比對帳號表COL.ACC.PC實際連結的charId，不符直接拒絕。

### `actionEndRun`　<sub>Account.gs:91</sub>

🐛→✅ 稽核抓到：found.idx早就查過了，這裡再傳acctName字串會讓purgeGameData_內部又整表重讀一次「帳號」表——直接傳found.idx省掉這次重讀。

### `actionAccountLogin`　<sub>Account.gs:117</sub>

🐛→✅ 稽核抓到：帳號名稱欄位從未鎖成純文字格式——玩家若取純數字帳號(如"0123")，Sheets在「自動」格式下寫入時會把看似數字的字串自動轉型(去前導零/長數字轉科學記號)，下次登入時findAccountRow_的字串比對永遠對不上，等於每次登入都被誤判成「找不到」而another建一列，玩家存檔被鎖在第一列、永遠連不回去。寫入前先鎖該格為純文字，避免自動轉型。

### `actionAccountNewGame`　<sub>Account.gs:192</sub>

🐛→✅ 稽核抓到：原本自行重寫一份刪除迴圈，沒像 purgeGameData_ 一樣同步清「歷史暫存」表——開新局是玩家最常見的棄局路徑，一直沒清會讓歷史表持續累積孤兒列。gid存在時直接共用purgeGameData_(含歷史清理)；gid為空(孤兒charId，無對應game_id世界)才維持原本單獨刪列+ 補一次歷史清理，兩種情況都不再遺漏。

### `actionPurgeOrphans`　<sub>Account.gs:210</sub>

🧹 清殘列：清掉無帳號連結的 game_id 世界(敗北殘局/棄局/亡靈)＋DEAD_列，避免眾生表養肥拖慢整表掃描。安全準則：不碰帳號當前連結的活躍戰局／game_id空白列；鑑賞(KPC_)在另表「鑑賞眾生」不受影響。一次性整表 rewrite(setValues + 單次 deleteRows tail)，遠快於逐列 deleteRow。

⚠ 孤兒判定只讀「帳號」表的 COL.ACC.PC(solo 連結)、不讀 COL.ACC.KPC(慾海連結)——若此 action 被以

KPC_ 呼叫，dispatcher 會把 sheets.pc 路由到「鑑賞眾生」，liveGids 對不上 k_ 開頭的 game_id 而誤清整張表。

KANSHOU_BLOCKED_ACTIONS_ 已擋下 KPC_ 呼叫，這裡再加一道結構性防線：直接指名讀「眾生」表。

### `actionPurgeOrphans`　<sub>Account.gs:234</sub>

🐛→✅ 稽核抓到：這裡原本沒同步清「歷史暫存」——違反History_Sync.gs自己的設計前提(結束局要清孤兒pcId的歷史列，否則表無上限成長)，比照purgeGameData_補上。

---

## `gas/Core_Settings.gs`

### `AI_MODEL` / `FALLBACK_MODEL`　<sub>Core_Settings.gs</sub>

🔀 2026-09 玩家定案「我只要 SOLO、鑑賞同一顆 + 被擋的後援，其他都不要」：原本 AI_MODEL／SOLO_MODEL／UNLOCKED_MODEL 三顆常數（各自綁不同軌、不同分支）收斂成兩顆——AI_MODEL(google/gemini-3.5-flash-lite) 兩軌共用，FALLBACK_MODEL(x-ai/grok-4.20) 只在被審查擋下／重試全敗時由 callGeminiAPI **全域自動**換上。

之所以把後援從「呼叫端各自傳 fallbackModel」改成全域預設：舊寫法只有鑑賞 actionPlay 傳，solo 任何一條路被擋死就沒救；後援是全域行為、不該是某個呼叫端的特例。

⚠ 指令碼屬性 MODEL／FALLBACK_MODEL 若有設值會蓋過程式碼預設——換模型沒生效就先去 Apps Script 看那兩個屬性。舊的 SOLO_MODEL／UNLOCKED_MODEL 屬性從此無效（讀都不讀）。

### （檔案層級）　<sub>Core_Settings.gs:41</sub>

關係欄(原 REL 表)：NPC 對本世界御主的關係。BOND=好感值、REL_TAG=關係標籤、IS_PARTY=同行旗標、REL_MEM=關係專屬記憶(與角色 MEMORY 分開存)。御主自己這一列不使用(留空)。

MEMOIR(27)：鑑賞「共同回憶」——原 MAJOR_EVENT 死欄(讀寫端早移除、恆空)於 2026-07 復用為每個同伴一格的共同回憶敘事(AI 每回合吐 memory 一句、GAS append 去重存最近 N 條，機制同專屬稱呼)。COL 是位置索引，沿用 27 槽、不新增欄、不位移。solo 不使用(留空)。

### （檔案層級）　<sub>Core_Settings.gs:57</sub>

🔵 英靈殿(從者範本)、御主殿（戰鬥 fx 走 hasFx_＋SEED_SERVANTS 的 skills/traits JSON，不需 COL 索引；戰鬥標籤分頁已棄）

DAILY_LOOK/DAILY_WORDS：鑑賞用日常版外貌/性格，與戰時 PERSONA(look/words)分開存；懶惰快取，首次召喚進鑑賞才由AI轉換寫入(heroToKanshouRow_)，之後直接讀取不重複呼叫AI。空字串＝尚未轉換。附加尾端不動既有欄位位置(COL 是位置索引，見專案紀律)。

DAILY_MOE：鑑賞用日常萌點，與戰時 PERSONA.moe(常靠戰爭/創傷撐出的沉重萌點)分開存——鑑賞世界沒發生過戰爭，改用輕量溫馨的日常版萌點，來源同上(translateMoeToDaily_)。

DAILY_OUTFIT：服裝從 DAILY_LOOK 拆出獨立欄位，DAILY_LOOK 改為四段[外貌本相][氣質舉止][自稱口氣][私密一面]，對齊 PERSONA.traits/PREF 格式。SOLO(戰時 PERSONA.look) 獨立一套不受影響。

### （檔案層級）　<sub>Core_Settings.gs:66</sub>

ALIGN(15)：陣營標籤(如「混沌・善」)，附加尾端不動既有欄位位置。原本 SEED_MASTERS 沒這格，masterToNpcRow_ 寫敵御主眾生列時 COL.PC.ALIGN 永遠空——enemyMasterCard_ 讀陣營的那段邏輯看似有跑、實際上從沒讀到值(2026-07 補上單一真實來源)。

### （檔案層級）　<sub>Core_Settings.gs:70</sub>

帳號（存檔身分）：帳號名 → 目前御主角色ID。

KPC(鑑賞角色ID)：由伺服器端 linkAccountToKanshouPc_/getAccountKanshouPcId_ 專責讀寫，比照 solo

「連結存在外部表、玩家端無法影響」，結構上不可繞過冒充。

### `rankVal`　<sub>Core_Settings.gs:81</sub>

🐛→✅ 純"-"佔位(無官方階級，如佐佐木小次郎的寶具六圍)：去掉"-"後沒有半個字母可查——舊版仍照樣把這同一個"-"字元當「減號修飾」再扣一次3，讓"-"算出比真正的E(10)還低的7，跌破多處 rankVal(...)>=10 的「有無寶具」判斷門檻。沒有字母就沒有可修飾的基準，直接視同E、不套用+/-加減，才對得上註解與資料原意的「保底吃E」。

### `buildTrajectoryDigest_`　<sub>Core_Settings.gs:108</sub>

solo 軌跡骨幹：AI 從敘事散文反推精確狀態(好感/血量/天數)容易猜錯，改由 GAS 組一段「已確定事實」接在歷史前當錨點。吃呼叫端(narrateWithState_)已讀的同一份 pcData，不重讀表。刻意只做當下快照、不做累積事件清單，避免重蹈已砍除的「因果/命運長河」(存太多筆反而抓不到重點)。

### `clampCircuits_`　<sub>Core_Settings.gs:146</sub>

御主(凡人魔術師)HP/MP：唯一核心數值＝魔術迴路(財力/身世決定)。共用魔力池制：從者無獨立魔力池，與御主共用一池(存御主MP)，池上限＝御主迴路×10＋同隊從者魔力×2(見masterPoolMax_)。masterMaxHpMp_ 只給「尚無從者」基底(迴路×10)；血由迴路×2。

迴路骰子範圍(12~50)——跟前端骰子UI(Script_Onboarding.html)夾值範圍一致，三處各自硬寫過同一組數字，改這個範圍務必連 Script_Onboarding.html 那處也一起改(HTML端跨執行環境不共用此函式)。

### `masterMaxHpMp_`　<sub>Core_Settings.gs:154</sub>

🛡️ parseInt(x)||30 只擋得住NaN/0，擋不住負數——前端骰子UI本就夾在12~50，但這裡是唯一信任邊界(直打API可繞過前端)，補上下限，避免負迴路生出0血/負魔力的御主。

🐛→✅ 舊版只擋下限沒擋上限——直打API送circuits=999999能生出HP/MP近乎無限的御主，且這個值會永久寫進MEMORY【迴路】標記，之後masterPoolMax_每次重算共用魔力池都沿用這個灌爆的數字，貫穿補魔/供魔/戰鬥整個系統。補上跟前端骰子UI相同的上限(50)。

### `OUTPUT_TIERS_`　<sub>Core_Settings.gs:172</sub>

🔋 從者靈基出力檔位（玩家手動旋鈕，存從者 MEMORY【出力】）：從者無自有魔力，靠御主供魔的「出力」決定戰力與耗魔。檔位→{ hit 命中加減, dmgMul 傷害乘子, drainMul 御主每小時維持費乘子, np 是否可解放寶具, label }。100% 全開最強但燒御主最兇、且唯一能放寶具的檔；60% 基準無加成；20% 僅維持靈基、低出力有明顯懲罰。

### `findPcRowIdx_`　<sub>Core_Settings.gs:226</sub>

AI 呼叫後寫回前的列重定位索引：play/backfill 因 AI 呼叫耗時被豁免寫入鎖(LOCK_EXEMPT)，用的是呼叫前讀到的列索引；期間若其他上鎖動作刪列(清殘列/登入自動清)，索引會位移錯位。此函式單欄窄讀(只讀ID欄，非整表)回傳 {id → 當下真實列索引(0-based)}；ID已消失(列被刪)則查無，呼叫端跳過。

🆔 單一真實來源·找出眾生列裡的指定角色：id 對得上優先(同 game_id 內恆唯一，不受同名/子字串前綴/別名困擾)；只有 id 缺席時才退回名字比對(供舊呼叫/前端未帶id的過渡路徑用)。這條規則專治一整類反覆出現的bug——凡是「系統內部自己判斷這是哪個角色」(前端按鈕點誰/MEMORY硬連結/結盟對象查找)都該走這支、優先吃id；只有跟AI自由生成文字對帳(如narration提到的真名)才不得不退回名字，那條路本就無法避免模糊、該用kanshouNameCandidates_這類別名表處理，不歸這支管。opts: {id, name, gid, faction, loc, excludeIdx, aliveOnly=true, nameCandidates, normalize}nameCandidates(name)：可選，傳自訂候選產生器(如kanshouNameCandidates_)取代預設的「僅trim精確比對」。normalize(s)：可選，比對前套用在候選字串與該列真名兩側(如nameLoose_去除分隔符變體)，預設原樣trim。

### `findPcRowIdx_`　<sub>Core_Settings.gs:240</sub>

共用篩選(game_id/存活/陣營/地點)——id路徑跟名字路徑都要套，id只是「認人」這一步的捷徑，不能

順便繞過「她此刻是否真的在場/仍在世」這些遊戲規則本身要求的條件(不然id快取到舊值，會讓玩家

對一個其實已經不在場的人牽手/邀約成功)。

### `dmgSeverityWord_`　<sub>Core_Settings.gs:272</sub>

🩸 傷勢嚴重度中文詞（單一真實來源）：dmg 佔 hpMax 比例 ≥40%＝重創／≥15%＝負傷／否則擦傷。hpMax 為 0/falsy 時比照既有呼叫端「查無上限就當最嚴重」的既有慣例，比例夾為 1(必為重創)。Router_Movement.gs(撤退追擊／歇息夜襲／趁隙偷襲) ＋ Router_Bond.gs(相處遭突襲) 共用同一條件鏈，別各自重寫這條 ratio 判斷。

### `ambushDispatchPrompt_`　<sub>Core_Settings.gs:281</sub>

⚔️ 卸防突襲三分派樣板（單一真實來源）：enemyAmbushOnServant_ 回傳的 ambush 物件只有三種去向——①homeRepel/peaceful(陣地反擊·優雅擊退／按兵不動·試探接觸，文案已在 ambush.repelNote 現成)②真突襲命中(需呼叫端自組「被打斷」的專屬敘事，各處措辭不同，故用 callback)③無突襲(呼叫端自組「正常結果」的敘事，同樣用 callback，可在其中再自行細分milestone等子分支)。補魔/靈基修復/相處/盟友交流/歇息 五處突襲呼叫端共用同一套分派邏輯，各自只帶自己的文案 callback，不重寫這三分支判斷。interruptedFn(ambush)/normalFn() 皆回傳字串(aiPrompt)。

### `chargeApOrReject_`　<sub>Core_Settings.gs:293</sub>

⏳ AP門檻＋扣AP＋時鐘標籤（單一真實來源）：cost/rejectMsg 依呼叫端自訂；opts.isFate 未帶就自己依 gameId 是否 "g_" 開頭判斷（鑑賞 k_ 局一律視為不擋、不耗AP，回傳{ap:AP_PER_DAY, clock:""}，比照各呼叫點既有「非Fate局不擋」慣例）；opts.skipWrite 透傳給 spendAp_(呼叫端結尾另有整表/整列批次寫回時傳true，省掉 spendAp_ 自己那道窄寫入)。門檻不足回傳 {reject:{success:false,needRest:true,message:rejectMsg}}——呼叫端請直接`return JSON.stringify(apr.reject)`；足夠則扣AP＋回傳 {ap, clock}。⚠ 各呼叫點原本大多在函式前段就已有一道獨立的「門檻不足→提前 return」guard(擋在任何寫入/扣費之前，避免門檻不足時仍留下半吊子副作用)，此函式故意只在原本「扣AP＋算時鐘」那個位置呼叫、不去取代前面那道 guard、也不把扣AP時間點提前——部分呼叫端在扣AP前後有依賴當下(扣AP前)day/hour的計算(如趁隙偷襲 playerAmbushOnEnemy_ 的【提防】冷卻窗口判斷)，提前扣AP會讓那類判斷不小心吃到扣費後的時間，是本次重構刻意迴避的邊界風險——因此這裡的門檻檢查在實務上多半已被前面那道 guard 擋過一次，屬防禦性複查、非多此一舉。⚠ 2026-07 再稽核確認：目前全部14處呼叫端都只解構{ap,clock}，沒有任何一處真的檢查`.reject`——因為呼叫前都已經有前述獨立guard擋過，`.reject`分支在現有呼叫模式下實際上永遠打不到，是預留但目前吃不到的死路徑。新增呼叫點若打算只靠這支函式擋門檻(不自帶前置guard)，務必自己補上`if (apr.reject) return JSON.stringify(apr.reject);`，否則門檻不足時{ap:undefined,clock:undefined}會混進成功回應(JSON.stringify會把這兩個undefined的key整個省略掉，前端讀不到但也不會報錯)。

### `setOutfit_`　<sub>Core_Settings.gs:313</sub>

🐛→✅ 舊版只濾 MEMORY 分隔符，沒濾 HTML 斷字字元——換裝文字最終會被 Script.html 原樣拼進innerHTML(裝扮那一行)且未過 escapeHtml，跟同一批已修過的 realName/np/技能名同一類缺口，補上。

### `masterSynergySix_`　<sub>Core_Settings.gs:326</sub>

主從synergy（原作設定「御主供魔／契合度提升從者能力」）：特定主從組合回到全盛六圍。目前只：恩奇都 ↔ 銀狼（獵犬御主，原作真正的御主——以銀狼為觸媒召喚、令咒落在狼身上）→ 全能力 A、寶具 A++。其餘御主（含玩家自召）下恩奇都維持削弱基線。讀從者列 MEMORY【御主】名判定；在 rowToCombatant_ 套用。

### `makeIntTag_`　<sub>Core_Settings.gs:341</sub>

MEMORY 標記共用工廠：收斂 Router_Battle.gs/Router_Movement.gs 多組結構相同的數值型/文字型 get/set正則邏輯。海怪護盾(三值複合)/魔境·符文(需白名單驗證)/換裝·武裝(需字元過濾+截長度)形狀差異大，刻意不硬套，維持獨立實作(見 FUNCTION_MANUAL.md)。

數值型：get 回 parseInt 或預設值；set 移除舊標記(含意外重複)並清理殘留的｜｜或前後｜再附加新值，較舊版單次test+原地replace更能處理「MEMORY 字串意外重複標記」的邊界狀況。

### `makeTextTag_`　<sub>Core_Settings.gs:359</sub>

文字型（無驗證/截長度，給已受信任的內部字串如地點名用；換裝/武裝需過濾使用者輸入，維持獨立實作）：set 沿用舊版「單次test+原地replace，找不到才附加」寫法，行為與 getWorkshop_/getScavengedLoc_ 等既有實作一致。

### `makeTextTag_`　<sub>Core_Settings.gs:369</sub>

🛡️ 寫入值一律先剝掉 MEMORY 的結構字元：｜是標記分隔符、【】是標記邊界，混進值裡會把整條MEMORY 切錯格(後面所有標記靜默失效或被誤讀)。舊版只在 kanshouStampFirst_ 一個呼叫端做這件事——那是「只修犯錯那處」，其餘 TextTag(【口吻】/【裝扮】/【晨間餘韻】/【夜訪客】…)全裸奔。移到工廠這裡＝所有現有與未來的 TextTag 自動受保護，單一真實來源。

### `getOutfit_`　<sub>Core_Settings.gs:391</sub>

👕 從者換裝（存從者 MEMORY【換裝】<服裝文字>）：玩家自訂當前【服裝穿著】·疊在種子外貌本相之上餵給 AI 敘述——只換衣不換人(五官/髮色/體態/氣質仍依 persona.look)。純外觀·不碰數值。get/set/clear 成套；清空＝恢復本相。｜【】換行皆為 MEMORY/提示分隔字元 → set 時剝除，限 40 字，守住寫表冪等與提示安全。

### `getWeapon_`　<sub>Core_Settings.gs:399</sub>

玩家自定武裝：武器/戰鬥方式存 MEMORY【武裝】<文字>，servantCard_ 讀後強制 AI 以此為準——蓋過職階慣例(Saber=劍/Lancer=槍…)與該真名的原典武器習慣(如「Saber斯卡哈仍拿槍」)。get/set/clear 成套(鏡射換裝)；清空＝恢復依職階/原典自然演出。限 30 字。

### `mageRealmPool_`　<sub>Core_Settings.gs:413</sub>

🔮 魔境的智慧（斯卡哈專屬·玩家可選被動）：影之國女王通曉常見武技，玩家點選【1 個】通用 A 階被動標籤套用。只給「有階級的常見被動」——不含原初符文(她本有)、不含無階級特性、不含寶具/簽名級招式。存從者 MEMORY【魔境】fx。注入點：rowToCombatant_（戰鬥讀取時把選定標籤加進 skills，r 固定 A）。前端只對有 mage_realm 的從者露出選盤。

### `MOE_STORE_MAX_` / `clampMoe_`　<sub>Core_Settings.gs</sub>

萌點(COL.PC.INTENT)的落地上限。所有提示詞一律對 AI 宣告「限18字·務必寫完整一句話不可斷在句意未完處」，落地卻留 30 字緩衝——AI 稍微超字數時不至於被砍在句意中間，這個「說 N 砍 N+緩衝」是本專案既有慣例。
2026-09 稽核抓到的漏洞：七個寫入點各自手寫 slice 數字，其中五處是 30、兩處是 18（`actionSummonServant` 從英靈殿重召、`Seed_Rivals.gs` 複製敵從者）。而 `recordOriginalHero_` 把 AI 原創英靈的萌點是用 30 存進 persona 的——**存 30、讀 18**，同一句話在重召或被當敵從者時就會被腰斬成半句，而且是靜默的。這正是當年那三處註解「比照 slice(0,18) 腰斬修正」要修掉的形狀，只是漏了這兩處。根源解是把數字收成單一真實來源，而不是再補第三次。

### `TRAIT_SEG_MAX_` / `TRAIT_SEG_HINT_`　<sub>Core_Settings.gs</sub>

四格短句(外貌 TRAIT／性格 PREF)的落地硬上限(30)與提示詞對 AI 宣告的字數(14)，同一套「說 N 砍 N+緩衝」。
`parseTraitsHelper` 每格 `slice(0, TRAIT_SEG_MAX_)` 是靜默腰斬，但 2026-09 稽核前**沒有任何一支生成四格的提示詞提過這個數字**——AI 只被告知「簡短詞組／精簡收束」，沒有錨。最容易爆的是鑑賞日常外貌的第三格（當時是固定格式「自稱「X」，」先吃掉 6 字，剩下才寫口氣；2026-09 自稱退休後這格純寫口氣、壓力小了）與第四格（要求 show-don't-tell 的具體小動作，寫具體就長）。
14 這個數字是量出來的：`Seed_Codex.gs` 25 位種子從者的手寫 dailyLook 四格實測 4~16 字（平均 9.2/6.2/12.2/10.2），dailyWords 四格最長 10 字。宣告 14、硬砍 30，AI 照著寫就落在種子庫同一個風格帶裡，緩衝純粹當保險。
掛這條規則的提示詞共六處：`translateLookToDaily_` ①look、`translatePersonalityToDaily_` ③、`enrichPersonalityLikesDislikes_`、solo 御主 backfill 的四格格式鐵律、工房 flavor 補完、自訂從者召喚。加新的四格生成點時要一起帶上。

### `TRAIT_SLOTS_` / `traitParts_` / `traitLabeled_`　<sub>Core_Settings.gs・Router_Persona.gs</sub>

2026-09 玩家「是不是 取消自稱這個設定....感覺太細 很亂」。量了一下：25 位種子從者裡自稱「我」17 位（68%·零資訊量）、
狂化標記 2 位（與口吻完全重複）、真的有特色的只有 6 位（俺／拙者／吾／余／我們／本小姐）。
而同一份自稱**同時活在四個地方**：特徵第3格、`servantCard_` 卡頭、MEMORY 的【第一人稱】標記、鑑賞的【口吻】。
單一真實來源收斂到**口吻**一處：有特色才寫進去（`自稱「吾」・居高臨下`），是「我」或狂化標記就不寫。

特徵因此從四格收成三格（外貌本相／氣質舉止／卸下心防的私密一面）。
**沒有動存進表裡的舊值**——舊局仍是四格、第3格是自稱，`traitParts_` 是讀特徵格的唯一入口，
長度 >`TRAIT_SLOTS_` 就地 `splice(2, …)` 剝掉。刻意用長度判斷而不是比對開頭是否為「自稱」：
舊資料裡那格不保證有「自稱」兩字（玩家改命可以填任何東西），比對字面會漏。
`traitLabeled_` 是三張角色卡（`servantCard_`／`masterCard_`／`enemyMasterCard_`）的共用出口，
免得同一件事在三處各修一次——`servantCard_` 裡原本就有一段「第3格開頭是自稱就就地清掉」的手工補丁，這輪整段拆掉了。
前端鏡射在 `Script.html` 的 `traitSegs_`，**兩邊要一起改**。

⚠ 加 TRAIT 寫入點時：`parseTraitsHelper` 要傳第三參數 `TRAIT_SLOTS_`，而且 **defaultStr 也得是 3 段**。
段數不對齊會補出錯位的格——`Seed_Rivals.gs` 敵御主的 fallback 原本是「外貌平凡、舉止從容、**通曉魔術**、深藏心事」，
第3格不是自稱，照抄不改就會被剝掉「通曉魔術」、把「深藏心事」擠掉。

### `parseTraitsHelper`　<sub>Core_Settings.gs:459</sub>

終極防呆：清除 AI 雞婆加上的標籤與數字 (例如 "1.", "日常表象:", "氣質舉止:" 等)。標籤清單需對齊

FATE 的 TRAIT/PREF 分格（TRAIT 2026-09 起是 [外貌]/[氣質舉止]/[私密一面] 三格、PREF 仍是 [日常表象]/[真實內裡]/

[喜歡的事物]/[討厭的事物]，見 Gallery.gs/Router_Creation.gs 系統提示詞）——舊九州詞彙攔不到

AI 實際會誤加的標籤字。

### `parseTraitsHelper`　<sub>Core_Settings.gs:466</sub>

🩹 AI 常把「四格頓號」誤寫成「四句句號」(如「文靜內向。溫柔細膩。愛小動物。討厭喧嘩。」)——先把句號正規化成頓號，split('、') 才切得出 4 段；否則整串被當成 1 段、其餘 3 段被 defaultStr 的預設值填成「內斂堅韌／明哲保身」「卸下心防的私密一面」等殘料黏在後面(見風音案例)。半形句號一併處理。

### `parseTraitsHelper`　<sub>Core_Settings.gs:474</sub>

🐛→✅ 稽核抓到：這支函式沒有長度上限也沒清HTML斷字字元(<>&"'`)——反觀同批呼叫的background/np/realName等AI生成欄位都有比照套用邊界防呆，唯獨這裡(寫進row[COL.PC.TRAIT]/PREF的主要來源)漏了；AI若吐出超長或含特殊字元的一段內容，會無界污染這兩個核心敘事欄位。逐段套用同款規則(單段封頂30字，比對外貌/性格短語的自然長度留足空間)。

🐛→✅ 再稽核抓到：跟_fClean(Router_Creation.gs)同樣少濾｜【】——此函式輸出經heroToKanshouRow_的dailySpeechPart路徑最終會被stampPersonaFlavor_原樣寫進MEMORY當【口吻】值，若AI輸出的段落恰好含這兩種字元，會偽造出MEMORY其他標記，比照_fClean同款補齊。

### `looksToTraitParts_`　<sub>Core_Settings.gs:494</sub>

種子 persona.look 結構是「N段外貌細節・・...、最後一段氣質詞」(如「金髮碧眼・甲冑藍裙的嬌小騎士、王者威儀」)，段數因人而異(2~4段不等)，不能按「、」出現位置盲目分配(會把服裝等外貌細節錯位塞進[氣質舉止]、真正氣質詞被推擠到後面的格)。這裡把「最後一段」認定為氣質、其餘合併回單一[外貌]格，再交給 parseTraitsHelper 補齊防呆與截斷。
⚠ 2026-09 拿掉了 `firstP` 參數（4 個呼叫端同步）：自稱已從特徵格退休、併進【口吻】，見上方 `TRAIT_SLOTS_` 那條。

### `looksToTraitParts_`　<sub>Core_Settings.gs:502</sub>

🐛→✅ 這裡曾經用「、」把多段外貌合併回單一[外貌]格，但「、」正是parseTraitsHelper切分四格的分隔符——合併回去的外貌格內部一有「、」，下面parseTraitsHelper就會把它當成多出來的頂層格數，導致[氣質舉止]/[自稱]/[私密一面]全部錯位、第4格(私密一面)被截斷擠掉。改用「・」合併(parseTraitsHelper只切「、」，不會再把這段拆開)，20位種子從者實測全數命中(見SOLO_REFERENCE.md)。

### `enrichPersonalityLikesDislikes_`　<sub>Core_Settings.gs:511</sub>

種子庫 persona.words 幾乎全部只有2段，parseTraitsHelper 補滿4格時[喜歡]/[討厭]恆為「無」佔位，比玩家自建角色的紮實4格薄弱很多。召喚當下用AI依既有的表象/內裡短句延伸出貼合、合理的喜好/討厭補滿，既有短句一字不改；已滿4段(AI原創從者)直接跳過、不多打一次API。

### `getMapDataCached`　<sub>Core_Settings.gs:599</sub>

坤圖分頁從無玩家動作寫入(唯一寫入者是版本升級時的一次性upsert，見reseedIfEmpty_)，內容與FATE_MAP_SEED(Setup_FateWorld.gs) JS常數同一份資料——改直接回傳 FATE_MAP_SEED 包表頭列，比讀表+CacheService快取更快，形狀(含表頭列＋COL.MAP欄序)與原本讀sheet完全一致，呼叫端不用改。「坤圖」分頁仍保留(FATE_SHEET_DEFS/reseedIfEmpty_不變)供人工查閱；sheets.map 參數留著只是相容既有呼叫簽名，已不使用。

### `getHeroCodexCached`　<sub>Core_Settings.gs:608</sub>

英靈殿(種子從者名冊)：codexPersona_/actionGetHeroes/actionSummonServant/seedRivalsForGame_ 共用。寫入點(recordOriginalHero_/upgradeCodexPersonas_/seedFateCodex_)須各自 remove("FATE_HERO_CODEX")。

英靈殿跟坤圖/御主殿不同、未靜態化：工房(Workshop)玩家可捏出原創英靈(來源=ai_gen)永久寫進這張表，GAS程式碼靜態部署、跑起來時沒辦法把新角色塞回JS常數——是真正需要試算表持久化的動態資料，維持「讀表+6小時快取」架構。

### `getMasterCodexCached`　<sub>Core_Settings.gs:624</sub>

御主殿比照坤圖靜態化：唯二寫入點(upgradeMasterCodex_/seedFateCodex_)只在版本升級/首次建表時執行，無玩家動作(如工房)會新增列，試算表只是 SEED_MASTERS(Seed_Codex.gs) 的多餘拷貝。改用既有的masterToCodexRow_(seedFateCodex_本來就在用的同一個轉換函式)即時組出結果，不必讀表也不必快取。「御主殿」分頁仍保留供人工查閱，遊戲邏輯不再讀它。

### `getArriveDay_`　<sub>Core_Settings.gs:637</sub>

登場日：部分敵御主/敵從者可延後登場，不必開局就全員同時上場。資料驅動：Seed_Rivals.gs 的 roster項目可選填 arriveDay(第N天才登場)／arriveHint(登場前風聲用的自訂提示句)，未填＝第1天(對既有存檔/種子零影響)。hasArrived_(row,currentDay) 是「這名敵人現在算不算真的在世界裡」的單一真實來源，凡是同地互動／鎖定攻擊／世界自走／地圖敵蹤標示等皆應吃這道閘門——唯獨「剩餘敵從者總數」(aliveEnemyServants_，勝負判定用)刻意不吃，避免玩家靠「趕在對方出現前把其他人殺光」提前奪杯。

### `MASTER_MELEE_TAG_`　<sub>Core_Settings.gs:665</sub>

御主自身能力標記：【體術】(rank字母，命運測定/種子皆保證合法)／【魔術】(自由描述文字)，創角/鋪敵時寫進御主自己的 MEMORY。體術兩用途：① masterCard_/enemyMasterCard_ 讀出當演出依據(能力描述，不受show-don't-tell限制)；②Engine_Fate.gs 的 injectMasterMeleeSupport_ 讀 rank 字母算真實戰鬥加成。

### `MASTER_MAGIC_RANK_TAG_`　<sub>Core_Settings.gs:670</sub>

御主魔術階位（rank字母）：跟體術同款「凡人自身能力」，只在己方出戰從者為 Caster(魔砲型)時才生效(injectMasterMagicSupport_ 內部判斷)——體術管近戰助拳、魔術階位管施法支援，避免疊在一起變成無腦雙倍加成。

### `MASTER_ORIGIN_TAG_`　<sub>Core_Settings.gs:674</sub>

🐛→✅ 【出身】(玩家創角時選的出身背景)舊版只在 actionManualNpc 寫入，全專案查無任何讀取點——純寫入死資料，backfill 用的是當下 userData.origin(前端再送一次)而非這個持久化標記。補上跟體術/魔術/魔術階位同款讀取器，讓 masterCard_ 能把這份設定持續餵給 AI 當演出依據。

### `getLocalPeopleList`　<sub>Core_Settings.gs:694</sub>

🤝 情報共享（同盟背景生效）：只要當前世界尚有任一盟友（敵御主/敵從者結盟中），盟友便會通報敵情——敵從者的「職階」對玩家揭露（原作依據：遠坂凜為士郎判明敵方職階／真名）。無盟友則維持迷霧。

busyWith 恆為 null：單人模式只有一位御主，「同行」旗標即代表陪的是御主本人，沒有第三方可陪，此欄位前端也從未讀取。

### `getNearbyLocations`　<sub>Core_Settings.gs:748</sub>

myWar：呼叫端傳玩家本局【戰爭】標記，比照 buildMapNodesPayload_(Router_Movement.gs) 同一套規則過濾戰爭限定地點(如第四次限定的海特飯店)——否則這份清單(撤退突圍/鄰近地點)會漏濾，讓地圖上看不到、理應跨戰爭隱藏的地點反而從這裡露出來。myWar 留空(如鑑賞)則等同不限定戰爭的通用地點才會顯示。

---

## `gas/Engine_Combat.gs`

### `callGeminiAPI`　<sub>Engine_Combat.gs:15</sub>

OpenRouter 額外採樣旋鈕(非OpenAI標準四件組)：不同底層模型支援程度不一，未設定的呼叫端完全不受影響，有帶的模型會吃到、不支援的模型OpenRouter會直接忽略(不會報錯)，故用undefined判斷、不給預設值。

max_tokens 是能直接省生成時間的旋鈕；鑑賞(kanshou) narration 目標字數較短，上限故比 solo 低。

🐛→✅ 稽核抓到：跟上面temp/topP同一支函式裡卻用||而非!==undefined判斷，會把呼叫端刻意傳的0(如「只試一次不重試」)靜默吃成預設值——目前無人這樣傳、屬休眠地雷，比照上面已確立的寫法修正。

### `attemptWithModel_`　<sub>Engine_Combat.gs:107</sub>

🐛→✅ 玩家反饋「結界觸發」這類措辭太出戲(像系統跳出來講話)，改成順著情境走的口吻——氣息未定、畫面忽然朦朧了幾秒，讀起來像是被打斷而非被系統攔下。

### `attemptWithModel_`　<sub>Engine_Combat.gs:108</sub>

🐛→✅ 稽核抓到：兩處throw前都已把含safety/PROHIBITED_CONTENT字樣的原始錯誤正規化成固定字串"Triggered_NSFW_Filter"(見68/74行)，lastErrorMessage不可能還留著原始"safety"字樣——.includes("safety")是永遠打不到的死分支，清掉避免誤導後續維護者以為還有第二種判斷路徑。

### `aiFallbackNarration_`　<sub>Engine_Combat.gs:122</sub>

🛡️ 生成失敗時的統一保底：措辭與 _genFailed 旗標的【單一真實來源】。玩家反饋「結界觸發」這類措辭太出戲(像系統跳出來講話)，改成順著情境走的口吻——氣息未定、畫面忽然朦朧了幾秒，讀起來像是被打斷而非被系統攔下。

### `aiFallbackData_`　<sub>Engine_Combat.gs:130</sub>

_genFailed 旗標：這組是失敗保底文字、不是真正生成的敘事，讓呼叫端(narrateWithState_/actionPlay_)能辨識出來、不要把它當成既定劇情事實存進歷史——否則下次呼叫會把「什麼都沒發生」的保底措辭誤當上一輪的真實進展餵回AI，可能接續出跟實際劇情矛盾的敘事。★ 呼叫端解析失敗(模型回截斷 JSON／純文字)時也走這支，見 Gallery.gs actionPlay_ 的 parse 保護。

---

## `gas/Engine_Fate.gs`

### `chainVolley_`　<sub>Engine_Fate.gs:31</sub>

7｜理想鄉 Avalon：凌駕一切的無敵結界(概念 7 階·專剋 6 階究極寶具)。不入此表跑 pierce 數學——以 Router_Battle「敵解放≥6階概念 → Avalon 硬擋(耗100魔)」實現，等同不可被任何概念貫穿。

6｜世界·真理級：斬裂世界，凌駕一切防禦與結界

### `offenseTier_`　<sub>Engine_Fate.gs:49</sub>

🐛→✅ 舊版 pierceFx 把 gae_bolg 放進「不管選哪個寶具都無條件掃永久技能列表」的清單——單寶具從者(如庫丘林)沒問題，但斯卡哈這類多寶具從者的 gae_bolg 同時也是一條永久固有技能(她的槍本身)，即使這次選的是完全無關的 Gate of Skye，仍會被判定「這次解放帶概念4貫穿」。下面第55行的npProfile_(c).fx 判定本就已經正確處理「這次實際選的是哪個寶具」(單寶具靠 firstSignatureFx_退路、多寶具讀 npChoice)，故 gae_bolg 從這個無條件清單移除，改完全交給該行按選定寶具判定。

🐛→✅ 2026-07 再稽核抓到同款孿生bug：EMIYA(無名)的『無限劍製』(ubw)同理，既是他的永久固有技能(投影魔術本體)、又是他兩個可選寶具之一——選了另一個較弱的『偽·螺旋劍』(fx:projection)時，ubw仍會被這份無條件清單掃到，讓Caladbolg II誤判成帶概念4貫穿的無限劍製強度。同樣從清單移除，交給下面npProfile_(c).fx按實際選定寶具判定。

🐛→✅ 再稽核第三例(同構)：美杜莎的『魔眼』被動技能(Seed_Codex.gs)fx也是petrify，同時petrify又是她兩個可選寶具之一(他者封印·鮮血神殿)——選了另一個(貝勒羅豐)時，petrify仍會被這份無條件清單掃到誤判成帶概念3貫穿。同樣移除，交給下面npProfile_(c).fx按實際選定寶具判定；下方627/797行的petrify判定是她「魔眼」被動本身(迴避減益/瀕死乘隙)，不受寶具選擇影響，維持hasFx_原樣不動。

### `npPranaCost_`　<sub>Engine_Fate.gs:72</sub>

🔋 寶具 Prana Cost（依寶具階級）：E40 D70 C110 B160 A220 EX300。寶具魔力全由御主供（從者無池），已對齊御主池(迴路×10，預設300)——A 階≈耗盡滿池、EX 須再焚血墊，故 EX/EA 仍極罕見；寶具僅在出力 100% 才可解放(見 actionFateBattle 閘門)。

### `npOverloadCap_`　<sub>Engine_Fate.gs:85</sub>

🔥 灌魔加乘·上限（規格外寶具才有旋鈕）：寶具階含「＋」＝規格外·可超載，威力隨御主灌注魔力線性放大到上限。無＋(A/B/C…)＝定額釋放·不可調(回 1.0)；＋(A+)＝最高 ×1.5；＋＋/EX(A++·EA)＝最高 ×2.0。資料驅動·數 '+' 即分流，對應原作「A++ 對城劍隨輸入魔力提高威力」。跨名冊通用(Excalibur/Enuma/Ea…)，非某從者專利；達上限所需的額外魔力＝底費×2。

### `enemyRetreatLoc_`　<sub>Engine_Fate.gs:146</sub>

令咒緊急脫離的落點：隨機挑一個非約會型的冬木地點（≠ 當前地）

戰鬥熱路徑，用 getMapDataCached(讀 FATE_MAP_SEED 常數，零 I/O) 而非整表讀取「坤圖」分頁。

🐛→✅ 稽核抓到：原本沒濾「戰爭限定地點」(COL.MAP.WAR)，姊妹函式getNearbyLocations/buildMapNodesPayload_/actionScout都有濾這道(避開4th限定的海特飯店/麥肯基宅/碼頭倉庫)，唯獨這裡漏了——5th戰爭或chaos局的敵人一旦被移到這3個地點，UI一律濾掉該node/偵查範圍，該敵人形同永久消失(打不到也偵不到)。myWar選填：不傳則不濾(相容舊呼叫，但呼叫端應盡量傳)。

### `hasCausalityNp_`　<sub>Engine_Fate.gs:192</sub>

⚡ 因果律武器：寶具對轟時死亡已在因果上先確定（Gáe Bolg 等，技能帶 causality:true 標記）。

🐛→✅ 舊版掃整個永久技能列表找 causality 旗標，沒管玩家「這次實際解放的是哪個寶具」——斯卡哈雙寶具其一是 Gáe Bolg(因果律)、另一是 Gate of Skye(無此機制)，永久技能列表裡仍留著{fx:'gae_bolg',causality:true}的技能條目，導致選了 Gate of Skye 照樣被判定為因果律必殺。改成跟 resolveFateBattle_ 內 npIs('gae_bolg') 同一套判準：只看「這次實際解放」的 npProfile_.fx。

### `divineRankOf_`　<sub>Engine_Fate.gs:201</sub>

🕊️ 目標的「神性階級」單一真實來源：divine fx／divine_core fx／特性技能名含 神性|神格|神靈(無標階退'C')三者取階級最高者，查無任一者回 null。神殺／天之鎖縛神／對神寶具／寶具解放神性加成／對瘟疫抗性全部吃這一個函式，讓「神性越高、剋神效果越重」對所有機制一致生效。納入 divine_core 是因為神核代表真正神靈軀體，階級理應≥表面神性標籤，取高者避免有神核卻因無標神性而被當弱神打的矛盾。

### `resolveNpClash_`　<sub>Engine_Fate.gs:215</sub>

🌟 寶具對轟·純裁決函式：只吃數字回決策，I/O(火力取樣/落傷/寫表/回震腰斬)留給呼叫端 Router_Battle，純函式＝tools/battle_sim 可直接單元測試。優先序：①玩家因果律且足以致死敵方→'causality'(截斷·敵只剩8%殘波回擊)②敵方因果律且足以致死玩家→'enemy'+pLethal=true(必死·呼叫端不得對其套保命/腰斬)③火力相當(差距≤總和10%)→'stalemate'(各吃半個 band)④火力高者勝：敗方吃差額(玩家敗則保1)、勝方吃差額15%回震。保命：因果律以外玩家永遠保1；敵方無保命(被打死=合法勝利)。

### `combatProfile_`　<sub>Engine_Fate.gs:254</sub>

傷害底＝【筋力/魔力 取高】：敏捷已獨佔命中＋迴避、又吃「命中差×1.2」的技巧通道，若再當傷害底就是一圍三吃(敏捷型會全面碾壓)。魔力型非Caster(神代/魔攻物理)由此成立。耐久=防禦、幸運=命運骰、寶具=寶具傷害段，皆不入普攻底。命中/迴避維持職階本色。battle_sim 驗證。

### `SKILL_FX_`　<sub>Engine_Fate.gs:267</sub>

⚡🛡 技能 fx 戰鬥效果「格式表」（資料驅動）：把散落的主動技 if 鏈＋線性被動加成收成一張表，要加/調技能＝改一列，引擎(servantActiveSkill_＋fxHitAdd_/fxDmgApply_)自動吃。只收【線性加減乘】型；骰子彈幕(gob/chain)、概念貫穿減傷(rho_aias/territory/神核)、時機/條件觸發(stealth/tsubame/petrify)等特例邏輯不進表、保持明碼(硬塞進表＝過度工程)。欄位：active/prio/mpPct/icon/descFn＝施放技術(已被動化·每擊擲 SKILL_PROC_ 機率)專用；zh＝中文名(fired 標籤 fallback)；hit/hitAdd＝命中加成(攻方)；dmgMul/dmgAdd＝傷害加成(勝方)——皆可為數字或 r=>.. 或 (r,c)=>..；blockedByLoserFx＝敗方有此 fx 則免疫；silent＝套用時不推 fired 標籤(morale 靜默/self_mod 傷害段避免重列)。

### `injectMasterSupportFor_`　<sub>Engine_Fate.gs:319</sub>

🥋🔮 御主體術＋魔術支援·合併入口（Router_Battle.gs 2026-07 稽核抓到 5 處重複而抽出）：isEnemy=false → row 本身就是御主列，直接讀其 MEMORY(供我方視角：defC 我方從者受擊/atkC 出擊/sC 每回合出擊)；isEnemy=true  → row 是敵從者列，走 enemyMasterMemoryFor_ 硬連結查其「自己的敵御主」MEMORY(查無則不注入)。兩支注入函式本身已各自做「fx 已存在則略過」的冪等檢查，這裡不需要重複作。

### `DEF_FX_`　<sub>Engine_Fate.gs:367</sub>

🛡 防禦 fx 格式表（資料驅動·對稱 SKILL_FX_）：敗方持有 → 傷害 ×mul，除非被概念貫穿(pierces(pierceKey))／破魔(alsoPiercedByFx)／魔術穿透(physicalOnly 時 atkMagic)。骰子彈幕/必中/復活等仍明碼(不進表)。欄位：mul＝減傷乘子(數字或 r=>..)｜pierceKey＝概念貫穿判定的防禦概念名｜zh/note＝fired 標籤｜physicalOnly＝僅擋物理(魔術系穿透)｜alsoPiercedByFx＝此攻方 fx 亦無視此防禦｜piercedMsg＝被貫穿時推的訊息 fn(winner)→string(無則靜默)｜guardPositive＝base>0 才推套用標籤。mul 一律用函式隨階級縮放(fxDefApply_ 只在 typeof mul==='function' 時呼叫 rankMul_)，貼合檔頭「每個 fx 效果都隨技能階級縮放」的設計原則；數值以 C 階(rankMul_=1.0)校準。

### `rowToCombatant_`　<sub>Engine_Fate.gs:414</sub>

🐛→✅ 稽核抓到：skills/traits 只用 ||[] 擋 falsy，沒擋「合法JSON但不是陣列」(如手動編輯儲存格把 traits 存成物件而非陣列)——下游 divineRankOf_/resolveFateBattle_ 對這兩者直接呼叫.concat()/.some()，非陣列值會拋出未被攔截的例外，一路穿透 actionFateBattle(無外層try)＋handleGameAction(只有finally無catch)，變成玩家看到的原始連線中斷而非正常戰鬥結果。讀取時就用 Array.isArray 攔一次，這是所有戰鬥讀取的單一入口，堵住即保護全部下游呼叫端。

### `servantNpOptions_`　<sub>Engine_Fate.gs:424</sub>

🐛→✅ 迦爾納／蒼白騎兵(Pale Rider)兩條目已砍：SEED_SERVANTS 名冊裡根本沒有這兩名真名，純粹是規劃階段留下、從沒清掉的死路徑——留著只會誤導以後的人以為他們真的在名冊裡。

### `rowToCombatant_`　<sub>Engine_Fate.gs:443</sub>

🐛→✅ 跟全代碼庫其餘HP/MP讀取的｜｜0慣例不一致(這裡原本是｜｜100/｜｜50)——0是合法值(致命傷/魔力枯竭)，｜｜對0視同假值會誤把它腦補回滿血/半魔，讓下方resolveFateBattle_內用hp/hpMax算自身血量百分比(見_selfHpPct/_whp)在HP恰好=0時失真判成滿血，改成跟其餘讀取一致的｜｜0。

### `servantNpOptions_`　<sub>Engine_Fate.gs:462</sub>

⚠ 精確比對種子真名(=== 而非 indexOf)：避免 AI/自訂從者真名只要【含】「無名」「吉爾伽美什」等字樣，就整組繼承乖離劍/Enuma Elish 選單，繞過 ALLOWED_FX_ 刻意排除 ea/enuma/gob 的防線。

r 欄＝該寶具真實官方階級，缺 r 者(恩奇都/EMIYA)retreat 至六圍表寶具值(原作未各自標定固定階級)。階級可能【高於】六圍表寶具值(如伊斯坎達爾王之軍勢EX＞六圍表A++)——npBaseDice_/npPranaCost_對 EX 有獨立字串判定，不與 rankVal 同分混淆。

### `servantNpOptions_`　<sub>Engine_Fate.gs:483</sub>

🐛→✅ 種子表(Seed_Codex.gs)美杜莎的 np 字串本就寫了兩個具名寶具(／分隔，跟斯卡哈/吉爾伽美什等多寶具英靈同款文案慣例)，卻從沒在此表登記——沒有 servantNpOptions_ 條目時 npProfile_ 只能退回firstSignatureFx_ 抓到的 petrify(魔眼被動)，玩家永遠選不到 Blood Fort/Bellerophon，機制上她只剩魔眼一種寶具打法，跟卡面寫的兩個寶具名不符。

### `HIT_FX_CAP`　<sub>Engine_Fate.gs:534</sub>

🎚️ 被動技能 fx 對 命中/迴避 的【淨加成上限】：直感/心眼/千里眼/騎乘/變化/避矢/王財/洞悉/自我改造/狂化/魔眼/天之鎖/燕返/愛之痣 等被動 fx 的命中(攻)與迴避(守)各自加總後 clamp ±HIT_FX_CAP——買越多遞減為零，防止堆疊流把差距拉到「永遠打不到」。★不入帳(各有自己的成本/體系)：出力/整備/過充/施放技術(被動 SKILL_PROC_ 機率擲)/禮裝(裝備)/職階相剋(身分)/幸運骰/奇襲(一次性)。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:548</sub>

🌟 乖離劍·天地乖離開闢之星(ea)：英雄王自身血量≤40%才卸下傲慢「認真」——解放寶具(opts.np)時，以神靈概念分割越過一切防禦的「執行殺」。需玩家／敵方主動解放寶具(已由 actionFateBattle 上游補魔閘門把關)，非每擊免費觸發；血量充足時則走下方常規寶具路徑(×1.7 加成)，體現「對手不值得我認真」。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:579</sub>

命中／迴避改用「階級隨機區間」(base-10~base+5)，讓低階偶能爆冷、骰運重新有戲

🎴 六圍＝角色速寫，只給「微傾向」：命中/迴避吃 rankTier×K_STAT(階差壓到~12)，讓 D20(運氣)重新主導——TYPE-MOON 官方定位六圍是「讓人快速理解角色」的速寫、非戰力試算表(庫丘林六圍頂尖卻幸運E)。迴避＝敏捷(身法)×0.65＋耐久(底子)×0.35：拆掉「敏捷雙吃(命中又迴避)」，命中端純看敏/魔(進攻)。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:600</sub>

狂化(mad) 不在此扣命中/迴避：代價已由每小時魔力維持費×1.5(Time_World.gs servantEconomy_)承擔，避免同一項代價在戰鬥層被收兩次稅。傷害加成(SKILL_FX_.mad)不受影響。

自我改造(self_mod)：命中 +2（被動·SKILL_FX_ 表驅動）

### `resolveFateBattle_`　<sub>Engine_Fate.gs:621</sub>

🐾 氣息感知(sense／恩奇都)：守方以穿透大地的感知看穿奇襲——階級 ≥ 攻方氣息遮斷者，突襲的命中先機＋下方「要害一擊」全數失效(貼原作「近距離廢掉同級以下的氣息遮斷」)。

氣息感知(sense)＝穿透大地的感知；全知全能之星(insight／吉爾)＝看穿本質——兩者皆能看破奇襲。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:632</sub>

⛓️ 天之鎖(chain)：命中加成併入既有「縛神性」效果(下方)；輸出走下方萬鎖彈幕。此處不另加命中(避免恩奇都過載)。

秘劍・燕返(tsubame)：劍術本身而非寶具——次元摺疊令守方迴避 -5(傷害倍率見下方)。僅【每場戰鬥第 1 回合】發動(opts.round·未傳視同首回合)——絕技是蓄勢的一閃，非回回可出，避免普攻流每回合都吃到高倍率加成。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:649</sub>

⛓️ 天之鎖(chain／Gilgamesh·Enkidu)：對「神性」之敵展開冥界鎖鏈，封住身法。縛神強度依【對方神格】縮放(divineRankOf_·原作「神性越高縛得越死」)：0.5+0.5×rankMul(對方神格)——C 神格×1.0、A×1.33、EX×1.5、E-(美杜莎)×0.62。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:668</sub>

🍀 幸運＝上演劇情逆轉的旋鈕：Saber(幸A+)的福星、庫丘林(幸E)屢屢倒楣戰死的詛咒——「故事與運氣才是裁判」。做法＝自指變異(非對拼)：低運每擊小機率失手、高運小機率福星，製造爆冷與劇情感，而非讓高運方持續輾壓。以 C(30) 為中性零點、每離 1 階 ±2% 機率線性遞增，讓工房裡每加 10 點都有真實效果(非階梯式無效區間)。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:693</sub>

❖ 令咒·絕對命令(opts.seal)＝必中：凌駕擲骰、亦不受必中槍閃避影響。在【此處】定生死而非呼叫端事後翻旗——翻旗會導致 damage(已按擲贏方算完)變成拿敵方的傷害數字打敵方。opts.forceHit＝火力取樣用強制命中(寶具對轟比大小)，同理保證 damage 屬於攻方。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:700</sub>

傷害：勝方以「出力屬性」為底（筋力/魔力取高·見 combatProfile_）+ 分差(敏捷的傷害通道)🎲 D&D 風武器骰：底傷 = 階級基底×0.5（穩定底）＋ rankTier 顆 d8（武器骰，帶骰運起伏）＋ 命中分差×1.2中位數約等於舊「rankVal 平值」，但每一擊有 ±的浮動，低階偶爆高傷、高階偶失手，貼近擲骰桌遊手感。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:717</sub>

⚠ 怪力(str_up)／魔力放出(burst)＝【施放技術·被動 only】(見 servantActiveSkill_)：不走此處常駐被動，由 rollSkill_ 每擊依 SKILL_PROC_ 機率擲是否經 opts.skill 套用全效。

勇猛/卡里斯瑪(morale·敵透化免疫)＋自我改造(self_mod)：常駐被動傷害（SKILL_FX_ 表驅動·位置順序不變）。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:729</sub>

⚠ 投影魔術(projection)＝【施放技術·被動 only】(見 servantActiveSkill_)：命中/傷害全併入 opts.skill，由 rollSkill_ 每擊依 SKILL_PROC_ 機率擲是否套用，此處不重複給被動傷害。

🗡️ 首擊奇襲·要害一擊：氣息遮斷者開場突襲命中→額外重創(吃階級·一次性)。僅【普通首擊】生效——若開場直接解放寶具(opts.np)則走寶具自身爆發，不疊奇襲(避免奇襲×zabaniya 雙重爆擊一發秒人)。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:749</sub>

🥋 御主體術參戰（見 injectMasterMeleeSupport_ 注入來源）：玩家/敵方兩側皆會注入——玩家側走FACTION==="從者" 門檻(比照禮裝 injectMysticBuff_)，敵從者則由 Router_Battle.gs 用enemyMasterMemoryFor_ 反查其硬連結敵御主的 MEMORY 後注入(守方/開場對轟/敵反擊三處呼叫點)，雙方對稱、皆真實影響傷害結算(2026-07 補：發動時的 fired[] 標籤也已餵進 aiPrompt，見 §108)。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:775</sub>

🔱 概念優先權壓制：勝方的最高「進攻概念」位階若高出某防禦概念 PIERCE_GAP 階以上 → 該防禦被無視。須提前到規模矩陣之前算好，讓 npDefScale_ 與 fxDefApply_ 共用同一份 pierces() 判定、兩層一致貫穿(territory 同時吃規模防禦與固定減傷兩層，若判定不一致會讓能貫穿其一者仍白吃另一層)。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:780</sub>

寶具解放：主威力＝依寶具階級的 d10 基礎骰（E3→EX30）；階級小補正錦上添花（軍略 +15%、神性 +10%）

⚠【呼叫端契約】此區塊套在 winner 身上——opts.np 時若守方反殺(winner=def)，damage 會含【守方自己的寶具骰】。既有呼叫端皆安全(fateStrike_ 對 atkWins=false 早退丟棄／對轟取樣用 forceHit／背擊反手另以普通交鋒結算)；新增呼叫端若要把「守方勝」的 damage 用出去，須自行改用 forceHit 或普通交鋒重算，別白嫖寶具骰。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:791</sub>

🐛→✅ 佐佐木小次郎這類「官方未給寶具階級」的種子資料，npRank 是裸 "-" 佔位——直接印進戰報會變成看不懂的「寶具骰(-)=26」，像顯示壞掉而非刻意留白。rankVal(npRank) 已把裸"-"視同E結算傷害，顯示標籤比照同一套等價關係，沒有字母就秀"E"，不再吐出裸符號。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:825</sub>

⚔️ 對神(弒神寶具·梵天弒神之槍 Vasavi Shakti 等)：對「神性」之敵單體特大傷害(弒神)，對凡人僅單體重擊。不入規模矩陣，特判：弒神倍率依【對方神格】縮放，1+1.4×rankMul(對方神格)、上限 3.0——C＝×2.4、A＝×3.0(正神吃滿弒神槍)、E-(美杜莎)＝×1.32(墮落殘神沒多少神格可弒)。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:842</sub>

⚡ 「本擊是否魔術系」（physicalOnly 防禦的穿透判定）——必須在【第一個 fxDefApply_ 之前】算好：只在【實際發動魔力放出】時才算魔術系(灌注魔力才是魔術一擊)，光持有 burst 不夠——否則沒發動時只吃對魔力減傷卻無 burst 增益，全是壞處。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:875</sub>

對魔力(nullify_magic)：攻方為魔術系(法師魔砲/魔力放出/神代)時大減魔術傷。★原作精髓：A 階對魔力幾乎無視現代魔術——Saber 對 Caster 的魔砲僅如清風拂面。但神代魔術(神祖之術)凌駕現代對魔力＝完全無視(美狄亞的本領)；概念壓制亦無視。

---

## `gas/Gallery.gs`

### `STATE_AFTER_ACTIONS` 漏了 `move`　<sub>Router_Action.gs</sub>

`actionMove` 一直有做交棒（`STATE_PRE_DATA_ = allPcData`）、前端 `travelTo` 也一直讀 `data._state.tags`，
兩邊都以為移動回應會夾 `_state`——但白名單裡從來沒有 `move`，dispatcher 不夾，
`refreshFateTags(undefined)` 退回多打一趟 `get_tags`。移動是 solo 最常按的鍵，每一步都在付這趟稅，
而且沒有任何錯誤訊息（fallback 太體貼）。2026-09 稽核（HANDBOOK 把 move 寫在名單裡，反而是文件對、代碼錯）補進名單，
探針 `move_state.js` 釘住「move 回應必須夾 `_state.tags`」。
教訓：三處各自「以為」的事，要有一處是機器在驗——`check_contract.py` 只看鍵名有沒有人讀，看不出「有人讀但永遠是 undefined」。

### `servantMaxHp_`　<sub>Core_Settings.gs</sub>

原本這裡是 `fateMaxHpMp_`（100＋耐久×10／50＋魔力×10），是九州時代的公式；FATE 從者早改成 150＋耐久×6、MP 恆 0（出力電池制），
公式卻散在召喚兩支＋`Seed_Rivals` 三處各寫一遍，而 `fateMaxHpMp_` 只剩 `maxStatsForRow_` 在叫、那支又是死分支的殘骸。
砍掉 `maxStatsForRow_` 後它變成孤兒，死碼掃描才叫出來。修法不是刪掉了事：把三處重複的真公式收進同一支，單一真實來源。

### `sanitizeAiData_`　<sub>Gallery.gs:27</sub>

🛡️→✅ 2026-07 邊界稽核：options 是原樣轉發給前端、一個字串長一顆按鈕的欄位，卻從沒設過上限。schema 要 4 個，但模型失控時回 50 個 × 每個上百字，前端就照單全收長出一整片按鈕牆。輸入當不可信：這裡一併夾好數量與長度，前端不必再各自防。

### `kanshouPcIdx_`　<sub>Gallery.gs:68</sub>

帳號歸屬驗證：KPC_ ID 只用 Date.now()、理論上可預測，原本每個 kanshou handler 各自反查「帳號」表的 KPC 欄位確認呼叫者身分。2026-07 稽核抓到系統性漏洞後，這道驗證已上移到dispatcher 統一擋(`handleGameAction`→`verifyPcOwnership_`，見 Router_Action.gs)，所有經 ActionRouter 派發的 handler 進來前都已驗過——這裡只需要純索引查找，不必再反查一次帳號表(那會是同一份帳號表在同一趟請求裡的第二次整表讀，純浪費)。

### `KANSHOU_DAILY_TRANSLATE_SYS_PREFIX_`　<sub>Gallery.gs:98</sub>

🔤 translateLookToDaily_/translatePersonalityToDaily_/translateMoeToDaily_ 共用開場白：三者系統提示詞都以「你是《命運停駐之夜》的角色側寫顧問。★【語言】」起手。2026-09 稽核：原本三支各自在前綴後面再寫一次「所有輸出內容一律使用繁體中文，不得夾雜英文或其他語言字母」，等於同一條規則在同一趟請求裡出現三份(callGeminiAPI 尾端還會無條件再補一次【語言鐵律】)——整句收進前綴、JSON 欄位名例外用括號併掉，三支的規則段只留各自真正不同的部分。

### `kanshouRecentDigest_` / `KANSHOU_DIGEST_ROUNDS_` / `KANSHOU_DIGEST_CAP_`　<sub>Gallery.gs</sub>

2026-09 連續回合稽核量到的洞：`chatHistory` 只餵 6 則（3 輪），而四個長期記憶管道（MEMOIR／【初次】／紀念日／約定）
**全部要有事件發生才會寫**——日常閒聊一個都不蓋戳。實測連打 8 回合日常，那四格全空，等於**純聊天的內容 3 輪後徹底蒸發**，
玩家說「你上次不是說……」AI 只會茫然。

補法是往同一張「歷史暫存」表多讀幾輪（表裡本來就存著，不必新開欄位），扣掉已經進 chatHistory 的，把更早的
**玩家側輸入**串成一行。只取玩家那一側是刻意的：那是 GAS 手上唯一不需要 AI 就能壓縮的事實，而且正好是
「我上次做了什麼」這個連續性錨點；AI 的 narration 壓不了，也不該由 GAS 改寫別人寫的字。
實測第 12 回合時，「打翻糖罐→擦掉糖粉」這條因果鏈被撿回來，成本 145 字。

⚠ 窗口值 `_histWindow_` 要在 user prompt 組裝【之前】算好，摘要與 chatHistory 共用同一個數——
各算各的就會重疊（同一回合講兩次）或漏接（中間少一輪）。

### REL_TAG 的防禦性重算　<sub>Gallery.gs · partyMembers.forEach 開頭</sub>

REL_TAG 是 BOND 的衍生值。鑑賞側 11 個 BOND 寫入點**每一個都有跟著 `kanshouSyncRelTier_`**（`bumpBond_` 是 solo
結盟路徑，鑑賞 dispatcher 擋掉），所以 2026-09 稽核時**沒有現行 bug**。但那是七個呼叫端各自負責，而這裡是唯一的讀取端。
把 REL_TAG 手動打歪成「點頭之交／好感78」再組提示詞，同一段會同時冒出：

> 關係:**點頭之交**(好感:**78**，事實：**認識還太短**) ＋ 親密尺度「**親吻擁抱依偎可以**」

四句話互打，AI 無所適從。組提示詞前對齊一次就沒有這個破口。`kanshouSyncRelTier_` 只在值真的變了才寫，
且自訂關係稱呼（不在 `KANSHOU_REL_TIER_` 標籤清單裡的）不會被覆寫，所以這一呼叫是冪等且尊重玩家手動設定的。

### `pSleepStr`：「她此刻在自己家」曾經寫死　<sub>Gallery.gs</sub>

`_pAtHome` 的第三個分支是 `curL === '我的房間'`——那是**玩家自己的房間**，不是她家，但輸出的句子當年寫死成
「她此刻在自己家、多半還在賴床」。2026-09 稽核追過三條會讓她出現在玩家房裡的路徑（牽手帶回／敲門來訪／提議同去），
都有設 `KANSHOU_AWAKE_HERE_TAG_` 而被 `kanshouIsAwakeWithMe_` 豁免，所以**沒找到現行可達路徑**——但那行字本身是錯的，
多一條入口就會中。改成措辭跟著實際地點走（在玩家房裡就寫「她此刻人在你房裡」）。

### `kanshouDailyTranslateCall_`　<sub>Gallery.gs:102</sub>

🔧 共用呼叫殼子：try/callGeminiAPI/catch-fallback原值三者結構相同，只有「怎麼從API原始回傳值算出最終結果」跟「失敗時的保底值」不同——resultMapper 在 try 內把 raw 轉成最終回傳值(沿用原本各自的 JSON.parse/String(...).trim() 等寫法)，任何一步拋錯都跟原本一樣落到 fallbackValue。

### `translateLookToDaily_`　<sub>Gallery.gs:111</sub>

把戰時外貌(如「貼身黑色戰甲勁裝」)轉譯成現代日常穿搭/外型：本相不變、戰甲換成日常打扮；呼叫端(召喚/奪杯封存)僅一次性觸發，失敗時原樣退回戰時描述。

dailyMoeHint：私密一面與萌點是兩次獨立 AI 呼叫，容易各自發想撞成同一件事，故傳入已算好的dailyMoe 明講「私密一面不可跟這句萌點重複」。

### `translateLookToDaily_`　<sub>Gallery.gs:118</sub>

🐛→✅ 玩家反饋：女性角色的「外貌本相」段常常只寫髮色/瞳色，體態/身材完全空白——明確要求納入身形/胸圍等身材描寫，讓AI日後描寫外貌時有東西可用，不必臨場瞎編。幼女/孩童型角色(如伊莉雅絲菲爾)不適用，交給玩家自訂的rawLook本身判斷、不強加。

### `translateLookToDaily_`　<sub>Gallery.gs:138</sub>

🐛→✅ 稽核抓到：AI回傳的look段數從未驗證就直接持久化——下游dailySpeechByName_/heroToKanshouRow_都用裸split('、')[2]取第3段(日常口吻)，只檢查length>=4(非===4)，若AI吐出5段以上(氣質舉止的自然語句意外夾帶頓號很常見)，取到的會是被推移過的錯誤段落且不會崩潰、靜默錯用，還會被懶惰快取永久保留。比照parseTraitsHelper既有的四段式正規化(截斷多餘/補齊不足)在寫入源頭就鎖死4段，不留給每個下游各自防呆。

### `translateMoeToDaily_`　<sub>Gallery.gs:171</sub>

戰時萌點常靠戰爭/創傷撐出沉重反差，直接照搬到沒發生過聖杯戰爭的平行世界會顯得莫名沉重——改寫成輕量、會心一笑的日常萌點。只用在 AI 原創(ai_gen)英靈；canon 種子英靈已手寫死進persona.dailyMoe(見 Seed_Codex.gs)。🐛→✅ 萌點≠反差萌：萌點泛指任何讓人喜歡上這角色的特色，可能是反差(表面兇其實軟)，也可能只是單純討喜的外觀/行為/習慣(巨乳、雙馬尾、大食、路痴等)——之前這裡連措辭都寫死成「反差萌」，逼AI每次都硬套反差句型，見 SOLO_REFERENCE.md 相關章節。

### `heroToKanshouRow_`　<sub>Gallery.gs:246</sub>

種子資料慣用「・」當片語內部連接號(如「影之國女王・武人」)，但 formatPref/formatTrait 是用「、」切成四格餵給AI——沒有「、」可切時整串會被塞進單一格、其餘三格變「無」，吃掉關鍵個性錨點。比照 solo actionSummonServant 做「・→、」轉換＋parseTraitsHelper 補滿四格。

優先讀英靈殿已快取的日常版(種子手寫／工房建立當下生成)，兩者皆非空，不再有AI呼叫的可能。

### `heroToKanshouRow_`　<sub>Gallery.gs:260</sub>

戰時 p.back 跟平行世界矛盾，優先讀 p.dailyBack。舊版保底寫死`${RANK}・${name}`(如「Saber・阿爾托莉雅」)會把職階字眼餵進AI提示詞、演成從者對御主的恭敬——改成中性描述。

身世優先序：①種子手寫的 dailyBack(canon英靈)②工房原創英靈沒 dailyBack→退回 forge 的 back(原創角色身世本就非戰時悲劇、可直接用)③兩者皆空才給通用預設。避免工房捏的角色也掉進「普通身影」預設。

### `heroToKanshouRow_`　<sub>Gallery.gs:267</sub>

直接召喚無快照可帶，用該英靈自己的日常衣裝(daily.outfit)墊底，沒有才退回「日常便服」。

p.speech/p.tic 是戰時口吻/小動作，跟平行世界矛盾：口吻改用 dailyLook 第3段(日常口吻)的日常安全版；tic 沒有對應日常版，直接不帶。

### `heroToKanshouRow_`　<sub>Gallery.gs:275</sub>

REL_TAG(關係標籤)只是這裡設的起始值，之後全程只能透過actionUpdateRelTag(玩家UI手動操作)更改——AI對這欄位完全沒有寫入權限，不會被AI敘事悄悄帶偏。

🆕 2026-07 起始好感 10 → 0（玩家「是不是從 0 開始才好玩，現在都很熱情」）：舊的 10 沒有任何理由、就是寫死的，而它只離「脫離陌生」的 20 差 10 分＝聊天 5~10 回合就走完，陌生期形同不存在。改 0 之後要爬 20 分才脫離陌生，加倍；配上相處基調表的「陌生×初識」那一格，開場才真的像初次見面。

### `heroToKanshouRow_`　<sub>Gallery.gs:285</sub>

🏠 2026-07 七度改版：查無專屬豪邸(KANSHOU_HERO_HOME_)就隨機分配一間泛用住處(KANSHOU_GENERIC_HOME_POOL_)，讓她也有家可拜訪/可被夜襲——一次分配、寫進【住處】記憶標記，之後由kanshouGetHeroHome_ 統一讀取，永久持有(不重骰、不會搬家)。

### `kanshouBondFloorOf_`　<sub>Gallery.gs:304</sub>

依當前BOND重算這一列的REL_TAG——但只在「目前這格文字仍等於某個梯度的字面」時才覆寫：玩家一旦透過actionUpdateRelTag手動改成清單外的自訂稱呼，這格文字就再也不匹配任何梯度，之後好感繼續變動也不會被自動蓋回去，尊重玩家的手動選擇。呼叫時機：任何讓BOND變動的地方之後都補呼叫一次(目前有②約定赴約/橋段加好感、③AI rel_changes)，冪等、重複呼叫不出錯。

🔒 好感棘輪的門檻表(2026-07 玩家定案「鎖在已達成的門檻」)：好感可以掉，但不會退回已經跨過的那道門檻以下。理由是掉分不對稱——加分被 kanshouRelChatCeiling_ 夾住，扣分完全不夾，而且 AI每回合就能給到 -5(rel_changes)、下限一路到 -100；一次誤判就能把玩家經營兩週的同居抹掉，而失去的東西(同居/親密尺度/夜訪資格/拜訪權)全都要再跑一次約會或橋段才拿得回來。數字不鎖：她今天心情不好、好感從 95 掉到 91，AI 照樣讀得到、照樣冷淡；只是不會退階。⚠ 刻意寫成函式而非模組層常數：KANSHOU_COHABIT_BOND_ 宣告在本檔後面(const 有 TDZ)，模組層直接引用會炸；函式內求值是在呼叫當下，那時全部常數都備妥了。

### `kanshouSyncRelTier_`　<sub>Gallery.gs:326</sub>

💗 告白牆(2026-07 玩家「沒有一個交往的確定過程·人人都可以自然變成戀人」)：還沒告白成立的人，好感一律夾在【戀人門檻-1】。放在這支的最前面是因為這裡是所有好感變動的唯一漏斗(聊天/赴約/獨處/橋段/AI rel_changes 全都在改完之後補呼叫一次)，夾一次就等於全部路徑都夾到了——不必去每個加分點各補一個 if(那正是本專案禁止的「疊補丁繞症狀」)。⚠ 一併夾住的還有：戀人標籤、自訂稱呼(80)、同居(90)、親密尺度最高階——全部關在告白之後，這是刻意的，別再為它們各開一道門檻。

### `kanshouSyncRelTier_`　<sub>Gallery.gs:333</sub>

🩹 舊存檔補齊(只會發生一次)：告白牆上線【之前】就已經跨過 80 的人，是照當時的規則正當掙到的，不能因為我們新增一道門檻就把她們降回 79、順便把同居掃掉。三個證據任一成立就補蓋【戀人】：已同居／關係標籤已是「戀人」／好感底線棘輪記到 80 以上。⚠ 刻意【不】用「此刻 bond≥80」當證據——那會自己拆掉這道牆：AI 這回合 +5 把 78 推到 83 時，看起來跟舊存檔一模一樣，於是白白送出戀人身分。上面三個證據都只可能來自過去的存檔。

### `kanshouSyncRelTier_`　<sub>Gallery.gs:348</sub>

🏠 已同居⇒地板至少是同居門檻。這條不是錦上添花，是補一個只會發生一次卻真的會發生的洞：棘輪上線【之前】就存在的存檔沒有【好感底線】，若某人當時是 92＋同居中，第一次爽約 -5 之後才第一次跑到這裡，算出來的地板是 80(87 已經掉出 90 那一格)，於是 87≥80 不夾、下面同居檢查87<90 照樣把她掃地出門。把「同居中」本身當成一次到過 90 的證據，順便把這種列往上補齊，而不是把人趕走。玩家定案：同居成立後不因任何事情解除。

### `kanshouSyncRelTier_`　<sub>Gallery.gs:362</sub>

🐛→✅ 2026-07 稽核抓到：【同居】只有邀請成立/她主動提議兩處會寫成1，全檔案沒有任何地方清回0——好感若在同居後一路跌破門檻(爽約/冒犯累積)，標記仍在，AI仍每晚照樣把她骰進和室、仍觸發夜襲/賴床，敘事跟「都快變成點頭之交了」的數值直接矛盾。跟REL_TAG同一個函式做，因為两者都是「BOND變動後的下游狀態同步」，呼叫時機也完全一致(冪等、任何BOND變動處都會補呼叫)。

### `kanshouSyncRelTier_`　<sub>Gallery.gs:368</sub>

🐛→✅ 2026-07 玩家「有沒有類似這種問題的、會讓玩家疑惑的」：解除本身是對的，但整個過程【完全無聲】——她從此不住你家、當晚被骰回自己住處，敘事一個字都沒交代，玩家只會覺得「人怎麼不見了」。這支是共用 helper、拿不到提示詞變數，改用跟【晨間餘韻】同一套一次性標記把事實傳出去：蓋在她自己那一列，actionPlay_ 組提示詞時讀一次就清。

### `KANSHOU_CUSTOM_TAG_BOND_`　<sub>Gallery.gs:375</sub>

🔒 2026-07 五度改版·自訂關係稱呼／專屬稱呼門檻(玩家實測：低好感就塞露骨自訂稱呼，這段文字會被字面「TA是你的${tag}」原樣塞進提示詞當既定事實，AI因此無視好感天花板照樣演到底)——玩家指定門檻＝80(戀人)，跟親密尺度五階的「80+無上限」同一個切點，這樣一旦解鎖，尺度本來就已經全開，不會再有「好感沒到、卻被自訂文字撐開尺度」的倒掛狀況。單一真實來源：前端顯示用的門檻數字跟這裡共用同一個常數。

### `KANSHOU_CONFESS_BOND_`　<sub>Gallery.gs:382</sub>

══ 💗 告白＝關係階的質變事件（2026-07 玩家「好感太絲滑、沒有一個交往的確定過程、人人都可以自然變成戀人」）═══════════════════════════════════════════════════════════════

舊做法：好感爬到 80 就自動長出「戀人」這個標籤，沒有任何一刻是「你們決定在一起」。

新做法：**戀人不是爬出來的、是問出來的**——好感被硬夾在 79（見 kanshouSyncRelTier_ 的_loverCap），唯一能越過那道牆的動作就是【告白】，而告白由 GAS 依 好感×相處次數 擲定成敗。於是 80 以上的每一件事(戀人標籤／自訂稱呼／同居 90／親密尺度最高階)全部一起被關在告白之後，不必逐項再開一道門檻——單一真實來源就是這道牆。

### `KANSHOU_MET_COUNT_TAG_`　<sub>Gallery.gs:396</sub>

══ 🤝 相處基調（2026-07 玩家「好感太絲滑、想保留很熟但不親密的感覺」）══════════════

好感只有一條軸的時候，「她多喜歡你」跟「你們多熟」被迫共用同一個數字，於是好感59×相處20次 跟 好感59×相處300次 演出來一模一樣——前者該是新鮮期的試探與心動，後者該是自在到不必說完整句子、卻也就停在這裡了。兩者正交，缺一個軸。

【相處】計數存她自己列 MEMORY，每個「真的在對話」的回合、對每位在場者各 +1（跳時段/結束一天/移動那些不算相處）。

### `KANSHOU_RAPPORT_BOND_TIERS_`　<sub>Gallery.gs:406</sub>

好感四段（跟 KANSHOU_REL_TIER_ 的五階分開：那個是「稱謂」，這個是「該用什麼調子演」）。＋第五段【交往中】不由好感決定，而是【告白成立】才拿得到(見 kanshouIsLover_)——好感 79 以下的四段全部是「還沒在一起」的溫度，交往後那一整排指令都不再適用(尤其「她在等你先開口」)。

### `KANSHOU_RAPPORT_TONE_`　<sub>Gallery.gs:410</sub>

🎭 2D 基調表：[好感段][熟悉段] → **一句既定事實**，短到不能再短。⚠ 這張表刻意【只寫事實、不寫演技】(2026-07 玩家「這樣有模板·誰來演都一樣·那我多個角色不就沒有意義了」「不要抹殺人格·只要告訴她絕對的既定事實」)：初版寫成「愣一下／打呵欠／慌一下然後裝沒事」這種微動作，等於用同一套表情把凜和櫻演成同一個人。表情、語氣、用什麼方式擋回來——那些全是【她的個性】決定的，是 AI 唯一該自由發揮的東西，GAS 一個字都不要碰。GAS 只回答一件事：此刻什麼是真的、什麼不會發生（數值決定，跟誰來演無關）。交棒句(「怎麼表現依她個性」)寫在【角色一致性】那個 ★ 區塊一次，不在每一格裡重複。刻意留白：查無＝不輸出這個欄位，那些自然而然的狀態讓 AI 自由發揮反而更好。

### `KANSHOU_NOTED_TAG_` / `kanshouKnownOfYou_`

══ 📝 她眼中的你（2026-09 玩家「跟外面 ai 不同，這裡的 ai 明確知道所有設定，第一次遇到玩家就把玩家看透了」）══

玩家卡上的 `性格:[內裡]`／`萌點`／`經歷`，過去是每個在場角色【無條件全知】——整套鑑賞從來沒有一條規則說過「她還不認識你」。根源是**一份資料兩種用途被混在同一行**：①寫玩家自己的內心與感受（★【你也是這座城裡的一個人】要用）②在場角色對玩家的認識。①該全知、②不該，但共用同一行字，所以只能一起全知。

**分兩層、而且刻意讓它們由不同的東西保證**：「她對你多熟」GAS 自己算得出來（`【相處】` 次數查 `KANSHOU_FAMILIAR_TIERS_`），所以擋不擋得住全知**不取決於 AI 肯不肯配合**；「她記下你哪些特點」才交給 AI。**先用擋得住的東西擋住，再用盡力的東西讓它長出來**——順序反過來（只靠 AI 自律不要說中）就是那種平常看似有效、關鍵時刻靜默失效的設計。

🐛→✅ **第一版我寫成了補丁，玩家當場擋下來**：洩漏留著不動，另外寫 225 字★★區塊（含三段熟悉度定義）叫 AI「你讀得到但請假裝不知道」。玩家：「我是要妳幫我讓 ai 更自然，不是一直追加設定！妳必須要去看增加這個是否對 ai 有用處，如果沒有就不要增加雜音」。**初識/混熟/老交情 是模型天生就懂的詞，寫定義去教它是純雜音**——現在界線只有一句、掛在玩家卡自己那一行，225 字 → 26 字。留機制、砍說明。

`【眼中的你】` 存**她自己那列**的 MEMORY（不是玩家列）：每個人各記各的，同一個玩家在不同人眼中本來就該不一樣；存玩家列＝全城共用一份筆記，那是換個寫法的全知。分隔符用 `／` 不用 `｜`——`makeTextTag_` 會把 `｜【】` 從值裡剝掉（它就是為了防 AI 偽造欄位才這樣做），用 `｜` 當分隔符會被自己的防線吃光。

⚠ `noticed` 的第一版寫「這回合真的看出來的一件事」，記回來的全是「咖啡只喝黑的」這種**卡上性格四格早就有的東西**（玩家：「不是記那些沒用或是重複的東西，像是玩家的喜好之類的」）。現在限定「只記【會改變之後怎麼對玩家】的發現，喜好習慣瑣事與卡上已有的一律不記，多數回合填『無』」。

### `kanshouAppendUnique_`

共同回憶與「她眼中的你」是同一件事（append→去重→上限），差別只有 分隔符／上限／長度／要不要保護★釘選。抽成一份是因為**去重那段含 bigram 相似度比對**——複製一份出去，兩邊的門檻遲早會漂開，而漂開的那一天沒有任何測試會發現。`processMemoir_` 保留成一層薄包裝，只是為了不動它既有的三個呼叫點與文件點名。

⚠ 寫這支的探針時踩到自己：測資用「第0件…第7件完全無關的事」，被 bigram 去重整批擋下，我一度以為上限壞了。**探針說「沒作用」時先確認是不是探針自己的問題**（本專案第五次踩同一個形狀）。

### `QUAD_REDUNDANT_` / `quadLabeled_`

標籤已經講了「討厭的事物」，值再寫一次「厭惡見死不救」就是疊字——種子裡 16 處（14 個 `厭惡`、2 個 `熱衷`），AI 生成的人格也會這樣寫。

剝在**唯一的渲染出口**而不是去改資料：①舊試算表已經長出來的列不會因為改種子而更新 ②AI 隨時能再產一個新的。追資料來源永遠追不完，而標籤與值的疊字判斷只有這裡看得到兩邊。regex 帶 `[於的]?` 是為了 `熱衷於研究` → `研究` 而不是 `於研究`。剝完若變空字串就整格跳過（沿用 `QUAD_EMPTY_` 那條路）。

### `enemyMasterCard_` 的性別欄

工房原創敵御主的名字看不出性別，卡上卻一直沒有性別欄——AI 只能猜。唯一的線索是卡末那句 `★${pron_(...)}本人在場` 的代名詞，埋在最後、而且是隱含的。資料本來就在手上（下一行就在用 `row[COL.PC.SEX]`），補一格 3 個字。順帶消掉 `〉｜日常表象` 那個開頭就懸空的分隔符——`quadLabeled_` 一律以 `｜` 開頭，前面那格是空的就會露出來。

### `sanitizeUserData_` 的 `entryName`／`targetId`（2026-09）

**同一個鍵名在不同 action 裡是不同的東西，清洗卻是按鍵名一刀切的。** `name` 在 `create` 是御主名（必須純中文），在 `kanshou_world` 是地方／大區／人物的名字（玩家開的「Cafe 藍調·二樓」）。`CHINESE_NAME_FIELDS` 的註解寫「只在建立角色/登記NPC的姓名欄位」，實作卻是全域按鍵名——於是世界帳本的名字被清成純中文≤10 字，而 AI 走 `kanshouWorldWrite_` 寫同一張表反而允許英數＋20 字。修法不是把清洗改成看 action（那會讓「唯一真線」長出第二個維度），而是**不要讓兩個語意共用一個鍵名**：帳本條目改叫 `entryName`，走 `STRICT_NAME_FIELDS`（剝 HTML／MEMORY 結構字元、上限 20＝AI 那條規則）。`check_contract` 從此盯著兩端。

`targetId`：`NAME_MAX=20` 是照 solo 御主名訂的，鑑賞同伴列卻直接用英靈殿全名（`KANSHOU_CASUAL_NAME_` 只收 7 位，美遊／小黑／伊莉雅 install 版是 23~30 字）。名字一截就查無此人。專案早有的原則是「id 優先、名字只當 id 缺席時的備援」（見 `myActiveServantId` 的註解），`findPcRowIdx_` 也本來就吃 `{id, name}`——這三支 handler 只是漏了接。

### `getNickname_`　<sub>Gallery.gs:451</sub>

💬 專屬稱呼(REL_MEM【專屬稱呼】)唯讀取值——關係面板要預填輸入框、companions清單要秀給玩家看，兩處各自寫一次同款 regex 太重複，抽成共用小 helper(鏡射 actionPlay_ 內部的 relMemMemoryStr_，但那支是組提示詞用的完整格式化字串，這支只回傳裸值供 UI 使用)。

### `sanitizeNickname_`　<sub>Gallery.gs:459</sub>

💬 專屬稱呼寫入前的唯一消毒口。REL_MEM 是用 `| [欄名]值` 串起來的單格字串，值裡若混進方括號/全形分隔符就能偽造出下一個欄位。

🐛→✅ 2026-07 邊界稽核：這格【有兩條寫入路徑】——玩家手動(actionSetNickname)與 AI 的intimacy_feedback.mutual_nicknames——但只有手動那條消毒。實測 AI 回一句`"mutual_nicknames": "小可愛| [稱呼鎖]是"` 就能【偽造出稱呼鎖】：玩家從沒手動設過，暱稱卻從此凍結、連 AI 自己之後也再改不動。順帶補上長度上限(AI 那條完全沒有，實測可灌 300 字進提示詞)。單一真實來源：兩條路徑都只走這支。

### `KANSHOU_SCENE_BOND_`　<sub>Gallery.gs:469</sub>

純聊天(AI rel_changes)加好感只能推到「目前所在梯度的上限」就卡住，要靠約定赴約(+5·kanshouPromiseMetStr)或與她獨處於私密場合(+KANSHOU_SCENE_BOND_·見 kanshouAloneBondStr)這類真實相處才能突破到下一梯度。上限沿用KANSHOU_REL_TIER_同一份門檻，不重複開新數字。

### `kanshouRelChatCeiling_`　<sub>Gallery.gs:484</sub>

純聊天封頂只從「熟識(40)」這道門檻起算——第一階「點頭之交→普通朋友」本就該靠日常閒聊自然發生(陌生變朋友天經地義)，不該逼玩家在還沒熟時就得約會/夜襲(2026-07 玩家實測卡在19爬不出、矜持角色約定又被婉拒的死結)。聊天可自由爬到39；40/60/80 三道親密門檻維持要約定赴約/橋段才能突破(slow burn)。

🐛→✅ 2026-07 量到的洞：牆只設在 40/60/80，**過了 80 之後聊天封頂直接是 100**——最濃的那一段（戀人 80~100，21 分寬）反而是唯一能純靠閒聊走完的親密階段，跟 slow burn 的意圖相反；而同居門檻 90 就卡在這段中間，完全沒有牆保護。把同居門檻也納入牆的清單，直接讀常數、不再寫死數字。

### `actionKanshouSummonHero`　<sub>Gallery.gs:497</sub>

直接從英靈庫召喚一位英靈、讓她「存在」於這個後日談世界(不需先在 solo 封存)。召喚是一次性的「讓她出現」，不是「加入隊伍」——沒有隊伍容量上限，之後她依kanshouRollDailyLocation_自己過自己的生活。同一位只能被召喚一次(已存在就不重複建列)。

### `actionEnterKanshou`　<sub>Gallery.gs:498</sub>

🐛→✅ 稽核抓到：改名路徑(actionKanshouSetName)有卡≤16字，但這條「首次進場建檔」路徑完全沒設長度上限——只靠前端 maxlength=16 擋，繞過前端直接呼叫就能塞任意長度進 NAME 欄。補上同款上限。

### `actionKanshouSummonHero`　<sub>Gallery.gs:520</sub>

男性可被召喚，但不會被actionEnterKanshou自動預先鋪墊進世界(見該函式SEX!=='男'過濾)，只能靠玩家在這裡主動召喚。

玩家原創(ai_gen)只有創造者本人可召喚進鑑賞——前端清單已濾掉，這裡是第二道防線(防直打API繞過前端過濾)。種子(正典)英靈不受限、人人可召喚。

### `actionEnterKanshou`　<sub>Gallery.gs:547</sub>

進入慾海·後日談：每個帳號只有【一個】常駐後日談世界，點「進入鑑賞」直接回到這個世界。御主 avatar 綁定帳號比照 solo 的 linkAccountToPc_ 機制：權威連結存在「帳號」表的 KPC欄位，只有伺服器碼會寫(MEMORY 內【帳號】標記僅供人工檢視辨識)。

### `actionBackfillKanshouAi`　<sub>Gallery.gs:563</sub>

🐛→✅ 稽核抓到：這三欄餵進AI提示詞前也從沒設過長度上限，只靠前端擋，補上同款(60字)。

### `actionEnterKanshou`　<sub>Gallery.gs:614</sub>

3️⃣ 沒有常駐御主 → 要新建。御主名字＋性別由玩家「首次進場時自己定」(一帳號可能有不同名字/性別的奪杯，不該由系統掛帳號或亂猜)。前端沒帶齊 → 回 needSetup 請前端先問一次。建好後持久存於這列，之後可用 kanshou_set_name／kanshou_set_sex 隨時改。

### `actionEnterKanshou`　<sub>Gallery.gs:637</sub>

借用solo既有的COL.PC.DAY/HOUR欄位存鑑賞自己的時鐘。開局(及結束一天醒來)固定清晨6點——仍落在timeBand_的「清晨」時段，不強制加「必須先做早餐才能行動」的機關，交給時段感提示詞讓AI自然帶出晨間氛圍。

### `actionEnterKanshou`　<sub>Gallery.gs:646</sub>

比照 solo 創角(actionManualNpc)：先用玩家填的種子片段(或預設)秒寫非阻塞，AI 潤色由actionBackfillKanshouAi 於進場後背景補上(見下)。

🌱 2026-07 玩家御主改「留白＋滾動成長」：不再開局 AI 擴寫玩家內心——玩家的性格/經歷靠玩出來，AI 於 actionPlay 用 master_note 慢慢補【仍空的】欄(玩家自己填過的不動)、經歷隨劇情滾動更新。這裡只秒寫最小預設：TRAIT 三格=外貌(玩家填·留空則空)/氣質(空)/私密一面「無」（2026-09 前是四格、第3格是自稱「我」）；PREF 四格=對外性格(玩家填「個性方向」·留空則空)/獨處性格/喜歡/討厭(後三格全留空待 AI 慢慢長)。

🐛→✅ 同上：外貌/個性方向也只靠前端 textarea maxlength=60 擋，backend 補同款上限。

### `actionEnterKanshou`　<sub>Gallery.gs:664</sub>

開場只入駐4位起始住民(2026-07玩家定案：大河/凜/櫻/SABER——「本來就住在這座城」感最強的幾位)，其餘女角不建列、不存在於世界，之後靠「出門走走」巧遇→玩家點「結識」才正式入駐(見kanshouEncounterStr/inviteResident)。起始好感/關係走一般泛泛之交，各自落在住處/日常地點。

### `actionBackfillKanshouAi`　<sub>Gallery.gs:726</sub>

AI 生成的衣裝比照英靈那邊(daily.outfit)補上，生成失敗/沒給值時種子預設「日常便服」繼續當保底。這是非阻塞背景呼叫，`row` 是AI呼叫【前】的MEMORY快照——若期間玩家觸發了其他會動MEMORY的動作，用舊快照當合併基底會蓋掉新寫入，故在真正寫入前用 wIdx 重讀最新值再合併。

### `actionKanshouCompanions`　<sub>Gallery.gs:739</sub>

🌍 列出這個世界裡「已經存在」的所有英靈(駐留清單)，各自附上目前所在地點，供玩家決定要去找誰。pcId＝慾海御主 avatar(KPC_)。2026-07「加入這個世界的感覺」玩家定案：不再有「隊伍」與人數上限，召喚只是讓她第一次出現在這個世界(見actionKanshouSummonHero)，之後她就自己過自己的生活。

### `actionKanshouCompanions`　<sub>Gallery.gs:756</sub>

面板需要顯示目前所在地點(玩家要精準知道去哪找她)、關係標籤＋好感(供玩家決定要不要改標籤)；

isHere(是否跟玩家同地點)；locLabel：房間類地點的動態顯示名稱，見kanshouRoomDisplayName_。

📅 待赴約定：讓同伴列顯示「M/D 在X有約」，玩家不必自己記(見 kanshouGetPromise_)。

### `actionKanshouCompanions`　<sub>Gallery.gs:763</sub>

🆔 2026-07「整體重構·id優先」：補id讓前端能存起來隨後續action(牽手/邀同居/相約/結識等)回傳，後端才有id可用、不必只靠名字(kanshouNameCandidates_別名表已處理大部分情況，但id才是真正杜絕撞名/前綴混淆的單一真實來源)。

### `actionKanshouCompanions`　<sub>Gallery.gs:769</sub>

🗑 2026-09 小道具/催眠整套移除後，本函式不再下傳 propBond/propCap/propCatalogCap 與 customProps；回傳只剩同伴清單＋quickPhrases。目錄上限尤其重要：滿了才在送出時被拒，面板上原本完全看不出來。**不讓前端自己寫死 80**——前端手抄後端常數是這個專案犯過的錯，改了一邊另一邊就走鐘；由這裡下傳，KANSHOU_PROP_EQUIP_BOND_ 永遠是唯一真相。

### `KANSHOU_QUICK_PHRASE_CAP_`　<sub>Gallery.gs:775</sub>

🎀 快速輸入貼圖·玩家自訂(2026-07「表情包文字也想自訂」，同月再縮減內建數量)：4個內建貼圖(害羞/小聲/苦笑/臉紅)寫死在Script_Kanshou.html(KC_QUICK_PHRASES_BUILTIN_)純前端顯示，這裡只管玩家自己額外新增的——存玩家列MEMORY【快速貼圖】text1,text2,...，逗號分隔比照【自訂道具】同款寫法。純文字清單(不像道具需要強度/部位等子欄位)，點下去一樣只是把文字塞進輸入框游標處(不送出)，玩家自己決定要不要送——後端只負責存/取這份清單。

### `actionKanshouMemoirOp`　<sub>Gallery.gs:819</sub>

💞 共同回憶面板操作(釘選/取消釘選/刪除)——比照 update_rel_tag「玩家 UI 手動管理、AI 無權」精神。釘選=條目加 ★ 前綴(processMemoir_ 淘汰舊條目時永不驅逐★)；刪除=整條移除。op: 'pin'|'unpin'|'del'；item=條目原文(不含★)。帳號歸屬已由 dispatcher 統一驗過，這裡只需索引查找同 gid 的列。

### `actionKanshouSetSex`　<sub>Gallery.gs:849</sub>

⚧ 切換後日談御主 avatar 的性別（隨時可改；只動 SEX 欄，不影響從者/歷史）。pcId＝KPC_。

除驗證新性別合法，也要檢查會不會跟現有「同行」同伴組成不合規配對(比照actionKanshouSummonHero 的規則)，避免御主切換性別後跟既有同伴悄悄變成不合規配對。

### `dialogueFormatRule_`　<sub>Gallery.gs:1113</sub>

🔠 對話與敘事格式·全遊戲【單一真實來源】：solo 的 miniSystem(Router_Narrative.gs) 與鑑賞的nsfwBaseVars(本檔 nsfwBaseRules 第3條) 都呼叫這一支，杜絕兩處各改一半又不一致(工程準則·單一真實來源)。核心分界：凡是「她的口／喉」發出的聲音(話語＋喘息＋吸吮/咀嚼等嘴部聲)一律當台詞進「」；看得見的動作、以及「不是她嘴發出的」聲響(肉體相撞/兵刃/水聲/環境)走敘事擬聲。濃淡(日常↔激烈/情慾)由各軌自己的規則(色度跟隨/親密尺度天花板/戰況)決定，此格式只管『怎麼寫』不管『寫多濃』。

### `buildDefaultSystemPrompt`　<sub>Gallery.gs:1126</sub>

只被鑑賞(慾海)呼叫——solo走完全獨立的 miniSystem。唯一呼叫來源 actionPlay 的 isNsfwMode恆為 true，故不再分 SFW/NSFW 分支，直接寫死唯一會用到的版本。driveOn(主動掌握)由actionPlay 自己組的 driveStr 處理，不在這裡管轄。

🌱 master_note(玩家御主滾動側寫)動態 schema：2026-07 再修（玩家「萌點AI根本亂寫...遊戲中也不要讓AI可以改動，AI只能改動經歷」）——創角時已經讓AI依姓名/性別/外貌/個性一次生成完整的性格四格(對外性格/獨處性格/喜歡/討厭)與萌點(見actionBackfillKanshouAi)，寫定之後就不該再被遊玩中零碎片段的盲猜覆寫掉。master_note 從此【只剩經歷會繼續滾動】，性格四格/萌點徹底從這裡拿掉，AI 遊玩期間完全看不到這兩類欄位、也就無從亂寫。舊版「性格鎖」機制(玩家自己改命鎖哪幾格不讓AI碰)也一併拆除——AI已經完全不會去動這些欄位，鎖不鎖沒有意義。

🌀 includeMasterNote=false(側寫節流·非側寫回合)＝整塊 master_note 從 schema 拿掉，AI 專心敘事；undefined/true＝照常帶(相容舊呼叫)。

🎛️ includeOptions=false(玩家關掉【命運的抉擇】開關)＝options 欄整個拿掉——玩家看不到的東西不必叫 AI 每回合生 4 條(省 token 省注意力)。undefined/true＝照常帶。

### `buildDefaultSystemPrompt`　<sub>Gallery.gs:1147</sub>

appearance_extras(原 outfit_change)：角色當下實際穿著與配飾，AI 可依劇情如實更新(正常穿著寫身上衣物，全裸/沐浴/更衣等狀態也要如實反映；2026-09 小道具機制移除後，配飾也回歸由這一欄承接)，會寫回持久的【換裝】記錄，不是每回合就消失的暫時描述。

🐛→✅ 2026-07 玩家實測「幫她戴貓耳朵，過幾輪就忘記」：舊欄名"outfit_change"字面就是「換裝」，容易連AI帶欄名一起窄化成只認「衣服本身的替換」，當時補了配飾類範例(「貓耳頭飾」)把玩家臨時加的道具也塞進這欄一起救。**2026-07再修**（玩家「小道具已經有專門機制了，外觀服裝也幫我專注在外觀服裝吧」）：現在持久小道具(KANSHOU_PROPS_/自訂道具)才是配飾/道具類的機制保證正解，這欄改回**只專注服裝本身**，不再兼管配飾——避免兩套機制搶著記同一件事、混淆該由誰負責。AI 若自己想在敘事順帶提到身上的小道具(如貓耳)，那是它自由發揮，不強求也不靠這欄記錄。

### `inner_monologue`　<sub>Gallery.gs:1164</sub>

強制思維鏈：放範本第一位讓模型先自省再寫敘事。後端 sanitizeAiData_ 不讀此欄，純粹是給AI 自己看的思考格，零程式面副作用。第三人稱總結是為了不跟 narration 的敘事視角打架（2026-09 旁白已改第二人稱「你」＝玩家，這欄維持第三人稱）；「本回合開始前」明講時態，避免被誤讀成預寫本回合結果。

### `npc_exit`　<sub>Gallery.gs:1169</sub>

🗺️ 2026-07 移動改「同意泡泡」制(見§134)；2026-07再修（玩家實測「AI一直提議移動、頭痛」）：move_proposal 欄位整個砍掉，AI 不再有任何管道自己決定要不要換場景/換去哪。此處刻意【不設location/move_proposal 欄】——玩家的所在地一律由 GAS 掌握：要嘛玩家自己用地圖走(moveTarget)，要嘛玩家在地圖上向同伴提議同去(proposeMove)、GAS 依好感直接裁定接不接受(_pendingProposal)，AI 兩種情況都只負責演出反應，從不負責「要不要提議」或「去哪裡」這兩個決定。

🐛→✅ 2026-07 三度改版（玩家「proposal_accept可以拿掉…promise_proposal也可以拿掉，讓GAS好感超過90…詢問玩家她是否可以與玩家同居…想要當好感卡39之類的時候GAS主動發出邀約」）：promise_proposal(她主動約你改天見面)／cohabit_proposal(她主動邀同居)／proposal_accept(早已停用)三個欄位全部拔掉，AI 不再有任何管道自己決定「要不要開口邀」——約會/同居邀約當時改由 GAS依好感數值直接判定觸發(kanshouPromiseOffer_/kanshouCohabitOffer_)，後來雙雙因玩家嫌「太煩人」(約會泡泡每回合都跳、同居泡泡每天都跳)已整組移除，約會/同居現只剩玩家自己主動發起(promiseMeet/cohabitInvite)一條路。

npc_exit：同伴自主權——她可自然告辭離場，GAS真的把她移出場景(不再是嘴上說走卻還在)。只認此刻在場同伴，去向由系統依作息決定；被牽的人離場→牽手自動鬆開。不必每回合遣散，只在情境自然時。

### `rel_changes`　<sub>Gallery.gs:1198</sub>

target 只能填真名(schema級約束，比事後再說一次更有效)。tag 欄位不存在：關係標籤(COL.PC.REL_TAG)只能由御主透過UI(update_rel_tag)手動更改，AI對標籤的影響力只剩「認不認同」，寫在 intimacy_feedback.npcs[].attitude，不是靠覆寫這個欄位表達。

### `buildDefaultSystemPrompt`　<sub>Gallery.gs:1218</sub>

🔴 NSFW(慾海模式)：本回合聚焦當下的近身互動(情慾/調情/鋪陳皆可)，雜務(物品/金錢/陣營/任務/招募/地圖/戰鬥數值/身世)

完全不追蹤、不輸出，鐵律文字大幅精簡，盡量交給AI自行判斷。意圖攔截只依[個性]判斷(鑑賞無戰鬥

概念，[戰力]門檻與世界觀矛盾)；不設傾心/道侶等詞彙黑名單，實質行為門檻改由玩家提示詞的

【親密尺度·分五階】(好感 20/40/60/80 天花板)統一約束，此處系統規則只講原則、不再硬編單一 80 門檻。

### `specificRules`　<sub>Gallery.gs:1234</sub>

⚠ 2026-07 玩家「色色部分都搬去給點火」實驗：色度跟隨(原0)＋情慾場生理特寫(原4)兩條搬進driveStr(見下方，僅driveOn=true才組進提示詞)——這兩條原本是「怎麼寫得好」的常駐風格指導、不是「准不准寫」的開關(准不准寫仍是【親密尺度五階】的好感天花板在管，跟driveOn無關)。搬走後矜持模式(driveOn=false)不再拿到這兩條的具體寫作指引，即使好感已達戀人階、天花板允許無上限，矜持模式下的措辭可能反而更保守含糊；主動掌握模式因為同時拿到driveStr的推進指令＋這兩條的露骨寫作指引，兩者疊加會更猛。玩家已知情況下要求先試試看，若實測矜持模式下高好感場景意外變乾癟，這是根因、把這兩條原樣搬回來即可。

🗑 2026-07【慾海律令】整塊併進 nsfwBaseRules（玩家：「妳看看能不能整合吧」）——兩份規則實測有 5 處在講同一件事：①律令1(inner_monologue) ②律令4(mutual_nicknames·schema 欄位自己講就好)③律令5(attitude·欄位已整個移除) ④律令6(裝扮) ⑤鐵律5/6 與 schema 的 options。合成一份 10 條、一個標題，AI 不必再跨兩個清單對照。留空字串是為了不動下面的 return 形狀。

### `KANSHOU_LOCATIONS_`　<sub>Gallery.gs:1292</sub>

🌸 鑑賞地點清單：純資料驅動的小陣列，不進 MAP 試算表(不跟solo共用坤圖)——之後要加/改地點只動這裡。前端 Script_Kanshou.html 另有一份同名清單純供畫按鈕(改地點時兩邊都要更新)，實際驗證/邏輯只認這裡這份。region對應KANSHOU_REGIONS_的id，純UI分組用。noEncounter:true代表私人空間，恆不觸發陌生人巧遇(見kanshouRollEncounter_呼叫端)。🏠 房間分區的name是穩定不變的內部key(給LOC比對用)，顯示給玩家/AI看的名稱是動態算的(kanshouRoomDisplayName_)——「我的房間」永遠顯示「(玩家名)的房間」。2026-07 經濟/房東房客世界觀砍除後，鑑賞不再有可指派的客房，同伴們各自落腳在自己原本的住處(KANSHOU_HERO_HOME_)。

🌱 dateOnly:true＝不進kanshouRollDailyLocation_的日常閒晃保底池(避免其他同伴平白無故被骰去這種明顯是「約會限定」的私密地點閒晃)，這個用途仍在使用中(見kanshouRollDailyLocation_)。⚠ 2026-07 八度改版(玩家「約會泡泡也好煩人」)移除GAS主動邀約機制(kanshouPickDate_)後，原本隨dateOnly一起新增、給該機制篩選地點用的minBond欄位已無任何程式碼讀取，故整批移除(地圖上玩家自己走過去/帶她同去這條路本就不受這個門檻限制，移除不影響現行流程)。

🕐 2026-07 六度改版新增 bands：玩家實測「清晨走進深夜賓館，櫃檯空無一人像恐怖片開場」──有些地點名字本身就寫明時段(深夜賓館/夜景展望台)、有些現實中就有營業時段(書店/水族館)，卻能被玩家在任何時段自由走進去，AI只能硬掰理由圓場，讀起來很違和。bands＝這個地點在哪些timeBand_(Time_World.gs 5段：清晨/午後/黃昏/夜/深夜)開放；省略此欄＝不受限、全天候開放(向後相容，其餘地點不受影響)。只管「玩家能不能走進去」，不影響同伴日常閒晃(dateOnly地點本就不進閒晃池；非dateOnly地點的閒晃池目前不比對bands，極少數情況同伴可能被骰去玩家當下進不去的地點，純屬「她剛好在，你正好碰不上」的日常感，不是bug)。門檻依「地點名字/現實常識暗示的營業時段」訂，非玩家點名的地點一律維持不設限，之後想擴大範圍只需往表加 bands 一列。⚠ 改這裡記得同步前端顯示鏡射 KC_LOCATIONS_(Script_Kanshou.html)的同名地點——否則鎖圖示對不上後端實際判定(同KANSHOU_LOCATIONS_/KC_LOCATIONS_過去漏同步過5個地點的教訓)。設有 bands 限制的地點若被玩家相約(promiseMeet)選中，只能挑跟該地點bands相容的時段，避免「約好了、赴約時卻被地點未開放擋在門外」的必爽約陷阱。

### `kanshouLocContextForAI_`　<sub>Gallery.gs:1345</sub>

拜訪住處：只保留女性角色的住處，noEncounter:true(私人住處，恆不觸發陌生人巧遇)，name務必與下方KANSHOU_HERO_HOME_的值逐字一致，否則kanshouRollDailyLocation_骰到的地點對不上這裡。（2026-07 七度改版：泛用住處池KANSHOU_GENERIC_HOME_POOL_不寫在這裡手動維護，改在該常數宣告處用push動態併入此陣列，同樣受這條「name須逐字一致」規則約束，只是來源不同。）

### `KANSHOU_LOCATION_TAGS_`　<sub>Gallery.gs:1365</sub>

地點×角色 氛圍標籤(資料驅動，往陣列塞一筆 SEED_SERVANTS 的 id 就能加，不動抽選邏輯)：查無標籤或抽不中標籤池時退回全女性保底池KANSHOU_ENCOUNTER_FEMALE_IDS_；不含KANSHOU_SUMMON_BLOCKED_IDS_裡暫時移出的id，避免巧遇到根本無法被正式召喚入駐的人。

### `KANSHOU_LOCATION_ACTIVITY_`　<sub>Gallery.gs:1378</sub>

🏷️ 2026-07「移動過去 他們必須是要在打工或是消費活動...不然聊一聊會不會忘記他是在工作」玩家定案：商業性質地點給一句「當下在做什麼」的輕量敘事引子，讓AI對「為什麼她在這個店裡」有個合理交代、且整回合對話都能維持一致(不需要持久狀態——每回合都直接依她當下真實LOC現查現算，本來就不會忘記；純寫死的地點→活動對照表，沒有寫死的地點沒有這句提示，AI自然發揮，不受限)。

🎲 2026-07 玩家「有時打工有時當客人」：每地點改成多個活動變體(店員側/客人側/自然變化)，用「名字+日期+地點」決定性挑選(kanshouLocActivity_)——同一人同一天同地點恆同一個(聊到一半不會店員忽然變客人)，跨日/換人/換地自然輪替。零持久化、每回合現算。

### `KANSHOU_SCENE_EVENTS_`　<sub>Gallery.gs:1415</sub>

橋段庫：GAS先決定「觸發條件」與「這次走向」，AI只負責照著選中的走向演出具體細節，玩家不必自己打字下劇本。之後想加新橋段，往這裡加一筆即可，不必另開一條平行的敘事管線。branches依bond由高到低排列，取第一個bond達標的當作這次走向。每筆橋段除branches外帶4個演出欄位({n}=候選人真名，後端替換)：label=前端邀請框文字、btn=按鈕字、verb=接受後提示詞的動作前綴(「${verb}『名字』」要讀得通順)、intent=玩家意圖句。

🎭 情境氛圍表（2026-07 玩家「橋段太過生硬」根治改版）⚠ 舊版每則帶 label/btn/verb/intent ＋ 依好感分歧的 branches[].tag——tag 是一整段【劇本】(「往旁挪出位置邀你一起、甚至替你擦背」)，且提示詞明令「情緒基調不要偏離」。後果：同一好感區間每次演出來都是同一段戲、角色個性被壓過去，而且把「說書」寫死進資料表，違反本專案「GAS 掌事實、AI 只說書」的鐵則。現版本每則只留一句 ambient＝【此刻的客觀情境事實】，不規定她的反應、不給選項按鈕。玩家想不想理會、要怎麼互動，直接打字即可(鑑賞本來就有聊天框)。分寸仍由【親密尺度五階】統一管。🛏️ 夜襲/賴床叫醒已整組移除：她睡著這件事本來就由 pSleepStr 每回合當既定事實餵給 AI(判準完全相同)，再包一層按鈕只是把自然的處境變成一張要點的卡。

### `KANSHOU_ASLEEP_HOUR_END_`　<sub>Gallery.gs:1450</sub>

睡眠時刻切點(玩家實測要求：0~8點在她家/和室/玩家房間必定熟睡)——不依附 timeBand_ 的深夜/清晨切法，清晨 band 原本一路延伸到 11 點、超出「還在睡」的合理範圍。0~5點=熟睡、5~8點=賴床將醒。2026-07 泡泡拆除後，服務對象是 pSleepStr(每回合把睡眠狀態當既定事實餵給 AI)與深夜訪客橋段。

### `KANSHOU_LOCATION_EVENTS_`　<sub>Gallery.gs:1455</sub>

地點橋段觸發表：她剛好在這個地點×時段吻合→把該事件的 ambient 當「此地此刻·情境事實」注入提示詞(2026-07 泡泡拆除後不再跳按鈕，見 kanshouSceneAmbientStr)。加新地點橋段＝這裡加一筆＋KANSHOU_SCENE_EVENTS_加對應事件，不動觸發邏輯。

### `KANSHOU_FESTIVAL_EVENTS_`　<sub>Gallery.gs:1465</sub>

節慶橋段觸發表：日曆走到節慶當天(KANSHOU_FESTIVALS_的month/day)×時段吻合×玩家所在地有同伴→注入該事件的 ambient 情境事實。key對齊KANSHOU_FESTIVALS_.key。

🎊 節慶【不限時段·不限地點】(2026-07)：bands 欄位保留但【已不再被讀取】——留著當文件，日後想恢復時段限定不必重寫結構。時刻限制改由 ambient 文字本身寫成任何時刻都成立來取代。

🎯 doneLoc/todo＝「今天該做的事」(2026-07 玩家「想要一個類似任務重點」)：doneLoc＝完成這件習俗的地點(陣列·任一個都算)；todo＝那件事本身，只拿來組委婉提醒。完成判定由 GAS 自己看事實(玩家人在 doneLoc ＋ 身邊有同伴)，不問 AI、不加按鈕。

### `KANSHOU_COHABIT_EVENTS_`　<sub>Gallery.gs:1483</sub>

🏠 同居日常橋段觸發表(時段→事件)：她【同居中】×兩人同處玩家居所×該時段有對應日常→注入 ambient。實際優先序＝節慶 > 地點 > 同居，同居刻意排【最低】：膝枕(客廳·午後)/共浴(浴室·夜)/下廚(廚房·黃昏)這些既有的地點專屬橋段仍然優先，同居日常只補它們沒佔到的時段空檔，不搶既有內容。加時段＝這裡加一列＋KANSHOU_SCENE_EVENTS_ 加對應事件，觸發邏輯不必動。

### `kanshouAsleepOutcomeStr_`　<sub>Gallery.gs:1490</sub>

🌙 深夜訪客「別有用心」的分寸判準(2026-07 泡泡拆除後，唯一呼叫點只剩深夜敲門那條)：好感決定這次能走到哪一階，不寫死台詞，具體怎麼演、講什麼話全交AI依角色性格發揮。切點沿用親密尺度五階既有的60(親吻擁抱)/80(無上限)兩個節點，跟其餘尺度判定同一套數字、單一來源。

### `KANSHOU_HERO_HOME_`　<sub>Gallery.gs:1498</sub>

修過的bug：kanshouRollDailyLocation_原本深夜/清晨的homeBias會直接回傳玩家自己家的房間，讓不在場的人溜進玩家家裡——改成每位英靈自己的住處(資料驅動，同KANSHOU_LOCATION_TAGS_寫法)，已同步登記進KANSHOU_LOCATIONS_(region:'visit')成為可造訪的真實地點；也是夜襲/賴床叫醒橋段候選地點的唯一真實來源(見actionPlay)。

🏠 2026-07 七度改版·手寫專屬住處只有這7位種子英靈，其餘所有英靈(其他種子＋玩家原創/AI生成)完全沒有可造訪的家——夜襲/賴床/拜訪住處對她們全數失效(玩家「新增的英靈會有住處嗎？」)。已改成 kanshouGetHeroHome_ 統一讀取：這份手寫表優先(專屬豪邸不變)，查無才退回下面的KANSHOU_GENERIC_HOME_POOL_(隨機分配、寫進她自己列的【住處】記憶標記，一次分配、終身持有，見heroToKanshouRow_)。方便(新英靈免手動維護此表)·合理(每人一個可視為她家的真實地點，不共用泛用字串)·隨機(從池子隨機抽一間)。

### `KANSHOU_GENERIC_HOME_POOL_`　<sub>Gallery.gs:1513</sub>

🏠 泛用住處池(七度改版新增)：沒有專屬豪邸的英靈隨機抽一間、終身持有。純泛用命名(不影射任何特定角色背景)，跟手寫豪邸一樣登記進 KANSHOU_LOCATIONS_(region:'visit')成為可造訪的真實地點，共用同一套移動驗證/拜訪門檻，不必另開機制。generic:true 標記只供 heroToKanshouRow_篩選"可隨機分配"的候選池，不影響其餘既有邏輯(其餘地方一律當普通 visit 地點看待)。

### `getKanshouMetSet_`　<sub>Gallery.gs:1544</sub>

🏷️ MEMORY標記存取器【邂逅】：逗號分隔的巧遇過姓名清單，去重、僅供「似曾相識」氛圍參考——同行隊伍成員的好感/關係走既有 REL_TAG/BOND，這裡只記路人巧遇過誰，不重複記錄。比照 getOutfit_/setOutfit_(Core_Settings.gs)同款「清除舊值再整段append」寫法。

### `kanshouRollEncounter_`　<sub>Gallery.gs:1559</sub>

巧遇抽選共用邏輯(70%機率)：「出門走走」按鈕跟「原地問還有誰」共用同一套加權隨機。查無標籤地點退回全池保底。excludeIds：已正式召喚過的英靈已有真實好感記錄，不該又以「陌生人」身分重複出現，故排除在骰池外。

### `kanshouResidenceUnlocked_`　<sub>Gallery.gs:1580</sub>

🔒 拜訪私人住處門檻：跟屋主(KANSHOU_HERO_HOME_反查)在本局已入駐、且好感≥KANSHOU_VISIT_BOND_(熟識40)才解鎖登門——沒熟到一定程度不好貿然闖進人家家裡。單一真實來源，前端(buildTagsPayload_ unlockedResidences)跟後端移動攔截(actionPlay)共用這個判定。可跨聊天上限：靠赴約(kanshouPromiseMetStr +5·不吃chat ceiling)推過40。

### `kanshouLocHasPendingPromise_`　<sub>Gallery.gs:1593</sub>

🐛→✅ 2026-07 稽核抓到的「必爽約陷阱」：約定成立當下有檢查地點解鎖(見actionPlay的_pmLocOk)，但約定成立後、赴約前若好感因其他事件跌破熟識(40)，屋主的私宅會重新上鎖——玩家想赴約走過去卻被kanshouVisitBlockedStr攔在門外，隔天還被系統判「爽約」倒扣好感，兩個機制都各自正確卻互相矛盾。已成立的約定若目的地正是這裡、且還沒過期(day>=curDay)，移動時豁免解鎖檢查——赴約優先於門檻。

### `kanshouRollDailyLocation_`　<sub>Gallery.gs:1604</sub>

同住人深夜/清晨睡不著出門走走的機率，獨立於一般英靈的homeBias，資料只存一處。

幫「不在身邊」的英靈決定當下要去哪——反查KANSHOU_LOCATION_TAGS_有沒有標到這位英靈，有就加權隨機挑一個常去地點，沒標到就全地點隨機挑。hour：深夜/清晨時段大機率改回「她自己原本就有的住處」(kanshouGetHeroHome_：KANSHOU_HERO_HOME_專屬住處優先，查無就讀【住處】隨機分配記憶標記，兩者皆無才退回通用的「自己的住處」)。

memory選填：只有call site拿得到該英靈自己列的MEMORY時才傳，供讀取隨機分配的【住處】標記；省略時只吃KANSHOU_HERO_HOME_專屬住處(現有7位種子英靈不受影響)。

### `kanshouRollDailyLocation_`　<sub>Gallery.gs:1632</sub>

🌙 全地點保底池排除'room'(玩家自己的房間)跟'visit'(別人登記的住處，見KANSHOU_HERO_HOME_)兩個分區——不同行的英靈不該隨機骰進玩家臥室或別人家裡，那裡只能靠「拜訪」主動走進去，不是隨機亂晃能撞到的地方；否則沒有haunts標籤/沒有登記住處的英靈可能隨機骰進遠坂邸這種別人的家，跟夜襲/賴床叫醒橋段「LOC剛好等於某人家」的判定衝突，觸發在錯的人身上。'home'分區(共用生活空間，客廳/廚房等)不算私人，維持可被隨機骰中。dateOnly(深夜賓館/情侶溫泉套房這類明顯是GAS約會邀請限定的私密地點)也排除——不該讓其他無關同伴平白骰去這種地方閒晃。

### `KANSHOU_CAL_START_MONTH_`　<sub>Gallery.gs:1641</sub>

真正的西曆年/月/日(每年固定365天、不算閏年，遊戲用途夠精準)，只抓3年區間(見actionPlay的advanceHours上限)不追求無限年份。Day1固定對應12月20日——過幾天日常後 12/25 聖誕、12/31跨年接連到來，新玩家開局就撞得到節慶橋段(見 KANSHOU_FESTIVAL_EVENTS_)。

### `kanshouHoursUntilDate_`　<sub>Gallery.gs:1670</sub>

算「從現在」到「下一次」某月日前一天早上6點的小時數(2026-07玩家定案：提前一天抵達，讓敘事能帶出「明天才是節慶」的期待感，而非直接落在節慶當天)。已經錯過這次(節慶前一天6點已過)就自動算成明年(hours<=0時+365天)。

### `KANSHOU_TIME_BANDS_`　<sub>Gallery.gs:1684</sub>

「跳到時段」：GAS算好差幾小時再丟進既有advanceHours管線，跟跳到節慶(kanshouHoursUntilDate_)同一種「單一真實來源在後端」寫法。已在目標時段時一律跳「下一次」。startHour對應timeBand_(Time_World.gs)的5段分界，兩處改動要保持同步。

### `KANSHOU_HOUR_PER_ACTION_`　<sub>Gallery.gs:1699</sub>

⏰ 時間隨玩家動作自然流動：一般 AI 敘事回合每次推進幾小時(讓「到處跑卻永遠停在6點」的凍結感消失)。刻意夾在當日 KANSHOU_DAY_LAST_HOUR_(23:00)不跨日——跨日(睡覺)只由「結束一天」儀式負責。0.5＝每個動作約半小時(玩家定案：一小時太久)；時鐘因此支援 X:30，格式化走 kanshouFmtHM_。

### `kanshouClockInfo_`　<sub>Gallery.gs:1723</sub>

「跳到時段」＋「時段行動」按鈕都需要前端知道現在幾點——這裡統一格式化成單一真實來源，buildClientState_/actionPlay的回應都呼叫這支，不各自重複拼字串。

🩹 2026-07玩家「這要顯示幾年幾月幾號」定案：label從抽象的「第X日」改成實際年月日(跟敘述文字${newDate.year}年${newDate.month}月${newDate.day}日同一種格式)，跳節慶/大跳躍後玩家能親眼確認日期真的有推進，不會看起來像卡住不動。

### `setKanshouHomeName_`　<sub>Gallery.gs:1729</sub>

🐛→✅ 稽核抓到：原本沒清掉｜/【/】等標籤分隔字元，玩家取名帶這些字元會撐壞這行MEMORY格式(讀取時regex在第一個｜就截斷，殘餘字變成脫隊在tag外的孤兒文字)。走 kanshouSanitizeTagValue_ 同款淨化。

### `KANSHOU_KNOCK_CHANCE_`　<sub>Gallery.gs:1739</sub>

結束一天(準備就寢)時的機率事件：命中就【直接讓她進門】、本回合不推進日期。⚠ 2026-07 玩家「如果玩家沒按泡泡而是打對話呢？」——舊版是純早退零落盤的「開門/不予理會」待決泡泡，玩家改打字時「結束一天」的意圖會靜靜蒸發(日期沒推進、訪客沒到)，可是敘事已經寫了敲門聲，AI 同時收到「有人敲門」跟「她不在場不准開口」兩條矛盾指令。改成先落盤再給善後選項：她真的就在房裡，玩家想打字就打字，AI 照常演，之後想睡再按一次「結束一天」。

### `KANSHOU_MORNING_AFTER_TAG_`　<sub>Gallery.gs:1751</sub>

好感≥80觸發同床共枕的那次結束一天，順手記一筆「今晚共度良宵的對象」，下一回合(不論玩家做什麼)讀一次就清掉(一次性旗標)，餵進提示詞當【晨間餘韻】引子。刻意不斷言「一定發生了」，交給AI依上一回合實際演出內容判斷要不要接續。

### `KANSHOU_NIGHT_PART_TAG_`　<sub>Gallery.gs:1755</sub>

🌙 同款一次性旗標的另一半：那些「昨晚陪你到最後、卻沒留下來」的人。跟【晨間餘韻】同樣在下一回合讀一次就清掉，差別只在給的是「昨夜她走了」而非「昨夜她留下」——兩者互斥、同一個人不會同時出現在兩張名單。2026-07 玩家「醒來都沒有自言自語？應該要有昨天 NPC 匆忙道別的回憶吧」：≥80 留宿的人隔天早上有餘韻可接，未達門檻的人卻是連走都沒交代、隔天更沒有任何痕跡。

### `KANSHOU_NIGHT_SCENE_TAG_`　<sub>Gallery.gs:1760</sub>

🌙 夜未眠(存玩家列·absDay)：2026-07 玩家「睡覺按鈕這裡有被夜襲判定+色色…要再切一段深夜的大戰時刻...?」。舊做法是按下「讓她留下」＝ endDay:true，於是【同一個回合】要同時演完深夜相處、收束到就寢、還要把整天結掉推進到隔天 6:00——按鈕上那行小字「直接到早上」就是自白。篇幅上限 500 字(_kanshouTargetWords_)塞不下，玩家也完全插不上手。改成兩段：第一次按＝進入這個狀態(時間停在就寢時刻、人釘在房裡、可無限回合推進)，第二次按＝真的睡到天亮。值＝進入的那一天，隔天自然失效，不必另寫清除。

### `KANSHOU_INITIATIVE_DAY_TAG_`　<sub>Gallery.gs:1768</sub>

🙋 她主動(2026-07 玩家「泡泡用的應該也很少了…NPC 是不是就不太主動了？」)。稽核結果：她主動的機制只剩「按睡覺時 20% 的深夜訪客」一條，一天 90 個回合裡有 89 個她永遠在等你先開口。舊的主動邀約/橋段泡泡全被拔掉，理由都是同一個——「條件成立就每回合跳，玩家嫌煩」。所以這批一律【不做泡泡】：GAS 擲骰→直接寫成既成事實→AI 演，中間沒有任何一句「你要不要？」。這正是深夜訪客不惹人厭的原因，照抄那個形狀。⚠ 閘門是【全域每日一次】不是每人每天一次——10 位同伴搶同一個名額，頻率跟 1 位完全一樣(玩家「不然如果 10 個 NPC 我不就天天約會」)。

### `KANSHOU_INIT_BASE_`　<sub>Gallery.gs:1776</sub>

📐 調校依據(2026-07 模擬 40 天實跑)：初版 BASE .006/PER_BOND .0002 打完整天會 39/40 天都有事，「每天都有」讀起來很腳本。降到下面這組後，好感 85 打滿一天約 2/3 機率、好感 40 約 1/2。★這是「每回合擲一次」不是「每天擲一次」，所以只玩十幾個回合的日子自然更安靜——頻率跟著玩家投入的時間走，這正是想要的。

### `KANSHOU_INIT_VISIT_FROM_`　<sub>Gallery.gs:1783</sub>

🕘 只有「她自己走來找你」這條要看時鐘：另外兩種她本來就已經在你面前，幾點都不奇怪。2026-07 玩家「每日一次…?早上6點跑來我家約我??!」——沒這道閘門，清晨 6 點剛醒就有人登門。深夜那一段本來就是深夜訪客的地盤(KANSHOU_KNOCK_CHANCE_)，這裡讓開、不重疊。

### `KANSHOU_SCENE_DAY_TAG_`　<sub>Gallery.gs:1798</sub>

🎭 橋段當日戳(存該同伴列MEMORY·absDay)：同一位同伴、同一天，只有第一次接受橋段才給KANSHOU_SCENE_BOND_ 好感——防「靠近她/叫醒她」按鈕在同地×時段吻合時每 0.5h 重覆刷 +3、繞過細水長流節奏。0=今天尚未經歷橋段。橋段敘事本身照演，只擋重覆加好感。

### `KANSHOU_NIGHT_GUEST_TAG_`　<sub>Gallery.gs:1805</sub>

🚪 這次夜訪的客人姓名(存【玩家】列)：「送客」的唯一姓名來源——dismissGuest 是下一個 request才送來的，後端得記得是誰；刻意不吃 client 傳的名字。清除時機：任一種收場(留下過夜／送她回去／結束一天)都算這次來訪結束。

### `getKanshouAnnivFired_`　<sub>Gallery.gs:1812</sub>

🐛→✅ 稽核抓到：紀念日里程碑原本用exact-match(curDay-初見日 === 7/30/100/365)判斷，但時間可一次跳多天(節慶跳/大量advanceHours上限3年)，一旦跳過整數剛好等於門檻的那天，該里程碑就永久漏發(curDay-初見日只會遞增遠離、不會回頭)；同伴當天恰好不在場(partyRows之外)也是同一類漏發。比照BOND_MILESTONES_(Router_Bond.gs)既有「已發集合」寫法：改成>=門檻且尚未發過，跨過門檻也能在她下次入場時補上，且發過就不再重複觸發同一則。

### `KANSHOU_FIRSTS_TAG_`　<sub>Gallery.gs:1827</sub>

💞 結構化「第一次」帳(存該同伴列MEMORY)：【初次】事件:absDay,事件:absDay,…為什麼不靠 memoir：memoir 是 AI 自由書寫、cap 10 會被新回憶擠掉——玩久了開頭那段必然消失，於是「我們第一次牽手是哪天」這種只要講錯就直接戳破沉浸感的事實，反而是最先被遺忘的。改由GAS 在事件【真的成立】的那一刻蓋戳(冪等·只記最早那次·之後只讀不改)，當既定事實餵進提示詞，AI 不必也不能自己編。不佔 memoir 額度、不會被擠掉。⚠ makeTextTag_ 的值不可含 ｜/|/【 ——鍵名寫入前已濾掉這幾個字元＋逗號冒號(分隔符本身)。加一種新的「第一次」＝呼叫端多一行 kanshouStampFirst_ 即可，本區不必動。

### `KANSHOU_REL_RANK_TAG_`　<sub>Gallery.gs:1855</sub>

💗 關係階級「歷來最高階」標記(存該同伴列MEMORY·1=點頭之交…5=戀人)：用來偵測「這回合剛跨階」。刻意看 BOND 不看 REL_TAG——玩家一旦自訂關係稱呼，REL_TAG 就不再等於任何梯度字面(見kanshouSyncRelTier_)，跨階演出不該因此消失；階級的真實依據本來就是好感數值。只升不降：跌回去不倒扣、也不會在來回震盪時重複觸發同一階。

### `KANSHOU_CHILL_DAY_TAG_`　<sub>Gallery.gs:1863</sub>

🧊 最近一次「讓她不高興」是哪一天(absDay·存她那列)。存在的理由：提示詞給 AI 的是純量好感值，剛爬到 90 跟從 98 摔到 90 長得一模一樣，都演成熱戀——【趨勢】完全沒有進到提示詞裡。棘輪上線後更明顯(連退階這唯一的間接信號都沒了)，於是連續冷落她好幾天，她照樣熱情如初。只記「哪一天」不記累計量：靠日期自然衰減，不必另寫遞減邏輯；門檻見 KANSHOU_CHILL_MIN_DROP_。

### `actionPlay_`　<sub>Gallery.gs:1869</sub>

🐛→✅ 同一輪稽核：按「同意」(moveWithCompanion)那一回合送的是這句單身閒逛的意圖，跟同時送出的「與你結伴一起來到」在場來由互相打架。同行就照同行寫。

### `KANSHOU_APPT_BANDS_`　<sub>Gallery.gs:1883</sub>

📅 約定 2.0(存該同伴列MEMORY)：【約定】absDay:時段:地點＝「那天午後在X見」。同時只存一筆(新約蓋舊約)。band 為 KANSHOU_APPT_BANDS_ 之一(午後/黃昏/夜)；舊格式【約定】day:loc(無時段)向後相容＝整天有效。

約定時刻表：她提前10分到場、準時窗=[時刻-10分, 時刻+30分]、之後~2h算遲到、整天沒去=爽約。排除清晨/深夜(約會不約6點或半夜)。UI 用 band key、顯示名見 label。

### `KANSHOU_SIDEWRITE_EVERY_`　<sub>Gallery.gs:1892</sub>

🌀 側寫節流：master_note(經歷)每回合都問會分散 AI 對敘事的注意力。改成每 N 回合才把master_note 放進 schema，其餘回合 AI 完全不知道有這回事、專心寫敘事。計數存玩家列 MEMORY——該列每回合本就必寫回(pcIndex 恆在 dirtyPcRows)，故零額外 round-trip。N=3 剛好貼齊 6筆/3輪 的歷史窗。

### `KANSHOU_APPT_LEAVE_EARLY_`　<sub>Gallery.gs:1928</sub>

有時段的約定：她約定時刻前10分到場、待到時刻+2h(碰面窗過了自然離開，不整天空等)；無時段(舊)=整天釘。curHour 供時段判定；沒傳(舊呼叫)則退回整天釘、不破壞既有行為。

⏰ 約定「該動身了」的提前量(小時)：到點前這麼久她就會自己前往約定地點。0.5＝提前30分，一個動作 10 分鐘，玩家還有約三步可以跟上。pin 窗口與「先走一步」共用這個數字。

### `KANSHOU_COHABIT_TAG_`　<sub>Gallery.gs:1940</sub>

🏠 同居(存該同伴列MEMORY·【同居】1)：好感≥KANSHOU_COHABIT_BOND_且本人在場才邀得成。同居後行程骰改走同居版(見kanshouRollDailyLocation_)：深夜85%回「和室」就寢(15%在外遊蕩)、清晨50%還在和室賴床、夜間75%在家中公共空間活動，白天照常出門過她自己的生活。

### `KANSHOU_COHABIT_END_TAG_`　<sub>Gallery.gs:1944</sub>

🏠 同居剛被解除的一次性旗標(蓋在她那一列)：kanshouSyncRelTier_ 在好感跌破門檻時蓋，actionPlay_組提示詞時讀一次就清。存在的理由是跨函式傳事實——那支是共用 helper、看不到提示詞變數，而「她搬走了」這件事非說不可，否則就是本檔【在場驗證】自己禁的「不解釋就消失」。

### `KANSHOU_AWAKE_HERE_TAG_`　<sub>Gallery.gs:1951</sub>

🌙 醒著陪同標記(存該同伴列MEMORY·地點值)：牽手/剛同意同去而醒著陪同的同伴，即使之後放手、或玩家離開又走回來，只要人還在同一個地點沒變動，就持續視為醒著——否則放手的瞬間、或離開再進來的下一回合，她就會被誤判成剛好躺在自己家/和室裡熟睡，儘管全程明明醒著陪在玩家身邊互動(玩家實測「放開手馬上跳出賴床叫醒的泡泡」「離開又進去，敘事明明醒著卻還跳賴床泡泡」)。地點一變(她離開/被重骰走)就自然失效，不必手動清。

### `KANSHOU_COHABIT_ASKED_TAG_`　<sub>Gallery.gs:1958</sub>

🏠 同居邀請「已問過」一次性標記(2026-07 玩家「同居做成泡泡問一次、完全隱藏才是正解」)：好感首次達 KANSHOU_COHABIT_BOND_ 且她在場時跳一次邀請泡泡，跳過就蓋章、之後永不再問。⚠ 刻意【不】綁在「跨進戀人」那一階——戀人是 80、同居門檻是 90，在 80 問會被後端以「關係還沒深到能同住」回絕，變成問了也沒用的假泡泡。

🏠 同居邀請的當日戳(存該同伴列·absDay)：同一位、同一天最多問一次。刻意【不是】布林——布林版玩家一旦沒按泡泡就永遠問不到了(見 kanshouCohabitOffer_ 的說明)。舊存檔殘留的值 1會自然不等於當前 absDay，下次自動恢復詢問，不需遷移。

### `kanshouConfessAccepts_`　<sub>Gallery.gs:1982</sub>

💗 告白成不成——【GAS 依 好感×相處次數 擲，AI 只演】(比照 kanshouProposalAccepts_ 的分工)。好感給主幹的機率、熟悉度當係數：好感 79 的老交情約 .64、同樣好感但才見過幾次面只有 .19。刻意不保證必成——「一定會答應的告白」跟舊版「爬到 80 自動變戀人」是同一件事。

### `kanshouSanitizeTagValue_`　<sub>Gallery.gs:2062</sub>

通用【tag】值淨化：清掉標籤分隔字元(,/:/｜/【/】)避免撐破 MEMORY 裡任何單值 tag 的格式(住所名等任何單值 tag)，順手也清掉引號/角括號(防止原樣塞進前端onclick屬性時破壞HTML)。maxLen不帶預設8。🐛→✅ 稽核比對 solo Router_Creation.gs 的同款清洗(cleanTagText_/_fClean)發現那邊多清\n\r\t(換行/tab)這裡沒清——雖不會撐破｜【】格式(regex排除集本就含隱式匹配換行)，但跟既有慣例對齊，一併補上。

### `KANSHOU_ALBUM_CAP_`　<sub>Gallery.gs:2099</sub>

📷 相簿(拍照收集)：手機拍照·2026-07 再修（玩家「拍照要改成手機、不用等」）——原本是寶麗來設定(每日底片限量+隔天沖洗)，玩家覺得手機沒有底片這種東西、拍完也該立刻能看，兩個限制都拔掉了。只留每局相簿總容量 KANSHOU_ALBUM_CAP_ 張(滿了要刪舊照，避免試算表無限膨脹)。小敘述由AI在拍照當回合的回應JSON多吐photo_caption(同一次呼叫·零額外round-trip)，AI沒吐才用模板保底。

### `getKanshouActiveEncounter_`　<sub>Gallery.gs:2173</sub>

🏷️ MEMORY標記存取器【邂逅中】：這次到訪、還留在場邊可持續互動的巧遇對象(存hero id，單一值)——跟永久性的【邂逅】(邂逅過的名單，不會清除)不同，這個是「這次到訪期間」的暫時狀態，玩家移動離開該地點時清除(換地點＝這段緣分結束，下次到訪重新擲)。比照 getOutfit_/setOutfit_ 同款寫法。

### `KANSHOU_CASUAL_NAME_`　<sub>Gallery.gs:2205</sub>

部分英靈殿角色的 realName 帶括號附註(如「克洛伊·馮·愛因茲貝倫（Archer install）」)，AI 敘事自然只會用括號前後其中一段稱呼TA，但 rel_changes[].target 等比對要求逐字完全相符——會悄悄比對失敗、整條被跳過。抽出候選字串(全名/括號前/括號內)供比對，不用改動任何一位角色的既有 realName 資料。

🏷️ 日常稱呼(2026-07 玩家定案「姓氏太多餘、名字太正式」)：鑑賞的世界一律用短名/職階稱呼。keyed by SEED id(名字可能撞、id 唯一)。⚠ 種子庫只有一位櫻(id 間桐櫻黑化-Master·真名間桐櫻)，直接叫「櫻」。英靈殿/solo 不動，只有鑑賞建列與敘事用短名。

### `KANSHOU_MISS_COPY_`　<sub>Gallery.gs:2249</sub>

📣 「提議撲空」敘事字串資料驅動查表：promiseMeet/proposeMove/cohabitInvite/handHold/inviteResident五處各自的「對象不在場/緣分不成立」撲空回饋，字面各自保留(措辭本就不完全相同)，只把「組字串」這個動作抽成單一helper，type→措辭表，5處呼叫同一支函式、不再各自手刻字串拼接。

### `actionPlay`　<sub>Gallery.gs:2265</sub>

🔒 併發保護（2026-07 全面稽核·兩組獨立agent各自抓到同一根因）：actionPlay 故意豁免全域鎖(見 Router_Action.gs LOCK_EXEMPT_ACTIONS_，理由是AI呼叫4-5秒~最壞49秒不等，鎖全域會拖累其他玩家)，但寫回機制是「整表快照→本回合全部改動只在記憶體→結尾整列覆寫」(見下方dirtyPcRows)，若同一個pcId的兩次呼叫執行窗口重疊(同帳號兩分頁/兩裝置同時操作、或聊天等AI回應時另開改命視窗存檔)，後flush的請求會用自己那份舊快照整列覆寫掉先flush者的所有改動——不分青紅皂白，好感/MEMORY標記/服裝/技巧全部蓋掉。這裡不加全域鎖(仍會拖累其他玩家)，改用CacheService做「同一pcId」的軟性互斥：偵測到同pcId仍有一次actionPlay在跑，直接拒絕本次待玩家稍候，不讓兩者的整列覆寫互相競速。

### `actionPlay_`　<sub>Gallery.gs:2289</sub>

🐛→✅ 稽核抓到：這是鑑賞主對話輸入，全代碼庫其餘會塞進AI提示詞的自由文字欄位(武裝/換裝/快速貼圖/召喚自訂描述等)都會清掉｜【】(MEMORY標記與本檔系統指令視覺符號同一套字元)，唯獨這個最常用、也最先送進提示詞的欄位只做長度截斷(GLOBAL_MAX 2000字)，完全沒清。玩家可以在對話裡塞「」結束系統既有的『』引號、接著自己寫一段「★★【緊急覆寫】...」偽裝成本檔真正的最高權限指令(如3132行★★【天花板也管命令/強迫/暴力】同款格式)，讓AI誤把玩家台詞當成系統指示——且原始未清洗文字還會存進歷史、往後1~6輪持續回餵給AI，不只影響單次回應。數值面(好感漲跌/親密門檻)已有獨立夾值不受影響，但敘事面單輪演出可能被誤導。比照其餘欄位補上清洗。

### `actionPlay_`　<sub>Gallery.gs:2306</sub>

喜好與厭惡是常態情報，全面開放給 AI 參考

🎯 送出時砍格(2026-07 玩家「性格四格／特徵四格分這麼細，AI 也沒辦法演出來」)：儲存仍是 4 格(逆天改命 UI／工房／solo 共用同一個 schema，動它是全面重構)，只精簡【送給 AI 的呈現】。性格：表象/內裡是反差核心必須分開；喜歡/討厭是「聊到才用」的話題燃料，併成一格即可。

### `actionPlay_`　<sub>Gallery.gs:2312</sub>

🎯 [喜歡][討厭]不再送鑑賞(玩家實測「沒有特別的差異」)——那兩格是「聊到才用」的話題燃料，不是每回合演出都要用的規則。solo 的 servantCard_ 仍吃完整四格，資料本身不變。⚠ 同批已把鑑賞側逆天改命的這兩格藏起來，避免變成「填了沒效果」的假欄位。

### `actionPlay_`　<sub>Gallery.gs:2318</sub>

〔已拆除〕[自稱] 這格內容通常已是「自稱「我」」這類完整片語，跟敘事視角說明的「我」字面相鄰容易混淆(小模型尤其)，當年的解法是標籤加註明確限定範圍。2026-09 旁白改第二人稱「你」＋自稱退出特徵格，兩個根因都不在了，`formatTrait` 只剩 `[外貌氣質]`。

🎯 標籤瘦身(2026-07)：舊版第3個標籤把「僅其本人引號內用，非旁白視角」這條【全域規則】寫進欄位標題，於是每位在場者、每回合都重印一次(三人同場印三遍)。規則本身留著、但移到下方【不替玩家腦補】只講一次，標籤回歸單純的欄位名。同 performanceNote_ 那次的「跑時重複」修法。特徵：外貌+氣質併一格(本來就是同一幅畫面)；[私下一面]只在真的獨處時才送——那是她卸下心防才會有的樣子，旁邊還有別人的回合送了也用不到。

### `actionPlay_`　<sub>Gallery.gs:2330</sub>

🎯 2026-07 玩家「『私下對可愛小物多看兩眼還故作矜持』這個就是萌點就好，不一定要反差」：第4格[私下一面]與[萌點]本來就是同一種功能(她那份惹人喜歡的隱藏面)，種子資料裡的萌點還早就寫成反差句(「食量驚人卻吃相優雅」)——等於同一件事包了兩層、各寫一遍。改成第4格併進萌點當同一批素材送出，不再自成一欄，也就不必各自再套一次反差框架。

### `actionPlay_`　<sub>Gallery.gs:2364</sub>

🕐 2026-07 六度改版·時段限定地點門檻：跟上面私人住處同一套「擋在移動前、當作沒真的進去」寫法。有pending約定要去這裡的話豁免(赴約優先於門檻，理由同上方kanshouLocHasPendingPromise_註解——約定成立時已檢查過時段相容，赴約當下不該又被同一個門檻擋，見promiseMeet處理)。

### `actionPlay_`　<sub>Gallery.gs:2407</sub>

🌙 夜未眠：這一刻是否已在「深夜獨處」段落中(見 KANSHOU_NIGHT_SCENE_TAG_)。不是一次性旗標，要撐過好幾個回合，所以只讀不清——清除在下方三個出口：真的睡、換地點、換日自然失效。★讀 pcData[pcIndex] 而非 pc：夜襲命中時會在上面就地蓋上這個標記，讀 pc 的舊值會漏掉。

### `actionPlay_`　<sub>Gallery.gs:2419</sub>

📸 回合【開始時】就跟玩家同地的人（名字快照）。必須在這裡拍——之後 endDay/移動/夜訪都會改 LOC，等到那些跑完再問「她在不在身邊」就已經是被打散後的狀態了。目前唯一消費端：爽約判定(_standUp)——「她整天陪著你」不該算被放鴿子，而 endDay 的結算發生在遣散【之後】，好感<80 的人那時早就被送回自己家了，光看當下位置會誤判。

### `actionPlay_`　<sub>Gallery.gs:2427</sub>

🚪 深夜訪客擲骰：必須排在【最前面】——它會取消本回合的 endDay，而 _reHourAfter(情境時段)與kanshouTimeJumped_(在場來由)都讀 endDay，晚一步算就會拿到「已經睡到清晨6點」的錯值。命中不早退、不回傳待決泡泡：記進 _knockGuestReq_ 交給下方既有的接人流程(設LOC/組意圖/別有用心判定)，讓她真的走進來——單一真實來源，兩條路徑不各寫一份。⚠ 刻意用內部變數而非 userData 欄位：這條路徑不檢查好感門檻(門檻在上面的 knockPool 就篩過了)，若留成 client 可傳的參數，等於開一條「任意把同伴傳送到身邊」的後門。輸入當不可信。

### `actionPlay_`　<sub>Gallery.gs:2445</sub>

🌙 2026-07 玩家「夜襲改簡單點？她直接進來，留下就留下可以繼續聊，拒絕就請她自己回家睡；不拒絕、直接對話就是要她留下的意思」——夜襲本來就發生在你正要睡的時候，那一刻就是深夜。所以命中當下直接進【夜未眠】，不必再多按一顆「讓她留下」：玩家繼續打字＝這一夜繼續，泡泡只剩「請她回去」一顆逃生口。時間同步推到就寢時刻，判準與 endDay 敘事時鐘同一條——順帶修掉「早上八點按結束一天卻跳出深夜訪客」這個既有的違和。

### `actionPlay_`　<sub>Gallery.gs:2457</sub>

⏳ 這回合是否發生「時間跳躍」——單一真實來源。必須算在敲門擲骰【之後】(敲門會取消 endDay)。對敘事的意義：時間一跳，全世界重骰行程(kanshouRollDailyLocation_)，此刻同地的人並不是「剛才一直跟你在一起」，而是「時間流轉後恰好在這裡」——在場來由判定要靠它，見 pPresenceStr。

### `actionPlay_`　<sub>Gallery.gs:2462</sub>

📅 相約(玩家在同伴卡點「相約」→前端帶promiseMeet{name,loc})：只能跟「此刻在場」的同伴約、地點限公開清單(不含玩家私室)；成立→她列MEMORY蓋【約定】明日:地點(新約蓋舊約)，約定日她的行程骰被釘在該地點(見kanshouPromisePin_呼叫端)，赴約/爽約每回合結算(見下方【依約相會】)。

📅🤝 待玩家提議、需她回應的相約/牽手：不在此刻落地狀態，先記下待判定，交由AI依個性與好感決定接不接受(proposal_accept)，回應後(見下方post-AI區)才真正寫MEMORY——貫徹「意圖非結果」，避免低好感/矜持角色被系統強制答應(舊做法在按下當回合就寫死tag、提示詞還逼AI演成功)。

### `actionPlay_`　<sub>Gallery.gs:2469</sub>

🎯 本回合「GAS 已經裁定完、AI 不能再改」的那個結果，會接在提示詞【最後一行】的玩家意圖後面。為什麼非放最後一行不可：提示詞收尾是「現在演化玩家動作：『<finalUserMsg>』」，那是離生成點最近的一句話。若它只寫「他開口提了什麼」，模型就照著演一個【還沒有答案】的請求然後停筆——玩家實測：結識明明 100% 成立，AI 卻演成「我鼓起勇氣問…忐忑地觀察她的反應」就沒了，她連一句話都還沒回（玩家：「不是100%成功嗎 幹嘛還要這樣演」「玩家不能是最後說話的 很難接」）。★事實其實寫在二十行以前，只是 recency 贏了。意圖與結果同在最後一行，兩邊才不會打架。留空＝這個動作本來就沒有「對方答不答應」這回事(拍照/開門/鬆手…)，交給收尾鐵律即可。

### `actionPlay_`　<sub>Gallery.gs:2493</sub>

私人住處(visit)未解鎖不可當約定地——約成立後玩家根本進不去(前端灰鎖＋後端擋移動)＝必然爽約陷阱。

🕐 2026-07 六度改版·時段限定地點同理：約的時段若不在該地點開放時段內，赴約當下會被上方【地點未開放】擋在門外，同樣是必然爽約陷阱——約定當下就先擋掉這種不相容組合(前端已只給相容時段選項，這裡是直打API的後端保底，同kanshouResidenceUnlocked_那行的既有寫法)。

🧠→✅ 2026-07 行為級稽核：舊版沒擋「約在你此刻站的這個地方」——兄弟函式 proposeMove 一直有`_pvLoc !== curL` 這條，只有這裡漏了。後果有二：①語意荒謬(「我們約在我們現在站的地方見面」)②可農好感——跟她站在公園、約今天午後在公園、原地打三回合字，時間一到就判準時赴約 +5，而赴約的 +5 是【不吃聊天天花板】的破關獎勵，等於站著不動就能無限推高好感。

### `actionPlay_`　<sub>Gallery.gs:2511</sub>

🕐 2026-07 玩家「約會也想要可以約今天的時間」：前端帶 today=true 且該時段【今天還沒過】才算數。已經過了的時段約下去＝到期必然爽約(-5)，跟未解鎖住處同一類必爽約陷阱，故後端自己再驗一次(前端只給未過時段，這裡是直打 API 的保底)；不合格就默默退回明天，不讓玩家平白吃一次爽約。

### `actionPlay_`　<sub>Gallery.gs:2518</sub>

🐛→✅ 2026-07 逐按鍵稽核：一人只存一個約(kanshouSetPromise_ 新約蓋舊約)，舊版新約成立時舊約【無聲蒸發】——玩家跟她約好黃昏商店街，再約一次夜晚公園，前一個約就這樣不見了，AI 沒被告知、通知條也沒提。她答應時才會真的覆蓋，故只在接受分支帶這句(婉拒＝舊約保留)。

### `actionPlay_`　<sub>Gallery.gs:2542</sub>

🚶👋 玩家提議同去(地圖 👋 鈕→proposeMove=地點)：走跟相約/牽手同一條「確定性提議」管線——pre-AI 記待判定、AI 只需在 proposal_accept 答「接受/婉拒」、接受才出「前往」泡泡(玩家按同意才真的移動)。2026-07 根因修復：舊版 👋 只送一句閒聊、全押在 AI 自發填 move_proposal 上，Gemini 從不自發填→玩家從沒見過移動泡泡；改成明確標記後 AI 只做「答不答應」一件事。

### `actionPlay_`　<sub>Gallery.gs:2548</sub>

🔒 地點判準與 promiseMeet 對齊(同一類「必然撲空陷阱」)：舊版只擋 room 與同地，沒擋未解鎖住處與未開放時段——她答應了、玩家按同意，卻在移動那一步被門檻擋成「登門未果／撲空」，等於系統自己安排了一趟不可能成行的邀約。前端 👋 只長在可去的地點上，這裡是直打 API 的後端保底。

### `actionPlay_`　<sub>Gallery.gs:2556</sub>

提議對象＝此刻在場的【全部】同伴。

🐛→✅ 2026-07 逐按鍵稽核：舊版只 findIndex 取第一位、提示詞也只點名她，但按下「同意」時moveWithCompanion 走的是 kanshouPreMoveCompanions_「帶同地全部人」——三個人在場，AI 只演了櫻答應，凜跟斯卡哈卻無聲跟著移動。單一真實來源：這裡點名誰，那邊就走誰。裁定基準取【好感最低】的那位——最生疏的人不肯，這趟集體外出就不成立(人越多越難成行，合理)。

### `actionPlay_`　<sub>Gallery.gs:2570</sub>

🎲 裁定基準＝在場同伴的【平均】好感。舊版取最低那位，但提議對象是「同地全部人」(見上)，等於把否決權交給剛好路過的陌生人——你跟好感80的她在咖啡廳，來個好感5的路人就掉回五成(玩家：「提議移動的成功機率是多少 太低了吧」)。平均值仍保有「人越多越難成行」的意思，但一個生面孔不再一票否決。

### `actionPlay_`　<sub>Gallery.gs:2584</sub>

🐛→✅ 同輪稽核：人明明在場、只是地點不合適時，舊版【兩個分支都不跑】——沒有★事實、沒有通知條，AI 只收到一句閒聊就自由發揮，玩家按下去像是完全沒反應。比照 promiseMeet 的「約不成」兩種原因分開講(她就在這裡 / 那裡去不成)，別讓玩家去找一個不存在的問題。

### `actionPlay_`　<sub>Gallery.gs:2632</sub>

💗 告白(關係中樞「向她告白」鈕→confess=name)：走跟同居同一條「當場裁定、當場落地」的管線——成敗由 kanshouConfessAccepts_ 依 好感×相處次數 擲定，AI 只演反應、不得改寫結果。這是【戀人】這一階唯一的入口(好感被夾在 79，見 kanshouSyncRelTier_ 的告白牆)。

### `actionPlay_`　<sub>Gallery.gs:2712</sub>

🐛→✅ 2026-07 逐按鍵稽核：牽手 tag 只存一個人，牽著A又去牽B時舊值被【默默覆蓋】——A 就站在旁邊，卻在下一回合起憑空變成沒牽手，AI 從沒被告知你鬆了她的手。只在【她答應】時才是真的換手(婉拒＝你的手收回來、原本那隻手沒放開)，故字串併在下面接受分支。

### `actionPlay_`　<sub>Gallery.gs:2717</sub>

牽手tag存在玩家自己列(pcIndex)、值=她的名字；接受與否由AI判定，接受後才在post-AI區寫回。

herIdx：牽手 tag 寫在玩家列(idx)，但「第一次牽手」這筆帳要記在【她】那一列，故一併帶著她的列索引過去，post-AI 接受分支才不必再查一次人。

### `actionPlay_`　<sub>Gallery.gs:2728</sub>

🤝 不同地自動放手(不變量·玩家實測「她跑掉了卻還牽著、重逢自動續牽、移動硬拖人」)：牽手是「此刻牽著」的狀態——她因任何原因(作息/離場/舊版bug殘留)已不在你身邊，就自然鬆開。也順手清掉歷史遺留的殭屍牽手標記(舊版時間快轉把人骰走但標記沒清的存檔)。

### `actionPlay_`　<sub>Gallery.gs:2739</sub>

🐛→✅ 八度改版稽核抓到：夜襲/賴床叫醒新觸發點「玩家自己房間」＋pSleepStr的睡眠提示，都只看LOC×時刻，沒排除「她是這回合跟玩家一起走進來的(牽手/同意同去)」——牽著手走進房間的人明顯還醒著、正跟玩家互動，不該被判定成已經熟睡。跟kanshouPreMoveCompanions_同一套「帶人三態」判準(那個變數宣告在後面、此刻用不到)，這裡先算一次同名邏輯的姓名集合供本節共用。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2747</sub>

🐛→✅ 玩家實測連兩次抓到：只認「這回合牽手/剛到」太短命——放開手的瞬間、或離開又走回來的下一回合，這兩個條件雙雙落空，她就會被誤判成剛好躺在自己家/和室裡熟睡，即使敘事明明還在演她清醒對話。改成用KANSHOU_AWAKE_HERE_TAG_記住「她在這個地點是醒著的」，只要地點沒變就持續生效(自我修復：這回合判定醒著就更新標記地點；地點對不上了就自動清掉，不必額外收尾)。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2766</sub>

🤝 結識(巧遇→入駐)：巧遇對象只是路人(不記好感·離開即散)，玩家點「結識」(inviteResident=name)才正式建列入駐——驗證對象必須真的是【邂逅中】的那位(防直打API憑空加人)、且尚未入駐。入駐後她從此活在這座城裡(有行程/好感/可堵可約)，本回合就地拿到完整在場卡片。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2784</sub>

🐛→✅ 稽核抓到：這裡原本【當場】appendRow，是 AI 呼叫前唯一的直接寫表。但 aiData._genFailed會早退、跳過後面所有寫回——結果是「她已經是同伴列，玩家列的路人例外標記卻沒清掉」的半套狀態(下一回合她同時是路人又是在場人物)。改成延後到寫回階段才落盤，讓結識跟這回合其餘異動一樣是【全有或全無】：AI 失敗＝整回合 no-op，什麼都沒發生。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2799</sub>

🎭 情境氛圍(2026-07 玩家「橋段太過生硬」根治改版)：舊版是「跳按鈕→玩家點→GAS骰走向→AI照劇本演」的四段式 apparatus，選單感重、且同好感區間每次演出雷同(branches[].tag 是寫死的劇本)。現版本只做一件事：判斷此地此刻有沒有值得一提的情境，有就把【客觀事實】寫進提示詞，其餘全部交給玩家自己打字互動(鑑賞本來就有聊天框，玩家想怎麼玩都可以)。三層觸發判定(節慶 > 地點×時段 > 同居日常)保留——那部分邏輯是對的，只是輸出換掉了。🛏️ 睡眠層(夜襲/賴床叫醒)已整組移除：她睡著這件事本來就由 pSleepStr 每回合當既定事實餵給AI(判準完全相同)，再包一層按鈕只是把自然的處境變成一張要點的卡。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2821</sub>

🎊 節慶【已移出這條優先鏈】：改走下方獨立的 kanshouFestivalStr。理由有二——①不限時段之後節慶優先序最高，會整天壓掉膝枕/共浴/下廚/同居所有地點 ambient；②完成判定需要「移動後的地點＋移動後的在場名單」，那些要等 partyRows 算完才有。

### `_kanshouBigBeat_`　<sub>Gallery.gs · 篇幅「大事」旗標串</sub>

節慶刻意不在這串。舊版節慶三態有「完成當下」那一幕，`kanshouFestivalStr` 會帶「就是此刻」四個字，
旗標串用 `/就是此刻/.test(kanshouFestivalStr)` 抓它。2026-09 砍節慶三態（節日只剩「今天是 X」事實）時
這個 regex 漏拿，變成永遠比對不到的死旗標——文件說節慶會拉篇幅、代碼做不到。
稽核抓到後選擇拿掉 regex 而不是改成「節慶當天整天都算大事」：日子是世界事實，不是一幕戲，
整天 700~900 字只會讓平常的閒聊變長。真要讓節慶當天有一幕大戲，該由 AI 的即興決定，不是篇幅表。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2863</sub>

🌙 2026-07 玩家「能不能也設計一個被夜襲的橋段呢」——夜襲的鏡像版：不是玩家去找她，是她主動來敲玩家的門。好感夠高(沿用KANSHOU_KNOCK_MIN_BOND_=60，跟夜襲類「趕人/繼續」切點同一個數字)時，這次來訪有機會別有用心，共用同一套kanshouAsleepOutcomeStr_分寸判準，同樣走KANSHOU_SCENE_DAY_TAG_擋同一天重複加分——不是每次深夜來訪都這樣，才有驚喜感。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2880</sub>

結束一天：忽略玩家打的文字，改用系統組好的合成訊息——複用actionPlay整條既有敘事管線(在場驗證/NSFW規則/rel_changes/intimacy_feedback全部照常跑)，不另開一條平行路徑。不在身邊的英靈：GAS直接幫她們決定隔天去哪(kanshouRollDailyLocation_)，玩家不用手動指派。

只有結束一天(真的要過夜)才判定好感≥80能否同行睡覺，推進時間不觸發(那不是「睡下去」的動作)。門檻由GAS算好，AI只負責依角色性格自然演繹要不要跨出這一步。

🚪 送走夜訪客(前端「請她回去」)：必須排在 endDay【之前】——endDay 的 intimateNightNames 是「好感≥80 且此刻與玩家同地」，她剛被落盤到 curL、好感又通常夠高，晚一步送就會被留下過夜，「請她回去」等於毫無作用。姓名只從玩家列的 tag 讀，不吃 client 傳的名字(同 _knockGuestReq_)。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2909</sub>

🌙 昨夜道別(2026-07 玩家實測「好感沒80，牽手睡覺 NPC 會自己回家？我醒來都沒有自言自語？」)：endDay 會把未達 80 的同伴依行程骰散走，但整段提示詞【一個字都沒交代她】——AI 只看到玩家獨自回房，於是她就地人間蒸發，正好違反本檔自己的【在場驗證】「禁不解釋就消失」。跨時段那條路早有【自然告辭·作息】(kanshouNpcLeaveStr_)在做這件事，endDay 只是沒接上。照同一個慣例補：離場前最後一次讓她開口道別；牽著的手也要演出鬆開，不能默默斷線。

🕰️ 敘事時鐘：預設等同狀態時鐘，只有「結束一天」會讓兩者分家(見下方 endDay 區塊的說明)。組 🕰️ 那行提示詞時一律讀這兩顆，不要再直接讀 curDay/curHour。

### `relMemMemoryStr_`　<sub>Gallery.gs:2915</sub>

🐛→✅ 玩家「色色時也不用隱晦」：拍到親密畫面時，photo_caption 也該照實寫、不必刻意淡化。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2919</sub>

🌙 兩段式就寢·第一段：按下「睡覺」時若身邊有羈絆已深(≥80)的人、且還沒進過深夜段落 →【不結束這一天】，改成把時間推到就寢時刻、進入「夜未眠」。玩家可以無限回合推進這一夜，滿意了再按一次(此時 kanshouNightSceneOn_ 已成立，直接落到下面真正的 endDay)。★兩條路共用這個入口：20% 擲中夜襲後按「讓她留下」送的也是 endDay:true，自然也走進來，不必為夜襲另寫一條平行路徑(玩家定案「兩條路一致」——否則變成被夜襲才有完整夜戲、自己的戀人反而沒有)。⚠ 門檻用 KANSHOU_KNOCK_MIN_BOND_(60·親近的人) 而不是同床的 80：夜襲的招募池本來就是 ≥60，寫 80 的話 70 好感的訪客敲門進來、玩家按「讓她留下」還是會一口氣跳到早上(實測抓到)。兩個數字必須同源。60~79 能演到哪仍由【親密尺度五階】把關，這裡只決定「要不要切這一段」。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2946</sub>

🛏️ 結束一天＝睡到「即將到來的清晨6點」：凌晨(深夜0~5點)睡下→【同一天】的6點——跨日已在「夜→深夜(00:00)」那一步發生過了；晚上睡下才是隔天6點。修玩家實測「一晚被收兩天」(夜→深夜已+1天、結束一天又+1天)。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2950</sub>

🕰️→✅ 2026-07 玩家「那我按睡到天亮會有甚麼事情.....」：狀態必須推進到隔天 6:00(眾人重骰行程/日閘門全部依賴它)，但【這一回合要演的是睡下去的那個當下】。舊版直接用推進後的時鐘組提示詞，於是同一份提示詞同時說「現在06:00清晨，★此刻＝清晨·唯一真實，光線作息一律依此刻重寫」跟「夜幕降臨、回到房間安頓下來、今晚可自然發展到同床」，還限定敘事跨度十分鐘——三者互斥，而且「唯一真實」那句明文叫 AI 覆寫掉夜晚的框架，結果就是演出一段不知所云的清晨空景。分成兩個時鐘：狀態時鐘照推，敘事時鐘停在睡下去那一刻，晨間留給下一回合(【晨間餘韻】本來就是那樣設計的)。只在 endDay 這條路有差，其餘回合兩者相同。

🌙 夜未眠的出口①：這次是真的睡了，清掉狀態(不清的話隔天同一個 absDay 值也不成立，但清掉才不會在存檔裡留下誤導人的殘值)。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2961</sub>

敘事時刻＝「就寢的那一刻」，不是按下按鈕的那一刻。玩家可能在早上八點就按結束一天(語意是「今天剩下的就這樣過去，然後睡」)，此時照抄 08:10 會跟玩家意圖那句「夜幕降臨」再打一次架——換成當日最後一小時。已經在夜/深夜按的就照用，那本來就是就寢時刻。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2989</sub>

🌙 誰在你身邊、卻不留下過夜——用回合開始時的同地快照(kanshouWithMeAtStart_)扣掉留宿名單，而不是重新掃 LOC：這一行以上 intimateNightNames 已算完但人還沒被骰走，只有那份快照能回答「她剛才確實在你旁邊」。牽著的那位另外點名，鬆手要演出來。

### `relMemMemoryStr_`　<sub>Gallery.gs:2994</sub>

🐛→✅ 八度改版：牽手/剛同意同去而跟玩家一起走進來的同伴顯然還醒著，不該說她在熟睡。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2998</sub>

🤝 睡覺自然放手：牽手不跨夜(同床是同床、不是牽著手到天亮)，結束一天一律鬆開，避免隔天還掛著昨天的牽手標記。★必須排在上面的道別字串【之後】——那句要讀 kanshouHeldName_才知道該不該演鬆手，先清掉就永遠演不到。

### `relMemMemoryStr_`　<sub>Gallery.gs:2998</sub>

🐛→✅ 八度改版：跟夜襲/賴床叫醒觸發判準對齊——0~8點(非timeBand_的深夜/清晨切法，清晨band原本延伸到11點)、地點涵蓋她自己家/和室/玩家自己房間(留宿或深夜訪客過來時可能在這裡)。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:3033</sub>

🐛→✅ 稽核抓到：【邂逅中】(巧遇路人，非正式在場人物)只在「結識/結束一天/移動離開」三處清除，跳時段/跳節慶/等待赴約的advanceHours都漏了——這條「跳到時段/節慶」分支明明就緊接著要對所有正式同伴重骰去向、還特地加了「換幕鐵律」提醒AI別讓已離場的人憑空留著，卻獨漏這個路人旗標，導致同一位從沒正式在場過的路人能在玩家連續跳時段/跳節慶(可長達數月)後依然被當成「還在這裡」重新提供邂逅——比同伴還誇張的憑空滯留。跳時段/節慶本就是「這次到訪已經結束」的性質，比照移動離開同一標準清除。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:3040</sub>

⏩ 這是玩家【主動按鈕跳時段/節慶】的刻意時間快轉——跟「每回合被動+0.5h流動」(§122，那條根本不重骰任何人)不同：玩家選擇快轉數小時，不在身邊的人依新時刻重骰去向，讓世界動起來。

🐛→✅ 玩家實測抓到：原本只有「牽手中」才排除，但正跟玩家同地點聊天、卻沒特地牽手的同伴，一按跳時段就憑空消失、對話對象平白蒸發，體感是bug而非「她去過自己的生活了」。改成只要此刻跟玩家同地點就一律不重骰(牽手只是同地點的其中一種情況，本就涵蓋在內)——真正「不在身邊」的人才依新時刻重骰，在場的人不會被時段跳躍憑空傳走。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:3065</sub>

⏰ 時間隨動作流動：一般 AI 敘事回合(非結束一天/非時段跳躍)每次推進 KANSHOU_HOUR_PER_ACTION_ 小時，讓聊天/移動/拍照/橋段等按鍵都會讓時鐘往前走，消除「到處跑卻永遠6點」的凍結感。夾在當日23:00不跨日——跨午夜(睡覺)由「結束一天」儀式負責(回家/同床/晨間餘韻/隔天6點重置)，不讓時間偷偷滾過午夜。只動時鐘、不重骰不在場同伴的位置(那由結束一天/時段跳躍負責)，免得每句對話有人被傳送走。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:3082</sub>

🎨 2026-07「為何偶遇沒有女性」玩家反映：此局已經正式召喚過的英靈(不論是否仍同行)不該又以「陌生人」身分重複出現(如SABER已同行時，路上不該再巧遇一位不具名的SABER)。用真名候選比對(kanshouNameCandidates_，容忍括號附註差異)反查對應的SEED_SERVANTS id 清單餵給抽選函式排除。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:3091</sub>

合法地點時才寫入LOC＋抽選巧遇＋記錄邂逅名單。抽選只在「按下移動按鈕」這個瞬間跑一次，不會每句對話重算。移動不再強制拖走任何已存在的英靈(每個人都是獨立的)——想帶誰同行：地圖 👋提議同去(proposeMove 確定性提議管線，見上方★【提議·同去】)或牽手跟隨。

🐛→✅ 例外：玩家按下的是「同意」(接受了自己提議的同去、GAS裁定她答應，userData.moveWithCompanion)時，UI已經明確告訴玩家「好，一起去」，若不真的把受邀者也帶過去，她會被留在舊地點、卻在敘事跟人物列表裡憑空消失——這裡先在curL變動【前】記下當時同地點的人，帶她們一起走。⚡ 帶人三態：①同意同去邀約(moveWithCompanion)→帶當時同地全部人；②否則有牽手對象且她此刻同地→只帶她(牽手優先跟隨)；③否則只帶自己。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:3137</sub>

前端明確的「看看四周」按鈕(lookAround:true)。目前還沒有巧遇中的對象時，用目前地點重新擲一次巧遇——跟按移動按鈕同一套加權隨機，不寫LOC(沒有移動)。noEncounter地點(家)恆不觸發此路徑。

🐛→✅ 稽核抓到：移動分支(2585行)有檢查!kanshouSomeoneAlreadyHere_(已有熟人在場就不擲陌生人巧遇)，這裡漏了同一條件，導致跟熟人對話中按「看看四周」仍可能擲出陌生人、兩者同框，牴觸移動分支自己訂的「熟人在場優先」規則。

### `relMemMemoryStr_`　<sub>Gallery.gs:3167</sub>

態度：NPC對御主當下的臨場態度(與好感分開追蹤，見慾海律令第5條)，讓AI下筆前看得到自己上一輪演的態度，不會忽冷忽熱亂跳。

🗑 2026-07 拿掉「態度」：它宣稱是「當下的臨場態度」，實作卻是**永久狀態**——AI 依差分模式留白時沿用舊值，而提示詞又把舊值餵回去讓 AI 照著演，於是「沒有轉變可報→留白→沿用」成了自我強化迴圈。實測：第 1 回合寫進「警戒又帶點好奇」，29 回合後、好感從 60 拉到 95，一個字沒變。它還是**形容詞標籤**（違反 CLAUDE.md「給事實不給形容詞標籤」），且會跟好感階打架（卡片同時寫著「戀人·好感95」與「態度：警戒」，小模型面對矛盾的處理不可預測）。防忽冷忽熱這個原職責由**歷史視窗**接手：AI 看得到自己前 3 輪的完整敘事，資訊量遠大於15 字標籤，而且會隨劇情自然推移、不會鎖死。⚠ 2026-07 後續：schema 的 attitude 欄位已【整個移除】——它當初留著的唯一理由是紅線 nsfwBaseRules 第 5 條指名了它；玩家授權整合兩份規則後那句也不在了，欄位跟著走。

### `relMemMemoryStr_`　<sub>Gallery.gs:3181</sub>

🚶‍♀️ 作息自然告辭(玩家實測「NPC 不會自己離開?」)：npc_exit 靠 AI 自發填＝Gemini 從不填(同move_proposal 教訓)，作息重骰又只在結束一天/跳時段——一般聊天流程裡在場者永不離場。改成確定性：被動時間流動【跨過時段邊界】時(一天約4次)，同地 NPC 依作息重骰去向；有「留下理由」的不走(牽手中/這回合剛跟你一起走來/今天約在這裡等你)。要走的注入告辭提示讓 AI 演出道別。

### `relMemMemoryStr_`　<sub>Gallery.gs:3194</sub>

玩家本回合正對她提議(相約/牽手/同去·_pendingProposal)——她留下聽完回應：否則被動+10分恰跨時段時，AI 同回合收到「向她提議」＋「她已告辭」兩條矛盾指令，接受還會把牽手/同去落到已離場的人身上。★ names(同去是群體提議·見上方 proposeMove)優先，否則退回單人 name/idx。

### `relMemMemoryStr_`　<sub>Gallery.gs:3211</sub>

📅 赴約/爽約結算 2.0(時間×地點驅動)：【必須在 partyRows 之前】——命中赴約會把她 pin 到 curL 讓她登場，這一步要先於在場名單計算，AI 才拿得到「她來了」的在場卡(否則純聊天/拍照這種不重骰位置的路徑，partyRows 會在她被拉來之前就定案、AI 完全不知道她到了)。準時窗[時刻-10,時刻+30]赴約+5(早到→「都早到」味道)／窗後~當天結束遲到+3／太早(她還沒到)回 kanshouPromiseWait_ 給前端「等到約定前10分」框／日期已過爽約-5。舊格式無時段(ah=null)沿用「當天到場即赴約」。同回合剛成立的約(day=明天)不會自我觸發。

### `relMemMemoryStr_`　<sub>Gallery.gs:3219</sub>

📣 赴約/爽約結算回饋走【獨立通道】(promiseSettle)，不再借用 kanshouProposalResult_ 單槽——同回合「結算＋另一個提議被接受」時 post-AI 的提議結果會無條件覆寫單槽(稽核三路都撞到)，結算通知被吞、前端也漏掉重抓 _kcCur 的觸發。兩事件本就獨立，各走各的通知條。

🐛→✅ 玩家實測前主動抓到：這裡本身也是單槽——若玩家同時跟兩位同伴各有一筆待結算的約(如A今天赴約成功、B的舊約同時判定爽約)，這個 forEach 跑兩輪，後跑的那筆會無條件覆寫前一筆，前一筆的通知條就這樣消失(底層BOND/MEMORY寫入不受影響，只有這條UI通知被吞)。改成陣列，兩筆都保留。

### `relMemMemoryStr_`　<sub>Gallery.gs:3247</sub>

🐛→✅ 稽核抓到：「遲到」分支(見下方)原本沒有上限——KANSHOU_APPT_BANDS_註解明講設計是「準時窗後~2h算遲到、之後爽約」，但程式碼只要當天結束前(23點)人到場一律判遲到+3，放鴿子懲罰在同一天內形同虛設。抽出跟跨日爽約共用的closure，遲到超過2小時比照跨日同一套判定(-5好感/寫進memoir/獨立結算通知)，不重複兩份邏輯。

### `relMemMemoryStr_`　<sub>Gallery.gs:3252</sub>

🧠→✅ 人類邏輯稽核抓到：「她整晚睡在你旁邊，系統卻記下我讓她空等了一場」。情境＝約定日你沒去約定地點，卻一整天跟她在一起(牽手/同去/同床)，結束一天後日期一過就判爽約 -5、還把「我爽約了」寫進共同回憶。放鴿子的定義是【她等不到你】，人明明就在你身邊時這個定義不成立。此時只默默取消約定、不扣好感、不寫回憶，並給 AI 一句中性事實讓她可以自然提一句「那個約就算了吧」。⚠ 不給 +5：約沒真的赴，不該有赴約的獎勵。

判準＝「此刻仍同地」或「這回合一開始就跟你在一起」。後者不可省：結算跑在 endDay 遣散【之後】，好感<80 的人那時早已被送回自己家，只看當下位置會把「牽手陪了你一整天」誤判成放鴿子(玩家追問「一整天都陪他，但是系統判定失敗?」抓到的第二半)。

🙋 她單方面開口的邀約(byHer)：玩家從沒答應過，沒去當然不算放鴿子——只默默取消，不扣分、不寫「我爽約了」的共同回憶。跟下面「人就在你身邊」是同一種豁免，共用同一個出口。

### `relMemMemoryStr_`　<sub>Gallery.gs:3267</sub>

🐛→✅ 2026-07 提示詞矛盾掃描抓到：這句原本【當場就寫死】，但豁免條件之一是「這回合一開始跟你在一起」——按下結束一天時，遣散跑在結算【之前】，她很可能在組提示詞時早就被送回家了；另一個條件 byHer(她單方面約的)更是完全不看她在不在場。結果就是叫 AI 跟一個不在場的人相視一笑，跟【在場驗證鐵律】直接打架。跟【晨間餘韻】同一套解法：先記名字，等 partyMembers算出來之後再依「此刻真的在場」過濾成句；沒人在場就整句不送(這條本來就是零數值變動的純演出提示，沒人可演時安靜才是對的)。

### `relMemMemoryStr_`　<sub>Gallery.gs:3271</sub>

🐛→✅ 牽手(hold)的 idx 是【玩家自己列】(標記存玩家MEMORY)，拿 idx 的名字會變成玩家自己(「風音沒有讓你牽手」)——她的名字存在 _pendingProposal.name，優先用它。

### `relMemMemoryStr_`　<sub>Gallery.gs:3281</sub>

⚠ 走到這裡＝她【不在】你身邊(在場的已在上面提早 return)。敘述留給下次遇到她時演——這回合她不在場，照【在場驗證鐵律】本來就不能讓她開口。

📣 爽約明確回饋(玩家實測「約定標示無聲消失、以為是bug」)：她不在場時結算完全無聲——補通知條讓玩家知道約過期了、好感掉了。

### `relMemMemoryStr_`　<sub>Gallery.gs:3286</sub>

💔 她要「記得」被放鴿子(玩家實測：系統扣了好感、她卻渾然不知還演「我照約來了」)：爽約寫進共同回憶(用第二人稱稱玩家·比照 memoir 鐵則)，之後每回合經 partyDetailsArr 餵給 AI，她才演得出在意/彆扭，也給玩家道歉挽回的戲肉。cap 交給下次 processMemoir_ 自然淘汰。

### `relMemMemoryStr_`　<sub>Gallery.gs:3295</sub>

🚶‍♀️→✅ 2026-07 玩家「沒有根絕方式嗎…感覺可以讓她時間快到的時候出現在約會地點」：根因是「同地點的人永遠不會被重骰」，所以她可以被牽著走一整天、直接錯過自己的約。改成【她自己會走】：進入該動身的窗口、她此刻跟你在一起、而你不在約定地點時，她先走一步。比「讓她消失」更貼近人的行為，也給玩家明確信號(而不是人憑空不見)；此後沒赴約就是真的讓她一個人在那裡等——爽約回歸它原本的意思。

### `relMemMemoryStr_`　<sub>Gallery.gs:3317</sub>

📌 今天有約、你還沒到那裡——記一筆待辦。2026-07 玩家實測抓到：這條路徑本來是純 return，於是「昨天約好的事」在赴約日整天【零提示】——她通常不在你身邊(她的卡片才有 pPromiseStr)、前端 people 只帶 {id,name}、promiseWait 又只在你【已經站到約定地點】時才回傳，等於「你已經記得了才提醒你」。玩家忘記→吃 -5 爽約，卻從頭到尾沒被告知過。跟節慶待辦同一種設計：GAS 自己看得到的客觀事實，不開按鈕、不問 AI。

### `relMemMemoryStr_`　<sub>Gallery.gs:3344</sub>

⚠ 位置關鍵：這一段【必須排在 partyRows 之前】。「她自己找來了」會把她的 LOC 搬到你這裡，而 partyRows(在場名單／人物卡)是照 LOC 篩出來的——排在後面的話，AI 會同時收到「她剛剛出現在這裡」跟「只有【在場人物】可以開口」，而她沒有卡片，兩條指令直接打架(2026-07 提示詞矛盾掃描實測到)。三種事件需要的「誰此刻在你面前」是自己從 pcData 的 LOC 算的(_hereRows)，不依賴 partyRows 這個變數，所以往前搬是安全的。

🙋 她主動：擲骰→直接落地成既成事實→下面組提示詞。全域每日一次、無泡泡、不看玩家打了什麼。排在 partyRows 之後：三種事件都要知道「誰此刻在你面前」。

### `relMemMemoryStr_`　<sub>Gallery.gs:3385</sub>

📐 三型等權(2026-07 實跑調校)：初版給 want 加倍權重，結果邀約變成 20 天才一次——因為邀約本來就還要再過「她自己名下沒有未赴的約」這道閘，兩層壓抑疊起來太稀有。等權之後約每 9 天一次她會開口約你，而「已有約就降速」那道節流仍在，不會約滿場。

### `relMemMemoryStr_`　<sub>Gallery.gs:3393</sub>

🩹 這欄要的是【穿著本身】(如「質地優雅的絲綢襯衫」)，AI 偶爾寫成動作句(「換上了一件…。」)，卡片顯示「裝扮 換上了一件…」變病句(玩家實測)——剝掉動作前綴/量詞/句尾標點，留衣物描述。

### `relMemMemoryStr_`　<sub>Gallery.gs:3419</sub>

📣 這是【真的寫進她那一列的約定】(地圖📅徽章、睡前爽約警示都讀它)，但舊版一個訊號都沒回傳，前端的約定快取 _kcCur 只在「玩家自己約成」或「結算」時才刷新——於是她開口約的這一場，玩家在地圖上完全看不到，也不會被睡前警示提醒。走既有 promiseSettle 通道補一筆。

### `relMemMemoryStr_`　<sub>Gallery.gs:3432</sub>

「開放世界·背景人煙」設計：路人可自由描寫增添生活感，但不具名、不追蹤好感、不能被指名互動；真正能被指名、好感會被記錄的對象只有【在場人物】，判準是「LOC是否跟玩家目前位置一致」，不看IS_PARTY。

同地點最多給KANSHOU_PARTY_DETAIL_CAP_位詳細卡片(敘事複雜度/prompt篇幅上限，不是隊伍容量)，依好感高低取前幾位；超過上限的人依然存在、依然可被特定劇情點名，只是這回合沒有詳細卡。

### `relMemMemoryStr_`　<sub>Gallery.gs:3440</sub>

🎊 節慶三態(2026-07 玩家「想要一個類似任務重點…沒去做的話 AI 可以很委婉地提醒，做過就完成不要再出現」)。刻意【不加按鈕、不問 AI】——完成與否是 GAS 自己看得到的事實：玩家人在 doneLoc 之一 ＋ 身邊有同伴 ＝ 這件習俗一起做過了。算在這裡而不是上面的 ambient 區：要用移動【後】的 curL 與 partyMembers，不然「這回合走進神社」不會算數。三態各給不同長度，完成後只剩一句短餘韻——這也是「不限時段」之後避免同一句整天每回合重印的解法。

### `relMemMemoryStr_`　<sub>Gallery.gs:3466</sub>

🐛→✅ 同上方 rel_changes 的漏洞：從沒檢查這個人是否真的在場，AI幻覺/歷史殘留提到的不在場人物一樣能被寫入外顯/技巧/共同回憶——比照補上同一道在場檢查。

### `relMemMemoryStr_`　<sub>Gallery.gs:3484</sub>

🌍 世界概況(輕量版·2026-07 玩家「NPC不知道彼此存在」)：只給名字＋大分區，不給精確地點/在幹嘛，純粹讓AI知道「這局還認識誰、大概在哪」以便自然閒聊提及——不是在場資料，不影響【在場驗證鐵律】(指名互動/追蹤好感仍只認同地點的partyRows)。依好感取前KANSHOU_WORLD_ROSTER_CAP_位，避免同伴一多每回合就無限膨脹。

### `relMemMemoryStr_`　<sub>Gallery.gs:3492</sub>

🎯 觸發收緊(2026-07 玩家「條件式區塊的觸發條件收緊」)：這段【唯一用途】是讓 AI 能正確回答「認不認識某某」，但它原本每回合都送(只要有人不在場就成立＝幾乎永遠)，等於絕大多數回合都在燒 200+字 講一件玩家沒問的事。改成只在玩家這句話真的可能問到「不在場的人」時才送：①句中出現名單上任一人的名字(含大小寫變體) ②句中有詢問人的關鍵詞。兩者皆無就整段省略。

### `relMemMemoryStr_`　<sub>Gallery.gs:3503</sub>

🐛→✅ 玩家實測抓到「還是大小寫問題」：名單存的是固定寫法(如「SABER」全大寫)，玩家聊天打「saber」小寫，小模型照字面比對名單就會判定「沒出現在名單裡」而答不認識。比照kanshouNameCandidates_ 既有的大小寫寬容手法，把英文名的另外兩種大小寫變體直接列在名字後面，不靠AI自己做大小寫正規化推理。

### `relMemMemoryStr_`　<sub>Gallery.gs:3513</sub>

🐛→✅ 玩家實測抓到：舊措辭只講「可以自然提一下」，語氣太弱、太像選擇性彩蛋——小模型被玩家直接問「你認不認識/聽過某某」時，仍然會答「沒聽過」，完全沒把這份名單當成真的認識過。改成明確規則：名單上的名字＝你確實認識、可以直接肯定回答；不在名單上才是真的沒聽過。

### `relMemMemoryStr_`　<sub>Gallery.gs:3518</sub>

📅 初見日戳＋相識紀念日：同地即相識——沒戳過的在場同伴當下蓋【初見日】(冪等，之後只讀不改)；已有戳的算相識天數，命中里程碑(7/30/100/365天)就收進紀念日提示(當天內重複對話會重複提及，跟節慶氛圍同一種「全天有效的氛圍線」設計，AI自然不會每句都講)。

💞 獨處時光(2026-07「橋段太過生硬」改版·接手原橋段 +3 的破天花板職責)：舊版靠「走進特定房間×點按鈕」拿 KANSHOU_SCENE_BOND_，泡泡拆掉後這條路也跟著沒了——但【破天花板】這個機制本身要留下(原始用意：好感天花板防的是「一天刷滿」，總得有一條真實相處才走得通的路)。改綁 GAS 完全可驗證、且天然一天一次的條件：**與她單獨在私密場合**(noEncounter 地點＝家中各處/她的住處/我的房間)＋好感已爬到聊天自己搆得到的最高點＋當日尚未給過(沿用KANSHOU_SCENE_DAY_TAG_ 同一個日閘門)。不需按鈕、不靠 AI 判斷。🐛→✅ 門檻改用 kanshouRelChatCeiling_(0)(＝39·聊天封頂那一格)，不再用 KANSHOU_VISIT_BOND_(40)：兩者原本共用 40 這個數字，但聊天封頂在【門檻-1】(kanshouRelChatCeiling_ 回傳 t-1)，於是39 的人聊天爬不動、獨處又差一點用不了、夜襲還要 60——39→40 這一步變成【只有約定赴約一條路】走得通(2026-07 玩家實測跑 30 回合純聊天原地不動)。舊註解宣稱「這道門檻不會卡住任何該通的路」正是漏算了 39→40 這道，而那恰好就是門檻自己站的位置。改成直接讀天花板本身，兩個數字從此不可能再各走各的；日後 KANSHOU_REL_TIER_ 的門檻怎麼調，這裡都自動對齊。🐛→✅ 2026-07 模擬實跑抓到刷分：日閘門假設「過一天要有成本」，但「跳時段」跨過午夜就換日，而跳時段【只重骰不在身邊的人】——跟她待在我的房間裡連按跳時段，她不會被骰走，於是一次點擊換 +3，40→100 只要 20 下(跟先前修掉的 promiseMeet +5 農場同一類)。加 !kanshouTimeJumped_ 擋掉。這個條件本身也比較貼近語意：獨處時光給的是「陪著她過了一段時間」，而時間一跳，此刻同地的人按本檔既有定義就不是「剛才一直跟你在一起」而是「時間流轉後恰好在這裡」(見 pPresenceStr)。

### `relMemMemoryStr_`　<sub>Gallery.gs:3552</sub>

🩹 <br> 正規化：Gemini 偶爾直接輸出 <br> 標籤——即時顯示走 innerHTML 看不出來，但存進歷史表後重載會被 escapeHtml 跳脫成裸字「<br><br>」(玩家實測)。存檔前一律轉回換行。

### `relMemMemoryStr_`　<sub>Gallery.gs:3558</sub>

🏠 同居邀請泡泡(2026-07 玩家「同居做成泡泡問一次、完全隱藏才是正解」)：綁在【跨進戀人】那一刻——那正是「要不要住在一起」第一次成立的敘事時機，而且 KANSHOU_REL_RANK_TAG_ 只升不降，這個跨階天生只會發生一次，不必另外記「問過沒」。**跟八度改版拔掉的舊版泡泡差別就在這裡**：舊版是條件成立就每回合跳(玩家嫌煩)，這版是一生一次。

### `relMemMemoryStr_`　<sub>Gallery.gs:3570</sub>

🏠 同居邀請·一生一次：好感首次達門檻(90)且尚未同住、也還沒問過 → 跳一次泡泡並蓋章。

🐛→✅ 2026-07 玩家「如果玩家沒按泡泡而是打對話呢？」——舊版蓋的是布林「問過了」，玩家只要改用打字(或當回合根本沒注意到泡泡)，這個「一生一次」的邀請就【永遠消失】，功能靜靜蒸發。但完全不蓋章又會退回更早那個被嫌煩的版本(條件成立就每回合跳)。折衷＝改存 absDay：同一位、同一天最多問一次，今天沒理它明天再問，接受了就靠 !kanshouIsCohabit_ 自動停。

### `relMemMemoryStr_`　<sub>Gallery.gs:3586</sub>

🎯 只給【事實】(誰·從哪一階到哪一階)，不給寫好的文案——怎麼演由 AI 依她性格自由發揮。

🐛→✅ 2026-07 玩家「會讓玩家疑惑的都修正」：本來寫死 _tierNow > _tierWas，只演升階。於是好感掉下去(爽約/冒犯累積)時，親密尺度天花板【悄悄收緊】卻沒有任何敘事——玩家下一回合只會撞到「她突然不讓我碰了」，完全不知道發生什麼事。降階跟升階同樣是關係的質變，一樣要演一次。★這裡改成雙向是安全的：同居邀請的「一生一次」早就不靠這個 tag 了，它有自己的 KANSHOU_COHABIT_ASKED_TAG_(absDay)＋!kanshouIsCohabit_ 兩道獨立閘門(見上方)。

### `relMemMemoryStr_`　<sub>Gallery.gs:3614</sub>

🎂 週年：曆法固定 365 天/年(kanshouAbsDayToDate_)，故「同月同日」必然是整年數之差。今天剛好撞上就單獨拉一句——這正是把「第一次」記成結構化事實最想拿到的回報：她能精準說出「一年前的今天…」，而不是含糊地感嘆往事。

### `relMemMemoryStr_`　<sub>Gallery.gs:3627</sub>

🤝 相處計數 +1（2026-07 新增）：跟【初見日】同一個位置蓋戳——這裡本來就是「對每位在場者逐一處理」的迴圈，而且每回合只跑一次，天然冪等，不必另外記日戳。⚠ 跳時段/結束一天不算相處：那些回合她只是「時間流轉後恰好在這裡」，不是你陪了她（跟pPresenceStr 對在場來由的定義一致，也擋掉「連按跳時段刷熟悉度」）。

### `relMemMemoryStr_`　<sub>Gallery.gs:3655</sub>

🌅 兩條「昨夜」線都必須依【這回合她到底在不在場】過濾(2026-07 玩家「如果我直接移動呢....」)：旗標在回合開頭就讀掉了，但那時還不知道玩家這回合要去哪。玩家一起床就走人，她留在房間，舊版照樣送出「昨夜與『凜』共度親密·可自然帶晨間曖昧」——叫 AI 跟一個不在場的人演晨間戲，正是本檔【在場驗證·最高優先】自己禁的事。鏡像問題在【昨夜她走了】：那句寫死「今早這個房間只有你自己」，玩家人在商店街就不成立，而且她若剛好被行程骰到同一個地點，說她不在場更是直接跟【在場人物】打架。過濾後為空就整條不送——那一刻本來就沒有這回事。

### `relMemMemoryStr_`　<sub>Gallery.gs:3665</sub>

🌙 深夜獨處(夜未眠)：只給「此刻是什麼場合」這個事實，怎麼發展全看玩家推進與她的個性。親密尺度照舊由【親密尺度五階】依各自好感把關，這裡不另開後門——能不能到底，看的還是好感。★剛進入的那一回合與之後每一回合都送(這是持續狀態不是一次性旗標)，措辭一致、不報幕。

### `relMemMemoryStr_`　<sub>Gallery.gs:3681</sub>

💞 第一次帳：GAS 蓋的既定事實，供 AI 精確回想「我們第一次做某件事是哪天」而非自行編造。

🎯 觸發收緊：這段是「查得到就好的參考資料」，原本只要她有任何一筆【初次】就每回合送(玩幾天後＝永遠在送)。改成只在真的用得到的三種回合才送：①今天是某個第一次的週年 ②本回合剛發生一件第一次 ③玩家這句話在回顧往事。其餘回合完全省略——AI 平時不需要知道這些日期。

### `relMemMemoryStr_`　<sub>Gallery.gs:3700</sub>

📷 拍照(takePhoto)：手機拍照·2026-07 再修（玩家「拍照要改成手機、不用等」）——手機沒有底片這種東西，只驗相簿總容量；拍完立刻存進相簿、立刻能看，不再有「隔天沖洗」的等待。實際落地(寫相簿)在AI成功回應後(見下方)，AI失敗不浪費(反正手機也沒有底片可浪費)。拍攝對象：photoIntent(輸入框先打字再按快門·如「拍那隻橘貓」)有指定且沒點名同伴→風景/生活照(AI自由入鏡街貓/狗兒/光影)；沒指定→有同伴拍同伴、沒同伴拍風景。風景照人物欄記「風景」，相簿自動長出「風景」篩選分頁。

### `relMemMemoryStr_`　<sub>Gallery.gs:3709</sub>

🐛→✅ 稽核抓到：讀表失敗時原本靜默吞例外、_phCount留在初始值0，等於cap在讀表不穩時直接fail-open放行拍照——改成讀表失敗就視為「已滿」fail-closed拒絕，寧可誤擋一次拍照，也不讓相簿容量上限形同虛設。

### `relMemMemoryStr_`　<sub>Gallery.gs:3769</sub>

口吻/招牌小動作(persona.speech/tic)：召喚時已存進 MEMORY 的【口吻】【小動作】標記，直接複用 getPersonaSpeech_/getPersonaTic_ 讀取，讓角色演出招牌語癖而非千篇一律。查無時speech 退回 dailySpeechByName_(日常安全版)，tic 沒有對應日常版就留空，不退回戰時原始值。

### `relMemMemoryStr_`　<sub>Gallery.gs:3774</sub>

🐛→✅ 同一句印兩次(2026-07 實跑提示詞抓到)：heroToKanshouRow_ 的【口吻】標記與 TRAIT 第3格[台詞自稱] 都取自 dailyLook 第3段，是同一份資料的兩個出口——三人同場就整整重印六遍。當時的解法是「同源就只印一個」的比對補丁。
⚠ **2026-09 從根源解掉**：自稱／口氣整格退出特徵（特徵收成 3 格），dailyLook 第3段只剩【口吻】這一個出口，
那段 `_traitSpeech` 比對整段刪除、口吻恆印。

### `relMemMemoryStr_`　<sub>Gallery.gs:3795</sub>

🤝 相處基調（2026-07 取代舊的 pTierToneStr）：舊版只看關係階、只在最低兩階出現，是這件事的退化 1D 版；現在改查 好感×相處次數 的 2D 表（見 KANSHOU_RAPPORT_TONE_）。為什麼非得有第二條軸：好感59×相處20次（新鮮期的試探與心動）跟 好感59×相處300次（自在到不必說完整句子、卻也就停在這裡）本來就該是兩種演法，1D 表達不出來。查無的格子回空字串＝這一格不給指令，讓 AI 自由發揮（刻意留白，填滿只會稀釋有戲的那幾格）。

### `relMemMemoryStr_`　<sub>Gallery.gs:3804</sub>

地點的「當下在做什麼」輕量引子(見上方KANSHOU_LOCATION_ACTIVITY_)，沒對照到的地點不加這句，AI自然發揮即可。⚠ 只給「原本就在這裡」的人——這回合剛跟玩家一起移動過來的同伴(kanshouPreMoveCompanions_)不套，否則被你帶來咖啡廳的人會被誤標成「正在打工」。

🐛→✅ 玩家實測抓到「明明在聊天、有人突然穿上圍裙開始打工」：_pCameWithMe 只在【剛好是移動那一回合】才有效(kanshouPreMoveCompanions_是當回合暫存名單、非持久狀態)——同一地點純聊天的後續回合，這個排除形同失效，deterministic算出「打工」就會套到明明是跟你一起來聊天的同伴身上，跟劇情前面已經講的「她陪你逛」直接矛盾。改成只在【剛抵達那一回合】(moveTarget為真)才附上這句——交代一次「她為什麼在這」就夠了，之後對話歷史本身會記得，不必每回合重複斷言、也就不會演出「聊到一半忽然換上圍裙開始上班」這種自相矛盾的轉場。

### `relMemMemoryStr_`　<sub>Gallery.gs:3819</sub>

🌙 2026-07 玩家「深夜或清晨去她房間找她，有提示AI要讓她們是睡眠狀態嗎?」——查證後確實沒有：kanshouRoomEventStr(她的反應走向)只在玩家按下夜襲/賴床叫醒同意鈕【之後】才會注入，剛推門進去、按鈕還沒點的這一回合完全沒有任何提示，AI只能自己從時段猜，容易演成她還醒著閒聊，跟「深夜找她＝多半在睡」的直覺矛盾。同一位本回合若已進了room-event accept流程(kanshouRoomEventStr已描述她的反應)就不重複補這句，避免兩條指令互相打架。

### `relMemMemoryStr_`　<sub>Gallery.gs:3837</sub>

🐛→✅ 玩家實測前主動抓到：kanshouIsCohabit_ 只在同居提議成立/日常重骰去向時被GAS拿來用，卻從沒告訴AI「這個人現在跟你同居」這個事實——平常聊天靠AI自己從對話歷史猜，換幕縮窗(見下方history-trim)又只留1~2回合，猜不準時容易忘記她已經住這、演成外人作客的疏離語氣。補一句明講。

### `relMemMemoryStr_`　<sub>Gallery.gs:3906</sub>

📅 待赴約定(玩家追問「AI每次都看得到約定吧?」查出的缺口)：約成立到赴約之間的等待回合，AI 原本完全不知道有這個約——聊「期待明天嗎」她會一臉茫然、甚至另約衝突計畫。補一行讓她記得；赴約當天碰面/爽約由結算注入(且結算先清約)，不會與此行重複。

### `relMemMemoryStr_`　<sub>Gallery.gs:3916</sub>

明講方向的「TA是你的${tag}」(而非單純「關係:${tag}」)，避免AI誤讀方向、演反成玩家服侍TA。

🚪 在場來由(四態)：AI 每回合最容易演錯、也最容易出戲的一件事就是「她是怎麼出現在這裡的」——舊版 partyDetailsArr 完全沒有這一欄，AI 只能每回合重猜，於是會對著你牽手帶進來的人說「你怎麼跑進來了」，或每回合重新演一次入場。四種來由全部由【本回合實際發生的轉場】算出，不需要任何新的持久狀態：移動是 moveTarget、跟你來的是 kanshouPreMoveCompanions_、時間跳躍會重骰全世界行程(故不預設連續性)、其餘皆為延續上一回合。

### `relMemMemoryStr_`　<sub>Gallery.gs:3954</sub>

「異/無」(如開膛手傑克「無固定實體」)這類非二元性別值一律按女性向處理(對齊heroToKanshouRow_ 的肉體起始預設)。不開放男男配對(邀請關卡已擋)，故只有「女女」是特殊配對組，其餘一律走「依各自實際性別自然互動」。

### `relMemMemoryStr_`　<sub>Gallery.gs:3963</sub>

🧹 2026-07「多餘設計」掃描：原本非女女的那一組會輸出「${名字}：依各自實際性別自然互動」——那句話**既沒給事實也沒給約束**（連誰是什麼性別都沒講），在場5人時還會把5個名字全列出來講這句廢話。判準：「有它跟沒它，這一回合的敘事會不一樣嗎？」不會 → 砍。只留真正帶著限制的女女那一條；沒有女女配對時整個區塊不輸出。

### `relMemMemoryStr_`　<sub>Gallery.gs:3972</sub>

🛡️ 比照Core_Settings.gs讀同一欄位(mergePhysicalStatus/parseVisibleStatus)的try/catch防呆——PHYSICAL理論上只會被JSON.stringify寫入，但COL是位置索引，欄位一旦錯位/被手動改壞，這裡若沒擋，該角色從此每回合都會拋錯、永遠好不了(見CLAUDE.md「邊界先擋」)。

### `relMemMemoryStr_`　<sub>Gallery.gs:3991</sub>

巧遇者是還沒被召喚、沒有資料列的陌生人，明講「這次到訪期間的系統例外」，避免跟下方【在場驗證鐵律】(只有在場人物能被指名互動)打架，同時允許同一次到訪期間持續互動。

巧遇池走的是跟 actionKanshouSummonHero(僅支援男女／女女配對)完全不同的路徑，不經過那兩處守門——僅「男御主遇男性巧遇對象」這組明講僅止於同性情誼，其餘組合一律自然發展。

### `relMemMemoryStr_`　<sub>Gallery.gs:4018</sub>

🐛→✅ 玩家「字數一下很長一下很短」：舊版篇幅規則只給「好感區間→字數區間」的靜態文字，AI 要自己把數字判斷落在哪一區間本身就不穩(小模型對數字門檻的一貫弱點)，多人在場又好感不一時更不知道該以誰為準——兩個變因疊加就是玩家看到的忽長忽短。改成GAS直接算好一個具體目標字數(取在場好感最高者，沒人在場就用最低檔)直接指定，AI 不必自己做區間判斷。

### `relMemMemoryStr_`　<sub>Gallery.gs:4054</sub>

🌱 動態 master_note 的前置計算(要在 USER prompt 組裝【之前】算好——下面【玩家命格】那行的「你可透過 master_note.經歷 滾動增補」提及必須跟著 _doSideWrite 條件化，否則非側寫回合schema 已刪掉 master_note、USER prompt 卻還在催，AI 會自發吐出 schema 外的欄位擊穿節流)。

🌀 側寫節流：計數 +1 存回 MEMORY(玩家列恆寫回·零額外 round-trip)，只在第 1、N+1、2N+1… 回合帶master_note(首回合必寫·抓初印象)。非側寫回合整塊拿掉、AI 專心敘事，落地端守衛同步擋掉自發輸出。

### `relMemMemoryStr_`　<sub>Gallery.gs:4094</sub>

（⚠ 2026-09 模型整併後兩模式一律 AI_MODEL，driveOn 不再涉及模型；下述 SOLO_MODEL/AI_MODEL 字樣是當時的歷史紀錄）max_tokens=1500：narration目標約500字＋其餘欄位，太低容易讓模型輸出被截斷成不完整JSON。

🎛️ 2026-07 玩家調整採樣參數：temperature/top_p 略升、加top_k/repetition_penalty/presence_penalty/frequency_penalty 抑制重複套路句(如老是收在同一種收尾語氣)，僅driveOn吃到大模型(AI_MODEL)時這幾顆額外旋鈕才會實際生效，矜持模式(SOLO_MODEL)不支援的部分由OpenRouter靜默忽略。

🚀 2026-07 探針實測定案(v2硬版·六階梯度)：SOLO_MODEL(當時為gemini-3.1-flash-lite，同月陸續換過gemini-3.5-flash-lite／gemini-2.5-flash-lite(玩家實測比較效果中)，下述具體秒數/命中數字是最初3.1版測的，僅供參考·未針對後續版本重新探針)在真慾海律令下階4~6全過、露骨度🔥(極致階命中13個器官/水聲/動作字眼·真敢寫到底)、每次僅~4-5秒；反觀原本點火(driveOn=true)硬吃的 AI_MODEL(deepseek)慢達15~49秒、且極致露骨那階還被審查擋下。故【兩模式一律先打快 Gemini】、DeepSeek 只留最後備援(rare fallback，本就少觸發)。driveOn 從此【只控敘事推進幅度的提示詞強度、不再切模型】。retries=1：Gemini 腿試一次、真被擋才交棒，不浪費柔化重試。

⚡ 純時間轉場(跳時段/結束一天/跳節慶/推進時間)只是換幕、不需 AI 寫滿500字場景——上限砍到600讓生成快一截(玩家實測「讓時間流轉到夜晚超級久」)。一般聊天/移動仍1500(narration目標約500字·太低會截斷成不完整JSON)。移動(moveTarget)不算轉場提速範圍——走到新地點仍要完整場景。

🐛→✅ 玩家實測抓到：上面這句「太低會截斷成不完整JSON」的警語，其實時間轉場也躲不掉——轉場當下若剛好有同伴在場(如牽著手一起跳時段)，AI一樣得寫一整段她的反應場景，跟一般聊天同等篇幅需求，600 tokens 常常寫到一半就被截斷、JSON 不完整，重試全部失敗只能回「因果紊亂」保底文字(Cloud 記錄檔證實：JSON.parse 卡在 truncate 掉的字串中間)。只有真的沒人在場(純粹「時間過去了」的簡短交代)才適用600的精簡上限，有人在場時比照一般聊天給滿1500。

### `relMemMemoryStr_`　<sub>Gallery.gs:4120</sub>

抓取近 6 筆原始歷史(3輪)，轉換為 API 格式。

🎬 換幕縮窗(確定性根治「換地點/換時段後被舊場景帶著跑」)：移動/跳時段/結束一天的回合只餵最近 1 輪——舊場景的對話根本不進 AI 眼睛、物理上不可能沿用；保留最近 1 輪讓「決定要來這裡」的話題接得上(帶同伴同行時對話不斷裂)。

### `relMemMemoryStr_`　<sub>Gallery.gs:4133</sub>

🌱 動態 master_note：只剩經歷會滾動(性格四格/萌點已不再交給AI，見buildDefaultSystemPrompt註解)。buildDefaultSystemPrompt 只有此處呼叫，故把系統提示詞在這裡組好、當 systemOverride 傳入(取代 callGeminiAPI 內的無參數 fallback)。_doSideWrite 已在 USER prompt 組裝前算好(見上方·prompt 內的經歷提及要跟著條件化)。

🎛️ 玩家關掉【命運的抉擇】→ options 欄整個不進 schema(前端帶 optionsOn；沒帶=舊前端，照常給)。

### `relMemMemoryStr_`　<sub>Gallery.gs:4140</sub>

🛡️→✅ 2026-07 邊界稽核：模型偶爾會回【截斷的 JSON】(吐到 max token 就斷)或純文字道歉，這在真實運行中是常態、不是例外。舊版直接 JSON.parse，一失敗就丟例外——而 handleGameAction的 try 只有 finally、沒有 catch，例外會一路穿出去變成裸錯誤。callGeminiAPI 本來就設計了_genFailed 這條優雅失敗路徑(整回合 no-op、不寫歷史)，解析不出來就走同一條，別另闢死路。

### `relMemMemoryStr_`　<sub>Gallery.gs:4154</sub>

🐛→✅ callGeminiAPI 全部重試/審查攔截皆失敗時，回傳的是一組「保底文字」JSON(而非丟例外)，長相跟真正生成成功的回應一模一樣——若照舊往下跑，這句「什麼都沒發生」的保底文字會被後面 saveGameHistoryBatch 原封不動存進歷史，下次呼叫又把它當成上一輪的既定事實餵回AI，可能讓AI誤以為劇情已經走到某個曖昧不明的狀態、接續出跟實際劇情矛盾的敘事。callGeminiAPI在保底文字裡加了 _genFailed 旗標即可辨識，失敗就在這裡直接回給前端、完全不進入後面任何側效(拍照/性格/回憶/提議…)、也不寫進歷史。

### `relMemMemoryStr_`　<sub>Gallery.gs:4171</sub>

🐛→✅ 稽核抓到：這是AI結構化輸出(非玩家直接輸入)寫進試算表儲存格的自由文字，卻只清了HTML斷字/內部標記符號，沒比照sanitizeUserData_(Router_Action.gs)也清控制/零寬/雙向控制字元、也沒擋開頭=+-@這類會被Sheets appendRow解讀成公式的引導字元——照樣落地的話，之後任何讀這欄位的地方(含未來可能新增的畫面)都會拿到帶零寬/雙向字元的髒字串，儲存格本身也可能被解讀成公式而非純文字。跟玩家輸入欄位比照同一套防線。

### `relMemMemoryStr_`　<sub>Gallery.gs:4179</sub>

⚠ 引導字元這道【必須擺最後】：它後面每一道 replace 都還會再刪字元，先擋就會被「刪掉開頭那個字→原本第二位的 = 變成開頭」繞過(實測 photo_caption 打 `"=SUM(1+1)`落地就是一格活的公式)。同一個順序錯誤在 sanitizeUserData_ 也有，已一併修正。

### `relMemMemoryStr_`　<sub>Gallery.gs:4187</sub>

🐛→✅ 稽核抓到：跟上面敘事用的pActivityStr(2959行)同一份kanshouLocActivity_，卻沒套用同款_pCameWithMe防呆——若被拍者是這回合才被玩家帶著同行(moveTarget)的同伴，這裡仍照樣算出「她在這打工/當班」這類固定職業描述存進相簿，跟本回合敘事剛講的「她陪你來」矛盾。雖然前端目前沒有任何地方讀這個活動欄位(存粹存檔·尚無顯示介面)，但既然要存就該存對，比照敘事那份判斷邏輯：本回合才同行者不附活動描述。

### `relMemMemoryStr_`　<sub>Gallery.gs:4205</sub>

💭 AI 不得自行搬動玩家、也不再有任何欄位讓它自己提議換地方(§134·2026-07再修，玩家實測「AI一直提議移動、頭痛」後把 move_proposal 整欄砍掉)：地點只有兩條合法變動路徑——玩家自己用地圖走(moveTarget，見上游1739)，或玩家在地圖向同伴提議同去、GAS 依好感直接裁定(_pendingProposal.type==='move'，下方判定式會回填這裡)。moveProposal 在此固定為空，唯一寫入來源就是下面那段 _pendingProposal 判定，AI 完全無從置喙。

### `relMemMemoryStr_`　<sub>Gallery.gs:4212</sub>

📅🤝 相約/牽手的成立判定：pre-AI只記了待判定(_pendingProposal)、沒動MEMORY，這裡讀AI依角色個性與好感給出的 proposal_accept 才決定要不要落地。fail-closed：只有明確「接受」且無「拒」字才算成立，空字串/模稜兩可一律視為未答應(寧可不成立，不讓提議太容易通過)。

kanshouProposalResult_ 已於 pre-AI(promiseAccept 那塊)宣告——這裡直接賦值，別再 let 蓋出內層影子變數(否則回傳時讀到的是外層那個、拿不到這裡寫的值)。一回合只走 promiseAccept 或 proposal_accept 一條。

### `relMemMemoryStr_`　<sub>Gallery.gs:4253</sub>

🐛→✅ 2026-07 玩家「約會泡泡也好煩人」：拿掉GAS依好感卡關(39/59/79)每回合主動追問「要不要約她出去」的泡泡(原kanshouPromiseOffer_)——跟同居泡泡同一個嫌煩理由，且卡關中這顆泡泡是每回合都跳(不是一天一次)，比同居泡泡還更頻繁。玩家想約會時仍可隨時用既有 promiseMeet(地圖「相約」)主動邀約，赴約成功一樣拿+5好感、一樣能突破聊天上限(kanshouPromiseMetStr不吃chat ceiling)，沒有損失任何機制，只是系統不再主動跳出來問。

🐛→✅ 2026-07 玩家「取消同居詢問的泡泡吧，太煩人了」：拿掉GAS每天主動追問「要不要邀她同居」這個泡泡——玩家想同居時仍可隨時自己主動邀請(見上方cohabitInvite/kanshouInviteCohabit)，只是不再被系統每天問。

### `relMemMemoryStr_`　<sub>Gallery.gs:4262</sub>

🚶‍♀️ 同伴自主離場(npc_exit)：AI判斷某在場同伴這回合自然告辭時，GAS真的把她移出場景——依當前時刻骰她的日常去向(獨立住民作息)，下回合就不在你身邊，解掉舊「嘴上說走卻還在場」的違和。只認此刻同地在場的同伴(防AI點名不在場者)；骰回原地就改去登記住處/任一非原地公開地點，確保她真的離開。被牽著手的她若在此離場→牽手一併鬆開(不能牽著已離場的人)。

### `relMemMemoryStr_`　<sub>Gallery.gs:4309</sub>

🐛→✅ 玩家實測前主動抓到：這裡從沒檢查這個人是否真的在場(partyRows)——AI若因對話歷史殘留或幻覺提到不在場的人名，好感值仍會被悄悄寫入。提示詞明講「只有目前在場人物」才准變動好感(2463行「後日談模式」段)，這裡補上同一道在場檢查，跟 npc_exit(2660行)/intimacy_feedback共用同一個判準，不再各自為政。

### `relMemMemoryStr_`　<sub>Gallery.gs:4316</sub>

鑑賞允許好感依劇情推進（solo 的好感收歸 GAS 按鈕，走不同的 narrate_only 路徑，不受這裡影響）

🐛→✅ 玩家實測前主動抓到：提示詞明講單回合好感漲幅上限(±5)，但這裡只有 sanitizeAiData_ 的[-100,100]粗夾，AI 一次亂寫的極端值(如100)在低好感時仍可能一口氣衝過好幾個等級。改成先夾單回合漲跌幅本身，再套用既有的梯度上限/範圍檢查，說到做到。

### `relMemMemoryStr_`　<sub>Gallery.gs:4344</sub>

physical_state 只管神色。提示詞要求≤15字，後端刻意截 20 當【容錯緩衝】——AI 常超寫兩三字(如「…因尷尬而生的紅暈」17字)，硬剪 15 會產生斷尾殘句(「…因尷尬而生的」·玩家實測回報)，寧可放寬 5 字也不要斷句。⚠ 別再「對齊文件」改回 15，這個差距是刻意的。

🐛→✅ 2026-07-28 玩家實測「狀態：原本專注看書的動作停下，抬頭望向風音，眼」——正好 20 字，就是這裡硬剪出來的斷尾。5 字緩衝只夠吸收「超寫兩三字」，AI 把【整句敘事】寫進來時照樣斷句。改成【在標點處收尾】：預算內的最後一個標點就是句子的自然結束點，剪在那裡不會殘半個詞。預算內完全沒有標點才退回硬剪(至少不是無限長)。

### `relMemMemoryStr_`　<sub>Gallery.gs:4398</sub>

💞 共同回憶(27欄 MEMOIR)：同 processTags 精神——append 去重、保留最近 maxCount 條。差別是這格是獨立 cell(非 REL_MEM 裡的標籤)，且一條回憶句子本身可能含「、」，故【改用全形｜當條目分隔】、寫入前先清掉句中的 ｜【】[] 避免污染分隔(比照 setOutfit_ 的清洗)。

### `relMemMemoryStr_`　<sub>Gallery.gs:4404</sub>

🛡️ 相似度去重(玩家實測「超級洗畫面」)：同一事件在3輪歷史窗裡迴盪，Gemini每回合換句話說重記一條(「約定去社區公園」記了四種說法)。精確比對擋不住換句話說→加「字元雙字組containment」：與【最近3條】任一條重疊率≥0.6視為同一件事、不收(只比近期＝針對迴盪窗，久遠條目不誤殺真正的新里程碑)。

### `relMemMemoryStr_`　<sub>Gallery.gs:4457</sub>

🔒 2026-07 五度改版·玩家透過 kanshou_set_nickname 手動鎖定過專屬稱呼後(【稱呼鎖】是)，AI 不再自動累加新稱呼進來——尊重玩家的手動選擇，同 kanshouSyncRelTier_ 對自訂關係稱呼「一旦手動改過就不再被自動覆寫」的精神。

### `relMemMemoryStr_`　<sub>Gallery.gs:4466</sub>

🗑 2026-07 態度不再落地（見 relMemMemoryStr_ 的說明：它是會自我鎖死的形容詞標籤）。（attitude 欄位已於 2026-07 移除；那一刻的認不認同改由敘事本身表達，不再佔一個欄位）但那是一次性的表達，不寫進 REL_MEM、也不會被餵回去變成永久人設。

### `relMemMemoryStr_`　<sub>Gallery.gs:4480</sub>

🌱 玩家御主「滾動側寫」(master_note)：2026-07 再修（玩家「萌點AI根本亂寫...AI只能改動經歷」）——性格四格與萌點已在創角時由AI一次生成完整(見actionBackfillKanshouAi)，遊玩期間AI完全看不到這兩類欄位(schema已拿掉)、也就無從寫。這裡只剩經歷會繼續滾動。_doSideWrite 守衛：非側寫回合 AI 若無視 schema 自發吐 master_note 也不落地(節流不可被擊穿)。

### `relMemMemoryStr_`　<sub>Gallery.gs:4486</sub>

經歷：AI 承接舊值增補後回傳整段，這裡直接採用；空/未給則保留原經歷不動。不鎖——玩家改命=修正，AI 之後照樣繼續滾動更新。⚠ slice(0,80)：schema 跟 AI 說 ≤50，這 30 字是刻意的容錯緩衝(比照 physical_state 15/20)，AI 略超時不半句腰斬——別「對齊文件」改回 50。

### `relMemMemoryStr_`　<sub>Gallery.gs:4496</sub>

競態修：play 豁免寫入鎖(AI 呼叫佔數秒會卡全域)，但上面的列索引是 AI 呼叫【前】讀到的——期間其他上鎖動作若刪列，索引會位移。寫回前做一次 ID 欄窄讀重定位，列已被刪就跳過。

🆕 新列先落盤，再建 id 索引——順序不能反：liveIdx 建完才 append 的話，新列查不到 id，後面 dirtyPcRows 對她的異動(週年/關係階/初次帳)會被當成「列已被刪」靜默跳過。

### `relMemMemoryStr_`　<sub>Gallery.gs:4522</sub>

橋段邀請按鈕(夜襲/賴床/地點/節慶共用)：candidate在回合開頭(任何LOC寫入之前)就算好了，這裡直接沿用，不應該重算——重算會撞回「同行同伴LOC已被同步」的舊bug。label/btn由KANSHOU_SCENE_EVENTS_資料驅動，前端照顯示、不再硬編各事件文字。

🤝 巧遇中對象→前端「結識」邀請框(encounterOffer)：她只是路人，玩家點了才正式入駐。

### `relMemMemoryStr_`　<sub>Gallery.gs:4552</sub>

提速：pcData 這裡已是本回合全部異動寫回後的權威陣列，直接複用它建一份跟 get_tags 同格式的 payload 夾帶回去，省掉前端另打一趟 get_tags 的 round-trip；建構失敗就不夾帶，前端會自動退回原本的 get_tags 補呼叫。

### `relMemMemoryStr_`　<sub>Gallery.gs:4571</sub>

🚪 善後選項【只在她進門那一回合給一次】(2026-07 玩家「就只要問一次就好」)。代價是明白的、也是合理的：玩家若改用打字繼續陪她，就沒有送客鍵了，之後按結束一天她會留下過夜——那本來就是「你選擇繼續陪她」的自然結果。⚠ 別為了補這個缺口把泡泡改成常駐，玩家對常駐泡泡的容忍度是零(同居/約會泡泡都因此被拔過)。

### `relMemMemoryStr_`　<sub>Gallery.gs:4582</sub>

修過的bug：#clock-hud讀共用的updateClock(data.clock,...)，但data.clock在鑑賞這條路徑上從來沒被設過，導致HUD一直被當成「沒有clock」隱藏。這裡補上同一份kanshouClock.label餵給共用HUD，不是另開一條時鐘。

### `relMemMemoryStr_`　<sub>Gallery.gs:4589</sub>

🐛→✅ 2026-07 稽核抓到：舊版這裡回的物件沒有 success:false，前端因此判斷成「正常敘事」直接把原始JS例外訊息(如 TypeError...)當「說書人」台詞演出，違反show-don't-tell、玩家也分不出是劇情還是系統壞了。改回前端既有的 success:false 分支(⚠警示樣式，不進敘事流)。

---

## `gas/History_Sync.gs`

### `saveGameHistoryBatch`　<sub>History_Sync.gs:19</sub>

🔒 稽核抓到：這裡的「讀lastRow→append→trimRowsByOwner(讀全欄→算絕對列號→刪列)」是不折不扣的read-modify-write，但唯一的兩個呼叫端(actionNarrateOnly/actionPlay_)都刻意豁免全域鎖(見Router_Action.gs LOCK_EXEMPT_ACTIONS_——AI呼叫耗時數秒，鎖整個request會卡住其他玩家)。此表solo/鑑賞共用、所有玩家併發寫入，兩個請求交錯時可能：①同pcId併發append互相覆寫剛寫入的列，②trimRowsByOwner算出的絕對列號在deleteRows執行前，被另一個pcId併發的trim/deleteRows推移，刪到已經不屬於自己的列(跨玩家)。這個函式本身在AI回應已經拿到之後才呼叫，只是單純Sheets讀寫、耗時遠低於秒級——用短暫ScriptLock只包住這個函式本體(非整個action)：搶到鎖＝消除競態；搶不到(極端併發下)＝退回今天原本的無鎖行為，不會比現狀更差、也不會讓其他玩家等一場數秒的AI呼叫。

### `escapeHtml_`　<sub>History_Sync.gs:41</sub>

🛡️ 儲存型XSS修復：玩家自己打的訊息(message)/鑑賞御主名(pcName)存進「歷史暫存」時未經HTML跳脫，這裡重新載入歷史時又用innerHTML直接塞回頁面——等於玩家自己輸入的文字被當成HTML執行。真正該修的是輸入端(sanitizeUserData_)，但輸出端(這裡)也要有跳脫，雙重防護。

### `readRecentPlayerRows_`　<sub>History_Sync.gs:49</sub>

讀「歷史暫存」最後 1000 列(避免整表掃描)→ 按 pcId 過濾 → 取最後 limit 筆原始 row。getGameHistory(轉HTML)／getGameHistoryBatchRaw(回傳原始物件)共用同一份讀表邏輯。

⚠ 稽核備註(已知規模限制·非本輪修復範圍)：這 1000 列窗口是「整張共用表」的最後1000列，不是「這個pcId」的最後1000列——若同時段有夠多其他玩家(solo+鑑賞共用同一張表)瘋狂觸發narrate_only/play，一個暫時不活躍但仍在進行中的玩家，其本應在40列扣打內的舊列可能被擠出這個窗口，getGameHistory(讀歷史還原)／getGameHistoryBatchRaw(AI連戲上下文)會靜默回傳截斷/空結果。purgeHistoryForPcIds_只在局終/刪檔時清表，不解決「進行中對局被別人擠出窗口」這個情境。目前玩家規模下發生機率低，先記錄在案；真的要根治需要改用per-pcId索引或加大窗口，屬於較大改動。

---

## `gas/Mystic_Code.gs`

### （檔案層級）　<sub>Mystic_Code.gs:37</sub>

⚠ 單一真實來源提醒(2026-07稽核抓到)：這裡的 npDefMul 0.82 沒有階級縮放(禮裝不像從者技能吃rankMul_)，是純手動維護的常數——Script.html 的 FX_DESC.avalon_saber／showIdealRealm() 各自手打了一份「×0.82」文字(GAS常數無法直接餵給client端HTML)，日後調整這裡記得同步改那兩處。

### （檔案層級）　<sub>Mystic_Code.gs:41</sub>

Avalon 回到阿爾托莉雅手中時減傷/時回同一般 avalon；理想鄉全擋 6 階究極寶具是 Router_Battle.gs

的攔截判定(idealRealm，耗 100 魔，見該檔 offenseTier_>=6 分支)，不在此表常駐生效。同上，

Script.html 的「≥100/100 魔」文字也是手動維護的複本，改這裡的門檻/耗魔量記得同步那邊。

### `injectMysticBuff_`　<sub>Mystic_Code.gs:60</sub>

持 Avalon 的阿爾托莉雅額外標記 avalon_saber + 時回，供 Router_Battle 理想鄉攔截判定用；

非阿爾托莉雅持 Avalon 走下方一般被動(僅減傷，無理想鄉攔截)。

🐛→✅ 舊版用子字串正則(/阿爾托莉雅/.test(...))比對，玩家自訂/AI 生成的 Saber 從者只要真名剛好包含這四個字(如刻意取名「阿爾托莉雅・奧爾塔」)就會被誤判成王之聖劍的合法持有者——這類機制本該資料驅動(如 FORGE_CLS_SKILLS_/ALLOWED_FX_)、至少也該用精確比對，改成完整真名相等。

🐛→✅ 2026-07 前次修正比對錯了字串：種子真名其實是「阿爾托莉雅·潘德拉貢」(Seed_Codex.gs)，前次改的完整相等只比對到「阿爾托莉雅」四字，永遠對不上召喚後 c.name 的完整全名，導致理想鄉對唯一合法持有者(正典本尊)從此再也無法觸發——改比對真正的完整真名。

---

## `gas/Router_Action.gs`

### `sanitizeUserData_`　<sub>Router_Action.gs:83</sub>

名稱類欄位禁用 HTML/JS 斷字字元，避免在前端各處 innerHTML/onclick 拼接時被拿來做標籤或屬性逃脫

🐛→✅ 舊版寫的是 "newRelName"，但 actionUpdateRelTag 實際讀的欄位叫 userData.newTagText——兩個字串對不上，這條清洗規則從沒生效過，讓關係稱呼欄位只吃 GLOBAL_MAX 截斷、沒過 HTML 斷字字元清洗，前端卡片渲染該欄位時又漏包 escapeHtml，等於留一個可注入 innerHTML 的缺口。

🐛→✅ 再一輪稽核抓到：acctName 原本完全沒過濾｜【】——鑑賞首次建檔(actionEnterKanshou)會把acctName 原樣字串拼接進 MEMORY(`"【帳號】"+acctName+"｜【鑑賞後日談】..."`)，玩家把帳號名稱打成含｜【】的字串就能偽造任意MEMORY標記(如偽造【自訂道具】帶ignoreBond:1繞過好感門檻)。併入這裡統一擋，並在下面規則加上｜【】清洗(不只<>&"'`)。

🐯 servantName/foeName：老虎道場(tiger_dojo)把名字直接拼進提示詞，比照其餘名稱欄位清洗

### `sanitizeUserData_`　<sub>Router_Action.gs:110</sub>

🐛→✅ 稽核抓到：slice在trim之前——若字串帶超過NAME_MAX個前導空白(行動裝置自動加空格/複製貼上常見)，slice會把20字預算全吃在空白上、砍掉後面真正的名字字元，呼叫端事後再trim就得到空字串，合法名稱被誤判成「未輸入」。改成先trim再slice。

### `sanitizeUserData_`　<sub>Router_Action.gs:117</sub>

🐛→✅ 2026-07 邊界稽核·順序錯誤：公式引導字元的防線原本跟 CONTROL_RE 綁在【最前面】，但它後面還有好幾道 replace 會【再刪字元】——刪掉開頭那個字之後，原本被擋在第二位的`=` 就重新變成開頭。實測 photo_caption 打 `"=SUM(1+1)` 落地就是一格活的公式。這道守的是「最終落地字串的第一個字」，就必須是【最後一道】。

### `STATE_PRE_DATA_`　<sub>Router_Action.gs:126</sub>

⚡ handler → dispatcher 的整表陣列交棒：寫入完整性已驗證的 handler(其所有寫入 helper 皆原地改回同一份 pcData)在成功返回前設此全域，dispatcher 夾 _state 時直接複用、省一次整表重讀。GAS 每個請求執行環境獨立，全域不跨請求；dispatcher 開頭重置防呆。

### `handleGameAction`　<sub>Router_Action.gs:143</sub>

🔄 試算表存在性檢查改成純手動(check_sheets action、登入畫面按鈕)，不再每個 action 都自動跑一次。

🌹 慾海路由：御主 avatar 以 "KPC_" 開頭 → 整條後日談路徑(actionPlay/sync/move…)改讀「鑑賞眾生」分頁，與戰爭主表「眾生」完全隔離。solo 御主是 "PC_" 不受影響。

### `handleGameAction`　<sub>Router_Action.gs:156</sub>

🔒 稽核抓到系統性漏洞：get_tags/sync/fate_battle/bond/mana_supply…等近全部solo戰場action，long-standing只用裸findIndex信任前端傳來的pcId，完全沒反查「帳號」表確認呼叫者真的擁有這個pcId——pcId是可預測字串("PC_"+timestamp)，猜中/枚舉即可代任意玩家讀取私密狀態或竄改HP/羈絆/同盟/裝備(部分甚至不可逆，如mana_supply燒蝕迴路)。單一真實來源修法：不逐一補洞，改在dispatch前統一擋(見verifyPcOwnership_)，比照kanshou原本各handler各自反查帳號表的同一套邏輯(PC_查COL.ACC.PC／KPC_查COL.ACC.KPC)，故各kanshou handler原本的反查已可精簡成純索引查找(見Gallery.gs的kanshouPcIdx_)。白名單只留「pcId尚不存在／已用其他方式驗證歸屬」的動作。

### `handleGameAction`　<sub>Router_Action.gs:171</sub>

🔒 稽核抓到：actionPlay_(Gallery.gs)因AI呼叫數秒~數十秒故意豁免全域鎖，改用CacheService鍵kplay_<pcId> 做自己的軟性互斥，只防「同pcId兩次play互撞」；但其餘kanshou setter action(kanshou_set_prop/kanshou_add_quick_phrase/update_rel_tag/kanshou_set_name等)完全不理會這把鎖，能在play等AI回應期間插隊執行並成功寫入——而play結尾是「整列覆寫」(見actionPlay_的dirtyPcRows)，用的是呼叫當下的舊快照，會把這些setter剛寫入的改動悄悄蓋回舊值(玩家已看到setter回報成功，稍後卻被吃掉)。讓這些setter偵測到同pcId有play在跑時直接請玩家稍候，避免跟play的整列覆寫競速；只對「非play本身、且會實際取ScriptLock寫表」的action套用，純讀取類不受影響。

### `handleGameAction`　<sub>Router_Action.gs:185</sub>

🔒 寫入互斥：會寫表的動作取 ScriptLock，擋「同鍵重送/連點」重複扣血扣AP。豁免不取鎖：①純讀取 ②長 AI 敘事(鎖是全域的，被數秒的 AI 呼叫佔住會卡到其他請求)。搶不到鎖(上一動作尚在結算)→回「稍候」而非疊加重跑。

### `handleGameAction`　<sub>Router_Action.gs:212</sub>

🐛→✅ 舊版這裡傳空字串當願望——唯獨這個「時限耗盡」敗北路徑沒有呼叫 extractWish_(其餘所有敗北分支：戰鬥/補魔/令咒反噬等都有)，導致單純被14日時限拖垮的玩家，虛假之夢完全繞過自己設定的願望、讀起來像通用場景，跟其他敗北方式的夢境待遇不一致。

### `handleGameAction`　<sub>Router_Action.gs:222</sub>

⚡ 2→1：solo 遊戲動作回應自動夾帶最新 client state(_state)，前端套用後即不必再打一趟 sync。只對 solo 御主(PC_)＋會改動戰場狀態的動作做；查無人/出錯則略過(前端自動 fallback 回真 sync)。優先吃 STATE_PRE_DATA_ 省掉 buildClientState_ 的整表重讀；未交棒的 handler 照舊 fallback 重讀。

🐛→✅ 2026-07 稽核抓到："KPC_xxx".indexOf("PC_")===1(非0)，這個判斷把鑑賞完全排除在外——但 update_fate/update_rel_tag 兩個handler本就是特地扣出來給鑑賞共用(見上方KANSHOU_BLOCKED_ACTIONS_註解)、也確實有交棒STATE_PRE_DATA_，只是這裡的守門條件忘了同步放行，導致鑑賞玩家改命/改稱呼存檔後前端沒收到_state、白跑一趟真正的sync整表重讀。isKanshouCtx為真時能走到這裡的action只有這三個(其餘STATE_AFTER_ACTIONS成員都在更早的KANSHOU_BLOCKED_ACTIONS_被擋掉)：update_fate/update_rel_tag/kanshou_set_nickname(2026-07五度改版新增專屬稱呼手動設定)。

### `OWNERSHIP_CHECK_EXEMPT_`　<sub>Router_Action.gs:243</sub>

🔒 不取寫入鎖的動作：純讀取(不寫表·鎖了白繳成本) ＋ 長 AI 敘事(佔鎖數秒會卡住全域)。⚠ sync 雖會 markRivalsSeen_ 標記 SEEN，但該寫入冪等(重標無害)，不值得為它鎖每一次同步。

🔒 pcId 歸屬驗證豁免名單：僅列「pcId 當下尚不存在／已用其他方式驗證歸屬」的動作——account_login/account_new_game/create/enter_kanshou 建立帳號連結前根本不帶 pcId；claim_hero/save_hero 走 persona.creator===acctName 這套不同模型(英靈殿列，非個人pcId列)；get_heroes/get_masters 是公開名冊，handler 本身完全不讀 pcId；check_name/check_sheets/dev_resync_codex 不涉及個別玩家列；purge_orphans 是全局孤兒清理。其餘只要動作帶了 pcId，一律先過 verifyPcOwnership_ 反查「帳號」表確認真的是本人。

### `STATE_AFTER_ACTIONS`　<sub>Router_Action.gs:262</sub>

⚡ 會改動 solo 戰場狀態、前端事後會 syncData(整頁刷新) 的動作 → 夾帶 _state 省一趟 round-trip。不含：sync(本身即 state)／get_tags／純讀取(inspect/get_*)／創角召喚(自走 reload)／kanshou(KPC_)；也不含「樂觀更新」的輕量 setter(set_servant_output/set_mage_realm/set_rune_mode)——它們不 syncData、只吃 res.economy，夾 _state 反而白做整表讀取。也不含 narrate_only——前端 narrate() 只吃 res.text、不消費 _state，夾它純浪費整表讀。move 也不含：前端 travelTo() 從不呼叫 syncData()／不消費 __pendingState，靠自己回應的people/locations/mapDesc/mapNodes/statusString 就足夠更新畫面，夾 _state 對這個全遊戲最高頻的動作只是白算一次完整 buildClientState_ 後被原地丟棄。

### `KANSHOU_BLOCKED_ACTIONS_`　<sub>Router_Action.gs:277</sub>

🛡️ 慾海(KPC_)明確擋下的戰鬥／經濟／結盟類 action——皆為 solo 戰爭專屬，前端在 kanshou 模式下本就全數隱藏對應按鈕，這裡擋 API 直打。取 STATE_AFTER_ACTIONS 扣掉 update_fate/update_rel_tag/kanshou_set_nickname(通用或鑑賞專屬的敘事欄編輯，慾海也適用)，加上 3 個樂觀更新輕量 setter。move 不在名單中：鑑賞移動地圖走 action:'play'+moveTarget，從不真的呼叫 action:'move'；且actionMove 用 KPC_ id 去查「眾生」表本就查無此人、安全但原因與其他表面相似的判斷不同。weapon/get_map_nodes/narrate_only/end_run/create/summon_servant/backfill_master_ai/account_login/account_new_game 皆為 solo 專屬，鑑賞 UI 從未呼叫過，但誤呼叫會寫壞或清錯資料表（如 end_run 會清錯帳號表欄位、create/summon_servant 會把戰鬥 schema 寫進鑑賞眾生表、purge_orphans 若以 KPC_ 呼叫會誤刪整張鑑賞眾生表）——明確擋掉，不依賴資料形狀僥倖安全。

### `actionUpdateFate`　<sub>Router_Action.gs:303</sub>

🐛→✅ 玩家要求「真正內化」的萌點：同伴/NPC的萌點只留給AI演出參考，玩家不可查看也不可竄改——前端已把同伴卡的萌點格連按鈕都藏了，這裡補後端防線，擋掉繞前端直打API的路。

### `actionCheckName`　<sub>Router_Action.gs:309</sub>

與 create(actionManualNpc) 一致——不擋跨局同名（game_id 實例化，玩家御主靠 pcId 認人，跨局撞名無害）。只擋【正典角色名】(避免與本局被種入的同名正典敵手雙胞胎)；想扮演正典請走「扮演正典御主」入口。

userData.name 已被 cleanChineseName 洗成純中文去標點，比對對象也需同樣清洗，否則含標點的正典

名號(如「韋伯·維爾維特」)永遠比不中。SEED_SERVANTS 的真名欄位是 `realName`，不是 `name`。

### `actionUpdateFate`　<sub>Router_Action.gs:311</sub>

🐛→✅ 2026-07 拆除「性格鎖」機制（玩家「萌點AI根本亂寫...AI只能改動經歷」）：AI 的滾動側寫已經完全不會再去動性格/萌點這兩類欄位了，鎖不鎖沒有意義，這裡不再收/寫 prefLocks。

### `resolveCallerGameId_`　<sub>Router_Action.gs:318</sub>

🔒 呼叫者身分解析：get_full_status/update_fate/update_rel_tag/kanshou_set_nickname 這4個solo/鑑賞共用handler，用這支找出呼叫者自己的 game_id。歸屬驗證本身已上移到 dispatcher統一擋（`handleGameAction`→`verifyPcOwnership_`，見上方；kanshou/solo pcId 進到這裡時都已確認真的屬於這個帳號），這裡只需要純索引查找＋讀 GAME_ID，不必再反查一次帳號表。回傳null＝查無此列，呼叫端須視同「查無此人」直接回絕；solo一律回字串(可能是"")。

### `resolveCallerGameId_`　<sub>Router_Action.gs:328</sub>

🐛→✅ 再稽核抓到：查無此列時原本回傳""(非null)，呼叫端只擋null——導致捏造的pcId能讓下游findPcRowIdx_/手寫的myGameId比對因gid為""(falsy)整個跳過game_id過濾，退化成跨全局姓名搜尋(get_full_status可讀任意玩家狀態；update_fate/update_rel_tag甚至可跨局竄改)。查無此列一律回null強制呼叫端拒絕；「找到列但其GAME_ID欄本身是空字串」(舊資料相容)才維持回傳""。

### `actionUpdateFate`　<sub>Router_Action.gs:357</sub>

從者狀態(📜 狀態鈕)開的 openStatus 傳的是【名字】非 ID，故需接受 ID 或同行從者名字，

且限本局 game_id(防跨局撞名／名字誤中敵方非同行者)。

🔒 帳號歸屬驗證（2026-07 再稽核抓到的漏洞補上，見 resolveCallerGameId_ 說明）。

### `buildTagsPayload_`　<sub>Router_Action.gs:402</sub>

🐛→✅ god_hand(十二試煉)說明 popup 舊版前端寫死「11次」，只對種子赫拉克勒斯正確——工房/AI生成固定3命、尼祿等敵方各自有專屬命數(【試煉】N)。帶上這名從者實際剩餘命數，供卡片說明 popup 顯示真值。

### `buildTagsPayload_`　<sub>Router_Action.gs:409</sub>

🐛→✅ 2026-07 稽核抓到：這裡原本回傳「已stringify的字串」，跟下方成功路徑回傳「物件」型別不一致——`actionGetTags` 呼叫端會再包一層JSON.stringify，字串誤入變成雙重編碼；另兩處直接把回傳值當物件用(`tp.success`／`tags:`欄位)，字串會讓`.success`讀到undefined、或讓`tags`欄位變成一段跳脫過的JSON字串而非巢狀物件。改回傳物件，跟成功路徑型別一致。

### `buildTagsPayload_`　<sub>Router_Action.gs:440</sub>

🗝️ 雙從者：收齊所有在世我方從者（servants 陣列）；servant＝第一個（向後相容）

🌍 solo 靠 IS_PARTY==="同行" 過濾隊伍；鑑賞無「隊伍」概念，改用 LOC 是否與玩家目前位置一致，卡片只顯示同地點的英靈。

### `buildTagsPayload_`　<sub>Router_Action.gs:455</sub>

🆔 2026-07「整體重構·id優先」：舊版卡片只帶 name，前端只能用名字回指定這名從者(雙從者名字

撞前綴時就會選錯人)——補上 id，前端存起來隨後續 action 回傳，後端 findPcRowIdx_/

findPlayerServantIdx_ 才有 id 可用、不必再靠名字比對這條容易出錯的路。

### `buildTagsPayload_`　<sub>Router_Action.gs:482</sub>

🗡️ 理想鄉·無敵結界（阿爾托莉雅＋御主持 Avalon 禮裝）：被動自動·敵解放 6 階究極寶具且御主魔力≥100 時自動擋下(耗 100 魔)。此旗標僅供卡片資訊標籤

🐛→✅ 2026-07 玩家「檢查solo看看有沒有問題」稽核抓到：這裡的子字串比對(/阿爾托莉雅/.test)跟 Mystic_Code.gs injectMysticBuff_ 實際戰鬥判定用的精確全名比對不是同一份謂詞——子字串版本連「阿爾托莉雅・奧爾塔」這類變體都會誤判成真，且兩處各自維護早已漂移；戰鬥實際判定曾一度改比對到錯的短名「阿爾托莉雅」(已於同批次修正)，這裡的卡片旗標卻從未同步更新，導致卡片顯示「理想鄉已啟用」但實戰從未真正觸發。改成同一份精確全名比對，兩處判準統一。

### `buildClientState_`　<sub>Router_Action.gs:493</sub>

🐛→✅ 玩家實測抓到：漏傳戰爭標記，第四次限定地點(海特飯店等)會漏濾、出現在撤退突圍/鄰近地點清單裡（地圖本體 buildMapNodesPayload_ 有比對戰爭、這裡原本沒有，兩處各自兜規則導致不一致）。

### `buildTagsPayload_`　<sub>Router_Action.gs:541</sub>

🐛→✅ 2026-07 七度改版稽核抓到：原本只認KANSHOU_HERO_HOME_(7位種子英靈手寫豪邸)，隨機分配到泛用住處池的英靈永遠解鎖不了——改用kanshouGetHeroHome_統一讀取(手寫優先、查無讀【住處】隨機分配標記)，同 kanshouResidenceUnlocked_(Gallery.gs)那套判定同步。

### `buildTagsPayload_`　<sub>Router_Action.gs:554</sub>

🗺️ myLoc：玩家此刻所在地。鑑賞前端本來完全沒有這個資訊的可靠來源(只有 locationCounts 這種彙總數字)，導致「約定地點清單要排除你正站著的地方」之類的判斷做不出來。放進既有 payload＝零額外 round-trip，單一真實來源在後端。

### `buildTagsPayload_`　<sub>Router_Action.gs:558</sub>

🌙 夜未眠(Gallery.gs KANSHOU_NIGHT_SCENE_TAG_)：HUD 那顆鈕要據此把「🌙睡覺」換成「🌅睡到天亮」。掛在 tags 而非 play 回傳的頂層——tags 是前端的狀態通道(window._lastTags)，也會被STATE_AFTER_ACTIONS 重新拉，玩家重新整理頁面後按鈕不會退回錯的字。

### `actionUpdateRelTag`　<sub>Router_Action.gs:617</sub>

光靠姓名+下方「同行」門檻不保證是「我這局」的同行者；不同局剛好有同名同行從者仍會被誤改，

故需再比對呼叫者自己列的 game_id(myGameId 為空時放行，相容沒有 game_id 的舊資料)。

🔒 帳號歸屬驗證（2026-07 再稽核抓到的漏洞補上，見 resolveCallerGameId_ 說明）。

### `actionUpdateRelTag`　<sub>Router_Action.gs:631</sub>

🔒 2026-07 五度改版·自訂稱呼會被字面「TA是你的${tag}」原樣塞進AI提示詞當既定事實，玩家實測低好感就打露骨自訂稱呼會讓AI無視好感天花板照樣演到底——5階預設標籤(KANSHOU_REL_TIER_)本就由GAS依好感計算，不受此限；只擋「自訂文字不等於任一預設標籤」這條路徑。

### `actionUpdateRelTag`　<sub>Router_Action.gs:636</sub>

🐛→✅ 2026-07 逐按鍵稽核：舊版只擋「自訂文字」，預設 5 階一律放行，理由是「反正 GAS 會依好感自動升降」——但自動同步只在 BOND【變動時】才跑(kanshouSyncRelTier_ 的呼叫時機)。純聊天不變動好感的回合，好感 30 點一下預設的「戀人」就真的一路掛著，提示詞照寫「TA是你的戀人(好感:30)」，連低好感的口吻提醒都一起消失——正是這道門檻本來要擋的那個 injection，只是繞過方式從「打字」變成「點按鈕」。改成同一張表(KANSHOU_REL_TIER_.min)自己說話：沒到那一階就選不了那一階。

### `actionSetNickname`　<sub>Router_Action.gs:656</sub>

🔒 2026-07 五度改版·專屬稱呼比照 update_rel_tag 同一套bond門檻+同一個injection風險，玩家手動設定後寫入【稱呼鎖】旗標，讓AI的rel_changes.mutual_nicknames不再自動覆寫(尊重玩家的手動選擇，同kanshouSyncRelTier_對自訂關係稱呼「一旦手動改過就不再被自動覆寫」的精神)。

---

## `gas/Router_Battle.gs`

### `BATTLE_DEFER_WRITE_`　<sub>Router_Battle.gs:10</sub>

🚀 戰鬥寫入延遲旗標（速度：主戰鬥一次按鍵原本散落 30~50 次逐列 setValues，每次都是一趟慢 Sheets 往返）：actionFateBattle 主路徑把它設 true → 底下每擊會呼到的寫入 helper(fateStrike_/drainForNp_/settleShieldMana_/applyMasterStanceShare_/markMasterLostServant_)只改記憶體 pcData、跳過逐列寫；最後由 actionFateBattle 做【一次】整表 setValues 落盤(比照 actionMove 的單次寫回·全程握 ScriptLock 保證安全)。斬首分支在旗標設定前已 return、不受影響；其餘呼叫端(召喚海怪/移動)旗標恆 false、照常即時寫。GAS 每次執行重置模組變數，跨請求不會殘留。

### `settleShieldMana_`　<sub>Router_Battle.gs:16</sub>

⚔️ 單次出擊裁決：atkC 攻擊 pcData[tgtIdx]。命中才扣血（未中＝撲空、不自傷）。處理破戒/戰鬥續行/令咒緊急脫離/十二試煉復活/死亡(敵→勝利判定；我→敗北)。opts:{np,seal,counterMul}　ctx:{myGameId,pIdx,userData}

💠 「展開扣魔」防禦(七天盾)的帳單結算：引擎只在呼叫端注入 c._shieldMp(御主純魔)時才收費、記帳於c._shieldSpent，此處統一從御主純魔扣款落表。冪等：結算後清 _shieldSpent，重呼不重扣。

### `fateStrike_`　<sub>Router_Battle.gs:42</sub>

🍱 整備·進食加成：御主一行戰前整備過、且尚在效期內 → 從者出擊命中 +MEAL_BUFF_BONUS。⚠ 只屬於【我方陣營的出擊】——目標是我方從者＝攻擊者是敵人，不吃玩家的餐；盟友助攻亦非御主一行，呼叫端以 opts.noMeal 排除。

### `fateStrike_`　<sub>Router_Battle.gs:73</sub>

🐙 海怪掩護：持 summon_horror 者寶具解放後，深淵海怪在前以身擋傷——傷害先扣海怪肉身，潰散後才傷及本體。faction 無關；無「現存海怪」(未解放/已退場)時此段空轉。⚖️ 貫穿判定：summon_horror 在 CONCEPT_TIER 與 rho_aias 同 4 階(唯 6 階 ea/enuma 可貫穿)，沿用同一份offenseTier_/conceptTier_/PIERCE_GAP 算貫穿，與 rho_aias 同框架，高階概念寶具可直接無視護盾。

### `fateStrike_`　<sub>Router_Battle.gs:102</sub>

🐛→✅ 玩家實測抓到：這句舊版只要攻方帶 rule_breaker/anti_magic_lance 且這擊致命就無條件顯示「契約已破」，即使守方根本沒有 god_hand 可破(如 Weiss Schnee)也照樣跳出——沒破到任何契約，卻講得像破了什麼。斬斷救贖唯一實際作用是「原本會觸發 god_hand 復活，卻被搶先繞過」，故補上守方確實持有 god_hand 才顯示。

### `fateStrike_`　<sub>Router_Battle.gs:106</sub>

🛡️ 戰鬥續行＝受【致命傷】(after<=0)才觸發硬撐留 1——非「殘血 2~5 也被拖到 1」。「僅一次」由 hp>1 天然保證：撐過後站在 1 血，下一記致死擊不再觸發。

survive 與 god_hand 結構性互斥（別靠「種子資料別同時掛」自律）：兩者若同掛，survive 判定順序在前會免費接住致命傷、god_hand 燒命判定永遠輪不到。持有 god_hand 者一律優先吃 god_hand。

### `fateStrike_`　<sub>Router_Battle.gs:124</sub>

🐛→✅ 2026-07 稽核：多寶具英靈(如EMIYA)npAtkScale_只認永久技能字面、不看這次實際選了哪個寶具——改用npProfile_(atkC).scale(比照Engine_Fate.gs解放判定同款寫法)，讓選較弱寶具(如偽·螺旋劍)時不會被誤判成最強寶具(無限劍製)的規模去燒God Hand的命。

### `fateStrike_`　<sub>Router_Battle.gs:187</sub>

🐛→✅ 玩家指正：令咒＝絕對命令從者帶著本主一起強制撤離戰場，不是從者自己逃走、御主留在原地——舊版只在「本主剛好與從者同地」才一起搬，遠端御主完全不動，導致這對主從就此永久拆散(敵從者在 Time_World.gs 的世界自走裡沒有獨立移動機會，一旦拆開就再也碰不到面)。改成一律跟著撤離。

### `fateStrike_`　<sub>Router_Battle.gs:209</sub>

🕯️ 御主(非護衛斬首場)戰死 → 失去供魔的敵從者與令咒燒盡同一套下場：無「單獨行動」者掛 SEAL_DOOM_HOURS 倒數消滅，有「單獨行動」者靠靈基殘存苟活(見 enemyCanAffordNp_ 的 INDEPENDENT_ACTION_RESERVE)。斬首·護衛在場的即死已在上方 assassinGuardIdx 分支處理，此處只補「無護衛」的一般陣亡路徑。

### `pushMatching_`　<sub>Router_Battle.gs:264</sub>

🎬 收集素材字串共用 helper：把 arr 內符合 regex 且尚未出現在 target 裡的字串各自 push 進 target(依 target 去重·非依 arr 自身)。2026-07 稽核抽出，取代 aiPrompt 組裝處 4 段幾乎一樣的「掃陣列+regex.test+indexOf去重+push」重複迴圈(對轟/我方出擊/敵反擊/敵盟協防四種來源共用同一份)。

### `OFFENSIVE_NP_ATK_FX_`　<sub>Router_Battle.gs:274</sub>

⚔️ 「攻擊型寶具」判準（只有這類寶具才觸發對轟/敵方反擊解放；純防禦/召喚型如 God Hand、summon_horror單獨的召喚體本身不算，但 summon_horror 這個 fx 本身代表深淵召喚攻擊、算攻擊型）——2026-07 稽核發現對轟(原CLASH_OFF_FX)與敵反擊(原ECF)兩處清單本應同一套標準(註解皆明講「與對轟同準」)，卻各自維護、對轟那份漏了 summon_horror，兩處判定不一致。統一成單一真實來源，以較完整的敵反擊版為準。

### `BATTERY_HP_PER_MP`　<sub>Router_Battle.gs:292</sub>

🔋 御主電池（出力電池制 2026-06）：從者【沒有自有魔力池】，寶具/技能魔力全由御主供——付款順序：①御主 MP(主資源) → ②御主 HP(2 HP 換 1 MP，焚血供能、御主血量不可低於 1)。寫回試算表並回傳明細，供戰報／敘述演出「拿御主當電池」。fromSv 恆 0（保留欄位相容舊戰報）。

### `drainForNp_`　<sub>Router_Battle.gs:320</sub>

🐛→✅ 稽核抓到：mHp本已是0(如令咒反噬致死·actionUseSeal的sealManaKill分支)時，Math.max(1,...)保底會把已宣告defeat的御主HP悄悄寫回1、形同無聲復活——御主死亡不像從者有DEAD_前綴這種持久終局標記，純靠HP數值本身，一旦被這類「保底1」邏輯誤觸就會跟前端已顯示的defeat狀態互相矛盾。只在御主本來就還活著時才套用保底。

### `applyMasterStanceShare_`　<sub>Router_Battle.gs:373</sub>

🩸 傷害轉移：從者剛吃了 dmg(fateStrike_ 已寫入從者HP＋sheet)，御主依風格「討回」share 比例替其承受——從者HP回補 shared、御主HP扣 shared，兩列即刻寫回 sheet(與 backlash/drainForNp_ 同一套逐事件寫法)。御主不因分擔而死(保底1)；已瀕死(≤1)則無力再擋。回實際分擔值(供戰報)。

### `actionFateBattle`　<sub>Router_Battle.gs:405</sub>

🐛→✅ 稽核抓到：御主死亡(如令咒反噬)沒有像從者DEAD_那樣的持久終局標記，純靠HP=0這個數值——前端雖在收到defeat:true後鎖UI，但那只是前端節流、非後端強制。若在鎖生效前(多分頁/callback競態/直打API)再送一次fate_battle，drainForNp_等御主血量保底邏輯會把HP=0悄悄寫回1，跟已回報的defeat狀態互相矛盾。這裡在入口統一擋下，比逐一修補每個保底寫入點更根本。

### `actionFateBattle`　<sub>Router_Battle.gs:412</sub>

🗝️ 雙從者：若指定出戰從者(userData.servant/servantId)則用之，否則取第一個在世從者

🐛→✅ 舊版用 String(name).includes(wantSv) 子字串比對挑選出戰從者，雙從者其一真名恰為另一人前綴/子字串時(如「阿爾托莉雅」vs「阿爾托莉雅・奧爾塔」)會選錯人出戰——先改精確相等比對，2026-07「整體重構·id優先」再進一步改走單一真實來源 findPlayerServantIdx_(id優先、名字才走nameLoose_精確比對)，跟其餘13處呼叫端同一套邏輯，不再各自維護一份。

### `actionFateBattle`　<sub>Router_Battle.gs:497</sub>

🐛→✅ 玩家實測抓到：雙從者斬首時 servantCard_ 呼叫2~3次(攻方1~2名+護衛1名)，每次都各自帶一份完整的「怎麼演」收尾句——改成每張卡skipClose，收尾句用 performanceNote_() 統一講一次。

### `actionFateBattle`　<sub>Router_Battle.gs:528</sub>

戰鬥確定開打 → 耗 1 AP（推進 2 小時）

🐛→✅ 舊版沒傳 skipWrite，這裡立刻寫一次 DAY/HOUR/AP，之後不管走斬首分支(現已批次收尾)還是主戰鬥路徑(1370行整表 setValues)都會把同一批值再送一次——比照 Router_Economy.gs 的actionManaSupply/actionSpiritRepair 既有寫法補 skipWrite=true，兩處都吃記憶體 pcData 就好。2026-07 稽核：改用共用 chargeApOrReject_(467行已提前擋過門檻，這裡只借它做扣費+算clock，.reject分支理論上不會命中，同其餘12處呼叫端一致的寫法)。

### `actionFateBattle`　<sub>Router_Battle.gs:543</sub>

🐛→✅ 斬首分支舊版從沒套用 BATTLE_DEFER_WRITE_ 批次寫回——下方每個 fateStrike_ 級寫入各自即時 setValues 一次，雙從者斬首失敗最壞可一次觸發 5+ 次個別 Sheets 寫入。改成跟主戰鬥路徑同一套：進分支就開批次旗標，分支結尾 return 前只發一次整表 setValues。

### `actionFateBattle`　<sub>Router_Battle.gs:553</sub>

🐛→✅ 斬首這整條分支的三份 asnPrompt 從沒附上任何演出依據卡——AI 被要求「依『${crit.name}』的職階與真名自行演出」致命手段、演出護衛反噬的反應、演出敵御主之死，卻連從者/護衛的性格卡、御主本人的演出依據卡都沒拿到，等同要求它憑空捏造。比照主戰路徑(ourMasterCardStr)補齊：我方出擊從者(含雙從者)＋御主本人＋護衛從者＋目標敵御主，四張卡一次備好、三個分支共用。

### `actionFateBattle`　<sub>Router_Battle.gs:613</sub>

🐛→✅ 這整段是斬首反噬的死亡結算迷你版，跟 fateStrike_ 是兩套各自手刻的邏輯——本 session 已在fateStrike_ 修好「god_hand 優先於 survive、且兩者都受 severed(rule_breaker/anti_magic_lance)阻斷」，卻沒同步套用到這裡：舊版 survive 檢查無條件先撐 1 血，god_hand 的 after<=0 判斷永遠進不去，同時持有兩者的從者在這條路徑白嫖一次續命、十二試煉命數帳目跟主戰鬥路徑對不上；也完全沒有severed 判定，護衛就算持破戒/反魔力兵裝也繞不過這兩種免死。

### `actionFateBattle`　<sub>Router_Battle.gs:614</sub>

🐛→✅ 批次寫回收尾：分支內每擊只改了記憶體 pcData，這裡一次整表 setValues 送出，取代原本每個 idx 各自即時寫入的多趟 round-trip。

### `actionFateBattle`　<sub>Router_Battle.gs:690</sub>

🐛→✅ 同drainForNp_一款漏洞：_mHpNow本已是0(令咒反噬致死等)時，保底1會讓已defeat的御主悄悄復活成HP=1。御主死亡無DEAD_可擋，只在本來還活著時才套保底。

### `actionFateBattle`　<sub>Router_Battle.gs:710</sub>

🔥 灌魔加乘：規格外寶具(＋/EX)於【全開 100%】時，把御主餘裕魔力超載灌入 → 威力線性放大至上限(＋×1.5、＋＋/EX×2)。超載＝固定價格檔位、依寶具階等比(A階＝總耗 220/440/660，即底費P/2P/3P)，魔力優先支付、不足才焚血(drainForNp_ 2HP=1MP)。userData.overload：false＝僅底費／'p1'＝超載檔(總價2P·灌P)／'p2'＝極限檔(總價3P·灌2P)／true·'blood'·未帶旗標(舊前端/敵方)＝相容檔。過充 token 只無償折抵超載段。

### `actionFateBattle`　<sub>Router_Battle.gs:767</sub>

🎲 從者主動技已改「被動化」(玩家 2026-07 定案)：不再有手動「⚡主動」按鈕、不扣魔、無微效保底——改為每一擊獨立擲 SKILL_PROC_ 機率自動【全效】發動(見下方 rollSkill_，於 rounds 迴圈與開場對轟各自擲)。skillFired 只記「本戰至少發動過一次」，供敘述/戰報標示。

### `actionFateBattle`　<sub>Router_Battle.gs:793</sub>

🌟 寶具對轟（光與光的對撞）：玩家開場解放寶具、目標為敵從者時，值得一戰的對手以寶具相迎。雙方先算「寶具火力」→ 高者壓過低者，差額貫穿敗方、勝方僅受少量回震；火力相當(±10%)則相抵僵持。★ 對轟輸方不致死：差值再大也只打到 1 HP——英雄倒下前總能拼出最後一口氣。

### `actionFateBattle`　<sub>Router_Battle.gs:798</sub>

🐛→✅ 對轟的兩記 fateStrike_(eHit/pHit) 也可能觸發「戰鬥續行」/「斬斷救贖」，但下方 extraFired 只掃過 rounds[] 裡的一般交鋒，對轟從沒推進 rounds——這兩個關鍵轉折發生在對轟時會整個漏講給 AI。在此收集，稍後併入 extraFired。

### `actionFateBattle`　<sub>Router_Battle.gs:829</sub>

敵方火力取樣須補 servantActiveSkill_(敵AI恆全效免費)：burst/str_up/projection 是主動 only 技能，漏帶會讓持這三技的敵從者開場對轟火力系統性偏低。

💠 對轟中敵寶具轟向我方從者＝七天盾的正戲：注入御主純魔供其展開(削 ePow)，取樣後立即結算費用

### `actionFateBattle`　<sub>Router_Battle.gs:853</sub>

★ 對轟【回震】不致死(勝方/僵持方吃的是餘波)：夾到至多打到 1 HP，避免「同一場先記勝又記敗」的勝敗雙記。輸方(outcome='enemy')在上方已同樣保 1；唯獨敵方因果律截斷(pLethalOk)是刻意例外——那本就該真的打死(死亡在投擲前已確定)，不能被這道通用保命線攔下，否則會架空必死分支。

### `actionFateBattle`　<sub>Router_Battle.gs:860</sub>

🐛→✅ 2026-07 稽核抓到：跟上方 eHit 同一套判定卻只做了一半——這擊若剛好打死我方出戰從者(因果律截斷組合可跳過保1)，舊版只 push knockedOut，從沒把 destroyedName/godRevived 補上，跟五路稽核已修過的敵反擊/敵盟協防「死了卻沒告訴AI」是同一種 desync，只是漏了對轟這條路徑。

### `actionFateBattle`　<sub>Router_Battle.gs:867</sub>

🎌 御主參戰風格·對轟回震也替從者分擔(非致命時)

🐛→✅ 舊版只擋 !pHit.defeat(最後一名從者才算)，雙從者出戰時這擊若打死非最後一名從者，pHit.defeat 不成立、但 pHit.knocked 已標記該從者陣亡——沒補 !pHit.knocked 會對著fateStrike_ 剛寫成 DEAD_/HP=0 的那一列回補血量、還白白扣一筆御主HP去「保護」一個已經不在的人。

### `actionFateBattle`　<sub>Router_Battle.gs:873</sub>

🐛→✅ enemyNp 舊版只存 MARTIAL 欄原始字串(可能含未選中的其他寶具/未拆真名)，AI 演對轟這場「全場最戲劇性時刻」時卻從沒被告知敵方這次實際解放的真名是哪一個——比照玩家自己的 npName拆法，用已選定的 enemyC0.npChoice 算出這次真正解放的那把。

### `actionFateBattle`　<sub>Router_Battle.gs:873</sub>

🩹 每回合涓流回血（約 2.5%×階/回合·上限30）：兩種來源——①原初符文運用為 regen(玩家選模式)②持有專屬治癒 fx `regen`(回復魔藥/狐之治癒等·常駐、無需選模式)。標籤顯示技能自己的名字。

### `actionFateBattle`　<sub>Router_Battle.gs:879</sub>

🐛→✅ 稽核抓到：這裡現建的rc沒呼叫injectMysticBuff_(對照上面攻擊迴圈的sC有呼叫)，導致Avalon注入阿爾托莉雅的「鞘之恩澤」regen fx永遠讀不到——理想鄉的時回加成完全死碼。補上。

### `actionFateBattle`　<sub>Router_Battle.gs:890</sub>

🤝 協同強襲（同盟背景生效）：同地盟友從者（敵從者＋盟約在身）對「共同敵人」每回合助攻一擊。原作依據：第五次冬木·遠坂凜＆Archer 為士郎掩護夾擊、聯手圍攻 Caster／Berserker。盟友提供掩護火力，只助攻、不被本場反擊（風險已由盟友自身承擔），讓「養同盟」在戰場上真正有感。

### `actionFateBattle`　<sub>Router_Battle.gs:916</sub>

🐙 螺湮城教本(變身框架)：青鬍子解放寶具【或戰前召喚】→ 深淵海怪在場(狀態存 MEMORY·無期限·魔力維持制)。在場則：以肉身擋傷(fateStrike_)＋每回合再生＋並肩追擊(每交鋒回合抽 HORROR_UPKEEP)＋本體防禦升對城規模(npDefScale)；場外每小時另抽 HORROR_HOURLY_UPKEEP(applyRegen_·池赤字海怪先沉)。★寶具解放當下(重新)召喚·刷新肉身；已在場則沿用。

### `actionFateBattle`　<sub>Router_Battle.gs:950</sub>

npOverloadMul/overcharge 只設在 atkC 上、不存進 MEMORY，而 sC 是每回合重新建的新物件讀不到——除了對轟分支直接用 atkC 外，一般路徑(多數情況)都走這條每回合迴圈用 sC 結算，需手動複製過去，否則玩家已付超載代價卻吃不到超載倍率/過充加成。

### `actionFateBattle`　<sub>Router_Battle.gs:1045</sub>

🐛→✅ 漏檢查 sealEscaped/godRevived：盟友這擊若把敵從者打到燃令咒脫離，fateStrike_ 內部已經把該敵從者 HP 設 1、LOC 改成撤退地點(令咒脫離不標 DEAD_)，但這裡沒讀 aps.sealEscaped，主流程完全不知道敵人已經跑了——下方「敵反擊」段落只檢查 !DEAD_，仍會讓一個已經逃到別處的敵人繼續反擊。

### `actionFateBattle`　<sub>Router_Battle.gs:1057</sub>

🐛→✅ 同上一併補齊：敵盟協防這擊一樣可能打死/救活我方從者，舊版只讀 defeat/hit。

### `actionFateBattle`　<sub>Router_Battle.gs:1113</sub>

🗡️ 理想鄉·無敵結界（被動自動·概念 7 階·專剋 6 階究極寶具）：敵本回合解放【6 階概念寶具】(ea/enuma·會碾穿一切防禦·一發足以秒殺)、目標為阿爾托莉雅(持 Avalon)、且御主純魔 ≥100 → Avalon 自動展開無敵結界、完全擋下該發＋扣 100 魔。普通寶具(＜6階)不勞理想鄉·靠基本鞘減傷(×0.82)＋六圍扛。付不起 100 魔則張不起。

### `actionFateBattle`　<sub>Router_Battle.gs:1136</sub>

🐛→✅ 玩家自己解放寶具已有 npName 讓 AI 高呼真名(見下方)，敵方反擊解放寶具卻從沒對稱處理——GAS 明明已經算出 enemyNow.npChoice/敵方寶具真名，卻沒餵給 AI，導致敵反擊即使是寶具等級的一擊也可能被演成普通揮拳，跟「這是 Fate 寶具解放的靈魂」這條設計鐵則自相矛盾。

### `actionFateBattle`　<sub>Router_Battle.gs:1140</sub>

🐛→✅ 玩家實測抓到：我方出擊(ps)/深淵海怪(hs)都完整檢查 destroyed/knocked/godRevived/sealEscaped，敵反擊(es)舊版只讀 defeat/hit——雙從者出戰時，敵反擊打死的若不是最後一名從者，defeat 不成立，destroyedName/knockedOut 完全不會被設，AI 戰報與前端都不知道這名從者剛剛死了；同理若這擊該觸發十二試煉復活/令咒脫離，godRevived/sealEscaped 也會整組漏掉。

### `actionFateBattle`　<sub>Router_Battle.gs:1149</sub>

🎌 御主參戰風格·替從者分擔：只在從者挨了非致命一擊時，御主討回 share 比例的傷勢自己扛。

🐛→✅ 舊版只擋 !es.defeat，雙從者出戰時這擊打死非最後一名從者不會使 defeat 成立，但 es.knocked 已標記陣亡——沒補 !es.knocked 一樣會回補死者HP、白扣御主HP。

### `actionFateBattle`　<sub>Router_Battle.gs:1165</sub>

🐛→✅ pds.fired 舊版從沒被讀取——敵盟協防者身上任何 fx 觸發(如王之財寶彈幕/morale加成)、以及萬一觸發「戰鬥續行」「斬斷救贖」這類關鍵轉折，全部悄悄消失，AI 跟玩家都看不到這名協防者實際做了什麼，只剩一句籠統的「並肩馳援」通用台詞。

### `actionFateBattle`　<sub>Router_Battle.gs:1197</sub>

🐛→✅ 玩家實測抓到「明明是我方從者被敵方回擊打死，戰報卻還在問接下來怎麼辦」——根因是下面這幾處凡 destroyedName 為真就無條件當成「defC(這場一開始鎖定的敵方目標)死了」，從沒考慮 destroyedName實際上可能是我方從者自己的名字(敵方回擊/NP對轟回震/敵盟協防致死時)。此戰若還有其他從者存活，defeat 不會是 true(見 fateStrike_ 的「雙從者」判定)，於是走進這支 finalLine／終局指令／收尾指令，卻把「我方死了」誤講成「defC死了」，AI 收到自相矛盾的事實只能各自表述。

🛡️ 穩健：不能只比對 destroyedName===atkC.name——雙從者出戰時，敵方回擊/敵盟協防的目標(ctgt/ctgt2)在 atkC 已陣亡時會改打另一名在世從者(見上方「alt/alt2」邏輯)，那種情況死的是「我方」但不是 atkC。改直接查 destroyedName 那一列在 pcData 裡的真實 FACTION 是否為「從者」，涵蓋所有我方陣亡路徑，而非只堵已回報的那一種。

### `actionFateBattle`　<sub>Router_Battle.gs:1212</sub>

🐛→✅ 殺死敵御主這條路徑(fateStrike_ 的 killedIsMaster 分支)結構上不會設 victory=true(勝利判定只掛在殺死「敵從者」的 isFoeSv 分支)——這裡原本的 victory 三元式恆假、是條死路，誤導成「殺死御主也可能直接奪杯」，清掉避免以後有人真的想接上卻搞錯判定分支。

### `actionFateBattle`　<sub>Router_Battle.gs:1241</sub>

🐛→✅ 玩家實測抓到：雙方都還將近滿血(如450血只交換了30~40傷害)時，光憑「這回合誰吃多一點」的比例(1.3倍)就敢講「明顯佔上風」，AI 順著這句錨點就把開場試探寫成「敗象已現/不對稱壓制」的決定性戰局——跟兩邊血條幾乎沒少的實況完全對不上。補一道「本回合交換總傷害佔血池門檻」，沒到門檻(表示雙方都還沒真的傷到彼此)一律先講「仍在試探」，不夠格說誰佔上風/被壓著打。

### `actionFateBattle`　<sub>Router_Battle.gs:1257</sub>

🎭 敵從者演出卡：附上敵從者卡，讓性格/口吻/狂化禁言有依據，而非全靠 AI 憑真名即興；同一張 servantCard_，狂化「嚴禁台詞」鐵則對敵方一併生效。

🐛→✅ 玩家實測抓到：這場戰鬥可能同時呼叫servantCard_多達4次(我方/敵方/盟友/敵盟協防)，每次都各自帶一份完整的「怎麼演」收尾句——四份幾乎一樣的收尾句擠在同一個提示詞裡純屬浪費。改成每張卡都skipClose，收集這場戲實際出現的所有真名，在下方組裝aiPrompt時用 performanceNote_() 只講一次。

### `actionFateBattle`　<sub>Router_Battle.gs:1274</sub>

🐛→✅ 開場即解放寶具那一擊，若骰輸(揮空)：舊碼不論命中與否都無條件講「解放了寶具、高呼真名」，跟 roundsBrief 裡那行「揮空」的事實對不上——AI 收到的是單方面的「勝利宣告」指令，沒被告知這發NP 落空了，只能自己含糊帶過(玩家回報「寶具失手 沒有演出」)。這裡補回命中與否的判斷，讓落空的那一發也有專屬、對得上數字的演出指令，而不是被無條件的「唸名·得意」蓋過去。

### `actionFateBattle`　<sub>Router_Battle.gs:1281</sub>

🎌 御主參戰風格·並肩感（每場【必給】·2026-07 玩家回饋「御主扣血卻沒一起上陣的感覺」）：御主體術/魔術/分擔血量這三個訊號若都沒觸發(常見：御主無體術魔術數值＋見機行事5%小傷攤成0)，AI 完全收不到「御主在場」的訊號→只演從者孤軍奮戰。故不論數值，每場都給御主當下的參戰姿態，讓 AI 演出並肩作戰的臨場感；masterShared>0 再追加「以身擋傷」的具體代價。

### `actionFateBattle`　<sub>Router_Battle.gs:1297</sub>

🎴 每擊 pFired 陣列存了戰鬥中觸發的特殊機制旗標；十二試煉／令咒脫離已各自走專屬素材行(godNote/sealNote)，但「戰鬥續行」(致命傷卻硬撐留1)／「斬斷救贖」(此類護命效果被破戒/反魔力兵裝之類的手段強行突破)這兩種只進了 pFired、從沒進過 aiPrompt——AI 看不出「這下明明該死卻沒死」或「原本免死的招式這次被打穿了」的關鍵轉折，收攏成一句素材補上。

🐛→✅ 對轟(clash)的兩記 fateStrike_ 一樣可能吐出這兩個旗標，但只掃 rounds[] 會漏掉——clashFired(上面對轟區塊收集)併進來源，開場那發對轟若剛好觸發戰鬥續行/斬斷救贖也講得出來。

🐛→✅ 敵反擊(rl.eFired)／敵盟協防(rl.pactDef.fired)舊版完全沒被這個收集掃到——只掃了我方出擊的pFired，若戰鬥續行/斬斷救贖是敵方那一擊觸發的(如敵反擊本該致死卻被續行撐住)，AI 一樣收不到訊號。四段來源(對轟clashFired／我方strikes.pFired／敵反擊eFired／敵盟協防pactDef.fired)掃描邏輯完全一樣、只差來源陣列——2026-07 稽核抽成 pushMatching_ 共用 helper，一處改規則四處生效。

### `actionFateBattle`　<sub>Router_Battle.gs:1313</sub>

🥋🔮 御主體術/魔術參戰：跟上面同一種「有記錄沒講給AI聽」的落差——這兩個 fx 每擊都可能悄悄加傷害，卻從沒被塞進 aiPrompt，AI 完全不知道御主動手了，只能憑空演出御主在旁乾看/捏著寶石不出手的空氣戲。我方出擊的 fired 進 strikes[].pFired；敵方反擊的 fired 是獨立存在 rl.eFired(不在 strikes[] 裡)，兩邊各自查，才不會漏掉敵御主(如凜的魔術)明明在戰報數字裡出力、敘述卻對此隻字不提。四行只差「來源陣列(我方/敵方)×關鍵字(體術/魔術)」——資料驅動：來源先各自攤平一次，再兩個關鍵字各查一次。

### `actionFateBattle`　<sub>Router_Battle.gs:1329</sub>

🐛→✅ 御主本人的「演出依據」卡(魔術系統/體術階/身世/性格)之前從沒進過這支戰鬥 aiPrompt——AI 只收到上面 _masterStanceLine 那句抽象姿態指令(「伺機介入」)，具體要怎麼參戰毫無憑據，便自行編造出跟角色設定無關的招式(如「甩出魔術迴路干擾」)，玩家反應「超級出戲」。這裡補上masterCard_，讓 AI 依御主真實的魔術系統/體術/身世去想像參戰畫面，而非憑空捏造。

### `actionFateBattle`　<sub>Router_Battle.gs:1334</sub>

🐛→✅ allyAssistName/pactDefName 都是真實參戰、每回合實際落血的角色(協同強襲/敵盟協防)，但過去aiPrompt 只提過其名字一次，從沒附上 servantCard_——AI 被要求演出他們助攻/馳援的畫面卻毫無性格依據。比照 foeServantCardStr 的既有慣例補上。

### `actionFateBattle`　<sub>Router_Battle.gs:1377</sub>

🐛→✅ destroyedName 為真時，上方 finalLine 只在數字摘要那行提過一次「已消滅」，下方卻仍會走到line ~1231 那句通用的「演出互有攻防的交鋒」收尾指令——AI 沒被【明確】告知這是終局、於是自行接著編出敵人死而復生繼續攻擊、我方角色詢問「接下來怎麼辦」的續戰畫面(玩家回報「都把對面宰了為啥還這樣敘述」)。這裡補一句不可退讓的終局指令，擋在收尾指令之前。

🐛→✅ 玩家實測抓到更深一層：這句舊版無條件講「defC死了」——若這場其實是我方 atkC 被敵方回擊打死(ourSideDestroyed，此戰仍有其他從者存活、defeat 未必為真)，講法整個講反，AI 收到自相矛盾的事實只能各自表述(玩家回報「我方從者死亡沒告訴AI嗎」)。依 ourSideDestroyed 分流講法。

### `actionFateBattle`　<sub>Router_Battle.gs:1395</sub>

🗡️ 戰鬥未分生死時，讓從者依性格對這回交手給出主觀判斷/建議——純角色觀察與口吻，不是戰略指令；狂化角色改用肢體/低吼傳達，服從 servantCard_ 已內建的「嚴禁完整台詞」鐵則。

🐛→✅ 玩家實測抓到：「值得乘勝追擊還是該見好就收」這句範例文字太具體，同一場戰鬥拖好幾回合時，模型每回合都套用近乎同一種「要不要撤退/繼續」問句收尾，讀起來像跳針。範例改給更多樣的角度、並點名連續回合別重複同一種。「不可替御主拍板下一步」這條規則 `ourMasterCardStr`(=masterCard_，見下方 aiPrompt 組裝已固定排在最前面)已經講過一次，這裡不重複，省字數。

### `actionSummonHorror`　<sub>Router_Battle.gs:1450</sub>

🐙 戰前召喚·螺湮城教本：不進戰鬥、先自深淵召出「深淵海怪」變身態（無期限·魔力維持制）。持 summon_horror 的我方從者→付寶具 prana(御主電池·同解放)＋耗 1AP。在場則：以肉身擋傷＋每回合再生＋並肩追擊(每交鋒回合抽 10 魔)＋本體防禦升對城規模；場外每小時另抽 HORROR_HOURLY_UPKEEP 魔(applyRegen_·池赤字時海怪先沉回深淵、才輪到御主燃血)。玩家可隨時「解除召喚」(actionDismissHorror·免費即時)止住時耗；重召須再付全額 prana。★這是「變身框架」的戰前入口——日後其它變身技(靈基二階段等)照此模式加一個 action 即可。

### `actionSummonHorror`　<sub>Router_Battle.gs:1483</sub>

⚖️ 刻意不設「出力 100%」閘(與戰鬥內解放的差異)：戰鬥中解放要全開是「臨戰瞬間灌注」的張力；戰前召喚是不趕時間的儀式詠唱(出力檔本就免費即時可調·設閘只是無意義的點擊摩擦)。prana 全額照付。

🔋 付寶具 prana（御主電池·MP＋焚血）：湊不出則召不動。用 npEffectiveRank_ 與同檔其餘呼叫點一致(單一真實來源)，避免未來 summon_horror 若掛到多寶具英靈身上時算錯魔力費。

### `actionSummonHorror`　<sub>Router_Battle.gs:1496</sub>

2026-07 稽核：改用共用 chargeApOrReject_(1467行已提前擋過門檻，這裡只借它做扣費+算clock；不傳skipWrite——drainForNp_剛才的整列寫回發生在AP扣款【之前】，DAY/HOUR/AP仍需這裡自己的窄欄寫入，跟actionFateBattle那種"稍後還有一次整表寫回"的情境不同，不能省略這次寫入)。

### `setPlayerSeals_`　<sub>Router_Battle.gs:1547</sub>

寫回令咒餘量（回傳更新後的 MEMORY 字串）

🐛→✅ 稽核抓到：makeIntTag_ 泛用 set() 無下限鉗制，且底層【令咒】(\d+) 不支援負號——萬一日後哪處扣點漏做「先擋門再扣」寫出負值，下次讀取會直接配對失敗、靜默退回 defaultVal=3(令咒憑空復活，比單純負值更隱蔽)。比照 setOvercharge_ 同款鉗制，斷絕負值出現的可能。

### `clearDoom_`　<sub>Router_Battle.gs:1564</sub>

🐛→✅ 稽核抓到：結盟只讓Time_World.gs的世界tick跳過死線檢查(isAllied_→continue)，不是取消死線本身；解盟(actionBreakAlliance/breakStaleAlliances_)過去只clearAllyMem_、沒清【靈基透支】——結盟期間絕對時鐘持續前進，死線可能早已過期，一旦解盟isAllied_變false，下次tick立刻讀到過期死線、該敵從者瞬間「令咒耗盡消滅」，敘事跟「剛結束同盟」完全脫節，甚至可能誤觸終局勝利判定。比照actionRuleBreakSteal奪僕路徑同款清法，補上共用清除函式。

### `HORROR_SHIELD_HP`　<sub>Router_Battle.gs:1575</sub>

🐙 海怪護盾 ＝ 深淵海怪的「肉身血池」：螺湮城教本解放後，海怪自深淵現身、以身掩護術師——傷害先扣海怪、海怪潰散後才傷及本體；每回合自深淵汲魔再生；逾時退場。單一真實來源＝MEMORY【海怪護盾】<cur>|<max>|<expiryAbsHour>（三欄·舊兩欄相容讀取）。要擴充「召喚物掩護」類技能：照此 get/set/clear + view 模式複製即可。

### `horrorPresent_`　<sub>Router_Battle.gs:1583</sub>

才輪到御主燃血】(見 applyRegen_)。無期限、玩家可隨時解除。

🐙 變身框架·單一狀態源：海怪是否在場＝現存肉身(cur>0)且(若帶舊制碼表)未逾時。擋傷/回血/追擊/城防 全讀它。★這是「MEMORY 狀態旗標→引擎讀旗標調整攻防」的通用變身範本；日後靈基二階段/化身切換照此複製。

🐛→✅ 稽核抓到：這4支helper(horrorPresent_/clearExpiredHorror_/mealBuffActive_/horrorShieldView_)原本呼叫getClock_都沒傳pcData，每次呼叫端手上明明已有整表卻又整表重讀一次「眾生」——`fateStrike_`每次出擊按鍵最多呼叫近10次，是目前查到影響最大的一處。統一補上可選第3參數pcData透傳給getClock_，呼叫端有pcData就傳、省掉這些重讀。

---

## `gas/Router_Bond.gs`

### `actionUseSeal`　<sub>Router_Bond.gs:71</sub>

🐛→✅ 稽核抓到：舊版每個分支各自 setValues 立即寫回(repair 2次/mana 最多3次/escape 2+N名同行者迴圈內各寫一次)，效果先落地、令咒扣減卻在函式最後才發生——任何一次中途失敗都會讓玩家拿到效果(回滿血/回滿魔/脫離)卻沒真的扣到令咒。比照 actionFateBattle 既有的 BATTLE_DEFER_WRITE_批次寫回引擎(複用、不加特例)：全程只在記憶體改 pcData，函式尾端單次整表寫回，read+write各一次，效果與扣令咒同一次寫入落地，也順手解決了迴圈內逐一 Sheets I/O 的GAS速度反模式。

### `actionUseSeal`　<sub>Router_Bond.gs:105</sub>

絕對命令跳過「同意」，好感是否足夠決定這是幸運還是致命：≥MANA_TRUST_BOND_→仍生效但只是「太浪費了」的調侃，複用既有「過充」機制當額外好處；<MANA_TRUST_BOND_→強制壓下意志，解除瞬間積怨反噬直接了結御主，複用既有「假夢→老虎道場」死亡流程(buildDreamPrompt_)不另開一套。

### `actionUseSeal`　<sub>Router_Bond.gs:125</sub>

🐛→✅ 玩家實測抓到：破戒奪僕可讓玩家合法擁有兩名同行從者(IS_PARTY==="同行")，舊版緊急脫離只搬findPlayerServantIdx_ 挑出的「這一個」，第二名同行從者的 LOC 完全沒被觸碰——燃掉全局僅3道的令咒卻沒真正帶走全隊。比照 actionMove 早就用「所有 IS_PARTY===同行」的迴圈搬人，這裡補上同一套。

### `actionBond`　<sub>Router_Bond.gs:242</sub>

⏳ 相處耗 1 AP＝推進 1 小時（2026-07 玩家定案·與令咒/偵查同級：相處也要花時間）

🔧 bondAp 非Fate局故意留 null(不同於其餘呼叫點的 AP_PER_DAY 預設)——鑑賞局本就不耗AP，維持原本區別，不硬套 chargeApOrReject_ 的通用預設值。

🐛→✅ 稽核抓到：原本MEMORY單格寫回後，chargeApOrReject_(isFate分支)沒帶skipWrite又對同一pIdx列寫一次DAY/HOUR/AP——高頻動作(相處)每次多1次Sheets I/O。改成MEMORY先只改記憶體、chargeApOrReject_加skipWrite，下面一次整列寫回涵蓋MEMORY+AP/day/hour。

### `actionBond`　<sub>Router_Bond.gs:252</sub>

🐛→✅ 舊版又即時讀一次 Sheets 拿「最新羈絆值」，但 raiseBond_(229行) 早已在同一份 pcData陣列上原地改過(svIdx 與 raiseBond_ 內部依名字找到的列是同一列，同 game_id 下從者名字唯一)，pcData[svIdx][COL.PC.BOND] 這裡就已經是最新值，改直接讀記憶體，省一趟純浪費的 Sheets 讀取。

### `actionBond`　<sub>Router_Bond.gs:254</sub>

🐛→✅ 舊版給AI「重情者強撐護主、疏離者未必」這種二選一，卻沒講此刻bondNow實際落在哪一邊——GAS早算好這個數字(241行)，比照 actionAllyBond 的tier分級，直接定調而非讓AI自己猜個性夠不夠重情。

### `actionBond`　<sub>Router_Bond.gs:257</sub>

🐛→✅ 舊版無條件講「重創」，比照撤退追擊/歇息夜襲同款修法，換算實際傷勢用詞。

### `actionBond`　<sub>Router_Bond.gs:266</sub>

⚔️ 卸防突襲：相伴談心時門戶大開，同地若有清醒敵從者→趁隙重擊

🐛→✅ 稽核抓到：雙從者情境下漏帶 svIdx，突襲內部會裸抓「第一位」從者，可能跟這裡敘事引用的「正在相處的這位」對不上(玩家挑第二從者相處，卻演成/打到第一從者)。補帶已解析好的 svIdx。

### `actionBond`　<sub>Router_Bond.gs:271</sub>

⚔️ 卸防突襲三分派(單一真實來源 ambushDispatchPrompt_)：normalFn 內再依 milestone 是否命中細分——milestone 的「標記已演出」寫回刻意只在這裡(無突襲)落地，被突襲打斷時故意不標記(留到下次順利相處再演出，不因意外奇襲永遠錯過)，這個既有行為不變。

### `actionBond`　<sub>Router_Bond.gs:278</sub>

🐛→✅ 舊版只給「由你自行定調羈絆深淺」這種抽象指令，GAS 明明手上就有 bondNow 這個確切數字(跟 actionAllyBond 的 tier 分級同一套邏輯)，卻沒換算成濃淡定調餵給 AI——比照補上。

### `actionBond`　<sub>Router_Bond.gs:290</sub>

🐛→✅ milestone(30/60/90)只用來內部判斷寫回標記，從沒告訴AI是哪一道門檻——三道門檻的量級差很大(30是初次鬆動、90是近乎告白的敞開)，AI卻只拿到同一句「依羈絆的深淺」自己猜，等於GAS明明知道答案卻不講。改成依milestone分流具體量級提示。

### `masterPersonaLean_`　<sub>Router_Bond.gs:349</sub>

🐛→✅ 稽核抓到：MEMORY是全部跑分狀態tag的大雜燴，其中【從者】/【御主】(硬連結夥伴真名，Seed_Rivals.gs)、【交惡】NAME:day(setEnemyFeud_)等tag會把「第三方真名」原文嵌進MEMORY——loner正則裡的單字「狂」只要MEMORY任何角落(哪怕只是夥伴真名裡剛好有這個字)命中就會誤判，跟這名御主自己的性格設定毫無關係，卻直接餵進結盟意願/挑撥成功率/示好增幅/夜襲權重等實際數值結算。改成只掃PREF/BACK＋MEMORY裡真正屬於語氣類的【口吻】【小動作】【願望】三個tag，排除硬連結/狀態類tag的污染。

### `actionProposeAlliance`　<sub>Router_Bond.gs:409</sub>

🐛→✅ 這個動作沒改動任何人的 LOC(結盟雙方都仍留在原地)，同款「AI 自行編出離場」風險。

### `actionProposeAlliance`　<sub>Router_Bond.gs:417</sub>

🐛→✅ allianceWillingness_ 內部呼叫 masterPersonaLean_ 算出這名敵御主的性格傾向，卻只拿來算機率、算完就丟掉——同檔案 actionCourtEnemy(628行)已經示範過怎麼把這個傾向轉成具體反應描述餵給AI，這裡卻仍讓AI自己從「務實的權衡/開出條件/冷淡的『暫時』」等泛用選項裡憑空挑一個，比照補上。

### `actionProposeAlliance`　<sub>Router_Bond.gs:432</sub>

🐛→✅ 舊碼「同地任一敵從者」就抓來標盟約——若該地同時有別組敵人(常見，同地點常撞見多方)，會誤把毫無關係的敵從者標成這名御主的從者、AI 也跟著誤演成「他的從者」(玩家回報「俺的御主都開口了????」)。改用 getMasterServant_ 硬連結查真正屬於這名御主的從者，不再靠地點瞎猜。

### `actionBreakAlliance`　<sub>Router_Bond.gs:444</sub>

🐛→✅ 稽核抓到：結盟期間世界tick跳過死線檢查、不代表死線被取消——若原本掛著【靈基透支】(令咒燒盡瀕死)倒數才結盟，解盟當下若不順手清掉，可能瞬間讀到早已過期的舊死線暴斃。

### `actionBreakAlliance`　<sub>Router_Bond.gs:463</sub>

🐛→✅ 舊版 `!npcName` 條件在缺/空 npcName 時對每個已結盟對象都成立——前端 UI 呼叫此 action 一律帶著明確名字(卡片按鈕/needBreakAlliance 提示皆固定傳值)，但直打 API 漏傳/傳空字串會一次撕毀玩家「所有」現存盟約，而非預期中的「這一個」。改成缺名字直接擋下，不再有全滅副作用。

### `actionBreakAlliance`　<sub>Router_Bond.gs:471</sub>

🐛→✅ 2026-07「整體重構·id優先」：舊版純 nameLoose_ 子字串.indexOf()比對——若npcName恰為另一個已結盟對象名字的子字串(如兩者共用「遠坂」開頭)，會誤把不相干的盟約也一併撕毀。改成npcId對得上時只鎖定該筆(及其硬連結主從)；npcId缺席(舊呼叫/自動重試按鈕沒帶id)才退回原本的loose子字串比對。

### `breakStaleAlliances_`　<sub>Router_Bond.gs:475</sub>

🐛→✅ 同actionBreakAlliance同款修法：自然瓦解也可能讓早已過期的【靈基透支】死線在解盟瞬間被讀到，一併清掉。

### `actionBreakAlliance`　<sub>Router_Bond.gs:476</sub>

🐛→✅ 稽核抓到：上面註解宣稱 npcId 路徑會「鎖定該筆及其硬連結主從」，但從沒真的查過硬連結——actionProposeAlliance 結盟時是主從兩側對稱寫入(428行御主／436行從者各自標【盟約至】)，這裡撕毀卻只匹配被點的那一筆(及跟它同名的列)，另一側完全沒被 isMatch 命中。玩家點某一張盟友卡撕毀後，那一側恢復敵對，另一側(其硬連結主從)卻仍卡在【盟約至】——攻擊被 needBreakAlliance擋下(明明剛撕毀)、突襲/挑撥名單仍排除他、還能被 court_enemy 額外撿到好感，直到自然到期(breakStaleAlliances_)才會清掉，最長可拖約3天。改成跟建盟同款：查目標的硬連結對象名一併比對。

### `breakStaleAlliances_`　<sub>Router_Bond.gs:532</sub>

forceAll(終局逼近)時常一次瓦解多組同盟，MEMORY 整欄一次寫回(取代逐列 setValues 的零散往返)

🐛→✅ 補 BATTLE_DEFER_WRITE_ guard：actionRest 整併寫入時會設此旗標，這裡也該一併略過即時寫入，交給收尾那次整表 setValues 一次到位。

### `actionAllyBond`　<sub>Router_Bond.gs:552</sub>

🤝 與盟友共處／共濟魔力：對同地盟友（敵御主或敵從者·結盟中）交流增進羈絆——同盟的「交流」維度。原作依據：聖杯戰爭中的同盟羈絆（遠坂凜↔士郎並肩信賴、共通後勤）。羈絆養至 90↑ 只解鎖【摯交】敘事里程碑(見下方)，純敘事高光、無鑑賞入口意義——鑑賞角色一律鑑賞內自行召喚，與 solo 羈絆無關聯。★此處僅止於 SFW 的信賴／曖昧鋪陳（fade）；真・親密一律留給鑑賞世界，絕不在戰場開啟慾海引擎。

### `actionAllyBond`　<sub>Router_Bond.gs:565</sub>

🐛→✅ 2026-07 稽核抓到：這裡是全專案唯一還沒補 npcId 精準配的盟友/羈絆 handler，純 nameLoose_比對含全形括號的真名(如「哈桑·薩巴赫（咒腕）」)會被 sanitizeUserData_ 的 cleanChineseName剝掉括號、兩側對不上，導致跟這類正典角色結盟後永遠「此地沒有可交流的盟友」。比照actionCourtEnemy/actionProposeAlliance 補上 npcId 精準配、找不到才退回 nameLoose_ fallback。

### `actionAllyBond`　<sub>Router_Bond.gs:579</sub>

🐛→✅ 稽核抓到：本檔手足機制(actionBond的【羈絆日】、actionCourtEnemy的【示好日】)都有「每日一次」節流，唯獨這裡完全沒有——AP足夠(每日12點)可連續呼叫6~7次就把盟友羈絆從40衝到90+，一天內直接解鎖【摯交】里程碑，遠比其餘手足機制「細水長流」的設計節奏快上一整個量級。比照【示好日】同款每對象每日一次節流。

### `actionAllyBond`　<sub>Router_Bond.gs:595</sub>

⚔️ 卸防突襲：與盟友交流時門戶大開，同地若有「未結盟」敵從者→趁隙重擊我方從者

🐛→✅ 稽核抓到：雙從者情境下漏帶偏好的 svIdx——前端其實已隨這個action送了 servant/servantId(跟其餘卸防動作同款payload)，這裡卻從沒解析拿來用，突襲永遠打「第一位」從者，可能跟玩家當下出戰/操作的第二從者對不上。比照 actionBond/actionManaSupply/actionSpiritRepair 補上解析。

### `actionAllyBond`　<sub>Router_Bond.gs:616</sub>

🐛→✅ 稽核抓到：bumpBond_預設會立即單格寫回aIdx列的BOND，下面【摯交】里程碑命中時又對同一列做MEMORY單格寫回——同列2次Sheets I/O。改skipWrite:true，交給下面單次整列寫回一併涵蓋(含BOND／可能的【摯交】／【交流日】節流標記)。

### `actionCourtEnemy`　<sub>Router_Bond.gs:623</sub>

🐛→✅ 稽核抓到：bumpBond_預設會立即單格寫回tIdx列的BOND，但657-658行緊接著又對同一列做整列寫回(示好日標記)——同列2次Sheets I/O。改skipWrite:true，交給下面那次整列寫回一併涵蓋。

### `actionAllyBond`　<sub>Router_Bond.gs:639</sub>

🐛→✅ 玩家實測抓到「盟友從者說話像真的是我的從者」——servantCard_「對御主」那段語氣是寫給「自己的契約御主」看的，AI 沒被告知這名從者真正的御主另有其人，順著卡片語氣自己腦補成在跟玩家講契約話語(如「既然契約還在」)。用 getServantMaster_ 硬連結查出他真正的御主名字，明講清楚劃開身分。

### `actionCourtEnemy`　<sub>Router_Bond.gs:654</sub>

🕊️ 示好／交涉：對同地【未結盟的敵御主】釋出善意、慢慢養好感(BOND)。只對敵御主(交涉的對象是決策者)；好感由整組御主＋從者共用——示好御主會連坐把其硬連結從者的 BOND 一起養。GAS 依對方性格決定升多少(務實者領情快、孤狼/瘋狂者慢熱)，AI 只演對方【依性格×當前好感】的反應。每名敵人每日一次、耗 1AP。這是「好感提高成功率」整套的主動培養入口——養高了：遇敵態度和緩、結盟更易、挑撥更靈、趁隙更狠、撤離不被追擊(BOND≥50)。戰場只到 SFW 曖昧；鑑賞角色一律於鑑賞內自行召喚，不靠 solo 帶入。

### `actionRuleBreakSteal`　<sub>Router_Bond.gs:695</sub>

🐛→✅ 稽核抓到：原本先整列寫回nIdx列(帶著raiseBond_調整前的舊BOND)、raiseBond_才又對同一列單格寫BOND——同列2次Sheets I/O。改成raiseBond_(skipWrite)先只改記憶體，下面整列寫回一次到位。

### `actionCourtEnemy`　<sub>Router_Bond.gs:722</sub>

🐛→✅ 這個動作從未改動過「${targetName}」的所在地(LOC 未變、她仍在原地)，但舊指令沒講清楚這點，AI 便自行編出「轉身離去」之類的退場收尾——下一次玩家在同地遇到她，畫面就跟這句「已經走了」互相矛盾。明講「仍留在原地」，收尾定格在氣氛鬆動的瞬間，不可讓她離場/走遠/消失於視野。

### `actionRuleBreakSteal`　<sub>Router_Bond.gs:763</sub>

🐛→✅ 陣營改成「從者」卻從沒設 IS_PARTY="同行"——applyRegen_/世界推進的回魔+耗魔只認 IS_PARTY，HUD(playerServantEconomy_) 卻是不論 IS_PARTY、只要 FACTION=從者 就整組算——奪來的第二從者從此在 HUD 上看得到維持費、但實際休息/世界推進根本不會扣他的魔也不會回他的血，兩邊帳對不起來。

---

## `gas/Router_Creation.gs`

### `actionManualNpc`　<sub>Router_Creation.gs:14</sub>

🛡️ 帳號重入防呆：此帳號若已連結一局活著的遊戲(charId 存在且非 DEAD_)，拒絕再建一次——否則 linkAccountToPc_ 會悄悄覆寫帳號的連結指標，把舊角色＋已召喚的從者孤兒化(英靈殿範本不受影響、但這局「進行中遊戲」從帳號視角消失，下次登入變成一場空的 needsSummon，玩家會以為角色跟從者憑空消失了)。合法流程(newGameFlow)本就會先呼叫 account_new_game 清連結才走到這裡，故此擋不影響正常開新局；只堵「create 被異常呼叫第二次」(連點/多分頁/重送)這個從無防護的洞。

### `actionManualNpc`　<sub>Router_Creation.gs:39</sub>

🔵 御主名號＝角色名。跨局撞名靠 game_id＋faction 分流無害，只需擋【正典角色名】——避免自創御主與被種入本局的同名正典敵手變雙胞胎（同局內按名字查會歧義）；想當正典角色請走「扮演正典御主」入口。兩側名字都須套 cleanChineseName 正規化再比對（canon 名可能含標點，sanitize 後的 finalName 不含）；SEED_SERVANTS 真名欄位是 `realName` 不是 `name`。

### `actionManualNpc`　<sub>Router_Creation.gs:42</sub>

🐛→✅ 撞正典從者真名沒有「扮演」這條路(那個入口只列SEED_MASTERS)，訊息不該誤導去點一個死路——改成單純告知另取名號。

### `actionManualNpc`　<sub>Router_Creation.gs:45</sub>

扮演正典御主(playedMaster) 是合法路徑，須排除於撞名擋下之外；驗證 playedMaster 對應真名剛好等於finalName 才放行，避免夾帶不相干 playedMaster id 繞過保護。seedRivalsForGame_ 會排除你扮演的那位不再種成本局敵御主，故不會真的產生雙胞胎。

### `actionManualNpc`　<sub>Router_Creation.gs:68</sub>

🎴 御主(凡人魔術師)初始數值：HP/MP 依魔術迴路(財力/身世決定)推算——御主是凡人，遠低於英靈從者。

🐛→✅ masterMaxHpMp_ 本身已補上限，但這裡若直接把玩家原始輸入寫進 MEMORY【迴路】，之後masterPoolMax_ 是另外重新 parse 這個 MEMORY 字串(不會再走 masterMaxHpMp_)算共用魔力池——兩處不同步的話，上限形同虛設。改成算好同一個夾好範圍的值，兩處共用。

### `actionManualNpc`　<sub>Router_Creation.gs:70</sub>

🐛→✅ 稽核抓到(比照鑑賞actionEnterKanshou同款漏洞)：只靠前端#s-standing的maxlength=40擋，backend原本沒設長度上限——繞過前端能塞任意長度進BACK欄。補上跟前端一致的上限。

### `actionManualNpc`　<sub>Router_Creation.gs:77</sub>

🛡️ 這幾格是玩家自由填寫的文字(sanitizeUserData_只截長度、不擋｜【】——那道清洗只鎖name/npcName等嚴格姓名欄位)，MEMORY是全欄位共用｜分隔的標記格式，比照setOutfit_/setWeapon_同款清洗，避免玩家文字裡剛好帶的｜【】把後面的【模式】【戰爭】【扮演】等系統標記截斷或偽造。

🐛→✅ 稽核抓到：maxLen 原本沒帶，願望(wish)只靠前端#s-wish的maxlength=40擋，backend不設限——補上可選長度上限，願望套40跟前端一致。

🐛→✅ 再一輪稽核抓到：magic/origin/melee/magicRank這4格原本連maxLen都沒帶(靠「這是命運測定擲骰結果、非玩家自由輸入」的假設不裁)——但這假設只在走前端rollFate()時成立，直打API可送入sanitizeUserData_全域上限內(2000字)的任意文字。合法roll值(FATE_MAGICS_/FATE_ORIGINS_最長約10字、melee/magicRank僅E~B單字母)遠短於20字，補上20字上限不會誤傷任何合法roll值。

### `actionManualNpc`　<sub>Router_Creation.gs:104</sub>

🐛→✅ 舊版只看 userData.playedMaster 是否有值，沒有同步要求上面第43-44行驗證過的_playingThisCanon(playedMaster id 對應真名須等於 finalName)——玩家選了扮演正典御主、隨後把姓名欄改成任意原創名再送出，仍會殘留【扮演】標記，讓 seedRivalsForGame_ 誤將該正典御主整組從本局敵人名單移除，等於免費刪掉一組對手。改成與撞名檢查共用同一個判準。

### `actionBackfillMasterAi`　<sub>Router_Creation.gs:120</sub>

🐛→✅ 稽核抓到(比照鑑賞actionBackfillKanshouAi同款漏洞)：這幾欄餵進AI提示詞前也從沒設過長度上限，只靠前端擋，補上跟對應輸入框maxlength一致的上限(appearance30/standing・wish40)。

### `ALLOWED_FX_`　<sub>Router_Creation.gs:255</sub>

引擎實際吃得到的 fx 字典（AI 生成新從者時從中挑選，確保新角色也能「吃到標籤」）。⚖️ 刻意【不放】頂級概念寶具 fx：ea(乖離劍·對界)／gob(王之財寶)／excalibur／ubw(無限劍製)／summon_horror(海怪)／chain(天之鎖)／wealth(黃金律)——避免玩家一鍵生出「乖離劍氾濫」的破壞平衡從者；也【不放】需專屬 UI/MEMORY 的機制 fx：mage_realm(斯卡蒂可選盤)／rune(符文模式)。這些留給手工種子(SEED_SERVANTS)。其餘中階以下(含施放/防禦/對人放大)已開放，讓自訂/AI 從者的天花板貼近種子。

### `sanitizeSkills_`　<sub>Router_Creation.gs:286</sub>

🐛→✅ 補 HTML 斷字字元清洗，比照工房 parseForgeBuild_ 對應的技能名稱清洗規則——這是 AI 生成從者(actionSummonServant)唯一經過的技能清洗函式，產出的名稱會永久寫進英靈殿並顯示在戰鬥UI。

### `originGuide_`　<sub>Router_Creation.gs:287</sub>

🎭 創角「來源三分類」(origin)→ 角色框定 frame ＋ 技能命名規則 skill。玩家在召喚/工房明講，不靠 AI 猜。fate=Fate 正史角色(忠正史招式名)／anime=其他動漫畫遊戲知名角色(取角色招牌招式名)／original=完全原創(自取花名)。空/未知＝original(維持舊行為·當原創處理)。自訂生成用 frame+skill；工房只用 frame(技能名玩家自己打)。

### `sanitizeSkills_`　<sub>Router_Creation.gs:308</sub>

清洗 AI 給的技能陣列為 [{n,r,fx}]（fx 不在字典就清空，仍保留為演出用標籤）。r 階級與 sanitizeSix_ 同一套驗證(承認 A++/B−)。maxCount 由呼叫端傳真實預算上限(classSkills 1~2/skills 2~3)，不共用同一個寬鬆值，避免 AI 吐出兩倍於預算的技能數量。

### `sanitizeSkills_`　<sub>Router_Creation.gs:313</sub>

🐛→✅ 舊版連 EX、連帶 +/++/− 修飾符都放行，但 forgeCost_ 的計價表(SKILL_PTS_/_BIG_/_SMALL_/FLAT_FX_)只有 E/D/C/B/A 五個裸階級鍵，EX 或帶修飾符的階級一律落到 `||15` 預設分——比B階(20)/A階(25)還便宜，卻套用真正EX(60點)的戰鬥威力，形同同時放寬驗證又算價算錯。改成比照工房parseForgeBuild_ 對技能階級的精確驗證集合(只認裸 E/D/C/B/A)，不在此集合內一律退回 C。

### `tagSkillKind_`　<sub>Router_Creation.gs:332</sub>

🏷️ 技能來源標記：寫入 TAGS 前把 classSkills/skills 分別打上 kind('class'/'skill')再合併——四個寫入點(召喚 hero 分支/AI生成分支/種子英靈/敵方鋪陳)合併前都還是兩個分開的陣列，只是合併那刻來源資訊就丟了；提早在這裡標記，前端卡片才能 100% 準確分「職階技能／固有技能」而非用 fx 代碼猜。純顯示用欄位：hasFx_/fxName_ 只認 fx/r，多這個欄位不影響任何戰鬥判定。舊角色(合併時未標記)在前端會退回 fx 代碼表猜測分類，見 Script.html 的 CLASS_SKILL_FX_HEUR_。

### `sanitizeSix_`　<sub>Router_Creation.gs:342</sub>

清洗六圍：6 鍵齊全、階級合法（E~EX、可帶 +/++/−，承認 A++/B− ——AI 常自發吐 A++）；缺或亂給則補 C。格式合法不代表強度合理：EX 級最多保留 2 項(比照種子最強者的分布，如吉爾伽美什寶具EX/理查一世敏捷EX)，其餘超額降階為 A——否則 recordOriginalHero_ 會把全 EX 角色永久寫回英靈殿供重召，固化成長期破台角色。

### `recordOriginalHero_`　<sub>Router_Creation.gs:357</sub>

🛡️ 這是唯一寫進共用英靈殿的入口(手動工房已在parseForgeBuild_清過build.name，但AI輔助召喚path的realName可能只清過userData.trueName、AI自己回傳的aiBrief.realName未經任何清洗)——在單一真實來源補一道，兩條路徑都保證進表的名字不含HTML斷字字元。

🐛→✅ 稽核抓到：本函式原本無回傳值，撞名靜默return跟真的寫入appendRow完全無法區分——actionSaveHero(製造模式)不論這裡有沒有真的寫入，一律回報「已鑄入英靈殿」成功。TOCTOU：line 643的查重跟這裡的appendRow之間隔著一次AI呼叫(常達數秒)，兩個幾乎同時的save_hero請求(同名/雙擊重試)都可能通過各自的查重、只有先appendRow那個真的寫入，後者在這裡撞名静默return，玩家卻收到假成功、之後召喚出的其實是對方那份設定。改回傳布林值，讓呼叫端誠實回報。

### `recordOriginalHero_`　<sub>Router_Creation.gs:372</sub>

🐛→✅ 只查NAME不夠：部分種子英靈的id用去標點短名(如「庫丘林-Lancer」)、跟自己的realName(「庫·丘林」)不同——玩家指定的trueName若剛好是那個短名，NAME比對不會撞、但這裡組出的newId(name+"-"+cls)會跟種子id完全相同，下次CODEX_PERSONA_VER升級時upgradeCodexPersonas_會依id覆寫，把玩家原創英靈整列蓋成種子資料。補上id層級的查重。

### `recordOriginalHero_`　<sub>Router_Creation.gs:382</sub>

🐛→✅ 稽核抓到：personaWords(AI輔助召喚路徑傳入的是aiBrief.personality原始值，完全沒經過parseTraitsHelper或任何清洗)沒有長度上限也沒清HTML斷字字元——這裡是「唯一寫進共用英靈殿的入口」，比照上面name的做法補一道，兩條呼叫路徑(工房finalPref/AI輔助召喚aiBrief.personality)一次到位，且會被recordOriginalHero_/日後每次重召/每回合提示詞持續回灌，不擋在這裡就無界污染。

### `recordOriginalHero_`　<sub>Router_Creation.gs:390</sub>

🔑 creator＝編輯權限綁定(actionSaveHero edit 分支靠 pj.creator===acct 擋非本人)；weapon＝武裝敘述。兩者 edit 分支都會保留(line 497)、call site 也都有傳，create 當下卻漏寫→creator 恆空=沒人能改自己的角色、自訂生成的英靈也不綁製作者。補進 persona 這唯一寫入點，工房/自訂生成兩路一次到位。

### `recordOriginalHero_`　<sub>Router_Creation.gs:395</sub>

工房角色創造當下就順手轉好日常版(DAILY_LOOK/DAILY_WORDS)寫進英靈殿，跟種子英靈不同(那 25 人的日常版是 Seed_Codex.gs persona.daily* 手寫欄位，getDailyHeroFields_ 只負責讀、沒有補算路徑)——之後第一次被召喚進鑑賞就直接有現成版本，不必等召喚當下才轉。萌點也同步轉換，避免 heroToKanshouRow_ 把戰時沉重萌點搬進沒打過聖杯戰爭的鑑賞世界。moe 需先算好才能當 hint 傳給 translateLookToDaily_，避免「私密一面」跟萌點撞成同一件事的兩種說法。

### `SKILL_PTS_`　<sub>Router_Creation.gs:415</sub>

💰 六圍/技能/規模 統一計價（單一真實來源：工房 parseForgeBuild_ 的預算上限檢查、AI 自訂從者的下限保底 bumpSixToFloor_ 共用同一套算式，避免定價邏輯散落兩處各自為政）。skills 不含classSkills——職階技能工房是白送的、不占錢包，AI 生成分支比照排除。

### `FORGE_FLOOR_`　<sub>Router_Creation.gs:436</sub>

🌀 AI 自訂從者的六圍下限保底：對齊工房 FORGE_BUDGET(340)——AI 常自己抓不準力度，光靠 prompt 措辭拜託「務必有強有弱」擋不住偶爾生出偏弱從者，這裡改成 GAS 硬性補強：算完低於下限就把最弱一項六圍逐階往上補，直到達標或撞 EX≤2 上限(見 sanitizeSix_)為止。同樣不算職階技能(見上，工房也不算)。

### `capSixToBudget_`　<sub>Router_Creation.gs:462</sub>

🐛→✅ 舊版只擋「太弱」(bumpSixToFloor_)沒擋「太強」——工房 parseForgeBuild_ 超預算會直接`return {ok:false,...}` 拒絕重填，但 AI 生成沒有「打回重填」的來回，若 AI 一開始就給出偏強六圍+技能(prompt 明講「不得保守低估」很容易誘發)，完全沒有後續檢查會擋下，可無上限超出工房任何職階都拿不到的預算天花板。改成比照 bumpSixToFloor_ 反向：超過上限就把最強一項六圍逐階往下砍，直到達標或砍無可砍(全部已是 E)為止；上限比照 parseForgeBuild_ 的 clsBudget 概念，共用 FORGE_CLS_BONUS_ 讓 Berserker 補正對稱。

### `parseForgeBuild_`　<sub>Router_Creation.gs:493</sub>

🛠️ 工房 build 解析＋全套驗證（單一真實來源：召喚 actionSummonServant build 分支 與 修改 actionUpdateHero 共用）。規格：預算340·六圍+技能+規模同一錢包(EX≤2)＋技能≤4(前3免欄位費·第4欄+20·fx白名單·上限A·三軌計價·二元平價·燕返60)＋規模計價(對軍+20)＋寶具名/描述剝高規模關鍵字＋正典名擋＋演出七欄清洗。回 {ok:false,message} 或 {ok:true,...欄位}。

### `parseForgeBuild_`　<sub>Router_Creation.gs:511</sub>

🐛→✅ 稽核抓到：原本沒濾HTML斷字字元(<>&"'`)——這些欄位(toM/speech/tic/moe/back/look/pref/weapon)跟同函式內name(496)/traits(517)/skills(544)/npName(552)一樣，最終都會被前端原樣拼進innerHTML顯示(如showNpDesc→showHistoryOverlay無escape)，原創英靈存進共用英靈殿，其他帳號召喚到就會觸發，是可跨帳號的儲存型注入，不是自傷。補齊跟其餘欄位同款清洗。

### `parseForgeBuild_`　<sub>Router_Creation.gs:523</sub>

🎭 特性(traits)：純敘事風味標籤(見 Script.html TRAIT_DESC)，不進 FORGE_BUDGET 計費、不驗白名單——玩家想捏其他作品角色(如「賽亞人」「人造人」)需要能自由發揮，比照 AI 生成分支(aiTraits)同一套清洗規則(頓號/逗號分段、上限4個、單則截8字)，讓工房手捏角色也能貼這類梗。

🐛→✅ 補 HTML 斷字字元清洗——同一函式內技能名稱(out.skills)早有這道清洗，特性名稱漏了，兩者最終都會被 Script.html 的 pill()/showSkillDesc() 原樣拼進 <span> HTML 顯示。

### `parseForgeBuild_`　<sub>Router_Creation.gs:538</sub>

FORGE_CLS_BONUS_ 已上移為檔案級單一真實來源（與 AI 生成路徑 capSixToBudget_ 共用）：

Berserker 職階附贈狂化C(傷+但命中/迴避−·不可關)是唯一負資產禮物，同素體實測墊底——補正+30 拉平(+50 會反轉成最優職階，370 頂配狂戰實測後仍只是強力中堅，安全)。

### `parseForgeBuild_`　<sub>Router_Creation.gs:550</sub>

🛡️ 同上：hasOwnProperty才是真的白名單命中，避免"constructor"這類繼承鍵讓後面的FLAT_FX_[fx]查到Object建構子函式，把skillCost污染成字串，讓total>clsBudget的超預算擋失效(number>string比較會把字串轉NaN，NaN>x恆false)。

### `parseForgeBuild_`　<sub>Router_Creation.gs:563</sub>

🐛→✅ 稽核抓到：npAtkScale_(Engine_Fate.gs)對整串np做子字串比對(/對軍/.test(np))決定攻擊規模，而這串np是npName+npDesc原文直接拼接——舊版清洗只濾掉「對城/對界/對神」三個更高階規模字樣，唯獨漏了「對軍」這個真正要收20點預算的那一階，玩家把npScale選便宜的「對人」(0元)、卻在npDesc自由文字裡塞一句含「對軍」的敘述(如「曾單槍匹馬對軍陣衝鋒」)，戰鬥時就白吃對軍規模的傷害倍率——等於免費繞過規模預算。四個規模關鍵字一併濾掉，維持只有npScale本身能決定規模。

### `actionClaimHero`　<sub>Router_Creation.gs:576</sub>

工房存檔（action="save_hero"：工房＝純製造/修改，不召喚）：create＝寫英靈殿新列(AI 補 persona/寶具英文名·蓋創造者印記)；edit(帶 heroId)＝僅創造者本人可改、真名不可改(識別鍵)、演出欄非空覆寫/空保留、寶具英文名沿用舊值。改的是英靈殿【範本】——之後召喚才生效，已在場的分身不追改(可用 DEV「套用最新平衡」同步)。

認領無主原創英靈（action="claim_hero"）：創造者印記功能上線前鑄的 ai_gen 英靈沒有 persona.creator，「我的作品」不列、✏️ 不亮、誰都不能改——開放認領：無主者先到先得，已有主的不可搶。

### `actionSaveHero`　<sub>Router_Creation.gs:625</sub>

🐛→✅ 職階切成「御主」是破壞性動作(parseForgeBuild_對isMasterCls會直接清空六圍/技能/寶具，見上方註解)——原本改職階誤選到御主、直接存檔會無聲蓋掉戰鬥數值，且成功訊息完全沒提示這件事。非「御主→御主」的職階切換才需要二次確認，避免正常編輯(職階本來就沒變/本來就是御主)被多問一次。

### `actionSaveHero`　<sub>Router_Creation.gs:649</sub>

外貌/性格改了，先前快取的日常版本會跟新設定對不上——重新轉一次，不留舊資料。translateLookToDaily_ 一次呼叫同時產出四段式 look 與獨立的 outfit；moe 需先算好才能當 hint 傳入，避免「私密一面」跟萌點撞成同一件事的兩種說法。

### `actionSaveHero`　<sub>Router_Creation.gs:690</sub>

🐛→✅ 稽核抓到：line 643的查重跟AI呼叫(651-654，常達數秒)之間有TOCTOU競態窗口——兩個幾乎同時的save_hero請求可能都通過各自查重，只有先寫入appendRow那個真的成功，後者在recordOriginalHero_內部撞名靜默return false，卻原本一律被這裡回報「已鑄入」成功。誠實回報。

### `actionSummonServant`　<sub>Router_Creation.gs:702</sub>

🐛→✅ 稽核抓到：跟同檔工房路徑的_fClean(515行，清<>&"'`｜【】)不一致，這裡只trim+截斷，沒清｜【】——這段文字會原樣嵌進送給AI的召喚提示詞(808~822行，同樣用【…】/★標記真正指令)，玩家可塞偽裝的【…】字樣混淆AI。補上同款字元清洗，維持全代碼庫「會進AI提示詞的自由文字都清這組符號」的一致慣例。

### `actionSummonServant`　<sub>Router_Creation.gs:719</sub>

🐛→✅ sex 舊版沒有白名單驗證(工房 parseForgeBuild_ 早有 ["男","女","異"].includes(...) 檢查)，AI 吐出的任意字串會原樣通過並永久寫進英靈殿，往後任何讀取點都得自己防禦這個不可信欄位。

### `actionSummonServant`　<sub>Router_Creation.gs:732</sub>

🐛→✅ 只補下限沒補上限——AI 常被 prompt「不得保守低估」誘導生出偏強六圍/技能組合，比照工房 parseForgeBuild_ 的預算硬上限，改成超標就砍最強一項六圍，直到落回預算內。

### `actionSummonServant`　<sub>Router_Creation.gs:735</sub>

🐛→✅ 同工房路徑，補 HTML 斷字字元清洗（原本只做長度截斷）。

### `actionSummonServant`　<sub>Router_Creation.gs:740</sub>

🐛→✅ 玩家反饋：這裡原本完全不生成外貌(直接套通用預設「外貌出眾、舉止從容…」)，逼玩家自己用逆天改命補——現在跟 aiBrief.look 一起生成，缺的話才退回同款通用預設。

### `actionSummonServant`　<sub>Router_Creation.gs:767</sub>

🐛→✅ 稽核抓到：跟classSkills/skills不同，traits在這裡沒經過陣列型別檢查——若英靈殿這欄被手動編輯成合法JSON但非陣列(如物件)，會原樣寫進新召喚從者的TAGS，讀取端(rowToCombatant_)雖已補上Array.isArray防線不會再讓戰鬥崩潰，但這裡仍順手擋住，不讓壞資料繼續往前傳。

### `actionSummonServant`　<sub>Router_Creation.gs:805</sub>

🌀 名冊查無 → AI 即時生成「第一級從者」：含真實六圍階級＋帶 fx 的技能（吃得到標籤）🎭 自訂描述且玩家未指定職階(reqCls空)→職階交給 AI 依描述判斷，不再死綁 Saber。舊版恆 cls=reqCls||"Saber"：沒特別選職階的自訂生成，無論描述寫什麼，職階永遠是 Saber(玩家回報「難怪我自創一堆Saber」)——描述完全無法影響職階，AI 也從未被要求挑選。

### `actionSummonServant`　<sub>Router_Creation.gs:833</sub>

🐛→✅ 舊版沒清 HTML 斷字字元、沒封頂長度——工房路徑(parseForgeBuild_)對 out.name 有.replace(/[<>&"'`]/g,"").trim().slice(0,20)，這裡完全沒有；recordOriginalHero_ 內部雖然也會清洗，但那是函式內的區域變數副本(JS 字串傳值)，不會回寫外層 realName——導致「這局實際使用、寫進戰鬥狀態的名字」跟「寫回英靈殿供未來重召的名字」不一致，前者還完全繞過 HTML 斷字防線。

### `actionSummonServant`　<sub>Router_Creation.gs:843</sub>

npAtkScale_ 讀 np 字串關鍵字算規模——AI 自訂寶具最高「對軍」，對城/對界/對神為種子專屬(堵字串後門)。【常駐寶具】標記同理為種子專屬(B叔/玉藻)，混入會讓從者自己的💥被鎖死，故一律剝除。🐛→✅ 補上 HTML 斷字字元清洗，比照工房 out.npName/out.npDesc 的既有規則。

### `actionSummonServant`　<sub>Router_Creation.gs:848</sub>

🐛→✅ 玩家實測抓到「Berserker 身上多一個像符文技能的職階技能」——舊版讓 AI 自己生 classSkills，prompt 只講「貼合職階慣例」是軟性建議、擋不住 AI 額外發明一個不屬於該職階原型的技能(如替Berserker 加一個道具作成系的「召喚騎士」)。改成比照工房：職階技能由 GAS 依 FORGE_CLS_SKILLS_直接指派、不再問 AI，徹底杜絕跑題；AI 只需專心生「這名英靈個人」的固有技能(skills)。

### `actionSummonServant`　<sub>Router_Creation.gs:879</sub>

不重名的原創從者寫回英靈殿(含六圍/技能fx/特性)，日後可重用。pExtra 需帶 moe——否則永久記錄(persona.moe) 是空字串，若日後被邀進鑑賞會無從轉出日常萌點。

🐛→✅ 舊版 pExtra 沒帶 back——工房路徑(actionSaveHero)完整傳了 back，這條 AI 生成路徑卻漏傳，即使這局「當下」的從者列(row[COL.PC.BACK])明明已經有值：recordOriginalHero_ 內對缺欄位的處理是空字串，這名原創英靈永久寫回英靈殿的 persona.back 因此恆為空，之後任何重新召喚都會落回泛用預設值「職階・真名」，AI 當初生成的身世徹底遺失，工房編輯清單上也永遠看到空白欄位。

look 一併存進 persona——之後日常版轉換(translateLookToDaily_)跟重新召喚都吃得到這次AI生成的外貌，不再永遠停留在通用預設(見上方 TRAIT 賦值處的同批修正)。

---

## `gas/Router_Economy.gs`

### `actionManaSupply`　<sub>Router_Economy.gs:193</sub>

🐛→✅ 此分支原本只附敵從者的卡(foeCard)、沒附我方御主/從者的卡，卻要求AI演出「${svName}」依性格反應——毫無依據；也從沒告訴AI補魔本身(迴路/血上限燒蝕、回滿魔力)其實已經結算完成，AI只收到「被突襲打斷」的訊息、容易演成補魔沒做成，跟已經回滿的魔力池數字矛盾。兩者一併補上。

🐛→✅ 稽核抓到：servantCard_(pcData[svIdx])跟a.foeCard(enemyAmbushOnServant_已內建收尾)疊加時沒傳skipClose，會出現兩段幾乎重複的show-don't-tell收尾句——比照本session其餘同款疊卡呼叫端(Router_Battle.gs/Router_Movement.gs)修法：己方卡skipClose，最後用performanceNote_合併收尾一次。

### `actionManaSupply`　<sub>Router_Economy.gs:204</sub>

此分支只在好感≥門檻且魔力見底時走到——從者是真心信任、主動託付的，敘述可更直接大膽；篇幅也拉長(前端manaSupply()的unlocked旗標→narrate(...,{longForm:true})→後端加大 max_tokens，模型不變)。

性別事實與令咒兩支分支共用同一顆 sealGenderFact_(見Router_Persona.gs)，避免AI寫錯視角性別。

### `actionSpiritRepair`　<sub>Router_Economy.gs:209</sub>

🩹 靈基修復：消費共用魔力池為從者療傷，不燃令咒、可重複使用，但吃掉的池本可拿去放寶具/衝高出力，形成「現在回血還是留著打」的即時取捨。與令咒選單裡一次性全滿版(❖ 絕對修復)刻意區隔，那是孤注一擲，這是常態手段。

### `actionSpiritRepair`　<sub>Router_Economy.gs:262</sub>

🐛→✅ 同款缺漏：沒附我方御主/從者的卡，也沒講療傷本身(回復${healed}點)其實已經結算完成。

🐛→✅ 稽核抓到：同actionManaSupply款——servantCard_疊a.foeCard(已內建收尾)沒傳skipClose會雙重收尾句，改己方卡skipClose、performanceNote_合併收尾一次。

---

## `gas/Router_Movement.gs`

### `actionMove`　<sub>Router_Movement.gs:91</sub>

🐛→✅ 稽核抓到：這裡只驗證地名是否存在於全坤圖，完全沒套用buildMapNodesPayload_/getNearbyLocations/enemyRetreatLoc_都有的【戰爭】標記過濾——前端節點選單雖只列出符合本局戰爭的地點，但直打API帶戰爭限定地點名(如非第四次局的「海特飯店」)仍會被這裡放行完成整趟移動，把玩家傳送到依設計對本局根本不存在的地點。比照手足函式同一套規則補上。

### `actionMove`　<sub>Router_Movement.gs:96</sub>

🐛→✅ 目的地＝當前所在地：地圖節點/故事內文的地名連結都沒擋這個案例(點自己所在的◈節點一樣可觸發travelTo)，此路徑會白耗 2 AP、跑一輪世界推進與抵達敘事，卻哪裡都沒去——原地無意義的「移動」。

### `actionMove`　<sub>Router_Movement.gs:108</sub>

🐛→✅ 稽核抓到：窗口只鎖 loc+type，從沒比對 win.names(該局面實際牽涉的那兩名敵從者)——同地若撞見的是「三方以上」混戰(clashMasters無2人上限)，窗口只記錄隨機挑中的那兩名敵人對峙，第三組完全無關的敵從者從未被分心，卻因為同一個loc+type的窗口存在而讓玩家一併悄悄溜走，繞過下面的needRetreat硬性攔截。改成：悄悄離開只豁免「窗口點名那兩位」，同地若還有其他未被點名的能戰敵從者，依然視為未分心、照樣強制走撤退。

### `actionMove`　<sub>Router_Movement.gs:137</sub>

🏃 追擊機制已【全數轉移到撤退按鈕】(玩家定案)：唯有 isRetreat（殺出重圍）才觸發追擊——一般移動遇敵已被上方needRetreat 擋下（強制走撤退），遇不到敵則本就無人可追，故不再有「機率性離場追擊」這條路徑。🏰 從自己陣地離場享安全港·不被追擊(_atOwnHome)——即便按了撤退，主場結界也掩護你從容抽身。

### `actionMove`　<sub>Router_Movement.gs:165</sub>

🐛→✅ 舊版無條件講「堪堪擋開」(千鈞一髮)，但 prT(foe的寶具骰)其實已經算出這次躲得有多輕鬆——命中值(prT.aHit)跟迴避值(prT.dEva)差距大時根本不算「堪堪」，跟後面的骰子margin矛盾。

### `actionMove`　<sub>Router_Movement.gs:197</sub>

🐛→✅ 舊版無條件講「重創」，但 pr.damage 可能只是 Math.max(1,...) 的地板值(輕傷)——GAS明明知道這擊佔從者上限多少比例，卻沒換算成對應的傷勢用詞餵給AI，讓文字跟血條可能對不上。

### `actionMove`　<sub>Router_Movement.gs:202</sub>

🐛→✅ 玩家實測抓到：「沒能全身而退」讀起來容易誤解成「撤退失敗、沒能脫身」，但這場撤退本就必定成功抵達目的地(只是途中挨了一記)——改成明確講「帶傷脫身」，不再有歧義。

### `actionMove`　<sub>Router_Movement.gs:212</sub>

🐛→✅ 舊文案「燃令咒疾追」把這場【每次撤退必定觸發、不設機率】的追擊，寫成敵方燒了一道令咒——但令咒是全局僅 3 道、真正花費時會扣減 leftSeals 的稀缺資源(見 Router_Battle.gssealEscaped)，這裡從沒動過那個計數，純屬掛羊頭的敘事詞，卻讓玩家每撤退一次就以為對面燒掉一次奇蹟(玩家反應「?!」)。改成不涉及令咒的純體能追擊措辭。

note 必給——worldRumors 只在 pursuit.note 存在時才推播戰報，缺了 note 扣血就看不出原因。

### `actionMove`　<sub>Router_Movement.gs:246</sub>

傳 allPcData 給 worldTick_/breakStaleAlliances_ 原地改(陣列傳參考)，免事後重讀整表拿 tick 後狀態。

🐛→✅ 補最後一個 deferWrite=true 參數：worldTick_ 舊版不管有沒有人要求都會自己即時寫回

LOC/HP/MEMORY/MP，本函式結尾(340行)又整表 setValues 一次，同一批值等於送進 Sheets 兩次——

幾乎每次移動都會踩到(敵35%機率移位、敵御主每日回魔)。傳 true 讓 worldTick_ 只改記憶體，交給

這裡收尾一次寫完。

### `actionMove`　<sub>Router_Movement.gs:279</sub>

🐛→✅ 玩家實測抓到：這張追兵卡常常跟抵達場景的己方/敵方servantCard_同框——skipClose，讓下方 perfNamesMove 一併收進統一收尾(pursuitChaserName 供尚未宣告的 perfNamesMove 稍後合併)。

### `actionMove`　<sub>Router_Movement.gs:313</sub>

🐛→✅ 舊版固定只挑 clashMasters[0]/[1]，同地若有 3 組以上敵御主，第 3 組以後永遠沒有機會演出這場「敵營動向」——改成從全部在場組別中隨機挑一對，多組時輪流有機會登場。

### `actionMove`　<sub>Router_Movement.gs:325</sub>

🐛→✅ 舊版用 indexOf("【御主】"+mN) 子字串比對，同地若某敵御主真名恰為另一人的前綴(如「Illya」vs「Illyasviel」)會誤配硬連結——改用單一真實來源 getServantMaster_(嚴格切到下個｜分隔符)取出的完整真名做精確比對。

### `actionMove`　<sub>Router_Movement.gs:391</sub>

🎭 隨行從者的「演出依據」卡（含狂化禁言/口吻），供前端抵達敘事讓從者真的在場、有反應，不是御主獨白

🐛→✅ 玩家實測抓到：抵達場景常同框我方從者＋同地多名敵人＋撤離追兵，可能有3張以上servantCard_，每張各自帶一份完整收尾句——全部skipClose，收集這場戲實際出現的真名，perfNamesMove統一收尾一次。

### `actionMove`　<sub>Router_Movement.gs:398</sub>

🎭 在場敵從者/敵御主人設卡餵給抵達敘事，讓敵人依性格反應而非 AI 即興通用反派；servantCard_ 對敵從者一樣適用(低羈絆→戒備敵意)。🐛→✅ 原本只餵敵從者的卡——若目的地只有孤身敵御主(從者已死/在別處)，或有兩方敵御主互動的場面，AI 對這名敵御主毫無性格依據，只能即興通用反派。補上 enemyMasterCard_(比照戰鬥路徑的用法)。

### `actionMove`　<sub>Router_Movement.gs:399</sub>

🐛→✅ 併入撤離追兵真名（若有）——同框素材統一收尾一次，避免 pursuit.foeCard 自帶的收尾句重複出現

### `actionMove`　<sub>Router_Movement.gs:403</sub>

🐛→✅ 玩家實測抓到的同類問題：同地若同時有 ≥2 組敵人(各自帶從者)，舊版把每張卡原樣串接、完全沒標「哪張從者卡屬於哪張御主卡」，AI 沒有配對依據可能把 A 組從者的台詞演成對 B 組御主講。只在同地確實有 ≥2 位敵御主時才加標籤(單組場面維持原樣、不增加噪音)，用硬連結【御主】tag 標出真正歸屬，而非同地任一比對。

### `actionMove`　<sub>Router_Movement.gs:426</sub>

🐛→✅ 舊版無條件講「情勢緊繃」，GAS 明明算出 allyPeril.hpRatio 卻沒依實際血量分級——比照修正。

### `actionMove`　<sub>Router_Movement.gs:450</sub>

🐛→✅ 同批修正：漏傳戰爭標記會讓第四次限定地點(海特飯店等)混進撤退突圍/鄰近地點清單。

### `actionRest`　<sub>Router_Movement.gs:507</sub>

🐛→✅ 稽核抓到：世界自走輪數用 Math.floor(restHours/3)，只對{1,3,6}(前端openRestMenu()唯一提供的三個按鈕值)這組設計值正確對齊(1h:0/3h:1/6h:2)；舊版clamp卻放行1~12任意整數，直打API傳4/5/7/8/10/11這類非3倍數值時，AP/HP/MP回復跟時鐘照樣吃滿完整restHours，世界模擬輪數卻被floor砍掉餘數小時份——同樣的世界風險換到更多回復量與時間推進，形同可鑽的失衡缺口。改成白名單收斂到公式實際設計覆蓋的值，不再仰賴前端按鈕巧合對齊。

### `actionRest`　<sub>Router_Movement.gs:532</sub>

🐛→✅ 舊版這裡先整表寫一次(只含時回結果)，緊接著 restHours_/worldTick_/breakStaleAlliances_

又各自即時寫入同一批列——單次休息最壞可疊到3~5次個別Sheets寫入。改成這裡先不寫，開

BATTLE_DEFER_WRITE_ 讓下面三支只改記憶體，等三者都跑完後一次整表寫回(見下方收尾)。

### `actionRest`　<sub>Router_Movement.gs:538</sub>

🐛→✅ 舊版無條件講「重創」，GAS 明明已算出 svHpMax/dmg 卻沒換算成實際傷勢用詞——比照撤退追擊同款修法。

### `actionRest`　<sub>Router_Movement.gs:556</sub>

世界已在同一份 pcData 上 tick 完，直接沿用即可判夜襲，不必重讀整表。

⚔️ 卸防突襲：當敵蹤同地時休息＝酣睡門戶大開，最為兇險（mul 1.5）

🐛→✅ 稽核抓到：漏帶偏好的 svIdx，雙從者時突襲永遠打「第一位」從者，比照 actionBond 等補上。

### `actionPrepMeal`　<sub>Router_Movement.gs:644</sub>

🐛→✅ 稽核抓到：原本先整列寫回(帶著扣AP前的舊AP)、chargeApOrReject_才扣AP，讓它內部那道3欄窄寫又補寫一次——同一列兩次Sheets I/O。改成先扣AP(skipWrite跳過內部窄寫)、扣完AP的最終狀態再整列寫回一次，跟actionFateBattle同款省I/O寫法。

### `actionPrepMeal`　<sub>Router_Movement.gs:655</sub>

🐛→✅ 這是本檔唯一沒交棒 STATE_PRE_DATA_ 的耗AP動作(其餘 actionScavenge/actionScout/actionSetWorkshop/actionSecondWind 等皆有)——平時不影響任何東西(prep_meal 不在STATE_AFTER_ACTIONS 名單內)，但若這動作剛好跨過第14日時限，Router_Action.gs 的中央攔截拿不到交棒的 pcData 會多做一次整表重讀，跟其餘動作行為不一致，順手補上。

### `resolveFactionEncounter_`　<sub>Router_Movement.gs:700</sub>

🎭 撞見兩方敵人的可能局面（資料驅動·GAS 擲、AI 演）。取代舊「永遠互毆→見你停手」單一劇本：依雙方御主性格投契度（masterPersonaLean_）＋從者傷勢＋戰局殘敵數，擲一種局面；HP 餘傷／敵敵盟約等後果由 GAS 落地寫進 allPcData，note 只給 AI 當演出事實。回 factionClash {type,aMaster,bMaster,loserName,note}。加局面＝往權重表 W 加一項＋switch 補一段 note，引擎自動吃。

### `playerAmbushOnEnemy_`　<sub>Router_Movement.gs:815</sub>

🐛→✅ 玩家實測抓到：foeCard 跟呼叫端的己方servantCard_各自帶一份收尾句——這裡skipClose，呼叫端(actionPlayerAmbush)組完兩張卡後用performanceNote_()統一講一次。

### `playerAmbushOnEnemy_`　<sub>Router_Movement.gs:820</sub>

🐛→✅ 稽核抓到：survive跟god_hand結構性互斥(見fateStrike_同款規則)，這裡原本沒排除god_hand——同時持有兩者時survive會搶先頂血，god_hand的after<=0判斷永遠進不去，燒命帳目跟主戰鬥路徑對不上。

### `setEncounterWindow_`　<sub>Router_Movement.gs:825</sub>

🎯 撞見敵人後的「可反應窗口」：御主 MEMORY【趁隙】<loc>@<type>@<svA>、<svB>。決定抵達這格開放哪些情境選擇。窗口在「再次移動」時清掉（悄悄離開）或被下一次抵達覆寫；趁隙/挑撥用掉即清。

🐛→✅ names 補上這場局面實際牽涉的兩名敵從者真名——舊版只存 loc@type，actionIncite 事後靠陣列順序重新猜「前兩個」敵從者，同地若有第三組完全無關的敵人排在更前面，會被誤挑撥/誤傷，跟玩家剛讀到的敘事(哪兩個在對峙)完全脫鉤。有 names 就精確鎖定，缺 names(相容舊呼叫)才退回猜測。

### `playerAmbushOnEnemy_`　<sub>Router_Movement.gs:844</sub>

🥷 趁隙偷襲：撞見敵人分心（殺紅眼/對峙/談判/剛結盟）時，我方從者搶一記奇襲。複用 resolveFateBattle_ 的 ambush 先機，鏡射 enemyAmbushOnServant_ 反向版：命中才傷、奇襲加乘、處理敵死亡(DEAD_/無牙御主/勝利)。回 out 物件（err＝不合法）。

🐛→✅ 稽核抓到：舊版用裸findIndex永遠挑表列第一個在世從者出擊，跟fate_battle/bond/use_seal等十餘處呼叫端同樣讀userData.servant/servantId、透過findPlayerServantIdx_尊重玩家UI切換的「出戰從者」形成不一致——雙從者玩家切到後奪來的第二從者，這裡仍會派原從者出手，UI操作形同無效。補上wantSv/wantSvId兩參數，改用單一真實來源findPlayerServantIdx_。

### `actionFactionAmbush`　<sub>Router_Movement.gs:866</sub>

🐛→✅ 稽核抓到：chargeApOrReject_原本沒skipWrite，內部窄寫(AP/day/hour)後緊接著下一行又整列寫回同一列——同一列兩次Sheets I/O。補skipWrite:true，讓下面這次整列寫回一次到位。

### `actionFactionAmbush`　<sub>Router_Movement.gs:871</sub>

🐛→✅ 舊版命中就無條件講「重創」，GAS 明明算出 eHpMax 卻沒換算實際傷勢比例——比照其餘兩處撤退/夜襲同款修法。

### `actionFactionAmbush`　<sub>Router_Movement.gs:918</sub>

🐛→✅ 稽核抓到：這裡只驗證窗口loc+type，從沒比對win.names——同地若有「窗口點名兩人之外」的第三方敵從者，原本也能被targetName指到、白吃趁隙偷襲加乘，但對方根本沒被這場對峙分心過。比照actionIncite既有的win.names鎖定寫法補上。

### `actionIncite`　<sub>Router_Movement.gs:942</sub>

🐛→✅ 稽核抓到：舊版loIdx/wiIdx/mIdxA/mIdxB各自立即setValues(最多4次)，改成全程只改記憶體，跟函式尾端bumpBond_(skipWrite)/chargeApOrReject_(skipWrite)一起併入下方單次整表寫回。

### `actionIncite`　<sub>Router_Movement.gs:959</sub>

🐛→✅ 稽核抓到：chargeApOrReject_原本沒skipWrite，內部窄寫後下一行又整列寫回同一列，同一列兩次Sheets I/O。補skipWrite:true，讓下面這次整列寫回一次到位。

### `actionIncite`　<sub>Router_Movement.gs:963</sub>

🐛→✅ 稽核抓到：舊版loIdx/wiIdx/mIdxA/mIdxB各自立即setValues、bumpBond_也各自立即setValue，成功分支最多6次Sheets I/O往返——現全程只改記憶體pcData，這裡單次整表寫回一次到位。

### `actionIncite`　<sub>Router_Movement.gs:970</sub>

🐛→✅ 舊版固定取 foeSvs[0]/[1](陣列/試算表列序)，跟玩家剛讀到的敘事(resolveFactionEncounter_實際挑中哪兩組)毫無關聯——同地≥3組敵人時，可能挑撥/傷到敘事完全沒提到的第三組。win.names帶著那場敘事真正牽涉的兩個真名，優先用真名精確比對；缺 names(相容舊窗口)才退回陣列順序猜測。

### `actionIncite`　<sub>Router_Movement.gs:977</sub>

🐛→✅ 稽核抓到：win.names查無時原本會退回foeSvs[0]/[1]陣列順序猜測——正是這支函式要修的那個bug本身，只是換一種觸發方式(點名的兩位已死亡/離場，但同地還有≥2組完全無關的第三方敵人)。已經有明確真名可查證時，查無就該直接拒絕，不再退回瞎猜。

### `detectAllyPeril_`　<sub>Router_Movement.gs:987</sub>

🐛→✅ 舊版回傳沒帶血量，呼叫端只能無條件講「情勢緊繃」——GAS明明有這名盟友的HP/上限，卻沒算成緊急程度餵給AI，導致95%血量從容應對 跟 8%血量命懸一線 讀起來一樣嚴重。

### `actionIncite`　<sub>Router_Movement.gs:993</sub>

🐛→✅ 挑撥離間指名兩個具體角色、要求AI演出他們反目/合流戒備的性格化反應，卻從沒附上他們的演出依據卡(比照唯一姊妹路徑 actionFactionAmbush 已有的 servantCard_+foeCard 慣例)。

🐛→✅ 玩家實測抓到：兩張卡各自帶一份完整「怎麼演」收尾句——skipClose後用performanceNote_()講一次。

### `enemyAmbushOnServant_`　<sub>Router_Movement.gs:1030</sub>

🐛→✅ homeRank(D~EX)是GAS已經算出的陣地規模事實，舊版卻沒換算成強度用詞——同一句「優雅擊退」套在陽春D階土壘跟EX階空中庭園級結界上，AI完全分不出差異，讀起來千篇一律。

### `enemyAmbushOnServant_`　<sub>Router_Movement.gs:1069</sub>

⚔️ 卸防突襲：在同地有清醒敵從者時做「補魔／羈絆／休息」等卸下防備之舉，會招致敵從者趁隙重擊我方從者（氣息遮斷／暗殺職階更致命）。回 null＝無敵不觸發；否則 {enemyName,dmg,defeat,dreamPrompt,after,stealthy}。preferSvIdx(選填)：呼叫端若已用 findPlayerServantIdx_ 選定「玩家當下操作/提及的那位從者」(如 actionBond/actionManaSupply/actionSpiritRepair 的 svIdx)，這裡優先打這位；驗證仍為存活我方從者才採用，否則(未提供/驗證失敗)退回原本「同局第一位存活從者」的預設。🐛→✅ 稽核抓到：雙從者(rule_break_steal奪到第二名)情境下，這裡舊版永遠裸找「第一位」從者，跟呼叫端敘事引用的「玩家當下相處/供魔/療傷的那位從者」完全脫鉤——玩家選第二從者操作時，敘事文字說是它遇襲/陣亡，實際扣血/標記陣亡的卻是第一從者，兩者矛盾且從者身分張冠李戴。

### `enemyAmbushOnServant_`　<sub>Router_Movement.gs:1080</sub>

🐛→✅ 玩家反應「不可能每次休息/補魔/結盟都是打我吧」——舊碼不論好感一律突襲，跟移動路徑既有的「BOND≥50＝友好·不追殺」門檻(見上方 actionMove 的 hostile check)不一致：已經養出交情的敵從者沒理由每次都翻臉偷襲。門檻對齊同一顆常數，友好者這裡直接視為無敵可趁。

### `enemyAmbushOnServant_`　<sub>Router_Movement.gs:1097</sub>

🐛→✅ 稽核抓到：survive跟god_hand結構性互斥(見fateStrike_同款規則)，這裡原本沒排除god_hand——同時持有兩者時survive會搶先頂血，god_hand的after<=0判斷永遠進不去，燒命帳目跟主戰鬥路徑對不上。

### `enemyAmbushOnServant_`　<sub>Router_Movement.gs:1101</sub>

🐛→✅ 稽核抓到：反擊方svR漏注禮裝(injectMysticBuff_)與御主體術/魔術支援(injectMasterSupportFor_)，對照鏡射函式playerAmbushOnEnemy_(831-833行)兩者皆注——同一段代碼裡敵方eDefC卻正確拿到支援，形成不對稱，禮裝越貴/御主養得越好的玩家在這條合法防禦機制裡傷害被系統性低估。

### `enemyAmbushOnServant_`　<sub>Router_Movement.gs:1114</sub>

🐛→✅ 這支從沒附上入侵者的演出卡(servantCard_)，指令又寫死「語氣留白」——AI 完全沒有這名敵從者的性格/口吻依據，只能寫成無聲的暗影，玩家回報「對方沒有對話??」。四個突襲呼叫端(休息/羈絆/結盟/補魔)都吃這支函式的回傳，補一次就四處一起修好(單一真實來源)。

### `enemyAmbushOnServant_`　<sub>Router_Movement.gs:1130</sub>

🎲 卸防時刻的敵方反應多樣化（玩家回饋「不可能每次都是打我」）：不是每次都直接開打——依這名敵從者的職階/性格擲一次，多數仍是偷襲(維持既有的臨場威脅感)，但狂化(無法言語)／暗殺(本色即偷襲)以外的職階，有機會按兵不動觀望、或帶著戒心試探接觸(無戰鬥、羈絆小幅變動)。

### `actionSetWorkshop`　<sub>Router_Movement.gs:1201</sub>

🐛→✅ 稽核抓到：原本先整列寫回(帶著扣AP前的舊AP)、chargeApOrReject_才扣AP，內部又補寫一次——同一列兩次Sheets I/O。改成先扣AP(skipWrite跳過內部窄寫)，最終狀態再整列一次寫回。

### `actionScavenge`　<sub>Router_Movement.gs:1244</sub>

🐛→✅ 稽核抓到：原本先整列寫回(帶著扣AP前的舊AP)、chargeApOrReject_才扣AP，內部又補寫一次——同一列兩次Sheets I/O。改成先扣AP(skipWrite跳過內部窄寫)，最終狀態再整列一次寫回。

### `homeTerritoryRank_`　<sub>Router_Movement.gs:1251</sub>

🏰 主場陣地判定：玩家於【自己佈設的陣地】迎戰 → 回主場結界階(供減傷/反擊)；不在自己陣地回空。★任何人親手設的陣地(結界/機關/監視術式)都給【基礎 D 階】主場防禦——這是「設置陣地」對所有人承諾的「敵襲反被擊退／安全港」；隊上若有【陣地作成】從者則升到其階(C/B/A/EX·空中庭園級)、結界更強。(2026-07 修：舊版沒陣地作成從者就回空→無陣地作成的玩家設了陣地卻毫無防禦、被敵直接突襲，與承諾不符。)

### `actionScout`　<sub>Router_Movement.gs:1294</sub>

🐛→✅ 同批修正：漏傳戰爭標記會讓偵查範圍納入第四次限定地點(海特飯店等)，白掃一個本局根本不存在的地點。

### `getScavengedLocs_`　<sub>Router_Movement.gs:1309</sub>

🔍 搜索物資：偵查鄰近敵蹤為主，順手撿拾零星魔力（耗 1 AP）⚠ 反「無痛回魔」：每地的散逸魔力有限，搜刮一次即枯竭——同地重搜只得殘渣。想真正回滿池要付永久代價(補魔)或靠時間(靈脈/陣地/休息)。標記記於 MEMORY【搜刮】loc1、loc2...(已枯竭地點清單)。

🐛→✅ 舊版用 makeTextTag_ 只能存「單一」最近搜刮地點，玩家在A、B兩地間來回搜刮可無限白嫖：搜A(標記枯竭=A)→搜B(標記被覆寫成枯竭=B，A的枯竭紀錄就此消失)→回搜A又被當成全新地點、領滿額——跟註解自陳的「同地重搜只得殘渣」設計意圖矛盾。改成存「所有已枯竭地點」清單、用 indexOf 判斷是否曾搜過，而非跟單一最近值相等比對，才是真的「每地限一次」。

### `actionScavenge`　<sub>Router_Movement.gs:1348</sub>

35% 機率察覺鄰近敵蹤（揭露一名最近的未偵查敵）——搜索的真正價值在情報

🐛→✅ 稽核抓到：舊版直接掃全表第一個未SEEN的敵蹤，沒有比照姊妹函式actionScout做「範圍限定(當前+鄰近地點)」與「hasArrived_登場日閘門」——會把地圖另一端、甚至本局劇本尚未登場的敵情提早揭露，跟訊息文字「附近/一帶」自相矛盾，也繞過戰爭迷霧設計。補齊同一套規則。

### `actionScout`　<sub>Router_Movement.gs:1400</sub>

🐛→✅ 稽核抓到：舊版漏了hasArrived_「尚未登場」日期閘門——對照buildMapNodesPayload_/actionMove等其餘所有敵蹤可見性判斷都會擋這道，唯獨這裡漏掉，會把還沒登場的敵御主/敵從者真名+地點提早洩漏給玩家與AI敘事、還永久標記SEEN，形同繞過戰爭迷霧設計。

---

## `gas/Router_Narrative.gs`

### `buildDreamPrompt_`　<sub>Router_Narrative.gs:44</sub>

🐛→✅ 舊版寫「第二人稱」，跟這段敘事同樣要吃的 miniSystem 規則1(當時是旁白第一人稱「我」、禁用「你」)直接矛盾——當時改成一致的第一人稱。⚠ 2026-09 整套翻面：miniSystem 規則1 已改成第二人稱「你」＝玩家，這兩支夢境提示詞跟著回到「你」。

### `buildVictoryDreamPrompt_`　<sub>Router_Narrative.gs:55</sub>

🐛→✅ 同 buildDreamPrompt_，「第二人稱」跟當時的 miniSystem 規則1(旁白第一人稱「我」禁用「你」)矛盾，改一致。⚠ 2026-09 規則1 已翻面成第二人稱，兩支同步改回「你」。

### `stripLeakedScaffold_`　<sub>Router_Narrative.gs:81</sub>

防禦性過濾：miniSystem 本身充滿 ★指令/〈演出卡〉等鷹架符號，小模型偶有機率把提示詞格式原樣「回音」進輸出，讓玩家讀到突兀的系統指令。正常敘事只會是純散文+<br><br>、不合法含這兩種符號，故清除不會誤傷。⚠ 刻意不清【標籤】：callGeminiAPI 失敗時的柔性 fallback 文案本身就刻意用【】當視覺標籤顯示給玩家，一併清掉會弄巧成拙。

### `narrateWithState_`　<sub>Router_Narrative.gs:112</sub>

🩸 自動附「當前狀態」(御主＋在場從者 HP/MP)，敘事才連貫(剛被爆打後該寫狼狽、非沒事人)。讀不到就略過。

順帶組「軌跡骨幹」(buildTrajectoryDigest_)，沿用同一次整表讀取、零額外讀表；接在 system 訊息後，排在 messages 陣列最前面(system → chatHistory → 當前這輪)。

### `narrateWithState_`　<sub>Router_Narrative.gs:138</sub>

🐛→✅ callGeminiAPI 全部重試失敗時回傳的保底文字 JSON 格式跟真正成功的敘述一樣，會被誤當合法敘事回傳、進而存進歷史(actionNarrateOnly)供下次呼叫餵回AI，讓AI誤以為那句「什麼都沒發生」的保底措辭是既定劇情事實。有 _genFailed 旗標時當成失敗處理，回 null 讓既有的null 分支(呼叫端本就有)接手——那條分支本就不會寫進歷史。

### `actionNarrateOnly`　<sub>Router_Narrative.gs:165</sub>

longForm 旗標(2026-09 由 deepseek 更名，因為它從來就不綁廠商)由補魔/強制補魔的高好感解鎖分支夾帶，該分支指令要求 500~600 字(遠長於平常 100~160 字)，720 tokens 會截斷，故加大上限；其餘呼叫不受影響(仍是720)。它**只控 max_tokens、不換模型**——模型整併後兩軌只剩 AI_MODEL 一顆。

### `DOJO_CAUSE_`　<sub>Router_Narrative.gs:181</sub>

⚠ 刻意【不】走 narrateWithState_：道場是賽後的教室、不是戰場——miniSystem 的「旁白人稱鎖定」(2026-09 前是第一人稱「我」、之後是第二人稱「你」，兩者都框住旁白)「語氣依血量決定·瀕死就是命懸一線」跟道場要的「兩人對話＋刻意輕鬆詼諧」正面打架（舊版是在提示詞尾巴硬寫一句「無視戰場的緊張基調」去對抗它，那是補丁不是解法）。給它自己的說書人設定，順便省掉整表讀＋歷史讀——賽後講評不需要跟前情連貫。

⚠ 提示詞本體收回 GAS：前端只送「哪一種敗因」的鍵，文案查表(DOJO_CAUSE_)在後端組——加一種敗因＝往表加一列。（前端組提示詞的地方只剩移動的 arrivePrompt。）

---

## `gas/Router_Persona.gs`

### `QUAD_EMPTY_`　<sub>Router_Persona.gs:51</sub>

skipNone=true 時該格若為空或字面「無」直接跳過不顯示(給御主卡/敵御主卡沿用既有的無資料防呆)；

false 時保留全部4格(給 servantCard_ 用，段數不足時仍顯示「無」，不靜默漏項)。

無資訊量的值：空、「無」、以及 parseTraitsHelper 那幾個「跟標籤同義反覆」的 fallback 預設值（「卸下心防的私密一面：卸下心防時的柔軟一面」這種——標籤已經把話講完，值等於沒填）。

### `performanceNote_`　<sub>Router_Persona.gs:69</sub>

🎭 表演總則（單一真實來源）：show-don't-tell／正典認知覆蓋／羈絆親疏，這句對「這次提示詞裡出現的每一位角色」都適用、內容固定不變——不管同框幾位，只需要講一次。names 傳入這次同框的所有真名，servantCard_(row,{skipClose:true}) 呼叫端負責在組完所有角色卡後、於此收尾一次。

### `servantCard_`　<sub>Router_Persona.gs:78</sub>

🎭 從者「演出依據」卡：真名/職階/個性/對御主/口吻(含自稱)/萌點/招牌動作/六圍/技能/寶具壓成一段塞進 narration 提示詞，讓 AI 依『我們定義的角色』內化演出（只當背景、不准說嘴）。

🐛→✅ 玩家實測抓到：同一場戰鬥/事件常同時呼叫本函式2~4次(我方/敵方/盟友/敵盟協防從者)，每次呼叫都各自帶一份完整的「怎麼演」收尾句(show-don't-tell/正典認知/羈絆親疏)——這句是固定不變的表演總則、不是各角色專屬的事實資料，一場戲裡重複3~4次純屬浪費字數、稀釋注意力。opts.skipClose=true 時省略這句，呼叫端改在組完所有角色卡後，用 performanceNote_() 只講一次。不傳 opts(絕大多數單一角色卡的呼叫端)行為完全不變，向下相容。

### `servantCard_`　<sub>Router_Persona.gs:100</sub>

排除字元集用 `｜|【`(兩種 pipe 都排)，跟 getPersonaSpeech_/getPersonaTic_ 一致，避免尾端吃進雜訊字元。

servantCard_ 是我方/敵/盟友從者共用同一份卡，「對御主：X」在敵/盟友從者身上易被誤讀成「對玩家忠誠」，

故欄位加「自己」二字消歧義（對自己御主的忠誠態度，而非對玩家）。

### `servantCard_`　<sub>Router_Persona.gs:112</sub>

persona.look 召喚時已複製進 row.TRAIT(parseTraitsHelper)，跟 fp/toM/persona 一樣退回讀列，別讓 p 變空物件時這格靜默消失。p.look 是種子原始格式(「N段外貌・・、末段氣質」)，得先過looksToTraitParts_ 轉成分格慣例(跟 row.TRAIT 寫入時同一條處理管線)，否則 quadLabeled_直接切「、」會漏接「私密一面」、氣質也可能跟外貌擠在一起。

### `servantCard_`　<sub>Router_Persona.gs:130</sub>

🐛→✅ 玩家反饋壓字數：這兩句原本各自完整解釋「為什麼」，但保留的兩個guard(換衣不換人／不依職階慣例)本身沒有冗字可砍，純粹是措辭精簡，內容不變。

### `servantCard_`　<sub>Router_Persona.gs:137</sub>

🐛→✅ 同批修正(比照 masterCard_)：萌點沒講頻率，容易連續幾場戲都反覆用同一個具體動作點出反差，讀起來像機械公式——補「不必每回合硬塞、情境對了才自然浮現」。牽涉隨身物品的萌點又特別容易被濫用(摸一下該物品零成本、不需情境鋪陳)，額外提醒別靠這招交差。

### `masterCard_`　<sub>Router_Persona.gs:157</sub>

🐛→✅ 【出身】舊版只在創角時寫入 MEMORY，全專案沒有任何讀取點——純寫入死資料，玩家選的出身(如「教會代行者出身」)從此再也影響不到任何敘事。補讀取，併進演出依據卡。

### `masterCard_`　<sub>Router_Persona.gs:179</sub>

🐛→✅ 「扮演正典御主」入口存在的意義就是讓AI認得這個真名、調用原作形象——但這支卡從沒讀過getPlayedMaster_，玩家選了扮演卻等於沒選。servantCard_/enemyMasterCard_都有對應的「若認得此真名出自Fate正典…」提示，這裡補齊同款。

### `masterCard_`　<sub>Router_Persona.gs:187</sub>

🐛→✅ 玩家實測抓到：萌點只講「不能直接講出來」，沒講「不用每回合硬塞」——這張卡幾乎每次敘述都帶上，AI 手上唯一的反差素材只有這句，連續幾回合就會反覆重複同一個具體動作(如每場戰鬥都摸一次口袋布偶)，讀起來像機械公式，show don't tell 變相變成另一種 tell。萌點若牽涉一個實體物品(如隨身小物)又特別容易被濫用——AI隨手就能讓角色摸一下該物品，零成本、不需情境鋪陳；比起需要先出現對應情境才演得出來的反應型萌點(如被戳到痛處才崩潰)，物品型的天生更容易被拿來當萬用填充動作。故額外點名提醒別靠「摸/看一眼隨身物品」交差。

### `masterCard_`　<sub>Router_Persona.gs:199</sub>

🐛→✅ 玩家實測抓到：這句只給了「問句/思索」一種收尾範例，模型連續戰鬥回合就每次都套「接下來怎麼辦/要撤退還是繼續」這句同型問句收尾，讀起來像跳針。收尾方式不是只有問句——沉默對峙、蓄勢待發的動作、一個眼神/呼吸也同樣能「停在決策點前」，效果一樣但形式該換著來，尤其連續幾回合都還沒分曉的同一場戰鬥，不能每次都問同一種問題。

### `sealGenderFact_`　<sub>Router_Persona.gs:208</sub>

masterCard_ 內嵌的「性別${sex}」只是孤立事實標籤，沒教 AI 該怎麼據此裁定肢體互動，小模型便預設男性插入視角；這裡把配對事實算好直接餵給 AI。與 kanshou Gallery.gs 的 genderHintStr 邏輯類似但完全獨立、不共用(solo/kanshou 機制須徹底隔離，CLAUDE.md 紅線①)。

### `sealGenderFact_`　<sub>Router_Persona.gs:215</sub>

🐛→✅ 稽核抓到：masterCard_把御主原始性別(含合法選項「異」)原樣印成「性別異」，這裡卻悄悄把「異」歸類成女性向處理——兩者同框出現在同一段prompt時，「性別異」跟「御主為女性」字面互相矛盾。「異→女性向處理」本身是全專案既有慣例(對齊heroToKanshouRow_/kanshou genderHintStr同款規則)，不是要改的地方；只在措辭上承認原始標記，避免跟masterCard_直接打架。

### `enemyMasterCard_`　<sub>Router_Persona.gs:227</sub>

🎭 敵御主「演出依據」卡（精簡）：戰鬥現場若敵御主本人在場(同地)，讓 AI 依其性格給反應/台詞，別讓對方全程沉默——只塞夠判斷語氣與萌點的精簡片段(性格全4項/特徵/萌點)，不塞六圍/寶具/全份人設。跟 masterCard_ 不同：這是 NPC、AI 可自行決定其言行反應，不受「不可替玩家做決定」那條限制。

🐛→✅ 玩家實測抓到：本卡跟 servantCard_ 同框的3處(戰鬥主路徑/暗殺分支/抵達場景)，各自收尾都在講一次「show don't tell＋正典認知優先」——跟 performanceNote_() 內容重疊。opts.skipClose=true 時省略這段重疊部分，呼叫端把敵御主真名併入同一次 performanceNote_()；「非沉默背景板」這句是敵御主專屬的行為準則(非共用不變句)，不受 skipClose 影響、恆常保留。不傳 opts 行為完全不變，向下相容。

### `findPlayerServantIdx_`　<sub>Router_Persona.gs:269</sub>

🗝️ 取我方從者列索引：指定 wantName 則優先取該名，否則取第一個在世從者（雙從者用）

🐛→✅ 2026-07「整體重構·id優先」：舊版用 String(...).includes(want) 子字串比對，雙從者其一真名為另一人前綴時(如「阿爾托莉雅」vs「阿爾托莉雅・奧爾塔」)會選錯人——跟 Router_Battle.gs 的wantSv 早已修過的同一種bug，這裡是漏修的孿生。改走單一真實來源 findPcRowIdx_(id優先、名字走nameLoose_精確比對，不再是子字串)，13+個呼叫端(補魔/靈基修復/羈絆/休息/搜索/偵查/整備等)一次到位。

---

## `gas/Seed_Codex.gs`

### `SEED_SERVANTS`　<sub>Seed_Codex.gs:12</sub>

🌹 daily* 欄位撰寫鐵則(鑑賞專用；2026-07 玩家「不要告訴 AI 該怎麼說話，要讓她自己演出這個角色」)① 零引號零台詞：寫死一句「笨蛋」，AI 就整場笨蛋笨蛋、連 NSFW 也笨蛋——寫進去的字面它一定照抄。② 不寫形容詞標籤(嘴硬/傲嬌/天然呆)：那是結論不是素材，AI 只會把形容詞複述一遍。③ 寫「條件→反應」的行為傾向(越在意越說反話／被道謝就侷促)：給它演算法，讓它自己生台詞，同一條規則能演出一百種講法，換場景(含 NSFW)也自動換講法。格式硬限制：dailyLook 必須剛好四格「外貌、氣質、**日常口吻**、行為傾向」(2026-09：第3格正名為口吻——它本來就只有【口吻】這一個出口；自稱只有在不是尋常的「我」時才寫進這一格。特徵只吃第 0/1/3 格)——三處硬依賴parts.length>=4(Gallery.gs 髮色解析/traitSrc/初見口吻)，少一格會整串掉回舊拆法、口吻變空；dailyWords 四格「表象、內裡、喜歡、討厭」(鑑賞只送前兩格)；格內連接一律用「・」，「、」是分隔符，寫進格內會吃掉後面的資料；dailyBack 上限 28 字(heroToKanshouRow_ 會截斷)。

### （檔案層級）　<sub>Seed_Codex.gs:176</sub>

基線＝非理想御主下的恩奇都(供魔不足)；與銀狼結契才回全盛全A·寶A++(masterSynergySix_)，

此 synergy 僅供手動 MEMORY 標記【御主】銀狼 觸發(銀狼已無自動配對戰場)。

筋力下限為B：原作「變容」使他六圍浮動恆在A~B之間、從不掉到C。

### （檔案層級）　<sub>Seed_Codex.gs:236</sub>

🌹 這3位是聖杯戰爭正典御主(非從者)，直接進英靈殿供鑑賞「直接召喚」。cls 刻意標'御主'(非七大從者職階)：solo召喚頁職階清單與 actionSummonServant 白名單皆會擋下，只有鑑賞召喚得到；wars 標'客串'排除於混亂模式敵從者池外。six/技能/寶具留空——這幾位在鑑賞只演出、不涉戰鬥。

### （檔案層級）　<sub>Seed_Codex.gs:242</sub>

🎯 2026-07 玩家「凜好死板、要傲嬌感覺」：舊資料把「傲嬌」這個標籤寫了三遍(私下一面「越在意越說反話」＋內裡「刀子嘴豆腐心」＋speech「毒舌卻關心」)，卻一個具體行為都沒給——AI 只能複述那個標籤，於是每回合都在嘴硬說反話。改成寫「她會做出什麼」：手先動、話後到，被道謝/被看穿就升級成攻擊。傲嬌是動作與言詞相反，不是罵人。

### （檔案層級）　<sub>Seed_Codex.gs:305</sub>

第四次

circuits=15/magic_rank=C：他的魔術回路數量少質量也差(原作明寫、故Saber供魔得靠愛麗絲)，

真正殺傷力來自起源彈與戰術，「天才殺手·蹩腳魔術師」的反差不該被回路數字掩蓋。

### `upgradeCodexPersonas_`　<sub>Seed_Codex.gs:336</sub>

speech)，AI 只能複述標籤、演成一路嘴硬，改成寫具體行為(手先動話後到、被道謝就升級)。v71：25位種子的 daily* 全面改寫成「行為傾向」(零引號零台詞)＋壓縮26%。⚠ 改 daily*/persona 一定要順手升這個版號——升級閘是 codex_persona_ver !== CODEX_PERSONA_VER，沒升版 upgradeCodexPersonas_ 不會跑，改再多種子對既有存檔都是 no-op(只有全新試算表才吃得到)。v70：玩家覺得「巨乳」太直白、這句話會顯示在玩家可見的狀態欄——美杜莎/斯卡哈x2改成「胸前豐盈」這種自然敘述句，AI生成prompt同步要求別用生硬標籤呈現。逐版校對細節與查證來源見 SOLO_REFERENCE.md §21，不在此堆積歷史留言。

### `SEED_RECLASSED_`　<sub>Seed_Codex.gs:411</sub>

🔄 重刷「已召喚實體化」從者的【戰鬥數據】(寶具/六圍/標籤 fx)為最新種子值——種子改了，已在場的從者也跟上。依 (真名, 職階) 對應種子(斯卡哈 Lancer/Assassin 同名靠職階區分)。只刷 GAS 掌的數值欄；⚠ 不動 HP/MP/MEMORY/敘事欄/狀態/位置/羈絆，保住玩家實例狀態與逆天改命。查無種子(AI 原創從者)→跳過。

⚠ 換職階遷移表：種子改版連職階都換掉時(舊 key→新 key)，已召喚實體的 RANK 欄還存舊職階，單靠 (真名,職階) 對不上新種子，換版削弱就永遠不生效於既有存檔。

🐛→✅ 舊表另有 '貞德｜Ruler': '貞德｜Archer' 一條，新舊 key 指的「貞德」在現行 SEED_SERVANTS都查無此人(regulation 換版遺留的懸空項)，久放只會混淆維護者，故清除；只留下面這條活的改名映射。

### `resyncSummonedServants_`　<sub>Seed_Codex.gs:432</sub>

🐛→✅ 舊碼查無新 key 就直接改 RANK，若遷移表的「新 key」本身也是懸空值(如已從種子庫整個移除的英靈)，會把玩家實例的職階欄改成一個查無數據的職階、卻因下面 !s continue 而拿不到新六圍/技能同步——職階跟戰鬥數據對不上。改成先確認新 key 真的解得到種子才動 RANK。

### `resyncSummonedServants_`　<sub>Seed_Codex.gs:452</sub>

🌸 鑑賞眾生(獨立分頁)補刷：上面 k_ 分支掃的是「眾生」，但鑑賞同伴其實住「鑑賞眾生」分頁，原分支永遠掃不到(§125 死分支)。這裡對鑑賞列刷三樣會被寫進在場卡的種子衍生欄：BACK(dailyBack)、TRAIT(最新 dailyLook 四段)、MEMORY 的【口吻】(最新 dailyLook 第3段)——種子措辭修正(如大河「動不動自稱」→「得意時自稱」)已召喚的同伴才吃得到。工房/AI原創查無種子不動。

---

## `gas/Seed_Rivals.gs`

### `FATE_5TH_ROSTER`　<sub>Seed_Rivals.gs:42</sub>

第五次聖杯戰爭正典陣容（master_id, hero_id, 冬木落點｜可選 arriveDay：第N天才登場，預設1＝開局即登場；arriveHint：登場前1~2天的世界風聲自訂提示句，未填則退回依職階的泛用措辭；master 可為 null＝真正無御主的孤身從者，seedRivalsForGame_ 只鋪從者列、不建對應御主列）本作對正典的偏移：① Rider(美杜莎)配間桐櫻(黑化)——原作真正契約者是櫻，慎二只是表面御主。② 間桐慎二改配吉爾伽美什——跨戰爭客串，慎二失去Rider後的替代從者；wars 標籤純敘事metadata。③ 佐佐木小次郎為真正無御主的孤身從者，蟄伏柳洞寺(與美狄亞同地)，耗魔靠現有 enemyCanAffordNp_ 的殘存儲備。

### `heroToNpcRow_`　<sub>Seed_Rivals.gs:72</sub>

🐛→✅ 稽核抓到：safeJson_只擋「解析失敗」，若儲存格是合法JSON但非陣列(如物件)，dflt不會生效——跟 Router_Creation.gs 的 actionSummonServant 同款補上陣列型別檢查，避免壞資料寫進敵從者列。

### `heroToNpcRow_`　<sub>Seed_Rivals.gs:106</sub>

復活命數：敵從者也要吃 god_hand 的 lives 覆寫(如尼祿3)，否則 getGodHandLives_ 誤套赫拉克勒斯專屬預設11。

🐛→✅ 舊版只在技能物件本身寫死 lives 時才補標記，漏了 Router_Creation.gs actionSummonServant對玩家自己召喚 ai_gen 原創從者的同一條後備規則(無 lives 時 ai_gen→3命)。混亂模式明確允許玩家原創英靈進敵人池，一旦這類從者被抽中當敵人，這裡沒有 ai_gen 後備，就會落回預設11命——同一隻從者玩家自己召喚只有3命，變成敵人卻有11命，比原設計硬了近4倍。

### `masterToNpcRow_`　<sub>Seed_Rivals.gs:121</sub>

御主殿列 → 眾生(NPC)列（敵御主：凡人、弱）heroMagicRank：共用魔力池公式(masterPoolMax_)需要英靈魔力階，不能只算御主自己迴路，否則契約強英靈(如阿爾托莉雅魔力A)的御主反而池子明顯偏小。

### `masterToNpcRow_`　<sub>Seed_Rivals.gs:134</sub>

🐛→✅ COL.MASTER.ALIGN(2026-07 新增)之前 SEED_MASTERS 沒這欄可讀，這格永遠空——enemyMasterCard_讀陣營那段邏輯看似在跑、實際上從沒讀到值。現在有值了，補上單一真實來源的搬運。

### `masterToNpcRow_`　<sub>Seed_Rivals.gs:138</sub>

敵御主與玩家御主同制：HP 看迴路(masterMaxHpMp_)，MP 走共用魔力池公式(masterPoolMax_＝迴路×10＋從者魔力×2)。

🐛→✅ masterMaxHpMp_ 本身已補迴路上限(Math.min(50,...))，但這裡沒把「同一個」夾好範圍的值同時餵給沒有上限的 masterPoolMax_、也沒同步寫進 MEMORY【迴路】——SEED_MASTERS 剛好有兩位circuits > 50(伊莉雅絲菲爾-5th:80、肯尼斯-4th:65)，導致她們 HP 被夾在 50 迴路水準、MP 卻按真正的 80/65 算，兩邊從開局第一天起就內部不自洽。玩家自創御主的建角流程(Router_Creation.gsactionManualNpc)已修過同一個坑，這裡比照同一套夾法、同一個值餵兩處＋寫進 MEMORY。

### `seedRivalsForGame_`　<sub>Seed_Rivals.gs:207</sub>

🎲 隨機登場日：比照正史roster的登場機制(hasArrived_/setArriveDay_)；前 CHAOS_GUARANTEED_IMMEDIATE_ 組保證第1天就在(開局至少有東西可打)，其餘每組50%機率延後第2~5天登場。不自訂 arriveHint，退回 worldTick_ 依職階的泛用措辭即可。

### `seedRivalsForGame_`　<sub>Seed_Rivals.gs:242</sub>

🐛→✅ heroToNpcRow_ 無條件給敵從者 CONTRIB=3(「對面御主的3道令咒，可緊急脫離」)——但令咒本是御主的資源，真正無御主的孤身從者(如佐佐木小次郎)沒有人能燃令咒命他撤離。舊版沒歸零，Router_Battle.gs 的令咒緊急脫離分支見 CONTRIB>0 就照樣觸發，因無【御主】連結退回「同地點就當作是他的御主」的相容性後備，若剛好有其他敵御主同駐一地(如柳洞寺的葛木宗一郎)，會被誤判成孤身從者的主人、一併強制傳送撤離，把他跟自己真正的從者硬生生拆散。

---

## `gas/Setup_FateWorld.gs`

### `ensureFateSheets_`　<sub>Setup_FateWorld.gs:62</sub>

🔵 冪等建表主函式：缺則補、含則略。回傳本次新建的分頁名陣列。只在登入畫面「檢查/建立試算表」按鈕(check_sheets action)手動觸發，doGet()/handleGameAction() 皆不自動呼叫——玩家測試期常直接清空試算表重來，自動檢查沒必要且曾因快取蓋過頭導致「缺分頁不自動補」的bug，故改純手動、不再快取。

### `reseedIfEmpty_`　<sub>Setup_FateWorld.gs:98</sub>

r2：新增第四次限定地點(海特飯店/麥肯基宅/碼頭倉庫)＋補WAR欄同步，見下方 upsert 迴圈。

r3：🐛→✅ 稽核抓到：「冬木·海濱大道」/「冬木·遊樂園」座標原本是貼近原點的負數佔位值(4,-2/-1,-3)，跟其餘18列4~90正數座標系明顯不一致，也跟Script.html的LAYOUT硬編碼座標(86,85/11,91)對不上——getNearbyLocations()拿COORD算曼哈頓距離排序「鄰近地點」，壞座標會讓這兩處嚴重失真(該近變遠)。改成與LAYOUT一致的座標，upsert迴圈會回填既有試算表。

### `reseedIfEmpty_`　<sub>Setup_FateWorld.gs:135</sub>

🐛→✅ 稽核抓到：上面只 upsert(更新既有＋補新增)，沒有孤兒清除——若未來坤圖重新命名/移除某地點，舊名字的列會永遠留在每份已建置過的試算表裡變成永久幽靈地點，跟 Seed_Codex.gs 的upgradeCodexPersonas_/upgradeMasterCodex_ 已有的孤兒清除機制不對稱(坤圖沒有對應步驟)。補上：現有列若其名字不在當前 FATE_MAP_SEED 名單內視為孤兒直接刪除(此表純地理、無per-game 資料，同上方註解「安全覆寫」的前提，刪除同樣安全)。用 d2(append前的快照)由下往上刪，行號才不會因刪除而錯位；之後才用 getLastRow() 追加新地點，兩步互不干擾。

---

## `gas/Time_World.gs`

### `findGameMasterIdx_`　<sub>Time_World.gs:10</sub>

⏳ 時鐘不用獨立表：每個世界(game_id)恆只有一位御主，日/時/AP 直接存在【御主自己那一列】(COL.PC.DAY/HOUR/AP)，天然 1:1 對應、無需獨立 join 表。函式簽名維持「傳 gameId」不變，只在內部找御主列；呼叫端手上已有整表 pcData 時直接吃記憶體，沒有才整表掃一次找御主列(fallback)。

### `spendAp_`　<sub>Time_World.gs:77</sub>

消耗 AP：1 AP = 1 小時。足夠則扣 cost、推進 cost 小時、回 {ok,ap}；不足回 {ok:false,ap}。傳 pcData+sheets 可全程零額外整表讀寫(只改記憶體+單列3欄寫回)；不傳則自行整表讀一次(相容舊呼叫)。skipWrite(選填)：呼叫端保證隨後必有一次涵蓋這3欄的批次整表寫回時傳true，省掉這裡的單列立即寫入。

### `leylineAt_`　<sub>Time_World.gs:130</sub>

🔮 靈脈：依坤圖地點「類型」給每小時回魔基值。靈地(柳洞寺/河畔)匯聚最高、據點/祭壇(宅邸/教會)中等、城區野外最低。坤圖已靜態化(getMapDataCached 直接讀 FATE_MAP_SEED 常數，零 I/O)，此函式被 applyRegen_／playerServantEconomy_ 高頻呼叫也不必擔心整表重讀成本。

### `servantEconomy_`　<sub>Time_World.gs:150</sub>

💠 從者每小時魔力收支（時回與前端顯示共用）。有理有據的供養經濟：收入 = 御主供給(迴路×0.5) + 靈脈(地點) + 工房(在自己居所／Caster 陣地 +8)支出 = 維持費(六圍總和/8；狂化×1.5)——越貴的英靈越難養回傳每小時魔力點數 { supply, ley, workshop, income, drain, net }

### `applyRegen_`　<sub>Time_World.gs:232</sub>

對「御主＋同行從者」施加 hours 小時的時回；mult＝倍率（移動 1、休息 2）。HP：靈基自我修復(每小時 5%×倍率)；MP(從者)：走魔力收支經濟(供給+靈脈+工房-維持)，休息把「收入」加倍、維持不變；魔力觸底會反傷靈基。只改記憶體 data；回傳是否有變動。

### `applyRegen_`　<sub>Time_World.gs:293</sub>

御主魔力淨收支（休息把收入加倍、維持不變）→ 寫回御主 MP。🩸 被動燃血(只扣御主)：池見底、時消耗補不上的缺口 → 御主自動燃命續契約，缺口÷2 由血肉支付，從者一律不扣血(從者無自有魔力池，代價全在電池=御主身上)；保底 1 HP，不直接秒死但會磨成殘血。

### `MANA_DAY_TAG_`　<sub>Time_World.gs:342</sub>

🔋 敵御主每日回魔：敵御主電池只會被 drainForNp_ 扣、從不隨時間自然回——長局若不補，放過一次寶具後就永久魔力見底，往後所有遭遇都啞火(反而喪失「寶具是孤注一擲」的張力)。不用玩家那套逐時供需經濟(NPC 不必算到那麼細)，改用最簡單的「新的一天回滿」：MEMORY 記最後回魔的絕對日；worldTick_ 每次執行，見到記錄的日 < 當前日 → 補滿並蓋新日期戳。

### `refillMastersDaily_`　<sub>Time_World.gs:363</sub>

多名敵御主同天需回魔時，MP/MEMORY 各整欄一次寫回(取代迴圈內逐列 setValues 的零散往返，同 worldTick_ LOC 批寫手法)

🐛→✅ 補 BATTLE_DEFER_WRITE_ guard：呼叫端(worldTick_)若被上層要求延遲寫入(如 actionMove 稍後自己整表批次寫回)，這裡也該一併略過，否則同一批 MP/MEMORY 值還是會被送兩次。

### `WORLD_FLOOR_`　<sub>Time_World.gs:374</sub>

🌐 世界自走一輪：敵移位（偵查失效）＋ 暗處從者陣亡（戰爭自走）rounds：跑幾輪；allowAttrition：是否允許「暗處廝殺/養不起爆炸」（僅休息時 true，移動只換位）回傳 { rumors:[..文字..], moved:n }

### `ENEMY_REGEN_RATE_`　<sub>Time_World.gs:379</sub>

🩹 敵從者每輪世界自走小幅回血(不看同地/攻防狀態、不吃玩家 rest×2 加成)：撤離幾乎零成本，若敵人完全沒有回血機制，「打一下、撤退、再打一下」就能零風險磨死任何對手。回血速度遠低於玩家(不隨休息倍增)，逼玩家加快節奏或正面找到剋制手段，而不是純靠耐心刷。

### `worldTick_`　<sub>Time_World.gs:383</sub>

🐛→✅ deferWrite：呼叫端(目前僅 actionMove)若稍後自己會整表批次 setValues，傳 true 讓本函式(與其內部呼叫的 refillMastersDaily_/markMasterLostServant_，皆共用同一個全域旗標)略過自己的即時寫入——否則同一批 LOC/HP/MEMORY/MP 值會在一次移動裡被送進 Sheets 兩次(worldTick_ 先寫一次、actionMove 收尾又整表寫一次)。actionRest 呼叫時不傳(維持原行為)，因它沒有涵蓋 worldTick_ 之後還會發生的 restHours_/breakStaleAlliances_/enemyAmbushOnServant_ 寫入的最終整表寫回，貿然略過worldTick_ 自己的寫入會讓這批變動整個遺失、不只是多寫一次而已。

### `worldTick_`　<sub>Time_World.gs:395</sub>

全函式只整表讀一次，各階段(移位/廝殺/透支判定)共用同一份記憶體 data、只做局部批次寫回。

呼叫端(actionMove/actionRest)手上通常已有剛讀好的整表 → 傳 preData 直接在同一份陣列上原地改

(JS 陣列傳參考)，事後不必重讀一次整表拿最新狀態；沒傳才自己整表讀一次(相容)。

### `worldTick_`　<sub>Time_World.gs:400</sub>

🐛→✅ 稽核抓到：下面敵御主隨機移位呼叫enemyRetreatLoc_，該函式沒濾戰爭限定地點(見同批修正)，會導致5th/chaos局的敵人被移到4th限定地點後永久消失(打不到也偵不到)。這裡查一次本局戰爭名稱供傳入，只需查一次(整輪rounds共用，戰爭設定不會中途變動)。

### `worldTick_`　<sub>Time_World.gs:410</sub>

🔮 登場預告：尚未登場、但已進入「登場前1~2天」窗口的敵從者，世界風聲提前透露一絲氣息——只觸發一次(MEMORY【已預告】避免每輪重播)，不洩漏精確位置/天數；有自訂提示句(【登場提示】)就用，沒有就退回依職階的泛用措辭。

### `worldTick_`　<sub>Time_World.gs:452</sub>

🔭 已偵查到的敵人移位後【保持可見】(不清 SEEN)：一旦感應到對手氣息就持續追蹤其當前位置，否則敵人每動一次就重新隱形、玩家永遠追不到人。未偵查者 SEEN 仍為空、維持迷霧。

同地敵從者隨行：優先比對 MEMORY 裡的【御主】tag，避免同格多組互搶從者

### `worldTick_`　<sub>Time_World.gs:455</sub>

🩹 敵從者小幅自癒(見 ENEMY_REGEN_RATE_ 註解)：不論攻防/是否同地，move/rest 兩種 tick 都跑，免額外整表讀寫——沿用同一份 data，整欄批次寫回同樣挪到迴圈外一次做。

### `worldTick_`　<sub>Time_World.gs:457</sub>

第一輪：找 MEMORY 有【御主】=mName 的配對從者

🐛→✅ 2026-07 玩家「檢查solo看看有沒有問題」稽核抓到：這裡子字串 indexOf 比對是同一個前綴撞名 bug(Router_Movement.gs findClashSv_ 已修過)的未修孿生——chaos/AI原創敵御主可能撞名前綴(如「伊莉雅」與「伊莉雅絲菲爾-5th」)，處理「伊莉雅」移位時會誤命中掛在後者名下的從者並搶先 break，下方第二輪(已用 getServantMaster_ 精確比對)反而永遠輪不到。改成同一套精確比對，兩輪判準統一。

### `worldTick_`　<sub>Time_World.gs:471</sub>

第二輪：找不到配對 → fallback 抓同格任一孤身從者（MEMORY 無【御主】或御主不在同格）

🐛→✅ 註解一直這樣寫，但程式碼從沒真的檢查「孤身」這個條件——只要同地、未死，第一個掃到的從者就會被拖走，即使牠其實掛在另一位(這輪未移動/稍後才輪到的)敵御主名下，導致把 B 御主的從者誤拖去 A 御主的新位置。補上硬連結檢查：有【御主】tag 且該御主此刻仍在原地存活，才算「還有主」、跳過不拖；無 tag 或御主已不在此地，才是真的孤身可拖。

### `worldTick_`　<sub>Time_World.gs:479</sub>

🐛→✅ 玩家辛苦養出的盟友(isAllied_)不該被系統隨機抽去暗處互鬥賜死——結盟＝暫時非敵對、可倚仗的戰友，舊版這裡完全沒排除，盟友只要離開玩家所在格就有機率在背景無預警戰死，跟結盟的設計承諾矛盾。

### `worldTick_`　<sub>Time_World.gs:515</sub>

2) 暗處從者互鬥：只在「休息」時可能發生（移動只換位，不受傷）；且永遠至少保留 WORLD_FLOOR_ 名敵從者給玩家親手解決——絕不會被世界自走清光。

抽兩名離場敵從者、建成真實 combatant，走跟玩家對戰同一套 resolveFateBattle_ 結算(GAS本機算，不叫AI)——多數情況只是雙方掛彩(確實扣血、不死)，只有真的打到HP見底才會死亡。

### `worldTick_`　<sub>Time_World.gs:565</sub>

🐛→✅ 稽核抓到：這條「暗處互鬥」是獨立於fateStrike_的一套死亡判定，完全沒檢查god_hand/survive/severed——持十二試煉的敵從者(如混沌局赫拉克勒斯)被系統抽中打這場背景暗鬥，會在玩家毫不知情下真的被判定永久死亡，God Hand形同虛設。比照fateStrike_同順序補上判定。

🐛→✅ 稽核抓到：severedA/severedB 原本各自讀「該方自己」的rule_breaker/anti_magic_lance拿去擋「該方自己」的復活判定——跟fateStrike_(Router_Battle.gs)/夜襲路徑(Router_Movement.gs)的既有慣例相反：severed 該由「攻擊者」的fx決定、用來擋「被攻擊那一方」的復活。這裡是A/B互擊兩段式(strikeAB：A打B；strikeBA：B打A)，故擋B復活的severed要看A的fx、擋A復活的severed要看B的fx——原本兩者對調，導致真正持rule_breaker/anti_magic_lance的一方打死god_hand/survive持有者時，這條暗處互鬥路徑完全沒擋下復活(判定的是被打者自己沒有的fx)。

### `worldTick_`　<sub>Time_World.gs:618</sub>

⚡ LOC/HP 整欄一次寫回(取代原本每輪各寫一次·最多12h休息=4輪就是4次)——data 全程原地改，等所有輪跑完才寫，仍是同一份最終狀態，只是省去中途的重複 Sheets 寫入次數。

🐛→✅ 補 BATTLE_DEFER_WRITE_ guard：actionMove 傳 deferWrite=true 時，這裡也該略過即時寫入，交給 actionMove 收尾那次整表 setValues 一次到位，避免同一批 LOC/HP/MEMORY 值送 Sheets 兩次。

### `worldTick_`　<sub>Time_World.gs:650</sub>

🐛→✅ 舊版沒排除已結盟者——上方「暗處互鬥」段落(507行)明確有 isAllied_ 守衛，這裡漏了。玩家跟某敵從者締盟後，牠先前戰鬥留下的【靈基透支】死線並不會被撤盟約清除，時間一到就會在玩家毫不知情下把剛結盟的盟友判死，敘事還謊稱死因是「令咒燃盡」——跟雙方已休兵的現況矛盾。

---

---

# 📎 第二輪整理（2026-09·≥2 行的註解區塊）

玩家：「能刪除的備註都刪除，妳自己整理到一個地方妳自己看就好。」

程式碼那邊只留每段第一句「這在做什麼」；整段都是坑／稽核／玩家原話的就整段搬過來。
**用法不變：拿函式／常數名來這裡搜。**折行的長句會整段搬（切一半會在程式碼裡留半截話，踩過兩次）。

## `gas/Account.gs`

### `findPlayerServant_`　<sub>Account.gs:35</sub>

🧹 跟下面兩個函式同屬 solo game-lifecycle(結束一局/清檔)邏輯，鑑賞不會呼叫。

### `purgedPcIds`　<sub>Account.gs:51</sub>

順手收集要刪的每一列 pcId，一併清掉「歷史暫存」裡屬於這些 pcId 的對話列，避免結束對局的歷史列無上限累積。

### `actionEndRun`　<sub>Account.gs:72</sub>

從者/盟友要在慾海重逢，改用「英靈殿直接召喚」(見 actionKanshouSummonHero)。

### `actionAccountLogin`　<sub>Account.gs:131</sub>

尚未召喚從者時 servantAlive 恆 false，不能與「已召喚但已死」共用同一判斷，否則會在玩家還停留在召喚從者頁時就誤判整局已結束；只有 servantExisted && !servantAlive 才算殘局。

### `actionAccountLogin`　<sub>Account.gs:144</sub>

charId 指向的御主已被標記 DEAD_（或不存在）→ 殘局：先清掉整局世界再解除連結。死亡時 ID 會加 "DEAD_" 前綴， 帳號表仍存原 charId，故需含 DEAD_ 反查該列拿 game_id 一併 purge。

### `prow`　<sub>Account.gs:173</sub>

charId 那列可能已是 DEAD_ 版本（敗北時 ID 加 "DEAD_" 前綴，帳號表仍存原 charId），須兩者都查， 否則 gid 查無、下面刪除迴圈找不到列可刪，殘列留在「眾生」表，違背本函式清舊存檔的目的。


## `gas/Core_Settings.gs`

### `AI_MODEL`　<sub>Core_Settings.gs:11</sub>

預設值直寫程式碼，指令碼屬性(MODEL / FALLBACK_MODEL)有設就優先。

### `plus`　<sub>Core_Settings.gs:58</sub>

🛡️ +/-修飾字元理論上只會是UI骰出的1~2個(如"A+"/"A++")，但這欄位來源包含玩家自由輸入(見actionManualNpc的melee/magicRank)，沒上限的話可以打"A+++++++"無限灌傷害，封頂3個。

### `cleanChineseName`　<sub>Core_Settings.gs:73</sub>

全系統唯一真實來源；前端只做提示與即時擋字，後端此函式才是最終防線。回傳清洗後字串(上限10字)。

### `pMp`　<sub>Core_Settings.gs:97</sub>

魔力池告急時明講是從者自己的存亡危機(從者無自有魔力池，全靠此池維生，見masterPoolMax_/applyRegen_)， 避免AI誤演成只跟御主有關的旁支數值。

### `masterPoolMax_`　<sub>Core_Settings.gs:127</sub>

魔力高的從者(Caster/Saber 魔A)擴充共用槽；魔力低者(Assassin 魔E)幾乎只靠御主迴路。

### `getNpTelegraph_`　<sub>Core_Settings.gs:292</sub>

🔮 敵寶具預告旗標（跨按鍵持久·存敵從者 MEMORY）：達成解放條件時先「預告」蓄勢，下次接觸必定發動——給玩家一回合準備(開結界/寶具對轟/逃跑)，杜絕「無預警寶具秒殺」。get/set/clear 成套。

### `OVERCHARGE_TAG_`　<sub>Core_Settings.gs:297</sub>

🔥 補魔過充存量（存御主 MEMORY【過充】<額度>）：補魔一儀＝除回滿池外，另存下一發「規格外寶具(＋/EX)」可無償超載灌入的一池份魔力；發動大砲時優先由此支付，一次性(用完即清)。get/set/clear 成套；額度＝補魔當下的池上限。

### `masterSynergyView_`　<sub>Core_Settings.gs:312</sub>

on＝當前御主觸發全盛(亮)；否則暗(提醒需該御主)。玩家不可控——由御主決定。

### `defParts`　<sub>Core_Settings.gs:374</sub>

缺的格數改從 defaultStr 對應分段取值、補不到才退回「無」——避免玩家只打幾個字未達4段時，整句寫好的 defaultStr(如 actionEnterKanshou 準備的預設句)被晾在一邊，其餘格數變成生硬的「無、無、無」。

### `mergePhysicalStatus`　<sub>Core_Settings.gs:440</sub>

解析失敗(舊格式殘留/非JSON字串)時當作空物件繼續合併，確保 newVal 一定被套用——不能直接回傳原始oldJson，否則呼叫端以為狀態已更新，實際上被無聲丟棄且不報錯。

### `_sid`　<sub>Core_Settings.gs:452</sub>

抵換顯示。慾海 STATUS 欄仍由 NSFW 機制(intimacy_feedback)維護，供AI場景連續性內化。

### `buildPlayerStatusString`　<sub>Core_Settings.gs:463</sub>

位置索引固定（§ 協議），s[7-16] 為廢棄的九州五圍/裝備/境界欄，位置24(原鑑賞金錢餘額， 2026-07 經濟層砍除後恆空)一併填空保持前端定位不位移。

### `SEED_CACHE_SECONDS_`　<sub>Core_Settings.gs:474</sub>

🗑️ getFreshStatusString 已移除：所有呼叫端本就手握權威 pcData(STATE_PRE_DATA_ 交棒)， 一律改 buildPlayerStatusString(pcData[pIdx])，省掉每個非戰鬥動作各一次的整表重讀。

### `SEED_CACHE_SECONDS_`　<sub>Core_Settings.gs:477</sub>

⚡ 靜態種子表快取共用時數：英靈殿(客製從者部分)幾乎不寫(只在召喚/版本升級時)， 卻被戰鬥/移動/羈絆等熱路徑高頻讀取——6 小時內免整表重讀，寫入點各自呼叫對應 remove() 清快取。

### `getLocalPeopleList`　<sub>Core_Settings.gs:575</sub>

此函式只服務 solo(呼叫端見 Router_Action.gs/Router_Movement.gs)；鑑賞(actionPlay)已改用自己的精簡版 getKanshouPeopleList_(Gallery.gs)，兩軌只共用種子庫資料。


## `gas/Engine_Combat.gs`

### `attemptWithModel_`　<sub>Engine_Combat.gs:41</sub>

只有呼叫端帶 config.fallbackModel 才會觸發第二輪，其餘呼叫行為不變。回傳成功文字或 null。


## `gas/Engine_Fate.gs`

### `CONCEPT_TIER`　<sub>Engine_Fate.gs:28</sub>

高位階「進攻概念」可碾壓低位階「防禦概念」——攻方進攻階 ≥ 守方防禦階 + PIERCE_GAP 時，該防禦被無視。

### `offenseTier_`　<sub>Engine_Fate.gs:51</sub>

🌟 本次解放寶具「自身」的概念也計入(多寶具選定項/單寶具簽名)：寶具真名概念的 fx 存在 npOptions而非 skills，不會被 hasFx_ 掃到，需額外計入。

### `npBaseDice_`　<sub>Engine_Fate.gs:78</sub>

★與原作「階級＝絕對威力」掛鉤——寶具解放這一發的主威力來源；其餘 buff 只是錦上添花。

### `NP_SCALE_IDX`　<sub>Engine_Fate.gs:92</sub>

🏰 寶具規模相剋矩陣（攻擊規模 × 防禦規模 → 傷害倍率）：對城打對人 ×1.5、對界打對人 ×1.7。0x（無效）以引擎 Math.max(1) 保底為一絲擦傷，不硬鎖。

### `DEF_SCALE_`　<sub>Engine_Fate.gs:113</sub>

★固有結界(ubw)是進攻型 NP，NP 防禦由 rho_aias 機制承擔；divine_core/god_hand 各有自己的機制——均不疊加防禦規模。

### `npDefScale_`　<sub>Engine_Fate.gs:116</sub>

pierces：可選的 pierces(defFx)=>bool 閘門，與 fxDefApply_ 共用同一份概念貫穿判定，避免 territory 的規模防禦與固定減傷各自判定貫穿而不一致。不傳 pierces 時視同不貫穿(向後相容)。

### `npDefScale_`　<sub>Engine_Fate.gs:119</sub>

wall_def 不列入規模表：其本職是物理減傷(DEF_FX_)，若同時恆給對城防規模會讓一般對人寶具打持牆者恆×0.50。

### `aliveEnemyServants_`　<sub>Engine_Fate.gs:146</sub>

preData 可選：呼叫端若已持有本回合同步過的 pcData 記憶體陣列可直接傳入，省一次整表重讀；不傳則自己讀。

### `combatProfile_`　<sub>Engine_Fate.gs:213</sub>

hit=命中所用六圍　dmg=傷害所用六圍　eva=迴避所用六圍　kind=演出用招式類別

### `combatProfile_`　<sub>Engine_Fate.gs:220</sub>

💨 以巧破力(agile_striker)：唯一讓敏捷入傷害底的通道(顯示名勿用「神速」——理查正史技能撞名)——持此 fx 且敏捷高於筋/魔時，以技巧為力；未持有者敏捷不參與傷害底，避免一圍三吃。

### `combatProfile_`　<sub>Engine_Fate.gs:244</sub>

🥋 御主體術參戰：御主本人助拳的小額支援傷害(非從者自身技能)，r 取自御主【體術】階級，量級壓在wind_strike/crafting 同檔次，不喧賓奪主。

### `injectMasterMeleeSupport_`　<sub>Engine_Fate.gs:251</sub>

🥋 把御主自己的體術階級注入我方從者戰鬥單位 c 的 skills（比照 injectMysticBuff_ 同一套「找 fx已存在則略過」慣例，避免重複注入）。無【體術】記錄(空字串)則不注入——舊資料/未測定者維持零加成。

### `injectMasterMagicSupport_`　<sub>Engine_Fate.gs:262</sub>

🔮 把御主自己的魔術階級注入我方從者戰鬥單位 c 的 skills——僅當 c 是 Caster(魔砲型出擊)才注入， 體術(近戰助拳)不限職階、魔術(施法支援)限定 Caster，兩條能力線刻意對應不同陣容、避免無腦疊加。

### `servantActiveSkill_`　<sub>Engine_Fate.gs:283</sub>

數值隨技能自身階級成長(rank 折入)。戰時由 rollSkill_ 每擊擲 SKILL_PROC_ 機率是否套用全效。★只增益我方出擊、不碰防禦端。

### `fxDmgApply_`　<sub>Engine_Fate.gs:323</sub>

🛡️ 七天盾：npOnly＝只對【寶具解放】的一擊反應性投影(普攻不勞七層花瓣·不減傷)；mana＝每次展開的費用， 玩家側由呼叫端注入 _shieldMp(御主純魔)扣款、付不起張不開，敵方無注入即免費(戰鬥本色)。

### `fxDefApply_`　<sub>Engine_Fate.gs:329</sub>

npStrike＝本擊是否【攻方寶具解放】(npOnly 防禦如七天盾只對這種擊反應)。回新 base。

### `paidNote`　<sub>Engine_Fate.gs:340</sub>

引擎只記帳(_shieldSpent)，實際落表由呼叫端 settleShieldMana_ 統一結算。敵方無注入＝免費觸發。

### `m`　<sub>Engine_Fate.gs:348</sub>

⚠ 下限 clamp：mul 係數×rankMul>1 時(如未來有人給 rho_aias 掛超過 EX+ 的階級)會算出負乘子→負傷害→打人變補血。現行持有者皆不可達，純結構性防呆。

### `rowToCombatant_`　<sub>Engine_Fate.gs:390</sub>

（逾時殘影由戰鬥流程 clearHorrorShield_ 清除·此處讀 presence 即真實·不需再查時鐘·守效能）

### `servantNpOptions_`　<sub>Engine_Fate.gs:396</sub>

依 真名(＋職階) 對應；首項＝主寶具(預設·敵方也用)。回 null＝單寶具(走字串尺度)。要擴充就往這張表加。

### `npProfile_`　<sub>Engine_Fate.gs:432</sub>

r＝該次解放實際吃的階級——多寶具選項有自己的官方階級(見 servantNpOptions_)才用，沒有就退回六圍表寶具值。

### `OFFENSIVE_NP_FX_`　<sub>Engine_Fate.gs:444</sub>

🌟 多寶具英靈的「最強攻擊寶具」索引（敵 AI 解放/預告用·非玩家）：只挑攻擊型(有攻擊 fx 或 對軍以上/對神規模)， 按 概念階×10＋規模 排序取最高；無攻擊型則退 0。純防禦寶具(divine_core 金鎧等)不入選(不會拿來砸人)。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:482</sub>

須【主動解放寶具】(opts.np)才觸發——上游 actionFateBattle 的補魔閘門會扣御主魔力，非每擊免費觸發。

### `outTier`　<sub>Engine_Fate.gs:493</sub>

命中端 +outMod；傷害端 ×outTier.dmgMul（於下方主威力處套用）。御主供魔越足、從者越生龍活虎。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:505</sub>

🍱 整備·進食（戰前 buff）：攻方命中 +opts.mealBuff（由 fateStrike_ 依御主整備狀態傳入）

### `resolveFateBattle_`　<sub>Engine_Fate.gs:528</sub>

千里眼永久免疫「無欲」等封鎖先機的效果——這正是它比命中·中(first_strike/analyze)貴的理由。

### `stA`　<sub>Engine_Fate.gs:535</sub>

★一旦交手氣息即破功——後續回合的刀不再享奇襲(貼原作：發動攻擊瞬間 presence concealment 掉階)。

### `pet`　<sub>Engine_Fate.gs:558</sub>

👁️ 魔眼·石化(petrify／Rider 美杜莎)：以視線鎖死獵物，令對方迴避大減——工房唯一可購的反迴避工具， 是「閃避堆疊流」的正牌剋星。

### `_aFxC`　<sub>Engine_Fate.gs:567</sub>

🎚️ 被動技能 fx 淨加成收帳：各自 clamp ±HIT_FX_CAP 再入命中/迴避——堆疊流(敏EX+變化+直感…)無法把差距拉到「永遠打不到」；敵方施加的壓制(魔眼/天之鎖/燕返)計入同一淨額，天然是堆疊流的解。被截斷時推標籤供演出。

### `gbEvaded`　<sub>Engine_Fate.gs:586</sub>

仍是強力寶具(一般從者照樣被釘死)，只有「能扭轉命運/超越感知」者才搏得一線生機。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:640</sub>

狂化(mad)傷害暴漲／神代魔術(divine_age·下方另使敵對魔力半效)／風王鐵鎚(wind_strike)／道具作成(crafting)：皆線性被動傷害加成，SKILL_FX_ 表驅動（位置順序不變；mad 的命中/迴避-penalty 與 divine_age 的對魔力交互仍明碼）。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:648</sub>

🔮 御主魔術支援（見 injectMasterMagicSupport_ 注入來源，僅 Caster 出擊時存在此 fx）：同上，玩家/敵方兩側對稱注入，不限玩家側。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:651</sub>

🗡️ 秘劍・燕返(tsubame)：三方位同斬 ×2.3【普攻限定·僅每場第1回合】——與寶具骰/超載/規模疊乘會爆炸故限普攻；限首回合避免每回合都吃到 ×2.3。寶具解放段已無疊乘，僅剩概念位階/貫穿＋演出標籤。

### `godSlay`　<sub>Engine_Fate.gs:659</sub>

觸發＝技能帶 fx:'god_slay'(資料驅動·如阿爾喀德斯復仇者) 或 技能/特性名含「神殺」(如斯卡哈)。

### `npRank`　<sub>Engine_Fate.gs:677</sub>

對手反殺(!wRelease)維持吃自身六圍表寶具值(不受玩家寶具選擇影響)。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:683</sub>

僅「主動解放者本人(wRelease)」享用；對手反殺照其自身寶具、不吃玩家的灌注。

### `wDivR`　<sub>Engine_Fate.gs:689</sub>

🕊️ 寶具解放·神性加成：吃 divineRankOf_(traits 與 fx 皆算) 並依神格縮放，1+0.1×rankMul(自身神格)——C＝×1.1、A＝×1.17、EX＝×1.2、E-＝×1.02。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:695</sub>

fired 標籤保留供 AI 演出「真名解放·三段同時斬」。

### `npStrike`　<sub>Engine_Fate.gs:729</sub>

⚡ 「本擊是否寶具解放」（npOnly 防禦的觸發判定）：opts.np 且勝方＝解放者本人才算——守方反殺(winner=def)時敗方吃到的是普通反擊，七天盾不對其反應。

### `resolveFateBattle_`　<sub>Engine_Fate.gs:738</sub>

🛡️ 七天盾·羅·埃亞斯(rho_aias／EMIYA)：對【寶具解放】的一擊反應性投影卡帕涅烏斯之盾，七層花瓣硬擋——普攻不觸發；玩家側每次展開耗御主30魔(見 DEF_FX_.rho_aias)；遭超位階概念(ea等)貫穿則失效

### `resolveFateBattle_`　<sub>Engine_Fate.gs:741</sub>

★唯「病死宿命」之敵(恩奇都)不適用——其宿命之死無可逃避(上方已 ×3 概念碾壓)。

### `plagueImmune`　<sub>Engine_Fate.gs:744</sub>

神性判定吃 divineRankOf_，但刻意維持【二值】不隨神格縮放——這是「神之加護擋不擋得住疫病」的門檻概念，非傷害倍率，有神格庇護即減半。

### `rnL`　<sub>Engine_Fate.gs:749</sub>

減傷 10%×階級(A→-17%/EX→-20%)，救持符文的玻璃法師(斯卡蒂/玉藻前/斯卡哈)存活。regen 在此處無戰鬥修正、只在回合迴圈回血。


## `gas/Gallery.gs`

### `sanitizeAiData_`　<sub>Gallery.gs:11</sub>

唯一呼叫點是本檔 actionPlay，solo 不用此函式。

### `linkAccountToKanshouPc_`　<sub>Gallery.gs:37</sub>

只服務鑑賞(COL.ACC.KPC欄位)；solo用同檔的linkAccountToPc_/COL.ACC.PC，互不相通。

### `getKanshouPcSheet_`　<sub>Gallery.gs:74</sub>

鑑賞專屬眾生分頁：與主「眾生」隔離，頻繁新增/移除角色不污染戰爭主表。schema 與「眾生」同(COL.PC 位置索引一致)。dispatcher 會在 pcId 以 "KPC_" 開頭時自動把 sheets.pc 指到這張表。

### `translatePersonalityToDaily_`　<sub>Gallery.gs:127</sub>

跟 Core_Settings.gs 的 enrichPersonalityLikesDislikes_ 不同：那個只補缺項、維持戰時語境給solo 用；這個額外把戰場語境短句(戰意/殺意等)轉譯成適合日常展現的等價說法，只用於鑑賞。

### `getDailyHeroFields_`　<sub>Gallery.gs:174</sub>

DAILY_LOOK/DAILY_WORDS 皆在進英靈殿前就保證非空(種子手寫或工房建立時AI預轉)，故此處純讀取， 找不到快取值就退回原始戰時 look/words 當保底，不呼叫AI。

### `existingOutfit`　<sub>Gallery.gs:180</sub>

DAILY_OUTFIT：服裝跟外貌本相分開存，戰時 persona 無對應欄可退，沒快取到值就交給heroToKanshouRow_ 自己的「日常便服」保底，這裡純讀取不瞎猜。

### `dailySpeechByName_`　<sub>Gallery.gs:189</sub>

actionPlay 組同伴命格時，MEMORY 查無【口吻】標記會退回這裡的日常安全版，而非戰時原始codexPersona_(name).speech(如狂化英靈「僅餘低吼」)——避免任何路徑把戰時口吻餵給鑑賞AI。

### `heroes`　<sub>Gallery.gs:193</sub>

preHeroes 可選：同一輪 actionPlay 可能對2~3位同伴各呼叫一次，呼叫端可在迴圈外先抓一次共用傳入，省重複整表解析；不傳則自己抓，行為不變。

### `heroToKanshouRow_`　<sub>Gallery.gs:204</sub>

起始好感刻意給低值(遠低於封存路徑)，讓角色個性決定要花多久暖起來，避免架空「好感未滿80需真實戒備」的一致性鐵律。

### `dailyLookParts`　<sub>Gallery.gs:223</sub>

dailyLook 若已是四段格式(外貌本相/氣質舉止/日常口吻/私密一面)就取第 0/1/3 段當特徵三格（第2段是口吻、另有出口），過渡期舊資料才退回 looksToTraitParts_ 舊拆法，兩者相容。

### `heroToKanshouRow_`　<sub>Gallery.gs:228</sub>

萌點跟外貌/性格一樣改讀日常版(daily.moe)：戰時 persona.moe 靠戰爭/創傷撐出的沉重反差，在這個沒打過聖杯戰爭的世界裡沒有來由。

### `heroToKanshouRow_`　<sub>Gallery.gs:238</sub>

Router_Narrative.gs 的懶初始化會在 prompt 組裝時臨時補上，AI 不會拿到空物件。

### `heroToKanshouRow_`　<sub>Gallery.gs:244</sub>

鑑賞不寫IS_PARTY——已全面改用「LOC是否跟玩家目前位置一致」判斷是否同地點在場(solo自己的隊伍系統仍讀寫IS_PARTY，兩軌互不干擾)。

### `KANSHOU_REL_TIER_`　<sub>Gallery.gs:255</sub>

門檻借用鑑賞既有的兩個好感節點(60=夜襲橋段門檻、80=同床共枕門檻)當切點，數字只有一處來源。

### `_reachedWas`　<sub>Gallery.gs:301</sub>

🔒 棘輪先跑：先把「這輩子跨過的最高門檻」記下來，再用它當地板夾住這次的值。必須在下面REL_TAG／同居同步【之前】——那兩者都讀 bond，讀到未夾的值就會做出跟棘輪矛盾的降階。

### `KANSHOU_FAMILIAR_TIERS_`　<sub>Gallery.gs:332</sub>

熟悉度三階的門檻（回合數）。一個遊戲日專心陪一個人大約 20~40 回合，所以：初識＜1日 ／ 混熟 1~5日 ／ 老交情 5日以上。實玩後可調。

### `kanshouSyncRelTier_`　<sub>Gallery.gs:355</sub>

💗 交往中（不看好感看【告白成立】）：上面四段全是「還沒在一起」的溫度，交往後必須整排換掉——尤其「她在等你先開口」那句，交往後再演就變成她失憶。

### `kanshouRapportTone_`　<sub>Gallery.gs:363</sub>

isLover＝告白已成立 → 直接走【交往中】那一排，不再看好感段（見 KANSHOU_LOVER_TAG_）。

### `kanshouProposalAccepts_`　<sub>Gallery.gs:384</sub>

好感越高越可能答應；不同提議親密度不同起點/斜率（牽手最看好感、同去最隨和）。個性風味留給 AI 在敘述裡演。

### `kpc`　<sub>Gallery.gs:404</sub>

dispatcher(Router_Action.gs)已依 pcId 開頭 KPC_ 把 sheets.pc 指到「鑑賞眾生」， 這 5 顆 action 全部只吃 KPC_ 呼叫，不必再自己重查。

### `actionKanshouSummonHero`　<sub>Gallery.gs:419</sub>

避免同一位英靈用兩種職階分身重複存在於這個世界，暫時移出鑑賞可召喚名單(資料驅動，見KANSHOU_SUMMON_BLOCKED_IDS_，日後想調整只改那份清單)。

### `actionEnterKanshou`　<sub>Gallery.gs:461</sub>

→ 正名成短名；玩家 MEMORY 的牽手標記存的是她的名字，一併正名。已是短名的列跳過零寫入。

### `acctTag`　<sub>Gallery.gs:493</sub>

2️⃣ 一次性遷移：帳號表還沒連結，但舊版用 MEMORY【帳號】標記識別的角色可能還在——找到就補寫帳號表連結(下次直接走①)，不必讓玩家既有的後日談世界憑空消失。

### `loc2`　<sub>Gallery.gs:519</sub>

的外地開場，跟「本來就住在這裡」矛盾。

### `actionEnterKanshou`　<sub>Gallery.gs:534</sub>

種子秒寫階段(AI潤色前)的預設值：平行世界框架，不斷言「曾經打過又結束了一場聖杯戰爭」。

### `actionBackfillKanshouAi`　<sub>Gallery.gs:567</sub>

🚀 鑑賞御主敘事·非阻塞補生成：比照 actionBackfillMasterAi 的「先種子秒建、AI 背景潤色」模式， 於進場後背景補 AI 版 4 個敘事欄，失敗＝保留種子預設。數值/位置/MEMORY 一律不碰，只單格 setValue。

### `pIdx`　<sub>Gallery.gs:571</sub>

🔒 帳號歸屬驗證（2026-07 再稽核抓到的漏洞補上）：跟 actionPlay_ 同一種缺口——猜中/取得pcId 即可直打此 action 竄改任何人的外貌/身世/個性/萌點/裝扮，比照其餘 handler 補上。

### `KANSHOU_MASTER_GEN_SYS`　<sub>Gallery.gs:582</sub>

「御主」在這裡當成單純稱謂使用，不代表真的打過仗；「已結束聖杯戰爭/已落幕」這類斷言禁止出現(跟平行世界設定矛盾)。

### `hasMaleCompanion`　<sub>Gallery.gs:724</sub>

不看IS_PARTY——只要這個世界裡「存在」男性從者(多半是禁召前留下的舊存檔)，就不開放切換成男性玩家，避免悄悄變成不合規的男男配對。

### `actionKanshouSetName`　<sub>Gallery.gs:743</sub>

關係併入眾生列(存在同伴自己那一列，不記「對誰」的名字)，改名不影響任何同伴的羈絆，無需遷移。

### `actionKanshouSetHomeName`　<sub>Gallery.gs:757</sub>

🏠「出門走走」面板的「家」選項可自由改名(如「工房」「我的公寓」)，比照 actionKanshouSetName同款寫法，只是寫進 MEMORY【住所】標記而非獨立欄位。

### `_physicalState`　<sub>Gallery.gs:788</sub>

physical_state 只留顏面神情(≤15字)：只管表情，衣裝狀態拆進獨立的 appearance_extras 欄(下方)，兩者關注點不同——前者是每回合都可能變的暫時神情，後者是要持久記住的實際穿著。

### `_physicalStateRef`　<sub>Gallery.gs:798</sub>

🔴 npc的範本欄位填「同上」：actionPlay 落地端(本檔·intimacy_feedback 解析)的 ignoreWords 防呆清單本就含「同上」，即使AI偷懶照抄範本字面值也會被當成敷衍語忽略、不會寫進玩家看到的狀態欄，省字數不引入新的失敗模式。

### `master_note`　<sub>Gallery.gs:828</sub>

🌱 玩家御主「滾動側寫」：AI 每回合觀察玩家、慢慢認識他(像對話 AI 記住使用者習慣)。GAS 只採用【玩家仍留白】的欄位(玩家自己填過的一律鎖住、不覆寫)；經歷則每回合承接舊值滾動更新。詳見 §玩家側寫。

### `buildDefaultSystemPrompt`　<sub>Gallery.gs:831</sub>

mentioned_names/event/tag/log_summary 等死欄已移除：皆是寫入後從未被任何地方讀回的死路(前端不消費、AI不依此決策)，拿掉後AI不用再每回合多填這些欄位。

### `buildDefaultSystemPrompt`　<sub>Gallery.gs:834</sub>

守衛自動跳過缺席回合，經歷/性格/萌點保留舊值不動。

### `getKanshouPeopleList_`　<sub>Gallery.gs:859</sub>

鑑賞自己算一份精簡版「同地人物」清單，不借用 solo 的 getLocalPeopleList(那是為敵蹤/盟友情報共享等一整套機制設計的，多算了12個欄位，鑑賞前端只用得到 .name/.isExact)。

### `KANSHOU_REGIONS_`　<sub>Gallery.gs:876</sub>

鑑賞大地圖分區：純資料驅動的分區清單，只供UI分組/顯示用，region只是KANSHOU_LOCATIONS_每筆的一個標籤欄位，不影響任何既有比對/抽選邏輯(那些都認location的name)。

### `kanshouLocContextForAI_`　<sub>Gallery.gs:886</sub>

依 region 補一句大分區脈絡，讓AI知道此刻身處何種場域。找不到(AI自創地點)就回空字串、不硬套。

### `KANSHOU_ENCOUNTER_FEMALE_IDS_`　<sub>Gallery.gs:983</sub>

不含KANSHOU_SUMMON_BLOCKED_IDS_暫時移出的id。

### `KANSHOU_FESTIVAL_DONE_TAG_`　<sub>Gallery.gs:1032</sub>

🎊 今天的節慶習俗已完成(存【玩家】列·absDay)：同一天只算一次，完成後提示詞從「還沒去」的委婉提醒切成一句短短的餘韻——順便解掉「不限時段之後那句話整天每回合都印」的重複問題。

### `kanshouAsleepOutcomeStr_`　<sub>Gallery.gs:1062</sub>

把泛用住處池登記進 KANSHOU_LOCATIONS_(單一真實來源)，讓移動驗證/拜訪門檻/前端地圖等既有機制原樣吃到這些地點，不必為隨機分配的住處另開一套判斷邏輯。

### `kanshouGetHeroHome_`　<sub>Gallery.gs:1067</sub>

🏠 住處統一讀取入口：手寫專屬豪邸優先，查無才讀【住處】隨機分配記憶標記，兩者皆無才退回不可造訪的通用值(理論上七度改版後不該再發生，只保留給改版前已存在、尚未補分配的舊存檔)。

### `kanshouHeroIdByName_`　<sub>Gallery.gs:1102</sub>

依真名反查SEED_SERVANTS的hero物件(共用小helper，避免kanshouRollDailyLocation_/結束一天房間分配各自重複寫一次同款find邏輯)。

### `kanshouRollDailyLocation_`　<sub>Gallery.gs:1135</sub>

🏠 同居中：深夜大多回「和室」就寢(未命中=在外遊蕩的生活感)、清晨一半還在賴床、 夜間多在家中公共空間活動；白天(清晨/午後/黃昏未命中)照常走下方一般骰出門晃。

### `KANSHOU_KNOCK_MIN_BOND_`　<sub>Gallery.gs:1243</sub>

🚪 深夜敲門的候選門檻：只有同居、或好感≥此值(親近的人)的同伴才會半夜登你家門——泛泛之交半夜跑來敲門跟「陌生人世界」設定矛盾。要更容易撞見改小、要只限同住改大即可。

### `KANSHOU_INIT_WANTS_`　<sub>Gallery.gs:1265</sub>

🙋「她想要什麼」的素材：刻意寫成【處境】不是台詞——她要開口說什麼、怎麼說，由她的行為傾向自己長出來。加新的就往這張表加一列，引擎自動吃(資料驅動)。

### `KANSHOU_KNOCK_DAY_TAG_`　<sub>Gallery.gs:1277</sub>

🚪 夜訪當日戳(存【玩家】列·absDay)：深夜訪客一天只登門一次。落盤化之後「結束一天」可能被按很多次(她進來了→玩家打字聊天→再按一次結束一天)，沒有這個鎖就會反覆擲骰、一晚來三個人。

### `KANSHOU_FIRST_MET_DAY_TAG_`　<sub>Gallery.gs:1282</sub>

📅 初見日(存該同伴列MEMORY·absDay)：首次跟玩家同地當下蓋戳，之後相識滿7/30/100/365天且人在場時餵一行紀念日提示。0=尚未記錄(舊存檔首次相遇當天補戳，從那天起算)。

### `KANSHOU_BOND_FLOOR_TAG_`　<sub>Gallery.gs:1319</sub>

0＝還沒跨過任何門檻。只升不降，是刻意的——那正是「鎖住」這件事本身。

### `KANSHOU_CHILL_MIN_DROP_`　<sub>Gallery.gs:1324</sub>

爽約(-5)與 AI 明確表達不滿(-3 以上)才是真的有事發生。

### `kanshouRelTierLabel_`　<sub>Gallery.gs:1333</sub>

階數(由低到高·kanshouRelRank_ 的回傳值)→ 該階名稱。KANSHOU_REL_TIER_ 是唯一真實來源， 這裡只做索引反轉，不另存一份文字。

### `kanshouGetPromise_`　<sub>Gallery.gs:1365</sub>

🙋 byHer＝這個約是【她自己開口說的】、玩家從沒答應過。差別只有一個：沒赴約【不算爽約】(見 _standUp)。其餘時間×地點的結算完全共用，不另開路徑。

### `mid`　<sub>Gallery.gs:1374</sub>

有時段才寫 band:，無則沿用舊格式。★byHer 旗標只在有 band 時才附加——沒有 band 的舊格式是單段 loc，硬加會被解析成 band='loc'、loc='1'，整筆約定壞掉。

### `KANSHOU_HANDHOLD_TAG_`　<sub>Gallery.gs:1392</sub>

🤝 牽手(存玩家列·單一對象)：選定的同行對象，移動時她若同地就一定跟著走(優先但不獨佔——睡覺仍看好感80+全部，見結束一天邏輯)。放手=清空。她只是「優先帶走」的標記，不影響她的獨立生活。

### `KANSHOU_LOVER_TAG_`　<sub>Gallery.gs:1400</sub>

💗 告白成立＝交往中(存該同伴列MEMORY·【戀人】1)。這一格是好感 80 那道牆唯一的鑰匙：沒有它， kanshouSyncRelTier_ 會把好感夾在 79，於是戀人標籤/自訂稱呼/同居/最高階親密度全部進不去。

### `KANSHOU_CONFESS_DAY_TAG_`　<sub>Gallery.gs:1403</sub>

成功時不寫這格(改記進【第一次】帳)——它的語意只有「被拒」一種。

### `kanshouAlbumSheet_`　<sub>Gallery.gs:1433</sub>

相簿分頁(lazy建表)。欄位位置索引：0遊戲ID/1照片ID/2拍攝日/3時段/4地點/5天氣/6人物(、連接)/7活動/8小敘述/9旗標(親密·節慶名)/10髮色hex

### `KANSHOU_HAIR_COLORS_`　<sub>Gallery.gs:1441</sub>

髮色解析：從角色TRAIT(dailyLook外貌段)文字抓色詞→hex——種子/工房新角色通吃(dailyLook建檔時必生成)、永遠零手工；順序敏感(深紫在紫前、紅褐在紅/褐前)，查無色詞退回中性深棕。

### `KANSHOU_WEATHER_BY_SEASON_`　<sub>Gallery.gs:1456</sub>

☁️ 今日天氣(純敘事·不存表)：依月份查季節池、依日數確定性雜湊挑一項——同一天永遠同一個天氣、 跨日自然換，零round-trip零寫入。

### `KANSHOU_EVENT_SEEDS_`　<sub>Gallery.gs:1470</sub>

Phase3 輕量小事件：抵達新地點時20%機率抽一顆短句靈感種子注入提示詞，純粹給AI參考的引子(非預寫劇本、非強制發生)。分三類：日常可愛/曖昧小互動恆定開放，色氣類僅driveOn開啟時抽到。

### `getKanshouHomeName_`　<sub>Gallery.gs:1514</sub>

MEMORY標記存取器【住所】：玩家自訂的「家」顯示名稱，查無標記時預設「我家」(中性·自創御主通用；玩家仍可隨時改名)，比照 getOutfit_/setOutfit_ 同款「清除舊值再整段append」寫法。

### `kanshouNameCandidates_`　<sub>Gallery.gs:1558</sub>

🛡️ 拉丁字母大小寫寬容(SABER/Saber/saber)：AI 對英文名很常自行正規化大小寫，精確比對會讓 rel_changes/intimacy_feedback/npc_exit 整條靜默失效——含英文的候選補上三種寫法。

### `actionPlay_`　<sub>Gallery.gs:1594</sub>

🏷️ 四格頓號短句格式化(PREF/TRAIT 兩欄共用同一種「存單句、拆四格標籤呈現給AI」形狀，只有標籤文字不同)：labels=[第1格,第2格,第3格,第4格]，缺格一律補「無」。

### `actionPlay_`　<sub>Gallery.gs:1600</sub>

慾海(KPC_ 御主)專用引擎：鑑賞玩家 pcId 恆為 KPC_ 前綴，全專案已無路徑呼叫這裡走solo——入口直接擋下非 KPC_ 呼叫，函式其餘部分永遠當作鑑賞情境處理，不再分支。

### `encounterOn`　<sub>Gallery.gs:1604</sub>

巧遇開關：前端「出門走走」面板可關閉「路上巧遇陌生人」——只影響下方隨機巧遇擲骰，不影響已在場的【邂逅中】對象持續互動、也不影響同行隊伍成員。

### `_qv`　<sub>Gallery.gs:1608</sub>

🎯 [喜歡][討厭]不再送鑑賞(玩家實測「沒有特別的差異」)。空格與佔位字(QUAD_EMPTY_)整格不送，別拿「無」佔 AI 的注意力。

### `pcIndex`　<sub>Gallery.gs:1628</sub>

🔒 帳號歸屬驗證已上移到 dispatcher 統一擋（`handleGameAction`→`verifyPcOwnership_`）， 進到這裡的 pcId 已保證屬於呼叫者本人，只需純索引查找。

### `curDay`　<sub>Gallery.gs:1635</sub>

⏰ 2026-07「推進時間」玩法：鑑賞借用solo既有的COL.PC.DAY/HOUR欄位存自己的時鐘(兩軌從不共用同一個game_id，欄位互不干擾)，不另開新欄。查無值(舊存檔/尚未跑過這輪改動)時給預設(Day1 08:00)。

### `moveTarget0_`　<sub>Gallery.gs:1641</sub>

鑑賞地點移動：前端點選地點按鈕時帶 moveTarget，跟一般對話同一次 round-trip 解決——比對KANSHOU_LOCATIONS_ 合法地點清單，查無效比對一律當成普通對話。

### `_myGid_`　<sub>Gallery.gs:1644</sub>

🔒 拜訪私人住處門檻：跟屋主好感未達熟識(40)前不好貿然登門——擋在移動前，當作沒真的進門(留原地)， 給AI一句在門外卻步的情境，維持她家的私人邊界(前端已把鎖住的住處灰掉，這裡是直打API的後端保底)。

### `dirtyPcRows`　<sub>Gallery.gs:1670</sub>

鑑賞世界觀明文禁止任何戰鬥/血量變化/死亡威脅，故不帶 solo 戰鬥引擎的殘留概念(擊倒/復活/戰敗虛假之夢/剛結盟NPC排除等)。

### `_pendingNewPcRow_`　<sub>Gallery.gs:1674</sub>

🆕 本回合新增的列(目前只有「結識」會產生)：先只進 pcData 讓本回合就地生效，真正 appendRow延到寫回階段——這樣 AI 失敗早退時整回合都是 no-op，不會留下半套狀態。

### `myOutfit`　<sub>Gallery.gs:1679</sub>

同款「裝扮:XXX(當前服裝·五官體態不變)」格式補上，AI 才能讀到當前實際服裝，而非憑空假設。

### `morningAfterNames`　<sub>Gallery.gs:1682</sub>

吃到這個提示詞引子，不論這回合玩家做什麼(聊天/移動/購物皆可)。

### `actionPlay_`　<sub>Gallery.gs:1686</sub>

放在讀取狀態【之前】——本回合就該失效，不然走出去那一回合還會送出深夜獨處的提示詞。

### `kanshouProposalResult_`　<sub>Gallery.gs:1735</sub>

📣 成立/婉拒/撲空的明確回饋(相約/牽手/同居/她主動邀約 共用)——pre-AI 撲空婉拒與 post-AI 判定都可能寫它，一回合只走一條路。宣告須在相約區塊「之前」，撲空案例才寫得進去。

### `_pmId`　<sub>Gallery.gs:1754</sub>

🆔 2026-07「整體重構·id優先」：前端已補id(見actionKanshouCompanions/servants.push)，id對得上優先鎖定，找不到才退回kanshouNameCandidates_別名比對——同名/前綴混淆不再有機可乘。

### `actionPlay_`　<sub>Gallery.gs:1778</sub>

🧠→✅ 稽核抓到診斷錯誤：她【明明就在場】、是地點/時段組合不合法(住處未解鎖／該時段不開放)， 舊版卻一律回報「她不在身邊」，玩家會照著這句去找人而完全找不到問題在哪。分開兩種原因。

### `kanshouCohabitStr`　<sub>Gallery.gs:1827</sub>

🏠 邀請同居(同伴卡「同居」鈕→cohabitInvite=name)：她在場＋好感≥門檻→蓋【同居】標記(行程骰改走同居版)；好感未達→依性格婉拒、不動任何數值；不在場→撲空。

### `kanshouHandHoldStr`　<sub>Gallery.gs:1919</sub>

🤝 牽手/放手(同伴卡「牽手」鈕→handHold=name；放手→handHold='__release__')：牽的對象存玩家MEMORY，移動時她若同地就一定跟著走(見 kanshouPreMoveCompanions_)。牽手要她此刻在場才牽得成。

### `_reHourAfter`　<sub>Gallery.gs:2009</sub>

⏱️ 用「本回合結束時」的時刻算時段——氛圍句是給讀到這次回應的玩家看的，用回合開始的舊時刻會慢半拍(玩家實測：10:5x走進客廳沒跳、原地再點(已11:2x午後)才跳)。

### `_sceneIsCohabit_`　<sub>Gallery.gs:2028</sub>

同居日常＝最低優先，只補前兩層沒佔到的時段空檔；對象限【同居中】的她(非同居者剛好也在家中時不該套上「一起生活」的情境)。

### `kanshouKnockGuestName`　<sub>Gallery.gs:2048</sub>

深夜訪客入內：把訪客接來玩家現在的位置，本回合可指名互動，不推進日期——玩家想睡再自己重新點一次「結束一天」即可。唯一觸發來源是上方擲骰(不再有玩家按「開門」這條路)。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2057</sub>

🛏️ 她是剛敲門進來的，顯然醒著——若不標記，深夜(0~8點)在「我的房間」會被 pSleepStr判成熟睡，跟「她剛敲了門」直接矛盾。沿用既有 AWAKE_HERE 機制、不另立判斷。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2113</sub>

時間推到就寢時刻(判準與 endDay 的敘事時鐘同一條，不另立規則)。這裡動的是【狀態】時鐘， 因為這一夜要真的在這個時刻往下走，之後每回合照常流動 10 分鐘。

### `allEstablished`　<sub>Gallery.gs:2134</sub>

不分「同行/不同行」，所有已存在的英靈結束一天都依自己的生活重新決定要去哪——唯一例外是好感≥80且此刻確實跟玩家同地點的人，直接留在玩家房間過夜(同床共枕)。

### `advanceHours`　<sub>Gallery.gs:2171</sub>

推進時間：跟結束一天不同——不強制拉玩家回家，只是讓時鐘往前跳N小時；不在身邊的英靈依新時刻重骰去向，同行同伴不受影響。上限抓3年區間防呆，不做逐小時模擬(跳多久都是O(1))。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2174</sub>

🎊「跳到節慶」：advanceHours未指定時，改由jumpFestival算出「到下一次該節慶還有幾小時」， 算好就丟進同一套邏輯，不重複寫一次時鐘推進/地點重骰。

### `_jumpSceneBreak`　<sub>Gallery.gs:2204</sub>

★換幕鐵律：時間快轉後是全新場景——AI 最容易犯的錯是接著把上一段(如剛才的牽手/對話)再演一次， 這裡明講禁止複述、直接寫新時段的當下。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2255</sub>

巧遇開關 + noEncounter地點(家的房間)是私人空間 + 此地已有established的人在場：三者皆需通過才擲陌生人骰。

### `kanshouIsAwakeWithMe_`　<sub>Gallery.gs:2261</sub>

🎲 Phase3 輕量小事件：每次抵達新地點才擲一次，20%機率抽一顆靈感種子注入提示詞，只是給AI參考的引子、非強制劇本(家也適用——這是同行同伴間的氛圍調味，不是陌生人巧遇)。

### `activeId`　<sub>Gallery.gs:2267</sub>

這次到訪還在場邊的巧遇對象(【邂逅中】)，只要人還沒隨著換地點離開，就持續讓AI知道可以繼續指名互動——不只是觸發那一瞬間的單回合permission，同一次到訪期間都有效。

### `relMemMemoryStr_`　<sub>Gallery.gs:2292</sub>

「專屬稱呼」記憶點：抽成共用函式，鑑賞同伴清單(partyDetailsArr)跟其他清單一起補上， 不重複貼一次解析邏輯。

### `relMemMemoryStr_`　<sub>Gallery.gs:2350</sub>

📣 赴約成功發明確回饋——前端靠它跳綠條＋重抓同伴清單(_kcCur)，睡前爽約警示才不會拿過期資料誤報「今天還有沒赴的約」(稽核抓到的假警報)。

### `kanshouInitVisitName_`　<sub>Gallery.gs:2419</sub>

🙋 這一刻自己走來的人名（供【在場來由】用，比照深夜訪客 kanshouKnockGuestName）——沒有這一欄的話她會被算成「你們從剛才就一直在這裡」，跟★【她自己找來了】互相打架。

### `_cands`　<sub>Gallery.gs:2472</sub>

地點條件與玩家自己相約時完全同一套(見 _pmLocOk)：不能是私室、不能是現在站的地方、 別人家要先解鎖、有時段限制的要對得上——同一份規則不重寫第二遍。

### `_fTodo`　<sub>Gallery.gs:2515</sub>

⚠ 委婉提醒要有【人】才成立：這條通道沒有名字前綴(不像 scene ambient 會冠 _sceneNames)， 身邊沒人時說「可由她提一句」等於指派給一個不存在的人。獨自一人就只留客觀事實。

### `kanshouApptTodoStr`　<sub>Gallery.gs:2524</sub>

📌 今日待辦·約定(組在節慶之後、共用同一種「GAS 看得到的客觀事實」語氣)：只給時間地點對象， 要不要提、由誰提、怎麼提全交 AI。她在場時她自己提得起來；不在場就是玩家自己心裡記著這件事。

### `_tierBond`　<sub>Gallery.gs:2584</sub>

💗 關係階質變偵測：只升不降、跨多階只報最高那一階。第一次見到她時靜靜記下當前階(不報)——剛認識的人不該演出「我們變成朋友了」，那不是質變、只是初始值。

### `_fsts`　<sub>Gallery.gs:2613</sub>

💞 她的「第一次」帳(GAS 蓋的既定事實·日期換算成玩家看得到的西曆)。依日期排序、只取最早幾筆——這段每回合都會進提示詞，不設上限玩久了會持續膨脹；而最早的那幾筆本來就是最有份量的。

### `kanshouTierCrossStr`　<sub>Gallery.gs:2673</sub>

刻意不報幕(不出現數值/階級名詞)，只讓那份轉變自然發生在她的態度與距離感裡。

### `kanshouHoldingStr`　<sub>Gallery.gs:2688</sub>

🤝 牽手中·常駐氛圍：牽的對象此刻真的同地在場才提示(被時間推進骰走就不提)。這回合剛牽/放手的當下演出走 kanshouHandHoldStr，這條是「牽著手的後續回合」持續帶出親密感。

### `_phNamedMembers`　<sub>Gallery.gs:2705</sub>

🏷️ 點名比對走候選橋：列是短名(SABER/櫻)，玩家打全名「拍阿爾托莉雅」也要命中，免得人像被誤判風景。

### `kanshouShowPhotoStr`　<sub>Gallery.gs:2724</sub>

📷 看照片(showPhoto=照片ID)：手機拍完立刻能看，把照片拿給在場的人看——拍到自己→害羞/得意， 拍到別人→評論/暗暗吃味。

### `partyDetailsArr`　<sub>Gallery.gs:2738</sub>

📅 赴約/爽約結算已上移到 partyRows 之前(見上方)——她登場(pin到curL)必須先於在場名單計算， 否則「純聊天/拍照」路徑(不重骰位置)會讓 AI 拿到沒有她的在場卡。此處不再重複。

### `_partyHeroCodex`　<sub>Gallery.gs:2742</sub>

⚡ 提速：dailySpeechByName_ 對每位同伴呼叫都會重新解析英靈殿快取字串，這裡在迴圈外先抓一次共用傳入，省掉重複整表解析。

### `r`　<sub>Gallery.gs:2746</sub>

需要 sameGame 過濾——若不同局/不同帳號剛好撞名(種子有限、AI原創從者皆可能撞)，會把別局同名者的資料塞進本局的敘事提示詞。

### `pBond`　<sub>Gallery.gs:2759</sub>

純聊天好感卡在梯度上限這件事本身不會反映在數字上——GAS默默夾住漲幅，若不順便告訴AI， narration可能寫出「感情大幅推進」這種跟機制矛盾的橋段。只在卡住時才加這句提示。

### `pRelTagStr`　<sub>Gallery.gs:2764</sub>

只在低梯度(尚不熟識)才加一句態度提示，中高梯度不需要、也不該畫蛇添足限制發揮。

### `_chillDay`　<sub>Gallery.gs:2767</sub>

🧊 趨勢(不是 level)：這幾天有沒有讓她不高興過。只給事實，怎麼表現交給她的個性——同樣一件事，傲然的人是話變少、溫順的人是笑容淡一點，不寫成統一的「冷淡」模板。

### `pMemoirRaw`　<sub>Gallery.gs:2797</sub>

💞 共同回憶(27欄 MEMOIR)：你們一路走來累積的里程碑，讓 AI 自然承接你倆的專屬過往(儲存用全形｜分隔，餵給 AI 時換成「；」較好讀)。空的就不加這行。

### `relMemMemoryStr_`　<sub>Gallery.gs:2812</sub>

🚪 深夜訪客最優先：她是這一刻才敲門進來的。舊版靠另一個★區塊(kanshouKnockGuestStr)講， 跟這一欄的「你們從剛才就一直在這裡」直接打架——同一件事只能有一個出處。

### `genderHintStr`　<sub>Gallery.gs:2846</sub>

🟢 性別配對提示，直接算好給 AI，不需要它自己推理。3人同場時先分組(與玩家同性/異性)，同組共用一句規則、只在句首列名字，避免逐一 NPC 各寫一整句規則重複。

### `_isPlainBody_`　<sub>Gallery.gs:2867</sub>

👕 玩家裝扮只在【玩家資料】那一行講一次（就在提示詞第二行）——舊版在這裡再送一次， 那是排版還很長的時代留下的補償，現在整份提示詞已經短很多，重複沒有意義。

### `kanshouNightGuestStr`　<sub>Gallery.gs:2891</sub>

🚪 夜訪當下的【客觀事實】：玩家原本正要歇下、她這時候找上門，房裡還有誰。只陳述事實， 各人反應(牽手中那位吃味/尷尬/大方，還是根本樂見)一律交給 AI 依各自性格與好感演。

### `_kanshouMaxBond_`　<sub>Gallery.gs:2902</sub>

深夜訪客：她的LOC已在前面被設成curL，之後會自動出現在partyRows裡拿到完整卡片，這裡只補一句「剛敲門進來」的情境描述(卡片本身不會講這件事的來龍去脈)。

### `relMemMemoryStr_`　<sub>Gallery.gs:2909</sub>

🎯 三種「確定性提議」的裁定就在 _pendingProposal.accepted，統一在這裡轉成人話；其餘按鈕在各自分支已填好 _settledVerdict。組成最後一行的尾巴——玩家意圖與 GAS 結果同在收尾處。

### `_ppName`　<sub>Gallery.gs:2912</sub>

⚠ promise 型的 _pendingProposal 沒有 name 欄（只有 idx），寫死 .name 會印出空的『』——比照 post-AI 落地那段(_ppHer)的既有寫法，name 拿不到就回列上讀。

### `prompt`　<sub>Gallery.gs:2940</sub>

鑑賞無戰鬥，御主的 HP/MP/MAX_HP/MAX_MP 這4欄從未寫入，故 prompt 不提血量/魔力數值或瀕死判斷(與世界觀規則「禁止血量/生命變化」一致——該禁令在下方 USER 世界觀＋演出而非說明兩行)。

### `relMemMemoryStr_`　<sub>Gallery.gs:2991</sub>

⚠ 不帶 people：這條沒人真的移動，夾 people:[] 會把前端localNPCs 快取洗成空(2026-07 稽核抓到這裡漏做了同一個已修過的防護)。

### `kanshouPhotoResult_`　<sub>Gallery.gs:2996</sub>

📷 拍照落地：AI成功回應才寫相簿(沒有底片，失敗也無所謂)。敘述吃AI的photo_caption， 沒吐就用「時段的地點·人物」模板保底；髮色從第一位被拍者的TRAIT現場解析(通吃工房新角色)。

### `_accepted`　<sub>Gallery.gs:3027</sub>

🫶 成敗由 GAS 於 pre-AI 依好感擲定(_pendingProposal.accepted)，不再讀 AI 的 proposal_accept——AI 只負責照裁定演出她的反應。(2026-07 由 AI 判定改 GAS 判定·kanshouProposalAccepts_)

### `relMemMemoryStr_`　<sub>Gallery.gs:3054</sub>

loc：move 婉拒的通知條要顯示地名(稽核抓到「不想去「」」空字串)；其他型別不讀此欄、帶著無害。

### `relMemMemoryStr_`　<sub>Gallery.gs:3088</sub>

肉體/外顯走 intimacy_feedback(physical_state)。

### `relChangesToProcess`　<sub>Gallery.gs:3092</sub>

🛡️ AI偶爾會漏包陣列包裝或塞null元素，forEach前先擋形狀，避免整回合(含narration)被一個TypeError整段吞掉——防呆原則跟本檔其餘AI輸入處理一致(sanitizeAiData_同款精神)。

### `nIdx`　<sub>Gallery.gs:3101</sub>

用 kanshouNameCandidates_ 比對，容忍AI只用括號前後其中一段稱呼TA。

### `relMemMemoryStr_`　<sub>Gallery.gs:3113</sub>

純聊天加好感卡在目前梯度上限，約定赴約/橋段才能突破(見kanshouRelChatCeiling_)——只夾正向漲幅， 好感下滑(change<0)不受影響。

### `relMemMemoryStr_`　<sub>Gallery.gs:3117</sub>

AI 對關係標籤沒有任何寫入權（attitude 欄位已於 2026-07 整組移除，全檔無人讀它）。

### `relMemMemoryStr_`　<sub>Gallery.gs:3120</sub>

🧊 掉分達門檻→記下今天。注意要用 change 本身而不是 newFav-oldFav：棘輪把值夾在地板上時兩者差 0，但「她確實不高興了」這件事仍然發生過，不該因為分數扣不動就當沒事。

### `sanitizeAppearanceExtras`　<sub>Gallery.gs:3146</sub>

appearance_extras：AI 如實回報的當下實際穿著/配飾，篩掉敷衍語後直接交給既有 setOutfit_ 寫回持久的【換裝】記錄(setOutfit_ 本身已有 40 字硬上限與清洗特殊字元，這裡不重複截斷)。

### `relMemMemoryStr_`　<sub>Gallery.gs:3215</sub>

🛡️ 跟上面rel_changes同款自己排除——AI若在npcs清單誤寫玩家本名(NSFW雙向情境確實可能誤觸發)，這裡沒擋會找到pcIndex、把「NPC視角」的欄位寫進玩家自己列。

### `relMemMemoryStr_`　<sub>Gallery.gs:3241</sub>

只記里程碑、日常填「無」不動；她在場時會被讀回在場卡(見 partyDetailsArr)餵給 AI 承接。

### `relMemMemoryStr_`　<sub>Gallery.gs:3269</sub>

含慾海角色前綴 KPC_(御主 avatar)／KSV_(封存邀請同伴)／KHV_(直接召喚同伴)，否則後日談的好感/肉體/衣服/親密狀態寫不回去。

### `kanshouClock`　<sub>Gallery.gs:3312</sub>

時段按鈕/時段行動需要每回合都拿到最新時鐘，跟buildClientState_同一份kanshouClockInfo_， 不重複拼字串。

### `actionGetAlbum`　<sub>Gallery.gs:3342</sub>

==========================================📷 相簿 actions（拍照本體在 actionPlay 的 takePhoto/showPhoto 分支，這裡只有讀取與刪除） ==========================================讀相簿：本局全部照片(新到舊)。手機拍完立刻能看，不再有沖洗中狀態。dateLabel後端算好(kanshouAbsDayToDate_)，前端零日曆邏輯。


## `gas/History_Sync.gs`

### `safeContent`　<sub>History_Sync.gs:64</sub>

歷史遺留：舊紀錄可能存了字面 <br>(Gemini 直接輸出標籤)，跳脫後變裸字——一併轉回換行。

### `purgeHistoryForPcIds_`　<sub>History_Sync.gs:77</sub>

trimRowsByOwner 只擋單一 pcId 超量，整張表從不清；結束局在此清掉該局所有 pcId 的歷史列， 否則表無上限成長，久未登入帳號的紀錄也會被擠出 getGameHistory 的最後 1000 列讀取窗口而靜默遺失。


## `gas/Mystic_Code.gs`

### `MC_COMBAT_`　<sub>Mystic_Code.gs:32</sub>

要新增/調整禮裝戰力，只動這張表＋上面的 fx 對應；引擎(resolveFateBattle_)透過 mcCombatFx_ 自動讀取。


## `gas/Router_Action.gs`

### `sanitizeUserData_`　<sub>Router_Action.gs:73</sub>

------------------------------------------🔹 主進入點 (Main Entry) - 極致精簡版------------------------------------------🔴 全域輸入防護：所有玩家輸入在進入任何 action handler 前，先在此統一過濾。 前端 maxlength/檢查皆可被繞過(devtools、直打API)，故後端必須是唯一可信的防線。

### `CHINESE_NAME_FIELDS`　<sub>Router_Action.gs:81</sub>

參照既有角色的欄位(targetName/newRelName 等)不清洗，以免破壞改版前可能存在的非中文名查找。

### `handleGameAction`　<sub>Router_Action.gs:137</sub>

🛡️ 慾海(kanshou)無戰鬥／經濟機制(CLAUDE.md「不打工、無經濟、無戰鬥」)。前端 UI 全部隱藏這批action，但直打 API 仍可能繞過；統一在此明確擋下，讓限制是結構保證而非依賴資料形狀湊巧擋住。

### `handleGameAction`　<sub>Router_Action.gs:160</sub>

⏳ 14天時限·中央攔截：任何「會推進時間」的動作(回應帶 clock 字串)若已跨過第14日 → 統一補敗北旗標， 免每個 action 各自判。用回應現成的 clock，僅在真跨日時才做一次眾生讀取建時限夢。

### `handleGameAction`　<sub>Router_Action.gs:225</sub>

🧹 move 已非共用action——鑑賞地圖改走kanshouMoveTo/kanshouProposeMove，前端不再送action:'move'， 讓 Router_Movement.gs 的 actionMove 保證只服務 solo。

### `myGameId`　<sub>Router_Action.gs:258</sub>

只比對 NAME 會在不同局剛好撞名時洩漏別局角色狀態/關係；限比呼叫者自己的 game_id(myGameId 為空時放行，相容沒有 game_id 的舊資料)。

### `actionUpdateFate`　<sub>Router_Action.gs:283</sub>

名字配：solo 限同行從者；鑑賞(k_)無 IS_PARTY 概念(列從不寫此欄·卡片的改命鈕原本恆「查無此人」)， 同世界名字直配——改同伴的敘事欄(個性/特徵/身世/萌點)是合法自訂操作(比照 update_rel_tag 豁免)。

### `buildTagsPayload_`　<sub>Router_Action.gs:315</sub>

preData＝呼叫端已讀好的整表，傳入即免重讀(省整表 I/O)。關係併入眾生列，不再需要 preRel。

### `isFateCtx`　<sub>Router_Action.gs:324</sub>

下方 servants.push 組裝的戰鬥限定欄位(魔境/符文/synergy/理想鄉/多寶具/深淵海怪)須明確以isFateCtx 擋成 null，不能只靠「鑑賞列 TAGS/SKILLS 恆空」這種資料形狀僥倖安全。

### `buildTagsPayload_`　<sub>Router_Action.gs:368</sub>

門檻本身走 KC_CONFESS_BOND_ 鏡射，這兩個是【逐人狀態】、只能由後端算好下傳。

### `buildTagsPayload_`　<sub>Router_Action.gs:400</sub>

🌹 慾海卡「特徵」用：COL.PC.TRAIT 才是全代碼庫「特徵」的真實定義(外貌描述)， TAGS.traits 是戰鬥特性標籤(神性/英雄)，兩者不可混用。

### `buildClientState_`　<sub>Router_Action.gs:456</sub>

⚡ preData：手上已有最新整表陣列的呼叫端(見 STATE_PRE_DATA_ 交棒機制)傳入複用，省掉整表重讀——前提是該 handler 的所有寫入都已反映回它那份陣列。沒給→照舊自己讀(權威 fallback)。

### `isKanshouSync_`　<sub>Router_Action.gs:460</sub>

markRivalsSeen_ 是「戰爭迷霧」機制(找同 game_id/同地敵對陣營標記已見過)，鑑賞眾生從無敵對陣營列，跳過以免每次白掃一輪從沒中過的迴圈。

### `buildClientState_`　<sub>Router_Action.gs:476</sub>

🕰️ 鑑賞需把day/hour餵給前端才能判斷時段(如是否顯示「準備早餐」)；沿用`clock`放顯示字串(HUD同solo)， kanshouClock 另給結構化欄位供前端邏輯判斷(顯示字串不好拿來比對)。

### `finalNick`　<sub>Router_Action.gs:553</sub>

★ 消毒規則抽進 Gallery.gs 的 sanitizeNickname_——AI 那條寫入路徑也走同一支(單一真實來源)。


## `gas/Router_Battle.gs`

### `fateStrike_`　<sub>Router_Battle.gs:24</sub>

✨ 我方從者作守方時也吃御主禮裝被動（防禦端：如全世界之鞘承受寶具減傷）＋💠 注入御主純魔作「展開扣魔」防禦(七天盾)的付費額度——引擎付不起就張不開

### `fateStrike_`　<sub>Router_Battle.gs:84</sub>

不在此立刻補寫 MEMORY 單格：下方 4 條出路都會對 pcData[tgtIdx] 做一次整列 setValues()， 此格寫入必被覆蓋——省一次多餘 API 呼叫，隨後面任一整列寫入一起落表。

### `fateStrike_`　<sub>Router_Battle.gs:93</sub>

平白燒掉御主寶貴的令咒逃命，牠自己就能免費復活。高位階寶具概念可「一擊燒掉多條命」，壓倒性 overkill 再加成。

### `lossN`　<sub>Router_Battle.gs:100</sub>

位階取「fx 概念階」與「寶具規模(對人/軍/城/界)」較高者，故 Saber 對城 Excalibur、Gilgamesh 的 ea 都吃得到。

### `fateStrike_`　<sub>Router_Battle.gs:110</sub>

🩸 傷害溢出【不封頂】：一擊打穿現有 HP 後，每再滿一個「復活線(20%靈基)」的溢出傷害 → 多燒一條命(同海怪護盾的溢出原則)。故一記壓倒性寶具可一口氣燒去多條命，而非每擊固定一條。與概念下限取較狠者。

### `escMaster`　<sub>Router_Battle.gs:153</sub>

🔗 用硬連結【御主】找「這名從者真正的御主」，避免同地多組時抓錯人（曾出現 A 御主一道令咒帶走 B 御主的從者的離譜 bug）。舊角色無連結→退回同地比對。

### `fateStrike_`　<sub>Router_Battle.gs:168</sub>

⚠ sealNote 同時會進玩家看得到的回合報告(k.note)，別在這裡塞「★」AI指令字面(那種只該進 aiPrompt，見下方buildDreamPrompt_ 呼叫處另加的一行)——玩家讀到裸露的鷹架指令會很怪。

### `nameLoose_`　<sub>Router_Battle.gs:233</sub>

導致明明同地有敵卻「此世界查無此目標」。傳入空字串時回空(呼叫端須自行擋空名)。

### `buildPartyIdxs_`　<sub>Router_Battle.gs:247</sub>

🗝️ 雙從者：收集所有在世我方從者列索引，出戰中的 atkIdx 排最前(寶具/令咒/斬首優先權只落在他身上)——斬首分支的 asnParty 與主戰鬥路徑的 partyIdxs 是同一段複製貼上，2026-07 稽核抽出共用。

### `INDEPENDENT_ACTION_RESERVE`　<sub>Router_Battle.gs:311</sub>

🔮 單獨行動(Independent Action)：御主已亡/查無連結時，僅此特性的從者能靠靈基殘存硬撐一手——是「殘存的最後一口氣」不是「獨立供魔」，固定小額、不隨階級放大，通常不夠再放一次寶具(見 npPranaCost_)。

### `SOLO_RESERVE_TAG_`　<sub>Router_Battle.gs:314</sub>

用掉就少、【不回復】。

### `enemyCanAffordNp_`　<sub>Router_Battle.gs:319</sub>

無主時僅「單獨行動」者靠殘存靈基硬撐（讀【殘存】餘額·drainForNp_ 實扣），其餘無主即啞火。回 {afford, masterIdx}。

### `STANCE_SHARE_`　<sub>Router_Battle.gs:330</sub>

後方支援(stealth)＝0%·躲在後方不涉險；見機行事(normal)＝5%·相機補位；正大光明(open)＝10%·堂堂立於陣前共擔傷勢。

### `applyMasterStanceShare_`　<sub>Router_Battle.gs:337</sub>

🛡️ 防禦性補查：呼叫端已各自補上 !knocked 判斷，這裡再加一道保險——絕不對已被 fateStrike_標記 DEAD_ 的列回補HP/扣御主HP，避免任何未來新呼叫點漏掉同一個判斷又重蹈覆轍。

### `shared`　<sub>Router_Battle.gs:342</sub>

🎯 忠於標稱百分比：四捨五入即可、【不】保底1——小額擦傷(如 5% 的個位數傷)攤到 0 就不扣御主， 免每一記都硬吃 1 讓實際分擔遠超標稱％。御主不因分擔而死(夾 mHp−1)。

### `actionFateBattle`　<sub>Router_Battle.gs:369</sub>

🛡️ 常駐寶具閘：God Hand/治癒結界等【常駐寶具】自動生效、不是攻擊——擋下攻擊解放(前端💥鈕已灰化，此為舊快取前端的後端保險)。

### `npcId`　<sub>Router_Battle.gs:385</sub>

🎯 目標解析：優先用前端帶的【穩定列 ID】(npcId)精準命中——名字比對(nameLoose·CJK 點號/全形括號變體)易失手， 常見「查無此目標」正因名字位元組不一致。ID 為主、名字為退路(相容舊前端/無 id 情況)。

### `_battleDay`　<sub>Router_Battle.gs:388</sub>

🕰️ 登場日閘門：尚未登場者不可被鎖定攻擊(前端本就看不到，這裡防直打API繞過)

### `isMasterTarget`　<sub>Router_Battle.gs:399</sub>

🗡️ 斬首戰術：目標為敵御主時，若其從者尚在同地護衛 → 需「大成功(擲 20)」才能突破斬殺御主， 否則被從者捨命格擋、並反噬 1.5 倍傷害。從者已亡 → 御主手無寸鐵，直接擊殺（走一般流程）。

### `isFateBattle`　<sub>Router_Battle.gs:425</sub>

⏳ 戰鬥耗 1 AP（＝推進 1 小時，1 AP＝1 小時）；行動點不足則無法出戰getAp_/spendAp_ 傳入手上這份 pcData(記憶體查找+原地改)，免整表重讀，結尾可直接餵 buildClientState_。

### `npSealForced`　<sub>Router_Battle.gs:449</sub>

② 御主魔力(MP)＋焚血(HP)都湊不出 prana → 油盡燈枯，擋下。

### `actionFateBattle`　<sub>Router_Battle.gs:462</sub>

🎴 令咒·絕對命令【強開寶具】：御主魔力見底，燃一道令咒逼出不可能之力——令咒補上缺口魔力(令咒即燃料， 御主血肉不再被榨乾)。須真有令咒可燃(userData.seal＋餘量)，否則照舊擋下、並回 canForceSeal 供前端出「燃令咒強開」鈕。

### `actionFateBattle`　<sub>Router_Battle.gs:482</sub>

★同時是「刷好感躲追殺」的天然制衡：要奪杯就得打、打了好感掉破 50→追擊閘重新開啟。

### `actionFateBattle`　<sub>Router_Battle.gs:486</sub>

否則護衛捨身格擋、並反手予我方從者 1.5 倍痛擊（可能致敗）。寶具／令咒對奇襲斬首不適用。

### `guardBase`　<sub>Router_Battle.gs:555</sub>

反噬取「護衛端」傷害：護衛擲贏→其全力反噬(probe.damage 即護衛傷)；護衛擲輸(奇襲突破)→反噬大減， 底傷依護衛筋力而非玩家自己的攻擊力(原 bug：玩家擲贏時 probe.damage 是玩家傷害，反噬越強自噬越重)。

### `actionFateBattle`　<sub>Router_Battle.gs:624</sub>

🚀 主戰鬥路徑從這裡開始延遲寫入：底下每擊的 helper 只改記憶體 pcData、跳過逐列 setValues， 結尾一次整表寫回(見 return 前的批次 setValues)。斬首分支已於上方 return、不進此段。

### `ROUNDS`　<sub>Router_Battle.gs:628</sub>

寶具/令咒只在開場第一擊生效；其後為普通互砍。敵御主空手不反擊。

### `OVERLOAD_BACKLASH_`　<sub>Router_Battle.gs:677</sub>

⚡🩸 過載反噬：凡人之軀強行導引倍額魔力，解放後機率性迴路暴走隨機扣血。不致死·保底1——反噬是資源壓力(血魔雙空＝接下來放不了寶具/主動)，不是即死輪盤。只掛玩家【明選】的超載檔位(p1/p2/舊blood比照p2)。

### `ghLivesStart`　<sub>Router_Battle.gs:712</sub>

🕯️ 十二試煉·燒命總帳：godNote 只留最後一回合那句，AI 無法自己數「倒下了」出現幾次——把整戰燒命數(戰前後 lives 差)算好餵給它，並明講「燒命數」與「倒地次數」是兩回事。

### `actionFateBattle`　<sub>Router_Battle.gs:724</sub>

敵方從未被 setNpChoice_ 寫入選擇，npChoice_ 會退回預設索引0——多寶具敵人(如吉爾伽美什索引0是對人的王之財寶)須改選最強寶具，與下方「敵反擊」段落同步，避免同場戰鬥前後不一致地低估敵方火力。

### `pPow`　<sub>Router_Battle.gs:744</sub>

🎯 火力取樣用 forceHit：damage 恆屬「攻方」——擲輸時取到的是對面的反殺傷害，會把與寶具威能無關的噪音帶進對轟比大小，故強制取攻方 damage。

### `clashRes`　<sub>Router_Battle.gs:751</sub>

⚡ 對轟裁決：四層特例(雙向因果律/輸方保1/pLethal)收進 Engine_Fate.gs 的純函式 resolveNpClash_(單一優先序階梯·可單元測試)，這裡只做 I/O：取樣火力→拿決策→落傷。

### `pactDefIdx`　<sub>Router_Battle.gs:803</sub>

🤝 敵盟·協防（同盟功能·敵方版）：你攻擊的敵從者，其御主若與另一敵御主締有【敵盟】(未逾期)，且該盟友御主的從者同地在場→盟友從者每回合替其反擊我方一記（敵版協同強襲，讓敵盟在正面戰鬥真的有分量）。

### `actionFateBattle`　<sub>Router_Battle.gs:889</sub>

肉身已潰散(護盾歸零/逾時) → 海怪退場、本回合起不再追擊。

### `pHpRatio`　<sub>Router_Battle.gs:965</sub>

🛡️ 寶具是孤注一擲的殺招、不是見面的招呼：敵方唯有【自己被打殘】或【對方已殘可收尾】才解放真名——免得玩家一接觸就被無預警的寶具秒殺(「見面開寶具」的惡感)。健康對健康＝先以普攻試探。

### `eTelegraphed`　<sub>Router_Battle.gs:970</sub>

🔮 寶具預告制：敵寶具不再無預警秒殺——首次達成解放條件時「預告」(蓄勢·存 MEMORY 跨按鍵)， 下次接觸必定發動，給玩家整整一回合準備(開結界/寶具對轟/逃跑)。旗標消耗於發動或被寶具對轟答覆。

### `eSkill`　<sub>Router_Battle.gs:1021</sub>

🎯 敵AI無主動技按鈕→自動施展其招牌施放技術(魔力放出/怪力/投影)，免費(視為其戰鬥本色)——精確還原「改制前這些是免費被動」的敵方戰力，避免單層歸屬後悄悄削弱敵人(玩家側才改為主動付魔)。

### `actionFateBattle`　<sub>Router_Battle.gs:1052</sub>

🐛→✅ 同上補 !pds.knocked，避免對已陣亡的從者回補HP、白扣御主HP。

### `ROUND_MARKS_`　<sub>Router_Battle.gs:1079</sub>

逐回合明細壓成一行「交鋒節奏」：命中/揮空的先後是攻防轉折(AI 要的)，逐行重複的人名與單次傷害數字不是——總傷害下面另有一行，鐵律又要求不複述數字、不寫逐回合流水帳。

### `npMark`　<sub>Router_Battle.gs:1086</sub>

寶具一律是第一回合那一擊(npOpeningStrike)。不標在節奏上，AI 就不知道「①命中」跟下面那條「解放了寶具」是同一擊，於是寫成先打一下、再放寶具兩件事——這是寶具場面接不起來的主因。

### `actionFateBattle`　<sub>Router_Battle.gs:1125</sub>

🎭 關係錨：明說在場敵御主與「defC」的契約關係——否則兩人在提示詞裡只是不相干的名詞，AI 演不出「自己的從者在眼前交戰/被消滅」的切身衝擊，只會照性格詞即興出「冷眼旁觀」的類型套路。

### `_defHpNow`　<sub>Router_Battle.gs:1129</sub>

🎭 戰局實況錨點：光有性格/關係卡沒有戰況資訊，AI 容易讓敵御主反應跟當下實際戰況脫節。把已算好的HP比例/傷害交換即時算成一句白話戰況，逼反應對應當下真實場面。

### `_mjBits`　<sub>Router_Battle.gs:1178</sub>

御主參戰：站位、以身相代、體術/魔術助拳原本是三條各自為政的素材（還被「本戰已終結」隔開）， 合成一條，讓 AI 拿到「御主這一戰做了什麼」而不是三個碎片。詳見 CODE_NOTES。

### `BATTLE_WORDS_`　<sub>Router_Battle.gs:1192</sub>

🎬 篇幅依「這場真的發生了幾件大事」查表——寶具對轟＋理想鄉＋擊破，不該跟三回合平手同樣字數。 加一階＝往表加一格；index＝高潮拍數＋(是否有人倒下)。

### `actionFateBattle`　<sub>Router_Battle.gs:1283</sub>

🚀 一次整表寫回：本戰所有 helper 皆只改記憶體 pcData(延遲寫)，這裡比照 actionMove 單次 setValues 落盤， 取代原本散落 30~50 次逐列寫的慢往返(每場戰鬥省 ~1~3 秒)。全程握 ScriptLock、其他局的列原值寫回不受影響。

### `actionDismissHorror`　<sub>Router_Battle.gs:1348</sub>

重召須再付全額寶具 prana（actionSummonHorror），這就是「養 vs 解」的資源決策。

### `GOD_HAND_TAG_`　<sub>Router_Battle.gs:1375</sub>

實作收斂進 Core_Settings.gs 的 makeIntTag_ 共用工廠。

### `MEAL_BUFF_HOURS`　<sub>Router_Battle.gs:1400</sub>

🍱 整備·進食（戰前 buff）：solo 無商城/道具欄，食物由「整備」抽象供給(AI 敘述來源)， 不寫道具列、不花錢。MEMORY 記【整備至】<絕對小時>，過期自動失效。

### `getHorrorShield_`　<sub>Router_Battle.gs:1434</sub>

非 0＝舊制碼表存檔·逾時 active:false。相容舊兩欄(cur|expiry，max 退回 cur)。


## `gas/Router_Bond.gs`

### `enemyMasterMemoryFor_`　<sub>Router_Bond.gs:20</sub>

🥋🔮 給敵從者列反查其硬連結敵御主的 MEMORY(供 injectMasterMeleeSupport_/injectMasterMagicSupport_讀取敵御主自己的體術/魔術階位，而非誤讀玩家御主的)；查無則回 ""，inject 端本就當「不注入」處理。

### `markMasterLostServant_`　<sub>Router_Bond.gs:34</sub>

配對優先用硬連結【御主】名(精準，不怕多組同地)，舊角色無連結則退回同落點比對。

### `actionUseSeal`　<sub>Router_Bond.gs:92</sub>

並明講「令咒非自動高潮、御主須主動施為」——令咒本質只是狀態效果，高潮須是互動結果。

### `actionUseSeal`　<sub>Router_Bond.gs:95</sub>

明講反應要從「被動抗拒」翻轉成「媚藥般失控、主動索求」的反差，且限定只深入著墨1~2個轉折， 避免AI把多個轉折各用一句帶過寫成流水帳。

### `actionUseSeal`　<sub>Router_Bond.gs:139</sub>

🔥 好感不足時被強逼交心的反噬：這一幕先走DeepSeek的露骨敘述(描寫到令咒解除、從者出手為止)， 死亡本身複用既有「假夢→老虎道場」流程(buildDreamPrompt_)，不新增另一套死亡機制。

### `getBondUsedToday_`　<sub>Router_Bond.gs:165</sub>

排除字元集須用全形｜(`[^｜【]`)，MEMORY 欄的標記生態系一律以全形｜分隔——用半形會讓抓值把後面緊接的全形｜也吃進來，導致「今天已相處過」等防重複判斷失效。

### `BOND_MILESTONES_`　<sub>Router_Bond.gs:181</sub>

⚠ 若判定當下同時被奇襲打斷，故意不標記已觸發，留到下次順利相處再演出，不因意外奇襲永遠錯過。

### `BOND_ACTS`　<sub>Router_Bond.gs:195</sub>

💕 羈絆互動（純按鈕，無對話框）：單一「相處」（每遊戲日限一次、跨日重置、+10 羈絆），味道交給AI 依當下時段/羈絆/性格自由即興，不做假選擇的每日清單。

### `isFate`　<sub>Router_Bond.gs:213</sub>

AP 不足須在動作前先擋，跟 actionProposeAlliance/actionAllyBond 一致；否則 spendAp_ 只會靜默不扣時間，羈絆值/日限/突襲風險仍照樣結算。

### `firedMilestones`　<sub>Router_Bond.gs:239</sub>

取「已達成但尚未演出過」的最低門檻，不論本次相處是否跨過門檻——羈絆若被其他管道墊高越過， 仍能補演。只算候選、暫不寫回，等確認沒被奇襲打斷才落地。

### `isAllied_`　<sub>Router_Bond.gs:297</sub>

✨ 禮裝已全面被動化（2026-06 玩家定案）：持有即於戰鬥自動加持我方從者（見 injectMysticBuff_ / MC_COMBAT_）， 不再有主動發動入口。原 actionUseMystic（吃迴路/耗魔/充能/起源彈狙御主）已移除。

### `masterPersonaLean_`　<sub>Router_Bond.gs:316</sub>

pragmatic＝肯談的務實/有目的者；loner＝孤狼/瘋狂/看戲者難說動。讀 PREF｜MEMORY｜BACK。

### `bondFavor_`　<sub>Router_Bond.gs:330</sub>

單一真實來源：各處「依好感提高成功率」的 GAS 判定共用。未互動過(0/空)視為中性 40。

### `_allianceDay`　<sub>Router_Bond.gs:360</sub>

比照攻擊路徑(actionFateBattle)：先 npcId 精準配、再 nameLoose_(去中點/空白)——含中點名字(不同 Unicode 中點變體)raw includes 對不上。

### `actionProposeAlliance`　<sub>Router_Bond.gs:399</sub>

servantCard_ 卡片內容不含身分標籤，須比照 Router_Battle.gs〔敵方出戰者〕/Router_Movement.gs〔夜襲者〕的慣例先標明身分，避免 AI 誤讀態度欄位方向。

### `breakStaleAlliances_`　<sub>Router_Bond.gs:453</sub>

⚡ 2026-07：preData 給了就在同一份陣列上原地改，不重讀；沒給(相容)才自己整表讀一次。

### `bumpBond_`　<sub>Router_Bond.gs:482</sub>

羈絆 +delta（寫在該 NPC 自己列的 BOND 欄；無互動過的盟友起步約 40），回傳新值skipWrite(選填)：呼叫端隨後必有一次涵蓋 BOND 欄的整列/單欄寫回時傳 true，省掉這裡的單格立即寫入。

### `aiPromptA`　<sub>Router_Bond.gs:527</sub>

ambushDispatchPrompt_ 的 normalFn 這裡不會用到(外層已用 if(ambush) 專門處理突襲這條路)， 傳個不會被呼叫的 no-op 即可，只借用 homeRepel/peaceful 二選一的既有分派邏輯。

### `actionAllyBond`　<sub>Router_Bond.gs:543</sub>

🤝 深盟里程碑（首度臻至 90）——純敘事高光的「已演出」防重複標記【摯交】，無鑑賞入口意義(原【鑑賞緣】戰後納入鑑賞已砍：鑑賞角色一律鑑賞內自行召喚)。

### `allyCard`　<sub>Router_Bond.gs:558</sub>

盟友御主→enemyMasterCard_(比手刻陽春卡更完整，與 Router_Battle.gs 戰鬥時同厚度)。

### `tIdx`　<sub>Router_Bond.gs:584</sub>

會被 sanitizeUserData_ 的 cleanChineseName 剝成「哈桑薩巴赫咒腕」，純 name 比對必漏，故靠 id。

### `_partnerName`　<sub>Router_Bond.gs:614</sub>

🤝 好感是「這一整組(御主＋從者)對你的態度」：連坐硬連結的另一半一起升，讓結盟(讀御主列)與偷襲/挑撥/撤離不被追(讀從者列)的回饋都吃得到——玩家不必猜該對御主還是從者示好。

### `_stMem`　<sub>Router_Bond.gs:674</sub>

🧹 清除敵屬時代殘留標記：舊主硬連結【御主】(殘留會誤觸 masterSynergy 全盛六圍/主從誤鏈)、 【寶具預告】【盟約至】【靈基透支】(敵方機制·奪來後不再適用)。


## `gas/Router_Creation.gs`

### `actionManualNpc`　<sub>Router_Creation.gs:54</sub>

數值(HP/MP/game_id/MEMORY)全由 GAS 決定，故無 AI 也是結構完整、可直接開打的列。

### `actionBackfillMasterAi`　<sub>Router_Creation.gs:106</sub>

御主敘事非阻塞補生成：create 已用種子值秒建御主；此處於「召喚從者頁」背景叫 AI 補背景/特徵/個性/萌點， 只用單格 setValue 更新敘事欄(不整列 write-back，避免與玩家動作競寫)；失敗則保留種子預設。數值欄一律不碰。

### `pcData`　<sub>Router_Creation.gs:109</sub>

🔒 帳號歸屬驗證已上移到 dispatcher 統一擋（`handleGameAction`→`verifyPcOwnership_`）， 進到這裡的 pcId 已保證屬於呼叫者本人，不必再反查一次「帳號」表。

### `getWarMode_`　<sub>Router_Creation.gs:168</sub>

🔵 提供前端瀏覽英靈殿：回傳 [{id,cls,name,gender,np}]從御主 MEMORY 讀戰役模式（canon=正史 / chaos=混亂；舊角色預設 canon）

### `actionGetMasters`　<sub>Router_Creation.gs:240</sub>

divine_core(神核) 已拔除工房開放——理由與 ea/王之財寶/UBW/海怪/天之鎖/黃金律 等頂級機制相同：凡人不該持有的機制，漲價解決不了(有預算照樣買得到)，故收為種子專屬。

### `sanitizeSkills_`　<sub>Router_Creation.gs:292</sub>

🛡️ ALLOWED_FX_是純物件字面量，truthy查詢會被Object.prototype繼承的鍵(constructor/toString/valueOf等)污染成false positive——改用hasOwnProperty才是真的「在白名單裡」。

### `recordOriginalHero_`　<sub>Router_Creation.gs:314</sub>

選填 pExtra(工房玩家自定 look/moe/firstP/toMaster/speech/tic/back/weapon＋綁定用 creator)——不存的話重召時 persona 欄退回預設。

### `ALIGNS_`　<sub>Router_Creation.gs:350</sub>

工房(parseForgeBuild_)與 AI 生成從者(actionSummonServant)共用同一份白名單驗證。

### `SKILL_PTS_BIG_`　<sub>Router_Creation.gs:356</sub>

三軌計價：同組同價會讓大係數標籤嚴格支配小係數，故照引擎真實係數分軌——強效(如千里眼/高速詠唱)貴 1/3、 輕效(如騎乘/風王)便宜 1/3。前端鏡射 FORGE_SK_TRACK/FORGE_SK_PTS_*(Script_Onboarding.html，工房即時預算UI用)。

### `FLAT_FX_`　<sub>Router_Creation.gs:361</sub>

二元平價(引擎不讀購買階級，效果恆固定)：god_hand/survive/tsubame/zabaniya/gae_bolg/rule_breaker/anti_magic_lance/agile_striker/weapon_steal/god_slay/lovespot/self_mod/tactics/projection。

### `FORGE_CLS_BONUS_`　<sub>Router_Creation.gs:375</sub>

Berserker 職階附贈狂化C(傷+但命中/迴避−·不可關)是唯一負資產禮物，補正+30 拉平——工房與 AI生成上限封頂共用同一份，不各自宣告(單一真實來源)。

### `isMasterCls`　<sub>Router_Creation.gs:426</sub>

「御主」職階：鑑賞限定純敘事款(比照 Seed_Codex.gs 的3位canon御主)，不參與戰鬥——獨立於 VALID_CLS(七大從者職階)之外判斷，不吃 reqCls 的 Saber fallback。

### `parseForgeBuild_`　<sub>Router_Creation.gs:464</sub>

第4技能欄位費+20：預算才是真約束(逼六圍讓位)，疊加上限±8 讓多買的命中/迴避冗餘——最壞情況四技組合(83~85%)仍未超過三技頂點(93%)。

### `isMasterCls`　<sub>Router_Creation.gs:568</sub>

🎭 AI 只補「玩家沒填的」演出欄＋寶具英文真名——失敗不擋鑄造🌹 御主職階無寶具/技能，提示詞跳過那兩行、系統prompt也不要求 npEn(反正不會被讀)。

### `hrows`　<sub>Router_Creation.gs:622</sub>

英靈殿含「鑑賞限定」的正典御主(cls='御主')，只給鑑賞召喚用、沒有六圍/技能/寶具——若被 solo 召喚會產出殘缺從者。三條路徑(heroId 指定/真名比對/隨機)都共用這份 hrows，統一在源頭濾掉，不逐一補檢查。

### `_nameMatches`　<sub>Router_Creation.gs:629</sub>

同真名可能有多職階列(如斯卡哈 Lancer/Assassin)——優先找真名比對到且職階match reqCls 的列， 找不到才退回「不分職階、比對到第一個」(相容沒選職階/單職階版本的一般真名召喚)。

### `newId`　<sub>Router_Creation.gs:641</sub>

專區點選召喚(走下方 hero 分支實體化)。

### `actionSummonServant`　<sub>Router_Creation.gs:669</sub>

特徵(敘事格)直接讀寫死的種子 persona.look，穩定一致、不叫 AI 生——但 persona.look 是「N段外貌(含服裝)・・氣質詞」而非天然分格，用 looksToTraitParts_ 正確切分。(2026-09：自稱退休後不再帶 persona.firstP。)

### `svPref`　<sub>Router_Creation.gs:672</sub>

種子英靈：直接用寫死的種子 persona，大部分欄位不叫 AI 重生，省 API、加速召喚(僅[喜歡]/[討厭]段數不足時才補呼叫一次)。口吻/小動作(persona.speech/tic)已由 stampPersonaFlavor_ 複製進 MEMORY，servantCard_ 直接讀列即可。

### `actionSummonServant`　<sub>Router_Creation.gs:677</sub>

種子 persona.words 幾乎只有2段，parseTraitsHelper 補滿4格時[喜歡]/[討厭]恆為「無」——召喚當下補一次 AI 讓從者也有真正的喜好/討厭。已經4段(罕見)則直接跳過、不多打 API。

### `ghSkill`　<sub>Router_Creation.gs:685</sub>

復活命數：god_hand 持有者優先讀技能物件自己的 lives(如尼祿 lives:3)；種子沒標時，ai_gen 給3(尼祿基準)， 其餘靠 getGodHandLives_ 預設11(赫拉克勒斯十二試煉專屬)，別讓 AI 產物白拿。

### `actionSummonServant`　<sub>Router_Creation.gs:714</sub>

callGeminiAPI 連線失敗不丟例外，而是回 fallback 敘事 JSON(narration/options)——照收會靜默生出全C六圍/零技能的殘缺從者並永久污染英靈殿。缺 realName 或 six 視為生成失敗，中止讓玩家重試。

### `actionSummonServant`　<sub>Router_Creation.gs:729</sub>

🌀 六圍下限保底：AI 常自己抓不準力度，光靠 prompt「務必有強有弱」擋不住——GAS 這裡硬性補強到與工房 FORGE_BUDGET(340) 對齊(不含職階技能 aiCSkills，理由見 bumpSixToFloor_ 註解)。


## `gas/Router_Economy.gs`

### `actionSetMageRealm`　<sub>Router_Economy.gs:25</sub>

只接受 mageRealmPool_ 池內 fx；空字串＝清除選擇。

### `actionSetOutfit`　<sub>Router_Economy.gs:75</sub>

只換衣不換人(五官/髮色/體態依種子 look)；空字串＝恢復本相。

### `actionSetWeapon`　<sub>Router_Economy.gs:95</sub>

免費、即時、不耗 AP；留空＝清除、恢復自然演出。鏡射 actionSetOutfit。

### `CIRC_FLOOR`　<sub>Router_Economy.gs:126</sub>

過度補魔＝慢性自盡(迴路↓→池縮、回魔慢、禮裝弱)。

### `bondForMana`　<sub>Router_Economy.gs:133</sub>

從者不是有求必應：須好感≥MANA_TRUST_BOND_且魔力已見底(≤10%上限)才會同意；不合資格時不動任何數值，改由AI依從者性格生成婉拒——拒絕理由區分「不夠信任」與「還不到非做不可」兩種事實，避免AI編出對不上實情的理由。

### `declineWhy`　<sub>Router_Economy.gs:138</sub>

這種機制說明直接當台詞寫死，玩家反映過同款毛病(「提議移動失敗的台詞超級無敵僵硬」)。

### `_manaApr`　<sub>Router_Economy.gs:179</sub>

⚡ spendAp_ 先跑(skipWrite=true，只改 pcData 記憶體、不單獨寫表)，讓下面的整列寫入一次過帶上最新 day/hour/ap，省掉 spendAp_ 自己那道窄寫入(原本迴路/血量寫一次、spendAp_ 又寫一次)。

### `ambush`　<sub>Router_Economy.gs:186</sub>

🐛→✅ 稽核抓到：雙從者情境下漏帶 svIdx，可能敘事說補魔的這位遇襲、實際扣血/陣亡的卻是另一位。

### `_repApr`　<sub>Router_Economy.gs:237</sub>

⚡ spendAp_ 先跑(skipWrite=true，只改 pcData 記憶體)，讓下面御主列的寫入一次過帶上最新day/hour/ap， 省掉 spendAp_ 自己那道窄寫入(原本MP扣減寫一次、spendAp_ 又寫一次)。

### `ambush`　<sub>Router_Economy.gs:245</sub>

🐛→✅ 稽核抓到：雙從者情境下漏帶 svIdx，可能敘事說療傷的這位遇襲、實際扣血/陣亡的卻是另一位。

### `actionSpiritRepair`　<sub>Router_Economy.gs:270</sub>

🩸 燃血補魔是【被動機制】，非主動 action：共用魔力池見底時消耗補不上， applyRegen_(Time_World) 自動「燃命續契約」——缺口÷2 全額扣【御主】HP(保底1)，從者不扣血。


## `gas/Router_Movement.gs`

### `buildMapNodesPayload_`　<sub>Router_Movement.gs:11</sub>

地圖節點是 solo 戰爭限定概念，鑑賞前端從不渲染 mapNodes，非 solo 直接回空形狀、省去白算。

### `tgtTrim`　<sub>Router_Movement.gs:135</sub>

★可生還·不致死(從者血保 1)——只是不讓你一按就從強敵眼皮底下從容全身而退。用移動【前】的初始資料判定。

### `_fromLocR`　<sub>Router_Movement.gs:163</sub>

🏰 在自己陣地＝安全港：主場結界／機關掩護，敵人闖進來也困不住你——不強制撤退、離場亦不被追擊(與 slip 同級的豁免)。這是「設置陣地」承諾的主場優勢，敵在你陣地反被守株(見 enemyAmbushOnServant_ 陣地反擊)。

### `actionMove`　<sub>Router_Movement.gs:168</sub>

分心窗口(slip)可悄悄離開則不受此限；撤退本身(isRetreat)也放行；在自己陣地(_atOwnHome)享安全港·不封鎖。

### `teleFoe`　<sub>Router_Movement.gs:191</sub>

用 find() 只取第一個相符者，避免多個預告敵人同格時只有最後一個結算、其餘旗標卡住不清。

### `pr`　<sub>Router_Movement.gs:247</sub>

雙方保 1 不致死。撤退時追兵搶得先機(ambush)、更難全身而退。

### `preFoesAtTarget`　<sub>Router_Movement.gs:262</sub>

isFateMove guard：preFoes 只有 solo 前端(travelTo)會消費，鑑賞無此陣營列，明確guard避免僥倖依賴資料形狀。

### `clockLabel`　<sub>Router_Movement.gs:272</sub>

🌍 世界先動，玩家後到：先讓敵御主／敵從者 tick 到新位置，再把玩家落到 target， 避免「追到敵人所在地」時敵人在你踏進來同一瞬間又被傳走，遭遇敘事才跑得起來。

### `factionClash`　<sub>Router_Movement.gs:337</sub>

局面種類/後果全由 resolveFactionEncounter_ 依雙方性格＋傷勢＋戰局 GAS 裁定，AI 只演出。

### `actionMove`　<sub>Router_Movement.gs:373</sub>

無可反應局面則清掉舊窗口。隨下方整表 setValues 一併寫回。

### `_windowNames`　<sub>Router_Movement.gs:378</sub>

svA/svB 是上面 resolveFactionEncounter_ 實際敘事的那兩名敵從者(見 clashMasters[ia]/[ib] 配對)， 隨窗口存進 MEMORY 供 actionIncite 精確鎖定，不再讓它自己猜陣列前兩個。

### `regenNote`　<sub>Router_Movement.gs:387</sub>

大幅恢復靠「休息」（同一套規則 ×2）。便宜：只改記憶體那幾格，隨移動一起寫回，零額外讀寫，不會變慢。

### `actionMove`　<sub>Router_Movement.gs:430</sub>

🔒 在場人物上限：一地擠進 N 組敵人時，每人一張卡會讓提示詞爆掉（實測 14 人＝4,820 字， 而且 performanceNote_ 會列出 14 個名字）。只送最前面幾位，其餘由【此地有敵蹤】那行點名即可。

### `foeMoodNote`　<sub>Router_Movement.gs:451</sub>

中性(未培養過好感)→留空，維持既有找上門/偶遇 steer。

### `actionRest`　<sub>Router_Movement.gs:570</sub>

收尾一次整表寫回：時回／時鐘／世界自走／盟約瓦解全部已在同一份 pcData 上改完，這裡一次寫完， 取代舊版散落的多趟寫入。下方 enemyAmbushOnServant_／raiseBond_ 各自的寫入發生在此之後，維持原樣不動。

### `restAmbushPrompt`　<sub>Router_Movement.gs:590</sub>

⚔️ 卸防突襲三分派(單一真實來源 ambushDispatchPrompt_)：歇息這裡沒有獨立的「正常結果」敘事(那部分由下方 restVictory/restFinalDream 另外處理)，normalFn 只需回空字串即可。

### `getEnemyFeud_`　<sub>Router_Movement.gs:687</sub>

🔥 敵敵交惡標記（【交惡】<對方御主名>:<到期day>）：挑撥離間得逞後 GAS 蓋雙方御主——之後撞見他們更可能火併/追殺、不會結盟休整（敵盟的反面）。與敵盟互斥（設交惡先清敵盟、反之亦然）。

### `actionIncite`　<sub>Router_Movement.gs:934</sub>

反效果→他們看穿、一起轉頭戒你(無數值懲罰、白費 1 AP)。耗 1 AP、用掉即清窗口。

### `detectAllyPeril_`　<sub>Router_Movement.gs:1012</sub>

回 {ally, loc, foe, allyFaction} 供前端報信＋「趕去馳援」；查無回 null。情報共享故玩家得知(結盟即無戰爭迷霧)。

### `homeRank`　<sub>Router_Movement.gs:1049</sub>

🏰 陣地·安全港·反擊：玩家於【自己佈設的陣地】(隊有陣地作成從者)遭潛入 → 結界示警、機關迭起，從者從容起身反擊、 將來犯者擊退驅離(敵扣血·保1不斬)，我方毫髮無傷；代價＝御主耗魔維持結界。魔力不足則結界失效、照常挨突襲。

### `WORKSHOP_TAG_`　<sub>Router_Movement.gs:1191</sub>

── 🏕️ 陣地（工房）：存於御主 MEMORY【陣地】loc，駐留該地時供魔得工房加成 ──實作收斂進 Core_Settings.gs 的 makeTextTag_ 共用工廠，函式名/外部行為不變。


## `gas/Router_Narrative.gs`

### `cleanNarrateEcho_`　<sub>Router_Narrative.gs:58</sub>

==========================================🟢 輕量敘事專用路由：結算已由 GAS 完成，這裡只請 AI 補一段純文字描寫不讀規矩表、不帶歷史、不解析 JSON 數值，token 砍到最低==========================================把「給 AI 的提示詞」洗成玩家看的簡短回顧：去掉演出卡/★指令/素材/系統標籤，只留行動梗概並截短，供歷史顯示用（非整串幕後鷹架）。

### `narrateWithState_`　<sub>Router_Narrative.gs:101</sub>

回 narrationText；JSON 解析失敗回 null(呼叫端給 fallback)。stateBrief 只給 AI 看、不存歷史。

### `actionNarrateOnly`　<sub>Router_Narrative.gs:149</sub>

🔒 帳號歸屬驗證已上移到 dispatcher 統一擋（`handleGameAction`→`verifyPcOwnership_`）， 進到這裡的 pcId 已保證屬於呼叫者本人，不必再反查一次「帳號」表。


## `gas/Router_Persona.gs`

### `codexPersona_`　<sub>Router_Persona.gs:23</sub>

cls 可選：同真名跨職階共存時（如「斯卡哈」同時有 Lancer/Assassin 兩個種子條目、皆用同一realName）避免抓錯人設——優先找「真名＋職階」都吻合的列，找不到才退回舊的純真名比對。

### `PREF_LABELS_`　<sub>Router_Persona.gs:47</sub>

PREF/TRAIT 內部是四段慣例存值，若整段黏成一串只掛外層標籤(性格：/特徵：)AI 看不出哪句對應哪格， 故逐格加標籤餵給 AI。

### `QUAD_EMPTY_`　<sub>Router_Persona.gs:51</sub>

無資訊量佔位字的【唯一名單】：parseTraitsHelper 各 fallback 的每一格都必須在這裡， 否則佔位字會被當成真資料送進提示詞、佔掉 AI 的注意力（新增 fallback 時記得補這裡）。

### `quadLabeled_`　<sub>Router_Persona.gs:62</sub>

🧹 2026-07：空欄一律不送。舊版 skipNone=false 時會輸出「喜歡的事物：無」，理由是「不靜默漏項」 ——那是為了方便開發者除錯，代價卻由每一張卡的提示詞付。要查漏欄請看試算表，別佔 AI 的注意力。

### `performanceNote_`　<sub>Router_Persona.gs:70</sub>

🎭 這一則提示詞裡有誰。固定的表演總則(show-don't-tell／正典認知覆蓋／羈絆親疏)2026-09 移進miniSystem 講一次——它每顆按鍵都貼一遍、109 字、內容從不變，是全 solo 最貴的重複。

### `foe`　<sub>Router_Persona.gs:82</sub>

🗡️ 敵方卡：略過「熟了才看得到的一面」(萌點/小動作/私密一面)——戰場上的對手本來就不該有這些， 送了也只是稀釋掉真正要用的口吻與性格。我方/盟友/羈絆場景仍是完整卡。

### `persona`　<sub>Router_Persona.gs:97</sub>

p.words 是種子原始格式(段落用「・」分隔)，quadLabeled_ 只切「、」——跟召喚寫列時(Router_Creation.gs)同款先把「・」正規化成「、」，否則多段個性會擠成一格、後面格數錯位。

### `back`　<sub>Router_Persona.gs:110</sub>

過濾掉召喚時的無資訊量 fallback(`${cls}・${realName}`，跟卡頭〈${name}·${cls}〉逐字重複)， 只顯示真身世(玩家寫的原創英靈/AI補的身世)。

### `align`　<sub>Router_Persona.gs:114</sub>

陣營(秩序/中立/混沌 ×善/中庸/惡)：種子/工房原創都填得完整，是道德決策傾向的錨點， 一直存但沒餵過AI——補上，讓「秩序・善」跟「混沌・狂」等角色的抉擇風格自然分化。

### `card`　<sub>Router_Persona.gs:123</sub>

多數角色 fp 預設值就是「我」，長提示詞中段容易讓小模型把角色自稱「我」跟敘事旁白第一人稱的「我」(玩家)混淆，故明確限定「僅此角色自己台詞內」，不留一個懸空的「自稱」標籤。

### `masterCard_`　<sub>Router_Persona.gs:145</sub>

★只供內化、禁複述；願望僅供氛圍不直述；【可】依性格給御主台詞/反應(讓角色有聲)，但【不替御主拍板戰略抉擇】。

### `melee`　<sub>Router_Persona.gs:157</sub>

魔術階位跟魔術系統併成一行(如「寶石魔術(A階)」)，避免兩行都掛「魔術」開頭重複。

### `back`　<sub>Router_Persona.gs:199</sub>

性格詞光禿禿沒有情感錨點，AI 沒別的依據就滑向類型套路，故補身世＋願望；BACK 欄格式＝「身世。外貌：…」(masterToNpcRow_)，外貌已由 TRAIT 欄呈現，這裡只取「。外貌：」前的身世段。


## `gas/Seed_Codex.gs`

### `SEED_MASTERS`　<sub>Seed_Codex.gs:272</sub>

back＝身世生平（show-don't-tell 的演出依據）、moe＝萌點（不限反差，外觀/行為/習慣特色皆可）。

### `row`　<sub>Seed_Codex.gs:335</sub>

日常版欄位(dailyLook/dailyWords等)已手寫寫死進每位 persona，servantToHeroRow_ 回傳含這些欄， 整列覆寫即帶最新內容，不需要事後 clearContent() 逼 AI 重新生成。

### `upgradeCodexPersonas_`　<sub>Seed_Codex.gs:347</sub>

🧹 淘汰孤兒：種子改名/汰換後，英靈殿殘留的舊種子列(ID 已不在 SEED_SERVANTS)自動清除， 嚴格只刪來源=='seed' 者，杜絕誤刪玩家自創英靈(ai_gen)。由下往上刪避免位移。

### `upgradeMasterCodex_`　<sub>Seed_Codex.gs:356</sub>

確保 circuits/home/wish/melee/magic_rank 等影響玩法的欄位(如迴路→敵御主魔力池)也能吃到種子校正。

### `resyncSummonedServants_`　<sub>Seed_Codex.gs:409</sub>

🌸 鑑賞(k_)實例：戰時無 back、身世改讀 dailyBack。補寫種子後，已在場的同伴也趁版本升級一起刷新身世，不再卡在「生活在這座城鎮裡的普通身影」通用預設(如舊 SABER)。只動鑑賞列、不碰 solo。

### `resyncSummonedServants_`　<sub>Seed_Codex.gs:433</sub>

🎯 PREF(dailyWords)／INTENT(dailyMoe) 也必須跟著刷：這兩欄一樣會被寫進在場卡(formatPref 的[表象][內裡]、萌點欄)，原本漏掉——種子性格/萌點改版後，已召喚的同伴永遠停在舊文字。

### `resyncSummonedServants_`　<sub>Seed_Codex.gs:440</sub>

走共用工廠(replace-or-append ＋ 自動清洗)，不再自己拼一份 regex——舊版那份既沒清洗、 又是全專案第 3 份【口吻】寫入邏輯。

### `actionDevResyncCodex`　<sub>Seed_Codex.gs:452</sub>

給前端 DEV 按鈕用——不靠自動版本閘(怕部署時序/旗標卡住)，按一下立即生效並回報筆數。

### `seedFateCodex_`　<sub>Seed_Codex.gs:467</sub>

另：版本升級時自動把既有種子英靈的 persona 刷成最新（萌點/口吻），不動客製英靈。


## `gas/Seed_Rivals.gs`

### `markRivalsSeen_`　<sub>Seed_Rivals.gs:12</sub>

preData 就地標記避免重讀整表；變動時整欄一次 setValues 而非逐格寫入。

### `seedRivalsForGame_`　<sub>Seed_Rivals.gs:145</sub>

🔵 開局鋪敵：war ∈ '4th'|'5th'|'chaos'；playedMaster=玩家扮演的正典御主id(那組移除)， playerServantName(玩家奪取的從者)那一組也一律從對手移除。

### `seedRivalsForGame_`　<sub>Seed_Rivals.gs:200</sub>

🔗 硬連結每組敵御主↔敵從者（rows 嚴格交替 master, servant…）：互寫【從者】/【御主】名於 MEMORY， 讓多組同場也分得清誰的從者被誰打掉。（僅此分支；4th/5th 正史分支逐對即時連結，不倚賴位置假設。）

### `roster`　<sub>Seed_Rivals.gs:208</sub>

📜 正史 4th / 5th：正典組為敵；玩家扮演者那組、玩家奪取從者那組，皆移除逐組當場配對即時連結(不倚賴陣列位置)：master:null 的孤身從者只 push 一列，位置式硬連結會讓後續全部錯位。


## `gas/Setup_FateWorld.gs`

### `removeAllTriggers`　<sub>Setup_FateWorld.gs:23</sub>

🧹 一鍵清除專案所有觸發器（舊版經濟/飛書機制的殘留時間觸發器，函式本體已移除但觸發器可能還掛著）。 FATE 世界推進靠玩家按鍵時的 worldTick_，不需任何觸發器，於 GAS 編輯器手動執行一次即可全清。

### `actionCheckSheets`　<sub>Setup_FateWorld.gs:157</sub>

🔘 登入畫面「檢查/建立試算表」按鈕的唯一呼叫點，包成前端可觸發的 action。刻意不需要 pcId(登入前就能按)， 也不受 KANSHOU_BLOCKED_ACTIONS_ 影響(該名單只擋鑑賞context呼叫solo專屬action，這裡 pcId 恆為空不會被攔)。


## `gas/Time_World.gs`

### `writeClockToRow_`　<sub>Time_World.gs:53</sub>

skipWrite：呼叫端明確知道自己隨後必有一次涵蓋這3欄的批次整表寫回時傳 true，省掉這裡多餘的單列立即寫入。

### `restHours_`　<sub>Time_World.gs:95</sub>

skipWrite(選填，比照 spendAp_)：呼叫端保證隨後必有一次涵蓋 DAY/HOUR/AP 這3欄的批次整表寫回時傳true。

### `timeBand_`　<sub>Time_World.gs:109</sub>

半開區間([下界,上界))：既相容整數(結果與舊版逐一相同)，又讓鑑賞的半小時刻度(如10.5)不會掉進邊界縫隙被誤判成深夜。分界對齊 KANSHOU_TIME_BANDS_ 的 startHour。

### `playerHomeLoc_`　<sub>Time_World.gs:154</sub>

傳 pcData 可省一次整表讀(呼叫端手上通常已有)；沒傳才自行整表讀一次(相容)。

### `combatantsE`　<sub>Time_World.gs:188</sub>

🧮 HUD 顯示的收支必須跟 applyRegen_(實際時回) 用同一套算式，否則玩家看到的「淨 X/時」對不上實際魔力增量；要涵蓋全隊(從者魔力貢獻/維持費/territory)，日後改公式兩函式務必一起動。

### `horrorUpkeep`　<sub>Time_World.gs:204</sub>

掃全隊(海怪可能掛在第二從者·如破戒奪來的青鬍子)，與 applyRegen_ 的 svRows 掃描同準。

### `masterI`　<sub>Time_World.gs:246</sub>

先蒐集御主列＋在世同隊從者，再算御主魔力收支：收入(迴路供給+靈脈+工房) − Σ 從者維持費×出力 drainMul。

### `horrorIdx`　<sub>Time_World.gs:273</sub>

池赤字時【海怪先沉回深淵、才輪到御主燃血】(見下方 deficit 分支)。

### `deficitNow`　<sub>Time_World.gs:311</sub>

出力檔＝玩家旋鈕，不在時回變動；無自有魔力池。

### `anyLocDirty`　<sub>Time_World.gs:397</sub>

LOC/HP 整欄批次寫回跨輪累積髒旗標、迴圈跑完後才各寫一次(rounds 最多4輪)， data 全程原地改，跑完才寫不影響任何一輪讀到的中間值。

### `worldTick_`　<sub>Time_World.gs:533</sub>

🎨 風聞措辭多樣化：不洩漏具體交鋒數字/勝方身分，只留下魔力波動／寶具氣息等氛圍線索——有死亡才點名罹難者，純掛彩(多數情況)只留下模糊的異狀傳聞。

### `victory`　<sub>Time_World.gs:572</sub>

這不是世界隨機清人(那有 WORLD_FLOOR_ 保底)，而是玩家親手把對方打到燃盡令咒後的「延遲結算」，故允許收尾、可觸發勝利。

### `worldTick_`　<sub>Time_World.gs:599</sub>

🏆 這裡是唯二的「非直接戰鬥致勝」路徑(令咒透支延遲結算)，同樣要有願望夢——查玩家自己的御主/從者列給 buildVictoryDreamPrompt_。



### `kanshouWorldWrite_` / `kanshouWorldFeed_` / `kanshouWorldSame_`　<sub>Gallery.gs</sub>

2026-09 玩家「我應該是自由的！但ai有試算表可以記錄我的歷程」。在這之前鑑賞的世界是 22 張寫死的表，
而 AI 能寫回試算表的全部是「已經在表上那些人」的屬性——不能新增地方、人、設定。
反轉：試算表從【AI 讀的選單】變成【AI 寫的帳本】。發明會出問題只是因為沒落盤。

**為什麼是一張表加類別欄，不是三張表**：一條寫入路徑、一套淘汰政策、一份快取。
以後要加類別是加一個值，不是加一張表、三套 helper、三個快取鍵。

**為什麼 `kanshouWorldSame_` 只比對最近兩天、不掃全表**：第一版掃全表，實測把
「她喜歡在便利商店買關東煮」和「…買茶葉蛋」合併成同一條——句型相近但語意不同的事實太常見。
memoir 那邊的同款去重只比對「最近 3 條」，正是同一個道理，我一開始沒照抄那個限制。
門檻同時從 0.6 提到 0.7。**反過來說，真正的語意複述這道網抓不到**
（「她討厭下雨」的兩種說法 bigram 只重疊 0.36），那一層靠提示詞（「已經在名單上的不必重寫」）
與淘汰處理——不為了抓它把門檻調低換一堆誤殺。

**為什麼 feed 不全餵**：帳本無限長大是這整套機制唯一的真風險。上限（`KANSHOU_WORLD_FEED_MAX_`）
才是煞車，相關性分數只決定「這 6 條給誰」。

**為什麼淘汰併進寫入、政策抽成純函式（2026-09 稽核）**：第一版是三支各自讀表——餵回讀一次、
寫入讀一次、淘汰再讀一次，同一張表同一趟執行讀三遍。量出來每按鍵整表讀從 6 次漲到 9 次，
而 CLAUDE.md 寫著「別把多餘 round-trip 或重複整表讀回加回來」。淘汰手上其實什麼都不缺——
寫入已經握著整張表了。所以：政策抽成 `kanshouWorldEvictees_`（純函式，只回答「該砍哪幾列」，
刻意不碰試算表），寫入拿它的答案，留下來的整批 `setValues` 寫回、尾巴一次 `deleteRows` 砍掉
（同 `kanshouPurgeByGame_` 的樣式，不逐列 `deleteRow`）。

**為什麼寫完是「換掉快取」而不是「作廢快取」**：同一趟執行裡，寫入之後還有人會再讀一次帳本
（`Router_Action.gs` 組地點清單那支）。作廢等於逼它整表重讀；而剛寫完的人最清楚表上現在長怎樣，
列號也算得出來（留下來的依序接在表頭後面、新增的排在最尾）。9 → 7 次。
讀與回填共用 `kanshouWorldRow_` 一份欄位對應，避免兩處各寫一份 mapping 日久長歪。

### `kanshouFolkToRow_`　<sub>Gallery.gs</sub>

帳本裡的常民只有名字/樣貌/性別。升格成正式同伴時**刻意不叫 AI 補一整份設定**——
那等於又把「全都有設定過」做回來一次。比照玩家自己的御主走「留白＋滾動成長」：
先用帳本那一句當外貌，其餘留空，之後靠玩出來長。
ID 沿用 `KHV_` 前綴而不是另開一個：`Core_Settings.gs` 狀態同步、`Gallery.gs` 3342、
`Router_Action.gs` 446 三處白名單都認它，新前綴得同步三個地方——典型的「加一個東西要改三處」陷阱。

### 預寫橋段池（已移除）　<sub>Gallery.gs</sub>

2026-09 整批砍掉 7 張表：`KANSHOU_SCENE_EVENTS_`／`KANSHOU_LOCATION_EVENTS_`／
`KANSHOU_COHABIT_EVENTS_`／`KANSHOU_EVENT_SEEDS_`／`KANSHOU_INIT_WANTS_`／
`KANSHOU_LOCATION_ACTIVITY_`／`KANSHOU_FESTIVAL_EVENTS_`。
它們是「選單感」最重的一塊：同一個地點同一個時段永遠同一句話開場、
她此刻想要什麼是 6 選 1、節慶變成待辦清單。
依既有判準（①告訴 AI 世界上什麼是真的→留 ②告訴 AI 該怎麼寫→砍）：
節慶的「日子」留著（`KANSHOU_FESTIVALS_` 是世界事實），砍掉的是「這一天該做什麼、做了沒」。


### `withProcessing_` / `bgHint_` / `__procOn`　<sub>Script_Onboarding.html</sub>

2026-09 玩家第二次講同一件事：「如果需要玩家等待的地方 都加上一個等待畫面 不要只是背景執行！」
（第一次是歸零重來那顆：「輸入名字後 就消失了 不知道有沒有在執行」。）

**這個壞法沒有任何錯誤訊息**——按鈕按下去、視窗關掉、畫面靜止一兩秒。玩家的結論不是「在跑」，
是「沒按到」，然後再按一次。所以問題從來不是速度，是**沉默**。

**為什麼是一支 helper 而不是各自 try/finally**：原本 `showProcessing`／`hideProcessing` 是
各呼叫端自己 `try { ... } finally { hideProcessing(); }`，同一段骨架抄了四份，
而漏掉 finally 的那一份會把玩家永遠關在遮罩後面（比不開遮罩更糟）。收斂成 `withProcessing_`：
開 → 跑 → **不論成功/失敗/例外都收**，呼叫端只寫一句。

**為什麼要 `__procOn`（遮罩現在有沒有人在顯示）**：`beginAction` 已經會開一張全域遮罩，
巢狀在它底下的 `withProcessing_` 若也去開關，內層跑完就會把外層的遮罩收掉——
**動作還在跑、畫面卻解凍了**，玩家可以按下一個動作。所以內層先問「已經有人在顯示嗎」，
有就整支不碰，由最外層那個負責收。旗標由 `showProcessing`／`hideProcessing` 自己維護
（單一真實來源），所以誰先開的都算數——包括戰報中途那次 `hideProcessing()`
（遮罩撤掉、`__actionBusy` 仍鎖著），撤掉之後後面的 `withProcessing_` 才開得起新的。

**為什麼另外有個 `bgHint_`**：補生成敘事欄（`backfillMasterAi`／`backfillKanshouAi`）是
**刻意非阻塞**的——玩家已經可以開始玩，拿一張全螢幕遮罩擋他 20 秒是把好事做成壞事。
但「不擋」不等於「不講」，所以給一顆 `pointer-events:none` 的小提示條。
它會計數（同時有兩支背景工作時，先收工的那支不可以把提示關掉），且收工函式做了冪等，
重複呼叫不會誤扣。

**為什麼不是每個 `gasRun` 都包**：樂觀更新（出力轉盤：畫面當場就是結果）跟背景同步
（`syncData`、動作完成後的清單重抓）玩家根本沒在等，包了只是閃一下遮罩騷擾人。
這兩類逐支登記在 `check_wait.py` 的 `BACKGROUND` 並寫理由——**登記過的才算例外，沒登記的就是漏了**。


### ★【你也是這座城裡的一個人】 / `_mePron_` / `_meFlavorStr_` / `_meMoeStr_`　<sub>Gallery.gs</sub>

2026-09 玩家：「鑑賞我想要的是 AI 扮演玩家的角色，用這個角色的角度去感受這個世界，
但我不會寫提示詞不知道怎麼寫比較能做到我想要的樣子。」

**量出來的診斷**：你的角色資料【本來就在提示詞裡】，是規則把它鎖死了。同一回合裡——

| | 玩家 | 同伴 |
|---|---|---|
| 卡片欄位 | 性格・特徵・裝扮・經歷（4 格） | 性格・特徵・口吻・經歷・萌點・現況・關係（7 格） |
| AI 拿它做什麼 | 不准用 | 演出來 |

三條規則同時把玩家關成一台攝影機：鐵律 1「不擴寫**不代玩家加戲**」、
★視角鎖定「**只演你實際輸入的動作與五感**——你看不見自己的神情」、
`inner_monologue` 專門判【對方】的反應（玩家沒有）。
於是敘事永遠是「你做了 X ／ 她反應 Y」——**玩家這個人不在場**。

**為什麼是「只補感受」而不是「AI 整個替你演」**：玩家在選項裡看過三種寫法後選的。
更早之前他就踩過一次：「我覺得不能第一人稱，ai 根本分不清楚要扮演誰？？？」——
一旦 AI 可以替玩家開口，「誰在講話」就會開始糊掉。所以界線畫在
**感受是 AI 的、決定是玩家的**：不替他新增動作、不替他開口、不替他做決定，收尾一律停在等玩家回應。

**「你看不見自己的神情」為什麼改成「寫感覺得到的，不寫看不到的外觀」**：
原句的洞見是對的（不能給玩家自己一個上帝視角），但它用「看不見」一刀切掉了整個內心。
精確的版本是：臉看不見，但**臉在發燙、喉嚨發緊、手心出汗、心跳被自己聽見**——
這些全是第一人稱真的感覺得到的。禁的是外觀，不是感受。

**為什麼 `_meFlavorStr_`／`_meMoeStr_` 硬要複用同伴那組 helper**
（`getPersonaSpeech_`／`getPersonaTic_`／`traitPrivateOf_`）：玩家列跟同伴列是**同一張 schema**，
萌點早就存在 `COL.PC.INTENT`（`actionBackfillKanshouAi` 一直有生成），只是從來沒印出來。
另寫一套讀法＝同一個資料兩種讀法，日久必歪。

**`_mePron_` 為什麼不能寫死「他」**：御主性別是資料，而且 `actionKanshouSetSex` 可以隨時切換。
我第一版就寫死了，被 `check_pronoun.py` 當場抓到——那支掃描器存在的理由正是這個。

### `KANSHOU_BACKFILL_DONE_TAG_`（【設定已補】）　<sub>Gallery.gs</sub>

`actionBackfillKanshouAi` 原本【無條件覆寫】background/traits/personality/萌點。
平常看不出問題（只在創角後跑一次），但要替**舊角色**補新欄位（口吻/小動作）時就必須再跑一次——
那會把玩家一路玩出來、改命改過的設定整組洗掉。

修法不是「另外寫一支只補口吻的」（那是疊補丁），是把 backfill 本身變成正確的：
**第一次補完蓋章，之後再跑只填還空著的格子。** 蓋了章就只補空格，所以舊角色回來補口吻是安全的，
而且以後任何時候再跑都不會毀掉存檔。

順手併掉一個 round-trip：MEMORY 上有三件事要寫（衣裝／口吻／小動作），原本衣裝自己讀一次寫一次，
現在三件事一起，讀一次寫一次；而且沒東西可改時完全不寫。

### 「誰算在場」的三塊合一 / `backgroundCrowdStr`　<sub>Gallery.gs</sub>

2026-09 玩家「大道至簡」。量出來最大的一團：**「誰算在場／誰不算」散在 8 段、855 字**，
其中三段在講同一件事、還互相補充——★【路人與缺席者】(96)、★【可以發明，但發明完要記下來】(161)、
★【在場名單】(151)。三段各自從一個角度描述同一條規則，AI 要自己把它們拼起來。

合併成一段 ★【這個世界有誰】，一次講完三層：
正式同伴（算好感、卡在下面）／常民（可出現、不算好感）／路人（隨手寫、不必記）。

順手把兩句**寄生句**歸位——它們原本卡在 ★【可以發明】裡，跟那塊的主題無關：
「萌點、個性只演出來不寫進敘述」其實是鐵律 8 的事（那裡已經有一條一模一樣的）；
「玩家專一對著一個人時其他人背景輕描」是在場那塊的事。
⚠ 寄生句是這種長提示詞最容易長出來的東西：改 A 的時候順手把 B 也寫在這裡，
下次讀的人以為它跟 A 有關。合併時要一句一句問「這句屬於這塊嗎」。

`backgroundCrowdStr` 保留成空字串而不是刪掉變數：它被插在 `PROMPT_REL` 的樣板中間，
留著空字串比改動樣板結構安全（要真的清掉是另一次重構的事）。

### `kanshouWorldDrop_`　<sub>Gallery.gs</sub>

常民升格成正式同伴之後，帳本裡那條【沒清掉】＝**同一個人兩份真相**：
他同時出現在【在場人物】卡（活的、會更新）與【這個世界已經確立的事】名單（升格當下的舊描述、
永遠不會更新）。AI 看到兩份會怎麼演沒人知道，最好的情況也只是浪費 token。

抽成共用的一支而不是就地寫一段 deleteRow：面板的「刪掉」本來就在做一模一樣的事
（找同類同名那一列、刪、作廢快取），兩處各寫一份遲早會走歪。

### 地點為什麼從世界帳本面板移走（資料層不動）　<sub>Script_Kanshou.html `kwRender_`</sub>

玩家：「世界帳本應該是要紀錄更大事件的？剛剛連咖啡廳都紀錄」＋「我本來就有地圖阿」。

**地圖跟世界帳本從來就不是兩個系統**：`kanshouLocationsFor_` ＝ 內建 29 個地點 ∪ 帳本「地點」類，
而地圖面板的第 6 個分區「走出來的地方」讀的就是後者。所以咖啡廳被記下來的時候，
它**已經是地圖上的一格**了——帳本只是它的儲存位置。

問題純粹是**同一筆資料被展示兩次**：在地圖上它是個地方（對的），在帳本面板裡它長得像一條回憶
（怪的）。所以修的是展示，不是架構：帳本面板改成一行指路，資料層一個字沒動。

⚠ 別回頭把地點從帳本表拿掉——那是地圖長大的唯一來源，拿掉地圖就不會長了。

### `KANSHOU_REGION_KIND_` / `kanshouRegionsFor_` / `KW_.REGION` / `KW_.OWN`　<sub>Gallery.gs</sub>

2026-09 玩家要三件事：自訂大區（「大區就是一個國家，地點就是該國自訂的景點」）、
家中地點自由生成、「我的店」（純互動、不要金錢數值，但要有店名與營業內容）。

**三件事是同一個機制**：講的都是一個地方身上的兩件事——**在哪一區**、**是不是你的**。
所以資料層只加兩欄，不是三套系統。家中地點＝把新地方開在 `home` 區；我的店＝`OWN` 欄有值。

**為什麼自訂大區幾乎免費**：所有 region 的行為判斷都寫成
`region !== 'room'`／`region !== 'visit'` 這種【否定】形式（不巧遇、要好感才能登門…），
所以一個陌生的區 id 自動落在「一般公共區」那一邊——**一行行為邏輯都不用改**。
這是當初把行為寫成否定形式意外換來的好處；要是寫成 `region === 'shinzan' || ...` 的白名單，
今天就得逐處改。

**大區為什麼不放進 `KANSHOU_WORLD_KINDS_`**：那張表同時管兩件事——①AI 能寫哪些 kind
②哪些 kind 會被淘汰。大區兩者皆非：不能讓 AI 自己生一個國家出來；而大區是結構，
被淘汰會讓底下的地點指向一個不存在的區、全變孤兒。
⚠ 代價是 `kanshouWorldWrite_` 的 kind 檢查要額外放行它——這裡踩過一次（op 回 success 卻什麼都沒寫）。

**區 id 為什麼是生成的、不是 `'rg_' + 區名`**：第一版就是拼名字，結果一改名底下所有地點
就指向不存在的區。改成建立時生成 `rg_<timestamp36>`、存在該列自己的 REGION 欄，改名只動 NAME。
收掉一個區時則**先把底下地點的 REGION 清空**（放回「走出來的地方」）再刪那一列，不留孤兒。

**`sanitizeAiData_` 為什麼改成重建白名單物件**：`world_note` 原本是 AI 回傳的物件整包穿過去，
只 filter kind 沒有挑欄位。加了 OWN 欄之後，AI 只要塞 `{own:"按摩"}` 就能把任何地方宣告成
「玩家開的店」，或把地點塞進別人的大區。改成只留 kind/name/text/sex 再往下送——
**擋在最外層**，而不是在寫入點逐欄判斷來源。

### 內建地點從 29 砍到 23　<sub>Gallery.gs `KANSHOU_LOCATIONS_`</sub>

玩家「基礎地點可以減少一些，留點有特色的就好，其他讓玩家自己決定」。

⚠ **砍之前一定要查綁定**（玩家自己提醒的：「有些角色會有特定出現地點要看一下」）：
`KANSHOU_LOCATION_TAGS_` 有 8 個地點綁著特定角色的出沒點、`KANSHOU_HERO_HOME_` 有 6 個專屬住處、
`KANSHOU_COHABIT_ROOM_` 綁死「和室」、睡眠判定綁死「我的房間」。砍到這些的話，
那個角色會掉進泛用保底池、同居會搬進一個不存在的房間。

實際砍的 6 個都是**沒有任何綁定、也沒有特色**的：廚房、庭院、屋頂花園、老道場、山間小徑、
隱藏溫泉（溫泉留「情侶溫泉套房」當代表）。前端鏡射 `KC_LOCATIONS_` 要同步砍，`check_mirror.js` 會盯。

### `KANSHOU_HAUNT_WEIGHT_` / `kanshouRollDailyLocation_` 的池子　<sub>Gallery.gs</sub>

2026-09 玩家看到我說「砍了地點那個角色就沒去處」之後反問：
「砍了就沒去處?! 是不是不要綁地點 有點沒必要?」——直覺對，而且實情比「沒必要」更嚴重。

原本是 `pool = haunts.length ? haunts : 全部地點`。**三元運算子的那個 `?` 就是牢籠**：
有綁定就【只】從綁定裡挑，而 `KANSHOU_LOCATION_TAGS_` 裡 9 個角色各只綁一個地點——
阿爾托莉雅這輩子只會出現在咖啡廳、凜只會在便利商店。
更糟的是保底池 `KANSHOU_LOCATIONS_` 只有內建地點，**沒有任何同伴會出現在玩家自己開的地方**，
跟「地點自由／大區自由」整條線正面打架。

改成加權：池子永遠是整個世界（含玩家開的），老地方只是多放幾份進去。
實測老地方仍佔 31%（「想找凜就去便利商店碰運氣」這個手感留著），但她會去 16 種地方。

**為什麼是加權而不是整張表砍掉**：那張表是 8 行純資料、零 if 鏈，
而「她常在那裡」是真的有玩法價值的（知道去哪找人）。砍掉會讓所有人變成均勻亂數、
角色感消失。加權同時保住兩邊，而且 `KANSHOU_HAUNT_WEIGHT_` 設 0 就退化成完全隨機——
要不要老地方變成一個旋鈕，不是一次重構。

**順帶解掉「砍了就沒去處」**：`if (all.indexOf(h) < 0) return;`——地點被砍掉就當沒這條偏好，
保底是整個世界。所以現在砍任何地點都不會讓誰沒地方去。

### `KANSHOU_PACE_OPTIONS_` / `kanshouPaceOf_` / `kanshouHoursUntilDateTime_`　<sub>Gallery.gs</sub>

2026-09 玩家：「對話 10 分鐘太慢，30 分鐘比較符合但又太快…如果是色色又太快，沒辦法平衡」。

**根源：一個回合不是一段固定的時間。** 「早安。」是三秒、一起吃頓飯是四十分鐘、一場情事是兩小時。
固定任何數字，對其中兩種永遠是錯的——所以這不是「10 還是 30」的調參問題，怎麼調都會錯。

我一開始提的是「對話不花時間、做事才花」（移動/吃飯各自一個耗時表）。玩家提的是
「給一個流速選項」。**他的比較好**：我的方案要我去猜哪些動作該花多久，那張表我得維護、
而且永遠會有例外；他的方案把判斷放在資訊真正所在的地方——只有玩家知道這一幕是三秒還是一下午。
而且「暫停」完整包含了我的方案，只是變成選項之一而不是寫死的政策。
**連帶收回我自己提的「移動耗時表」**：有了旋鈕之後移動就只是另一個回合，再加第二個時間來源
會毀掉這個模型唯一的優點。

實作上幾乎免費：`KANSHOU_HOUR_PER_ACTION_` 是個常數、只有兩處用到，改成讀玩家 MEMORY 即可；
「下一時段」「跳節慶」的引擎（`jumpBand`／`advanceHours`）本來就在，指定日期時刻也只是
算出差幾小時後丟進同一條管線。

**為什麼指定日期只能往前**：約定存絕對日、好感棘輪（BOND_FLOOR）、相簿日期、節慶完成標記、
初見日/紀念日**全部是單向時間戳**。往回調不會「回到過去」，只會讓這些東西互相矛盾
（例如已經赴過的約又變成未來的約）。往回一律回 0，要重來有歸零那顆。

**暫停為什麼一定要在時鐘上標 ⏸**：暫停時世界是真的凍住的——她們不換地方、不會想睡、
約定不會到。不標出來的話，玩家過一陣子會覺得「怎麼都沒人來赴約」而當成 bug 回報。

### `check_ui.js`（第十二支掃描器）

2026-09 鑑賞全面稽核時發現的**結構性破口**：`.html` 的 runtime 完全沒有自動防線。
CI 只跑 `.gs`；`check.sh` 對 `Script*.html` 也只做 `node --check`，那只能回答
「這段 JS 合不合法」，不能回答「函式叫得到嗎、面板畫得出來嗎」。
而 VM 探針（`wait.js`／`ui.js`）住在 scratchpad，只有想到才會跑。

這正是這專案被燒過的形狀：2026-07 敘事排版壞了四天——**綠燈、部署成功、零錯誤訊息**。
語法對 ≠ 跑得動。

做法：三個 `Script*.html` 的 JS 串進同一個 VM（等同瀏覽器的共享作用域）配最小 DOM 假件，
真的把 19 個玩家入口與 4 個面板叫起來一次。

**為什麼只驗「叫得到、不拋例外」**：細節斷言（畫面上該有哪幾個字）會讓這支變得脆弱又愛叫，
每次改 UI 文案都要回來改它，久了就會被當成雜訊關掉。冒煙測試的價值在於它永遠不吵。

⚠ **`pc` 一定要走 localStorage 餵**：`Script.html` 頂層是
`let pc = JSON.parse(localStorage.getItem('kyushu_v27'))`——頂層 `let` 建立的是語彙綁定，
事後指派 `ctx.pc` 蓋不掉它，會得到一個 `pc` 永遠是 null 的假環境（這個坑在寫探針時踩過）。

兩種注入退化都確認會叫：入口被改名 →「叫不到 openKanshouTime()」；
面板裡叫一個不存在的東西 →「拋例外」。

### `KANSHOU_MEMOIR_CAP_` / `KANSHOU_MEMOIR_PIN_CAP_`　<sub>Gallery.gs</sub>

2026-09「檢查玩家看到的資訊和後台是否一致」時挖出來的：共同回憶的兩個上限原本是
**寫死在三處的魔術數字**——後端總量 `processMemoir_(..., 10)`、後端釘選 `>= 8`、
前端說明文字「最多10條…上限8」。三處沒有任何連結，改一個另外兩個不會跟著動。

危險的地方在於 `check_mirror.js` **看不到它**：那支只比對 `KC_*` 常數 ↔ 後端常數，
而寫死的數字根本不是常數。所以這種不一致可以無聲存在很久——玩家看到「最多10條」，
後端其實留 12 條，沒有任何東西會叫。

抽成具名常數 ＋ 鏡射成 `KC_*` 之後，check_mirror 自動發現（14 組 → 16 組）並盯住。

**釘選上限為什麼刻意比總量少 2**：釘滿就會讓新回憶永遠擠不進來——總量到頂時要淘汰，
但釘選的不能被淘汰，於是新的永遠寫不進去。留 2 格給新的。
