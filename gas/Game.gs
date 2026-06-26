/**
 * Game.gs — 遊戲流程：登入 / 開局 / 讀狀態 / 動作（全部 server 權威、寫回試算表）
 */

var NPC_SPAWN_ = ['tohsaka','ryuudou','matou','cemetery','school','harbor','park','hospital','shrine','arcade','factory','station','woods'];
// 正典御主的據點（4th/5th）；不在表中者（自創/混亂）預設新都公寓
var CANON_HOME_ = {
  '衛宮士郎':'emiya','遠坂凜':'tohsaka','間桐慎二':'matou','葛木宗一郎':'ryuudou',
  '言峰綺禮':'church','伊莉雅絲菲爾':'einzbern',
  '衛宮切嗣':'emiya','遠坂時臣':'tohsaka','肯尼斯':'apartment','韋伯·維爾維特':'apartment',
  '雨生龍之介':'harbor','間桐雁夜':'matou'
};
// 正典御主→正典據點；自創玩家→新都公寓；其餘(混亂NPC)→隨機分散
function homeOf_(name, isPlayer, pool, idx){
  return CANON_HOME_[name] || (isPlayer ? 'apartment' : pool[idx % pool.length]);
}

// ---------- 帳號 ----------
function login(name){
  name = (name||'').trim();
  if(!name) return { error:'請輸入帳號名稱' };
  var acc = findOne_(SHEETS.ACCOUNTS, { name: name });
  if(!acc){
    acc = { ms_id:'ms_'+Date.now(), name:name, created:new Date().toISOString(),
            current_game:'', inventory:[], settings:{ manaRating:'adult-fade' } };
    appendObj_(SHEETS.ACCOUNTS, acc);
  }
  return { ms_id: acc.ms_id, name: acc.name, current_game: acc.current_game };
}

// ---------- 靜態資料給前端 ----------
function getStatic(){
  var heroes = readAll_(SHEETS.HEROES).map(function(h){
    // wars：種子存成 "5th/fake" 字串、AI 生成存成陣列 → 一律正規化為陣列
    var wars = Array.isArray(h.wars) ? h.wars : String(h.wars||'').split('/').filter(function(x){ return x; });
    return { id:h.servant_id, cls:h.cls, realName:h.realName, np:h.np, wars:wars, source:h.source };
  });
  return {
    locations: readAll_(SHEETS.MAP),
    wars: readAll_(SHEETS.WARS),
    heroes: heroes,
    masters: readAll_(SHEETS.MASTERS)
  };
}

// ---------- 真名召喚（AI 生成寫回英靈殿）----------
function summonByName(opts){
  var name = (opts.name||'').trim(), cls = opts.cls;
  if(!name) return { error:'請輸入真名' };
  if(!cls)  return { error:'請先選擇職階' };
  // 已有 → 直接用
  var exist = findRows_(SHEETS.HEROES, function(h){ return h.cls===cls && String(h.realName).indexOf(name)>=0; })[0];
  if(exist) return { servant_id: exist.servant_id, generated:false };
  // 生成
  var g = generateServant_(name, cls, opts.desc);
  if(g.error) return { error:'AI 生成失敗：'+g.error };
  var sid = name+'-'+cls;
  if(findOne_(SHEETS.HEROES, { servant_id: sid })) sid = sid+'-'+Date.now();
  appendObj_(SHEETS.HEROES, {
    servant_id:sid, cls:cls, realName:name, wars:['自訂'],
    筋力:g.six.筋力, 耐久:g.six.耐久, 敏捷:g.six.敏捷, 魔力:g.six.魔力, 幸運:g.six.幸運, 寶具:g.six.寶具,
    classSkills:g.classSkills, skills:g.skills, traits:g.traits, np:g.np, persona:g.persona, source:'ai_gen'
  });
  return { servant_id: sid, generated:true };
}

// ---------- 開局 ----------
/**
 * @param opts {ms_id, mode:'canon'|'chaos', war, role:'canon'|'original',
 *              masterIndex, servantId, profile:{name,circuits,magic,melee,magic_rank}}
 */
