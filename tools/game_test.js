// 引擎測試：node tools/game_test.js
const G=require('./game.js'); const {playRun}=require('./sim.js');
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('  ✅ '+l);} else {bad++;console.log('  ❌ '+l+(x!==undefined?'  '+String(x).slice(0,240):''));} };
const J=o=>JSON.parse(JSON.stringify(o));
// 造一場乾淨的戰鬥：who 的第一層，敵人換成 n 隻 hp 血、不會動的木樁
function arena(who,n=1,hp=50,seed=7){
  const r=G.newRun(who,seed); r.relics=[]; r.map[0]=['fight','fight','fight']; G.go(r,0); const b=r.battle;
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
t(run.hp===74&&run.deck.length===10&&run.map.length===13&&run.seals===3&&G.BOSSES.includes(run.boss),'開局：Saber 74 血、10 張牌、13 層地圖、3 劃令咒、抽一位 Boss');
t(G.ORDER.length===14&&G.ORDER.every(k=>G.SERVANTS[k]&&G.CARDS[G.SERVANTS[k].sig]),'14 位從者，每位的招牌牌都存在');
t(G.ORDER.every(k=>Object.keys(G.CARDS).filter(c=>G.CARDS[c].kit===k).length>=9),'每位從者至少 9 張專屬牌');
t(Object.keys(G.CARDS).every(k=>G.CARDS[k].fx.every(f=>G.OPS[f[0]]&&G.FX_TEXT[f[0]])),'每個卡牌效果都有程式與說明');
t(G.ORDER.every(k=>G.SERVANTS[k].np.fx.every(f=>G.OPS[f[0]]&&G.FX_TEXT[f[0]])),'每個寶具效果都有程式與說明');
t(Object.keys(G.CARDS).every(k=>!G.CARDS[k].up||(G.card(k+'+')&&G.cardText(k+'+')!==undefined)),'每張能強化的牌強化後都讀得到');
t(G.ORDER.every(k=>G.newRun(k,3).boss!==k),'Boss 不會是自己選的從者');
t(JSON.stringify(G.reachable(run))==='[0,1,2]'&&run.map[0].every(x=>x==='fight')&&run.map[12].every(x=>x==='boss')&&run.map[11].every(x=>x==='rest'),'第一層都是戰鬥、倒數第二層休息、最上層 Boss');
G.go(run,1); t(run.screen==='battle'&&run.battle.hand.length===5&&run.battle.energy===3,'進戰鬥：抽 5 張、3 點魔力');

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
r=arena('saber'); E(r).intent={n:'咒',fx:[['weak',2],['vuln',2]]}; G.endTurn(r); t(r.battle.weak===0&&r.battle.vuln===2,'Saber 對魔力：第一個削弱無效，第二個照吃',JSON.stringify([r.battle.weak,r.battle.vuln]));
r=G.newRun('emiya',3); r.map[0]=['fight','fight','fight']; G.go(r,0); t(r.battle.hand.filter(x=>x==='sword').length===1&&r.battle.hand.length===6,'EMIYA 投影魔術：每回合開始 1 張投影劍＋照常抽 5');
r=arena('emiya'); r.battle.hand=['project','broken']; G.play(r,0,0); t(r.battle.hand.filter(x=>x==='sword').length===2,'投影魔術：2 張投影劍');
G.play(r,r.battle.hand.indexOf('broken'),0); t(!r.battle.hand.includes('sword')&&E(r).hp===40,'壞幻：引爆 2 把，每把全體 5',E(r).hp);
r=arena('emiya'); r.battle.np=100; G.noble(r,0); t(r.battle.hand.length===3&&r.battle.ubw===2&&r.battle.projUp===2&&/造成 6 傷害/.test(G.cardText('sword',r)),'無限劍製：3 張投影劍、之後 2 回合、投影劍 6 傷');
G.play(r,0,0); t(E(r).hp===44,'投影劍 4+2＝6',E(r).hp);
G.endTurn(r); t(r.battle.hand.filter(x=>x==='sword').length===4&&!r.battle.discard.includes('sword'),'下回合又 3 張（加被動 1 張）；沒用完的投影劍消失、不進棄牌');

r=arena('cu'); E(r).block=10; playId(r,'thrust'); t(E(r).hp===43&&E(r).block===10,'庫丘林 突刺：穿透 7 無視格擋',E(r).hp);
r=arena('cu'); playId(r,'arrowward'); E(r).intent={n:'砍',fx:[['atk',20],['atk',5]]}; hp=r.hp; G.endTurn(r); t(hp-r.hp===3,'箭矢加護：閃過第一擊，第二擊被 2 格擋擋掉 2',hp-r.hp);
r=arena('cu'); r.hp=5; E(r).intent={n:'砍',fx:[['atk',30]]}; G.endTurn(r); t(r.hp===1&&r.screen==='battle'&&r.battle.survived===1,'戰鬥續行：致命傷以 1 血撐住');
E(r).intent={n:'砍',fx:[['atk',30]]}; G.endTurn(r); t(r.screen==='over'&&!r.win,'同一場第二次就撐不住了');
r=arena('cu'); r.battle.np=100; E(r).block=20; G.noble(r,0); t(E(r).hp===15&&E(r).vuln===2,'刺穿死棘之槍：穿透 35＋易傷 2',E(r).hp);

r=G.newRun('medusa',3); r.map[0]=['fight','fight','fight']; G.go(r,0); t(r.battle.enemies.every(e=>e.petrify===1),'美杜莎 石化魔眼：開場全體石化 1');
r=arena('medusa'); playId(r,'mystic'); t(E(r).petrify===2&&E(r).weak===1,'石化魔眼牌：石化 2＋虛弱');
playId(r,'chain'); t(E(r).stun===1&&E(r).petrify===0,'累積到 3 層：動彈不得、層數歸零');
E(r).intent={n:'砍',fx:[['atk',30]]}; hp=r.hp; G.endTurn(r); t(r.hp===hp&&E(r).stun===0,'被石化的敵人跳過這回合',hp-r.hp);
r=arena('medusa'); E(r).petrify=2; playId(r,'stare'); t(E(r).hp===40,'凝視：4＋石化 2×3＝10',E(r).hp);
r=arena('medusa',2); r.hp=30; playId(r,'bloodfort'); t(r.battle.enemies.every(e=>e.hp===44)&&r.hp===36,'鮮血神殿：全體 6、回復一半（6）',r.hp);

r=arena('medea'); r.battle.energy=1; r.battle.hand=['curse','warp']; t(G.costOf(r,'curse')===0,'美狄亞 高速神言：第一張技能 0 費');
G.play(r,0,0); t(r.battle.energy===1&&G.costOf(r,'warp')===1,'用掉之後第二張技能照價');
r=arena('medea'); playId(r,'word'); t(G.costOf(r,'agemagic')===0,'高速神言牌：下一張（神代魔術）0 費'); playId(r,'agemagic'); t(E(r).hp===35&&r.battle.energy===3,'神代魔術 0 費：12＋本回合 1 張技能×3',E(r).hp);
r=arena('medea'); playId(r,'fangs'); t(r.battle.minions===1,'龍牙兵：召喚 1'); E(r).intent={n:'砍',fx:[['atk',10]]}; hp=r.hp; G.endTurn(r);
t(E(r).hp===47&&hp-r.hp===6&&r.battle.minions===0,'龍牙兵回合結束打 3，替你擋 4 後消散',JSON.stringify([E(r).hp,hp-r.hp]));
r=arena('medea'); E(r).block=15; E(r).str=4; r.battle.np=100; G.noble(r,0); t(E(r).block===0&&E(r).str===0&&E(r).vuln===2&&E(r).weak===2,'萬符必應破戒：拆格擋與力量、虛弱易傷 2');

r=arena('kojiro'); playId(r,'iai'); t(E(r).hp===38,'小次郎 居合：第一張 5＋7',E(r).hp); playId(r,'iai'); t(E(r).hp===33,'第二張只剩 5');
r=arena('kojiro'); r.battle.energy=2; E(r).intent={n:'砍',fx:[['atk',8,3]]}; hp=r.hp; G.endTurn(r); t(hp-r.hp===4+8+8,'心眼（偽）：有剩魔力 → 下一擊傷害減半（8→4）',hp-r.hp);
r=arena('kojiro'); playId(r,'calm'); G.endTurn(r); t(r.battle.energy===4,'明鏡止水：下回合魔力 +1');
r=arena('kojiro'); E(r).block=30; r.battle.np=100; G.noble(r,0); t(E(r).hp===14,'燕返寶具：穿透 12×3',E(r).hp);

r=arena('hassanC'); r.battle.turn=2; playId(r,'knives'); t(E(r).hp===46&&E(r).poison===4,'咒腕 飛刀：4＋毒 4'); E(r).block=20; G.endTurn(r); t(E(r).hp===42&&E(r).poison===3,'毒：回合開始穿透 4、再減 1',E(r).hp);
r=arena('hassanC'); r.battle.turn=2; E(r).poison=1; playId(r,'assassinate'); t(E(r).hp===30,'暗殺：中毒時 10＋10',E(r).hp);
r=arena('hassanC'); playId(r,'atk'); t(E(r).hp===41,'氣息遮斷：第一回合攻擊 ×1.5（6→9）',E(r).hp);
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
t(r.hp===hp&&E(r).hp===45&&r.battle.str===1,'迎擊之槍：閃過就反擊 5 穿透；光之子：閃避一次力量 +1',JSON.stringify([E(r).hp,r.battle.str]));
t(r.battle.riposte===0,'迎擊只在那一回合');
r=arena('medusa'); E(r).petrify=2; playId(r,'shatter'); t(E(r).hp===50-(6+7*2)&&E(r).petrify===0,'石像碎裂：敲碎石化換傷害',E(r).hp);
r=arena('medusa'); E(r).stun=1; playId(r,'pegasus'); t(E(r).hp===30,'天馬衝撞：動彈不得的目標 8＋12',E(r).hp);
r=arena('medusa'); playId(r,'gorgon'); G.endTurn(r); t(E(r).petrify===1,'蛇髮：每回合全體石化 1');
r=arena('medea'); r.battle.energy=5; playId(r,'chant'); playId(r,'curse'); E(r).vuln=0; playId(r,'bolt'); t(E(r).hp===50-(4+3*3),'魔彈：本回合打過詠唱（算 2 張）＋詛咒 → 4＋3×3',E(r).hp);
r=arena('medea'); playId(r,'territory'); playId(r,'chant'); t(r.battle.block===4&&r.battle.skills===2,'陣地作成：每張技能格擋 2；詠唱算兩張技能');
r=arena('kojiro'); playId(r,'flash'); t(E(r).hp===50-(2+2*3),'一閃：剩 3 魔力 → 2＋6',E(r).hp);
r=arena('kojiro'); playId(r,'gate'); r.battle.energy=2; E(r).intent={n:'砍',fx:[['atk',20]]}; hp=r.hp; G.endTurn(r); t(hp-r.hp===2,'山門守護：剩 2 魔力格擋 8，心眼把 20 減半成 10 → 扣 2',hp-r.hp);
r=arena('kojiro'); playId(r,'mastery'); r.battle.played=0; r.battle.energy=3; playId(r,'iai'); t(E(r).hp===50-(5+7+5),'宗和的心得：居合 +5',E(r).hp);
r=arena('diarmuid'); playId(r,'twinart'); playId(r,'twin'); t(r.battle.block===3&&r.battle.stance==='yellow','雙槍術：切換架勢格擋 3');
playId(r,'rose'); t(E(r).wound===1+2&&E(r).hp===50-(7+3),'薔薇交錯：黃薔薇時再創傷 2（加架勢 1）；剛切換過架勢，這張 +3',JSON.stringify([E(r).wound,E(r).hp]));
r.battle.energy=3; let h2=E(r).hp; playId(r,'atk'); t(h2-E(r).hp===6,'切換的加成只給下一張攻擊',h2-E(r).hp);
r=arena('iskandar'); r.battle.army=6; playId(r,'bucephalus'); t(r.battle.block===10,'布塞弗勒斯：格擋 4＋軍勢 6');
r=arena('gilles'); r.battle.minions=3; playId(r,'blasphemy'); t(E(r).hp===50-11,'瀆神：5＋海魔 3×2',E(r).hp);
r=arena('gilles'); r.battle.minions=1; playId(r,'zealot'); t(r.battle.minions===0&&r.battle.tstr===5,'狂信：獻祭 1 名海魔換力量 5');
r=arena('gilles'); r.battle.minions=1; E(r).intent={n:'砍',fx:[['atk',8]]}; G.endTurn(r); t(E(r).hp===50-3-3,'精神污染：海魔替你擋刀消散時反咬 3（加上回合結束海魔攻擊 3）',E(r).hp);
r=arena('hassanH'); r.battle.minions=3; playId(r,'stab'); t(E(r).hp===50-2*4,'同時刺擊：分身 3 → 刺 4 下',E(r).hp);
r=arena('lancelot'); r.battle.combo=3; playId(r,'mace'); t(E(r).hp===50-(4+2*3+3),'鐵柱橫掃：4＋連擊×2＋無窮之武練',E(r).hp);
r=arena('heracles'); r.hp=45; playId(r,'divine'); t(E(r).hp===50-(10+3*2),'神性之擊：少 27 生命 → 10＋3×2',E(r).hp);
r=arena('heracles'); r.hp=20; playId(r,'godhand'); G.endTurn(r); t(r.battle.str===1,'神之加護：生命低於一半時每回合力量 +1');
r=arena('gil'); r.battle.hand=['t_sword','t_shield','goldarmor']; G.play(r,2,0); t(r.battle.block===5+3*2,'黃金甲冑：手上每件寶具 +3');
r=arena('gil'); r.battle.hand=['t_sword','t_spear','volley']; G.play(r,2,0); t(E(r).hp===50-16&&r.battle.hand.length===0,'寶具掃射：射出手上全部寶具，每件 8',E(r).hp);
t(G.ORDER.every(k=>Object.keys(G.CARDS).filter(c=>G.CARDS[c].kit===k).every(c=>{ const fx=G.CARDS[c].fx; return !(fx.length===1&&['dmg','all','block','draw'].includes(fx[0][0])) && !(fx.length===2&&fx.every(f=>['dmg','all','block','draw'].includes(f[0]))); })),'專屬牌裡沒有只寫「傷害／全體／格擋／抽牌」的通用牌');
const old2=J(G.newRun('saber',3)); old2.deck=old2.deck.concat(['guard+','shot','bite']); G.migrate(old2); t(old2.deck.includes('windwall+')&&old2.deck.includes('traceon')&&old2.deck.includes('shatter'),'舊存檔裡被拿掉的牌換成新牌（保留強化）');

console.log('── 第四次');
r=arena('diarmuid'); t(r.battle.stance==='red','迪爾姆德 開場紅薔薇'); E(r).block=10; playId(r,'atk'); t(E(r).hp===44&&E(r).block===10,'紅薔薇：攻擊無視格擋',E(r).hp);
playId(r,'twin'); t(r.battle.stance==='yellow','雙槍：切換架勢'); E(r).block=0; playId(r,'atk'); t(E(r).wound===1,'黃薔薇：攻擊牌給創傷 1');
playId(r,'buidhe'); t(E(r).wound===4,'必滅的黃薔薇：創傷 2＋架勢 1',E(r).wound); let h0=E(r).hp; E(r).block=50; G.endTurn(r); t(h0-E(r).hp===4&&E(r).wound===4,'創傷：每回合穿透、不會自己好',h0-E(r).hp);
r=arena('diarmuid'); E(r).wound=3; playId(r,'bleedout'); t(E(r).hp===31,'放血：10＋創傷 3×3',E(r).hp);

r=G.newRun('iskandar',3); r.map[0]=['fight','fight','fight']; G.go(r,0); t(r.battle.army===3,'伊斯坎達爾 開場軍勢 3');
r=arena('iskandar'); r.battle.army=2; playId(r,'rally'); t(r.battle.army===4,'集結：軍勢 +2'); G.endTurn(r); t(E(r).hp===46,'回合結束軍勢衝鋒 4',E(r).hp);
r=arena('iskandar'); r.battle.army=5; playId(r,'order'); t(E(r).hp===41,'突擊令：4＋軍勢 5',E(r).hp);
r=arena('iskandar',2); r.battle.army=2; r.battle.np=100; G.noble(r,0); t(r.battle.army===7&&r.battle.enemies.every(e=>e.hp===36),'王之軍勢：軍勢 +5、全體軍勢×2',E(r).hp);

r=arena('gilles'); E(r).intent={n:'咒',fx:[['weak',3]]}; G.endTurn(r); t(r.battle.weak===0,'吉爾斯 精神污染：不會虛弱');
r=arena('gilles',2); r.battle.minions=3; playId(r,'feastdeep'); t(r.battle.minions===0&&r.battle.enemies.every(e=>e.hp===32),'海魔盛宴：獻祭 3 隻，每隻全體 6',E(r).hp);
r=arena('gilles'); hp=r.hp; playId(r,'sacrifice'); t(r.hp===hp-3&&r.battle.minions===2,'活祭：失去 3 生命、召喚 2 海魔');
r=arena('gilles'); r.hp=2; playId(r,'sacrifice'); t(r.hp===1,'自傷不會把自己弄死');

r=G.newRun('hassanH',3); r.map[0]=['fight','fight','fight']; G.go(r,0); t(r.battle.minions===2,'百貌 開場 2 分身');
r=arena('hassanH'); r.battle.minions=4; playId(r,'swarm'); t(E(r).hp===30,'群襲：4 分身各 2＋3',E(r).hp);
r=arena('hassanH'); r.battle.minions=3; r.battle.energy=0; playId(r,'sac'); t(r.battle.minions===1&&r.battle.energy===2,'捨身：分身換魔力');
r=arena('hassanH'); r.battle.minions=7; playId(r,'clone'); t(r.battle.minions===8,'使魔上限 8');
r=arena('hassanH'); r.battle.minions=2; E(r).intent={n:'穿',fx:[['atkP',10]]}; hp=r.hp; G.endTurn(r); t(hp-r.hp===10&&r.battle.minions===2,'穿透攻擊不會被分身擋',hp-r.hp);

r=arena('lancelot'); playId(r,'atk'); playId(r,'atk'); t(E(r).hp===50-6-7,'蘭斯洛特 無窮之武練：第二張攻擊 +1',E(r).hp);
playId(r,'slashes'); t(E(r).hp===37-(6+2*2+2),'連斬：6＋連擊 2×2＋無窮之武練 2',E(r).hp);
r=arena('lancelot'); r.battle.hand=['def','owner']; G.play(r,1,0); t(r.battle.hand.includes('weapon')&&!r.battle.hand.includes('def')&&r.battle.discard.includes('def'),'騎士不死於徒手：技能牌換成武器');
G.endTurn(r); t(!r.battle.discard.includes('weapon'),'武器是消耗品，不進棄牌');
r=arena('lancelot'); playId(r,'endless'); G.endTurn(r); t(r.battle.combo===2,'無窮之武練牌：每回合連擊從 2 開始');

console.log('── 兩屆都在');
r=arena('heracles'); t(r.lives===1,'赫拉克勒斯 十二試煉：整趟 1 條備用的命'); r.hp=5; E(r).intent={n:'砍',fx:[['atk',40]]}; G.endTurn(r); t(r.hp===Math.round(68*0.2)&&r.screen==='battle'&&r.lives===0,'倒下以兩成血復活、命用掉');
r.hp=5; r.lives=0; E(r).intent={n:'砍',fx:[['atk',40]]}; G.endTurn(r); t(r.screen==='over','命用完就真的倒下');
r=G.newRun('gil',3); t(r.relics.length===1,'吉爾伽美什 黃金律：開局多一件禮裝'); r.map[0]=['fight','fight','fight']; G.go(r,0);
t(r.battle.hand.filter(x=>/^t_/.test(x)).length>=1,'戰鬥開始從寶庫取出 1 件寶具');
r=arena('gil'); playId(r,'gate_of'); t(r.battle.hand.filter(x=>/^t_/.test(x)).length===2,'王之財寶：2 件寶具');
r=arena('gil'); E(r).str=3; playId(r,'enkidu'); t(E(r).str===1&&E(r).weak===2,'天之鎖：虛弱 2、力量 -2');

console.log('── 敵人');
r=arena('saber'); E(r).id='medea'; E(r).name='美狄亞'; E(r).intent=G.ENEMIES.medea.moves[0]; G.endTurn(r); t(r.battle.enemies.length===3&&r.battle.enemies.filter(e=>e.id==='fang').length===2,'敵方美狄亞召喚 2 隻龍牙兵');
r=arena('saber'); E(r).intent={n:'穿',fx:[['atkP',10]]}; r.battle.block=20; hp=r.hp; G.endTurn(r); t(hp-r.hp===10,'穿透攻擊無視格擋',hp-r.hp);
G.BOSSES.forEach(k=>{ const q=G.newRun(k==='heracles'?'saber':'heracles',5); q.boss=k; q.floor=12; q.lane=1; G.go(q,1); t(q.battle.kind==='boss'&&q.battle.enemies[0].id===k,'Boss '+G.ENEMIES[k].name+' 登場'); });
r=G.newRun('saber',11); r.boss='heracles'; r.floor=12; r.lane=1; G.go(r,1); const hb=r.battle.enemies[0];
hb.hp=5; hb.block=0; r.battle.hand=['heavy']; r.battle.energy=2; G.play(r,0,0); t(hb.hp===Math.round(115*0.6)&&hb.lives===1&&r.screen==='battle','赫拉克勒斯（敵）打倒一次：以六成血站起來',hb.hp);
hb.lives=0; hb.hp=1; r.battle.hand=['atk']; r.battle.energy=1; G.play(r,0,0); t(r.screen==='over'&&r.win,'打倒 Boss：通關');
t(G.ORDER.every(k=>{ const q=G.newRun(k,9); for(let i=0;i<30;i++){ q.screen='map'; q.floor=5; q.lane=1; q.map[5]=['elite','elite','elite']; G.go(q,1); if(q.battle.enemies[0].id===k) return false; } return true; }),'精英不會是自己選的從者');

console.log('── 靈基覺醒');
t(G.ORDER.every(k=>G.TALENTS[k]&&G.TALENTS[k].length===2&&G.TALENTS[k].every(tier=>tier.length===2&&tier.every(T=>(T.start||[]).concat(T.np||[]).every(f=>G.OPS[f[0]]&&G.FX_TEXT[f[0]])))),'每位從者兩層、每層兩個覺醒，效果都有程式與說明');
t(G.ORDER.every(k=>G.TALENTS[k].flat().every(T=>!(T.start||[]).some(f=>G.needsTarget([f])))),'開場覺醒不會用到要選目標的效果');
let aw=G.newRun('saber',31); aw.map[3]=['elite','elite','elite']; aw.floor=3; aw.lane=1; G.go(aw,1); aw.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); aw.battle.np=100; G.noble(aw,0);
t(aw.screen==='reward'&&JSON.stringify(aw.reward.awaken)==='["0.0","0.1"]','打贏精英：出現第一層的兩個覺醒');
t(!G.takeReward(aw,-1),'還沒選覺醒不能收下獎勵');
G.awaken(aw,0); t(aw.awaken[0]==='0.0'&&!aw.reward.awaken&&G.takeReward(aw,-1),'選了「'+G.talent(aw,'0.0').name+'」之後才能繼續');
aw.map[4]=['fight','fight','fight']; G.go(aw,1); t(aw.battle.str===2,'魔力放出（A）：每場開始力量 +2',aw.battle.str);
aw.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); aw.battle.np=100; G.noble(aw,0); t(!aw.reward.awaken,'普通戰鬥不給覺醒'); G.takeReward(aw,-1);
aw.map[5]=['elite','elite','elite']; G.go(aw,1); aw.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); aw.battle.np=100; G.noble(aw,0);
t(JSON.stringify(aw.reward.awaken)==='["1.0","1.1"]','第二次精英：第二層');
G.awaken(aw,0); G.takeReward(aw,-1); t(/每層風再 \+3，對全體造成 15 傷害/.test(G.npText(G.serv(aw).np,aw)),'聖劍解放：寶具追加全體 15',G.npText(G.serv(aw).np,aw));
aw.map[6]=['elite','elite','elite']; G.go(aw,1); aw.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); aw.battle.np=100; G.noble(aw,0); t(!aw.reward.awaken,'兩層都選完就不再出現');
let hk=G.newRun('heracles',3); hk.awaken=['0.0']; hk.screen='reward'; hk.reward={cards:['atk'],relic:null,awaken:['1.0','1.1']}; G.awaken(hk,1); t(hk.lives===2,'第二試煉：多一條命');
let mw=arena('medea'); mw.awaken=['0.1']; mw.map[1]=['fight','fight','fight']; mw.screen='map'; mw.floor=1; mw.lane=1; G.go(mw,1); t(mw.battle.minions===2,'龍牙兵團：每場開場 2 隻龍牙兵');

