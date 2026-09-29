// 🎨 風格層探針：預設零差異／固定段拒收且舊列不生效／尺度三態／篇幅檔位／還原／兩帳號互不污染／注入不切壞
const P=require('./probe.js'); const {ctx,evalIn,sheets,run,summonN}=P;
const C=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
let CAP=null; ctx.__CAP__=o=>{CAP=o;};
// 🫂 2026-09 地點退休後在場＝同行：把某幾位加進玩家的同行清單（探針共用寫法）。
const joinParty=(meRow,ids)=>{ meRow[C.MEMORY]=evalIn('kanshouSetParty_('+JSON.stringify(String(meRow[C.MEMORY]||''))+','+JSON.stringify(ids.map(String))+')'); };
evalIn('callGeminiAPI=function(p,s,c){ __CAP__({p:p,s:s}); return JSON.stringify({inner_monologue:"—",narration:"她看了你一眼。",npc_exit:[],options:["a","b","c","d"],intimacy_feedback:{player:{physical_state:"",appearance_extras:""},npcs:[]},world_note:[],rel_changes:[]}); }');
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+x:''));} };
function mk(acct,sex){ sheets['帳號']._d.push([acct,'','2026-09-15','']);
  const kpc=run({action:'enter_kanshou',acctName:acct,pcName:acct,pcSex:sex}).pcId;
  // 🌟 2026-09 起始住民整組取消（開局一片空白）——要人就得自己召喚。
  summonN(acct, kpc, 1);
  const d=sheets['鑑賞眾生']._d; const me=d.find(x=>String(x[C.ID])===kpc);
  const _ids=[]; for(let i=1;i<d.length;i++){ if(String(d[i][C.ID])===kpc) continue; if(_ids.length<1){ d[i][C.BOND]=62; _ids.push(String(d[i][C.ID])); } }
  joinParty(me,_ids);
  return {acct,kpc}; }
