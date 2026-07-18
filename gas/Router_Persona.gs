// ==========================================
// 🎭 Router_Persona.gs — 演出依據卡：跨戰鬥/移動/召喚/羈絆/結盟全域共用的「AI 演出依據」建構器。
// ==========================================

// 召喚時已把種子口吻/小動作複製進眾生列 MEMORY，平常直接讀列不必查英靈殿；查無(舊局/AI原創從者/
// 鑑賞封存重建)時回 ""，servantCard_ 才退回 codexPersona_ 查表(6h 快取)。
function getPersonaSpeech_(memory) { var m = String(memory || "").match(/【口吻】([^｜|【]*)/); return m ? m[1].trim() : ""; }
function getPersonaTic_(memory) { var m = String(memory || "").match(/【小動作】([^｜|【]*)/); return m ? m[1].trim() : ""; }
// 把種子的口吻/小動作附加到既有 MEMORY 字串尾端(召喚建列時呼叫，僅在有值時才附加)。
function stampPersonaFlavor_(memory, speech, tic) {
  var s = String(memory || "");
  if (speech) s = (s ? s + "｜" : "") + "【口吻】" + String(speech).slice(0, 40);
  if (tic) s = (s ? s + "｜" : "") + "【小動作】" + String(tic).slice(0, 30);
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
// skipNone=true 時該格若為空或字面「無」直接跳過不顯示(給御主卡/敵御主卡沿用既有的無資料防呆)；
// false 時保留全部4格(給 servantCard_ 用，段數不足時仍顯示「無」，不靜默漏项)。
function quadLabeled_(raw, labels, skipNone) {
  var parts = String(raw || "").split('、');
  var out = "";
  for (var i = 0; i < labels.length; i++) {
    var v = (parts[i] || "").trim();
    if (skipNone && (!v || v === "無")) continue;
    out += `｜${labels[i]}：${v || "無"}`;
  }
  return out;
}

// 🎭 從者「演出依據」卡：真名/職階/第一人稱/個性/對御主/口吻/萌點/招牌動作/六圍/技能/寶具
//   壓成一段塞進 narration 提示詞，讓 AI 依『我們定義的角色』內化演出（只當背景、不准說嘴）。
function servantCard_(row) {
  if (!row) return "";
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
    // servantCard_ 是我方/敵/盟友從者共用同一份卡，「對御主：X」在敵/盟友從者身上易被誤讀成「對玩家忠誠」，
    // 故欄位加「自己」二字消歧義（對自己御主的忠誠態度，而非對玩家）。
    var toM = p.toMaster || (mem.match(/對(?:自己)?御主：([^｜|【]*)/) || [])[1] || "";
    var prefArr = String(row[COL.PC.PREF] || "").split('、').filter(Boolean);
    // p.words 是種子原始格式(段落用「・」分隔)，quadLabeled_ 只切「、」——跟召喚寫列時
    //   (Router_Creation.gs)同款先把「・」正規化成「、」，否則多段個性會擠成一格、後面格數錯位。
    var persona = p.words ? String(p.words).replace(/・/g, "、") : prefArr.slice(0, 4).join('、');
    var np = String(row[COL.PC.MARTIAL] || "");
    var speech = rowSpeech || p.speech || "";
    var moe = rowMoe || p.moe || "";
    var tic = rowTic || p.tic || "";
    // persona.look 召喚時已複製進 row.TRAIT(parseTraitsHelper)，跟 fp/toM/persona 一樣退回讀列，
    //   別讓 p 變空物件時這格靜默消失。p.look 是種子原始格式(「N段外貌・・、末段氣質」)，得先過
    //   looksToTraitParts_ 轉成 4 格慣例(跟 row.TRAIT 寫入時同一條處理管線)，否則 quadLabeled_
    //   直接切「、」會漏接「自稱」「私密一面」兩格、氣質也可能跟外貌擠在一起。
    var look = String(p.look ? looksToTraitParts_(p.look, p.firstP || fp) : (row[COL.PC.TRAIT] || ""));
    var outfit = getOutfit_(mem);              // 👗 玩家換裝：當前服裝穿著(疊在本相上·可清)
    var weapon = getWeapon_(mem);              // ⚔️ 玩家自定武裝：武器/戰鬥方式(蓋過職階慣例/原典習慣·可清)
    // 過濾掉召喚時的無資訊量 fallback(`${cls}・${realName}`，跟卡頭〈${name}·${cls}〉逐字重複)，
    //   只顯示真身世(玩家寫的原創英靈/AI補的身世)。
    var back = String(row[COL.PC.BACK] || "").trim();
    if (back === `${cls}・${name}`) back = "";
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
    var card = `〈${name}·${cls}·演出依據(僅供內化，禁複述設定字面)〉此角色台詞內自稱「${fp}」(僅限她/他自己的引號台詞，敘事旁白的「我」永遠是玩家本人、與此無關)｜對自己御主的態度：${toM || '依真名'}` +
      (persona ? quadLabeled_(persona, PREF_LABELS_, false) : `｜性格：依真名`) +
      (speech ? `｜口吻：${speech}` : "") +
      (moe ? `｜萌點：${moe}` : "") +
      (tic ? `｜小動作：${tic}` : "") +
      (look ? quadLabeled_(look, TRAIT_LABELS_, false) : "") +
      (back ? `｜身世：${back}` : "") +
      (align ? `｜陣營：${align}` : "") +
      (relTag ? `｜對御主的關係稱呼：${relTag}` : "") +
      (outfit ? `｜此刻裝扮：${outfit}` : "") +
      (weapon ? `｜武裝：${weapon}` : "") +
      (np ? `｜寶具「${np}」` : "") + `。\n`;
    if (outfit) card += `★【換裝】此從者當前穿著＝「${outfit}」：以此為現下服裝入畫，但五官/髮色/體態/氣質仍嚴格依「外貌本相」——換衣不換人，不得改其相貌或身分。\n`;
    if (weapon) card += `★【武裝·絕對】此從者的武器與戰鬥方式＝「${weapon}」：一切攻防演出以此為準——【禁】依職階慣例(Saber=劍、Lancer=槍…)或該真名在原典/傳說中的武器習慣改寫；就算你認得這個名字，本作此人用的就是「${weapon}」。\n`;
    if (mad) card += `★【狂化·絕對】此從者已狂化、喪失言語：【嚴禁】說出任何完整句子或台詞，只能以低吼、咆哮、肢體與本能反應表達（旁白可寫其情緒，但他不開口）。\n`;
    card += `★依「${name}」真名與上述性格/口吻演出（show, don't tell）：用言行神態自然流露，【禁】把性格詞/萌點/六圍/技能/寶具名當台詞或由旁白點破。若認得此真名出自Fate正典，身世底蘊優先依你自己對該英靈的認識自然帶出，不受限於上方身世短句(那只是輔助錨點，非全貌)。依羈絆高低調親疏：低→保留戒備矜持、高→漸親近，守住性格內核、未深不越界倒貼。\n`;
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
    // 🐛→✅ 「扮演正典御主」入口存在的意義就是讓AI認得這個真名、調用原作形象——但這支卡
    //   從沒讀過getPlayedMaster_，玩家選了扮演卻等於沒選。servantCard_/enemyMasterCard_
    //   都有對應的「若認得此真名出自Fate正典…」提示，這裡補齊同款。
    var playedId = getPlayedMaster_(row[COL.PC.MEMORY]);
    var playedCanon = playedId && typeof SEED_MASTERS !== 'undefined' ? SEED_MASTERS.find(m => m && String(m.id) === playedId) : null;
    return `〈御主「${name}」·演出依據(僅內化、禁複述)〉` + (sex ? `性別${sex}` : "") +
      quadLabeled_(row[COL.PC.PREF], PREF_LABELS_, true) +
      quadLabeled_(row[COL.PC.TRAIT], TRAIT_LABELS_, true) +
      (moe && moe !== "（待揭曉）" ? `｜萌點(反差·僅供內化)：${moe}` : "") +
      (back ? `｜身世：${back}` : "") +
      (magic ? `｜魔術系統：${magic}${magicRank ? `(${magicRank}階)` : ""}` : "") +
      (melee ? `｜體術：${melee}階` : "") +
      (wish ? `｜願望(僅供氛圍、禁直述)：${wish}` : "") +
      `。御主＝玩家所扮演的角色：【可】依其性格/身世自然開口、有神態反應與台詞，讓角色鮮活有聲(別只當沉默旁觀者，show, don't tell：禁把性格詞/特徵/萌點當台詞或由旁白點破)；從者可開口問御主接下來怎麼辦，御主(我)也可以自問該如何是好——但【不可】替御主拍板下一步戰略抉擇(是否出戰/結盟/移動/補魔由玩家按鍵定奪)，停在問句/思索即可，不可自己接著演出答案，也不可把劇情快轉越過決策點。` +
      (playedCanon ? `若認得「${name}」出自Fate正典，優先調用你自己對該御主(${playedCanon.name})的認識來演出其言行反應，上方設定僅為輔助錨點。` : "") + `\n`;
  } catch (e) { return ""; }
}

