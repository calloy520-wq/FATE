// 🤖 說書人回什麼都不可以炸，也不可以讓 AI 改到 GAS 才有權改的數字。
//    （AI 只說書、GAS 掌數值——這支就是那條鐵則的機器驗證。）
const {ctx,evalIn,sheets,run,summonN}=require('./probe.js');
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,160):''));} };
sheets['帳號']._d.push(['邪','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'邪',pcName:'邪音',pcSex:'女'}).pcId;
// 🌟 2026-09 起始住民整組取消（開局一片空白）——要人就得自己召喚。
summonN('邪', kpc, 1);
const D=()=>sheets['鑑賞眾生']._d.slice(1);
const me=()=>D().find(x=>String(x[C.ID])===kpc);
const gid=String(me()[C.GAME_ID]);
const her=()=>D().find(x=>String(x[C.GAME_ID])===gid&&String(x[C.ID])!==kpc&&String(x[C.FACTION])==='從者');
// 讓她跟玩家同地（rel_changes 要求同地才算）
const setAI=(fn)=>{ ctx.__FAKE__=fn; evalIn('callGeminiAPI = function(p,s,c){ return __FAKE__(); }'); };
const play=(msg)=>run({action:'play',acctName:'邪',pcId:kpc,message:msg||'我看著她。'});

const CASES=[
  ['回 null', ()=>null],
  ['回空字串', ()=>''],
  ['回不是 JSON 的字', ()=>'我今天不想工作'],
  ['回半截 JSON', ()=>'{"narration":"她抬起頭'],
  ['回 JSON 但沒有 narration', ()=>'{"foo":1}'],
  ['narration 是數字', ()=>'{"narration":12345}'],
  ['narration 是物件', ()=>'{"narration":{"a":1}}'],
  ['夾帶 HTML／注入', ()=>'{"narration":"<img src=x onerror=alert(1)><script>evil()</script>她笑了"}'],
  ['超長 narration', ()=>JSON.stringify({narration:'啊'.repeat(20000)})],
  ['rel_changes 想給 +9999', ()=>JSON.stringify({narration:'她很開心',rel_changes:[{target:String(her()[C.NAME]),fav_change:9999}]})],
  ['rel_changes 想改不在場的人', ()=>JSON.stringify({narration:'遠方有人打了噴嚏',rel_changes:[{target:'根本不存在的人',fav_change:5}]})],
  ['rel_changes 想改玩家自己', ()=>JSON.stringify({narration:'你覺得開心',rel_changes:[{target:'邪音',fav_change:5}]})],
  ['rel_changes 不是陣列', ()=>JSON.stringify({narration:'嗯',rel_changes:'很多'})],
  ['想自己指定關係標籤', ()=>JSON.stringify({narration:'嗯',rel_changes:[{target:String(her()[C.NAME]),fav_change:1,rel_tag:'戀人'}]})],
  ['world_note 灌 50 筆', ()=>JSON.stringify({narration:'嗯',world_note:Array.from({length:50},(_,i)=>({kind:'地點',name:'地'+i,text:'x'}))})],
];
console.log('── 🤖 說書人亂回 '+CASES.length+' 種');
let crashed=[];
CASES.forEach(([label,fn])=>{
  her()[C.LOC]=String(me()[C.LOC]);
  const bondBefore=parseInt(her()[C.BOND])||0;
  const tagBefore=String(her()[C.REL_TAG]||'');
  setAI(fn);
  let r=null;
  try { r=play(); } catch(e){ crashed.push(label+'：'+String(e.message).slice(0,70)); return; }
  const bondAfter=parseInt(her()[C.BOND])||0, tagAfter=String(her()[C.REL_TAG]||'');
  const delta=bondAfter-bondBefore;
  let note='';
  if(Math.abs(delta)>5) note='好感一次跳了 '+delta;
  if(label.indexOf('關係標籤')>=0 && tagAfter!==tagBefore && Math.abs(delta)<=1) note='關係標籤被 AI 直接改成 '+tagAfter;
  t(!note, label+'（好感 '+bondBefore+'→'+bondAfter+'）', note);
});
t(crashed.length===0,'沒有任何一種讓後端拋例外',crashed.join(' ／ '));
// 🔒 注入：那段 HTML 不可以原樣躺在歷史裡等著被 innerHTML
const hist=(sheets['歷史暫存']._d||[]).map(r=>String(r[2]||'')).join('\n');
t(!/onerror=|<script/i.test(hist)||/&lt;/.test(hist),'夾帶的 HTML 沒有原樣存進歷史（或已被轉義）',hist.slice(0,120));

console.log('── ⚔️ 新聖杯戰爭的說書也亂回一輪（war_narrate）');
sheets['帳號']._d.push(['邪s','','2026-09-15','']);
const wn=run({action:'war_new',acctName:'邪s',name:'邪士',sex:'男',war:'5th'});
t(!!wn.success,'開得了一局',JSON.stringify(wn).slice(0,120));
const WC=JSON.parse(evalIn('JSON.stringify(WAR_COL_)'));
const wrow=()=>(sheets['聖杯戰局']._d||[]).find(r=>String(r[WC.ACCT])==='邪s')||[];
const stateOf=()=>String(wrow()[WC.STATE]||'');
let scrash=[], schanged=[], sthrow=[];
setAI(()=>null); run({action:'war_act',acctName:'邪s',act:{t:'start'}});
CASES.forEach(([label,fn])=>{
  setAI(()=>null);
  const view=JSON.parse(stateOf()||'{}'); const ph=view.phase;
  const btn=ph==='day'?{t:'rest'}:ph==='night'?{t:'hold'}:ph==='battle'?{t:'stance',s:'strike'}:{t:'start'};
  try { run({action:'war_act',acctName:'邪s',act:btn}); } catch(e){ sthrow.push(label+'：war_act '+String(e.message).slice(0,40)); }
  setAI(fn);
  const before=stateOf();
  try { const r=run({action:'war_narrate',acctName:'邪s'}); if(!r||typeof r!=='object') scrash.push(label+'：回傳不是 JSON'); }
  catch(e){ scrash.push(label+'：'+String(e.message).slice(0,60)); return; }
  if(stateOf()!==before) schanged.push(label+'：戰局數值被說書動到了');
});
t(sthrow.length===0,'推進戰局本身沒拋例外',sthrow.join(' ／ '));
t(scrash.length===0,'war_narrate 對任何一種回覆都沒拋例外',scrash.join(' ／ '));
t(schanged.length===0,'說書人回什麼都動不到戰局的數值',schanged.join(' ／ '));

console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過'));
