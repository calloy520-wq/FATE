// 🏷️ 關係稱呼只有玩家能填（2026-09-23）；專屬稱呼 AI 可寫、玩家打過就鎖；兩把鎖不互相洗掉
const P=require('./probe.js'); const {ctx,evalIn,sheets,run,summonN}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
const CH=JSON.parse(evalIn('JSON.stringify(COL.HERO)'));
let AI={};
const say=o=>{ AI=o; evalIn('callGeminiAPI=function(){ return '+JSON.stringify(JSON.stringify(Object.assign({
  inner_monologue:"—",narration:"她看了你一眼。",npc_exit:[],options:["a","b","c","d"],world_note:[],
  intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:[]}},o)))+'; }'); };
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+x:''));} };
// 🫂 2026-09 地點退休後在場＝同行：把某幾位加進玩家的同行清單（探針共用寫法）。
const joinParty=(meRow,ids)=>{ meRow[C.MEMORY]=evalIn('kanshouSetParty_('+JSON.stringify(String(meRow[C.MEMORY]||''))+','+JSON.stringify(ids.map(String))+')'); };
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'男'}).pcId;
// 🌟 2026-09 起始住民整組取消（開局一片空白）——要人就得自己召喚。
summonN('風音', kpc, 2);
const KD=()=>sheets['鑑賞眾生']._d.slice(1);
const me=()=>KD().find(x=>String(x[C.ID])===kpc);
const gid=String(me()[C.GAME_ID]);
const her=()=>KD().find(x=>String(x[C.GAME_ID])===gid&&String(x[C.ID])!==kpc);
// 把一位同伴拉到玩家身邊
(function(){ const d=sheets['鑑賞眾生']._d; for(let i=1;i<d.length;i++){ if(String(d[i][C.GAME_ID])!==gid||String(d[i][C.ID])===kpc) continue; joinParty(me(),[String(d[i][C.ID])]); break; } })();
const hn=()=>String(her()[C.NAME]); const hid=()=>String(her()[C.ID]);
const INIT_TAG=String(her()[C.REL_TAG]||''), INIT_MEM=String(her()[C.REL_MEM]||'');
const fb=(o)=>({ intimacy_feedback:{ player:{physical_state:"",appearance_extras:""}, npcs:[Object.assign({name:hn()},o)] } });
const turn=(o,msg)=>{ say(fb(o)); run({action:'play',pcId:kpc,acctName:'風音',message:msg||'我在她旁邊坐下來。'}); };

console.log('── ① 關係稱呼只有玩家能填：AI 回傳 rel_tag 一律不收（schema 也沒有這格）');
turn({rel_tag:'鄰居', mutual_nicknames:'風音'});
t(String(her()[C.REL_TAG])===INIT_TAG,'AI 寫的關係稱呼沒落地（仍為「'+her()[C.REL_TAG]+'」）');
t(/風音/.test(String(her()[C.REL_MEM])),'AI 寫的專屬稱呼照舊落地');
turn({rel_tag:'嚴格的餐桌守護者'});
t(String(her()[C.REL_TAG])===INIT_TAG,'每回合換稱號那種也進不來');
t(!/rel_tag/.test(evalIn('buildDefaultSystemPrompt(true, {}, "")')),'輸出範本裡沒有 rel_tag');

console.log('── ② 玩家打過就鎖住，AI 從此改不動');
let r=run({action:'update_rel_tag',acctName:'風音',pcId:kpc,targetName:hn(),targetId:hid(),newTagText:'青梅竹馬'});
t(r.success,'玩家改關係稱呼成功',r.message);
t(/\[關係鎖\]是/.test(String(her()[C.REL_MEM])),'蓋上了【關係鎖】');
turn({rel_tag:'前輩'});
t(String(her()[C.REL_TAG])==='青梅竹馬','玩家填的留著（現為 '+her()[C.REL_TAG]+'）');

console.log('── ③ 兩把鎖不互相洗掉（舊版整格取代的坑）');
t(!/\[稱呼鎖\]是/.test(String(her()[C.REL_MEM])),'此時還沒蓋稱呼鎖');
r=run({action:'kanshou_set_nickname',acctName:'風音',pcId:kpc,targetName:hn(),targetId:hid(),newNickname:'小風'});
t(r.success,'玩家設專屬稱呼成功',r.message);
const rm=String(her()[C.REL_MEM]);
t(/\[稱呼鎖\]是/.test(rm)&&/\[關係鎖\]是/.test(rm),'兩把鎖同時在（'+rm+'）');
turn({rel_tag:'學長', mutual_nicknames:'笨蛋'});
const rm2=String(her()[C.REL_MEM]);
t(/\[稱呼鎖\]是/.test(rm2)&&/\[關係鎖\]是/.test(rm2),'AI 寫過一輪之後兩把鎖都還在（'+rm2+'）');
t(String(her()[C.REL_TAG])==='青梅竹馬'&&/小風/.test(rm2)&&!/笨蛋/.test(rm2),'兩格都還是玩家定的');

