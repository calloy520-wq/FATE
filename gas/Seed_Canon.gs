// ==========================================
// 📜 Seed_Canon.gs — 正典劇情「插針」系統（Block ②）
//   把第四／第五次聖杯戰爭的原作橋段寫成「針腳」：依【戰爭】×【路線】×第幾日×時段×地點×世界狀態觸發，
//   到點就把該 beat 當系統旁白餵給 AI 演出。世界狀態會檢查（敵已亡→該 beat 跳過/變調），故正史可被逆轉。
//   ▸ 第四次＝固定線性悲劇（route 一律 ''）。
//   ▸ 第五次＝前期共用(route '')，中盤依玩家羈絆/抉擇/願望「自然浮現」鎖進 fate|ubw|hf。
//   狀態存於玩家御主 MEMORY：【路線】X、【史】id1,id2…（已觸發針腳）。
// ==========================================

var ROUTE_PIVOT_DAY = 4; // 第五次：第 4 日起若尚未鎖線，依玩家走向自然浮現

// ── 路線 / 已觸發針腳 的 MEMORY 標記讀寫（仿 getPlayerSeals_）──
function getRoute_(memory) { var m = String(memory || "").match(/【路線】(fate|ubw|hf)/); return m ? m[1] : ""; }
function setRoute_(memory, r) {
  var s = String(memory || "");
  if (/【路線】(fate|ubw|hf)/.test(s)) return s.replace(/【路線】(fate|ubw|hf)/, "【路線】" + r);
  return (s ? s + "｜" : "") + "【路線】" + r;
}
function getFiredPins_(memory) { var m = String(memory || "").match(/【史】([^|【]*)/); return m && m[1] ? m[1].split(",").filter(Boolean) : []; }
function addFiredPin_(memory, id) {
  var list = getFiredPins_(memory); if (list.indexOf(id) < 0) list.push(id);
  var s = String(memory || "");
  if (/【史】[^|【]*/.test(s)) return s.replace(/【史】[^|【]*/, "【史】" + list.join(","));
  return (s ? s + "｜" : "") + "【史】" + list.join(",");
}

// 世界查詢：某真名的敵從者是否仍在世（未 DEAD_）
function foeServantAlive_(sheets, gameId, realName) {
  var data = sheets.pc.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.FACTION]) !== "敵從者") continue;
    if (String(data[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (String(data[i][COL.PC.NAME]).indexOf(realName) >= 0) return true;
  }
  return false;
}

// 🩸 Heaven's Feel「影」：夜裡吞噬一名仍在世的敵從者（非玩家所殺，直接消失於棋盤＋黑泥污染演出）
function shadowDevourFoe_(sheets, gameId) {
  var data = sheets.pc.getDataRange().getValues();
  var cand = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.FACTION]) !== "敵從者") continue;
    if (String(data[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    cand.push(i);
  }
  if (!cand.length) return "";
  var idx = cand[Math.floor(Math.random() * cand.length)];
  var name = String(data[idx][COL.PC.NAME]);
  data[idx][COL.PC.ID] = "DEAD_" + String(data[idx][COL.PC.ID]);
  data[idx][COL.PC.HP] = 0;
  data[idx][COL.PC.STATUS] = JSON.stringify({ "衣服": "被黑泥吞沒", "姿勢": "拖入暗影", "負面": "為『影』所噬·消滅", "顏面": "被黑暗淹沒" });
  sheets.pc.getRange(idx + 1, 1, 1, data[idx].length).setValues([data[idx]]);
  return name;
}

// 🖤 HF「黑化(Alter)」：把一名仍在世的敵從者拖入黑泥、強化為墮落之軀（六圍升＋狂化），改變棋盤難度
function blackenFoe_(sheets, gameId) {
  var data = sheets.pc.getDataRange().getValues();
  var cand = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][COL.PC.FACTION]) !== "敵從者") continue;
    if (String(data[i][COL.PC.GAME_ID] || "") !== gameId) continue;
    if (String(data[i][COL.PC.ID]).startsWith("DEAD_")) continue;
    if (/黑化|Alter/.test(String(data[i][COL.PC.MEMORY] || ""))) continue; // 已黑化過則跳過
    cand.push(i);
  }
  if (!cand.length) return "";
  var idx = cand[Math.floor(Math.random() * cand.length)];
  var name = String(data[idx][COL.PC.NAME]);
  // 六圍：筋力/敏捷/魔力各 +1 階（附 '+'）
  try {
    var six = JSON.parse(data[idx][COL.PC.SIX] || "{}");
    ["筋力", "敏捷", "魔力"].forEach(function (k) { if (six[k]) six[k] = String(six[k]) + "+"; });
    data[idx][COL.PC.SIX] = JSON.stringify(six);
  } catch (e) { }
  // 技能：補一道狂化(mad)
  try {
    var tg = JSON.parse(data[idx][COL.PC.TAGS] || "{}"); tg.skills = tg.skills || [];
    if (!tg.skills.some(function (s) { return s && s.fx === "mad"; })) tg.skills.push({ n: "黑泥狂化", r: "B", fx: "mad" });
    data[idx][COL.PC.TAGS] = JSON.stringify(tg);
  } catch (e) { }
  // HP 上調、狀態標記黑化
  var hp = parseInt(data[idx][COL.PC.MAX_HP]) || 480;
  data[idx][COL.PC.MAX_HP] = Math.round(hp * 1.15); data[idx][COL.PC.HP] = data[idx][COL.PC.MAX_HP];
  data[idx][COL.PC.STATUS] = JSON.stringify({ "衣服": "黑泥纏覆", "姿勢": "妖異佇立", "負面": "黑化·Alter", "顏面": "理性盡褪的兇光" });
  data[idx][COL.PC.NAME] = /黑化/.test(name) ? name : (name + "〔黑化〕");
  data[idx][COL.PC.MEMORY] = String(data[idx][COL.PC.MEMORY] || "") + "｜【黑化Alter】為影所染、墮落兇暴。";
  sheets.pc.getRange(idx + 1, 1, 1, data[idx].length).setValues([data[idx]]);
  return name;
}

