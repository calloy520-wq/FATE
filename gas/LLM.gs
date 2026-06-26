/**
 * LLM.gs — OpenRouter（Gemini）呼叫，可抽換的單一入口
 * 鐵則：AI 只敘述／記錄，數字一律由 GAS 算好後交給它潤飾。
 */

/**
 * 通用呼叫
 * @return {text} 或 {json} 或 {error}
 */
function callLLM(system, user, opts){
  opts = opts || {};
  // 防呆：本函式需由遊戲流程帶參數呼叫，請勿在編輯器直接執行（改跑 testLLM）
  if(system == null || user == null)
    return { error: 'callLLM 需要 system/user 參數，請勿直接執行——請改在編輯器執行 testLLM()。' };
  var key = getApiKey();
  if(!key) return { error: '未設定 OPENROUTER_API_KEY（專案設定 → 指令碼屬性）' };

  var payload = {
    model: opts.model || OPENROUTER.model,
    messages: [
      { role:'system', content: system },
      { role:'user',   content: user }
    ],
    temperature: (opts.temperature == null) ? 0.85 : opts.temperature,
    max_tokens: opts.maxTokens || 600
  };
  if(opts.json) payload.response_format = { type:'json_object' };
  var options = {
    method:'post', contentType:'application/json',
    headers:{ 'Authorization':'Bearer '+key, 'X-Title':'FateStayNight-GAS' },
    payload: JSON.stringify(payload), muteHttpExceptions:true
  };

  // 重試＋退避：暫時性錯誤（網路/429/5xx/解析失敗）自動再試。
  // ⚠ 本函式一律在「寫入鎖之外」呼叫（見 doAction 的 Phase 2），所以 sleep 不會卡住其他玩家。
  var retries = opts.retries || 3, lastErr = '';
  for(var i=0;i<retries;i++){
    try {
      var res = UrlFetchApp.fetch(OPENROUTER.url, options);
      var code = res.getResponseCode();
      var body = res.getContentText();
      if(code===429 || code>=500){ lastErr = 'HTTP '+code; }      // 暫時性 → 退避重試
      else if(code >= 300) return { error:'HTTP '+code, body: body.slice(0,500) };  // 永久性 → 直接回報
      else {
        var j = JSON.parse(body);
        var content = j.choices[0].message.content;
        if(opts.json) return { json: extractJson_(content) };     // 容錯：抓出被前後文包住的 JSON
        return { text: content };
      }
    } catch(e){ lastErr = String(e); }                            // 網路/解析例外 → 退避重試
    if(i < retries-1) Utilities.sleep(1500*(i+1));
  }
  return { error:'呼叫失敗（已重試）：'+lastErr };
}

/** 從模型輸出抓出 JSON：模型偶爾會用 ```json 或前後文把 JSON 包住，截出第一個 { 到最後一個 } 再解析 */
function extractJson_(text){
  if(typeof text !== 'string') return text;
  var s = text.indexOf('{'), e = text.lastIndexOf('}');
  return JSON.parse((s>=0 && e>s) ? text.substring(s, e+1) : text);
}

// 共用敘事系統提示（鎖住鐵則）
function narratorSystem_(){
  return [
    '你是《命運停駐之夜》聖杯戰爭的敘事者。以「我」（玩家＝御主）的第一人稱視角演出：旁白、所見與內心都是「我」。嚴禁用「你」、嚴禁上帝視角。',
    '【文風】帶一點 Fate／TYPE-MOON 的味道即可，但要克制——自然流暢、口吻冷靜，有畫面感但不堆砌辭藻、不濫用華麗形容詞。抓住當下最關鍵的一兩個感官與情緒就好，避免陳腔與重複句式。你是演出者，不是報告員。',
    '【從者要活】從者有獨立人格，務必讓他在場：依其個性、一人稱與對「我」的態度開口。對白格式——從者（神態或動作）：「台詞。」。在合適時機讓從者說一兩句，帶出性格與此刻情緒，不要整段只有旁白。',
    '【篇幅】約 100～180 字，分 2～3 個短段（段間空一行），靠情緒與對白撐起，不流水帳、不硬湊字。',
    '【鐵則】所有數值（HP／魔力／勝負／傷害／結果）皆由系統算定，我只「描述與演出」，絕不可更動或宣布任何數字或勝負。若提供「觸發標籤」可自然帶出，但不解釋公式、不報數字。',
    '【自主與分際】從者並非順從工具：對無禮、強迫或猥褻會抗拒、冷淡或反擊，好感越低反應越強硬。好感是信任與羈絆，不等於服從或情慾；即使好感很高仍保有尊嚴。親密一律 fade-to-black、點到為止。'
  ].join('\n');
}

