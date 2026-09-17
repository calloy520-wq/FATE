// ==========================================
// 📖 Router_Narrative.gs — SOLO 專用敘事引擎
//   solo(按鍵制)的 AI 說故事 helper：actionNarrateOnly(自由扮演/切磋輕量敘事)／
//   narrateWithState_(共用核心)／虛假之夢／羈絆提升。
//   鑑賞專用的 actionPlay／buildDefaultSystemPrompt 在 Gallery.gs，兩軌不共用同一支函式。
// ==========================================

// ==========================================
// 提升御主×從者羈絆（關係表好感）
// preData：呼叫端已讀好的整表陣列可直接傳入原地改+寫格，省一次整表重讀；未給則自己整表讀一次。
// gameId 一律由呼叫端直接傳入，不用 pcName 反查局——自訂御主名允許跨局撞名，反查會綁錯局、寫錯資料。
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。
// skipWrite(選填)：呼叫端隨後必有一次涵蓋 BOND 欄的整列寫回時傳true，省掉這裡的單格立即寫入。
function raiseBond_(sheets, gameId, pcName, svName, delta, preData, skipWrite) {
  try {
    const pd = preData || sheets.pc.getDataRange().getValues();
    const gid = String(gameId || "");
    const mIdx = pd.findIndex(r => String(r[COL.PC.NAME]) === pcName && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!gid || String(r[COL.PC.GAME_ID] || "") === gid));
    if (mIdx === -1) return; // 本局查無此御主，不猜測、不誤觸別局資料
    const nIdx = pd.findIndex(r => String(r[COL.PC.NAME]) === svName && !String(r[COL.PC.ID]).startsWith("DEAD_") && (!gid || String(r[COL.PC.GAME_ID] || "") === gid));
    if (nIdx === -1) return;
    const v = Math.max(0, Math.min(100, (parseInt(pd[nIdx][COL.PC.BOND]) || 0) + delta)); // 地板 0：負 delta(交手削好感)不破底
    pd[nIdx][COL.PC.BOND] = v; // 原地回填(preData 模式下呼叫端陣列即權威；自讀模式下無副作用)
    if (!skipWrite) sheets.pc.getRange(nIdx + 1, COL.PC.BOND + 1).setValue(v);
  } catch (e) { }
}

// 從御主 MEMORY 取出【願望】內容（show-don't-tell：僅供生成虛假之夢，不直述）
function extractWish_(memory) {
  var m = String(memory || "").match(/【願望】([^｜|【\n]+)/);
  return m ? m[1].trim() : "";
}

// 🗝️ 我方從者全滅才算敗北（雙從者時折損一員只是折損）：凡是會打死我方從者的結算點都走這一支。
//    out 會被就地補上 defeat／dreamPrompt，回傳「這一下是不是打到全滅了」。
function markDefeatIfWiped_(out, pcData, gameId, pIdx, fallenName, cause) {
  var alive = 0;
  for (var i = 1; i < pcData.length; i++) {
    if (String(pcData[i][COL.PC.FACTION]) === "從者" && String(pcData[i][COL.PC.GAME_ID] || "") === gameId
      && !String(pcData[i][COL.PC.ID]).startsWith("DEAD_")) alive++;
  }
  if (alive > 0) return false;
  out.defeat = true;
  out.dreamPrompt = buildDreamPrompt_(String(pcData[pIdx][COL.PC.NAME]),
    extractWish_(pcData[pIdx][COL.PC.MEMORY]), String(fallenName || ""), cause);
  return true;
}

// 🏆 敵從者全滅＝奪杯（與 markDefeatIfWiped_ 對稱）：凡是會打死敵從者的結算點都走這一支。
function markVictoryIfCleared_(out, sheets, pcData, gameId, pIdx, winnerName) {
  if (aliveEnemyServants_(sheets, gameId, pcData) > 0) return false;
  out.victory = true;
  out.dreamPrompt = buildVictoryDreamPrompt_(String(pcData[pIdx][COL.PC.NAME]),
    extractWish_(pcData[pIdx][COL.PC.MEMORY]), String(winnerName || ""));
  return true;
}

