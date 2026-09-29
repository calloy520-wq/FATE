// ⚔️ 新聖杯戰爭：路由往返（開局／按鈕／說書快取／存讀檔／帳號隔離／放棄）＋引擎規則（重現性、按鈕白名單、寶具曝光、決戰）。
const P=require('./probe.js'); const {ctx,evalIn,sheets}=P;
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,200):''));} };
let CAP=null, NARR='夜風裡，劍光一閃。';
ctx.__CAP2__=o=>{CAP=o;}; ctx.__NARR2__=()=>NARR;
evalIn('callGeminiAPI=function(p,s,c){ __CAP2__({p:p,s:s,c:c}); return __NARR2__(); }');
const run=u=>JSON.parse(evalIn('handleGameAction('+JSON.stringify(JSON.stringify(u))+')'));
const A='甲帳號', B='乙帳號';
const sheet=()=>sheets['聖杯戰局'];

console.log('\n── ① 沒有戰局時讀檔');
let r=run({action:'war_load',acctName:A});
t(r.success && r.view===null, '沒開過局 → view 是 null（前端畫開局表單）');

console.log('\n── ② 開局＝召喚');
r=run({action:'war_new',acctName:A,pcName:'衛宮',sex:'男',war:'5th'});
t(r.success && r.view.phase==='summon', '開局停在召喚畫面', r.message);
t(r.view.buttons.map(b=>b.t).join()==='start,reroll', '召喚畫面只有兩顆鈕：開戰、重新召喚', r.view.buttons.map(b=>b.t));
t(sheet() && sheet()._d.length===2 && sheet()._d[1][0]===A, '聖杯戰局分頁多一列，帳號對得上');
const st0=JSON.parse(sheet()._d[1][3]);
t(st0.enemies.every(e=>e.hero!==st0.sv.hero), '抽到的從者不會同時出現在敵方陣容');
t(r.view.foes.length===0 && r.view.unknown===st0.enemies.filter(e=>e.arrive<=1).length, '召喚畫面看不到任何一位的身分，只知道有幾位', JSON.stringify([r.view.foes.length, r.view.unknown]));

console.log('\n── ③ 說書：只演算好的那一段，同一段不重複花 AI');
CAP=null; r=run({action:'war_narrate',acctName:A});
t(r.success && r.text===NARR, '說書回傳 AI 的文字');
t(CAP && /【這一段發生的事】/.test(CAP.p) && CAP.p.indexOf(st0.sv.name)>=0, '提示詞帶著這一段的事實與從者名字', CAP&&CAP.p);
t(CAP && CAP.c.plainText===true && CAP.c.model===evalIn('AI_MODEL'), '散文模式、一般模型');
t(CAP && CAP.s===evalIn('WAR_NARR_SYS_'), 'system 用新戰爭自己的說書守則');
CAP=null; r=run({action:'war_narrate',acctName:A});
t(CAP===null && r.text===NARR, '同一段再叫一次 → 回快取，不再呼叫 AI');

console.log('\n── ④ 按鈕白名單：只能按畫面上有的');
r=run({action:'war_act',acctName:A,act:{t:'rest'}});
t(!r.success, '召喚階段按「休養」→ 拒絕');
r=run({action:'war_act',acctName:A,act:{t:'start'}});
t(r.success && r.view.phase==='day' && r.view.buttons.map(b=>b.t).join()==='scout,rest,supply', '開戰 → 白天三選一：打聽、休養、補魔');
r=run({action:'war_act',acctName:A,act:{t:'stance',s:'np',seal:true}});
t(!r.success, '白天偷送戰鬥姿態＋令咒 → 拒絕');
const before=JSON.parse(sheet()._d[1][3]);
t(before.master.seals===3, '被拒絕的動作沒有動到令咒');