// 🧹 剝掉「不是風格層產出、卻會隨世界狀態冒出來」的區塊——這支比對的是逐字不變，
//    多一行世界事件就整份位移。清單漏一個就會變成偶發紅（跑不同 seed 才會現形）：
//    SEED=99 當場抓到兩個漏收：★【今天的約·尚未赴】與【在場人物】（後者是 GAS 依當前好感/現況
//    組出來的事實區塊，本來就會變）。發現新的往這裡加，然後回頭掃一輪種子確認。
const VOLATILE=/^★【此刻】|^★【稍早做過的事】|^★【獨處時光】|^★【今天的約|^★【昨天的約|^★【今天是「|^★【巧遇】|^【在場人物】/;
//    2026-09-23 裝扮句改成「講過就不再送」：第一回合之後 live 卡與【我自己】會少「穿著X。」那一句，比對前剝掉。
const norm=u=>u.split('\n').filter(l=>!VOLATILE.test(l)).join('\n').replace(/穿著[^。]*。/g,'');
function shot(a,msg){ CAP=null; run({action:'play',pcId:a.kpc,acctName:a.acct,message:msg||'我在她旁邊坐下來。'}); return {s:String(CAP.s||''),u:norm(String(CAP.p||''))}; }
const A=mk('風音','男'), B=mk('雪乃','女');
const base=shot(A);
console.log('── ① 預設＝現況（風格表沒有列）');
const g=run({action:'kanshou_get_style',pcId:A.kpc,acctName:A.acct});
t(g.success && g.modules && g.modules.length===2,'get_style 只回 2 個可調模組（尺度＋篇幅）', JSON.stringify(g).slice(0,140));
t(g.modules.map(m=>m.key).sort().join(',')==='lenTier,lewd','可調的就是 lewd 與 lenTier');
t(g.modules.every(m=>m.on && !m.custom),'全部預設·全部開啟');
// 🔒 其餘固定段不開放調整：面板看不到、路由拒收、表上的舊列一律忽略。
const FIXED=JSON.parse(evalIn('JSON.stringify(KANSHOU_STYLE_MODULES_.filter(function(m){return m.fixed;}).map(function(m){return m.key;}))'));
t(FIXED.length===8,'固定段 8 個（'+FIXED.length+'）·2026-09-23 加 gender(性別以卡為準)');
t(g.modules.every(m=>FIXED.indexOf(m.key)<0),'固定段不出現在面板');
// 🙈 預設句本體是提示詞，【不下傳前端】（玩家看到會出戲）——預設值一律從引擎自己問。
const DEF=k=>evalIn('kanshouStyleDefault_('+JSON.stringify(k)+')');
t(g.modules.every(m=>m.def===undefined),'get_style 不下傳預設句本體');
t(g.modules.every(m=>String(m.hint||'').length>=8),'每個模組都有給玩家看的一句提示');
t(g.cats===undefined,'不再回分頁表（只剩兩格，不需要分頁）');
const SYSD=JSON.parse(evalIn('JSON.stringify(KANSHOU_STYLE_MODULES_.filter(function(m){return m.slot===\'sys\';}).map(function(m){return kanshouStyleDefault_(m.key);}))'));
t(SYSD.every(d=>!d||base.s.indexOf(d)>=0),'sys 每個預設句都逐字在系統提示詞裡');
t(base.u.indexOf(DEF('length').replace('{篇幅}','400~520'))>=0,'user 的 {篇幅} 佔位有代入這回合的字數');
t(/^後日談敘事核心[^\n]*格式：\n1\. 玩家這一步/.test(base.s),'系統提示詞開頭與第 1 條編號正確');
t((base.s.match(/^\d+\. /gm)||[]).length===8,'預設格式 8 條（大精簡＋演法＋歷史＋性別）');
// 🔰 玩家打的字要真的進提示詞尾端（第 1 條叫 AI 去演的就是這一句），不然那條規則指向空氣。
t(/^1\. [^\n]*由玩家的輸入決定[^\n]*已經看見了[^\n]*反應寫起/m.test(base.s),'第 1 條＝由玩家的輸入決定、玩家自己已經看見了、從在場的人的反應寫起');
// 🗣️ 2026-09 玩家：「這是可以依照玩家角色的卡片進行擴寫＋動作的！」「但不能偏移語意太多！」
t(/可以擴寫成完整的一句、補上說這句話當下的動作與神態/.test(base.s),'玩家的台詞【可以】擴寫並補動作');
t(/擴寫的範圍就是這一句話/.test(base.s),'但擴寫的範圍就是那一句話（實測一句被擴成 400 字重播上一回合）');
// 📜 2026-09 實測「鬼打牆」：鑑賞整份 system 沒有任何一條說歷史已經發生過
t(/對話歷史是已經結束的事/.test(base.s),'歷史是已經結束的事（這條大精簡時被砍掉了）');
t(/一直以來】的底色，不是這一回合發生的事/.test(base.s),'卡上寫的是一直以來的底色（止住每回合重述外貌）');
t(/語意跟原句一樣/.test(base.s),'擴寫的天花板是語意不偏移');
// 🗑️ 2026-09 大精簡砍掉的那幾段，確認真的不在提示詞裡了（留著＝白付字數）
['系統沒有判定的那些小要求','繼承歷史情緒','肢體互動依雙方','卡片上的裝扮＝既定事實','任何系統數值留在系統裡',
 'inner_monologue','【視角鎖定】','【你也是這座城裡的一個人】','【稍早做過的事】']
  .forEach(x=>t((base.s+base.u).indexOf(x)<0,'已砍：'+x));