// ── 路線「自然浮現」評分：依願望性質 ＋ 與自身從者的羈絆 ＋ 殺/放傾向，選分最高者 ──
function lockRoute_(sheets, masterRow, gameId) {
  var score = { fate: 1, ubw: 0, hf: 0 }; // fate 為預設基底
  try {
    var wish = String(extractWish_(masterRow[COL.PC.MEMORY]) || "");
    // 願望性質 → 路線傾向
    if (/正義|拯救|救世|守護所有|和平|英雄|理想/.test(wish)) score.fate += 2;
    if (/真相|力量|質問|證明|超越|劍|貫徹自我|變強/.test(wish)) score.ubw += 2;
    if (/守護(她|他|某人|一個人)|愛|不惜一切|獨佔|贖罪|代價|沉淪/.test(wish)) score.hf += 2;
    // 與自身從者的羈絆越深 → 越偏 fate（並肩作戰的王道）
    if (sheets.rel) {
      var rels = sheets.rel.getDataRange().getValues();
      var sv = null;
      var pcAll = sheets.pc.getDataRange().getValues();
      for (var i = 1; i < pcAll.length; i++) {
        if (String(pcAll[i][COL.PC.FACTION]) === "從者" && String(pcAll[i][COL.PC.GAME_ID] || "") === gameId && !String(pcAll[i][COL.PC.ID]).startsWith("DEAD_")) { sv = pcAll[i][COL.PC.NAME]; break; }
      }
      if (sv) {
        for (var j = 1; j < rels.length; j++) {
          if (rels[j][COL.REL.PC] === masterRow[COL.PC.NAME] && rels[j][COL.REL.NPC] === sv) {
            var fav = parseInt(rels[j][COL.REL.FAV]) || 0;
            if (fav >= 60) score.fate += 2; else if (fav >= 30) score.fate += 1;
          }
        }
      }
    }
    // 殺戮傾向：已斬殺的敵從者越多 → 越偏 hf（黑暗化）
    var data = sheets.pc.getDataRange().getValues(), kills = 0;
    for (var k = 1; k < data.length; k++) {
      if (String(data[k][COL.PC.GAME_ID] || "") !== gameId) continue;
      if (String(data[k][COL.PC.FACTION]) === "敵從者" && String(data[k][COL.PC.ID]).startsWith("DEAD_")) kills++;
    }
    if (kills >= 3) score.hf += 2; else if (kills >= 2) score.hf += 1;
  } catch (e) { }
  // 取最高分（平手偏 fate→ubw→hf）
  var best = "fate", bv = score.fate;
  if (score.ubw > bv) { best = "ubw"; bv = score.ubw; }
  if (score.hf > bv) { best = "hf"; bv = score.hf; }
  return best;
}