function newGame(opts){
  var heroesById = {};
  readAll_(SHEETS.HEROES).forEach(function(h){ heroesById[h.servant_id] = h; });
  var mastersByKey = {};   // 御主殿（正典御主資料）
  readAll_(SHEETS.MASTERS).forEach(function(m){ mastersByKey[m.name+'|'+m.war] = m; });
  var gameId = 'g_'+Date.now();
  var parts = [];   // 參戰者描述

  function profileMaster(name, isPlayer, profile){
    var codex = (opts.mode==='canon') ? mastersByKey[name+'|'+opts.war] : null;
    if(codex){   // 正典御主：用御主殿資料
      return { master:name, circuits:codex.circuits||30, magic:codex.magic||'依正典設定',
               melee:codex.melee||'E', magic_rank:codex.magic_rank||'C',
               home:codex.home||'', wish:codex.wish||'', persona:codex.persona||'' };
    }
    var p = profile || {};
    var circuits = p.circuits || 30;
    return { master:name, circuits:circuits, magic:p.magic||'依正典設定',
             melee:p.melee||'E', magic_rank:p.magic_rank||(circuits>=45?'A':circuits>=30?'B':'C'),
             home:'', wish:p.wish||'' };
  }

  if(opts.mode === 'canon'){
    var war = findOne_(SHEETS.WARS, { war_id: opts.war });
    if(!war) return { error:'找不到戰爭：'+opts.war };
    var roster = war.roster; // [{master, sid}]
    roster.forEach(function(r, i){
      var isPlayer = (opts.role==='canon' && i===opts.masterIndex);
      parts.push(Object.assign(profileMaster(r.master, isPlayer), { isPlayer:isPlayer, servantId:r.sid }));
    });
    if(opts.role==='original'){
      var pm = profileMaster(opts.profile.name||'無名御主', true, opts.profile);
      parts.push(Object.assign(pm, { isPlayer:true, servantId:opts.servantId }));
    }
  } else { // chaos
    var classes = ['Saber','Archer','Lancer','Rider','Caster','Assassin','Berserker'];
    var byClass = {};
    readAll_(SHEETS.HEROES).forEach(function(h){ (byClass[h.cls]=byClass[h.cls]||[]).push(h.servant_id); });
    var names = ['遠坂','間桐','言峰','蒼崎','兩儀','衛宮','美遊'];
    var prof = opts.profile || {};

    // 找玩家從者職階，把玩家職階排第一，NPC 不重複使用同職階/同 servant_id
    var playerHero = heroesById[opts.servantId];
    if(!playerHero) return { error: '找不到英靈：'+opts.servantId+'，請重新選擇。' };
    var playerCls = playerHero.cls;
    var orderedClasses = [playerCls].concat(classes.filter(function(c){ return c !== playerCls; }));

    orderedClasses.forEach(function(cls, i){
      var isPlayer = (i === 0);
      var sid;
      if(isPlayer){
        sid = opts.servantId;
      } else {
        // NPC：同職階中排除玩家已用的 servant_id
        var pool = (byClass[cls] || []).filter(function(id){ return id !== opts.servantId; });
        if(!pool.length) return;   // 無可用英靈 → 跳過此職階
        sid = pool[0];
      }
      var nm = isPlayer ? (prof.name||'無名御主') : (names[i]+'？');
      parts.push(Object.assign(profileMaster(nm, isPlayer, isPlayer?prof:null), { isPlayer:isPlayer, servantId:sid }));
    });
  }

  // 組裝戰場列
  var rows = [], spawnIdx = 0;
  var spawnPool = NPC_SPAWN_.slice().sort(function(){ return Math.random()-0.5; });  // 混亂NPC隨機分散
  parts.forEach(function(p, slot){
    var hero = heroesById[p.servantId];
    if(!hero) return;
    var d = deriveServant_(heroFromRow_(hero));
    var isCaster = (hero.cls === 'Caster');
    var loc = p.home || homeOf_(p.master, p.isPlayer, spawnPool, spawnIdx++);   // 御主殿據點優先；自創→公寓；混亂NPC→隨機
    rows.push({
      game_id:gameId, slot:slot+1, is_player:p.isPlayer, master_name:p.master, magic:p.magic,
      circuits:p.circuits, master_hp:100, master_hp_max:100, master_mp:p.circuits*4, master_mp_max:p.circuits*4,
      seals:3, melee:p.melee, magic_rank:p.magic_rank, location:loc, servant_id:p.servantId,
      sv_hp:d.hpMax, sv_hp_max:d.hpMax, sv_mp:d.mpMax, sv_mp_max:d.mpMax, upkeep:d.upkeep,
      bond:30, true_name_known:false, status:'normal', alive:true,
      base_loc:p.isPlayer?loc:'', barrier:p.isPlayer?30:'', barrier_max:p.isPlayer?(isCaster?100:60):'',
      base_tier:p.isPlayer?(isCaster?'魔術工房':'簡易結界'):'', servant_loc:loc, separated:false
    });
  });
  appendObjs_(SHEETS.BATTLE, rows);
  appendObj_(SHEETS.CLOCK, { game_id:gameId, day:1, hour:20, ap:TUNING.AP_PER_DAY,
                             ap_max:TUNING.AP_PER_DAY, mana_countdown:0, mana_locked:false });
  var pp = parts.filter(function(x){ return x.isPlayer; })[0];
  var wish = (pp && pp.wish) || (opts.profile && opts.profile.wish) || '';   // 正史扮演用正典願望
  updateWhere_(SHEETS.ACCOUNTS, { ms_id:opts.ms_id }, { current_game:gameId, settings:{ wish:wish, manaRating:'adult-fade' } });

  logEvent_(gameId, 1, '20:00', 'start', 'START', 'slot_0', '', '聖杯戰爭開始。', true, 2);
  var st = getState(gameId);
  // 召喚開場（依從者個性 + 御主 + 願望）
  if(pp) st.opening = summonOpening_(heroesById[pp.servantId], pp.master, wish);
  return st;
}