/** 召喚開場：御主人設＋願望 × 從者個性／陣營 → 從者依尊嚴真實反應（不照抄他人） */
function summonOpening_(hero, master, wish){
  if(!hero) return '';
  var p = hero.persona || {};
  master = master || {};
  var mdesc = '御主＝「我」：'+(master.name||'無名御主')
    + (master.gender?('，性別'+master.gender):'')
    + (master.origin?('，出身「'+master.origin+'」'):'')
    + (master.magic?('，魔術「'+master.magic+'」'):'')
    + (master.persona?('，個性「'+master.persona+'」'):'')
    + (wish?('，願望「'+wish+'」'):'');
  var user = '【召喚開場】\n'+mdesc
    + '\n從者：'+hero.cls+'（真名暫不對外公開；陣營'+(hero.align||'未知')+'，個性「'+(p.words||'')+'」，一人稱「'+(p.firstP||'我')+'」，對御主態度「'+(p.toMaster||'')+'」）'
    + '\n請以第一人稱「我」描寫召喚開場：靈光與魔力的震顫、從者立於我面前的姿態。'
    + '接著從者打量「我」這名御主與我的願望，依其自身個性、陣營與尊嚴做出真實反應——審視、戒備、揶揄、不屑或淡然皆可；'
    + '若我的願望對其唐突、不敬或冒犯（例如把高傲的英靈當成戀愛或佔有的對象），她／他會明顯冷淡、反感甚至嗤之以鼻，絕不會初次見面就順從或傾心。'
    + '最後讓從者依其性格說出第一句台詞（不要照抄原作他人台詞）。約 140～200 字，分 2 段。';
  var r = callLLM(narratorSystem_(), user, { temperature:0.95, maxTokens:900 });
  return r.text || '';
}

/** 把 GAS 戰報事實交給 AI 潤飾成戰鬥敘述（memory＝已知世界線/記憶） */
function narrateCombat(ctx, memory){
  var sys = narratorSystem_();
  var resultMap = {
    enemy_dead:'我方擊破敵從者',
    enemy_revive:'敵從者被擊倒卻憑十二試煉自死亡復生',
    player_dead:'我方從者被擊破',
    player_revive:'我方從者被擊倒卻憑十二試煉再起',
    enemy_flee:'敵從者重傷、且戰且退',
    enemy_escape_seal:'敵御主燃燒令咒，讓重傷的從者緊急脫離',
    enemy_heal_seal:'敵御主燃燒令咒治癒從者、繼續對峙',
    player_flee:'我方從者重傷撤退、脫離交鋒',
    player_flee_pressed:'我方從者重傷撤退，敵御主燃咒追擊',
    skill_hit:'我方以術式擊中敵從者',
    standoff:'雙方僵持、各自退開'
  };
  var resultText = resultMap[ctx.outcome] || (ctx.winner==='A'?'我方擊破敵從者':ctx.winner==='B'?'我方從者被擊破':'雙方膠著');
  var user = [
    memory ? ('【已知世界線/記憶】\n'+memory+'\n') : '',
    '【戰鬥事實（系統已算定，請勿更動）】',
    '我方從者：'+ctx.playerCls+'　敵方從者：'+ctx.enemyCls+(ctx.enemyMaster?('（敵御主：'+ctx.enemyMaster+'）'):''),
    '結果：'+resultText,
    ctx.sealNote ? ('關鍵轉折：'+ctx.sealNote) : '',
    '觸發標籤：'+((ctx.firedTags&&ctx.firedTags.length)?ctx.firedTags.join('、'):'無'),
    '關鍵過程：',
  ].concat((ctx.beats||[]).slice(0,8)).concat([
    '請依以上事實寫一段戰鬥敘述：若有撤退或令咒介入，務必帶出敵御主身份與那一瞬的張力；與已知世界線一致，不要列出數字。',
    CONDITION_SCHEMA_
  ]).join('\n');
  return narrateJSON_(sys, user);
}

