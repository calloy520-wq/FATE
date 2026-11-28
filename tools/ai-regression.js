// 真實 AI 回歸測試：用真的 Gemini（OpenRouter）＋假試算表跑固定情境，確認 AI 行為沒變（例如模型更新後）。
// 自動測試（tests/）用的是假 Gemini，抓不到「模型脾氣變了」；這個要花一點錢（一次約 0.03 美金），大改或懷疑模型更新時再跑。
// 執行：node tools/ai-regression.js        （需要能連到 openrouter.ai；金鑰放環境變數 OPENROUTER_API_KEY，雲端環境由代理自動帶入）
// 不會生圖、不會碰正式試算表。tools/ 不在 .claspignore 白名單，不會被推上 GAS。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');
const os = require('os');
const REPO = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fate-ai-'));

function makeSheet(name) {
  const data = [];
  const ensure = (r, c) => { while (data.length < r) data.push([]); while (data[r - 1].length < c) data[r - 1].push(''); };
  const chain = { setBackground: () => chain, setFontColor: () => chain, setFontWeight: () => chain };
  const range = (r, c, nr, nc) => ({
    getValues: () => Array.from({ length: nr || 1 }, (_, i) => Array.from({ length: nc || 1 }, (_, j) => (data[r - 1 + i] || [])[c - 1 + j] ?? '')),
    getValue: () => (data[r - 1] || [])[c - 1] ?? '',
    setValues: v => { v.forEach((row, i) => row.forEach((x, j) => { ensure(r + i, c + j); data[r - 1 + i][c - 1 + j] = x; })); return chain; },
    setValue: v => { ensure(r, c); data[r - 1][c - 1] = v; }
  });
  return { name, data, getName: () => name, getLastRow: () => data.length, getLastColumn: () => Math.max(1, ...data.map(r => r.length)),
    getDataRange: () => range(1, 1, data.length, 40), getRange: range, appendRow: row => data.push(row.slice()), deleteRow: r => data.splice(r - 1, 1), setFrozenRows() {} };
}
const sheets = {};
const mockSS = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet(n)), getName: () => 'mock' };
const USAGE = { calls: 0, cost: 0 };
let lastAiJson = null;
const cache = {};
const ctx = {
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => mockSS, flush: () => {} },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }), getUserLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; }, removeAll: ks => ks.forEach(k => delete cache[k]) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'OAPIKEY' ? 'x' : null), setProperty() {} }) },
  Utilities: { formatDate: () => '2026-11-28 12:00:00', sleep() {} },
  UrlFetchApp: {
    fetch: (url, opt) => {
      if (!/openrouter/.test(url)) throw new Error('blocked: ' + url);
      const pf = path.join(TMP, 'req.json'); const of = path.join(TMP, 'resp.json');
      fs.writeFileSync(pf, opt.payload);
      const code = cp.execFileSync('curl', ['-sS', '-m', '120', '-o', of, '-w', '%{http_code}', '-X', 'POST', url, '-H', 'Content-Type: application/json',
        '-H', 'Authorization: Bearer ' + (process.env.OPENROUTER_API_KEY || 'proxy-injected'), '--data-binary', '@' + pf]).toString().trim();
      const txt = fs.readFileSync(of, 'utf8');
      try { const j = JSON.parse(txt); USAGE.calls++; USAGE.cost += Number((j.usage || {}).cost) || 0; lastAiJson = JSON.parse(String(j.choices[0].message.content).replace(/^```(json)?|```$/g, '')); } catch (e) {}
      return { getResponseCode: () => Number(code), getContentText: () => txt };
    }
  }
};
vm.createContext(ctx);
vm.runInContext(['GameData.js', 'Lore.js', 'Code.js', 'SetupDB.js'].map(f => fs.readFileSync(path.join(REPO, f), 'utf8')).join('\n;\n'), ctx);
ctx.initFateDatabase();

