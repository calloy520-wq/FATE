// 🔥 說書人開關：平常走便宜的那顆，按了才換敢寫的那顆。這顆鈕決定花多少錢，不該只靠肉眼。
const P=require('./probe.js'); const {ctx,evalIn,sheets,run}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,150):''));} };
let CAP=null; ctx.__CAP__=o=>{CAP=o;};
evalIn('callGeminiAPI=function(p,s,c){ __CAP__({p:p,s:s,c:c}); return JSON.stringify({narration:"x",npc_exit:[],options:["a","b","c","d"],intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:[]},world_note:[]}); }');
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'男'}).pcId;
const KAN=String(evalIn('KANSHOU_MODEL')), LEWD=String(evalIn('LEWD_MODEL')), SOLO=String(evalIn('AI_MODEL'));
const play=(extra)=>{ CAP=null; run(Object.assign({action:'play',pcId:kpc,acctName:'風音',message:'我說了一句話。'},extra||{})); return (CAP&&CAP.c)||{}; };

console.log('鑑賞平常='+KAN+'／點火='+LEWD+'／solo='+SOLO);
console.log('── ① 三顆模型是三顆不同的');
t(KAN!==LEWD,'平常那顆跟敢寫那顆不同（不然這顆鈕沒有意義）');
t(SOLO!==LEWD,'solo 跟敢寫那顆不同');

console.log('── ② 沒點火＝便宜的那顆');
const c0=play();
t(c0.model===KAN,'用 KANSHOU_MODEL', c0.model);
t(c0.isNsfwMode!==true,'沒點火時不掛 NSFW 旗標（失敗文案才不會叫玩家去按一顆他沒按的鈕）');

console.log('── ③ 點了＝敢寫的那顆');
const c1=play({drive:true});
t(c1.model===LEWD,'用 LEWD_MODEL', c1.model);
t(c1.isNsfwMode===true,'掛上 NSFW 旗標');

console.log('── ④ 字串 "true" 也算（前端送的是 JSON，布林可能被轉字串）');
t(play({drive:'true'}).model===LEWD,'drive:"true" 也切得過去');
t(play({drive:'false'}).model===KAN,'drive:"false" 維持便宜那顆');

console.log('── ⑤ 被擋下來的提示要叫得出那顆鈕');
const msg=String(evalIn('aiFallbackNarration_(true)'));
t(msg.indexOf('🔥')>=0,'審查擋下的文案有點名 🔥 這顆鈕', msg);
t(String(evalIn('aiFallbackNarration_(false)')).indexOf('🔥')<0,'一般連線失敗不提 🔥（那跟模型無關）');

console.log('');
console.log(bad?('❌ '+bad+' 條沒過（通過 '+ok+'）'):('✅ 全部 '+ok+' 條通過'));
process.exit(bad?1:0);
