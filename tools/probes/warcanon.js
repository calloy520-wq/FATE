// ⚔️ 招牌技能照原作：每一條都要真的在規則裡發生（十二試煉多條命、因果逆轉、王之財寶、天之鎖×神性…），逸話照樣列出。
const vm=require('vm'),fs=require('fs');
const GAS=process.env.GAS_DIR||require('path').join(__dirname,'../../gas');
const c={console}; vm.createContext(c);
for (const f of ['Seed_Codex.gs','Seed_Rivals.gs','War_Engine.gs']) vm.runInContext(fs.readFileSync(GAS+'/'+f,'utf8'),c,{filename:f});
const E=x=>vm.runInContext(x,c);
let ok=0,bad=0; const t=(cond,l,x)=>{ if(cond){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x!==undefined?'  '+String(x).slice(0,200):''));} };
const U=id=>E(`warUnit_(SEED_SERVANTS.filter(function(s){return s.id===${JSON.stringify(id)};})[0],{})`);
const st=()=>E(`({rs:7,master:{hp:100,mhp:100},exposed:false})`);

console.log('── 十二試煉：整場戰爭 11 條命，重擊連殺數次');
let h=U('赫拉克勒斯-Berserker'); c.h=h; c.S=st();
t(E('warLives_(h)')===11,'一開始 11 條命',E('warLives_(h)'));
h.hp=10; let r=E(`warApply_(S,{u:h,side:'foe'},15)`);
t(r==='life'&&h.lives===10&&h.hp>0&&h.alive!==false,'致命一擊→用掉一條命、站起來',JSON.stringify({r,lives:h.lives,hp:h.hp}));
const per=Math.round(h.mhp*E('WAR_SKILL_.god_hand.revive'));
h.hp=5; r=E(`warApply_(S,{u:h,side:'foe'},${5+per*2+3})`);
t(r==='life'&&h.lives===7&&h.lastLost===3,'一擊夠重：連殺三次',JSON.stringify({lives:h.lives,lost:h.lastLost}));
h.lives=0; h.hp=5; r=E(`warApply_(S,{u:h,side:'foe'},50)`);
t(!r&&h.hp===0&&h.alive===false,'命用完就真的倒下',JSON.stringify({r,hp:h.hp,alive:h.alive}));
h=U('赫拉克勒斯-Berserker'); h.broken=true; h.hp=5; c.h=h; r=E(`warApply_(S,{u:h,side:'foe'},50)`);
t(!r&&h.alive===false,'被破戒全咒破除加護時，十二試煉也失效');
h=U('赫拉克勒斯-Berserker'); c.h=h;
t(E('warTraits_(h)').some(x=>/十二試煉.*剩 11 次/.test(x)),'技能列上看得到剩幾條命',E('JSON.stringify(warTraits_(h))'));
const odds0=(()=>{ c.me=U('阿爾托莉雅-Saber'); c.S2={sv:c.me,exposed:false}; return E('warOddsR_(S2,h)'); })();
h.lives=0; const odds1=E('warOddsR_(S2,h)');
t(odds1>odds0*1.5,'勝算有把命算進去（命多的時候明顯更凶險）',odds0.toFixed(2)+' → '+odds1.toFixed(2));

console.log('── 因果逆轉：試探的防備擋不住刺穿死棘之槍');
const dmgNp=(att,defAct)=>{ c.A=U(att); c.Z=U('EMIYA-Archer'); c.Z.hp=9999; c.Z.mhp=9999; c.S=st(); c.S.sv=c.Z;
  const ev=[]; c.ev=ev; E(`warStrike_(S,{u:A,act:'np',side:'foe',knows:false},{u:Z,act:${JSON.stringify(defAct)},side:'me'},ev)`); return 9999-c.Z.hp; };
t(dmgNp('庫丘林-Lancer','probe')===dmgNp('庫丘林-Lancer','strike'),'庫丘林：對方試探時寶具傷害不減半');
t(dmgNp('迪盧木多-Lancer','probe')<dmgNp('迪盧木多-Lancer','strike')*0.6,'沒有這個技能的人照常減半');

console.log('── 王之財寶：真名未明也打得中弱點');
c.G=U('吉爾伽美什-Archer'); c.D=U('迪盧木多-Lancer');
t(Math.abs(E('warMult_({u:G,knows:false},{u:D})')-E('WAR_.WEAK'))<1e-9,'吉爾伽美什不必看穿真名就有弱點加成');
t(E('warMult_({u:D,knows:false},{u:G})')===1,'其他人沒看穿就沒有');

console.log('── 天之鎖×神性、神殺');
c.En=U('恩奇都-Lancer'); c.Is=U('伊斯坎達爾-Rider');
t(E('warRetreatChance_(G,En,false)')===0,'有神性的吉爾伽美什在天之鎖前撤退不了');
t(E('warRetreatChance_(D,En,false)')>0,'沒有神性的人還是有機會撤退');
t(E('warRetreatChance_(G,En,true)')===1,'令咒強制撤離不受影響');
c.Sc=U('斯卡哈-Lancer');
t(E('warMul_(Sc,"dmgDealt",Is)')===1.25&&E('warMul_(Sc,"dmgDealt",D)')===1,'神殺只對有神性的對手加傷');

