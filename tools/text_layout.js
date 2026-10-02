// 文字排版檢查：用 playwright 開各畫面（前情提要、真結局、所有事件、圖鑑、選角色），找最後一行只剩一兩個字的段落
// 用法：node tools/text_layout.js 標籤 [寬度=390]（建議 360／390／430 各跑一次，要看到 orphans total 0）
const fs=require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const Gd=require('path').join(__dirname,'..','gas')+'/', D=require('os').tmpdir(), TAG=process.argv[2]||'x', W=+(process.argv[3]||390);
let art=fs.readFileSync(Gd+'Art.html','utf8').replace(/var ART_BASE = '[^']*';/,"var ART_BASE = 'file://"+require('path').join(__dirname,'..','art')+"/';");
fs.writeFileSync(D+'/page.html', fs.readFileSync(Gd+'Index.html','utf8').replace("<?!= include('Game'); ?>", fs.readFileSync(Gd+'Game.html','utf8')).replace("<?!= include('Art'); ?>", art));
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
  const evs=await p.evaluate(()=>Object.keys(G.EVENTS));
  for(const k of evs) await go('ev_'+k,k=>{ const E=G.EVENTS[k]; run=G.newRun(E.who||'shuang',7,E.major?{major:E.major}:{}); run.gold=999; run.screen='event'; run.event=k; render(); },k);
  for(const t of ['sect','boss','elite','mob','goal']) await go('codex_'+t,t=>{ run=null; META.codex=Object.fromEntries(Object.keys(G.ENEMIES).map(k=>[k,1])); codexScreen(t); },t);
  await go('choose',()=>{ run=null; MODE='normal'; choose(); });
  await go('secret',()=>{ run=G.newRun('shuang',7); run.screen='secret'; render(); });
  let tot=0; for(const [k,v] of Object.entries(res)) if(v.length){ tot+=v.length; console.log(k, v.join(' ‖ ')); }
  console.log(TAG,'W',W,'orphans total',tot); await b.close();
})();
