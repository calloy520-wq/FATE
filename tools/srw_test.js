// 戰棋引擎測試：node tools/srw_test.js
const T = require('./srw');
let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log('❌', name); } }
function eq(a, b, name) { ok(a === b, name + '（得到 ' + JSON.stringify(a) + '，應為 ' + JSON.stringify(b) + '）'); }
// 開一關，清掉敵人，只留指定的單位方便測
function arena(stageIdx, opts) {
  const c = T.newCampaign(42); c.stage = stageIdx || 0; if (opts && opts.lv) Object.keys(c.heroes).forEach(k => c.heroes[k].lv = opts.lv);
  const b = T.startStage(c); return { c, b };
}
function only(b, keep) { b.units = b.units.filter(u => keep.indexOf(u) >= 0); }
const P = (b, id) => b.units.filter(u => u.id === id && u.side === 'p')[0];
const E = (b, id) => b.units.filter(u => u.id === id && u.side === 'e')[0];

// ── 資料完整 ──
T.STAGES.forEach(S => {
  const w = S.map[0].length;
  ok(S.map.every(r => r.length === w), S.id + ' 地圖每列一樣寬');
  ok(S.map.every(r => [...r].every(ch => T.TERRAIN[ch])), S.id + ' 地圖只用認得的地形');
  const xy = S.heroes.map(h => [h[0], h[1], h[2]]).concat(S.foes.map(f => [f[0], f[2], f[3]])).concat((S.add || []).reduce((a, g) => a.concat(g.foes.map(f => [f[0], f[2], f[3]])), []));
  xy.forEach(u => { const t = T.TERRAIN[S.map[u[2]] && S.map[u[2]][u[1]]]; ok(t && !t.wall, S.id + ' ' + u[0] + ' 站在走得到的格子上'); });
  ok(S.foes.every(f => T.FOES[f[0]]), S.id + ' 敵人都有戰棋數值');
  ok(!S.merit || !S.merit.reward || T.ITEMS[S.merit.reward], S.id + ' 功勳獎勵是法寶');
  const pos = S.heroes.map(h => h[1] + ',' + h[2]).concat(S.foes.map(f => f[2] + ',' + f[3])); ok(new Set(pos).size === pos.length, S.id + ' 開場沒有人疊在同一格');
});
T.ORDER.forEach(k => { const H = T.HEROES[k]; H.sp.forEach(p => ok(T.SPIRITS[p[0]], k + ' 心訣 ' + p[0] + ' 存在')); ok(H.sp.length === 6, k + ' 六個心訣'); ok(T.TRAITS[H.trait], k + ' 特性存在'); });
Object.keys(T.FOES).forEach(k => ok(T.FOES[k].w.length > 0, k + ' 至少一招'));

