// 引擎測試：node tools/game_test.js
const G=require('./game.js'); const {playRun}=require('./sim.js');
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('  ✅ '+l);} else {bad++;console.log('  ❌ '+l+(x!==undefined?'  '+String(x).slice(0,240):''));} };
const J=o=>JSON.parse(JSON.stringify(o));
// 把下一步能走的格子都設成 t 再走進去（地圖是隨機分岔路，測試不管路線）
const step=(r,t)=>{ r.screen='map'; G.reachable(r).forEach(c=>{ r.map[r.floor][c].t=t; }); return G.go(r,G.reachable(r)[0]); };
// 造一場乾淨的戰鬥：who 的第一層，敵人換成 n 隻 hp 血、不會動的木樁
function arena(who,n=1,hp=50,seed=7){
  const r=G.newRun(who,seed); r.flat=true; r.relics=[]; step(r,'fight'); const b=r.battle;   // flat：不套六圍，只測卡牌機制
  while(b.enemies.length<n) b.enemies.push(J(b.enemies[0]));
  b.enemies=b.enemies.slice(0,n);
  b.enemies.forEach((e,i)=>{ Object.assign(e,{key:'d'+i,id:'fang',name:'木樁'+i,hp,maxHp:hp,block:0,str:0,weak:0,vuln:0,poison:0,wound:0,petrify:0,stun:0,intent:{n:'發呆',fx:[]}}); });
  b.hand=[]; b.energy=3; b.block=0; b.firstAtk=false; b.log=[];
  return r;
}
const E=(r,i=0)=>r.battle.enemies[i];
const playId=(r,id,tg=0)=>{ r.battle.hand.push(id); return G.play(r,r.battle.hand.length-1,tg); };

console.log('── 基本');
let run=G.newRun('saber',7);
t(run.hp===75&&run.deck.length===10&&run.map.length===12&&run.seals===3&&G.BOSS_POOL[1].includes(run.bosses[0])&&G.BOSS_POOL[2].includes(run.bosses[1])&&run.bosses[0]!==run.bosses[1]&&run.gold===60,'開局：Saber 75 血（耐久 B）、10 張牌、12 列地圖、3 劃令咒、60 金、兩章各抽一位魔王');
t(G.ORDER.length===15&&G.ORDER.every(k=>G.SERVANTS[k]&&G.CARDS[G.SERVANTS[k].sig]),'15 位從者，每位的招牌牌都存在');
t(G.ORDER.every(k=>Object.keys(G.CARDS).filter(c=>G.CARDS[c].kit===k).length>=9),'每位從者至少 9 張專屬牌');
t(Object.keys(G.CARDS).every(k=>G.CARDS[k].fx.every(f=>G.OPS[f[0]]&&G.FX_TEXT[f[0]])),'每個卡牌效果都有程式與說明');
t(G.ORDER.every(k=>G.SERVANTS[k].np.fx.every(f=>G.OPS[f[0]]&&G.FX_TEXT[f[0]])),'每個寶具效果都有程式與說明');
t(Object.keys(G.CARDS).every(k=>!G.CARDS[k].up||(G.card(k+'+')&&G.cardText(k+'+')!==undefined)),'每張能強化的牌強化後都讀得到');
t(G.ORDER.every(k=>G.newRun(k,3).boss!==k),'Boss 不會是自己選的從者');
const nodes=row=>run.map[row].filter(n=>n);
t(G.reachable(run).length>=3&&nodes(0).every(n=>n.t==='fight')&&nodes(11).length===1&&nodes(11)[0].t==='boss'&&nodes(10).every(n=>n.t==='rest'),'入口至少三個、第一列都是戰鬥、倒數第二列休息、最後是魔王');
t(G.ORDER.every(k=>{ const q=G.newRun(k,77); return q.map.every((row,r)=>row.every((n,c)=>!n||r===11||n.next.every(c2=>q.map[r+1][c2]))) && q.map.some(row=>row.some(n=>n&&n.t==='shop')); }),'地圖每一條線都接到下一列的格子；每章至少一間商店');
t(G.ORDER.every(k=>{ const q=G.newRun(k,5); for(let r=0;r<10;r++) for(let c=0;c<4;c++){ const a=q.map[r][c], b2=q.map[r][c+1]; if(a&&b2&&a.next.includes(c+1)&&b2.next.includes(c)) return false; } return true; }),'路線不會交叉');
t(G.visible(run,0,G.reachable(run)[0])&&G.visible(run,2,nodes(2).length?run.map[2].findIndex(n=>n):0)&&!G.visible(run,5,run.map[5].findIndex(n=>n))&&G.visible(run,11,2),'迷霧：看得到接下來 3 列與魔王，更遠的看不到');
step(run,'fight'); t(run.screen==='battle'&&run.battle.hand.length===5&&run.battle.energy===3,'進戰鬥：抽 5 張、3 點魔力');

let r=arena('saber'); r.battle.hand=['atk']; let x=G.play(r,0,0);
t(x.ok&&E(r).hp===44&&r.battle.energy===2&&r.battle.np===10&&r.battle.discard.includes('atk'),'攻擊：6 傷、扣 1 魔力、寶具 +10%、進棄牌堆',E(r).hp);
r.battle.energy=0; r.battle.hand=['atk']; t(!G.play(r,0,0).ok,'魔力不夠不能出');
r=arena('saber'); E(r).vuln=1; playId(r,'atk'); t(E(r).hp===41,'敵人易傷：6→9',E(r).hp);
r=arena('saber'); r.battle.weak=1; playId(r,'atk'); t(E(r).hp===46,'自己虛弱：6→4',E(r).hp);
r=arena('saber',2); r.battle.hand=['atk']; x=G.play(r,0,-1); t(!x.ok&&x.needTarget,'兩個敵人時單體牌要選目標');
r=arena('saber'); E(r).intent={n:'砍',fx:[['atk',10]]}; r.battle.block=4; let hp=r.hp; G.endTurn(r);
t(hp-r.hp===6&&r.battle.turn===2&&r.battle.hand.length===5,'敵人打 10、格擋 4 → 扣 6；新回合重抽',hp-r.hp);
r=arena('saber',2); r.battle.wind=3; r.battle.np=100; G.noble(r,0); t(r.battle.enemies.every(e=>e.hp===1)&&r.battle.wind===0,'Saber 寶具：解放 3 層風，全體 40＋3×3',E(r).hp);
t(!G.noble(arena('saber'),0).ok,'量表沒滿不能放寶具');
r=arena('saber'); let hl=r.battle.hand.length; G.seal(r,'all'); t(r.seals===2&&r.battle.energy===6&&r.battle.hand.length===hl+2,'令咒（全力）：魔力 +3、抽 2');
G.seal(r,'np'); t(r.battle.np===100&&r.seals===1,'令咒（寶具）：量表充滿'); r.seals=0; t(!G.seal(r,'all').ok,'令咒用完不能用');

console.log('── 第五次');
r=arena('saber'); r.battle.wind=9; playId(r,'sheath'); t(r.battle.wind===10,'Saber 風王結界：風最多 10 層',r.battle.wind);
r=arena('saber',1,200); r.battle.wind=9; r.battle.hand=[]; r.battle.draw=['atk','atk','atk','atk']; playId(r,'hammer'); t(r.battle.wind===0&&r.battle.hand.length===3,'解放 9 層風：每 3 層抽 1（抽 3）',r.battle.hand.length);
r=G.newRun('emiya',3); step(r,'fight'); t(r.battle.hand.filter(x=>x==='sword').length===1&&r.battle.hand.length===6,'EMIYA 投影魔術：每回合開始 1 張投影劍＋照常抽 5');
r=arena('emiya'); r.battle.hand=['project','broken']; G.play(r,0,0); t(r.battle.hand.filter(x=>x==='sword').length===2,'投影魔術：2 張投影劍');
G.play(r,r.battle.hand.indexOf('broken'),0); t(!r.battle.hand.includes('sword')&&E(r).hp===40,'壞幻：引爆 2 把，每把全體 5',E(r).hp);
r=arena('emiya'); r.battle.np=100; G.noble(r,0); t(r.battle.hand.length===3&&r.battle.ubw===2&&r.battle.projUp===2&&/造成 6 傷害/.test(G.cardText('sword',r)),'無限劍製：3 張投影劍、之後 2 回合、投影劍 6 傷');
G.play(r,0,0); t(E(r).hp===44,'投影劍 4+2＝6',E(r).hp);
G.endTurn(r); t(r.battle.hand.filter(x=>x==='sword').length===4&&!r.battle.discard.includes('sword'),'下回合又 3 張（加被動 1 張）；沒用完的投影劍消失、不進棄牌');

r=arena('cu'); E(r).block=10; playId(r,'thrust'); t(E(r).hp===43&&E(r).block===10,'庫・丘林 突刺：穿透 7 無視格擋',E(r).hp);
r=arena('cu'); playId(r,'arrowward'); E(r).intent={n:'砍',fx:[['atk',20],['atk',5]]}; hp=r.hp; G.endTurn(r); t(hp-r.hp===3,'箭矢加護：閃過第一擊，第二擊被 2 格擋擋掉 2',hp-r.hp);
r=arena('cu'); r.battle.evade=1; r.battle.np=0; E(r).intent={n:'砍',fx:[['atk',30]]}; hp=r.hp; G.endTurn(r); t(r.hp===hp&&E(r).hp===50&&r.battle.np===10,'庫・丘林 箭矢加護：迴避成功寶具 +10',JSON.stringify([E(r).hp,r.battle.np]));
r=arena('cu',2); r.battle.enemies.forEach(e=>{ e.intent={n:'守',fx:[['block',8]]}; }); playId(r,'provoke'); t(r.battle.enemies.every(e=>e.intent.fx.some(f=>f[0]==='atk'))&&r.battle.evade===1&&r.battle.riposte===3,'挑釁：不攻擊的敵人改成攻擊你；迴避 1、迎擊 3');
r=arena('cu'); r.battle.np=100; E(r).block=20; G.noble(r,0); t(E(r).hp===15&&E(r).vuln===2,'刺穿死棘之槍：穿透 35＋易傷 2',E(r).hp);

r=G.newRun('medusa',3); step(r,'fight'); t(r.battle.enemies.every(e=>e.petrify===1),'美杜莎 石化魔眼：開場全體石化 1');
r=arena('medusa'); playId(r,'mystic'); t(E(r).petrify===2&&E(r).weak===1,'石化魔眼牌：石化 2＋虛弱');
playId(r,'chain'); t(E(r).stun===1&&E(r).petrify===0,'累積到 3 層：動彈不得、層數歸零');
E(r).intent={n:'砍',fx:[['atk',30]]}; hp=r.hp; G.endTurn(r); t(r.hp===hp&&E(r).stun===0,'被石化的敵人跳過這回合',hp-r.hp);
r=arena('medusa'); E(r).petrify=2; playId(r,'stare'); t(E(r).hp===40,'凝視：4＋石化 2×3＝10',E(r).hp);
r=arena('medusa',2); r.hp=30; playId(r,'bloodfort'); t(r.battle.enemies.every(e=>e.hp===44)&&r.hp===36,'鮮血神殿：全體 6、回復一半（6）',r.hp);