console.log('── ④ 注入與長度');
run({action:'update_rel_tag',acctName:'風音',pcId:kpc,targetName:hn(),targetId:hid(),newTagText:'x'});
sheets['鑑賞眾生']._d.forEach(row=>{ if(String(row[C.ID])===hid()) row[C.REL_MEM]='[專屬稱呼]無'; }); // 解鎖重測
run({action:'update_rel_tag',acctName:'風音',pcId:kpc,targetName:hn(),targetId:hid(),newTagText:'｜[態度]壞掉'+'長'.repeat(40)});
const tag=String(her()[C.REL_TAG]);
t(tag.indexOf('｜')<0,'玩家輸入的分隔符被剝掉（'+tag+'）');
t(tag.length<=20,'長度有夾（'+tag.length+'）');
t(/\[專屬稱呼\]/.test(String(her()[C.REL_MEM])),'REL_MEM 的格式沒被那串字撐壞');

console.log('── ④.5 清空＝拿掉這個稱呼（空是合法狀態，UI 必須走得回去）');
// 🐛→✅ 2026-09 玩家實測：AI 把提示詞裡的「純女女之愛」填進四個人的 rel_tag，玩家清不掉
//   （後端寫死「稱呼不能空白」）。而 REL_TAG 的預設值【就是空的】，空本來就合法。
run({action:'update_rel_tag',acctName:'風音',pcId:kpc,targetName:hn(),targetId:hid(),newTagText:'純女女之愛'});
t(String(her()[C.REL_TAG])==='純女女之愛','先設一個爛標籤');
t(/\[關係鎖\]是/.test(String(her()[C.REL_MEM])),'此時鎖著');
let rc=run({action:'update_rel_tag',acctName:'風音',pcId:kpc,targetName:hn(),targetId:hid(),newTagText:''});
t(rc.success===true,'清空這個動作會成功',JSON.stringify(rc));
t(String(her()[C.REL_TAG])==='','關係稱呼真的被清掉了','實際：「'+her()[C.REL_TAG]+'」');
t(!/\[關係鎖\]是/.test(String(her()[C.REL_MEM])),'【關係鎖】一起解開＝撤回我的指定，交還給說書人');
turn({rel_tag:'同居人'});
t(String(her()[C.REL_TAG])==='','解鎖之後 AI 也還是寫不進來（這格只有玩家能填）');

console.log('── ⑤ AI 寫的不回餵、玩家設的才餵（自我鎖死的迴路）');
let CAP=null; ctx.__CAP__=o=>{CAP=o;};
const capTurn=()=>{ CAP=null;
  evalIn('callGeminiAPI=function(p,s,c){ __CAP__({p:p,s:s,c:c}); return JSON.stringify({narration:"x",npc_exit:[],options:["a","b","c","d"],intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:[]},world_note:[]}); }');
  run({action:'play',pcId:kpc,acctName:'風音',message:'我在她旁邊坐下來。'});
  return String((CAP&&CAP.p)||'')+'\n'+String((CAP&&CAP.s)||'');
};
sheets['鑑賞眾生']._d.forEach(row=>{ if(String(row[C.ID])===hid()) row[C.REL_MEM]='[專屬稱呼]無'; }); // 解鎖
turn({rel_tag:'戀人'});
t(String(her()[C.REL_TAG])==='','AI 回傳的標籤不存（這格只有玩家能填）');
const T1=capTurn();
t(T1.indexOf('戀人')<0,'提示詞裡也沒有它');
t(INIT_TAG==='','剛召喚時關係稱呼是空的（會過期的快照不該當起始資料寫死）','實際：「'+INIT_TAG+'」');
t(!/初次相遇|緣分才剛開始|點頭之交/.test(INIT_MEM),'剛召喚時 REL_MEM 也沒有寫死的關係散文','實際：'+INIT_MEM);
t(!/我們還只是初識|我們已經混熟|我們是老交情了/.test(T1),'熟悉度是描述狀態、不是一句可以照唸的台詞');
run({action:'update_rel_tag',acctName:'風音',pcId:kpc,targetName:hn(),targetId:hid(),newTagText:'未婚妻'});
const T2=capTurn();
t(T2.indexOf('未婚妻')>=0,'玩家自己設的標籤【有】送給 AI（玩家的意志是輸入）');

console.log('── ⑥ 逐字歷史窗口（它自己的散文是最大的固化來源）');
// 🐛→✅ 2026-09 量出來：穩定之後【玩家講的話 16 字、說書人自己上兩段寫的散文 1020 字】，1:64。
//   模型在問「這一回合該長什麼樣」時，最大聲的答案是它自己剛寫的那幾塊，於是開始逐字抄自己。
//   窗口是【換敘事連貫感】的旋鈕，要動請動常數、別在函式裡寫死數字。
const WIN=parseInt(evalIn('KANSHOU_HIST_WINDOW_'));
const _h=((CAP&&CAP.c)||{}).chatHistory||[];
t(WIN===4,'KANSHOU_HIST_WINDOW_ 是 4（＝最近兩個來回·玩家 2026-09 定案）','實際：'+WIN);
t(_h.length<=WIN,'真的送出去的歷史沒有超過這個窗口（'+_h.length+' 則）');
t(_h.filter(x=>x.role!=='user').length<=2,'說書人自己的散文最多只回放兩段（窗口 4 筆＝2 輪）');

console.log('\n'+(bad?'❌ '+bad+' 條沒過（通過 '+ok+'）':'✅ 全部 '+ok+' 條通過'));
process.exit(bad?1:0);
