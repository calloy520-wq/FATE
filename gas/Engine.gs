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
  var ms = Math.round((p.circuits||30) * TUNING.SUPPLY_FACTOR);
  if(p.separated) ms = Math.round(ms * (p.hasSolo ? TUNING.SEP_SOLO : TUNING.SEP_PENALTY));
  var ley = TUNING.LEYLINE[p.leyline] || 0;
  var ws = p.isCasterHome ? TUNING.WORKSHOP : 0;
  return { ms: ms, ley: ley, ws: ws, net: ms + ley + ws - (p.upkeep||0) };
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

  function strike(att, def, an, dn){
    var hit = rankVal(att.six.敏捷) + d20_();
    var dodge = rankVal(def.six.敏捷) + d20_();
    if(hasFx_(def,'evade_ranged')){ dodge += 6; tag('避矢加護'); }
    if(hit <= dodge){ beats.push('〔閃避〕'+dn+' 避開了 '+an+' 的攻擊 ('+hit+'≤'+dodge+')'); return; }
    var dmg = Math.max(3, rankVal(att.six.筋力) + Math.floor(Math.random()*9) - Math.floor(rankVal(def.six.耐久)/2));
    var note = [];
    if(hasFx_(att,'burst')){ dmg = Math.round(dmg*1.2); note.push('魔力放出'); tag('魔力放出'); }
    if(hasTrait_(def,'神性') && hasSkillName_(att,'神殺')){ dmg *= 2; note.push('神殺×2'); tag('神殺'); }
    def.hp = Math.max(0, def.hp - dmg);
    beats.push('〔命中〕'+an+' → '+dn+' 造成 '+dmg+' 傷害'+(note.length?'（'+note.join('・')+'）':'')+
               ' ('+hit+'>'+dodge+') '+dn+' HP '+def.hp);
  }

  // 開場特殊招（寶具 / 令咒）
  if(mode){
    var isNP = (mode==='np' || mode==='sealnp');
    var d = isNP ? Math.round(rankVal(A.six.寶具)*1.6)+18 : Math.round(rankVal(A.six.筋力)*1.8)+25;
    B.hp = Math.max(0, B.hp - d);
    beats.push('〔'+(isNP?'寶具解放':'令咒・必中全力')+'〕'+A.cls+(isNP?'發動「'+(A.np||'寶具')+'」':'')+
               '造成 '+d+' 傷害！ '+B.cls+' HP '+B.hp);
    if(isNP) tag('寶具解放');
  }

  var round = 0;
  while(A.hp>0 && B.hp>0 && round<14){
    round++;
    var aFast = rankVal(A.six.敏捷) >= rankVal(B.six.敏捷);
    if(aFast){ strike(A,B,A.cls,B.cls); if(B.hp<=0) break; strike(B,A,B.cls,A.cls); }
    else     { strike(B,A,B.cls,A.cls); if(A.hp<=0) break; strike(A,B,A.cls,B.cls); }
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
    aHp: A.hp, bHp: B.hp, mpCost: mpCost
  };
}

/** 英靈殿原始列 → 引擎可用的從者物件 */
function heroFromRow_(row){
  return {
    id: row.servant_id, cls: row.cls, realName: row.realName,
    six: { 筋力:row.筋力, 耐久:row.耐久, 敏捷:row.敏捷, 魔力:row.魔力, 幸運:row.幸運, 寶具:row.寶具 },
    classSkills: row.classSkills || [], skills: row.skills || [], traits: row.traits || [],
    np: row.np, persona: row.persona, wars: row.wars, source: row.source
  };
}
