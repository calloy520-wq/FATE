// 🔀 第五次的三條路線（WAR_ROUTES_）：開局暗中抽一條，早報照那條線的原作事件走；先打倒涉及的從者就改寫原作，結局才揭曉。
const S=require('../war_sim.js'); const c=S.ctx, E=S.E;
let ok=0,bad=0; const t=(cond,l,x)=>{ if(cond){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x!==undefined?'  '+String(x).slice(0,240):''));} };
const J=x=>JSON.parse(E('JSON.stringify('+x+')'));
const pool=E("warSetup_('chaos').pool").filter(s=>s.id==='恩奇都-Lancer');
const mk=(war,route,seed)=>{ const o=c.warSetup_(war); o.name='測'; o.sex='男'; o.war=war; o.seed=seed||5; o.pool=pool; if(route) o.route=route; const st=c.warNewGame_(o); c.warAct_(st,{t:'start'}); return st; };
// 只過早報（不打仗、敵人也不互打）：原作事件照表走
const toDay=(st,day)=>{ const out=[]; while(st.day<day&&st.phase!=='over'){ const ev=[]; st.phase='night'; st.battle=null; c.warMorning_(st,ev); out.push(...ev.map(x=>({k:x.k,txt:x.txt,day:st.day}))); } return out; };
const H=(st,h)=>st.enemies.find(e=>e.hero===h);

console.log('── 抽線');
{ const seen={}; for(let s=1;s<=60;s++) seen[mk('5th','',s).route]=1;
  t(Object.keys(seen).sort().join()==='fate,hf,ubw','第五次：三條線都抽得到',Object.keys(seen).join());
  t(!mk('4th').route&&!mk('chaos').route,'第四次與混亂隨機沒有路線');
  t(mk('5th','hf').route==='hf','指定路線（探針與模擬器用）');
  const rows=J('WAR_CANON_EVENTS_'), R=J('WAR_ROUTES_'), A=J('WAR_ALTER_');
  t(rows.every(r=>!r.route||(R[r.war]&&R[r.war][r.route])),'事件表的 route 都是存在的路線');
  t(rows.every(r=>(r.kill||[]).concat(r.alter||[]).every(h=>(r.need||[]).indexOf(h)>=0)),'kill／alter 點名的從者都列在 need（這一幕的主角；master／move／reveal 可以點名不一定在場的人）');
  t(rows.every(r=>(r.alter||[]).every(h=>A[h])),'alter 的從者在 WAR_ALTER_ 有樣子'); }

console.log('── 不外洩：遊戲中看不到路線');
{ const st=mk('5th','hf'); const v=JSON.stringify(c.warView_(st));
  t(!/Heaven|hf|route/.test(v),'畫面資料沒有路線');
  t(!st.enemies.some(e=>e.hero==='咒腕之哈桑-Assassin')&&st.reserve.some(e=>e.hero==='咒腕之哈桑-Assassin'),'真 Assassin 是預備役：不在敵方名冊、不算敵數'); }

console.log("── Heaven's Feel 線");
{ const st=mk('5th','hf'); const out=toDay(st,12); const txt=out.map(x=>x.txt).join('\n');
  const dead=h=>{ const e=H(st,h); return e&&!e.alive&&e.canonDead; };
  t(dead('佐佐木小次郎-Assassin')&&/胸口伸了出來/.test(txt),'第 3 天：山門的武士被撕開');
  const ha=H(st,'咒腕之哈桑-Assassin'); t(ha&&ha.arrive===4&&out.some(x=>x.k==='arrive'&&x.day===4&&/白骨面具/.test(x.txt)),'第 4 天：戴白骨面具的暗殺者登場',ha&&ha.arrive);
  t(dead('庫丘林-Lancer')&&dead('美狄亞-Caster'),'槍兵與魔女被黑影吞下');
  t(H(st,'美杜莎-Rider').master==='間桐櫻','騎兵換成櫻的從者');
  const sa=H(st,'阿爾托莉雅-Saber'), base=J("warUnit_(SEED_SERVANTS.filter(function(s){return s.id==='阿爾托莉雅-Saber';})[0],{})");
  t(sa.alter&&sa.name==='阿爾托莉雅〔Alter〕'&&sa.atk>base.atk&&sa.mhp>base.mhp&&sa.loc==='柳洞寺'&&sa.master==='間桐櫻','第 8 天：Saber 黑化（變強、換御主、進柳洞寺）',JSON.stringify({n:sa.name,atk:sa.atk,b:base.atk}));
  t(/漆黑/.test(sa.card.look),'說書拿到的外貌也換成黑化後的');
  t(sa.fx.indexOf('wind_strike')<0&&J("warUnit_(SEED_SERVANTS.filter(function(s){return s.id==='阿爾托莉雅-Saber';})[0],{})").fx.indexOf('wind_strike')>=0,'黑化後不再用風王結界藏劍（打聽不再被遮）');
  const hb=H(st,'赫拉克勒斯-Berserker');
  t(hb.alive&&hb.alter&&hb.master==='間桐櫻'&&c.warLives_(hb)===11,'第 10 天：巨人被黑影吞下成了黑化的狂戰士（十二試煉還在）',JSON.stringify({a:hb.alter,m:hb.master}));
  t(dead('吉爾伽美什-Archer'),'第 11 天：金色的王被黑泥吞下');
  t(!out.some(x=>x.k==='fall'),'照原作倒下的不播「提前倒下」的餘波');
  t(c.warFinal_(st).place==='大空洞','決戰地換成大空洞');
  c.warOver_(st,false,'timeout',[]); const d=c.warDebrief_(st);
  t(d.route&&d.route.label==="Heaven's Feel 線"&&d.route.rewrote.length===0,'結局揭曉路線；照原作走完就沒有改寫',JSON.stringify(d.route)); }

