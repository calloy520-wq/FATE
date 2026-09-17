// ==========================================
// 🎭 Router_Persona.gs — 演出依據卡：跨戰鬥/移動/召喚/羈絆/結盟全域共用的「AI 演出依據」建構器。
// ==========================================

// 召喚時已把種子口吻/小動作複製進眾生列 MEMORY，平常直接讀列不必查英靈殿；查無(舊局/AI原創從者/
// 鑑賞封存重建)時回 ""，servantCard_ 才退回 codexPersona_ 查表(6h 快取)。
// 🐛→✅ 稽核抓到：這兩個標記原本自己拼字串寫入、【完全沒有清洗】——同專案的 setOutfit_/
//   cleanTagText_/makeTextTag_ 全都會剝掉 ｜【】，只有這裡沒有。而 speech 的來源包含【工房捏角時
//   AI 生成的 dailyLook 第3段】，AI 吐出一個【 就會把整條 MEMORY 切錯格、後面所有標記靜默失效。
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。
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

var PREF_LABELS_ = ['日常表象', '真實內裡', '喜歡的事物', '討厭的事物'];
// 🧹 標籤已經講了「討厭的事物」，值再寫一次「厭惡…」就是疊字（種子 16 處，AI 生成的也會這樣寫）。
//    剝在【唯一的渲染出口】而不是去改每一筆資料：舊試算表的列不會因為改種子而更新，而 AI 隨時能再產一個。
var QUAD_REDUNDANT_ = { '喜歡的事物': /^(熱衷|喜歡)[於的]?/, '討厭的事物': /^(厭惡|討厭)[於的]?/ };
// 🩹 四格模板只有【四格都填滿】才成立：種子的 persona.words 常是「痛快・重義」這種價值觀清單，
//    位置硬塞會讓標籤說謊（「喜歡的事物：壓抑的少女心」）。缺格就改用這裡登記的鬆散標籤，
//    不貼位置、把值列出來就好——AI 自己判斷哪個是表象哪個是內裡。
//    鍵＝該組標籤的第一格；沒登記的標籤組（如外貌三格，由 looksToTraitParts_ 保證對位）維持逐格貼。
var QUAD_LOOSE_LABEL_ = { '日常表象': '性格' };
// ⚠ 第三格「卸下心防的私密一面」2026-09 停止送進提示詞（玩家：「太難表演了」）：
//    它跟【萌點】是同一種東西——25 位裡有 23 位寫的是條件觸發句（越X越Y／被X就Y／看到X就Y），
//    一張卡同時掛兩個「等情境對了才能演」的東西，模型只能硬塞，寫出來就尷尬。
//    ⚠ 資料【仍然存在】TRAIT 第三格（TRAIT_SLOTS_ 還是 3，舊列與寫入端一律不動）——
//      要讓它回來只要把標籤加回這個陣列，不必動任何資料。
var TRAIT_LABELS_ = ['外貌本相', '氣質'];
// skipNone=true 時該格若為空或字面「無」直接跳過不顯示(給御主卡/敵御主卡沿用既有的無資料防呆)；false 時保留全部4格(給 servantCard_ 用，段數不足時仍顯示「無」，不靜默漏項)。
var QUAD_EMPTY_ = ['', '無',
  '外貌出眾', '外貌平凡', '舉止從容', '卸下心防時的柔軟一面', '卸下心防的私密一面',
  '沉著表象', '堅定內裡', '珍視之物', '厭惡之事', '通曉魔術', '深藏心事'];
