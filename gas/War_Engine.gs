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
  STAT_SPREAD: 0.6,      // 階級差距打幾折：原作強弱還在，但抽到誰不至於開局就定勝負
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
  BRAWL: 0.95,
  PATROL_MEET: 0.65,
  SCOUT_DEEP: 0.35,      // 打聽時順便看穿一位真名的機率
  NEWS_REVEAL: 0.5       // 早報裡交手的兩方，各有幾成機會被你記下職階與位置
};

// 最後一夜在哪裡：照原作，第五次是柳洞寺（大聖杯在圓藏山地底），第四次是新都的冬木市民會館。
var WAR_FINAL_ = {
  '5th': { place: '柳洞寺', arrive: '剩下的從者一個接一個踏進了寺院', next: '寺院的石階上，又一位從者走了上來' },
  '4th': { place: '冬木市民會館', arrive: '剩下的從者一個接一個闖進了會館', next: '會館的大廳裡，又一位從者走了進來' }
};
function warFinal_(st) { return WAR_FINAL_[st && st.war] || WAR_FINAL_['5th']; }

// 職階：敵人的個性（aggr 越高越愛出手）。技能不看職階，看每位從者自己的技能（WAR_SKILL_）。
var WAR_CLASS_ = {
  Saber: { aggr: 0.5 }, Archer: { aggr: 0.5 }, Lancer: { aggr: 0.6 }, Rider: { aggr: 0.5 },
  Caster: { aggr: 0.25 }, Assassin: { aggr: 0.4 }, Berserker: { aggr: 0.85 }
};
function warClass_(cls) { return WAR_CLASS_[cls] || { aggr: 0.5 }; }

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
var WAR_FORESEE_ = { txt: '看得出對方要放寶具，攻擊也比較難打中', seeNp: 1, npTaken: 0.8, hitTaken: 0.88 };
var WAR_LASTSTAND_ = { txt: '傷勢還沒到重傷時，一擊打不倒（一場戰鬥一次）', lastStand: 1 };
var WAR_SKILL_ = {
  first_strike: WAR_FORESEE_, analyze: WAR_FORESEE_, insight: WAR_FORESEE_, sense: WAR_FORESEE_,
  survive: WAR_LASTSTAND_, god_hand: WAR_LASTSTAND_, regen: WAR_LASTSTAND_,
  ride: { txt: '撤退比較跑得掉，對方想逃也比較甩不掉', retreat: 0.3, chase: 0.15 },
  stealth: { txt: '據點很難被找到，也很難被打聽；出擊的第一擊必中', findMe: 0.7, hideScout: 0.5, ambush: 1 },
  territory: { txt: '守家受傷更少，闖進來的人先吃一記魔術陣', homeTaken: 0.73, ward: 0.22 },
  mad: { txt: '傷害高一截，沒辦法試探', dmgDealt: 1.18, noProbe: 1 },
  nullify_magic: { txt: 'Caster 的攻擊與魔術陣傷得不深', from: 'Caster', dmgTaken: 0.7, npTaken: 0.7, wardTaken: 0.4 },
  aim: { txt: '巡邏一定找得到人，打聽一次多看兩處', patrolMeet: 1, scoutExtra: 2, findThem: 1.5 },
  solo: { txt: '打聽時從者自己去探，你們順便喘口氣', scoutRest: 0.35 },
  evade_ranged: { txt: 'Archer 的攻擊很難打中', from: 'Archer', hitTaken: 0.6 },
  tactics: { txt: '寶具打在身上輕一截，自己的寶具重一截', npTaken: 0.75, npDealt: 1.1 }
};
var WAR_FROM_HOOKS_ = { dmgTaken: 1, npTaken: 1, hitTaken: 1 };

// 讀表三支：乘、加、有沒有。foe＝對手（有 from 的時機要看對手職階）。
function warSkRows_(u) { return ((u && u.fx) || []).map(function (f) { return WAR_SKILL_[f]; }).filter(Boolean); }
function warSkOk_(row, hook, foe) { return row[hook] !== undefined && !(row.from && WAR_FROM_HOOKS_[hook] && (!foe || foe.cls !== row.from)); }
function warMul_(u, hook, foe) { return warSkRows_(u).reduce(function (m, r) { return warSkOk_(r, hook, foe) ? m * r[hook] : m; }, 1); }
function warAdd_(u, hook, foe) { return warSkRows_(u).reduce(function (a, r) { return warSkOk_(r, hook, foe) ? a + r[hook] : a; }, 0); }
function warFlag_(u, hook) { return warSkRows_(u).some(function (r) { return !!r[hook]; }); }
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
  var fx = [], names = {}, rows = [];
  (seed.classSkills || []).concat(seed.skills || []).forEach(function (x) {
    var f = x && x.fx, r = WAR_SKILL_[f];
    if (!r || rows.indexOf(r) >= 0) return;
    rows.push(r); fx.push(f); names[f] = String(x.n || '').replace(/\s.*$/, '');
  });
  return { fx: fx, names: names };
}
function warTraits_(u) {
  return ((u && u.fx) || []).map(function (f) { return (u.skn[f] || f) + '：' + WAR_SKILL_[f].txt; });
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
    np: warSpread_(Math.max(warRank_(six['寶具']), seed.np ? WAR_.NP_FLOOR : 0)),
    mhp: mhp, hp: mhp, cd: 0, saved: false
  };
  var sk = warSkillsOf_(seed), p = seed.persona || {};
  u.fx = sk.fx; u.skn = sk.names;
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
    engaged: [], ticked: [], hunted: false, foughtTonight: false,
    result: null, stats: { np: 0, battles: 0, kills: 0, seals: 0, retreats: 0, dodged: 0, ignoredTele: 0, finalFoes: 0 }, seq: 0
  };
  warSummon_(st, o);
  return st;
}

