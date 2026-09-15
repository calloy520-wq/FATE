// ==========================================
// 🎭 Router_Persona.gs — 演出依據卡：跨戰鬥/移動/召喚/羈絆/結盟全域共用的「AI 演出依據」建構器。
// ==========================================

// 召喚時已把種子口吻/小動作複製進眾生列 MEMORY，平常直接讀列不必查英靈殿；查無(舊局/AI原創從者/
// 鑑賞封存重建)時回 ""，servantCard_ 才退回 codexPersona_ 查表(6h 快取)。
// 🐛→✅ 稽核抓到：這兩個標記原本自己拼字串寫入、【完全沒有清洗】——同專案的 setOutfit_/
//   cleanTagText_/makeTextTag_ 全都會剝掉 ｜【】，只有這裡沒有。而 speech 的來源包含【工房捏角時
//   AI 生成的 dailyLook 第3段】，AI 吐出一個【 就會把整條 MEMORY 切錯格、後面所有標記靜默失效。
//   改走 makeTextTag_ 工廠：一次拿到清洗＋replace-or-append(冪等)，並消掉散落三處的重複 regex。
var PERSONA_SPEECH_TAG_ = makeTextTag_('口吻');
var PERSONA_TIC_TAG_ = makeTextTag_('小動作');
function getPersonaSpeech_(memory) { return PERSONA_SPEECH_TAG_.get(memory); }
function getPersonaTic_(memory) { return PERSONA_TIC_TAG_.get(memory); }
// 把種子的口吻/小動作附加到既有 MEMORY 字串尾端(召喚建列時呼叫，僅在有值時才附加)。
function stampPersonaFlavor_(memory, speech, tic) {
  var s = String(memory || "");
  if (speech) s = PERSONA_SPEECH_TAG_.set(s, String(speech).slice(0, 40));
  if (tic) s = PERSONA_TIC_TAG_.set(s, String(tic).slice(0, 30));
  return s;
}

// cls 可選：同真名跨職階共存時（如「斯卡哈」同時有 Lancer/Assassin 兩個種子條目、皆用同一
//   realName）避免抓錯人設——優先找「真名＋職階」都吻合的列，找不到才退回舊的純真名比對。
function codexPersona_(name, cls) {
  try {
    var d = getHeroCodexCached();
    if (!d.length) return {};
    var nm = String(name || "").trim();
    if (!nm) return {};
    var c = String(cls || "").trim();
    var fallback = -1;
    for (var i = 1; i < d.length; i++) {
      var hn = String(d[i][COL.HERO.NAME]).trim();
      if (hn === nm || hn.indexOf(nm) >= 0 || nm.indexOf(hn) >= 0) {
        if (c && String(d[i][COL.HERO.CLS]).trim() === c) {
          try { return JSON.parse(d[i][COL.HERO.PERSONA] || "{}"); } catch (e) { return {}; }
        }
        if (fallback === -1) fallback = i;
      }
    }
    if (fallback !== -1) { try { return JSON.parse(d[fallback][COL.HERO.PERSONA] || "{}"); } catch (e) { return {}; } }
  } catch (e) { }
  return {};
}

// PREF/TRAIT 內部是四段慣例存值，若整段黏成一串只掛外層標籤(性格：/特徵：)AI 看不出哪句對應哪格，
// 故逐格加標籤餵給 AI。
var PREF_LABELS_ = ['日常表象', '真實內裡', '喜歡的事物', '討厭的事物'];
var TRAIT_LABELS_ = ['外貌本相', '氣質舉止', '自稱與口氣', '卸下心防的私密一面'];
// skipNone=true 時該格若為空或字面「無」直接跳過不顯示(給御主卡/敵御主卡沿用既有的無資料防呆)；false 時保留全部4格(給 servantCard_ 用，段數不足時仍顯示「無」，不靜默漏項)。
// 無資訊量佔位字的【唯一名單】：parseTraitsHelper 各 fallback 的每一格都必須在這裡，
//   否則佔位字會被當成真資料送進提示詞、佔掉 AI 的注意力（新增 fallback 時記得補這裡）。
var QUAD_EMPTY_ = ['', '無',
  '外貌出眾', '外貌平凡', '舉止從容', '卸下心防時的柔軟一面', '卸下心防的私密一面',
  '沉著表象', '堅定內裡', '珍視之物', '厭惡之事', '通曉魔術', '深藏心事'];
