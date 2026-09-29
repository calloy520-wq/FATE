// 🧪 參數亂給不可以炸整局：69 條路由各打三種爛 payload，要嘛好好回錯誤，要嘛安靜完成，
//    但不可以拋例外（前端只會看到「連線失敗」，玩家一頭霧水）。
const {evalIn,sheets,run}=require('./probe.js');
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)')), CH=JSON.parse(evalIn('JSON.stringify(COL.HERO)'));
const ACTIONS=JSON.parse(evalIn('JSON.stringify(Object.keys(ActionRouter))'));
// 先弄一個正常的 solo 局與鑑賞局，讓 pcId 是真的（只測參數壞，不測身分壞）
sheets['帳號']._d.push(['亂打','','2026-09-15','']);
run({action:'account_new_game',acctName:'亂打',account:'亂打'});
const pcId=run({action:'create',acctName:'亂打',account:'亂打',name:'亂音',sex:'女',identity:'x',standing:'y',wish:'z',
  appearance:'銀髮',magic:'寶石',circuits:'30',origin:'冬木本地',melee:'C',magicRank:'C',warMode:'canon',war:'5th'}).pcId;
const saber=sheets['英靈殿']._d.slice(1).find(h=>/阿爾托莉雅/.test(String(h[CH.NAME])));
run({action:'summon_servant',acctName:'亂打',pcId,heroId:String(saber[CH.ID]),cls:String(saber[CH.CLS]),trueName:String(saber[CH.NAME]),origin:'',desc:''});
sheets['帳號']._d.push(['亂鑑','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'亂鑑',pcName:'亂鑑',pcSex:'女'}).pcId;

const CASES=[
  ['全空', a=>({action:a})],
  ['只有身分', a=>({action:a, acctName:'亂打', pcId})],
  ['鑑賞身分', a=>({action:a, acctName:'亂鑑', pcId:kpc})],
  ['亂型別', a=>({action:a, acctName:'亂打', pcId, npcName:{x:1}, npcId:[1,2], target:12345, text:null, op:'???', hours:'abc', build:'不是json', heroId:{}, sealType:[], response:0, message:{}, item:'', cause:'???'})],
];
let thrown=[], nonjson=[], silentFail=[];
// 📋 登記制：完全沒帶身分時「靜靜失敗」是可以的那幾支（前端永遠會帶 pcId，且各有接手的畫面）
const QUIET_OK={ 'get_tags／全空':'唯讀面板，前端拿不到資料就是空面板',
                 'get_album／全空':'同上，相簿空的',
                 'tiger_dojo／全空':'前端有罐頭講評 dojoFallbackHtml_ 接手（已登記在 check_contract）' };
const SKIP={ end_run:1, kanshou_reset:1, purge_orphans:1, dev_resync_codex:1 }; // 會清資料的留到最後不跑
ACTIONS.forEach(a=>{
  if(SKIP[a]) return;
  CASES.forEach(([cl, mk])=>{
    let raw;
    try { raw = evalIn('handleGameAction('+JSON.stringify(JSON.stringify(mk(a)))+')'); }
    catch(e){ thrown.push(a+'／'+cl+'：'+String(e.message||e).slice(0,90)); return; }
    let o=null; try { o=JSON.parse(raw); } catch(e){ nonjson.push(a+'／'+cl+'：'+String(raw).slice(0,70)); return; }
    if(o && o.success===false && !o.message && !o.needNpResponse && !o.needRetreat && !o.needRest && !o.invalidName
       && !QUIET_OK[a+'／'+cl]) silentFail.push(a+'／'+cl);
  });
});
console.log('── 🧪 '+(ACTIONS.length-Object.keys(SKIP).length)+' 條路由 × '+CASES.length+' 種爛 payload');
console.log(thrown.length?('   ❌ 拋例外 '+thrown.length+' 次：\n     '+thrown.join('\n     ')):'   ✅ 沒有任何一條拋例外');
console.log(nonjson.length?('   ❌ 回傳不是 JSON '+nonjson.length+' 次：\n     '+nonjson.join('\n     ')):'   ✅ 回傳都是 JSON');
console.log(silentFail.length?('   ❌ 失敗但沒說原因（玩家會對著空氣）：\n     '+silentFail.join('\n     ')):'   ✅ 失敗都有講原因（登記在案的靜默 '+Object.keys(QUIET_OK).length+' 條除外）');