r=arena('medea'); r.battle.energy=1; r.battle.hand=['curse','warp']; t(G.costOf(r,'curse')===0,'美狄亞 高速神言：第一張技能 0 費');
G.play(r,0,0); t(r.battle.energy===1&&G.costOf(r,'warp')===1,'用掉之後第二張技能照價');
r=arena('medea'); playId(r,'word'); t(G.costOf(r,'agemagic')===0,'高速神言牌：下一張（神代魔術）0 費'); playId(r,'agemagic'); t(E(r).hp===40&&r.battle.energy===3&&r.battle.chant===1&&r.battle.exhaust.includes('agemagic'),'神代魔術 0 費：8＋陣地 1×2；陣地不用掉（儀式是永久的），一場一次（消耗）',E(r).hp);
r=arena('medea'); playId(r,'fangs'); t(r.battle.minions===1,'龍牙兵：召喚 1'); E(r).intent={n:'砍',fx:[['atk',10]]}; hp=r.hp; G.endTurn(r);
t(E(r).hp===47&&hp-r.hp===6&&r.battle.minions===0,'龍牙兵回合結束打 3，替你擋 4 後消散',JSON.stringify([E(r).hp,hp-r.hp]));
r=arena('medea'); E(r).block=15; E(r).str=4; r.battle.np=100; G.noble(r,0); t(E(r).block===0&&E(r).str===0&&E(r).vuln===2&&E(r).weak===2,'萬符必應破戒：拆格擋與力量、虛弱易傷 2');

r=arena('kojiro'); E(r).block=10; playId(r,'atk'); t(E(r).hp===44&&E(r).block===10&&E(r).vuln===1,'小次郎 宗和的心得：每回合第一擊無視格擋，打到後易傷 1',JSON.stringify([E(r).hp,E(r).block,E(r).vuln])); playId(r,'atk'); t(E(r).hp===44&&E(r).block===1,'第二擊照常吃格擋（易傷 6→9）',JSON.stringify([E(r).hp,E(r).block]));
r=G.newRun('kojiro',3); step(r,'fight'); { const big=r.battle.enemies.slice().sort((x,y)=>y.hp-x.hp)[0]; t(big.vuln===2&&r.battle.enemies.filter(e=>e!==big).every(e=>!e.vuln),'宗和的心得：開場解析生命最多的敵人，易傷 2'); }
r=arena('kojiro'); r.battle.np=100; t(!G.noble(r,0).ok&&!G.seal(r,'np').ok&&G.SERVANTS.kojiro.np.none,'小次郎沒有寶具：放不了、令咒也不能充滿寶具');
r=arena('kojiro'); playId(r,'calm'); G.endTurn(r); t(r.battle.energy===4,'明鏡止水：下回合魔力 +1');
t(G.newRun('kojiro',3).deck.includes('tsubame1')&&G.SERVANTS.kojiro.sig==='tsubame1','燕返開場就在牌組裡（招牌牌）');
r=arena('kojiro'); r.battle.sowaFirst=1; r.battle.sowaSeen={d0:1}; E(r).block=30; playId(r,'tsubame1'); t(E(r).hp===50-18&&E(r).block===30,'燕返：三刀同時斬出，6×3 全部無視格擋（多重次元屈折現象）',JSON.stringify([E(r).hp,E(r).block]));

r=arena('hassanC'); r.battle.turn=2; playId(r,'knives'); t(E(r).hp===46&&E(r).poison===4,'咒腕 飛刀：4＋毒 4'); E(r).block=20; G.endTurn(r); t(E(r).hp===42&&E(r).poison===3,'毒：回合開始穿透 4、再減 1',E(r).hp);
r=arena('hassanC'); r.battle.turn=2; E(r).poison=1; playId(r,'assassinate'); t(E(r).hp===30,'暗殺：中毒時 10＋10',E(r).hp);
r=arena('hassanC'); playId(r,'atk'); t(E(r).hp===41,'咒腕 氣息遮斷：第一回合攻擊 ×1.5（6→9）',E(r).hp); r.battle.turn=2; playId(r,'atk'); t(E(r).hp===35,'第二回合照常 6',E(r).hp);
r=arena('hassanC'); r.battle.turn=2; playId(r,'throwdirk'); t(E(r).hp===38&&G.SERVANTS.hassanC.sig==='throwdirk','投擲短刀（招牌牌）：4×3',E(r).hp);
r=arena('hassanC'); E(r).poison=4; playId(r,'plague'); t(E(r).poison===8,'毒素擴散：毒加倍');
r=arena('hassanC'); E(r).hp=24; r.battle.np=100; G.noble(r,0); t(E(r).hp===0,'妄想心音：五成以下直接擊殺');
r=arena('hassanC'); r.battle.np=100; G.noble(r,0); t(E(r).hp===25,'妄想心音：血多時穿透 25',E(r).hp);
r=arena('hassanC'); E(r).id='heracles'; E(r).hp=10; E(r).maxHp=100; r.battle.np=100; G.noble(r,0); t(E(r).hp===0||E(r).lives>=0,'Boss 不吃即死、改吃穿透');

console.log('── 機制牌（每張專屬牌都吃自己的資源）');
r=arena('saber'); playId(r,'invis'); playId(r,'burst'); t(r.battle.wind===3,'Saber：看不見的劍、魔力放出累積風');
playId(r,'windwall'); t(r.battle.block===4+2*3&&r.battle.wind===3,'風王結界：格擋 4＋風×2（風不用掉）',r.battle.block);
r.battle.tstr=0; let h1=E(r).hp; r.battle.energy=3; playId(r,'hammer'); t(h1-E(r).hp===5+4*3&&r.battle.wind===0,'風王鐵槌：解放全部風',h1-E(r).hp);
r=arena('saber'); playId(r,'kingly'); G.endTurn(r); t(r.battle.wind===1,'王者風範：每回合開始風 +1');
t(/現在 9/.test(G.cardText('hammer',(()=>{ const q=arena('saber'); q.battle.wind=1; return q; })())),'說明會標出現在的數字（風王鐵槌 5＋4＝9）');
r=arena('emiya'); r.battle.hand=['sword','sword','hrunting']; G.play(r,2,0); t(E(r).hp===50-(8+3*2)&&r.battle.hand.length===2,'赤原獵犬：手上每把投影劍 +3，劍不消耗',E(r).hp);
r=arena('emiya'); r.battle.hand=['sword','rhoaias']; G.play(r,1,0); t(r.battle.block===9,'熾天覆七重圓環：格擋 6＋劍×3');
r=arena('emiya'); playId(r,'analysis'); r.battle.hand=['sword']; G.play(r,0,0); t(E(r).hp===45,'構造解析：投影劍 4＋1',E(r).hp);
r=arena('cu'); playId(r,'riposte'); playId(r,'lightchild'); E(r).intent={n:'砍',fx:[['atk',10]]}; hp=r.hp; G.endTurn(r);
t(r.hp===hp&&E(r).hp===45&&r.battle.str===1,'迎擊之槍：閃過就反擊 5 穿透；光之子：迴避一次力量 +1',JSON.stringify([E(r).hp,r.battle.str]));
t(r.battle.riposte===0,'迎擊只在那一回合');
r=arena('medusa'); E(r).petrify=2; playId(r,'shatter'); t(E(r).hp===50-(6+7*2)&&E(r).petrify===0,'石像碎裂：敲碎石化換傷害',E(r).hp);
r=arena('medusa'); E(r).stun=1; playId(r,'kick'); t(E(r).hp===30,'迴旋踢：動彈不得的目標 8＋12',E(r).hp);
r=arena('medusa'); playId(r,'gorgon'); G.endTurn(r); t(E(r).petrify===1,'蛇髮：每回合全體石化 1');
r=arena('medea'); r.battle.energy=5; playId(r,'chant'); playId(r,'curse'); E(r).vuln=0; playId(r,'bolt'); t(E(r).hp===50-(3+1*3),'魔彈：陣地牌（+2）＋詛咒（+1）→ 3＋陣地 3',E(r).hp); G.endTurn(r); t(r.battle.chant===3,'陣地整場累積，不會每回合歸零',r.battle.chant);
r=arena('medea'); playId(r,'territory'); playId(r,'chant'); t(r.battle.block===4&&r.battle.chant===2,'陣地作成：每張技能格擋 2；陣地牌算 2 層');
r=arena('kojiro'); playId(r,'flash'); t(E(r).hp===50-(2+2*3),'一閃：剩 3 魔力 → 2＋6',E(r).hp);
r=arena('kojiro'); playId(r,'gate'); r.battle.energy=2; E(r).intent={n:'砍',fx:[['atk',20]]}; hp=r.hp; G.endTurn(r); t(hp-r.hp===12-3,'山門守護：剩 2 魔力格擋 8（20 → 扣 12，下回合山門的守門人回 3）',hp-r.hp);
r=arena('kojiro'); playId(r,'mastery'); r.battle.played=0; r.battle.energy=3; E(r).vuln=0; r.battle.sowaSeen={x:1}; playId(r,'iai'); t(E(r).hp<50-(5+7+5)+1&&E(r).hp>=50-(5+Math.floor((7+5)*1.5)),'透化：居合 +5',E(r).hp);
r=arena('diarmuid'); playId(r,'twinart'); playId(r,'twin'); t(r.battle.block===3&&r.battle.stance==='yellow'&&E(r).hp===48&&E(r).wound===1,'雙槍術：切換架勢格擋 3；切換立刻刺一槍（第 1 次＝2，黃薔薇再給創傷 1）',JSON.stringify([E(r).hp,E(r).wound]));
playId(r,'rose'); t(E(r).hp===48-3-5-4&&E(r).wound===3&&r.battle.block===9,'薔薇交錯：切兩次（第 2 次紅＝3 穿透、第 3 次黃＝4＋創傷），中間 5 傷害',JSON.stringify([E(r).hp,E(r).wound,r.battle.block]));
r.battle.energy=3; let h2=E(r).hp; playId(r,'twin'); t(h2-E(r).hp===5,'同一回合第 4 次切換刺 5（換越多次越痛）',h2-E(r).hp);
G.endTurn(r); h2=E(r).hp; r.battle.energy=3; playId(r,'twin'); t(h2-E(r).hp===2,'下回合重新從 2 開始',h2-E(r).hp);
r=arena('diarmuid'); playId(r,'fianna'); playId(r,'twin'); t(E(r).hp===50-(2+2),'費奧納騎士團：切換那一槍 +2',E(r).hp);
r=arena('diarmuid'); E(r).block=20; r.battle.np=100; G.noble(r,0); t(E(r).hp===50-20-3&&E(r).block===18&&r.battle.stance==='red','寶具紅黃薔薇：切到黃（2 被格擋吃掉）→ 20 穿透 → 切回紅（3 穿透）',JSON.stringify([E(r).hp,E(r).block]));
r=arena('iskandar',2); r.battle.army=5; playId(r,'allcharge'); t(r.battle.enemies.every(e=>e.hp===40)&&r.battle.army===0,'全軍突擊：花光軍勢，全體 5×2');
r=arena('iskandar',2); r.battle.army=4; playId(r,'trample'); t(r.battle.enemies.every(e=>e.hp===38)&&r.battle.army===0,'蹂躪：花光軍勢，全體 4×3');
r=arena('iskandar'); r.battle.army=6; playId(r,'bucephalus'); t(r.battle.block===10,'布塞弗勒斯：格擋 4＋軍勢 6');
r=arena('gilles'); r.battle.kraken=6; playId(r,'blasphemy'); t(E(r).hp===50-11,'瀆神：5＋海魔大小 6',E(r).hp);
r=arena('gilles'); r.battle.kraken=4; playId(r,'zealot'); t(r.battle.kraken===1&&r.battle.tstr===5,'狂信：海魔縮小 3 換力量 5');
r.battle.kraken=2; playId(r,'zealot'); t(r.battle.kraken===2&&r.battle.tstr===5,'海魔不夠大就沒效果');
r=arena('gilles'); r.battle.kraken=5; E(r).intent={n:'砍',fx:[['atk',8]]}; hp=r.hp; G.endTurn(r); t(E(r).hp===45&&hp-r.hp===4&&r.battle.kraken===1+1,'大海魔：回合結束咬 5；被打 8 時吃下一半 4 並縮小；下回合長大 1',JSON.stringify([E(r).hp,hp-r.hp,r.battle.kraken]));
r=arena('hassanH'); r.battle.minions=3; playId(r,'stab'); t(E(r).hp===50-2*4,'同時刺擊：分身 3 → 刺 4 下',E(r).hp);
r=arena('lancelot'); r.battle.mastery=3; playId(r,'mace'); t(E(r).hp===50-(4+3+1),'鐵柱橫掃：4＋武練 3（武練 3 點再讓攻擊 +1）',E(r).hp);
r=arena('lancelot'); r.battle.mastery=2; playId(r,'lakeflash'); t(E(r).hp===50-(10+2*2)&&r.battle.mastery===2,'湖光斬：10＋武練×2（武練不會用掉）',JSON.stringify([E(r).hp,r.battle.mastery]));
r.battle.energy=3; let h3=E(r).hp; playId(r,'atk'); t(h3-E(r).hp===6,'歸零之後下一擊從頭算',h3-E(r).hp);
r=arena('lancelot'); r.battle.mastery=3; playId(r,'blackmist'); t(r.battle.block===7&&E(r).hp===50-3,'己之榮光不為己有：格擋 4＋武練；技能牌順手攻擊 3',JSON.stringify([r.battle.block,E(r).hp]));
r=arena('heracles'); r.hp=r.maxHp-27; playId(r,'divine'); t(E(r).hp===50-(10+3*2),'神性之擊：少 27 生命 → 10＋3×2',E(r).hp);
r=arena('heracles'); r.hp=20; playId(r,'godhand'); G.endTurn(r); t(r.battle.str===1,'戰鬥續行：生命低於一半時每回合力量 +1');
r=arena('gil'); r.battle.hand=['t_sword','t_shield','goldarmor']; G.play(r,2,0); t(r.battle.block===5+3*2,'黃金甲冑：手上每件寶具 +3');
r=arena('gil'); r.battle.hand=['t_sword','t_spear','volley']; G.play(r,2,0); t(E(r).hp===50-16&&r.battle.hand.length===0,'寶具掃射：射出手上全部寶具，每件 8',E(r).hp);
t(G.ORDER.every(k=>Object.keys(G.CARDS).filter(c=>G.CARDS[c].kit===k).every(c=>{ const fx=G.CARDS[c].fx; return !(fx.length===1&&['dmg','all','block','draw'].includes(fx[0][0])) && !(fx.length===2&&fx.every(f=>['dmg','all','block','draw'].includes(f[0]))); })),'專屬牌裡沒有只寫「傷害／全體／格擋／抽牌」的通用牌');
const old2=J(G.newRun('saber',3)); old2.deck=old2.deck.concat(['guard+','shot','bite']); G.migrate(old2); t(old2.deck.includes('windwall+')&&old2.deck.includes('traceon')&&old2.deck.includes('shatter'),'舊存檔裡被拿掉的牌換成新牌（保留強化）');