// ---------- 讀狀態 ----------
function getState(gameId){
  var rows = findRows_(SHEETS.BATTLE, { game_id: gameId });
  var clock = findOne_(SHEETS.CLOCK, { game_id: gameId });
  var player = rows.filter(function(r){ return r.is_player===true; })[0];
  var st = {
    game_id: gameId, clock: clock,
    roster: rows.map(function(r){ return {
      slot:r.slot, cls: heroCls_(r.servant_id), master:r.master_name, isPlayer:r.is_player,
      alive:r.alive, location:r.location }; }),
    player: player ? playerView_(player) : null,
    economy: player ? playerEconomy_(player) : null
  };
  return st;
}

function heroCls_(sid){ var h = findOne_(SHEETS.HEROES, { servant_id: sid }); return h ? h.cls : '?'; }

function playerView_(p){
  var hero = findOne_(SHEETS.HEROES, { servant_id: p.servant_id });
  return {
    master:{ name:p.master_name, magic:p.magic, hp:p.master_hp, hpMax:p.master_hp_max,
             mp:p.master_mp, mpMax:p.master_mp_max, seals:p.seals, melee:p.melee, magicRank:p.magic_rank,
             circuits:p.circuits, location:p.location },
    servant:{ cls:p.servant_id ? hero.cls : '?', servantId:p.servant_id, realName:hero?hero.realName:'',
              trueNameKnown:p.true_name_known, hp:p.sv_hp, hpMax:p.sv_hp_max, mp:p.sv_mp, mpMax:p.sv_mp_max,
              upkeep:p.upkeep, bond:p.bond, six: hero?heroFromRow_(hero).six:{}, np:hero?hero.np:'',
              skills: hero?heroFromRow_(hero).skills:[], classSkills: hero?heroFromRow_(hero).classSkills:[],
              traits: hero?heroFromRow_(hero).traits:[], persona: hero?hero.persona:null,
              loc:p.servant_loc, separated:p.separated },
    base:{ loc:p.base_loc, barrier:p.barrier, barrierMax:p.barrier_max, tier:p.base_tier }
  };
}

function playerEconomy_(p){
  var hero = findOne_(SHEETS.HEROES, { servant_id: p.servant_id });
  var sl = p.separated ? p.servant_loc : p.location;
  var loc = findOne_(SHEETS.MAP, { id: sl });
  var hsv = hero ? heroFromRow_(hero) : { classSkills:[], skills:[] };
  return economyNet_({
    circuits:p.circuits, upkeep:p.upkeep, leyline: loc?loc.leyline:'低',
    isCasterHome: (hero && hero.cls==='Caster' && p.base_loc===sl),
    separated: p.separated, hasSolo: hasFx_(hsv,'solo') || hasSkillName_(hsv,'單獨行動')
  });
}

// ---------- 動作 ----------
/** @param a {game_id, type, ...payload} */
function doAction(a){
  var gameId = a.game_id;
  var rows = findRows_(SHEETS.BATTLE, { game_id: gameId });
  var clock = findOne_(SHEETS.CLOCK, { game_id: gameId });
  var p = rows.filter(function(r){ return r.is_player===true; })[0];
  if(!p) return { error:'找不到玩家存檔' };
  var hero = findOne_(SHEETS.HEROES, { servant_id: p.servant_id });
  var narration = '';

  // 補魔密封時段：封鎖耗時/戰鬥動作
  if(clock.mana_locked && ['move','attack','np','sleep','separate','claim'].indexOf(a.type)>=0)
    return { state:getState(gameId), narration:'（補魔進行中，無法進行該動作；請繼續對話，或用令咒「強制補魔」結束。）', events:[] };

  // 個性+好感 + 歷史事件/記憶 → 完整 context，讓 AI 不出戲、知道過去
  var gc = gameContext_(gameId);
  var mem = servantCtx_(p, hero) + (gc ? ('\n'+gc) : '');

  switch(a.type){
    case 'move':       narration = act_move_(p, clock, hero, a.locId, mem); break;
    case 'attack':     narration = act_combat_(rows, p, clock, hero, false, true, mem); break;
    case 'np':         narration = act_combat_(rows, p, clock, hero, 'np', true, mem); break;
    case 'mana':       narration = act_mana_(p, clock, mem); break;
    case 'feed':       narration = act_feed_(p); break;
    case 'reinforce':  narration = act_reinforce_(p, hero); break;
    case 'separate':   narration = act_separate_(p); break;
    case 'claim':      narration = act_claim_(p, clock, hero, mem); break;
    case 'sleep':      narration = act_sleep_(p, clock, mem); break;
    case 'seal':       narration = act_seal_(rows, p, clock, hero, a.cmd); break;
    case 'chat':
      if(clock.mana_locked){ narration = manaChat_(p, clock, a.text, mem); }
      else {
        var ext = narrateAndExtract_(a.text + '\n（玩家自由發言。依從者個性與好感度回應，無禮/猥褻則抗拒；與已知世界線一致。）', mem);
        narration = ext.narration;
        (ext.facts||[]).forEach(function(f){ recordFact_(gameId, clock.day, f.entity, f.content, f.importance); });
      }
      break;
    default: return { error:'未知動作：'+a.type };
  }

  // NPC 自律（耗時動作後推進世界；補魔鎖定中不跑）
  var events = [];
  var fresh = findOne_(SHEETS.CLOCK, { game_id: gameId });
  if(!fresh.mana_locked){
    if(['move','attack','np','claim'].indexOf(a.type) >= 0){
      events = npcTick_(gameId, findRows_(SHEETS.BATTLE,{game_id:gameId}), fresh);
    } else if(a.type === 'sleep'){
      for(var k=0;k<3;k++) events = events.concat(npcTick_(gameId, findRows_(SHEETS.BATTLE,{game_id:gameId}), fresh));
    }
  }
  // 結局判定：玩家從者/御主死亡 → 死亡；敵方全滅 → 奪杯
  var fresh2 = findRows_(SHEETS.BATTLE, { game_id: gameId });
  var pf = fresh2.filter(function(r){ return r.is_player===true; })[0];
  var endR = null;
  if(pf){
    if(pf.sv_hp<=0 || pf.master_hp<=0) endR = 'death';
    else { var en = fresh2.filter(function(r){ return r.is_player!==true; });
           if(en.length && en.every(function(r){ return !r.alive; })) endR = 'win'; }
  }
  var over = endR ? endGame_(gameId, pf, endR, mem) : null;

  return {
    state: over ? null : getState(gameId), narration: narration,
    events: events.filter(function(e){ return e.global || e.atPlayer; }).map(function(e){ return e.text; }),
    gameOver: over
  };
}

