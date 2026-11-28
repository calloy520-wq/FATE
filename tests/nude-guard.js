// 全裸把關（NudeGuard.js）的測試：這個檔案不會推上 GAS，所以另外測。
// 載入時多加 NudeGuard.js，確認有它時把關生效；tests/run-tests.js 則測沒有它（＝正式站）的行為。
// 執行：node tests/nude-guard.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = ['GameData.js', 'Lore.js', 'Code.js', 'Image.js', 'Characters.js', 'NudeGuard.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n;\n');
const ctx = { console, SpreadsheetApp: { getActiveSpreadsheet: () => ({}) } };
vm.createContext(ctx);
vm.runInContext(src + ';this.T = { sanitizeNudeOutfitForChar_, isNudeBlockedChar_, buildNaiPayloadFromScene_ };', ctx);
const T = ctx.T;
let bad = 0, ok = 0;
const eq = (name, got, want) => { const pass = JSON.stringify(got) === JSON.stringify(want); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`); pass ? ok++ : bad++; };
const NUDE = 'nude, completely nude, no clothes';
eq('裸露把關：成人模式成人角色 → 全裸', T.sanitizeNudeOutfitForChar_('scathach', NUDE, true, 'x'), NUDE);
eq('裸露把關：成人模式關閉不在把關裡處理（交給 adultOffOutfit_）', T.sanitizeNudeOutfitForChar_('scathach', NUDE, false, 'x'), NUDE);
['rin', 'sakura', 'illya', 'prisma_illya', 'miyu', 'chloe', 'shirou', 'dark_sakura'].forEach(id =>
  eq(`裸露把關：${id} 一律穿著`, T.sanitizeNudeOutfitForChar_(id, NUDE, true, 'default'), 'default'));
const pst = (adult) => ({ cameraMode: 'third', adultMode: adult, locationKey: '廢棄洋館', master: { gender: 'girl', coreTags: 'black hair' }, outfits: { scathach: NUDE, rin: NUDE, player_master: NUDE } });
let np = T.buildNaiPayloadFromScene_(pst(true), [{ id: 'scathach' }, { id: 'rin' }], 'bathroom, steam', false, '泡澡', '', 1);
eq('繪圖：斯卡哈全裸', /nude/.test(np.characters.find(c => c.id === 'scathach').prompt), true);
eq('繪圖：凜不畫裸', /nude/.test(np.characters.find(c => c.id === 'rin').prompt), false);
np = T.buildNaiPayloadFromScene_(pst(true), [{ id: 'rin' }], 'bathroom', false, '泡澡', '', 1);
eq('繪圖：只有凜時沒有 nsfw', /nsfw/.test(np.prompt), false);
console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
