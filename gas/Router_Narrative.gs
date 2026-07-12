// ==========================================
// 📖 Router_Narrative.gs — SOLO 專用敘事引擎（2026-07 從 Router_Action.gs 拆出）
//   solo(按鍵制)的 AI 說故事 helper：actionNarrateOnly(自由扮演/切磋輕量敘事)／
//   narrateWithState_(共用核心)／虛假之夢／羈絆提升。
//   🔀 2026-07 玩家定案「兩軌完全拆開」：鑑賞專用的 actionPlay／buildDefaultSystemPrompt
//   已搬去 Gallery.gs(鑑賞的家)，這裡從此只服務 solo，不再跟鑑賞共用同一支函式。
// ==========================================

// 🗑️ 2026-07：actionClearNpcMajorEvent 已刪——唯一入口「個人史紀」面板已隨回顧類功能整套砍除，
//   這個 action 因此不再有任何按鈕能觸發。玩家後來追問「約定清空還有地方可以按嗎？達成又要去哪裡看？」
//   查證發現 COL.PC.MAJOR_EVENT 整條讀寫邏輯早已跟這個被刪的入口一起變成死路(寫入後從未被讀回餵給
//   AI、也沒有其他UI能查看)，並非「仍在用」——已隨這輪一併整條移除(見 Gallery.gs)，此註解原本的說法過期。


// ==========================================
// 提升御主×從者羈絆（關係表好感）
// ⚡ 2026-07：可選 preData(呼叫端已讀好的整表陣列)——給了就在同一份陣列上【原地改+寫格】
//   (比照 worldTick_/spendAp_ 的 preData 模式)，讓呼叫端的 pcData 保持權威、可直接餵 buildClientState_
//   夾 _state(省一次整表重讀)；沒給(其他呼叫端相容)才自己整表讀一次。
// 🐛→✅ 2026-07 第二輪稽核抓到：原本靠「用 pcName 找出御主列、拿它的 game_id 當範圍」來限定從者搜尋，
//   這條路本身就是漏洞根源——自訂御主名允許跨局撞名(專案既有設計，見 actionManualNpc 的註解)，若剛好
//   別局有同名御主排在陣列較前面，gid 就綁錯局，後面的從者好感寫入也就寫進錯的局(甚至別的帳號)。
//   改成 gameId 由呼叫端直接傳入(呼叫當下必然已經知道自己的 game_id，不必再繞一手用名字反查)，
//   兩邊查找都直接用這個可信的 gameId 範圍，不再依賴任何名字比對來界定「這是哪一局」。
function raiseBond_(sheets, gameId, pcName, svName, delta, preData) {
  try {
    const pd = preData || sheets.pc.getDataRange().getValues();
    const gid = String(gameId || "");
    const mIdx = pd.findIndex(r => String(r[COL.PC.NAME]) === pcName && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!gid || String(r[COL.PC.GAME_ID] || "") === gid));
    if (mIdx === -1) return; // 本局查無此御主，不猜測、不誤觸別局資料
    const nIdx = pd.findIndex(r => String(r[COL.PC.NAME]) === svName && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!gid || String(r[COL.PC.GAME_ID] || "") === gid));
    if (nIdx === -1) return;
    const v = Math.max(0, Math.min(100, (parseInt(pd[nIdx][COL.PC.BOND]) || 0) + delta)); // 地板 0：負 delta(交手削好感)不破底
    pd[nIdx][COL.PC.BOND] = v; // 原地回填(preData 模式下呼叫端陣列即權威；自讀模式下無副作用)
    sheets.pc.getRange(nIdx + 1, COL.PC.BOND + 1).setValue(v);
  } catch (e) { }
}

// 從御主 MEMORY 取出【願望】內容（show-don't-tell：僅供生成虛假之夢，不直述）
function extractWish_(memory) {
  var m = String(memory || "").match(/【願望】([^｜|【\n]+)/);
  return m ? m[1].trim() : "";
}

