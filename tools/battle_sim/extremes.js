// 🏟️ 極端組合回歸測試（常駐·平衡改動後必跑）：node tools/battle_sim/extremes.js [N=200]
//
// 歷次平衡事件揪出的退化組合＋各極端原型全部收錄在 BUILDS——改引擎/價目後重跑，兩張表看健康度：
//   ① 每個組合 vs 全種子池（普攻＋寶具）——紅旗：普攻>90% 或 寶具>90%
//   ② 組合互鬥全循環——紅旗：出現「無天敵」（對每個對手都≥50%）＝可能的新無敵組合
// 預算用【本檔鏡射的現行價目】現算：改價後買不起的組合自動標 ❌棄測——直接看見「這刀殺死了哪些舊斂法」。
// ⚠ 價目鏡射自 Router_Creation.gs parseForgeBuild_（RANK/三軌/FLAT/欄位費/規模），改後端價目記得同步這裡。
'use strict';
const { loadEngineContext, buildCombatant } = require('./engine.js');
const ctx = loadEngineContext();
const pool = ctx.SEED_SERVANTS.slice();

// ── 價目鏡射（同步 Router_Creation.gs）──
const RV = { E: 10, D: 20, C: 30, B: 40, A: 50, EX: 60 };
const SP_STD = { E: 5, D: 10, C: 15, B: 20, A: 25 }, SP_BIG = { E: 7, D: 13, C: 20, B: 27, A: 33 }, SP_SMALL = { E: 3, D: 7, C: 10, B: 13, A: 17 };
const TRACK = { aim: 1, petrify: 1, fast_cast: 1, divine_age: 1, territory: 1, ride: -1, wind_strike: -1, morale: -1 };
const FLAT = { god_hand: 25, survive: 25, tsubame: 60, zabaniya: 25, gae_bolg: 25, rule_breaker: 25, anti_magic_lance: 25, agile_striker: 25, weapon_steal: 25, god_slay: 25, lovespot: 5 };
const BUDGET = 340, SLOT_FEE_AFTER = 3; // 第4技+20
const CLS_BONUS = { Berserker: 30 }; // 🐗 狂化補正(2026-07·鏡射 FORGE_CLS_BONUS_)
const CLS_SK = {
  Saber: [{ n: '對魔力', r: 'B', fx: 'nullify_magic' }], Lancer: [{ n: '對魔力', r: 'C', fx: 'nullify_magic' }],
  Archer: [{ n: '對魔力', r: 'C', fx: 'nullify_magic' }, { n: '單獨行動', r: 'C', fx: 'solo' }],
  Rider: [{ n: '對魔力', r: 'C', fx: 'nullify_magic' }, { n: '騎乘', r: 'B', fx: 'ride' }],
  Caster: [{ n: '陣地作成', r: 'C', fx: 'territory' }, { n: '道具作成', r: 'C', fx: 'crafting' }],
  Assassin: [{ n: '氣息遮斷', r: 'B', fx: 'stealth' }], Berserker: [{ n: '狂化', r: 'C', fx: 'mad' }]
};
function cost(six, skills, scale) {
  let c = Object.values(six).reduce((a, r) => a + RV[r], 0) + (scale === '對軍' ? 20 : 0);
  skills.forEach(s => { c += FLAT[s.fx] || (TRACK[s.fx] === 1 ? SP_BIG : TRACK[s.fx] === -1 ? SP_SMALL : SP_STD)[s.r] || 15; });
  if (skills.length > SLOT_FEE_AFTER) c += 20;
  return c;
}
function mk(name, cls, six, skills, scale, note) {
  return { name, note: note || '', cls, six, skills, scale: scale || '對人', cost: cost(six, skills, scale),
    seed: { realName: name, cls, six, classSkills: CLS_SK[cls], skills, traits: [{ n: '人類' }], np: `測試寶具（${scale || '對人'}）` } };
}
const S = (n, r, fx) => ({ n, r, fx });

