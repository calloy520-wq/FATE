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
    var toM = p.toMaster || (mem.match(/對御主：([^|【]*)/) || [])[1] || "";
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
    // 狂化偵測：喪失言語、只咆哮（如赫拉克勒斯、蘭斯洛特）。開膛手傑克等會說話的狂戰士不命中。
    var mad = /狂化|無法言語|僅咆哮|不語/.test(speech + String(fp));
    var card = `〈${name}·${cls}·演出依據(僅供內化，禁複述設定字面)〉自稱「${fp}」｜對御主：${toM || '依真名'}｜性格：${persona || '依真名'}` +
      (speech ? `｜口吻：${speech}` : "") +
      (moe ? `｜萌點：${moe}` : "") +
      (tic ? `｜小動作：${tic}` : "") +
      (look ? `｜外貌本相：${look}` : "") +
      (outfit ? `｜此刻裝扮：${outfit}` : "") +
      (np ? `｜寶具「${np}」` : "") + `。\n`;
    if (outfit) card += `★【換裝】此從者當前穿著＝「${outfit}」：以此為現下服裝入畫，但五官/髮色/體態/氣質仍嚴格依「外貌本相」——換衣不換人，不得改其相貌或身分。\n`;
    if (mad) card += `★【狂化·絕對】此從者已狂化、喪失言語：【嚴禁】說出任何完整句子或台詞，只能以低吼、咆哮、肢體與本能反應表達（旁白可寫其情緒，但他不開口）。\n`;
    card += `★依「${name}」真名與上述性格/口吻演出（show, don't tell）：用言行神態自然流露，【禁】把性格詞/萌點/六圍/技能/寶具名當台詞或由旁白點破。依羈絆高低調親疏：低→保留戒備矜持、高→漸親近，守住性格內核、未深不越界倒貼。\n`;
    return card;
  } catch (e) { return ""; }
}

// 🎭 御主「演出依據」卡（精簡）：讓 AI 知道玩家御主是誰(性別/性格/特徵/願望)，以便 portray 互動。
//   ★只供內化、禁複述；願望僅供氛圍不直述；【可】依性格給御主台詞/反應(讓角色有聲)，但【不替御主拍板戰略抉擇】。
function masterCard_(row) {
  if (!row) return "";
  try {
    var name = String(row[COL.PC.NAME] || "御主");
    var sex = String(row[COL.PC.SEX] || "");
    var prefArr = String(row[COL.PC.PREF] || "").split('、').filter(function (x) { return x && x !== "無"; });
    var traitArr = String(row[COL.PC.TRAIT] || "").split('、').filter(function (x) { return x && x !== "無"; });
    var wish = (String(row[COL.PC.MEMORY] || "").match(/【願望】([^｜|【\n]*)/) || [])[1] || "";
    return `〈御主「${name}」·演出依據(僅內化、禁複述)〉` + (sex ? `性別${sex}` : "") +
      (prefArr.length ? `｜性格：${prefArr.slice(0, 4).join('、')}` : "") +
      (traitArr.length ? `｜特徵：${traitArr.slice(0, 4).join('、')}` : "") +
      (wish ? `｜願望(僅供氛圍、禁直述)：${wish}` : "") +
      `。御主＝玩家所扮演的角色：【可】依其性格/身世自然開口、有神態反應與台詞，讓角色鮮活有聲(別只當沉默旁觀者)；從者可開口問御主接下來怎麼辦，御主(我)也可以自問該如何是好——但【不可】替御主拍板下一步戰略抉擇(是否出戰/結盟/移動/補魔由玩家按鍵定奪)，停在問句/思索即可，不可自己接著演出答案，也不可把劇情快轉越過決策點。\n`;
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
    var prefArr = String(row[COL.PC.PREF] || "").split('、').filter(function (x) { return x && x !== "無"; });
    var traitArr = String(row[COL.PC.TRAIT] || "").split('、').filter(function (x) { return x && x !== "無"; });
    var moe = String(row[COL.PC.INTENT] || "").trim();
    return `〈敵御主「${name}」·演出依據(僅內化、禁複述)〉` +
      (prefArr.length ? `性格：${prefArr.slice(0, 4).join('、')}` : "") +
      (traitArr.length ? `｜特徵：${traitArr.slice(0, 3).join('、')}` : "") +
      (moe ? `｜萌點(反差·僅供內化)：${moe}` : "") +
      `。★此役敵御主本人在場，依其性格與萌點反差自行決定是否開口、有何神態反應(show, don't tell：別把萌點/性格詞當台詞或由旁白點破)——非沉默背景板，但戰局勝負與傷害不可改。\n`;
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