// 建立「願望實現的虛假之夢」prompt（敗北安慰幻象，之後接老虎道場）
// 敗北虛假之夢（聖杯泥編織的願望成真幻象）。cause==='timeout'＝第14日時限耗盡(破綻改成時鐘停在第14日)；否則＝戰鬥/補魔等敗死。
function buildDreamPrompt_(pcName, wish, servantName, cause) {
  var lead = (cause === 'timeout')
    ? `【虛假之夢·時限耗盡·已裁定】聖杯戰爭的第十四日已盡，御主『${pcName}』終究未能在期限內奪得聖杯，聖杯陷入沉默、戰爭悄然落幕。意識在不甘與疲憊中，墜入聖杯泥所編織的甜美幻象。`
    : `【虛假之夢·已裁定】御主『${pcName}』在聖杯戰爭中敗北，意識墜入聖杯泥所編織的甜美幻象。`;
  var flaw = (cause === 'timeout')
    ? `結尾微露破綻（過於完美的失真，或時鐘永遠停在第十四日的詭異靜止）`
    : `結尾要微微露出破綻（過於完美的失真感）`;
  return lead + `\n` +
    `在這場夢裡，御主的最深願望彷彿已然實現——一切圓滿、溫柔而虛假。${servantName ? `從者『${servantName}』也彷彿仍並肩在側。` : ""}\n` +
    (wish ? `（願望核心參考，僅供構築夢境氛圍，嚴禁逐字複述或直接點明）：${wish}\n` : "") +
    `★以 Fate／TYPE-MOON 筆觸，第二人稱，寫一段唯美而令人心碎的虛假美夢：讓「演出」暗示願望成真的幸福感，絕不可直接說出願望內容或「這是假的」。${servantName ? `從者依其性格自然相伴。` : ""}${flaw}。\n` +
    `★【鐵律】只輸出夢境敘事，禁選項或系統字樣。`;
}

// 🏆 建立「願望終於實現」prompt（勝利·真實非虛假，之後接老虎道場的祝賀版）——與 buildDreamPrompt_ 同一套
//   結構(第二人稱/帶從者入場/引願望氛圍不直述)，但這次是真的：不露破綻，收在踏實的如釋重負而非心碎。
function buildVictoryDreamPrompt_(pcName, wish, servantName) {
  return `【聖杯降臨·已裁定】御主『${pcName}』斬盡了聖杯戰爭中所有的敵對從者，聖杯已然屬於你。\n` +
    `這一刻，最深的願望終於觸手可及——而且這次是真的。${servantName ? `從者『${servantName}』就在你身側，一同見證這一戰的終結。` : ""}\n` +
    (wish ? `（願望核心參考，僅供構築氛圍，嚴禁逐字複述或直接點明）：${wish}\n` : "") +
    `★以 Fate／TYPE-MOON 筆觸，第二人稱，寫一段真摯溫暖的勝利瞬間：讓「演出」暗示願望終於觸手可及的踏實感與如釋重負，絕不可直接說出願望內容。${servantName ? `從者依其性格自然相伴、給出這一刻該有的反應。` : ""}與敗北的虛假之夢不同，這次無需露出任何破綻——這是真實發生的結局。\n` +
    `★【鐵律】只輸出這段敘事，禁選項或系統字樣。`;
}


// ==========================================
// ⚔️ 多目標群戰裁決：解析玩家輸入中的 [攻擊XXX]敘述 標籤，依序逐一裁定
// 中途玩家陣亡則立即停止後續目標，並自動放過本次連擊中已被打昏者（不可能補刀）
// ==========================================

// ==========================================
// 🟢 輕量敘事專用路由：結算已由 GAS 完成，這裡只請 AI 補一段純文字描寫
// 不讀規矩表、不帶歷史、不解析 JSON 數值，token 砍到最低
// ==========================================
// 🧹 把「給 AI 的提示詞」洗成「給玩家看的簡短回顧」：去掉演出依據卡〈…〉、★指令行、──素材──、·條列、【系統標籤】，
//   只留行動梗概並截短。重整歷史時 getGameHistory 顯示的是這個乾淨版，而非整串幕後鷹架。
function cleanNarrateEcho_(promptText) {
  var s = String(promptText || "");
  s = s.replace(/〈[^〉]*〉[^\n]*/g, "");                       // 整段演出依據卡(到行尾)
  s = s.replace(/〔[^〕]*〕/g, "");                              // 卡片前綴標記(〔敵方出戰者〕/〔夜襲者〕·2026-07 補洗)
  s = s.split('\n').filter(function (line) {
    var t = line.trim();
    if (!t) return false;
    if (t.charAt(0) === '★' || t.charAt(0) === '·') return false; // 指令行／素材條列
    if (t.indexOf('──') === 0) return false;                    // 素材分隔
    return true;
  }).join(' ');
  s = s.replace(/【[^】]*】/g, '').replace(/\s+/g, ' ').trim();    // 去【標籤】、收斂空白
  return s.slice(0, 80) || '御主有所行動。';
}

