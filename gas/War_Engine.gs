// ⚔️ 新聖杯戰爭引擎：純函式，不碰試算表也不碰 AI，Node 模擬器直接載入同一份。為什麼這樣設計：見 CODE_NOTES.md『WAR_』。
//   一天兩個決定（白天一件事、夜裡去哪），戰鬥每回合選一個姿態；GAS 算完結果，AI 只負責演。

var WAR_ = {
  NIGHTS: 14,            // 幾夜內分出勝負
  MASTER_HP: 100,
  SEALS: 3,
  ROUNDS: 3,             // 一場戰鬥最多幾回合，天亮就各自退去
  FINAL_ROUNDS: 12,      // 最後一夜的決戰打到有人倒下（保險上限）
  FINAL_REST: 1,         // 最後一夜前剩下的人都養好了傷（1＝回滿）
  NP_COOLDOWN: 4,        // 放完寶具，御主的魔力要幾個早晨才回得來
  SUPPLY_CD: 2,          // 補魔一次讓魔力早回來幾夜
  STAT_SPREAD: 0.5,      // 階級差距打幾折：原作強弱還在，但抽到誰不至於開局就定勝負
  NP_FLOOR: 3,           // 寶具欄寫「-」但真的有招（小次郎的燕返）就當 C 級
  HP_BASE: 140, HP_PER_DEF: 20,
  HIT_BASE: 0.65, HIT_PER_SPD: 0.06, HIT_MIN: 0.35, HIT_MAX: 0.92,
  DMG_BASE: 10, DMG_PER_ATK: 4.5, DMG_DEF: 1.5, DMG_MIN: 5,
  NP_BASE: 30, NP_PER_RANK: 12, NP_DEF: 2,
  WEAK: 1.25,            // 知道對方真名：看穿弱點
  PROBE: 0.5,            // 試探：這回合雙方傷害都減半
  HOME: 0.75,            // 固守：在自家據點受到的傷害
  CLASH_WIN: 0.6,        // 寶具對轟：贏的那一方打出幾成
  REST_HEAL: 0.6, REST_MASTER: 40, SUPPLY_HEAL: 0.15, NIGHT_HEAL: 0.10,
  ENEMY_REST_HEAL: 0.15,
  NP_MASTER_HIT: 15,     // 我方被寶具正面打中，御主也被餘波捲到
  ASSASSIN_MASTER_HIT: 8,
  RETREAT_BASE: 0.55, RETREAT_PER_SPD: 0.08, RETREAT_MIN: 0.15, RETREAT_MAX: 0.95,
  FIND_BASE: 0.10, FIND_OUT: 0.12, FIND_EXPOSED: 0.20, FIND_SCOUT: 0.05,
  HUNT: 0.7, HUNT_EXPOSED: 0.15, HUNT_WOUNDED: 0.15,
  HUNT_LATE: 0.06, FIND_LATE: 0.03,   // 每倒下一位從者，剩下的人更急著找出彼此（原作：人越少越只能再戰）
  PATROL_MEET: 0.65,
  SCOUT_DEEP: 0.35,      // 打聽時順便看穿一位真名的機率
  NEWS_REVEAL: 0.5,      // 早報裡交手的兩方，各有幾成機會被你記下職階與位置
  BOUNTY_DAY: 3,         // 教會在第幾天早上發出討伐令
  SORTIE_SHOW: 3,        // 夜晚直接列出幾個出擊目標，其餘收進「其他目標」
  SEAL_NP_COST: 30       // 寶具還在冷卻、用令咒硬放：御主拿自己的魔力去填，御主扣這麼多（原作士郎硬撐寶具差點送命）
};

// 教會討伐令（原作：第四次綺禮為連續孩童失蹤案懸賞 Caster；第五次 Caster 在城裡吸取居民的精氣）。打倒目標的人多得一劃令咒。
var WAR_BOUNTY_ = {
  cls: 'Caster',
  why: { '4th': '冬木的連續孩童失蹤案', '5th': '城裡接連有人昏倒的怪事', chaos: '城裡接連有人失蹤的怪事' }
};

// 最後一夜在哪裡：照原作，第五次是柳洞寺（大聖杯在圓藏山地底），第四次是新都的冬木市民會館。混亂照大聖杯所在。
var WAR_FINAL_ = {
  chaos: { place: '柳洞寺', arrive: '剩下的從者陸續來到寺院', next: '石階上又來了一位從者' },
  '5th': { place: '柳洞寺', arrive: '剩下的從者陸續來到寺院', next: '石階上又來了一位從者' },
  '4th': { place: '冬木市民會館', arrive: '剩下的從者陸續來到會館', next: '大廳裡又來了一位從者' }
};
function warFinal_(st) { var r = warRoute_(st); return (r && r.final) || WAR_FINAL_[st && st.war] || WAR_FINAL_['5th']; }
// 這一局暗中走的路線（WAR_ROUTES_，只有第五次有）；沒有回 null。
function warRoutes_(war) { return (typeof WAR_ROUTES_ !== 'undefined' && WAR_ROUTES_[war]) || null; }
function warRoute_(st) { var R = warRoutes_(st && st.war); return R && st.route ? R[st.route] || null : null; }

// 每場戰爭各自的節奏。brawl＝敵人夜裡撞見彼此時動手的機率（乘上個性的出手慾）：
//   第四次只剩六組對手，互打太兇就只剩收尾給你；第五次八組，互相消耗是撐起中盤的東西。模擬器量過（CODE_NOTES『WAR_』）。
var WAR_PACE_ = { '5th': { brawl: 0.95 }, '4th': { brawl: 0.2 }, chaos: { brawl: 0.75 } };

// 玩家是額外加入的一組主從：原作陣容一個都不拿掉，你只能召喚不在這場戰爭的從者（混亂隨機除外）。
// 混亂隨機：從全部從者抽 size 位當對手（有原作御主的帶上御主），沒有原作事件、沒有晚登場。
var WAR_CHAOS_ = { size: 7, locs: ['冬木·深山町', '冬木·新都', '未遠川', '冬木大橋', '柳洞寺', '言峰教會', '穗群原學園'] };
var WAR_WARS_ = ['5th', '4th', 'chaos'];
// 開局要的名冊（唯一出口：GAS、重新召喚、模擬器都走這裡）：{ pool, roster, seeds, masterNames, chaos }
function warSetup_(war) {
  var seeds = {}, masterNames = {};
  SEED_SERVANTS.forEach(function (s) { seeds[s.id] = s; });
  SEED_MASTERS.forEach(function (m) { masterNames[m.id] = m.name; });
  var all = SEED_SERVANTS.filter(function (s) { return s.cls !== '御主'; });
  if (war === 'chaos') {
    var roster = [], seen = {};
    FATE_5TH_ROSTER.concat(FATE_4TH_ROSTER).forEach(function (r) {
      if (seen[r.hero]) return; seen[r.hero] = 1;
      roster.push({ master: r.master, masterLabel: r.masterLabel, hero: r.hero, loc: r.loc });
    });
    all.forEach(function (s, i) { if (!seen[s.id]) roster.push({ master: null, hero: s.id, loc: WAR_CHAOS_.locs[i % WAR_CHAOS_.locs.length] }); });
    return { pool: all, roster: roster, seeds: seeds, masterNames: masterNames, chaos: true };
  }
  var canon = war === '4th' ? FATE_4TH_ROSTER : FATE_5TH_ROSTER;
  var inWar = {}; canon.forEach(function (r) { inWar[r.hero] = 1; });
  return { pool: all.filter(function (s) { return !inWar[s.id]; }), roster: canon, seeds: seeds, masterNames: masterNames, chaos: false };
}
// 這場戰爭的原作參戰者（玩家不能召喚）。混亂隨機沒有。
function warCanonHeroes_(war) {
  if (war === 'chaos') return [];
  return (war === '4th' ? FATE_4TH_ROSTER : FATE_5TH_ROSTER).map(function (r) { return r.hero; });
}
function warPace_(st) { var r = warRoute_(st); return (r && r.pace) || WAR_PACE_[st && st.war] || WAR_PACE_['5th']; }   // 路線可以有自己的節奏

// 職階：敵人的個性（aggr 越高越愛出手）。技能不看職階，看每位從者自己的技能（WAR_SKILL_）。
var WAR_CLASS_ = {
  Saber: { aggr: 0.5 }, Archer: { aggr: 0.5 }, Lancer: { aggr: 0.6 }, Rider: { aggr: 0.5 },
  Caster: { aggr: 0.25 }, Assassin: { aggr: 0.4 }, Berserker: { aggr: 0.85 }
};
function warClass_(cls) { return WAR_CLASS_[cls] || { aggr: 0.5 }; }

// 敵方從者的原作性格（鍵＝英靈殿 ID）：蓋在職階個性上。只在敵人身上生效。
//   aggr 出手慾（取代職階值）　guard 守在原地：不夜襲你、不撤退（別人找上門照樣打）　noRetreat 不撤退
//   scout 奉命偵察：第一回合試探，打不贏就撤　nemesis 看到這位英靈就會找上門　findMul 找到你據點的機率 ×
//   meet 交手時的開場一句（不寫真名）
var WAR_TEMPER_ = {
  '佐佐木小次郎-Assassin': { guard: 1, meet: '山門前的石階上，有人背著長刀靜靜等著。' },
  '吉爾伽美什-Archer': { aggr: 0.3, noRetreat: 1, meet: '對方一臉不屑，像在看一場無聊的餘興。' },
  '庫丘林-Lancer': { scout: 1, meet: '對方沒有急著分勝負，先打量了你們一眼。' },
  '蘭斯洛特-Berserker': { nemesis: '阿爾托莉雅-Saber', nemesisMeet: '黑色的狂戰士一看見{sv}，發出了嘶吼。' },
  '百貌哈桑-Assassin': { findMul: 2, meet: '四周的暗處不只一道氣息。' },
  '阿爾托莉雅-Saber': { noRetreat: 1, meet: '對方握著看不見的武器，正面擺開了架勢。' },
  '赫拉克勒斯-Berserker': { noRetreat: 1, meet: '白髮的少女站在巨人身旁，提起裙襬行了個禮。' },
  '美杜莎-Rider': { aggr: 0.35, meet: '對方身後的少年先開了口，話說得比從者還多。' },
  'EMIYA-Archer': { meet: '遠處的高樓上閃過一道反光，箭比腳步聲先到。' },
  '美狄亞-Caster': { aggr: 0.2, meet: '空氣裡飄著細細的魔力絲線，這一帶早就是對方的地盤。' },
  '迪盧木多-Lancer': { meet: '對方沒有躲藏，堂堂正正地站在路中央等你們。' },
  '伊斯坎達爾-Rider': { meet: '雷鳴由遠而近，駕著戰車的巨漢大笑著要你們報上名來。' },
  '吉爾德萊-Caster': { meet: '潮濕的腥味裡，有什麼東西在暗處蠕動。' }
};
function warTemper_(e) { return (e && WAR_TEMPER_[e.hero]) || {}; }
function warAggr_(e) { var t = warTemper_(e); return t.aggr !== undefined ? t.aggr : warClass_(e.cls).aggr; }