function quadLabeled_(raw, labels, skipNone) {
  var parts = String(raw || "").split('、');
  var out = "";
  for (var i = 0; i < labels.length; i++) {
    var v = (parts[i] || "").trim();
    // 🧹 2026-07：空欄一律不送。舊版 skipNone=false 時會輸出「喜歡的事物：無」，理由是「不靜默漏項」
    //   ——那是為了方便開發者除錯，代價卻由每一張卡的提示詞付。要查漏欄請看試算表，別佔 AI 的注意力。
    if (QUAD_EMPTY_.indexOf(v) >= 0) continue;
    out += `｜${labels[i]}：${v}`;
  }
  return out;
}

// 🎭 這一則提示詞裡有誰。固定的表演總則(show-don't-tell／正典認知覆蓋／羈絆親疏)2026-09 移進
//   miniSystem 講一次——它每顆按鍵都貼一遍、109 字、內容從不變，是全 solo 最貴的重複。
function performanceNote_(names) {
  var list = (names || []).filter(Boolean);
  if (!list.length) return "";
  return `★本則登場：${list.join('、')}——依真名與性格演出。\n`;
}

// 🎭 從者「演出依據」卡：真名/職階/第一人稱/個性/對御主/口吻/萌點/招牌動作/六圍/技能/寶具壓成一段塞進 narration 提示詞，讓 AI 依『我們定義的角色』內化演出（只當背景、不准說嘴）。
function servantCard_(row, opts) {
  if (!row) return "";
  var skipClose = !!(opts && opts.skipClose);
  // 🗡️ 敵方卡：略過「熟了才看得到的一面」(萌點/小動作/私密一面)——戰場上的對手本來就不該有這些，
  //   送了也只是稀釋掉真正要用的口吻與性格。我方/盟友/羈絆場景仍是完整卡。
  var foe = !!(opts && opts.foe);
  try {
    var name = String(row[COL.PC.NAME] || "");
    var cls = String(row[COL.PC.RANK] || "");
    var mem = String(row[COL.PC.MEMORY] || "");
    var rowSpeech = getPersonaSpeech_(mem), rowTic = getPersonaTic_(mem);
    var rowMoe = String(row[COL.PC.INTENT] || "");
    // 召喚時已複製 speech/tic 到列上 → 平常不必查英靈殿；缺任一項(舊局/鑑賞封存重建)才退回即時查表(已走快取)。
    var p = (rowSpeech && rowTic && rowMoe) ? {} : codexPersona_(name, cls);
    var fp = p.firstP || (mem.match(/第一人稱「([^」]*)」/) || [])[1] || "我";
    // 排除字元集用 `｜|【`(兩種 pipe 都排)，跟 getPersonaSpeech_/getPersonaTic_ 一致，避免尾端吃進雜訊字元。
    var toM = p.toMaster || (mem.match(/對(?:自己)?御主：([^｜|【]*)/) || [])[1] || "";
    var prefArr = String(row[COL.PC.PREF] || "").split('、').filter(Boolean);
    // p.words 是種子原始格式(段落用「・」分隔)，quadLabeled_ 只切「、」——跟召喚寫列時
    //   (Router_Creation.gs)同款先把「・」正規化成「、」，否則多段個性會擠成一格、後面格數錯位。
    var persona = p.words ? String(p.words).replace(/・/g, "、") : prefArr.slice(0, 4).join('、');
    var np = String(row[COL.PC.MARTIAL] || "");
    var speech = rowSpeech || p.speech || "";
    var moe = rowMoe || p.moe || "";
    var tic = rowTic || p.tic || "";
    // persona.look 召喚時已複製進 row.TRAIT(parseTraitsHelper)，跟 fp/toM/persona 一樣退回讀列，別讓 p 變空物件時這格靜默消失。
    var look = String(p.look ? looksToTraitParts_(p.look, p.firstP || fp) : (row[COL.PC.TRAIT] || ""));
    // 卡頭已寫「台詞自稱『X』」，TRAIT 第3格的自稱是同一件事講第二次——就地清掉，不動存進表裡的值。
    if (look) { var _lk = look.split('、'); if (/^自稱/.test(String(_lk[2] || ""))) { _lk[2] = ""; look = _lk.join('、'); } }
    var outfit = getOutfit_(mem);              // 👕 玩家換裝：當前服裝穿著(疊在本相上·可清)
    var weapon = getWeapon_(mem);              // ⚔️ 玩家自定武裝：武器/戰鬥方式(蓋過職階慣例/原典習慣·可清)
    // 過濾掉召喚時的無資訊量 fallback(`${cls}・${realName}`，跟卡頭〈${name}·${cls}〉逐字重複)，
    //   只顯示真身世(玩家寫的原創英靈/AI補的身世)。
    var back = String(row[COL.PC.BACK] || "").trim();
    if (back === `${cls}・${name}` || /職階英靈$/.test(back)) back = "";
    // 陣營(秩序/中立/混沌 ×善/中庸/惡)：種子/工房原創都填得完整，是道德決策傾向的錨點，
    //   一直存但沒餵過AI——補上，讓「秩序・善」跟「混沌・狂」等角色的抉擇風格自然分化。
    var align = String(row[COL.PC.ALIGN] || "").trim();
    if (align === "中立") align = ""; // 中立是通用預設值、無資訊量，略過不顯示
    // 玩家自訂關係稱呼(🏷️關係鈕)：預設值「從者」無資訊量，只在玩家真的改過才顯示。
    var relTag = String(row[COL.PC.REL_TAG] || "").trim();
    if (relTag === "從者" || relTag === "無") relTag = "";
    // 狂化偵測：喪失言語、只咆哮（如赫拉克勒斯、蘭斯洛特）。開膛手傑克等會說話的狂戰士不命中。
    var mad = /狂化|無法言語|僅咆哮|不語/.test(speech + String(fp));
    // 多數角色 fp 預設值就是「我」，長提示詞中段容易讓小模型把角色自稱「我」跟敘事旁白第一人稱的
    //   「我」(玩家)混淆，故明確限定「僅此角色自己台詞內」，不留一個懸空的「自稱」標籤。
    var card = `〈${name}·${cls}·演出依據·勿複述字面〉台詞自稱「${fp}」(旁白的「我」永遠是玩家)｜對自己御主的態度：${toM || '依真名'}` +
      (persona ? quadLabeled_(persona, PREF_LABELS_, false) : `｜性格：依真名`) +
      (speech ? `｜口吻：${speech}` : "") +
      (moe && !foe ? `｜萌點(情境對了才浮現一次)：${moe}` : "") +
      (tic && !foe ? `｜小動作：${tic}` : "") +
      (look ? quadLabeled_(look, TRAIT_LABELS_, false) : "") +
      (back ? `｜身世：${back}` : "") +
      (align ? `｜陣營：${align}` : "") +
      (relTag ? `｜對御主的關係稱呼：${relTag}` : "") +
      (outfit ? `｜此刻裝扮：${outfit}` : "") +
      (weapon ? `｜武裝：${weapon}` : "") +
      (np ? `｜寶具「${np}」` : "") + `。\n`;
    if (outfit) card += `★【換裝】現穿「${outfit}」——只換衣服，長相體態仍照本相。\n`;
    if (weapon) card += `★【武裝】戰鬥一律用「${weapon}」，不套職階慣例或原典武器。\n`;
    if (mad) card += `★【狂化】已喪失言語：不說完整句子，只有低吼、咆哮與肢體（旁白仍可寫他的情緒）。\n`;
    if (!skipClose) card += performanceNote_([name]);
    return card;
  } catch (e) { return ""; }
}

