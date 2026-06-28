// ==========================================
// 🔵 Seed_Rivals.gs — 開局把六組敵方御主×從者鋪進玩家自己的 game_id 世界
//   敵御主 FACTION='敵御主'、敵從者 FACTION='敵從者'（與玩家自己的「從者」區分，
//   才不會被 get_tags / fate_battle 誤認成玩家的從者）。
// ==========================================

function safeJson_(s, dflt) { try { return JSON.parse(s || ""); } catch (e) { return dflt; } }

// 🔵 戰爭迷霧：玩家當前所在若有未偵查的敵御主/敵從者，標記為「已偵查」(地圖才會點亮)
function markRivalsSeen_(sheets, pcId) {
  try {
    const data = sheets.pc.getDataRange().getValues();
    const me = data.find(r => r[COL.PC.ID] == pcId);
    if (!me) return;
    const myGameId = String(me[COL.PC.GAME_ID] || "");
    const myLoc = String(me[COL.PC.LOC] || "").trim();
    if (!myLoc) return;
    for (var i = 1; i < data.length; i++) {
      var r = data[i], fac = String(r[COL.PC.FACTION]);
      if (fac !== "敵御主" && fac !== "敵從者") continue;
      if (String(r[COL.PC.GAME_ID] || "") !== myGameId) continue;
      if (String(r[COL.PC.LOC] || "").trim() !== myLoc) continue;
      if (r[COL.PC.SEEN]) continue;
      sheets.pc.getRange(i + 1, COL.PC.SEEN + 1).setValue(1);
    }
  } catch (e) { }
}

// 第五次聖杯戰爭正典陣容（master_id, hero_id, 冬木落點）
var FATE_5TH_ROSTER = [
  { master: '衛宮士郎-5th', hero: '阿爾托莉雅-Saber', loc: '冬木·深山町' },
  { master: '遠坂凜-5th', hero: 'EMIYA-Archer', loc: '遠坂宅' },
  { master: '間桐慎二-5th', hero: '美杜莎-Rider', loc: '間桐宅' },
  { master: '言峰綺禮-5th', hero: '庫丘林-Lancer', loc: '言峰教會' },
  { master: '葛木宗一郎-5th', hero: '美狄亞-Caster', loc: '柳洞寺' },
  { master: '伊莉雅絲菲爾-5th', hero: '赫拉克勒斯-Berserker', loc: '冬木·新都' }
];

// 第四次聖杯戰爭正典陣容（Fate/Zero）
var FATE_4TH_ROSTER = [
  { master: '衛宮切嗣-4th', hero: '阿爾托莉雅-Saber', loc: '冬木·深山町' },
  { master: '遠坂時臣-4th', hero: '吉爾伽美什-Archer', loc: '遠坂宅' },
  { master: '肯尼斯-4th', hero: '迪盧木多-Lancer', loc: '冬木·新都' },
  { master: '韋伯·維爾維特-4th', hero: '伊斯坎達爾-Rider', loc: '冬木·商店街' },
  { master: '雨生龍之介-4th', hero: '吉爾德萊-Caster', loc: '未遠川河畔' },
  { master: '言峰綺禮-4th', hero: '百貌哈桑-Assassin', loc: '言峰教會' },
  { master: '間桐雁夜-4th', hero: '蘭斯洛特-Berserker', loc: '間桐宅' }
];

// 偽聖杯戰爭（Fate/strange Fake）：正典從者 ＋ 雪原匿名御主（御主殿無資料，直接合成）
var FATE_FAKE_ROSTER = [
  { master: '提奈·切爾克', hero: '吉爾伽美什-Archer', loc: '冬木·新都' },
  { master: '巴茲狄洛特', hero: '恩奇都-Lancer', loc: '未遠川河畔' },
  { master: '歐蘭多·里夫', hero: '理查一世-Saber', loc: '冬木·深山町' },
  { master: '約翰·溫加德', hero: '阿基里斯-Rider', loc: '冬木·商店街' },
  { master: '哈魯利', hero: '大仲馬-Caster', loc: '遠坂宅' },
  { master: '繰丘椿', hero: '開膛手傑克-Berserker', loc: '間桐宅' },
  { master: '漢薩·塞爾旺帝斯', hero: '靜謐的哈桑-Assassin', loc: '言峰教會' }
];

