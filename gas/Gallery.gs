/**
 * Gallery.gs — 鑑賞室（後日談）
 * 玩家通關後留存／自由新增的英靈收藏。一切以 ms_id 隔離（多人單機不互相汙染）。
 * 最多 3 名「在場」可同時演出後日談。敘述走獨立路徑（afterStorySystem_），尺度含蓄。
 */

// 由英靈物件 + 選項建立鑑賞條目
function galleryEntry_(msId, hero, opts){
  opts = opts || {};
  return {
    ms_id: msId,
    entry_id: 'g_' + Utilities.getUuid(),
    servant_id: hero.id || hero.servant_id || '',
    cls: hero.cls || '',
    realName: hero.realName || '',
    six: hero.six || {},
    skills: hero.skills || [],
    classSkills: hero.classSkills || [],
    traits: hero.traits || [],
    np: hero.np || '',
    persona: hero.persona || {},
    align: hero.align || '',
    bond: (opts.bond != null) ? opts.bond : 50,
    condition: opts.condition || '',
    active: false,
    source: opts.source || 'custom',
    log: [],
    created: new Date().toISOString(),
    won_count: opts.won ? 1 : 0,           // 奪杯次數（重複奪杯疊加）
    won_day: opts.wonDay || '',            // 最近一次奪杯的天數
    won_note: opts.wonNote || ''           // 最近一次奪杯紀念（戰績摘要）
  };
}

// 內部：寫入一筆收藏
function galleryAdd_(msId, hero, opts){
  if(!msId || !hero) return null;
  var e = galleryEntry_(msId, hero, opts);
  appendObj_(SHEETS.GALLERY, e);
  return e;
}

// 通關留存：把玩家當前從者（battle 列 p）存進鑑賞室。重複奪杯 → 疊加次數、更新最近紀念與羈絆。
function galleryAddFromGame_(msId, p, day, note){
  if(!msId || !p || !p.servant_id) return;
  var existing = findRows_(SHEETS.GALLERY, function(g){ return g.ms_id===msId && g.servant_id===p.servant_id; });
  var hero = findOne_(SHEETS.HEROES, { servant_id: p.servant_id });
  if(!hero) return;
  var h = heroFromRow_(hero);
  if(existing.length){   // 已收藏 → 奪杯次數 +1、更新羈絆(取較高)、體況與最近紀念
    var top = existing[0];
    updateRow_(SHEETS.GALLERY, top._row, {
      won_count: (Number(top.won_count)||0) + 1,
      won_day: day || top.won_day, won_note: note || top.won_note,
      bond: Math.max(Number(top.bond)||0, Number(p.bond)||0),
      condition: p.sv_condition || top.condition });
    return;
  }
  galleryAdd_(msId, h, { bond: p.bond, condition: p.sv_condition, source: 'won', won: true, wonDay: day, wonNote: note });
}

// ── 對外 API（google.script.run 直呼） ──

// 列出某帳號的收藏（ms_id 隔離）
function galleryList(msId){
  if(!msId) return { entries: [] };
  var rows = findRows_(SHEETS.GALLERY, { ms_id: msId });
  return { entries: rows.map(function(g){
    return { entryId:g.entry_id, servantId:g.servant_id, cls:g.cls, realName:g.realName,
             six:g.six||{}, skills:g.skills||[], classSkills:g.classSkills||[], traits:g.traits||[],
             np:g.np, persona:g.persona||{}, align:g.align, bond:Number(g.bond)||0,
             condition:g.condition||'', active:g.active===true, source:g.source,
             wonCount:Number(g.won_count)||0, wonDay:g.won_day||'', wonNote:g.won_note||'',
             log:(g.log||[]).slice(-12) };
  }) };
}

// 移除一筆收藏
function galleryRemove(msId, entryId){
  if(!msId || !entryId) return { error:'參數不足。' };
  return withLock_(function(){
    var row = findOne_(SHEETS.GALLERY, function(g){ return g.ms_id===msId && g.entry_id===entryId; });
    if(!row) return { error:'找不到該收藏。' };
    sheet_(SHEETS.GALLERY).deleteRow(row._row);
    invalidate_(SHEETS.GALLERY);
    return galleryList(msId);
  });
}

