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

// 編輯器測試：確認 API key 與連線
function testLLM(){
  var r = callLLM(narratorSystem_(), '玩家抵達了冬木大橋的夜色中，請寫一段抵達敘述。', {});
  Logger.log(JSON.stringify(r, null, 2));
}
