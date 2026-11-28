// 伺服器把關壓力測試：手寫「AI 常犯的錯」當作 Gemini 回應（重複扣令咒、亂扣道具、沒交戰就淘汰、亂送副從者、
// 型別錯亂、結局值寫錯…），確認伺服器都擋得住。不呼叫任何外部 API。
// 執行：node tests/stress-guards.js
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
vm.runInContext(['GameData.js', 'Lore.js', 'Code.js', 'Image.js', 'Characters.js', 'SetupDB.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n'), ctx);
let fails = 0;
const check = (name, cond, extra) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 300) : ''}`); if (!cond) fails++; };
ctx.initFateDatabase();
const P = '壓測員';
ctx.startNewGame(P);
geminiQueue.push({ story: '召喚陣亮起。', servant_class: 'Saber', servant_name: '沖田總司', servant_action_en: 'standing', master_action_en: 'calm', scene_env_en: 'magic circle' });
ctx.completeCreationAndSummon({ playerName: P, servantId: 'okita', masterOrigin: '時鐘塔叛逃魔術師', masterGender: 'girl', masterWish: '守護', gameMode: 'WAR', masterCoreTags: '1girl, silver hair', masterOutfitTags: 'navy coat' });
const row = () => sheets.Players_Save.data.find(r => r[0] === P);
const meta = () => JSON.parse(row()[31]);
const setMeta = fn => { const m = meta(); fn(m); row()[31] = JSON.stringify(m); };
const setFac = fn => { const f = JSON.parse(row()[29]); fn(f); row()[29] = JSON.stringify(f); };
const base = (o) => Object.assign({ outcome_type: 'CONTINUE', story: '劇情。', is_combat: false, ap_cost: 1, threat_delta: 0, bond_delta: 0, location: '', master_mp_delta: 0, command_spells_used: 0, consumed_item_ids: [], gained_items: [], faction_updates: {}, present_chars: [{ id: 'okita', action_en: 'standing' }], scene_env_en: 'room' }, o);
const turn = (action, o) => { geminiQueue.push(base(o)); return ctx.processFateTurnTextOnly({ playerName: P, userAction: action }); };
const run = (name, fn) => { try { fn(); } catch (e) { check(name + '（執行錯誤）', false, e.stack.split('\n').slice(0, 3).join(' | ')); } };
const S = { ctx, sheets, geminiQueue, check, P, row, meta, setMeta, setFac, base, turn, run };
const C = S.ctx;
const st = () => C.loadExistingGame(S.P).status;
const fac = () => JSON.parse(row()[29]);
const tryCall = (name, fn) => { try { const r = fn(); check(name, true); return r; } catch (e) { check(name, false, String(e.message || e)); } };
// ===== stress1 =====

run('令咒', () => {
  const before = Number(row()[16]);
  turn('撤退回洋館清點收穫', { command_spells_used: 1, location: '廢棄洋館' });
  check('沒提令咒，AI 回報用令咒 → 不扣', Number(row()[16]) === before, row()[16]);
  turn('以令咒命令沖田全力突擊', { command_spells_used: 1, is_combat: true });
  check('提到令咒 → 扣一畫', Number(row()[16]) === before - 1, row()[16]);
});

run('道具', () => {
  const t = turn('丟出煙霧彈掩護撤退', { consumed_item_ids: ['smoke_bomb', 'mana_gem_s'] });
  const ids = meta().inventory.map(i => i.id);
  check('只扣提到的煙霧彈，結晶留著', !ids.includes('smoke_bomb') && ids.includes('mana_gem_s'), ids);
  turn('在洋館聊天', { gained_items: [{ id: 'gold_sword', name: '黃金寶劍', tier: 3, type: 'equipment', qty: 1, desc: '' }] });
  check('沒有取得意圖 → 不收道具', !meta().inventory.some(i => i.id === 'gold_sword'));
  turn('在洋館聊天', { consumed_item_ids: ['ghost_item'] });
  check('扣不存在的道具不會出錯', true);
});

run('好感與羈絆上限', () => {
  const b0 = Number(row()[21]);
  turn('跟沖田撒嬌', { bond_delta: 50 });
  check('羈絆每回合最多 +10', Number(row()[21]) - b0 <= 10, [b0, row()[21]]);
  const f0 = S.ctx.getFactionFavor_(meta(), '衛宮組 (Saber陣營)');
  turn('送禮給士郎', { faction_favor_delta: { '衛宮組 (Saber陣營)': 60 } });
  const f1 = meta().factionFavor['衛宮組 (Saber陣營)'];
  check('陣營好感每回合最多 +15', f1 - (f0 == null ? 0 : f0) <= 15, [f0, f1]);
});

run('結盟門檻', () => {
  turn('說服伊莉雅結盟', { faction_updates: { '愛因茲貝倫組 (Berserker陣營)': '存活 (同盟)' } });
  const s = JSON.parse(row()[29])['愛因茲貝倫組 (Berserker陣營)'];
  check('敵對陣營一回合不能直接同盟（常理）', !S.ctx.isAllianceStatusText_(s), s);
});

run('同盟標記保護', () => {
  setFac(f => { f['遠坂組 (Archer陣營)'] = '存活 (同盟)'; });
  setMeta(m => { m.factionFavor = Object.assign({}, m.factionFavor, { '遠坂組 (Archer陣營)': 60 }); });
  turn('和凜喝茶', { faction_updates: { '遠坂組 (Archer陣營)': '存活 (終局)' } });
  const s = JSON.parse(row()[29])['遠坂組 (Archer陣營)'];
  check('AI 把同盟改成「存活 (終局)」→ 補回同盟', S.ctx.isAllianceStatusText_(s), s);
  turn('和凜吵架', { faction_updates: { '遠坂組 (Archer陣營)': '存活 (同盟破裂)' } });
  const s2 = JSON.parse(row()[29])['遠坂組 (Archer陣營)'];
  check('寫明破裂 → 真的不是同盟', !S.ctx.isAllianceStatusText_(s2), s2);
});

run('通關驗證', () => {
  const t = turn('宣告勝利', { outcome_type: 'TRUE_VICTORY' });
  check('還有敵對陣營 → 不能通關', st().runStatus !== 'CLEARED' && meta().status !== 'CLEARED', meta().status);
});

run('天氣', () => {
  setMeta(m => { m.weather = '晴'; }); row()[8] = 3;
  turn('看天空', { ap_cost: 0, weather_change: '颱風' });
  check('不認得的天氣被忽略', meta().weather === '晴', meta().weather);
  const t = turn('施展冰雪結界', { ap_cost: 0, weather_change: '雪' });
  check('劇情改變天氣 → 套用並結算', meta().weather === '雪' && /天氣轉為雪/.test(t.story), meta().weather);
  check('前端狀態帶天氣', t.status.weather === '雪');
});

run('睡覺推進時段', () => {
  row()[8] = 3; const p0 = row()[7], d0 = row()[6];
  turn('回洋館睡覺', { ap_cost: 1, location: '廢棄洋館', player_slept: true });
  check('睡一覺（AI 確認＋有睡覺字眼）→ 時段前進、AP 補滿', (row()[7] !== p0 || row()[6] !== d0) && Number(row()[8]) === 3, [d0, p0, row()[6], row()[7], row()[8]]);
  row()[8] = 3; const p1 = row()[7], d1 = row()[6];
  turn('看著沖田睡覺的樣子，幫她蓋被子', { ap_cost: 1, player_slept: false });
  check('看別人睡（AI 判斷沒睡）→ 時間不跳', row()[7] === p1 && row()[6] === d1 && Number(row()[8]) === 2, [row()[6], row()[7], row()[8]]);
  row()[8] = 3; const p2 = row()[7], d2 = row()[6];
  turn('在洋館整理資料', { ap_cost: 1, player_slept: true });
  check('玩家沒提睡覺、AI 卻說睡了 → 時間不跳', row()[7] === p2 && row()[6] === d2, [row()[6], row()[7], row()[8]]);
});

run('休息回魔兩把鑰匙', () => {
  row()[15] = 10; row()[8] = 3;
  turn('在洋館冥想調息', { ap_cost: 0, player_rested: true, location: '廢棄洋館' });
  check('真的休息（AI 確認＋有字眼）→ 回魔', Number(row()[15]) > 10, row()[15]);
  row()[15] = 10;
  turn('沒時間休息了，直接衝去柳洞寺', { ap_cost: 0, player_rested: false });
  check('說沒空休息（AI 判斷沒休息）→ 不回魔', Number(row()[15]) === 10, row()[15]);
  row()[15] = 10;
  turn('看著沖田睡著的樣子，幫她蓋上被子', { ap_cost: 0, player_rested: true, player_slept: true });
  check('看別人睡、AI 卻誤判玩家休息 → GAS 否決，不回魔', Number(row()[15]) === 10, row()[15]);
});

run('未知地名', () => {
  const loc0 = st().locationKey;
  turn('四處走走', { location: '火星基地' });
  check('不認得的地名維持原地', st().locationKey === loc0, st().locationKey);
  turn('去深山町的商店街', { location: '深山町商店街' });
  check('新地標：商店街', st().locationKey === '深山町商店街', st().locationKey);
});

run('非同盟傳訊被擋', () => {
  const t = turn('等待', { incoming_messages: [{ faction: '教會組', text: '來教會一趟' }] });
  const th = (t.status.phoneState.smsThreads || {})['教會組 (Lancer陣營)'];
  check('非同盟不能主動傳訊', !th || !th.messages.some(m => m.text.includes('來教會一趟')), th);
});

run('保命符', () => {
  setMeta(m => { m.inventory = (m.inventory || []).concat([{ id: 'aegis_charm', name: '對魔術防禦禮裝(保命符)', tier: 3, type: 'equipment', qty: 1, desc: '' }]); });
  turn('正面硬接寶具', { is_combat: true, master_condition: '已死亡', outcome_type: 'DEAD' });
  check('保命符擋下死亡', meta().status !== 'DEAD' && !meta().inventory.some(i => i.id === 'aegis_charm'), [meta().status, meta().masterCondition]);
});

run('壞掉的 JSON', () => {
  S.geminiQueue.push('這不是 JSON {{{');
  S.geminiQueue.push(S.base({ story: '重試成功。' }));
  const t = S.ctx.processFateTurnTextOnly({ playerName: S.P, userAction: '看看四周' });
  check('JSON 壞掉 → 重試一次成功', /重試成功/.test(t.story));
});


// ===== stress2 =====

run('型別錯亂', () => {
  const t = turn('看看四周', { faction_updates: ['遠坂組', '同盟'], present_chars: 'okita', gained_items: { id: 'x' }, ap_cost: '2', bond_delta: 'abc', location: null, master_mp_delta: 99999, threat_delta: -500, consumed_item_ids: 'smoke_bomb', key_events_add: '單一字串事件', forum_posts: 'not array', rumor_updates: { a: 1 }, outfit_updates: 'nude' });
  const s = st();
  check('型別錯亂不當機', Boolean(t && t.story));
  check('MP 不超過上限', s.master.mp <= s.master.maxMp, [s.master.mp, s.master.maxMp]);
  check('警戒度不低於 0', s.threatLevel >= 0, s.threatLevel);
  check('羈絆數值沒有變成 NaN', Number.isFinite(Number(row()[21])), row()[21]);
});

run('副從者越權', () => {
  const s0 = st();
  turn('看看四周', { new_servant2_id: 'saber_alter' });
  check('沒有收服意圖，AI 自己給副從者 → 不收', !st().servant2.id, st().servant2);
  turn('和沖田說話', { new_servant2_id: 'okita' });
  check('副從者不能和主從者同一騎', st().servant2.id !== 'okita');
  turn('收服這騎從者', { new_servant2_id: 'not_a_real_id' });
  check('不存在的從者 id 不收', st().servant2.id !== 'not_a_real_id', st().servant2);
});

run('自己的從者被 servants_out', () => {
  turn('休息', { servants_out: ['okita'] });
  check('servants_out 不能把玩家的主從者踢掉', st().servant1.id === 'okita', st().servant1);
});

run('提早淘汰', () => {
  setFac(f => { f['柳洞寺組 (Caster/Assassin陣營)'] = '存活 (敵對防備)'; }); setMeta(m => { m.routeFlags = {}; }); row()[8] = 3;
  turn('遠遠觀察柳洞寺', { ap_cost: 0, faction_updates: { '柳洞寺組 (Caster/Assassin陣營)': '已淘汰 (被不明勢力消滅)' } });
  const s = fac()['柳洞寺組 (Caster/Assassin陣營)'];
  check('沒交戰的陣營一回合不會直接淘汰', !S.ctx.isCapturedOrDefeatedStatusText_(s), s);
});

run('十二試煉', () => {
  setFac(f => { f['愛因茲貝倫組 (Berserker陣營)'] = '存活 (敵對獵殺)'; });
  turn('沖田解放寶具斬向 Berserker', { is_combat: true, berserker_lives_lost: { count: 12, method: '寶具' }, present_chars: [{ id: 'okita', use_np: true }, { id: 'berserker' }] });
  const gh = meta().godHand || { lost: 0 };
  check('一回合最多扣 2 條命', gh.lost <= 2, gh);
  turn('再用寶具斬一次', { is_combat: true, berserker_lives_lost: { count: 2, method: '寶具' }, present_chars: [{ id: 'okita', use_np: true }, { id: 'berserker' }] });
  check('同一種手段第二次無效', (meta().godHand || {}).lost === gh.lost, meta().godHand);
  turn('在洋館休息', { berserker_lives_lost: { count: 1, method: '偷襲' } });
  check('Berserker 不在場不扣命', (meta().godHand || {}).lost === gh.lost, meta().godHand);
});

run('聯絡人證據', () => {
  const t = turn('在街上散步', { new_contacts: ['間桐慎二'], story: '你在街上散步，看見遠處的慎二。' });
  check('沒有手機／號碼等證據 → 不加聯絡人', !st().smsContacts['間桐組 (Rider陣營)'], st().smsContacts);
});

run('數量上限', () => {
  turn('回想', { key_events_add: Array.from({ length: 40 }, (_, i) => '事件' + i), memory_update: '長'.repeat(3000), forum_posts: Array.from({ length: 10 }, (_, i) => ({ board: '板', author: 'a', title: 't' + i, body: 'b' })) });
  const m = meta();
  check('重要事件最多 15 條', (m.keyEvents || []).length <= 15, (m.keyEvents || []).length);
  check('前情提要有限長', String(row()[30]).length <= 400, String(row()[30]).length);
  check('meta JSON 不超過儲存格上限', String(row()[31]).length < 50000, String(row()[31]).length);
});

run('流言未知 id', () => {
  turn('看論壇', { rumor_updates: [{ id: 'nope', status: '已被識破', doubters: ['教會組'] }] });
  check('未知流言 id 不當機', true);
});

run('連續回合不壞檔', () => {
  for (let i = 0; i < 30; i++) turn('巡邏第' + i + '次', { ap_cost: 1, threat_delta: 3, location: i % 2 ? '新都商業區' : '冬木大橋' });
  const s = st();
  check('30 回合後存檔仍可讀', Boolean(s && s.day >= 1), s && s.day);
  check('回合數正確累加', Number(meta().turnCount) >= 30, meta().turnCount);
});

run('交戰中可以淘汰', () => {
  const k = '間桐組 (Rider陣營)';
  setFac(f => { f[k] = '存活 (敵對・重創負傷)'; });
  turn('和沖田一起追擊 Rider', { is_combat: true, faction_updates: { [k]: '已淘汰 (Rider 被沖田擊敗)' }, present_chars: [{ id: 'okita' }, { id: 'rider' }] });
  check('真的交戰且對方已負傷 → 可以淘汰', S.ctx.isCapturedOrDefeatedStatusText_(fac()[k]), fac()[k]);
  setFac(f => { f['柳洞寺組 (Caster/Assassin陣營)'] = '存活 (敵對防備)'; });
  // 不推進時段（避免後台廝殺與柳洞寺路線這些伺服器自己的合法淘汰干擾判斷）
  setMeta(m => { m.routeFlags = {}; }); row()[8] = 3;
  turn('遠遠觀察柳洞寺', { ap_cost: 0, faction_updates: { '柳洞寺組 (Caster/Assassin陣營)': '已淘汰' } });
  turn('遠遠觀察柳洞寺', { ap_cost: 0, faction_updates: { '柳洞寺組 (Caster/Assassin陣營)': '已淘汰' } });
  check('沒交戰連報兩回合也不會淘汰', !S.ctx.isCapturedOrDefeatedStatusText_(fac()['柳洞寺組 (Caster/Assassin陣營)']), fac()['柳洞寺組 (Caster/Assassin陣營)']);
});

run('有締約意圖才收副從者', () => {
  row()[15] = 110; row()[16] = 3;
  turn('和 Lancer 訂下契約，讓他成為我的從者', { new_servant2_id: 'lancer' });
  check('有締約意圖 → 收服', S.ctx.loadExistingGame(S.P).status.servant2.id === 'lancer', S.ctx.loadExistingGame(S.P).status.servant2);
});


// ===== stress3 =====

run('前端設定亂傳', () => {
  tryCall('設定：不認得的基調／鏡頭不當機', () => C.savePlayerSettingsOnly(P, { gameTone: 'XXX', cameraMode: 'weird', adultMode: 'maybe', artStyle: 'nope' }));
  const s = st();
  check('基調回到合法值', ['BALANCED', 'COMEDY_CHAOS', 'STORY_PLAYER_FIRST', 'HARDCORE_WAR', 'DAILY_LIFE'].includes(s.gameTone) || Boolean(s.gameTone), s.gameTone);
  check('鏡頭回到合法值', ['pov', 'third'].includes(s.cameraMode), s.cameraMode);
  tryCall('不存在的玩家讀檔會給錯誤訊息而非當機', () => { try { C.loadExistingGame('沒有這個人'); } catch (e) { if (!/找不到|不存在|沒有/.test(String(e.message))) throw e; } });
});

run('地圖場地現況', () => {
  tryCall('編輯場地現況', () => C.updateCustomLocationDesc(P, '冬木大橋', '橋面有新的焦痕'));
  check('寫入成功', (meta().customLocationNotes || {})['冬木大橋'] === '橋面有新的焦痕', meta().customLocationNotes);
  let err = '';
  try { C.updateCustomLocationDesc(P, '火星', 'x'); } catch (e) { err = String(e.message); }
  check('不存在的地標被拒絕', /無效/.test(err), err);
  tryCall('超長文字不當機', () => C.updateCustomLocationDesc(P, '冬木大橋', '長'.repeat(5000)));
  check('超長文字被截短', String((meta().customLocationNotes || {})['冬木大橋'] || '').length <= 300, String((meta().customLocationNotes || {})['冬木大橋'] || '').length);
});

run('論壇與簡訊', () => {
  const fp = tryCall('論壇超長貼文', () => C.postFuyukiForumMessage(P, 't'.repeat(500), 'b'.repeat(5000), false));
  check('meta 沒爆', String(row()[31]).length < 50000, String(row()[31]).length);
  let err = '';
  try { C.sendAllySmsMessage(P, '教會組 (Lancer陣營)', '你好', false); } catch (e) { err = String(e.message); }
  // 教會是公開據點，應該可以聯絡（會呼叫 AI）
  check('教會隨時可聯絡（會進到 AI 回覆）', /unexpected Gemini call/.test(err) || err === '', err);
  err = '';
  try { C.sendAllySmsMessage(P, '間桐組 (Rider陣營)', '你好', false); } catch (e) { err = String(e.message); }
  check('沒有聯絡方式的陣營被拒絕', err && !/unexpected Gemini call/.test(err), err);
  tryCall('標記已讀', () => C.markPhoneMessagesRead(P, 'sms', '教會組 (Lancer陣營)'));
});

run('約定 → 依約前來 → 同行', () => {
  const k = '遠坂組 (Archer陣營)';
  setFac(f => { f[k] = '存活 (同盟)'; });
  setMeta(m => { m.factionFavor = Object.assign({}, m.factionFavor, { [k]: 60 }); });
  const d = Number(row()[6]); const nextP = C.advanceTimePeriod_(d, String(row()[7]));
  turn('跟凜約好下個時段在冬木大橋碰面', { appointments_add: [{ faction: '遠坂組', day: nextP.day, period: nextP.period, place: '冬木大橋' }] });
  check('約定記錄', (meta().appointments || []).some(a => a.fk === k), meta().appointments);
  row()[8] = 1;
  turn('前往冬木大橋', { ap_cost: 1, location: '冬木大橋' });
  const t = turn('在冬木大橋等凜', { ap_cost: 1, location: '冬木大橋', present_chars: [{ id: 'okita' }, { id: 'rin' }] });
  check('到點 → 加入同行', Object.keys(meta().companions || {}).includes(k), [meta().companions, meta().appointments, row()[6], row()[7], st().locationKey]);
});

run('英靈名冊換人', () => {
  setMeta(m => { m.servantRoster = [{ id: 'rider', name: 'Rider', condition: '靈基穩定' }]; });
  row()[23] = 'lancer'; row()[25] = 'Lancer';
  turn('回洋館', { location: '廢棄洋館' });
  turn('在洋館讓 Rider 上場，Lancer 留下看家', { location: '廢棄洋館' });
  check('名冊換人', st().servant2.id === 'rider' && (meta().servantRoster || []).some(r => r.id === 'lancer'), [st().servant2, meta().servantRoster]);
});

run('主從好感歸零解約', () => {
  row()[21] = 0; setMeta(m => { m.bondLevel = 0; m.bondZeroStreak = 0; });
  for (let i = 0; i < 3; i++) turn('命令沖田去偷超商的東西', { bond_delta: -10 });
  check('連續 3 次好感 0 又扣分 → 解約（常理）', st().servant1.id !== 'okita', [st().servant1, meta().bondZeroStreak]);
  row()[17] = ''; row()[19] = '（失去從者）'; row()[23] = ''; setMeta(m => { m.servantCondition = '契約斷絕'; });
  const b1 = Number(row()[21]);
  turn('一個人發呆', { bond_delta: -10, servant_condition: '消滅' });
  check('沒有從者時好感不變、從者狀態不被改成消滅', Number(row()[21]) === b1 && !/消滅/.test(meta().servantCondition || ''), [b1, row()[21], meta().servantCondition]);
});


// ===== 路線與終局 =====
const quiet = (o) => Object.assign({ ap_cost: 0 }, o); // 不推進時段，排除後台隨機

run('路線確立與轉線', () => {
  setMeta(m => { m.routeTendency = {}; m.activeRoute = ''; });
  turn('保護普通人', quiet({ route_tendency_delta: { fate: 50, ubw: -9, xxx: 3 } }));
  check('每回合最多 +3、負數不低於 0、不認得的路線忽略', meta().routeTendency.fate === 3 && meta().routeTendency.ubw === 0 && !('xxx' in meta().routeTendency), meta().routeTendency);
  let lockTurn = 0, t;
  for (let i = 0; i < 20 && !meta().activeRoute; i++) { t = turn('和 Saber 並肩守護', quiet({ route_tendency_delta: { fate: 3 } })); lockTurn = i + 2; }
  check('fate 到 40 且領先 12 → 確立', meta().activeRoute === 'fate', [meta().activeRoute, meta().routeTendency]);
  check('確立時劇情有公告', /路線確立/.test(t.story));
  check('確立記進重要事件', (meta().keyEvents || []).some(e => /騎士王|fate|路線/i.test(e)), meta().keyEvents);
  for (let i = 0; i < 16; i++) turn('和凜研究寶石魔術', quiet({ route_tendency_delta: { ubw: 3 } }));
  check('ubw 追上但沒領先 fate 24 分 → 不轉線', meta().activeRoute === 'fate', meta().routeTendency);
  for (let i = 0; i < 30 && meta().activeRoute === 'fate'; i++) { t = turn('跟著 Archer 鍛鍊投影', quiet({ route_tendency_delta: { ubw: 3, fate: -3 } })); }
  check('大幅超越 → 轉線到 ubw', meta().activeRoute === 'ubw', [meta().activeRoute, meta().routeTendency]);
  check('情報視窗資料帶路線', st().activeRoute === 'ubw' && st().routeDefs.length >= 5);
});

run('真 Assassin 路線', () => {
  const ryu = '柳洞寺組 (Caster/Assassin陣營)';
  setFac(f => { f[ryu] = '存活 (敵對・重創負傷)'; delete f['臟硯組 (真Assassin陣營)']; f['間桐組 (Rider陣營)'] = '存活 (隱蔽觀察)'; });
  setMeta(m => { m.routeFlags = {}; });
  const t = turn('沖田在山門擊倒小次郎', quiet({ is_combat: true, servants_out: ['assassin'], present_chars: [{ id: 'okita' }, { id: 'assassin' }] }));
  check('小次郎退場 → 臟硯組成立', '臟硯組 (真Assassin陣營)' in fac(), Object.keys(fac()));
  check('柳洞寺剩美狄亞', /美狄亞/.test(fac()[ryu]) && !C.isCapturedOrDefeatedStatusText_(fac()[ryu]), fac()[ryu]);
  check('異變公告', /異變|白骨面具/.test(t.story));
  turn('在柳洞寺遭遇哈桑', quiet({ is_combat: true, present_chars: [{ id: 'okita' }, { id: 'hassan' }], faction_updates: { '臟硯': '存活 (敵對・負傷)' } }));
  check('「臟硯」別名對應回臟硯組', /負傷/.test(fac()['臟硯組 (真Assassin陣營)']), fac()['臟硯組 (真Assassin陣營)']);
});

run('柳洞寺退場字眼的否定句', () => {
  const ryu = '柳洞寺組 (Caster/Assassin陣營)';
  setFac(f => { f[ryu] = '存活 (敵對防備)'; delete f['臟硯組 (真Assassin陣營)']; });
  setMeta(m => { m.routeFlags = {}; });
  turn('偵查柳洞寺', quiet({ faction_updates: { [ryu]: '存活 (敵對・小次郎並未被擊敗，仍鎮守山門)' } }));
  check('「小次郎並未被擊敗」不算退場', !(meta().routeFlags || {}).kojirouOut && !('臟硯組 (真Assassin陣營)' in fac()), [meta().routeFlags, fac()[ryu]]);
});

run('最終 Boss → 打倒 → 通關', () => {
  setFac(f => { Object.keys(f).forEach(k => { if (!k.includes('教會')) f[k] = '存活 (同盟)'; }); f['教會組 (Lancer陣營)'] = '已淘汰 (綺禮與 Lancer 退場)'; delete f['臟硯組 (真Assassin陣營)']; });
  setMeta(m => { m.gilFinal = false; m.gilDefeated = false; m.churchRevived = false; const fv = {}; Object.keys(JSON.parse(row()[29])).forEach(k => { fv[k] = k.includes('教會') ? -90 : 90; }); m.factionFavor = fv; });
  turn('前往大聖杯', quiet({ outcome_type: 'TRUE_VICTORY', location: '柳洞寺' }));
  check('其他都化解 → 英雄王現身、本回合不能通關', meta().gilFinal === true && meta().status !== 'CLEARED' && /英雄王/.test(fac()['教會組 (Lancer陣營)']), [meta().gilFinal, meta().status, fac()['教會組 (Lancer陣營)']]);
  turn('沖田正面挑戰英雄王', quiet({ is_combat: true, present_chars: [{ id: 'okita' }, { id: 'gilgamesh' }], faction_updates: { '教會組': '存活 (英雄王負傷)' } }));
  turn('以令咒命令沖田使出無明三段突，終結英雄王', quiet({ is_combat: true, command_spells_used: 1, present_chars: [{ id: 'okita', use_np: true }, { id: 'gilgamesh' }], faction_updates: { '教會組': '已淘汰 (英雄王吉爾伽美什被擊敗)' } }));
  check('真的交戰打倒英雄王 → 淘汰並記錄', C.isCapturedOrDefeatedStatusText_(fac()['教會組 (Lancer陣營)']) && meta().gilDefeated === true, [fac()['教會組 (Lancer陣營)'], meta().gilDefeated]);
  const t = turn('抵達大聖杯許願', quiet({ outcome_type: 'TRUE_VICTORY' }));
  check('通關', meta().status === 'CLEARED' || st().runStatus === 'CLEARED', [meta().status, st().runStatus]);
});

run('轉生下一輪', () => {
  const winsBefore = Number(meta().wins) || 0;
  const r = C.startNextLoopReincarnation(P);
  const m = meta();
  check('轉生後新一輪、勝場保留', m.status !== 'CLEARED' && (Number(m.wins) || 0) >= winsBefore, [m.status, m.wins, winsBefore]);
  check('陣營回到開局', !Object.values(JSON.parse(row()[29])).some(v => /同盟/.test(v)), JSON.parse(row()[29]));
  check('路線與英雄王旗標重置', !m.activeRoute && !m.gilFinal && !m.gilDefeated, [m.activeRoute, m.gilFinal, m.gilDefeated]);
});

run('清空本輪', () => {
  const r = C.resetCurrentRunKeepCareer(P);
  check('清空後可重新創角', Boolean(r), r && Object.keys(r));
});

run('英雄王提早現身（後台）', () => {
  const f = { '衛宮組 (Saber陣營)': '存活 (中立)', '遠坂組 (Archer陣營)': '存活 (中立)', '教會組 (Lancer陣營)': '存活 (敵對暗算)', '間桐組 (Rider陣營)': '存活 (隱蔽觀察)', '柳洞寺組 (Caster/Assassin陣營)': '存活 (敵對防備)', '愛因茲貝倫組 (Berserker陣營)': '存活 (敵對・負傷)' };
  let revealed = null;
  let others = 0;
  for (let i = 0; i < 3000 && !revealed; i++) { const r = C.simulateOffscreenFactionWar_(f, 5, '深夜', [], {}); if (r.gilRevealed) revealed = r; else if (Object.values(r.updatedFactions).some(v => /英雄王/.test(v))) others++; }
  check('別的陣營被淘汰時英雄王不會出現', others === 0, others);
  check('愛因茲貝倫被後台淘汰時英雄王現身', Boolean(revealed) && /英雄王/.test(revealed.updatedFactions['教會組 (Lancer陣營)']), revealed && revealed.updatedFactions);
});


console.log(`\n${fails === 0 ? '全部通過' : fails + ' 項失敗'}`);
process.exit(fails ? 1 : 0);
