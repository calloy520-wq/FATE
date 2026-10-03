// 引擎測試：node tools/game_test.js
const G=require('./game.js'); const {playRun}=require('./sim.js');
const fs=require('fs'), path=require('path');
const SRC=fs.readFileSync(path.join(process.env.GAS_DIR||path.join(__dirname,'..','gas'),'Game.html'),'utf8');   // 沒匯出的資料（遭遇表）與全文掃描用
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('  ✅ '+l);} else {bad++;console.log('  ❌ '+l+(x!==undefined?'  '+String(x).slice(0,240):''));} };
const J=o=>JSON.parse(JSON.stringify(o));
// 把下一步能走的格子都設成 t 再走進去（地圖是隨機分岔路，測試不管路線）
const step=(r,t)=>{ r.screen='map'; G.reachable(r).forEach(c=>{ r.map[r.floor][c].t=t; }); return G.go(r,G.reachable(r)[0]); };
// 造一場乾淨的戰鬥：who 的第一層，敵人換成 n 隻 hp 血、不會動的木樁（預設用青璃：被動只在開場貼符，木樁會蓋掉）
function arena(who='qingli',n=1,hp=50,seed=7){
  const r=G.newRun(who,seed); r.flat=true; r.relics=[]; step(r,'fight'); const b=r.battle;   // flat：不套根骨，只測卡牌機制
  while(b.enemies.length<n) b.enemies.push(J(b.enemies[0]));
  b.enemies=b.enemies.slice(0,n);
  b.enemies.forEach((e,i)=>{ Object.assign(e,{key:'d'+i,id:'zhiren',name:'木樁'+i,hp,maxHp:hp,block:0,str:0,weak:0,vuln:0,poison:0,petrify:0,stun:0,lives:0,intent:{n:'發呆',fx:[]}}); });
  b.hand=[]; b.swords=0; b.kraken=0; b.energy=3; b.block=0; b.firstAtk=false; b.log=[];
  return r;
}
const E=(r,i=0)=>r.battle.enemies[i];
const swords=(r,n)=>{ const b=r.battle; b.swords=n; b.hand=b.hand.filter(x=>x!=='sword'); if(n) b.hand.unshift('sword'); };   // 飛劍疊成一張 ×N
const SW=r=>r.battle.hand.filter(x=>x==='sword').length<=1?(r.battle.swords||0):-1;
const playId=(r,id,tg=0)=>{ r.battle.hand.push(id); return G.play(r,r.battle.hand.length-1,tg); };

console.log('── 基本');
let run=G.newRun('qingli',7);
t(run.hp===G.SERVANTS.qingli.hp&&run.deck.length===10&&run.map.length===12&&run.seals===1&&run.pills.length===1&&run.pills.every(k=>G.PILLS[k])&&G.BOSS_POOL[1].includes(run.bosses[0])&&G.BOSS_POOL[2].includes(run.bosses[1])&&run.bosses[0]!==run.bosses[1]&&run.gold===60&&run.v===4,'開局：生命照體魄、10 張牌、12 列地圖、1 枚師門玉符、1 顆丹藥、60 金、兩章各抽一位魔王');
t(G.ORDER.length===5&&G.ORDER.every(k=>G.SERVANTS[k]&&G.CARDS[G.SERVANTS[k].sig]&&G.CARDS[G.SERVANTS[k].sig].kit===k),'5 位女修，每位的招牌牌都存在、是自己的');
t(G.ORDER.every(k=>Object.keys(G.CARDS).filter(c=>G.CARDS[c].kit===k).length>=9),'每位至少 9 張專屬牌');
t(Object.keys(G.CARDS).every(k=>G.CARDS[k].fx.concat((G.CARDS[k].up&&G.CARDS[k].up.fx)||[]).every(f=>G.OPS[f[0]]&&G.FX_TEXT[f[0]])),'每個卡牌效果（含強化後）都有程式與說明');
t(Object.keys(G.CARDS).every(k=>G.CARDS[k].type==='curse'||G.CARDS[k].fx.concat((G.CARDS[k].up&&G.CARDS[k].up.fx)||[]).every(f=>G.SHORT[f[0]])),'每個卡牌效果都有卡面簡短寫法（SHORT）');
t(G.ORDER.every(k=>G.SERVANTS[k].np&&G.SERVANTS[k].np.fx.length&&G.SERVANTS[k].np.fx.every(f=>G.OPS[f[0]]&&G.FX_TEXT[f[0]])),'每位都有神通，效果都有程式與說明');
t(G.ORDER.every(k=>G.ASC_SVT[k]&&G.ASC_SVT[k].length===4&&G.ASC_SVT[k].flat().every(f=>G.OPS[f[0]]&&G.FX_TEXT[f[0]])),'每位的境界效果都有程式與說明');
t(Object.keys(G.CARDS).every(k=>!G.CARDS[k].up||(G.card(k+'+')&&G.cardText(k+'+')!==undefined)),'每張能強化的牌強化後都讀得到');
const nodes=row=>run.map[row].filter(n=>n);
t(G.reachable(run).length>=3&&nodes(0).every(n=>n.t==='fight')&&nodes(11).length===1&&nodes(11)[0].t==='boss'&&nodes(10).every(n=>n.t==='rest'),'入口至少三個、第一列都是戰鬥、倒數第二列休息、最後是魔王');
t(G.ORDER.every(k=>{ const q=G.newRun(k,77); return q.map.every((row,r)=>row.every((n,c)=>!n||r===11||n.next.every(c2=>q.map[r+1][c2]))) && q.map.some(row=>row.some(n=>n&&n.t==='shop')); }),'地圖每一條線都接到下一列的格子；每章至少一間商店');
t(G.ORDER.every(k=>{ const q=G.newRun(k,5); for(let r=0;r<10;r++) for(let c=0;c<4;c++){ const a=q.map[r][c], b2=q.map[r][c+1]; if(a&&b2&&a.next.includes(c+1)&&b2.next.includes(c)) return false; } return true; }),'路線不會交叉');
t(G.visible(run,0,G.reachable(run)[0])&&G.visible(run,2,nodes(2).length?run.map[2].findIndex(n=>n):0)&&!G.visible(run,5,run.map[5].findIndex(n=>n))&&G.visible(run,11,2),'迷霧：看得到接下來 3 列與魔王，更遠的看不到');
step(run,'fight'); t(run.screen==='battle'&&run.battle.hand.length===5+(G.statsOf(run).agi?1:0)&&run.battle.energy===3,'進戰鬥：抽 5 張（身法 A 多 1）、3 點靈力');

let r=arena(); r.battle.hand=['atk']; let x=G.play(r,0,0);
t(x.ok&&E(r).hp===44&&r.battle.energy===2&&r.battle.np===0&&r.battle.discard.includes('atk'),'攻擊：6 傷、扣 1 靈力、進棄牌堆（出牌本身不累積神通）',E(r).hp);
r.battle.energy=0; r.battle.hand=['atk']; t(!G.play(r,0,0).ok,'靈力不夠不能出');
r=arena(); E(r).vuln=1; playId(r,'atk'); t(E(r).hp===41,'敵人易傷：6→9',E(r).hp);
r=arena(); r.battle.weak=1; playId(r,'atk'); t(E(r).hp===46,'自己虛弱：6→4',E(r).hp);
r=arena('qingli',2); r.battle.hand=['atk']; x=G.play(r,0,-1); t(!x.ok&&x.needTarget,'兩個敵人時單體牌要選目標');
r=arena(); E(r).intent={n:'砍',fx:[['atk',10]]}; r.battle.block=4; let hp=r.hp; G.endTurn(r);
t(hp-r.hp===6&&r.battle.turn===2&&r.battle.hand.length===5,'敵人打 10、格擋 4 → 扣 6；新回合重抽',hp-r.hp);
r=arena('qingli',2,70); r.battle.np=100; G.noble(r,0); t(r.battle.enemies.every(e=>e.hp===70-38&&e.petrify===2),'青璃神通天羅地網：全體 38＋全體定身 2',JSON.stringify(r.battle.enemies.map(e=>[e.hp,e.petrify])));
t(!G.noble(arena(),0).ok,'量表沒滿不能放神通');
// 丹藥：戰鬥中隨時吃、不限次數，吃了就沒了
{ const q=arena(); q.pills=['juling','dunxing','tongshen']; const hl=q.battle.hand.length; t(G.usePill(q,0).ok&&q.battle.energy===5&&q.battle.hand.length===hl+2&&q.pills.length===2,'聚靈丹：靈力 +2、抽 2；吃了就少一顆');
  E(q).intent={n:'砍',fx:[['atk',20,3]]}; const h=q.hp; t(G.usePill(q,0).ok,'同一回合可以連吃'); G.endTurn(q); t(q.hp===h,'遁形丹：這回合的攻擊全部落空',h-q.hp);
  E(q).intent={n:'砍',fx:[['atk',5]]}; const h2=q.hp; G.endTurn(q); t(q.hp<h2,'遁形丹下一回合就沒有了');
  q.battle.np=0; t(G.usePill(q,0).ok&&q.battle.np===50&&!q.pills.length,'通神丹：神通量表 +50%'); t(!G.usePill(q,0).ok,'沒有丹藥就吃不了'); }
{ const q=arena(); q.pills=['huichun','jingang','dali','shigu','qingxin']; q.hp=10; G.usePill(q,0); t(q.hp===10+Math.round(q.maxHp*0.3),'回春丹：回復三成最大生命');
  G.usePill(q,0); t(q.battle.block===15,'金剛丹：格擋 +15'); G.usePill(q,0); t(q.battle.str===2,'大力丹：力量 +2'); G.usePill(q,0); t(E(q).vuln===2&&E(q).weak===1,'蝕骨散：全體易傷 2、虛弱 1');
  q.battle.hand=['mud','sin','atk_qingli']; G.usePill(q,0); t(!q.battle.hand.some(x=>G.card(x).type==='curse')&&q.battle.exhaust.includes('mud')&&q.battle.exhaust.includes('sin'),'清心丹：手上的妨礙牌、詛咒全部消耗'); }
{ const q=arena(); q.pills=[]; q.pillSlots=3; t(G.gainPill(q,'dali')&&G.gainPill(q,'dali')&&G.gainPill(q,'dali')&&!G.gainPill(q,'dali')&&q.pills.length===3,'丹藥袋最多 3 顆，滿了拿不下'); }
// 師門玉符：整局一枚，戰鬥中捏碎＝生命回滿
{ const q=arena(); q.hp=10; t(G.seal(q,'heal').ok&&q.hp===q.maxHp&&q.seals===0,'捏碎師門玉符：生命回滿'); q.hp=10; t(!G.seal(q,'heal').ok,'玉符只有一枚'); }
{ const q=arena(); t(!G.seal(q,'heal').ok&&q.seals===1,'生命滿的時候不能捏玉符'); t(!G.seal(q,'all').ok,'玉符不再有全力以赴、土遁、解放神通'); }

console.log('── 蘇凌霜（飛劍）');
r=G.newRun('shuang',3); step(r,'fight'); t(SW(r)===3&&r.battle.hand.length===6,'凌霜 御劍訣：開戰先祭出 2 把＋回合開始 1 把（疊成一張）＋照常抽 5',SW(r));
r=arena('shuang'); r.battle.hand=['project','broken']; G.play(r,0,0); t(SW(r)===2&&r.battle.hand.filter(x=>x==='sword').length===1,'祭劍：2 把飛劍疊成一張「×2」');
G.play(r,r.battle.hand.indexOf('broken'),0); t(!r.battle.hand.includes('sword')&&SW(r)===0&&E(r).hp===36,'劍氣迸裂：引爆 2 把，每把全體 7',E(r).hp);
r=arena('shuang'); r.battle.np=100; G.noble(r,0); t(r.battle.hand.length===1&&SW(r)===3&&r.battle.ubw===2&&r.battle.projUp===2&&/造成 7 傷害/.test(G.cardText('sword',r)),'萬劍歸宗：3 把飛劍（疊成一張）、之後 2 回合、飛劍 7 傷');
t(E(r).hp===50-(6+2*3),'萬劍歸宗：展開時全體 6＋每把劍 2',E(r).hp); G.play(r,0,0); t(E(r).hp===38-7,'飛劍 5+2＝7',E(r).hp);
t(SW(r)===2&&r.battle.hand.includes('sword'),'出一把飛劍：還有就留在手上，數字 -1'); G.endTurn(r); t(SW(r)===6&&!r.battle.discard.includes('sword')&&!r.battle.exhaust.includes('sword'),'囤劍：沒用完的 2 把留著，下回合再 3 把（加被動 1 把）＝6 把',SW(r));
{ const q=arena('shuang'); swords(q,7); G.endTurn(q); t(SW(q)===5+1,'飛劍回合結束最多留 5 把（再加回合開始的 1 把）',SW(q)); }
{ const q=arena('shuang'); q.battle.hand=Array(9).fill('atk_shuang'); playId(q,'project'); q.battle.energy=3; t(SW(q)===2&&q.battle.hand.length===10,'飛劍那一格不算手牌上限（手上 9 張照樣拿得到）'); q.battle.draw=['atk','atk']; G.endTurn(q); t(q.battle.hand.filter(x=>x!=='sword').length<=10,'手牌上限照樣是 10（不含飛劍）');
  playId(q,'project'); for(let k=0;k<6;k++){ q.battle.energy=3; playId(q,'project'); } t(SW(q)===10,'飛劍最多 10 把',SW(q)); }
{ const q=arena('shuang'); q.hp=99; q.battle.hand=Array(9).fill('worm'); swords(q,3); E(q).intent={n:'寄生',fx:[['plant','worm',1]]}; G.endTurn(q); t(q.battle.hand.filter(x=>x==='worm').length===10,'手上 9 張（保留）＋飛劍：塞進來的牌照樣進得了手牌（劍那格不佔位）',q.battle.hand.filter(x=>x==='worm').length); }
{ const q=arena(); swords(q,2); G.endTurn(q); t(SW(q)===0&&!q.battle.hand.includes('sword'),'不是凌霜：飛劍回合結束就消失'); }
r=arena('shuang'); r.battle.hand=['hrunting']; swords(r,2); G.play(r,1,0); t(E(r).hp===50-(8+3*2)&&SW(r)===2,'飛劍追魂：手上每把飛劍 +3，劍不消耗',E(r).hp);
r=arena('shuang'); r.battle.hand=['rhoaias']; swords(r,1); G.play(r,1,0); t(r.battle.block===9,'劍陣護體：格擋 6＋劍×3');
r=arena('shuang'); playId(r,'analysis'); r.battle.hand=[]; swords(r,1); G.play(r,0,0); t(E(r).hp===44&&SW(r)===0&&!r.battle.hand.includes('sword'),'淬劍：飛劍 5＋1；最後一把用完卡就消失',E(r).hp);
t(/現在 11/.test(G.cardText('hrunting',(()=>{ const q=arena('shuang'); swords(q,1); return q; })())),'說明會標出現在的數字（飛劍追魂 8＋3＝11）');
{ const q=arena('shuang'); swords(q,2); t(G.cardShort('hrunting',q).startsWith('⚔14'),'戰鬥中簡短說明照資源算好數字（飛劍追魂 8＋2×3）',G.cardShort('hrunting',q)); }
{ const q=arena('shuang',1,99); swords(q,2); playId(q,'kakuyoku'); t(E(q).hp===99-(5+2)*3,'劍浪三疊：手上 2 把飛劍 → (5+2)×3（劍不消耗）',E(q).hp); t(SW(q)===2,'劍浪三疊不用掉飛劍'); }
{ const q=G.newRun('shuang',5); step(q,'fight'); q.battle.swords=2; const inb=G.cardShort('hrunting',q); q.screen='reward'; t(/\+3\/劍/.test(G.cardShort('hrunting',q))&&!/\+3\/劍/.test(inb),'選牌畫面卡面寫「＋3/劍」看得出加成；戰鬥中才照現在的劍數算好',G.cardShort('hrunting',q)+' / '+inb); }

