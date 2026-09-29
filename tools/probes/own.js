// 🔒 帳號分流：拿別人的 pcId 一律不可以動得了（可多帳號遊玩、資料不可污染）。
//    對全部 69 條路由逐條打一次「我的帳號 ＋ 別人的 pcId」。
const {evalIn,sheets,run}=require('./probe.js');
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)')), CH=JSON.parse(evalIn('JSON.stringify(COL.HERO)'));
const ACTIONS=JSON.parse(evalIn('JSON.stringify(Object.keys(ActionRouter))'));
const EXEMPT=JSON.parse(evalIn('JSON.stringify(OWNERSHIP_CHECK_EXEMPT_)'));
// 甲：有後日談存檔＋一局聖杯戰爭；乙：攻擊者。受害者＝甲的鑑賞 pcId。
sheets['帳號']._d.push(['甲','','2026-09-15',''], ['乙','','2026-09-15','']);
const KA=run({action:'enter_kanshou',acctName:'甲',pcName:'甲音',pcSex:'女'}).pcId;
run({action:'enter_kanshou',acctName:'乙',pcName:'乙音',pcSex:'女'});
const w=run({action:'war_new',acctName:'甲',name:'甲音',sex:'女',war:'5th'});
if(!KA||!w.success){ console.log('❌ 準備資料失敗', KA, JSON.stringify(w).slice(0,120)); process.exit(1); }
const snap=()=>['眾生','鑑賞眾生','聖杯戰局','歷史暫存'].map(k=>JSON.stringify((sheets[k]||{})._d||[])).join('｜');
let leaked=[], changed=[];
// 📋 登記制：會「建立呼叫者自己的資料」的那幾支——它們本來就不看傳進來的 pcId（實測 enter_kanshou
//    只是替乙開了乙自己的後日談存檔、標著【帳號】乙，甲那一列一個字都沒動）。
const SELF_CREATE_OK={ enter_kanshou:'替呼叫者自己開後日談存檔，不看傳進來的 pcId' };
const SKIP={ end_run:1, purge_orphans:1, dev_resync_codex:1, kanshou_reset:1, account_new_game:1 };
ACTIONS.forEach(a=>{
  if(SKIP[a]) return;
  [[KA,'甲的鑑賞 pcId']].forEach(([victim,what])=>{
    const before=snap();
    let o=null;
    try { o=JSON.parse(evalIn('handleGameAction('+JSON.stringify(JSON.stringify({action:a, acctName:'乙', pcId:victim,
      npcName:'', npcId:'', message:'我伸手', target:'冬木·新都', hours:1, sealType:'repair', text:'x', op:'list',
      pcName:'改名了', pcSex:'男', pace:10, cause:'battle', response:'brace', servant:'', servantId:''}))+')')); }
    catch(e){ leaked.push(a+'（'+what+'）拋例外：'+String(e.message).slice(0,60)); return; }
    const after=snap();
    if(o && o.success===true && !EXEMPT[a]) leaked.push(a+'（'+what+'）回 success:true');
    if(before!==after && !SELF_CREATE_OK[a]) changed.push(a+'（'+what+'）動到了資料');
  });
});
console.log('── 🔒 '+(ACTIONS.length-Object.keys(SKIP).length)+' 條路由 × 別人的 pcId');
console.log(leaked.length?('   ❌ 有路由讓別人得手：\n     '+leaked.join('\n     ')):'   ✅ 沒有一條讓別的帳號得手');
console.log(changed.length?('   ❌ 有路由改到了別人的資料：\n     '+changed.join('\n     ')):'   ✅ 沒有一條動到別人的資料');
console.log('   （登記在案的「建立自己的資料」：'+Object.keys(SELF_CREATE_OK).join('、')+'）');
console.log('   （豁免清單 OWNERSHIP_CHECK_EXEMPT_：'+Object.keys(EXEMPT).join('、')+'）');
