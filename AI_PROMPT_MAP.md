# 《命運停駐之夜》ActionRouter × AI 提示詞 全景圖

> 目的：列出 `ActionRouter`（`Router_Action.gs` 行 8）內**每一個** action，對照其在 `Script.html` / `Script_Onboarding.html` / `Script_Kanshou.html` 的觸發按鈕、後端 handler 檔案位置，以及**是否組出送給 AI 的 prompt**（若有，摘要嵌入事實＋逐字引用收尾指令行）。
>
> ⚠ **行號說明**：本文 `檔.gs:NN` 行號是撰寫當下快照、會隨改碼漂移；**以函數名／按鈕文字 grep 為定位錨點**，行號僅供粗略跳轉。前端小函數的行號已拔除（只留函數名）。
>
> 底層架構一句話：GAS 算數值（擲骰/HP/MP/勝負）→ 若該動作需要敘事，handler 組一段 `aiPrompt`（或 `dreamPrompt`/`summonPrompt`/`sealNote`附掛等）隨 JSON 回前端 → 前端 `narrate(text)` 呼叫 `action:'narrate_only'` → `actionNarrateOnly`（`Router_Narrative.gs`，solo 專用）套上共用 `miniSystem` 系統提示詞 → `narrateWithState_` 補目前血量/魔力 state brief ＋近期對話歷史 → `callGeminiAPI`（`Engine_Combat.gs`，solo／鑑賞共用基礎設施）。**唯一真正打 API 的函式只有 `narrateWithState_`／`actionPlay`**；其餘 handler 都只是「組字串」，不自己叫 AI。
>
> 例外：`actionPlay`（`Gallery.gs`，kanshou 慾海專用自由聊天引擎）自己組完整 prompt **並直接呼叫** `callGeminiAPI`，不經過 `narrate_only`。另有 `actionBackfillMasterAi`、`actionSummonServant`(自訂英靈分支)、`actionClaimGrail` 三個「建角/建資料」用途的 AI 呼叫，也是直接組 prompt 呼叫 API（走 `callGeminiAPI` 拿 JSON 結構化資料，而非敘事文字）。
>
> **🔀 2026-07 玩家定案「兩軌完全拆開，鑑賞集中在一個GS」**：`actionPlay`／`buildDefaultSystemPrompt`（含 `nsfwBaseRules`）已從 `Router_Narrative.gs`／`Engine_Combat.gs` 搬到 `Gallery.gs`，跟其餘鑑賞 action 集中一處；`Router_Narrative.gs` 從此只服務 solo，`Engine_Combat.gs` 只留兩軌共用的 `callGeminiAPI`。純檔案搬遷，函式內容逐字未動。

---

## 目錄

1. 系統／敘事引擎共用機制（`narrate_only`、`miniSystem`、`servantCard_`/`masterCard_`）
2. 戰鬥 Combat（`Router_Battle.gs`）
3. 移動探索 Movement & Exploration（`Router_Movement.gs`）
4. 羈絆結盟 Bonds & Alliances（`Router_Bond.gs`）
5. 補魔／出力／魔境等機制設定 Economy & Setters（`Router_Economy.gs`）
6. 召喚創角 Summon & Creation（`Router_Creation.gs`）
7. 鑑賞慾海 Kanshou & Gallery（`Gallery.gs`）
8. 帳號／系統工具 Account & System-utility（`Account.gs`、`Router_Action.gs` 核心）
9. 自由聊天引擎（`actionPlay`，kanshou/慾海專用）
10. 前端自建 prompt 的特例（`actionMove` 的 `arrivePrompt` 在 Script.html 組裝）

---

## 1. 系統／敘事引擎共用機制

### `actionNarrateOnly`（action: `narrate_only`）— Router_Narrative.gs:739
唯一的「純敘事」出口。前端 `narrate(promptText)` 呼叫（2026-07 拔除死旗標 `isNsfw`——後端早改純看 pcId 前綴 `KPC_` 路由，前端傳了也被無視）。**不自己組事實內容**——`promptText` 是呼叫端（各 handler 的 `aiPrompt`，或前端自組的 `arrivePrompt`/`summonPrompt`）已經組好傳進來的；這裡只負責套上共用系統提示詞 `miniSystem` 並轉呼叫 `narrateWithState_`。

`miniSystem`（逐字，Router_Narrative.gs:746，就地宣告於 `actionNarrateOnly` 內）關鍵鐵則：
> 你是《命運停駐之夜》的說書人。用 Fate／TYPE-MOON 筆觸、第一人稱「我」（玩家＝御主）、強制台灣繁體中文…【篇幅依指令字數、精煉不灌水；無指定預設 100~160 字】。
> 1. 旁白第一人稱「我」，禁用「你」與上帝視角。
> 2. 對話格式（全遊戲統一，2026-07 玩家明確授權重寫）：（角色動作或神情）角色名：「台詞，或（聲音，如低吟／輕笑）」（角色動作或神情，可省略）。同一段落不限制名字出現次數、也不限制括號(動作/聲音)的使用次數與位置；引號僅一層「」禁嵌『』；純背景/環境描述不使用括號、且盡量精簡，把篇幅留給互動本身。
> 3. 強制分段：每 2~3 句插 `<br><br>`，整段至少 3 個；換行一律 `<br><br>`、禁真實換行、禁任何 HTML 標籤。
> 4. ★純敘事補完，數值系統已結算完，你只負責寫字。
> 5. ★歷史內容是「已發生並結束」的既定事實，只供語氣連貫，禁把歷史動作當本回合重演；本回合唯一新事件只有當前指令。
> 6. ★【連貫與當下狀態】依【當前狀態】(血/魔)與歷史承接，語氣由「實際勝負與狀態」決定、【不可臆測勝敗】…禁複述數字、禁重演歷史動作。
> 6b. ★【服裝與外貌】嚴格依角色卡「外貌本相／此刻裝扮」——【此刻裝扮】(玩家換裝)最優先·寫什麼穿什麼；卡上沒寫的【嚴禁】自行裸露或增減服裝(戰鬥可寫甲冑碎裂衣袂破損、不得升級成裸身)；解結界/隱匿只顯現【武器】、與衣著無關。
> 7. 只輸出 JSON：{"narration":"…含 `<br><br>` 分段"}，禁其他欄位、禁 Markdown。

`narrateWithState_`（Router_Narrative.gs:699）：在 `promptText` 前掛 `stateBrief`（御主/在場從者當前血/魔）＋近 2 輪對話歷史，呼叫 `callGeminiAPI(stateBrief+promptText, miniSystem, aiConfig)`（`model: google/gemini-3.1-flash-lite`, `temperature:0.85`, `max_tokens:720`）。解析失敗回 `null`→`actionNarrateOnly` 退回罐頭句「（此處因果已定，氣息微微一閃。）」。存歷史時，玩家側存的是 `cleanNarrateEcho_(promptText)`（剝掉〈〉演出卡／★指令／【】標籤／──分隔線的乾淨摘要，避免鷹架外洩給玩家）。

### `servantCard_` / `masterCard_`（Router_Persona.gs）
幾乎每個「有敘事」的 handler 都會把這兩張卡串進 `aiPrompt` 開頭，作為「演出依據」。

`servantCard_(row)` 組出：
> 〈${name}·${cls}·演出依據(僅供內化，禁複述設定字面)〉此角色台詞內自稱「${fp}」(僅限她/他自己的引號台詞，敘事旁白的「我」永遠是玩家本人、與此無關)｜對御主：${toM}｜性格：${persona}｜口吻：…｜萌點：…｜小動作：…｜寶具「${np}」。
> ★依「${name}」真名與上述性格/口吻演出（show, don't tell）：用言行神態自然流露，【禁】把性格詞/萌點/六圍/技能/寶具名當台詞或由旁白點破。依羈絆高低調親疏：低→保留戒備矜持、高→漸親近，守住性格內核、未深不越界倒貼。