// 建立「願望實現的虛假之夢」prompt（敗北安慰幻象）。cause==='timeout'＝第14日時限耗盡；否則＝戰鬥/補魔等敗死，破綻描述依此分流。
function buildDreamPrompt_(pcName, wish, servantName, cause) {
  var lead = (cause === 'timeout')
    ? `【虛假之夢·時限耗盡·已裁定】聖杯戰爭的第十四日已盡，御主『${pcName}』終究未能在期限內奪得聖杯，聖杯陷入沉默、戰爭悄然落幕。意識在不甘與疲憊中，墜入聖杯泥所編織的甜美幻象。`
    : `【虛假之夢·已裁定】御主『${pcName}』在聖杯戰爭中敗北，意識墜入聖杯泥所編織的甜美幻象。`;
  var flaw = (cause === 'timeout')
    ? `結尾微露破綻（過於完美的失真，或時鐘永遠停在第十四日的詭異靜止）`
    : `結尾要微微露出破綻（過於完美的失真感）`;
  return lead + `\n` +
    `在這場夢裡，御主的最深願望彷彿已然實現——一切圓滿、溫柔而虛假。${servantName ? `從者『${servantName}』也彷彿仍並肩在側。` : ""}\n` +
    (wish ? `（願望核心參考，僅供構築夢境氛圍，只以感受的形式浮現）：${wish}\n` : "") +
    `★旁白第二人稱「你」＝玩家，寫一段唯美而令人心碎的虛假美夢：讓「演出」暗示願望成真的幸福感，願望本身與這場夢的真假都留在字面之外。${servantName ? `從者依其性格自然相伴。` : ""}${flaw}。\n` +
    `★【鐵律】整段就是夢境敘事本身。`;
}

// 建立「願望終於實現」prompt（勝利·真實非虛假）——結構同 buildDreamPrompt_，但不露破綻，收在如釋重負而非心碎。
function buildVictoryDreamPrompt_(pcName, wish, servantName) {
  return `【聖杯降臨·已裁定】御主『${pcName}』斬盡了聖杯戰爭中所有的敵對從者，聖杯已然屬於你。\n` +
    `這一刻，最深的願望終於觸手可及——而且這次是真的。${servantName ? `從者『${servantName}』就在我身側，一同見證這一戰的終結。` : ""}\n` +
    (wish ? `（願望核心參考，僅供構築氛圍，只以感受的形式浮現）：${wish}\n` : "") +
    `★旁白第二人稱「你」＝玩家，寫一段真摯溫暖的勝利瞬間：讓「演出」暗示願望終於觸手可及的踏實感與如釋重負，願望本身留在字面之外。${servantName ? `從者依其性格自然相伴、給出這一刻該有的反應。` : ""}與敗北的虛假之夢不同，這次無需露出任何破綻——這是真實發生的結局。\n` +
    `★【鐵律】整段就是這段敘事本身。`;
}


function cleanNarrateEcho_(promptText) {
  var s = String(promptText || "");
  s = s.replace(/〈[^〉]*〉[^\n]*/g, "");                       // 整段演出依據卡(到行尾)
  s = s.replace(/〔[^〕]*〕/g, "");                              // 卡片前綴標記(〔敵方出戰者〕/〔夜襲者〕)
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

// 上一回合「發生了什麼」——同時當 AI 的記憶與玩家看到的歷史。每段提示詞都有【戰報/系統/玩家意圖…】這種事實行，那就是事件本身。
const NARRATE_EVENT_TAG_ = /^【(戰報|系統|玩家意圖|抵達場景|虛假之夢|聖杯降臨|召喚登場)[^】]*】/;
const NARRATE_OUTCOME_ = /^敵情|靈基崩潰|斃命|消滅|殞落|潰散|遁走|敗北|命懸/;
function narrateMemoryLine_(promptText) {
  var lines = String(promptText || "").split('\n').map(function (t) { return t.trim(); }).filter(Boolean);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i];
    if (NARRATE_EVENT_TAG_.test(t)) out.push(t.replace(NARRATE_EVENT_TAG_, "").replace(/^[：:·・]\s*/, ""));
    else if (out.length && t.charAt(0) !== '★' && t.charAt(0) !== '·' && NARRATE_OUTCOME_.test(t)) out.push(t);
  }
  var s = out.join(" ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, 160) : cleanNarrateEcho_(promptText);
}

