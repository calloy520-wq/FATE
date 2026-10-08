// 文字排版檢查：用 playwright 開各畫面（前情提要、劇情、真結局、圖鑑、戰棋的整備／人物／結算／通關／提示／說明），找最後一行只剩一兩個字的段落
// 用法：node tools/text_layout.js 標籤 [寬度=390]（建議 360／390／430 各跑一次，要看到 orphans total 0）
const fs=require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const Gd=require('path').join(__dirname,'..','gas')+'/', D=require('os').tmpdir(), TAG=process.argv[2]||'x', W=+(process.argv[3]||390);
let art=fs.readFileSync(Gd+'Art.html','utf8').replace(/var ART_BASE = '[^']*';/,"var ART_BASE = 'file://"+require('path').join(__dirname,'..','art')+"/';");
fs.writeFileSync(D+'/page.html', fs.readFileSync(Gd+'Index.html','utf8').replace(/<\?!= include\('(\w+)'\); \?>/g, (m,n)=> n==='Art' ? art : fs.readFileSync(Gd+n+'.html','utf8')));
const scan=()=>{ // returns orphan lines (last line ≤2 chars) per text block
  const out=[]; const els=[...document.querySelectorAll('#app *, .ov *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>8));
  for(const el of els){ const lines=new Map(); const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    let n; while((n=w.nextNode())){ if(n.parentElement.closest('button,.card')&&!el.matches('button,button *')) {} for(let i=0;i<n.textContent.length;i++){ const r=document.createRange(); r.setStart(n,i); r.setEnd(n,i+1); const b=r.getClientRects()[0]; if(!b||!n.textContent[i].trim()) continue; const y=Math.round(b.top); lines.set(y,(lines.get(y)||'')+n.textContent[i]); } }
    const ls=[...lines.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]); if(ls.length<2) continue;
    const last=ls[ls.length-1]; if(last.replace(/[。，、！？」』…—）)：；]/g,'').length<=2) out.push(ls.slice(-2).join('｜')); }
  return [...new Set(out)];
};
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p=await b.newPage({viewport:{width:W,height:844}}); p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+D+'/page.html'); await p.evaluate(()=>localStorage.clear()); await p.reload();
  await p.fill('#lname','測試'); await p.click('text=進入'); await p.waitForTimeout(400);
  await p.evaluate(()=>{ META.tips={all:1}; });
  const res={}; const go=async(name,fn,arg)=>{ await p.evaluate(fn,arg); await p.waitForTimeout(150); res[name]=await p.evaluate(scan); };
  for(let i=0;i<6;i++) await go('prologue'+i,i=>prologue(i),i);
  for(const w of ['shuang','qingli','xiaoman','chilian','aduo']) await go('end_'+w,w=>{closeOv&&closeOv();openOv(endingHtml(w));},w);
  await p.evaluate(()=>closeOv());
  for(const t of ['boss','elite','mob']) await go('codex_'+t,t=>{ run=null; META.codex=Object.fromEntries(Object.keys(G.ENEMIES).map(k=>[k,1])); codexScreen(t); },t);
  for(const t of ['pro','who','sect','end']) await go('story_'+t,t=>{ closeOv(); run=null; META.endings=Object.fromEntries(G.ORDER.map(k=>[k,1])); storyScreen(t); },t);
  for(const w of ['shuang','qingli','xiaoman','chilian','aduo']) await go('storywho_'+w,w=>{ closeOv(); storyWho(w); },w);
  await p.evaluate(()=>{ closeOv(); META.endings={}; META.tips2={all:1}; });
  await go('title',()=>{ run=null; titleScreen(); });
  await go('help',()=>{ run=null; titleScreen(); showHelp(); });
  await go('record',()=>{ closeOv(); recordScreen(); });
  for(const t of ['hero','shop','bag']) await go('prep_'+t,t=>{ closeOv(); run=T.newCampaign(7); run.inv={huichunD:1,qingshen:1}; prepScreen(t); },t);
  for(const w of ['shuang','qingli','xiaoman','chilian','aduo']) for(const t of ['up','tr','sk','eq','info']) await go('hero_'+w+'_'+t,a=>{ closeOv(); heroSheet(a[0],a[1]); },[w,t]);
  await go('result',()=>{ closeOv(); run=T.newCampaign(7); T.startStage(run); run.battle.over='win'; T.finishStage(run); render(); });
  await go('result_lose',()=>{ closeOv(); run=T.newCampaign(7); T.startStage(run); run.battle.over='lose'; T.finishStage(run); render(); });
  await go('end',()=>{ closeOv(); run=T.newCampaign(7); run.stage=99; run.screen='end'; render(); });
  // 戰鬥：魔王資訊欄（狀態一長串）、選回應（好幾個還手招式）
  for(const st of [7,8,13]) for(const hurt of [0,1]) await go('battle_info_'+st+'_'+hurt,a=>{ closeOv(); busy=false; run=T.newCampaign(7); run.stage=a[0]; T.startStage(run); SUI={mode:'idle'}; render(); var b=sB(), x=b.units.filter(u=>u.boss)[0]; x.st.jinshen=1; x.st.ningshen=1; x.ding=2; x.poison=3; if(a[1]) x.hp=Math.floor(x.hpMax*0.4); srwTap(x.x,x.y); },[st,hurt]);
  await go('defense',()=>{ closeOv(); run=T.newCampaign(7); run.stage=13; Object.keys(run.heroes).forEach(k=>{ run.heroes[k].lv=24; run.heroes[k].up.wpn=5; }); T.startStage(run); SUI={mode:'idle'}; render(); var b=sB(), x=b.units.filter(u=>u.boss)[0], s=b.units.filter(u=>u.id==='shuang')[0]; s.x=x.x; s.y=x.y+2; s.will=140; b.phase='e'; defenseSheet({uid:x.uid,x:x.x,y:x.y,wi:0,target:s.uid}); });
  await p.evaluate(()=>{ window.NO_ESC=0; closeOv(); });
  for(const t of ['prep','battle','spirit','defense','will']) await go('tip_'+t,t=>{ closeOv(); META.tips2={}; srwTip(t); META.tips2={all:1}; },t);
  let tot=0; for(const [k,v] of Object.entries(res)) if(v.length){ tot+=v.length; console.log(k, v.join(' ‖ ')); }
  console.log(TAG,'W',W,'orphans total',tot); await b.close();
})();