// 召喚：從池子抽一位；對手是這場戰爭的正典陣容，抽到的那位從陣容裡拿掉。重抽也走這支。
function warSummon_(st, o) {
  var prev = st.sv ? st.sv.hero : '';
  var pool = (o.pool || []).filter(function (s) { return s.id !== prev; });
  var seed = warPick_(st, pool.length ? pool : (o.pool || []));
  st.sv = warUnit_(seed, {});
  st.enemies = [];
  (o.roster || []).forEach(function (r, i) {
    if (r.hero === seed.id) return;
    var hs = (o.seeds || {})[r.hero];
    if (!hs) return;
    st.enemies.push(warUnit_(hs, {
      id: 'e' + i, master: (r.master && (o.masterNames || {})[r.master]) || '無主', loc: warLocName_(r.loc),
      arrive: r.arriveDay || 1, intel: 0, found: false, alive: true
    }));
  });
}
function warLocName_(loc) { return String(loc || '冬木').replace(/^冬木·/, ''); }

// ── 對外：這一刻能按的鈕（唯一真實來源；前端照畫、後端照驗）──
function warButtons_(st) {
  var sv = st.sv, B = [];
  if (st.phase === 'summon') {
    B.push({ t: 'start', label: '開戰', sub: '進入第一個白天' });
    B.push({ t: 'reroll', label: '重新召喚', sub: '剩 ' + st.rerolls + ' 次', dis: st.rerolls <= 0 });
  } else if (st.phase === 'day') {
    B.push({ t: 'scout', label: '打聽消息', sub: '找出一位從者的下落，或看穿一位的真名' });
    B.push({ t: 'rest', label: '休養', sub: '從者恢復近半，御主也喘口氣' });
    B.push({ t: 'supply', label: '補魔', sub: sv.cd > 0 ? (sv.cd <= WAR_.SUPPLY_CD ? '魔力補回來，寶具今晚就能再放' : '魔力早回來 ' + WAR_.SUPPLY_CD + ' 夜') : '魔力是滿的，只回一點體力' });
  } else if (st.phase === 'night' && st.day >= WAR_.NIGHTS) {
    var left = warArrived_(st).length;
    B.push({ t: 'final', label: '前往' + warFinal_(st).place, sub: '聖杯降臨的最後一夜，' + (left > 1 ? '剩下的 ' + left + ' 位從者都會現身' : '最後一位從者會在那裡等你') });
  } else if (st.phase === 'night') {
    warKnownFoes_(st).forEach(function (e) {
      B.push({ t: 'sortie', id: e.id, label: '突襲 ' + warFoeLabel_(e), sub: warOdds_(st, e) + '・' + warHpWord_(e) + '・' + e.loc });
    });
    B.push({ t: 'patrol', label: '巡邏', sub: '出門找人，撞上誰就打誰' });
    B.push({ t: 'hold', label: '固守', sub: '待在據點，有人來就在自家迎戰' });
  } else if (st.phase === 'battle') {
    var e = warFoe_(st, st.battle.e);
    var berserk = warFlag_(sv, 'noProbe');
    B.push({ t: 'stance', s: 'strike', label: '正面', sub: '硬碰硬', sealSub: '令咒強化：必中，傷害一倍半' });
    B.push({ t: 'stance', s: 'probe', label: '試探', sub: berserk ? '狂化中沒辦法試探' : (e.intel >= 2 ? '傷害減半，先穩住' : '傷害減半，看穿對方真名'), dis: berserk });
    B.push({ t: 'stance', s: 'np', label: '寶具「' + sv.npName + '」', sub: sv.cd > 0 ? '魔力還沒回來，還要 ' + sv.cd + ' 夜' : (st.exposed ? '全力一擊' : '全力一擊，但會暴露你的真名'), sealSub: '以令咒的魔力硬放，對轟佔上風', dis: sv.cd > 0, sealOk: true });
    if (st.battle.ctx !== 'final') B.push({ t: 'stance', s: 'retreat', label: '撤退', sub: '成功率' + warChanceWord_(warRetreatChance_(sv, e, false)), sealSub: '令咒：強制撤離' });
  }
  return B;
}

// 按下去的東西必須出現在 warButtons_ 裡；令咒另外看剩幾劃。
function warAllowed_(st, act) {
  var list = warButtons_(st);
  var hit = list.filter(function (b) { return b.t === act.t && (b.id || '') === (act.id || '') && (b.s || '') === (act.s || ''); })[0];
  if (!hit) return '現在不能這麼做。';
  if (act.seal && (st.phase !== 'battle' || st.master.seals <= 0)) return '令咒已經用完了。';
  if (act.seal && !hit.sealSub) return '這一招用不上令咒。';
  if (hit.dis && !(act.seal && hit.sealOk)) return hit.sub || '現在不能這麼做。';
  return '';
}