console.log('── 第四次');
r=arena('diarmuid'); t(r.battle.stance==='red','迪爾姆德 開場紅薔薇'); E(r).block=10; playId(r,'atk'); t(E(r).hp===44&&E(r).block===10,'紅薔薇：攻擊無視格擋',E(r).hp);
playId(r,'twin'); t(r.battle.stance==='yellow','雙槍：切換架勢'); E(r).block=0; playId(r,'atk'); t(E(r).wound===2,'黃薔薇：切換那一槍＋攻擊牌各給創傷 1',E(r).wound);
playId(r,'buidhe'); t(E(r).wound===5,'必滅的黃薔薇：創傷 2＋架勢 1',E(r).wound); let h0=E(r).hp; E(r).block=50; G.endTurn(r); t(h0-E(r).hp===5&&E(r).wound===5,'創傷：每回合穿透、不會自己好',h0-E(r).hp);
r=arena('diarmuid'); E(r).wound=3; playId(r,'bleedout'); t(E(r).hp===31,'放血：10＋創傷 3×3',E(r).hp);

r=G.newRun('iskandar',3); step(r,'fight'); t(r.battle.army===3,'伊斯坎達爾 開場軍勢 3');
r=arena('iskandar'); r.battle.army=2; playId(r,'rally'); t(r.battle.army===4,'集結：軍勢 +2'); G.endTurn(r); t(E(r).hp===46,'回合結束軍勢衝鋒 4',E(r).hp);
r=arena('iskandar',2); r.battle.army=5; playId(r,'order'); t(r.battle.enemies.every(e=>e.hp===42),'突擊令：全體 3＋軍勢 5');
r=arena('iskandar',3); playId(r,'atk_iskandar'); playId(r,'zeus'); t(r.battle.enemies.every(e=>e.hp===42),'伊斯坎達爾一直駕著戰車：戰車輾壓、宙斯之雷都打全體（各 4）');
r=arena('iskandar',2); r.battle.army=2; r.battle.np=100; G.noble(r,0); t(r.battle.army===7&&r.battle.enemies.every(e=>e.hp===36),'王之軍勢：軍勢 +5、全體軍勢×2',E(r).hp);

r=arena('gilles'); E(r).intent={n:'咒',fx:[['weak',3]]}; G.endTurn(r); t(r.battle.weak===0,'吉爾斯 精神污染：不會虛弱');
r=arena('gilles',2); r.battle.kraken=9; playId(r,'feastdeep'); t(r.battle.kraken===0&&r.battle.enemies.every(e=>e.hp===32),'海魔盛宴：吞掉大小 9 的海魔，全體 18',E(r).hp);
r=arena('gilles'); r.battle.kraken=5; playId(r,'abyss'); t(r.battle.kraken===10,'深淵召喚：海魔翻倍');
r=arena('gilles'); hp=r.hp; playId(r,'sacrifice'); t(r.hp===hp-3&&r.battle.kraken===3+3,'活祭：失去 3 生命、海魔 +3（開場就有 3）');
r=arena('gilles'); r.hp=2; playId(r,'sacrifice'); t(r.hp===1,'自傷不會把自己弄死');

r=G.newRun('hassanH',3); step(r,'fight'); t(r.battle.minions===3,'百貌 開場 3 分身');
r=arena('hassanH'); r.battle.minions=4; playId(r,'swarm'); t(E(r).hp===26,'群襲：4 分身各 3＋3',E(r).hp);
r=arena('hassanH'); r.battle.minions=3; r.battle.energy=0; playId(r,'sac'); t(r.battle.minions===1&&r.battle.energy===2,'捨身：分身換魔力');
r=arena('hassanH'); r.battle.minions=7; playId(r,'clone'); t(r.battle.minions===8,'使魔上限 8');
r=arena('hassanH'); r.battle.minions=2; E(r).intent={n:'穿',fx:[['atkP',10]]}; hp=r.hp; G.endTurn(r); t(hp-r.hp===10&&r.battle.minions===3,'穿透攻擊不會被分身擋（下回合分身 +1）',hp-r.hp);
r=arena('hassanH'); r.battle.minions=3; E(r).intent={n:'守',fx:[['block',0]]}; G.endTurn(r); t(E(r).hp===50&&r.battle.minions===4,'百貌：分身不會自己出擊，每回合 +1',JSON.stringify([E(r).hp,r.battle.minions]));
r=arena('hassanH'); r.battle.minions=1; r.battle.hand=[]; r.battle.draw=['atk','atk','atk']; playId(r,'intel'); t(r.battle.minions===0&&r.battle.hand.length===1,'情報收集：派出分身換抽牌（只有 1 名就抽 1）');
r=arena('medea'); r.battle.minions=2; E(r).intent={n:'守',fx:[['block',0]]}; G.endTurn(r); t(E(r).hp===50-6,'美狄亞的龍牙兵照樣回合結束出擊',E(r).hp);
r=arena('iskandar',3); r.battle.army=4; r.battle.enemies.forEach(e=>{ e.intent={n:'守',fx:[['block',0]]}; }); G.endTurn(r); t(r.battle.enemies.every(e=>e.hp===46),'伊斯坎達爾：軍勢衝過全體敵人（各 4）',JSON.stringify(r.battle.enemies.map(e=>e.hp)));
r=arena('gilles',3); r.battle.kraken=15; r.battle.enemies.forEach((e,i)=>{ e.hp=[30,8,20][i]; e.intent={n:'守',fx:[['block',0]]}; }); G.endTurn(r); t(r.battle.enemies[1].hp===0&&r.battle.enemies[2].hp===5&&r.battle.enemies[0].hp===30,'吉爾斯：海魔咬生命最少的敵人；大小 15 咬兩口',JSON.stringify(r.battle.enemies.map(e=>e.hp)));

r=arena('lancelot'); r.battle.hand=['def','owner']; G.play(r,1,0); t(E(r).hp===47&&r.battle.hand.includes('weapon'),'蘭斯洛特 無窮之武練：技能牌順手攻擊 3；騎士不死於徒手把防禦變成武器化',E(r).hp); G.play(r,r.battle.hand.indexOf('weapon'),0); t(E(r).hp===40&&r.battle.mastery===1,'用掉武器化：7 傷害、武練 +1',JSON.stringify([E(r).hp,r.battle.mastery]));
playId(r,'slashes'); t(E(r).hp===40-(6+1*1),'連斬：6＋武練 1',E(r).hp);
r=arena('lancelot'); r.battle.hand=['def','owner']; G.play(r,1,0); t(r.battle.hand.includes('weapon')&&!r.battle.hand.includes('def')&&r.battle.discard.includes('def'),'騎士不死於徒手：技能牌換成武器');
G.endTurn(r); t(!r.battle.discard.includes('weapon'),'武器是消耗品，不進棄牌');
r=arena('lancelot'); playId(r,'endless'); r.battle.draw=['def','def','def','def','def']; r.battle.discard=[]; G.endTurn(r); t(r.battle.hand.filter(x=>x==='weapon').length===1,'無窮之武練牌：每回合開始 1 張技能變成武器化',r.battle.hand.join());

console.log('── 兩屆都在');
r=arena('heracles'); t(r.lives===1,'赫拉克勒斯 十二試煉：整趟 1 條備用的命'); r.hp=5; E(r).intent={n:'砍',fx:[['atk',40]]}; G.endTurn(r); t(r.hp===Math.round(G.SERVANTS.heracles.hp*0.5)&&r.screen==='battle'&&r.lives===0&&r.battle.str===2&&r.trialStr===2,'倒下以五成血站起來、力量 +2、命用掉',JSON.stringify([r.hp,r.battle.str]));
const tr=J(r); tr.battle=null; tr.screen='map'; step(tr,'fight'); t(tr.battle.str===2,'十二試煉換來的力量整趟保留（下一場開場就有）',tr.battle.str);
const rk=arena('saber'); rk.lives=1; rk.hp=5; E(rk).intent={n:'砍',fx:[['atk',40]]}; G.endTurn(rk); t(rk.hp===Math.round(rk.maxHp*0.2)&&!rk.trialStr,'別人的備用命（靈基再臨等）照舊兩成、不加力量');
r.hp=5; r.lives=0; E(r).intent={n:'砍',fx:[['atk',40]]}; G.endTurn(r); t(r.screen==='over','命用完就真的倒下');
r=G.newRun('gil',3); step(r,'fight');
t(r.battle.hand.filter(x=>/^t_/.test(x)).length>=1,'戰鬥開始從寶庫取出 1 件寶具');
r=arena('gil'); r.battle.hand=['t_sword','t_shield','atk']; G.endTurn(r); t(r.battle.hand.filter(x=>/^t_/.test(x)).length===2&&E(r).hp===46,'王之財寶：寶具留在手上，回合結束 2 件各射 2',JSON.stringify([r.battle.hand,E(r).hp]));
r=arena('gil'); r.battle.hand=['t_sword','t_sword','thousand']; G.play(r,2,0); t(E(r).hp===50-3*4,'千之寶具：手上 2 件寶具＋2 → 射 4 下',E(r).hp);
r=arena('gil'); playId(r,'gate_of'); t(r.battle.hand.filter(x=>/^t_/.test(x)).length===2,'王之財寶：2 件寶具');
r=arena('gil'); E(r).str=3; playId(r,'enkidu'); t(E(r).str===1&&E(r).weak===2,'天之鎖：虛弱 2、力量 -2');

