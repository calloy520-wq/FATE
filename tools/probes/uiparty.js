// 🫂 前端×後端接起來跑：按下面板上那幾顆鈕，畫面真的會變嗎？
//    2026-09 玩家回報「同行按鈕按了之後只有跑個讀取就沒了，按鈕也沒有變成脫離」——
//    後端與前端各自都驗過是對的，但【兩邊接起來】這條路以前沒有任何探針蓋到。
//    ⚠ 這支跟 check_ui.js 不同：那支只驗「面板叫得起來不拋例外」，這支真的按鈕、真的比對畫面。
const fs=require('fs'), vm=require('vm'), path=require('path');
const GAS=require('path').join(__dirname,'../../gas');   // 跟 sheet.js 同一份路徑
const P=require('./probe.js'); const {evalIn,sheets,run,summonN}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,160):''));} };

sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'女'}).pcId;
// 🌟 2026-09 起始住民整組取消（開局一片空白）——要人就得自己召喚。
summonN('風音', kpc, 5);
const KD=()=>sheets['鑑賞眾生']._d.slice(1);
const gid=String(KD().find(x=>String(x[C.ID])===kpc)[C.GAME_ID]);
const mates=KD().filter(x=>String(x[C.GAME_ID])===gid&&String(x[C.ID])!==kpc);

const strip=f=>fs.readFileSync(path.join(GAS,f),'utf8').replace(/^\s*<script>\s*\n/,'').replace(/\n\s*<\/script>\s*$/,'');
const nodes={};
function mk(tag){const el={tagName:tag,id:'',style:{cssText:''},_kids:[],textContent:'',dataset:{},disabled:false,
  appendChild(c){this._kids.push(c);if(c.id)nodes[c.id]=c;return c;},querySelector:()=>null,querySelectorAll:()=>[],
  closest:()=>null,addEventListener(){},removeChild(){},getAttribute:()=>null,setAttribute(){}};
  let h='';Object.defineProperty(el,'innerHTML',{get:()=>h,set(v){h=String(v);let m,re=/id="([^"]+)"/g;
    while((m=re.exec(h))!==null)if(!nodes[m[1]]){const c=mk('div');c.id=m[1];nodes[m[1]]=c;}}});return el;}
const doc={body:mk('body'),head:mk('head'),createElement:mk,getElementById:id=>nodes[id]||null,
  addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]};
doc.body.appendChild=c=>{if(c.id)nodes[c.id]=c;return c;}; doc.head.appendChild=c=>c;
const PC={id:kpc,name:'風音',mode:'kanshou',homeName:'風音的家',account:'風音'};
let ALERTS=[];
const ctx={document:doc,console:{log(){},error(){},warn(){}},setTimeout,clearTimeout,
  JSON,Math,Date,Promise,Error,String,Number,Boolean,Array,Object,RegExp,parseInt,parseFloat,isNaN,
  encodeURIComponent,decodeURIComponent,
  localStorage:{getItem:k=>(k==='kyushu_v27'?JSON.stringify(PC):null),setItem(){},removeItem(){}},
  alert:m=>ALERTS.push(String(m)),confirm:()=>true,prompt:()=>null,
  google:{script:{run:{withSuccessHandler(){return this;},withFailureHandler(){return this;}}}}};
ctx.window=ctx;ctx.globalThis=ctx;vm.createContext(ctx);
for(const f of ['Script.html','Script_Onboarding.html','Script_Kanshou.html']) vm.runInContext(strip(f),ctx,{filename:f});
ctx.currentAccount='風音';
ctx.gasRun=async(p)=>run(p);
['kc-party-list','kc-count','kc-party-n','kc-hero-list'].forEach(id=>{const e=doc.createElement('div');e.id=id;doc.body.appendChild(e);});
const html=()=>String((doc.getElementById('kc-party-list')||{}).innerHTML||'');
const rowOf=n=>(html().split('</div>').find(x=>x.indexOf(n)>=0)||'');

