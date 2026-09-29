// ⚔️ 新聖杯戰爭：2026-09 整體稽核抓到的洞，一條一條釘住。
const P=require('./probe.js'); const {ctx,evalIn,sheets}=P;
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,300):''));} };
const E=c=>evalIn(c), J=c=>JSON.parse(evalIn('JSON.stringify('+c+')'));
const run=u=>JSON.parse(evalIn('handleGameAction('+JSON.stringify(JSON.stringify(u))+')'));
let HOOK=null; ctx.__FX__=(p)=>{ if(HOOK) HOOK(p); return '說書。'; };
evalIn('callGeminiAPI=function(p,s,c){ return __FX__(p); }');
const row=a=>sheets['聖杯戰局']._d.find(x=>x[0]===a);
evalIn(`var __o = warSeedCtx_('5th'); __o.name='測'; __o.sex='男'; __o.seed=5; __o.pool=warSetup_('chaos').pool.filter(function(s){return s.id==='阿爾托莉雅-Saber';});
function __battle(fx, intent, ctxName){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); warAct_(s,{t:'rest'}); var e=s.enemies[0]; e.intel=1; e.fx=fx||[]; e.skn={}; (fx||[]).forEach(function(f){ e.skn[f]=f==='stealth'?'氣息遮斷':f; });
  var ev=[]; warStartBattle_(s,e,ctxName||'sortie',ev); s.battle.intent=intent||'strike'; s.battle.tele=''; return s; }`);

console.log('\n── ① 重新召喚真的換人');
run({action:'war_new',acctName:'重抽',pcName:'測',sex:'男',war:'5th'});
const s0=JSON.parse(row('重抽')[3]);
let r=run({action:'war_act',acctName:'重抽',act:{t:'reroll'}});
const s1=JSON.parse(row('重抽')[3]);
t(r.success && s1.sv.hero!==s0.sv.hero && s1.rerolls===0, '重新召喚：換成另一位、次數用掉', JSON.stringify([s0.sv.hero,s1.sv.hero,s1.rerolls]));
t(s1.enemies.every(e=>e.hero!==s1.sv.hero), '新從者不會同時出現在敵方');
t(r.log[0].txt.indexOf(s1.sv.name)>=0, '事件念的是新的那一位', r.log[0].txt);
t(!E(`warAct_(warNewGame_(warSeedCtx_('5th')),{t:'reroll'}).ok`), '引擎沒拿到名冊就不假裝重抽');

console.log('\n── ② 只認真的發生了的事');
let x=J(`(function(){ var s=__battle([], 'np'); var e=warFoe_(s,s.battle.e); var r=warAct_(s,{t:'stance',s:'retreat',seal:true}); return {intel:e.intel, ev:r.ev.map(function(v){return v.k;}), seals:s.master.seals}; })()`);
t(x.intel===1 && x.ev.indexOf('reveal')<0 && x.ev.indexOf('np')<0, '令咒撤退成功、對方寶具沒放出來 → 不會「看見那道寶具」認出真名', JSON.stringify(x));
t(x.seals===2, '撤退用的令咒照扣', x.seals);
x=J(`(function(){ for(var i=0;i<60;i++){ var s=__battle([], 'retreat'); var e=warFoe_(s,s.battle.e); e.spd=99; s.sv.spd=0; var r=warAct_(s,{t:'stance',s:'np',seal:true});
  if(r.ev.some(function(v){return v.k==='retreat'&&v.side==='foe'&&/撤退成功/.test(v.txt);})) return {exposed:s.exposed, cd:s.sv.cd, np:s.stats.np, seals:s.master.seals, sealEv:r.ev.some(function(v){return v.k==='seal';})}; } return null; })()`);
t(x && x.exposed===false && x.cd===0 && x.np===0, '對方先撤走、我的寶具沒放出去 → 真名沒曝光、魔力沒用掉', JSON.stringify(x));
t(x && x.seals===3 && !x.sealEv, '那一劃令咒也沒燒掉', JSON.stringify(x));
x=J(`(function(){ for(var i=0;i<60;i++){ var s=__battle([], 'retreat'); var e=warFoe_(s,s.battle.e); e.spd=99; s.sv.spd=0; var r=warAct_(s,{t:'stance',s:'probe'});
  if(r.ev.some(function(v){return v.k==='retreat'&&v.side==='foe'&&/撤退成功/.test(v.txt);})) return {intel:e.intel}; } return null; })()`);