console.log('── 顧青璃（定身）');
r=G.newRun('qingli',3); step(r,'fight'); t(r.battle.enemies.every(e=>e.petrify===1),'青璃 鎮魂符：開場全體定身 1');
r=arena(); playId(r,'mystic'); t(E(r).petrify===2&&E(r).weak===1,'定身符：定身 2＋虛弱');
playId(r,'chain'); t(E(r).stun===1&&E(r).petrify===0,'累積到 3 層：動彈不得、層數歸零');
E(r).intent={n:'砍',fx:[['atk',30]]}; hp=r.hp; G.endTurn(r); t(r.hp===hp&&E(r).stun===0,'被定住的敵人跳過這回合',hp-r.hp);
r=arena(); E(r).petrify=2; playId(r,'stare'); t(E(r).hp===40,'破邪符：4＋定身 2×3＝10',E(r).hp);
r=arena('qingli',2); r.hp=30; playId(r,'bloodfort'); t(r.battle.enemies.every(e=>e.hp===44)&&r.hp===36,'化煞陣：全體 6、回復一半（6）',r.hp);
r=arena(); E(r).petrify=2; playId(r,'shatter'); t(E(r).hp===50-(6+7*2)&&E(r).petrify===1,'五雷轟頂：引爆定身符換傷害，留下一半的符',E(r).hp);
r=arena(); E(r).stun=1; playId(r,'kick'); t(E(r).hp===30,'掌心雷：動彈不得的目標 8＋12',E(r).hp);
r=arena(); playId(r,'gorgon'); t(E(r).petrify===1,'能力牌打出當下先生效一次：符籙通神全體定身 1'); G.endTurn(r); t(E(r).petrify===2,'符籙通神：之後每回合全體定身 1');
r=arena(); playId(r,'monstrous'); t(r.battle.tstr===2&&E(r).petrify===1,'大力符：本回合力量 +2、定身 1');
r=arena(); E(r).petrify=2; E(r).intent={n:'砍',fx:[['atk',10]]}; t(G.intentDmg(r,E(r),E(r).intent.fx[0])===8,'鎮魂符的重壓：定身 2 層，攻擊 -2（每層 -1），預告也照算');
hp=r.hp; G.endTurn(r); t(hp-r.hp===8,'實際也只受到 8',hp-r.hp);
{ const q=arena('shuang'); E(q).petrify=2; E(q).intent={n:'砍',fx:[['atk',10]]}; t(G.intentDmg(q,E(q),E(q).intent.fx[0])===10,'別人沒有符的重壓'); }
t(G.SERVANTS.qingli.sig==='chain'&&['chain','nails','kick','monstrous','bloodfort','mystic'].every(k=>G.CARDS[k]&&G.CARDS[k].kit==='qingli'),'捆妖索（招牌牌）、符針、掌心雷、大力符、化煞陣、定身符都是青璃的');

console.log('── 白辰（阿白）');
r=G.newRun('xiaoman',3); step(r,'fight'); t(r.battle.kraken===5,'白辰 龍之契約：開場阿白 5',r.battle.kraken);
r=arena('xiaoman'); r.battle.kraken=6; playId(r,'blasphemy'); t(E(r).hp===50-11,'龍爪：5＋阿白大小 6',E(r).hp);
r=arena('xiaoman'); r.battle.kraken=4; playId(r,'zealot'); t(r.battle.kraken===1&&r.battle.tstr===6,'借龍力：阿白縮小 3 換力量 6');
r.battle.kraken=2; playId(r,'zealot'); t(r.battle.kraken===2&&r.battle.tstr===6,'阿白不夠大就沒效果');
r=arena('xiaoman'); r.battle.kraken=5; E(r).intent={n:'砍',fx:[['atk',8]]}; hp=r.hp; G.endTurn(r); t(E(r).hp===45&&hp-r.hp===4&&r.battle.kraken===1+1,'阿白：回合結束咬 5；被打 8 時替你擋一半 4 並縮小；下回合長大 1',JSON.stringify([E(r).hp,hp-r.hp,r.battle.kraken]));
r=arena('xiaoman'); E(r).intent={n:'咒',fx:[['weak',3]]}; G.endTurn(r); t(r.battle.weak===0,'白辰天不怕地不怕：不會虛弱');
{ const q=arena(); E(q).intent={n:'咒',fx:[['weak',2],['vuln',2]]}; G.endTurn(q); t(q.battle.weak>0&&q.battle.vuln>0,'別人照樣會被施加虛弱、易傷'); }
r=arena('xiaoman',2); r.battle.kraken=9; playId(r,'feastdeep'); t(r.battle.kraken===4&&r.battle.enemies.every(e=>e.hp===23),'全力龍息：大小 9 的阿白全體 27，阿白縮小一半',E(r).hp);
r=arena('xiaoman'); r.battle.kraken=5; playId(r,'abyss'); t(r.battle.kraken===10,'龍族血脈：阿白翻倍');
r=arena('xiaoman'); hp=r.hp; playId(r,'sacrifice'); t(r.hp===hp-2&&r.battle.kraken===4,'賞你一口靈氣：失去 2 生命、阿白 +4');
r=arena('xiaoman'); r.hp=2; playId(r,'sacrifice'); t(r.hp===1,'自傷不會把自己弄死');
r=arena('xiaoman',3); r.battle.kraken=15; r.battle.enemies.forEach((e,i)=>{ e.hp=[30,8,20][i]; e.intent={n:'守',fx:[['block',0]]}; }); G.endTurn(r); t(r.battle.enemies[1].hp===0&&r.battle.enemies[2].hp===5&&r.battle.enemies[0].hp===30,'阿白咬生命最少的敵人；大小 15 咬兩口',JSON.stringify(r.battle.enemies.map(e=>e.hp)));
{ const q=arena('xiaoman'); q.battle.kraken=12; t(G.krakenBites(q.battle)===2,'阿白大小 12 就咬兩口'); }
// 阿白整局成長：每打贏 2 場，之後每場開場 +1，最多 +6
{ const q=G.newRun('xiaoman',3); step(q,'fight'); const k0=q.battle.kraken; const win=()=>{ q.battle.enemies.forEach(e=>e.hp=0); G.checkEnd(q); };
  win(); t(!q.krakenFed,'打贏 1 場還不長'); q.screen='map'; step(q,'fight'); win(); t(q.krakenFed===1,'打贏 2 場：阿白整局 +1',q.krakenFed);
  q.krakenWins=40; q.screen='map'; step(q,'fight'); win(); t(q.krakenFed===6,'整局成長最多 +6',q.krakenFed); q.screen='map'; step(q,'fight'); t(q.battle.kraken===k0+6,'開場阿白照成長算',q.battle.kraken);
  const o=G.newRun('qingli',3); step(o,'fight'); o.battle.enemies.forEach(e=>e.hp=0); G.checkEnd(o); t(!o.krakenFed,'只有白辰的阿白會成長'); }

console.log('── 赤練（血修）');
r=arena('chilian'); r.hp=r.maxHp-27; playId(r,'divine'); t(E(r).hp===50-(10+3*2),'搏命一擊：少 27 生命 → 10＋3×2',E(r).hp);
r=arena('chilian'); r.hp=20; playId(r,'godhand'); G.endTurn(r); t(r.battle.str===1,'積怨：生命低於一半時每回合力量 +1');
r=arena('chilian'); t(r.lives===1,'赤練 不滅血體：整趟 1 條備用的命'); r.hp=5; E(r).intent={n:'砍',fx:[['atk',40]]}; G.endTurn(r); t(r.hp===Math.round(G.SERVANTS.chilian.hp*0.5)&&r.screen==='battle'&&r.lives===0&&r.battle.str===2&&r.trialStr===2,'倒下以五成血站起來、力量 +2、命用掉',JSON.stringify([r.hp,r.battle.str]));
const tr=J(r); tr.battle=null; tr.screen='map'; step(tr,'fight'); t(tr.battle.str===2,'不滅血體換來的力量整趟保留（下一場開場就有）',tr.battle.str);
const rk=arena(); rk.lives=1; rk.hp=5; E(rk).intent={n:'砍',fx:[['atk',40]]}; G.endTurn(rk); t(rk.hp===Math.round(rk.maxHp*0.2)&&!rk.trialStr,'別人的備用命（九轉還魂丹等）照舊兩成、不加力量');
r.hp=5; r.lives=0; E(r).intent={n:'砍',fx:[['atk',40]]}; G.endTurn(r); t(r.screen==='over','命用完就真的倒下');
{ const q=G.newRun('chilian',3); step(q,'fight'); q.battle.enemies.forEach(e=>{ e.intent={n:'守',fx:[['block',0]]}; e.hp=999; }); const h=q.hp; G.endTurn(q); t(q.hp===h-2,'赤練 血煞反噬：每回合開始失去 2 生命',h-q.hp);
  q.hp=1; q.battle.enemies.forEach(e=>{ e.intent={n:'守',fx:[['block',0]]}; }); G.endTurn(q); t(q.hp===1&&q.screen==='battle','血煞反噬不會讓自己倒下'); }
{ const q=arena('chilian'); const h=q.hp; G.endTurn(q); t(q.hp===h,'測試用的 flat 不扣血煞反噬',h-q.hp); }
r=G.newRun('qingli',3); step(r,'fight'); r.battle.enemies.forEach(e=>{ e.intent={n:'守',fx:[['block',0]]}; e.hp=999; }); hp=r.hp; G.endTurn(r); t(r.hp===hp,'其他人不扣');

console.log('── 阿朵（蠱）');
r=arena('aduo'); r.battle.turn=2; playId(r,'knives'); t(E(r).hp===46&&E(r).poison===4,'阿朵 蠱針：4＋毒 4'); E(r).block=20; G.endTurn(r); t(E(r).hp===42&&E(r).poison===3,'毒：回合開始穿透 4、再減 1',E(r).hp);
r=arena('aduo'); r.battle.turn=2; E(r).poison=1; playId(r,'assassinate'); t(E(r).hp===30,'蠱發：中毒時 10＋10',E(r).hp);
r=arena('aduo'); playId(r,'atk'); t(E(r).hp===41,'阿朵 隱蠱：第一回合攻擊 ×1.5（6→9）',E(r).hp); r.battle.turn=2; playId(r,'atk'); t(E(r).hp===35,'第二回合照常 6',E(r).hp);
{ const q=arena(); playId(q,'atk'); t(E(q).hp===44,'別人第一回合沒有隱蠱'); }
r=arena('aduo'); r.battle.turn=2; playId(r,'throwdirk'); t(E(r).hp===41&&G.SERVANTS.aduo.sig==='throwdirk','銀針（招牌牌）：3×3（有破綻每擊 +1）',E(r).hp);
r=arena('aduo'); E(r).poison=4; playId(r,'plague'); t(E(r).poison===8,'催蠱：毒加倍');
r=arena('aduo'); E(r).hp=24; r.battle.np=100; G.noble(r,0); t(E(r).hp===0,'萬蠱噬心：五成以下直接倒下');
r=arena('aduo'); r.battle.np=100; G.noble(r,0); t(E(r).hp===0,'萬蠱噬心：一般敵人抵抗不了，直接倒下',E(r).hp);
r=arena('aduo'); E(r).id='jianmo'; r.battle.np=100; G.noble(r,0); t(E(r).hp===25,'萬蠱噬心：精英血多時咬不死，穿透 25',E(r).hp);
r=arena('aduo'); E(r).id='jianmo'; E(r).hp=24; r.battle.np=100; G.noble(r,0); t(E(r).hp===0,'萬蠱噬心：精英生命五成以下咬死');
r=arena('aduo'); E(r).id='huyao'; E(r).hp=10; r.battle.np=100; G.noble(r,0); t(E(r).hp===0&&E(r).maxHp===50,'萬蠱噬心：魔王就算只剩兩成也咬不死（是被穿透 25 打死的）'); r=arena('aduo'); E(r).id='huyao'; E(r).hp=40; r.battle.np=100; G.noble(r,0); t(E(r).hp===15,'萬蠱噬心：魔王只吃穿透 25',E(r).hp);
r=arena('aduo'); E(r).id='niumo'; E(r).hp=10; E(r).maxHp=100; E(r).lives=1; r.battle.np=100; G.noble(r,0); t(E(r).hp===60&&E(r).lives===0,'魔王不吃噬心、改吃穿透（不死牛魔照樣以六成站起來）',JSON.stringify([E(r).hp,E(r).lives]));
t(G.ORDER.every(k=>Object.keys(G.CARDS).filter(c=>G.CARDS[c].kit===k).every(c=>{ const fx=G.CARDS[c].fx; return !(fx.length===1&&['dmg','all','block','draw'].includes(fx[0][0])) && !(fx.length===2&&fx.every(f=>['dmg','all','block','draw'].includes(f[0]))); })),'專屬牌裡沒有只寫「傷害／全體／格擋／抽牌」的通用牌');

console.log('── 敵人');
t(Object.keys(G.ENEMIES).every(k=>{ const E0=G.ENEMIES[k]; return E0.name&&E0.hp.length===2&&E0.hp[0]<=E0.hp[1]&&E0.moves.length&&E0.moves.every(m=>m.n&&m.fx.length); }),'每個敵人都有名字、生命範圍、招式');
{ const m=SRC.match(/var ENCOUNTERS = (\{[\s\S]*?\});/), ENC=m&&Function('return '+m[1])(); const ids=ENC?Object.keys(ENC).flatMap(k=>ENC[k].flat()):[];
  t(ENC&&['act1easy','act1hard','act2easy','act2hard'].every(k=>ENC[k]&&ENC[k].length)&&ids.every(k=>G.ENEMIES[k]&&!G.ENEMIES[k].elite&&!G.ENEMIES[k].boss)&&ENC&&Object.keys(ENC).every(k=>ENC[k].every(g=>g.length<=3)),'遭遇表的敵人都存在、都是雜兵、一場最多 3 隻',ids.filter(k=>!G.ENEMIES[k]).join()); }
t(G.ELITES.every(k=>G.ENEMIES[k]&&G.ENEMIES[k].elite)&&G.BOSSES.every(k=>G.ENEMIES[k]&&G.ENEMIES[k].boss)&&[1,2].every(a=>G.BOSS_POOL[a].every(k=>G.BOSSES.includes(k))),'精英、魔王、魔王池的 id 都存在且種類正確');
{ const moves=Object.keys(G.ENEMIES).flatMap(k=>G.ENEMIES[k].moves.flatMap(m=>m.fx));
  t(moves.filter(f=>f[0]==='summon').every(f=>G.ENEMIES[f[1]]&&!G.ENEMIES[f[1]].boss),'召喚的援軍都存在');
  t(moves.filter(f=>f[0]==='curse'||f[0]==='plant').every(f=>G.CARDS[f[1]]&&G.CARDS[f[1]].type==='curse'),'塞進牌堆／手牌的都是存在的妨礙牌');
  t(moves.every(f=>['atk','atkP','block','str','weak','vuln','heal','summon','breakBlock','curse','plant','strAll','blockAll','sapEnergy','stealBlock','thornsSelf'].includes(f[0])),'敵人招式的效果都認得'); }
