# CODE_NOTES 墓碑（封存）

> 已經從代碼移除的函式／常數，當初為什麼砍。從 `CODE_NOTES.md` 搬出來，現況查不到這些名字。

### ~~`actionPurgeOrphans`~~（2026-09-28 已移除：玩家說 DEV 按鈕「都用不太到」，建表與種子升版改在登入時由 `ensureWorldReady_` 自動跑）　<sub>Account.gs</sub>

🧹 清殘列：清掉無帳號連結的 game_id 世界(敗北殘局/棄局/亡靈)＋DEAD_列，避免眾生表養肥拖慢整表掃描。安全準則：不碰帳號當前連結的活躍戰局／game_id空白列；鑑賞(KPC_)在另表「鑑賞眾生」不受影響。一次性整表 rewrite(setValues + 單次 deleteRows tail)，遠快於逐列 deleteRow。

⚠ 孤兒判定只讀「帳號」表的 COL.ACC.PC(solo 連結)、不讀 COL.ACC.KPC(慾海連結)——若此 action 被以

KPC_ 呼叫，dispatcher 會把 sheets.pc 路由到「鑑賞眾生」，liveGids 對不上 k_ 開頭的 game_id 而誤清整張表。

KANSHOU_BLOCKED_ACTIONS_ 已擋下 KPC_ 呼叫，這裡再加一道結構性防線：直接指名讀「眾生」表。

🐛→✅ 稽核抓到：這裡原本沒同步清「歷史暫存」——違反History_Sync.gs自己的設計前提(結束局要清孤兒pcId的歷史列，否則表無上限成長)，比照purgeGameData_補上。

---

### ~~`MASTER_MELEE_TAG_`~~（2026-09 已移除）　<sub>Core_Settings.gs</sub>