console.log('── Unlimited Blade Works 線');
{ const st=mk('5th','ubw'); toDay(st,12);
  const sa=H(st,'阿爾托莉雅-Saber');
  t(!H(st,'美杜莎-Rider').alive,'第 5 天：騎兵倒在柳洞寺');
  t(sa.loc==='柳洞寺'&&sa.master==='遠坂凜','Saber 先被 Caster 奪走、Caster 死後與凜結約',sa.master);
  t(!H(st,'赫拉克勒斯-Berserker').alive&&!H(st,'美狄亞-Caster').alive&&!H(st,'庫丘林-Lancer').alive,'巨人、魔女、槍兵照原作倒下');
  t(H(st,'吉爾伽美什-Archer').master==='間桐慎二'&&H(st,'EMIYA-Archer').alive,'金色的王換成慎二當御主；紅衣弓兵還在');
  t(c.warFinal_(st).place==='柳洞寺','決戰照舊在柳洞寺'); }

console.log('── Fate 線');
{ const st=mk('5th','fate'); toDay(st,10);
  t(!H(st,'美杜莎-Rider').alive&&H(st,'阿爾托莉雅-Saber').intel===2,'第 7 天：天馬墜落，Saber 報出劍名（真名曝光）');
  t(!H(st,'美狄亞-Caster').alive&&H(st,'吉爾伽美什-Archer').intel>=1,'第 9 天：金色的英靈在教會前斬倒魔女'); }

console.log('── 玩家改寫原作');
{ const st=mk('5th','hf'); toDay(st,5);
  const sa=H(st,'阿爾托莉雅-Saber'), ev=[]; sa.hp=1; c.warApply_(st,{u:sa,side:'foe'},99); c.warCanonFall_(st,sa,ev);
  const out=toDay(st,12);
  t(!out.some(x=>/染成漆黑/.test(x.txt))&&!out.some(x=>/黑色的劍光/.test(x.txt)),'Saber 先倒下：黑化與「黑色的劍光」都不會發生');
  t(H(st,'赫拉克勒斯-Berserker').alive&&!H(st,'赫拉克勒斯-Berserker').alter,'巨人因此沒有被黑影吞下');
  c.warOver_(st,false,'timeout',[]); const d=c.warDebrief_(st);
  t(d.route.rewrote.join()==='被黑影吞下的騎士王,黑色的劍光與巨人','結局列出被改寫的兩幕',d.route.rewrote.join()); }

{ const st=mk('5th','hf'); toDay(st,9); const sa=H(st,'阿爾托莉雅-Saber'), ev=[]; c.warApply_(st,{u:sa,side:'foe'},99999); c.warCanonFall_(st,sa,ev);
  t(sa.alter&&ev.some(x=>/紫髮的少女/.test(x.txt))&&!ev.some(x=>/衛宮邸/.test(x.txt)),'黑化後的 Saber 倒下：餘波改寫櫻，而不是衛宮邸的少年',ev.map(x=>x.txt).join()); }
console.log('── 邊界');
{ const st=mk('5th','hf'); toDay(st,10);
  st.enemies.forEach(e=>{ if(e.hero!=='吉爾伽美什-Archer'&&e.alive){ e.alive=false; e.hp=0; } });   // 只剩金色的王，第 11 天被黑泥吞下
  const out=toDay(st,12);
  t(st.phase!=='over'&&H(st,'吉爾伽美什-Archer').alive&&!out.some(x=>/黑泥吞了下去/.test(x.txt)),'劇本不收最後一位：金色的王留給你，不會不戰而勝',JSON.stringify(st.result)); }
{ const st=mk('5th','ubw'); toDay(st,5); const sa=H(st,'阿爾托莉雅-Saber'); sa.hp=0; sa.alive=false; const out=toDay(st,10).map(x=>x.txt).join('\n');
  t(/反手一刀/.test(out)&&!/結下了契約/.test(out),'UBW：Saber 先倒下 → 弓兵照樣斬 Caster，但不會冒出「Saber 與凜結約」',out.slice(0,200)); }
{ const st=mk('5th','ubw'); const out=toDay(st,10).map(x=>x.txt).join('\n');
  t(/反手一刀/.test(out)&&/結下了契約/.test(out)&&H(st,'阿爾托莉雅-Saber').master==='遠坂凜','UBW：照原作走 → 破戒之符、背叛、結約三幕接得上'); }
{ const s2=mk('5th','hf'); toDay(s2,3); const cas=H(s2,'美狄亞-Caster'); s2.bounty={id:cas.id,open:true}; toDay(s2,6);
  t(!cas.alive&&!s2.bounty.open,'討伐令的目標被劇本殺掉：討伐令撤銷'); }
{ const st=mk('5th','fate'); st.day=E('WAR_.NIGHTS');
  t(c.warAwaken_(st,'咒腕之哈桑-Assassin','x')===false&&st.reserve.length===1,'最後一夜不叫醒預備役（明天到不了，會卡住勝負）'); }
{ const st=mk('5th','fate'); const ev=[]; const k=H(st,'佐佐木小次郎-Assassin'); k.hp=1; c.warApply_(st,{u:k,side:'foe'},99); c.warCanonFall_(st,k,ev);
  t(st.reserve.length===0&&H(st,'咒腕之哈桑-Assassin').arrive===st.day+1,'Fate 線也一樣：小次郎一倒，真 Assassin 隔天爬出來'); }

console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