// 防禦性過濾：miniSystem 本身充滿 ★指令/〈演出卡〉等鷹架符號，小模型偶有機率把提示詞格式原樣「回音」進輸出，讓玩家讀到突兀的系統指令。
function stripLeakedScaffold_(text) {
  var s = String(text || "");
  s = s.replace(/★[^<]*/g, "");     // 誤echo的★指令(通常延伸到下一個<br>或字串結尾)
  s = s.replace(/〈[^〉]*〉/g, "");   // 誤echo的〈演出卡〉
  s = s.replace(/[ \t\u3000]{2,}/g, " ");
  // 剝掉指令後會留下它前後兩組 <br>，疊成四連斷行＝玩家看到一塊莫名空白；收斂回正常的一次分段。
  s = s.replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>");
  return s.replace(/^(?:<br\s*\/?>\s*)+|(?:<br\s*\/?>\s*)+$/gi, "").trim();
}

// 共用敘事核心：帶最近2筆歷史＋當前狀態(御主/在場從者 HP/MP)，呼叫輕量模型生成一段敘述。
function narrateWithState_(pcId, sheets, promptText, miniSystem, opts) {
  opts = opts || {};
  var aiConfig = {
    temperature: 0.85,
    ignoreLaw: true,            // 不疊規矩表(節慶/天時)
    max_tokens: opts.maxTokens || 720, // 輕量敘事預設長度
    model: opts.model || (opts.lewd ? LEWD_MODEL : AI_MODEL), // 🔞 補魔三支換一顆敢寫的（常數在用的時候才讀，別在載入當下求值）
    isNsfwMode: !!opts.isNsfw    // NSFW 時讓 fallback 文案合理，但不啟用完整慾海規則
  };
  // 帶最近6筆歷史＝3個按鍵(miniSystem 已告知 AI：歷史是既定事實、不可重演)
  var recentHistoryRaw = getGameHistoryBatchRaw(pcId, 6);
  if (recentHistoryRaw && recentHistoryRaw.length > 0) {
    aiConfig.chatHistory = recentHistoryRaw.map(function (msg) {
      return { role: msg.speaker === "player" ? "user" : "assistant", content: String(msg.content) };
    });
  }
  // 🩸 自動附「當前狀態」(御主＋在場從者 HP/MP)，敘事才連貫(剛被爆打後該寫狼狽、非沒事人)。
  var stateBrief = "";
  var trajectoryDigest = "";
  try {
    var stData = sheets.pc.getDataRange().getValues();
    var stIdx = stData.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
    if (stIdx >= 0) {
      var stGid = String(stData[stIdx][COL.PC.GAME_ID] || "");
      // 明講「共用魔力池·從者亦賴此維生」，避免 AI 把魔力誤認成御主專屬個人數值而演出從者事不關己。
      var _mw = hpStateWord_(stData[stIdx][COL.PC.HP], stData[stIdx][COL.PC.MAX_HP]);
      // 只給白話、不給數字：原本是「數字＋白話＋『勿複述數字』」三件一起送，
      // 那等於一邊把數字攤在 AI 面前、一邊叫它別看——數字能給的判斷白話已經給了。
      var _mpw = mpStateWord_(stData[stIdx][COL.PC.MP], stData[stIdx][COL.PC.MAX_MP]);
      var sParts = ['御主' + (_mw || '毫髮無傷') + '；共用魔力池(從者無自有魔力、皆賴此維生)' + (_mpw || '充盈')];
      stData.forEach(function (r) {
        if (String(r[COL.PC.FACTION]) === '從者' && String(r[COL.PC.GAME_ID] || "") === stGid && !String(r[COL.PC.ID]).startsWith('DEAD_')) {
          var _sw = hpStateWord_(r[COL.PC.HP], r[COL.PC.MAX_HP]);
          sParts.push('從者「' + r[COL.PC.NAME] + '」' + (_sw || '毫髮無傷'));
        }
      });
      stateBrief = '【當前狀態·供連貫演出】' + sParts.join('；') + '。\n';
      try { trajectoryDigest = buildTrajectoryDigest_(stData, stGid, stData[stIdx]); } catch (e2) { }
    }
  } catch (e) { }
  var systemWithTrajectory = trajectoryDigest ? (miniSystem + '\n' + trajectoryDigest) : miniSystem;
  var raw = callGeminiAPI(stateBrief + promptText, systemWithTrajectory, aiConfig);
  try {
    var start = raw.indexOf('{'), end = raw.lastIndexOf('}');
    var data = JSON.parse(raw.substring(start, end + 1));
    if (data._genFailed) return null;
    return stripLeakedScaffold_(data.narration) || "天地靜默，一片祥和。";
  } catch (e) { return null; }
}

