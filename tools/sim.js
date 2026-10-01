// 自動玩家：一次打很多局看勝率。用法：N=300 WHO=saber,cu node tools/sim.js
// 出牌方式：每張能出的牌（和寶具）都先在複本上試打一次，看局面分數變多少，挑最好的；沒有會變好的就結束回合。
const G=require('./game.js');
const N=+process.env.N||300, WHO=(process.env.WHO||G.ORDER.join(',')).split(',');
const J=o=>JSON.parse(JSON.stringify(o));
const SECRET=process.env.SECRET!=='0';   // 有令咒時要不要進隱藏關（預設進）
const ENDLESS=process.env.ENDLESS==='1';   // 無盡模式：看平均走幾格
const AWAKEN=process.env.AWAKEN===undefined?-1:+process.env.AWAKEN;   // 靈基覺醒固定選 0 或 1（不給＝隨機）

// 敵人這回合預計打過來多少（被石化的不算）
function incoming(run){
  const b=run.battle; let hits=[];
  G.alive(b).forEach(e=>{ if(e.stun) return; e.intent.fx.forEach(f=>{ if(f[0]==='atk'||f[0]==='atkP') for(let h=0;h<(f[2]||1);h++) hits.push([G.intentDmg(run,e,f),f[0]==='atkP']); }); });
  return hits;
}
function expectedLoss(run){
  const b=run.battle; let block=b.block, evade=b.evade, minions=b.minions, loss=0;
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
  G.alive(b).forEach(e=>{ v-=e.hp+e.block*0.5+(e.lives||0)*e.maxHp*0.6; v+=e.poison*1.5+e.wound*3+e.petrify*2.5+(e.stun?18:0)+Math.min(e.weak,3)*2+Math.min(e.vuln,3)*3-Math.max(0,e.str)*3+Math.min(3,Math.max(0,-e.str))*1.5; });   // 敵人力量被壓低是好事，但不能好到讓自動玩家捨不得打倒它
  v-=G.alive(b).length*(6+Math.max(0,b.turn-8)*3);   // 戰鬥拖越久越想把敵人清掉（防止跟打不痛的敵人耗到天荒地老）
  const left=4; // 估計這場還要打幾回合
  v+=run.hp*1.5-expectedLoss(run)*1.6;
  const atks=b.hand.filter(id=>G.card(id).type==='atk').length;
  b.hand.forEach(id=>{ const c=G.card(id); if(c.type==='curse'){ v-=(c.hold||0)*2.5+(c.dull?2+2.5*atks:0)+(c.half?2+4*atks:0)+(c.tax?3*b.hand.length:0); return; } v+=c.token?(c.type==='atk'?5:3.5):2.5; });
  v+=Math.max(0,(b.swords||0)-1)*5;   // 投影劍疊成一張：多出來的每把也算
  v+=b.str*5+b.tstr*1.2+b.energy*4+b.np*0.35+b.minions*4+b.army*3.5+(b.attacks||0)*0.8+(b.mastery||0)*3+(b.chant||0)*2+(b.nextFree?4:0)+b.nextEnergy*4;
  v+=(b.pBlock*3+b.pDraw*6+b.pEnergy*9+b.pStr*6+b.pEvade*8+b.pTreasure*6+b.pMinion*7+b.pVenom*6+(b.pWeaponize||0)*6)*left/4;
  v+=b.ubw*12+b.projUp*6+b.thorns*0.5;
  // 改版後的資源：風、迴避反擊、各種每回合效果
  const hits=incoming(run).length;
  v+=b.wind*3+b.iaiUp*2+(hits&&b.evade?b.riposte*0.8:0);
  v+=b.kraken*3+b.pKraken*6*left/4;
  G.alive(b).forEach(e=>{ if(e.doom) v+=e.doom*3+(!G.ENEMIES[e.id].boss&&e.hp<=e.doom*4+8?6:0); }); v+=(b.pHaste||0)*6*left/4+(b.haste||0)*2+(b.reapNext?5:0);
  v+=(b.pWind*6+b.pEvadeStr*5+b.pPetrifyAll*8+b.pSkillBlock*5+b.pEnergyBlock*3+b.pStanceBlock*3+b.pRage*4)*left/4;
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
  if(b.np>=100&&!G.serv(run).np.none){ const S=G.serv(run); (G.needsTarget(S.np.fx)?tgs:[tgs[0]]).forEach(t=>{ const r=J(run); if(!G.noble(r,t).ok) return; const d=value(r)-base+5; if(d>bv){bv=d;best={k:'np',t};} }); }
  return best;
}
function playTurn(run){
  const b=run.battle; let guard=0;
  while(run.screen==='battle'&&guard++<40){
    if(run.seals>(SECRET&&run.act===2?1:0)&&b.turn===1&&(b.kind==='boss'||(b.kind==='elite'&&run.seals>1))&&G.alive(b).some(e=>e.hp>40)){ G.seal(run,b.np>=60&&!G.serv(run).np.none?'np':'all'); continue; }
    const a=bestAction(run); if(!a) break;
    const r=a.k==='np'?G.noble(run,a.t):G.play(run,a.i,a.t); if(!r.ok) break;
  }
  if(run.screen==='battle') G.endTurn(run);
}
// 選牌：每張牌在固定的測試局面裡試打一次的分數（快取）；能力牌同一張最多拿 2 張
const RATE={};
function rate(run0,id){
  const who=run0.who, k=who+'|'+id; if(RATE[k]!==undefined) return RATE[k];
  let tot=0;
  for(let s=1;s<=3;s++){
    const r=G.newRun(who,s); r.map[0].forEach(n=>{ if(n) n.t='fight'; }); G.go(r,G.reachable(r)[0]); const b=r.battle;
    b.enemies=[b.enemies[0]]; while(b.enemies.length<2) b.enemies.push(J(b.enemies[0]));
    b.enemies.forEach((e,i)=>{ e.key='d'+i; e.hp=e.maxHp=40; e.block=0; e.weak=0; e.intent={n:'測',fx:[['atk',9]]}; });
    b.hand=[id,'atk','def']; b.energy=3; b.np=0; b.turn=2;
    const base=value(r); const x=J(r); G.play(x,0,0); tot+=value(x)-base;
  }
  return RATE[k]=tot/3;
}
// 強化方向：三個裡面挑測試局面分數最高的（能力牌多給一點）
function bestUp(run,i){ const o=G.upgradeOptions(run,i); let b=o[0],bv=-1e9; o.forEach(v=>{ const c=G.card(v), x=rate(run,v)+(c.type==='power'?6:0)-(c.ex&&!G.card(run.deck[i]).ex?4:0); if(x>bv){bv=x;b=v;} }); return b; }
function pickReward(run){
  const cs=run.reward.cards; if(run.deck.length>=24) return -1;
  let best=-1, bv=4;
  cs.forEach((id,i)=>{ const c=G.card(id); if(c.type==='power'&&run.deck.filter(x=>x.replace('+','')===id.replace('+','')).length>=2) return;
    const v=rate(run,id)+(c.type==='power'?6:0); if(v>bv){bv=v;best=i;} });
  return best;
}
function playRun(who,seed){
  const run=G.newRun(who,seed,{endless:ENDLESS}); let g=0;
  while(run.screen!=='over'&&g++<(ENDLESS?30000:3000)){
    if(run.screen==='map'){ const opts=G.reachable(run); const t=l=>run.map[run.floor][l].t;
      const pref=run.hp<run.maxHp*0.5?['rest','chest','event','fight','elite','boss']:run.hp>run.maxHp*0.75?['elite','chest','event','fight','rest','boss']:['chest','event','fight','rest','elite','boss'];
      let lane=opts[0], bi=99; opts.forEach(l=>{ const k=pref.indexOf(t(l)); if(k<bi){bi=k;lane=l;} }); G.go(run,lane); }
    else if(run.screen==='battle') playTurn(run);
    else if(run.screen==='reward'){ if(run.reward.awaken) G.awaken(run,AWAKEN>=0?AWAKEN:(seed+run.floor)%2); G.takeReward(run,pickReward(run)); }
    else if(run.screen==='chest') G.takeChest(run);
    else if(run.screen==='boon') G.takeBoon(run,0);
    else if(run.screen==='event'){ const E=G.EVENTS[run.event];   // 不燒令咒、不扣最大生命、扣血後要留五成；都不行就選最後一個（通常是離開）
      const bad=o=>o.fx.some(f=>(f[0]==='seal'&&f[1]<0)||(f[0]==='maxHp'&&f[1]<0));
      let i=E.opts.findIndex(o=>G.canChoose(run,o)&&!bad(o)&&!(o.need&&o.need.hp&&run.hp-o.need.hp<run.maxHp*0.5)); if(i<0) i=E.opts.length-1; G.choose(run,i); }
    else if(run.screen==='pick'){ const kind=run.pending[0]; let i=(kind==='remove'||kind==='transform')?(run.deck.findIndex(G.isCurse)>=0?run.deck.findIndex(G.isCurse):run.deck.findIndex(x=>G.isBasic(x))):run.deck.findIndex(x=>G.canUpgrade(x)&&!G.isBasic(x)); if(i<0) i=run.deck.findIndex(x=>G.canUpgrade(x)); G.pickCard(run,i,i>=0&&kind==='upgrade'?bestUp(run,i):undefined); }
    else if(run.screen==='secret') G.secret(run,SECRET);
    else if(run.screen==='shop'){ const S=run.shop; let bought=false;
      if(!S.removed&&run.gold>=G.removePrice(run)){ const c=run.deck.findIndex(G.isCurse), i=c>=0?c:run.deck.findIndex(x=>G.isBasic(x)); if(i>=0&&G.buy(run,'remove',i).ok) bought=true; }
      if(!bought){ const cs=S.cards.map((c,i)=>[c,i]).filter(([c])=>!c.sold&&c.price<=run.gold).sort((a,b)=>rate(run,b[0].id)-rate(run,a[0].id)); if(cs.length&&rate(run,cs[0][0].id)>4&&run.deck.length<24&&G.buy(run,'card',cs[0][1]).ok) bought=true; }
      if(!bought&&S.relic&&!S.relic.sold&&run.gold>=S.relic.price&&G.buy(run,'relic').ok) bought=true;
      if(!bought) G.leaveShop(run); }
    else if(run.screen==='rest'){ if(run.hp<run.maxHp*0.65) G.rest(run,'heal'); else { const i=run.deck.findIndex(x=>G.canUpgrade(x)&&!G.isBasic(x)); if(!(i>=0&&G.rest(run,'upgrade',i,bestUp(run,i)))) G.rest(run,'heal'); } }
  }
  return run;
}
module.exports={playRun};
if(require.main===module&&ENDLESS){
  WHO.forEach(w=>{ const fl=[]; for(let i=0;i<N;i++){ const r=playRun(w,1000+i); fl.push(r.stats.floors); } fl.sort((a,b)=>a-b);
    const avg=fl.reduce((a,b)=>a+b,0)/N, deep=fl.filter(x=>x>24).length;
    console.log(w.padEnd(9),'無盡 平均',avg.toFixed(1).padStart(5),'格｜中位',String(fl[N>>1]).padStart(3),'｜最遠',String(fl[N-1]).padStart(3),'｜進到無盡層',(deep/N*100).toFixed(0).padStart(3)+'%'); });
} else if(require.main===module){
  WHO.forEach(w=>{ let win=0, act1=0, hidden=0, died={}; for(let i=0;i<N;i++){ const r=playRun(w,1000+i); if(r.win||r.act>=2) act1++; if(r.win||r.act===3) win++; if(r.trueEnd) hidden++;
      if(!r.win){ const k=(r.battle&&r.battle.kind==='boss'?'boss:'+r.boss:(r.battle&&r.battle.kind))||'?'; const key=k.startsWith('boss')?k:r.act+'章'+k+'@'+r.floor; died[key]=(died[key]||0)+1; } }
    const top=Object.keys(died).sort((a,b)=>died[b]-died[a]).slice(0,5).map(k=>k+':'+died[k]).join(' ');
    const pc=x=>(x/N*100).toFixed(0).padStart(3)+'%';
    console.log(w.padEnd(9),'過第一章',pc(act1),'｜通關',pc(win),'｜隱藏關',pc(hidden),'｜死在',top); });
}