r=arena(); E(r).id='yaodao'; E(r).name='妖道'; E(r).intent=G.ENEMIES.yaodao.moves[0]; G.endTurn(r); t(r.battle.enemies.length===3&&r.battle.enemies.filter(e=>e.id==='zhiren').length===2,'敵方妖道剪紙成兵：召喚 2 隻紙人兵');
r=arena(); E(r).intent={n:'穿',fx:[['atkP',10]]}; r.battle.block=20; hp=r.hp; G.endTurn(r); t(hp-r.hp===10,'穿透攻擊無視格擋',hp-r.hp);
r=arena(); E(r).intent={n:'勾魂筆',fx:[['breakBlock',1],['atk',14]]}; r.battle.block=20; hp=r.hp; G.endTurn(r); t(hp-r.hp===14,'鬼面判官的勾魂筆：先拆掉你的格擋再打',hp-r.hp);
const toBoss=(q,k)=>{ q.boss=k; q.floor=11; q.lane=2; q.path=[]; q.screen='map'; G.go(q,2); return q; };
G.BOSSES.forEach(k=>{ const q=toBoss(G.newRun('qingli',5),k); t(q.battle.kind==='boss'&&q.battle.enemies[0].id===k,'魔王 '+G.ENEMIES[k].name+' 登場'); });
r=toBoss(G.newRun('qingli',11),'niumo'); const hb=r.battle.enemies[0];
hb.hp=5; hb.block=0; r.battle.hand=['heavy']; r.battle.energy=2; G.play(r,0,0); t(hb.hp===Math.round(hb.maxHp*0.6)&&hb.lives===1&&r.screen==='battle','不死牛魔打倒一次：以六成血站起來',hb.hp);
hb.lives=0; hb.hp=1; r.battle.hand=['atk']; r.battle.energy=1; G.play(r,0,0); t(r.screen==='reward'&&r.reward.next==='act2'&&r.reward.gold===Math.round(80*G.statsOf(r).luck),'打倒第一章魔王：獎勵（80 金×氣運），接著第二章');
r.hp=20; G.takeReward(r,-1); t(r.screen==='major'&&r.act===1,'第一章魔王倒下：先選專精或兼修',r.screen); t(!G.chooseMajor(r,'nope')&&G.chooseMajor(r,'master')&&r.mastered&&r.pathPicked,'選專精'); t(r.act===2&&r.floor===0&&r.screen==='map'&&r.boss===r.bosses[1]&&r.hp===20+Math.round((r.maxHp-20)*0.5),'進第二章：新地圖、換魔王、回復一半失去的生命');
step(r,'fight'); t(r.battle.enemies.every(e=>['mingquan','yuanling','shikui','jiangshi','bianfu','mohua','xiexiu','shichong'].includes(e.id)),'第二章換一批敵人');
let s2=toBoss(J(r),r.bosses[1]); s2.battle.enemies.forEach(e=>{e.hp=1;e.lives=0;e.block=0;}); s2.battle.hand=['atk']; s2.battle.energy=1; G.play(s2,0,0);
t(s2.screen==='reward'&&s2.reward.next==='secret','第二章魔王倒下、手上還有玉符：先拿獎勵'); G.takeReward(s2,-1); t(s2.screen==='secret','拿完獎勵：出現隱藏關的入口');
let s3=J(s2); G.secret(s3,false); t(s3.screen==='over'&&s3.win&&!s3.trueEnd,'不進去：一般勝利');
const sealsBefore=s2.seals; G.secret(s2,true); t(s2.act===3&&s2.seals===sealsBefore-1&&s2.boss==='xinmo'&&s2.map.length===3,'捏碎 1 枚玉符進隱藏關：休息→精英→魘',JSON.stringify([s2.act,s2.seals,s2.boss,s2.map.length]));
s2=toBoss(s2,'xinmo'); s2.floor=2; s2.screen='map'; s2.battle=null; G.go(s2,2); s2.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); s2.battle.hand=['atk']; s2.battle.energy=1; G.play(s2,0,0); t(s2.screen==='over'&&s2.trueEnd,'封印魘：真結局');
let s4=toBoss(G.newRun('qingli',12),'huyao'); s4.act=2; s4.seals=0; s4.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); s4.battle.hand=['atk']; s4.battle.energy=1; G.play(s4,0,0); t(s4.screen==='over'&&s4.win,'玉符用完：打倒第二章魔王就直接勝利');

console.log('── 頓悟');
t(G.ORDER.every(k=>G.TALENTS[k]&&G.TALENTS[k].length===2&&G.TALENTS[k].every(tier=>tier.length===2&&tier.every(T=>T.name&&(T.start||[]).concat(T.np||[]).every(f=>G.OPS[f[0]]&&G.FX_TEXT[f[0]])))),'每位兩層、每層兩個頓悟，效果都有程式與說明');
t(G.ORDER.every(k=>G.TALENTS[k].flat().every(T=>!(T.start||[]).some(f=>G.needsTarget([f])))),'開場頓悟不會用到要選目標的效果');
let aw=G.newRun('qingli',31); step(aw,'elite'); aw.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); aw.battle.np=100; G.noble(aw,0);
t(aw.screen==='reward'&&JSON.stringify(aw.reward.awaken)==='["0.0","0.1"]','打贏精英：出現第一層的兩個頓悟');
t(!G.takeReward(aw,-1),'還沒選頓悟不能收下獎勵');
G.awaken(aw,0); t(aw.awaken[0]==='0.0'&&!aw.reward.awaken&&G.takeReward(aw,-1),'選了「'+G.talent(aw,'0.0').name+'」之後才能繼續');
step(aw,'fight'); t(aw.battle.enemies.every(e=>e.petrify===2||e.stun),'符力加持：每場開始再全體定身 1（被動 1＋頓悟 1）',JSON.stringify(aw.battle.enemies.map(e=>e.petrify)));
aw.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); aw.battle.np=100; G.noble(aw,0); t(!aw.reward.awaken,'普通戰鬥不給頓悟'); G.takeReward(aw,-1);
step(aw,'elite'); aw.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); aw.battle.np=100; G.noble(aw,0);
t(JSON.stringify(aw.reward.awaken)==='["1.0","1.1"]','第二次精英：第二層');
G.awaken(aw,0); G.takeReward(aw,-1); t(/全體定身 2，格擋 15/.test(G.npText(G.serv(aw).np,aw)),'護身金光：神通追加格擋 15',G.npText(G.serv(aw).np,aw));
step(aw,'elite'); aw.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); aw.battle.np=100; G.noble(aw,0); t(!aw.reward.awaken,'兩層都選完就不再出現');
let hk=G.newRun('chilian',3); hk.awaken=['0.0']; hk.screen='reward'; hk.reward={cards:['atk'],relic:null,awaken:['1.0','1.1']}; G.awaken(hk,1); t(hk.lives===2,'浴血重生：多一條命');
{ const h=G.newRun('chilian',3); const txt=G.talentText(G.talent(h,'1.1'),h); t(/五成/.test(txt),'赤練的多一條命：寫五成生命站起來',txt); }

console.log('── 特殊卡牌');
t(G.ORDER.every(k=>G.pathsOf(k).every(P=>P.cards.filter(c=>G.CARDS[c].rare===k).length===1))&&Object.keys(G.CARDS).some(c=>G.CARDS[c].rare==='common'),'每條主修一張秘傳，另有共通的天書殘頁');
r=arena(); r.battle.hand=['mud']; r.battle.energy=0; x=G.play(r,0,0); t(!x.ok&&r.battle.hand.length===1,'魔氣要 1 靈力才打得掉');
r.battle.energy=1; x=G.play(r,0,0); t(x.ok&&r.battle.energy===0&&r.battle.exhaust.includes('mud')&&r.battle.played===0&&r.battle.np===0,'花 1 靈力打掉魔氣：這場消耗、不算出牌、不加神通');
r=arena(); r.battle.hand=['mud']; hp=r.hp; G.endTurn(r); t(r.hp===hp-2&&r.battle.discard.includes('mud'),'魔氣留在手上：回合結束失去 2 生命',hp-r.hp);
r=arena(); E(r).intent={n:'汙',fx:[['atk',1],['curse','mud',2]]}; G.endTurn(r); t(r.battle.discard.concat(r.battle.hand,r.battle.draw).filter(c=>c==='mud').length===2&&!r.deck.includes('mud'),'敵人塞 2 張魔氣進牌堆，不會留在牌組');
let rr=G.newRun('qingli',8); let seenRare=0, rareOk=true; for(let i=0;i<200;i++){ const q=J(rr); q.rs=i*7919; step(q,'elite'); q.battle.enemies.forEach(e=>{e.hp=0;}); q.battle.enemies[0].hp=1; q.battle.enemies[0].block=0; q.battle.np=100; G.noble(q,0); if(q.reward&&q.reward.cards.some(c=>G.CARDS[c.replace('+','')].rare)){ seenRare++; if(!q.reward.cards.every(c=>{ const d=G.CARDS[c.replace('+','')]; return !d.rare||d.rare==='qingli'||d.rare==='common'; })) rareOk=false; } }
t(seenRare>20&&seenRare<110&&rareOk,'精英獎勵約三成出秘傳，只出自己的或共通的',seenRare);
rr.screen='rest'; const n0=rr.deck.length; t(G.rest(rr,'remove',0)&&rr.deck.length===n0-1&&rr.screen==='map','淨化：從牌組移除一張');
rr.screen='rest'; rr.deck=rr.deck.slice(0,5); t(!G.rest(rr,'remove',0)&&rr.deck.length===5,'牌組至少留 5 張');

console.log('── 讀檔');
t(G.migrate({v:3,who:'saber',hp:50,maxHp:75,deck:['atk_saber'],relics:[],screen:'map'})===null&&G.migrate({v:1,who:'archer',deck:['atk']})===null,'《聖杯之路》的舊局（Fate 角色）讀檔作廢');
t(G.migrate(Object.assign(J(G.newRun('shuang',3)),{v:3}))===null&&G.migrate(J(Object.assign(G.newRun('qingli',3),{who:'medusa'})))===null&&G.migrate(null)===null,'版本太舊、角色不認得的一律作廢');
t(G.migrate({who:'custom',custom:{name:'舊英靈'},deck:['atk']})===null&&!G.makeCustom,'沒有自創角色：舊的自創角色那一局讀檔作廢');
{ const o=J(G.newRun('shuang',3)), m=G.migrate(J(o)); t(m&&m.who==='shuang'&&JSON.stringify(m.deck)===JSON.stringify(o.deck)&&m.v===4,'現在的局存檔來回照樣讀得回來（牌組不變）'); }
{ const o=G.newRun('xiaoman',3); step(o,'fight'); const s=J(o); delete s.battle.kraken; delete s.battle.pRage; delete s.awaken; const m=G.migrate(s); t(m&&m.battle.kraken===0&&m.battle.pRage===0&&Array.isArray(m.awaken)&&G.endTurn(m).ok,'讀檔補上缺的戰鬥欄位，照樣能打'); }
const r10=J(G.newRun('aduo',21)); step(r10,'fight'); const saved=J(r10); x=G.play(saved,0,0); t(x.ok||x.msg,'存檔（JSON）來回後照樣能出牌');

console.log('── 事件・商店・機緣・境界');
{ const KN=['hp','maxHp','healPct','relic','seal','pick','addCard','upRandom','cards','commons','fight','gold','krakenStart','krakenGrow','nextWeak','d20','startFx']; const okFx=l=>l.every(f=>KN.includes(f[0])&&(f[0]!=='d20'||(typeof f[1]==='number'&&okFx(f[2])&&okFx(f[3]))));
  t(Object.keys(G.EVENTS).every(k=>G.EVENTS[k].opts.length>=2&&G.EVENTS[k].opts.every(o=>okFx(o.fx))),'每個事件至少兩個選項，效果都認得（擲骰的成功／失敗也是）');
  const all=l=>l.flatMap(f=>f[0]==='d20'?all(f[2]).concat(all(f[3])):[f]), fx=Object.keys(G.EVENTS).flatMap(k=>G.EVENTS[k].opts.flatMap(o=>all(o.fx)));
  t(fx.filter(f=>f[0]==='addCard').every(f=>G.card(f[1])),'事件給的牌都存在',fx.filter(f=>f[0]==='addCard'&&!G.card(f[1])).map(f=>f[1]).join());
  t(fx.filter(f=>f[0]==='fight').every(f=>f[1]==='elite'&&(!f[2]||G.ELITES.includes(f[2]))),'事件指定的對手都是精英',fx.filter(f=>f[0]==='fight').map(f=>f[2]).join());
  t(fx.filter(f=>f[0]==='pick').every(f=>['remove','upgrade','transform','copy'].includes(f[1])),'事件的選牌種類都認得'); }
t(Object.keys(G.EVENTS).every(k=>!G.EVENTS[k].who||G.ORDER.includes(G.EVENTS[k].who)),'專屬事件的角色都存在');
t(G.ORDER.every(w=>Object.keys(G.EVENTS).filter(k=>G.EVENTS[k].who===w).length>=2),'每位至少 2 個專屬事件');
t(Array.from({length:40},(_,i)=>{ const q=G.newRun('qingli',500+i); step(q,'event'); return q.event; }).every(id=>!G.EVENTS[id].who||G.EVENTS[id].who==='qingli'),'只會遇到自己的專屬事件（青璃不會遇到白辰的事件）');
let ev=G.newRun('qingli',41); step(ev,'event'); t(ev.screen==='event'&&G.EVENTS[ev.event]&&(!G.EVENTS[ev.event].act||G.EVENTS[ev.event].act===1),'事件格：抽一個這一章的事件');
ev.event='church'; let hp0=ev.hp, d0=ev.deck.length; G.choose(ev,0); t(ev.hp===hp0-6&&ev.screen==='pick'&&ev.pending[0]==='remove','荒廢的山神廟：先扣血，再選一張牌移除');
G.pickCard(ev,ev.deck.indexOf('def_qingli')); t(ev.deck.length===d0-1&&ev.screen==='map','選完回地圖');
ev.screen='event'; ev.event='magus'; ev.hp=10; t(!G.canChoose(ev,G.EVENTS.magus.opts[0])&&!G.choose(ev,0).ok,'生命不夠付代價的選項不能選');
ev.screen='event'; ev.event='resonance'; ev.seals=0; t(!G.canChoose(ev,G.EVENTS.resonance.opts[0]),'沒有玉符就不能捏碎玉符');
ev.hp=50; ev.screen='event'; ev.event='echo'; G.choose(ev,0); t(ev.screen==='reward'&&ev.reward.cards.length===3&&ev.reward.cards.every(c=>c.endsWith('+')&&G.CARDS[c.slice(0,-1)].kit==='qingli'),'前人的殘影：三張強化過的專屬牌選一');
G.takeReward(ev,0); t(ev.screen==='map','選完回地圖');
let sh=G.newRun('qingli',42); sh.gold=300; step(sh,'shop'); t(sh.screen==='shop'&&sh.shop.cards.length>=4&&sh.shop.cards.slice(0,3).every(c=>G.CARDS[c.id.replace('+','')].kit==='qingli'),'商店：至少三張自己的專屬牌');
let price=G.priceOf(sh,sh.shop.cards[0]), dl=sh.deck.length; t(G.buy(sh,'card',0).ok&&sh.gold===300-price&&sh.deck.length===dl+1&&!G.buy(sh,'card',0).ok,'買牌：扣錢、加進牌組、同一張不能再買');
let rp=G.removePrice(sh); t(G.buy(sh,'remove',0).ok&&sh.gold===300-price-rp&&!G.buy(sh,'remove',0).ok&&G.removePrice(sh)===rp+25,'移除卡片：每間店一次，下次貴 25');
sh.gold=0; t(!G.buy(sh,'relic').ok,'錢不夠買不起'); G.leaveShop(sh); t(sh.screen==='map','離開商店');
let gr=arena(); gr.battle.enemies.forEach(e=>{e.hp=1;}); gr.battle.np=100; const g0=gr.gold; G.noble(gr,0); G.takeReward(gr,-1); t(gr.gold>=g0+12&&gr.gold<=g0+18,'打贏一般戰鬥得到 12～18 金',gr.gold-g0);
t(G.fateOptions().length===Object.keys(G.FATES).filter(k=>!G.FATES[k].lock).length&&Object.keys(G.FATES).every(k=>!('cost' in G.FATES[k])),'一開始就開放的機緣全部能選（沒有貨幣；鎖起來的要達成目標）');
let ft=G.newRun('qingli',6,{fate:'light'}); t(ft.deck.length===8&&ft.fate==='light','輕裝上陣：少 1 張攻擊 1 張防禦');
ft=G.newRun('qingli',6,{fate:'merchant'}); ft.gold=100; step(ft,'shop'); t(G.removePrice(ft)===0&&G.priceOf(ft,{price:100})===75,'商人的眷顧：七五折、第一次移除免費'); G.buy(ft,'remove',0); t(G.removePrice(ft)===Math.round(60*0.75),'免費用掉之後是原價七五折'); ft.removed=3; t(G.removePrice(ft)===Math.round(60*0.75),'商人的眷顧：移除之後也不漲價');
ft=G.newRun('qingli',6,{fate:'mana'}); step(ft,'fight'); t(ft.battle.np===30,'靈氣充盈：神通量表從 30% 開始',ft.battle.np);
let as=G.newRun('qingli',6,{asc:5}); t(as.maxHp===G.SERVANTS.qingli.hp+8&&as.deck.includes('breaker'),'境界 V：生命 +8、開局帶秘傳');
step(as,'fight'); t(as.battle.enemies.every(e=>e.petrify>=1||e.stun)&&as.battle.str>=1&&as.battle.block>=6,'青璃境界 II／III：開場力量 +1、格擋 6（被動照樣全體定身）');
t(G.npFx(as,G.SERVANTS.qingli.np).length===G.SERVANTS.qingli.np.fx.length+1&&/全體定身 2，全體定身 2/.test(G.npText(G.serv(as).np,as)),'境界 IV：神通追加全體定身 2',G.npText(G.serv(as).np,as));
t(G.ORDER.every(k=>G.ASC_SVT[k]&&[1,2,3,4,5,6].every(lv=>G.ascText(k,lv))),'5 位每一級境界都有自己的說明');
t(G.REALMS.length===7&&G.REALMS.slice(1).every(x=>x),'境界名稱 I～VI 都有');
t(G.ORDER.every(k=>G.ASC_SVT[k].slice(0,2).every(fx=>!G.needsTarget(fx))),'開場效果不會用到要選目標的效果');
let as1=G.newRun('xiaoman',6,{asc:3}); step(as1,'fight'); t(as1.battle.kraken===5+3&&as1.battle.str===1,'白辰境界 II／III：開場阿白再 +3（被動已有 5）、力量 +1',JSON.stringify([as1.battle.kraken,as1.battle.str]));
t(!G.SVT_COST&&!G.crystalsFor&&!G.FATE_SLOT2&&G.ASC.length===6,'局外沒有貨幣：沒有解鎖價、沒有靈石（境界暫停但引擎留著 6 級）');