// ---------- 結局：願望假夢 / 奪杯 → 老虎道場 → 寫歷史 → 清空該場 ----------
function endGame_(gameId, p, result, mem){
  var acc = findOne_(SHEETS.ACCOUNTS, { current_game: gameId }) || {};
  var wish = (acc.settings && acc.settings.wish) || '未明';
  var name = acc.name || p.master_name;
  var clock = findOne_(SHEETS.CLOCK, { game_id: gameId }) || { day:1 };
  var svcls = heroCls_(p.servant_id);
  var dream, summary;
  if(result === 'death'){
    dream = narrateScene('【死亡的假夢】御主 '+name+' 在意識消逝的瞬間，墜入聖杯展示的幻夢——願望「'+wish
      +'」彷彿已然實現。請寫一段淒美而虛幻、令人不忍的「願望成真假夢」，最後夢境崩解、回歸虛無。4~6 句。', mem);
    summary = '第'+clock.day+'天　'+svcls+'之御主「'+name+'」殞落於聖杯戰爭。';
  } else {
    dream = narrateScene('【奪得聖杯】御主 '+name+' 成為最後勝者，聖杯於眼前顯現，願望「'+wish
      +'」。請寫一段莊嚴而意味深長的奪杯敘述（聖杯或許並不單純）。4~6 句。', mem);
    summary = '第'+clock.day+'天　'+svcls+'之御主「'+name+'」奪取聖杯，贏得戰爭。';
  }
  appendObj_(SHEETS.HISTORY, { ts:Date.now(), ms_id:acc.ms_id||'', name:name, result:result,
    war:'', servant_cls:svcls, day:clock.day, summary:summary });
  clearGame_(gameId);
  if(acc.ms_id) updateWhere_(SHEETS.ACCOUNTS, { ms_id:acc.ms_id }, { current_game:'' });
  return { result:result, dream:dream, dojo:tigerDojo_(result), summary:summary };
}

function tigerDojo_(result){
  if(result === 'win')
    return '🐯【老虎道場】藤村大河：「哼哼，居然真讓你贏了！可惡，午餐錢拿來！」　伊莉雅：「恭喜～不過聖杯可不是那麼單純的東西喔？」';
  return '🐯【老虎道場】藤村大河：「嗚哇——你死掉了啦！別擔心，老師我會好好教你的！」　伊莉雅：「下次記住：危急時用令咒『緊急脫離』逃跑，別硬撐到從者被打爆喔。」';
}

// 清空某場的動態資料（保留其他玩家的場次與歷史，多人安全）
function clearGame_(gameId){
  [SHEETS.BATTLE, SHEETS.CLOCK, SHEETS.MEMORY, SHEETS.EVENTS].forEach(function(name){
    var keep = readAll_(name).filter(function(r){ return r.game_id !== gameId; });
    rewriteSheet_(name, keep);
  });
}
function rewriteSheet_(name, objs){
  var s = sheet_(name), last = s.getLastRow();
  if(last > 1) s.getRange(2,1,last-1,s.getLastColumn()).clearContent();
  if(objs.length){
    var rows = objs.map(function(o){ return toRow_(name, o); });
    s.getRange(2,1,rows.length,HEADERS[name].length).setValues(rows);
  }
}

