// 各魔王的難度：所有角色打到各章魔王時，打贏的比例。用法：N=60 node tools/bosses.js
// 第一章魔王＝run.bosses[0]、第二章＝run.bosses[1]、隱藏關＝魘（id xinmo）（地圖一章 12 列，第 12 列是魔王）
const G=require('./game.js'); const {playRun}=require('./sim.js');
const N=+process.env.N||60, reach={}, win={};
const add=(k,w)=>{ reach[k]=(reach[k]||0)+1; if(w) win[k]=(win[k]||0)+1; };
G.ORDER.forEach(w=>{ for(let i=0;i<N;i++){ const r=playRun(w,3000+i), past=a=>r.act>a||r.win;
  if(past(1)||(r.act===1&&r.floor>=12)) add(r.bosses[0],past(1));
  if(past(2)||(r.act===2&&r.floor>=12)) add(r.bosses[1],r.win||r.act===3);
  if(r.act===3&&r.floor>=3) add('xinmo',!!r.trueEnd); } });
G.BOSSES.forEach(k=>console.log(G.ENEMIES[k].name.padEnd(6,'　'),'打到',String(reach[k]||0).padStart(4),'次，贏',((win[k]||0)/(reach[k]||1)*100).toFixed(1)+'%'));