// 事件：扣血移除兩張、變形、複製、中立牌
ev=G.newRun('qingli',41); step(ev,'event'); ev.event='purge'; hp0=ev.hp; d0=ev.deck.length; G.choose(ev,0); t(ev.hp===hp0-12&&ev.screen==='pick'&&ev.pending.join()==='remove,remove','苦修洞：失去 12 生命，移除兩張');
G.pickCard(ev,0); G.pickCard(ev,0); t(ev.deck.length===d0-2&&ev.screen==='map','移除兩張後回地圖');
ev=G.newRun('qingli',41); step(ev,'event'); ev.event='throne'; G.choose(ev,0); G.pickCard(ev,0); t(ev.deck[0]!=='atk_qingli'&&G.CARDS[G.baseId(ev.deck[0])].kit==='qingli'&&G.isUp(ev.deck[0]),'祖師的回響：選的牌變成一張強化過的專屬牌',ev.deck[0]);
ev=G.newRun('qingli',41); step(ev,'event'); ev.event='mirror'; d0=ev.deck.length; G.choose(ev,0); G.pickCard(ev,ev.deck.indexOf('chain')); t(ev.deck.length===d0+1&&ev.deck[ev.deck.length-1]==='chain','鏡中的自己：複製一張（招牌牌）');
ev=G.newRun('qingli',41); step(ev,'event'); ev.event='storehouse'; G.choose(ev,0); t(ev.screen==='reward'&&ev.reward.cards.length===3&&ev.reward.cards.every(c=>G.CARDS[c].kit==='common'),'荒廢的藏經閣：從三張中立牌選一張');
ev=G.newRun('qingli',41); step(ev,'event'); ev.event='castle'; ev.gold=30; t(!G.canChoose(ev,G.EVENTS.castle.opts[0])&&!G.canChoose(ev,G.EVENTS.castle.opts[1]),'錢不夠就不能選');
t(Object.keys(G.EVENTS).filter(k=>!G.EVENTS[k].who&&(!G.EVENTS[k].act||G.EVENTS[k].act===1)).length>=16,'第一章至少 16 個通用事件可抽');
// 卡面簡短說明
t(Object.keys(G.CARDS).every(k=>{ const t2=G.cardShort(k); return t2&&!/undefined|\{|null/.test(t2)&&t2.length<=G.cardText(k).length; }),'每張牌都有簡短說明（沒有漏字、比完整說明短）');

// 每位自己的基本牌
t(G.ORDER.every(k=>{ const d=G.newRun(k,3).deck; return d.filter(x=>x==='atk_'+k).length===5&&d.filter(x=>x==='def_'+k).length===(G.pathsOf(k)[0].extra?3:4)&&G.card('atk_'+k).name!=='攻擊'&&G.card('def_'+k).name!=='防禦'; }),'每位開局 5 張自己的攻擊、4 張自己的防禦（主修有 extra 的換掉一張），名字各不相同');
t(G.newRun('qingli',3).deck.includes('mystic'),'青璃開局就有一張定身符');
t(new Set(G.ORDER.map(k=>G.card('atk_'+k).name)).size===G.ORDER.length,'5 位的基本攻擊名字都不一樣');
t(G.ORDER.every(k=>G.card('atk_'+k).fx[0][0]==='dmg'&&G.card('atk_'+k).fx[0][1]===6&&G.card('def_'+k).fx[0][1]===5),'基本牌數字全員一樣（6／5），定位交給根骨');
// 根骨
t(G.ORDER.every(k=>G.PARAMS[k]&&G.PARAMS[k].length===6&&G.PARAMS[k].every(g=>'天地玄黃'.includes(g)))&&G.PARAM_NAMES.length===6,'5 位都有根骨，全用天地玄黃（不用 Fate 的字母等級）');
r=arena('shuang'); r.flat=false; playId(r,'atk_shuang'); t(E(r).hp===50-Math.round(6*1.08)&&G.statsOf(r).atk===1.08,'凌霜 力道玄／靈力天 取高（108%）：6 傷 → 6',E(r).hp);
r=arena('xiaoman'); r.flat=false; E(r).hp=200; r.battle.energy=9; for(let i=0;i<5;i++) playId(r,'atk_xiaoman'); t(G.statsOf(r).atk===0.92&&E(r).hp===200-5*Math.round(6*0.92),'白辰 力道黃／靈力玄 取高（92%）：5 下',E(r).hp);
r=arena('shuang'); r.flat=false; playId(r,'atk_shuang'); t(E(r).hp===50-6,'凌霜 力道 D、靈力 B（攻擊取高）：6 傷 → 6',E(r).hp);
r=arena('chilian'); r.flat=false; r.battle.energy=9; for(let i=0;i<4;i++) playId(r,'def_chilian'); t(G.statsOf(r).def===1.08&&r.battle.block===4*Math.round(5*1.08),'赤練 格擋看力道／身法／靈力取最高（靈力天 108%）',r.battle.block);
r=arena('xiaoman'); r.flat=false; playId(r,'def_xiaoman'); t(r.battle.block===5,'白辰 力道 D／身法 D／靈力 C 取最高（92%）：5 → 5',r.battle.block);
t(G.SERVANTS.chilian.hp===81&&G.SERVANTS.aduo.hp===69&&G.SERVANTS.shuang.hp===63&&G.SERVANTS.xiaoman.hp===63&&G.ORDER.every(k=>G.newRun(k,3).maxHp===G.SERVANTS[k].hp),'生命照體魄：天 81、玄 69、黃 63',G.ORDER.map(k=>G.SERVANTS[k].hp).join());
r=arena('chilian',1,100); r.flat=false; r.battle.np=100; G.noble(r,0); t(E(r).hp===100-9*Math.round(5*1.08),'神通等級只顯示：赤練血河九斬只乘攻擊（靈力天）',E(r).hp);
const qlR=G.newRun('qingli',3); step(qlR,'fight'); const xmR=G.newRun('xiaoman',3); step(xmR,'fight'); t(qlR.battle.hand.length===xmR.battle.hand.length+1,'身法 A 以上（青璃）：開場多抽 1 張',[qlR.battle.hand.length,xmR.battle.hand.length].join());
t(G.statsOf(G.newRun('qingli',1)).luck>1&&G.statsOf(G.newRun('chilian',1)).luck<1&&G.statsOf(G.newRun('xiaoman',1)).luck===1,'氣運：青璃天品（愛錢）拿得多、赤練黃品拿得少、白辰地品照常');
let lt=G.newRun('qingli',6,{fate:'light'}); t(lt.deck.filter(x=>G.isBasic(x,'atk')).length===4&&lt.deck.filter(x=>G.isBasic(x,'def')).length===2,'輕裝上陣：拿掉的是自己的基本牌');

// 角色專屬事件
{ const q=G.newRun('chilian',3); q.screen='event'; q.event='wine'; G.choose(q,0); t(q.screen==='battle'&&q.battle.kind==='elite'&&q.battle.enemies[0].id==='daoke','一罈好酒：指定對手是無名刀客'); }
{ const q=G.newRun('xiaoman',3); q.deck.push('prelati'); const n=q.deck.length; q.screen='event'; q.event='dragonhome'; G.choose(q,0); t(q.deck.length===n&&q.deck.includes('prelati+'),'秘傳已經有了：事件改成強化它，不會拿到第二張'); }
ev=G.newRun('xiaoman',41); step(ev,'event'); ev.event='tanghulu'; const gd=ev.gold; G.choose(ev,0); t(ev.gold===gd-40&&ev.krakenStart===3,'糖葫蘆攤：花 40 金，每場開場阿白 +3');
step(ev,'fight'); t(ev.battle.kraken===8,'下一場開場阿白 5＋3',ev.battle.kraken);
ev=G.newRun('xiaoman',41); step(ev,'event'); ev.event='alone'; G.choose(ev,0); step(ev,'fight'); ev.battle.enemies.forEach(e=>{ e.intent={n:'守',fx:[['block',0]]}; e.hp=999; }); const k0=ev.battle.kraken; G.endTurn(ev); t(ev.battle.kraken===k0+2,'一個人的夜路：阿白每回合長大 2',ev.battle.kraken-k0);
ev=G.newRun('xiaoman',41); step(ev,'event'); ev.event='dragonhome'; G.choose(ev,0); t(ev.deck.includes('prelati')&&ev.maxHp===G.SERVANTS.xiaoman.hp-6,'舊蛻：最大生命 -6，得到蛻龍訣');
{ const q=G.newRun('shuang',3); q.screen='event'; q.event='swordtomb'; const h=q.hp; G.choose(q,0); t(q.hp===h-10&&q.deck.includes('sword_rain'),'劍冢：失去 10 生命，得到漫天劍雨'); }
{ const q=G.newRun('qingli',3); q.screen='event'; q.event='sellfu'; const g=q.gold; G.choose(q,0); t(q.gold===g+80&&q.deck.includes('sin'),'賣符：漫天喊價得 80 金，代價業障'); }
{ const q=G.newRun('aduo',3); q.gold=80; q.screen='event'; q.event='guking'; G.choose(q,1); t(q.deck.includes('shaitan')&&!q.deck.includes('sin')&&q.gold===30,'蠱王：花 50 金買豬心，得到金蠶蠱');
  const r=G.newRun('aduo',3); r.gold=20; r.screen='event'; r.event='guking'; G.choose(r,1); t(!r.deck.includes('shaitan'),'蠱王：錢不夠買不了豬心'); }

console.log('── 難度');
let dn=G.newRun('qingli',9,{diff:'normal'}), dh=G.newRun('qingli',9,{diff:'abyss'}); step(dn,'fight'); step(dh,'fight');
t(dh.battle.enemies[0].maxHp>=Math.round(dn.battle.enemies[0].maxHp*1.25)&&dh.battle.enemies[0].str===dn.battle.enemies[0].str+1,'深淵：敵人生命 +30%、力量 +1',JSON.stringify([dn.battle.enemies[0].maxHp,dh.battle.enemies[0].maxHp]));
t(G.restHeal(dh)===Math.round(dh.maxHp*0.25)&&G.restHeal(dn)===Math.round(dn.maxHp*0.3),'深淵休息只回兩成五');
t(G.newRun('qingli',1,{asc:6}).ascStart.some(f=>f[0]==='pPetrifyAll'),'境界 VI：每回合的專屬強化（青璃每回合全體定身 1）');

console.log('── 強化方向');
t(G.upDirs('chain').join('')==='acde'&&G.upDirs('hrunting').join('')==='abcde'&&G.upDirs('atk').join('')==='ace'&&G.upDirs('gorgon').join('')==='ad'&&G.card('gorgon+d').fx.some(f=>f[0]==='pPetrifyAll'&&f[1]===2)&&G.upDirs('chain+').length===0&&G.upDirs('sword').length===0,'每張牌能往哪幾個方向強化（1 費沒有迅捷、能力牌沒有共鳴與極限、能力牌的道心是每回合版，已強化／代幣不能再強化）');
t(G.card('hrunting+b').cost===1&&G.card('chain+c').npBonus===15&&G.card('chain+c').fx.some(f=>f[0]==='draw')&&G.card('nails+d').fx.filter(f=>f[0]==='petrifyAll').length===1&&G.card('nails+d').fx.some(f=>f[0]==='petrifyAll'&&f[1]===2)&&G.card('chain+e').fx[0][1]===12&&G.card('chain+e').ex,'迅捷 -1 費、共鳴 +15% 抽 1、道心加定身（符針全體定身 1 → 2，精煉是 1）、極限翻倍但消耗');
t(G.card('chain+').name==='捆妖索＋'&&G.card('chain+').fx[0][1]===9&&G.card('chain+e').name==='捆妖索・極'&&G.card('chain+c').name==='捆妖索・共鳴','「+」是精煉；名字帶方向');
let ug=G.newRun('qingli',77); ug.deck.push('bloodfort'); const ci=ug.deck.length-1, op=G.upgradeOptions(ug,ci);
t(op.length===3&&op.includes('bloodfort+')&&JSON.stringify(G.upgradeOptions(ug,ci))===JSON.stringify(op),'強化給三個方向（精煉一定在），同一次重畫不會變',op);
ug.screen='rest'; t(!G.rest(ug,'upgrade',ci,'bloodfort+x')&&G.rest(ug,'upgrade',ci,op[1])&&ug.deck[ci]===op[1],'只能選給的方向');
let ug2=G.newRun('qingli',78); let seenDirs=new Set(); for(let k=0;k<40;k++){ ug2.stats.floors=k; G.upgradeOptions(ug2,8).forEach(v=>{ if(G.card(v).dir!=='f') seenDirs.add(G.card(v).dir); }); } t(seenDirs.size===4,'換個時間點，另外兩個方向會變（捆妖索 4 個方向都出現過）',[...seenDirs].join(''));
r=arena(); r.battle.hand=['chain+e']; G.play(r,0,0); t(E(r).hp===38&&r.battle.exhaust.includes('chain+e'),'極限：12、打完消耗',E(r).hp);

console.log('── 流程');
let r7=arena(); r7.battle.enemies.forEach(e=>{e.hp=1;}); r7.battle.np=100; G.noble(r7,0);
t(r7.screen==='reward'&&r7.reward.cards.length===3&&r7.reward.cards.every(c=>['qingli','common'].includes(G.CARDS[c.replace('+','')].kit)),'打贏：三選一，只出自己的牌和中立牌');
const pk=r7.reward.cards[0]; G.takeReward(r7,0); t(r7.deck.includes(pk)&&r7.screen==='map','選的牌加進牌組、回地圖');
r7.screen='rest'; r7.hp=10; G.rest(r7,'heal'); t(r7.hp===10+Math.round(r7.maxHp*0.3),'休息：回三成生命');
r7.screen='rest'; const ui=r7.deck.findIndex(x=>G.isBasic(x,'atk')); const b7=r7.deck[ui]; G.rest(r7,'upgrade',ui); t(r7.deck[ui]===b7+'+'&&G.card(b7+'+').fx[0][1]===G.BASICS[r7.who][2][0][1]&&G.card(b7+'+').name.endsWith('＋'),'強化：基本攻擊→精煉（數值照表）',r7.deck[ui]);
const r9=G.newRun('qingli',12); r9.relics=['shroud','gem','circuit','book']; step(r9,'fight');
t(r9.battle.block===8&&r9.battle.energy===4&&r9.battle.np===25&&r9.battle.enemies.every(e=>e.weak===1),'法寶：護體金鐘、聚靈玉、通神香、懾魂鈴');
// 強化畫面看得出差別：道心不重複印同一個資源、共鳴的神通量表上卡面、upDiff 列出具體變化
t(JSON.stringify(G.card('nails+d').fx)==='[["hits",3,2],["petrifyAll",2]]'&&G.cardShort('nails+d')==='⚔3×2 全體定身2','道心：牌上已有全體定身 1 → 合併成 2（不印兩次、也不輸給精煉）',G.cardShort('nails+d'));
t(/神通\+15%/.test(G.cardShort('nails+c'))&&!/神通/.test(G.cardShort('nails')),'共鳴：卡面顯示神通 +%（沒共鳴的牌不顯示）',G.cardShort('nails+c'));
t(G.upDiff('nails','nails+c').some(x=>/打出時神通 \+15%/.test(x))&&G.upDiff('nails','nails+a').some(x=>/→/.test(x)&&/4×2/.test(x)),'強化選單列出具體變化（打出時神通 +15%、⚔3×2 → ⚔4×2）',JSON.stringify(G.upDiff('nails','nails+c')));
t(G.FATES.gold.name==='意外之財','機緣的名字');
// 無盡模式：第二章魔王之後不進隱藏關，一層一層往下、越來越強
{ const toBoss=(r)=>{ r.floor=11; r.lane=r.map[10].findIndex(n=>n); r.screen='map'; G.go(r,2); r.battle.enemies.forEach(e=>{e.hp=1;e.block=0;e.lives=0;}); r.battle.hand=[G.basicOf('qingli','atk')]; r.battle.energy=3; G.play(r,0,0); };
  let r=G.newRun('qingli',5,{endless:true}); r.act=2; r.boss='huyao'; r.seals=3; toBoss(r);
  t(r.screen==='reward'&&r.reward.next==='deeper','無盡：第二章魔王倒下 → 有玉符也不進隱藏關，拿獎勵往下',r.screen);
  G.takeReward(r,-1);
  t(r.act===3&&r.map.length===12&&G.actName(r)==='鎮妖塔　第 1 層'&&r.boss!=='xinmo'&&G.BOSSES.includes(r.boss),'無盡第 1 層：新的 12 列地圖、魔王從兩章魔王池抽',r.act+' '+r.boss);
  t(step(r,'fight')&&r.battle&&r.battle.enemies.length>0,'無盡層的一般戰鬥用第二章的敵人');
  r.screen='map'; r.battle=null; r.floor=0; r.lane=-1; t(step(r,'event')&&r.screen==='event','無盡層也有事件');
  const b2=G.newRun('qingli',5); b2.act=2; b2.floor=11; const hp2=(()=>{ b2.lane=b2.map[10].findIndex(n=>n); b2.boss='huyao'; G.go(b2,2); return b2.battle.enemies[0].maxHp; })();
  const r3=G.newRun('qingli',5,{endless:true}); r3.act=4; r3.floor=11; r3.lane=r3.map[10].findIndex(n=>n); r3.boss='huyao'; G.go(r3,2);
  t(r3.battle.enemies[0].maxHp>hp2*1.4&&r3.battle.enemies[0].str>b2.battle.enemies[0].str,'無盡越深越強（第 2 層的九尾妖狐比第二章強很多）',hp2+'→'+r3.battle.enemies[0].maxHp);
  { const h=G.newRun('qingli',5); h.act=3; h.floor=2; const e=G.newRun('qingli',5,{endless:true}); e.act=3; e.floor=2; const a2=G.newRun('qingli',5); a2.act=2; a2.floor=11; const e2=G.newRun('qingli',5,{endless:true}); e2.act=4; e2.floor=0; const l2=G.scaleUp(e2);
  const mid=G.newRun('qingli',5); mid.act=2; mid.floor=6;
  t(G.scaleUp(e)===19&&G.scaleUp(e)>=G.scaleUp(a2)&&l2===26&&G.scaleUp(h)>=G.scaleUp(mid)&&G.scaleUp(h)<G.scaleUp(a2),'敵人成長：鎮妖塔每層開頭至少跟第二章最後一列一樣硬；隱藏關的精英約第二章中段（第二章最後 '+G.scaleUp(a2)+'）',G.scaleUp(h)+'/'+G.scaleUp(e)+'/'+l2); }
  const n=G.newRun('qingli',5); n.act=2; n.boss='huyao'; n.seals=1; toBoss(n); if(n.screen==='reward') G.takeReward(n,-1); t(n.screen==='secret','一般模式不受影響：第二章打完有玉符照樣到隱藏關入口',n.screen); }
t(G.newRun('qingli',3,{asc:6,fate:'legacy'}).deck.filter(x=>G.baseId(x)==='breaker').length===1,'境界 V 已經有秘傳：師父的秘傳改成把它強化，不會拿到兩張');
t(G.upDiff('breaker','breaker+').includes('不再消耗'),'強化選單列出「不再消耗」');
{ const q=arena(); q.screen='reward'; q.hp=10; q.pills=['dali']; t(!G.seal(q,'heal').ok&&q.seals===1&&!G.usePill(q,0).ok,'戰鬥結束（勝利停頓中）不能用玉符、丹藥'); }
{ const q=arena('qingli',1,6); q.battle.hand=['heavy']; const p=G.preview(q,0,0), p2=G.preview(q,0,0,true); t(p.per[0]===6&&p2.per[0]===12&&p.kills===1&&E(q).hp===6,'預計：raw 量實際打出的 12（不被 6 血截掉）、一般試算數得到擊倒，不動到真的局面',JSON.stringify([p.per,p2.per,p.kills])); }
t(!/每場戰鬥開始：每/.test(G.ORDER.map(k=>[2,3,4,6].map(l=>G.ascText(k,l)).join('|')).join('|')),'「每回合…」的效果不再疊「每場戰鬥開始：」');
// 全部玩家看得到的文字（所有牌與強化方向、神通、境界、頓悟、被動、法寶、事件、機緣）沒有 undefined／NaN／{1} 殘留
{ const bad=[], chk=(w,x)=>{ if(/undefined|NaN|\{\d\}|\{m\}|null/.test(x)) bad.push(w); };
  Object.keys(G.CARDS).forEach(k=>[k].concat(G.upDirs(k).map(d=>d==='a'?k+'+':k+'+'+d)).forEach(id=>{ chk(id,G.cardText(id,null)); chk(id,G.cardShort(id,null)); }));
  G.ORDER.forEach(k=>{ const r=G.newRun(k,1); chk(k,G.npText(G.SERVANTS[k].np)); for(let l=1;l<=6;l++) chk(k+l,G.ascText(k,l)); (G.TALENTS[k]||[]).flat().forEach(T=>chk(k+T.name,G.talentText(T,r))); });
  Object.keys(G.RELICS).forEach(k=>chk(k,G.RELICS[k].text)); Object.keys(G.EVENTS).forEach(k=>G.EVENTS[k].opts.forEach(o=>chk(k,o.label))); Object.keys(G.FATES).forEach(k=>chk(k,G.FATES[k].text));
  t(!bad.length,'所有文字沒有 undefined／NaN／{1} 殘留',bad.slice(0,5).join(',')); }
// 換皮：玩家看得到的文字不能留 Fate 的用詞
{ const TERMS=['寶具','令咒','從者','聖杯','英靈','靈基','禮裝','冬木','Saber','Servant','魔力','投影','石化','海魔','征服王','騎士王','Boss'];
  const txt=[], add=(w,s)=>{ if(s) txt.push([w,String(s)]); };
  Object.keys(G.CARDS).forEach(k=>{ const C=G.CARDS[k]; add(k,C.name); add(k,C.text); add(k,C.short); [k].concat(G.upDirs(k).map(d=>d==='a'?k+'+':k+'+'+d)).forEach(id=>{ add(id,G.card(id).name); add(id,G.cardText(id,null)); add(id,G.cardShort(id,null)); }); });
  G.ORDER.forEach(k=>{ const S=G.SERVANTS[k], q=G.newRun(k,1); [S.name,S.cls,S.desc,S.passive.name,S.passive.text,S.np.name,G.npText(S.np)].forEach(s=>add(k,s)); for(let l=1;l<=6;l++) add(k+l,G.ascText(k,l)); G.TALENTS[k].flat().forEach(T=>{ add(k,T.name); add(k,G.talentText(T,q)); }); });
  Object.keys(G.ENEMIES).forEach(k=>{ add(k,G.ENEMIES[k].name); G.ENEMIES[k].moves.forEach(m=>add(k,m.n)); });
  Object.keys(G.RELICS).forEach(k=>{ add(k,G.RELICS[k].name); add(k,G.RELICS[k].text); }); Object.keys(G.FATES).forEach(k=>{ add(k,G.FATES[k].name); add(k,G.FATES[k].text); });
  Object.keys(G.EVENTS).forEach(k=>{ const V=G.EVENTS[k]; add(k,V.name); add(k,V.text); V.opts.forEach(o=>add(k,o.label)); });
  Object.keys(G.UP_DIRS).forEach(k=>{ const U=G.UP_DIRS[k]; add(k,U.name); add(k,U.tag); add(k,U.text); });
  Object.keys(G.DIFFS).forEach(k=>add(k,G.DIFFS[k].name)); Object.values(G.ACT_NAMES).concat(G.PARAM_NAMES,G.REALMS).forEach(s=>add('name',s));
  const hit=txt.filter(([w,s])=>TERMS.some(T=>s.includes(T)));
  t(txt.length>500&&!hit.length,'玩家看得到的文字（牌、角色、敵人、法寶、機緣、事件、頓悟、強化方向）沒有 Fate 用詞',hit.slice(0,5).map(([w,s])=>w+':'+s.slice(0,30)).join(' | '));
  const code=SRC.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,''), hit2=TERMS.filter(T=>code.includes(T));
  t(!hit2.length,'引擎的字串（含戰鬥紀錄）也沒有 Fate 用詞（註解不算）',hit2.join()); }
