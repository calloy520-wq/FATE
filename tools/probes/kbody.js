// 🩸 肉體狀態不跨夜：AI 沒吐 physical_state 的回合不會覆寫它，不清就會一路跟著人走好幾天
const P=require('./probe.js'); const {ctx,evalIn,sheets,run,summonN}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,160):''));} };
// 🫂 2026-09 地點退休後在場＝同行：把某幾位加進玩家的同行清單（探針共用寫法）。
const joinParty=(meRow,ids)=>{ meRow[C.MEMORY]=evalIn('kanshouSetParty_('+JSON.stringify(String(meRow[C.MEMORY]||''))+','+JSON.stringify(ids.map(String))+')'); };
let CAP=null, FB=null; ctx.__CAP__=o=>{CAP=o;}; ctx.__FB__=()=>JSON.stringify(FB);
evalIn('callGeminiAPI=function(p,s,c){ __CAP__({p:p,s:s}); return __FB__(); }');
const base=(phys)=>({inner_monologue:"—",narration:"x",npc_exit:[],options:["a","b","c","d"],
  intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:phys?[{name:phys.n,physical_state:phys.s}]:[]},
  world_note:[],rel_changes:[]});
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'男'}).pcId;
// 🌟 2026-09 起始住民整組取消（開局一片空白）——要人就得自己召喚。
summonN('風音', kpc, 1);
const d=sheets['鑑賞眾生']._d; const me=()=>d.find(x=>String(x[C.ID])===kpc);
let her=null; for(let i=1;i<d.length;i++){ if(String(d[i][C.ID])===kpc) continue; if(!her){ d[i][C.BOND]=80; her=d[i]; } }
joinParty(me(),[String(her[C.ID])]);
const nm=String(her[C.NAME]);
const body=()=>{ try{ return JSON.parse(String(her[C.PHYSICAL]||'{}'))['狀態']||''; }catch(e){ return ''; } };
const play=(m)=>run({action:'play',pcId:kpc,acctName:'風音',message:m||'我們待在一起。'});

console.log('── ① AI 寫下肉體狀態');
FB=base({n:nm,s:'腿還在發軟'}); play();
t(body()==='腿還在發軟','她的肉體狀態寫下去了：'+body());
console.log('── ② 之後的回合 AI 沒再提，狀態應該留著（同一天內是對的）');
FB=base(null); play(); play();
t(body()==='腿還在發軟','同一天內沒被清掉（此刻的身體還是那樣）：'+body());
t(/腿還在發軟/.test(String(CAP.p||'')),'而且有送進提示詞');
console.log('── ③ 結束一天：睡一覺該回到如常');
// ⚠ 兩段式就寢：身邊有羈絆≥60 的人時，第一次按睡覺只會進「夜未眠」，第二次才真的結束一天。
FB=base(null); run({action:'play',pcId:kpc,acctName:'風音',endDay:true,message:'今天到此為止。'});
FB=base(null); run({action:'play',pcId:kpc,acctName:'風音',endDay:true,message:'真的睡了。'});
t(body()==='如常','跨夜後回到如常（不會一路跟著人走好幾天）：'+body());
FB=base(null); play();
t(!/腿還在發軟/.test(String(CAP.p||'')),'隔天的提示詞裡不再出現昨天的身體狀態');
console.log('── ④ 玩家自己也一樣');
const pb=()=>{ try{ return JSON.parse(String(me()[C.PHYSICAL]||'{}'))['狀態']||''; }catch(e){ return ''; } };
FB=Object.assign(base(null),{intimacy_feedback:{player:{physical_state:'指尖還在抖',appearance_extras:''},npcs:[]}});
play(); t(pb()==='指尖還在抖','玩家的也寫得下去：'+pb());
FB=base(null); run({action:'play',pcId:kpc,acctName:'風音',endDay:true,message:'睡了。'});
FB=base(null); run({action:'play',pcId:kpc,acctName:'風音',endDay:true,message:'真的睡了。'});
t(pb()==='如常','玩家的也跨夜歸位：'+pb());
console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
