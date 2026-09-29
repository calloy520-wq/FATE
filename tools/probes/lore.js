// 📖 觸發條目：喜歡／討厭這種話題道具，玩家這一步提到才進提示詞；AI 自己寫的字不算提到。
const P=require('./probe.js'); const {ctx,evalIn,sheets,run}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,220):''));} };
let CAP=null, NARR='x'; ctx.__CAP__=o=>{CAP=o;}; ctx.__NARR__=()=>NARR;
evalIn('callGeminiAPI=function(p,s,c){ __CAP__({p:p,s:s}); return JSON.stringify({narration:__NARR__(),options:["a","b","c","d","e","f"],intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:[]},world_note:[],scene:""}); }');
sheets['帳號']._d.push(['風音','','2026-09-15','']);
const kpc=run({action:'enter_kanshou',acctName:'風音',pcName:'風音',pcSex:'女'}).pcId;
for (const id of ['遠坂凜-Master','間桐櫻黑化-Master']) { const r=run({action:'kanshou_summon_hero',acctName:'風音',pcId:kpc,heroId:id}); if(!r.success) throw new Error(id+' '+r.message); }
const d=sheets['鑑賞眾生']._d; const me=()=>d.find(x=>String(x[C.ID])===kpc);
const play=m=>{ CAP=null; run({action:'play',pcId:kpc,acctName:'風音',message:m}); return { u:String(CAP&&CAP.p||''), s:String(CAP&&CAP.s||'') }; };
const lore=u=>(u.split('\n').find(l=>l.indexOf('★【這一步碰到的底細】')===0)||'');

console.log('\n── ① 在場卡上不再有喜歡／討厭');
let r=play('我端了兩杯紅茶走進客廳。');
t(!/喜歡寶石|討厭電子產品|喜歡甜點|討厭體育/.test(r.s),'system 的在場卡沒有喜歡／討厭',r.s.match(/【在場人物】凜[^\n]*/)&&r.s.match(/【在場人物】凜[^\n]*/)[0]);
t(/【在場人物】凜。女，真名遠坂凜。完美的優等生，刀子嘴豆腐心。/.test(r.s),'性格前兩格還在（抬頭帶真名）');
t(lore(r.u)==='','沒提到任何東西＝整段不存在');

console.log('\n── ② 玩家提到手機 → 只有凜的條目亮');
r=play('轉頭問凜：「妳上週新買的那支手機，設定好了嗎？」');
t(/凜：對電子產品完全沒轍/.test(lore(r.u)),'凜的電子產品條目亮了',lore(r.u));
t(!/櫻：/.test(lore(r.u)),'櫻沒被拖進來');
t(!/寶石/.test(lore(r.u)),'凜的另一條（寶石）沒亮');

console.log('\n── ③ 提到蛋糕 → 櫻的甜點條目');
r=play('要不要吃點蛋糕？');
t(/櫻：喜歡甜點和怪談/.test(lore(r.u)),'櫻的條目亮了',lore(r.u));
t(!/凜：/.test(lore(r.u)),'凜沒亮');

console.log('\n── ④ AI 自己寫的字不算提到');
NARR='凜把玩著手上的寶石，櫻端來一塊蛋糕。';
play('我點點頭。');                    // 這一回合 AI 寫了寶石、蛋糕
r=play('天氣真好。');                   // 下一回合玩家沒提
t(lore(r.u)==='','上一段敘事裡的寶石／蛋糕沒有觸發',lore(r.u));
evalIn('KANSHOU_LORE_SCAN_AI_ = true');
r=play('天氣真好。');
t(/寶石/.test(lore(r.u)) && /甜點/.test(lore(r.u)),'開關打開才連上一段敘事一起掃',lore(r.u));
evalIn('KANSHOU_LORE_SCAN_AI_ = false'); NARR='x';

