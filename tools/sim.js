// 自動玩家：一次打很多局看勝率。用法：N=300 WHO=saber,cu node tools/sim.js
// 出牌方式：每張能出的牌（和寶具）都先在複本上試打一次，看局面分數變多少，挑最好的；沒有會變好的就結束回合。
const G=require('./game.js');
const N=+process.env.N||300, WHO=(process.env.WHO||G.ORDER.join(',')).split(',');
const J=o=>JSON.parse(JSON.stringify(o));

// 敵人這回合預計打過來多少（被石化的不算）
function incoming(run){
  const b=run.battle; let hits=[];
  G.alive(b).forEach(e=>{ if(e.stun) return; e.intent.fx.forEach(f=>{ if(f[0]==='atk'||f[0]==='atkP') for(let h=0;h<(f[2]||1);h++) hits.push([G.intentDmg(run,e,f),f[0]==='atkP']); }); });
  return hits;
}
function expectedLoss(run){
  const b=run.battle; let block=b.block, evade=b.evade, minions=b.minions, loss=0;
  if(G.passive(run)==='mind') evade+=Math.min(2,b.energy);
  incoming(run).sort((x,y)=>y[0]-x[0]).forEach(([d,p])=>{
    if(evade>0){evade--;return;}
    if(!p){ const t=Math.min(block,d); block-=t; d-=t; if(d>0&&minions>0){minions--; d=Math.max(0,d-6);} }
    loss+=d; });
  return loss;
}
// 局面分數：越高越好
function value(run){
  const b=run.battle;
  if(run.screen==='over') return run.win?1e6:-1e6;
  if(run.screen!=='battle') return 5e5+run.hp*10;
  let v=0;
  G.alive(b).forEach(e=>{ v-=e.hp+e.block*0.5+(e.lives||0)*e.maxHp*0.6; v+=e.poison*1.5+e.wound*3+e.petrify*2.5+(e.stun?18:0)+Math.min(e.weak,3)*2+Math.min(e.vuln,3)*3-Math.max(-3,e.str)*3; });
  v-=G.alive(b).length*6;
  const left=4; // 估計這場還要打幾回合
  v+=run.hp*1.5-expectedLoss(run)*1.6;
  b.hand.forEach(id=>{ const c=G.card(id); v+=c.token?(c.type==='atk'?5:3.5):2.5; });
  v+=b.str*5+b.tstr*1.2+b.energy*4+b.np*0.35+b.minions*4+b.army*3.5+b.combo*0.8+(b.nextFree?4:0)+b.nextEnergy*4;
  v+=(b.pBlock*3+b.pDraw*6+b.pEnergy*9+b.pStr*6+b.pEvade*8+b.pTreasure*6+b.pMinion*7+b.pVenom*6+b.pCombo*4)*left/4;
  v+=b.ubw*12+b.projUp*6+b.thorns*0.5;
  return v;
}
function bestAction(run){
  const b=run.battle, base=value(run); let best=null, bv=0.5;
  const tgs=b.enemies.map((e,i)=>i).filter(i=>b.enemies[i].hp>0);
  b.hand.forEach((id,i)=>{
    if(G.costOf(run,id)>b.energy) return;
    const c=G.card(id);
    (c.t?tgs:[tgs[0]]).forEach(t=>{ const r=J(run); if(!G.play(r,i,t).ok) return; const d=value(r)-base; if(d>bv){bv=d;best={k:'card',i,t};} });
  });
  if(b.np>=100){ const S=G.serv(run); (G.needsTarget(S.np.fx)?tgs:[tgs[0]]).forEach(t=>{ const r=J(run); if(!G.noble(r,t).ok) return; const d=value(r)-base+5; if(d>bv){bv=d;best={k:'np',t};} }); }
  return best;
}
function playTurn(run){
  const b=run.battle; let guard=0;
  while(run.screen==='battle'&&guard++<40){
    if(run.seals>0&&b.turn===1&&(b.kind==='boss'||(b.kind==='elite'&&run.seals>1))&&G.alive(b).some(e=>e.hp>40)){ G.seal(run,b.np>=60?'np':'all'); continue; }
    const a=bestAction(run); if(!a) break;
    const r=a.k==='np'?G.noble(run,a.t):G.play(run,a.i,a.t); if(!r.ok) break;
  }
  if(run.screen==='battle') G.endTurn(run);
}
// 選牌：每張牌在固定的測試局面裡試打一次的分數（快取）；能力牌同一張最多拿 2 張
const RATE={};
function rate(who,id){
  const k=who+'|'+id; if(RATE[k]!==undefined) return RATE[k];
  let tot=0;
  for(let s=1;s<=3;s++){
    const r=G.newRun(who,s); r.map[0]=['fight','fight','fight']; G.go(r,0); const b=r.battle;
    b.enemies=[b.enemies[0]]; while(b.enemies.length<2) b.enemies.push(J(b.enemies[0]));
    b.enemies.forEach((e,i)=>{ e.key='d'+i; e.hp=e.maxHp=40; e.block=0; e.weak=0; e.intent={n:'測',fx:[['atk',9]]}; });
    b.hand=[id,'atk','def']; b.energy=3; b.np=0; b.turn=2;
    const base=value(r); const x=J(r); G.play(x,0,0); tot+=value(x)-base;
  }
  return RATE[k]=tot/3;
}
function pickReward(run){
  const cs=run.reward.cards; if(run.deck.length>=24) return -1;
  let best=-1, bv=4;
  cs.forEach((id,i)=>{ const c=G.card(id); if(c.type==='power'&&run.deck.filter(x=>x.replace('+','')===id.replace('+','')).length>=2) return;
    const v=rate(run.who,id)+(c.type==='power'?6:0); if(v>bv){bv=v;best=i;} });
  return best;
}
function playRun(who,seed){
  const run=G.newRun(who,seed); let g=0;
  while(run.screen!=='over'&&g++<3000){
    if(run.screen==='map'){ const opts=G.reachable(run); const t=l=>run.map[run.floor][l];
      const pref=run.hp<run.maxHp*0.5?['rest','chest','fight','elite','boss']:run.hp>run.maxHp*0.75?['elite','chest','fight','rest','boss']:['chest','fight','rest','elite','boss'];
      let lane=opts[0], bi=99; opts.forEach(l=>{ const k=pref.indexOf(t(l)); if(k<bi){bi=k;lane=l;} }); G.go(run,lane); }
    else if(run.screen==='battle') playTurn(run);
    else if(run.screen==='reward') G.takeReward(run,pickReward(run));
    else if(run.screen==='chest') G.takeChest(run);
    else if(run.screen==='rest'){ if(run.hp<run.maxHp*0.65) G.rest(run,'heal'); else { const i=run.deck.findIndex(x=>x.slice(-1)!=='+'&&x!=='atk'&&x!=='def'&&G.CARDS[x].up); if(!(i>=0&&G.rest(run,'upgrade',i))) G.rest(run,'heal'); } }
  }
  return run;
}
module.exports={playRun};
if(require.main===module){
  WHO.forEach(w=>{ let win=0, fl=0, died={}; for(let i=0;i<N;i++){ const r=playRun(w,1000+i); if(r.win) win++; fl+=r.floor; if(!r.win){ const k=(r.battle&&r.battle.kind==='boss'?'boss:'+r.boss:(r.battle&&r.battle.kind))||'?'; const key=k.startsWith('boss')?k:k+'@'+r.floor; died[key]=(died[key]||0)+1; } }
    const top=Object.keys(died).sort((a,b)=>died[b]-died[a]).slice(0,5).map(k=>k+':'+died[k]).join(' ');
    console.log(w.padEnd(9),'勝率',(win/N*100).toFixed(1).padStart(5)+'%','平均第',(fl/N).toFixed(1),'層｜死在',top); });
}
