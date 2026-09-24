// ⚔️ 新聖杯戰爭引擎：純函式，不碰試算表也不碰 AI，Node 模擬器直接載入同一份。為什麼這樣設計：見 CODE_NOTES.md『WAR_』。
//   一天兩個決定（白天一件事、夜裡去哪），戰鬥每回合選一個姿態；GAS 算完結果，AI 只負責演。

var WAR_ = {
  NIGHTS: 14,            // 幾夜內分出勝負
  MASTER_HP: 100,
  SEALS: 3,
  ROUNDS: 3,             // 一場戰鬥最多幾回合，天亮就各自退去
  FINAL_ROUNDS: 12,      // 最後一夜的決戰打到有人倒下（保險上限）
  FINAL_ABSORB: 1.0,     // 最後一夜：不是你親手收下的魂，每一個讓活著的敵人合計變強這麼多
  NP_COOLDOWN: 4,        // 放完寶具要等幾個早晨才能再放
  SUPPLY_CD: 2,          // 補魔一次把充能往前推幾夜
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
  ENEMY_REST_HEAL: 0.12,
  POWER_HP: 0.10, POWER_DMG: 0.08, POWER_HEAL: 0.20,   // 從者打倒別人之後變強
  NP_MASTER_HIT: 15,     // 我方被寶具正面打中，御主也被餘波捲到
  ASSASSIN_MASTER_HIT: 8,
  RETREAT_BASE: 0.55, RETREAT_PER_SPD: 0.08, RETREAT_MIN: 0.15, RETREAT_MAX: 0.95,
  FIND_BASE: 0.10, FIND_OUT: 0.12, FIND_EXPOSED: 0.20, FIND_SCOUT: 0.05,
  HUNT: 0.7, HUNT_EXPOSED: 0.15, HUNT_WOUNDED: 0.15,
  BRAWL: 1.15,
  PATROL_MEET: 0.65,
  SCOUT_DEEP: 0.35,      // 打聽時順便看穿一位真名的機率
  NEWS_REVEAL: 0.5       // 早報裡交手的兩方，各有幾成機會被你記下職階與位置
};

// 職階：敵人的個性（aggr 越高越愛出手）＋我方選到這個職階時的一條特性。加職階＝往表加一列。
var WAR_CLASS_ = {
  Saber: { aggr: 0.5, trait: '直感：對方要放寶具時一定看得出來' },
  Archer: { aggr: 0.5, trait: '千里眼：巡邏一定找得到人' },
  Lancer: { aggr: 0.6, trait: '戰鬥續行：一場戰鬥裡第一次致命傷會撐住' },
  Rider: { aggr: 0.5, trait: '騎乘：撤退幾乎一定跑得掉' },
  Caster: { aggr: 0.25, trait: '陣地作成：在據點迎戰時受傷更少，找上門的敵人還會先吃一記魔術' },
  Assassin: { aggr: 0.4, trait: '氣息遮斷：敵人很難找到你的據點，出擊時第一擊必中而且更重' },
  Berserker: { aggr: 0.85, trait: '狂化：傷害高一截，但沒辦法試探' }
};
var WAR_CLASS_MOD_ = {
  riderRetreat: 0.25, casterHome: 0.55, casterWard: 0.12, assassinFind: 0.4, assassinAmbush: 1.6, berserkDmg: 1.2
};

function warClass_(cls) { return WAR_CLASS_[cls] || { aggr: 0.5, trait: '' }; }