t(x && x.intel===1, '對方先撤走、試探沒打到 → 沒看穿真名', JSON.stringify(x));
x=J(`(function(){ var s=__battle([], 'strike'); s.sv.spd=99; var r=warAct_(s,{t:'stance',s:'strike',seal:true}); return {first:r.ev[0].k, seals:s.master.seals}; })()`);
t(x.first==='seal' && x.seals===2, '真的用上的令咒：照扣、「令咒亮了起來」排在這一回合最前面', JSON.stringify(x));

console.log('\n── ③ 敵人的技能跟你的一樣生效');
x=J(`(function(){ var s=__battle(['stealth'], 'strike', 'defend'); s.sv.spd=99; var r=warAct_(s,{t:'stance',s:'strike'}); return r.ev.map(function(v){return v.side+':'+v.txt;}); })()`);
t(/^foe:.*「氣息遮斷」奇襲/.test(x[0]), '帶氣息遮斷的敵人摸上門：它先手、必中', JSON.stringify(x.slice(0,2)));
const dmg=fx=>J(`(function(){ var s=__battle(${JSON.stringify(fx)}, 'none'); s.rs=777; var e=warFoe_(s,s.battle.e); e.hp=e.mhp=99999; var h=e.hp; warAct_(s,{t:'stance',s:'strike',seal:true}); return h-e.hp; })()`);
const d0=dmg([]), d1=dmg(['territory']);
t(d1<d0 && Math.abs(d1/d0-E('WAR_SKILL_.territory.homeTaken'))<0.05, '闖進有陣地作成的敵人家：它的「守家受傷更少」生效', JSON.stringify([d0,d1]));

console.log('\n── ④ 說書寫回自己那一列（期間別人刪列也不會寫錯人）');
run({action:'war_new',acctName:'上面的人',pcName:'甲',sex:'男',war:'5th'});
run({action:'war_new',acctName:'下面的人',pcName:'乙',sex:'男',war:'5th'});
run({action:'war_new',acctName:'再下面',pcName:'丙',sex:'男',war:'5th'});
const before=row('再下面')[4];
HOOK=()=>{ HOOK=null; run({action:'war_quit',acctName:'上面的人'}); };
r=run({action:'war_narrate',acctName:'下面的人'});
t(r.success && JSON.parse(row('下面的人')[4]).hist.length===1, '說書途中上面有人放棄 → 仍寫進自己那一列', row('下面的人')[4]);
t(row('再下面')[4]===before, '底下那一列沒被蓋掉', row('再下面')[4]);
HOOK=()=>{ HOOK=null; run({action:'war_new',acctName:'下面的人',pcName:'乙2',sex:'男',war:'5th'}); };
run({action:'war_act',acctName:'下面的人',act:{t:'start'}});
r=run({action:'war_narrate',acctName:'下面的人'});
t(JSON.parse(row('下面的人')[4]).hist.length===0, '說書途中開了新局 → 舊局的說書不寫進新局', row('下面的人')[4]);

console.log('\n── ⑤ 決戰：打倒一位之後，說書的【對手】還是剛剛那一位');
run({action:'war_new',acctName:'決戰',pcName:'丁',sex:'男',war:'5th',heroId:'伊斯坎達爾-Rider'});
let st=JSON.parse(row('決戰')[3]); st.phase='night'; st.day=14; let k=0; st.enemies.forEach(e=>{ if(e.arrive<=14&&k<2){ k++; e.alive=true; } else e.alive=false; }); st.sv.atk=99; st.sv.hp=st.sv.mhp=9999; row('決戰')[3]=JSON.stringify(st);
run({action:'war_act',acctName:'決戰',act:{t:'final'}});
st=JSON.parse(row('決戰')[3]); const first=st.enemies.find(e=>e.id===st.battle.e); first.hp=1; st.battle.intent='strike'; row('決戰')[3]=JSON.stringify(st);
let P2=''; HOOK=p=>{ P2=p; };
r=run({action:'war_act',acctName:'決戰',act:{t:'stance',s:'strike',seal:true}});
run({action:'war_narrate',acctName:'決戰'}); HOOK=null;
const lab=first.intel>=2?first.name:first.cls;
const nextLine=evalIn('warFinal_('+JSON.stringify(st)+').next');   // 下一位上場那句跟著這場（與路線）走
t(P2.indexOf(nextLine)>=0 && (P2.match(/【對手】[^\n]*/)||[''])[0].indexOf(lab)>=0, '【對手】寫的是被打倒的那一位（下一位在事件裡）', (P2.match(/【對手】[^\n]*/)||[''])[0]);

