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
    classSkills:g.classSkills, skills:g.skills, traits:g.traits, np:g.np, persona:g.persona, source:'ai_gen', align:g.align
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
    // 自創御主迴路夾值 10~50（頂尖人類魔術師上限；70 那種容器級保留給正典伊莉雅）
    var circuits = Math.max(10, Math.min(50, p.circuits || 25));
    return { master:name, circuits:circuits, magic:p.magic||'依正典設定',
             melee:p.melee||'E', magic_rank:p.magic_rank||(circuits>=45?'A':circuits>=30?'B':'C'),
             home:'', wish:p.wish||'', gender:p.gender||'', persona:p.persona||'', origin:p.origin||'' };
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
      circuits:p.circuits, master_hp:100, master_hp_max:100, master_mp:p.circuits*TUNING.MASTER_MP_K, master_mp_max:p.circuits*TUNING.MASTER_MP_K,
      seals:3, melee:p.melee, magic_rank:p.magic_rank, location:loc, servant_id:p.servantId,
      sv_hp:d.hpMax, sv_hp_max:d.hpMax, sv_mp:d.mpMax, sv_mp_max:d.mpMax, upkeep:d.upkeep,
      bond:30, true_name_known:false, status: hasGodHand_(hero) ? String(TUNING.GOD_HAND_LIVES) : 'normal', alive:true,
      base_loc:p.isPlayer?loc:'', barrier:p.isPlayer?30:'', barrier_max:p.isPlayer?(isCaster?100:60):'',
      base_tier:p.isPlayer?(isCaster?'魔術工房':'簡易結界'):'', servant_loc:loc, separated:false,
      discovered:p.isPlayer?[]:'', sv_condition:p.isPlayer?'靈基初凝，神色沉靜':'', buff:''
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
  // 御主人設（餵 AI 用）：自創帶性別/個性/出身；正史扮演則用御主殿的 persona
  var master = pp ? { name:pp.master, gender:pp.gender||'', persona:pp.persona||'', origin:pp.origin||'',
                      magic:pp.magic||'', melee:pp.melee||'', magic_rank:pp.magic_rank||'', circuits:pp.circuits||30 } : {};
  updateWhere_(SHEETS.ACCOUNTS, { ms_id:opts.ms_id }, { current_game:gameId, settings:{ wish:wish, manaRating:'adult-fade', master:master } });

  logEvent_(gameId, 1, '20:00', 'start', 'START', 'slot_0', '', '聖杯戰爭開始。', true, 2);
  var s = getState(gameId);
  // 開場敘述的素材先帶出來，等釋放寫入鎖後再呼叫 LLM（避免 LLM 期間卡住其他玩家）
  if(pp){ s._openHero = heroesById[pp.servantId]; s._openMaster = master; s._openWish = wish; }
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
      // 敵方粗略狀態（偵查情報，血量衍生）：無傷/負傷/重傷
      var cond = '';
      if(known && r.is_player!==true && r.alive){
        var hr = r.sv_hp_max ? r.sv_hp / r.sv_hp_max : 1;
        cond = hr<=0.5 ? '重傷' : hr<0.95 ? '負傷' : '無傷';
      }
      return {
        slot:r.slot, isPlayer:r.is_player, alive:r.alive, known:known,
        cls: known ? heroCls_(r.servant_id) : '？',
        master: known ? r.master_name : '？？？',
        location: known ? r.location : '', cond:cond }; }),
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
              loc:p.servant_loc, separated:p.separated, condition:p.sv_condition||'', align: hero?hero.align:'',
              actives: hero ? activeSkills_(hero).map(function(a){ return { fx:a.fx, name:a.name, rank:a.rank, kind:a.kind, cost:Math.round(p.sv_mp_max*a.mpK) }; }) : [],
              buff: (p.buff && typeof p.buff==='object') ? p.buff : null },
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
    separated: p.separated, hasSolo: hasFx_(hsv,'solo') || hasSkillName_(hsv,'單獨行動'),
    hasWealth: hasFx_(hsv,'wealth'),
    hasTerritory: hasFx_(hsv,'territory'), hasCrafting: hasFx_(hsv,'crafting')
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
    BLEED_TURN_ = 0;   // 本回合被靈基反噬汲取的御主生命（破格召喚透支）

    // 補魔密封時段：封鎖耗時/戰鬥動作（免 LLM，直接回最終回應）
    if(clock.mana_locked && ['move','scout','attack','np','sleep','separate','claim','retreat','hunt','skill'].indexOf(a.type)>=0)
      return { final:{ state:getState(gameId), narration:'（補魔進行中，無法進行該動作；請繼續對話，或用令咒「強制補魔」結束。）', events:[] } };

    // 御主人設 + 從者人格+好感 + 歷史事件/記憶 → 完整 context，讓 AI 不出戲、知道過去
    var acc = findOne_(SHEETS.ACCOUNTS, { current_game: gameId });
    var gc = gameContext_(gameId);
    var mem = [masterCtx_(acc), servantCtx_(p, hero), gc].filter(function(x){ return x; }).join('\n');

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
      case 'dispatch':   spec = act_dispatch_(p, clock, hero, a.locId); break;
      case 'retreat':    spec = act_retreat_(p, clock, hero); break;
      case 'hunt':       spec = act_hunt_(p, clock, hero); break;
      case 'skill':      spec = act_skill_(rows, p, clock, hero, a.fx); break;
      case 'snipe':      spec = act_snipe_(rows, p, clock, hero); break;
      case 'accept_death': spec = ''; break;   // 瀕死抉擇：放棄令咒救援、接受死亡（結局在下方結算）
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
      if(['move','scout','attack','np','claim','retreat','hunt','skill'].indexOf(a.type) >= 0){
        events = npcTick_(gameId, findRows_(SHEETS.BATTLE,{game_id:gameId}), fresh);
      } else if(a.type === 'sleep'){
        for(var k=0;k<3;k++) events = events.concat(npcTick_(gameId, findRows_(SHEETS.BATTLE,{game_id:gameId}), fresh));
      }
    }
    // 破格召喚反噬警告：魔力透支、從者汲取了御主生命
    if(BLEED_TURN_ > 0)
      events.push({ text:'⚠ 魔力嚴重透支！從者靈基反噬、汲取你的生命（御主 HP −'+BLEED_TURN_+'）。盡快補魔／獵魔／休養止血，否則將被吸乾。', atPlayer:true });

    // 結局判定：玩家從者/御主死亡 → 死亡；敵方全滅 → 奪杯
    var fresh2 = findRows_(SHEETS.BATTLE, { game_id: gameId });
    var pf = fresh2.filter(function(r){ return r.is_player===true; })[0];
    var endR = null;
    if(pf){
      if(pf.sv_hp<=0 || pf.master_hp<=0) endR = 'death';
      else { var en = fresh2.filter(function(r){ return r.is_player!==true; });
             if(en.length && en.every(function(r){ return !r.alive; })) endR = 'win'; }
    }
    // 瀕死令咒救援：從者靈基崩解在即、仍有令咒、且玩家尚未明確「接受命運」→ 先不結算死亡，
    // 回 awaitSeal 讓玩家抉擇（燃令咒・靈基修復 或 接受命運）。
    var awaitSeal = null, over = null;
    // 令咒命令的是「從者」：只能在從者靈基崩解時燃咒修復；御主自身肉身受死，令咒救不了（直接結算）。
    if(endR==='death' && pf.sv_hp<=0 && pf.master_hp>0 && (pf.seals||0)>0 && a.type!=='accept_death'){
      awaitSeal = { msg:'⚠ 我的從者靈基崩解在即！是否燃燒令咒・重塑從者靈基（回血回魔）挽救？（尚餘 '+pf.seals+' 道令咒）' };
    }
    // 玩家側不做「無御主續戰」：御主或從者殞落 → 直接結算（老虎道場）。
    if(endR){
      over = endGame_(gameId, pf, endR);   // endGame_ 回傳 dreamPrompt，假夢敘述留到鎖外生成
    }

    return {
      spec: spec, mem: mem, over: over, awaitSeal: awaitSeal, gameId: gameId, day: clock.day,
      events: events.filter(function(e){ return e.global || e.atPlayer; }).map(function(e){ return e.text; }),
      state: over ? null : getState(gameId)
    };
  });

  if(plan.error) return { error: plan.error };
  if(plan.final) return plan.final;

  // ===== Phase 2（鎖外）：生成敘述＋從者體況，多人並行不互相卡 =====
  var narration = '', facts = [], cond = '', spec = plan.spec, o;
  if(typeof spec === 'string'){ narration = spec; }
  else if(spec && spec.kind==='scene'){
    o = narrateScene(spec.prompt, plan.mem); narration = (spec.prefix||'') + o.text + (spec.suffix||''); cond = o.condition;
  } else if(spec && spec.kind==='combat'){
    o = narrateCombat(spec.ctx, plan.mem); narration = (spec.prefix||'') + o.text + (spec.suffix||''); cond = o.condition;
  } else if(spec && spec.kind==='chat'){
    o = narrateAndExtract_(spec.prompt, plan.mem); narration = o.narration; facts = o.facts||[]; cond = o.condition;
  }

  // 結局假夢（鎖外生成）
  if(plan.over && plan.over.dreamPrompt){
    plan.over.dream = narrateScene(plan.over.dreamPrompt, plan.mem).text;
    delete plan.over.dreamPrompt;
  }

  // Phase 3（短鎖）：自由對話事實 + 從者體況寫回存檔
  if((facts.length || cond) && !plan.over) withLock_(function(){
    facts.forEach(function(f){ recordFact_(plan.gameId, plan.day, f.entity, f.content, f.importance); });
    if(cond){
      var pr = findRows_(SHEETS.BATTLE, { game_id: plan.gameId }).filter(function(r){ return r.is_player===true; })[0];
      if(pr) updateRow_(SHEETS.BATTLE, pr._row, { sv_condition: cond });
    }
    return true;
  });
  // 把最新體況補進回傳 state，讓前端立刻顯示（不必等下一次 getState）
  if(cond && plan.state && plan.state.player && plan.state.player.servant) plan.state.player.servant.condition = cond;

  return { state: plan.state, narration: narration, events: plan.events, gameOver: plan.over, awaitSeal: plan.awaitSeal };
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
    dreamPrompt = '【死亡的假夢】我（'+name+'）在意識消逝的瞬間，墜入聖杯展示的幻夢——願望「'+wish
      +'」彷彿已然實現。請寫一段淒美而虛幻、令人不忍的「願望成真假夢」，最後夢境崩解、回歸虛無。4~6 句。';
    summary = '第'+clock.day+'天　'+svcls+'之御主「'+name+'」殞落於聖杯戰爭。';
  } else {
    dreamPrompt = '【奪得聖杯】我（'+name+'）成為最後勝者，聖杯於眼前顯現，願望「'+wish
      +'」。請寫一段莊嚴而意味深長的奪杯敘述（聖杯或許並不單純）。4~6 句。';
    summary = '第'+clock.day+'天　'+svcls+'之御主「'+name+'」奪取聖杯，贏得戰爭。';
  }
  appendObj_(SHEETS.HISTORY, { ts:Date.now(), ms_id:acc.ms_id||'', name:name, result:result,
    war:'', servant_cls:svcls, day:clock.day, summary:summary });
  // 奪杯 → 在該帳號解鎖此英靈，存進鑑賞室（可前往「鑑賞召喚」於後日談重逢）
  if(result==='win' && acc.ms_id) galleryAddFromGame_(acc.ms_id, p, clock.day, summary);
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
      if(dead && godHandRevive_(dead)){       // 十二試煉：NPC 倒下也會復活，不真死
        updateRow_(SHEETS.BATTLE, dead._row, { sv_hp:dead.sv_hp, status:dead.status, alive:true });
        dead = null;
      }
      if(dead){
        // 從者被斬 → 該列消滅；但御主若尚有令咒，淪為「失從者御主」候補再契約（solo_hours='seeking'）
        var seek = (dead.seals||0)>0 ? 'seeking' : '';
        dead.alive = false; updateRow_(SHEETS.BATTLE, dead._row, { alive:false, solo_hours:seek });
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

  // 偶發：某 NPC 御主殞落（暗殺／魔力枯竭）。其從者若有單獨行動則淪為無主從者、伺機另尋新主；否則一同消散。
  var pool = npcs.filter(function(r){ return r.alive===true && r.solo_hours!=='masterless'; });
  if(pool.length>=3 && Math.random()<0.04){
    var victim = pool[Math.floor(Math.random()*pool.length)];
    var vHero = findOne_(SHEETS.HEROES, { servant_id: victim.servant_id });
    var vSolo = vHero ? soloRank_(heroFromRow_(vHero)) : '';
    if(vSolo){
      victim.solo_hours='masterless'; victim.seals=0;
      updateRow_(SHEETS.BATTLE, victim._row, { solo_hours:'masterless', seals:0 });
      var tm = heroCls_(victim.servant_id)+' 的御主殞落，但它憑單獨行動（'+vSolo+'）苟存，淪為無主從者';
      logEvent_(gameId, clock.day, pad2_(clock.hour)+':00', victim.location, 'MASTER_LOST', 'slot_'+(victim.slot-1), '', tm, true, 1);
      events.push({ text:'⚑ 傳聞：'+tm+'。', global:true });
    } else {
      victim.alive=false; updateRow_(SHEETS.BATTLE, victim._row, { alive:false, solo_hours:'' });
      var tm2 = heroCls_(victim.servant_id)+' 的御主殞落，失去魔力供給、靈基消散';
      logEvent_(gameId, clock.day, pad2_(clock.hour)+':00', victim.location, 'DEATH', 'slot_'+(victim.slot-1), '', tm2, true, 1);
      events.push({ text:'⚑ 傳聞：'+tm2+'。', global:true });
    }
  }
  // 再契約：無主從者（有單獨行動）＋ 失從者御主（仍有令咒）→ 締結新契約、組成新隊伍
  npcRecontract_(gameId, rows, clock, events);

  // NPC 抵達玩家所在地 → 自動現蹤（記入發現）並提示
  var arrived = rows.filter(function(r){ return r.is_player!==true && r.alive && r.location===player.location; });
  if(arrived.length) markDiscovered_(player, arrived.map(function(r){ return r.slot; }));
  // 護衛判定：玩家從者是否就在御主身邊（分離外派或從者已倒下 → 御主失去護衛、暴露於危險）
  var svAtMaster = player.sv_hp>0 && ((player.separated ? player.servant_loc : player.location) === player.location);
  var struck = false;   // 每 tick 至多一名敵人襲擊御主
  arrived.forEach(function(n){
    if(!svAtMaster && !struck && player.master_hp>0){   // 御主已逝 → 不再有「御主遇襲」
      struck = true;
      var nf = masterPeril_(gameId, player, n, clock);
      events.push({ text: nf
        ? ('☠ '+heroCls_(n.servant_id)+'（'+n.master_name+'）將我重創至命懸一線（HP 1）！再挨一擊便會喪命——立刻召回從者、撤退，或燃令咒「緊急脫離」！')
        : ('⚠ 我的從者不在身邊，'+heroCls_(n.servant_id)+'（'+n.master_name+'）直撲而來——御主遭襲！（HP '+player.master_hp+'/'+player.master_hp_max+'）速召回從者或撤退！'), atPlayer:true });
    } else {
      events.push({ text:'⚠ '+heroCls_(n.servant_id)+'（'+n.master_name+'）出現在我的所在地！可選擇攻擊或迴避。', atPlayer:true });
    }
  });
  return events;
}

