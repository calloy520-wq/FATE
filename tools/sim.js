// 自動玩家：一次打很多局看勝率。用法：N=300 WHO=saber node tools/sim.js
const G=require('./game.js');
const N=+process.env.N||300, WHO=(process.env.WHO||'saber,archer').split(',');
function incoming(run){ const b=run.battle; let s=0; G.alive(b).forEach(e=>e.intent.fx.forEach(f=>{ if(f[0]==='atk') s+=G.intentDmg(run,e,f)*(f[2]||1); })); return s; }
function score(run,i){
  const b=run.battle, id=b.hand[i], c=G.card(id); if(c.cost>b.energy) return -1;
  const need=Math.max(0,incoming(run)-b.block); let s=0;
  c.fx.forEach(f=>{ const k=f[0],n=f[1];
    if(k==='dmg') s+=n+b.str+b.tstr; else if(k==='hits') s+=(n+b.str+b.tstr)*f[2]; else if(k==='all') s+=(n+b.str)*G.alive(b).length;
    else if(k==='block') s+=Math.min(n,need)*1.3; else if(k==='draw') s+=n*4; else if(k==='energy') s+=n*6;
    else if(k==='str'||k==='tstr') s+=n*3; else if(k==='vuln'||k==='weak') s+=n*3; else if(k==='heal') s+=run.hp<run.maxHp*0.6?n:0;
    else if(k==='proj') s+=n*4; else if(k==='thorns') s+=need?n:0; else if(k==='burst') s+=n*b.hand.filter(x=>x==='sword').length*G.alive(b).length;
    else if(k[0]==='p') s+=b.turn<=2?20:5; });
  if(id==='oath') s=20;
  return s/Math.max(0.5,c.cost);
}
function target(run){ const a=run.battle.enemies.map((e,i)=>[e,i]).filter(x=>x[0].hp>0); a.sort((x,y)=>x[0].hp-y[0].hp); return a[0][1]; }
function playTurn(run){
  const b=run.battle; let guard=0;
  while(run.screen==='battle'&&guard++<40){
    if(b.np>=100){ G.noble(run,target(run)); if(run.screen!=='battle') return; continue; }
    if(run.seals>0&&G.alive(b).some(e=>e.hp>40)&&b.turn===1&&(b.kind==='boss'||b.kind==='elite')){ G.seal(run,b.np>=60?'np':'all'); continue; }
    let best=-1,bs=0; b.hand.forEach((id,i)=>{ const s=score(run,i); if(s>bs){bs=s;best=i;} });
    if(best<0) break;
    const r=G.play(run,best,target(run)); if(!r.ok) break;
  }
  if(run.screen==='battle') G.endTurn(run);
}
function playRun(who,seed){
  const run=G.newRun(who,seed); let g=0;
  while(run.screen!=='over'&&g++<3000){
    if(run.screen==='map'){ const opts=G.reachable(run); const t=l=>run.map[run.floor][l];
      const pref=run.hp<run.maxHp*0.5?['rest','chest','fight','elite','boss']:run.hp>run.maxHp*0.75?['elite','chest','fight','rest','boss']:['chest','fight','rest','elite','boss'];
      let lane=opts[0], bi=99; opts.forEach(l=>{ const k=pref.indexOf(t(l)); if(k<bi){bi=k;lane=l;} }); G.go(run,lane); }
    else if(run.screen==='battle') playTurn(run);
    else if(run.screen==='reward'){ const cs=run.reward.cards; const k=cs.findIndex(x=>!/^(def|feint|healing)/.test(x)); G.takeReward(run,run.deck.length<22?k:-1); }
    else if(run.screen==='chest') G.takeChest(run);
    else if(run.screen==='rest'){ if(run.hp<run.maxHp*0.65) G.rest(run,'heal'); else { const i=run.deck.findIndex(x=>x.slice(-1)!=='+'&&x!=='atk'&&x!=='def'); if(!(i>=0&&G.rest(run,'upgrade',i))) G.rest(run,'heal'); } }
  }
  return run;
}
module.exports={playRun};
if(require.main===module){
  WHO.forEach(w=>{ let win=0, fl=0, died={}; for(let i=0;i<N;i++){ const r=playRun(w,1000+i); if(r.win) win++; fl+=r.floor; if(!r.win){ const k=(r.battle&&r.battle.kind)||'?'; died[k+'@'+r.floor]=(died[k+'@'+r.floor]||0)+1; } }
    const top=Object.keys(died).sort((a,b)=>died[b]-died[a]).slice(0,6).map(k=>k+':'+died[k]).join(' ');
    console.log(w.padEnd(7),'勝率',(win/N*100).toFixed(1)+'%','平均走到第',(fl/N).toFixed(1),'層｜死在',top); });
}