// 🎭 御主「演出依據」卡（精簡）：讓 AI 知道玩家御主是誰(性別/性格/特徵/願望/萌點)，以便 portray 互動。
//   ★只供內化、禁複述；願望僅供氛圍不直述；【可】依性格給御主台詞/反應(讓角色有聲)，但【不替御主拍板戰略抉擇】。
function masterCard_(row) {
  if (!row) return "";
  try {
    var name = String(row[COL.PC.NAME] || "御主");
    var sex = String(row[COL.PC.SEX] || "");
    var moe = String(row[COL.PC.INTENT] || "").trim();
    var wish = (String(row[COL.PC.MEMORY] || "").match(/【願望】([^｜|【\n]*)/) || [])[1] || "";
    // 過濾掉建角未填的通用預設值(無資訊量)，只顯示真實身世。
    var back = String(row[COL.PC.BACK] || "").trim();
    if (back === "來歷不明的魔術師") back = "";
    // 體術/魔術是能力描述(非願望/個性/萌點字面)，不受 show-don't-tell 限制，可直接陳述；
    //   魔術階位跟魔術系統併成一行(如「寶石魔術(A階)」)，避免兩行都掛「魔術」開頭重複。
    var melee = getMasterMelee_(row[COL.PC.MEMORY]);
    var magic = getMasterMagic_(row[COL.PC.MEMORY]);
    var magicRank = getMasterMagicRank_(row[COL.PC.MEMORY]);
    var origin = getMasterOrigin_(row[COL.PC.MEMORY]);
    var playedId = getPlayedMaster_(row[COL.PC.MEMORY]);
    var playedCanon = playedId && typeof SEED_MASTERS !== 'undefined' ? SEED_MASTERS.find(m => m && String(m.id) === playedId) : null;
    return `〈御主「${name}」·演出依據(僅內化、禁複述)〉` + (sex ? `性別${sex}` : "") +
      quadLabeled_(row[COL.PC.PREF], PREF_LABELS_, true) +
      quadLabeled_(row[COL.PC.TRAIT], TRAIT_LABELS_, true) +
      (moe && moe !== "（待揭曉）" ? `｜萌點(情境對了才浮現一次·用神情語氣帶，別重複同一個動作)：${moe}` : "") +
      (back ? `｜身世：${back}` : "") +
      (origin ? `｜出身：${origin}` : "") +
      (magic ? `｜魔術系統：${magic}${magicRank ? `(${magicRank}階)` : ""}` : "") +
      (melee ? `｜體術：${melee}階` : "") +
      (wish ? `｜願望(僅供氛圍、禁直述)：${wish}` : "") +
      `。御主＝玩家本人：依性格開口、有神態台詞，不是沉默的旁觀者；但下一步由玩家按鍵決定，收尾停在等他決定的當下。` +
      (playedCanon ? `「${name}」出自Fate正典，優先依你對${playedCanon.name}的認知演出，上方僅為錨點。` : "") + `\n`;
  } catch (e) { return ""; }
}

