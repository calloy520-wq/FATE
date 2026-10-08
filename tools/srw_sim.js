// 戰棋自動對戰：自動玩家從第一關打到最後（每關最多重打 RETRY 次），看每關的勝率、回合數、等級、靈石
// 用法：N=50 node tools/srw_sim.js     VERBOSE=1 印每關細節     PREP=none 不強化
const T=require('./srw');
// PREP=none 完全不強化｜pp 只花悟道點｜（預設）全部強化
const PREP={none:{noUp:1,noPP:1},pp:{noUp:1}}[process.env.PREP]||{};
// 試數字：TUNE_HP=0.9 TUNE_ATK=-10 TUNE_HIT=-5（敵人整體）
if(process.env.TUNE_HP) T.TUNE.hp=+process.env.TUNE_HP; if(process.env.TUNE_ATK) T.TUNE.atk=+process.env.TUNE_ATK; if(process.env.TUNE_HIT) T.TUNE.hit=+process.env.TUNE_HIT;
const N=+process.env.N||30, RETRY=+(process.env.RETRY||3), MAXT=30, V=process.env.VERBOSE;
const st={}; T.STAGES.forEach(S=>st[S.id]={tries:0,wins:0,turns:0,downs:0,hit:0,hitN:0,ehit:0,ehitN:0,lv:0,lvN:0});
let full=0, totalTries=0;
function play(c){
  const b=T.startStage(c); let guard=0;
  while(!b.over && guard++<MAXT){
    T.autoPhase(c); if(b.over) break;
    T.endPlayerPhase(c); if(b.over) break;
    let plan;
    while((plan=T.enemyNext(c))){ T.enemyMove(c,plan); if(plan.target||plan.map){ const u=T.byUid(b,plan.uid), t=plan.target&&T.byUid(b,plan.target); const resp=t?T.bestResp(b,u,plan.wi,t):''; const sc=T.enemyAct(c,plan,resp); if(sc) sc.steps.forEach(s=>{ const A=T.byUid(b,s.a); if(A.side==='e'){st[b.stage].ehit+=s.hit?1:0;st[b.stage].ehitN++;} }); } if(b.over) break; }
    if(b.over) break; T.enemyDone(c);
  }
  if(!b.over) b.over='lose';
  return b;
}
for(let i=0;i<N;i++){
  const c=T.newCampaign(1000+i*7919); let ok=true;
  while(c.stage<T.STAGES.length){
    T.autoPrep(c, PREP); const S=T.curStage(c); let won=false;
    const hs=S.heroes.map(h=>c.heroes[h[0]].lv); st[S.id].lv+=hs.reduce((a,x)=>a+x,0)/hs.length; st[S.id].lvN++;
    for(let r=0;r<RETRY&&!won;r++){ const b=play(c); const s=st[S.id]; s.tries++; totalTries++; s.turns+=b.turn; s.downs+=b.downs; const res=T.finishStage(c); if(res.win){s.wins++;won=true;} T.toPrep(c); }
    if(!won){ ok=false; break; }
  }
  if(ok) full++;
  if(V&&i===0) console.log('等級',Object.keys(c.heroes).map(k=>k+':'+c.heroes[k].lv).join(' '),'靈石',c.gold);
}
console.log('關卡｜勝率｜平均回合｜平均倒下｜敵人命中率｜我方等級｜敵人等級');
T.STAGES.forEach(S=>{const s=st[S.id]; if(!s.tries) return; console.log(S.id.padEnd(4),S.n.padEnd(5,'　'),(100*s.wins/s.tries).toFixed(0).padStart(4)+'%',(s.turns/s.tries).toFixed(1).padStart(5),(s.downs/s.tries).toFixed(2).padStart(5),(s.ehitN?(100*s.ehit/s.ehitN).toFixed(0):'-').padStart(4)+'%',(s.lv/s.lvN).toFixed(1).padStart(5),String(Math.max(...S.foes.map(f=>f[1]))).padStart(4));});
console.log('全破（每關最多重打 '+RETRY+' 次）：'+(100*full/N).toFixed(0)+'%');