// ── 技能：一張表、固定幾個時機 ──────────────────────────
// 每個技能（鍵＝種子的 fx）只寫「在哪個時機、改什麼數字」；引擎只在固定的時機讀表，技能自己不寫程式。加技能＝往表加一列。
// 時機一覽（全部都是「這個技能的主人」身上的事）：
//   dmgDealt／npDealt   我打出去的普攻／寶具傷害 ×
//   dmgTaken／npTaken   我挨的普攻／寶具傷害 ×　　hitTaken  對方打中我的機率 ×
//   from               只對這個職階的攻擊生效（限上面三個 Taken）
//   retreat／chase      我撤退成功率 +／對方從我手上撤退的成功率 −
//   lastStand          一場戰鬥裡第一次致命傷撐住（留 1 點；挨打前要還沒到重傷）　　seeNp  對方要放寶具時一定看得出來
//   noProbe            沒辦法試探（敵人身上：也不會撤退）
//   ambush／ambushDmg  我出擊時第一擊必中／那一擊的傷害 ×　　homeTaken  在自家迎戰時挨的傷害再 ×
//   ward               有人闖進我的據點（或我守家）先吃魔術陣：對方最大血量的幾成　　wardTaken  我挨魔術陣 ×
//   findMe／findThem   我的據點被找到的機率 ×／我找到別人據點的機率 ×　　hideScout  別人打聽我時落空的機率
//   scoutExtra／scoutRest／patrolMeet   打聽多看幾處／打聽時從者自己去、御主與從者順便休息幾成／巡邏必遇
//   restHeal           休養與補魔時多回幾成　　npCd  放完寶具的冷卻夜數 +（負的＝比較快回來）
//   lives／revive       整場戰爭可以死而復生幾次／每次回復幾成（十二試煉；被破戒時失效）
//   npSure             我的寶具不會因對方試探的防備而減半　　hitUp  我的正面攻擊命中率 +
//   weakAlways         不必看穿真名也打得中弱點　　clash  寶具對轟時多幾分
//   vs                 只對身上帶這個旗標的對手生效（限 dmgDealt／npDealt）　　fromSex  只對這個性別的攻擊生效（限 Taken）
//   lock               對手身上帶這個旗標就撤退不了　　nullDef  對手的 Taken 減傷／閃避對我無效
//   curse              我打中的那些傷，我還活著時對方好不了（必滅黃薔薇：記實際傷害量，壓低回血上限）
//   veil               試探與打聽看不穿我的真名（放寶具還是會曝光）　　divine  神性（給 lock／vs 認的旗標，本身不改數字）
//   技能沒有對應的列＝逸話：照樣列在角色身上（畫面標「逸話」），不影響戰鬥。
var WAR_FORESEE_ = { txt: '看得出寶具預兆・較不易被擊中', seeNp: 1, npTaken: 0.8, hitTaken: 0.88 };
var WAR_MAGECRAFT_ = { txt: '魔術攻擊傷害提高', dmgDealt: 1.12 };
var WAR_LASTSTAND_ = { txt: '受到致命一擊時撐住一次（每場戰鬥一次・瀕死時無效）', lastStand: 1 };
var WAR_MIGHT_ = { txt: '攻擊傷害提高', dmgDealt: 1.08 };
var WAR_SKILL_ = {
  first_strike: WAR_FORESEE_, analyze: WAR_FORESEE_, insight: WAR_FORESEE_, sense: WAR_FORESEE_,
  survive: WAR_LASTSTAND_, regen: WAR_LASTSTAND_,
  god_hand: { txt: '死後復生（整場戰爭共 11 次・一擊夠重會連殺數次）', lives: 11, revive: 0.1 },
  ride: { txt: '撤退成功率提高・對手較難撤退', retreat: 0.3, chase: 0.15 },
  stealth: { txt: '據點不易被發現・不易被打聽・奇襲首擊必中', findMe: 0.7, hideScout: 0.5, ambush: 1 },
  territory: { txt: '在據點受到的傷害減少・入侵者先受魔術陣傷害', homeTaken: 0.73, ward: 0.22 },
  mad: { txt: '傷害提高・無法試探', dmgDealt: 1.18, noProbe: 1 },
  nullify_magic: { txt: '受 Caster 攻擊與魔術陣的傷害減少', from: 'Caster', dmgTaken: 0.7, npTaken: 0.7, wardTaken: 0.4 },
  aim: { txt: '巡邏必定遭遇敵人・打聽時多查兩處', patrolMeet: 1, scoutExtra: 2, findThem: 1.5 },
  solo: { txt: '打聽時同時休養', scoutRest: 0.35 },
  fast_cast: WAR_MAGECRAFT_,
  divine_age: { txt: '神代的魔術・對手的對魔力只擋得住一半', pierce: 1 },
  morale: { txt: '寶具傷害提高', npDealt: 1.08 },
  projection: { txt: '寶具冷卻縮短 1 夜', npCd: -1 },
  self_mod: WAR_MIGHT_, str_up: WAR_MIGHT_, burst: WAR_MIGHT_, weapon_steal: WAR_MIGHT_,
  crafting: { txt: '休養與補魔時恢復更多・做出的使魔擋在身前，較不易被擊中', restHeal: 0.25, hitTaken: 0.88 },
  summon_horror: { txt: '寶具自帶魔力爐・冷卻縮短 2 夜；海魔擋在身前・較不易被擊中', npCd: -2, hitTaken: 0.8 },
  evade_ranged: { txt: '不易被 Archer 擊中', from: 'Archer', hitTaken: 0.6 },
  tactics: { txt: '受到的寶具傷害減少・自身寶具傷害提高', npTaken: 0.75, npDealt: 1.1 },
  rule_breaker: { txt: '寶具命中時破除對手的技能，直到這場戰鬥結束', breakFx: 1 },
  clear_mind: { txt: '心如明鏡・較不易被擊中', hitTaken: 0.8 },
  petrify: { txt: '石化魔眼：對手動作遲緩，較難擊中、也較難撤退', hitTaken: 0.88, chase: 0.15 },
  gae_bolg: { txt: '因果逆轉：寶具不會因試探的防備而減半', npSure: 1 },
  tsubame: { txt: '三道劍閃同時斬出：正面攻擊很難躲開', hitUp: 0.15 },
  gob: { txt: '總能取出對手的剋星：真名未明也打得中弱點', weakAlways: 1 },
  chain: { txt: '對手很難撤退；有神性的對手撤退必定失敗', chase: 0.25, lock: 'divine' },
  divine: { txt: '神的血脈（天之鎖與弒神之力的目標）', divine: 1 },
  godslayer: { txt: '對有神性的對手，攻擊與寶具傷害提高', vs: 'divine', dmgDealt: 1.25, npDealt: 1.25 },
  ubw: { txt: '寶具對轟時佔優', clash: 1 },
  rho_aias: { txt: '受到的寶具傷害減少', npTaken: 0.8 },
  gae_dearg: { txt: '紅槍破除對手的防禦加護；黃槍劃下的傷，持有者還在就癒合不了', nullDef: 1, curse: 1 },
  zabaniya_many: { txt: '分裂成數十個自己：打聽時多查兩處', scoutExtra: 2 },
  zabaniya_heart: { txt: '掏出心臟的鏡像：寶具傷害提高', npDealt: 1.2 },
  shapeshift: { txt: '變換身形：受到的傷害減少', dmgTaken: 0.9, npTaken: 0.9 },
  rune: { txt: '符文護身：較不易被擊中・休養時恢復更多', hitTaken: 0.92, restHeal: 0.15 },
  lovespot: { txt: '女性對手出手時容易心軟', fromSex: '女', dmgTaken: 0.8, npTaken: 0.85 },
  wind_strike: { txt: '兵器隱形：試探與打聽看不穿真名', veil: 1 }
};
var WAR_FROM_HOOKS_ = { dmgTaken: 1, npTaken: 1, hitTaken: 1 };

// 讀表三支：乘、加、有沒有。foe＝對手（有 from 的時機要看對手職階）。
function warSkRows_(u) { return u && u.broken ? [] : ((u && u.fx) || []).map(function (f) { return WAR_SKILL_[f]; }).filter(Boolean); }
function warSkOk_(row, hook, foe) {
  if (row[hook] === undefined) return false;
  if (WAR_FROM_HOOKS_[hook] && row.from && (!foe || foe.cls !== row.from)) return false;
  if (WAR_FROM_HOOKS_[hook] && row.fromSex && (!foe || !foe.card || foe.card.gender !== row.fromSex)) return false;
  if (row.vs && !WAR_FROM_HOOKS_[hook] && !warFlag_(foe, row.vs)) return false;
  return true;
}
// 對手帶 pierce（神代魔術）：針對職階的減傷只剩一半效果；對手帶 nullDef：挨打的減傷整個不算。
function warMul_(u, hook, foe) {
  return warSkRows_(u).reduce(function (m, r) {
    if (!warSkOk_(r, hook, foe)) return m;
    if (WAR_FROM_HOOKS_[hook] && r[hook] < 1 && warFlag_(foe, 'nullDef')) return m;
    return m * (r.from && WAR_FROM_HOOKS_[hook] && warFlag_(foe, 'pierce') ? (1 + r[hook]) / 2 : r[hook]);
  }, 1);
}
function warAdd_(u, hook, foe) { return warSkRows_(u).reduce(function (a, r) { return warSkOk_(r, hook, foe) ? a + r[hook] : a; }, 0); }
function warNpCd_(u) { return Math.max(1, WAR_.NP_COOLDOWN + warAdd_(u, 'npCd')); }
function warFlag_(u, hook) { return warSkRows_(u).some(function (r) { return !!r[hook]; }); }
// 還剩幾條命（舊存檔沒有這一格：照技能現算）。
function warLives_(u) {
  if (u.lives !== undefined) return u.lives;
  return ((u && u.fx) || []).reduce(function (a, f) { return a + ((WAR_SKILL_[f] && WAR_SKILL_[f].lives) || 0); }, 0);   // 被破戒時加護失效，但命數本身還在
}
// 提供這個時機的技能叫什麼（畫面與說書要念出原作技能名）。
function warSkName_(u, hook) {
  var f = ((u && u.fx) || []).filter(function (x) { return WAR_SKILL_[x] && WAR_SKILL_[x][hook] !== undefined; })[0];
  return f ? ((u.skn && u.skn[f]) || f) : '技能';
}

// 階級字串 → 數字：E1 D2 C3 B4 A5 EX7，每個 + 多 0.4、每個 - 少 0.4。
function warRank_(r) {
  var s = String(r || '').trim().toUpperCase();
  if (!s) return 1;
  if (s.indexOf('EX') === 0) return 7;
  var v = { E: 1, D: 2, C: 3, B: 4, A: 5 }[s.charAt(0)] || 1;
  for (var i = 1; i < s.length; i++) { if (s.charAt(i) === '+') v += 0.4; else if (s.charAt(i) === '-') v -= 0.4; }
  return Math.max(0.6, v);
}

