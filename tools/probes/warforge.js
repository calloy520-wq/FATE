// 🛠️ 新英靈工房：驗表單、寫一整列英靈殿（逐欄）、擁有者、原創在新聖杯戰爭與鑑賞都叫得出來。
const P=require('./probe.js'); const {ctx,evalIn,sheets}=P;
let ok=0,bad=0; const t=(c,l,x)=>{ if(c){ok++;console.log('   ✅ '+l);} else {bad++;console.log('   ❌ '+l+(x?'  '+String(x).slice(0,220):''));} };
const run=u=>JSON.parse(evalIn('handleGameAction('+JSON.stringify(JSON.stringify(u))+')'));
const H=JSON.parse(evalIn('JSON.stringify(COL.HERO)'));
const A='工房甲', B='工房乙';
sheets['帳號']._d.push([A,'','2026-09-24',''],[B,'','2026-09-24','']);
const hero=(o)=>Object.assign({ name:'白銀騎士', cls:'Saber', sex:'女', six:{筋力:'B',耐久:'C',敏捷:'B',魔力:'C',幸運:'D',寶具:'B'}, np:'銀月之劍', fx:['first_strike','ride'], look:'銀髮碧眼的女騎士', words:'認真又不服輸' }, o||{});
const rowOf=id=>sheets['英靈殿']._d.find(r=>String(r[H.ID])===id);

console.log('\n── ① 規則與清單');
let r=run({action:'war_forge_list',acctName:A});
t(r.success && r.rule.budget===evalIn('WAR_FORGE_.BUDGET') && r.rule.maxSkills===3 && r.rule.pts.EX===7 && r.rule.npFloor===evalIn('WAR_.NP_FLOOR') && r.skills.length===evalIn('WAR_FORGE_SKILLS_.length') && r.skills.every(s=>s.name&&s.txt), '規則：點數上限、3 技能、每階的價錢＝引擎的階級值（EX 7）；每個可挑技能都有名字和效果', JSON.stringify(r.rule));
t(r.canon.length===17 && r.mine.length===0, '原作 17 位、我還沒有原創');
t(r.clsSkills.Rider.join()==='對魔力,騎乘' && r.clsSkills.Caster.indexOf('陣地作成')>=0, '職階技能照 FORGE_CLS_SKILLS_', JSON.stringify(r.clsSkills));

console.log('\n── ② 表單驗證');
const bad1=(o,why)=>{ const x=run({action:'war_forge_save',acctName:A,hero:hero(o)}); t(!x.success, why, x.message); };
bad1({name:'Knight'},'真名沒有中文字 → 擋');
bad1({name:'阿爾托莉雅·潘德拉貢'},'撞原作真名 → 擋');
bad1({six:{筋力:'A',耐久:'A',敏捷:'A',魔力:'A',幸運:'A',寶具:'A'}},'全 A（20 點，跟 Saber 一樣）超過上限 → 擋');
bad1({six:{筋力:'EX',耐久:'EX',敏捷:'EX',魔力:'E',幸運:'E',寶具:'D'}},'稽核抓到的漏洞組：三格 EX、把不算數的魔力／幸運／寶具壓到底 → 擋');
bad1({six:{筋力:'A+',耐久:'C',敏捷:'B',魔力:'C',幸運:'D',寶具:'B'}},'不在 E～EX 的階級 → 擋');
bad1({fx:['first_strike','ride','stealth','mad']},'技能 4 個 → 擋');
bad1({np:''},'寶具沒名字 → 擋');
bad1({cls:'Ruler'},'不在七職階 → 擋');

console.log('\n── ③ 新做一位：逐欄檢查英靈殿');
r=run({action:'war_forge_save',acctName:A,hero:hero({fx:['first_strike','ride','nope']})});
t(r.success && r.id==='白銀騎士-Saber', '存好，ID＝真名-職階', JSON.stringify(r));
const row=rowOf('白銀騎士-Saber');
t(row && row[H.CLS]==='Saber' && row[H.NAME]==='白銀騎士' && row[H.SEX]==='女', 'ID／CLS／NAME／SEX');
t(JSON.parse(row[H.SIX]).寶具==='B' && Object.keys(JSON.parse(row[H.SIX])).length===6, 'SIX 是六格 JSON', row[H.SIX]);
t(JSON.parse(row[H.CLASS_SKILLS]).map(k=>k.fx).join()==='nullify_magic', 'CLASS_SKILLS：Saber 自動附對魔力', row[H.CLASS_SKILLS]);
t(JSON.parse(row[H.SKILLS]).map(k=>k.fx).join()==='first_strike,ride' && JSON.parse(row[H.SKILLS])[0].n==='直感', 'SKILLS：挑的兩個，表上沒有的 fx 被丟掉', row[H.SKILLS]);
t(row[H.NP]==='銀月之劍（B）' && evalIn('warNpName_('+JSON.stringify(row[H.NP])+')')==='銀月之劍', 'NP「寶具名（階級）」，切得回寶具名', row[H.NP]);
const pj=JSON.parse(row[H.PERSONA]);
t(pj.creator===A && pj.look==='銀髮碧眼的女騎士' && pj.words==='認真又不服輸', 'PERSONA：外貌、性格、作者', row[H.PERSONA]);
t(row[H.SOURCE]==='ai_gen' && row[H.WARS]==='[]' && row[H.TRAITS]==='[]' && row[H.ALIGN]==='中立' && row[H.DAILY_MOE]==='', 'SOURCE＝ai_gen、WARS／TRAITS 空陣列、陣營中立、退休欄留空');
t(String(row[H.DAILY_LOOK]).length>0, '鑑賞日常外貌有值（AI 失敗時退回外貌本身）', row[H.DAILY_LOOK]);
t(row.length>=H.DAILY_OUTFIT+1, '整列寬度蓋到最後一欄');
r=run({action:'war_forge_save',acctName:B,hero:hero()});
t(!r.success, '同名 → 擋', r.message);