// 切換「在場」（最多 3 名同時在場）
function gallerySetActive(msId, entryId, makeActive){
  if(!msId || !entryId) return { error:'參數不足。' };
  return withLock_(function(){
    var mine = findRows_(SHEETS.GALLERY, { ms_id: msId });
    var target = mine.filter(function(g){ return g.entry_id===entryId; })[0];
    if(!target) return { error:'找不到該收藏。' };
    if(makeActive){
      var activeCnt = mine.filter(function(g){ return g.active===true; }).length;
      if(target.active!==true && activeCnt>=3) return { error:'最多只能讓 3 名英靈同時在場。' };
    }
    updateRow_(SHEETS.GALLERY, target._row, { active: makeActive===true });
    return galleryList(msId);
  });
}

// 自由新增角色：用 AI 生成英靈（沿用 generateServant_），存進鑑賞室
function galleryCreate(msId, opts){
  if(!msId) return { error:'未登入。' };
  opts = opts || {};
  var name = (opts.name||'').trim(), cls = (opts.cls||'').trim();
  if(!name) return { error:'請輸入真名。' };
  if(!cls)  return { error:'請選擇職階。' };
  var descParts = [];
  if(opts.gender)  descParts.push('性別'+opts.gender);
  if(opts.wish)    descParts.push('願望「'+opts.wish+'」');
  if(opts.persona) descParts.push('個性「'+opts.persona+'」');
  if(opts.desc)    descParts.push(opts.desc);
  var gen = generateServant_(name, cls, descParts.join('、'));
  if(gen.error) return { error: gen.error };
  gen.id = gen.id || (name + '-' + cls + '-' + Utilities.getUuid().slice(0,6));
  var e = galleryAdd_(msId, gen, { bond: 50, source: 'custom' });
  return galleryList(msId);
}

// 其他在場英靈的名稱（供敘述帶到「同時在場」）
function galleryPresent_(msId, exceptId){
  return findRows_(SHEETS.GALLERY, { ms_id: msId })
    .filter(function(g){ return g.active===true && g.entry_id!==exceptId; })
    .map(function(g){ return g.cls + (g.realName?('・'+g.realName):''); });
}
function galleryHero_(row){
  return { cls:row.cls, realName:row.realName, six:row.six||{}, skills:row.skills||[],
           classSkills:row.classSkills||[], traits:row.traits||[], np:row.np,
           persona:row.persona||{}, align:row.align };
}
function galleryAppendLog_(row, meText, svText){
  var log = row.log||[];
  if(meText) log.push({ role:'me', text:meText });
  log.push({ role:'sv', text:svText });
  if(log.length>24) log = log.slice(-24);
  return log;
}

// 後日談・對話：與焦點英靈互動 → 獨立敘述路徑（含蓄尺度）
function gallerySay(msId, entryId, text, locName){
  if(!msId || !entryId) return { error:'參數不足。' };
  text = String(text||'').trim();
  if(!text) return { error:'請說點什麼。' };
  var row = findOne_(SHEETS.GALLERY, function(g){ return g.ms_id===msId && g.entry_id===entryId; });
  if(!row) return { error:'找不到該收藏。' };
  var history = (row.log||[]).slice(-8).map(function(m){ return (m.role==='me'?'我':'從者')+'：'+m.text; }).join('\n');
  var res = narrateAfterStory_(galleryHero_(row), Number(row.bond)||50, history, text, row.condition||'',
                               { locName: locName||'', present: galleryPresent_(msId, entryId) });
  updateRow_(SHEETS.GALLERY, row._row, { log: galleryAppendLog_(row, text, res.text), condition: res.condition||row.condition });
  return { narration: res.text, condition: res.condition||row.condition||'' };
}

// 後日談・約會：邀焦點英靈一同前往地圖某地散心 → 場景演出
function galleryScene(msId, entryId, locName){
  if(!msId || !entryId) return { error:'參數不足。' };
  var row = findOne_(SHEETS.GALLERY, function(g){ return g.ms_id===msId && g.entry_id===entryId; });
  if(!row) return { error:'找不到該收藏。' };
  var who = row.cls + (row.realName?('・'+row.realName):'');
  var history = (row.log||[]).slice(-6).map(function(m){ return (m.role==='me'?'我':'從者')+'：'+m.text; }).join('\n');
  var res = narrateAfterStory_(galleryHero_(row), Number(row.bond)||50, history,
            '（戰後安寧的日子裡，我邀「'+who+'」一同來到「'+(locName||'此處')+'」散步約會。）', row.condition||'',
            { locName: locName||'', present: galleryPresent_(msId, entryId) });
  updateRow_(SHEETS.GALLERY, row._row, { log: galleryAppendLog_(row, '（來到'+(locName||'此處')+'）', res.text), condition: res.condition||row.condition });
  return { narration: res.text, condition: res.condition||row.condition||'' };
}
