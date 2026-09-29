// ⚔️ 新聖杯戰爭：世界書（事件碰到才給原作設定）＋技能觸發看得見。
const P=require('./probe.js'); const {evalIn,ctx}=P;
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,300):''));} };
const E=c=>evalIn(c);
evalIn(`var __o = warSeedCtx_('5th'); __o.name='測'; __o.sex='男'; __o.seed=7; __o.pool=warSetup_('chaos').pool.filter(function(s){return s.id==='阿爾托莉雅-Saber';});`);
const lore=facts=>E(`(function(){ var s=warNewGame_(__o); s.narr={seq:1,kind:'battle',facts:${JSON.stringify(facts)}}; return warLoreStr_(s); })()`);

console.log('\n── ① 碰到才給');
t(lore(['你們在據點休息了一天。'])==='', '什麼都沒碰到 → 不送世界書');
let L=lore(['你解放寶具「誓約勝利之劍」。']);
t(/誓約勝利之劍/.test(L) && /光/.test(L), '放了寶具 → 帶原作的寶具描述', L);
t(!/理想鄉/.test(L), '同一位的第二個寶具沒被提到 → 不給', L);
L=lore(['最後一夜。聖杯在柳洞寺降臨，剩下的從者一個接一個踏進了寺院。']);
t(/山門/.test(L) && /大空洞/.test(L), '決戰夜 → 柳洞寺的結界、大聖杯的位置', L);
L=lore(['夜裡，你帶著阿爾托莉雅前往遠坂宅，找上了那位 Archer。']);
t(/紅磚洋館/.test(L), '前往遠坂宅 → 遠坂邸的樣子', L);
const foeNp=E(`(function(){ var s=warNewGame_(__o); var g=s.enemies.filter(function(e){return e.hero==='吉爾伽美什-Archer';})[0]; return g.npName; })()`);
L=lore(['一位不明的從者解放寶具「'+foeNp+'」。']);
t(L && L.indexOf('吉爾伽美什')<0, '對手的寶具條目不寫持有者（真名還沒看穿時說書也不先知道）', L);
L=lore(['你用了一劃令咒。','遠坂宅','柳洞寺','新都','深山町','誓約勝利之劍','聖杯在柳洞寺','教會']);
t(L.split('｜').length<=E('KANSHOU_LORE_MAX_'), '一段最多 '+E('KANSHOU_LORE_MAX_')+' 條', L.split('｜').length);

console.log('\n── ② 接進說書提示詞');
const p=E(`(function(){ var s=warNewGame_(__o); s.narr={seq:1,kind:'battle',facts:['夜巡到柳洞寺時，撞見了一位不明的從者。']}; return warNarrPrompt_(s); })()`);
t(/【這一段碰到的原作設定】/.test(p) && /山門/.test(p), '提示詞裡有這一段碰到的條目', p);
const p0=E(`(function(){ var s=warNewGame_(__o); s.narr={seq:1,kind:'day',facts:['你們在據點休息了一天。']}; return warNarrPrompt_(s); })()`);
t(!/原作設定/.test(p0), '沒碰到 → 提示詞沒有這一塊');
const old=E(`(function(){ var s=warNewGame_(__o); delete s.sv.card.np; delete s.sv.card.book; s.enemies.forEach(function(e){ delete e.card; }); s.narr={seq:1,kind:'battle',facts:['你解放寶具「誓約勝利之劍」。']}; try { return 'ok:'+warLoreStr_(s); } catch(e){ return 'err:'+e.message; } })()`);
t(/^ok:/.test(old), '舊存檔（單位上沒有 np／book）不會炸', old);