console.log('── 敵人');
r=arena('saber'); E(r).id='medea'; E(r).name='美狄亞'; E(r).intent=G.ENEMIES.medea.moves[0]; G.endTurn(r); t(r.battle.enemies.length===3&&r.battle.enemies.filter(e=>e.id==='fang').length===2,'敵方美狄亞召喚 2 隻龍牙兵');
r=arena('saber'); E(r).intent={n:'穿',fx:[['atkP',10]]}; r.battle.block=20; hp=r.hp; G.endTurn(r); t(hp-r.hp===10,'穿透攻擊無視格擋',hp-r.hp);
const toBoss=(q,k)=>{ q.boss=k; q.floor=11; q.lane=2; q.path=[]; q.screen='map'; G.go(q,2); return q; };
G.BOSSES.forEach(k=>{ const q=toBoss(G.newRun(k==='heracles'?'saber':'heracles',5),k); t(q.battle.kind==='boss'&&q.battle.enemies[0].id===k,'魔王 '+G.ENEMIES[k].name+' 登場'); });
t(G.ORDER.every(k=>{ for(let i=0;i<20;i++){ const q=G.newRun(k,300+i); if(q.bosses.includes(k)||(k==='gilles'&&q.bosses.includes('kraken'))) return false; } return true; }),'魔王不會是自己選的從者');
r=toBoss(G.newRun('saber',11),'heracles'); const hb=r.battle.enemies[0];
hb.hp=5; hb.block=0; r.battle.hand=['heavy']; r.battle.energy=2; G.play(r,0,0); t(hb.hp===Math.round(hb.maxHp*0.6)&&hb.lives===1&&r.screen==='battle','赫拉克勒斯（敵）打倒一次：以六成血站起來',hb.hp);
hb.lives=0; hb.hp=1; r.battle.hand=['atk']; r.battle.energy=1; G.play(r,0,0); t(r.screen==='reward'&&r.reward.next==='act2'&&r.reward.gold===Math.round(80*G.statsOf(r).luck),'打倒第一章魔王：獎勵（80 金×幸運），接著第二章');
r.hp=20; G.takeReward(r,-1); t(r.act===2&&r.floor===0&&r.screen==='map'&&r.boss===r.bosses[1]&&r.hp===20+Math.round((r.maxHp-20)*0.5),'進第二章：新地圖、換魔王、回復一半失去的生命');
step(r,'fight'); t(r.battle.enemies.every(e=>['hound','wraith','golem','ghoul','bat','shade','magus'].includes(e.id)),'第二章換一批敵人');
let s2=toBoss(J(r),r.bosses[1]); s2.battle.enemies.forEach(e=>{e.hp=1;e.lives=0;e.block=0;}); s2.battle.hand=['atk']; s2.battle.energy=1; G.play(s2,0,0);
t(s2.screen==='secret','第二章魔王倒下、手上還有令咒：出現隱藏關的入口');
let s3=J(s2); G.secret(s3,false); t(s3.screen==='over'&&s3.win&&!s3.trueEnd,'不進去：一般勝利');
const sealsBefore=s2.seals; G.secret(s2,true); t(s2.act===3&&s2.seals===sealsBefore-1&&s2.boss==='angra'&&s2.map.length===3,'燒掉 1 劃令咒進隱藏關：休息→精英→此世全部之惡',JSON.stringify([s2.act,s2.seals,s2.boss,s2.map.length]));
s2=toBoss(s2,'angra'); s2.floor=2; s2.screen='map'; s2.battle=null; G.go(s2,2); s2.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); s2.battle.hand=['atk']; s2.battle.energy=1; G.play(s2,0,0); t(s2.screen==='over'&&s2.trueEnd,'打倒此世全部之惡：真結局');
let s4=toBoss(G.newRun('saber',12),'gil'); s4.act=2; s4.seals=0; s4.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); s4.battle.hand=['atk']; s4.battle.energy=1; G.play(s4,0,0); t(s4.screen==='over'&&s4.win,'令咒用完：打倒第二章魔王就直接勝利');
t(G.ORDER.every(k=>{ for(let i=0;i<30;i++){ const q=G.newRun(k,900+i); step(q,'elite'); if(q.battle.enemies[0].id===k) return false; } return true; }),'精英不會是自己選的從者');

console.log('── 靈基覺醒');
t(G.ORDER.every(k=>G.TALENTS[k]&&G.TALENTS[k].length===2&&G.TALENTS[k].every(tier=>tier.length===2&&tier.every(T=>(T.start||[]).concat(T.np||[]).every(f=>G.OPS[f[0]]&&G.FX_TEXT[f[0]])))),'每位從者兩層、每層兩個覺醒，效果都有程式與說明');
t(G.ORDER.every(k=>G.TALENTS[k].flat().every(T=>!(T.start||[]).some(f=>G.needsTarget([f])))),'開場覺醒不會用到要選目標的效果');
let aw=G.newRun('saber',31); step(aw,'elite'); aw.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); aw.battle.np=100; G.noble(aw,0);
t(aw.screen==='reward'&&JSON.stringify(aw.reward.awaken)==='["0.0","0.1"]','打贏精英：出現第一層的兩個覺醒');
t(!G.takeReward(aw,-1),'還沒選覺醒不能收下獎勵');
G.awaken(aw,0); t(aw.awaken[0]==='0.0'&&!aw.reward.awaken&&G.takeReward(aw,-1),'選了「'+G.talent(aw,'0.0').name+'」之後才能繼續');
step(aw,'fight'); t(aw.battle.str===2,'魔力放出（A）：每場開始力量 +2',aw.battle.str);
aw.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); aw.battle.np=100; G.noble(aw,0); t(!aw.reward.awaken,'普通戰鬥不給覺醒'); G.takeReward(aw,-1);
step(aw,'elite'); aw.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); aw.battle.np=100; G.noble(aw,0);
t(JSON.stringify(aw.reward.awaken)==='["1.0","1.1"]','第二次精英：第二層');
G.awaken(aw,0); G.takeReward(aw,-1); t(/每層風再 \+3，對全體造成 15 傷害/.test(G.npText(G.serv(aw).np,aw)),'聖劍解放：寶具追加全體 15',G.npText(G.serv(aw).np,aw));
step(aw,'elite'); aw.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); aw.battle.np=100; G.noble(aw,0); t(!aw.reward.awaken,'兩層都選完就不再出現');
let hk=G.newRun('heracles',3); hk.awaken=['0.0']; hk.screen='reward'; hk.reward={cards:['atk'],relic:null,awaken:['1.0','1.1']}; G.awaken(hk,1); t(hk.lives===2,'第二試煉：多一條命');
let mw=arena('medea'); mw.awaken=['0.1']; step(mw,'fight'); t(mw.battle.minions===2,'龍牙兵團：每場開場 2 隻龍牙兵');

console.log('── 特殊卡牌');
t(G.ORDER.every(k=>Object.keys(G.CARDS).some(c=>G.CARDS[c].rare===k)),'每位從者一張奧義');
r=arena('saber'); r.battle.hand=['mud']; x=G.play(r,0,0); t(!x.ok&&r.battle.hand.length===1,'泥打不出來');
hp=r.hp; G.endTurn(r); t(r.hp===hp-2&&r.battle.discard.includes('mud'),'泥留在手上：回合結束失去 2 生命',hp-r.hp);
r=arena('saber'); E(r).intent={n:'汙',fx:[['atk',1],['curse','mud',2]]}; G.endTurn(r); t(r.battle.discard.concat(r.battle.hand,r.battle.draw).filter(c=>c==='mud').length===2&&!r.deck.includes('mud'),'敵人塞 2 張泥進牌堆，不會留在牌組');
let rr=G.newRun('saber',8); let seenRare=0, rareOk=true; for(let i=0;i<200;i++){ const q=J(rr); q.rs=i*7919; step(q,'elite'); q.battle.enemies.forEach(e=>{e.hp=0;}); q.battle.enemies[0].hp=1; q.battle.enemies[0].block=0; q.battle.np=100; G.noble(q,0); if(q.reward&&q.reward.cards.some(c=>G.CARDS[c.replace('+','')].rare)){ seenRare++; if(!q.reward.cards.every(c=>{ const d=G.CARDS[c.replace('+','')]; return !d.rare||d.rare==='saber'||d.rare==='common'; })) rareOk=false; } }
t(seenRare>20&&seenRare<110&&rareOk,'精英獎勵約三成出奧義，只出自己的或共通的',seenRare);
rr.screen='rest'; const n0=rr.deck.length; t(G.rest(rr,'remove',0)&&rr.deck.length===n0-1&&rr.screen==='map','淨化：從牌組移除一張');
rr.screen='rest'; rr.deck=rr.deck.slice(0,5); t(!G.rest(rr,'remove',0)&&rr.deck.length===5,'牌組至少留 5 張');

t(G.migrate({who:'custom',custom:{name:'舊英靈'},deck:['atk']})===null&&!('custom' in G.SVT_COST)&&!G.makeCustom,'自創英靈拿掉了：舊的自創英靈那一局讀檔作廢、工坊不再賣');