// ── 極端組合名冊（歷史事件註記·新退化組合往這裡加）──
const BUILDS = [
  mk('燕巧盾', 'Saber', { 筋力: 'C', 耐久: 'C', 敏捷: 'EX', 魔力: 'C', 幸運: 'A', 寶具: 'C' },
    [S('以巧破力', 'C', 'agile_striker'), S('燕返', 'C', 'tsubame'), S('七天盾', 'A', 'rho_aias')], '對人',
    '2026-07 玩家實測普攻100%無敵→催生 盾NP限定+燕返首回合'),
  mk('以巧變化流', 'Saber', { 筋力: 'C', 耐久: 'B', 敏捷: 'EX', 魔力: 'C', 幸運: 'B', 寶具: 'C' },
    [S('以巧破力', 'C', 'agile_striker'), S('變化', 'A', 'shapeshift'), S('直感', 'A', 'first_strike')], '對人',
    '2026-07 互鬥98.9%無天敵→催生 全能稅×0.85+疊加上限±8+魔眼4×階'),
  mk('石化獵手', 'Archer', { 筋力: 'A', 耐久: 'B', 敏捷: 'B', 魔力: 'C', 幸運: 'C', 寶具: 'A' },
    [S('石化魔眼', 'A', 'petrify'), S('千里眼', 'A', 'aim')], '對人', '閃避流指定剋星(魔眼4×階後成立)'),
  mk('雙EX肉坦復活', 'Berserker', { 筋力: 'EX', 耐久: 'EX', 敏捷: 'C', 魔力: 'E', 幸運: 'D', 寶具: 'E' },
    [S('不死復活', 'C', 'god_hand'), S('治癒', 'A', 'regen'), S('戰鬥續行', 'C', 'survive')]),
  mk('神代魔砲', 'Caster', { 筋力: 'E', 耐久: 'D', 敏捷: 'C', 魔力: 'EX', 幸運: 'C', 寶具: 'A' },
    [S('神代魔術', 'A', 'divine_age'), S('高速詠唱', 'A', 'fast_cast')], '對軍'),
  mk('妄想心音刺客', 'Assassin', { 筋力: 'C', 耐久: 'C', 敏捷: 'EX', 魔力: 'C', 幸運: 'B', 寶具: 'B' },
    [S('妄想心音', 'C', 'zabaniya'), S('以巧破力', 'C', 'agile_striker')]),
  mk('必中槍獵手', 'Lancer', { 筋力: 'A', 耐久: 'B', 敏捷: 'A', 魔力: 'C', 幸運: 'C', 寶具: 'A' },
    [S('必滅刺槍', 'C', 'gae_bolg'), S('心眼', 'B', 'analyze')]),
  mk('破魔破戒騎士', 'Saber', { 筋力: 'A', 耐久: 'B', 敏捷: 'B', 魔力: 'C', 幸運: 'C', 寶具: 'B' },
    [S('破魔紅薔薇', 'C', 'anti_magic_lance'), S('破戒', 'C', 'rule_breaker')]),
  mk('對軍砲台', 'Archer', { 筋力: 'D', 耐久: 'C', 敏捷: 'C', 魔力: 'A', 幸運: 'C', 寶具: 'EX' },
    [S('軍略', 'A', 'tactics')], '對軍'),
  mk('盾龜法師', 'Caster', { 筋力: 'E', 耐久: 'A', 敏捷: 'D', 魔力: 'A', 幸運: 'B', 寶具: 'C' },
    [S('七天盾', 'A', 'rho_aias'), S('城牆防禦', 'A', 'wall_def'), S('治癒', 'A', 'regen')]),
  mk('福星騎士', 'Rider', { 筋力: 'B', 耐久: 'B', 敏捷: 'B', 魔力: 'C', 幸運: 'EX', 寶具: 'B' },
    [S('直感', 'A', 'first_strike')]),
  mk('狂戰自我改造', 'Berserker', { 筋力: 'EX', 耐久: 'A', 敏捷: 'A', 魔力: 'E', 幸運: 'D', 寶具: 'B' },
    [S('自我改造', 'A', 'self_mod')]),
  mk('軍師勇猛壓制', 'Rider', { 筋力: 'B', 耐久: 'B', 敏捷: 'B', 魔力: 'B', 幸運: 'C', 寶具: 'A' },
    [S('卡里斯瑪', 'A', 'morale'), S('軍略', 'A', 'tactics')]),
  mk('四技·燕巧盾變化', 'Saber', { 筋力: 'E', 耐久: 'D', 敏捷: 'EX', 魔力: 'E', 幸運: 'B', 寶具: 'D' },
    [S('以巧破力', 'C', 'agile_striker'), S('燕返', 'C', 'tsubame'), S('七天盾', 'A', 'rho_aias'), S('變化', 'A', 'shapeshift')], '對人',
    '2026-07 第4欄壓力測試·六圍被擠壓後反而更弱'),
  mk('四技·四重防禦龜', 'Caster', { 筋力: 'E', 耐久: 'A', 敏捷: 'D', 魔力: 'A', 幸運: 'B', 寶具: 'C' },
    [S('七天盾', 'A', 'rho_aias'), S('城牆防禦', 'A', 'wall_def'), S('治癒', 'A', 'regen'), S('神核', 'A', 'divine_core')]),
  mk('四技·全命中壓制', 'Archer', { 筋力: 'C', 耐久: 'C', 敏捷: 'EX', 魔力: 'E', 幸運: 'C', 寶具: 'D' },
    [S('以巧破力', 'C', 'agile_striker'), S('千里眼', 'A', 'aim'), S('魔眼', 'A', 'petrify'), S('變化', 'A', 'shapeshift')]),
];

