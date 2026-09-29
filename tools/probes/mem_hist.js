// 回鍋玩家：自己的歷史被別人擠出最近 1000 列，也讀得回來
const P=require('./probe.js'); const {evalIn,sheets}=P;
const ok=(c,m)=>console.log((c?'✅ ':'❌ ')+m);
const sh=sheets['歷史暫存']; if(!sh){console.log('❌ 沒有歷史暫存表');process.exit(1);}
for(let i=0;i<6;i++) sh._d.push([new Date(),'ME',i%2?'ai':'player','我的第'+i+'則']);
for(let i=0;i<1300;i++) sh._d.push([new Date(),'P'+(i%40),'player','別人'+i]);
const h=JSON.parse(evalIn('JSON.stringify(getGameHistoryBatchRaw("ME",4))'));
ok(h.length===4 && h[3].content==='我的第5則' && h[0].content==='我的第2則', '擠出 1000 列之外的最後 4 則照順序讀回來（'+h.map(x=>x.content).join('/')+'）');
sh._d.push([new Date(),'ME','player','最新']);
const h2=JSON.parse(evalIn('JSON.stringify(getGameHistoryBatchRaw("ME",4))'));
ok(h2.length===4 && h2[3].content==='最新' && h2[2].content==='我的第5則', '新舊兩段接得起來');