// 🗣 2026-09 玩家「不要教 ai 該寫什麼 只要用我的格式」＋「只有嘴巴會發出的聲音寫在台詞中」＋「台詞與互動至少 70%」
t(/單層「」只收嘴巴發得出的聲音/.test(base.s),'對話格式：引號只收嘴巴發得出的聲音');
// 🗑️ 2026-09 玩家「我真的只要給資料，還是格式」：每回合都送的【演法指令】整批砍除。
// 這四句各自造成過看得見的固化（收尾那條＝「紅著臉等待著我的下一步」連五回合），
// 改成墓碑斷言盯著它們別長回來。
const _ALL_=base.s+'\n'+base.u;  // ⚠ 曾經寫成 base.p（shot() 回的是 {s,u}），整批墓碑斷言長年只看得到 system
t(!/七成以上/.test(_ALL_),'配額式指令沒長回來（台詞佔七成）');
t(!/最後一句留給被搭話的人/.test(_ALL_),'🚨【收尾】沒長回來（固化成同一句結尾）');
t(!/情慾裡生理反應可以有/.test(_ALL_),'🛑【角色一致性】沒長回來（沒帶資訊的廢話）');
t(!/其餘的人在場、做自己的事就好/.test(_ALL_),'★【誰在場】的演法指令沒長回來');
t(!/拿捏分寸的依據|從稱呼、距離、眼神與舉動裡透出來/.test(_ALL_),'perform 的演法指令沒長回來');
// 🧹 2026-09 第二意見第三輪：三處【同一件事講兩遍／兩邊互相打架／跨區塊指路】。
// ⓐ voice 開頭的「在場的人各自用自己的名字稱呼」與對話格式那條講同一件事，
//    而對話格式才是管得住的那條（它說死了用卡片開頭那個名字、跨回合同一個）。
t(!/在場的人各自用自己的名字稱呼/.test(_ALL_),'voice 開頭的稱呼指令沒長回來（跟對話格式重複）');
t(/每句前冠說話者的名字，只用卡片開頭句號前那一個名字/.test(base.s),'稱呼規則只留在對話格式那一條');
// ⓑ ★【誰在場】曾寫「已經有名字的人可出現可開口」，而 ★【這座城裡還有誰】說他們
//    「不在這一幕的畫面裡」——同一份提示詞裡兩句互相打架，AI 會挑一句聽。
t(!/可出現可開口/.test(_ALL_),'★【誰在場】沒有再放行不在場的人（與★【這座城裡還有誰】打架）');
// 🎲 2026-09 玩家「只有4種 是可以擴大到6種 分支寫得更加明顯?」：
//    後端 sanitize 的上限本來就是 slice(0,6)，只有 schema 在叫 AI 寫 4 條——數字只活在那一行。
//    ⚠ 刻意【不】給固定分類（開口/靠近/觀察…）：那會讓六格每回合長成同一套模板，
//      就是「背脊永遠打得筆直」「收尾固化」同一個形狀。只說【後續要不同】，不說怎麼不同。
t(/6條/.test(base.s),'options 叫 AI 寫 6 條');
t(/六條分別通往六種不同的後續/.test(base.s),'options 的分歧寫在【後續】上（不是換句話說）');
t(!/走向各不相同/.test(_ALL_),'舊的「走向各不相同」沒留著（太抽象，量不出分歧）');
// 🐛→✅ 2026-09 第二次同形的矛盾：★【誰在場】說「其餘路人不具名」，而世界帳本那條說
//    「常民…開口、被寫進場景都可以」——『其餘』讀起來把常民也包進去了，模型會挑一句聽。
//    收窄成「卡片與帳本都沒提到的」才是真正的路人。
t(!/其餘路人不具名/.test(_ALL_),'不再用『其餘』界定路人（會把帳本裡的常民一起吃掉）');
t(/卡片與帳本都沒提到的路人不具名/.test(_ALL_),'路人＝卡片與帳本都沒提到的那些');
// ⓒ 跨區塊指路：【他們此刻】住在 user slot，這句抬頭住在 system slot（快取段）。
//    標題本身就自明，指路只是每回合白付字數，而且指的是另一份文件。
t(!/見下方【他們此刻】/.test(_ALL_),'【在我身邊的人】抬頭沒有再跨區塊指路');
t(base.s.indexOf('【在我身邊的人】(以下是他們是誰)：')>=0,'抬頭只說「這些人是誰」');
// 🔒 2026-09 資訊邊界（第二意見：「全知視角汙染」）：兩個以上同伴同場時，每個人的
//    「我們一起走過」「她注意到我…」躺在同一份 prompt 裡，AI 的注意力會同時掃過。
//    資料層本來就是私有的（各存各列、寫回去還有地點比對），洞在提示詞：perform 那句
//    只講了「當事人不知道自己被這樣寫」，沒講「隊友也不知道」。補完同一句的另一半。
t(/其他人手上有的，僅限於自己在場時看得到聽得到的那些/.test(base.s),'卡上的事是雙人私有，不是全場公有');
// 🗺️ 場外去向：原本寫「也可以說出對方此刻在哪」＝系統授權式報位，模型會沒問就主動通報、
//    而且報得像 GPS。名單上的地點是系統真值要留（玩家真的能走過去），改的是怎麼說出口。
t(!/也可以說出對方此刻在哪/.test(_ALL_),'場外去向沒有再寫成系統授權式報位');
const typed=shot(A,'我伸手替她把瀏海撥到耳後，「別動。」');
t(typed.u.indexOf('玩家這一步（已在畫面上）：【玩家原話】：我伸手替她把瀏海撥到耳後，「別動。」')>=0,'玩家原句逐字進 prompt 結尾·標成【玩家原話】不是【玩家意圖】');
// 🐛→✅ 2026-09 玩家截圖：四個選項全是【別人對我做的事】（「SABER問我…」「櫻輕輕幫我…」），
//   按下去送出的「玩家這一步」就變成一句 NPC 動作。根因是輸出範本寫「在場者此刻做得到的動作」——
//   那句是第一人稱改版【之前】寫的，模型把「在場者」讀成在場的那些人。選項＝我做什麼，要講死。
t(/【我】這一步做得到的動作/.test(base.s),'選項是【我】的動作（第一人稱）');
t(!/在場者此刻做得到的動作/.test(base.s),'舊的「在場者」寫法沒長回來（會生出 NPC 動作當選項）');