console.log('\n── ③ 技能觸發看得見');
const stood=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); s.sv.fx=['survive']; s.sv.skn={survive:'戰鬥續行'}; s.sv.saved=false; s.sv.hp=s.sv.mhp;
  var ev=[]; var Y={u:s.sv, side:'me', act:'strike'}, X={u:s.enemies[0], side:'foe', act:'np'}; s.enemies[0].intel=1; X.u.np=99;
  warStrike_(s, X, Y, ev); return {hp:s.sv.hp, ev:ev.map(function(e){return e.k+':'+e.txt;})}; })())`));
t(stood.hp===1 && stood.ev.some(x=>/^skill:.*「戰鬥續行」/.test(x)), '戰鬥續行撐住 → 事件裡念出技能名', JSON.stringify(stood));
t(stood.ev.findIndex(x=>/^np:/.test(x)) < stood.ev.findIndex(x=>/^skill:/.test(x)), '順序：先挨寶具，再撐住', JSON.stringify(stood.ev));
const amb=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); s.sv.fx=['stealth']; s.sv.skn={stealth:'氣息遮斷'};
  var ev=[]; var X={u:s.sv, side:'me', act:'strike', ambush:true}, Y={u:s.enemies[0], side:'foe', act:'strike'}; warStrike_(s, X, Y, ev); return ev.map(function(e){return e.txt;}); })())`));
t(amb.some(x=>/「氣息遮斷」/.test(x)), '奇襲第一擊 → 事件裡念出氣息遮斷', JSON.stringify(amb));
const nm=E(`warSkName_({fx:['ride'],skn:{ride:'騎乘'}},'lastStand')`);
t(nm==='技能', '沒有那個時機的技能 → 退回「技能」不炸', nm);

console.log('\n── ④ 對手情報上畫面：看穿多少、攤開多少');
const iv=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); s.enemies[0].intel=1; s.enemies[1].intel=2; s.enemies[1].cd=2; return warView_(s); })())`));
const f1=iv.foes.find(f=>f.intel===1), f2=iv.foes.find(f=>f.intel===2);
t(f1 && f1.cls && f1.odds && !('master' in f1) && !('np' in f1) && !('traits' in f1) && !('name' in f1), '只知道職階 → 有職階、位置、勝算，沒有御主／寶具／技能／真名', JSON.stringify(f1));
t(f2 && f2.master && f2.np && f2.npReady===false && Array.isArray(f2.traits) && f2.name, '看穿真名 → 御主、寶具、寶具還沒回魔、技能都攤開', JSON.stringify(f2));
t(!JSON.stringify(iv.foes.filter(f=>f.intel<2)).match(new RegExp(JSON.parse(E(`JSON.stringify(warNewGame_(__o).enemies.map(function(e){return e.name;}))`)).map(n=>n.replace(/[()]/g,'.')).join('|'))), '沒看穿的對手，畫面資料裡一個真名都沒有');
const bv=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); warAct_(s,{t:'rest'}); var e=s.enemies[0]; e.intel=1; warAct_(s,{t:'sortie',id:e.id}); var a=warView_(s).battle.info; e.intel=2; var b=warView_(s).battle.info; return {a:a,b:b}; })())`));
t(bv.a && bv.a.intel===1 && !bv.a.np && bv.b.np && bv.b.master, '戰鬥中的對手框跟著看穿程度攤開', JSON.stringify(bv));
const rest=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); var r=warAct_(s,{t:'rest'}); return r.ev.filter(function(e){return e.k==='rest';}).map(function(e){return e.num;}); })())`));
t(rest.every(n=>!/\+0/.test(n)), '滿血休養不會印「+0」', JSON.stringify(rest));

console.log('\n── ⑤ 開場：規則數字只有一份、召喚與開戰各有自己的一幕');
const rv=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); return {v:warView_(s).rules, r:warRules_(s), n:WAR_.NIGHTS, se:WAR_.SEALS}; })())`));
t(rv.v && rv.v.nights===rv.n && rv.v.seals===rv.se && JSON.stringify(rv.v)===JSON.stringify(rv.r), '畫面的規則數字直接取自 WAR_', JSON.stringify(rv));
const ld=JSON.parse(evalIn('handleGameAction('+JSON.stringify(JSON.stringify({action:'war_load',acctName:'沒開過局的人'}))+')'));
t(ld.success && ld.view===null && ld.rules && ld.rules.nights===rv.n, '還沒開局也拿得到規則（開局表單與「怎麼玩」要用）', JSON.stringify(ld));
const ps=E(`(function(){ var s=warNewGame_(__o); s.narr={seq:1,kind:'summon',facts:['召喚陣亮起。']}; return warNarrPrompt_(s); })()`);
const pst=E(`(function(){ var s=warNewGame_(__o); s.narr={seq:1,kind:'start',facts:['第 1 天。']}; return warNarrPrompt_(s); })()`);
t(ps.indexOf(E('WAR_SCENE_.summon'))>=0 && pst.indexOf(E('WAR_SCENE_.start'))>=0, '召喚、開戰的說書各帶自己的重點', ps.slice(-200));
const tl=(()=>{ const A2='時間帳號'; const R=u=>JSON.parse(evalIn('handleGameAction('+JSON.stringify(JSON.stringify(u))+')'));
  let caps=[]; ctx.__TL__=o=>{caps.push(o);}; evalIn('callGeminiAPI=function(p,s,c){ __TL__(p); return "嗯。"; }');
  R({action:'war_new',acctName:A2,pcName:'測',sex:'男',war:'5th'}); R({action:'war_narrate',acctName:A2});
  R({action:'war_act',acctName:A2,act:{t:'start'}}); R({action:'war_narrate',acctName:A2});
  R({action:'war_act',acctName:A2,act:{t:'rest'}}); R({action:'war_narrate',acctName:A2});
  R({action:'war_act',acctName:A2,act:{t:'hold'}}); R({action:'war_narrate',acctName:A2});
  return caps.map(p=>(p.match(/【此刻】[^。]*/)||[''])[0]); })();
