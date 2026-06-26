/**
 * Game.gs — 遊戲流程：登入 / 開局 / 讀狀態 / 動作（全部 server 權威、寫回試算表）
 */

var NPC_SPAWN_ = ['tohsaka','ryuudou','matou','cemetery','school','harbor','park','hospital','shrine','arcade','factory','station','woods'];
// 正典御主的據點（4th/5th）；不在表中者（自創/混亂）預設新都公寓
var CANON_HOME_ = {
  '衛宮士郎':'emiya','遠坂凜':'tohsaka','間桐慎二':'matou','葛木宗一郎':'ryuudou',
  '言峰綺禮':'church','伊莉雅絲菲爾':'einzbern','（Caster 召喚）':'ryuudou',
  '衛宮切嗣':'emiya','遠坂時臣':'tohsaka','肯尼斯':'apartment','韋伯·維爾維特':'apartment',
  '雨生龍之介':'harbor','間桐雁夜':'matou'
};
// 正典御主→正典據點；自創玩家→新都公寓；其餘(混亂NPC)→隨機分散
function homeOf_(name, isPlayer, pool, idx){
  return CANON_HOME_[name] || (isPlayer ? 'apartment' : pool[idx % pool.length]);
}

// 正典同盟：同陣營的從者不互相攻擊（如美狄亞召喚的佐佐木守龍洞寺）
var NPC_ALLY_GROUPS_ = [ ['美狄亞-Caster','佐佐木小次郎-Assassin'] ];
function npcAllied_(a, b){
  if(a.master_name && a.master_name === b.master_name) return true;   // 同御主
  return NPC_ALLY_GROUPS_.some(function(g){
    return g.indexOf(a.servant_id) >= 0 && g.indexOf(b.servant_id) >= 0;
  });
}

// ---------- 帳號 ----------
function login(name){
  name = (name||'').trim();
  if(!name) return { error:'請輸入帳號名稱' };
  return withLock_(function(){
    var acc = findOne_(SHEETS.ACCOUNTS, { name: name });
    if(!acc){
      acc = { ms_id:'ms_'+Utilities.getUuid(), name:name, created:new Date().toISOString(),
              current_game:'', inventory:[], settings:{ manaRating:'adult-fade' } };
      appendObj_(SHEETS.ACCOUNTS, acc);
    }
    return { ms_id: acc.ms_id, name: acc.name, current_game: acc.current_game };
  });
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
  // 生成（AI 呼叫較慢，放在鎖外；只有「寫入英靈殿」需要鎖）
  var g = generateServant_(name, cls, opts.desc);
  if(g.error) return { error:'AI 生成失敗：'+g.error };
  return withLock_(function(){
  var sid = name+'-'+cls;
  if(findOne_(SHEETS.HEROES, { servant_id: sid })) sid = sid+'-'+Utilities.getUuid().slice(0,8);
  appendObj_(SHEETS.HEROES, {
    servant_id:sid, cls:cls, realName:name, wars:['自訂'],
    筋力:g.six.筋力, 耐久:g.six.耐久, 敏捷:g.six.敏捷, 魔力:g.six.魔力, 幸運:g.six.幸運, 寶具:g.six.寶具,
    classSkills:g.classSkills, skills:g.skills, traits:g.traits, np:g.np, persona:g.persona, source:'ai_gen'
  });
  return { servant_id: sid, generated:true };
  });
}

// ---------- 開局 ----------
/**
 * @param opts {ms_id, mode:'canon'|'chaos', war, role:'canon'|'original',
 *              masterIndex, servantId, profile:{name,circuits,magic,melee,magic_rank}}
 */
