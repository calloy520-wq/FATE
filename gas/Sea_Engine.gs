// 航海引擎：純規則。所有數字（價格、帳本、船況）都在這裡算，AI 只看結果說話。
// 狀態 st 是一份 JSON，整份存進試算表一格（Sea_Router.gs）。

// ── 基礎 ──────────────────────────────────────────────
function seaRand_(st) {
  var t = (st.rs = (st.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function seaHash_(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; }
function seaClamp_(v, a, b) { return Math.max(a, Math.min(b, v)); }

// 第幾天 → 「1560年3月8日」
function seaDate_(day) {
  var d = new Date(Date.UTC(SEA_START_.year, SEA_START_.month - 1, SEA_START_.day) + day * 86400000);
  return d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日';
}

function seaGood_(name) {
  var n = toTaiwanTrad_(String(name || '')).trim();   // 簡體寫法的港名、貨名也認得
  if (SEA_GOODS_[n]) return n;
  if (SEA_GOOD_ALIAS_[n]) return SEA_GOOD_ALIAS_[n];
  return Object.keys(SEA_GOODS_).filter(function (g) { return n.indexOf(g) >= 0; })[0] || '';
}
function seaPort_(name) {
  var n = toTaiwanTrad_(String(name || '')).trim();   // 簡體寫法的港名、貨名也認得
  if (SEA_PORTS_[n]) return n;
  if (SEA_PORT_ALIAS_[n]) return SEA_PORT_ALIAS_[n];
  return Object.keys(SEA_PORTS_).filter(function (p) { return n.indexOf(p) >= 0; })[0] || '';
}
function seaShipType_(name) {
  var n = toTaiwanTrad_(String(name || '')).trim();   // 簡體寫法的港名、貨名也認得
  return SEA_SHIPS_[n] ? n : (Object.keys(SEA_SHIPS_).filter(function (t) { return n.indexOf(t) >= 0 || t.indexOf(n) >= 0 && n.length >= 2; })[0] || '');
}

// ── 開局 ──────────────────────────────────────────────
function seaNewGame_(name, seed) {
  var st = { v: 1, name: String(name || '船長'), day: 0, port: SEA_START_.port, gold: SEA_START_.gold,
    cargo: [], ledger: [], notes: [], recent: [], market: {}, visited: [SEA_START_.port], rs: (seed || Date.now()) | 0, seq: 0 };
  st.ship = seaMakeShip_(SEA_START_.ship, SEA_START_.shipName, 0, SEA_START_.port, SEA_SHIPS_[SEA_START_.ship].price);
  st.ship.crew = SEA_START_.crew;
  st.supply = SEA_START_.supply * SEA_START_.crew;   // 糧水以「人天」計：一名船員吃一天＝1
  return st;
}
function seaMakeShip_(type, name, day, port, price) {
  var T = SEA_SHIPS_[type];
  return { type: type, name: name, hull: T.hull, hullMax: T.hull, cap: T.cap, crew: T.crewMin, crewMax: T.crewMax, crewMin: T.crewMin,
    speed: T.speed, guns: T.guns, bought: { day: day, port: port, price: price }, log: [] };
}

// ── 行情 ──────────────────────────────────────────────
// 被買賣推動的行情（mod）隨日子回復；讀之前先把這港的 mod 推進到今天。
function seaMarket_(st, port) {
  var m = st.market[port] || (st.market[port] = { day: st.day, mod: {} });
  var el = st.day - m.day;
  if (el > 0) {
    var k = Math.pow(1 - SEA_RULE_.RECOVER, el);
    Object.keys(m.mod).forEach(function (g) { m.mod[g] = Math.round(m.mod[g] * k * 1000) / 1000; if (Math.abs(m.mod[g]) < 0.005) delete m.mod[g]; });
    m.day = st.day;
  }
  return m;
}
function seaWave_(port, good, day) { return Math.sin((day / 30 + (seaHash_(port + good) % 1000) / 1000) * 2 * Math.PI) * SEA_RULE_.WAVE; }
// 買價（兩／箱）：extra＝這筆交易本身推動的行情（取中點，大量進貨會越買越貴）
function seaPrice_(st, port, good, extra) {
  var m = seaMarket_(st, port), mul = (SEA_PORTS_[port].mul || {})[good] || 1;
  var mod = seaClamp_((m.mod[good] || 0) + (extra || 0), -SEA_RULE_.IMPACT_CAP, SEA_RULE_.IMPACT_CAP);
  return Math.max(1, Math.round(SEA_GOODS_[good].base * mul * (1 + seaWave_(port, good, st.day)) * (1 + mod)));
}
function seaSellPrice_(st, port, good, extra) { return Math.max(1, Math.round(seaPrice_(st, port, good, extra) * SEA_RULE_.SELL_SPREAD)); }
function seaPush_(st, port, good, delta) {
  var m = seaMarket_(st, port);
  m.mod[good] = seaClamp_((m.mod[good] || 0) + delta, -SEA_RULE_.IMPACT_CAP, SEA_RULE_.IMPACT_CAP);
}

// ── 貨艙與帳本 ────────────────────────────────────────
function seaLoad_(st) { return st.cargo.reduce(function (s, l) { return s + l.qty; }, 0); }
function seaHave_(st, good) { return st.cargo.filter(function (l) { return l.good === good; }).reduce(function (s, l) { return s + l.qty; }, 0); }
function seaLedger_(st, e) {
  e.d = st.day; e.port = e.port || st.port || '海上';
  st.ledger.push(e);
  if (st.ledger.length > SEA_RULE_.LEDGER_KEEP) st.ledger.splice(0, st.ledger.length - SEA_RULE_.LEDGER_KEEP);
}
function seaSupplyDays_(st) { return st.ship.crew ? Math.floor(st.supply / st.ship.crew) : 0; }
function seaShipValue_(st) { return Math.round(st.ship.bought.price * SEA_RULE_.TRADE_IN * st.ship.hull / st.ship.hullMax); }
function seaAssets_(st) { return st.gold + st.cargo.reduce(function (s, l) { return s + l.qty * l.cost; }, 0) + seaShipValue_(st); }

// ── 動作 ──────────────────────────────────────────────
// 每個動作回 { ok, txt }：txt 是給畫面與 AI 的事實句，數字都在裡面。
var SEA_ACTS_ = {
  buy: function (st, a) {
    if (!st.port) return { ok: false, txt: '在海上，沒有地方買貨。' };
    var g = seaGood_(a.good); if (!g) return { ok: false, txt: '這裡沒有「' + (a.good || '') + '」這種貨。' };
    var room = st.ship.cap - seaLoad_(st);
    if (room <= 0) return { ok: false, txt: '貨艙已經滿了（' + seaLoad_(st) + '／' + st.ship.cap + ' 箱）。' };
    var p0 = seaPrice_(st, st.port, g, 0);
    var want = a.qty === 'max' || !a.qty && !a.budget ? room : a.budget ? Math.floor(a.budget / p0) : parseInt(a.qty, 10) || 0;
    var q = Math.min(want, room);
    // 錢夠買幾箱：大量進貨會把價格推高，從 q 往下找到付得起的量
    while (q > 0 && seaPrice_(st, st.port, g, q * SEA_RULE_.IMPACT / 2) * q > st.gold) q--;
    if (q <= 0) return { ok: false, txt: st.port + '的' + g + '一箱 ' + p0 + ' 兩，現銀 ' + st.gold + ' 兩，買不起。' };
    var unit = seaPrice_(st, st.port, g, q * SEA_RULE_.IMPACT / 2), total = unit * q;
    st.gold -= total; seaPush_(st, st.port, g, q * SEA_RULE_.IMPACT);
    st.cargo.push({ good: g, qty: q, cost: unit, port: st.port, d: st.day });
    seaLedger_(st, { act: '買', good: g, qty: q, unit: unit, total: total });
    var cut = q < want ? '（想買 ' + want + ' 箱，' + (q === room ? '貨艙只放得下' : '錢只夠') + ' ' + q + ' 箱）' : '';
    var push = unit !== p0 ? '牌價一箱 ' + p0 + ' 兩，一口氣進 ' + q + ' 箱把價格推高，' : '';
    return { ok: true, txt: '在' + st.port + '買進' + g + ' ' + q + ' 箱，' + push + (push ? '平均' : '') + '一箱 ' + unit + ' 兩，共 ' + total + ' 兩' + cut + '。剩現銀 ' + st.gold + ' 兩，貨艙 ' + seaLoad_(st) + '／' + st.ship.cap + ' 箱。' };
  },
  sell: function (st, a) {
    if (!st.port) return { ok: false, txt: '在海上，沒有地方賣貨。' };
    var g = seaGood_(a.good); if (!g) return { ok: false, txt: '貨艙裡沒有「' + (a.good || '') + '」。' };
    var have = seaHave_(st, g); if (!have) return { ok: false, txt: '貨艙裡沒有' + g + '。' };
    var q = a.qty === 'all' || !a.qty ? have : Math.min(have, parseInt(a.qty, 10) || 0);
    if (q <= 0) return { ok: false, txt: '要賣幾箱' + g + '？' };
    var s0 = seaSellPrice_(st, st.port, g, 0), unit = seaSellPrice_(st, st.port, g, -q * SEA_RULE_.IMPACT / 2), total = unit * q;
    // 先進先出：從最早那批扣，算出這批貨的成本
    var left = q, cost = 0;
    st.cargo.forEach(function (l) { if (l.good !== g || !left) return; var t = Math.min(l.qty, left); cost += t * l.cost; l.qty -= t; left -= t; });
    st.cargo = st.cargo.filter(function (l) { return l.qty > 0; });
    st.gold += total; seaPush_(st, st.port, g, -q * SEA_RULE_.IMPACT);
    var pl = total - cost;
    seaLedger_(st, { act: '賣', good: g, qty: q, unit: unit, total: total, cost: cost });
    var push = unit !== s0 ? '牌價一箱 ' + s0 + ' 兩，一次賣 ' + q + ' 箱壓低了價格，平均' : '';
    return { ok: true, txt: '在' + st.port + '賣出' + g + ' ' + q + ' 箱，' + push + '一箱 ' + unit + ' 兩，共 ' + total + ' 兩；這批的成本 ' + cost + ' 兩，' + (pl >= 0 ? '賺 ' + pl : '賠 ' + (-pl)) + ' 兩。現銀 ' + st.gold + ' 兩。' };
  },
  sail: function (st, a) {
    var to = seaPort_(a.to);
    if (!to) return { ok: false, txt: '海圖上找不到「' + (a.to || '') + '」。能去的港口：' + Object.keys(SEA_PORTS_).join('、') + '。' };
    if (!st.port) return { ok: false, txt: '已經在海上了。' };
    if (to === st.port) return { ok: false, txt: '船已經停在' + to + '。' };
    var base = seaRoute_(st.port, to); if (!base) return { ok: false, txt: st.port + '到' + to + '沒有熟悉的航線。' };
    var s = st.ship;
    if (s.crew < s.crewMin) return { ok: false, txt: s.name + '至少要 ' + s.crewMin + ' 名船員才開得動，現在只有 ' + s.crew + ' 名。' };
    var days = Math.max(1, Math.ceil(base * 5 / s.speed)), need = days * s.crew;
    if (st.supply < need) return { ok: false, txt: '到' + to + '要 ' + days + ' 天，' + s.crew + ' 名船員要 ' + days + ' 天份的糧水，船上只剩 ' + seaSupplyDays_(st) + ' 天份。' };
    var from = st.port, lines = [], dmg = 0;
    st.port = null;
    for (var i = 1; i <= days; i++) {
      st.day++; st.supply -= s.crew;
      if (seaRand_(st) < SEA_RULE_.STORM_CHANCE) {
        var d = SEA_RULE_.STORM_DMG[0] + Math.floor(seaRand_(st) * (SEA_RULE_.STORM_DMG[1] - SEA_RULE_.STORM_DMG[0] + 1));
        d = Math.min(d, s.hull - 1); s.hull -= d; dmg += d;
        lines.push('第 ' + i + ' 天遇上暴風，船身受損 ' + d + ' 點');
        if (s.hull <= 1) {   // 差點沉：貨拋掉三成保船
          var lost = 0;
          st.cargo.forEach(function (l) { var t = Math.ceil(l.qty * 0.3); l.qty -= t; lost += t; });
          st.cargo = st.cargo.filter(function (l) { return l.qty > 0; });
          if (lost) { lines.push('船快撐不住，拋掉 ' + lost + ' 箱貨保船'); seaLedger_(st, { act: '拋貨', qty: lost, port: '海上' }); }
        }
      }
    }
    st.port = to;
    if (st.visited.indexOf(to) < 0) st.visited.push(to);
    if (dmg) s.log.push({ d: st.day, txt: from + '→' + to + ' 途中暴風受損 ' + dmg });
    return { ok: true, txt: '從' + from + '出航，航行 ' + days + ' 天，' + seaDate_(st.day) + '抵達' + to + '。' + (lines.length ? lines.join('；') + '。' : '一路順風。')
      + '船身耐久 ' + s.hull + '／' + s.hullMax + '，糧水剩 ' + seaSupplyDays_(st) + ' 天份。' };
  },
  repair: function (st) {
    if (!st.port) return { ok: false, txt: '在海上沒辦法大修。' };
    var s = st.ship, miss = s.hullMax - s.hull;
    if (!miss) return { ok: false, txt: s.name + '沒有損傷（耐久 ' + s.hull + '／' + s.hullMax + '）。' };
    var pts = Math.min(miss, Math.floor(st.gold / SEA_RULE_.REPAIR_PER_HULL));
    if (!pts) return { ok: false, txt: '修一點要 ' + SEA_RULE_.REPAIR_PER_HULL + ' 兩，現銀不夠。' };
    var cost = pts * SEA_RULE_.REPAIR_PER_HULL;
    st.gold -= cost; s.hull += pts;
    s.log.push({ d: st.day, txt: '在' + st.port + '修理 ' + pts + ' 點，花 ' + cost + ' 兩' });
    seaLedger_(st, { act: '修船', qty: pts, total: cost });
    return { ok: true, txt: '在' + st.port + '修船 ' + pts + ' 點，花 ' + cost + ' 兩，耐久 ' + s.hull + '／' + s.hullMax + '。剩現銀 ' + st.gold + ' 兩。' };
  },
  supply: function (st, a) {
    if (!st.port) return { ok: false, txt: '在海上沒地方補給。' };
    var s = st.ship, days = a.days === 'full' || !a.days ? Math.max(0, 30 - seaSupplyDays_(st)) : parseInt(a.days, 10) || 0;
    days = Math.min(days, 60 - seaSupplyDays_(st));
    if (days <= 0) return { ok: false, txt: '糧水已經有 ' + seaSupplyDays_(st) + ' 天份，不用再補。' };
    var cost = days * s.crew * SEA_RULE_.SUPPLY_PER_CREW;
    if (cost > st.gold) { days = Math.floor(st.gold / (s.crew * SEA_RULE_.SUPPLY_PER_CREW)); cost = days * s.crew * SEA_RULE_.SUPPLY_PER_CREW; }
    if (days <= 0) return { ok: false, txt: '現銀不夠買糧水。' };
    st.gold -= cost; st.supply += days * s.crew;
    seaLedger_(st, { act: '補給', qty: days, total: cost });
    return { ok: true, txt: '補了 ' + days + ' 天份的糧水（' + s.crew + ' 名船員），花 ' + cost + ' 兩，現在有 ' + seaSupplyDays_(st) + ' 天份。剩現銀 ' + st.gold + ' 兩。' };
  },
  hire: function (st, a) {
    if (!st.port) return { ok: false, txt: '在海上雇不到人。' };
    var s = st.ship, n = Math.min(parseInt(a.n, 10) || (s.crewMax - s.crew), s.crewMax - s.crew);
    if (n <= 0) return { ok: false, txt: s.name + '的船員已經滿了（' + s.crew + '／' + s.crewMax + ' 名）。' };
    n = Math.min(n, Math.floor(st.gold / SEA_RULE_.HIRE_COST));
    if (n <= 0) return { ok: false, txt: '雇一名船員要 ' + SEA_RULE_.HIRE_COST + ' 兩，現銀不夠。' };
    var cost = n * SEA_RULE_.HIRE_COST;
    st.gold -= cost; s.crew += n;
    seaLedger_(st, { act: '雇船員', qty: n, total: cost });
    return { ok: true, txt: '在' + st.port + '雇了 ' + n + ' 名船員，花 ' + cost + ' 兩，船員 ' + s.crew + '／' + s.crewMax + ' 名；糧水變成 ' + seaSupplyDays_(st) + ' 天份。剩現銀 ' + st.gold + ' 兩。' };
  },
  fire: function (st, a) {
    var s = st.ship, n = Math.min(parseInt(a.n, 10) || 0, s.crew);
    if (n <= 0) return { ok: false, txt: '要讓幾名船員下船？' };
    s.crew -= n;
    return { ok: true, txt: n + ' 名船員下船，剩 ' + s.crew + ' 名' + (s.crew < s.crewMin ? '（少於 ' + s.crewMin + ' 名，開不動）' : '') + '；糧水變成 ' + seaSupplyDays_(st) + ' 天份。' };
  },
  buy_ship: function (st, a) {
    if (!st.port) return { ok: false, txt: '在海上買不到船。' };
    var t = seaShipType_(a.ship), yard = SEA_PORTS_[st.port].ships || [];
    if (!t || yard.indexOf(t) < 0) return { ok: false, txt: st.port + '的船廠有：' + yard.map(function (x) { return x + '（' + SEA_SHIPS_[x].price + ' 兩）'; }).join('、') + '。' };
    var T = SEA_SHIPS_[t], old = st.ship, tradeIn = seaShipValue_(st), cost = T.price - tradeIn;
    if (cost > st.gold) return { ok: false, txt: t + '一艘 ' + T.price + ' 兩，舊船' + old.name + '折價 ' + tradeIn + ' 兩，還差 ' + (cost - st.gold) + ' 兩。' };
    if (seaLoad_(st) > T.cap) return { ok: false, txt: t + '的貨艙只有 ' + T.cap + ' 箱，現在的貨 ' + seaLoad_(st) + ' 箱放不下。' };
    st.gold -= cost;
    var s = seaMakeShip_(t, String(a.name || old.name).slice(0, 12), st.day, st.port, T.price);
    s.crew = Math.min(old.crew, T.crewMax);
    s.log.push({ d: st.day, txt: '在' + st.port + '以 ' + T.price + ' 兩買下（舊船' + old.type + '「' + old.name + '」折價 ' + tradeIn + ' 兩）' });
    st.ship = s;
    seaLedger_(st, { act: '換船', good: t, total: cost, note: '新船 ' + T.price + '，舊船折價 ' + tradeIn });
    return { ok: true, txt: '在' + st.port + '買下' + t + '「' + s.name + '」，新船 ' + T.price + ' 兩，舊船' + old.type + '「' + old.name + '」折價 ' + tradeIn + ' 兩，實付 ' + cost + ' 兩。貨艙 ' + T.cap + ' 箱、耐久 ' + T.hull + '、船速 ' + T.speed + '、砲門 ' + T.guns + '、船員 ' + s.crew + '／' + T.crewMax + ' 名。剩現銀 ' + st.gold + ' 兩。' };
  },
  rename: function (st, a) {
    var n = String(a.name || '').replace(/[「」『』"<>]/g, '').trim().slice(0, 12);
    if (!n) return { ok: false, txt: '新船名是什麼？' };
    var old = st.ship.name; st.ship.name = n; st.ship.log.push({ d: st.day, txt: '由「' + old + '」改名' });
    return { ok: true, txt: '船從「' + old + '」改名為「' + n + '」。' };
  },
  wait: function (st, a) {
    if (!st.port) return { ok: false, txt: '在海上沒辦法停下來等。' };
    var n = seaClamp_(parseInt(a.days, 10) || 1, 1, 30), s = st.ship;
    var eat = Math.min(st.supply, n * s.crew); st.supply -= eat; st.day += n;
    return { ok: true, txt: '在' + st.port + '停留 ' + n + ' 天，到了' + seaDate_(st.day) + '；糧水剩 ' + seaSupplyDays_(st) + ' 天份。' };
  }
};
function seaRoute_(a, b) { var r = SEA_ROUTES_.filter(function (x) { return (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a); })[0]; return r ? r[2] : 0; }

// 一回合的動作（最多 6 個）依序執行；出航之後的動作在新港口做。
function seaApply_(st, acts) {
  var out = [], list = (acts || []).slice(0, 6);
  for (var i = 0; i < list.length; i++) {
    var a = list[i], f = a && SEA_ACTS_[a.type];
    if (!f) continue;
    var r = f(st, a); r.type = a.type; out.push(r);
    if (a.type === 'sail' && !r.ok) break;   // 沒出航成功：後面那些原本要在目的地做的事都不做
  }
  return out;
}

// 畫面要的東西：全部是程式的數字，AI 說錯也看得到真相。
function seaView_(st) {
  var s = st.ship;
  return {
    name: st.name, date: seaDate_(st.day), port: st.port, gold: st.gold, assets: seaAssets_(st), goal: SEA_GOAL_,
    supplyDays: seaSupplyDays_(st), load: seaLoad_(st),
    ship: { type: s.type, name: s.name, hull: s.hull, hullMax: s.hullMax, cap: s.cap, crew: s.crew, crewMax: s.crewMax, crewMin: s.crewMin, speed: s.speed, guns: s.guns,
      bought: seaDate_(s.bought.day) + '在' + s.bought.port + '，' + s.bought.price + ' 兩', value: seaShipValue_(st), log: s.log.slice(-6).map(function (x) { return seaDate_(x.d) + '：' + x.txt; }) },
    cargo: st.cargo.map(function (l) { return { good: l.good, qty: l.qty, cost: l.cost, where: l.port + '・' + seaDate_(l.d) }; }),
    market: st.port ? Object.keys(SEA_GOODS_).map(function (g) { return { good: g, buy: seaPrice_(st, st.port, g, 0), sell: seaSellPrice_(st, st.port, g, 0), have: seaHave_(st, g) }; }) : [],
    yard: st.port ? (SEA_PORTS_[st.port].ships || []).map(function (t) { return { type: t, price: SEA_SHIPS_[t].price }; }) : [],
    routes: st.port ? Object.keys(SEA_PORTS_).filter(function (p) { return p !== st.port && seaRoute_(st.port, p); }).map(function (p) { return { port: p, days: Math.max(1, Math.ceil(seaRoute_(st.port, p) * 5 / s.speed)) }; }) : [],
    ledger: st.ledger.slice(-30).reverse().map(seaLedgerLine_),
    recent: st.recent.slice(-SEA_RULE_.RECENT_TURNS)
  };
}
function seaLedgerLine_(e) {
  var head = seaDate_(e.d) + ' ' + e.port + ' ' + e.act;
  if (e.act === '買' || e.act === '賣') return head + e.good + ' ' + e.qty + ' 箱 × ' + e.unit + ' 兩 ＝ ' + e.total + ' 兩' + (e.act === '賣' ? '（成本 ' + e.cost + '，' + (e.total - e.cost >= 0 ? '賺 ' : '賠 ') + Math.abs(e.total - e.cost) + '）' : '');
  if (e.act === '換船') return head + e.good + ' 實付 ' + e.total + ' 兩（' + e.note + '）';
  if (e.act === '拋貨') return head + ' ' + e.qty + ' 箱';
  return head + ' ' + e.qty + (e.act === '補給' ? ' 天份' : e.act === '修船' ? ' 點' : ' 名') + ' ' + e.total + ' 兩';
}
