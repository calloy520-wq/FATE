// 🫂 同行與在場：2026-09 改成【站在同一個地點就在場】；同行只決定「她會不會跟著你走」。
//    上限、增減、跟著走、解散留在原地、叫她過來、召喚站進來、舊存檔遷移各一段。
const P=require('./probe.js'); const {ctx,evalIn,sheets,run,summonN}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,170):''));} };
// 🫂 2026-09 地點退休後在場＝同行：把某幾位加進玩家的同行清單（探針共用寫法）。
const joinParty=(meRow,ids)=>{ meRow[C.MEMORY]=evalIn('kanshouSetParty_('+JSON.stringify(String(meRow[C.MEMORY]||''))+','+JSON.stringify(ids.map(String))+')'); };
let CAP=null; ctx.__CAP__=o=>{CAP=o;};
evalIn('callGeminiAPI=function(p,s,c){ __CAP__({p:p,s:s}); return JSON.stringify({inner_monologue:"—",narration:"x",npc_exit:[],options:["a","b","c","d"],intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:[]},world_note:[],rel_changes:[]}); }');
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'男'}).pcId;
// 🌟 2026-09 起始住民整組取消（開局一片空白）——要人就得自己召喚。
//    ⚠ 召喚會【順手加進同行】，所以召完先清空，下面「第一回合誰都不在」才驗得到。
const SUMMONED=summonN('風音', kpc, 5);
run({action:'kanshou_party',pcId:kpc,acctName:'風音',op:'clear'});
const d=sheets['鑑賞眾生']._d; const me=()=>d.find(x=>String(x[C.ID])===kpc);
const MAX=parseInt(evalIn('String(KANSHOU_PARTY_MAX_)'),10);
const allies=d.filter((r,i)=>i>0&&String(r[C.ID])!==kpc&&String(r[C.FACTION])==='從者');
const pty=(op,id)=>run({action:'kanshou_party',pcId:kpc,acctName:'風音',npcId:id||'',op:op});
// 🧊 2026-09：「他們是誰」那半搬進 system 吃快取，「此刻」留在 user——在場名單改從 system 讀。
const play=(m,extra)=>{ CAP=null; run(Object.assign({action:'play',pcId:kpc,acctName:'風音',message:m},extra||{})); return String(CAP&&CAP.s||'')+'\n'+String(CAP&&CAP.p||''); };
// 卡片 2026-09 改寫成人話：開頭是「【在場人物】名字。性別，真名X。」（名字單獨成句）
const onstage=(u)=>u.split('\n').filter(l=>/^【在場人物】/.test(l)).map(l=>(l.match(/^【在場人物】([^。]+)。/)||[,''])[1].trim());

console.log('開局住民 '+allies.length+' 位、同行上限 '+MAX);

console.log('── ⓪ 新局：一片空白，第一回合誰都不在（人住在城裡，但沒被自動拉進同行）');
t(/【同行】/.test(String(me()[C.MEMORY])),'建列時就寫了空的【同行】標記');
t(onstage(play('我環顧四周。')).length===0,'第一回合在場人物是空的');

console.log('── ① 空名單：誰都不在場');
pty('clear');
t(onstage(play('我一個人坐著。')).length===0,'沒人同行時，在場人物是空的');

console.log('── ② 加一個人就在場');
const A=allies[0], B=allies[1], Cc=allies[2], D=allies[3];
t(pty('add',String(A[C.ID])).success,'加得進去');
let st=onstage(play('我看著窗外。'));
t(st.length===1&&st[0]===String(A[C.NAME]),'在場的只有他：'+st.join('、'));

console.log('── ③ 上限擋得住');
pty('add',String(B[C.ID])); pty('add',String(Cc[C.ID]));
const over=pty('add',String(D[C.ID]));
t(!over.success&&/最多|'+MAX+'/.test(over.message||''),'滿了就拒絕：'+over.message);
t(pty('add',String(A[C.ID])).party.length===MAX,'重複加同一人不會變胖');
t(onstage(play('我們四個人閒聊。')).length===MAX,'在場人數等於上限');

console.log('── ④ 只認 id，不認名字');
t(!run({action:'kanshou_party',pcId:kpc,acctName:'風音',targetName:String(D[C.NAME]),op:'add'}).success,'只給名字加不進來');

