// 🕯️ 第四次的開場假死：百貌哈桑一開戰就「退場」，畫面、目標、敵數都照死了算；它第一次真的出手才露餡。
const S=require('../war_sim.js'); const c=S.ctx, E=S.E;
let ok=0,bad=0; const t=(cond,l,x)=>{ if(cond){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x!==undefined?'  '+String(x).slice(0,200):''));} };
const seeds={}; E('SEED_SERVANTS').forEach(s=>seeds[s.id]=s); const mn={}; E('SEED_MASTERS').forEach(m=>mn[m.id]=m.name);
const saber=E('SEED_SERVANTS').filter(s=>s.id==='阿爾托莉雅-Saber');
const mk=(war,pl)=>c.warNewGame_({pool:pl||saber,roster:E(war==='4th'?'FATE_4TH_ROSTER':'FATE_5TH_ROSTER'),seeds,masterNames:mn,name:'測',sex:'男',war,seed:5});
let st=mk('4th'); const r0=c.warAct_(st,{t:'start'}); const r={ev:[]}; st.phase='night'; c.warMorning_(st,r.ev);
t(!r0.ev.some(x=>/遠坂邸/.test(x.txt)),'第一天白天還沒發生（那是第一夜的事）');
const h=st.enemies.find(e=>e.hero==='百貌哈桑-Assassin');
t(h&&h.fake&&h.alive,'第二天早報後：哈桑其實活著、標成假死');
t(r.ev.some(x=>/遠坂邸/.test(x.txt)&&/退場/.test(x.txt)),'第二天早報才有原作那段死訊',JSON.stringify(r.ev.map(x=>x.txt)));
const v=c.warView_(st), card=v.foes.find(f=>f.id===h.id);
t(card&&card.alive===false&&!card.hp,'畫面上照「已退場」顯示',JSON.stringify(card));
t(v.alive===c.warAliveCount_(st)-1,'畫面的敵數不算它（勝負還是算）',v.alive+' vs '+c.warAliveCount_(st));
t(!c.warKnownFoes_(st).some(e=>e.id===h.id),'不能把它當突襲目標');
st.phase='night'; const ev=[]; c.warStartBattle_(st,h,'defend',ev);
t(!h.fake&&ev.some(x=>/沒有退場/.test(x.txt)),'第一次真的交手就露餡',JSON.stringify(ev.map(x=>x.txt)));
st=mk('4th'); c.warAct_(st,{t:'start'}); st.phase='night'; c.warMorning_(st,[]); const h2=st.enemies.find(e=>e.hero==='百貌哈桑-Assassin'), o=st.enemies.find(e=>e!==h2&&e.alive); const ev2=[];
c.warAutoBattle_(st,h2,o,ev2); t(!h2.fake&&ev2.some(x=>/沒有退場/.test(x.txt)),'跟別的從者打起來也會露餡（早報）');
const s1=mk('4th'); c.warAct_(s1,{t:'start'}); const h1=s1.enemies.find(e=>e.hero==='百貌哈桑-Assassin');
t(!h1.fake&&c.warView_(s1).alive===c.warAliveCount_(s1),'第一天：還是普通的未知敵人，敵數照算');
s1.met=[h1.id]; s1.phase='night'; const evm=[]; c.warMorning_(s1,evm);
t(!h1.fake&&!evm.some(x=>/遠坂邸/.test(x.txt)),'第一夜就跟它交過手：假死那場戲跳過');
const s5=mk('5th'); t(!s5.enemies.some(e=>e.fake),'第五次沒有這回事');
console.log('── 原作事件表');
const emiya=E('SEED_SERVANTS').filter(s=>s.id==='EMIYA-Archer');
const run=(war,days)=>{ const st=mk(war,emiya); c.warAct_(st,{t:'start'}); const out=[]; for(let d=0;d<days;d++){ const ev=[]; st.phase='night'; st.battle=null; c.warMorning_(st,ev); out.push(...ev.map(x=>x.txt)); } return {st,out}; };
let R=run('5th',3); const hb=R.st.enemies.find(e=>e.hero==='赫拉克勒斯-Berserker');
t(R.out.some(x=>/白髮的少女/.test(x))&&hb.intel>=1,'第五次第 2 天：坡道上的伊莉雅（看穿職階與據點；原作召喚 Saber 那一夜）',JSON.stringify(R.out));
R=run('4th',8); const isk=R.st.enemies.find(e=>e.hero==='伊斯坎達爾-Rider'), dl=R.st.enemies.find(e=>e.hero==='迪盧木多-Lancer');
t(R.out.some(x=>/倉庫街/.test(x))&&isk.intel===2,'第四次第 2 天：倉庫街，征服王自報真名（直接看穿）');
t(R.out.some(x=>/海特飯店/.test(x))&&dl.loc==='廢棄工廠','第 5 天：飯店被炸，迪盧木多搬到廢棄工廠');
R=run('4th',11); const gd=R.st.enemies.find(e=>e.hero==='吉爾德萊-Caster'), la=R.st.enemies.find(e=>e.hero==='蘭斯洛特-Berserker');
t(R.out.some(x=>/黑霧般的騎士/.test(x))&&la.intel>=1,'第四次第 3 天：黑騎士接住金色英靈的寶具擲回去');
t(R.out.some(x=>/海魔/.test(x))&&gd.intel===2&&gd.loc==='未遠川','第四次第 10 天：未遠川的海魔，吉爾德萊真名曝光、據點移到河上',JSON.stringify({i:gd.intel,l:gd.loc}));
R=run('4th',14); { const E4=h=>R.st.enemies.find(e=>e.hero===h), all=R.out.join('\n');
  const bh=E4('百貌哈桑-Assassin');
  t(!bh.alive&&bh.canonDead&&/沒有退場/.test(all)&&/征服王的軍勢把他們全數踏平/.test(all),'第四次第 8 天：假死的百貌哈桑在聖杯問答現身，被王之軍勢踏平');
  t(!E4('迪盧木多-Lancer').alive&&!E4('吉爾德萊-Caster').alive&&!E4('伊斯坎達爾-Rider').alive,'迪盧木多被令咒逼死、元帥沉進未遠川、征服王倒在冬木大橋');
  t(!E4('蘭斯洛特-Berserker').alive&&E4('蘭斯洛特-Berserker').intel===2,'地下停車場：Saber 叫出蘭斯洛特的名字');
  t(E4('阿爾托莉雅-Saber').alive&&E4('吉爾伽美什-Archer').alive,'照原作走到最後：剩 Saber 與金色的王');
  t(E4('吉爾伽美什-Archer').master==='言峰綺禮'&&/自己送出去的短劍/.test(all),'第 9 天：時臣被自己送的短劍刺死，金色的王換成綺禮當御主');
  const iDl=R.out.findIndex(x=>/兩把槍貫穿/.test(x)), iRiver=R.out.findIndex(x=>/光之劍把海魔/.test(x)), iBreak=R.out.findIndex(x=>/折斷了自己的黃槍/.test(x));
  t(iRiver>=0&&iBreak>iRiver&&iDl>iBreak,'迪盧木多照原作：未遠川折斷黃槍在先，被令咒逼死在後',[iRiver,iBreak,iDl].join());
  const iri=['站不穩','下不了床','擄走'].map(k=>R.out.filter(x=>new RegExp(k).test(x)&&/白髮的女性|白髮女性/.test(x)).length);
  t(iri.join()==='1,2,1','愛麗絲菲爾：倒下的越多越虛弱，三段各發一次（第二段的句子在第三段也提到下不了床）',iri.join()); }
{ const st=mk('4th',emiya); c.warAct_(st,{t:'start'}); const sb=st.enemies.find(e=>e.hero==='阿爾托莉雅-Saber'); sb.hp=0; sb.alive=false;
  const o=[]; for(let d=0;d<8;d++){ const ev=[]; st.phase='night'; st.battle=null; c.warMorning_(st,ev); o.push(...ev.map(x=>x.txt)); }
  t(!o.some(x=>/酒席/.test(x))&&st.enemies.find(e=>e.hero==='百貌哈桑-Assassin').alive,'聖杯問答沒發生（Saber 先倒下）→ 百貌哈桑那一幕也不會在「酒席上」發生'); }
{ const st=mk('4th',emiya); c.warAct_(st,{t:'start'}); st.enemies.slice(0,5).forEach(e=>{ e.hp=0; e.alive=false; });
  const n=[]; for(let d=0;d<3;d++){ const ev=[]; st.phase='night'; st.battle=null; c.warMorning_(st,ev); n.push(ev.filter(x=>/白髮的女性|白髮女性/.test(x.txt)).length); }
  t(n.join()==='1,1,1','一口氣倒下五位：愛麗絲菲爾一個早上只往前一段',n.join()); }
{ const st=mk('4th',emiya); c.warAct_(st,{t:'start'}); const dl=st.enemies.find(e=>e.hero==='迪盧木多-Lancer'); dl.hp=1; c.warApply_(st,{u:dl,side:'foe'},99);
  for(let d=0;d<12;d++){ st.phase='night'; st.battle=null; c.warMorning_(st,[]); }
  c.warOver_(st,false,'timeout',[]); const d=c.warDebrief_(st);
  t(d.route&&d.route.label===''&&d.route.rewrote.indexOf('被令咒逼死的騎士')>=0,'第四次沒有路線，但結局照樣列出你改寫了哪一幕',JSON.stringify(d.route)); }