// 合成一名匿名御主列（偽聖杯／無正典御主資料時用）
function fakeMasterRow_(name, gameId, loc) {
  var row = Array(Object.keys(COL.PC).length).fill("");
  row[COL.PC.ID] = "NPC_" + Date.now() + "_f" + Math.floor(Math.random() * 100000);
  row[COL.PC.NAME] = name;
  row[COL.PC.SEX] = "異";
  row[COL.PC.BACK] = "捲入偽聖杯戰爭的魔術師";
  row[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "平靜" });
  row[COL.PC.TRAIT] = parseTraitsHelper("", "外貌平凡、舉止從容、通曉魔術、深藏心事");
  row[COL.PC.LOC] = loc;
  row[COL.PC.PREF] = parseTraitsHelper("", "沉著表象、堅定內裡、珍視之物、厭惡之事");
  row[COL.PC.HP] = 120; row[COL.PC.MP] = 80;
  row[COL.PC.STR] = 12; row[COL.PC.CON] = 12; row[COL.PC.AGI] = 12; row[COL.PC.INT] = 18; row[COL.PC.LUK] = 12;
  row[COL.PC.MAX_HP] = 120; row[COL.PC.MAX_MP] = 80; row[COL.PC.REALM] = "凡人";
  row[COL.PC.FACTION] = "敵御主"; row[COL.PC.RANK] = "御主";
  row[COL.PC.MEMORY] = "【偽聖杯】雪原的參戰魔術師。";
  row[COL.PC.GAME_ID] = gameId;
  return row;
}

// 英靈殿列 → 眾生(NPC)列
function heroToNpcRow_(hero, gameId, loc, faction) {
  var six = safeJson_(hero[COL.HERO.SIX], {});
  var classSkills = safeJson_(hero[COL.HERO.CLASS_SKILLS], []);
  var skills = safeJson_(hero[COL.HERO.SKILLS], []);
  var traits = safeJson_(hero[COL.HERO.TRAITS], []);
  var persona = safeJson_(hero[COL.HERO.PERSONA], {});
  var cls = hero[COL.HERO.CLS];
  var nStr = svNum_(six["筋力"]), nCon = svNum_(six["耐久"]), nAgi = svNum_(six["敏捷"]), nInt = svNum_(six["魔力"]), nLuk = svNum_(six["幸運"]);
  var hp = 300 + svNum_(six["耐久"]) * 12, mp = 120 + svNum_(six["魔力"]) * 6;
  var row = Array(Object.keys(COL.PC).length).fill("");
  row[COL.PC.ID] = "NPC_" + Date.now() + "_h" + Math.floor(Math.random() * 100000);
  row[COL.PC.NAME] = hero[COL.HERO.NAME];
  row[COL.PC.SEX] = (hero[COL.HERO.SEX] === "無" ? "異" : (hero[COL.HERO.SEX] || "異"));
  row[COL.PC.BACK] = cls + " 職階英靈";
  row[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "佇立", "負面": "無", "顏面": "氣息冷冽" });
  row[COL.PC.TRAIT] = parseTraitsHelper(traits.map(function (t) { return t.n; }).join("、"), "氣場凜然、舉止從容、精擅戰技、深藏之面");
  row[COL.PC.LOC] = loc;
  row[COL.PC.PREF] = parseTraitsHelper(String(persona.words || "").replace(/・/g, "、"), "沉著表象、堅定內裡、珍視之物、厭惡之事");
  row[COL.PC.HP] = hp; row[COL.PC.MP] = mp;
  row[COL.PC.STR] = nStr; row[COL.PC.CON] = nCon; row[COL.PC.AGI] = nAgi; row[COL.PC.INT] = nInt; row[COL.PC.LUK] = nLuk;
  row[COL.PC.MAX_HP] = hp; row[COL.PC.MAX_MP] = mp; row[COL.PC.REALM] = "凡人";
  row[COL.PC.INTENT] = "";
  row[COL.PC.FACTION] = faction; row[COL.PC.RANK] = cls; row[COL.PC.CLS] = cls;
  row[COL.PC.ALIGN] = hero[COL.HERO.ALIGN] || "中立";
  row[COL.PC.MARTIAL] = hero[COL.HERO.NP] || "寶具";
  row[COL.PC.MEMORY] = `第一人稱「${persona.firstP || "我"}」｜對御主：${persona.toMaster || ""}`;
  row[COL.PC.SIX] = JSON.stringify(six);
  row[COL.PC.TAGS] = JSON.stringify({ skills: classSkills.concat(skills), traits: traits });
  row[COL.PC.CONTRIB] = (faction === "敵從者") ? 3 : 0; // 敵方令咒餘量(對面御主的 3 道令咒，可緊急脫離)
  row[COL.PC.GAME_ID] = gameId;
  return row;
}