// 共用：體況輸出格式（我方從者此刻的外觀/姿勢動作/神情，純外顯、第三人稱）
var CONDITION_SCHEMA_ =
  '\n請輸出 JSON：{"narration":"敘述（依系統指示的篇幅與第一人稱）","condition":"我方從者此刻的『外觀＋姿勢動作＋神情』，純外顯、第三人稱、≤24字，'
  + '例：白裙染塵、單膝半跪、按劍喘息、眉宇凜然。隨劇情變化（受傷則狼狽、得勝則昂揚、補魔後則紅暈未褪）"}';

/** 呼叫 LLM（JSON）→ {text, condition}；失敗則回退純文字、condition 留空 */
function narrateJSON_(sys, user){
  var r = callLLM(sys, user, { json:true, temperature:0.9, maxTokens:900 });
  if(r.json) return { text: String(r.json.narration||''), condition: String(r.json.condition||'').slice(0,40) };
  return { text: r.text || ('（敘述生成失敗：'+(r.error||'')+'）'), condition: '' };
}

/** 敘述並抽取應長期記住的事實（用於玩家自由對話，單次呼叫同時產出敘述＋記憶） */
function narrateAndExtract_(prompt, memory){
  var sys = narratorSystem_()
    + '\n輸出 JSON：{"narration":"敘述（依系統指示的篇幅與第一人稱）","condition":"我方從者此刻的外觀/姿勢動作/神情，純外顯、第三人稱、≤24字",'
    + '"facts":[{"entity":"對象","content":"玩家新建立、值得長期記住的事實","importance":0}]}。'
    + 'facts 只收「玩家這次新確立、之後需保持一致」的設定（地點狀態/約定/自訂設定等）；沒有則空陣列。importance 0~2。';
  var user = (memory ? ('【已知世界線/記憶】\n'+memory+'\n\n') : '') + prompt;
  var r = callLLM(sys, user, { json:true, temperature:0.9, maxTokens:900 });
  if(r.json) return { narration: r.json.narration || '', condition: String(r.json.condition||'').slice(0,40), facts: r.json.facts || [] };
  return { narration: r.text || ('（敘述失敗：'+(r.error||'')+'）'), condition: '', facts: [] };
}

/** 一般場景敘述（移動/搜索/閒聊等）→ {text, condition} */
function narrateScene(prompt, memory){
  var sys = narratorSystem_();
  var user = (memory ? ('【已知世界線/記憶】\n'+memory+'\n\n') : '') + prompt + CONDITION_SCHEMA_;
  return narrateJSON_(sys, user);
}

/** AI 生成英靈資料（真名召喚／自訂），回傳已夾值的從者物件 */
function generateServant_(name, cls, desc){
  var sys = '你是 Fate 系列的英靈資料產生器。只輸出 JSON，給出平衡合理的數值，不要多餘文字。';
  var schema = '{"six":{"筋力":"E~A","耐久":"E~A","敏捷":"E~A","魔力":"E~A","幸運":"E~A","寶具":"E~A+"},'
    + '"classSkills":[{"n":"技能名","r":"階級","fx":"效果碼"}],"skills":[{"n":"","r":"","fx":""}],'
    + '"traits":[{"n":"特性"}],"np":"寶具名（簡述）","align":"陣營，格式「秩序/中立/混沌・善/中立/惡」，狂戰士可填「混沌・狂」",'
    + '"persona":{"firstP":"一人稱","words":"性格關鍵詞","toMaster":"對御主態度"}}';
  var user = '為英靈產生資料。真名：'+name+'　職階：'+cls + (desc?('　額外描述：'+desc):'')
    + '\n若為其他作品角色或原創角色，將其特徵與能力對應成最貼切的 Fate 風格六維、技能與寶具。'
    + '\n依角色挑選貼切的效果碼填入技能 fx（沒對應就留空字串），可用碼：'
    + '\n[被動] nullify_magic對魔力 evade_ranged避矢 burst魔力放出 survive戰鬥續行 morale勇猛 first_strike直感 analyze心眼 ride騎乘 divine_core神核 stealth氣息遮斷 divine神性 tactics軍略 divine_age神代魔術'
    + '\n[經濟] mad狂化 solo單獨行動 territory陣地作成 crafting道具作成 wealth黃金律'
    + '\n[主動] fast_cast高速神言 petrify魔眼 zabaniya妄想心音 rune符文 shapeshift變生 str_up怪力 projection投影 weapon_steal武裝掠奪 aim千里眼 gob王之財寶 chain天之鎖 wind_strike風王鐵鎚 rule_breaker破戒全咒 summon_horror召喚妖物 gae_bolg刺穿死亡之棘(必中) ubw無限劍製'
    + '\n平衡限制：六維上限 A、寶具上限 A+。嚴格只輸出此 JSON schema：\n' + schema;
  var r = callLLM(sys, user, { json:true, temperature:0.7 });
  if(r.error) return { error: r.error };
  return sanitizeHero_(r.json, name, cls);
}