console.log('\n── ⑤ 沒有種子條目的人：從 PREF 第三、四格長出來（原創英靈／改命過的）');
const sakura=d.find(x=>String(x[C.NAME])==='櫻');
sakura[C.MEMORY]=String(sakura[C.MEMORY]).replace(/【英靈源】[^｜]*/,'【英靈源】沒有這個人');
sakura[C.PREF]='溫柔乖巧、慢半拍、釣魚與看海、蟑螂';
r=play('週末去釣魚好不好？');
t(/櫻：喜歡釣魚與看海/.test(lore(r.u)),'PREF 長出來的條目亮了',lore(r.u));
r=play('有蟑螂！');
t(/櫻：討厭蟑螂/.test(lore(r.u)),'討厭那格也會',lore(r.u));

console.log('\n── ⑥ 我自己的喜好也走同一條');
me()[C.PREF]='沉穩、認真、咖啡、蟲子';
r=play('我泡了杯咖啡。');
t(/我：喜歡咖啡/.test(lore(r.u)),'御主自己的條目',lore(r.u));

console.log('\n── ⑦ 冬木的世界條目');
r=play('我們去商店街逛逛吧。');
t(/商店街在坡道下/.test(lore(r.u)),'提到商店街才給那句正典事實',lore(r.u));
r=play('走吧。');
t(lore(r.u)==='','沒提就沒有');

console.log('\n── ⑧ 種子的經歷整格退休；玩家自己寫的經歷才走觸發（點名的人在場常駐、提到才亮）');
sakura[C.MEMORY]=String(sakura[C.MEMORY]).replace(/【英靈源】[^｜]*/,'【英靈源】間桐櫻黑化-Master');
const rin=d.find(x=>String(x[C.NAME])==='凜');
t(String(rin[C.BACK]||'')==='' && String(sakura[C.BACK]||'')==='','召喚出來的同伴經歷格是空的（種子不再供值）');
r=play('早安。');
t(!/借住|打工|當家|感情很好/.test(r.s) && !/借住|打工|當家|感情很好/.test(r.u),'提示詞裡沒有我們編的那些打工／住哪');
rin[C.BACK]='妹妹是櫻，我們常一起去河堤散步';       // 玩家自己改命寫的
r=play('早安。');
t(/凜：[^｜]*妹妹是櫻/.test(lore(r.u)),'玩家寫的經歷點名了在場的櫻 → 在她面前是常識、常駐',lore(r.u));
const pids=d.filter((x,i)=>i>0&&String(x[C.ID])!==kpc&&String(x[C.FACTION])==='從者').map(x=>[String(x[C.NAME]),String(x[C.ID])]);
const rinId=pids.find(x=>x[0]==='凜')[1];
me()[C.MEMORY]=evalIn('kanshouSetParty_('+JSON.stringify(String(me()[C.MEMORY]||''))+','+JSON.stringify([rinId])+')');
r=play('早安。');
t(!/妹妹是櫻/.test(lore(r.u)),'櫻不在場、沒提到 → 不亮',lore(r.u));
r=play('我們去河堤走走吧。');
t(/凜：[^｜]*妹妹是櫻/.test(lore(r.u)),'提到「河堤」→ 亮',lore(r.u));
me()[C.MEMORY]=evalIn('kanshouSetParty_('+JSON.stringify(String(me()[C.MEMORY]||''))+','+JSON.stringify(pids.map(x=>x[1]))+')');
rin[C.BACK]='';

console.log('\n── ⑨ 共同回憶：釘選常駐、其餘提到才亮');
rin[C.MEMOIR]='★第一次一起看煙火｜在遊樂園坐了三次雲霄飛車｜下雨天躲在便利商店屋簷下';
r=play('早安。');
let mem=(r.u.match(/凜：[^\n]*/)||[''])[0];
t(/看煙火/.test(mem) && !/雲霄飛車/.test(mem) && !/便利商店/.test(mem),'只有釘選的那條在',mem.slice(0,120));
r=play('還記得那次雲霄飛車嗎？');
mem=(r.u.match(/凜：[^\n]*/)||[''])[0];
t(/雲霄飛車/.test(mem) && !/便利商店/.test(mem),'提到雲霄飛車 → 那條亮，便利商店那條沒亮',mem.slice(0,120));