// NPC 再契約：無主從者（單獨行動者・solo_hours='masterless'）＋ 失從者御主（solo_hours='seeking'、仍有令咒）
// → 締結新契約、組成新隊伍（由失從者御主收編無主從者，化為一支新威脅）。每 tick 至多一對。
function npcRecontract_(gameId, rows, clock, events){
  var masterless = rows.filter(function(r){ return r.is_player!==true && r.alive===true && r.solo_hours==='masterless'; });
  var seeking    = rows.filter(function(r){ return r.is_player!==true && r.alive!==true && r.solo_hours==='seeking' && (r.seals||0)>0; });
  if(!masterless.length || !seeking.length) return;
  var sv = masterless[0], ms = seeking[0];
  var svName = heroCls_(sv.servant_id);
  // 失從者御主（ms）收編無主從者（sv）：沿用 ms 的御主框架與令咒，從者換成 sv
  ms.servant_id = sv.servant_id; ms.sv_hp = sv.sv_hp; ms.sv_hp_max = sv.sv_hp_max;
  ms.sv_mp = sv.sv_mp; ms.sv_mp_max = sv.sv_mp_max; ms.upkeep = sv.upkeep;
  ms.alive = true; ms.solo_hours = ''; ms.location = sv.location; ms.servant_loc = sv.location;
  updateRow_(SHEETS.BATTLE, ms._row, { servant_id:ms.servant_id, sv_hp:ms.sv_hp, sv_hp_max:ms.sv_hp_max,
    sv_mp:ms.sv_mp, sv_mp_max:ms.sv_mp_max, upkeep:ms.upkeep, alive:true, solo_hours:'', location:ms.location, servant_loc:ms.servant_loc });
  sv.alive = false; sv.solo_hours = '';            // 原無主從者列併入 ms，列本身退場
  updateRow_(SHEETS.BATTLE, sv._row, { alive:false, solo_hours:'' });
  var t = '失去御主的 '+svName+' 與 失去從者的御主「'+ms.master_name+'」締結新契約，組成新的隊伍';
  logEvent_(gameId, clock.day, pad2_(clock.hour)+':00', ms.location, 'RECONTRACT',
    'slot_'+(ms.slot-1), 'slot_'+(sv.slot-1), t, true, 1);
  events.push({ text:'⚑ 傳聞：'+t+'！一支新的隊伍出現在戰場。', global:true });
}

