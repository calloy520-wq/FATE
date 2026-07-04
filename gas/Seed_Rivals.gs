// ==========================================
// 🔵 Seed_Rivals.gs — 開局把六組敵方御主×從者鋪進玩家自己的 game_id 世界
//   敵御主 FACTION='敵御主'、敵從者 FACTION='敵從者'（與玩家自己的「從者」區分，
//   才不會被 get_tags / fate_battle 誤認成玩家的從者）。
// ==========================================

function safeJson_(s, dflt) { try { return JSON.parse(s || ""); } catch (e) { return dflt; } }

// 讀某英靈殿列的六圍【魔力】階(給 masterToNpcRow_/fakeMasterRow_ 算共用魔力池用)
function heroMagicRank_(heroRow) { return String(safeJson_(heroRow[COL.HERO.SIX], {})["魔力"] || "C"); }

// 🔵 戰爭迷霧：玩家當前所在若有未偵查的敵御主/敵從者，標記為「已偵查」(地圖才會點亮)
//   ⚡ preData：呼叫端已讀好的整表 → 就地標記 SEEN(不重讀)；變動時整欄一次 setValues(不逐格 setValue)。
//      回傳(可能已就地改 SEEN 的)data 供呼叫端沿用，避免 buildClientState_ 二次整表讀。
function markRivalsSeen_(sheets, pcId, preData) {
  try {
    const data = preData || sheets.pc.getDataRange().getValues();
    const me = data.find(r => r[COL.PC.ID] == pcId);
    if (!me) return data;
    const myGameId = String(me[COL.PC.GAME_ID] || "");
    const myLoc = String(me[COL.PC.LOC] || "").trim();
    if (!myLoc) return data;
    var dirty = false;
    for (var i = 1; i < data.length; i++) {
      var r = data[i], fac = String(r[COL.PC.FACTION]);
      if (fac !== "敵御主" && fac !== "敵從者") continue;
      if (String(r[COL.PC.GAME_ID] || "") !== myGameId) continue;
      if (String(r[COL.PC.LOC] || "").trim() !== myLoc) continue;
      if (r[COL.PC.SEEN]) continue;
      r[COL.PC.SEEN] = 1; dirty = true; // 就地標記，下方一次寫回
    }
    if (dirty) {
      var col = [];
      for (var k = 1; k < data.length; k++) col.push([data[k][COL.PC.SEEN]]);
      sheets.pc.getRange(2, COL.PC.SEEN + 1, col.length, 1).setValues(col); // 整欄一次寫回
    }
    return data;
  } catch (e) { return preData || null; }
}

// 第五次聖杯戰爭正典陣容（master_id, hero_id, 冬木落點）
var FATE_5TH_ROSTER = [
  { master: '衛宮士郎-5th', hero: '阿爾托莉雅-Saber', loc: '冬木·深山町' },
  { master: '遠坂凜-5th', hero: 'EMIYA-Archer', loc: '遠坂宅' },
  { master: '間桐慎二-5th', hero: '美杜莎-Rider', loc: '間桐宅' },
  { master: '言峰綺禮-5th', hero: '庫丘林-Lancer', loc: '言峰教會' },
  { master: '葛木宗一郎-5th', hero: '美狄亞-Caster', loc: '柳洞寺' },
  { master: '伊莉雅絲菲爾-5th', hero: '赫拉克勒斯-Berserker', loc: '冬木·新都' },
  { master: '間桐臟硯-5th', hero: '咒腕之哈桑-Assassin', loc: '間桐宅' } // 第五次真·Assassin：蟲爺臟硯召喚的咒腕哈桑
];

// 第四次聖杯戰爭正典陣容（Fate/Zero）
var FATE_4TH_ROSTER = [
  { master: '衛宮切嗣-4th', hero: '阿爾托莉雅-Saber', loc: '冬木·深山町' },
  { master: '遠坂時臣-4th', hero: '吉爾伽美什-Archer', loc: '遠坂宅' },
  { master: '肯尼斯-4th', hero: '迪盧木多-Lancer', loc: '海特飯店' },
  { master: '韋伯·維爾維特-4th', hero: '伊斯坎達爾-Rider', loc: '麥肯基宅' },
  { master: '雨生龍之介-4th', hero: '吉爾德萊-Caster', loc: '碼頭倉庫' },
  { master: '言峰綺禮-4th', hero: '百貌哈桑-Assassin', loc: '言峰教會' },
  { master: '間桐雁夜-4th', hero: '蘭斯洛特-Berserker', loc: '間桐宅' }
];