const st4=mk('4th',emiya); c.warAct_(st4,{t:'start'}); st4.enemies.find(e=>e.hero==='伊斯坎達爾-Rider').alive=false; const ev4=[]; st4.day=1; st4.phase='night'; c.warMorning_(st4,ev4);
t(!ev4.some(x=>/倉庫街/.test(x.txt)),'涉及的從者已經倒下 → 那條事件整條跳過');
const allHeroes=new Set(E('SEED_SERVANTS').map(s=>s.id)); const evs=E('WAR_CANON_EVENTS_');
t(evs.every(v=>(v.need||[]).concat(Object.keys(v.reveal||{}),Object.keys(v.move||{})).every(h=>allHeroes.has(h))),'事件表點名的從者都存在（改名會叫）');
{ const s4=mk('4th',emiya); c.warAct_(s4,{t:'start'}); const v=c.warView_(s4);
  s4.day=12; s4.phase='night'; const b=c.warButtons_(s4)[0];
  t(c.warNights_(s4)===12&&v.nights===12&&b.t==='final'&&c.warNights_({war:'5th'})===14,'第四次照原作 12 夜（第 12 夜決戰），第五次 14 夜',JSON.stringify({n:v.nights,b:b.t}));
  const last=Math.max(...E('WAR_CANON_EVENTS_').filter(x=>x.war==='4th'&&x.day).map(x=>x.day));
  t(last<12,'第四次每一幕原作事件都排在決戰夜之前',last); }
{ const s5=mk('5th',emiya); c.warAct_(s5,{t:'start'}); const ev=[]; s5.phase='night'; c.warMorning_(s5,ev); const m=ev.find(x=>x.k==='morning').txt;
  const s4=mk('4th',emiya); c.warAct_(s4,{t:'start'}); const e4=[]; s4.phase='night'; c.warMorning_(s4,e4); const m4=e4.find(x=>x.k==='morning').txt;
  t(/第 2 天早晨（2月3日）/.test(m)&&c.warDate_(s5,14)==='2月15日'&&c.warView_(s5).date==='2月3日'&&!/月/.test(m4),'第五次照原作日曆：第 1 天＝2/2、第 14 夜＝2/15（決戰）；第四次沒有可靠日期就只寫第幾天',m+' / '+m4); }
console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