function newGame(opts){
  var st = withLock_(function(){
  // 開新局前，先清掉該帳號未完成的舊存檔（避免重複開局堆出多個戰場）
  var acc0 = findOne_(SHEETS.ACCOUNTS, { ms_id: opts.ms_id });
  if(acc0 && acc0.current_game) clearGame_(acc0.current_game);

  var heroesById = {};
  readAll_(SHEETS.HEROES).forEach(function(h){ heroesById[h.servant_id] = h; });
  var mastersByKey = {};   // 御主殿（正典御主資料）
  readAll_(SHEETS.MASTERS).forEach(function(m){ mastersByKey[m.name+'|'+m.war] = m; });
  var gameId = 'g_'+Utilities.getUuid();   // 每場唯一，避免多人同毫秒開局撞號共用戰場
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
      base_tier:p.isPlayer?(isCaster?'魔術工房':'簡易結界'):'', servant_loc:loc, separated:false,
      discovered:p.isPlayer?[]:''
    });
  });
  // 玩家開局只「認得」與自己同地的從者（戰爭迷霧：其餘需偵查/相遇才現蹤）
  var pr0 = rows.filter(function(r){ return r.is_player; })[0];
  if(pr0) pr0.discovered = rows.filter(function(r){ return !r.is_player && r.location===pr0.location; })
                               .map(function(r){ return r.slot; });
  appendObjs_(SHEETS.BATTLE, rows);
  appendObj_(SHEETS.CLOCK, { game_id:gameId, day:1, hour:20, ap:TUNING.AP_PER_DAY,
                             ap_max:TUNING.AP_PER_DAY, mana_countdown:0, mana_locked:false });
  var pp = parts.filter(function(x){ return x.isPlayer; })[0];
  var wish = (pp && pp.wish) || (opts.profile && opts.profile.wish) || '';   // 正史扮演用正典願望
  updateWhere_(SHEETS.ACCOUNTS, { ms_id:opts.ms_id }, { current_game:gameId, settings:{ wish:wish, manaRating:'adult-fade' } });

  logEvent_(gameId, 1, '20:00', 'start', 'START', 'slot_0', '', '聖杯戰爭開始。', true, 2);
  var s = getState(gameId);
  // 開場敘述的素材先帶出來，等釋放寫入鎖後再呼叫 LLM（避免 LLM 期間卡住其他玩家）
  if(pp){ s._openHero = heroesById[pp.servantId]; s._openMaster = pp.master; s._openWish = wish; }
  return s;
  });  // ← 釋放寫入鎖

  if(st && !st.error && st._openHero){
    st.opening = summonOpening_(st._openHero, st._openMaster, st._openWish);
  }
  if(st){ delete st._openHero; delete st._openMaster; delete st._openWish; }
  return st;
}

// ---------- 讀狀態 ----------
function getState(gameId){
  var rows = findRows_(SHEETS.BATTLE, { game_id: gameId });
  var clock = findOne_(SHEETS.CLOCK, { game_id: gameId });
  var player = rows.filter(function(r){ return r.is_player===true; })[0];
  var disc = player ? parseDiscovered_(player.discovered) : [];
  var pLoc = player ? (player.separated ? player.servant_loc : player.location) : '';
  var st = {
    game_id: gameId, clock: clock,
    roster: rows.map(function(r){
      // 戰爭迷霧：只揭露玩家、已偵查到的、或此刻同地的從者
      var known = (r.is_player===true) || disc.indexOf(r.slot)>=0 || (r.servant_loc===pLoc);
      return {
        slot:r.slot, isPlayer:r.is_player, alive:r.alive, known:known,
        cls: known ? heroCls_(r.servant_id) : '？',
        master: known ? r.master_name : '？？？',
        location: known ? r.location : '' }; }),
    player: player ? playerView_(player) : null,
    economy: player ? playerEconomy_(player) : null
  };
  return st;
}

// 進行中存檔讀取（登入後「繼續遊戲」用）
function resumeGame(msId){
  return withLock_(function(){
    var acc = findOne_(SHEETS.ACCOUNTS, { ms_id: msId });
    if(!acc || !acc.current_game) return { error:'沒有進行中的存檔。' };
    var rows = findRows_(SHEETS.BATTLE, { game_id: acc.current_game });
    if(!rows.length){ updateWhere_(SHEETS.ACCOUNTS, { ms_id:msId }, { current_game:'' }); return { error:'存檔已失效，請開新局。' }; }
    return getState(acc.current_game);
  });
}

