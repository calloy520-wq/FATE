// 各 Boss 的難度：所有從者走到第 13 層時，打贏各 Boss 的比例。用法：N=60 node tools/bosses.js
const G=require('./game.js'); const {playRun}=require('./sim.js');
const N=+process.env.N||60, reach={}, win={};
G.ORDER.forEach(w=>{ for(let i=0;i<N;i++){ const r=playRun(w,3000+i); if(r.floor<13) continue; reach[r.boss]=(reach[r.boss]||0)+1; if(r.win) win[r.boss]=(win[r.boss]||0)+1; } });
G.BOSSES.forEach(k=>console.log(G.ENEMIES[k].name.padEnd(6,'　'),'打到',reach[k]||0,'次，贏',((win[k]||0)/(reach[k]||1)*100).toFixed(1)+'%'));