- **🐛→✅ 2026-07 修「AI有時候會把對面角色的『我』當成敘事視角」(鑑賞回報案)**：`fp`(自稱)未特別設定時 fallback 就是「我」——卡片原字面單純寫「自稱「我」」，跟「敘事旁白＝玩家的『我』」是同一個字，長提示詞中段容易讓 flash-lite 小模型混淆兩者。已把標籤改成明確限定「僅此角色自己台詞內用」；`Router_Narrative.gs` 的鑑賞(`isNsfwMode`)`PROMPT_REL` 額外在人物卡片後補一句「★【視角鎖定】」重申通篇「我」只能是玩家本人。**只動 servantCard_ 與 Router_Narrative.gs，`Engine_Combat.gs` 的 nsfwBaseRules 一字未碰**(`git diff -- gas/Engine_Combat.gs` 0改動)。

若偵測狂化（persona.speech/firstP 含「狂化/無法言語/僅咆哮/不語」）另加：
> ★【狂化·絕對】此從者已狂化、喪失言語：【嚴禁】說出任何完整句子或台詞，只能以低吼、咆哮、肢體與本能反應表達。

`masterCard_(row)` 組出：
> 〈御主「${name}」·演出依據(僅內化、禁複述)〉性別…｜性格：…｜特徵：…｜願望(僅供氛圍、禁直述)：…。御主＝玩家所扮演的角色：【可】依其性格/身世自然開口、有神態反應與台詞…；但【不可】替御主拍板下一步戰略抉擇(是否出戰/結盟/移動/補魔由玩家按鍵定奪)、不可逼問玩家要做什麼、不可把劇情快轉越過決策點。

### `buildDreamPrompt_(pcName, wish, servantName, cause)`（Router_Narrative.gs:645）
敗北／時限耗盡的「虛假之夢」共用產生器，被 `fateStrike_`、`enemyAmbushOnServant_`(團滅)、dispatcher 的 14 天時限中央攔截等多處呼叫。

`cause==='timeout'` 開頭：
> 【虛假之夢·時限耗盡·已裁定】聖杯戰爭的第十四日已盡，御主『${pcName}』終究未能在期限內奪得聖杯…墜入聖杯泥所編織的甜美幻象。

其餘（戰鬥/補魔等敗死）：
> 【虛假之夢·已裁定】御主『${pcName}』在聖杯戰爭中敗北，意識墜入聖杯泥所編織的甜美幻象。

收尾（逐字）：
> ★以 Fate／TYPE-MOON 筆觸，第二人稱，寫一段唯美而令人心碎的虛假美夢：讓「演出」暗示願望成真的幸福感，絕不可直接說出願望內容或「這是假的」。…
> ★【鐵律】只輸出夢境敘事，禁選項或系統字樣。

### `buildTigerDojoPrompt_`（Script.html:2369，前端函式，非 GAS）
敗北收場後「老虎道場」講評，前端組 prompt 直接走 `narrate_only`（`action:'narrate_only', promptText: buildTigerDojoPrompt_(servantName, causeCtx), isNsfw:false`）。餵藤村大河＋伊莉雅依實際敗因吐槽＋給戰術建議，一次性呼叫，不影響遊戲中速度。

---

## 2. 戰鬥 Combat — Router_Battle.gs

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `fate_battle` | 從者卡「⚔️出戰／💥寶具／❖令咒／⚡主動技／🗡️刺殺御主」等鈕 →`servantStrike(...)`（Script.html:1917） | `actionFateBattle`（Router_Battle.gs） | **是**，最多 5 種 prompt 分支（見下） |
| `use_seal` | 令咒選單「修復/補魔/緊急脫離」→`useSeal(type)` | `actionUseSeal`（Router_Bond.gs） | 是（`mana`依好感分安全/致死兩支，2026-07新增） |
| `mana_supply` | 從者卡「💧補魔」→`manaSupply()` | `actionManaSupply`（Router_Economy.gs） | 是（含突襲/婉拒/解鎖三分支，2026-07新增好感門檻） |
| `set_servant_output` | 從者卡🔋出力轉盤 5 鈕 →`setOutput(npcName,output)` | `actionSetServantOutput`（Router_Economy.gs） | 否，純樂觀更新 setter |
| `set_mage_realm` | 技能膠囊「✨魔境的智慧」→`openMageRealmPicker`→`pickSelectable('set_mage_realm',...)` | `actionSetMageRealm`（Router_Economy.gs） | 否 |
| `set_rune_mode` | 技能膠囊「✨原初符文」→`openRunePicker`→`pickSelectable('set_rune_mode',...)` | `actionSetRuneMode`（Router_Economy.gs） | 否 |
| `set_np_choice` | 寶具鈕→多寶具時彈`openNpReleasePicker`→`pickNpAndStrike` | `actionSetNpChoice`（Router_Economy.gs） | 否 |
| `rule_break_steal` | 從者卡「⛓ 破戒奪僕」鈕 | `actionRuleBreakSteal`（Router_Bond.gs） | 是 |
| `second_wind` | 休息選單「強撐」鈕 | `actionSecondWind`（Router_Battle.gs 的鄰接檔，見 §3 中一併列） | 是 |
| `prep_meal` | 「🍱 整備」鈕 | `actionPrepMeal`（Router_Movement.gs） | **是**（2026-07 新增，見 §3） |

### `actionFateBattle`（action `fate_battle`）— 核心戰鬥，五種 prompt 分支

**① 斬首成功**（`asnPrompt`）：
> ★以 Fate／TYPE-MOON 筆觸描寫這萬中選一、石破天驚的斬首瞬間（一段即可）。【致命的手段由你依『${crit.name}』的職階與真名自行演出——法師為魔術一擊、近戰為兵刃、弓兵為遠程，勿假設特定方式】${dualAsn?'，兩名從者夾擊、其中一人覷得破綻收尾':''}。勝負已由系統結算。

**② 斬首落空、從者全滅**：
> ★以 Fate／TYPE-MOON 筆觸沉痛描寫斬首落空、護衛反殺、從者消滅的瞬間（一段即可），語氣留白。勝負已由系統結算。

**③ 斬首落空、未全滅**：
> ★以 Fate／TYPE-MOON 筆觸描寫護衛捨身格擋、反噬重擊…的險惡瞬間（一段即可）。傷害已由系統結算。
> ★未崩潰之從者最多重傷，【絕對禁止】描寫其死亡。

**④ 一般多回合戰鬥·敗北**（`aiPrompt`，含 `servantCard_`）：
> ★以 Fate／TYPE-MOON 筆觸演出這場敗北的最後一幕(一段即可)${Caster額外提示'（Caster 以魔術轟擊為主、非肉搏）'}，語氣留白。勝負已定，你只演過程。