function actionNarrateOnly(userData, pcId, sheets) {
  const { promptText } = userData;
  // 不信任前端 userData.isNsfw(共用 checkbox、鑑賞離場不重置的風險)，改純看 pcId 路由判斷。
  const isNsfw = String(pcId || "").indexOf("KPC_") === 0;

  const miniSystem = `《命運停駐之夜》說書人守則。Fate／TYPE-MOON 筆觸、台灣繁體中文。篇幅依指令指定的字數，沒指定就 100~160 字。廝殺寫關鍵攻防與寶具威能，不寫逐回合流水帳。
【鐵律】
1. 旁白一律第二人稱：敘事裡的「你」＝玩家（御主）本人，只寫玩家看得見、感覺得到的；「我」留給角色引號內的台詞。
2. 台詞前冠說話者名（阿爾托莉雅「……」），只用單層「」；動作與環境聲響走敘事、不進引號。
3. 每2~3句用 <br><br> 分段。換行一律用 <br><br>，不用真實換行或其他 HTML 標籤。
4. 數值系統已經算完，說書人只寫字、不複述數字。
5. 對話歷史是已經結束的既定事實，只供語氣連貫；這一回合的新事件，只有這句指令寫的。
6. 標【已裁定】的事實與【當前狀態】都要在畫面上看得出來；怎麼表現依那個人的個性決定。
7. 衣著照角色卡寫，【此刻裝扮】最優先（戰鬥可寫甲冑碎裂）。解除隱匿只顯現武器，與衣著無關。
8. 性格／六圍／技能只演出來。Fate 正典角色照原作認知演，卡上短句只是錨點。
9. 只輸出 JSON：{"narration":"…"}。`;

  // 補魔/令咒的高好感解鎖分支要 500~600 字(平常 100~160)，720 tokens 會截斷——只加大上限，不換模型。
  const longForm = !!userData.longForm;
  const lewd = !!userData.lewd; // 🔞 補魔三支：換一顆敢寫的模型（見 LEWD_MODEL）
  const narrationText = narrateWithState_(pcId, sheets, promptText, miniSystem, { isNsfw: isNsfw || lewd, maxTokens: longForm ? 2000 : 720, lewd: lewd });
  if (narrationText === null) return JSON.stringify({ success: true, text: "（此處因果已定，氣息微微一閃。）" });
  saveGameHistoryBatch(pcId, [
    { speaker: "player", content: narrateMemoryLine_(promptText) }, // 🧹 存洗淨摘要、非整串提示詞(否則重整歷史會把演出依據/★指令/素材全攤給玩家看)
    { speaker: "ai", content: narrationText }
  ]);
  return JSON.stringify({ success: true, text: narrationText });
}