// ── 對戰核心（3回合週期映射按鍵節奏·工房god_hand=3命/種子=11命）──
function runDuel(A, B, npFlag, aForge) {
  A._lives = ctx.hasFx_(A, 'god_hand') ? (aForge ? 3 : 11) : 0;
  B._lives = ctx.hasFx_(B, 'god_hand') ? 11 : 0;
  for (let round = 1; round <= 60; round++) {
    const [atk, def] = (round % 2 === 1) ? [A, B] : [B, A];
    const r = ctx.resolveFateBattle_(atk, def, { np: npFlag, round: ((round - 1) % 3) + 1 });
    if (r.atkWins) {
      def.hp -= r.damage;
      if (def.hp <= 0) {
        if (def._lives > 0) {
          const rv = Math.max(1, Math.round(def.hpMax * .2));
          const ln = 1 + Math.floor(Math.max(0, r.damage - def.hp) / rv);
          if (ln <= def._lives) { def._lives -= ln; def.hp = rv; continue; }
          def._lives = 0;
        }
        return atk === A ? 'A' : 'B';
      }
    }
  }
  return 'draw';
}
function runDuelBB(A, B, npFlag) { // build vs build：雙方皆工房(3命)
  A._lives = ctx.hasFx_(A, 'god_hand') ? 3 : 0; B._lives = ctx.hasFx_(B, 'god_hand') ? 3 : 0;
  for (let round = 1; round <= 60; round++) {
    const [atk, def] = (round % 2 === 1) ? [A, B] : [B, A];
    const r = ctx.resolveFateBattle_(atk, def, { np: npFlag, round: ((round - 1) % 3) + 1 });
    if (r.atkWins) {
      def.hp -= r.damage;
      if (def.hp <= 0) {
        if (def._lives > 0) {
          const rv = Math.max(1, Math.round(def.hpMax * .2));
          const ln = 1 + Math.floor(Math.max(0, r.damage - def.hp) / rv);
          if (ln <= def._lives) { def._lives -= ln; def.hp = rv; continue; }
          def._lives = 0;
        }
        return atk === A ? 'A' : 'B';
      }
    }
  }
  return 'draw';
}

