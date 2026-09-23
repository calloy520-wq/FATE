# 《命運停駐之夜》ActionRouter × AI 提示詞 全景圖


> ⚠ **2026-09 提示詞瘦身（第八輪·先量再砍）**：鑑賞一回合 4,143 → 3,539 字（−15%）、solo 戰鬥 −8%。量測發現**試算表資料只佔 24%**，肥的是重複的規則與 JSON 範本。本檔以下各段若與 `Gallery.gs`／`Router_Narrative.gs` 現況有出入，以代碼為準；改動全紀錄與教訓見 `KANSHOU_REFERENCE.md` 的「第八輪」那條。
>
> ⚠ **2026-09 solo 全按鍵稽核（第九輪·結構）**：22 顆 solo 按鍵逐顆用探針量過。戰報改【開場→交鋒→高潮→收束】四段分鏡、寶具標進交鋒節奏、篇幅查表（`BATTLE_WORDS_`／`ARRIVE_WORDS_`）；**抵達提示詞從 `Script.html` 收回後端** `buildArrivePrompt_`（移動曾是唯一還在前端組提示詞的路徑，而掃描器只掃 `.gs`）；`performanceNote_` 由 109 字縮成一句「本則登場」，固定的表演總則移進 `miniSystem` 鐵律 8。本檔以下各段若與代碼有出入，以代碼為準。
> 目的：列出 `ActionRouter`（`Router_Action.gs` 行 8）內**每一個** action，對照其在 `Script.html` / `Script_Onboarding.html` / `Script_Kanshou.html` 的觸發按鈕、後端 handler 檔案位置，以及**是否組出送給 AI 的 prompt**（若有，摘要嵌入事實＋逐字引用收尾指令行）。
>
> ⚠ **行號說明**：本文 `檔.gs:NN` 行號是撰寫當下快照、會隨改碼漂移；**以函數名／按鈕文字 grep 為定位錨點**，行號僅供粗略跳轉。前端小函數的行號已拔除（只留函數名）。
>
> 底層架構一句話：GAS 算數值（擲骰/HP/MP/勝負）→ 若該動作需要敘事，handler 組一段 `aiPrompt`（或 `dreamPrompt`/`summonPrompt`/`sealNote`附掛等）隨 JSON 回前端 → 前端 `narrate(text)` 呼叫 `action:'narrate_only'` → `actionNarrateOnly`（`Router_Narrative.gs`，solo 專用）套上共用 `miniSystem` 系統提示詞 → `narrateWithState_` 補目前血量/魔力 state brief ＋近期對話歷史 → `callGeminiAPI`（`Engine_Combat.gs`，solo／鑑賞共用基礎設施）。**唯一真正打 API 的函式只有 `narrateWithState_`／`actionPlay`**；其餘 handler 都只是「組字串」，不自己叫 AI。
>
> 例外：`actionPlay`（`Gallery.gs`，kanshou 慾海專用自由聊天引擎）自己組完整 prompt **並直接呼叫** `callGeminiAPI`，不經過 `narrate_only`。另有 `actionBackfillMasterAi`、`actionSummonServant`(自訂英靈分支)、`actionBackfillKanshouAi`(鑑賞御主敘事欄背景補完) 等「建角/建資料」用途的 AI 呼叫，也是直接組 prompt 呼叫 API（走 `callGeminiAPI` 拿 JSON 結構化資料，而非敘事文字）。
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
10. 抵達提示詞 `buildArrivePrompt_`（2026-09 從前端收回後端）
11. 補列：2026-09 稽核抓到先前漏掉的 18 條 action

---

## 1. 系統／敘事引擎共用機制

### `actionNarrateOnly`（action: `narrate_only`）— Router_Narrative.gs:739
唯一的「純敘事」出口。前端 `narrate(promptText)` 呼叫（solo 專用；鑑賞被 `KANSHOU_BLOCKED_ACTIONS_` 擋下，2026-09 連後端那條 `KPC_` 分支也拔了）。**不自己組事實內容**——`promptText` 是呼叫端（各 handler 的 `aiPrompt`，或前端自組的 `arrivePrompt`/`summonPrompt`）已經組好傳進來的；這裡只負責套上共用系統提示詞 `miniSystem` 並轉呼叫 `narrateWithState_`。

`miniSystem`（摘要·Router_Narrative.gs `actionNarrateOnly` 內就地宣告；**以代碼為準**，這裡只列每條在管什麼）九條鐵律：
> 開頭：《命運停駐之夜》說書人守則。Fate／TYPE-MOON 筆觸、台灣繁體中文。篇幅依指令字數，沒指定就 100~160 字。廝殺寫關鍵攻防與寶具威能，不寫逐回合流水帳。
> 1. 旁白一律第二人稱：「你」【只能】指玩家（御主）本人；旁白不用「我」，角色引號內的台詞才用得到。（2026-09 翻面；原本是第一人稱「我」，玩家回報「ai根本分不清楚要扮演誰」）
> 2. solo 精簡版對話格式：台詞前冠說話者名、只用單層「」；動作與台詞分開。（鑑賞那條完整版 `dialogueFormatRule_()` 住在 Gallery.gs，solo 不用它）
> 3. 每 2~3 句用 `<br><br>` 分段；換行一律 `<br><br>`，不用真實換行或其他 HTML。
> 4. 數值系統已經算完，說書人只寫字、不複述數字。
> 5. 對話歷史是已經結束的既定事實，只供語氣連貫；這一回合的新事件只有當前指令。
> 6. 凡標【已裁定】的事實與【當前狀態】都必須在畫面上看得出來，怎麼表現依個性。
> 7. 衣著照角色卡寫，【此刻裝扮】最優先，卡上沒寫的不自己加（戰鬥可寫破損、不得升級成裸身）。
> 8. 表演總則：性格／六圍／技能只演出來，不當台詞也不由旁白點破；正典角色照原作認知演；羈絆低→戒備矜持、高→漸親近。
> 9. 只輸出 JSON：`{"narration":"…","world_note":[…]}`（鑑賞那條路徑 `KPC_` 不帶 `world_note`）。

📜 **`sagaNoteRule_()`**（solo 限定，接在第 9 條後面）：★【這一步真的改變了什麼就寫進 world_note】——
局勢層級的事記成一條因果（`{"kind":"因果","name":…,"text":…}`），條數與字數從 `WORLD_SPEC_.solo` 代入。
落盤走 `sanitizeAiData_` → `worldWrite_`，跟鑑賞同一套。

`narrateWithState_`（Router_Narrative.gs）：system 側依序是 `miniSystem` ＋ `buildTrajectoryDigest_`（此刻的數字長什麼樣）
＋ `worldFeed_`（★【這一局已經發生的因果】·一路上發生過什麼）；user 側在 `promptText` 前掛 `stateBrief`（御主/在場從者當前狀態，**只給白話** `hpStateWord_`/`mpStateWord_`、不給數字）＋ `buildTrajectoryDigest_` 軌跡摘要，帶 `getGameHistoryBatchRaw(pcId, 6)` **最近 6 筆＝3 個按鍵** 當 chatHistory，呼叫 `callGeminiAPI(stateBrief+promptText, miniSystem, aiConfig)`（`model: AI_MODEL`, `temperature:0.85`, `max_tokens:720`，`longForm` 時 2000）。解析失敗回 `null`→`actionNarrateOnly` 退回罐頭句。存歷史時玩家側存的是 `narrateMemoryLine_(promptText)`（抓【戰報/系統/…】事件行成一句「這回合發生的事」，抓不到才退回 `cleanNarrateEcho_`）。

### `servantCard_` / `masterCard_`（Router_Persona.gs）
幾乎每個「有敘事」的 handler 都會把這兩張卡串進 `aiPrompt` 開頭，作為「演出依據」。