// 種子技能 → 表上有的 fx（同一個效果列只收一次）＋每個 fx 的原作技能名（畫面照這個顯示）。
function warSkillsOf_(seed) {
  var fx = [], names = {}, rows = [], lore = [], np = String(seed.np || '');
  (seed.classSkills || []).concat(seed.skills || []).forEach(function (x) {
    var f = x && x.fx, r = WAR_SKILL_[f], nm = String((x && x.n) || '').replace(/\s.*$/, '');
    if (!r) { if (nm && np.indexOf(nm) < 0 && lore.indexOf(nm) < 0) lore.push(nm); return; }
    if (rows.indexOf(r) >= 0) return;
    rows.push(r); fx.push(f); names[f] = nm;
  });
  return { fx: fx, names: names, lore: lore };
}
// 畫面上的技能列：有效果的寫「名：效果」，逸話只寫名字（前端靠有沒有「：」分）。
function warTraits_(u) {
  return ((u && u.fx) || []).map(function (f) {
    var r = WAR_SKILL_[f], t = (u.skn[f] || f) + '：' + r.txt;
    return r.lives ? t + '・剩 ' + warLives_(u) + ' 次' : t;
  }).concat(((u && u.lore) || []).map(function (n) { return n + '（逸話）'; }));
}
function warNpName_(np) {
  var first = String(np || '').split('／')[0];
  return first.replace(/（.*$/, '').replace(/\s+[A-Za-zÀ-ÿ].*$/, '').trim() || '寶具';
}

// 種子 → 戰鬥單位。攻擊取筋力與魔力較高的那個（Caster 靠魔力打）。
function warSpread_(v) { return 3.5 + (v - 3.5) * WAR_.STAT_SPREAD; }
function warUnit_(seed, extra) {
  var six = seed.six || {};
  var def = warSpread_(warRank_(six['耐久']));
  var mhp = Math.round(WAR_.HP_BASE + def * WAR_.HP_PER_DEF);
  var u = {
    hero: seed.id, cls: seed.cls, name: seed.realName || seed.id,
    npName: warNpName_(seed.np),
    atk: warSpread_(Math.max(warRank_(six['筋力']), warRank_(six['魔力']))),
    def: def, spd: warSpread_(warRank_(six['敏捷'])),
    np: warSpread_(Math.max(warRank_(seed.npRank || six['寶具']), seed.np ? WAR_.NP_FLOOR : 0)),   // npRank＝實際會放的那一招（吉爾伽美什平常只開王之財寶）
    mhp: mhp, hp: mhp, cd: 0, saved: false,
    noNp: !!seed.npPassive   // 寶具是常駐型（十二試煉、騎士不死於徒手）：沒有可以解放的一擊
  };
  var sk = warSkillsOf_(seed), p = seed.persona || {};
  u.fx = sk.fx; u.skn = sk.names; u.lore = sk.lore;
  u.card = { look: p.look || '', words: p.words || '', toMaster: p.toMaster || '', gender: seed.gender || '', np: String(seed.np || ''), book: Array.isArray(p.book) ? p.book : [] };   // 說書用，不進規則
  for (var k in (extra || {})) u[k] = extra[k];
  return u;
}