// 階級字串 → 數字：E1 D2 C3 B4 A5 EX7，每個 + 多 0.4、每個 - 少 0.4。
function warRank_(r) {
  var s = String(r || '').trim().toUpperCase();
  if (!s) return 1;
  if (s.indexOf('EX') === 0) return 7;
  var v = { E: 1, D: 2, C: 3, B: 4, A: 5 }[s.charAt(0)] || 1;
  for (var i = 1; i < s.length; i++) { if (s.charAt(i) === '+') v += 0.4; else if (s.charAt(i) === '-') v -= 0.4; }
  return Math.max(0.6, v);
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
    mhp: mhp, hp: mhp, cd: 0, power: 0, saved: false
  };
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
    v: 1, war: o.war || '5th', day: 1, phase: 'summon', rs: (o.seed | 0) || 1, rerolls: 1,
    master: { name: o.name || '御主', sex: o.sex || '男', hp: WAR_.MASTER_HP, mhp: WAR_.MASTER_HP, seals: WAR_.SEALS },
    sv: null, exposed: false, out: false, enemies: [], battle: null,
    engaged: [], ticked: [], hunted: false, foughtTonight: false,
    result: null, stats: { np: 0, battles: 0, kills: 0, seals: 0 }, seq: 0
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
    B.push({ t: 'supply', label: '補魔', sub: sv.cd > 0 ? (sv.cd <= WAR_.SUPPLY_CD ? '寶具今晚就能再放' : '寶具充能快 ' + WAR_.SUPPLY_CD + ' 夜') : '寶具已經就緒，只回一點體力' });
  } else if (st.phase === 'night' && st.day >= WAR_.NIGHTS) {
    B.push({ t: 'final', label: '前往柳洞寺', sub: '聖杯降臨的最後一夜，剩下的 ' + warArrived_(st).length + ' 位從者都會現身' });
  } else if (st.phase === 'night') {
    warKnownFoes_(st).forEach(function (e) {
      B.push({ t: 'sortie', id: e.id, label: '突襲 ' + warFoeLabel_(e), sub: warOdds_(st, e) + '・' + warHpWord_(e) + '・' + e.loc });
    });
    B.push({ t: 'patrol', label: '巡邏', sub: '出門找人，撞上誰就打誰' });
    B.push({ t: 'hold', label: '固守', sub: '待在據點，有人來就在自家迎戰' });
  } else if (st.phase === 'battle') {
    var e = warFoe_(st, st.battle.e);
    var berserk = sv.cls === 'Berserker';
    B.push({ t: 'stance', s: 'strike', label: '正面', sub: '硬碰硬', sealSub: '必中，傷害一倍半' });
    B.push({ t: 'stance', s: 'probe', label: '試探', sub: berserk ? '狂化中沒辦法試探' : (e.intel >= 2 ? '傷害減半，先穩住' : '傷害減半，看穿對方真名'), sealSub: '看穿真名，這回合不受傷', dis: berserk });
    B.push({ t: 'stance', s: 'np', label: '寶具「' + sv.npName + '」', sub: sv.cd > 0 ? '還要 ' + sv.cd + ' 夜才能再放' : (st.exposed ? '全力一擊' : '全力一擊，但會暴露你的真名'), sealSub: '無視充能，對轟佔上風', dis: sv.cd > 0, sealOk: true });
    if (st.battle.ctx !== 'final') B.push({ t: 'stance', s: 'retreat', label: '撤退', sub: '成功率' + warChanceWord_(warRetreatChance_(sv, e, false)), sealSub: '一定脫離' });
  }
  return B;
}

