// 模擬整個回合流程（假的試算表、假的 Gemini 回應），抓出語法檢查抓不到的執行期錯誤
// 執行：node tests/sim-turn.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeSheet(name, rows) {
  const data = rows.map(r => r.slice());
  const width = () => Math.max(...data.map(r => r.length), 1);
  const ensure = (r, c) => { while (data.length < r) data.push([]); while (data[r - 1].length < c) data[r - 1].push(''); };
  const chain = { setBackground: () => chain, setFontColor: () => chain, setFontWeight: () => chain };
  const range = (r, c, nr, nc) => ({
    getValues: () => Array.from({ length: nr || 1 }, (_, i) => Array.from({ length: nc || 1 }, (_, j) => (data[r - 1 + i] || [])[c - 1 + j] ?? '')),
    getValue: () => (data[r - 1] || [])[c - 1] ?? '',
    setValues: function (v) { v.forEach((row, i) => row.forEach((x, j) => { ensure(r + i, c + j); data[r - 1 + i][c - 1 + j] = x; })); return chain; },
    setValue: v => { ensure(r, c); data[r - 1][c - 1] = v; }
  });
  return {
    name, data,
    getName: () => name,
    getLastRow: () => data.length,
    getLastColumn: () => width(),
    getDataRange: () => range(1, 1, data.length, width()),
    getRange: (r, c, nr, nc) => range(r, c, nr, nc),
    appendRow: row => data.push(row.slice()),
    deleteRow: r => data.splice(r - 1, 1)
  };
}

// 試算表只剩 Players_Save 與 ChatLog（由 SetupDB 的 initFateDatabase 建立）
const sheets = {};
const mockSS = {
  getSheetByName: n => sheets[n] || null,
  insertSheet: n => { sheets[n] = makeSheet(n, []); return Object.assign(sheets[n], { setFrozenRows() {} }); },
  getName: () => 'mock'
};

let geminiQueue = [];
const geminiRequests = [];
const props = {};
const cache = {};
const ctx = {
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => mockSS, flush: () => {} },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }), getUserLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, removeAll: ks => ks.forEach(k => delete cache[k]), remove: k => { delete cache[k]; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? (k === 'OAPIKEY' ? 'x' : null), setProperty: (k, v) => { props[k] = v; } }) },
  Utilities: { formatDate: () => '2026-11-27 12:00:00', sleep() {} },
  UrlFetchApp: {
    fetch: (url, opt) => {
      const body = JSON.parse(opt.payload);
      geminiRequests.push(body);
      const next = geminiQueue.shift();
      if (!next) throw new Error('unexpected Gemini call: ' + body.messages[0].content.slice(0, 60));
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ choices: [{ message: { content: typeof next === 'string' ? next : JSON.stringify(next) } }] }) };
    }
  }
};
vm.createContext(ctx);
vm.runInContext(['GameData.js', 'Lore.js', 'Code.js', 'SetupDB.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n'), ctx);

let fails = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails++; };

// 0. 初始化試算表（只建立兩個分頁）
ctx.initFateDatabase();
check('SetupDB 只建立 Players_Save 與 ChatLog', Object.keys(sheets).sort().join(',') === 'ChatLog,Players_Save' && sheets.Players_Save.data[0].length === 32);
sheets.Players_Save.data.push(['不能被清掉的舊存檔']);
ctx.initFateDatabase();
check('SetupDB 重跑不會清除既有資料', sheets.Players_Save.data.some(r => r[0] === '不能被清掉的舊存檔'));
sheets.Players_Save.data.pop();

// 1. 新遊戲
const ng = ctx.startNewGame('測試者');
check('新遊戲建立', ng.status.playerName === '測試者' && ng.status.adultMode === true);
check('召喚池來自內建資料、不含 saber_alter／hassan', ng.summonPool.length > 0 && !ng.summonPool.some(p => p.id === 'saber_alter' || p.id === 'hassan'));

