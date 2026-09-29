// 🎬 背景場景：玩家要的「一個給 AI 隨時變動的背景版地點」。
//    它【不是】地點系統——沒有名單、沒有驗證、走不進去也帶不走人，就是一句話的布景。
//    ⚠ 借 COL.PC.LOC 欄存（只有玩家那一列），那一格在鑑賞已經空著。
const P=require('./probe.js'); const {ctx,evalIn,sheets,run,summonN}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,160):''));} };
let CAP=null, SCENE=""; ctx.__CAP__=o=>{CAP=o;}; ctx.__SCENE__=()=>SCENE;
evalIn('callGeminiAPI=function(p,s,c){ __CAP__({p:p,s:s}); return JSON.stringify({narration:"x",options:["a","b","c","d"],intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:[]},world_note:[],scene:__SCENE__()}); }');
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'女'}).pcId;
// 🌟 2026-09 起始住民整組取消（開局一片空白）——要人就得自己召喚。
summonN('風音', kpc, 2);
const d=sheets['鑑賞眾生']._d; const me=()=>d.find(x=>String(x[C.ID])===kpc);
const ids=d.filter((r,i)=>i>0&&String(r[C.ID])!==kpc&&String(r[C.FACTION])==='從者').slice(0,1).map(r=>String(r[C.ID]));
me()[C.MEMORY]=evalIn('kanshouSetParty_('+JSON.stringify(String(me()[C.MEMORY]||''))+','+JSON.stringify(ids)+')');
const play=m=>{ CAP=null; run({action:'play',pcId:kpc,acctName:'風音',message:m}); return String(CAP&&CAP.p||''); };
const sceneLine=u=>(u.split('\n').find(l=>l.indexOf('★【現在地點】')===0)||'');
const stored=()=>String(me()[C.LOC]||'').trim();

console.log('\n── ① 開場有一句布景當起點');
SCENE='';
t(stored()==='冬木市，我的房間','新局的開場布景是「冬木市，我的房間」（冬木只在開場出現一次）',stored());
t(/★【現在地點】：冬木市，我的房間。/.test(sceneLine(play('早安。'))),'第一回合就送得出去',sceneLine(play('嗨。')));

console.log('\n── ② AI 寫了就存下來，下一回合餵回去');
SCENE='河邊的長椅';
play('我們坐下來。');
t(stored()==='河邊的長椅','AI 寫的場景落地了',stored());
SCENE='河邊的長椅';
t(/★【現在地點】：河邊的長椅。/.test(sceneLine(play('風真舒服。'))),'下一回合餵得回去',sceneLine(play('嗯。')));

console.log('\n── ③ AI 隨時換得掉（這就是「隨時變動」的意思）');
SCENE='巷口的關東煮攤';
play('我們去吃點東西。');
t(stored()==='巷口的關東煮攤','換掉了',stored());

console.log('\n── ④ 它不是地點系統：不驗名單、不影響誰在場');
const before=JSON.parse(evalIn('JSON.stringify(kanshouGetParty_('+JSON.stringify(String(me()[C.MEMORY]||''))+'))'));
SCENE='世界盡頭的旋轉木馬';
const u=play('我們忽然到了一個怪地方。');
t(stored()==='世界盡頭的旋轉木馬','帳本裡查無此地也照樣成立（它只是布景）',stored());
const after=JSON.parse(evalIn('JSON.stringify(kanshouGetParty_('+JSON.stringify(String(me()[C.MEMORY]||''))+'))'));
t(JSON.stringify(before)===JSON.stringify(after),'換場景不會動到誰在場');
t(/【在場人物】/.test(String(CAP.s||'')),'在場的人還在（在場＝同行，跟場景無關）');

console.log('\n── ⑤ 邊界：超長、結構字元、空字串');
SCENE='×'.repeat(50);
play('好長。');
t(stored().length<=12,'限 12 字',stored().length+' 字');
SCENE='壞<b>【x】★字|元';
play('怪字元。');
t(!/[<>&"'`｜【】\[\]★]/.test(stored()),'結構字元剝乾淨',stored());
const keep=stored();
SCENE='';
play('沒提到地方。');
t(stored()===keep,'AI 這回合沒寫＝沿用上一個（不會被清空）',stored());

console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