console.log('\n── ⑩ 世界帳本同一套：釘選／在場人物／提到才亮');
const gid=String(me()[C.GAME_ID]);
evalIn('worldWrite_('+JSON.stringify(gid)+',[{kind:"地點",name:"河堤的長椅",text:"河堤上那張掉漆的長椅"},{kind:"人物",name:"便當店阿姨",text:"商店街便當店的老闆娘",sex:"女"}],1,5)');
r=play('早安。');
t(!/河堤的長椅|便當店阿姨/.test(r.u),'剛寫進帳本（近期）也不會自己冒出來',(r.u.match(/★【[^】]*帳本[^\n]*/)||[''])[0]);
r=play('我們去河堤坐坐。');
t(/掉漆的長椅/.test(r.u) && !/便當店/.test(r.u),'提到河堤 → 只有長椅那條',(r.u.match(/★【[^】]*帳本[^\n]*|★【[^\n]*長椅[^\n]*/)||[''])[0]);

console.log('\n── ⑪ 卡片抬頭帶真名（暱稱「凜」模型要靠雙馬尾猜；「遠坂凜」就不必猜）');
r=play('早安。');
t(/【在場人物】凜。女，真名遠坂凜。/.test(r.s) && /【在場人物】櫻。女，真名間桐櫻。/.test(r.s),'凜。女，真名遠坂凜／櫻。女，真名間桐櫻',(r.s.match(/【在場人物】[^。]*/g)||[]).join(' / '));

console.log('\n── ⑫ 裝扮句：講過就不再每回合送；換了／提到／身體不是如常才送');
const rinLine=u=>(u.split('\n').find(l=>l.indexOf('凜：')===0)||'');
const meLine=u=>(u.split('\n').find(l=>l.indexOf('【我自己】')===0)||'');
const setTold=(row,v)=>{ row[C.MEMORY]=evalIn('KANSHOU_OUTFIT_TOLD_TAG_.set('+JSON.stringify(String(row[C.MEMORY]||''))+','+JSON.stringify(v)+')'); };
setTold(rin,''); setTold(me(),'');
r=play('早安。');
t(/穿著紅衣黑裙/.test(rinLine(r.u)),'還沒講過 → 送',rinLine(r.u).slice(0,80));
t(/穿著/.test(meLine(r.u)),'御主自己那句同一套：第一次送',meLine(r.u).slice(0,120));
r=play('早安。');
t(!/穿著/.test(rinLine(r.u)),'講過了、沒提到、身體如常 → 這回合不送',rinLine(r.u).slice(0,80));
t(!/穿著/.test(meLine(r.u)),'御主那句也不送');
r=play('妳今天這件裙子很好看。');
t(/穿著紅衣黑裙/.test(rinLine(r.u)),'玩家提到衣物 → 送',rinLine(r.u).slice(0,80));
rin[C.MEMORY]=evalIn('setOutfit_('+JSON.stringify(String(rin[C.MEMORY]||''))+',"白色連身裙")');
r=play('早安。');
t(/穿著白色連身裙/.test(rinLine(r.u)),'換了衣服（玩家換裝或 AI 寫回）→ 送新的',rinLine(r.u).slice(0,80));
r=play('早安。');
t(!/穿著/.test(rinLine(r.u)),'講過新的之後又不送了');
rin[C.PHYSICAL]='{"狀態":"衣領被扯開，臉頰發燙"}';
r=play('早安。');
t(/穿著白色連身裙/.test(rinLine(r.u)),'肉體狀態不是如常（衣物是畫面重點）→ 送',rinLine(r.u).slice(0,120));
rin[C.PHYSICAL]='{}';