// masterCard_ 內嵌的「性別${sex}」只是孤立事實標籤，沒教 AI 該怎麼據此裁定肢體互動，小模型便預設
//   男性插入視角；這裡把配對事實算好直接餵給 AI。與 kanshou Gallery.gs 的 genderHintStr 邏輯類似
//   但完全獨立、不共用(solo/kanshou 機制須徹底隔離，CLAUDE.md 紅線①)。
function sealGenderFact_(masterSex, svSex, svName) {
  var mSex = (masterSex === "男" || masterSex === "女") ? masterSex : "女"; // 異/無 一律按女性向器官處理，對齊全專案既有慣例
  var sSex = (svSex === "男" || svSex === "女") ? svSex : "女";
  if (mSex === "女" && sSex === "女") {
    return `★【性別配對·務必依此裁定肢體互動】御主與「${svName}」皆為女性——純女女之愛，【禁】描寫插入式陽具動作(如「進入她」)，改以手指/舌尖/器物等方式互動，雙方皆可主動索求，沒有固定的「插入方」。`;
  }
  return `★【性別配對·務必依此裁定肢體互動】御主為${mSex}性、「${svName}」為${sSex}性——一切肢體互動必須依雙方各自實際性別自然合理呈現，【禁】預設或錯置任一方的性別角色(如御主明明是女性卻被寫成男性插入視角)。`;
}