// 🫶 我方從者「此刻對你」的【位移句】：好感只負責「偏離了多少」，角色是誰仍由種子的 toMaster 說了算。
//    ⚠ 每一句都寫成【對前一句的修正】、不是一個完整的態度——這樣接在任何種子句後面都成立，
//      也才不會有「這一階該怎麼演」被表格定死。整句怎麼組見 bondStance_。
//    ⚠ 只有【我方從者】走這條。敵從者卡上那句講的是他跟【他自己的御主】的關係，跟你的好感無關。
var BOND_STANCE_ = [
  { min: 85, s: '早就名存實亡，只是誰都沒說破' },
  { min: 70, s: '對你早已破了例，而且不打算收回' },
  { min: 55, s: '這只是表面了，實際上已經願意把後背交給你' },
  { min: 45, s: '對著你的時候，這份底色鬆了一些' }
];
// 🫶 敵方（敵御主／敵從者）卡的「此刻對你」：他們對你的好感【會動】——求愛、挑撥、交涉結盟都在改
//    `COL.PC.BOND`，但卡片原本從不講這件事，於是不管你們之間發生過什麼，AI 每次都照原廠的敵意演。
//    ⚠ 刻意只在【真的偏離中性】時才回一句（`favorWord_` 中性回空字串）：沒發生過什麼就不必多送一行。
//    ⚠ 結盟排最前面——盟約期間「敵意」那句會說謊。
function foeStanceNote_(row) {
  try {
    if (isAllied_(row)) return '目前與你結盟，暫時不敵對（盟約有期限，也可能被打破）';
    return favorWord_(bondFavor_(row));
  } catch (e) { return ''; }
}
// 種子句【永遠留著】，好感只在後面補一句位移——這是「角色不會在關係變好時變成同一個人」的唯一保證。
function bondStance_(bond, seedStance) {
  var seed = String(seedStance || '').trim();
  var b = parseInt(bond), shift = '';
  if (!isNaN(b)) {
    for (var i = 0; i < BOND_STANCE_.length; i++) if (b >= BOND_STANCE_[i].min) { shift = BOND_STANCE_[i].s; break; }
  }
  if (!seed) return shift;
  return shift ? `${seed}——不過${shift}` : seed;
}
function quadLabeled_(raw, labels, skipNone) {
  var parts = String(raw || "").split('、');
  var vals = [], filled = 0;
  for (var i = 0; i < labels.length; i++) {
    var v = (parts[i] || "").trim();
    // ⚠ 空格判斷要在剝疊字【之前】先做一次：佔位字「厭惡之事」被剝成「之事」就認不出來了（見 CODE_NOTES）。
    if (QUAD_EMPTY_.indexOf(v) >= 0) { vals.push(""); continue; }
    var re = QUAD_REDUNDANT_[labels[i]];
    if (re) v = v.replace(re, "").trim();
    if (QUAD_EMPTY_.indexOf(v) >= 0) { vals.push(""); continue; }
    vals.push(v); filled++;
  }
  // 缺格＝這組標籤對不上位，退成一行不貼標籤的清單（見下方常數）。
  var loose = QUAD_LOOSE_LABEL_[labels[0]];
  if (loose && filled && filled < labels.length) return `｜${loose}：${vals.filter(Boolean).join('、')}`;
  var out = "";
  for (var j = 0; j < vals.length; j++) if (vals[j]) out += `｜${labels[j]}：${vals[j]}`;
  return out;
}

// 特徵格的專用出口：先經 traitParts_ 剝掉舊局的自稱格，再貼標籤——三張角色卡共用，別在各處各修一次。
function traitLabeled_(raw, skipNone) {
  return quadLabeled_(traitParts_(raw).join('、'), TRAIT_LABELS_, skipNone);
}

function performanceNote_(names) {
  var list = (names || []).filter(Boolean);
  if (!list.length) return "";
  return `★本則登場：${list.join('、')}。上面的卡是【內化用的素材】：推演這樣的人在此刻會做出什麼舉動、用什麼語氣。\n`;
}

