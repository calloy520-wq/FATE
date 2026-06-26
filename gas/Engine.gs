/**
 * Engine.gs — 純數值引擎（戰鬥 / 經濟 / 數值推導）
 * 不碰試算表 I/O；輸入狀態、輸出結果。所有數字都在這裡算。
 */

function d20_(){ return 1 + Math.floor(Math.random()*20); }

function hasFx_(sv, fx){
  return [].concat(sv.classSkills||[], sv.skills||[]).some(function(s){ return s.fx === fx; });
}
function hasSkillName_(sv, n){
  return [].concat(sv.classSkills||[], sv.skills||[]).some(function(s){ return (s.n||'').indexOf(n) >= 0; });
}
function hasTrait_(sv, t){
  return (sv.traits||[]).some(function(x){ return (x.n||'').indexOf(t) >= 0; });
}
// 單獨行動：取其階級（無則回 ''）
function soloRank_(sv){
  var s = [].concat(sv.classSkills||[], sv.skills||[]).filter(function(x){ return x.fx==='solo' || (x.n||'').indexOf('單獨行動')>=0; })[0];
  return s ? (s.r||'') : '';
}
// 御主消亡後，憑單獨行動可維持現界的時數（依階級；每 '+' ×1.25）。無此技→0（即時消滅）。
function soloHours_(rank){
  if(!rank) return 0;
  var base = String(rank).replace(/\+/g,''), plus = (String(rank).match(/\+/g)||[]).length;
  var h = (TUNING.SOLO_HOURS||{})[base] || 0;
  return Math.round(h * (1 + 0.25*plus));
}
// 魔術攻擊者：只有 Caster 的「普通攻擊」算魔術（用魔力、可被對魔力擋）。
// 魔眼/高速神言等是個別主動技，魔術判定在那邊各自處理，不該讓持有者的每一拳都變魔術。
function magicAtk_(sv){
  return sv.cls==='Caster';
}
// 神代魔術（Age of Gods）：現代的對魔力對其只有半效（穿透現代抗性）
function divineAge_(sv){ return hasFx_(sv,'divine_age'); }
// 對魔力減傷比例（0~0.9）：取對魔力技能的最高階級換算（A≈.9 / B≈.73 / C≈.55 / D≈.36 / E≈.18）
function antiMagicCut_(def){
  var r = 0;
  [].concat(def.classSkills||[], def.skills||[]).forEach(function(s){ if(s.fx==='nullify_magic') r = Math.max(r, rankVal(s.r)); });
  return r ? Math.min(0.9, r/55) : 0;
}

// ===== 主動技能（玩家發動・耗魔力）：fx → 種類與耗魔比例 =====
// bolt/petrify/zabaniya＝即時攻擊；heal＝回復；buffdmg/buffhit＝下一場戰鬥強化
var ACTIVE_FX_ = {
  fast_cast:    { label:'高速神言', kind:'bolt',     mp:0.16 },
  petrify:      { label:'魔眼',     kind:'petrify',  mp:0.20 },
  zabaniya:     { label:'妄想心音', kind:'zabaniya', mp:0.30 },
  gob:          { label:'王之財寶', kind:'gob',         mp:0.22 },
  chain:        { label:'天之鎖',   kind:'chain',       mp:0.18 },
  wind_strike:  { label:'風王鐵鎚', kind:'wind_strike', mp:0.16 },
  rule_breaker: { label:'破戒全咒', kind:'sever',       mp:0.25 },
  summon_horror:{ label:'螺湮城教本', kind:'summon',    mp:0.30 },
  gae_bolg:     { label:'刺穿死亡之棘', kind:'gaebolg', mp:0.24 },
  ubw:          { label:'無限劍製', kind:'ubw',         mp:0.24 },
  rune:         { label:'符文',     kind:'heal',     mp:0.14 },
  shapeshift:   { label:'變生',     kind:'heal',     mp:0.16 },
  str_up:       { label:'怪力',     kind:'buffdmg',  mp:0.14 },
  projection:   { label:'投影強化', kind:'buffdmg',  mp:0.14 },
  weapon_steal: { label:'武裝掠奪', kind:'buffdmg',  mp:0.20 },
  aim:          { label:'千里眼',   kind:'buffhit',  mp:0.12 },
  narrative:    { label:'故事創作', kind:'buffhit',  mp:0.14 }   // 漢斯：以故事看破弱點，提升下場命中
};
// 列出某從者的主動技能（依其技能 fx）
function activeSkills_(hero){
  if(!hero) return [];
  var out = [], seen = {};
  [].concat(hero.classSkills||[], hero.skills||[]).forEach(function(s){
    var m = ACTIVE_FX_[s.fx];
    if(m && !seen[s.fx]){ seen[s.fx] = 1; out.push({ fx:s.fx, name:s.n||m.label, rank:s.r||'', kind:m.kind, mpK:m.mp }); }
  });
  return out;
}
// 取戰鬥用 buff 物件（強化/減益），無則 null
function buffOf_(v){ return (v && typeof v === 'object') ? v : null; }
// 幸運的「運氣修正」：以 C(30) 為基準，亂局中運氣站誰那邊（EX+3 / A+2 / B+1 / C0 / D−1 / E−2）
function luckEdge_(sv){ return Math.round((rankVal(sv.six.幸運) - 30) / 10); }
// 靈基出力：當前靈基魔力%影響發揮——以 80%（自然維持線）為基準，越滿越亢奮、越枯竭越衰弱。
// 貼近原作「供魔充足則生龍活虎、被慎二那種餓著則發揮不出來」。回傳 hit/dmg/dodge 的修正點數。
// 100%:+5　80%:0　60%:−5　40%:−10　20%:−15　0%:−20（枯竭懲罰重、過充加成溫和）
function outputMod_(sv){
  var max = sv.mpMax || 0;
  if(max <= 0) return 0;
  var r = (sv.mp != null ? sv.mp : max) / max;
  return Math.max(-20, Math.min(5, Math.round((r - 0.8) * 25)));
}