// 按下去的東西必須出現在 warButtons_ 裡；令咒另外看剩幾劃。
function warAllowed_(st, act) {
  var list = warButtons_(st);
  var hit = list.filter(function (b) { return b.t === act.t && (b.id || '') === (act.id || '') && (b.s || '') === (act.s || ''); })[0];
  if (!hit) return '現在不能這麼做。';
  if (act.seal && (st.phase !== 'battle' || st.master.seals <= 0)) return '令咒已經用完了。';
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
    if (hidden.length) {
      var h = warPick_(st, hidden); h.intel = 1; got = true;
      ev.push({ k: 'intel', txt: '打聽到了：' + h.loc + '一帶有一位 ' + h.cls + ' 出沒。' });
      if (known1.length && (sv.cls === 'Assassin' || warRand_(st) < WAR_.SCOUT_DEEP)) got = warReveal_(st, warPick_(st, known1), ev) || got;
    } else if (known1.length && warRand_(st) < 0.7) {
      got = warReveal_(st, warPick_(st, known1), ev);
    }
    if (!got) ev.push({ k: 'intel', txt: '跑了一整天，沒問到新的消息。' });
    warArrived_(st).forEach(function (e) {
      if (!e.found && warRand_(st) < WAR_.FIND_SCOUT) { e.found = true; ev.push({ k: 'watched', txt: '回程的路上，你覺得背後有一道視線。' }); }
    });
  } else if (act.t === 'rest') {
    var a = warHeal_(sv, WAR_.REST_HEAL), m = warHealMaster_(st, WAR_.REST_MASTER);
    ev.push({ k: 'rest', txt: sv.name + '在據點裡休養了一整天。', num: '從者 +' + a + '・御主 +' + m });
  } else if (act.t === 'supply') {
    var had = sv.cd;
    sv.cd = Math.max(0, sv.cd - WAR_.SUPPLY_CD);
    var b = warHeal_(sv, WAR_.SUPPLY_HEAL);
    ev.push({ k: 'supply', txt: '你為' + sv.name + '補魔。' + (had > 0 ? (sv.cd === 0 ? '寶具的力量重新充盈了。' : '寶具的力量回來了一些。') : '寶具本來就已經就緒。'), num: (sv.cd === 0 ? '寶具就緒' : '寶具還要 ' + sv.cd + ' 夜') + '・從者 +' + b });
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
    var left = warArrived_(st);
    var souls = st.enemies.filter(function (x) { return !x.alive; }).length - st.stats.kills;
    var gain = left.length ? souls * WAR_.FINAL_ABSORB / left.length : 0;
    left.forEach(function (x) {
      x.intel = Math.max(x.intel, 1);
      if (gain > 0) { x.power += gain; x.mhp = Math.round(x.mhp * (1 + WAR_.POWER_HP * gain)); }
      x.hp = x.mhp; x.cd = 0;
    });
    ev.push({ k: 'final', txt: '最後一夜。聖杯在柳洞寺降臨，剩下的從者一個接一個踏進了寺院。' + (souls > 0 ? '其他人倒下時散逸的魂，都流向了他們。' : '') });
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
    var meet = st.sv.cls === 'Archer' ? 1 : WAR_.PATROL_MEET;
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
    if (!e.found) {
      var f = WAR_.FIND_BASE + (st.out ? WAR_.FIND_OUT : 0) + (st.exposed ? WAR_.FIND_EXPOSED : 0);
      if (st.sv.cls === 'Assassin') f *= WAR_CLASS_MOD_.assassinFind;
      if (warRand_(st) < f) e.found = true;
    }
    var hunt = aggr * WAR_.HUNT + (st.exposed ? WAR_.HUNT_EXPOSED : 0) + (st.sv.hp < st.sv.mhp * 0.5 ? WAR_.HUNT_WOUNDED : 0);
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
  st.battle = { e: e.id, round: 1, ctx: ctx };
  if (st.engaged.indexOf(e.id) < 0) st.engaged.push(e.id);
  st.foughtTonight = true;
  st.stats.battles++;
  st.sv.saved = false; e.saved = false;
  st.battle.ambush = ctx === 'sortie' && st.sv.cls === 'Assassin';
  if (ctx === 'defend' && st.sv.cls === 'Caster') {
    var w = Math.round(e.mhp * WAR_CLASS_MOD_.casterWard);
    e.hp = Math.max(1, e.hp - w);
    ev.push({ k: 'ward', txt: '對方一踏進據點，布下的魔術陣先炸開了。' + warFoeLabel_(e) + warHurtWord_(e) + '。', num: '−' + w });
  }
  warSetIntent_(st, e);
}

// 敵人這回合想做什麼：先決定、存起來，玩家看得到預兆就能應對。
function warSetIntent_(st, e) {
  var intent = warIntent_(st, e, st.sv, st.battle.round);
  var see = intent === 'np' && (e.intel >= 2 || st.sv.cls === 'Saber' || warRand_(st) < 0.5);
  st.battle.intent = intent;
  st.battle.tele = see ? 'np' : '';
}

