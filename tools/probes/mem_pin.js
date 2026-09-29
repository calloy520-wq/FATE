// 世界帳本釘選上限：釘滿就拒絕，釘住的每一條都真的送得出去
const P=require('./probe.js'); const {ctx,evalIn,sheets,run}=P;
let CAP=null, FB=null; ctx.__CAP__=o=>{CAP=o;}; ctx.__FB__=()=>JSON.stringify(FB);
evalIn('callGeminiAPI=function(p,s,c){ __CAP__({p:p,s:s,c:c}); return __FB__(); }');
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'女'}).pcId;
const ok=(c,m)=>console.log((c?'✅ ':'❌ ')+m);
const names=['琥珀咖啡','白樺書店','舊鐘塔','河堤長椅','夜市攤','溫室花房','月見坂'];
names.forEach((n,i)=>{FB={narration:'x',options:['a','b','c','d','e','f'],intimacy_feedback:{player:{},npcs:[]},world_note:[{kind:'地點',name:n,text:n+'是城裡第'+(i+1)+'個被記住的角落'}],cast:{join:[],leave:[]}};run({action:'play',pcId:kpc,acctName:'風音',message:'走走'});});
const cap=evalIn('worldSpec_("k_x").feedMax')-1;
let res=names.map(n=>run({action:'world',pcId:kpc,acctName:'風音',op:'pin',kind:'地點',entryName:n}));
const okN=res.filter(r=>r.success).length;
ok(okN===cap, '釘到上限 '+cap+' 條就停（成功 '+okN+' 條）');
ok(/最多釘/.test(res[cap].message||''), '超過時回一句說明');
FB={narration:'x',options:['a','b','c','d','e','f'],intimacy_feedback:{player:{},npcs:[]},world_note:[],cast:{join:[],leave:[]}};
run({action:'play',pcId:kpc,acctName:'風音',message:'嗯'});
const u=String(CAP.p); ok(names.slice(0,cap).every(n=>u.indexOf(n)>=0), '釘住的每一條都送進提示詞');
ok(run({action:'world',pcId:kpc,acctName:'風音',op:'pin',kind:'地點',entryName:names[0]}).success, '已釘的再按一次不被上限擋');