// ── 對外：做一個決定 ──────────────────────────────────
// 回 { ok, msg, ev:[{k, txt, num}] }：txt 是給 AI 的事實（不含數字），num 是給畫面的數字。
function warAct_(st, act) {
  act = act || {};
  if (st.phase === 'over') return { ok: false, msg: '這一局已經結束了。', ev: [] };
  var bad = warAllowed_(st, act);
  if (bad) return { ok: false, msg: bad, ev: [] };
  var ev = [];
  st.seq = (st.seq || 0) + 1;
  if (st.phase === 'summon') warDoSummon_(st, act, ev);
  else if (st.phase === 'day') warDoDay_(st, act, ev);
  else if (st.phase === 'night') warDoNight_(st, act, ev);
  else if (st.phase === 'battle') warDoRound_(st, act, ev);
  return { ok: true, msg: '', ev: ev };
}

function warDoSummon_(st, act, ev) {
  if (act.t === 'reroll') {
    st.rerolls--;
    ev.push({ k: 'summon', txt: '召喚陣再次亮起，回應你的是另一位英靈：' + st.sv.cls + '「' + st.sv.name + '」。' });
    return;
  }
  st.phase = 'day';
  ev.push({ k: 'start', txt: '第 1 天。聖杯戰爭開始了。冬木市裡還有 ' + warAliveCount_(st) + ' 組主從，你還不知道他們是誰。' });
}

// ── 白天 ──────────────────────────────────────────────
function warDoDay_(st, act, ev) {
  var sv = st.sv;
  if (act.t === 'scout') {
    var hidden = warArrived_(st).filter(function (e) { return e.intel === 0; });
    var known1 = warArrived_(st).filter(function (e) { return e.intel === 1; });
    var got = false;
    var tries = 1 + warAdd_(sv, 'scoutExtra');
    for (var n = 0; n < tries && hidden.length; n++) {
      var h = warPick_(st, hidden);
      hidden = hidden.filter(function (x) { return x !== h; });
      if (warRand_(st) < warAdd_(h, 'hideScout')) { ev.push({ k: 'intel', txt: '有一位從者的氣息怎麼也抓不到。' }); continue; }
      h.intel = 1; got = true;
      ev.push({ k: 'intel', txt: '打聽到了：' + h.loc + '一帶有一位 ' + h.cls + ' 出沒。' });
    }
    if (got) {
      if (known1.length && warRand_(st) < WAR_.SCOUT_DEEP) got = warReveal_(st, warPick_(st, known1), ev) || got;
    } else if (!hidden.length && known1.length && warRand_(st) < 0.7) {
      got = warReveal_(st, warPick_(st, known1), ev);
    }
    if (!got) ev.push({ k: 'intel', txt: '跑了一整天，沒問到新的消息。' });
    if (warAdd_(sv, 'scoutRest') > 0) { var sr = warHeal_(sv, warAdd_(sv, 'scoutRest')); warHealMaster_(st, WAR_.REST_MASTER / 2); ev.push({ k: 'rest', txt: sv.name + '自己出去探，你留在據點喘了口氣。', num: sr ? '從者 +' + sr : '' }); }
    warArrived_(st).forEach(function (e) {
      if (!e.found && warRand_(st) < WAR_.FIND_SCOUT) { e.found = true; ev.push({ k: 'watched', txt: '回程的路上，你覺得背後有一道視線。' }); }
    });
  } else if (act.t === 'rest') {
    var a = warHeal_(sv, WAR_.REST_HEAL), m = warHealMaster_(st, WAR_.REST_MASTER);
    ev.push({ k: 'rest', txt: sv.name + '在據點裡休養了一整天。', num: [a ? '從者 +' + a : '', m ? '御主 +' + m : ''].filter(Boolean).join('・') });
  } else if (act.t === 'supply') {
    var had = sv.cd;
    sv.cd = Math.max(0, sv.cd - WAR_.SUPPLY_CD);
    var b = warHeal_(sv, WAR_.SUPPLY_HEAL);
    ev.push({ k: 'supply', txt: '你為' + sv.name + '補魔。' + (had > 0 ? (sv.cd === 0 ? '寶具的力量重新充盈了。' : '寶具的力量回來了一些。') : '寶具本來就已經就緒。'), num: (sv.cd === 0 ? '寶具就緒' : '寶具還要 ' + sv.cd + ' 夜') + (b ? '・從者 +' + b : '') });
  }
  st.phase = 'night';
}