// 🐛→✅ 2026-09 玩家：「但是我也是女的欸！！！我拿什麼頂她阿」——敘事讓女性玩家「挺腰撞進去」。
//   兩個根因：①舊寫法「做得到的是手指、舌頭與器物」讀起來像建議清單，模型照樣自己長一根出來；
//   ②它坐在 user 的第 5 行、離結尾 18 行，正好落在這個專案自己量過的死角
//   （見 🧊 排序原則：「事實寫在 20 行以前就會被 AI 當成沒發生」）。
//   ⚠ 位置只能靠【結構】驗：要的是「它在玩家那句話前面不遠處」，不是「它存在」。
//   ⚠ 這段要用 B（女玩家＋女同伴在場）——★【身體】只在女女配對時才生成，A 是男的抓不到。
//   ⚠ mk() 抓的是「表上第一個不是自己的列」，那可能屬於別人那一局（實測 B 就抓到 A 的人），
//     所以這裡自己按 game_id 把 B 這局的一位女同伴拉到 B 身邊。
(function(){ const d=sheets['鑑賞眾生']._d;
  const meB=d.find(x=>String(x[C.ID])===B.kpc), gidB=String(meB[C.GAME_ID]);
  for(let i=1;i<d.length;i++){
    if(String(d[i][C.ID])===B.kpc) continue;
    if(String(d[i][C.GAME_ID])!==gidB) continue;
    if(String(d[i][C.SEX]).trim()!=='女') continue;
    joinParty(meB,[String(d[i][C.ID])]); break;
  }
})();
CAP=null; run({action:'play',pcId:B.kpc,acctName:B.acct,message:'我在她旁邊坐下來。'});
const _uRaw_ = String(CAP.p||'').split('\n');
// 女×女的 ★【身體】說明 2026-09-23 整段拿掉（玩家「只要告訴 AI 要確實分辨性別」）：改成固定模組 gender 那一句。
t(!/★【身體】|女性的身體/.test(String(CAP.p||'')+String(CAP.s||'')),'沒有那段女女身體說明');
t(/★【性別】：在場每個人的性別以卡上寫的為準/.test(String(CAP.s||'')),'system 裡有「性別以卡上寫的為準」那一句');
t(!/陰莖|肉棒|性器/.test(String(CAP.p||'')+String(CAP.s||'')),'提示詞裡沒有點名不要的那個器官');

