// 從者對從者 全循環賽(round-robin)：任一戰爭池(4th/5th/all)內每兩位互打 N 場，統計勝率排名。
// 三種模式各自獨立測(不疊加)，方便看出「拔掉資源」對排名的影響有多大：
//   basic ＝ 全普攻，opts={}(不含主動技加成、不解放寶具)——比六圍+常駐被動(fx)的裸體力。
//            ⚠ 真實遊戲「主動技關閉」時其實仍會自動吃 35% 微量版(tinyActiveSkill_)，並非完全 0 加成；
//            這裡刻意測「完全不給」的裸數字，微量版差異通常個位數、不影響排名大勢。
//   skill ＝ 開啟主動技(servantActiveSkill_ 全效，若無真·施放技術則跟 basic 相同)，仍不解放寶具。
//   np    ＝ 每次交手都解放寶具(opts.np=true，出力強制100%，多寶具挑最強攻擊項)——量寶具火力本身，
//            不模擬御主魔力經濟(現實中寶具有次數限制，這裡假設可無限施放，純比"這把寶具多凶")。
//
// 用法：node tools/battle_sim/roundrobin.js [pool=4th|5th|all] [mode=basic|skill|np] [N=200]
'use strict';
const { loadEngineContext, buildCombatant } = require('./engine.js');

// 十二試煉復活：逐行移植 Router_Battle.gs fateStrike_ 第 84~120 行(含 opts.np 的概念下限燒命，
// 因為 np 模式下這條分支會實際觸發，basic/skill 模式沒解放寶具永遠吃不到、保持跟 duel.js 一致)。
function applyGodHandRevive(atkC, defC, dmg, isNp, ctx) {
  const reviveHp = Math.max(1, Math.round(defC.hpMax * 0.20));
  let lossN = 1;
  if (isNp) {
    const ghTier = ctx.offenseTier_(atkC, true);
    const ghScale = ctx.npAtkScale_(atkC);
    const ghScaleTier = ghScale === '對界' ? 6 : ghScale === '對城' ? 5 : ghScale === '對軍' ? 4 : 1;
    const ghSev = Math.max(ghTier, ghScaleTier);
    if (ghSev >= 6) lossN = Math.max(lossN, 3); else if (ghSev >= 5) lossN = Math.max(lossN, 2);
  }
  lossN = Math.max(lossN, 1 + Math.floor(Math.max(0, dmg - defC.hp) / reviveHp));
  if (lossN <= defC._lives) { defC._lives -= lossN; defC.hp = reviveHp; return true; }
  defC._lives = 0;
  return false;
}

function runDuel(ctx, A, B, mode) {
  A._lives = ctx.hasFx_(A, 'god_hand') ? 11 : 0;
  B._lives = ctx.hasFx_(B, 'god_hand') ? 11 : 0;
  const skillOptFor = (c) => {
    if (mode !== 'skill') return null;
    return ctx.servantActiveSkill_(c) || null;
  };
  const npFlag = mode === 'np';
  const MAX_ROUNDS = 60;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    // 交替先攻，消除單場模擬內的先手偏誤
    const [atk, def] = (round % 2 === 1) ? [A, B] : [B, A];
    const r = ctx.resolveFateBattle_(atk, def, { np: npFlag, skill: skillOptFor(atk) });
    if (r.atkWins) {
      def.hp -= r.damage;
      if (def.hp <= 0) {
        if (def._lives > 0) {
          if (!applyGodHandRevive(atk, def, r.damage, npFlag, ctx)) return atk === A ? 'A' : 'B';
        } else {
          return atk === A ? 'A' : 'B';
        }
      }
    }
  }
  return 'draw';
}

function poolServants(ctx, pool) {
  if (pool === 'all') return ctx.SEED_SERVANTS.slice();
  return ctx.SEED_SERVANTS.filter(s => s.wars.includes(pool));
}

function main() {
  const pool = process.argv[2] || '5th';
  const mode = process.argv[3] || 'basic';
  const N = parseInt(process.argv[4] || '200', 10);
  const ctx = loadEngineContext();
  const seeds = poolServants(ctx, pool);
  const n = seeds.length;
  const wins = new Array(n).fill(0), games = new Array(n).fill(0);
  const outputPct = mode === 'np' ? 100 : 60;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let aWins = 0;
      for (let k = 0; k < N; k++) {
        const A = buildCombatant(ctx, seeds[i], { output: outputPct, np: mode === 'np' });
        const B = buildCombatant(ctx, seeds[j], { output: outputPct, np: mode === 'np' });
        const res = runDuel(ctx, A, B, mode);
        if (res === 'A') aWins++;
      }
      wins[i] += aWins; games[i] += N;
      wins[j] += (N - aWins); games[j] += N;
    }
  }

  const ranking = seeds.map((s, idx) => ({
    id: s.id, winRate: games[idx] ? wins[idx] / games[idx] : 0,
  })).sort((a, b) => b.winRate - a.winRate);

  console.log(`=== 池=${pool}　模式=${mode}　每對戰局數=${N}　參賽=${n}位 ===`);
  ranking.forEach((r, idx) => {
    console.log(`${String(idx + 1).padStart(2)}. ${r.id.padEnd(16, '　')} 對全池勝率 ${(r.winRate * 100).toFixed(1)}%`);
  });
  console.log('');
  return ranking;
}

if (require.main === module) main();
module.exports = { main, poolServants, buildCombatant, runDuel };