// masterCard_ 內嵌的「性別${sex}」只是孤立事實標籤，沒教 AI 該怎麼據此裁定肢體互動，小模型便預設男性插入視角；這裡把配對事實算好直接餵給 AI。
function sealGenderFact_(masterSex, svSex, svName) {
  var mRaw = String(masterSex || ""), sRaw = String(svSex || "");
  var mSex = (mRaw === "男" || mRaw === "女") ? mRaw : "女"; // 異/無 一律按女性向器官處理，對齊全專案既有慣例
  var sSex = (sRaw === "男" || sRaw === "女") ? sRaw : "女";
  var mNote = mRaw === "異" ? "(原始性別標記「異」，肉體機制按女性向處理)" : "";
  var sNote = sRaw === "異" ? "(原始性別標記「異」，肉體機制按女性向處理)" : "";
  if (mSex === "女" && sSex === "女") {
    return `★【性別配對·務必依此裁定肢體互動】御主${mNote}與「${svName}」${sNote}皆為女性向——純女女之愛，【禁】描寫插入式陽具動作(如「進入她」)，改以手指/舌尖/器物等方式互動，雙方皆可主動索求，沒有固定的「插入方」。`;
  }
  return `★【性別配對·務必依此裁定肢體互動】御主為${mSex}性${mNote}、「${svName}」為${sSex}性${sNote}——一切肢體互動必須依雙方各自實際性別自然合理呈現，【禁】預設或錯置任一方的性別角色(如御主明明是女性卻被寫成男性插入視角)。`;
}