// 🎭 從者「演出依據」卡：真名/職階/個性/對御主/口吻(含自稱)/招牌動作/六圍/技能/寶具壓成一段塞進 narration 提示詞，讓 AI 依『我們定義的角色』內化演出（只當背景、不准說嘴）。
function servantCard_(row, opts) {
  if (!row) return "";
  var skipClose = !!(opts && opts.skipClose);
  var foe = !!(opts && opts.foe);
  try {
    var name = String(row[COL.PC.NAME] || "");
    var cls = String(row[COL.PC.RANK] || "");
    var mem = String(row[COL.PC.MEMORY] || "");
    var rowSpeech = getPersonaSpeech_(mem), rowTic = getPersonaTic_(mem);
    // 召喚時已複製 speech/tic 到列上 → 平常不必查英靈殿；缺任一項(舊局/鑑賞封存重建)才退回即時查表(已走快取)。
    var p = (rowSpeech && rowTic) ? {} : codexPersona_(name, cls);
    var fp = p.firstP || (mem.match(/第一人稱「([^」]*)」/) || [])[1] || "我";
    // 排除字元集用 `｜|【`(兩種 pipe 都排)，跟 getPersonaSpeech_/getPersonaTic_ 一致，避免尾端吃進雜訊字元。
    var toM = p.toMaster || (mem.match(/對(?:自己)?御主：([^｜|【]*)/) || [])[1] || "";
    var prefArr = String(row[COL.PC.PREF] || "").split('、').filter(Boolean);
    var persona = p.words ? String(p.words).replace(/・/g, "、") : prefArr.slice(0, 4).join('、');
    var np = String(row[COL.PC.MARTIAL] || "");
    var speech = rowSpeech || p.speech || "";
    var tic = rowTic || p.tic || "";
    // persona.look 召喚時已複製進 row.TRAIT(parseTraitsHelper)，跟 fp/toM/persona 一樣退回讀列，別讓 p 變空物件時這格靜默消失。
    var look = String(p.look ? looksToTraitParts_(p.look) : (row[COL.PC.TRAIT] || ""));
    var outfit = getOutfit_(mem);              // 👕 玩家換裝：當前服裝穿著(疊在本相上·可清)
    var weapon = getWeapon_(mem);              // ⚔️ 玩家自定武裝：武器/戰鬥方式(蓋過職階慣例/原典習慣·可清)
    var back = String(row[COL.PC.BACK] || "").trim();
    if (back === `${cls}・${name}` || /職階英靈$/.test(back)) back = "";
    var align = String(row[COL.PC.ALIGN] || "").trim();
    if (align === "中立") align = ""; // 中立是通用預設值、無資訊量，略過不顯示
    // 玩家自訂關係稱呼(🏷️關係鈕)：預設值「從者」無資訊量，只在玩家真的改過才顯示。
    var relTag = String(row[COL.PC.REL_TAG] || "").trim();
    if (relTag === "從者" || relTag === "無") relTag = "";
    // 狂化偵測：喪失言語、只咆哮（如赫拉克勒斯、蘭斯洛特）。開膛手傑克等會說話的狂戰士不命中。
    var mad = /狂化|無法言語|僅咆哮|不語/.test(speech + String(fp));
    // 自稱不再自成一欄：尋常的「我」沒有資訊量、直接不提，有特色才併進【口吻】講一次
    // (口吻本身已提過就不重複；狂化者的 fp 是「（狂化·僅咆哮）」這種標記、不是真的自稱，也不提)。
    var fpNote = (fp && fp !== "我" && !mad && !/自稱/.test(speech)) ? `自稱「${fp}」・` : "";
    // 我方從者的態度會隨羈絆走（見 BOND_STANCE_）；敵從者講的是他跟自己御主的關係，不吃你的好感。
    var isMine = String(row[COL.PC.FACTION]) === "從者";
    var stance = isMine ? bondStance_(row[COL.PC.BOND], toM) : (toM || '依真名');
    var foeStance = isMine ? '' : foeStanceNote_(row);   // 敵方：他對【你】的態度（會動，中性時不送）
    var card = `〈${name}·${cls}·核心特質·內化用〉` +
      (persona ? quadLabeled_(persona, PREF_LABELS_, false).replace(/^｜/, '') : `性格：依真名`) +
      (speech || fpNote ? `｜口吻：${fpNote}${speech}` : "") +
      (stance ? `｜${isMine ? '此刻對你' : '對自己御主的態度'}：${stance}` : "") +
      (foeStance ? `｜此刻對你：${foeStance}` : "") +
      (tic && !foe ? `｜小動作：${tic}` : "") +
      (look ? traitLabeled_(look, false) : "") +
      (back ? `｜身世：${back}` : "") +
      (align ? `｜陣營：${align}` : "") +
      (relTag ? `｜對御主的關係稱呼：${relTag}` : "") +
      (outfit ? `｜此刻裝扮：${outfit}` : "") +
      (weapon ? `｜武裝：${weapon}` : "") +
      (np ? `｜寶具「${np}」` : "") + `。\n`;
    if (outfit) card += `★【換裝】現穿「${outfit}」——只換衣服，長相體態仍照本相。\n`;
    if (weapon) card += `★【武裝】戰鬥一律用「${weapon}」，不套職階慣例或原典武器。\n`;
    if (mad) card += `★【狂化】已喪失言語：不說完整句子，只有低吼、咆哮與肢體（旁白仍可寫${pron_(row[COL.PC.SEX])}的情緒）。\n`;
    if (!skipClose) card += performanceNote_([name]);
    return card;
  } catch (e) { return ""; }
}

