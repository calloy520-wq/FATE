// 🧹 鑑賞這一側也掃「真的送出去的那份提示詞」有沒有垃圾字。
//    solo 那邊靠這招抓到老虎道場的 undefined；鑑賞的提示詞是十幾段可選片段拼起來的，風險更高。
const {evalIn,sheets,run,cap,reset,summonN}=require('./probe.js');
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,200):''));} };
const GARBAGE=[
  [/undefined/,'undefined'],[/\bNaN\b/,'NaN'],[/\[object Object\]/,'[object Object]'],
  [/：(?=｜)|：\s*$/,'標籤後面是空的'],[/｜｜/,'連續兩根分隔符'],[/：無(?=[｜\n]|$)/,'「：無」'],
  [/：(之事|之物|沉著表象|堅定內裡|珍視之物|厭惡之事|通曉魔術|深藏心事)(?=[｜\n]|$)/,'佔位字漏出來'],
  [/、、|【】|（）|\(\)/,'空的括號或連續頓號'],
];
const scan=(label,txt)=>{ let hits=[]; GARBAGE.forEach(([re,why])=>{ const m=String(txt).match(re); if(m) hits.push(why+'（…'+String(txt).slice(Math.max(0,m.index-20),m.index+14).replace(/\n/g,' ')+'…）'); }); return hits; };

sheets['帳號']._d.push(['風音g','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音g',pcName:'風音',pcSex:'女',appearance:'銀髮及腰',persona:'溫和'}).pcId;
// 🌟 2026-09 起始住民整組取消（開局一片空白）——要人就得自己召喚。
summonN('風音g', kpc, 2);
const D=()=>sheets['鑑賞眾生']._d;
const me=()=>D().slice(1).find(x=>String(x[C.ID])===kpc);
const gid=String(me()[C.GAME_ID]);
const others=()=>D().slice(1).filter(x=>String(x[C.GAME_ID])===gid&&String(x[C.ID])!==kpc&&String(x[C.FACTION])==='從者');
const K={acctName:'風音g',pcId:kpc};
let all=[];
const turn=(label,payload,setup)=>{
  if(setup) setup();
  reset();
  const r=run(Object.assign({action:'play'},K,payload));
  const c=cap();
  if(!c){ all.push([label,'（沒攔到 AI 呼叫）'+JSON.stringify(r).slice(0,80),null]); return; }
  all.push([label,'ok',String(c.prompt||'')+'\n'+String(c.sys||'')]);
};

// ① 開局第一句（誰都還不熟）
turn('開局第一句',{message:'我推開門走進玄關。'});
// ② 有人在場、好感高
turn('三人在場·好感高',{message:'我在客廳翻書。'},()=>{ let n=0; others().forEach(o=>{ if(n<3){ o[C.LOC]=String(me()[C.LOC]); o[C.BOND]=85; o[C.REL_TAG]='親近的人'; n++; } }); });
// ③ 三人在場·好感中等
turn('三人在場·好感中等',{message:'我把外套掛起來。'},()=>{ let n=0; others().forEach(o=>{ if(n<3){ o[C.LOC]=String(me()[C.LOC]); o[C.BOND]=45; n++; } }); });
// ④ 好感很低
turn('好感很低',{message:'我看了一眼行事曆。'},()=>{ const o=others()[0]; o[C.LOC]=String(me()[C.LOC]); o[C.BOND]=5; });
// ⑤ 深夜
turn('深夜',{message:'我關掉客廳的燈。'},()=>{ me()[C.HOUR]=2; });
// ⑥ 移動到新地方
turn('走去新地方',{message:'我想去沒去過的地方走走。',goPlace:'海灘'});
// ⑦ 空白訊息（玩家直接按送出）
turn('空白訊息',{message:'   '});
// ⑧ 超長訊息
turn('超長訊息',{message:'我'.repeat(600)});
// ⑨ 帶危險字元
turn('危險字元',{message:'<script>alert(1)</script>｜【假標籤】'});

console.log('── 🧹 逐回合掃垃圾字');
all.forEach(([label,st,txt])=>{
  if(!txt){ t(false,label+'：沒有組出提示詞',st); return; }
  const hits=scan(label,txt);
  t(hits.length===0,label+'（'+txt.length+' 字）',hits.join(' ／ '));
});
console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過'));