// 🎭 敵御主「演出依據」卡（精簡）：戰鬥現場若敵御主本人在場(同地)，讓 AI 依其性格給反應/台詞，
//   別讓對方全程沉默——只塞夠判斷語氣與反差的精簡片段(性格全4項/特徵/萌點)，不塞六圍/寶具/全份人設。
//   跟 masterCard_ 不同：這是 NPC、AI 可自行決定其言行反應，不受「不可替玩家做決定」那條限制。
function enemyMasterCard_(row) {
  if (!row) return "";
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
      (moe ? `｜萌點(反差·僅供內化)：${moe}` : "") +
      (back ? `｜身世(僅內化)：${back.slice(0, 60)}` : "") +
      (align ? `｜陣營：${align}` : "") +
      (magic ? `｜魔術系統：${magic}${magicRank ? `(${magicRank}階)` : ""}` : "") +
      (melee ? `｜體術：${melee}階` : "") +
      (wish ? `｜願望(僅供氛圍、禁直述)：${wish}` : "") +
      `。★若此人為 Fate 正典人物，優先調用你對其原作形象的完整認知來演出——上述設定僅為錨點提醒、並非其全部；非正典的原創人物才嚴格依上述設定。【禁】預告或影射其原作後續結局與未揭露的身分。\n` +
      `★此役敵御主本人在場，依其性格/身世與萌點反差給出神態反應或台詞(show, don't tell：別把萌點/性格詞當台詞或由旁白點破)——非沉默背景板，但戰局勝負與傷害不可改。\n`;
  } catch (e) { return ""; }
}

// 🗝️ 取我方從者列索引：指定 wantName 則優先取該名，否則取第一個在世從者（雙從者用）
function findPlayerServantIdx_(pcData, gameId, wantName) {
  var want = String(wantName || "").trim();
  if (want) {
    var i = pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_") && String(r[COL.PC.NAME]).includes(want));
    if (i !== -1) return i;
  }
  return pcData.findIndex(r => String(r[COL.PC.FACTION]) === "從者" && String(r[COL.PC.GAME_ID] || "") === gameId && !String(r[COL.PC.ID]).startsWith("DEAD_"));
}

// 🔋 設定從者靈基出力檔位（20/40/60/80/100）：玩家旋鈕，存從者 MEMORY【出力】。免費、即時，不耗 AP。
//   高檔＝戰力強但御主每小時維持費高；100%＝唯一能解放寶具的檔。決定戰鬥表現與御主魔力消耗速度。