// 🎭 2026-07 玩家反映「solo不想出戲」新增的防禦性過濾：miniSystem 系統提示詞本身充滿 ★指令/
//   〈演出卡〉這類鷹架符號，小模型(SOLO_MODEL=輕量低延遲款)偶有機率把提示詞格式原樣「回音」進自己的
//   輸出——若真的發生，玩家會在故事正文裡讀到一句突兀的系統指令。這裡在回傳給玩家前做最後一道防線，
//   把「AI真正生成的敘事文字」裡任何殘留的這兩種符號整段清掉(narration 本身依規則只會是純散文+<br><br>，
//   從不會合法地含有這兩種符號，故清除不會誤傷正常敘事內容)。
//   ⚠ 刻意不清【標籤】：callGeminiAPI 失敗時的柔性 fallback 文案(如「🌫️【因果紊亂】…」)本身就是設計上
//   刻意帶著【】當作視覺標籤直接顯示給玩家看的一部分，這裡也會經過同一個 data.narration 欄位回傳——
//   若連【】一併清掉會把自己設計的 fallback 文案的標籤清掉，弄巧成拙。
function stripLeakedScaffold_(text) {
  var s = String(text || "");
  s = s.replace(/★[^<]*/g, "");     // 誤echo的★指令(通常延伸到下一個<br>或字串結尾)
  s = s.replace(/〈[^〉]*〉/g, "");   // 誤echo的〈演出卡〉
  return s.replace(/\s{2,}/g, " ").trim();
}