// 御主殿列 → 眾生(NPC)列（敵御主：凡人、弱）
function masterToNpcRow_(mr, gameId, loc, faction) {
  var row = Array(Object.keys(COL.PC).length).fill("");
  row[COL.PC.ID] = "NPC_" + Date.now() + "_m" + Math.floor(Math.random() * 100000);
  row[COL.PC.NAME] = mr[COL.MASTER.NAME];
  row[COL.PC.SEX] = mr[COL.MASTER.SEX] || "異";
  // 身世（本版新增欄；舊資料退回外貌）＋外貌一併餵給敘事
  var mBack = String(mr[COL.MASTER.BACK] || "").trim();
  var mAppear = String(mr[COL.MASTER.APPEAR] || "").trim();
  row[COL.PC.BACK] = (mBack ? mBack : "魔術師") + (mAppear ? "。外貌：" + mAppear : "");
  row[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "平靜" });
  row[COL.PC.TRAIT] = parseTraitsHelper(mr[COL.MASTER.PERSONA], "外貌平凡、舉止從容、通曉魔術、深藏心事");
  row[COL.PC.LOC] = loc;
  row[COL.PC.PREF] = parseTraitsHelper(mr[COL.MASTER.PERSONA], "沉著表象、堅定內裡、珍視之物、厭惡之事");
  var hp = 120, mp = 80;
  row[COL.PC.HP] = hp; row[COL.PC.MP] = mp;
  row[COL.PC.STR] = 12; row[COL.PC.CON] = 12; row[COL.PC.AGI] = 12; row[COL.PC.INT] = 18; row[COL.PC.LUK] = 12;
  row[COL.PC.MAX_HP] = hp; row[COL.PC.MAX_MP] = mp; row[COL.PC.REALM] = "凡人";
  row[COL.PC.INTENT] = String(mr[COL.MASTER.MOE] || "");
  row[COL.PC.FACTION] = faction; row[COL.PC.RANK] = "御主"; row[COL.PC.CLS] = "";
  row[COL.PC.MEMORY] = `【願望】${mr[COL.MASTER.WISH] || ""}｜【魔術】${mr[COL.MASTER.MAGIC] || ""}`;
  row[COL.PC.GAME_ID] = gameId;
  return row;
}

// 洗牌（GAS 端 Math.random 可用）
function shuffle_(a) {
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// 正史第五次的六名正典英靈真名（供「禁止玩家搶角色」與 get_heroes 過濾）
function canonHeroNames_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hs = ss.getSheetByName('英靈殿');
  if (!hs || hs.getLastRow() <= 1) return [];
  var heroes = hs.getDataRange().getValues();
  var names = [];
  FATE_5TH_ROSTER.forEach(function (r) {
    var h = heroes.find(function (x) { return String(x[COL.HERO.ID]) === r.hero; });
    if (h) names.push(String(h[COL.HERO.NAME]));
  });
  return names;
}