console.log('\n── ⑥ 說書不鎖按鈕：連按不漏戲、在講的不重講、沒寫出來的併進下一段');
const B2='連按';
run({action:'war_new',acctName:B2,pcName:'快',sex:'男',war:'5th',heroId:'伊斯坎達爾-Rider'});
run({action:'war_narrate',acctName:B2});
run({action:'war_act',acctName:B2,act:{t:'start'}});          // 這一步沒叫說書
run({action:'war_act',acctName:B2,act:{t:'rest'}});           // 下一步：開戰那段要併進來
let sn=JSON.parse(row(B2)[3]).narr;
t(sn.facts.some(f=>/聖杯戰爭開始/.test(f)) && sn.facts.some(f=>/休養/.test(f)) && sn.kind==='start', '沒被說書接走的上一段併進這一段（種類取較重的「開戰」）', JSON.stringify(sn));
let P3=''; HOOK=p=>{ P3=p; HOOK=null; run({action:'war_act',acctName:B2,act:{t:'hold'}}); };   // 說書寫到一半，玩家又按了一步
run({action:'war_narrate',acctName:B2});
sn=JSON.parse(row(B2)[3]).narr;
t(/休養/.test(P3) && !sn.facts.some(f=>/休養/.test(f)), '正在講的那段，下一步不會再併一次（不重講）', JSON.stringify(sn.facts));
const nb=JSON.parse(row(B2)[4]);
t(!nb.inflight && nb.hist.length>=1, '講完把「正在講」的記號收掉', row(B2)[4]);
ctx.__FX__=()=>'';  // AI 沒回
r=run({action:'war_narrate',acctName:B2});
t(r.success && r.text==='', '沒寫出來 → 回空字串，不塞罐頭句', JSON.stringify(r));
const factsBefore=JSON.parse(row(B2)[3]).narr.facts.slice();
ctx.__FX__=(p)=>{ if(HOOK) HOOK(p); return '說書。'; };
const stNow=JSON.parse(row(B2)[3]);
const nextAct=stNow.phase==='battle'?{t:'stance',s:'strike'}:(stNow.phase==='day'?{t:'rest'}:{t:'hold'});
run({action:'war_act',acctName:B2,act:nextAct});
sn=JSON.parse(row(B2)[3]).narr;
t(factsBefore.every(f=>sn.facts.indexOf(f)>=0), '沒寫出來的那段事實併進下一段', JSON.stringify(sn.facts));
t(sn.facts.length<=E('WAR_NARR_FACTS_MAX_'), '併起來有上限');

console.log('\n── ⑦ 教會討伐令');
const bo=J(`(function(){ var s=__battle([], 'strike'); s.battle=null; s.phase='night'; s.day=WAR_.BOUNTY_DAY-1; var ev=[]; warMorning_(s, ev);
  var t=warFoe_(s, s.bounty && s.bounty.id); return {b:s.bounty, cls:t&&t.cls, intel:t&&t.intel, ev:ev.map(function(x){return x.k+':'+x.txt;}), card:t?warFoeCard_(s,t):null, btn:(s.phase='night', warButtons_(s).filter(function(x){return x.id===(t&&t.id);}).map(function(x){return x.sub;})[0])}; })()`);