// 🟢 共用敘事核心：帶最近2筆歷史(chatHistory 維持語氣連貫)＋當前狀態(御主/在場從者 HP/MP)，
//   呼叫輕量模型生成一段敘述。回 narrationText；JSON 解析失敗回 null(呼叫端給 fallback)。
//   stateBrief 只給 AI 看、不存歷史。actionNarrateOnly 使用(輕量敘事共用核心)。
function narrateWithState_(pcId, sheets, promptText, miniSystem, opts) {
  opts = opts || {};
  var aiConfig = {
    temperature: 0.85,
    ignoreLaw: true,            // 不疊規矩表(節慶/天時)
    max_tokens: opts.maxTokens || 720, // 🔵 2026-07 玩家「solo原本720就維持吧」——原值運作良好，撤回上一輪的1000
    // 🔥 2026-07 玩家定案「補魔條件解鎖時場景更露骨」：唯一允許呼叫端覆寫模型的旗標——僅
    //   actionManaSupply/actionUseSeal 的高好感解鎖分支會傳 opts.model=AI_MODEL(deepseek，同鑑賞
    //   預設模型，比SOLO_MODEL更能承接露骨描寫)；其餘所有呼叫端不傳，行為與改動前完全一致。
    model: opts.model || SOLO_MODEL,
    isNsfwMode: !!opts.isNsfw    // NSFW 時讓 fallback 文案合理，但不啟用完整慾海規則
  };
  // 帶最近2筆歷史(miniSystem 已告知 AI：歷史是既定事實、不可重演)
  var recentHistoryRaw = getGameHistoryBatchRaw(pcId, 2);
  if (recentHistoryRaw && recentHistoryRaw.length > 0) {
    aiConfig.chatHistory = recentHistoryRaw.map(function (msg) {
      return { role: msg.speaker === "player" ? "user" : "assistant", content: String(msg.content) };
    });
  }
  // 🩸 自動附「當前狀態」(御主＋在場從者 HP/MP)，敘事才連貫(剛被爆打後該寫狼狽、非沒事人)。讀不到就略過。
  // 🧭 2026-07：順帶組「軌跡骨幹」(見 Core_Settings.gs buildTrajectoryDigest_)——沿用同一次整表讀取，
  //   零額外讀表。骨幹接在 system 訊息(miniSystem)後面，結構上永遠排在 callGeminiAPI 組出的
  //   messages 陣列最前面(system → chatHistory → 當前這輪)，精準卡在「最近1輪對話」之前。
  var stateBrief = "";
  var trajectoryDigest = "";
  try {
    var stData = sheets.pc.getDataRange().getValues();
    var stIdx = stData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
    if (stIdx >= 0) {
      var stGid = String(stData[stIdx][COL.PC.GAME_ID] || "");
      // 🐛→✅ 2026-07 玩家反映「從者都覺得魔力是御主的、跟從者沒關係，說話方式超怪」：查出根因——
      //   這行字面寫「御主...魔力」，把魔力講成只掛在御主名下的個人數值，隻字未提「從者無自有魔力池、
      //   共用這池魔力維生」(見Time_World.gs applyRegen_/Core_Settings.gs masterPoolMax_的既有機制)，
      //   AI 收到的字面就是「這是御主的東西」，難怪演出時從者對魔力見底一副事不關己。改成明講「共用
      //   魔力池·從者亦賴此維生」，把這份存亡與共的關係寫進每一次餵給AI的狀態行裡。
      var sParts = ['御主 HP ' + (parseInt(stData[stIdx][COL.PC.HP]) || 0) + '/' + (parseInt(stData[stIdx][COL.PC.MAX_HP]) || 0) + '·共用魔力池(從者無自有魔力、皆賴此維生) ' + (parseInt(stData[stIdx][COL.PC.MP]) || 0) + '/' + (parseInt(stData[stIdx][COL.PC.MAX_MP]) || 0)];
      stData.forEach(function (r) {
        if (String(r[COL.PC.FACTION]) === '從者' && String(r[COL.PC.GAME_ID] || "") === stGid && !String(r[COL.PC.ID]).startsWith('DEAD_')) {
          sParts.push('從者「' + r[COL.PC.NAME] + '」HP ' + (parseInt(r[COL.PC.HP]) || 0) + '/' + (parseInt(r[COL.PC.MAX_HP]) || 0));
        }
      });
      stateBrief = '【當前狀態·供連貫演出，勿複述數字】' + sParts.join('；') + '。\n';
      try { trajectoryDigest = buildTrajectoryDigest_(stData, stGid, stData[stIdx]); } catch (e2) { }
    }
  } catch (e) { }
  var systemWithTrajectory = trajectoryDigest ? (miniSystem + '\n' + trajectoryDigest) : miniSystem;
  var raw = callGeminiAPI(stateBrief + promptText, systemWithTrajectory, aiConfig);
  try {
    var start = raw.indexOf('{'), end = raw.lastIndexOf('}');
    var data = JSON.parse(raw.substring(start, end + 1));
    return stripLeakedScaffold_(data.narration) || "天地靜默，一片祥和。";
  } catch (e) { return null; }
}