console.log('── ⑤ 解散＝離開同行，也就離開這一幕');
// 🔁 2026-09 地點整組退休：在場＝同行，所以「解散之後他還站在原地」這件事不存在了。
//    舊斷言（我 A 解散他，他會一直在 A）連同地點一起退休。
const dr=pty('drop',String(B[C.ID]));
t(dr.success&&dr.party.indexOf(String(B[C.ID]))<0,'drop 之後同行名單裡沒有他');
t(onstage(play('我轉身。')).indexOf(String(B[C.NAME]))<0,'他也就不在這一幕裡了（在場＝同行）');

console.log('── ⑥ 在場來由：只在 AI 猜不到的時候才講');
// 🔁 2026-09 地點整組退休：原本這裡驗「跟著你走／同地點就在場／🙋叫她過來」三段，
//    那三件事都是位置系統的產物，整組跟著退休。在場＝同行，就這樣。
//    在場來由也只剩【時間跳過之後】一種——「剛結伴走到」不再是會發生的事。
t(!/在場來由|從剛才就一直在這裡/.test(play('我們繼續聊。')),'一般回合沒有在場來由那一行');
t(/依然在你身邊/.test(play('先休息一下。',{endDay:true})),'時間跳過之後＝有講');
t(!/與你結伴一起來到/.test(play('我們繼續。')),'「剛結伴走到」已經不會出現了');
// 🚪 不在同行名單上的人就不在這一幕裡——不管她在英靈殿裡是不是活著。
t(onstage(play('我看看四周還有誰。')).indexOf(String(D[C.NAME]))<0,'沒加進同行的人不在場');


console.log('── ⑧ 召喚：還有位子就直接站進來');
pty('clear');
// ⚠ 2026-09 起始住民取消：原本這裡要避開那 4 位。現在直接【試到成功為止】——
//    擋下來的理由不只一種（已召過、同一位英靈的另一種姿態、世界滿員），自己算容易漏。
const heroes=(run({action:'get_heroes',pcId:kpc,acctName:'風音'}).heroes)||[];
let sm={success:false,message:'沒有可召的人'};
for (const h of heroes) {
  if (SUMMONED.indexOf(String(h.id))>=0) continue;
  const r=run({action:'kanshou_summon_hero',pcId:kpc,acctName:'風音',heroId:String(h.id)});
  if (r&&r.success) { sm=r; break; }
}
t(sm.success,'召喚成功：'+(sm.added||sm.message));
const comp=run({action:'kanshou_companions',pcId:kpc,acctName:'風音'});
const fresh=(comp.current||[]).find(c=>c.name===sm.added);
t(!!fresh&&fresh.party===true,'剛召喚的人已經在同行名單裡');
t((comp.current||[]).filter(c=>c.party).length===1,'其餘的人沒有被一起拉進來');

console.log('── ⑨ 舊存檔遷移：只種一次，清空之後不會自己長回來');
// 把標記整個拔掉＝模擬同行制上線前的舊存檔
const mrow=me(); mrow[C.MEMORY]=String(mrow[C.MEMORY]).replace(/｜?【同行】[^｜【】]*/g,'');
play('我回到這裡。');
t(/【同行】/.test(String(me()[C.MEMORY])),'第一回合就把標記寫下來了');
// 🔁 2026-09 地點整組退休：舊版遷移會「把此刻同場的人收進同行」，而 LOC 不再是位置之後
//    那個比對沒有意義，所以改成種成【空的】——誰跟你走由玩家自己選。
t(onstage(play('嗨。')).length===0,'種成空的（不再憑 LOC 猜誰該跟著你）');
// 🔁 2026-09 地點整組退休：舊斷言是「清空同行【不會】讓人消失（他們還站在這裡）」。
//    在場＝同行之後，清空就是清場——這正是玩家要的「不要再扯到移動」。
pty('clear');
t(onstage(play('……')).length===0,'清空同行＝這一幕只剩你自己（在場＝同行）');