御主自身能力標記：【體術】(rank字母，命運測定/種子皆保證合法)／【魔術】(自由描述文字)，創角/鋪敵時寫進御主自己的 MEMORY。體術兩用途：① masterCard_/enemyMasterCard_ 讀出當演出依據(能力描述，不受show-don't-tell限制)；②Engine_Fate.gs 的 injectMasterMeleeSupport_ 讀 rank 字母算真實戰鬥加成。

**2026-09 玩家「身分、體術、魔術骰子也不太需要…主要保留魔術迴路就好」：【體術】標記整組退休。它 2026-09 稍早就已經不再有戰鬥效果（`master_melee` fx 隨「御主不上戰場」移除），只剩御主卡上一行「體術：C階」——一個沒有任何機制的階級字母，正是會讓 AI 拿去硬掰的那種東西。**

### ~~`MASTER_MAGIC_RANK_TAG_`~~（2026-09 已移除）　<sub>Core_Settings.gs</sub>

御主魔術階位（rank字母）：跟體術同款「凡人自身能力」，只在己方出戰從者為 Caster(魔砲型)時才生效(injectMasterMagicSupport_ 內部判斷)——體術管近戰助拳、魔術階位管施法支援，避免疊在一起變成無腦雙倍加成。

**2026-09 隨體術一起退休，但它的機制留著：`injectMasterMagicSupport_`（我方從者是 Caster 時注入「御主魔術」fx）改讀 `masterMagicRankFromCircuits_(迴路)`。迴路是玩家唯一留著、而且補魔會動的那個數，拿它當單一真實來源比再擲一顆不相干的骰合理。**

### ~~`MASTER_ORIGIN_TAG_`~~（2026-09 已移除）　<sub>Core_Settings.gs</sub>

🐛→✅ 【出身】(玩家創角時選的出身背景)舊版只在 actionManualNpc 寫入，全專案查無任何讀取點——純寫入死資料，backfill 用的是當下 userData.origin(前端再送一次)而非這個持久化標記。補上跟體術/魔術/魔術階位同款讀取器，讓 masterCard_ 能把這份設定持續餵給 AI 當演出依據。

**2026-09 隨體術一起退休。`FATE_ORIGINS_`（「沒落名門的末裔」「教會代行者出身」…）是十選一的隨機標籤，跟玩家自己填的身世／財力各說各話——AI 拿到兩份互相矛盾的來歷就會開始編。身世欄留著就夠了。**

### ~~`translateMoeToDaily_`~~（2026-09 隨萌點整組移除）　<sub>Gallery.gs</sub>

戰時萌點常靠戰爭/創傷撐出沉重反差，直接照搬到沒發生過聖杯戰爭的平行世界會顯得莫名沉重——改寫成輕量、會心一笑的日常萌點。只用在 AI 原創(ai_gen)英靈；canon 種子英靈已手寫死進persona.dailyMoe(見 Seed_Codex.gs)。🐛→✅ 萌點≠反差萌：萌點泛指任何讓人喜歡上這角色的特色，可能是反差(表面兇其實軟)，也可能只是單純討喜的外觀/行為/習慣(巨乳、雙馬尾、大食、路痴等)——之前這裡連措辭都寫死成「反差萌」，逼AI每次都硬套反差句型，見 SOLO_REFERENCE.md 相關章節。

### ~~`_spotlight_`~~（聚光燈·2026-09 退休）　<sub>Gallery.gs</sub>

玩家：「給太多資料 AI 反而演不出來。」提示詞裡本來就有一句「玩家專一對著一個人時其他人背景輕描」，
但那只是叫 AI 自己節制——**資料還是全額送出去的**（每張卡 208 字，其中 115 字是原廠不會變的）。

改成由 GAS 判斷：玩家這一步的文字裡點名了誰，誰才拿完整卡。判準走既有的 `kanshouNameCandidates_`
（別名橋，短名／全名都算），不另立一套比對。
⚠ **沒點名任何人 → 全部都給完整卡**，維持原行為。這不是保守，是代價不對稱：
猜錯時那個人當場失格（性格/萌點全沒了），而猜對只省幾百字。
⚠ **口吻留在短卡裡**：背景的人也常被要求給一句反應，那一句還是要像那個人；
砍掉的是性格/特徵/招牌小動作/經歷/萌點/共同回憶，下一回合被點名就全部回來。


**2026-09 隨「六格人設搬進 system 吃提示詞快取」一起退休。** 兩個理由：
① system 必須每回合【逐字相同】才吃得到快取，沒辦法再依這一步點名了誰逐回合修剪；
② 它反而更貴——全給是 0.25 倍計費（快取讀取），修剪過的短卡留在 user 是 1.0 倍。
量過：三人同場、點名一人，舊版 user 464 字×1.0＝464；新版 system 341×0.25＋user 120×1.0＝205。
沒命中的那一回合兩者打平（341+120≈461），所以**它從來不會更差**。

### ~~`kanshouSeedMapIfNew_`~~（2026-09 隨地點整組退休·名字只剩在墓碑註解裡）　<sub>Gallery.gs</sub>

🌱 地圖搬進世界帳本之後，「這座城有哪些地方」變成資料而不是代碼。開局種什麼進去分兩種：

- **新局**種 `KANSHOU_STARTER_PLACES_`（5 筆）。玩家要的是「一片空白，但我可以跟 AI 慢慢搭建」，
  範例存在的意義只有一個——讓玩家看懂一個地方長什麼樣子、可以怎麼改。
- **舊存檔**種 `KANSHOU_LEGACY_PLACES_`（18 筆，就是原本寫死在 `KANSHOU_LOCATIONS_` 裡的那些）。
  搬家那一刻不該有東西消失：玩家的人站在那些地名上，記憶也掛在那些地名上。

**判準是「寫過沒有」不是「有沒有地方」**：玩家把地圖清空是他的決定，下次進來不該長回來。
`KANSHOU_MAP_SEED_TAG_` 存的是空值也算寫過（同 `KANSHOU_PARTY_TAG_` 那條，這兩件事看起來一樣、意思相反）。

### ~~`inner_monologue`~~（2026-09 大精簡整欄砍除·名字只剩在墓碑註解裡）　<sub>Gallery.gs</sub>

強制思維鏈：放範本第一位讓模型先自省再寫敘事。後端 sanitizeAiData_ 不讀此欄，純粹是給AI 自己看的思考格，零程式面副作用。第三人稱總結是為了不跟 narration 的敘事視角打架（2026-09 旁白已改第二人稱「你」＝玩家，這欄維持第三人稱）；「本回合開始前」明講時態，避免被誤讀成預寫本回合結果。

### ~~`npc_exit`~~（2026-09 換成 `cast`·名字只剩在墓碑註解裡）　<sub>Gallery.gs</sub>

🗺️ 2026-07 移動改「同意泡泡」制(見§134)；2026-07再修（玩家實測「AI一直提議移動、頭痛」）：move_proposal 欄位整個砍掉，AI 不再有任何管道自己決定要不要換場景/換去哪。此處刻意【不設location/move_proposal 欄】——玩家的所在地一律由 GAS 掌握：要嘛玩家自己用地圖走(moveTarget)，要嘛玩家在地圖上向同伴提議同去(proposeMove)、GAS 依好感直接裁定接不接受(_pendingProposal)，AI 兩種情況都只負責演出反應，從不負責「要不要提議」或「去哪裡」這兩個決定。

🐛→✅ 2026-07 三度改版（玩家「proposal_accept可以拿掉…promise_proposal也可以拿掉，讓GAS好感超過90…詢問玩家她是否可以與玩家同居…想要當好感卡39之類的時候GAS主動發出邀約」）：promise_proposal(她主動約你改天見面)／cohabit_proposal(她主動邀同居)／proposal_accept(早已停用)三個欄位全部拔掉，AI 不再有任何管道自己決定「要不要開口邀」——約會/同居邀約當時改由 GAS依好感數值直接判定觸發(kanshouPromiseOffer_/kanshouCohabitOffer_)，後來雙雙因玩家嫌「太煩人」(約會泡泡每回合都跳、同居泡泡每天都跳)已整組移除，約會/同居現只剩玩家自己主動發起(promiseMeet/cohabitInvite)一條路。

npc_exit：同伴自主權——她可自然告辭離場，GAS真的把她移出場景(不再是嘴上說走卻還在)。只認此刻在場同伴，去向由系統依作息決定；被牽的人離場→牽手自動鬆開。不必每回合遣散，只在情境自然時。

### ~~`specificRules`~~（2026-09 已移除（永遠是空字串））　<sub>Gallery.gs</sub>

⚠ 2026-07 玩家「色色部分都搬去給點火」實驗：色度跟隨(原0)＋情慾場生理特寫(原4)兩條搬進driveStr(見下方，僅driveOn=true才組進提示詞)——這兩條原本是「怎麼寫得好」的常駐風格指導、不是「准不准寫」的開關(准不准寫仍是【親密尺度五階】的好感天花板在管，跟driveOn無關)。搬走後矜持模式(driveOn=false)不再拿到這兩條的具體寫作指引，即使好感已達戀人階、天花板允許無上限，矜持模式下的措辭可能反而更保守含糊；主動掌握模式因為同時拿到driveStr的推進指令＋這兩條的露骨寫作指引，兩者疊加會更猛。玩家已知情況下要求先試試看，若實測矜持模式下高好感場景意外變乾癟，這是根因、把這兩條原樣搬回來即可。

🗑 2026-07【慾海律令】整塊併進 nsfwBaseRules（玩家：「妳看看能不能整合吧」）——兩份規則實測有 5 處在講同一件事：①律令1(inner_monologue) ②律令4(mutual_nicknames·schema 欄位自己講就好)③律令5(attitude·欄位已整個移除) ④律令6(裝扮) ⑤鐵律5/6 與 schema 的 options。合成一份 10 條、一個標題，AI 不必再跨兩個清單對照。留空字串是為了不動下面的 return 形狀。

### ~~`KANSHOU_LOCATIONS_`~~（2026-09 隨地點整組退休·名字只剩在墓碑註解裡）　<sub>Gallery.gs</sub>

🌸 鑑賞地點清單：純資料驅動的小陣列，不進 MAP 試算表(不跟solo共用坤圖)——之後要加/改地點只動這裡。前端 Script_Kanshou.html 另有一份同名清單純供畫按鈕(改地點時兩邊都要更新)，實際驗證/邏輯只認這裡這份。region對應KANSHOU_REGIONS_的id，純UI分組用。noEncounter:true代表私人空間，恆不觸發陌生人巧遇(見kanshouRollEncounter_呼叫端)。🏠 房間分區的name是穩定不變的內部key(給LOC比對用)，顯示給玩家/AI看的名稱是動態算的(kanshouRoomDisplayName_)——「我的房間」永遠顯示「(玩家名)的房間」。2026-07 經濟/房東房客世界觀砍除後，鑑賞不再有可指派的客房，同伴們各自落腳在自己原本的住處(KANSHOU_HERO_HOME_)。

🌱 dateOnly:true＝不進kanshouRollDailyLocation_的日常閒晃保底池(避免其他同伴平白無故被骰去這種明顯是「約會限定」的私密地點閒晃)，這個用途仍在使用中(見kanshouRollDailyLocation_)。⚠ 2026-07 八度改版(玩家「約會泡泡也好煩人」)移除GAS主動邀約機制(kanshouPickDate_)後，原本隨dateOnly一起新增、給該機制篩選地點用的minBond欄位已無任何程式碼讀取，故整批移除(地圖上玩家自己走過去/帶她同去這條路本就不受這個門檻限制，移除不影響現行流程)。

🕐 2026-07 六度改版新增 bands：玩家實測「清晨走進深夜賓館，櫃檯空無一人像恐怖片開場」──有些地點名字本身就寫明時段(深夜賓館/夜景展望台)、有些現實中就有營業時段(書店/水族館)，卻能被玩家在任何時段自由走進去，AI只能硬掰理由圓場，讀起來很違和。bands＝這個地點在哪些timeBand_(Time_World.gs 5段：清晨/午後/黃昏/夜/深夜)開放；省略此欄＝不受限、全天候開放(向後相容，其餘地點不受影響)。只管「玩家能不能走進去」，不影響同伴日常閒晃(dateOnly地點本就不進閒晃池；非dateOnly地點的閒晃池目前不比對bands，極少數情況同伴可能被骰去玩家當下進不去的地點，純屬「她剛好在，你正好碰不上」的日常感，不是bug)。門檻依「地點名字/現實常識暗示的營業時段」訂，非玩家點名的地點一律維持不設限，之後想擴大範圍只需往表加 bands 一列。⚠ 改這裡記得同步前端顯示鏡射 KC_LOCATIONS_(Script_Kanshou.html)的同名地點——否則鎖圖示對不上後端實際判定(同KANSHOU_LOCATIONS_/KC_LOCATIONS_過去漏同步過5個地點的教訓)。設有 bands 限制的地點若被玩家相約(promiseMeet)選中，只能挑跟該地點bands相容的時段，避免「約好了、赴約時卻被地點未開放擋在門外」的必爽約陷阱。

### ~~`kanshouLocContextForAI_`~~（2026-09 隨地點整組退休·名字只剩在墓碑註解裡）　<sub>Gallery.gs</sub>

拜訪住處：只保留女性角色的住處，noEncounter:true(私人住處，恆不觸發陌生人巧遇)，name務必與下方KANSHOU_HERO_HOME_的值逐字一致，否則kanshouRollDailyLocation_骰到的地點對不上這裡。（2026-07 七度改版：泛用住處池KANSHOU_GENERIC_HOME_POOL_不寫在這裡手動維護，改在該常數宣告處用push動態併入此陣列，同樣受這條「name須逐字一致」規則約束，只是來源不同。）

### ~~`KANSHOU_LOCATION_ACTIVITY_`~~（2026-09 砍除·名字只剩在墓碑註解裡）　<sub>Gallery.gs</sub>

🏷️ 2026-07「移動過去 他們必須是要在打工或是消費活動...不然聊一聊會不會忘記他是在工作」玩家定案：商業性質地點給一句「當下在做什麼」的輕量敘事引子，讓AI對「為什麼她在這個店裡」有個合理交代、且整回合對話都能維持一致(不需要持久狀態——每回合都直接依她當下真實LOC現查現算，本來就不會忘記；純寫死的地點→活動對照表，沒有寫死的地點沒有這句提示，AI自然發揮，不受限)。

🎲 2026-07 玩家「有時打工有時當客人」：每地點改成多個活動變體(店員側/客人側/自然變化)，用「名字+日期+地點」決定性挑選(kanshouLocActivity_)——同一人同一天同地點恆同一個(聊到一半不會店員忽然變客人)，跨日/換人/換地自然輪替。零持久化、每回合現算。

### ~~`kanshouRollDailyLocation_`~~（2026-09 隨地點整組退休）　<sub>Gallery.gs</sub>

同住人深夜/清晨睡不著出門走走的機率，獨立於一般英靈的homeBias，資料只存一處。

幫「不在身邊」的英靈決定當下要去哪——反查KANSHOU_LOCATION_TAGS_有沒有標到這位英靈，有就加權隨機挑一個常去地點，沒標到就全地點隨機挑。hour：深夜/清晨時段大機率改回「她自己原本就有的住處」(kanshouGetHeroHome_：KANSHOU_HERO_HOME_專屬住處優先，查無就讀【住處】隨機分配記憶標記，兩者皆無才退回通用的「自己的住處」)。

memory選填：只有call site拿得到該英靈自己列的MEMORY時才傳，供讀取隨機分配的【住處】標記；省略時只吃KANSHOU_HERO_HOME_專屬住處(現有7位種子英靈不受影響)。

🌙 全地點保底池排除'room'(玩家自己的房間)跟'visit'(別人登記的住處，見KANSHOU_HERO_HOME_)兩個分區——不同行的英靈不該隨機骰進玩家臥室或別人家裡，那裡只能靠「拜訪」主動走進去，不是隨機亂晃能撞到的地方；否則沒有haunts標籤/沒有登記住處的英靈可能隨機骰進遠坂邸這種別人的家，跟夜襲/賴床叫醒橋段「LOC剛好等於某人家」的判定衝突，觸發在錯的人身上。'home'分區(共用生活空間，客廳/廚房等)不算私人，維持可被隨機骰中。dateOnly(深夜賓館/情侶溫泉套房這類明顯是GAS約會邀請限定的私密地點)也排除——不該讓其他無關同伴平白骰去這種地方閒晃。

### ~~`setKanshouHomeName_`~~（2026-09 已移除（隨 actionKanshouSetHomeName））　<sub>Gallery.gs</sub>

🐛→✅ 稽核抓到：原本沒清掉｜/【/】等標籤分隔字元，玩家取名帶這些字元會撐壞這行MEMORY格式(讀取時regex在第一個｜就截斷，殘餘字變成脫隊在tag外的孤兒文字)。走 kanshouSanitizeTagValue_ 同款淨化。

### ~~`KANSHOU_INITIATIVE_DAY_TAG_`~~（2026-09 已移除）　<sub>Gallery.gs</sub>

🙋 她主動(2026-07 玩家「泡泡用的應該也很少了…NPC 是不是就不太主動了？」)。稽核結果：她主動的機制只剩「按睡覺時 20% 的深夜訪客」一條，一天 90 個回合裡有 89 個她永遠在等你先開口。舊的主動邀約/橋段泡泡全被拔掉，理由都是同一個——「條件成立就每回合跳，玩家嫌煩」。所以這批一律【不做泡泡】：GAS 擲骰→直接寫成既成事實→AI 演，中間沒有任何一句「你要不要？」。這正是深夜訪客不惹人厭的原因，照抄那個形狀。⚠ 閘門是【全域每日一次】不是每人每天一次——10 位同伴搶同一個名額，頻率跟 1 位完全一樣(玩家「不然如果 10 個 NPC 我不就天天約會」)。

**2026-09 已移除：「她主動來找你」隨橋段池一起砍掉，這個當日鎖就沒有人蓋也沒有人讀了。**

### ~~`KANSHOU_SIDEWRITE_EVERY_`~~（2026-09 已移除）　<sub>Gallery.gs</sub>

🌀 側寫節流：master_note(經歷)每回合都問會分散 AI 對敘事的注意力。改成每 N 回合才把master_note 放進 schema，其餘回合 AI 完全不知道有這回事、專心寫敘事。計數存玩家列 MEMORY——該列每回合本就必寫回(pcIndex 恆在 dirtyPcRows)，故零額外 round-trip。N=3 剛好貼齊 6筆/3輪 的歷史窗。

**2026-09 已移除（隨 master_note 一併），舊存檔殘留的標記是純孤兒資料。**

### ~~`kanshouSanitizeTagValue_`~~（2026-09 已移除：唯一呼叫端 setKanshouHomeName_ 沒了）　<sub>Gallery.gs</sub>

通用【tag】值淨化：清掉標籤分隔字元(,/:/｜/【/】)避免撐破 MEMORY 裡任何單值 tag 的格式(住所名等任何單值 tag)，順手也清掉引號/角括號(防止原樣塞進前端onclick屬性時破壞HTML)。maxLen不帶預設8。🐛→✅ 稽核比對 solo Router_Creation.gs 的同款清洗(cleanTagText_/_fClean)發現那邊多清\n\r\t(換行/tab)這裡沒清——雖不會撐破｜【】格式(regex排除集本就含隱式匹配換行)，但跟既有慣例對齊，一併補上。

### ~~`KANSHOU_ALBUM_CAP_`~~（2026-09 已移除）　<sub>Gallery.gs</sub>

📷 相簿(拍照收集)：手機拍照·2026-07 再修（玩家「拍照要改成手機、不用等」）——原本是寶麗來設定(每日底片限量+隔天沖洗)，玩家覺得手機沒有底片這種東西、拍完也該立刻能看，兩個限制都拔掉了。只留每局相簿總容量 KANSHOU_ALBUM_CAP_ 張(滿了要刪舊照，避免試算表無限膨脹)。小敘述由AI在拍照當回合的回應JSON多吐photo_caption(同一次呼叫·零額外round-trip)，AI沒吐才用模板保底。

**2026-09 已移除：相簿／拍照整組砍掉之後，這個上限沒有人讀了，只剩註解在描述一個不存在的功能。**

### ~~`OFFENSIVE_NP_ATK_FX_`~~（2026-09 已移除）　<sub>Router_Battle.gs</sub>

⚠ 這個常數後來被**資料驅動的寶具種類表**取代（`NP_KIND_MARKS_` ＋ `npKindOf_`／`npCanClash_`／`npReleasable_`），
fx 清單那條路從此沒人走。2026-09 稽核用「只出現一次的常數」掃出它已是孤兒才拿掉——
提醒：**用 fx 白名單判類別，天生就會跟下一個人加的 fx 脫節**；種類寫在寶具自己身上（`【常駐寶具】` 這類標記）才不會漏。
以下是它當年在做什麼：

### ~~`applyMasterStanceShare_`~~（2026-09 已移除）　<sub>Router_Battle.gs</sub>

🩸 傷害轉移：從者剛吃了 dmg(fateStrike_ 已寫入從者HP＋sheet)，御主依風格「討回」share 比例替其承受——從者HP回補 shared、御主HP扣 shared，兩列即刻寫回 sheet(與 backlash/drainForNp_ 同一套逐事件寫法)。御主不因分擔而死(保底1)；已瀕死(≤1)則無力再擋。回實際分擔值(供戰報)。

### ~~`parseForgeBuild_`~~（2026-09-24 隨舊英靈工房已移除，新工房見『WAR_FORGE_』）　<sub>Router_Creation.gs</sub>

🛠️ 工房 build 解析＋全套驗證（單一真實來源：召喚 actionSummonServant build 分支 與 修改 actionUpdateHero 共用）。規格：預算340·六圍+技能+規模同一錢包(EX≤2)＋技能≤4(前3免欄位費·第4欄+20·fx白名單·上限A·三軌計價·二元平價·燕返60)＋規模計價(對軍+20)＋寶具名/描述剝高規模關鍵字＋正典名擋＋演出七欄清洗。回 {ok:false,message} 或 {ok:true,...欄位}。

🐛→✅ 稽核抓到：原本沒濾HTML斷字字元(<>&"'`)——這些欄位(toM/speech/tic/moe/back/look/pref/weapon)跟同函式內name(496)/traits(517)/skills(544)/npName(552)一樣，最終都會被前端原樣拼進innerHTML顯示(如showNpDesc→showHistoryOverlay無escape)，原創英靈存進共用英靈殿，其他帳號召喚到就會觸發，是可跨帳號的儲存型注入，不是自傷。補齊跟其餘欄位同款清洗。

🎭 特性(traits)：純敘事風味標籤(見 Script.html TRAIT_DESC)，不進 FORGE_BUDGET 計費、不驗白名單——玩家想捏其他作品角色(如「賽亞人」「人造人」)需要能自由發揮，比照 AI 生成分支(aiTraits)同一套清洗規則(頓號/逗號分段、上限4個、單則截8字)，讓工房手捏角色也能貼這類梗。

🐛→✅ 補 HTML 斷字字元清洗——同一函式內技能名稱(out.skills)早有這道清洗，特性名稱漏了，兩者最終都會被 Script.html 的 pill()/showSkillDesc() 原樣拼進 <span> HTML 顯示。

FORGE_CLS_BONUS_ 已上移為檔案級單一真實來源（與 AI 生成路徑 capSixToBudget_ 共用）：

Berserker 職階附贈狂化C(傷+但命中/迴避−·不可關)是唯一負資產禮物，同素體實測墊底——補正+30 拉平(+50 會反轉成最優職階，370 頂配狂戰實測後仍只是強力中堅，安全)。

🛡️ 同上：hasOwnProperty才是真的白名單命中，避免"constructor"這類繼承鍵讓後面的FLAT_FX_[fx]查到Object建構子函式，把skillCost污染成字串，讓total>clsBudget的超預算擋失效(number>string比較會把字串轉NaN，NaN>x恆false)。

🐛→✅ 稽核抓到：npAtkScale_(Engine_Fate.gs)對整串np做子字串比對(/對軍/.test(np))決定攻擊規模，而這串np是npName+npDesc原文直接拼接——舊版清洗只濾掉「對城/對界/對神」三個更高階規模字樣，唯獨漏了「對軍」這個真正要收20點預算的那一階，玩家把npScale選便宜的「對人」(0元)、卻在npDesc自由文字裡塞一句含「對軍」的敘述(如「曾單槍匹馬對軍陣衝鋒」)，戰鬥時就白吃對軍規模的傷害倍率——等於免費繞過規模預算。四個規模關鍵字一併濾掉，維持只有npScale本身能決定規模。

### ~~`actionClaimHero`~~（2026-09-24 隨舊英靈工房已移除，新工房見『WAR_FORGE_』）　<sub>Router_Creation.gs</sub>

工房存檔（action="save_hero"：工房＝純製造/修改，不召喚）：create＝寫英靈殿新列(AI 補 persona/寶具英文名·蓋創造者印記)；edit(帶 heroId)＝僅創造者本人可改、真名不可改(識別鍵)、演出欄非空覆寫/空保留、寶具英文名沿用舊值。改的是英靈殿【範本】——之後召喚才生效，已在場的分身不追改(可用 DEV「套用最新平衡」同步)。

認領無主原創英靈（action="claim_hero"）：創造者印記功能上線前鑄的 ai_gen 英靈沒有 persona.creator，「我的作品」不列、✏️ 不亮、誰都不能改——開放認領：無主者先到先得，已有主的不可搶。

### ~~`actionSaveHero`~~（2026-09-24 隨舊英靈工房已移除，新工房見『WAR_FORGE_』）　<sub>Router_Creation.gs</sub>

🐛→✅ 職階切成「御主」是破壞性動作(parseForgeBuild_對isMasterCls會直接清空六圍/技能/寶具，見上方註解)——原本改職階誤選到御主、直接存檔會無聲蓋掉戰鬥數值，且成功訊息完全沒提示這件事。非「御主→御主」的職階切換才需要二次確認，避免正常編輯(職階本來就沒變/本來就是御主)被多問一次。

外貌/性格改了，先前快取的日常版本會跟新設定對不上——重新轉一次，不留舊資料。translateLookToDaily_ 一次呼叫同時產出四段式 look 與獨立的 outfit；moe 需先算好才能當 hint 傳入，避免「私密一面」跟萌點撞成同一件事的兩種說法。

🐛→✅ 稽核抓到：line 643的查重跟AI呼叫(651-654，常達數秒)之間有TOCTOU競態窗口——兩個幾乎同時的save_hero請求可能都通過各自查重，只有先寫入appendRow那個真的成功，後者在recordOriginalHero_內部撞名靜默return false，卻原本一律被這裡回報「已鑄入」成功。誠實回報。

### ~~`injectMasterMeleeSupport_`~~（已移除·名字只剩在墓碑註解裡）　<sub>Engine_Fate.gs</sub>

🥋 把御主自己的體術階級注入我方從者戰鬥單位 c 的 skills（比照 injectMysticBuff_ 同一套「找 fx已存在則略過」慣例，避免重複注入）。無【體術】記錄(空字串)則不注入——舊資料/未測定者維持零加成。

### ~~`dailySpeechByName_`~~（2026-09 已移除）　<sub>Gallery.gs</sub>

actionPlay 組同伴命格時，MEMORY 查無【口吻】標記會退回這裡的日常安全版，而非戰時原始codexPersona_(name).speech(如狂化英靈「僅餘低吼」)——避免任何路徑把戰時口吻餵給鑑賞AI。
**2026-09 玩家「自稱和語癖這可以砍了，這不該是我們要求的？我們是要設定角色、讓 AI 演活他」——
`persona.speech`／`firstP` 整組退休，這支連同它的預抓 `_partyHeroCodex`、以及 `dailyLook` 第 3 段
（日常口氣）一起砍掉。語癖本來就跟性格欄講同一件事（凜的口吻「毒舌卻藏著關心」＝性格②刀子嘴豆腐心），
是同一個事實存兩處。**

### ~~`actionKanshouSetHomeName`~~（2026-09 已移除：前端入口隨地圖退休，整條路由沒人叫）　<sub>Gallery.gs</sub>

🏠「出門走走」面板的「家」選項可自由改名(如「工房」「我的公寓」)，比照 actionKanshouSetName同款寫法，只是寫進 MEMORY【住所】標記而非獨立欄位。

### ~~`master_note`~~（2026-09 砍除·名字只剩在墓碑註解裡）　<sub>Gallery.gs</sub>

🌱 玩家御主「滾動側寫」：AI 每回合觀察玩家、慢慢認識他(像對話 AI 記住使用者習慣)。GAS 只採用【玩家仍留白】的欄位(玩家自己填過的一律鎖住、不覆寫)；經歷則每回合承接舊值滾動更新。詳見 §玩家側寫。

### ~~`getKanshouPeopleList_`~~（2026-09 已移除：前端拿 people 做的是把名字替換成它自己的 no-op，後端卻每回合整表掃一次）　<sub>Gallery.gs</sub>

鑑賞自己算一份精簡版「同地人物」清單，不借用 solo 的 getLocalPeopleList(那是為敵蹤/盟友情報共享等一整套機制設計的，多算了12個欄位，鑑賞前端只用得到 .name/.isExact)。

### ~~`KANSHOU_REGIONS_`~~（2026-09 隨地點整組退休·名字只剩在墓碑註解裡）　<sub>Gallery.gs</sub>

鑑賞大地圖分區：純資料驅動的分區清單，只供UI分組/顯示用，region只是KANSHOU_LOCATIONS_每筆的一個標籤欄位，不影響任何既有比對/抽選邏輯(那些都認location的name)。

### ~~`kanshouLocContextForAI_`~~（2026-09 隨地點整組退休·名字只剩在墓碑註解裡）　<sub>Gallery.gs</sub>

依 region 補一句大分區脈絡，讓AI知道此刻身處何種場域。找不到(AI自創地點)就回空字串、不硬套。

### ~~`kanshouHeroIdByName_`~~（2026-09 已移除）　<sub>Gallery.gs</sub>

依真名反查SEED_SERVANTS的hero物件(共用小helper，避免kanshouRollDailyLocation_/結束一天房間分配各自重複寫一次同款find邏輯)。

**2026-09 已移除：全樹零呼叫。**

### ~~`kanshouRollDailyLocation_`~~（2026-09 隨地點整組退休）　<sub>Gallery.gs</sub>

🏠 同居中：深夜大多回「和室」就寢(未命中=在外遊蕩的生活感)、清晨一半還在賴床、 夜間多在家中公共空間活動；白天(清晨/午後/黃昏未命中)照常走下方一般骰出門晃。

### ~~`KANSHOU_HAIR_COLORS_`~~（2026-09 已移除）　<sub>Gallery.gs</sub>

髮色解析：從角色TRAIT(dailyLook外貌段)文字抓色詞→hex——種子/工房新角色通吃(dailyLook建檔時必生成)、永遠零手工；順序敏感(深紫在紫前、紅褐在紅/褐前)，查無色詞退回中性深棕。

**2026-09 已移除：全樹零讀取。**

### ~~`KANSHOU_EVENT_SEEDS_`~~（已移除·氛圍靈感種子池）　<sub>Gallery.gs</sub>

Phase3 輕量小事件：抵達新地點時20%機率抽一顆短句靈感種子注入提示詞，純粹給AI參考的引子(非預寫劇本、非強制發生)。分三類：日常可愛/曖昧小互動恆定開放，色氣類僅driveOn開啟時抽到。

### ~~`moveTarget`~~（已移除·2026-09 地點整組退休）　<sub>Gallery.gs</sub>

鑑賞地點移動：前端點選地點按鈕時帶 moveTarget，跟一般對話同一次 round-trip 解決——比對KANSHOU_LOCATIONS_ 合法地點清單，查無效比對一律當成普通對話。

### ~~`_myGid_`~~（2026-09 併入 `myGameId`（同一個值算兩次））　<sub>Gallery.gs</sub>

🔒 拜訪私人住處門檻：跟屋主好感未達熟識(40)前不好貿然登門——擋在移動前，當作沒真的進門(留原地)， 給AI一句在門外卻步的情境，維持她家的私人邊界(前端已把鎖住的住處灰掉，這裡是直打API的後端保底)。

### ~~`_pendingNewPcRow_`~~（2026-09 已移除（永遠是 null，那條 appendRow 從沒跑過））　<sub>Gallery.gs</sub>

🆕 本回合新增的列(目前只有「結識」會產生)：先只進 pcData 讓本回合就地生效，真正 appendRow延到寫回階段——這樣 AI 失敗早退時整回合都是 no-op，不會留下半套狀態。

### ~~`_reHourAfter`~~（2026-09 已移除）　<sub>Gallery.gs</sub>

⏱️ 用「本回合結束時」的時刻算時段——氛圍句是給讀到這次回應的玩家看的，用回合開始的舊時刻會慢半拍(玩家實測：10:5x走進客廳沒跳、原地再點(已11:2x午後)才跳)。
**它唯一的下游 `kanshouReBand_` 在氛圍句／橋段池整組砍除之後就沒有人讀了，
這三行（`kanshouSceneLoc_`／`_reHourAfter`／`kanshouReBand_`）從此是算完就丟。
2026-09 拆 `actionPlay_` 時當場抓到——`actionPlay_` 自己內部也長死碼。**

### ~~`allEstablished`~~（2026-09 併入 `allies`（這一局的同伴改成算一次全程複用））　<sub>Gallery.gs</sub>

不分「同行/不同行」，所有已存在的英靈結束一天都依自己的生活重新決定要去哪——唯一例外是好感≥80且此刻確實跟玩家同地點的人，直接留在玩家房間過夜(同床共枕)。

### ~~`partyDetailsArr`~~（2026-09 改名 `PROMPT_PARTY_STABLE`／`stableArr`·名字只剩在墓碑註解裡）　<sub>Gallery.gs</sub>

📅 赴約/爽約結算已上移到 partyRows 之前(見上方)——她登場(pin到curL)必須先於在場名單計算， 否則「純聊天/拍照」路徑(不重骰位置)會讓 AI 拿到沒有她的在場卡。此處不再重複。

### ~~`_partyHeroCodex`~~（2026-09 已移除）　<sub>Gallery.gs</sub>

⚡ 提速：dailySpeechByName_ 對每位同伴呼叫都會重新解析英靈殿快取字串，這裡在迴圈外先抓一次共用傳入，省掉重複整表解析。
**唯一的消費者 `dailySpeechByName_` 隨語癖退休一起砍掉，這個預抓就沒有人用了。**

### ~~`genderHintStr`~~（2026-09-23 整段拿掉，改成固定模組 gender 那一句）　<sub>Gallery.gs</sub>

🟢 性別配對提示，直接算好給 AI，不需要它自己推理。3人同場時先分組(與玩家同性/異性)，同組共用一句規則、只在句首列名字，避免逐一 NPC 各寫一整句規則重複。

### ~~`STANCE_SHARE_`~~（已移除·名字只剩在墓碑註解裡）　<sub>Router_Battle.gs</sub>

後方支援(stealth)＝0%·躲在後方不涉險；見機行事(normal)＝5%·相機補位；正大光明(open)＝10%·堂堂立於陣前共擔傷勢。

### ~~`applyMasterStanceShare_`~~（已移除·名字只剩在墓碑註解裡）　<sub>Router_Battle.gs</sub>

🛡️ 防禦性補查：呼叫端已各自補上 !knocked 判斷，這裡再加一道保險——絕不對已被 fateStrike_標記 DEAD_ 的列回補HP/扣御主HP，避免任何未來新呼叫點漏掉同一個判斷又重蹈覆轍。

### ~~`isMasterCls`~~（2026-09-24 隨舊英靈工房已移除，新工房見『WAR_FORGE_』）　<sub>Router_Creation.gs</sub>

「御主」職階：鑑賞限定純敘事款(比照 Seed_Codex.gs 的3位canon御主)，不參與戰鬥——獨立於 VALID_CLS(七大從者職階)之外判斷，不吃 reqCls 的 Saber fallback。

🎭 AI 只補「玩家沒填的」演出欄＋寶具英文真名——失敗不擋鑄造🌹 御主職階無寶具/技能，提示詞跳過那兩行、系統prompt也不要求 npEn(反正不會被讀)。

### ~~`parseForgeBuild_`~~（2026-09-24 隨舊英靈工房已移除，新工房見『WAR_FORGE_』）　<sub>Router_Creation.gs</sub>

第4技能欄位費+20：預算才是真約束(逼六圍讓位)，疊加上限±8 讓多買的命中/迴避冗餘——最壞情況四技組合(83~85%)仍未超過三技頂點(93%)。

### ~~`actionDevResyncCodex`~~（2026-09-28 已移除：玩家說 DEV 按鈕「都用不太到」，建表與種子升版改在登入時由 `ensureWorldReady_` 自動跑）　<sub>Seed_Codex.gs</sub>

給前端 DEV 按鈕用——不靠自動版本閘(怕部署時序/旗標卡住)，按一下立即生效並回報筆數。

### ~~`actionCheckSheets`~~（2026-09-28 已移除：玩家說 DEV 按鈕「都用不太到」，建表與種子升版改在登入時由 `ensureWorldReady_` 自動跑）　<sub>Setup_FateWorld.gs</sub>

🔘 登入畫面「檢查/建立試算表」按鈕的唯一呼叫點，包成前端可觸發的 action。刻意不需要 pcId(登入前就能按)， 也不受 KANSHOU_BLOCKED_ACTIONS_ 影響(該名單只擋鑑賞context呼叫solo專屬action，這裡 pcId 恆為空不會被攔)。

### ~~`melee`~~（2026-09-29 已移除：隨 SEED_MASTERS 瘦身）
御主種子的魔術階位跟魔術系統併成一行(如「寶石魔術(A階)」)，避免兩行都掛「魔術」開頭重複。欄位已不存在（御主種子只剩 id／name）。
