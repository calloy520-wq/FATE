// 本機／CI 測試：在 Node 中載入 Code.js，測試不需要 Google 服務的純邏輯函式
// 執行：node tests/run-tests.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// GAS 會把所有 .js 檔放在同一個全域空間，這裡照同樣順序載入
const src = ['GameData.js', 'Lore.js', 'Code.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src + `
;this.T = { updateRyuudouRoute_, resolveFactionKey_, matchFuyukiLocation_, applyInventoryChanges_,
  computeDynamicLocationInfo_, FUYUKI_LOCATIONS_, isCapturedOrDefeatedStatusText_, syncCapturedServantFaction_,
  areAllRivalFactionsResolved_, updateKeyEvents_, normalizeCharCoreForNai_, stripCountTags_, excerptForDirector_,
  formatCharacterOutfitPrompt_, isNudeOutfitTags_, autoAdaptSmartOutfit_, parseJsonLoose_, advanceTimePeriod_ };`, ctx);
const T = ctx.T;

let ok = 0, bad = 0;
function eq(name, got, want) {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (pass) ok++; else bad++;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${pass ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const Z = '臟硯組 (真Assassin陣營)';
const R = '柳洞寺組 (Caster/Assassin陣營)';
const M = '間桐組 (Rider陣營)';
const base = () => ({
  '衛宮組 (Saber陣營)': '存活 (中立警戒)', '遠坂組 (Archer陣營)': '存活', '教會組 (Lancer陣營)': '存活',
  [M]: '存活 (隱蔽觀察)', [R]: '存活 (敵對防備)', '愛因茲貝倫組 (Berserker陣營)': '存活'
});
const route = (meta, f, out, cap, present) => T.updateRyuudouRoute_(meta, f, out || [], cap || '', new Set(present || []));

// ---- 真Assassin 路線 ----
let m = {}, r, f;
r = route(m, base());
eq('沒人退場不觸發', Z in r.factions, false);

m = {}; r = route(m, base(), ['caster']);
eq('美狄亞退場 → 觸發臟硯組', Z in r.factions, true);
eq('旗標', m.routeFlags, { medeaOut: true, kojirouOut: true, trueAssassin: 'ACTIVE' });
eq('兩騎皆退場 → 柳洞寺組結束', T.isCapturedOrDefeatedStatusText_(r.factions[R]), true);
eq('有異變風聲', r.report.length > 0, true);

m = {}; r = route(m, base(), ['assassin']);
eq('只有小次郎退場 → 美狄亞仍在', T.isCapturedOrDefeatedStatusText_(r.factions[R]), false);
eq('只有小次郎退場 → 也觸發', Z in r.factions, true);

m = {}; f = base(); f[M] = '已淘汰'; r = route(m, f, ['caster']);
eq('間桐已覆滅 → 不觸發', Z in r.factions, false);

m = {}; f = base(); f[R] = '存活・美狄亞已被擊敗，小次郎仍鎮守山門'; r = route(m, f);
eq('從劇情文字判斷美狄亞退場', m.routeFlags.medeaOut && (Z in r.factions), true);

m = {}; f = base(); f[R] = '已淘汰 (後台廝殺)'; r = route(m, f);
eq('後台淘汰柳洞寺 → 觸發', Z in r.factions, true);
const m2 = { routeFlags: m.routeFlags };
eq('不會重複觸發', route(m2, r.factions).report, '');
route(m2, r.factions, ['hassan']);
eq('哈桑退場 → DEFEATED', m2.routeFlags.trueAssassin, 'DEFEATED');

m = {}; r = route(m, base(), [], 'caster');
eq('收服美狄亞（間桐仍在）→ 哈桑取代小次郎', Z in r.factions, true);
eq('收服美狄亞（間桐仍在）→ 柳洞寺組結束', T.isCapturedOrDefeatedStatusText_(r.factions[R]), true);
m = {}; f = base(); f[M] = '已淘汰'; r = route(m, f, [], 'caster');
eq('收服美狄亞（間桐已滅）→ 小次郎仍守山門', T.isCapturedOrDefeatedStatusText_(r.factions[R]), false);
eq('一般收服邏輯略過柳洞寺兩騎', T.syncCapturedServantFaction_(base(), 'assassin', '')[R], base()[R]);

f = base(); Object.keys(f).forEach(k => { f[k] = '已淘汰'; }); f[Z] = '存活 (潛伏暗殺)';
eq('臟硯組未解決 → 不能全破', T.areAllRivalFactionsResolved_(f), false);
f = base(); f[Z] = '存活 (潛伏暗殺)';
eq('柳洞寺危險度顯示哈桑', T.computeDynamicLocationInfo_('柳洞寺', T.FUYUKI_LOCATIONS_['柳洞寺'], f, '', 'WAR', {}).danger.includes('咒腕'), true);

// ---- 陣營名稱對應 ----
f = base(); f[Z] = 'x';
eq('Saber陣營 → 衛宮組', T.resolveFactionKey_('Saber陣營', f), '衛宮組 (Saber陣營)');
eq('遠坂凜 → 遠坂組', T.resolveFactionKey_('遠坂凜', f), '遠坂組 (Archer陣營)');
eq('真Assassin → 臟硯組', T.resolveFactionKey_('真Assassin', f), Z);
eq('小次郎 → 柳洞寺組', T.resolveFactionKey_('小次郎', f), R);
eq('完整名稱', T.resolveFactionKey_(R, f), R);
eq('對不上 → 丟棄', T.resolveFactionKey_('路人甲', f), '');

// ---- 地點 ----
eq('未知地名 → null（維持原地）', T.matchFuyukiLocation_('冬木中學屋頂'), null);
eq('別名', T.matchFuyukiLocation_('前往柳洞寺').key, '柳洞寺');
eq('完整名稱', T.matchFuyukiLocation_('冬木新都・高樓商業區').key, '新都商業區');

// ---- 道具 ----
const ir = T.applyInventoryChanges_([{ id: 'mana_gem_s', name: '魔力結晶(小)', qty: 2, tier: 1, type: 'consumable' }], ['mana_gem_s', 'nope'], [], false);
eq('只回報實際扣掉的道具', ir.consumedIds, ['mana_gem_s']);
eq('數量 -1', ir.inventory[0].qty, 1);

// ---- 重要事件 ----
let ev = T.updateKeyEvents_([], ['與遠坂凜約定聯手討伐Caster'], [], '風音');
eq('新增事件', ev, ['與遠坂凜約定聯手討伐Caster']);
ev = T.updateKeyEvents_(ev, ['與遠坂凜約定聯手討伐Caster'], [], '風音');
eq('去重', ev.length, 1);
ev = T.updateKeyEvents_(ev, [], ['與遠坂凜約定聯手討伐Caster'], '風音');
eq('了結後移除', ev, []);
ev = T.updateKeyEvents_(Array.from({ length: 15 }, (_, i) => `事件${i}號紀錄`), ['新事件紀錄'], [], 'x');
eq('上限 15 條，捨棄最舊', [ev.length, ev[0], ev[14]], [15, '事件1號紀錄', '新事件紀錄']);

// ---- NovelAI 提示詞 ----
eq('角色欄去掉人數標籤', T.normalizeCharCoreForNai_('1girl, solo, black hair, golden eyes', 'girl'), 'girl, black hair, golden eyes');
eq('男性角色', T.normalizeCharCoreForNai_('1boy, short hair', 'boy'), 'boy, short hair');
eq('場景去掉人數標籤', T.stripCountTags_('2girls, solo, night, bridge'), 'night, bridge');
eq('裸體服裝格式', T.formatCharacterOutfitPrompt_('nude, completely nude, no clothes'), '1.3::nude, completely nude, bare skin::');
eq('一般服裝格式', T.formatCharacterOutfitPrompt_('red coat'), '1.15::red coat::');
const longStory = '開頭'.repeat(200) + '結尾畫面';
eq('導演摘錄保留結尾', T.excerptForDirector_(longStory).endsWith('結尾畫面'), true);
eq('導演摘錄去掉時段推進', T.excerptForDirector_('劇情。\n\n【時段推進・大源回復】xx'), '劇情。');

// ---- 其他 ----
eq('全裸後沒說穿衣 → 維持全裸', T.autoAdaptSmartOutfit_('player_master', 'nude, completely nude, no clothes', { defaultOutfit: 'dress' }, '去洗臉', '', false, '廢棄洋館'), 'nude, completely nude, no clothes');
eq('全裸後穿上衣服 → 還原預設', T.autoAdaptSmartOutfit_('player_master', 'nude, completely nude, no clothes', { defaultOutfit: 'dress' }, '穿上衣服', '', false, '廢棄洋館'), 'dress');
eq('JSON 容錯解析', T.parseJsonLoose_('```json\n{"a":1}\n```'), { a: 1 });
eq('深夜 → 隔天清晨', T.advanceTimePeriod_(1, '深夜'), { day: 2, period: '清晨' });

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