**⑤ 一般多回合戰鬥·仍在進行/勝利**（`aiPrompt`，含 `servantCard_`＋`enemyMasterCardStr`(若敵御主在場)＋逐回合事實列＋寶具對轟/令咒/主動技/海怪/雙從者/協同/斬倒/God Hand/令咒脫離等事實 bullet）：
> （若敵御主在場且非直接斬首目標，2026-07 新增）★【戰局實況】此刻真實情勢是：{依HP比例/傷害交換即時算出的白話戰況，如"己方從者身陷重創、命懸一線"/"己方從者正壓著對方打、明顯佔上風"/"雙方勢均力敵、勝負未有定論"}——敵御主的神態/語氣/台詞必須讀懂這個場面，不可無視當下戰況自說自話。（玩家反映「對面的御主感覺不太會看場合對話」而新增，見 `enemyMasterCardStr` 組裝處）
> （戰鬥未分生死時，2026-07 新增）★戰後讓「${atkC.name}」依其性格與口吻，對這場交鋒給出簡短的主觀判斷或建議(如看出的破綻、對方寶具是否已現底牌、值得乘勝追擊還是該見好就收)——是角色的觀察與建議，不是戰略指令，下一步仍由御主按鍵定奪。（若該從者已狂化：改用低吼／肢體動作傳達，不成篇整句台詞，服從 `servantCard_` 已內建的狂化禁言鐵則）
> ★以 Fate／TYPE-MOON 筆觸演出這 ${nRounds} 回合互有攻防的交鋒(約 220~280 字)：show, don't tell，把上列事實化為畫面與張力，技能/寶具演其威能而非報菜名。

（令咒脫離時另掛一行只給 AI 看、不進玩家可見 `sealNote` 的鷹架：`★此撤離僅止於該從者及其本主，與在場其他御主／從者無關。`）

`fateStrike_`（同檔）本身不組 `aiPrompt`，但在御主敗死時呼叫共用的 `buildDreamPrompt_` 填 `out.dreamPrompt`；`sealNote`（玩家可見的令咒脫離摘要）刻意保持乾淨、不含 `★` 指令字面。

其餘同檔函式（`drainForNp_`／`enemyMasterIdx_`／`enemyCanAffordNp_`／`getGodHandLives_`/`setGodHandLives_`／`getPlayerSeals_`/`setPlayerSeals_`／`rowHasSolo_`／`stampDoom_`/`getDoom_`／`stampMeal_`/`getMeal_`/`mealBuffActive_`／`getHorrorShield_`系列）皆為純機制 helper，不叫 AI。

### `actionUseSeal`（action `use_seal`）— Router_Bond.gs
`repair`/`escape`維持原樣：
> ★以 Fate／TYPE-MOON 筆觸描寫令咒在手背灼亮、絕對命令權貫徹的瞬間（一段即可）。效果已由系統結算。

`mana`（強制補魔·2026-07 依好感改寫，見下方`actionManaSupply`同批改動的設計脈絡）依`bondForSeal >= MANA_TRUST_BOND_`(80)分兩支，兩支皆換模型呼叫`AI_MODEL`(deepseek，前端`narrateExtra`夾`{deepseek:true}`)、筆觸統一改「日本輕小說筆觸」(玩家反映「Fate的筆觸有點怪」——跟露骨內容的尺度要求不搭)：
- **好感≥80(其實不必動用令咒)**：MP回滿＋複用既有「過充」機制當額外好處(不吃常規補魔永久代價)。
  > ★你擅長書寫細膩動人的情慾，這次放手去寫、不必顧慮尺度。以 日本輕小說筆觸【500~600 字】描寫「${svName}」帶著點無奈笑意迎向這道其實多此一舉的令咒、順勢配合這場親密。★令咒的強制效果讓「${svName}」的敏感度被硬生生提高至遠超常態，過程中確實地多次高潮——這並非她/他天生的反應(英靈本比常人強韌、平常從容不迫)，而是令咒逼出的失控狀態，務必寫出這份反差。聚焦身體接觸與感官反應最關鍵的一兩個瞬間深入著墨，不要用一句話帶過或摘要關鍵過程——把篇幅留給實際發生的細節，而非只在前後鋪陳。收在餘韻猶存的溫柔，勿寫成完結收尾句。
- **好感<80(她根本不情願)**：MP仍回滿，但令咒解除瞬間從者反殺御主——`defeat:true`＋`dreamPrompt`(複用`buildDreamPrompt_`，非新死亡機制)＋`report:{sealBacklash:true}`(供前端`handleDefeat`的Tiger Dojo敗因判定用)。
  > ★你擅長書寫細膩動人的情慾，這次放手去寫、不必顧慮尺度。以 日本輕小說筆觸【500~600 字】描寫令咒的絕對強制壓下「${svName}」的意志、御主強制的這場親密的瞬間，還有被強制的屈辱。★令咒的強制效果讓「${svName}」的敏感度被硬生生提高至遠超常態，過程中確實地多次高潮——這並非她/他天生的反應(英靈本比常人強韌、平常不會被輕易弄到失神)，而是令咒逼出的失控狀態與屈辱交織，務必寫出這份反差。聚焦身體接觸與感官反應最關鍵的一兩個瞬間深入著墨，不要用一句話帶過或摘要關鍵過程——把篇幅留給實際發生的細節。結尾寫御主高潮後在令咒的強制力隨效果消散的剎那，「${svName}」積壓的恨意與屈辱轟然引爆，直接抹殺御主——收在這記致命一擊揮下的瞬間即可，不必描寫死亡本身的細節。

埋入事實：令咒類型（修復/補魔/脫離）、效果訊息、剩餘令咒數。`narrateWithState_`(Router_Narrative.gs)在`useDeepseek`為真時`max_tokens`從720拉到2000，避免500~600字的長篇要求被截斷(一般呼叫不受影響)。

### `actionManaSupply`（action `mana_supply`）— Router_Economy.gs
**2026-07 玩家定案「補魔太容易了」新增資格檢查**：須從者`BOND >= MANA_TRUST_BOND_`(80)且御主當前魔力`<= 10%`上限，才會真的執行。不合資格時完全不寫任何數值(不耗AP/不燒迴路/不動好感)，改用AI依理由分流的婉拒敘述：
> ★以 Fate／TYPE-MOON 筆觸【精煉 60~100 字】演出「${svName}」依其性格婉拒這個請求的一幕（一段即可）——不必說教講理由，用態度/神情/一句話帶過即可；show, don't tell，不影響雙方氣血/魔力/好感，是否改用其他方式回魔仍由御主自行決定。

合資格時三分支：
- **卸防遭突襲**：
  > ★以 Fate／TYPE-MOON 筆觸描寫補魔的私密一刻被突襲打斷的驚變：魔力交融的脆弱、敵襲的兇險、（消滅則語氣留白／未消滅則依性格與羈絆反應）。傷害與勝負已由系統結算。