// 歷史紀錄（登入後選單用）
function getHistory(msId){
  return findRows_(SHEETS.HISTORY, { ms_id: msId })
    .sort(function(a,b){ return (b.ts||0)-(a.ts||0); })
    .map(function(h){ return { result:h.result, summary:h.summary, day:h.day, ts:h.ts }; });
}

// ---------- NPC 自律：移動 + 回復 + 碰撞解析（每 tick 最多 1 場戰鬥）----------
function npcTick_(gameId, rows, clock){
  var locs = readAll_(SHEETS.MAP);
  var adjOf = {}, leyOf = {};
  locs.forEach(function(l){ adjOf[l.id] = l.adj || []; leyOf[l.id] = l.leyline; });
  var player = rows.filter(function(r){ return r.is_player===true; })[0];
  var npcs = rows.filter(function(r){ return r.is_player!==true && r.alive===true; });
  var events = [];

  // 移動（30%）+ 依靈脈回血回魔
  npcs.forEach(function(n){
    if(Math.random() < 0.3){
      var a = adjOf[n.location] || [];
      if(a.length){ n.location = a[Math.floor(Math.random()*a.length)]; n.servant_loc = n.location; }
    }
    var ley = TUNING.LEYLINE[leyOf[n.location]] || 2;            // 靈脈越高恢復越快
    n.sv_hp = Math.min(n.sv_hp_max, (n.sv_hp||0) + ley);
    n.sv_mp = Math.min(n.sv_mp_max, (n.sv_mp||0) + Math.round(ley/2));
    updateRow_(SHEETS.BATTLE, n._row, { location:n.location, servant_loc:n.servant_loc, sv_hp:n.sv_hp, sv_mp:n.sv_mp });
  });

  // NPC×NPC 碰撞（30% 開戰、每 tick 限一場、非秒殺）
  var byLoc = {};
  npcs.filter(function(r){ return r.alive; }).forEach(function(n){ (byLoc[n.location]=byLoc[n.location]||[]).push(n); });
  var battled = false;
  Object.keys(byLoc).forEach(function(loc){
    var grp = byLoc[loc].filter(function(n){ return n.alive; });
    if(grp.length < 2) return;
    var a = grp[0], b = grp[1], roll = Math.random();
    if(roll < 0.3 && !battled){            // 開戰
      battled = true;
      npcSkirmish_(a, b);
      updateRow_(SHEETS.BATTLE, a._row, { sv_hp:a.sv_hp });
      updateRow_(SHEETS.BATTLE, b._row, { sv_hp:b.sv_hp });
      var dead = (a.sv_hp<=0) ? a : (b.sv_hp<=0) ? b : null;
      if(dead){
        dead.alive = false; updateRow_(SHEETS.BATTLE, dead._row, { alive:false });
        var win = (dead===a) ? b : a;
        var t = heroCls_(win.servant_id)+' 於'+locName_(loc)+'擊破了 '+heroCls_(dead.servant_id);
        logEvent_(gameId, clock.day, pad2_(clock.hour)+':00', loc, 'DEATH',
          'slot_'+(win.slot-1), 'slot_'+(dead.slot-1), t, true, 1);
        events.push({ text:'⚑ 傳聞：'+t+'。', global:true });
      } else {
        var t2 = heroCls_(a.servant_id)+' 與 '+heroCls_(b.servant_id)+' 在'+locName_(loc)+'激戰後各自退去';
        logEvent_(gameId, clock.day, pad2_(clock.hour)+':00', loc, 'STANDOFF',
          'slot_'+(a.slot-1), 'slot_'+(b.slot-1), t2, true, 0);
        events.push({ text:'⚑ 傳聞：'+t2+'。', global:true });
      }
    } else if(roll < 0.45){                // 結盟
      var t3 = heroCls_(a.servant_id)+' 與 '+heroCls_(b.servant_id)+' 在'+locName_(loc)+'達成暫時同盟';
      logEvent_(gameId, clock.day, pad2_(clock.hour)+':00', loc, 'ALLIANCE',
        'slot_'+(a.slot-1), 'slot_'+(b.slot-1), t3, true, 0);
      events.push({ text:'⚑ 傳聞：'+t3+'。', global:true });
    } // else 對峙/迴避：無事
  });

  // NPC 抵達玩家所在地
  npcs.filter(function(r){ return r.alive && r.location===player.location; }).forEach(function(n){
    events.push({ text:'⚠ '+heroCls_(n.servant_id)+'（'+n.master_name+'）出現在你的所在地！可選擇攻擊或迴避。', atPlayer:true });
  });
  return events;
}