// 🎭 敵御主「演出依據」卡（精簡）：戰鬥現場若敵御主本人在場(同地)，讓 AI 依其性格給反應/台詞，別讓對方全程沉默——只塞夠判斷語氣與萌點的精簡片段(性格全4項/特徵/萌點)，不塞六圍/寶具/全份人設。
function enemyMasterCard_(row, opts) {
  if (!row) return "";
  var skipClose = !!(opts && opts.skipClose);
  try {
    var name = String(row[COL.PC.NAME] || "敵御主");
    var moe = String(row[COL.PC.INTENT] || "").trim();
    // 性格詞光禿禿沒有情感錨點，AI 沒別的依據就滑向類型套路，故補身世＋願望；BACK 欄格式＝
    //   「身世。外貌：…」(masterToNpcRow_)，外貌已由 TRAIT 欄呈現，這裡只取「。外貌：」前的身世段。
    var back = String(row[COL.PC.BACK] || "").split("。外貌：")[0].trim();
    if (back === "魔術師") back = ""; // masterToNpcRow_ 的無資料預設值，塞卡無資訊量
    var wish = (String(row[COL.PC.MEMORY] || "").match(/【願望】([^｜|【\n]*)/) || [])[1] || "";
    // 體術/魔術是能力描述，不受 show-don't-tell 限制，可直接陳述。
    var melee = getMasterMelee_(row[COL.PC.MEMORY]);
    var magic = getMasterMagic_(row[COL.PC.MEMORY]);
    var magicRank = getMasterMagicRank_(row[COL.PC.MEMORY]);
    // 陣營：跟servantCard_同款，種子/工房原創敵御主都填得完整，一直沒餵過AI，補上。
    var align = String(row[COL.PC.ALIGN] || "").trim();
    if (align === "中立") align = "";
    return `〈敵御主「${name}」·演出依據(僅內化、禁複述)〉` +
      quadLabeled_(row[COL.PC.PREF], PREF_LABELS_, true) +
      quadLabeled_(row[COL.PC.TRAIT], TRAIT_LABELS_, true) +
      (moe ? `｜萌點(僅供內化)：${moe}` : "") +
      (back ? `｜身世(僅內化)：${back.slice(0, 60)}` : "") +
      (align ? `｜陣營：${align}` : "") +
      (magic ? `｜魔術系統：${magic}${magicRank ? `(${magicRank}階)` : ""}` : "") +
      (melee ? `｜體術：${melee}階` : "") +
      (wish ? `｜願望(僅供氛圍、禁直述)：${wish}` : "") +
      "。" +
      (skipClose ? "" : `★若為 Fate 正典人物，優先依你對原作的認知演出，上述設定僅為錨點；非正典原創人物才嚴格依此設定。【禁】預告或影射原作後續結局與未揭露身分。\n`) +
      (skipClose
        ? `★此役敵御主本人在場，依其性格/身世與萌點給出神態反應或台詞——非沉默背景板，但戰局勝負與傷害不可改。\n`
        : `★此役敵御主本人在場，依其性格/身世與萌點給出神態反應或台詞(show, don't tell：別把萌點/性格詞當台詞或由旁白點破)——非沉默背景板，但戰局勝負與傷害不可改。\n`);
  } catch (e) { return ""; }
}

// 🗝️ 取我方從者列索引：指定 wantName 則優先取該名，否則取第一個在世從者（雙從者用）。（全文見 CODE_NOTES.md）
function findPlayerServantIdx_(pcData, gameId, wantName, wantId) {
  var want = String(wantName || "").trim();
  var idx = findPcRowIdx_(pcData, gameId, { id: wantId, name: want || null, faction: "從者", normalize: nameLoose_ });
  if (idx !== -1) return idx;
  return pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
}