// ── 移動 ──
{
  const { c, b } = arena(1);   // 破廟：牆在 (2,4)(6,4)
  const s = P(b, 'shuang'), r = P(b, 'chilian');
  only(b, [s, r]);
  r.x = 3; r.y = 3; const R = T.moveRange(b, r, 1);
  ok(R['2,3'] != null && R['2,4'] == null, '走路的不能走進牆');
  s.x = 1; s.y = 4; const R2 = T.moveRange(b, s, 1);
  ok(R2['2,4'] != null, '飛行可以停在牆上');
  const f = T.TERRAIN.f; r.x = 4; r.y = 1; const R3 = T.moveRange(b, r, 2);
  ok(R3['2,2'] == null || f.cost >= 2, '林要花 2 步');
}
// ── 命中與回應 ──
{
  const { c, b } = arena(0);
  const s = P(b, 'shuang'), z = E(b, 'zhiren'); only(b, [s, z]);
  s.x = 4; s.y = 5; z.x = 4; z.y = 4;
  const w = T.W(z, 0), h = T.hitChance(b, z, w, s, ''), he = T.hitChance(b, z, w, s, 'evade');
  eq(he, Math.round(h / 2), '閃身＝命中率減半');
  const d = T.damage(b, z, w, s, '', false), dg = T.damage(b, z, w, s, 'guard', false);
  ok(Math.abs(dg - Math.round(d / 2)) <= 1, '招架＝傷害減半');
  ok(T.damage(b, z, w, s, '', true) > d, '爆擊傷害比較高');
  s.st.dongming = 1; eq(T.hitChance(b, s, T.W(s, 0), z, ''), 100, '洞明命中 100%'); s.st.dongming = 0;
  z.st.taying = 1; eq(T.hitChance(b, s, T.W(s, 0), z, ''), 0, '踏影閃過'); z.st.taying = 0;
  const base = T.hitChance(b, z, w, s, ''); s.hitN = 2; eq(T.hitChance(b, z, w, s, ''), Math.min(100, base + 10), '同一階段多被打兩次，命中 +10'); s.hitN = 0;
  const d0 = T.damage(b, s, T.W(s, 0), z, '', false); s.st.pofu = 1; ok(T.damage(b, s, T.W(s, 0), z, '', false) >= d0 * 1.9, '破釜傷害 ×2'); s.st.pofu = 0;
  z.st.jinshen = 1; ok(T.damage(b, s, T.W(s, 0), z, '', false) <= Math.ceil(d0 / 4) + 1, '金身傷害 ×¼'); z.st.jinshen = 0;
  eq(T.bestResp(b, s, 0, z), 'counter', '敵人打得到就還手');
  s.x = 4; s.y = 7; eq(T.bestResp(b, s, 1, z), 'guard', '敵人打不到就招架');
}
// ── 戰意 ──
{
  const { c, b } = arena(0);
  const s = P(b, 'shuang'), z = E(b, 'zhiren'); only(b, [s, z]);
  s.x = 4; s.y = 5; z.x = 4; z.y = 4; z.hp = 999999; z.hpMax = 999999; s.st.dongming = 1;
  const w0 = s.will; T.attack(c, s, 0, z, 'guard'); eq(s.will, w0 + 1, '打中戰意 +1');
  ok(T.whyNot(b, s, 3, false).indexOf('戰意') >= 0, '戰意不夠不能用大招');
  s.will = 130; s.en = 0; ok(T.whyNot(b, s, 3, false).indexOf('真元') >= 0, '真元不夠不能用');
}
// ── 擊破、掩護、助攻 ──
{
  const { c, b } = arena(4, { lv: 10 });   // 茶棚：五人
  const s = P(b, 'shuang'), x = P(b, 'xiaoman'), q = P(b, 'qingli'), z = E(b, 'mingquan'); only(b, [s, x, q, z]);
  s.x = 4; s.y = 5; x.x = 4; x.y = 6; q.x = 3; q.y = 5; z.x = 4; z.y = 4;
  s.hp = 50;   // 快倒：白辰（掩護 Lv2）會替她挨
  const f = T.forecast(b, z, 0, s);
  eq(f.guard, x.uid, '旁邊的白辰替快倒的凌霜掩護');
  T.attack(c, z, 0, s);
  ok(s.hp === 50, '掩護了，凌霜沒挨到');
  q.skills = { zhugong: 1 }; s.hp = s.hpMax; z.hp = 999999; z.hpMax = 999999;
  const f2 = T.forecast(b, s, 0, z); ok(f2.sup && f2.sup.uid === q.uid, '旁邊有助攻的青璃會補一招');
  const sc = T.attack(c, s, 0, z); ok(sc.steps.some(t => t.tag === 'support'), '交手裡有助攻');
  z.hp = 1; z.hpMax = 1; z.lives = 0; s.acted = 0; s.st.dongming = 1; const g0 = b.gold, will0 = q.will;
  T.attack(c, s, 0, z); ok(z.hp <= 0, '擊破'); ok(b.gold > g0, '擊破拿靈石'); ok(q.will >= will0 + 1, '隊友擊破，大家戰意 +1');
}
// ── 特性 ──
{
  const { c, b } = arena(4, { lv: 10 });
  const q = P(b, 'qingli'), z = E(b, 'mingquan'); only(b, [q, z]); q.x = 1; q.y = 8; z.x = 1; z.y = 7; z.hp = z.hpMax = 999999; q.st.dongming = 1;
  T.attack(c, q, 1, z, 'guard'); ok(z.stun === 1 && z.ding === 0, '定身符一次貼 2 層（特性 1＋招式 1）：雜兵直接定住');
}
{
  const { c, b } = arena(4, { lv: 10 });
  const q = P(b, 'qingli'), z = E(b, 'mingquan'); only(b, [q, z]); q.x = 1; q.y = 8; z.x = 1; z.y = 7; z.hp = z.hpMax = 999999; q.st.dongming = 1; z.ding = 0;
  T.attack(c, q, 0, z, 'guard'); eq(z.ding, 1, '桃木劍打中貼 1 層');
  q.acted = 0; T.attack(c, q, 0, z, 'guard'); ok(z.stun === 1 && z.ding === 0, '貼滿 2 層：定住、層數歸零');
  T.endPlayerPhase(c); const plan = T.enemyNext(c); ok(plan && plan.stun, '定住的敵人這個敵方階段不動');
}
{
  const { c, b } = arena(4, { lv: 10 });
  const r = P(b, 'chilian'), z = E(b, 'mingquan'); only(b, [r, z]);
  r.x = 1; r.y = 8; z.x = 1; z.y = 7; r.hp = 10; z.st.dongming = 1;
  T.attack(c, z, 0, r, 'guard'); ok(r.hp > 0 && r.revive === 0, '赤灼倒下站起來一次');
  const hp = r.hp; T.endPlayerPhase(c); let p; while ((p = T.enemyNext(c))) T.enemyMove(c, p); T.enemyDone(c);
  ok(r.hp < hp || r.hp === 1, '赤灼酒火焚身扣血');
}
{
  const { c, b } = arena(4, { lv: 10 });
  const a = P(b, 'aduo'), z = E(b, 'mingquan'); only(b, [a, z]); a.x = 1; a.y = 8; z.x = 1; z.y = 7; z.hp = z.hpMax = 999999; a.st.dongming = 1;
  const d1 = T.damage(b, a, T.W(a, 0), z, 'guard', false); a.ambush = 0; const d2 = T.damage(b, a, T.W(a, 0), z, 'guard', false);
  ok(d1 > d2 * 1.4, '阿朵第一次出手 ×1.5'); a.ambush = 1;
  T.attack(c, a, 1, z, 'guard'); eq(z.poison, 2, '毒蠱打中上 2 層毒'); eq(a.ambush, 0, '出手後隱蠱用掉');
  const hp = z.hp; T.endPlayerPhase(c); ok(z.hp < hp && z.poison === 1, '敵方階段開始扣毒、毒 −1');
}
{
  const { c, b } = arena(6, { lv: 12 });   // 不死牛魔
  const s = P(b, 'shuang'), n = E(b, 'niumo'); only(b, [s, n]); s.x = 4; s.y = 3; n.x = 4; n.y = 2; s.st.dongming = 1;
  n.hp = 1; T.attack(c, s, 0, n, 'guard'); ok(n.hp > 0 && n.lives === 1, '牛魔倒下站起來（還剩一次）');
}
{
  const { c, b } = arena(5, { lv: 10 });   // 魔教長老半血退走
  const s = P(b, 'shuang'), z = E(b, 'zhanglao'); only(b, [s, z]); s.x = 4; s.y = 2; z.x = 4; z.y = 1; s.st.dongming = 1;
  z.hp = Math.round(z.hpMax * 0.5) + 10; s.st.guzhu = 1; T.attack(c, s, 0, z, 'guard');
  ok(z.gone === 1, '長老半血退走'); eq(b.over, 'win', '魔王退走算勝利');
}
// ── 心訣 ──
{
  const { c, b } = arena(4, { lv: 25 });
  const x = P(b, 'xiaoman'), q = P(b, 'qingli'); q.hp = 100;
  ok(T.useSpirit(c, q, 'huichun', q.uid), '回春能用'); ok(q.hp > 100, '回春回血');
  const sp = x.sp; ok(T.useSpirit(c, x, 'zhenfen'), '振奮能用'); eq(x.will, 110, '振奮戰意 +10'); eq(x.sp, sp - T.spCost(x, 'zhenfen'), '扣心力');
  const s = P(b, 'shuang'); s.acted = 1; s.moved = 1; s.sp = 999; ok(T.useSpirit(c, s, 'chengshi'), '乘勢能用'); ok(!s.acted && !s.moved, '乘勢再行動');
  const a = P(b, 'aduo'); a.sp = 0; ok(!T.useSpirit(c, a, 'taying'), '心力不夠不能用');
}
// ── 陣法、合擊 ──
{
  const { c, b } = arena(4, { lv: 25 });
  const q = P(b, 'qingli'), a = P(b, 'aduo'), dogs = b.units.filter(u => u.side === 'e').slice(0, 3);
  only(b, [q, a].concat(dogs)); q.x = 4; q.y = 6; a.x = 4; a.y = 7; dogs[0].x = 4; dogs[0].y = 3; dogs[1].x = 3; dogs[1].y = 3; dogs[2].x = 8; dogs[2].y = 0;
  q.will = 130; q.en = 200;
  ok(T.mapCenterOk(b, q, 3, 4, 3), '天羅地網中心在射程內');
  const ts = T.mapTargets(b, q, 3, 4, 3); eq(ts.length, 2, '天羅地網打到範圍內的兩隻');
  const sc = T.mapAttack(c, q, 3, 4, 3); ok(sc.steps.every(t => t.tag === 'map'), '陣法沒有還手'); eq(q.en, 200 - 60, '陣法只扣一次真元');
  const fi = T.HEROES.qingli.w.findIndex(w => w.combo);
  q.acted = 0; q.will = 130; a.will = 130; a.x = 7; a.y = 7; ok(T.whyNot(b, q, fi, false).indexOf('站在一起') >= 0, '合擊要夥伴在旁邊');
  a.x = 4; a.y = 7; ok(T.usable(b, q, fi, false), '夥伴在旁邊就能合擊');
}
// ── 回合、增援、屋舍 ──
{
  const { c, b } = arena(1);   // 破廟第 2 回合增援邪修
  T.autoPhase(c); T.endPlayerPhase(c); let p; while ((p = T.enemyNext(c))) { T.enemyMove(c, p); if (p.target || p.map) T.enemyAct(c, p); } if (!b.over) T.enemyDone(c);
  T.endPlayerPhase(c); ok(b.units.some(u => u.id === 'xiexiu'), '第二回合的敵方階段增援');
  const { c: c2, b: b2 } = arena(1); const s = P(b2, 'chilian'); s.x = 4; s.y = 4; s.hp = 100; T.endPlayerPhase(c2); while ((p = T.enemyNext(c2))) T.enemyMove(c2, p); T.enemyDone(c2);
  ok(s.hp > 100 || s.hp <= 0, '站在屋舍上回氣血');
}
// ── 升級、結算、整備 ──
{
  const { c, b } = arena(0);
  const s = P(b, 'shuang'), lv = c.heroes.shuang.lv, hit = s.hit;
  only(b, [s]); b.gain.shuang = b.gain.shuang || { exp: 0, pp: 0, kills: 0, lvUp: 0 };
  // 直接塞經驗
  const z = b.units.length; ok(z === 1, '只剩凌霜');
  c.heroes.shuang.exp = T.EXP_LV - 1;
  const dummy = { side: 'e', rank: 'z', lv: 99 }; // 不用；直接打一隻
  b.over = 'win'; const r = T.finishStage(c); ok(r.win && c.stage === 1, '贏了往下一關'); ok(c.gold > 10000, '結算拿靈石'); ok(r.clearGold > 0, '過關獎勵');
  eq(c.screen, 'result', '結算畫面');
  T.toPrep(c); eq(c.screen, 'prep', '回整備');
  const g = c.gold, cost = T.upCost('hp', 0); eq(T.upgrade(c, 'shuang', 'hp'), '', '淬鍊氣血'); eq(c.gold, g - cost, '扣靈石'); eq(T.heroStats(c, 'shuang').hpMax, T.HEROES.shuang.body.hp + T.UP_STEP.hp, '氣血加上去');
  c.heroes.shuang.pp = 100; eq(T.learn(c, 'shuang', 'zhugong'), '', '學助攻'); ok(T.heroStats(c, 'shuang').skills.zhugong === 1, '助攻 Lv1');
  eq(T.train(c, 'shuang', 'hit'), '', '加命中'); eq(T.heroStats(c, 'shuang').hit, Math.round(T.HEROES.shuang.st.hit + T.HEROES.shuang.g.hit * (c.heroes.shuang.lv - 1)) + T.TRAIN_STEP, '命中 +2');
  c.inv.qingshen = 1; eq(T.equip(c, 'shuang', 'qingshen'), '', '裝法寶'); eq(T.heroStats(c, 'shuang').mob, T.HEROES.shuang.body.mob + 15, '輕身符 +15');
  eq(T.unequip(c, 'shuang', 0), '', '卸下'); eq(c.inv.qingshen, 1, '卸下回到背包');
  ['hp', 'en', 'arm', 'mob', 'aim'].forEach(k => c.heroes.chilian.up[k] = 5); ok(T.fullDone(c.heroes.chilian) && T.heroStats(c, 'chilian').willMax === 170, '赤灼淬鍊圓滿：戰意上限 +20');
}
{
  // 功勳：3 回合內打完第一關
  const { c, b } = arena(0); b.turn = 2; b.units.filter(u => u.side === 'e').forEach(u => u.hp = 0); T.checkOver(c); eq(b.over, 'win', '敵人全滅＝勝利');
  const r = T.finishStage(c); ok(r.merit && c.inv.huichunD >= 2, '功勳拿到回春丹');
}
{
  // 輸了：經驗與靈石留著，不往下一關
  const { c, b } = arena(0); const g = c.gold; b.units.filter(u => u.side === 'p').forEach(u => u.hp = 0); T.checkOver(c); eq(b.over, 'lose', '全倒＝敗北');
  b.gold = 500; const r = T.finishStage(c); ok(!r.win && c.stage === 0 && c.gold === g + 500, '輸了留著靈石、不往下一關');
}
{
  // 存檔來回
  const { c } = arena(3); const s = JSON.stringify(c); const c2 = T.migrate(JSON.parse(s)); ok(c2 && c2.battle && c2.battle.units.length === c.battle.units.length, '存檔讀得回來');
  ok(T.migrate({ v: 4, who: 'shuang' }) === null, '舊的卡牌存檔不接');
}
{
  // 自動玩家打得完第一關
  const c = T.newCampaign(7); const b = T.startStage(c); let n = 0;
  while (!b.over && n++ < 30) { T.autoPhase(c); if (b.over) break; T.endPlayerPhase(c); let p; while ((p = T.enemyNext(c))) { T.enemyMove(c, p); if (p.target || p.map) T.enemyAct(c, p); if (b.over) break; } if (!b.over) T.enemyDone(c); }
  eq(b.over, 'win', '自動玩家打贏第一關');
}
{
  // 成名：擊破夠多，專屬加成
  const c = T.newCampaign(3); c.heroes.chilian.kills = T.ACE_KILLS; c.heroes.qingli.kills = T.ACE_KILLS; c.stage = 4; const b = T.startStage(c);
  const r = P(b, 'chilian'); eq(r.revive, 2, '赤灼成名：站起來兩次'); ok(T.heroStats(c, 'chilian').ace, '擊破 ' + T.ACE_KILLS + ' 隻成名');
  const q = P(b, 'qingli'), z = E(b, 'mingquan'); only(b, [q, z]); q.x = 1; q.y = 8; z.x = 1; z.y = 7; z.hp = z.hpMax = 999999; z.rank = 'b'; q.st.dongming = 1;
  T.attack(c, q, 0, z, 'guard'); eq(z.ding, 2, '青璃成名：桃木劍也貼 2 層');
  ok(!T.heroStats(c, 'aduo').ace, '擊破不夠不成名');
}
{
  // 格鬥／射擊／靈力：法術招用靈力算；開發的招式要招式淬鍊到 5 級
  const c = T.newCampaign(4); c.stage = 4; let b = T.startStage(c);
  const q = P(b, 'qingli'), z = E(b, 'mingquan'); q.x = 1; q.y = 8; z.x = 1; z.y = 7;
  const w = T.HEROES.qingli.w.filter(x => x.id === 'dingshen')[0], d0 = T.damage(b, q, w, z, '', false); q.spi += 50; ok(T.damage(b, q, w, z, '', false) > d0, '定身符照靈力算');
  q.spi -= 50; const d1 = T.damage(b, q, w, z, '', false); q.rng += 50; eq(T.damage(b, q, w, z, '', false), d1, '定身符不看射擊');
  ok(!T.heroStats(c, 'shuang').w.some(x => x.id === 'duanxian'), '還沒開發：沒有斷弦');
  c.heroes.shuang.up.wpn = 5; ok(T.heroStats(c, 'shuang').w.some(x => x.id === 'duanxian'), '招式淬鍊 5 級：開發出斷弦');
  c.heroes.aduo.up.wpn = 5; c.battle = null; b = T.startStage(c); const a = P(b, 'aduo'); eq(a.ammo.dieying, 4, '開發出的蝶影有次數');
  T.ORDER.forEach(k => eq(T.devOf(k).length, 1, k + ' 有一招開發的招式'));
}
console.log((fail ? '❌ ' : '✅ ') + pass + ' 項通過' + (fail ? '，' + fail + ' 項沒過' : ''));
if (fail) process.exit(1);
