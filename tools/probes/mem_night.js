// 時間鈕被改寫時，歷史存的是真正發生的事
const P=require('./probe.js'); const {ctx,evalIn,sheets,run}=P;
evalIn('callGeminiAPI=function(p,s,c){ return JSON.stringify({narration:"夜很長。",options:["a","b","c","d","e","f"],intimacy_feedback:{player:{},npcs:[]},world_note:[],cast:{join:[],leave:[]}}); }');
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'女'}).pcId;
run({action:'kanshou_summon_hero',acctName:'風音',pcId:kpc,heroId:'遠坂凜-Master'});
run({action:'play',pcId:kpc,acctName:'風音',message:'結束這一天',endDay:true});
const rows=sheets['歷史暫存']._d.filter(r=>String(r[1])===kpc);
const mine=rows.filter(r=>r[2]==='player').pop();
const ok=(c,m)=>console.log((c?'✅ ':'❌ ')+m);
ok(mine && /^（夜深了/.test(mine[3]), '夜未眠那一回合存的是「夜深了…」（'+(mine&&mine[3]||'').slice(0,20)+'）');
run({action:'play',pcId:kpc,acctName:'風音',message:'晚安'});
const m2=sheets['歷史暫存']._d.filter(r=>String(r[1])===kpc&&r[2]==='player').pop();
ok(m2 && m2[3]==='晚安', '一般對話照原話存');