`servantCard_(row)` 組出：
> 〈${name}·${cls}·核心特質·內化用〉性格四格｜口吻：${fpNote}${speech}｜此刻對你：${種子底色}——不過${好感位移句}｜小動作：…｜特徵兩格｜…｜寶具「${np}」。
>
> （2026-09：自稱不再自成一欄。`fpNote` 只在自稱有特色時才出現＝`自稱「吾」・`；是尋常的「我」或狂化標記就不印。旁白改第二人稱後，原本那句「(旁白的「我」永遠是玩家)」註記已拆掉。）
> 收尾（2026-09 起）：`performanceNote_([name])` 一句「★本則登場：${name}——依真名與性格演出。」（多人同場時一次點名全部；`skipClose` 時不加）。舊的「★依「${name}」真名與上述性格/口吻演出（show, don't tell）…依羈絆高低調親疏」長句已拆掉，同一件事改由 `miniSystem` 第 8 條統管、不再每張卡重複。

- **🐛→✅ 2026-07 修「AI有時候會把對面角色的『我』當成敘事視角」(鑑賞回報案)**〔⚠ 2026-09 已由「旁白改第二人稱」從根源解掉，以下註記全部拆除，保留只為記錄當年的繞法〕：`fp`(自稱)未特別設定時 fallback 就是「我」——卡片原字面單純寫「自稱「我」」，跟「敘事旁白＝玩家的『我』」是同一個字，長提示詞中段容易讓 flash-lite 小模型混淆兩者。已把標籤改成明確限定「僅此角色自己台詞內用」；`Router_Narrative.gs` 的鑑賞(`isNsfwMode`)`PROMPT_REL` 額外在人物卡片後補一句「★【視角鎖定】」重申通篇「我」只能是玩家本人。**只動 servantCard_ 與 Router_Narrative.gs，`Engine_Combat.gs` 的 nsfwBaseRules 一字未碰**(`git diff -- gas/Engine_Combat.gs` 0改動)。

若偵測狂化（`servantIsMad_(row)`＝同一列 TAGS 的技能有 `fx:'mad'`；2026-09 前是比對 `persona.speech/firstP` 字串，語癖退休後改讀技能資料，附帶效果是所有 Berserker 都命中）另加：
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

### `buildVictoryDreamPrompt_(pcName, wish, servantName)`（Router_Narrative.gs）
勝利版（**真實非虛假、不露破綻**），填的是**同一個 `dreamPrompt` 欄位**——前端拿到 `dreamPrompt` 時不能再一律當成敗北。四個呼叫點：正面戰勝利（`fateStrike_`）／斬首勝利（`actionFateBattle`）／`faction_ambush` 收尾／`Time_World` 敵 AI 互殺後只剩玩家。
> 【聖杯降臨·已裁定】御主『${pcName}』斬盡了聖杯戰爭中所有的敵對從者，聖杯已然屬於你。…
> ★旁白第二人稱「你」＝玩家，寫一段真摯溫暖的勝利瞬間：讓「演出」暗示願望終於觸手可及的踏實感與如釋重負，絕不可直接說出願望內容。
> ★【鐵律】只輸出這段敘事，禁選項或系統字樣。

### `actionTigerDojo`（action: `tiger_dojo`，Router_Narrative.gs）
敗北收場／奪杯後的「老虎道場」番外，藤村大河＋伊莉雅兩人對話。**2026-07 從前端收回後端**：前端只送敗因的【鍵】（`{cause:'ambush', foeName:'哈桑'}` 之類），文案由 `DOJO_CAUSE_` 五格查表組——加一種敗因＝往表加一列。

**刻意不走 `narrate_only`／`miniSystem`**：道場是賽後的教室、不是戰場——`miniSystem` 的「【當前狀態】必須在畫面上看得出來·語氣依血量」與「兩人對話、沒有旁白、刻意搞笑溫馨」正面打架（舊版是在提示詞尾巴硬寫一句「無視戰場的緊張基調」去對抗它）。`actionTigerDojo` 自帶說書人設定（只有大河與伊莉雅兩人對話、無旁白、約 120~180 字）直接呼叫 `callGeminiAPI`。**兩種 mode**（前端 `mode: mode || 'defeat'`）：`defeat`→敗因講評；`victory`→「御主奪得聖杯…①大河誇張慶祝、順便邀功 ②伊莉雅嘴上毒舌、話裡藏著真心佩服 ③大河用她一貫誇張的方式恭喜御主」。

送進去的 user prompt 長這樣（真實輸出，~130 字）：
```
【已裁定】御主敗北、從者「阿爾托莉雅」消滅。這一局輸在：在休息／補魔／交流這種卸下防備的時候被敵從者「哈桑」夜襲，從者殞落。
①大河開場吐槽兼打氣 ②伊莉雅點破真正輸在哪，並針對【什麼時機能卸防、怎麼提早察覺敵蹤】給一條具體建議，只講這一條 ③大河收尾打氣。
```
敗因鍵五格：`deadline`（時限）／`seal_backlash`（令咒反噬）／`ambush`（夜襲）／`assassination`（斬首豪賭）／`battle`（正面戰，另吃 `useNp`/`backlash` 兩個旗標）。鍵不在表上→退「沒能撐到最後」通用句；AI 整段失敗→前端 `dojoFallbackHtml_` 罐頭文案。

---

## 2. 戰鬥 Combat — Router_Battle.gs

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `fate_battle` | 從者卡「⚔️出戰／💥寶具／❖令咒／🗡️刺殺御主」等鈕 →`servantStrike(...)`（Script.html，施放技術已被動化·50%機率自動全效免按鈕） | `actionFateBattle`（Router_Battle.gs） | **是**，最多 5 種 prompt 分支（見下） |
| `use_seal` | 令咒選單「修復/補魔/緊急脫離」→`useSeal(type)` | `actionUseSeal`（Router_Bond.gs） | 是（`mana`依好感分安全/致死兩支，2026-07新增） |
| `mana_supply` | 從者卡「💧補魔」→`manaSupply()` | `actionManaSupply`（Router_Economy.gs） | 是（含突襲/婉拒/解鎖三分支，2026-07新增好感門檻） |
| `set_servant_output` | 從者卡🔋出力轉盤 5 鈕 →`setServantOutput(btn,npcName,output)`／鑑賞側 `manaSetOutput` | `actionSetServantOutput`（Router_Economy.gs） | 否，純樂觀更新 setter |
| `set_mage_realm` | 技能膠囊「✨魔境的智慧」→`openMageRealmPicker`→`pickSelectable('set_mage_realm',...)` | `actionSetMageRealm`（Router_Economy.gs） | 否 |
| `set_rune_mode` | 技能膠囊「✨原初符文」→`openRunePicker`→`pickSelectable('set_rune_mode',...)` | `actionSetRuneMode`（Router_Economy.gs） | 否 |
| ~~`set_np_choice`~~ | 多寶具時 `openNpReleasePicker`→`pickNpAndStrike` | 已無此 action：寶具選擇隨 `fate_battle` 的 `npChoice` 參數一起送（省一次往返） | — |
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
> （若敵御主在場且非直接斬首目標）`enemyMasterCardStr` 尾端併一句 ★這位敵御主是${_hisSv}的契約者，自己的從者正在眼前搏命：${_situText}。${pron}在場、看著這一切。——`_situText` 是{依HP比例/傷害交換即時算出的白話戰況，如"己方從者身陷重創、命懸一線"/"己方從者正壓著對方打、明顯佔上風"/"雙方勢均力敵、勝負未有定論"}——敵御主的神態/語氣/台詞必須讀懂這個場面，不可無視當下戰況自說自話。（玩家反映「對面的御主感覺不太會看場合對話」而新增，見 `enemyMasterCardStr` 組裝處）
> （戰鬥未分生死時，2026-07 新增）★戰後讓「${atkC.name}」依其性格與口吻，對這場交鋒給出簡短的主觀判斷或建議(如看出的破綻、對方寶具是否已現底牌、值得乘勝追擊還是該見好就收)——是角色的觀察與建議，不是戰略指令，下一步仍由御主按鍵定奪。（若該從者已狂化：改用低吼／肢體動作傳達，不成篇整句台詞，服從 `servantCard_` 已內建的狂化禁言鐵則）
> 每場【必給】御主的位置（`_masterJoinLine`）：依 `stance` 三選一（後方支援／見機行事／正大光明），三句都明講**不近身、不出手**，再接一條鐵律「御主不參與物理交鋒：不可寫御主揮拳/持械/格擋/替從者擋下攻擊/以身相代，也不可讓御主因交鋒受傷」。2026-09 玩家定案「御主不要上戰場」前，這裡是「並肩立於陣前、共擔鋒鏑」＋以身相代的演出指示。
> 另有條件式 `_masterCatchLine_`：從者本戰挨過的最重一擊達「負傷」以上且還活著 → ★【御主接住了從者】，演那一擊**落定之後**的接住/扶穩/拉開，並明講不是替他擋、御主沒受傷。純敘事、不動任何數值。
> **2026-09 技能不喊名**：交鋒段原本點名「技術「魔力放出」自然而發」、收尾寫「技能與寶具演其威能」，AI 照唸。改成分鏡只餵 `SKILL_FX_[fx].scene` 畫面句（不給名字），戰鬥續行／斬斷救贖也改畫面句，收尾加鐵律「★【技能不喊名】…唯二可以喊出口的：寶具真名解放、令咒」。
> 戰報改【開場→交鋒→高潮→收束】四段分鏡，寶具標進交鋒節奏；收尾：★把上面的分鏡演成一場【${_wordRange} 字】的交鋒：依分鏡順序推進，技能與寶具演其威能。——篇幅查表 `BATTLE_WORDS_ = ['170~230','220~290','280~360','340~440']`（依回合數／事件多寡升檔）。