t(bo.b && bo.b.open && bo.cls==='Caster' && bo.intel>=1, '第 '+E('WAR_.BOUNTY_DAY')+' 天早上發討伐令：目標是 Caster、位置公開', JSON.stringify(bo));
t(bo.ev.some(x=>/^bounty:教會發出討伐令/.test(x)) && bo.card.bounty===true && /討伐令/.test(bo.btn||''), '事件、情報卡、突襲鈕都標得出來', JSON.stringify([bo.card,bo.btn]));
const claim=J(`(function(){ var s=__battle([], 'strike'); var e=warFoe_(s,s.battle.e); s.bounty={id:e.id,open:true}; e.hp=1; s.sv.spd=99; var seals=s.master.seals; var r=warAct_(s,{t:'stance',s:'strike',seal:true}); return {seals0:seals, seals:s.master.seals, open:s.bounty.open, got:s.stats.bounty, ev:r.ev.map(function(x){return x.k;}), good:(s.phase==='over'?warDebrief_(s).good:[])}; })()`);
t(claim.seals===claim.seals0 && claim.got===1 && claim.open===false && claim.ev.indexOf('bounty')>=0, '親手打倒目標：多一劃令咒（抵掉這回合用掉的那劃）', JSON.stringify(claim));
const lost=J(`(function(){ var s=__battle([], 'strike'); s.battle=null; var a=s.enemies[0], b=s.enemies[1]; s.bounty={id:a.id,open:true}; a.hp=1; b.atk=99; b.spd=99; a.spd=0; var ev=[]; for(var i=0;i<5&&a.alive;i++) warAutoBattle_(s,a,b,ev); return {open:s.bounty.open, seals:s.master.seals, ev:ev.map(function(x){return x.txt;})}; })()`);
t(lost.open===false && lost.seals===3 && lost.ev.some(x=>/討伐令撤銷/.test(x)), '目標被別人打倒：討伐令撤銷、不給令咒', JSON.stringify(lost));
const none=J(`(function(){ var s=__battle([], 'strike'); s.enemies.forEach(function(e){ if(e.cls==='Caster') e.alive=false; }); s.battle=null; s.phase='night'; s.day=WAR_.BOUNTY_DAY-1; var ev=[]; warMorning_(s,ev); return {b:s.bounty, ev:ev.filter(function(x){return x.k==='bounty';}).length}; })()`);
t(none.b && none.b.open===false && none.ev===0, '目標不在場就不發（也不會之後再發）', JSON.stringify(none));

console.log('\n── ⑧ 原作技能補進戰爭（Caster 們不再是空殼）');
const med=J(`(function(){ var m=warSetup_('chaos').pool.filter(function(s){return s.id==='美狄亞-Caster';})[0]; var g=warSetup_('chaos').pool.filter(function(s){return s.id==='吉爾德萊-Caster';})[0]; var u=warUnit_(m), v=warUnit_(g); return {mfx:u.fx, gfx:v.fx, gcd:warNpCd_(v), base:WAR_.NP_COOLDOWN}; })()`);
t(med.mfx.indexOf('crafting')>=0 && med.mfx.some(f=>f==='fast_cast'||f==='divine_age'), '美狄亞：道具作成、高速詠唱／神代魔術都有效果', JSON.stringify(med.mfx));
t(med.gfx.indexOf('summon_horror')>=0 && med.gcd===med.base-2, '吉爾・德・萊斯：螺湮城教本自帶魔力爐，寶具冷卻短 2 夜', JSON.stringify(med));
const rh=J(`(function(){ var s=__battle([], 'strike'); s.battle=null; s.phase='day'; s.sv.hp=1; var a=warAct_(s,{t:'rest'}); var h1=s.sv.hp; var s2=__battle([], 'strike'); s2.battle=null; s2.phase='day'; s2.sv.hp=1; s2.sv.fx=['crafting']; warAct_(s2,{t:'rest'}); return [h1, s2.sv.hp]; })()`);
t(rh[1]>rh[0], '道具作成：休養回得比較多', JSON.stringify(rh));

console.log('\n── ⑨ 敵方的原作性格（WAR_TEMPER_）');
const kj=J(`(function(){ var raids=0; for(var i=0;i<200;i++){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); s.phase='night'; s.out=false; s.hunted=false; s.engaged=[]; s.ticked=[];
  s.enemies.forEach(function(e){ if(e.hero!=='佐佐木小次郎-Assassin') e.alive=false; else { e.found=true; e.arrive=1; } }); var ev=[]; s.rs=i*977+1; if(warTick_(s,ev)) raids++; } return raids; })()`);