// 🎭 御主「演出依據」卡（精簡）：讓 AI 知道玩家御主是誰(性別/性格/特徵/願望)，以便 portray 互動。
function masterCard_(row) {
  if (!row) return "";
  try {
    var name = String(row[COL.PC.NAME] || "御主");
    var sex = String(row[COL.PC.SEX] || "");
    var wish = (String(row[COL.PC.MEMORY] || "").match(/【願望】([^｜|【\n]*)/) || [])[1] || "";
    // 過濾掉建角未填的通用預設值(無資訊量)，只顯示真實身世。
    var back = String(row[COL.PC.BACK] || "").trim();
    if (back === "來歷不明的魔術師") back = "";
    // 體術/魔術是能力描述(非願望/個性字面)，不受 show-don't-tell 限制，可直接陳述；
    var melee = getMasterMelee_(row[COL.PC.MEMORY]);
    var magic = getMasterMagic_(row[COL.PC.MEMORY]);
    var magicRank = getMasterMagicRank_(row[COL.PC.MEMORY]);
    var origin = getMasterOrigin_(row[COL.PC.MEMORY]);
    var playedId = getPlayedMaster_(row[COL.PC.MEMORY]);
    var playedCanon = playedId && typeof SEED_MASTERS !== 'undefined' ? SEED_MASTERS.find(m => m && String(m.id) === playedId) : null;
    return `〈御主「${name}」·演出依據〉` + (sex ? `性別${sex}` : "") +
      quadLabeled_(row[COL.PC.PREF], PREF_LABELS_, true) +
      traitLabeled_(row[COL.PC.TRAIT], true) +
      (back ? `｜身世：${back}` : "") +
      (origin ? `｜出身：${origin}` : "") +
      (magic ? `｜魔術系統：${magic}${magicRank ? `(${magicRank}階)` : ""}` : "") +
      (melee ? `｜體術：${melee}階` : "") +
      // ✨ 禮裝一直沒進過任何提示詞——AI 因此只能把御主演成兩手空空的人。只給名字，
      //    它起作用的樣子(flavor)留給真的生效的那一戰講(見 Router_Battle 的【禮裝·】素材行)。
      (() => { const _mc = MYSTIC_CODES[getMystic_(row[COL.PC.MEMORY])]; return _mc ? `｜隨身禮裝：${_mc.name}` : ""; })() +
      (wish ? `｜願望(僅供氛圍、禁直述)：${wish}` : "") +
      `。★上面是御主的【內化用素材】：推演這樣的人【此刻】會做什麼、說什麼，外貌與個性靠當下的舉動流露。御主＝玩家本人(旁白稱「你」)，下一步由玩家決定，收尾停在那裡。` +
      (playedCanon ? `「${name}」出自Fate正典，優先依你對${playedCanon.name}的認知演出，上方僅為錨點。` : "") + `\n`;
  } catch (e) { return ""; }
}