// mulberry32：狀態存在 st.rs，存檔、重玩、模擬器都拿得到同一串骰子。
function warRand_(st) {
  var t = (st.rs = (st.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function warPick_(st, arr) { return arr.length ? arr[Math.floor(warRand_(st) * arr.length)] : null; }
function warClamp_(v, a, b) { return Math.max(a, Math.min(b, v)); }

// ── 開局 ──────────────────────────────────────────────
// o：{ pool:[從者種子], roster:[{master, hero, loc, arriveDay}], seeds:{id→種子}, masterNames:{id→名字}, name, sex, war, seed }
function warNewGame_(o) {
  var st = {
    v: 1, war: o.war || '5th', day: 1, phase: 'summon', rs: (o.seed | 0) || 1, rerolls: (o.pool || []).length > 1 ? 1 : 0,
    master: { name: o.name || '御主', sex: o.sex || '男', wish: o.wish || '', hp: WAR_.MASTER_HP, mhp: WAR_.MASTER_HP, seals: WAR_.SEALS },
    sv: null, exposed: false, out: false, enemies: [], battle: null,
    engaged: [], ticked: [], met: [], hunted: false, foughtTonight: false,
    result: null, stats: { np: 0, battles: 0, kills: 0, seals: 0, retreats: 0, dodged: 0, ignoredTele: 0, finalFoes: 0 }, seq: 0
  };
  warSummon_(st, o);
  var R = warRoutes_(st.war);
  if (R) st.route = R[o.route] ? o.route : warPick_(st, Object.keys(R));
  return st;
}

// 召喚：從池子抽一位；對手是這場戰爭的正典陣容，抽到的那位從陣容裡拿掉。重抽也走這支。
function warSummon_(st, o) {
  var prev = st.sv ? st.sv.hero : '';
  var pool = (o.pool || []).filter(function (s) { return s.id !== prev; });
  var seed = warPick_(st, pool.length ? pool : (o.pool || []));
  st.sv = warUnit_(seed, {});
  st.enemies = []; st.reserve = [];
  var roster = (o.roster || []).filter(function (r) { return r.hero !== seed.id; });
  if (o.chaos) {   // 混亂隨機：洗牌後抽 size 位，原作的晚登場與開場事件都不帶
    for (var k = roster.length - 1; k > 0; k--) { var j = Math.floor(warRand_(st) * (k + 1)), t = roster[k]; roster[k] = roster[j]; roster[j] = t; }
    roster = roster.slice(0, WAR_CHAOS_.size).map(function (r) { return { master: r.master, masterLabel: r.masterLabel, hero: r.hero, loc: r.loc }; });
  }
  roster.forEach(function (r, i) {
    var hs = (o.seeds || {})[r.hero];
    if (!hs) return;
    (r.reserve ? st.reserve : st.enemies).push(warUnit_(hs, {   // 預備役：不算敵人，被叫醒（warAwaken_）才登場
      id: 'e' + i, master: (r.master && (o.masterNames || {})[r.master]) || r.masterLabel || '無主', loc: warLocName_(r.loc),
      arrive: r.arriveDay || 1, hint: r.arriveHint || '', fake: false, fakeTxt: r.fakeDeath || '', intel: 0, found: false, alive: true
    }));
  });
}
function warLocName_(loc) { return String(loc || '冬木').replace(/^冬木·/, ''); }

// ── 對外：這一刻能按的鈕（唯一真實來源；前端照畫、後端照驗）──
function warButtons_(st) {
  var sv = st.sv, B = [];
  if (st.phase === 'summon') {
    B.push({ t: 'start', label: '開戰', sub: '進入第 1 天' });
    B.push({ t: 'reroll', label: '重新召喚', sub: '剩 ' + st.rerolls + ' 次', dis: st.rerolls <= 0 });
  } else if (st.phase === 'day') {
    B.push({ t: 'scout', label: '打聽', sub: '探查敵方位置或真名' });
    B.push({ t: 'rest', label: '休養', sub: sv.curseDmg ? '從者與御主恢復（黃槍之傷 ' + sv.curseDmg + ' 好不了）' : '從者與御主恢復' });
    B.push({ t: 'supply', label: '補魔', sub: sv.noNp ? '從者少量恢復' : sv.cd > 0 ? (sv.cd <= WAR_.SUPPLY_CD ? '寶具今晚可用' : '寶具冷卻 −' + WAR_.SUPPLY_CD + ' 夜') : '寶具已就緒・少量恢復' });
  } else if (st.phase === 'night' && st.day >= WAR_.NIGHTS) {
    var left = warArrived_(st).filter(function (e) { return !e.fake; }).length;
    B.push({ t: 'final', label: '前往' + warFinal_(st).place, sub: '最後一夜・' + (left > 1 ? '剩餘 ' + left + ' 位從者全數到場' : '最後一位從者在場') });
  } else if (st.phase === 'night') {
    // 目標照「討伐令→勝算」排好，前幾位直接列出，其餘收進「其他目標」（more）
    warKnownFoes_(st).map(function (e) { return { e: e, k: (warBountyOn_(st, e) ? 100 : 0) + warOddsR_(st, e) }; })
      .sort(function (a, b) { return b.k - a.k; })
      .forEach(function (x, i) {
        var e = x.e;
        B.push({ t: 'sortie', id: e.id, label: '突襲 ' + warFoeLabel_(e), sub: warOdds_(st, e) + '・' + warHpWord_(e) + '・' + e.loc + (warBountyOn_(st, e) ? '・討伐令' : ''), more: i >= WAR_.SORTIE_SHOW });
      });
    B.push({ t: 'patrol', label: '巡邏', sub: '外出搜索，遭遇即戰鬥' });
    B.push({ t: 'hold', label: '固守', sub: '留守據點，遇襲時受傷減少' });
  } else if (st.phase === 'battle') {
    var e = warFoe_(st, st.battle.e);
    var berserk = warFlag_(sv, 'noProbe');
    B.push({ t: 'stance', s: 'strike', label: '正面', sub: '正面交鋒', sealSub: '令咒：必中・傷害 ×1.5' });
    B.push({ t: 'stance', s: 'probe', label: '試探', sub: berserk ? '狂化中無法使用' : (e.intel >= 2 || warFlag_(e, 'veil') ? '雙方傷害減半' : '雙方傷害減半・看穿真名'), dis: berserk });
    if (!sv.noNp) B.push({ t: 'stance', s: 'np', label: '寶具「' + sv.npName + '」', sub: sv.cd > 0 ? '冷卻中・還要 ' + sv.cd + ' 夜' : (st.exposed ? '最大威力' : '最大威力・會暴露真名'), sealSub: sv.cd > 0 ? '令咒：無視冷卻・對轟佔優・御主 −' + WAR_.SEAL_NP_COST : '令咒：對轟佔優', dis: sv.cd > 0, sealOk: true });
    if (st.battle.ctx !== 'final') B.push({ t: 'stance', s: 'retreat', label: '撤退', sub: '成功率：' + warChanceWord_(warRetreatChance_(sv, e, false)), sealSub: '令咒：必定撤離' });
  }
  return B;
}

// 按下去的東西必須出現在 warButtons_ 裡；令咒另外看剩幾劃。
function warAllowed_(st, act) {
  var list = warButtons_(st);
  var hit = list.filter(function (b) { return b.t === act.t && (b.id || '') === (act.id || '') && (b.s || '') === (act.s || ''); })[0];
  if (!hit) return '目前無法執行。';
  if (act.seal && (st.phase !== 'battle' || st.master.seals <= 0)) return '令咒已用盡。';
  if (act.seal && !hit.sealSub) return '這個行動無法使用令咒。';
  if (act.seal && act.s === 'np' && st.sv.cd > 0 && st.master.hp <= WAR_.SEAL_NP_COST) return '御主剩下的魔力不夠硬放寶具了。';
  if (hit.dis && !(act.seal && hit.sealOk)) return hit.sub || '現在不能這麼做。';
  return '';
}

// ── 對外：做一個決定 ──────────────────────────────────
// 回 { ok, msg, ev:[{k, txt, num}] }：txt 是給 AI 的事實（不含數字），num 是給畫面的數字。
// o：重新召喚才用得到的名冊（warSeedCtx_ 那一份）；其餘動作不看。
function warAct_(st, act, o) {
  act = act || {};
  if (st.phase === 'over') return { ok: false, msg: '戰局已結束。', ev: [] };
  var bad = warAllowed_(st, act);
  if (bad) return { ok: false, msg: bad, ev: [] };
  if (act.t === 'reroll' && !(o && (o.pool || []).length > 1)) return { ok: false, msg: '沒有其他可召喚的英靈。', ev: [] };
  var ev = [];
  st.seq = (st.seq || 0) + 1;
  if (st.phase === 'summon') warDoSummon_(st, act, ev, o);
  else if (st.phase === 'day') warDoDay_(st, act, ev);
  else if (st.phase === 'night') warDoNight_(st, act, ev);
  else if (st.phase === 'battle') warDoRound_(st, act, ev);
  return { ok: true, msg: '', ev: ev };
}

function warDoSummon_(st, act, ev, o) {
  if (act.t === 'reroll') {
    st.rerolls--;
    warSummon_(st, o);
    ev.push({ k: 'summon', txt: '重新召喚，回應的是 ' + st.sv.cls + '「' + st.sv.name + '」。' });
    return;
  }
  st.phase = 'day';
  ev.push({ k: 'start', txt: '第 1 天。聖杯戰爭開始，冬木還有 ' + warAliveCount_(st) + ' 組主從。' });
}
// 早報裡的原作事件（WAR_CANON_EVENTS_）：涉及的從者都還是活著、登場了的敵人才發生；效果只動情報與據點。
function warCanonEvents_(st, ev) {
  var list = typeof WAR_CANON_EVENTS_ !== 'undefined' ? WAR_CANON_EVENTS_ : [];
  var stepped = false;
  list.forEach(function (c) {
    if (c.war !== st.war || (c.route && c.route !== st.route)) return;
    // day＝到了那天；fallen＝倒下的從者累積到幾位（只發一次，記在 st.done；一個早上最多往前一段）
    var fallen = st.enemies.filter(function (e) { return !e.alive; }).length;
    if (c.fallen ? (stepped || fallen < c.fallen || (st.done || []).indexOf(c.id) >= 0) : c.day !== st.day) return;
    // after＝前面那幾幕真的發生過才接得上（文字會提到它們）
    if ((c.after || []).some(function (k) { return (st.happened || []).indexOf(k) < 0; })) return;
    var byHero = function (h) { return st.enemies.filter(function (e) { return e.hero === h && e.alive && (c.unmask || !e.fake) && e.arrive <= st.day; })[0]; };
    var need = c.need || [];
    if (!need.every(function (h) { return !!byHero(h); })) {
      // 涉及的從者已經先倒下（不是照原作倒的）：這一幕被改寫了
      if (c.short && need.some(function (h) { return st.enemies.some(function (e) { return e.hero === h && !e.alive && !e.canonDead; }); })) (st.rewrote = st.rewrote || []).push(c.short);
      return;
    }
    // 最後一位留給你：劇本只收得掉「還有別人在」的從者，不替玩家贏
    var kills = (c.kill || []).filter(function (h) { return !!byHero(h); }).length;
    if (kills && warAliveCount_(st) - kills < 1) return;
    if (c.fallen) { (st.done = st.done || []).push(c.id); stepped = true; }
    if (c.short) (st.happened = st.happened || []).push(c.short);
    if (c.unmask) need.forEach(function (h) { warUnmask_(st, byHero(h), ev); });   // 假死的那位在這一幕現身
    Object.keys(c.reveal || {}).forEach(function (h) { var e = byHero(h); if (e) e.intel = Math.max(e.intel, c.reveal[h]); });
    Object.keys(c.move || {}).forEach(function (h) { var e = byHero(h); if (e) e.loc = c.move[h]; });
    Object.keys(c.master || {}).forEach(function (h) { var e = byHero(h); if (e) e.master = c.master[h]; });
    (c.alter || []).forEach(function (h) { var e = byHero(h); if (e) warAlter_(e, WAR_ALTER_[h]); });
    ev.push({ k: 'news', txt: c.txt + '。' });
    (c.kill || []).forEach(function (h) { var e = byHero(h); if (e) warKill_(st, e, ev); });
    Object.keys(c.awaken || {}).forEach(function (h) { warAwaken_(st, h, c.awaken[h]); });
  });
}
// 照原作倒下（不經過戰鬥）：討伐令照樣結算，但不算誰打倒的、也不播 WAR_FALL_ 的餘波（這就是原作）。
function warKill_(st, e, ev) {
  e.hp = 0; e.alive = false; e.canonDead = true; e.intel = Math.max(e.intel, 1);
  warGone_(st, e);
  warBountyEnd_(st, e, false, ev);
}
// 一位從者退場的共同善後：它下的詛咒跟著消失。
function warGone_(st, u) {
  [st.sv].concat(st.enemies).forEach(function (x) { if (x && x.cursedBy === u.hero) { delete x.cursedBy; delete x.curseDmg; } });
}
// 叫醒預備役（或把還沒登場的提早）：明天登場，早報換成 hint。回傳有沒有叫到。
function warAwaken_(st, hero, hint) {
  if (st.day >= WAR_.NIGHTS) return false;   // 明天已經沒有了：叫醒也到不了場，還會卡住勝負
  var r = (st.reserve || []).filter(function (x) { return x.hero === hero; })[0];
  if (r) { st.reserve.splice(st.reserve.indexOf(r), 1); st.enemies.push(r); r.arrive = 99; }
  var n = r || st.enemies.filter(function (x) { return x.hero === hero && x.alive && x.arrive > st.day + 1; })[0];
  if (!n || n.arrive <= st.day + 1) return false;
  n.arrive = st.day + 1; n.hint = hint || n.hint;
  return true;
}
// 黑化：能力照倍率拉高（傷勢比例不變），換名字、寶具名、外貌。
function warAlter_(e, a) {
  if (!a || e.alter) return;
  var r = e.hp / e.mhp;
  e.atk = Math.round(e.atk * a.mul); e.def = Math.round(e.def * a.mul);
  e.mhp = Math.round(e.mhp * a.mul); e.hp = Math.max(1, Math.round(e.mhp * r));
  e.name = a.name || e.name; e.npName = a.npName || e.npName; e.alter = true;
  if (e.card) e.card.look = a.look || e.card.look;
}
// 原作從者在自己那場戰爭倒下的餘波（WAR_FALL_）：推一句給畫面與說書；summon 那一位還沒登場就提早到明天。
function warCanonFall_(st, e, ev) {
  var list = typeof WAR_FALL_ !== 'undefined' ? WAR_FALL_ : [];
  list.forEach(function (c) {
    if (c.war !== st.war || c.hero !== e.hero) return;
    if (e.intel >= 1) ev.push({ k: 'fall', txt: (e.alter && c.altTxt || c.txt) + '。' });   // 還不知道倒下的是誰：餘波不替玩家揭曉
    if (c.summon) warAwaken_(st, c.summon, c.hint);
  });
}
function warUnmask_(st, e, ev) {
  if (!e.fake) return;
  e.fake = false;
  ev.push({ k: 'news', txt: '那位 ' + e.cls + ' 根本沒有退場——教會宣布的死訊是假的。' });
}

// ── 白天 ──────────────────────────────────────────────
function warDoDay_(st, act, ev) {
  var sv = st.sv;
  if (act.t === 'scout') {
    var hidden = warArrived_(st).filter(function (e) { return e.intel === 0 && !e.fake; });
    var known1 = warArrived_(st).filter(function (e) { return e.intel === 1 && !e.fake; });
    var got = false;
    var tries = 1 + warAdd_(sv, 'scoutExtra');
    for (var n = 0; n < tries && hidden.length; n++) {
      var h = warPick_(st, hidden);
      hidden = hidden.filter(function (x) { return x !== h; });
      if (warRand_(st) < warAdd_(h, 'hideScout')) { ev.push({ k: 'intel', txt: '有一位從者的氣息無法追蹤。' }); continue; }
      h.intel = 1; got = true;
      ev.push({ k: 'intel', txt: '打聽到' + h.loc + '一帶有一位 ' + h.cls + '。' });
    }
    if (got) {
      if (known1.length && warRand_(st) < WAR_.SCOUT_DEEP) got = warReveal_(st, warPick_(st, known1), ev) || got;
    } else if (!hidden.length && known1.length && warRand_(st) < 0.7) {
      got = warReveal_(st, warPick_(st, known1), ev);
    }
    if (!got) ev.push({ k: 'intel', txt: '打聽了一整天，沒有新消息。' });
    if (warAdd_(sv, 'scoutRest') > 0) { var sr = warHeal_(sv, warAdd_(sv, 'scoutRest')); warHealMaster_(st, WAR_.REST_MASTER / 2); ev.push({ k: 'rest', txt: sv.name + '獨自去打聽，你留在據點休息。', num: sr ? '從者 +' + sr : '' }); }
    warArrived_(st).forEach(function (e) {
      if (!e.found && warRand_(st) < WAR_.FIND_SCOUT) { e.found = true; ev.push({ k: 'watched', txt: '回程時似乎被人跟蹤了。' }); }
    });
  } else if (act.t === 'rest') {
    var a = warHeal_(sv, WAR_.REST_HEAL + warAdd_(sv, 'restHeal')), m = warHealMaster_(st, WAR_.REST_MASTER);
    ev.push({ k: 'rest', txt: sv.name + '在據點休養了一天。', num: [a ? '從者 +' + a : '', m ? '御主 +' + m : ''].filter(Boolean).join('・') });
  } else if (act.t === 'supply') {
    var had = sv.cd;
    sv.cd = Math.max(0, sv.cd - WAR_.SUPPLY_CD);
    var b = warHeal_(sv, WAR_.SUPPLY_HEAL + warAdd_(sv, 'restHeal'));
    if (sv.noNp) ev.push({ k: 'supply', txt: '為' + sv.name + '補魔。', num: b ? '從者 +' + b : '' });
    else ev.push({ k: 'supply', txt: '為' + sv.name + '補魔。' + (had > 0 ? (sv.cd === 0 ? '寶具可以再次使用。' : '寶具冷卻縮短。') : '寶具已經就緒。'), num: (sv.cd === 0 ? '寶具就緒' : '寶具還要 ' + sv.cd + ' 夜') + (b ? '・從者 +' + b : '') });
  }
  st.phase = 'night';
}

function warReveal_(st, e, ev) {
  if (!e || e.intel >= 2) return false;
  if (warFlag_(e, 'veil')) { ev.push({ k: 'intel', txt: '那位 ' + e.cls + ' 的「' + warSkName_(e, 'veil') + '」遮住了兵器，看不出是誰。' }); return true; }
  e.intel = 2;
  ev.push({ k: 'reveal', txt: '看穿了那位 ' + e.cls + ' 的真名：「' + e.name + '」。' });
  return true;
}

// ── 夜晚 ──────────────────────────────────────────────
function warDoNight_(st, act, ev) {
  st.engaged = []; st.ticked = []; st.hunted = false; st.foughtTonight = false;
  st.out = act.t !== 'hold';
  if (act.t === 'final') {
    warArrived_(st).forEach(function (x) { x.intel = Math.max(x.intel, 1); warHeal_(x, WAR_.FINAL_REST); x.cd = 0; });
    st.stats.finalFoes = warArrived_(st).length;
    ev.push({ k: 'final', txt: '最後一夜。聖杯在' + warFinal_(st).place + '降臨，' + warFinal_(st).arrive + '。' });
    warFinalMelee_(st, ev);
    warArrived_(st).forEach(function (x) { x.cd = 0; });   // 混戰裡放掉的寶具，輪到你之前重新備好（聖杯降臨那一夜魔力充沛）
    if (warCheckEnd_(st, ev)) return;
    warStartBattle_(st, warFinalNext_(st), 'final', ev);
    return;
  }
  if (act.t === 'sortie') {
    var e = warFoe_(st, act.id);
    ev.push({ k: 'sortie', txt: '夜裡前往' + e.loc + '，找上了' + warFoeLabel_(e) + '。' });
    warStartBattle_(st, e, 'sortie', ev);
    return;
  }
  if (act.t === 'patrol') {
    var pool = warArrived_(st);
    var meet = warFlag_(st.sv, 'patrolMeet') ? 1 : WAR_.PATROL_MEET;
    if (pool.length && warRand_(st) < meet) {
      var m = warPick_(st, pool);
      m.intel = Math.max(m.intel, 1);
      ev.push({ k: 'patrol', txt: '巡邏到' + m.loc + '時遭遇了' + warFoeLabel_(m) + '。' });
      warStartBattle_(st, m, 'patrol', ev);
      return;
    }
    var hid = pool.filter(function (x) { return x.intel === 0; });
    if (hid.length) { var h = warPick_(st, hid); h.intel = 1; ev.push({ k: 'patrol', txt: '巡邏沒有遭遇敵人，但在' + h.loc + '發現了一位 ' + h.cls + ' 的蹤跡。' }); }
    else ev.push({ k: 'patrol', txt: '巡邏了一夜，沒有動靜。' });
    warFinishNight_(st, ev);
    return;
  }
  ev.push({ k: 'hold', txt: '這一夜守在據點。' });
  warFinishNight_(st, ev);
}

// 敵人一個一個行動；有人找上門就停下來開打，打完再從這裡接著跑。
function warFinishNight_(st, ev) {
  if (warTick_(st, ev)) return;
  warMorning_(st, ev);
}

function warTick_(st, ev) {
  var order = warArrived_(st).slice().sort(function (a, b) { return warAggr_(b) - warAggr_(a); });
  for (var i = 0; i < order.length; i++) {
    var e = order[i];
    if (!e.alive || st.ticked.indexOf(e.id) >= 0 || st.engaged.indexOf(e.id) >= 0) continue;
    st.ticked.push(e.id);
    var aggr = warAggr_(e), tp = warTemper_(e);
    var fallen = st.enemies.filter(function (x) { return !x.alive; }).length;
    var nemesis = !!tp.nemesis && st.sv.hero === tp.nemesis;
    if (!e.found) {
      var f = WAR_.FIND_BASE + (st.out ? WAR_.FIND_OUT : 0) + (st.exposed ? WAR_.FIND_EXPOSED : 0) + fallen * WAR_.FIND_LATE;
      f *= warMul_(st.sv, 'findMe') * warMul_(e, 'findThem') * (tp.findMul || 1) * (nemesis ? 3 : 1);
      if (warRand_(st) < f) e.found = true;
    }
    var hunt = aggr * WAR_.HUNT + (st.exposed ? WAR_.HUNT_EXPOSED : 0) + (st.sv.hp < st.sv.mhp * 0.5 ? WAR_.HUNT_WOUNDED : 0) + fallen * WAR_.HUNT_LATE + (nemesis ? 0.4 : 0);
    if (!st.out && !st.hunted && e.found && !tp.guard && warRand_(st) < hunt) {
      st.hunted = true;
      e.intel = Math.max(e.intel, 1);
      ev.push({ k: 'raid', txt: '深夜，' + warFoeLabel_(e) + '找上了據點。' });
      warStartBattle_(st, e, 'defend', ev);
      return true;
    }
    if (warRand_(st) < aggr * warPace_(st).brawl) {
      var foes = warArrived_(st).filter(function (o) { return o.id !== e.id && st.engaged.indexOf(o.id) < 0; });
      var o = warPick_(st, foes);
      if (o) { st.engaged.push(e.id, o.id); warAutoBattle_(st, e, o, ev); continue; }
    }
    warHeal_(e, WAR_.ENEMY_REST_HEAL);
  }
  return false;
}

function warMorning_(st, ev) {
  var sv = st.sv;
  var pairs = [], blur = 0;
  for (var i = ev.length - 1; i >= 0; i--) if (ev[i].k === 'draw') { if (ev[i].txt) pairs.unshift(ev[i].txt); else blur++; ev.splice(i, 1); }
  if (pairs.length || blur) {
    ev.push({ k: 'news', txt: '昨夜' + (pairs.length ? pairs.join('、') + '交戰，雙方負傷撤退' : '') + (pairs.length && blur ? '；另外還有 ' : (blur ? '冬木有 ' : '')) + (blur ? blur + ' 處交戰，無法確認是誰' : '') + '。' });
  }
  if (!st.foughtTonight) warHeal_(sv, WAR_.NIGHT_HEAL);
  sv.cd = Math.max(0, sv.cd - 1);
  st.enemies.forEach(function (e) { if (e.alive) e.cd = Math.max(0, e.cd - 1); });
  st.day++;
  st.battle = null; st.out = false;
  if (warCheckEnd_(st, ev)) return;
  if (st.day > WAR_.NIGHTS) { warOver_(st, false, 'timeout', ev); return; }
  st.enemies.forEach(function (e) {
    if (e.alive && e.arrive === st.day && st.day > 1) ev.push({ k: 'arrive', txt: (e.hint || '有新的從者進入冬木') + '。' });
  });
  // 原作的開場假死（第一夜的事，第二天早報才知道）：大家都以為這一位退場了，它照樣在暗處行動，第一次真的出手才露餡。
  //   第一夜就跟它交過手的話，這場戲演不成，跳過。
  if (st.day === 2) st.enemies.forEach(function (e) {
    if (!e.fakeTxt || !e.alive || (st.met || []).indexOf(e.id) >= 0) return;
    e.fake = true; e.intel = Math.max(e.intel, 1); ev.push({ k: 'news', txt: e.fakeTxt + '。' });
  });
  warCanonEvents_(st, ev);
  if (warCheckEnd_(st, ev)) return;
  ev.push({ k: 'morning', txt: '第 ' + st.day + ' 天早晨。剩 ' + (WAR_.NIGHTS - st.day + 1) + ' 夜，敵方剩 ' + warShownCount_(st) + ' 位。' });
  if (st.day === WAR_.BOUNTY_DAY && !st.bounty) warBountyStart_(st, ev);
  st.phase = 'day';
}

// 討伐令：只發一次；目標不在場（已倒下、或正是你的從者）就不發。st.bounty＝{ id, open }。
function warBountyStart_(st, ev) {
  var t = warArrived_(st).filter(function (e) { return e.cls === WAR_BOUNTY_.cls; })[0];
  if (!t) { st.bounty = { id: '', open: false }; return; }
  st.bounty = { id: t.id, open: true };
  t.intel = Math.max(t.intel, 1);
  ev.push({ k: 'bounty', txt: '教會發出討伐令：' + (WAR_BOUNTY_.why[st.war] || WAR_BOUNTY_.why['5th']) + '，元兇是' + t.loc + '一帶的那位 ' + t.cls + '。打倒這位從者的人可得一劃令咒。' });
}
// 目標倒下時結算：你打倒的領賞，別人打倒的就撤銷。
function warBountyEnd_(st, e, mine, ev) {
  if (!st.bounty || !st.bounty.open || st.bounty.id !== e.id) return;
  st.bounty.open = false;
  if (mine) {
    st.master.seals++; st.stats.bounty = 1;
    ev.push({ k: 'bounty', txt: '完成教會的討伐令，令咒多了一劃。' });
  } else ev.push({ k: 'bounty', txt: '討伐令的目標被別人打倒了，討伐令撤銷。' });
}

// ── 戰鬥 ──────────────────────────────────────────────
function warStartBattle_(st, e, ctx, ev) {
  st.phase = 'battle';
  st.battle = { e: e.id, round: 1, ctx: ctx, hp0: Math.round(st.sv.hp / st.sv.mhp * 100) };
  if (st.engaged.indexOf(e.id) < 0) st.engaged.push(e.id);
  // 開場那句只在第一次交手說，再遇到就不重播（舊存檔沒有 met，當作都沒見過）
  st.met = st.met || [];
  var firstMeet = st.met.indexOf(e.id) < 0;
  if (firstMeet) st.met.push(e.id);
  st.foughtTonight = true;
  st.stats.battles++;
  st.sv.saved = false; e.saved = false; st.sv.broken = false; e.broken = false;
  warUnmask_(st, e, ev);
  var tp = warTemper_(e);
  if (firstMeet && tp.nemesis && st.sv.hero === tp.nemesis && tp.nemesisMeet) ev.push({ k: 'meet', txt: tp.nemesisMeet.replace('{sv}', st.sv.name) });
  else if (firstMeet && tp.meet) ev.push({ k: 'meet', txt: tp.meet });
  st.battle.ambush = ctx === 'sortie' && warFlag_(st.sv, 'ambush');
  st.battle.foeAmbush = ctx === 'defend' && warFlag_(e, 'ambush');   // 帶著氣息遮斷摸上門來的，一樣先手
  if (ctx === 'defend' && warAdd_(st.sv, 'ward') > 0) {
    var w = Math.round(e.mhp * warAdd_(st.sv, 'ward') * warMul_(e, 'wardTaken'));
    e.hp = Math.max(1, e.hp - w);
    ev.push({ k: 'ward', txt: '據點的魔術陣發動，' + warFoeLabel_(e) + warHurtWord_(e) + '。', num: '−' + w });
  }
  if (ctx === 'sortie' && warAdd_(e, 'ward') > 0) {
    var w2 = Math.round(st.sv.mhp * warAdd_(e, 'ward') * warMul_(st.sv, 'wardTaken'));
    st.sv.hp = Math.max(1, st.sv.hp - w2);
    ev.push({ k: 'ward', txt: '踏進對方陣地，觸發了魔術陣，' + st.sv.name + warHurtWord_(st.sv) + '。', num: '−' + w2 });
  }
  warSetIntent_(st, e);
}

// 敵人這回合想做什麼：先決定、存起來，玩家看得到預兆就能應對。
function warSetIntent_(st, e) {
  var intent = warIntent_(st, e, st.sv, st.battle.round);
  var see = intent === 'np' && (e.intel >= 2 || warFlag_(st.sv, 'seeNp') || warRand_(st) < 0.5);
  st.battle.intent = intent;
  st.battle.tele = see ? 'np' : '';
}

function warIntent_(st, me, foe, round) {
  var aggr = warAggr_(me), berserk = warFlag_(me, 'noProbe'), tp = warTemper_(me);
  var final = !!(st.battle && st.battle.ctx === 'final'), stay = tp.guard || tp.noRetreat;
  if (tp.scout && !berserk && !final) {   // 奉命偵察：先試探，佔不到便宜就走
    if (round === 1) return 'probe';
    if (me.hp / me.mhp < foe.hp / foe.mhp && warRand_(st) < 0.35) return 'retreat';
  }
  if (me.cd === 0 && !me.noNp && (me.hp < me.mhp * 0.5 || foe.hp < foe.mhp * 0.55 || (round >= 2 && warRand_(st) < aggr * 0.5))) return 'np';
  if (!berserk && !stay && !final && me.hp < me.mhp * 0.3 && aggr < 0.7 && warRand_(st) < 0.45) return 'retreat';
  if (!berserk && (me.cls === 'Caster' || me.cls === 'Assassin') && warRand_(st) < 0.2) return 'probe';
  return 'strike';
}

function warDoRound_(st, act, ev) {
  var b = st.battle, e = warFoe_(st, b.e), sv = st.sv;
  var ev0 = ev.length;
  var A = { u: sv, act: act.s, seal: !!act.seal, side: 'me', knows: e.intel >= 2, home: b.ctx === 'defend', ambush: b.round === 1 && !!b.ambush };
  var Z = { u: e, act: b.intent, seal: false, side: 'foe', knows: st.exposed, home: false, lair: b.ctx === 'sortie', ambush: b.round === 1 && !!b.foeAmbush };
  var forced = act.s === 'np' && !!act.seal && sv.cd > 0;
  var r = warExchange_(st, A, Z, ev);
  // 之後的結算只認「真的發生了的事」：對方先撤走了，你的寶具沒放出去、令咒也沒燒掉、試探也沒看到什麼。
  var myRetreat = r.ended === 'retreat' && r.who === 'me';
  if (act.seal && (A.struck || (act.s === 'retreat' && myRetreat))) {
    st.master.seals--; st.stats.seals++;
    ev.splice(ev0, 0, { k: 'seal', txt: '令咒發動。' });
    if (forced && A.fired) {
      st.master.hp = Math.max(0, st.master.hp - WAR_.SEAL_NP_COST);
      ev.push({ k: 'master', txt: '強行解放寶具，御主的魔力被整個抽乾。', num: '御主 −' + WAR_.SEAL_NP_COST });
    }
  }
  if (b.tele === 'np' && Z.act === 'np') {
    if ((act.s === 'probe' && Z.fired) || myRetreat) warStat_(st, 'dodged');
    else if (act.s === 'strike' && Z.fired) { warStat_(st, 'ignoredTele'); b.ignored = true; }
  }
  if (myRetreat) warStat_(st, 'retreats');
  if (A.fired) { st.stats.np++; if (!st.exposed) { st.exposed = true; ev.push({ k: 'exposed', txt: '解放了寶具，己方真名曝光。' }); } }
  if (Z.fired && e.intel < 2) { e.intel = 2; ev.push({ k: 'reveal', txt: '從寶具認出了對方：「' + e.name + '」。' }); }
  if (act.s === 'probe' && A.struck && e.alive && e.intel < 2) warReveal_(st, e, ev);
  if (!e.alive) { st.stats.kills++; ev.push({ k: 'kill', txt: warFoeLabel_(e) + '被擊敗了。' }); warBountyEnd_(st, e, true, ev); warCanonFall_(st, e, ev); }
  if (warCheckEnd_(st, ev)) return;
  if (r.ended || !e.alive) { warEndBattle_(st, ev); return; }
  b.round++;
  var cap = b.ctx === 'final' ? WAR_.FINAL_ROUNDS : WAR_.ROUNDS;
  if (b.round > cap) {
    if (b.ctx === 'final') { warOver_(st, false, 'timeout', ev); return; }
    ev.push({ k: 'dawn', txt: '天亮了，雙方各自撤退。' }); warEndBattle_(st, ev); return;
  }
  warSetIntent_(st, e);
}

// 決戰地的混戰（原作：聖杯降臨的那一夜，剩下的從者彼此廝殺）：兩兩交手一輪，活下來的帶著傷輪到你。
function warFinalMelee_(st, ev) {
  var left = warArrived_(st);
  if (left.length < 2) return;
  for (var i = left.length - 1; i > 0; i--) { var j = Math.floor(warRand_(st) * (i + 1)), tmp = left[i]; left[i] = left[j]; left[j] = tmp; }
  for (var k = 0; k + 1 < left.length; k += 2) {
    var a = left[k], b = left[k + 1];
    warUnmask_(st, a, ev); warUnmask_(st, b, ev);   // 假死的那位在混戰裡露餡：這句要讓玩家看到
    var sink = [];
    warAutoBattle_(st, a, b, sink);
    sink.forEach(function (x) { if (x.k === 'bounty') ev.push(x); });   // 討伐令的目標死在混戰裡：照樣撤銷並告知
    a.intel = Math.max(a.intel, 1); b.intel = Math.max(b.intel, 1);
    var dead = !a.alive ? a : (!b.alive ? b : null);
    ev.push({ k: 'final', txt: warFoeLabel_(a) + '與' + warFoeLabel_(b) + '在' + warFinal_(st).place + '交手，' +
      (dead ? warFoeLabel_(dead) + '倒下了。' : '兩敗俱傷。') });
    sink.forEach(function (x) { if (x.k === 'fall') ev.push(x); });   // 原作從者倒下的餘波接在後面
  }
}

function warEndBattle_(st, ev) {
  var fe = st.battle && warFoe_(st, st.battle.e);
  st.sv.broken = false; if (fe) fe.broken = false;   // 破戒只到這場戰鬥結束
  if (st.battle && st.battle.ctx === 'final') {
    var next = warFinalNext_(st);
    if (next) { ev.push({ k: 'final', txt: warFinal_(st).next + '：' + warFoeLabel_(next) + '。' }); warStartBattle_(st, next, 'final', ev); return; }
  }
  st.battle = null;
  st.phase = 'night';
  warFinishNight_(st, ev);
}

// 一回合的交手，玩家對敵、敵對敵共用。A、Z：{ u, act, seal, side, knows, home }
function warExchange_(st, A, Z, ev) {
  var sides = [A, Z];
  for (var i = 0; i < 2; i++) {
    var S = sides[i], O = sides[1 - i];
    if (S.act !== 'retreat') continue;
    if (S.seal || warRand_(st) < warRetreatChance_(S.u, O.u, false)) {
      ev.push({ k: 'retreat', side: S.side, txt: warWho_(st, S) + '撤退成功。' });
      return { ended: 'retreat', who: S.side };
    }
    ev.push({ k: 'retreat', side: S.side, txt: warWho_(st, S) + '想撤退，但被纏住了。' });
    S.act = 'none';
  }
  if (A.act === 'np' && Z.act === 'np') {
    var sa = A.u.np + warRand_(st) * 3 + (A.seal ? 3 : 0) + warAdd_(A.u, 'clash'), sz = Z.u.np + warRand_(st) * 3 + (Z.seal ? 3 : 0) + warAdd_(Z.u, 'clash');
    var W = sa >= sz ? A : Z, L = W === A ? Z : A;
    A.u.cd = warNpCd_(A.u); Z.u.cd = warNpCd_(Z.u);
    A.struck = A.fired = Z.struck = Z.fired = true;
    var d = Math.round(warNpDmg_(W, L) * WAR_.CLASH_WIN * warMul_(W.u, 'npDealt', L.u) * warMul_(L.u, 'npTaken', W.u));
    var stood = warApply_(st, L, d);
    ev.push({ k: 'clash', txt: '寶具對轟。' + warWho_(st, W) + '的「' + W.u.npName + '」壓過了' + warWho_(st, L) + '的「' + L.u.npName + '」，' + warWho_(st, L) + warHurtWord_(L.u) + '。', num: '−' + d });
    if (stood) warStoodEv_(st, L, ev, stood);
    warBreak_(st, W, L, ev);
    if (L.side === 'me') warMasterHit_(st, WAR_.NP_MASTER_HIT, ev);
    return { ended: '' };
  }
  var order = [A, Z].sort(function (x, y) {
    if (!!x.ambush !== !!y.ambush) return x.ambush ? -1 : 1;   // 奇襲：對方還沒察覺，連寶具都來不及放
    var nx = x.act === 'np' ? 1 : 0, ny = y.act === 'np' ? 1 : 0;
    if (nx !== ny) return ny - nx;
    return (y.u.spd + warRand_(st) * 0.5) - (x.u.spd + warRand_(st) * 0.5);
  });
  for (var j = 0; j < 2; j++) {
    var X = order[j], Y = order[1 - j];
    if (X.u.hp <= 0 || !X.act || X.act === 'none') continue;
    if (Y.u.hp <= 0) break;
    warStrike_(st, X, Y, ev);
  }
  return { ended: '' };
}

function warStrike_(st, X, Y, ev) {
  X.struck = true;
  var guard = Y.act === 'probe' && !(X.act === 'np' && warFlag_(X.u, 'npSure')) ? WAR_.PROBE : 1;
  // 守家：自己的據點（HOME）再乘陣地作成；在自己的陣地被人闖進來（lair）只吃陣地作成。
  var home = Y.home ? WAR_.HOME * warMul_(Y.u, 'homeTaken') : (Y.lair ? warMul_(Y.u, 'homeTaken') : 1);
  if (X.act === 'np') {
    X.fired = true;
    X.u.cd = warNpCd_(X.u);
    var nd = Math.round(warNpDmg_(X, Y) * guard * home * warMul_(X.u, 'npDealt', Y.u) * warMul_(Y.u, 'npTaken', X.u));
    var np0 = Y.u.hp, npStood = warApply_(st, Y, nd);
    warCurse_(st, X, Y, ev, npStood === 'life' ? 0 : Math.max(0, np0 - Y.u.hp));
    ev.push({ k: 'np', side: X.side, txt: warWho_(st, X) + '解放寶具「' + X.u.npName + '」。' + (guard < 1 ? warWho_(st, Y) + '有所防備，傷害減半，' : warWho_(st, Y)) + warHurtWord_(Y.u) + '。', num: '−' + nd });
    if (npStood) warStoodEv_(st, Y, ev, npStood);
    warBreak_(st, X, Y, ev);
    if (Y.side === 'me' && Y.act !== 'probe') warMasterHit_(st, WAR_.NP_MASTER_HIT, ev);
    return;
  }
  var hitP = (warHitChance_(X.u, Y.u) + (X.act === 'strike' ? warAdd_(X.u, 'hitUp') : 0)) * warMul_(Y.u, 'hitTaken', X.u);
  var hit = X.seal || X.ambush || warRand_(st) < hitP;
  var probe = X.act === 'probe';
  if (!hit) { ev.push({ k: 'miss', side: X.side, txt: warWho_(st, X) + (probe ? '的試探' : '的攻擊') + '被' + warWho_(st, Y) + '擋下了。' }); return; }
  var d = warNormalDmg_(st, X, Y) * (probe ? WAR_.PROBE : 1) * (X.seal ? 1.5 : 1) * (X.ambush ? warMul_(X.u, 'ambushDmg') : 1) * guard * home * warMul_(Y.u, 'dmgTaken', X.u);
  d = Math.max(WAR_.DMG_MIN, Math.round(d));
  var hp0 = Y.u.hp, hitStood = warApply_(st, Y, d);
  warCurse_(st, X, Y, ev, hitStood === 'life' ? 0 : Math.max(0, hp0 - Y.u.hp));
  var how = X.ambush ? '以「' + warSkName_(X.u, 'ambush') + '」奇襲，擊中了' : (probe ? '試探出手，擦中了' : '正面攻擊，擊中了');
  ev.push({ k: 'hit', side: X.side, txt: warWho_(st, X) + how + warWho_(st, Y) + '，對方' + warHurtWord_(Y.u) + '。', num: '−' + d });
  if (hitStood) warStoodEv_(st, Y, ev, hitStood);
  if (Y.side === 'me' && X.u.cls === 'Assassin') warMasterHit_(st, WAR_.ASSASSIN_MASTER_HIT, ev);
}

// 必滅黃薔薇（curse）：這一擊實際造成的傷記進 curseDmg，這部分好不了（回血上限＝最大血量−curseDmg）；下手的人倒下就解除（warApply_）。
function warCurse_(st, X, Y, ev, dealt) {
  if (!warFlag_(X.u, 'curse') || Y.u.hp <= 0 || !(dealt > 0)) return;
  var first = !Y.u.curseDmg;
  Y.u.cursedBy = X.u.hero;
  Y.u.curseDmg = Math.min(Y.u.mhp - 1, (Y.u.curseDmg || 0) + dealt);
  if (first) ev.push({ k: 'skill', side: X.side, txt: warWho_(st, Y) + '被「' + warSkName_(X.u, 'curse') + '」劃開的傷口癒合不了——只要' + warWho_(st, X) + '還在，這道傷就一直在。' });
}
// 寶具帶著破戒（breakFx）：打中的那位這場戰鬥技能全失。
function warBreak_(st, X, Y, ev) {
  if (!warFlag_(X.u, 'breakFx') || Y.u.broken || Y.u.hp <= 0 || !(Y.u.fx || []).length) return;
  var nm = warSkName_(X.u, 'breakFx');
  Y.u.broken = true;
  ev.push({ k: 'skill', side: X.side, txt: warWho_(st, X) + '以「' + nm + '」破除了' + warWho_(st, Y) + '身上的加護。' });
}
// 扣血；這一下本該倒下卻沒倒：回 'life'（死而復生）或 'stand'（撐住），呼叫端在自己那句之後補 warStoodEv_。
function warApply_(st, Y, d) {
  var u = Y.u, before = u.hp, stood = '';
  // 死而復生：一擊的餘勁會連著打掉好幾條命（原作的寶具一擊殺他數次）。
  if (u.hp - d <= 0 && warFlag_(u, 'lives') && warLives_(u) > 0) {
    var left = u.hp - d, per = Math.max(1, Math.round(u.mhp * warAdd_(u, 'revive'))), used = 0;
    u.lives = warLives_(u);
    while (left <= 0 && u.lives > 0) { u.lives--; used++; left += per; }
    u.lastLost = used;
    if (left > 0) { u.hp = Math.min(u.mhp, left); return 'life'; }
    d = u.hp;   // 命用完了：這一擊照常打倒
  }
  u.hp = Math.max(0, u.hp - d);
  if (u.hp <= 0 && warFlag_(u, 'lastStand') && !u.saved && before > u.mhp * 0.25) { u.saved = true; u.hp = 1; stood = 'stand'; }
  if (u.hp <= 0 && Y.side !== 'me') {
    u.alive = false;
    warGone_(st, u);   // 詛咒隨下手的人一起消失
  }
  return stood;
}
function warStoodEv_(st, Y, ev, how) {
  if (how === 'life') ev.push({ k: 'skill', side: Y.side, txt: warWho_(st, Y) + (Y.u.lastLost > 1 ? '被這一擊連殺 ' + Y.u.lastLost + ' 次' : '倒下了') + '，又以「' + warSkName_(Y.u, 'lives') + '」死而復生（還剩 ' + Y.u.lives + ' 次）。', num: '剩 ' + Y.u.lives + ' 命' });
  else ev.push({ k: 'skill', side: Y.side, txt: warWho_(st, Y) + '以「' + warSkName_(Y.u, 'lastStand') + '」撐住了致命一擊。' });
}

function warMasterHit_(st, n, ev) {
  st.master.hp = Math.max(0, st.master.hp - n);
  ev.push({ k: 'master', txt: '御主被餘波波及。', num: '御主 −' + n });
}

// 敵對敵：兩邊都照自己的個性打，最多三回合。
function warAutoBattle_(st, a, b, ev) {
  warUnmask_(st, a, ev); warUnmask_(st, b, ev);
  a.saved = false; b.saved = false; a.broken = false; b.broken = false;
  var end = '';
  for (var r = 1; r <= WAR_.ROUNDS && a.alive && b.alive && !end; r++) {
    var A = { u: a, act: warIntent_(st, a, b, r), seal: false, side: 'a', knows: false, home: false };
    var Z = { u: b, act: warIntent_(st, b, a, r), seal: false, side: 'b', knows: false, home: false };
    var sink = [];
    end = warExchange_(st, A, Z, sink).ended;
    if (a.hp <= 0) a.alive = false;
    if (b.hp <= 0) b.alive = false;
  }
  var dead = !a.alive ? a : (!b.alive ? b : null), win = dead ? (dead === a ? b : a) : null;
  [a, b].forEach(function (x) { if (x.intel === 0 && warRand_(st) < WAR_.NEWS_REVEAL) x.intel = 1; });
  if (win) {
    ev.push({ k: 'news', txt: '昨夜' + a.loc + '一帶兩位從者交戰，' + warFoeLabel_(dead) + '被擊敗，' + warFoeLabel_(win) + '勝出。' });
    warBountyEnd_(st, dead, false, ev);
    warCanonFall_(st, dead, ev);
  } else {
    // 沒人倒下的交手：早上併成一句（warMorning_）；認不出是誰的只算場數。
    var la = warFoeLabel_(a), lb = warFoeLabel_(b);
    if (la === lb) lb = '另一位 ' + b.cls;   // 兩位 Archer 還沒看穿時，別寫成「那位 Archer與那位 Archer」
    ev.push({ k: 'draw', txt: a.intel === 0 && b.intel === 0 ? '' : la + '與' + lb + '（' + a.loc + '）' });
  }
}

// ── 算式 ──────────────────────────────────────────────
function warHitChance_(x, y) { return warClamp_(WAR_.HIT_BASE + (x.spd - y.spd) * WAR_.HIT_PER_SPD, WAR_.HIT_MIN, WAR_.HIT_MAX); }
function warMult_(X, Y) {
  return (X.knows || warFlag_(X.u, 'weakAlways') ? WAR_.WEAK : 1) * warMul_(X.u, 'dmgDealt', Y && Y.u);
}
function warNormalDmg_(st, X, Y) {
  var base = (WAR_.DMG_BASE + X.u.atk * WAR_.DMG_PER_ATK) * warMult_(X, Y) - Y.u.def * WAR_.DMG_DEF;
  return base * (0.85 + warRand_(st) * 0.3);
}
function warNpDmg_(X, Y) {
  return Math.max(20, (WAR_.NP_BASE + X.u.np * WAR_.NP_PER_RANK) * warMult_(X, Y) - Y.u.def * WAR_.NP_DEF);
}
function warRetreatChance_(u, o, seal) {
  if (seal) return 1;
  if (warSkRows_(o).some(function (r) { return r.lock && warFlag_(u, r.lock); })) return 0;
  return warClamp_(WAR_.RETREAT_BASE + (u.spd - o.spd) * WAR_.RETREAT_PER_SPD + warAdd_(u, 'retreat') - warAdd_(o, 'chase'), WAR_.RETREAT_MIN, WAR_.RETREAT_MAX);
}
// 回血：必滅黃薔薇的傷（curseDmg）那一段好不了。
function warHeal_(u, pct) { var before = u.hp, cap = u.mhp - (u.cursedBy ? (u.curseDmg || 0) : 0); u.hp = Math.max(u.hp, Math.min(cap, u.hp + Math.round(u.mhp * pct))); return u.hp - before; }
function warHealMaster_(st, n) { var m = st.master, before = m.hp; m.hp = Math.min(m.mhp, m.hp + n); return m.hp - before; }

// 勝算：雙方各要幾回合打倒對方，比一比。
function warOdds_(st, e) {
  var r = warOddsR_(st, e);
  return r > 1.5 ? '勝算大' : r > 0.85 ? '勢均力敵' : r > 0.5 ? '勝算小' : '凶險';
}
// 勝算的比值（我撐幾下 ÷ 對方撐幾下）：出擊目標照這個排序。
function warOddsR_(st, e) {
  var me = { u: st.sv, knows: e.intel >= 2 }, foe = { u: e, knows: st.exposed };
  var myD = Math.max(1, warHitChance_(st.sv, e) * ((WAR_.DMG_BASE + st.sv.atk * WAR_.DMG_PER_ATK) * warMult_(me, foe) - e.def * WAR_.DMG_DEF));
  var eD = Math.max(1, warHitChance_(e, st.sv) * ((WAR_.DMG_BASE + e.atk * WAR_.DMG_PER_ATK) * warMult_(foe, me) - st.sv.def * WAR_.DMG_DEF));
  return (warEffHp_(st.sv) / eD) / (warEffHp_(e) / myD);
}
// 算勝算用的血量：死而復生的命也算進去。
function warEffHp_(u) { return u.hp + (warFlag_(u, 'lives') ? warLives_(u) * u.mhp * warAdd_(u, 'revive') : 0); }

// ── 文字與查詢 ────────────────────────────────────────
function warFinalNext_(st) { return warArrived_(st).sort(function (a, b) { return a.hp / a.mhp - b.hp / b.mhp; })[0] || null; }
function warFoe_(st, id) { return st.enemies.filter(function (e) { return e.id === id; })[0] || null; }
function warArrived_(st) { return st.enemies.filter(function (e) { return e.alive && e.arrive <= st.day; }); }
function warKnownFoes_(st) { return warArrived_(st).filter(function (e) { return e.intel >= 1 && !e.fake; }); }
function warAliveCount_(st) { return st.enemies.filter(function (e) { return e.alive; }).length; }
// 畫面上看得到的敵人數（假死的那位不算，直到露餡）。勝負照樣看 warAliveCount_。
function warShownCount_(st) { return st.enemies.filter(function (e) { return e.alive && !e.fake; }).length; }
function warFoeLabel_(e) { return e.intel >= 2 ? '「' + e.name + '」' : (e.intel >= 1 ? '那位 ' + e.cls : '一位不明的從者'); }
function warWho_(st, S) { return S.side === 'me' ? st.sv.name : warFoeLabel_(S.u); }
function warHpWord_(u) {
  var r = u.hp / u.mhp;
  return r > 0.8 ? '完好' : r > 0.5 ? '負傷' : r > 0.25 ? '重傷' : '瀕死';
}
function warHurtWord_(u) {
  if (u.hp <= 0) return '倒下了';
  var r = u.hp / u.mhp;
  return r > 0.8 ? '受了輕傷' : r > 0.5 ? '負傷' : r > 0.25 ? '身負重傷' : '瀕臨極限';
}
function warChanceWord_(p) { return p <= 0 ? '必定失敗' : p >= 0.8 ? '很高' : p >= 0.55 ? '一半以上' : p >= 0.35 ? '不太高' : '很低'; }

function warCheckEnd_(st, ev) {
  if (st.phase === 'over') return true;
  if (warAliveCount_(st) === 0) { warOver_(st, true, 'win', ev); return true; }   // 最後一擊同時把自己拚到倒下：仍算奪下聖杯
  if (st.sv.hp <= 0) { warOver_(st, false, 'servant', ev); return true; }
  if (st.master.hp <= 0) { warOver_(st, false, 'master', ev); return true; }
  return false;
}
function warStat_(st, k) { st.stats[k] = (st.stats[k] || 0) + 1; }
function warOver_(st, win, cause, ev) {
  var b = st.battle, e = b ? warFoe_(st, b.e) : null;
  st.phase = 'over'; st.battle = null;
  st.result = { win: win, cause: cause, day: Math.min(st.day, WAR_.NIGHTS) };
  if (e) { st.result.foe = warFoeLabel_(e).replace(/[「」]/g, ''); st.result.foeIntel = e.intel; st.result.ctx = b.ctx; st.result.hp0 = b.hp0; st.result.ignored = !!b.ignored; }
  var T = { win: '最後一位敵方從者被擊敗。聖杯就在眼前。', servant: st.sv.name + '倒下了。聖杯戰爭結束。', master: '御主倒下，從者隨之消散。', timeout: '最後一夜結束，聖杯落入他人之手。' };
  ev.push({ k: 'over', txt: T[cause] || '' });
}

// 一位對手在畫面上的情報：知道職階（intel 1）才有位置與傷勢；看穿真名（intel 2）才攤開御主、寶具、技能。
function warBountyOn_(st, e) { return !!(st.bounty && st.bounty.open && st.bounty.id === e.id); }
function warFoeCard_(st, e) {
  var seen = e.alive && !e.fake;   // 假死的那位在畫面上照「已退場」顯示
  var c = { id: e.id, label: warFoeLabel_(e).replace(/[「」]/g, ''), cls: e.cls, intel: e.intel, alive: seen,
    hp: e.intel >= 1 && seen ? warHpWord_(e) : '', loc: e.intel >= 1 ? e.loc : '' };
  if (seen && e.intel >= 1 && st.phase !== 'over') c.odds = warOdds_(st, e);
  if (warBountyOn_(st, e)) c.bounty = true;
  if (e.intel >= 2) {
    c.name = e.name; c.master = e.master; c.np = e.npName; c.npReady = !(e.cd > 0); if (e.noNp) c.npPassive = true;
    c.traits = warTraits_(e);
    if (warFlag_(e, 'lives')) c.lives = warLives_(e);
  }
  return c;
}

// ── 賽後：戰績與講評（老虎道場只演這裡算好的東西）──
// 輸了：由上往下第一條成立的就是「輸在哪」＋「下一局只改這一件事」。{foe}{n}{seals} 用的時候才代入。
var WAR_DOJO_LOSS_ = [
  { key: 'master', when: function (st, R) { return R.cause === 'master'; },
    fact: '御主先倒下了', lesson: '被寶具正面擊中、被 Assassin 盯上都會波及御主；休養時御主也會恢復' },
  { key: 'dawn', when: function (st, R) { return R.cause === 'timeout'; },
    fact: '{final}的決戰撐到天亮，{foe}仍未倒下', lesson: '決戰前先減少敵人數量，寶具與令咒留到決戰收尾' },
  { key: 'tele', when: function (st, R) { return !!R.ignored; },
    fact: '出現{foe}的寶具預兆時仍正面迎擊', lesson: '出現寶具預兆時，用試探減輕傷害，或撤退' },
  { key: 'blind', when: function (st, R) { return R.foe && R.foeIntel < 2; },
    fact: '直到最後都沒看穿{foe}的真名', lesson: '先打聽或試探看穿真名，傷害會提高' },
  { key: 'wounded', when: function (st, R) { return R.hp0 !== undefined && R.hp0 < 50 && R.ctx !== 'final'; },
    fact: '帶著重傷與{foe}交戰', lesson: '重傷時白天休養、夜裡固守' },
  { key: 'crowd', when: function (st, R) { return R.ctx === 'final' && (st.stats.finalFoes || 0) >= 3; },
    fact: '最後一夜，{final}還有 {n} 位從者', lesson: '決戰前挑「勝算大」的對手各個擊破' },
  { key: 'seals', when: function (st, R) { return st.master.seals >= WAR_.SEALS; },
    fact: '{seals} 劃令咒一劃也沒用', lesson: '令咒可讓正面必中、無視冷卻解放寶具，或必定撤退' },
  { key: 'exposed', when: function (st, R) { return st.exposed; },
    fact: '真名過早曝光', lesson: '寶具留到能一擊收尾時再用' },
  { key: 'battle', when: function () { return true; },
    fact: '敗給了{foe}', lesson: '只突襲「勝算大」的對手' }
];
// 贏了（輸了也挑一條鼓勵）：成立的全列，最多三條。
var WAR_DOJO_GOOD_ = [
  { key: 'clean', when: function (st) { return st.result && st.result.win && st.master.seals >= WAR_.SEALS; }, txt: '未使用令咒奪得聖杯' },
  { key: 'hidden', when: function (st) { return !st.exposed && st.stats.battles > 0; }, txt: '真名始終未曝光' },
  { key: 'dodge', when: function (st) { return (st.stats.dodged || 0) > 0; }, txt: '避開寶具 {dodged} 次' },
  { key: 'reveal', when: function (st) { return warRevealed_(st) >= 3; }, txt: '看穿 {reveals} 位從者的真名' },
  { key: 'kills', when: function (st) { return st.stats.kills >= 2; }, txt: '擊敗 {kills} 位從者' },
  { key: 'bounty', when: function (st) { return !!st.stats.bounty; }, txt: '完成教會的討伐令' }
];
function warRevealed_(st) { return st.enemies.filter(function (e) { return e.intel >= 2; }).length; }
function warFill_(t, o) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return o[k] !== undefined ? o[k] : m; }); }