// 強化方向不再有永遠的最佳解
t(JSON.stringify(G.card('hrunting+b').fx[0])==='["projDmg",8,3]'&&G.card('hrunting+b').cost===1,'迅捷：單純便宜 1 費（數值不變）',JSON.stringify(G.card('hrunting+b').fx));
t(JSON.stringify(G.card('heavy+').fx[0])==='["dmg",21]'&&G.card('heavy+').cost===2,'2 費以上的精煉數值再 ×1.25（重擊 17 → 21），才比得過迅捷 -1 費',JSON.stringify(G.card('heavy+').fx));
{ const q=G.newRun('qingli',3,{fate:'early'}); t(q.screen==='boon'&&q.boon.opts.length===2&&G.takeBoon(q,1)&&q.awaken.length===1&&q.screen==='map','天生慧根：出發前兩個選一個'); }
{ const q=G.newRun('qingli',3,{fate:'heirloom'}); t(q.screen==='boon'&&q.boon.kind==='relic'&&q.boon.opts.length===2&&G.takeBoon(q,0)&&q.relics.length===1,'師門傳承：兩件法寶選一件'); }
{ const q=G.newRun('qingli',3); q.screen='event'; q.event='mapo'; G.choose(q,0); step(q,'fight'); t(q.battle.weak===2&&!q.nextWeak,'路邊的黑店：回 25，下一場開場虛弱 2（只有下一場）'); }
t(JSON.stringify(G.card('hrunting+e').fx[0])==='["projDmg",16,6]','極限：每點資源的加成也翻倍（8+3/劍 → 16+6/劍）',JSON.stringify(G.card('hrunting+e').fx));
t(!G.upDirs('dirk').includes('e')&&G.upDirs('nails').includes('e'),'數字太小的牌（毒牙 2＋毒 2）不給極限；3×2 算 6 可以');
t(G.card('tracing+c').npBonus===30&&G.card('tracing+c').fx.filter(f=>f[0]==='draw').length===1,'共鳴：本來會抽牌的改成神通 +30%（不再多抽一張）');
{ let bad=[]; Object.keys(G.CARDS).forEach(k=>{ if(!G.upDirs(k).length) return; const q={seed:1,deck:[k],stats:{floors:0},who:G.CARDS[k].kit in G.SERVANTS?G.CARDS[k].kit:'qingli'}; for(let f=0;f<200;f++){ q.stats.floors=f; const o=G.upgradeOptions(q,0); const v=o.find(x=>G.card(x).dir==='f'); if(v){ const a=G.card(k+'+'),l=G.card(v); if(JSON.stringify(a.fx)===JSON.stringify(l.fx)&&a.cost===l.cost) bad.push(k); break; } } }); t(!bad.length,'★傳說一定跟精煉不一樣（不然只是白拿內傷）',bad.join(',')); }
// 法寶拿完不再白付、每章至少 2 個精英、無盡只用免費機緣
{ const q=G.newRun('qingli',3); Object.keys(G.RELICS).forEach(k=>q.relics.push(k)); q.gold=200; t(!G.canChoose(q,G.EVENTS.jeweler.opts[0])&&!G.canChoose(q,G.EVENTS.magus.opts[0])&&G.canChoose(q,G.EVENTS.jeweler.opts[1]),'法寶全拿了：花錢／花血換法寶的選項關掉（試丹還能選）'); }
t(Object.keys(G.RELICS).length>=13,'法寶池 13 件');
{ const q=G.newRun('qingli',3); q.relics.push('azoth','volumen'); step(q,'fight'); t(q.battle.str>=1&&q.battle.block>=2,'龍虎丹開場力量 +1、玄龜甲每回合格擋 +2',JSON.stringify([q.battle.str,q.battle.block])); }
{ const q=G.newRun('qingli',3); q.relics.push('waver'); t(G.visible(q,4,q.map[4].findIndex(n=>n)),'山海圖：多看 2 列（第 5 列也看得到）'); }
{ const z=G.newRun('qingli',3); const l0=z.lives; z.screen='chest'; z.reward={relic:'pendant'}; G.takeChest(z); t(z.lives===l0+1&&z.relics.includes('pendant')&&z.screen==='map','九轉還魂丹：多一條命（寶箱）'); }
t(G.fateOptions(Object.keys(G.GOALS)).length===Object.keys(G.FATES).length,'目標全達成：全部機緣都能選');
{ let few=0; for(let i=0;i<200;i++){ const q=G.newRun('qingli',500+i); let n=0; q.map.forEach(row=>row.forEach(x=>{ if(x&&x.t==='elite') n++; })); if(n<2) few++; } t(few===0,'每章地圖至少 2 個精英',few); }
// 中立牌（大家都拿得到）：至少 18 張，涵蓋全體、穿透、抽牌、靈力、控場、防守
{ const C=Object.keys(G.CARDS).filter(k=>G.CARDS[k].kit==='common'); const ops=new Set(C.flatMap(k=>G.CARDS[k].fx.map(f=>f[0])));
  t(C.length>=18&&['all','pierceHits','draw','energy','nextEnergy','strDown','weakAll','thorns','pBlock','evade'].every(o=>ops.has(o)),'中立牌 18 張以上，各自開一條玩法',C.length); }