// AI 生成可用的效果碼白名單（須與引擎實作的 fx 一致，否則 cleanSkill_ 會清掉）
var FX_OK_ = ['nullify_magic','evade_ranged','stealth','ride','territory','crafting','mad',
              'first_strike','analyze','burst','divine','morale','survive','solo','divine_core',
              'tactics','wealth','divine_age',
              // 主動技
              'fast_cast','petrify','zabaniya','rune','shapeshift','str_up','projection','aim',
              'weapon_steal','gob','chain','wind_strike','rule_breaker','summon_horror','gae_bolg','ubw'];
/** 夾值陣營：取「秩序/中立/混沌・善/中立/惡(或狂)」，不合法則回中立・中庸 */
function cleanAlign_(a){
  a = String(a||'');
  var ord = (a.indexOf('秩序')>=0)?'秩序':(a.indexOf('混沌')>=0)?'混沌':'中立';
  var mor = (a.indexOf('狂')>=0)?'狂':(a.indexOf('善')>=0)?'善':(a.indexOf('惡')>=0)?'惡':'中庸';
  return ord+'・'+mor;
}
function cleanSkill_(s){
  s = s || {};
  return { n: String(s.n||'技能').slice(0,8),
           r: String(s.r||'').replace(/[^EDCBAX+]/g,'').slice(0,3),
           fx: FX_OK_.indexOf(s.fx)>=0 ? s.fx : '' };
}
/** 夾值防止破壞平衡：六維上限 A、寶具上限 A+、技能數量上限 */
function sanitizeHero_(g, name, cls){
  var R = ['E','D','C','B','A'];
  function six6(v){ v = String(v||'C').replace(/\+/g,'').replace('EX','A'); return R.indexOf(v)>=0 ? v : 'C'; }
  function np6(v){ v = String(v||'C').replace('EX','A+'); var b=v.replace(/\+/g,''); if(R.indexOf(b)<0) b='C';
                   return b + ((v.match(/\+/g)||[]).length>0 ? '+' : ''); }
  var s = g.six || {};
  return {
    six: { 筋力:six6(s.筋力), 耐久:six6(s.耐久), 敏捷:six6(s.敏捷), 魔力:six6(s.魔力), 幸運:six6(s.幸運), 寶具:np6(s.寶具) },
    classSkills: (g.classSkills||[]).slice(0,3).map(cleanSkill_),
    skills: (g.skills||[]).slice(0,4).map(cleanSkill_),
    traits: (g.traits||[]).slice(0,3).map(function(t){ return { n: String((t&&t.n)||t||'人類').slice(0,6) }; }),
    np: String(g.np||'（生成寶具）').slice(0,40),
    align: cleanAlign_(g.align),
    persona: { firstP: String((g.persona&&g.persona.firstP)||'我').slice(0,4),
               words: String((g.persona&&g.persona.words)||'AI 生成').slice(0,20),
               toMaster: String((g.persona&&g.persona.toMaster)||'待相處後確立').slice(0,20) }
  };
}

// 編輯器測試：確認 API key 與連線
function testLLM(){
  var r = callLLM(narratorSystem_(), '玩家抵達了冬木大橋的夜色中，請寫一段抵達敘述。', {});
  Logger.log(JSON.stringify(r, null, 2));
}