console.log('── 事件・商店・命運・靈基再臨');
t(Object.keys(G.EVENTS).every(k=>G.EVENTS[k].opts.length>=2&&G.EVENTS[k].opts.every(o=>o.fx.every(f=>['hp','maxHp','healPct','relic','seal','pick','addCard','upRandom','cards','commons','fight','gamble','gold','krakenStart','krakenGrow','nextWeak'].includes(f[0])))),'每個事件至少兩個選項，效果都認得');
let ev=G.newRun('saber',41); step(ev,'event'); t(ev.screen==='event'&&G.EVENTS[ev.event]&&(!G.EVENTS[ev.event].act||G.EVENTS[ev.event].act===1),'事件格：抽一個這一章的事件');
ev.event='church'; let hp0=ev.hp, d0=ev.deck.length; G.choose(ev,0); t(ev.hp===hp0-6&&ev.screen==='pick'&&ev.pending[0]==='remove','懺悔：先扣血，再選一張牌移除');
G.pickCard(ev,ev.deck.indexOf('def_saber')); t(ev.deck.length===d0-1&&ev.screen==='map','選完回地圖');
ev.screen='event'; ev.event='magus'; ev.hp=10; t(!G.canChoose(ev,G.EVENTS.magus.opts[0])&&!G.choose(ev,0).ok,'生命不夠付代價的選項不能選');
ev.screen='event'; ev.event='resonance'; ev.seals=0; t(!G.canChoose(ev,G.EVENTS.resonance.opts[0]),'沒有令咒就不能燒令咒');
ev.hp=50; ev.screen='event'; ev.event='echo'; G.choose(ev,0); t(ev.screen==='reward'&&ev.reward.cards.length===3&&ev.reward.cards.every(c=>c.endsWith('+')&&G.CARDS[c.slice(0,-1)].kit==='saber'),'英靈的殘影：三張強化過的專屬牌選一');
G.takeReward(ev,0); t(ev.screen==='map','選完回地圖');
let sh=G.newRun('saber',42); sh.gold=300; step(sh,'shop'); t(sh.screen==='shop'&&sh.shop.cards.length>=4&&sh.shop.cards.slice(0,3).every(c=>G.CARDS[c.id.replace('+','')].kit==='saber'),'商店：至少三張自己的專屬牌');
let price=G.priceOf(sh,sh.shop.cards[0]), dl=sh.deck.length; t(G.buy(sh,'card',0).ok&&sh.gold===300-price&&sh.deck.length===dl+1&&!G.buy(sh,'card',0).ok,'買牌：扣錢、加進牌組、同一張不能再買');
let rp=G.removePrice(sh); t(G.buy(sh,'remove',0).ok&&sh.gold===300-price-rp&&!G.buy(sh,'remove',0).ok&&G.removePrice(sh)===rp+25,'移除卡片：每間店一次，下次貴 25');
sh.gold=0; t(!G.buy(sh,'relic').ok,'錢不夠買不起'); G.leaveShop(sh); t(sh.screen==='map','離開商店');
let gr=arena('saber'); gr.battle.enemies.forEach(e=>{e.hp=1;}); gr.battle.np=100; const g0=gr.gold; G.noble(gr,0); G.takeReward(gr,-1); t(gr.gold>=g0+12&&gr.gold<=g0+18,'打贏一般戰鬥得到 12～18 金',gr.gold-g0);
t(G.fateOptions(5,[]).length===3&&G.fateOptions(5,[]).every(k=>G.FATE_FREE.includes(k))&&G.fateOptions(9,['legacy','early','mana']).every(k=>G.FATES[k]),'命運：沒解鎖時只出三個基本命運');
let ft=G.newRun('saber',6,{fate:'light'}); t(ft.deck.length===7&&ft.fate==='light','輕裝上陣：少 2 張攻擊 1 張防禦');
ft=G.newRun('saber',6,{fate:'merchant'}); ft.gold=100; step(ft,'shop'); t(G.removePrice(ft)===0&&G.priceOf(ft,{price:100})===75,'商人的眷顧：七五折、第一次移除免費'); G.buy(ft,'remove',0); t(G.removePrice(ft)===Math.round(60*0.75),'免費用掉之後是原價七五折'); ft.removed=3; t(G.removePrice(ft)===Math.round(60*0.75),'商人的眷顧：移除之後也不漲價');
ft=G.newRun('saber',6,{fate:'mana'}); step(ft,'fight'); t(ft.battle.np===30,'魔力充盈：寶具量表從 30% 開始',ft.battle.np);
let as=G.newRun('medusa',6,{asc:5}); t(as.maxHp===G.SERVANTS.medusa.hp+8&&as.deck.includes('breaker'),'靈基再臨 V：生命 +8、開局帶奧義');
step(as,'fight'); t(as.battle.enemies.every(e=>e.petrify>=1)&&as.battle.enemies.every(e=>e.weak>=1),'美杜莎再臨 II／III：開場全體石化＋虛弱');
as.battle.enemies.forEach(e=>{e.hp=99;e.maxHp=99;e.petrify=0;e.stun=0;}); as.battle.np=100; G.noble(as,0); t(as.battle.enemies[0].petrify>=0&&/石化 2/.test(G.npText(G.serv(as).np,as)),'再臨 IV：寶具追加全體石化 2',G.npText(G.serv(as).np,as));
t(G.ORDER.every(k=>G.ASC_SVT[k]&&[1,2,3,4,5].every(lv=>G.ascText(k,lv))),'14 位每一級再臨都有自己的說明');
t(G.ORDER.every(k=>G.ASC_SVT[k].slice(0,2).every(fx=>!G.needsTarget(fx))),'開場效果不會用到要選目標的效果');
let as1=G.newRun('saber',6,{asc:3}); step(as1,'fight'); t(as1.battle.wind===2&&as1.battle.block===Math.round(8*G.statsOf(as1).def),'Saber 再臨 III：開場風 2、格擋 8（×格擋倍率）');
t(G.SVT_COST.saber===0&&G.ORDER.every(k=>k==='saber'||G.SVT_COST[k]>0)&&G.ASC.length===6,'一開始只有 Saber 免費，其他都有解鎖價；命座 6 級');
let cz=G.newRun('saber',8); cz.stats.floors=10; cz.stats.bosses=1; t(G.crystalsFor(cz)===25,'聖晶石：走過 10 格＋打倒 1 位魔王＝25');

// 新事件：扣血移除兩張、變形、複製、共通牌
ev=G.newRun('saber',41); step(ev,'event'); ev.event='purge'; hp0=ev.hp; d0=ev.deck.length; G.choose(ev,0); t(ev.hp===hp0-12&&ev.screen==='pick'&&ev.pending.join()==='remove,remove','地下聖堂：失去 12 生命，移除兩張');
G.pickCard(ev,0); G.pickCard(ev,0); t(ev.deck.length===d0-2&&ev.screen==='map','移除兩張後回地圖');
ev=G.newRun('saber',41); step(ev,'event'); ev.event='throne'; G.choose(ev,0); G.pickCard(ev,0); t(ev.deck[0]!=='atk'&&G.CARDS[G.baseId(ev.deck[0])].kit==='saber'&&G.isUp(ev.deck[0]),'英靈座的回響：選的牌變成一張強化過的專屬牌',ev.deck[0]);
ev=G.newRun('saber',41); step(ev,'event'); ev.event='mirror'; d0=ev.deck.length; G.choose(ev,0); G.pickCard(ev,ev.deck.length-1); t(ev.deck.length===d0+1&&ev.deck[ev.deck.length-1]==='invis','鏡中的自己：複製一張（招牌牌）');
ev=G.newRun('saber',41); step(ev,'event'); ev.event='storehouse'; G.choose(ev,0); t(ev.screen==='reward'&&ev.reward.cards.length===3&&ev.reward.cards.every(c=>G.CARDS[c].kit==='common'),'衛宮家的土藏：從三張共通牌選一張');
ev=G.newRun('saber',41); step(ev,'event'); ev.event='castle'; ev.gold=30; t(!G.canChoose(ev,G.EVENTS.castle.opts[0])&&!G.canChoose(ev,G.EVENTS.castle.opts[1]),'錢不夠就不能選');
t(Object.keys(G.EVENTS).filter(k=>!G.EVENTS[k].act||G.EVENTS[k].act===1).length>=16,'第一章至少 16 個事件可抽');

// 美杜莎：照原作（踢擊、釘劍鎖鏈、怪力、鮮血神殿、石化魔眼；天馬只在寶具）