t(/開始前/.test(tl[0]) && /第 1 天（2月2日）的白天/.test(tl[1]) && /第 1 天（2月2日）的白天/.test(tl[2]) && /第 1 天（2月2日）的夜晚/.test(tl[3]), '說書的【此刻】是事情發生的那一刻：召喚在開戰前、白天的事寫白天、固守到天亮的那一段仍是第 1 天夜裡', JSON.stringify(tl));
const dw=(()=>{ const A3='黎明帳號'; const R=u=>JSON.parse(evalIn('handleGameAction('+JSON.stringify(JSON.stringify(u))+')'));
  let caps=[]; ctx.__TL2__=o=>{caps.push(o);}; evalIn('callGeminiAPI=function(p,s,c){ __TL2__(p); return "嗯。"; }');
  R({action:'war_new',acctName:A3,pcName:'測',sex:'男',war:'5th'}); R({action:'war_narrate',acctName:A3}); R({action:'war_act',acctName:A3,act:{t:'start'}}); R({action:'war_narrate',acctName:A3}); R({action:'war_act',acctName:A3,act:{t:'rest'}}); R({action:'war_narrate',acctName:A3});
  evalIn(`(function(){ var ref=warLoad_('${A3}'), s=ref.st; var e=s.enemies.filter(function(x){return x.alive&&!x.fake;})[0]; e.arrive=1; e.intel=1; s.phase='night'; s.out=true; var ev=[]; warStartBattle_(s,e,'sortie',ev); e.hp=Math.round(e.mhp*0.2); s.battle.round=WAR_.ROUNDS+1; s.battle.dawn=true; s.battle.tele=''; warSave_(ref,'${A3}',s); })()`);
  const r=R({action:'war_act',acctName:A3,act:{t:'stance',s:'letgo'}}); R({action:'war_narrate',acctName:A3});
  return { ok:r.success, when:(caps.map(p=>(p.match(/【此刻】[^。]*/)||[''])[0]).pop()||'') }; })();
t(dw.ok && /黎明/.test(dw.when), '天亮的追擊／收手：說書的【此刻】寫黎明（不是夜晚）', JSON.stringify(dw));
const html=require('fs').readFileSync((process.env.GAS_DIR||require('path').join(__dirname,'../../gas'))+'/Script_War.html','utf8');
t(!/十四夜|14 夜|三劃/.test(html), '前端沒有寫死的夜數與令咒數');

