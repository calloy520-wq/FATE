// 自創英靈的平衡：隨機抽很多種「傳說×副修×職階×寶具」組合，各打幾局，看勝率分布。用法：K=80 N=20 node tools/custom_sim.js
const G=require('./game.js'); const {playRun}=require('./sim.js');
const K=+process.env.K||80, N=+process.env.N||20;
let seed=77; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; }; const pick=a=>a[Math.floor(rnd()*a.length)];
const res=[], byLegend={}, bySub={};
for(let k=0;k<K;k++){
  const legend=pick(G.ORDER); let sub=pick(G.ORDER); while(sub===legend) sub=pick(G.ORDER);
  const cls=pick(Object.keys(G.CLASSES)), npFrom=rnd()<0.5?legend:sub;
  const C=G.makeCustom({name:'測試',cls,legend,sub,npFrom});
  let w=0; for(let i=0;i<N;i++){ if(playRun('custom',9000+k*100+i,C).win) w++; }
  const r=w/N; res.push([r,legend+'+'+sub+'／'+cls+'／寶具:'+npFrom]);
  (byLegend[legend]=byLegend[legend]||[]).push(r); (bySub[sub]=bySub[sub]||[]).push(r);
}
res.sort((a,b)=>a[0]-b[0]);
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
console.log('平均勝率',(avg(res.map(x=>x[0]))*100).toFixed(1)+'%');
console.log('最弱',res.slice(0,5).map(x=>(x[0]*100).toFixed(0)+'% '+x[1]).join('｜'));
console.log('最強',res.slice(-5).map(x=>(x[0]*100).toFixed(0)+'% '+x[1]).join('｜'));
console.log('依傳說',G.ORDER.filter(k=>byLegend[k]).map(k=>k+' '+(avg(byLegend[k])*100).toFixed(0)).join(' '));
console.log('依副修',G.ORDER.filter(k=>bySub[k]).map(k=>k+' '+(avg(bySub[k])*100).toFixed(0)).join(' '));