// ★傳說強化：一成機率出現；攻擊次數翻倍（只打一下的變兩下），技能、能力 0 費
t(G.card('throwdirk+f').fx[0][2]===6&&G.card('heavy+f').fx[0][0]==='hits'&&G.card('heavy+f').fx[0][2]===2&&G.card('bounded+f').cost===0&&G.card('nails+f').fx[0][2]===4,'★傳說：銀針 3 下 → 6 下、重擊變兩下、金光罩 0 費、符針 2 → 4 下');
{ const q=G.newRun('qingli',5); let n=0; for(let f=0;f<600;f++){ q.stats.floors=f; if(G.upgradeOptions(q,9).some(x=>G.card(x).dir==='f')) n++; } t(n>20&&n<110,'★傳說大約一成機率出現',n); }
t(!G.upDirs('chain').includes('f'),'★傳說不會固定出現（只有一成機率替換）');
// 詛咒牌：留在牌組的代價（★傳說、事件），可以花靈力打掉這場、商店／事件／淨化永久移除
r=arena(); r.battle.hand=['fatigue']; playId(r,'atk_qingli'); t(E(r).hp===50-5,'內傷在手上：攻擊每擊 -1（6 → 5）',E(r).hp);
r.battle.hand=['fatigue','fatigue']; playId(r,'atk_qingli'); t(E(r).hp===45-4,'兩張內傷：每擊 -2',E(r).hp);
r.battle.hand=['fatigue']; r.battle.energy=3; playId(r,'def_qingli'); t(r.battle.block===5,'內傷不影響格擋',r.battle.block);
r=arena(); r.battle.hand=['corrosion','sin']; hp=r.hp; G.endTurn(r); t(r.hp===hp-3,'魔氣侵體留在手上：回合結束 -3 生命',hp-r.hp);
r=arena(); r.battle.hand=['sin']; r.battle.energy=3; t(!G.play(r,0,0).ok,'業障打不出來');
t(['fatigue','corrosion','sin','mud'].every(c=>!G.canUpgrade(c))&&G.isCurse('fatigue')&&!G.isCurse('atk_qingli'),'詛咒牌不能強化');
t(['fatigue','corrosion','sin','mud','worm','enfeeble','bind'].every(c=>G.cardShort(c)&&!/undefined/.test(G.cardShort(c))),'詛咒／妨礙牌卡面有簡短說明');
{ const q=G.newRun('qingli',5); const i=q.deck.indexOf('atk_qingli'); let f=0; while(f<2000&&!G.upgradeOptions(q,i).some(x=>G.card(x).dir==='f')) q.stats.floors=++f;
  const v=G.upgradeOptions(q,i).find(x=>G.card(x).dir==='f'), n=q.deck.length; q.screen='rest'; G.rest(q,'upgrade',i,v);
  t(q.deck[i]===v&&q.deck.length===n+1&&q.deck.includes('fatigue'),'★傳說強化的代價：牌組多一張內傷');
  const w=G.upgradeOptions(q,0).find(x=>G.card(x).dir!=='f'), n2=q.deck.length; q.screen='rest'; G.rest(q,'upgrade',0,w); t(q.deck.length===n2,'一般強化不會多內傷'); }
{ const q=G.newRun('qingli',5); for(let k=0;k<40;k++){ q.screen='event'; q.event='dojo'; q.deck=G.newRun('qingli',5).deck; G.choose(q,0); if(q.deck.some(x=>G.card(x).dir==='f')) break; } t(!q.deck.some(x=>G.card(x).dir==='f'),'事件的隨機強化不會抽到★傳說（★傳說一定要自己選、付內傷）'); }
{ const q=G.newRun('qingli',5); q.act=2; const d=q.deck.length;
  q.screen='event'; q.event='training'; G.choose(q,0); t(q.deck.includes('fatigue')&&q.deck.length===d+1,'深夜的苦練：強化 3 張，代價內傷');
  q.screen='event'; q.event='pact'; const g=q.gold, rl=q.relics.length; G.choose(q,0); t(q.deck.includes('sin')&&q.gold===g+100&&q.relics.length===rl+1,'魔修的契約：法寶＋100 金，代價業障');
  q.screen='event'; q.event='allevil'; G.choose(q,0); t(q.deck.includes('corrosion'),'萬鬼的呢喃：代價魔氣侵體');
  q.screen='rest'; const n=q.deck.length; G.rest(q,'remove',q.deck.indexOf('sin')); t(!q.deck.includes('sin')&&q.deck.length===n-1,'休息的淨化可以移除詛咒');
  step(q,'fight'); t(q.battle.draw.includes('fatigue')||q.battle.hand.includes('fatigue'),'詛咒牌會跟著進戰鬥'); }
// 屍蟲群：不打人，把屍蟲直接塞進手牌；屍蟲保留、每回合扣血，花 1 靈力打掉
r=arena(); E(r).intent={n:'寄生',fx:[['plant','worm',1]]}; G.endTurn(r); t(r.battle.hand.includes('worm'),'屍蟲直接塞進手牌');
hp=r.hp; E(r).intent={n:'發呆',fx:[]}; G.endTurn(r); t(r.battle.hand.includes('worm')&&r.hp===hp-2,'屍蟲保留：回合結束不丟掉、扣 2 生命',hp-r.hp);
r.battle.energy=3; x=G.play(r,r.battle.hand.indexOf('worm'),0); hp=r.hp; r.battle.block=99; G.endTurn(r); t(x.ok&&!r.battle.hand.includes('worm')&&r.hp===hp,'花 1 靈力打掉屍蟲就不再扣血');
r=arena(); r.battle.hand=Array(10).fill('atk_qingli'); E(r).intent={n:'寄生',fx:[['plant','worm',1]]}; G.endTurn(r); t(r.battle.hand.length<=10,'手牌最多 10 張',r.battle.hand.length);
// 散功（攻擊減半）、縛靈（每張牌 +1 費）：一個卡傷害、一個卡靈力
r=arena(); r.battle.hand=['enfeeble']; playId(r,'atk_qingli'); t(E(r).hp===50-3,'散功在手上：攻擊減半（6 → 3）',E(r).hp);
r=arena(); r.battle.hand=['bind','atk_qingli','sword']; t(G.costOf(r,'atk_qingli')===2&&G.costOf(r,'sword')===1&&G.costOf(r,'bind')===1,'縛靈在手上：每張牌 +1 費（0 費的變 1），打掉縛靈本身還是 1 費');
r.battle.energy=3; G.play(r,0,0); t(G.costOf(r,'atk_qingli')===1&&r.battle.energy===2,'打掉縛靈後費用恢復');
// 擲骰事件：d20＋氣運修正（B＝0、每級 ±1），20 必成功、1 必失敗
t(G.luckMod({who:'qingli'})===1&&G.luckMod({who:'chilian'})===-2&&G.luckMod({who:'xiaoman'})===0&&G.luckMod({who:'qingli',flat:true})===0,'氣運修正：青璃天＝+1、赤練黃＝-2、白辰地＝0（flat 不套）');
t(G.d20Chance({who:'xiaoman'},10)===55&&G.d20Chance({who:'qingli'},10)===60&&G.d20Chance({who:'chilian'},10)===45&&G.d20Chance({who:'chilian'},30)===5&&G.d20Chance({who:'qingli'},1)===95,'成功率：20 必成功、1 必失敗');
{ let win=0, hpWin=0; for(let s=0;s<300;s++){ const q=G.newRun('xiaoman',s); q.screen='event'; q.event='stairs'; const m=q.maxHp, h=q.hp; const x=G.choose(q,0); if(x.roll.ok){ win++; if(q.maxHp===m+8) hpWin++; } else if(q.hp!==h-10||q.maxHp!==m) hpWin=-999; }
  t(win>130&&win<200&&hpWin===win,'通天石階：成功最大生命 +8、失敗失去 10 生命，成功率約 55%',win); }
{ const q=G.newRun('qingli',3); q.relics=Object.keys(G.RELICS); t(!G.canChoose(q,G.EVENTS.bridge.opts[0])&&!G.canChoose(q,G.EVENTS.gamble.opts[0]),'法寶全拿了：擲骰拿法寶的選項也會關掉'); }
r=arena(); playId(r,'leyline'); t(r.battle.block===4&&/打出當下先生效一次/.test(G.cardText('leyline')),'靈脈：打出當下先格擋 4（卡面寫得出來）',r.battle.block);
{ const dup=[]; G.ORDER.forEach(w=>{ const T=(G.TALENTS[w]||[]).flat().map(t=>JSON.stringify(t.start||t.np||null)); const A=[0,1,2,3].map(i=>JSON.stringify(G.ASC_SVT[w][i])); A.forEach(a=>{ if(a!=='null'&&T.includes(a)) dup.push(w); }); }); t(!dup.length,'境界不跟頓悟一模一樣',dup.join(',')); }
// 第二章：敵人越往下越硬（開頭四成、第 9 列起全額），魔王另外 ×1.2 血＋力量 5
{ const mk=(act,floor)=>{ const q=G.newRun('qingli',5); q.act=act; q.floor=floor; return G.makeEnemy(q,'shikui',G.scaleUp(q),0); }; const a1=mk(1,10), b1=mk(2,1), b9=mk(2,9), b12=mk(2,12);
  t(b1.str>a1.str&&b9.str>b1.str+3&&b12.str>=b9.str&&b9.hp>b1.hp,'第二章的敵人隨樓層變強（開頭就比第一章尾巴硬、第 9 列起全額）',[a1.str,b1.str,b9.str,b12.str]); }
let fin=0; for(let i=0;i<G.ORDER.length*4;i++){ const q=playRun(G.ORDER[i%G.ORDER.length],500+i); if(q.screen==='over') fin++; }
t(fin===G.ORDER.length*4,'自動玩家每位 4 局都能打到結束（不卡死）',fin);
t(G.fateSlots(false)===2&&G.fateSlots(true)===1,'機緣欄位：一般帶兩種、鎮妖塔固定一種');
{ const q=G.newRun('qingli',6,{fates:['gold','tough']}); t(q.gold===180&&q.maxHp===G.SERVANTS.qingli.hp+10&&q.fates.length===2,'一次帶兩種機緣：兩個都生效'); }
{ const q=G.newRun('qingli',6,{fates:['gold','gold','seal4','tough']}); t(q.fates.join()==='gold,seal4','機緣重複的不算、最多兩種',q.fates); }
{ const q=G.newRun('qingli',6,{fates:['gold','tough'],endless:true}); t(q.fates.length===1,'無盡模式只帶一種機緣'); }
{ const q=G.newRun('qingli',3,{fates:['heirloom','early']}); const ok1=q.screen==='boon'&&q.boon.kind==='relic'&&G.takeBoon(q,0); const ok2=q.screen==='boon'&&q.boon.kind==='awaken'&&G.takeBoon(q,1); t(ok1&&ok2&&q.screen==='map'&&q.relics.length===1&&q.awaken.length===1,'師門傳承＋天生慧根：兩個二選一排隊選完才出發'); }
console.log('── 神通量表：靠各自的機制累積（不靠出牌）');
{ const q=arena('shuang'); q.battle.npForge=1; q.battle.np=0; q.battle.energy=9; playId(q,'atk_shuang'); const n0=q.battle.np; G.endTurn(q); t(n0===0&&q.battle.np>=G.NP_GAIN.forge,'凌霜：出牌不累積，祭出飛劍才累積',JSON.stringify([n0,q.battle.np])); }
{ const q=arena('qingli'); q.battle.np=0; q.battle.energy=9; playId(q,'nails'); t(q.battle.np===G.NP_GAIN.gaze,'青璃：貼定身累積',q.battle.np); }
{ const q=arena('qingli',1,200); q.battle.np=100; G.noble(q,0); q.battle.energy=99; playId(q,'nails'); playId(q,'nails'); const np1=q.battle.np; G.endTurn(q); playId(q,'nails'); t(np1===0&&q.battle.np===G.NP_GAIN.gaze,'放過神通的那回合機制不累積（擋定身→神通的無限循環），下回合照常',[np1,q.battle.np]); }
{ const q=arena('xiaoman'); q.battle.np=0; q.battle.kraken=5; q.battle.mKraken=5; playId(q,'horror'); t(q.battle.np===Math.floor(3*G.NP_GAIN.madness),'白辰：阿白長大累積（零頭留著下次湊）',q.battle.np); playId(q,'horror'); t(q.battle.np===Math.floor(6*G.NP_GAIN.madness),'白辰：阿白長大 6 → 量表 +3%（不會每次四捨五入多算）',q.battle.np); }
{ const q=arena('chilian'); q.battle.np=0; E(q).intent={n:'砍',fx:[['atk',10]]}; G.endTurn(q); t(q.battle.np>=Math.min(100,10*G.NP_GAIN.revive),'赤練：失去生命累積',q.battle.np); }
{ const q=arena('aduo'); q.battle.np=0; q.battle.energy=9; playId(q,'venom'); t(q.battle.np===7*G.NP_GAIN.ambush,'阿朵：讓敵人中毒累積',q.battle.np); }
{ const q=G.newRun('qingli',3); step(q,'fight'); t(q.battle.np===0,'開戰時的被動（青璃全體定身）不算進量表：從 0 開始',q.battle.np); }
console.log('── 丹藥的取得');
{ let got=0; for(let i=0;i<60;i++){ const q=G.newRun('qingli',700+i); q.pills=[]; step(q,'elite'); q.battle.enemies.forEach(e=>{e.hp=1;e.block=0;e.lives=0;}); q.battle.np=100; G.noble(q,0); if(q.reward&&q.reward.pill) got++; } t(got===60,'打贏精英一定有丹藥',got); }
{ let got=0; for(let i=0;i<200;i++){ const q=G.newRun('qingli',900+i); q.pills=[]; step(q,'fight'); q.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); q.battle.np=100; G.noble(q,0); if(q.reward&&q.reward.pill) got++; } t(got>40&&got<110,'一般戰鬥大約三成五有丹藥',got); }
{ const q=G.newRun('qingli',5); q.gold=500; q.pills=[]; step(q,'shop'); t(q.shop.pills.length===2&&G.buy(q,'pill',0).ok&&q.pills.length===1&&!G.buy(q,'pill',0).ok,'商店賣兩顆丹藥，賣完就沒了'); q.pills=['a','b','c']; t(!G.buy(q,'pill',1).ok,'丹藥袋滿了不能買'); }
{ const q=G.newRun('qingli',5,{fates:['seal4']}); t(q.pillSlots===4&&q.pills.length===3,'丹藥滿袋：欄位 +1、開局多 2 顆（共 3 顆）'); }
{ const q=G.newRun('qingli',5); q.pills=[]; q.screen='chest'; q.reward={relic:'seal'}; G.takeChest(q); t(q.pillSlots===4&&q.pills.length===2,'隨身丹爐：欄位 +1、立刻 2 顆'); }
{ const old=JSON.parse(JSON.stringify(G.newRun('qingli',5))); delete old.pills; delete old.pillSlots; old.seals=3; old.maxSeals=3; const m=G.migrate(old); t(m.pills.length===0&&m.pillSlots===3&&m.seals===1,'舊存檔（三枚玉符）：改成一枚玉符＋空的丹藥袋'); }
console.log('── 局外解鎖（目標→機緣、法寶池）、圖鑑、真結局');
const ALLG=Object.keys(G.GOALS);
t(Object.keys(G.FATES).filter(k=>G.FATES[k].lock).every(k=>G.GOALS[G.FATES[k].lock])&&Object.keys(G.RELICS).filter(k=>G.RELICS[k].lock).every(k=>G.GOALS[G.RELICS[k].lock]),'鎖起來的機緣、法寶都對得上一個目標');
t(Object.keys(G.GOALS).every(g=>Object.keys(G.FATES).some(k=>G.FATES[k].lock===g)||Object.keys(G.RELICS).some(k=>G.RELICS[k].lock===g)),'每個目標都至少解鎖一樣東西');
{ const q=G.newRun('qingli',6,{fates:['bloodpact','gold']}); t(!q.fates.includes('bloodpact')&&q.fates.join()==='gold','沒達成目標：鎖著的機緣帶不進去'); }
{ const q=G.newRun('qingli',6,{fates:['bloodpact'],goals:['clear']}); t(q.maxHp===G.SERVANTS.qingli.hp-6&&q.relics.length===2,'以血換寶：最大生命 -6、開局 2 件法寶',JSON.stringify([q.maxHp,q.relics])); }
{ const q=G.newRun('qingli',6,{fates:['trial'],goals:['xinmo']}); step(q,'fight'); t(q.deck.includes('sin')&&q.battle.np>=35,'問心試煉：牌組多業障、神通量表從 35% 開始'); }
{ const q=G.newRun('qingli',6,{fates:['wander'],goals:['tower']}); t(q.gold===120&&G.visible(q,4,q.map[4].findIndex(n=>n)),'雲遊四方：多 60 金、多看 2 列'); }
{ const q=G.newRun('qingli',900); let leak=0; for(let i=0;i<60;i++){ step(q,'chest'); if(q.reward.relic&&G.RELICS[q.reward.relic].lock) leak++; G.takeChest(q); if(q.floor>=10) q.floor=0; } t(!G.relicPool(q).some(k=>G.RELICS[k].lock)&&leak===0,'沒達成目標：鎖著的法寶不在法寶池、寶箱也開不出來'); }
{ const q=G.newRun('qingli',6,{goals:ALLG}); t(G.relicPool(q).length===Object.keys(G.RELICS).length,'目標全達成：法寶池全開'); }
{ const q=G.newRun('qingli',3,{goals:ALLG}); q.relics.push('tassel','bead'); step(q,'fight'); t(q.battle.hand.length===6+(G.statsOf(q).agi?1:0)&&q.battle.enemies.every(e=>e.petrify>=1+1),'劍穗多抽 1、定魂珠開場全體定身 1（加上青璃自己的 1）',JSON.stringify([q.battle.hand.length,q.battle.enemies.map(e=>e.petrify)])); }
{ const q=arena(); q.relics.push('lamp'); const h=q.maxHp; q.hp=Math.floor(h/2)+3; E(q).intent={n:'砍',fx:[['atk',8]]}; G.endTurn(q); const a1=q.hp; t(a1===Math.floor(h/2)+3-8+12,'心燈：第一次掉到一半以下回 12',a1); q.hp=Math.floor(h/2)-1; E(q).intent={n:'砍',fx:[['atk',3]]}; G.endTurn(q); t(q.hp===Math.floor(h/2)-4,'心燈每場只亮一次',q.hp); }
{ const q=G.newRun('qingli',6,{goals:['tower']}); q.relics=[]; q.gold=200; step(q,'shop'); const p0=G.priceOf(q,{price:100}); q.screen='chest'; q.reward={relic:'pouch'}; G.takeChest(q); t(p0===100&&G.priceOf(q,{price:100})===85,'乾坤袋：商店八五折',G.priceOf(q,{price:100})); }
{ const q=arena(); E(q).hp=3; playId(q,'atk_qingli'); t(q.slain&&q.slain.zhiren===1,'打倒的敵人記進 run.slain（圖鑑用）',JSON.stringify(q.slain)); }
t(Object.keys(G.ENEMIES).every(k=>G.LORE[k]&&G.LORE[k].length>=10),'每個敵人都有圖鑑介紹');
t(G.ORDER.every(k=>G.ENDINGS[k]&&G.ENDINGS[k].title&&G.ENDINGS[k].text.length>=3),'五位都有真結局');

