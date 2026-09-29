const P=require('./probe.js'); const {evalIn,sheets}=P;
const CH=JSON.parse(evalIn('JSON.stringify(COL.HERO)'));
sheets['英靈殿']._d.slice(1).forEach(h=>{
  const id=String(h[CH.ID]); const nm=String(h[CH.NAME]);
  const disp=evalIn('KANSHOU_CASUAL_NAME_['+JSON.stringify(id)+']||'+JSON.stringify(nm));
  const cands=JSON.parse(evalIn('JSON.stringify(kanshouNameCandidates_('+JSON.stringify(disp)+'))'));
  const realOk=cands.indexOf(nm)>=0;
  console.log((realOk?'  ':'!!'), id, '| disp=',disp,'| real=',nm, '| sex=',h[CH.SEX]);
});
let bad=0;
sheets['英靈殿']._d.slice(1).forEach(h=>{
  const id=String(h[CH.ID]); const nm=String(h[CH.NAME]);
  const disp=evalIn('KANSHOU_CASUAL_NAME_['+JSON.stringify(id)+']||'+JSON.stringify(nm));
  const c=JSON.parse(evalIn('JSON.stringify(kanshouNameCandidates_('+JSON.stringify(disp)+'))'));
  if(c.indexOf(nm)<0||c.indexOf(nm.replace(/[·・‧]/g,''))<0) bad++;
});
console.log(bad? '❌ '+bad+' 位的真名對不上暱稱' : '✅ 每位的真名（含去間隔號）都對得上暱稱');