console.log('── 其餘招牌');
c.Sa=U('阿爾托莉雅-Saber'); c.S=st(); c.ev=[]; c.Sa.intel=1;
E('warReveal_(S,Sa,ev)');
t(c.Sa.intel===1&&/看不出/.test(c.ev.map(x=>x.txt).join('')),'風王結界：試探與打聽看不穿 Saber 的真名',JSON.stringify(c.ev));
t(E('warMul_(D,"dmgTaken",Sa)')===0.8&&E('warMul_(D,"dmgTaken",G)')===1,'愛之痣只對女性對手有效');
t(E('warMul_(Sa,"hitTaken",D)')===1&&E('warMul_(Sa,"hitTaken",G)')<1,'破魔紅薔薇：對手的閃避加護對迪盧木多無效');
c.Em=U('EMIYA-Archer');
t(E('warAdd_(Em,"clash")')>0,'無限劍製：寶具對轟時佔優');
t(E('warMul_(Em,"npTaken",Sa)')<1&&E('warMul_(Em,"npTaken",D)')===1,'熾天覆七重圓環：受到的寶具傷害減少（破魔紅薔薇照樣穿透）');
c.Ko=U('佐佐木小次郎-Assassin');
t(E('warAdd_(Ko,"hitUp")')>0,'燕返：正面攻擊命中率提高');
c.Hh=U('百貌哈桑-Assassin'); c.Hc=U('咒腕之哈桑-Assassin');
t(E('warAdd_(Hh,"scoutExtra")')>=2&&E('warMul_(Hc,"npDealt")')>1,'妄想幻像多查兩處、妄想心音寶具加傷');

console.log('── 逸話：沒有戰鬥效果的原作技能照樣列出');
c.Me=U('美狄亞-Caster');
t(E('warTraits_(Me)').indexOf('金羊毛（逸話）')>=0,'美狄亞的金羊毛列為逸話',E('JSON.stringify(warTraits_(Me))'));
t(!E('warTraits_(Sa)').some(x=>/誓約勝利之劍/.test(x)),'跟寶具同名的技能不重複列');
const allLore=E(`JSON.stringify(SEED_SERVANTS.filter(function(s){return s.cls!=='御主';}).map(function(s){ return warUnit_(s,{}).lore; }))`);
t(JSON.parse(allLore).every(a=>Array.isArray(a)),'每位從者都帶著逸話清單（可以是空的）');
c.old=U('美狄亞-Caster'); delete c.old.lore; delete c.old.lives;
t(Array.isArray(E('warTraits_(old)')),'舊存檔沒有 lore／lives 也照常顯示');