t(kj===0, '小次郎守在山門：知道你據點也從不夜襲', kj);
const la=J(`(function(){ var s=warNewGame_(__o); var l=s.enemies.filter(function(e){return e.hero==='庫丘林-Lancer';})[0]; s.battle={e:l.id,round:1,ctx:'sortie'}; return warIntent_(s,l,s.sv,1); })()`);
t(la==='probe', '庫丘林奉命偵察：第一回合先試探', la);
const gl=J(`(function(){ var s=warNewGame_(__o); var g=s.enemies.filter(function(e){return e.hero==='吉爾伽美什-Archer';})[0]; g.hp=1; g.cd=3; s.battle={e:g.id,round:2,ctx:'sortie'}; var n=0; for(var i=0;i<50;i++){ s.rs=i+1; if(warIntent_(s,g,s.sv,2)==='retreat') n++; } return n; })()`);
t(gl===0, '吉爾伽美什快倒了也不撤退', gl);
const nm=J(`(function(){ var o=warSeedCtx_('4th'); o.name='測'; o.sex='男'; o.war='4th'; o.seed=9; o.pool=warSetup_('chaos').pool.filter(function(s){return s.id==='阿爾托莉雅-Saber';}); var s=warNewGame_(o); warAct_(s,{t:'start'}); var la=s.enemies.filter(function(e){return e.hero==='蘭斯洛特-Berserker';})[0]; la.intel=1; s.phase='night'; var ev=[]; warStartBattle_(s,la,'sortie',ev); return ev.map(function(x){return x.k+':'+x.txt;}); })()`);
t(nm.some(x=>/^meet:黑色的狂戰士一看見阿爾托莉雅/.test(x)), '蘭斯洛特遇上阿爾托莉雅：開場那一句點名她', JSON.stringify(nm));
const mt=J(`(function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); var k=s.enemies.filter(function(e){return e.hero==='佐佐木小次郎-Assassin';})[0]; k.intel=1; s.phase='night'; var ev=[]; warStartBattle_(s,k,'sortie',ev); return ev.map(function(x){return x.txt;}).join(''); })()`);
t(/山門前的石階上/.test(mt) && mt.indexOf('小次郎')<0, '開場一句有原作味、不洩真名', mt);

// 天亮的追擊：對手重傷時停在「追擊／收手」，追擊必中×1.5、御主扣體力、真名曝光
evalIn(`function __dawn(pct){ var s=__battle([], 'strike'); var e=s.enemies.filter(function(x){return x.id===s.battle.e;})[0]; e.hp=Math.round(e.mhp*pct); s.battle.round=WAR_.ROUNDS; var atk=s.sv.atk; s.sv.atk=0.01;
  var r=warAct_(s,{t:'stance',s:'probe'}); s.sv.atk=atk; return {s:s,e:e,r:r}; }`);
const D=J(`(function(){ var d=__dawn(0.2), s=d.s; return { phase:s.phase, dawn:!!(s.battle&&s.battle.dawn), btn:warButtons_(s).map(function(b){return b.s;}).join(), view:(warView_(s).battle||{}).dawn, txt:d.r.ev.map(function(x){return x.txt;}).join('|'),
  seal:warAct_(s,{t:'stance',s:'chase',seal:true}).ok, eAlive:d.e.alive }; })()`);