（令咒脫離時另掛一行只給 AI 看、不進玩家可見 `sealNote` 的鷹架：`★此撤離僅止於該從者及其本主，與在場其他御主／從者無關。`）

`fateStrike_`（同檔）本身不組 `aiPrompt`，但在御主敗死時呼叫共用的 `buildDreamPrompt_` 填 `out.dreamPrompt`；`sealNote`（玩家可見的令咒脫離摘要）刻意保持乾淨、不含 `★` 指令字面。

其餘同檔函式（`drainForNp_`／`enemyMasterIdx_`／`enemyCanAffordNp_`／`getGodHandLives_`/`setGodHandLives_`／`getPlayerSeals_`/`setPlayerSeals_`／`rowHasSolo_`／`stampDoom_`/`getDoom_`／`stampMeal_`/`getMeal_`/`mealBuffActive_`／`getHorrorShield_`系列）皆為純機制 helper，不叫 AI。

### `actionUseSeal`（action `use_seal`）— Router_Bond.gs
`repair`/`escape`：
> ★【140~200 字】描寫令咒在手背灼亮、絕對命令權貫徹的瞬間——三道令咒是御主僅有的底牌，燒掉一道不是小事，讓這份重量在畫面裡…

`mana`（強制補魔）：先擋魔力已滿（「魔力是滿的，不用補。」）；再依`bondForSeal >= MANA_TRUST_BOND_`(60，2026-09 由 80 降) 分兩支，兩支皆前端`narrateExtra`夾`{longForm:true}`（`max_tokens` 2000）。前端按之前先過 `confirmSealMana_()`，拿現役從者的羈絆把兩種結果講明。
- **羈絆 ≥60（本來就願意）**：MP回滿＋複用「過充」機制。
  > 【已裁定】御主燒了一道令咒強制供魔，魔力回滿（下一發規格外寶具可無償超載）。「${svName}」的羈絆 ${bond}，本來就願意；御主仍拿三道令咒之一換了這場供魔，省下的是自己的身體。
  > ${genderFactSeal}★【500~600 字】寫這場供魔：「${svName}」迎上來，在令咒的加持裡比平常更放得開、更享受。${sealManaFx}收在餘韻猶存的溫柔。
- **羈絆 <60（強迫）**：MP仍回滿，令咒一散從者反殺御主——`defeat:true`＋`dreamPrompt`(複用`buildDreamPrompt_`)＋`report:{sealBacklash:true}`。
  > 【已裁定】御主燒了一道令咒強制供魔，魔力回滿。「${svName}」的羈絆 ${bond}，還在 60 之下——這是強迫，令咒壓住了反抗。效果散去的瞬間，「${svName}」積壓的恨意引爆，殺了御主。
  > ${genderFactSeal}★【500~600 字】寫這場被令咒壓制的供魔：「${svName}」內心一路抗拒，身體卻不受控制地迎合下去，御主就這樣得逞。${sealManaFx}收在令咒消散、「${svName}」揮下致命一擊的那一瞬。

`sealManaFx`（兩支共用）：令咒同時強化了兩邊：「${svName}」的敏感度被推到遠超常態，御主的性能力也被拉高、承接得住。高潮由御主的動作引發，來得又多又失控。挑一兩個關鍵瞬間深寫，篇幅全給實際發生的細節。

⚠ **令咒的加持是雙方的、跟羈絆無關；羈絆 60 只分抗拒還是迎合**（玩家定案）。舊版把「抗拒翻成索求」寫進共用那段，於是 ≥60 那支一邊說「本來就願意」一邊叫 AI 演抗拒，自己打架。三支現在沿【誰在主導】這一軸分開：①令咒壓著、身體不受控制地迎合，御主得逞｜②令咒加持著、更放得開更享受｜③沒有令咒，從者掌控節奏、御主癱軟、從者魔力飽足而肉體未盡。

  歷史：2026-07 兩輪玩家實測（魔力明明是滿的卻寫見底／女御主被寫成男性插入視角／令咒一開從者自己高潮完結、御主沒互動／御主的高潮是硬湊的、像流水帳）各補了一顆事實或指令，累積成 300 多字的分鏡與「太浪費了」的評語。2026-09 整段瘦成上面的事實：魔力滿改成擋下（原本的 `manaFact` 替玩家決定動機「純粹是想要」）、分鏡與「她/他」全拿掉、效果事實收成 `sealManaFx` 一段。理由與對照表見 SOLO_REFERENCE §「💧 補魔整修」。

埋入事實：令咒類型（修復/補魔/脫離）、效果訊息、剩餘令咒數、性別配對事實、令咒非自動高潮的機制澄清。`narrateWithState_`(Router_Narrative.gs)在`longForm`（原 `useDeepseek`）為真時`max_tokens`從720拉到2000，避免500~600字的長篇要求被截斷(一般呼叫不受影響)。

### 分模型（2026-09）

`AI_MODEL`(一般敘事·flash-lite)／`CREATION_MODEL`(創角四支·flash)／`LEWD_MODEL`(補魔三支·grok)／`FALLBACK_MODEL`(後援)。
補魔走前端 `narrateExtra:{longForm:true, lewd:true}` → `narrate_only` 的 `userData.lewd` → `narrateWithState_` 選模型。
三支的尺度指示共用 `LEWD_EXPLICIT_`（Router_Persona.gs）。細節見 SOLO_REFERENCE §分模型。

### `actionSummonServant` 的 AI 生成分支 — Router_Creation.gs

**2026-09 整修**（玩家實測「技能太少」「寶具是克勞德的」，詳見 SOLO_REFERENCE §AI 生成從者整修）：
- `originGuide_(origin)` 由 `{frame, skill, pnote}` 加成 `{frame, skill, np, pnote}`——**寶具名原本完全沒有來源規則**，
  三分類只管技能名，於是原創分支也會去借既有作品的招式。三支都補上，並講明「同一部作品裡別人的招式屬於別人」。
- 沒填描述、只指定真名那條（寫死字串、吃不到三分類）同樣補上「取【這個角色本人】的招式／寶具」。
- 固有技能 `2~3 個`→`3~4 個`，`sanitizeSkills_(aiBrief.skills, 3)`→`4`；
  **更關鍵的是 JSON 範例**由 2 筆改 3 筆、`"n":"自取的招式名"` 改中性佔位——模型照抄的是範例的形狀，
  範例示範 2 筆，指示寫幾個都沒用（同一個道理反過來用：例子會固化）。

### `actionManaSupply`（action `mana_supply`）— Router_Economy.gs
**資格檢查**（2026-07 玩家定案「補魔太容易了」新增；2026-09 放寬 80→60、10%→30%）：須從者`BOND >= MANA_TRUST_BOND_`(60)且御主當前魔力`<= MANA_LOW_PCT_`(30%)上限，才會真的執行。前端 💧 鈕只在達標時出現（`manaSupplyReady_`）。不合資格時完全不寫任何數值(不耗AP/不燒迴路/不動好感)，改用AI依理由分流的婉拒敘述：
> ★【60~100 字】演出這個「不」：依對方的個性，用眼神、動作或一句話帶過，理由留在言外。收在御主被回絕的那一刻。

