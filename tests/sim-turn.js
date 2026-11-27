// 模擬整個回合流程（假的試算表、假的 Gemini 回應），抓出語法檢查抓不到的執行期錯誤
// 執行：node tests/sim-turn.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeSheet(name, rows) {
  const data = rows.map(r => r.slice());
  const width = () => Math.max(...data.map(r => r.length), 1);
  const ensure = (r, c) => { while (data.length < r) data.push([]); while (data[r - 1].length < c) data[r - 1].push(''); };
  const range = (r, c, nr, nc) => ({
    getValues: () => Array.from({ length: nr || 1 }, (_, i) => Array.from({ length: nc || 1 }, (_, j) => (data[r - 1 + i] || [])[c - 1 + j] ?? '')),
    getValue: () => (data[r - 1] || [])[c - 1] ?? '',
    setValues: v => { v.forEach((row, i) => row.forEach((x, j) => { ensure(r + i, c + j); data[r - 1 + i][c - 1 + j] = x; })); },
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

const charRows = [['角色ID', '觸發名稱', '性別', '核心', '服裝', 'UC', '可召喚'],
  ['player_master', '玩家,御主', 'girl', '1girl, black hair', 'black sweater', '', false],
  ['scathach', '斯卡哈,師匠', 'girl', 'scathach (fate), purple hair', 'purple bodysuit', '', true],
  ['saber_alter', '黑Saber', 'girl', 'artoria alter', 'black armor', '', true],
  ['caster', 'Caster,美狄亞', 'girl', 'medea (fate)', 'purple cloak', '', false],
  ['assassin', 'Assassin,小次郎', 'boy', 'sasaki kojirou', 'haori', '', false],
  ['rin', '遠坂凜,凜', 'girl', 'tohsaka rin', 'red sweater', '', false]];
const facRows = [['陣營名稱', '御主ID', '從者ID', '預設狀態', '預設態度', '內幕'],
  ['衛宮組 (Saber陣營)', 'shirou', 'saber', '存活', '中立警戒', ''],
  ['遠坂組 (Archer陣營)', 'rin', 'archer', '存活', '中立試探', ''],
  ['教會組 (Lancer陣營)', 'kirei', 'lancer', '存活', '敵對暗算', ''],
  ['間桐組 (Rider陣營)', 'sakura', 'rider', '存活', '隱蔽觀察', ''],
  ['柳洞寺組 (Caster/Assassin陣營)', 'souichirou', 'caster', '存活', '敵對防備', ''],
  ['愛因茲貝倫組 (Berserker陣營)', 'illya', 'berserker', '存活', '敵對獵殺', '']];
const sheets = {
  Char_Appearance: makeSheet('Char_Appearance', charRows),
  Factions_Relations: makeSheet('Factions_Relations', facRows),
  Lorebook: makeSheet('Lorebook', [['關鍵字', '分類', '優先', '內容'],
    ['靈脈', '規則', 10, '必載入的核心規則LORE10'],
    ['Berserker,海克力士', '型月生態', 8, '狂戰士設定LOREBSK'],
    ['起源彈', '現代禮裝', 7, '起源彈設定LOREORI']]),
  Players_Save: makeSheet('Players_Save', [Array.from({ length: 32 }, (_, i) => 'H' + i)]),
  ChatLog: makeSheet('ChatLog', [['玩家', '回合', '時間', '地點', '行動', '劇情', '角色', 'payload', 'seed']])
};

let geminiQueue = [];
const geminiRequests = [];
const props = {};
const cache = {};
const ctx = {
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => sheets[n] || null, getName: () => 'mock' }), flush: () => {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }), getUserLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, removeAll: ks => ks.forEach(k => delete cache[k]) }) },
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
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Code.js'), 'utf8'), ctx);

let fails = 0;
const check = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails++; };

// 1. 新遊戲
const ng = ctx.startNewGame('測試者');
check('新遊戲建立', ng.status.playerName === '測試者' && ng.status.adultMode === true);
check('試算表升級：補上 hassan、saber_alter 不可召喚', sheets.Char_Appearance.data.some(r => r[0] === 'hassan') && sheets.Char_Appearance.data.find(r => r[0] === 'saber_alter')[6] === false);

// 2. 召喚
geminiQueue.push({ story: '召喚陣亮起。\n\n斯卡哈：「你就是我的御主？」', servant_class: 'Lancer', servant_name: '斯卡哈', servant_params: '筋力:B', servant_action_en: 'standing', master_action_en: 'surprised', scene_env_en: 'magic circle' });
const cr = ctx.completeCreationAndSummon({ playerName: '測試者', servantId: 'scathach', masterOrigin: '冬木市隱居古家族', masterGender: 'girl', masterWish: '願望', gameMode: 'WAR', masterCoreTags: '1girl, black hair', masterOutfitTags: 'black sweater' });
check('召喚完成', cr.status.servant1.id === 'scathach' && cr.status.inventory.length === 2);