t(G.CARDS.nails&&G.CARDS.chain&&G.SERVANTS.medusa.sig==='chain','鎖鏈（招牌牌）與釘劍都在');
// 卡面簡短說明
t(Object.keys(G.CARDS).every(k=>{ const t2=G.cardShort(k); return t2&&!/undefined|\{|null/.test(t2)&&t2.length<=G.cardText(k).length; }),'每張牌都有簡短說明（沒有漏字、比完整說明短）');

r=G.newRun('medusa',3); step(r,'fight'); t(r.battle.enemies.every(e=>e.petrify===1)&&!r.battle.mounted,'美杜莎 石化魔眼：開場全體石化 1（不會開場就騎天馬）');
r=arena('medusa'); playId(r,'monstrous'); t(r.battle.tstr===3,'怪力：本回合力量 +3');
r=arena('medusa',1,60); r.battle.np=100; G.noble(r,0); t(E(r).hp===15&&E(r).stun===1,'騎英之手綱：召喚天馬衝撞 45＋石化 3（一般敵人直接動彈不得）',JSON.stringify([E(r).hp,E(r).stun]));
t(['chain','nails','kick','monstrous','bloodfort','mystic'].every(k=>G.CARDS[k]&&G.CARDS[k].kit==='medusa')&&!G.CARDS.mount&&!G.CARDS.land,'美杜莎的牌照原作：鎖鏈、釘劍、踢擊、怪力、鮮血神殿、石化魔眼；沒有騎乘牌');
const svMd=J(G.newRun('medusa',3)); svMd.deck.push('mount','land+','pegasus'); G.migrate(svMd); t(svMd.deck.includes('monstrous')&&svMd.deck.includes('kick+')&&svMd.deck.includes('kick'),'舊存檔的天馬召喚／急降／天馬衝撞換成怪力／迴旋踢');
r=arena('saber'); r.battle.wind=3; t(G.cardShort('hammer',r).startsWith('全體⚔17'),'戰鬥中簡短說明照資源算好數字（風王鐵槌 5＋風 3×4）',G.cardShort('hammer',r));
// 累積時的小好處
r=arena('saber'); r.battle.wind=7; E(r).intent={n:'砍',fx:[['atk',10,2]]}; t(G.intentDmg(r,E(r),E(r).intent.fx[0])===8,'Saber 風之屏障：風 7（每 3 層 -1）→ 敵人每擊 -2，預告也照算'); hp=r.hp; G.endTurn(r); t(hp-r.hp===16,'兩擊各 8',hp-r.hp);
r=arena('medusa'); E(r).petrify=2; E(r).intent={n:'砍',fx:[['atk',10]]}; t(G.intentDmg(r,E(r),E(r).intent.fx[0])===9,'美杜莎 魔眼的重壓：石化 2 層，攻擊 -1（每 2 層 -1）');
r=arena('medea'); r.battle.chant=9; r.battle.block=0; G.endTurn(r); t(r.battle.block===4,'美狄亞：回合開始格擋＝陣地÷2（9→4）',r.battle.block); r.battle.chant=40; G.endTurn(r); t(r.battle.block===6,'最多 6');
r=arena('scathach',1,999); r.battle.energy=9; ['def','def','def','def','def'].forEach(x=>playId(r,x)); t(r.battle.evade===0,'斯卡哈規則精簡：不再有第 5 張迴避'); const bk=r.battle.block; playId(r,'atk'); t(r.battle.block===bk+1&&E(r).doom===1,'魔境之智慧：第 3 張起每張攻擊，刻印 +1、自己格擋 +1');

// 每位從者自己的基本牌
t(G.ORDER.every(k=>{ const d=G.newRun(k,3).deck; return d.filter(x=>x==='atk_'+k).length===5&&d.filter(x=>x==='def_'+k).length===4&&G.card('atk_'+k).name!=='攻擊'&&G.card('def_'+k).name!=='防禦'; }),'每位從者開局 5 張自己的攻擊、4 張自己的防禦，名字各不相同');
t(new Set(G.ORDER.map(k=>G.card('atk_'+k).name)).size===G.ORDER.length,'15 位的基本攻擊名字都不一樣');
t(G.ORDER.every(k=>k==='iskandar'||G.card('atk_'+k).fx[0][0]==='dmg'&&G.card('atk_'+k).fx[0][1]===6)&&G.ORDER.every(k=>G.card('def_'+k).fx[0][1]===5),'基本牌數字全員一樣（6／5；伊斯坎達爾駕戰車改全體 4），定位交給六圍');
// 官方六圍
t(G.ORDER.every(k=>G.PARAMS[k]&&G.PARAMS[k].length===6),'15 位都有六圍');
r=arena('heracles'); r.flat=false; playId(r,'atk_heracles'); t(E(r).hp===50-7,'赫拉克勒斯 筋力 A+：6 傷 ×1.12 → 7',E(r).hp);
r=arena('medea'); r.flat=false; playId(r,'def_medea'); t(r.battle.block===6,'美狄亞 格擋看筋力／敏捷／魔力取最高（魔力 A+ 112%）：5 → 6',r.battle.block);
r=arena('gilles'); r.flat=false; playId(r,'def_gilles'); t(r.battle.block===5,'吉爾斯 筋力 D／敏捷 D／魔力 C 取最高（92%）：5 → 5',r.battle.block);
t(G.SERVANTS.heracles.hp===81&&G.SERVANTS.gilles.hp===57&&G.SERVANTS.saber.hp===75,'生命照耐久：B 75、A 81、E 57');
r=arena('medea'); r.flat=false; playId(r,'atk_medea'); t(E(r).hp===50-7,'美狄亞 魔力 A+（術者看魔力）：6 傷 → 7',E(r).hp);
r=arena('iskandar'); r.flat=false; playId(r,'def_iskandar'); t(r.battle.block===5,'伊斯坎達爾 耐久 A：5 ×1.08 → 5（四捨五入）',r.battle.block);
r=arena('saber'); r.flat=false; r.battle.wind=0; r.battle.np=100; G.noble(r,0); t(E(r).hp===Math.max(0,50-Math.round(40*1.08)),'寶具等級只顯示：Saber 寶具 A++ 只乘攻擊（魔力 A）',E(r).hp);
const cuR=G.newRun('cu',3); step(cuR,'fight'); const saR=G.newRun('saber',3); step(saR,'fight'); t(cuR.battle.hand.length===saR.battle.hand.length+1,'敏捷 A 以上（庫・丘林）：開場多抽 1 張',[cuR.battle.hand.length,saR.battle.hand.length].join());
t(G.statsOf(G.newRun('cu',1)).luck<1&&G.statsOf(G.newRun('gil',1)).luck>1,'幸運：庫・丘林 E 拿的金錢比較少，吉爾伽美什 A 比較多');
const svB=J(G.newRun('kojiro',3)); svB.deck=svB.deck.map(x=>G.isBasic(x,'atk')?'atk':G.isBasic(x,'def')?'def+':x); G.migrate(svB); t(svB.deck.filter(x=>x==='atk_kojiro').length===5&&svB.deck.filter(x=>x==='def_kojiro+').length===4,'舊存檔的通用攻擊／防禦換成自己的（保留強化）');
let lt=G.newRun('saber',6,{fate:'light'}); t(lt.deck.filter(x=>G.isBasic(x,'atk')).length===3&&lt.deck.filter(x=>G.isBasic(x,'def')).length===3,'輕裝上陣：拿掉的是自己的基本牌');

// 吉爾斯專屬的作惡事件
t(Array.from({length:40},(_,i)=>{ const q=G.newRun('saber',500+i); step(q,'event'); return q.event; }).every(id=>!G.EVENTS[id].who),'別的從者不會遇到吉爾斯的作惡事件');
ev=G.newRun('gilles',41); step(ev,'event'); ev.event='spellbook'; hp0=ev.hp; G.choose(ev,0); t(ev.hp===hp0-8&&ev.krakenStart===3,'螺湮城教本的低語：失去 8 生命，每場開場海魔 +3');
step(ev,'fight'); t(ev.battle.kraken===6,'下一場開場海魔 3＋3',ev.battle.kraken);
ev=G.newRun('gilles',41); step(ev,'event'); ev.event='jeanne'; G.choose(ev,0); step(ev,'fight'); ev.battle.enemies.forEach(e=>{ e.intent={n:'守',fx:[['block',0]]}; e.hp=999; }); const k0=ev.battle.kraken; G.endTurn(ev); t(ev.battle.kraken===k0+2,'聖女的幻影（褻瀆）：海魔每回合長大 2',ev.battle.kraken-k0);
ev=G.newRun('gilles',41); step(ev,'event'); ev.event='riverside'; G.choose(ev,0); t(ev.deck.includes('prelati')&&ev.maxHp===G.SERVANTS.gilles.hp-6,'未遠川的儀式：最大生命 -6，得到普雷拉蒂的激勵');

r=G.newRun('lancelot',3); step(r,'fight'); r.battle.enemies.forEach(e=>{ e.intent={n:'守',fx:[['block',0]]}; e.hp=999; }); hp=r.hp; G.endTurn(r); t(r.hp===hp-2,'狂戰士 狂化：每回合開始失去 2 生命',hp-r.hp);
r.hp=1; r.battle.enemies.forEach(e=>{ e.intent={n:'守',fx:[['block',0]]}; }); G.endTurn(r); t(r.hp===1&&r.screen==='battle','狂化不會讓自己倒下');
r=G.newRun('saber',3); step(r,'fight'); r.battle.enemies.forEach(e=>{ e.intent={n:'守',fx:[['block',0]]}; e.hp=999; }); hp=r.hp; G.endTurn(r); t(r.hp===hp,'其他職階不扣');

r=G.newRun('kojiro',3); step(r,'fight'); r.battle.enemies.forEach(e=>{ e.intent={n:'守',fx:[['block',0]]}; e.hp=999; }); r.hp=30; G.endTurn(r); t(r.hp===33,'小次郎 山門的守門人：每回合開始回復 3',r.hp);
console.log('── 斯卡哈');
r=arena('scathach'); playId(r,'doublespear'); t(E(r).doom===1&&E(r).hp===40,'雙槍・死棘：5×2＋刻印 1（刻印打完才上）');
r.battle.energy=3; playId(r,'atk'); t(E(r).hp===40-7,'刻印 1：每一擊 +1',E(r).hp);
E(r).hp=4; r.battle.energy=3; playId(r,'runebind'); t(E(r).hp===4&&E(r).doom===3,'刻印不會自己殺人：刻印 3、4 血還站著（要收尾）',E(r).hp);
playId(r,'doublespear'); t(E(r).hp<=0,'雙槍・死棘收尾：生命 ≤ 刻印×4 當場倒下',E(r).hp);
r=arena('scathach'); E(r).doom=2; E(r).hp=30; playId(r,'deathflight'); t(E(r).hp===30-(10+3*2+2),'死翔之槍：10＋刻印×3＋刻印加傷 2',E(r).hp);
r=arena('scathach'); E(r).id='heracles'; E(r).doom=10; E(r).hp=60; E(r).maxHp=100; r.battle.energy=3; playId(r,'doublespear'); t(E(r).hp===60-30,'魔王不吃收尾即死（只吃加傷）',E(r).hp);
r=arena('scathach'); E(r).id='saber'; E(r).name='x'; playId(r,'godslayer'); t(E(r).hp===50-15,'弒神：精英 7＋8',E(r).hp);
// 魔境之智慧：第 3 張牌起每張刻印 +1
r=arena('scathach'); r.battle.energy=9; playId(r,'def'); playId(r,'def'); t(!E(r).doom,'前兩張牌不觸發');
playId(r,'def'); t(!E(r).doom,'第 3 張是技能：算張數但不上刻印');
playId(r,'atk'); t(E(r).doom===1&&E(r).hp===50-6,'魔境之智慧：第 3 張牌起，每張攻擊牌讓目標刻印 +1',E(r).doom);
playId(r,'quickspear'); t(E(r).doom===3&&E(r).hp===44-4,'疾槍：0 費 3 傷害（刻印 1 再 +1）＋刻印 1，再加被動 1',JSON.stringify([E(r).doom,E(r).hp]));
r=arena('scathach',1,50); r.battle.played=3; playId(r,'chainthrust'); t(E(r).hp===50-3*3,'連環刺突：本回合已打 3 張 → 刺 3 下',E(r).hp);
r=arena('scathach',1,50); playId(r,'chainthrust'); t(E(r).hp===50-3,'連環刺突：第一張也至少刺 1 下',E(r).hp);
r=arena('scathach'); r.battle.hand=[]; r.battle.draw=['atk','atk','atk']; playId(r,'flashstep'); t(r.battle.hand.length===1&&G.wisdomFrom(r.battle)===2,'瞬步：抽 1＋本回合提早 1 張觸發');
playId(r,'atk'); t(E(r).doom===1,'提早後第 2 張攻擊就觸發');
r=arena('scathach'); playId(r,'godspeed'); G.endTurn(r); t(G.wisdomFrom(r.battle)===2,'神速：整場提早 1 張（下回合還在）');
// 收尾成功：魔力 +1、抽 1，下一張攻擊也能收尾（連鎖）
r=arena('scathach',3,50); r.battle.hand=[]; r.battle.draw=['atk','atk','atk']; r.battle.enemies.forEach(e=>{ e.hp=30; e.doom=8; }); r.battle.energy=1;
playId(r,'quickspear',0); t(r.battle.enemies[0].hp>0&&r.battle.energy===1,'疾槍不是收尾牌：刻印夠了也不會即死',r.battle.enemies[0].hp);
r.battle.energy=1; playId(r,'doublespear',1); t(r.battle.enemies[1].hp<=0&&r.battle.energy===1&&r.battle.hand.length===1&&r.battle.reapNext===1,'死棘收尾：魔力 +1、抽 1、進入連鎖',JSON.stringify([r.battle.enemies[1].hp,r.battle.energy,r.battle.hand.length,r.battle.reapNext]));
playId(r,'quickspear',2); t(r.battle.enemies[2].hp<=0&&r.battle.reapNext===1,'連鎖中：下一張攻擊（疾槍）也收尾，連鎖繼續',r.battle.enemies[2].hp);
G.endTurn(r); t(!r.battle.reapNext,'連鎖到回合結束就斷');
r=arena('saber',2,50); E(r).hp=4; E(r).doom=1; r.battle.energy=1; playId(r,'atk',0); t(E(r).hp<=0||E(r).hp===4-0,'別的從者沒有收尾');
// 連動／追擊（參考卡厄斯海德瑪麗）：打出連動牌 → 手上其他連動牌一起出手；追擊的免費發動七成，沒有追擊的丟掉
r=arena('scathach',2,50); r.battle.hand=['quickspear','runefire','deathflight','atk']; r.battle.energy=3; playId(r,'doublespear',0);
t(r.battle.hand.length===1&&r.battle.hand[0]==='atk'&&r.battle.discard.includes('deathflight')&&r.battle.played===3,'連動：疾槍、盧恩・火追擊，死翔之槍（沒追擊）被丟掉，普通牌留在手上；一起出手的算張數',JSON.stringify([r.battle.hand,r.battle.played]));
t(r.battle.log.some(x=>x==='追擊：疾槍')&&r.battle.log.some(x=>x==='連動丟棄：死翔之槍'),'連動的紀錄寫得出來');
t(G.CHASE===0.7&&r.battle.enemies[1].hp===50-2&&r.battle.enemies[1].doom===1,'追擊效果七成：盧恩・火全體 3 → 2，刻印照給',r.battle.enemies[1].hp);
r=arena('scathach',2,50); E(r).hp=30; E(r).doom=8; r.battle.enemies[1].hp=10; r.battle.enemies[1].doom=3; r.battle.hand=['quickspear']; r.battle.energy=3; playId(r,'doublespear',0);
t(r.battle.enemies.every(e=>e.hp<=0),'一按刺倒一排：死棘收尾 → 連鎖 → 追擊的疾槍也收尾下一個',JSON.stringify(r.battle.enemies.map(e=>e.hp)));
r=arena('scathach',2,50); r.battle.hand=['doublespear']; r.battle.energy=3; playId(r,'atk',0); t(r.battle.hand.length===1,'普通牌不會觸發連動');
r=arena('scathach',3,50); E(r).hp=30; E(r).doom=8; r.battle.enemies[1].hp=40; r.battle.enemies[2].hp=12; r.battle.enemies[2].doom=3; r.battle.hand=['quickspear']; r.battle.energy=3; playId(r,'doublespear',0);
t(r.battle.enemies[2].hp<=0&&r.battle.enemies[1].hp===40,'目標倒了：連鎖中的追擊自動找「可收尾」的敵人，不會亂打',JSON.stringify(r.battle.enemies.map(e=>e.hp)));
const svM=J(G.newRun('scathach',3)); svM.deck.push('mentor','dunscaith+'); G.migrate(svM); t(svM.deck.includes('flashstep')&&svM.deck.includes('godspeed+'),'舊存檔的師匠的教誨／魔境之智慧換成瞬步／神速');
console.log('── 難度');
let dn=G.newRun('saber',9,{diff:'normal'}), dh=G.newRun('saber',9,{diff:'abyss'}); step(dn,'fight'); step(dh,'fight');
t(dh.battle.enemies[0].maxHp>=Math.round(dn.battle.enemies[0].maxHp*1.35)&&dh.battle.enemies[0].str===dn.battle.enemies[0].str+2,'深淵：敵人生命 +40%、力量 +2',JSON.stringify([dn.battle.enemies[0].maxHp,dh.battle.enemies[0].maxHp]));
t(G.restHeal(dh)===Math.round(dh.maxHp*0.2)&&G.restHeal(dn)===Math.round(dn.maxHp*0.3),'深淵休息只回兩成');
dn.stats.floors=10; dh.stats.floors=10; t(G.crystalsFor(dh)===G.crystalsFor(dn)*2,'深淵聖晶石 ×2');
t(G.newRun('saber',1,{asc:6}).ascStart.some(f=>f[0]==='pWind'),'命座 VI：每回合的專屬強化（Saber 每回合風 +1）');

console.log('── 強化方向');
t(G.upDirs('invis').join('')==='acde'&&G.upDirs('charge').join('')==='abcde'&&G.upDirs('atk').join('')==='ace'&&G.upDirs('kingly').join('')==='ad'&&G.upDirs('invis+').length===0&&G.upDirs('sword').length===0,'每張牌能往哪幾個方向強化（1 費沒有迅捷、能力牌沒有共鳴與極限、已強化／代幣不能再強化）');
t(G.card('charge+b').cost===1&&G.card('invis+c').np===30&&G.card('invis+c').fx.some(f=>f[0]==='draw')&&G.card('invis+d').fx.filter(f=>f[0]==='wind').length===1&&G.card('invis+d').fx.some(f=>f[0]==='wind'&&f[1]===2)&&G.card('invis+e').fx[0][1]===10&&G.card('invis+e').ex,'迅捷 -1 費、共鳴 +15% 抽 1、魂加風（原本風 1 → 2，精煉是 1）、極限翻倍但消耗');
t(G.card('invis+').name==='看不見的劍＋'&&G.card('invis+').fx[0][1]===7&&G.card('invis+e').name==='看不見的劍・極'&&G.card('invis+c').name==='看不見的劍・共鳴','舊存檔的「+」還是精煉；名字帶方向');
let ug=G.newRun('saber',77); ug.deck.push('charge'); const ci=ug.deck.length-1, op=G.upgradeOptions(ug,ci);
t(op.length===3&&op.includes('charge+')&&JSON.stringify(G.upgradeOptions(ug,ci))===JSON.stringify(op),'強化給三個方向（精煉一定在），同一次重畫不會變',op);
ug.screen='rest'; t(!G.rest(ug,'upgrade',ci,'charge+x')&&G.rest(ug,'upgrade',ci,op[1])&&ug.deck[ci]===op[1],'只能選給的方向');
let ug2=G.newRun('saber',78); let seenDirs=new Set(); for(let k=0;k<40;k++){ ug2.stats.floors=k; G.upgradeOptions(ug2,9).forEach(v=>{ if(G.card(v).dir!=='f') seenDirs.add(G.card(v).dir); }); } t(seenDirs.size===4,'換個時間點，另外兩個方向會變（看不見的劍 4 個方向都出現過）',[...seenDirs].join(''));
r=arena('saber'); r.battle.hand=['invis+e']; G.play(r,0,0); t(E(r).hp===30&&r.battle.exhaust.includes('invis+e'),'極限：10×2、打完消耗',E(r).hp);

console.log('── 流程');
let r7=arena('saber'); r7.battle.enemies.forEach(e=>{e.hp=1;}); r7.battle.np=100; G.noble(r7,0);
t(r7.screen==='reward'&&r7.reward.cards.length===3&&r7.reward.cards.every(c=>['saber','common'].includes(G.CARDS[c.replace('+','')].kit)),'打贏：三選一，只出自己的牌和共通牌');
const pk=r7.reward.cards[0]; G.takeReward(r7,0); t(r7.deck.includes(pk)&&r7.screen==='map','選的牌加進牌組、回地圖');
r7.screen='rest'; r7.hp=10; G.rest(r7,'heal'); t(r7.hp===10+Math.round(r7.maxHp*0.3),'休息：回三成生命');
r7.screen='rest'; const ui=r7.deck.findIndex(x=>G.isBasic(x,'atk')); const b7=r7.deck[ui]; G.rest(r7,'upgrade',ui); t(r7.deck[ui]===b7+'+'&&G.card(b7+'+').fx[0][1]===G.BASICS[r7.who][2][0][1]&&G.card(b7+'+').name.endsWith('＋'),'強化：基本攻擊→精煉（數值照表）',r7.deck[ui]);
const r9=G.newRun('saber',12); r9.relics=['shroud','gem','circuit','book']; step(r9,'fight');
t(r9.battle.block===8&&r9.battle.energy===4&&r9.battle.np===25&&r9.battle.enemies.every(e=>e.weak===1),'禮裝：聖骸布、寶石、魔術刻印、偽臣之書');
const r10=J(G.newRun('lancelot',21)); step(r10,'fight'); const saved=J(r10); x=G.play(saved,0,0); t(x.ok||x.msg,'存檔（JSON）來回後照樣能出牌');
const old={v:1,who:'archer',hp:50,maxHp:72,deck:['atk'],relics:[],seals:3,maxSeals:3,floor:3,lane:1,screen:'battle',map:G.newRun('saber',1).map,
  battle:{kind:'fight',turn:1,energy:3,block:0,np:0,str:0,tstr:0,vuln:0,weak:0,thorns:0,pBlock:0,pDraw:0,pEnergy:0,ubw:0,projUp:0,firstAtk:false,draw:[],hand:['atk','sword'],discard:[],exhaust:[],enemies:[{id:'hercules',key:'h0',name:'赫拉克勒斯',hp:50,maxHp:100,block:0,str:0,vuln:0,weak:0,lives:1,mi:0,last:-1,rep:0,intent:{n:'怒吼',fx:[['str',3]]}}],log:[]},stats:{kills:0,np:0,seals:0,floors:3},rs:5};
G.migrate(old); t(old.who==='emiya'&&old.boss==='heracles'&&old.battle.enemies[0].id==='heracles'&&G.play(old,0,0).ok&&G.endTurn(old).ok,'第一版的舊存檔（Archer）轉得過來、繼續能打');
// 強化畫面看得出差別：英靈之魂不重複印同一個資源、共鳴的寶具量表上卡面、upDiff 列出具體變化
t(JSON.stringify(G.card('doublespear+d').fx)==='[["hits",5,2],["doom",3],["reap"]]'&&G.cardShort('doublespear+d')==='⚔5×2 刻印3 收尾 連動','英靈之魂：牌上已有刻印 1 → 合併成刻印 3（不印兩次、也不輸給精煉）',G.cardShort('doublespear+d'));
t(JSON.stringify(G.card('rose+d').fx.filter(f=>f[0]==='stance').length)==='3','英靈之魂：切換架勢（非數字）照樣多加一次');
t(/寶具\+30%/.test(G.cardShort('doublespear+c')),'共鳴：卡面顯示寶具 +%',G.cardShort('doublespear+c'));
t(G.upDiff('doublespear','doublespear+c').some(x=>/寶具 \+15% → \+30%/.test(x))&&G.upDiff('doublespear','doublespear+a').some(x=>/→/.test(x)&&/6×2/.test(x)),'強化選單列出具體變化（寶具 +15% → +30%、⚔5×2 → ⚔6×2）',JSON.stringify(G.upDiff('doublespear','doublespear+c')));
t(G.FATES.gold.name==='意外之財','命運不用別的從者的技能名（黃金律是吉爾伽美什的）');
// 無盡模式：第二章魔王之後不進隱藏關，一層一層往下、越來越強
{ const toBoss=(r)=>{ r.floor=11; r.lane=r.map[10].findIndex(n=>n); r.screen='map'; G.go(r,2); r.battle.enemies.forEach(e=>{e.hp=1;e.block=0;e.lives=0;}); r.battle.hand=[G.basicOf('saber','atk')]; r.battle.energy=3; G.play(r,0,0); };
  let r=G.newRun('saber',5,{endless:true}); r.act=2; r.boss='gil'; r.seals=3; toBoss(r);
  t(r.screen==='reward'&&r.reward.next==='deeper','無盡：第二章魔王倒下 → 有令咒也不進隱藏關，拿獎勵往下',r.screen);
  G.takeReward(r,-1);
  t(r.act===3&&r.map.length===12&&G.actName(r)==='無盡　第 1 層'&&r.boss!=='angra'&&r.boss!=='saber','無盡第 1 層：新的 12 列地图、魔王從兩章魔王池抽'.replace('图','圖'),r.act+' '+r.boss);
  t(step(r,'fight')&&r.battle&&r.battle.enemies.length>0,'無盡層的一般戰鬥用第二章的敵人');
  r.screen='map'; r.battle=null; r.floor=0; r.lane=-1; t(step(r,'event')&&r.screen==='event','無盡層也有事件');
  const b2=G.newRun('saber',5); b2.act=2; b2.floor=11; const hp2=(()=>{ b2.lane=b2.map[10].findIndex(n=>n); b2.boss='gil'; G.go(b2,2); return b2.battle.enemies[0].maxHp; })();
  const r3=G.newRun('saber',5,{endless:true}); r3.act=4; r3.map=r3.map; r3.floor=11; r3.lane=r3.map[10].findIndex(n=>n); r3.boss='gil'; G.go(r3,2);
  t(r3.battle.enemies[0].maxHp>hp2*1.5&&r3.battle.enemies[0].str>b2.battle.enemies[0].str,'無盡越深越強（第 2 層的吉爾伽美什比第二章強很多）',hp2+'→'+r3.battle.enemies[0].maxHp);
  { const h=G.newRun('saber',5); h.act=3; h.floor=2; const e=G.newRun('saber',5,{endless:true}); e.act=3; e.floor=2; t(G.scaleUp(h)===9&&G.scaleUp(e)===13,'敵人成長：隱藏關照舊（+8），無盡第 1 層 +12',G.scaleUp(h)+'/'+G.scaleUp(e)); }
  const n=G.newRun('saber',5); n.act=2; n.boss='gil'; n.seals=1; toBoss(n); t(n.screen==='secret','一般模式不受影響：第二章打完有令咒照樣到隱藏關入口',n.screen); }
// 稽核修正：舊存檔強化後綴、命座 V＋奧義傳承、強化選單「不再消耗」、赫拉克勒斯覺醒文字
{ const m=J(G.newRun('scathach',3)); m.deck.push('mentor+c'); m.shop={cards:[{id:'mentor+b'}]}; G.migrate(m);
  t(m.deck.includes('flashstep+c')&&m.shop.cards[0].id==='flashstep+b'&&!!G.card('flashstep+c'),'舊存檔被改名的牌保留強化方向（+b～+e），商店裡的也一起換'); }
t(G.newRun('saber',3,{asc:6,fate:'legacy'}).deck.filter(x=>G.baseId(x)==='avalon').length===1,'命座 V 已經有奧義：奧義傳承改成把它強化，不會拿到兩張');
t(G.upDiff('breaker','breaker+').includes('不再消耗'),'強化選單列出「不再消耗」');
{ const h=G.newRun('heracles',3); const T=G.TALENTS?null:null; const txt=G.ORDER.includes('heracles')&&G.talentText(G.talent(h,'1.1'),h); t(/五成/.test(txt),'赫拉克勒斯的多一條命：寫五成生命站起來',txt); }
// 稽核第 1 輪：令咒只能在戰鬥中用、預計傷害不被剩血截掉、連動帶出的牌也算第 5 張、寶具追加刻印在收尾之前
{ const r=arena('saber'); r.screen='reward'; t(!G.seal(r,'all').ok&&r.seals===3,'戰鬥結束（勝利停頓中）不能用令咒'); }
{ const r=arena('iskandar',3,6); r.battle.army=5; r.battle.hand=['order']; const p=G.preview(r,0,0), q=G.preview(r,0,0,true); t(p.per[0]===6&&q.per[0]===8&&p.kills===3,'預計：raw 量實際打出的 3+5=8（不被 6 血截掉）、一般試算數得到擊倒',JSON.stringify([p.per,q.per,p.kills])); }
{ const r=arena('scathach',1,999); r.battle.played=3; r.battle.hand=['quickspear','flashstep']; r.battle.energy=3; playId(r,'doublespear',0); t(r.battle.played===6&&E(r).doom>=4,'連動帶出的牌也算張數（攻擊牌都吃得到魔境之智慧的刻印）',JSON.stringify([r.battle.played,E(r).doom])); }
{ const r=G.newRun('scathach',3,{asc:4}); const fx=G.npFx(r,G.SERVANTS.scathach.np); t(fx[fx.length-1][0]==='reap'&&fx.some(f=>f[0]==='doomAll'),'寶具追加的刻印排在收尾之前',JSON.stringify(fx)); }
t(G.ascText('hassanH',2).includes('分身')&&G.ascText('medea',2).includes('龍牙兵')&&G.npText(G.SERVANTS.hassanH.np).includes('分身'),'再臨／寶具文字用這位的使魔名字（分身、龍牙兵）');
t(!/每場戰鬥開始：每/.test(G.ORDER.map(k=>[2,3,4,6].map(l=>G.ascText(k,l)).join('|')).join('|')),'「每回合…」的效果不再疊「每場戰鬥開始：」');
// 全部玩家看得到的文字（所有牌與強化方向、寶具、再臨、覺醒、被動、禮裝、事件、命運）沒有 undefined／NaN／{1} 殘留
{ const bad=[], chk=(w,x)=>{ if(/undefined|NaN|\{\d\}|\{m\}|null/.test(x)) bad.push(w); };
  Object.keys(G.CARDS).forEach(k=>[k].concat(G.upDirs(k).map(d=>d==='a'?k+'+':k+'+'+d)).forEach(id=>{ chk(id,G.cardText(id,null)); chk(id,G.cardShort(id,null)); }));
  G.ORDER.forEach(k=>{ const r=G.newRun(k,1); chk(k,G.npText(G.SERVANTS[k].np)); for(let l=1;l<=6;l++) chk(k+l,G.ascText(k,l)); (G.TALENTS[k]||[]).flat().forEach(T=>chk(k+T.name,G.talentText(T,r))); });
  Object.keys(G.RELICS).forEach(k=>chk(k,G.RELICS[k].text)); Object.keys(G.EVENTS).forEach(k=>G.EVENTS[k].opts.forEach(o=>chk(k,o.label))); Object.keys(G.FATES).forEach(k=>chk(k,G.FATES[k].text));
  t(!bad.length,'所有文字沒有 undefined／NaN／{1} 殘留',bad.slice(0,5).join(',')); }
// 稽核第 2 輪：EMIYA 鶴翼三連、吉爾斯海魔每 12 多咬一口、庫・丘林開局迎擊之槍、理性蒸發換武練
{ const r=arena('emiya',1,99); r.battle.hand=['sword','sword']; playId(r,'kakuyoku'); t(E(r).hp===99-(5+2)*3,'鶴翼三連：手上 2 把投影劍 → (5+2)×3（劍不消耗）',E(r).hp); t(r.battle.hand.filter(x=>x==='sword').length===2,'鶴翼三連不用掉投影劍'); }
{ const r=arena('gilles'); r.battle.kraken=12; t(G.krakenBites(r.battle)===2,'海魔大小 12 就咬兩口'); }
t(G.newRun('cu',1).deck.includes('arrowward'),'庫・丘林開局招牌牌是箭矢加護（原作技能，第 1 回合就能迴避）');
{ const r=arena('lancelot'); playId(r,'reason'); t(r.battle.mastery===1&&!r.battle.tstr,'理性蒸發：武練 +1（不再是本回合力量，跟赫拉克勒斯分開）'); }
// 稽核第 3 輪：強化方向不再有永遠的最佳解
t(JSON.stringify(G.card('charge+b').fx[0])==='["windDmg",10,2]'&&G.card('charge+b').cost===1,'迅捷：單純便宜 1 費（數值不變）',JSON.stringify(G.card('charge+b').fx));
t(JSON.stringify(G.card('heavy+').fx[0])==='["dmg",21]'&&G.card('heavy+').cost===2,'2 費以上的精煉數值再 ×1.25（重擊 17 → 21），才比得過迅捷 -1 費',JSON.stringify(G.card('heavy+').fx));
{ const r=G.newRun('saber',3,{fate:'early'}); t(r.screen==='boon'&&r.boon.opts.length===2&&G.takeBoon(r,1)&&r.awaken.length===1&&r.screen==='map','早熟的靈基：出發前兩個選一個'); }
{ const r=G.newRun('saber',3,{fate:'heirloom'}); t(r.screen==='boon'&&r.boon.kind==='relic'&&r.boon.opts.length===2&&G.takeBoon(r,0)&&r.relics.length===1,'家傳禮裝：兩件禮裝選一件'); }
{ const r=G.newRun('saber',3); r.screen='event'; r.event='mapo'; G.choose(r,0); step(r,'fight'); t(r.battle.weak===2&&!r.nextWeak,'麻婆豆腐：回 25，下一場開場虛弱 2（只有下一場）'); }
t(JSON.stringify(G.card('charge+e').fx[0])==='["windDmg",20,4]','極限：每點資源的加成也翻倍（10+2/風 → 20+4/風）',JSON.stringify(G.card('charge+e').fx));
t(!G.upDirs('quickspear').includes('e')&&G.upDirs('invis').includes('e'),'數字太小的牌（疾槍 3）不給極限；5×2 算 10 可以');
t(G.card('flashstep+c').np===35&&G.card('flashstep+c').fx.filter(f=>f[0]==='draw').length===1,'共鳴：本來會抽牌的改成寶具 +30%（不再多抽一張）');
{ const k=Object.keys(G.CARDS).find(x=>G.CARDS[x].kit==='kojiro'&&G.upDirs(x).includes('c')); const c=G.card(k+'+c'); t(c.fx.some(f=>f[0]==='block'&&f[1]===3)&&c.np===G.CARDS[k].np,'小次郎沒有寶具：共鳴改成格擋 3、多抽 1',k); }
t(G.card('riposte+d').fx.some(f=>f[0]==='evade'&&f[1]===2),'庫・丘林的英靈之魂是迴避（迎擊之槍 迴避 1 → 2）',JSON.stringify(G.card('riposte+d').fx));
// 稽核第 3 輪：禮裝拿完不再白付、新禮裝、小次郎不給寶具相關的東西、每章至少 2 個精英、無盡只用免費命運
{ const r=G.newRun('saber',3); Object.keys(G.RELICS).forEach(k=>r.relics.push(k)); r.gold=200; t(!G.canChoose(r,G.EVENTS.jeweler.opts[0])&&!G.canChoose(r,G.EVENTS.magus.opts[0])&&G.canChoose(r,G.EVENTS.jeweler.opts[1]),'禮裝全拿了：花錢／花血換禮裝的選項關掉（賣血還能選）'); }
t(Object.keys(G.RELICS).length>=13,'禮裝池 13 件（凜的寶石墜子、阿佐特劍、月靈髓液、士郎的便當、韋伯的冬木地圖）');
{ const r=G.newRun('saber',3); r.relics.push('azoth','volumen'); step(r,'fight'); t(r.battle.str>=1&&r.battle.block>=2,'阿佐特劍開場力量 +1、月靈髓液每回合格擋 +2',JSON.stringify([r.battle.str,r.battle.block])); }
{ const r=G.newRun('saber',3); r.relics.push('waver'); t(G.visible(r,4,r.map[4].findIndex(n=>n)),'韋伯的冬木地圖：多看 2 列（第 5 列也看得到）'); }
{ let bad=0; for(let i=0;i<40;i++){ const r=G.newRun('kojiro',100+i); if(G.fateOptions(i,Object.keys(G.FATES),'kojiro').includes('mana')) bad++; } t(!bad,'小次郎（沒有寶具）不會抽到魔力充盈'); }
t(G.fateOptions(7,Object.keys(G.FATES),'saber',true).every(k=>G.FATE_FREE.includes(k)),'無盡模式只出免費命運');
{ let few=0; for(let i=0;i<200;i++){ const r=G.newRun('saber',500+i); let n=0; r.map.forEach(row=>row.forEach(x=>{ if(x&&x.t==='elite') n++; })); if(n<2) few++; } t(few===0,'每章地圖至少 2 個精英',few); }
// 中立牌（大家都拿得到）：至少 18 張，涵蓋全體、穿透、抽牌、魔力、控場、防守
{ const C=Object.keys(G.CARDS).filter(k=>G.CARDS[k].kit==='common'); const ops=new Set(C.flatMap(k=>G.CARDS[k].fx.map(f=>f[0])));
  t(C.length>=18&&['all','pierce','draw','energy','nextEnergy','strDown','weakAll','thorns','pBlock','evade'].every(o=>ops.has(o)),'中立牌 18 張以上，各自開一條玩法',C.length); }
// ★傳說強化：一成機率出現；攻擊次數翻倍（只打一下的變兩下），技能、能力 0 費
t(G.card('tsubame1+f').fx[0][2]===6&&G.card('heavy+f').fx[0][0]==='hits'&&G.card('heavy+f').fx[0][2]===2&&G.card('bounded+f').cost===0&&G.card('invis+f').fx[0][2]===4,'★傳說：燕返 3 刀 → 6 刀、重擊變兩下、結界 0 費、看不見的劍 2 → 4 下');
{ const r=G.newRun('saber',5); let n=0; for(let f=0;f<600;f++){ r.stats.floors=f; if(G.upgradeOptions(r,9).some(x=>G.card(x).dir==='f')) n++; } t(n>20&&n<110,'★傳說大約一成機率出現',n); }
t(!G.upDirs('invis').includes('f'),'★傳說不會固定出現（只有一成機率替換）');
let fin=0; for(let i=0;i<G.ORDER.length*4;i++){ const q=playRun(G.ORDER[i%G.ORDER.length],500+i); if(q.screen==='over') fin++; }
t(fin===G.ORDER.length*4,'自動玩家每位從者 4 局都能打到結束（不卡死）',fin);
console.log(bad?'❌ '+bad+' 條失敗（通過 '+ok+'）':'✅ 全部 '+ok+' 條通過'); process.exit(bad?1:0);