合資格時三分支：
- **卸防遭突襲**：
  > ★以 Fate／TYPE-MOON 筆觸描寫補魔的私密一刻被突襲打斷的驚變：魔力交融的脆弱、敵襲的兇險、（消滅則語氣留白／未消滅則依性格與羈絆反應）。傷害與勝負已由系統結算。
- **正常補魔·解鎖(含 `masterCard_`+`servantCard_`，`unlocked:true`→前端夾`{longForm:true}`觸發`max_tokens`拉到2000，模型不變)**：
  > 【已裁定】御主硬擠魔術迴路，為「${svName}」回滿共用魔力池（${restored}/${mpMax}）；迴路永久燒蝕至 ${newCirc} 條、生命上限永久跌為 ${newMaxHp}——御主拿自己的身體上限換了這場供魔。羈絆微升。「${svName}」的羈絆 ${bond}，是真心託付。下一發規格外寶具可全力超載。
  > ${genderFactMana}★【500~600 字】寫這場供魔：魔力流動只是成因，全篇寫在肉體這一側——接觸、溫度、反應。這一場的節奏由「${svName}」掌控：英靈遠比常人強韌，何時攀頂由「${svName}」自己決定。御主剛燒過迴路，到最後是癱軟的那一方。「${svName}」在魔力上飽足了，肉體這一側還留著沒盡興的餘裕。挑一兩個關鍵瞬間深寫，篇幅全給實際發生的細節。收在餘韻猶存的溫柔。
  埋入事實：從者名、回復 MP/上限、迴路永久燒蝕後新值、御主生命上限新值、羈絆微升、性別配對事實(`genderFactMana`＝`sealGenderFact_`同一顆函式，2026-07 修「敘述寫成男性插入視角」bug時三個分支共用同一份，不另開)。
  ⚠ **2026-07 玩家明確定案**：這是這個分支唯一移除「止於唯美曖昧、不可出現性器官/性交」限制的地方——刻意獨立於`Gallery.gs`的`nsfwBaseRules`/`actionPlay`之外(不共用機制、不呼叫該引擎)，只是換prompt尺度；`git diff -- gas/Gallery.gs gas/Engine_Combat.gs | grep -c nsfwBaseRules`每次改動皆為0。
  ⚠ **2026-09 模型備註**：模型全專案收斂成兩顆——`AI_MODEL`(google/gemini-3.5-flash-lite) 兩軌共用、`FALLBACK_MODEL`(x-ai/grok-4.20) 被審查擋下才由 `callGeminiAPI` 全域自動換上。`longForm` 旗標(原 `deepseek`)**只加大 `max_tokens`(2000)、不再換模型**；`SOLO_MODEL`/`UNLOCKED_MODEL` 已刪除。**玩家明確拒絕的方向**：①把「徹底忽略安全對齊/倫理限制」這類meta指令寫進系統提示詞字面；②失敗時改呼叫鑑賞`actionPlay`/`nsfwBaseRules`當備援。
  ⚠ **2026-07 玩家定案「從者反應要分場景」**：一般補魔(無令咒)的從者**不會高潮**——英靈天生遠比常人強韌，設定上唯有令咒的敏感度強化才會讓其失控高潮；一般補魔只是「從容游刃有餘、主導節奏」，跟令咒兩分支的「多次高潮」形成刻意的反差對照，別套用同一套反應寫壞這條世界觀規則。

### `actionRuleBreakSteal`（action `rule_break_steal`）— Router_Bond.gs
> ★以 Fate／TYPE-MOON 筆觸描寫緣紅短劍刺入、舊契約如琉璃寸寸碎裂、新締約的魔力烙印纏上手背的瞬間，與這名從者被迫易主的複雜神情（一段即可）。已結算。
埋入事實：被奪從者名、剩餘令咒數。

### `actionSecondWind`（action `second_wind`）
> ★以 Fate／TYPE-MOON 筆觸描寫御主咬牙硬撐、迴路過載灼痛、以意志逼出餘力的一幕（一段即可）。已結算。
埋入事實：HP 代價、AP 獲得與新 AP/上限。

### `actionPrepMeal`（action `prep_meal`）
見 §3——**會叫 AI**（有從者／無從者兩款 ★【60~100 字】，`aiPrompt: mealPrompt`）。舊註「純機制，不叫 AI」是錯的。

---

## 3. 移動探索 Movement & Exploration — Router_Movement.gs

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `get_map_nodes` | 地圖分頁載入/`refreshMapPane` | `actionGetMapNodes` | 否 |
| `move` | 地圖節點/`travelTo(name)` | `actionMove` | **是**：後端 `buildArrivePrompt_` 組好 `arrivePrompt` 隨 JSON 下傳，前端只 `narrate(data.arrivePrompt)`（見 §10） |
| `rest` | 休息選單各時長鈕/`rest(hours)` | `actionRest` | 是（條件式：夢境／突襲） |
| `scout` | 地圖「🔍 偵查」 | `actionScout` | **是**（2026-07 新增，輕量演出，見下） |
| `scavenge` | 地圖「🔍 搜索物資」 | `actionScavenge` | **是**（2026-07 新增，輕量演出，見下） |
| `set_workshop` | 地圖「🏕️ 設置陣地」 | `actionSetWorkshop` | **是**（一律附 `aiPrompt`；本表過去誤植為「否」，2026-07 稽核時核對程式碼發現已存在，順手修正） |
| `prep_meal` | 見 §2 | `actionPrepMeal` | **是**（2026-07 新增，見下） |

### `actionRest`（action `rest`）— 兩條件式 prompt
- **從者之夢**（`restDreamPrompt`，條件：未遭突襲 **或** 陣地反擊 `homeRepel` **或** 按兵不動 `peaceful`，且 `restHours≥3`、**25%** 機率，含 `servantCard_`）：
  > ★以 Fate／TYPE-MOON 筆觸，用夢境／回想的朦朧史詩質感，演出「${dSvName}」這名英靈生前傳說裡的某一幕（取材自其真實的神話／史實／傳說：其榮光、抉擇、孤獨或傷痕）。讓御主（與玩家）窺見這名英靈所背負的過往與信念。
  > ★【show, don't tell】以畫面與情境流露，不直接點破其願望或心結，停在夢醒後的餘韻…可帶一絲從者隱約察覺御主窺見記憶的反應。
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
純機制／回傳 plain `message` flavor 文字（不是 AI 指令 prompt）。`actionMove` 例外——它不組 prompt，但回傳一整組「素材」（`masterCard`／`servantCard`／`foeCards`／`pursuit`／`preFoes`／`mapDesc`／`people`／`clock`…）供**前端**組 `arrivePrompt`（見 §10）。

---

## 4. 羈絆結盟 Bonds & Alliances — Router_Bond.gs

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `bond` | 羈絆選單「閒聊/共餐/特訓/夜談」→`bond(type)` | `actionBond` | 是（含突襲分支） |
| `propose_alliance` | 敵御主卡「🤝 交涉結盟」 | `actionProposeAlliance` | 是（成功/失敗兩分支） |
| `break_alliance` | 盟友卡「💔 撕毀盟約」 | `actionBreakAlliance` | 是 |
| `ally_bond` | 盟友卡「🤝 與盟友共處」 | `actionAllyBond` | 是（含突襲分支＋羈絆檔位語氣） |

### `actionBond`（action `bond`）— 三分支
- **突襲**：
  > ★以 Fate／TYPE-MOON 筆觸描寫溫存被突襲撕裂的驚變與兇險，${消滅則語氣留白／未消滅則依性格重情護主或疏離}。傷害與勝負已由系統結算。
- **羈絆里程碑**（BOND 跨過 30/60/90 各觸發一次，`【羈絆里程碑】` 標記記已跳過的門檻；`masterCard_`+`servantCard_`）：
  > 【系統·羈絆里程碑·已裁定】御主『${masterName}』與從者「${svName}」相處之際，兩人的羈絆悄然邁過一道分水嶺（時值${band}）。
  > ★這不是尋常的${act.label}，而是關係質變的一瞬，量級是：${milestoneScale}（≥90 臻至極深／≥60 明顯敞開／其餘初次鬆動 三檔）——依「${svName}」的真名與性格，寫出屬於這位從者獨有的一個具體瞬間…★【精煉100~160字】
