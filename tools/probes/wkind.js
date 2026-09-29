const {evalIn}=require('./probe.js');
let pass=0,fail=0;
const t=(c,m)=>{ if(c){pass++;console.log('   ✅ '+m);} else {fail++;console.log('   ❌ '+m);} };
const fix=(name,kind)=>{
  const e=JSON.stringify([{kind:kind||'人物',name:name,text:'測試',sex:'女'}]);
  return JSON.parse(evalIn('JSON.stringify(kanshouFixWorldKinds_('+e+',"風音的家",["凜","藤村大河"]))'))[0];
};
console.log('── AI 把地方寫成【人物】→ 就地改判成【地點】');
['風音的家','客廳','咖啡廳','古老神社','遠坂宅邸','老松屋','市民會館'].forEach(n=>{
  const r=fix(n); t(r.kind==='地點' && !r.sex, '「'+n+'」→ '+r.kind+(r.sex?'（性別沒清掉）':''));
});
console.log('\n── 真的是人就原樣留著');
['凜','藤村大河','便利商店店員','隔壁的老奶奶','美咲'].forEach(n=>{
  const r=fix(n); t(r.kind==='人物', '「'+n+'」→ '+r.kind);
});
console.log('\n── 反向：把正式同伴寫成【地點】→ 改判回【人物】');
t(fix('凜','地點').kind==='人物','「凜」寫成地點 → 改判回人物');
t(fix('凜的房間','地點').kind==='地點','「凜的房間」是真的地名，原樣留著（模糊比對會誤殺）');
t(fix('咖啡廳','地點').kind==='地點','一般地點原樣留著');

// 🗑️ 2026-09 拆掉位置模擬後，這支原本還驗兩件已不存在的事：日常落點骰（kanshouRollDailyLocation_）
//    與同去提議的回饋條（proposalResult）。兩邊代碼都刪了，留著只會是 0 條斷言的假綠燈。

console.log('\n'+(fail?('❌ '+fail+' 條沒過（通過 '+pass+'）'):('✅ 全部 '+pass+' 條通過')));
process.exit(fail?1:0);
