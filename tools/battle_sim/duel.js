// 對戰蒙地卡羅模擬：直接重用 engine.js 載入的真實 resolveFateBattle_ 做「單次交手」裁決，
// 只有「命中/命中/血量套用/十二試煉復活」這層回合迴圈是本工具自己補的膠水(因為 fateStrike_ 本尊
// 吃 sheets/pcData/COL 那套 GAS 列陣列，不方便脫離試算表單獨呼叫)——十二試煉的公式逐行對照
// Router_Battle.gs fateStrike_ 移植，數字/邏輯不自創。
//
// 範圍限定：只跑「普通攻擊」交鋒(不解放寶具、不吃補魔/整備/禮裝加成)，因為王之財寶(gob)／天之鎖(chain)
// 兩個常駐 fx 本來就在普攻就生效(見 gas/Engine_Fate.gs:596-599 的常駐彈幕)——這樣量到的勝率差，
// 才是這兩個被動本身的貢獻，不會被寶具解放的巨大傷害蓋過去。
//
// 用法：node tools/battle_sim/duel.js
'use strict';
const { loadEngineContext, buildCombatant } = require('./engine.js');

function stripFx(skills, fxList) {
  return skills.filter(s => !fxList.includes(s.fx));
}

// 十二試煉復活：逐行移植 Router_Battle.gs fateStrike_ 第 84~120 行的公式(普通攻擊路徑，
// 不含 opts.np 才有的「概念位階下限」加成，因為本模擬全程不解放寶具)。
function applyGodHandRevive(def, dmg) {
  const reviveHp = Math.max(1, Math.round(def.hpMax * 0.20));
  const overflow = Math.max(0, dmg - def.hp);
  const lossN = 1 + Math.floor(overflow / reviveHp);
  if (lossN <= def._lives) {
    def._lives -= lossN;
    def.hp = reviveHp;
    return { revived: true, lossN };
  }
  def._lives = 0;
  return { revived: false, lossN };
}

// 一場戰鬥打到其中一方陣亡(或撞到安全上限回合數，視為平手/膠著)。
// order: subject 先攻，每回合 subject 攻擊一次；enemy 存活就反擊一次。
function runDuel(ctx, subjectSeed, subjectOverrides, enemySeed, enemyOverrides) {
  const subject = buildCombatant(ctx, subjectSeed, { overrides: subjectOverrides });
  const enemy = buildCombatant(ctx, enemySeed, { overrides: enemyOverrides });
  enemy._lives = ctx.hasFx_(enemy, 'god_hand') ? 11 : 0; // getGodHandLives_ 預設值(Router_Battle.gs:1114)
  subject._lives = ctx.hasFx_(subject, 'god_hand') ? 11 : 0;

  const MAX_ROUNDS = 60;
  let rounds = 0;
  let subjectLivesBurned = 0, enemyLivesBurned = 0;

  for (rounds = 1; rounds <= MAX_ROUNDS; rounds++) {
    // subject 出擊
    let r = ctx.resolveFateBattle_(subject, enemy, {});
    if (r.atkWins) {
      enemy.hp -= r.damage;
      if (enemy.hp <= 0) {
        if (enemy._lives > 0) {
          const gh = applyGodHandRevive(enemy, r.damage);
          if (!gh.revived) return { winner: 'subject', rounds, subjectLivesBurned, enemyLivesBurned: 11 };
          enemyLivesBurned = 11 - enemy._lives;
        } else {
          return { winner: 'subject', rounds, subjectLivesBurned, enemyLivesBurned };
        }
      }
    }
    if (enemy.hp <= 0 && enemy._lives <= 0) return { winner: 'subject', rounds, subjectLivesBurned, enemyLivesBurned };

    // enemy 反擊(存活才反擊)
    r = ctx.resolveFateBattle_(enemy, subject, {});
    if (r.atkWins) {
      subject.hp -= r.damage;
      if (subject.hp <= 0) {
        if (subject._lives > 0) {
          const gh = applyGodHandRevive(subject, r.damage);
          if (!gh.revived) return { winner: 'enemy', rounds, subjectLivesBurned: 11, enemyLivesBurned };
          subjectLivesBurned = 11 - subject._lives;
        } else {
          return { winner: 'enemy', rounds, subjectLivesBurned, enemyLivesBurned };
        }
      }
    }
  }
  return { winner: 'stalemate', rounds, subjectLivesBurned, enemyLivesBurned };
}

