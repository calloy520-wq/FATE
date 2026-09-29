// 新聖杯戰爭平衡模擬：載入真的 War_Engine.gs＋種子，用幾種策略各打 N 局。
// 用法：N=2000 WAR=5th|4th HERO=種子id POL=random,turtle,npspam,smart DEATHS=1 DOJO=1 node tools/war_sim.js
//      TUNE="WAR_.HOME=0.7" 可以不改檔先試一個數字。
//      CUSTOM='{"筋力":"A",…}' CLS=Saber CSK=first_strike,survive 模擬一位工房做的從者（職階技能照工房自動附上）。
//      也可以 require：const S=require('./war_sim.js'); S.rate({pol:'smart',n:300,hero:S.custom(six,cls,fx)})
const fs=require('fs'), vm=require('vm');
const GAS=process.env.GAS_DIR||require('path').join(__dirname,'..','gas');
const ctx={console}; vm.createContext(ctx);
const ctxStubs={PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},SpreadsheetApp:{},CacheService:{}}; Object.assign(ctx,ctxStubs);
for (const f of ['Core_Settings.gs','Seed_Codex.gs','Seed_Rivals.gs','War_Engine.gs','War_Forge.gs']) vm.runInContext(fs.readFileSync(GAS+'/'+f,'utf8'),ctx,{filename:f});
const E=(c)=>vm.runInContext(c,ctx);
if (process.env.TUNE) vm.runInContext(process.env.TUNE, ctx);
const WAR=process.env.WAR||'5th';   // 5th／4th／chaos
const SETUP=E(`warSetup_(${JSON.stringify(WAR)})`);   // 跟 GAS 開局同一支：原作陣容全員在、玩家只能召喚不在這場的
const pool=SETUP.pool.slice();
const seeds=SETUP.seeds;
// 工房做的從者：跟 actionWarForgeSave 寫進英靈殿的形狀一樣（職階技能自動附上）。
function custom(six,cls,fx){ cls=cls||'Saber'; const id='自製-'+cls+'-'+JSON.stringify(six)+'-'+(fx||[]).join('+'); if(seeds[id]) return id;
  const c={id,cls,realName:'自製',six,np:'自製之技（'+six['寶具']+'）',classSkills:E('FORGE_CLS_SKILLS_')[cls]||[],skills:(fx||[]).map(f=>({n:f,r:'B',fx:f}))}; pool.push(c); seeds[id]=c; return id; }
let CUSTOM_ID=''; if (process.env.CUSTOM) CUSTOM_ID=custom(JSON.parse(process.env.CUSTOM),process.env.CLS,(process.env.CSK||'').split(',').filter(Boolean));
const masterNames=SETUP.masterNames;
const roster=SETUP.roster;
// HERO 指定一位原作參戰者（例如第五次的 Saber）照樣跑得動，但那不是玩家拿得到的組合，只拿來對照。
const newGame=(seed,hero)=>{ const p=hero?(pool.filter(s=>s.id===hero).length?pool.filter(s=>s.id===hero):[seeds[hero]]):pool; const st=ctx.warNewGame_({pool:p,roster,seeds,masterNames,chaos:SETUP.chaos,name:'測試',sex:'男',war:WAR,seed,route:process.env.ROUTE||''});
  if (process.env.BLANK) { Object.assign(st.sv,{atk:3.9,def:3.5,spd:3.9,np:4.1,mhp:210,hp:210,fx:[],skn:{}}); }
  if (process.env.PSK) process.env.PSK.split(',').filter(Boolean).forEach(k=>{ st.sv.fx.push(k); st.sv.skn[k]='測'; });
  if (process.env.ESK) st.enemies.forEach(e=>{ e.fx=process.env.ESK.split(',').filter(Boolean); e.skn={}; });
  if (process.env.ESTRIP) st.enemies.forEach(e=>{ e.fx=e.fx.filter(f=>process.env.ESTRIP.split(',').indexOf(f)<0); });
  return st; };