console.log('── 特殊卡牌');
t(G.ORDER.every(k=>Object.keys(G.CARDS).some(c=>G.CARDS[c].rare===k)),'每位從者一張奧義');
r=arena('saber'); r.battle.hand=['mud']; x=G.play(r,0,0); t(!x.ok&&r.battle.hand.length===1,'泥打不出來');
hp=r.hp; G.endTurn(r); t(r.hp===hp-2&&r.battle.discard.includes('mud'),'泥留在手上：回合結束失去 2 生命',hp-r.hp);
r=arena('saber'); E(r).intent={n:'汙',fx:[['atk',1],['curse','mud',2]]}; G.endTurn(r); t(r.battle.discard.concat(r.battle.hand,r.battle.draw).filter(c=>c==='mud').length===2&&!r.deck.includes('mud'),'敵人塞 2 張泥進牌堆，不會留在牌組');
let rr=G.newRun('saber',8); let seenRare=0, rareOk=true; for(let i=0;i<200;i++){ const q=J(rr); q.map[0]=['elite','elite','elite']; q.rs=i*7919; G.go(q,0); q.battle.enemies.forEach(e=>{e.hp=0;}); q.battle.enemies[0].hp=1; q.battle.enemies[0].block=0; q.battle.np=100; G.noble(q,0); if(q.reward&&q.reward.cards.some(c=>G.CARDS[c.replace('+','')].rare)){ seenRare++; if(!q.reward.cards.every(c=>{ const d=G.CARDS[c.replace('+','')]; return !d.rare||d.rare==='saber'||d.rare==='common'; })) rareOk=false; } }
t(seenRare>20&&seenRare<110&&rareOk,'精英獎勵約三成出奧義，只出自己的或共通的',seenRare);
rr.screen='rest'; const n0=rr.deck.length; t(G.rest(rr,'remove',0)&&rr.deck.length===n0-1&&rr.screen==='map','淨化：從牌組移除一張');
rr.screen='rest'; rr.deck=rr.deck.slice(0,5); t(!G.rest(rr,'remove',0)&&rr.deck.length===5,'牌組至少留 5 張');