function warIntent_(st, me, foe, round) {
  var c = warClass_(me.cls), berserk = me.cls === 'Berserker';
  if (me.cd === 0 && (me.hp < me.mhp * 0.5 || foe.hp < foe.mhp * 0.55 || (round >= 2 && warRand_(st) < c.aggr * 0.5))) return 'np';
  if (!berserk && !(st.battle && st.battle.ctx === 'final') && me.hp < me.mhp * 0.3 && c.aggr < 0.7 && warRand_(st) < 0.45) return 'retreat';
  if (!berserk && (me.cls === 'Caster' || me.cls === 'Assassin') && warRand_(st) < 0.2) return 'probe';
  return 'strike';
}

function warDoRound_(st, act, ev) {
  var b = st.battle, e = warFoe_(st, b.e), sv = st.sv;
  if (act.seal) { st.master.seals--; st.stats.seals++; ev.push({ k: 'seal', txt: '你舉起手背，令咒亮了起來。' }); }
  var A = { u: sv, act: act.s, seal: !!act.seal, side: 'me', knows: e.intel >= 2, home: b.ctx === 'defend', ambush: !!b.ambush && b.round === 1 };
  var Z = { u: e, act: b.intent, seal: false, side: 'foe', knows: st.exposed, home: false };
  var r = warExchange_(st, A, Z, ev);
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
    if (next) { ev.push({ k: 'final', txt: '寺院的石階上，又一位從者走了上來：' + warFoeLabel_(next) + '。' }); warStartBattle_(st, next, 'final', ev); return; }
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
    warApply_(st, L, d);
    ev.push({ k: 'clash', txt: '兩道寶具正面相撞。' + warWho_(st, W) + '的「' + W.u.npName + '」壓過了' + warWho_(st, L) + '的「' + L.u.npName + '」，' + warWho_(st, L) + warHurtWord_(L.u) + '。', num: '−' + d });
    if (L.side === 'me') warMasterHit_(st, WAR_.NP_MASTER_HIT, ev);
    return { ended: '' };
  }
  var order = [A, Z].sort(function (x, y) {
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
  var shield = Y.seal && Y.act === 'probe' ? 0 : 1;
  var home = Y.home ? (Y.u.cls === 'Caster' ? WAR_CLASS_MOD_.casterHome : WAR_.HOME) : 1;
  if (X.act === 'np') {
    X.u.cd = WAR_.NP_COOLDOWN;
    var nd = Math.round(warNpDmg_(X, Y) * guard * shield * home);
    warApply_(st, Y, nd);
    ev.push({ k: 'np', side: X.side, txt: warWho_(st, X) + '解放寶具「' + X.u.npName + '」。' + (Y.act === 'probe' ? warWho_(st, Y) + '早有防備，避開了大半，仍然' : warWho_(st, Y)) + warHurtWord_(Y.u) + '。', num: '−' + nd });
    if (Y.side === 'me' && Y.act !== 'probe') warMasterHit_(st, WAR_.NP_MASTER_HIT, ev);
    return;
  }
  var hitP = warHitChance_(X.u, Y.u);
  var hit = X.seal || X.ambush || warRand_(st) < hitP;
  var probe = X.act === 'probe';
  if (!hit) { ev.push({ k: 'miss', side: X.side, txt: warWho_(st, X) + (probe ? '出手試探，' : '搶攻，') + '被' + warWho_(st, Y) + '架開了。' }); return; }
  var d = warNormalDmg_(st, X, Y) * (probe ? WAR_.PROBE : 1) * (X.seal ? 1.5 : 1) * (X.ambush ? WAR_CLASS_MOD_.assassinAmbush : 1) * guard * shield * home;
  d = Math.max(shield ? WAR_.DMG_MIN : 0, Math.round(d));
  warApply_(st, Y, d);
  ev.push({ k: 'hit', side: X.side, txt: warWho_(st, X) + (probe ? '出手試探，擦中了' : '一記正面強攻，打中了') + warWho_(st, Y) + '，對方' + warHurtWord_(Y.u) + '。', num: '−' + d });
  if (Y.side === 'me' && X.u.cls === 'Assassin') warMasterHit_(st, WAR_.ASSASSIN_MASTER_HIT, ev);
}

function warApply_(st, Y, d) {
  var u = Y.u, before = u.hp;
  u.hp = Math.max(0, u.hp - d);
  if (u.hp <= 0 && u.cls === 'Lancer' && !u.saved && before > u.mhp * 0.2) { u.saved = true; u.hp = 1; }
  if (u.hp <= 0 && Y.side !== 'me') u.alive = false;
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
    win.power++;
    win.mhp = Math.round(win.mhp * (1 + WAR_.POWER_HP));
    warHeal_(win, WAR_.POWER_HEAL);
    ev.push({ k: 'news', txt: '昨夜' + a.loc + '一帶有兩位從者交手，' + warFoeLabel_(dead) + '消失了。打贏的' + warFoeLabel_(win) + '變得更難對付。' });
  } else {
    ev.push({ k: 'news', txt: '昨夜' + a.loc + '一帶有兩位從者交手，' + warFoeLabel_(a) + '與' + warFoeLabel_(b) + '都掛了彩，各自退去。' });
  }
}