// 3. 一般回合：用寶石、未知地名、陣營別名、流言、聯絡人、論壇、路線、重要事件
geminiQueue.push({
  judge_reason: '合理', outcome_type: 'CONTINUE', tiger_dojo_tip: '', story: '你捏碎了寶石。\n\n遠坂凜：「這是我的號碼。」',
  is_combat: false, ap_cost: 1, threat_delta: 5, bond_delta: 2, location: '冬木中學屋頂', master_mp_delta: 0, command_spells_used: 0,
  master_condition: '完好無損', servant_condition: '靈基穩定', servant2_condition: '', consumed_item_ids: ['mana_gem_m'], gained_items: [],
  servant_form_morph: '', outfit_updates: {}, faction_updates: { 'Archer陣營': '同盟 (與第8組結盟)', '路人甲': 'x' },
  forum_posts: [{ board: '怪談板', author: '路人', title: '屋頂有人', body: '看到兩個人在屋頂講話' }],
  rumor_updates: [], new_contacts: ['遠坂凜'], route_tendency_delta: { ubw: 3 }, servants_out: ['caster'], new_servant2_id: '',
  memory_update: '與凜結盟', key_events_add: ['與遠坂凜交換手機號碼並結盟'], key_events_resolve: [],
  present_chars: [{ id: 'rin', use_np: false, action_en: 'smile' }], scene_env_en: 'school rooftop, night'
});
const mpBefore = ctx.loadExistingGame('測試者').status.master.mp;
const t1 = ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '捏碎魔力寶石，然後跟凜交換手機號碼' });
const st = t1.status;
check('寶石 +65 MP（不超過上限）', st.master.mp === Math.min(st.master.maxMp, mpBefore + 65));
check('未知地名維持原地', st.locationKey === '廢棄洋館');
check('陣營別名對應（Archer陣營→遠坂組）', st.factions['遠坂組 (Archer陣營)'].startsWith('同盟'));
check('未知陣營被丟棄', !('路人甲' in st.factions));
check('聯絡人加入', Boolean(st.smsContacts['遠坂組 (Archer陣營)']));
check('論壇新增目擊', st.phoneState.forumPosts.some(p => p.title === '屋頂有人'));
check('美狄亞退場 → 臟硯組成立', '臟硯組 (真Assassin陣營)' in st.factions);
check('路線傾向累積', st.routeTendency.ubw === 3);
check('重要事件記錄', st.keyEvents.includes('與遠坂凜交換手機號碼並結盟'));
check('劇情附上本回合結算', /【本回合結算】/.test(t1.story));
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
check('簡訊 AI 回覆', th.messages[th.messages.length - 1].text === '收到，今晚我會注意。');
check('簡訊假情報寫入流言', sm.rumors.some(r => r.channel.includes('簡訊') && r.believers.includes('遠坂組 (Archer陣營)')));

// 6. 無聯絡方式的陣營不能傳
let blocked = false;
try { ctx.sendAllySmsMessage('測試者', '教會組 (Lancer陣營)', '你好', false); } catch (e) { blocked = /聯絡方式/.test(e.message); }
check('沒有聯絡方式的陣營擋下', blocked);

// 7. Gemini 回傳壞掉的 JSON → 重試一次成功
geminiQueue.push('這不是 JSON');
geminiQueue.push({ outcome_type: 'CONTINUE', story: '平靜的一夜。', ap_cost: 0, location: '廢棄洋館', present_chars: [], scene_env_en: 'night' });
const t3 = ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '休息' });
check('壞 JSON 自動重試', t3.story.startsWith('平靜的一夜'));

// 8. 世界書：不分大小寫命中、無關條目不載入、必載入條目一定在
geminiQueue.push({ outcome_type: 'CONTINUE', story: '你思考著狂戰士的弱點。', ap_cost: 0, location: '廢棄洋館', present_chars: [], scene_env_en: 'night' });
ctx.processFateTurnTextOnly({ playerName: '測試者', userAction: '我想研究 berserker 的弱點' });
const lorePrompt = geminiRequests[geminiRequests.length - 1].messages[1].content;
check('世界書：小寫 berserker 命中 Berserker 條目', lorePrompt.includes('狂戰士設定LOREBSK'));
check('世界書：無關條目不載入', !lorePrompt.includes('起源彈設定LOREORI'));
check('世界書：優先度 10 必載入', lorePrompt.includes('必載入的核心規則LORE10'));
check('世界書：附上分類標籤', lorePrompt.includes('[型月生態]'));

// 9. 內建世界書只補一次：玩家刪掉後、版本升級也不會補回
const loreSheet = sheets.Lorebook;
const seededCount = loreSheet.data.filter(r => r[1] === '禮裝煉成').length;
check('內建世界書已補上（同分類不重複）', seededCount === 1 && loreSheet.data.filter(r => r[1] === '型月生態').length === 1);
loreSheet.data.splice(loreSheet.data.findIndex(r => r[1] === '禮裝煉成'), 1);
props.FATE_SCHEMA_VERSION = 'old';
ctx.clearFateConfigCache();
ctx.loadExistingGame('測試者');
check('玩家刪掉的內建條目不會被補回', loreSheet.data.filter(r => r[1] === '禮裝煉成').length === 0);

// 10. 讀檔
const ld = ctx.loadExistingGame('測試者');
check('讀檔取得最近紀錄', ld.logs.length === 5);

console.log(`\n${fails === 0 ? '全部通過' : fails + ' 項失敗'}`);
process.exit(fails ? 1 : 0);
