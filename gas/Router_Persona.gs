// ==========================================
// 🎭 Router_Persona.gs — 演出依據卡（2026-07 從 Router_Action.gs 拆出）
//   servantCard_/masterCard_/codexPersona_/findPlayerServantIdx_：跨戰鬥/移動/召喚/羈絆/
//   結盟全域共用的「AI 演出依據」建構器，故獨立成小檔，不歸屬任何單一領域檔。
// ==========================================

function codexPersona_(name) {
  try {
    var hs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('英靈殿');
    if (!hs || hs.getLastRow() <= 1) return {};
    var d = hs.getDataRange().getValues();
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
    var p = codexPersona_(name); // 種子庫的細緻人設（萌點/口吻）
    var fp = p.firstP || (mem.match(/第一人稱「([^」]*)」/) || [])[1] || "我";
    var toM = p.toMaster || (mem.match(/對御主：([^|【]*)/) || [])[1] || "";
    var prefArr = String(row[COL.PC.PREF] || "").split('、').filter(Boolean);
    var persona = p.words || prefArr.slice(0, 4).join('、');
    var np = String(row[COL.PC.MARTIAL] || "");
    // 狂化偵測：喪失言語、只咆哮（如赫拉克勒斯、蘭斯洛特）。開膛手傑克等會說話的狂戰士不命中。
    var mad = /狂化|無法言語|僅咆哮|不語/.test(String(p.speech || "") + String(fp));
    var card = `〈${name}·${cls}·演出依據(僅供內化，禁複述設定字面)〉自稱「${fp}」｜對御主：${toM || '依真名'}｜性格：${persona || '依真名'}` +
      (p.speech ? `｜口吻：${p.speech}` : "") +
      (p.moe ? `｜萌點：${p.moe}` : "") +
      (p.tic ? `｜小動作：${p.tic}` : "") +
      (np ? `｜寶具「${np}」` : "") + `。\n`;
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
      `。御主＝玩家所扮演的角色：【可】依其性格/身世自然開口、有神態反應與台詞，讓角色鮮活有聲(別只當沉默旁觀者)；但【不可】替御主拍板下一步戰略抉擇(是否出戰/結盟/移動/補魔由玩家按鍵定奪)、不可逼問玩家要做什麼、不可把劇情快轉越過決策點。\n`;
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