console.log('\n── ⑥ 事件文字讀起來對');
const am=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); s.sv.fx=['stealth']; s.sv.skn={stealth:'氣息遮斷'}; warAct_(s,{t:'start'}); warAct_(s,{t:'rest'});
  var e=s.enemies[0]; e.intel=1; e.hp=e.mhp=99999; warAct_(s,{t:'sortie',id:e.id}); s.battle.intent='np'; e.cd=0; var r=warAct_(s,{t:'stance',s:'strike'}); return r.ev.map(function(x){return x.k;}); })())`));
t(am.indexOf('hit')>=0 && am.indexOf('np')>am.indexOf('hit'), '奇襲那一回合：先手打中，對方的寶具在後面', JSON.stringify(am));
const nw=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); var ev=[{k:'news',txt:'昨夜某處，某位消失了。'}]; s.draws=['那位 Saber與那位 Lancer（新都）','','「美杜莎」與那位 Caster（柳洞寺）'];
  s.phase='night'; warMorning_(s, ev); return ev.concat([{k:'left',txt:String(s.draws.length)}]); })())`));
const _canon=JSON.parse(E('JSON.stringify(WAR_CANON_EVENTS_.map(function(c){return c.txt+"。";}))'));
const news=nw.filter(x=>x.k==='news'&&_canon.indexOf(x.txt)<0);
t(nw.find(x=>x.k==='left').txt==='0' && news.length===2, '沒人倒下的交手併成一句，有人倒下的另外一句', JSON.stringify(news));
t(/那位 Saber與那位 Lancer（新都）、「美杜莎」與那位 Caster（柳洞寺）/.test(news[1].txt) && /1 處/.test(news[1].txt), '併起來的那句：照順序列出認得的、再報認不出的場數', news[1].txt);
const leak=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); warAct_(s,{t:'rest'}); var a=s.enemies[0], b=s.enemies[1]; a.intel=1; b.intel=1; a.arrive=b.arrive=1; a.hp=a.mhp=b.hp=b.mhp=99999;
  var ev=[]; warAutoBattle_(s,a,b,ev); var pending=(s.draws||[]).length; return {ev:ev.map(function(x){return x.txt;}), pending:pending, alive:a.alive&&b.alive}; })())`));
t(leak.alive && (leak.pending===1 && !leak.ev.some(x=>/（[^）]*）$/.test(x))), '平手的交手先存在戰局裡、不進當下的畫面（半夜被突襲打斷也不會漏半句）', JSON.stringify(leak));
const two=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); var a=s.enemies.filter(function(e){return e.cls==='Archer';}); if(a.length<2) return 'skip'; a[0].intel=1; a[1].intel=1; a[0].alive=a[1].alive=true; a[0].hp=a[1].hp=99999; a[0].mhp=a[1].mhp=99999; var ev=[]; warAutoBattle_(s,a[0],a[1],ev); return ev.concat((s.draws||[]).map(function(t){return {k:'draw',txt:t};})); })())`));
t(two!=='skip' && two.some(x=>/另一位 Archer/.test(x.txt)), '兩位 Archer 都還沒看穿 → 寫成「那位 Archer與另一位 Archer」', JSON.stringify(two));
const fb=E(`(function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); s.day=WAR_.NIGHTS; s.phase='night'; s.enemies.forEach(function(e,i){ e.alive = i===0; e.arrive=1; }); return warButtons_(s)[0].sub; })()`);
t(/最後一位/.test(fb) && !/1 位/.test(fb), '決戰只剩一位 → 不寫「剩下的 1 位都會現身」', fb);
const pr=JSON.parse(E(`JSON.stringify((function(){ var s=warNewGame_(__o); var ev=[]; var X={u:s.enemies[0],side:'foe',act:'np'}, Y={u:s.sv,side:'me',act:'probe'}; warStrike_(s,X,Y,ev); return ev[0].txt; })())`));
t(!/仍然已經|仍然只/.test(pr) && /傷害減半/.test(pr), '試探躲寶具的句子通順', pr);

