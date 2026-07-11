// ==========================================
// 🔵 Seed_Rivals.gs — 開局把六組敵方御主×從者鋪進玩家自己的 game_id 世界
//   敵御主 FACTION='敵御主'、敵從者 FACTION='敵從者'（與玩家自己的「從者」區分，
//   才不會被 get_tags / fate_battle 誤認成玩家的從者）。
// ==========================================

function safeJson_(s, dflt) { try { return JSON.parse(s || ""); } catch (e) { return dflt; } }

// 讀某英靈殿列的六圍【魔力】階(給 masterToNpcRow_ 算共用魔力池用)
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

// 第五次聖杯戰爭正典陣容（master_id, hero_id, 冬木落點｜可選 arriveDay：第N天才登場，預設1＝開局即登場；
//   arriveHint：登場前1~2天的世界風聲自訂提示句，未填則退回依職階的泛用措辭；master 可為 null＝
//   真正無御主的孤身從者，seedRivalsForGame_ 只鋪從者列、不建對應御主列）
//   2026-07 玩家定案改動(「有辦法再放人進去嗎？類似第5次金閃閃3天後出現遊蕩？佐佐木自己在柳洞寺？」
//   →「rider搭配櫻？慎二搭配金閃閃？佐佐木給他地脈標籤 無耗魔？」)：
//   ① Rider(美杜莎) 改配間桐櫻(黑化)——原作真正的契約者其實是櫻，慎二只是表面上的御主。
//   ② 間桐慎二 改配吉爾伽美什(金閃閃)——本作跨戰爭客串安排(金閃閃原屬第四次)，慎二失去Rider後
//      的替代從者；wars 標籤純敘事metadata、非runtime限制(seedRivalsForGame_不吃wars)，可自由跨戰爭指定。
//   ③ 佐佐木小次郎新增為真正無御主的第8位(master:null)——蟄伏柳洞寺(與美狄亞同地，原作本就如此：
//      柳洞寺表面是Caster的據點、暗處另蟄伏著真・Assassin)，耗魔靠Seed_Codex.gs補上的單獨行動(solo)
//      吃現有 enemyCanAffordNp_ 的【殘存】60點靈基儲備，玩家定案「不建新機制、直接用現有solo就好」。
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

// ⚠ 2026-07 大清理：偽聖杯戰爭(Fate/strange Fake) FATE_FAKE_ROSTER／fakeMasterRow_ 整段移除
//   (玩家定案「只要第4次第5次+少數客串保留，其他客串fake先刪除」)——原本 7 組配對裡有 6 組的從者
//   (赫拉克勒斯-Avenger／理查一世-Saber／玉藻前-Caster／蒼白騎兵-Rider／狂信者哈桑-Assassin)已隨
//   Seed_Codex.gs 清理拿掉，剩銀狼×恩奇都這唯一有效配對不足以撐起一整場「戰爭」，玩家選擇讓恩奇都
//   單純留在英靈殿供慾海鑑賞直接召喚，不再掛任何一場開局戰爭；「偽聖杯戰爭 Fake」開局選項一併從
//   Index.html/Script_Onboarding.html/Router_Creation.gs 拔除。

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
  // 🐛→✅ 2026-07 修「衣服寫到舉止了」：persona.look 是「N段外貌(含服裝)・・...、氣質詞」，改用
  //   looksToTraitParts_ 正確切分＋帶入真正的 persona.firstP 當自稱，不再按位置盲目塞四格。
  row[COL.PC.TRAIT] = parseTraitsHelper(looksToTraitParts_(persona.look, persona.firstP), "外貌出眾、舉止從容、自稱「我」、卸下心防時的柔軟一面"); // 🎴 特徵直接讀種子 persona.look
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
  // 🥋 2026-07 補：體術過去只存在御主殿種子表(COL.MASTER.MELEE)，從未寫進敵御主的 MEMORY——
  //   跟玩家自己創角(Router_Creation.gs)寫【體術】的做法對齊，敵御主也該有，masterCard_ 演出卡與
  //   Engine_Fate.gs 的 injectMasterMeleeSupport_ 才讀得到(目前僅玩家側從者吃得到這項加成，見該處註解)。
  // 🔮 2026-07 追加：魔術階位(COL.MASTER.MAGIC_RANK)同一批補上，供演出卡陳述＋injectMasterMagicSupport_。
  row[COL.PC.MEMORY] = `【願望】${mr[COL.MASTER.WISH] || ""}｜【魔術】${mr[COL.MASTER.MAGIC] || ""}｜【迴路】${parseInt(mr[COL.MASTER.CIRCUITS] || 30)}｜【體術】${mr[COL.MASTER.MELEE] || ""}｜【魔術階位】${mr[COL.MASTER.MAGIC_RANK] || ""}`;
  row[COL.PC.GAME_ID] = gameId;
  return row;
}