// 賽後的一整包：戰績數字、輸在哪（輸了才有）、亮點。純函式，畫面與老虎道場讀同一份。
function warDebrief_(st) {
  var R = st.result || {};
  var S = st.stats || {};
  var o = { final: warFinal_(st).place, foe: R.foe ? '「' + R.foe + '」' : '對手', n: S.finalFoes || 0, seals: WAR_.SEALS, dodged: S.dodged || 0, reveals: warRevealed_(st), kills: S.kills || 0 };
  var d = {
    win: !!R.win, day: R.day || Math.min(st.day, WAR_.NIGHTS),
    stats: { battles: S.battles || 0, kills: S.kills || 0, np: S.np || 0, seals: S.seals || 0, reveals: o.reveals, retreats: S.retreats || 0 },
    good: WAR_DOJO_GOOD_.filter(function (g) { return g.when(st); }).slice(0, 3).map(function (g) { return warFill_(g.txt, o); })
  };
  var rt = warRoute_(st), rw = (st.rewrote || []).slice();
  if (rt || rw.length) d.route = { label: rt ? rt.label : '', rewrote: rw };   // 結局才揭曉：這一局走的線（第五次）、改寫了原作的哪幾幕
  if (!R.win) {
    var L = WAR_DOJO_LOSS_.filter(function (x) { return x.when(st, R); })[0];
    d.key = L.key; d.fact = warFill_(L.fact, o); d.lesson = warFill_(L.lesson, o);
  }
  return d;
}

