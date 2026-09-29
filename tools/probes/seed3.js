// 🌱 種子三件事：金羊毛 +10 血／對御主態度是單一核心／客串三位可召喚（同一個人互斥）
const P=require('./probe.js'); const {evalIn,sheets,run}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,180):''));} };

console.log('── ② 對御主的態度＝單一核心立場');
const S=JSON.parse(evalIn('JSON.stringify(SEED_SERVANTS.map(s=>({id:s.id,t:(s.persona||{}).toMaster})))'));
const BAN=['逐漸','漸漸','初期','起初','後來','日後','最終','久了','否則','一旦','；'];
const arc=S.filter(s=>BAN.some(w=>String(s.t||'').includes(w)));
t(arc.length===0,'每一條都沒有時間推移／條件分岔的寫法',arc.map(x=>x.id+'='+x.t).join('；'));
t(S.every(s=>String(s.t||'').trim().length>=6),'每一位都有寫態度');

console.log('── ③ 客串三位：召喚得到');
t(JSON.parse(evalIn('JSON.stringify(KANSHOU_SUMMON_BLOCKED_IDS_)')).length===0,'封鎖名單已清空');

console.log('── ④ 同一個人只能有一種姿態在場');
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'男'}).pcId;
let r=run({action:'kanshou_summon_hero',pcId:kpc,acctName:'風音',heroId:'斯卡哈-Lancer'});
t(r.success,'斯卡哈(Lancer) 召喚成功',r.message);
r=run({action:'kanshou_summon_hero',pcId:kpc,acctName:'風音',heroId:'斯卡哈-Assassin'});
t(r.success===false && /只能有一種姿態/.test(String(r.message)),'同一位英靈的另一種靈基被擋下',r.message);
r=run({action:'kanshou_summon_hero',pcId:kpc,acctName:'風音',heroId:'斯卡哈-Lancer'});
t(r.success===false && /已經存在/.test(String(r.message)),'同一筆種子重召＝「已經存在」',r.message);
r=run({action:'kanshou_summon_hero',pcId:kpc,acctName:'風音',heroId:'恩奇都-Lancer'});
t(r.success,'恩奇都 召喚成功',r.message);
const d=sheets['鑑賞眾生']._d;
const enk=d.find(x=>String(x[C.NAME]).indexOf('恩奇都')>=0);
t(!!enk && /【英靈源】恩奇都-Lancer/.test(String(enk[C.MEMORY])),'列上蓋了【英靈源】戳記',enk&&enk[C.MEMORY]);
console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