// 偽聖杯戰爭（Fate/strange Fake）：正典從者 ＋ 雪原匿名御主（御主殿無資料，直接合成）
var FATE_FAKE_ROSTER = [
  { master: '提奈·切爾克', hero: '吉爾伽美什-Archer', loc: '冬木·新都' },
  { master: '銀狼', hero: '恩奇都-Lancer', loc: '未遠川河畔' }, // 原作：以銀狼為觸媒召喚，令咒落在狼身上、恩奇都便認狼為主
  { master: '巴茲狄洛特', hero: '赫拉克勒斯-Avenger', loc: '柳洞寺' }, // 原作：巴茲狄洛特召喚的赫拉克勒斯被令咒歪曲成 Avenger·阿爾喀德斯
  { master: '歐蘭多·里夫', hero: '理查一世-Saber', loc: '冬木·深山町' },
  { master: '約翰·溫加德', hero: '阿基里斯-Rider', loc: '冬木·商店街' },
  { master: '哈魯利', hero: '玉藻前-Caster', loc: '遠坂宅' },
  { master: '繰丘椿', hero: '蒼白騎兵-Rider', loc: '間桐宅' }, // strange Fake 正典：繰丘椿召喚 Pale Rider
  { master: '傑斯塔·卡爾托雷', hero: '狂信者哈桑-Assassin', loc: '言峰教會' } // strange Fake 正典：偽Assassin＝狂信者哈桑，御主傑斯塔（偽裝的死徒）
];

// 合成一名匿名御主列（偽聖杯／無正典御主資料時用）
//   heroMagicRank：與其締結的英靈六圍【魔力】階(如'A')——魔力池跟玩家御主同制(共用魔力池)看雙方魔力決定，
//   不能只算御主自己那份，否則契約強英靈的御主反而池子明顯偏小、不公正。
function fakeMasterRow_(name, gameId, loc, heroMagicRank) {
  var row = Array(Object.keys(COL.PC).length).fill("");
  row[COL.PC.ID] = "NPC_" + Date.now() + "_f" + Math.floor(Math.random() * 100000);
  row[COL.PC.NAME] = name;
  row[COL.PC.SEX] = "異";
  row[COL.PC.BACK] = "捲入偽聖杯戰爭的魔術師";
  row[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "平靜" });
  row[COL.PC.TRAIT] = parseTraitsHelper("", "外貌平凡、舉止從容、通曉魔術、深藏心事");
  row[COL.PC.LOC] = loc;
  row[COL.PC.PREF] = parseTraitsHelper("", "沉著表象、堅定內裡、珍視之物、厭惡之事");
  var mp = 80 + rankVal(heroMagicRank || 'C') * 2;
  row[COL.PC.HP] = 120; row[COL.PC.MP] = mp;
  // 🎴 五圍已棄欄：戰鬥吃六圍 SIX，HP/MP 由 calculateMaxStats(SIX) 算。
  row[COL.PC.MAX_HP] = 120; row[COL.PC.MAX_MP] = mp;
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
  // 🔋 出力電池制：敵從者跟玩家從者同制——無自有魔力池，寶具魔力全由(敵)御主電池供給(見 enemyCanAffordNp_)。
  var hp = 150 + svNum_(six["耐久"]) * 6, mp = 0;
  var row = Array(Object.keys(COL.PC).length).fill("");
  row[COL.PC.ID] = "NPC_" + Date.now() + "_h" + Math.floor(Math.random() * 100000);
  row[COL.PC.NAME] = hero[COL.HERO.NAME];
  row[COL.PC.SEX] = (hero[COL.HERO.SEX] === "無" ? "異" : (hero[COL.HERO.SEX] || "異"));
  row[COL.PC.BACK] = cls + " 職階英靈";
  row[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "佇立", "負面": "無", "顏面": "氣息冷冽" });
  row[COL.PC.TRAIT] = parseTraitsHelper(String(persona.look || ""), "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面"); // 🎴 特徵直接讀種子 persona.look
  row[COL.PC.LOC] = loc;
  row[COL.PC.PREF] = parseTraitsHelper(String(persona.words || "").replace(/・/g, "、"), "沉著表象、堅定內裡、珍視之物、厭惡之事");
  row[COL.PC.HP] = hp; row[COL.PC.MP] = mp;
  // 🎴 五圍已棄欄：戰鬥吃六圍 SIX。
  row[COL.PC.MAX_HP] = hp; row[COL.PC.MAX_MP] = mp;
  row[COL.PC.INTENT] = String(persona.moe || "").slice(0, 18); // 🎴 敵從者也複製萌點(原漏，servantCard_ 曾要靠即時查表補)
  row[COL.PC.FACTION] = faction; row[COL.PC.RANK] = cls;
  row[COL.PC.ALIGN] = hero[COL.HERO.ALIGN] || "中立";
  row[COL.PC.MARTIAL] = hero[COL.HERO.NP] || "寶具";
  row[COL.PC.MEMORY] = stampPersonaFlavor_(`第一人稱「${persona.firstP || "我"}」｜對御主：${persona.toMaster || ""}`, persona.speech, persona.tic);
  row[COL.PC.SIX] = JSON.stringify(six);
  row[COL.PC.TAGS] = JSON.stringify({ skills: classSkills.concat(skills), traits: traits });
  // 🕯️ 復活命數：敵從者也要吃 god_hand 的 lives 覆寫(如尼祿 lives:3)，否則 getGodHandLives_ 會誤套
  //   赫拉克勒斯專屬的預設11——此前 heroToNpcRow_ 完全沒處理這塊，敵方尼祿會平白多拿8條命。
  var ghSkillNpc = classSkills.concat(skills).find(function (s) { return s && s.fx === 'god_hand'; });
  if (ghSkillNpc && ghSkillNpc.lives != null) row[COL.PC.MEMORY] += '｜【試煉】' + ghSkillNpc.lives;
  row[COL.PC.CONTRIB] = (faction === "敵從者") ? 3 : 0; // 敵方令咒餘量(對面御主的 3 道令咒，可緊急脫離)
  row[COL.PC.GAME_ID] = gameId;
  return row;
}