// 2. 召喚
geminiQueue.push({ story: '召喚陣亮起。\n\n斯卡哈：「你就是我的御主？」', servant_class: 'Lancer', servant_name: '斯卡哈', servant_params: '筋力:B', servant_action_en: 'standing', master_action_en: 'surprised', scene_env_en: 'magic circle' });
const cr = ctx.completeCreationAndSummon({ playerName: '測試者', servantId: 'scathach', masterOrigin: '冬木市隱居古家族', masterGender: 'girl', masterWish: '願望', gameMode: 'WAR', masterCoreTags: '1girl, black hair', masterOutfitTags: 'black sweater' });
check('召喚完成', cr.status.servant1.id === 'scathach' && cr.status.inventory.length === 2);

// 3. 一般回合：用寶石、未知地名、陣營別名、流言、聯絡人、論壇、路線、重要事件
geminiQueue.push({
  judge_reason: '合理', outcome_type: 'CONTINUE', tiger_dojo_tip: '', story: '你捏碎了寶石。\n\n遠坂凜：「這是我的手機號碼。」',
  is_combat: false, ap_cost: 1, threat_delta: 5, bond_delta: 2, location: '冬木中學屋頂', master_mp_delta: 0, command_spells_used: 0,
  master_condition: '完好無損', servant_condition: '靈基穩定', servant2_condition: '', consumed_item_ids: ['mana_gem_m'], gained_items: [],
  servant_form_morph: '', outfit_updates: {}, faction_updates: { 'Archer陣營': '同盟 (與第8組結盟)', '路人甲': 'x' },
  forum_posts: [{ board: '怪談板', author: '路人', title: '屋頂有人', body: '看到兩個人在屋頂講話' }, '純文字格式的目擊貼文也要收'],
  rumor_updates: [], new_contacts: ['遠坂凜'], route_tendency_delta: { ubw: 3 }, servants_out: ['caster'], new_servant2_id: '',
  memory_update: '與凜結盟', key_events_add: ['與遠坂凜交換手機號碼並結盟'], key_events_resolve: [],
  present_chars: [{ id: 'rin', use_np: false, action_en: 'smile' }], scene_env_en: 'school rooftop, night'
});
// 英靈退場需要所屬陣營已被削弱：先把柳洞寺組設成負傷
{
  const row = sheets.Players_Save.data.find(r => r[0] === '測試者');
  const f = JSON.parse(row[29]); f['柳洞寺組 (Caster/Assassin陣營)'] = '存活 (敵對・重創負傷)'; row[29] = JSON.stringify(f);
}
const mpBefore = ctx.loadExistingGame('測試者').status.master.mp;
const t1 = ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '捏碎魔力寶石，然後跟凜交換手機號碼' });
const st = t1.status;
check('寶石 +65 MP（不超過上限）', st.master.mp === Math.min(st.master.maxMp, mpBefore + 65));
check('未知地名維持原地', st.locationKey === '廢棄洋館');
check('陣營別名對應（Archer陣營→遠坂組）', st.factions['遠坂組 (Archer陣營)'].startsWith('同盟'));
check('未知陣營被丟棄', !('路人甲' in st.factions));
check('聯絡人加入', Boolean(st.smsContacts['遠坂組 (Archer陣營)']));
check('論壇新增目擊', st.phoneState.forumPosts.some(p => p.title === '屋頂有人'));
check('論壇接受純文字貼文', st.phoneState.forumPosts.some(p => p.body === '純文字格式的目擊貼文也要收'));
check('美狄亞退場 → 臟硯組成立', '臟硯組 (真Assassin陣營)' in st.factions);
check('路線傾向累積', st.routeTendency.ubw === 3);
check('重要事件記錄', st.keyEvents.includes('與遠坂凜交換手機號碼並結盟'));
check('劇情附上本回合結算', /【本回合結算】/.test(t1.story));
check('非戰鬥場景：角色負面提示詞排除武器', t1.imagePayload.characters.every(c => c.id === 'player_master' || /holding weapon/.test(c.uc)));
check('繪圖 payload 角色欄以 girl 開頭', t1.imagePayload.characters.every(c => /^(girl|boy)/.test(c.prompt)));
check('ChatLog 有寫入', sheets.ChatLog.data.length === 3);