/** 由六維推導 HP/MP 上限與每小時維持費 */
function deriveServant_(sv){
  var six = sv.six;
  var hpMax = rankVal(six.耐久)*TUNING.HP_K + TUNING.HP_BASE;
  var mpMax = rankVal(six.魔力)*TUNING.MP_K + TUNING.MP_BASE;
  var up = Math.round((rankVal(six.筋力)+rankVal(six.耐久)+rankVal(six.敏捷)+rankVal(six.魔力))/TUNING.UPKEEP_DIV
                      + rankVal(six.寶具)/TUNING.UPKEEP_DIV);
  if(hasFx_(sv,'mad') || hasSkillName_(sv,'狂化')) up = Math.round(up * TUNING.MAD_MULT);
  return { hpMax: hpMax, mpMax: mpMax, upkeep: up };
}

/**
 * 每小時供需淨值
 * @param p {circuits, upkeep, leyline, isCasterHome, separated, hasSolo}
 */
function economyNet_(p){
  var ms = Math.round((p.circuits||30) * TUNING.MASTER_REGEN_K);   // 御主迴路每小時回復
  if(p.hasWealth) ms = Math.round(ms * 1.4);                       // 黃金律：財寶/資源充裕，魔力回復 ×1.4
  if(p.separated) ms = Math.round(ms * (p.hasSolo ? TUNING.SEP_SOLO : TUNING.SEP_PENALTY));
  var ley = TUNING.LEYLINE[p.leyline] || 0;
  // 陣地作成：主場工房全額供能；無此技的 Caster（如 AI 生成）只有半額簡易結界
  var ws = p.isCasterHome ? (p.hasTerritory ? TUNING.WORKSHOP : Math.round(TUNING.WORKSHOP/2)) : 0;
  var craft = p.hasCrafting ? TUNING.CRAFT_SUPPLY : 0;   // 道具作成：自製魔力道具的免費供給
  // net＝（迴路回復＋環境免費供能）−維持費：>0 御主魔力庫長期穩定甚至能補滿靈基；<0 則庫存會被慢慢抽乾
  return { ms: ms, ley: ley, ws: ws, craft: craft, upkeep: (p.upkeep||0), net: ms + ley + ws + craft - (p.upkeep||0) };
}

/**
 * D20 對抗戰鬥結算
 * @param A 玩家從者 {cls, six, classSkills, skills, traits, np, hp, mp, mpMax}
 * @param B 敵從者   {cls, six, classSkills, skills, traits, np, hp}
 * @param mode false | 'np'(寶具,耗魔) | 'seal'(令咒必中) | 'sealnp'(令咒寶具)
 * @returns {beats[], firedTags[], winner:'A'|'B'|'draw', aHp, bHp, mpCost}
 */