// ==========================================
// 🐯 老虎道場（賽後番外·敗北講評／勝利祝賀）
// ==========================================
const DOJO_CAUSE_ = {
  // ⚠ {days} 走跟 {sv}/{foe} 同一條「用的時候才代入」——直接寫 ${FATE_DEADLINE_DAYS_} 會在檔案載入當下就求值，
  //   而那個常數住在別的檔（見 CODE_NOTES）。
  deadline: { fact: '{days} 日時限耗盡，聖杯始終沒到手', lesson: '一整局 {days} 天的行程該怎麼分配' },
  seal_backlash: { fact: '用令咒強逼從者{sv}在羈絆不足時交心，令咒一解就被積怨反噬、御主當場斃命', lesson: '從者的意願，以及絕對命令的代價' },
  seal_drained: { fact: '用令咒強逼從者{sv}在羈絆不足時交心，令咒一解就被反過來榨乾、御主力竭而亡', lesson: '從者的意願，以及絕對命令的代價' },
  ambush: { fact: '在休息／補魔／交流這種卸下防備的時候被敵從者{foe}夜襲，從者殞落', lesson: '什麼時機能卸防、怎麼提早察覺敵蹤' },
  assassination: { fact: '奇襲斬首沒得手，反被護衛從者以 1.5 倍反殺、從者盡滅', lesson: '斬首只擲一顆 20 面骰，這場豪賭划不划算' },
  battle: { fact: '與{foe}正面交鋒落敗、從者靈基崩潰{np}', lesson: '職階相剋、魔力存量與撤退時機' }
};

// 敗因鍵＋名字/寶具旗標 → 給 AI 的一句既定事實＋該講的那條課題。鍵不在表上回 null（呼叫端退通用文案）。
function dojoCauseLine_(userData) {
  var c = DOJO_CAUSE_[String(userData.cause || "")];
  if (!c) return null;
  var nm = function (v) { return v ? '「' + String(v) + '」' : ""; };
  var np = userData.useNp
    ? ('（寶具已解放' + (userData.backlash ? '、還吃了過載反噬' : '') + '仍不敵）')
    : '（全程沒動用寶具）';
  var days = String(FATE_DEADLINE_DAYS_);
  return {
    fact: c.fact.replace('{sv}', nm(userData.servantName)).replace('{foe}', nm(userData.foeName)).replace('{np}', np).replace(/\{days\}/g, days),
    lesson: c.lesson.replace(/\{days\}/g, days)
  };
}

function actionTigerDojo(userData, pcId, sheets) {
  var svRaw = String(userData.servantName || '').trim();
  var sv = svRaw ? `從者「${svRaw}」` : '你的從者';
  var win = String(userData.mode || "") === 'victory';
  var c = win ? null : dojoCauseLine_(userData);
  var system = `你是《命運停駐之夜》的賽後番外「老虎道場」——Fate 經典的搞笑教學橋段。
出場的只有【藤村大河】(老虎老師·元氣熱血、常狀況外、愛耍寶)與【伊莉雅】(毒舌助手·一針見血)，寫她們兩人的對話，沒有旁白。
每句台詞前冠說話者名(大河「……」)、只用單層「」。每2~3句用 <br><br> 分段，換行一律用 <br><br>，不用真實換行或其他 HTML 標籤。
台灣繁體中文、約 120~180 字。這裡是戰後的教室，語氣搞笑溫馨。
只輸出 JSON：{"narration":"…"}。`;
  var dojoPrompt = win
    ? `【已裁定】御主奪得聖杯、這場聖杯戰爭結束，${sv}與有榮焉。
①大河誇張慶祝，順便邀功一下 ②伊莉雅嘴上毒舌、話裡藏著真心佩服 ③大河用她一貫誇張的方式恭喜御主。`
    : `【已裁定】御主敗北、${sv}消滅。這一局輸在：${c ? c.fact : '沒能撐到最後'}。
①大河開場吐槽兼打氣 ②伊莉雅點破真正輸在哪，並針對【${c ? c.lesson : '下一局的打法'}】給一條具體建議，只講這一條 ③大河收尾打氣。`;
  try {
    var raw = callGeminiAPI(dojoPrompt, system, { temperature: 0.9, ignoreLaw: true, max_tokens: 720, model: AI_MODEL });
    var s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    var data = JSON.parse(raw.substring(s, e + 1));
    // callGeminiAPI 重試全敗時的保底文字長得跟成功的一樣，靠 _genFailed 分辨（同 narrateWithState_）。
    var txt = data._genFailed ? "" : stripLeakedScaffold_(data.narration);
    if (!txt) return JSON.stringify({ success: false }); // 前端有罐頭文案(dojoFallbackHtml_)接手
    return JSON.stringify({ success: true, text: txt });
  } catch (err) { return JSON.stringify({ success: false }); }
}