// 御主殿列 → 眾生(NPC)列（敵御主：凡人、弱）
//   heroMagicRank：與其締結的英靈六圍【魔力】階——魔力池跟玩家御主同制(共用魔力池，見 masterPoolMax_)看雙方魔力決定，
//   不能只算御主自己迴路，否則契約強英靈(如阿爾托莉雅魔力A)的御主反而池子明顯偏小、不公正。
function masterToNpcRow_(mr, gameId, loc, faction, heroMagicRank) {
  var row = Array(Object.keys(COL.PC).length).fill("");
  row[COL.PC.ID] = "NPC_" + Date.now() + "_m" + Math.floor(Math.random() * 100000);
  row[COL.PC.NAME] = mr[COL.MASTER.NAME];
  row[COL.PC.SEX] = mr[COL.MASTER.SEX] || "異";
  // 身世（本版新增欄；舊資料退回外貌）＋外貌一併餵給敘事
  var mBack = String(mr[COL.MASTER.BACK] || "").trim();
  var mAppear = String(mr[COL.MASTER.APPEAR] || "").trim();
  row[COL.PC.BACK] = (mBack ? mBack : "魔術師") + (mAppear ? "。外貌：" + mAppear : "");
  row[COL.PC.STATUS] = JSON.stringify({ "衣服": "穿戴整齊", "姿勢": "站立", "負面": "無", "顏面": "平靜" });
  // ⚠ 2026-07 修：TRAIT 原本跟 PREF 抄同一份 PERSONA 來源，兩者變成逐字重複(敵御主卡「性格」「特徵」塞了同一句)；
  //   比照 heroToNpcRow_(TRAIT=外貌、PREF=性格 分開兩欄) 改用 mAppear(種子 appearance 外貌欄)當 TRAIT 真正來源。
  row[COL.PC.TRAIT] = parseTraitsHelper(mAppear, "外貌平凡、舉止從容、通曉魔術、深藏心事");
  row[COL.PC.LOC] = loc;
  row[COL.PC.PREF] = parseTraitsHelper(String(mr[COL.MASTER.PERSONA] || "").replace(/・/g, "、"), "沉著表象、堅定內裡、珍視之物、厭惡之事");
  // 🎴 敵御主血魔與玩家御主同制：HP 純看迴路(masterMaxHpMp_)，凡人遠低於從者；MP 走共用魔力池公式
  //   (masterPoolMax_＝迴路×10＋從者魔力×2)，正典高迴路怪物(伊莉雅/櫻)或契約強英靈者才逼近從者級。
  var circuits = parseInt(mr[COL.MASTER.CIRCUITS] || 30);
  var hp = masterMaxHpMp_(circuits).hp, mp = masterPoolMax_(circuits, rankVal(heroMagicRank || 'C'));
  row[COL.PC.HP] = hp; row[COL.PC.MP] = mp;
  row[COL.PC.MAX_HP] = hp; row[COL.PC.MAX_MP] = mp;
  row[COL.PC.INTENT] = String(mr[COL.MASTER.MOE] || "");
  row[COL.PC.FACTION] = faction; row[COL.PC.RANK] = "御主";
  row[COL.PC.MEMORY] = `【願望】${mr[COL.MASTER.WISH] || ""}｜【魔術】${mr[COL.MASTER.MAGIC] || ""}｜【迴路】${parseInt(mr[COL.MASTER.CIRCUITS] || 30)}`;
  row[COL.PC.GAME_ID] = gameId;
  return row;
}