// 稽核修正（2026-10-02）
{ const q=arena('chilian'); q.battle.np=0; const hp=q.hp; playId(q,'rampage'); t(q.hp===hp-3&&q.battle.np===3*G.NP_GAIN.revive,'赤練：血刃的自傷也累積神通',[q.hp,q.battle.np]); }
{ const q=arena('chilian'); q.relics=['lamp']; q.hp=Math.floor(q.maxHp/2)+2; playId(q,'pages'); t(q.battle.lampUsed===1,'自傷掉到一半以下，心燈也會亮'); }
{ const q=arena('shuang'); q.battle.np=0; playId(q,'grail'); t(q.battle.np===50,'天書殘頁：神通 +50%',q.battle.np); }
{ const bad=Object.keys(G.CARDS).filter(k=>{ const c=G.CARDS[k]; return c.up&&!['status','curse','token'].includes(c.kit)&&!G.upDiff(k,k+'+').length; }); t(!bad.length,'每張可強化的牌，精煉都真的有變化',bad.join()); }
{ const q=arena('xiaoman'); q.battle=null; q.nextWeak=2; step(q,'fight'); t(q.battle.weak===0,'白辰：黑店包子也虛弱不了她'); }
{ const q=G.newRun('qingli',5); q.pills=['huichun','juling','dunxing']; q.screen='reward'; q.reward={cards:[],pill:'tongshen'}; G.swapPill(q,1); t(q.pills[1]==='tongshen'&&!q.reward.pill,'丹藥袋滿了：可以拿新的換掉一顆',q.pills.join()); }

{ const q=arena('qingli'); const e=E(q); e.id='niumo'; e.hp=e.maxHp=500; q.battle.energy=99; const th=[]; for(let k=0;k<3;k++){ th.push(G.stunAt(e)); e.petrify=G.stunAt(e)-1; playId(q,'chain'); e.stun=0; } t(th.join()==='5,5,6','魔王第二次起每被定住一次門檻 +1（定不死）',th.join()); }
{ const q=arena('qingli'); const e=E(q); q.battle.energy=99; const th=[]; for(let k=0;k<3;k++){ th.push(G.stunAt(e)); e.petrify=G.stunAt(e)-1; playId(q,'chain'); e.stun=0; } t(th.join()==='3,3,3','一般敵人照舊（定身門檻不會變高）',th.join()); }
// 門派主修（2026-10-02）
{ const q=G.newRun('shuang',3,{major:'guiyi'}); t(q.major==='guiyi'&&q.deck.includes('hanshuang')&&q.deck.includes('guiyi')&&!q.deck.includes('project'),'出發選主修：招牌牌換成那條的（歸一：一劍霜寒＋歸一）',q.deck.join()); }
{ const q=arena('shuang'); q.major='guiyi'; q.battle.swords=3; q.battle.jy=0; G.endTurn(q); t(q.battle.jy===9,'歸一：回合結束沒用完的飛劍化成劍意（每把 3）',q.battle.jy); }
{ const q=arena('shuang',1,200); q.battle.jy=4; q.battle.swords=2; playId(q,'hanshuang'); t(E(q).hp===200-(10+3*(4+6))&&q.battle.jy===0&&!q.battle.swords,'一劍霜寒：劍意＋飛劍（每把 3）一起斬出，穿透',E(q).hp); }
{ const q=arena('shuang',2,50); q.battle.yuyin=9; G.endTurn(q); t(q.battle.enemies.every(e=>e.hp===41)&&q.battle.yuyin===6,'琴心：回合結束餘音震傷全體，再散去三分之一',[q.battle.enemies.map(e=>e.hp),q.battle.yuyin]); }
{ const q=arena('qingli',2,60); q.battle.fire=2; playId(q,'huofu'); t(q.battle.enemies.every(e=>e.hp===60-(6+2*2))&&q.battle.fire===3,'火符：全體 6＋火勢×2，打完火勢 +1',[E(q).hp,q.battle.fire]); }
{ const q=arena('xiaoman'); q.major='longyou'; q.battle.kraken=9; q.battle.tstr=0; const hp0=E(q).hp; G.endTurn(q); t(E(q).hp===hp0&&q.battle.kraken===11&&q.battle.tstr===Math.floor(11*2/3),'龍佑：阿白不咬人、每回合長大 2，改成每回合開始給白辰本回合力量（阿白的三分之二）',[E(q).hp,q.battle.tstr]); }
{ const q=arena('chilian',2,60); E(q).charm=2; E(q).intent={n:'砍',fx:[['atk',20]]}; q.battle.block=0; const hp0=q.hp; G.endTurn(q); t(hp0-q.hp===10+0&&q.battle.enemies[1].hp<60&&E(q).charm===0,'魅惑：那一擊你只挨一半，另一半打到它自己人；用完就散',[hp0-q.hp,q.battle.enemies[1].hp]); }
{ const q=arena('aduo',2,30); E(q).parasite=4; E(q).hp=3; G.endTurn(q); t(E(q).hp===0&&q.battle.enemies[1].parasite===6,'寄生：每輪扣血不遞減；宿主倒下，蠱蟲爬到下一個身上 +2',[E(q).hp,q.battle.enemies[1].parasite]); }
{ const q=G.newRun('chilian',8,{major:'meigu'}); q.screen='major'; t(G.chooseMajor(q,'xuejia')&&q.majors.join()==='meigu,xuejia'&&q.deck.includes('rockbody')&&!q.mastered,'兼修：再開一條主修，送它的招牌牌',q.majors.join());
  const P=G.ownPool(q); t(P.side.length===0&&P.main.some(k=>G.CARDS[k].path==='xuejia')&&P.main.some(k=>G.CARDS[k].path==='meigu')&&!P.main.some(k=>G.CARDS[k].path==='kuangxue'),'兼修之後：兩條主修的牌都會出，第三條不出'); }
{ const q=G.newRun('aduo',8,{major:'anqi'}); t(G.ownPool(q).side.length>0,'第一章魔王前：其他主修的牌也偶爾會出'); q.screen='major'; G.chooseMajor(q,'master'); const P=G.ownPool(q); t(q.mastered&&P.side.length===0&&P.main.every(k=>G.CARDS[k].path==='anqi'),'專精之後：只出這條主修的牌'); step(q,'fight'); t(q.battle.evade>=1,'專精暗器：每場開場迴避 1'); }
t(G.ORDER.every(w=>G.pathsOf(w).length>=2&&G.pathsOf(w).every(P=>G.CARDS[P.sig]&&G.CARDS[P.sig].path===P.id)),'每位至少兩條主修，招牌牌屬於自己那條');
{ const feels=[].concat(...G.ORDER.map(w=>G.pathsOf(w).map(P=>P.feel))); t(new Set(feels).size===feels.length,'主修的手感詞不能撞',feels.join()); }
// 內容深度（2026-10-02）：第二章雜兵的特殊招式、主修專屬事件
{ const q=arena('qingli',2,60); E(q).intent={n:'群嚎',fx:[['strAll',1]]}; q.battle.enemies[1].intent={n:'發呆',fx:[]}; G.endTurn(q); t(q.battle.enemies.every(e=>e.str===1),'冥犬群嚎：整群力量 +1'); }
{ const q=arena('qingli'); E(q).intent={n:'索命',fx:[['sapEnergy',1]]}; G.endTurn(q); t(q.battle.energy===2,'怨靈索命：你下回合少 1 靈力',q.battle.energy); }
{ const q=arena('qingli'); q.battle.block=9; E(q).intent={n:'奪勢',fx:[['stealBlock',1]]}; G.endTurn(q); t(E(q).block===5,'魔化劍修奪勢：搶走妳一半的格擋（9 → 它 5）',E(q).block); }
{ const q=arena('shuang',1,80); E(q).thorns=3; const hp=q.hp; playId(q,'kanshou'); t(hp-q.hp===3,'石傀儡反震：攻擊牌打它被震傷（每張牌一次）',hp-q.hp); }
{ const q=arena('qingli',2,60); E(q).intent={n:'列陣',fx:[['blockAll',5]]}; q.battle.enemies[1].intent={n:'發呆',fx:[]}; G.endTurn(q); t(q.battle.enemies[1].block===5,'陰兵列陣：全隊格擋'); }
{ const evs=Object.keys(G.EVENTS).filter(k=>G.EVENTS[k].major); t(G.ORDER.every(w=>G.pathsOf(w).every(P=>evs.some(k=>G.EVENTS[k].major===P.id&&G.EVENTS[k].who===w))),'每條主修都有自己的事件',evs.length);
  const q=G.newRun('shuang',4,{major:'qinxin'}); let seen=new Set(); for(let k=0;k<60;k++){ q.seenEvents=[]; q.screen='map'; G.startEvent?G.startEvent(q):0; if(q.event) seen.add(q.event); } t(!seen.has('waterfall')&&!seen.has('sword_furnace'),'沒走的主修，不會遇到它的事件'); }
{ const q=G.newRun('shuang',4,{major:'guiyi'}); q.screen='event'; q.event='waterfall'; q.hp=40; G.choose(q,1); t(q.deck.includes('hanshuang+')&&q.hp===34,'主修事件：給強化過的牌'); q.screen='event'; q.event='sword_furnace'; G.choose(q,0); step(q,'fight'); t(q.battle.swords>=4,'主修事件：之後每場開場的效果（startFx）'); }
{ const xs=G.ORDER.map(w=>{ const q=arena(w,2,60); const e=q.battle.enemies[0]; e.id='xinmo'; e.mi=-1; const ns=[]; for(let k=0;k<4;k++){ G.chooseIntent(q,e); ns.push(e.intent&&e.intent.n); } return ns; });
  t(G.ENEMIES.xinmo.name==='魘'&&new Set(xs.map(x=>x.join())).size===5&&xs.every((x,i)=>x.join()===G.ENEMIES.xinmo.names[G.ORDER[i]].join()),'隱藏魔王是魘：招式名跟著眼前的角色換',JSON.stringify(xs[0]));
  t(G.ENEMIES.xinmo.moves.every(m=>m.n&&!/心魔/.test(m.n))&&G.ENEMIES.xinmo.names.shuang.length===G.ENEMIES.xinmo.moves.length,'魘的招式數字不變、名字一一對上');
  t(G.ORDER.every(w=>G.ENDINGS[w]&&G.ENDINGS[w].text.length>=3)&&G.EPILOGUE&&G.EPILOGUE.text.length>=3,'五位真結局＋共同尾聲');
  t(!/心魔/.test(JSON.stringify([G.ENEMIES,G.LORE,G.ENDINGS,G.EPILOGUE,G.SECTS_LORE,G.EVENTS,G.SERVANTS,G.GOALS,G.FATES])),'畫面資料裡不再出現「心魔」'); }
{ const q=G.newRun('chilian',3); q.hp=40; const n=(q.relics||[]).length; q.screen='event'; q.event='inlaw'; G.choose(q,0); t(q.hp===32&&(q.relics||[]).length===n+1,'未來的岳母：背白辰一路，失去 8 生命、拿到見面禮（法寶）'); t(G.EVENTS.inlaw.who==='chilian','未來的岳母只有赤練會遇到'); }
{ const m={}; const add=(n,w)=>{ if(n) (m[n]=m[n]||[]).push(w); };
  for(const k in G.CARDS) if(!k.endsWith('+')) add(G.CARDS[k].name,'卡'); for(const k in G.RELICS) add(G.RELICS[k].name,'法寶'); for(const k in G.PILLS) add(G.PILLS[k].name,'丹藥');
  for(const k of G.ORDER){ add(G.SERVANTS[k].np.name,'神通'); add(G.SERVANTS[k].passive.name,'被動'); } for(const k in G.ENEMIES){ add(G.ENEMIES[k].name,'敵人'); (G.ENEMIES[k].moves||[]).forEach(mv=>add(mv.n,'招式')); }
  const ok=new Set(['重擊']);   // 很普通的通用詞，卡牌和牛魔的招式都叫重擊沒關係
  const dup=Object.entries(m).filter(([n,v])=>v.length>1&&!v.every(x=>x==='招式')&&!ok.has(n)).map(([n,v])=>n+'('+v.join('/')+')');
  t(!dup.length,'卡牌、法寶、丹藥、神通、敵人與招式不撞名',dup.join(' ')); }