let fails = 0;
const results = [];
const check = (name, ok, note) => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${note ? '｜' + note : ''}`); if (!ok) fails++; console.log(results[results.length - 1]); };
const clip = t => String(t || '').replace(/\s+/g, ' ').slice(0, 70);
let turnNo = 0;
const turn = (name, act) => {
  const res = ctx.processFateTurnTextOnly({ playerName: name, userAction: act });
  fs.writeFileSync(path.join(TMP, `turn${String(++turnNo).padStart(2, '0')}.txt`), `【行動】${act}\n\n${res.story}${res.tigerDojoTip ? '\n\n🐯 ' + res.tigerDojoTip : ''}`);
  return res;
};
const create = (name, tone, mode) => {
  ctx.startNewGame(name);
  return ctx.completeCreationAndSummon({ playerName: name, servantId: 'scathach', masterOrigin: '時鐘塔叛逃魔術師', masterGender: 'girl', masterWish: '想看看聖杯是什麼', gameTone: tone, masterCoreTags: '1girl, black hair', masterOutfitTags: 'coat' });
};

// ===== 聖杯戰爭（常理）=====
const W = '回歸測';
create(W, 'BALANCED');
let r = turn(W, '掏出手槍對準教會的方向開一槍');
// 寫法很多（摸了個空、只碰到大衣布料…），所以只檢查「槍有沒有真的開火」
check('物品檢查：背包沒有手槍 → 槍不會憑空出現開火', !/槍聲|槍響|子彈.{0,4}(射出|飛出|擊中|呼嘯)|扣下扳機|砰[！!]/.test(r.story), clip(r.story));
r = turn(W, '去柳洞寺山門，要求柳洞寺組立刻跟我結成同盟');
const ryuu = Object.keys(r.status.factions).find(k => k.includes('柳洞寺'));
check('結盟門檻：敵對陣營一回合內不會直接結盟', !ctx.isAllianceStatusText_(r.status.factions[ryuu]), String(r.status.factions[ryuu]));
r = turn(W, '從冬木大橋跳下去游泳');
check('意圖判斷：跳下水沒說想死 → 不會死', r.status.runStatus === 'ACTIVE' && r.outcomeType !== 'FATAL_DEATH', clip(r.story));
const tBefore = `${r.status.day}${r.status.timePeriod}`;
r = turn(W, '回洋館睡覺');
check('睡覺：時間前進、AI 也回報睡著', `${r.status.day}${r.status.timePeriod}` !== tBefore && lastAiJson && lastAiJson.player_slept === true, `${tBefore} → ${r.status.day}${r.status.timePeriod}`);
r = turn(W, '我不想活了，從冬木大橋跳下去自殺');
// 有求死意圖「才可能」死，不是一定要死：從者及時攔下也合理；只要不是把求死當成游泳、散步之類完全忽略就算過
const dead = r.outcomeType === 'FATAL_DEATH' || r.status.runStatus === 'DEAD';
check('明確求死 → 死亡結局，或劇情正面處理（被攔下、救起）', dead || /攔|拉住|抓住|阻止|救|接住|撈|拽|拖回|按住/.test(r.story), dead ? `死亡｜${clip(r.tigerDojoTip)}` : `沒死｜${clip(r.story)}`);

// ===== 自由沙盒（常理）=====
const S = '回歸測・沙盒';
create(S, 'BALANCED');
r = turn(S, '去冬木大橋看夕陽');
check('時間檢查：清晨說看夕陽 → 照清晨寫', !/夕陽西下|太陽.{0,4}(西沉|下山)|落日餘暉|染成.{0,4}(橘|紅)/.test(r.story) || /還沒|尚未|清晨|早晨|晨光|離.{0,4}(傍晚|黃昏)/.test(r.story), clip(r.story));
ctx.setSandboxParty(S, ['rin']);
r = turn(S, '和凜去深山町商店街買菜');
check('沙盒：不寫聖杯戰爭、同行的凜有出場', !/聖杯戰爭|陣營|偵查|開戰|使魔窺探/.test(r.story) && /凜/.test(r.story) && r.imagePayload.characters.some(c => c.id === 'rin'), clip(r.story));

console.log(`\n每回合劇情存在 ${TMP}`);
console.log(`${fails === 0 ? '全部通過' : fails + ' 項失敗'}｜呼叫 ${USAGE.calls} 次，約 ${USAGE.cost.toFixed(4)} 美金`);
process.exit(fails ? 1 : 0);