// 🔵 開局鋪敵：war ∈ '4th'|'5th'|'fake'|'chaos'；playedMaster=玩家扮演的正典御主id(那組移除)。
//   被玩家奪取的從者真名(playerServantName)那一組也一律從對手移除——「別人正史，你不太正」。
function seedRivalsForGame_(gameId, playerServantName, war, playedMaster) {
  if (!gameId) return;
  war = war || '5th';
  playedMaster = playedMaster || '';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pc = ss.getSheetByName('眾生'), hs = ss.getSheetByName('英靈殿'), msh = ss.getSheetByName('御主殿');
  if (!pc || !hs || !msh) return;

  // 同實例若已鋪過敵御主，跳過（避免重複）
  var existing = pc.getDataRange().getValues();
  for (var i = 1; i < existing.length; i++) {
    if (String(existing[i][COL.PC.GAME_ID] || "") === gameId && String(existing[i][COL.PC.FACTION]) === "敵御主") return;
  }

  var heroes = hs.getDataRange().getValues();
  var masters = msh.getDataRange().getValues();
  var findHero = function (id) { return heroes.find(function (r) { return String(r[COL.HERO.ID]) === id; }); };
  var findMaster = function (id) { return masters.find(function (r) { return String(r[COL.MASTER.ID]) === id; }); };
  var rows = [];

  if (war === 'chaos') {
    // 🎲 混亂：洗牌湊六組隨機配對；跳過與玩家相同真名的英靈
    var mPool = masters.slice(1).filter(function (r) { return r[COL.MASTER.ID]; });
    var hPool = heroes.slice(1).filter(function (r) { return r[COL.HERO.ID] && String(r[COL.HERO.NAME]) !== playerServantName; });
    shuffle_(mPool); shuffle_(hPool);
    var locPool = shuffle_(['冬木·深山町', '遠坂宅', '間桐宅', '言峰教會', '柳洞寺', '冬木·新都', '穗群原學園', '冬木·商店街']);
    var n = Math.min(7, mPool.length, hPool.length);
    for (var k = 0; k < n; k++) {
      var loc = locPool[k % locPool.length];
      rows.push(masterToNpcRow_(mPool[k], gameId, loc, '敵御主'));
      rows.push(heroToNpcRow_(hPool[k], gameId, loc, '敵從者'));
    }
  } else if (war === 'fake') {
    // 🃏 偽聖杯：正典從者 ＋ 合成匿名御主
    FATE_FAKE_ROSTER.forEach(function (r) {
      var hero = findHero(r.hero);
      if (!hero) return;
      if (playerServantName && String(hero[COL.HERO.NAME]) === playerServantName) return; // 玩家奪取那組移除
      rows.push(fakeMasterRow_(r.master, gameId, r.loc));
      rows.push(heroToNpcRow_(hero, gameId, r.loc, '敵從者'));
    });
  } else {
    // 📜 正史 4th / 5th：正典組為敵；玩家扮演者那組、玩家奪取從者那組，皆移除
    var roster = (war === '4th') ? FATE_4TH_ROSTER : FATE_5TH_ROSTER;
    roster.forEach(function (r) {
      if (playedMaster && String(r.master) === playedMaster) return;        // 你扮演的那組
      var hero = findHero(r.hero), master = findMaster(r.master);
      if (!hero || !master) return;
      if (playerServantName && String(hero[COL.HERO.NAME]) === playerServantName) return; // 你奪取的那組
      rows.push(masterToNpcRow_(master, gameId, r.loc, '敵御主'));
      rows.push(heroToNpcRow_(hero, gameId, r.loc, '敵從者'));
    });
  }
  // 🔗 硬連結每組敵御主↔敵從者（rows 嚴格交替：master, servant, master, servant…）
  //   互寫【從者】名/【御主】名於 MEMORY，讓多組同場時也分得清誰是誰、誰的從者被誰打掉。
  for (var pi = 0; pi + 1 < rows.length; pi += 2) {
    var mName = String(rows[pi][COL.PC.NAME] || ""), sName = String(rows[pi + 1][COL.PC.NAME] || "");
    if (sName) rows[pi][COL.PC.MEMORY] = String(rows[pi][COL.PC.MEMORY] || "") + "｜【從者】" + sName;
    if (mName) rows[pi + 1][COL.PC.MEMORY] = String(rows[pi + 1][COL.PC.MEMORY] || "") + "｜【御主】" + mName;
  }
  if (rows.length) {
    pc.getRange(pc.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}