const f4=JSON.parse(E(`JSON.stringify((function(){ var o=warSeedCtx_('4th'); o.name='測'; o.sex='男'; o.war='4th'; o.seed=3; var s=warNewGame_(o); warAct_(s,{t:'start'}); s.day=WAR_.NIGHTS; s.phase='night';
  var b=warButtons_(s)[0].label; var r=warAct_(s,{t:'final'}); s.narr={seq:1,kind:'battle',facts:r.ev.map(function(e){return e.txt;})}; return {b:b, ev:r.ev.map(function(e){return e.txt;}).join(''), rules:warView_(s).rules.finalPlace, lore:warLoreStr_(s)}; })())`));
t(f4.b==='前往冬木市民會館' && /冬木市民會館降臨/.test(f4.ev) && !/柳洞寺/.test(f4.ev+f4.b) && f4.rules==='冬木市民會館', '第四次的最後一夜在冬木市民會館（原作），不是柳洞寺', JSON.stringify(f4));
t(/剛落成/.test(f4.lore) && !/大空洞/.test(f4.lore), '第四次決戰夜的世界書給市民會館、不給大聖杯的條目', f4.lore);
const f5=E(`(function(){ var s=warNewGame_(__o); warAct_(s,{t:'start'}); s.day=WAR_.NIGHTS; s.phase='night'; return warButtons_(s)[0].label; })()`);
t(f5==='前往柳洞寺', '第五次照舊是柳洞寺');

const era=w=>E(`(function(){ var o=warSeedCtx_('${w}'); o.name='測'; o.sex='男'; o.war='${w}'; o.seed=7; var s=warNewGame_(o); s.narr={seq:1,kind:'day',facts:['休息。']}; return warNarrPrompt_(s); })()`);
const e5=era('5th'), e4=era('4th'), ec=era('chaos');
t(/【這場戰爭】第五次.*多出來的那一組/.test(e5) && /【這場戰爭】第四次.*十年前/.test(e4) && /【這場戰爭】一場陣容錯亂/.test(ec), '說書知道是哪一場戰爭、玩家是多出來的一組', [e5,e4,ec].map(x=>(x.match(/【這場戰爭】[^\n]*/)||[''])[0]).join(' / '));

const boss=w=>E(`(function(){ var o=warSeedCtx_('5th'); o.name='測'; o.sex='男'; o.war='5th'; o.seed=7; var s=warNewGame_(o); var e=s.enemies.filter(function(x){return x.hero==='EMIYA-Archer';})[0]; e.intel=${w}; s.narr={seq:1,kind:'battle',foe:e.id,facts:['交手。']}; return (warNarrPrompt_(s).match(/【對手】[^\\n]*/)||[''])[0]; })()`);
t(/身後的御主是遠坂凜（黑色長髮綁成雙馬尾/.test(boss(2)) && !/遠坂凜/.test(boss(1)), '看穿真名才告訴說書對手的御主是誰、長什麼樣子', boss(2)+' / '+boss(1));
t(/高大的神父/.test(E(`warMasterLook_({war:'5th'},'言峰綺禮')`)) && /年輕的神父/.test(E(`warMasterLook_({war:'4th'},'言峰綺禮')`)) && /雙馬尾/.test(E(`warMasterLook_({war:'chaos'},'遠坂凜')`)) && E(`warMasterLook_({war:'5th'},'Caster')`)==='', '同名的御主照這場戰爭挑樣子（綺禮第四次年輕、第五次高大）；職階代稱沒有樣子');
t(E('SEED_MASTERS').every(m=>m.look&&!/傲|冷酷|溫柔|高傲|陰沉|輕浮|壓抑|優雅/.test(m.look)), '每位御主都有樣子，而且只寫看得見的（不寫個性字眼）');

console.log(bad ? '❌ '+bad+' 條失敗' : '✅ warlore.js '+ok+' 條全過');