console.log('\n── ⑤ 補魔換一顆敢寫的模型、帶性別事實');
r=run({action:'war_act',acctName:A,act:{t:'supply'}});
t(r.success && r.view.phase==='night', '補魔後進入夜晚');
CAP=null; run({action:'war_narrate',acctName:A});
t(CAP && CAP.c.model===evalIn('LEWD_MODEL') && /【性別】/.test(CAP.p) && CAP.c.max_tokens>=3000, '補魔說書：LEWD_MODEL、性別事實、長篇上限', CAP&&CAP.c.model);

console.log('\n── ⑥ 帳號隔離');
r=run({action:'war_load',acctName:B});
t(r.success && r.view===null, '乙帳號看不到甲帳號的戰局');
run({action:'war_new',acctName:B,pcName:'遠坂',sex:'女',war:'4th'});
t(sheet()._d.length===3, '乙開局是另一列');
r=run({action:'war_load',acctName:A});
t(r.view && r.view.phase==='night' && r.story.length>=1, '甲讀檔還在夜晚，前情說書帶回來');

console.log('\n── ⑦ 一路打到結束（固守＋能打就打）');
let guard=0;
while(guard++<300){
  r=run({action:'war_load',acctName:A}); const v=r.view;
  if(v.phase==='over') break;
  const bs=v.buttons.filter(b=>!b.dis);
  let b = bs.find(x=>x.t==='final')||bs.find(x=>x.t==='sortie'&&/勝算大/.test(x.sub))||bs.find(x=>x.t==='rest'&&v.sv.hp<v.sv.mhp*0.6)||bs.find(x=>x.t==='scout')||bs.find(x=>x.s==='np')||bs.find(x=>x.s==='strike')||bs.find(x=>x.t==='hold')||bs[0];
  const rr=run({action:'war_act',acctName:A,act:{t:b.t,id:b.id,s:b.s}});
  if(!rr.success){ console.log('   ⚠',rr.message); break; }
}
r=run({action:'war_load',acctName:A});
t(r.view.phase==='over' && r.view.result && typeof r.view.result.win==='boolean', '打得到終局，有勝負', r.view.phase);
t(r.view.buttons.length===0, '終局沒有遊戲鈕（前端只畫再來一局／回選單）');
r=run({action:'war_act',acctName:A,act:{t:'rest'}});
t(!r.success, '終局之後再按 → 拒絕');
const fin=JSON.parse(sheet()._d[1][3]);
t(fin.stats.battles>0, '這一局真的打過仗（'+fin.stats.battles+' 場）');

console.log('\n── ⑧ 引擎規則');
const E=c=>evalIn(c);
evalIn(`var __o = warSeedCtx_('5th'); __o.name='測'; __o.sex='男'; __o.seed=42;`);
const g1=E('JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:"start"}); warAct_(s,{t:"scout"}); return s; })())');
const g2=E('JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:"start"}); warAct_(s,{t:"scout"}); return s; })())');
t(g1===g2, '同一顆種子、同樣的按法 → 一模一樣的戰局（可重現）');
const np=E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:"start"}); warAct_(s,{t:"rest"});
  var e=s.enemies[0]; e.intel=1; warAct_(s,{t:"sortie",id:e.id}); var ok=s.phase==="battle"; var r=warAct_(s,{t:"stance",s:"np"});
  return {ok:ok, r:r.ok, exposed:s.exposed, cd:s.sv.cd, want:warNpCd_(s.sv)}; })())`);
const npo=JSON.parse(np);
t(npo.ok && npo.r && npo.exposed===true && npo.cd===npo.want, '放寶具 → 真名曝光、進入充能', np);
const cdTry=E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:"start"}); warAct_(s,{t:"rest"}); var e=s.enemies[0]; e.intel=1; e.hp=e.mhp*9; e.mhp=e.hp;
  warAct_(s,{t:"sortie",id:e.id}); s.sv.cd=2; var a=warAct_(s,{t:"stance",s:"np"}); var seals=s.master.seals, mhp=s.master.hp; var b=warAct_(s,{t:"stance",s:"np",seal:true});
  var cost=mhp-s.master.hp, s2=warNewGame_(__o); warAct_(s2,{t:"start"}); warAct_(s2,{t:"rest"}); var e2=s2.enemies[0]; e2.intel=1; e2.hp=e2.mhp*9; e2.mhp=e2.hp;
  warAct_(s2,{t:"sortie",id:e2.id}); var m2=s2.master.hp; warAct_(s2,{t:"stance",s:"np",seal:true});
  return {a:a.ok, b:b.ok, used:seals-s.master.seals, cost:cost, want:WAR_.SEAL_NP_COST, readyCost:m2-s2.master.hp, sub:warButtons_(s2).filter(function(x){return x.s==='np';})[0]}; })())`);
