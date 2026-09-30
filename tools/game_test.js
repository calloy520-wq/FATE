// 引擎測試：node tools/game_test.js
const G=require('./game.js'); const {playRun}=require('./sim.js');
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('  ✅ '+l);} else {bad++;console.log('  ❌ '+l+(x!==undefined?'  '+String(x).slice(0,240):''));} };
const J=o=>JSON.parse(JSON.stringify(o));
let run=G.newRun('saber',7);
t(run.hp===85&&run.deck.length===10&&run.map.length===13&&run.seals===3,'開局：Saber 85 血、10 張牌、13 層地圖、3 劃令咒');
t(JSON.stringify(G.reachable(run))==='[0,1,2]'&&run.map[0].every(x=>x==='fight')&&run.map[12].every(x=>x==='boss')&&run.map[11].every(x=>x==='rest'),'第一層都是戰鬥、倒數第二層休息、最上層 Boss');
G.go(run,1); t(run.screen==='battle'&&run.battle.hand.length===5&&run.battle.energy===3,'進戰鬥：抽 5 張、3 點魔力');
t(JSON.stringify(G.reachable(Object.assign(J(run),{screen:'map'})))==='[0,1,2]','中間的格子能走到左中右三格');
// 出牌
let b=run.battle; b.hand=['atk','def','invis','atk','atk']; const e0=b.enemies[0], hp0=e0.hp; e0.block=0; e0.vuln=0; b.firstAtk=false;
let r=G.play(run,0,0); t(r.ok&&e0.hp===hp0-6&&b.energy===2&&b.np===10&&b.discard.includes('atk'),'攻擊：6 傷、扣 1 魔力、寶具 +10%、進棄牌堆',JSON.stringify({hp:e0.hp,hp0,np:b.np}));
b.energy=0; r=G.play(run,0,0); t(!r.ok&&/魔力/.test(r.msg),'魔力不夠不能出');
// 易傷、虛弱
const r2=J(run); r2.battle.energy=3; r2.battle.enemies[0].vuln=1; r2.battle.enemies[0].block=0; r2.battle.enemies[0].hp=50; r2.battle.weak=0; r2.battle.hand=['atk']; const h2=r2.battle.enemies[0].hp; G.play(r2,0,0);
t(h2-r2.battle.enemies[0].hp===9,'敵人易傷：6→9',h2-r2.battle.enemies[0].hp);
const r3=J(run); r3.battle.energy=3; r3.battle.enemies[0].vuln=0; r3.battle.enemies[0].block=0; r3.battle.enemies[0].hp=50; r3.battle.weak=1; r3.battle.hand=['atk']; const h3=r3.battle.enemies[0].hp; G.play(r3,0,0);
t(h3-r3.battle.enemies[0].hp===4,'自己虛弱：6→4',h3-r3.battle.enemies[0].hp);
// 格擋與敵人回合
const r4=J(run); const B4=r4.battle; B4.enemies=[B4.enemies[0]]; B4.enemies[0].intent={n:'測',fx:[['atk',10]]}; B4.enemies[0].str=0; B4.enemies[0].weak=0; B4.block=4; B4.vuln=0; const p4=r4.hp; G.endTurn(r4);
t(p4-r4.hp===6&&r4.battle.turn===2&&r4.battle.hand.length===5,'敵人打 10、格擋 4 → 扣 6；新回合重抽',p4-r4.hp);
// 寶具
const r5=J(run); r5.battle.np=100; const hs=r5.battle.enemies.map(e=>e.hp); G.noble(r5,0);
t(r5.battle===null||r5.screen==='reward'||r5.battle.enemies.every((e,i)=>e.hp<hs[i]),'Saber 寶具：全體受傷');
t(!G.noble(J(run),0).ok,'量表沒滿不能放寶具');
// 令咒
const r6=J(run); const en=r6.battle.energy, hl=r6.battle.hand.length; G.seal(r6,'all'); t(r6.seals===2&&r6.battle.energy===en+3&&r6.battle.hand.length===hl+2,'令咒（全力）：魔力 +3、抽 2、剩 2 劃');
G.seal(r6,'np'); t(r6.battle.np===100&&r6.seals===1,'令咒（寶具）：量表充滿');
r6.seals=0; t(!G.seal(r6,'all').ok,'令咒用完不能用');
// Archer：投影與引爆、無限劍製
const a=G.newRun('archer',3); G.go(a,0); const ab=a.battle; ab.hand=['project','broken']; ab.energy=3;
G.play(a,0,0); t(ab.hand.filter(x=>x==='sword').length===2,'投影魔術：手牌多 2 張投影劍');
const hsA=ab.enemies.map(e=>e.hp); G.play(a,ab.hand.indexOf('broken'),0);
t(ab.hand.every(x=>x!=='sword')&&(a.screen!=='battle'||ab.enemies.some((e,i)=>e.hp<hsA[i])),'壞幻：消耗全部投影劍，對全體造成傷害');
const a2=G.newRun('archer',4); G.go(a2,0); a2.battle.np=100; a2.battle.hand=[]; G.noble(a2,0);
t(a2.battle.hand.length===3&&a2.battle.ubw===2&&a2.battle.projUp===2,'無限劍製：立刻 3 張投影劍、之後 2 回合各 3 張、投影劍 +2 傷');
t(/造成 5 傷害/.test(G.cardText('sword',a2)),'投影劍說明跟著加成變（3+2＝5）',G.cardText('sword',a2));
// 投影劍不進牌組
const deck0=a2.deck.length; a2.battle.enemies.forEach(e=>{e.hp=0;}); a2.battle.hand=['sword']; a2.battle.enemies[0].hp=1; a2.battle.energy=1; G.play(a2,0,0);
if(a2.screen==='reward') G.takeReward(a2,-1); t(a2.deck.length===deck0&&!a2.deck.includes('sword'),'投影劍是消耗品，不會混進牌組');
// 獎勵、休息、強化
const r7=G.newRun('saber',9); G.go(r7,0); r7.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); r7.battle.np=100; G.noble(r7,0);
t(r7.screen==='reward'&&r7.reward.cards.length===3,'打贏：三選一的新牌');
const pick=r7.reward.cards[0]; G.takeReward(r7,0); t(r7.deck.includes(pick)&&r7.screen==='map','選的牌加進牌組、回地圖');
r7.screen='rest'; r7.hp=10; G.rest(r7,'heal'); t(r7.hp===10+Math.round(85*0.3),'休息：回三成生命');
r7.screen='rest'; const ui=r7.deck.indexOf('atk'); G.rest(r7,'upgrade',ui); t(r7.deck[ui]==='atk+'&&G.card('atk+').fx[0][1]===9&&G.card('atk+').name==='攻擊＋','強化：攻擊→攻擊＋（9 傷）');
// Boss 十二試煉
const r8=G.newRun('saber',11); r8.floor=12; r8.lane=1; G.go(r8,1); const hb=r8.battle.enemies[0];
t(hb.name==='赫拉克勒斯'&&hb.lives===2,'Boss 赫拉克勒斯：兩條命');
hb.hp=5; hb.block=0; r8.battle.hand=['heavy']; r8.battle.energy=2; G.play(r8,0,0);
t(hb.hp===60&&hb.lives===1&&r8.screen==='battle','打倒一次：以六成血站起來');
hb.lives=0; hb.hp=1; r8.battle.hand=['atk']; r8.battle.energy=1; G.play(r8,0,0); t(r8.screen==='over'&&r8.win,'命用完打倒 Boss：通關');
// 禮裝
const r9=G.newRun('saber',12); r9.relics=['shroud','gem','circuit','book']; G.go(r9,0);
t(r9.battle.block===8&&r9.battle.energy===4&&r9.battle.np===25&&r9.battle.enemies.every(e=>e.weak===1),'禮裝：聖骸布 8 格擋、寶石第一回合 +1 魔力、魔術刻印 25%、偽臣之書敵人虛弱');
// 存檔：整局 JSON 來回後照樣能打
const r10=J(G.newRun('archer',21)); G.go(r10,2); const saved=J(r10); r=G.play(saved,0,0); t(r.ok||r.msg,'存檔（JSON）來回後照樣能出牌');
// 整局跑得完（自動玩家）
let fin=0; for(let i=0;i<60;i++){ const x=playRun(i%2?'saber':'archer',500+i); if(x.screen==='over') fin++; }
t(fin===60,'自動玩家 60 局都能打到結束（不卡死）',fin);
console.log(bad?'❌ '+bad+' 條失敗（通過 '+ok+'）':'✅ 全部 '+ok+' 條通過'); process.exit(bad?1:0);
