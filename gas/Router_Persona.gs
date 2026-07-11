// ==========================================
// 🎭 Router_Persona.gs — 演出依據卡（2026-07 從 Router_Action.gs 拆出）
//   servantCard_/masterCard_/codexPersona_/findPlayerServantIdx_：跨戰鬥/移動/召喚/羈絆/
//   結盟全域共用的「AI 演出依據」建構器，故獨立成小檔，不歸屬任何單一領域檔。
// ==========================================

// 🎭 種子人設細節(口吻/小動作)：召喚當下已從英靈殿複製進眾生列自己的 MEMORY(見 Router_Creation.gs/
//   Seed_Rivals.gs 的 stampPersonaFlavor_ 呼叫點)，讓 servantCard_ 平常直接讀列、不必再查英靈殿。
//   查無(舊局/AI原創從者原本就沒有這兩項/鑑賞封存後重建的同伴列) 時回 ""，servantCard_ 才退回
//   codexPersona_ 的即時查表(已走 6h 快取，成本低，僅作為過渡期安全網)。
function getPersonaSpeech_(memory) { var m = String(memory || "").match(/【口吻】([^｜|【]*)/); return m ? m[1].trim() : ""; }
function getPersonaTic_(memory) { var m = String(memory || "").match(/【小動作】([^｜|【]*)/); return m ? m[1].trim() : ""; }
// 把種子的口吻/小動作附加到既有 MEMORY 字串尾端(召喚建列時呼叫，僅在有值時才附加)。
function stampPersonaFlavor_(memory, speech, tic) {
  var s = String(memory || "");
  if (speech) s = (s ? s + "｜" : "") + "【口吻】" + String(speech).slice(0, 40);
  if (tic) s = (s ? s + "｜" : "") + "【小動作】" + String(tic).slice(0, 30);
  return s;
}

function codexPersona_(name) {
  try {
    var d = getHeroCodexCached();
    if (!d.length) return {};
    var nm = String(name || "").trim();
    if (!nm) return {};
    for (var i = 1; i < d.length; i++) {
      var hn = String(d[i][COL.HERO.NAME]).trim();
      if (hn === nm || hn.indexOf(nm) >= 0 || nm.indexOf(hn) >= 0) {
        try { return JSON.parse(d[i][COL.HERO.PERSONA] || "{}"); } catch (e) { return {}; }
      }
    }
  } catch (e) { }
  return {};
}