const cdo=JSON.parse(cdTry);
t(cdo.a===false && cdo.b===true && cdo.used===1, '充能中不能放；燒一劃令咒就能放', cdTry);
t(cdo.cost>=cdo.want && cdo.readyCost<cdo.want, '令咒硬放（冷卻中）御主要付魔力；寶具本來就好了只是加強，不另外扣', cdTry);
const fin2=E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:"start"}); s.day=WAR_.NIGHTS; s.phase='night';
  s.enemies.forEach(function(e,i){ if(i>1) e.alive=false; }); var b=warButtons_(s).map(function(x){return x.t;});
  warAct_(s,{t:"final"}); var names=warButtons_(s).map(function(x){return x.s;});
  return {b:b, stance:names, ctx:s.battle&&s.battle.ctx, full:s.enemies.filter(function(e){return e.alive;}).every(function(e){return e.hp===e.mhp && e.cd===0;})}; })())`);
const fo=JSON.parse(fin2);
t(fo.b.join()==='final', '最後一夜只剩「前往柳洞寺」', fin2);
t(fo.ctx==='final' && fo.stance.indexOf('retreat')<0, '決戰不能撤退', fin2);
t(!fo.full, '剩兩位以上：決戰地先混戰一輪，活下來的帶著傷', fin2);
const fin3=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:"start"}); s.day=WAR_.NIGHTS; s.phase='night';
  s.enemies.forEach(function(e,i){ if(i>0) e.alive=false; }); s.enemies[0].hp=1; s.enemies[0].cd=3; var r=warAct_(s,{t:"final"});
  var e=s.enemies[0]; return {full:e.hp===e.mhp&&e.cd===0, melee:r.ev.some(function(x){return /交手/.test(x.txt);})}; })())`));
t(fin3.full&&!fin3.melee, '只剩一位：養好傷、寶具就緒，沒有混戰', JSON.stringify(fin3));

console.log('\n── ⑩ 原作技能：讀種子，不看職階；一張表、固定時機');
const sk=JSON.parse(E(`JSON.stringify((function(){ var o=warSeedCtx_('5th'); var m={}; o.pool.forEach(function(s){ var u=warUnit_(s); m[s.id]={fx:u.fx, n:u.skn}; }); return m; })())`));
const has=(id,fx)=>sk[id].fx.indexOf(fx)>=0;
t(has('阿爾托莉雅-Saber','first_strike') && sk['阿爾托莉雅-Saber'].n.first_strike==='直感' && has('阿爾托莉雅-Saber','ride'), 'Saber：直感、騎乘（她自己的技能、名字照原作）', JSON.stringify(sk['阿爾托莉雅-Saber']));
t(has('庫丘林-Lancer','survive') && !has('迪盧木多-Lancer','survive'), '戰鬥續行只有庫丘林有，迪盧木多沒有', JSON.stringify([sk['庫丘林-Lancer'],sk['迪盧木多-Lancer']]));
t(has('EMIYA-Archer','aim') && !has('吉爾伽美什-Archer','aim'), '千里眼只有 EMIYA 有，吉爾伽美什沒有', JSON.stringify(sk['吉爾伽美什-Archer']));
t(has('美狄亞-Caster','territory') && has('赫拉克勒斯-Berserker','god_hand'), '陣地作成、十二試煉都照種子');
const dup=JSON.parse(E(`JSON.stringify(warSkillsOf_({skills:[{n:'直感',fx:'first_strike'},{n:'心眼(真)',fx:'analyze'},{n:'騎乘',fx:'ride'},{n:'不存在',fx:'nope'}]}))`));
t(dup.fx.join()==='first_strike,ride' && dup.names.first_strike==='直感', '同類效果只算一次（直感＋心眼不疊）、表上沒有的技能不進規則', JSON.stringify(dup));
const hooks=JSON.parse(E(`JSON.stringify((function(){ var u={cls:'Saber',fx:['nullify_magic','first_strike']}; return {
  vsCaster: warMul_(u,'dmgTaken',{cls:'Caster'}), vsLancer: warMul_(u,'dmgTaken',{cls:'Lancer'}), ward: warMul_(u,'wardTaken'),
  hit: warMul_(u,'hitTaken',{cls:'Lancer'}), see: warFlag_(u,'seeNp'), none: warMul_({fx:[]},'npTaken') }; })())`));