function warReveal_(st, e, ev) {
  if (!e || e.intel >= 2) return false;
  e.intel = 2;
  ev.push({ k: 'reveal', txt: '看穿了那位 ' + e.cls + ' 的真名：「' + e.name + '」。知道了真名，就知道弱點在哪裡。' });
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
    warStartBattle_(st, warFinalNext_(st), 'final', ev);
    return;
  }
  if (act.t === 'sortie') {
    var e = warFoe_(st, act.id);
    ev.push({ k: 'sortie', txt: '夜裡，你帶著' + st.sv.name + '前往' + e.loc + '，找上了' + warFoeLabel_(e) + '。' });
    warStartBattle_(st, e, 'sortie', ev);
    return;
  }
  if (act.t === 'patrol') {
    var pool = warArrived_(st);
    var meet = warFlag_(st.sv, 'patrolMeet') ? 1 : WAR_.PATROL_MEET;
    if (pool.length && warRand_(st) < meet) {
      var m = warPick_(st, pool);
      m.intel = Math.max(m.intel, 1);
      ev.push({ k: 'patrol', txt: '夜巡到' + m.loc + '時，撞見了' + warFoeLabel_(m) + '。' });
      warStartBattle_(st, m, 'patrol', ev);
      return;
    }
    var hid = pool.filter(function (x) { return x.intel === 0; });
    if (hid.length) { var h = warPick_(st, hid); h.intel = 1; ev.push({ k: 'patrol', txt: '巡了一整夜沒撞見人，但在' + h.loc + '找到一位 ' + h.cls + ' 留下的痕跡。' }); }
    else ev.push({ k: 'patrol', txt: '巡了一整夜，街上安安靜靜。' });
    warFinishNight_(st, ev);
    return;
  }
  ev.push({ k: 'hold', txt: '這一夜你們守在據點裡。' });
  warFinishNight_(st, ev);
}

// 敵人一個一個行動；有人找上門就停下來開打，打完再從這裡接著跑。
function warFinishNight_(st, ev) {
  if (warTick_(st, ev)) return;
  warMorning_(st, ev);
}