const btns=st=>ctx.warButtons_(st).filter(b=>!b.dis);
let R=1; const rnd=()=>{ R=(R*1103515245+12345)&0x7fffffff; return R/0x7fffffff; };
const find=(st,t,s)=>btns(st).find(b=>b.t===t&&(s===undefined||b.s===s));
const P={
  random:(st)=>{ const b=btns(st); return b[Math.floor(rnd()*b.length)]; },
  turtle:(st)=>{
    if(st.phase==='day') return find(st,'rest');
    if(st.phase==='night') return find(st,'final')||find(st,'hold');
    if(st.battle.dawn) return find(st,'stance','letgo');
    return (st.sv.cd===0&&find(st,'stance','np'))||find(st,'stance','strike');
  },
  npspam:(st)=>{
    if(st.phase==='day') return st.sv.cd>0?find(st,'supply'):find(st,'scout');
    if(st.phase==='night'){ const s=btns(st).filter(b=>b.t==='sortie'); return find(st,'final')||s[0]||find(st,'patrol'); }
    if(st.battle.dawn) return find(st,'stance','chase')||find(st,'stance','letgo');
    if(st.sv.cd===0) return find(st,'stance','np');
    if(st.master.seals>0){ const b=ctx.warButtons_(st).find(b=>b.s==='np'); return Object.assign({},b,{useSeal:true}); }
    return find(st,'stance','strike');
  },
  caster:(st)=>{   // 陣地派：夜裡固守為主，只挑勝算大的去打；白天打聽、傷了就休養
    const sv=st.sv, hp=sv.hp/sv.mhp;
    if(st.phase==='night'){
      if(find(st,'final')) return find(st,'final');
      const s=btns(st).filter(b=>b.t==='sortie'); const good=s.find(b=>/勝算大/.test(b.sub));
      if(good&&hp>0.6) return good;
      return find(st,'hold');
    }
    return P.smart(st);
  },
  smart:(st)=>{
    const sv=st.sv, hp=sv.hp/sv.mhp;
    if(st.phase==='day'){
      if(hp<0.55||st.master.hp<45) return find(st,'rest');
      if(sv.cd>0 && ctx.warKnownFoes_(st).length) return find(st,'supply');
      return find(st,'scout');
    }
    if(st.phase==='night'){
      if(find(st,'final')) return find(st,'final');
      if(hp<0.45) return find(st,'hold');
      const s=btns(st).filter(b=>b.t==='sortie');
      const good=s.find(b=>/勝算大/.test(b.sub))||s.find(b=>/勢均力敵/.test(b.sub)&&hp>0.7);
      if(good) return good;
      if(ctx.warArrived_(st).some(e=>e.intel===0)&&hp>0.7) return find(st,'patrol');
      return find(st,'hold');
    }
    const e=ctx.warFoe_(st,st.battle.e), eh=e.hp/e.mhp;
    // 天亮的追擊：御主撐得住、從者沒被打殘才追
    if(st.battle.dawn) return (st.master.hp>35&&hp>0.3&&find(st,'stance','chase'))||find(st,'stance','letgo');
    // 決戰：令咒留著沒用＝白費，寶具冷卻中就用令咒硬放
    if(st.battle.ctx==='final'){ const npb=ctx.warButtons_(st).find(b=>b.s==='np'); if(!npb){ const sb=find(st,'stance','strike'); return st.master.seals>0?Object.assign({},sb,{useSeal:true}):sb; } if(sv.cd===0) return npb; if(st.master.seals>0&&st.master.hp>(ctx.WAR_.SEAL_NP_COST||0)+10) return Object.assign({},npb,{useSeal:true}); }
    if(hp<0.3&&find(st,'stance','retreat')){ const r=find(st,'stance','retreat'); const p=ctx.warRetreatChance_(sv,e,false); return (st.master.seals>1&&p<0.7)?Object.assign({},r,{useSeal:true}):r; }
    if(st.battle.tele==='np'){ if(sv.cd===0) return find(st,'stance','np'); return find(st,'stance','probe')||find(st,'stance','retreat'); }
    if(e.intel<2&&st.battle.round===1&&find(st,'stance','probe')) return find(st,'stance','probe');
    if(sv.cd===0&&(eh<0.8)) return find(st,'stance','np');
    return find(st,'stance','strike');
  }
};
let DEATH={};
function play(pol,seed,hero){
  const st=newGame(seed,hero); let guard=0;
  while(st.phase!=='over'&&guard++<500){
    let b = st.phase==='summon' ? {t:'start'} : P[pol](st);
    if(!b) b=btns(st)[0];
    const act={t:b.t,id:b.id,s:b.s,seal:!!b.useSeal};
    const ctxb=st.battle?st.battle.ctx:'', foe=st.battle?ctx.warFoe_(st,st.battle.e):null, hpBefore=st.sv.hp/st.sv.mhp;
    const r=ctx.warAct_(st,act);
    if(st.phase==='over'&&st.result&&st.result.cause==='servant'){ const k=ctxb+'|'+(foe?foe.cls:'')+'|'+(r.ev.some(e=>(e.k==='np'||e.k==='clash')&&e.side!=='me')?'敵寶具':'普攻')+'|死前'+(hpBefore>0.5?'>50%':'<50%'); DEATH[k]=(DEATH[k]||0)+1; }
    if(!r.ok){ const b2=btns(st)[0]; ctx.warAct_(st,{t:b2.t,id:b2.id,s:b2.s}); }
  }
  return st;
}
// 勝率：{pol, n, hero} → 0～1
function rate(o){ let w=0; for(let i=0;i<o.n;i++){ if(play(o.pol||'smart',1000+i,o.hero).result.win) w++; } return w/o.n; }
module.exports={ctx,E,custom,play,rate,pool:()=>pool.filter(s=>s.id.indexOf('自製-')!==0)};
if (require.main===module) {
const N=+process.env.N||2000, HERO=process.env.HERO||CUSTOM_ID||'';
const pols=(process.env.POL||'random,turtle,npspam,smart').split(',');
console.log('戰爭',WAR,'每策略',N,'局',HERO?('從者 '+HERO):'（從者隨機）');
for(const pol of pols){
  DEATH={}; var DOJO={}; var BOUNTYSTAT={got:0,issued:0}; let win=0, day=0, np=0, bat=0, cause={}, decisions=0, left=0, kills=0;
  for(let i=0;i<N;i++){ const st=play(pol,1000+i,HERO); if(st.result.win) win++; day+=st.result.day; np+=st.stats.np; bat+=st.stats.battles; cause[st.result.cause]=(cause[st.result.cause]||0)+1; decisions+=st.seq; left+=ctx.warAliveCount_(st); kills+=st.stats.kills; if(st.stats.bounty) BOUNTYSTAT.got++; if(st.bounty&&st.bounty.id) BOUNTYSTAT.issued++; if(process.env.DOJO){ const d=ctx.warDebrief_(st); const k=d.win?'WIN:'+d.good.length:d.key; DOJO[k]=(DOJO[k]||0)+1; } }
  console.log(pol.padEnd(7),'勝率',(win/N*100).toFixed(1)+'%','平均結束日',(day/N).toFixed(1),'寶具',(np/N).toFixed(1),'戰鬥',(bat/N).toFixed(1),'決定數',(decisions/N).toFixed(0),'剩敵',(left/N).toFixed(1),'親手擊殺',(kills/N).toFixed(1),JSON.stringify(cause)); console.log('   討伐令 發出',BOUNTYSTAT.issued,'完成',BOUNTYSTAT.got); if(process.env.DOJO) console.log('   道場',JSON.stringify(DOJO)); if(process.env.DEATHS) console.log('   死因',JSON.stringify(Object.entries(DEATH).sort((a,b)=>b[1]-a[1]).slice(0,8)));
}
}