// 🔞 補魔三支共用的尺度指示（solo 僅有的露骨橋段，單一真實來源）。
var LEWD_EXPLICIT_ = '★這一段放到最色，寫滿寫透：器官用本名，體液、聲音、氣味、溫度全部照實寫；'
  + '衣服怎麼被解開、手先碰到哪裡、姿勢怎麼換、進出的節奏怎麼變，一個環節都攤開來寫；'
  + '身體的反應寫具體——發抖、收緊、痙攣、失神，越到後面越失控。鏡頭貼著身體走，慢慢寫。';

// masterCard_ 內嵌的「性別${sex}」只是孤立事實標籤，沒教 AI 該怎麼據此裁定肢體互動，小模型便預設男性插入視角；這裡把配對事實算好直接餵給 AI。
function sealGenderFact_(masterSex, svSex, svName) {
  var mRaw = String(masterSex || ""), sRaw = String(svSex || "");
  var mSex = (mRaw === "男" || mRaw === "女") ? mRaw : "女"; // 異/無 一律按女性向器官處理，對齊全專案既有慣例
  var sSex = (sRaw === "男" || sRaw === "女") ? sRaw : "女";
  var mNote = mRaw === "異" ? "(原始性別標記「異」，肉體機制按女性向處理)" : "";
  var sNote = sRaw === "異" ? "(原始性別標記「異」，肉體機制按女性向處理)" : "";
  if (mSex === "女" && sSex === "女") {
    return `★【性別】御主${mNote}與「${svName}」${sNote}皆為女性。`;
  }
  return `★【性別】御主為${mSex}性${mNote}、「${svName}」為${sSex}性${sNote}。`;
}

// 🎭 敵御主「演出依據」卡（精簡）：戰鬥現場若敵御主本人在場(同地)，讓 AI 依其性格給反應/台詞，別讓對方全程沉默——只塞夠判斷語氣的精簡片段(性格全4項/特徵)，不塞六圍/寶具/全份人設。
function enemyMasterCard_(row, opts) {
  if (!row) return "";
  var skipClose = !!(opts && opts.skipClose);
  try {
    var name = String(row[COL.PC.NAME] || "敵御主");
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
    // 性別：工房原創敵御主的名字看不出性別，AI 只能猜（底下那句 ★ 的代名詞是唯一線索、還埋在最後）。
    //   同時消掉 `〉｜日常表象` 那個開頭就懸空的分隔符。
    var eSex = String(row[COL.PC.SEX] || "").trim();
    return `〈敵御主「${name}」·演出依據〉` + (eSex ? `性別${eSex}` : "") +
      quadLabeled_(row[COL.PC.PREF], PREF_LABELS_, true) +
      traitLabeled_(row[COL.PC.TRAIT], true) +
      (back ? `｜身世(僅內化)：${back.slice(0, 60)}` : "") +
      (align ? `｜陣營：${align}` : "") +
      (magic ? `｜魔術系統：${magic}${magicRank ? `(${magicRank}階)` : ""}` : "") +
      (melee ? `｜體術：${melee}階` : "") +
      (wish ? `｜願望(僅供氛圍、禁直述)：${wish}` : "") +
      ((function () { var fs = foeStanceNote_(row); return fs ? `｜此刻對你：${fs}` : ""; })()) +
      "。" +
      // 三條 ★ 併一條：正典優先與 show-don't-tell 已在 miniSystem 鐵律 8 講過，這裡只留它獨有的兩件事
      //   ——「本人在場、不是背景板」與「別劇透原作後續」。該有什麼情緒由那個人的個性決定，不預先框。
      `★${pron_(row[COL.PC.SEX])}本人在場，依其性格與身世給神態或台詞；勝負與傷害照系統裁定，台詞只講此刻這一戰知道的事。\n`;
  } catch (e) { return ""; }
}

// 🗝️ 取我方從者列索引：指定 wantName 則優先取該名，否則取第一個在世從者（雙從者用）。（全文見 CODE_NOTES.md）
function findPlayerServantIdx_(pcData, gameId, wantName, wantId) {
  var want = String(wantName || "").trim();
  var idx = findPcRowIdx_(pcData, gameId, { id: wantId, name: want || null, faction: "從者", normalize: nameLoose_ });
  if (idx !== -1) return idx;
  return pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
}