function resolveCombat_(A, B, mode){
  var beats = [], fired = {};
  function tag(name){ fired[name] = true; }
  A._ambush = hasFx_(A,'stealth'); B._ambush = hasFx_(B,'stealth');   // 氣息遮斷者首擊奇襲（一次性）

  function strike(att, def, an, dn){
    var ab = buffOf_(att.buff), db = buffOf_(def.buff);                // 主動技強化／減益
    var amlance = hasFx_(att,'anti_magic_lance');                      // 破魔紅薔薇：消去敵方魔術強化、無效化魔力護甲
    if(amlance){ db = null; }                                          // 紅薔薇・破魔：敵的魔術強化（buff）盡數消去
    var selfmod = hasFx_(att,'self_mod');                              // 自我改造：強化過的軀體，攻勢更準更狠
    var ambush = att._ambush; if(ambush){ att._ambush = false; tag('氣息遮斷'); }  // 氣息遮斷：首擊奇襲
    var outA = outputMod_(att), outD = outputMod_(def);                // 靈基出力：魔力充足則亢奮、枯竭則衰弱
    if(outA<0) tag('魔力枯竭'); else if(outA>0) tag('靈基亢奮');
    var hit = rankVal(att.six.敏捷) + d20_() + ((ab&&ab.hit)||0) + (ambush?6:0) + (selfmod?2:0) + outA + luckEdge_(att);    // 幸運：運氣站攻方
    var dodge = rankVal(def.six.敏捷) + d20_() + ((db&&db.dodge)||0) + outD + luckEdge_(def);  // 幸運站守方；dodge 負＝石化遲滯更易被命中
    // 宗和的心得：對方永遠看不穿小次郎的攻擊，看破/預判類閃避（心眼・直感）對他無效
    if(hasFx_(att,'unreadable')){
      if(hasFx_(def,'first_strike') || hasFx_(def,'analyze')) tag('宗和的心得');
    } else {
      if(hasFx_(def,'first_strike')){ dodge += 3; tag('直感'); }      // 直感・危機察知：預判來襲、更易閃避（先機在回合排序處理）
      if(hasFx_(def,'analyze')){ dodge += 3; tag('心眼'); }           // 心眼：看破來招、更易閃避
    }
    if(hasFx_(def,'ride')){ dodge += 3; tag('騎乘'); }                // 騎乘：機動提升、更易閃避
    if(hasFx_(def,'evade_ranged')){ dodge += 6; tag('避矢加護'); }
    var tsubame = hasFx_(att,'tsubame');                              // 秘劍・燕返：三方位同時斬，封死退路、極難迴避
    if(tsubame){ dodge -= 8; }
    if(hit <= dodge){ beats.push('〔閃避〕'+dn+' 避開了 '+an+' 的攻擊 ('+hit+'≤'+dodge+')'); return; }
    var magic = magicAtk_(att);   // 魔術攻擊用魔力、可被對魔力擋；肉體攻擊用筋力、不受對魔力影響
    var dmg = Math.max(3, rankVal(magic?att.six.魔力:att.six.筋力) + Math.floor(Math.random()*9) - Math.floor(rankVal(def.six.耐久)/2) + ((ab&&ab.dmg)||0));
    var note = [];
    if(ab && ab.label){ note.push(ab.label); tag(ab.label); }                  // 主動強化生效
    if(hasFx_(att,'morale')){                                                  // 勇猛/卡里斯瑪：攻勢更猛
      if(hasFx_(def,'clear_mind')){ tag('透化'); }                            // 透化：清澈靜穆之心，不受勇猛/精神威壓干涉
      else { dmg += 3; note.push('勇猛'); tag('勇猛'); }
    }
    if(selfmod){ dmg += 3; note.push('自我改造'); tag('自我改造'); }            // 自我改造：改造之軀的殺傷力
    if(hasFx_(att,'burst')){ dmg = Math.round(dmg*1.2); note.push('魔力放出'); tag('魔力放出'); }
    if(magic){ var cut = antiMagicCut_(def);                                   // 對魔力硬扣魔術傷害
      if(cut>0 && divineAge_(att)){ cut *= 0.5; tag('神代魔術'); }              // 神代魔術：對魔力半效
      if(cut>0){ dmg = Math.max(1, Math.round(dmg*(1-cut))); note.push('對魔力 −'+Math.round(cut*100)+'%'); tag('對魔力'); } }
    if(tsubame){ dmg = Math.round(dmg*2.3); note.push('燕返・三段'); tag('燕返'); }  // 三段同時斬：一招三斬、難防難擋
    if(ambush){ dmg = Math.round(dmg*1.5); note.push('奇襲'); }                 // 氣息遮斷首擊：傷害×1.5
    if(hasTrait_(def,'神性') && hasSkillName_(att,'神殺')){ dmg *= 2; note.push('神殺×2'); tag('神殺'); }
    if(hasFx_(def,'divine_core') && !amlance){ dmg = Math.max(1, Math.round(dmg*0.82)); note.push('神核'); tag('神核'); }  // 女神之軀：受傷 −18%（紅薔薇可破）
    if(amlance){ note.push('破魔紅薔薇'); tag('破魔紅薔薇'); }                    // 破魔之槍：穿透魔力護甲/神核
    if(outA){ dmg = Math.max(1, Math.round(dmg*(1+outA/100))); note.push('出力'+(outA>0?'+':'')+outA); }  // 靈基出力對傷害的整體加成/衰減
    var newHp = def.hp - dmg;
    // 戰鬥續行：致命一擊下仍能撐住一次（每場一次），HP 留 1。黃薔薇（必滅）使傷口不癒，續戰無效。
    if(newHp <= 0 && hasFx_(def,'survive') && !def._survived && !amlance){
      def.hp = 1; def._survived = true; tag('戰鬥續行');
      beats.push('〔戰鬥續行〕'+an+'本應擊倒 '+dn+'，'+dn+' 卻憑驚人韌性撐住、僅餘一絲氣息');
      return;
    }
    def.hp = Math.max(0, newHp);
    beats.push('〔命中〕'+an+' → '+dn+' 造成 '+dmg+' 傷害'+(note.length?'（'+note.join('・')+'）':'')+
               ' ('+hit+'>'+dodge+') '+dn+' HP '+def.hp);
  }

  // 開場特殊招（寶具 / 令咒）
  if(mode){
    var isNP = (mode==='np' || mode==='sealnp');
    var d = isNP ? Math.round(rankVal(A.six.寶具)*1.6)+18 : Math.round(rankVal(A.six.筋力)*1.8)+25;
    if(isNP && hasFx_(A,'tactics')){ d = Math.round(d*1.15); tag('軍略'); }   // 軍略：寶具/全軍威力 +15%
    if(isNP && hasFx_(A,'divine')){ d = Math.round(d*1.10); tag('神性'); }    // 神性：神之權能 +10%
    var npNote = '';
    if(isNP && magicAtk_(A)){                       // 魔術系寶具（如 Caster）→ 吃對魔力減免
      var cutN = antiMagicCut_(B);
      if(cutN>0 && divineAge_(A)){ cutN *= 0.5; tag('神代魔術'); }   // 神代魔術：對魔力半效
      if(cutN>0){ d = Math.max(1, Math.round(d*(1-cutN))); npNote = '（對魔力 −'+Math.round(cutN*100)+'%）'; tag('對魔力'); }
    }
    var outN = outputMod_(A); if(outN){ d = Math.max(1, Math.round(d*(1+outN/100))); }   // 靈基出力影響寶具威力
    B.hp = Math.max(0, B.hp - d);
    beats.push('〔'+(isNP?'寶具解放':'令咒・必中全力')+'〕'+A.cls+(isNP?'發動「'+(A.np||'寶具')+'」':'')+
               '造成 '+d+' 傷害'+npNote+'！ '+B.cls+' HP '+B.hp);
    if(isNP) tag('寶具解放');
  }

  // 撤退門檻：一般交戰中任一方降到 50% HP 即停手（不纏鬥到死）。
  // 令咒（seal/sealnp）是「決死全力」，不受門檻限制、可分出生死。
  var aMax = A.hpMax || A.hp, bMax = B.hpMax || B.hp, fleeT = TUNING.FLEE_HP || 0.5;
  var forced = (mode==='seal' || mode==='sealnp');
  // 先機：直感者（單方持有時）搶先出手，無視敏捷差；否則比敏捷
  var aInst = hasFx_(A,'first_strike'), bInst = hasFx_(B,'first_strike');
  var aFirst = (aInst && !bInst) ? true : (bInst && !aInst) ? false : (rankVal(A.six.敏捷) >= rankVal(B.six.敏捷));
  if(aInst !== bInst) tag('直感');   // 先機成立
  // Archer 遠程開幕：交戰前先射一輪（敵接近中、難迴避）。以敏捷(射術)計，不吃寶具以免與寶具開幕雙重加成。
  function archerVolley_(att, def){
    if(att.cls!=='Archer') return;
    var dmg = Math.max(2, Math.round(rankVal(att.six.敏捷)*0.4) + Math.floor(Math.random()*5) - Math.floor(rankVal(def.six.耐久)/4));
    def.hp = Math.max(0, def.hp - dmg);
    beats.push('〔遠程開幕〕'+att.cls+' 趁 '+def.cls+' 接近前射出一擊，造成 '+dmg+' 傷害');
    tag('遠程射擊');
  }
  if(aFirst){ archerVolley_(A,B); if(B.hp>0) archerVolley_(B,A); }
  else      { archerVolley_(B,A); if(A.hp>0) archerVolley_(A,B); }
  var round = 0;
  while(A.hp>0 && B.hp>0 && round<14){
    round++;
    if(aFirst){ strike(A,B,A.cls,B.cls); if(B.hp<=0) break; strike(B,A,B.cls,A.cls); }
    else      { strike(B,A,B.cls,A.cls); if(A.hp<=0) break; strike(A,B,A.cls,B.cls); }
    if(!forced && (A.hp <= aMax*fleeT || B.hp <= bMax*fleeT)) break;   // 重傷 → 停手，撤退判定交給上層
  }

  // 耗魔（令咒供能則免）
  var mpCost = Math.round((A.mpMax||100) * TUNING.COMBAT_MP);
  if(mode==='np') mpCost += Math.round((A.mpMax||100) * TUNING.NP_MP);
  if(mode==='seal' || mode==='sealnp') mpCost = 0;

  var winner = (B.hp<=0 && A.hp>0) ? 'A' : (A.hp<=0 && B.hp>0) ? 'B' : 'draw';
  return {
    beats: beats,
    firedTags: Object.keys(fired),
    winner: winner,
    aHp: A.hp, bHp: B.hp, mpCost: mpCost,
    // 重傷（≤門檻）但未死 → 該方意圖撤退；上層據此處理逃跑/敵御主令咒反應
    aFlee: (A.hp>0 && A.hp <= aMax*fleeT),
    bFlee: (B.hp>0 && B.hp <= bMax*fleeT)
  };
}

