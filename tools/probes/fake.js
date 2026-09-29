// 🎭 「不召喚，直接哄騙 AI 掰一個 SABER 出來」會怎樣（玩家實測提問）。
//    ①cast.join 騙不了（沒那一列就沒 id）②寫成常民可以（記得住、不追蹤）
//    ③🐛 之後真的召喚她＝同一個名字兩份（在場卡＋常民條目）——這一支就是釘這個。
const P=require('./probe.js'); const {ctx,evalIn,sheets,run}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
const HC=JSON.parse(evalIn('JSON.stringify(COL.HERO)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,150):''));} };
let CAP=null, NOTES=[], CAST={join:[],leave:[]};
ctx.__CAP__=o=>{CAP=o;}; ctx.__NOTES__=()=>{const n=NOTES;NOTES=[];return n;}; ctx.__CAST__=()=>CAST;
evalIn('callGeminiAPI=function(p,s,c){ __CAP__({p:p,s:s}); return JSON.stringify({narration:"x",options:["a","b","c","d"],intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:[]},world_note:__NOTES__(),cast:__CAST__()}); }');
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'女'}).pcId;
const d=sheets['鑑賞眾生']._d; const me=()=>d.find(x=>String(x[C.ID])===kpc);
const gid=String(me()[C.GAME_ID]);
const allies=()=>d.slice(1).filter(x=>String(x[C.GAME_ID])===gid&&String(x[C.ID])!==kpc);
const play=m=>{ CAP=null; run({action:'play',pcId:kpc,acctName:'風音',message:m}); return String(CAP&&CAP.p||'')+'\n'+String(CAP&&CAP.s||''); };
const sab=sheets['英靈殿']._d.slice(1).find(h=>/SABER|阿爾托莉雅/.test(String(h[HC.NAME])));
const NAME='SABER';

console.log('\n── ① cast.join 騙不了：沒有那一列就沒有 id');
CAST={join:[NAME],leave:[]}; play('SABER 走了過來。'); CAST={join:[],leave:[]};
let u=play('嗨。');
t(allies().length===0,'沒有生出正式同伴');
t(!/【在場人物】/.test(u),'沒有生出在場卡');
t(JSON.parse(evalIn('JSON.stringify(kanshouGetOnstage_('+JSON.stringify(String(me()[C.MEMORY]||''))+'))')).length===0,'臨時在場那一格是空的');

console.log('\n── ② 寫成常民可以：記得住，但不追蹤關係');
NOTES=[{kind:'人物',name:NAME,text:'金髮碧眼的少女，住在附近。',sex:'女'}];
play('她自我介紹了。'); NOTES=[];
u=play('再跟'+NAME+'聊聊。');   // 帳本 2026-09-23 起提到才餵
t(/SABER【性別:女】/.test(u),'成為常民，提到她就餵得回來');
t(allies().length===0,'但她【不是】正式同伴（沒有卡、不追蹤好感）');

console.log('\n── ③ 🐛 之後真的召喚她：不可以變成兩份');
const sm=run({action:'kanshou_summon_hero',pcId:kpc,acctName:'風音',heroId:String(sab[HC.ID])});
t(sm.success,'召喚成功：'+(sm.added||sm.message));
u=play('妳好。');
const card=(u.match(/【在場人物】SABER/g)||[]).length;
const lore=(u.match(/SABER【性別/g)||[]).length;
t(card===1,'有一張在場卡（升格成正式同伴）',String(card));
t(lore===0,'常民那一條不見了——同一個名字不會兩份',String(lore));
const still=evalIn('JSON.stringify(worldRead_('+JSON.stringify(gid)+').filter(function(r){return r.kind==="人物"&&r.name==="SABER";}).length)');
t(String(still)==='0','帳本裡那一列也真的清掉了（不是只有不餵）',String(still));

console.log('\n── ④ 第二道：舊存檔裡已經重複的，餵回去時也濾掉');
evalIn('worldWrite_('+JSON.stringify(gid)+',[{kind:"人物",name:"SABER",text:"又被寫了一次。",sex:"女"}],1)');
u=play('再看一次。');
t((u.match(/SABER【性別/g)||[]).length===0,'跟正式同伴同名的常民一律不餵');

console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