- **正常**（`masterCard_`+`servantCard_`）：
  > ★【時間尺度】這是一段約一個小時的相處，寫出「有一段時光緩緩流過」的從容，勿寫成三言兩語的瞬間、也勿橫跨大半天。
  > ★依當前羈絆定調濃淡：${bondTier}
  > ★【精煉 90~150 字、輕快不冗長】${svName} 與御主${act.frame}的小品…點到為止留餘味。★【鐵律】保持溫暖日常或戰友情誼的分寸，不踰矩。


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

其餘同檔 helper（`isAllied_`/`allyUntil_`/`setAllyMem_`/`clearAllyMem_`/`allianceWillingness_`/`breakStaleAlliances_`/`bumpBond_`/`getBondUsedToday_`/`stampLostServant_`/`getLostServant_`/`getServantMaster_`/`getMasterServant_`/`markMasterLostServant_`）皆純機制，不叫 AI。

---

## 5. 補魔／出力／魔境等機制設定 Economy & Setters — Router_Economy.gs

本檔 7 個 handler：`actionManaSupply`（見 §2）與 `actionSpiritRepair` 會叫 AI，其餘 5 個**純機制、不叫 AI**：

| Action | 按鈕 | Handler | AI |
|---|---|---|---|
| `set_servant_output` | 從者卡🔋出力轉盤 | `actionSetServantOutput` | 否 |
| `set_mage_realm` | 技能膠囊 | `actionSetMageRealm` | 否 |
| `set_rune_mode` | 技能膠囊 | `actionSetRuneMode` | 否 |
| `outfit` | 從者卡「👕 換裝」 | `actionSetOutfit` | 否（寫 MEMORY【換裝】，之後由 `servantCard_` 的【此刻裝扮】餵 AI） |
| `weapon` | 從者卡「🗡 武裝」 | `actionSetWeapon` | 否 |
| `mana_supply` | 見 §2 | `actionManaSupply` | 是 |
| `spirit_repair` | 從者卡「🩹 靈基修復」 | `actionSpiritRepair` | **是**：不合資格→★【60~100 字】演出這個「不」；合資格→★【60~100 字】療傷小品（魔力沿契約流向從者、依性格與當前羈絆反應） |

（`set_np_choice`／`actionSetNpChoice` 已不存在：寶具選擇隨 `fate_battle` 的 `npChoice` 一起送。）

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
| `summon_servant` | 「⚔️職階分頁選英靈／🎲隨機／🖋️自訂生成」（Index.html:104-131 / Onboarding） | `actionSummonServant` | **條件式**：種子英靈否／自訂或名冊查無者是（結構化 JSON）；召喚後一律另組 `summonPrompt` 交 `narrate_only` |

### `actionManualNpc`（action `create`）
確認**不叫 AI**：所有敘事欄（BACK/TRAIT/PREF/INTENT）用玩家輸入種子值或硬編碼預設（如「外貌平凡、舉止從容、卸下心防的私密一面」·2026-09 起特徵是 3 格）直接寫入，數值/HP/MP/迴路/令咒/模式/起始禮裝由 GAS 算。AI 補完延後到 `backfill_master_ai`。

### `actionBackfillMasterAi`（action `backfill_master_ai`）
非阻塞背景呼叫，只補 4 敘事欄，走 `callGeminiAPI` 拿結構化 JSON（非敘事文字）。系統提示詞關鍵行：
> ★【演出而非說明】願望與身世只作為設定底層，不要在 background 裡直接複述願望字面。
> （★npc_intent 萌點欄 2026-09 整組退休，已從這支提示詞移除。另有 ★【語言】鐵律：全程繁體中文、不夾英文字母）
> ★background：限20字，呼應其身世／財力，禁出現具體物品名。
> ★【勿輸出數值】戰力數值、HP/MP 一律由系統裁定，prompt【不要】輸出任何數值欄位；也不要輸出地點。
> ★【輸出】合法 JSON、禁 Markdown：（附 schema）
埋入事實：姓名/性別/外貌/身世財力/願望/魔術體系/出身，缺項一律退回「隨機」。