// 畫面上的說明（開局表單、怎麼玩）要引用的規則數字：只從 WAR_ 拿，前端不另寫一份。
function warRules_(st) {
  var r = { nights: WAR_.NIGHTS, seals: WAR_.SEALS, rounds: WAR_.ROUNDS, npCd: WAR_.NP_COOLDOWN, supplyCd: WAR_.SUPPLY_CD, sealNpCost: WAR_.SEAL_NP_COST };
  // 開局表單要的：各戰爭對手幾組、哪些原作參戰者召喚不到
  var n = function (R) { return R.filter(function (x) { return !x.reserve; }).length; };
  r.rosters = { '5th': n(FATE_5TH_ROSTER), '4th': n(FATE_4TH_ROSTER), chaos: WAR_CHAOS_.size };
  r.canonHeroes = { '5th': warCanonHeroes_('5th'), '4th': warCanonHeroes_('4th'), chaos: [] };
  if (st) r.finalPlace = warFinal_(st).place;
  return r;
}

// ── 對外：畫面看得到的樣子（藏起玩家還不知道的事）──
function warView_(st) {
  var sv = st.sv, b = st.battle;
  var foes = warArrived_(st).concat(st.enemies.filter(function (e) { return !e.alive && e.intel >= 1; }));
  var view = {
    phase: st.phase, day: Math.min(st.day, WAR_.NIGHTS), nights: WAR_.NIGHTS, nightsLeft: Math.max(0, WAR_.NIGHTS - st.day + 1),
    master: { name: st.master.name, hp: st.master.hp, mhp: st.master.mhp, seals: st.master.seals },
    sv: { cls: sv.cls, name: sv.name, npName: sv.npName, hp: sv.hp, mhp: sv.mhp, cd: sv.cd, npPassive: !!sv.noNp, curseDmg: sv.curseDmg || 0, traits: warTraits_(sv), exposed: st.exposed },
    foes: foes.filter(function (e) { return e.intel >= 1; }).map(function (e) { return warFoeCard_(st, e); }),
    unknown: warArrived_(st).filter(function (e) { return e.intel === 0; }).length,
    alive: warShownCount_(st),
    battle: null, buttons: warButtons_(st), result: st.result, rules: warRules_(st)
  };
  if (warFlag_(sv, 'lives')) view.sv.lives = warLives_(sv);
  if (st.phase === 'over') view.debrief = warDebrief_(st);
  if (b) {
    var e = warFoe_(st, b.e);
    view.battle = { round: b.round, rounds: WAR_.ROUNDS, foe: warFoeLabel_(e).replace(/[「」]/g, ''), foeHp: Math.round(e.hp / e.mhp * 100), foeWord: warHpWord_(e), tele: b.tele, ctx: b.ctx, info: warFoeCard_(st, e) };
  }
  return view;
}
