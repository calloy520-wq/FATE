// 🧊 快取契約：「他們是誰」進 system（每回合逐字相同＝吃得到提示詞快取）、「此刻」留 user。
//    2026-09 取代原本的「聚光燈」探針——聚光燈隨這次搬遷退休（system 不能逐回合修剪）。
const P=require('./probe.js'); const {ctx,evalIn,sheets,run,summonN}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,170):''));} };
let CAP=null; ctx.__CAP__=o=>{CAP=o;};
evalIn('callGeminiAPI=function(p,s,c){ __CAP__({p:p,s:s}); return JSON.stringify({narration:"x",npc_exit:[],options:["a","b","c","d"],intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:[]},world_note:[],rel_changes:[]}); }');
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'男'}).pcId;
// 🌟 2026-09 起始住民整組取消（開局一片空白）——要人就得自己召喚。
summonN('風音', kpc, 3);
const d=sheets['鑑賞眾生']._d;
const ids=[], names=[];
for(let i=1;i<d.length;i++){ if(String(d[i][C.ID])===kpc) continue;
  if(ids.length<3){ ids.push(String(d[i][C.ID])); names.push(String(d[i][C.NAME])); } }
const add=id=>run({action:'kanshou_party',pcId:kpc,acctName:'風音',npcId:id,op:'add'});
const drop=id=>run({action:'kanshou_party',pcId:kpc,acctName:'風音',npcId:id,op:'drop'});
const play=m=>{ CAP=null; run({action:'play',pcId:kpc,acctName:'風音',message:m}); return {sys:String(CAP&&CAP.s||''), usr:String(CAP&&CAP.p||'')}; };
const row=nm=>d.find(x=>String(x[C.NAME])===nm)||[];
const seedPref=nm=>String(row(nm)[C.PREF]||'').split('、').filter(Boolean)[0]||'';
const seedTrait=nm=>String(row(nm)[C.TRAIT]||'').split('、').filter(Boolean)[0]||'';
const common=(a,b)=>{ let i=0; while(i<a.length&&i<b.length&&a[i]===b[i]) i++; return i; };

ids.forEach(add);
console.log('同場 '+names.length+' 位：'+names.join('、'));

console.log('── ① 「他們是誰」在 system，「此刻」在 user');
let r1=play('我靠在窗邊發呆。');
t(/【在我身邊的人】/.test(r1.sys),'在場名單進了 system');
t(!/^【在場人物】/m.test(r1.usr),'user 裡沒有第二份人物卡（同一件事不送兩次）');
t(names.every(nm=>r1.sys.indexOf('【在場人物】'+nm+'。')>=0),'三個人都在 system 的名單上');
t(names.every(nm=>!!seedPref(nm)&&r1.sys.indexOf(seedPref(nm))>=0),'性格四格在 system');
t(names.every(nm=>!!seedTrait(nm)&&r1.sys.indexOf(seedTrait(nm))>=0),'外貌氣質在 system');
t(/【他們此刻】/.test(r1.usr),'「此刻」那半留在 user');
// 只看 system 裡「在場名單」那一段（輸出範本裡的 appearance_extras 欄位說明本來就會提到穿著）
const stableSeg=(sys)=>{ const i=sys.indexOf('【在我身邊的人】'); if(i<0) return ''; const j=sys.indexOf('★【輸出範本】', i); return j<0?sys.slice(i):sys.slice(i,j); };
t(!/穿著/.test(stableSeg(r1.sys)),'穿著（會換）沒有混進 system 的名單段', stableSeg(r1.sys).slice(0,160));

console.log('── ② 不換人＝system 每回合逐字相同（這就是快取吃得到的原因）');
const s2=play('我說了一句話。').sys, s3=play('我又說了一句。').sys, s4=play('再一句。').sys;
t(s2===r1.sys && s3===s2 && s4===s3,'連打四回合，system 一個字都沒變（'+r1.sys.length+' 字）');

console.log('── ③ 加人＝接在尾巴，前面那幾張卡的前綴不動（照樣命中）');
// ⚠ 在場＝同地點（2026-09），要讓某人離開這一幕得【把她移走】，不是解散同行。
const far='__遠方__';
const rowOf=id=>d.find(x=>String(x[C.ID])===String(id));
const park=id=>{ drop(id); rowOf(id)[C.LOC]=far; };
const bring=id=>{ rowOf(id)[C.LOC]=String((d.find(x=>String(x[C.ID])===kpc)||[])[C.LOC]||''); add(id); };
park(ids[2]);
const sA=play('先兩個人。').sys;
bring(ids[2]);
const sB=play('再加一個。').sys;
t(sB!==sA,'加人之後 system 確實變了');
t(common(sA,sB)>=sA.indexOf('【在場人物】'+names[1]+'。'),'前兩張卡的前綴原封不動（新人接在後面）',
  '共同前綴 '+common(sA,sB)+' 字');
t(sB.indexOf('【在場人物】'+names[2]+'。')>sB.indexOf('【在場人物】'+names[1]+'。'),'新加的人排在最後');

console.log('── ④ 最後一位離開這一幕＝前綴仍然有效');
park(ids[2]);
const sC=play('他先走了。').sys;
t(common(sB,sC)>=sB.indexOf('【在場人物】'+names[2]+'。'),'前面兩張卡的前綴還在（只有尾巴沒了）',
  '共同前綴 '+common(sB,sC)+' 字');

console.log('── ⑤ 安全：system 只放得下自己這一局的人');
// 另一個帳號、另一局，撞名同一位英靈
sheets['帳號']._d.push(['別人','','2026-09-15','']);
const other=run({action:'enter_kanshou',acctName:'別人',pcName:'別人',pcSex:'女'}).pcId;
summonN('別人', other, 1);   // 🌟 起始住民取消後，別局也要自己召喚才有人
const myGid=String((d.find(x=>String(x[C.ID])===kpc)||[])[C.GAME_ID]||'');
const foreign=d.filter(x=>String(x[C.GAME_ID]||'')!==myGid && String(x[C.FACTION])==='從者');
t(foreign.length>0,'別局確實有同伴在同一張表上（'+foreign.length+' 位）');
const sD=play('我看著他們。').sys;
t(foreign.every(fr=>{
    const n=String(fr[C.NAME]);
    // 撞名時只看「這一局也有同名的人」才算合法
    const mine=d.some(x=>String(x[C.GAME_ID]||'')===myGid&&String(x[C.NAME])===n&&String(x[C.FACTION])==='從者');
    return mine || sD.indexOf('【在場人物】'+n+'。')<0;
  }),'別局的同伴沒有出現在我的 system 裡');
t(sD.indexOf('【在場人物】'+String((d.find(x=>String(x[C.ID])===other)||[])[C.NAME])+'。')<0,'別的玩家本人也沒進來');

console.log('');
console.log(bad?('❌ '+bad+' 條沒過（通過 '+ok+'）'):('✅ 全部 '+ok+' 條通過'));
process.exit(bad?1:0);