// 御主遇襲：從者不在身邊時，敵從者攻擊御主本人。武鬥/魔術階級決定減傷與反抗；
// Assassin 是獵殺御主的職階，傷害更高。血歸零 → 死亡結局（由 doAction 結算）。
function masterPeril_(gameId, player, enemy, clock){
  var eHero = findOne_(SHEETS.HEROES, { servant_id: enemy.servant_id });
  var isAssassin = eHero && eHero.cls === 'Assassin';
  var base = 28 + (isAssassin ? 18 : 0) + Math.floor(Math.random()*10);
  // 御主以體術＋魔術抵禦：階級越高減傷越多（武鬥A≈50 → 減 ~17；E≈10 → 減 ~5）
  var defend = Math.round((rankVal(player.melee) + rankVal(player.magic_rank)) / 3.5);
  // 武鬥高手有機會直接化解（葛木/言峰那類近戰御主），但非絕對無敵
  if(rankVal(player.melee) >= 50 && Math.random() < 0.4) defend += 18;
  var dmg = Math.max(3, base - defend);
  dmg = Math.min(dmg, Math.round((player.master_hp_max||100)*0.3));   // 單擊封頂 30%：不被一發打爆
  // 不暴斃鐵則：健康（>25%）時的致命一擊 → 只留 1 血、強警告，保證玩家有一回合反應；唯有已重傷才可能真死
  var nearFatal = false;
  if(player.master_hp - dmg <= 0 && player.master_hp > Math.round((player.master_hp_max||100)*0.25)){
    player.master_hp = 1; nearFatal = true;
  } else {
    player.master_hp = Math.max(0, player.master_hp - dmg);
  }
  updateRow_(SHEETS.BATTLE, player._row, { master_hp:player.master_hp });
  logEvent_(gameId, clock.day, pad2_(clock.hour)+':00', player.location, 'MASTER_HIT',
    'slot_'+(enemy.slot-1), 'slot_0',
    (eHero?eHero.cls:'敵從者')+' 襲擊御主 '+player.master_name+(nearFatal?'，將其重創至命懸一線':'，造成 '+dmg+' 傷害'), false, 1);
  return nearFatal;
}