// ──────────────────────────────────────────────
// 📌 正典針腳表。route '' = 三線共用；'fate'/'ubw'/'hf' = 該線專屬（僅第五次）。
//   day = 第幾日起可觸發；band = 時段(null=不限)；loc = 地點(null=不限/世界事件)；
//   when(ctx) = 額外世界條件(可省)；effect(ctx) = 觸發時的世界變動(可省，回傳補充字串)。
//   beat = 餵給 AI 的系統旁白針（演出用，留白、勿輸出數值）。
// ──────────────────────────────────────────────
var CANON_PINS = [
  // ═══ 第五次・前期（三線共用）═══
  { id: '5_open', war: '5th', route: '', day: 1, band: null, loc: null,
    beat: '【正典·開戰】第五次聖杯戰爭的帷幕已然拉開。冬木的夜色裡，七組御主與從者各自潛伏。請以揭幕的筆觸點出戰爭已起、空氣中魔力的躁動，但不替御主決定行動。' },
  { id: '5_lancer_school', war: '5th', route: '', day: 1, band: '夜', loc: '穗群原學園', grace: 2,
    lure: '⚐ 入夜後，穗群原學園的方向隱隱傳來金鐵交擊的餘音——似乎有從者在校舍交手。',
    when: function (c) { return c.foeAlive('庫·丘林') || c.foeAlive('庫丘林'); },
    beat: '【正典·目擊】夜半校舍，藍衣槍兵（Lancer・庫丘林）與紅衣弓兵的身影在屋頂交錯激戰，紅槍如赤光劃破黑暗。這是聖杯戰爭的第一場照面——目擊者依例該被滅口。請演出這驚鴻一瞥的危險與壓迫，留白於御主的抉擇。' },
  { id: '5_church', war: '5th', route: '', day: 2, band: null, loc: '言峰教會', grace: 3,
    lure: '⚐ 言峰教會的鐘聲在冬木夜空迴盪——傳聞那裡的神父是這場戰爭的「中立監督者」，會向參戰者說明規則。',
    beat: '【正典·教會】言峰綺禮神父於教會以「中立監督者」之姿說明聖杯戰爭規則：七騎從者、相互殘殺至最後一騎、敗者御主可至教會尋求庇護。請以神父陰沉莫測的語氣鋪陳規則與那份令人不安的「喜悅」，勿替御主表態。' },
  { id: '5_caster_temple', war: '5th', route: '', day: 3, band: null, loc: null,
    when: function (c) { return c.foeAlive('美狄亞'); },
    beat: '【正典·神殿陰影】柳洞寺的魔術師（Caster・美狄亞）開始在冬木張開巨大結界、暗中擄取沉睡市民的精氣以充魔力。新都隱隱浮動不祥的魔力潮汐。請以風聞或夜風中的異樣帶出這股威脅。' },
  // ═══ 第五次・中盤鎖線後（專屬）═══
  { id: '5f_excalibur', war: '5th', route: 'fate', day: 6, band: null, loc: null,
    when: function (c) { return c.foeAlive('赫拉克勒斯'); },
    beat: '【Fate線·光之巨人】狂戰士（Berserker・赫拉克勒斯）那十二次都殺不盡的不死之軀，成為橫亙於正道之前的巨壁。唯有聖劍的真名解放之光（誓約勝利之劍）能一口氣燒盡他的命數。請鋪陳這場非極限一擊不能破的死鬥前夕。' },
  { id: '5u_archer', war: '5th', route: 'ubw', day: 6, band: null, loc: null,
    when: function (c) { return c.foeAlive('無名（EMIYA）') || c.foeAlive('EMIYA'); },
    beat: '【UBW線·理想的對質】紅衣弓兵（Archer・EMIYA）冷笑著質問「正義的伙伴」這份理想的虛偽——他展開無限劍製的劍之地平，那是與你映照彼此的固有結界。請演出理想與其終點的對峙、無數劍刃林立的荒原。勿替御主回答。' },
  { id: '5h_shadow', war: '5th', route: 'hf', day: 5, band: '深夜', loc: null,
    when: function (c) { return c.anyFoeAlive(); },
    effect: function (c, sh) { var n = shadowDevourFoe_(sh, c.gameId); return n ? ('今夜，「' + n + '」被『影』吞噬、消滅於黑泥之中——這並非死於誰之手。') : ''; },
    beat: '【HF線·影】聖杯已然扭曲。一團蠕動的「影」在冬木的暗夜遊走，吞噬從者的靈基為食。它不屬於任何御主、無法以常理對抗。今夜，又一騎從者被黑泥拖入了無底的暗。請演出這股令戰爭規則崩壞的、令人毛骨悚然的恐怖。' },
  { id: '5h_alter', war: '5th', route: 'hf', day: 7, band: '深夜', loc: null,
    when: function (c) { return c.anyFoeAlive(); },
    effect: function (c, sh) { var n = blackenFoe_(sh, c.gameId); return n ? ('「' + n + '」被黑泥侵蝕、墮為黑化之軀（Alter），靈基扭曲而更為兇暴。') : ''; },
    beat: '【HF線·黑化】『影』的污染不只是吞噬——它能將一騎從者拖入黑泥、扭曲成墮落的「Alter」：理性褪去、力量卻更為狂暴險惡（正如被影染黑的黑Saber）。今夜，又一道靈基墮入了黑暗。請以妖異而壓迫的筆觸演出這份墮落的恐怖。' },
  { id: '5h_sakura', war: '5th', route: 'hf', day: 9, band: null, loc: null,
    beat: '【HF線·聖杯之闇】黑泥的源頭、那被聖杯選為容器之人的悲劇逐漸浮現。這條路沒有純粹的正義，只有「要守護的人」與要為此背負的罪。請以沉重而溫柔交織的筆觸鋪陳這份覺悟。' },
  // ═══ 第五次・終盤（三線共用收束）═══
  { id: '5_gilgamesh', war: '5th', route: '', day: 9, band: null, loc: null,
    beat: '【正典·黃金之王】金色的英雄王（Archer・吉爾伽美什）自上一場戰爭殘存至今，傲慢地俯瞰這場戲的落幕，王之財寶的金光在他背後如星海展開。最古老的英雄，是橫亙在聖杯之前的最後巨壁之一。請演出那俯視眾生的壓迫感。' },

  // ═══ 第四次・固定線性悲劇（route 一律 ''）═══
  { id: '4_open', war: '4th', route: '', day: 1, band: null, loc: null,
    beat: '【Fate/Zero·開戰】第四次聖杯戰爭。這是一場沒有童話、只有大人們以性命與信念互搏的泥沼。冬木的夜空下，七組殺意各自就位。請以冷峻、現實主義的筆觸揭幕。' },
  { id: '4_kayneth', war: '4th', route: '', day: 2, band: '夜', loc: null,
    when: function (c) { return c.foeAlive('迪盧木多·奧迪那') || c.foeAlive('迪盧木多'); },
    beat: '【Fate/Zero·雙槍騎士】忠義的槍兵（Lancer・迪盧木多）持破魔紅薔薇與必滅黃薔薇登場，他的忠誠終將被自己的御主背叛而走向悲劇。請鋪陳這位騎士的高潔與命運的陰影。' },
  { id: '4_rider', war: '4th', route: '', day: 3, band: null, loc: null,
    when: function (c) { return c.foeAlive('伊斯坎達爾（征服王）') || c.foeAlive('伊斯坎達爾'); },
    beat: '【Fate/Zero·征服王】豪邁的征服王（Rider・伊斯坎達爾）駕神威車輪、暢談王道與霸業，與少年御主韋伯的羈絆是這場悲劇中難得的光。請演出那份壓倒性的王者氣度與豪情。' },
  { id: '4_caster_horror', war: '4th', route: '', day: 4, band: '深夜', loc: null,
    when: function (c) { return c.foeAlive('吉爾·德·萊斯（青鬍子）') || c.foeAlive('吉爾德萊'); },
    beat: '【Fate/Zero·瘋狂】失心的術師（Caster・青鬍子）與其御主雨生龍之介在冬木犯下擄殺孩童的連續慘案，召喚深淵巨獸。整座城市籠罩在最純粹的惡意之下。請以壓抑、戰慄的筆觸帶出這份瘋狂。' },
  { id: '4_kiritsugu', war: '4th', route: '', day: 7, band: null, loc: null,
    beat: '【Fate/Zero·魔術師殺手】不擇手段的魔術師殺手衛宮切嗣，以最冷酷務實的方式狙殺御主而非從者。沒有騎士道，只有「用最少代價終結戰爭」的算計。請演出那份令騎士們不齒、卻為了大義的冷血。' },
  { id: '4_grail_curse', war: '4th', route: '', day: 10, band: null, loc: null,
    beat: '【Fate/Zero·污泥】這場戰爭的終點，是被污染的聖杯傾瀉而出的黑色泥火，將冬木化為焦土。第四次的悲劇，正是第五次一切災厄的源頭。請以末日般沉痛的筆觸預示這份詛咒。' }
];