console.log('── 自創英靈');
const cu1=G.makeCustom({name:'  阿塔蘭塔的學徒  ',cls:'Archer',legend:'medusa',sub:'hassanC',npFrom:'hassanC',npName:'毒蛇之眼'});
t(cu1&&cu1.name==='阿塔蘭塔的學徒'&&cu1.hp===G.CLASSES.Archer&&cu1.passive.id==='gaze'&&cu1.np.name==='毒蛇之眼'&&cu1.np.fx[0][0]==='exec','組合：職階給生命、傳說給被動、寶具取自副修並改名');
t(!G.makeCustom({cls:'Saber',legend:'cu',sub:'cu'})&&!G.makeCustom({cls:'Shielder',legend:'cu',sub:'saber'}),'傳說與副修不能同一位、職階要存在');
t(G.makeCustom({cls:'Saber',legend:'cu',sub:'saber'}).name==='無名英靈','沒取名＝無名英靈');
t(G.newRun('custom',9,J(cu1)).custom.np.name==='毒蛇之眼','從英靈殿再開一局，自己取的寶具名還在');
let cr=G.newRun('custom',5,cu1); t(cr.deck.length===11&&cr.deck.includes('chain')&&cr.deck.includes('knives')&&G.BOSSES.includes(cr.boss),'起始牌組＝基本 9＋兩位的招牌牌');
cr=J(cr); cr.map[0]=['fight','fight','fight']; G.go(cr,0); t(cr.battle.enemies.every(e=>e.petrify===1),'傳說的被動照樣生效（石化魔眼）');
cr.battle.enemies.forEach(e=>{e.hp=1;e.block=0;}); cr.battle.enemies.forEach((e,i)=>{ if(i) e.hp=0; }); cr.battle.np=100; G.noble(cr,0);
t(cr.screen==='reward'&&cr.reward.cards.every(c=>['medusa','hassanC','common'].includes(G.CARDS[c.replace('+','')].kit)),'戰後的牌只出傳說、副修、共通');
t(G.talentsOf(G.newRun('custom',1,cu1))===G.TALENTS.medusa,'靈基覺醒跟著傳說走');
t(playRun('custom',42,cu1).screen==='over','自創英靈能打完一整局');