function warTick_(st, ev) {
  var order = warArrived_(st).slice().sort(function (a, b) { return warClass_(b.cls).aggr - warClass_(a.cls).aggr; });
  for (var i = 0; i < order.length; i++) {
    var e = order[i];
    if (!e.alive || st.ticked.indexOf(e.id) >= 0 || st.engaged.indexOf(e.id) >= 0) continue;
    st.ticked.push(e.id);
    var aggr = warClass_(e.cls).aggr;
    var fallen = st.enemies.filter(function (x) { return !x.alive; }).length;
    if (!e.found) {
      var f = WAR_.FIND_BASE + (st.out ? WAR_.FIND_OUT : 0) + (st.exposed ? WAR_.FIND_EXPOSED : 0) + fallen * WAR_.FIND_LATE;
      f *= warMul_(st.sv, 'findMe') * warMul_(e, 'findThem');
      if (warRand_(st) < f) e.found = true;
    }
    var hunt = aggr * WAR_.HUNT + (st.exposed ? WAR_.HUNT_EXPOSED : 0) + (st.sv.hp < st.sv.mhp * 0.5 ? WAR_.HUNT_WOUNDED : 0) + fallen * WAR_.HUNT_LATE;
    if (!st.out && !st.hunted && e.found && warRand_(st) < hunt) {
      st.hunted = true;
      e.intel = Math.max(e.intel, 1);
      ev.push({ k: 'raid', txt: '深夜，' + warFoeLabel_(e) + '找上了你的據點。' });
      warStartBattle_(st, e, 'defend', ev);
      return true;
    }
    if (warRand_(st) < aggr * WAR_.BRAWL) {
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
    ev.push({ k: 'news', txt: '昨夜' + (pairs.length ? pairs.join('、') + '交過手，都掛了彩、各自退去' : '') + (pairs.length && blur ? '；另外還有 ' : (blur ? '冬木有 ' : '')) + (blur ? blur + ' 處傳出交手的動靜，看不出是誰' : '') + '。' });
  }
  if (!st.foughtTonight) warHeal_(sv, WAR_.NIGHT_HEAL);
  sv.cd = Math.max(0, sv.cd - 1);
  st.enemies.forEach(function (e) { if (e.alive) e.cd = Math.max(0, e.cd - 1); });
  st.day++;
  st.battle = null; st.out = false;
  if (warCheckEnd_(st, ev)) return;
  if (st.day > WAR_.NIGHTS) { warOver_(st, false, 'timeout', ev); return; }
  st.enemies.forEach(function (e) {
    if (e.alive && e.arrive === st.day && st.day > 1) ev.push({ k: 'arrive', txt: '清晨傳來消息：又有一位從者踏進了冬木。' });
  });
  ev.push({ k: 'morning', txt: '第 ' + st.day + ' 天的早晨。還剩 ' + (WAR_.NIGHTS - st.day + 1) + ' 夜，敵方還有 ' + warAliveCount_(st) + ' 位從者。' });
  st.phase = 'day';
}

// ── 戰鬥 ──────────────────────────────────────────────
function warStartBattle_(st, e, ctx, ev) {
  st.phase = 'battle';
  st.battle = { e: e.id, round: 1, ctx: ctx, hp0: Math.round(st.sv.hp / st.sv.mhp * 100) };
  if (st.engaged.indexOf(e.id) < 0) st.engaged.push(e.id);
  st.foughtTonight = true;
  st.stats.battles++;
  st.sv.saved = false; e.saved = false;
  st.battle.ambush = ctx === 'sortie' && warFlag_(st.sv, 'ambush');
  if (ctx === 'defend' && warAdd_(st.sv, 'ward') > 0) {
    var w = Math.round(e.mhp * warAdd_(st.sv, 'ward') * warMul_(e, 'wardTaken'));
    e.hp = Math.max(1, e.hp - w);
    ev.push({ k: 'ward', txt: '對方一踏進據點，布下的魔術陣先炸開了。' + warFoeLabel_(e) + warHurtWord_(e) + '。', num: '−' + w });
  }
  if (ctx === 'sortie' && warAdd_(e, 'ward') > 0) {
    var w2 = Math.round(st.sv.mhp * warAdd_(e, 'ward') * warMul_(st.sv, 'wardTaken'));
    st.sv.hp = Math.max(1, st.sv.hp - w2);
    ev.push({ k: 'ward', txt: '闖進對方的陣地，腳下的魔術陣先炸開了。' + st.sv.name + warHurtWord_(st.sv) + '。', num: '−' + w2 });
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
  var c = warClass_(me.cls), berserk = warFlag_(me, 'noProbe');
  if (me.cd === 0 && (me.hp < me.mhp * 0.5 || foe.hp < foe.mhp * 0.55 || (round >= 2 && warRand_(st) < c.aggr * 0.5))) return 'np';
  if (!berserk && !(st.battle && st.battle.ctx === 'final') && me.hp < me.mhp * 0.3 && c.aggr < 0.7 && warRand_(st) < 0.45) return 'retreat';
  if (!berserk && (me.cls === 'Caster' || me.cls === 'Assassin') && warRand_(st) < 0.2) return 'probe';
  return 'strike';
}

function warDoRound_(st, act, ev) {
  var b = st.battle, e = warFoe_(st, b.e), sv = st.sv;
  if (act.seal) { st.master.seals--; st.stats.seals++; ev.push({ k: 'seal', txt: '你舉起手背，令咒亮了起來。' }); }
  var A = { u: sv, act: act.s, seal: !!act.seal, side: 'me', knows: e.intel >= 2, home: b.ctx === 'defend', ambush: b.round === 1 && !!b.ambush };
  var Z = { u: e, act: b.intent, seal: false, side: 'foe', knows: st.exposed, home: false };
  var r = warExchange_(st, A, Z, ev);
  if (b.tele === 'np' && Z.act === 'np') {
    if (act.s === 'probe' || r.ended) warStat_(st, 'dodged');
    else if (act.s === 'strike') { warStat_(st, 'ignoredTele'); b.ignored = true; }
  }
  if (r.ended === 'retreat' && r.who === 'me') warStat_(st, 'retreats');
  if (act.s === 'np') { st.stats.np++; if (!st.exposed) { st.exposed = true; ev.push({ k: 'exposed', txt: '真名解放的那一刻，你的從者是誰，全冬木都知道了。' }); } }
  if (Z.act === 'np' && e.intel < 2) { e.intel = 2; ev.push({ k: 'reveal', txt: '看見那道寶具，你認出了對方：「' + e.name + '」。' }); }
  if (act.s === 'probe' && e.alive && e.intel < 2) warReveal_(st, e, ev);
  if (!e.alive) { st.stats.kills++; ev.push({ k: 'kill', txt: warFoeLabel_(e) + '的身影化作光點，消散在夜色裡。' }); }
  if (warCheckEnd_(st, ev)) return;
  if (r.ended || !e.alive) { warEndBattle_(st, ev); return; }
  b.round++;
  var cap = b.ctx === 'final' ? WAR_.FINAL_ROUNDS : WAR_.ROUNDS;
  if (b.round > cap) {
    if (b.ctx === 'final') { warOver_(st, false, 'timeout', ev); return; }
    ev.push({ k: 'dawn', txt: '天色泛白，雙方各自退去。' }); warEndBattle_(st, ev); return;
  }
  warSetIntent_(st, e);
}

function warEndBattle_(st, ev) {
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
      ev.push({ k: 'retreat', side: S.side, txt: warWho_(st, S) + '抽身撤退，脫離了戰場。' });
      return { ended: 'retreat', who: S.side };
    }
    ev.push({ k: 'retreat', side: S.side, txt: warWho_(st, S) + '想撤退，卻被纏住了。' });
    S.act = 'none';
  }
  if (A.act === 'np' && Z.act === 'np') {
    var sa = A.u.np + warRand_(st) * 3 + (A.seal ? 3 : 0), sz = Z.u.np + warRand_(st) * 3 + (Z.seal ? 3 : 0);
    var W = sa >= sz ? A : Z, L = W === A ? Z : A;
    A.u.cd = WAR_.NP_COOLDOWN; Z.u.cd = WAR_.NP_COOLDOWN;
    var d = Math.round(warNpDmg_(W, L) * WAR_.CLASH_WIN);
    var stood = warApply_(st, L, d);
    ev.push({ k: 'clash', txt: '兩道寶具正面相撞。' + warWho_(st, W) + '的「' + W.u.npName + '」壓過了' + warWho_(st, L) + '的「' + L.u.npName + '」，' + warWho_(st, L) + warHurtWord_(L.u) + '。', num: '−' + d });
    if (stood) warStoodEv_(st, L, ev);
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
  var guard = Y.act === 'probe' ? WAR_.PROBE : 1;
  var home = Y.home ? WAR_.HOME * warMul_(Y.u, 'homeTaken') : 1;
  if (X.act === 'np') {
    X.u.cd = WAR_.NP_COOLDOWN;
    var nd = Math.round(warNpDmg_(X, Y) * guard * home * warMul_(X.u, 'npDealt') * warMul_(Y.u, 'npTaken', X.u));
    var npStood = warApply_(st, Y, nd);
    ev.push({ k: 'np', side: X.side, txt: warWho_(st, X) + '解放寶具「' + X.u.npName + '」。' + (Y.act === 'probe' ? warWho_(st, Y) + '早有防備，避開了大半；餘波過後，' : warWho_(st, Y)) + warHurtWord_(Y.u) + '。', num: '−' + nd });
    if (npStood) warStoodEv_(st, Y, ev);
    if (Y.side === 'me' && Y.act !== 'probe') warMasterHit_(st, WAR_.NP_MASTER_HIT, ev);
    return;
  }
  var hitP = warHitChance_(X.u, Y.u) * warMul_(Y.u, 'hitTaken', X.u);
  var hit = X.seal || X.ambush || warRand_(st) < hitP;
  var probe = X.act === 'probe';
  if (!hit) { ev.push({ k: 'miss', side: X.side, txt: warWho_(st, X) + (probe ? '出手試探，' : '搶攻，') + '被' + warWho_(st, Y) + '架開了。' }); return; }
  var d = warNormalDmg_(st, X, Y) * (probe ? WAR_.PROBE : 1) * (X.seal ? 1.5 : 1) * (X.ambush ? warMul_(X.u, 'ambushDmg') : 1) * guard * home * warMul_(Y.u, 'dmgTaken', X.u);
  d = Math.max(WAR_.DMG_MIN, Math.round(d));
  var hitStood = warApply_(st, Y, d);
  var how = X.ambush ? '憑著「' + warSkName_(X.u, 'ambush') + '」趁對方還沒察覺先下手，打中了' : (probe ? '出手試探，擦中了' : '一記正面強攻，打中了');
  ev.push({ k: 'hit', side: X.side, txt: warWho_(st, X) + how + warWho_(st, Y) + '，對方' + warHurtWord_(Y.u) + '。', num: '−' + d });
  if (hitStood) warStoodEv_(st, Y, ev);
  if (Y.side === 'me' && X.u.cls === 'Assassin') warMasterHit_(st, WAR_.ASSASSIN_MASTER_HIT, ev);
}

// 扣血；回 true＝這一下本該倒下，被 lastStand 撐住了（呼叫端在自己那句之後補 warStoodEv_）。
function warApply_(st, Y, d) {
  var u = Y.u, before = u.hp, stood = false;
  u.hp = Math.max(0, u.hp - d);
  if (u.hp <= 0 && warFlag_(u, 'lastStand') && !u.saved && before > u.mhp * 0.25) { u.saved = true; u.hp = 1; stood = true; }
  if (u.hp <= 0 && Y.side !== 'me') u.alive = false;
  return stood;
}
function warStoodEv_(st, Y, ev) {
  ev.push({ k: 'skill', side: Y.side, txt: warWho_(st, Y) + '本該倒下，卻憑著「' + warSkName_(Y.u, 'lastStand') + '」硬是站住了。' });
}

function warMasterHit_(st, n, ev) {
  st.master.hp = Math.max(0, st.master.hp - n);
  ev.push({ k: 'master', txt: '餘波捲到了你，御主受了傷。', num: '御主 −' + n });
}

// 敵對敵：兩邊都照自己的個性打，最多三回合。
function warAutoBattle_(st, a, b, ev) {
  a.saved = false; b.saved = false;
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
    ev.push({ k: 'news', txt: '昨夜' + a.loc + '一帶有兩位從者交手，' + warFoeLabel_(dead) + '消失了，' + warFoeLabel_(win) + '還站著。' });
  } else {
    // 沒人倒下的交手：早上併成一句（warMorning_）；認不出是誰的只算場數。
    var la = warFoeLabel_(a), lb = warFoeLabel_(b);
    if (la === lb) lb = '另一位 ' + b.cls;   // 兩位 Archer 還沒看穿時，別寫成「那位 Archer與那位 Archer」
    ev.push({ k: 'draw', txt: a.intel === 0 && b.intel === 0 ? '' : la + '與' + lb + '（' + a.loc + '）' });
  }
}