t(D.phase==='battle'&&D.dawn&&D.btn==='chase,letgo'&&D.view===true&&/帶著重傷想走/.test(D.txt),'天亮時對手剩不到三成：停在追擊／收手兩顆鈕',JSON.stringify(D));
t(D.seal===false,'追擊／收手不能疊令咒');
const L=J(`(function(){ var d=__dawn(0.2), s=d.s, m=s.master.hp; var r=warAct_(s,{t:'stance',s:'letgo'}); return { phase:s.phase, m:s.master.hp-m, alive:d.e.alive, txt:r.ev.map(function(x){return x.txt;}).join('|') }; })()`);
t(L.phase!=='battle'&&L.m===0&&L.alive&&/晨霧/.test(L.txt),'收手：對手離開、御主不扣',JSON.stringify(L));
const C=J(`(function(){ var d=__dawn(0.2), s=d.s, m=s.master.hp; s.exposed=false; s.out=true; var r=warAct_(s,{t:'stance',s:'chase'}); return { phase:s.battle&&s.battle.e===d.e.id?'battle':s.phase, m:m-s.master.hp, exposed:s.exposed, txt:r.ev.map(function(x){return x.txt;}).join('|') }; })()`);
t(C.phase!=='battle'&&C.m===E('WAR_.CHASE_MASTER')&&C.exposed&&(/追上去，擊中了/.test(C.txt)||/撤退成功/.test(C.txt)),'追擊：御主扣體力、真名曝光、那一擊必中（或對方逃掉），打完就天亮',JSON.stringify(C));
const H=J(`(function(){ var d=__dawn(0.6); return { phase:d.s.phase, txt:d.r.ev.map(function(x){return x.txt;}).join('|') }; })()`);
t(H.phase!=='battle'&&/雙方各自撤退/.test(H.txt),'對手還有六成血：照舊天亮各自撤退',JSON.stringify(H));

const ST=J(`(function(){ var u=function(id){ return warUnit_(SEED_SERVANTS.filter(function(x){return x.id===id;})[0],{}); }; return [u('阿爾托莉雅-Saber'),u('佐佐木小次郎-Assassin'),u('赫拉克勒斯-Berserker'),u('EMIYA-Archer'),u('美狄亞-Caster')].map(warStands_).join(); })()`);
t(ST==='true,true,true,false,false','不撤退的敵人（騎士王、守門的武士、狂戰士）天亮時回頭硬拚，其他人會逃',ST);

const GL=J(`(function(){ var bad=[]; ['5th','4th','chaos'].forEach(function(w){ for(var g=0; g<6; g++){ var o=warSeedCtx_(w); o.name='測'; o.sex='男'; o.seed=40+g; var s=warNewGame_(o); var n=0;
  while(s.phase!=='over'&&n++<300){ var bs=warButtons_(s).filter(function(b){return !b.dis;}); var b=bs[(n*7+g)%bs.length]; var r=warAct_(s,{t:b.t,id:b.id,s:b.s}); r.ev.forEach(function(x){ if(/[A-Za-z][\u4e00-\u9fff]/.test(x.txt||'')) bad.push(x.txt); }); } } }); return bad.slice(0,3); })()`);
t(GL.length===0,'事件句裡英文職階後面接中文都有空格（「那位 Saber 正面攻擊」）',GL.join(' / '));

const VL=J(`(function(){ var s=__battle(['wind_strike'],'strike'); s.sv.hp=9999; s.sv.mhp=9999; var n=0; for(var i=0;i<3&&s.phase==='battle';i++){ s.battle.intent='strike'; var r=warAct_(s,{t:'stance',s:'probe'}); n+=r.ev.filter(function(x){return /遮住了兵器/.test(x.txt);}).length; } return n; })()`);
t(VL===1,'風王結界：一場戰鬥裡試探幾次都只說一次看不穿',VL);
const RA=J(`(function(){ var cnt=function(prev){ var n=0; for(var i=0;i<300;i++){ var o=warSeedCtx_('5th'); o.name='測'; o.sex='男'; o.seed=500+i; var s=warNewGame_(o); warAct_(s,{t:'start'}); s.day=5;
    s.enemies.forEach(function(e){ e.arrive=1; e.found=true; e.alive=e.hero==='赫拉克勒斯-Berserker'; if(prev&&e.alive) e.raided=4; }); s.phase='night'; s.ticked=[]; s.engaged=[]; s.hunted=false; s.out=false; s.battle=null; warTick_(s,[]); if(s.battle) n++; } return n; };
  return [cnt(false),cnt(true)]; })()`);