console.log('\n── ④ 擁有者與修改');
r=run({action:'war_forge_list',acctName:A});
t(r.mine.length===1 && r.mine[0].owned===true && r.mine[0].fx.indexOf('ride')>=0 && r.mine[0].np==='銀月之劍', '甲看得到自己的原創（技能、寶具名都帶回來，編輯頁才預填得出來）', JSON.stringify(r.mine));
t(run({action:'war_forge_list',acctName:B}).mine.length===0, '乙看不到甲的原創');
r=run({action:'war_forge_save',acctName:B,id:'白銀騎士-Saber',hero:hero({np:'偷改'})});
t(!r.success, '乙改甲的 → 擋', r.message);
const pBefore=JSON.parse(rowOf('白銀騎士-Saber')[H.PERSONA]); pBefore.toMaster='一步之遙'; rowOf('白銀騎士-Saber')[H.PERSONA]=JSON.stringify(pBefore); evalIn('CacheService.getScriptCache().remove("FATE_HERO_CODEX")');
r=run({action:'war_forge_save',acctName:A,id:'白銀騎士-Saber',hero:hero({name:'改名了',cls:'Lancer',np:'新月之劍',fx:['tactics']})});
const row2=rowOf('白銀騎士-Saber');
t(r.success && row2[H.NAME]==='白銀騎士' && row2[H.CLS]==='Saber' && row2[H.NP]==='新月之劍（B）', '修改：真名與職階鎖住，其餘照改', JSON.stringify([row2[H.NAME],row2[H.CLS],row2[H.NP]]));
t(JSON.parse(row2[H.PERSONA]).toMaster==='一步之遙', '修改不會洗掉 PERSONA 其他鍵');
t(sheets['英靈殿']._d.filter(x=>String(x[H.ID])==='白銀騎士-Saber').length===1, '修改沒有多出一列');

console.log('\n── ⑤ 無主的舊原創：列得出來，改了就歸你');
const legacy=rowOf('白銀騎士-Saber').slice(); legacy[H.ID]='舊作-Archer'; legacy[H.NAME]='舊作'; legacy[H.CLS]='Archer';
const lp=JSON.parse(legacy[H.PERSONA]); delete lp.creator; legacy[H.PERSONA]=JSON.stringify(lp); sheets['英靈殿']._d.push(legacy); evalIn('CacheService.getScriptCache().remove("FATE_HERO_CODEX")');
r=run({action:'war_forge_list',acctName:B});
t(r.mine.some(h=>h.id==='舊作-Archer' && h.owned===false), '乙看得到無主的舊作（標無主）');
r=run({action:'war_forge_save',acctName:B,id:'舊作-Archer',hero:hero({name:'舊作',cls:'Archer'})});
t(r.success && JSON.parse(rowOf('舊作-Archer')[H.PERSONA]).creator===B, '乙改了就歸乙');

console.log('\n── ⑥ 新聖杯戰爭叫得出原創');
r=run({action:'war_new',acctName:A,pcName:'衛宮',sex:'男',war:'5th',heroId:'白銀騎士-Saber'});
t(r.success && r.view.sv.name==='白銀騎士' && r.view.sv.cls==='Saber', '指定原創召喚成功', r.message||'');
t(r.view.buttons.find(b=>b.t==='reroll').dis===true, '指定召喚就沒有重抽');
t(r.view.sv.traits.some(x=>/^對魔力：/.test(x)) && r.view.sv.traits.some(x=>/^軍略：/.test(x)), '技能照工房存的（職階技能＋挑的）', JSON.stringify(r.view.sv.traits));
t(!run({action:'war_new',acctName:B,pcName:'遠坂',sex:'女',war:'5th',heroId:'白銀騎士-Saber'}).success, '乙叫不到甲的原創');
const rj=run({action:'war_new',acctName:B,pcName:'遠坂',sex:'女',war:'5th',heroId:'EMIYA-Archer'});
t(!rj.success && /原作參戰者/.test(rj.message||''), '第五次指定第五次的原作從者 → 擋（玩家是額外加入的一組）', JSON.stringify(rj));
t(run({action:'war_new',acctName:B,pcName:'遠坂',sex:'女',war:'4th',heroId:'EMIYA-Archer'}).success, '別場戰爭的原作從者可以指定');
t(run({action:'war_new',acctName:B,pcName:'遠坂',sex:'女',war:'chaos',heroId:'EMIYA-Archer'}).success, '混亂隨機誰都能指定');

