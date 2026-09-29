// 🗡️ 本事＝觸發條目：不上卡；玩家提到相關的字才亮；單字 key 都在 ALLOW1。
const P=require('./probe.js'); const {ctx,evalIn,sheets,run}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,220):''));} };
let CAP=null; ctx.__CAP__=o=>{CAP=o;};
evalIn('callGeminiAPI=function(p,s,c){ __CAP__({p:p,s:s}); return JSON.stringify({narration:"x",options:["a","b","c","d","e","f"],intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:[]},world_note:[],scene:"",cast:{join:[],leave:[]}}); }');
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'女'}).pcId;
for (const id of ['阿爾托莉雅-Saber','吉爾伽美什-Archer','遠坂凜-Master']) { const r=run({action:'kanshou_summon_hero',acctName:'風音',pcId:kpc,heroId:id}); if(!r.success) throw new Error(id+' '+r.message); }
const play=m=>{ CAP=null; run({action:'play',pcId:kpc,acctName:'風音',message:m}); return { s:String(CAP&&CAP.s||''), u:String(CAP&&CAP.p||'') }; };
const lore=u=>(u.split('\n').find(l=>l.indexOf('★【這一步碰到的底細】')===0)||'');
let r=play('嗯。');
t(!/本事：/.test(r.s), '卡上沒有本事格', (r.s.match(/【在場人物】SABER[^\n]*/)||[''])[0].slice(0,100));
t(lore(r.u)==='', '沒提到什麼→沒有底細');
r=play('吉爾伽美什，你那個寶物庫裡有沒有開罐器？');
t(/吉爾伽美什：[^｜]*寶具「王之財寶」/.test(lore(r.u)), '「寶物庫」「有沒有」→ 金閃閃的王之財寶亮', lore(r.u));
t(!/SABER：/.test(lore(r.u)), 'SABER 沒被牽連', lore(r.u));
r=play('醬油沒了，誰去拿一下？');
t(!/本事「|寶具「/.test(lore(r.u)), '醬油→沒有任何本事亮', lore(r.u));
r=play('下午開車去新都好不好？');
t(/SABER：[^｜]*本事「騎乘」/.test(lore(r.u)), '「開車」→ SABER 的騎乘亮（fx 表查到）', lore(r.u));
r=play('哪家拉麵好吃？');
t(/SABER：[^｜]*本事「直感」/.test(lore(r.u)), '「好吃」「哪家」→ SABER 的直感亮', lore(r.u));
r=play('這把劍借我看看。');
t(/寶具「誓約勝利之劍」/.test(lore(r.u)) || /寶具「乖離劍」/.test(lore(r.u)), '「劍」→ 寶具亮（單字 key 在 ALLOW1）', lore(r.u));
// 王之財寶：技能欄與 NP 都有，條目只一條
const gilBook=JSON.parse(evalIn('JSON.stringify(loreEntriesFromSkills_(null))'));
t(Array.isArray(gilBook) && gilBook.length===0, '沒有種子列→空陣列');
const cnt=JSON.parse(evalIn('JSON.stringify((function(){ const d=getHeroCodexCached(); for (let i=1;i<d.length;i++) if(String(d[i][COL.HERO.ID])==="吉爾伽美什-Archer") return loreEntriesFromSkills_(d[i]); return []; })())'));
t(cnt.filter(e=>/王之財寶/.test(e.content)).length===1, '王之財寶（技能欄＋寶具欄）只有一條', JSON.stringify(cnt.map(e=>e.content)));
t(cnt.every(e=>e.content.length<=40 && !/[A-E][+]{0,3}級|（/.test(e.content)), '內容只有名字、≤40 字');
// 單字 key 全在 ALLOW1
const allow=JSON.parse(evalIn('JSON.stringify(KANSHOU_LORE_KEY_ALLOW1_)'));
const keys=JSON.parse(evalIn('JSON.stringify([].concat.apply([], Object.keys(LORE_FX_KEYS_).map(k=>LORE_FX_KEYS_[k])).concat([].concat.apply([], Object.keys(LORE_NP_KEYS_).map(k=>LORE_NP_KEYS_[k]))))'));
const badKeys=keys.filter(k=>k.length<2 && allow.indexOf(k)<0);
t(badKeys.length===0, 'fx／寶具關鍵字表的單字 key 都登記在 ALLOW1', badKeys.join(''));
t(!/會騎乘的人|有直感的人|卡上那個人的本事/.test(r.u) && /從那個人真正的本事來/.test(r.u), '世界線：例子沒了、不再指卡上那格');
console.log(bad ? '❌ '+bad+' 條失敗' : '✅ skillline.js '+ok+' 條全過');