t(RA[1]<RA[0]*0.6,'昨夜才夜襲過你的那位：今晚少來（不再同一位連夜上門）',RA.join(' vs '));
const SC=J(`(function(){ var d=__dawn(0.2), s=d.s; d.e.fx=['lastStand']; var tp=WAR_TEMPER_; var real=warStands_; warStands_=function(){return true;}; var sub=warButtons_(s)[0].sub; s.out=true; var r=warAct_(s,{t:'stance',s:'chase'}); warStands_=real; return sub+'|'+r.ev.map(function(x){return x.txt;}).join('|'); })()`);
t(/再打一回合/.test(SC)&&/逼了上去/.test(SC)&&!/追了上去/.test(SC),'不撤退的對手：追擊寫成「逼了上去」、按鈕寫「再打一回合」',SC.slice(0,160));

const FT=J(`(function(){ var run=function(fled){ var ok=0, n=400; for(var i=0;i<n;i++){ var s=__battle([], 'retreat'); s.rs=900+i*7919; var e=s.enemies.filter(function(x){return x.id===s.battle.e;})[0]; e.fled=fled; s.battle.intent='retreat';
    var r=warAct_(s,{t:'stance',s:'probe'}); if(r.ev.some(function(x){return x.side==='foe'&&/撤退成功/.test(x.txt);})) ok++; } return ok/n; };
  var s2=__battle([], 'retreat'); var e2=s2.enemies.filter(function(x){return x.id===s2.battle.e;})[0]; var before=e2.fled||0; var hit=false; for(var k=0;k<30&&!hit;k++){ var s3=__battle([], 'retreat'); s3.rs=50+k*7919; var e3=s3.enemies.filter(function(x){return x.id===s3.battle.e;})[0]; s3.battle.intent='retreat'; var r3=warAct_(s3,{t:'stance',s:'probe'}); if(r3.ev.some(function(x){return /撤退成功/.test(x.txt);})) hit=(e3.fled===1); }
  return { a:run(0), b:run(2), counted:hit }; })()`);
t(FT.b<FT.a-0.2&&FT.counted,'從你手上逃過的敵人：記下次數，下次更難從你手上逃（退路被摸清）',JSON.stringify(FT));

const GP=J(`(function(){ var o=warSeedCtx_('5th'); o.name='測'; o.sex='男'; o.seed=3; var s=warNewGame_(o); warAct_(s,{t:'start'}); var H=function(h){ return s.enemies.filter(function(e){return e.hero===h;})[0]; };
  var sb=H('阿爾托莉雅-Saber'), kj=H('佐佐木小次郎-Assassin'); sb.intel=1; kj.intel=1; sb.hp=sb.mhp*10; sb.mhp*=10; kj.hp=kj.mhp*10; kj.mhp*=10; s.draws=[]; var ev=[]; warAutoBattle_(s,sb,kj,ev); return (s.draws||[]).concat(ev.map(function(x){return x.txt;})).join('|'); })()`);
t(/柳洞寺/.test(GP)&&!/衛宮邸/.test(GP),'跟守山門的武士交手：地點寫柳洞寺（他離不開山門）',GP);
const FO=J(`(function(){ var out=[]; ['5th','4th','chaos'].forEach(function(w){ var o=warSeedCtx_(w); o.name='測'; o.sex='男'; o.seed=4; var s=warNewGame_(o); warAct_(s,{t:'start'}); var al=s.enemies.filter(function(e){return e.alive&&e.arrive<=1&&!e.fake;});
    al.slice(1).forEach(function(e){ e.alive=false; e.hp=0; }); s.enemies.forEach(function(e){ if(e.fake||e.arrive>1){ e.alive=false; e.hp=0; } }); s.day=warNights_(s); s.phase='night'; var r=warAct_(s,{t:'final'}); out.push(r.ev.filter(function(x){return x.k==='final';}).map(function(x){return x.txt;}).join()); }); return out; })()`);
t(FO.length===3&&FO.every(function(x){return /最後一位從者/.test(x)&&!/剩下的從者/.test(x);}),'決戰夜只剩一位：寫「最後一位從者」，不寫「剩下的從者陸續」',FO.join(' / '));
const AO=J(`(function(){ var all=[WAR_FINAL_['5th'],WAR_FINAL_['4th'],WAR_FINAL_.chaos]; Object.keys(WAR_ROUTES_).forEach(function(w){ Object.keys(WAR_ROUTES_[w]).forEach(function(k){ if(WAR_ROUTES_[w][k].final) all.push(WAR_ROUTES_[w][k].final); }); }); return all.filter(function(f){ return f&&!f.arriveOne; }).length; })()`);
t(AO===0,'每個決戰地都寫了只剩一位時的那句（arriveOne）',AO);