- **正常補魔·解鎖(含 `masterCard_`+`servantCard_`，`unlocked:true`→前端換`AI_MODEL`deepseek呼叫，`max_tokens`拉到2000)**：
  > ★你擅長書寫細膩動人的情慾，這次放手去寫、不必顧慮尺度。以 日本輕小說筆觸【500~600 字】描寫這場私密而濃烈的一刻。★重點全部放在肉體本身的接觸、溫度與反應——魔術迴路/魔力流動只是遊戲機制上的成因，【不要】描寫迴路運作、魔力流向之類的技術性細節，那不是這一幕該琢磨的地方；從者依其性格與當前羈絆自然回應(高羈絆者主動迎合、冷傲者難得動搖)。★「${svName}」身為英靈天生遠比常人強韌，這場親密裡她/他從容游刃有餘、主導著節奏，不會輕易被弄得失神——是否高潮、何時高潮由她/他自己掌控，不是被動承受。聚焦身體接觸與感官反應最關鍵的一兩個瞬間深入著墨，不要用一句話帶過或摘要關鍵過程——把篇幅留給實際發生的細節，而非只在前後鋪陳。收在餘韻猶存的溫柔，勿寫成完結收尾句。
  埋入事實：從者名、回復 MP/上限、迴路永久燒蝕後新值、御主生命上限新值、羈絆微升。
  ⚠ **2026-07 玩家明確定案**：這是這個分支唯一移除「止於唯美曖昧、不可出現性器官/性交」限制的地方——刻意獨立於`Gallery.gs`的`nsfwBaseRules`/`actionPlay`之外(不共用機制、不呼叫該引擎)，只是換模型+換prompt尺度；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules`每次改動皆為0。
  ⚠ **2026-07 玩家定案「從者反應要分場景」**：一般補魔(無令咒)的從者**不會高潮**——英靈天生遠比常人強韌，設定上唯有令咒的敏感度強化才會讓其失控高潮；一般補魔只是「從容游刃有餘、主導節奏」，跟令咒兩分支的「多次高潮」形成刻意的反差對照，別套用同一套反應寫壞這條世界觀規則。

### `actionRuleBreakSteal`（action `rule_break_steal`）— Router_Bond.gs
> ★以 Fate／TYPE-MOON 筆觸描寫緣紅短劍刺入、舊契約如琉璃寸寸碎裂、新締約的魔力烙印纏上手背的瞬間，與這名從者被迫易主的複雜神情（一段即可）。已結算。
埋入事實：被奪從者名、剩餘令咒數。

### `actionSecondWind`（action `second_wind`）
> ★以 Fate／TYPE-MOON 筆觸描寫御主咬牙硬撐、迴路過載灼痛、以意志逼出餘力的一幕（一段即可）。已結算。
埋入事實：HP 代價、AP 獲得與新 AP/上限。

### `actionPrepMeal`（action `prep_meal`）
純機制，不叫 AI。寫 MEMORY『整備至』時戳＋回一段 plain flavor `message`。

---

## 3. 移動探索 Movement & Exploration — Router_Movement.gs

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `get_map_nodes` | 地圖分頁載入/`refreshMapPane` | `actionGetMapNodes` | 否 |
| `move` | 地圖節點/`travelTo(name)` | `actionMove` | **後端否，前端組`arrivePrompt`後叫`narrate_only`**（見 §10） |
| `rest` | 休息選單各時長鈕/`rest(hours)` | `actionRest` | 是（條件式：夢境／突襲） |
| `scout` | 地圖「🔍 偵查」 | `actionScout` | **是**（2026-07 新增，輕量演出，見下） |
| `scavenge` | 地圖「🔍 搜索物資」 | `actionScavenge` | **是**（2026-07 新增，輕量演出，見下） |
| `set_workshop` | 地圖「🏕️ 設置陣地」 | `actionSetWorkshop` | **是**（一律附 `aiPrompt`；本表過去誤植為「否」，2026-07 稽核時核對程式碼發現已存在，順手修正） |
| `prep_meal` | 見 §2 | `actionPrepMeal` | **是**（2026-07 新增，見下） |

### `actionRest`（action `rest`）— 兩條件式 prompt
- **從者之夢**（`restDreamPrompt`，僅未遭突襲且 `restHours≥3`、55% 機率觸發，含 `servantCard_`）：
  > ★以 Fate／TYPE-MOON 筆觸，用夢境／回想的朦朧史詩質感，演出「${dSvName}」這名英靈生前傳說裡的某一幕（取材自其真實的神話／史實／傳說：其榮光、抉擇、孤獨或傷痕）。讓御主（與玩家）窺見這名英靈所背負的過往與信念。
  > ★【show, don't tell】以畫面與情境流露，不直接點破其願望或心結，停在夢醒前的餘韻與一絲說不清的悸動。
- **夜襲**（`restAmbushPrompt`，`enemyAmbushOnServant_`觸發時）：
  > ★以 Fate／TYPE-MOON 筆觸描寫酣息被夜襲撕裂的驚變（語氣留白），勝負已由系統結算。
  埋入事實：地點、突襲敵名、是否隱蔽、從者名、受創量、是否被消滅/敗北。
  若團滅（`out.defeat=true`），另呼叫共用 `buildDreamPrompt_(masterName, wish, servantName)` 填 `out.dreamPrompt`（見 §1）。

### `actionScout`（action `scout`）— 2026-07 新增輕量演出
> ★以 Fate／TYPE-MOON 筆觸【精煉 60~100 字】演出這段凝神戒備、探查四周的氣息與觀察（一段即可），${有揭露敵蹤?'流露警覺與一絲山雨欲來的張力':'流露短暫的鬆一口氣或不敢鬆懈的警戒'}；show, don't tell，是否交戰仍由御主下令。
埋入事實：本次偵查是否揭露敵蹤（有→列名單；無→暫無敵蹤）。含 `servantCard_`（有隨行從者時）或 `masterCard_`（無從者時）。

### `actionScavenge`（action `scavenge`）— 2026-07 新增輕量演出
> ★以 Fate／TYPE-MOON 筆觸【精煉 60~100 字】演出這段翻找、感應散逸魔力的搜索過程（一段即可）；（有察覺敵蹤情報→收尾帶出警覺／無→停在暫時平靜的餘韻）；show, don't tell，是否交戰仍由御主下令。
埋入事實：本地魔力是否已被搜刮枯竭、是否順帶察覺敵蹤情報。含 `servantCard_`/`masterCard_`（邏輯同上）。

### `actionPrepMeal`（action `prep_meal`）— 2026-07 新增輕量演出
> ★以 Fate／TYPE-MOON 筆觸【精煉 60~100 字】演出這段戰前用餐、稍事休整的日常小品（一段即可），依從者性格自然流露對這頓飯／這位御主的反應；show, don't tell，語氣輕快不冗長。
埋入事實：整備 buff 時效與命中加成數值。含 `servantCard_`/`masterCard_`（邏輯同上）。

### `enemyAmbushOnServant_`（helper，被 `actionRest`／`actionBond`／`actionAllyBond`／`actionManaSupply` 共用）
本身不直接組「敘事」prompt，只回傳突襲結果物件（供各 caller 自己套入各自的 ambush 分支文案）；團滅時委派 `buildDreamPrompt_` 組 `dreamPrompt`。

### `actionMove`、`actionGetMapNodes`、`actionScout`、`actionScavenge`、`actionSetWorkshop`、`actionClearNpcMajorEvent`、`actionPrepMeal`
純機制／回傳 plain `message` flavor 文字（不是 AI 指令 prompt）。`actionMove` 例外——它不组 prompt，但回傳一整組「素材」（`masterCard`／`servantCard`／`foeCards`／`pursuit`／`preFoes`／`mapDesc`／`people`／`clock`…）供**前端**組 `arrivePrompt`（見 §10）。

---

## 4. 羈絆結盟 Bonds & Alliances — Router_Bond.gs

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `bond` | 羈絆選單「閒聊/共餐/特訓/夜談」→`bond(type)` | `actionBond` | 是（含突襲分支） |
| `propose_alliance` | 敵御主卡「🤝 交涉結盟」 | `actionProposeAlliance` | 是（成功/失敗兩分支） |
| `break_alliance` | 盟友卡「💔 撕毀盟約」 | `actionBreakAlliance` | 是 |
| `ally_bond` | 盟友卡「🤝 與盟友共處」 | `actionAllyBond` | 是（含突襲分支＋羈絆檔位語氣） |

### `actionBond`（action `bond`）
- **突襲**：
  > ★以 Fate／TYPE-MOON 筆觸描寫溫存被突襲撕裂的驚變與兇險，${消滅則語氣留白／未消滅則依性格重情護主或疏離}。傷害與勝負已由系統結算。
- **正常**（`masterCard_`+`servantCard_`）：
  > ★以 Fate／TYPE-MOON 筆觸寫一段【精煉 90~150 字、輕快不冗長】${svName} 與御主${act.frame}的小品。務必貼合上方「演出依據」中的性格、自稱與口吻，演出其獨有神態，點到為止留餘味。
  > ★【show, don't tell】用言行、神態、停頓去流露情感與性格，絕不可直白說出其「願望／個性／萌點」等設定詞；停在含蓄的留白。
  > ★【鐵律】保持溫暖日常或戰友情誼的分寸，不踰矩。

### `actionProposeAlliance`（action `propose_alliance`）
- 成功：
  > ★以 Fate／TYPE-MOON 筆觸【約 120~180 字】演出這場談判：「${masterName}」依其性格回應（務實的權衡、開出條件或冷淡的「暫時」），最後達成不穩固的同盟。對方的算計與保留要演出來，留一絲不信任的伏筆。
- 失敗：
  > ★以 Fate／TYPE-MOON 筆觸【約 100~150 字】演出「${masterName}」依其性格回絕的瞬間（嘲諷、警戒、或「聖杯只能有一個」的冷冽）。氣氛轉為一觸即發，但本回合不開打。

### `actionBreakAlliance`（action `break_alliance`）
> ★以 Fate／TYPE-MOON 筆觸【約 80~130 字】演出背叛/決裂的一瞬間張力。

### `actionAllyBond`（action `ally_bond`）
- 突襲：
  > ★以 Fate／TYPE-MOON 筆觸描寫盟誼的私密一刻被突襲撕裂的驚變…傷害與勝負已由系統結算。
- 正常（含羈絆值/百分及分級描述）：
  > ★Fate 筆觸【90~140字】寫一段此次共處的小品，自由發揮、勿每次都同一套說辭。語氣親疏【務必嚴格】貼合當前羈絆：${tier}。對方仍是「暫時」盟友，留一絲各自的算計與保留。show, don't tell。
  （首度達 90 解鎖鑑賞緣時，額外一句：可用一個眼神或半句未盡之言，含蓄點出情誼悄然越過了「暫時」的界線。）

其餘同檔 helper（`isAllied_`/`allyUntil_`/`setAllyMem_`/`clearAllyMem_`/`allianceWillingness_`/`breakStaleAlliances_`/`bumpBond_`/`getBondUsedToday_`/`stampLostServant_`/`getLostServant_`/`getServantMaster_`/`getMasterServant_`/`markMasterLostServant_`/`logWarEvent_`/`actionWarChronicle`/`actionWarHistoryList`）皆純機制，不叫 AI。

---

## 5. 補魔／出力／魔境等機制設定 Economy & Setters — Router_Economy.gs

除 `actionManaSupply`（見 §2）外，本檔其餘 5 個 handler **全部純機制、不叫 AI**：

| Action | 按鈕 | Handler | AI |
|---|---|---|---|
| `set_servant_output` | 從者卡🔋出力轉盤 | `actionSetServantOutput` | 否 |
| `set_mage_realm` | 技能膠囊 | `actionSetMageRealm` | 否 |
| `set_rune_mode` | 技能膠囊 | `actionSetRuneMode` | 否 |
| `set_np_choice` | 寶具選擇彈窗 | `actionSetNpChoice` | 否 |
| `mana_supply` | 見 §2 | `actionManaSupply` | 是 |

（`actionBloodSupply`／`blood_supply` 已移除，燃血改純被動機制，見 `SOLO_REFERENCE.md` §3。）

---

## 6. 召喚創角 Summon & Creation — Router_Creation.gs

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `check_name` | 創角「啟程」鈕（Script_Onboarding.html:150） | `actionCheckName`（Router_Action.gs） | 否 |
| `create` | 「⚜️ 締結令咒」鈕（Index.html:97 / Onboarding:202） | `actionManualNpc` | **否**（2026-07 改為秒寫入、不叫 AI） |
| `backfill_master_ai` | create 後前端背景呼叫（Onboarding:236） | `actionBackfillMasterAi` | **是**（結構化 JSON，非敘事） |
| `get_heroes` | 召喚頁載入英靈清單（Onboarding:251） | `actionGetHeroes` | 否 |
| `get_masters` | 選正典御主清單（Onboarding:75） | `actionGetMasters` | 否 |
| `summon_servant` | 「✨真名召喚／🎲隨機／🖋️自訂生成」（Index.html:117-119 / Onboarding:280） | `actionSummonServant` | **條件式**：種子英靈否／自訂或名冊查無者是（結構化 JSON）；召喚後一律另組 `summonPrompt` 交 `narrate_only` |

### `actionManualNpc`（action `create`）
確認**不叫 AI**：所有敘事欄（BACK/TRAIT/PREF/INTENT）用玩家輸入種子值或硬編碼預設（如「外貌平凡、舉止從容、自稱「我」、卸下心防的私密一面」）直接寫入，數值/HP/MP/迴路/令咒/模式/起始禮裝由 GAS 算。AI 補完延後到 `backfill_master_ai`。

### `actionBackfillMasterAi`（action `backfill_master_ai`）
非阻塞背景呼叫，只補 4 敘事欄，走 `callGeminiAPI` 拿結構化 JSON（非敘事文字）。系統提示詞關鍵行：
> ★【演出而非說明】願望與身世只作為設定底層，不要在 background 裡直接複述願望字面。
> ★npc_intent：一句【簡短】萌點（可愛反差，≤15字）…
> ★background：限20字，呼應其身世／財力，禁出現具體物品名。
> ★【勿輸出數值】戰力數值、HP/MP 一律由系統裁定，prompt【不要】輸出任何數值欄位；也不要輸出地點。
> ★【輸出】合法 JSON、禁 Markdown：（附 schema）
埋入事實：姓名/性別/外貌/身世財力/願望/魔術體系/出身，缺項一律退回「隨機」。

### `actionSummonServant`（action `summon_servant`）
- **種子英靈分支**（名冊/真名比對命中）：**不叫 AI**，直接套種子庫寫死的 `persona.look/words/moe/back`（省一次 API、加速召喚）。
- **自訂/名冊查無分支**（`custDesc` 或查無比對）：**叫 AI**，走結構化 JSON：
  > ★【六圍 six】依該英靈強弱給…階級用 E,D,C,B,A,EX…務必有強有弱、貼合傳說。
  > ★【技能帶 fx】classSkills(職階技能 1~2 個)＋skills(固有技能 2~3 個)…（附 FX_MENU_ 技能碼字典）
  > ★【特性 traits】1~3 個…(如 王/龍/人類/神性/巨人/猛獸；有神性者會被神殺剋）。
  > ★【演出而非說明】personality 與寶具只作底層，勿直接複述字面。
  > ★np：寶具名＋一句威能簡述。★npc_intent：一句【簡短】反差萌（≤15字）。★sex 從 男／女／異 擇一。
  > ★【輸出】合法 JSON、禁 Markdown：（附 schema）
  成功後 `recordOriginalHero_` 把新原創英靈寫回英靈殿供之後重用（純寫入，非 AI）。
- **🛠️ 工房分支**（`userData.build`·2026-07·優先於上兩分支）：玩家親手定全部數值（職階/六圍預算270/技能3槽/寶具名），**AI 只補人格側寫**（小型結構化 JSON 呼叫）：
  > 你是《命運停駐之夜》的英靈人格編織者。玩家已親手定好一名原創從者的全部數值，你【只】負責演出用人格側寫，【嚴禁】輸出任何數值/階級/技能/寶具設定。★輸出合法 JSON…{"background":"生平一句·限20字","personality":"…四短句頓號分隔","npc_intent":"一句反差萌·限15字"}
  失敗不擋召喚（玩家數值不當 AI 人質，落通用預設）。
- **各分支皆會**再組一份 `summonPrompt`（含 `servantCard_`）走 `narrate_only` 敘事召喚初遇場景：
  > ★以 Fate／TYPE-MOON 筆觸描寫所在地的燈火與氛圍，聚焦御主與從者最初的試探、對話與張力（依上方角色背景內化演出，禁止複述設定字面、禁止用外貌代替名字）。場景留下懸念、讓玩家想以行動回應。
  > ★禁止替御主做決定、禁止詢問玩家想做什麼、禁止介紹玩家自身身份、禁止新增任何地圖或NPC。

其餘同檔 helper（`svNum_`/`getWarMode_`/`getWarName_`/`getPlayedMaster_`/`sanitizeSkills_`/`sanitizeSix_`/`recordOriginalHero_`）純機制，不叫 AI。

---

## 7. 鑑賞慾海 Kanshou & Gallery — Gallery.gs

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `claim_grail` | 勝利畫面「⚜️ 奪得聖杯」 | `actionClaimGrail` | **是**（回憶散文，結構化+散文混合） |
| `enter_kanshou` | 主選單「🌹 進入鑑賞」→`enterKanshou()`（Script_Kanshou.html:150） | `actionEnterKanshou` | 否 |
| `kanshou_companions` | 抽屜「👥 後日談同伴」→`openCompanions()`（Kanshou:16） | `actionKanshouCompanions` | 否 |
| `kanshou_add` | 同伴面板「邀請」→`kanshouAdd(name)`（Kanshou:46） | `actionKanshouAdd` | 否 |
| `kanshou_remove` | 同伴面板「移除」→`kanshouRemove(name)`（Kanshou:52） | `actionKanshouRemove` | 否 |
| `kanshou_set_name` | 「✏改名」→`changeKanshouName()`（Kanshou:64） | `actionKanshouSetName` | 否 |
| `kanshou_set_sex` | 「⚧切換性別」→`changeKanshouSex()`（Kanshou:78） | `actionKanshouSetSex` | 否 |
| `dev_seed_gallery` | 主選單 DEV「🧪 產生測試從者」（Index.html） | `actionDevSeedGallery` | 否（罐頭測試文案） |
| `purge_orphans` | 主選單 DEV「🧹 清殘列」（Index.html） | `actionPurgeOrphans`（其實在 Account.gs） | 否 |
| `dev_resync_codex` | 主選單 DEV「🔄 套用最新平衡」（Index.html） | `actionDevResyncCodex`（Seed 系統） | 否 |

### `actionClaimGrail`（action `claim_grail`）
奪杯寫入「鑑賞」表的回憶散文。系統提示詞：
> ★以溫柔內斂的 Fate／TYPE-MOON 筆觸，第二人稱（你＝御主），寫一段 80～130 字的回憶：濃縮御主與這名從者並肩走過的數日、勝利當下的情緒、以及兩人之間的羈絆。
> ★【鐵律·演出而非說明】嚴禁直接寫出『願望』『萌點』『個性』等字面設定，只能以情景與細節暗示。
> ★只輸出回憶散文本體，禁任何系統字樣、JSON、選項、標籤名。
埋入事實：御主名、從者真名+職階、羈絆深度（bond）、性格參考(pref)、御主願望(若有，明確 gated)、固定結局事實「御主斬盡所有敵對從者，奪得聖杯」。AI 失敗有硬編碼備援回憶字串（優雅降級）。同盟封存（好感≥90或【鑑賞緣】的盟友）另用**純模板字串**（非 AI）產生回憶。

### 其餘 Gallery.gs handler
`actionEnterKanshou`／`actionKanshouCompanions`／`actionKanshouAdd`／`actionKanshouRemove`／`actionKanshouSetSex`／`actionKanshouSetName`／`actionDevSeedGallery` 皆純機制寫表/讀表，不叫 AI（`kanshou_add` 用固定文字「聖杯戰爭並肩奪杯的羈絆」與固定羈絆值 90，非 AI 生成）。之後的 kanshou 內對話走 `actionPlay`（§9），不在這幾個 action 內。

---

## 8. 帳號／系統工具 Account & System-utility

Account.gs 全部函式 **零 AI 呼叫**——單純帳號/存檔/歷史記錄：

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `account_login` | 登入畫面「進　入」（Index:19/Onboarding:15） | `actionAccountLogin` | 否 |
| `account_new_game` | 「🔥 開啟新的聖杯戰爭」（Index:28/Onboarding:38） | `actionAccountNewGame` | 否 |
| `leaderboard` | 「🏆 排行榜」（Index.html） | `actionLeaderboard` | 否，唯讀跨帳號排行 |
| `get_victory_history` | 「📜 勝利歷史」（Index.html） | `actionGetVictoryHistory` | 否，唯讀自己戰績 |

Router_Action.gs 核心 dispatch 相關的雜項 action（都在 Router_Action.gs 本檔內定義，見檔案開頭已讀內容）：

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `check_name` | 「啟程」（Onboarding:154） | `actionCheckName` | 否 |
| `get_full_status` | NPC「📜 命格」鈕 | `actionGetFullStatus` | 否 |
| `update_fate` | 逆天改命存檔 | `actionUpdateFate` | 否，純寫表（4 敘事欄，數值/寶具鎖死） |
| `get_tags` | （現多由 sync 附帶，獨立呼叫見 1143） | `actionGetTags`→`buildTagsPayload_` | 否，左側狀態面板資料 |
| `sync` | 主動刷新 | `actionSync`→`buildClientState_` | 否 |
| `update_rel_tag` | 稱呼編輯「✏️」 | `actionUpdateRelTag` | 否，純寫表 |
| `get_epic_history` | 抽屜「📖 個人史紀」（Index.html） | `actionGetEpicHistory`（Router_Narrative.gs） | 否，唯讀彙整 |
| `war_chronicle` | 抽屜「📜 本場戰記」（Index.html） | `actionWarChronicle`（Router_Bond.gs） | 否，唯讀戰記列表 |
| `war_history_list` | 「📜 戰役回顧」（Index.html） | `actionWarHistoryList`（Router_Bond.gs） | 否，唯讀歷史戰役列表 |

**14 天時限中央攔截**（`handleGameAction` 內，Router_Action.gs:165-178）：非獨立 action，是 dispatcher 對所有會推進時間的動作事後檢查——一旦 `clock` 字串顯示天數 >14 且未 victory/defeat，強制補 `defeat:true` 並呼叫共用 `buildDreamPrompt_(...,'timeout')` 填 `dreamPrompt`（見 §1）。

---

## 9. 自由聊天引擎 `actionPlay`（action `play`）— Gallery.gs

**🔀 2026-07 玩家定案「兩軌完全拆開，鑑賞集中在一個GS」**：`actionPlay` 與 `buildDefaultSystemPrompt`（含 `nsfwBaseRules`）已從 `Router_Narrative.gs`／`Engine_Combat.gs` 搬到 `Gallery.gs`（鑑賞的家，跟召喚/進場/請走/AI深化等其餘鑑賞 action 集中一處），純檔案搬遷、函式內容逐字未動。`Router_Narrative.gs` 從此只剩 solo 的敘事 helper（`actionNarrateOnly`／`narrateWithState_`）；`Engine_Combat.gs` 只剩 solo／鑑賞共用的 `callGeminiAPI` 基礎設施。

**用途**：kanshou（慾海後日談，NSFW）自由文字聊天輸入框，走前端 `send()`（Script.html, `action:"play"`）。**solo 聖杯戰爭主軌完全不用這個**——solo 全走按鈕→`narrate_only`。`actionPlay` 100% 只被鑑賞(`KPC_`)呼叫（函式入口強制擋非 `KPC_` 呼叫）；九州 `full` 模式呼叫路徑已不存在。

與 `narrate_only` 的關鍵差異：`actionPlay` **自己從零組完整 prompt**（不假手 caller），且**直接呼叫 `callGeminiAPI(prompt, null, aiConfig)`**（第二參數系統提示詞傳 `null`——所有指令混在 user prompt 內，不像 `narrate_only` 另有獨立 `miniSystem`）。

組裝的事實類別：
- 同行隊伍成員完整卡（身世/狀態/性格/特徵/萌點/關係與好感，`PROMPT_PARTY_SYSTEM`；solo 另帶六圍/氣血，鑑賞不帶）
- 玩家自身卡、近期歷史（最近 6 筆原始訊息／3輪，`getGameHistoryBatchRaw`，走 `aiConfig.chatHistory` 而非塞進 prompt 字面）
- **🧹 2026-07 玩家定案「砍掉同地路人、開放世界無結界」**：舊版「同地路人」清單（`allLocals`/`displayPeople`）＋其好感階梯行為指令（`resistPrompt`，死仇→摯友七級）＋場景第三方交叉羈絆整套刪除。改為單純的 `backgroundCrowdStr`（★【開放世界·背景人煙】：路人可自由描寫增添生活感，但不具名、不可被指名互動、不追蹤好感）。能被指名、有名有姓、好感被記錄延續的對象，收斂為僅有**目前同行隊伍成員**（`partyRows`/`partyMembers`）。
- **僅 NSFW/kanshou 模式**：同地性別配對提示、肉體狀態 JSON（2026-07 玩家定案「肉體那些欄位不需要了，只要狀態就好」：physical_state 從 6 鍵數字代碼（姿勢與動作/胸部/顏面/肉棒/蜜穴/服裝狀態）全部砍掉，簡化為單一自由文字欄，AI 自行決定每回合要不要提、提多細，不強制逐項列舉，每回合仍需據實反映最新狀態）、每位同行同伴的「身體記憶」技能標籤、敏感點、親密次數計數器、愛稱、🔥主動掌握模式段落（前端 `drive` 旗標開啟時注入——同伴依個性主動掌握節奏、攔下玩家的迴避意圖；僅鑑賞生效）

關鍵結構/收尾指令（逐字節錄）：
> 【敘事法旨】：當前推演視角鎖定為玩家『${pcName}』(ID: ${pcId})。
> ${backgroundCrowdStr}
> ★【視角鎖定】：以上「同行夥伴」卡片內「自稱」只限她/他自己的引號台詞——通篇敘事旁白的「我」永遠、只能是玩家本人…（2026-07 更新：`actionPlay` 的 `isNsfwMode` 分支已全數拿掉——函式入口已擋非 `KPC_` 呼叫，這句話現在是唯一版本、不再有 solo 對應的另一分支，見 `SOLO_REFERENCE.md` §「九州經濟/生活層」）
> ★【在場驗證鐵律——最高優先級，下筆前必看】：本回合可被指名對話、持續互動、且好感/關係會被記錄延續的角色僅限【目前同行隊伍成員】；背景路人可自由描寫增添氣氛，但一律不具名、不可被指名互動、不追蹤好感…
> 💕【鑑賞·後日談模式·最高優先級覆寫】：聖杯戰爭【早已落幕】…★【絕對禁止】任何戰鬥、廝殺、敵人、敵御主、敵從者、聖杯爭奪、靈基受損、血量／生命變化、寶具對轟、死亡或威脅。世界是安全的。…★敘事結束停在溫柔的留白，把下一步交還御主。（**🗑️ 2026-07 清除死碼**：舊版這裡還有一句「非 kanshou」的戰鬥雙向裁決規則，靠 `isKanshou` 三元式切換——查證 `actionPlay` 入口早就強制擋非 `KPC_` 呼叫、且鑑賞唯一建列路徑 `game_id` 永遠是 `"k_"` 開頭，`isKanshou` 在這個函式裡數學上恆為 true，該死分支連同判斷變數已整段刪除，鑑賞覆寫改直接無條件套用）
> 🚨【敘事終極警告】：1. 敘事必須在給出結果後，停在「我」的心境，將下一步交還玩家選擇！2.（`target`/`npc` JSON 欄位只能填真實在場人名，不可含對白/標點）

回應解析欄位（現行 schema）：`inner_monologue`（範本第一位·強制思維鏈，後端不讀自然丟棄，第三人稱總結不可用「我」自稱避免跟 narration 視角打架，2026-07 澄清為「本回合開始前」承接自過往互動的狀態、非「本回合發生後」）／`narration`（2026-07 目標字數約600→約500字）／`location`（AI自主決定地點，不受地圖節點限制）／`options`（4類選項範本）／`intimacy_feedback`（`player`/`npcs`，各含 `physical_state`〔單一自由文字，2026-07再簡化為「只涵蓋顏面神情與衣裝狀態，≤15字」〕／`dynamic_skills`／`mutual_nicknames`〔僅npcs〕／**`attitude`〔僅npcs，2026-07新增〕**：NPC對御主當下的臨場態度，≤15字，跟好感(長期趨勢)分開追蹤，寫入`COL.PC.REL_MEM`的`[態度]`標籤，每回合覆蓋不累積，也是AI表達「認不認同」關係標籤的唯一管道）／`rel_changes`（`target`/`fav_change`。2026-07 這欄位經歷一輪來回：先是AI自己填`fav_change`整數→改成AI只填方向旗標(`tone`/`fav_dir`)、GAS對應固定±2/0→玩家「好感改回數字」定案改回`fav_change`整數，`_note`給級距指引(日常+1~2/心動+3~5，單回合上限+5)，`sanitizeAiData_`(Router_Action.gs)同步復原-100~100的clampInt防呆；**`tag`欄位2026-07玩家定案「關係改玩家決定，AI不可以改動但可以不認」整條移除**——`COL.PC.REL_TAG`從此只能由玩家透過`update_rel_tag`(既有action，這輪才第一次接上前端UI)手動更改，AI不再有任何管道寫入這個欄位，只能靠上面的`attitude`表現認不認同）。**已從 schema 移除的死欄位**：`stat_changes`、`recruited`、`events`、`new_maps`、`mentioned_names`、`log_summary`（原供交談輪數計數，查證累加出的數字從未被任何地方讀回，2026-07 整條移除）、`erogenous_zones`（2026-07 隨「窺視神髓」UI面板一併移除——那是這欄唯一的消費者，面板拿掉後即成死欄，詳見 `SOLO_REFERENCE.md`）、`major_event`（原供「未完成的約定」`[達成]xxx`/`[清空]`特殊語法，2026-07 查證發現寫入後從未被讀回餵給AI、玩家也無任何UI能查看或清空，是頭尾斷開的死路，整條移除，詳見 `SOLO_REFERENCE.md`）、`rel_changes.tag`（見上，2026-07關係改玩家決定後移除）——**solo 完全不經過這個函式**（全走 `narrate_only`）。

（`nsfwBaseRules`／`buildDefaultSystemPrompt` 定義在 `Gallery.gs`——紅線①保護區塊，本文不重複貼出，只標註 `actionPlay` 有引用其機制。函式為無參數 `buildDefaultSystemPrompt()`，永遠回傳慾海版本，因為查證後這個函式現在只可能被鑑賞呼叫。詳見 `SOLO_REFERENCE.md` §0。）

---

## 10. 前端自建 prompt 的特例：`actionMove` 的 `arrivePrompt`

`actionMove`（action `move`）後端**不组 aiPrompt**，只回傳素材：`masterCard`／`servantCard`（`servantCard_`）／`foeCards`（在場敵從者的 `servantCard_` 陣列）／`pursuit`（撤離追擊結果，2026-07 起額外附 `foeCard`＝追兵的 `servantCard_`）／`report`（2026-07 新增·撤離追擊數字戰報卡，供 `renderFateBattleReport` 秒顯，不等 AI）／`factionClash`（2026-07 新增·抵達時撞見的敵對互毆，見下）／`preFoes`／`mapDesc`／`people`／`locations`／`clock`/`ap`。

- **🐛→✅ 2026-07 修「追擊戰報從者沒有描述」**：舊版 `pursuit` 只有 `{enemyName,dmg,hitWho,note}`，前端只把 `note` 塞成一句附註，AI 沒有追兵的性格/口吻素材可演；也沒有像卸防突襲那樣的數字戰報卡，玩家看不到發生了什麼。已比照 `enemyAmbushOnServant_` 的 `foeCard` 模式，在 `actionMove`(`Router_Movement.gs`) 對 `pursuit` 補上 `foeCard: servantCard_(chaserRow)`，並新建 `report`(`pursuit:true` 分支)。前端 `renderFateBattleReport` 新增 `r.pursuit` 分支(取代舊版純文字一行 div)；`arrivePrompt` 多插一段 `【撤離途中的追兵】${data.pursuit.foeCard}`，撤離追擊/反咬的指令句也各自改為「依上方【撤離途中的追兵】的性格演出…」，讓 AI 有真實角色素材可依循。
- **⚔️ 新增「敵對互毆」場景(2026-07 玩家提案)**：玩家反饋「兩組敵對人馬同格站著卻不打架很奇怪」——`actionMove` 抵達判定新增：若抵達地點同時有 ≥2 位不同敵御主(各帶其從者、皆非結盟中)，GAS 用 `resolveFateBattle_` 真實裁決兩位敵從者(取戰敗方傷害的0.4倍，只是「先前已互相消耗」的餘傷、非死鬥全額)扣血，建構 `factionClash:{aMaster,bMaster,loserName,dmg,note}`；`worldRumors` 插一則〔敵對交鋒〕、`arrivePrompt` 多一段「★【撞見敵對互毆】…這不是相安無事同處一地，是你打斷了一場戰鬥」指令，讓 AI 演出雙方戒備停手，而非兩批人相安無事站在原地。GAS 掌傷害裁決、AI 只演出中斷瞬間——符合 `DESIGN.md` 的「GAS掌數值、AI只說書」鐵則。

前端 `travelTo()`（Script.html:735-803）**自己拼出** `arrivePrompt`：
```
(masterCard) + (servantCard) + (foeCards) + [若有撤離追擊] 【撤離途中的追兵】(pursuit.foeCard)
+ 【抵達場景】御主『${pc.name}』…剛抵達冬木的「${targetName}」，時值${timeStr}。
+ 此地氛圍：${locDesc}\n敵情：${foeStr}。
+ [若有撤離追擊] ★【撤離追擊】/★【撤離反咬】…(依上方追兵性格演出)
+ [若多組敵對] ★【在場敵對歸屬·勿張冠李戴】…
+ [若撞見敵對互毆] ★【撞見敵對互毆】…GAS已裁決傷害，AI只演出中斷瞬間…
+ [若有前情] 【前情·僅供承接劇情連貫，勿原樣複述】方才之事：${lastAiContext.slice(0,280)}…
+ ★以 Fate／TYPE-MOON 筆觸描寫兩人抵達此地的所見所感、環境細節與當下氛圍。若有敵蹤，營造一觸即發的對峙張力（但是否交戰、勝負留待御主下令，禁止自行開打或分勝負）；若無敵蹤，寫一段巡查、警戒或短暫喘息的氛圍…
+ ★各地、各從者依此地氛圍與【角色卡性格＋前情因果】自然發揮，各有其調；忌千篇一律的套語與雷同結構…
+ [依偶遇/找上門分流] ★【找上門】/★【偶遇】…讓敵方依其個性與立場（是否同盟）開口、有反應，別當沉默佈景；是否動手由御主下令。
+ [若敵御主喪失從者] ★敵御主『${f.name}』已痛失從者…讓其神情與心境流露這份失恃…
+ [若有從者隨行] ★從者「${pc.servant}」隨行在側，依其個性開口、有反應（至少一句台詞）…
+ [無敵蹤時] stanceLine_()（接敵姿態獨行定調）
+ ★御主（我）可依其性格自然開口、有反應與台詞，別當沉默的旁觀者；但【不可】替御主拍板下一步戰略行動…不可逼問玩家，停在決策前的留白讓玩家以按鍵回應。
```
組完後呼叫 `await narrate(arrivePrompt)` → `action:'narrate_only'`。這是全專案唯一一個「prompt 組裝發生在前端 JS、而非後端 GAS」的案例，值得特別注意（其餘全部在 Router_*.gs 內組好字串才回傳）。

---

## 附：純機制、完全不叫 AI 的 action 總表（快速核對用）

`check_name`、`get_full_status`、`update_fate`、`get_tags`、`sync`、`update_rel_tag`、`create`、`get_heroes`、`get_masters`、`get_map_nodes`、`set_servant_output`、`set_mage_realm`、`set_rune_mode`、`set_np_choice`、`account_login`、`account_new_game`、`get_victory_history`、`leaderboard`、`war_chronicle`、`war_history_list`、`get_epic_history`、`purge_orphans`、`dev_seed_gallery`、`dev_resync_codex`、`enter_kanshou`、`kanshou_companions`、`kanshou_add`、`kanshou_remove`、`kanshou_set_name`、`kanshou_set_sex`。

（`set_servant_output`／`set_mage_realm`／`set_rune_mode`／`set_np_choice` 這 4 個是戰鬥前的**純數值檔位切換**——性質等同選單勾選，不是敘事時刻，刻意不接 AI：接了反而每次調檔位都要多等一次生成、拖慢戰鬥節奏，也沒有畫面可演。)

會叫 AI（敘事 `narrate_only` 或結構化 JSON）的 action／路徑：`fate_battle`（5 分支）、`use_seal`、`mana_supply`、`rule_break_steal`、`second_wind`、`rest`（條件式）、`move`（前端組 prompt）、`bond`、`propose_alliance`、`break_alliance`、`ally_bond`、`scout`、`scavenge`、`set_workshop`、`prep_meal`（**2026-07 新增這 4 個**，見 §3——玩家反映「solo每個按鍵好像有些沒有接上ai敘述」逐一稽核補齊，皆為 60~100 字輕量演出，不拖慢節奏）、`backfill_master_ai`（結構化）、`summon_servant`（條件式結構化＋一律附敘事）、`claim_grail`（結構化回憶）、`play`（kanshou/full 自由聊天）、`narrate_only`（通用出口，本身無事實，套系統提示詞轉呼叫）。dispatcher 層另有一條隱性路徑：14 天時限中央攔截自動掛 `dreamPrompt`。

---

*本文件由程式碼直接逐一核對（非憑印象），對照時間點：2026-07。若之後改了對應 handler 的 prompt 組裝方式，記得回來更新本表——尤其 `actionFateBattle`／`actionPlay` 這兩個 prompt 最複雜也最常改的地方。*