// 4. 論壇假消息 → 流言 → 下一回合被識破
const fp = ctx.postFuyukiForumMessage('測試者', '假消息', '聽說言峰神父其實是幕後黑手', true);
const rid = fp.rumors[fp.rumors.length - 1].id;
check('假消息寫入流言', fp.rumors.some(r => r.isFake && r.status === '擴散中'));
geminiQueue.push({
  outcome_type: 'CONTINUE', story: '教會方面毫無動靜。', ap_cost: 1, threat_delta: 0, bond_delta: 0, location: '廢棄洋館',
  master_mp_delta: -5, rumor_updates: [{ id: rid, status: '已被識破', doubters: ['教會組'], effect: '言峰開始調查發文者' }],
  present_chars: [{ id: 'player_master', action_en: 'thinking' }], scene_env_en: 'basement'
});
const t2 = ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '觀察論壇反應' });
const r2 = t2.status.rumors.find(r => r.id === rid);
check('流言被識破並記錄懷疑者', r2.status === '已被識破' && r2.doubters.includes('教會組 (Lancer陣營)'));

// 5. 簡訊：聯絡人（同盟）＋假情報
geminiQueue.push({ reply: '收到，今晚我會注意。', believed: 'yes', reaction: '提高戒備' });
const sm = ctx.sendAllySmsMessage('測試者', '遠坂組 (Archer陣營)', 'Caster 今晚會襲擊遠坂邸', true);
const th = sm.phoneState.smsThreads['遠坂組 (Archer陣營)'];
check('簡訊 AI 回覆＋管道標頭（凜＝使魔字條）', th.messages[th.messages.length - 1].text === '（使魔捎來的字條）收到，今晚我會注意。');
check('簡訊假情報寫入流言', sm.rumors.some(r => r.channel.includes('簡訊') && r.believers.includes('遠坂組 (Archer陣營)')));

// 5b. 沒有接通：不啟動支援、不放出假情報
const rumorCountBefore = sm.rumors.length;
geminiQueue.push({ answered: false, reply: '使魔遲遲沒有回來。', believed: 'no', reaction: '' });
const sm2 = ctx.sendAllySmsMessage('測試者', '遠坂組 (Archer陣營)', '快來支援！其實 Lancer 已經消滅了', true);
check('沒接通：不啟動支援', !/簡訊支援待命中/.test(sm2.factions['遠坂組 (Archer陣營)']) || /簡訊支援待命中/.test(sm.factions['遠坂組 (Archer陣營)']));
check('沒接通：假情報不算放出', sm2.rumors.length === rumorCountBefore);

// 5c. 教會是公開據點，不用先取得聯絡方式
geminiQueue.push({ answered: true, reply: '主的大門永遠為迷途者敞開。', believed: 'yes', reaction: '答應赴約' });
const ch1 = ctx.sendAllySmsMessage('測試者', '教會組 (Lancer陣營)', '神父，今晚來洋館吃麻婆豆腐嗎？', false);
check('教會隨時聯絡得到，回覆帶教會管道標頭', /^（教會的回信）/.test(ch1.phoneState.smsThreads['教會組 (Lancer陣營)'].messages.slice(-1)[0].text));

// 6. 無聯絡方式的陣營不能傳
let blocked = false;
try { ctx.sendAllySmsMessage('測試者', '愛因茲貝倫組 (Berserker陣營)', '你好', false); } catch (e) { blocked = /聯絡方式/.test(e.message); }
check('沒有聯絡方式的陣營擋下', blocked);

// 7. Gemini 回傳壞掉的 JSON → 重試一次成功
geminiQueue.push('這不是 JSON');
geminiQueue.push({ outcome_type: 'CONTINUE', story: '平靜的一夜。', ap_cost: 0, location: '廢棄洋館', present_chars: [], scene_env_en: 'night' });
const t3 = ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '休息' });
check('壞 JSON 自動重試', t3.story.startsWith('平靜的一夜'));