// NPC 間短兵交手（3 回合互毆、低致命，HP 歸 0 才死）
function npcSkirmish_(a, b){
  var ha = findOne_(SHEETS.HEROES, { servant_id:a.servant_id });
  var hb = findOne_(SHEETS.HEROES, { servant_id:b.servant_id });
  function hit(att, def){ return Math.max(2, Math.round((rankVal(att.筋力)+Math.floor(Math.random()*9)-Math.floor(rankVal(def.耐久)/2))*0.7)); }
  var fast = rankVal(ha.敏捷) >= rankVal(hb.敏捷);
  for(var i=0;i<3 && a.sv_hp>0 && b.sv_hp>0;i++){
    if(fast){ b.sv_hp -= hit(ha,hb); if(b.sv_hp<=0) break; a.sv_hp -= hit(hb,ha); }
    else    { a.sv_hp -= hit(hb,ha); if(a.sv_hp<=0) break; b.sv_hp -= hit(ha,hb); }
  }
  a.sv_hp = Math.max(0, a.sv_hp); b.sv_hp = Math.max(0, b.sv_hp);
}
function locName_(id){ var l = findOne_(SHEETS.MAP, { id:id }); return l ? l.name : id; }

// ---------- 補魔倒數對話 ----------
function manaChat_(p, clock, text, ctx){
  var left = (clock.mana_countdown||0) - 1;
  if(left <= 0){
    p.sv_mp = p.sv_mp_max; p.bond = Math.min(100, p.bond + TUNING.MANA_BOND);
    updateRow_(SHEETS.BATTLE, p._row, { sv_mp:p.sv_mp, bond:p.bond });
    updateRow_(SHEETS.CLOCK, clock._row, { mana_countdown:0, mana_locked:false });
    advanceTime_(p, clock, null, TUNING.MANA_AP_COST);
    return narrateScene((text?('御主：「'+text+'」\n'):'')+'補魔完成，魔力填滿靈基。依從者個性與好感收尾（fade）。請寫含蓄的結束敘述。', ctx)
           + '\n（補魔結束：魔力回滿・好感 +'+TUNING.MANA_BOND+'）';
  }
  updateRow_(SHEETS.CLOCK, clock._row, { mana_countdown:left });
  return narrateScene((text?('御主：「'+text+'」\n'):'')+'補魔持續中。依從者個性與好感回應（無禮/猥褻則抗拒、冷淡；fade、點到為止）。請寫一段含蓄敘述。', ctx)
         + '\n（補魔進行中，剩 '+left+' 次對話）';
}

// 推進時間 + 每小時經濟 tick（mutate p / clock 並寫回）
function advanceTime_(p, clock, hero, apCost){
  for(var i=0;i<apCost;i++){
    if(clock.ap<=0) break;
    clock.ap--;
    for(var h=0;h<TUNING.HOURS_PER_AP;h++){
      clock.hour++; if(clock.hour>=24){ clock.hour=0; clock.day++; }
      var net = playerEconomy_(p).net;
      p.sv_mp = Math.max(0, Math.min(p.sv_mp_max, p.sv_mp + net));
      if(p.sv_mp<=0) p.sv_hp = Math.max(0, p.sv_hp - 3);
      else if(p.sv_hp<p.sv_hp_max) p.sv_hp = Math.min(p.sv_hp_max, p.sv_hp + Math.round(rankVal(hero?heroFromRow_(hero).six.耐久:'C')*TUNING.HP_REGEN_K));
    }
  }
  updateRow_(SHEETS.CLOCK, clock._row, { day:clock.day, hour:clock.hour, ap:clock.ap });
  updateRow_(SHEETS.BATTLE, p._row, { sv_mp:p.sv_mp, sv_hp:p.sv_hp });
}

function act_move_(p, clock, hero, locId, mem){
  var cur = findOne_(SHEETS.MAP, { id: p.location });
  if(!cur || (cur.adj||[]).indexOf(locId)<0) return '（該地點不相鄰，無法直接前往。）';
  if(clock.ap<1) return '（行動點不足，請睡覺恢復。）';
  p.location = locId; if(!p.separated) p.servant_loc = locId;
  updateRow_(SHEETS.BATTLE, p._row, { location:p.location, servant_loc:p.servant_loc });
  advanceTime_(p, clock, hero, 1);
  var dest = findOne_(SHEETS.MAP, { id: locId });
  return narrateScene('你（'+p.master_name+'）移動到了「'+dest.name+'」。'+dest.desc+' 請寫一段抵達敘述。', mem);
}