t(hooks.vsCaster===0.7 && hooks.vsLancer===1, '對魔力只擋 Caster（from 生效）', JSON.stringify(hooks));
t(hooks.ward===0.4 && hooks.see===true && hooks.none===1, '魔術陣不受 from 限制；旗標與沒有技能時的預設值都對', JSON.stringify(hooks));
const allHooks=E(`JSON.stringify(Object.keys(WAR_SKILL_).reduce(function(a,k){ Object.keys(WAR_SKILL_[k]).forEach(function(h){ if(a.indexOf(h)<0) a.push(h); }); return a; },[]))`);
const src=require('fs').readFileSync((process.env.GAS_DIR||require('path').join(__dirname,'../../gas'))+'/War_Engine.gs','utf8');
// 讀法三種：warMul_(u,'h')／row.h（修飾欄）／被別列的值點名的旗標（lock:'divine'、vs:'divine'）
const _body=(process.env.INJECT_HOOK? src.replace("clear_mind: {","clear_mind: { "+process.env.INJECT_HOOK+": 1,") : src).split('var WAR_FROM_HOOKS_')[1]||'';
const _named=JSON.parse(E(`JSON.stringify(Object.keys(WAR_SKILL_).map(function(k){ var r=WAR_SKILL_[k]; return [r.lock,r.vs]; }).reduce(function(a,b){ return a.concat(b); },[]).filter(Boolean))`));
const _hooksAll=JSON.parse(allHooks).concat(process.env.INJECT_HOOK?[process.env.INJECT_HOOK]:[]);
const unread=_hooksAll.filter(h=>h!=='txt'&&h!=='from'&&_named.indexOf(h)<0&&!new RegExp("'"+h+"'|\\.\\b"+h+"\\b").test(_body.replace(/\.\b/g,'.')));
t(unread.length===0, '表上每個時機，引擎都真的有讀（沒有寫了沒人吃的欄）', unread.join(','));
const probeSeal=E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:"start"}); warAct_(s,{t:"rest"}); var e=s.enemies[0]; e.intel=1; warAct_(s,{t:"sortie",id:e.id});
  var r=warAct_(s,{t:"stance",s:"probe",seal:true}); return {ok:r.ok, seals:s.master.seals}; })())`);
const ps=JSON.parse(probeSeal);
t(ps.ok===false && ps.seals===3, '試探用不上令咒（原作沒有這種用法）→ 拒絕、令咒沒少', probeSeal);
t(!/power|FINAL_ABSORB/.test(require('fs').readFileSync((process.env.GAS_DIR||require('path').join(__dirname,'../../gas'))+'/War_Engine.gs','utf8')), '引擎裡沒有「打倒別人變強」或「吸魂」');

console.log('\n── ⑨ 放棄這一局');
r=run({action:'war_quit',acctName:B});
t(r.success && sheet()._d.length===2 && sheet()._d.every(x=>x[0]!==B), '乙放棄 → 那一列刪掉，甲不受影響');
console.log(bad ? '❌ '+bad+' 條失敗' : '✅ war.js '+ok+' 條全過');
