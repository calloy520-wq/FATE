// ==========================================
// 🔵 Seed_Rivals.gs — 開局把六組敵方御主×從者鋪進玩家自己的 game_id 世界
//   敵御主 FACTION='敵御主'、敵從者 FACTION='敵從者'（與玩家自己的「從者」區分，
//   才不會被 get_tags / fate_battle 誤認成玩家的從者）。
// ==========================================
// 📓 為什麼這樣寫 → CODE_NOTES.md（用函式／常數名搜）。程式碼這邊只留「這在做什麼」。

function safeJson_(s, dflt) { try { return JSON.parse(s || ""); } catch (e) { return dflt; } }

// 讀某英靈殿列的六圍【魔力】階(給 masterToNpcRow_ 算共用魔力池用)
function heroMagicRank_(heroRow) { return String(safeJson_(heroRow[COL.HERO.SIX], {})["魔力"] || "C"); }

// 🔵 戰爭迷霧：玩家所在若有未偵查的敵御主/敵從者，標記為「已偵查」(地圖才會點亮)
function markRivalsSeen_(sheets, pcId, preData) {
  try {
    const data = preData || sheets.pc.getDataRange().getValues();
    const me = data.find(r => r[COL.PC.ID] == pcId);
    if (!me) return data;
    const myGameId = String(me[COL.PC.GAME_ID] || "");
    const myLoc = String(me[COL.PC.LOC] || "").trim();
    if (!myLoc) return data;
    const myDay = parseInt(me[COL.PC.DAY]) || 1; // 🕰️ 尚未登場者不會被標記「已偵查」
    var dirty = false;
    for (var i = 1; i < data.length; i++) {
      var r = data[i], fac = String(r[COL.PC.FACTION]);
      if (fac !== "敵御主" && fac !== "敵從者") continue;
      if (String(r[COL.PC.GAME_ID] || "") !== myGameId) continue;
      if (String(r[COL.PC.LOC] || "").trim() !== myLoc) continue;
      if (!hasArrived_(r, myDay)) continue;
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

// 第五次聖杯戰爭正典陣容（master_id, hero_id, 冬木落點｜可選 arriveDay：第N天才登場，預設1＝開局即登場；arriveHint：登場前1~2天的世界風聲自訂提示句，未填則退回依職階的泛用措辭；master 可為 …（全文見 CODE_NOTES.md）
var FATE_5TH_ROSTER = [
  { master: '衛宮士郎-5th', hero: '阿爾托莉雅-Saber', loc: '冬木·深山町' },
  { master: '遠坂凜-5th', hero: 'EMIYA-Archer', loc: '遠坂宅' },
  { master: '間桐櫻(黑化)-5th', hero: '美杜莎-Rider', loc: '間桐宅' },
  { master: '言峰綺禮-5th', hero: '庫丘林-Lancer', loc: '言峰教會' },
  { master: '葛木宗一郎-5th', hero: '美狄亞-Caster', loc: '柳洞寺' },
  { master: '伊莉雅絲菲爾-5th', hero: '赫拉克勒斯-Berserker', loc: '冬木·新都' },
  { master: '間桐臟硯-5th', hero: '咒腕之哈桑-Assassin', loc: '間桐宅' }, // 第五次真·Assassin：蟲爺臟硯召喚的咒腕哈桑
  { master: '間桐慎二-5th', hero: '吉爾伽美什-Archer', loc: '冬木·新都',
    arriveDay: 3, arriveHint: '遠方隱約可見一道金色的、睥睨般的威壓氣息，正緩步朝冬木漫遊而來——彷彿全然不將這場戰爭放在眼裡。' },
  { master: null, hero: '佐佐木小次郎-Assassin', loc: '柳洞寺' } // 真正無御主：孤身蟄伏於柳洞寺暗處
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

// 英靈殿列 → 眾生(NPC)列
function heroToNpcRow_(hero, gameId, loc, faction) {
  var six = safeJson_(hero[COL.HERO.SIX], {});
  var classSkills = safeJson_(hero[COL.HERO.CLASS_SKILLS], []);
  var skills = safeJson_(hero[COL.HERO.SKILLS], []);
  var traitsRaw = safeJson_(hero[COL.HERO.TRAITS], []);
  var traits = Array.isArray(traitsRaw) ? traitsRaw : [];
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
  // persona.look 含外貌與氣質詞混雜，用 looksToTraitParts_ 切分＋帶入 persona.firstP 當自稱，避免位置盲目塞格。
  row[COL.PC.TRAIT] = parseTraitsHelper(looksToTraitParts_(persona.look, persona.firstP), DEFAULT_TRAIT_FALLBACK_); // 🎴 特徵直接讀種子 persona.look
  row[COL.PC.LOC] = loc;
  row[COL.PC.PREF] = parseTraitsHelper(String(persona.words || "").replace(/・/g, "、"), DEFAULT_PREF_FALLBACK_);
  row[COL.PC.HP] = hp; row[COL.PC.MP] = mp;
  // 🎴 五圍已棄欄：戰鬥吃六圍 SIX。
  row[COL.PC.MAX_HP] = hp; row[COL.PC.MAX_MP] = mp;
  row[COL.PC.INTENT] = clampMoe_(persona.moe); // 🎴 敵從者也複製萌點(原漏，servantCard_ 曾要靠即時查表補)
  row[COL.PC.FACTION] = faction; row[COL.PC.RANK] = cls;
  row[COL.PC.ALIGN] = hero[COL.HERO.ALIGN] || "中立";
  row[COL.PC.MARTIAL] = hero[COL.HERO.NP] || "寶具";
  row[COL.PC.MEMORY] = stampPersonaFlavor_(`第一人稱「${persona.firstP || "我"}」｜對御主：${persona.toMaster || ""}`, persona.speech, persona.tic);
  row[COL.PC.SIX] = JSON.stringify(six);
  row[COL.PC.TAGS] = JSON.stringify({ skills: tagSkillKind_(classSkills, 'class').concat(tagSkillKind_(skills, 'skill')), traits: traits });
  // 復活命數：敵從者也要吃 god_hand 的 lives 覆寫(如尼祿3)，否則 getGodHandLives_ 誤套赫拉克勒斯專屬預設11。
  var ghSkillNpc = classSkills.concat(skills).find(function (s) { return s && s.fx === 'god_hand'; });
  if (ghSkillNpc) {
    var ghLivesNpc = (ghSkillNpc.lives != null) ? ghSkillNpc.lives : (String(hero[COL.HERO.SOURCE]) === 'ai_gen' ? 3 : null);
    if (ghLivesNpc != null) row[COL.PC.MEMORY] += '｜【試煉】' + ghLivesNpc;
  }
  row[COL.PC.CONTRIB] = (faction === "敵從者") ? 3 : 0; // 敵方令咒餘量(對面御主的 3 道令咒，可緊急脫離)
  row[COL.PC.GAME_ID] = gameId;
  return row;
}

// 御主殿列 → 眾生(NPC)列（敵御主：凡人、弱）heroMagicRank：共用魔力池公式(masterPoolMax_)需要英靈魔力階，不能只算御主自己迴路，否則契約強英靈(如阿爾托莉雅魔力A)的御主反而池子明顯偏小。
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
  // TRAIT 用 mAppear(外貌)而非 PERSONA，比照 heroToNpcRow_ 把外貌/性格分開兩欄，避免與 PREF 重複。
  row[COL.PC.TRAIT] = parseTraitsHelper(mAppear, "外貌平凡、舉止從容、通曉魔術、深藏心事");
  row[COL.PC.LOC] = loc;
  row[COL.PC.PREF] = parseTraitsHelper(String(mr[COL.MASTER.PERSONA] || "").replace(/・/g, "、"), DEFAULT_PREF_FALLBACK_);
  // 敵御主與玩家御主同制：HP 看迴路(masterMaxHpMp_)，MP 走共用魔力池公式(masterPoolMax_＝迴路×10＋從者魔力×2)。
  var circuits = clampCircuits_(mr[COL.MASTER.CIRCUITS] || 30);
  var hp = masterMaxHpMp_(circuits).hp, mp = masterPoolMax_(circuits, rankVal(heroMagicRank || 'C'));
  row[COL.PC.HP] = hp; row[COL.PC.MP] = mp;
  row[COL.PC.MAX_HP] = hp; row[COL.PC.MAX_MP] = mp;
  row[COL.PC.INTENT] = String(mr[COL.MASTER.MOE] || "");
  row[COL.PC.FACTION] = faction; row[COL.PC.RANK] = "御主";
  row[COL.PC.ALIGN] = String(mr[COL.MASTER.ALIGN] || "").trim();
  // 體術/魔術階位需寫進 MEMORY，masterCard_ 與 injectMasterMeleeSupport_/injectMasterMagicSupport_ 才讀得到。
  row[COL.PC.MEMORY] = `【願望】${mr[COL.MASTER.WISH] || ""}｜【魔術】${mr[COL.MASTER.MAGIC] || ""}｜【迴路】${circuits}｜【體術】${mr[COL.MASTER.MELEE] || ""}｜【魔術階位】${mr[COL.MASTER.MAGIC_RANK] || ""}`;
  row[COL.PC.GAME_ID] = gameId;
  return row;
}

// 洗牌（GAS 端 Math.random 可用）
function shuffle_(a) {
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

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
    // 🎲 混亂：洗牌湊隨機配對；排除 Ruler 與外傳客串(不當正規敵從者)，依真名去重避免同名塌縮成一人。
    var seenMaster = {};
    var mPool = masters.slice(1).filter(function (r) {
      if (!r[COL.MASTER.ID]) return false;
      // 排除 playedMaster：防禦性補強，避免玩家跟自己扮演的角色雙胞胎(現行流程 playedMaster 不會傳進 chaos，但留著保險)。
      if (playedMaster && String(r[COL.MASTER.ID]) === playedMaster) return false;
      var nm = String(r[COL.MASTER.NAME]); if (seenMaster[nm]) return false; seenMaster[nm] = true; return true;
    });
    var seenHero = {};
    var hPool = heroes.slice(1).filter(function (r) {
      if (!r[COL.HERO.ID] || String(r[COL.HERO.NAME]) === playerServantName) return false;
      if (String(r[COL.HERO.CLS]) === 'Ruler') return false;
      if (String(r[COL.HERO.WARS] || '').indexOf('客串') >= 0) return false;
      // 玩家原創(ai_gen)可進混亂敵人池——Fisher-Yates 洗牌無偏差，佔比高只是原創數量多。
      var nm = String(r[COL.HERO.NAME]); if (seenHero[nm]) return false; seenHero[nm] = true; return true;
    });
    shuffle_(mPool); shuffle_(hPool);
    var locPool = shuffle_(['冬木·深山町', '遠坂宅', '間桐宅', '言峰教會', '柳洞寺', '冬木·新都', '穗群原學園', '冬木·商店街']);
    var n = Math.min(7, mPool.length, hPool.length);
    // 🎲 隨機登場日：比照正史roster的登場機制(hasArrived_/setArriveDay_)；前 CHAOS_GUARANTEED_IMMEDIATE_ 組保證第1天就在(開局至少有東西可打)，其餘每組50%機率延後第2~5天登場。
    var CHAOS_GUARANTEED_IMMEDIATE_ = 3;
    for (var k = 0; k < n; k++) {
      var loc = locPool[k % locPool.length];
      var mRow = masterToNpcRow_(mPool[k], gameId, loc, '敵御主', heroMagicRank_(hPool[k]));
      var sRow = heroToNpcRow_(hPool[k], gameId, loc, '敵從者');
      if (k >= CHAOS_GUARANTEED_IMMEDIATE_ && Math.random() < 0.5) {
        var chaosArriveDay = 2 + Math.floor(Math.random() * 4); // 第2~5天隨機
        mRow[COL.PC.MEMORY] = setArriveDay_(mRow[COL.PC.MEMORY], chaosArriveDay);
        sRow[COL.PC.MEMORY] = setArriveDay_(sRow[COL.PC.MEMORY], chaosArriveDay);
      }
      rows.push(mRow, sRow);
    }
    for (var pi = 0; pi + 1 < rows.length; pi += 2) {
      var mName = String(rows[pi][COL.PC.NAME] || ""), sName = String(rows[pi + 1][COL.PC.NAME] || "");
      if (sName) rows[pi][COL.PC.MEMORY] = String(rows[pi][COL.PC.MEMORY] || "") + "｜【從者】" + sName;
      if (mName) rows[pi + 1][COL.PC.MEMORY] = String(rows[pi + 1][COL.PC.MEMORY] || "") + "｜【御主】" + mName;
    }
  } else {
    var roster = (war === '4th') ? FATE_4TH_ROSTER : FATE_5TH_ROSTER;
    roster.forEach(function (r) {
      if (playedMaster && r.master && String(r.master) === playedMaster) return; // 你扮演的那組
      var hero = findHero(r.hero);
      if (!hero) return;
      if (playerServantName && String(hero[COL.HERO.NAME]) === playerServantName) return; // 你奪取的那組
      var sRow = heroToNpcRow_(hero, gameId, r.loc, '敵從者');
      if (r.arriveDay) sRow[COL.PC.MEMORY] = setArriveDay_(sRow[COL.PC.MEMORY], r.arriveDay);
      if (r.arriveHint) sRow[COL.PC.MEMORY] = setArriveHint_(sRow[COL.PC.MEMORY], r.arriveHint);
      var master = r.master ? findMaster(r.master) : null;
      if (!master) { sRow[COL.PC.CONTRIB] = 0; rows.push(sRow); return; } // 🕯️ 真正無御主：只鋪從者列，不建御主列、不做硬連結
      var mRow = masterToNpcRow_(master, gameId, r.loc, '敵御主', heroMagicRank_(hero));
      if (r.arriveDay) mRow[COL.PC.MEMORY] = setArriveDay_(mRow[COL.PC.MEMORY], r.arriveDay);
      if (r.arriveHint) mRow[COL.PC.MEMORY] = setArriveHint_(mRow[COL.PC.MEMORY], r.arriveHint);
      var mName = String(mRow[COL.PC.NAME] || ""), sName = String(sRow[COL.PC.NAME] || "");
      if (sName) mRow[COL.PC.MEMORY] += "｜【從者】" + sName;
      if (mName) sRow[COL.PC.MEMORY] += "｜【御主】" + mName;
      rows.push(mRow, sRow);
    });
  }
  if (rows.length) {
    pc.getRange(pc.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}
