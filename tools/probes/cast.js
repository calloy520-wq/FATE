// 🎭 三層在場（玩家定案）：同行（玩家按的·走不掉）／臨時在場（AI 拉的·AI 也能讓他走）／待命。
//    ⚠ 重點是【兩個不同擁有者】：AI 動得了臨時在場那一層，動不了同行——
//      這正是 2026-09 砍掉 npc_exit 的理由（「AI 不問玩家就把人移出同行名單」）。
const P=require('./probe.js'); const {ctx,evalIn,sheets,run,summonN}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,170):''));} };
let CAP=null, CAST={join:[],leave:[]}; ctx.__CAP__=o=>{CAP=o;}; ctx.__CAST__=()=>CAST;
evalIn('callGeminiAPI=function(p,s,c){ __CAP__({p:p,s:s}); return JSON.stringify({narration:"x",options:["a","b","c","d"],intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:[]},world_note:[],cast:__CAST__()}); }');
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'女'}).pcId;
summonN('風音', kpc, 8);   // 召滿世界上限，④ 才有足夠的人去撞在場上限
run({action:'kanshou_party',pcId:kpc,acctName:'風音',op:'clear'});
const d=sheets['鑑賞眾生']._d; const me=()=>d.find(x=>String(x[C.ID])===kpc);
const gid=String(me()[C.GAME_ID]);
// ⚠ 挑名字裡沒有全形括號的人（歷史包袱：舊卡頭是「名字（性別）。」）；現在卡頭是「【在場人物】名字。性別，真名X。」，
//    onstage() 在第一個句號截斷。
const folks=d.slice(1).filter(x=>String(x[C.GAME_ID])===gid&&String(x[C.ID])!==kpc&&String(x[C.NAME]).indexOf('（')<0);
const N=r=>String(r[C.NAME]);
const MAX=parseInt(evalIn('String(KANSHOU_ONSTAGE_MAX_)'),10);
const PMAX=parseInt(evalIn('String(KANSHOU_PARTY_MAX_)'),10);
const play=m=>{ CAP=null; run({action:'play',pcId:kpc,acctName:'風音',message:m}); return String(CAP&&CAP.s||'')+'\n'+String(CAP&&CAP.p||''); };
const onstage=u=>u.split('\n').filter(l=>/^【在場人物】/.test(l)).map(l=>(l.match(/^【在場人物】([^。]+)。/)||[,''])[1].trim());
const roster=u=>(u.split('\n').find(l=>l.indexOf('★【這座城裡還住著】')===0)||'');
console.log('這一局 '+folks.length+' 位、在場上限 '+MAX+'、同行上限 '+PMAX);

console.log('\n── ① AI 把待命的人拉進這一幕');
CAST={join:[N(folks[0])],leave:[]};
let u=play('凜最近好嗎？');
CAST={join:[],leave:[]};
u=play('嗨。');
t(onstage(u).indexOf(N(folks[0]))>=0,'她進場了（有卡片）',onstage(u).join('、'));
t(roster(u).indexOf(N(folks[0]))<0,'而且從待命名單裡拿掉了（不重複出現）',roster(u).slice(0,70));

console.log('\n── ② AI 也讓她走得掉（她沒同行）');
CAST={join:[],leave:[N(folks[0])]};
play('她說要先走了。');
CAST={join:[],leave:[]};
u=play('剩我一個。');
t(onstage(u).indexOf(N(folks[0]))<0,'她離場了',onstage(u).join('、'));
t(roster(u).indexOf(N(folks[0]))>=0,'回到待命名單',roster(u).slice(0,70));

console.log('\n── ③ 🔒 同行的人 AI 帶不走（這是整個設計的重點）');
// ⚠ 這一段驗的是【在場＝同行 ∪ 臨時在場】這個聯集：同行者不經過 _on，所以 cast.leave
//    無論如何都碰不到他。cast 那邊的同行者 guard 是第二道（防它把同行者從 _on 裡剔掉），
//    單獨拿掉看不出差別——所以下面第二條【直接驗那一格沒被動過】，那才測得到 guard。
run({action:'kanshou_party',pcId:kpc,acctName:'風音',npcId:String(folks[1][C.ID]),op:'add'});
const _mem0=String(me()[C.MEMORY]||'');
CAST={join:[N(folks[1])],leave:[]};   // 先讓 AI 試著把同行者也塞進臨時在場那一格
play('她也來了。');
CAST={join:[],leave:[N(folks[1])]};
play('她也走吧。');
CAST={join:[],leave:[]};
u=play('還在嗎？');
t(onstage(u).indexOf(N(folks[1]))>=0,'同行者【還在場】——leave 碰不到他',onstage(u).join('、'));
const _party=JSON.parse(evalIn('JSON.stringify(kanshouGetParty_('+JSON.stringify(String(me()[C.MEMORY]||''))+'))'));
t(_party.indexOf(String(folks[1][C.ID]))>=0,'同行名單也沒被動過（那是玩家的）');
const _onNow=JSON.parse(evalIn('JSON.stringify(kanshouGetOnstage_('+JSON.stringify(String(me()[C.MEMORY]||''))+'))'));
t(_onNow.indexOf(String(folks[1][C.ID]))<0,'同行者也【沒被塞進臨時在場那一格】（兩層不重疊）',_onNow.join(','));

console.log('\n── ④ 在場總數封頂');
t(folks.length>MAX,'這一局的人夠多，撞得到上限（'+folks.length+' 位 > '+MAX+'）');
CAST={join:folks.map(N),leave:[]};   // 全部都叫進來
play('大家都來了。');
CAST={join:[],leave:[]};
u=play('好熱鬧。');
t(onstage(u).length<=MAX,'在場人數沒超過上限（'+onstage(u).length+'/'+MAX+'）',onstage(u).join('、'));
t(onstage(u).indexOf(N(folks[1]))>=0,'同行者一定佔得到位子（永遠排前面）');
// ⚠ 上面兩條驗的是【聯集】那一層（presentRows 自己也封頂），cast 那道是第二層。
//    真正測得到 cast 上限的是【存下來的那一格】——它不該被塞爆。
const _stored=JSON.parse(evalIn('JSON.stringify(kanshouGetOnstage_('+JSON.stringify(String(me()[C.MEMORY]||''))+'))'));
const _pn=JSON.parse(evalIn('JSON.stringify(kanshouGetParty_('+JSON.stringify(String(me()[C.MEMORY]||''))+'))')).length;
t(_pn+_stored.length<=MAX,'存下來的臨時在場也沒超過上限（同行 '+_pn+' ＋ 臨時 '+_stored.length+' ≤ '+MAX+'）');

console.log('\n── ⑤ 邊界：查無此人、空的、亂塞');
const before=onstage(play('……')).length;
CAST={join:['根本沒有這個人'],leave:['也沒有這個']};
play('？');
CAST={join:[],leave:[]};
t(onstage(play('？？')).length===before,'查無此人一律忽略，也不會炸',String(before));
CAST=null;
t(typeof play('沒有 cast 欄')==='string','AI 整格沒吐也不會炸');
CAST={join:[],leave:[]};

console.log('\n── ⑥ 記憶不受進出影響（存在她自己那一列）');
const her=folks[0];
her[C.MEMOIR]='我們在河邊一起看了野鴨';
CAST={join:[N(her)],leave:[]}; play('我去找她。'); CAST={join:[],leave:[]};
u=play('嗨，河邊的野鴨還在嗎？');   // 回憶 2026-09-23 起提到才亮
t(u.indexOf('我們在河邊一起看了野鴨')>=0,'離開又回來，共同回憶原樣還在（提到就餵得回來）');

console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