function main() {
  const N = parseInt(process.argv[2] || '200', 10);
  const cap = b => BUDGET + (CLS_BONUS[b.cls] || 0);
  const legal = BUILDS.filter(b => b.cost <= cap(b));
  const dead = BUILDS.filter(b => b.cost > cap(b));
  console.log(`=== 極端組合回歸測試　N=${N}/對　預算=${BUDGET} ===`);
  if (dead.length) console.log('❌ 現行價目下已買不起(棄測)：' + dead.map(b => `${b.name}(${b.cost})`).join('、'));
  const flags = [];

  // ① vs 全種子池
  console.log('\n── ① vs 全種子池（36騎）──');
  for (const b of legal) {
    const rates = {};
    for (const npFlag of [false, true]) {
      let w = 0, g = 0;
      for (const es of pool) for (let k = 0; k < N; k++) {
        const A = buildCombatant(ctx, b.seed, { output: npFlag ? 100 : 60, np: npFlag });
        const B = buildCombatant(ctx, es, { output: npFlag ? 100 : 60, np: npFlag });
        if (runDuel(A, B, npFlag, true) === 'A') w++;
        g++;
      }
      rates[npFlag ? 'np' : 'basic'] = w / g * 100;
    }
    const flag = (rates.basic > 90 || rates.np > 90) ? ' 🚩' : '';
    if (flag) flags.push(`${b.name} vs種子池 普攻${rates.basic.toFixed(1)}%/寶具${rates.np.toFixed(1)}%`);
    console.log(`  ${b.name.padEnd(12, '　')}(${String(b.cost).padStart(3)}pt) 普攻 ${rates.basic.toFixed(1).padStart(5)}%　寶具 ${rates.np.toFixed(1).padStart(5)}%${flag}${b.note ? '　※' + b.note : ''}`);
  }

  // ② 互鬥全循環＋無天敵偵測
  console.log('\n── ② 組合互鬥全循環 ──');
  for (const npFlag of [false, true]) {
    const n = legal.length, W = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let a = 0;
      for (let k = 0; k < N; k++) {
        const A = buildCombatant(ctx, legal[i].seed, { output: npFlag ? 100 : 60, np: npFlag });
        const B = buildCombatant(ctx, legal[j].seed, { output: npFlag ? 100 : 60, np: npFlag });
        if (runDuelBB(A, B, npFlag) === 'A') a++;
      }
      W[i][j] = a / N; W[j][i] = 1 - a / N;
    }
    const rank = legal.map((b, i) => {
      const rs = W[i].filter((_, j) => j !== i);
      let worst = 1, wj = -1;
      W[i].forEach((r, j) => { if (j !== i && r < worst) { worst = r; wj = j; } });
      return { name: b.name, avg: rs.reduce((s, x) => s + x, 0) / rs.length, worst, wj };
    }).sort((a, b) => b.avg - a.avg);
    console.log(`  【${npFlag ? '寶具戰' : '普攻戰'}】` + rank.slice(0, 5).map(r => `${r.name} ${(r.avg * 100).toFixed(0)}%`).join('｜') + ' …');
    const noCounter = rank.filter(r => r.worst >= 0.5);
    if (noCounter.length) {
      noCounter.forEach(r => flags.push(`互鬥${npFlag ? '寶具' : '普攻'}無天敵：${r.name}(最低對局仍勝${(r.worst * 100).toFixed(0)}%)`));
      console.log('  ⚠️ 無天敵：' + noCounter.map(r => r.name).join('、'));
    } else {
      console.log('  ✅ 人人有天敵');
    }
  }

  console.log('\n══ 總結 ══');
  console.log(flags.length ? flags.map(f => '🚩 ' + f).join('\n') : '✅ 全數健康：無破9成、無無敵組合');
}
main();