function act_combat_(rows, p, clock, hero, mode, costAP, mem){
  var enemyRow = rows.filter(function(r){ return r.is_player!==true && r.alive===true; })[0];
  if(!enemyRow) return '（場上已無可交戰的對手。）';
  if(mode==='np' && p.sv_mp < Math.round(p.sv_mp_max*TUNING.NP_MP)) return '（魔力不足，無法解放寶具——可用令咒強制或先補魔。）';
  if(costAP && clock.ap<1) return '（行動點不足，請睡覺恢復。）';

  var A = Object.assign(heroFromRow_(hero), { hp:p.sv_hp, mp:p.sv_mp, mpMax:p.sv_mp_max });
  var eHero = findOne_(SHEETS.HEROES, { servant_id: enemyRow.servant_id });
  var B = Object.assign(heroFromRow_(eHero), { hp:enemyRow.sv_hp });

  var res = resolveCombat_(A, B, mode);
  p.sv_hp = res.aHp;                          // 敗北則從者靈基崩解（HP 歸 0 → 觸發死亡結局）
  p.sv_mp = Math.max(0, p.sv_mp - res.mpCost);
  if(res.winner==='A'){ enemyRow.alive=false; p.bond = Math.min(100, p.bond+5); }
  updateRow_(SHEETS.BATTLE, p._row, { sv_hp:p.sv_hp, sv_mp:p.sv_mp, bond:p.bond });
  updateRow_(SHEETS.BATTLE, enemyRow._row, { sv_hp:res.bHp, alive:enemyRow.alive });
  if(costAP) advanceTime_(p, clock, hero, 1);

  logEvent_(p.game_id, clock.day, pad2_(clock.hour)+':00', p.location, 'BATTLE',
            'slot_0', 'slot_'+(enemyRow.slot-1),
            A.cls+' 對 '+B.cls+' 交戰，結果：'+res.winner, true, 1);

  return narrateCombat({ playerCls:A.cls, enemyCls:B.cls, winner:res.winner, firedTags:res.firedTags, beats:res.beats }, mem)
         + '\n\n戰報：' + res.beats.join('｜');
}

function act_mana_(p, clock, ctx){
  if(clock.mana_locked) return '（補魔已在進行中——繼續對話即可推進。）';
  updateRow_(SHEETS.CLOCK, clock._row, { mana_countdown:TUNING.MANA_TURNS, mana_locked:true });
  return narrateScene('你與從者開始補魔。依從者個性與好感度決定其態度（好感低則勉強/公事公辦、抗拒過度親密；好感高則有溫度），fade-to-black、點到為止。請寫一段含蓄起始敘述。', ctx)
         + '\n（補魔開始：接下來 '+TUNING.MANA_TURNS+' 次對話用於補魔，期間時間與 NPC 凍結）';
}
function servantCtx_(p, hero){
  if(!hero) return '';
  var ps = hero.persona || {};
  return '（從者：'+hero.cls+'，真名'+(p.true_name_known?hero.realName:'未公開')+'，個性「'+(ps.words||'')+'」，'
    + '一人稱「'+(ps.firstP||'我')+'」，對御主態度「'+(ps.toMaster||'')+'」，目前好感度 '+p.bond+'/100。'
    + '請嚴格依此人格與好感回應，保有自主與尊嚴。）';
}
function act_claim_(p, clock, hero, mem){
  if(clock.ap<1) return '（行動點不足，請睡覺恢復。）';
  if(p.base_loc===p.location) return '（此處已是你的據點。）';
  var isC = hero && hero.cls==='Caster';
  p.base_loc=p.location; p.barrier=30; p.barrier_max=isC?100:60; p.base_tier=isC?'魔術工房':'簡易結界';
  updateRow_(SHEETS.BATTLE, p._row, { base_loc:p.base_loc, barrier:p.barrier, barrier_max:p.barrier_max, base_tier:p.base_tier });
  advanceTime_(p, clock, hero, 1);
  return narrateScene('你在「'+locName_(p.location)+'」佈置新的據點與結界，放棄舊據點。請寫一段建立據點/工房的敘述。', mem);
}

function act_feed_(p){
  if(p.master_mp<20) return '（御主魔力不足，無法供給。）';
  if(p.sv_mp>=p.sv_mp_max) return '（從者魔力已滿。）';
  var amt = Math.min(p.master_mp, Math.round(p.sv_mp_max*0.25));
  p.master_mp -= amt; p.sv_mp = Math.min(p.sv_mp_max, p.sv_mp+amt);
  updateRow_(SHEETS.BATTLE, p._row, { master_mp:p.master_mp, sv_mp:p.sv_mp });
  return '你透過魔術迴路將魔力導入從者——從者魔力 +'+amt+'。';
}

function act_reinforce_(p, hero){
  var isC = hero && hero.cls==='Caster';
  var cost = isC?10:18, gain = isC?28:16;
  if(p.master_mp<cost) return '（魔力不足，無法加固結界。）';
  if(p.barrier>=p.barrier_max) return '（結界已達上限。）';
  p.master_mp -= cost; p.barrier = Math.min(p.barrier_max, p.barrier+gain);
  updateRow_(SHEETS.BATTLE, p._row, { master_mp:p.master_mp, barrier:p.barrier });
  return '你'+(isC?'以工房之力':'')+'強化了據點結界（魔力 −'+cost+'）。結界 '+p.barrier+'/'+p.barrier_max+'。';
}