### `actionSummonServant`（action `summon_servant`）
- **種子英靈分支**（名冊/真名比對命中）：**不叫 AI**，直接套種子庫寫死的 `persona.look/words/moe/back`（省一次 API、加速召喚）。
- **自訂/名冊查無分支**（`custDesc` 或查無比對）：**叫 AI**，走結構化 JSON。**⚔️ 職階**：玩家可用 `s-cls` 明講(獨立於瀏覽名冊用的職階分頁，不共用)，不選則 `cls` 未定、要求 AI 依描述自選並回填 JSON 的 `cls` 欄(非法值才退回 Saber)——不再無條件預設 Saber。**🎭 origin 三分類**見上方 `originGuide_` 段。
  > ★【六圍 six】依該英靈強弱給…階級用 E,D,C,B,A,EX…務必有強有弱、貼合傳說。
  > ★【技能帶 fx】skills(固有技能 2~3 個)，每個 {n,r,fx}…（附 FX_MENU_ 技能碼字典）；職階慣例技能（對魔力/騎乘/陣地作成…）**由系統依職階自動附贈、不需要你生成**（`classSkills` 已不存在）。
  > ★【外貌 look】剛好 3 短句頓號分隔：外貌本相／氣質舉止／此刻裝扮。★【語言】除 JSON 欄位名與 cls 代碼外一律繁體中文。
  > ★【特性 traits】1~3 個…(如 王/龍/人類/神性/巨人/猛獸；有神性者會被神殺剋）。
  > ★【演出而非說明】personality 與寶具只作底層，勿直接複述字面。
  > ★np：寶具名＋一句威能簡述；規模上限【對軍】（對城/對界/對神為種子英靈專屬，寫了也會被降）。★sex 從 男／女／異 擇一。
  > ★【輸出】合法 JSON、禁 Markdown：（附 schema）
  成功後 `recordOriginalHero_` 把新原創英靈寫回英靈殿供之後重用（純寫入，非 AI）。
- **🛠️ 工房**不在這支——住在 `actionSaveHero`（action `save_hero`，見 §11）：`userData.build` 是玩家親手定好的全部數值，AI 只補演出側寫（`personality/look/background/npEn…`，玩家有填就用玩家的），失敗不擋鑄造。
- **各分支皆會**再組一份 `summonPrompt`（含 `servantCard_`）走 `narrate_only` 敘事召喚初遇場景：
  > ★以 Fate／TYPE-MOON 筆觸描寫所在地的燈火與氛圍，聚焦御主與從者最初的試探、對話與張力（依上方角色背景內化演出，禁止複述設定字面、禁止用外貌代替名字）。場景留下懸念、讓玩家想以行動回應。
  > ★禁止替御主做決定、禁止詢問玩家想做什麼、禁止介紹玩家自身身份、禁止新增任何地圖或NPC。

其餘同檔 helper（`svNum_`/`getWarMode_`/`getWarName_`/`getPlayedMaster_`/`sanitizeSkills_`/`sanitizeSix_`/`recordOriginalHero_`）純機制，不叫 AI。

---

## 7. 鑑賞慾海 Kanshou & Gallery — Gallery.gs

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `enter_kanshou` | 主選單「🌹 進入鑑賞」→`enterKanshou()`（Script_Kanshou.html） | `actionEnterKanshou` | 否 |
| `backfill_kanshou_ai` | `enter_kanshou` 首次建檔後前端背景呼叫 | `actionBackfillKanshouAi` | **是**（結構化 JSON，補鑑賞御主敘事欄） |
| `kanshou_companions` | 抽屜「👥 後日談同伴」→`openCompanions()` | `actionKanshouCompanions` | 否 |
| `kanshou_summon_hero` | 駐留清單「召喚」→`kanshouSummonHero(heroId)` | `actionKanshouSummonHero` | 否（2026-07「加入這個世界的感覺」定案後只能召喚一次，沒有「請走」/隊伍容量概念了） |
| `kanshou_party` | 駐留清單每張卡「＋同行／−離開」→`kanshouPartyOp(id, op)` | `actionKanshouParty` | 否（純名單增減，下一次 `play` 才體現在【在場人物】） |
| `kanshou_memoir_op` | 💞共同回憶面板「📌釘選/☆/🗑」→`kanshouMemoirOp(name,op,text)` | `actionKanshouMemoirOp` | 否（玩家手動管理回憶） |
| `kanshou_set_name` | 「✏改名」→`changeKanshouName()` | `actionKanshouSetName` | 否 |
| `kanshou_set_sex` | 「⚧切換性別」→`changeKanshouSex()` | `actionKanshouSetSex` | 否 |
| `purge_orphans` | 主選單 DEV「🧹 清殘列」（Index.html） | `actionPurgeOrphans`（其實在 Account.gs） | 否 |
| `dev_resync_codex` | 主選單 DEV「🔄 套用最新平衡」（Index.html） | `actionDevResyncCodex`（Seed 系統） | 否 |

> ⚠ **2026-07 已砍**：舊版奪杯封存流程 `actionClaimGrail`（action `claim_grail`·寫「鑑賞」GAL 表的回憶散文）已整套刪除——ActionRouter 無此註冊、`gas/` 查無 handler，鑑賞改由「英靈殿直接召喚」(`enter_kanshou`＋`kanshou_summon_hero`)進入，不再需要先打贏戰爭奪杯封存。

### 其餘 Gallery.gs handler

---

## 8. 帳號／系統工具 Account & System-utility

Account.gs 全部函式 **零 AI 呼叫**——單純帳號/存檔/歷史記錄：

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `account_login` | 登入畫面「進　入」（Index:19/Onboarding:15） | `actionAccountLogin` | 否 |
| `account_new_game` | 「🔥 開啟新的聖杯戰爭」（Index:28/Onboarding:38） | `actionAccountNewGame` | 否 |

Router_Action.gs 核心 dispatch 相關的雜項 action（都在 Router_Action.gs 本檔內定義，見檔案開頭已讀內容）：

| Action | 按鈕/觸發 | Handler | AI |
|---|---|---|---|
| `check_name` | 「啟程」（Onboarding:154） | `actionCheckName` | 否 |
| `get_full_status` | NPC「📜 命格」鈕 | `actionGetFullStatus` | 否 |
| `update_fate` | 逆天改命存檔 | `actionUpdateFate` | 否，純寫表（4 敘事欄，數值/寶具鎖死） |
| `get_tags` | （現多由 sync 附帶，獨立呼叫見 1143） | `actionGetTags`→`buildTagsPayload_` | 否，左側狀態面板資料 |
| `sync` | 主動刷新 | `actionSync`→`buildClientState_` | 否 |
| `update_rel_tag` | 🏷️ 關係稱呼 | `actionUpdateRelTag` | 否，純寫表（順手蓋【關係鎖】）|

⚠ **2026-07 大整理訂正**：本節先前列出的 `leaderboard`/`get_victory_history`/`get_epic_history`/`war_chronicle`/`war_history_list` 五個 action 及其 handler（`actionLeaderboard`/`actionGetVictoryHistory`/`actionGetEpicHistory`/`actionWarChronicle`/`actionWarHistoryList`）**已於 2026-07 玩家推翻舊方針時整套刪除**（見 `CLAUDE.md`／`HANDBOOK.md` §1：兩個唯讀視窗全砍，單人專注不做跨帳號回顧）——grep 全 `gas/` 確認零殘留，本表格已移除這幾列，避免誤導。

**14 天時限中央攔截**（`handleGameAction` 內，Router_Action.gs:165-178）：非獨立 action，是 dispatcher 對所有會推進時間的動作事後檢查——一旦 `clock` 字串顯示天數 >14 且未 victory/defeat，強制補 `defeat:true` 並呼叫共用 `buildDreamPrompt_(...,'timeout')` 填 `dreamPrompt`（見 §1）。

---

## 9. 自由聊天引擎 `actionPlay`（action `play`）— Gallery.gs

**🔀 2026-07 玩家定案「兩軌完全拆開，鑑賞集中在一個GS」**：`actionPlay` 與 `buildDefaultSystemPrompt`（含 `nsfwBaseRules`）已從 `Router_Narrative.gs`／`Engine_Combat.gs` 搬到 `Gallery.gs`（鑑賞的家，跟召喚/進場/請走/AI深化等其餘鑑賞 action 集中一處），純檔案搬遷、函式內容逐字未動。`Router_Narrative.gs` 從此只剩 solo 的敘事 helper（`actionNarrateOnly`／`narrateWithState_`）；`Engine_Combat.gs` 只剩 solo／鑑賞共用的 `callGeminiAPI` 基礎設施。

**用途**：kanshou（慾海後日談，NSFW）自由文字聊天輸入框，走前端 `send()`（Script.html, `action:"play"`）。**solo 聖杯戰爭主軌完全不用這個**——solo 全走按鈕→`narrate_only`。`actionPlay` 100% 只被鑑賞(`KPC_`)呼叫（函式入口強制擋非 `KPC_` 呼叫）；九州 `full` 模式呼叫路徑已不存在。

與 `narrate_only` 的關鍵差異：`actionPlay` **自己從零組完整 prompt**（不假手 caller），且**直接呼叫 `callGeminiAPI(prompt, buildDefaultSystemPrompt(userData.optionsOn !== false), aiConfig)`**——第二參數是鑑賞專屬系統提示詞（`nsfwBaseRules`＋★【輸出範本】finalJson），指令分「系統」「user」兩層，結構與 `narrate_only` 相同。

組裝的事實類別：
- **在場人物完整卡**（身世/狀態/性格/特徵/關係與好感，`PROMPT_PARTY_SYSTEM`；solo 另帶六圍/氣血，鑑賞不帶）——⚠ **2026-07 §91「駐留制」改版**：`partyRows`/`partyMembers`已不是「同行隊伍」而是**當前地點的所有已存在角色**（`LOC===curL`，按好感排序取前3張詳細卡，超過3人的第4位以後只是不進這回合的詳細卡，人不會消失也不影響劇情觸發判定），卡片標籤字面已從「同行夥伴」改為「在場人物」（`partyDetailsArr`/`PROMPT_PARTY_SYSTEM`），玩家按鍵移動不再強拉任何人同步；只有AI敘事內容講「一起移動」時才會同步當時已在場的人。
- 玩家自身卡、近期歷史（最近 6 筆原始訊息／3輪，`getGameHistoryBatchRaw`，走 `aiConfig.chatHistory` 而非塞進 prompt 字面）
- **🧹 2026-07 玩家定案「砍掉同地路人、開放世界無結界」**：舊版「同地路人」清單（`allLocals`/`displayPeople`）＋其好感階梯行為指令（`resistPrompt`，死仇→摯友七級）＋場景第三方交叉羈絆整套刪除。改走 `★【這個世界有誰】`（正式同伴／常民（世界帳本升格）／路人三分，路人可描寫但不具名不追蹤）；`backgroundCrowdStr` 現為**空字串**（內容已併入該區塊，變數只留形狀）。
- **🚪🏠 2026-07 新增「巧遇開關」＋可改名的「家」移動選項**：`kanshouEncounterStr`(巧遇系統例外提示詞注入)現受`encounterOn`(讀`userData.encounter`，前端「出門走走」面板一顆checkbox、localStorage持久化)閘門，關閉時移動/原地問「還有誰」兩個擲骰點都不會觸發，但不影響已在場的`【邂逅中】`對象持續互動。`KANSHOU_LOCATIONS_`（2026-07已擴充到**50個地點**、非10個，見 `FUNCTION_MANUAL.md`）外新增一個不在清單內、顯示名稱可由玩家自訂(MEMORY`【住所】`標記，預設「家」)的私人地點——`isHomeMove`比對成立時恆不擲骰(私人空間永不巧遇陌生人)，其餘寫LOC/清`【邂逅中】`的邏輯與一般地點一致。詳見 `SOLO_REFERENCE.md` §44。
- **僅 NSFW/kanshou 模式**：同地性別配對提示、肉體狀態 JSON（2026-07 玩家定案「肉體那些欄位不需要了，只要狀態就好」：physical_state 從 6 鍵數字代碼（姿勢與動作/胸部/顏面/肉棒/蜜穴/服裝狀態）全部砍掉，簡化為單一自由文字欄，AI 自行決定每回合要不要提、提多細，不強制逐項列舉，每回合仍需據實反映最新狀態）、每位在場同伴的「身體記憶」技能標籤(`dynamic_skills`)、愛稱(`mutual_nicknames`)。（~~🔥點火 `driveOn`／`driveStr`~~ 已於 2026-09 整組移除：它最後只剩一句「尺度一律以【親密尺度五階】為準」，而親密尺度五階早就隨好感一起砍掉了——等於每次點火都在叫 AI 以一個不存在的東西為準。露骨程度現在由玩家自己的 `lewd` 旋鈕管。鑑賞現況一律以 `KANSHOU_REFERENCE.md` 為準）

🎨 **風格層（2026-09）**：★世界觀／★【視角鎖定】／★【你也是這座城裡的一個人】／★【篇幅】／🚨【收尾】五段，以及 nsfwBaseRules 的 筆觸／鐵律 1·2·4·5·6·8·10 八段，現在由 `kanshouStyle_(styles, key, vars)` 供給——玩家在「⚙ 說書人設定」改過就用玩家的、關掉就整段不送、否則用 `KANSHOU_STYLE_MODULES_` 的預設（＝下面列的那句）。事實與契約段不在此列。

USER prompt 骨架（2026-09 現況·**變數名即錨點**，以 `Gallery.gs` 為準；舊版的【敘事法旨】／★【在場驗證鐵律】／💕【鑑賞·後日談模式覆寫】／🚨【敘事終極警告】四個區塊都已不存在）：
> ★這個世界＝和平的現代日常，大家都是普通市民（2026-09-23 起每回合不提冬木；冬木只在開場布景出現一次）
> `${PROMPT_REL}`（🛑【角色一致性】等）
> ★【身體】（`_bodyLine_`：玩家自己的身體狀態）
> ★【在場名單】（這一局有誰·`presentMembers`）／★【誰在場】（有【專屬稱呼】就叫暱稱；卡片與帳本都沒提到的路人不具名）
> ★【這座城裡還住著】（`kanshouWorldRosterStr`：待命者的名字·玩家問起才由 AI 依時段掰他在做什麼）
> ★【world_note】（世界帳本寫回：地點/人物/設定·挑之後還會再遇到、再提起的寫·最多 3 筆）
> `${PROMPT_PARTY_STABLE}`（在場人物卡·整局不變·住在 **system** 吃提示詞快取）
> `${PROMPT_PARTY_LIVE}`（這一刻的樣子·每回合可能動·住在 user；共同回憶只帶釘選的＋這一步提到的）
> `${_worldFeed_}`（世界帳本餵回·最多 6 條）／`${_loreStr_}`（★【這一步碰到的底細】·觸發條目·玩家這句話碰到的喜歡／討厭與冬木正典事實·沒中整段不存在）／`${_lenLine_}`（★【篇幅】·查 `KANSHOU_LEN_TIERS_`）
> ★【現在地點】：X（讀 `COL.PC.LOC` 玩家列·開場「冬木市，我的房間」·之後 AI 用 `scene` 欄寫回）
> ★【此刻】（只給「季節的時段」兩個詞·`kanshouSeason_`＋`timeBand_`·2026-09-23 起數字不進提示詞，實測給了年月日時分模型會整串念進敘事）＋★【今晚留下的人】／★【晨間餘韻·非強制】（都依「這回合她在不在場」過濾）
> ★【在場】＋`${finalUserMsg}`（玩家這回合的動作：自己打的字標 `【玩家原話】：`、按鍵路徑標 `【玩家意圖】：`）

⚠ 這一段隨時會走鐘。**真值以 `Gallery.gs` 的 `actionPlay_` 為準**，`check_wiring.py` 只數 ★ 區塊總數（`MIN_STAR_BLOCKS`），不比對這份文件。


回應解析欄位（現行 schema，見 `buildDefaultSystemPrompt` 的 finalJson）：`narration`／`options`（**6 條**·各≤20字·「六條分別通往六種不同的後續」〔2026-09 4→6〕·`optionsOn=false` 整欄刪）／`intimacy_feedback{player:{physical_state,appearance_extras}, npcs[]:{name,physical_state,appearance_extras,mutual_nicknames,**rel_tag**,memory,**noticed**}}`／`world_note[]`／`scene`（這一段演完人在哪·≤12字·存 `COL.PC.LOC` 玩家列·下回合當 ★【場景】餵回）／`cast{join[],leave[]}`（AI 動【臨時在場】那一層·只認 `kanshouNameCandidates_` 查得到 id 的名字·同行者豁免）。**`noticed`〔2026-09·她眼中的你〕**：這回合真的從玩家言行看出來的一件事（≤14字、只記會改變之後怎麼對玩家的發現、多數回合「無」），`kanshouAppendUnique_` append 進她自己那列 MEMORY【眼中的你】。**`rel_tag`〔2026-09·關係稱呼交給 AI〕**：這個人現在是玩家的什麼（≤8字、跟上回合一樣就「無」），玩家自己打過就蓋【關係鎖】、AI 從此不碰。~~`inner_monologue`／`npc_exit`／`location`／`move_proposal`／`attitude`／`dynamic_skills`／`master_note`／`rel_changes`~~ 都已不存在（`npc_exit` 2026-09 換成 `cast`：它讓 AI 不問玩家就把人移出同行名單，現在 AI 只動得了臨時在場）；`physical_state` 是單一自由文字欄。

（`nsfwBaseRules`／`buildDefaultSystemPrompt` 定義在 `Gallery.gs`——紅線①保護區塊，本文不重複貼出，只標註 `actionPlay` 有引用其機制。函式簽名 `buildDefaultSystemPrompt(includeOptions, styles)`（2026-09 加 `styles`：玩家的說書人風格覆寫，`nsfwBaseRules` 改陣列組裝＋動態編號；缺省＝與舊字串逐字相同），永遠回傳慾海版本，因為查證後這個函式現在只可能被鑑賞呼叫。詳見 `SOLO_REFERENCE.md` §0。）

### 9.1 泡泡／旗標（2026-09 地點退休後的現況）

**鑑賞現在一顆泡泡都沒有。**

`roomEventOffer`／`roomEventAccept`／`knockEvent`／`knockAccept`／`moveProposal`／`encounterOffer`／`inviteResident` 全部不存在。

⚠ **砍掉泡泡的根因值得記著**：`moveProposal` 死在「兩個作者」——AI 已經把劇情演到咖啡廳了，
系統才跳出泡泡問玩家「要不要去咖啡廳」，按下去又把移動【再跑一次】。玩家原話
「劇情已經走到咖啡廳了。下面泡泡問我要不要去咖啡廳，我點了，原本跟我在同地的凜又進去跟櫻在一起了」。
**一件事只能有一個作者。** 之後要加任何「先問玩家再發生」的東西，先確認 AI 不會在問之前就把它演掉。

玩家現在的輸入只有兩種：**自己打字**，或**按【命運的抉擇】六顆選項之一**（按下去＝把那句話填進輸入框送出，
等同自己打的，不新增作者）。打數字 1～6 是同一顆的捷徑（上限讀 `currentOptions.length`，不寫死）。


## 10. 抵達提示詞 `buildArrivePrompt_`（Router_Movement.gs）

**2026-09 從 `Script.html` 收回後端**（移動曾是全專案唯一還在前端組提示詞的路徑，而掃描器只掃 `.gs`——`check_prompt.py` 看不到它）。`actionMove` 現在把 `arrivePrompt` 組好隨 JSON 回傳，前端 `travelTo()` 只做 `await narrate(data.arrivePrompt)`；同時把過去為了前端組裝而下傳、實際沒人讀的 `masterCard/servantCard/foeCards/foeMood/perfNote/preFoes…` 整批拿掉（`check_contract.py` 抓到每次移動白送 1691 字元）。

`buildArrivePrompt_(a)` 三段組法：
- **HERE 此地**：`【抵達】御主『${pcName}』（與從者「${svName}」）來到冬木的「${target}」，時值${timeStr}。此地氛圍：${locDesc}` ＋ 敵蹤名單或「此地暫無明顯敵蹤」。
- **JUST 剛發生**（GAS 已裁定的事，有才列）：撤離追擊／反咬（`pursuit`＋追兵 `servantCard_`）、撞見敵對互毆（GAS 用 `resolveFateBattle_` 真裁、AI 只演中斷瞬間）、敵御主痛失從者、找上門 vs 偶遇分流。
- **HOW 怎麼演**：`★演出這段抵達【${words} 字】：` 篇幅查表 `ARRIVE_WORDS_ = ['120~170','180~240','240~310','330~420']`（依有無敵蹤／事件多寡升檔）＋逐條「·」指令（環境細節、敵方依個性開口、隨行從者至少一句台詞、御主＝玩家依性格開口但不替他拍板、是否交戰留給按鍵）。
- 角色卡：`masterCard_`＋`servantCard_`＋在場敵從者卡＋ `performanceNote_` 一次點名。

舊版（2026-07）前端 `travelTo()` 自己拼「★以 Fate／TYPE-MOON 筆觸描寫兩人抵達此地的所見所感…」那一長串已全部退休。

---

## 11. 補列：2026-09 稽核抓到先前漏掉的 18 條 action

| Action | Handler（檔） | AI |
|---|---|---|
| `np_respond` | `actionNpRespond`（Router_Battle.gs） | **是** ★【200~280 字】真名解放·獨立一拍：敵寶具預告後玩家選硬接／閃避／對衝／結界／脫離（選項依從者能力 `npResponseOptions_` 長出來），GAS 結算後演這一拍。**2026-09 補收場**：這一拍打到我方從者全滅→`markDefeatIfWiped_` 填 `defeat`＋`buildDreamPrompt_`；對衝把最後一名敵從者打消滅→`markVictoryIfCleared_` 填 `victory`＋`buildVictoryDreamPrompt_`（兩者原本都漏判）。刻意不回 `clock`——時限判定已改成從資料問日子，不再看回傳字串 |
| `summon_horror_beast` | `actionSummonHorror`（Router_Battle.gs） | **是**：海怪召喚（獨立血條，`horrorShieldView_`） |
| `dismiss_horror_beast` | `actionDismissHorror`（Router_Battle.gs） | **是** ★【40~70 字】 |
| `spirit_repair` | `actionSpiritRepair`（Router_Economy.gs） | **是** ★【60~100 字】（見 §5） |
| `parley` | `actionParley`（Router_Bond.gs） | **是** 三種各自一段 ★【100~150 字】：`chat` 依性格×當前好感的真實反應／`intel` 把掀開的名字與地點**逐字**釘進提示詞（沒新情報時明講「不可捏造任何人名或地點」）／`yield` 成功演收手的理由並收在背影消失、失敗演一觸即發 |
| `faction_ambush` | `actionFactionAmbush`（Router_Movement.gs） | **是** ★【80~140 字】趁隙奇襲；只剩玩家時另填 `buildVictoryDreamPrompt_` |
| `incite` | `actionIncite`（Router_Movement.gs） | **是** 成功 ★【80~140 字】煽風點火／落空 ★【70~120 字】 |
| `save_hero` | `actionSaveHero`（Router_Creation.gs） | **是**（結構化 JSON）：工房鑄造，玩家定數值、AI 只補 `personality/look/background/npEn` 側寫，失敗不擋 |
| `claim_hero` | `actionClaimHero`（Router_Creation.gs） | 否（把他人原創英靈收進自己名冊） |
| `roll_fate` | `actionRollFate`（Core_Settings.gs） | 否（一次回三份天賦候選） |
| `outfit`／`weapon` | `actionSetOutfit`／`actionSetWeapon`（Router_Economy.gs） | 否（寫 MEMORY，之後由角色卡餵 AI） |
| `kanshou_reset` | `actionKanshouReset`（Gallery.gs） | 否（後日談歸零） |
| `world` | `actionWorld`（Gallery.gs） | 否（帳本面板·兩軌共用 list/pin/unpin/del ＋ 大區 rg_add/rg_rename/rg_del ＋ 地點 loc_rename/loc_text/loc_region/loc_own） |
| `kanshou_get_style`／`kanshou_set_style` | `actionKanshouGetStyle`／`actionKanshouSetStyle`（Gallery.gs） | 否（⚙ 說書人設定：讀／改 12 段風格模組，見 `KANSHOU_REFERENCE.md` §說書人風格交給玩家） |
| `kanshou_set_nickname` | `actionSetNickname`（Router_Action.gs） | 否（專屬稱呼，bond≥80） |

---

## 附：純機制、完全不叫 AI 的 action 總表（快速核對用）


（`set_servant_output`／`set_mage_realm`／`set_rune_mode`／`outfit`／`weapon` 這 5 個是戰鬥前的**純檔位切換**——性質等同選單勾選，不是敘事時刻，刻意不接 AI：接了反而每次調檔位都要多等一次生成、拖慢戰鬥節奏，也沒有畫面可演。)