// 🏷️ 2026-07 玩家問「AI讀取資料時候能知道這10項資料各字代表什麼嗎？」查證：不能——PREF/TRAIT
//   內部雖然是[表象/內裡/喜歡/討厭]、[外貌/氣質舉止/自稱與口氣/私密一面]四段慣例存的，但過去三個
//   演出卡(servantCard_/masterCard_/enemyMasterCard_)一律把4段黏成一串塞給AI、只掛一個外層標籤
//   (性格：/特徵：)，AI看不出哪句是喜歡、哪句是私密一面。玩家定案「要拆分」：逐格加標籤餵給AI。
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
    var p = (rowSpeech && rowTic && rowMoe) ? {} : codexPersona_(name);
    var fp = p.firstP || (mem.match(/第一人稱「([^」]*)」/) || [])[1] || "我";
    // 🐛→✅ 2026-07 稽核抓到同一類bug(見Router_Bond.gs的getBondUsedToday_同批修正)：排除字元集
    //   漏了全形｜(只排除半形|)，導致MEMORY欄若在「對御主：...」後面接了其他全形｜分隔的標記，
    //   會把那個｜也一併吃進捕獲值——結果是尾巴多一個雜訊字元被塞進servantCard_的AI提示詞裡
    //   (純文字污染，不影響資料寫入或遊戲邏輯，但改成跟其他get函式一致的`[^｜【]`。
    // 🐛→✅ 2026-07 第四輪稽核再抓到：排除字元集只排了`｜【`，跟同檔`getPersonaSpeech_`/`getPersonaTic_`
    //   (11-12行)一致用`｜|【`(兩種pipe都排)不一致——目前全代碼庫沒有任何MEMORY寫入者用過半形`|`，
    //   兩種寫法現況行為相同，純粹補上這道保險，跟同檔慣例對齊。
    // 🐛→✅ 2026-07 玩家反映鑑賞「關係」標籤方向不明確的bug後，要求「整個solo再確認一次」查出的
    //   同類根因：servantCard_ 是通用卡，我方從者/敵從者/盟友從者共用同一份，toM(對御主的忠誠態度
    //   flavor text，如「絕對忠誠，渴望堂堂正正之戰」)套在敵/盟友從者身上時，字面「對御主：X」跟
    //   Router_Narrative.gs miniSystem 每回合開頭明講的「玩家＝御主」放在一起，容易被誤讀成「對玩家
    //   忠誠」而非「對TA自己的（敵方）御主忠誠」——尤其 Router_Bond.gs 兩處(結盟提議/盟友相伴)完全
    //   沒有任何前置標籤即直接餵這張卡，risk最高。改法：欄位本身加「自己」二字消歧義，一次修好全部
    //   呼叫端(戰鬥/移動/結盟/羈絆/補魔/工房等)，不必逐一補標籤。
    var toM = p.toMaster || (mem.match(/對(?:自己)?御主：([^｜|【]*)/) || [])[1] || "";
    var prefArr = String(row[COL.PC.PREF] || "").split('、').filter(Boolean);
    var persona = p.words || prefArr.slice(0, 4).join('、');
    var np = String(row[COL.PC.MARTIAL] || "");
    var speech = rowSpeech || p.speech || "";
    var moe = rowMoe || p.moe || "";
    var tic = rowTic || p.tic || "";
    // 種子外貌本相：五官/髮色/體態/氣質(不變的本人特徵)——persona.look 召喚時已複製進 row.TRAIT(parseTraitsHelper)，
    //   跟 fp/toM/persona 一樣退回讀列，別讓 p 變空物件時這格靜默消失。
    var look = String(p.look || row[COL.PC.TRAIT] || "");
    var outfit = getOutfit_(mem);              // 👗 玩家換裝：當前服裝穿著(疊在本相上·可清)
    var weapon = getWeapon_(mem);              // ⚔️ 玩家自定武裝：武器/戰鬥方式(蓋過職階慣例/原典習慣·可清)
    // 🧪 2026-07 玩家提案「身世先輕量對接」：此卡原本完全沒讀 BACK——身世輕量掛上，但過濾掉
    //   召喚時的資訊量為零的 fallback(`${cls}・${realName}`，如「Saber・阿爾托莉雅」，跟卡頭
    //   〈${name}·${cls}〉逐字重複)，塞進去只是白佔token。真身世(玩家寫的原創英靈/AI補的身世)才顯示。
    var back = String(row[COL.PC.BACK] || "").trim();
    if (back === `${cls}・${name}`) back = "";
    // 狂化偵測：喪失言語、只咆哮（如赫拉克勒斯、蘭斯洛特）。開膛手傑克等會說話的狂戰士不命中。
    var mad = /狂化|無法言語|僅咆哮|不語/.test(speech + String(fp));
    // 🐛→✅ 2026-07 玩家反映「AI有時候會把對面角色的『我』當成敘事視角」：查證發現多數角色 fp
    //   (第一人稱/自稱)預設值就是「我」(未特別設定的從者一律 fallback「我」，見上方 var fp)——
    //   卡片原字面「自稱「我」」跟「敘事視角＝玩家的『我』」是同一個字，長提示詞中段容易讓小模型
    //   (flash-lite)混淆兩者，寫著寫著就把這名角色的心境當成旁白第一人稱。改成明確限定「僅此角色
    //   自己台詞內」，不再是一個懸空的「自稱」標籤。
    var card = `〈${name}·${cls}·演出依據(僅供內化，禁複述設定字面)〉此角色台詞內自稱「${fp}」(僅限她/他自己的引號台詞，敘事旁白的「我」永遠是玩家本人、與此無關)｜對自己御主的態度：${toM || '依真名'}` +
      (persona ? quadLabeled_(persona, PREF_LABELS_, false) : `｜性格：依真名`) +
      (speech ? `｜口吻：${speech}` : "") +
      (moe ? `｜萌點：${moe}` : "") +
      (tic ? `｜小動作：${tic}` : "") +
      (look ? quadLabeled_(look, TRAIT_LABELS_, false) : "") +
      (back ? `｜身世：${back}` : "") +
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
// ⚠ 2026-07 修：原本完全沒讀 COL.PC.INTENT(萌點)——actionBackfillMasterAi 明明有請 AI 生成
//   「結合此御主身分性格的獨特可愛反差萌」寫回這欄(Router_Creation.gs)，卡片卻從沒讀過，跟
//   enemyMasterCard_ 修復前一樣的疏漏：御主容易被演成套路化的「魔術師」而非設計好的反差角色。
function masterCard_(row) {
  if (!row) return "";
  try {
    var name = String(row[COL.PC.NAME] || "御主");
    var sex = String(row[COL.PC.SEX] || "");
    var moe = String(row[COL.PC.INTENT] || "").trim();
    var wish = (String(row[COL.PC.MEMORY] || "").match(/【願望】([^｜|【\n]*)/) || [])[1] || "";
    // 🧪 2026-07 玩家提案「身世先輕量對接」：此卡指令文字原本就寫著「依其性格/身世自然開口」，
    //   卻從沒把 COL.PC.BACK 的實際內容塞進卡片——嘴上提了身世、資料沒真的餵給AI。輕量補上，
    //   過濾掉建角未填的通用預設值(塞了無資訊量)。
    var back = String(row[COL.PC.BACK] || "").trim();
    if (back === "來歷不明的魔術師") back = "";
    // 🥋 2026-07 補：體術/魔術系統是能力描述(非願望/個性/萌點字面)，不受show-don't-tell限制，可直接陳述。
    var melee = getMasterMelee_(row[COL.PC.MEMORY]);
    var magic = getMasterMagic_(row[COL.PC.MEMORY]);
    return `〈御主「${name}」·演出依據(僅內化、禁複述)〉` + (sex ? `性別${sex}` : "") +
      quadLabeled_(row[COL.PC.PREF], PREF_LABELS_, true) +
      quadLabeled_(row[COL.PC.TRAIT], TRAIT_LABELS_, true) +
      (moe && moe !== "（待揭曉）" ? `｜萌點(反差·僅供內化)：${moe}` : "") +
      (back ? `｜身世：${back}` : "") +
      (magic ? `｜魔術系統：${magic}` : "") +
      (melee ? `｜體術：${melee}階` : "") +
      (wish ? `｜願望(僅供氛圍、禁直述)：${wish}` : "") +
      `。御主＝玩家所扮演的角色：【可】依其性格/身世自然開口、有神態反應與台詞，讓角色鮮活有聲(別只當沉默旁觀者，show, don't tell：禁把性格詞/特徵/萌點當台詞或由旁白點破)；從者可開口問御主接下來怎麼辦，御主(我)也可以自問該如何是好——但【不可】替御主拍板下一步戰略抉擇(是否出戰/結盟/移動/補魔由玩家按鍵定奪)，停在問句/思索即可，不可自己接著演出答案，也不可把劇情快轉越過決策點。\n`;
  } catch (e) { return ""; }
}