// ── 算式 ──────────────────────────────────────────────
function warHitChance_(x, y) { return warClamp_(WAR_.HIT_BASE + (x.spd - y.spd) * WAR_.HIT_PER_SPD, WAR_.HIT_MIN, WAR_.HIT_MAX); }
function warMult_(X) {
  return (X.knows ? WAR_.WEAK : 1) * warMul_(X.u, 'dmgDealt');
}
function warNormalDmg_(st, X, Y) {
  var base = (WAR_.DMG_BASE + X.u.atk * WAR_.DMG_PER_ATK) * warMult_(X) - Y.u.def * WAR_.DMG_DEF;
  return base * (0.85 + warRand_(st) * 0.3);
}
function warNpDmg_(X, Y) {
  return Math.max(20, (WAR_.NP_BASE + X.u.np * WAR_.NP_PER_RANK) * warMult_(X) - Y.u.def * WAR_.NP_DEF);
}
function warRetreatChance_(u, o, seal) {
  if (seal) return 1;
  return warClamp_(WAR_.RETREAT_BASE + (u.spd - o.spd) * WAR_.RETREAT_PER_SPD + warAdd_(u, 'retreat') - warAdd_(o, 'chase'), WAR_.RETREAT_MIN, WAR_.RETREAT_MAX);
}
function warHeal_(u, pct) { var before = u.hp; u.hp = Math.min(u.mhp, u.hp + Math.round(u.mhp * pct)); return u.hp - before; }
function warHealMaster_(st, n) { var m = st.master, before = m.hp; m.hp = Math.min(m.mhp, m.hp + n); return m.hp - before; }

