// ⚔️ 新聖杯戰爭：終局戰績、輸在哪（查表、第一條成立的）、亮點、老虎道場（只在終局開、同一局只花一次 AI）。
const P=require('./probe.js'); const {ctx,evalIn,sheets}=P;
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,300):''));} };
const E=c=>evalIn(c);
let CAP=null, OUT='大河「押忍！」<br><br>伊莉雅「下次先試探。」';
ctx.__CAP3__=o=>{CAP=o;}; ctx.__OUT3__=()=>OUT;
evalIn('callGeminiAPI=function(p,s,c){ __CAP3__({p:p,s:s,c:c}); return __OUT3__(); }');
const run=u=>JSON.parse(evalIn('handleGameAction('+JSON.stringify(JSON.stringify(u))+')'));
evalIn(`var __o = warSeedCtx_('5th'); __o.name='測'; __o.sex='男'; __o.seed=11; __o.pool=__o.pool.filter(function(s){return s.id==='阿爾托莉雅-Saber';});`);
// 造一個在戰鬥中輸掉的局：setup 在開戰後、敗北前改狀態
const lose=(setup)=>JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); warAct_(s,{t:'rest'});
  var e=s.enemies[0]; e.intel=1; warAct_(s,{t:'sortie',id:e.id}); ${setup||''}; s.sv.hp=0; var ev=[]; warCheckEnd_(s,ev); return warDebrief_(s); })())`));

console.log('\n── ① 輸在哪：查表，第一條成立的');
t(E(`(function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); warAct_(s,{t:'rest'}); var e=s.enemies[0]; e.intel=1; warAct_(s,{t:'sortie',id:e.id}); s.master.hp=0; warCheckEnd_(s,[]); return warDebrief_(s).key; })()`)==='master', '御主倒下 → master');
t(JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); s.day=WAR_.NIGHTS; s.phase='night'; warAct_(s,{t:'final'}); s.battle.ignored=true; warOver_(s,false,'timeout',[]); return warDebrief_(s); })())`)).key==='dawn', '決戰打到天亮 → dawn（排在預兆之前）');
t(lose('s.battle.ignored=true').key==='tele' && lose('e.intel=2; s.battle.hp0=100; s.stats.ignoredTele=3').key!=='tele', '致命那一場看到預兆還硬吃 → tele；更早的場次吃過不算');
let d=lose('');
t(d.key==='blind' && /沒看穿.*真名/.test(d.fact) && d.fact.indexOf('「')>=0, '到最後沒看穿對手真名 → blind，事實裡點名對手', JSON.stringify(d));
t(lose('e.intel=2; s.battle.hp0=30').key==='wounded', '帶重傷出擊 → wounded');
t(lose('e.intel=2; s.battle.hp0=100; s.battle.ctx="final"; s.stats.finalFoes=4').key==='crowd', '決戰夜還剩一堆人 → crowd');
d=lose('e.intel=2; s.battle.hp0=100; s.battle.ctx="final"; s.stats.finalFoes=4');
t(/4 位/.test(d.fact), '決戰夜人數代進句子', d.fact);
t(lose('e.intel=2; s.battle.hp0=100').key==='seals', '令咒一劃沒用 → seals');
t(lose('e.intel=2; s.battle.hp0=100; s.master.seals=1; s.exposed=true').key==='exposed', '真名早曝光 → exposed');
d=lose('e.intel=2; s.battle.hp0=100; s.master.seals=1');
t(d.key==='battle' && d.lesson, '都沒中 → 一般落敗，一樣有下一局要改的事', JSON.stringify(d));
t(!/\{\w+\}/.test(JSON.stringify(d)) && !/\{\w+\}/.test(JSON.stringify(lose('s.battle.ignored=true'))), '佔位字都代換掉了');

console.log('\n── ② 贏了：亮點最多三條、沒有輸在哪');
const w=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); s.stats.battles=5; s.stats.kills=4; s.stats.dodged=2;
  s.enemies.forEach(function(e){ e.intel=2; e.alive=false; }); warCheckEnd_(s,[]); return {d:warDebrief_(s), v:warView_(s).debrief}; })())`));
t(w.d.win && !w.d.fact && w.d.good.length===3, '贏了：沒有「輸在」、亮點三條', JSON.stringify(w.d));
t(w.d.good[0]==='未使用令咒奪得聖杯' && w.d.stats.kills===4 && w.d.stats.reveals>=3, '亮點照表的順序、戰績數字對得上', JSON.stringify(w.d));
t(JSON.stringify(w.v)===JSON.stringify(w.d), '畫面的 debrief 就是 warDebrief_ 那一份');
t(E(`(function(){ var s=warNewGame_(__o); return 'debrief' in warView_(s); })()`)===false, '還沒結束 → 畫面沒有 debrief');

console.log('\n── ③ 數據真的有記：預兆、撤退、決戰人數、出擊時的傷勢');
const tr=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); warAct_(s,{t:'rest'}); var e=s.enemies[0]; e.intel=2; e.hp=e.mhp=99999; s.sv.hp=s.sv.mhp=99999;
  warAct_(s,{t:'sortie',id:e.id}); var hp0=s.battle.hp0; s.battle.intent='np'; s.battle.tele='np'; e.cd=0; warAct_(s,{t:'stance',s:'strike'});
  var ig=s.stats.ignoredTele, bi=!!(s.battle&&s.battle.ignored); if(s.battle){ s.battle.intent='np'; s.battle.tele='np'; e.cd=0; warAct_(s,{t:'stance',s:'probe'}); }
  return {hp0:hp0, ig:ig, bi:bi, dodged:s.stats.dodged}; })())`));