// 🎭 敵御主「演出依據」卡（精簡）：戰鬥現場若敵御主本人在場(同地)，讓 AI 依其性格給反應/台詞，
//   別讓對方全程沉默——只塞夠判斷語氣與反差的精簡片段(性格全4項/特徵/萌點)，不塞六圍/寶具/全份人設。
//   跟 masterCard_ 不同：這是 NPC、AI 可自行決定其言行反應，不受「不可替玩家做決定」那條限制。
// ⚠ 2026-07 修：原本沒讀 INTENT(萌點)——敵御主(如伊莉雅)只吃到光禿禿的性格詞，沒有「反差萌點」
//   撐住 show-don't-tell，AI 沒別的錨點時就會滑向類型套路(如「冷眼旁觀殺戮」)而非角色本來的反差設計；
//   性格也從 slice(0,3) 補回 slice(0,4)(原本會漏掉「厭惡」那格，那格常常正是理解反差的關鍵)。
function enemyMasterCard_(row) {
  if (!row) return "";
  try {
    var name = String(row[COL.PC.NAME] || "敵御主");
    var moe = String(row[COL.PC.INTENT] || "").trim();
    // 🎭 2026-07 補：身世＋願望原本不進卡(伊莉雅沉默案根因之一)——性格詞光禿禿沒有情感錨點，
    //   AI 沒別的依據就滑向類型套路(如「天真殘忍冷眼旁觀」)。BACK 欄格式＝「身世。外貌：…」
    //   (masterToNpcRow_)，外貌已由 TRAIT 欄呈現，這裡只取「。外貌：」前的身世段，避免逐字重複。
    var back = String(row[COL.PC.BACK] || "").split("。外貌：")[0].trim();
    if (back === "魔術師") back = ""; // masterToNpcRow_ 的無資料預設值，塞卡無資訊量
    var wish = (String(row[COL.PC.MEMORY] || "").match(/【願望】([^｜|【\n]*)/) || [])[1] || "";
    // 🥋 2026-07 補：體術/魔術系統是能力描述，不受show-don't-tell限制，可直接陳述。
    var melee = getMasterMelee_(row[COL.PC.MEMORY]);
    var magic = getMasterMagic_(row[COL.PC.MEMORY]);
    return `〈敵御主「${name}」·演出依據(僅內化、禁複述)〉` +
      quadLabeled_(row[COL.PC.PREF], PREF_LABELS_, true) +
      quadLabeled_(row[COL.PC.TRAIT], TRAIT_LABELS_, true) +
      (moe ? `｜萌點(反差·僅供內化)：${moe}` : "") +
      (back ? `｜身世(僅內化)：${back.slice(0, 60)}` : "") +
      (magic ? `｜魔術系統：${magic}` : "") +
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