// ── 觸發檢查：回傳本次該演出的 beat 字串陣列（並寫回 route/已觸發狀態）──
//   呼叫時機：推進時間的行動（移動抵達、休息、戰後）後。回傳空陣列＝無事發生。
function checkCanonPins_(sheets, pcId) {
  try {
    var data = sheets.pc.getDataRange().getValues();
    var pIdx = data.findIndex(function (r) { return r[COL.PC.ID] == pcId; });
    if (pIdx < 0) return [];
    var master = data[pIdx];
    var gameId = String(master[COL.PC.GAME_ID] || "");
    if (!gameId || gameId.indexOf("g_") !== 0) return []; // 僅正式聖杯戰爭世界
    var memory = String(master[COL.PC.MEMORY] || "");
    var war = getWarName_(memory);
    if (war === "chaos") return []; // 混亂模式無正典軌

    var clk = getClock_(gameId);
    var day = clk ? clk.day : 1, band = clk ? timeBand_(clk.hour) : "夜";
    var loc = String(master[COL.PC.LOC] || "").trim();
    var route = getRoute_(memory);

    // 第五次：到樞紐日仍未鎖線 → 依玩家走向自然浮現
    var newRoute = "";
    if (war === "5th" && !route && day >= ROUTE_PIVOT_DAY) {
      route = lockRoute_(sheets, master, gameId);
      newRoute = route;
    }

    var fired = getFiredPins_(memory);
    var ctx = {
      gameId: gameId, day: day, band: band, loc: loc, route: route, war: war,
      foeAlive: function (nm) { return foeServantAlive_(sheets, gameId, nm); },
      anyFoeAlive: function () { return aliveEnemyServants_(sheets, gameId) > 0; }
    };

    var beats = [], leads = [], firedNew = [];
    for (var i = 0; i < CANON_PINS.length; i++) {
      var p = CANON_PINS[i];
      if (p.war !== war) continue;
      if (fired.indexOf(p.id) >= 0) continue;
      if (p.route && p.route !== route) continue;        // 路線專屬且未走該線
      if (p.day && day < p.day) continue;                // 未到日
      if (p.when && !p.when(ctx)) continue;              // 世界條件不符（如該敵已亡→跳過，正史被逆轉）

      var bandOk = !p.band || p.band === band;
      var locOk = !p.loc || p.loc === loc;
      if (bandOk && locOk) {
        // ✦ 條件齊備：正式觸發此幕
        var extra = "";
        if (p.effect) { try { extra = p.effect(ctx, sheets) || ""; } catch (e) { } }
        beats.push(p.beat + (extra ? ("\n〔世界變動〕" + extra) : ""));
        firedNew.push(p.id);
      } else {
        // ✦ 尚未到位（時段／地點不符）。非嚴格：寬限過後改以「事後風聞」補述，劇情不卡死。
        var grace = (typeof p.grace === "number") ? p.grace : 2;
        if (p.day && day >= p.day + grace) {
          var late = p.late || ("〔遲來的風聞〕" + p.beat + "\n★改以『御主事後從風聞、痕跡或他人口中得知』的角度補述（玩家並未親臨現場），語氣較淡。");
          beats.push(late);
          firedNew.push(p.id);
        } else if (p.lure) {
          // 引導：把玩家勾過去（顯示為一條提示，不算觸發）
          leads.push(p.lure);
        }
      }
    }

    // 寫回狀態（路線 + 已觸發）
    if (newRoute || firedNew.length) {
      var mem2 = memory;
      if (newRoute) mem2 = setRoute_(mem2, newRoute);
      for (var f = 0; f < firedNew.length; f++) mem2 = addFiredPin_(mem2, firedNew[f]);
      master[COL.PC.MEMORY] = mem2;
      sheets.pc.getRange(pIdx + 1, COL.PC.MEMORY + 1).setValue(mem2);
    }
    return { beats: beats, leads: leads, route: route };
  } catch (e) { return { beats: [], leads: [], route: "" }; }
}