// 🗑️ 2026-09 玩家定案的三刀，翻面成墓碑斷言盯它們別長回來。
t(!/npc_exit|離場者/.test(base.s),'npc_exit 沒長回來（AI 不該有第二把鑰匙動玩家的同行名單）');
t(!/熟了才看得到的那一面|日常表象|真實內裡/.test(base.s+String(base.p)),'性格不再分表面／內在');
t(!/長度見【篇幅】/.test(base.s),'narration 不再指涉【篇幅】（選「隨意」時那個區塊根本沒送）');
t((base.s.match(/沒換就留空|其餘「無」|否則「無」|平常「無」/g)||[]).length===0,
  '「沒有就填什麼」只留一種說法（原本五種）');

// 🐛→✅ 2026-09 玩家：「這一幕就寫這十分鐘，有隨設定變動嗎？」——沒有。
//   真值在 KANSHOU_MIN_PER_TURN_，提示詞卻把「十分鐘」寫死兩遍。改那顆常數，AI 會繼續
//   收到舊數字，零錯誤訊息（跟 DOJO_CAUSE_ 把 ${FATE_DEADLINE_DAYS_} 寫死那個坑同形）。
//   ⚠ 要用【原始】user（base.p 被 norm() 濾掉了 ★【此刻】那行，驗不到）。
CAP=null; run({action:'play',pcId:A.kpc,acctName:A.acct,message:'我看了看天色。'});
const _rawU_=String(CAP.p||''), MPT=parseInt(evalIn('KANSHOU_MIN_PER_TURN_'));
t(new RegExp('寫這 '+MPT+' 分鐘').test(_rawU_),'★【此刻】的分鐘數跟著 KANSHOU_MIN_PER_TURN_ 走（'+MPT+'）');
t(!/十分鐘/.test(_rawU_+String(CAP.s||'')),'沒有寫死的「十分鐘」');
const _now_=(_rawU_.match(/★【此刻】[^\n]*/)||[''])[0];
// 2026-09-23 季節與時段只在時段換了才送（【此刻已述】）：這一步不是第一回合，只驗「沒有數字」；第一次送的形狀由 lore.js ⑭ 釘。
t(_now_ && !/\d+年|\d+月|\d+日|\d+:\d+/.test(_now_),'★【此刻】沒有年月日時分（模型會整串念進敘事）',_now_);

// 🧹 2026-09 全份重讀抓到的四件事，各釘一條。
t(!/一路跟著你走|注意到你|你走進來的時候|玩家問起/.test(_rawU_),'提示詞裡指玩家一律用「我」（旁白是第一人稱）');
t(!/【已經確立的事】|見下方【此刻】/.test(_rawU_+String(CAP.s||'')),'沒有指向不存在區塊的引用');
t(!/\n{3,}/.test(_rawU_),'沒有連續空行（條件式區塊留下的）');
t(/剝掉|stripStanding_/.test(String(evalIn('String(stripStanding_)'))) || evalIn('stripStanding_("總是帶著茶")')==='帶著茶',
  '寫進記憶前會剝掉常駐副詞（總是／永遠…）');

