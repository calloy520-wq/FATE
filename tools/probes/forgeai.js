// ✨ 工房 AI 幫我做＋技能命名照出處：草稿收進點數上限、效果只收清單上的、技能名自取並一路帶到戰場。
const P=require('./probe.js'); const {ctx,evalIn,sheets}=P;
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x!==undefined?'  '+String(x).slice(0,220):''));} };
const run=u=>JSON.parse(evalIn('handleGameAction('+JSON.stringify(JSON.stringify(u))+')'));
const H=JSON.parse(evalIn('JSON.stringify(COL.HERO)'));
const A='造靈者';
sheets['帳號']._d.push([A,'','2026-09-29','']);
let CAP=null, REPLY='';
ctx.__FA__=(p,s)=>{ CAP={p,s}; return REPLY; };
evalIn('callGeminiAPI = function(p,s,c){ return __FA__(p,s); }');

console.log('── ① 三種出處：技能命名規則跟著走');
const list=run({action:'war_forge_list',acctName:A});
t((list.origins||[]).map(o=>o.key).join()==='fate,anime,original','清單帶三種出處',JSON.stringify(list.origins));
REPLY=JSON.stringify({name:'竈門炭治郎',cls:'Saber',sex:'男',six:{筋力:'EX',耐久:'A',敏捷:'EX',魔力:'C',幸運:'B',寶具:'EX'},np:'日之呼吸',
  skills:[{n:'水之呼吸',fx:'first_strike'},{n:'火之神神樂',fx:'mad'},{n:'嗅覺',fx:'first_strike'},{n:'亂碼',fx:'god_hand'},{n:'全集中・常中',fx:'survive'}],look:'額上有火焰般的痣',words:'溫柔又固執'});
let r=run({action:'war_forge_ai',acctName:A,origin:'anime',cls:'',desc:'鬼滅之刃的炭治郎'});
t(r.success&&r.hero,'AI 草稿做得出來',JSON.stringify(r).slice(0,200));
t(/其他動漫/.test(CAP.s)&&/原作裡的招牌招式/.test(CAP.s),'別的作品：叫 AI 用原作招式名');
run({action:'war_forge_ai',acctName:A,origin:'fate',desc:'貞德'}); t(/Fate 原作裡的技能名/.test(CAP.s),'Fate 角色：叫 AI 用 Fate 的技能名');
run({action:'war_forge_ai',acctName:A,origin:'original',desc:'會用影子的少女'}); t(/自取/.test(CAP.s),'原創：技能名自取');
t(CAP.s.indexOf(String(evalIn('WAR_FORGE_.BUDGET'))+' 點')>=0,'提示詞寫的點數跟工房上限同一個數');

console.log('── ② 草稿收斂：點數、效果、名字');
REPLY=JSON.stringify({name:'竈門炭治郎',cls:'Saber',sex:'男',six:{筋力:'EX',耐久:'A',敏捷:'EX',魔力:'C',幸運:'B',寶具:'EX'},np:'日之呼吸',
  skills:[{n:'水之呼吸',fx:'first_strike'},{n:'火之神神樂',fx:'mad'},{n:'嗅覺',fx:'first_strike'},{n:'亂碼',fx:'god_hand'},{n:'全集中・常中',fx:'survive'}],look:'額上有火焰般的痣',words:'溫柔又固執'});
r=run({action:'war_forge_ai',acctName:A,origin:'anime',desc:'炭治郎'});
const h=r.hero; ctx.__six=h.six;
t(evalIn('warSixPts_(__six)')<=evalIn('WAR_FORGE_.BUDGET'),'超標的六圍收進上限',JSON.stringify(h.six));
t(evalIn('warSixPts_(__six)')===evalIn('WAR_FORGE_.BUDGET'),'而且剛好用完（不會被削成弱雞）');
t(h.fx.join()==='first_strike,mad,survive','效果只收清單上的、重複的只算一次、最多三個',h.fx.join());
t(h.names.first_strike==='水之呼吸'&&h.names.survive==='全集中・常中','技能名保留原作招式名',JSON.stringify(h.names));
REPLY='不是 JSON'; r=run({action:'war_forge_ai',acctName:A,origin:'anime',desc:'炭治郎'});
t(!r.success&&r.message,'AI 回壞掉的東西：好好講一句，不炸',r.message);
REPLY=JSON.stringify({name:'影',six:{筋力:'E',耐久:'E',敏捷:'E',魔力:'E',幸運:'E',寶具:'E'},skills:[],np:'影縫'});
r=run({action:'war_forge_ai',acctName:A,origin:'original',desc:'影子'}); ctx.__six=r.hero.six;
t(evalIn('warSixPts_(__six)')===evalIn('WAR_FORGE_.BUDGET')&&r.hero.cls==='Saber','全 E 的草稿也補到上限、職階有預設',JSON.stringify(r.hero.six));
t(!run({action:'war_forge_ai',acctName:A,origin:'anime',desc:'  '}).success,'沒寫描述 → 擋');

console.log('── ③ 存檔：技能名自取，一路帶到戰場');
const save=run({action:'war_forge_save',acctName:A,hero:{name:'竈門炭治郎',cls:'Saber',sex:'男',six:h.six,np:'日之呼吸',fx:h.fx,names:Object.assign({},h.names,{mad:'=火之神神樂<script>'}),look:'額上有火焰般的痣',words:'溫柔又固執'}});
t(save.success,'存得進去',JSON.stringify(save));
const row=sheets['英靈殿']._d.find(x=>String(x[H.ID])==='竈門炭治郎-Saber');
const sk=JSON.parse(row[H.SKILLS]);
t(sk[0].n==='水之呼吸'&&sk[1].n.indexOf('火之神神樂')===0&&!/[<=]/.test(sk[1].n)&&sk[1].n.length<=10&&sk[2].n==='全集中・常中','英靈殿存的是自取的名字（清洗過符號與公式開頭）',row[H.SKILLS]);
const mine=run({action:'war_forge_list',acctName:A}).mine.find(x=>x.id==='竈門炭治郎-Saber');
t(mine&&mine.names.first_strike==='水之呼吸','編輯時帶回自取的名字',JSON.stringify(mine&&mine.names));
ctx.__row=row;
const tr=JSON.parse(evalIn('JSON.stringify(warTraits_(warUnit_(warSeedFromRow_(__row),{})))'));
t(tr.some(x=>/^水之呼吸：/.test(x))&&tr.some(x=>/^全集中・常中：/.test(x)),'戰場上的技能列念的是原作招式名',JSON.stringify(tr));
const s2=run({action:'war_forge_save',acctName:A,hero:{name:'白銀騎士',cls:'Saber',sex:'女',six:{筋力:'B',耐久:'C',敏捷:'B',魔力:'C',幸運:'D',寶具:'B'},np:'銀月之劍',fx:['ride'],look:'x',words:'y'}});
const r2=sheets['英靈殿']._d.find(x=>String(x[H.ID])==='白銀騎士-Saber');
t(s2.success&&JSON.parse(r2[H.SKILLS])[0].n==='騎乘','沒取名字就用效果的代表名',r2&&r2[H.SKILLS]);

console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