console.log('\n── ⑦ 鑑賞也叫得出原創');
const kpc=run({action:'enter_kanshou',acctName:A,pcName:'風音',pcSex:'女'}).pcId;
r=run({action:'kanshou_summon_hero',acctName:A,pcId:kpc,heroId:'白銀騎士-Saber'});
t(r.success, '鑑賞召喚原創成功', r.message||'');
const kd=sheets['鑑賞眾生']._d; const KC=JSON.parse(evalIn('JSON.stringify(COL.PC)'));
t(kd.some(x=>String(x[KC.NAME])==='白銀騎士'), '鑑賞眾生多了這一位');
console.log('\n── ⑧ 點數只算引擎讀的格、舊作不被弄壞、擋公式');
const pts=o=>evalIn('warSixPts_('+JSON.stringify(o)+')');
t(pts({筋力:'E',魔力:'A',耐久:'C',敏捷:'C',幸運:'EX',寶具:'E'})===5+3+3+3, '攻擊取筋力／魔力高者、幸運不算、寶具至少算 C');
t(pts({筋力:'EX',魔力:'E',耐久:'EX',敏捷:'EX',幸運:'E',寶具:'D'})===24, 'EX 算 7 點（跟引擎一樣）');
const html=require('fs').readFileSync(require('path').join(__dirname,'../../gas/Script_War.html'),'utf8');
const fe=html.match(/function warFePts_\(\) \{[\s\S]*?\n  \}/)[0];
const same=[{筋力:'E',魔力:'A',耐久:'C',敏捷:'C',幸運:'EX',寶具:'E'},{筋力:'EX',魔力:'E',耐久:'EX',敏捷:'EX',幸運:'E',寶具:'D'},{筋力:'B',魔力:'C',耐久:'C',敏捷:'B',幸運:'D',寶具:'B'}].every(six=>{
  const rule=run({action:'war_forge_list',acctName:A}).rule; const f=new Function('warForgeData_','warFe_', fe+'; return warFePts_();'); return f({rule},{six})===pts(six); });
t(same, '前端的點數算法跟後端 warSixPts_ 對得上（三組）');
const leg=rowOf('白銀騎士-Saber').slice(); leg[H.ID]='古董-Lancer'; leg[H.NAME]='Knight Old'; leg[H.CLS]='Lancer';
leg[H.SIX]=JSON.stringify({筋力:'A+',耐久:'C',敏捷:'B-',魔力:'D',幸運:'E',寶具:'C'}); leg[H.SKILLS]=JSON.stringify([{n:'心眼(真)',fx:'analyze'},{n:'神性',fx:'divine_core'}]);
const lp2=JSON.parse(leg[H.PERSONA]); lp2.creator=A; leg[H.PERSONA]=JSON.stringify(lp2); sheets['英靈殿']._d.push(leg); evalIn('CacheService.getScriptCache().remove("FATE_HERO_CODEX")');
const old=run({action:'war_forge_list',acctName:A}).mine.find(h=>h.id==='古董-Lancer');
t(old && old.six.筋力==='A' && old.six.敏捷==='B', '舊作的 A+／B- 讀成 A／B，不會整格退回 C', JSON.stringify(old&&old.six));
t(old && old.fx.join()==='first_strike' && old.lost.join()==='神性', '舊技能：心眼換成同一列的代表（直感）、新規則沒有的列出來告訴玩家', JSON.stringify(old&&[old.fx,old.lost]));
r=run({action:'war_forge_save',acctName:A,id:'古董-Lancer',hero:hero({name:'Knight Old',cls:'Lancer',six:old.six,fx:old.fx})});
t(r.success && rowOf('古董-Lancer')[H.NAME]==='Knight Old', '沒有中文字的舊作也改得了（真名鎖住、不重驗）', r.message||'');
r=run({action:'war_forge_save',acctName:A,hero:hero({name:'=0+0中',np:'@SUM(1)',look:'-壞',words:'+壞'})});
const inj=rowOf('0+0中-Saber');
t(r.success && inj && !/^[=+\-@]/.test(inj[H.NAME]) && !/^[=+\-@]/.test(inj[H.NP]) && !/^[=+\-@]/.test(JSON.parse(inj[H.PERSONA]).look), '開頭的 = + - @ 剝掉，寫進試算表不會變成公式', JSON.stringify(inj&&[inj[H.NAME],inj[H.NP]]));
r=run({action:'war_forge_save',acctName:A,hero:hero({name:'反斜線\\騎士'})});
t(r.success && rowOf('反斜線騎士-Saber'), '反斜線剝掉（前端 onclick 不會壞）', r.message||'');

console.log(bad ? '❌ '+bad+' 條失敗' : '✅ warforge.js '+ok+' 條全過');