// 戰爭迷霧：發現紀錄（存玩家列 discovered，JSON 陣列 round-trip）
function parseDiscovered_(v){ return Array.isArray(v) ? v : []; }
function markDiscovered_(p, slots){
  var d = parseDiscovered_(p.discovered), changed = false;
  slots.forEach(function(s){ if(d.indexOf(s)<0){ d.push(s); changed = true; } });
  if(changed){ p.discovered = d; updateRow_(SHEETS.BATTLE, p._row, { discovered:d }); }
}

function heroCls_(sid){ var h = findOne_(SHEETS.HEROES, { servant_id: sid }); return h ? h.cls : '?'; }

function playerView_(p){
  var hero = findOne_(SHEETS.HEROES, { servant_id: p.servant_id });
  return {
    master:{ name:p.master_name, magic:p.magic, hp:p.master_hp, hpMax:p.master_hp_max,
             mp:p.master_mp, mpMax:p.master_mp_max, seals:p.seals, melee:p.melee, magicRank:p.magic_rank,
             circuits:p.circuits, location:p.location },
    servant:{ cls:hero ? hero.cls : '？', servantId:p.servant_id, realName:hero?hero.realName:'',
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
/**
 * 兩階段：
 *   Phase 1（鎖內）：驗證 + 數值結算 + 寫回試算表 + NPC 自律 + 結局寫檔，產出「敘述指令(spec)」。
 *   Phase 2（鎖外）：用 spec 呼叫 LLM 生成敘述；自由對話再用短鎖把抽取的事實寫回。
 * 把較慢的 LLM 移出鎖外，多人單機時各玩家的回合不會卡在別人的 LLM 等待上。
 * @param a {game_id, type, ...payload}
 */
function doAction(a){
  var plan = withLock_(function(){
    var gameId = a.game_id;
    var rows = findRows_(SHEETS.BATTLE, { game_id: gameId });
    var clock = findOne_(SHEETS.CLOCK, { game_id: gameId });
    var p = rows.filter(function(r){ return r.is_player===true; })[0];
    if(!p) return { error:'找不到玩家存檔' };
    var hero = findOne_(SHEETS.HEROES, { servant_id: p.servant_id });

    // 補魔密封時段：封鎖耗時/戰鬥動作（免 LLM，直接回最終回應）
    if(clock.mana_locked && ['move','scout','attack','np','sleep','separate','claim'].indexOf(a.type)>=0)
      return { final:{ state:getState(gameId), narration:'（補魔進行中，無法進行該動作；請繼續對話，或用令咒「強制補魔」結束。）', events:[] } };

    // 個性+好感 + 歷史事件/記憶 → 完整 context，讓 AI 不出戲、知道過去
    var gc = gameContext_(gameId);
    var mem = servantCtx_(p, hero) + (gc ? ('\n'+gc) : '');

    var spec;   // string（免 LLM 的最終文字）或 {kind:'scene'|'combat'|'chat', ...}
    switch(a.type){
      case 'move':       spec = act_move_(p, clock, hero, a.locId); break;
      case 'scout':      spec = act_scout_(p, clock, hero); break;
      case 'attack':     spec = act_combat_(rows, p, clock, hero, false, true); break;
      case 'np':         spec = act_combat_(rows, p, clock, hero, 'np', true); break;
      case 'mana':       spec = act_mana_(p, clock); break;
      case 'feed':       spec = act_feed_(p); break;
      case 'reinforce':  spec = act_reinforce_(p, hero); break;
      case 'separate':   spec = act_separate_(p); break;
      case 'claim':      spec = act_claim_(p, clock, hero); break;
      case 'sleep':      spec = act_sleep_(p, clock); break;
      case 'seal':       spec = act_seal_(rows, p, clock, hero, a.cmd); break;
      case 'chat':
        spec = clock.mana_locked
          ? manaChat_(p, clock, a.text)
          : { kind:'chat', prompt: a.text + '\n（玩家自由發言。依從者個性與好感度回應，無禮/猥褻則抗拒；與已知世界線一致。）' };
        break;
      default: return { error:'未知動作：'+a.type };
    }

    // NPC 自律（耗時動作後推進世界；補魔鎖定中不跑）
    var events = [];
    var fresh = findOne_(SHEETS.CLOCK, { game_id: gameId });
    if(!fresh.mana_locked){
      if(['move','scout','attack','np','claim'].indexOf(a.type) >= 0){
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
    var over = endR ? endGame_(gameId, pf, endR) : null;   // endGame_ 回傳 dreamPrompt，假夢敘述留到鎖外生成

    return {
      spec: spec, mem: mem, over: over, gameId: gameId, day: clock.day,
      events: events.filter(function(e){ return e.global || e.atPlayer; }).map(function(e){ return e.text; }),
      state: over ? null : getState(gameId)
    };
  });

  if(plan.error) return { error: plan.error };
  if(plan.final) return plan.final;

  // ===== Phase 2（鎖外）：生成敘述，多人並行不互相卡 =====
  var narration = '', facts = [], spec = plan.spec;
  if(typeof spec === 'string'){ narration = spec; }
  else if(spec && spec.kind==='scene'){
    narration = (spec.prefix||'') + narrateScene(spec.prompt, plan.mem) + (spec.suffix||'');
  } else if(spec && spec.kind==='combat'){
    narration = (spec.prefix||'') + narrateCombat(spec.ctx, plan.mem) + (spec.suffix||'');
  } else if(spec && spec.kind==='chat'){
    var ext = narrateAndExtract_(spec.prompt, plan.mem); narration = ext.narration; facts = ext.facts||[];
  }

  // 結局假夢（鎖外生成）
  if(plan.over && plan.over.dreamPrompt){
    plan.over.dream = narrateScene(plan.over.dreamPrompt, plan.mem);
    delete plan.over.dreamPrompt;
  }

  // Phase 3（短鎖）：自由對話新建立的事實寫回記憶
  if(facts.length) withLock_(function(){
    facts.forEach(function(f){ recordFact_(plan.gameId, plan.day, f.entity, f.content, f.importance); });
    return true;
  });

  return { state: plan.state, narration: narration, events: plan.events, gameOver: plan.over };
}

// ---------- 結局：願望假夢 / 奪杯 → 老虎道場 → 寫歷史 → 清空該場 ----------
// 寫檔在鎖內完成；假夢敘述只回傳 dreamPrompt，留給 doAction 在鎖外用 LLM 生成。
function endGame_(gameId, p, result){
  var acc = findOne_(SHEETS.ACCOUNTS, { current_game: gameId }) || {};
  var wish = (acc.settings && acc.settings.wish) || '未明';
  var name = acc.name || p.master_name;
  var clock = findOne_(SHEETS.CLOCK, { game_id: gameId }) || { day:1 };
  var svcls = heroCls_(p.servant_id);
  var dreamPrompt, summary;
  if(result === 'death'){
    dreamPrompt = '【死亡的假夢】御主 '+name+' 在意識消逝的瞬間，墜入聖杯展示的幻夢——願望「'+wish
      +'」彷彿已然實現。請寫一段淒美而虛幻、令人不忍的「願望成真假夢」，最後夢境崩解、回歸虛無。4~6 句。';
    summary = '第'+clock.day+'天　'+svcls+'之御主「'+name+'」殞落於聖杯戰爭。';
  } else {
    dreamPrompt = '【奪得聖杯】御主 '+name+' 成為最後勝者，聖杯於眼前顯現，願望「'+wish
      +'」。請寫一段莊嚴而意味深長的奪杯敘述（聖杯或許並不單純）。4~6 句。';
    summary = '第'+clock.day+'天　'+svcls+'之御主「'+name+'」奪取聖杯，贏得戰爭。';
  }
  appendObj_(SHEETS.HISTORY, { ts:Date.now(), ms_id:acc.ms_id||'', name:name, result:result,
    war:'', servant_cls:svcls, day:clock.day, summary:summary });
  clearGame_(gameId);
  if(acc.ms_id) updateWhere_(SHEETS.ACCOUNTS, { ms_id:acc.ms_id }, { current_game:'' });
  return { result:result, dreamPrompt:dreamPrompt, dojo:tigerDojo_(result), summary:summary };
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
  invalidate_(name);
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
    if(a._row === b._row) return;          // 安全：同一參戰者不可自打
    if(npcAllied_(a, b)) return;           // 同陣營（同御主／正典同盟，如美狄亞與其召喚的佐佐木）不互相攻擊
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

  // NPC 抵達玩家所在地 → 自動現蹤（記入發現）並提示
  var arrived = npcs.filter(function(r){ return r.alive && r.location===player.location; });
  if(arrived.length) markDiscovered_(player, arrived.map(function(r){ return r.slot; }));
  arrived.forEach(function(n){
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
function manaChat_(p, clock, text){
  var left = (clock.mana_countdown||0) - 1;
  if(left <= 0){
    p.sv_mp = p.sv_mp_max; p.bond = Math.min(100, p.bond + TUNING.MANA_BOND);
    updateRow_(SHEETS.BATTLE, p._row, { sv_mp:p.sv_mp, bond:p.bond });
    updateRow_(SHEETS.CLOCK, clock._row, { mana_countdown:0, mana_locked:false });
    advanceTime_(p, clock, null, TUNING.MANA_AP_COST);
    return { kind:'scene',
      prompt:(text?('御主：「'+text+'」\n'):'')+'補魔完成，魔力填滿靈基。依從者個性與好感收尾（fade）。請寫含蓄的結束敘述。',
      suffix:'\n（補魔結束：魔力回滿・好感 +'+TUNING.MANA_BOND+'）' };
  }
  updateRow_(SHEETS.CLOCK, clock._row, { mana_countdown:left });
  return { kind:'scene',
    prompt:(text?('御主：「'+text+'」\n'):'')+'補魔持續中。依從者個性與好感回應（無禮/猥褻則抗拒、冷淡；fade、點到為止）。請寫一段含蓄敘述。',
    suffix:'\n（補魔進行中，剩 '+left+' 次對話）' };
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

// 偵查：揭露當前地與相鄰地的從者蹤跡（戰爭迷霧用），耗 1 AP
function act_scout_(p, clock, hero){
  if(clock.ap<1) return '（行動點不足，請睡覺恢復。）';
  var here = p.separated ? p.servant_loc : p.location;
  var cur = findOne_(SHEETS.MAP, { id: here });
  var scan = [here].concat(cur ? (cur.adj||[]) : []);
  var found = findRows_(SHEETS.BATTLE, { game_id:p.game_id })
    .filter(function(r){ return r.is_player!==true && r.alive && scan.indexOf(r.servant_loc)>=0; });
  markDiscovered_(p, found.map(function(r){ return r.slot; }));
  advanceTime_(p, clock, hero, 1);
  var lines = found.length
    ? found.map(function(r){ return '・'+heroCls_(r.servant_id)+'（'+r.master_name+'）位於 '+locName_(r.servant_loc); }).join('\n')
    : '・周遭一帶暫無從者氣息。';
  return { kind:'scene',
    prompt:'你（'+p.master_name+'）凝神探查周遭一帶的魔力波動與氣息。請寫一段簡短的偵查敘述（不要列數字）。',
    suffix:'\n\n【偵查結果】\n' + lines };
}

function act_move_(p, clock, hero, locId){
  var cur = findOne_(SHEETS.MAP, { id: p.location });
  if(!cur || (cur.adj||[]).indexOf(locId)<0) return '（該地點不相鄰，無法直接前往。）';
  if(clock.ap<1) return '（行動點不足，請睡覺恢復。）';
  p.location = locId; if(!p.separated) p.servant_loc = locId;
  updateRow_(SHEETS.BATTLE, p._row, { location:p.location, servant_loc:p.servant_loc });
  // 抵達後自動發現該地的從者
  var hloc = p.separated ? p.servant_loc : p.location;
  var hereNpcs = findRows_(SHEETS.BATTLE, { game_id:p.game_id })
    .filter(function(r){ return r.is_player!==true && r.alive && r.servant_loc===hloc; });
  markDiscovered_(p, hereNpcs.map(function(r){ return r.slot; }));
  advanceTime_(p, clock, hero, 1);
  var dest = findOne_(SHEETS.MAP, { id: locId }) || { name: locId, desc: '' };
  var enc = hereNpcs.length ? ('\n此處有：'+hereNpcs.map(function(r){ return heroCls_(r.servant_id)+'（'+r.master_name+'）'; }).join('、')) : '';
  return { kind:'scene',
    prompt:'你（'+p.master_name+'）移動到了「'+dest.name+'」。'+dest.desc+enc+' 請寫一段抵達敘述。',
    suffix: enc ? ('\n\n【遭遇】'+enc.replace('\n此處有：','')) : '' };
}

function act_combat_(rows, p, clock, hero, mode, costAP){
  // 只能攻擊「此刻與你的從者同地」的敵人（看不到的人砍不到）
  var here = p.separated ? p.servant_loc : p.location;
  var enemyRow = rows.filter(function(r){ return r.is_player!==true && r.alive===true && r.servant_loc===here; })[0];
  if(!enemyRow){
    var anyAlive = rows.some(function(r){ return r.is_player!==true && r.alive===true; });
    return anyAlive ? '（你的所在地沒有敵蹤——先用「🔍 偵查」找出附近從者，或移動到敵人所在地再交戰。）'
                    : '（場上已無可交戰的對手。）';
  }
  markDiscovered_(p, [enemyRow.slot]);
  // 寶具的魔力門檻要對齊「實際耗魔」＝普通交戰 + 寶具額外（否則剛好過門檻卻扣到歸零）
  if(mode==='np' && p.sv_mp < Math.round(p.sv_mp_max*(TUNING.COMBAT_MP+TUNING.NP_MP)))
    return '（魔力不足，無法解放寶具——可用令咒強制或先補魔。）';
  if(costAP && clock.ap<1) return '（行動點不足，請睡覺恢復。）';

  // 從者資料缺失（例如重建資料庫後 AI 生成英靈被清掉）→ 不要崩潰，給明確提示
  if(!hero) return '（找不到你的從者資料，存檔可能已損毀，建議開新局。）';
  var eHero = findOne_(SHEETS.HEROES, { servant_id: enemyRow.servant_id });
  if(!eHero) return '（找不到敵方從者資料，無法交戰。）';
  var A = Object.assign(heroFromRow_(hero), { hp:p.sv_hp, mp:p.sv_mp, mpMax:p.sv_mp_max });
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

  return { kind:'combat',
    ctx:{ playerCls:A.cls, enemyCls:B.cls, winner:res.winner, firedTags:res.firedTags, beats:res.beats },
    suffix:'\n\n戰報：' + res.beats.join('｜') };
}

function act_mana_(p, clock){
  if(clock.mana_locked) return '（補魔已在進行中——繼續對話即可推進。）';
  updateRow_(SHEETS.CLOCK, clock._row, { mana_countdown:TUNING.MANA_TURNS, mana_locked:true });
  return { kind:'scene',
    prompt:'你與從者開始補魔。依從者個性與好感度決定其態度（好感低則勉強/公事公辦、抗拒過度親密；好感高則有溫度），fade-to-black、點到為止。請寫一段含蓄起始敘述。',
    suffix:'\n（補魔開始：接下來 '+TUNING.MANA_TURNS+' 次對話用於補魔，期間時間與 NPC 凍結）' };
}
function servantCtx_(p, hero){
  if(!hero) return '';
  var ps = hero.persona || {};
  return '（從者：'+hero.cls+'，真名'+(p.true_name_known?hero.realName:'未公開')+'，個性「'+(ps.words||'')+'」，'
    + '一人稱「'+(ps.firstP||'我')+'」，對御主態度「'+(ps.toMaster||'')+'」，目前好感度 '+p.bond+'/100。'
    + '請嚴格依此人格與好感回應，保有自主與尊嚴。）';
}
function act_claim_(p, clock, hero){
  if(clock.ap<1) return '（行動點不足，請睡覺恢復。）';
  if(p.base_loc===p.location) return '（此處已是你的據點。）';
  var isC = hero && hero.cls==='Caster';
  p.base_loc=p.location; p.barrier=30; p.barrier_max=isC?100:60; p.base_tier=isC?'魔術工房':'簡易結界';
  updateRow_(SHEETS.BATTLE, p._row, { base_loc:p.base_loc, barrier:p.barrier, barrier_max:p.barrier_max, base_tier:p.base_tier });
  advanceTime_(p, clock, hero, 1);
  return { kind:'scene', prompt:'你在「'+locName_(p.location)+'」佈置新的據點與結界，放棄舊據點。請寫一段建立據點/工房的敘述。' };
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

function act_sleep_(p, clock){
  clock.day++; clock.hour=6; clock.ap=clock.ap_max;
  p.sv_hp=p.sv_hp_max; p.sv_mp=p.sv_mp_max; p.master_mp=p.master_mp_max;
  updateRow_(SHEETS.CLOCK, clock._row, { day:clock.day, hour:clock.hour, ap:clock.ap });
  updateRow_(SHEETS.BATTLE, p._row, { sv_hp:p.sv_hp, sv_mp:p.sv_mp, master_mp:p.master_mp });
  return { kind:'scene', prompt:'你睡了一覺，HP/魔力/行動點恢復，新的一天開始。冬木市昨夜想必又有從者交鋒。請寫一段晨醒敘述。' };
}

function act_seal_(rows, p, clock, hero, cmd){
  if(p.seals<=0) return '（令咒已用盡。）';
  // 戰鬥類令咒：先確認當地有敵人，否則不浪費這道珍貴的令咒（也不扣好感）
  if(cmd==='order' || cmd==='np'){
    var here = p.separated ? p.servant_loc : p.location;
    var hasEnemy = rows.some(function(r){ return r.is_player!==true && r.alive===true && r.servant_loc===here; });
    if(!hasEnemy) return '（你的所在地沒有敵蹤——令咒未動用。先偵查或移動到敵人所在地再使用。）';
  }
  p.seals--;
  var msg='';   // string 或 combat spec（order/np）
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
  var tag = '【令咒・剩'+p.seals+'】';
  // order/np 回傳的是戰鬥 spec（敘述待鎖外生成）→ 把令咒前綴掛上去；其餘為即時文字
  if(msg && msg.kind){ msg.prefix = tag + (msg.prefix||''); return msg; }
  return tag + msg;
}

// ---------- 記憶/上下文（讓 AI 知道過去發生什麼）----------
// 撈最近「玩家可見事件 + 已建立事實」組成 context，注入每次敘述
function gameContext_(gameId){
  // 窗口讀取最後一段事件/記憶（消除每回合整表掃描的成長隱憂）；務必用 game_id 過濾，
  // 多人共用同一張表時，過濾才是「不讀到別人資料」的保證，窗口只是限制讀取量。
  // 窗口取得比 6 大很多（120/80），即使多位玩家事件交錯，本場最近 6 筆通常仍落在窗口內。
  var evs = readTail_(SHEETS.EVENTS, 120).filter(function(e){
    return e.game_id===gameId &&
      (e.is_global===true || String(e.actor_id).indexOf('slot_0')>=0 || String(e.target_id).indexOf('slot_0')>=0);
  }).slice(-6);
  var facts = readTail_(SHEETS.MEMORY, 80).filter(function(f){ return f.game_id===gameId; }).slice(-6);
  var lines = [];
  if(evs.length){ lines.push('近期事件：');
    evs.forEach(function(e){ lines.push('・第'+e.day_count+'天 '+e.time_hour+' '+e.log_text); }); }
  if(facts.length){ lines.push('已建立的事實：');
    facts.forEach(function(f){ lines.push('・'+(f.entity?('['+f.entity+'] '):'')+f.content); }); }
  return lines.join('\n');
}
function recordFact_(gameId, turn, entity, content, importance){
  if(!content) return;
  appendObj_(SHEETS.MEMORY, { event_id:'m_'+Utilities.getUuid(),
    game_id:gameId, turn:turn, entity:String(entity||'').slice(0,20), fact_type:'note',
    content:String(content).slice(0,120), importance:(importance||0), write_ts:Date.now() });
}

// ---------- 事件日誌 ----------
function logEvent_(gameId, day, hour, locId, type, actor, target, text, isGlobal, importance){
  appendObj_(SHEETS.EVENTS, {
    event_id:'e_'+Utilities.getUuid(), write_ts:Date.now(),
    game_id:gameId, day_count:day, time_hour:hour, location_id:locId, event_type:type,
    actor_id:actor, target_id:target, log_text:text, is_global:isGlobal, importance:importance
  });
}
function pad2_(n){ return (n<10?'0':'')+n; }
