// 🃏 鑑賞左欄從者卡：場景（借 LOC 存）被 AI 換掉之後，卡片還在不在。
//    2026-09 地點退休前，buildTagsPayload_ 用「同地點」篩鑑賞從者；退休後 LOC 變成 AI 每回合寫的布景，
//    同伴那格是召喚當下的快照，一換場景就對不上 → 整欄卡片消失（零錯誤訊息）。
const P=require('./probe.js'); const {ctx,evalIn,sheets,run,summonN}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,160):''));} };
let SCENE=""; ctx.__SCENE__=()=>SCENE;
evalIn('callGeminiAPI=function(p,s,c){ return JSON.stringify({narration:"x",options:["a","b","c","d","e","f"],intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:[]},world_note:[],scene:__SCENE__()}); }');
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'女'}).pcId;
summonN('風音', kpc, 2);
const d=sheets['鑑賞眾生']._d; const me=()=>d.find(x=>String(x[C.ID])===kpc);
const cards=()=>{ const r=run({action:'sync',pcId:kpc,acctName:'風音'}); return ((r.tags||{}).servants||[]).map(s=>s.name); };
const play=m=>run({action:'play',pcId:kpc,acctName:'風音',message:m});

console.log('\n── ① 剛召喚：兩張卡');
t(cards().length===2,'sync 帶回 2 位同伴',cards());

console.log('\n── ② AI 換了場景之後');
SCENE='河邊的長椅'; play('我們坐下來。');
t(String(me()[C.LOC]).trim()==='河邊的長椅','場景已換',me()[C.LOC]);
t(cards().length===2,'卡片沒有因為換場景消失',cards());

console.log('\n── ③ 解散一位（不再同行）仍是這座城的住民 → 卡還在、party 旗標翻掉');
const ids=d.filter((r,i)=>i>0&&String(r[C.ID])!==kpc&&String(r[C.FACTION])==='從者').map(r=>String(r[C.ID]));
me()[C.MEMORY]=evalIn('kanshouSetParty_('+JSON.stringify(String(me()[C.MEMORY]||''))+','+JSON.stringify(ids.slice(0,1))+')');
const r3=run({action:'sync',pcId:kpc,acctName:'風音'}); const sv3=(r3.tags||{}).servants||[];
t(sv3.length===2,'兩張卡都在',sv3.map(s=>s.name));
t(sv3.filter(s=>s.party).length===1,'只有一位標成同行',sv3.map(s=>s.name+':'+s.party));

console.log('\n── ④ 別局的人不會混進來');
const kpc2=run({action:'enter_kanshou',acctName:'月見',pcName:'月見',pcSex:'女'}).pcId;
sheets['帳號']._d.push(['月見','','2026-09-15','']);
t(run({action:'sync',pcId:kpc2,acctName:'月見'}).tags.servants.length===0,'新局是空的');
t(cards().length===2,'原局照舊 2 張');

console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