// 🗑️ 2026-09 怪癖整格退出鑑賞卡（玩家：「這應該要讓 AI 去演阿…幹嘛要規定他表演啥」）。
//   那一格本來就是【觸發＋動作】的形狀（「吃到好東西時會安靜下來」「飯點一到就自己出現在別人家」），
//   每回合都送＝每回合都演。值得留的【東西】搬去它們該在的欄位（獅子玩偶→喜歡、眼罩→外貌）。
//   ⚠ solo 的 servantCard_ 仍在用，資料層不動（寧棄用不刪）。
const _cards_ = (base.s.match(/【在場人物】[^\n]*/g)||[]).join('\n');
t(_cards_.length>0,'卡片有生成出來');
t(!/移不開眼|會安靜下來|甩馬尾|插腰大笑|停半拍/.test(_cards_),'鑑賞卡上沒有怪癖（那是叫 AI 每回合演的動作）');
t(!/喜歡|討厭/.test(_cards_),'喜歡／討厭不在卡上（2026-09-23 起走觸發條目，玩家提到才給）');

console.log('── ② 固定段：路由拒收，提示詞逐字不動');
let r=run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'voice',styleText:'古龍武俠筆觸。'});
t(r.success===false&&!!r.message,'改固定段要擋下並講原因',JSON.stringify(r));
r=run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'world',on:false});
t(r.success===false,'關固定段也擋下');
const v1=shot(A);
t(v1.s===base.s&&v1.u===base.u,'兩段提示詞都逐字沒被動到');
// 🧟 表上的舊列（上一版玩家改過 voice）不可以繼續隱形生效
const _gidA=String((sheets['鑑賞眾生']._d.find(x=>String(x[C.ID])===A.kpc)||[])[C.GAME_ID]||'');
sheets['鑑賞風格']._d.push([_gidA,'voice','古龍武俠筆觸。','1']);
evalIn('kanshouStyleBust_('+JSON.stringify(_gidA)+')');
const v1b=shot(A);
t(v1b.s===base.s,'表上留著的舊列被忽略（不會隱形生效）');
console.log('── ③ 尺度那段');
{
  const on=shot(A);
  t(/^7\. 尺度跟著玩家走/m.test(on.s),'預設在第 7 條（gender 插在前面）');
  t((on.s.match(/^\d+\. /gm)||[]).length===8,'預設格式 8 條');
  run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'lewd',styleText:'',on:false});
  const off=shot(A);
  t(off.s.indexOf('尺度跟著玩家走')<0,'關掉就整段消失');
  t((off.s.match(/^\d+\. /gm)||[]).length===7,'關掉 lewd 後剩 7 條·其餘自動補號');
  t(/^7\. 只輸出合法 JSON/m.test(off.s),'最後一條補號成 7');
  run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'lewd',styleText:'尺度交給你自己拿捏。'});
  const mine=shot(A);
  t(mine.s.indexOf('尺度交給你自己拿捏。')>=0,'換成玩家版');
  run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'lewd',styleText:'',on:true});
}