// 洗牌（GAS 端 Math.random 可用）
function shuffle_(a) {
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// 🔵 開局鋪敵：war ∈ '4th'|'5th'|'chaos'（'fake' 已隨2026-07大清理移除）；playedMaster=玩家扮演的正典御主id(那組移除)。
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
    //   ★排除 非參戰職階(Ruler 裁定者) 與 外傳客串(Prisma 美遊/小黑/伊莉雅、斯卡哈、恩奇都等)，別當正規敵從者；
    //     並依真名去重(斯卡哈雙職階/同名御主 4th·5th)，避免同場兩個同名被 NAME-based 查找塌縮成一人。
    var seenMaster = {};
    var mPool = masters.slice(1).filter(function (r) {
      if (!r[COL.MASTER.ID]) return false;
      // 🐛→✅ 2026-07 第二輪稽核抓到：正史分支(下方 roster.forEach)有排除 playedMaster(玩家扮演的正典
      //   御主本人)，避免玩家跟自己扮演的角色雙胞胎——混亂分支原本沒有同款排除。目前 playedMaster 只在
      //   非chaos模式才會寫入 MEMORY(見 actionManualNpc)，所以這條在現行流程下暫時吃不到，屬防禦性補強，
      //   避免未來若 playedMaster 語意擴及 chaos 模式時，玩家在此重演一次雙胞胎bug。
      if (playedMaster && String(r[COL.MASTER.ID]) === playedMaster) return false;
      var nm = String(r[COL.MASTER.NAME]); if (seenMaster[nm]) return false; seenMaster[nm] = true; return true;
    });
    var seenHero = {};
    var hPool = heroes.slice(1).filter(function (r) {
      if (!r[COL.HERO.ID] || String(r[COL.HERO.NAME]) === playerServantName) return false;
      if (String(r[COL.HERO.CLS]) === 'Ruler') return false;
      if (String(r[COL.HERO.WARS] || '').indexOf('客串') >= 0) return false;
      // 🌟 玩家原創(ai_gen)【可】進混亂敵人池(2026-07 玩家定案「原創角色可以進去 確實隨機就好」——
      //   Fisher-Yates 洗牌無偏差，「都抽到尾端」體感=原創數量多、佔比自然高，屬正常機率)
      var nm = String(r[COL.HERO.NAME]); if (seenHero[nm]) return false; seenHero[nm] = true; return true;
    });
    shuffle_(mPool); shuffle_(hPool);
    var locPool = shuffle_(['冬木·深山町', '遠坂宅', '間桐宅', '言峰教會', '柳洞寺', '冬木·新都', '穗群原學園', '冬木·商店街']);
    var n = Math.min(7, mPool.length, hPool.length);
    // 🎲 隨機登場日(2026-07 玩家「亂鬥呢....可以隨機天數登場嗎？」)：比照正史roster的登場日機制
    // (hasArrived_/setArriveDay_)，混亂模式的隨機配對也套用——前 CHAOS_GUARANTEED_IMMEDIATE_ 組
    // 保證第1天就在(呼應 WORLD_FLOOR_ 精神：開局至少有東西可打)，其餘每組獨立擲骰50%機率延後第2~5天
    // 登場，沒中就跟以前一樣第1天全員到齊。不自訂 arriveHint——worldTick_ 對未設提示的登場預告本就
    // 有依職階的泛用退回措辭，混亂模式配對是隨機的、也沒有固定人選可預先寫好專屬風聲句。
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
    // 🔗 硬連結每組敵御主↔敵從者（rows 嚴格交替：master, servant, master, servant…）
    //   互寫【從者】名/【御主】名於 MEMORY，讓多組同場時也分得清誰是誰、誰的從者被誰打掉。
    //   （只用於這個分支：下方 4th/5th 正史分支改成逐對即時連結，不倚賴這個位置假設。）
    for (var pi = 0; pi + 1 < rows.length; pi += 2) {
      var mName = String(rows[pi][COL.PC.NAME] || ""), sName = String(rows[pi + 1][COL.PC.NAME] || "");
      if (sName) rows[pi][COL.PC.MEMORY] = String(rows[pi][COL.PC.MEMORY] || "") + "｜【從者】" + sName;
      if (mName) rows[pi + 1][COL.PC.MEMORY] = String(rows[pi + 1][COL.PC.MEMORY] || "") + "｜【御主】" + mName;
    }
  } else {
    // 📜 正史 4th / 5th：正典組為敵；玩家扮演者那組、玩家奪取從者那組，皆移除
    // 🐛→✅ 2026-07 為支援「master:null 真正無御主的孤身從者」(玩家「佐佐木自己在柳洞寺」定案)：
    //   舊版先無腦 push 進 rows、事後靠「rows 嚴格交替 master,servant,master,servant…」的位置假設
    //   做硬連結——一旦某組是孤身從者(只 push 一列)，後面所有組別的位置就全部錯位、連結全部連錯。
    //   改成逐組當場配對即時連結(不再倚賴陣列位置)，順便原生支援 master 為 null 的孤身從者。
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
      if (!master) { rows.push(sRow); return; } // 🕯️ 真正無御主：只鋪從者列，不建御主列、不做硬連結
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