// 8. 世界書（內建 Lore.js）：不分大小寫命中、無關條目不載入、必載入條目一定在
geminiQueue.push({ outcome_type: 'CONTINUE', story: '你思考著狂戰士的弱點。', ap_cost: 0, location: '廢棄洋館', present_chars: [], scene_env_en: 'night' });
ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '我想研究 berserker 的弱點' });
const lorePrompt = geminiRequests[geminiRequests.length - 1].messages[1].content;
check('世界書：小寫 berserker 命中 Berserker 條目', lorePrompt.includes('[從者・Berserker]'));
check('世界書：無關條目不載入', !lorePrompt.includes('[現代禮裝]'));
check('世界書：優先度 10 必載入', lorePrompt.includes('[角色認知邊界]') && lorePrompt.includes('[世界觀與遭遇]'));

// 8b. 沒有交換號碼的證據 → 不給聯絡方式
geminiQueue.push({ outcome_type: 'CONTINUE', story: '你在教會門口跟神父打了招呼。', ap_cost: 0, location: '廢棄洋館', new_contacts: ['教會組'], present_chars: [], scene_env_en: 'church' });
const nc = ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '跟神父打招呼' });
check('只是見面不給聯絡方式', !nc.status.smsContacts['教會組 (Lancer陣營)']);

// 8c. 場地狀態延續：破壞大橋 → 存檔保留 → 之後的回合提示詞與繪圖背景都看得到
geminiQueue.push({ outcome_type: 'CONTINUE', story: '寶具轟碎了大橋的鋼架。', ap_cost: 0, location: '冬木大橋', location_changes: { '冬木大橋': '鋼架扭曲斷裂、橋面焦黑龜裂，護欄崩落' }, present_chars: [], scene_env_en: 'bridge' });
const lc = ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '在大橋解放寶具' });
check('場地改變寫入存檔', lc.status.dynamicLocations['冬木大橋'].desc.includes('鋼架扭曲斷裂'));
check('結算顯示場地改變', /🏚 冬木大橋 現況改變/.test(lc.story));
check('繪圖背景帶入場地現況', lc.imagePayload._directorContext.locationDesc.includes('鋼架扭曲斷裂'));
geminiQueue.push({ outcome_type: 'CONTINUE', story: '你回到了洋館。', ap_cost: 0, location: '廢棄洋館', present_chars: [], scene_env_en: 'room' });
ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '回洋館' });
geminiQueue.push({ outcome_type: 'CONTINUE', story: '你在洋館休息。', ap_cost: 0, location: '廢棄洋館', present_chars: [], scene_env_en: 'room' });
ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '休息' });
const promptAway = geminiRequests[geminiRequests.length - 1].messages[1].content;
check('離開後，地標清單仍記得大橋已被破壞', promptAway.includes('現況已改變：鋼架扭曲斷裂'));

// 8d. 玩家沒有取得或使用意圖時，AI 不能自己做出道具或消耗道具
const invBefore = ctx.loadExistingGame('測試者').status.inventory.map(i => i.id + ':' + i.qty).join(',');
geminiQueue.push({ outcome_type: 'CONTINUE', story: '你佈置了房間，順手煉成了保命符。', ap_cost: 0, location: '廢棄洋館', consumed_item_ids: ['empty_gem'], gained_items: [{ id: 'aegis_charm', name: '對魔術防禦禮裝(保命符)', tier: 3, type: 'equipment', qty: 1 }], present_chars: [], scene_env_en: 'room' });
const noOver = ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '用布幕把地下室隔出休息區' });
check('沒要求就不會憑空得到保命符', !noOver.status.inventory.some(i => i.id === 'aegis_charm'));
check('沒要求就不會消耗道具', noOver.status.inventory.map(i => i.id + ':' + i.qty).join(',') === invBefore);
check('提示詞包含御主性別', geminiRequests[geminiRequests.length - 1].messages[1].content.includes('性別:女'));