console.log('── 稽核抓到的四個洞（2026-09-29）');
const seedsAll={}; E('SEED_SERVANTS').forEach(x=>seedsAll[x.id]=x); const mn={}; E('SEED_MASTERS').forEach(m=>mn[m.id]=m.name);
const game=(hero,war)=>c.warNewGame_({pool:E('SEED_SERVANTS').filter(x=>x.id===hero),roster:E(war==='4th'?'FATE_4TH_ROSTER':'FATE_5TH_ROSTER'),seeds:seedsAll,masterNames:mn,name:'測',sex:'男',war:war||'5th',seed:3});
let g=game('赫拉克勒斯-Berserker'); c.warAct_(g,{t:'start'}); let rr=c.warAct_(g,{t:'supply'});
t(!rr.ev.some(x=>/寶具/.test(x.txt+(x.num||''))),'常駐寶具的從者補魔：說書與畫面都不再說「寶具就緒」',JSON.stringify(rr.ev));
g=game('阿爾托莉雅-Saber'); c.warAct_(g,{t:'start'}); c.warAct_(g,{t:'rest'});
g.enemies.forEach((e,i)=>{ if(i>0) e.alive=false; }); let e0=g.enemies[0]; e0.intel=1; e0.hp=1; e0.fx=[]; c.warAct_(g,{t:'sortie',id:e0.id});
g.sv.cd=3; g.master.hp=20; rr=c.warAct_(g,{t:'stance',s:'np',seal:true});
t(!rr.ok&&/御主/.test(rr.msg),'御主的血付不起就不能硬放（按了會把自己拚死）',JSON.stringify(rr));
g.master.hp=35; rr=c.warAct_(g,{t:'stance',s:'np',seal:true});
t(g.phase==='over'&&g.result.win===true,'最後一擊同時把御主拚到見底：仍算奪下聖杯',JSON.stringify(g.result));
g=game('EMIYA-Archer'); c.warAct_(g,{t:'start'}); c.warAct_(g,{t:'rest'}); const sab=g.enemies.find(x=>x.hero==='阿爾托莉雅-Saber'); sab.intel=1; c.warAct_(g,{t:'sortie',id:sab.id});
const pb=c.warButtons_(g).find(x=>x.s==='probe');
t(pb&&!/看穿真名/.test(pb.sub),'打風王結界的 Saber：試探鈕不再承諾看穿真名',pb&&pb.sub);
c.hh=U('赫拉克勒斯-Berserker'); c.hh.broken=true; delete c.hh.lives;
t(E('warLives_(hh)')===11&&E('warTraits_(hh)').some(x=>/剩 11 次/.test(x)),'被破戒全咒打過：十二試煉的命數照樣是 11（不是 0）');
console.log('── 必滅黃薔薇：記下實際傷害，那一段好不了，直到迪盧木多倒下');
{ const S0=st(); c.S0=S0; c.Dl=U('迪盧木多-Lancer'); c.Sb=U('阿爾托莉雅-Saber'); c.Sb.mhp=1000; c.Sb.hp=1000; S0.sv=c.Sb; S0.enemies=[c.Dl]; c.ev2=[];
  E("warCurse_(S0,{u:Dl,side:'foe'},{u:Sb,side:'me'},ev2,120)"); c.Sb.hp=880;
  t(c.Sb.curseDmg===120&&c.ev2.some(x=>/癒合不了/.test(x.txt)),'黃槍造成 120 點傷：記成 120，並說出來',c.Sb.curseDmg);
  E("warCurse_(S0,{u:Dl,side:'foe'},{u:Sb,side:'me'},ev2,30)"); c.Sb.hp=500;
  t(c.Sb.curseDmg===150&&c.ev2.length===1,'再中一槍累加（只講第一次）',c.Sb.curseDmg);
  E('warHeal_(Sb,1)');
  t(c.Sb.hp===850,'回滿也只到 最大血量−黃槍之傷（別的傷照常好）',c.Sb.hp);
  c.Dl.hp=1; E("warApply_(S0,{u:Dl,side:'foe'},50)"); E('warHeal_(Sb,1)');
  t(!c.Sb.cursedBy&&!c.Sb.curseDmg&&c.Sb.hp===1000,'迪盧木多倒下：詛咒解除，這才回得滿',c.Sb.hp); }
console.log('── 玩家是額外加入的一組：第五次／第四次不搶原作從者，混亂隨機抽 7 組');
{ const J=x=>JSON.parse(E('JSON.stringify('+x+')'));
  for (const w of ['5th','4th']) {
    const o=J(`warSetup_('${w}')`), canon=o.roster.map(x=>x.hero);
    t(o.pool.length>0&&o.pool.every(s=>canon.indexOf(s.id)<0),w+'：召喚池裡沒有這場的原作從者',o.pool.map(s=>s.id).join());
    t(J(`warCanonHeroes_('${w}')`).join()===canon.join(),w+'：前端拿到的「已有御主」名單＝名冊');
    const seen={}; for (let seed=1;seed<=30;seed++){ const g=J(`(function(){ var o=warSetup_('${w}'); o.name='測'; o.sex='男'; o.war='${w}'; o.seed=${seed}; var s=warNewGame_(o); return {sv:s.sv.hero, foes:s.enemies.map(function(e){return e.hero;})}; })()`); seen.n=(seen.n||0)+g.foes.length; if(canon.indexOf(g.sv)>=0) seen.bad=g.sv; if(g.foes.length!==canon.length) seen.len=g.foes.length; }
    t(!seen.bad&&!seen.len,w+'：隨機召喚 30 局都不是原作從者，敵方原作全員到齊',JSON.stringify(seen)); }
  const ch=J(`warSetup_('chaos')`);
  t(ch.chaos===true&&J(`warCanonHeroes_('chaos')`).length===0,'混亂隨機：沒有「已有御主」的限制');
  const lens={}, heroes={}; for (let seed=1;seed<=30;seed++){ const g=J(`(function(){ var o=warSetup_('chaos'); o.name='測'; o.sex='男'; o.war='chaos'; o.seed=${seed}; var s=warNewGame_(o); return {sv:s.sv.hero, foes:s.enemies.map(function(e){return e.hero;}), fake:s.enemies.some(function(e){return e.fake||e.fakeTxt;})}; })()`);
    lens[g.foes.length]=1; g.foes.forEach(h=>heroes[h]=1); if(g.foes.indexOf(g.sv)>=0) lens.dup=g.sv; if(g.fake) lens.fake=1; }
  t(Object.keys(lens).join()===String(E('WAR_CHAOS_.size')),'混亂隨機：每局 '+E('WAR_CHAOS_.size')+' 組對手、不會撞到自己的從者、沒有原作劇本的假死',JSON.stringify(lens));
  t(Object.keys(heroes).length>E('WAR_CHAOS_.size'),'混亂隨機：30 局抽到的從者不只固定那幾位（'+Object.keys(heroes).length+' 位）'); }
console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
