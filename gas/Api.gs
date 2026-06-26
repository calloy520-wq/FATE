/**
 * Api.gs — Web App 進入點 + 編輯器測試
 *
 * 前端透過 google.script.run.<函式>() 呼叫：login / getStatic / newGame / getState / doAction
 */

function doGet(){
  // 目前先服務既有原型（client 端）；下一步把 index.html 的 SERVER 換成 google.script.run。
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('命運停駐之夜 — 聖杯戰爭')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ===================== 編輯器測試 =====================

/** 純戰鬥引擎（讀英靈殿兩隻對打，不需 LLM/不寫檔） */
function testCombatEngine(){
  var rows = readAll_(SHEETS.HEROES);
  var saber = heroFromRow_(rows.filter(function(r){return r.servant_id==='阿爾托莉雅-Saber';})[0]);
  var berserker = heroFromRow_(rows.filter(function(r){return r.servant_id==='赫拉克勒斯-Berserker';})[0]);
  saber.hp = deriveServant_(saber).hpMax; saber.mpMax = deriveServant_(saber).mpMax;
  berserker.hp = deriveServant_(berserker).hpMax;
  var res = resolveCombat_(saber, berserker, false);
  Logger.log('Saber vs Berserker → 勝者: '+res.winner+'　觸發: '+res.firedTags.join('、'));
  res.beats.forEach(function(b){ Logger.log(b); });
}

/** 數值經濟（驗證越強越耗魔、伊莉雅養狂化叔） */
function testEconomy(){
  var rows = readAll_(SHEETS.HEROES);
  var b = heroFromRow_(rows.filter(function(r){return r.servant_id==='赫拉克勒斯-Berserker';})[0]);
  var up = deriveServant_(b).upkeep;
  Logger.log('Berserker 維持費: '+up);
  Logger.log('一般御主(迴路30) 淨值: '+economyNet_({circuits:30,upkeep:up,leyline:'低'}).net);
  Logger.log('伊莉雅(迴路70)  淨值: '+economyNet_({circuits:70,upkeep:up,leyline:'低'}).net);
}

/** 完整流程：登入 → 開局(第五次・扮演士郎) → 狀態 → 移動 → 戰鬥（會用到 LLM，需設 key） */
function testFullFlow(){
  var acc = login('測試玩家');
  Logger.log('帳號: '+JSON.stringify(acc));
  var st = newGame({ ms_id:acc.ms_id, mode:'canon', war:'5th', role:'canon', masterIndex:0 });
  if(st.error){ Logger.log('開局錯誤: '+st.error); return; }
  Logger.log('game_id: '+st.game_id);
  Logger.log('玩家：'+st.player.master.name+'｜從者 '+st.player.servant.cls+
             ' HP'+st.player.servant.hp+'/'+st.player.servant.hpMax+
             '｜維持'+st.player.servant.upkeep+'｜淨'+st.economy.net+'/h');
  Logger.log('戰局：'+st.roster.map(function(r){return r.cls+(r.isPlayer?'(你)':'');}).join('、'));
  var r1 = doAction({ game_id:st.game_id, type:'move', locId:'miyama' });
  Logger.log('移動→深山町　AP:'+r1.state.clock.ap+'｜'+r1.narration);
  var r2 = doAction({ game_id:st.game_id, type:'attack' });
  Logger.log('戰鬥：'+r2.narration);
}

/** 清空所有遊戲存檔（測試用，保留靜態定檔） */
function clearGames(){
  [SHEETS.BATTLE, SHEETS.CLOCK, SHEETS.EVENTS, SHEETS.MEMORY, SHEETS.ACCOUNTS].forEach(function(name){
    var s = sheet_(name); var last = s.getLastRow();
    if(last>1) s.getRange(2,1,last-1,s.getLastColumn()).clearContent();
  });
  Logger.log('已清空動態存檔。');
}