// 十二試煉 / God Hand：偵測與復活
function hasGodHand_(hero){
  if(!hero) return false;
  var np = String(hero.np||'');
  if(np.indexOf('十二試煉')>=0 || /god\s*hand/i.test(np)) return true;
  return hasFx_(hero,'god_hand') || hasSkillName_(hero,'十二試煉');
}
/** 從者列倒下時呼叫：仍有命數 → 復活(留部分HP)並回傳剩餘命數；否則回 0(真死) */
function godHandRevive_(row){
  var lives = Number(row.status);
  if(isFinite(lives) && lives > 1){
    row.status = String(lives - 1);
    row.sv_hp = Math.max(1, Math.round((row.sv_hp_max||100) * 0.4));
    row.alive = true;
    return lives - 1;
  }
  return 0;
}

/** 英靈殿原始列 → 引擎可用的從者物件 */
function heroFromRow_(row){
  return {
    id: row.servant_id, cls: row.cls, realName: row.realName, gender: row.gender||'',
    six: { 筋力:row.筋力, 耐久:row.耐久, 敏捷:row.敏捷, 魔力:row.魔力, 幸運:row.幸運, 寶具:row.寶具 },
    classSkills: row.classSkills || [], skills: row.skills || [], traits: row.traits || [],
    np: row.np, persona: row.persona, wars: row.wars, source: row.source, align: row.align
  };
}

// ===== 陣營（雙軸字串如「混沌・善」）：邏輯只取善惡軸＋狂化，秩序/混沌軸保留供未來使用 =====
function alignGood_(hero){ var a=String((hero&&hero.align)||''); return a.indexOf('善')>=0?'good':a.indexOf('惡')>=0?'evil':'neutral'; }
function alignMad_(hero){
  if(!hero) return false;
  if(String(hero.align||'').indexOf('狂')>=0) return true;
  var sv = hero.six ? hero : heroFromRow_(hero);
  return hasFx_(sv,'mad') || hasSkillName_(sv,'狂化');
}
/** 對「獵食無辜者補魔」的態度：willing(惡/狂化) / reluctant(中立) / refuse(善) */
function feedDisposition_(hero){
  if(!hero) return 'reluctant';
  if(alignMad_(hero)) return 'willing';
  var g = alignGood_(hero);
  return g==='good' ? 'refuse' : g==='evil' ? 'willing' : 'reluctant';
}