t(tr.hp0===100 && tr.ig===1 && tr.bi===true && tr.dodged===1, '看到預兆：硬吃記一次、試探躲開記一次；出擊時的血量有記', JSON.stringify(tr));
const fn=E(`(function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); s.day=WAR_.NIGHTS; s.phase='night'; var n=warArrived_(s).length; warAct_(s,{t:'final'}); return s.stats.finalFoes===n && n>0; })()`);
t(fn===true, '決戰夜記下柳洞寺上有幾位');
const rt=E(`(function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); warAct_(s,{t:'rest'}); var e=s.enemies[0]; e.intel=1; warAct_(s,{t:'sortie',id:e.id}); s.battle.intent='strike'; warAct_(s,{t:'stance',s:'retreat',seal:true}); return s.stats.retreats; })()`);
t(rt===1, '令咒強制撤退 → 撤退記一次', rt);
const old=E(`(function(){ var s=warNewGame_(__o); s.stats={np:0,battles:0,kills:0,seals:0}; warAct_(s,{t:'start'}); s.sv.hp=0; warCheckEnd_(s,[]); try { var d=warDebrief_(s); return d.stats.retreats===0 && !!d.key; } catch(e){ return 'err '+e.message; } })()`);
t(old===true, '舊存檔（stats 沒有新欄位）也算得出講評', old);

console.log('\n── ④ 老虎道場：只在終局開、同一局只花一次 AI');
const A='道場帳號';
run({action:'war_new',acctName:A,pcName:'士郎',sex:'男',war:'5th'});
let r=run({action:'war_dojo',acctName:A});
t(!r.success, '還沒結束 → 道場不開', JSON.stringify(r));
const row=sheets['聖杯戰局']._d.findIndex(x=>x[0]===A);
const st=JSON.parse(sheets['聖杯戰局']._d[row][3]); st.phase='over'; st.result={win:false,cause:'servant',day:5,foe:'那位 Lancer',foeIntel:1,ctx:'sortie',hp0:90}; st.sv.hp=0;
sheets['聖杯戰局']._d[row][3]=JSON.stringify(st);
CAP=null; r=run({action:'war_dojo',acctName:A});
t(r.success && r.text===OUT, '終局 → 道場開講', JSON.stringify(r));
t(CAP && CAP.s===E('WAR_DOJO_SYS_') && CAP.c.plainText===true, 'system 用道場自己的守則、散文模式');
t(CAP && /輸在：直到最後都沒看穿「那位 Lancer」的真名/.test(CAP.p) && /下一局要改的一件事：/.test(CAP.p), '提示詞帶著 GAS 算好的輸在哪與下一局', CAP&&CAP.p);
t(CAP && /戰績：/.test(CAP.p) && CAP.p.indexOf(st.sv.name)>=0, '提示詞帶戰績與從者名');
CAP=null; r=run({action:'war_dojo',acctName:A});
t(CAP===null && r.text===OUT, '再按一次 → 回快取');
run({action:'war_new',acctName:A,pcName:'士郎',sex:'男',war:'5th'});
const n2=JSON.parse(sheets['聖杯戰局']._d[row][4]);
t(!n2.dojo, '開新局 → 上一局的道場快取清掉');
const st2=JSON.parse(sheets['聖杯戰局']._d[row][3]); st2.phase='over'; st2.result={win:true,cause:'win',day:9}; sheets['聖杯戰局']._d[row][3]=JSON.stringify(st2);
OUT=''; CAP=null; r=run({action:'war_dojo',acctName:A});
t(!r.success && r.message, 'AI 沒回 → 失敗訊息（畫面上的講評照樣看得到）');
OUT='大河「恭喜！」'; CAP=null; r=run({action:'war_dojo',acctName:A});
t(CAP && r.success && /奪得了聖杯/.test(CAP.p) && !/輸在/.test(CAP.p), '失敗沒寫進快取，下一次重試；贏了走祝賀', CAP&&CAP.p);

console.log(bad ? '❌ '+bad+' 條失敗' : '✅ warend.js '+ok+' 條全過');