// 勝算：雙方各要幾回合打倒對方，比一比。
function warOdds_(st, e) {
  var me = { u: st.sv, knows: e.intel >= 2 }, foe = { u: e, knows: st.exposed };
  var myD = Math.max(1, warHitChance_(st.sv, e) * ((WAR_.DMG_BASE + st.sv.atk * WAR_.DMG_PER_ATK) * warMult_(me) - e.def * WAR_.DMG_DEF));
  var eD = Math.max(1, warHitChance_(e, st.sv) * ((WAR_.DMG_BASE + e.atk * WAR_.DMG_PER_ATK) * warMult_(foe) - st.sv.def * WAR_.DMG_DEF));
  var r = (st.sv.hp / eD) / (e.hp / myD);
  return r > 1.5 ? '勝算大' : r > 0.85 ? '勢均力敵' : r > 0.5 ? '勝算小' : '凶險';
}

// ── 文字與查詢 ────────────────────────────────────────
function warFinalNext_(st) { return warArrived_(st).sort(function (a, b) { return a.hp / a.mhp - b.hp / b.mhp; })[0] || null; }
function warFoe_(st, id) { return st.enemies.filter(function (e) { return e.id === id; })[0] || null; }
function warArrived_(st) { return st.enemies.filter(function (e) { return e.alive && e.arrive <= st.day; }); }
function warKnownFoes_(st) { return warArrived_(st).filter(function (e) { return e.intel >= 1; }); }
function warAliveCount_(st) { return st.enemies.filter(function (e) { return e.alive; }).length; }
function warFoeLabel_(e) { return e.intel >= 2 ? '「' + e.name + '」' : (e.intel >= 1 ? '那位 ' + e.cls : '一位不明的從者'); }
function warWho_(st, S) { return S.side === 'me' ? st.sv.name : warFoeLabel_(S.u); }
function warHpWord_(u) {
  var r = u.hp / u.mhp;
  return r > 0.8 ? '完好' : r > 0.5 ? '負傷' : r > 0.25 ? '重傷' : '瀕死';
}
function warHurtWord_(u) {
  if (u.hp <= 0) return '倒下了';
  var r = u.hp / u.mhp;
  return r > 0.8 ? '只受了輕傷' : r > 0.5 ? '傷得不輕' : r > 0.25 ? '身負重傷' : '已經站不穩了';
}
function warChanceWord_(p) { return p >= 0.8 ? '很高' : p >= 0.55 ? '一半以上' : p >= 0.35 ? '不太高' : '很低'; }

function warCheckEnd_(st, ev) {
  if (st.phase === 'over') return true;
  if (st.sv.hp <= 0) { warOver_(st, false, 'servant', ev); return true; }
  if (st.master.hp <= 0) { warOver_(st, false, 'master', ev); return true; }
  if (warAliveCount_(st) === 0) { warOver_(st, true, 'win', ev); return true; }
  return false;
}
function warStat_(st, k) { st.stats[k] = (st.stats[k] || 0) + 1; }
function warOver_(st, win, cause, ev) {
  var b = st.battle, e = b ? warFoe_(st, b.e) : null;
  st.phase = 'over'; st.battle = null;
  st.result = { win: win, cause: cause, day: Math.min(st.day, WAR_.NIGHTS) };
  if (e) { st.result.foe = warFoeLabel_(e).replace(/[「」]/g, ''); st.result.foeIntel = e.intel; st.result.ctx = b.ctx; st.result.hp0 = b.hp0; st.result.ignored = !!b.ignored; }
  var T = { win: '最後一位敵方從者消失了。聖杯，就在你的眼前。', servant: st.sv.name + '倒下了。你的聖杯戰爭到此為止。', master: '你倒下了。失去御主的從者，也隨之消散。', timeout: '最後一夜過去，聖杯落到了別人手裡。' };
  ev.push({ k: 'over', txt: T[cause] || '' });
}

// 一位對手在畫面上的情報：知道職階（intel 1）才有位置與傷勢；看穿真名（intel 2）才攤開御主、寶具、技能。
function warFoeCard_(st, e) {
  var c = { id: e.id, label: warFoeLabel_(e).replace(/[「」]/g, ''), cls: e.cls, intel: e.intel, alive: e.alive,
    hp: e.intel >= 1 && e.alive ? warHpWord_(e) : '', loc: e.intel >= 1 ? e.loc : '' };
  if (e.alive && e.intel >= 1 && st.phase !== 'over') c.odds = warOdds_(st, e);
  if (e.intel >= 2) {
    c.name = e.name; c.master = e.master; c.np = e.npName; c.npReady = !(e.cd > 0);
    c.traits = warTraits_(e);
  }
  return c;
}