console.log('── ④ 還原');
r=run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'lewd',reset:true});
t(shot(A).s.indexOf('尺度跟著玩家走')>=0,'單格還原回預設');
r=run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,resetAll:true});
const v5=shot(A);
if(v5.s!==base.s||v5.u!==base.u){ const A2=(base.s+'\n@@U@@\n'+base.u).split('\n'),B2=(v5.s+'\n@@U@@\n'+v5.u).split('\n'); for(let i=0;i<Math.max(A2.length,B2.length);i++) if(A2[i]!==B2[i]) console.log('      [diff]\n        基線: '+String(A2[i]).slice(0,120)+'\n        現在: '+String(B2[i]).slice(0,120)); }
t(v5.s===base.s && v5.u===base.u,'全部還原＝逐字回到基線');
t(!sheets['鑑賞風格']._d.slice(1).some(x=>String(x[1])==='lewd'),'表上沒留 A 的殘列');
console.log('── ③c 篇幅檔位（kind:pick·2026-09 玩家「字數獨立出來、分 300/500/700/900」）');
{
  const lt=(g.modules||[]).find(function(m){return m.key==='lenTier';});
  t(!!lt && lt.kind==='pick','lenTier 是 pick 型（面板畫按鈕列、不是文字框）');
  t(!!lt && (lt.options||[]).map(function(o){return o.key;}).join(',')==='auto,free,300,500,700,900','檔位是 自動/隨意/300/500/700/900');
  const auto=shot(A);
  t(/寫 \d+~\d+ 字/.test(auto.u),'auto：字數仍走依好感/大事的自動表');
  run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'lenTier',styleText:'300'});
  const s300=shot(A);
  t(s300.u.indexOf('寫 260~340 字')>=0,'選 300 → 提示詞寫 260~340 字');
  run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'lenTier',styleText:'900'});
  const s900=shot(A);
  t(s900.u.indexOf('寫 820~980 字')>=0,'選 900 → 提示詞寫 820~980 字');
  // 字數與 token 上限綁同一列：只改字數不改 token，長篇會被截斷成壞 JSON
  const tk=JSON.parse(evalIn('JSON.stringify(KANSHOU_LEN_TIERS_.filter(function(t){return t.words;}).map(function(t){return t.tokens;}))'));
  t(tk[0]<tk[1] && tk[1]<tk[2] && tk[2]<tk[3],'有指定字數的檔位，token 上限隨字數遞增（'+tk.join('/')+'）');
  // 🕊️ 隨意：【篇幅】那一行整個不送（2026-09 玩家「能夠讓他自由決定字數嗎? 平淡就平淡?」）
  run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'lenTier',styleText:'free'});
  const sFree=shot(A);
  t(sFree.u.indexOf('【篇幅】')<0,'選「隨意」→ 提示詞裡沒有【篇幅】那一行');
  run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'lenTier',styleText:'auto'});
  t(s900.s===s300.s,'檔位只動 user 段的字數，sys 段逐字不變');
  // 表外的值要擋下：收了就會「存得進去、回 success、面板沒一顆亮著、實際又當成 auto」
  const junk=run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'lenTier',styleText:'999'});
  t(junk.success===false&&!!junk.message,'塞表外的檔位要擋下並講原因',JSON.stringify(junk));
  run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'lenTier',styleText:'auto'});
  const back=run({action:'kanshou_get_style',pcId:A.kpc,acctName:A.acct});
  t(!(back.modules.find(function(m){return m.key==='lenTier';})||{}).text,'選回自動＝表上不留殘列');
}