function simulate(ctx, subjectSeed, subjectOverrides, enemySeed, N) {
  let subjectWins = 0, enemyWins = 0, stalemates = 0, totalRounds = 0, totalEnemyLivesBurned = 0;
  for (let i = 0; i < N; i++) {
    const res = runDuel(ctx, subjectSeed, subjectOverrides, enemySeed, {});
    if (res.winner === 'subject') subjectWins++;
    else if (res.winner === 'enemy') enemyWins++;
    else stalemates++;
    totalRounds += res.rounds;
    totalEnemyLivesBurned += res.enemyLivesBurned;
  }
  return {
    subjectWinRate: subjectWins / N,
    enemyWinRate: enemyWins / N,
    stalemateRate: stalemates / N,
    avgRounds: totalRounds / N,
    avgEnemyLivesBurned: totalEnemyLivesBurned / N,
  };
}

function main() {
  const ctx = loadEngineContext();
  const N = parseInt(process.argv[2] || '20000', 10);

  const gil = ctx.SEED_SERVANTS.find(s => s.id === '吉爾伽美什-Archer');
  const enk = ctx.SEED_SERVANTS.find(s => s.id === '恩奇都-Lancer');
  const her = ctx.SEED_SERVANTS.find(s => s.id === '赫拉克勒斯-Berserker');

  console.log(`每組模擬 ${N} 場（單場＝普通攻擊反覆交鋒至一方陣亡；不解放寶具/不吃補魔整備/禮裝）\n`);

  function report(label, seed, fxToStrip) {
    const fullSkills = (seed.classSkills || []).concat(seed.skills || []).map(s => Object.assign({}, s));
    const overrides = fxToStrip ? { skills: stripFx(fullSkills, fxToStrip) } : {};
    const res = simulate(ctx, seed, overrides, her, N);
    console.log(`${label}`);
    console.log(`  勝率＝${(res.subjectWinRate * 100).toFixed(1)}%　　敗率＝${(res.enemyWinRate * 100).toFixed(1)}%　　膠著(撞${60}回合上限)＝${(res.stalemateRate * 100).toFixed(1)}%`);
    console.log(`  平均戰鬥回合數＝${res.avgRounds.toFixed(1)}　　平均燒掉B叔命數＝${res.avgEnemyLivesBurned.toFixed(2)}/11\n`);
    return res;
  }

  console.log('== 金閃閃(吉爾伽美什-Archer) vs 赫拉克勒斯-Berserker(5th) ==');
  const gilWith = report('【有】王之財寶+天之鎖被動', gil, null);
  const gilWithout = report('【無】王之財寶+天之鎖被動(拔掉 gob/chain 兩個fx)', gil, ['gob', 'chain']);

  console.log('== 恩奇都 vs 赫拉克勒斯-Berserker(5th) ==');
  const enkWith = report('【有】天之鎖被動', enk, null);
  const enkWithout = report('【無】天之鎖被動(拔掉 chain)', enk, ['chain']);

  console.log('== 差異總結 ==');
  console.log(`金閃閃：勝率 ${(gilWithout.subjectWinRate * 100).toFixed(1)}% → ${(gilWith.subjectWinRate * 100).toFixed(1)}%（+${((gilWith.subjectWinRate - gilWithout.subjectWinRate) * 100).toFixed(1)} 個百分點）`);
  console.log(`恩奇都：勝率 ${(enkWithout.subjectWinRate * 100).toFixed(1)}% → ${(enkWith.subjectWinRate * 100).toFixed(1)}%（+${((enkWith.subjectWinRate - enkWithout.subjectWinRate) * 100).toFixed(1)} 個百分點）`);
}

main();
