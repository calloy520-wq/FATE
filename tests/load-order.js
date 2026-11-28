// 載入順序測試：GAS 的所有 .js 檔共用同一個全域空間，但各檔案的執行順序不一定照我們想的。
// 每個檔案頂層只能放函式與「不引用其他檔案」的常數；這裡用多種順序分別載入，任何一種在載入時出錯就失敗。
// 執行：node tests/load-order.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const FILES = ['GameData.js', 'Lore.js', 'Code.js', 'Image.js', 'Characters.js', 'SetupDB.js'];
const src = Object.fromEntries(FILES.map(f => [f, fs.readFileSync(path.join(__dirname, '..', f), 'utf8')]));
const orders = [FILES.slice(), FILES.slice().reverse()];
FILES.forEach(f => orders.push([f].concat(FILES.filter(x => x !== f))));
FILES.forEach(f => orders.push(FILES.filter(x => x !== f).concat([f])));
// NudeGuard.js 不會推上 GAS，但有它時也要不管放哪都能載入
orders.push(['NudeGuard.js'].concat(FILES), FILES.concat(['NudeGuard.js']), FILES.slice().reverse().concat(['NudeGuard.js']));
src['NudeGuard.js'] = fs.readFileSync(path.join(__dirname, '..', 'NudeGuard.js'), 'utf8');
let fails = 0;
orders.forEach(order => {
  const ctx = { console };
  vm.createContext(ctx);
  try {
    order.forEach(f => vm.runInContext(src[f], ctx, { filename: f }));
    // 跨檔呼叫：角色資料（GameData＋Characters）、繪圖（Image）、主程式（Code）
    vm.runInContext("if (!getCharAppearanceMap_(null).scathach) throw new Error('角色資料讀不到'); normalizeCharCoreForNai_('girl, pink hair', 'girl'); sanitizeSandboxChar_({ name: '測', core: 'girl' }, 'sbc_1'); isAloneAction_('一個人');", ctx);
  } catch (e) {
    fails++;
    console.log(`FAIL 順序 ${order.join(' → ')}：${e.message}`);
  }
});
console.log(fails === 0 ? `全部通過（${orders.length} 種載入順序）` : `${fails} 種順序失敗`);
process.exit(fails ? 1 : 0);