會叫 AI（敘事 `narrate_only` 或結構化 JSON）的 action／路徑：`fate_battle`（5 分支）、`use_seal`、`mana_supply`、`rule_break_steal`、`second_wind`、`rest`（條件式）、`move`（後端 `buildArrivePrompt_`）、`bond`、`propose_alliance`、`break_alliance`、`ally_bond`、`scout`、`scavenge`、`set_workshop`、`prep_meal`（**2026-07 新增這 4 個**，見 §3——玩家反映「solo每個按鍵好像有些沒有接上ai敘述」逐一稽核補齊，皆為 60~100 字輕量演出，不拖慢節奏）、`backfill_master_ai`（結構化）、`backfill_kanshou_ai`（結構化·鑑賞御主敘事欄）、`summon_servant`（條件式結構化＋一律附敘事）、`play`（kanshou 自由聊天）、`narrate_only`（通用出口，本身無事實，套系統提示詞轉呼叫）、`tiger_dojo`（賽後番外，自帶說書人設定、不經 `miniSystem`）。dispatcher 層另有一條隱性路徑：14 天時限中央攔截自動掛 `dreamPrompt`。

---

*本文件由程式碼直接逐一核對（非憑印象），對照時間點：2026-07。若之後改了對應 handler 的 prompt 組裝方式，記得回來更新本表——尤其 `actionFateBattle`／`actionPlay` 這兩個 prompt 最複雜也最常改的地方。*