console.log('\n── ⑬ AI 把亮起的底細抄成 world_note → 不寫進帳本（否則在場時常駐，加料從後門回來）');
let NOTES=[]; ctx.__NOTES__=()=>{ const n=NOTES; NOTES=[]; return n; };
evalIn('callGeminiAPI=function(p,s,c){ __CAP__({p:p,s:s}); return JSON.stringify({narration:__NARR__(),options:["a","b","c","d","e","f"],intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:[]},world_note:__NOTES__(),scene:""}); }');
const readW=()=>JSON.parse(evalIn('JSON.stringify(worldRead_('+JSON.stringify(gid)+'))'));
NOTES=[{kind:'人物',name:'凜的手機恐懼',text:'對電子產品完全沒轍，連手機都搞不定。',sex:'女'},
       {kind:'設定',name:'凜的弱點',text:'凜對電子產品沒轍。'},
       {kind:'地點',name:'河堤的長椅',text:'河堤上那張掉漆的長椅。'}];
play('妳那支手機設定好了嗎？');
const w=readW();
t(!w.some(x=>/手機恐懼|電子產品/.test(x.name+x.text)),'抄底細的那兩條沒進帳本',JSON.stringify(w.map(x=>x.name)));
t(w.some(x=>x.name==='河堤的長椅'),'真的新東西照寫');
NOTES=[{kind:'人物',name:'櫻的姊姊',text:'櫻很黏她姊姊。',sex:'女'},{kind:'人物',name:'便當店阿姨',text:'商店街便當店的老闆娘。',sex:'女'}];
play('早安。');
const w2=readW();
t(!w2.some(x=>x.name==='櫻的姊姊'),'kind 人物、名字含同伴名 → 不寫（同伴有自己那一列）',JSON.stringify(w2.map(x=>x.name)));
t(w2.some(x=>x.name==='便當店阿姨'),'常民照寫');

console.log('\n── ⑭ 「冬天的清晨」只在時段換了才送（每回合都送＝每回合拿它當開頭）');
const nowLine=u=>(u.split('\n').find(l=>l.indexOf('★【此刻】')===0)||'');
me()[C.MEMORY]=evalIn('KANSHOU_NOW_TOLD_TAG_.set('+JSON.stringify(String(me()[C.MEMORY]||''))+',"")');
r=play('早安。');
t(/★【此刻】(春天|夏天|秋天|冬天)的(清晨|午後|黃昏|夜|深夜)。這一幕/.test(nowLine(r.u)),'還沒講過 → 送季節與時段',nowLine(r.u));
r=play('嗯。');   // 「早安」含時間詞，會再錨一次；這裡要的是什麼都沒提
t(/^★【此刻】這一幕就寫這/.test(nowLine(r.u)),'同一個時段、沒提時間 → 只剩節奏那句',nowLine(r.u));
me()[C.HOUR]=14;   // 跳到午後
r=play('下午了。');
t(/的午後。/.test(nowLine(r.u)),'時段換了 → 再送一次',nowLine(r.u));
r=play('嗯。');
t(!/午後/.test(nowLine(r.u)),'講過午後之後又不送');
r=play('晚餐想吃什麼？');
t(/★【此刻】仍是(春天|夏天|秋天|冬天)的午後。/.test(nowLine(r.u)),'玩家提到時間（晚餐）→ 再錨一次「仍是…」（不錨模型會直接把天寫黑）',nowLine(r.u));
r=play('嗯。');
t(!/午後/.test(nowLine(r.u)),'沒提時間 → 又不送');


// 寶具改名時，LORE_NP_KEYS_ 的索引要跟著改——否則那一位的日常關鍵字悄悄失效（v93 理想鄉改名時就漏過一次）
const npNames=JSON.parse(evalIn(`JSON.stringify(SEED_SERVANTS.reduce(function(a,s){ return a.concat(String(s.np||'').split('／').map(function(x){ return x.replace(/\\s.*$/,'').replace(/（.*$/,'').trim(); })); },[]))`));
const stale=Object.keys(JSON.parse(evalIn('JSON.stringify(LORE_NP_KEYS_)'))).filter(k=>npNames.indexOf(k)<0);
t(stale.length===0,'寶具觸發表的每個索引都是某位種子真的有的寶具名（改名沒漏）',stale.join('、'));
console.log(bad?('\n❌ '+bad+' 條沒過（通過 '+ok+'）'):('\n✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