(async()=>{
  const co=await ctx.gasRun({action:'kanshou_companions',pcId:kpc,acctName:'風音'});
  ctx._kcCur=co.current||[];
  ctx.renderKcPartyList_();
  t(ctx._kcCur.length===mates.length,'面板列出這一局的每一個人（'+ctx._kcCur.length+'）');
  // ⚠ 2026-09 起始住民取消後，探針得自己召喚，而【召喚會順手加進同行】——
  //    所以要先清空，才驗得到「沒人同行時每個人都是＋同行」這個初始狀態。
  await ctx.gasRun({action:'kanshou_party',pcId:kpc,acctName:'風音',op:'clear'});
  ctx._kcCur=((await ctx.gasRun({action:'kanshou_companions',pcId:kpc,acctName:'風音'})).current)||[];
  ctx.renderKcPartyList_();
  t(/＋同行/.test(html())&&!/−同行/.test(html()),'沒人同行時，每個人都是【＋同行】');

  console.log('── ① ＋同行：按下去按鈕要變成【−同行】');
  const a=mates[0], an=String(a[C.NAME]);
  ALERTS=[]; await ctx.kanshouPartyOp(String(a[C.ID]),'add');
  t(ALERTS.length===0,'沒有跳錯誤',ALERTS.join('/'));
  t((ctx._kcCur.find(x=>x.name===an)||{}).party===true,'她的 party 旗標翻成 true');
  t(/−同行/.test(rowOf(an)),'她那一列的鈕變成【−同行】',rowOf(an).slice(-90));
  t(/🫂/.test(rowOf(an)),'圖示換成 🫂');

  console.log('── ② −同行：按回去要變回【＋同行】，人留在原地');
  ALERTS=[]; await ctx.kanshouPartyOp(String(a[C.ID]),'drop');
  t(ALERTS.length===0,'沒有跳錯誤',ALERTS.join('/'));
  t(/＋同行/.test(rowOf(an)),'鈕變回【＋同行】',rowOf(an).slice(-90));

  console.log('── ③ 🗑️ 2026-09 地點整組退休：🙋叫來／🚶去找兩顆鈕整組移除');
  // 在場＝同行之後，「把人移過來但不入隊」是個沒有意義的狀態——她在不在這一幕，
  // 唯一的答案就是她在不在同行名單上。路由 op 'bring' 也一併砍掉了。
  const b=mates[1], bn=String(b[C.NAME]);
  t(!/🙋叫來/.test(rowOf(bn)) && !/🚶去找/.test(rowOf(bn)),'同伴列上沒有🙋叫來／🚶去找');
  t(!/📍/.test(rowOf(bn)),'也不再顯示「她在哪」');
  ALERTS=[]; await ctx.kanshouPartyOp(String(b[C.ID]),'bring');
  t(ALERTS.length===1,'後端收到已退休的 bring＝明白拒絕（不是靜默吞掉）',ALERTS.join('/'));

  console.log('── ④ 同行滿 3 位之後，其餘的人那顆鈕要 disabled');
  for(const m of mates.slice(0,3)) await ctx.kanshouPartyOp(String(m[C.ID]),'add');
  const pn=ctx._kcCur.filter(x=>x.party).length;
  t(pn===3,'同行滿 3 位（'+pn+'）');
  const rest=ctx._kcCur.find(x=>!x.party);
  if(rest) t(/disabled/.test(rowOf(rest.name)),'第 4 位那顆鈕是 disabled',rowOf(rest.name).slice(-120));
  else t(false,'找不到第 4 位可比對');

  console.log('── ⑤ 三層分組：同行／在這一幕裡／其餘住在城裡的人');
  // 🎭 玩家定案：同行＝玩家按的走不掉；臨時在場＝AI 拉進來的、會自己走；其餘＝待命。
  ctx._kcCur=[{id:String(mates[0][C.ID]),name:String(mates[0][C.NAME]),party:true,onstage:false,memoir:[]},
              {id:String(mates[1][C.ID]),name:String(mates[1][C.NAME]),party:false,onstage:true,memoir:[]},
              {id:String(mates[2][C.ID]),name:String(mates[2][C.NAME]),party:false,onstage:false,memoir:[]}];
  ctx.renderKcPartyList_();
  const _h=html();
  t(/;">同行中<\/small>/.test(_h),'同行那一列標「同行中」');
  t(/;">在場<\/small>/.test(_h),'AI 拉進來的那一列標「在場」');
  t((_h.match(/🫂/g)||[]).length===1 && (_h.match(/👋/g)||[]).length===1 && (_h.match(/🌹/g)||[]).length===1,
    '三層各一個圖示，沒有混在一起');
  const _a=_h.indexOf('🫂'), _b=_h.indexOf('👋'), _c=_h.indexOf('🌹');
  t(_a>=0 && _a<_b && _b<_c,'排序：同行 → 在這一幕裡 → 待命','同行'+_a+' 在幕'+_b+' 待命'+_c);

  console.log('\n'+(bad?'❌ '+bad+' 條沒過（通過 '+ok+'）':'✅ 全部 '+ok+' 條通過'));
  process.exit(bad?1:0);
})();