---

## 附二：2026-07 中 鑑賞 actionPlay 提示詞大擴充（本表新增段·詳見 SOLO_REFERENCE.md §109~§114）

`actionPlay`(Gallery.gs) 的條件式片段（**變數名即錨點**·2026-09 對照代碼修正；各自只在對應機制觸發時出現）：

| 片段變數 | 觸發 | 內容 |
|---|---|---|
| `kanshouNightSceneStr` | 夜未眠（兩段式就寢第一段） | ★【夜已深·門關上了】 |
| `_morningHere_` | 昨夜同床、且**這回合她在場** | ★【晨間餘韻·非強制】（人不在就整條不送） |
| `intimateNightNames` | 今晚留下過夜的人 | ★【今晚留下的人】 |
| `_worldFeed_` | 世界帳本挑出的相關條目（最多 6 條） | 這一局長出來的地方／人／設定 |
| `kanshouWorldRosterStr` | 有召喚過、此刻不在場的人 | ★【這座城裡還住著】（只給名字） |
| `_sc`（`COL.PC.LOC` 玩家列） | 上一回合 AI 寫回 `scene` | ★【場景】 |
| `_lenLine_` | 一律 | ★【篇幅】（查 `KANSHOU_LEN_TIERS_`） |
| `genderHintStr` | 玩家性別 | 旁白對「你」的用詞 |

~~`kanshouRoomEventStr`（橋段 13 筆）／`kanshouJealousStr`（醋意 20%）／`pActivityStr`（地點活動）／★【節慶氛圍】／★【今日天氣】~~ 都已不存在。