// 引擎稽核修正（2026-10-02）
{ const q=arena('qingli'); q.battle.vuln=1; E(q).intent={n:'砍',fx:[['atk',10]]}; const hp=q.hp; G.endTurn(q); t(hp-q.hp===15&&q.battle.vuln===0,'易傷撐到敵人出手才減（10 打成 15）',[hp-q.hp,q.battle.vuln]); }
{ const q=arena('qingli'); q.battle.fxDrawn=14; const n=q.battle.hand.length; G.OPS.draw({run:q,b:q.battle,log:[]},['draw',5]); t(q.battle.hand.length===n+1,'效果抽牌每回合最多 15 張（擋無限抽）',q.battle.hand.length-n); }
{ const q=arena('qingli'); q.hp=0; G.OPS.heal({run:q,b:q.battle,log:[]},['heal',10]); t(q.hp===0,'已經倒下就不會被同一張牌的回血救回來',q.hp); }
{ const q=arena('chilian',1,60); E(q).stun=1; E(q).charm=2; E(q).intent={n:'砍',fx:[['atk',20]]}; const hp=q.hp; G.endTurn(q); t(E(q).charm===0&&hp===q.hp,'被定住的那輪魅惑也一起散掉',[E(q).charm,hp-q.hp]); }
{ const q=G.newRun('qingli',3,{fates:['merchant']}); t(Math.abs(q.discount-0.75)<1e-9&&/merchant'\) \{ run\.discount = \(run\.discount \|\| 1\) \*/.test(SRC),'行商：七五折，跟乾坤袋疊乘（不會互相蓋掉）',q.discount); }
{ const q=G.newRun('qingli',9); q.relics=['book']; step(q,'fight'); t(q.battle.enemies.every(e=>e.weak===1),'懾魂鈴：開場的敵人虛弱 1');
  const p=arena('qingli'); p.relics=['book']; E(p).intent={n:'叫人',fx:[['summon','zhiren',1]]}; G.endTurn(p); const s=p.battle.enemies.slice(1); t(s.length>=1&&s.every(e=>e.weak===0),'懾魂鈴：之後叫來的援軍不吃虛弱',s.map(e=>e.weak).join()); }
{ const q=arena('qingli',1,80); q.battle.firstAtk=true; playId(q,'atk_qingli'); const a=80-E(q).hp; playId(q,'atk_qingli'); const b2=80-E(q).hp-a; t(a===12&&b2===6,'破甲針：第一次命中 +6，只算一次',[a,b2]); }
{ let miss=0; for(let s=1;s<=300;s++){ const q=G.newRun(G.ORDER[s%5],s); if(!q.map.some(row=>row.some(n=>n&&n.t==='shop'))) miss++; } t(!miss,'300 張地圖每章都有商店',miss); }
{ const q=G.newRun('qingli',4); q.deck=q.deck.slice(0,5); t(!G.canChoose(q,G.EVENTS.purge.opts[0])&&G.canChoose(q,G.EVENTS.purge.opts[1]),'牌組只剩 5 張：要移除牌的事件選項選不了'); }
{ const GEN=new Set(['dmg','hits','all','rand','block','draw','drainAll','pierce','pierceHits','heal','healP','energy','weak','vuln','weakAll','vulnAll','drain','nextEnergy','str','tstr']);
  const bare=Object.keys(G.CARDS).filter(k=>!k.endsWith('+')&&(G.ORDER.includes(G.CARDS[k].kit)||G.CARDS[k].path)&&!G.CARDS[k].isBasic&&!/^(atk|def)_/.test(k)&&G.CARDS[k].fx.every(f=>GEN.has(f[0])));
  t(!bare.length,'專屬牌都綁著自己的機制（不只是傷害／格擋／抽牌）',bare.map(k=>G.CARDS[k].name).join()); }
// 戰鬥稽核（2026-10-02 第二輪）：意圖數字就是真的打過來的、預計、時序
{ const q=arena('qingli'); E(q).intent={n:'群嚎',fx:[['strAll',1],['atk',3]]}; const shown=G.intentDmg(q,E(q),['atk',3]), hp=q.hp; G.endTurn(q); t(hp-q.hp===shown&&E(q).str===1,'意圖數字＝真的傷害（群嚎：先打，力量打完才加）',[shown,hp-q.hp]); }
{ const q=arena('qingli',2,60); E(q).intent={n:'低語',fx:[['vuln',2]]}; q.battle.enemies[1].intent={n:'砍',fx:[['atk',10]]}; const shown=G.intentDmg(q,q.battle.enemies[1],['atk',10]), hp=q.hp; G.endTurn(q); t(hp-q.hp===shown&&shown===10,'別的敵人上的易傷，這一輪打完才生效（意圖不會偷偷變大）',[shown,hp-q.hp]); }
{ let bad2=G.forecast?0:1; for(let s=1;s<=150&&G.forecast;s++){ const q=G.newRun(G.ORDER[s%5],s); q.screen='map'; G.reachable(q).forEach(c=>q.map[0][c].t='fight'); G.go(q,G.reachable(q)[0]); for(let k=0;k<6&&q.screen==='battle';k++){ const fc=G.forecast(q), hp=q.hp; G.endTurn(q); if(q.screen==='battle'&&fc.loss!==Math.max(0,hp-q.hp)) bad2++; } } t(!bad2,'「將受到」＝結束回合後真的掉的血（150 場隨機戰鬥）',bad2); }
{ const q=arena('aduo',1,40); q.battle.turn=2; E(q).id='jianmo'; E(q).hp=15; E(q).maxHp=60; q.battle.hand=['shaitan']; q.battle.energy=9; const p=G.preview(q,0,0,true); t(p.per[0]===15,'金蠶蠱預計：精英三成以下咬得死，數字是它剩的血（不是內部的大數字）',p.per[0]); }
{ const q=arena('shuang',1,50); q.battle.turn=2; E(q).block=20; q.battle.hand=['zhannian']; const p=G.preview(q,0,0); t(p.per[0]===6,'斬念預計：打掉的格擋不算傷害',p.per[0]); }
{ const q=arena('qingli',1,80); E(q).id='niumo'; E(q).stun=1; E(q).petrify=0; G.OPS.petrify({run:q,b:q.battle,tg:E(q),log:[]},['petrify',5]); t(E(q).stun===1&&E(q).petrify===5&&!(E(q).stuns>0),'已經定住的再貼定身：層數留著，不會白白重置',[E(q).petrify,E(q).stuns]); }
{ const q=arena('chilian'); q.battle.np=100; G.noble(q,0); E(q).intent={n:'砍',fx:[['atk',10]]}; q.battle.block=0; G.endTurn(q); t(q.battle.np>0,'放過神通後，敵人回合挨打照樣累積神通',q.battle.np); }
{ const q=arena('qingli',1,5); q.battle.np=0; playId(q,'atk_qingli'); const rw=JSON.stringify(q.reward); q.battle.np=100; const r=G.noble(q,0); t(!r.ok&&JSON.stringify(q.reward)===rw,'打贏之後不能再放神通（不會重抽戰利品）'); }
{ const q=arena('qingli',1,200); E(q).id='niumo'; E(q).lives=1; E(q).weak=2; E(q).hp=1; G.OPS.dmg({run:q,b:q.battle,tg:E(q),log:[],atk:false},['dmg',5]); t(E(q).weak===2&&E(q).hp>1,'敵人倒下又站起來：身上的虛弱還在',E(q).weak); }
{ const q=arena('aduo'); q.battle.turn=2; q.battle.freeAtk=1; swords(q,2); G.play(q,0,0); t(q.battle.freeAtk===1,'無影：0 費的飛劍不會吃掉「下一張攻擊不花靈力」'); }
{ const q=arena('qingli',2,30); E(q,1).hp=0; E(q).intent={n:'叫人',fx:[['summon','zhiren',1]]}; G.endTurn(q); t(q.battle.enemies.length===2&&q.battle.enemies[1].hp>0,'叫來的援軍補進倒下的空位（不會越積越多）',q.battle.enemies.length); }
{ const q=arena('shuang',1,5); E(q).thorns=3; q.hp=2; playId(q,'atk_shuang'); t(q.screen!=='over'&&q.hp===2,'打倒最後一個敵人的那一下，不會被它的反震震死',[q.screen,q.hp]); }
{ const q=arena('chilian',1,5); q.hp=2; playId(q,'rampage'); t(q.screen!=='over'&&q.hp===2,'血刃打倒最後一個敵人：自傷就不用付了',[q.screen,q.hp]); }
{ const q=G.newRun('shuang',8,{major:'wanjian'}); q.screen='major'; G.chooseMajor(q,'guiyi'); step(q,'fight'); const b=q.battle; b.swords=3; b.jy=0; b.enemies.forEach(e=>e.intent={n:'發呆',fx:[]}); G.endTurn(q); t(q.battle.jy>=9,'兼修歸一：沒用完的飛劍照說明化成劍意',q.battle.jy); }
{ const q=G.newRun('xiaoman',8,{major:'longzhan'}); q.screen='major'; G.chooseMajor(q,'longyou'); step(q,'fight'); const b=q.battle; b.kraken=9; const hp=b.enemies.map(e=>e.hp); b.enemies.forEach(e=>e.intent={n:'發呆',fx:[]}); G.endTurn(q); t(q.battle.enemies.every((e,i)=>e.hp===hp[i])&&q.battle.tstr>0,'兼修龍佑：阿白照說明不咬人、改加持白辰',q.battle.tstr); }
// 系統稽核（2026-10-03）
{ const r=G.newRun('qingli',1); r.deck=r.deck.map(x=>x+'+'); r.gold=100; t(!G.canChoose(r,G.EVENTS.castle.opts[1]),'沒有牌可以強化：花錢強化的選項選不了'); }
{ const r=G.newRun('shuang',1); r.deck.push('sword_rain+b'); r.hp=50; r.screen='event'; r.event='swordtomb'; const g=r.gold; G.choose(r,0); t(r.deck.filter(x=>x.startsWith('sword_rain')).length===1&&r.gold===g+50,'秘傳不重複拿：強化過的也算（換成 50 金）',r.deck.filter(x=>x.startsWith('sword_rain')).join()); }
{ const r=G.newRun('qingli',4); r.deck=r.deck.slice(0,6); r.hp=60; t(!G.canChoose(r,G.EVENTS.purge.opts[0])&&!G.canChoose(r,G.EVENTS.confess.opts[0]),'要移除兩、三張的事件：移除完牌組會少於 5 張就選不了'); r.deck=G.newRun('qingli',4).deck.slice(0,7); t(G.canChoose(r,G.EVENTS.purge.opts[0]),'七張牌：可以移除兩張'); }
{ let bad3=0; for(let s=1;s<=3000;s++){ const q=G.newRun(G.ORDER[s%5],s); const m=q.map; for(let r=0;r<m.length-1;r++) m[r].forEach(n=>{ if(n&&n.t==='elite'&&n.next.some(c=>m[r+1][c]&&m[r+1][c].t==='elite')) bad3++; }); } t(!bad3,'3000 張地圖沒有連著兩格精英',bad3); }
{ const r=G.newRun('qingli',3); r.act=2; r.floor=11; r.lane=r.map[10].findIndex(n=>n); r.boss='huyao'; G.go(r,2); r.battle.enemies.forEach(e=>{e.hp=1;e.lives=0;e.block=0;}); r.battle.hand=['atk']; r.battle.energy=1; G.play(r,0,0); t(r.screen==='reward'&&r.reward.pill&&r.reward.next==='secret','第二章魔王（留著玉符）：先拿獎勵再到魔淵入口',r.screen); G.takeReward(r,-1); t(r.screen==='secret','拿完獎勵到九幽魔淵入口',r.screen); }
t(G.EVENTS.whisper.noEndless,'鎮妖塔不會遇到「把玉符留到最後」');
// 卡牌說明對上實際（2026-10-03）
{ const q=arena('qingli'); E(q).petrify=2; E(q).str=0; t(G.intentDmg(q,E(q),['atk',6,1])===4&&G.intentDmg(q,E(q),['atk',6,4])===5,'鎮魂符：每層定身＝敵人力量 -1（連擊照力量的規則打折）',G.intentDmg(q,E(q),['atk',6,4])); }
{ const q=arena('qingli',1,80); E(q).petrify=2; E(q).stuns=0; playId(q,'tianlei'); t(80-E(q).hp===10,'天雷引：先劈雷（2 層 ×5）再貼符，不會因為定住層數歸零而劈空',80-E(q).hp); }
{ t(G.card('jiefa+c').npBonus===30&&G.card('jiefa+c').fx.filter(f=>f[0]==='draw').length===0,'共鳴：借法本來就抽牌，改成神通 +30%（不會多一個抽 1 張）'); }
{ const q=arena('shuang',1,80); q.battle.projUp=2; swords(q,3); playId(q,'broken'); t(80-E(q).hp===27,'劍氣迸裂也吃「本場飛劍傷害 +N」（3 把 ×(7+2)）',80-E(q).hp); }
{ const q=G.newRun('chilian',4); step(q,'fight'); q.battle.pBlock=10; q.battle.block=0; q.battle.enemies.forEach(e=>e.intent={n:'發呆',fx:[]}); G.endTurn(q); t(q.battle.block===Math.round(10*G.statsOf(q).def),'每回合格擋也吃根骨',q.battle.block); }
// 困難模式與鎮妖塔深處（2026-10-03）
{ t(G.card('abyss+f').cost===G.card('abyss+a').cost&&G.card('yangguan+f').cost===G.card('yangguan+a').cost&&G.card('abyss+f').cost>0,'★傳說：龍族血脈、陽關三疊這類翻倍的牌不會變 0 費（0 費又不消耗，重抽就一直翻倍）'); }
t(['plague','yangchong','abyss','yangguan'].every(k=>['a','b','c','d','e','f'].every(d=>{ const c=G.card(k+'+'+d); return !c||c.cost>0||c.ex; })),'翻倍類的牌怎麼強化都不會「0 費又不消耗」');
{ const q=arena('xiaoman'); q.battle.kraken=200; t(G.krakenBites(q.battle)===4,'阿白最多咬 4 口',G.krakenBites(q.battle)); }
{ const q=G.newRun('qingli',7); q.relics=G.relicPool(q).slice(); const g=q.gold; step(q,'chest'); t(!q.reward.relic&&q.reward.gold===60,'法寶拿光了：寶箱改成 60 金',JSON.stringify(q.reward)); G.takeChest(q); t(q.gold===g+60&&q.screen==='map','收下碎銀'); }
{ const q=G.newRun('shuang',8,{endless:true}); q.act=5; q.seenEvents=Object.keys(G.EVENTS); let bad=0; for(let i=0;i<200;i++){ q.screen='map'; G.startEvent(q); if(/"maxHp",\d/.test(JSON.stringify(G.EVENTS[q.event].opts))) bad++; } t(!bad,'事件都遇過了：再遇的不會是加最大生命的（不然鎮妖塔裡一路疊）',bad); }
{ const q=G.newRun('shuang',9,{endless:true}); q.act=5; t(G.makeEnemy(q,'huyao',0,0).str===18,'鎮妖塔魔王：每層力量 +4（第 3 層 6+12）',G.makeEnemy(q,'huyao',0,0).str); }
t(Object.values(G.EVENTS).filter(E=>E.who).every(E=>E.end&&E.end.length>=20),'劇情模式的插曲都有收尾（專屬事件的 end）');
{ const q=arena('shuang',1,80); q.hp=1; q.battle.block=3; E(q).intent={n:'砍',fx:[['atk',5]]}; E(q).str=0; const f=G.forecast(q); t(f.lethal&&f.loss===2,'將受到：會倒下的那一輪也顯示真的會挨多少（5 擋 3＝2，不是剩下的生命）',JSON.stringify(f)); }
{ const q=arena('aduo',1,80); E(q).hp=3; E(q).poison=9; E(q).intent={n:'砍',fx:[['atk',30]]}; const f=G.forecast(q); t(f.cleared&&f.loss===0,'敵人被毒先收掉：預告「撐不到出手」',JSON.stringify(f)); }
{ let dup=0; for(let s=1;s<=300;s++){ const q=G.newRun('qingli',s); step(q,'shop'); if(q.shop&&q.shop.pills[0].id===q.shop.pills[1].id) dup++; } t(!dup,'商店的兩顆丹藥不重複',dup); }
{ const q=G.newRun('xiaoman',3,{goals:['paths']}); const before=G.relicPool(q).includes('peijade'); q.screen='major'; G.chooseMajor(q,G.pathsOf('xiaoman').find(P=>!q.majors.includes(P.id)).id); t(before&&q.majors.length===2&&!G.relicPool(q).includes('peijade'),'白辰兩條主修都修了：同門玉佩不會出（拿到也沒東西給）'); }
{ const q=arena('qingli',1,80); q.relics=['lamp','pendant']; q.lives=1; q.maxHp=60; q.hp=40; E(q).intent={n:'砍',fx:[['atk',45]]}; G.endTurn(q); t(q.battle.lampUsed&&q.hp===12+12,'心燈：倒下又站起來（兩成生命）也會亮',q.hp); }
{ const q=arena('qingli',1,80); q.act=3; q.endless=false; q.hp=1; E(q).intent={n:'砍',fx:[['atk',30]]}; G.endTurn(q); t(q.screen==='over'&&q.win&&!q.trueEnd,'倒在九幽魔淵：兩章魔王都打倒了，照樣算通關（只是沒封住魘）',JSON.stringify([q.screen,q.win])); }
{ const q=arena('xiaoman',2,80); q.battle.kraken=10; q.battle.np=100; q.battle.npUsed=0; G.noble(q,0); t(q.battle.kraken===5&&80-E(q,0).hp>=10&&80-E(q,1).hp>=10,'龍吟：阿白朝全體吐息（阿白多大打多痛），吐完縮小一半',JSON.stringify([q.battle.kraken,E(q,0).hp,E(q,1).hp])); }
{ const q=arena('xiaoman',1,500); q.battle.kraken=6; q.battle.np=0; E(q).intent={n:'發呆',fx:[]}; G.endTurn(q); t(q.battle.np>=4,'白辰的神通量表：阿白長大、咬人都漲得動（一回合至少 4%）',q.battle.np); }
console.log(bad?'❌ '+bad+' 條失敗（通過 '+ok+'）':'✅ 全部 '+ok+' 條通過'); process.exit(bad?1:0);