// ── 賽後：戰績與講評（老虎道場只演這裡算好的東西）──
// 輸了：由上往下第一條成立的就是「輸在哪」＋「下一局只改這一件事」。{foe}{n}{seals} 用的時候才代入。
var WAR_DOJO_LOSS_ = [
  { key: 'master', when: function (st, R) { return R.cause === 'master'; },
    fact: '御主自己先倒下了', lesson: '御主也會受傷：正面吃下寶具、被 Assassin 盯上都會波及你；白天休養時御主也一起養回來' },
  { key: 'dawn', when: function (st, R) { return R.cause === 'timeout'; },
    fact: '{final}的決戰打到天亮，{foe}還站著', lesson: '在最後一夜之前多打倒幾位，決戰時留著寶具與令咒收尾' },
  { key: 'tele', when: function (st, R) { return !!R.ignored; },
    fact: '看見{foe}要放寶具的預兆，還是正面硬碰硬地吃下了那一擊', lesson: '畫面跳出「要放寶具了」時，用試探躲開大半，或者撤退' },
  { key: 'blind', when: function (st, R) { return R.foe && R.foeIntel < 2; },
    fact: '到最後都不知道{foe}的真名', lesson: '白天打聽、戰鬥中試探，先看穿真名再打，攻擊才打得到弱點' },
  { key: 'wounded', when: function (st, R) { return R.hp0 !== undefined && R.hp0 < 50 && R.ctx !== 'final'; },
    fact: '從者帶著重傷上了戰場，對上了{foe}', lesson: '傷重的時候白天先休養，夜裡固守在據點' },
  { key: 'crowd', when: function (st, R) { return R.ctx === 'final' && (st.stats.finalFoes || 0) >= 3; },
    fact: '最後一夜，{final}裡還站著 {n} 位從者', lesson: '在最後一夜之前，挑「勝算大」的對手各個擊破' },
  { key: 'seals', when: function (st, R) { return st.master.seals >= WAR_.SEALS; },
    fact: '{seals} 劃令咒一劃都沒用上', lesson: '令咒能讓正面必中、硬放寶具，打不過時也能強制撤退' },
  { key: 'exposed', when: function (st, R) { return st.exposed; },
    fact: '真名早早就曝光，每位對手都打得到你的弱點', lesson: '寶具留到能一口氣收掉對手的時候再放' },
  { key: 'battle', when: function () { return true; },
    fact: '在與{foe}的交手中落敗', lesson: '夜裡看勝算挑對手，「勝算大」的才去突襲' }
];
// 贏了（輸了也挑一條鼓勵）：成立的全列，最多三條。
var WAR_DOJO_GOOD_ = [
  { key: 'clean', when: function (st) { return st.result && st.result.win && st.master.seals >= WAR_.SEALS; }, txt: '令咒一劃都沒用就拿下聖杯' },
  { key: 'hidden', when: function (st) { return !st.exposed && st.stats.battles > 0; }, txt: '直到最後都沒暴露自己的真名' },
  { key: 'dodge', when: function (st) { return (st.stats.dodged || 0) > 0; }, txt: '看穿預兆，躲開了 {dodged} 次寶具' },
  { key: 'reveal', when: function (st) { return warRevealed_(st) >= 3; }, txt: '看穿了 {reveals} 位從者的真名' },
  { key: 'kills', when: function (st) { return st.stats.kills >= 2; }, txt: '親手打倒了 {kills} 位從者' }
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
  if (!R.win) {
    var L = WAR_DOJO_LOSS_.filter(function (x) { return x.when(st, R); })[0];
    d.key = L.key; d.fact = warFill_(L.fact, o); d.lesson = warFill_(L.lesson, o);
  }
  return d;
}

// 畫面上的說明（開局表單、怎麼玩）要引用的規則數字：只從 WAR_ 拿，前端不另寫一份。
function warRules_(st) {
  var r = { nights: WAR_.NIGHTS, seals: WAR_.SEALS, rounds: WAR_.ROUNDS, npCd: WAR_.NP_COOLDOWN, supplyCd: WAR_.SUPPLY_CD };
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
    sv: { cls: sv.cls, name: sv.name, npName: sv.npName, hp: sv.hp, mhp: sv.mhp, cd: sv.cd, traits: warTraits_(sv), exposed: st.exposed },
    foes: foes.filter(function (e) { return e.intel >= 1; }).map(function (e) { return warFoeCard_(st, e); }),
    unknown: warArrived_(st).filter(function (e) { return e.intel === 0; }).length,
    alive: warAliveCount_(st),
    battle: null, buttons: warButtons_(st), result: st.result, rules: warRules_(st)
  };
  if (st.phase === 'over') view.debrief = warDebrief_(st);
  if (b) {
    var e = warFoe_(st, b.e);
    view.battle = { round: b.round, rounds: WAR_.ROUNDS, foe: warFoeLabel_(e).replace(/[「」]/g, ''), foeHp: Math.round(e.hp / e.mhp * 100), foeWord: warHpWord_(e), tele: b.tele, ctx: b.ctx, info: warFoeCard_(st, e) };
  }
  return view;
}
