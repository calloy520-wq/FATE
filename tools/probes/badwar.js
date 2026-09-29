// 🧨 亂填參數不可以生出一局「沒有敵人的聖杯戰爭」（直打 API 就能繞過前端下拉選單）
const {evalIn,sheets,run}=require('./probe.js');
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)')), CH=JSON.parse(evalIn('JSON.stringify(COL.HERO)'));
// ⚠ 敵陣是在【召喚完成】那一刻才鋪的(seedRivalsForGame_ 由 summon_servant 呼叫)——
//   第一版只 create 就去數敵人，六條全紅，那是探針自己的問題不是 code 的。
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,140):''));} };
let n=0;
function mk(warMode, war, label){
  n++; const acct='亂'+n;
  sheets['帳號']._d.push([acct,'','2026-09-15','']);
  run({action:'account_new_game',acctName:acct,account:acct});
  const r=run({action:'create',acctName:acct,account:acct,name:'亂音'+n,sex:'女',identity:'x',standing:'y',wish:'z',
    appearance:'銀髮',magic:'寶石',circuits:'30',origin:'冬木本地',melee:'C',magicRank:'C',warMode:warMode,war:war});
  if(r.success===false){ t(true,label+'：被擋下並講原因（'+r.message+'）'); return; }
  const saber=sheets['英靈殿']._d.slice(1).find(h=>/阿爾托莉雅/.test(String(h[CH.NAME])));
  const sr=run({action:'summon_servant',acctName:acct,pcId:r.pcId,heroId:String(saber[CH.ID]),cls:String(saber[CH.CLS]),trueName:String(saber[CH.NAME]),origin:'',desc:''});
  t(sr.success!==false,label+'：召喚跑得起來',sr.message);
  const rows=sheets['眾生']._d.slice(1);
  const me=rows.find(x=>String(x[C.ID])===r.pcId), gid=String(me[C.GAME_ID]);
  const foes=rows.filter(x=>String(x[C.GAME_ID])===gid&&/^敵/.test(String(x[C.FACTION])));
  t(foes.length>0, label+'：這一局有敵人（'+foes.length+' 位）', '敵人 0 位＝死局');
}
console.log('── 場次亂填');
mk('canon','99th','canon + war=99th');
mk('canon','','canon + war 空白');
mk('canon','<script>','canon + war 帶標籤');
console.log('── 模式亂填');
mk('亂寫的','5th','warMode 亂寫');
mk('','5th','warMode 空白');
mk('chaos','99th','chaos + war 亂填');
console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過'));