function act_separate_(p){
  p.separated = !p.separated; if(!p.separated) p.servant_loc = p.location;
  updateRow_(SHEETS.BATTLE, p._row, { separated:p.separated, servant_loc:p.servant_loc });
  return p.separated ? '從者鎮守 '+p.servant_loc+'，你退往後方（失去護衛，務必小心）。' : '從者回到你身邊，恢復合體行動。';
}

function act_sleep_(p, clock, mem){
  clock.day++; clock.hour=6; clock.ap=clock.ap_max;
  p.sv_hp=p.sv_hp_max; p.sv_mp=p.sv_mp_max; p.master_mp=p.master_mp_max;
  updateRow_(SHEETS.CLOCK, clock._row, { day:clock.day, hour:clock.hour, ap:clock.ap });
  updateRow_(SHEETS.BATTLE, p._row, { sv_hp:p.sv_hp, sv_mp:p.sv_mp, master_mp:p.master_mp });
  return narrateScene('你睡了一覺，HP/魔力/行動點恢復，新的一天開始。冬木市昨夜想必又有從者交鋒。請寫一段晨醒敘述。', mem);
}

function act_seal_(rows, p, clock, hero, cmd){
  if(p.seals<=0) return '（令咒已用盡。）';
  p.seals--;
  var msg='';
  switch(cmd){
    case 'heal': p.sv_hp=p.sv_hp_max; p.sv_mp=p.sv_mp_max; msg='令咒燃燒，魔力重塑靈基——HP/魔力完全回復。'; break;
    case 'order': if(p.bond<60){ p.bond=Math.max(0,p.bond-5); } msg=act_combat_(rows,p,clock,hero,'seal',false); break;
    case 'np':   if(p.bond<60){ p.bond=Math.max(0,p.bond-5); } msg=act_combat_(rows,p,clock,hero,'sealnp',false); break;
    case 'recall': p.separated=false; p.servant_loc=p.location;
      if(clock.mana_locked) updateRow_(SHEETS.CLOCK, clock._row, { mana_countdown:0, mana_locked:false });
      msg='令咒干涉空間，你與從者瞬間脫離當前戰局/險境。'; break;
    case 'mana': p.sv_mp=p.sv_mp_max; p.bond=Math.min(100,p.bond+12);
      if(clock.mana_locked) updateRow_(SHEETS.CLOCK, clock._row, { mana_countdown:0, mana_locked:false });
      msg='以令咒強制補魔——魔力灌滿、靈基穩固（跳過倒數）。'; break;
    default: msg='（未知令咒指令）';
  }
  updateRow_(SHEETS.BATTLE, p._row, { seals:p.seals, sv_hp:p.sv_hp, sv_mp:p.sv_mp, bond:p.bond, separated:p.separated, servant_loc:p.servant_loc });
  return '【令咒・剩'+p.seals+'】'+msg;
}

// ---------- 記憶/上下文（讓 AI 知道過去發生什麼）----------
// 撈最近「玩家可見事件 + 已建立事實」組成 context，注入每次敘述
function gameContext_(gameId){
  var evs = findRows_(SHEETS.EVENTS, { game_id: gameId }).filter(function(e){
    return e.is_global===true || String(e.actor_id).indexOf('slot_0')>=0 || String(e.target_id).indexOf('slot_0')>=0;
  }).sort(function(a,b){ return (a.write_ts||0)-(b.write_ts||0); });
  evs = evs.slice(-6);
  var facts = findRows_(SHEETS.MEMORY, { game_id: gameId })
    .sort(function(a,b){ return (a.write_ts||0)-(b.write_ts||0); }).slice(-6);
  var lines = [];
  if(evs.length){ lines.push('近期事件：');
    evs.forEach(function(e){ lines.push('・第'+e.day_count+'天 '+e.time_hour+' '+e.log_text); }); }
  if(facts.length){ lines.push('已建立的事實：');
    facts.forEach(function(f){ lines.push('・'+(f.entity?('['+f.entity+'] '):'')+f.content); }); }
  return lines.join('\n');
}
function recordFact_(gameId, turn, entity, content, importance){
  if(!content) return;
  appendObj_(SHEETS.MEMORY, { event_id:'m_'+Date.now()+'_'+Math.floor(Math.random()*1000),
    game_id:gameId, turn:turn, entity:String(entity||'').slice(0,20), fact_type:'note',
    content:String(content).slice(0,120), importance:(importance||0), write_ts:Date.now() });
}

// ---------- 事件日誌 ----------
function logEvent_(gameId, day, hour, locId, type, actor, target, text, isGlobal, importance){
  appendObj_(SHEETS.EVENTS, {
    event_id:'e_'+Date.now()+'_'+Math.floor(Math.random()*1000), write_ts:Date.now(),
    game_id:gameId, day_count:day, time_hour:hour, location_id:locId, event_type:type,
    actor_id:actor, target_id:target, log_text:text, is_global:isGlobal, importance:importance
  });
}
function pad2_(n){ return (n<10?'0':'')+n; }