// NPC 間短兵交手（3 回合互毆、低致命，HP 歸 0 才死）
function npcSkirmish_(a, b){
  var ha = findOne_(SHEETS.HEROES, { servant_id:a.servant_id });
  var hb = findOne_(SHEETS.HEROES, { servant_id:b.servant_id });
  function hit(att, def){ return Math.max(2, Math.round((rankVal(att.筋力)+Math.floor(Math.random()*9)-Math.floor(rankVal(def.耐久)/2))*0.7)); }
  var fast = rankVal(ha.敏捷) >= rankVal(hb.敏捷);
  var fleeT = TUNING.FLEE_HP || 0.5;
  for(var i=0;i<3 && a.sv_hp>0 && b.sv_hp>0;i++){
    if(fast){ b.sv_hp -= hit(ha,hb); if(b.sv_hp<=0) break; a.sv_hp -= hit(hb,ha); }
    else    { a.sv_hp -= hit(hb,ha); if(a.sv_hp<=0) break; b.sv_hp -= hit(ha,hb); }
    // NPC 間同樣不纏鬥至死：任一方重傷即脫離（保留戰力、讓戰局更持久）
    if(a.sv_hp <= a.sv_hp_max*fleeT || b.sv_hp <= b.sv_hp_max*fleeT) break;
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
// 魔力供給鏈（每小時）：環境(靈脈/工房) → 御主迴路 → 從者靈基 → 御主生命（破格召喚反噬）。
// 餘裕時御主迴路會把從者靈基回充到「自然上限 80%」，最後 20% 需供給/補魔/獵魔。
var BLEED_TURN_ = 0;   // 累計本回合靈基反噬汲取的御主生命，供 doAction 提示
function advanceTime_(p, clock, hero, apCost){
  var con = rankVal(hero ? heroFromRow_(hero).six.耐久 : 'C');
  for(var i=0;i<apCost;i++){
    if(clock.ap<=0) break;
    clock.ap--;
    for(var h=0;h<TUNING.HOURS_PER_AP;h++){
      clock.hour++; if(clock.hour>=24){ clock.hour=0; clock.day++; }
      var e = playerEconomy_(p);
      // 1) 御主迴路回復
      p.master_mp = Math.min(p.master_mp_max, p.master_mp + e.ms);
      // 2) 付維持費：環境免費 → 御主迴路 → 從者靈基 → 扣血（飢餓）
      var free = e.ley + e.ws + (e.craft||0), need = e.upkeep;
      var fromFree = Math.min(free, need); need -= fromFree; var freeLeft = free - fromFree;
      if(need>0){ var fromM = Math.min(p.master_mp, need); p.master_mp -= fromM; need -= fromM; }
      var starving = false;
      if(need>0){ var fromS = Math.min(p.sv_mp, need); p.sv_mp -= fromS; need -= fromS; }
      // 御主迴路與從者靈基都見底 → 從者反噬御主生命（破格召喚硬撐強力從者的代價）
      if(need>0){ p.master_hp = Math.max(0, p.master_hp - need); BLEED_TURN_ += need; starving = true; }
      // 3) 餘裕回充從者靈基，但自然只到 80%
      var cap = Math.round(p.sv_mp_max * TUNING.SV_NATURAL_CAP);
      if(!starving && p.sv_mp < cap){
        var room = cap - p.sv_mp;
        var addFree = Math.min(freeLeft, room); p.sv_mp += addFree; room -= addFree;
        var addM = Math.min(p.master_mp, TUNING.SV_TOPUP, room); p.sv_mp += addM; p.master_mp -= addM;
      }
      // 4) HP 緩回（非飢餓）
      if(!starving && p.sv_hp < p.sv_hp_max) p.sv_hp = Math.min(p.sv_hp_max, p.sv_hp + Math.round(con*TUNING.HP_REGEN_K));
    }
  }
  updateRow_(SHEETS.CLOCK, clock._row, { day:clock.day, hour:clock.hour, ap:clock.ap });
  updateRow_(SHEETS.BATTLE, p._row, { sv_mp:p.sv_mp, sv_hp:p.sv_hp, master_mp:p.master_mp, master_hp:p.master_hp });
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
    prompt:'我（'+p.master_name+'）凝神探查周遭一帶的魔力波動與氣息。請寫一段簡短的偵查敘述（不要列數字）。',
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
    prompt:'我（'+p.master_name+'）移動到了「'+dest.name+'」。'+dest.desc+enc+' 請寫一段抵達敘述。',
    suffix: enc ? ('\n\n【遭遇】'+enc.replace('\n此處有：','')) : '' };
}

// 好戰御主：重傷時傾向以令咒續戰/追擊；其餘御主傾向保命脫離
var AGGRESSIVE_MASTERS_ = ['言峰綺禮','吉爾伽美什','遠坂時臣','肯尼斯','間桐慎二','衛宮切嗣','雨生龍之介'];

/** 取某地隨機相鄰地（撤退落點），無則回 null */
function randAdj_(locId){
  var l = findOne_(SHEETS.MAP, { id: locId });
  var adj = (l && l.adj) ? l.adj : [];
  return adj.length ? adj[Math.floor(Math.random()*adj.length)] : null;
}
/** 把參戰列撤往相鄰地（alsoMaster：御主是否隨從者一起退） */
function retreatRow_(row, alsoMaster){
  var dest = randAdj_(row.servant_loc);
  if(dest){ row.servant_loc = dest; if(alsoMaster) row.location = dest; }
  return dest;
}

/**
 * 對面（敵方）御主的令咒反應 AI
 * @param situation 'defend'（敵從者重傷，要不要逃/治療/硬撐）｜'press'（玩家從者重傷，要不要燃咒追擊）
 * @return {type:'escape'|'heal'|'flee'|'press'|'none'}
 */
function enemyMasterReact_(enemyRow, situation){
  var aggressive = AGGRESSIVE_MASTERS_.indexOf(enemyRow.master_name) >= 0;
  var hasSeal = (enemyRow.seals||0) > 0;
  var roll = Math.random();
  if(situation === 'press'){                       // 玩家重傷 → 敵御主是否燃咒追擊
    return (hasSeal && roll < (aggressive?0.6:0.3)) ? {type:'press'} : {type:'none'};
  }
  // 'defend'：敵從者重傷。有令咒 → 優先瞬間移動脫離（強制 -1 令咒）以保命，
  // 好戰御主偶爾改為令咒治療續戰；令咒用盡才徒步且戰且退。死亡因此罕見，戰局更持久。
  if(!hasSeal) return {type:'flee'};
  if(aggressive && roll < 0.35) return {type:'heal'};
  return {type:'escape'};
}

// 從同地敵人中挑目標：自動鎖定「血量比例最低（最重傷）」者，方便補刀收尾
function pickFoe_(rows, here){
  var foes = rows.filter(function(r){ return r.is_player!==true && r.alive===true && r.servant_loc===here; });
  foes.sort(function(a,b){ return (a.sv_hp/(a.sv_hp_max||1)) - (b.sv_hp/(b.sv_hp_max||1)); });
  return foes[0];
}

function act_combat_(rows, p, clock, hero, mode, costAP){
  // 只能攻擊「此刻與你的從者同地」的敵人（看不到的人砍不到）；多個敵人時自動打最重傷者
  var here = p.separated ? p.servant_loc : p.location;
  var enemyRow = pickFoe_(rows, here);
  if(!enemyRow){
    var anyAlive = rows.some(function(r){ return r.is_player!==true && r.alive===true; });
    return anyAlive ? '（我的所在地沒有敵蹤——先用「🔍 偵查」找出附近從者，或移動到敵人所在地再交戰。）'
                    : '（場上已無可交戰的對手。）';
  }
  markDiscovered_(p, [enemyRow.slot]);
  // 寶具的魔力門檻要對齊「實際耗魔」＝普通交戰 + 寶具額外（否則剛好過門檻卻扣到歸零）
  if(mode==='np' && p.sv_mp < Math.round(p.sv_mp_max*(TUNING.COMBAT_MP+TUNING.NP_MP)))
    return '（魔力不足，無法解放寶具——可用令咒強制或先補魔。）';
  if(costAP && clock.ap<1) return '（行動點不足，請睡覺恢復。）';

  // 從者資料缺失（例如重建資料庫後 AI 生成英靈被清掉）→ 不要崩潰，給明確提示
  if(!hero) return '（找不到我的從者資料，存檔可能已損毀，建議開新局。）';
  var eHero = findOne_(SHEETS.HEROES, { servant_id: enemyRow.servant_id });
  if(!eHero) return '（找不到敵方從者資料，無法交戰。）';
  var A = Object.assign(heroFromRow_(hero), { hp:p.sv_hp, hpMax:p.sv_hp_max, mp:p.sv_mp, mpMax:p.sv_mp_max, buff:buffOf_(p.buff) });
  var B = Object.assign(heroFromRow_(eHero), { hp:enemyRow.sv_hp, hpMax:enemyRow.sv_hp_max, buff:buffOf_(enemyRow.buff) });
  p.buff = ''; enemyRow.buff = '';   // buff/減益為一次性，本場消耗

  var res = resolveCombat_(A, B, mode);
  p.sv_hp = res.aHp;                          // 敗北則從者靈基崩解（HP 歸 0 → 觸發死亡結局）
  p.sv_mp = Math.max(0, p.sv_mp - res.mpCost);
  enemyRow.sv_hp = res.bHp;

  var outcome, sealNote = '';
  if(res.bHp <= 0){                           // 敵從者倒下（多半來自寶具/令咒決死一擊）
    var remE = godHandRevive_(enemyRow);       // 十二試煉：仍有命數則復活
    if(remE > 0){
      outcome = 'enemy_revive';
      sealNote = B.cls+'倒下了——卻又緩緩站起。十二試煉的詛咒讓他一次次自死亡歸來（尚餘 '+remE+' 條命）。';
    } else {
      enemyRow.alive = false; p.bond = Math.min(100, p.bond+5); outcome = 'enemy_dead';
      var surge = Math.round(p.sv_mp_max * TUNING.KILL_MP);   // 擊殺回魔：敵靈核潰散的魔力湧入
      p.sv_mp = Math.min(p.sv_mp_max, p.sv_mp + surge);
      sealNote = '擊破'+B.cls+'，潰散的靈核魔力湧入我的從者（魔力 +'+surge+'）。';
    }
  } else if(res.aHp <= 0){                    // 我方從者倒下
    var remP = godHandRevive_(p);
    if(remP > 0){ outcome = 'player_revive'; sealNote = '我的從者一度倒下，卻憑十二試煉之力自死亡再起（尚餘 '+remP+' 條命）。'; }
    else outcome = 'player_dead';
  } else if(res.bFlee){                        // 敵從者重傷 → 對面御主的撤退/令咒判定
    var rx = enemyMasterReact_(enemyRow, 'defend');
    if(rx.type === 'escape'){
      retreatRow_(enemyRow, true); enemyRow.seals = Math.max(0, enemyRow.seals-1);
      sealNote = '對面御主「'+enemyRow.master_name+'」燃燒令咒，'+B.cls+'瞬間脫離戰場，遁向'+locName_(enemyRow.servant_loc)+'！';
      outcome = 'enemy_escape_seal';
    } else if(rx.type === 'heal'){
      enemyRow.sv_hp = enemyRow.sv_hp_max; enemyRow.seals = Math.max(0, enemyRow.seals-1);
      sealNote = '對面御主「'+enemyRow.master_name+'」燃燒令咒重塑'+B.cls+'的靈基，傷勢盡復、繼續對峙！';
      outcome = 'enemy_heal_seal';
    } else {
      retreatRow_(enemyRow, true);
      sealNote = B.cls+'重傷不支，向'+locName_(enemyRow.servant_loc)+'方向且戰且退。';
      outcome = 'enemy_flee';
    }
  } else if(res.aFlee){                        // 玩家從者重傷 → 對面御主是否燃咒追擊
    var rx2 = enemyMasterReact_(enemyRow, 'press');
    if(rx2.type === 'press'){
      var burst = Math.round(rankVal(B.six.寶具)*1.4) + 15;
      p.sv_hp = Math.max(0, p.sv_hp - burst); enemyRow.seals = Math.max(0, enemyRow.seals-1);
      sealNote = '對面御主「'+enemyRow.master_name+'」見我從者重傷，竟燃燒令咒下令追擊——'+B.cls+'全力一擊造成 '+burst+' 傷害！';
      if(p.sv_hp <= 0){
        if(godHandRevive_(p) > 0){ outcome = 'player_revive'; sealNote += ' 但我的從者憑十二試煉再起！'; }
        else { outcome = 'player_dead'; res.winner = 'B'; }
      } else { retreatRow_(p, !p.separated); outcome = 'player_flee_pressed'; }
    } else {
      retreatRow_(p, !p.separated);
      sealNote = '我的從者重傷，'+enemyRow.master_name+' 未予追擊——我帶傷退往'+locName_(p.separated?p.servant_loc:p.location)+'。';
      outcome = 'player_flee';
    }
  } else {
    outcome = 'standoff';
  }

  updateRow_(SHEETS.BATTLE, p._row, { sv_hp:p.sv_hp, sv_mp:p.sv_mp, bond:p.bond, status:p.status, buff:p.buff, location:p.location, servant_loc:p.servant_loc, separated:p.separated });
  updateRow_(SHEETS.BATTLE, enemyRow._row, { sv_hp:enemyRow.sv_hp, alive:enemyRow.alive, seals:enemyRow.seals, status:enemyRow.status, buff:enemyRow.buff, location:enemyRow.location, servant_loc:enemyRow.servant_loc });
  if(costAP) advanceTime_(p, clock, hero, 1);

  logEvent_(p.game_id, clock.day, pad2_(clock.hour)+':00', p.location, 'BATTLE',
            'slot_0', 'slot_'+(enemyRow.slot-1),
            A.cls+' 對 '+B.cls+'（'+enemyRow.master_name+'）交戰：'+outcome, true, 1);

  // 純 AI 敘述：戰況關鍵過程(beats)只餵給 LLM，不再把冷冰冰的數字戰報塞給玩家；
  // 唯一保留的尾註是「撤退/令咒/復活」這類玩家需要知道的轉折。
  return { kind:'combat',
    ctx:{ playerCls:A.cls, enemyCls:B.cls, enemyMaster:enemyRow.master_name,
          winner:res.winner, outcome:outcome, firedTags:res.firedTags, beats:res.beats, sealNote:sealNote },
    suffix: sealNote ? ('\n\n（'+sealNote+'）') : '' };
}

// 主動技能：耗魔力＋1AP。即時攻擊(bolt/petrify/zabaniya)打同地敵人；heal 回血；buff* 強化下一場戰鬥。
function act_skill_(rows, p, clock, hero, fx){
  if(!hero) return '（找不到從者資料。）';
  var sk = activeSkills_(hero).filter(function(a){ return a.fx===fx; })[0];
  if(!sk) return '（從者沒有這個主動技能。）';
  var cost = Math.round(p.sv_mp_max * sk.mpK);
  if(p.sv_mp < cost) return '（魔力不足，無法施展「'+sk.name+'」。）';
  if(clock.ap < 1) return '（行動點不足，請睡覺恢復。）';
  var A = heroFromRow_(hero);

  // 回復類
  if(sk.kind==='heal'){
    var heal = rankVal(A.six.耐久)*2 + 10 + Math.floor(Math.random()*10);
    p.sv_hp = Math.min(p.sv_hp_max, p.sv_hp + heal); p.sv_mp = Math.max(0, p.sv_mp - cost);
    updateRow_(SHEETS.BATTLE, p._row, { sv_hp:p.sv_hp, sv_mp:p.sv_mp });
    advanceTime_(p, clock, hero, 1);
    return { kind:'scene', prompt:'我的從者施展「'+sk.name+'」，靈基的創傷迅速彌合。請寫一段回復敘述。',
             suffix:'\n（'+sk.name+'：HP +'+heal+'　魔力 −'+cost+'）' };
  }
  // 強化類（下一場戰鬥）
  if(sk.kind==='buffdmg' || sk.kind==='buffhit'){
    p.buff = (sk.kind==='buffdmg')
      ? { dmg: Math.round(rankVal(A.six.筋力)*0.4) + 5, label:sk.name }
      : { hit: 8, label:sk.name };
    p.sv_mp = Math.max(0, p.sv_mp - cost);
    updateRow_(SHEETS.BATTLE, p._row, { buff:p.buff, sv_mp:p.sv_mp });
    advanceTime_(p, clock, hero, 1);
    var eff = (sk.kind==='buffdmg') ? ('下一場戰鬥傷害 +'+p.buff.dmg) : '下一場戰鬥命中 +8';
    return { kind:'scene', prompt:'我的從者施展「'+sk.name+'」，氣勢攀升、蓄勢待發。請寫一段強化/蓄力敘述。',
             suffix:'\n（'+sk.name+'：'+eff+'　魔力 −'+cost+'）' };
  }

  // 即時攻擊類：需同地敵人（多個時自動鎖定最重傷者）
  var here = p.separated ? p.servant_loc : p.location;
  var enemyRow = pickFoe_(rows, here);
  if(!enemyRow) return '（附近沒有可施術的對象——先靠近敵人。）';
  var eHero = findOne_(SHEETS.HEROES, { servant_id: enemyRow.servant_id });
  if(!eHero) return '（找不到敵方從者資料。）';
  var B = heroFromRow_(eHero), dmg = 0, note = '';
  if(sk.kind==='bolt'){
    dmg = Math.round(rankVal(A.six.魔力)*1.0) + 10 + Math.floor(Math.random()*8);
    var cut = antiMagicCut_(B); if(divineAge_(A)) cut *= 0.5;     // 神代魔術：對魔力半效
    if(cut>0){ dmg = Math.max(1, Math.round(dmg*(1-cut))); note = '（對魔力 −'+Math.round(cut*100)+'%）'; }
  } else if(sk.kind==='petrify'){
    dmg = Math.round(rankVal(A.six.魔力)*0.8) + 6;
    var cut2 = antiMagicCut_(B); if(divineAge_(A)) cut2 *= 0.5;
    if(cut2>0) dmg = Math.max(1, Math.round(dmg*(1-cut2)));
    enemyRow.buff = { dodge:-8, label:'石化遲滯' }; note = '（魔眼石化：敵下次戰鬥更易被命中）';
  } else if(sk.kind==='sever'){          // 破戒全咒：斬斷主從契約——敵令咒歸0、強化盡除
    dmg = Math.round(rankVal(A.six.魔力)*0.3);
    enemyRow.seals = 0; enemyRow.buff = '';
    note = '（破戒全咒・斬斷契約：敵令咒歸 0、強化盡除）';
  } else if(sk.kind==='summon'){         // 螺湮城教本：召喚深海妖物（神代魔術）
    dmg = Math.round(rankVal(A.six.魔力)*1.2) + Math.round(rankVal(A.six.寶具)*0.4) + Math.floor(Math.random()*10);
    var cutS = antiMagicCut_(B); if(divineAge_(A)) cutS *= 0.5; if(cutS>0) dmg = Math.max(1, Math.round(dmg*(1-cutS)));
    enemyRow.buff = { dodge:-8, label:'深海恐懼' }; note = '（螺湮城教本・深海妖物撕咬）';
  } else if(sk.kind==='gaebolg'){        // 刺穿死亡之棘：因果逆轉必中；高幸運可擾動
    dmg = Math.round(rankVal(A.six.寶具)*1.4) + Math.round(rankVal(A.six.筋力)*0.5) + Math.floor(Math.random()*9);
    var lr = Math.max(0, luckEdge_(B)) * 0.08; if(lr>0) dmg = Math.max(1, Math.round(dmg*(1-lr)));
    note = '（刺穿死亡之棘・因果逆轉必中'+(lr>0?('，高幸運擾動 −'+Math.round(lr*100)+'%'):'')+'）';
  } else if(sk.kind==='ubw'){            // 無限劍製：固有結界劍雨（物理連射）
    dmg = Math.round(rankVal(A.six.寶具)*0.7) + Math.round(rankVal(A.six.敏捷)*0.6) + Math.floor(Math.random()*11);
    note = '（無限劍製・劍雨連射）';
  } else if(sk.kind==='gob'){           // 王之財寶：寶具洪流（物理，不受對魔力）
    dmg = Math.round(rankVal(A.six.寶具)*1.0) + Math.round(rankVal(A.six.筋力)*0.3) + Math.floor(Math.random()*10);
    note = '（王之財寶・寶具洪流）';
  } else if(sk.kind==='chain'){         // 天之鎖：拘束，對神性者傷害倍增
    dmg = Math.round(rankVal(A.six.寶具)*0.4) + Math.floor(Math.random()*6);
    if(hasTrait_(B,'神性')){ dmg *= 2; note = '（天之鎖・縛束神靈 ×2）'; } else note = '（天之鎖・縛束）';
    enemyRow.buff = { dodge:-10, label:'天之鎖縛束' };
  } else if(sk.kind==='wind_strike'){   // 風王鐵鎚：不可視之風的一擊
    dmg = Math.round(rankVal(A.six.筋力)*0.8) + Math.round(rankVal(A.six.寶具)*0.4) + Math.floor(Math.random()*8);
    enemyRow.buff = { dodge:-5, label:'風壓' }; note = '（風王鐵鎚・斬風）';
  } else { // zabaniya：心臟一擊，無視對魔力與部分防禦
    dmg = Math.round(rankVal(A.six.筋力)*1.2) + rankVal(A.six.敏捷); note = '（心臟一擊・無視防禦）';
  }
  dmg = Math.min(dmg, Math.round(enemyRow.sv_hp_max * 0.7));   // 保險：單一主動技不得一發秒殺滿血（封頂 70% 上限）
  enemyRow.sv_hp = Math.max(0, enemyRow.sv_hp - dmg);
  var killed = false, reviveNote = '';
  if(enemyRow.sv_hp <= 0){
    var rem = godHandRevive_(enemyRow);
    if(rem>0) reviveNote = '　'+B.cls+'憑十二試煉再起（尚餘 '+rem+' 命）';
    else { enemyRow.alive = false; p.bond = Math.min(100, p.bond+5); killed = true; }
  }
  p.sv_mp = Math.max(0, p.sv_mp - cost);
  updateRow_(SHEETS.BATTLE, p._row, { sv_mp:p.sv_mp, bond:p.bond });
  updateRow_(SHEETS.BATTLE, enemyRow._row, { sv_hp:enemyRow.sv_hp, alive:enemyRow.alive, status:enemyRow.status, seals:enemyRow.seals, buff:enemyRow.buff||'' });
  advanceTime_(p, clock, hero, 1);
  logEvent_(p.game_id, clock.day, pad2_(clock.hour)+':00', p.location, 'SKILL',
            'slot_0', 'slot_'+(enemyRow.slot-1), A.cls+' 施展「'+sk.name+'」對 '+B.cls, true, 1);
  return { kind:'combat',
    ctx:{ playerCls:A.cls, enemyCls:B.cls, enemyMaster:enemyRow.master_name,
          winner: killed?'A':'draw', outcome: killed?'enemy_dead':'skill_hit', firedTags:[sk.name],
          beats:['〔'+sk.name+'〕對 '+B.cls+' 造成 '+dmg+' 傷害'+note], sealNote:'' },
    suffix:'\n\n（'+sk.name+'：'+dmg+' 傷害 '+note+reviveNote+'　魔力 −'+cost+'）' };
}

// 遠距離火力支援（狙擊）：Archer 限定。御主親自上前、與敵從者同地（直面、暴露無護衛），
// Archer 從相鄰地（射程 1）遠程開火——火力可觀且不挨近戰反擊；代價＝御主直面敵人、遭其反手一擊。
function act_snipe_(rows, p, clock, hero){
  if(!hero || hero.cls!=='Archer') return '（只有 Archer 能提供遠距離火力支援。）';
  if(!p.separated) return '（需先「分離」並把 Archer 派駐到敵人附近，自己再上前指示目標。）';
  if(clock.ap<1) return '（行動點不足，請睡覺恢復。）';
  var target = pickFoe_(rows, p.location);                 // 我（御主）親自直面、同地的敵從者
  if(!target) return '（我所在地沒有敵從者——須親自上前、與敵從者同地，才能為 Archer 指示目標（這也意味著我將暴露）。）';
  var enemyLoc = target.servant_loc;
  if(p.servant_loc===enemyLoc) return '（Archer 與敵同地＝近身戰，請改用「攻擊」；狙擊需從相鄰地遠程開火。）';
  var adj = (findOne_(SHEETS.MAP, { id: enemyLoc }) || {}).adj || [];
  if(adj.indexOf(p.servant_loc)<0) return '（Archer 不在射程內——須位於目標的相鄰地（1 距離），先「派駐從者」靠近。）';
  var cost = Math.round(p.sv_mp_max*0.15);
  if(p.sv_mp<cost) return '（魔力不足，無法支援射擊。）';
  var eHero = findOne_(SHEETS.HEROES, { servant_id: target.servant_id });
  if(!eHero) return '（找不到敵方從者資料。）';
  var A = heroFromRow_(hero), B = heroFromRow_(eHero);
  var dmg = Math.round(rankVal(A.six.寶具)*0.7) + Math.round(rankVal(A.six.敏捷)*0.5) + Math.floor(Math.random()*10);
  dmg = Math.min(dmg, Math.round(target.sv_hp_max*0.7));
  target.sv_hp = Math.max(0, target.sv_hp - dmg);
  var killed=false, reviveNote='';
  if(target.sv_hp<=0){ var rem=godHandRevive_(target);
    if(rem>0) reviveNote='　'+B.cls+'憑十二試煉再起（尚餘 '+rem+' 命）';
    else { target.alive=false; p.bond=Math.min(100,p.bond+5); killed=true; } }
  p.sv_mp = Math.max(0, p.sv_mp-cost);
  // 御主暴露：直面敵從者、身邊無護衛 → 若敵未死，敵從者反手揮向御主（這就是遠程支援的代價）
  var counter=0;
  if(!killed){ counter = Math.round(rankVal(B.six.筋力)*0.4)+5; p.master_hp = Math.max(0, p.master_hp-counter); }
  updateRow_(SHEETS.BATTLE, p._row, { sv_mp:p.sv_mp, bond:p.bond, master_hp:p.master_hp });
  updateRow_(SHEETS.BATTLE, target._row, { sv_hp:target.sv_hp, alive:target.alive, status:target.status });
  advanceTime_(p, clock, hero, 1);
  logEvent_(p.game_id, clock.day, pad2_(clock.hour)+':00', p.location, 'SNIPE',
            'slot_0', 'slot_'+(target.slot-1), A.cls+' 遠距離支援射擊 '+B.cls, true, 1);
  var beat = '〔遠距離支援〕Archer 自「'+locName_(p.servant_loc)+'」遠程狙擊 '+B.cls+'，造成 '+dmg+' 傷害（不挨近戰反擊）'
           + (counter?('；但我直面敵從者、身邊無護衛，'+B.cls+'反手揮來一擊（御主 HP −'+counter+'）'):(killed?'；一擊洞穿，敵從者灰飛煙滅':''));
  return { kind:'combat',
    ctx:{ playerCls:A.cls, enemyCls:B.cls, enemyMaster:target.master_name,
          winner: killed?'A':'draw', outcome: killed?'enemy_dead':'skill_hit',
          firedTags:['遠距離支援'], beats:[beat], sealNote:'' },
    suffix:'\n\n（遠距離支援：'+dmg+' 傷害'+reviveNote+'　魔力 −'+cost+(counter?('　御主直面反擊 HP −'+counter):'')+'）' };
}

function act_mana_(p, clock){
  if(clock.mana_locked) return '（補魔已在進行中——繼續對話即可推進。）';
  updateRow_(SHEETS.CLOCK, clock._row, { mana_countdown:TUNING.MANA_TURNS, mana_locked:true });
  return { kind:'scene',
    prompt:'我與從者開始補魔。依從者個性與好感度決定其態度（好感低則勉強/公事公辦、抗拒過度親密；好感高則有溫度），fade-to-black、點到為止。請寫一段含蓄起始敘述。',
    suffix:'\n（補魔開始：接下來 '+TUNING.MANA_TURNS+' 次對話用於補魔，期間時間與 NPC 凍結）' };
}
// 御主人設 context（餵 AI；第一人稱「我」的口吻依此演繹）
function masterCtx_(acc){
  var m = (acc && acc.settings && acc.settings.master) || null;
  var wish = (acc && acc.settings && acc.settings.wish) || '';
  if(!m || !m.name) return '';
  var s = '（御主＝「我」：'+m.name;
  if(m.gender) s += '，性別'+m.gender;
  if(m.origin) s += '，出身「'+m.origin+'」';
  if(m.magic)  s += '，魔術「'+m.magic+'」';
  if(m.melee)  s += '，體術'+m.melee+'級';
  if(m.persona) s += '，個性「'+m.persona+'」';
  if(wish)     s += '，願望「'+wish+'」';
  return s + '。第一人稱敘述與內心戲須貼合此人設，語氣口吻依其個性演繹。）';
}
function servantCtx_(p, hero){
  if(!hero) return '';
  var ps = hero.persona || {};
  return '（從者：'+hero.cls+'，真名'+(p.true_name_known?hero.realName:'未公開')+'，陣營「'+(hero.align||'未知')+'」，'
    + '個性「'+(ps.words||'')+'」，一人稱「'+(ps.firstP||'我')+'」，對御主態度「'+(ps.toMaster||'')+'」，目前好感度 '+p.bond+'/100。'
    + '請嚴格依此人格、陣營與好感回應，保有自主與尊嚴。）';
}
function act_claim_(p, clock, hero){
  if(clock.ap<1) return '（行動點不足，請睡覺恢復。）';
  if(p.base_loc===p.location) return '（此處已是我的據點。）';
  var isC = hero && hero.cls==='Caster';
  p.base_loc=p.location; p.barrier=30; p.barrier_max=isC?100:60; p.base_tier=isC?'魔術工房':'簡易結界';
  updateRow_(SHEETS.BATTLE, p._row, { base_loc:p.base_loc, barrier:p.barrier, barrier_max:p.barrier_max, base_tier:p.base_tier });
  advanceTime_(p, clock, hero, 1);
  return { kind:'scene', prompt:'我在「'+locName_(p.location)+'」佈置新的據點與結界，放棄舊據點。請寫一段建立據點/工房的敘述。' };
}

function act_feed_(p){
  if(p.master_mp<20) return '（御主魔力不足，無法供給。）';
  if(p.sv_mp>=p.sv_mp_max) return '（從者魔力已滿。）';
  var amt = Math.min(p.master_mp, Math.round(p.sv_mp_max*0.25));
  p.master_mp -= amt; p.sv_mp = Math.min(p.sv_mp_max, p.sv_mp+amt);
  updateRow_(SHEETS.BATTLE, p._row, { master_mp:p.master_mp, sv_mp:p.sv_mp });
  return '我透過魔術迴路將魔力導入從者——從者魔力 +'+amt+'。';
}

function act_reinforce_(p, hero){
  var isC = hero && hero.cls==='Caster';
  var cost = isC?10:18, gain = isC?28:16;
  if(p.master_mp<cost) return '（魔力不足，無法加固結界。）';
  if(p.barrier>=p.barrier_max) return '（結界已達上限。）';
  p.master_mp -= cost; p.barrier = Math.min(p.barrier_max, p.barrier+gain);
  updateRow_(SHEETS.BATTLE, p._row, { master_mp:p.master_mp, barrier:p.barrier });
  return '我'+(isC?'以工房之力':'')+'強化了據點結界（魔力 −'+cost+'）。結界 '+p.barrier+'/'+p.barrier_max+'。';
}

function act_separate_(p){
  p.separated = !p.separated; if(!p.separated) p.servant_loc = p.location;
  updateRow_(SHEETS.BATTLE, p._row, { separated:p.separated, servant_loc:p.servant_loc });
  return p.separated
    ? '我與從者分離行動——從者暫留「'+locName_(p.servant_loc)+'」。此後我移動時從者不再隨行（我將失去護衛）；可用「派駐從者」單獨指揮其前往他處，或「召回」會合。'
    : '從者回到我身邊，恢復同行與護衛。';
}

// 派駐從者：分離狀態下，單獨指揮從者移動到（從者所在的）相鄰地——遠程作戰/站崗/攔截，御主可留在安全處
function act_dispatch_(p, clock, hero, locId){
  if(!p.separated) return '（從者就在身邊；需先「分離」才能單獨派駐。）';
  if(clock.ap<1) return '（行動點不足，請睡覺恢復。）';
  var cur = findOne_(SHEETS.MAP, { id: p.servant_loc });
  if(!cur || (cur.adj||[]).indexOf(locId)<0) return '（該地與從者目前所在不相鄰，無法直接前往。）';
  p.servant_loc = locId;
  updateRow_(SHEETS.BATTLE, p._row, { servant_loc:p.servant_loc });
  var hereNpcs = findRows_(SHEETS.BATTLE, { game_id:p.game_id })
    .filter(function(r){ return r.is_player!==true && r.alive && r.servant_loc===locId; });
  markDiscovered_(p, hereNpcs.map(function(r){ return r.slot; }));
  advanceTime_(p, clock, hero, 1);
  var dest = findOne_(SHEETS.MAP, { id: locId }) || { name: locId, desc:'' };
  var enc = hereNpcs.length ? ('\n該地有：'+hereNpcs.map(function(r){ return heroCls_(r.servant_id)+'（'+r.master_name+'）'; }).join('、')) : '';
  return { kind:'scene',
    prompt:'我（'+p.master_name+'）透過心靈感應，命從者單獨潛行/挺進至「'+dest.name+'」。'+dest.desc+enc+' 我自己仍留在「'+locName_(p.location)+'」。請寫一段從者單獨行動、與主人遙相呼應的敘述。',
    suffix: enc ? ('\n\n【從者遭遇】'+enc.replace('\n該地有：','')) : '' };
}

// 主動撤退：帶從者退往相鄰地脫離交鋒（耗 1 AP，不耗令咒；撤退即與從者合流）
function act_retreat_(p, clock, hero){
  if(clock.ap<1) return '（行動點不足，請睡覺恢復。）';
  var here = p.separated ? p.servant_loc : p.location;
  var dest = randAdj_(here);
  if(!dest) return '（此處無路可退。）';
  p.location = dest; p.servant_loc = dest; p.separated = false;
  updateRow_(SHEETS.BATTLE, p._row, { location:p.location, servant_loc:p.servant_loc, separated:p.separated });
  advanceTime_(p, clock, hero, 1);
  return { kind:'scene', prompt:'我（'+p.master_name+'）當機立斷，帶著從者迅速撤離當前戰場，退往「'+locName_(dest)+'」。請寫一段緊張的脫離敘述。' };
}

// 獵魔：令從者獵食冬木的無辜者/亡者以大幅補魔。依陣營分流（善向拒絕、中立不情願扣好感、惡/狂化樂意）。
function act_hunt_(p, clock, hero){
  if(p.sv_mp>=p.sv_mp_max) return '（從者魔力已滿，無需獵食。）';
  var disp = feedDisposition_(hero);
  if(disp==='refuse'){
    // 善向從者連被提議都反感：不耗 AP、不回魔，好感小扣
    p.bond = Math.max(0, p.bond + TUNING.HUNT_BOND_REFUSE);
    updateRow_(SHEETS.BATTLE, p._row, { bond:p.bond });
    return { kind:'scene',
      prompt:'我示意從者獵食冬木的無辜者來補充魔力，但'+(hero?hero.cls:'從者')+'（'+(hero?hero.align:'')+'）斷然拒絕——殘害無辜違背其信念。請寫一段從者凜然回絕、甚至斥責我的敘述。',
      suffix:'\n（從者拒絕了獵食　好感 '+TUNING.HUNT_BOND_REFUSE+'）' };
  }
  if(clock.ap<1) return '（行動點不足，請睡覺恢復。）';
  var ratio = (disp==='willing') ? TUNING.HUNT_MP_WILLING : TUNING.HUNT_MP_RELUCT;
  var gain = Math.round(p.sv_mp_max * ratio);
  p.sv_mp = Math.min(p.sv_mp_max, p.sv_mp + gain);
  var bd = (disp==='willing') ? (alignGood_(hero)==='evil' ? TUNING.HUNT_BOND_EVIL : 0) : TUNING.HUNT_BOND_RELUCT;
  p.bond = Math.max(0, Math.min(100, p.bond + bd));
  updateRow_(SHEETS.BATTLE, p._row, { sv_mp:p.sv_mp, bond:p.bond });
  advanceTime_(p, clock, hero, 1);
  var tone = (disp==='willing')
    ? '從者毫不猶豫地獵食、汲取生命魔力，神情或冷酷或愉悅（依其個性）'
    : '從者壓抑著厭惡，為了維持靈基不得不獵食無辜，事後神色沉重';
  return { kind:'scene',
    prompt:'為了補充枯竭的魔力，'+tone+'。請寫一段帶有道德重量的獵食敘述（不要列數字）。',
    suffix:'\n（獵食補魔：魔力 +'+gain+(bd?('　好感 '+(bd>0?'+':'')+bd):'')+'）' };
}

function act_sleep_(p, clock){
  clock.day++; clock.hour=6; clock.ap=clock.ap_max;
  p.sv_hp=p.sv_hp_max; p.sv_mp=p.sv_mp_max; p.master_mp=p.master_mp_max;
  updateRow_(SHEETS.CLOCK, clock._row, { day:clock.day, hour:clock.hour, ap:clock.ap });
  updateRow_(SHEETS.BATTLE, p._row, { sv_hp:p.sv_hp, sv_mp:p.sv_mp, master_mp:p.master_mp });
  return { kind:'scene', prompt:'我睡了一覺，HP/魔力/行動點恢復，新的一天開始。冬木市昨夜想必又有從者交鋒。請寫一段晨醒敘述。' };
}

function act_seal_(rows, p, clock, hero, cmd){
  if(p.seals<=0) return '（令咒已用盡。）';
  // 戰鬥類令咒：先確認當地有敵人，否則不浪費這道珍貴的令咒（也不扣好感）
  if(cmd==='order' || cmd==='np'){
    var here = p.separated ? p.servant_loc : p.location;
    var hasEnemy = rows.some(function(r){ return r.is_player!==true && r.alive===true && r.servant_loc===here; });
    if(!hasEnemy) return '（我的所在地沒有敵蹤——令咒未動用。先偵查或移動到敵人所在地再使用。）';
  }
  p.seals--;
  var msg='';   // string 或 combat spec（order/np）
  switch(cmd){
    case 'heal': p.sv_hp=p.sv_hp_max; p.sv_mp=p.sv_mp_max; msg='令咒燃燒，魔力重塑「從者」靈基——從者 HP／魔力完全回復。（令咒命令的是從者，無法治癒御主肉身。）'; break;
    case 'order': if(p.bond<60){ p.bond=Math.max(0,p.bond-5); } msg=act_combat_(rows,p,clock,hero,'seal',false); break;
    case 'np':   if(p.bond<60){ p.bond=Math.max(0,p.bond-5); } msg=act_combat_(rows,p,clock,hero,'sealnp',false); break;
    case 'recall': p.separated=false; p.servant_loc=p.location;
      if(clock.mana_locked) updateRow_(SHEETS.CLOCK, clock._row, { mana_countdown:0, mana_locked:false });
      msg='令咒干涉空間，我與從者瞬間脫離當前戰局/險境。'; break;
    case 'mana': p.sv_mp=p.sv_mp_max; p.bond=Math.min(100,p.bond+12);
      if(clock.mana_locked) updateRow_(SHEETS.CLOCK, clock._row, { mana_countdown:0, mana_locked:false });
      msg='以令咒強制補魔——魔力灌滿、靈基穩固（跳過倒數）。'; break;
    default: msg='（未知令咒指令）';
  }
  updateRow_(SHEETS.BATTLE, p._row, { seals:p.seals, sv_hp:p.sv_hp, sv_mp:p.sv_mp, master_hp:p.master_hp, bond:p.bond, separated:p.separated, servant_loc:p.servant_loc });
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