// ── 算式 ──────────────────────────────────────────────
function warHitChance_(x, y) { return warClamp_(WAR_.HIT_BASE + (x.spd - y.spd) * WAR_.HIT_PER_SPD, WAR_.HIT_MIN, WAR_.HIT_MAX); }
function warMult_(X) {
  return (X.knows ? WAR_.WEAK : 1) * (1 + WAR_.POWER_DMG * (X.u.power || 0)) * (X.u.cls === 'Berserker' ? WAR_CLASS_MOD_.berserkDmg : 1);
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
  return warClamp_(WAR_.RETREAT_BASE + (u.spd - o.spd) * WAR_.RETREAT_PER_SPD + (u.cls === 'Rider' ? WAR_CLASS_MOD_.riderRetreat : 0), WAR_.RETREAT_MIN, WAR_.RETREAT_MAX);
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
function warOver_(st, win, cause, ev) {
  st.phase = 'over'; st.battle = null;
  st.result = { win: win, cause: cause, day: Math.min(st.day, WAR_.NIGHTS) };
  var T = { win: '最後一位敵方從者消失了。聖杯，就在你的眼前。', servant: st.sv.name + '倒下了。你的聖杯戰爭到此為止。', master: '你倒下了。失去御主的從者，也隨之消散。', timeout: '最後一夜過去，聖杯落到了別人手裡。' };
  ev.push({ k: 'over', txt: T[cause] || '' });
}

// ── 對外：畫面看得到的樣子（藏起玩家還不知道的事）──
function warView_(st) {
  var sv = st.sv, b = st.battle;
  var foes = warArrived_(st).concat(st.enemies.filter(function (e) { return !e.alive && e.intel >= 1; }));
  var view = {
    phase: st.phase, day: Math.min(st.day, WAR_.NIGHTS), nights: WAR_.NIGHTS, nightsLeft: Math.max(0, WAR_.NIGHTS - st.day + 1),
    master: { name: st.master.name, hp: st.master.hp, mhp: st.master.mhp, seals: st.master.seals },
    sv: { cls: sv.cls, name: sv.name, npName: sv.npName, hp: sv.hp, mhp: sv.mhp, cd: sv.cd, trait: warClass_(sv.cls).trait, exposed: st.exposed },
    foes: foes.map(function (e) {
      return { id: e.id, label: warFoeLabel_(e).replace(/[「」]/g, ''), intel: e.intel, alive: e.alive, hp: e.intel >= 1 && e.alive ? warHpWord_(e) : '', loc: e.intel >= 1 ? e.loc : '' };
    }).filter(function (f) { return f.intel >= 1; }),
    unknown: warArrived_(st).filter(function (e) { return e.intel === 0; }).length,
    alive: warAliveCount_(st),
    battle: null, buttons: warButtons_(st), result: st.result
  };
  if (b) {
    var e = warFoe_(st, b.e);
    view.battle = { round: b.round, rounds: WAR_.ROUNDS, foe: warFoeLabel_(e).replace(/[「」]/g, ''), foeHp: Math.round(e.hp / e.mhp * 100), foeWord: warHpWord_(e), tele: b.tele, ctx: b.ctx };
  }
  return view;
}