// 8e. 其他陣營主動傳訊：出現在聯絡頁、加上管道標頭、增加未讀、之後可以回覆
geminiQueue.push({ outcome_type: 'CONTINUE', story: '一隻白色小鳥停在窗邊。', ap_cost: 0, location: '廢棄洋館', incoming_messages: [{ faction: '伊莉雅', text: '大哥哥的朋友，要不要來城堡玩？' }], present_chars: [], scene_env_en: 'room' });
const inc = ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '在洋館休息' });
const ith = inc.status.phoneState.smsThreads['愛因茲貝倫組 (Berserker陣營)'];
check('主動傳訊寫入聯絡頁並加上管道標頭', ith && /^（白色小鳥銜來的字條）大哥哥/.test(ith.messages.slice(-1)[0].text));
check('主動傳訊後可以回覆（取得聯絡方式）', Boolean(inc.status.smsContacts['愛因茲貝倫組 (Berserker陣營)']));

// 9. 第一人稱視角：畫面不畫御主、加上 pov
ctx.savePlayerSettingsOnly('測試者', { cameraMode: 'pov' });
geminiQueue.push({ outcome_type: 'CONTINUE', story: '凜瞪著你。', ap_cost: 0, location: '廢棄洋館', present_chars: [{ id: 'player_master', action_en: 'x' }, { id: 'rin', action_en: 'glaring' }], scene_env_en: 'room' });
const pv = ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '看著凜' });
check('第一人稱：不畫御主', pv.status.cameraMode === 'pov' && !pv.imagePayload.characters.some(c => c.id === 'player_master'));
check('第一人稱：主提示詞有 pov、人數只算凜', /^1girl, solo, pov, first-person view, depth of field/.test(pv.imagePayload.prompt));
ctx.savePlayerSettingsOnly('測試者', { cameraMode: 'third' });

// 9b. 撤回上一回合：存檔還原、對話紀錄刪除、回傳上一回合的行動
const beforeUndo = ctx.loadExistingGame('測試者');
geminiQueue.push({ outcome_type: 'CONTINUE', story: '你打碎了花瓶。', ap_cost: 1, threat_delta: 30, location: '廢棄洋館', present_chars: [], scene_env_en: 'room' });
ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '打碎花瓶' });
const un = ctx.undoLastTurn('測試者');
check('撤回：警戒度還原', un.status.threatLevel === beforeUndo.status.threatLevel);
check('撤回：回傳上一回合行動', un.lastAction === '打碎花瓶');
check('撤回：對話紀錄刪除', un.logs.length === beforeUndo.logs.length);
let undoTwice = false; try { ctx.undoLastTurn('測試者'); } catch (e) { undoTwice = /沒有可以撤回/.test(e.message); }
check('撤回只能一次', undoTwice);

// 9c. 主從者消滅且沒有副從者 → 失去從者；之後重新締約成為主從者
geminiQueue.push({ outcome_type: 'CONTINUE', story: '斯卡哈的靈基崩解了。', ap_cost: 0, location: '廢棄洋館', servant_condition: '消滅', present_chars: [], scene_env_en: 'room' });
const lost = ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '撐住' });
check('主從者消滅 → 失去從者', lost.status.servant1.id === '' && /失去從者/.test(lost.story));
geminiQueue.push({ outcome_type: 'CONTINUE', story: '小次郎同意與你締約。', ap_cost: 0, location: '廢棄洋館', new_servant2_id: 'assassin', present_chars: [], scene_env_en: 'room' });
const re2 = ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '請小次郎與我締約' });
check('失去從者後重新締約 → 成為主從者', re2.status.servant1.id === 'assassin' && !re2.status.servant2.id);

// 10. 讀檔
const ld = ctx.loadExistingGame('測試者');
check('讀檔取得最近紀錄（最多 12 筆）', ld.logs.length === 12);

console.log(`\n${fails === 0 ? '全部通過' : fails + ' 項失敗'}`);
process.exit(fails ? 1 : 0);