console.log('── ⑤ 兩帳號互不污染');
run({action:'kanshou_set_style',pcId:B.kpc,acctName:B.acct,key:'lewd',styleText:'B 的尺度。'});
const a6=shot(A), b6=shot(B);
t(a6.s===base.s,'A 沒被 B 的設定污染');
t(b6.s.indexOf('B 的尺度。')>=0,'B 自己的版本生效');
t(/^【我自己】[^\n]*：[^\n，]+，女，/m.test(b6.u),'B（女御主）的玩家卡帶的是自己的性別');
t(/當面叫我是「妳」/.test(b6.u),'女御主：NPC 當面叫她用「妳」（從資料算，不寫死）');
t(/當面叫我是「你」/.test(base.u),'男御主：用「你」');
console.log('── ⑥ 注入與上限');
r=run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'lewd',styleText:'=SUM(1)｜【同居】1 <b>x</b> '+'長'.repeat(400)});
const v7=shot(A); const g7=run({action:'kanshou_get_style',pcId:A.kpc,acctName:A.acct}).modules.find(m=>m.key==='lewd');
t(g7.text.length<=300,'截到 300 字內 ('+g7.text.length+')');
t(g7.text.indexOf('=SUM')!==0,'公式前導被剝掉');
t(g7.text.indexOf('｜【同居】1')>=0,'｜【】保留（風格表不是 MEMORY）');
t(v7.s.indexOf('7. '+g7.text)>=0,'注入字串照原樣落在第 7 條');
const dA=sheets['鑑賞眾生']._d.find(x=>String(x[C.ID])===A.kpc);
t(!/【同居】1/.test(String(dA[C.MEMORY])),'玩家列 MEMORY 沒被寫進【同居】');
r=run({action:'kanshou_set_style',pcId:A.kpc,acctName:A.acct,key:'nope',styleText:'x'});
t(r.success===false,'不存在的模組被拒');
t(/在場那幾張卡，開頭是這個人的名字/.test(base.s),'欄位定義(perform)進了鐵律');
// 🗣️ 2026-09 實測：卡片寫「SABER，女。」時模型把「SABER 女」整組當成冠名寫進對話；改成括號後真名進了括號，
//    模型又把「LANCER（庫·丘林・男）」整組當冠名（3/5 步）。現在名字單獨成句，性別／真名另起一句，冠名規則說死「句號前那一個」。
t(/接著一句是性別（有的帶真名）/.test(base.s),'名字與性別分開講（性別另起一句，不會被當成名字的一部分）');
t(/只用卡片開頭句號前那一個名字/.test(base.s),'冠名規則說死只用句號前那一個');
t(/^【在場人物】[^（）\n]+。(男|女|異|無)(，真名[^。\n]+)?。/m.test(base.s),'卡頭格式＝名字。性別，真名X。（名字後面沒有括號可以被抄）');
// 🙈 紅線②：卡上的句子是內化素材，實測 AI 會把「準則」原樣當成內心獨白講出來
t(/只給你看，在場的人並不知道自己被這樣寫著/.test(base.s),'卡上的句子是只給 AI 看的底稿（show-don\'t-tell）');
// 🐛→✅ 2026-09 玩家實測：perform 為了說明卡片欄位順序，把八個欄位名逐一列出來，
//   於是【欄位名變成模型的詞彙】——敘事裡冒出「她的怪癖讓她在做選擇時總是傾向…」
//   「她熟了之後才會顯露的佔有慾」「她喜歡香甜點心與怪談的個性」。卡上那些詞組本來就看得懂，
//   不必教順序。這條從「要點名」翻面成「不可以點名」。
t(!/做選擇的方式|熟了才看得到的那一面|喜歡的、討厭的/.test(base.s),'定義裡沒有把欄位名列給模型（列了它就會照唸）');
// 🎬 玩家兩次修正這一格：①「讓它們互相拉扯…他會一直拉扯」②「告訴她意思、事實，不要教他該怎麼做」
t(!/互相拉扯|守前半|浮出來|才拿出來用/.test(base.s),'只下定義、不給演法（怎麼用交給模型自己判斷）');
t(!/look|personality|quirks|logic/.test(base.s),'不出現英文欄位名（卡上本來就沒有）');
t(/第一人稱「我」＝玩家/.test(base.s),'旁白是第一人稱玩家視角');

// 2026-09-23 玩家把尺度預設縮成一句「尺度跟著玩家走。」（「先寫這樣就好，然後我們再來測試看看」）。
t(/\d+\. 尺度跟著玩家走。$/m.test(base.s),'尺度預設就是玩家定的那一句，沒有再長出來');
t(!/喘息|吸吮|吞嚥/.test(base.s),'對話格式的例句不再全是性的聲音（例句會幫模型定調）');

console.log('── ⑦ 歸零重來清風格');
run({action:'kanshou_reset',pcId:B.kpc,acctName:B.acct});
t(!sheets['鑑賞風格']._d.slice(1).some(x=>String(x[2])==='B 的尺度。'),'B 歸零後風格列被清掉');
console.log('\n'+(bad?'❌ '+bad+' 條失敗':'✅ 全部 '+ok+' 條通過')); process.exit(bad?1:0);