const DU=J(`(function(){ var skip={hit:1,miss:1,np:1,clash:1,master:1,retreat:1,dawn:1,life:1,stand:1}, bad=[]; ['5th','4th','chaos'].forEach(function(w){ for(var g=0; g<25; g++){ var o=warSeedCtx_(w); o.name='測'; o.sex='男'; o.seed=70+g; var s=warNewGame_(o); var n=0;
  while(s.phase!=='over'&&n++<300){ var bs=warButtons_(s).filter(function(b){return !b.dis;}); var b=bs.filter(function(x){return x.t==='scout';})[0]||bs[(n*5+g)%bs.length]; if(s.phase==='night'&&n%3) b=bs.filter(function(x){return x.t==='hold';})[0]||b;
    var r=warAct_(s,{t:b.t,id:b.id,s:b.s}), seen={}; r.ev.forEach(function(x){ if(skip[x.k]) return; if(seen[x.txt]) bad.push(x.txt); seen[x.txt]=1; }); } } }); return bad.slice(0,3); })()`);
t(DU.length===0,'整局掃三種戰爭：同一個回應裡沒有重複的敘事句（追丟幾位氣息都併成一句）',DU.join(' / '));

const HS=J(`(function(){ var worst=0; for(var i=0;i<60;i++){ var o=warSeedCtx_('5th'); o.name='測'; o.sex='男'; o.seed=300+i; var s=warNewGame_(o); warAct_(s,{t:'start'}); s.sv.fx=['aim']; s.sv.skn={aim:'千里眼'};
  s.enemies.forEach(function(e){ e.arrive=1; e.intel=0; e.fake=false; e.fx=['stealth']; e.skn={stealth:'氣息遮斷'}; }); var r=warAct_(s,{t:'scout'}); var n=r.ev.filter(function(x){return /氣息無法追蹤/.test(x.txt);}).length; worst=Math.max(worst,n); } return worst; })()`);
t(HS===1,'一次打聽追丟好幾位帶氣息遮斷的：只講一句（「有 N 位從者的氣息無法追蹤」）',HS);

const LF=J(`(function(){ var same=0, tot=0; for(var i=0;i<200;i++){ var o=warSeedCtx_('chaos'); o.name='測'; o.sex='男'; o.seed=600+i; var s=warNewGame_(o); warAct_(s,{t:'start'}); s.day=5;
    var al=s.enemies.filter(function(e){return !e.fake;}).slice(0,3); s.enemies.forEach(function(e){ e.alive=al.indexOf(e)>=0; e.arrive=1; e.found=false; }); var a=al[0], b=al[1];
    a.lastFoe={id:b.id,day:4}; b.lastFoe={id:a.id,day:4}; s.phase='night'; s.ticked=[]; s.engaged=[]; s.hunted=true; s.out=true; s.battle=null; warTick_(s,[]);
    var k=s.engaged.indexOf(a.id); if(k>=0&&k%2===0){ tot++; if(s.engaged[k+1]===b.id) same++; } } return {same:same,tot:tot}; })()`);
t(LF.tot>10&&LF.same===0,'敵人互打：昨夜才打過的那一對，今晚有別人可挑就不再碰頭',JSON.stringify(LF));

const SQ=J(`(function(){ var o=warSeedCtx_('5th'); o.name='測'; o.sex='男'; o.seed=8; var s=warNewGame_(o); warAct_(s,{t:'start'}); var sub=function(){ return warButtons_(s).filter(function(b){return b.t==='scout';})[0].sub; };
  var a=sub(); warArrived_(s).forEach(function(e){ e.intel=2; }); var b=sub(); return [a,b]; })()`);
t(SQ[0]==='探查敵方位置或真名'&&SQ[1]==='場上的敵人都查清了','打聽的說明照實講：場上的敵人都查清了就直說（不讓玩家白按）',SQ.join(' / '));

console.log(bad ? '❌ '+bad+' 條失敗' : '✅ warfix.js '+ok+' 條全過');