function actionNarrateOnly(userData, pcId, sheets) {
  const { promptText } = userData;
  // ⚠ 2026-07 修：比照 actionPlay，不再信任前端 userData.isNsfw(同一顆共用 checkbox、同一個
  //   「鑑賞離場不重置」風險)——目前 narrateWithState_ 這條路徑此旗標恰好是死旗標(miniSystem/
  //   max_tokens 皆恆為真值蓋掉它)，但那是巧合安全、非設計安全，一併改成純看 pcId 路由。
  const isNsfw = String(pcId || "").indexOf("KPC_") === 0;

  const miniSystem = `你是《命運停駐之夜》的說書人。用 Fate／TYPE-MOON 筆觸、第一人稱「我」（玩家＝御主）、強制台灣繁體中文，依指令生動描寫一段劇情。【篇幅以下方指令指定的字數為準，務必節奏明快、不灌水、不堆砌華麗辭藻；無指定時預設精煉 100~160 字】。若為從者廝殺，把關鍵攻防、技能與寶具威能寫得有張力即可，不必逐回合流水帳。
【鐵律】
1. 旁白第一人稱「我」，禁用「你」與上帝視角。
2. 對話格式（與全遊戲統一）：（角色動作或神情，例如：微微一笑）角色名：「台詞、或（聲音）、或（動作）、或（聲音+動作），可與台詞自由交錯、也可整句僅有（動作/聲音）而無台詞文字」（角色動作或神情，可省略）。★角色若邊說話邊有動作、或說話當下帶有聲音，該動作或聲音都要用（）寫出來、夾在台詞中對應發生的位置，不可略過不寫。同一段落【不限制】名字出現次數、也不限制括號(動作/聲音)的使用次數與位置——可依演出彈性重複、交錯多輪對話與動作。引號全文僅一層「」、禁嵌『』；純背景／環境描述(無任何角色動作、無聲音)【不使用任何符號】，直接以敘事文字呈現，且【盡量精簡】——把篇幅留給互動本身，少花筆墨鋪陳場景氛圍。
3. 強制分段：每2~3句插入 <br><br>，整段至少3個 <br><br>，禁止整坨。換行一律用 <br><br>，禁止真實換行，禁止輸出任何 HTML 標籤。
4. ★這是純敘事補完，系統底層已結算完所有數值，你只負責寫字。
5. ★對話歷史中的內容是「已經發生並結束」的既定事實，僅供掌握語氣與情緒連貫，禁止把歷史中的動作當成本回合又重演一次；本回合唯一真正發生的新事件，只有當前這句指令提供的內容。
6. ★【連貫與當下狀態】務必依【當前狀態】(血量/魔力)與最近歷史承接劇情，但語氣由「實際勝負與狀態」決定、【不可臆測勝敗】：剛大勝→昂揚或警戒餘悸；浴血慘勝→疲憊卻挺立；落敗→負傷狼狽。血魔將盡(瀕死)→命懸一線、窒迫緊繃，嚴禁輕鬆閒適的閒聊感。移動/互動皆接續前情，不可表現得若無其事；但也別把打贏寫成敗走。禁止複述數字、禁止重演歷史動作。
6b.★【服裝與外貌】角色衣著嚴格依角色卡的「外貌本相／此刻裝扮」描寫——【此刻裝扮】(玩家換裝)為最優先、寫什麼穿什麼；卡上沒寫的，【嚴禁】自行讓角色裸露或增減服裝(戰鬥可寫甲冑碎裂衣袂破損、不得自行升級成裸身)；解除結界/隱匿(如風王結界)只顯現【武器】，與衣著無關。
7. 只輸出 JSON：{"narration":"你的敘述，內含<br><br>分段"}，禁止任何其他欄位、禁止 Markdown。`;

  // 🔥 2026-07：補魔/強制補魔的高好感解鎖分支會夾帶 deepseek:true(旗標名稱沿用、非固定綁死該廠商)，
  //   觸發更長的篇幅預算；前端只在那兩個特定成功分支才會傳這個旗標(見 Router_Economy.gs/Router_Bond.gs)，
  //   其餘呼叫一律不傳。這個分支的指令要求 500~600 字(遠長於平常120~180字)，720 tokens 會截斷——比照
  //   鑑賞NSFW長篇幅度(2600 tokens/約500字目標)給足餘裕，一般呼叫不受影響(仍是720)。
  // 🧪 2026-07 玩家依序測試不同模型的寫作質感：曾覆寫成 AI_MODEL(deepseek)→改落回 SOLO_MODEL(Gemini)
  //   →現在覆寫成 UNLOCKED_MODEL(Core_Settings.gs，x-ai/grok-4.1-fast)。長篇幅預算不變；模型選擇
  //   跟這個旗標本身是否觸發是兩件獨立的事，之後想再換模型只需改 UNLOCKED_MODEL 一處。
  const useDeepseek = !!userData.deepseek;
  const narrationText = narrateWithState_(pcId, sheets, promptText, miniSystem, { isNsfw: isNsfw, maxTokens: useDeepseek ? 2000 : 720, model: useDeepseek ? UNLOCKED_MODEL : undefined });
  if (narrationText === null) return JSON.stringify({ success: true, text: "（此處因果已定，氣息微微一閃。）" });
  saveGameHistoryBatch(pcId, [
    { speaker: "player", content: cleanNarrateEcho_(promptText) }, // 🧹 存洗淨摘要、非整串提示詞(否則重整歷史會把演出依據/★指令/素材全攤給玩家看)
    { speaker: "ai", content: narrationText }
  ]);
  return JSON.stringify({ success: true, text: narrationText });
}

// 🧹 舊九州連擊戰報路由 actionMultiAttackNarrate 已移除（前端 handleMultiAttack 鏈一併移除；
//    solo 戰鬥走 actionFateBattle＋fate_battle，敘事走 actionNarrateOnly）。