// 洗牌（GAS 端 Math.random 可用）
function shuffle_(a) {
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
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

  var heroes = getHeroCodexCached();
  var masters = getMasterCodexCached();
  var findHero = function (id) { return heroes.find(function (r) { return String(r[COL.HERO.ID]) === id; }); };
  var findMaster = function (id) { return masters.find(function (r) { return String(r[COL.MASTER.ID]) === id; }); };
  var rows = [];

  if (war === 'chaos') {
    // 🎲 混亂：洗牌湊六組隨機配對；跳過與玩家相同真名的英靈
    //   ★排除 非參戰職階(Ruler 裁定者) 與 外傳客串(Prisma 美遊/小黑/伊莉雅、賽彌拉米斯等)，別當正規敵從者；
    //     並依真名去重(斯卡哈雙職階/同名御主 4th·5th)，避免同場兩個同名被 NAME-based 查找塌縮成一人。
    var seenMaster = {};
    var mPool = masters.slice(1).filter(function (r) {
      if (!r[COL.MASTER.ID]) return false;
      var nm = String(r[COL.MASTER.NAME]); if (seenMaster[nm]) return false; seenMaster[nm] = true; return true;
    });
    var seenHero = {};
    var hPool = heroes.slice(1).filter(function (r) {
      if (!r[COL.HERO.ID] || String(r[COL.HERO.NAME]) === playerServantName) return false;
      if (String(r[COL.HERO.CLS]) === 'Ruler') return false;
      if (String(r[COL.HERO.WARS] || '').indexOf('客串') >= 0) return false;
      // 🌟 玩家原創(ai_gen·工房/盲盒)不進敵人池(2026-07 玩家反映「都從英靈殿尾端抓」——洗牌本身無偏差，
      //   是測試期原創英靈越積越多稀釋了正典池；原創只該在「🌟玩家原創」專區被主動召喚)
      if (String(r[COL.HERO.SOURCE]) === 'ai_gen') return false;
      var nm = String(r[COL.HERO.NAME]); if (seenHero[nm]) return false; seenHero[nm] = true; return true;
    });
    shuffle_(mPool); shuffle_(hPool);
    var locPool = shuffle_(['冬木·深山町', '遠坂宅', '間桐宅', '言峰教會', '柳洞寺', '冬木·新都', '穗群原學園', '冬木·商店街']);
    var n = Math.min(7, mPool.length, hPool.length);
    for (var k = 0; k < n; k++) {
      var loc = locPool[k % locPool.length];
      rows.push(masterToNpcRow_(mPool[k], gameId, loc, '敵御主', heroMagicRank_(hPool[k])));
      rows.push(heroToNpcRow_(hPool[k], gameId, loc, '敵從者'));
    }
  } else if (war === 'fake') {
    // 🃏 偽聖杯：正典從者 ＋ 合成匿名御主
    FATE_FAKE_ROSTER.forEach(function (r) {
      var hero = findHero(r.hero);
      if (!hero) return;
      if (playerServantName && String(hero[COL.HERO.NAME]) === playerServantName) return; // 玩家奪取那組移除
      rows.push(fakeMasterRow_(r.master, gameId, r.loc, heroMagicRank_(hero)));
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
      rows.push(masterToNpcRow_(master, gameId, r.loc, '敵御主', heroMagicRank_(hero)));
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