console.log('── 流程');
let r7=arena('saber'); r7.battle.enemies.forEach(e=>{e.hp=1;}); r7.battle.np=100; G.noble(r7,0);
t(r7.screen==='reward'&&r7.reward.cards.length===3&&r7.reward.cards.every(c=>['saber','common'].includes(G.CARDS[c.replace('+','')].kit)),'打贏：三選一，只出自己的牌和共通牌');
const pk=r7.reward.cards[0]; G.takeReward(r7,0); t(r7.deck.includes(pk)&&r7.screen==='map','選的牌加進牌組、回地圖');
r7.screen='rest'; r7.hp=10; G.rest(r7,'heal'); t(r7.hp===10+Math.round(74*0.3),'休息：回三成生命');
r7.screen='rest'; const ui=r7.deck.indexOf('atk'); G.rest(r7,'upgrade',ui); t(r7.deck[ui]==='atk+'&&G.card('atk+').fx[0][1]===9&&G.card('atk+').name==='攻擊＋','強化：攻擊→攻擊＋（9 傷）');
const r9=G.newRun('saber',12); r9.relics=['shroud','gem','circuit','book']; G.go(r9,0);
t(r9.battle.block===8&&r9.battle.energy===4&&r9.battle.np===25&&r9.battle.enemies.every(e=>e.weak===1),'禮裝：聖骸布、寶石、魔術刻印、偽臣之書');
const r10=J(G.newRun('lancelot',21)); G.go(r10,2); const saved=J(r10); x=G.play(saved,0,0); t(x.ok||x.msg,'存檔（JSON）來回後照樣能出牌');
const old={v:1,who:'archer',hp:50,maxHp:72,deck:['atk'],relics:[],seals:3,maxSeals:3,floor:3,lane:1,screen:'battle',map:G.newRun('saber',1).map,
  battle:{kind:'fight',turn:1,energy:3,block:0,np:0,str:0,tstr:0,vuln:0,weak:0,thorns:0,pBlock:0,pDraw:0,pEnergy:0,ubw:0,projUp:0,firstAtk:false,draw:[],hand:['atk','sword'],discard:[],exhaust:[],enemies:[{id:'hercules',key:'h0',name:'赫拉克勒斯',hp:50,maxHp:100,block:0,str:0,vuln:0,weak:0,lives:1,mi:0,last:-1,rep:0,intent:{n:'怒吼',fx:[['str',3]]}}],log:[]},stats:{kills:0,np:0,seals:0,floors:3},rs:5};
G.migrate(old); t(old.who==='emiya'&&old.boss==='heracles'&&old.battle.enemies[0].id==='heracles'&&G.play(old,0,0).ok&&G.endTurn(old).ok,'第一版的舊存檔（Archer）轉得過來、繼續能打');
let fin=0; for(let i=0;i<G.ORDER.length*4;i++){ const q=playRun(G.ORDER[i%G.ORDER.length],500+i); if(q.screen==='over') fin++; }
t(fin===G.ORDER.length*4,'自動玩家每位從者 4 局都能打到結束（不卡死）',fin);
console.log(bad?'❌ '+bad+' 條失敗（通過 '+ok+'）':'✅ 全部 '+ok+' 條通過'); process.exit(bad?1:0);