console.log('\n── ⑧ 熟悉段＝量得出來的物理距離，不是關係名詞 ──');
// 🐛→✅ 2026-09 第三輪（同一個坑）：關係名詞會被模型當形容詞照抄進旁白
//    （第一輪「我們還只是初識」→照唸；第二輪改成「相處還淺」→還是名詞標籤，
//    玩家貼回「我明明只是點頭之交而已」）。這一輪換軸：不給關係，給距離。
//    ⚠ 沒有任何掃描器看得到這張表（舊探針 known.js 斷言的是早就不存在的卡格式，
//      而且它不在 runall.sh 裡），所以這一段是這張表【唯一】的防線。
pty('clear');
const _tgt=allies[0], _tid=String(_tgt[C.ID]);
// 上一段把玩家走去了沒有人的地方——把對象搬到玩家腳下，卡片才組得出來。
joinParty(me(),[_tid]);
const setMet=n=>{ const r=d.find(x=>String(x[C.ID])===_tid);
  r[C.MEMORY]=evalIn('KANSHOU_MET_COUNT_TAG_.set('+JSON.stringify(String(r[C.MEMORY]||''))+','+n+')'); };
const cardOf=()=>{ const u=play('我看著'+String(_tgt[C.NAME])+'。');
  return (u.split('\n').find(l=>l.indexOf(String(_tgt[C.NAME])+'：')===0)||''); };
// 2026-09-23 玩家「真的不會寫就不要了」：每階那句「物理距離」整組拿掉，多熟交給 AI 從歷史判斷。
t(!/KANSHOU_FAMILIAR_TIERS_/.test(require('fs').readFileSync(require('path').join(__dirname,'../../gas/Gallery.gs'),'utf8')),'熟悉階段表沒有長回來');
setMet(30);
t(!/手臂|衣袖會碰到|沒有留距離/.test(cardOf()),'卡片上沒有距離那一句');
setMet(0);

console.log('\n── ⑩ 召喚了但沒同行的人，AI 仍然知道她們住在這座城裡 ──');
// 🐛→✅ 2026-09 玩家：「如果我召喚 4 個人都沒有用同行呢，AI 能知道他們在哪裡而已?」
//    實測答案是【一個字都沒有】——我砍 ★【這座城裡還有誰】時把整段砍掉是砍過頭：
//    那一段有兩半，「她此刻在哪」是地點系統的補丁（該砍），「這座城裡有誰」不是。
//    砍掉之後召喚只剩「加進一個你挑得到的清單」，這座城從 AI 的角度是空的。
const _roster=()=>{ const u=play('這座城最近怎麼樣？');
  return (u.split('\n').find(l=>l.indexOf('★【這座城裡還住著】')===0)||''); };
pty('clear');
const _r0=_roster();
t(!!_r0,'沒有人同行時，名單仍然送得出去',_r0.slice(0,60));
const _allNames=d.slice(1).filter(x=>String(x[C.GAME_ID])===String(me()[C.GAME_ID])&&String(x[C.ID])!==kpc)
  .map(x=>String(x[C.NAME]));
t(_allNames.length>0&&_allNames.every(n=>_r0.indexOf(n)>=0),'這一局的每一個人都在名單上',_allNames.join('、'));
t(!/也是同一人/.test(_r0),'只給名字，不附大小寫別名（那是舊的 at 逐字比對才需要的雜訊）');
t(!/在「|走過去|地點/.test(_r0),'不帶任何地點/移動的字眼');
// 🎭 玩家：「我不要真的近況，給 AI 掰就可以」——不存任何欄位，只授權它依時段掰。
//    不存＝不會固化（今天踩過三次自我回饋欄卡住不動的坑）。
t(/依此刻的時段/.test(_r0),'有授權 AI 依時段掰「那個人這時候在做什麼」');
t(!/近況|正在|此刻在/.test(_r0.replace('他們此刻不在這一幕裡','')),'但沒有存任何一個人的近況（那會變成第 4~11 個自我回饋欄）');
// 加進同行＝從名單挪到卡片，不該兩邊都出現。
pty('add', String(A[C.ID]));
const _r1=_roster();
t(_r1.indexOf(String(A[C.NAME]))<0,'同行的那位從名單裡拿掉了（她有卡片了）',_r1.slice(0,60));
t(onstage(play('嗨。')).indexOf(String(A[C.NAME]))>=0,'而且她真的在場');

console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
