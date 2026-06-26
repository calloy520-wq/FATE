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

  var res;
  try {
    res = UrlFetchApp.fetch(OPENROUTER.url, {
      method:'post', contentType:'application/json',
      headers:{ 'Authorization':'Bearer '+key, 'X-Title':'FateStayNight-GAS' },
      payload: JSON.stringify(payload), muteHttpExceptions:true
    });
  } catch(e){ return { error:'fetch 失敗：'+e }; }

  var code = res.getResponseCode();
  var body = res.getContentText();
  if(code >= 300) return { error:'HTTP '+code, body: body.slice(0,500) };

  try {
    var j = JSON.parse(body);
    var content = j.choices[0].message.content;
    if(opts.json) return { json: JSON.parse(content) };
    return { text: content };
  } catch(e){ return { error:'解析回應失敗：'+e, body: body.slice(0,500) }; }
}

// 共用敘事系統提示（鎖住鐵則）
function narratorSystem_(){
  return [
    '你是《命運停駐之夜》聖杯戰爭的旁白與從者口吻敘事者。',
    '鐵則：所有數值（HP/魔力/勝負/傷害）都已由系統算定，你只負責「描述」與「演出」，',
    '絕對不可更動或自行宣布任何數字或勝負。語氣貼近 Fate 原作，簡潔有畫面感，2~4 句。',
    '若提供「觸發標籤」，可自然帶出（如對魔力彈開魔術），但不要解釋數值或公式。'
  ].join('\n');
}

/** 把 GAS 戰報事實交給 AI 潤飾成戰鬥敘述 */
function narrateCombat(ctx){
  // ctx: {playerCls, enemyCls, winner, firedTags[], beats[]}
  var sys = narratorSystem_();
  var user = [
    '【戰鬥事實（系統已算定，請勿更動）】',
    '我方從者：'+ctx.playerCls+'　敵方從者：'+ctx.enemyCls,
    '結果：'+(ctx.winner==='A'?'我方擊破敵從者':ctx.winner==='B'?'我方從者被擊破':'雙方膠著'),
    '觸發標籤：'+((ctx.firedTags&&ctx.firedTags.length)?ctx.firedTags.join('、'):'無'),
    '關鍵過程：',
  ].concat((ctx.beats||[]).slice(0,8)).concat([
    '請依以上事實寫一段戰鬥敘述（2~4 句），不要列出數字。'
  ]).join('\n');

  var r = callLLM(sys, user, { temperature:0.9 });
  return r.text || ('（敘述生成失敗：'+(r.error||'')+'）');
}

/** 一般場景敘述（移動/搜索/閒聊等） */
function narrateScene(prompt, memory){
  var sys = narratorSystem_();
  var user = (memory ? ('【已知世界線/記憶】\n'+memory+'\n\n') : '') + prompt;
  var r = callLLM(sys, user, {});
  return r.text || ('（敘述生成失敗：'+(r.error||'')+'）');
}

/** AI 生成英靈資料（真名召喚／自訂），回傳已夾值的從者物件 */
function generateServant_(name, cls, desc){
  var sys = '你是 Fate 系列的英靈資料產生器。只輸出 JSON，給出平衡合理的數值，不要多餘文字。';
  var schema = '{"six":{"筋力":"E~A","耐久":"E~A","敏捷":"E~A","魔力":"E~A","幸運":"E~A","寶具":"E~A+"},'
    + '"classSkills":[{"n":"技能名","r":"階級","fx":"效果碼"}],"skills":[{"n":"","r":"","fx":""}],'
    + '"traits":[{"n":"特性"}],"np":"寶具名（簡述）","persona":{"firstP":"一人稱","words":"性格關鍵詞","toMaster":"對御主態度"}}';
  var user = '為英靈產生資料。真名：'+name+'　職階：'+cls + (desc?('　額外描述：'+desc):'')
    + '\n可用效果碼：nullify_magic,evade_ranged,stealth,ride,territory,crafting,mad,first_strike,analyze,burst,divine,morale,survive，或空字串。'
    + '\n平衡限制：六維上限 A、寶具上限 A+。嚴格只輸出此 JSON schema：\n' + schema;
  var r = callLLM(sys, user, { json:true, temperature:0.7 });
  if(r.error) return { error: r.error };
  return sanitizeHero_(r.json, name, cls);
}

var FX_OK_ = ['nullify_magic','evade_ranged','stealth','ride','territory','crafting','mad',
              'first_strike','analyze','burst','divine','morale','survive'];
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
